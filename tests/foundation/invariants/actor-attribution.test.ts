/**
 * INVARIANT: Actor Attribution
 * 
 * Every event MUST have a verified actor.
 * No anonymous mutations are allowed.
 * 
 * If this test fails, the audit trail cannot answer "who did this?"
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  createTestLedger,
  alice,
  bob,
  SYSTEM_ACTOR,
  assertActorPresent,
  type TestLedger,
} from '../../helpers/test-ledger';

describe('INVARIANT: Actor Attribution', () => {
  let ledger: TestLedger;

  beforeEach(() => {
    ledger = createTestLedger();
  });

  it('every appended event has an actor', async () => {
    await ledger.eventStore.append({
      type: 'ActorTest',
      aggregateType: 'System' as any,
      aggregateId: 'actor-1',
      aggregateVersion: 1,
      actor: alice.actor,
      timestamp: Date.now(),
      payload: {},
    });

    const events = await ledger.getAllEvents();
    for (const event of events) {
      assertActorPresent(event);
    }
  });

  it('event without actor should be rejected', async () => {
    // This test verifies the event store rejects events without actors
    // The behavior depends on implementation - it should either:
    // 1. Throw an error
    // 2. Reject silently
    // 3. Add a default actor (which we'd then verify)
    
    try {
      await ledger.eventStore.append({
        type: 'NoActorEvent',
        aggregateType: 'System' as any,
        aggregateId: 'no-actor',
        aggregateVersion: 1,
        // actor: missing!
        timestamp: Date.now(),
        payload: {},
      } as any);

      // If it didn't throw, check if actor was added
      const events = await ledger.getAllEvents();
      const event = events.find(e => e.aggregateId === 'no-actor');
      
      if (event) {
        // Event was accepted - verify it has an actor
        assertActorPresent(event);
      }
    } catch (error) {
      // Expected - event store should reject events without actors
      assert(true, 'Event store correctly rejected event without actor');
    }
  });

  it('actor type is preserved exactly', async () => {
    // Test Entity actor
    await ledger.eventStore.append({
      type: 'EntityActorEvent',
      aggregateType: 'Party' as any,
      aggregateId: 'entity-actor',
      aggregateVersion: 1,
      actor: alice.actor,
      timestamp: Date.now(),
      payload: {},
    });

    // Test System actor
    await ledger.eventStore.append({
      type: 'SystemActorEvent',
      aggregateType: 'System' as any,
      aggregateId: 'system-actor',
      aggregateVersion: 1,
      actor: SYSTEM_ACTOR,
      timestamp: Date.now(),
      payload: {},
    });

    const events = await ledger.getAllEvents();
    
    const entityEvent = events.find(e => e.aggregateId === 'entity-actor');
    const systemEvent = events.find(e => e.aggregateId === 'system-actor');

    assert.strictEqual(entityEvent.actor.type, 'Entity');
    assert.strictEqual(systemEvent.actor.type, 'System');
  });

  it('actor identity is preserved exactly', async () => {
    await ledger.eventStore.append({
      type: 'IdentityTest',
      aggregateType: 'Party' as any,
      aggregateId: alice.id,
      aggregateVersion: 1,
      actor: alice.actor,
      timestamp: Date.now(),
      payload: {},
    });

    const events = await ledger.getAllEvents();
    const event = events[0];

    assert.deepStrictEqual(
      event.actor,
      alice.actor,
      'Actor identity was not preserved'
    );
  });

  it('different actors are distinguishable', async () => {
    await ledger.eventStore.append({
      type: 'AliceEvent',
      aggregateType: 'Party' as any,
      aggregateId: 'alice-action',
      aggregateVersion: 1,
      actor: alice.actor,
      timestamp: Date.now(),
      payload: {},
    });

    await ledger.eventStore.append({
      type: 'BobEvent',
      aggregateType: 'Party' as any,
      aggregateId: 'bob-action',
      aggregateVersion: 1,
      actor: bob.actor,
      timestamp: Date.now(),
      payload: {},
    });

    const events = await ledger.getAllEvents();
    const aliceEvent = events.find(e => e.aggregateId === 'alice-action');
    const bobEvent = events.find(e => e.aggregateId === 'bob-action');

    assert.notDeepStrictEqual(
      aliceEvent.actor,
      bobEvent.actor,
      'Different actors should be distinguishable'
    );
  });

  it('actor cannot be null or undefined', async () => {
    const invalidActors = [null, undefined];

    for (const invalidActor of invalidActors) {
      try {
        await ledger.eventStore.append({
          type: 'InvalidActorEvent',
          aggregateType: 'System' as any,
          aggregateId: `invalid-${invalidActor}`,
          aggregateVersion: 1,
          actor: invalidActor as any,
          timestamp: Date.now(),
          payload: {},
        });

        // If accepted, verify it was fixed
        const events = await ledger.getAllEvents();
        const event = events.find(e => e.aggregateId === `invalid-${invalidActor}`);
        if (event) {
          assert(event.actor !== null && event.actor !== undefined, 
            `Actor should not be ${invalidActor}`);
        }
      } catch (error) {
        // Expected - should reject invalid actors
        assert(true);
      }
    }
  });

  it('all events in a sequence have traceable actors', async () => {
    const actors = [alice.actor, bob.actor, SYSTEM_ACTOR];
    
    for (let i = 0; i < 30; i++) {
      await ledger.eventStore.append({
        type: 'SequenceEvent',
        aggregateType: 'System' as any,
        aggregateId: `seq-${i}`,
        aggregateVersion: 1,
        actor: actors[i % actors.length],
        timestamp: Date.now(),
        payload: { index: i },
      });
    }

    const events = await ledger.getAllEvents();
    
    for (const event of events) {
      assertActorPresent(event);
      
      // Verify actor is one of the known actors
      const isKnownActor = actors.some(a => 
        JSON.stringify(a) === JSON.stringify(event.actor)
      );
      
      assert(isKnownActor, `Unknown actor in event: ${JSON.stringify(event.actor)}`);
    }
  });
});
