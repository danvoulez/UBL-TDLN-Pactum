/**
 * MONETARY POLICY
 * 
 * SPRINT E.1: Central bank operations and monetary transmission
 * 
 * Purpose:
 * - Control money supply and interest rates
 * - Stabilize prices and employment
 * - Provide lender of last resort functions
 * - Implement quantitative easing/tightening
 */

import type { EntityId, Timestamp } from '../shared/types';

// =============================================================================
// TYPES
// =============================================================================

export interface MonetaryPolicyConfig {
  /** Target inflation rate (e.g., 0.02 = 2%) */
  readonly targetInflation: number;
  
  /** Natural interest rate */
  readonly naturalRate: number;
  
  /** Inflation weight in Taylor rule */
  readonly inflationWeight: number;
  
  /** Output gap weight in Taylor rule */
  readonly outputWeight: number;
  
  /** Minimum interest rate (zero lower bound) */
  readonly floorRate: number;
  
  /** Maximum interest rate */
  readonly ceilingRate: number;
  
  /** Reserve requirement ratio */
  readonly reserveRequirement: number;
  
  /** Discount window rate premium */
  readonly discountPremium: number;
}

export interface EconomicIndicators {
  readonly inflation: number;        // Current inflation rate
  readonly outputGap: number;        // (Actual - Potential) / Potential
  readonly unemployment: number;     // Unemployment rate
  readonly moneySupply: bigint;      // M2 money supply
  readonly creditGrowth: number;     // Year-over-year credit growth
  readonly assetPrices: number;      // Asset price index
  readonly exchangeRate: number;     // Exchange rate index
  readonly timestamp: Timestamp;
}

export interface MonetaryPolicyDecision {
  readonly id: string;
  readonly type: PolicyDecisionType;
  readonly timestamp: Timestamp;
  readonly indicators: EconomicIndicators;
  readonly previousRate: number;
  readonly newRate: number;
  readonly rationale: string;
  readonly dissents?: readonly string[];
  readonly forwardGuidance?: string;
}

export type PolicyDecisionType =
  | 'RateChange'
  | 'QuantitativeEasing'
  | 'QuantitativeTightening'
  | 'ReserveAdjustment'
  | 'EmergencyLending'
  | 'ForwardGuidance';

export interface OpenMarketOperation {
  readonly id: string;
  readonly type: 'Buy' | 'Sell';
  readonly assetType: 'Bond' | 'MBS' | 'Corporate' | 'ETF';
  readonly amount: bigint;
  readonly price: number;
  readonly timestamp: Timestamp;
  readonly settledAt?: Timestamp;
}

export interface LendingFacility {
  readonly id: string;
  readonly borrower: EntityId;
  readonly amount: bigint;
  readonly rate: number;
  readonly collateral: bigint;
  readonly term: number; // Days
  readonly createdAt: Timestamp;
  readonly maturesAt: Timestamp;
  readonly status: 'Active' | 'Repaid' | 'Defaulted' | 'Extended';
}

// =============================================================================
// MONETARY POLICY ENGINE
// =============================================================================

export class MonetaryPolicyEngine {
  private currentRate: number;
  private decisions: MonetaryPolicyDecision[] = [];
  private operations: OpenMarketOperation[] = [];
  private facilities: Map<string, LendingFacility> = new Map();
  private idCounter = 0;
  
  constructor(
    private readonly config: MonetaryPolicyConfig,
    initialRate?: number
  ) {
    this.currentRate = initialRate ?? config.naturalRate;
  }
  
  /**
   * Calculate optimal rate using Taylor Rule
   * r = r* + π + α(π - π*) + β(y - y*)
   */
  calculateTaylorRate(indicators: EconomicIndicators): number {
    const inflationGap = indicators.inflation - this.config.targetInflation;
    const outputGap = indicators.outputGap;
    
    const taylorRate = 
      this.config.naturalRate +
      indicators.inflation +
      this.config.inflationWeight * inflationGap +
      this.config.outputWeight * outputGap;
    
    // Apply bounds
    return Math.max(
      this.config.floorRate,
      Math.min(this.config.ceilingRate, taylorRate)
    );
  }
  
  /**
   * Make a policy decision based on current indicators
   */
  makeDecision(indicators: EconomicIndicators): MonetaryPolicyDecision {
    const optimalRate = this.calculateTaylorRate(indicators);
    const rateChange = optimalRate - this.currentRate;
    
    // Determine decision type
    let type: PolicyDecisionType = 'RateChange';
    let rationale = '';
    
    if (Math.abs(rateChange) < 0.001) {
      rationale = 'Rates unchanged as economy near equilibrium';
    } else if (rateChange > 0) {
      rationale = `Raising rates by ${(rateChange * 100).toFixed(2)}bp to combat ` +
        (indicators.inflation > this.config.targetInflation ? 'inflation' : 'overheating');
    } else {
      rationale = `Lowering rates by ${(Math.abs(rateChange) * 100).toFixed(2)}bp to stimulate ` +
        (indicators.outputGap < 0 ? 'growth' : 'employment');
    }
    
    // Check for zero lower bound
    if (optimalRate <= this.config.floorRate && indicators.outputGap < -0.02) {
      type = 'QuantitativeEasing';
      rationale += '. Implementing QE as rates at lower bound.';
    }
    
    const decision: MonetaryPolicyDecision = {
      id: `mpd-${++this.idCounter}`,
      type,
      timestamp: Date.now(),
      indicators,
      previousRate: this.currentRate,
      newRate: optimalRate,
      rationale,
      forwardGuidance: this.generateForwardGuidance(indicators, optimalRate),
    };
    
    this.currentRate = optimalRate;
    this.decisions.push(decision);
    
    return decision;
  }
  
