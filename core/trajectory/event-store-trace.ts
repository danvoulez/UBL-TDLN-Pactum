/**
 * EVENT STORE TRACE - TraceStore backed by the Event Store
 * 
 * This is the canonical implementation of TraceStore for the Trajectory system.
 * All traces become events in the ledger - immutable, auditable, queryable.
 * 
 * PHILOSOPHY: Trajectory IS the ledger. The ledger tells the story.
 * There is no separate logging system - everything is events.
 * 
 * NAMING CONVENTION:
 * - Trajectory = System audit trail (what happened in the system)
 * - Memory = Agent context (what the AI remembers) - SEPARATE MODULE
 */

import type { EntityId, ActorReference, Timestamp } from '../shared/types';
import type { EventStore } from '../store/event-store';
import type { Trace, TraceCategory, SignificanceLevel } from './trace';
import type { TraceStore, TraceQuery, TraceQueryOptions } from './path';

// =============================================================================
// EVENT STORE TRACE STORE IMPLEMENTATION
// =============================================================================

export interface EventStoreTraceConfig {
  /** The event store to write to */
  readonly eventStore: EventStore;
  
  /** Default realm for traces without explicit realm */
  readonly defaultRealmId: EntityId;
  
  /** Default actor for system-generated traces */
  readonly systemActor: ActorReference;
}

/**
 * Creates a TraceStore that persists to the EventStore.
 * 
 * Every trace becomes a TraceRecorded event in the ledger.
 * This ensures all audit data is:
 * - Immutable (append-only ledger)
 * - Cryptographically chained
 * - Queryable via event store
 * - Part of the system's permanent record
 */
export function createEventStoreTraceStore(config: EventStoreTraceConfig): TraceStore {
  const { eventStore, defaultRealmId, systemActor } = config;
  
  return {
    async save(trace: Trace): Promise<void> {
      const eventId = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` as EntityId;
      
      await eventStore.append({
        type: 'TraceRecorded',
        aggregateType: 'System' as any,
        aggregateId: eventId,
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: trace.timestamp || Date.now(),
        payload: {
          type: 'TraceRecorded',
          traceId: trace.id,
          realmId: trace.realmId || defaultRealmId,
          classification: trace.classification,
          content: trace.content,
          causation: trace.causation,
          significance: trace.significance,
          perspectives: trace.perspectives,
          tags: trace.tags,
          relatedEntities: trace.relatedEntities,
        },
      });
    },
    
    async get(id: EntityId): Promise<Trace | null> {
      const pool = (eventStore as any).getPool?.();
      if (!pool) return null;
      
      try {
        const result = await pool.query(`
          SELECT payload FROM events 
          WHERE event_type = 'TraceRecorded' 
            AND payload->>'traceId' = $1
          LIMIT 1
        `, [id]);
        
        if (result.rows.length === 0) return null;
        return reconstructTrace(result.rows[0].payload);
      } catch {
        return null;
      }
    },
    
    async query(query: TraceQuery): Promise<readonly Trace[]> {
      const pool = (eventStore as any).getPool?.();
      if (!pool) return [];
      
      try {
        const conditions: string[] = ["event_type = 'TraceRecorded'"];
        const params: any[] = [];
        let paramIndex = 1;
        
        if (query.realmId) {
          conditions.push(`payload->>'realmId' = $${paramIndex++}`);
          params.push(query.realmId);
        }
        
        if (query.categories && query.categories.length > 0) {
          conditions.push(`payload->'classification'->>'category' = ANY($${paramIndex++})`);
          params.push(query.categories);
        }
        
        if (query.tags && query.tags.length > 0) {
          conditions.push(`payload->'tags' ?| $${paramIndex++}`);
          params.push(query.tags);
        }
        
        if (query.timeRange) {
          if (query.timeRange.start) {
            conditions.push(`timestamp >= to_timestamp($${paramIndex++} / 1000.0)`);
            params.push(query.timeRange.start);
          }
          if (query.timeRange.end) {
            conditions.push(`timestamp <= to_timestamp($${paramIndex++} / 1000.0)`);
            params.push(query.timeRange.end);
          }
        }
        
        const limit = query.limit || 100;
        const offset = query.offset || 0;
        
        const sql = `
          SELECT payload FROM events 
          WHERE ${conditions.join(' AND ')}
          ORDER BY sequence DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
        
        const result = await pool.query(sql, params);
        return result.rows.map((row: any) => reconstructTrace(row.payload));
      } catch {
        return [];
      }
    },
    
    async forEntity(entityId: EntityId, options?: TraceQueryOptions): Promise<readonly Trace[]> {
      const pool = (eventStore as any).getPool?.();
      if (!pool) return [];
      
      try {
        const result = await pool.query(`
          SELECT payload FROM events 
          WHERE event_type = 'TraceRecorded' 
            AND payload->'relatedEntities' ? $1
          ORDER BY sequence DESC
          LIMIT $2
        `, [entityId, options?.limit || 100]);
        
        return result.rows.map((row: any) => reconstructTrace(row.payload));
      } catch {
        return [];
      }
    },
    
    async inRange(start: Timestamp, end: Timestamp, options?: TraceQueryOptions): Promise<readonly Trace[]> {
      return this.query({
        timeRange: { start, end },
        categories: options?.categories,
        minSignificance: options?.minSignificance,
        limit: options?.limit,
      });
    },
  };
}

