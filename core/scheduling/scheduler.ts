/**
 * SCHEDULING - Time-Based Triggers & Deadlines
 * 
 * Business processes have temporal requirements:
 * - Agreement expires on Dec 31
 * - Payment due in 30 days
 * - Reminder 7 days before deadline
 * - Auto-escalate if not resolved in 48h
 * 
 * The scheduler makes time a first-class participant in the system.
 */

import type { EntityId, Timestamp, ActorReference, Duration, AggregateType } from '../shared/types';

// ============================================================================
// SCHEDULED TASKS
// ============================================================================

/**
 * A task scheduled to run at a specific time.
 */
export interface ScheduledTask {
  readonly id: EntityId;
  readonly name: string;
  readonly description?: string;
  
  /** When to execute */
  readonly schedule: TaskSchedule;
  
  /** What to do */
  readonly action: TaskAction;
  
  /** Context for the action */
  readonly context: TaskContext;
  
  /** State */
  readonly state: TaskState;
  readonly createdAt: Timestamp;
  readonly createdBy: ActorReference;
  
  /** Last execution info */
  readonly lastExecution?: TaskExecution;
  readonly nextExecutionAt?: Timestamp;
  
  /** Retry policy */
  readonly retryPolicy?: RetryPolicy;
}

export type TaskSchedule =
  | { readonly type: 'Once'; readonly at: Timestamp }
  | { readonly type: 'Recurring'; readonly cron: string } // Cron expression
  | { readonly type: 'Relative'; readonly after: Duration; readonly relativeTo: RelativeAnchor }
  | { readonly type: 'Deadline'; readonly deadline: Timestamp; readonly remindersBefore?: readonly Duration[] };

export type RelativeAnchor =
  | { readonly type: 'Now' }
  | { readonly type: 'Event'; readonly eventType: string; readonly aggregateId: EntityId }
  | { readonly type: 'FieldValue'; readonly aggregateType: AggregateType; readonly aggregateId: EntityId; readonly field: string };

export type TaskState = 
  | 'Pending'
  | 'Running'
  | 'Completed'
  | 'Failed'
  | 'Cancelled'
  | 'Paused';

/**
 * What action to take when the schedule triggers.
 */
export type TaskAction =
  | EmitEventAction
  | ExecuteIntentAction
  | TriggerWorkflowAction
  | SendNotificationAction
  | CallWebhookAction
  | CustomAction;

export interface EmitEventAction {
  readonly type: 'EmitEvent';
  readonly eventType: string;
  readonly aggregateType: AggregateType;
  readonly aggregateId: EntityId;
  readonly payload: unknown;
}

export interface ExecuteIntentAction {
  readonly type: 'ExecuteIntent';
  readonly intent: string;
  readonly payload: Record<string, unknown>;
  readonly actAs?: ActorReference; // Execute as this actor
}

export interface TriggerWorkflowAction {
  readonly type: 'TriggerWorkflow';
  readonly transition: string;
  readonly aggregateType: AggregateType;
  readonly aggregateId: EntityId;
  readonly payload?: Record<string, unknown>;
}

export interface SendNotificationAction {
  readonly type: 'SendNotification';
  readonly recipients: readonly EntityId[];
  readonly template: string;
  readonly data: Record<string, unknown>;
}

export interface CallWebhookAction {
  readonly type: 'CallWebhook';
  readonly webhookId: EntityId;
  readonly payload: unknown;
}

export interface CustomAction {
  readonly type: 'Custom';
  readonly handlerId: string;
  readonly params: Record<string, unknown>;
}

/**
 * Context passed to the task action.
 */
export interface TaskContext {
  readonly realmId: EntityId;
  readonly relatedAgreement?: EntityId;
  readonly relatedEntity?: EntityId;
  readonly relatedAsset?: EntityId;
  readonly metadata?: Record<string, unknown>;
}

