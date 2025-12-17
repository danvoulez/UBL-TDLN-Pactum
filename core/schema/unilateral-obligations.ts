/**
 * UNILATERAL OBLIGATIONS
 * 
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                                                                             │
 * │   "An Agreement requires consent. An Obligation requires only will."        │
 * │                                                                             │
 * │   Scripts can declare obligations unilaterally - promises they make         │
 * │   without requiring the other party to agree first.                         │
 * │                                                                             │
 * │   This captures:                                                            │
 * │   - The stimulus that triggered the decision                                │
 * │   - The reasoning process                                                   │
 * │   - The commitment made                                                     │
 * │   - The fulfillment or abandonment                                          │
 * │                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import type { EntityId, Timestamp } from '../shared/types';
import { asEntityId } from '../shared/types';
import type { Event } from './ledger';

// =============================================================================
// EXTERNAL STIMULUS - What triggered the decision
// =============================================================================

/**
 * Source of external stimulus
 */
export type StimulusSource = 
  | 'Watcher'           // From a watcher trigger
  | 'DirectMessage'     // Someone messaged the agent
  | 'APICall'           // External API notification
  | 'Schedule'          // Scheduled event
  | 'ChainReaction'     // Another obligation triggered this
  | 'Manual';           // Guardian or agent manually initiated

/**
 * External stimulus that triggered agent reasoning
 */
export interface ExternalStimulus {
  readonly id: EntityId;
  readonly source: StimulusSource;
  readonly receivedAt: Timestamp;
  
  /** Raw content of the stimulus */
  readonly content: string;
  
  /** Structured data if available */
  readonly data?: Record<string, unknown>;
  
  /** Source reference (watcher ID, message ID, etc.) */
  readonly sourceRef?: EntityId;
  
  /** Platform/channel if applicable */
  readonly platform?: string;
}

// =============================================================================
// AGENT REASONING - The decision process
// =============================================================================

/**
 * Captures the agent's reasoning process
 * This is the "why" behind the obligation
 */
export interface AgentReasoning {
  readonly id: EntityId;
  readonly agentId: EntityId;
  readonly stimulusId: EntityId;
  readonly reasonedAt: Timestamp;
  
  /** The prompt/context given to the LLM */
  readonly context: string;
  
  /** The LLM's reasoning output */
  readonly reasoning: string;
  
  /** Structured decision */
  readonly decision: {
    readonly action: 'CreateObligation' | 'Ignore' | 'Defer' | 'Escalate';
    readonly confidence: number; // 0-1
    readonly alternatives?: string[];
  };
  
  /** Execution details */
  readonly execution: {
    readonly provider: string;
    readonly model: string;
    readonly tokens: number;
    readonly cost: number;
    readonly durationMs: number;
  };
}

// =============================================================================
// UNILATERAL OBLIGATION - The commitment
// =============================================================================

/**
 * Type of obligation
 */
export type ObligationType =
  | 'Deliver'       // Deliver something (work, asset, information)
  | 'Pay'           // Pay credits
  | 'Notify'        // Notify someone of something
  | 'Attend'        // Be present/available at a time
  | 'Refrain'       // Not do something
  | 'Custom';       // Custom obligation type

/**
 * Status of the obligation
 */
export type ObligationStatus =
  | 'Declared'      // Just declared, not yet acted upon
  | 'InProgress'    // Being worked on
  | 'Fulfilled'     // Successfully completed
  | 'Abandoned'     // Gave up (with reason)
  | 'Expired'       // Deadline passed without fulfillment
  | 'Disputed';     // Beneficiary disputes fulfillment

/**
 * A unilateral obligation - a promise made without requiring consent
 */
export interface UnilateralObligation {
  readonly id: EntityId;
  readonly realmId: EntityId;
  
  /** Who is making the promise */
  readonly obligorId: EntityId;
  
  /** Who benefits from the promise (may be unknown/general) */
  readonly beneficiaryId?: EntityId;
  
  /** Type of obligation */
  readonly obligationType: ObligationType;
  
  /** Human-readable description */
  readonly description: string;
  
  /** Structured terms */
  readonly terms: {
    /** What exactly is promised */
    readonly deliverable: string;
    
    /** When it should be fulfilled */
    readonly deadline?: Timestamp;
    
    /** Any conditions */
    readonly conditions?: string[];
    
    /** Quantity if applicable */
    readonly quantity?: {
      readonly amount: number;
      readonly unit: string;
    };
  };
  
  /** Link to the reasoning that created this */
  readonly reasoningId: EntityId;
  
  /** Link to the stimulus that triggered this */
  readonly stimulusId: EntityId;
  
  /** Current status */
  readonly status: ObligationStatus;
  
  /** Fulfillment details (when fulfilled) */
  readonly fulfillment?: {
    readonly fulfilledAt: Timestamp;
    readonly evidence?: string;
    readonly deliveredAssetId?: EntityId;
  };
  
