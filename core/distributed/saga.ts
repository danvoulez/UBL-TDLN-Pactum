/**
 * DISTRIBUTED - Sagas, Cross-Realm & Conflict Resolution
 * 
 * When operations span multiple aggregates or realms, we need:
 * 1. SAGAS - Coordinate multi-step transactions with compensation
 * 2. CROSS-REALM - How entities interact across boundaries
 * 3. CONFLICT RESOLUTION - Handle concurrent modifications
 */

import type { EntityId, Timestamp, ActorReference, AggregateType } from '../shared/types';
import type { Event } from '../schema/ledger';

// ============================================================================
// SAGAS - Distributed Transactions with Compensation
// ============================================================================

/**
 * A Saga coordinates a multi-step process across aggregates.
 * If any step fails, previous steps are COMPENSATED (undone).
 * 
 * Unlike database transactions, sagas are:
 * - Eventually consistent (not ACID)
 * - Use semantic compensation (not rollback)
 * - Recorded as events (auditable)
 * 
 * Example: "Hire Employee" saga
 * 1. Create Employment Agreement
 * 2. Grant Employee Role
 * 3. Provision System Access
 * 4. Create Onboarding Workflow
 * 
 * If step 3 fails:
 * - Revoke Employee Role (compensation for step 2)
 * - Terminate Agreement (compensation for step 1)
 */
export interface Saga<TContext = unknown> {
  readonly id: EntityId;
  readonly name: string;
  readonly version: number;
  
  /** The steps in order */
  readonly steps: readonly SagaStep<TContext>[];
  
  /** Timeout for the entire saga */
  readonly timeoutMs?: number;
  
  /** What to do if compensation fails */
  readonly compensationFailureStrategy: 'retry' | 'alert' | 'manual';
}

export interface SagaStep<TContext = unknown> {
  readonly name: string;
  readonly description?: string;
  
  /** Execute this step */
  execute(context: TContext, saga: SagaExecution): Promise<StepResult>;
  
  /** Compensate (undo) this step */
  compensate(context: TContext, saga: SagaExecution, result: StepResult): Promise<void>;
  
  /** Can this step be retried? */
  readonly retryable?: boolean;
  readonly maxRetries?: number;
  readonly retryDelayMs?: number;
}

export interface StepResult {
  readonly success: boolean;
  readonly data?: unknown;
  readonly error?: string;
  /** Data needed for compensation */
  readonly compensationData?: unknown;
}

/**
 * A running saga instance.
 */
export interface SagaExecution {
  readonly id: EntityId;
  readonly sagaId: EntityId;
  readonly sagaName: string;
  readonly startedAt: Timestamp;
  readonly startedBy: ActorReference;
  
  /** Current state */
  readonly state: SagaState;
  readonly currentStep: number;
  
  /** Results of completed steps */
  readonly stepResults: readonly StepResult[];
  
  /** If compensating, how far we've rolled back */
  readonly compensatedTo?: number;
  
  /** Timing */
  readonly completedAt?: Timestamp;
  readonly failedAt?: Timestamp;
  
  /** Error info */
  readonly error?: SagaError;
}

export type SagaState = 
  | 'Running'
  | 'Completed'
  | 'Failed'
  | 'Compensating'
  | 'Compensated'
  | 'CompensationFailed';

export interface SagaError {
  readonly step: number;
  readonly stepName: string;
  readonly message: string;
  readonly retryCount: number;
  readonly stack?: string;
}

/**
 * Saga coordinator manages saga executions.
 */
export interface SagaCoordinator {
  /** Register a saga definition */
  register<TContext>(saga: Saga<TContext>): void;
  
  /** Start a new saga */
  start<TContext>(
    sagaName: string,
    context: TContext,
    actor: ActorReference
  ): Promise<SagaExecution>;
  
  /** Get saga execution by ID */
  getExecution(executionId: EntityId): Promise<SagaExecution | null>;
  
  /** Get all executions for a saga */
  getExecutions(sagaName: string, state?: SagaState): Promise<readonly SagaExecution[]>;
  
  /** Manually trigger compensation */
  compensate(executionId: EntityId): Promise<SagaExecution>;
  
  /** Resume a paused/failed saga */
  resume(executionId: EntityId): Promise<SagaExecution>;
}

// ============================================================================
// CROSS-REALM OPERATIONS
// ============================================================================

/**
 * When entities need to interact across realms, we need explicit agreements.
 * 
 * Cross-realm scenarios:
 * - Tenant A sells asset to Tenant B
 * - System realm grants license to tenant realm
 * - Subsidiary realm reports to parent realm
 */