export interface TaskExecution {
  readonly executionId: EntityId;
  readonly startedAt: Timestamp;
  readonly completedAt?: Timestamp;
  readonly state: 'Running' | 'Completed' | 'Failed';
  readonly error?: string;
  readonly result?: unknown;
  readonly retryCount: number;
}

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
}

// ============================================================================
// DEADLINES & REMINDERS
// ============================================================================

/**
 * A Deadline is a special kind of schedule tied to an obligation.
 */
export interface Deadline {
  readonly id: EntityId;
  readonly name: string;
  
  /** What is this deadline for? */
  readonly subject: DeadlineSubject;
  
  /** When is the deadline? */
  readonly dueAt: Timestamp;
  
  /** What happens at different stages? */
  readonly stages: readonly DeadlineStage[];
  
  /** Current state */
  readonly state: DeadlineState;
  readonly acknowledgedAt?: Timestamp;
  readonly acknowledgedBy?: ActorReference;
}

export type DeadlineSubject =
  | { readonly type: 'Obligation'; readonly agreementId: EntityId; readonly obligationId: string }
  | { readonly type: 'Agreement'; readonly agreementId: EntityId; readonly purpose: string }
  | { readonly type: 'Task'; readonly taskId: EntityId }
  | { readonly type: 'Custom'; readonly reference: string };

export interface DeadlineStage {
  /** When does this stage trigger (relative to deadline) */
  readonly trigger: StageTrigger;
  
  /** What to do */
  readonly action: TaskAction;
  
  /** Label for this stage */
  readonly label: string;
  
  /** Has this stage been executed? */
  readonly executed?: boolean;
  readonly executedAt?: Timestamp;
}

export type StageTrigger =
  | { readonly type: 'Before'; readonly duration: Duration }
  | { readonly type: 'At' }
  | { readonly type: 'After'; readonly duration: Duration };

export type DeadlineState =
  | 'Pending'      // Deadline not yet reached
  | 'Approaching'  // Within warning period
  | 'Due'          // Deadline reached
  | 'Overdue'      // Past deadline
  | 'Completed'    // Subject was completed
  | 'Cancelled';   // Deadline no longer applies

// ============================================================================
// SCHEDULER SERVICE
// ============================================================================

/**
 * The scheduler service manages all scheduled tasks and deadlines.
 */
export interface Scheduler {
  /** Schedule a new task */
  schedule(task: Omit<ScheduledTask, 'id' | 'state' | 'createdAt'>): Promise<ScheduledTask>;
  
  /** Cancel a task */
  cancel(taskId: EntityId): Promise<void>;
  
  /** Pause a recurring task */
  pause(taskId: EntityId): Promise<void>;
  
  /** Resume a paused task */
  resume(taskId: EntityId): Promise<void>;
  
  /** Get task by ID */
  getTask(taskId: EntityId): Promise<ScheduledTask | null>;
  
  /** Get tasks for an entity */
  getTasksForEntity(entityId: EntityId): Promise<readonly ScheduledTask[]>;
  
  /** Get overdue tasks */
  getOverdue(): Promise<readonly ScheduledTask[]>;
  
  /** Get upcoming tasks */
  getUpcoming(within: Duration): Promise<readonly ScheduledTask[]>;
  
  // Deadline-specific
  
  /** Create a deadline */
  createDeadline(deadline: Omit<Deadline, 'id' | 'state'>): Promise<Deadline>;
  
  /** Acknowledge a deadline (mark as handled) */
  acknowledgeDeadline(deadlineId: EntityId, actor: ActorReference): Promise<Deadline>;
  
  /** Complete a deadline's subject */
  completeDeadline(deadlineId: EntityId): Promise<Deadline>;
  
  /** Get deadlines approaching */
  getApproachingDeadlines(within: Duration): Promise<readonly Deadline[]>;
  
  /** Get overdue deadlines */
  getOverdueDeadlines(): Promise<readonly Deadline[]>;
}

