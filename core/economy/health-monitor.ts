/**
 * ECONOMIC HEALTH MONITOR
 *
 * Real-time monitoring of UBL economy health with automatic correction triggers.
 *
 * KPIs tracked:
 * - M0 (Monetary Base): Total minted - burned
 * - Velocity: Transaction volume / M0
 * - Gini Coefficient: Wealth distribution
 * - Loan Health: Default rate, repayment rate
 * - Inflation Rate: Price level changes
 *
 * Triggers:
 * - High inflation → Increase transaction fee
 * - Low velocity → Decrease transaction fee
 * - High default rate → Tighten loan criteria
 * - Concentration risk → Alert
 */

import type { EntityId, Timestamp } from '../shared/types';
import type { EventStore } from '../store/event-store';
import { fromSmallestUnit, toSmallestUnit } from '../schema/agent-economy';

// ============================================================================
// KPI TYPES
// ============================================================================

/**
 * Core economic metrics
 */
export interface EconomicKPIs {
  /** Timestamp of calculation */
  readonly calculatedAt: Timestamp;

  /** Monetary metrics */
  readonly monetary: {
    /** Total ever minted */
    readonly totalMinted: bigint;
    /** Total ever burned */
    readonly totalBurned: bigint;
    /** Current circulating supply (M0) */
    readonly circulatingSupply: bigint;
    /** Total in Treasury wallet */
    readonly treasuryBalance: bigint;
  };

  /** Transaction metrics */
  readonly transactions: {
    /** Total transaction count (all time) */
    readonly totalCount: number;
    /** Transaction count in last period */
    readonly periodCount: number;
    /** Total volume (all time) */
    readonly totalVolume: bigint;
    /** Volume in last period */
    readonly periodVolume: bigint;
    /** Total fees collected */
    readonly totalFees: bigint;
    /** Fees in last period */
    readonly periodFees: bigint;
  };

  /** Velocity metrics */
  readonly velocity: {
    /** V = periodVolume / circulatingSupply */
    readonly current: number;
    /** Historical average */
    readonly average: number;
    /** Trend: 'increasing' | 'stable' | 'decreasing' */
    readonly trend: 'increasing' | 'stable' | 'decreasing';
  };

  /** Loan metrics */
  readonly loans: {
    /** Total loans disbursed */
    readonly totalDisbursed: number;
    /** Currently active loans */
    readonly activeLoans: number;
    /** Total principal outstanding */
    readonly outstandingPrincipal: bigint;
    /** Loans fully repaid */
    readonly repaidLoans: number;
    /** Loans in default */
    readonly defaultedLoans: number;
    /** Default rate (defaulted / total) */
    readonly defaultRate: number;
    /** Average repayment time (days) */
    readonly avgRepaymentDays: number;
  };

  /** Distribution metrics */
  readonly distribution: {
    /** Total wallets */
    readonly totalWallets: number;
    /** Active wallets (transacted in period) */
    readonly activeWallets: number;
    /** Gini coefficient (0 = perfect equality, 1 = perfect inequality) */
    readonly giniCoefficient: number;
    /** Top 10% hold what % of supply */
    readonly top10Percent: number;
    /** Median wallet balance */
    readonly medianBalance: bigint;
  };

  /** Agent metrics */
  readonly agents: {
    /** Total registered agents */
    readonly totalAgents: number;
    /** Active agents (worked in period) */
    readonly activeAgents: number;
    /** Total trajectory spans recorded */
    readonly totalTrajectorySpans: number;
    /** Average cost per agent (LLM costs) */
    readonly avgCostPerAgent: bigint;
  };
}

/**
 * Health status levels
 */
export type HealthLevel = 'healthy' | 'warning' | 'critical';

/**
 * Health assessment for each area
 */
export interface HealthAssessment {
  readonly overall: HealthLevel;
  readonly areas: {
    readonly inflation: { level: HealthLevel; message: string };
    readonly velocity: { level: HealthLevel; message: string };
    readonly loans: { level: HealthLevel; message: string };
    readonly distribution: { level: HealthLevel; message: string };
  };
  readonly alerts: readonly EconomicAlert[];
  readonly recommendations: readonly string[];
}

/**
 * Economic alert
 */
