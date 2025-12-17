/**
 * CIRCUIT BREAKER - Emergency Economic Halt
 *
 * "A hora do fudeu, tira da tomada"
 *
 * When things go catastrophically wrong, we need to be able to:
 * 1. HALT all economic activity immediately
 * 2. Freeze all transactions
 * 3. Prevent new loans
 * 4. Lock conversions
 * 5. Preserve state for forensics
 *
 * Triggers (automatic):
 * - Inflation > 50% (hyperinflation)
 * - Supply change > 100% in 24h (exploit/bug)
 * - Default rate > 50% (systemic failure)
 * - Negative Treasury balance (impossible state)
 * - Gini > 0.95 (one entity owns everything)
 *
 * Can also be triggered manually by operator.
 */

import type { EntityId, Timestamp } from '../shared/types';
import { asEntityId } from '../shared/types';
import type { EventStore } from '../store/event-store';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Circuit breaker states
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * What triggered the circuit breaker
 */
export type TripReason =
  | 'HYPERINFLATION'
  | 'SUPPLY_ANOMALY'
  | 'MASS_DEFAULT'
  | 'NEGATIVE_TREASURY'
  | 'EXTREME_CONCENTRATION'
  | 'MANUAL_HALT'
  | 'SECURITY_BREACH'
  | 'SYSTEM_ERROR';

/**
 * What operations are blocked when circuit is open
 */
export interface BlockedOperations {
  transfers: boolean;
  loans: boolean;
  conversions: boolean;
  minting: boolean;
  burning: boolean;
  agentRegistration: boolean;
}

/**
 * Circuit breaker thresholds
 */
export interface CircuitBreakerThresholds {
  /** Inflation rate that triggers halt */
  maxInflation: number;  // 0.50 = 50%
  
  /** Supply change in 24h that triggers halt */
  maxSupplyChange: number;  // 1.00 = 100%
  
  /** Default rate that triggers halt */
  maxDefaultRate: number;  // 0.50 = 50%
  
  /** Gini coefficient that triggers halt */
  maxGini: number;  // 0.95
  
  /** Consecutive anomalies before trip */
  anomalyThreshold: number;  // 3
}

/**
 * Circuit breaker state
 */
export interface CircuitBreakerState {
  /** Current state */
  state: CircuitState;
  
  /** When circuit was tripped (if open) */
  trippedAt?: Timestamp;
  
  /** Why it was tripped */
  tripReason?: TripReason;
  
  /** Detailed message */
  tripMessage?: string;
  
  /** Who tripped it (if manual) */
  trippedBy?: EntityId;
  
  /** What's blocked */
  blockedOperations: BlockedOperations;
  
  /** Anomaly counter */
  anomalyCount: number;
  
  /** When last checked */
  lastCheck: Timestamp;
  
  /** Snapshot of metrics at trip time */
  tripSnapshot?: {
    inflation: number;
    supplyChange: number;
    defaultRate: number;
    gini: number;
    circulatingSupply: bigint;
    treasuryBalance: bigint;
  };
}

/**
 * Circuit breaker event payload
 */
export interface CircuitBreakerTrippedPayload {
  readonly type: 'CircuitBreakerTripped';
  readonly reason: TripReason;
  readonly message: string;
  readonly trippedBy?: EntityId;
  readonly snapshot: CircuitBreakerState['tripSnapshot'];
  readonly blockedOperations: BlockedOperations;
}

/**
 * Circuit breaker reset event payload
 */
export interface CircuitBreakerResetPayload {
  readonly type: 'CircuitBreakerReset';
  readonly resetBy: EntityId;
  readonly reason: string;
  readonly previousState: CircuitState;
  readonly downtimeMs: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_THRESHOLDS: CircuitBreakerThresholds = {
  maxInflation: 0.50,      // 50% - hyperinflation
  maxSupplyChange: 1.00,   // 100% change in 24h - something's very wrong
  maxDefaultRate: 0.50,    // 50% defaults - systemic failure
  maxGini: 0.95,           // One entity owns 95%+ - game over
  anomalyThreshold: 3,     // 3 consecutive anomalies before trip
};

const ALL_BLOCKED: BlockedOperations = {
  transfers: true,
  loans: true,
  conversions: true,
  minting: true,
  burning: true,
  agentRegistration: true,
};

const NONE_BLOCKED: BlockedOperations = {
  transfers: false,
  loans: false,
  conversions: false,
  minting: false,
  burning: false,
  agentRegistration: false,
};

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

/**
 * Economic Circuit Breaker
 *
 * Emergency halt system for catastrophic failures.
 */
export class EconomicCircuitBreaker {
  private readonly eventStore: EventStore;
  private readonly thresholds: CircuitBreakerThresholds;
  private state: CircuitBreakerState;
  private tripHandlers: Array<(state: CircuitBreakerState) => void> = [];
  private resetHandlers: Array<(state: CircuitBreakerState) => void> = [];

