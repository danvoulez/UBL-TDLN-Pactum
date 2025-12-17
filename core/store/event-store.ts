/**
 * EVENT STORE - The Append-Only Ledger
 * 
 * This is the physical manifestation of immutability.
 * Events can only be appended, never modified or deleted.
 * The store enforces this at the structural level.
 */

import type {
  Event,
  EntityId,
  Hash,
  SequenceNumber,
  Timestamp,
  AggregateType,
} from '../schema/ledger';

import {
  createHashChain,
  createTemporalEnforcer,
  type ChainVerificationResult,
} from '../enforcement/invariants';

// ============================================================================
// EVENT STORE INTERFACE
// ============================================================================

export interface EventStore {
  /**
   * Name of the event store implementation
   */
  readonly name?: string;
  
  /**
   * Get PostgreSQL pool (only available for PostgreSQL EventStore)
   */
  getPool?: () => any;
  
  /**
   * Health check for the event store
   */
  healthCheck?(): Promise<{ healthy: boolean; latencyMs?: number; message?: string }>;
  
  /**
   * Append a new event to the store.
   * This is the ONLY write operation - no updates, no deletes.
   */
  append<T>(eventData: EventInput<T>): Promise<Event<T>>;
  
  /**
   * Read events by aggregate
   */
  getByAggregate(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    options?: ReadOptions
  ): AsyncIterable<Event>;
  
  /**
   * Read events by sequence range
   */
  getBySequence(
    from: SequenceNumber,
    to?: SequenceNumber
  ): AsyncIterable<Event>;
  
  /**
   * Get a single event by ID
   */
  getById(eventId: EntityId): Promise<Event | null>;
  
  /**
   * Get the latest event for an aggregate
   */
  getLatest(
    aggregateType: AggregateType,
    aggregateId: EntityId
  ): Promise<Event | null>;
  
  /**
   * Get current sequence number
   */
  getCurrentSequence(): Promise<SequenceNumber>;
  
  /**
   * Subscribe to new events
   */
  subscribe(filter?: EventFilter): AsyncIterable<Event>;
  
  /**
   * Verify chain integrity
   */
  verifyIntegrity(
    from?: SequenceNumber,
    to?: SequenceNumber
  ): Promise<ChainVerificationResult>;
  
  /**
   * Query events with flexible filtering (FASE 2.1)
   * Supports filtering by multiple criteria simultaneously
   */
  query(criteria: QueryCriteria): Promise<QueryResult>;
  
  /**
   * Get the next version for an aggregate (proper versioning)
   */
  getNextVersion(
    aggregateType: AggregateType,
    aggregateId: EntityId
  ): Promise<number>;
}

export interface EventInput<T = unknown> {
  readonly type: string;
  readonly aggregateId: EntityId;
  readonly aggregateType: AggregateType;
  readonly aggregateVersion: number;
  readonly payload: T;
  readonly causation?: {
    readonly commandId?: EntityId;
    readonly correlationId?: EntityId;
    readonly workflowId?: EntityId;
  };
  readonly actor: Event['actor'];
  readonly timestamp?: Timestamp;
}

export interface ReadOptions {
  readonly fromVersion?: number;
  readonly toVersion?: number;
  readonly fromTimestamp?: Timestamp;
  readonly toTimestamp?: Timestamp;
  readonly limit?: number;
}

export interface EventFilter {
  readonly aggregateTypes?: readonly AggregateType[];
  readonly eventTypes?: readonly string[];
  readonly afterSequence?: SequenceNumber;
}

// ============================================================================
// QUERY INTERFACE (FASE 2.1)
// ============================================================================

export interface QueryCriteria {
  /** Filter by event types */
  readonly eventTypes?: readonly string[];
  
  /** Filter by aggregate types */
  readonly aggregateTypes?: readonly AggregateType[];
  
  /** Filter by specific aggregate IDs */
  readonly aggregateIds?: readonly EntityId[];
  
  /** Filter by actor */
  readonly actor?: {
    readonly type?: 'System' | 'Entity';
    readonly entityId?: EntityId;
  };
  
