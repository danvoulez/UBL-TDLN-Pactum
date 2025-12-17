/**
 * SCENARIO RUNNER V2
 * 
 * Enhanced simulation with:
 * - Realistic market dynamics
 * - Agent psychology and behaviors
 * - Death spirals and recovery
 * - Contagion effects
 * - Detailed metrics
 */

import type { Timestamp } from '../shared/types';
import { SimulationClock, createSimulationClock, CLOCK_PRESETS, type SimulationTick } from './simulation-clock';
import { AgentPopulation, createPopulation, POPULATION_PRESETS, type PopulationStats, type SimulatedScript } from './agent-population';
import { ChaosInjector, createChaosInjector, CHAOS_SCENARIOS, type ChaosEvent, type ChaosEffect } from './chaos-injector';
import { MarketDynamics, createMarketDynamics, type MarketState } from './market-dynamics';
import { RealisticBehaviorEngine, createBehaviorEngine, type DecisionContext, type PeerInfo } from './realistic-behaviors';
import { TreasuryStabilizationFund, createTreasuryFund, type TreasuryAction, type TreasuryState } from './treasury-fund';

// =============================================================================
// ENHANCED SCENARIO DEFINITION
// =============================================================================

export interface EnhancedScenario {
  name: string;
  description: string;
  duration: { years: number };
  clockPreset: keyof typeof CLOCK_PRESETS;
  populationPreset: keyof typeof POPULATION_PRESETS;
  chaosEvents: Array<{ preset: keyof typeof CHAOS_SCENARIOS; triggerAtDay: number }>;
  randomChaosRate: number;
  metricsInterval: number;
  
  /** Enable realistic behaviors */
  realisticBehaviors: boolean;
  
  /** Enable market dynamics */
  marketDynamics: boolean;
  
  /** Enable social contagion */
  socialContagion: boolean;
}

