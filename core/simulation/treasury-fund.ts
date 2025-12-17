/**
 * TREASURY STABILIZATION FUND
 * 
 * A mechanism to inject liquidity during crises and stabilize the economy.
 * 
 * Features:
 * - Automatic intervention when crisis conditions detected
 * - Emergency loans to struggling scripts
 * - UBI distribution during severe downturns
 * - Gradual fund replenishment during good times
 */

import type { SimulationTick } from './simulation-clock';
import type { SimulatedScript } from './agent-population';
import type { MarketState } from './market-dynamics';

// =============================================================================
// TREASURY STATE
// =============================================================================

export interface TreasuryState {
  /** Current fund balance */
  balance: bigint;
  
  /** Total distributed since start */
  totalDistributed: bigint;
  
  /** Total collected (taxes/fees) since start */
  totalCollected: bigint;
  
  /** Number of interventions */
  interventionCount: number;
  
  /** Current intervention status */
  isIntervening: boolean;
  
  /** Last intervention day */
  lastInterventionDay: number | null;
}

export interface TreasuryConfig {
  /** Initial fund balance */
  initialBalance: bigint;
  
  /** Minimum balance before fund is depleted */
  minimumBalance: bigint;
  
  /** Tax rate on earnings during good times (0-1) */
  prosperityTaxRate: number;
  
  /** Sentiment threshold to trigger intervention */
  crisisSentimentThreshold: number;
  
  /** Unemployment threshold to trigger intervention */
  crisisUnemploymentThreshold: number;
  
  /** Maximum per-script emergency distribution */
  maxEmergencyDistribution: bigint;
  
  /** Cooldown between interventions (days) */
  interventionCooldown: number;
}

const DEFAULT_TREASURY_CONFIG: TreasuryConfig = {
  initialBalance: 20_000_000n,    // SPRINT 6: Doubled initial balance
  minimumBalance: 500_000n,       // SPRINT 6: Lower minimum (more aggressive)
  prosperityTaxRate: 0.03,        // SPRINT 6: 3% tax during good times
  crisisSentimentThreshold: -0.2, // SPRINT 6: More sensitive trigger
  crisisUnemploymentThreshold: 0.06, // SPRINT 6: More sensitive
  maxEmergencyDistribution: 800n, // SPRINT 6: Larger distributions
  interventionCooldown: 14,       // SPRINT 6: 2 weeks between interventions
};

// =============================================================================
// INTERVENTION TYPES
// =============================================================================

export type InterventionType = 
  | 'EmergencyUBI'      // Direct distribution to all scripts
  | 'TargetedBailout'   // Help only struggling scripts
  | 'LoanForgiveness'   // Reduce outstanding loans
  | 'SentimentBoost';   // Market confidence injection

export interface InterventionRecord {
  day: number;
  type: InterventionType;
  amount: bigint;
  scriptsHelped: number;
  reason: string;
}

// =============================================================================
// TREASURY FUND
// =============================================================================

export class TreasuryStabilizationFund {
  private state: TreasuryState;
  private config: TreasuryConfig;
  private interventionHistory: InterventionRecord[] = [];
  
  constructor(config: Partial<TreasuryConfig> = {}) {
    this.config = { ...DEFAULT_TREASURY_CONFIG, ...config };
    this.state = {
      balance: this.config.initialBalance,
      totalDistributed: 0n,
      totalCollected: 0n,
      interventionCount: 0,
      isIntervening: false,
      lastInterventionDay: null,
    };
  }
  
  // ---------------------------------------------------------------------------
  // MAIN PROCESSING
  // ---------------------------------------------------------------------------
  