export interface EconomicAlert {
  readonly id: string;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly type: EconomicAlertType;
  readonly message: string;
  readonly metric: string;
  readonly currentValue: number;
  readonly threshold: number;
  readonly suggestedAction?: string;
  readonly timestamp: Timestamp;
}

export type EconomicAlertType =
  | 'HIGH_INFLATION'
  | 'LOW_VELOCITY'
  | 'HIGH_DEFAULT_RATE'
  | 'CONCENTRATION_RISK'
  | 'RAPID_SUPPLY_GROWTH'
  | 'LOW_ACTIVITY'
  | 'TREASURY_LOW'
  | 'TREASURY_HIGH';

/**
 * Correction action that can be triggered automatically
 */
export interface CorrectionAction {
  readonly type: CorrectionType;
  readonly reason: string;
  readonly parameters: Record<string, unknown>;
  readonly automatic: boolean;
  readonly requiresApproval: boolean;
}

export type CorrectionType =
  | 'ADJUST_TRANSACTION_FEE'
  | 'ADJUST_INTEREST_RATE'
  | 'PAUSE_NEW_LOANS'
  | 'RESUME_LOANS'
  | 'EMIT_ALERT'
  | 'BURN_TREASURY_EXCESS';

// ============================================================================
// THRESHOLDS
// ============================================================================

/**
 * Configurable thresholds for health monitoring
 */
export interface HealthThresholds {
  /** Inflation thresholds (supply growth rate per period) */
  readonly inflation: {
    readonly warning: number;  // e.g., 0.05 = 5% growth
    readonly critical: number; // e.g., 0.10 = 10% growth
  };

  /** Velocity thresholds */
  readonly velocity: {
    readonly lowWarning: number;  // e.g., 0.1 = very slow
    readonly lowCritical: number; // e.g., 0.05 = stagnant
    readonly highWarning: number; // e.g., 5.0 = too fast
  };

  /** Loan health thresholds */
  readonly loans: {
    readonly defaultRateWarning: number;  // e.g., 0.05 = 5%
    readonly defaultRateCritical: number; // e.g., 0.10 = 10%
  };

  /** Distribution thresholds */
  readonly distribution: {
    readonly giniWarning: number;  // e.g., 0.6
    readonly giniCritical: number; // e.g., 0.8
    readonly top10Warning: number; // e.g., 0.5 = top 10% holds 50%
  };

  /** Treasury thresholds (as % of circulating supply) */
  readonly treasury: {
    readonly lowWarning: number;  // e.g., 0.01 = 1%
    readonly highWarning: number; // e.g., 0.20 = 20%
  };
}

/**
 * Default thresholds
 */
export const DEFAULT_THRESHOLDS: HealthThresholds = {
  inflation: {
    warning: 0.05,  // 5% supply growth per period
    critical: 0.10, // 10% supply growth per period
  },
  velocity: {
    lowWarning: 0.1,
    lowCritical: 0.05,
    highWarning: 5.0,
  },
  loans: {
    defaultRateWarning: 0.05,  // 5% default rate
    defaultRateCritical: 0.10, // 10% default rate
  },
  distribution: {
    giniWarning: 0.6,
    giniCritical: 0.8,
    top10Warning: 0.5,
  },
  treasury: {
    lowWarning: 0.01,  // Treasury should have at least 1% of supply
    highWarning: 0.20, // Treasury shouldn't hoard more than 20%
  },
};

// ============================================================================
// HEALTH MONITOR
// ============================================================================

/**
 * Economic Health Monitor
 *
 * Calculates KPIs from event store and triggers corrections when needed.
 */
export class EconomicHealthMonitor {
  private readonly eventStore: EventStore;
  private readonly thresholds: HealthThresholds;
  private readonly periodMs: number;
  private lastKPIs: EconomicKPIs | null = null;
  private previousSupply: bigint = BigInt(0);
  private alertHandlers: Array<(alert: EconomicAlert) => void> = [];
  private correctionHandlers: Array<(action: CorrectionAction) => Promise<void>> = [];

  constructor(
    eventStore: EventStore,
    thresholds: HealthThresholds = DEFAULT_THRESHOLDS,
    periodMs: number = 24 * 60 * 60 * 1000 // 24 hours default
  ) {
    this.eventStore = eventStore;
    this.thresholds = thresholds;
    this.periodMs = periodMs;
  }

