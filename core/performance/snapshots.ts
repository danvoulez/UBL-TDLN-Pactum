/**
 * PERFORMANCE - Snapshots & Projections
 * 
 * Problem: Replaying 100,000 events to get current state is slow.
 * Solution: SNAPSHOTS - periodically save the computed state.
 * 
 * Snapshots are:
 * - Derived data (always rebuildable from events)
 * - Optimization (not source of truth)
 * - Versioned (invalidated when rehydrator changes)
 */

import type { EntityId, Timestamp, AggregateType, Hash } from '../shared/types';
import type { Event, SequenceNumber } from '../schema/ledger';

// ============================================================================
// SNAPSHOTS
// ============================================================================

/**
 * A Snapshot captures aggregate state at a point in time.
 */
export interface Snapshot<TState = unknown> {
  /** The aggregate this snapshot is for */
  readonly aggregateType: AggregateType;
  readonly aggregateId: EntityId;
  
  /** The state at this point */
  readonly state: TState;
  
  /** Version info */
  readonly version: number; // Aggregate version (event count)
  readonly sequence: SequenceNumber; // Global sequence at snapshot time
  readonly timestamp: Timestamp;
  
  /** Rehydrator version (invalidates snapshot if changed) */
  readonly rehydratorVersion: number;
  
  /** Integrity */
  readonly stateHash: Hash; // Hash of state for verification
}

/**
 * Snapshot store persists and retrieves snapshots.
 */
export interface SnapshotStore {
  /** Save a snapshot */
  save<TState>(snapshot: Snapshot<TState>): Promise<void>;
  
  /** Get latest snapshot for an aggregate */
  getLatest<TState>(
    aggregateType: AggregateType,
    aggregateId: EntityId
  ): Promise<Snapshot<TState> | null>;
  
  /** Get snapshot at or before a specific version */
  getAtVersion<TState>(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    version: number
  ): Promise<Snapshot<TState> | null>;
  
  /** Delete snapshots (when rehydrator changes) */
  invalidate(aggregateType: AggregateType, aggregateId?: EntityId): Promise<number>;
  
  /** Delete old snapshots (keep only N most recent) */
  prune(aggregateType: AggregateType, keepCount: number): Promise<number>;
}

/**
 * Snapshot policy determines when to create snapshots.
 */
export interface SnapshotPolicy {
  /** Create snapshot every N events */
  readonly everyNEvents?: number;
  
  /** Create snapshot every N seconds */
  readonly everyNSeconds?: number;
  
  /** Create snapshot when state size exceeds N bytes */
  readonly whenStateSizeExceeds?: number;
  
  /** Minimum events before first snapshot */
  readonly minimumEvents?: number;
  
  /** Custom predicate */
  shouldSnapshot?(aggregate: unknown, eventCount: number, lastSnapshot?: Snapshot): boolean;
}

export const DEFAULT_SNAPSHOT_POLICY: SnapshotPolicy = {
  everyNEvents: 100,
  minimumEvents: 50,
};

/**
 * Snapshot-aware aggregate loader.
 */
export interface SnapshotLoader {
  /**
   * Load aggregate state, using snapshot if available.
   * 
   * Process:
   * 1. Try to load latest valid snapshot
   * 2. If found, replay only events after snapshot
   * 3. If not found, replay all events
   * 4. Optionally create new snapshot
   */
  load<TState>(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    options?: LoadOptions
  ): Promise<LoadResult<TState>>;
}

export interface LoadOptions {
  /** Ignore snapshots, replay from scratch */
  readonly ignoreSnapshots?: boolean;
  
  /** Create snapshot after loading if policy says so */
  readonly createSnapshot?: boolean;
  
  /** Load at specific version (for temporal queries) */
  readonly atVersion?: number;
  
  /** Load at specific time */
  readonly atTimestamp?: Timestamp;
}

export interface LoadResult<TState> {
  readonly state: TState;
  readonly version: number;
  readonly fromSnapshot: boolean;
  readonly eventsReplayed: number;
  readonly loadTime: number;
}

// ============================================================================
// PROJECTIONS (Read Models)
// ============================================================================

/**
 * A Projection builds a read-optimized view from events.
 * 
 * Unlike snapshots (per-aggregate), projections can:
 * - Span multiple aggregates
 * - Denormalize data
 * - Create indexes
 * - Support complex queries
 */
export interface Projection<TView = unknown> {
  readonly name: string;
  readonly version: number;
  
  /** Which event types does this projection care about? */
  readonly subscribesTo: readonly string[];
  
  /** Initialize/reset the projection */
  initialize(): Promise<void>;
  
  /** Handle an event */
  handle(event: Event): Promise<void>;
  
