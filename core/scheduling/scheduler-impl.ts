/**
 * FASE 7 - MOTOR TEMPORAL DO DIAMANTE
 * 
 * Este módulo orquestra deadlines e gatilhos baseados em tempo.
 * Objetivos principais:
 * - Apenas um nó do cluster dispara cada evento temporal.
 * - Cada deadline gera no máximo um conjunto de eventos de negócio.
 * - Em caso de falha/restart, o sistema consegue retomar com segurança.
 */

import type { Pool } from 'pg';
import type { EventStore, EventInput } from '../store/event-store';
import type {
  Deadline,
  DeadlineState,
  DeadlineStage,
  Scheduler,
  ScheduledTask,
  TaskAction,
} from './scheduler';
import type { EntityId, Timestamp, ActorReference, Duration } from '../shared/types';
import { generateId } from '../shared/types';
import { createPostgresDistributedLock } from './lock';
import {
  createPostgresDeadlineIdempotencyStore,
  buildDedupeKey,
} from './idempotency';
import { logger } from '../observability/logger';

export interface SchedulerConfig {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** Event store for emitting business events */
  eventStore: EventStore;
  /** How often to run the tick (ms) */
  tickIntervalMs?: number;
}

/**
 * Create a scheduler implementation with cluster-safe locking and idempotency.
 */
