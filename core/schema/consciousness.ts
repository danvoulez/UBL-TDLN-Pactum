/**
 * CONSCIOUSNESS LAYER SCHEMA
 *
 * "Scripts that persist, think, and act autonomously."
 *
 * This module defines the Daemon - a persistent process that gives
 * scripts continuous existence and autonomous behavior.
 *
 * Core Principles:
 * 1. Daemons have budgets (can't run forever without paying)
 * 2. Daemons have heartbeats (proof of life)
 * 3. Daemons have loops (recurring behaviors)
 * 4. Everything is auditable (all actions are Events)
 */

import type { EntityId, Timestamp, Quantity } from '../shared/types';

// ============================================================================
// DAEMON - Persistent autonomous process
// ============================================================================

/**
 * Daemon Mode - how the daemon runs
 */
export type DaemonMode =
  | 'Persistent'   // Always running (heartbeat-based)
  | 'Scheduled'    // Runs on schedule (cron-based)
  | 'Reactive';    // Runs in response to events

/**
 * Daemon Status
 */
export type DaemonStatus =
  | 'Running'      // Active and processing
  | 'Sleeping'     // Paused to save budget
  | 'Stopped'      // Terminated
  | 'Error'        // Failed, needs attention
  | 'BudgetExhausted';  // Out of funds

/**
 * Budget Configuration
 */
export interface DaemonBudget {
  /** Maximum spend per hour */
  readonly hourlyMax: Quantity;
  
  /** Maximum spend per day */
  readonly dailyMax: Quantity;
  
  /** What to do when budget exhausted */
  readonly onExhausted: 'sleep' | 'stop' | 'notify';
  
  /** Current period spend */
  readonly currentHourSpend: Quantity;
  readonly currentDaySpend: Quantity;
  
  /** Period reset timestamps */
  readonly hourResetAt: Timestamp;
  readonly dayResetAt: Timestamp;
}

/**
 * Heartbeat Configuration
 */
export interface DaemonHeartbeat {
  /** How often to send heartbeat */
  readonly interval: string;  // ISO 8601 duration, e.g., "PT5M"
  
  /** Last heartbeat timestamp */
  readonly lastBeat?: Timestamp;
  
  /** Consecutive missed beats */
  readonly missedBeats: number;
  
  /** Max missed before considered dead */
  readonly maxMissedBeats: number;
}

/**
 * Loop - A recurring behavior pattern
 */
export interface DaemonLoop {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  
  /** When to run */
  readonly schedule: LoopSchedule;
  
  /** What to do */
  readonly action: LoopAction;
  
  /** Is this loop active? */
  readonly enabled: boolean;
  
  /** Last execution */
  readonly lastRunAt?: Timestamp;
  readonly lastRunResult?: 'success' | 'failure' | 'skipped';
  
  /** Statistics */
  readonly runCount: number;
  readonly failureCount: number;
  readonly totalCost: Quantity;
}

export interface LoopSchedule {
  /** Cron expression */
  readonly cron?: string;
  
  /** Fixed interval */
  readonly interval?: string;  // ISO 8601 duration
  
  /** Event trigger */
  readonly onEvent?: string;
  
  /** Condition to check before running */
  readonly condition?: string;  // Expression to evaluate
}

export interface LoopAction {
  /** Intent to execute */
  readonly intentType: string;
  readonly intentPayload?: Record<string, unknown>;
  
  /** Or custom function reference */
  readonly functionRef?: string;
  
  /** Timeout for execution */
  readonly timeout?: string;  // ISO 8601 duration
  
  /** Retry configuration */
  readonly retry?: {
    readonly maxAttempts: number;
    readonly backoff: 'linear' | 'exponential';
    readonly initialDelay: string;
  };
}

/**
 * Memory Slot - Daemon's working memory
 */
export interface MemorySlot {
  readonly key: string;
  readonly value: unknown;
  readonly updatedAt: Timestamp;
  readonly expiresAt?: Timestamp;
}

/**
 * Daemon - The persistent autonomous process
 */
export interface Daemon {
  readonly id: EntityId;
  
  /** Which entity owns this daemon */
  readonly entityId: EntityId;
  
  /** Human-readable name */
  readonly name: string;
  readonly description?: string;
  
  /** How it runs */
  readonly mode: DaemonMode;
  
  /** Current status */
  readonly status: DaemonStatus;
  readonly statusReason?: string;
  
  /** Budget constraints */
  readonly budget: DaemonBudget;
  
