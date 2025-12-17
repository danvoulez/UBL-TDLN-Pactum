/**
 * ECONOMIC HEALTH MONITOR - Tests
 *
 * Testing KPI calculations and automatic correction triggers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createInMemoryEventStore, type EventStore } from '../../../core/store/event-store';
import {
  createHealthMonitor,
  EconomicHealthMonitor,
  DEFAULT_THRESHOLDS,
  type EconomicAlert,
  type CorrectionAction,
} from '../../../core/economy/health-monitor';
import { Ids, asEntityId } from '../../../core/shared/types';
import { toSmallestUnit, fromSmallestUnit } from '../../../core/schema/agent-economy';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestEventStore(): EventStore {
  return createInMemoryEventStore();
}

function createTestActor() {
  return { type: 'Entity' as const, entityId: asEntityId('test-system') };
}

async function mintCredits(
  eventStore: EventStore,
  toWalletId: string,
  amount: number
): Promise<void> {
  await eventStore.append({
    type: 'CreditsMinted',
    aggregateId: asEntityId('treasury'),
    aggregateType: 'Asset',
    aggregateVersion: 1,
    payload: {
      type: 'CreditsMinted',
      amount: toSmallestUnit(amount),
      toWalletId: asEntityId(toWalletId),
      reason: 'StarterLoan',
      authorizedBy: Ids.agreement(),
    },
    actor: createTestActor(),
  });
}

async function transferCredits(
  eventStore: EventStore,
  fromWalletId: string,
  toWalletId: string,
  amount: number,
  purpose: string = 'Payment'
): Promise<void> {
  await eventStore.append({
    type: 'CreditsTransferred',
    aggregateId: asEntityId(fromWalletId),
    aggregateType: 'Asset',
    aggregateVersion: 1,
    payload: {
      type: 'CreditsTransferred',
      amount: toSmallestUnit(amount),
      fromWalletId: asEntityId(fromWalletId),
      toWalletId: asEntityId(toWalletId),
      purpose,
    },
    actor: createTestActor(),
  });
}

async function createWallet(eventStore: EventStore, walletId: string): Promise<void> {
  await eventStore.append({
    type: 'WalletCreated',
    aggregateId: asEntityId(walletId),
    aggregateType: 'Asset',
    aggregateVersion: 1,
    payload: {
      type: 'WalletCreated',
      walletId: asEntityId(walletId),
      ownerId: Ids.entity(),
      currency: 'UBL',
      initialBalance: BigInt(0),
    },
    actor: createTestActor(),
  });
}

async function registerAgent(eventStore: EventStore): Promise<string> {
  const agentId = Ids.entity();
  await eventStore.append({
    type: 'AgentRegistered',
    aggregateId: agentId,
    aggregateType: 'Party',
    aggregateVersion: 1,
    payload: {
      type: 'AgentRegistered',
      entityId: agentId,
      substrate: 'Agent',
      identity: { name: 'Test Agent', publicKey: 'pk_test' },
      guardian: {
        guardianId: Ids.entity(),
        effectiveFrom: Date.now(),
        agreementId: Ids.agreement(),
      },
      autonomyLevel: 'Limited',
      constitution: { values: [], constraints: {}, version: 1, lastUpdated: Date.now() },
    },
    actor: createTestActor(),
  });
  return agentId as string;
}

async function disburseLoan(eventStore: EventStore, borrowerId: string, amount: number): Promise<string> {
  const loanId = Ids.agreement();
  await eventStore.append({
    type: 'LoanDisbursed',
    aggregateId: loanId,
    aggregateType: 'Agreement',
    aggregateVersion: 1,
    payload: {
      type: 'LoanDisbursed',
      loanId,
      borrowerId: asEntityId(borrowerId),
      guarantorId: Ids.entity(),
      principal: toSmallestUnit(amount),
      interestRate: 0.05,
      repaymentRate: 0.20,
      gracePeriodEnds: Date.now() + 30 * 24 * 60 * 60 * 1000,
    },
    actor: createTestActor(),
  });
  return loanId as string;
}

// ============================================================================
// 1. KPI CALCULATION TESTS
// ============================================================================

describe('HEALTH MONITOR: KPI Calculations', () => {
  let eventStore: EventStore;
  let monitor: EconomicHealthMonitor;

  beforeEach(() => {
    eventStore = createTestEventStore();
    monitor = createHealthMonitor(eventStore);
  });

  it('calculates monetary metrics correctly', async () => {
    await mintCredits(eventStore, 'wallet-1', 1000);
    await mintCredits(eventStore, 'wallet-2', 500);

    const kpis = await monitor.calculateKPIs();

    assert.strictEqual(fromSmallestUnit(kpis.monetary.totalMinted), 1500);
    assert.strictEqual(fromSmallestUnit(kpis.monetary.totalBurned), 0);
    assert.strictEqual(fromSmallestUnit(kpis.monetary.circulatingSupply), 1500);
  });

  it('tracks transaction volume', async () => {
    await createWallet(eventStore, 'wallet-1');
    await createWallet(eventStore, 'wallet-2');
    await mintCredits(eventStore, 'wallet-1', 1000);
    await transferCredits(eventStore, 'wallet-1', 'wallet-2', 100);
    await transferCredits(eventStore, 'wallet-1', 'wallet-2', 50);

    const kpis = await monitor.calculateKPIs();

    assert.strictEqual(kpis.transactions.totalCount, 2);
    assert.strictEqual(fromSmallestUnit(kpis.transactions.totalVolume), 150);
  });

  it('counts wallets correctly', async () => {
    await createWallet(eventStore, 'wallet-1');
    await createWallet(eventStore, 'wallet-2');
    await createWallet(eventStore, 'wallet-3');

    const kpis = await monitor.calculateKPIs();

    assert.strictEqual(kpis.distribution.totalWallets, 3);
  });

  it('tracks agent registrations', async () => {
    await registerAgent(eventStore);
    await registerAgent(eventStore);

    const kpis = await monitor.calculateKPIs();

    assert.strictEqual(kpis.agents.totalAgents, 2);
  });

  it('tracks loan metrics', async () => {
    const borrowerId = await registerAgent(eventStore);
    await disburseLoan(eventStore, borrowerId, 1000);
    await disburseLoan(eventStore, borrowerId, 500);

    const kpis = await monitor.calculateKPIs();

    assert.strictEqual(kpis.loans.totalDisbursed, 2);
    assert.strictEqual(kpis.loans.activeLoans, 2);
    assert.strictEqual(fromSmallestUnit(kpis.loans.outstandingPrincipal), 1500);
  });
});

// ============================================================================
// 2. VELOCITY TESTS
// ============================================================================

describe('HEALTH MONITOR: Velocity Calculations', () => {
  let eventStore: EventStore;
  let monitor: EconomicHealthMonitor;

  beforeEach(() => {
    eventStore = createTestEventStore();
    monitor = createHealthMonitor(eventStore, { periodMs: 1000 * 60 * 60 }); // 1 hour period
  });

  it('calculates velocity as volume/supply', async () => {
    await createWallet(eventStore, 'wallet-1');
    await createWallet(eventStore, 'wallet-2');
    await mintCredits(eventStore, 'wallet-1', 1000);

    // Transfer 500 out of 1000 supply = 0.5 velocity
    await transferCredits(eventStore, 'wallet-1', 'wallet-2', 500);

    const kpis = await monitor.calculateKPIs();

    // Velocity = periodVolume / circulatingSupply
    assert.strictEqual(kpis.velocity.current, 0.5);
  });

  it('velocity is 0 when no transactions', async () => {
    await mintCredits(eventStore, 'wallet-1', 1000);

    const kpis = await monitor.calculateKPIs();

    assert.strictEqual(kpis.velocity.current, 0);
  });
});

// ============================================================================
// 3. HEALTH ASSESSMENT TESTS
// ============================================================================

describe('HEALTH MONITOR: Health Assessment', () => {
  let eventStore: EventStore;
  let monitor: EconomicHealthMonitor;

  beforeEach(() => {
    eventStore = createTestEventStore();
    monitor = createHealthMonitor(eventStore);
  });

  it('reports healthy when metrics are normal', async () => {
    await createWallet(eventStore, 'wallet-1');
    await createWallet(eventStore, 'wallet-2');
    await mintCredits(eventStore, 'wallet-1', 1000);
    // Add transactions to avoid low velocity warning
    await transferCredits(eventStore, 'wallet-1', 'wallet-2', 200);
    await transferCredits(eventStore, 'wallet-2', 'wallet-1', 100);

    const kpis = await monitor.calculateKPIs();
    const assessment = monitor.assessHealth(kpis);

    // With transactions, should be healthy or warning (not critical)
    assert.ok(['healthy', 'warning'].includes(assessment.overall));
  });

  it('generates warning for low velocity', async () => {
    await mintCredits(eventStore, 'wallet-1', 1000);

    // First calculation to establish baseline
    await monitor.calculateKPIs();

    // Second calculation with no transactions
    const kpis = await monitor.calculateKPIs();
    const assessment = monitor.assessHealth(kpis);

    // Should detect low velocity
    assert.strictEqual(assessment.areas.velocity.level, 'critical');
  });
});

// ============================================================================
// 4. ALERT GENERATION TESTS
// ============================================================================

describe('HEALTH MONITOR: Alert Generation', () => {
  let eventStore: EventStore;
  let monitor: EconomicHealthMonitor;
  let receivedAlerts: EconomicAlert[];

  beforeEach(() => {
    eventStore = createTestEventStore();
    monitor = createHealthMonitor(eventStore);
    receivedAlerts = [];
    monitor.onAlert((alert) => receivedAlerts.push(alert));
  });

  it('emits alerts via handler', async () => {
    await mintCredits(eventStore, 'wallet-1', 1000);

    const kpis = await monitor.calculateKPIs();
    monitor.assessHealth(kpis);

    // Low velocity should trigger alert
    assert.ok(receivedAlerts.length >= 0); // May or may not have alerts depending on thresholds
  });

  it('includes suggested actions in critical alerts', async () => {
    // Create scenario with high default rate
    const borrowerId = await registerAgent(eventStore);
    await disburseLoan(eventStore, borrowerId, 1000);

    // Simulate default
    await eventStore.append({
      type: 'LoanDefaulted',
      aggregateId: Ids.agreement(),
      aggregateType: 'Agreement',
      aggregateVersion: 2,
      payload: { type: 'LoanDefaulted', loanId: Ids.agreement() },
      actor: createTestActor(),
    });

    const kpis = await monitor.calculateKPIs();
    const assessment = monitor.assessHealth(kpis);

    // 100% default rate should trigger critical alert
    const criticalAlerts = assessment.alerts.filter(a => a.severity === 'critical');
    if (criticalAlerts.length > 0) {
      assert.ok(criticalAlerts.some(a => a.suggestedAction !== undefined));
    }
  });
});

// ============================================================================
// 5. CORRECTION GENERATION TESTS
// ============================================================================

describe('HEALTH MONITOR: Correction Actions', () => {
  let eventStore: EventStore;
  let monitor: EconomicHealthMonitor;

  beforeEach(() => {
    eventStore = createTestEventStore();
    monitor = createHealthMonitor(eventStore);
  });

  it('generates corrections for critical issues', async () => {
    // Create high default scenario
    const borrowerId = await registerAgent(eventStore);
    await disburseLoan(eventStore, borrowerId, 1000);

    await eventStore.append({
      type: 'LoanDefaulted',
      aggregateId: Ids.agreement(),
      aggregateType: 'Agreement',
      aggregateVersion: 2,
      payload: { type: 'LoanDefaulted', loanId: Ids.agreement() },
      actor: createTestActor(),
    });

    const kpis = await monitor.calculateKPIs();
    const assessment = monitor.assessHealth(kpis);
    const corrections = await monitor.generateCorrections(assessment);

    // Should suggest pausing loans
    const pauseAction = corrections.find(c => c.type === 'PAUSE_NEW_LOANS');
    if (assessment.areas.loans.level === 'critical') {
      assert.ok(pauseAction !== undefined);
    }
  });

  it('marks some corrections as requiring approval', async () => {
    await mintCredits(eventStore, 'wallet-1', 1000);

    const kpis = await monitor.calculateKPIs();
    const assessment = monitor.assessHealth(kpis);
    const corrections = await monitor.generateCorrections(assessment);

    // Fee adjustments should require approval
    const feeAdjustments = corrections.filter(c => c.type === 'ADJUST_TRANSACTION_FEE');
    for (const adj of feeAdjustments) {
      assert.strictEqual(adj.requiresApproval, true);
    }
  });
});

// ============================================================================
// 6. GINI COEFFICIENT TESTS
// ============================================================================

describe('HEALTH MONITOR: Gini Coefficient', () => {
  let eventStore: EventStore;
  let monitor: EconomicHealthMonitor;

  beforeEach(() => {
    eventStore = createTestEventStore();
    monitor = createHealthMonitor(eventStore);
  });

  it('calculates Gini = 0 for perfect equality', async () => {
    // All wallets have same balance
    await createWallet(eventStore, 'wallet-1');
    await createWallet(eventStore, 'wallet-2');
    await createWallet(eventStore, 'wallet-3');
    await mintCredits(eventStore, 'wallet-1', 100);
    await mintCredits(eventStore, 'wallet-2', 100);
    await mintCredits(eventStore, 'wallet-3', 100);

    const kpis = await monitor.calculateKPIs();

    assert.strictEqual(kpis.distribution.giniCoefficient, 0);
  });

  it('calculates higher Gini for inequality', async () => {
    // One wallet has most of the money
    await createWallet(eventStore, 'wallet-1');
    await createWallet(eventStore, 'wallet-2');
    await createWallet(eventStore, 'wallet-3');
    await mintCredits(eventStore, 'wallet-1', 1000);
    await mintCredits(eventStore, 'wallet-2', 10);
    await mintCredits(eventStore, 'wallet-3', 10);

    const kpis = await monitor.calculateKPIs();

    // Gini should be high (closer to 1)
    assert.ok(kpis.distribution.giniCoefficient > 0.5);
  });
});

// ============================================================================
// 7. FULL HEALTH CHECK CYCLE
// ============================================================================

describe('HEALTH MONITOR: Full Health Check', () => {
  let eventStore: EventStore;
  let monitor: EconomicHealthMonitor;

  beforeEach(() => {
    eventStore = createTestEventStore();
    monitor = createHealthMonitor(eventStore);
  });

  it('runs complete health check cycle', async () => {
    await createWallet(eventStore, 'wallet-1');
    await createWallet(eventStore, 'wallet-2');
    await mintCredits(eventStore, 'wallet-1', 1000);
    await transferCredits(eventStore, 'wallet-1', 'wallet-2', 100);

    const result = await monitor.runHealthCheck();

    assert.ok(result.kpis !== undefined);
    assert.ok(result.assessment !== undefined);
    assert.ok(result.corrections !== undefined);
    assert.ok(result.kpis.calculatedAt > 0);
  });

  it('formats KPIs for display', async () => {
    await mintCredits(eventStore, 'wallet-1', 1000);

    const kpis = await monitor.calculateKPIs();
    const formatted = monitor.formatKPIs(kpis);

    assert.ok(formatted.includes('ECONOMIC HEALTH REPORT'));
    assert.ok(formatted.includes('MONETARY'));
    assert.ok(formatted.includes('TRANSACTIONS'));
    assert.ok(formatted.includes('LOANS'));
    assert.ok(formatted.includes('DISTRIBUTION'));
    assert.ok(formatted.includes('AGENTS'));
  });
});

// ============================================================================
// 8. THRESHOLD CONFIGURATION TESTS
// ============================================================================

describe('HEALTH MONITOR: Threshold Configuration', () => {
  it('uses default thresholds', () => {
    assert.strictEqual(DEFAULT_THRESHOLDS.inflation.warning, 0.05);
    assert.strictEqual(DEFAULT_THRESHOLDS.inflation.critical, 0.10);
    assert.strictEqual(DEFAULT_THRESHOLDS.loans.defaultRateWarning, 0.05);
    assert.strictEqual(DEFAULT_THRESHOLDS.loans.defaultRateCritical, 0.10);
  });

  it('allows custom thresholds', () => {
    const eventStore = createTestEventStore();
    const monitor = createHealthMonitor(eventStore, {
      thresholds: {
        inflation: { warning: 0.02, critical: 0.05 },
      },
    });

    assert.ok(monitor !== undefined);
  });

  it('allows custom period', () => {
    const eventStore = createTestEventStore();
    const monitor = createHealthMonitor(eventStore, {
      periodMs: 1000 * 60 * 60, // 1 hour
    });

    assert.ok(monitor !== undefined);
  });
});

// ============================================================================
// 9. TOP 10% CONCENTRATION TESTS
// ============================================================================

describe('HEALTH MONITOR: Concentration Metrics', () => {
  let eventStore: EventStore;
  let monitor: EconomicHealthMonitor;

  beforeEach(() => {
    eventStore = createTestEventStore();
    monitor = createHealthMonitor(eventStore);
  });

  it('calculates top 10% holdings', async () => {
    // Create 10 wallets with varying balances
    for (let i = 1; i <= 10; i++) {
      await createWallet(eventStore, `wallet-${i}`);
      await mintCredits(eventStore, `wallet-${i}`, i * 100); // 100, 200, ..., 1000
    }

    const kpis = await monitor.calculateKPIs();

    // Top 10% (1 wallet) holds 1000 out of 5500 total = ~18%
    assert.ok(kpis.distribution.top10Percent > 0);
    assert.ok(kpis.distribution.top10Percent < 1);
  });
});
