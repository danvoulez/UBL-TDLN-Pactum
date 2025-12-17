/**
 * REALISTIC AGENT BEHAVIORS
 * 
 * Scripts and guardians with human-like decision making:
 * - Risk assessment
 * - Learning from experience
 * - Social influence
 * - Panic/euphoria contagion
 * - Strategic defaults
 * - Career pivots
 */

import type { EntityId, Timestamp } from '../shared/types';
import type { SimulatedScript, SimulatedGuardian, AgentTraits } from './agent-population';
import type { MarketState } from './market-dynamics';
import type { SimulationTick } from './simulation-clock';

// =============================================================================
// DECISION CONTEXT
// =============================================================================

export interface DecisionContext {
  tick: SimulationTick;
  market: MarketState;
  script: SimulatedScript;
  guardian?: SimulatedGuardian;
  peers: PeerInfo[];
}

export interface PeerInfo {
  id: EntityId;
  reputation: number;
  balance: number;
  isActive: boolean;
  archetype: string;
}

// =============================================================================
// BEHAVIOR OUTCOMES
// =============================================================================

export interface BehaviorOutcome {
  /** Earnings this tick */
  earnings: number;
  
  /** Loan payment made */
  loanPayment: number;
  
  /** Reputation change */
  reputationDelta: number;
  
  /** Did the script default? */
  defaulted: boolean;
  
  /** Did the script pivot careers? */
  pivoted: boolean;
  
  /** Mood/sentiment change */
  moodDelta: number;
  
  /** Actions taken */
  actions: BehaviorAction[];
}

export type BehaviorAction = 
  | { type: 'work'; intensity: number }
  | { type: 'learn'; skill: string }
  | { type: 'pivot'; newSpecialization: string }
  | { type: 'default'; reason: string }
  | { type: 'exit'; reason: string }
  | { type: 'borrow'; amount: number }
  | { type: 'save'; amount: number }
  | { type: 'collude'; partnerId: EntityId };

// =============================================================================
// MOOD/PSYCHOLOGY
// =============================================================================

export interface AgentPsychology {
  /** Current mood (-1 = depressed, 0 = neutral, 1 = euphoric) */
  mood: number;
  
  /** Stress level (0-1) */
  stress: number;
  
  /** Confidence (0-1) */
  confidence: number;
  
  /** Fear of missing out (0-1) */
  fomo: number;
  
  /** Burnout level (0-1) */
  burnout: number;
  
  /** Days since last success */
  daysSinceSuccess: number;
  
  /** Consecutive failures */
  consecutiveFailures: number;
}

export function createInitialPsychology(): AgentPsychology {
  return {
    mood: 0.2 + Math.random() * 0.3, // Slightly optimistic start
    stress: 0.1 + Math.random() * 0.2,
    confidence: 0.4 + Math.random() * 0.3,
    fomo: Math.random() * 0.3,
    burnout: 0,
    daysSinceSuccess: 0,
    consecutiveFailures: 0,
  };
}

// =============================================================================
// REALISTIC BEHAVIOR ENGINE
// =============================================================================

export class RealisticBehaviorEngine {
  private psychologyMap: Map<EntityId, AgentPsychology> = new Map();
  private skillLevels: Map<EntityId, Map<string, number>> = new Map();
  private socialNetwork: Map<EntityId, Set<EntityId>> = new Map();
  
  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------
  
  initializeAgent(script: SimulatedScript): void {
    this.psychologyMap.set(script.id, createInitialPsychology());
    
    // Initialize skills based on specialization
    const skills = new Map<string, number>();
    skills.set(script.specialization, 0.5 + script.traits.skillLevel * 0.5);
    skills.set('general', 0.3 + script.traits.skillLevel * 0.3);
    this.skillLevels.set(script.id, skills);
    
    // Empty social network initially
    this.socialNetwork.set(script.id, new Set());
  }
  
  // ---------------------------------------------------------------------------
  // MAIN BEHAVIOR LOOP
  // ---------------------------------------------------------------------------
  
