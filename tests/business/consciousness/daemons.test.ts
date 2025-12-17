/**
 * CONSCIOUSNESS LAYER TESTS - Daemons
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createInMemoryEventStore } from '../../../core/store/event-store';
import type { EventStore } from '../../../core/store/event-store';
import {
  createDaemon,
  createLoop,
  canSpend,
  getRemainingBudget,
  isHeartbeatOverdue,
  isDead,
  BUDGET_PRESETS,
} from '../../../core/schema/consciousness';
import type {
  Daemon,
  DaemonLoop,
  DaemonBudget,
  DaemonMode,
  LoopSchedule,
  LoopAction,
} from '../../../core/schema/consciousness';
import { Ids } from '../../../core/shared/types';

describe('Consciousness Layer - Daemons', () => {
  let eventStore: EventStore;

  beforeEach(() => {
    eventStore = createInMemoryEventStore();
  });

  describe('Daemon Creation', () => {
    it('should create a basic daemon', () => {
      const daemonId = Ids.entity();
      const entityId = Ids.entity();

      const daemon = createDaemon(
        daemonId,
        entityId,
        'Test Daemon',
        'Scheduled',
        BUDGET_PRESETS.standard
      );

      assert.strictEqual(daemon.id, daemonId);
      assert.strictEqual(daemon.entityId, entityId);
      assert.strictEqual(daemon.name, 'Test Daemon');
      assert.strictEqual(daemon.mode, 'Scheduled');
      assert.strictEqual(daemon.status, 'Stopped');
      assert.deepStrictEqual(daemon.loops, []);
      assert.deepStrictEqual(daemon.memory, []);
    });

    it('should create daemon with different modes', () => {
      const daemonId = Ids.entity();
      const entityId = Ids.entity();

      const persistent = createDaemon(daemonId, entityId, 'P', 'Persistent', BUDGET_PRESETS.standard);
      const scheduled = createDaemon(daemonId, entityId, 'S', 'Scheduled', BUDGET_PRESETS.standard);
      const reactive = createDaemon(daemonId, entityId, 'R', 'Reactive', BUDGET_PRESETS.standard);

      assert.strictEqual(persistent.mode, 'Persistent');
      assert.strictEqual(scheduled.mode, 'Scheduled');
      assert.strictEqual(reactive.mode, 'Reactive');
    });

    it('should initialize budget correctly', () => {
      const daemonId = Ids.entity();
      const entityId = Ids.entity();

      const daemon = createDaemon(
        daemonId,
        entityId,
        'Test',
        'Scheduled',
        BUDGET_PRESETS.standard
      );

      assert.strictEqual(daemon.budget.hourlyMax.amount, BigInt(1000));
      assert.strictEqual(daemon.budget.dailyMax.amount, BigInt(10000));
      assert.strictEqual(daemon.budget.onExhausted, 'notify');
      assert.strictEqual(daemon.budget.currentHourSpend.amount, BigInt(0));
      assert.strictEqual(daemon.budget.currentDaySpend.amount, BigInt(0));
    });

    it('should initialize stats to zero', () => {
      const daemonId = Ids.entity();
      const entityId = Ids.entity();

      const daemon = createDaemon(daemonId, entityId, 'Test', 'Scheduled', BUDGET_PRESETS.minimal);

      assert.strictEqual(daemon.stats.totalLoopRuns, 0);
      assert.strictEqual(daemon.stats.totalHeartbeats, 0);
      assert.strictEqual(daemon.stats.totalErrors, 0);
      assert.strictEqual(daemon.stats.uptimeSeconds, 0);
    });
  });

  describe('Budget Presets', () => {
    it('should have correct minimal preset', () => {
      assert.strictEqual(BUDGET_PRESETS.minimal.hourlyMax.amount, BigInt(100));
      assert.strictEqual(BUDGET_PRESETS.minimal.dailyMax.amount, BigInt(500));
      assert.strictEqual(BUDGET_PRESETS.minimal.onExhausted, 'sleep');
    });

    it('should have correct standard preset', () => {
      assert.strictEqual(BUDGET_PRESETS.standard.hourlyMax.amount, BigInt(1000));
      assert.strictEqual(BUDGET_PRESETS.standard.dailyMax.amount, BigInt(10000));
      assert.strictEqual(BUDGET_PRESETS.standard.onExhausted, 'notify');
    });

    it('should have correct premium preset', () => {
      assert.strictEqual(BUDGET_PRESETS.premium.hourlyMax.amount, BigInt(5000));
      assert.strictEqual(BUDGET_PRESETS.premium.dailyMax.amount, BigInt(50000));
      assert.strictEqual(BUDGET_PRESETS.premium.onExhausted, 'notify');
    });

    it('should have unlimited preset', () => {
      assert.ok(BUDGET_PRESETS.unlimited.hourlyMax.amount > BigInt(1000000000));
      assert.ok(BUDGET_PRESETS.unlimited.dailyMax.amount > BigInt(1000000000));
    });
  });

  describe('Budget Management', () => {
    it('should check if daemon can spend', () => {
      const daemonId = Ids.entity();
      const entityId = Ids.entity();

      const daemon = createDaemon(daemonId, entityId, 'Test', 'Scheduled', BUDGET_PRESETS.minimal);

      // Can spend within budget
      assert.strictEqual(canSpend(daemon, { amount: BigInt(50), unit: 'mUBL' }), true);
      assert.strictEqual(canSpend(daemon, { amount: BigInt(100), unit: 'mUBL' }), true);

      // Cannot spend more than hourly max
      assert.strictEqual(canSpend(daemon, { amount: BigInt(101), unit: 'mUBL' }), false);
      assert.strictEqual(canSpend(daemon, { amount: BigInt(1000), unit: 'mUBL' }), false);
    });

    it('should calculate remaining budget', () => {
      const daemonId = Ids.entity();
      const entityId = Ids.entity();

      const daemon = createDaemon(daemonId, entityId, 'Test', 'Scheduled', BUDGET_PRESETS.standard);
      const remaining = getRemainingBudget(daemon);

      assert.strictEqual(remaining.hourly.amount, BigInt(1000));
      assert.strictEqual(remaining.daily.amount, BigInt(10000));
    });
  });

  describe('Loop Creation', () => {
    it('should create a basic loop', () => {
      const schedule: LoopSchedule = { cron: '0 * * * *' };
      const action: LoopAction = { intentType: 'check:health' };

      const loop = createLoop('loop-1', 'Hourly Check', schedule, action);

      assert.strictEqual(loop.id, 'loop-1');
      assert.strictEqual(loop.name, 'Hourly Check');
      assert.strictEqual(loop.enabled, true);
      assert.strictEqual(loop.runCount, 0);
      assert.strictEqual(loop.failureCount, 0);
    });

    it('should support different schedule types', () => {
      const cronLoop = createLoop('1', 'Cron', { cron: '0 9 * * *' }, { intentType: 'test' });
      const intervalLoop = createLoop('2', 'Interval', { interval: 'PT5M' }, { intentType: 'test' });
      const eventLoop = createLoop('3', 'Event', { onEvent: 'OrderCreated' }, { intentType: 'test' });
      const conditionalLoop = createLoop('4', 'Conditional', { condition: 'balance > 100' }, { intentType: 'test' });

      assert.strictEqual(cronLoop.schedule.cron, '0 9 * * *');
      assert.strictEqual(intervalLoop.schedule.interval, 'PT5M');
      assert.strictEqual(eventLoop.schedule.onEvent, 'OrderCreated');
      assert.strictEqual(conditionalLoop.schedule.condition, 'balance > 100');
    });

    it('should support different action types', () => {
      const intentAction: LoopAction = {
        intentType: 'send:email',
        intentPayload: { to: 'user@example.com' },
      };

      const functionAction: LoopAction = {
        intentType: 'custom',
        functionRef: 'myModule.myFunction',
      };

      const retryAction: LoopAction = {
        intentType: 'test',
        timeout: 'PT30S',
        retry: {
          maxAttempts: 3,
          backoff: 'exponential',
          initialDelay: 'PT1S',
        },
      };

      assert.strictEqual(intentAction.intentPayload?.to, 'user@example.com');
      assert.strictEqual(functionAction.functionRef, 'myModule.myFunction');
      assert.strictEqual(retryAction.retry?.maxAttempts, 3);
    });
  });

  describe('Heartbeat Management', () => {
    it('should detect overdue heartbeat', () => {
      const daemonId = Ids.entity();
      const entityId = Ids.entity();

      const daemon: Daemon = {
        ...createDaemon(daemonId, entityId, 'Test', 'Persistent', BUDGET_PRESETS.standard),
        heartbeat: {
          interval: 'PT5M',  // 5 minutes
          lastBeat: Date.now() - 10 * 60 * 1000,  // 10 minutes ago
          missedBeats: 0,
          maxMissedBeats: 3,
        },
      };

      assert.strictEqual(isHeartbeatOverdue(daemon), true);
    });

    it('should not flag recent heartbeat as overdue', () => {
      const daemonId = Ids.entity();
      const entityId = Ids.entity();

      const daemon: Daemon = {
        ...createDaemon(daemonId, entityId, 'Test', 'Persistent', BUDGET_PRESETS.standard),
        heartbeat: {
          interval: 'PT5M',
          lastBeat: Date.now() - 2 * 60 * 1000,  // 2 minutes ago
          missedBeats: 0,
          maxMissedBeats: 3,
        },
      };

      assert.strictEqual(isHeartbeatOverdue(daemon), false);
    });

    it('should detect dead daemon', () => {
      const daemonId = Ids.entity();
      const entityId = Ids.entity();

      const aliveDaemon: Daemon = {
        ...createDaemon(daemonId, entityId, 'Alive', 'Persistent', BUDGET_PRESETS.standard),
        heartbeat: {
          interval: 'PT5M',
          missedBeats: 2,
          maxMissedBeats: 3,
        },
      };

      const deadDaemon: Daemon = {
        ...createDaemon(daemonId, entityId, 'Dead', 'Persistent', BUDGET_PRESETS.standard),
        heartbeat: {
          interval: 'PT5M',
          missedBeats: 3,
          maxMissedBeats: 3,
        },
      };

      assert.strictEqual(isDead(aliveDaemon), false);
      assert.strictEqual(isDead(deadDaemon), true);
    });

    it('should not require heartbeat for non-persistent daemons', () => {
      const daemonId = Ids.entity();
      const entityId = Ids.entity();

      const scheduledDaemon = createDaemon(daemonId, entityId, 'Scheduled', 'Scheduled', BUDGET_PRESETS.standard);
      const reactiveDaemon = createDaemon(daemonId, entityId, 'Reactive', 'Reactive', BUDGET_PRESETS.standard);

      assert.strictEqual(isHeartbeatOverdue(scheduledDaemon), false);
      assert.strictEqual(isHeartbeatOverdue(reactiveDaemon), false);
      assert.strictEqual(isDead(scheduledDaemon), false);
      assert.strictEqual(isDead(reactiveDaemon), false);
    });
  });

  describe('Memory Slots', () => {
    it('should support memory slot structure', () => {
      const slot = {
        key: 'lastProcessedId',
        value: 12345,
        updatedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      };

      assert.strictEqual(slot.key, 'lastProcessedId');
      assert.strictEqual(slot.value, 12345);
      assert.ok(slot.expiresAt > slot.updatedAt);
    });
  });

  describe('Provider Configuration', () => {
    it('should support provider configuration', () => {
      const provider = {
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        fallbacks: ['openai/gpt-4', 'anthropic/claude-3-haiku'],
        contextStrategy: 'sliding' as const,
        maxContextTokens: 100000,
      };

      assert.strictEqual(provider.provider, 'anthropic');
      assert.strictEqual(provider.model, 'claude-3-sonnet');
      assert.strictEqual(provider.fallbacks?.length, 2);
      assert.strictEqual(provider.contextStrategy, 'sliding');
    });
  });
});

describe('Consciousness Layer - Integration', () => {
  it('should support full daemon lifecycle', () => {
    const daemonId = Ids.entity();
    const entityId = Ids.entity();

    // 1. Create daemon
    const daemon = createDaemon(
      daemonId,
      entityId,
      'Daily Reporter',
      'Scheduled',
      BUDGET_PRESETS.standard
    );

    assert.strictEqual(daemon.status, 'Stopped');

    // 2. Add loops
    const reportLoop = createLoop(
      'report-loop',
      'Generate Daily Report',
      { cron: '0 9 * * *' },
      { intentType: 'generate:report', intentPayload: { format: 'pdf' } }
    );

    const cleanupLoop = createLoop(
      'cleanup-loop',
      'Cleanup Old Data',
      { cron: '0 0 * * 0' },  // Weekly
      { intentType: 'cleanup:data', intentPayload: { olderThanDays: 30 } }
    );

    assert.strictEqual(reportLoop.schedule.cron, '0 9 * * *');
    assert.strictEqual(cleanupLoop.schedule.cron, '0 0 * * 0');

    // 3. Check budget
    assert.strictEqual(canSpend(daemon, { amount: BigInt(500), unit: 'mUBL' }), true);
  });

  it('should support reactive daemon pattern', () => {
    const daemonId = Ids.entity();
    const entityId = Ids.entity();

    // Create reactive daemon that responds to events
    const daemon = createDaemon(
      daemonId,
      entityId,
      'Order Processor',
      'Reactive',
      BUDGET_PRESETS.premium
    );

    const processOrderLoop = createLoop(
      'process-order',
      'Process New Orders',
      { onEvent: 'OrderCreated' },
      {
        intentType: 'process:order',
        timeout: 'PT30S',
        retry: {
          maxAttempts: 3,
          backoff: 'exponential',
          initialDelay: 'PT1S',
        },
      }
    );

    assert.strictEqual(daemon.mode, 'Reactive');
    assert.strictEqual(processOrderLoop.schedule.onEvent, 'OrderCreated');
    assert.strictEqual(processOrderLoop.action.retry?.maxAttempts, 3);
  });
});
