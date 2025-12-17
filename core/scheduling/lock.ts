/**
 * FASE 7 - DISTRIBUTED LOCK FOR SCHEDULER
 * 
 * This module provides distributed locking using PostgreSQL advisory locks.
 * Ensures only one instance of the scheduler runs at a time in a cluster.
 */

import type { Pool, Client } from 'pg';
import { logger } from '../observability/logger';

export interface DistributedLock {
  /**
   * Try to acquire a lock with the given key.
   * Returns true if acquired, false if another instance holds it.
   */
  tryAcquire(lockKey: string, timeoutMs?: number): Promise<boolean>;
  
  /**
   * Release a lock.
   */
  release(lockKey: string): Promise<void>;
  
  /**
   * Execute a function with a lock, automatically releasing it.
   */
  withLock<T>(lockKey: string, fn: () => Promise<T>, timeoutMs?: number): Promise<T | null>;
}

/**
 * Create a distributed lock using PostgreSQL advisory locks.
 * 
 * Advisory locks are perfect for coordination:
 * - Automatically released on connection close
 * - Survive transaction boundaries
 * - Fast and reliable
 * 
 * @param pool - PostgreSQL connection pool
 */
export function createPostgresDistributedLock(pool: Pool): DistributedLock {
  /**
   * Convert a string key to a numeric advisory lock ID.
   * Uses a simple hash to ensure consistent mapping.
   */
  function keyToLockId(lockKey: string): number {
    // Use a simple hash function to convert string to number
    // PostgreSQL advisory locks use bigint, but we'll use int for simplicity
    let hash = 0;
    for (let i = 0; i < lockKey.length; i++) {
      const char = lockKey.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Use absolute value and ensure it's within PostgreSQL's int range
    return Math.abs(hash) % 2147483647;
  }

  /**
   * Try to acquire an advisory lock.
   * Returns true if acquired, false if another instance holds it.
   */
  async function tryAcquire(lockKey: string, timeoutMs: number = 0): Promise<boolean> {
    const lockId = keyToLockId(lockKey);
    
    try {
      // pg_try_advisory_lock returns true if lock acquired, false if already held
      const result = await pool.query(
        'SELECT pg_try_advisory_lock($1) as acquired',
        [lockId]
      );
      
      const acquired = result.rows[0]?.acquired ?? false;
      
      if (acquired) {
        logger.info('scheduler.lock.acquired', {
          lockKey,
          lockId,
        });
      } else {
        logger.info('scheduler.lock.contended', {
          lockKey,
          lockId,
        });
      }
      
      return acquired;
    } catch (error) {
      logger.error('scheduler.lock.error', {
        lockKey,
        lockId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Release an advisory lock.
   */
  async function release(lockKey: string): Promise<void> {
    const lockId = keyToLockId(lockKey);
    
    try {
      await pool.query(
        'SELECT pg_advisory_unlock($1)',
        [lockId]
      );
      
      logger.info('scheduler.lock.released', {
        lockKey,
        lockId,
      });
    } catch (error) {
      logger.error('scheduler.lock.release_error', {
        lockKey,
        lockId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - lock might already be released
    }
  }

  /**
   * Execute a function with a lock, automatically releasing it.
   * Returns null if lock could not be acquired.
   */
  async function withLock<T>(
    lockKey: string,
    fn: () => Promise<T>,
    timeoutMs: number = 0
  ): Promise<T | null> {
    const acquired = await tryAcquire(lockKey, timeoutMs);
    
    if (!acquired) {
      return null;
    }
    
    try {
      const result = await fn();
      return result;
    } finally {
      await release(lockKey);
    }
  }

  return {
    tryAcquire,
    release,
    withLock,
  };
}