export function createClusterSafeScheduler(config: SchedulerConfig): Scheduler & {
  /**
   * Run a single scheduling tick (processes due deadlines and tasks).
   * This method is cluster-safe: only one instance will execute per tick.
   */
  runSchedulingTick(): Promise<void>;
  
  /**
   * Start the scheduler loop (runs ticks periodically).
   */
  start(): Promise<void>;
  
  /**
   * Stop the scheduler loop.
   */
  stop(): Promise<void>;
} {
  const { pool, eventStore, tickIntervalMs = 60000 } = config;
  
  const lock = createPostgresDistributedLock(pool);
  const idempotencyStore = createPostgresDeadlineIdempotencyStore(pool);
  
  // In-memory storage for deadlines and tasks (in production, this would be in DB)
  const deadlines = new Map<EntityId, Deadline>();
  const tasks = new Map<EntityId, ScheduledTask>();
  
  let tickInterval: NodeJS.Timeout | null = null;
  let isRunning = false;

  /**
   * Process a single deadline stage if it should trigger.
   */
  async function processDeadlineStage(
    deadline: Deadline,
    stage: DeadlineStage,
    stageIndex: number
  ): Promise<void> {
    const now = Date.now();
    
    // Determine if this stage should trigger
    let shouldTrigger = false;
    
    if (stage.trigger.type === 'At') {
      shouldTrigger = deadline.dueAt <= now && deadline.dueAt > now - 60000; // Within 1 minute
    } else if (stage.trigger.type === 'Before') {
      const triggerAt = deadline.dueAt - stage.trigger.duration.amount * getDurationMs(stage.trigger.duration.unit);
      shouldTrigger = triggerAt <= now && triggerAt > now - 60000;
    } else if (stage.trigger.type === 'After') {
      const triggerAt = deadline.dueAt + stage.trigger.duration.amount * getDurationMs(stage.trigger.duration.unit);
      shouldTrigger = triggerAt <= now && triggerAt > now - 60000;
    }
    
    if (!shouldTrigger || stage.executed) {
      return;
    }
    
    // Build deduplication key
    const realmId = deadline.subject.type === 'Obligation' 
      ? deadline.subject.agreementId 
      : deadline.subject.type === 'Agreement'
      ? deadline.subject.agreementId
      : '' as EntityId;
    
    const subjectId = deadline.subject.type === 'Obligation' || deadline.subject.type === 'Agreement'
      ? deadline.subject.agreementId
      : deadline.subject.type === 'Task'
      ? deadline.subject.taskId
      : '' as EntityId;
    
    const dedupeKey = buildDedupeKey(
      realmId,
      deadline.subject.type,
      subjectId,
      deadline.dueAt,
      stageIndex
    );
    
    // Check idempotency
    const isFirstTime = await idempotencyStore.markAsProcessed(dedupeKey, {
      deadlineId: deadline.id,
      stageIndex,
      stageLabel: stage.label,
    });
    
    if (!isFirstTime) {
      logger.info('scheduler.deadline.stage_skipped', {
        deadlineId: deadline.id,
        stageIndex,
        stageLabel: stage.label,
        dedupeKey,
      });
      return;
    }
    
    // Execute the stage action
    try {
      await executeTaskAction(stage.action, deadline.id);
      
      // Mark stage as executed
      const updatedStages = [...deadline.stages];
      updatedStages[stageIndex] = {
        ...stage,
        executed: true,
        executedAt: now,
      };
      
      deadlines.set(deadline.id, {
        ...deadline,
        stages: updatedStages,
      });
      
      logger.info('scheduler.deadline.stage_executed', {
        deadlineId: deadline.id,
        stageIndex,
        stageLabel: stage.label,
        dedupeKey,
      });
    } catch (error) {
      logger.error('scheduler.deadline.stage_error', {
        deadlineId: deadline.id,
        stageIndex,
        stageLabel: stage.label,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Execute a task action (emit event, execute intent, etc.).
   */
  async function executeTaskAction(action: TaskAction, contextId: EntityId): Promise<void> {
    if (action.type === 'EmitEvent') {
      const eventInput: EventInput = {
        type: action.eventType,
        aggregateId: action.aggregateId,
        aggregateType: action.aggregateType,
        aggregateVersion: 1,
        payload: action.payload,
        actor: { type: 'System', systemId: 'scheduler' },
        timestamp: Date.now(),
      };
      
      await eventStore.append(eventInput);
      
      logger.info('scheduler.action.event_emitted', {
        eventType: action.eventType,
        aggregateId: action.aggregateId,
        aggregateType: action.aggregateType,
      });
    } else if (action.type === 'ExecuteIntent') {
      // In a real implementation, this would call the intent handler
      logger.info('scheduler.action.intent_executed', {
        intent: action.intent,
        payload: action.payload,
      });
    } else {
      logger.info('scheduler.action.executed', {
        actionType: action.type,
      });
    }
  }

  /**
   * Process all due deadlines.
   */
  async function processDueDeadlines(): Promise<void> {
    const now = Date.now();
    
    for (const deadline of deadlines.values()) {
      if (deadline.state === 'Completed' || deadline.state === 'Cancelled') {
        continue;
      }
      
      // Process each stage
      for (let i = 0; i < deadline.stages.length; i++) {
        await processDeadlineStage(deadline, deadline.stages[i], i);
      }
      
      // Update deadline state
      let newState: DeadlineState = deadline.state;
      if (deadline.dueAt <= now && deadline.state === 'Pending') {
        newState = 'Due';
      } else if (deadline.dueAt < now - 86400000 && deadline.state === 'Due') {
        newState = 'Overdue';
      }
      
      if (newState !== deadline.state) {
        deadlines.set(deadline.id, {
          ...deadline,
          state: newState,
        });
      }
    }
  }

  /**
   * Run a single scheduling tick (cluster-safe).
   */
  async function runSchedulingTick(): Promise<void> {
    const lockKey = 'ubl:scheduler:global';
    
    const result = await lock.withLock(lockKey, async () => {
      logger.info('scheduler.tick.start');
      
      try {
        await processDueDeadlines();
        // TODO: Process scheduled tasks
        
        logger.info('scheduler.tick.completed');
      } catch (error) {
        logger.error('scheduler.tick.error', {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });
    
    if (result === null) {
      logger.info('scheduler.tick.skipped', {
        reason: 'lock_contended',
      });
    }
  }

  /**
   * Start the scheduler loop.
   */
  async function start(): Promise<void> {
    if (isRunning) {
      return;
    }
    
    isRunning = true;
    
    // Run initial tick
    await runSchedulingTick();
    
    // Schedule periodic ticks
    tickInterval = setInterval(() => {
      runSchedulingTick().catch(err => {
        logger.error('scheduler.tick.interval_error', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, tickIntervalMs);
    
    logger.info('scheduler.started', {
      tickIntervalMs,
    });
  }

  /**
   * Stop the scheduler loop.
   */
  async function stop(): Promise<void> {
    if (!isRunning) {
      return;
    }
    
    isRunning = false;
    
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
    
    logger.info('scheduler.stopped');
  }

  // Helper function to convert duration to milliseconds
  function getDurationMs(unit: string): number {
    switch (unit) {
      case 'milliseconds': return 1;
      case 'seconds': return 1000;
      case 'minutes': return 60000;
      case 'hours': return 3600000;
      case 'days': return 86400000;
      case 'weeks': return 604800000;
      case 'months': return 2592000000; // Approximate
      case 'years': return 31536000000; // Approximate
      default: return 1000;
    }
  }

  // Implement Scheduler interface methods (simplified for now)
  const scheduler: Scheduler & {
    runSchedulingTick: () => Promise<void>;
    start: () => Promise<void>;
    stop: () => Promise<void>;
  } = {
    async schedule(task) {
      const scheduledTask: ScheduledTask = {
        ...task,
        id: generateId(),
        state: 'Pending',
        createdAt: Date.now(),
      };
      tasks.set(scheduledTask.id, scheduledTask);
      return scheduledTask;
    },
    
    async cancel(taskId) {
      const task = tasks.get(taskId);
      if (task) {
        tasks.set(taskId, { ...task, state: 'Cancelled' });
      }
    },
    
    async pause(taskId) {
      const task = tasks.get(taskId);
      if (task) {
        tasks.set(taskId, { ...task, state: 'Paused' });
      }
    },
    
    async resume(taskId) {
      const task = tasks.get(taskId);
      if (task) {
        tasks.set(taskId, { ...task, state: 'Pending' });
      }
    },
    
    async getTask(taskId) {
      return tasks.get(taskId) ?? null;
    },
    
    async getTasksForEntity(entityId) {
      return Array.from(tasks.values()).filter(
        t => t.context.relatedEntity === entityId ||
             t.context.relatedAgreement === entityId ||
             t.context.relatedAsset === entityId
      );
    },
    
    async getOverdue() {
      const now = Date.now();
      return Array.from(tasks.values()).filter(
        t => t.nextExecutionAt && t.nextExecutionAt < now && t.state === 'Pending'
      );
    },
    
    async getUpcoming(within) {
      const now = Date.now();
      const withinMs = within.amount * getDurationMs(within.unit);
      const maxTime = now + withinMs;
      return Array.from(tasks.values()).filter(
        t => t.nextExecutionAt && t.nextExecutionAt <= maxTime && t.state === 'Pending'
      );
    },
    
    async createDeadline(deadline) {
      const newDeadline: Deadline = {
        ...deadline,
        id: generateId(),
        state: 'Pending',
      };
      deadlines.set(newDeadline.id, newDeadline);
      return newDeadline;
    },
    
    async acknowledgeDeadline(deadlineId, actor) {
      const deadline = deadlines.get(deadlineId);
      if (!deadline) {
        throw new Error(`Deadline ${deadlineId} not found`);
      }
      const updated: Deadline = {
        ...deadline,
        acknowledgedAt: Date.now(),
        acknowledgedBy: actor,
      };
      deadlines.set(deadlineId, updated);
      return updated;
    },
    
    async completeDeadline(deadlineId) {
      const deadline = deadlines.get(deadlineId);
      if (!deadline) {
        throw new Error(`Deadline ${deadlineId} not found`);
      }
      const updated: Deadline = {
        ...deadline,
        state: 'Completed',
      };
      deadlines.set(deadlineId, updated);
      return updated;
    },
    
    async getApproachingDeadlines(within) {
      const now = Date.now();
      const withinMs = within.amount * getDurationMs(within.unit);
      return Array.from(deadlines.values()).filter(
        d => d.dueAt > now && d.dueAt <= now + withinMs && d.state === 'Pending'
      );
    },
    
    async getOverdueDeadlines() {
      const now = Date.now();
      return Array.from(deadlines.values()).filter(
        d => d.dueAt < now && (d.state === 'Due' || d.state === 'Overdue')
      );
    },
    
    runSchedulingTick,
    start,
    stop,
  };
  
  return scheduler;
}

