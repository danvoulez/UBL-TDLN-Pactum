/**
 * INVARIANT: Hash Chain Integrity
 * 
 * Every event's hash must include the previous event's hash.
 * This creates a cryptographic chain that proves no events were
 * inserted, removed, or modified after the fact.
 * 
 * If this test fails, the audit trail cannot be trusted.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  createTestLedger,
  SYSTEM_ACTOR,
  assertHashChainValid,
  assertSequenceMonotonic,
  type TestLedger,
} from '../../helpers/test-ledger';

describe('INVARIANT: Hash Chain Integrity', () => {
  let ledger: TestLedger;

  beforeEach(() => {
    ledger = createTestLedger();
  });

  it('empty ledger has valid (trivial) hash chain', async () => {
    const result = await ledger.verifyHashChain();
    assertHashChainValid(result);
  });

  it('single event has valid hash chain', async () => {
    await ledger.eventStore.append({
      type: 'FirstEvent',
      aggregateType: 'System' as any,
      aggregateId: 'chain-1',
      aggregateVersion: 1,
      actor: SYSTEM_ACTOR,
      timestamp: Date.now(),
      payload: {},
    });

    const result = await ledger.verifyHashChain();
    assertHashChainValid(result);
  });

  it('sequence of events maintains valid hash chain', async () => {
    // Append 100 events
    for (let i = 0; i < 100; i++) {
      await ledger.eventStore.append({
        type: 'ChainEvent',
        aggregateType: 'System' as any,
        aggregateId: `chain-${i}`,
        aggregateVersion: 1,
        actor: SYSTEM_ACTOR,
        timestamp: Date.now(),
        payload: { index: i },
      });
    }

    const result = await ledger.verifyHashChain();
    assertHashChainValid(result);
  });

  it('events from different aggregates maintain global hash chain', async () => {
    // Interleave events from different aggregates
    for (let i = 0; i < 50; i++) {
      await ledger.eventStore.append({
        type: 'AggregateA',
        aggregateType: 'Party' as any,
        aggregateId: 'agg-a',
        aggregateVersion: i + 1,
        actor: SYSTEM_ACTOR,
        timestamp: Date.now(),
        payload: { source: 'A', index: i },
      });

      await ledger.eventStore.append({
        type: 'AggregateB',
        aggregateType: 'Agreement' as any,
        aggregateId: 'agg-b',
        aggregateVersion: i + 1,
        actor: SYSTEM_ACTOR,
        timestamp: Date.now(),
        payload: { source: 'B', index: i },
      });
    }

    const result = await ledger.verifyHashChain();
    assertHashChainValid(result);
    
    // Also verify sequence is monotonic
    const events = await ledger.getAllEvents();
    assertSequenceMonotonic(events);
  });

  it('sequence numbers are strictly monotonically increasing', async () => {
    const events = [];
    
    for (let i = 0; i < 20; i++) {
      const event = await ledger.eventStore.append({
        type: 'MonotonicEvent',
        aggregateType: 'System' as any,
        aggregateId: `mono-${i}`,
        aggregateVersion: 1,
        actor: SYSTEM_ACTOR,
        timestamp: Date.now(),
        payload: {},
      });
      events.push(event);
    }

    // Verify strict monotonicity (no duplicates, no gaps allowed to go backwards)
    for (let i = 1; i < events.length; i++) {
      assert(
        events[i].sequence > events[i - 1].sequence,
        `Sequence not strictly increasing: ${events[i].sequence} should be > ${events[i - 1].sequence}`
      );
    }
  });

  it('concurrent appends still maintain valid hash chain', async () => {
    // Simulate concurrent appends
    const promises = [];
    
    for (let i = 0; i < 50; i++) {
      promises.push(
        ledger.eventStore.append({
          type: 'ConcurrentEvent',
          aggregateType: 'System' as any,
          aggregateId: `concurrent-${i}`,
          aggregateVersion: 1,
          actor: SYSTEM_ACTOR,
          timestamp: Date.now(),
          payload: { index: i },
        })
      );
    }

    await Promise.all(promises);

    const result = await ledger.verifyHashChain();
    assertHashChainValid(result);

    // Verify all 50 events were appended
    const count = await ledger.getEventCount();
    assert.strictEqual(count, 50, 'Not all concurrent events were appended');
  });

  it('rapid sequential appends maintain valid hash chain', async () => {
    // Append as fast as possible
    for (let i = 0; i < 1000; i++) {
      await ledger.eventStore.append({
        type: 'RapidEvent',
        aggregateType: 'System' as any,
        aggregateId: `rapid-${i}`,
        aggregateVersion: 1,
        actor: SYSTEM_ACTOR,
        timestamp: Date.now(),
        payload: { index: i },
      });
    }

    const result = await ledger.verifyHashChain();
    assertHashChainValid(result);
  });

  it('events with same timestamp still have unique sequences', async () => {
    const fixedTimestamp = Date.now();
    
    for (let i = 0; i < 10; i++) {
      await ledger.eventStore.append({
        type: 'SameTimestampEvent',
        aggregateType: 'System' as any,
        aggregateId: `same-ts-${i}`,
        aggregateVersion: 1,
        actor: SYSTEM_ACTOR,
        timestamp: fixedTimestamp, // Same timestamp for all
        payload: { index: i },
      });
    }

    const events = await ledger.getAllEvents();
    const sequences = events.map(e => e.sequence);
    const uniqueSequences = new Set(sequences);

    assert.strictEqual(
      uniqueSequences.size,
      sequences.length,
      'Events with same timestamp should still have unique sequences'
    );
  });
});
