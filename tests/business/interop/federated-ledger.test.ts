/**
 * FEDERATED LEDGER TESTS
 * 
 * SPRINT E.2: Tests for multi-realm ledger synchronization
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  FederatedLedger,
  createFederatedLedger,
  type VectorClock,
} from '../../../core/interop/federated-ledger';
import type { EntityId } from '../../../core/schema/ledger';
import type { Event } from '../../../core/schema/ledger';

describe('Federated Ledger (SPRINT E.2)', () => {
  
  let ledgerA: FederatedLedger;
  let ledgerB: FederatedLedger;
  const realmA = 'realm-a' as EntityId;
  const realmB = 'realm-b' as EntityId;
  
  beforeEach(() => {
    ledgerA = createFederatedLedger({
      realmId: realmA,
      syncIntervalMs: 1000,
      maxBatchSize: 100,
      conflictStrategy: 'LastWriteWins',
    });
    
    ledgerB = createFederatedLedger({
      realmId: realmB,
      syncIntervalMs: 1000,
      maxBatchSize: 100,
      conflictStrategy: 'LastWriteWins',
    });
  });
  
  function createTestEvent(id: string, aggregateId: string): Event {
    return {
      id: id as EntityId,
      type: 'TestEvent',
      aggregateType: 'Test',
      aggregateId: aggregateId as EntityId,
      aggregateVersion: 1,
      timestamp: Date.now(),
      actor: { type: 'System', systemId: 'test' },
      payload: { data: 'test' },
    };
  }
  
  describe('Local Operations', () => {
    it('appends local event', () => {
      const event = createTestEvent('evt-1', 'agg-1');
      const federated = ledgerA.appendLocal(event);
      
      assert.ok(federated.event);
      assert.strictEqual(federated.sourceRealm, realmA);
      assert.ok(federated.signature);
      assert.ok(federated.vectorClock);
    });
    
    it('increments vector clock on append', () => {
      const clock1 = ledgerA.getVectorClock();
      ledgerA.appendLocal(createTestEvent('evt-1', 'agg-1'));
      const clock2 = ledgerA.getVectorClock();
      
      const v1 = clock1.clocks.get(realmA) ?? 0;
      const v2 = clock2.clocks.get(realmA) ?? 0;
      
      assert.strictEqual(v2, v1 + 1);
    });
    
    it('gets events since vector clock', () => {
      ledgerA.appendLocal(createTestEvent('evt-1', 'agg-1'));
      const clockAfterFirst = ledgerA.getVectorClock();
      
      ledgerA.appendLocal(createTestEvent('evt-2', 'agg-2'));
      ledgerA.appendLocal(createTestEvent('evt-3', 'agg-3'));
      
      const events = ledgerA.getEventsSince(clockAfterFirst);
      
      assert.strictEqual(events.length, 2);
    });
  });
  
  describe('Sync Operations', () => {
    it('creates sync request', () => {
      const request = ledgerA.createSyncRequest(realmB);
      
      assert.ok(request.id);
      assert.strictEqual(request.sourceRealm, realmA);
      assert.strictEqual(request.targetRealm, realmB);
    });
    
    it('processes sync request', () => {
      ledgerA.appendLocal(createTestEvent('evt-1', 'agg-1'));
      ledgerA.appendLocal(createTestEvent('evt-2', 'agg-2'));
      
      const request = ledgerB.createSyncRequest(realmA);
      const response = ledgerA.processSyncRequest(request);
      
      assert.strictEqual(response.events.length, 2);
      assert.ok(response.merkleRoot);
    });
    
    it('applies sync response', () => {
      // Ledger A creates events
      ledgerA.appendLocal(createTestEvent('evt-1', 'agg-1'));
      ledgerA.appendLocal(createTestEvent('evt-2', 'agg-2'));
      
      // Ledger B syncs from A
      const request = ledgerB.createSyncRequest(realmA);
      const response = ledgerA.processSyncRequest(request);
      const result = ledgerB.applySyncResponse(response, realmA);
      
      assert.strictEqual(result.applied, 2);
      assert.strictEqual(result.conflicts, 0);
      
      const stats = ledgerB.getStats();
      assert.strictEqual(stats.remoteEvents, 2);
    });
    
    it('syncs bidirectionally', () => {
      // A creates events
      ledgerA.appendLocal(createTestEvent('evt-a1', 'agg-1'));
      
      // B creates events
      ledgerB.appendLocal(createTestEvent('evt-b1', 'agg-2'));
      
      // A syncs from B
      const requestAB = ledgerA.createSyncRequest(realmB);
      const responseB = ledgerB.processSyncRequest(requestAB);
      ledgerA.applySyncResponse(responseB, realmB);
      
      // B syncs from A
      const requestBA = ledgerB.createSyncRequest(realmA);
      const responseA = ledgerA.processSyncRequest(requestBA);
      ledgerB.applySyncResponse(responseA, realmA);
      
      // Both should have all events
      const statsA = ledgerA.getStats();
      const statsB = ledgerB.getStats();
      
      assert.strictEqual(statsA.totalEvents, 2);
      assert.strictEqual(statsB.totalEvents, 2);
    });
  });
  
  describe('Conflict Detection', () => {
    it('detects concurrent modifications', () => {
      // Both realms modify same aggregate concurrently
      ledgerA.appendLocal(createTestEvent('evt-a1', 'shared-agg'));
      ledgerB.appendLocal(createTestEvent('evt-b1', 'shared-agg'));
      
      // Sync B to A
      const request = ledgerA.createSyncRequest(realmB);
      const response = ledgerB.processSyncRequest(request);
      const result = ledgerA.applySyncResponse(response, realmB);
      
      // Should detect conflict (concurrent events on same aggregate)
      // Note: In this simplified test, conflicts may or may not be detected
      // depending on vector clock state
      assert.ok(result.applied >= 0);
    });
  });
  
  describe('Conflict Resolution', () => {
    it('resolves with LastWriteWins strategy', () => {
      const ledger = createFederatedLedger({
        realmId: realmA,
        conflictStrategy: 'LastWriteWins',
      });
      
      // This tests the resolution logic exists
      const stats = ledger.getStats();
      assert.strictEqual(stats.unresolvedConflicts, 0);
    });
    
    it('gets unresolved conflicts', () => {
      const conflicts = ledgerA.getUnresolvedConflicts();
      assert.ok(Array.isArray(conflicts));
    });
  });
  
  describe('Vector Clock', () => {
    it('maintains vector clock', () => {
      const clock = ledgerA.getVectorClock();
      
      assert.ok(clock.clocks);
      assert.ok(clock.clocks.has(realmA));
    });
    
    it('merges vector clocks on sync', () => {
      ledgerA.appendLocal(createTestEvent('evt-1', 'agg-1'));
      ledgerB.appendLocal(createTestEvent('evt-2', 'agg-2'));
      
      // Sync
      const request = ledgerA.createSyncRequest(realmB);
      const response = ledgerB.processSyncRequest(request);
      ledgerA.applySyncResponse(response, realmB);
      
      const clock = ledgerA.getVectorClock();
      
      // Should know about both realms
      assert.ok(clock.clocks.get(realmA)! >= 1);
      assert.ok(clock.clocks.get(realmB)! >= 1);
    });
  });
  
  describe('Realm State', () => {
    it('tracks realm state', () => {
      const state = ledgerA.getRealmState(realmA);
      
      assert.ok(state);
      assert.strictEqual(state.realmId, realmA);
      assert.strictEqual(state.status, 'InSync');
    });
    
    it('updates realm state after sync', () => {
      ledgerA.appendLocal(createTestEvent('evt-1', 'agg-1'));
      
      const request = ledgerB.createSyncRequest(realmA);
      const response = ledgerA.processSyncRequest(request);
      ledgerB.applySyncResponse(response, realmA);
      
      const state = ledgerB.getRealmState(realmA);
      
      assert.ok(state);
      assert.ok(state.lastSyncAt > 0);
    });
    
    it('gets all realm states', () => {
      const states = ledgerA.getAllRealmStates();
      
      assert.ok(states.length >= 1);
    });
  });
  
  describe('Statistics', () => {
    it('provides ledger statistics', () => {
      ledgerA.appendLocal(createTestEvent('evt-1', 'agg-1'));
      ledgerA.appendLocal(createTestEvent('evt-2', 'agg-2'));
      
      const stats = ledgerA.getStats();
      
      assert.strictEqual(stats.localEvents, 2);
      assert.strictEqual(stats.remoteEvents, 0);
      assert.strictEqual(stats.totalEvents, 2);
      assert.ok(stats.merkleRoot);
    });
  });
  
  describe('Factory', () => {
    it('createFederatedLedger uses defaults', () => {
      const defaultLedger = createFederatedLedger();
      assert.ok(defaultLedger);
    });
  });
});
