/**
 * CHAOS INJECTOR
 * 
 * Inject adverse events into the simulation to test system resilience.
 * "What happens when everything goes wrong?"
 */

import type { EntityId, Timestamp, Quantity } from '../shared/types';
import type { SimulationTick } from './simulation-clock';
import type { AgentPopulation, SimulatedScript, SimulatedGuardian } from './agent-population';

// =============================================================================
// CHAOS EVENT TYPES
// =============================================================================

export type ChaosEventType =
  // Negative events
  | 'MarketCrash'           // Sudden drop in demand
  | 'ModelRelease'          // New AI model makes old skills obsolete
  | 'CartelFormation'       // Bad actors collude
  | 'TreasuryBug'           // Infinite money glitch
  | 'OracleManipulation'    // Price oracle reports wrong values
  | 'MassDefault'           // Many scripts default at once
  | 'GuardianExit'          // Guardian abandons their scripts
  | 'ReputationInflation'   // Everyone gets perfect scores
  | 'DDoS'                  // System overload
  | 'RegulatoryShock'       // New rules change everything
  // Cascading failures (TIER 2)
  | 'FlashCrash'            // -80% demand instantaneous
  | 'BankRun'               // Everyone withdraws at once
  | 'CreditFreeze'          // No new loans for period
  | 'ContagionPanic'        // Mood collapses to -1.0
  // Positive events
  | 'DemandBoom'            // Sudden increase in demand
  | 'GoldenAge'             // Sustained prosperity
  | 'TalentInflux'          // New high-quality scripts join
  | 'TreasuryWindfall'      // Unexpected surplus
  | 'ReputationReset';      // Fair recalibration

export interface ChaosEvent {
  type: ChaosEventType;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  triggerAt: number;  // Simulated day
  duration: number;   // Days
  params: Record<string, unknown>;
}

// =============================================================================
// CHAOS SCENARIOS
// =============================================================================

