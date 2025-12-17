/**
 * TEMPORAL SNAPSHOTS
 * 
 * FASE 3.1: Snapshot system for aggregate state
 * 
 * Purpose:
 * - Avoid replaying thousands of events to reconstruct state
 * - Snapshot every N events or every T hours
 * - Enable point-in-time queries
 * 
 * Strategy:
 * - Store serialized aggregate state at specific sequence numbers
 * - On rehydration: load snapshot + replay events since snapshot
 * - Automatic cleanup of old snapshots
 */

import type { EntityId, Timestamp } from '../shared/types';
import type { AggregateType, SequenceNumber } from '../schema/ledger';

// =============================================================================
// TYPES
// =============================================================================

export interface Snapshot<TState = unknown> {
  readonly id: string;
  readonly aggregateType: AggregateType;
  readonly aggregateId: EntityId;
  readonly version: number;
  readonly sequenceNumber: SequenceNumber;
  readonly state: TState;
  readonly createdAt: Timestamp;
  readonly hash: string;
}

export interface SnapshotConfig {
  /** Create snapshot every N events */
  readonly eventsThreshold: number;
  
  /** Create snapshot every N milliseconds */
  readonly timeThresholdMs: number;
  
  /** Maximum snapshots to keep per aggregate */
  readonly maxSnapshotsPerAggregate: number;
  
  /** Aggregate types to snapshot */
  readonly aggregateTypes: readonly AggregateType[];
}

export interface SnapshotStore {
  /** Save a snapshot */
  save<TState>(snapshot: Snapshot<TState>): Promise<void>;
  
  /** Get the latest snapshot for an aggregate */
  getLatest<TState>(
    aggregateType: AggregateType,
    aggregateId: EntityId
  ): Promise<Snapshot<TState> | null>;
  
  /** Get snapshot at or before a specific sequence */
  getAtSequence<TState>(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    maxSequence: SequenceNumber
  ): Promise<Snapshot<TState> | null>;
  
  /** Get snapshot at or before a specific time */
  getAtTime<TState>(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    maxTimestamp: Timestamp
  ): Promise<Snapshot<TState> | null>;
  
  /** Delete old snapshots beyond retention limit */
  cleanup(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    keepCount: number
  ): Promise<number>;
  
  /** Get stats */
  getStats(): Promise<SnapshotStoreStats>;
}

export interface SnapshotStoreStats {
  readonly totalSnapshots: number;
  readonly totalSize: number;
  readonly oldestSnapshot: Timestamp | null;
  readonly newestSnapshot: Timestamp | null;
}

// =============================================================================
// IN-MEMORY SNAPSHOT STORE
// =============================================================================

export class InMemorySnapshotStore implements SnapshotStore {
  private snapshots = new Map<string, Snapshot[]>();
  
  private makeKey(aggregateType: AggregateType, aggregateId: EntityId): string {
    return `${aggregateType}:${aggregateId}`;
  }
  
  async save<TState>(snapshot: Snapshot<TState>): Promise<void> {
    const key = this.makeKey(snapshot.aggregateType, snapshot.aggregateId);
    
    if (!this.snapshots.has(key)) {
      this.snapshots.set(key, []);
    }
    
    this.snapshots.get(key)!.push(snapshot as Snapshot);
    
    // Sort by sequence number (newest first)
    this.snapshots.get(key)!.sort((a, b) => 
      Number(b.sequenceNumber) - Number(a.sequenceNumber)
    );
  }
  
  async getLatest<TState>(
    aggregateType: AggregateType,
    aggregateId: EntityId
  ): Promise<Snapshot<TState> | null> {
    const key = this.makeKey(aggregateType, aggregateId);
    const snapshots = this.snapshots.get(key);
    
    if (!snapshots || snapshots.length === 0) {
      return null;
    }
    
    return snapshots[0] as Snapshot<TState>;
  }
  
  async getAtSequence<TState>(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    maxSequence: SequenceNumber
  ): Promise<Snapshot<TState> | null> {
    const key = this.makeKey(aggregateType, aggregateId);
    const snapshots = this.snapshots.get(key);
    
    if (!snapshots || snapshots.length === 0) {
      return null;
    }
    
    // Find first snapshot at or before maxSequence
    const snapshot = snapshots.find(s => s.sequenceNumber <= maxSequence);
    return snapshot as Snapshot<TState> | null;
  }
  
  async getAtTime<TState>(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    maxTimestamp: Timestamp
  ): Promise<Snapshot<TState> | null> {
    const key = this.makeKey(aggregateType, aggregateId);
    const snapshots = this.snapshots.get(key);
    
    if (!snapshots || snapshots.length === 0) {
      return null;
    }
    
    // Find first snapshot at or before maxTimestamp
    const snapshot = snapshots.find(s => s.createdAt <= maxTimestamp);
    return snapshot as Snapshot<TState> | null;
  }
  