export const ENHANCED_SCENARIOS: Record<string, EnhancedScenario> = {
  /** Realistic 1 year */
  REALISTIC_BASELINE: {
    name: 'Realistic Baseline',
    description: '1 year with full market dynamics and psychology',
    duration: { years: 1 },
    clockPreset: 'DAILY',
    populationPreset: 'MEDIUM',
    chaosEvents: [],
    randomChaosRate: 0.005,
    metricsInterval: 7,
    realisticBehaviors: true,
    marketDynamics: true,
    socialContagion: true,
  },
  
  /** Realistic tech disruption */
  REALISTIC_DISRUPTION: {
    name: 'Realistic Tech Disruption',
    description: '5 years with GPT-5, market cycles, and psychology',
    duration: { years: 5 },
    clockPreset: 'FIVE_YEARS_FIVE_MINUTES',
    populationPreset: 'MEDIUM',
    chaosEvents: [
      { preset: 'MODEL_RELEASE', triggerAtDay: 730 },
    ],
    randomChaosRate: 0.01,
    metricsInterval: 30,
    realisticBehaviors: true,
    marketDynamics: true,
    socialContagion: true,
  },
  
  /** Death spiral test */
  DEATH_SPIRAL: {
    name: 'Death Spiral',
    description: 'Test if system can recover from cascading failures',
    duration: { years: 3 },
    clockPreset: 'MONTHLY',
    populationPreset: 'LARGE',
    chaosEvents: [
      { preset: 'MARKET_CRASH', triggerAtDay: 180 },
      { preset: 'MASS_DEFAULT', triggerAtDay: 270 },
      { preset: 'GUARDIAN_EXIT', triggerAtDay: 300 },
    ],
    randomChaosRate: 0.03,
    metricsInterval: 7,
    realisticBehaviors: true,
    marketDynamics: true,
    socialContagion: true,
  },
  
  /** Full realistic apocalypse */
  REALISTIC_APOCALYPSE: {
    name: 'Realistic Apocalypse',
    description: '5 years of chaos with full simulation',
    duration: { years: 5 },
    clockPreset: 'FIVE_YEARS_FIVE_MINUTES',
    populationPreset: 'LARGE',
    chaosEvents: [
      { preset: 'MODEL_RELEASE', triggerAtDay: 365 },
      { preset: 'MARKET_CRASH', triggerAtDay: 500 },
      { preset: 'CARTEL_FORMATION', triggerAtDay: 700 },
      { preset: 'TREASURY_BUG', triggerAtDay: 1000 },
      { preset: 'MASS_DEFAULT', triggerAtDay: 1200 },
      { preset: 'GUARDIAN_EXIT', triggerAtDay: 1400 },
    ],
    randomChaosRate: 0.05,
    metricsInterval: 30,
    realisticBehaviors: true,
    marketDynamics: true,
    socialContagion: true,
  },
  
  // ===========================================================================
  // TIER 2: CASCADING FAILURES
  // ===========================================================================
  
  /** Black Monday - cascading failures in rapid succession */
  BLACK_MONDAY: {
    name: 'Black Monday',
    description: 'Flash crash + bank run + credit freeze + panic',
    duration: { years: 2 },
    clockPreset: 'MONTHLY',
    populationPreset: 'LARGE',
    chaosEvents: [
      { preset: 'FLASH_CRASH', triggerAtDay: 1 },
      { preset: 'BANK_RUN', triggerAtDay: 2 },
      { preset: 'CREDIT_FREEZE', triggerAtDay: 7 },
      { preset: 'CONTAGION_PANIC', triggerAtDay: 30 },
    ],
    randomChaosRate: 0.02,
    metricsInterval: 7,
    realisticBehaviors: true,
    marketDynamics: true,
    socialContagion: true,
  },
  
  // ===========================================================================
  // POSITIVE SCENARIOS
  // ===========================================================================
  
  /** Golden Age - test system under prosperity */
  GOLDEN_AGE: {
    name: 'Golden Age',
    description: '3 years of sustained prosperity - can system handle success?',
    duration: { years: 3 },
    clockPreset: 'MONTHLY',
    populationPreset: 'LARGE',
    chaosEvents: [
      { preset: 'DEMAND_BOOM', triggerAtDay: 30 },
      { preset: 'GOLDEN_AGE', triggerAtDay: 90 },
      { preset: 'TALENT_INFLUX', triggerAtDay: 180 },
      { preset: 'TREASURY_WINDFALL', triggerAtDay: 365 },
    ],
    randomChaosRate: 0.005,
    metricsInterval: 14,
    realisticBehaviors: true,
    marketDynamics: true,
    socialContagion: true,
  },
  
  /** Boom then Bust - test transition from prosperity to crisis */
  BOOM_BUST: {
    name: 'Boom then Bust',
    description: 'Golden age followed by crash - tests adaptation',
    duration: { years: 4 },
    clockPreset: 'MONTHLY',
    populationPreset: 'LARGE',
    chaosEvents: [
      // Year 1-2: Prosperity
      { preset: 'DEMAND_BOOM', triggerAtDay: 30 },
      { preset: 'GOLDEN_AGE', triggerAtDay: 180 },
      { preset: 'TREASURY_WINDFALL', triggerAtDay: 365 },
      // Year 3: Crash
      { preset: 'FLASH_CRASH', triggerAtDay: 730 },
      { preset: 'BANK_RUN', triggerAtDay: 735 },
      { preset: 'MASS_DEFAULT', triggerAtDay: 800 },
      // Year 4: Recovery?
    ],
    randomChaosRate: 0.01,
    metricsInterval: 14,
    realisticBehaviors: true,
    marketDynamics: true,
    socialContagion: true,
  },
  
  // ===========================================================================
  // TIER 3: EXISTENTIAL SCENARIOS
  // ===========================================================================
  
  /** AGI Singularity - superintelligent AI emerges */
  AGI_SINGULARITY: {
    name: 'AGI Singularity',
    description: 'Superintelligent AI makes 99% of scripts obsolete overnight',
    duration: { years: 5 },
    clockPreset: 'FIVE_YEARS_FIVE_MINUTES',
    populationPreset: 'LARGE',
    chaosEvents: [
      // Year 1: Normal operations
      { preset: 'DEMAND_BOOM', triggerAtDay: 180 },
      // Year 2: The Singularity
      { preset: 'AGI_SINGULARITY', triggerAtDay: 365 },
      // Cascading effects
      { preset: 'MASS_DEFAULT', triggerAtDay: 380 },
      { preset: 'GUARDIAN_EXIT', triggerAtDay: 400 },
      { preset: 'CONTAGION_PANIC', triggerAtDay: 420 },
      // Year 3-5: New paradigm or collapse?
    ],
    randomChaosRate: 0.02,
    metricsInterval: 30,
    realisticBehaviors: true,
    marketDynamics: true,
    socialContagion: true,
  },
  
  /** Deflation Trap - economy enters deflationary spiral */
  DEFLATION_TRAP: {
    name: 'Deflation Trap',
    description: 'Prices spiral down, hoarding increases, economy freezes',
    duration: { years: 5 },
    clockPreset: 'FIVE_YEARS_FIVE_MINUTES',
    populationPreset: 'LARGE',
    chaosEvents: [
      // Initial shock
      { preset: 'MARKET_CRASH', triggerAtDay: 90 },
      // Deflation sets in
      { preset: 'DEFLATION_TRAP', triggerAtDay: 180 },
      // Credit markets freeze
      { preset: 'CREDIT_FREEZE', triggerAtDay: 270 },
      // Attempted stimulus (treasury windfall)
      { preset: 'TREASURY_WINDFALL', triggerAtDay: 365 },
      // But liquidity trap means it doesn't help
      { preset: 'CONTAGION_PANIC', triggerAtDay: 500 },
    ],
    randomChaosRate: 0.01,
    metricsInterval: 30,
    realisticBehaviors: true,
    marketDynamics: true,
    socialContagion: true,
  },
  
  // ===========================================================================
  // TIER 5: SYSTEMIC COLLAPSE SCENARIOS
  // ===========================================================================
  
  /** Commons Collapse - tragedy of the commons destroys shared resources */
  COMMONS_COLLAPSE: {
    name: 'Commons Collapse',
    description: 'Shared resources depleted, cooperation breaks down',
    duration: { years: 3 },
    clockPreset: 'MONTHLY',
    populationPreset: 'LARGE',
    chaosEvents: [
      // Free riders emerge
      { preset: 'REPUTATION_INFLATION', triggerAtDay: 90 },
      // Commons start depleting
      { preset: 'COMMONS_COLLAPSE', triggerAtDay: 180 },
      // Trust collapses
      { preset: 'CONTAGION_PANIC', triggerAtDay: 270 },
      // Everyone defects
      { preset: 'MASS_DEFAULT', triggerAtDay: 365 },
    ],
    randomChaosRate: 0.02,
    metricsInterval: 14,
    realisticBehaviors: true,
    marketDynamics: true,
    socialContagion: true,
  },
  
  /** Cartel Takeover - oligopoly captures the entire system */
  CARTEL_TAKEOVER: {
    name: 'Cartel Takeover',
    description: '5 guardians form cartel, capture 80% of market',
    duration: { years: 5 },
    clockPreset: 'FIVE_YEARS_FIVE_MINUTES',
    populationPreset: 'LARGE',
    chaosEvents: [
      // Initial cartel formation
      { preset: 'CARTEL_FORMATION', triggerAtDay: 180 },
      // Cartel consolidates power
      { preset: 'CARTEL_TAKEOVER', triggerAtDay: 365 },
      // Reputation manipulation
      { preset: 'REPUTATION_INFLATION', triggerAtDay: 500 },
      // New entrants blocked, innovation dies
      { preset: 'CREDIT_FREEZE', triggerAtDay: 730 },
      // System ossifies
    ],
    randomChaosRate: 0.005,
    metricsInterval: 30,
    realisticBehaviors: true,
    marketDynamics: true,
    socialContagion: true,
  },
  
  /** Hyperinflation - currency becomes worthless */
  HYPERINFLATION: {
    name: 'Hyperinflation',
    description: 'Treasury bug causes million-fold money supply increase',
    duration: { years: 2 },
    clockPreset: 'MONTHLY',
    populationPreset: 'LARGE',
    chaosEvents: [
      // Treasury bug
      { preset: 'HYPERINFLATION', triggerAtDay: 30 },
      // Panic as prices double weekly
      { preset: 'BANK_RUN', triggerAtDay: 60 },
      { preset: 'CONTAGION_PANIC', triggerAtDay: 90 },
      // Barter economy emerges
      { preset: 'CREDIT_FREEZE', triggerAtDay: 120 },
    ],
    randomChaosRate: 0.03,
    metricsInterval: 7,
    realisticBehaviors: true,
    marketDynamics: true,
    socialContagion: true,
  },
  
  /** Governance Deadlock - system cannot make decisions */
  GOVERNANCE_DEADLOCK: {
    name: 'Governance Deadlock',
    description: 'Factions paralyze decision-making, legitimacy collapses',
    duration: { years: 3 },
    clockPreset: 'MONTHLY',
    populationPreset: 'LARGE',
    chaosEvents: [
      // Factionalization begins
      { preset: 'GOVERNANCE_DEADLOCK', triggerAtDay: 90 },
      // No response to crisis
      { preset: 'MARKET_CRASH', triggerAtDay: 180 },
      // System can't adapt
      { preset: 'MASS_DEFAULT', triggerAtDay: 270 },
      // Legitimacy crisis
      { preset: 'GUARDIAN_EXIT', triggerAtDay: 365 },
    ],
    randomChaosRate: 0.02,
    metricsInterval: 14,
    realisticBehaviors: true,
    marketDynamics: true,
    socialContagion: true,
  },
};

