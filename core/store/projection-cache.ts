/**
 * PROJECTION CACHE
 * 
 * FASE 3.1/3.2: LRU cache for read-model projections
 * 
 * Purpose:
 * - Cache frequently accessed aggregate states
 * - Reduce event replay overhead
 * - Support high-read scenarios
 * 
 * Strategy:
 * - LRU eviction policy
 * - TTL-based expiration
 * - Invalidation on write events
 */

import type { EntityId, Timestamp } from '../shared/types';
import type { AggregateType } from '../schema/ledger';

// =============================================================================
// TYPES
// =============================================================================

export interface CacheConfig {
  /** Maximum number of entries */
  readonly maxSize: number;
  
  /** Time-to-live in milliseconds */
  readonly ttlMs: number;
  
  /** Enable statistics tracking */
  readonly trackStats?: boolean;
}

export interface CacheEntry<T = unknown> {
  readonly key: string;
  readonly value: T;
  readonly version: number;
  readonly createdAt: Timestamp;
  readonly expiresAt: Timestamp;
  readonly accessCount: number;
  readonly lastAccessedAt: Timestamp;
}

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
  readonly size: number;
  readonly evictions: number;
  readonly expirations: number;
}

// =============================================================================
// LRU CACHE
// =============================================================================

export class LRUCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = [];
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0,
  };
  
  constructor(private readonly config: CacheConfig) {}
  
  /**
   * Get a value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      if (this.config.trackStats) this.stats.misses++;
      return undefined;
    }
    
    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      if (this.config.trackStats) {
        this.stats.misses++;
        this.stats.expirations++;
      }
      return undefined;
    }
    
    // Update access order (move to end)
    this.touchAccess(key);
    
    // Update entry stats
    const updated: CacheEntry<T> = {
      ...entry,
      accessCount: entry.accessCount + 1,
      lastAccessedAt: Date.now(),
    };
    this.cache.set(key, updated);
    
    if (this.config.trackStats) this.stats.hits++;
    return entry.value;
  }
  
  /**
   * Set a value in cache
   */
  set(key: string, value: T, version: number = 1): void {
    // Evict if at capacity
    while (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }
    
    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      value,
      version,
      createdAt: now,
      expiresAt: now + this.config.ttlMs,
      accessCount: 1,
      lastAccessedAt: now,
    };
    
    this.cache.set(key, entry);
    this.touchAccess(key);
  }
  
  /**
   * Delete a value from cache
   */
  delete(key: string): boolean {
    const existed = this.cache.delete(key);
    if (existed) {
      this.accessOrder = this.accessOrder.filter(k => k !== key);
    }
    return existed;
  }
  
  /**
   * Check if key exists (without updating access)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }
    
    return true;
  }
  
  /**
   * Invalidate entries matching a pattern
   */
  invalidate(pattern: (key: string) => boolean): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern(key)) {
        this.delete(key);
        count++;
      }
    }
    return count;
  }
  
  /**
   * Invalidate by aggregate
   */
  invalidateAggregate(aggregateType: AggregateType, aggregateId: EntityId): number {
    const prefix = `${aggregateType}:${aggregateId}`;
    return this.invalidate(key => key.startsWith(prefix));
  }
  
  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      size: this.cache.size,
    };
  }
  
  /**
   * Get current size
   */
  get size(): number {
    return this.cache.size;
  }
  
  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }
  
  private touchAccess(key: string): void {
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
  }
  
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;
    
    const lruKey = this.accessOrder.shift()!;
    this.cache.delete(lruKey);
    
    if (this.config.trackStats) this.stats.evictions++;
  }
}

// =============================================================================
// PROJECTION CACHE
// =============================================================================

export class ProjectionCache {
  private cache: LRUCache<unknown>;
  
  constructor(config?: Partial<CacheConfig>) {
    const defaultConfig: CacheConfig = {
      maxSize: 1000,
      ttlMs: 5 * 60 * 1000, // 5 minutes
      trackStats: true,
    };
    
    this.cache = new LRUCache({ ...defaultConfig, ...config });
  }
  
  /**
   * Get aggregate state from cache
   */
  getAggregate<TState>(
    aggregateType: AggregateType,
    aggregateId: EntityId
  ): TState | undefined {
    const key = this.makeKey(aggregateType, aggregateId);
    return this.cache.get(key) as TState | undefined;
  }
  
  /**
   * Set aggregate state in cache
   */
  setAggregate<TState>(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    state: TState,
    version: number
  ): void {
    const key = this.makeKey(aggregateType, aggregateId);
    this.cache.set(key, state, version);
  }
  
  /**
   * Invalidate aggregate on write
   */
  invalidateAggregate(
    aggregateType: AggregateType,
    aggregateId: EntityId
  ): void {
    this.cache.invalidateAggregate(aggregateType, aggregateId);
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return this.cache.getStats();
  }
  
  /**
   * Clear all cached projections
   */
  clear(): void {
    this.cache.clear();
  }
  
  private makeKey(aggregateType: AggregateType, aggregateId: EntityId): string {
    return `${aggregateType}:${aggregateId}`;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createLRUCache<T>(config?: Partial<CacheConfig>): LRUCache<T> {
  const defaultConfig: CacheConfig = {
    maxSize: 100,
    ttlMs: 60000, // 1 minute
    trackStats: true,
  };
  
  return new LRUCache({ ...defaultConfig, ...config });
}

export function createProjectionCache(config?: Partial<CacheConfig>): ProjectionCache {
  return new ProjectionCache(config);
}
