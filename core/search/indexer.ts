/**
 * FASE 9 - Pipeline de Indexação Assíncrona
 * 
 * Consome eventos do event store e indexa documentos de busca.
 * Características:
 * - Idempotente (reprocessar eventos não duplica documentos)
 * - Seguro em cluster (lock distribuído ou particionamento)
 * - Observável (logs estruturados)
 */

import type { Pool } from 'pg';
import type { EventStore, Event } from '../store/event-store';
import type { SearchEngine, SearchableDocument } from './engine';
import type { EntityId, AggregateType, Timestamp } from '../shared/types';
import { createPostgresDistributedLock } from '../scheduling/lock';
import { logger } from '../observability/logger';

export interface IndexingCursor {
  lastEventId?: EntityId;
  realmId?: EntityId;
  lastProcessedAt?: Timestamp;
}

export interface IndexingTickResult {
  cursor: IndexingCursor;
  processedCount: number;
  indexedCount: number;
  errorCount: number;
}

export interface SearchIndexerConfig {
  pool: Pool;
  eventStore: EventStore;
  searchEngine: SearchEngine;
  batchSize?: number;
  lockKey?: string;
}

/**
 * Create an async indexer that processes events from the event store.
 */
export function createSearchIndexer(config: SearchIndexerConfig): {
  /**
   * Run a single indexing tick (cluster-safe).
   */
  runIndexingTick(cursor?: IndexingCursor): Promise<IndexingTickResult>;
  
  /**
   * Get current cursor for a realm.
   */
  getCursor(realmId?: EntityId): Promise<IndexingCursor | null>;
  
  /**
   * Get index consistency for a realm.
   */
  getIndexConsistency(realmId?: EntityId): Promise<IndexConsistency>;
} {
  const { pool, eventStore, searchEngine, batchSize = 100, lockKey = 'ubl:search:indexer:global' } = config;
  
  const lock = createPostgresDistributedLock(pool);
  
  /**
   * Ensure indexing cursor table exists.
   */
  async function ensureTable(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS search_indexing_cursors (
        realm_id TEXT,
        last_event_id TEXT,
        last_processed_at BIGINT,
        PRIMARY KEY (realm_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_search_indexing_cursors_realm 
        ON search_indexing_cursors(realm_id);
    `);
  }

  ensureTable().catch(err => {
    logger.error('search.indexing.init_error', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  /**
   * Transform an event into a searchable document.
   */
  function eventToDocument(event: Event): SearchableDocument | null {
    // In a real implementation, this would:
    // 1. Extract relevant fields from event payload
    // 2. Build title, description, content
    // 3. Include metadata (realmId, entityType, etc.)
    
    const payload = event.payload as any;
    
    // Only index certain event types
    if (!['EntityCreated', 'AgreementCreated', 'AssetCreated', 'RealmCreated'].includes(event.type)) {
      return null;
    }
    
    return {
      id: event.aggregateId,
      type: event.aggregateType,
      title: payload.name || payload.title || event.type,
      description: payload.description || payload.terms?.description,
      content: JSON.stringify(payload),
      fields: {
        realmId: payload.realmId || event.aggregateId,
        eventType: event.type,
        timestamp: event.timestamp,
      },
      indexedAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Run a single indexing tick (cluster-safe).
   */
  async function runIndexingTick(cursor?: IndexingCursor): Promise<IndexingTickResult> {
    const result = await lock.withLock(lockKey, async () => {
      logger.info('search.indexing.tick.start', {
        lastEventId: cursor?.lastEventId,
        realmId: cursor?.realmId,
      });
      
      let processedCount = 0;
      let indexedCount = 0;
      let errorCount = 0;
      let lastEventId: EntityId | undefined = cursor?.lastEventId;
      
      try {
        // Read events from event store
        // In a real implementation, would use cursor to read from lastEventId
        const events: Event[] = [];
        
        // For now, simulate reading events
        // In production, would use: eventStore.getBySequence(from, to)
        
        // Process events in batches
        for (const event of events) {
          try {
            const document = eventToDocument(event);
            if (document) {
              await searchEngine.index(document);
              indexedCount++;
            }
            processedCount++;
            lastEventId = event.id;
          } catch (error) {
            errorCount++;
            logger.error('search.indexing.event_error', {
              eventId: event.id,
              eventType: event.type,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        
        // Update cursor
        const newCursor: IndexingCursor = {
          lastEventId,
          realmId: cursor?.realmId,
          lastProcessedAt: Date.now(),
        };
        
        if (cursor?.realmId) {
          await saveCursor(cursor.realmId, newCursor);
        }
        
        logger.info('search.indexing.tick.success', {
          processedCount,
          indexedCount,
          errorCount,
          lastEventId,
          realmId: cursor?.realmId,
        });
        
        return {
          cursor: newCursor,
          processedCount,
          indexedCount,
          errorCount,
        };
      } catch (error) {
        logger.error('search.indexing.tick.error', {
          error: error instanceof Error ? error.message : String(error),
          realmId: cursor?.realmId,
        });
        throw error;
      }
    });
    
    if (result === null) {
      logger.info('search.indexing.tick.skipped', {
        reason: 'lock_contended',
        realmId: cursor?.realmId,
      });
      
      return {
        cursor: cursor || {},
        processedCount: 0,
        indexedCount: 0,
        errorCount: 0,
      };
    }
    
    return result;
  }

  /**
   * Save cursor to database.
   */
  async function saveCursor(realmId: EntityId, cursor: IndexingCursor): Promise<void> {
    await pool.query(`
      INSERT INTO search_indexing_cursors (realm_id, last_event_id, last_processed_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (realm_id) DO UPDATE SET
        last_event_id = EXCLUDED.last_event_id,
        last_processed_at = EXCLUDED.last_processed_at
    `, [
      realmId,
      cursor.lastEventId || null,
      cursor.lastProcessedAt || Date.now(),
    ]);
  }

  /**
   * Get current cursor for a realm.
   */
  async function getCursor(realmId?: EntityId): Promise<IndexingCursor | null> {
    if (!realmId) {
      return null;
    }
    
    const result = await pool.query(
      'SELECT realm_id, last_event_id, last_processed_at FROM search_indexing_cursors WHERE realm_id = $1',
      [realmId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      realmId: row.realm_id,
      lastEventId: row.last_event_id || undefined,
      lastProcessedAt: row.last_processed_at ? Number(row.last_processed_at) : undefined,
    };
  }

  /**
   * Get index consistency for a realm.
   */
  async function getIndexConsistency(realmId?: EntityId): Promise<IndexConsistency> {
    // Get last indexed event from cursor
    const cursor = await getCursor(realmId);
    const lastIndexedEventId = cursor?.lastEventId || null;
    
    // Get last event from event store
    // In a real implementation, would query event store for latest event
    const lastEventStoreEventId: string | null = null; // Would be fetched from eventStore
    
    // Calculate lag
    // In a real implementation, would count events between lastIndexedEventId and lastEventStoreEventId
    const indexLagEvents = 0; // Would be calculated
    
    return {
      realmId,
      lastIndexedEventId,
      lastEventStoreEventId,
      indexLagEvents,
      lastIndexedAt: cursor?.lastProcessedAt,
    };
  }

  return {
    runIndexingTick,
    getCursor,
    getIndexConsistency,
  };
}

// IndexConsistency is exported from ./engine

