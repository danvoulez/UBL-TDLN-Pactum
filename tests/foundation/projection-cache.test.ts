/**
 * PROJECTION CACHE TESTS
 * 
 * FASE 3.1/3.2: Tests for LRU cache and projection caching
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  LRUCache,
  ProjectionCache,
  createLRUCache,
  createProjectionCache,
} from '../../core/store/projection-cache';
import type { EntityId, AggregateType } from '../../core/schema/ledger';

describe('Projection Cache (FASE 3.1/3.2)', () => {
  
  describe('LRUCache', () => {
    let cache: LRUCache<string>;
    
    beforeEach(() => {
      cache = createLRUCache<string>({
        maxSize: 3,
        ttlMs: 1000,
        trackStats: true,
      });
    });
    
    it('stores and retrieves values', () => {
      cache.set('key1', 'value1');
      
      assert.strictEqual(cache.get('key1'), 'value1');
    });
    
    it('returns undefined for missing keys', () => {
      assert.strictEqual(cache.get('missing'), undefined);
    });
    
    it('evicts LRU entry when at capacity', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      // Access key1 to make it recently used
      cache.get('key1');
      
      // Add key4 - should evict key2 (least recently used)
      cache.set('key4', 'value4');
      
      assert.strictEqual(cache.get('key1'), 'value1');
      assert.strictEqual(cache.get('key2'), undefined); // Evicted
      assert.strictEqual(cache.get('key3'), 'value3');
      assert.strictEqual(cache.get('key4'), 'value4');
    });
    
    it('expires entries after TTL', async () => {
      const shortCache = createLRUCache<string>({
        maxSize: 10,
        ttlMs: 50, // 50ms TTL
        trackStats: true,
      });
      
      shortCache.set('key1', 'value1');
      assert.strictEqual(shortCache.get('key1'), 'value1');
      
      // Wait for expiration
      await new Promise(r => setTimeout(r, 60));
      
      assert.strictEqual(shortCache.get('key1'), undefined);
    });
    
    it('tracks hit/miss statistics', () => {
      cache.set('key1', 'value1');
      
      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('missing'); // Miss
      
      const stats = cache.getStats();
      
      assert.strictEqual(stats.hits, 2);
      assert.strictEqual(stats.misses, 1);
      assert.strictEqual(stats.hitRate, 2/3);
    });
    
    it('tracks eviction count', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Evicts key1
      cache.set('key5', 'value5'); // Evicts key2
      
      const stats = cache.getStats();
      
      assert.strictEqual(stats.evictions, 2);
    });
    
    it('deletes entries', () => {
      cache.set('key1', 'value1');
      
      assert.strictEqual(cache.has('key1'), true);
      
      cache.delete('key1');
      
      assert.strictEqual(cache.has('key1'), false);
      assert.strictEqual(cache.get('key1'), undefined);
    });
    
    it('clears all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      cache.clear();
      
      assert.strictEqual(cache.size, 0);
      assert.strictEqual(cache.get('key1'), undefined);
    });
    
    it('invalidates by pattern', () => {
      cache.set('user:1', 'user1');
      cache.set('user:2', 'user2');
      cache.set('order:1', 'order1');
      
      const invalidated = cache.invalidate(key => key.startsWith('user:'));
      
      assert.strictEqual(invalidated, 2);
      assert.strictEqual(cache.get('user:1'), undefined);
      assert.strictEqual(cache.get('order:1'), 'order1');
    });
    
    it('returns all keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      const keys = cache.keys();
      
      assert.deepStrictEqual(keys.sort(), ['key1', 'key2']);
    });
  });
  
  describe('ProjectionCache', () => {
    let projectionCache: ProjectionCache;
    
    beforeEach(() => {
      projectionCache = createProjectionCache({
        maxSize: 100,
        ttlMs: 5000,
      });
    });
    
    it('caches aggregate state', () => {
      const state = { balance: 1000n, name: 'Test Wallet' };
      
      projectionCache.setAggregate(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId,
        state,
        1
      );
      
      const cached = projectionCache.getAggregate<typeof state>(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId
      );
      
      assert.deepStrictEqual(cached, state);
    });
    
    it('returns undefined for uncached aggregates', () => {
      const result = projectionCache.getAggregate(
        'Wallet' as AggregateType,
        'missing' as EntityId
      );
      
      assert.strictEqual(result, undefined);
    });
    
    it('invalidates aggregate on write', () => {
      projectionCache.setAggregate(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId,
        { balance: 1000n },
        1
      );
      
      projectionCache.invalidateAggregate(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId
      );
      
      const result = projectionCache.getAggregate(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId
      );
      
      assert.strictEqual(result, undefined);
    });
    
    it('provides cache statistics', () => {
      projectionCache.setAggregate(
        'Wallet' as AggregateType,
        'wallet-1' as EntityId,
        { balance: 1000n },
        1
      );
      
      projectionCache.getAggregate('Wallet' as AggregateType, 'wallet-1' as EntityId);
      projectionCache.getAggregate('Wallet' as AggregateType, 'missing' as EntityId);
      
      const stats = projectionCache.getStats();
      
      assert.strictEqual(stats.hits, 1);
      assert.strictEqual(stats.misses, 1);
      assert.strictEqual(stats.size, 1);
    });
    
    it('clears all cached projections', () => {
      projectionCache.setAggregate('Wallet' as AggregateType, 'w1' as EntityId, {}, 1);
      projectionCache.setAggregate('Wallet' as AggregateType, 'w2' as EntityId, {}, 1);
      
      projectionCache.clear();
      
      const stats = projectionCache.getStats();
      assert.strictEqual(stats.size, 0);
    });
  });
  
  describe('Factory Functions', () => {
    it('createLRUCache uses defaults', () => {
      const cache = createLRUCache();
      assert.ok(cache);
      assert.strictEqual(cache.size, 0);
    });
    
    it('createProjectionCache uses defaults', () => {
      const cache = createProjectionCache();
      assert.ok(cache);
    });
  });
});