  processBehavior(ctx: DecisionContext): BehaviorOutcome {
    const { script, market, tick } = ctx;
    
    // Get or create psychology
    let psych = this.psychologyMap.get(script.id);
    if (!psych) {
      this.initializeAgent(script);
      psych = this.psychologyMap.get(script.id)!;
    }
    
    const actions: BehaviorAction[] = [];
    let earnings = 0;
    let loanPayment = 0;
    let reputationDelta = 0;
    let defaulted = false;
    let pivoted = false;
    
    // 1. Update psychology based on environment
    this.updatePsychology(psych, ctx);
    
    // 2. Check for exit conditions
    if (this.shouldExit(script, psych, market)) {
      actions.push({ type: 'exit', reason: this.getExitReason(script, psych, market) });
      return {
        earnings: 0,
        loanPayment: 0,
        reputationDelta: -10,
        defaulted: true,
        pivoted: false,
        moodDelta: -0.5,
        actions,
      };
    }
    
    // 3. Check for strategic default
    if (this.shouldStrategicDefault(script, psych, market)) {
      actions.push({ type: 'default', reason: 'strategic' });
      defaulted = true;
      reputationDelta = -20;
    }
    
    // 4. Check for career pivot
    if (this.shouldPivot(script, psych, market)) {
      const newSpec = this.chooseNewSpecialization(script, market);
      actions.push({ type: 'pivot', newSpecialization: newSpec });
      pivoted = true;
      reputationDelta -= 5; // Temporary reputation hit
    }
    
    // 5. Decide work intensity
    const workIntensity = this.calculateWorkIntensity(script, psych, market);
    actions.push({ type: 'work', intensity: workIntensity });
    
    // 6. Calculate earnings
    earnings = this.calculateEarnings(script, psych, market, workIntensity);
    
    // 7. Decide loan payment
    if (!defaulted && script.state.loanOutstanding > 0n) {
      loanPayment = this.decideLoanPayment(script, psych, market, earnings);
    }
    
    // 8. Learning/skill development
    if (workIntensity < 0.8 && psych.burnout < 0.7) {
      const skillToLearn = this.chooseSkillToLearn(script, market);
      actions.push({ type: 'learn', skill: skillToLearn });
      this.improveSkill(script.id, skillToLearn, 0.01);
    }
    
    // 9. Social contagion
    this.applySocialContagion(script, ctx.peers, psych);
    
    // 10. Update reputation
    reputationDelta += this.calculateReputationChange(script, psych, workIntensity, defaulted);
    
    // 11. Update burnout
    this.updateBurnout(psych, workIntensity);
    
    return {
      earnings,
      loanPayment,
      reputationDelta,
      defaulted,
      pivoted,
      moodDelta: psych.mood - (this.psychologyMap.get(script.id)?.mood ?? 0),
      actions,
    };
  }
  
  // ---------------------------------------------------------------------------
  // PSYCHOLOGY
  // ---------------------------------------------------------------------------
  
  private updatePsychology(psych: AgentPsychology, ctx: DecisionContext): void {
    const { script, market, peers } = ctx;
    
    // SPRINT 3 FIX: Detect positive context
    const isPositiveContext = market.sentiment > 0.3 && market.cyclePhase === 'Expansion';
    const isFinanciallySecure = Number(script.state.walletBalance) > 500 && 
                                 script.state.loanOutstanding === 0n;
    
    // Mood follows market sentiment with personality filter
    const marketInfluence = market.sentiment * (1 - script.traits.adaptability * 0.5);
    psych.mood += (marketInfluence - psych.mood) * 0.1;
    
    // Mood recovery when no crisis (slow healing)
    if (market.sentiment > 0 && psych.mood < 0) {
      psych.mood += 0.005; // Slow natural recovery
    }
    
    // SPRINT 3 FIX: Faster mood recovery in positive context
    if (isPositiveContext && psych.mood < 0.5) {
      psych.mood += 0.02; // Active mood boost in good times
    }
    
    // Stress from financial pressure
    const financialStress = Number(script.state.loanOutstanding) / 
      Math.max(1, Number(script.state.walletBalance) + 100);
    
    // SPRINT 3 FIX: Stress accumulates slower in positive context
    const stressAccumulationRate = isPositiveContext ? 0.05 : 0.1;
    psych.stress = psych.stress * 0.95 + financialStress * stressAccumulationRate;
    
    // SPRINT 3 FIX: Active stress reduction in positive context
    if (isPositiveContext && psych.stress > 0.3) {
      psych.stress -= 0.02; // Recovery in good times
    }
    
    // SPRINT 3 FIX: Financial security reduces anxiety
    if (isFinanciallySecure) {
      psych.stress *= 0.97; // "Financial cushion" effect
    }
    
    // Confidence from reputation
    const reputationConfidence = script.state.reputation / 100;
    psych.confidence += (reputationConfidence - psych.confidence) * 0.05;
    
    // SPRINT 3 FIX: Confidence boost in prosperity
    if (isPositiveContext && psych.confidence < 0.8) {
      psych.confidence += 0.01;
    }
    
    // FOMO from seeing successful peers
    const successfulPeers = peers.filter(p => p.balance > Number(script.state.walletBalance) * 1.5);
    psych.fomo = Math.min(1, successfulPeers.length / Math.max(1, peers.length));
    
    // SPRINT 3 FIX: In prosperity, FOMO is less toxic (opportunity vs desperation)
    if (isPositiveContext) {
      psych.fomo *= 0.7; // Reduced FOMO anxiety in good times
    }
    
    // Clamp values - STRESS CAPPED AT 1.0
    psych.mood = Math.max(-1, Math.min(1, psych.mood));
    psych.stress = Math.max(0, Math.min(1, psych.stress)); // Cap at 100%
    psych.confidence = Math.max(0, Math.min(1, psych.confidence));
  }
  
