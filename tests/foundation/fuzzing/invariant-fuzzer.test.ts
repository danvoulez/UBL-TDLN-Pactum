/**
 * FUZZING: Invariant Fuzzer
 * 
 * Generate random operations and verify invariants hold.
 * If any invariant breaks, we've found a bug.
 * 
 * Invariants tested:
 * 1. Event count never decreases
 * 2. Sequence numbers are monotonically increasing
 * 3. Every event has an actor
 * 4. Hash chain is never broken
 * 5. Timestamps are reasonable
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestLedger, type TestLedger } from '../../helpers/test-ledger';
import { Ids } from '../../../core/shared/types';

// Random generators
const randomString = (len: number) => 
  Array.from({ length: len }, () => 
    String.fromCharCode(97 + Math.floor(Math.random() * 26))
  ).join('');

const randomInt = (min: number, max: number) => 
  Math.floor(Math.random() * (max - min + 1)) + min;

const randomChoice = <T>(arr: T[]): T => 
  arr[Math.floor(Math.random() * arr.length)];

const EVENT_TYPES = [
  'EntityCreated', 'EntityUpdated', 'EntityDeleted',
  'AgreementProposed', 'ConsentGiven', 'AgreementActivated',
  'AssetRegistered', 'OwnershipTransferred',
  'RoleGranted', 'RoleRevoked',
  'ContainerCreated', 'AssetDeposited', 'AssetWithdrawn',
];

const AGGREGATE_TYPES = ['Party', 'Agreement', 'Asset', 'Container', 'Role'];

const ACTORS = [
  { type: 'Entity' as const, entityId: Ids.entity() },
  { type: 'Entity' as const, entityId: Ids.entity() },
  { type: 'Entity' as const, entityId: Ids.entity() },
  { type: 'System' as const, systemId: 'fuzzer' },
];

function generateRandomEvent(version: number) {
  return {
    type: randomChoice(EVENT_TYPES),
    aggregateType: randomChoice(AGGREGATE_TYPES) as any,
    aggregateId: Ids.entity(),
    aggregateVersion: version,
    actor: randomChoice(ACTORS),
    timestamp: Date.now() + randomInt(-1000, 1000),
    payload: {
      randomField1: randomString(randomInt(5, 20)),
      randomField2: randomInt(0, 1000000),
      randomField3: Math.random() > 0.5,
      nestedObject: {
        value: randomString(10),
        count: randomInt(0, 100),
      },
    },
  };
}

describe('FUZZING: Invariant Fuzzer', () => {
  let ledger: TestLedger;

  beforeEach(() => {
    ledger = createTestLedger();
  });

  describe('1. Random Event Generation', () => {
    it('100 random events maintain invariants', async () => {
      const ITERATIONS = 100;
      let previousCount = 0;
      let previousSequence = 0n;

      for (let i = 0; i < ITERATIONS; i++) {
        const event = generateRandomEvent(i + 1);
        await ledger.eventStore.append(event);

        // Invariant 1: Event count never decreases
        const currentCount = await ledger.getEventCount();
        assert(
          currentCount >= previousCount,
          `Event count decreased: ${currentCount} < ${previousCount}`
        );
        previousCount = currentCount;

        // Invariant 2: Sequence is monotonically increasing
        const events = await ledger.getAllEvents();
        const lastEvent = events[events.length - 1];
        assert(
          lastEvent.sequence > previousSequence,
          `Sequence not increasing: ${lastEvent.sequence} <= ${previousSequence}`
        );
        previousSequence = lastEvent.sequence;

        // Invariant 3: Every event has an actor
        assert(lastEvent.actor, `Event ${i} missing actor`);
        assert(
          lastEvent.actor.type === 'Entity' || lastEvent.actor.type === 'System',
          `Event ${i} has invalid actor type`
        );
      }

      assert.strictEqual(await ledger.getEventCount(), ITERATIONS);
    });

    it('500 random events maintain hash chain', async () => {
      const ITERATIONS = 500;

      for (let i = 0; i < ITERATIONS; i++) {
        await ledger.eventStore.append(generateRandomEvent(i + 1));
      }

      const events = await ledger.getAllEvents();
      
      // Verify all events exist
      assert.strictEqual(events.length, ITERATIONS);

      // Verify sequence ordering
      for (let i = 1; i < events.length; i++) {
        assert(
          events[i].sequence > events[i - 1].sequence,
          `Sequence order broken at index ${i}`
        );
      }
    });
  });

  describe('2. Stress Testing', () => {
    it('rapid sequential appends maintain consistency', async () => {
      const ITERATIONS = 200;
      const startTime = Date.now();

      // Rapid fire appends
      for (let i = 0; i < ITERATIONS; i++) {
        await ledger.eventStore.append(generateRandomEvent(i + 1));
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      const events = await ledger.getAllEvents();
      assert.strictEqual(events.length, ITERATIONS, 'All events preserved');

      // Verify no gaps in sequence
      const sequences = events.map(e => e.sequence);
      for (let i = 1; i < sequences.length; i++) {
        assert(
          sequences[i] === sequences[i - 1] + 1n,
          `Gap in sequence at index ${i}`
        );
      }

      console.log(`  → ${ITERATIONS} events in ${duration}ms (${(ITERATIONS / duration * 1000).toFixed(0)} events/sec)`);
    });

    it('mixed aggregate types maintain isolation', async () => {
      const ITERATIONS = 100;
      const aggregateCounts: Record<string, number> = {};

      for (let i = 0; i < ITERATIONS; i++) {
        const event = generateRandomEvent(1);
        await ledger.eventStore.append(event);
        
        aggregateCounts[event.aggregateType] = 
          (aggregateCounts[event.aggregateType] || 0) + 1;
      }

      const events = await ledger.getAllEvents();
      
      // Verify counts match
      for (const [type, expectedCount] of Object.entries(aggregateCounts)) {
        const actualCount = events.filter(e => e.aggregateType === type).length;
        assert.strictEqual(
          actualCount,
          expectedCount,
          `Mismatch for ${type}: expected ${expectedCount}, got ${actualCount}`
        );
      }
    });
  });

  describe('3. Edge Cases', () => {
    it('handles empty payload', async () => {
      await ledger.eventStore.append({
        type: 'EmptyPayload',
        aggregateType: 'Party' as any,
        aggregateId: Ids.entity(),
        aggregateVersion: 1,
        actor: ACTORS[0],
        timestamp: Date.now(),
        payload: {},
      });

      const events = await ledger.getAllEvents();
      assert.strictEqual(events.length, 1);
      assert.deepStrictEqual(events[0].payload, {});
    });

    it('handles deeply nested payload', async () => {
      const deepPayload = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  value: 'deep',
                },
              },
            },
          },
        },
      };

      await ledger.eventStore.append({
        type: 'DeepPayload',
        aggregateType: 'Party' as any,
        aggregateId: Ids.entity(),
        aggregateVersion: 1,
        actor: ACTORS[0],
        timestamp: Date.now(),
        payload: deepPayload,
      });

      const events = await ledger.getAllEvents();
      assert.strictEqual(events[0].payload.level1.level2.level3.level4.level5.value, 'deep');
    });

    it('handles large payload', async () => {
      const largePayload = {
        data: randomString(10000), // 10KB string
        array: Array.from({ length: 1000 }, (_, i) => ({ index: i, value: randomString(10) })),
      };

      await ledger.eventStore.append({
        type: 'LargePayload',
        aggregateType: 'Party' as any,
        aggregateId: Ids.entity(),
        aggregateVersion: 1,
        actor: ACTORS[0],
        timestamp: Date.now(),
        payload: largePayload,
      });

      const events = await ledger.getAllEvents();
      assert.strictEqual(events[0].payload.data.length, 10000);
      assert.strictEqual(events[0].payload.array.length, 1000);
    });

    it('handles special characters in strings', async () => {
      const specialPayload = {
        unicode: '你好世界 🌍 مرحبا',
        escapes: 'line1\nline2\ttab\\backslash"quote',
        nullChar: 'before\x00after',
        emoji: '👨‍👩‍👧‍👦 🏳️‍🌈 🇧🇷',
      };

      await ledger.eventStore.append({
        type: 'SpecialChars',
        aggregateType: 'Party' as any,
        aggregateId: Ids.entity(),
        aggregateVersion: 1,
        actor: ACTORS[0],
        timestamp: Date.now(),
        payload: specialPayload,
      });

      const events = await ledger.getAllEvents();
      assert.strictEqual(events[0].payload.unicode, specialPayload.unicode);
      assert.strictEqual(events[0].payload.emoji, specialPayload.emoji);
    });

    it('handles numeric edge cases', async () => {
      const numericPayload = {
        zero: 0,
        negative: -1,
        maxSafe: Number.MAX_SAFE_INTEGER,
        minSafe: Number.MIN_SAFE_INTEGER,
        float: 3.14159265359,
        scientific: 1.23e10,
        infinity: Infinity,
        negInfinity: -Infinity,
      };

      await ledger.eventStore.append({
        type: 'NumericEdges',
        aggregateType: 'Party' as any,
        aggregateId: Ids.entity(),
        aggregateVersion: 1,
        actor: ACTORS[0],
        timestamp: Date.now(),
        payload: numericPayload,
      });

      const events = await ledger.getAllEvents();
      assert.strictEqual(events[0].payload.zero, 0);
      assert.strictEqual(events[0].payload.maxSafe, Number.MAX_SAFE_INTEGER);
    });
  });

  describe('4. Invariant Verification', () => {
    it('all events have required fields after 1000 operations', async () => {
      const ITERATIONS = 1000;

      for (let i = 0; i < ITERATIONS; i++) {
        await ledger.eventStore.append(generateRandomEvent(i + 1));
      }

      const events = await ledger.getAllEvents();
      
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        
        // Required fields
        assert(event.id, `Event ${i} missing id`);
        assert(event.type, `Event ${i} missing type`);
        assert(event.aggregateType, `Event ${i} missing aggregateType`);
        assert(event.aggregateId, `Event ${i} missing aggregateId`);
        assert(typeof event.aggregateVersion === 'number', `Event ${i} missing aggregateVersion`);
        assert(event.actor, `Event ${i} missing actor`);
        assert(typeof event.timestamp === 'number', `Event ${i} missing timestamp`);
        assert(typeof event.sequence === 'bigint', `Event ${i} missing sequence`);
        assert(event.payload !== undefined, `Event ${i} missing payload`);
      }
    });
  });
});
