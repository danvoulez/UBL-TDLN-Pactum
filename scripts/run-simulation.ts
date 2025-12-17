#!/usr/bin/env npx ts-node
/**
 * RUN SIMULATION
 * 
 * Execute a simulation scenario and see the future of the economy.
 * 
 * Usage:
 *   npx ts-node scripts/run-simulation.ts [scenario]
 * 
 * Scenarios:
 *   SMOKE_TEST      - Quick 30-day test
 *   BASELINE        - 1 year normal operation
 *   TECH_DISRUPTION - 5 years with GPT-5 at year 2
 *   ECONOMIC_CRISIS - 3 years with market crash
 *   ADVERSARIAL     - 2 years with cartel + treasury bug
 *   APOCALYPSE      - 5 years of maximum chaos
 */

import { runScenario, SCENARIO_PRESETS, type SimulationResult } from '../core/simulation';

async function main() {
  const scenarioName = (process.argv[2] || 'SMOKE_TEST').toUpperCase() as keyof typeof SCENARIO_PRESETS;
  
  if (!SCENARIO_PRESETS[scenarioName]) {
    console.error(`❌ Unknown scenario: ${scenarioName}`);
    console.error(`\nAvailable scenarios:`);
    for (const [name, scenario] of Object.entries(SCENARIO_PRESETS)) {
      console.error(`  ${name.padEnd(20)} - ${scenario.description}`);
    }
    process.exit(1);
  }
  
  console.log(`\n🎬 Starting simulation: ${scenarioName}\n`);
  
  const result = await runScenario(scenarioName);
  
  // Export results
  printDetailedAnalysis(result);
  
  // Exit
  process.exit(result.analysis.systemSurvived ? 0 : 1);
}

function printDetailedAnalysis(result: SimulationResult): void {
  console.log(`\n${'━'.repeat(60)}`);
  console.log(`📊 DETAILED ANALYSIS`);
  console.log(`${'━'.repeat(60)}\n`);
  
  // Time series summary
  console.log(`📈 Survival Rate Over Time:`);
  const checkpoints = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const idx = Math.floor(pct * (result.metricsHistory.length - 1));
    const m = result.metricsHistory[idx];
    return `  Day ${m.simulatedDay.toString().padStart(4)}: ${(m.scriptSurvivalRate * 100).toFixed(1)}% (${m.activeScripts} active)`;
  });
  console.log(checkpoints.join('\n'));
  
  // Gini coefficient trend
  console.log(`\n📊 Inequality (Gini) Over Time:`);
  const giniCheckpoints = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const idx = Math.floor(pct * (result.metricsHistory.length - 1));
    const m = result.metricsHistory[idx];
    const bar = '█'.repeat(Math.floor(m.giniCoefficient * 20));
    return `  Day ${m.simulatedDay.toString().padStart(4)}: ${m.giniCoefficient.toFixed(3)} ${bar}`;
  });
  console.log(giniCheckpoints.join('\n'));
  
  // Chaos events
  if (result.chaosEvents.length > 0) {
    console.log(`\n💥 Chaos Events:`);
    for (const event of result.chaosEvents) {
      console.log(`  ${event.type}: ${event.description}`);
      console.log(`    Impact: ${event.economicImpact.toFixed(0)} | Scripts affected: ${event.scriptsAffected}`);
      if (event.systemAlert) {
        console.log(`    ⚠️  ${event.systemAlert}`);
      }
    }
  }
  
  // Verdict
  console.log(`\n${'━'.repeat(60)}`);
  console.log(`🏁 VERDICT`);
  console.log(`${'━'.repeat(60)}`);
  
  if (result.analysis.systemSurvived) {
    console.log(`\n✅ SYSTEM SURVIVED`);
    
    if (result.analysis.worstDefaultRate > 0.5) {
      console.log(`   ⚠️  But barely - ${(result.analysis.worstDefaultRate * 100).toFixed(0)}% default rate at worst`);
    }
    
    if (result.analysis.recoveryTime) {
      console.log(`   📈 Recovered in ${result.analysis.recoveryTime} days`);
    }
    
    if (result.finalMetrics.giniCoefficient > 0.6) {
      console.log(`   ⚠️  High inequality (Gini: ${result.finalMetrics.giniCoefficient.toFixed(2)})`);
    }
  } else {
    console.log(`\n❌ SYSTEM COLLAPSED`);
    console.log(`   All scripts died or became inactive`);
    console.log(`   Worst default rate: ${(result.analysis.worstDefaultRate * 100).toFixed(0)}%`);
  }
  
  console.log(`\n${'━'.repeat(60)}\n`);
}

main().catch(console.error);
