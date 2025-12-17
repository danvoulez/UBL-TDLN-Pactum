#!/usr/bin/env npx tsx
/**
 * RUN ENHANCED SIMULATION V2
 * 
 * Execute realistic simulation with:
 * - Market dynamics (cycles, supply/demand)
 * - Agent psychology (mood, stress, burnout)
 * - Social contagion
 * - Death spiral detection
 * 
 * Usage:
 *   npx tsx scripts/run-simulation-v2.ts [scenario]
 * 
 * Scenarios:
 *   REALISTIC_BASELINE    - 1 year with full dynamics
 *   REALISTIC_DISRUPTION  - 5 years with GPT-5 + psychology
 *   DEATH_SPIRAL          - 3 years stress test
 *   REALISTIC_APOCALYPSE  - 5 years of maximum chaos
 */

import { runEnhancedScenario, ENHANCED_SCENARIOS, type EnhancedResult } from '../core/simulation';

async function main() {
  const scenarioName = (process.argv[2] || 'REALISTIC_BASELINE').toUpperCase() as keyof typeof ENHANCED_SCENARIOS;
  
  if (!ENHANCED_SCENARIOS[scenarioName]) {
    console.error(`❌ Unknown scenario: ${scenarioName}`);
    console.error(`\nAvailable enhanced scenarios:`);
    for (const [name, scenario] of Object.entries(ENHANCED_SCENARIOS)) {
      console.error(`  ${name.padEnd(25)} - ${scenario.description}`);
    }
    process.exit(1);
  }
  
  console.log(`\n🎬 Starting enhanced simulation: ${scenarioName}\n`);
  
  const result = await runEnhancedScenario(scenarioName);
  
  // Detailed analysis
  printDetailedAnalysis(result);
  
  process.exit(result.analysis.systemSurvived ? 0 : 1);
}

