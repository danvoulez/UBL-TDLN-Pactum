/**
 * GUARANTEE FUND (Fundo Garantidor)
 *
 * The elegant destination of transaction fees.
 *
 * Purpose:
 * - Accumulate reserves from 0.1% transaction fees
 * - Provide minimum guarantee in case of total system failure
 * - Distribute proportionally to affected entities
 *
 * Like FDIC for banks, but for our virtual economy.
 *
 * Flow:
 *   Transaction Fee (0.1%) → Guarantee Fund → Emergency Distribution
 *
 * Rules:
 * - Fund is UNTOUCHABLE during normal operation
 * - Only accessible when Circuit Breaker trips
 * - Distribution is proportional to entity's balance at trip time
 * - Maximum coverage per entity (avoid whale protection)
 */

import type { EntityId, Timestamp } from '../shared/types';
import { asEntityId } from '../shared/types';
import type { EventStore } from '../store/event-store';
import { toSmallestUnit, fromSmallestUnit } from '../schema/agent-economy';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Fund configuration
 */
export interface GuaranteeFundConfig {
  /** Percentage of transaction fees that go to fund (0-1) */
  feeAllocation: number;  // 1.0 = 100% of fees go to fund
  
  /** Maximum coverage per entity (in UBL) */
  maxCoveragePerEntity: number;  // e.g., 10000 ◆
  
  /** Minimum fund balance before distributions allowed */
  minFundBalance: number;  // e.g., 1000 ◆
  
  /** Coverage percentage (what % of losses we cover) */
  coveragePercentage: number;  // e.g., 0.80 = 80%
  
  /** Target fund size as % of circulating supply */
  targetFundRatio: number;  // e.g., 0.05 = 5% of supply
}

/**
 * Fund state
 */
export interface GuaranteeFundState {
  /** Current fund balance */
  balance: bigint;
  
  /** Total fees collected (all time) */
  totalCollected: bigint;
  
  /** Total distributed (all time) */
  totalDistributed: bigint;
  
  /** Number of distributions made */
  distributionCount: number;
  
  /** Last distribution timestamp */
  lastDistribution?: Timestamp;
  
  /** Is fund locked (normal operation) */
  locked: boolean;
}

/**
 * Distribution claim
 */
export interface DistributionClaim {
  entityId: EntityId;
  balanceAtTrip: bigint;
  eligibleAmount: bigint;
  actualPayout: bigint;
  coverageRatio: number;
}

/**
 * Distribution event
 */
export interface GuaranteeFundDistributionPayload {
  readonly type: 'GuaranteeFundDistribution';
  readonly reason: string;
  readonly triggerEvent: string;  // Circuit breaker trip event ID
  readonly fundBalanceBefore: bigint;
  readonly fundBalanceAfter: bigint;
  readonly totalDistributed: bigint;
  readonly claimCount: number;
  readonly claims: readonly DistributionClaim[];
  readonly coverageRatio: number;  // What % of losses were covered
}

/**
 * Fee deposit event
 */
export interface GuaranteeFundDepositPayload {
  readonly type: 'GuaranteeFundDeposit';
  readonly amount: bigint;
  readonly sourceTransaction: EntityId;
  readonly newBalance: bigint;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_FUND_CONFIG: GuaranteeFundConfig = {
  feeAllocation: 1.0,           // 100% of fees go to fund
  maxCoveragePerEntity: 10000,  // Max 10,000 ◆ per entity
  minFundBalance: 1000,         // Need at least 1,000 ◆ to distribute
  coveragePercentage: 0.80,     // Cover 80% of losses
  targetFundRatio: 0.05,        // Target 5% of circulating supply
};

// ============================================================================
// GUARANTEE FUND
// ============================================================================

/**
 * Guarantee Fund Manager
 *
 * Manages the reserve fund that protects entities in case of system failure.
 */
export class GuaranteeFund {
  private readonly eventStore: EventStore;
  private readonly config: GuaranteeFundConfig;
  private state: GuaranteeFundState;

  constructor(
    eventStore: EventStore,
    config: GuaranteeFundConfig = DEFAULT_FUND_CONFIG
  ) {
    this.eventStore = eventStore;
    this.config = config;
    this.state = {
      balance: BigInt(0),
      totalCollected: BigInt(0),
      totalDistributed: BigInt(0),
      distributionCount: 0,
      locked: true,
    };
  }

  /**
   * Get current state
   */
  getState(): GuaranteeFundState {
    return { ...this.state };
  }

  /**
   * Get current balance
   */
  getBalance(): bigint {
    return this.state.balance;
  }

  /**
   * Get balance in UBL (not smallest unit)
   */
  getBalanceUBL(): number {
    return fromSmallestUnit(this.state.balance);
  }