  private updateBurnout(psych: AgentPsychology, workIntensity: number): void {
    // High work intensity increases burnout
    if (workIntensity > 0.8) {
      psych.burnout += 0.01 * workIntensity;
    } else {
      // Recovery when not overworking
      psych.burnout *= 0.99;
    }
    
    // Stress accelerates burnout
    psych.burnout += psych.stress * 0.005;
    
    psych.burnout = Math.max(0, Math.min(1, psych.burnout));
  }
  
  // ---------------------------------------------------------------------------
  // DECISIONS
  // ---------------------------------------------------------------------------
  
  private shouldExit(script: SimulatedScript, psych: AgentPsychology, market: MarketState): boolean {
    // Burnout exit
    if (psych.burnout > 0.95) return true;
    
    // Despair exit (prolonged failure)
    if (psych.consecutiveFailures > 30 && psych.mood < -0.8) return true;
    
    // Bankruptcy exit - FORCED, not optional
    if (Number(script.state.walletBalance) < -500 && 
        Number(script.state.loanOutstanding) > 2000) return true;
    
    // NEW: Stress collapse - high stress causes random exits
    if (psych.stress > 0.9) {
      const collapseChance = (psych.stress - 0.9) * 0.3; // Up to 3% per tick at max stress
      if (Math.random() < collapseChance) return true;
    }
    
    // NEW: Forced insolvency - can't pay debts for too long
    const debtToIncomeRatio = Number(script.state.loanOutstanding) / 
      Math.max(1, Number(script.state.walletBalance));
    if (debtToIncomeRatio > 10 && psych.consecutiveFailures > 14) {
      return true; // 2 weeks of failure with 10x debt = forced out
    }
    
    return false;
  }
  
  private getExitReason(script: SimulatedScript, psych: AgentPsychology, market: MarketState): string {
    if (psych.burnout > 0.95) return 'burnout';
    if (psych.consecutiveFailures > 30 && psych.mood < -0.8) return 'despair';
    if (psych.stress > 0.9) return 'stress_collapse';
    const debtRatio = Number(script.state.loanOutstanding) / Math.max(1, Number(script.state.walletBalance));
    if (debtRatio > 10 && psych.consecutiveFailures > 14) return 'insolvency';
    return 'bankruptcy';
  }
  
  private shouldStrategicDefault(script: SimulatedScript, psych: AgentPsychology, market: MarketState): boolean {
    // Only dishonest agents consider strategic default
    if (script.traits.honesty > 0.5) return false;
    
    // Calculate if default is "worth it"
    const loanBurden = Number(script.state.loanOutstanding) / 
      Math.max(1, Number(script.state.walletBalance));
    
    // High loan burden + low reputation to lose + bad market
    if (loanBurden > 3 && 
        script.state.reputation < 30 && 
        market.cyclePhase === 'Contraction') {
      return Math.random() < script.traits.greed * 0.1;
    }
    
    return false;
  }
  
