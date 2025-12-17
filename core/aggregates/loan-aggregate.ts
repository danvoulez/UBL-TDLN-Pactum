/**
 * LOAN AGGREGATE
 * 
 * Tracks loan status and payments.
 * Loans are Agreements with StarterLoanTerms.
 * 
 * Events handled:
 * - LoanDisbursed
 * - LoanRepayment
 * - LoanDefaulted
 * - LoanForgiven
 * - LoanPaidOff
 */

import type { EntityId, Quantity, Timestamp } from '../shared/types';
import type { Event } from '../schema/ledger';
import type { StarterLoanTerms } from '../schema/agent-economy';

// =============================================================================
// LOAN STATE
// =============================================================================

export type LoanStatus = 
  | 'Active'      // Loan is active, payments expected
  | 'GracePeriod' // In grace period, no payments required yet
  | 'Delinquent'  // Missed payments
  | 'Defaulted'   // Borrower defaulted
  | 'PaidOff'     // Fully repaid
  | 'Forgiven';   // Debt forgiven

export interface LoanState {
  readonly loanId: EntityId;
  readonly borrowerId: EntityId;
  readonly guarantorId: EntityId;  // Guardian who guaranteed
  readonly terms: StarterLoanTerms;
  
  // Current state
  readonly status: LoanStatus;
  readonly principal: bigint;
  readonly interestAccrued: bigint;
  readonly totalOwed: bigint;
  readonly totalPaid: bigint;
  readonly remainingBalance: bigint;
  
  // Timeline
  readonly disbursedAt: Timestamp;
  readonly gracePeriodEndsAt: Timestamp;
  readonly lastPaymentAt: Timestamp | null;
  readonly paidOffAt: Timestamp | null;
  readonly defaultedAt: Timestamp | null;
  
  // Stats
  readonly paymentCount: number;
  readonly missedPayments: number;
  readonly version: number;
}

// =============================================================================
// LOAN AGGREGATE
// =============================================================================

export class LoanAggregate {
  private state: LoanState | null = null;
  
  constructor(private readonly loanId: EntityId) {}
  
  // ---------------------------------------------------------------------------
  // EVENT APPLICATION
  // ---------------------------------------------------------------------------
  
  apply(event: Event): void {
    switch (event.type) {
      case 'LoanDisbursed':
        this.applyLoanDisbursed(event);
        break;
      case 'LoanRepayment':
        this.applyLoanRepayment(event);
        break;
      case 'LoanDefaulted':
        this.applyLoanDefaulted(event);
        break;
      case 'LoanForgiven':
        this.applyLoanForgiven(event);
        break;
      case 'LoanPaidOff':
        this.applyLoanPaidOff(event);
        break;
      case 'InterestAccrued':
        this.applyInterestAccrued(event);
        break;
      case 'LoanDelinquent':
        this.applyLoanDelinquent(event);
        break;
    }
  }
  
  private applyLoanDisbursed(event: Event): void {
    const payload = event.payload as {
      loanId: EntityId;
      borrowerId: EntityId;
      guarantorId: EntityId;
      terms: StarterLoanTerms;
      gracePeriodEndsAt: Timestamp;
    };
    
    const principal = BigInt(payload.terms.principal as unknown as bigint);
    
    this.state = {
      loanId: payload.loanId,
      borrowerId: payload.borrowerId,
      guarantorId: payload.guarantorId,
      terms: payload.terms,
      status: 'GracePeriod',
      principal,
      interestAccrued: 0n,
      totalOwed: principal,
      totalPaid: 0n,
      remainingBalance: principal,
      disbursedAt: event.timestamp,
      gracePeriodEndsAt: payload.gracePeriodEndsAt,
      lastPaymentAt: null,
      paidOffAt: null,
      defaultedAt: null,
      paymentCount: 0,
      missedPayments: 0,
      version: 1,
    };
  }
  
  private applyLoanRepayment(event: Event): void {
    if (!this.state) return;
    
    const payload = event.payload as {
      loanId: EntityId;
      amount: bigint;
      source: 'Earnings' | 'Manual' | 'Bailout';
    };
    
    if (payload.loanId !== this.loanId) return;
    
    const amount = BigInt(payload.amount);
    const newTotalPaid = this.state.totalPaid + amount;
    const newRemainingBalance = this.state.remainingBalance - amount;
    
    // Check if paid off
    const isPaidOff = newRemainingBalance <= 0n;
    
    this.state = {
      ...this.state,
      status: isPaidOff ? 'PaidOff' : 'Active',
      totalPaid: newTotalPaid,
      remainingBalance: newRemainingBalance < 0n ? 0n : newRemainingBalance,
      lastPaymentAt: event.timestamp,
      paidOffAt: isPaidOff ? event.timestamp : null,
      paymentCount: this.state.paymentCount + 1,
      version: this.state.version + 1,
    };
  }
  
