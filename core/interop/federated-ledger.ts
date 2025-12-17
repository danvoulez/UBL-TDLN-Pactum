/**
 * FEDERATED LEDGER
 * 
 * SPRINT E.2: Multi-realm ledger synchronization
 * 
 * Purpose:
 * - Synchronize events across realms
 * - Maintain consistency with eventual convergence
 * - Support cross-realm queries
 * - Handle network partitions gracefully
 * 
 * Architecture:
 * - Each realm maintains its own ledger
 * - Events are replicated to trusted realms
 * - Conflict resolution via vector clocks
 * - Merkle trees for efficient sync
 */

import type { EntityId, Timestamp } from '../shared/types';
import type { Event } from '../schema/ledger';

// =============================================================================
// TYPES
// =============================================================================

export interface FederatedLedgerConfig {
  /** This realm's ID */
  readonly realmId: EntityId;
  
  /** Sync interval (ms) */
  readonly syncIntervalMs: number;
  
  /** Maximum events per sync batch */
  readonly maxBatchSize: number;
  
  /** Conflict resolution strategy */
  readonly conflictStrategy: ConflictStrategy;
  
  /** Event retention period (ms) */
  readonly retentionPeriodMs: number;
}

export type ConflictStrategy = 
  | 'LastWriteWins'     // Latest timestamp wins
  | 'FirstWriteWins'    // Earliest timestamp wins
  | 'SourcePriority'    // Source realm has priority
  | 'Manual';           // Requires manual resolution

export interface RealmState {
  readonly realmId: EntityId;
  readonly vectorClock: VectorClock;
  readonly lastSyncAt: Timestamp;
  readonly eventCount: number;
  readonly merkleRoot: string;
  readonly status: RealmSyncStatus;
}

export type RealmSyncStatus = 
  | 'InSync'
  | 'Syncing'
  | 'Behind'
  | 'Ahead'
  | 'Diverged'
  | 'Unreachable';

export interface VectorClock {
  readonly clocks: Map<EntityId, number>;
}

export interface SyncRequest {
  readonly id: string;
  readonly sourceRealm: EntityId;
  readonly targetRealm: EntityId;
  readonly fromVersion: VectorClock;
  readonly requestedAt: Timestamp;
}

export interface SyncResponse {
  readonly requestId: string;
  readonly events: readonly FederatedEvent[];
  readonly newVersion: VectorClock;
  readonly hasMore: boolean;
  readonly merkleRoot: string;
}

export interface FederatedEvent {
  readonly event: Event;
  readonly sourceRealm: EntityId;
  readonly federatedAt: Timestamp;
  readonly vectorClock: VectorClock;
  readonly signature: string;
}

export interface ConflictRecord {
  readonly id: string;
  readonly localEvent: FederatedEvent;
  readonly remoteEvent: FederatedEvent;
  readonly detectedAt: Timestamp;
  readonly resolution?: ConflictResolution;
}

export interface ConflictResolution {
  readonly strategy: ConflictStrategy;
  readonly winner: 'Local' | 'Remote' | 'Merged';
  readonly resolvedAt: Timestamp;
  readonly resolvedBy?: EntityId;
  readonly mergedEvent?: FederatedEvent;
}

// =============================================================================
// FEDERATED LEDGER
// =============================================================================

export class FederatedLedger {
  private localEvents: FederatedEvent[] = [];
  private realmStates = new Map<EntityId, RealmState>();
  private conflicts: ConflictRecord[] = [];
  private vectorClock: VectorClock;
  private idCounter = 0;
  
  constructor(private readonly config: FederatedLedgerConfig) {
    this.vectorClock = { clocks: new Map([[config.realmId, 0]]) };
    
    // Initialize own realm state
    this.realmStates.set(config.realmId, {
      realmId: config.realmId,
      vectorClock: this.vectorClock,
      lastSyncAt: Date.now(),
      eventCount: 0,
      merkleRoot: this.computeMerkleRoot([]),
      status: 'InSync',
    });
  }
  
  // ---------------------------------------------------------------------------
  // LOCAL OPERATIONS
  // ---------------------------------------------------------------------------
  
  /**
   * Append a local event
   */
  appendLocal(event: Event): FederatedEvent {
    // Increment vector clock
    const currentClock = this.vectorClock.clocks.get(this.config.realmId) ?? 0;
    const newClocks = new Map(this.vectorClock.clocks);
    newClocks.set(this.config.realmId, currentClock + 1);
    this.vectorClock = { clocks: newClocks };
    
    const federatedEvent: FederatedEvent = {
      event,
      sourceRealm: this.config.realmId,
      federatedAt: Date.now(),
      vectorClock: this.vectorClock,
      signature: this.sign(event),
    };
    
    this.localEvents.push(federatedEvent);
    this.updateLocalState();
    
    return federatedEvent;
  }
  
  /**
   * Get local events since a vector clock
   */
  getEventsSince(fromClock: VectorClock): readonly FederatedEvent[] {
    return this.localEvents.filter(e => 
      this.isAfter(e.vectorClock, fromClock)
    );
  }
  