// =============================================================================
// HELPER: Reconstruct Trace from stored payload
// =============================================================================

function reconstructTrace(payload: any): Trace {
  return {
    id: payload.traceId,
    timestamp: payload.timestamp || Date.now(),
    realmId: payload.realmId,
    eventId: payload.eventId,
    classification: payload.classification,
    content: payload.content,
    causation: payload.causation || { chain: [] },
    significance: payload.significance,
    perspectives: payload.perspectives || [],
    retention: payload.retention || { duration: { type: 'Forever' } },
    relatedEntities: payload.relatedEntities || [],
    tags: payload.tags || [],
  } as Trace;
}

// =============================================================================
// AUDIT LOGGER - Convenience API for common audit events
// =============================================================================

/**
 * AuditLogger provides a simple API for logging common system events.
 * All events go to the ledger via the EventStore.
 * 
 * This is the SINGLE POINT for audit logging in the system.
 * Components should use this instead of direct eventStore.append() calls.
 */
export interface AuditLogger {
  /** Log an authorization decision */
  authorization(data: {
    actor: ActorReference;
    action: string;
    resource: string;
    resourceId?: EntityId;
    decision: 'GRANTED' | 'DENIED';
    reason: string;
    roles?: Array<{ roleType: string; hasPermission: boolean }>;
    realm: EntityId;
    correlationId?: string;
  }): Promise<void>;
  
  /** Log a role resolution */
  roleResolution(data: {
    actor: ActorReference;
    entityId: EntityId;
    realm: EntityId;
    rolesFound: number;
    rolesGranted: number;
    evaluations: Array<{ roleType: string; included: boolean; reason: string }>;
  }): Promise<void>;
  
  /** Log an intent execution */
  intentExecution(data: {
    actor: ActorReference;
    intent: string;
    realm: EntityId;
    success: boolean;
    outcome?: string;
    error?: string;
    durationMs?: number;
  }): Promise<void>;
  
  /** Log a system event */
  system(data: {
    event: string;
    details?: Record<string, unknown>;
    significance?: 'Routine' | 'Notable' | 'Important' | 'Critical';
  }): Promise<void>;
}

/**
 * Create an AuditLogger that writes to the EventStore.
 */
export function createAuditLogger(
  eventStore: EventStore,
  defaultRealm: EntityId
): AuditLogger {
  const append = async (type: string, payload: Record<string, unknown>, actor?: ActorReference) => {
    const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` as EntityId;
    await eventStore.append({
      type,
      aggregateType: 'System' as any,
      aggregateId: id,
      aggregateVersion: 1,
      actor: actor || { type: 'System', systemId: 'audit-logger' } as any,
      timestamp: Date.now(),
      payload: { type, ...payload },
    }).catch(() => {}); // Audit should never block main flow
  };
  
  return {
    async authorization(data) {
      await append(
        data.decision === 'GRANTED' ? 'AuthorizationGranted' : 'AuthorizationDenied',
        {
          actor: data.actor,
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId,
          decision: data.decision,
          reason: data.reason,
          evaluatedRoles: data.roles,
          realm: data.realm,
          correlationId: data.correlationId,
        },
        data.actor
      );
    },
    
    async roleResolution(data) {
      await append('RoleResolutionPerformed', {
        entityId: data.entityId,
        realm: data.realm,
        totalRolesFound: data.rolesFound,
        rolesGranted: data.rolesGranted,
        evaluations: data.evaluations,
      }, data.actor);
    },
    
    async intentExecution(data) {
      await append(
        data.success ? 'IntentSucceeded' : 'IntentFailed',
        {
          intent: data.intent,
          realm: data.realm,
          success: data.success,
          outcome: data.outcome,
          error: data.error,
          durationMs: data.durationMs,
        },
        data.actor
      );
    },
    
    async system(data) {
      await append('SystemEvent', {
        event: data.event,
        details: data.details,
        significance: data.significance || 'Routine',
      });
    },
  };
}
