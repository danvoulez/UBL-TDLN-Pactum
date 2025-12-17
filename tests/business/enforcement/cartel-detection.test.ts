/**
 * CARTEL DETECTION TESTS
 * 
 * SPRINT D.2: Tests for graph-based cartel detection
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  CartelDetector,
  createCartelDetector,
  type Transaction,
} from '../../../core/enforcement/cartel-detection';
import type { EntityId } from '../../../core/schema/ledger';

describe('Cartel Detection (SPRINT D.2)', () => {
  
  describe('CartelDetector', () => {
    let detector: CartelDetector;
    
    beforeEach(() => {
      detector = createCartelDetector({
        minCartelSize: 3,
        correlationWindowMs: 60000,
        correlationThreshold: 0.5,
        maxCycleLength: 5,
        minTransactionValue: 10n,
      });
    });
    
    it('detects circular trading (A→B→C→A)', () => {
      const now = Date.now();
      
      // Create circular transactions
      detector.addTransaction({
        id: 'tx1',
        from: 'entity-a' as EntityId,
        to: 'entity-b' as EntityId,
        amount: 1000n,
        timestamp: now,
        type: 'transfer',
      });
      
      detector.addTransaction({
        id: 'tx2',
        from: 'entity-b' as EntityId,
        to: 'entity-c' as EntityId,
        amount: 1000n,
        timestamp: now + 1000,
        type: 'transfer',
      });
      
      detector.addTransaction({
        id: 'tx3',
        from: 'entity-c' as EntityId,
        to: 'entity-a' as EntityId,
        amount: 1000n,
        timestamp: now + 2000,
        type: 'transfer',
      });
      
      const suspicions = detector.analyze();
      
      const circularTrading = suspicions.find(s => s.type === 'circular_trading');
      assert.ok(circularTrading, 'Should detect circular trading');
      assert.strictEqual(circularTrading.entities.length, 3);
    });
    
    it('detects wash trading (A→B→A)', () => {
      const now = Date.now();
      
      // A sends to B
      detector.addTransaction({
        id: 'tx1',
        from: 'entity-a' as EntityId,
        to: 'entity-b' as EntityId,
        amount: 1000n,
        timestamp: now,
        type: 'transfer',
      });
      
      // B sends back to A (similar amount, short time)
      detector.addTransaction({
        id: 'tx2',
        from: 'entity-b' as EntityId,
        to: 'entity-a' as EntityId,
        amount: 1000n,
        timestamp: now + 5000, // 5 seconds later
        type: 'transfer',
      });
      
      const suspicions = detector.analyze();
      
      const washTrading = suspicions.find(s => s.type === 'wash_trading');
      assert.ok(washTrading, 'Should detect wash trading');
    });
    
    it('detects coordinated actions', () => {
      const now = Date.now();
      
      // Entity A and B act at the same times
      for (let i = 0; i < 10; i++) {
        const timestamp = now + i * 1000;
        
        detector.addTransaction({
          id: `tx-a-${i}`,
          from: 'entity-a' as EntityId,
          to: 'entity-x' as EntityId,
          amount: 100n,
          timestamp,
          type: 'transfer',
        });
        
        detector.addTransaction({
          id: `tx-b-${i}`,
          from: 'entity-b' as EntityId,
          to: 'entity-y' as EntityId,
          amount: 100n,
          timestamp: timestamp + 100, // 100ms later (synchronized)
          type: 'transfer',
        });
      }
      
      const suspicions = detector.analyze();
      
      const coordinated = suspicions.find(s => s.type === 'coordinated_action');
      assert.ok(coordinated, 'Should detect coordinated actions');
      assert.ok(coordinated.confidence > 0.5);
    });
    
    it('ignores transactions below minimum value', () => {
      const now = Date.now();
      
      // Small transactions (below threshold)
      detector.addTransaction({
        id: 'tx1',
        from: 'entity-a' as EntityId,
        to: 'entity-b' as EntityId,
        amount: 5n, // Below 10n threshold
        timestamp: now,
        type: 'transfer',
      });
      
      const stats = detector.getStats();
      assert.strictEqual(stats.transactionCount, 0);
    });
    
    it('provides graph statistics', () => {
      const now = Date.now();
      
      detector.addTransaction({
        id: 'tx1',
        from: 'entity-a' as EntityId,
        to: 'entity-b' as EntityId,
        amount: 100n,
        timestamp: now,
        type: 'transfer',
      });
      
      detector.addTransaction({
        id: 'tx2',
        from: 'entity-b' as EntityId,
        to: 'entity-c' as EntityId,
        amount: 100n,
        timestamp: now + 1000,
        type: 'transfer',
      });
      
      const stats = detector.getStats();
      
      assert.strictEqual(stats.entityCount, 3);
      assert.strictEqual(stats.transactionCount, 2);
      assert.ok(stats.avgDegree > 0);
    });
    
    it('can be reset', () => {
      const now = Date.now();
      
      detector.addTransaction({
        id: 'tx1',
        from: 'entity-a' as EntityId,
        to: 'entity-b' as EntityId,
        amount: 100n,
        timestamp: now,
        type: 'transfer',
      });
      
      assert.strictEqual(detector.getStats().transactionCount, 1);
      
      detector.reset();
      
      assert.strictEqual(detector.getStats().transactionCount, 0);
    });
    
    it('handles complex cycles (A→B→C→D→A)', () => {
      const now = Date.now();
      const entities = ['a', 'b', 'c', 'd'];
      
      // Create 4-node cycle
      for (let i = 0; i < entities.length; i++) {
        const from = `entity-${entities[i]}` as EntityId;
        const to = `entity-${entities[(i + 1) % entities.length]}` as EntityId;
        
        detector.addTransaction({
          id: `tx-${i}`,
          from,
          to,
          amount: 1000n,
          timestamp: now + i * 1000,
          type: 'transfer',
        });
      }
      
      const suspicions = detector.analyze();
      
      const circularTrading = suspicions.find(s => s.type === 'circular_trading');
      assert.ok(circularTrading);
      assert.strictEqual(circularTrading.entities.length, 4);
    });
    
    it('assigns severity based on evidence', () => {
      const now = Date.now();
      
      // Create multiple cycles
      for (let cycle = 0; cycle < 5; cycle++) {
        const offset = cycle * 3;
        
        detector.addTransaction({
          id: `tx-${offset}`,
          from: 'entity-a' as EntityId,
          to: 'entity-b' as EntityId,
          amount: 1000n,
          timestamp: now + offset * 1000,
          type: 'transfer',
        });
        
        detector.addTransaction({
          id: `tx-${offset + 1}`,
          from: 'entity-b' as EntityId,
          to: 'entity-c' as EntityId,
          amount: 1000n,
          timestamp: now + (offset + 1) * 1000,
          type: 'transfer',
        });
        
        detector.addTransaction({
          id: `tx-${offset + 2}`,
          from: 'entity-c' as EntityId,
          to: 'entity-a' as EntityId,
          amount: 1000n,
          timestamp: now + (offset + 2) * 1000,
          type: 'transfer',
        });
      }
      
      const suspicions = detector.analyze();
      const circularTrading = suspicions.find(s => s.type === 'circular_trading');
      
      assert.ok(circularTrading);
      // Multiple cycles should increase severity
      assert.ok(['high', 'critical'].includes(circularTrading.severity));
    });
  });
  
  describe('Factory Functions', () => {
    it('createCartelDetector uses defaults', () => {
      const detector = createCartelDetector();
      assert.ok(detector);
    });
  });
});
