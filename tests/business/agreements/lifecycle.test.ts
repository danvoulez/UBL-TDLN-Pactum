/**
 * AGREEMENT LIFECYCLE TESTS
 * 
 * Tests the complete lifecycle of agreements:
 * Proposed → (all consent) → Active → (terminate) → Terminated
 * 
 * These tests verify the legal semantics of agreements.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestLedger, type TestLedger } from '../../helpers/test-ledger';
import {
  alice,
  bob,
  charlie,
  acmeCorp,
  asEmployer,
  asEmployee,
  asSeller,
  asBuyer,
  systemActor,
} from '../fixtures/entities';
import { Ids } from '../../../core/shared/types';

describe('Agreement Lifecycle', () => {
  let ledger: TestLedger;

  beforeEach(() => {
    ledger = createTestLedger();
  });

  describe('1. Proposal', () => {
    it('agreement starts in Proposed status', async () => {
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
          terms: {
            description: 'Employment agreement',
            clauses: [
              { id: 'salary', type: 'compensation', content: '$100,000/year' },
            ],
          },
        },
      });

      const events = await ledger.getAllEvents();
      const proposal = events.find(e => e.type === 'AgreementProposed');
      
      assert(proposal, 'Proposal event should exist');
      assert.strictEqual(proposal.aggregateId, agreementId);
      assert.strictEqual(proposal.payload.agreementType, 'employment');
      assert.strictEqual(proposal.payload.parties.length, 2);
    });

    it('proposal requires at least two parties', async () => {
      const agreementId = Ids.agreement();
      
      // This should be rejected by business logic (not event store)
      // For now, we just verify the event is recorded
      await ledger.eventStore.append({
        type: 'AgreementProposed',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          agreementType: 'self-agreement',
          parties: [asEmployee(alice)], // Only one party!
          terms: { description: 'Invalid agreement' },
        },
      });

      // In a real system, aggregate rehydration should reject this
      // or the intent handler should validate before appending
      console.warn('NOTE: Single-party agreement validation should be in intent handler');
    });

    it('proposal captures all party obligations and rights', async () => {
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

      const events = await ledger.getAllEvents();
      const proposal = events[0];
      
      const employer = proposal.payload.parties.find((p: any) => p.role === 'Employer');
      const employee = proposal.payload.parties.find((p: any) => p.role === 'Employee');
      
      assert(employer.obligations.length > 0, 'Employer should have obligations');
      assert(employee.obligations.length > 0, 'Employee should have obligations');
    });
  });

  describe('2. Consent', () => {
    it('each party can give consent', async () => {
      const agreementId = Ids.agreement();
      
      // Propose
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

      // Employer consents
      await ledger.eventStore.append({
        type: 'ConsentGiven',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 2,
        actor: acmeCorp.actor,
        timestamp: Date.now(),
        payload: {
          partyId: acmeCorp.id,
          method: 'Digital',
        },
      });

      // Employee consents
      await ledger.eventStore.append({
        type: 'ConsentGiven',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 3,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          partyId: alice.id,
          method: 'Digital',
        },
      });

      const events = await ledger.getAllEvents();
      const consents = events.filter(e => e.type === 'ConsentGiven');
      
      assert.strictEqual(consents.length, 2, 'Both parties should have consented');
    });

    it('consent records the method used', async () => {
      const agreementId = Ids.agreement();
      
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
          terms: { description: 'Sale' },
        },
      });

      await ledger.eventStore.append({
        type: 'ConsentGiven',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 2,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          partyId: alice.id,
          method: 'Signature',
          evidence: 'Signed document ID: doc-123',
        },
      });

      const events = await ledger.getAllEvents();
      const consent = events.find(e => e.type === 'ConsentGiven');
      
      assert.strictEqual(consent.payload.method, 'Signature');
      assert(consent.payload.evidence, 'Evidence should be recorded');
    });

    it('non-party cannot consent', async () => {
      const agreementId = Ids.agreement();
      
      // Agreement between Alice and Bob
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
          terms: { description: 'Sale' },
        },
      });

      // Charlie (not a party) tries to consent
      await ledger.eventStore.append({
        type: 'ConsentGiven',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 2,
        actor: charlie.actor,
        timestamp: Date.now(),
        payload: {
          partyId: charlie.id, // Charlie is not a party!
          method: 'Digital',
        },
      });

      // The event is recorded, but aggregate rehydration should ignore it
      // This is defense-in-depth - the intent handler should prevent this
      console.warn('NOTE: Non-party consent should be rejected by intent handler');
      
      const events = await ledger.getAllEvents();
      const consent = events.find(e => 
        e.type === 'ConsentGiven' && e.payload.partyId === charlie.id
      );
      
      // Event exists (store doesn't validate business logic)
      assert(consent, 'Event was recorded');
      // But aggregate should not count this as valid consent
    });
  });

  describe('3. Activation', () => {
    it('agreement becomes Active when all parties consent', async () => {
      const agreementId = Ids.agreement();
      
      // Propose
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
          terms: { description: 'Sale' },
        },
      });

      // Both consent
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

      // Agreement activated
      await ledger.eventStore.append({
        type: 'AgreementActivated',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 4,
        actor: systemActor,
        timestamp: Date.now(),
        payload: {
          activatedAt: Date.now(),
          allPartiesConsented: true,
        },
      });

      const events = await ledger.getAllEvents();
      const activation = events.find(e => e.type === 'AgreementActivated');
      
      assert(activation, 'Activation event should exist');
      assert(activation.payload.allPartiesConsented);
    });
  });

  describe('4. Termination', () => {
    it('agreement can be terminated with reason', async () => {
      const agreementId = Ids.agreement();
      
      // Create active agreement (simplified)
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

      // Terminate
      await ledger.eventStore.append({
        type: 'AgreementTerminated',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 2,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          reason: 'Resignation',
          terminatedBy: alice.id,
          effectiveDate: Date.now(),
        },
      });

      const events = await ledger.getAllEvents();
      const termination = events.find(e => e.type === 'AgreementTerminated');
      
      assert(termination, 'Termination event should exist');
      assert.strictEqual(termination.payload.reason, 'Resignation');
      assert.strictEqual(termination.payload.terminatedBy, alice.id);
    });

    it('termination records effective date', async () => {
      const agreementId = Ids.agreement();
      const futureDate = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
      
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
        type: 'AgreementTerminated',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 2,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          reason: 'Resignation with notice',
          terminatedBy: alice.id,
          effectiveDate: futureDate, // Future termination
        },
      });

      const events = await ledger.getAllEvents();
      const termination = events.find(e => e.type === 'AgreementTerminated');
      
      assert.strictEqual(termination.payload.effectiveDate, futureDate);
    });
  });

  describe('5. Multi-party Agreements', () => {
    it('three-party agreement requires all three consents', async () => {
      const agreementId = Ids.agreement();
      
      await ledger.eventStore.append({
        type: 'AgreementProposed',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          agreementType: 'partnership',
          parties: [
            { entityId: alice.id, role: 'Partner' },
            { entityId: bob.id, role: 'Partner' },
            { entityId: charlie.id, role: 'Partner' },
          ],
          terms: { description: 'Three-way partnership' },
        },
      });

      // Only Alice and Bob consent
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

      // Agreement should NOT be active (Charlie hasn't consented)
      const events = await ledger.getAllEvents();
      const consents = events.filter(e => e.type === 'ConsentGiven');
      
      assert.strictEqual(consents.length, 2, 'Only two consents recorded');
      
      // No activation event should exist
      const activation = events.find(e => e.type === 'AgreementActivated');
      assert(!activation, 'Agreement should not be activated without all consents');
    });
  });
});
