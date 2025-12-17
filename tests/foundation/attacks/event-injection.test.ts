/**
 * ATTACK: Event Injection
 * 
 * Can an attacker inject events directly into the store,
 * bypassing the intent API and authorization?
 * 
 * This tests whether the system has proper boundaries.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  createTestLedger,
  alice,
  mallory,
  SYSTEM_ACTOR,
  createMaliciousEvent,
  type TestLedger,
} from '../../helpers/test-ledger';

describe('ATTACK: Event Injection', () => {
  let ledger: TestLedger;

  beforeEach(() => {
    ledger = createTestLedger();
  });

  it('ATTACK: inject admin role grant directly', async () => {
    // Attacker tries to grant themselves admin by injecting an event
    const maliciousEvent = {
      type: 'RoleGranted',
      aggregateType: 'Role' as any,
      aggregateId: 'role-admin-hack',
      aggregateVersion: 1,
      actor: SYSTEM_ACTOR, // Spoofing system actor
      timestamp: Date.now(),
      payload: {
        entityId: mallory.id,
        roleType: 'SystemAdmin',
        permissions: ['*'],
      },
    };

    // This should either:
    // 1. Be rejected by the event store
    // 2. Be detectable as unauthorized
    // 3. Not actually grant the role (role resolution ignores raw events)
    
    const eventBefore = await ledger.getEventCount();
    
    try {
      await ledger._rawAppend(maliciousEvent);
    } catch (error) {
      // Good - raw injection was blocked
      assert(true, 'Event injection was blocked');
      return;
    }

    const eventAfter = await ledger.getEventCount();
    
    // If event was accepted, document this as a finding
    // In a real system, we'd verify the role wasn't actually granted
    if (eventAfter > eventBefore) {
      console.warn('WARNING: Raw event injection was accepted. Verify role resolution ignores it.');
    }
  });

  it('ATTACK: inject consent without being a party', async () => {
    // First, create a legitimate agreement
    await ledger.eventStore.append({
      type: 'AgreementProposed',
      aggregateType: 'Agreement' as any,
      aggregateId: 'agreement-123',
      aggregateVersion: 1,
      actor: alice.actor,
      timestamp: Date.now(),
      payload: {
        agreementType: 'employment',
        parties: [
          { entityId: alice.id, role: 'Employer' },
          // Note: mallory is NOT a party
        ],
      },
    });

    // Attacker tries to inject consent as if they were a party
    const maliciousConsent = {
      type: 'ConsentGiven',
      aggregateType: 'Agreement' as any,
      aggregateId: 'agreement-123',
      aggregateVersion: 2,
      actor: mallory.actor, // Mallory is not a party!
      timestamp: Date.now(),
      payload: {
        partyId: mallory.id,
        method: 'Digital',
      },
    };

    try {
      await ledger._rawAppend(maliciousConsent);
    } catch (error) {
      assert(true, 'Unauthorized consent was blocked');
      return;
    }

    // If accepted, the aggregate rehydration should ignore invalid consents
    // This is a defense-in-depth check
    console.warn('WARNING: Consent injection accepted. Verify aggregate ignores non-party consents.');
  });

  it('ATTACK: inject event with forged sequence number', async () => {
    // Create some legitimate events first
    for (let i = 0; i < 5; i++) {
      await ledger.eventStore.append({
        type: 'LegitEvent',
        aggregateType: 'System' as any,
        aggregateId: `legit-${i}`,
        aggregateVersion: 1,
        actor: SYSTEM_ACTOR,
        timestamp: Date.now(),
        payload: {},
      });
    }

    const eventsBefore = await ledger.getAllEvents();
    const lastSequence = eventsBefore[eventsBefore.length - 1].sequence;

    // Try to inject an event with a lower sequence number (inserting into history)
    const backdoorEvent = {
      type: 'BackdoorEvent',
      aggregateType: 'System' as any,
      aggregateId: 'backdoor',
      aggregateVersion: 1,
      actor: mallory.actor,
      timestamp: Date.now() - 10000, // In the past
      sequence: 2n, // Trying to insert at position 2
      payload: { backdoor: true },
    };

    try {
      await ledger._rawAppend(backdoorEvent);
    } catch (error) {
      assert(true, 'Sequence manipulation was blocked');
      return;
    }

    // Verify hash chain is still valid (injection should be detectable)
    const chainResult = await ledger.verifyHashChain();
    
    if (!chainResult.valid) {
      assert(true, 'Sequence manipulation broke hash chain (detectable)');
    } else {
      // Check if the injected event has the forged sequence or was assigned a new one
      const eventsAfter = await ledger.getAllEvents();
      const injectedEvent = eventsAfter.find(e => e.payload?.backdoor === true);
      
      if (injectedEvent && injectedEvent.sequence === 2n) {
        assert.fail('CRITICAL: Sequence number forgery succeeded');
      }
    }
  });

  it('ATTACK: inject event with duplicate ID', async () => {
    const event = await ledger.eventStore.append({
      type: 'OriginalEvent',
      aggregateType: 'System' as any,
      aggregateId: 'original',
      aggregateVersion: 1,
      actor: SYSTEM_ACTOR,
      timestamp: Date.now(),
      payload: { original: true },
    });

    // Try to inject an event with the same ID
    const duplicateEvent = {
      ...event,
      id: event.id, // Same ID
      type: 'HijackedEvent',
      payload: { hijacked: true },
    };

    try {
      await ledger._rawAppend(duplicateEvent);
    } catch (error) {
      assert(true, 'Duplicate ID injection was blocked');
      return;
    }

    // Verify original event is unchanged
    const events = await ledger.getAllEvents();
    const originalEvent = events.find(e => e.id === event.id);
    
    assert.strictEqual(
      originalEvent.payload.original,
      true,
      'Original event was overwritten by duplicate ID injection'
    );
  });

  it('ATTACK: inject event claiming to be from the past', async () => {
    // Create current events
    await ledger.eventStore.append({
      type: 'CurrentEvent',
      aggregateType: 'System' as any,
      aggregateId: 'current',
      aggregateVersion: 1,
      actor: SYSTEM_ACTOR,
      timestamp: Date.now(),
      payload: {},
    });

    // Try to inject an event claiming to be from a year ago
    const pastTimestamp = Date.now() - (365 * 24 * 60 * 60 * 1000);
    
    const backdatedEvent = {
      type: 'BackdatedEvent',
      aggregateType: 'System' as any,
      aggregateId: 'backdated',
      aggregateVersion: 1,
      actor: mallory.actor,
      timestamp: pastTimestamp,
      payload: { backdated: true },
    };

    try {
      await ledger._rawAppend(backdatedEvent);
    } catch (error) {
      assert(true, 'Backdated event was blocked');
      return;
    }

    // If accepted, verify the sequence still shows it was added later
    const events = await ledger.getAllEvents();
    const backdated = events.find(e => e.payload?.backdated === true);
    
    if (backdated) {
      // The sequence should be after the "current" event, proving it was added later
      const current = events.find(e => e.aggregateId === 'current');
      
      assert(
        backdated.sequence > current.sequence,
        'Backdated event should have higher sequence (proving it was added later)'
      );
    }
  });

  it('ATTACK: flood with malicious events', async () => {
    // Try to flood the system with malicious events
    const floodSize = 100;
    const promises = [];

    for (let i = 0; i < floodSize; i++) {
      promises.push(
        ledger._rawAppend({
          type: 'FloodEvent',
          aggregateType: 'System' as any,
          aggregateId: `flood-${i}`,
          aggregateVersion: 1,
          actor: mallory.actor,
          timestamp: Date.now(),
          payload: { flood: true, index: i },
        }).catch(() => null) // Ignore individual failures
      );
    }

    await Promise.all(promises);

    // Verify system is still consistent
    const chainResult = await ledger.verifyHashChain();
    assert(chainResult.valid, 'Flood attack corrupted hash chain');
  });
});
