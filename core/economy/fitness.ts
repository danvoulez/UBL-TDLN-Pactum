/**
 * FITNESS FUNCTION
 * 
 * SPRINT D.1: Revised fitness function for agent evaluation
 * 
 * Purpose:
 * - Evaluate agent performance holistically
 * - Balance multiple dimensions (economic, social, reliability)
 * - Use log/arctan for diminishing returns (prevent runaway accumulation)
 * 
 * Philosophy:
 * - Fitness is not just wealth - it's sustainable contribution
 * - Diminishing returns prevent winner-take-all dynamics
 * - Social factors matter (reputation, network effects)
 */

import type { EntityId, Timestamp } from '../shared/types';

// =============================================================================
// TYPES
// =============================================================================

export interface FitnessInput {
  /** Economic metrics */
  readonly balance: bigint;
  readonly totalEarnings: bigint;
  readonly totalSpending: bigint;
  readonly loanRepaymentRate: number; // 0-1
  
  /** Activity metrics */
  readonly trajectorySpans: number;
  readonly successRate: number; // 0-1
  readonly avgResponseTime: number; // ms
  
  /** Social metrics */
  readonly reputation: number; // 0-100
  readonly networkSize: number; // connections
  readonly endorsements: number;
  
  /** Reliability metrics */
  readonly uptime: number; // 0-1
  readonly slaCompliance: number; // 0-1
  readonly incidentCount: number;
  
  /** Time context */
  readonly ageInDays: number;
  readonly lastActiveAt: Timestamp;
}

export interface FitnessScore {
  readonly overall: number; // 0-100
  readonly components: FitnessComponents;
  readonly tier: FitnessTier;
  readonly trend: 'improving' | 'stable' | 'declining';
  readonly calculatedAt: Timestamp;
}

export interface FitnessComponents {
  readonly economic: number; // 0-100
  readonly activity: number; // 0-100
  readonly social: number; // 0-100
  readonly reliability: number; // 0-100
}

export type FitnessTier = 
  | 'S' // 90-100: Elite
  | 'A' // 75-89: Excellent
  | 'B' // 60-74: Good
  | 'C' // 45-59: Average
  | 'D' // 30-44: Below Average
  | 'F'; // 0-29: Poor

export interface FitnessWeights {
  readonly economic: number;
  readonly activity: number;
  readonly social: number;
  readonly reliability: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const DEFAULT_WEIGHTS: FitnessWeights = {
  economic: 0.30,
  activity: 0.25,
  social: 0.25,
  reliability: 0.20,
};

// Scaling factors for log/arctan normalization
const BALANCE_SCALE = 10000n; // Balance at which log contribution is ~50%
const EARNINGS_SCALE = 50000n;
const TRAJECTORY_SCALE = 1000; // Spans at which contribution is ~75%
const NETWORK_SCALE = 50;
const ENDORSEMENT_SCALE = 20;

// =============================================================================
// FITNESS CALCULATOR
// =============================================================================

export class FitnessCalculator {
  constructor(private readonly weights: FitnessWeights = DEFAULT_WEIGHTS) {
    // Validate weights sum to 1
    const sum = weights.economic + weights.activity + weights.social + weights.reliability;
    if (Math.abs(sum - 1.0) > 0.001) {
      throw new Error(`Fitness weights must sum to 1.0, got ${sum}`);
    }
  }
  
  /**
   * Calculate overall fitness score
   */
  calculate(input: FitnessInput): FitnessScore {
    const components = this.calculateComponents(input);
    
    const overall = 
      components.economic * this.weights.economic +
      components.activity * this.weights.activity +
      components.social * this.weights.social +
      components.reliability * this.weights.reliability;
    
    return {
      overall: Math.round(overall * 100) / 100,
      components,
      tier: this.getTier(overall),
      trend: this.calculateTrend(input),
      calculatedAt: Date.now(),
    };
  }
  
  /**
   * Calculate individual component scores
   */
  private calculateComponents(input: FitnessInput): FitnessComponents {
    return {
      economic: this.calculateEconomicScore(input),
      activity: this.calculateActivityScore(input),
      social: this.calculateSocialScore(input),
      reliability: this.calculateReliabilityScore(input),
    };
  }
  
  /**
   * Economic score using log for diminishing returns
   * 
   * Formula: log(1 + balance/scale) normalized to 0-100
   * This prevents wealth accumulation from dominating fitness
   */
  private calculateEconomicScore(input: FitnessInput): number {
    // Balance contribution (log scale)
    const balanceScore = this.logNormalize(input.balance, BALANCE_SCALE);
    
    // Earnings contribution (log scale)
    const earningsScore = this.logNormalize(input.totalEarnings, EARNINGS_SCALE);
    
    // Loan repayment (linear, important for trust)
    const repaymentScore = Math.min(100, input.loanRepaymentRate * 100);
    
    // Spending ratio (healthy spending is good)
    const spendingRatio = input.totalEarnings > 0n
      ? Number(input.totalSpending * 100n / input.totalEarnings)
      : 0;
    const spendingScore = this.arctanNormalize(Math.min(spendingRatio, 200), 50);
    
    // Weighted combination with bounds
    const raw = (
      balanceScore * 0.3 +
      earningsScore * 0.3 +
      repaymentScore * 0.25 +
      spendingScore * 0.15
    );
    
    return Math.max(0, Math.min(100, raw));
  }
  