  /** Handle a batch of events (for performance) */
  handleBatch?(events: readonly Event[]): Promise<void>;
  
  /** Query the projection */
  query<TResult>(query: ProjectionQuery): Promise<TResult>;
  
  /** Get the last processed sequence */
  getCheckpoint(): Promise<SequenceNumber>;
  
  /** Set checkpoint (for resuming) */
  setCheckpoint(sequence: SequenceNumber): Promise<void>;
}

export interface ProjectionQuery {
  readonly type: string;
  readonly params: Record<string, unknown>;
}

/**
 * Projection manager handles multiple projections.
 */
export interface ProjectionManager {
  /** Register a projection */
  register(projection: Projection): void;
  
  /** Start processing events for all projections */
  start(): Promise<void>;
  
  /** Stop processing */
  stop(): Promise<void>;
  
  /** Rebuild a projection from scratch */
  rebuild(projectionName: string): Promise<RebuildResult>;
  
  /** Get projection status */
  getStatus(projectionName: string): Promise<ProjectionStatus>;
  
  /** Get all projection statuses */
  getAllStatuses(): Promise<readonly ProjectionStatus[]>;
}

export interface ProjectionStatus {
  readonly name: string;
  readonly version: number;
  readonly checkpoint: SequenceNumber;
  readonly lag: number; // Events behind current
  readonly state: 'running' | 'stopped' | 'rebuilding' | 'error';
  readonly lastError?: string;
  readonly lastProcessedAt?: Timestamp;
}

export interface RebuildResult {
  readonly projection: string;
  readonly eventsProcessed: number;
  readonly duration: number;
  readonly success: boolean;
  readonly error?: string;
}

// ============================================================================
// CACHING
// ============================================================================

/**
 * Cache for frequently accessed aggregates.
 */
export interface AggregateCache {
  /** Get from cache */
  get<TState>(aggregateType: AggregateType, aggregateId: EntityId): TState | null;
  
  /** Put in cache */
  put<TState>(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    state: TState,
    version: number
  ): void;
  
  /** Invalidate (on new event) */
  invalidate(aggregateType: AggregateType, aggregateId: EntityId): void;
  
  /** Invalidate all of a type */
  invalidateAll(aggregateType: AggregateType): void;
  
  /** Get cache stats */
  getStats(): CacheStats;
}

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
  readonly maxSize: number;
  readonly evictions: number;
}

/**
 * Cache policy determines what to cache.
 */
export interface CachePolicy {
  /** Maximum entries per aggregate type */
  readonly maxEntriesPerType?: number;
  
  /** Maximum total entries */
  readonly maxTotalEntries?: number;
  
  /** TTL in milliseconds */
  readonly ttlMs?: number;
  
  /** Eviction strategy */
  readonly eviction: 'lru' | 'lfu' | 'fifo';
  
  /** Which aggregate types to cache */
  readonly aggregateTypes?: readonly AggregateType[];
}

// ============================================================================
// EXAMPLE PROJECTIONS
// ============================================================================

/**
 * Example: Active Agreements by Party
 * 
 * This projection maintains a denormalized view of:
 * - Which agreements each party is involved in
 * - Agreement status
 * - Quick lookup by party
 */
export const EXAMPLE_PROJECTION_ACTIVE_AGREEMENTS = {
  name: 'active-agreements-by-party',
  version: 1,
  subscribesTo: ['AgreementCreated', 'AgreementStatusChanged', 'ConsentRecorded'],
  
  // Schema for the projection's storage
  schema: {
    // Indexed by partyId
    // partyId → [{ agreementId, agreementType, role, status }]
  },
  
  queries: {
    // Get all active agreements for a party
    byParty: { type: 'byParty', params: { partyId: 'string' } },
    
    // Get all parties in an agreement
    byAgreement: { type: 'byAgreement', params: { agreementId: 'string' } },
    
    // Count active agreements by type
    countByType: { type: 'countByType', params: { partyId: 'string' } },
  },
};

/**
 * Example: Daily Transaction Summary
 * 
 * Aggregates transaction data by day for reporting.
 */
export const EXAMPLE_PROJECTION_DAILY_SUMMARY = {
  name: 'daily-transaction-summary',
  version: 1,
  subscribesTo: ['AssetTransferred', 'AgreementCreated', 'ObligationFulfilled'],
  
  // Schema: date → { transfers, agreements, fulfillments, totalValue }
  
  queries: {
    byDate: { type: 'byDate', params: { date: 'string' } },
    byDateRange: { type: 'byDateRange', params: { from: 'string', to: 'string' } },
    trending: { type: 'trending', params: { days: 'number' } },
  },
};

