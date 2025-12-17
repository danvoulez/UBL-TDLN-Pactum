/**
 * OPERATIONAL - Rate Limits, Export, Archival & Governance
 * 
 * Production systems need operational controls:
 * - RATE LIMITS: Prevent abuse, ensure fairness
 * - QUOTAS: Per-realm resource limits
 * - EXPORT: Data portability (GDPR compliance)
 * - ARCHIVAL: Long-term storage, cost optimization
 * - GOVERNANCE: Data retention, compliance policies
 */

import type { EntityId, Timestamp, Duration, AggregateType } from '../shared/types';
import type { Event } from '../schema/ledger';

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Rate limit configuration.
 */
export interface RateLimit {
  readonly id: EntityId;
  readonly name: string;
  readonly description?: string;
  
  /** What is being limited */
  readonly scope: RateLimitScope;
  
  /** The limit */
  readonly limit: number;
  readonly window: Duration;
  
  /** What to do when exceeded */
  readonly action: RateLimitAction;
  
  /** Is this limit active? */
  readonly enabled: boolean;
}

export type RateLimitScope =
  | { readonly type: 'Global' }
  | { readonly type: 'Realm'; readonly realmId?: EntityId } // undefined = all realms
  | { readonly type: 'Entity'; readonly entityId?: EntityId }
  | { readonly type: 'Intent'; readonly intentType?: string }
  | { readonly type: 'IP'; readonly ipAddress?: string }
  | { readonly type: 'Composite'; readonly scopes: readonly RateLimitScope[] };

export type RateLimitAction =
  | { readonly type: 'Reject'; readonly message: string }
  | { readonly type: 'Throttle'; readonly delayMs: number }
  | { readonly type: 'Queue'; readonly queueName: string }
  | { readonly type: 'Alert'; readonly alertRuleId: string };

/**
 * Rate limit state for an actor.
 */
export interface RateLimitState {
  readonly limitId: EntityId;
  readonly actor: string; // Identifier for the rate-limited actor
  readonly count: number;
  readonly windowStart: Timestamp;
  readonly windowEnd: Timestamp;
  readonly remaining: number;
  readonly resetAt: Timestamp;
}

/**
 * Rate limiter checks and enforces limits.
 */
export interface RateLimiter {
  /** Register a rate limit */
  register(limit: RateLimit): void;
  
  /** Check if an action is allowed */
  check(scope: RateLimitScope): Promise<RateLimitCheckResult>;
  
  /** Record an action (decrement remaining) */
  record(scope: RateLimitScope): Promise<RateLimitState>;
  
  /** Get current state for a scope */
  getState(scope: RateLimitScope): Promise<RateLimitState | null>;
  
  /** Reset a limit */
  reset(limitId: EntityId, actor?: string): Promise<void>;
}

export interface RateLimitCheckResult {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: Timestamp;
  readonly retryAfter?: number; // Seconds until retry
}

// ============================================================================
// QUOTAS
// ============================================================================

/**
 * A Quota limits resource usage per realm.
 */
export interface Quota {
  readonly id: EntityId;
  readonly name: string;
  readonly description?: string;
  
  /** What resource is being limited */
  readonly resource: QuotaResource;
  
  /** The limit */
  readonly limit: number;
  
  /** Per realm or global */
  readonly scope: 'PerRealm' | 'Global';
  
  /** Is this quota enforced? */
  readonly enforced: boolean;
  
  /** What to do when exceeded */
  readonly onExceeded: QuotaAction;
}

export type QuotaResource =
  | 'Events'              // Total events
  | 'EventsPerDay'        // Events per day
  | 'Entities'            // Total entities
  | 'Agreements'          // Total agreements
  | 'Assets'              // Total assets
  | 'StorageBytes'        // Total storage
  | 'DocumentsBytes'      // Document storage
  | 'ApiRequestsPerDay'   // API requests
  | 'WebhooksPerRealm'    // Webhook subscriptions
  | 'IntegrationsPerRealm' // External integrations
  | 'Custom';

export type QuotaAction =
  | { readonly type: 'Block'; readonly message: string }
  | { readonly type: 'Alert'; readonly alertRuleId: string }
  | { readonly type: 'Degrade'; readonly degradation: string }
  | { readonly type: 'Bill'; readonly overage: OveragePricing };

export interface OveragePricing {
  readonly perUnit: number;
  readonly currency: string;
  readonly unit: string;
}

/**
 * Current quota usage.
 */
