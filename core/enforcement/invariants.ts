/**
 * ENFORCEMENT LAYER - Immutability & Integrity Guarantees
 * 
 * This module defines what ENFORCES the temporal ledger's rules.
 * The arrow of time is maintained through cryptographic chaining,
 * structural invariants, and domain rules.
 */

import type {
  Event,
  EntityId,
  Hash,
  SequenceNumber,
  Timestamp,
  Command,
  AggregateType,
  ActorReference,
} from '../schema/ledger';

import type {
  WorkflowDefinition,
  WorkflowInstance,
  TransitionGuard,
} from '../schema/workflow';

// ============================================================================
// 1. CRYPTOGRAPHIC ENFORCEMENT - The Chain of Truth
// ============================================================================

/**
 * Each event contains the hash of the previous event.
 * This creates an immutable chain - tampering with any event
 * invalidates all subsequent hashes.
 */
export interface HashChain {
  /**
   * Compute hash for an event (excluding the hash field itself)
   */
  computeHash(event: Omit<Event, 'hash'>): Hash;
  
  /**
   * Verify an event's hash is correct
   */
  verifyHash(event: Event): boolean;
  
  /**
   * Verify the chain from one event to another
   */
  verifyChain(events: readonly Event[]): ChainVerificationResult;
}

export interface ChainVerificationResult {
  readonly isValid: boolean;
  readonly invalidAt?: SequenceNumber;
  readonly error?: string;
}

/**
 * Implementation: SHA-256 hash of canonical JSON
 */
export function createHashChain(): HashChain {
  const computeHash = (event: Omit<Event, 'hash'>): Hash => {
    // Canonical JSON: sorted keys, no whitespace
    // Handle BigInt serialization
    const canonical = JSON.stringify(event, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }, Object.keys(event).sort());
    // In production: use crypto.subtle.digest or node crypto
    return `sha256:${hashString(canonical)}`;
  };
  
  const verifyHash = (event: Event): boolean => {
    const { hash, ...rest } = event;
    return computeHash(rest) === hash;
  };
  
  const verifyChain = (events: readonly Event[]): ChainVerificationResult => {
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      
      // Verify self-hash
      if (!verifyHash(event)) {
        return {
          isValid: false,
          invalidAt: event.sequence,
          error: `Event ${event.sequence} has invalid hash`,
        };
      }
      
      // Verify chain link (except for first event)
      if (i > 0) {
        const previous = events[i - 1];
        if (event.previousHash !== previous.hash) {
          return {
            isValid: false,
            invalidAt: event.sequence,
            error: `Event ${event.sequence} has broken chain link`,
          };
        }
      }
    }
    
    return { isValid: true };
  };
  
  return { computeHash, verifyHash, verifyChain };
}

// Placeholder hash function - replace with real crypto in production
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

// ============================================================================
// 2. TEMPORAL ENFORCEMENT - The Arrow of Time
// ============================================================================

/**
 * Enforces that events can only be appended, never modified or deleted.
 * Sequence numbers are monotonically increasing.
 */
export interface TemporalEnforcer {
  /**
   * Validate that an event respects temporal ordering
   */
  validateTemporal(event: Event, previousEvent?: Event): TemporalValidationResult;
  
  /**
   * Get the current sequence number
   */
  getCurrentSequence(): SequenceNumber;
  
  /**
   * Acquire the next sequence number (atomic)
   */
  acquireNextSequence(): SequenceNumber;
}

export interface TemporalValidationResult {
  readonly isValid: boolean;
  readonly violations: readonly TemporalViolation[];
}

export type TemporalViolation = 
  | { readonly type: 'SequenceNotMonotonic'; readonly expected: SequenceNumber; readonly actual: SequenceNumber }
  | { readonly type: 'TimestampInPast'; readonly eventTime: Timestamp; readonly currentTime: Timestamp }
  | { readonly type: 'ChainBroken'; readonly expectedPrevHash: Hash; readonly actualPrevHash: Hash }
  | { readonly type: 'DuplicateSequence'; readonly sequence: SequenceNumber };