// =============================================================================
// ENHANCED METRICS
// =============================================================================

export interface EnhancedMetrics {
  timestamp: Timestamp;
  simulatedDay: number;
  simulatedYear: number;
  
  // Population
  totalScripts: number;
  activeScripts: number;
  scriptSurvivalRate: number;
  
  // Economic
  totalBalance: bigint;
  totalLoansOutstanding: bigint;
  averageBalance: number;
  medianBalance: number;
  giniCoefficient: number;
  
  // Market
  marketDemand: number;
  marketSupply: number;
  priceMultiplier: number;
  marketSentiment: number;
  cyclePhase: string;
  unemploymentRate: number;
  inflationRate: number;
  interestRate: number;
  
  // Psychology (averages)
  averageMood: number;
  averageStress: number;
  averageBurnout: number;
  averageConfidence: number;
  
  // Events
  defaultsThisPeriod: number;
  exitsThisPeriod: number;
  pivotsThisPeriod: number;
  
  // Health indicators
  deathSpiralRisk: number;  // 0-1
  recoveryStrength: number; // 0-1
  chaosLevel: string;
}

export interface EnhancedResult {
  scenario: EnhancedScenario;
  startTime: Timestamp;
  endTime: Timestamp;
  realDurationMs: number;
  simulatedDays: number;
  