export interface QuotaUsage {
  readonly quotaId: EntityId;
  readonly realmId?: EntityId;
  readonly resource: QuotaResource;
  readonly current: number;
  readonly limit: number;
  readonly percentage: number;
  readonly remaining: number;
  readonly updatedAt: Timestamp;
}

/**
 * Quota manager tracks and enforces quotas.
 */
export interface QuotaManager {
  /** Register a quota */
  register(quota: Quota): void;
  
  /** Check quota before operation */
  check(resource: QuotaResource, realmId?: EntityId): Promise<QuotaCheckResult>;
  
  /** Record usage */
  record(resource: QuotaResource, amount: number, realmId?: EntityId): Promise<void>;
  
  /** Get current usage */
  getUsage(resource: QuotaResource, realmId?: EntityId): Promise<QuotaUsage>;
  
  /** Get all usage for a realm */
  getAllUsage(realmId: EntityId): Promise<readonly QuotaUsage[]>;
  
  /** Get realms approaching limits */
  getApproachingLimits(threshold: number): Promise<readonly QuotaUsage[]>;
}

export interface QuotaCheckResult {
  readonly allowed: boolean;
  readonly current: number;
  readonly limit: number;
  readonly remaining: number;
  readonly message?: string;
}

// ============================================================================
// DATA EXPORT
// ============================================================================

/**
 * A data export request (for GDPR, data portability).
 */
export interface ExportRequest {
  readonly id: EntityId;
  readonly type: ExportType;
  
  /** What to export */
  readonly scope: ExportScope;
  
  /** Format */
  readonly format: ExportFormat;
  
  /** State */
  readonly state: ExportState;
  readonly requestedAt: Timestamp;
  readonly requestedBy: EntityId;
  readonly completedAt?: Timestamp;
  
  /** Result */
  readonly result?: ExportResult;
  readonly error?: string;
  
  /** Expiry (when download link expires) */
  readonly expiresAt?: Timestamp;
}

export type ExportType =
  | 'EntityData'      // All data for an entity (GDPR)
  | 'RealmData'       // All data for a realm
  | 'AgreementData'   // Agreement with history
  | 'AuditLog'        // Audit trail
  | 'Custom';

export interface ExportScope {
  readonly entityId?: EntityId;
  readonly realmId?: EntityId;
  readonly aggregateType?: AggregateType;
  readonly aggregateId?: EntityId;
  readonly timeRange?: { from?: Timestamp; to?: Timestamp };
  readonly includeRelated?: boolean;
}

export type ExportFormat =
  | 'JSON'
  | 'CSV'
  | 'PDF'
  | 'ZIP';

export type ExportState =
  | 'Pending'
  | 'Processing'
  | 'Completed'
  | 'Failed'
  | 'Expired';

export interface ExportResult {
  readonly downloadUrl: string;
  readonly sizeBytes: number;
  readonly recordCount: number;
  readonly generatedAt: Timestamp;
}

/**
 * Export service handles data exports.
 */
export interface ExportService {
  /** Request an export */
  request(request: Omit<ExportRequest, 'id' | 'state' | 'requestedAt'>): Promise<ExportRequest>;
  
  /** Get export status */
  getStatus(exportId: EntityId): Promise<ExportRequest | null>;
  
  /** Get exports for an entity */
  getForEntity(entityId: EntityId): Promise<readonly ExportRequest[]>;
  
  /** Cancel a pending export */
  cancel(exportId: EntityId): Promise<void>;
}

// ============================================================================
// ARCHIVAL
// ============================================================================

/**
 * Archival policy for old data.
 */
export interface ArchivalPolicy {
  readonly id: EntityId;
  readonly name: string;
  readonly description?: string;
  
  /** What to archive */
  readonly scope: ArchivalScope;
  
  /** When to archive */
  readonly archiveAfter: Duration;
  
  /** Where to archive */
  readonly destination: ArchivalDestination;
  
  /** What to do with original */
  readonly action: ArchivalAction;
  
  /** Is this policy active? */
  readonly enabled: boolean;
}

export interface ArchivalScope {
  readonly eventTypes?: readonly string[];
  readonly aggregateTypes?: readonly AggregateType[];
  readonly realmIds?: readonly EntityId[];
  readonly olderThan?: Duration;
  readonly excludeActive?: boolean; // Exclude events for active aggregates
}

export type ArchivalDestination =
  | { readonly type: 'S3'; readonly bucket: string; readonly prefix: string }
  | { readonly type: 'GCS'; readonly bucket: string; readonly prefix: string }
  | { readonly type: 'Azure'; readonly container: string; readonly prefix: string }
  | { readonly type: 'Glacier'; readonly vault: string }
  | { readonly type: 'Local'; readonly path: string };

