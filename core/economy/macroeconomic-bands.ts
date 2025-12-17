/**
 * MACROECONOMIC BANDS
 *
 * Simplified 3-band system for monetary policy.
 * Instead of continuous floating rates, we use discrete bands:
 *
 *   LOW | NORMAL | HIGH
 *
 * This is:
 * - Simpler to understand
 * - Easier to implement
 * - Statistically equivalent to continuous
 * - No crazy decimal numbers
 * - Clear communication ("rates are HIGH")
 *
 * The Macroeconomic Tripod:
 * 1. Interest Rate (bands)
 * 2. Exchange Rate (bands)
 * 3. Inflation (calculated, triggers band changes)
 */

import type { Timestamp } from '../shared/types';

// ============================================================================
// BAND TYPES
// ============================================================================

/**
 * The three bands
 */
export type Band = 'low' | 'normal' | 'high';

/**
 * Interest rate bands
 */
export interface InterestRateBands {
  low: number;     // Stimulative: 2%
  normal: number;  // Neutral: 5%
  high: number;    // Restrictive: 10%
}

/**
 * Exchange rate bands (1 ◆ = X USD)
 */
export interface ExchangeRateBands {
  low: number;     // Weak ◆: $0.008
  normal: number;  // Neutral: $0.01
  high: number;    // Strong ◆: $0.012
}

/**
 * Inflation thresholds that trigger band changes
 */
export interface InflationThresholds {
  /** Below this = deflation risk → lower rates */
  lowThreshold: number;   // 0% - deflation
  /** Above this = inflation risk → raise rates */
  highThreshold: number;  // 4% - too hot
}

/**
 * Complete macroeconomic configuration
 */
export interface MacroeconomicConfig {
  interestRates: InterestRateBands;
  exchangeRates: ExchangeRateBands;
  inflationThresholds: InflationThresholds;
  
  /** Spread on currency conversion (operator revenue) */
  conversionSpread: number;
  
  /** Minimum time between band changes (stability) */
  bandChangeCooldownMs: number;
}

/**
 * Current macroeconomic state
 */
export interface MacroeconomicState {
  /** Current interest rate band */
  interestBand: Band;
  
  /** Current exchange rate band */
  exchangeBand: Band;
  
  /** Last calculated inflation rate */
  currentInflation: number;
  
  /** When bands were last changed */
  lastBandChange: Timestamp;
  
  /** Effective rates (from bands) */
  effectiveRates: {
    interest: number;
    exchange: number;
  };
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

/**
 * Default band values - simple, round numbers
 */
export const DEFAULT_MACRO_CONFIG: MacroeconomicConfig = {
  interestRates: {
    low: 0.02,      // 2% - stimulative
    normal: 0.05,   // 5% - neutral
    high: 0.10,     // 10% - restrictive
  },
  exchangeRates: {
    low: 0.008,     // $0.008 per ◆ (weak credit)
    normal: 0.01,   // $0.01 per ◆ (baseline)
    high: 0.012,    // $0.012 per ◆ (strong credit)
  },
  inflationThresholds: {
    lowThreshold: 0.00,   // 0% - deflation risk
    highThreshold: 0.04,  // 4% - inflation risk
  },
  conversionSpread: 0.02, // 2% spread on conversions
  bandChangeCooldownMs: 7 * 24 * 60 * 60 * 1000, // 1 week minimum between changes
};

/**
 * Initial state - start at normal
 */
export const INITIAL_MACRO_STATE: MacroeconomicState = {
  interestBand: 'normal',
  exchangeBand: 'normal',
  currentInflation: 0.02, // 2% target
  lastBandChange: 0,
  effectiveRates: {
    interest: DEFAULT_MACRO_CONFIG.interestRates.normal,
    exchange: DEFAULT_MACRO_CONFIG.exchangeRates.normal,
  },
};

// ============================================================================
// MACROECONOMIC CONTROLLER
// ============================================================================

/**
 * Macroeconomic Controller
 *
 * Manages the 3-band system for interest and exchange rates.
 */
export class MacroeconomicController {
  private config: MacroeconomicConfig;
  private state: MacroeconomicState;

  constructor(
    config: MacroeconomicConfig = DEFAULT_MACRO_CONFIG,
    initialState: MacroeconomicState = INITIAL_MACRO_STATE
  ) {
    this.config = config;
    this.state = { ...initialState };
  }

  /**
   * Get current state
   */
  getState(): MacroeconomicState {
    return { ...this.state };
  }

  /**
   * Get effective interest rate
   */
  getInterestRate(): number {
    return this.state.effectiveRates.interest;
  }