  processTick(
    tick: SimulationTick,
    scripts: SimulatedScript[],
    market: MarketState
  ): TreasuryAction[] {
    const actions: TreasuryAction[] = [];
    const day = tick.simulatedDay;
    
    // 1. Check if we should intervene
    const crisisLevel = this.assessCrisisLevel(market, scripts);
    
    if (crisisLevel !== 'None' && this.canIntervene(day)) {
      const intervention = this.executeIntervention(day, crisisLevel, scripts, market);
      if (intervention) {
        actions.push(intervention);
      }
    }
    
    // SPRINT 6: Recovery mechanism - reactivate scripts when market improves
    if (market.cyclePhase === 'Expansion' && market.sentiment > 0.3) {
      const recoveryAction = this.attemptRecovery(day, scripts, market);
      if (recoveryAction) {
        actions.push(recoveryAction);
      }
    }
    
    // 2. Collect taxes during prosperity
    if (market.cyclePhase === 'Expansion' && market.sentiment > 0.3) {
      const taxCollected = this.collectProsperityTax(scripts);
      if (taxCollected > 0n) {
        actions.push({
          type: 'TaxCollection',
          amount: taxCollected,
          scriptsAffected: scripts.filter(s => s.state.isActive).length,
          description: `Collected ${taxCollected} in prosperity tax`,
        });
      }
    }
    
    return actions;
  }
  
  // ---------------------------------------------------------------------------
  // CRISIS ASSESSMENT
  // ---------------------------------------------------------------------------
  
  private assessCrisisLevel(
    market: MarketState,
    scripts: SimulatedScript[]
  ): 'None' | 'Mild' | 'Moderate' | 'Severe' | 'Critical' {
    const activeScripts = scripts.filter(s => s.state.isActive);
    const totalScripts = scripts.length;
    const survivalRate = activeScripts.length / totalScripts;
    
    // Calculate average balance
    const avgBalance = activeScripts.length > 0
      ? Number(activeScripts.reduce((sum, s) => sum + s.state.walletBalance, 0n)) / activeScripts.length
      : 0;
    
    // Count scripts in distress (negative balance or high debt)
    // SPRINT 7: More sensitive distress detection
    const distressedScripts = activeScripts.filter(s => 
      Number(s.state.walletBalance) < 200 || 
      Number(s.state.loanOutstanding) > Number(s.state.walletBalance) * 1.5
    ).length;
    const distressRate = distressedScripts / Math.max(1, activeScripts.length);
    
    // Assess based on multiple factors
    let score = 0;
    
    // Sentiment factor - SPRINT 7: More sensitive
    if (market.sentiment < this.config.crisisSentimentThreshold) {
      score += 2;
      if (market.sentiment < -0.3) score += 1;
      if (market.sentiment < -0.5) score += 1;
      if (market.sentiment < -0.7) score += 1;
    }
    
    // Unemployment factor
    if (market.unemploymentRate > this.config.crisisUnemploymentThreshold) {
      score += 1;
      if (market.unemploymentRate > 0.10) score += 1;
      if (market.unemploymentRate > 0.15) score += 1;
    }
    
    // Survival rate factor - SPRINT 7: Earlier intervention
    if (survivalRate < 0.8) score += 1;
    if (survivalRate < 0.6) score += 2;
    if (survivalRate < 0.4) score += 2;
    if (survivalRate < 0.25) score += 2;
    
    // Distress rate factor - SPRINT 7: More sensitive
    if (distressRate > 0.2) score += 1;
    if (distressRate > 0.4) score += 2;
    if (distressRate > 0.6) score += 2;
    
    // Average balance factor - SPRINT 7: Higher thresholds
    if (avgBalance < 300) score += 1;
    if (avgBalance < 150) score += 1;
    if (avgBalance < 50) score += 2;
    
    // SPRINT 7: Contraction phase bonus (preemptive intervention)
    if (market.cyclePhase === 'Contraction') {
      score += 1;
    }
    
    // Map score to crisis level - SPRINT 7: Lower thresholds
    if (score >= 7) return 'Critical';
    if (score >= 4) return 'Severe';
    if (score >= 2) return 'Moderate';
    if (score >= 1) return 'Mild';
    return 'None';
  }
  
  private canIntervene(day: number): boolean {
    // Check fund balance
    if (this.state.balance <= this.config.minimumBalance) {
      return false;
    }
    
    // Check cooldown
    if (this.state.lastInterventionDay !== null) {
      const daysSinceLastIntervention = day - this.state.lastInterventionDay;
      if (daysSinceLastIntervention < this.config.interventionCooldown) {
        return false;
      }
    }
    
    return true;
  }
  