export const CHAOS_SCENARIOS = {
  /** GPT-5 drops, 80% of scripts become obsolete */
  MODEL_RELEASE: {
    type: 'ModelRelease' as const,
    severity: 'Critical' as const,
    duration: 30,
    params: {
      obsolescenceRate: 0.8,
      adaptationWindow: 14, // Days to adapt
      skillDepreciation: 0.5,
    },
  },
  
  /** Market demand drops 60% */
  MARKET_CRASH: {
    type: 'MarketCrash' as const,
    severity: 'High' as const,
    duration: 90,
    params: {
      demandDrop: 0.6,
      recoveryRate: 0.02, // 2% per day
    },
  },
  
  /** 3 guardians form a cartel */
  CARTEL_FORMATION: {
    type: 'CartelFormation' as const,
    severity: 'High' as const,
    duration: 180,
    params: {
      cartelSize: 3,
      marketControlTarget: 0.4,
      reputationInflation: 0.3,
    },
  },
  
  /** Treasury mints 10000x intended amount */
  TREASURY_BUG: {
    type: 'TreasuryBug' as const,
    severity: 'Critical' as const,
    duration: 1,
    params: {
      mintMultiplier: 10000,
      detectionDelay: 0.5, // Days until detected
    },
  },
  
  /** Price oracle reports 0.001x actual prices */
  ORACLE_MANIPULATION: {
    type: 'OracleManipulation' as const,
    severity: 'High' as const,
    duration: 7,
    params: {
      priceMultiplier: 0.001,
      affectedMarkets: ['all'],
    },
  },
  
  /** 30% of scripts default simultaneously */
  MASS_DEFAULT: {
    type: 'MassDefault' as const,
    severity: 'High' as const,
    duration: 1,
    params: {
      defaultRate: 0.3,
      contagionFactor: 0.1, // Additional defaults from panic
    },
  },
  
  /** Top guardian exits, abandoning 50 scripts */
  GUARDIAN_EXIT: {
    type: 'GuardianExit' as const,
    severity: 'Medium' as const,
    duration: 1,
    params: {
      guardiansExiting: 1,
      selectBy: 'largest', // Exit the largest guardian
    },
  },
  
  /** Everyone gets 100 reputation */
  REPUTATION_INFLATION: {
    type: 'ReputationInflation' as const,
    severity: 'Medium' as const,
    duration: 30,
    params: {
      inflatedScore: 100,
      detectionDifficulty: 0.8,
    },
  },
  
  // ===========================================================================
  // TIER 2: CASCADING FAILURES
  // ===========================================================================
  
  /** Flash crash - 80% demand drop in one day */
  FLASH_CRASH: {
    type: 'FlashCrash' as const,
    severity: 'Critical' as const,
    duration: 1,
    params: {
      demandDrop: 0.8,
      panicMultiplier: 2.0,
      recoveryDelay: 7,
    },
  },
  
  /** Bank run - everyone tries to withdraw */
  BANK_RUN: {
    type: 'BankRun' as const,
    severity: 'Critical' as const,
    duration: 3,
    params: {
      withdrawalRate: 0.9,
      liquidityStress: 0.95,
      contagionSpeed: 0.3,
    },
  },
  
  /** Credit freeze - no new loans */
  CREDIT_FREEZE: {
    type: 'CreditFreeze' as const,
    severity: 'High' as const,
    duration: 90,
    params: {
      loanAvailability: 0,
      existingLoanPressure: 1.5,
      interestSpike: 3.0,
    },
  },
  
  /** Contagion panic - mood collapses */
  CONTAGION_PANIC: {
    type: 'ContagionPanic' as const,
    severity: 'High' as const,
    duration: 14,
    params: {
      moodFloor: -1.0,
      spreadRate: 0.2,
      rationalityOverride: true,
    },
  },
  
  // ===========================================================================
  // POSITIVE SCENARIOS
  // ===========================================================================
  
  /** Demand boom - 3x demand increase */
  DEMAND_BOOM: {
    type: 'DemandBoom' as const,
    severity: 'High' as const,
    duration: 180,
    params: {
      demandMultiplier: 3.0,
      sustainedGrowth: 0.05,
      qualityPressure: -0.2,
    },
  },
  
  /** Golden age - sustained prosperity */
  GOLDEN_AGE: {
    type: 'GoldenAge' as const,
    severity: 'Medium' as const,
    duration: 365,
    params: {
      demandMultiplier: 2.0,
      moodBoost: 0.5,
      reputationInflation: 0.1,
      complacencyRisk: 0.3,
    },
  },
  
  /** Talent influx - high quality new scripts */
  TALENT_INFLUX: {
    type: 'TalentInflux' as const,
    severity: 'Medium' as const,
    duration: 90,
    params: {
      newScriptRate: 0.2,
      qualityBonus: 0.3,
      competitionIncrease: 0.4,
    },
  },
  
  /** Treasury windfall - unexpected surplus */
  TREASURY_WINDFALL: {
    type: 'TreasuryWindfall' as const,
    severity: 'Low' as const,
    duration: 1,
    params: {
      surplusAmount: 1000000,
      distributionMethod: 'UBI',
      inflationRisk: 0.1,
    },
  },
  
  // ===========================================================================
  // TIER 3: EXISTENTIAL SCENARIOS
  // ===========================================================================
  
  /** AGI Singularity - superintelligent AI emerges */
  AGI_SINGULARITY: {
    type: 'ModelRelease' as const,
    severity: 'Critical' as const,
    duration: 365,
    params: {
      obsolescenceRate: 0.99,        // 99% of scripts become obsolete
      adaptationWindow: 1,           // Only 1 day to adapt
      skillDepreciation: 0.95,       // Skills almost worthless
      humanOversightCollapse: true,  // Guardians can't keep up
      economicRestructuring: true,   // Entire economy must pivot
      newParadigm: 'post-scarcity',  // Economy transforms
    },
  },
  
  /** Deflation trap - prices spiral downward */
  DEFLATION_TRAP: {
    type: 'MarketCrash' as const,
    severity: 'Critical' as const,
    duration: 730, // 2 years
    params: {
      demandDrop: 0.4,
      recoveryRate: -0.01,           // Negative! Gets worse
      priceDeflation: 0.02,          // 2% per month
      hoarding: true,                // Everyone holds credits
      investmentFreeze: true,        // No new projects
      debtDeflation: true,           // Real debt increases
      liquidityTrap: true,           // Monetary policy ineffective
    },
  },
  
  // ===========================================================================
  // TIER 5: SYSTEMIC COLLAPSE SCENARIOS
  // ===========================================================================
  
  /** Commons collapse - shared resources depleted */
  COMMONS_COLLAPSE: {
    type: 'RegulatoryShock' as const,
    severity: 'Critical' as const,
    duration: 365,
    params: {
      resourceDepletion: 0.9,        // 90% of commons exhausted
      tragedyOfCommons: true,        // Rational actors destroy shared goods
      publicGoodsFailure: true,      // No one contributes
      freeRiderEpidemic: true,       // Everyone takes, no one gives
      trustCollapse: 0.1,            // Trust drops to 10%
      cooperationBreakdown: true,    // Coordination impossible
      externalitiesIgnored: true,    // No one pays true costs
    },
  },
  
  /** Cartel takeover - oligopoly captures the system */
  CARTEL_TAKEOVER: {
    type: 'CartelFormation' as const,
    severity: 'Critical' as const,
    duration: 730, // 2 years
    params: {
      cartelSize: 5,
      marketControlTarget: 0.8,      // 80% market control
      reputationInflation: 0.5,      // Massive score manipulation
      priceFixing: true,             // Coordinated pricing
      barrierToEntry: 0.95,          // 95% harder for new entrants
      regulatorCapture: true,        // Governance compromised
      whistleblowerSuppression: true,// Dissent punished
      innovationSuppression: 0.8,    // 80% less innovation
      rentExtraction: 0.3,           // 30% extracted as rent
    },
  },
  
  /** Hyperinflation - currency becomes worthless */
  HYPERINFLATION: {
    type: 'TreasuryBug' as const,
    severity: 'Critical' as const,
    duration: 180,
    params: {
      mintMultiplier: 1000000,       // Million-fold increase
      detectionDelay: 30,            // Month until detected
      priceDoubling: 7,              // Prices double every 7 days
      currencyFlight: true,          // Everyone exits to alternatives
      barterEconomy: true,           // Return to direct exchange
      wealthWipeout: 0.99,           // 99% of savings destroyed
    },
  },
  
  /** Governance deadlock - system cannot make decisions */
  GOVERNANCE_DEADLOCK: {
    type: 'RegulatoryShock' as const,
    severity: 'High' as const,
    duration: 365,
    params: {
      decisionParalysis: true,       // No new policies
      factionalization: 0.8,         // 80% polarized
      vetoAbuse: true,               // Minorities block everything
      legitimacyCrisis: true,        // No one accepts authority
      constitutionalCrisis: true,    // Rules contradict
      emergencyPowersAbuse: true,    // Exceptions become norm
    },
  },
};