  constructor(
    eventStore: EventStore,
    thresholds: CircuitBreakerThresholds = DEFAULT_THRESHOLDS
  ) {
    this.eventStore = eventStore;
    this.thresholds = thresholds;
    this.state = {
      state: 'CLOSED',
      blockedOperations: NONE_BLOCKED,
      anomalyCount: 0,
      lastCheck: Date.now(),
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  /**
   * Check if circuit is open (halted)
   */
  isOpen(): boolean {
    return this.state.state === 'OPEN';
  }

  /**
   * Check if a specific operation is blocked
   */
  isBlocked(operation: keyof BlockedOperations): boolean {
    return this.state.blockedOperations[operation];
  }

  /**
   * Register trip handler
   */
  onTrip(handler: (state: CircuitBreakerState) => void): void {
    this.tripHandlers.push(handler);
  }

  /**
   * Register reset handler
   */
  onReset(handler: (state: CircuitBreakerState) => void): void {
    this.resetHandlers.push(handler);
  }

  /**
   * Check metrics and trip if necessary
   */
  check(metrics: {
    inflation: number;
    supplyChange: number;
    defaultRate: number;
    gini: number;
    circulatingSupply: bigint;
    treasuryBalance: bigint;
  }): { tripped: boolean; reason?: TripReason; message?: string } {
    this.state.lastCheck = Date.now();

    // Already open? Stay open.
    if (this.state.state === 'OPEN') {
      return { tripped: false };
    }

    // Check each threshold
    let reason: TripReason | undefined;
    let message: string | undefined;

    if (metrics.inflation > this.thresholds.maxInflation) {
      reason = 'HYPERINFLATION';
      message = `Inflation at ${(metrics.inflation * 100).toFixed(1)}% exceeds ${(this.thresholds.maxInflation * 100).toFixed(0)}% threshold`;
    } else if (Math.abs(metrics.supplyChange) > this.thresholds.maxSupplyChange) {
      reason = 'SUPPLY_ANOMALY';
      message = `Supply changed ${(metrics.supplyChange * 100).toFixed(1)}% in 24h - possible exploit`;
    } else if (metrics.defaultRate > this.thresholds.maxDefaultRate) {
      reason = 'MASS_DEFAULT';
      message = `Default rate at ${(metrics.defaultRate * 100).toFixed(1)}% - systemic failure`;
    } else if (metrics.treasuryBalance < BigInt(0)) {
      reason = 'NEGATIVE_TREASURY';
      message = `Treasury balance is negative - impossible state detected`;
    } else if (metrics.gini > this.thresholds.maxGini) {
      reason = 'EXTREME_CONCENTRATION';
      message = `Gini coefficient at ${metrics.gini.toFixed(2)} - extreme wealth concentration`;
    }

    if (reason) {
      this.state.anomalyCount++;

      // Trip after threshold consecutive anomalies
      if (this.state.anomalyCount >= this.thresholds.anomalyThreshold) {
        this.trip(reason, message!, undefined, metrics);
        return { tripped: true, reason, message };
      }

      return { tripped: false, reason, message: `Anomaly ${this.state.anomalyCount}/${this.thresholds.anomalyThreshold}: ${message}` };
    }

    // Reset anomaly counter if all good
    this.state.anomalyCount = 0;
    return { tripped: false };
  }

  /**
   * Trip the circuit breaker (HALT EVERYTHING)
   */
  async trip(
    reason: TripReason,
    message: string,
    trippedBy?: EntityId,
    snapshot?: CircuitBreakerState['tripSnapshot']
  ): Promise<void> {
    const now = Date.now();

    this.state = {
      state: 'OPEN',
      trippedAt: now,
      tripReason: reason,
      tripMessage: message,
      trippedBy,
      blockedOperations: ALL_BLOCKED,
      anomalyCount: this.state.anomalyCount,
      lastCheck: now,
      tripSnapshot: snapshot,
    };

    // Record event
    const eventPayload: CircuitBreakerTrippedPayload = {
      type: 'CircuitBreakerTripped',
      reason,
      message,
      trippedBy,
      snapshot,
      blockedOperations: ALL_BLOCKED,
    };

    await this.eventStore.append({
      type: 'CircuitBreakerTripped',
      aggregateId: asEntityId('system'),
      aggregateType: 'Flow',
      aggregateVersion: 1,
      payload: eventPayload,
      actor: trippedBy
        ? { type: 'Entity', entityId: trippedBy }
        : { type: 'System', systemId: 'circuit-breaker' },
    });

    // Notify handlers
    for (const handler of this.tripHandlers) {
      handler(this.state);
    }

    console.error(`
🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨
🚨                                                              🚨
🚨              CIRCUIT BREAKER TRIPPED                         🚨
🚨              ALL ECONOMIC ACTIVITY HALTED                    🚨
🚨                                                              🚨
🚨  Reason: ${reason.padEnd(45)}🚨
🚨  ${message.slice(0, 56).padEnd(56)}🚨
🚨                                                              🚨
🚨  Time: ${new Date(now).toISOString().padEnd(47)}🚨
🚨                                                              🚨
🚨  BLOCKED: Transfers, Loans, Conversions, Minting, Burning   🚨
🚨                                                              🚨
🚨  Manual reset required: circuitBreaker.reset(entityId)      🚨
🚨                                                              🚨
🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨
`);
  }

  /**
   * Manual trip by operator
   */
  async manualTrip(reason: string, trippedBy: EntityId): Promise<void> {
    await this.trip('MANUAL_HALT', reason, trippedBy);
  }

  /**
   * Reset the circuit breaker (requires manual intervention)
   */
  async reset(resetBy: EntityId, reason: string): Promise<void> {
    if (this.state.state !== 'OPEN') {
      throw new Error('Circuit breaker is not open');
    }

    const downtimeMs = Date.now() - (this.state.trippedAt || 0);
    const previousState = this.state.state;

    // Record event
    const eventPayload: CircuitBreakerResetPayload = {
      type: 'CircuitBreakerReset',
      resetBy,
      reason,
      previousState,
      downtimeMs,
    };

    await this.eventStore.append({
      type: 'CircuitBreakerReset',
      aggregateId: asEntityId('system'),
      aggregateType: 'Flow',
      aggregateVersion: 1,
      payload: eventPayload,
      actor: { type: 'Entity', entityId: resetBy },
    });

    // Reset state
    this.state = {
      state: 'CLOSED',
      blockedOperations: NONE_BLOCKED,
      anomalyCount: 0,
      lastCheck: Date.now(),
    };

    // Notify handlers
    for (const handler of this.resetHandlers) {
      handler(this.state);
    }

    console.log(`
✅ CIRCUIT BREAKER RESET
   Reset by: ${resetBy}
   Reason: ${reason}
   Downtime: ${Math.round(downtimeMs / 1000 / 60)} minutes
   All operations resumed.
`);
  }

  /**
   * Partial reset - allow some operations while investigating
   */
  async partialReset(
    resetBy: EntityId,
    allowedOperations: Partial<BlockedOperations>
  ): Promise<void> {
    if (this.state.state !== 'OPEN') {
      throw new Error('Circuit breaker is not open');
    }

    this.state.state = 'HALF_OPEN';
    this.state.blockedOperations = {
      ...ALL_BLOCKED,
      ...Object.fromEntries(
        Object.entries(allowedOperations).map(([k, v]) => [k, !v])
      ),
    } as BlockedOperations;

    console.log(`
⚠️  CIRCUIT BREAKER HALF-OPEN
    Some operations allowed for investigation.
    Allowed: ${Object.entries(allowedOperations).filter(([_, v]) => v).map(([k]) => k).join(', ')}
`);
  }

  /**
   * Format state for display
   */
  formatState(): string {
    const { state, trippedAt, tripReason, tripMessage, blockedOperations } = this.state;

    if (state === 'CLOSED') {
      return `
╔══════════════════════════════════════════════════════════════╗
║  CIRCUIT BREAKER: 🟢 CLOSED (Normal Operation)               ║
╚══════════════════════════════════════════════════════════════╝
`;
    }

    const blocked = Object.entries(blockedOperations)
      .filter(([_, v]) => v)
      .map(([k]) => k)
      .join(', ');

    const downtime = trippedAt ? Math.round((Date.now() - trippedAt) / 1000 / 60) : 0;

    return `
╔══════════════════════════════════════════════════════════════╗
║  CIRCUIT BREAKER: 🔴 ${state === 'OPEN' ? 'OPEN' : 'HALF-OPEN'} (HALTED)                        ║
╠══════════════════════════════════════════════════════════════╣
║  Reason:   ${(tripReason || 'Unknown').padEnd(48)}║
║  Message:  ${(tripMessage || '').slice(0, 48).padEnd(48)}║
║  Downtime: ${String(downtime).padEnd(3)} minutes                                      ║
║  Blocked:  ${blocked.slice(0, 48).padEnd(48)}║
╠══════════════════════════════════════════════════════════════╣
║  ⚠️  Manual reset required: circuitBreaker.reset(entityId)   ║
╚══════════════════════════════════════════════════════════════╝
`;
  }

  /**
   * Guard function - throws if operation is blocked
   */
  guard(operation: keyof BlockedOperations): void {
    if (this.isBlocked(operation)) {
      throw new CircuitBreakerError(
        `Operation '${operation}' is blocked. Circuit breaker is ${this.state.state}.`,
        this.state
      );
    }
  }
}

/**
 * Error thrown when operation is blocked
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly circuitState: CircuitBreakerState
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a circuit breaker
 */
export function createCircuitBreaker(
  eventStore: EventStore,
  thresholds?: Partial<CircuitBreakerThresholds>
): EconomicCircuitBreaker {
  const fullThresholds: CircuitBreakerThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...thresholds,
  };

  return new EconomicCircuitBreaker(eventStore, fullThresholds);
}
