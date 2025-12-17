/**
 * SCENARIO RUNNER
 * 
 * Run complete simulation scenarios and collect metrics.
 * "5 years in 5 minutes" - See the future of your economy.
 */

import type { Timestamp } from '../shared/types';
import { SimulationClock, createSimulationClock, CLOCK_PRESETS, type SimulationTick } from './simulation-clock';
import { AgentPopulation, createPopulation, POPULATION_PRESETS, type PopulationStats } from './agent-population';
import { ChaosInjector, createChaosInjector, CHAOS_SCENARIOS, type ChaosEvent, type ChaosEffect } from './chaos-injector';

// =============================================================================
// SCENARIO DEFINITION
// =============================================================================

export interface SimulationScenario {
  name: string;
  description: string;
  
  /** Duration to simulate */
  duration: {
    years: number;
  };
  
  /** Clock speed preset */
  clockPreset: keyof typeof CLOCK_PRESETS;
  
  /** Population preset */
  populationPreset: keyof typeof POPULATION_PRESETS;
  
  /** Scheduled chaos events */
  chaosEvents: Array<{
    preset: keyof typeof CHAOS_SCENARIOS;
    triggerAtDay: number;
  }>;
  
  /** Random chaos rate (0-1) */
  randomChaosRate: number;
  
  /** Metrics collection interval (days) */
  metricsInterval: number;
}

export const SCENARIO_PRESETS: Record<string, SimulationScenario> = {
  /** Quick sanity check */
  SMOKE_TEST: {
    name: 'Smoke Test',
    description: 'Quick 30-day test with small population',
    duration: { years: 0.08 }, // ~30 days
    clockPreset: 'WEEKLY',
    populationPreset: 'SMALL',
    chaosEvents: [],
    randomChaosRate: 0,
    metricsInterval: 1,
  },
  
  /** 1 year normal operation */
  BASELINE: {
    name: 'Baseline',
    description: '1 year of normal operation',
    duration: { years: 1 },
    clockPreset: 'DAILY',
    populationPreset: 'MEDIUM',
    chaosEvents: [],
    randomChaosRate: 0.005,
    metricsInterval: 7,
  },
  
  /** 5 years with model release shock */
  TECH_DISRUPTION: {
    name: 'Tech Disruption',
    description: '5 years with GPT-5 release at year 2',
    duration: { years: 5 },
    clockPreset: 'FIVE_YEARS_FIVE_MINUTES',
    populationPreset: 'MEDIUM',
    chaosEvents: [
      { preset: 'MODEL_RELEASE', triggerAtDay: 730 }, // Year 2
    ],
    randomChaosRate: 0.01,
    metricsInterval: 30,
  },
  
  /** Economic stress test */
  ECONOMIC_CRISIS: {
    name: 'Economic Crisis',
    description: '3 years with market crash and mass defaults',
    duration: { years: 3 },
    clockPreset: 'MONTHLY',
    populationPreset: 'LARGE',
    chaosEvents: [
      { preset: 'MARKET_CRASH', triggerAtDay: 180 },
      { preset: 'MASS_DEFAULT', triggerAtDay: 270 },
    ],
    randomChaosRate: 0.02,
    metricsInterval: 7,
  },
  
  /** Security stress test */
  ADVERSARIAL: {
    name: 'Adversarial',
    description: '2 years with cartel formation and treasury bug',
    duration: { years: 2 },
    clockPreset: 'WEEKLY',
    populationPreset: 'ADVERSARIAL',
    chaosEvents: [
      { preset: 'CARTEL_FORMATION', triggerAtDay: 90 },
      { preset: 'TREASURY_BUG', triggerAtDay: 365 },
    ],
    randomChaosRate: 0.03,
    metricsInterval: 7,
  },
  
  /** Everything goes wrong */
  APOCALYPSE: {
    name: 'Apocalypse',
    description: '5 years of maximum chaos',
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
  },
};

// =============================================================================
// METRICS
// =============================================================================