  finalMetrics: EnhancedMetrics;
  metricsHistory: EnhancedMetrics[];
  chaosEvents: ChaosEffect[];
  marketHistory: MarketState[];
  
  analysis: {
    peakScripts: number;
    minScripts: number;
    peakGini: number;
    worstDefaultRate: number;
    systemSurvived: boolean;
    recoveryTime?: number;
    
    // New analysis
    deathSpiralOccurred: boolean;
    deathSpiralDay?: number;
    recoveredFromSpiral: boolean;
    worstMood: number;
    peakStress: number;
    marketCyclesCompleted: number;
    totalDefaults: number;
    totalExits: number;
    totalPivots: number;
  };
}

// =============================================================================
// ENHANCED SCENARIO RUNNER
// =============================================================================

export class EnhancedScenarioRunner {
  private clock: SimulationClock;
  private population: AgentPopulation;
  private chaos: ChaosInjector;
  private market: MarketDynamics;
  private behaviors: RealisticBehaviorEngine;
  private treasury: TreasuryStabilizationFund;
  private scenario: EnhancedScenario;
  
  private metricsHistory: EnhancedMetrics[] = [];
  private marketHistory: MarketState[] = [];
  private chaosEffects: ChaosEffect[] = [];
  private treasuryActions: TreasuryAction[] = [];
  private lastMetricsDay: number = -1;
  private initialScriptCount: number = 0;
  
  // Period counters
  private periodDefaults: number = 0;
  private periodExits: number = 0;
  private periodPivots: number = 0;
  private totalDefaults: number = 0;
  private totalExits: number = 0;
  private totalPivots: number = 0;
  
  constructor(scenario: EnhancedScenario) {
    this.scenario = scenario;
    
    this.clock = createSimulationClock(scenario.clockPreset);
    this.population = createPopulation(scenario.populationPreset);
    this.chaos = createChaosInjector();
    this.market = createMarketDynamics();
    this.behaviors = createBehaviorEngine();
    this.treasury = createTreasuryFund();
    
    for (const event of scenario.chaosEvents) {
      this.chaos.schedulePreset(event.preset, event.triggerAtDay);
    }
  }
  
  // ---------------------------------------------------------------------------
  // RUN
  // ---------------------------------------------------------------------------
  
