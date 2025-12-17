/**
 * WALLET AGGREGATE
 * 
 * Reconstructs wallet balance from events.
 * Wallet is a Container with physics: Wallet.
 * 
 * Events handled:
 * - WalletCreated
 * - Deposited
 * - Withdrawn
 * - TransferExecuted
 */

import type { EntityId, Quantity, Timestamp } from '../shared/types';
import type { Event } from '../schema/ledger';
import type { WalletMetadata, WalletRules } from '../schema/agent-economy';

// =============================================================================
// WALLET STATE
// =============================================================================

export interface WalletState {
  readonly walletId: EntityId;
  readonly ownerId: EntityId;
  readonly currency: string;
  readonly balance: bigint;
  readonly rules: WalletRules;
  readonly createdAt: Timestamp;
  readonly lastActivityAt: Timestamp;
  readonly version: number;
  
  // Computed stats
  readonly totalDeposited: bigint;
  readonly totalWithdrawn: bigint;
  readonly transactionCount: number;
}

// =============================================================================
// WALLET AGGREGATE
// =============================================================================

export class WalletAggregate {
  private state: WalletState | null = null;
  
  constructor(private readonly walletId: EntityId) {}
  
  // ---------------------------------------------------------------------------
  // EVENT APPLICATION
  // ---------------------------------------------------------------------------
  
  apply(event: Event): void {
    switch (event.type) {
      case 'WalletCreated':
        this.applyWalletCreated(event);
        break;
      case 'Deposited':
        this.applyDeposited(event);
        break;
      case 'Withdrawn':
        this.applyWithdrawn(event);
        break;
      case 'TransferExecuted':
        this.applyTransferExecuted(event);
        break;
    }
  }
  
  private applyWalletCreated(event: Event): void {
    const payload = event.payload as {
      walletId: EntityId;
      ownerId: EntityId;
      currency: string;
      rules?: WalletRules;
    };
    
    this.state = {
      walletId: payload.walletId,
      ownerId: payload.ownerId,
      currency: payload.currency,
      balance: 0n,
      rules: payload.rules ?? {},
      createdAt: event.timestamp,
      lastActivityAt: event.timestamp,
      version: 1,
      totalDeposited: 0n,
      totalWithdrawn: 0n,
      transactionCount: 0,
    };
  }
  
  private applyDeposited(event: Event): void {
    if (!this.state) return;
    
    const payload = event.payload as {
      walletId: EntityId;
      amount: bigint;
      source?: string;
    };
    
    if (payload.walletId !== this.walletId) return;
    
    const amount = BigInt(payload.amount);
    this.state = {
      ...this.state,
      balance: this.state.balance + amount,
      totalDeposited: this.state.totalDeposited + amount,
      transactionCount: this.state.transactionCount + 1,
      lastActivityAt: event.timestamp,
      version: this.state.version + 1,
    };
  }
  
  private applyWithdrawn(event: Event): void {
    if (!this.state) return;
    
    const payload = event.payload as {
      walletId: EntityId;
      amount: bigint;
      destination?: string;
    };
    
    if (payload.walletId !== this.walletId) return;
    
    const amount = BigInt(payload.amount);
    this.state = {
      ...this.state,
      balance: this.state.balance - amount,
      totalWithdrawn: this.state.totalWithdrawn + amount,
      transactionCount: this.state.transactionCount + 1,
      lastActivityAt: event.timestamp,
      version: this.state.version + 1,
    };
  }
  
  private applyTransferExecuted(event: Event): void {
    if (!this.state) return;
    
    const payload = event.payload as {
      fromWalletId: EntityId;
      toWalletId: EntityId;
      amount: bigint;
    };
    
    const amount = BigInt(payload.amount);
    
    // Outgoing transfer
    if (payload.fromWalletId === this.walletId) {
      this.state = {
        ...this.state,
        balance: this.state.balance - amount,
        totalWithdrawn: this.state.totalWithdrawn + amount,
        transactionCount: this.state.transactionCount + 1,
        lastActivityAt: event.timestamp,
        version: this.state.version + 1,
      };
    }
    
    // Incoming transfer
    if (payload.toWalletId === this.walletId) {
      this.state = {
        ...this.state,
        balance: this.state.balance + amount,
        totalDeposited: this.state.totalDeposited + amount,
        transactionCount: this.state.transactionCount + 1,
        lastActivityAt: event.timestamp,
        version: this.state.version + 1,
      };
    }
  }
  
  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------
  
  getState(): WalletState | null {
    return this.state;
  }
  
  getBalance(): bigint {
    return this.state?.balance ?? 0n;
  }
  
  canWithdraw(amount: bigint): boolean {
    if (!this.state) return false;
    
    const newBalance = this.state.balance - amount;
    
    // Check if negative allowed
    if (newBalance < 0n && !this.state.rules.allowNegative) {
      return false;
    }
    
    return true;
  }
  
  canDeposit(amount: bigint): boolean {
    if (!this.state) return false;
    
    // Check max balance
    if (this.state.rules.maxBalance) {
      const newBalance = this.state.balance + amount;
      if (newBalance > this.state.rules.maxBalance) {
        return false;
      }
    }
    
    return true;
  }
  
  requiresApproval(amount: bigint): boolean {
    if (!this.state) return false;
    
    if (this.state.rules.requireApprovalAbove) {
      return amount > this.state.rules.requireApprovalAbove;
    }
    
    return false;
  }
  
  isRecipientAllowed(recipientId: EntityId): boolean {
    if (!this.state) return false;
    
    if (this.state.rules.allowedRecipients) {
      return this.state.rules.allowedRecipients.includes(recipientId);
    }
    
    return true; // No restrictions
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createWalletAggregate(walletId: EntityId): WalletAggregate {
  return new WalletAggregate(walletId);
}

/**
 * Reconstruct wallet state from events
 */
export function reconstructWallet(walletId: EntityId, events: Event[]): WalletState | null {
  const aggregate = createWalletAggregate(walletId);
  
  for (const event of events) {
    aggregate.apply(event);
  }
  
  return aggregate.getState();
}
