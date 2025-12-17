/**
 * SHARED TYPES - Universal Foundation
 * 
 * This module contains the absolute primitives used across the entire system.
 * These are the "physics constants" of our universe.
 * 
 * RULES:
 * 1. Types here are IMPORTED by all other modules
 * 2. This module has ZERO internal dependencies
 * 3. All other modules use these types instead of defining their own
 */

// ============================================================================
// TEMPORAL PRIMITIVES
// ============================================================================

/** Monotonic sequence - the arrow of time. Always increasing, never duplicated. */
export type SequenceNumber = bigint;

/** Point in time - Unix epoch in milliseconds */
export type Timestamp = number;

/** Cryptographic hash for integrity verification */
export type Hash = string; // SHA-256 in hex format

// ============================================================================
// IDENTITY PRIMITIVES  
// ============================================================================

/** 
 * Universal identifier - time-ordered for sorting.
 * Format: UUID v7 in production, simpler format for dev.
 */
export type EntityId = string & { readonly __brand: unique symbol };

/** Create an EntityId from a raw string (for internal use) */
export function asEntityId(s: string): EntityId {
  return s as EntityId;
}

// ============================================================================
// TEMPORAL STRUCTURES
// ============================================================================

/**
 * Unified Duration type - represents a span of time.
 * Used for: retention policies, timeouts, validity periods, delays.
 */
export interface Duration {
  readonly amount: number;
  readonly unit: DurationUnit;
}

export type DurationUnit = 
  | 'milliseconds'
  | 'seconds' 
  | 'minutes' 
  | 'hours' 
  | 'days' 
  | 'weeks' 
  | 'months' 
  | 'years'
  | 'forever';

/** Convert Duration to milliseconds (except 'forever') */
export function durationToMs(d: Duration): number | null {
  if (d.unit === 'forever') return null;
  
  const ms: Record<Exclude<DurationUnit, 'forever'>, number> = {
    milliseconds: 1,
    seconds: 1000,
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000,
    weeks: 604_800_000,
    months: 2_592_000_000, // ~30 days
    years: 31_536_000_000, // ~365 days
  };
  
  return d.amount * ms[d.unit];
}

/**
 * Unified Validity type - when something is effective.
 * Used for: agreements, roles, subscriptions, credentials.
 */
export interface Validity {
  /** When it becomes effective */
  readonly effectiveFrom: Timestamp;
  
  /** When it expires (undefined = indefinite) */
  readonly effectiveUntil?: Timestamp;
  
  /** Auto-renewal settings */
  readonly autoRenew?: boolean;
  readonly renewalTerms?: string;
}

/** Check if a validity period is currently active */
export function isValidAt(v: Validity, at: Timestamp = Date.now()): boolean {
  if (at < v.effectiveFrom) return false;
  if (v.effectiveUntil && at > v.effectiveUntil) return false;
  return true;
}

// ============================================================================
// QUANTITY PRIMITIVES
// ============================================================================

/**
 * Unified Quantity type - for fungible assets and measurements.
 */
export interface Quantity {
  readonly amount: number | bigint;
  readonly unit: string;
  readonly precision?: number;
}

// ============================================================================
// ACTOR PRIMITIVES
// ============================================================================

/**
 * Unified Actor reference - who performed an action.
 * Every action in the system is traceable to an actor.
 */
export type ActorReference = 
  | { readonly type: 'Entity'; readonly entityId: EntityId }
  | { readonly type: 'System'; readonly systemId: string; readonly component?: string }
  | { readonly type: 'Workflow'; readonly workflowId: EntityId }
  | { readonly type: 'Anonymous'; readonly reason: string };

// Legacy alias for backward compatibility
export type PartyActorReference = { readonly type: 'Party'; readonly partyId: EntityId };

/** Get a human-readable description of an actor */
export function describeActor(actor: ActorReference): string {
  switch (actor.type) {
    case 'Entity': return `Entity ${actor.entityId}`;
    case 'System': return actor.component ? `System:${actor.systemId}/${actor.component}` : `System:${actor.systemId}`;
    case 'Workflow': return `Workflow ${actor.workflowId}`;
    case 'Anonymous': return `Anonymous (${actor.reason})`;
  }
}

