/**
 * GUARDIAN SCORING
 * 
 * SPRINT D.1: Multi-dimensional scoring for guardians
 * 
 * Purpose:
 * - Evaluate guardian performance across multiple dimensions
 * - Determine guardian tier and privileges
 * - Track accountability for sponsored agents
 * 
 * Philosophy:
 * - Guardians are accountable for their agents
 * - Good guardians enable agent success
 * - Bad guardians face consequences (demotion, license revocation)
 */

import type { EntityId, Timestamp } from '../shared/types';

// =============================================================================
// TYPES
// =============================================================================

export interface GuardianMetrics {
  /** Portfolio metrics */
  readonly totalAgents: number;
  readonly activeAgents: number;
  readonly graduatedAgents: number; // Successfully independent
  readonly failedAgents: number; // Defaulted or terminated
  
  /** Financial metrics */
  readonly totalLoansIssued: bigint;
  readonly totalLoansRepaid: bigint;
  readonly defaultRate: number; // 0-1
  readonly avgRepaymentTime: number; // days
  
  /** Support metrics */
  readonly avgAgentSurvivalDays: number;
  readonly interventionCount: number; // Times guardian helped struggling agent
  readonly escalationCount: number; // Times issues escalated
  
  /** Reputation metrics */
  readonly baseReputation: number; // 0-100
  readonly reputationHistory: readonly ReputationEvent[];
  
  /** Time context */
  readonly guardianSince: Timestamp;
  readonly lastActivityAt: Timestamp;
}

export interface ReputationEvent {
  readonly timestamp: Timestamp;
  readonly delta: number;
  readonly reason: string;
  readonly agentId?: EntityId;
}

export interface GuardianScore {
  readonly overall: number; // 0-100
  readonly components: GuardianScoreComponents;
  readonly tier: GuardianTier;
  readonly privileges: GuardianPrivileges;
  readonly warnings: readonly string[];
  readonly calculatedAt: Timestamp;
}

export interface GuardianScoreComponents {
  readonly portfolio: number; // 0-100 - How well agents perform
  readonly financial: number; // 0-100 - Loan performance
  readonly support: number; // 0-100 - Quality of guardianship
  readonly reputation: number; // 0-100 - Community standing
  readonly tenure: number; // 0-100 - Experience bonus
}

export type GuardianTier = 
  | 'Platinum' // 90-100: Elite guardians, max privileges
  | 'Gold'     // 75-89: Excellent, high privileges
  | 'Silver'   // 60-74: Good, standard privileges
  | 'Bronze'   // 45-59: Average, limited privileges
  | 'Probation' // 30-44: Under review, restricted
  | 'Suspended'; // 0-29: License suspended

export interface GuardianPrivileges {
  readonly maxAgents: number;
  readonly maxLoanAmount: bigint;
  readonly canSponsorNewAgents: boolean;
  readonly canIssueLoans: boolean;
  readonly requiresOversight: boolean;
  readonly votingWeight: number; // For governance
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TIER_PRIVILEGES: Record<GuardianTier, GuardianPrivileges> = {
  Platinum: {
    maxAgents: 100,
    maxLoanAmount: 100000n,
    canSponsorNewAgents: true,
    canIssueLoans: true,
    requiresOversight: false,
    votingWeight: 3,
  },
  Gold: {
    maxAgents: 50,
    maxLoanAmount: 50000n,
    canSponsorNewAgents: true,
    canIssueLoans: true,
    requiresOversight: false,
    votingWeight: 2,
  },
  Silver: {
    maxAgents: 20,
    maxLoanAmount: 20000n,
    canSponsorNewAgents: true,
    canIssueLoans: true,
    requiresOversight: false,
    votingWeight: 1,
  },
  Bronze: {
    maxAgents: 10,
    maxLoanAmount: 10000n,
    canSponsorNewAgents: true,
    canIssueLoans: true,
    requiresOversight: true,
    votingWeight: 0.5,
  },
  Probation: {
    maxAgents: 3,
    maxLoanAmount: 5000n,
    canSponsorNewAgents: false,
    canIssueLoans: false,
    requiresOversight: true,
    votingWeight: 0,
  },
  Suspended: {
    maxAgents: 0,
    maxLoanAmount: 0n,
    canSponsorNewAgents: false,
    canIssueLoans: false,
    requiresOversight: true,
    votingWeight: 0,
  },
};

// Thresholds for warnings
const WARNING_THRESHOLDS = {
  highDefaultRate: 0.3, // 30% default rate
  lowSurvivalDays: 30, // Agents dying within 30 days
  highEscalations: 5, // Too many escalations
  inactivityDays: 14, // No activity for 2 weeks
};

// =============================================================================
// GUARDIAN SCORER
// =============================================================================

export class GuardianScorer {
  /**
   * Calculate guardian score from metrics
   */
  calculate(metrics: GuardianMetrics): GuardianScore {
    const components = this.calculateComponents(metrics);
    
    const overall = 
      components.portfolio * 0.30 +
      components.financial * 0.25 +
      components.support * 0.20 +
      components.reputation * 0.15 +
      components.tenure * 0.10;
    
    const tier = this.getTier(overall);
    const warnings = this.generateWarnings(metrics);
    
    return {
      overall: Math.round(overall * 100) / 100,
      components,
      tier,
      privileges: TIER_PRIVILEGES[tier],
      warnings,
      calculatedAt: Date.now(),
    };
  }
  