  /** Filter by correlation ID (for transaction tracking) */
  readonly correlationId?: EntityId;
  
  /** Filter by time range */
  readonly timeRange?: {
    readonly from?: Timestamp;
    readonly to?: Timestamp;
  };
  
  /** Filter by sequence range */
  readonly sequenceRange?: {
    readonly from?: SequenceNumber;
    readonly to?: SequenceNumber;
  };
  
  /** Pagination */
  readonly pagination?: {
    readonly limit?: number;
    readonly offset?: number;
  };
  
  /** Sort order */
  readonly orderBy?: 'sequence' | 'timestamp';
  readonly orderDirection?: 'asc' | 'desc';
}

export interface QueryResult {
  readonly events: readonly Event[];
  readonly total: number;
  readonly hasMore: boolean;
  readonly nextOffset?: number;
}

// ============================================================================
// IN-MEMORY EVENT STORE (for development/testing)
// ============================================================================

/**
 * In-memory implementation - NOT for production.
 * Use PostgreSQL, EventStoreDB, or similar for real deployments.
 */
export function createInMemoryEventStore(): EventStore {
  const events: Event[] = [];
  const eventById = new Map<EntityId, Event>();
  const eventsByAggregate = new Map<string, Event[]>();
  
  const hashChain = createHashChain();
  const temporal = createTemporalEnforcer(() => BigInt(events.length));
  
  const subscribers = new Set<{
    filter?: EventFilter;
    callback: (event: Event) => void;
  }>();
  
  const makeAggregateKey = (type: AggregateType, id: EntityId) => `${type}:${id}`;
  
  return {
    name: 'In-Memory',
    
    async healthCheck(): Promise<{ healthy: boolean; latencyMs?: number; message?: string }> {
      return {
        healthy: true,
        latencyMs: 0,
        message: 'In-memory store (data will not persist)',
      };
    },
    
    async append<T>(eventData: EventInput<T>): Promise<Event<T>> {
      const sequence = temporal.acquireNextSequence();
      const previousEvent = events.length > 0 ? events[events.length - 1] : null;
      const previousHash = previousEvent?.hash ?? 'genesis';
      
      const eventWithoutHash: Omit<Event<T>, 'hash'> = {
        id: generateId(),
        sequence,
        timestamp: eventData.timestamp ?? Date.now(),
        type: eventData.type,
        aggregateId: eventData.aggregateId,
        aggregateType: eventData.aggregateType,
        aggregateVersion: eventData.aggregateVersion,
        payload: eventData.payload,
        causation: eventData.causation ?? {},
        actor: eventData.actor,
        previousHash,
      };
      
      const hash = hashChain.computeHash(eventWithoutHash);
      const event: Event<T> = { ...eventWithoutHash, hash };
      
      // Validate temporal ordering
      const temporalResult = temporal.validateTemporal(event, previousEvent ?? undefined);
      if (!temporalResult.isValid) {
        throw new Error(`Temporal violation: ${temporalResult.violations.map(v => v.type).join(', ')}`);
      }
      
      // Append (this is the only mutation!)
      events.push(event as Event);
      eventById.set(event.id, event as Event);
      
      const aggKey = makeAggregateKey(event.aggregateType, event.aggregateId);
      if (!eventsByAggregate.has(aggKey)) {
        eventsByAggregate.set(aggKey, []);
      }
      eventsByAggregate.get(aggKey)!.push(event as Event);
      
      // Notify subscribers
      for (const sub of subscribers) {
        if (matchesFilter(event as Event, sub.filter)) {
          sub.callback(event as Event);
        }
      }
      
      return event;
    },
    
    async *getByAggregate(
      aggregateType: AggregateType,
      aggregateId: EntityId,
      options?: ReadOptions
    ): AsyncIterable<Event> {
      const key = makeAggregateKey(aggregateType, aggregateId);
      const aggEvents = eventsByAggregate.get(key) ?? [];
      
      let count = 0;
      for (const event of aggEvents) {
        if (options?.fromVersion && event.aggregateVersion < options.fromVersion) continue;
        if (options?.toVersion && event.aggregateVersion > options.toVersion) continue;
        if (options?.fromTimestamp && event.timestamp < options.fromTimestamp) continue;
        if (options?.toTimestamp && event.timestamp > options.toTimestamp) continue;
        if (options?.limit && count >= options.limit) break;
        
        yield deepFreeze({ ...event });
        count++;
      }
    },
    
    async *getBySequence(
      from: SequenceNumber,
      to?: SequenceNumber
    ): AsyncIterable<Event> {
      for (const event of events) {
        if (event.sequence < from) continue;
        if (to && event.sequence > to) break;
        yield deepFreeze({ ...event });
      }
    },
    
    async getById(eventId: EntityId): Promise<Event | null> {
      const event = eventById.get(eventId);
      return event ? deepFreeze({ ...event }) : null;
    },
    
    async getLatest(
      aggregateType: AggregateType,
      aggregateId: EntityId
    ): Promise<Event | null> {
      const key = makeAggregateKey(aggregateType, aggregateId);
      const aggEvents = eventsByAggregate.get(key);
      const event = aggEvents?.[aggEvents.length - 1];
      return event ? deepFreeze({ ...event }) : null;
    },
    
    async getCurrentSequence(): Promise<SequenceNumber> {
      return temporal.getCurrentSequence();
    },
    
    async *subscribe(filter?: EventFilter): AsyncIterable<Event> {
      // Create a queue for this subscriber
      const queue: Event[] = [];
      let resolve: (() => void) | null = null;
      
      const sub = {
        filter,
        callback: (event: Event) => {
          queue.push(event);
          if (resolve) {
            resolve();
            resolve = null;
          }
        },
      };
      
      subscribers.add(sub);
      
      try {
        while (true) {
          if (queue.length > 0) {
            yield queue.shift()!;
          } else {
            await new Promise<void>(r => { resolve = r; });
          }
        }
      } finally {
        subscribers.delete(sub);
      }
    },
    
    async verifyIntegrity(
      from?: SequenceNumber,
      to?: SequenceNumber
    ): Promise<ChainVerificationResult> {
      const subset = events.filter(e => {
        if (from && e.sequence < from) return false;
        if (to && e.sequence > to) return false;
        return true;
      });
      
      return hashChain.verifyChain(subset);
    },
    
    async query(criteria: QueryCriteria): Promise<QueryResult> {
      let filtered = [...events];
      
      // Filter by event types
      if (criteria.eventTypes?.length) {
        filtered = filtered.filter(e => criteria.eventTypes!.includes(e.type));
      }
      
      // Filter by aggregate types
      if (criteria.aggregateTypes?.length) {
        filtered = filtered.filter(e => criteria.aggregateTypes!.includes(e.aggregateType));
      }
      
      // Filter by aggregate IDs
      if (criteria.aggregateIds?.length) {
        filtered = filtered.filter(e => criteria.aggregateIds!.includes(e.aggregateId));
      }
      
      // Filter by actor
      if (criteria.actor) {
        filtered = filtered.filter(e => {
          if (criteria.actor!.type && e.actor.type !== criteria.actor!.type) return false;
          if (criteria.actor!.entityId) {
            // If filtering by entityId, actor must be Entity type with matching ID
            if (e.actor.type !== 'Entity') return false;
            if (e.actor.entityId !== criteria.actor!.entityId) return false;
          }
          return true;
        });
      }
      
      // Filter by correlation ID
      if (criteria.correlationId) {
        filtered = filtered.filter(e => e.causation?.correlationId === criteria.correlationId);
      }
      
      // Filter by time range
      if (criteria.timeRange) {
        if (criteria.timeRange.from) {
          filtered = filtered.filter(e => e.timestamp >= criteria.timeRange!.from!);
        }
        if (criteria.timeRange.to) {
          filtered = filtered.filter(e => e.timestamp <= criteria.timeRange!.to!);
        }
      }
      
      // Filter by sequence range
      if (criteria.sequenceRange) {
        if (criteria.sequenceRange.from) {
          filtered = filtered.filter(e => e.sequence >= criteria.sequenceRange!.from!);
        }
        if (criteria.sequenceRange.to) {
          filtered = filtered.filter(e => e.sequence <= criteria.sequenceRange!.to!);
        }
      }
      
      // Sort
      const orderBy = criteria.orderBy ?? 'sequence';
      const direction = criteria.orderDirection ?? 'asc';
      filtered.sort((a, b) => {
        const aVal = orderBy === 'sequence' ? Number(a.sequence) : a.timestamp;
        const bVal = orderBy === 'sequence' ? Number(b.sequence) : b.timestamp;
        return direction === 'asc' ? aVal - bVal : bVal - aVal;
      });
      
      const total = filtered.length;
      
      // Pagination
      const offset = criteria.pagination?.offset ?? 0;
      const limit = criteria.pagination?.limit ?? 100;
      const paginated = filtered.slice(offset, offset + limit);
      
      return {
        events: paginated.map(e => deepFreeze({ ...e })),
        total,
        hasMore: offset + limit < total,
        nextOffset: offset + limit < total ? offset + limit : undefined,
      };
    },
    
    async getNextVersion(
      aggregateType: AggregateType,
      aggregateId: EntityId
    ): Promise<number> {
      const key = makeAggregateKey(aggregateType, aggregateId);
      const aggEvents = eventsByAggregate.get(key);
      if (!aggEvents || aggEvents.length === 0) {
        return 1;
      }
      const lastEvent = aggEvents[aggEvents.length - 1];
      return lastEvent.aggregateVersion + 1;
    },
  };
}

