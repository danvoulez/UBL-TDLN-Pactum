/**
 * FLOATING INTEREST RATE CONTROLLER
 *
 * Automatic interest rate adjustment based on inflation.
 * More elegant than burn - controls money supply via loan demand.
 *
 * Mechanism:
 * 1. Inflation above target → Raise rate → Fewer loans → Less money created
 * 2. Inflation below target → Lower rate → More loans → Stimulate economy
 * 3. Rate hits ceiling (15%) → Start burning (last resort)
 *
 * This is how real central banks work (Taylor Rule inspired).
 */

import type { EntityId, Timestamp, ActorReference } from '../shared/types';
import { asEntityId } from '../shared/types';
import type { EventStore } from '../store/event-store';
import {
  type FloatingRateConfig,
  type InterestRateAdjustedPayload,
  DEFAULT_FLOATING_RATE,
  toSmallestUnit,
} from '../schema/agent-economy';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Current rate state
 */
export interface RateState {
  /** Current effective interest rate */
  readonly currentRate: number;
  /** Last adjustment timestamp */
  readonly lastAdjustment: Timestamp;
  /** Number of consecutive adjustments in same direction */
  readonly consecutiveAdjustments: number;
  /** Direction of last adjustment */
  readonly lastDirection: 'up' | 'down' | 'none';
  /** Whether burn mode is active (rate at ceiling) */
  readonly burnModeActive: boolean;
  /** Amount burned since burn mode activated */
  readonly burnedSinceActivation: bigint;
}

/**
 * Rate adjustment decision
 */
export interface RateDecision {
  /** Should rate be adjusted? */
  readonly shouldAdjust: boolean;
  /** New rate (if adjusting) */
  readonly newRate?: number;
  /** Reason for decision */
  readonly reason: string;
  /** Should burn be triggered? */
  readonly shouldBurn: boolean;
  /** Amount to burn (if burning) */
  readonly burnAmount?: bigint;
  /** Current inflation */
  readonly currentInflation: number;
  /** Target inflation */
  readonly targetInflation: number;
}

// ============================================================================
// FLOATING RATE CONTROLLER
// ============================================================================

/**
 * Floating Rate Controller
 *
 * Manages automatic interest rate adjustments based on economic conditions.
 */
export class FloatingRateController {
  private readonly eventStore: EventStore;
  private readonly config: FloatingRateConfig;
  private state: RateState;

  constructor(
    eventStore: EventStore,
    config: FloatingRateConfig = DEFAULT_FLOATING_RATE,
    initialRate: number = 0.05
  ) {
    this.eventStore = eventStore;
    this.config = config;
    this.state = {
      currentRate: initialRate,
      lastAdjustment: 0,
      consecutiveAdjustments: 0,
      lastDirection: 'none',
      burnModeActive: false,
      burnedSinceActivation: BigInt(0),
    };
  }

  /**
   * Get current state
   */
  getState(): RateState {
    return this.state;
  }

  /**
   * Get current effective rate
   */
  getCurrentRate(): number {
    return this.state.currentRate;
  }

  /**
   * Check if burn mode is active
   */
  isBurnModeActive(): boolean {
    return this.state.burnModeActive;
  }