export interface SimulationMetrics {
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
  giniCoefficient: number;
  
  // Reputation
  averageReputation: number;
  reputationStdDev: number;
  
  // Health
  defaultRate: number;
  badActorRate: number;
  chaosLevel: string;
  
  // Events
  chaosEventsActive: number;
  chaosEventsTotal: number;
}

export interface SimulationResult {
  scenario: SimulationScenario;
  startTime: Timestamp;
  endTime: Timestamp;
  realDurationMs: number;
  simulatedDays: number;
  
  // Final state
  finalMetrics: SimulationMetrics;
  
  // Time series
  metricsHistory: SimulationMetrics[];
  
  // Chaos
  chaosEvents: ChaosEffect[];
  
  // Analysis
  analysis: {
    peakScripts: number;
    minScripts: number;
    peakGini: number;
    worstDefaultRate: number;
    systemSurvived: boolean;
    recoveryTime?: number; // Days to recover from worst point
  };
}

// =============================================================================
// SCENARIO RUNNER
// =============================================================================

export class ScenarioRunner {
  private clock: SimulationClock;
  private population: AgentPopulation;
  private chaos: ChaosInjector;
  private scenario: SimulationScenario;
  
  private metricsHistory: SimulationMetrics[] = [];
  private chaosEffects: ChaosEffect[] = [];
  private lastMetricsDay: number = -1;
  private initialScriptCount: number = 0;
  
  constructor(scenario: SimulationScenario) {
    this.scenario = scenario;
    
    // Initialize components
    this.clock = createSimulationClock(scenario.clockPreset);
    this.population = createPopulation(scenario.populationPreset);
    this.chaos = createChaosInjector();
    
    // Schedule chaos events
    for (const event of scenario.chaosEvents) {
      this.chaos.schedulePreset(event.preset, event.triggerAtDay);
    }
  }
  
  // ---------------------------------------------------------------------------
  // RUN
  // ---------------------------------------------------------------------------
  