  /** Heartbeat configuration (for Persistent mode) */
  readonly heartbeat?: DaemonHeartbeat;
  
  /** Recurring behaviors */
  readonly loops: readonly DaemonLoop[];
  
  /** Working memory */
  readonly memory: readonly MemorySlot[];
  
  /** Provider configuration */
  readonly provider?: DaemonProvider;
  
  /** Statistics */
  readonly stats: DaemonStats;
  
  /** Timestamps */
  readonly createdAt: Timestamp;
  readonly startedAt?: Timestamp;
  readonly stoppedAt?: Timestamp;
  readonly lastActivityAt?: Timestamp;
}

export interface DaemonProvider {
  /** LLM provider to use */
  readonly provider: string;  // 'openai', 'anthropic', etc.
  
  /** Model to use */
  readonly model: string;
  
  /** Fallback providers */
  readonly fallbacks?: readonly string[];
  
  /** Context window management */
  readonly contextStrategy: 'full' | 'sliding' | 'summary';
  readonly maxContextTokens?: number;
}

export interface DaemonStats {
  readonly totalLoopRuns: number;
  readonly totalHeartbeats: number;
  readonly totalCost: Quantity;
  readonly totalErrors: number;
  readonly uptimeSeconds: number;
  readonly lastErrorAt?: Timestamp;
  readonly lastError?: string;
}

// ============================================================================
// EVENTS
// ============================================================================

export interface DaemonStartedPayload {
  readonly type: 'DaemonStarted';
  readonly daemonId: EntityId;
  readonly entityId: EntityId;
  readonly name: string;
  readonly mode: DaemonMode;
  readonly budget: DaemonBudget;
  readonly loops: readonly DaemonLoop[];
}

export interface DaemonHeartbeatPayload {
  readonly type: 'DaemonHeartbeat';
  readonly daemonId: EntityId;
  readonly status: DaemonStatus;
  readonly memorySnapshot?: readonly MemorySlot[];
  readonly budgetRemaining: {
    readonly hourly: Quantity;
    readonly daily: Quantity;
  };
}

export interface DaemonLoopExecutedPayload {
  readonly type: 'DaemonLoopExecuted';
  readonly daemonId: EntityId;
  readonly loopId: string;
  readonly result: 'success' | 'failure' | 'skipped';
  readonly cost: Quantity;
  readonly durationMs: number;
  readonly output?: Record<string, unknown>;
  readonly error?: string;
}

export interface DaemonSleptPayload {
  readonly type: 'DaemonSlept';
  readonly daemonId: EntityId;
  readonly reason: 'budget' | 'schedule' | 'manual' | 'error';
  readonly wakeAt?: Timestamp;
}

export interface DaemonWokePayload {
  readonly type: 'DaemonWoke';
  readonly daemonId: EntityId;
  readonly sleepDurationMs: number;
  readonly trigger: 'schedule' | 'event' | 'manual';
}

export interface DaemonStoppedPayload {
  readonly type: 'DaemonStopped';
  readonly daemonId: EntityId;
  readonly reason: string;
  readonly finalStats: DaemonStats;
  readonly graceful: boolean;
}

export interface DaemonErrorPayload {
  readonly type: 'DaemonError';
  readonly daemonId: EntityId;
  readonly error: string;
  readonly loopId?: string;
  readonly recoverable: boolean;
  readonly willRetry: boolean;
}

export interface DaemonBudgetAdjustedPayload {
  readonly type: 'DaemonBudgetAdjusted';
  readonly daemonId: EntityId;
  readonly previousBudget: DaemonBudget;
  readonly newBudget: DaemonBudget;
  readonly adjustedBy: EntityId;
  readonly reason: string;
}

export interface DaemonLoopAddedPayload {
  readonly type: 'DaemonLoopAdded';
  readonly daemonId: EntityId;
  readonly loop: DaemonLoop;
}

export interface DaemonLoopRemovedPayload {
  readonly type: 'DaemonLoopRemoved';
  readonly daemonId: EntityId;
  readonly loopId: string;
  readonly reason: string;
}

