/**
 * EVOLUTION - Schema Versioning & Event Upcasting
 * 
 * Events are immutable, but schemas evolve. How do we handle this?
 * 
 * The solution: UPCASTING
 * - Old events stay as-is in storage
 * - When reading, we transform them to the current schema
 * - The transformation is a pure function: oldEvent → newEvent
 * 
 * This is like database migrations, but for events.
 */

import type { EntityId, Timestamp } from '../shared/types';
import type { Event, AggregateType } from '../schema/ledger';

// ============================================================================
// SCHEMA VERSION
// ============================================================================

/**
 * Every event type has a schema version.
 * When we change the structure, we bump the version.
 */
export interface SchemaVersion {
  readonly eventType: string;
  readonly version: number;
  readonly introducedAt: Timestamp;
  readonly description?: string;
}

/**
 * Schema registry tracks all versions of all event types.
 */
export interface SchemaRegistry {
  /** Register a new schema version */
  register(schema: SchemaVersion): void;
  
  /** Get current version for an event type */
  getCurrentVersion(eventType: string): number;
  
  /** Get all versions for an event type */
  getVersionHistory(eventType: string): readonly SchemaVersion[];
  
  /** Check if an event needs upcasting */
  needsUpcast(event: VersionedEvent): boolean;
}

export interface VersionedEvent extends Event {
  /** Schema version when this event was created */
  readonly schemaVersion?: number;
}

// ============================================================================
// UPCASTERS
// ============================================================================

/**
 * An Upcaster transforms an event from one version to the next.
 * 
 * Important: Upcasters are CHAINED.
 * v1 → v2 → v3 → v4 (current)
 * 
 * We don't write v1→v4 directly. We compose v1→v2, v2→v3, v3→v4.
 */
export interface Upcaster<TFrom = unknown, TTo = unknown> {
  /** Event type this upcaster handles */
  readonly eventType: string;
  
  /** Source version */
  readonly fromVersion: number;
  
  /** Target version */
  readonly toVersion: number;
  
  /** Transform the event payload */
  upcast(payload: TFrom, event: Event): TTo;
  
  /** Optional: Transform event metadata too */
  upcastMeta?(event: Event<TFrom>): Partial<Event<TTo>>;
}

/**
 * Upcaster chain applies multiple upcasters in sequence.
 */
export interface UpcasterChain {
  /** Register an upcaster */
  register<TFrom, TTo>(upcaster: Upcaster<TFrom, TTo>): void;
  
  /** Apply all necessary upcasts to bring event to current version */
  upcast<T>(event: VersionedEvent): Event<T>;
  
  /** Get the chain of upcasters for an event type */
  getChain(eventType: string, fromVersion: number): readonly Upcaster[];
}

export function createUpcasterChain(registry: SchemaRegistry): UpcasterChain {
  const upcasters = new Map<string, Upcaster[]>(); // eventType → upcasters sorted by version
  
  return {
    register<TFrom, TTo>(upcaster: Upcaster<TFrom, TTo>): void {
      const key = upcaster.eventType;
      if (!upcasters.has(key)) {
        upcasters.set(key, []);
      }
      upcasters.get(key)!.push(upcaster as Upcaster);
      // Keep sorted by fromVersion
      upcasters.get(key)!.sort((a, b) => a.fromVersion - b.fromVersion);
    },
    
    upcast<T>(event: VersionedEvent): Event<T> {
      const eventVersion = event.schemaVersion ?? 1;
      const currentVersion = registry.getCurrentVersion(event.type);
      
      if (eventVersion >= currentVersion) {
        return event as Event<T>;
      }
      
      // Get chain and apply sequentially
      const chain = this.getChain(event.type, eventVersion);
      
      let result: Event = event;
      for (const upcaster of chain) {
        const newPayload = upcaster.upcast(result.payload, result);
        const metaChanges = upcaster.upcastMeta?.(result) ?? {};
        
        result = {
          ...result,
          ...metaChanges,
          payload: newPayload,
          schemaVersion: upcaster.toVersion,
        } as Event;
      }
      
      return result as Event<T>;
    },
    
    getChain(eventType: string, fromVersion: number): readonly Upcaster[] {
      const all = upcasters.get(eventType) ?? [];
      return all.filter(u => u.fromVersion >= fromVersion);
    },
  };
}

// ============================================================================
// MIGRATION
// ============================================================================

/**
 * A Migration is a batch operation that transforms stored events.
 * 
 * Use sparingly! Upcasting on-read is usually better.
 * Migrations are for when you need to:
 * - Compact/archive old events
 * - Fix data corruption
 * - Optimize storage
 */