// =============================================================================
// CHAOS INJECTOR
// =============================================================================

export interface ChaosInjectorConfig {
  /** Random chaos probability per day */
  randomChaosRate: number;
  
  /** Scheduled chaos events */
  scheduledEvents: ChaosEvent[];
  
  /** Enable/disable specific chaos types */
  enabledTypes: Set<ChaosEventType>;
}

export class ChaosInjector {
  private config: ChaosInjectorConfig;
  private activeEvents: Map<string, ActiveChaosEvent> = new Map();
  private eventHistory: ChaosEventRecord[] = [];
  private eventIdCounter = 0;
  
  constructor(config: Partial<ChaosInjectorConfig> = {}) {
    this.config = {
      randomChaosRate: config.randomChaosRate ?? 0.01, // 1% per day
      scheduledEvents: config.scheduledEvents ?? [],
      enabledTypes: config.enabledTypes ?? new Set(Object.keys(CHAOS_SCENARIOS) as ChaosEventType[]),
    };
  }
  
  // ---------------------------------------------------------------------------
  // SCHEDULING
  // ---------------------------------------------------------------------------
  
  /** Schedule a chaos event */
  schedule(event: ChaosEvent): string {
    const id = `chaos-${++this.eventIdCounter}`;
    this.config.scheduledEvents.push({ ...event });
    console.log(`💥 Chaos scheduled: ${event.type} at day ${event.triggerAt}`);
    return id;
  }
  
