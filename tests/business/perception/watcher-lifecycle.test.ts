/**
 * WATCHER LIFECYCLE TESTS
 * 
 * FASE 2.3: Tests for watcher lifecycle management
 * - Creation, activation, pausing, resuming, stopping
 * - Status transitions and error handling
 * - Statistics tracking
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createInMemoryEventStore, type EventStore } from '../../../core/store/event-store';
import {
  createWatcher,
  type Watcher,
  type WatcherSource,
  type WatcherFilter,
  type WatcherAction,
  type WatcherStatus,
  WATCHER_PRICING,
} from '../../../core/schema/perception';
import { Ids } from '../../../core/shared/types';
import type { EntityId, AggregateType } from '../../../core/schema/ledger';

describe('Watcher Lifecycle (FASE 2.3)', () => {
  let eventStore: EventStore;
  const testActor = { type: 'System' as const, systemId: 'test' };
  
  const ownerId = Ids.entity();
  
  const defaultSource: WatcherSource = {
    type: 'poll',
    endpoint: 'https://api.example.com/data',
  };
  
  const defaultFilter: WatcherFilter = {
    keywords: ['important', 'urgent'],
  };
  
  const defaultAction: WatcherAction = {
    type: 'notify',
  };
  
  beforeEach(() => {
    eventStore = createInMemoryEventStore();
  });
  
  function createTestWatcher(overrides?: Partial<{
    source: WatcherSource;
    filter: WatcherFilter;
    action: WatcherAction;
    tier: 'Basic' | 'Standard' | 'Premium';
  }>): Watcher {
    const watcherId = Ids.entity();
    return createWatcher(
      watcherId,
      ownerId,
      'Test Watcher',
      overrides?.source ?? defaultSource,
      overrides?.filter ?? defaultFilter,
      overrides?.action ?? defaultAction,
      overrides?.tier ?? 'Basic'
    );
  }
  
  describe('Watcher Creation', () => {
    it('creates watcher with Active status', () => {
      const watcher = createTestWatcher();
      
      assert.strictEqual(watcher.status, 'Active');
      assert.ok(watcher.id);
      assert.strictEqual(watcher.ownerId, ownerId);
    });
    
    it('initializes stats to zero', () => {
      const watcher = createTestWatcher();
      
      assert.strictEqual(watcher.stats.triggerCount, 0);
      assert.strictEqual(watcher.stats.errorCount, 0);
      assert.strictEqual(watcher.stats.lastCheckAt, undefined);
    });
    
    it('sets createdAt timestamp', () => {
      const before = Date.now();
      const watcher = createTestWatcher();
      const after = Date.now();
      
      assert.ok(watcher.createdAt >= before);
      assert.ok(watcher.createdAt <= after);
    });
  });
  
  describe('Status Transitions', () => {
    it('records WatcherCreated event', async () => {
      const watcher = createTestWatcher();
      
      await eventStore.append({
        type: 'WatcherCreated',
        aggregateId: watcher.id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: {
          watcherId: watcher.id,
          ownerId: watcher.ownerId,
          name: watcher.name,
          source: watcher.source,
          filter: watcher.filter,
          action: watcher.action,
          tier: watcher.tier,
        },
      });
      
      const result = await eventStore.query({
        eventTypes: ['WatcherCreated'],
      });
      
      assert.strictEqual(result.total, 1);
      assert.strictEqual(result.events[0].payload.watcherId, watcher.id);
    });
    
    it('records WatcherPaused event', async () => {
      const watcher = createTestWatcher();
      
      await eventStore.append({
        type: 'WatcherCreated',
        aggregateId: watcher.id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: { watcherId: watcher.id, ownerId, name: 'Test', source: defaultSource, filter: defaultFilter, action: defaultAction, tier: 'Basic' },
      });
      
      await eventStore.append({
        type: 'WatcherPaused',
        aggregateId: watcher.id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 2,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          watcherId: watcher.id,
          reason: 'User requested pause',
        },
      });
      
      const result = await eventStore.query({
        aggregateIds: [watcher.id],
      });
      
      assert.strictEqual(result.total, 2);
      assert.strictEqual(result.events[1].type, 'WatcherPaused');
    });
    
    it('records WatcherResumed event', async () => {
      const watcher = createTestWatcher();
      
      // Create -> Pause -> Resume
      await eventStore.append({
        type: 'WatcherCreated',
        aggregateId: watcher.id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: { watcherId: watcher.id, ownerId, name: 'Test', source: defaultSource, filter: defaultFilter, action: defaultAction, tier: 'Basic' },
      });
      
      await eventStore.append({
        type: 'WatcherPaused',
        aggregateId: watcher.id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 2,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: { watcherId: watcher.id },
      });
      
      await eventStore.append({
        type: 'WatcherResumed',
        aggregateId: watcher.id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 3,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: { watcherId: watcher.id },
      });
      
      const result = await eventStore.query({
        aggregateIds: [watcher.id],
      });
      
      assert.strictEqual(result.total, 3);
      assert.strictEqual(result.events[2].type, 'WatcherResumed');
    });
    
    it('records WatcherStopped event', async () => {
      const watcher = createTestWatcher();
      
      await eventStore.append({
        type: 'WatcherCreated',
        aggregateId: watcher.id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: { watcherId: watcher.id, ownerId, name: 'Test', source: defaultSource, filter: defaultFilter, action: defaultAction, tier: 'Basic' },
      });
      
      await eventStore.append({
        type: 'WatcherStopped',
        aggregateId: watcher.id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 2,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          watcherId: watcher.id,
          reason: 'No longer needed',
        },
      });
      
      const result = await eventStore.query({
        eventTypes: ['WatcherStopped'],
      });
      
      assert.strictEqual(result.total, 1);
    });
  });
  
  describe('Watcher Triggers', () => {
    it('records WatcherTriggered event', async () => {
      const watcher = createTestWatcher();
      
      await eventStore.append({
        type: 'WatcherCreated',
        aggregateId: watcher.id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: { watcherId: watcher.id, ownerId, name: 'Test', source: defaultSource, filter: defaultFilter, action: defaultAction, tier: 'Basic' },
      });
      
      await eventStore.append({
        type: 'WatcherTriggered',
        aggregateId: watcher.id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 2,
        actor: testActor,
        payload: {
          watcherId: watcher.id,
          triggerData: { message: 'Important update detected' },
          matchedKeywords: ['important'],
        },
      });
      
      const result = await eventStore.query({
        eventTypes: ['WatcherTriggered'],
      });
      
      assert.strictEqual(result.total, 1);
      assert.deepStrictEqual(result.events[0].payload.matchedKeywords, ['important']);
    });
    
    it('tracks multiple triggers', async () => {
      const watcher = createTestWatcher();
      
      await eventStore.append({
        type: 'WatcherCreated',
        aggregateId: watcher.id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: { watcherId: watcher.id, ownerId, name: 'Test', source: defaultSource, filter: defaultFilter, action: defaultAction, tier: 'Basic' },
      });
      
      // Multiple triggers
      for (let i = 0; i < 5; i++) {
        await eventStore.append({
          type: 'WatcherTriggered',
          aggregateId: watcher.id,
          aggregateType: 'Watcher' as AggregateType,
          aggregateVersion: i + 2,
          actor: testActor,
          payload: {
            watcherId: watcher.id,
            triggerData: { index: i },
          },
        });
      }
      
      const result = await eventStore.query({
        eventTypes: ['WatcherTriggered'],
        aggregateIds: [watcher.id],
      });
      
      assert.strictEqual(result.total, 5);
    });
  });
  
  describe('Error Handling', () => {
    it('records WatcherError event', async () => {
      const watcher = createTestWatcher();
      
      await eventStore.append({
        type: 'WatcherCreated',
        aggregateId: watcher.id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: { watcherId: watcher.id, ownerId, name: 'Test', source: defaultSource, filter: defaultFilter, action: defaultAction, tier: 'Basic' },
      });
      
      await eventStore.append({
        type: 'WatcherError',
        aggregateId: watcher.id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 2,
        actor: testActor,
        payload: {
          watcherId: watcher.id,
          errorType: 'ConnectionFailed',
          errorMessage: 'Failed to connect to endpoint',
          retryCount: 3,
        },
      });
      
      const result = await eventStore.query({
        eventTypes: ['WatcherError'],
      });
      
      assert.strictEqual(result.total, 1);
      assert.strictEqual(result.events[0].payload.errorType, 'ConnectionFailed');
    });
  });
  
  describe('Tier Constraints', () => {
    it('Basic tier has 1 hour minimum poll interval', () => {
      assert.strictEqual(WATCHER_PRICING.Basic.pollMinInterval, 'PT1H');
      assert.strictEqual(WATCHER_PRICING.Basic.maxWatchers, 5);
    });
    
    it('Standard tier has 5 minute minimum poll interval', () => {
      assert.strictEqual(WATCHER_PRICING.Standard.pollMinInterval, 'PT5M');
      assert.strictEqual(WATCHER_PRICING.Standard.maxWatchers, 20);
    });
    
    it('Premium tier has 1 minute minimum poll interval', () => {
      assert.strictEqual(WATCHER_PRICING.Premium.pollMinInterval, 'PT1M');
      assert.strictEqual(WATCHER_PRICING.Premium.maxWatchers, 100);
    });
  });
  
  describe('Query Watchers by Owner', () => {
    it('can find all watchers for an owner', async () => {
      const watcher1 = createTestWatcher();
      const watcher2 = createTestWatcher();
      const otherOwnerId = Ids.entity();
      const watcher3Id = Ids.entity();
      
      // Create watchers for our owner
      await eventStore.append({
        type: 'WatcherCreated',
        aggregateId: watcher1.id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: { watcherId: watcher1.id, ownerId, name: 'Watcher 1', source: defaultSource, filter: defaultFilter, action: defaultAction, tier: 'Basic' },
      });
      
      await eventStore.append({
        type: 'WatcherCreated',
        aggregateId: watcher2.id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: { watcherId: watcher2.id, ownerId, name: 'Watcher 2', source: defaultSource, filter: defaultFilter, action: defaultAction, tier: 'Standard' },
      });
      
      // Create watcher for different owner
      await eventStore.append({
        type: 'WatcherCreated',
        aggregateId: watcher3Id,
        aggregateType: 'Watcher' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: { watcherId: watcher3Id, ownerId: otherOwnerId, name: 'Other Watcher', source: defaultSource, filter: defaultFilter, action: defaultAction, tier: 'Basic' },
      });
      
      // Query all WatcherCreated events
      const result = await eventStore.query({
        eventTypes: ['WatcherCreated'],
      });
      
      assert.strictEqual(result.total, 3);
      
      // Filter by owner (would be done in a projection in production)
      const ownerWatchers = result.events.filter(e => e.payload.ownerId === ownerId);
      assert.strictEqual(ownerWatchers.length, 2);
    });
  });
});
