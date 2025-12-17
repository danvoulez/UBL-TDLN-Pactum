/**
 * INTENT TRANSACTION
 * 
 * FASE 2.2: Transaction interface with compensation steps
 * 
 * Provides atomic operations with automatic rollback on failure.
 * Uses the Saga pattern for distributed transactions.
 */

import type { EntityId, Timestamp } from '../shared/types';
import type { Event, AggregateType } from '../schema/ledger';
import type { EventStore, EventInput } from '../store/event-store';

// =============================================================================
// TRANSACTION TYPES
// =============================================================================

export type TransactionStatus = 
  | 'pending'
  | 'executing'
  | 'committed'
  | 'compensating'
  | 'rolled_back'
  | 'failed';

export interface TransactionStep<T = unknown> {
  readonly name: string;
  readonly execute: (context: TransactionContext) => Promise<T>;
  readonly compensate?: (context: TransactionContext, result: T) => Promise<void>;
}

export interface TransactionContext {
  readonly transactionId: string;
  readonly correlationId: string;
  readonly startedAt: Timestamp;
  readonly actor: Event['actor'];
  readonly metadata: Record<string, unknown>;
  readonly results: Map<string, unknown>;
}

export interface TransactionResult {
  readonly transactionId: string;
  readonly correlationId: string;
  readonly status: TransactionStatus;
  readonly startedAt: Timestamp;
  readonly completedAt: Timestamp;
  readonly steps: readonly StepResult[];
  readonly error?: string;
}

export interface StepResult {
  readonly name: string;
  readonly status: 'success' | 'failed' | 'compensated' | 'skipped';
  readonly duration: number;
  readonly error?: string;
}

// =============================================================================
// INTENT TRANSACTION
// =============================================================================

export class IntentTransaction {
  private steps: TransactionStep[] = [];
  private status: TransactionStatus = 'pending';
  private readonly transactionId: string;
  private readonly correlationId: string;
  private readonly startedAt: Timestamp;
  private readonly context: TransactionContext;
  
  constructor(
    private readonly eventStore: EventStore,
    private readonly actor: Event['actor'],
    metadata: Record<string, unknown> = {}
  ) {
    this.transactionId = this.generateId('tx');
    this.correlationId = this.generateId('corr');
    this.startedAt = Date.now();
    this.context = {
      transactionId: this.transactionId,
      correlationId: this.correlationId,
      startedAt: this.startedAt,
      actor: this.actor,
      metadata,
      results: new Map(),
    };
  }
  
  /**
   * Add a step to the transaction
   */
  addStep<T>(step: TransactionStep<T>): this {
    if (this.status !== 'pending') {
      throw new Error('Cannot add steps to a transaction that has started');
    }
    this.steps.push(step as TransactionStep);
    return this;
  }
  
  /**
   * Add an event append step
   */
  appendEvent<T>(
    name: string,
    eventInput: Omit<EventInput<T>, 'causation'>
  ): this {
    return this.addStep({
      name,
      execute: async (ctx) => {
        const event = await this.eventStore.append({
          ...eventInput,
          causation: {
            correlationId: ctx.correlationId as EntityId,
          },
        });
        return event;
      },
      // Events are immutable - no compensation possible
      // But we record the event for audit purposes
    });
  }
  