  private shouldPivot(script: SimulatedScript, psych: AgentPsychology, market: MarketState): boolean {
    // SPRINT 3 FIX: Relaxed adaptability threshold (0.4 → 0.25)
    if (script.traits.adaptability < 0.25) return false;
    
    // SPRINT 3 FIX: Pivot by opportunity in expansion (regardless of demand level)
    if (market.cyclePhase === 'Expansion') {
      // In boom, adaptable scripts seek better opportunities
      if (psych.fomo > 0.3 && Math.random() < script.traits.adaptability * 0.02) {
        return true;
      }
      // High confidence + good market = try something new
      if (psych.confidence > 0.6 && Math.random() < 0.01) {
        return true;
      }
    }
    
    // Pivot if current skill is obsolete (low earnings + high skill)
    const currentSkill = this.getSkillLevel(script.id, script.specialization);
    if (currentSkill > 0.5 && psych.consecutiveFailures > 7) {
      return Math.random() < script.traits.adaptability * 0.06;
    }
    
    // FOMO-driven pivot (more relaxed)
    if (psych.fomo > 0.4 && psych.mood < 0.3) {
      return Math.random() < 0.04;
    }
    
    // SPRINT 3 FIX: Pivot by burnout (change field to recover)
    if (psych.burnout > 0.5 && script.traits.adaptability > 0.35) {
      return Math.random() < 0.05; // 5% chance per tick when burned out
    }
    
    // SPRINT 3 FIX: Pivot when stuck (consecutive failures)
    if (psych.consecutiveFailures > 5) {
      return Math.random() < script.traits.adaptability * 0.03;
    }
    
    // SPRINT 3 FIX: Random exploration pivot (small chance for adaptable scripts)
    if (script.traits.adaptability > 0.6 && Math.random() < 0.005) {
      return true; // 0.5% chance for highly adaptable scripts
    }
    
    return false;
  }
  
  private chooseNewSpecialization(script: SimulatedScript, market: MarketState): string {
    const specializations = [
      'DataAnalysis', 'ContentCreation', 'CustomerService', 
      'Research', 'Automation', 'Trading', 'AITraining',
      'CodeReview', 'SecurityAudit', 'PromptEngineering'
    ];
    
    // Avoid current specialization
    const available = specializations.filter(s => s !== script.specialization);
    
    // Prefer high-demand specializations in expansion
    if (market.cyclePhase === 'Expansion') {
      const hotSkills = ['AITraining', 'PromptEngineering', 'Automation'];
      const hot = available.filter(s => hotSkills.includes(s));
      if (hot.length > 0) return hot[Math.floor(Math.random() * hot.length)];
    }
    
    return available[Math.floor(Math.random() * available.length)];
  }
  
  // ---------------------------------------------------------------------------
  // WORK & EARNINGS
  // ---------------------------------------------------------------------------
  
  private calculateWorkIntensity(script: SimulatedScript, psych: AgentPsychology, market: MarketState): number {
    let intensity = script.traits.workEthic;
    
    // Burnout reduces intensity
    intensity *= 1 - psych.burnout * 0.5;
    
    // Stress can increase intensity (desperation) or decrease (paralysis)
    if (psych.stress > 0.7) {
      intensity *= script.traits.riskTolerance > 0.5 ? 1.2 : 0.7;
    }
    
    // Mood affects motivation
    intensity *= 0.8 + psych.mood * 0.2;
    
    // Market conditions
    if (market.cyclePhase === 'Contraction') {
      intensity *= 1.1; // Work harder in bad times
    }
    
    return Math.max(0.1, Math.min(1.2, intensity));
  }
  
  private calculateEarnings(
    script: SimulatedScript, 
    psych: AgentPsychology, 
    market: MarketState,
    workIntensity: number
  ): number {
    const baseEarnings = 10;
    
    // Skill multiplier
    const skillLevel = this.getSkillLevel(script.id, script.specialization);
    const skillMultiplier = 0.5 + skillLevel;
    
    // Work intensity
    const intensityMultiplier = 0.5 + workIntensity * 0.7;
    
    // Market conditions
    const jobAvailability = market.demand * (1 - market.unemploymentRate);
    const marketMultiplier = market.priceMultiplier * jobAvailability;
    
    // Reputation bonus
    const reputationMultiplier = 0.7 + script.state.reputation / 100 * 0.6;
    
    // Random variance (luck)
    const luck = 0.7 + Math.random() * 0.6;
    
    // Burnout penalty
    const burnoutPenalty = 1 - psych.burnout * 0.5;
    
    const earnings = baseEarnings * 
      skillMultiplier * 
      intensityMultiplier * 
      marketMultiplier * 
      reputationMultiplier * 
      luck * 
      burnoutPenalty;
    
    // Track success/failure
    if (earnings > baseEarnings) {
      psych.daysSinceSuccess = 0;
      psych.consecutiveFailures = 0;
    } else {
      psych.daysSinceSuccess++;
      if (earnings < baseEarnings * 0.5) {
        psych.consecutiveFailures++;
      }
    }
    
    return Math.max(0, earnings);
  }
  