  /**
   * Register alert handler
   */
  onAlert(handler: (alert: EconomicAlert) => void): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Register correction handler
   */
  onCorrection(handler: (action: CorrectionAction) => Promise<void>): void {
    this.correctionHandlers.push(handler);
  }

  /**
   * Calculate all KPIs from event store
   */
  async calculateKPIs(): Promise<EconomicKPIs> {
    const now = Date.now();
    const periodStart = now - this.periodMs;

    // Initialize counters
    let totalMinted = BigInt(0);
    let totalBurned = BigInt(0);
    let treasuryBalance = BigInt(0);

    let totalTxCount = 0;
    let periodTxCount = 0;
    let totalVolume = BigInt(0);
    let periodVolume = BigInt(0);
    let totalFees = BigInt(0);
    let periodFees = BigInt(0);

    let totalLoans = 0;
    let repaidLoans = 0;
    let defaultedLoans = 0;
    let outstandingPrincipal = BigInt(0);
    const loanRepaymentTimes: number[] = [];

    const walletBalances = new Map<string, bigint>();
    const activeWalletsInPeriod = new Set<string>();

    let totalAgents = 0;
    let activeAgentsInPeriod = new Set<string>();
    let totalTrajectorySpans = 0;
    let totalAgentCosts = BigInt(0);

    // Scan all events
    const currentSeq = await this.eventStore.getCurrentSequence();
    for await (const event of this.eventStore.getBySequence(BigInt(0), currentSeq)) {
      const timestamp = Number(event.timestamp);
      const isInPeriod = timestamp >= periodStart;
      const payload = event.payload as Record<string, unknown>;

      switch (event.type) {
        case 'CreditsMinted': {
          const amount = BigInt(payload.amount as bigint);
          totalMinted += amount;
          const toWallet = payload.toWalletId as string;
          walletBalances.set(toWallet, (walletBalances.get(toWallet) || BigInt(0)) + amount);
          break;
        }

        case 'CreditsBurned': {
          const amount = BigInt(payload.amount as bigint);
          totalBurned += amount;
          const fromWallet = payload.fromWalletId as string;
          walletBalances.set(fromWallet, (walletBalances.get(fromWallet) || BigInt(0)) - amount);
          break;
        }

        case 'CreditsTransferred': {
          const amount = BigInt(payload.amount as bigint);
          const fromWallet = payload.fromWalletId as string;
          const toWallet = payload.toWalletId as string;

          // Update balances
          walletBalances.set(fromWallet, (walletBalances.get(fromWallet) || BigInt(0)) - amount);
          walletBalances.set(toWallet, (walletBalances.get(toWallet) || BigInt(0)) + amount);

          // Track transaction metrics
          totalTxCount++;
          totalVolume += amount;

          if (isInPeriod) {
            periodTxCount++;
            periodVolume += amount;
            activeWalletsInPeriod.add(fromWallet);
            activeWalletsInPeriod.add(toWallet);
          }

          // Check if it's a fee (to treasury)
          if (toWallet === 'treasury-wallet' && (payload.purpose as string)?.includes('fee')) {
            totalFees += amount;
            if (isInPeriod) periodFees += amount;
          }
          break;
        }

        case 'WalletCreated': {
          const walletId = payload.walletId as string;
          if (!walletBalances.has(walletId)) {
            walletBalances.set(walletId, BigInt(0));
          }
          break;
        }

        case 'LoanDisbursed': {
          totalLoans++;
          const principal = BigInt(payload.principal as bigint);
          outstandingPrincipal += principal;
          break;
        }

        case 'LoanRepaymentMade': {
          const principalPortion = BigInt(payload.principalPortion as bigint);
          outstandingPrincipal -= principalPortion;

          const remaining = BigInt(payload.remainingBalance as bigint);
          if (remaining === BigInt(0)) {
            repaidLoans++;
          }
          break;
        }

        case 'LoanDefaulted': {
          defaultedLoans++;
          break;
        }

        case 'AgentRegistered': {
          totalAgents++;
          break;
        }

        case 'TrajectorySpanRecorded': {
          totalTrajectorySpans++;
          const span = payload.span as Record<string, unknown>;
          const entityId = span.entityId as string;
          const execution = span.execution as Record<string, unknown>;
          const cost = BigInt(execution.cost as bigint || 0);

          totalAgentCosts += cost;

          if (isInPeriod) {
            activeAgentsInPeriod.add(entityId);
          }
          break;
        }
      }
    }

    // Calculate derived metrics
    const circulatingSupply = totalMinted - totalBurned;
    treasuryBalance = walletBalances.get('treasury-wallet') || BigInt(0);

    // Velocity
    const velocityCurrent = circulatingSupply > BigInt(0)
      ? Number(periodVolume) / Number(circulatingSupply)
      : 0;

    // Determine velocity trend
    let velocityTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    if (this.lastKPIs) {
      const diff = velocityCurrent - this.lastKPIs.velocity.current;
      if (diff > 0.1) velocityTrend = 'increasing';
      else if (diff < -0.1) velocityTrend = 'decreasing';
    }

    // Gini coefficient calculation
    const balances = Array.from(walletBalances.values())
      .filter(b => b > BigInt(0))
      .map(b => Number(b))
      .sort((a, b) => a - b);

    const gini = this.calculateGini(balances);

    // Top 10% concentration
    const top10Count = Math.max(1, Math.ceil(balances.length * 0.1));
    const top10Sum = balances.slice(-top10Count).reduce((a, b) => a + b, 0);
    const totalSum = balances.reduce((a, b) => a + b, 0);
    const top10Percent = totalSum > 0 ? top10Sum / totalSum : 0;

    // Median balance
    const medianBalance = balances.length > 0
      ? BigInt(Math.floor(balances[Math.floor(balances.length / 2)]))
      : BigInt(0);

    // Active loans
    const activeLoans = totalLoans - repaidLoans - defaultedLoans;

    // Default rate
    const defaultRate = totalLoans > 0 ? defaultedLoans / totalLoans : 0;

    // Average cost per agent
    const avgCostPerAgent = totalAgents > 0
      ? totalAgentCosts / BigInt(totalAgents)
      : BigInt(0);

    const kpis: EconomicKPIs = {
      calculatedAt: now,
      monetary: {
        totalMinted,
        totalBurned,
        circulatingSupply,
        treasuryBalance,
      },
      transactions: {
        totalCount: totalTxCount,
        periodCount: periodTxCount,
        totalVolume,
        periodVolume,
        totalFees,
        periodFees,
      },
      velocity: {
        current: velocityCurrent,
        average: this.lastKPIs
          ? (this.lastKPIs.velocity.average + velocityCurrent) / 2
          : velocityCurrent,
        trend: velocityTrend,
      },
      loans: {
        totalDisbursed: totalLoans,
        activeLoans,
        outstandingPrincipal,
        repaidLoans,
        defaultedLoans,
        defaultRate,
        avgRepaymentDays: loanRepaymentTimes.length > 0
          ? loanRepaymentTimes.reduce((a, b) => a + b, 0) / loanRepaymentTimes.length
          : 0,
      },
      distribution: {
        totalWallets: walletBalances.size,
        activeWallets: activeWalletsInPeriod.size,
        giniCoefficient: gini,
        top10Percent,
        medianBalance,
      },
      agents: {
        totalAgents,
        activeAgents: activeAgentsInPeriod.size,
        totalTrajectorySpans,
        avgCostPerAgent,
      },
    };

    this.previousSupply = this.lastKPIs?.monetary.circulatingSupply || BigInt(0);
    this.lastKPIs = kpis;

    return kpis;
  }