  /**
   * Calculate rate adjustment decision based on current inflation
   */
  calculateDecision(currentInflation: number, treasuryBalance: bigint): RateDecision {
    const now = Date.now();
    const { targetInflation, minRate, maxRate, adjustmentSpeed, cooldownMs } = this.config;

    // Check cooldown
    if (now - this.state.lastAdjustment < cooldownMs) {
      return {
        shouldAdjust: false,
        reason: `Cooldown active (${Math.ceil((cooldownMs - (now - this.state.lastAdjustment)) / 1000 / 60)} min remaining)`,
        shouldBurn: false,
        currentInflation,
        targetInflation,
      };
    }

    // Calculate inflation gap
    const inflationGap = currentInflation - targetInflation;
    const absGap = Math.abs(inflationGap);

    // If inflation is within tolerance (0.5%), no adjustment needed
    if (absGap < 0.005) {
      return {
        shouldAdjust: false,
        reason: 'Inflation within target range',
        shouldBurn: false,
        currentInflation,
        targetInflation,
      };
    }

    // Calculate rate adjustment
    // Positive gap (high inflation) → raise rate
    // Negative gap (low inflation) → lower rate
    const rateAdjustment = inflationGap * adjustmentSpeed;
    let newRate = this.state.currentRate + rateAdjustment;

    // Clamp to bounds
    newRate = Math.max(minRate, Math.min(maxRate, newRate));

    // Check if we hit the ceiling
    const hitCeiling = newRate >= maxRate && inflationGap > 0;

    // If at ceiling and still high inflation → BURN
    if (hitCeiling && this.state.currentRate >= maxRate) {
      // Calculate burn amount: proportional to excess inflation
      // Burn 1% of treasury for each 1% above target
      const excessInflation = Math.max(0, currentInflation - targetInflation);
      const burnRatio = Math.min(0.10, excessInflation); // Cap at 10% of treasury per period
      const burnAmount = (treasuryBalance * BigInt(Math.round(burnRatio * 1000))) / BigInt(1000);

      return {
        shouldAdjust: false, // Rate already at max
        reason: `Rate at ceiling (${(maxRate * 100).toFixed(1)}%), activating burn mode`,
        shouldBurn: burnAmount > BigInt(0),
        burnAmount,
        currentInflation,
        targetInflation,
      };
    }

    // Normal rate adjustment
    if (newRate !== this.state.currentRate) {
      return {
        shouldAdjust: true,
        newRate,
        reason: inflationGap > 0
          ? `Inflation ${(currentInflation * 100).toFixed(1)}% > target ${(targetInflation * 100).toFixed(1)}%, raising rate`
          : `Inflation ${(currentInflation * 100).toFixed(1)}% < target ${(targetInflation * 100).toFixed(1)}%, lowering rate`,
        shouldBurn: false,
        currentInflation,
        targetInflation,
      };
    }

    return {
      shouldAdjust: false,
      reason: 'No adjustment needed',
      shouldBurn: false,
      currentInflation,
      targetInflation,
    };
  }

  /**
   * Apply rate adjustment and record event
   */
  async applyAdjustment(
    decision: RateDecision,
    actor: ActorReference
  ): Promise<{ rateEvent?: EntityId; burnEvent?: EntityId }> {
    const result: { rateEvent?: EntityId; burnEvent?: EntityId } = {};

    // Apply rate change
    if (decision.shouldAdjust && decision.newRate !== undefined) {
      const previousRate = this.state.currentRate;
      const direction = decision.newRate > previousRate ? 'up' : 'down';

      // Update state
      this.state = {
        currentRate: decision.newRate,
        lastAdjustment: Date.now(),
        consecutiveAdjustments: direction === this.state.lastDirection
          ? this.state.consecutiveAdjustments + 1
          : 1,
        lastDirection: direction,
        burnModeActive: false,
        burnedSinceActivation: BigInt(0),
      };

      // Record event
      const eventPayload: InterestRateAdjustedPayload = {
        type: 'InterestRateAdjusted',
        previousRate,
        newRate: decision.newRate,
        reason: decision.currentInflation > decision.targetInflation ? 'InflationHigh' : 'InflationLow',
        currentInflation: decision.currentInflation,
        targetInflation: decision.targetInflation,
      };

      const event = await this.eventStore.append({
        type: 'InterestRateAdjusted',
        aggregateId: asEntityId('treasury'),
        aggregateType: 'Asset',
        aggregateVersion: 1,
        payload: eventPayload,
        actor,
      });

      result.rateEvent = event.id;
    }

    // Apply burn if needed
    if (decision.shouldBurn && decision.burnAmount && decision.burnAmount > BigInt(0)) {
      // Update state for burn mode
      this.state = {
        ...this.state,
        burnModeActive: true,
        burnedSinceActivation: this.state.burnedSinceActivation + decision.burnAmount,
        lastAdjustment: Date.now(),
      };

      // Record burn event
      const burnEvent = await this.eventStore.append({
        type: 'CreditsBurned',
        aggregateId: asEntityId('treasury'),
        aggregateType: 'Asset',
        aggregateVersion: 1,
        payload: {
          type: 'CreditsBurned',
          amount: decision.burnAmount,
          fromWalletId: asEntityId('treasury-wallet'),
          reason: 'InflationControl',
          authorizedBy: asEntityId('monetary-policy'),
        },
        actor,
      });

      result.burnEvent = burnEvent.id;
    }

    return result;
  }

  /**
   * Run automatic rate adjustment cycle
   */
  async runAdjustmentCycle(
    currentInflation: number,
    treasuryBalance: bigint,
    actor: ActorReference
  ): Promise<{
    decision: RateDecision;
    applied: boolean;
    events: { rateEvent?: EntityId; burnEvent?: EntityId };
  }> {
    if (!this.config.enabled) {
      return {
        decision: {
          shouldAdjust: false,
          reason: 'Floating rate disabled',
          shouldBurn: false,
          currentInflation,
          targetInflation: this.config.targetInflation,
        },
        applied: false,
        events: {},
      };
    }

    const decision = this.calculateDecision(currentInflation, treasuryBalance);

    if (!decision.shouldAdjust && !decision.shouldBurn) {
      return { decision, applied: false, events: {} };
    }

    const events = await this.applyAdjustment(decision, actor);

    return { decision, applied: true, events };
  }

