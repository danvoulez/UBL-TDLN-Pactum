/**
 * CHAOS: Crash Recovery
 * 
 * What happens when the system crashes during operations?
 * Can we recover to a consistent state?
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  createTestLedger,
  SYSTEM_ACTOR,
  assertHashChainValid,
  type TestLedger,
} from '../../helpers/test-ledger';

describe('CHAOS: Crash Recovery', () => {
  let ledger: TestLedger;

  beforeEach(() => {
    ledger = createTestLedger();
  });

  it('system is consistent after reset', async () => {
    // Create some events
    for (let i = 0; i < 10; i++) {
      await ledger.eventStore.append({
        type: 'PreResetEvent',
        aggregateType: 'System' as any,
        aggregateId: `pre-${i}`,
        aggregateVersion: 1,
        actor: SYSTEM_ACTOR,
        timestamp: Date.now(),
        payload: { index: i },
      });
    }

    // Simulate crash/restart
    ledger.reset();

    // Verify system is in clean state
    const count = await ledger.getEventCount();
    assert.strictEqual(count, 0, 'Events should be cleared after reset');

    // Verify we can append new events
    await ledger.eventStore.append({
      type: 'PostResetEvent',
      aggregateType: 'System' as any,
      aggregateId: 'post-reset',
      aggregateVersion: 1,
      actor: SYSTEM_ACTOR,
      timestamp: Date.now(),
      payload: {},
    });

    const newCount = await ledger.getEventCount();
    assert.strictEqual(newCount, 1, 'Should be able to append after reset');

    // Verify hash chain is valid
    const chainResult = await ledger.verifyHashChain();
    assertHashChainValid(chainResult);
  });

  it('partial operation does not corrupt state', async () => {
    // Create initial events
    for (let i = 0; i < 5; i++) {
      await ledger.eventStore.append({
        type: 'InitialEvent',
        aggregateType: 'System' as any,
        aggregateId: `initial-${i}`,
        aggregateVersion: 1,
        actor: SYSTEM_ACTOR,
        timestamp: Date.now(),
        payload: { index: i },
      });
    }

    const countBefore = await ledger.getEventCount();

    // Simulate a failing append
    try {
      await ledger.eventStore.append({
        type: 'FailingEvent',
        aggregateType: 'System' as any,
        aggregateId: 'failing',
        aggregateVersion: 1,
        actor: null as any, // This might cause issues
        timestamp: Date.now(),
        payload: {},
      });
    } catch (error) {
      // Expected - operation failed
    }

    // Verify state is still consistent
    const chainResult = await ledger.verifyHashChain();
    assertHashChainValid(chainResult);

    // Verify we can still append valid events
    await ledger.eventStore.append({
      type: 'AfterFailEvent',
      aggregateType: 'System' as any,
      aggregateId: 'after-fail',
      aggregateVersion: 1,
      actor: SYSTEM_ACTOR,
      timestamp: Date.now(),
      payload: {},
    });

    const chainAfter = await ledger.verifyHashChain();
    assertHashChainValid(chainAfter);
  });

  it('concurrent operations during stress do not corrupt', async () => {
    const operations = [];
    
    // Simulate high concurrency
    for (let i = 0; i < 100; i++) {
      operations.push(
        ledger.eventStore.append({
          type: 'StressEvent',
          aggregateType: 'System' as any,
          aggregateId: `stress-${i}`,
          aggregateVersion: 1,
          actor: SYSTEM_ACTOR,
          timestamp: Date.now(),
          payload: { index: i },
        }).catch(() => null) // Some might fail, that's OK
      );
    }

    await Promise.all(operations);

    // Verify hash chain is still valid
    const chainResult = await ledger.verifyHashChain();
    assertHashChainValid(chainResult);

    // Verify sequences are still monotonic
    const events = await ledger.getAllEvents();
    for (let i = 1; i < events.length; i++) {
      assert(
        events[i].sequence > events[i - 1].sequence,
        `Sequence not monotonic after stress: ${events[i].sequence} <= ${events[i - 1].sequence}`
      );
    }
  });

  it('rapid create-reset cycles maintain consistency', async () => {
    for (let cycle = 0; cycle < 10; cycle++) {
      // Create events
      for (let i = 0; i < 5; i++) {
        await ledger.eventStore.append({
          type: 'CycleEvent',
          aggregateType: 'System' as any,
          aggregateId: `cycle-${cycle}-${i}`,
          aggregateVersion: 1,
          actor: SYSTEM_ACTOR,
          timestamp: Date.now(),
          payload: { cycle, index: i },
        });
      }

      // Verify consistency
      const chainResult = await ledger.verifyHashChain();
      assertHashChainValid(chainResult);

      // Reset
      ledger.reset();
    }

    // Final state should be clean
    const count = await ledger.getEventCount();
    assert.strictEqual(count, 0, 'Should be empty after final reset');
  });
});
