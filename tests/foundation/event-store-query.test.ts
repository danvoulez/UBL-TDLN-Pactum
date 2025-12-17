/**
 * EVENT STORE QUERY TESTS
 * 
 * FASE 2.1: Tests for the new query() method and getNextVersion()
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createInMemoryEventStore, type EventStore } from '../../core/store/event-store';
import type { EntityId, AggregateType } from '../../core/schema/ledger';

describe('EventStore Query (FASE 2.1)', () => {
  let eventStore: EventStore;
  const testActor = { type: 'System' as const, systemId: 'test' };
  
  beforeEach(async () => {
    eventStore = createInMemoryEventStore();
    
    // Seed with test events
    await eventStore.append({
      type: 'WalletCreated',
      aggregateId: 'wallet-1' as EntityId,
      aggregateType: 'Wallet' as AggregateType,
      aggregateVersion: 1,
      actor: testActor,
      payload: { name: 'Test Wallet 1' },
      causation: { correlationId: 'tx-001' as EntityId },
    });
    
    await eventStore.append({
      type: 'CreditDeposited',
      aggregateId: 'wallet-1' as EntityId,
      aggregateType: 'Wallet' as AggregateType,
      aggregateVersion: 2,
      actor: testActor,
      payload: { amount: 1000 },
      causation: { correlationId: 'tx-001' as EntityId },
    });
    
    await eventStore.append({
      type: 'WalletCreated',
      aggregateId: 'wallet-2' as EntityId,
      aggregateType: 'Wallet' as AggregateType,
      aggregateVersion: 1,
      actor: { type: 'Entity' as const, entityId: 'user-1' as EntityId },
      payload: { name: 'Test Wallet 2' },
      causation: { correlationId: 'tx-002' as EntityId },
    });
    
    await eventStore.append({
      type: 'AgentRegistered',
      aggregateId: 'agent-1' as EntityId,
      aggregateType: 'Entity' as AggregateType,
      aggregateVersion: 1,
      actor: testActor,
      payload: { name: 'Test Agent' },
      causation: { correlationId: 'tx-003' as EntityId },
    });
  });
  
  describe('query()', () => {
    it('returns all events when no criteria specified', async () => {
      const result = await eventStore.query({});
      
      assert.strictEqual(result.total, 4);
      assert.strictEqual(result.events.length, 4);
      assert.strictEqual(result.hasMore, false);
    });
    
    it('filters by event types', async () => {
      const result = await eventStore.query({
        eventTypes: ['WalletCreated'],
      });
      
      assert.strictEqual(result.total, 2);
      assert.ok(result.events.every(e => e.type === 'WalletCreated'));
    });
    
    it('filters by aggregate types', async () => {
      const result = await eventStore.query({
        aggregateTypes: ['Wallet' as AggregateType],
      });
      
      assert.strictEqual(result.total, 3);
      assert.ok(result.events.every(e => e.aggregateType === 'Wallet'));
    });
    
    it('filters by aggregate IDs', async () => {
      const result = await eventStore.query({
        aggregateIds: ['wallet-1' as EntityId],
      });
      
      assert.strictEqual(result.total, 2);
      assert.ok(result.events.every(e => e.aggregateId === 'wallet-1'));
    });
    
    it('filters by correlation ID (transaction tracking)', async () => {
      const result = await eventStore.query({
        correlationId: 'tx-001' as EntityId,
      });
      
      assert.strictEqual(result.total, 2);
      assert.ok(result.events.every(e => e.causation?.correlationId === 'tx-001'));
    });
    
    it('filters by actor type', async () => {
      const result = await eventStore.query({
        actor: { type: 'Entity' },
      });
      
      assert.strictEqual(result.total, 1);
      assert.strictEqual(result.events[0].actor.type, 'Entity');
    });
    
    it('filters by actor entityId', async () => {
      const result = await eventStore.query({
        actor: { entityId: 'user-1' as EntityId },
      });
      
      assert.strictEqual(result.total, 1);
    });
    
    it('supports pagination', async () => {
      const page1 = await eventStore.query({
        pagination: { limit: 2, offset: 0 },
      });
      
      assert.strictEqual(page1.events.length, 2);
      assert.strictEqual(page1.total, 4);
      assert.strictEqual(page1.hasMore, true);
      assert.strictEqual(page1.nextOffset, 2);
      
      const page2 = await eventStore.query({
        pagination: { limit: 2, offset: 2 },
      });
      
      assert.strictEqual(page2.events.length, 2);
      assert.strictEqual(page2.hasMore, false);
    });
    
    it('supports descending order', async () => {
      const result = await eventStore.query({
        orderDirection: 'desc',
      });
      
      assert.strictEqual(result.events[0].type, 'AgentRegistered');
      assert.strictEqual(result.events[3].type, 'WalletCreated');
    });
    
    it('combines multiple filters', async () => {
      const result = await eventStore.query({
        aggregateTypes: ['Wallet' as AggregateType],
        eventTypes: ['WalletCreated'],
      });
      
      assert.strictEqual(result.total, 2);
      assert.ok(result.events.every(e => 
        e.type === 'WalletCreated' && e.aggregateType === 'Wallet'
      ));
    });
  });
  
  describe('getNextVersion()', () => {
    it('returns 1 for new aggregate', async () => {
      const version = await eventStore.getNextVersion(
        'Wallet' as AggregateType,
        'wallet-new' as EntityId
      );
      
      assert.strictEqual(version, 1);
    });
    
    it('returns correct next version for existing aggregate', async () => {
      const version = await eventStore.getNextVersion(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId
      );
      
      assert.strictEqual(version, 3); // Has 2 events, next is 3
    });
    
    it('returns correct version after appending', async () => {
      const versionBefore = await eventStore.getNextVersion(
        'Entity' as AggregateType,
        'agent-1' as EntityId
      );
      
      assert.strictEqual(versionBefore, 2);
      
      await eventStore.append({
        type: 'AgentUpdated',
        aggregateId: 'agent-1' as EntityId,
        aggregateType: 'Entity' as AggregateType,
        aggregateVersion: 2,
        actor: testActor,
        payload: { name: 'Updated Agent' },
      });
      
      const versionAfter = await eventStore.getNextVersion(
        'Entity' as AggregateType,
        'agent-1' as EntityId
      );
      
      assert.strictEqual(versionAfter, 3);
    });
  });
});
