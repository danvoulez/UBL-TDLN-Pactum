/**
 * TRAJECTORY AGGREGATE
 * 
 * Tracks an entity's action history.
 * "The agent IS its trajectory."
 * 
 * Events handled:
 * - TrajectorySpanRecorded
 */

import type { EntityId, Timestamp } from '../shared/types';
import type { Event } from '../schema/ledger';
import type { TrajectorySpanPayload, TrajectoryExecution } from '../schema/agent-economy';

// =============================================================================
// TRAJECTORY STATE
// =============================================================================

export interface TrajectorySpan {
  readonly spanId: EntityId;
  readonly action: string;
  readonly execution: TrajectoryExecution;
  readonly timestamp: Timestamp;
  readonly inputHash: string;
  readonly outputHash: string;
  readonly success: boolean;
}

export interface TrajectoryState {
  readonly entityId: EntityId;
  readonly spans: TrajectorySpan[];
  
  // Stats
  readonly totalSpans: number;
  readonly totalCost: bigint;
  readonly totalTokens: number;
  readonly totalDurationMs: number;
  readonly successRate: number;
  
  // By action type
  readonly actionCounts: Record<string, number>;
  
  // Timeline
  readonly firstActionAt: Timestamp | null;
  readonly lastActionAt: Timestamp | null;
  
  readonly version: number;
}

// =============================================================================
// TRAJECTORY AGGREGATE
// =============================================================================

export class TrajectoryAggregate {
  private state: TrajectoryState;
  
  constructor(private readonly entityId: EntityId) {
    this.state = {
      entityId,
      spans: [],
      totalSpans: 0,
      totalCost: 0n,
      totalTokens: 0,
      totalDurationMs: 0,
      successRate: 1.0,
      actionCounts: {},
      firstActionAt: null,
      lastActionAt: null,
      version: 0,
    };
  }
  
  // ---------------------------------------------------------------------------
  // EVENT APPLICATION
  // ---------------------------------------------------------------------------
  
  apply(event: Event): void {
    switch (event.type) {
      case 'TrajectorySpanRecorded':
        this.applyTrajectorySpanRecorded(event);
        break;
    }
  }
  
  private applyTrajectorySpanRecorded(event: Event): void {
    const payload = event.payload as TrajectorySpanPayload & {
      spanId: EntityId;
      success: boolean;
      inputHash: string;
      outputHash: string;
    };
    
    if (payload.entityId !== this.entityId) return;
    
    const span: TrajectorySpan = {
      spanId: payload.spanId,
      action: payload.action,
      execution: payload.execution,
      timestamp: event.timestamp,
      inputHash: payload.inputHash,
      outputHash: payload.outputHash,
      success: payload.success,
    };
    
    // Update action counts
    const actionCounts = { ...this.state.actionCounts };
    actionCounts[payload.action] = (actionCounts[payload.action] || 0) + 1;
    
    // Calculate new success rate
    const successCount = this.state.spans.filter(s => s.success).length + (payload.success ? 1 : 0);
    const totalCount = this.state.totalSpans + 1;
    const successRate = totalCount > 0 ? successCount / totalCount : 1.0;
    
    // Calculate tokens
    const tokens = payload.execution.tokens 
      ? payload.execution.tokens.input + payload.execution.tokens.output 
      : 0;
    
    // Calculate cost
    const cost = payload.execution.cost ? BigInt(payload.execution.cost as unknown as bigint) : 0n;
    
    this.state = {
      ...this.state,
      spans: [...this.state.spans, span],
      totalSpans: this.state.totalSpans + 1,
      totalCost: this.state.totalCost + cost,
      totalTokens: this.state.totalTokens + tokens,
      totalDurationMs: this.state.totalDurationMs + payload.execution.durationMs,
      successRate,
      actionCounts,
      firstActionAt: this.state.firstActionAt ?? event.timestamp,
      lastActionAt: event.timestamp,
      version: this.state.version + 1,
    };
  }
  
  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------
  
  getState(): TrajectoryState {
    return this.state;
  }
  
  getSpans(limit?: number): TrajectorySpan[] {
    if (limit) {
      return this.state.spans.slice(-limit);
    }
    return this.state.spans;
  }
  
  getSpansByAction(action: string): TrajectorySpan[] {
    return this.state.spans.filter(s => s.action === action);
  }
  
  getRecentSpans(since: Timestamp): TrajectorySpan[] {
    return this.state.spans.filter(s => s.timestamp >= since);
  }
  
  getTotalCost(): bigint {
    return this.state.totalCost;
  }
  
  getAverageCost(): bigint {
    if (this.state.totalSpans === 0) return 0n;
    return this.state.totalCost / BigInt(this.state.totalSpans);
  }
  
  getAverageDuration(): number {
    if (this.state.totalSpans === 0) return 0;
    return this.state.totalDurationMs / this.state.totalSpans;
  }
  
  getSuccessRate(): number {
    return this.state.successRate;
  }
  
  getMostFrequentActions(limit: number = 5): Array<{ action: string; count: number }> {
    return Object.entries(this.state.actionCounts)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
  
  getActivityPeriod(): { first: Timestamp | null; last: Timestamp | null; durationDays: number } {
    const first = this.state.firstActionAt;
    const last = this.state.lastActionAt;
    const durationDays = first && last 
      ? (last - first) / (1000 * 60 * 60 * 24) 
      : 0;
    
    return { first, last, durationDays };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createTrajectoryAggregate(entityId: EntityId): TrajectoryAggregate {
  return new TrajectoryAggregate(entityId);
}

/**
 * Reconstruct trajectory state from events
 */
export function reconstructTrajectory(entityId: EntityId, events: Event[]): TrajectoryState {
  const aggregate = createTrajectoryAggregate(entityId);
  
  for (const event of events) {
    aggregate.apply(event);
  }
  
  return aggregate.getState();
}
