/**
 * FITNESS FUNCTION TESTS
 * 
 * SPRINT D.1: Tests for agent fitness calculation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  FitnessCalculator,
  createFitnessCalculator,
  calculateFitness,
  getTierDescription,
  DEFAULT_WEIGHTS,
  type FitnessInput,
  type FitnessTier,
} from '../../../core/economy/fitness';

describe('Fitness Function (SPRINT D.1)', () => {
  
  const baseInput: FitnessInput = {
    balance: 5000n,
    totalEarnings: 10000n,
    totalSpending: 5000n,
    loanRepaymentRate: 0.8,
    trajectorySpans: 500,
    successRate: 0.9,
    avgResponseTime: 500,
    reputation: 70,
    networkSize: 20,
    endorsements: 10,
    uptime: 0.99,
    slaCompliance: 0.95,
    incidentCount: 2,
    ageInDays: 180,
    lastActiveAt: Date.now() - 1000 * 60 * 60, // 1 hour ago
  };
  
  describe('FitnessCalculator', () => {
    it('calculates overall fitness score', () => {
      const calculator = createFitnessCalculator();
      const score = calculator.calculate(baseInput);
      
      assert.ok(score.overall >= 0);
      assert.ok(score.overall <= 100);
      assert.ok(score.components);
      assert.ok(score.tier);
      assert.ok(score.calculatedAt);
    });
    
    it('returns all component scores', () => {
      const calculator = createFitnessCalculator();
      const score = calculator.calculate(baseInput);
      
      assert.ok(score.components.economic >= 0 && score.components.economic <= 100);
      assert.ok(score.components.activity >= 0 && score.components.activity <= 100);
      assert.ok(score.components.social >= 0 && score.components.social <= 100);
      assert.ok(score.components.reliability >= 0 && score.components.reliability <= 100);
    });
    
    it('assigns correct tier based on score', () => {
      const calculator = createFitnessCalculator();
      
      // High performer
      const highInput: FitnessInput = {
        ...baseInput,
        balance: 100000n,
        totalEarnings: 500000n,
        successRate: 0.99,
        reputation: 95,
        uptime: 0.999,
      };
      const highScore = calculator.calculate(highInput);
      assert.ok(['S', 'A'].includes(highScore.tier));
      
      // Low performer - use complete input to avoid inheritance issues
      const lowScore = calculator.calculate({
        balance: 100n,
        totalEarnings: 500n,
        totalSpending: 400n,
        loanRepaymentRate: 0.3,
        trajectorySpans: 10,
        successRate: 0.3,
        avgResponseTime: 2000,
        reputation: 20,
        networkSize: 2,
        endorsements: 0,
        uptime: 0.5,
        slaCompliance: 0.5,
        incidentCount: 10,
        ageInDays: 30,
        lastActiveAt: Date.now() - 1000 * 60 * 60,
      });
      assert.ok(['C', 'D', 'F'].includes(lowScore.tier));
    });
    
    it('uses diminishing returns for balance (log scale)', () => {
      const calculator = createFitnessCalculator();
      
      // Large differences to see diminishing returns clearly
      const score1 = calculator.calculate({ ...baseInput, balance: 1000n });
      const score2 = calculator.calculate({ ...baseInput, balance: 100000n });
      const score3 = calculator.calculate({ ...baseInput, balance: 10000000n });
      
      // All scores should increase with balance
      assert.ok(score2.components.economic > score1.components.economic, 'More balance = higher score');
      assert.ok(score3.components.economic > score2.components.economic, 'Even more balance = even higher');
      
      // But the increase should slow down (diminishing returns)
      // 100x increase from 1k to 100k vs 100x increase from 100k to 10M
      const diff1 = score2.components.economic - score1.components.economic;
      const diff2 = score3.components.economic - score2.components.economic;
      
      // Second 100x should give less improvement than first 100x
      assert.ok(diff2 <= diff1, 'Should have diminishing returns');
    });
    
    it('uses saturation for activity (arctan)', () => {
      const calculator = createFitnessCalculator();
      
      // More spans should help, but with diminishing returns
      const score1 = calculator.calculate({ ...baseInput, trajectorySpans: 10 });
      const score2 = calculator.calculate({ ...baseInput, trajectorySpans: 1000 });
      const score3 = calculator.calculate({ ...baseInput, trajectorySpans: 100000 });
      
      // All should be positive, but growth slows
      assert.ok(score2.components.activity > score1.components.activity, 'More spans = higher score');
      assert.ok(score3.components.activity > score2.components.activity, 'Even more spans = even higher');
      
      // 100x increase from 10 to 1000 vs 100x increase from 1000 to 100000
      const diff1 = score2.components.activity - score1.components.activity;
      const diff2 = score3.components.activity - score2.components.activity;
      assert.ok(diff2 <= diff1, 'Should have saturation effect');
    });
    
    it('penalizes inactivity', () => {
      const calculator = createFitnessCalculator();
      
      const activeInput = { ...baseInput, lastActiveAt: Date.now() - 1000 * 60 * 60 }; // 1 hour ago
      const inactiveInput = { ...baseInput, lastActiveAt: Date.now() - 1000 * 60 * 60 * 24 * 14 }; // 2 weeks ago
      
      const activeScore = calculator.calculate(activeInput);
      const inactiveScore = calculator.calculate(inactiveInput);
      
      assert.ok(activeScore.overall > inactiveScore.overall);
      assert.strictEqual(inactiveScore.trend, 'declining');
    });
    
    it('rewards high success rate', () => {
      const calculator = createFitnessCalculator();
      
      const highSuccess = calculator.calculate({ ...baseInput, successRate: 0.95 });
      const lowSuccess = calculator.calculate({ ...baseInput, successRate: 0.5 });
      
      assert.ok(highSuccess.components.activity > lowSuccess.components.activity);
    });
    
    it('penalizes incidents', () => {
      const calculator = createFitnessCalculator();
      
      const fewIncidents = calculator.calculate({ ...baseInput, incidentCount: 1 });
      const manyIncidents = calculator.calculate({ ...baseInput, incidentCount: 10 });
      
      assert.ok(fewIncidents.components.reliability > manyIncidents.components.reliability);
    });
  });
  
  describe('Custom Weights', () => {
    it('accepts custom weights', () => {
      const calculator = createFitnessCalculator({
        economic: 0.5,
        activity: 0.2,
        social: 0.2,
        reliability: 0.1,
      });
      
      const score = calculator.calculate(baseInput);
      assert.ok(score.overall >= 0);
    });
    
    it('rejects weights that do not sum to 1', () => {
      assert.throws(() => {
        new FitnessCalculator({
          economic: 0.5,
          activity: 0.5,
          social: 0.5,
          reliability: 0.5,
        });
      }, /must sum to 1/);
    });
  });
  
  describe('Tier Descriptions', () => {
    it('provides descriptions for all tiers', () => {
      const tiers: FitnessTier[] = ['S', 'A', 'B', 'C', 'D', 'F'];
      
      for (const tier of tiers) {
        const desc = getTierDescription(tier);
        assert.ok(desc.length > 0);
      }
    });
  });
  
  describe('Edge Cases', () => {
    it('handles zero values gracefully', () => {
      const calculator = createFitnessCalculator();
      
      const zeroInput: FitnessInput = {
        balance: 0n,
        totalEarnings: 0n,
        totalSpending: 0n,
        loanRepaymentRate: 0,
        trajectorySpans: 0,
        successRate: 0,
        avgResponseTime: 0,
        reputation: 0,
        networkSize: 0,
        endorsements: 0,
        uptime: 0,
        slaCompliance: 0,
        incidentCount: 0,
        ageInDays: 0,
        lastActiveAt: Date.now(),
      };
      
      const score = calculator.calculate(zeroInput);
      assert.ok(score.overall >= 0);
      assert.ok(score.overall <= 100);
    });
    
    it('handles very large values', () => {
      const calculator = createFitnessCalculator();
      
      const largeInput: FitnessInput = {
        ...baseInput,
        balance: 1000000000n,
        totalEarnings: 5000000000n,
        trajectorySpans: 1000000,
        networkSize: 10000,
      };
      
      const score = calculator.calculate(largeInput);
      assert.ok(score.overall >= 0);
      assert.ok(score.overall <= 100);
    });
  });
  
  describe('Quick Calculate', () => {
    it('calculateFitness works with defaults', () => {
      const score = calculateFitness(baseInput);
      
      assert.ok(score.overall >= 0);
      assert.ok(score.tier);
    });
  });
});
