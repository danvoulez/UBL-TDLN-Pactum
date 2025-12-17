/**
 * BENCHMARK FRAMEWORK TESTS
 * 
 * SPRINT F.1: Tests for system health metrics
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  BenchmarkEngine,
  createBenchmarkEngine,
  type BenchmarkInput,
} from '../../../core/benchmarking/benchmark-framework';

describe('Benchmark Framework (SPRINT F.1)', () => {
  
  let engine: BenchmarkEngine;
  
  beforeEach(() => {
    engine = createBenchmarkEngine({
      baselines: {
        survivalRate: 0.8,
        giniCoefficient: 0.4,
        recoveryTime: 7,
        utilizationRate: 0.7,
        innovationRate: 0.5,
      },
      weights: {
        survival: 0.25,
        equality: 0.20,
        resilience: 0.25,
        efficiency: 0.15,
        innovation: 0.15,
      },
      thresholds: {
        healthy: 70,
        warning: 50,
        critical: 30,
      },
      version: '1.0.0',
    });
  });
  
  function createHealthyInput(): BenchmarkInput {
    return {
      totalAgents: 100,
      activeAgents: 90,
      newAgents: 10,
      exitedAgents: 5,
      averageLifespan: 365,
      giniCoefficient: 0.3,
      medianWealth: 1000n,
      meanWealth: 1200n,
      wealthTop10Percent: 0.3,
      wealthBottom10Percent: 0.05,
      recentShocks: 1,
      recoveryTime: 5,
      systemUptime: 0.99,
      failedTransactions: 10,
      totalTransactions: 1000,
      resourceUtilization: 0.75,
      averageLatency: 50,
      throughput: 100,
      wastedResources: 0.05,
      newFeatures: 5,
      adaptations: 3,
      experimentSuccess: 0.7,
      diversityIndex: 0.8,
    };
  }
  
  function createUnhealthyInput(): BenchmarkInput {
    return {
      totalAgents: 100,
      activeAgents: 30,
      newAgents: 2,
      exitedAgents: 20,
      averageLifespan: 30,
      giniCoefficient: 0.8,
      medianWealth: 100n,
      meanWealth: 5000n,
      wealthTop10Percent: 0.8,
      wealthBottom10Percent: 0.01,
      recentShocks: 10,
      recoveryTime: 30,
      systemUptime: 0.7,
      failedTransactions: 300,
      totalTransactions: 1000,
      resourceUtilization: 0.3,
      averageLatency: 500,
      throughput: 20,
      wastedResources: 0.4,
      newFeatures: 0,
      adaptations: 0,
      experimentSuccess: 0.1,
      diversityIndex: 0.2,
    };
  }
  
  describe('Score Calculation', () => {
    it('calculates healthy system score', () => {
      const input = createHealthyInput();
      const score = engine.calculate(input);
      
      assert.ok(score.composite > 60);
      assert.strictEqual(score.status, 'Healthy');
    });
    
    it('calculates unhealthy system score', () => {
      const input = createUnhealthyInput();
      const score = engine.calculate(input);
      
      assert.ok(score.composite < 50);
      assert.ok(['Warning', 'Critical'].includes(score.status));
    });
    
    it('includes all dimensions', () => {
      const input = createHealthyInput();
      const score = engine.calculate(input);
      
      assert.ok(score.dimensions.survival);
      assert.ok(score.dimensions.equality);
      assert.ok(score.dimensions.resilience);
      assert.ok(score.dimensions.efficiency);
      assert.ok(score.dimensions.innovation);
    });
    
    it('dimension scores are 0-100', () => {
      const input = createHealthyInput();
      const score = engine.calculate(input);
      
      for (const dim of Object.values(score.dimensions)) {
        assert.ok(dim.value >= 0 && dim.value <= 100);
      }
    });
  });
  
  describe('Survival Dimension', () => {
    it('scores high for high survival rate', () => {
      const input = { ...createHealthyInput(), activeAgents: 95 };
      const score = engine.calculate(input);
      
      assert.ok(score.dimensions.survival.value > 70);
    });
    
    it('scores low for low survival rate', () => {
      const input = { ...createHealthyInput(), activeAgents: 20 };
      const score = engine.calculate(input);
      
      assert.ok(score.dimensions.survival.value < 50);
    });
  });
  
  describe('Equality Dimension', () => {
    it('scores high for low Gini coefficient', () => {
      const input = { ...createHealthyInput(), giniCoefficient: 0.2 };
      const score = engine.calculate(input);
      
      assert.ok(score.dimensions.equality.value > 70);
    });
    
    it('scores low for high Gini coefficient', () => {
      const input = { ...createHealthyInput(), giniCoefficient: 0.9 };
      const score = engine.calculate(input);
      
      assert.ok(score.dimensions.equality.value < 30);
    });
  });
  
  describe('Resilience Dimension', () => {
    it('scores high for fast recovery', () => {
      const input = { ...createHealthyInput(), recoveryTime: 2, systemUptime: 0.999 };
      const score = engine.calculate(input);
      
      assert.ok(score.dimensions.resilience.value > 70);
    });
    
    it('scores low for slow recovery', () => {
      const input = { ...createHealthyInput(), recoveryTime: 30, systemUptime: 0.8 };
      const score = engine.calculate(input);
      
      assert.ok(score.dimensions.resilience.value < 70);
    });
  });
  
  describe('Efficiency Dimension', () => {
    it('scores high for good utilization', () => {
      const input = { ...createHealthyInput(), resourceUtilization: 0.9, wastedResources: 0.01 };
      const score = engine.calculate(input);
      
      assert.ok(score.dimensions.efficiency.value > 60);
    });
    
    it('scores low for poor utilization', () => {
      const input = { ...createHealthyInput(), resourceUtilization: 0.2, wastedResources: 0.5 };
      const score = engine.calculate(input);
      
      assert.ok(score.dimensions.efficiency.value < 50);
    });
  });
  
  describe('Innovation Dimension', () => {
    it('scores high for active innovation', () => {
      const input = { ...createHealthyInput(), newFeatures: 10, adaptations: 5, experimentSuccess: 0.9 };
      const score = engine.calculate(input);
      
      assert.ok(score.dimensions.innovation.value > 70);
    });
    
    it('scores low for stagnation', () => {
      const input = { ...createHealthyInput(), newFeatures: 0, adaptations: 0, experimentSuccess: 0 };
      const score = engine.calculate(input);
      
      assert.ok(score.dimensions.innovation.value < 30);
    });
  });
  
  describe('History Tracking', () => {
    it('tracks score history', () => {
      engine.calculate(createHealthyInput());
      engine.calculate(createHealthyInput());
      engine.calculate(createHealthyInput());
      
      const history = engine.getHistory();
      assert.strictEqual(history.length, 3);
    });
    
    it('gets latest score', () => {
      engine.calculate(createHealthyInput());
      const latest = engine.getLatest();
      
      assert.ok(latest);
      assert.ok(latest.timestamp > 0);
    });
    
    it('limits history retrieval', () => {
      for (let i = 0; i < 10; i++) {
        engine.calculate(createHealthyInput());
      }
      
      const limited = engine.getHistory(5);
      assert.strictEqual(limited.length, 5);
    });
  });
  
  describe('Comparison', () => {
    it('compares to baseline', () => {
      const score = engine.calculate(createHealthyInput());
      
      assert.ok(typeof score.vsBaseline === 'number');
    });
    
    it('compares to previous', () => {
      engine.calculate(createHealthyInput());
      const score = engine.calculate(createHealthyInput());
      
      assert.ok(typeof score.vsPrevious === 'number');
    });
  });
  
  describe('Report Generation', () => {
    it('generates report', () => {
      engine.calculate(createHealthyInput());
      const report = engine.generateReport();
      
      assert.ok(report.generatedAt > 0);
      assert.strictEqual(report.version, '1.0.0');
      assert.ok(report.current);
      assert.ok(report.recommendations.length > 0);
    });
    
    it('includes trends', () => {
      for (let i = 0; i < 5; i++) {
        engine.calculate(createHealthyInput());
      }
      
      const report = engine.generateReport();
      
      assert.ok(report.trends.survival);
      assert.ok(report.trends.equality);
    });
  });
  
  describe('Factory', () => {
    it('createBenchmarkEngine uses defaults', () => {
      const defaultEngine = createBenchmarkEngine();
      assert.ok(defaultEngine);
    });
  });
});