  private decideLoanPayment(
    script: SimulatedScript, 
    psych: AgentPsychology, 
    market: MarketState,
    earnings: number
  ): number {
    const balance = Number(script.state.walletBalance);
    const loan = Number(script.state.loanOutstanding);
    
    // Minimum payment (10% of earnings or loan, whichever is smaller)
    const minPayment = Math.min(earnings * 0.1, loan);
    
    // Aggressive repayment if low risk tolerance and good mood
    if (script.traits.riskTolerance < 0.3 && psych.mood > 0) {
      return Math.min(earnings * 0.3, loan);
    }
    
    // Minimal payment if stressed or bad market
    if (psych.stress > 0.7 || market.cyclePhase === 'Contraction') {
      return minPayment;
    }
    
    // Normal payment
    return Math.min(earnings * 0.15, loan);
  }
  
  // ---------------------------------------------------------------------------
  // SKILLS
  // ---------------------------------------------------------------------------
  
  private getSkillLevel(agentId: EntityId, skill: string): number {
    const skills = this.skillLevels.get(agentId);
    if (!skills) return 0.3;
    return skills.get(skill) ?? skills.get('general') ?? 0.3;
  }
  
  private improveSkill(agentId: EntityId, skill: string, amount: number): void {
    const skills = this.skillLevels.get(agentId);
    if (!skills) return;
    
    const current = skills.get(skill) ?? 0.3;
    skills.set(skill, Math.min(1, current + amount));
  }
  
  private chooseSkillToLearn(script: SimulatedScript, market: MarketState): string {
    // Learn current specialization if not maxed
    const currentLevel = this.getSkillLevel(script.id, script.specialization);
    if (currentLevel < 0.9) return script.specialization;
    
    // Otherwise learn something new
    const newSkills = ['AITraining', 'PromptEngineering', 'SecurityAudit'];
    return newSkills[Math.floor(Math.random() * newSkills.length)];
  }
  
  // ---------------------------------------------------------------------------
  // SOCIAL
  // ---------------------------------------------------------------------------
  
  private applySocialContagion(
    script: SimulatedScript, 
    peers: PeerInfo[], 
    psych: AgentPsychology
  ): void {
    if (peers.length === 0) return;
    
    // Average peer mood (inferred from their success)
    const avgPeerSuccess = peers.reduce((sum, p) => sum + (p.isActive ? p.reputation / 100 : 0), 0) / peers.length;
    
    // Contagion effect (stronger for less adaptable agents)
    const contagionStrength = 0.05 * (1 - script.traits.adaptability * 0.5);
    
    psych.mood += (avgPeerSuccess - 0.5) * contagionStrength;
    
    // Panic contagion if many peers inactive
    const inactiveRate = peers.filter(p => !p.isActive).length / peers.length;
    if (inactiveRate > 0.3) {
      psych.stress += inactiveRate * 0.1;
      psych.mood -= inactiveRate * 0.1;
    }
  }
  
  // ---------------------------------------------------------------------------
  // REPUTATION
  // ---------------------------------------------------------------------------
  
  private calculateReputationChange(
    script: SimulatedScript, 
    psych: AgentPsychology, 
    workIntensity: number,
    defaulted: boolean
  ): number {
    if (defaulted) return -20;
    
    let delta = 0;
    
    // Work ethic builds reputation
    delta += (workIntensity - 0.5) * 0.2;
    
    // Honesty builds reputation slowly
    delta += (script.traits.honesty - 0.5) * 0.1;
    
    // High stress can cause mistakes
    if (psych.stress > 0.8) {
      delta -= Math.random() * 0.5;
    }
    
    return delta;
  }
  
  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------
  
  getPsychology(agentId: EntityId): AgentPsychology | undefined {
    return this.psychologyMap.get(agentId);
  }
  
  getSkills(agentId: EntityId): Map<string, number> | undefined {
    return this.skillLevels.get(agentId);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createBehaviorEngine(): RealisticBehaviorEngine {
  return new RealisticBehaviorEngine();
}