// ============================================================================
// CONDITION PRIMITIVES
// ============================================================================

/**
 * Unified Condition type - for guards, policies, and business rules.
 */
export interface Condition {
  readonly type: string;
  readonly parameters: Record<string, unknown>;
  readonly description?: string;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Standard result type for operations that can fail.
 */
export type Result<T, E = Error> = 
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ============================================================================
// AGGREGATE TYPES
// ============================================================================

/**
 * The core aggregate types in the system.
 */
export type AggregateType = 
  | 'Entity'     // Generalized: was 'Party'
  | 'Asset'      // Objects
  | 'Agreement'  // Contracts/pacts
  | 'Role'       // Relationships
  | 'Workflow'   // State machines
  | 'Flow'       // Orchestrations
  | 'Realm'      // Tenancy containers
  | 'Memory';    // System logs

// Legacy alias for backward compatibility  
export const LEGACY_PARTY_TYPE = 'Entity' as const;

// ============================================================================
// SCOPE PRIMITIVES
// ============================================================================

/**
 * Unified Scope type - the context in which something applies.
 * Used for: roles, permissions, policies.
 */
export interface Scope {
  readonly type: ScopeType;
  readonly targetId?: EntityId;
}

export type ScopeType = 
  | 'Global'     // Applies everywhere
  | 'Realm'      // Applies within a realm
  | 'Entity'     // Applies to a specific entity
  | 'Agreement'  // Applies to a specific agreement
  | 'Asset';     // Applies to a specific asset

/** Check if scope A contains scope B */
export function scopeContains(container: Scope, contained: Scope): boolean {
  if (container.type === 'Global') return true;
  if (container.type !== contained.type) return false;
  if (container.targetId !== contained.targetId) return false;
  return true;
}

// ============================================================================
// CAUSATION - The Chain of Why
// ============================================================================

/**
 * Causation tracks the "why" chain of events.
 */
export interface Causation {
  /** The command that triggered this */
  readonly commandId?: EntityId;
  
  /** Correlation ID for grouping related events */
  readonly correlationId?: EntityId;
  
  /** Workflow that's driving this */
  readonly workflowId?: EntityId;
  
  /** Parent span for distributed tracing */
  readonly spanId?: string;
  readonly parentSpanId?: string;
}

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generate a time-ordered unique ID.
 * Format: {prefix}-{timestamp_hex}-{random}
 * 
 * In production, use UUID v7 for better compatibility.
 */
export function generateId(prefix: string = ''): EntityId {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  const id = prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
  return id as EntityId;
}

/** Specialized ID generators for each aggregate type */
export const Ids = {
  entity: () => generateId('ent'),
  asset: () => generateId('ast'),
  agreement: () => generateId('agr'),
  role: () => generateId('rol'),
  workflow: () => generateId('wfl'),
  flow: () => generateId('flw'),
  realm: () => generateId('rlm'),
  event: () => generateId('evt'),
  memory: () => generateId('mem'),
  command: () => generateId('cmd'),
  request: () => generateId('req'),
} as const;

// ============================================================================
// PRIMORDIAL CONSTANTS
// ============================================================================
// FASE 10 - REDUNDÂNCIA INTENCIONAL
// 
// Esta re-exportação parece redundante, mas existe como âncora semântica para IAs e devs novatos.
// Não "otimizar" removendo sem garantir que imports alternativos existem.
// 
// Por que é intencional:
// - Facilita descoberta: IAs e devs podem importar de qualquer lugar comum
// - Reduz necessidade de navegar a árvore de imports
// - Serve como âncora semântica: "onde quer que eu procure, encontro"
//
// NOTE: These constants are re-exported from core/universal/primitives.ts
// which is the CANONICAL source. This re-export is for backward compatibility.
// New code should import directly from '../universal/primitives'.

export {
  PRIMORDIAL_SYSTEM_ID,
  PRIMORDIAL_REALM_ID,
  GENESIS_AGREEMENT_ID,
} from '../universal/primitives';

