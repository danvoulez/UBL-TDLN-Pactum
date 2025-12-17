/**
 * ANOMALY DETECTION TESTS
 * 
 * SPRINT D.2: Tests for statistical anomaly detection
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  AnomalyDetector,
  AnomalyCircuitBreaker,
  createAnomalyDetector,
  createAnomalyCircuitBreaker,
  type DataPoint,
} from '../../../core/enforcement/anomaly-detection';

describe('Anomaly Detection (SPRINT D.2)', () => {
  
  describe('AnomalyDetector', () => {
    let detector: AnomalyDetector;
    
    beforeEach(() => {
      detector = createAnomalyDetector({
        sigmaThreshold: 3,
        windowSize: 100,
        minSamples: 10,
        velocityLimit: 60,
        cooldownMs: 100,
      });
    });
    
    it('requires minimum samples before detection', () => {
      const now = Date.now();
      
      // Add 5 samples (below minimum)
      for (let i = 0; i < 5; i++) {
        const result = detector.detect({
          value: 100,
          timestamp: now + i * 1000,
        });
        assert.strictEqual(result.isAnomaly, false);
        assert.strictEqual(result.confidence, 0);
      }
    });
    
    it('detects statistical outliers (3σ rule)', () => {
      const now = Date.now();
      
      // Add normal samples (mean ~100, low variance)
      for (let i = 0; i < 20; i++) {
        detector.detect({
          value: 100 + (Math.random() - 0.5) * 2, // 99-101
          timestamp: now + i * 1000,
        });
      }
      
      // Add extreme outlier
      const result = detector.detect({
        value: 500, // Way outside normal range
        timestamp: now + 21000,
      });
      
      assert.strictEqual(result.isAnomaly, true);
      assert.strictEqual(result.type, 'statistical_outlier');
      assert.ok(result.deviation > 3);
    });
    
    it('detects velocity breaches', () => {
      const now = Date.now();
      
      // Add samples within minimum
      for (let i = 0; i < 10; i++) {
        detector.detect({ value: 100, timestamp: now + i * 100 });
      }
      
      // Flood with transactions (>60 per minute)
      for (let i = 0; i < 70; i++) {
        const result = detector.detect({
          value: 100,
          timestamp: now + 10000 + i * 10, // All within 1 second
        });
        
        if (i > 60) {
          assert.strictEqual(result.isAnomaly, true);
          assert.strictEqual(result.type, 'velocity_breach');
        }
      }
    });
    
    it('detects magnitude spikes', () => {
      const now = Date.now();
      
      // Add stable samples
      for (let i = 0; i < 15; i++) {
        detector.detect({
          value: 100,
          timestamp: now + i * 1000,
        });
      }
      
      // Add sudden spike (10x previous value)
      const result = detector.detect({
        value: 1000,
        timestamp: now + 16000,
      });
      
      assert.strictEqual(result.isAnomaly, true);
      assert.strictEqual(result.type, 'magnitude_spike');
    });
    
    it('respects cooldown period', () => {
      const now = Date.now();
      
      // Add samples
      for (let i = 0; i < 15; i++) {
        detector.detect({ value: 100, timestamp: now + i * 1000 });
      }
      
      // First anomaly
      const result1 = detector.detect({ value: 1000, timestamp: now + 16000 });
      assert.strictEqual(result1.isAnomaly, true);
      
      // Second anomaly within cooldown (should not trigger)
      const result2 = detector.detect({ value: 1000, timestamp: now + 16050 });
      assert.strictEqual(result2.isAnomaly, false);
    });
    
    it('provides statistics', () => {
      const now = Date.now();
      
      for (let i = 0; i < 20; i++) {
        detector.detect({ value: 100 + i, timestamp: now + i * 1000 });
      }
      
      const stats = detector.getStats();
      assert.ok(stats);
      assert.ok(stats.mean > 0);
      assert.ok(stats.stdDev > 0);
      assert.strictEqual(stats.count, 20);
    });
    
    it('can be reset', () => {
      const now = Date.now();
      
      for (let i = 0; i < 20; i++) {
        detector.detect({ value: 100, timestamp: now + i * 1000 });
      }
      
      assert.ok(detector.getStats());
      
      detector.reset();
      
      assert.strictEqual(detector.getStats(), null);
    });
  });
  
  describe('AnomalyCircuitBreaker', () => {
    let breaker: AnomalyCircuitBreaker;
    
    beforeEach(() => {
      breaker = createAnomalyCircuitBreaker({
        anomalyThreshold: 3,
        windowMs: 60000,
        cooldownMs: 1000,
      });
    });
    
    it('trips after threshold anomalies', () => {
      const now = Date.now();
      
      // Record anomalies
      for (let i = 0; i < 3; i++) {
        const tripped = breaker.record({
          isAnomaly: true,
          type: 'statistical_outlier',
          severity: 'high',
          value: 100,
          expectedRange: { min: 0, max: 50 },
          deviation: 4,
          confidence: 0.9,
          timestamp: now + i * 1000,
        });
        
        if (i < 2) {
          assert.strictEqual(tripped, false);
        } else {
          assert.strictEqual(tripped, true);
        }
      }
      
      assert.strictEqual(breaker.isTripped(), true);
    });
    
    it('ignores non-anomalies', () => {
      const now = Date.now();
      
      for (let i = 0; i < 10; i++) {
        breaker.record({
          isAnomaly: false,
          type: null,
          severity: 'low',
          value: 100,
          expectedRange: { min: 0, max: 200 },
          deviation: 0,
          confidence: 0.9,
          timestamp: now + i * 1000,
        });
      }
      
      assert.strictEqual(breaker.isTripped(), false);
    });
    
    it('can be manually reset', () => {
      const now = Date.now();
      
      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        breaker.record({
          isAnomaly: true,
          type: 'velocity_breach',
          severity: 'critical',
          value: 100,
          expectedRange: { min: 0, max: 60 },
          deviation: 2,
          confidence: 1,
          timestamp: now + i * 100,
        });
      }
      
      assert.strictEqual(breaker.isTripped(), true);
      
      breaker.reset();
      
      assert.strictEqual(breaker.isTripped(), false);
    });
    
    it('provides time until reset', () => {
      const now = Date.now();
      
      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        breaker.record({
          isAnomaly: true,
          type: 'magnitude_spike',
          severity: 'high',
          value: 1000,
          expectedRange: { min: 0, max: 100 },
          deviation: 10,
          confidence: 0.95,
          timestamp: now + i * 100,
        });
      }
      
      const timeUntilReset = breaker.getTimeUntilReset();
      assert.ok(timeUntilReset > 0);
      assert.ok(timeUntilReset <= 1000);
    });
  });
  
  describe('Factory Functions', () => {
    it('createAnomalyDetector uses defaults', () => {
      const detector = createAnomalyDetector();
      assert.ok(detector);
    });
    
    it('createAnomalyCircuitBreaker uses defaults', () => {
      const breaker = createAnomalyCircuitBreaker();
      assert.ok(breaker);
    });
  });
});