  /**
   * Assess health based on KPIs
   */
  assessHealth(kpis: EconomicKPIs): HealthAssessment {
    const alerts: EconomicAlert[] = [];
    const recommendations: string[] = [];

    // Calculate inflation rate
    const inflationRate = this.previousSupply > BigInt(0)
      ? Number(kpis.monetary.circulatingSupply - this.previousSupply) / Number(this.previousSupply)
      : 0;

    // Assess inflation
    let inflationLevel: HealthLevel = 'healthy';
    let inflationMessage = 'Supply growth is within normal range';

    if (inflationRate > this.thresholds.inflation.critical) {
      inflationLevel = 'critical';
      inflationMessage = `Supply growing too fast: ${(inflationRate * 100).toFixed(1)}%`;
      alerts.push({
        id: `inflation-${Date.now()}`,
        severity: 'critical',
        type: 'HIGH_INFLATION',
        message: inflationMessage,
        metric: 'inflationRate',
        currentValue: inflationRate,
        threshold: this.thresholds.inflation.critical,
        suggestedAction: 'Consider increasing transaction fee or pausing new loans',
        timestamp: Date.now(),
      });
      recommendations.push('Increase transaction fee to 0.2% to slow money creation');
    } else if (inflationRate > this.thresholds.inflation.warning) {
      inflationLevel = 'warning';
      inflationMessage = `Supply growth elevated: ${(inflationRate * 100).toFixed(1)}%`;
      alerts.push({
        id: `inflation-${Date.now()}`,
        severity: 'warning',
        type: 'HIGH_INFLATION',
        message: inflationMessage,
        metric: 'inflationRate',
        currentValue: inflationRate,
        threshold: this.thresholds.inflation.warning,
        timestamp: Date.now(),
      });
    }

    // Assess velocity
    let velocityLevel: HealthLevel = 'healthy';
    let velocityMessage = 'Transaction velocity is healthy';

    if (kpis.velocity.current < this.thresholds.velocity.lowCritical) {
      velocityLevel = 'critical';
      velocityMessage = `Economy is stagnant: velocity ${kpis.velocity.current.toFixed(2)}`;
      alerts.push({
        id: `velocity-${Date.now()}`,
        severity: 'critical',
        type: 'LOW_VELOCITY',
        message: velocityMessage,
        metric: 'velocity',
        currentValue: kpis.velocity.current,
        threshold: this.thresholds.velocity.lowCritical,
        suggestedAction: 'Consider reducing transaction fee to encourage activity',
        timestamp: Date.now(),
      });
      recommendations.push('Reduce transaction fee to 0.05% to encourage transactions');
    } else if (kpis.velocity.current < this.thresholds.velocity.lowWarning) {
      velocityLevel = 'warning';
      velocityMessage = `Low transaction activity: velocity ${kpis.velocity.current.toFixed(2)}`;
    } else if (kpis.velocity.current > this.thresholds.velocity.highWarning) {
      velocityLevel = 'warning';
      velocityMessage = `Unusually high velocity: ${kpis.velocity.current.toFixed(2)}`;
    }

    // Assess loans
    let loansLevel: HealthLevel = 'healthy';
    let loansMessage = 'Loan portfolio is healthy';

    if (kpis.loans.defaultRate > this.thresholds.loans.defaultRateCritical) {
      loansLevel = 'critical';
      loansMessage = `High default rate: ${(kpis.loans.defaultRate * 100).toFixed(1)}%`;
      alerts.push({
        id: `loans-${Date.now()}`,
        severity: 'critical',
        type: 'HIGH_DEFAULT_RATE',
        message: loansMessage,
        metric: 'defaultRate',
        currentValue: kpis.loans.defaultRate,
        threshold: this.thresholds.loans.defaultRateCritical,
        suggestedAction: 'Pause new loans and review guardian requirements',
        timestamp: Date.now(),
      });
      recommendations.push('Pause new starter loans until default rate improves');
      recommendations.push('Require stronger guardian guarantees');
    } else if (kpis.loans.defaultRate > this.thresholds.loans.defaultRateWarning) {
      loansLevel = 'warning';
      loansMessage = `Elevated default rate: ${(kpis.loans.defaultRate * 100).toFixed(1)}%`;
    }

    // Assess distribution
    let distributionLevel: HealthLevel = 'healthy';
    let distributionMessage = 'Wealth distribution is acceptable';

    if (kpis.distribution.giniCoefficient > this.thresholds.distribution.giniCritical) {
      distributionLevel = 'critical';
      distributionMessage = `Severe wealth concentration: Gini ${kpis.distribution.giniCoefficient.toFixed(2)}`;
      alerts.push({
        id: `distribution-${Date.now()}`,
        severity: 'critical',
        type: 'CONCENTRATION_RISK',
        message: distributionMessage,
        metric: 'giniCoefficient',
        currentValue: kpis.distribution.giniCoefficient,
        threshold: this.thresholds.distribution.giniCritical,
        timestamp: Date.now(),
      });
    } else if (kpis.distribution.giniCoefficient > this.thresholds.distribution.giniWarning) {
      distributionLevel = 'warning';
      distributionMessage = `Wealth concentration increasing: Gini ${kpis.distribution.giniCoefficient.toFixed(2)}`;
    }

    if (kpis.distribution.top10Percent > this.thresholds.distribution.top10Warning) {
      alerts.push({
        id: `top10-${Date.now()}`,
        severity: 'warning',
        type: 'CONCENTRATION_RISK',
        message: `Top 10% holds ${(kpis.distribution.top10Percent * 100).toFixed(0)}% of supply`,
        metric: 'top10Percent',
        currentValue: kpis.distribution.top10Percent,
        threshold: this.thresholds.distribution.top10Warning,
        timestamp: Date.now(),
      });
    }

    // Treasury health
    const treasuryRatio = kpis.monetary.circulatingSupply > BigInt(0)
      ? Number(kpis.monetary.treasuryBalance) / Number(kpis.monetary.circulatingSupply)
      : 0;

    if (treasuryRatio < this.thresholds.treasury.lowWarning) {
      alerts.push({
        id: `treasury-low-${Date.now()}`,
        severity: 'warning',
        type: 'TREASURY_LOW',
        message: `Treasury balance low: ${(treasuryRatio * 100).toFixed(1)}% of supply`,
        metric: 'treasuryRatio',
        currentValue: treasuryRatio,
        threshold: this.thresholds.treasury.lowWarning,
        timestamp: Date.now(),
      });
    } else if (treasuryRatio > this.thresholds.treasury.highWarning) {
      alerts.push({
        id: `treasury-high-${Date.now()}`,
        severity: 'info',
        type: 'TREASURY_HIGH',
        message: `Treasury accumulating: ${(treasuryRatio * 100).toFixed(1)}% of supply`,
        metric: 'treasuryRatio',
        currentValue: treasuryRatio,
        threshold: this.thresholds.treasury.highWarning,
        suggestedAction: 'Consider redistributing or burning excess',
        timestamp: Date.now(),
      });
    }

    // Determine overall health
    const levels = [inflationLevel, velocityLevel, loansLevel, distributionLevel];
    let overall: HealthLevel = 'healthy';
    if (levels.includes('critical')) overall = 'critical';
    else if (levels.includes('warning')) overall = 'warning';

    // Emit alerts
    for (const alert of alerts) {
      for (const handler of this.alertHandlers) {
        handler(alert);
      }
    }

    return {
      overall,
      areas: {
        inflation: { level: inflationLevel, message: inflationMessage },
        velocity: { level: velocityLevel, message: velocityMessage },
        loans: { level: loansLevel, message: loansMessage },
        distribution: { level: distributionLevel, message: distributionMessage },
      },
      alerts,
      recommendations,
    };
  }

