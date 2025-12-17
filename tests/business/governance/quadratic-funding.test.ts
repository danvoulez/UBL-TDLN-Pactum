/**
 * QUADRATIC FUNDING TESTS
 * 
 * SPRINT E.1: Tests for public goods funding
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  QuadraticFundingEngine,
  createQuadraticFundingEngine,
} from '../../../core/governance/quadratic-funding';
import type { EntityId } from '../../../core/schema/ledger';

describe('Quadratic Funding (SPRINT E.1)', () => {
  
  let engine: QuadraticFundingEngine;
  
  beforeEach(() => {
    engine = createQuadraticFundingEngine({
      matchingPool: 10000n,
      minContribution: 1n,
      maxContribution: 1000n,
      roundDuration: 1000, // 1 second for testing
      requireVerification: false,
      projectMatchingCap: 0.5, // 50% max per project
    });
  });
  
  describe('Funding Rounds', () => {
    it('creates a funding round', () => {
      const round = engine.createRound('Q1 2024', 'First quarter funding');
      
      assert.ok(round.id);
      assert.strictEqual(round.name, 'Q1 2024');
      assert.strictEqual(round.status, 'Active');
      assert.strictEqual(round.matchingPool, 10000n);
    });
    
    it('creates round with custom matching pool', () => {
      const round = engine.createRound('Special', 'Special round', 50000n);
      
      assert.strictEqual(round.matchingPool, 50000n);
    });
    
    it('tracks active rounds', () => {
      engine.createRound('Round 1', 'First');
      engine.createRound('Round 2', 'Second');
      
      const active = engine.getActiveRounds();
      assert.strictEqual(active.length, 2);
    });
  });
  
  describe('Projects', () => {
    it('submits a project', () => {
      const round = engine.createRound('Q1', 'Test');
      const project = engine.submitProject(
        round.id,
        'Open Source Library',
        'A useful library for everyone',
        'owner-1' as EntityId
      );
      
      assert.ok(project.id);
      assert.strictEqual(project.name, 'Open Source Library');
      assert.strictEqual(project.status, 'Approved');
      assert.strictEqual(project.contributions.length, 0);
    });
    
    it('tracks projects in round', () => {
      const round = engine.createRound('Q1', 'Test');
      engine.submitProject(round.id, 'Project 1', 'Desc', 'owner-1' as EntityId);
      engine.submitProject(round.id, 'Project 2', 'Desc', 'owner-2' as EntityId);
      
      const projects = engine.getProjectsInRound(round.id);
      assert.strictEqual(projects.length, 2);
      
      const updatedRound = engine.getRound(round.id);
      assert.strictEqual(updatedRound?.projectCount, 2);
    });
  });
  
  describe('Contributions', () => {
    it('accepts contribution', () => {
      const round = engine.createRound('Q1', 'Test');
      const project = engine.submitProject(round.id, 'Project', 'Desc', 'owner' as EntityId);
      
      const contribution = engine.contribute(
        project.id,
        'donor-1' as EntityId,
        100n
      );
      
      assert.ok(contribution.id);
      assert.strictEqual(contribution.amount, 100n);
      assert.strictEqual(contribution.contributor, 'donor-1');
    });
    
    it('rejects contribution below minimum', () => {
      const round = engine.createRound('Q1', 'Test');
      const project = engine.submitProject(round.id, 'Project', 'Desc', 'owner' as EntityId);
      
      // Min is 1n, but let's test with a different config
      const strictEngine = createQuadraticFundingEngine({ minContribution: 10n });
      const strictRound = strictEngine.createRound('Q1', 'Test');
      const strictProject = strictEngine.submitProject(strictRound.id, 'P', 'D', 'o' as EntityId);
      
      assert.throws(
        () => strictEngine.contribute(strictProject.id, 'donor' as EntityId, 5n),
        /below minimum/
      );
    });
    
    it('rejects contribution above maximum', () => {
      const round = engine.createRound('Q1', 'Test');
      const project = engine.submitProject(round.id, 'Project', 'Desc', 'owner' as EntityId);
      
      assert.throws(
        () => engine.contribute(project.id, 'donor' as EntityId, 5000n),
        /above maximum/
      );
    });
    
    it('tracks contributor count', () => {
      const round = engine.createRound('Q1', 'Test');
      const project = engine.submitProject(round.id, 'Project', 'Desc', 'owner' as EntityId);
      
      engine.contribute(project.id, 'donor-1' as EntityId, 100n);
      engine.contribute(project.id, 'donor-2' as EntityId, 50n);
      engine.contribute(project.id, 'donor-3' as EntityId, 25n);
      
      const updatedRound = engine.getRound(round.id);
      assert.strictEqual(updatedRound?.contributorCount, 3);
    });
  });
  
  describe('Quadratic Calculation', () => {
    it('calculates quadratic funding correctly', () => {
      const round = engine.createRound('Q1', 'Test');
      const project = engine.submitProject(round.id, 'Project', 'Desc', 'owner' as EntityId);
      
      // 4 contributors with 25 each = √25 * 4 = 20, squared = 400
      // Direct = 100, so matched = proportional share of pool
      engine.contribute(project.id, 'donor-1' as EntityId, 25n);
      engine.contribute(project.id, 'donor-2' as EntityId, 25n);
      engine.contribute(project.id, 'donor-3' as EntityId, 25n);
      engine.contribute(project.id, 'donor-4' as EntityId, 25n);
      
      const results = engine.calculateFunding(round.id);
      
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].directContributions, 100n);
      assert.ok(results[0].matchedAmount > 0n);
      assert.strictEqual(results[0].contributorCount, 4);
    });
    
    it('favors many small contributions over few large ones', () => {
      const round = engine.createRound('Q1', 'Test');
      
      // Project A: 100 contributors with 1 each
      const projectA = engine.submitProject(round.id, 'Popular', 'Many small donors', 'ownerA' as EntityId);
      for (let i = 0; i < 100; i++) {
        engine.contribute(projectA.id, `donor-a-${i}` as EntityId, 1n);
      }
      
      // Project B: 1 contributor with 100
      const projectB = engine.submitProject(round.id, 'Whale', 'One big donor', 'ownerB' as EntityId);
      engine.contribute(projectB.id, 'whale' as EntityId, 100n);
      
      const results = engine.calculateFunding(round.id);
      
      // Both have 100 direct, but A should get more matching
      const resultA = results.find(r => r.projectName === 'Popular')!;
      const resultB = results.find(r => r.projectName === 'Whale')!;
      
      assert.strictEqual(resultA.directContributions, 100n);
      assert.strictEqual(resultB.directContributions, 100n);
      assert.ok(resultA.matchedAmount > resultB.matchedAmount);
    });
    
    it('applies project matching cap', () => {
      const round = engine.createRound('Q1', 'Test');
      const project = engine.submitProject(round.id, 'Project', 'Desc', 'owner' as EntityId);
      
      // Many contributors to get high matching
      for (let i = 0; i < 50; i++) {
        engine.contribute(project.id, `donor-${i}` as EntityId, 100n);
      }
      
      const results = engine.calculateFunding(round.id);
      
      // Cap is 50% of 10000 = 5000
      assert.ok(results[0].matchedAmount <= 5000n);
    });
    
    it('distributes among multiple projects', () => {
      const round = engine.createRound('Q1', 'Test');
      
      const p1 = engine.submitProject(round.id, 'P1', 'D', 'o1' as EntityId);
      const p2 = engine.submitProject(round.id, 'P2', 'D', 'o2' as EntityId);
      const p3 = engine.submitProject(round.id, 'P3', 'D', 'o3' as EntityId);
      
      engine.contribute(p1.id, 'd1' as EntityId, 100n);
      engine.contribute(p1.id, 'd2' as EntityId, 100n);
      engine.contribute(p2.id, 'd3' as EntityId, 50n);
      engine.contribute(p3.id, 'd4' as EntityId, 25n);
      
      const results = engine.calculateFunding(round.id);
      
      assert.strictEqual(results.length, 3);
      
      // All should have some matching
      for (const result of results) {
        assert.ok(result.matchedAmount >= 0n);
        assert.ok(result.totalFunding > result.directContributions);
      }
    });
    
    it('prevents sybil attacks by grouping same contributor', () => {
      const round = engine.createRound('Q1', 'Test');
      const project = engine.submitProject(round.id, 'Project', 'Desc', 'owner' as EntityId);
      
      // Same contributor makes multiple contributions
      engine.contribute(project.id, 'sybil' as EntityId, 25n);
      engine.contribute(project.id, 'sybil' as EntityId, 25n);
      engine.contribute(project.id, 'sybil' as EntityId, 25n);
      engine.contribute(project.id, 'sybil' as EntityId, 25n);
      
      // Compare with 4 different contributors
      const round2 = engine.createRound('Q2', 'Test');
      const project2 = engine.submitProject(round2.id, 'Project2', 'Desc', 'owner' as EntityId);
      engine.contribute(project2.id, 'donor-1' as EntityId, 25n);
      engine.contribute(project2.id, 'donor-2' as EntityId, 25n);
      engine.contribute(project2.id, 'donor-3' as EntityId, 25n);
      engine.contribute(project2.id, 'donor-4' as EntityId, 25n);
      
      const results1 = engine.calculateFunding(round.id);
      const results2 = engine.calculateFunding(round2.id);
      
      // Sybil should get less matching (treated as 1 contributor with 100)
      assert.ok(results1[0].matchedAmount < results2[0].matchedAmount);
    });
  });
  
  describe('Statistics', () => {
    it('provides funding statistics', () => {
      const round = engine.createRound('Q1', 'Test');
      const project = engine.submitProject(round.id, 'Project', 'Desc', 'owner' as EntityId);
      
      engine.contribute(project.id, 'donor-1' as EntityId, 100n);
      engine.contribute(project.id, 'donor-2' as EntityId, 50n);
      
      engine.calculateFunding(round.id);
      
      const stats = engine.getStats();
      
      assert.strictEqual(stats.totalRounds, 1);
      assert.strictEqual(stats.totalProjects, 1);
      assert.strictEqual(stats.fundedProjects, 1);
      assert.strictEqual(stats.totalContributions, 150n);
      assert.ok(stats.totalMatched > 0n);
    });
  });
  
  describe('Factory', () => {
    it('createQuadraticFundingEngine uses defaults', () => {
      const defaultEngine = createQuadraticFundingEngine();
      assert.ok(defaultEngine);
    });
  });
});
