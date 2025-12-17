/**
 * CONTAINER PHYSICS: Permeability
 * 
 * Containers have physics - they control what can enter and exit.
 * 
 * Permeability types:
 * - Sealed: Nothing enters or exits without explicit agreement
 * - Gated: Controlled by rules/agreements
 * - Open: Anything can enter (but still tracked)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestLedger, type TestLedger } from '../../helpers/test-ledger';
import { alice, bob, acmeCorp, systemActor } from '../fixtures/entities';
import { Ids } from '../../../core/shared/types';

describe('Container Physics: Permeability', () => {
  let ledger: TestLedger;

  beforeEach(() => {
    ledger = createTestLedger();
  });

  describe('1. Sealed Containers', () => {
    it('sealed container is created with Sealed permeability', async () => {
      const containerId = Ids.entity();
      
      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: containerId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          name: 'Alice Vault',
          containerType: 'Vault',
          physics: {
            permeability: 'Sealed',
            fungibility: 'Strict',
          },
          ownerId: alice.id,
        },
      });

      const events = await ledger.getAllEvents();
      const container = events[0];
      
      assert.strictEqual(container.payload.physics.permeability, 'Sealed');
    });

    it('sealed container records deposit attempt without agreement', async () => {
      const containerId = Ids.entity();
      const assetId = Ids.entity();
      
      // Create sealed container
      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: containerId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          physics: { permeability: 'Sealed' },
          ownerId: alice.id,
        },
      });

      // Attempt deposit without agreement
      await ledger.eventStore.append({
        type: 'DepositAttempted',
        aggregateType: 'Container' as any,
        aggregateId: containerId,
        aggregateVersion: 2,
        actor: bob.actor,
        timestamp: Date.now(),
        payload: {
          assetId: assetId,
          fromEntityId: bob.id,
          governingAgreement: null, // No agreement!
          result: 'Rejected',
          reason: 'PERMEABILITY_VIOLATION: Sealed container requires governing agreement',
        },
      });

      const events = await ledger.getAllEvents();
      const attempt = events.find(e => e.type === 'DepositAttempted');
      
      assert(attempt, 'Deposit attempt should be recorded');
      assert.strictEqual(attempt.payload.result, 'Rejected');
      assert(attempt.payload.reason.includes('PERMEABILITY_VIOLATION'));
    });

    it('sealed container accepts deposit with valid agreement', async () => {
      const containerId = Ids.entity();
      const assetId = Ids.entity();
      const agreementId = Ids.agreement();
      
      // Create sealed container
      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: containerId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          physics: { permeability: 'Sealed' },
          ownerId: alice.id,
        },
      });

      // Deposit with agreement
      await ledger.eventStore.append({
        type: 'AssetDeposited',
        aggregateType: 'Container' as any,
        aggregateId: containerId,
        aggregateVersion: 2,
        actor: bob.actor,
        timestamp: Date.now(),
        payload: {
          assetId: assetId,
          fromEntityId: bob.id,
          governingAgreement: agreementId, // Has agreement
          result: 'Accepted',
        },
      });

      const events = await ledger.getAllEvents();
      const deposit = events.find(e => e.type === 'AssetDeposited');
      
      assert(deposit, 'Deposit should be recorded');
      assert.strictEqual(deposit.payload.result, 'Accepted');
      assert.strictEqual(deposit.payload.governingAgreement, agreementId);
    });
  });

  describe('2. Gated Containers', () => {
    it('gated container has rules for entry', async () => {
      const containerId = Ids.entity();
      
      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: containerId,
        aggregateVersion: 1,
        actor: acmeCorp.actor,
        timestamp: Date.now(),
        payload: {
          name: 'Employee Workspace',
          containerType: 'Workspace',
          physics: {
            permeability: 'Gated',
            gateRules: [
              { type: 'RequireRole', role: 'Employee', scope: acmeCorp.id },
            ],
          },
          ownerId: acmeCorp.id,
        },
      });

      const events = await ledger.getAllEvents();
      const container = events[0];
      
      assert.strictEqual(container.payload.physics.permeability, 'Gated');
      assert(Array.isArray(container.payload.physics.gateRules));
      assert(container.payload.physics.gateRules.length > 0);
    });

    it('gated container records rule evaluation', async () => {
      const containerId = Ids.entity();
      
      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: containerId,
        aggregateVersion: 1,
        actor: acmeCorp.actor,
        timestamp: Date.now(),
        payload: {
          physics: {
            permeability: 'Gated',
            gateRules: [{ type: 'RequireRole', role: 'Employee' }],
          },
        },
      });

      // Access attempt with rule evaluation
      await ledger.eventStore.append({
        type: 'AccessAttempted',
        aggregateType: 'Container' as any,
        aggregateId: containerId,
        aggregateVersion: 2,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          entityId: alice.id,
          rulesEvaluated: [
            { rule: 'RequireRole:Employee', result: true, reason: 'Has Employee role' },
          ],
          overallResult: 'Granted',
        },
      });

      const events = await ledger.getAllEvents();
      const access = events.find(e => e.type === 'AccessAttempted');
      
      assert(access.payload.rulesEvaluated, 'Rule evaluation should be recorded');
      assert.strictEqual(access.payload.overallResult, 'Granted');
    });
  });

  describe('3. Open Containers', () => {
    it('open container accepts any deposit', async () => {
      const containerId = Ids.entity();
      const assetId = Ids.entity();
      
      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: containerId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          name: 'Public Inbox',
          physics: { permeability: 'Open' },
        },
      });

      // Anyone can deposit
      await ledger.eventStore.append({
        type: 'AssetDeposited',
        aggregateType: 'Container' as any,
        aggregateId: containerId,
        aggregateVersion: 2,
        actor: bob.actor,
        timestamp: Date.now(),
        payload: {
          assetId: assetId,
          fromEntityId: bob.id,
          governingAgreement: null, // No agreement needed
          result: 'Accepted',
        },
      });

      const events = await ledger.getAllEvents();
      const deposit = events.find(e => e.type === 'AssetDeposited');
      
      assert.strictEqual(deposit.payload.result, 'Accepted');
    });

    it('open container still tracks all deposits', async () => {
      const containerId = Ids.entity();
      
      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: containerId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: { physics: { permeability: 'Open' } },
      });

      // Multiple deposits from different actors
      for (let i = 0; i < 5; i++) {
        await ledger.eventStore.append({
          type: 'AssetDeposited',
          aggregateType: 'Container' as any,
          aggregateId: containerId,
          aggregateVersion: i + 2,
          actor: i % 2 === 0 ? alice.actor : bob.actor,
          timestamp: Date.now(),
          payload: {
            assetId: Ids.entity(),
            fromEntityId: i % 2 === 0 ? alice.id : bob.id,
          },
        });
      }

      const events = await ledger.getAllEvents();
      const deposits = events.filter(e => e.type === 'AssetDeposited');
      
      assert.strictEqual(deposits.length, 5, 'All deposits tracked');
      
      // Verify different actors are recorded
      const actors = new Set(deposits.map(d => JSON.stringify(d.actor)));
      assert.strictEqual(actors.size, 2, 'Different actors tracked');
    });
  });

  describe('4. Withdrawal Rules', () => {
    it('sealed container requires agreement for withdrawal', async () => {
      const containerId = Ids.entity();
      const assetId = Ids.entity();
      
      await ledger.eventStore.append({
        type: 'WithdrawalAttempted',
        aggregateType: 'Container' as any,
        aggregateId: containerId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          assetId: assetId,
          toEntityId: alice.id,
          containerPermeability: 'Sealed',
          governingAgreement: null,
          result: 'Rejected',
          reason: 'Sealed container requires governing agreement for withdrawal',
        },
      });

      const events = await ledger.getAllEvents();
      const withdrawal = events[0];
      
      assert.strictEqual(withdrawal.payload.result, 'Rejected');
    });

    it('withdrawal records destination', async () => {
      const containerId = Ids.entity();
      const assetId = Ids.entity();
      const agreementId = Ids.agreement();
      
      await ledger.eventStore.append({
        type: 'AssetWithdrawn',
        aggregateType: 'Container' as any,
        aggregateId: containerId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          assetId: assetId,
          toEntityId: bob.id,
          toContainerId: Ids.entity(),
          governingAgreement: agreementId,
        },
      });

      const events = await ledger.getAllEvents();
      const withdrawal = events[0];
      
      assert(withdrawal.payload.toEntityId, 'Destination entity recorded');
      assert(withdrawal.payload.toContainerId, 'Destination container recorded');
      assert(withdrawal.payload.governingAgreement, 'Governing agreement recorded');
    });
  });
});
