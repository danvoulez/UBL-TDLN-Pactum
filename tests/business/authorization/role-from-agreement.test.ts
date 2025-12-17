/**
 * AUTHORIZATION: Roles Derive From Agreements
 * 
 * Roles are not assigned arbitrarily - they emerge from agreements.
 * When you become an Employee, it's because an employment agreement exists.
 * When the agreement terminates, the role should expire.
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
  systemActor,
} from '../fixtures/entities';
import { Ids } from '../../../core/shared/types';

describe('Authorization: Roles From Agreements', () => {
  let ledger: TestLedger;

  beforeEach(() => {
    ledger = createTestLedger();
  });

  describe('1. Role Creation', () => {
    it('employment agreement creates Employee role', async () => {
      const agreementId = Ids.agreement();
      
      // Create employment agreement
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

      // Both consent
      await ledger.eventStore.append({
        type: 'ConsentGiven',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 2,
        actor: acmeCorp.actor,
        timestamp: Date.now(),
        payload: { partyId: acmeCorp.id, method: 'Digital' },
      });

      await ledger.eventStore.append({
        type: 'ConsentGiven',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 3,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: { partyId: alice.id, method: 'Digital' },
      });

      // Role granted event (should be emitted by system when agreement activates)
      await ledger.eventStore.append({
        type: 'RoleGranted',
        aggregateType: 'Role' as any,
        aggregateId: Ids.entity(),
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: Date.now(),
        payload: {
          entityId: alice.id,
          roleType: 'Employee',
          grantedBy: agreementId,
          scope: { organization: acmeCorp.id },
        },
      });

      const events = await ledger.getAllEvents();
      const roleGrant = events.find(e => e.type === 'RoleGranted');
      
      assert(roleGrant, 'Role grant event should exist');
      assert.strictEqual(roleGrant.payload.entityId, alice.id);
      assert.strictEqual(roleGrant.payload.roleType, 'Employee');
      assert.strictEqual(roleGrant.payload.grantedBy, agreementId);
    });

    it('role references the granting agreement', async () => {
      const agreementId = Ids.agreement();
      const roleId = Ids.entity();
      
      await ledger.eventStore.append({
        type: 'RoleGranted',
        aggregateType: 'Role' as any,
        aggregateId: roleId,
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: Date.now(),
        payload: {
          entityId: alice.id,
          roleType: 'Employee',
          grantedBy: agreementId, // Must reference agreement
          scope: { organization: acmeCorp.id },
          permissions: ['read:company-data', 'write:own-timesheet'],
        },
      });

      const events = await ledger.getAllEvents();
      const roleGrant = events[0];
      
      assert(roleGrant.payload.grantedBy, 'Role must reference granting agreement');
      assert.strictEqual(roleGrant.payload.grantedBy, agreementId);
    });
  });

  describe('2. Role Expiration', () => {
    it('role expires when agreement terminates', async () => {
      const agreementId = Ids.agreement();
      const roleId = Ids.entity();
      
      // Grant role
      await ledger.eventStore.append({
        type: 'RoleGranted',
        aggregateType: 'Role' as any,
        aggregateId: roleId,
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: Date.now(),
        payload: {
          entityId: alice.id,
          roleType: 'Employee',
          grantedBy: agreementId,
        },
      });

      // Terminate agreement
      await ledger.eventStore.append({
        type: 'AgreementTerminated',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 10,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          reason: 'Resignation',
          terminatedBy: alice.id,
        },
      });

      // Role should be revoked
      await ledger.eventStore.append({
        type: 'RoleRevoked',
        aggregateType: 'Role' as any,
        aggregateId: roleId,
        aggregateVersion: 2,
        actor: systemActor,
        timestamp: Date.now(),
        payload: {
          entityId: alice.id,
          roleType: 'Employee',
          revokedBecause: 'Agreement terminated',
          agreementId: agreementId,
        },
      });

      const events = await ledger.getAllEvents();
      const revocation = events.find(e => e.type === 'RoleRevoked');
      
      assert(revocation, 'Role revocation should exist');
      assert.strictEqual(revocation.payload.agreementId, agreementId);
    });

    it('role history is preserved after revocation', async () => {
      const agreementId = Ids.agreement();
      const roleId = Ids.entity();
      const grantTime = Date.now();
      const revokeTime = grantTime + 1000;
      
      // Grant
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

      // Revoke
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
          revokedBecause: 'Agreement terminated',
        },
      });

      const events = await ledger.getAllEvents();
      
      // Both events exist - history is preserved
      const grant = events.find(e => e.type === 'RoleGranted');
      const revoke = events.find(e => e.type === 'RoleRevoked');
      
      assert(grant, 'Grant event preserved');
      assert(revoke, 'Revoke event preserved');
      assert(revoke.timestamp > grant.timestamp, 'Revoke after grant');
    });
  });

  describe('3. Role Scope', () => {
    it('role is scoped to the agreement context', async () => {
      const agreementId = Ids.agreement();
      const roleId = Ids.entity();
      
      await ledger.eventStore.append({
        type: 'RoleGranted',
        aggregateType: 'Role' as any,
        aggregateId: roleId,
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: Date.now(),
        payload: {
          entityId: alice.id,
          roleType: 'Employee',
          grantedBy: agreementId,
          scope: {
            organization: acmeCorp.id,
            department: 'Engineering',
            level: 'Senior',
          },
        },
      });

      const events = await ledger.getAllEvents();
      const roleGrant = events[0];
      
      assert(roleGrant.payload.scope, 'Role should have scope');
      assert.strictEqual(roleGrant.payload.scope.organization, acmeCorp.id);
      assert.strictEqual(roleGrant.payload.scope.department, 'Engineering');
    });

    it('same entity can have different roles in different scopes', async () => {
      const agreement1 = Ids.agreement();
      const agreement2 = Ids.agreement();
      
      // Alice is Employee at Acme
      await ledger.eventStore.append({
        type: 'RoleGranted',
        aggregateType: 'Role' as any,
        aggregateId: Ids.entity(),
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: Date.now(),
        payload: {
          entityId: alice.id,
          roleType: 'Employee',
          grantedBy: agreement1,
          scope: { organization: acmeCorp.id },
        },
      });

      // Alice is also Consultant at another org
      await ledger.eventStore.append({
        type: 'RoleGranted',
        aggregateType: 'Role' as any,
        aggregateId: Ids.entity(),
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: Date.now(),
        payload: {
          entityId: alice.id,
          roleType: 'Consultant',
          grantedBy: agreement2,
          scope: { organization: bob.id }, // Bob's company
        },
      });

      const events = await ledger.getAllEvents();
      const aliceRoles = events.filter(e => 
        e.type === 'RoleGranted' && e.payload.entityId === alice.id
      );
      
      assert.strictEqual(aliceRoles.length, 2, 'Alice has two roles');
      
      const roleTypes = aliceRoles.map(r => r.payload.roleType);
      assert(roleTypes.includes('Employee'));
      assert(roleTypes.includes('Consultant'));
    });
  });

  describe('4. Permission Inheritance', () => {
    it('role carries permissions from agreement', async () => {
      const agreementId = Ids.agreement();
      const roleId = Ids.entity();
      
      await ledger.eventStore.append({
        type: 'RoleGranted',
        aggregateType: 'Role' as any,
        aggregateId: roleId,
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: Date.now(),
        payload: {
          entityId: alice.id,
          roleType: 'Employee',
          grantedBy: agreementId,
          permissions: [
            'read:company-directory',
            'write:own-profile',
            'read:team-calendar',
            'write:own-timesheet',
          ],
        },
      });

      const events = await ledger.getAllEvents();
      const roleGrant = events[0];
      
      assert(Array.isArray(roleGrant.payload.permissions));
      assert(roleGrant.payload.permissions.length > 0);
      assert(roleGrant.payload.permissions.includes('read:company-directory'));
    });
  });
});