  // ---------------------------------------------------------------------------
  // SYNC OPERATIONS
  // ---------------------------------------------------------------------------
  
  /**
   * Create a sync request for a remote realm
   */
  createSyncRequest(targetRealm: EntityId): SyncRequest {
    const remoteState = this.realmStates.get(targetRealm);
    
    return {
      id: `sync-${++this.idCounter}`,
      sourceRealm: this.config.realmId,
      targetRealm,
      fromVersion: remoteState?.vectorClock ?? { clocks: new Map() },
      requestedAt: Date.now(),
    };
  }
  
  /**
   * Process a sync request from another realm
   */
  processSyncRequest(request: SyncRequest): SyncResponse {
    const events = this.getEventsSince(request.fromVersion)
      .slice(0, this.config.maxBatchSize);
    
    return {
      requestId: request.id,
      events,
      newVersion: this.vectorClock,
      hasMore: events.length === this.config.maxBatchSize,
      merkleRoot: this.computeMerkleRoot(this.localEvents),
    };
  }
  
  /**
   * Apply events from a sync response
   */
  applySyncResponse(response: SyncResponse, sourceRealm: EntityId): {
    applied: number;
    conflicts: number;
  } {
    let applied = 0;
    let conflictCount = 0;
    
    for (const remoteEvent of response.events) {
      const conflict = this.detectConflict(remoteEvent);
      
      if (conflict) {
        this.conflicts.push(conflict);
        conflictCount++;
        
        // Auto-resolve if strategy allows
        if (this.config.conflictStrategy !== 'Manual') {
          this.resolveConflict(conflict.id);
          applied++;
        }
      } else {
        this.applyRemoteEvent(remoteEvent);
        applied++;
      }
    }
    
    // Update realm state
    this.realmStates.set(sourceRealm, {
      realmId: sourceRealm,
      vectorClock: response.newVersion,
      lastSyncAt: Date.now(),
      eventCount: response.events.length,
      merkleRoot: response.merkleRoot,
      status: response.hasMore ? 'Behind' : 'InSync',
    });
    
    // Merge vector clocks
    this.mergeVectorClock(response.newVersion);
    
    return { applied, conflicts: conflictCount };
  }
  
  /**
   * Apply a remote event
   */
  private applyRemoteEvent(event: FederatedEvent): void {
    // Check if already applied (idempotency)
    const exists = this.localEvents.some(e => 
      e.event.id === event.event.id && e.sourceRealm === event.sourceRealm
    );
    
    if (!exists) {
      this.localEvents.push(event);
      this.updateLocalState();
    }
  }
  
  // ---------------------------------------------------------------------------
  // CONFLICT HANDLING
  // ---------------------------------------------------------------------------
  
  /**
   * Detect if an event conflicts with local state
   */
  private detectConflict(remoteEvent: FederatedEvent): ConflictRecord | null {
    // Find concurrent events (neither happened-before the other)
    const concurrent = this.localEvents.find(local => 
      local.event.aggregateId === remoteEvent.event.aggregateId &&
      !this.happensBefore(local.vectorClock, remoteEvent.vectorClock) &&
      !this.happensBefore(remoteEvent.vectorClock, local.vectorClock)
    );
    
    if (concurrent) {
      return {
        id: `conflict-${++this.idCounter}`,
        localEvent: concurrent,
        remoteEvent,
        detectedAt: Date.now(),
      };
    }
    
    return null;
  }
  
  /**
   * Resolve a conflict
   */
  resolveConflict(conflictId: string, manualWinner?: 'Local' | 'Remote'): ConflictResolution {
    const conflict = this.conflicts.find(c => c.id === conflictId);
    if (!conflict) throw new Error(`Conflict not found: ${conflictId}`);
    if (conflict.resolution) throw new Error(`Conflict already resolved: ${conflictId}`);
    
    let winner: 'Local' | 'Remote';
    
    if (manualWinner) {
      winner = manualWinner;
    } else {
      switch (this.config.conflictStrategy) {
        case 'LastWriteWins':
          winner = conflict.localEvent.federatedAt > conflict.remoteEvent.federatedAt 
            ? 'Local' : 'Remote';
          break;
        case 'FirstWriteWins':
          winner = conflict.localEvent.federatedAt < conflict.remoteEvent.federatedAt 
            ? 'Local' : 'Remote';
          break;
        case 'SourcePriority':
          winner = 'Local';
          break;
        default:
          throw new Error('Manual resolution required');
      }
    }
    
    const resolution: ConflictResolution = {
      strategy: this.config.conflictStrategy,
      winner,
      resolvedAt: Date.now(),
    };
    
    // Update conflict record
    const index = this.conflicts.findIndex(c => c.id === conflictId);
    this.conflicts[index] = { ...conflict, resolution };
    
    // Apply winner if remote
    if (winner === 'Remote') {
      this.applyRemoteEvent(conflict.remoteEvent);
    }
    
    return resolution;
  }
  