  async run(): Promise<EnhancedResult> {
    const startTime = Date.now();
    const targetDays = Math.floor(this.scenario.duration.years * 365);
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🚀 ENHANCED SIMULATION: ${this.scenario.name}`);
    console.log(`   ${this.scenario.description}`);
    console.log(`   Duration: ${this.scenario.duration.years} years (${targetDays} days)`);
    console.log(`   Features: ${this.getFeatureList()}`);
    console.log(`${'═'.repeat(60)}\n`);
    
    // Generate population
    const { scripts } = this.population.generate();
    this.initialScriptCount = scripts.length;
    
    // Initialize behaviors for all scripts
    if (this.scenario.realisticBehaviors) {
      for (const script of scripts) {
        this.behaviors.initializeAgent(script);
      }
    }
    
    // Collect initial metrics
    this.collectMetrics({ simulatedDay: 0, simulatedYear: 0 } as SimulationTick);
    
    // Register tick handler
    this.clock.onTick(async (tick) => {
      await this.processTick(tick);
      
      if (tick.simulatedDay >= targetDays) {
        this.clock.stop();
      }
    });
    
    // Progress reporting
    this.clock.onDay(Math.max(1, Math.floor(targetDays / 20)), async (tick) => {
      const progress = (tick.simulatedDay / targetDays * 100).toFixed(1);
      const stats = this.population.getPopulationStats();
      const marketState = this.market.getState();
      console.log(
        `📊 Day ${tick.simulatedDay}/${targetDays} (${progress}%) | ` +
        `Active: ${stats.activeScripts}/${stats.totalScripts} | ` +
        `Market: ${marketState.cyclePhase} | ` +
        `Mood: ${this.getAverageMood().toFixed(2)} | ` +
        `Chaos: ${this.chaos.getChaosLevel()}`
      );
    });
    
    // Start
    this.clock.start();
    await this.waitForCompletion(targetDays);
    
    const endTime = Date.now();
    const result = this.buildResult(startTime, endTime, targetDays);
    this.printSummary(result);
    
    return result;
  }
  
  // ---------------------------------------------------------------------------
  // TICK PROCESSING
  // ---------------------------------------------------------------------------
  
  private async processTick(tick: SimulationTick): Promise<void> {
    // 1. Update market
    let marketState: MarketState;
    if (this.scenario.marketDynamics) {
      marketState = this.market.processTick(tick);
    } else {
      marketState = this.market.getState();
    }
    
    // 2. Process chaos
    const effects = await this.chaos.processTick(tick, this.population);
    this.chaosEffects.push(...effects);
    
    // SPRINT 4: Apply chaos effects to market (including ongoing effects)
    for (const effect of effects) {
      // Immediate shocks
      if (effect.type === 'MarketCrash') {
        this.market.applyShock('demand', -0.4);
        this.market.applyShock('sentiment', -0.5);
      }
      
      // SPRINT 4: Process ongoing effects from chaos events
      if (effect.ongoingEffect) {
        const duration = this.chaos.getEventDuration(effect.type) || 30;
        this.market.addOngoingEffect(
          {
            demandMultiplier: effect.ongoingEffect.demandMultiplier as number | undefined,
            sentimentBoost: effect.ongoingEffect.moodBoost as number | undefined,
            panicMode: effect.ongoingEffect.panicMode as boolean | undefined,
          },
          duration,
          tick.simulatedDay
        );
      }
    }
    
    // 3. SPRINT 5: Process Treasury Stabilization Fund
    const allScripts = this.population.getAllScripts();
    const treasuryActions = this.treasury.processTick(tick, allScripts, marketState);
    this.treasuryActions.push(...treasuryActions);
    
    // 4. Process agent behaviors
    await this.processAgentBehaviors(tick, marketState);
    
    // 5. Collect metrics
    if (tick.simulatedDay - this.lastMetricsDay >= this.scenario.metricsInterval) {
      this.collectMetrics(tick);
      this.lastMetricsDay = tick.simulatedDay;
      
      // Reset period counters
      this.periodDefaults = 0;
      this.periodExits = 0;
      this.periodPivots = 0;
    }
    
    // 6. Record market history
    if (tick.simulatedDay % 7 === 0) {
      this.marketHistory.push(marketState);
    }
  }
  
  private async processAgentBehaviors(tick: SimulationTick, marketState: MarketState): Promise<void> {
    const scripts = this.population.getActiveScripts();
    const allScripts = this.population.getAllScripts();
    
    // Build peer info for social contagion
    const peers: PeerInfo[] = this.scenario.socialContagion
      ? allScripts.slice(0, 50).map(s => ({
          id: s.id,
          reputation: s.state.reputation,
          balance: Number(s.state.walletBalance),
          isActive: s.state.isActive,
          archetype: s.archetype,
        }))
      : [];
    
    for (const script of scripts) {
      if (this.scenario.realisticBehaviors) {
        // Use realistic behavior engine
        const ctx: DecisionContext = {
          tick,
          market: marketState,
          script,
          guardian: this.population.getGuardian(script.guardianId),
          peers,
        };
        
        const outcome = this.behaviors.processBehavior(ctx);
        
        // Apply outcome
        script.state.walletBalance += BigInt(Math.round(outcome.earnings));
        
        if (script.state.loanOutstanding > 0n && outcome.loanPayment > 0) {
          const payment = BigInt(Math.round(Math.min(
            outcome.loanPayment,
            Number(script.state.loanOutstanding)
          )));
          script.state.walletBalance -= payment;
          script.state.loanOutstanding -= payment;
        }
        
        script.state.reputation = Math.max(0, Math.min(100,
          script.state.reputation + outcome.reputationDelta
        ));
        
        if (outcome.defaulted) {
          script.state.isActive = false;
          this.periodDefaults++;
          this.totalDefaults++;
        }
        
        if (outcome.pivoted) {
          this.periodPivots++;
          this.totalPivots++;
        }
        
        // Check for exit
        for (const action of outcome.actions) {
          if (action.type === 'exit') {
            script.state.isActive = false;
            this.periodExits++;
            this.totalExits++;
          }
        }
        
      } else {
        // Simple behavior (v1 style)
        const earnings = this.calculateSimpleEarnings(script, marketState);
        script.state.walletBalance += BigInt(Math.round(earnings));
        
        if (script.state.loanOutstanding > 0n) {
          const payment = BigInt(Math.round(Math.min(
            Number(script.state.walletBalance) * 0.1,
            Number(script.state.loanOutstanding)
          )));
          script.state.walletBalance -= payment;
          script.state.loanOutstanding -= payment;
        }
      }
      
      script.state.lastActiveAt = tick.simulatedTime;
    }
  }
  
  private calculateSimpleEarnings(script: SimulatedScript, market: MarketState): number {
    const base = 10;
    const work = 0.5 + script.traits.workEthic;
    const skill = 0.5 + script.traits.skillLevel;
    const marketMult = market.priceMultiplier * market.demand;
    const luck = 0.8 + Math.random() * 0.4;
    return base * work * skill * marketMult * luck;
  }
  
  // ---------------------------------------------------------------------------
  // METRICS
  // ---------------------------------------------------------------------------
  
  private collectMetrics(tick: SimulationTick): void {
    const stats = this.population.getPopulationStats();
    const scripts = this.population.getAllScripts();
    const marketState = this.market.getState();
    
    const balances = scripts.map(s => Number(s.state.walletBalance));
    const sortedBalances = [...balances].sort((a, b) => a - b);
    
    // Psychology averages
    let totalMood = 0, totalStress = 0, totalBurnout = 0, totalConfidence = 0;
    let psychCount = 0;
    
    if (this.scenario.realisticBehaviors) {
      for (const script of scripts) {
        const psych = this.behaviors.getPsychology(script.id);
        if (psych) {
          totalMood += psych.mood;
          totalStress += psych.stress;
          totalBurnout += psych.burnout;
          totalConfidence += psych.confidence;
          psychCount++;
        }
      }
    }
    
    const metrics: EnhancedMetrics = {
      timestamp: tick.simulatedTime ?? Date.now(),
      simulatedDay: tick.simulatedDay,
      simulatedYear: tick.simulatedYear,
      
      totalScripts: stats.totalScripts,
      activeScripts: stats.activeScripts,
      scriptSurvivalRate: stats.activeScripts / this.initialScriptCount,
      
      totalBalance: stats.totalBalance,
      totalLoansOutstanding: stats.totalLoansOutstanding,
      averageBalance: balances.reduce((a, b) => a + b, 0) / balances.length,
      medianBalance: sortedBalances[Math.floor(sortedBalances.length / 2)] ?? 0,
      giniCoefficient: this.calculateGini(balances),
      
      marketDemand: marketState.demand,
      marketSupply: marketState.supply,
      priceMultiplier: marketState.priceMultiplier,
      marketSentiment: marketState.sentiment,
      cyclePhase: marketState.cyclePhase,
      unemploymentRate: marketState.unemploymentRate,
      inflationRate: marketState.inflationRate,
      interestRate: marketState.interestRate,
      
      averageMood: psychCount > 0 ? totalMood / psychCount : 0,
      averageStress: psychCount > 0 ? totalStress / psychCount : 0,
      averageBurnout: psychCount > 0 ? totalBurnout / psychCount : 0,
      averageConfidence: psychCount > 0 ? totalConfidence / psychCount : 0,
      
      defaultsThisPeriod: this.periodDefaults,
      exitsThisPeriod: this.periodExits,
      pivotsThisPeriod: this.periodPivots,
      
      deathSpiralRisk: this.calculateDeathSpiralRisk(stats, marketState),
      recoveryStrength: this.calculateRecoveryStrength(stats, marketState),
      chaosLevel: this.chaos.getChaosLevel(),
    };
    
    this.metricsHistory.push(metrics);
  }
  
  private calculateDeathSpiralRisk(stats: PopulationStats, market: MarketState): number {
    let risk = 0;
    
    // High default rate
    const defaultRate = (stats.totalScripts - stats.activeScripts) / stats.totalScripts;
    risk += defaultRate * 0.3;
    
    // Negative sentiment
    if (market.sentiment < 0) {
      risk += Math.abs(market.sentiment) * 0.2;
    }
    
    // Contraction phase
    if (market.cyclePhase === 'Contraction' || market.cyclePhase === 'Trough') {
      risk += 0.2;
    }
    
    // High unemployment
    risk += market.unemploymentRate * 0.2;
    
    // Low demand
    if (market.demand < 0.7) {
      risk += (0.7 - market.demand) * 0.3;
    }
    
    return Math.min(1, risk);
  }
  
  private calculateRecoveryStrength(stats: PopulationStats, market: MarketState): number {
    let strength = 0.5;
    
    // Positive sentiment
    if (market.sentiment > 0) {
      strength += market.sentiment * 0.2;
    }
    
    // Expansion phase
    if (market.cyclePhase === 'Expansion') {
      strength += 0.2;
    }
    
    // High active rate
    const activeRate = stats.activeScripts / stats.totalScripts;
    strength += (activeRate - 0.5) * 0.3;
    
    // Low unemployment
    strength += (0.1 - market.unemploymentRate) * 0.2;
    
    return Math.max(0, Math.min(1, strength));
  }
  
  private getAverageMood(): number {
    const scripts = this.population.getAllScripts();
    let total = 0, count = 0;
    for (const script of scripts) {
      const psych = this.behaviors.getPsychology(script.id);
      if (psych) {
        total += psych.mood;
        count++;
      }
    }
    return count > 0 ? total / count : 0;
  }
  
  private calculateGini(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((a, b) => a + b, 0) / n;
    if (mean === 0) return 0;
    
    let sumDiff = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        sumDiff += Math.abs(sorted[i] - sorted[j]);
      }
    }
    return sumDiff / (2 * n * n * mean);
  }
  
  // ---------------------------------------------------------------------------
  // RESULTS
  // ---------------------------------------------------------------------------
  
  private buildResult(startTime: Timestamp, endTime: Timestamp, targetDays: number): EnhancedResult {
    const finalMetrics = this.metricsHistory[this.metricsHistory.length - 1];
    
    const survivalRates = this.metricsHistory.map(m => m.scriptSurvivalRate);
    const ginis = this.metricsHistory.map(m => m.giniCoefficient);
    const defaultRates = this.metricsHistory.map(m => 1 - m.scriptSurvivalRate);
    const moods = this.metricsHistory.map(m => m.averageMood);
    const stresses = this.metricsHistory.map(m => m.averageStress);
    const spiralRisks = this.metricsHistory.map(m => m.deathSpiralRisk);
    
    // Detect death spiral
    const deathSpiralThreshold = 0.7;
    const spiralIndex = spiralRisks.findIndex(r => r > deathSpiralThreshold);
    const deathSpiralOccurred = spiralIndex >= 0;
    const deathSpiralDay = deathSpiralOccurred ? this.metricsHistory[spiralIndex].simulatedDay : undefined;
    
    // Check recovery
    let recoveredFromSpiral = false;
    let recoveryTime: number | undefined;
    if (deathSpiralOccurred && spiralIndex < spiralRisks.length - 1) {
      for (let i = spiralIndex + 1; i < spiralRisks.length; i++) {
        if (spiralRisks[i] < 0.3) {
          recoveredFromSpiral = true;
          recoveryTime = this.metricsHistory[i].simulatedDay - deathSpiralDay!;
          break;
        }
      }
    }
    
    // Count market cycles
    let cycleChanges = 0;
    for (let i = 1; i < this.metricsHistory.length; i++) {
      if (this.metricsHistory[i].cyclePhase !== this.metricsHistory[i-1].cyclePhase) {
        cycleChanges++;
      }
    }
    
    return {
      scenario: this.scenario,
      startTime,
      endTime,
      realDurationMs: endTime - startTime,
      simulatedDays: targetDays,
      
      finalMetrics,
      metricsHistory: this.metricsHistory,
      chaosEvents: this.chaosEffects,
      marketHistory: this.marketHistory,
      
      analysis: {
        peakScripts: Math.max(...this.metricsHistory.map(m => m.activeScripts)),
        minScripts: Math.min(...this.metricsHistory.map(m => m.activeScripts)),
        peakGini: Math.max(...ginis),
        worstDefaultRate: Math.max(...defaultRates),
        systemSurvived: finalMetrics.activeScripts > 0,
        recoveryTime,
        
        deathSpiralOccurred,
        deathSpiralDay,
        recoveredFromSpiral,
        worstMood: Math.min(...moods),
        peakStress: Math.max(...stresses),
        marketCyclesCompleted: Math.floor(cycleChanges / 4),
        totalDefaults: this.totalDefaults,
        totalExits: this.totalExits,
        totalPivots: this.totalPivots,
      },
    };
  }
  
  private printSummary(result: EnhancedResult): void {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 ENHANCED SIMULATION COMPLETE: ${result.scenario.name}`);
    console.log(`${'═'.repeat(60)}`);
    
