/**
 * THREE-BRANCH GOVERNANCE TESTS
 * 
 * SPRINT E.1: Tests for separation of powers
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  GovernanceCoordinator,
  createGovernanceCoordinator,
  type ExecutiveAction,
  type Proposal,
  type Case,
} from '../../../core/governance/three-branch';
import type { EntityId } from '../../../core/schema/ledger';

describe('Three-Branch Governance (SPRINT E.1)', () => {
  
  let governance: GovernanceCoordinator;
  
  beforeEach(() => {
    governance = createGovernanceCoordinator({
      quorums: {
        executive: 0.5,
        legislative: 0.1, // Low for testing
        judicial: 0.5,
      },
      votingPeriods: {
        standard: 1000, // 1 second for testing
        emergency: 100,
        constitutional: 5000,
      },
      vetoThresholds: {
        executiveVeto: 0.67,
        judicialReview: 0.75,
      },
    });
  });
  
  describe('Executive Branch', () => {
    it('proposes an action', () => {
      const action = governance.proposeExecutiveAction({
        type: 'SetParameter',
        proposedBy: 'admin-1' as EntityId,
        parameters: { interestRate: 0.05 },
      });
      
      assert.ok(action.id);
      assert.strictEqual(action.status, 'Proposed');
      assert.strictEqual(action.type, 'SetParameter');
    });
    
    it('approves and executes an action', async () => {
      const action = governance.proposeExecutiveAction({
        type: 'AllocateFunds',
        proposedBy: 'admin-1' as EntityId,
        parameters: { amount: 1000n, recipient: 'treasury' },
      });
      
      governance.approveAction(action.id);
      const executed = await governance.executeAction(action.id, 'executor-1' as EntityId);
      
      assert.strictEqual(executed.status, 'Executed');
      assert.ok(executed.executedAt);
      assert.strictEqual(executed.executedBy, 'executor-1');
    });
    
    it('vetoes an action', () => {
      const action = governance.proposeExecutiveAction({
        type: 'DeclareEmergency',
        proposedBy: 'admin-1' as EntityId,
        parameters: { reason: 'test' },
      });
      
      const vetoed = governance.vetoAction(action.id, 'Legislative', 'Overreach');
      
      assert.strictEqual(vetoed.status, 'Vetoed');
      assert.strictEqual(vetoed.vetoedBy, 'Legislative');
      assert.strictEqual(vetoed.vetoReason, 'Overreach');
    });
    
    it('rejects execution of non-approved action', async () => {
      const action = governance.proposeExecutiveAction({
        type: 'SetParameter',
        proposedBy: 'admin-1' as EntityId,
        parameters: {},
      });
      
      await assert.rejects(
        () => governance.executeAction(action.id, 'executor-1' as EntityId),
        /not approved/
      );
    });
  });
  
  describe('Legislative Branch', () => {
    it('submits a proposal', () => {
      const proposal = governance.submitProposal({
        type: 'Policy',
        title: 'New Interest Rate Policy',
        description: 'Set base interest rate to 5%',
        proposedBy: 'legislator-1' as EntityId,
        content: {
          parameters: { baseInterestRate: 0.05 },
        },
      });
      
      assert.ok(proposal.id);
      assert.strictEqual(proposal.status, 'Voting');
      assert.strictEqual(proposal.votes.for, 0);
    });
    
    it('records votes', () => {
      const proposal = governance.submitProposal({
        type: 'Budget',
        title: 'Q1 Budget',
        description: 'Allocate funds for Q1',
        proposedBy: 'legislator-1' as EntityId,
        content: {
          budgetAllocations: [
            { category: 'operations', amount: 10000n, period: 'Quarterly' },
          ],
        },
      });
      
      governance.vote(proposal.id, 'voter-1' as EntityId, 'for');
      governance.vote(proposal.id, 'voter-2' as EntityId, 'for');
      governance.vote(proposal.id, 'voter-3' as EntityId, 'against');
      
      const updated = governance.getProposal(proposal.id);
      assert.strictEqual(updated?.votes.for, 2);
      assert.strictEqual(updated?.votes.against, 1);
      assert.strictEqual(updated?.votes.voters.length, 3);
    });
    
    it('prevents double voting', () => {
      const proposal = governance.submitProposal({
        type: 'Policy',
        title: 'Test',
        description: 'Test',
        proposedBy: 'legislator-1' as EntityId,
        content: {},
      });
      
      governance.vote(proposal.id, 'voter-1' as EntityId, 'for');
      
      assert.throws(
        () => governance.vote(proposal.id, 'voter-1' as EntityId, 'against'),
        /Already voted/
      );
    });
    
    it('finalizes voting', () => {
      const proposal = governance.submitProposal({
        type: 'Policy',
        title: 'Test',
        description: 'Test',
        proposedBy: 'legislator-1' as EntityId,
        content: {},
      });
      
      // Vote with quorum (10% = 10 voters)
      for (let i = 0; i < 15; i++) {
        governance.vote(proposal.id, `voter-${i}` as EntityId, i < 10 ? 'for' : 'against');
      }
      
      const finalized = governance.finalizeVoting(proposal.id);
      assert.strictEqual(finalized.status, 'Passed');
    });
    
    it('fails proposal without majority', () => {
      const proposal = governance.submitProposal({
        type: 'Policy',
        title: 'Unpopular',
        description: 'Test',
        proposedBy: 'legislator-1' as EntityId,
        content: {},
      });
      
      for (let i = 0; i < 15; i++) {
        governance.vote(proposal.id, `voter-${i}` as EntityId, i < 5 ? 'for' : 'against');
      }
      
      const finalized = governance.finalizeVoting(proposal.id);
      assert.strictEqual(finalized.status, 'Failed');
    });
  });
  
  describe('Judicial Branch', () => {
    it('files a case', () => {
      const caseData = governance.fileCase({
        type: 'Dispute',
        title: 'Contract Breach',
        description: 'Party A failed to deliver',
        filedBy: 'plaintiff-1' as EntityId,
        parties: [
          { entityId: 'plaintiff-1' as EntityId, role: 'Plaintiff' },
          { entityId: 'defendant-1' as EntityId, role: 'Defendant' },
        ],
      });
      
      assert.ok(caseData.id);
      assert.strictEqual(caseData.status, 'Filed');
      assert.strictEqual(caseData.parties.length, 2);
    });
    
    it('submits evidence', () => {
      const caseData = governance.fileCase({
        type: 'Violation',
        title: 'Rule Violation',
        description: 'Entity violated rule X',
        filedBy: 'prosecutor-1' as EntityId,
        parties: [
          { entityId: 'defendant-1' as EntityId, role: 'Defendant' },
        ],
      });
      
      const evidence = governance.submitEvidence(caseData.id, {
        type: 'Document',
        submittedBy: 'prosecutor-1' as EntityId,
        content: { document: 'proof.pdf' },
      });
      
      assert.ok(evidence.id);
      assert.strictEqual(evidence.admitted, true);
      
      const updated = governance.getCase(caseData.id);
      assert.strictEqual(updated?.evidence.length, 1);
    });
    
    it('issues ruling', () => {
      const caseData = governance.fileCase({
        type: 'Dispute',
        title: 'Payment Dispute',
        description: 'Unpaid invoice',
        filedBy: 'plaintiff-1' as EntityId,
        parties: [
          { entityId: 'plaintiff-1' as EntityId, role: 'Plaintiff' },
          { entityId: 'defendant-1' as EntityId, role: 'Defendant' },
        ],
      });
      
      const decided = governance.issueRuling(caseData.id, {
        decision: 'ForPlaintiff',
        reasoning: 'Evidence supports claim',
        remedies: [
          { type: 'Compensation', description: 'Pay invoice', amount: 1000n },
        ],
        issuedBy: 'judge-1' as EntityId,
      });
      
      assert.strictEqual(decided.status, 'Decided');
      assert.strictEqual(decided.ruling?.decision, 'ForPlaintiff');
    });
    
    it('files appeal', () => {
      const caseData = governance.fileCase({
        type: 'Dispute',
        title: 'Test',
        description: 'Test',
        filedBy: 'plaintiff-1' as EntityId,
        parties: [],
      });
      
      governance.issueRuling(caseData.id, {
        decision: 'ForDefendant',
        reasoning: 'Insufficient evidence',
        issuedBy: 'judge-1' as EntityId,
      });
      
      const appeal = governance.fileAppeal(caseData.id, {
        filedBy: 'plaintiff-1' as EntityId,
        grounds: 'New evidence discovered',
      });
      
      assert.ok(appeal.id);
      assert.strictEqual(appeal.status, 'Pending');
      
      const updated = governance.getCase(caseData.id);
      assert.strictEqual(updated?.status, 'Appealed');
    });
    
    it('reviews constitutionality', () => {
      const review = governance.reviewConstitutionality('action-1', 'ExecutiveAction');
      
      assert.strictEqual(review.targetId, 'action-1');
      assert.strictEqual(review.targetType, 'ExecutiveAction');
      assert.ok(review.reviewedAt);
    });
  });
  
  describe('Cross-Branch Operations', () => {
    it('legislative vetoes executive action', () => {
      const action = governance.proposeExecutiveAction({
        type: 'DeclareEmergency',
        proposedBy: 'admin-1' as EntityId,
        parameters: {},
      });
      
      const proposal = governance.submitProposal({
        type: 'Resolution',
        title: 'Veto Emergency',
        description: 'Block emergency declaration',
        proposedBy: 'legislator-1' as EntityId,
        content: {},
      });
      
      // Pass the proposal
      for (let i = 0; i < 15; i++) {
        governance.vote(proposal.id, `voter-${i}` as EntityId, 'for');
      }
      governance.finalizeVoting(proposal.id);
      
      const vetoed = governance.legislativeVeto(action.id, proposal.id);
      assert.strictEqual(vetoed.status, 'Vetoed');
      assert.strictEqual(vetoed.vetoedBy, 'Legislative');
    });
    
    it('executive vetoes legislative proposal', () => {
      const proposal = governance.submitProposal({
        type: 'Policy',
        title: 'Controversial Policy',
        description: 'Test',
        proposedBy: 'legislator-1' as EntityId,
        content: {},
      });
      
      for (let i = 0; i < 15; i++) {
        governance.vote(proposal.id, `voter-${i}` as EntityId, 'for');
      }
      governance.finalizeVoting(proposal.id);
      
      const vetoed = governance.executiveVeto(proposal.id, 'Policy concerns');
      assert.strictEqual(vetoed.status, 'Vetoed');
    });
    
    it('legislative overrides executive veto', () => {
      const proposal = governance.submitProposal({
        type: 'Policy',
        title: 'Important Policy',
        description: 'Test',
        proposedBy: 'legislator-1' as EntityId,
        content: {},
      });
      
      // Need 2/3 majority to override
      for (let i = 0; i < 100; i++) {
        governance.vote(proposal.id, `voter-${i}` as EntityId, i < 70 ? 'for' : 'against');
      }
      governance.finalizeVoting(proposal.id);
      governance.executiveVeto(proposal.id, 'Disagree');
      
      const enacted = governance.overrideVeto(proposal.id);
      assert.strictEqual(enacted.status, 'Enacted');
    });
    
    it('fails to override without supermajority', () => {
      const proposal = governance.submitProposal({
        type: 'Policy',
        title: 'Weak Policy',
        description: 'Test',
        proposedBy: 'legislator-1' as EntityId,
        content: {},
      });
      
      // Only simple majority
      for (let i = 0; i < 100; i++) {
        governance.vote(proposal.id, `voter-${i}` as EntityId, i < 55 ? 'for' : 'against');
      }
      governance.finalizeVoting(proposal.id);
      governance.executiveVeto(proposal.id, 'Disagree');
      
      assert.throws(
        () => governance.overrideVeto(proposal.id),
        /Override failed/
      );
    });
  });
  
  describe('Statistics', () => {
    it('provides governance statistics', () => {
      // Create some actions
      governance.proposeExecutiveAction({
        type: 'SetParameter',
        proposedBy: 'admin-1' as EntityId,
        parameters: {},
      });
      
      // Create some proposals
      const proposal = governance.submitProposal({
        type: 'Policy',
        title: 'Test',
        description: 'Test',
        proposedBy: 'legislator-1' as EntityId,
        content: {},
      });
      for (let i = 0; i < 15; i++) {
        governance.vote(proposal.id, `voter-${i}` as EntityId, 'for');
      }
      governance.finalizeVoting(proposal.id);
      
      // Create some cases
      governance.fileCase({
        type: 'Dispute',
        title: 'Test',
        description: 'Test',
        filedBy: 'plaintiff-1' as EntityId,
        parties: [],
      });
      
      const stats = governance.getStats();
      
      assert.strictEqual(stats.executive.total, 1);
      assert.strictEqual(stats.executive.pending, 1);
      assert.strictEqual(stats.legislative.total, 1);
      assert.strictEqual(stats.legislative.passed, 1);
      assert.strictEqual(stats.judicial.total, 1);
      assert.strictEqual(stats.judicial.active, 1);
    });
  });
  
  describe('Factory', () => {
    it('createGovernanceCoordinator uses defaults', () => {
      const defaultGov = createGovernanceCoordinator();
      assert.ok(defaultGov);
    });
  });
});