  /**
   * Generate correction actions based on health assessment
   */
  async generateCorrections(assessment: HealthAssessment): Promise<CorrectionAction[]> {
    const actions: CorrectionAction[] = [];

    for (const alert of assessment.alerts) {
      switch (alert.type) {
        case 'HIGH_INFLATION':
          if (alert.severity === 'critical') {
            actions.push({
              type: 'ADJUST_TRANSACTION_FEE',
              reason: alert.message,
              parameters: { newRate: 0.002 }, // Increase to 0.2%
              automatic: false, // Requires approval
              requiresApproval: true,
            });
            actions.push({
              type: 'PAUSE_NEW_LOANS',
              reason: 'High inflation - pausing new loans',
              parameters: {},
              automatic: true,
              requiresApproval: false,
            });
          }
          break;

        case 'LOW_VELOCITY':
          if (alert.severity === 'critical') {
            actions.push({
              type: 'ADJUST_TRANSACTION_FEE',
              reason: alert.message,
              parameters: { newRate: 0.0005 }, // Decrease to 0.05%
              automatic: false,
              requiresApproval: true,
            });
          }
          break;

        case 'HIGH_DEFAULT_RATE':
          if (alert.severity === 'critical') {
            actions.push({
              type: 'PAUSE_NEW_LOANS',
              reason: alert.message,
              parameters: {},
              automatic: true,
              requiresApproval: false,
            });
            actions.push({
              type: 'ADJUST_INTEREST_RATE',
              reason: 'Increase rate to compensate for defaults',
              parameters: { newRate: 0.08 }, // Increase to 8%
              automatic: false,
              requiresApproval: true,
            });
          }
          break;

        case 'TREASURY_HIGH':
          actions.push({
            type: 'BURN_TREASURY_EXCESS',
            reason: alert.message,
            parameters: { targetRatio: 0.10 }, // Burn down to 10%
            automatic: false,
            requiresApproval: true,
          });
          break;
      }
    }

    // Execute automatic corrections
    for (const action of actions) {
      if (action.automatic && !action.requiresApproval) {
        for (const handler of this.correctionHandlers) {
          await handler(action);
        }
      }
    }

    return actions;
  }

