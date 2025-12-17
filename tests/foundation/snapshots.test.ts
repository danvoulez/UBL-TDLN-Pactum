/**
 * SNAPSHOT TESTS
 * 
 * FASE 3.1: Tests for temporal snapshots
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  InMemorySnapshotStore,
  SnapshotManager,
  createSnapshotStore,
  createSnapshotManager,
  type Snapshot,
} from '../../core/store/snapshots';
import type { EntityId, AggregateType, SequenceNumber } from '../../core/schema/ledger';

describe('Temporal Snapshots (FASE 3.1)', () => {
  
  describe('InMemorySnapshotStore', () => {
    let store: InMemorySnapshotStore;
    
    beforeEach(() => {
      store = new InMemorySnapshotStore();
    });
    
    it('saves and retrieves snapshots', async () => {
      const snapshot: Snapshot<{ balance: bigint }> = {
        id: 'snap-1',
        aggregateType: 'Wallet' as AggregateType,
        aggregateId: 'wallet-1' as EntityId,
        version: 100,
        sequenceNumber: 1000n as SequenceNumber,
        state: { balance: 5000n },
        createdAt: Date.now(),
        hash: 'abc123',
      };
      
      await store.save(snapshot);
      
      const retrieved = await store.getLatest<{ balance: bigint }>(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId
      );
      
      assert.ok(retrieved);
      assert.strictEqual(retrieved.id, 'snap-1');
      assert.strictEqual(retrieved.state.balance, 5000n);
    });
    
    it('returns latest snapshot when multiple exist', async () => {
      const snap1: Snapshot = {
        id: 'snap-1',
        aggregateType: 'Wallet' as AggregateType,
        aggregateId: 'wallet-1' as EntityId,
        version: 50,
        sequenceNumber: 500n as SequenceNumber,
        state: { balance: 1000 },
        createdAt: Date.now() - 1000,
        hash: 'hash1',
      };
      
      const snap2: Snapshot = {
        id: 'snap-2',
        aggregateType: 'Wallet' as AggregateType,
        aggregateId: 'wallet-1' as EntityId,
        version: 100,
        sequenceNumber: 1000n as SequenceNumber,
        state: { balance: 2000 },
        createdAt: Date.now(),
        hash: 'hash2',
      };
      
      await store.save(snap1);
      await store.save(snap2);
      
      const latest = await store.getLatest('Wallet' as AggregateType, 'wallet-1' as EntityId);
      
      assert.ok(latest);
      assert.strictEqual(latest.id, 'snap-2');
      assert.strictEqual(latest.sequenceNumber, 1000n);
    });
    
    it('gets snapshot at or before sequence', async () => {
      const snap1: Snapshot = {
        id: 'snap-1',
        aggregateType: 'Wallet' as AggregateType,
        aggregateId: 'wallet-1' as EntityId,
        version: 50,
        sequenceNumber: 500n as SequenceNumber,
        state: { balance: 1000 },
        createdAt: Date.now() - 2000,
        hash: 'hash1',
      };
      
      const snap2: Snapshot = {
        id: 'snap-2',
        aggregateType: 'Wallet' as AggregateType,
        aggregateId: 'wallet-1' as EntityId,
        version: 100,
        sequenceNumber: 1000n as SequenceNumber,
        state: { balance: 2000 },
        createdAt: Date.now() - 1000,
        hash: 'hash2',
      };
      
      const snap3: Snapshot = {
        id: 'snap-3',
        aggregateType: 'Wallet' as AggregateType,
        aggregateId: 'wallet-1' as EntityId,
        version: 150,
        sequenceNumber: 1500n as SequenceNumber,
        state: { balance: 3000 },
        createdAt: Date.now(),
        hash: 'hash3',
      };
      
      await store.save(snap1);
      await store.save(snap2);
      await store.save(snap3);
      
      // Query at sequence 1200 should return snap2 (1000)
      const result = await store.getAtSequence(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId,
        1200n as SequenceNumber
      );
      
      assert.ok(result);
      assert.strictEqual(result.id, 'snap-2');
    });
    
    it('gets snapshot at or before timestamp', async () => {
      const now = Date.now();
      
      const snap1: Snapshot = {
        id: 'snap-1',
        aggregateType: 'Wallet' as AggregateType,
        aggregateId: 'wallet-1' as EntityId,
        version: 50,
        sequenceNumber: 500n as SequenceNumber,
        state: { balance: 1000 },
        createdAt: now - 3000,
        hash: 'hash1',
      };
      
      const snap2: Snapshot = {
        id: 'snap-2',
        aggregateType: 'Wallet' as AggregateType,
        aggregateId: 'wallet-1' as EntityId,
        version: 100,
        sequenceNumber: 1000n as SequenceNumber,
        state: { balance: 2000 },
        createdAt: now - 1000,
        hash: 'hash2',
      };
      
      await store.save(snap1);
      await store.save(snap2);
      
      // Query at time between snap1 and snap2
      const result = await store.getAtTime(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId,
        now - 2000
      );
      
      assert.ok(result);
      assert.strictEqual(result.id, 'snap-1');
    });
    
    it('cleans up old snapshots', async () => {
      for (let i = 0; i < 10; i++) {
        await store.save({
          id: `snap-${i}`,
          aggregateType: 'Wallet' as AggregateType,
          aggregateId: 'wallet-1' as EntityId,
          version: i * 10,
          sequenceNumber: BigInt(i * 100) as SequenceNumber,
          state: { balance: i * 1000 },
          createdAt: Date.now() + i,
          hash: `hash${i}`,
        });
      }
      
      const removed = await store.cleanup(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId,
        3 // Keep only 3
      );
      
      assert.strictEqual(removed, 7);
      
      const stats = await store.getStats();
      assert.strictEqual(stats.totalSnapshots, 3);
    });
    
    it('returns null for non-existent aggregate', async () => {
      const result = await store.getLatest(
        'Wallet' as AggregateType,
        'non-existent' as EntityId
      );
      
      assert.strictEqual(result, null);
    });
    
    it('provides stats', async () => {
      await store.save({
        id: 'snap-1',
        aggregateType: 'Wallet' as AggregateType,
        aggregateId: 'wallet-1' as EntityId,
        version: 1,
        sequenceNumber: 100n as SequenceNumber,
        state: { balance: 1000 },
        createdAt: Date.now(),
        hash: 'hash1',
      });
      
      const stats = await store.getStats();
      
      assert.strictEqual(stats.totalSnapshots, 1);
      assert.ok(stats.totalSize > 0);
      assert.ok(stats.oldestSnapshot);
      assert.ok(stats.newestSnapshot);
    });
  });
  
  describe('SnapshotManager', () => {
    let manager: SnapshotManager;
    
    beforeEach(() => {
      manager = createSnapshotManager(undefined, {
        eventsThreshold: 100,
        timeThresholdMs: 60000,
        maxSnapshotsPerAggregate: 3,
        aggregateTypes: ['Wallet', 'Entity'] as AggregateType[],
      });
    });
    
    it('determines when to snapshot based on event count', () => {
      // Record 99 events - should not trigger (threshold is 100)
      for (let i = 0; i < 99; i++) {
        manager.recordEvent('Wallet' as AggregateType, 'wallet-1' as EntityId);
      }
      
      // 99 events recorded, threshold is 100, should NOT trigger
      assert.strictEqual(
        manager.shouldSnapshot('Wallet' as AggregateType, 'wallet-1' as EntityId, 99),
        false
      );
      
      // Record 100th event - should trigger
      manager.recordEvent('Wallet' as AggregateType, 'wallet-1' as EntityId);
      
      // 100 events recorded, threshold is 100, should trigger
      assert.strictEqual(
        manager.shouldSnapshot('Wallet' as AggregateType, 'wallet-1' as EntityId, 100),
        true
      );
    });
    
    it('ignores non-configured aggregate types', () => {
      for (let i = 0; i < 200; i++) {
        manager.recordEvent('Unknown' as AggregateType, 'unknown-1' as EntityId);
      }
      
      assert.strictEqual(
        manager.shouldSnapshot('Unknown' as AggregateType, 'unknown-1' as EntityId, 200),
        false
      );
    });
    
    it('creates and retrieves snapshots', async () => {
      const snapshot = await manager.createSnapshot(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId,
        50,
        500n as SequenceNumber,
        { balance: 10000n, name: 'Test Wallet' }
      );
      
      assert.ok(snapshot.id.startsWith('snap-'));
      assert.strictEqual(snapshot.version, 50);
      assert.ok(snapshot.hash);
      
      const retrieved = await manager.getLatestSnapshot<{ balance: bigint; name: string }>(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId
      );
      
      assert.ok(retrieved);
      assert.strictEqual(retrieved.state.balance, 10000n);
    });
    
    it('resets event counter after snapshot', async () => {
      // Record events
      for (let i = 0; i < 100; i++) {
        manager.recordEvent('Wallet' as AggregateType, 'wallet-1' as EntityId);
      }
      
      assert.strictEqual(
        manager.shouldSnapshot('Wallet' as AggregateType, 'wallet-1' as EntityId, 100),
        true
      );
      
      // Create snapshot
      await manager.createSnapshot(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId,
        100,
        1000n as SequenceNumber,
        { balance: 5000n }
      );
      
      // Counter should be reset
      assert.strictEqual(
        manager.shouldSnapshot('Wallet' as AggregateType, 'wallet-1' as EntityId, 100),
        false
      );
    });
    
    it('supports point-in-time queries', async () => {
      const time1 = Date.now();
      
      await manager.createSnapshot(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId,
        50,
        500n as SequenceNumber,
        { balance: 1000n }
      );
      
      await new Promise(r => setTimeout(r, 10));
      
      await manager.createSnapshot(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId,
        100,
        1000n as SequenceNumber,
        { balance: 2000n }
      );
      
      // Query at time1 should return first snapshot
      const result = await manager.getSnapshotAtTime<{ balance: bigint }>(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId,
        time1 + 5
      );
      
      assert.ok(result);
      assert.strictEqual(result.state.balance, 1000n);
    });
  });
  
  describe('Factory Functions', () => {
    it('createSnapshotStore returns InMemorySnapshotStore', () => {
      const store = createSnapshotStore();
      assert.ok(store);
    });
    
    it('createSnapshotManager uses defaults', () => {
      const manager = createSnapshotManager();
      assert.ok(manager);
    });
  });
});