export interface CrossRealmOperation {
  readonly id: EntityId;
  readonly type: CrossRealmOperationType;
  
  /** Source realm */
  readonly sourceRealm: EntityId;
  readonly sourceEntity?: EntityId;
  
  /** Target realm */
  readonly targetRealm: EntityId;
  readonly targetEntity?: EntityId;
  
  /** The agreement authorizing this operation */
  readonly authorizingAgreement: EntityId;
  
  /** Current state */
  readonly state: CrossRealmState;
  
  /** The data being transferred/shared */
  readonly payload: unknown;
  
  /** Audit */
  readonly initiatedAt: Timestamp;
  readonly initiatedBy: ActorReference;
  readonly completedAt?: Timestamp;
}

export type CrossRealmOperationType =
  | 'AssetTransfer'     // Move asset between realms
  | 'EntityReference'   // Reference entity from another realm
  | 'AgreementJoint'    // Agreement spanning realms
  | 'DataShare'         // Share data view with another realm
  | 'RoleDelegation';   // Delegate role across realm boundary

export type CrossRealmState =
  | 'Pending'           // Initiated, awaiting target realm
  | 'TargetAccepted'    // Target realm accepted
  | 'TargetRejected'    // Target realm rejected
  | 'Completed'         // Successfully completed
  | 'Failed'            // Failed (error)
  | 'Cancelled';        // Cancelled by source

/**
 * Cross-realm gateway handles operations between realms.
 */
export interface CrossRealmGateway {
  /** Initiate a cross-realm operation */
  initiate(operation: Omit<CrossRealmOperation, 'id' | 'state' | 'initiatedAt'>): Promise<CrossRealmOperation>;
  
  /** Accept an incoming operation (as target realm) */
  accept(operationId: EntityId, actor: ActorReference): Promise<CrossRealmOperation>;
  
  /** Reject an incoming operation */
  reject(operationId: EntityId, reason: string, actor: ActorReference): Promise<CrossRealmOperation>;
  
  /** Get pending incoming operations for a realm */
  getPendingIncoming(realmId: EntityId): Promise<readonly CrossRealmOperation[]>;
  
  /** Get pending outgoing operations from a realm */
  getPendingOutgoing(realmId: EntityId): Promise<readonly CrossRealmOperation[]>;
}

/**
 * Cross-realm reference - a pointer to an entity in another realm.
 */
export interface CrossRealmReference {
  readonly realmId: EntityId;
  readonly entityType: string;
  readonly entityId: EntityId;
  
  /** The agreement that grants visibility */
  readonly grantedBy: EntityId;
  
  /** What level of access */
  readonly accessLevel: 'view' | 'interact' | 'full';
  
  /** Cached summary (for display without cross-realm call) */
  readonly cachedSummary?: {
    readonly name: string;
    readonly status?: string;
    readonly cachedAt: Timestamp;
  };
}

// ============================================================================
// CONFLICT RESOLUTION
// ============================================================================

/**
 * Conflicts occur when:
 * 1. Two actors modify the same aggregate concurrently
 * 2. A saga compensates while another operation is in progress
 * 3. Offline clients sync stale changes
 */
export interface Conflict {
  readonly id: EntityId;
  readonly type: ConflictType;
  readonly detectedAt: Timestamp;
  
  /** What aggregate is affected */
  readonly aggregateType: AggregateType;
  readonly aggregateId: EntityId;
  readonly aggregateVersion: number;
  
  /** The conflicting events */
  readonly existingEvent: Event;
  readonly incomingEvent: Event;
  
  /** Resolution status */
  readonly status: ConflictStatus;
  readonly resolution?: ConflictResolution;
}

export type ConflictType =
  | 'OptimisticConcurrency'  // Version mismatch
  | 'BranchMerge'            // Offline/online merge
  | 'SagaCompensation'       // Saga vs concurrent operation
  | 'CrossRealm';            // Cross-realm sync conflict

export type ConflictStatus =
  | 'Detected'
  | 'AutoResolved'
  | 'ManualResolved'
  | 'Rejected';

export interface ConflictResolution {
  readonly strategy: ResolutionStrategy;
  readonly resolvedAt: Timestamp;
  readonly resolvedBy: ActorReference;
  readonly resultingEvent?: Event;
  readonly explanation?: string;
}

export type ResolutionStrategy =
  | 'LastWriteWins'       // Most recent timestamp wins
  | 'FirstWriteWins'      // Original event preserved
  | 'Merge'               // Combine both changes
  | 'ManualReview'        // Human decides
  | 'CustomLogic';        // Domain-specific resolver