export interface Migration {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly createdAt: Timestamp;
  
  /** Which events does this migration affect? */
  readonly affectsEventTypes: readonly string[];
  
  /** Is this migration reversible? */
  readonly reversible: boolean;
  
  /** The migration logic */
  migrate(events: AsyncIterable<Event>): AsyncIterable<Event>;
  
  /** Reverse migration (if reversible) */
  rollback?(events: AsyncIterable<Event>): AsyncIterable<Event>;
}

/**
 * Migration runner executes migrations safely.
 */
export interface MigrationRunner {
  /** Run a migration (creates new event stream) */
  run(migration: Migration): Promise<MigrationResult>;
  
  /** Preview what a migration would do */
  preview(migration: Migration, sampleSize?: number): Promise<MigrationPreview>;
  
  /** Get migration history */
  getHistory(): Promise<readonly MigrationRecord[]>;
  
  /** Rollback a migration */
  rollback(migrationId: string): Promise<MigrationResult>;
}

export interface MigrationResult {
  readonly migrationId: string;
  readonly success: boolean;
  readonly eventsProcessed: number;
  readonly eventsModified: number;
  readonly duration: number;
  readonly errors?: readonly MigrationError[];
}

export interface MigrationPreview {
  readonly totalEvents: number;
  readonly affectedEvents: number;
  readonly sampleBefore: readonly Event[];
  readonly sampleAfter: readonly Event[];
}

export interface MigrationRecord {
  readonly migrationId: string;
  readonly name: string;
  readonly executedAt: Timestamp;
  readonly result: MigrationResult;
}

export interface MigrationError {
  readonly eventId: EntityId;
  readonly error: string;
  readonly recoverable: boolean;
}

// ============================================================================
// AGGREGATE VERSION
// ============================================================================

/**
 * Aggregates can also have versions.
 * When we change how state is computed, we might need to rebuild.
 */
export interface AggregateVersion {
  readonly aggregateType: AggregateType;
  readonly version: number;
  readonly rehydratorHash: string; // Hash of rehydrator code
  readonly introducedAt: Timestamp;
}

/**
 * Aggregate version manager tracks when rehydrators change.
 */
export interface AggregateVersionManager {
  /** Register a new aggregate version */
  register(version: AggregateVersion): void;
  
  /** Check if cached state is stale */
  isStale(aggregateType: AggregateType, cachedVersion: number): boolean;
  
  /** Get current version */
  getCurrentVersion(aggregateType: AggregateType): number;
}

// ============================================================================
// EXAMPLE UPCASTERS
// ============================================================================

/**
 * Example: PartyRegistered event evolved over time
 */
export const EXAMPLE_UPCASTERS: readonly Upcaster[] = [
  // v1 → v2: Added 'contacts' field
  {
    eventType: 'PartyRegistered',
    fromVersion: 1,
    toVersion: 2,
    upcast(payload: { name: string; type: string }) {
      return {
        ...payload,
        identity: {
          name: payload.name,
          identifiers: [],
          contacts: [], // New field with default
        },
      };
    },
  },
  
  // v2 → v3: Renamed 'type' to 'partyType'
  {
    eventType: 'PartyRegistered',
    fromVersion: 2,
    toVersion: 3,
    upcast(payload: { type: string; identity: unknown }) {
      const { type, ...rest } = payload;
      return {
        ...rest,
        partyType: type,
      };
    },
  },
  
  // v3 → v4: Added 'establishedBy' for agreement tracking
  {
    eventType: 'PartyRegistered',
    fromVersion: 3,
    toVersion: 4,
    upcast(payload: unknown, event: Event) {
      return {
        ...payload as object,
        establishedBy: event.causation?.correlationId, // Best effort
      };
    },
  },
];

// ============================================================================
// DEPRECATION
// ============================================================================

/**
 * Mark event types as deprecated with a migration path.
 */
export interface Deprecation {
  readonly eventType: string;
  readonly deprecatedAt: Timestamp;
  readonly removedAt?: Timestamp;
  readonly replacedBy?: string;
  readonly migrationGuide: string;
}

export interface DeprecationRegistry {
  /** Mark an event type as deprecated */
  deprecate(deprecation: Deprecation): void;
  
  /** Check if an event type is deprecated */
  isDeprecated(eventType: string): boolean;
  
  /** Get deprecation info */
  getDeprecation(eventType: string): Deprecation | null;
  
  /** Get all deprecations */
  getAll(): readonly Deprecation[];
}