function printDetailedAnalysis(result: EnhancedResult): void {
  console.log(`\n${'━'.repeat(60)}`);
  console.log(`📊 DETAILED ANALYSIS`);
  console.log(`${'━'.repeat(60)}\n`);
  
  // Survival timeline
  console.log(`📈 Survival Rate Over Time:`);
  const checkpoints = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const idx = Math.floor(pct * (result.metricsHistory.length - 1));
    const m = result.metricsHistory[idx];
    const bar = '█'.repeat(Math.floor(m.scriptSurvivalRate * 20));
    return `  Day ${m.simulatedDay.toString().padStart(4)}: ${(m.scriptSurvivalRate * 100).toFixed(1).padStart(5)}% ${bar}`;
  });
  console.log(checkpoints.join('\n'));
  
  // Mood timeline
  console.log(`\n🧠 Average Mood Over Time:`);
  const moodCheckpoints = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const idx = Math.floor(pct * (result.metricsHistory.length - 1));
    const m = result.metricsHistory[idx];
    const moodBar = m.averageMood >= 0 
      ? '▓'.repeat(Math.floor(m.averageMood * 10)) 
      : '░'.repeat(Math.floor(Math.abs(m.averageMood) * 10));
    const prefix = m.averageMood >= 0 ? '+' : '';
    return `  Day ${m.simulatedDay.toString().padStart(4)}: ${prefix}${m.averageMood.toFixed(2).padStart(5)} ${moodBar}`;
  });
  console.log(moodCheckpoints.join('\n'));
  
  // Market cycles
  console.log(`\n📉 Market Cycle Phases:`);
  let lastPhase = '';
  const phaseChanges: string[] = [];
  for (const m of result.metricsHistory) {
    if (m.cyclePhase !== lastPhase) {
      phaseChanges.push(`  Day ${m.simulatedDay.toString().padStart(4)}: ${m.cyclePhase}`);
      lastPhase = m.cyclePhase;
    }
  }
  console.log(phaseChanges.slice(0, 10).join('\n'));
  if (phaseChanges.length > 10) {
    console.log(`  ... and ${phaseChanges.length - 10} more phase changes`);
  }
  
  // Death spiral analysis
  if (result.analysis.deathSpiralOccurred) {
    console.log(`\n⚠️  DEATH SPIRAL ANALYSIS:`);
    console.log(`   Triggered at: Day ${result.analysis.deathSpiralDay}`);
    
    // Find the spiral metrics
    const spiralIdx = result.metricsHistory.findIndex(m => m.simulatedDay === result.analysis.deathSpiralDay);
    if (spiralIdx >= 0) {
      const spiralMetrics = result.metricsHistory[spiralIdx];
      console.log(`   Market Phase: ${spiralMetrics.cyclePhase}`);
      console.log(`   Mood: ${spiralMetrics.averageMood.toFixed(2)}`);
      console.log(`   Stress: ${spiralMetrics.averageStress.toFixed(2)}`);
      console.log(`   Unemployment: ${(spiralMetrics.unemploymentRate * 100).toFixed(1)}%`);
    }
    
    if (result.analysis.recoveredFromSpiral) {
      console.log(`   ✅ RECOVERED in ${result.analysis.recoveryTime} days`);
    } else {
      console.log(`   ❌ DID NOT RECOVER`);
    }
  }
  
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
  
  // Inequality analysis
  console.log(`\n📊 Inequality (Gini) Over Time:`);
  const giniCheckpoints = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const idx = Math.floor(pct * (result.metricsHistory.length - 1));
    const m = result.metricsHistory[idx];
    const bar = '█'.repeat(Math.floor(m.giniCoefficient * 20));
    return `  Day ${m.simulatedDay.toString().padStart(4)}: ${m.giniCoefficient.toFixed(3)} ${bar}`;
  });
  console.log(giniCheckpoints.join('\n'));
  
  // Final verdict
  console.log(`\n${'━'.repeat(60)}`);
  console.log(`🏁 FINAL VERDICT`);
  console.log(`${'━'.repeat(60)}`);
  
  if (result.analysis.systemSurvived) {
    console.log(`\n✅ SYSTEM SURVIVED`);
    
    if (result.analysis.deathSpiralOccurred && result.analysis.recoveredFromSpiral) {
      console.log(`   💪 Recovered from death spiral!`);
    }
    
    if (result.analysis.worstDefaultRate > 0.3) {
      console.log(`   ⚠️  High default rate: ${(result.analysis.worstDefaultRate * 100).toFixed(0)}%`);
    }
    
    if (result.finalMetrics.giniCoefficient > 0.5) {
      console.log(`   ⚠️  High inequality: Gini ${result.finalMetrics.giniCoefficient.toFixed(2)}`);
    }
    
    if (result.finalMetrics.averageBurnout > 0.5) {
      console.log(`   ⚠️  High burnout: ${(result.finalMetrics.averageBurnout * 100).toFixed(0)}%`);
    }
    
  } else {
    console.log(`\n❌ SYSTEM COLLAPSED`);
    console.log(`   Final active scripts: ${result.finalMetrics.activeScripts}`);
    console.log(`   Worst default rate: ${(result.analysis.worstDefaultRate * 100).toFixed(0)}%`);
    console.log(`   Worst mood: ${result.analysis.worstMood.toFixed(2)}`);
  }
  
  // Key insights
  console.log(`\n💡 KEY INSIGHTS:`);
  
  if (result.analysis.totalPivots > result.analysis.totalDefaults) {
    console.log(`   ✅ More pivots than defaults - agents adapted well`);
  } else if (result.analysis.totalDefaults > 0) {
    console.log(`   ⚠️  More defaults than pivots - adaptation was difficult`);
  }
  
  if (result.analysis.peakStress > 0.7) {
    console.log(`   ⚠️  Peak stress was very high (${(result.analysis.peakStress * 100).toFixed(0)}%)`);
  }
  
  if (result.analysis.marketCyclesCompleted >= 2) {
    console.log(`   📈 Survived ${result.analysis.marketCyclesCompleted} complete market cycles`);
  }
  
  console.log(`\n${'━'.repeat(60)}\n`);
}

main().catch(console.error);
