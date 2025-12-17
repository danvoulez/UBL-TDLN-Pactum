/**
 * SHARED MODULE - Universal Foundation
 * 
 * Single source of truth for:
 * - Primitive types (EntityId, Timestamp, etc.)
 * - Common structures (Duration, Validity, Scope, etc.)
 * - ID generation utilities
 * - Primordial constants
 */

export * from './types';

// Re-export commonly used utilities
export { 
  generateId, 
  Ids,
  asEntityId,
  durationToMs,
  isValidAt,
  scopeContains,
  describeActor,
  ok,
  err,
} from './types';

// Re-export primordial constants
export {
  PRIMORDIAL_SYSTEM_ID,
  PRIMORDIAL_REALM_ID,
  GENESIS_AGREEMENT_ID,
} from './types';