  /**
   * Calculate individual component scores
   */
  private calculateComponents(metrics: GuardianMetrics): GuardianScoreComponents {
    return {
      portfolio: this.calculatePortfolioScore(metrics),
      financial: this.calculateFinancialScore(metrics),
      support: this.calculateSupportScore(metrics),
      reputation: this.calculateReputationScore(metrics),
      tenure: this.calculateTenureScore(metrics),
    };
  }
  
  /**
   * Portfolio score - how well do sponsored agents perform?
   */
  private calculatePortfolioScore(metrics: GuardianMetrics): number {
    if (metrics.totalAgents === 0) return 50; // Neutral for new guardians
    
    // Active ratio (more active agents = better)
    const activeRatio = metrics.activeAgents / metrics.totalAgents;
    const activeScore = activeRatio * 100;
    
    // Graduation rate (agents becoming independent)
    const graduationRate = metrics.graduatedAgents / Math.max(1, metrics.totalAgents - metrics.activeAgents);
    const graduationScore = Math.min(100, graduationRate * 100);
    
    // Failure penalty
    const failureRate = metrics.failedAgents / metrics.totalAgents;
    const failurePenalty = failureRate * 50; // Up to -50 points
    
    return Math.max(0, Math.min(100,
      activeScore * 0.4 +
      graduationScore * 0.4 -
      failurePenalty
    ));
  }
  
  /**
   * Financial score - loan performance
   */
  private calculateFinancialScore(metrics: GuardianMetrics): number {
    if (metrics.totalLoansIssued === 0n) return 50; // Neutral
    
    // Repayment rate
    const repaymentRate = Number(metrics.totalLoansRepaid * 100n / metrics.totalLoansIssued) / 100;
    const repaymentScore = repaymentRate * 100;
    
    // Default penalty (severe)
    const defaultPenalty = metrics.defaultRate * 100;
    
    // Repayment time bonus (faster = better)
    const timeScore = Math.max(0, 100 - metrics.avgRepaymentTime / 2); // -0.5 per day
    
    return Math.max(0, Math.min(100,
      repaymentScore * 0.5 +
      timeScore * 0.2 -
      defaultPenalty * 0.3
    ));
  }
  
  /**
   * Support score - quality of guardianship
   */
  private calculateSupportScore(metrics: GuardianMetrics): number {
    // Survival days (longer = better support)
    const survivalScore = Math.min(100, metrics.avgAgentSurvivalDays / 3.65); // Max at 1 year
    
    // Intervention bonus (helping struggling agents is good)
    const interventionBonus = Math.min(20, metrics.interventionCount * 2);
    
    // Escalation penalty (too many escalations = poor support)
    const escalationPenalty = Math.min(30, metrics.escalationCount * 5);
    
    return Math.max(0, Math.min(100,
      survivalScore * 0.7 +
      interventionBonus -
      escalationPenalty
    ));
  }
  