  async cleanup(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    keepCount: number
  ): Promise<number> {
    const key = this.makeKey(aggregateType, aggregateId);
    const snapshots = this.snapshots.get(key);
    
    if (!snapshots || snapshots.length <= keepCount) {
      return 0;
    }
    
    const toRemove = snapshots.length - keepCount;
    this.snapshots.set(key, snapshots.slice(0, keepCount));
    
    return toRemove;
  }
  
  async getStats(): Promise<SnapshotStoreStats> {
    let totalSnapshots = 0;
    let totalSize = 0;
    let oldestSnapshot: Timestamp | null = null;
    let newestSnapshot: Timestamp | null = null;
    
    for (const snapshots of this.snapshots.values()) {
      totalSnapshots += snapshots.length;
      
      for (const snapshot of snapshots) {
        totalSize += JSON.stringify(snapshot.state).length;
        
        if (!oldestSnapshot || snapshot.createdAt < oldestSnapshot) {
          oldestSnapshot = snapshot.createdAt;
        }
        if (!newestSnapshot || snapshot.createdAt > newestSnapshot) {
          newestSnapshot = snapshot.createdAt;
        }
      }
    }
    
    return { totalSnapshots, totalSize, oldestSnapshot, newestSnapshot };
  }
}

// =============================================================================
// SNAPSHOT MANAGER
// =============================================================================

export class SnapshotManager {
  private lastSnapshotTime = new Map<string, Timestamp>();
  private eventsSinceSnapshot = new Map<string, number>();
  
  constructor(
    private readonly store: SnapshotStore,
    private readonly config: SnapshotConfig
  ) {}
  
  /**
   * Check if a snapshot should be created for an aggregate
   */
  shouldSnapshot(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    currentVersion: number
  ): boolean {
    // Check if aggregate type is configured for snapshots
    if (!this.config.aggregateTypes.includes(aggregateType)) {
      return false;
    }
    
    const key = `${aggregateType}:${aggregateId}`;
    
    // Check events threshold
    const eventCount = this.eventsSinceSnapshot.get(key) ?? 0;
    if (eventCount >= this.config.eventsThreshold) {
      return true;
    }
    
    // Check time threshold (only if we have a previous snapshot)
    const lastTime = this.lastSnapshotTime.get(key);
    if (lastTime !== undefined && Date.now() - lastTime >= this.config.timeThresholdMs) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Record that an event was applied to an aggregate
   */
  recordEvent(aggregateType: AggregateType, aggregateId: EntityId): void {
    const key = `${aggregateType}:${aggregateId}`;
    const current = this.eventsSinceSnapshot.get(key) ?? 0;
    this.eventsSinceSnapshot.set(key, current + 1);
  }
  
  /**
   * Create a snapshot
   */
  async createSnapshot<TState>(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    version: number,
    sequenceNumber: SequenceNumber,
    state: TState
  ): Promise<Snapshot<TState>> {
    const snapshot: Snapshot<TState> = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      aggregateType,
      aggregateId,
      version,
      sequenceNumber,
      state,
      createdAt: Date.now(),
      hash: this.computeHash(state),
    };
    
    await this.store.save(snapshot);
    
    // Reset counters
    const key = `${aggregateType}:${aggregateId}`;
    this.lastSnapshotTime.set(key, Date.now());
    this.eventsSinceSnapshot.set(key, 0);
    
    // Cleanup old snapshots
    await this.store.cleanup(
      aggregateType,
      aggregateId,
      this.config.maxSnapshotsPerAggregate
    );
    
    return snapshot;
  }
  
  /**
   * Get the latest snapshot for rehydration
   */
  async getLatestSnapshot<TState>(
    aggregateType: AggregateType,
    aggregateId: EntityId
  ): Promise<Snapshot<TState> | null> {
    return this.store.getLatest(aggregateType, aggregateId);
  }
  
  /**
   * Get snapshot for point-in-time query
   */
  async getSnapshotAtTime<TState>(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    timestamp: Timestamp
  ): Promise<Snapshot<TState> | null> {
    return this.store.getAtTime(aggregateType, aggregateId, timestamp);
  }
  
  private computeHash(state: unknown): string {
    // Custom replacer to handle BigInt
    const json = JSON.stringify(state, (_, value) =>
      typeof value === 'bigint' ? value.toString() + 'n' : value
    );
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      const char = json.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createSnapshotStore(): SnapshotStore {
  return new InMemorySnapshotStore();
}

export function createSnapshotManager(
  store?: SnapshotStore,
  config?: Partial<SnapshotConfig>
): SnapshotManager {
  const defaultConfig: SnapshotConfig = {
    eventsThreshold: 1000,
    timeThresholdMs: 24 * 60 * 60 * 1000, // 24 hours
    maxSnapshotsPerAggregate: 5,
    aggregateTypes: ['Wallet', 'Entity', 'Agreement', 'Workspace'] as AggregateType[],
  };
  
  return new SnapshotManager(
    store ?? createSnapshotStore(),
    { ...defaultConfig, ...config }
  );
}