  // ---------------------------------------------------------------------------
  // INTERVENTIONS
  // ---------------------------------------------------------------------------
  
  private executeIntervention(
    day: number,
    crisisLevel: 'Mild' | 'Moderate' | 'Severe' | 'Critical',
    scripts: SimulatedScript[],
    market: MarketState
  ): TreasuryAction | null {
    const activeScripts = scripts.filter(s => s.state.isActive);
    
    // Determine intervention type and amount based on crisis level
    let interventionType: InterventionType;
    let amountPerScript: bigint;
    let targetScripts: SimulatedScript[];
    
    switch (crisisLevel) {
      case 'Critical':
        // SPRINT 7: Emergency UBI to everyone with higher amount
        interventionType = 'EmergencyUBI';
        amountPerScript = this.config.maxEmergencyDistribution * 3n / 2n; // 1.5x
        targetScripts = activeScripts;
        break;
        
      case 'Severe':
        // SPRINT 7: Targeted bailout with wider net
        interventionType = 'TargetedBailout';
        amountPerScript = this.config.maxEmergencyDistribution;
        targetScripts = activeScripts.filter(s => 
          Number(s.state.walletBalance) < 400 ||
          Number(s.state.loanOutstanding) > 300
        );
        break;
        
      case 'Moderate':
        // SPRINT 7: Help more scripts earlier
        interventionType = 'TargetedBailout';
        amountPerScript = this.config.maxEmergencyDistribution * 3n / 4n;
        targetScripts = activeScripts.filter(s => 
          Number(s.state.walletBalance) < 250
        );
        break;
        
      case 'Mild':
        // SPRINT 7: Preemptive support
        interventionType = 'TargetedBailout';
        amountPerScript = this.config.maxEmergencyDistribution / 2n;
        targetScripts = activeScripts.filter(s => 
          Number(s.state.walletBalance) < 150
        );
        break;
    }
    
    if (targetScripts.length === 0) {
      return null;
    }
    
    // Calculate total needed
    const totalNeeded = amountPerScript * BigInt(targetScripts.length);
    const availableFunds = this.state.balance - this.config.minimumBalance;
    
    // Adjust if not enough funds
    let actualAmountPerScript = amountPerScript;
    if (totalNeeded > availableFunds) {
      actualAmountPerScript = availableFunds / BigInt(targetScripts.length);
      if (actualAmountPerScript < 10n) {
        return null; // Not worth it
      }
    }
    
    // Execute distribution
    let totalDistributed = 0n;
    for (const script of targetScripts) {
      script.state.walletBalance += actualAmountPerScript;
      totalDistributed += actualAmountPerScript;
      
      // Also reduce loans in severe/critical cases
      if ((crisisLevel === 'Severe' || crisisLevel === 'Critical') && 
          script.state.loanOutstanding > 0n) {
        const loanReduction = script.state.loanOutstanding / 4n;
        script.state.loanOutstanding -= loanReduction;
      }
    }
    
    // Update state
    this.state.balance -= totalDistributed;
    this.state.totalDistributed += totalDistributed;
    this.state.interventionCount++;
    this.state.isIntervening = true;
    this.state.lastInterventionDay = day;
    
    // Record intervention
    const record: InterventionRecord = {
      day,
      type: interventionType,
      amount: totalDistributed,
      scriptsHelped: targetScripts.length,
      reason: `${crisisLevel} crisis - sentiment: ${market.sentiment.toFixed(2)}, unemployment: ${(market.unemploymentRate * 100).toFixed(1)}%`,
    };
    this.interventionHistory.push(record);
    
    console.log(`💰 TREASURY INTERVENTION: ${interventionType}`);
    console.log(`   Crisis Level: ${crisisLevel}`);
    console.log(`   Distributed: ${totalDistributed} to ${targetScripts.length} scripts`);
    console.log(`   Remaining Balance: ${this.state.balance}`);
    
    return {
      type: interventionType,
      amount: totalDistributed,
      scriptsAffected: targetScripts.length,
      description: `${crisisLevel} crisis intervention: ${totalDistributed} distributed`,
    };
  }
  