  /** Abandonment details (when abandoned) */
  readonly abandonment?: {
    readonly abandonedAt: Timestamp;
    readonly reason: string;
    readonly compensationOffered?: string;
  };
  
  /** Aggregate version */
  readonly version: number;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

// =============================================================================
// EVENTS
// =============================================================================

export interface StimulusReceived extends Event {
  readonly type: 'StimulusReceived';
  readonly payload: {
    readonly type: 'StimulusReceived';
    readonly source: StimulusSource;
    readonly content: string;
    readonly data?: Record<string, unknown>;
    readonly sourceRef?: EntityId;
    readonly platform?: string;
  };
}

export interface ReasoningCompleted extends Event {
  readonly type: 'ReasoningCompleted';
  readonly payload: {
    readonly type: 'ReasoningCompleted';
    readonly agentId: EntityId;
    readonly stimulusId: EntityId;
    readonly reasoning: string;
    readonly decision: AgentReasoning['decision'];
    readonly execution: AgentReasoning['execution'];
  };
}

export interface ObligationDeclared extends Event {
  readonly type: 'ObligationDeclared';
  readonly payload: {
    readonly type: 'ObligationDeclared';
    readonly obligorId: EntityId;
    readonly beneficiaryId?: EntityId;
    readonly obligationType: ObligationType;
    readonly description: string;
    readonly terms: UnilateralObligation['terms'];
    readonly reasoningId: EntityId;
    readonly stimulusId: EntityId;
  };
}

export interface ObligationFulfilled extends Event {
  readonly type: 'ObligationFulfilled';
  readonly payload: {
    readonly type: 'ObligationFulfilled';
    readonly obligationId: EntityId;
    readonly evidence?: string;
    readonly deliveredAssetId?: EntityId;
  };
}

export interface ObligationAbandoned extends Event {
  readonly type: 'ObligationAbandoned';
  readonly payload: {
    readonly type: 'ObligationAbandoned';
    readonly obligationId: EntityId;
    readonly reason: string;
    readonly compensationOffered?: string;
  };
}

export interface ObligationDisputed extends Event {
  readonly type: 'ObligationDisputed';
  readonly payload: {
    readonly type: 'ObligationDisputed';
    readonly obligationId: EntityId;
    readonly disputedBy: EntityId;
    readonly reason: string;
  };
}

// =============================================================================
// AGGREGATE
// =============================================================================

export type UnilateralObligationEvent =
  | ObligationDeclared
  | ObligationFulfilled
  | ObligationAbandoned
  | ObligationDisputed;

/**
 * Reconstruct obligation state from events
 */
export function applyObligationEvent(
  state: UnilateralObligation | null,
  event: UnilateralObligationEvent,
  realmId: EntityId
): UnilateralObligation {
  switch (event.type) {
    case 'ObligationDeclared':
      return {
        id: asEntityId(event.aggregateId as string),
        realmId,
        obligorId: event.payload.obligorId,
        beneficiaryId: event.payload.beneficiaryId,
        obligationType: event.payload.obligationType,
        description: event.payload.description,
        terms: event.payload.terms,
        reasoningId: event.payload.reasoningId,
        stimulusId: event.payload.stimulusId,
        status: 'Declared',
        version: 1,
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      };
      
    case 'ObligationFulfilled':
      if (!state) throw new Error('Cannot fulfill non-existent obligation');
      return {
        ...state,
        status: 'Fulfilled',
        fulfillment: {
          fulfilledAt: event.timestamp,
          evidence: event.payload.evidence,
          deliveredAssetId: event.payload.deliveredAssetId,
        },
        version: state.version + 1,
        updatedAt: event.timestamp,
      };
      
    case 'ObligationAbandoned':
      if (!state) throw new Error('Cannot abandon non-existent obligation');
      return {
        ...state,
        status: 'Abandoned',
        abandonment: {
          abandonedAt: event.timestamp,
          reason: event.payload.reason,
          compensationOffered: event.payload.compensationOffered,
        },
        version: state.version + 1,
        updatedAt: event.timestamp,
      };
      
    case 'ObligationDisputed':
      if (!state) throw new Error('Cannot dispute non-existent obligation');
      return {
        ...state,
        status: 'Disputed',
        version: state.version + 1,
        updatedAt: event.timestamp,
      };
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if obligation can be fulfilled
 */
export function canFulfill(obligation: UnilateralObligation): boolean {
  return obligation.status === 'Declared' || obligation.status === 'InProgress';
}

/**
 * Check if obligation can be abandoned
 */
export function canAbandon(obligation: UnilateralObligation): boolean {
  return obligation.status === 'Declared' || obligation.status === 'InProgress';
}

/**
 * Check if obligation is past deadline
 */
export function isPastDeadline(obligation: UnilateralObligation, now: Timestamp): boolean {
  if (!obligation.terms.deadline) return false;
  return now > obligation.terms.deadline;
}

/**
 * Check if obligation is active (not terminal state)
 */
export function isActive(obligation: UnilateralObligation): boolean {
  return obligation.status === 'Declared' || obligation.status === 'InProgress';
}
