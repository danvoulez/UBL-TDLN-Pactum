/**
 * SIMULATION FRAMEWORK
 * 
 * "5 years in 5 minutes" - Time travel for economic testing
 * 
 * Usage:
 * ```typescript
 * import { runScenario, SCENARIO_PRESETS } from './core/simulation';
 * 
 * // Run a preset scenario
 * const result = await runScenario('TECH_DISRUPTION');
 * 
 * // Or create custom scenario
 * const runner = createScenarioRunner({
 *   name: 'My Scenario',
 *   duration: { years: 5 },
 *   clockPreset: 'FIVE_YEARS_FIVE_MINUTES',
 *   populationPreset: 'LARGE',
 *   chaosEvents: [
 *     { preset: 'MODEL_RELEASE', triggerAtDay: 365 },
 *   ],
 *   randomChaosRate: 0.01,
 *   metricsInterval: 30,
 * });
 * const result = await runner.run();
 * ```
 */

// Clock
export { 
  SimulationClock, 
  createSimulationClock, 
  CLOCK_PRESETS,
  type ClockConfig,
  type SimulationTick,
  type TickHandler,
} from './simulation-clock';

// Population
export {
  AgentPopulation,
  createPopulation,
  POPULATION_PRESETS,
  AGENT_ARCHETYPES,
  type AgentTraits,
  type SimulatedAgent,
  type SimulatedScript,
  type SimulatedGuardian,
  type PopulationConfig,
  type PopulationStats,
} from './agent-population';

// Chaos
export {
  ChaosInjector,
  createChaosInjector,
  CHAOS_SCENARIOS,
  type ChaosEvent,
  type ChaosEventType,
  type ChaosEffect,
} from './chaos-injector';

// Scenarios
export {
  ScenarioRunner,
  createScenarioRunner,
  runScenario,
  SCENARIO_PRESETS,
  type SimulationScenario,
  type SimulationMetrics,
  type SimulationResult,
} from './scenario-runner';

// Market Dynamics
export {
  MarketDynamics,
  createMarketDynamics,
  type MarketState,
  type CycleConfig,
} from './market-dynamics';

// Realistic Behaviors
export {
  RealisticBehaviorEngine,
  createBehaviorEngine,
  type AgentPsychology,
  type BehaviorOutcome,
  type DecisionContext,
} from './realistic-behaviors';

// Enhanced Scenarios (V2)
export {
  EnhancedScenarioRunner,
  createEnhancedRunner,
  runEnhancedScenario,
  ENHANCED_SCENARIOS,
  type EnhancedScenario,
  type EnhancedMetrics,
  type EnhancedResult,
} from './scenario-runner-v2';