export type ArchivalAction =
  | 'Copy'            // Copy to archive, keep original
  | 'Move'            // Move to archive, delete original
  | 'Compress'        // Compress and keep in place
  | 'Reference';      // Replace with reference, store archive

/**
 * An archived batch of events.
 */
export interface ArchivedBatch {
  readonly id: EntityId;
  readonly policyId: EntityId;
  
  /** What was archived */
  readonly sequenceFrom: bigint;
  readonly sequenceTo: bigint;
  readonly eventCount: number;
  readonly sizeBytes: number;
  
  /** Archive location */
  readonly destination: ArchivalDestination;
  readonly path: string;
  
  /** Metadata */
  readonly archivedAt: Timestamp;
  readonly checksum: string;
  
  /** Can events be restored? */
  readonly restorable: boolean;
}

/**
 * Archival manager handles data archival.
 */
export interface ArchivalManager {
  /** Register a policy */
  registerPolicy(policy: ArchivalPolicy): void;
  
  /** Run archival for a policy */
  runPolicy(policyId: EntityId): Promise<ArchivalResult>;
  
  /** Run all due policies */
  runAllDue(): Promise<readonly ArchivalResult[]>;
  
  /** Restore archived events */
  restore(batchId: EntityId): Promise<RestoreResult>;
  
  /** Get archived batches */
  getArchivedBatches(options?: { policyId?: EntityId; since?: Timestamp }): Promise<readonly ArchivedBatch[]>;
  
  /** Verify archive integrity */
  verify(batchId: EntityId): Promise<VerificationResult>;
}

export interface ArchivalResult {
  readonly policyId: EntityId;
  readonly batchId?: EntityId;
  readonly eventsArchived: number;
  readonly bytesArchived: number;
  readonly duration: number;
  readonly success: boolean;
  readonly error?: string;
}

export interface RestoreResult {
  readonly batchId: EntityId;
  readonly eventsRestored: number;
  readonly duration: number;
  readonly success: boolean;
  readonly error?: string;
}

export interface VerificationResult {
  readonly batchId: EntityId;
  readonly valid: boolean;
  readonly checksumMatch: boolean;
  readonly eventCountMatch: boolean;
  readonly errors?: readonly string[];
}

// ============================================================================
// DATA RETENTION
// ============================================================================

/**
 * Data retention policy for compliance.
 */
export interface RetentionPolicy {
  readonly id: EntityId;
  readonly name: string;
  readonly description?: string;
  
  /** What data is covered */
  readonly scope: RetentionScope;
  
  /** How long to retain */
  readonly retentionPeriod: Duration;
  
  /** Legal basis */
  readonly legalBasis: string;
  readonly regulation?: string; // GDPR, HIPAA, etc.
  
  /** After retention, what to do */
  readonly afterExpiry: RetentionAction;
  
  /** Is this policy active? */
  readonly enabled: boolean;
}

export interface RetentionScope {
  readonly dataTypes: readonly string[];
  readonly aggregateTypes?: readonly AggregateType[];
  readonly jurisdictions?: readonly string[];
}

export type RetentionAction =
  | 'Delete'
  | 'Anonymize'
  | 'Archive'
  | 'Review'; // Manual review before action

/**
 * Retention manager enforces data retention.
 */
export interface RetentionManager {
  /** Register a policy */
  registerPolicy(policy: RetentionPolicy): void;
  
  /** Get applicable policies for data */
  getApplicablePolicies(dataType: string, jurisdiction?: string): readonly RetentionPolicy[];
  
  /** Check if data can be deleted */
  canDelete(aggregateType: AggregateType, aggregateId: EntityId): Promise<DeletionEligibility>;
  
  /** Process expired data */
  processExpired(): Promise<RetentionProcessingResult>;
  
  /** Place data on legal hold */
  placeOnHold(aggregateType: AggregateType, aggregateId: EntityId, reason: string): Promise<void>;
  
  /** Release from hold */
  releaseHold(aggregateType: AggregateType, aggregateId: EntityId): Promise<void>;
}

export interface DeletionEligibility {
  readonly eligible: boolean;
  readonly reason?: string;
  readonly blockedBy?: readonly string[]; // Policies that block deletion
  readonly earliestDeletionDate?: Timestamp;
}

export interface RetentionProcessingResult {
  readonly processed: number;
  readonly deleted: number;
  readonly anonymized: number;
  readonly archived: number;
  readonly errors: number;
  readonly duration: number;
}