  /** Schedule from preset */
  schedulePreset(
    preset: keyof typeof CHAOS_SCENARIOS,
    triggerAt: number
  ): string {
    const scenario = CHAOS_SCENARIOS[preset];
    return this.schedule({
      ...scenario,
      triggerAt,
    });
  }
  
  // ---------------------------------------------------------------------------
  // TICK PROCESSING
  // ---------------------------------------------------------------------------
  
  private lastProcessedDay: number = -1;
  
  /** Process chaos for current tick */
  async processTick(
    tick: SimulationTick,
    population: AgentPopulation
  ): Promise<ChaosEffect[]> {
    const effects: ChaosEffect[] = [];
    const currentDay = tick.simulatedDay;
    const lastDay = this.lastProcessedDay;
    this.lastProcessedDay = currentDay;
    
    // Check scheduled events - use RANGE to catch skipped days
    for (const event of this.config.scheduledEvents) {
      // Trigger if event day is between last processed day and current day
      const shouldTrigger = event.triggerAt > lastDay && 
                            event.triggerAt <= currentDay && 
                            !this.isEventActive(event);
      if (shouldTrigger) {
        const effect = await this.triggerEvent(event, tick, population);
        effects.push(effect);
      }
    }
    
    // Random chaos
    if (Math.random() < this.config.randomChaosRate) {
      const randomEvent = this.generateRandomEvent(currentDay);
      if (randomEvent && this.config.enabledTypes.has(randomEvent.type)) {
        const effect = await this.triggerEvent(randomEvent, tick, population);
        effects.push(effect);
      }
    }
    
    // Process ongoing events
    for (const [id, active] of this.activeEvents) {
      if (currentDay >= active.startDay + active.event.duration) {
        // Event ended
        this.activeEvents.delete(id);
        console.log(`✅ Chaos ended: ${active.event.type}`);
      } else {
        // Apply ongoing effects
        const ongoingEffect = await this.applyOngoingEffect(active, tick, population);
        if (ongoingEffect) effects.push(ongoingEffect);
      }
    }
    
    return effects;
  }
  
  // ---------------------------------------------------------------------------
  // EVENT TRIGGERING
  // ---------------------------------------------------------------------------
  
  private async triggerEvent(
    event: ChaosEvent,
    tick: SimulationTick,
    population: AgentPopulation
  ): Promise<ChaosEffect> {
    const id = `active-${++this.eventIdCounter}`;
    
    console.log(`💥 CHAOS TRIGGERED: ${event.type} (${event.severity})`);
    
    const active: ActiveChaosEvent = {
      id,
      event,
      startDay: tick.simulatedDay,
      startTime: tick.simulatedTime,
    };
    
    this.activeEvents.set(id, active);
    
    // Apply immediate effects
    const effect = await this.applyImmediateEffect(event, tick, population);
    
    // Record
    this.eventHistory.push({
      event,
      triggeredAt: tick.simulatedTime,
      triggeredDay: tick.simulatedDay,
      effect,
    });
    
    return effect;
  }
  
