/**
 * EVENT BATCHER TESTS
 * 
 * FASE 3.1: Tests for event batching performance optimization
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createInMemoryEventStore, type EventStore } from '../../core/store/event-store';
import {
  EventBatcher,
  createEventBatcher,
  createMicroPaymentBatcher,
  createTelemetryBatcher,
} from '../../core/store/event-batcher';
import type { EntityId, AggregateType } from '../../core/schema/ledger';

describe('Event Batcher (FASE 3.1)', () => {
  let eventStore: EventStore;
  const testActor = { type: 'System' as const, systemId: 'test' };
  
  beforeEach(() => {
    eventStore = createInMemoryEventStore();
  });
  
  describe('Basic Batching', () => {
    it('buffers batchable events', async () => {
      const batcher = createEventBatcher(eventStore, {
        maxBatchSize: 10,
        maxBatchAgeMs: 10000,
        batchableEventTypes: ['MicroPayment'],
      });
      
      await batcher.add({
        type: 'MicroPayment',
        aggregateId: 'wallet-1' as EntityId,
        aggregateType: 'Wallet' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: { amount: 1 },
      });
      
      assert.strictEqual(batcher.getBufferSize(), 1);
      assert.strictEqual(batcher.hasPending(), true);
      
      // Event not yet in store
      const result = await eventStore.query({ eventTypes: ['MicroPayment'] });
      assert.strictEqual(result.total, 0);
      
      await batcher.stop();
    });
    
    it('passes non-batchable events directly to store', async () => {
      const batcher = createEventBatcher(eventStore, {
        maxBatchSize: 10,
        maxBatchAgeMs: 10000,
        batchableEventTypes: ['MicroPayment'],
      });
      
      await batcher.add({
        type: 'WalletCreated', // Not batchable
        aggregateId: 'wallet-1' as EntityId,
        aggregateType: 'Wallet' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: { name: 'Test' },
      });
      
      assert.strictEqual(batcher.getBufferSize(), 0);
      
      // Event should be in store immediately
      const result = await eventStore.query({ eventTypes: ['WalletCreated'] });
      assert.strictEqual(result.total, 1);
      
      await batcher.stop();
    });
    
    it('auto-flushes when batch size reached', async () => {
      const batcher = createEventBatcher(eventStore, {
        maxBatchSize: 3,
        maxBatchAgeMs: 10000,
        batchableEventTypes: ['MicroPayment'],
      });
      
      // Add 3 events (should trigger flush)
      for (let i = 0; i < 3; i++) {
        await batcher.add({
          type: 'MicroPayment',
          aggregateId: 'wallet-1' as EntityId,
          aggregateType: 'Wallet' as AggregateType,
          aggregateVersion: i + 1,
          actor: testActor,
          payload: { amount: i + 1 },
        });
      }
      
      // Buffer should be empty after auto-flush
      assert.strictEqual(batcher.getBufferSize(), 0);
      
      // Events should be in store
      const result = await eventStore.query({ eventTypes: ['MicroPayment'] });
      assert.strictEqual(result.total, 3);
      
      await batcher.stop();
    });
    
    it('manual flush empties buffer', async () => {
      const batcher = createEventBatcher(eventStore, {
        maxBatchSize: 100,
        maxBatchAgeMs: 10000,
        batchableEventTypes: ['MicroPayment'],
      });
      
      await batcher.add({
        type: 'MicroPayment',
        aggregateId: 'wallet-1' as EntityId,
        aggregateType: 'Wallet' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: { amount: 100 },
      });
      
      assert.strictEqual(batcher.getBufferSize(), 1);
      
      const flushed = await batcher.flush();
      
      assert.strictEqual(flushed.length, 1);
      assert.strictEqual(batcher.getBufferSize(), 0);
      
      await batcher.stop();
    });
  });
  
  describe('Statistics', () => {
    it('tracks batching statistics', async () => {
      const batcher = createEventBatcher(eventStore, {
        maxBatchSize: 5,
        maxBatchAgeMs: 10000,
        batchableEventTypes: ['MicroPayment'],
      });
      
      // Add 5 events (triggers flush)
      for (let i = 0; i < 5; i++) {
        await batcher.add({
          type: 'MicroPayment',
          aggregateId: 'wallet-1' as EntityId,
          aggregateType: 'Wallet' as AggregateType,
          aggregateVersion: i + 1,
          actor: testActor,
          payload: { amount: i },
        });
      }
      
      const stats = batcher.getStats();
      
      assert.strictEqual(stats.totalBatched, 5);
      assert.strictEqual(stats.totalFlushed, 5);
      assert.strictEqual(stats.batchCount, 1);
      assert.strictEqual(stats.averageBatchSize, 5);
      assert.ok(stats.lastFlushAt);
      
      await batcher.stop();
    });
  });
  
  describe('Flush Callback', () => {
    it('calls onFlush callback with events and duration', async () => {
      let callbackCalled = false;
      let flushedEvents: readonly unknown[] = [];
      let flushDuration = 0;
      
      const batcher = createEventBatcher(eventStore, {
        maxBatchSize: 2,
        maxBatchAgeMs: 10000,
        batchableEventTypes: ['MicroPayment'],
        onFlush: (events, duration) => {
          callbackCalled = true;
          flushedEvents = events;
          flushDuration = duration;
        },
      });
      
      await batcher.add({
        type: 'MicroPayment',
        aggregateId: 'wallet-1' as EntityId,
        aggregateType: 'Wallet' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: { amount: 1 },
      });
      
      await batcher.add({
        type: 'MicroPayment',
        aggregateId: 'wallet-1' as EntityId,
        aggregateType: 'Wallet' as AggregateType,
        aggregateVersion: 2,
        actor: testActor,
        payload: { amount: 2 },
      });
      
      assert.strictEqual(callbackCalled, true);
      assert.strictEqual(flushedEvents.length, 2);
      assert.ok(flushDuration >= 0);
      
      await batcher.stop();
    });
  });
  
  describe('Specialized Batchers', () => {
    it('creates micro-payment batcher with correct config', () => {
      const batcher = createMicroPaymentBatcher(eventStore);
      
      // Should have smaller batch size and faster flush
      const stats = batcher.getStats();
      assert.strictEqual(stats.currentBufferSize, 0);
    });
    
    it('creates telemetry batcher with correct config', () => {
      const batcher = createTelemetryBatcher(eventStore);
      
      const stats = batcher.getStats();
      assert.strictEqual(stats.currentBufferSize, 0);
    });
  });
  
  describe('Stop Behavior', () => {
    it('flushes remaining events on stop', async () => {
      const batcher = createEventBatcher(eventStore, {
        maxBatchSize: 100,
        maxBatchAgeMs: 10000,
        batchableEventTypes: ['MicroPayment'],
      });
      
      await batcher.add({
        type: 'MicroPayment',
        aggregateId: 'wallet-1' as EntityId,
        aggregateType: 'Wallet' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: { amount: 1 },
      });
      
      assert.strictEqual(batcher.hasPending(), true);
      
      await batcher.stop();
      
      assert.strictEqual(batcher.hasPending(), false);
      
      const result = await eventStore.query({ eventTypes: ['MicroPayment'] });
      assert.strictEqual(result.total, 1);
    });
  });
});
