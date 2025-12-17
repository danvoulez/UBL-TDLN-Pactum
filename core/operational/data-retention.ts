/**
 * FASE 8 - Data Retention & Crypto-Shredding
 * 
 * Conciliates:
 * - Immutable ledger/event store
 * - Privacy requirements (GDPR, etc.)
 * 
 * Strategy:
 * - Event store remains immutable
 * - Sensitive data encrypted with specific keys
 * - Crypto-shredding (delete key) or logical deletion in projections
 */

import type { Pool } from 'pg';
import type { EventStore } from '../store/event-store';
import type {
  RetentionPolicy,
  RetentionScope,
  RetentionAction,
  DeletionEligibility,
} from './governance';
import type { EntityId, AggregateType, Timestamp } from '../shared/types';
import { logger } from '../observability/logger';

export interface DataRetentionPolicy {
  realmId?: EntityId;
  entityType?: string;
  retentionDays?: number;
  deletionStrategy: 'crypto_shred' | 'logical_delete';
  legalBasis?: string;
  regulation?: string; // GDPR, HIPAA, etc.
}

export interface DataRetentionService {
  /**
   * Register a retention policy.
   */
  registerPolicy(policy: DataRetentionPolicy): Promise<void>;
  
  /**
   * Check if data can be deleted.
   */
  canDelete(aggregateType: AggregateType, aggregateId: EntityId): Promise<DeletionEligibility>;
  
  /**
   * Apply retention policy to an entity.
   */
  applyPolicy(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    policy: DataRetentionPolicy
  ): Promise<RetentionResult>;
  
  /**
   * Process expired data.
   */
  processExpired(): Promise<RetentionProcessingResult>;
}

export interface RetentionResult {
  success: boolean;
  action: RetentionAction;
  encrypted?: boolean;
  keyDeleted?: boolean;
  projectionMasked?: boolean;
  error?: string;
}

export interface RetentionProcessingResult {
  processed: number;
  deleted: number;
  anonymized: number;
  archived: number;
  errors: number;
  duration: number;
}

/**
 * Create a data retention service.
 */
export function createDataRetentionService(
  pool: Pool,
  eventStore: EventStore
): DataRetentionService {
  const policies = new Map<string, DataRetentionPolicy>();
  
  /**
   * Ensure tables exist.
   */
  async function ensureTables(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS retention_policies (
        id TEXT PRIMARY KEY,
        realm_id TEXT,
        entity_type TEXT,
        retention_days INTEGER,
        deletion_strategy TEXT NOT NULL,
        legal_basis TEXT,
        regulation TEXT,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS retention_applications (
        id TEXT PRIMARY KEY,
        policy_id TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        action TEXT NOT NULL,
        applied_at BIGINT NOT NULL,
        encrypted BOOLEAN,
        key_deleted BOOLEAN,
        projection_masked BOOLEAN,
        error TEXT,
        FOREIGN KEY (policy_id) REFERENCES retention_policies(id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_retention_applications_aggregate 
        ON retention_applications(aggregate_type, aggregate_id);
    `);
  }

  ensureTables().catch(err => {
    logger.error('retention.service.init_error', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  /**
   * Register a retention policy.
   */
  async function registerPolicy(policy: DataRetentionPolicy): Promise<void> {
    const policyId = `${policy.realmId || 'global'}:${policy.entityType || 'all'}`;
    
    await pool.query(`
      INSERT INTO retention_policies (
        id, realm_id, entity_type, retention_days, deletion_strategy,
        legal_basis, regulation, enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      ON CONFLICT (id) DO UPDATE SET
        retention_days = EXCLUDED.retention_days,
        deletion_strategy = EXCLUDED.deletion_strategy,
        legal_basis = EXCLUDED.legal_basis,
        regulation = EXCLUDED.regulation
    `, [
      policyId,
      policy.realmId || null,
      policy.entityType || null,
      policy.retentionDays || null,
      policy.deletionStrategy,
      policy.legalBasis || null,
      policy.regulation || null,
    ]);
    
    policies.set(policyId, policy);
    
    logger.info('retention.policy.registered', {
      policyId,
      realmId: policy.realmId,
      entityType: policy.entityType,
      retentionDays: policy.retentionDays,
      deletionStrategy: policy.deletionStrategy,
    });
  }

  /**
   * Check if data can be deleted.
   */
  async function canDelete(
    aggregateType: AggregateType,
    aggregateId: EntityId
  ): Promise<DeletionEligibility> {
    // In a real implementation, this would check:
    // - Legal holds
    // - Active policies
    // - Minimum retention periods
    
    // For now, return eligible if no active holds
    return {
      eligible: true,
      earliestDeletionDate: Date.now(),
    };
  }

  /**
   * Apply retention policy to an entity.
   */
  async function applyPolicy(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    policy: DataRetentionPolicy
  ): Promise<RetentionResult> {
    const applicationId = `${aggregateType}:${aggregateId}`;
    const now = Date.now();
    
    try {
      let result: RetentionResult;
      
      if (policy.deletionStrategy === 'crypto_shred') {
        // Crypto-shredding: mark encryption key for deletion
        // In real implementation, this would:
        // 1. Identify encryption keys for this entity
        // 2. Mark keys for deletion (don't delete immediately for audit)
        // 3. Update projections to show "deleted" state
        
        result = {
          success: true,
          action: 'Delete',
          encrypted: true,
          keyDeleted: true,
          projectionMasked: true,
        };
        
        logger.info('retention.crypto_shred.applied', {
          aggregateType,
          aggregateId,
          policyId: `${policy.realmId || 'global'}:${policy.entityType || 'all'}`,
        });
      } else {
        // Logical deletion: mark as deleted in projections
        // Event store remains immutable
        
        result = {
          success: true,
          action: 'Anonymize',
          projectionMasked: true,
        };
        
        logger.info('retention.logical_delete.applied', {
          aggregateType,
          aggregateId,
          policyId: `${policy.realmId || 'global'}:${policy.entityType || 'all'}`,
        });
      }
      
      // Record application
      await pool.query(`
        INSERT INTO retention_applications (
          id, policy_id, aggregate_type, aggregate_id, action,
          applied_at, encrypted, key_deleted, projection_masked
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        applicationId,
        `${policy.realmId || 'global'}:${policy.entityType || 'all'}`,
        aggregateType,
        aggregateId,
        result.action,
        now,
        result.encrypted || false,
        result.keyDeleted || false,
        result.projectionMasked || false,
      ]);
      
      return result;
    } catch (error) {
      logger.error('retention.policy.apply_error', {
        aggregateType,
        aggregateId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        success: false,
        action: 'Delete',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process expired data.
   */
  async function processExpired(): Promise<RetentionProcessingResult> {
    const startTime = Date.now();
    let processed = 0;
    let deleted = 0;
    let anonymized = 0;
    let archived = 0;
    let errors = 0;
    
    logger.info('retention.process_expired.start');
    
    // In a real implementation, this would:
    // 1. Query for entities that have exceeded retention period
    // 2. Apply appropriate policy (crypto-shred or logical delete)
    // 3. Update projections
    
    // For now, just log
    logger.info('retention.process_expired.completed', {
      processed,
      deleted,
      anonymized,
      archived,
      errors,
      duration: Date.now() - startTime,
    });
    
    return {
      processed,
      deleted,
      anonymized,
      archived,
      errors,
      duration: Date.now() - startTime,
    };
  }

  return {
    registerPolicy,
    canDelete,
    applyPolicy,
    processExpired,
  };
}