  /**
   * Generate forward guidance
   */
  private generateForwardGuidance(
    indicators: EconomicIndicators,
    newRate: number
  ): string {
    if (indicators.inflation > this.config.targetInflation * 1.5) {
      return 'Committee prepared to raise rates further if inflation persists';
    }
    if (indicators.outputGap < -0.03) {
      return 'Committee will maintain accommodative stance until recovery strengthens';
    }
    if (newRate <= this.config.floorRate) {
      return 'Rates expected to remain at current levels for extended period';
    }
    return 'Committee will adjust policy as economic conditions warrant';
  }
  
  /**
   * Execute open market operation
   */
  executeOMO(
    type: 'Buy' | 'Sell',
    assetType: OpenMarketOperation['assetType'],
    amount: bigint,
    price: number
  ): OpenMarketOperation {
    const operation: OpenMarketOperation = {
      id: `omo-${++this.idCounter}`,
      type,
      assetType,
      amount,
      price,
      timestamp: Date.now(),
    };
    
    this.operations.push(operation);
    return operation;
  }
  
  /**
   * Provide emergency lending (discount window)
   */
  provideLending(
    borrower: EntityId,
    amount: bigint,
    collateral: bigint,
    termDays: number
  ): LendingFacility {
    const rate = this.currentRate + this.config.discountPremium;
    const now = Date.now();
    
    const facility: LendingFacility = {
      id: `lf-${++this.idCounter}`,
      borrower,
      amount,
      rate,
      collateral,
      term: termDays,
      createdAt: now,
      maturesAt: now + termDays * 24 * 60 * 60 * 1000,
      status: 'Active',
    };
    
    this.facilities.set(facility.id, facility);
    return facility;
  }
  
  /**
   * Repay lending facility
   */
  repayFacility(facilityId: string): LendingFacility {
    const facility = this.facilities.get(facilityId);
    if (!facility) throw new Error(`Facility not found: ${facilityId}`);
    
    const updated: LendingFacility = {
      ...facility,
      status: 'Repaid',
    };
    this.facilities.set(facilityId, updated);
    return updated;
  }
  
  /**
   * Get current policy rate
   */
  getCurrentRate(): number {
    return this.currentRate;
  }
  
  /**
   * Get discount rate
   */
  getDiscountRate(): number {
    return this.currentRate + this.config.discountPremium;
  }
  
  /**
   * Get recent decisions
   */
  getRecentDecisions(count: number = 10): readonly MonetaryPolicyDecision[] {
    return this.decisions.slice(-count);
  }
  
  /**
   * Get active lending facilities
   */
  getActiveFacilities(): readonly LendingFacility[] {
    return Array.from(this.facilities.values())
      .filter(f => f.status === 'Active');
  }
  
  /**
   * Get policy statistics
   */
  getStats(): MonetaryPolicyStats {
    const activeFacilities = this.getActiveFacilities();
    const totalLending = activeFacilities.reduce(
      (sum, f) => sum + f.amount,
      0n
    );
    
    const buyOps = this.operations.filter(o => o.type === 'Buy');
    const sellOps = this.operations.filter(o => o.type === 'Sell');
    
    return {
      currentRate: this.currentRate,
      discountRate: this.getDiscountRate(),
      totalDecisions: this.decisions.length,
      totalOMOs: this.operations.length,
      netOMOPosition: buyOps.reduce((s, o) => s + o.amount, 0n) -
                      sellOps.reduce((s, o) => s + o.amount, 0n),
      activeFacilities: activeFacilities.length,
      totalLending,
    };
  }
}

export interface MonetaryPolicyStats {
  currentRate: number;
  discountRate: number;
  totalDecisions: number;
  totalOMOs: number;
  netOMOPosition: bigint;
  activeFacilities: number;
  totalLending: bigint;
}

// =============================================================================
// FACTORY
// =============================================================================

export function createMonetaryPolicyEngine(
  config?: Partial<MonetaryPolicyConfig>,
  initialRate?: number
): MonetaryPolicyEngine {
  const defaultConfig: MonetaryPolicyConfig = {
    targetInflation: 0.02,
    naturalRate: 0.025,
    inflationWeight: 1.5,
    outputWeight: 0.5,
    floorRate: 0,
    ceilingRate: 0.20,
    reserveRequirement: 0.10,
    discountPremium: 0.005,
  };
  
  return new MonetaryPolicyEngine({ ...defaultConfig, ...config }, initialRate);
}