  async run(): Promise<SimulationResult> {
    const startTime = Date.now();
    const targetDays = Math.floor(this.scenario.duration.years * 365);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 SIMULATION: ${this.scenario.name}`);
    console.log(`   ${this.scenario.description}`);
    console.log(`   Duration: ${this.scenario.duration.years} years (${targetDays} days)`);
    console.log(`${'='.repeat(60)}\n`);
    
    // Generate population
    this.population.generate();
    this.initialScriptCount = this.population.getAllScripts().length;
    
    // Collect initial metrics
    this.collectMetrics({ simulatedDay: 0, simulatedYear: 0 } as SimulationTick);
    
    // Register tick handler
    this.clock.onTick(async (tick) => {
      await this.processTick(tick);
      
      // Check if done
      if (tick.simulatedDay >= targetDays) {
        this.clock.stop();
      }
    });
    
    // Progress reporting
    this.clock.onDay(Math.max(1, Math.floor(targetDays / 20)), async (tick) => {
      const progress = (tick.simulatedDay / targetDays * 100).toFixed(1);
      const stats = this.population.getPopulationStats();
      console.log(`📊 Day ${tick.simulatedDay}/${targetDays} (${progress}%) - Active: ${stats.activeScripts}/${stats.totalScripts}, Chaos: ${this.chaos.getChaosLevel()}`);
    });
    
    // Start simulation
    this.clock.start();
    
    // Wait for completion
    await this.waitForCompletion(targetDays);
    
    const endTime = Date.now();
    
    // Build result
    const result = this.buildResult(startTime, endTime, targetDays);
    
    // Print summary
    this.printSummary(result);
    
    return result;
  }
  
  // ---------------------------------------------------------------------------
  // TICK PROCESSING
  // ---------------------------------------------------------------------------
  
  private async processTick(tick: SimulationTick): Promise<void> {
    // Process chaos
    const effects = await this.chaos.processTick(tick, this.population);
    this.chaosEffects.push(...effects);
    
    // Simulate agent behavior (simplified)
    await this.simulateAgentBehavior(tick);
    
    // Collect metrics at interval
    if (tick.simulatedDay - this.lastMetricsDay >= this.scenario.metricsInterval) {
      this.collectMetrics(tick);
      this.lastMetricsDay = tick.simulatedDay;
    }
  }
  
  private async simulateAgentBehavior(tick: SimulationTick): Promise<void> {
    const scripts = this.population.getActiveScripts();
    
    for (const script of scripts) {
      // Work and earn (based on traits)
      const earnings = this.calculateEarnings(script.traits, tick);
      script.state.walletBalance += BigInt(Math.round(earnings));
      
      // Pay loan (if any)
      if (script.state.loanOutstanding > 0n) {
        const payment = BigInt(Math.round(Math.min(
          Number(script.state.walletBalance) * 0.1,
          Number(script.state.loanOutstanding)
        )));
        script.state.walletBalance -= payment;
        script.state.loanOutstanding -= payment;
      }
      
      // Reputation change
      const reputationDelta = (script.traits.honesty - 0.5) * 0.1 + 
                              (script.traits.workEthic - 0.5) * 0.1;
      script.state.reputation = Math.max(0, Math.min(100, 
        script.state.reputation + reputationDelta
      ));
      
      // Check for default
      if (script.state.walletBalance < -100n && script.state.loanOutstanding > 0n) {
        if (Math.random() < 0.1) { // 10% chance to default when broke
          script.state.isActive = false;
          script.state.reputation = 0;
        }
      }
      
      script.state.lastActiveAt = tick.simulatedTime;
    }
  }
  
  private calculateEarnings(traits: { workEthic: number; skillLevel: number }, tick: SimulationTick): number {
    const baseEarnings = 10; // Base daily earnings
    const workMultiplier = 0.5 + traits.workEthic;
    const skillMultiplier = 0.5 + traits.skillLevel;
    
    // Market conditions (from chaos)
    let marketMultiplier = 1;
    for (const active of this.chaos.getActiveEvents()) {
      if (active.event.type === 'MarketCrash') {
        marketMultiplier *= 1 - ((active.event.params.demandDrop as number) ?? 0.5);
      }
    }
    
    return baseEarnings * workMultiplier * skillMultiplier * marketMultiplier * (0.8 + Math.random() * 0.4);
  }
  
  // ---------------------------------------------------------------------------
  // METRICS
  // ---------------------------------------------------------------------------
  
  private collectMetrics(tick: SimulationTick): void {
    const stats = this.population.getPopulationStats();
    const scripts = this.population.getAllScripts();
    const balances = scripts.map(s => Number(s.state.walletBalance));
    const reputations = scripts.map(s => s.state.reputation);
    
    const metrics: SimulationMetrics = {
      timestamp: tick.simulatedTime ?? Date.now(),
      simulatedDay: tick.simulatedDay,
      simulatedYear: tick.simulatedYear,
      
      totalScripts: stats.totalScripts,
      activeScripts: stats.activeScripts,
      scriptSurvivalRate: stats.activeScripts / this.initialScriptCount,
      
      totalBalance: stats.totalBalance,
      totalLoansOutstanding: stats.totalLoansOutstanding,
      averageBalance: balances.reduce((a, b) => a + b, 0) / balances.length,
      giniCoefficient: this.calculateGini(balances),
      
      averageReputation: reputations.reduce((a, b) => a + b, 0) / reputations.length,
      reputationStdDev: this.calculateStdDev(reputations),
      
      defaultRate: (stats.totalScripts - stats.activeScripts) / stats.totalScripts,
      badActorRate: stats.badActorCount / stats.totalScripts,
      chaosLevel: this.chaos.getChaosLevel(),
      
      chaosEventsActive: this.chaos.getActiveEvents().length,
      chaosEventsTotal: this.chaosEffects.length,
    };
    
    this.metricsHistory.push(metrics);
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
  
  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => (v - mean) ** 2);
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }
  
  // ---------------------------------------------------------------------------
  // RESULTS
  // ---------------------------------------------------------------------------
  
  private buildResult(startTime: Timestamp, endTime: Timestamp, targetDays: number): SimulationResult {
    const finalMetrics = this.metricsHistory[this.metricsHistory.length - 1];
    
    // Analysis
    const survivalRates = this.metricsHistory.map(m => m.scriptSurvivalRate);
    const ginis = this.metricsHistory.map(m => m.giniCoefficient);
    const defaultRates = this.metricsHistory.map(m => m.defaultRate);
    
    const minSurvival = Math.min(...survivalRates);
    const worstDay = this.metricsHistory.findIndex(m => m.scriptSurvivalRate === minSurvival);
    
    // Find recovery (if any)
    let recoveryTime: number | undefined;
    if (worstDay < this.metricsHistory.length - 1) {
      for (let i = worstDay + 1; i < this.metricsHistory.length; i++) {
        if (this.metricsHistory[i].scriptSurvivalRate > minSurvival + 0.1) {
          recoveryTime = this.metricsHistory[i].simulatedDay - this.metricsHistory[worstDay].simulatedDay;
          break;
        }
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
      
      analysis: {
        peakScripts: Math.max(...this.metricsHistory.map(m => m.activeScripts)),
        minScripts: Math.min(...this.metricsHistory.map(m => m.activeScripts)),
        peakGini: Math.max(...ginis),
        worstDefaultRate: Math.max(...defaultRates),
        systemSurvived: finalMetrics.activeScripts > 0,
        recoveryTime,
      },
    };
  }
  
  private printSummary(result: SimulationResult): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 SIMULATION COMPLETE: ${result.scenario.name}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n⏱️  Real time: ${(result.realDurationMs / 1000).toFixed(1)}s`);
    console.log(`📅 Simulated: ${result.simulatedDays} days (${(result.simulatedDays / 365).toFixed(1)} years)`);
    console.log(`\n📈 Final State:`);
    console.log(`   Scripts: ${result.finalMetrics.activeScripts}/${result.finalMetrics.totalScripts} active`);
    console.log(`   Survival Rate: ${(result.finalMetrics.scriptSurvivalRate * 100).toFixed(1)}%`);
    console.log(`   Avg Balance: ${result.finalMetrics.averageBalance.toFixed(0)}`);
    console.log(`   Gini: ${result.finalMetrics.giniCoefficient.toFixed(3)}`);
    console.log(`   Avg Reputation: ${result.finalMetrics.averageReputation.toFixed(1)}`);
    console.log(`\n🔥 Chaos Events: ${result.chaosEvents.length}`);
    console.log(`\n📊 Analysis:`);
    console.log(`   Peak Scripts: ${result.analysis.peakScripts}`);
    console.log(`   Min Scripts: ${result.analysis.minScripts}`);
    console.log(`   Worst Default Rate: ${(result.analysis.worstDefaultRate * 100).toFixed(1)}%`);
    console.log(`   Peak Gini: ${result.analysis.peakGini.toFixed(3)}`);
    console.log(`   System Survived: ${result.analysis.systemSurvived ? '✅ YES' : '❌ NO'}`);
    if (result.analysis.recoveryTime) {
      console.log(`   Recovery Time: ${result.analysis.recoveryTime} days`);
    }
    console.log(`\n${'='.repeat(60)}\n`);
  }
  
  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------
  
  private async waitForCompletion(targetDays: number): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const tick = this.clock.getCurrentTick();
        if (tick.simulatedDay >= targetDays || !this.clock['running']) {
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

export function runScenario(
  preset: keyof typeof SCENARIO_PRESETS
): Promise<SimulationResult> {
  const scenario = SCENARIO_PRESETS[preset];
  const runner = new ScenarioRunner(scenario);
  return runner.run();
}

export function createScenarioRunner(
  scenario: SimulationScenario
): ScenarioRunner {
  return new ScenarioRunner(scenario);
}
