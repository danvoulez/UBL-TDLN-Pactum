/**
 * LOAN TESTS
 * 
 * FASE 2.3: Tests for loan lifecycle and LoanAggregate
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createInMemoryEventStore, type EventStore } from '../../../core/store/event-store';
import { LoanAggregate, type LoanState, type LoanStatus } from '../../../core/aggregates/loan-aggregate';
import type { EntityId, AggregateType } from '../../../core/schema/ledger';

describe('Loan Lifecycle (FASE 2.3)', () => {
  let eventStore: EventStore;
  const testActor = { type: 'System' as const, systemId: 'test' };
  
  const loanId = 'loan-001' as EntityId;
  const borrowerId = 'agent-001' as EntityId;
  const guarantorId = 'guardian-001' as EntityId;
  
  const defaultTerms = {
    principal: 500n,
    interestRate: 0,
    gracePeriodDays: 30,
    repaymentPeriodDays: 180,
    repaymentRate: 0.1,
  };
  
  beforeEach(() => {
    eventStore = createInMemoryEventStore();
  });
  
  async function disburseLoan(terms = defaultTerms): Promise<void> {
    const gracePeriodEndsAt = Date.now() + (terms.gracePeriodDays * 24 * 60 * 60 * 1000);
    
    await eventStore.append({
      type: 'LoanDisbursed',
      aggregateId: loanId,
      aggregateType: 'Agreement' as AggregateType,
      aggregateVersion: 1,
      actor: testActor,
      payload: {
        loanId,
        borrowerId,
        guarantorId,
        terms,
        gracePeriodEndsAt,
      },
    });
  }
  
  async function makePayment(amount: bigint): Promise<void> {
    const version = await eventStore.getNextVersion('Agreement' as AggregateType, loanId);
    
    await eventStore.append({
      type: 'LoanRepayment',
      aggregateId: loanId,
      aggregateType: 'Agreement' as AggregateType,
      aggregateVersion: version,
      actor: { type: 'Entity' as const, entityId: borrowerId },
      payload: {
        loanId,
        amount, // BigInt directly, not object
        source: 'Earnings',
      },
    });
  }
  
  async function rehydrateLoan(): Promise<LoanAggregate> {
    const aggregate = new LoanAggregate(loanId);
    
    for await (const event of eventStore.getByAggregate('Agreement' as AggregateType, loanId)) {
      aggregate.apply(event);
    }
    
    return aggregate;
  }
  
  describe('LoanAggregate', () => {
    it('initializes loan on LoanDisbursed event', async () => {
      await disburseLoan();
      
      const loan = await rehydrateLoan();
      const state = loan.getState();
      
      assert.ok(state);
      assert.strictEqual(state.loanId, loanId);
      assert.strictEqual(state.borrowerId, borrowerId);
      assert.strictEqual(state.guarantorId, guarantorId);
      assert.strictEqual(state.status, 'GracePeriod');
      assert.strictEqual(state.principal, 500n);
      assert.strictEqual(state.remainingBalance, 500n);
      assert.strictEqual(state.totalPaid, 0n);
    });
    
    it('tracks payments correctly', async () => {
      await disburseLoan();
      await makePayment(100n);
      
      const loan = await rehydrateLoan();
      const state = loan.getState();
      
      assert.ok(state);
      assert.strictEqual(state.totalPaid, 100n);
      assert.strictEqual(state.remainingBalance, 400n);
      assert.strictEqual(state.paymentCount, 1);
    });
    
    it('marks loan as PaidOff when fully repaid', async () => {
      await disburseLoan();
      await makePayment(500n);
      
      const loan = await rehydrateLoan();
      const state = loan.getState();
      
      assert.ok(state);
      assert.strictEqual(state.status, 'PaidOff');
      assert.strictEqual(state.remainingBalance, 0n);
      assert.ok(state.paidOffAt);
    });
    
    it('handles multiple partial payments', async () => {
      await disburseLoan();
      await makePayment(100n);
      await makePayment(150n);
      await makePayment(250n);
      
      const loan = await rehydrateLoan();
      const state = loan.getState();
      
      assert.ok(state);
      assert.strictEqual(state.status, 'PaidOff');
      assert.strictEqual(state.totalPaid, 500n);
      assert.strictEqual(state.paymentCount, 3);
    });
    
    it('handles loan default', async () => {
      await disburseLoan();
      
      const version = await eventStore.getNextVersion('Agreement' as AggregateType, loanId);
      await eventStore.append({
        type: 'LoanDefaulted',
        aggregateId: loanId,
        aggregateType: 'Agreement' as AggregateType,
        aggregateVersion: version,
        actor: testActor,
        payload: {
          loanId,
          reason: 'Missed 3 consecutive payments',
          outstandingBalance: 500n,
        },
      });
      
      const loan = await rehydrateLoan();
      const state = loan.getState();
      
      assert.ok(state);
      assert.strictEqual(state.status, 'Defaulted');
      assert.ok(state.defaultedAt);
    });
    
    it('handles loan forgiveness', async () => {
      await disburseLoan();
      await makePayment(200n);
      
      const version = await eventStore.getNextVersion('Agreement' as AggregateType, loanId);
      await eventStore.append({
        type: 'LoanForgiven',
        aggregateId: loanId,
        aggregateType: 'Agreement' as AggregateType,
        aggregateVersion: version,
        actor: { type: 'Entity' as const, entityId: guarantorId },
        payload: {
          loanId,
          amount: 300n,
          reason: 'Agent demonstrated good faith effort',
        },
      });
      
      const loan = await rehydrateLoan();
      const state = loan.getState();
      
      assert.ok(state);
      assert.strictEqual(state.status, 'Forgiven');
      assert.strictEqual(state.remainingBalance, 0n);
    });
    
    it('accrues interest correctly', async () => {
      await disburseLoan({
        ...defaultTerms,
        interestRate: 5, // 5%
      });
      
      const version = await eventStore.getNextVersion('Agreement' as AggregateType, loanId);
      await eventStore.append({
        type: 'InterestAccrued',
        aggregateId: loanId,
        aggregateType: 'Agreement' as AggregateType,
        aggregateVersion: version,
        actor: testActor,
        payload: {
          loanId,
          amount: 25n, // 5% of 500
        },
      });
      
      const loan = await rehydrateLoan();
      const state = loan.getState();
      
      assert.ok(state);
      assert.strictEqual(state.interestAccrued, 25n);
      assert.strictEqual(state.totalOwed, 525n);
      assert.strictEqual(state.remainingBalance, 525n);
    });
  });
  
  describe('Loan Queries', () => {
    it('can query all loan events by correlation', async () => {
      // Create loan with correlation ID
      const correlationId = 'loan-flow-001' as EntityId;
      
      await eventStore.append({
        type: 'LoanDisbursed',
        aggregateId: loanId,
        aggregateType: 'Agreement' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        causation: { correlationId },
        payload: {
          loanId,
          borrowerId,
          guarantorId,
          terms: defaultTerms,
          gracePeriodEndsAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        },
      });
      
      await eventStore.append({
        type: 'LoanRepayment',
        aggregateId: loanId,
        aggregateType: 'Agreement' as AggregateType,
        aggregateVersion: 2,
        actor: { type: 'Entity' as const, entityId: borrowerId },
        causation: { correlationId },
        payload: {
          loanId,
          amount: 500n,
          source: 'Earnings',
        },
      });
      
      const result = await eventStore.query({
        correlationId,
      });
      
      assert.strictEqual(result.total, 2);
      assert.strictEqual(result.events[0].type, 'LoanDisbursed');
      assert.strictEqual(result.events[1].type, 'LoanRepayment');
    });
  });
  
  describe('Loan Business Rules', () => {
    it('calculates repayment progress', async () => {
      await disburseLoan();
      await makePayment(250n);
      
      const loan = await rehydrateLoan();
      const progress = loan.getRepaymentProgress();
      
      assert.strictEqual(progress.percentPaid, 50);
      assert.strictEqual(progress.remainingPayments, 250n);
    });
    
    it('checks if loan is in good standing', async () => {
      await disburseLoan();
      await makePayment(100n);
      
      const loan = await rehydrateLoan();
      
      assert.strictEqual(loan.isInGoodStanding(), true);
    });
    
    it('detects delinquent loans', async () => {
      await disburseLoan();
      
      // Mark as delinquent
      const version = await eventStore.getNextVersion('Agreement' as AggregateType, loanId);
      await eventStore.append({
        type: 'LoanDelinquent',
        aggregateId: loanId,
        aggregateType: 'Agreement' as AggregateType,
        aggregateVersion: version,
        actor: testActor,
        payload: {
          loanId,
          missedPayments: 1,
          daysPastDue: 15,
        },
      });
      
      const loan = await rehydrateLoan();
      
      assert.strictEqual(loan.isInGoodStanding(), false);
    });
  });
});
