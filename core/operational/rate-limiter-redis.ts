/**
 * Redis-based Rate Limiter Implementation
 * 
 * Uses Redis for distributed rate limiting across multiple instances.
 */

import type { RateLimiter, RateLimit, RateLimitScope, RateLimitCheckResult, RateLimitState } from './governance';
import type { EntityId, Timestamp } from '../shared/types';
import Redis from 'ioredis';

export interface RedisRateLimiterConfig {
  redis: Redis | string; // Redis instance or connection string
  defaultWindowMs?: number;
  defaultLimit?: number;
}

/**
 * Create a Redis-based rate limiter.
 */
export function createRedisRateLimiter(config: RedisRateLimiterConfig): RateLimiter {
  const redis = typeof config.redis === 'string' ? new Redis(config.redis) : config.redis;
  const limits = new Map<EntityId, RateLimit>();
  
  return {
    register(limit: RateLimit): void {
      limits.set(limit.id, limit);
    },
    
    async check(scope: RateLimitScope): Promise<RateLimitCheckResult> {
      const limit = findApplicableLimit(scope);
      if (!limit) {
        // No limit configured - allow
        return {
          allowed: true,
          limit: Infinity,
          remaining: Infinity,
          resetAt: Date.now() + 3600000,
        };
      }
      
      const actor = getActorId(scope);
      const key = `rate_limit:${limit.id}:${actor}`;
      const windowMs = limit.window;
      
      // Get current count
      const count = await redis.incr(key);
      
      // Set expiration if this is the first request in the window
      if (count === 1) {
        await redis.pexpire(key, windowMs);
      }
      
      // Get TTL to calculate reset time
      const ttl = await redis.pttl(key);
      const resetAt = Date.now() + (ttl > 0 ? ttl : windowMs);
      
      const remaining = Math.max(0, limit.limit - count);
      const allowed = count <= limit.limit;
      
      if (!allowed) {
        // Decrement since we're rejecting
        await redis.decr(key);
      }
      
      return {
        allowed,
        limit: limit.limit,
        remaining,
        resetAt,
        retryAfter: allowed ? undefined : Math.ceil(ttl / 1000),
      };
    },
    
    async record(scope: RateLimitScope): Promise<RateLimitState> {
      const limit = findApplicableLimit(scope);
      if (!limit) {
        throw new Error('No rate limit configured for scope');
      }
      
      const actor = getActorId(scope);
      const key = `rate_limit:${limit.id}:${actor}`;
      const windowMs = limit.window;
      
      const count = await redis.incr(key);
      
      if (count === 1) {
        await redis.pexpire(key, windowMs);
      }
      
      const ttl = await redis.pttl(key);
      const resetAt = Date.now() + (ttl > 0 ? ttl : windowMs);
      
      return {
        limitId: limit.id,
        actor,
        count,
        windowStart: resetAt - windowMs,
        windowEnd: resetAt,
        remaining: Math.max(0, limit.limit - count),
        resetAt,
      };
    },
    
    async getState(scope: RateLimitScope): Promise<RateLimitState | null> {
      const limit = findApplicableLimit(scope);
      if (!limit) {
        return null;
      }
      
      const actor = getActorId(scope);
      const key = `rate_limit:${limit.id}:${actor}`;
      
      const countStr = await redis.get(key);
      if (!countStr) {
        return null;
      }
      
      const count = parseInt(countStr, 10);
      const ttl = await redis.pttl(key);
      const resetAt = Date.now() + (ttl > 0 ? ttl : limit.window);
      
      return {
        limitId: limit.id,
        actor,
        count,
        windowStart: resetAt - limit.window,
        windowEnd: resetAt,
        remaining: Math.max(0, limit.limit - count),
        resetAt,
      };
    },
    
    async reset(limitId: EntityId, actor?: string): Promise<void> {
      if (actor) {
        const key = `rate_limit:${limitId}:${actor}`;
        await redis.del(key);
      } else {
        // Reset all actors for this limit
        const pattern = `rate_limit:${limitId}:*`;
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
    },
  };
  
  function findApplicableLimit(scope: RateLimitScope): RateLimit | null {
    // Find the most specific limit for this scope
    for (const limit of limits.values()) {
      if (!limit.enabled) continue;
      
      if (matchesScope(limit.scope, scope)) {
        return limit;
      }
    }
    
    return null;
  }
  
  function matchesScope(limitScope: RateLimitScope, requestScope: RateLimitScope): boolean {
    if (limitScope.type === 'Global') {
      return true;
    }
    
    if (limitScope.type === 'Realm' && requestScope.type === 'Realm') {
      return !limitScope.realmId || limitScope.realmId === requestScope.realmId;
    }
    
    if (limitScope.type === 'Entity' && requestScope.type === 'Entity') {
      return !limitScope.entityId || limitScope.entityId === requestScope.entityId;
    }
    
    if (limitScope.type === 'Intent' && requestScope.type === 'Intent') {
      return !limitScope.intentType || limitScope.intentType === requestScope.intentType;
    }
    
    return false;
  }
  
  function getActorId(scope: RateLimitScope): string {
    switch (scope.type) {
      case 'Realm':
        return scope.realmId || 'global';
      case 'Entity':
        return scope.entityId || 'global';
      case 'Intent':
        return scope.intentType || 'global';
      case 'IP':
        return scope.ipAddress || 'unknown';
      case 'Composite':
        return scope.scopes.map(s => getActorId(s)).join(':');
      default:
        return 'global';
    }
  }
}