  /**
   * Manually set rate (for emergencies or testing)
   */
  async setRateManually(
    newRate: number,
    reason: string,
    actor: ActorReference
  ): Promise<EntityId> {
    const previousRate = this.state.currentRate;

    // Clamp to bounds
    const clampedRate = Math.max(
      this.config.minRate,
      Math.min(this.config.maxRate, newRate)
    );

    this.state = {
      currentRate: clampedRate,
      lastAdjustment: Date.now(),
      consecutiveAdjustments: 0,
      lastDirection: 'none',
      burnModeActive: false,
      burnedSinceActivation: BigInt(0),
    };

    const eventPayload: InterestRateAdjustedPayload = {
      type: 'InterestRateAdjusted',
      previousRate,
      newRate: clampedRate,
      reason: 'Manual',
      currentInflation: 0, // Unknown for manual
      targetInflation: this.config.targetInflation,
    };

    const event = await this.eventStore.append({
      type: 'InterestRateAdjusted',
      aggregateId: asEntityId('treasury'),
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return event.id;
  }

  /**
   * Format state for display
   */
  formatState(): string {
    const { currentRate, lastAdjustment, consecutiveAdjustments, lastDirection, burnModeActive } = this.state;
    const { minRate, maxRate, targetInflation } = this.config;

    const rateBar = this.createRateBar(currentRate, minRate, maxRate);

    return `
╔══════════════════════════════════════════════════════════════╗
║              FLOATING INTEREST RATE STATUS                   ║
╠══════════════════════════════════════════════════════════════╣
║  Current Rate:    ${(currentRate * 100).toFixed(2).padStart(6)}%                                  ║
║  Rate Range:      ${(minRate * 100).toFixed(0)}% ─────────────────────── ${(maxRate * 100).toFixed(0)}%      ║
║  Position:        ${rateBar}      ║
║  Target Inflation: ${(targetInflation * 100).toFixed(1)}%                                   ║
║                                                              ║
║  Last Adjustment: ${lastAdjustment ? new Date(lastAdjustment).toISOString().slice(0, 19) : 'Never'.padEnd(19)}      ║
║  Trend:           ${consecutiveAdjustments}x ${lastDirection.padEnd(4)} adjustments                   ║
║  Burn Mode:       ${burnModeActive ? '🔥 ACTIVE' : '   Inactive'}                            ║
╚══════════════════════════════════════════════════════════════╝
`;
  }

  private createRateBar(current: number, min: number, max: number): string {
    const range = max - min;
    const position = (current - min) / range;
    const barLength = 20;
    const filledLength = Math.round(position * barLength);

    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    return `[${bar}]`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a floating rate controller
 */
export function createFloatingRateController(
  eventStore: EventStore,
  options?: {
    config?: Partial<FloatingRateConfig>;
    initialRate?: number;
  }
): FloatingRateController {
  const config: FloatingRateConfig = {
    ...DEFAULT_FLOATING_RATE,
    ...options?.config,
  };

  return new FloatingRateController(
    eventStore,
    config,
    options?.initialRate ?? 0.05
  );
}

// ============================================================================
// TAYLOR RULE CALCULATOR
// ============================================================================

/**
 * Calculate rate using simplified Taylor Rule
 *
 * Taylor Rule: r = r* + 0.5(π - π*) + 0.5(y - y*)
 *
 * Where:
 * - r = target interest rate
 * - r* = neutral rate (we use 5%)
 * - π = current inflation
 * - π* = target inflation
 * - y = output gap (we simplify to velocity)
 *
 * This is a simplified version for our virtual economy.
 */
export function calculateTaylorRate(
  currentInflation: number,
  targetInflation: number,
  currentVelocity: number,
  targetVelocity: number = 1.0,
  neutralRate: number = 0.05
): number {
  const inflationGap = currentInflation - targetInflation;
  const velocityGap = currentVelocity - targetVelocity;

  // Taylor coefficients (both 0.5 in original rule)
  const inflationCoeff = 0.5;
  const velocityCoeff = 0.25; // Lower weight for velocity

  const rate = neutralRate + inflationCoeff * inflationGap + velocityCoeff * velocityGap;

  return rate;
}