  /**
   * Get effective exchange rate (1 ◆ = X USD)
   */
  getExchangeRate(): number {
    return this.state.effectiveRates.exchange;
  }

  /**
   * Get current bands
   */
  getBands(): { interest: Band; exchange: Band } {
    return {
      interest: this.state.interestBand,
      exchange: this.state.exchangeBand,
    };
  }

  /**
   * Calculate conversion: Fiat → UBL Credits
   */
  convertToCredits(fiatAmount: number, fiatCurrency: string = 'USD'): {
    credits: number;
    rate: number;
    spread: number;
    fee: number;
  } {
    // For now, assume USD. Future: add currency conversion
    const baseRate = this.state.effectiveRates.exchange;
    const spread = this.config.conversionSpread;
    
    // Buy rate (fiat → credits): worse for buyer
    const buyRate = baseRate * (1 + spread);
    
    const credits = fiatAmount / buyRate;
    const fee = fiatAmount * spread;

    return {
      credits: Math.floor(credits * 1000) / 1000, // Round to 3 decimals
      rate: buyRate,
      spread,
      fee,
    };
  }

  /**
   * Calculate conversion: UBL Credits → Fiat
   */
  convertToFiat(creditAmount: number, fiatCurrency: string = 'USD'): {
    fiat: number;
    rate: number;
    spread: number;
    fee: number;
  } {
    const baseRate = this.state.effectiveRates.exchange;
    const spread = this.config.conversionSpread;
    
    // Sell rate (credits → fiat): worse for seller
    const sellRate = baseRate * (1 - spread);
    
    const fiat = creditAmount * sellRate;
    const fee = creditAmount * baseRate * spread;

    return {
      fiat: Math.floor(fiat * 100) / 100, // Round to cents
      rate: sellRate,
      spread,
      fee,
    };
  }

  /**
   * Evaluate if band change is needed based on inflation
   */
  evaluateBandChange(currentInflation: number): {
    shouldChange: boolean;
    newInterestBand?: Band;
    newExchangeBand?: Band;
    reason?: string;
  } {
    const now = Date.now();
    const { lowThreshold, highThreshold } = this.config.inflationThresholds;
    
    // Check cooldown
    if (now - this.state.lastBandChange < this.config.bandChangeCooldownMs) {
      return {
        shouldChange: false,
        reason: 'Cooldown active',
      };
    }

    // Determine target bands based on inflation
    let targetInterestBand: Band = 'normal';
    let targetExchangeBand: Band = 'normal';

    if (currentInflation <= lowThreshold) {
      // Deflation risk → stimulate
      targetInterestBand = 'low';    // Lower rates → more borrowing
      targetExchangeBand = 'low';    // Weaker ◆ → more exports/activity
    } else if (currentInflation >= highThreshold) {
      // Inflation risk → restrict
      targetInterestBand = 'high';   // Higher rates → less borrowing
      targetExchangeBand = 'high';   // Stronger ◆ → imports cheaper
    }

    // Check if change needed
    const interestChange = targetInterestBand !== this.state.interestBand;
    const exchangeChange = targetExchangeBand !== this.state.exchangeBand;

    if (!interestChange && !exchangeChange) {
      return {
        shouldChange: false,
        reason: 'Already at appropriate band',
      };
    }

    return {
      shouldChange: true,
      newInterestBand: interestChange ? targetInterestBand : undefined,
      newExchangeBand: exchangeChange ? targetExchangeBand : undefined,
      reason: currentInflation <= lowThreshold
        ? `Deflation risk (${(currentInflation * 100).toFixed(1)}%)`
        : `Inflation risk (${(currentInflation * 100).toFixed(1)}%)`,
    };
  }

  /**
   * Apply band change
   */
  applyBandChange(
    newInterestBand?: Band,
    newExchangeBand?: Band,
    currentInflation?: number
  ): MacroeconomicState {
    const now = Date.now();

    if (newInterestBand) {
      this.state.interestBand = newInterestBand;
      this.state.effectiveRates.interest = this.config.interestRates[newInterestBand];
    }

    if (newExchangeBand) {
      this.state.exchangeBand = newExchangeBand;
      this.state.effectiveRates.exchange = this.config.exchangeRates[newExchangeBand];
    }

    if (currentInflation !== undefined) {
      this.state.currentInflation = currentInflation;
    }

    this.state.lastBandChange = now;

    return { ...this.state };
  }

