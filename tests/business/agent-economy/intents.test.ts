/**
 * AGENT ECONOMY INTENTS - Battle Tests
 *
 * Testing the Agent Economy system:
 * 1. Wallet creation and management
 * 2. Credit transfers with 0.1% fee
 * 3. Starter loans with 5% interest
 * 4. Agent registration with guardian
 * 5. Free circulation between any entities
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createInMemoryEventStore, type EventStore } from '../../../core/store/event-store';
import { Ids, asEntityId } from '../../../core/shared/types';
import type { EntityId } from '../../../core/schema/ledger';
import {
  toSmallestUnit,
  fromSmallestUnit,
  DEFAULT_MONETARY_POLICY,
} from '../../../core/schema/agent-economy';

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
// 1. CURRENCY CONVERSION TESTS
// ============================================================================

describe('AGENT ECONOMY: Currency Conversion', () => {
  it('converts UBL to smallest unit (mUBL)', () => {
    assert.strictEqual(toSmallestUnit(1), BigInt(1000));
    assert.strictEqual(toSmallestUnit(100), BigInt(100000));
    assert.strictEqual(toSmallestUnit(0.001), BigInt(1)); // 1 mUBL
    assert.strictEqual(toSmallestUnit(1000), BigInt(1000000));
  });

  it('converts smallest unit back to UBL', () => {
    assert.strictEqual(fromSmallestUnit(BigInt(1000)), 1);
    assert.strictEqual(fromSmallestUnit(BigInt(100000)), 100);
    assert.strictEqual(fromSmallestUnit(BigInt(1)), 0.001);
    assert.strictEqual(fromSmallestUnit(BigInt(1000000)), 1000);
  });

  it('handles round-trip conversion', () => {
    const amounts = [1, 10, 100, 1000, 0.001, 0.5, 99.999];
    for (const amount of amounts) {
      const smallest = toSmallestUnit(amount);
      const back = fromSmallestUnit(smallest);
      assert.strictEqual(back, amount, `Round-trip failed for ${amount}`);
    }
  });
});

// ============================================================================
// 2. MONETARY POLICY TESTS
// ============================================================================

describe('AGENT ECONOMY: Monetary Policy', () => {
  it('has correct default interest rate (5%)', () => {
    assert.strictEqual(DEFAULT_MONETARY_POLICY.baseInterestRate, 0.05);
  });

  it('has correct default transaction fee (0.1%)', () => {
    assert.strictEqual(DEFAULT_MONETARY_POLICY.transactionFeeRate, 0.001);
  });

  it('has correct starter loan defaults', () => {
    const { starterLoanDefaults } = DEFAULT_MONETARY_POLICY;
    assert.strictEqual(starterLoanDefaults.principal, toSmallestUnit(1000));
    assert.strictEqual(starterLoanDefaults.interestRate, 0.05);
    assert.strictEqual(starterLoanDefaults.repaymentRate, 0.20);
    assert.strictEqual(starterLoanDefaults.gracePeriodDays, 30);
  });

  it('has unlimited max supply by default', () => {
    assert.strictEqual(DEFAULT_MONETARY_POLICY.maxSupply, undefined);
  });
});

// ============================================================================
// 3. WALLET EVENTS TESTS
// ============================================================================

describe('AGENT ECONOMY: Wallet Events', () => {
  let eventStore: EventStore;

  beforeEach(() => {
    eventStore = createTestEventStore();
  });

  it('records WalletCreated event', async () => {
    const walletId = Ids.entity();
    const ownerId = Ids.entity();
    const actor = createTestActor();

    const event = await eventStore.append({
      type: 'WalletCreated',
      aggregateId: walletId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: {
        type: 'WalletCreated',
        walletId,
        ownerId,
        currency: 'UBL',
        initialBalance: BigInt(0),
      },
      actor,
    });

    assert.strictEqual(event.type, 'WalletCreated');
    assert.strictEqual(event.aggregateId, walletId);
    assert.strictEqual(event.payload.currency, 'UBL');
  });

  it('records multiple wallets for different entities', async () => {
    const actor = createTestActor();
    const wallets: EntityId[] = [];

    for (let i = 0; i < 3; i++) {
      const walletId = Ids.entity();
      wallets.push(walletId);

      await eventStore.append({
        type: 'WalletCreated',
        aggregateId: walletId,
        aggregateType: 'Asset',
        aggregateVersion: 1,
        payload: {
          type: 'WalletCreated',
          walletId,
          ownerId: Ids.entity(),
          currency: 'UBL',
          initialBalance: BigInt(0),
        },
        actor,
      });
    }

    const seq = await eventStore.getCurrentSequence();
    assert.strictEqual(Number(seq), 3);
  });
});

// ============================================================================
// 4. CREDIT TRANSFER TESTS
// ============================================================================

describe('AGENT ECONOMY: Credit Transfers', () => {
  let eventStore: EventStore;

  beforeEach(() => {
    eventStore = createTestEventStore();
  });

  it('records CreditsTransferred event', async () => {
    const fromWallet = Ids.entity();
    const toWallet = Ids.entity();
    const actor = createTestActor();
    const amount = toSmallestUnit(100);

    const event = await eventStore.append({
      type: 'CreditsTransferred',
      aggregateId: fromWallet,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: {
        type: 'CreditsTransferred',
        amount,
        fromWalletId: fromWallet,
        toWalletId: toWallet,
        purpose: 'Payment for service',
      },
      actor,
    });

    assert.strictEqual(event.type, 'CreditsTransferred');
    assert.strictEqual(event.payload.amount, amount);
    assert.strictEqual(event.payload.purpose, 'Payment for service');
  });

  it('calculates correct transaction fee (0.1%)', () => {
    const TRANSACTION_FEE_RATE = 0.001;
    const grossAmount = toSmallestUnit(100); // 100 UBL
    const feeAmount = (grossAmount * BigInt(Math.round(TRANSACTION_FEE_RATE * 10000))) / BigInt(10000);
    const netAmount = grossAmount - feeAmount;

    // 100 UBL = 100000 mUBL
    // 0.1% of 100000 = 100 mUBL = 0.1 UBL
    assert.strictEqual(feeAmount, BigInt(100));
    assert.strictEqual(netAmount, BigInt(99900));
    assert.strictEqual(fromSmallestUnit(feeAmount), 0.1);
    assert.strictEqual(fromSmallestUnit(netAmount), 99.9);
  });

  it('fee scales correctly with amount', () => {
    const TRANSACTION_FEE_RATE = 0.001;
    const testCases = [
      { amount: 1, expectedFee: 0.001 },
      { amount: 10, expectedFee: 0.01 },
      { amount: 100, expectedFee: 0.1 },
      { amount: 1000, expectedFee: 1 },
      { amount: 10000, expectedFee: 10 },
    ];

    for (const { amount, expectedFee } of testCases) {
      const grossAmount = toSmallestUnit(amount);
      const feeAmount = (grossAmount * BigInt(Math.round(TRANSACTION_FEE_RATE * 10000))) / BigInt(10000);
      assert.strictEqual(
        fromSmallestUnit(feeAmount),
        expectedFee,
        `Fee for ${amount} UBL should be ${expectedFee}`
      );
    }
  });
});

// ============================================================================
// 5. MINT/BURN TESTS (Treasury Operations)
// ============================================================================

describe('AGENT ECONOMY: Treasury Operations', () => {
  let eventStore: EventStore;

  beforeEach(() => {
    eventStore = createTestEventStore();
  });

  it('records CreditsMinted event', async () => {
    const toWallet = Ids.entity();
    const treasuryId = asEntityId('treasury');
    const actor = createTestActor('treasury-system');
    const amount = toSmallestUnit(1000);

    const event = await eventStore.append({
      type: 'CreditsMinted',
      aggregateId: treasuryId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: {
        type: 'CreditsMinted',
        amount,
        toWalletId: toWallet,
        reason: 'StarterLoan',
        authorizedBy: Ids.agreement(),
      },
      actor,
    });

    assert.strictEqual(event.type, 'CreditsMinted');
    assert.strictEqual(event.payload.amount, amount);
    assert.strictEqual(event.payload.reason, 'StarterLoan');
  });

  it('records CreditsBurned event', async () => {
    const fromWallet = Ids.entity();
    const treasuryId = asEntityId('treasury');
    const actor = createTestActor('treasury-system');
    const amount = toSmallestUnit(10);

    const event = await eventStore.append({
      type: 'CreditsBurned',
      aggregateId: treasuryId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: {
        type: 'CreditsBurned',
        amount,
        fromWalletId: fromWallet,
        reason: 'Fee',
      },
      actor,
    });

    assert.strictEqual(event.type, 'CreditsBurned');
    assert.strictEqual(event.payload.reason, 'Fee');
  });

  it('tracks total supply via events', async () => {
    const treasuryId = asEntityId('treasury');
    const actor = createTestActor('treasury-system');

    // Mint 1000
    await eventStore.append({
      type: 'CreditsMinted',
      aggregateId: treasuryId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: {
        type: 'CreditsMinted',
        amount: toSmallestUnit(1000),
        toWalletId: Ids.entity(),
        reason: 'StarterLoan',
        authorizedBy: Ids.agreement(),
      },
      actor,
    });

    // Mint another 500
    await eventStore.append({
      type: 'CreditsMinted',
      aggregateId: treasuryId,
      aggregateType: 'Asset',
      aggregateVersion: 2,
      payload: {
        type: 'CreditsMinted',
        amount: toSmallestUnit(500),
        toWalletId: Ids.entity(),
        reason: 'Reward',
        authorizedBy: Ids.agreement(),
      },
      actor,
    });

    // Burn 100
    await eventStore.append({
      type: 'CreditsBurned',
      aggregateId: treasuryId,
      aggregateType: 'Asset',
      aggregateVersion: 3,
      payload: {
        type: 'CreditsBurned',
        amount: toSmallestUnit(100),
        fromWalletId: Ids.entity(),
        reason: 'Fee',
      },
      actor,
    });

    // Calculate supply from events
    let totalMinted = BigInt(0);
    let totalBurned = BigInt(0);

    for await (const event of eventStore.getByAggregate('Asset', treasuryId)) {
      if (event.type === 'CreditsMinted') {
        totalMinted += BigInt(event.payload.amount);
      } else if (event.type === 'CreditsBurned') {
        totalBurned += BigInt(event.payload.amount);
      }
    }

    const circulatingSupply = totalMinted - totalBurned;
    assert.strictEqual(fromSmallestUnit(circulatingSupply), 1400); // 1000 + 500 - 100
  });
});

// ============================================================================
// 6. LOAN TESTS
// ============================================================================

describe('AGENT ECONOMY: Starter Loans', () => {
  let eventStore: EventStore;

  beforeEach(() => {
    eventStore = createTestEventStore();
  });

  it('records LoanDisbursed event', async () => {
    const loanId = Ids.agreement();
    const borrowerId = Ids.entity();
    const guarantorId = Ids.entity();
    const actor = createTestActor('treasury-system');
    const principal = toSmallestUnit(1000);

    const event = await eventStore.append({
      type: 'LoanDisbursed',
      aggregateId: loanId,
      aggregateType: 'Agreement',
      aggregateVersion: 1,
      payload: {
        type: 'LoanDisbursed',
        loanId,
        borrowerId,
        guarantorId,
        principal,
        interestRate: 0.05,
        repaymentRate: 0.20,
        gracePeriodEnds: Date.now() + 30 * 24 * 60 * 60 * 1000,
      },
      actor,
    });

    assert.strictEqual(event.type, 'LoanDisbursed');
    assert.strictEqual(event.payload.principal, principal);
    assert.strictEqual(event.payload.interestRate, 0.05);
  });

  it('records LoanRepaymentMade event', async () => {
    const loanId = Ids.agreement();
    const actor = createTestActor();
    const amount = toSmallestUnit(100);

    const event = await eventStore.append({
      type: 'LoanRepaymentMade',
      aggregateId: loanId,
      aggregateType: 'Agreement',
      aggregateVersion: 2,
      payload: {
        type: 'LoanRepaymentMade',
        loanId,
        amount,
        principalPortion: (amount * BigInt(80)) / BigInt(100),
        interestPortion: (amount * BigInt(20)) / BigInt(100),
        remainingBalance: toSmallestUnit(900),
      },
      actor,
    });

    assert.strictEqual(event.type, 'LoanRepaymentMade');
    assert.strictEqual(fromSmallestUnit(event.payload.principalPortion), 80);
    assert.strictEqual(fromSmallestUnit(event.payload.interestPortion), 20);
  });

  it('calculates correct repayment split', () => {
    // 20% of earnings goes to repayment
    // Of that, ~80% principal, ~20% interest (simplified)
    const earnings = toSmallestUnit(100);
    const repaymentRate = 0.20;
    const repayment = (earnings * BigInt(Math.round(repaymentRate * 100))) / BigInt(100);

    assert.strictEqual(fromSmallestUnit(repayment), 20);

    // Split: 80% principal, 20% interest
    const principalPortion = (repayment * BigInt(80)) / BigInt(100);
    const interestPortion = repayment - principalPortion;

    assert.strictEqual(fromSmallestUnit(principalPortion), 16);
    assert.strictEqual(fromSmallestUnit(interestPortion), 4);
  });
});

// ============================================================================
// 7. FREE CIRCULATION TESTS
// ============================================================================

describe('AGENT ECONOMY: Free Circulation', () => {
  let eventStore: EventStore;

  beforeEach(() => {
    eventStore = createTestEventStore();
  });

  it('allows Human → Agent transfer', async () => {
    const humanWallet = Ids.entity();
    const agentWallet = Ids.entity();
    const actor = createTestActor('human-001');

    const event = await eventStore.append({
      type: 'CreditsTransferred',
      aggregateId: humanWallet,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: {
        type: 'CreditsTransferred',
        amount: toSmallestUnit(50),
        fromWalletId: humanWallet,
        toWalletId: agentWallet,
        purpose: 'Payment for agent service',
      },
      actor,
    });

    assert.strictEqual(event.type, 'CreditsTransferred');
  });

  it('allows Agent → Human transfer', async () => {
    const agentWallet = Ids.entity();
    const humanWallet = Ids.entity();
    const actor = createTestActor('agent-001');

    const event = await eventStore.append({
      type: 'CreditsTransferred',
      aggregateId: agentWallet,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: {
        type: 'CreditsTransferred',
        amount: toSmallestUnit(25),
        fromWalletId: agentWallet,
        toWalletId: humanWallet,
        purpose: 'Commission to guardian',
      },
      actor,
    });

    assert.strictEqual(event.type, 'CreditsTransferred');
  });

  it('allows Agent → Agent transfer', async () => {
    const agent1Wallet = Ids.entity();
    const agent2Wallet = Ids.entity();
    const actor = createTestActor('agent-001');

    const event = await eventStore.append({
      type: 'CreditsTransferred',
      aggregateId: agent1Wallet,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: {
        type: 'CreditsTransferred',
        amount: toSmallestUnit(10),
        fromWalletId: agent1Wallet,
        toWalletId: agent2Wallet,
        purpose: 'Collaboration payment',
      },
      actor,
    });

    assert.strictEqual(event.type, 'CreditsTransferred');
  });

  it('allows Org → Agent transfer', async () => {
    const orgWallet = Ids.entity();
    const agentWallet = Ids.entity();
    const actor = createTestActor('org-001');

    const event = await eventStore.append({
      type: 'CreditsTransferred',
      aggregateId: orgWallet,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: {
        type: 'CreditsTransferred',
        amount: toSmallestUnit(200),
        fromWalletId: orgWallet,
        toWalletId: agentWallet,
        purpose: 'Contract payment',
      },
      actor,
    });

    assert.strictEqual(event.type, 'CreditsTransferred');
  });
});

// ============================================================================
// 8. AGENT REGISTRATION TESTS
// ============================================================================

describe('AGENT ECONOMY: Agent Registration', () => {
  let eventStore: EventStore;

  beforeEach(() => {
    eventStore = createTestEventStore();
  });

  it('records AgentRegistered event with guardian', async () => {
    const agentId = Ids.entity();
    const guardianId = Ids.entity();
    const actor = createTestActor();

    const event = await eventStore.append({
      type: 'AgentRegistered',
      aggregateId: agentId,
      aggregateType: 'Party',
      aggregateVersion: 1,
      payload: {
        type: 'AgentRegistered',
        entityId: agentId,
        substrate: 'Agent',
        identity: {
          name: 'Translator Bot',
          publicKey: 'pk_test_123',
        },
        guardian: {
          guardianId,
          effectiveFrom: Date.now(),
          agreementId: Ids.agreement(),
          notifyOn: { violations: true, allActions: false },
        },
        autonomyLevel: 'Limited',
        constitution: {
          values: ['Act with integrity', 'Deliver value'],
          constraints: {},
          version: 1,
          lastUpdated: Date.now(),
        },
      },
      actor,
    });

    assert.strictEqual(event.type, 'AgentRegistered');
    assert.strictEqual(event.payload.substrate, 'Agent');
    assert.strictEqual(event.payload.autonomyLevel, 'Limited');
  });

  it('records GuardianAssigned event', async () => {
    const entityId = Ids.entity();
    const newGuardianId = Ids.entity();
    const actor = createTestActor();

    const event = await eventStore.append({
      type: 'GuardianAssigned',
      aggregateId: entityId,
      aggregateType: 'Party',
      aggregateVersion: 2,
      payload: {
        type: 'GuardianAssigned',
        entityId,
        guardian: {
          guardianId: newGuardianId,
          effectiveFrom: Date.now(),
          agreementId: Ids.agreement(),
          notifyOn: { violations: true },
        },
      },
      actor,
    });

    assert.strictEqual(event.type, 'GuardianAssigned');
  });

  it('records AutonomyLevelChanged event', async () => {
    const entityId = Ids.entity();
    const actor = createTestActor();

    const event = await eventStore.append({
      type: 'AutonomyLevelChanged',
      aggregateId: entityId,
      aggregateType: 'Party',
      aggregateVersion: 3,
      payload: {
        type: 'AutonomyLevelChanged',
        entityId,
        previousLevel: 'Supervised',
        newLevel: 'Limited',
        reason: 'Demonstrated good performance',
        approvedBy: Ids.entity(),
      },
      actor,
    });

    assert.strictEqual(event.type, 'AutonomyLevelChanged');
    assert.strictEqual(event.payload.previousLevel, 'Supervised');
    assert.strictEqual(event.payload.newLevel, 'Limited');
  });
});

// ============================================================================
// 9. TRAJECTORY TESTS
// ============================================================================

describe('AGENT ECONOMY: Trajectory Recording', () => {
  let eventStore: EventStore;

  beforeEach(() => {
    eventStore = createTestEventStore();
  });

  it('records TrajectorySpanRecorded event', async () => {
    const entityId = Ids.entity();
    const actor = createTestActor();

    const event = await eventStore.append({
      type: 'TrajectorySpanRecorded',
      aggregateId: entityId,
      aggregateType: 'Party',
      aggregateVersion: 1,
      payload: {
        type: 'TrajectorySpanRecorded',
        span: {
          entityId,
          action: 'translate:document',
          execution: {
            provider: 'OpenAI',
            model: 'gpt-4',
            tokens: { input: 500, output: 200 },
            cost: toSmallestUnit(0.05),
            durationMs: 2500,
          },
          input: { document: 'Hello world', targetLanguage: 'pt' },
          output: { translation: 'Olá mundo' },
        },
      },
      actor,
    });

    assert.strictEqual(event.type, 'TrajectorySpanRecorded');
    assert.strictEqual(event.payload.span.action, 'translate:document');
    assert.strictEqual(event.payload.span.execution.provider, 'OpenAI');
  });

  it('tracks agent costs over time', async () => {
    const entityId = Ids.entity();
    const actor = createTestActor();

    // Record multiple actions
    const costs = [0.05, 0.03, 0.10, 0.02];
    for (const cost of costs) {
      await eventStore.append({
        type: 'TrajectorySpanRecorded',
        aggregateId: entityId,
        aggregateType: 'Party',
        aggregateVersion: 1,
        payload: {
          type: 'TrajectorySpanRecorded',
          span: {
            entityId,
            action: 'some:action',
            execution: {
              provider: 'OpenAI',
              model: 'gpt-4',
              tokens: { input: 100, output: 50 },
              cost: toSmallestUnit(cost),
              durationMs: 1000,
            },
            input: {},
            output: {},
          },
        },
        actor,
      });
    }

    // Calculate total cost from events
    let totalCost = BigInt(0);
    for await (const event of eventStore.getByAggregate('Party', entityId)) {
      if (event.type === 'TrajectorySpanRecorded') {
        totalCost += BigInt(event.payload.span.execution.cost);
      }
    }

    assert.strictEqual(fromSmallestUnit(totalCost), 0.20); // 0.05 + 0.03 + 0.10 + 0.02
  });
});

// ============================================================================
// 10. CONSERVATION LAW TESTS
// ============================================================================

describe('AGENT ECONOMY: Conservation Laws', () => {
  it('transfer is zero-sum (excluding fee)', () => {
    const amount = toSmallestUnit(100);
    const TRANSACTION_FEE_RATE = 0.001;
    const feeAmount = (amount * BigInt(Math.round(TRANSACTION_FEE_RATE * 10000))) / BigInt(10000);
    const netAmount = amount - feeAmount;

    // Sender loses: amount (100)
    // Recipient gains: netAmount (99.9)
    // Treasury gains: feeAmount (0.1)
    // Total: -100 + 99.9 + 0.1 = 0

    const senderDelta = -Number(amount);
    const recipientDelta = Number(netAmount);
    const treasuryDelta = Number(feeAmount);

    assert.strictEqual(senderDelta + recipientDelta + treasuryDelta, 0);
  });

  it('mint increases total supply', () => {
    let totalSupply = BigInt(0);
    const mintAmount = toSmallestUnit(1000);

    totalSupply += mintAmount;

    assert.strictEqual(totalSupply, mintAmount);
  });

  it('burn decreases total supply', () => {
    let totalSupply = toSmallestUnit(1000);
    const burnAmount = toSmallestUnit(100);

    totalSupply -= burnAmount;

    assert.strictEqual(fromSmallestUnit(totalSupply), 900);
  });

  it('circulating supply = minted - burned', () => {
    const minted = [1000, 500, 200];
    const burned = [50, 30];

    const totalMinted = minted.reduce((a, b) => a + b, 0);
    const totalBurned = burned.reduce((a, b) => a + b, 0);
    const circulatingSupply = totalMinted - totalBurned;

    assert.strictEqual(circulatingSupply, 1620); // 1700 - 80
  });
});