  // ---------------------------------------------------------------------------
  // SPRINT 6: RECOVERY MECHANISM
  // ---------------------------------------------------------------------------
  
  private attemptRecovery(
    day: number,
    scripts: SimulatedScript[],
    market: MarketState
  ): TreasuryAction | null {
    // Find inactive scripts that could be reactivated
    const inactiveScripts = scripts.filter(s => !s.state.isActive);
    
    if (inactiveScripts.length === 0) return null;
    
    // Only attempt recovery every 30 days
    if (day % 30 !== 0) return null;
    
    // Calculate how many we can afford to reactivate
    const reactivationCost = 300n; // Cost to restart a script
    const availableFunds = this.state.balance - this.config.minimumBalance;
    const maxReactivations = Number(availableFunds / reactivationCost);
    
    if (maxReactivations < 1) return null;
    
    // Prioritize scripts with higher reputation (more likely to succeed)
    const candidates = inactiveScripts
      .sort((a, b) => b.state.reputation - a.state.reputation)
      .slice(0, Math.min(maxReactivations, Math.floor(inactiveScripts.length * 0.1))); // Max 10% of inactive
    
    if (candidates.length === 0) return null;
    
    let totalSpent = 0n;
    let reactivated = 0;
    
    for (const script of candidates) {
      // Reactivate with seed funding
      script.state.isActive = true;
      script.state.walletBalance = reactivationCost;
      script.state.loanOutstanding = 0n; // Fresh start
      script.state.reputation = Math.max(30, script.state.reputation * 0.8); // Slight reputation penalty
      
      totalSpent += reactivationCost;
      reactivated++;
    }
    
    this.state.balance -= totalSpent;
    this.state.totalDistributed += totalSpent;
    
    console.log(`🔄 RECOVERY: Reactivated ${reactivated} scripts with ${totalSpent} funding`);
    
    return {
      type: 'EmergencyUBI',
      amount: totalSpent,
      scriptsAffected: reactivated,
      description: `Recovery: ${reactivated} scripts reactivated with ${totalSpent} funding`,
    };
  }
  
  // ---------------------------------------------------------------------------
  // TAX COLLECTION
  // ---------------------------------------------------------------------------
  
  private collectProsperityTax(scripts: SimulatedScript[]): bigint {
    const activeScripts = scripts.filter(s => s.state.isActive);
    let totalCollected = 0n;
    
    for (const script of activeScripts) {
      const balance = Number(script.state.walletBalance);
      
      // Only tax scripts with positive balance above threshold
      if (balance > 500) {
        const tax = BigInt(Math.floor(balance * this.config.prosperityTaxRate / 365));
        if (tax > 0n) {
          script.state.walletBalance -= tax;
          totalCollected += tax;
        }
      }
    }
    
    this.state.balance += totalCollected;
    this.state.totalCollected += totalCollected;
    
    return totalCollected;
  }
  
  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------
  
  getState(): TreasuryState {
    return { ...this.state };
  }
  
  getInterventionHistory(): InterventionRecord[] {
    return [...this.interventionHistory];
  }
  
  getFundHealth(): 'Healthy' | 'Low' | 'Critical' | 'Depleted' {
    const ratio = Number(this.state.balance) / Number(this.config.initialBalance);
    if (ratio > 0.5) return 'Healthy';
    if (ratio > 0.2) return 'Low';
    if (ratio > 0) return 'Critical';
    return 'Depleted';
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface TreasuryAction {
  type: InterventionType | 'TaxCollection';
  amount: bigint;
  scriptsAffected: number;
  description: string;
}

// =============================================================================
// FACTORY
// =============================================================================

export function createTreasuryFund(config?: Partial<TreasuryConfig>): TreasuryStabilizationFund {
  return new TreasuryStabilizationFund(config);
}