  /**
   * Run automatic adjustment cycle
   */
  runAdjustmentCycle(currentInflation: number): {
    changed: boolean;
    previousState: MacroeconomicState;
    newState: MacroeconomicState;
    reason?: string;
  } {
    const previousState = { ...this.state };
    
    const evaluation = this.evaluateBandChange(currentInflation);
    
    if (!evaluation.shouldChange) {
      // Just update inflation reading
      this.state.currentInflation = currentInflation;
      return {
        changed: false,
        previousState,
        newState: { ...this.state },
        reason: evaluation.reason,
      };
    }

    const newState = this.applyBandChange(
      evaluation.newInterestBand,
      evaluation.newExchangeBand,
      currentInflation
    );

    return {
      changed: true,
      previousState,
      newState,
      reason: evaluation.reason,
    };
  }

  /**
   * Format state for display
   */
  formatState(): string {
    const { interestBand, exchangeBand, currentInflation, effectiveRates } = this.state;
    
    const bandEmoji = (band: Band) => {
      switch (band) {
        case 'low': return '🟢';
        case 'normal': return '🟡';
        case 'high': return '🔴';
      }
    };

    return `
╔══════════════════════════════════════════════════════════════╗
║              MACROECONOMIC STATUS                            ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  INTEREST RATE                                               ║
║  ${bandEmoji(interestBand)} Band: ${interestBand.toUpperCase().padEnd(6)}  Rate: ${(effectiveRates.interest * 100).toFixed(0)}%                        ║
║     [LOW 2%]───[NORMAL 5%]───[HIGH 10%]                      ║
║         ${interestBand === 'low' ? '▲' : ' '}            ${interestBand === 'normal' ? '▲' : ' '}             ${interestBand === 'high' ? '▲' : ' '}                       ║
║                                                              ║
║  EXCHANGE RATE (1 ◆ = USD)                                   ║
║  ${bandEmoji(exchangeBand)} Band: ${exchangeBand.toUpperCase().padEnd(6)}  Rate: $${effectiveRates.exchange.toFixed(3)}                     ║
║     [LOW $0.008]───[NORMAL $0.01]───[HIGH $0.012]            ║
║          ${exchangeBand === 'low' ? '▲' : ' '}              ${exchangeBand === 'normal' ? '▲' : ' '}               ${exchangeBand === 'high' ? '▲' : ' '}                    ║
║                                                              ║
║  INFLATION                                                   ║
║  Current: ${(currentInflation * 100).toFixed(1)}%                                            ║
║     [0% DEFLATION]───[2% TARGET]───[4%+ INFLATION]           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;
  }

  /**
   * Get simple status summary
   */
  getStatusSummary(): string {
    const { interestBand, exchangeBand, currentInflation } = this.state;
    
    const inflationStatus = currentInflation <= 0 ? 'DEFLATION' :
      currentInflation >= 0.04 ? 'HIGH' : 'STABLE';

    return `Interest: ${interestBand.toUpperCase()} | Exchange: ${exchangeBand.toUpperCase()} | Inflation: ${inflationStatus}`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a macroeconomic controller
 */
export function createMacroeconomicController(
  config?: Partial<MacroeconomicConfig>,
  initialState?: Partial<MacroeconomicState>
): MacroeconomicController {
  const fullConfig: MacroeconomicConfig = {
    ...DEFAULT_MACRO_CONFIG,
    ...config,
  };

  const fullState: MacroeconomicState = {
    ...INITIAL_MACRO_STATE,
    ...initialState,
    effectiveRates: {
      interest: fullConfig.interestRates[initialState?.interestBand || 'normal'],
      exchange: fullConfig.exchangeRates[initialState?.exchangeBand || 'normal'],
    },
  };

  return new MacroeconomicController(fullConfig, fullState);
}

// ============================================================================
// EVENTS
// ============================================================================

/**
 * Band change event payload
 */
export interface BandChangePayload {
  readonly type: 'MacroeconomicBandChanged';
  readonly previousInterestBand: Band;
  readonly newInterestBand: Band;
  readonly previousExchangeBand: Band;
  readonly newExchangeBand: Band;
  readonly triggeringInflation: number;
  readonly reason: string;
  readonly effectiveRates: {
    readonly interest: number;
    readonly exchange: number;
  };
}

/**
 * Currency conversion event payload
 */
export interface CurrencyConversionPayload {
  readonly type: 'CurrencyConverted';
  readonly direction: 'toCredits' | 'toFiat';
  readonly fromCurrency: string;
  readonly fromAmount: number;
  readonly toCurrency: string;
  readonly toAmount: number;
  readonly rate: number;
  readonly spread: number;
  readonly fee: number;
}
