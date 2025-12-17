/**
 * COMPLIANCE: Audit Trail
 * 
 * Every action must be traceable.
 * An auditor must be able to reconstruct:
 * - Who did what
 * - When they did it
 * - Under what authority (which agreement)
 * - The complete chain of events
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestLedger, type TestLedger } from '../../helpers/test-ledger';
import {
  alice,
  bob,
  acmeCorp,
  asEmployer,
  asEmployee,
  asSeller,
  asBuyer,
  systemActor,
} from '../fixtures/entities';
import { Ids } from '../../../core/shared/types';

describe('Compliance: Audit Trail', () => {
  let ledger: TestLedger;

  beforeEach(() => {
    ledger = createTestLedger();
  });

  describe('1. Actor Traceability', () => {
    it('every event has an identifiable actor', async () => {
      // Create a complex scenario
      const agreementId = Ids.agreement();
      
      await ledger.eventStore.append({
        type: 'AgreementProposed',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 1,
        actor: acmeCorp.actor,
        timestamp: Date.now(),
        payload: {
          agreementType: 'employment',
          parties: [asEmployer(acmeCorp), asEmployee(alice)],
          terms: { description: 'Employment' },
        },
      });

      await ledger.eventStore.append({
        type: 'ConsentGiven',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 2,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: { partyId: alice.id, method: 'Digital' },
      });

      await ledger.eventStore.append({
        type: 'AgreementTerminated',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 3,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: { reason: 'Resignation' },
      });

      const events = await ledger.getAllEvents();
      
      for (const event of events) {
        assert(event.actor, `Event ${event.type} missing actor`);
        assert(event.actor.type, `Event ${event.type} actor missing type`);
        
        // Actor must be identifiable
        if (event.actor.type === 'Entity') {
          assert(event.actor.entityId, 'Entity actor must have entityId');
        } else if (event.actor.type === 'System') {
          assert(event.actor.systemId, 'System actor must have systemId');
        }
      }
    });

    it('actor identity is consistent across events', async () => {
      // Alice performs multiple actions
      for (let i = 0; i < 5; i++) {
        await ledger.eventStore.append({
          type: 'AliceAction',
          aggregateType: 'System' as any,
          aggregateId: `alice-action-${i}`,
          aggregateVersion: 1,
          actor: alice.actor,
          timestamp: Date.now(),
          payload: { index: i },
        });
      }

      const events = await ledger.getAllEvents();
      const aliceEvents = events.filter(e => e.type === 'AliceAction');
      
      // All should have the same actor
      const firstActor = JSON.stringify(aliceEvents[0].actor);
      for (const event of aliceEvents) {
        assert.strictEqual(
          JSON.stringify(event.actor),
          firstActor,
          'Actor identity should be consistent'
        );
      }
    });
  });

  describe('2. Temporal Ordering', () => {
    it('events are ordered by sequence', async () => {
      for (let i = 0; i < 10; i++) {
        await ledger.eventStore.append({
          type: 'OrderedEvent',
          aggregateType: 'System' as any,
          aggregateId: `ordered-${i}`,
          aggregateVersion: 1,
          actor: systemActor,
          timestamp: Date.now(),
          payload: { index: i },
        });
      }

      const events = await ledger.getAllEvents();
      
      for (let i = 1; i < events.length; i++) {
        assert(
          events[i].sequence > events[i - 1].sequence,
          `Events not ordered: ${events[i].sequence} should be > ${events[i - 1].sequence}`
        );
      }
    });

    it('timestamps are recorded accurately', async () => {
      const beforeTime = Date.now();
      
      await ledger.eventStore.append({
        type: 'TimestampedEvent',
        aggregateType: 'System' as any,
        aggregateId: 'timestamped',
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: Date.now(),
        payload: {},
      });

      const afterTime = Date.now();
      
      const events = await ledger.getAllEvents();
      const event = events[0];
      
      assert(event.timestamp >= beforeTime, 'Timestamp should be >= start time');
      assert(event.timestamp <= afterTime, 'Timestamp should be <= end time');
    });
  });

  describe('3. Chain of Custody', () => {
    it('asset transfers create complete audit trail', async () => {
      const assetId = Ids.entity();
      
      // Asset created
      await ledger.eventStore.append({
        type: 'AssetRegistered',
        aggregateType: 'Asset' as any,
        aggregateId: assetId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          assetType: 'Equipment',
          ownerId: alice.id,
          properties: { name: 'Laptop', serialNumber: 'SN-12345' },
        },
      });

      // Transfer to Bob
      const saleAgreement = Ids.agreement();
      await ledger.eventStore.append({
        type: 'OwnershipTransferred',
        aggregateType: 'Asset' as any,
        aggregateId: assetId,
        aggregateVersion: 2,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          fromEntityId: alice.id,
          toEntityId: bob.id,
          governedBy: saleAgreement,
          reason: 'Sale',
        },
      });

      // Transfer to Acme
      const corporateSale = Ids.agreement();
      await ledger.eventStore.append({
        type: 'OwnershipTransferred',
        aggregateType: 'Asset' as any,
        aggregateId: assetId,
        aggregateVersion: 3,
        actor: bob.actor,
        timestamp: Date.now(),
        payload: {
          fromEntityId: bob.id,
          toEntityId: acmeCorp.id,
          governedBy: corporateSale,
          reason: 'Corporate purchase',
        },
      });

      const events = await ledger.getAllEvents();
      const assetEvents = events.filter(e => e.aggregateId === assetId);
      
      // Complete chain of custody
      assert.strictEqual(assetEvents.length, 3, 'Should have 3 events');
      
      // Verify chain
      assert.strictEqual(assetEvents[0].type, 'AssetRegistered');
      assert.strictEqual(assetEvents[0].payload.ownerId, alice.id);
      
      assert.strictEqual(assetEvents[1].type, 'OwnershipTransferred');
      assert.strictEqual(assetEvents[1].payload.fromEntityId, alice.id);
      assert.strictEqual(assetEvents[1].payload.toEntityId, bob.id);
      
      assert.strictEqual(assetEvents[2].type, 'OwnershipTransferred');
      assert.strictEqual(assetEvents[2].payload.fromEntityId, bob.id);
      assert.strictEqual(assetEvents[2].payload.toEntityId, acmeCorp.id);
    });

    it('every transfer references governing agreement', async () => {
      const assetId = Ids.entity();
      const agreementId = Ids.agreement();
      
      await ledger.eventStore.append({
        type: 'OwnershipTransferred',
        aggregateType: 'Asset' as any,
        aggregateId: assetId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          fromEntityId: alice.id,
          toEntityId: bob.id,
          governedBy: agreementId, // Must reference agreement
        },
      });

      const events = await ledger.getAllEvents();
      const transfer = events[0];
      
      assert(transfer.payload.governedBy, 'Transfer must reference governing agreement');
    });
  });

  describe('4. Event Completeness', () => {
    it('no events are lost', async () => {
      const expectedCount = 100;
      
      for (let i = 0; i < expectedCount; i++) {
        await ledger.eventStore.append({
          type: 'CountedEvent',
          aggregateType: 'System' as any,
          aggregateId: `counted-${i}`,
          aggregateVersion: 1,
          actor: systemActor,
          timestamp: Date.now(),
          payload: { index: i },
        });
      }

      const count = await ledger.getEventCount();
      assert.strictEqual(count, expectedCount, 'All events should be preserved');
    });

    it('events can be filtered by aggregate', async () => {
      // Create events for different aggregates
      for (let i = 0; i < 10; i++) {
        await ledger.eventStore.append({
          type: 'AggregateAEvent',
          aggregateType: 'AggregateA' as any,
          aggregateId: 'agg-a',
          aggregateVersion: i + 1,
          actor: systemActor,
          timestamp: Date.now(),
          payload: { index: i },
        });

        await ledger.eventStore.append({
          type: 'AggregateBEvent',
          aggregateType: 'AggregateB' as any,
          aggregateId: 'agg-b',
          aggregateVersion: i + 1,
          actor: systemActor,
          timestamp: Date.now(),
          payload: { index: i },
        });
      }

      const events = await ledger.getAllEvents();
      const aggAEvents = events.filter(e => e.aggregateId === 'agg-a');
      const aggBEvents = events.filter(e => e.aggregateId === 'agg-b');
      
      assert.strictEqual(aggAEvents.length, 10);
      assert.strictEqual(aggBEvents.length, 10);
    });

    it('events can be filtered by type', async () => {
      await ledger.eventStore.append({
        type: 'TypeA',
        aggregateType: 'System' as any,
        aggregateId: 'type-test',
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: Date.now(),
        payload: {},
      });

      await ledger.eventStore.append({
        type: 'TypeB',
        aggregateType: 'System' as any,
        aggregateId: 'type-test',
        aggregateVersion: 2,
        actor: systemActor,
        timestamp: Date.now(),
        payload: {},
      });

      await ledger.eventStore.append({
        type: 'TypeA',
        aggregateType: 'System' as any,
        aggregateId: 'type-test',
        aggregateVersion: 3,
        actor: systemActor,
        timestamp: Date.now(),
        payload: {},
      });

      const events = await ledger.getAllEvents();
      const typeAEvents = events.filter(e => e.type === 'TypeA');
      const typeBEvents = events.filter(e => e.type === 'TypeB');
      
      assert.strictEqual(typeAEvents.length, 2);
      assert.strictEqual(typeBEvents.length, 1);
    });
  });

  describe('5. Reconstruction', () => {
    it('state can be reconstructed from events', async () => {
      const agreementId = Ids.agreement();
      
      // Simulate agreement lifecycle
      await ledger.eventStore.append({
        type: 'AgreementProposed',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          agreementType: 'sale',
          parties: [asSeller(alice), asBuyer(bob)],
          terms: { price: 1000 },
        },
      });

      await ledger.eventStore.append({
        type: 'ConsentGiven',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 2,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: { partyId: alice.id, method: 'Digital' },
      });

      await ledger.eventStore.append({
        type: 'ConsentGiven',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 3,
        actor: bob.actor,
        timestamp: Date.now(),
        payload: { partyId: bob.id, method: 'Digital' },
      });

      await ledger.eventStore.append({
        type: 'AgreementActivated',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 4,
        actor: systemActor,
        timestamp: Date.now(),
        payload: { activatedAt: Date.now() },
      });

      // Reconstruct state from events
      const events = await ledger.getAllEvents();
      const agreementEvents = events.filter(e => e.aggregateId === agreementId);
      
      // Replay to determine current state
      let state = { status: 'Unknown', consents: [] as string[] };
      
      for (const event of agreementEvents) {
        switch (event.type) {
          case 'AgreementProposed':
            state.status = 'Proposed';
            break;
          case 'ConsentGiven':
            state.consents.push(event.payload.partyId);
            break;
          case 'AgreementActivated':
            state.status = 'Active';
            break;
        }
      }
      
      assert.strictEqual(state.status, 'Active');
      assert.strictEqual(state.consents.length, 2);
      assert(state.consents.includes(alice.id));
      assert(state.consents.includes(bob.id));
    });
  });
});
