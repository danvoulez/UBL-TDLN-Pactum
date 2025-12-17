/**
 * FASE 7 - SAGA COORDINATOR WITH PERSISTENCE & RECOVERY
 * 
 * Ensures sagas are:
 * - Persisted to event store (single source of truth)
 * - Recoverable after process restart
 * - Compensatable in case of failure
 * - Logged with structured logs
 */

import type { Pool } from 'pg';
import type { EventStore, EventInput } from '../store/event-store';
import type {
  Saga,
  SagaExecution,
  SagaState,
  SagaStep,
  StepResult,
  SagaError,
  SagaCoordinator,
} from './saga';
import type { EntityId, Timestamp, ActorReference } from '../shared/types';
import { generateId } from '../shared/types';
import { logger } from '../observability/logger';

export interface SagaCoordinatorConfig {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** Event store for persisting saga state */
  eventStore: EventStore;
}

/**
 * Create a saga coordinator with persistence and recovery.
 */
export function createPersistentSagaCoordinator(
  config: SagaCoordinatorConfig
): SagaCoordinator & {
  /**
   * Advance a saga to the next step.
   */
  advance(executionId: EntityId): Promise<SagaExecution>;
  
  /**
   * Recover pending sagas (call on startup).
   */
  recoverPendingSagas(): Promise<void>;
} {
  const { pool, eventStore } = config;
  
  // Registry of saga definitions
  const sagaRegistry = new Map<string, Saga<unknown>>();
  
  // In-memory cache of executions (in production, load from event store)
  const executionCache = new Map<EntityId, SagaExecution>();

  /**
   * Ensure the saga_executions table exists.
   */
  async function ensureTable(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS saga_executions (
        id TEXT PRIMARY KEY,
        saga_id TEXT NOT NULL,
        saga_name TEXT NOT NULL,
        started_at BIGINT NOT NULL,
        started_by_type TEXT NOT NULL,
        started_by_id TEXT,
        state TEXT NOT NULL,
        current_step INTEGER NOT NULL DEFAULT 0,
        step_results JSONB,
        compensated_to INTEGER,
        completed_at BIGINT,
        failed_at BIGINT,
        error_step INTEGER,
        error_step_name TEXT,
        error_message TEXT,
        error_retry_count INTEGER,
        error_stack TEXT,
        context JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_saga_executions_state 
        ON saga_executions(state);
      CREATE INDEX IF NOT EXISTS idx_saga_executions_saga_name 
        ON saga_executions(saga_name);
      CREATE INDEX IF NOT EXISTS idx_saga_executions_started_at 
        ON saga_executions(started_at);
    `);
  }

  // Initialize table
  ensureTable().catch(err => {
    logger.error('saga.coordinator.init_error', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  /**
   * Persist saga execution to database.
   */
  async function persistExecution(execution: SagaExecution): Promise<void> {
    await pool.query(`
      INSERT INTO saga_executions (
        id, saga_id, saga_name, started_at, started_by_type, started_by_id,
        state, current_step, step_results, compensated_to,
        completed_at, failed_at, error_step, error_step_name,
        error_message, error_retry_count, error_stack, context, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
      ON CONFLICT (id) DO UPDATE SET
        state = EXCLUDED.state,
        current_step = EXCLUDED.current_step,
        step_results = EXCLUDED.step_results,
        compensated_to = EXCLUDED.compensated_to,
        completed_at = EXCLUDED.completed_at,
        failed_at = EXCLUDED.failed_at,
        error_step = EXCLUDED.error_step,
        error_step_name = EXCLUDED.error_step_name,
        error_message = EXCLUDED.error_message,
        error_retry_count = EXCLUDED.error_retry_count,
        error_stack = EXCLUDED.error_stack,
        updated_at = NOW()
    `, [
      execution.id,
      execution.sagaId,
      execution.sagaName,
      execution.startedAt,
      execution.startedBy.type,
      execution.startedBy.type === 'User' ? execution.startedBy.userId :
      execution.startedBy.type === 'System' ? execution.startedBy.systemId :
      execution.startedBy.type === 'Agent' ? execution.startedBy.agentId : null,
      execution.state,
      execution.currentStep,
      JSON.stringify(execution.stepResults),
      execution.compensatedTo ?? null,
      execution.completedAt ?? null,
      execution.failedAt ?? null,
      execution.error?.step ?? null,
      execution.error?.stepName ?? null,
      execution.error?.message ?? null,
      execution.error?.retryCount ?? null,
      execution.error?.stack ?? null,
      JSON.stringify({}), // context would be stored here
    ]);
    
    // Also emit event to event store
    const eventInput: EventInput = {
      type: 'SagaStateChanged',
      aggregateId: execution.id,
      aggregateType: 'SagaExecution',
      aggregateVersion: 1,
      payload: {
        sagaId: execution.sagaId,
        sagaName: execution.sagaName,
        state: execution.state,
        currentStep: execution.currentStep,
      },
      actor: execution.startedBy,
      timestamp: Date.now(),
    };
    
    await eventStore.append(eventInput);
  }

  /**
   * Load saga execution from database.
   */
  async function loadExecution(executionId: EntityId): Promise<SagaExecution | null> {
    // Check cache first
    if (executionCache.has(executionId)) {
      return executionCache.get(executionId)!;
    }
    
    const result = await pool.query(
      'SELECT * FROM saga_executions WHERE id = $1',
      [executionId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    const execution: SagaExecution = {
      id: row.id,
      sagaId: row.saga_id,
      sagaName: row.saga_name,
      startedAt: Number(row.started_at),
      startedBy: {
        type: row.started_by_type as 'System' | 'User' | 'Agent',
        ...(row.started_by_type === 'User' ? { userId: row.started_by_id } :
            row.started_by_type === 'System' ? { systemId: row.started_by_id } :
            row.started_by_type === 'Agent' ? { agentId: row.started_by_id } : {}),
      },
      state: row.state as SagaState,
      currentStep: row.current_step,
      stepResults: row.step_results ? JSON.parse(row.step_results) : [],
      compensatedTo: row.compensated_to ?? undefined,
      completedAt: row.completed_at ? Number(row.completed_at) : undefined,
      failedAt: row.failed_at ? Number(row.failed_at) : undefined,
      error: row.error_message ? {
        step: row.error_step,
        stepName: row.error_step_name,
        message: row.error_message,
        retryCount: row.error_retry_count ?? 0,
        stack: row.error_stack,
      } : undefined,
    };
    
    executionCache.set(executionId, execution);
    return execution;
  }

  /**
   * Register a saga definition.
   */
  function register<TContext>(saga: Saga<TContext>): void {
    sagaRegistry.set(saga.name, saga as Saga<unknown>);
    logger.info('saga.registered', {
      sagaId: saga.id,
      sagaName: saga.name,
      version: saga.version,
      stepsCount: saga.steps.length,
    });
  }

  /**
   * Start a new saga execution.
   */
  async function start<TContext>(
    sagaName: string,
    context: TContext,
    actor: ActorReference
  ): Promise<SagaExecution> {
    const saga = sagaRegistry.get(sagaName);
    if (!saga) {
      throw new Error(`Saga ${sagaName} not registered`);
    }
    
    const execution: SagaExecution = {
      id: generateId(),
      sagaId: saga.id,
      sagaName: saga.name,
      startedAt: Date.now(),
      startedBy: actor,
      state: 'Running',
      currentStep: 0,
      stepResults: [],
    };
    
    await persistExecution(execution);
    
    logger.info('saga.start', {
      sagaId: execution.sagaId,
      executionId: execution.id,
      sagaName: execution.sagaName,
      actorType: actor.type,
    });
    
    // Automatically advance to first step
    return await advance(execution.id);
  }

  /**
   * Advance a saga to the next step.
   */
  async function advance(executionId: EntityId): Promise<SagaExecution> {
    const execution = await loadExecution(executionId);
    if (!execution) {
      throw new Error(`Saga execution ${executionId} not found`);
    }
    
    if (execution.state !== 'Running') {
      throw new Error(`Saga execution ${executionId} is not in Running state`);
    }
    
    const saga = sagaRegistry.get(execution.sagaName);
    if (!saga) {
      throw new Error(`Saga ${execution.sagaName} not registered`);
    }
    
    if (execution.currentStep >= saga.steps.length) {
      // All steps completed
      const completed: SagaExecution = {
        ...execution,
        state: 'Completed',
        completedAt: Date.now(),
      };
      await persistExecution(completed);
      
      logger.info('saga.completed', {
        sagaId: execution.sagaId,
        executionId: execution.id,
        sagaName: execution.sagaName,
      });
      
      return completed;
    }
    
    const step = saga.steps[execution.currentStep];
    
    logger.info('saga.step.start', {
      sagaId: execution.sagaId,
      executionId: execution.id,
      sagaName: execution.sagaName,
      stepName: step.name,
      stepIndex: execution.currentStep,
    });
    
    try {
      // Execute the step
      const result = await step.execute({} as any, execution);
      
      const updated: SagaExecution = {
        ...execution,
        currentStep: execution.currentStep + 1,
        stepResults: [...execution.stepResults, result],
      };
      
      await persistExecution(updated);
      
      logger.info('saga.step.success', {
        sagaId: execution.sagaId,
        executionId: execution.id,
        sagaName: execution.sagaName,
        stepName: step.name,
        stepIndex: execution.currentStep,
      });
      
      // Continue to next step if successful
      if (result.success) {
        return await advance(executionId);
      } else {
        // Step failed, trigger compensation
        return await compensate(executionId);
      }
    } catch (error) {
      const sagaError: SagaError = {
        step: execution.currentStep,
        stepName: step.name,
        message: error instanceof Error ? error.message : String(error),
        retryCount: 0,
        stack: error instanceof Error ? error.stack : undefined,
      };
      
      const failed: SagaExecution = {
        ...execution,
        state: 'Failed',
        failedAt: Date.now(),
        error: sagaError,
      };
      
      await persistExecution(failed);
      
      logger.error('saga.step.error', {
        sagaId: execution.sagaId,
        executionId: execution.id,
        sagaName: execution.sagaName,
        stepName: step.name,
        stepIndex: execution.currentStep,
        error: sagaError.message,
      });
      
      // Trigger compensation
      return await compensate(executionId);
    }
  }

  /**
   * Compensate a failed saga.
   */
  async function compensate(executionId: EntityId): Promise<SagaExecution> {
    const execution = await loadExecution(executionId);
    if (!execution) {
      throw new Error(`Saga execution ${executionId} not found`);
    }
    
    const saga = sagaRegistry.get(execution.sagaName);
    if (!saga) {
      throw new Error(`Saga ${execution.sagaName} not registered`);
    }
    
    const compensating: SagaExecution = {
      ...execution,
      state: 'Compensating',
    };
    
    await persistExecution(compensating);
    
    logger.info('saga.compensation.start', {
      sagaId: execution.sagaId,
      executionId: execution.id,
      sagaName: execution.sagaName,
      currentStep: execution.currentStep,
    });
    
    // Compensate steps in reverse order
    let compensatedTo = execution.currentStep - 1;
    
    for (let i = compensatedTo; i >= 0; i--) {
      const step = saga.steps[i];
      const stepResult = execution.stepResults[i];
      
      if (!stepResult || !stepResult.compensationData) {
        continue;
      }
      
      try {
        await step.compensate({} as any, execution, stepResult);
        
        logger.info('saga.compensation.step_success', {
          sagaId: execution.sagaId,
          executionId: execution.id,
          sagaName: execution.sagaName,
          stepName: step.name,
          stepIndex: i,
        });
      } catch (error) {
        logger.error('saga.compensation.step_error', {
          sagaId: execution.sagaId,
          executionId: execution.id,
          sagaName: execution.sagaName,
          stepName: step.name,
          stepIndex: i,
          error: error instanceof Error ? error.message : String(error),
        });
        
        // If compensation fails, mark as CompensationFailed
        const failed: SagaExecution = {
          ...compensating,
          state: 'CompensationFailed',
          compensatedTo: i + 1,
        };
        await persistExecution(failed);
        return failed;
      }
    }
    
    const compensated: SagaExecution = {
      ...compensating,
      state: 'Compensated',
      compensatedTo: 0,
    };
    
    await persistExecution(compensated);
    
    logger.info('saga.compensation.success', {
      sagaId: execution.sagaId,
      executionId: execution.id,
      sagaName: execution.sagaName,
    });
    
    return compensated;
  }

  /**
   * Get saga execution by ID.
   */
  async function getExecution(executionId: EntityId): Promise<SagaExecution | null> {
    return await loadExecution(executionId);
  }

  /**
   * Get all executions for a saga.
   */
  async function getExecutions(
    sagaName: string,
    state?: SagaState
  ): Promise<readonly SagaExecution[]> {
    let query = 'SELECT * FROM saga_executions WHERE saga_name = $1';
    const params: any[] = [sagaName];
    
    if (state) {
      query += ' AND state = $2';
      params.push(state);
    }
    
    query += ' ORDER BY started_at DESC';
    
    const result = await pool.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      sagaId: row.saga_id,
      sagaName: row.saga_name,
      startedAt: Number(row.started_at),
      startedBy: {
        type: row.started_by_type as 'System' | 'User' | 'Agent',
        ...(row.started_by_type === 'User' ? { userId: row.started_by_id } :
            row.started_by_type === 'System' ? { systemId: row.started_by_id } :
            row.started_by_type === 'Agent' ? { agentId: row.started_by_id } : {}),
      },
      state: row.state as SagaState,
      currentStep: row.current_step,
      stepResults: row.step_results ? JSON.parse(row.step_results) : [],
      compensatedTo: row.compensated_to ?? undefined,
      completedAt: row.completed_at ? Number(row.completed_at) : undefined,
      failedAt: row.failed_at ? Number(row.failed_at) : undefined,
      error: row.error_message ? {
        step: row.error_step,
        stepName: row.error_step_name,
        message: row.error_message,
        retryCount: row.error_retry_count ?? 0,
        stack: row.error_stack,
      } : undefined,
    }));
  }

  /**
   * Resume a paused/failed saga.
   */
  async function resume(executionId: EntityId): Promise<SagaExecution> {
    const execution = await loadExecution(executionId);
    if (!execution) {
      throw new Error(`Saga execution ${executionId} not found`);
    }
    
    if (execution.state !== 'Failed' && execution.state !== 'Running') {
      throw new Error(`Cannot resume saga in state ${execution.state}`);
    }
    
    const resumed: SagaExecution = {
      ...execution,
      state: 'Running',
      error: undefined,
    };
    
    await persistExecution(resumed);
    
    logger.info('saga.resumed', {
      sagaId: execution.sagaId,
      executionId: execution.id,
      sagaName: execution.sagaName,
    });
    
    return await advance(executionId);
  }

  /**
   * Recover pending sagas (call on startup).
   */
  async function recoverPendingSagas(): Promise<void> {
    logger.info('saga.recovery.scan.start');
    
    const result = await pool.query(
      `SELECT * FROM saga_executions 
       WHERE state IN ('Running', 'Compensating')
       ORDER BY started_at ASC`
    );
    
    const now = Date.now();
    const STUCK_THRESHOLD_MS = 3600000; // 1 hour
    
    for (const row of result.rows) {
      const execution = await loadExecution(row.id);
      if (!execution) continue;
      
      const age = now - execution.startedAt;
      
      if (age > STUCK_THRESHOLD_MS) {
        logger.warn('saga.recovery.stuck', {
          sagaId: execution.sagaId,
          executionId: execution.id,
          sagaName: execution.sagaName,
          state: execution.state,
          ageMs: age,
        });
        
        // Mark as stuck (could trigger alert)
        continue;
      }
      
      if (execution.state === 'Running') {
        logger.info('saga.recovery.resume', {
          sagaId: execution.sagaId,
          executionId: execution.id,
          sagaName: execution.sagaName,
        });
        
        try {
          await advance(execution.id);
        } catch (error) {
          logger.error('saga.recovery.resume_error', {
            sagaId: execution.sagaId,
            executionId: execution.id,
            sagaName: execution.sagaName,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else if (execution.state === 'Compensating') {
        logger.info('saga.recovery.compensate', {
          sagaId: execution.sagaId,
          executionId: execution.id,
          sagaName: execution.sagaName,
        });
        
        try {
          await compensate(execution.id);
        } catch (error) {
          logger.error('saga.recovery.compensate_error', {
            sagaId: execution.sagaId,
            executionId: execution.id,
            sagaName: execution.sagaName,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    
    logger.info('saga.recovery.scan.completed', {
      recoveredCount: result.rows.length,
    });
  }

  return {
    register,
    start,
    getExecution,
    getExecutions,
    compensate,
    resume,
    advance,
    recoverPendingSagas,
  };
}

