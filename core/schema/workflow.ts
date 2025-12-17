/**
 * WORKFLOW & FLOW - State Machines for Business Processes
 * 
 * Workflows define the valid state transitions for entities.
 * Flows orchestrate multiple workflows and coordinate complex processes.
 */

import type { 
  EntityId, 
  Timestamp, 
  ActorReference, 
  AggregateType,
  AgreementStatus,
  AssetStatus 
} from './ledger';

// ============================================================================
// WORKFLOW - State Machine Definition
// ============================================================================

/**
 * A Workflow defines valid state transitions for an aggregate.
 * It acts as a state machine that governs how entities can change.
 */
export interface WorkflowDefinition {
  readonly id: EntityId;
  readonly name: string;
  readonly version: number;
  
  /** What aggregate type this workflow governs */
  readonly targetType: AggregateType;
  
  /** The possible states */
  readonly states: readonly WorkflowState[];
  
  /** Valid transitions between states */
  readonly transitions: readonly WorkflowTransition[];
  
  /** Initial state for new instances */
  readonly initialState: string;
  
  /** Terminal states (workflow complete) */
  readonly terminalStates: readonly string[];
}

export interface WorkflowState {
  readonly name: string;
  readonly description?: string;
  
  /** Actions that must be performed on entering this state */
  readonly onEnter?: readonly WorkflowAction[];
  
  /** Actions that must be performed on leaving this state */
  readonly onExit?: readonly WorkflowAction[];
  
  /** Time limits for staying in this state */
  readonly timeout?: {
    readonly duration: number; // milliseconds
    readonly action: 'AutoTransition' | 'Escalate' | 'Expire';
    readonly targetState?: string;
  };
}

export interface WorkflowTransition {
  readonly name: string;
  readonly from: string | readonly string[]; // Can transition from multiple states
  readonly to: string;
  
  /** Who can trigger this transition */
  readonly allowedActors: readonly ActorConstraint[];
  
  /** Conditions that must be true for this transition */
  readonly guards: readonly TransitionGuard[];
  
  /** Actions to perform during transition */
  readonly actions?: readonly WorkflowAction[];
  
  /** Events to emit on successful transition */
  readonly emits?: readonly string[];
}

export type ActorConstraint = 
  | { readonly type: 'Role'; readonly roleType: string }
  | { readonly type: 'Party'; readonly partyId: EntityId }
  | { readonly type: 'System' }
  | { readonly type: 'AgreementParty'; readonly role: string }
  | { readonly type: 'Self' }; // The entity itself

export interface TransitionGuard {
  readonly name: string;
  readonly condition: GuardCondition;
  readonly errorMessage: string;
}

export type GuardCondition = 
  | { readonly type: 'HasRole'; readonly roleType: string }
  | { readonly type: 'HasConsent'; readonly fromAll: boolean }
  | { readonly type: 'TimeElapsed'; readonly since: string; readonly duration: number }
  | { readonly type: 'AssetInStatus'; readonly status: AssetStatus }
  | { readonly type: 'AgreementInStatus'; readonly status: AgreementStatus }
  | { readonly type: 'Custom'; readonly validatorId: string; readonly params?: Record<string, unknown> };

export type WorkflowAction = 
  | { readonly type: 'EmitEvent'; readonly eventType: string; readonly payload: Record<string, unknown> }
  | { readonly type: 'NotifyParty'; readonly partyId: EntityId; readonly template: string }
  | { readonly type: 'TriggerWorkflow'; readonly workflowId: EntityId; readonly input: Record<string, unknown> }
  | { readonly type: 'UpdateAggregate'; readonly updates: Record<string, unknown> }
  | { readonly type: 'Custom'; readonly handlerId: string; readonly params?: Record<string, unknown> };

// ============================================================================
// WORKFLOW INSTANCE - Runtime State
// ============================================================================

export interface WorkflowInstance {
  readonly id: EntityId;
  readonly definitionId: EntityId;
  readonly definitionVersion: number;
  readonly createdAt: Timestamp;
  readonly version: number;
  
  /** The aggregate this workflow instance is tracking */
  readonly targetAggregate: {
    readonly type: AggregateType;
    readonly id: EntityId;
  };
  
  /** Current state in the workflow */
  readonly currentState: string;
  
  /** History of state transitions */
  readonly history: readonly WorkflowHistoryEntry[];
  
  /** Is this workflow instance complete? */
  readonly isComplete: boolean;
  readonly completedAt?: Timestamp;
  
  /** Workflow-level data/context */
  readonly context: Record<string, unknown>;
}

export interface WorkflowHistoryEntry {
  readonly timestamp: Timestamp;
  readonly transition: string;
  readonly fromState: string;
  readonly toState: string;
  readonly actor: ActorReference;
  readonly eventId: EntityId; // The event that caused this transition
}

// Workflow Events
export interface WorkflowInstanceCreated {
  readonly type: 'WorkflowInstanceCreated';
  readonly definitionId: EntityId;
  readonly definitionVersion: number;
  readonly targetAggregate: { type: AggregateType; id: EntityId };
  readonly initialState: string;
  readonly context: Record<string, unknown>;
}

