/**
 * EVENT BATCHER
 * 
 * FASE 3.1: Batches high-frequency events for performance
 * 
 * Use cases:
 * - Micro-payments (many small transactions)
 * - Telemetry events (agent activity tracking)
 * - Watcher triggers (high-frequency monitoring)
 * 
 * Strategy:
 * - Buffer events in memory
 * - Flush when: batch size reached OR time elapsed OR manual flush
 * - Maintain ordering guarantees within batch
 */

import type { EntityId, Timestamp } from '../shared/types';
import type { Event, AggregateType } from '../schema/ledger';
import type { EventStore, EventInput } from './event-store';

// =============================================================================
// TYPES
// =============================================================================

export interface BatcherConfig {
  /** Maximum events before auto-flush */
  readonly maxBatchSize: number;
  
  /** Maximum time (ms) before auto-flush */
  readonly maxBatchAgeMs: number;
  
  /** Event types eligible for batching */
  readonly batchableEventTypes: readonly string[];
  
  /** Callback when batch is flushed */
  readonly onFlush?: (events: readonly Event[], durationMs: number) => void;
  
  /** Callback on error */
  readonly onError?: (error: Error, events: readonly EventInput[]) => void;
}

export interface BatcherStats {
  readonly totalBatched: number;
  readonly totalFlushed: number;
  readonly batchCount: number;
  readonly averageBatchSize: number;
  readonly lastFlushAt: Timestamp | null;
  readonly currentBufferSize: number;
}

// =============================================================================
// EVENT BATCHER
// =============================================================================

export class EventBatcher {
  private buffer: EventInput[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private stats: {
    totalBatched: number;
    totalFlushed: number;
    batchCount: number;
    lastFlushAt: Timestamp | null;
  } = {
    totalBatched: 0,
    totalFlushed: 0,
    batchCount: 0,
    lastFlushAt: null,
  };
  
  constructor(
    private readonly eventStore: EventStore,
    private readonly config: BatcherConfig
  ) {}
  
  /**
   * Add an event to the batch buffer
   * Returns immediately - event will be persisted on flush
   */
  async add<T>(eventInput: EventInput<T>): Promise<void> {
    // Check if event type is batchable
    if (!this.config.batchableEventTypes.includes(eventInput.type)) {
      // Non-batchable events go directly to store
      await this.eventStore.append(eventInput);
      return;
    }
    
    this.buffer.push(eventInput as EventInput);
    this.stats.totalBatched++;
    
    // Start flush timer if not running
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush().catch(err => {
          this.config.onError?.(err, this.buffer);
        });
      }, this.config.maxBatchAgeMs);
    }
    
    // Auto-flush if batch size reached
    if (this.buffer.length >= this.config.maxBatchSize) {
      await this.flush();
    }
  }
  
  /**
   * Flush all buffered events to the store
   */
  async flush(): Promise<Event[]> {
    if (this.buffer.length === 0) {
      return [];
    }
    
    // Clear timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Take buffer and clear it
    const toFlush = [...this.buffer];
    this.buffer = [];
    
    const startTime = Date.now();
    const flushedEvents: Event[] = [];
    
    try {
      // Append all events in order
      for (const eventInput of toFlush) {
        const event = await this.eventStore.append(eventInput);
        flushedEvents.push(event);
      }
      
      // Update stats
      this.stats.totalFlushed += flushedEvents.length;
      this.stats.batchCount++;
      this.stats.lastFlushAt = Date.now();
      
      // Callback
      const durationMs = Date.now() - startTime;
      this.config.onFlush?.(flushedEvents, durationMs);
      
      return flushedEvents;
      
    } catch (error) {
      // On error, put events back in buffer for retry
      this.buffer = [...toFlush, ...this.buffer];
      this.config.onError?.(error as Error, toFlush);
      throw error;
    }
  }
  
  /**
   * Get current stats
   */
  getStats(): BatcherStats {
    return {
      ...this.stats,
      averageBatchSize: this.stats.batchCount > 0 
        ? this.stats.totalFlushed / this.stats.batchCount 
        : 0,
      currentBufferSize: this.buffer.length,
    };
  }
  
  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.buffer.length;
  }
  
  /**
   * Check if there are pending events
   */
  hasPending(): boolean {
    return this.buffer.length > 0;
  }
  
  /**
   * Stop the batcher and flush remaining events
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    if (this.buffer.length > 0) {
      await this.flush();
    }
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createEventBatcher(
  eventStore: EventStore,
  config?: Partial<BatcherConfig>
): EventBatcher {
  const defaultConfig: BatcherConfig = {
    maxBatchSize: 100,
    maxBatchAgeMs: 1000, // 1 second
    batchableEventTypes: [
      'MicroPayment',
      'TelemetryRecorded',
      'WatcherTriggered',
      'TrajectorySpanRecorded',
    ],
  };
  
  return new EventBatcher(eventStore, { ...defaultConfig, ...config });
}

// =============================================================================
// SPECIALIZED BATCHERS
// =============================================================================

/**
 * Create a batcher optimized for micro-payments
 */
export function createMicroPaymentBatcher(
  eventStore: EventStore,
  onFlush?: (events: readonly Event[], durationMs: number) => void
): EventBatcher {
  return createEventBatcher(eventStore, {
    maxBatchSize: 50,
    maxBatchAgeMs: 500, // 500ms for faster settlement
    batchableEventTypes: ['MicroPayment', 'CreditTransfer'],
    onFlush,
  });
}

/**
 * Create a batcher optimized for telemetry
 */
export function createTelemetryBatcher(
  eventStore: EventStore,
  onFlush?: (events: readonly Event[], durationMs: number) => void
): EventBatcher {
  return createEventBatcher(eventStore, {
    maxBatchSize: 200,
    maxBatchAgeMs: 5000, // 5 seconds - telemetry can wait
    batchableEventTypes: [
      'TelemetryRecorded',
      'TrajectorySpanRecorded',
      'MetricRecorded',
    ],
    onFlush,
  });
}
