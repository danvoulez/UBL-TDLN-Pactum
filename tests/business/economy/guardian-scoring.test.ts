/**
 * GUARDIAN SCORING TESTS
 * 
 * SPRINT D.1: Tests for guardian multi-dimensional scoring
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  GuardianScorer,
  createGuardianScorer,
  calculateGuardianScore,
  getTierDescription,
  canGuardianPerform,
  REPUTATION_ADJUSTMENTS,
  type GuardianMetrics,
  type GuardianTier,
} from '../../../core/economy/guardian-scoring';

describe('Guardian Scoring (SPRINT D.1)', () => {
  
  const baseMetrics: GuardianMetrics = {
    totalAgents: 20,
    activeAgents: 15,
    graduatedAgents: 3,
    failedAgents: 2,
    totalLoansIssued: 100000n,
    totalLoansRepaid: 85000n,
    defaultRate: 0.1,
    avgRepaymentTime: 90,
    avgAgentSurvivalDays: 180,
    interventionCount: 5,
    escalationCount: 2,
    baseReputation: 70,
    reputationHistory: [],
    guardianSince: Date.now() - 365 * 24 * 60 * 60 * 1000, // 1 year ago
    lastActivityAt: Date.now() - 1000 * 60 * 60, // 1 hour ago
  };
  
  describe('GuardianScorer', () => {
    it('calculates overall guardian score', () => {
      const scorer = createGuardianScorer();
      const score = scorer.calculate(baseMetrics);
      
      assert.ok(score.overall >= 0);
      assert.ok(score.overall <= 100);
      assert.ok(score.components);
      assert.ok(score.tier);
      assert.ok(score.privileges);
      assert.ok(score.calculatedAt);
    });
    
    it('returns all component scores', () => {
      const scorer = createGuardianScorer();
      const score = scorer.calculate(baseMetrics);
      
      assert.ok(score.components.portfolio >= 0 && score.components.portfolio <= 100);
      assert.ok(score.components.financial >= 0 && score.components.financial <= 100);
      assert.ok(score.components.support >= 0 && score.components.support <= 100);
      assert.ok(score.components.reputation >= 0 && score.components.reputation <= 100);
      assert.ok(score.components.tenure >= 0 && score.components.tenure <= 100);
    });
    
    it('assigns correct tier based on score', () => {
      const scorer = createGuardianScorer();
      
      // Excellent guardian
      const excellentMetrics: GuardianMetrics = {
        ...baseMetrics,
        activeAgents: 18,
        graduatedAgents: 10,
        failedAgents: 0,
        defaultRate: 0.02,
        totalLoansRepaid: 98000n,
        baseReputation: 95,
        avgAgentSurvivalDays: 365,
      };
      const excellentScore = scorer.calculate(excellentMetrics);
      assert.ok(['Platinum', 'Gold'].includes(excellentScore.tier));
      
      // Poor guardian
      const poorMetrics: GuardianMetrics = {
        ...baseMetrics,
        activeAgents: 5,
        graduatedAgents: 0,
        failedAgents: 10,
        defaultRate: 0.5,
        totalLoansRepaid: 30000n,
        baseReputation: 20,
        avgAgentSurvivalDays: 15,
        escalationCount: 10,
      };
      const poorScore = scorer.calculate(poorMetrics);
      assert.ok(['Probation', 'Suspended'].includes(poorScore.tier));
    });
    
    it('penalizes high default rate', () => {
      const scorer = createGuardianScorer();
      
      const lowDefault = scorer.calculate({ ...baseMetrics, defaultRate: 0.05 });
      const highDefault = scorer.calculate({ ...baseMetrics, defaultRate: 0.4 });
      
      assert.ok(lowDefault.components.financial > highDefault.components.financial);
    });
    
    it('rewards agent graduation', () => {
      const scorer = createGuardianScorer();
      
      const fewGraduates = scorer.calculate({ ...baseMetrics, graduatedAgents: 1 });
      const manyGraduates = scorer.calculate({ ...baseMetrics, graduatedAgents: 10 });
      
      assert.ok(manyGraduates.components.portfolio > fewGraduates.components.portfolio);
    });
    
    it('penalizes agent failures', () => {
      const scorer = createGuardianScorer();
      
      const fewFailures = scorer.calculate({ ...baseMetrics, failedAgents: 1 });
      const manyFailures = scorer.calculate({ ...baseMetrics, failedAgents: 10 });
      
      assert.ok(fewFailures.components.portfolio > manyFailures.components.portfolio);
    });
    
    it('rewards interventions', () => {
      const scorer = createGuardianScorer();
      
      const noInterventions = scorer.calculate({ ...baseMetrics, interventionCount: 0 });
      const manyInterventions = scorer.calculate({ ...baseMetrics, interventionCount: 10 });
      
      assert.ok(manyInterventions.components.support >= noInterventions.components.support);
    });
    
    it('penalizes escalations', () => {
      const scorer = createGuardianScorer();
      
      const fewEscalations = scorer.calculate({ ...baseMetrics, escalationCount: 1 });
      const manyEscalations = scorer.calculate({ ...baseMetrics, escalationCount: 10 });
      
      assert.ok(fewEscalations.components.support > manyEscalations.components.support);
    });
    
    it('applies reputation history', () => {
      const scorer = createGuardianScorer();
      
      const positiveHistory = scorer.calculate({
        ...baseMetrics,
        reputationHistory: [
          { timestamp: Date.now(), delta: 5, reason: 'Agent graduated' },
          { timestamp: Date.now(), delta: 3, reason: 'Crisis survival' },
        ],
      });
      
      const negativeHistory = scorer.calculate({
        ...baseMetrics,
        reputationHistory: [
          { timestamp: Date.now(), delta: -5, reason: 'Agent default' },
          { timestamp: Date.now(), delta: -5, reason: 'Agent default' },
        ],
      });
      
      assert.ok(positiveHistory.components.reputation > negativeHistory.components.reputation);
    });
    
    it('rewards tenure', () => {
      const scorer = createGuardianScorer();
      
      const newGuardian = scorer.calculate({
        ...baseMetrics,
        guardianSince: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days
      });
      
      const veteranGuardian = scorer.calculate({
        ...baseMetrics,
        guardianSince: Date.now() - 730 * 24 * 60 * 60 * 1000, // 2 years
      });
      
      assert.ok(veteranGuardian.components.tenure > newGuardian.components.tenure);
    });
  });
  
  describe('Warnings', () => {
    it('warns on high default rate', () => {
      const scorer = createGuardianScorer();
      const score = scorer.calculate({ ...baseMetrics, defaultRate: 0.4 });
      
      assert.ok(score.warnings.some(w => w.includes('default rate')));
    });
    
    it('warns on low agent survival', () => {
      const scorer = createGuardianScorer();
      const score = scorer.calculate({ ...baseMetrics, avgAgentSurvivalDays: 20 });
      
      assert.ok(score.warnings.some(w => w.includes('survival')));
    });
    
    it('warns on high escalations', () => {
      const scorer = createGuardianScorer();
      const score = scorer.calculate({ ...baseMetrics, escalationCount: 10 });
      
      assert.ok(score.warnings.some(w => w.includes('escalation')));
    });
    
    it('warns on inactivity', () => {
      const scorer = createGuardianScorer();
      const score = scorer.calculate({
        ...baseMetrics,
        lastActivityAt: Date.now() - 20 * 24 * 60 * 60 * 1000, // 20 days ago
      });
      
      assert.ok(score.warnings.some(w => w.includes('Inactive')));
    });
  });
  
  describe('Privileges', () => {
    it('Platinum tier has maximum privileges', () => {
      const scorer = createGuardianScorer();
      const excellentMetrics: GuardianMetrics = {
        ...baseMetrics,
        activeAgents: 18,
        graduatedAgents: 15,
        failedAgents: 0,
        defaultRate: 0.01,
        totalLoansRepaid: 99000n,
        baseReputation: 98,
        avgAgentSurvivalDays: 500,
      };
      
      const score = scorer.calculate(excellentMetrics);
      
      if (score.tier === 'Platinum') {
        assert.strictEqual(score.privileges.maxAgents, 100);
        assert.strictEqual(score.privileges.canSponsorNewAgents, true);
        assert.strictEqual(score.privileges.canIssueLoans, true);
        assert.strictEqual(score.privileges.requiresOversight, false);
        assert.strictEqual(score.privileges.votingWeight, 3);
      }
    });
    
    it('Suspended tier has no privileges', () => {
      const scorer = createGuardianScorer();
      const terribleMetrics: GuardianMetrics = {
        ...baseMetrics,
        activeAgents: 0,
        graduatedAgents: 0,
        failedAgents: 20,
        defaultRate: 0.9,
        totalLoansRepaid: 5000n,
        baseReputation: 5,
        avgAgentSurvivalDays: 5,
        escalationCount: 20,
      };
      
      const score = scorer.calculate(terribleMetrics);
      
      if (score.tier === 'Suspended') {
        assert.strictEqual(score.privileges.maxAgents, 0);
        assert.strictEqual(score.privileges.canSponsorNewAgents, false);
        assert.strictEqual(score.privileges.canIssueLoans, false);
        assert.strictEqual(score.privileges.votingWeight, 0);
      }
    });
  });
  
  describe('canGuardianPerform', () => {
    it('checks sponsor permission', () => {
      const scorer = createGuardianScorer();
      const score = scorer.calculate(baseMetrics);
      
      const canSponsor = canGuardianPerform(score, 'sponsor');
      assert.strictEqual(canSponsor, score.privileges.canSponsorNewAgents);
    });
    
    it('checks loan permission', () => {
      const scorer = createGuardianScorer();
      const score = scorer.calculate(baseMetrics);
      
      const canLoan = canGuardianPerform(score, 'loan');
      assert.strictEqual(canLoan, score.privileges.canIssueLoans);
    });
    
    it('checks vote permission', () => {
      const scorer = createGuardianScorer();
      const score = scorer.calculate(baseMetrics);
      
      const canVote = canGuardianPerform(score, 'vote');
      assert.strictEqual(canVote, score.privileges.votingWeight > 0);
    });
  });
  
  describe('Reputation Adjustments', () => {
    it('defines standard adjustments', () => {
      assert.ok(REPUTATION_ADJUSTMENTS.AGENT_DEFAULT);
      assert.ok(REPUTATION_ADJUSTMENTS.AGENT_DEFAULT.delta < 0);
      
      assert.ok(REPUTATION_ADJUSTMENTS.AGENT_GRADUATED);
      assert.ok(REPUTATION_ADJUSTMENTS.AGENT_GRADUATED.delta > 0);
      
      assert.ok(REPUTATION_ADJUSTMENTS.POLICY_VIOLATION);
      assert.ok(REPUTATION_ADJUSTMENTS.POLICY_VIOLATION.delta < 0);
    });
  });
  
  describe('Tier Descriptions', () => {
    it('provides descriptions for all tiers', () => {
      const tiers: GuardianTier[] = ['Platinum', 'Gold', 'Silver', 'Bronze', 'Probation', 'Suspended'];
      
      for (const tier of tiers) {
        const desc = getTierDescription(tier);
        assert.ok(desc.length > 0);
      }
    });
  });
  
  describe('Edge Cases', () => {
    it('handles new guardian with no agents', () => {
      const scorer = createGuardianScorer();
      
      const newGuardian: GuardianMetrics = {
        totalAgents: 0,
        activeAgents: 0,
        graduatedAgents: 0,
        failedAgents: 0,
        totalLoansIssued: 0n,
        totalLoansRepaid: 0n,
        defaultRate: 0,
        avgRepaymentTime: 0,
        avgAgentSurvivalDays: 0,
        interventionCount: 0,
        escalationCount: 0,
        baseReputation: 50,
        reputationHistory: [],
        guardianSince: Date.now(),
        lastActivityAt: Date.now(),
      };
      
      const score = scorer.calculate(newGuardian);
      assert.ok(score.overall >= 0);
      assert.ok(score.overall <= 100);
    });
  });
  
  describe('Quick Calculate', () => {
    it('calculateGuardianScore works', () => {
      const score = calculateGuardianScore(baseMetrics);
      
      assert.ok(score.overall >= 0);
      assert.ok(score.tier);
    });
  });
});