  /**
   * Activity score using arctan for saturation
   * 
   * Formula: arctan(spans/scale) * 2/π normalized to 0-100
   * More activity is good, but with diminishing returns
   */
  private calculateActivityScore(input: FitnessInput): number {
    // Trajectory spans (arctan for saturation)
    const spansScore = this.arctanNormalize(input.trajectorySpans, TRAJECTORY_SCALE);
    
    // Success rate (linear, critical metric)
    const successScore = input.successRate * 100;
    
    // Response time (inverse - faster is better, handle 0)
    const responseScore = input.avgResponseTime > 0 
      ? this.inverseNormalize(input.avgResponseTime, 1000)
      : 100; // Perfect score for instant response
    
    // Recency bonus (active agents score higher)
    const daysSinceActive = (Date.now() - input.lastActiveAt) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, Math.min(100, 100 - daysSinceActive * 5));
    
    const raw = (
      spansScore * 0.3 +
      successScore * 0.35 +
      responseScore * 0.2 +
      recencyScore * 0.15
    );
    
    return Math.max(0, Math.min(100, raw));
  }
  
  /**
   * Social score combining reputation and network effects
   */
  private calculateSocialScore(input: FitnessInput): number {
    // Reputation (linear, already 0-100)
    const reputationScore = Math.max(0, Math.min(100, input.reputation));
    
    // Network size (log scale)
    const networkScore = this.logNormalize(BigInt(Math.max(0, input.networkSize)), BigInt(NETWORK_SCALE));
    
    // Endorsements (arctan for saturation)
    const endorsementScore = this.arctanNormalize(Math.max(0, input.endorsements), ENDORSEMENT_SCALE);
    
    // Age bonus (established agents get trust)
    const ageScore = Math.min(100, Math.max(0, input.ageInDays) / 3.65);
    
    const raw = (
      reputationScore * 0.4 +
      networkScore * 0.25 +
      endorsementScore * 0.2 +
      ageScore * 0.15
    );
    
    return Math.max(0, Math.min(100, raw));
  }
  
  /**
   * Reliability score for operational excellence
   */
  private calculateReliabilityScore(input: FitnessInput): number {
    // Uptime (linear, critical)
    const uptimeScore = Math.min(100, Math.max(0, input.uptime * 100));
    
    // SLA compliance (linear, critical)
    const slaScore = Math.min(100, Math.max(0, input.slaCompliance * 100));
    
    // Incident penalty (inverse)
    const incidentPenalty = Math.min(50, Math.max(0, input.incidentCount) * 5);
    const incidentScore = Math.max(0, 100 - incidentPenalty);
    
    const raw = (
      uptimeScore * 0.4 +
      slaScore * 0.4 +
      incidentScore * 0.2
    );
    
    return Math.max(0, Math.min(100, raw));
  }
  
  /**
   * Log normalization: log(1 + value/scale) * 100 / log(101)
   * Returns 0-100, with 50 at scale value
   */
  private logNormalize(value: bigint, scale: bigint): number {
    const ratio = Number(value * 100n / scale) / 100;
    const logValue = Math.log(1 + ratio);
    const maxLog = Math.log(101); // Normalize to 0-100 range
    return Math.min(100, (logValue / maxLog) * 100);
  }
  
  /**
   * Arctan normalization: arctan(value/scale) * 2/π * 100
   * Returns 0-100, asymptotically approaching 100
   */
  private arctanNormalize(value: number, scale: number): number {
    const ratio = value / scale;
    return Math.atan(ratio) * (2 / Math.PI) * 100;
  }
  
  /**
   * Inverse normalization: 100 * scale / (scale + value)
   * Returns 100 at 0, 50 at scale, approaching 0 at infinity
   */
  private inverseNormalize(value: number, scale: number): number {
    return (100 * scale) / (scale + value);
  }
  
  /**
   * Determine fitness tier from overall score
   */
  private getTier(score: number): FitnessTier {
    if (score >= 90) return 'S';
    if (score >= 75) return 'A';
    if (score >= 60) return 'B';
    if (score >= 45) return 'C';
    if (score >= 30) return 'D';
    return 'F';
  }
  
  /**
   * Calculate trend based on activity and recency
   */
  private calculateTrend(input: FitnessInput): 'improving' | 'stable' | 'declining' {
    const daysSinceActive = (Date.now() - input.lastActiveAt) / (1000 * 60 * 60 * 24);
    
    if (daysSinceActive > 7) return 'declining';
    if (input.successRate > 0.8 && input.trajectorySpans > 100) return 'improving';
    return 'stable';
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createFitnessCalculator(weights?: Partial<FitnessWeights>): FitnessCalculator {
  if (!weights) {
    return new FitnessCalculator();
  }
  
  const merged: FitnessWeights = {
    ...DEFAULT_WEIGHTS,
    ...weights,
  };
  
  return new FitnessCalculator(merged);
}

/**
 * Quick fitness calculation with default weights
 */
export function calculateFitness(input: FitnessInput): FitnessScore {
  const calculator = createFitnessCalculator();
  return calculator.calculate(input);
}

/**
 * Get tier description
 */
export function getTierDescription(tier: FitnessTier): string {
  const descriptions: Record<FitnessTier, string> = {
    'S': 'Elite - Top performer, highly trusted',
    'A': 'Excellent - Consistently high quality',
    'B': 'Good - Reliable and competent',
    'C': 'Average - Meets basic expectations',
    'D': 'Below Average - Needs improvement',
    'F': 'Poor - Significant concerns',
  };
  return descriptions[tier];
}
