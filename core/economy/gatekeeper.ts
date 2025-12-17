/**
 * ECONOMIC GATEKEEPER
 * 
 * Separação de concerns: Physics (Container) vs Policy (Economy)
 * 
 * O ContainerManager lida com "PODE mover?" (physics)
 * O Gatekeeper lida com "DEVE mover? Quanto custa?" (policy)
 * 
 * Baseado em review do Gemini 3.0 - "Economic Ghost" fix
 */

import type { EntityId, Timestamp } from '../shared/types';

// =============================================================================
// INTERFACES (Loose Coupling)
// =============================================================================

/**
 * Circuit Breaker interface - emergency halt for the economy
 */
export interface ICircuitBreaker {
  /** Check if the circuit breaker is open (halted) */
  isOpen(): boolean;
  
  /** Get the reason for the halt */
  getReason(): string | null;
  
  /** Get when the breaker was tripped */
  getTrippedAt(): Timestamp | null;
}

/**
 * Treasury interface - currency and fund management
 */
export interface ITreasury {
  /** Check if an item is a currency/credit */
  isCurrency(itemId: EntityId): boolean;
  
  /** Get the Guarantee Fund container ID */
  getGuaranteeFundId(): EntityId;
  
  /** Get the current tax rate in basis points (100 = 1%) */
  getTaxRateBps(): bigint;
}

// =============================================================================
// TRANSFER POLICY TYPES
// =============================================================================

export interface TransferPolicyResult {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly fees: readonly TransferFee[];
  readonly netAmount: bigint;
  readonly correlationId: string;
}

export interface TransferFee {
  readonly recipientId: EntityId;
  readonly amount: bigint;
  readonly reason: string;
  readonly feeType: 'tax' | 'royalty' | 'penalty' | 'service';
}

export interface TransferContext {
  readonly sourceId: EntityId;
  readonly destinationId: EntityId;
  readonly itemId: EntityId;
  readonly amount: bigint;
  readonly actor: {
    readonly type: 'System' | 'Entity';
    readonly entityId?: EntityId;
  };
  readonly metadata?: Record<string, unknown>;
}

// =============================================================================
// ECONOMIC GATEKEEPER
// =============================================================================

export class EconomicGatekeeper {
  private readonly DEFAULT_TAX_RATE_BPS = 10n; // 0.1%
  private readonly BPS_DIVISOR = 10000n;
  
  constructor(
    private readonly circuitBreaker: ICircuitBreaker,
    private readonly treasury: ITreasury
  ) {}
  
  /**
   * Assess a potential transfer.
   * Does NOT execute it - only calculates the policy outcome.
   */
  assessTransfer(context: TransferContext): TransferPolicyResult {
    const correlationId = this.generateCorrelationId();
    
    // 1. CIRCUIT BREAKER CHECK (Emergency Halt)
    if (this.circuitBreaker.isOpen()) {
      return {
        allowed: false,
        reason: `Economic Circuit Breaker is OPEN: ${this.circuitBreaker.getReason() ?? 'Unknown reason'}`,
        fees: [],
        netAmount: 0n,
        correlationId,
      };
    }
    
    // 2. CURRENCY CHECK
    // If it's not currency (e.g., a file or NFT), no tax applies
    if (!this.treasury.isCurrency(context.itemId)) {
      return {
        allowed: true,
        fees: [],
        netAmount: context.amount,
        correlationId,
      };
    }
    
    // 3. TAX CALCULATION
    const taxRateBps = this.treasury.getTaxRateBps();
    const feeAmount = (context.amount * taxRateBps) / this.BPS_DIVISOR;
    const netAmount = context.amount - feeAmount;
    
    const fees: TransferFee[] = [];
    
    if (feeAmount > 0n) {
      fees.push({
        recipientId: this.treasury.getGuaranteeFundId(),
        amount: feeAmount,
        reason: `Network Stability Tax (${Number(taxRateBps) / 100}%)`,
        feeType: 'tax',
      });
    }
    
    return {
      allowed: true,
      fees,
      netAmount,
      correlationId,
    };
  }
  
  /**
   * Check if a transfer would be allowed (quick check)
   */
  canTransfer(context: TransferContext): boolean {
    if (this.circuitBreaker.isOpen()) return false;
    return true;
  }
  
  /**
   * Get the current economic status
   */
  getStatus(): {
    circuitBreakerOpen: boolean;
    reason: string | null;
    taxRateBps: bigint;
    guaranteeFundId: EntityId;
  } {
    return {
      circuitBreakerOpen: this.circuitBreaker.isOpen(),
      reason: this.circuitBreaker.getReason(),
      taxRateBps: this.treasury.getTaxRateBps(),
      guaranteeFundId: this.treasury.getGuaranteeFundId(),
    };
  }
  
  private generateCorrelationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `tx-${timestamp}-${random}`;
  }
}

// =============================================================================
// DEFAULT IMPLEMENTATIONS
// =============================================================================

/**
 * In-memory circuit breaker for development/testing
 */
export class InMemoryCircuitBreaker implements ICircuitBreaker {
  private _isOpen = false;
  private _reason: string | null = null;
  private _trippedAt: Timestamp | null = null;
  
  isOpen(): boolean {
    return this._isOpen;
  }
  
  getReason(): string | null {
    return this._reason;
  }
  
  getTrippedAt(): Timestamp | null {
    return this._trippedAt;
  }
  
  trip(reason: string): void {
    this._isOpen = true;
    this._reason = reason;
    this._trippedAt = Date.now();
    console.warn(`🚨 ECONOMY HALTED: ${reason}`);
  }
  
  reset(): void {
    this._isOpen = false;
    this._reason = null;
    this._trippedAt = null;
    console.log('✅ ECONOMY RESUMED: Circuit Breaker Reset');
  }
}

/**
 * In-memory treasury for development/testing
 */
export class InMemoryTreasury implements ITreasury {
  private readonly guaranteeFundId: EntityId;
  private taxRateBps: bigint = 10n; // 0.1%
  private readonly currencyPrefixes = ['curr-', 'credit-', 'ubl-'];
  
  constructor(guaranteeFundId?: EntityId) {
    this.guaranteeFundId = guaranteeFundId ?? ('cont-guarantee-fund' as EntityId);
  }
  
  isCurrency(itemId: EntityId): boolean {
    return this.currencyPrefixes.some(prefix => itemId.startsWith(prefix));
  }
  
  getGuaranteeFundId(): EntityId {
    return this.guaranteeFundId;
  }
  
  getTaxRateBps(): bigint {
    return this.taxRateBps;
  }
  
  setTaxRateBps(rate: bigint): void {
    this.taxRateBps = rate;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createEconomicGatekeeper(
  circuitBreaker?: ICircuitBreaker,
  treasury?: ITreasury
): EconomicGatekeeper {
  return new EconomicGatekeeper(
    circuitBreaker ?? new InMemoryCircuitBreaker(),
    treasury ?? new InMemoryTreasury()
  );
}

export function createInMemoryCircuitBreaker(): InMemoryCircuitBreaker {
  return new InMemoryCircuitBreaker();
}

export function createInMemoryTreasury(guaranteeFundId?: EntityId): InMemoryTreasury {
  return new InMemoryTreasury(guaranteeFundId);
}
