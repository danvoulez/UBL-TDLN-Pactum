/**
 * GUARDIAN ACCOUNTABILITY
 * 
 * Tracks guardian performance and applies reputation consequences.
 * 
 * Rules:
 * - Script default: Guardian loses 5 reputation
 * - Script exit: Guardian loses 2 reputation
 * - Script survives crisis: Guardian gains 3 reputation
 * - Reputation < 30: Demotion to lower tier
 * - Reputation < 10: License revocation
 */

import type { EntityId, Timestamp } from '../shared/types';
import type { SimulatedGuardian, SimulatedScript } from './agent-population';

// =============================================================================
// ACCOUNTABILITY CONFIG
// =============================================================================

export interface AccountabilityConfig {
  // Penalties
  defaultPenalty: number;      // -5 per script default
  exitPenalty: number;         // -2 per script exit
  delinquencyPenalty: number;  // -1 per delinquent script
  
  // Bonuses
  crisisSurvivalBonus: number; // +3 per script surviving crisis
  excellenceBonus: number;     // +1 per high-performing script
  
  // Thresholds
  demotionThreshold: number;   // 30 = demote if below
  revocationThreshold: number; // 10 = revoke license if below
  promotionThreshold: number;  // 80 = promote if above
  
  // Tier requirements
  tierRequirements: {
    Bronze: number;
    Silver: number;
    Gold: number;
    Platinum: number;
  };
}

const DEFAULT_CONFIG: AccountabilityConfig = {
  defaultPenalty: -5,
  exitPenalty: -2,
  delinquencyPenalty: -1,
  crisisSurvivalBonus: 3,
  excellenceBonus: 1,
  demotionThreshold: 30,
  revocationThreshold: 10,
  promotionThreshold: 80,
  tierRequirements: {
    Bronze: 0,
    Silver: 40,
    Gold: 60,
    Platinum: 80,
  },
};

// =============================================================================
// ACCOUNTABILITY EVENTS
// =============================================================================

export type AccountabilityEventType = 
  | 'ScriptDefault'
  | 'ScriptExit'
  | 'ScriptDelinquent'
  | 'CrisisSurvival'
  | 'Excellence'
  | 'TierPromotion'
  | 'TierDemotion'
  | 'LicenseRevoked';

export interface AccountabilityEvent {
  type: AccountabilityEventType;
  guardianId: EntityId;
  scriptId?: EntityId;
  reputationChange: number;
  newReputation: number;
  timestamp: number;
  details?: string;
}

// =============================================================================
// GUARDIAN ACCOUNTABILITY TRACKER
// =============================================================================

export class GuardianAccountability {
  private config: AccountabilityConfig;
  private events: AccountabilityEvent[] = [];
  private revokedGuardians: Set<EntityId> = new Set();
  