  /**
   * Check if fund is healthy (at target ratio)
   */
  isHealthy(circulatingSupply: bigint): boolean {
    if (circulatingSupply === BigInt(0)) return true;
    const ratio = Number(this.state.balance) / Number(circulatingSupply);
    return ratio >= this.config.targetFundRatio;
  }

  /**
   * Get fund health percentage
   */
  getHealthPercentage(circulatingSupply: bigint): number {
    if (circulatingSupply === BigInt(0)) return 100;
    const currentRatio = Number(this.state.balance) / Number(circulatingSupply);
    return Math.min(100, (currentRatio / this.config.targetFundRatio) * 100);
  }

  /**
   * Deposit transaction fee into fund
   */
  async deposit(
    amount: bigint,
    sourceTransaction: EntityId,
    actor: { type: 'System'; systemId: string }
  ): Promise<void> {
    // Calculate allocation (usually 100%)
    const allocated = (amount * BigInt(Math.round(this.config.feeAllocation * 1000))) / BigInt(1000);
    
    this.state.balance += allocated;
    this.state.totalCollected += allocated;

    // Record event
    const eventPayload: GuaranteeFundDepositPayload = {
      type: 'GuaranteeFundDeposit',
      amount: allocated,
      sourceTransaction,
      newBalance: this.state.balance,
    };

    await this.eventStore.append({
      type: 'GuaranteeFundDeposit',
      aggregateId: asEntityId('guarantee-fund'),
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });
  }

  /**
   * Unlock fund for distribution (called by circuit breaker)
   */
  unlock(): void {
    this.state.locked = false;
  }

  /**
   * Lock fund (after distribution or reset)
   */
  lock(): void {
    this.state.locked = true;
  }

  /**
   * Calculate distribution for affected entities
   */
  calculateDistribution(
    affectedEntities: Array<{ entityId: EntityId; balance: bigint }>
  ): {
    claims: DistributionClaim[];
    totalPayout: bigint;
    coverageRatio: number;
    fundSufficient: boolean;
  } {
    const maxCoverage = toSmallestUnit(this.config.maxCoveragePerEntity);
    const coverageRate = this.config.coveragePercentage;

    // Calculate eligible amounts
    const claims: DistributionClaim[] = affectedEntities.map(entity => {
      // Eligible = min(balance, maxCoverage) * coverageRate
      const cappedBalance = entity.balance < maxCoverage ? entity.balance : maxCoverage;
      const eligible = (cappedBalance * BigInt(Math.round(coverageRate * 1000))) / BigInt(1000);
      
      return {
        entityId: entity.entityId,
        balanceAtTrip: entity.balance,
        eligibleAmount: eligible,
        actualPayout: BigInt(0), // Will be calculated
        coverageRatio: 0,
      };
    });

    // Total eligible
    const totalEligible = claims.reduce((sum, c) => sum + c.eligibleAmount, BigInt(0));

    // If fund can cover everything
    if (this.state.balance >= totalEligible) {
      for (const claim of claims) {
        claim.actualPayout = claim.eligibleAmount;
        claim.coverageRatio = 1.0;
      }
      return {
        claims,
        totalPayout: totalEligible,
        coverageRatio: 1.0,
        fundSufficient: true,
      };
    }

    // Fund insufficient - distribute proportionally
    const ratio = Number(this.state.balance) / Number(totalEligible);
    for (const claim of claims) {
      claim.actualPayout = (claim.eligibleAmount * BigInt(Math.round(ratio * 1000))) / BigInt(1000);
      claim.coverageRatio = ratio;
    }

    const totalPayout = claims.reduce((sum, c) => sum + c.actualPayout, BigInt(0));

    return {
      claims,
      totalPayout,
      coverageRatio: ratio,
      fundSufficient: false,
    };
  }