function matchesFilter(event: Event, filter?: EventFilter): boolean {
  if (!filter) return true;
  
  if (filter.aggregateTypes && !filter.aggregateTypes.includes(event.aggregateType)) {
    return false;
  }
  
  if (filter.eventTypes && !filter.eventTypes.includes(event.type)) {
    return false;
  }
  
  if (filter.afterSequence && event.sequence <= filter.afterSequence) {
    return false;
  }
  
  return true;
}

// Simple ID generator - use UUID v7 in production
function generateId(): EntityId {
  const timestamp = Date.now().toString(16);
  const random = Math.random().toString(16).slice(2, 10);
  return `${timestamp}-${random}`;
}

// Deep freeze to ensure immutability of returned events
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const value = (obj as any)[key];
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

// ============================================================================
// AGGREGATE RECONSTRUCTION
// ============================================================================

/**
 * Reconstruct an aggregate's state by replaying its events
 */
export interface AggregateRehydrator<TState, TEvent> {
  /**
   * The initial state before any events
   */
  readonly initialState: TState;
  
  /**
   * Apply an event to produce new state
   */
  apply(state: TState, event: TEvent): TState;
}

/**
 * Reconstruct aggregate state at any point in time
 */
export async function reconstructAggregate<TState, TEvent>(
  store: EventStore,
  aggregateType: AggregateType,
  aggregateId: EntityId,
  rehydrator: AggregateRehydrator<TState, TEvent>,
  options?: { atVersion?: number; atTimestamp?: Timestamp }
): Promise<TState> {
  let state = rehydrator.initialState;
  
  for await (const event of store.getByAggregate(aggregateType, aggregateId, {
    toVersion: options?.atVersion,
    toTimestamp: options?.atTimestamp,
  })) {
    state = rehydrator.apply(state, event as unknown as TEvent);
  }
  
  return state;
}

// ============================================================================
// PROJECTIONS - Read Models
// ============================================================================

/**
 * Projections build read-optimized views from the event stream.
 * They are derived data - always rebuildable from events.
 */
export interface Projection<TView = unknown> {
  readonly name: string;
  readonly version: number;
  
  /**
   * Initialize the projection
   */
  initialize(): Promise<void>;
  
  /**
   * Handle an event
   */
  handle(event: Event): Promise<void>;
  
  /**
   * Query the projection
   */
  query<TResult>(query: unknown): Promise<TResult>;
  
  /**
   * Get the last processed sequence
   */
  getCheckpoint(): Promise<SequenceNumber>;
  
  /**
   * Rebuild the projection from scratch
   */
  rebuild(store: EventStore): Promise<void>;
}

