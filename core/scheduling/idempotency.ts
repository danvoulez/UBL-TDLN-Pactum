/**
 * FASE 7 - IDEMPOTENCY FOR DEADLINES
 * 
 * Ensures each deadline/temporal trigger generates business events at most once.
 * Uses a deduplication store (PostgreSQL table) to track processed deadlines.
 */

import type { Pool } from 'pg';
import type { EntityId, Timestamp } from '../shared/types';
import { logger } from '../observability/logger';

export interface DeadlineIdempotencyStore {
  /**
   * Check if a deadline has already been processed.
   */
  isProcessed(dedupeKey: string): Promise<boolean>;
  
  /**
   * Mark a deadline as processed (atomic).
   * Returns true if marked (first time), false if already processed.
   */
  markAsProcessed(dedupeKey: string, metadata?: Record<string, unknown>): Promise<boolean>;
  
  /**
   * Get processing info for a deadline.
   */
  getProcessingInfo(dedupeKey: string): Promise<DeadlineProcessingInfo | null>;
}

export interface DeadlineProcessingInfo {
  readonly dedupeKey: string;
  readonly processedAt: Timestamp;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Create a deadline idempotency store using PostgreSQL.
 * 
 * Uses a table to track processed deadlines with atomic operations.
 */
export function createPostgresDeadlineIdempotencyStore(pool: Pool): DeadlineIdempotencyStore {
  /**
   * Ensure the idempotency table exists.
   */
  async function ensureTable(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deadline_idempotency (
        dedupe_key TEXT PRIMARY KEY,
        processed_at BIGINT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_deadline_idempotency_processed_at 
        ON deadline_idempotency(processed_at);
    `);
  }

  // Initialize table on creation
  ensureTable().catch(err => {
    logger.error('scheduler.idempotency.init_error', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  /**
   * Check if a deadline has already been processed.
   */
  async function isProcessed(dedupeKey: string): Promise<boolean> {
    try {
      const result = await pool.query(
        'SELECT 1 FROM deadline_idempotency WHERE dedupe_key = $1',
        [dedupeKey]
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error('scheduler.idempotency.check_error', {
        dedupeKey,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Mark a deadline as processed (atomic).
   * Uses INSERT ... ON CONFLICT DO NOTHING to ensure atomicity.
   */
  async function markAsProcessed(
    dedupeKey: string,
    metadata?: Record<string, unknown>
  ): Promise<boolean> {
    try {
      const now = Date.now();
      
      const result = await pool.query(
        `INSERT INTO deadline_idempotency (dedupe_key, processed_at, metadata)
         VALUES ($1, $2, $3)
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING dedupe_key`,
        [dedupeKey, now, metadata ? JSON.stringify(metadata) : null]
      );
      
      const isFirstTime = result.rows.length > 0;
      
      if (isFirstTime) {
        logger.info('scheduler.deadline.processed', {
          dedupeKey,
          processedAt: now,
        });
      } else {
        logger.info('scheduler.deadline.already_processed', {
          dedupeKey,
        });
      }
      
      return isFirstTime;
    } catch (error) {
      logger.error('scheduler.idempotency.mark_error', {
        dedupeKey,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get processing info for a deadline.
   */
  async function getProcessingInfo(
    dedupeKey: string
  ): Promise<DeadlineProcessingInfo | null> {
    try {
      const result = await pool.query(
        'SELECT dedupe_key, processed_at, metadata FROM deadline_idempotency WHERE dedupe_key = $1',
        [dedupeKey]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      return {
        dedupeKey: row.dedupe_key,
        processedAt: Number(row.processed_at),
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      };
    } catch (error) {
      logger.error('scheduler.idempotency.get_info_error', {
        dedupeKey,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  return {
    isProcessed,
    markAsProcessed,
    getProcessingInfo,
  };
}

/**
 * Generate a deduplication key for a deadline.
 * Format: {realmId}:{subjectType}:{subjectId}:{dueAt}:{stageIndex}
 */
export function buildDedupeKey(
  realmId: EntityId,
  subjectType: string,
  subjectId: EntityId,
  dueAt: Timestamp,
  stageIndex?: number
): string {
  const parts = [realmId, subjectType, subjectId, String(dueAt)];
  if (stageIndex !== undefined) {
    parts.push(String(stageIndex));
  }
  return parts.join(':');
}