  constructor(config: Partial<AccountabilityConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  // ---------------------------------------------------------------------------
  // EVENT PROCESSING
  // ---------------------------------------------------------------------------
  
  /**
   * Process a script default - guardian loses reputation
   */
  onScriptDefault(
    guardian: SimulatedGuardian,
    script: SimulatedScript,
    day: number
  ): AccountabilityEvent {
    const change = this.config.defaultPenalty;
    const newReputation = Math.max(0, guardian.state.reputation + change);
    
    guardian.state.reputation = newReputation;
    
    const event: AccountabilityEvent = {
      type: 'ScriptDefault',
      guardianId: guardian.id,
      scriptId: script.id,
      reputationChange: change,
      newReputation,
      timestamp: day,
      details: `Script ${script.name} defaulted`,
    };
    
    this.events.push(event);
    this.checkThresholds(guardian, day);
    
    return event;
  }
  
  /**
   * Process a script exit - guardian loses reputation
   */
  onScriptExit(
    guardian: SimulatedGuardian,
    script: SimulatedScript,
    day: number
  ): AccountabilityEvent {
    const change = this.config.exitPenalty;
    const newReputation = Math.max(0, guardian.state.reputation + change);
    
    guardian.state.reputation = newReputation;
    
    const event: AccountabilityEvent = {
      type: 'ScriptExit',
      guardianId: guardian.id,
      scriptId: script.id,
      reputationChange: change,
      newReputation,
      timestamp: day,
      details: `Script ${script.name} exited`,
    };
    
    this.events.push(event);
    this.checkThresholds(guardian, day);
    
    return event;
  }
  
  /**
   * Process crisis survival - guardian gains reputation
   */
  onCrisisSurvival(
    guardian: SimulatedGuardian,
    survivingScripts: SimulatedScript[],
    day: number
  ): AccountabilityEvent[] {
    const events: AccountabilityEvent[] = [];
    
    for (const script of survivingScripts) {
      const change = this.config.crisisSurvivalBonus;
      const newReputation = Math.min(100, guardian.state.reputation + change);
      
      guardian.state.reputation = newReputation;
      
      const event: AccountabilityEvent = {
        type: 'CrisisSurvival',
        guardianId: guardian.id,
        scriptId: script.id,
        reputationChange: change,
        newReputation,
        timestamp: day,
        details: `Script ${script.name} survived crisis`,
      };
      
      events.push(event);
      this.events.push(event);
    }
    
    this.checkThresholds(guardian, day);
    return events;
  }
  
  /**
   * Process excellence bonus for high-performing scripts
   */
  onExcellence(
    guardian: SimulatedGuardian,
    script: SimulatedScript,
    day: number
  ): AccountabilityEvent {
    const change = this.config.excellenceBonus;
    const newReputation = Math.min(100, guardian.state.reputation + change);
    
    guardian.state.reputation = newReputation;
    
    const event: AccountabilityEvent = {
      type: 'Excellence',
      guardianId: guardian.id,
      scriptId: script.id,
      reputationChange: change,
      newReputation,
      timestamp: day,
      details: `Script ${script.name} excelled`,
    };
    
    this.events.push(event);
    this.checkThresholds(guardian, day);
    
    return event;
  }
  
  // ---------------------------------------------------------------------------
  // THRESHOLD CHECKS
  // ---------------------------------------------------------------------------
  
  private checkThresholds(guardian: SimulatedGuardian, day: number): void {
    const rep = guardian.state.reputation;
    
    // Check for license revocation
    if (rep < this.config.revocationThreshold && !this.revokedGuardians.has(guardian.id)) {
      this.revokeGuardian(guardian, day);
      return;
    }
    
    // Check for demotion
    if (rep < this.config.demotionThreshold) {
      this.demoteGuardian(guardian, day);
      return;
    }
    
    // Check for promotion
    if (rep >= this.config.promotionThreshold) {
      this.promoteGuardian(guardian, day);
    }
  }
  
  private demoteGuardian(guardian: SimulatedGuardian, day: number): void {
    const currentTier = guardian.tier;
    let newTier: typeof guardian.tier = currentTier;
    
    // Demote one level
    if (currentTier === 'Platinum') newTier = 'Gold';
    else if (currentTier === 'Gold') newTier = 'Silver';
    else if (currentTier === 'Silver') newTier = 'Bronze';
    
    if (newTier !== currentTier) {
      guardian.tier = newTier;
      
      const event: AccountabilityEvent = {
        type: 'TierDemotion',
        guardianId: guardian.id,
        reputationChange: 0,
        newReputation: guardian.state.reputation,
        timestamp: day,
        details: `Demoted from ${currentTier} to ${newTier}`,
      };
      
      this.events.push(event);
      console.log(`⬇️ GUARDIAN DEMOTED: ${guardian.name} (${currentTier} → ${newTier})`);
    }
  }
  
  private promoteGuardian(guardian: SimulatedGuardian, day: number): void {
    const currentTier = guardian.tier;
    const rep = guardian.state.reputation;
    let newTier: typeof guardian.tier = currentTier;
    
    // Promote based on reputation
    if (rep >= this.config.tierRequirements.Platinum && currentTier !== 'Platinum') {
      newTier = 'Platinum';
    } else if (rep >= this.config.tierRequirements.Gold && currentTier === 'Silver') {
      newTier = 'Gold';
    } else if (rep >= this.config.tierRequirements.Silver && currentTier === 'Bronze') {
      newTier = 'Silver';
    }
    
    if (newTier !== currentTier) {
      guardian.tier = newTier;
      
      const event: AccountabilityEvent = {
        type: 'TierPromotion',
        guardianId: guardian.id,
        reputationChange: 0,
        newReputation: guardian.state.reputation,
        timestamp: day,
        details: `Promoted from ${currentTier} to ${newTier}`,
      };
      
      this.events.push(event);
      console.log(`⬆️ GUARDIAN PROMOTED: ${guardian.name} (${currentTier} → ${newTier})`);
    }
  }
  
  private revokeGuardian(guardian: SimulatedGuardian, day: number): void {
    this.revokedGuardians.add(guardian.id);
    guardian.state.isActive = false;
    
    const event: AccountabilityEvent = {
      type: 'LicenseRevoked',
      guardianId: guardian.id,
      reputationChange: 0,
      newReputation: guardian.state.reputation,
      timestamp: day,
      details: `License revoked due to low reputation (${guardian.state.reputation})`,
    };
    
    this.events.push(event);
    console.log(`🚫 GUARDIAN LICENSE REVOKED: ${guardian.name} (reputation: ${guardian.state.reputation})`);
  }
  
  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------
  
  getEvents(): AccountabilityEvent[] {
    return [...this.events];
  }
  
  getGuardianEvents(guardianId: EntityId): AccountabilityEvent[] {
    return this.events.filter(e => e.guardianId === guardianId);
  }
  
  getRevokedGuardians(): EntityId[] {
    return [...this.revokedGuardians];
  }
  
  isRevoked(guardianId: EntityId): boolean {
    return this.revokedGuardians.has(guardianId);
  }
  
  getStats(): {
    totalEvents: number;
    defaults: number;
    exits: number;
    survivals: number;
    promotions: number;
    demotions: number;
    revocations: number;
  } {
    return {
      totalEvents: this.events.length,
      defaults: this.events.filter(e => e.type === 'ScriptDefault').length,
      exits: this.events.filter(e => e.type === 'ScriptExit').length,
      survivals: this.events.filter(e => e.type === 'CrisisSurvival').length,
      promotions: this.events.filter(e => e.type === 'TierPromotion').length,
      demotions: this.events.filter(e => e.type === 'TierDemotion').length,
      revocations: this.events.filter(e => e.type === 'LicenseRevoked').length,
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createGuardianAccountability(
  config?: Partial<AccountabilityConfig>
): GuardianAccountability {
  return new GuardianAccountability(config);
}