    console.log(`\n⏱️  Real time: ${(result.realDurationMs / 1000).toFixed(1)}s`);
    console.log(`📅 Simulated: ${result.simulatedDays} days (${(result.simulatedDays / 365).toFixed(1)} years)`);
    
    console.log(`\n📈 Final State:`);
    console.log(`   Scripts: ${result.finalMetrics.activeScripts}/${result.finalMetrics.totalScripts} active`);
    console.log(`   Survival Rate: ${(result.finalMetrics.scriptSurvivalRate * 100).toFixed(1)}%`);
    console.log(`   Avg Balance: ${result.finalMetrics.averageBalance.toFixed(0)}`);
    console.log(`   Median Balance: ${result.finalMetrics.medianBalance.toFixed(0)}`);
    console.log(`   Gini: ${result.finalMetrics.giniCoefficient.toFixed(3)}`);
    
    console.log(`\n🧠 Psychology:`);
    console.log(`   Avg Mood: ${result.finalMetrics.averageMood.toFixed(2)}`);
    console.log(`   Avg Stress: ${result.finalMetrics.averageStress.toFixed(2)}`);
    console.log(`   Avg Burnout: ${result.finalMetrics.averageBurnout.toFixed(2)}`);
    
    console.log(`\n📉 Market:`);
    console.log(`   Cycle Phase: ${result.finalMetrics.cyclePhase}`);
    console.log(`   Demand: ${result.finalMetrics.marketDemand.toFixed(2)}`);
    console.log(`   Unemployment: ${(result.finalMetrics.unemploymentRate * 100).toFixed(1)}%`);
    console.log(`   Inflation: ${(result.finalMetrics.inflationRate * 100).toFixed(1)}%`);
    