export function createTemporalEnforcer(
  getCurrentSequence: () => SequenceNumber
): TemporalEnforcer {
  let sequence = getCurrentSequence();
  
  return {
    validateTemporal(event: Event, previousEvent?: Event): TemporalValidationResult {
      const violations: TemporalViolation[] = [];
      
      // Sequence must be greater than previous
      if (previousEvent && event.sequence <= previousEvent.sequence) {
        violations.push({
          type: 'SequenceNotMonotonic',
          expected: previousEvent.sequence + 1n,
          actual: event.sequence,
        });
      }
      
      // Chain must link correctly
      if (previousEvent && event.previousHash !== previousEvent.hash) {
        violations.push({
          type: 'ChainBroken',
          expectedPrevHash: previousEvent.hash,
          actualPrevHash: event.previousHash,
        });
      }
      
      return {
        isValid: violations.length === 0,
        violations,
      };
    },
    
    getCurrentSequence(): SequenceNumber {
      return sequence;
    },
    
    acquireNextSequence(): SequenceNumber {
      sequence = sequence + 1n;
      return sequence;
    },
  };
}

// ============================================================================
// 3. AGGREGATE INVARIANTS - Domain Rules
// ============================================================================

/**
 * Each aggregate type has invariants that must hold after every event.
 * These are the business rules that cannot be violated.
 */
export interface InvariantRule<T = unknown> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly aggregateType: AggregateType;
  
  /**
   * Check if the invariant holds for the given state
   */
  check(state: T): InvariantCheckResult;
}

export interface InvariantCheckResult {
  readonly holds: boolean;
  readonly violation?: string;
  readonly severity: 'Error' | 'Warning';
}

/**
 * Built-in invariants for core aggregates
 */
export const CORE_INVARIANTS: readonly InvariantRule[] = [
  // Party Invariants
  {
    id: 'party-must-have-identity',
    name: 'Party Must Have Identity',
    description: 'Every party must have at least a name',
    aggregateType: 'Party',
    check: (state: any) => ({
      holds: !!state.identity?.name,
      violation: 'Party has no identity name',
      severity: 'Error',
    }),
  },
  
  // Asset Invariants
  {
    id: 'asset-transfer-requires-agreement',
    name: 'Asset Transfer Requires Agreement',
    description: 'Assets cannot be transferred without a governing agreement',
    aggregateType: 'Asset',
    check: (state: any) => ({
      holds: state.status !== 'Transferred' || !!state.lastTransferAgreementId,
      violation: 'Asset was transferred without an agreement',
      severity: 'Error',
    }),
  },
  
  {
    id: 'owned-asset-must-have-owner',
    name: 'Owned Asset Must Have Owner',
    description: 'If an asset is owned, it must have an owner reference',
    aggregateType: 'Asset',
    check: (state: any) => ({
      holds: state.status !== 'Sold' || !!state.ownerId,
      violation: 'Asset marked as sold but has no owner',
      severity: 'Error',
    }),
  },
  
  // Agreement Invariants
  {
    id: 'agreement-minimum-parties',
    name: 'Agreement Minimum Parties',
    description: 'An agreement must have at least one party and one witness/supervisor OR two parties',
    aggregateType: 'Agreement',
    check: (state: any) => {
      const parties = state.parties || [];
      const witnesses = parties.filter((p: any) => p.isWitness || p.isSupervisor);
      const principals = parties.filter((p: any) => !p.isWitness && !p.isSupervisor);
      
      // Either 2+ principals, or 1 principal + 1 witness/supervisor
      const valid = principals.length >= 2 || 
                   (principals.length >= 1 && witnesses.length >= 1);
      
      return {
        holds: valid,
        violation: 'Agreement must have minimum party requirements',
        severity: 'Error',
      };
    },
  },
  
  {
    id: 'active-agreement-requires-consent',
    name: 'Active Agreement Requires Consent',
    description: 'An agreement cannot be Active without consent from all principals',
    aggregateType: 'Agreement',
    check: (state: any) => {
      if (state.status !== 'Active') {
        return { holds: true, severity: 'Error' };
      }
      
      const principals = (state.parties || []).filter(
        (p: any) => !p.isWitness && !p.isSupervisor
      );
      
      const allConsented = principals.every((p: any) => p.consent?.givenAt);
      
      return {
        holds: allConsented,
        violation: 'Not all principals have given consent',
        severity: 'Error',
      };
    },
  },
  
  // Role Invariants
  {
    id: 'role-must-have-establishing-agreement',
    name: 'Role Must Have Establishing Agreement',
    description: 'Every role must reference the agreement that established it',
    aggregateType: 'Role',
    check: (state: any) => ({
      holds: !!state.establishedBy,
      violation: 'Role has no establishing agreement',
      severity: 'Error',
    }),
  },
];