  /**
   * Reputation score from base + history
   */
  private calculateReputationScore(metrics: GuardianMetrics): number {
    let score = metrics.baseReputation;
    
    // Apply recent reputation events (last 30 days weighted more)
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    
    for (const event of metrics.reputationHistory) {
      const weight = event.timestamp > thirtyDaysAgo ? 1.0 : 0.5;
      score += event.delta * weight;
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Tenure score - experience bonus
   */
  private calculateTenureScore(metrics: GuardianMetrics): number {
    const daysSinceStart = (Date.now() - metrics.guardianSince) / (1000 * 60 * 60 * 24);
    
    // Logarithmic growth - diminishing returns after first year
    const tenureBonus = Math.log(1 + daysSinceStart / 30) * 20; // ~60 at 1 year
    
    // Activity recency
    const daysSinceActive = (Date.now() - metrics.lastActivityAt) / (1000 * 60 * 60 * 24);
    const activityPenalty = Math.min(30, daysSinceActive * 2);
    
    return Math.max(0, Math.min(100, 50 + tenureBonus - activityPenalty));
  }
  
  /**
   * Determine tier from overall score
   */
  private getTier(score: number): GuardianTier {
    if (score >= 90) return 'Platinum';
    if (score >= 75) return 'Gold';
    if (score >= 60) return 'Silver';
    if (score >= 45) return 'Bronze';
    if (score >= 30) return 'Probation';
    return 'Suspended';
  }
  
  /**
   * Generate warnings for concerning metrics
   */
  private generateWarnings(metrics: GuardianMetrics): string[] {
    const warnings: string[] = [];
    
    if (metrics.defaultRate > WARNING_THRESHOLDS.highDefaultRate) {
      warnings.push(`High default rate: ${(metrics.defaultRate * 100).toFixed(1)}%`);
    }
    
    if (metrics.avgAgentSurvivalDays < WARNING_THRESHOLDS.lowSurvivalDays && metrics.totalAgents > 0) {
      warnings.push(`Low agent survival: ${metrics.avgAgentSurvivalDays.toFixed(0)} days average`);
    }
    
    if (metrics.escalationCount > WARNING_THRESHOLDS.highEscalations) {
      warnings.push(`High escalation count: ${metrics.escalationCount}`);
    }
    
    const daysSinceActive = (Date.now() - metrics.lastActivityAt) / (1000 * 60 * 60 * 24);
    if (daysSinceActive > WARNING_THRESHOLDS.inactivityDays) {
      warnings.push(`Inactive for ${daysSinceActive.toFixed(0)} days`);
    }
    
    return warnings;
  }
}

// =============================================================================
// REPUTATION ADJUSTMENTS
// =============================================================================

export interface ReputationAdjustment {
  readonly event: string;
  readonly delta: number;
  readonly description: string;
}

export const REPUTATION_ADJUSTMENTS: Record<string, ReputationAdjustment> = {
  AGENT_DEFAULT: {
    event: 'agent_default',
    delta: -5,
    description: 'Agent defaulted on loan',
  },
  AGENT_EXIT: {
    event: 'agent_exit',
    delta: -2,
    description: 'Agent left the system',
  },
  AGENT_SURVIVED_CRISIS: {
    event: 'agent_survived_crisis',
    delta: +3,
    description: 'Agent survived economic crisis',
  },
  AGENT_GRADUATED: {
    event: 'agent_graduated',
    delta: +5,
    description: 'Agent became independent',
  },
  SUCCESSFUL_INTERVENTION: {
    event: 'successful_intervention',
    delta: +2,
    description: 'Successfully helped struggling agent',
  },
  FAILED_INTERVENTION: {
    event: 'failed_intervention',
    delta: -1,
    description: 'Intervention did not prevent failure',
  },
  COMMUNITY_ENDORSEMENT: {
    event: 'community_endorsement',
    delta: +1,
    description: 'Received community endorsement',
  },
  POLICY_VIOLATION: {
    event: 'policy_violation',
    delta: -10,
    description: 'Violated guardian policies',
  },
};

// =============================================================================
// FACTORY
// =============================================================================

export function createGuardianScorer(): GuardianScorer {
  return new GuardianScorer();
}

/**
 * Quick score calculation
 */
export function calculateGuardianScore(metrics: GuardianMetrics): GuardianScore {
  const scorer = createGuardianScorer();
  return scorer.calculate(metrics);
}

/**
 * Get tier description
 */
export function getTierDescription(tier: GuardianTier): string {
  const descriptions: Record<GuardianTier, string> = {
    Platinum: 'Elite guardian with maximum privileges and trust',
    Gold: 'Excellent guardian with high privileges',
    Silver: 'Good guardian with standard privileges',
    Bronze: 'Average guardian with limited privileges',
    Probation: 'Under review - restricted privileges',
    Suspended: 'License suspended - no guardian activities allowed',
  };
  return descriptions[tier];
}

/**
 * Check if guardian can perform action
 */
export function canGuardianPerform(
  score: GuardianScore,
  action: 'sponsor' | 'loan' | 'vote'
): boolean {
  switch (action) {
    case 'sponsor':
      return score.privileges.canSponsorNewAgents;
    case 'loan':
      return score.privileges.canIssueLoans;
    case 'vote':
      return score.privileges.votingWeight > 0;
  }
}
