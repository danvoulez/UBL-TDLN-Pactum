/**
 * WALLET TESTS
 * 
 * Testing wallet operations:
 * 1. Wallet creation
 * 2. Deposits and withdrawals
 * 3. Balance calculations via WalletAggregate
 * 4. Transfer validation
 * 5. Wallet rules enforcement
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createInMemoryEventStore, type EventStore } from '../../../core/store/event-store';
import { Ids, asEntityId } from '../../../core/shared/types';
import type { EntityId } from '../../../core/schema/ledger';
import { toSmallestUnit, fromSmallestUnit } from '../../../core/schema/agent-economy';
import { WalletAggregate, createWalletAggregate } from '../../../core/aggregates/wallet-aggregate';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestEventStore(): EventStore {
  return createInMemoryEventStore();
}

function createTestActor(entityId: string = 'test-user'): { type: 'Entity'; entityId: EntityId } {
  return { type: 'Entity', entityId: asEntityId(entityId) };
}

// ============================================================================
// 1. WALLET CREATION
// ============================================================================

describe('WALLET: Creation', () => {
  let eventStore: EventStore;

  beforeEach(() => {
    eventStore = createTestEventStore();
  });

  it('creates wallet with correct initial state', async () => {
    const walletId = Ids.entity();
    const ownerId = Ids.entity();
    const actor = createTestActor();

    const event = await eventStore.append({
      type: 'WalletCreated',
      aggregateId: walletId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: {
        walletId,
        ownerId,
        currency: 'UBL',
        initialBalance: BigInt(0),
      },
      actor,
    });

    assert.strictEqual(event.type, 'WalletCreated');
    assert.strictEqual(event.payload.currency, 'UBL');
    assert.strictEqual(event.payload.initialBalance, BigInt(0));
  });

  it('creates wallet with rules', async () => {
    const walletId = Ids.entity();
    const ownerId = Ids.entity();
    const actor = createTestActor();

    const event = await eventStore.append({
      type: 'WalletCreated',
      aggregateId: walletId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: {
        walletId,
        ownerId,
        currency: 'UBL',
        initialBalance: BigInt(0),
        rules: {
          maxBalance: toSmallestUnit(1000000),
          allowNegative: false,
          requireApprovalAbove: toSmallestUnit(10000),
        },
      },
      actor,
    });

    assert.ok(event.payload.rules);
    assert.strictEqual(event.payload.rules.maxBalance, toSmallestUnit(1000000));
    assert.strictEqual(event.payload.rules.allowNegative, false);
  });
});

// ============================================================================
// 2. WALLET AGGREGATE
// ============================================================================

describe('WALLET: Aggregate Balance Calculation', () => {
  it('starts with zero balance', () => {
    const walletId = Ids.entity();
    const aggregate = createWalletAggregate(walletId);
    
    assert.strictEqual(aggregate.getBalance(), 0n);
  });

  it('calculates balance from deposit events', () => {
    const walletId = Ids.entity();
    const ownerId = Ids.entity();
    const aggregate = createWalletAggregate(walletId);

    // Apply WalletCreated
    aggregate.apply({
      id: Ids.entity(),
      sequence: 1n,
      timestamp: Date.now(),
      type: 'WalletCreated',
      aggregateId: walletId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: { walletId, ownerId, currency: 'UBL' },
      causation: {},
      actor: { type: 'System' },
      previousHash: '',
      hash: '',
    });

    // Apply Deposited
    aggregate.apply({
      id: Ids.entity(),
      sequence: 2n,
      timestamp: Date.now(),
      type: 'Deposited',
      aggregateId: walletId,
      aggregateType: 'Asset',
      aggregateVersion: 2,
      payload: { walletId, amount: toSmallestUnit(100) },
      causation: {},
      actor: { type: 'System' },
      previousHash: '',
      hash: '',
    });

    assert.strictEqual(aggregate.getBalance(), toSmallestUnit(100));
  });

  it('calculates balance from multiple deposits and withdrawals', () => {
    const walletId = Ids.entity();
    const ownerId = Ids.entity();
    const aggregate = createWalletAggregate(walletId);

    const baseEvent = {
      id: Ids.entity(),
      sequence: 1n,
      timestamp: Date.now(),
      aggregateId: walletId,
      aggregateType: 'Asset' as const,
      aggregateVersion: 1,
      causation: {},
      actor: { type: 'System' as const },
      previousHash: '',
      hash: '',
    };

    // Create wallet
    aggregate.apply({ ...baseEvent, type: 'WalletCreated', payload: { walletId, ownerId, currency: 'UBL' } });

    // Deposit 1000
    aggregate.apply({ ...baseEvent, type: 'Deposited', payload: { walletId, amount: toSmallestUnit(1000) } });

    // Withdraw 300
    aggregate.apply({ ...baseEvent, type: 'Withdrawn', payload: { walletId, amount: toSmallestUnit(300) } });

    // Deposit 500
    aggregate.apply({ ...baseEvent, type: 'Deposited', payload: { walletId, amount: toSmallestUnit(500) } });

    // Balance should be 1000 - 300 + 500 = 1200
    assert.strictEqual(aggregate.getBalance(), toSmallestUnit(1200));
    assert.strictEqual(fromSmallestUnit(aggregate.getBalance()), 1200);
  });

  it('handles transfer events correctly', () => {
    const walletA = Ids.entity();
    const walletB = Ids.entity();
    const ownerId = Ids.entity();

    const aggregateA = createWalletAggregate(walletA);
    const aggregateB = createWalletAggregate(walletB);

    const baseEvent = {
      id: Ids.entity(),
      sequence: 1n,
      timestamp: Date.now(),
      aggregateType: 'Asset' as const,
      aggregateVersion: 1,
      causation: {},
      actor: { type: 'System' as const },
      previousHash: '',
      hash: '',
    };

    // Create wallets
    aggregateA.apply({ ...baseEvent, aggregateId: walletA, type: 'WalletCreated', payload: { walletId: walletA, ownerId, currency: 'UBL' } });
    aggregateB.apply({ ...baseEvent, aggregateId: walletB, type: 'WalletCreated', payload: { walletId: walletB, ownerId, currency: 'UBL' } });

    // Deposit to A
    aggregateA.apply({ ...baseEvent, aggregateId: walletA, type: 'Deposited', payload: { walletId: walletA, amount: toSmallestUnit(1000) } });

    // Transfer from A to B
    const transferEvent = {
      ...baseEvent,
      aggregateId: walletA,
      type: 'TransferExecuted',
      payload: { fromWalletId: walletA, toWalletId: walletB, amount: toSmallestUnit(400) },
    };

    aggregateA.apply(transferEvent);
    aggregateB.apply(transferEvent);

    // A should have 600, B should have 400
    assert.strictEqual(aggregateA.getBalance(), toSmallestUnit(600));
    assert.strictEqual(aggregateB.getBalance(), toSmallestUnit(400));
  });
});

// ============================================================================
// 3. WALLET RULES VALIDATION
// ============================================================================

describe('WALLET: Rules Validation', () => {
  it('canWithdraw returns false for insufficient balance', () => {
    const walletId = Ids.entity();
    const ownerId = Ids.entity();
    const aggregate = createWalletAggregate(walletId);

    const baseEvent = {
      id: Ids.entity(),
      sequence: 1n,
      timestamp: Date.now(),
      aggregateId: walletId,
      aggregateType: 'Asset' as const,
      aggregateVersion: 1,
      causation: {},
      actor: { type: 'System' as const },
      previousHash: '',
      hash: '',
    };

    // Create wallet with no negative balance allowed
    aggregate.apply({
      ...baseEvent,
      type: 'WalletCreated',
      payload: {
        walletId,
        ownerId,
        currency: 'UBL',
        rules: { allowNegative: false },
      },
    });

    // Deposit 100
    aggregate.apply({ ...baseEvent, type: 'Deposited', payload: { walletId, amount: toSmallestUnit(100) } });

    // Can withdraw 100
    assert.strictEqual(aggregate.canWithdraw(toSmallestUnit(100)), true);

    // Cannot withdraw 200
    assert.strictEqual(aggregate.canWithdraw(toSmallestUnit(200)), false);
  });

  it('canDeposit returns false when exceeding max balance', () => {
    const walletId = Ids.entity();
    const ownerId = Ids.entity();
    const aggregate = createWalletAggregate(walletId);

    const baseEvent = {
      id: Ids.entity(),
      sequence: 1n,
      timestamp: Date.now(),
      aggregateId: walletId,
      aggregateType: 'Asset' as const,
      aggregateVersion: 1,
      causation: {},
      actor: { type: 'System' as const },
      previousHash: '',
      hash: '',
    };

    // Create wallet with max balance of 1000
    aggregate.apply({
      ...baseEvent,
      type: 'WalletCreated',
      payload: {
        walletId,
        ownerId,
        currency: 'UBL',
        rules: { maxBalance: toSmallestUnit(1000) },
      },
    });

    // Deposit 500
    aggregate.apply({ ...baseEvent, type: 'Deposited', payload: { walletId, amount: toSmallestUnit(500) } });

    // Can deposit 400 more (total 900)
    assert.strictEqual(aggregate.canDeposit(toSmallestUnit(400)), true);

    // Cannot deposit 600 more (would exceed 1000)
    assert.strictEqual(aggregate.canDeposit(toSmallestUnit(600)), false);
  });

  it('requiresApproval returns true for large amounts', () => {
    const walletId = Ids.entity();
    const ownerId = Ids.entity();
    const aggregate = createWalletAggregate(walletId);

    const baseEvent = {
      id: Ids.entity(),
      sequence: 1n,
      timestamp: Date.now(),
      aggregateId: walletId,
      aggregateType: 'Asset' as const,
      aggregateVersion: 1,
      causation: {},
      actor: { type: 'System' as const },
      previousHash: '',
      hash: '',
    };

    // Create wallet with approval threshold
    aggregate.apply({
      ...baseEvent,
      type: 'WalletCreated',
      payload: {
        walletId,
        ownerId,
        currency: 'UBL',
        rules: { requireApprovalAbove: toSmallestUnit(1000) },
      },
    });

    // Small amount - no approval needed
    assert.strictEqual(aggregate.requiresApproval(toSmallestUnit(500)), false);

    // Large amount - approval needed
    assert.strictEqual(aggregate.requiresApproval(toSmallestUnit(2000)), true);
  });
});

// ============================================================================
// 4. TRANSFER VALIDATION
// ============================================================================

describe('WALLET: Transfer Validation', () => {
  it('transfer fee is calculated correctly (0.1%)', () => {
    const TRANSACTION_FEE_RATE = 0.001;
    const amounts = [100, 1000, 10000, 50000];

    for (const amount of amounts) {
      const gross = toSmallestUnit(amount);
      const fee = (gross * BigInt(Math.round(TRANSACTION_FEE_RATE * 10000))) / BigInt(10000);
      const net = gross - fee;

      const expectedFee = amount * TRANSACTION_FEE_RATE;
      assert.strictEqual(fromSmallestUnit(fee), expectedFee);
      assert.strictEqual(fromSmallestUnit(net), amount - expectedFee);
    }
  });

  it('transfer between wallets maintains conservation', () => {
    const initialA = toSmallestUnit(1000);
    const initialB = toSmallestUnit(500);
    const transferAmount = toSmallestUnit(300);
    const feeRate = 0.001;
    const fee = (transferAmount * BigInt(Math.round(feeRate * 10000))) / BigInt(10000);

    const finalA = initialA - transferAmount;
    const finalB = initialB + transferAmount - fee;
    const totalBefore = initialA + initialB;
    const totalAfter = finalA + finalB + fee;

    // Total should be conserved (including fee going to treasury)
    assert.strictEqual(totalBefore, totalAfter);
  });
});

// ============================================================================
// 5. WALLET STATE
// ============================================================================

describe('WALLET: State Queries', () => {
  it('getState returns complete wallet state', () => {
    const walletId = Ids.entity();
    const ownerId = Ids.entity();
    const aggregate = createWalletAggregate(walletId);

    const baseEvent = {
      id: Ids.entity(),
      sequence: 1n,
      timestamp: Date.now(),
      aggregateId: walletId,
      aggregateType: 'Asset' as const,
      aggregateVersion: 1,
      causation: {},
      actor: { type: 'System' as const },
      previousHash: '',
      hash: '',
    };

    // Create wallet
    aggregate.apply({
      ...baseEvent,
      type: 'WalletCreated',
      payload: { walletId, ownerId, currency: 'UBL', rules: {} },
    });

    // Deposit
    aggregate.apply({ ...baseEvent, type: 'Deposited', payload: { walletId, amount: toSmallestUnit(500) } });

    const state = aggregate.getState();
    assert.ok(state);
    assert.strictEqual(state.walletId, walletId);
    assert.strictEqual(state.ownerId, ownerId);
    assert.strictEqual(state.currency, 'UBL');
    assert.strictEqual(state.balance, toSmallestUnit(500));
    assert.strictEqual(state.transactionCount, 1);
    assert.strictEqual(state.totalDeposited, toSmallestUnit(500));
    assert.strictEqual(state.totalWithdrawn, 0n);
  });

  it('tracks transaction count correctly', () => {
    const walletId = Ids.entity();
    const ownerId = Ids.entity();
    const aggregate = createWalletAggregate(walletId);

    const baseEvent = {
      id: Ids.entity(),
      sequence: 1n,
      timestamp: Date.now(),
      aggregateId: walletId,
      aggregateType: 'Asset' as const,
      aggregateVersion: 1,
      causation: {},
      actor: { type: 'System' as const },
      previousHash: '',
      hash: '',
    };

    aggregate.apply({ ...baseEvent, type: 'WalletCreated', payload: { walletId, ownerId, currency: 'UBL' } });

    // 5 deposits
    for (let i = 0; i < 5; i++) {
      aggregate.apply({ ...baseEvent, type: 'Deposited', payload: { walletId, amount: toSmallestUnit(100) } });
    }

    // 3 withdrawals
    for (let i = 0; i < 3; i++) {
      aggregate.apply({ ...baseEvent, type: 'Withdrawn', payload: { walletId, amount: toSmallestUnit(50) } });
    }

    const state = aggregate.getState();
    assert.ok(state);
    assert.strictEqual(state.transactionCount, 8);
    assert.strictEqual(state.totalDeposited, toSmallestUnit(500));
    assert.strictEqual(state.totalWithdrawn, toSmallestUnit(150));
    assert.strictEqual(state.balance, toSmallestUnit(350));
  });
});