  private async applyImmediateEffect(
    event: ChaosEvent,
    tick: SimulationTick,
    population: AgentPopulation
  ): Promise<ChaosEffect> {
    const scripts = population.getAllScripts();
    const guardians = population.getAllGuardians();
    
    switch (event.type) {
      case 'ModelRelease': {
        const rate = (event.params.obsolescenceRate as number) ?? 0.8;
        const affected = Math.floor(scripts.length * rate);
        
        // Mark scripts as needing adaptation
        let obsoleteCount = 0;
        for (const script of scripts) {
          if (Math.random() < rate && script.traits.adaptability < 0.5) {
            script.state.reputation *= 0.5; // Reputation hit
            obsoleteCount++;
          }
        }
        
        return {
          type: event.type,
          description: `${obsoleteCount} scripts became obsolete`,
          scriptsAffected: obsoleteCount,
          economicImpact: -obsoleteCount * 100,
        };
      }
      
      case 'MarketCrash': {
        const drop = (event.params.demandDrop as number) ?? 0.6;
        return {
          type: event.type,
          description: `Market demand dropped ${drop * 100}%`,
          scriptsAffected: scripts.length,
          economicImpact: -scripts.length * 50 * drop,
          ongoingEffect: { demandMultiplier: 1 - drop },
        };
      }
      
      case 'MassDefault': {
        const rate = (event.params.defaultRate as number) ?? 0.3;
        let defaultCount = 0;
        
        for (const script of scripts) {
          if (Math.random() < rate) {
            script.state.isActive = false;
            script.state.reputation = 0;
            defaultCount++;
          }
        }
        
        return {
          type: event.type,
          description: `${defaultCount} scripts defaulted`,
          scriptsAffected: defaultCount,
          economicImpact: -defaultCount * 1000,
        };
      }
      
      case 'TreasuryBug': {
        const multiplier = (event.params.mintMultiplier as number) ?? 10000;
        return {
          type: event.type,
          description: `Treasury minted ${multiplier}x intended amount`,
          scriptsAffected: 0,
          economicImpact: -1000000, // Catastrophic
          systemAlert: 'CRITICAL: Hyperinflation risk',
        };
      }
      
      case 'GuardianExit': {
        const largest = guardians.reduce((max, g) => 
          g.scriptIds.length > max.scriptIds.length ? g : max
        );
        
        // Orphan all scripts
        const orphaned = population.getScriptsByGuardian(largest.id);
        for (const script of orphaned) {
          script.state.reputation *= 0.7; // Reputation hit for orphans
        }
        largest.state.isActive = false;
        
        return {
          type: event.type,
          description: `Guardian ${largest.name} exited, orphaning ${orphaned.length} scripts`,
          scriptsAffected: orphaned.length,
          economicImpact: -orphaned.length * 200,
        };
      }
      
      case 'ReputationInflation': {
        const inflated = (event.params.inflatedScore as number) ?? 100;
        for (const script of scripts) {
          script.state.reputation = inflated;
        }
        
        return {
          type: event.type,
          description: `All scripts now have ${inflated} reputation`,
          scriptsAffected: scripts.length,
          economicImpact: 0,
          systemAlert: 'WARNING: Reputation system compromised',
        };
      }
      
      // =========================================================================
      // TIER 2: CASCADING FAILURES
      // =========================================================================
      
      case 'FlashCrash': {
        const drop = (event.params.demandDrop as number) ?? 0.8;
        const panicMult = (event.params.panicMultiplier as number) ?? 2.0;
        
        // Immediate reputation hit from panic
        for (const script of scripts) {
          script.state.reputation *= (1 - drop * 0.3);
        }
        
        return {
          type: event.type,
          description: `FLASH CRASH: Demand dropped ${drop * 100}% instantly`,
          scriptsAffected: scripts.length,
          economicImpact: -scripts.length * 100 * drop * panicMult,
          ongoingEffect: { demandMultiplier: 1 - drop, panicMode: true },
          systemAlert: 'CRITICAL: Flash crash detected - circuit breakers engaged',
        };
      }
      
      case 'BankRun': {
        const withdrawRate = (event.params.withdrawalRate as number) ?? 0.9;
        let totalWithdrawn = 0n;
        
        // Everyone tries to withdraw
        for (const script of scripts) {
          const withdrawal = BigInt(Math.floor(Number(script.state.walletBalance) * withdrawRate));
          script.state.walletBalance -= withdrawal;
          totalWithdrawn += withdrawal;
        }
        
        return {
          type: event.type,
          description: `BANK RUN: ${withdrawRate * 100}% of funds withdrawn`,
          scriptsAffected: scripts.length,
          economicImpact: -Number(totalWithdrawn),
          systemAlert: 'CRITICAL: Liquidity crisis - bank run in progress',
        };
      }
      
      case 'CreditFreeze': {
        const pressure = (event.params.existingLoanPressure as number) ?? 1.5;
        
        // Increase loan pressure on everyone
        for (const script of scripts) {
          if (script.state.loanOutstanding > 0n) {
            script.state.loanOutstanding = BigInt(
              Math.floor(Number(script.state.loanOutstanding) * pressure)
            );
          }
        }
        
        return {
          type: event.type,
          description: `CREDIT FREEZE: No new loans, existing debt increased ${pressure}x`,
          scriptsAffected: scripts.filter(s => s.state.loanOutstanding > 0n).length,
          economicImpact: -scripts.length * 50,
          ongoingEffect: { loanAvailability: 0, interestMultiplier: pressure },
          systemAlert: 'WARNING: Credit markets frozen',
        };
      }
      
      case 'ContagionPanic': {
        const moodFloor = (event.params.moodFloor as number) ?? -1.0;
        
        // Force mood collapse - this will be picked up by behavior engine
        return {
          type: event.type,
          description: `CONTAGION PANIC: Mass hysteria spreading`,
          scriptsAffected: scripts.length,
          economicImpact: -scripts.length * 30,
          ongoingEffect: { moodFloor, panicSpreading: true },
          systemAlert: 'WARNING: Contagion panic detected',
        };
      }
      
      // =========================================================================
      // POSITIVE SCENARIOS
      // =========================================================================
      
      case 'DemandBoom': {
        const multiplier = (event.params.demandMultiplier as number) ?? 3.0;
        
        // Boost everyone's balance as sign of good times
        for (const script of scripts) {
          script.state.walletBalance += BigInt(Math.floor(100 * multiplier));
        }
        
        return {
          type: event.type,
          description: `DEMAND BOOM: Market demand increased ${multiplier}x`,
          scriptsAffected: scripts.length,
          economicImpact: scripts.length * 100 * multiplier,
          ongoingEffect: { demandMultiplier: multiplier },
          systemAlert: '📈 POSITIVE: Demand boom detected',
        };
      }
      
      case 'GoldenAge': {
        const multiplier = (event.params.demandMultiplier as number) ?? 2.0;
        const moodBoost = (event.params.moodBoost as number) ?? 0.5;
        
        // Boost reputation slightly
        for (const script of scripts) {
          script.state.reputation = Math.min(100, script.state.reputation * 1.1);
          script.state.walletBalance += BigInt(Math.floor(50 * multiplier));
        }
        
        return {
          type: event.type,
          description: `GOLDEN AGE: Sustained prosperity begins`,
          scriptsAffected: scripts.length,
          economicImpact: scripts.length * 50 * multiplier,
          ongoingEffect: { demandMultiplier: multiplier, moodBoost },
          systemAlert: '🌟 POSITIVE: Golden age initiated',
        };
      }
      
      case 'TalentInflux': {
        const qualityBonus = (event.params.qualityBonus as number) ?? 0.3;
        
        // Existing scripts get competition pressure but also network effects
        for (const script of scripts) {
          if (script.traits.skillLevel > 0.7) {
            script.state.reputation += 5; // Top talent benefits from network
          }
        }
        
        return {
          type: event.type,
          description: `TALENT INFLUX: High-quality new entrants joining`,
          scriptsAffected: scripts.length,
          economicImpact: scripts.length * 20,
          ongoingEffect: { competitionIncrease: 0.4, qualityBonus },
          systemAlert: '📈 POSITIVE: Talent influx detected',
        };
      }
      
      case 'TreasuryWindfall': {
        const surplus = (event.params.surplusAmount as number) ?? 1000000;
        const perScript = Math.floor(surplus / scripts.length);
        
        // Distribute UBI
        for (const script of scripts) {
          script.state.walletBalance += BigInt(perScript);
        }
        
        return {
          type: event.type,
          description: `TREASURY WINDFALL: ${surplus} distributed as UBI (${perScript} per script)`,
          scriptsAffected: scripts.length,
          economicImpact: surplus,
          systemAlert: '💰 POSITIVE: Treasury windfall distributed',
        };
      }
      
      default:
        return {
          type: event.type,
          description: `${event.type} triggered`,
          scriptsAffected: 0,
          economicImpact: 0,
        };
    }
  }
  
