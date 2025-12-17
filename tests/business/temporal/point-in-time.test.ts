/**
 * TEMPORAL: Point-in-Time Queries
 * 
 * The ledger supports time-travel queries.
 * You can ask "what was the state at time T?" and get a deterministic answer.
 * 
 * This is critical for:
 * - Auditing historical state
 * - Dispute resolution
 * - Compliance reporting
 * - Debugging
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestLedger, type TestLedger } from '../../helpers/test-ledger';
import { alice, bob, acmeCorp, systemActor } from '../fixtures/entities';
import { Ids } from '../../../core/shared/types';

describe('Temporal: Point-in-Time Queries', () => {
  let ledger: TestLedger;

  beforeEach(() => {
    ledger = createTestLedger();
  });

  describe('1. State Reconstruction', () => {
    it('can reconstruct state at any past time', async () => {
      const entityId = Ids.entity();
      
      const t1 = Date.now();
      await ledger.eventStore.append({
        type: 'EntityCreated',
        aggregateType: 'Party' as any,
        aggregateId: entityId,
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: t1,
        payload: { name: 'Alice', status: 'Active' },
      });

      await new Promise(r => setTimeout(r, 10));
      const t2 = Date.now();
      
      await ledger.eventStore.append({
        type: 'EntityUpdated',
        aggregateType: 'Party' as any,
        aggregateId: entityId,
        aggregateVersion: 2,
        actor: alice.actor,
        timestamp: t2,
        payload: { name: 'Alice Smith', status: 'Active' },
      });

      await new Promise(r => setTimeout(r, 10));
      const t3 = Date.now();
      
      await ledger.eventStore.append({
        type: 'EntityUpdated',
        aggregateType: 'Party' as any,
        aggregateId: entityId,
        aggregateVersion: 3,
        actor: alice.actor,
        timestamp: t3,
        payload: { name: 'Alice Smith', status: 'Suspended' },
      });

      const events = await ledger.getAllEvents();
      const entityEvents = events.filter(e => e.aggregateId === entityId);
      
      // Reconstruct state at t1 (just created)
      const stateAtT1 = reconstructState(entityEvents, t1 + 1);
      assert.strictEqual(stateAtT1.name, 'Alice');
      assert.strictEqual(stateAtT1.status, 'Active');
      
      // Reconstruct state at t2 (after first update)
      const stateAtT2 = reconstructState(entityEvents, t2 + 1);
      assert.strictEqual(stateAtT2.name, 'Alice Smith');
      assert.strictEqual(stateAtT2.status, 'Active');
      
      // Reconstruct state at t3 (after second update)
      const stateAtT3 = reconstructState(entityEvents, t3 + 1);
      assert.strictEqual(stateAtT3.name, 'Alice Smith');
      assert.strictEqual(stateAtT3.status, 'Suspended');
    });

    it('query before first event returns empty state', async () => {
      const entityId = Ids.entity();
      const creationTime = Date.now();
      
      await ledger.eventStore.append({
        type: 'EntityCreated',
        aggregateType: 'Party' as any,
        aggregateId: entityId,
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: creationTime,
        payload: { name: 'Alice' },
      });

      const events = await ledger.getAllEvents();
      const entityEvents = events.filter(e => e.aggregateId === entityId);
      
      // Query before creation
      const stateBefore = reconstructState(entityEvents, creationTime - 1000);
      assert.deepStrictEqual(stateBefore, {}, 'State before creation should be empty');
    });
  });

  describe('2. Agreement State Over Time', () => {
    it('agreement status changes are time-indexed', async () => {
      const agreementId = Ids.agreement();
      
      const proposedTime = Date.now();
      await ledger.eventStore.append({
        type: 'AgreementProposed',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: proposedTime,
        payload: { status: 'Proposed' },
      });

      await new Promise(r => setTimeout(r, 10));
      const activatedTime = Date.now();
      
      await ledger.eventStore.append({
        type: 'AgreementActivated',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 2,
        actor: systemActor,
        timestamp: activatedTime,
        payload: { status: 'Active' },
      });

      await new Promise(r => setTimeout(r, 10));
      const terminatedTime = Date.now();
      
      await ledger.eventStore.append({
        type: 'AgreementTerminated',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 3,
        actor: alice.actor,
        timestamp: terminatedTime,
        payload: { status: 'Terminated' },
      });

      const events = await ledger.getAllEvents();
      const agreementEvents = events.filter(e => e.aggregateId === agreementId);
      
      // Query at different times
      assert.strictEqual(
        getStatusAt(agreementEvents, proposedTime + 1),
        'Proposed'
      );
      assert.strictEqual(
        getStatusAt(agreementEvents, activatedTime + 1),
        'Active'
      );
      assert.strictEqual(
        getStatusAt(agreementEvents, terminatedTime + 1),
        'Terminated'
      );
    });
  });

  describe('3. Role Validity Over Time', () => {
    it('role is valid only during agreement period', async () => {
      const roleId = Ids.entity();
      const agreementId = Ids.agreement();
      
      const grantTime = Date.now();
      await ledger.eventStore.append({
        type: 'RoleGranted',
        aggregateType: 'Role' as any,
        aggregateId: roleId,
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: grantTime,
        payload: {
          entityId: alice.id,
          roleType: 'Employee',
          grantedBy: agreementId,
        },
      });

      await new Promise(r => setTimeout(r, 10));
      const revokeTime = Date.now();
      
      await ledger.eventStore.append({
        type: 'RoleRevoked',
        aggregateType: 'Role' as any,
        aggregateId: roleId,
        aggregateVersion: 2,
        actor: systemActor,
        timestamp: revokeTime,
        payload: {
          entityId: alice.id,
          roleType: 'Employee',
        },
      });

      const events = await ledger.getAllEvents();
      const roleEvents = events.filter(e => e.aggregateId === roleId);
      
      // Before grant: no role
      assert.strictEqual(isRoleActive(roleEvents, grantTime - 1000), false);
      
      // After grant, before revoke: role active
      assert.strictEqual(isRoleActive(roleEvents, grantTime + 1), true);
      
      // After revoke: role inactive
      assert.strictEqual(isRoleActive(roleEvents, revokeTime + 1), false);
    });
  });

  describe('4. Asset Ownership Over Time', () => {
    it('ownership history is reconstructible', async () => {
      const assetId = Ids.entity();
      
      const t1 = Date.now();
      await ledger.eventStore.append({
        type: 'AssetRegistered',
        aggregateType: 'Asset' as any,
        aggregateId: assetId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: t1,
        payload: { ownerId: alice.id },
      });

      await new Promise(r => setTimeout(r, 10));
      const t2 = Date.now();
      
      await ledger.eventStore.append({
        type: 'OwnershipTransferred',
        aggregateType: 'Asset' as any,
        aggregateId: assetId,
        aggregateVersion: 2,
        actor: alice.actor,
        timestamp: t2,
        payload: { fromEntityId: alice.id, toEntityId: bob.id },
      });

      await new Promise(r => setTimeout(r, 10));
      const t3 = Date.now();
      
      await ledger.eventStore.append({
        type: 'OwnershipTransferred',
        aggregateType: 'Asset' as any,
        aggregateId: assetId,
        aggregateVersion: 3,
        actor: bob.actor,
        timestamp: t3,
        payload: { fromEntityId: bob.id, toEntityId: acmeCorp.id },
      });

      const events = await ledger.getAllEvents();
      const assetEvents = events.filter(e => e.aggregateId === assetId);
      
      // Owner at each time
      assert.strictEqual(getOwnerAt(assetEvents, t1 + 1), alice.id);
      assert.strictEqual(getOwnerAt(assetEvents, t2 + 1), bob.id);
      assert.strictEqual(getOwnerAt(assetEvents, t3 + 1), acmeCorp.id);
    });
  });

  describe('5. Deterministic Reconstruction', () => {
    it('same query always returns same result', async () => {
      const entityId = Ids.entity();
      const fixedTime = Date.now();
      
      await ledger.eventStore.append({
        type: 'EntityCreated',
        aggregateType: 'Party' as any,
        aggregateId: entityId,
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: fixedTime,
        payload: { name: 'Deterministic' },
      });

      const events = await ledger.getAllEvents();
      const entityEvents = events.filter(e => e.aggregateId === entityId);
      
      // Query multiple times
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(reconstructState(entityEvents, fixedTime + 1));
      }
      
      // All results should be identical
      const first = JSON.stringify(results[0]);
      for (const result of results) {
        assert.strictEqual(
          JSON.stringify(result),
          first,
          'Reconstruction should be deterministic'
        );
      }
    });

    it('event order is deterministic', async () => {
      // Create events with same timestamp
      const fixedTime = Date.now();
      
      for (let i = 0; i < 10; i++) {
        await ledger.eventStore.append({
          type: 'SimultaneousEvent',
          aggregateType: 'System' as any,
          aggregateId: `sim-${i}`,
          aggregateVersion: 1,
          actor: systemActor,
          timestamp: fixedTime, // Same timestamp
          payload: { index: i },
        });
      }

      // Query multiple times
      const events1 = await ledger.getAllEvents();
      const events2 = await ledger.getAllEvents();
      
      // Order should be consistent
      for (let i = 0; i < events1.length; i++) {
        assert.strictEqual(
          events1[i].payload.index,
          events2[i].payload.index,
          'Event order should be deterministic'
        );
      }
    });
  });
});

// Helper functions for state reconstruction

function reconstructState(events: any[], atTime: number): Record<string, any> {
  const state: Record<string, any> = {};
  
  for (const event of events) {
    if (event.timestamp <= atTime) {
      Object.assign(state, event.payload);
    }
  }
  
  return state;
}

function getStatusAt(events: any[], atTime: number): string | null {
  let status = null;
  
  for (const event of events) {
    if (event.timestamp <= atTime && event.payload.status) {
      status = event.payload.status;
    }
  }
  
  return status;
}

function isRoleActive(events: any[], atTime: number): boolean {
  let active = false;
  
  for (const event of events) {
    if (event.timestamp <= atTime) {
      if (event.type === 'RoleGranted') active = true;
      if (event.type === 'RoleRevoked') active = false;
    }
  }
  
  return active;
}

function getOwnerAt(events: any[], atTime: number): string | null {
  let owner = null;
  
  for (const event of events) {
    if (event.timestamp <= atTime) {
      if (event.type === 'AssetRegistered') {
        owner = event.payload.ownerId;
      } else if (event.type === 'OwnershipTransferred') {
        owner = event.payload.toEntityId;
      }
    }
  }
  
  return owner;
}