  private applyInterestAccrued(event: Event): void {
    if (!this.state) return;
    
    const payload = event.payload as {
      loanId: EntityId;
      amount: bigint;
    };
    
    if (payload.loanId !== this.loanId) return;
    
    const amount = BigInt(payload.amount);
    
    this.state = {
      ...this.state,
      interestAccrued: this.state.interestAccrued + amount,
      totalOwed: this.state.totalOwed + amount,
      remainingBalance: this.state.remainingBalance + amount,
      version: this.state.version + 1,
    };
  }
  
  private applyLoanDefaulted(event: Event): void {
    if (!this.state) return;
    
    const payload = event.payload as {
      loanId: EntityId;
      reason: string;
    };
    
    if (payload.loanId !== this.loanId) return;
    
    this.state = {
      ...this.state,
      status: 'Defaulted',
      defaultedAt: event.timestamp,
      version: this.state.version + 1,
    };
  }
  
  private applyLoanForgiven(event: Event): void {
    if (!this.state) return;
    
    const payload = event.payload as {
      loanId: EntityId;
      amount: bigint;
      reason: string;
    };
    
    if (payload.loanId !== this.loanId) return;
    
    const amount = BigInt(payload.amount);
    const newRemainingBalance = this.state.remainingBalance - amount;
    
    this.state = {
      ...this.state,
      status: newRemainingBalance <= 0n ? 'Forgiven' : this.state.status,
      remainingBalance: newRemainingBalance < 0n ? 0n : newRemainingBalance,
      version: this.state.version + 1,
    };
  }
  
  private applyLoanPaidOff(event: Event): void {
    if (!this.state) return;
    
    const payload = event.payload as {
      loanId: EntityId;
    };
    
    if (payload.loanId !== this.loanId) return;
    
    this.state = {
      ...this.state,
      status: 'PaidOff',
      remainingBalance: 0n,
      paidOffAt: event.timestamp,
      version: this.state.version + 1,
    };
  }
  
  private applyLoanDelinquent(event: Event): void {
    if (!this.state) return;
    
    const payload = event.payload as {
      loanId: EntityId;
      missedPayments: number;
      daysPastDue: number;
    };
    
    if (payload.loanId !== this.loanId) return;
    
    this.state = {
      ...this.state,
      status: 'Delinquent',
      missedPayments: payload.missedPayments,
      version: this.state.version + 1,
    };
  }
  
  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------
  
  getState(): LoanState | null {
    return this.state;
  }
  
  getRemainingBalance(): bigint {
    return this.state?.remainingBalance ?? 0n;
  }
  
  isActive(): boolean {
    return this.state?.status === 'Active' || this.state?.status === 'GracePeriod';
  }
  
  isInGracePeriod(currentTime: Timestamp): boolean {
    if (!this.state) return false;
    return currentTime < this.state.gracePeriodEndsAt;
  }
  
  calculateRequiredPayment(earnings: bigint): bigint {
    if (!this.state || !this.isActive()) return 0n;
    
    // Payment is repaymentRate % of earnings
    const rate = this.state.terms.repaymentRate;
    return BigInt(Math.floor(Number(earnings) * rate));
  }
  
  getPayoffAmount(): bigint {
    return this.state?.remainingBalance ?? 0n;
  }
  
  /**
   * Get repayment progress statistics
   */
  getRepaymentProgress(): {
    percentPaid: number;
    remainingPayments: bigint;
    totalPaid: bigint;
    principal: bigint;
  } {
    if (!this.state) {
      return {
        percentPaid: 0,
        remainingPayments: 0n,
        totalPaid: 0n,
        principal: 0n,
      };
    }
    
    const percentPaid = this.state.totalOwed > 0n
      ? Math.floor(Number(this.state.totalPaid * 100n / this.state.totalOwed))
      : 0;
    
    return {
      percentPaid,
      remainingPayments: this.state.remainingBalance,
      totalPaid: this.state.totalPaid,
      principal: this.state.principal,
    };
  }
  
  /**
   * Check if loan is in good standing (not defaulted or delinquent)
   */
  isInGoodStanding(): boolean {
    if (!this.state) return false;
    
    const badStatuses: LoanStatus[] = ['Defaulted', 'Delinquent'];
    return !badStatuses.includes(this.state.status);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createLoanAggregate(loanId: EntityId): LoanAggregate {
  return new LoanAggregate(loanId);
}

/**
 * Reconstruct loan state from events
 */
export function reconstructLoan(loanId: EntityId, events: Event[]): LoanState | null {
  const aggregate = createLoanAggregate(loanId);
  
  for (const event of events) {
    aggregate.apply(event);
  }
  
  return aggregate.getState();
}