  /**
   * Execute distribution (only when unlocked)
   */
  async distribute(
    affectedEntities: Array<{ entityId: EntityId; balance: bigint }>,
    reason: string,
    triggerEvent: string,
    actor: { type: 'Entity'; entityId: EntityId }
  ): Promise<{
    success: boolean;
    distribution?: {
      claims: DistributionClaim[];
      totalPayout: bigint;
      coverageRatio: number;
    };
    error?: string;
  }> {
    // Check if unlocked
    if (this.state.locked) {
      return {
        success: false,
        error: 'Fund is locked. Must be unlocked by circuit breaker first.',
      };
    }

    // Check minimum balance
    if (this.state.balance < toSmallestUnit(this.config.minFundBalance)) {
      return {
        success: false,
        error: `Fund balance (${this.getBalanceUBL()} ◆) below minimum (${this.config.minFundBalance} ◆)`,
      };
    }

    // Calculate distribution
    const { claims, totalPayout, coverageRatio, fundSufficient } = 
      this.calculateDistribution(affectedEntities);

    const fundBalanceBefore = this.state.balance;

    // Update state
    this.state.balance -= totalPayout;
    this.state.totalDistributed += totalPayout;
    this.state.distributionCount++;
    this.state.lastDistribution = Date.now();

    // Record event
    const eventPayload: GuaranteeFundDistributionPayload = {
      type: 'GuaranteeFundDistribution',
      reason,
      triggerEvent,
      fundBalanceBefore,
      fundBalanceAfter: this.state.balance,
      totalDistributed: totalPayout,
      claimCount: claims.length,
      claims,
      coverageRatio,
    };

    await this.eventStore.append({
      type: 'GuaranteeFundDistribution',
      aggregateId: asEntityId('guarantee-fund'),
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    // Log distribution
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           GUARANTEE FUND DISTRIBUTION                        ║
╠══════════════════════════════════════════════════════════════╣
║  Reason: ${reason.slice(0, 50).padEnd(50)}║
║  Affected Entities: ${String(claims.length).padEnd(39)}║
║  Total Payout: ${fromSmallestUnit(totalPayout).toLocaleString().padEnd(44)}◆║
║  Coverage Ratio: ${(coverageRatio * 100).toFixed(1)}%${fundSufficient ? ' (FULL)' : ' (PARTIAL)'}                          ║
║  Fund Balance After: ${fromSmallestUnit(this.state.balance).toLocaleString().padEnd(38)}◆║
╚══════════════════════════════════════════════════════════════╝
`);

    // Re-lock after distribution
    this.lock();

    return {
      success: true,
      distribution: { claims, totalPayout, coverageRatio },
    };
  }

  /**
   * Format state for display
   */
  formatState(circulatingSupply?: bigint): string {
    const { balance, totalCollected, totalDistributed, distributionCount, locked } = this.state;
    const healthPct = circulatingSupply ? this.getHealthPercentage(circulatingSupply) : 0;
    const healthBar = this.createHealthBar(healthPct);

    return `
╔══════════════════════════════════════════════════════════════╗
║              GUARANTEE FUND STATUS                           ║
╠══════════════════════════════════════════════════════════════╣
║  Balance:        ${fromSmallestUnit(balance).toLocaleString().padEnd(12)} ◆                        ║
║  Status:         ${locked ? '🔒 LOCKED (Normal)' : '🔓 UNLOCKED (Emergency)'}               ║
║                                                              ║
║  Health:         ${healthBar} ${healthPct.toFixed(0).padStart(3)}%              ║
║  Target:         ${(this.config.targetFundRatio * 100).toFixed(0)}% of circulating supply                  ║
║                                                              ║
║  Total Collected:    ${fromSmallestUnit(totalCollected).toLocaleString().padEnd(12)} ◆                    ║
║  Total Distributed:  ${fromSmallestUnit(totalDistributed).toLocaleString().padEnd(12)} ◆                    ║
║  Distributions:      ${String(distributionCount).padEnd(12)}                        ║
║                                                              ║
║  Coverage:       ${(this.config.coveragePercentage * 100).toFixed(0)}% of losses, max ${this.config.maxCoveragePerEntity.toLocaleString()} ◆/entity     ║
╚══════════════════════════════════════════════════════════════╝
`;
  }

  private createHealthBar(percentage: number): string {
    const filled = Math.round(percentage / 5); // 20 chars = 100%
    const bar = '█'.repeat(Math.min(20, filled)) + '░'.repeat(Math.max(0, 20 - filled));
    return `[${bar}]`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a guarantee fund
 */
export function createGuaranteeFund(
  eventStore: EventStore,
  config?: Partial<GuaranteeFundConfig>
): GuaranteeFund {
  const fullConfig: GuaranteeFundConfig = {
    ...DEFAULT_FUND_CONFIG,
    ...config,
  };

  return new GuaranteeFund(eventStore, fullConfig);
}

// ============================================================================
// INTEGRATION WITH CIRCUIT BREAKER
// ============================================================================

/**
 * Connect guarantee fund to circuit breaker
 *
 * When circuit breaker trips, unlock the fund for distribution.
 */
export function connectToCircuitBreaker(
  fund: GuaranteeFund,
  circuitBreaker: { onTrip: (handler: (state: any) => void) => void }
): void {
  circuitBreaker.onTrip((state) => {
    console.log('🔓 Guarantee Fund UNLOCKED due to circuit breaker trip');
    fund.unlock();
  });
}
