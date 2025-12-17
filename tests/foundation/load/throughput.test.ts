/**
 * LOAD: Throughput Testing
 * 
 * Test system performance under load while verifying correctness.
 * Speed without correctness is worthless.
 * 
 * Tests:
 * 1. Sustained write throughput
 * 2. Read performance under load
 * 3. Mixed read/write workload
 * 4. Query performance at scale
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestLedger, type TestLedger, SYSTEM_ACTOR } from '../../helpers/test-ledger';
import { Ids } from '../../../core/shared/types';

describe('LOAD: Throughput Testing', () => {
  let ledger: TestLedger;

  beforeEach(() => {
    ledger = createTestLedger();
  });

  describe('1. Write Throughput', () => {
    it('sustains 1000 writes with correctness', async () => {
      const ITERATIONS = 1000;
      const startTime = Date.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await ledger.eventStore.append({
          type: 'LoadTestEvent',
          aggregateType: 'Party' as any,
          aggregateId: `load-test-${i}`,
          aggregateVersion: 1,
          actor: SYSTEM_ACTOR,
          timestamp: Date.now(),
          payload: { index: i },
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = (ITERATIONS / duration) * 1000;

      // Verify correctness
      const count = await ledger.getEventCount();
      assert.strictEqual(count, ITERATIONS, 'All events persisted');

      const events = await ledger.getAllEvents();
      
      // Verify sequence integrity
      for (let i = 1; i < events.length; i++) {
        assert(events[i].sequence > events[i - 1].sequence, 'Sequence order maintained');
      }

      // Verify no data loss
      const indices = new Set(events.map(e => e.payload.index));
      assert.strictEqual(indices.size, ITERATIONS, 'No duplicate or missing indices');

      console.log(`  → Write: ${throughput.toFixed(0)} events/sec (${duration}ms for ${ITERATIONS} events)`);
    });

    it('handles burst writes', async () => {
      const BURST_SIZE = 100;
      const BURSTS = 5;
      const results: number[] = [];

      for (let burst = 0; burst < BURSTS; burst++) {
        const startTime = Date.now();
        
        for (let i = 0; i < BURST_SIZE; i++) {
          await ledger.eventStore.append({
            type: 'BurstEvent',
            aggregateType: 'Party' as any,
            aggregateId: `burst-${burst}-${i}`,
            aggregateVersion: 1,
            actor: SYSTEM_ACTOR,
            timestamp: Date.now(),
            payload: { burst, index: i },
          });
        }

        const duration = Date.now() - startTime;
        results.push((BURST_SIZE / duration) * 1000);
      }

      // Verify all events
      const count = await ledger.getEventCount();
      assert.strictEqual(count, BURST_SIZE * BURSTS, 'All burst events persisted');

      const avgThroughput = results.reduce((a, b) => a + b, 0) / results.length;
      console.log(`  → Burst avg: ${avgThroughput.toFixed(0)} events/sec`);
    });
  });

  describe('2. Read Performance', () => {
    it('reads scale with event count', async () => {
      const SIZES = [100, 500, 1000];
      const readTimes: Record<number, number> = {};

      for (const size of SIZES) {
        // Reset ledger
        ledger = createTestLedger();

        // Populate
        for (let i = 0; i < size; i++) {
          await ledger.eventStore.append({
            type: 'ReadTestEvent',
            aggregateType: 'Party' as any,
            aggregateId: `read-test-${i}`,
            aggregateVersion: 1,
            actor: SYSTEM_ACTOR,
            timestamp: Date.now(),
            payload: { index: i },
          });
        }

        // Measure read time (average of 10 reads)
        const reads = 10;
        const startTime = Date.now();
        for (let i = 0; i < reads; i++) {
          await ledger.getAllEvents();
        }
        const duration = Date.now() - startTime;
        readTimes[size] = duration / reads;

        // Verify correctness
        const events = await ledger.getAllEvents();
        assert.strictEqual(events.length, size, `Correct count for size ${size}`);
      }

      console.log(`  → Read times: ${JSON.stringify(readTimes)}ms per read`);
    });

    it('filtered reads are efficient', async () => {
      const TOTAL = 500;
      const AGGREGATE_TYPES = ['TypeA', 'TypeB', 'TypeC'];

      // Populate with mixed types
      for (let i = 0; i < TOTAL; i++) {
        await ledger.eventStore.append({
          type: 'FilterTestEvent',
          aggregateType: AGGREGATE_TYPES[i % 3] as any,
          aggregateId: `filter-test-${i}`,
          aggregateVersion: 1,
          actor: SYSTEM_ACTOR,
          timestamp: Date.now(),
          payload: { index: i },
        });
      }

      // Read all and filter
      const startTime = Date.now();
      const events = await ledger.getAllEvents();
      const typeAEvents = events.filter(e => e.aggregateType === 'TypeA');
      const duration = Date.now() - startTime;

      // Verify correctness
      assert.strictEqual(events.length, TOTAL, 'All events retrieved');
      assert(typeAEvents.length > 0, 'Filter found events');
      assert(typeAEvents.every(e => e.aggregateType === 'TypeA'), 'Filter is correct');

      console.log(`  → Filter ${TOTAL} events: ${duration}ms`);
    });
  });

  describe('3. Mixed Workload', () => {
    it('handles concurrent-like read/write pattern', async () => {
      const ITERATIONS = 200;
      let writeTime = 0;
      let readTime = 0;

      for (let i = 0; i < ITERATIONS; i++) {
        // Write
        const writeStart = Date.now();
        await ledger.eventStore.append({
          type: 'MixedEvent',
          aggregateType: 'Party' as any,
          aggregateId: `mixed-${i}`,
          aggregateVersion: 1,
          actor: SYSTEM_ACTOR,
          timestamp: Date.now(),
          payload: { index: i },
        });
        writeTime += Date.now() - writeStart;

        // Read every 10th iteration
        if (i % 10 === 0) {
          const readStart = Date.now();
          const events = await ledger.getAllEvents();
          readTime += Date.now() - readStart;
          
          // Verify consistency during mixed workload
          assert.strictEqual(events.length, i + 1, `Consistent count at iteration ${i}`);
        }
      }

      // Final verification
      const events = await ledger.getAllEvents();
      assert.strictEqual(events.length, ITERATIONS, 'All events persisted');

      console.log(`  → Write: ${writeTime}ms, Read: ${readTime}ms`);
    });
  });

  describe('4. Query Performance', () => {
    it('aggregate lookup scales', async () => {
      const AGGREGATES = 50;
      const EVENTS_PER_AGGREGATE = 20;

      // Create events for multiple aggregates
      for (let agg = 0; agg < AGGREGATES; agg++) {
        for (let ver = 1; ver <= EVENTS_PER_AGGREGATE; ver++) {
          await ledger.eventStore.append({
            type: 'AggregateEvent',
            aggregateType: 'Party' as any,
            aggregateId: `aggregate-${agg}`,
            aggregateVersion: ver,
            actor: SYSTEM_ACTOR,
            timestamp: Date.now(),
            payload: { aggregate: agg, version: ver },
          });
        }
      }

      const totalEvents = AGGREGATES * EVENTS_PER_AGGREGATE;
      assert.strictEqual(await ledger.getEventCount(), totalEvents, 'All events created');

      // Query for specific aggregate
      const startTime = Date.now();
      const events = await ledger.getAllEvents();
      const agg25Events = events.filter(e => e.aggregateId === 'aggregate-25');
      const duration = Date.now() - startTime;

      assert.strictEqual(agg25Events.length, EVENTS_PER_AGGREGATE, 'Found all aggregate events');
      
      // Verify version ordering
      for (let i = 0; i < agg25Events.length; i++) {
        assert.strictEqual(agg25Events[i].payload.version, i + 1, 'Version order correct');
      }

      console.log(`  → Query 1 of ${AGGREGATES} aggregates from ${totalEvents} events: ${duration}ms`);
    });

    it('time-range queries work correctly', async () => {
      const EVENTS = 100;
      const timestamps: number[] = [];

      // Create events with known timestamps
      for (let i = 0; i < EVENTS; i++) {
        const ts = Date.now();
        timestamps.push(ts);
        
        await ledger.eventStore.append({
          type: 'TimeRangeEvent',
          aggregateType: 'Party' as any,
          aggregateId: `time-range-${i}`,
          aggregateVersion: 1,
          actor: SYSTEM_ACTOR,
          timestamp: ts,
          payload: { index: i },
        });

        // Small delay to ensure different timestamps
        if (i % 10 === 0) {
          await new Promise(r => setTimeout(r, 1));
        }
      }

      // Query middle time range
      const midStart = timestamps[25];
      const midEnd = timestamps[75];

      const events = await ledger.getAllEvents();
      const rangeEvents = events.filter(e => 
        e.timestamp >= midStart && e.timestamp <= midEnd
      );

      // Should have events in the range (exact count depends on timing)
      assert(rangeEvents.length >= 30, `Expected events in range, got ${rangeEvents.length}`);
      assert(rangeEvents.length <= 80, `Expected events in range, got ${rangeEvents.length}`);
    });
  });

  describe('5. Memory Efficiency', () => {
    it('handles large event volume without crash', async () => {
      const LARGE_COUNT = 2000;

      for (let i = 0; i < LARGE_COUNT; i++) {
        await ledger.eventStore.append({
          type: 'LargeVolumeEvent',
          aggregateType: 'Party' as any,
          aggregateId: `large-${i}`,
          aggregateVersion: 1,
          actor: SYSTEM_ACTOR,
          timestamp: Date.now(),
          payload: {
            index: i,
            data: `payload-${i}-${'x'.repeat(100)}`, // ~100 bytes per event
          },
        });
      }

      const count = await ledger.getEventCount();
      assert.strictEqual(count, LARGE_COUNT, 'All events stored');

      // Verify we can still read
      const events = await ledger.getAllEvents();
      assert.strictEqual(events.length, LARGE_COUNT, 'All events readable');
    });
  });
});