// ============================================================================
// 4. COMMAND VALIDATION - Authorization & Business Rules
// ============================================================================

/**
 * Commands must be validated before they can produce events.
 * This is where authorization and business rules are enforced.
 */
export interface CommandValidator {
  /**
   * Validate a command against all applicable rules
   */
  validate(command: Command, context: ValidationContext): Promise<CommandValidationResult>;
}

export interface ValidationContext {
  /** Current state of the target aggregate (if exists) */
  readonly aggregateState?: unknown;
  readonly aggregateVersion?: number;
  
  /** The actor's current roles */
  readonly actorRoles: readonly string[];
  
  /** Active workflow instance (if any) */
  readonly workflowInstance?: WorkflowInstance;
  
  /** Custom validators registered in the system */
  readonly customValidators: Map<string, CustomValidator>;
}

export interface CustomValidator {
  readonly id: string;
  validate(command: Command, context: ValidationContext): Promise<boolean>;
}

export interface CommandValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationError[];
}

export interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
  readonly context?: Record<string, unknown>;
}

// ============================================================================
// 5. WORKFLOW GUARD EVALUATION
// ============================================================================

/**
 * Evaluates guards on workflow transitions
 */
export interface GuardEvaluator {
  evaluate(
    guard: TransitionGuard,
    context: GuardContext
  ): Promise<GuardEvaluationResult>;
}

export interface GuardContext {
  readonly actor: ActorReference;
  readonly actorRoles: readonly string[];
  readonly aggregate: unknown;
  readonly workflow: WorkflowInstance;
  readonly now: Timestamp;
}

export interface GuardEvaluationResult {
  readonly passed: boolean;
  readonly reason?: string;
}

// ============================================================================
// 6. AUDIT TRAIL - Immutable Record of All Actions
// ============================================================================

/**
 * The audit trail is the event stream itself.
 * Every action, every change, every decision is recorded.
 */
export interface AuditEntry {
  readonly eventId: EntityId;
  readonly sequence: SequenceNumber;
  readonly timestamp: Timestamp;
  readonly actor: ActorReference;
  readonly action: string;
  readonly target: {
    readonly type: AggregateType;
    readonly id: EntityId;
  };
  readonly outcome: 'Success' | 'Failure';
  readonly details?: Record<string, unknown>;
}

/**
 * Query the audit trail
 */
export interface AuditTrailQuery {
  /** Filter by actor */
  readonly actor?: ActorReference;
  
  /** Filter by target aggregate */
  readonly target?: {
    readonly type?: AggregateType;
    readonly id?: EntityId;
  };
  
  /** Filter by action type */
  readonly action?: string;
  
  /** Time range */
  readonly from?: Timestamp;
  readonly to?: Timestamp;
  
  /** Pagination */
  readonly limit?: number;
  readonly afterSequence?: SequenceNumber;
}

// ============================================================================
// 7. THE ENFORCEMENT CONTRACT
// ============================================================================

/**
 * The complete enforcement system that governs the ledger.
 * This is the "constitution" of the system - the rules that cannot be broken.
 */
export interface EnforcementSystem {
  /** Cryptographic integrity */
  readonly hashChain: HashChain;
  
  /** Temporal ordering */
  readonly temporal: TemporalEnforcer;
  
  /** Domain invariants */
  readonly invariants: readonly InvariantRule[];
  
  /** Command validation */
  readonly commandValidator: CommandValidator;
  
  /** Guard evaluation */
  readonly guardEvaluator: GuardEvaluator;
  
  /**
   * The ultimate enforcement: append an event to the ledger.
   * This is the ONLY way to change state in the system.
   */
  appendEvent<T>(eventData: Omit<Event<T>, 'sequence' | 'hash' | 'previousHash'>): Promise<Event<T>>;
  
  /**
   * Reconstruct state at any point in time
   */
  reconstructAt(aggregateId: EntityId, atSequence: SequenceNumber): Promise<unknown>;
  
  /**
   * Verify the entire ledger integrity
   */
  verifyIntegrity(fromSequence?: SequenceNumber, toSequence?: SequenceNumber): Promise<ChainVerificationResult>;
}