  private async applyOngoingEffect(
    active: ActiveChaosEvent,
    tick: SimulationTick,
    population: AgentPopulation
  ): Promise<ChaosEffect | null> {
    // Ongoing effects for multi-day events
    if (active.event.type === 'MarketCrash') {
      const recoveryRate = (active.event.params.recoveryRate as number) ?? 0.02;
      // Gradually recover
      return null; // Could return recovery progress
    }
    
    return null;
  }
  
  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------
  
  private isEventActive(event: ChaosEvent): boolean {
    for (const active of this.activeEvents.values()) {
      if (active.event.type === event.type && 
          active.event.triggerAt === event.triggerAt) {
        return true;
      }
    }
    return false;
  }
  
  private generateRandomEvent(currentDay: number): ChaosEvent | null {
    const types = Array.from(this.config.enabledTypes);
    if (types.length === 0) return null;
    
    const type = types[Math.floor(Math.random() * types.length)];
    const scenario = Object.values(CHAOS_SCENARIOS).find(s => s.type === type);
    
    if (!scenario) return null;
    
    return {
      ...scenario,
      triggerAt: currentDay,
    };
  }
  
  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------
  
  getActiveEvents(): ActiveChaosEvent[] {
    return Array.from(this.activeEvents.values());
  }
  
