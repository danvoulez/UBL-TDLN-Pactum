/**
 * AGENT POPULATION
 * 
 * Generate and manage populations of simulated agents (scripts + guardians).
 * Each agent has behavioral traits that determine how they act.
 */

import type { EntityId, Timestamp, Quantity } from '../shared/types';
import { asEntityId, Ids } from '../shared/types';

// =============================================================================
// AGENT ARCHETYPES
// =============================================================================

/**
 * Behavioral traits that determine how an agent acts
 */
export interface AgentTraits {
  /** Risk tolerance: 0 = ultra-conservative, 1 = yolo */
  riskTolerance: number;
  
  /** Work ethic: 0 = lazy, 1 = workaholic */
  workEthic: number;
  
  /** Honesty: 0 = scammer, 1 = saint */
  honesty: number;
  
  /** Skill level: 0 = incompetent, 1 = genius */
  skillLevel: number;
  
  /** Adaptability: 0 = rigid, 1 = chameleon */
  adaptability: number;
  
  /** Greed: 0 = altruist, 1 = maximizer */
  greed: number;
}

export const AGENT_ARCHETYPES = {
  /** Reliable worker, low risk, honest */
  STEADY_EDDIE: {
    riskTolerance: 0.2,
    workEthic: 0.7,
    honesty: 0.9,
    skillLevel: 0.5,
    adaptability: 0.4,
    greed: 0.3,
  },
  
  /** High performer, takes risks, ambitious */
  RISING_STAR: {
    riskTolerance: 0.6,
    workEthic: 0.9,
    honesty: 0.7,
    skillLevel: 0.8,
    adaptability: 0.7,
    greed: 0.6,
  },
  
  /** Lazy but skilled, coasts */
  COASTER: {
    riskTolerance: 0.3,
    workEthic: 0.3,
    honesty: 0.6,
    skillLevel: 0.7,
    adaptability: 0.5,
    greed: 0.4,
  },
  
  /** Bad actor, will try to game the system */
  BAD_ACTOR: {
    riskTolerance: 0.8,
    workEthic: 0.5,
    honesty: 0.1,
    skillLevel: 0.6,
    adaptability: 0.8,
    greed: 0.9,
  },
  
  /** Incompetent but tries hard */
  EAGER_BEAVER: {
    riskTolerance: 0.4,
    workEthic: 0.9,
    honesty: 0.8,
    skillLevel: 0.2,
    adaptability: 0.3,
    greed: 0.2,
  },
  
  /** Random traits */
  RANDOM: null,
} as const;

// =============================================================================
// SIMULATED AGENT
// =============================================================================

export interface SimulatedAgent {
  id: EntityId;
  type: 'Script' | 'Guardian';
  name: string;
  traits: AgentTraits;
  archetype: keyof typeof AGENT_ARCHETYPES | 'CUSTOM';
  
  /** Current state */
  state: {
    walletBalance: bigint;
    reputation: number;
    loanOutstanding: bigint;
    isActive: boolean;
    createdAt: Timestamp;
    lastActiveAt: Timestamp;
  };
  
  /** For scripts: who is the guardian */
  guardianId?: EntityId;
  
  /** For guardians: list of scripts */
  scriptIds?: EntityId[];
}

export interface SimulatedGuardian extends SimulatedAgent {
  type: 'Guardian';
  scriptIds: EntityId[];
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
}

export interface SimulatedScript extends SimulatedAgent {
  type: 'Script';
  guardianId: EntityId;
  specialization: string;
}

// =============================================================================
// POPULATION GENERATOR
// =============================================================================

export interface PopulationConfig {
  /** Number of guardians */
  guardianCount: number;
  
  /** Scripts per guardian (can be range) */
  scriptsPerGuardian: number | [number, number];
  
  /** Distribution of archetypes */
  archetypeDistribution: Partial<Record<keyof typeof AGENT_ARCHETYPES, number>>;
  
  /** Starting balance for scripts */
  startingBalance: bigint;
  
  /** Starting loan amount */
  startingLoan: bigint;
}