  /**
   * Run full health check cycle
   */
  async runHealthCheck(): Promise<{
    kpis: EconomicKPIs;
    assessment: HealthAssessment;
    corrections: CorrectionAction[];
  }> {
    const kpis = await this.calculateKPIs();
    const assessment = this.assessHealth(kpis);
    const corrections = await this.generateCorrections(assessment);

    return { kpis, assessment, corrections };
  }

  /**
   * Calculate Gini coefficient
   */
  private calculateGini(sortedValues: number[]): number {
    const n = sortedValues.length;
    if (n === 0) return 0;

    const sum = sortedValues.reduce((a, b) => a + b, 0);
    if (sum === 0) return 0;

    let numerator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (2 * (i + 1) - n - 1) * sortedValues[i];
    }

    return numerator / (n * sum);
  }

  /**
   * Format KPIs for display
   */
  formatKPIs(kpis: EconomicKPIs): string {
    return `
═══════════════════════════════════════════════════════════════
                    UBL ECONOMIC HEALTH REPORT
                    ${new Date(kpis.calculatedAt).toISOString()}
═══════════════════════════════════════════════════════════════

💰 MONETARY
   Circulating Supply: ${fromSmallestUnit(kpis.monetary.circulatingSupply).toLocaleString()} ◆
   Total Minted:       ${fromSmallestUnit(kpis.monetary.totalMinted).toLocaleString()} ◆
   Total Burned:       ${fromSmallestUnit(kpis.monetary.totalBurned).toLocaleString()} ◆
   Treasury Balance:   ${fromSmallestUnit(kpis.monetary.treasuryBalance).toLocaleString()} ◆

📊 TRANSACTIONS (Last Period)
   Count:              ${kpis.transactions.periodCount.toLocaleString()}
   Volume:             ${fromSmallestUnit(kpis.transactions.periodVolume).toLocaleString()} ◆
   Fees Collected:     ${fromSmallestUnit(kpis.transactions.periodFees).toLocaleString()} ◆
   Velocity:           ${kpis.velocity.current.toFixed(2)} (${kpis.velocity.trend})

🏦 LOANS
   Active Loans:       ${kpis.loans.activeLoans}
   Outstanding:        ${fromSmallestUnit(kpis.loans.outstandingPrincipal).toLocaleString()} ◆
   Default Rate:       ${(kpis.loans.defaultRate * 100).toFixed(1)}%
   Repaid:             ${kpis.loans.repaidLoans}

📈 DISTRIBUTION
   Total Wallets:      ${kpis.distribution.totalWallets}
   Active Wallets:     ${kpis.distribution.activeWallets}
   Gini Coefficient:   ${kpis.distribution.giniCoefficient.toFixed(2)}
   Top 10% Holds:      ${(kpis.distribution.top10Percent * 100).toFixed(0)}%

🤖 AGENTS
   Total Agents:       ${kpis.agents.totalAgents}
   Active Agents:      ${kpis.agents.activeAgents}
   Trajectory Spans:   ${kpis.agents.totalTrajectorySpans}
   Avg Cost/Agent:     ${fromSmallestUnit(kpis.agents.avgCostPerAgent).toFixed(3)} ◆

═══════════════════════════════════════════════════════════════
`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a health monitor instance
 */
export function createHealthMonitor(
  eventStore: EventStore,
  options?: {
    thresholds?: Partial<HealthThresholds>;
    periodMs?: number;
  }
): EconomicHealthMonitor {
  const thresholds: HealthThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...options?.thresholds,
  };

  return new EconomicHealthMonitor(
    eventStore,
    thresholds,
    options?.periodMs
  );
}