    console.log(`\n🔥 Events:`);
    console.log(`   Chaos Events: ${result.chaosEvents.length}`);
    console.log(`   Total Defaults: ${result.analysis.totalDefaults}`);
    console.log(`   Total Exits: ${result.analysis.totalExits}`);
    console.log(`   Total Pivots: ${result.analysis.totalPivots}`);
    console.log(`   Market Cycles: ${result.analysis.marketCyclesCompleted}`);
    
    console.log(`\n📊 Analysis:`);
    console.log(`   Peak Scripts: ${result.analysis.peakScripts}`);
    console.log(`   Min Scripts: ${result.analysis.minScripts}`);
    console.log(`   Worst Default Rate: ${(result.analysis.worstDefaultRate * 100).toFixed(1)}%`);
    console.log(`   Worst Mood: ${result.analysis.worstMood.toFixed(2)}`);
    console.log(`   Peak Stress: ${result.analysis.peakStress.toFixed(2)}`);
    
    if (result.analysis.deathSpiralOccurred) {
      console.log(`\n⚠️  DEATH SPIRAL DETECTED at Day ${result.analysis.deathSpiralDay}`);
      if (result.analysis.recoveredFromSpiral) {
        console.log(`   ✅ Recovered in ${result.analysis.recoveryTime} days`);
      } else {
        console.log(`   ❌ Did not recover`);
      }
    }
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🏁 VERDICT: ${result.analysis.systemSurvived ? '✅ SYSTEM SURVIVED' : '❌ SYSTEM COLLAPSED'}`);
    console.log(`${'═'.repeat(60)}\n`);
  }
  
  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------
  
  private getFeatureList(): string {
    const features = [];
    if (this.scenario.realisticBehaviors) features.push('Psychology');
    if (this.scenario.marketDynamics) features.push('Market');
    if (this.scenario.socialContagion) features.push('Contagion');
    return features.join(', ') || 'Basic';
  }
  
  private async waitForCompletion(targetDays: number): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const tick = this.clock.getCurrentTick();
        if (tick.simulatedDay >= targetDays || !(this.clock as any).running) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function runEnhancedScenario(
  preset: keyof typeof ENHANCED_SCENARIOS
): Promise<EnhancedResult> {
  const scenario = ENHANCED_SCENARIOS[preset];
  const runner = new EnhancedScenarioRunner(scenario);
  return runner.run();
}

export function createEnhancedRunner(
  scenario: EnhancedScenario
): EnhancedScenarioRunner {
  return new EnhancedScenarioRunner(scenario);
}
