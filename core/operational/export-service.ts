/**
 * FASE 8 - Export Service for GDPR & Compliance
 * 
 * Handles data export requests asynchronously:
 * - Create export request
 * - Process in worker/projection
 * - Save result (NDJSON, zip, etc.)
 * - Update status
 */

import type { Pool } from 'pg';
import type { EventStore } from '../store/event-store';
import type {
  ExportRequest,
  ExportService,
  ExportType,
  ExportScope,
  ExportFormat,
  ExportState,
  ExportResult,
} from './governance';
import type { EntityId, Timestamp } from '../shared/types';
import { generateId } from '../shared/types';
import { logger } from '../observability/logger';

export interface ExportServiceConfig {
  pool: Pool;
  eventStore: EventStore;
  storagePath?: string; // Where to store export files
}

/**
 * Create an export service with persistence and async processing.
 */
export function createExportService(config: ExportServiceConfig): ExportService {
  const { pool, eventStore, storagePath = '/tmp/ubl-exports' } = config;
  
  /**
   * Ensure the export_requests table exists.
   */
  async function ensureTable(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS export_requests (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        scope_realm_id TEXT,
        scope_entity_id TEXT,
        scope_aggregate_type TEXT,
        scope_aggregate_id TEXT,
        scope_time_from BIGINT,
        scope_time_to BIGINT,
        scope_include_related BOOLEAN,
        format TEXT NOT NULL,
        state TEXT NOT NULL,
        requested_at BIGINT NOT NULL,
        requested_by TEXT NOT NULL,
        completed_at BIGINT,
        result_download_url TEXT,
        result_size_bytes BIGINT,
        result_record_count INTEGER,
        result_generated_at BIGINT,
        error TEXT,
        expires_at BIGINT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_export_requests_state 
        ON export_requests(state);
      CREATE INDEX IF NOT EXISTS idx_export_requests_requested_by 
        ON export_requests(requested_by);
      CREATE INDEX IF NOT EXISTS idx_export_requests_scope_entity 
        ON export_requests(scope_entity_id);
    `);
  }

  // Initialize table
  ensureTable().catch(err => {
    logger.error('export.service.init_error', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  /**
   * Request an export.
   */
  async function request(
    requestData: Omit<ExportRequest, 'id' | 'state' | 'requestedAt'>
  ): Promise<ExportRequest> {
    const exportId = generateId();
    const now = Date.now();
    
    const exportRequest: ExportRequest = {
      id: exportId,
      type: requestData.type,
      scope: requestData.scope,
      format: requestData.format,
      state: 'Pending',
      requestedAt: now,
      requestedBy: requestData.requestedBy,
      expiresAt: requestData.expiresAt,
    };
    
    // Persist to database
    await pool.query(`
      INSERT INTO export_requests (
        id, type, scope_realm_id, scope_entity_id, scope_aggregate_type,
        scope_aggregate_id, scope_time_from, scope_time_to, scope_include_related,
        format, state, requested_at, requested_by, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      exportId,
      requestData.type,
      requestData.scope.realmId || null,
      requestData.scope.entityId || null,
      requestData.scope.aggregateType || null,
      requestData.scope.aggregateId || null,
      requestData.scope.timeRange?.from || null,
      requestData.scope.timeRange?.to || null,
      requestData.scope.includeRelated || false,
      requestData.format,
      'Pending',
      now,
      requestData.requestedBy,
      requestData.expiresAt || null,
    ]);
    
    logger.info('export.request.created', {
      exportId,
      type: requestData.type,
      realmId: requestData.scope.realmId,
      entityId: requestData.scope.entityId,
      format: requestData.format,
      requestedBy: requestData.requestedBy,
    });
    
    // In a real implementation, this would trigger async processing
    // For now, we'll simulate immediate processing
    processExport(exportRequest).catch(err => {
      logger.error('export.request.processing_error', {
        exportId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    
    return exportRequest;
  }

  /**
   * Process an export request (async).
   */
  async function processExport(request: ExportRequest): Promise<void> {
    // Update state to Processing
    await updateState(request.id, 'Processing');
    
    logger.info('export.request.processing', {
      exportId: request.id,
      type: request.type,
    });
    
    try {
      // In a real implementation, this would:
      // 1. Query event store for relevant events
      // 2. Format data according to format (JSON, CSV, etc.)
      // 3. Save to file/storage
      // 4. Generate download URL
      
      // Simulate processing
      const events = await collectExportData(request.scope);
      const filePath = await saveExportFile(request.id, request.format, events);
      const downloadUrl = `/exports/${request.id}/download`;
      
      const result: ExportResult = {
        downloadUrl,
        sizeBytes: 1024 * events.length, // Simulated
        recordCount: events.length,
        generatedAt: Date.now(),
      };
      
      await completeExport(request.id, result);
      
      logger.info('export.request.ready', {
        exportId: request.id,
        recordCount: result.recordCount,
        sizeBytes: result.sizeBytes,
        downloadUrl: result.downloadUrl,
      });
    } catch (error) {
      await failExport(request.id, error instanceof Error ? error.message : String(error));
      
      logger.error('export.request.failed', {
        exportId: request.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Collect data for export from event store.
   */
  async function collectExportData(scope: ExportScope): Promise<any[]> {
    const events: any[] = [];
    
    if (scope.aggregateId && scope.aggregateType) {
      const eventStream = eventStore.getByAggregate(scope.aggregateType, scope.aggregateId);
      for await (const event of eventStream) {
        if (scope.timeRange) {
          if (scope.timeRange.from && event.timestamp < scope.timeRange.from) continue;
          if (scope.timeRange.to && event.timestamp > scope.timeRange.to) continue;
        }
        events.push(event);
      }
    }
    
    return events;
  }

  /**
   * Save export to file.
   */
  async function saveExportFile(
    exportId: EntityId,
    format: ExportFormat,
    data: any[]
  ): Promise<string> {
    // In a real implementation, this would write to actual file system
    // For now, we'll just return a path
    const fileName = `${exportId}.${format.toLowerCase()}`;
    return `${storagePath}/${fileName}`;
  }

  /**
   * Update export state.
   */
  async function updateState(exportId: EntityId, state: ExportState): Promise<void> {
    await pool.query(
      'UPDATE export_requests SET state = $1, updated_at = NOW() WHERE id = $2',
      [state, exportId]
    );
  }

  /**
   * Complete export with result.
   */
  async function completeExport(exportId: EntityId, result: ExportResult): Promise<void> {
    await pool.query(`
      UPDATE export_requests 
      SET state = 'Completed',
          completed_at = $1,
          result_download_url = $2,
          result_size_bytes = $3,
          result_record_count = $4,
          result_generated_at = $5,
          updated_at = NOW()
      WHERE id = $6
    `, [
      Date.now(),
      result.downloadUrl,
      result.sizeBytes,
      result.recordCount,
      result.generatedAt,
      exportId,
    ]);
  }

  /**
   * Mark export as failed.
   */
  async function failExport(exportId: EntityId, error: string): Promise<void> {
    await pool.query(`
      UPDATE export_requests 
      SET state = 'Failed',
          error = $1,
          updated_at = NOW()
      WHERE id = $2
    `, [error, exportId]);
  }

  /**
   * Get export status.
   */
  async function getStatus(exportId: EntityId): Promise<ExportRequest | null> {
    const result = await pool.query(
      'SELECT * FROM export_requests WHERE id = $1',
      [exportId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return rowToExportRequest(row);
  }

  /**
   * Get exports for an entity.
   */
  async function getForEntity(entityId: EntityId): Promise<readonly ExportRequest[]> {
    const result = await pool.query(
      'SELECT * FROM export_requests WHERE scope_entity_id = $1 ORDER BY requested_at DESC',
      [entityId]
    );
    
    return result.rows.map(rowToExportRequest);
  }

  /**
   * Cancel a pending export.
   */
  async function cancel(exportId: EntityId): Promise<void> {
    await pool.query(
      'UPDATE export_requests SET state = \'Failed\', error = \'Cancelled by user\', updated_at = NOW() WHERE id = $1 AND state = \'Pending\'',
      [exportId]
    );
    
    logger.info('export.request.cancelled', {
      exportId,
    });
  }

  /**
   * Convert database row to ExportRequest.
   */
  function rowToExportRequest(row: any): ExportRequest {
    return {
      id: row.id,
      type: row.type as ExportType,
      scope: {
        realmId: row.scope_realm_id || undefined,
        entityId: row.scope_entity_id || undefined,
        aggregateType: row.scope_aggregate_type || undefined,
        aggregateId: row.scope_aggregate_id || undefined,
        timeRange: row.scope_time_from || row.scope_time_to
          ? {
              from: row.scope_time_from ? Number(row.scope_time_from) : undefined,
              to: row.scope_time_to ? Number(row.scope_time_to) : undefined,
            }
          : undefined,
        includeRelated: row.scope_include_related || false,
      },
      format: row.format as ExportFormat,
      state: row.state as ExportState,
      requestedAt: Number(row.requested_at),
      requestedBy: row.requested_by,
      completedAt: row.completed_at ? Number(row.completed_at) : undefined,
      result: row.result_download_url
        ? {
            downloadUrl: row.result_download_url,
            sizeBytes: Number(row.result_size_bytes),
            recordCount: row.result_record_count,
            generatedAt: Number(row.result_generated_at),
          }
        : undefined,
      error: row.error || undefined,
      expiresAt: row.expires_at ? Number(row.expires_at) : undefined,
    };
  }

  return {
    request,
    getStatus,
    getForEntity,
    cancel,
  };
}

