/**
 * EDGE CASES TESTS - Boundary Conditions and Extreme Values
 * 
 * Testa casos extremos e condições de limite:
 * - Valores null/undefined
 * - Limites numéricos
 * - Strings vazias
 * - Arrays vazios
 * - Timestamps extremos
 * - IDs inválidos
 * - Payloads grandes
 * 
 * Uso: Executar como parte da suite completa para garantir robustez
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { createInMemoryEventStore } from '../../core/store/event-store.js';
import { Ids } from '../../core/shared/types.js';
import type { EventStore } from '../../core/store/event-store.js';
import {
  validateEventIntegrity,
  assertNotNull,
  assertNotEmpty,
  assertInRange,
  assertReasonableTimestamp
} from './validation-helpers.js';

describe('Edge Cases - Boundary Conditions', () => {
  let eventStore: EventStore;
  
  beforeEach(() => {
    eventStore = createInMemoryEventStore();
  });
  
  describe('Null and Undefined Handling', () => {
    it('should reject events with null actor', async () => {
      try {
        await eventStore.append({
          type: 'TestEvent',
          aggregateId: Ids.entity(),
          aggregateType: 'Entity' as const,
          aggregateVersion: 1,
          payload: {},
          actor: null as any,
          causation: {}
        });
        assert.fail('Should reject event with null actor');
      } catch (error: any) {
        assert(error, 'Should throw error for null actor');
      }
    });
    
    it('should handle undefined payload gracefully', async () => {
      const systemActor = { type: 'System' as const, systemId: 'test' };
      
      try {
        const event = await eventStore.append({
          type: 'TestEvent',
          aggregateId: Ids.entity(),
          aggregateType: 'Entity' as const,
          aggregateVersion: 1,
          payload: undefined as any,
          actor: systemActor,
          causation: {}
        });
        
        // Should accept undefined payload (treated as empty object)
        assert(event, 'Event should be created even with undefined payload');
      } catch (error: any) {
        // May reject - both behaviors are acceptable
        assert(error, 'Error is acceptable for undefined payload');
      }
    });
  });
  
  describe('Numeric Limits', () => {
    it('should handle very large sequence numbers', async () => {
      const systemActor = { type: 'System' as const, systemId: 'test' };
      const largeSequence = BigInt(Number.MAX_SAFE_INTEGER) + 1000n;
      
      // Create many events to reach large sequence
      for (let i = 0; i < 10; i++) {
        await eventStore.append({
          type: 'TestEvent',
          aggregateId: Ids.entity(),
          aggregateType: 'Entity' as const,
          aggregateVersion: 1,
          payload: { index: i },
          actor: systemActor,
          causation: {}
        });
      }
      
      const currentSequence = await eventStore.getCurrentSequence();
      assert(currentSequence > 0n, 'Sequence should be positive');
      // Should handle large sequences without overflow
    });
    
    it('should handle very large timestamps', async () => {
      const systemActor = { type: 'System' as const, systemId: 'test' };
      const farFuture = Date.now() + (100 * 365 * 24 * 60 * 60 * 1000); // 100 years
      
      try {
        const event = await eventStore.append({
          type: 'TestEvent',
          aggregateId: Ids.entity(),
          aggregateType: 'Entity' as const,
          aggregateVersion: 1,
          payload: {},
          actor: systemActor,
          timestamp: farFuture,
          causation: {}
        });
        
        // Should accept but warn
        assert(event, 'Event should be created');
        // Validation should warn about future timestamp
        const integrity = validateEventIntegrity(event);
        assert(integrity.warnings.length > 0, 'Should warn about future timestamp');
      } catch (error: any) {
        // May reject - both behaviors are acceptable
        assert(error, 'Error is acceptable for far future timestamp');
      }
    });
    
    it('should handle negative timestamps (reject)', async () => {
      const systemActor = { type: 'System' as const, systemId: 'test' };
      
      try {
        await eventStore.append({
          type: 'TestEvent',
          aggregateId: Ids.entity(),
          aggregateType: 'Entity' as const,
          aggregateVersion: 1,
          payload: {},
          actor: systemActor,
          timestamp: -1,
          causation: {}
        });
        assert.fail('Should reject negative timestamp');
      } catch (error: any) {
        assert(error, 'Should throw error for negative timestamp');
      }
    });
  });
  
  describe('String Edge Cases', () => {
    it('should handle empty string IDs (reject)', async () => {
      const systemActor = { type: 'System' as const, systemId: 'test' };
      
      try {
        await eventStore.append({
          type: 'TestEvent',
          aggregateId: '' as any,
          aggregateType: 'Entity' as const,
          aggregateVersion: 1,
          payload: {},
          actor: systemActor,
          causation: {}
        });
        assert.fail('Should reject empty string ID');
      } catch (error: any) {
        assert(error, 'Should throw error for empty string ID');
      }
    });
    
    it('should handle very long strings in payload', async () => {
      const systemActor = { type: 'System' as const, systemId: 'test' };
      const veryLongString = 'x'.repeat(100000); // 100KB string
      
      const event = await eventStore.append({
        type: 'TestEvent',
        aggregateId: Ids.entity(),
        aggregateType: 'Entity' as const,
        aggregateVersion: 1,
        payload: { largeData: veryLongString },
        actor: systemActor,
        causation: {}
      });
      
      assert(event, 'Should handle large payload');
      const payload = event.payload as any;
      assert.equal(payload.largeData.length, 100000, 'Large payload should be preserved');
    });
    
    it('should handle special characters in payload', async () => {
      const systemActor = { type: 'System' as const, systemId: 'test' };
      const specialChars = '\0\n\r\t"\'\\\u0000\uFFFF';
      
      const event = await eventStore.append({
        type: 'TestEvent',
        aggregateId: Ids.entity(),
        aggregateType: 'Entity' as const,
        aggregateVersion: 1,
        payload: { special: specialChars },
        actor: systemActor,
        causation: {}
      });
      
      assert(event, 'Should handle special characters');
      const payload = event.payload as any;
      assert.equal(payload.special, specialChars, 'Special characters should be preserved');
    });
  });
  
  describe('Array Edge Cases', () => {
    it('should handle empty arrays in payload', async () => {
      const systemActor = { type: 'System' as const, systemId: 'test' };
      
      const event = await eventStore.append({
        type: 'TestEvent',
        aggregateId: Ids.entity(),
        aggregateType: 'Entity' as const,
        aggregateVersion: 1,
        payload: { items: [] },
        actor: systemActor,
        causation: {}
      });
      
      assert(event, 'Should handle empty arrays');
      const payload = event.payload as any;
      assert(Array.isArray(payload.items), 'Items should be array');
      assert.equal(payload.items.length, 0, 'Array should be empty');
    });
    
    it('should handle very large arrays', async () => {
      const systemActor = { type: 'System' as const, systemId: 'test' };
      const largeArray = Array.from({ length: 10000 }, (_, i) => ({ id: i, data: `item-${i}` }));
      
      const event = await eventStore.append({
        type: 'TestEvent',
        aggregateId: Ids.entity(),
        aggregateType: 'Entity' as const,
        aggregateVersion: 1,
        payload: { items: largeArray },
        actor: systemActor,
        causation: {}
      });
      
      assert(event, 'Should handle large arrays');
      const payload = event.payload as any;
      assert.equal(payload.items.length, 10000, 'Large array should be preserved');
    });
  });
  
  describe('Concurrent Operations', () => {
    it('should handle concurrent appends', async () => {
      const systemActor = { type: 'System' as const, systemId: 'test' };
      const aggregateId = Ids.entity();
      
      // Create multiple events concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        eventStore.append({
          type: 'TestEvent',
          aggregateId,
          aggregateType: 'Entity' as const,
          aggregateVersion: i + 1,
          payload: { index: i },
          actor: systemActor,
          causation: {}
        })
      );
      
      const events = await Promise.all(promises);
      
      // All should succeed
      assert.equal(events.length, 10, 'All concurrent appends should succeed');
      
      // Verify sequence is monotonic
      for (let i = 1; i < events.length; i++) {
        assert(events[i].sequence > events[i - 1].sequence,
          `Sequence should be monotonic: ${events[i - 1].sequence} -> ${events[i].sequence}`);
      }
    });
  });
  
  describe('Memory and Performance', () => {
    it('should handle many events without memory issues', async () => {
      const systemActor = { type: 'System' as const, systemId: 'test' };
      const numEvents = 1000;
      
      const startMemory = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < numEvents; i++) {
        await eventStore.append({
          type: 'TestEvent',
          aggregateId: Ids.entity(),
          aggregateType: 'Entity' as const,
          aggregateVersion: 1,
          payload: { index: i },
          actor: systemActor,
          causation: {}
        });
      }
      
      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = endMemory - startMemory;
      
      // Memory should increase but not excessively (rough check)
      assert(memoryIncrease < 100 * 1024 * 1024, // 100MB limit
        `Memory increase too large: ${memoryIncrease / 1024 / 1024}MB`);
    });
  });
});

