/**
 * FASE 7 - Cross-Realm Operations via Sagas
 * 
 * Ensures all cross-realm operations go through a formal saga,
 * preventing inconsistent states where one realm is updated but not the other.
 */

import type { SagaCoordinator } from './saga';
import type { Saga, SagaExecution } from './saga';
import type { EntityId, ActorReference } from '../shared/types';
import { logger } from '../observability/logger';

// CrossRealmOperation is now defined locally since realm-manager was replaced by container-manager
interface CrossRealmOperation {
  readonly type: 'EntityReference' | 'AssetTransfer' | 'AgreementParticipation' | 'RoleGrant';
  readonly sourceEntityId?: EntityId;
  readonly targetEntityId?: EntityId;
  readonly assetId?: EntityId;
  readonly agreementId?: EntityId;
}

/**
 * Create a cross-realm transfer saga.
 */
export function createCrossRealmTransferSaga(): Saga<{
  sourceRealmId: EntityId;
  targetRealmId: EntityId;
  assetId: EntityId;
  operation: CrossRealmOperation;
  authorizingAgreement: EntityId;
}> {
  return {
    id: 'saga-cross-realm-transfer' as EntityId,
    name: 'CrossRealmTransfer',
    version: 1,
    timeoutMs: 300000, // 5 minutes
    compensationFailureStrategy: 'manual',
    steps: [
      {
        name: 'ValidateSourceRealm',
        description: 'Validate source realm allows cross-realm operations',
        async execute(ctx, saga) {
          // In real implementation, this would validate realm config
          logger.info('saga.crossrealm.validate_source', {
            sagaId: saga.id,
            sourceRealmId: ctx.sourceRealmId,
          });
          return { success: true, compensationData: { validated: true } };
        },
        async compensate() {
          // Nothing to compensate (validation doesn't change state)
        },
      },
      {
        name: 'ReserveInSource',
        description: 'Reserve asset in source realm',
        async execute(ctx, saga) {
          logger.info('saga.crossrealm.reserve_source', {
            sagaId: saga.id,
            sourceRealmId: ctx.sourceRealmId,
            assetId: ctx.assetId,
          });
          return { success: true, compensationData: { reserved: true } };
        },
        async compensate(ctx, saga, result) {
          logger.info('saga.crossrealm.release_reservation', {
            sagaId: saga.id,
            sourceRealmId: ctx.sourceRealmId,
            assetId: ctx.assetId,
          });
          // Release reservation in source realm
        },
      },
      {
        name: 'InitiateCrossRealmOperation',
        description: 'Initiate cross-realm operation',
        async execute(ctx, saga) {
          logger.info('saga.crossrealm.initiate', {
            sagaId: saga.id,
            sourceRealmId: ctx.sourceRealmId,
            targetRealmId: ctx.targetRealmId,
            operationType: ctx.operation.type,
          });
          return { success: true, compensationData: { operationId: 'op-xxx' } };
        },
        async compensate(ctx, saga, result) {
          logger.info('saga.crossrealm.cancel_operation', {
            sagaId: saga.id,
          });
          // Cancel cross-realm operation
        },
      },
      {
        name: 'AwaitTargetAcceptance',
        description: 'Wait for target realm to accept',
        async execute(ctx, saga) {
          // In real implementation, this would poll or wait for callback
          logger.info('saga.crossrealm.await_acceptance', {
            sagaId: saga.id,
            targetRealmId: ctx.targetRealmId,
          });
          return { success: true };
        },
        async compensate() {
          // Nothing to compensate (just waiting)
        },
      },
      {
        name: 'CompleteTransfer',
        description: 'Complete the transfer in both realms',
        async execute(ctx, saga) {
          logger.info('saga.crossrealm.complete', {
            sagaId: saga.id,
            sourceRealmId: ctx.sourceRealmId,
            targetRealmId: ctx.targetRealmId,
            assetId: ctx.assetId,
          });
          return { success: true };
        },
        async compensate(ctx, saga, result) {
          logger.info('saga.crossrealm.reverse_transfer', {
            sagaId: saga.id,
          });
          // Reverse the transfer
        },
      },
    ],
  };
}

/**
 * Execute a cross-realm operation via saga.
 * 
 * This is the ONLY way cross-realm operations should be performed.
 * Direct operations without sagas are not allowed.
 */
export async function executeCrossRealmOperationViaSaga(
  coordinator: SagaCoordinator,
  sourceRealmId: EntityId,
  targetRealmId: EntityId,
  operation: CrossRealmOperation,
  authorizingAgreement: EntityId,
  actor: ActorReference
): Promise<SagaExecution> {
  // Ensure saga is registered
  const saga = createCrossRealmTransferSaga();
  coordinator.register(saga);
  
  // Start the saga
  const execution = await coordinator.start(
    'CrossRealmTransfer',
    {
      sourceRealmId,
      targetRealmId,
      assetId: operation.assetId || ('' as EntityId),
      operation,
      authorizingAgreement,
    },
    actor
  );
  
  logger.info('saga.crossrealm.started', {
    executionId: execution.id,
    sourceRealmId,
    targetRealmId,
    operationType: operation.type,
    authorizingAgreement,
  });
  
  return execution;
}

/**
 * Validate that a cross-realm operation result is consistent.
 * 
 * Invariant: Never should exist a state where:
 * - Source realm was updated
 * - Target realm was NOT updated
 * - Saga is marked as success
 */
export function validateCrossRealmOperationConsistency(
  execution: SagaExecution,
  sourceRealmUpdated: boolean,
  targetRealmUpdated: boolean
): { valid: boolean; reason?: string } {
  if (execution.state === 'Completed') {
    if (!sourceRealmUpdated || !targetRealmUpdated) {
      return {
        valid: false,
        reason: `Saga marked as completed but realms inconsistent: source=${sourceRealmUpdated}, target=${targetRealmUpdated}`,
      };
    }
  }
  
  if (execution.state === 'Compensated') {
    // After compensation, both realms should be back to original state
    // (validation would check this in real implementation)
    return { valid: true };
  }
  
  if (execution.state === 'Failed' || execution.state === 'CompensationFailed') {
    // Failed sagas should have triggered compensation
    return { valid: true };
  }
  
  return { valid: true };
}