export interface WorkflowTransitioned {
  readonly type: 'WorkflowTransitioned';
  readonly transition: string;
  readonly fromState: string;
  readonly toState: string;
  readonly triggeredBy: EntityId; // Event or Command ID
}

export interface WorkflowCompleted {
  readonly type: 'WorkflowCompleted';
  readonly finalState: string;
  readonly outcome: 'Success' | 'Failure' | 'Cancelled';
  readonly summary?: string;
}

// ============================================================================
// FLOW - Process Orchestration
// ============================================================================

/**
 * A Flow coordinates multiple workflows and handles complex business processes.
 * It's the conductor that orchestrates the symphony of state machines.
 */
export interface FlowDefinition {
  readonly id: EntityId;
  readonly name: string;
  readonly version: number;
  readonly description?: string;
  
  /** The steps in this flow */
  readonly steps: readonly FlowStep[];
  
  /** Entry point */
  readonly startStep: string;
  
  /** Exit points */
  readonly endSteps: readonly string[];
  
  /** Variables available throughout the flow */
  readonly variables: readonly {
    readonly name: string;
    readonly type: string;
    readonly required: boolean;
    readonly defaultValue?: unknown;
  }[];
  
  /** Error handling */
  readonly errorHandlers?: readonly FlowErrorHandler[];
}

export type FlowStep = 
  | FlowWorkflowStep
  | FlowDecisionStep
  | FlowParallelStep
  | FlowWaitStep
  | FlowActionStep;

export interface FlowStepBase {
  readonly id: string;
  readonly name: string;
  readonly next?: string | readonly FlowBranch[];
}

export interface FlowWorkflowStep extends FlowStepBase {
  readonly type: 'Workflow';
  readonly workflowDefinitionId: EntityId;
  readonly input: Record<string, unknown>;
  readonly outputMapping?: Record<string, string>;
}

export interface FlowDecisionStep extends FlowStepBase {
  readonly type: 'Decision';
  readonly branches: readonly FlowBranch[];
  readonly default?: string;
}

export interface FlowBranch {
  readonly condition: GuardCondition;
  readonly target: string;
}

export interface FlowParallelStep extends FlowStepBase {
  readonly type: 'Parallel';
  readonly branches: readonly string[];
  readonly joinType: 'All' | 'Any' | 'First';
}

export interface FlowWaitStep extends FlowStepBase {
  readonly type: 'Wait';
  readonly waitFor: 
    | { readonly type: 'Duration'; readonly duration: number }
    | { readonly type: 'Event'; readonly eventType: string; readonly filter?: Record<string, unknown> }
    | { readonly type: 'Condition'; readonly condition: GuardCondition };
}

export interface FlowActionStep extends FlowStepBase {
  readonly type: 'Action';
  readonly actions: readonly WorkflowAction[];
}

export interface FlowErrorHandler {
  readonly errorType: string;
  readonly strategy: 'Retry' | 'Compensate' | 'Skip' | 'Fail';
  readonly maxRetries?: number;
  readonly compensationStep?: string;
}

// ============================================================================
// FLOW INSTANCE - Runtime Orchestration State
// ============================================================================

export interface FlowInstance {
  readonly id: EntityId;
  readonly definitionId: EntityId;
  readonly definitionVersion: number;
  readonly createdAt: Timestamp;
  readonly version: number;
  
  /** Current execution state */
  readonly status: 'Running' | 'Waiting' | 'Completed' | 'Failed' | 'Cancelled';
  
  /** Current step(s) - can be multiple for parallel execution */
  readonly currentSteps: readonly string[];
  
  /** Active workflow instances spawned by this flow */
  readonly activeWorkflows: readonly EntityId[];
  
  /** Flow variables */
  readonly variables: Record<string, unknown>;
  
  /** Execution history */
  readonly history: readonly FlowHistoryEntry[];
}

export interface FlowHistoryEntry {
  readonly timestamp: Timestamp;
  readonly stepId: string;
  readonly action: 'Enter' | 'Exit' | 'Skip' | 'Error';
  readonly details?: Record<string, unknown>;
}

// Flow Events
export interface FlowInstanceCreated {
  readonly type: 'FlowInstanceCreated';
  readonly definitionId: EntityId;
  readonly definitionVersion: number;
  readonly initialVariables: Record<string, unknown>;
}

export interface FlowStepExecuted {
  readonly type: 'FlowStepExecuted';
  readonly stepId: string;
  readonly action: 'Enter' | 'Exit' | 'Skip' | 'Error';
  readonly result?: Record<string, unknown>;
}

export interface FlowCompleted {
  readonly type: 'FlowCompleted';
  readonly outcome: 'Success' | 'Failure' | 'Cancelled';
  readonly finalVariables: Record<string, unknown>;
}

export type WorkflowEvent = WorkflowInstanceCreated | WorkflowTransitioned | WorkflowCompleted;
export type FlowEvent = FlowInstanceCreated | FlowStepExecuted | FlowCompleted;