  /**
   * Execute the transaction
   */
  async execute(): Promise<TransactionResult> {
    if (this.status !== 'pending') {
      throw new Error(`Transaction already ${this.status}`);
    }
    
    this.status = 'executing';
    const stepResults: StepResult[] = [];
    const executedSteps: Array<{ step: TransactionStep; result: unknown }> = [];
    
    try {
      // Execute all steps in order
      for (const step of this.steps) {
        const stepStart = Date.now();
        
        try {
          const result = await step.execute(this.context);
          this.context.results.set(step.name, result);
          executedSteps.push({ step, result });
          
          stepResults.push({
            name: step.name,
            status: 'success',
            duration: Date.now() - stepStart,
          });
        } catch (error) {
          stepResults.push({
            name: step.name,
            status: 'failed',
            duration: Date.now() - stepStart,
            error: error instanceof Error ? error.message : String(error),
          });
          
          // Trigger compensation
          await this.compensate(executedSteps, stepResults);
          
          this.status = 'rolled_back';
          return {
            transactionId: this.transactionId,
            correlationId: this.correlationId,
            status: this.status,
            startedAt: this.startedAt,
            completedAt: Date.now(),
            steps: stepResults,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
      
      this.status = 'committed';
      return {
        transactionId: this.transactionId,
        correlationId: this.correlationId,
        status: this.status,
        startedAt: this.startedAt,
        completedAt: Date.now(),
        steps: stepResults,
      };
      
    } catch (error) {
      this.status = 'failed';
      return {
        transactionId: this.transactionId,
        correlationId: this.correlationId,
        status: this.status,
        startedAt: this.startedAt,
        completedAt: Date.now(),
        steps: stepResults,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * Compensate executed steps in reverse order
   */
  private async compensate(
    executedSteps: Array<{ step: TransactionStep; result: unknown }>,
    stepResults: StepResult[]
  ): Promise<void> {
    this.status = 'compensating';
    
    // Reverse order for compensation
    for (let i = executedSteps.length - 1; i >= 0; i--) {
      const { step, result } = executedSteps[i];
      
      if (step.compensate) {
        const compStart = Date.now();
        try {
          await step.compensate(this.context, result);
          stepResults.push({
            name: `${step.name}:compensate`,
            status: 'compensated',
            duration: Date.now() - compStart,
          });
        } catch (error) {
          stepResults.push({
            name: `${step.name}:compensate`,
            status: 'failed',
            duration: Date.now() - compStart,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }
  
  /**
   * Get the correlation ID for this transaction
   */
  getCorrelationId(): string {
    return this.correlationId;
  }
  
  /**
   * Get the transaction ID
   */
  getTransactionId(): string {
    return this.transactionId;
  }
  
  /**
   * Get current status
   */
  getStatus(): TransactionStatus {
    return this.status;
  }
  
  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }
}

// =============================================================================
// TRANSFER TRANSACTION (Example)
// =============================================================================

export interface TransferParams {
  readonly fromContainerId: EntityId;
  readonly toContainerId: EntityId;
  readonly itemId: EntityId;
  readonly amount: bigint;
  readonly fees?: readonly {
    readonly recipientId: EntityId;
    readonly amount: bigint;
    readonly reason: string;
  }[];
}

/**
 * Create a transfer transaction with proper correlation
 */
export function createTransferTransaction(
  eventStore: EventStore,
  actor: Event['actor'],
  params: TransferParams
): IntentTransaction {
  const tx = new IntentTransaction(eventStore, actor, {
    transferType: 'container',
    fromContainerId: params.fromContainerId,
    toContainerId: params.toContainerId,
  });
  
  // Step 1: Withdraw from source
  tx.addStep({
    name: 'withdraw',
    execute: async (ctx) => {
      return eventStore.append({
        type: 'ContainerItemWithdrawn',
        aggregateId: params.fromContainerId,
        aggregateType: 'Container' as AggregateType,
        aggregateVersion: await eventStore.getNextVersion('Container' as AggregateType, params.fromContainerId),
        actor: ctx.actor,
        causation: { correlationId: ctx.correlationId as EntityId },
        payload: {
          itemId: params.itemId,
          amount: params.amount.toString(),
          reason: `Transfer to ${params.toContainerId}`,
        },
      });
    },
  });
  
  // Step 2: Deposit to destination (net amount)
  const netAmount = params.fees 
    ? params.amount - params.fees.reduce((sum, f) => sum + f.amount, 0n)
    : params.amount;
    
  tx.addStep({
    name: 'deposit',
    execute: async (ctx) => {
      return eventStore.append({
        type: 'ContainerItemDeposited',
        aggregateId: params.toContainerId,
        aggregateType: 'Container' as AggregateType,
        aggregateVersion: await eventStore.getNextVersion('Container' as AggregateType, params.toContainerId),
        actor: ctx.actor,
        causation: { correlationId: ctx.correlationId as EntityId },
        payload: {
          itemId: params.itemId,
          amount: netAmount.toString(),
          sourceContainerId: params.fromContainerId,
          reason: 'Transfer',
        },
      });
    },
  });
  
  // Step 3+: Fee deposits
  if (params.fees) {
    for (let i = 0; i < params.fees.length; i++) {
      const fee = params.fees[i];
      tx.addStep({
        name: `fee-${i}`,
        execute: async (ctx) => {
          return eventStore.append({
            type: 'ContainerItemDeposited',
            aggregateId: fee.recipientId,
            aggregateType: 'Container' as AggregateType,
            aggregateVersion: await eventStore.getNextVersion('Container' as AggregateType, fee.recipientId),
            actor: ctx.actor,
            causation: { correlationId: ctx.correlationId as EntityId },
            payload: {
              itemId: params.itemId,
              amount: fee.amount.toString(),
              sourceContainerId: params.fromContainerId,
              reason: fee.reason,
            },
          });
        },
      });
    }
  }
  
  return tx;
}

// =============================================================================
// FACTORY
// =============================================================================

export function createIntentTransaction(
  eventStore: EventStore,
  actor: Event['actor'],
  metadata?: Record<string, unknown>
): IntentTransaction {
  return new IntentTransaction(eventStore, actor, metadata);
}
