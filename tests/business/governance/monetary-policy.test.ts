/**
 * MONETARY POLICY TESTS
 * 
 * SPRINT E.1: Tests for central bank operations
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  MonetaryPolicyEngine,
  createMonetaryPolicyEngine,
  type EconomicIndicators,
} from '../../../core/governance/monetary-policy';
import type { EntityId } from '../../../core/schema/ledger';

describe('Monetary Policy (SPRINT E.1)', () => {
  
  let engine: MonetaryPolicyEngine;
  
  beforeEach(() => {
    engine = createMonetaryPolicyEngine({
      targetInflation: 0.02,
      naturalRate: 0.025,
      inflationWeight: 1.5,
      outputWeight: 0.5,
      floorRate: 0,
      ceilingRate: 0.20,
      discountPremium: 0.005,
    });
  });
  
  describe('Taylor Rule', () => {
    it('calculates rate for equilibrium economy', () => {
      const indicators: EconomicIndicators = {
        inflation: 0.02,
        outputGap: 0,
        unemployment: 0.05,
        moneySupply: 1000000n,
        creditGrowth: 0.05,
        assetPrices: 100,
        exchangeRate: 1,
        timestamp: Date.now(),
      };
      
      const rate = engine.calculateTaylorRate(indicators);
      
      // At equilibrium: r* + π = 0.025 + 0.02 = 0.045
      assert.ok(rate >= 0.04 && rate <= 0.05);
    });
    
    it('raises rates for high inflation', () => {
      const indicators: EconomicIndicators = {
        inflation: 0.05, // 5% inflation (above 2% target)
        outputGap: 0,
        unemployment: 0.05,
        moneySupply: 1000000n,
        creditGrowth: 0.05,
        assetPrices: 100,
        exchangeRate: 1,
        timestamp: Date.now(),
      };
      
      const rate = engine.calculateTaylorRate(indicators);
      
      // Should be higher than equilibrium
      assert.ok(rate > 0.05);
    });
    
    it('lowers rates for negative output gap', () => {
      const indicators: EconomicIndicators = {
        inflation: 0.01, // Low inflation
        outputGap: -0.05, // Recession
        unemployment: 0.08,
        moneySupply: 1000000n,
        creditGrowth: 0.01,
        assetPrices: 80,
        exchangeRate: 1,
        timestamp: Date.now(),
      };
      
      const rate = engine.calculateTaylorRate(indicators);
      
      // Should be lower
      assert.ok(rate < 0.04);
    });
    
    it('respects floor rate', () => {
      const indicators: EconomicIndicators = {
        inflation: -0.02, // Deflation
        outputGap: -0.10, // Deep recession
        unemployment: 0.15,
        moneySupply: 800000n,
        creditGrowth: -0.05,
        assetPrices: 60,
        exchangeRate: 1,
        timestamp: Date.now(),
      };
      
      const rate = engine.calculateTaylorRate(indicators);
      
      assert.strictEqual(rate, 0); // Floor rate
    });
    
    it('respects ceiling rate', () => {
      const indicators: EconomicIndicators = {
        inflation: 0.50, // Hyperinflation
        outputGap: 0.20, // Overheating
        unemployment: 0.02,
        moneySupply: 5000000n,
        creditGrowth: 0.50,
        assetPrices: 200,
        exchangeRate: 0.5,
        timestamp: Date.now(),
      };
      
      const rate = engine.calculateTaylorRate(indicators);
      
      assert.strictEqual(rate, 0.20); // Ceiling rate
    });
  });
  
  describe('Policy Decisions', () => {
    it('makes rate decision', () => {
      const indicators: EconomicIndicators = {
        inflation: 0.03,
        outputGap: 0.01,
        unemployment: 0.04,
        moneySupply: 1000000n,
        creditGrowth: 0.06,
        assetPrices: 105,
        exchangeRate: 1,
        timestamp: Date.now(),
      };
      
      const decision = engine.makeDecision(indicators);
      
      assert.ok(decision.id);
      assert.strictEqual(decision.type, 'RateChange');
      assert.ok(decision.rationale.length > 0);
      assert.ok(decision.forwardGuidance);
    });
    
    it('triggers QE at zero lower bound', () => {
      const indicators: EconomicIndicators = {
        inflation: 0.005,
        outputGap: -0.05, // Recession
        unemployment: 0.10,
        moneySupply: 800000n,
        creditGrowth: -0.02,
        assetPrices: 70,
        exchangeRate: 1,
        timestamp: Date.now(),
      };
      
      const decision = engine.makeDecision(indicators);
      
      assert.strictEqual(decision.type, 'QuantitativeEasing');
      assert.ok(decision.rationale.includes('QE'));
    });
    
    it('tracks decision history', () => {
      const indicators: EconomicIndicators = {
        inflation: 0.02,
        outputGap: 0,
        unemployment: 0.05,
        moneySupply: 1000000n,
        creditGrowth: 0.05,
        assetPrices: 100,
        exchangeRate: 1,
        timestamp: Date.now(),
      };
      
      engine.makeDecision(indicators);
      engine.makeDecision({ ...indicators, inflation: 0.03 });
      engine.makeDecision({ ...indicators, inflation: 0.04 });
      
      const history = engine.getRecentDecisions(10);
      assert.strictEqual(history.length, 3);
    });
  });
  
  describe('Open Market Operations', () => {
    it('executes buy operation', () => {
      const omo = engine.executeOMO('Buy', 'Bond', 1000000n, 98.5);
      
      assert.ok(omo.id);
      assert.strictEqual(omo.type, 'Buy');
      assert.strictEqual(omo.assetType, 'Bond');
      assert.strictEqual(omo.amount, 1000000n);
    });
    
    it('executes sell operation', () => {
      const omo = engine.executeOMO('Sell', 'MBS', 500000n, 101.2);
      
      assert.strictEqual(omo.type, 'Sell');
      assert.strictEqual(omo.assetType, 'MBS');
    });
  });
  
  describe('Lending Facilities', () => {
    it('provides emergency lending', () => {
      const facility = engine.provideLending(
        'bank-1' as EntityId,
        1000000n,
        1500000n, // 150% collateral
        7 // 7 days
      );
      
      assert.ok(facility.id);
      assert.strictEqual(facility.borrower, 'bank-1');
      assert.strictEqual(facility.amount, 1000000n);
      assert.strictEqual(facility.status, 'Active');
      assert.ok(facility.rate > engine.getCurrentRate()); // Discount premium
    });
    
    it('repays facility', () => {
      const facility = engine.provideLending(
        'bank-1' as EntityId,
        1000000n,
        1500000n,
        7
      );
      
      const repaid = engine.repayFacility(facility.id);
      
      assert.strictEqual(repaid.status, 'Repaid');
    });
    
    it('tracks active facilities', () => {
      engine.provideLending('bank-1' as EntityId, 1000000n, 1500000n, 7);
      engine.provideLending('bank-2' as EntityId, 500000n, 750000n, 14);
      
      const active = engine.getActiveFacilities();
      assert.strictEqual(active.length, 2);
    });
  });
  
  describe('Statistics', () => {
    it('provides policy statistics', () => {
      const indicators: EconomicIndicators = {
        inflation: 0.02,
        outputGap: 0,
        unemployment: 0.05,
        moneySupply: 1000000n,
        creditGrowth: 0.05,
        assetPrices: 100,
        exchangeRate: 1,
        timestamp: Date.now(),
      };
      
      engine.makeDecision(indicators);
      engine.executeOMO('Buy', 'Bond', 1000000n, 98);
      engine.provideLending('bank-1' as EntityId, 500000n, 750000n, 7);
      
      const stats = engine.getStats();
      
      assert.strictEqual(stats.totalDecisions, 1);
      assert.strictEqual(stats.totalOMOs, 1);
      assert.strictEqual(stats.netOMOPosition, 1000000n);
      assert.strictEqual(stats.activeFacilities, 1);
      assert.strictEqual(stats.totalLending, 500000n);
    });
  });
  
  describe('Factory', () => {
    it('createMonetaryPolicyEngine uses defaults', () => {
      const defaultEngine = createMonetaryPolicyEngine();
      assert.ok(defaultEngine);
      assert.ok(defaultEngine.getCurrentRate() > 0);
    });
  });
});