  /**
   * Get unresolved conflicts
   */
  getUnresolvedConflicts(): readonly ConflictRecord[] {
    return this.conflicts.filter(c => !c.resolution);
  }
  
  // ---------------------------------------------------------------------------
  // VECTOR CLOCK OPERATIONS
  // ---------------------------------------------------------------------------
  
  /**
   * Check if clock A happens before clock B
   */
  private happensBefore(a: VectorClock, b: VectorClock): boolean {
    let atLeastOneLess = false;
    
    for (const [realm, clockA] of a.clocks) {
      const clockB = b.clocks.get(realm) ?? 0;
      if (clockA > clockB) return false;
      if (clockA < clockB) atLeastOneLess = true;
    }
    
    // Check realms in B not in A
    for (const [realm, clockB] of b.clocks) {
      if (!a.clocks.has(realm) && clockB > 0) {
        atLeastOneLess = true;
      }
    }
    
    return atLeastOneLess;
  }
  
  /**
   * Check if clock A is after clock B
   */
  private isAfter(a: VectorClock, b: VectorClock): boolean {
    for (const [realm, clockA] of a.clocks) {
      const clockB = b.clocks.get(realm) ?? 0;
      if (clockA > clockB) return true;
    }
    return false;
  }
  
  /**
   * Merge a remote vector clock into local
   */
  private mergeVectorClock(remote: VectorClock): void {
    const merged = new Map(this.vectorClock.clocks);
    
    for (const [realm, clock] of remote.clocks) {
      const local = merged.get(realm) ?? 0;
      merged.set(realm, Math.max(local, clock));
    }
    
    this.vectorClock = { clocks: merged };
  }
  
  // ---------------------------------------------------------------------------
  // MERKLE TREE
  // ---------------------------------------------------------------------------
  
  /**
   * Compute Merkle root for events
   */
  private computeMerkleRoot(events: readonly FederatedEvent[]): string {
    if (events.length === 0) return 'empty';
    
    const hashes = events.map(e => this.hash(JSON.stringify(e.event)));
    return this.buildMerkleTree(hashes);
  }
  
  private buildMerkleTree(hashes: string[]): string {
    if (hashes.length === 0) return 'empty';
    if (hashes.length === 1) return hashes[0];
    
    const nextLevel: string[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] ?? left;
      nextLevel.push(this.hash(left + right));
    }
    
    return this.buildMerkleTree(nextLevel);
  }
  
  // ---------------------------------------------------------------------------
  // UTILITIES
  // ---------------------------------------------------------------------------
  
  private hash(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
  
  private sign(event: Event): string {
    return `sig-${this.hash(JSON.stringify(event))}-${this.config.realmId}`;
  }
  
  private updateLocalState(): void {
    this.realmStates.set(this.config.realmId, {
      realmId: this.config.realmId,
      vectorClock: this.vectorClock,
      lastSyncAt: Date.now(),
      eventCount: this.localEvents.length,
      merkleRoot: this.computeMerkleRoot(this.localEvents),
      status: 'InSync',
    });
  }
  
  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------
  
  /**
   * Get current vector clock
   */
  getVectorClock(): VectorClock {
    return this.vectorClock;
  }
  
  /**
   * Get realm state
   */
  getRealmState(realmId: EntityId): RealmState | undefined {
    return this.realmStates.get(realmId);
  }
  
  /**
   * Get all realm states
   */
  getAllRealmStates(): readonly RealmState[] {
    return Array.from(this.realmStates.values());
  }
  
  /**
   * Get all events
   */
  getAllEvents(): readonly FederatedEvent[] {
    return this.localEvents;
  }
  
  /**
   * Get statistics
   */
  getStats(): FederatedLedgerStats {
    return {
      localEvents: this.localEvents.filter(e => e.sourceRealm === this.config.realmId).length,
      remoteEvents: this.localEvents.filter(e => e.sourceRealm !== this.config.realmId).length,
      totalEvents: this.localEvents.length,
      knownRealms: this.realmStates.size,
      unresolvedConflicts: this.getUnresolvedConflicts().length,
      merkleRoot: this.computeMerkleRoot(this.localEvents),
    };
  }
}

export interface FederatedLedgerStats {
  localEvents: number;
  remoteEvents: number;
  totalEvents: number;
  knownRealms: number;
  unresolvedConflicts: number;
  merkleRoot: string;
}

// =============================================================================
// FACTORY
// =============================================================================

export function createFederatedLedger(config?: Partial<FederatedLedgerConfig>): FederatedLedger {
  const defaultConfig: FederatedLedgerConfig = {
    realmId: 'default-realm' as EntityId,
    syncIntervalMs: 60000, // 1 minute
    maxBatchSize: 1000,
    conflictStrategy: 'LastWriteWins',
    retentionPeriodMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  };
  
  return new FederatedLedger({ ...defaultConfig, ...config });
}