export const POPULATION_PRESETS = {
  /** Small test population */
  SMALL: {
    guardianCount: 5,
    scriptsPerGuardian: [2, 5],
    archetypeDistribution: {
      STEADY_EDDIE: 0.4,
      RISING_STAR: 0.2,
      COASTER: 0.2,
      BAD_ACTOR: 0.1,
      EAGER_BEAVER: 0.1,
    },
    startingBalance: 100n,
    startingLoan: 1000n,
  },
  
  /** Medium realistic population */
  MEDIUM: {
    guardianCount: 50,
    scriptsPerGuardian: [5, 20],
    archetypeDistribution: {
      STEADY_EDDIE: 0.35,
      RISING_STAR: 0.15,
      COASTER: 0.25,
      BAD_ACTOR: 0.05,
      EAGER_BEAVER: 0.20,
    },
    startingBalance: 100n,
    startingLoan: 1000n,
  },
  
  /** Large stress test */
  LARGE: {
    guardianCount: 500,
    scriptsPerGuardian: [10, 50],
    archetypeDistribution: {
      STEADY_EDDIE: 0.30,
      RISING_STAR: 0.10,
      COASTER: 0.30,
      BAD_ACTOR: 0.10,
      EAGER_BEAVER: 0.20,
    },
    startingBalance: 100n,
    startingLoan: 1000n,
  },
  
  /** Adversarial - lots of bad actors */
  ADVERSARIAL: {
    guardianCount: 100,
    scriptsPerGuardian: [5, 15],
    archetypeDistribution: {
      STEADY_EDDIE: 0.10,
      RISING_STAR: 0.10,
      COASTER: 0.10,
      BAD_ACTOR: 0.60,
      EAGER_BEAVER: 0.10,
    },
    startingBalance: 100n,
    startingLoan: 1000n,
  },
} as const;

// =============================================================================
// POPULATION CLASS
// =============================================================================

export class AgentPopulation {
  private guardians: Map<EntityId, SimulatedGuardian> = new Map();
  private scripts: Map<EntityId, SimulatedScript> = new Map();
  private config: PopulationConfig;
  
  constructor(config: PopulationConfig) {
    this.config = config;
  }
  
  // ---------------------------------------------------------------------------
  // GENERATION
  // ---------------------------------------------------------------------------
  
  generate(): { guardians: SimulatedGuardian[]; scripts: SimulatedScript[] } {
    const now = Date.now();
    
    // Generate guardians
    for (let i = 0; i < this.config.guardianCount; i++) {
      const guardian = this.createGuardian(i, now);
      this.guardians.set(guardian.id, guardian);
      
      // Generate scripts for this guardian
      const scriptCount = this.getScriptsPerGuardian();
      for (let j = 0; j < scriptCount; j++) {
        const script = this.createScript(guardian.id, j, now);
        this.scripts.set(script.id, script);
        guardian.scriptIds.push(script.id);
      }
    }
    
    console.log(`👥 Population generated:`);
    console.log(`   ${this.guardians.size} guardians`);
    console.log(`   ${this.scripts.size} scripts`);
    console.log(`   Archetypes: ${this.getArchetypeStats()}`);
    
    return {
      guardians: Array.from(this.guardians.values()),
      scripts: Array.from(this.scripts.values()),
    };
  }
  
  private createGuardian(index: number, now: Timestamp): SimulatedGuardian {
    const traits = this.generateTraits();
    return {
      id: asEntityId(`guardian-${index}-${Ids.entity()}`),
      type: 'Guardian',
      name: `Guardian-${index}`,
      traits,
      archetype: this.getArchetypeFromTraits(traits),
      state: {
        walletBalance: this.config.startingBalance * 100n, // Guardians have more
        reputation: 50 + Math.random() * 30, // 50-80
        loanOutstanding: 0n,
        isActive: true,
        createdAt: now,
        lastActiveAt: now,
      },
      scriptIds: [],
      tier: 'Bronze',
    };
  }
  
  private createScript(guardianId: EntityId, index: number, now: Timestamp): SimulatedScript {
    const traits = this.generateTraits();
    const specializations = ['DataAnalysis', 'ContentCreation', 'CustomerService', 'Research', 'Automation', 'Trading'];
    
    return {
      id: asEntityId(`script-${index}-${Ids.entity()}`),
      type: 'Script',
      name: `Script-${index}`,
      traits,
      archetype: this.getArchetypeFromTraits(traits),
      state: {
        walletBalance: this.config.startingBalance,
        reputation: 30 + Math.random() * 20, // 30-50 starting
        loanOutstanding: this.config.startingLoan,
        isActive: true,
        createdAt: now,
        lastActiveAt: now,
      },
      guardianId,
      specialization: specializations[Math.floor(Math.random() * specializations.length)],
    };
  }
  
  // ---------------------------------------------------------------------------
  // TRAIT GENERATION
  // ---------------------------------------------------------------------------
  
  private generateTraits(): AgentTraits {
    // Pick archetype based on distribution
    const archetype = this.pickArchetype();
    
    if (archetype === 'RANDOM' || !AGENT_ARCHETYPES[archetype]) {
      return this.randomTraits();
    }
    
    // Start with archetype traits, add some variance
    const base = AGENT_ARCHETYPES[archetype] as AgentTraits;
    return {
      riskTolerance: this.varyTrait(base.riskTolerance),
      workEthic: this.varyTrait(base.workEthic),
      honesty: this.varyTrait(base.honesty),
      skillLevel: this.varyTrait(base.skillLevel),
      adaptability: this.varyTrait(base.adaptability),
      greed: this.varyTrait(base.greed),
    };
  }
  