export interface DaemonMemoryUpdatedPayload {
  readonly type: 'DaemonMemoryUpdated';
  readonly daemonId: EntityId;
  readonly key: string;
  readonly previousValue?: unknown;
  readonly newValue: unknown;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a new daemon
 */
export function createDaemon(
  id: EntityId,
  entityId: EntityId,
  name: string,
  mode: DaemonMode,
  budget: Omit<DaemonBudget, 'currentHourSpend' | 'currentDaySpend' | 'hourResetAt' | 'dayResetAt'>
): Daemon {
  const now = Date.now();
  const zeroQuantity: Quantity = { amount: BigInt(0), unit: 'mUBL' };
  
  return {
    id,
    entityId,
    name,
    mode,
    status: 'Stopped',
    budget: {
      ...budget,
      currentHourSpend: zeroQuantity,
      currentDaySpend: zeroQuantity,
      hourResetAt: now + 3600000,  // 1 hour
      dayResetAt: now + 86400000,  // 24 hours
    },
    loops: [],
    memory: [],
    stats: {
      totalLoopRuns: 0,
      totalHeartbeats: 0,
      totalCost: zeroQuantity,
      totalErrors: 0,
      uptimeSeconds: 0,
    },
    createdAt: now,
  };
}

/**
 * Create a daemon loop
 */
export function createLoop(
  id: string,
  name: string,
  schedule: LoopSchedule,
  action: LoopAction
): DaemonLoop {
  return {
    id,
    name,
    schedule,
    action,
    enabled: true,
    runCount: 0,
    failureCount: 0,
    totalCost: { amount: BigInt(0), unit: 'mUBL' },
  };
}

/**
 * Check if daemon can spend amount
 */
export function canSpend(daemon: Daemon, amount: Quantity): boolean {
  const hourlyRemaining = BigInt(daemon.budget.hourlyMax.amount) - BigInt(daemon.budget.currentHourSpend.amount);
  const dailyRemaining = BigInt(daemon.budget.dailyMax.amount) - BigInt(daemon.budget.currentDaySpend.amount);
  
  return BigInt(amount.amount) <= hourlyRemaining && BigInt(amount.amount) <= dailyRemaining;
}

/**
 * Calculate remaining budget
 */
export function getRemainingBudget(daemon: Daemon): { hourly: Quantity; daily: Quantity } {
  return {
    hourly: {
      amount: BigInt(daemon.budget.hourlyMax.amount) - BigInt(daemon.budget.currentHourSpend.amount),
      unit: 'mUBL',
    },
    daily: {
      amount: BigInt(daemon.budget.dailyMax.amount) - BigInt(daemon.budget.currentDaySpend.amount),
      unit: 'mUBL',
    },
  };
}

/**
 * Check if heartbeat is overdue
 */
export function isHeartbeatOverdue(daemon: Daemon): boolean {
  if (!daemon.heartbeat || daemon.mode !== 'Persistent') return false;
  if (!daemon.heartbeat.lastBeat) return true;
  
  const intervalMs = parseDuration(daemon.heartbeat.interval);
  const elapsed = Date.now() - daemon.heartbeat.lastBeat;
  
  return elapsed > intervalMs * 1.5;  // 50% grace period
}

/**
 * Check if daemon is considered dead
 */
export function isDead(daemon: Daemon): boolean {
  if (!daemon.heartbeat) return false;
  return daemon.heartbeat.missedBeats >= daemon.heartbeat.maxMissedBeats;
}

/**
 * Parse ISO 8601 duration to milliseconds (simplified)
 */
function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  
  return (hours * 60 * 60 + minutes * 60 + seconds) * 1000;
}

/**
 * Default budget presets
 */
export const BUDGET_PRESETS = {
  /** Minimal - for testing */
  minimal: {
    hourlyMax: { amount: BigInt(100), unit: 'mUBL' as const },
    dailyMax: { amount: BigInt(500), unit: 'mUBL' as const },
    onExhausted: 'sleep' as const,
  },
  /** Standard - for normal operations */
  standard: {
    hourlyMax: { amount: BigInt(1000), unit: 'mUBL' as const },
    dailyMax: { amount: BigInt(10000), unit: 'mUBL' as const },
    onExhausted: 'notify' as const,
  },
  /** Premium - for high-activity daemons */
  premium: {
    hourlyMax: { amount: BigInt(5000), unit: 'mUBL' as const },
    dailyMax: { amount: BigInt(50000), unit: 'mUBL' as const },
    onExhausted: 'notify' as const,
  },
  /** Unlimited - use with caution */
  unlimited: {
    hourlyMax: { amount: BigInt(Number.MAX_SAFE_INTEGER), unit: 'mUBL' as const },
    dailyMax: { amount: BigInt(Number.MAX_SAFE_INTEGER), unit: 'mUBL' as const },
    onExhausted: 'notify' as const,
  },
};