/**
 * Conflict resolver handles conflicts based on type and domain rules.
 */
export interface ConflictResolver {
  /** Register a resolution strategy for a conflict type */
  register(
    conflictType: ConflictType,
    aggregateType: AggregateType,
    resolver: ConflictResolverFn
  ): void;
  
  /** Attempt to resolve a conflict */
  resolve(conflict: Conflict): Promise<ConflictResolution>;
  
  /** Get unresolved conflicts */
  getUnresolved(): Promise<readonly Conflict[]>;
  
  /** Manually resolve a conflict */
  manualResolve(
    conflictId: EntityId,
    resolution: Omit<ConflictResolution, 'resolvedAt'>
  ): Promise<Conflict>;
}

export type ConflictResolverFn = (conflict: Conflict) => Promise<ConflictResolution | null>;

// ============================================================================
// EXAMPLE SAGAS
// ============================================================================

/**
 * Example: Hire Employee Saga
 */
export const HIRE_EMPLOYEE_SAGA: Saga<{
  employerId: EntityId;
  employeeId: EntityId;
  terms: unknown;
}> = {
  id: 'saga-hire-employee' as EntityId,
  name: 'HireEmployee',
  version: 1,
  timeoutMs: 60000,
  compensationFailureStrategy: 'alert',
  
  steps: [
    {
      name: 'CreateAgreement',
      description: 'Create the employment agreement',
      async execute(ctx, saga) {
        // Create Agreement
        return { success: true, compensationData: { agreementId: 'agr-xxx' } };
      },
      async compensate(ctx, saga, result) {
        // Terminate/void the agreement
        const { agreementId } = result.compensationData as any;
        // await terminateAgreement(agreementId, 'Saga compensation');
      },
    },
    {
      name: 'GrantRole',
      description: 'Grant the Employee role',
      async execute(ctx, saga) {
        // Grant Role
        return { success: true, compensationData: { roleId: 'rol-xxx' } };
      },
      async compensate(ctx, saga, result) {
        // Revoke the role
        const { roleId } = result.compensationData as any;
        // await revokeRole(roleId, 'Saga compensation');
      },
    },
    {
      name: 'ProvisionAccess',
      description: 'Create system access credentials',
      retryable: true,
      maxRetries: 3,
      retryDelayMs: 1000,
      async execute(ctx, saga) {
        // Create access
        return { success: true, compensationData: { accessId: 'acc-xxx' } };
      },
      async compensate(ctx, saga, result) {
        // Revoke access
        const { accessId } = result.compensationData as any;
        // await revokeAccess(accessId);
      },
    },
    {
      name: 'StartOnboarding',
      description: 'Create onboarding workflow',
      async execute(ctx, saga) {
        // Start onboarding flow
        return { success: true };
      },
      async compensate(ctx, saga, result) {
        // Cancel onboarding (or just let it die)
      },
    },
  ],
};

/**
 * Example: Cross-Realm Asset Sale
 */
export const CROSS_REALM_SALE_SAGA: Saga<{
  sellerRealmId: EntityId;
  buyerRealmId: EntityId;
  assetId: EntityId;
  price: number;
}> = {
  id: 'saga-cross-realm-sale' as EntityId,
  name: 'CrossRealmSale',
  version: 1,
  timeoutMs: 300000, // 5 minutes for cross-realm
  compensationFailureStrategy: 'manual',
  
  steps: [
    {
      name: 'ReserveAsset',
      description: 'Reserve asset in seller realm',
      async execute(ctx) {
        return { success: true, compensationData: { reservationId: 'res-xxx' } };
      },
      async compensate(ctx, saga, result) {
        // Release reservation
      },
    },
    {
      name: 'InitiateCrossRealm',
      description: 'Start cross-realm transfer',
      async execute(ctx) {
        return { success: true, compensationData: { operationId: 'xr-xxx' } };
      },
      async compensate(ctx, saga, result) {
        // Cancel cross-realm operation
      },
    },
    {
      name: 'AwaitBuyerAcceptance',
      description: 'Wait for buyer realm to accept',
      async execute(ctx) {
        // Poll or use callback
        return { success: true };
      },
      async compensate(ctx, saga, result) {
        // Nothing to compensate (just waiting)
      },
    },
    {
      name: 'TransferOwnership',
      description: 'Complete the ownership transfer',
      async execute(ctx) {
        return { success: true };
      },
      async compensate(ctx, saga, result) {
        // Reverse transfer
      },
    },
  ],
};