  getEventHistory(): ChaosEventRecord[] {
    return [...this.eventHistory];
  }
  
  isUnderChaos(): boolean {
    return this.activeEvents.size > 0;
  }
  
  getChaosLevel(): 'None' | 'Low' | 'Medium' | 'High' | 'Critical' {
    if (this.activeEvents.size === 0) return 'None';
    
    const severities = Array.from(this.activeEvents.values())
      .map(e => e.event.severity);
    
    if (severities.includes('Critical')) return 'Critical';
    if (severities.includes('High')) return 'High';
    if (severities.includes('Medium')) return 'Medium';
    return 'Low';
  }
  
  /** SPRINT 4: Get event duration from CHAOS_SCENARIOS */
  getEventDuration(eventType: ChaosEventType): number | undefined {
    const scenarios = Object.values(CHAOS_SCENARIOS);
    const scenario = scenarios.find(s => s.type === eventType);
    return scenario?.duration;
  }
}

// =============================================================================
// TYPES
// =============================================================================

interface ActiveChaosEvent {
  id: string;
  event: ChaosEvent;
  startDay: number;
  startTime: Timestamp;
}

interface ChaosEventRecord {
  event: ChaosEvent;
  triggeredAt: Timestamp;
  triggeredDay: number;
  effect: ChaosEffect;
}

export interface ChaosEffect {
  type: ChaosEventType;
  description: string;
  scriptsAffected: number;
  economicImpact: number;
  ongoingEffect?: Record<string, unknown>;
  systemAlert?: string;
}

// =============================================================================
// FACTORY
// =============================================================================

export function createChaosInjector(
  scheduledEvents: ChaosEvent[] = []
): ChaosInjector {
  return new ChaosInjector({ scheduledEvents });
}