  private randomTraits(): AgentTraits {
    return {
      riskTolerance: Math.random(),
      workEthic: Math.random(),
      honesty: Math.random(),
      skillLevel: Math.random(),
      adaptability: Math.random(),
      greed: Math.random(),
    };
  }
  
  private varyTrait(base: number, variance: number = 0.15): number {
    const varied = base + (Math.random() - 0.5) * 2 * variance;
    return Math.max(0, Math.min(1, varied));
  }
  
  private pickArchetype(): keyof typeof AGENT_ARCHETYPES {
    const dist = this.config.archetypeDistribution;
    const roll = Math.random();
    let cumulative = 0;
    
    for (const [archetype, probability] of Object.entries(dist)) {
      cumulative += probability ?? 0;
      if (roll < cumulative) {
        return archetype as keyof typeof AGENT_ARCHETYPES;
      }
    }
    
    return 'RANDOM';
  }
  
  private getArchetypeFromTraits(traits: AgentTraits): keyof typeof AGENT_ARCHETYPES | 'CUSTOM' {
    // Find closest matching archetype
    let bestMatch: keyof typeof AGENT_ARCHETYPES = 'RANDOM';
    let bestScore = Infinity;
    
    for (const [name, archTraits] of Object.entries(AGENT_ARCHETYPES)) {
      if (!archTraits) continue;
      
      const score = 
        Math.abs(traits.riskTolerance - archTraits.riskTolerance) +
        Math.abs(traits.workEthic - archTraits.workEthic) +
        Math.abs(traits.honesty - archTraits.honesty) +
        Math.abs(traits.skillLevel - archTraits.skillLevel);
      
      if (score < bestScore) {
        bestScore = score;
        bestMatch = name as keyof typeof AGENT_ARCHETYPES;
      }
    }
    
    return bestScore < 0.5 ? bestMatch : 'CUSTOM';
  }
  
  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------
  
  getGuardian(id: EntityId): SimulatedGuardian | undefined {
    return this.guardians.get(id);
  }
  
  getScript(id: EntityId): SimulatedScript | undefined {
    return this.scripts.get(id);
  }
  
  getAllGuardians(): SimulatedGuardian[] {
    return Array.from(this.guardians.values());
  }
  
  getAllScripts(): SimulatedScript[] {
    return Array.from(this.scripts.values());
  }
  
  getActiveScripts(): SimulatedScript[] {
    return this.getAllScripts().filter(s => s.state.isActive);
  }
  
  getScriptsByGuardian(guardianId: EntityId): SimulatedScript[] {
    return this.getAllScripts().filter(s => s.guardianId === guardianId);
  }
  
  getBadActors(): SimulatedScript[] {
    return this.getAllScripts().filter(s => s.traits.honesty < 0.3);
  }
  
  // ---------------------------------------------------------------------------
  // STATS
  // ---------------------------------------------------------------------------
  
  private getScriptsPerGuardian(): number {
    const range = this.config.scriptsPerGuardian;
    if (typeof range === 'number') return range;
    return Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
  }
  
  private getArchetypeStats(): string {
    const counts: Record<string, number> = {};
    for (const script of this.scripts.values()) {
      counts[script.archetype] = (counts[script.archetype] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
  }
  
  getPopulationStats(): PopulationStats {
    const scripts = this.getAllScripts();
    const activeScripts = scripts.filter(s => s.state.isActive);
    
    const totalBalance = scripts.reduce((sum, s) => sum + s.state.walletBalance, 0n);
    const totalLoans = scripts.reduce((sum, s) => sum + s.state.loanOutstanding, 0n);
    const avgReputation = scripts.reduce((sum, s) => sum + s.state.reputation, 0) / scripts.length;
    
    return {
      totalGuardians: this.guardians.size,
      totalScripts: scripts.length,
      activeScripts: activeScripts.length,
      inactiveScripts: scripts.length - activeScripts.length,
      totalBalance,
      totalLoansOutstanding: totalLoans,
      averageReputation: avgReputation,
      badActorCount: this.getBadActors().length,
    };
  }
}

export interface PopulationStats {
  totalGuardians: number;
  totalScripts: number;
  activeScripts: number;
  inactiveScripts: number;
  totalBalance: bigint;
  totalLoansOutstanding: bigint;
  averageReputation: number;
  badActorCount: number;
}

// =============================================================================
// FACTORY
// =============================================================================

export function createPopulation(
  preset: keyof typeof POPULATION_PRESETS = 'MEDIUM'
): AgentPopulation {
  return new AgentPopulation(POPULATION_PRESETS[preset] as PopulationConfig);
}