// ============================================================================
// BUILT-IN SCHEDULE PATTERNS
// ============================================================================

/**
 * Common scheduling patterns.
 */
export const SCHEDULE_PATTERNS = {
  /** Agreement expiry handling */
  agreementExpiry: (agreementId: EntityId, expiresAt: Timestamp): Omit<ScheduledTask, 'id' | 'state' | 'createdAt'> => ({
    name: 'AgreementExpiry',
    description: 'Handle agreement expiration',
    schedule: {
      type: 'Deadline',
      deadline: expiresAt,
      remindersBefore: [
        { amount: 30, unit: 'days' },
        { amount: 7, unit: 'days' },
        { amount: 1, unit: 'days' },
      ],
    },
    action: {
      type: 'TriggerWorkflow',
      transition: 'expire',
      aggregateType: 'Agreement',
      aggregateId: agreementId,
    },
    context: {
      realmId: '' as EntityId, // Filled in by caller
      relatedAgreement: agreementId,
    },
    createdBy: { type: 'System', systemId: 'scheduler' },
  }),
  
  /** Payment due reminder */
  paymentDue: (
    agreementId: EntityId,
    obligationId: string,
    dueDate: Timestamp,
    recipientId: EntityId
  ): Omit<Deadline, 'id' | 'state'> => ({
    name: 'PaymentDue',
    subject: { type: 'Obligation', agreementId, obligationId },
    dueAt: dueDate,
    stages: [
      {
        trigger: { type: 'Before', duration: { amount: 7, unit: 'days' } },
        action: {
          type: 'SendNotification',
          recipients: [recipientId],
          template: 'payment-reminder-7days',
          data: { agreementId, obligationId, dueDate },
        },
        label: '7-day reminder',
      },
      {
        trigger: { type: 'Before', duration: { amount: 1, unit: 'days' } },
        action: {
          type: 'SendNotification',
          recipients: [recipientId],
          template: 'payment-reminder-1day',
          data: { agreementId, obligationId, dueDate },
        },
        label: '1-day reminder',
      },
      {
        trigger: { type: 'At' },
        action: {
          type: 'SendNotification',
          recipients: [recipientId],
          template: 'payment-due-today',
          data: { agreementId, obligationId },
        },
        label: 'Due date notification',
      },
      {
        trigger: { type: 'After', duration: { amount: 1, unit: 'days' } },
        action: {
          type: 'ExecuteIntent',
          intent: 'flag-overdue',
          payload: { agreementId, obligationId },
        },
        label: 'Flag as overdue',
      },
    ],
  }),
  
  /** Recurring report generation */
  dailyReport: (realmId: EntityId): Omit<ScheduledTask, 'id' | 'state' | 'createdAt'> => ({
    name: 'DailyReport',
    description: 'Generate daily summary report',
    schedule: {
      type: 'Recurring',
      cron: '0 6 * * *', // Every day at 6 AM
    },
    action: {
      type: 'Custom',
      handlerId: 'generate-daily-report',
      params: { realmId },
    },
    context: { realmId },
    createdBy: { type: 'System', systemId: 'scheduler' },
  }),
  
  /** Auto-escalation for stale workflows */
  autoEscalate: (
    workflowId: EntityId,
    staleAfter: Duration,
    escalateTo: EntityId
  ): Omit<ScheduledTask, 'id' | 'state' | 'createdAt'> => ({
    name: 'AutoEscalate',
    description: 'Escalate stale workflow',
    schedule: {
      type: 'Relative',
      after: staleAfter,
      relativeTo: { type: 'Event', eventType: 'WorkflowTransitioned', aggregateId: workflowId },
    },
    action: {
      type: 'SendNotification',
      recipients: [escalateTo],
      template: 'workflow-escalation',
      data: { workflowId },
    },
    context: {
      realmId: '' as EntityId,
    },
    createdBy: { type: 'System', systemId: 'scheduler' },
  }),
};

