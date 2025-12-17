/**
 * PERCEPTION LAYER SCHEMA
 *
 * "Scripts need eyes and ears to interact with the world."
 *
 * This module defines how scripts perceive and track external entities:
 * - Watchers: Monitor external sources (APIs, feeds, events)
 * - ShadowEntities: Script's private view of external entities
 *
 * Core Principles:
 * 1. Scripts pay for perception (watchers cost ◆)
 * 2. Shadow entities are private (each script has its own view)
 * 3. Everything is auditable (all observations are Events)
 * 4. Shadows can be promoted to real entities
 */

import type { EntityId, Timestamp, Quantity } from '../shared/types';

// ============================================================================
// WATCHER - Monitor external sources
// ============================================================================

/**
 * Watcher Source - where to watch
 */
export type WatcherSourceType =
  | 'webhook'       // Receive webhooks
  | 'poll'          // Poll an endpoint
  | 'email'         // Monitor email inbox
  | 'rss'           // RSS/Atom feed
  | 'websocket'     // WebSocket stream
  | 'event_stream'  // Internal event stream
  | 'cron';         // Time-based trigger

/**
 * Watcher Source Configuration
 */
export interface WatcherSource {
  readonly type: WatcherSourceType;
  
  /** URL or endpoint to watch */
  readonly endpoint?: string;
  
  /** For webhooks: the path to listen on */
  readonly webhookPath?: string;
  
  /** For email: the address to monitor */
  readonly emailAddress?: string;
  
  /** For cron: the schedule expression */
  readonly cronExpression?: string;
  
  /** For event_stream: which event types to watch */
  readonly eventTypes?: readonly string[];
  
  /** Authentication if needed */
  readonly auth?: WatcherAuth;
}

export interface WatcherAuth {
  readonly type: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
  readonly credentialId?: EntityId;  // Reference to stored credential
}

/**
 * Watcher Filter - what to look for
 */
export interface WatcherFilter {
  /** Keywords to match */
  readonly keywords?: readonly string[];
  
  /** Regex pattern */
  readonly pattern?: string;
  
  /** JSONPath or JMESPath conditions */
  readonly conditions?: readonly WatcherCondition[];
  
  /** Minimum confidence for AI-based filtering */
  readonly minConfidence?: number;
}

export interface WatcherCondition {
  readonly path: string;
  readonly operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'matches' | 'exists';
  readonly value?: unknown;
}

/**
 * Watcher Action - what to do when triggered
 */
export type WatcherActionType =
  | 'notify'        // Send notification to owner
  | 'intent'        // Execute an intent
  | 'webhook'       // Call external webhook
  | 'store'         // Just store the event
  | 'chain';        // Trigger another watcher

export interface WatcherAction {
  readonly type: WatcherActionType;
  
  /** For intent: which intent to execute */
  readonly intentType?: string;
  readonly intentPayload?: Record<string, unknown>;
  
  /** For webhook: where to call */
  readonly webhookUrl?: string;
  
  /** For chain: which watcher to trigger */
  readonly chainWatcherId?: EntityId;
  
  /** Transform the data before action */
  readonly transform?: string;  // JSONata or similar
}

/**
 * Watcher Tier - pricing tier
 */
export type WatcherTier = 'Basic' | 'Standard' | 'Premium';

/**
 * Watcher Status
 */
export type WatcherStatus = 'Active' | 'Paused' | 'Stopped' | 'Error';

/**
 * Watcher - monitors external sources
 */
export interface Watcher {
  readonly id: EntityId;
  readonly ownerId: EntityId;
  readonly name: string;
  readonly description?: string;
  
  /** What to watch */
  readonly source: WatcherSource;
  
  /** How often to poll (for poll-based sources) */
  readonly pollInterval?: string;  // ISO 8601 duration, e.g., "PT5M"
  
  /** What to look for */
  readonly filter: WatcherFilter;
  
  /** What to do when triggered */
  readonly action: WatcherAction;
  
  /** Pricing tier */
  readonly tier: WatcherTier;
  
  /** Current status */
  readonly status: WatcherStatus;
  
  /** Error message if status is Error */
  readonly errorMessage?: string;
  
  /** Statistics */
  readonly stats: WatcherStats;
  
  /** Timestamps */
  readonly createdAt: Timestamp;
  readonly lastTriggeredAt?: Timestamp;
  readonly pausedAt?: Timestamp;
}

export interface WatcherStats {
  readonly triggerCount: number;
  readonly errorCount: number;
  readonly lastCheckAt?: Timestamp;
  readonly totalCost: Quantity;
}

/**
 * Watcher Pricing
 */
export const WATCHER_PRICING: Record<WatcherTier, { monthlyCost: number; pollMinInterval: string; maxWatchers: number }> = {
  Basic: {
    monthlyCost: 10,      // 10 ◆/month
    pollMinInterval: 'PT1H',  // Minimum 1 hour between polls
    maxWatchers: 5,
  },
  Standard: {
    monthlyCost: 50,      // 50 ◆/month
    pollMinInterval: 'PT5M',  // Minimum 5 minutes
    maxWatchers: 20,
  },
  Premium: {
    monthlyCost: 200,     // 200 ◆/month
    pollMinInterval: 'PT1M',  // Minimum 1 minute
    maxWatchers: 100,
  },
};

// ============================================================================
// SHADOW ENTITY - Script's private view of external entities
// ============================================================================

/**
 * Shadow Type - what kind of external entity
 */
export type ShadowType =
  | 'Person'        // External person (not in UBL)
  | 'Organization'  // External org
  | 'Service'       // External service/API
  | 'Account'       // Social media account, etc.
  | 'Unknown';      // Not yet classified

/**
 * External Identity - how to identify the external entity
 */
export interface ExternalIdentity {
  readonly platform: string;  // 'twitter', 'github', 'email', etc.
  readonly externalId: string;
  readonly handle?: string;
  readonly url?: string;
}

/**
 * Interaction Record - history of interactions
 */
export interface InteractionRecord {
  readonly timestamp: Timestamp;
  readonly type: 'inbound' | 'outbound' | 'observation';
  readonly channel: string;
  readonly summary: string;
  readonly sentiment?: 'positive' | 'neutral' | 'negative';
  readonly metadata?: Record<string, unknown>;
}

/**
 * Shadow Entity - script's private view of an external entity
 *
 * Each script maintains its own shadow graph. Shadows are:
 * - Private to the owning script
 * - Based on observations and interactions
 * - Can be promoted to real UBL entities
 */
export interface ShadowEntity {
  readonly id: EntityId;
  
  /** Which script owns this shadow */
  readonly ownerId: EntityId;
  
  /** External identities (can have multiple) */
  readonly identities: readonly ExternalIdentity[];
  
  /** What kind of entity */
  readonly type: ShadowType;
  
  /** Display name */
  readonly name: string;
  
  /** Script's notes about this entity */
  readonly notes: string;
  
  /** Inferred attributes from observations */
  readonly inferredAttributes: Record<string, unknown>;
  
  /** Trust level (script's assessment) */
  readonly trustLevel: 'Unknown' | 'Low' | 'Medium' | 'High';
  
  /** Reputation score (0-100) */
  readonly reputation: number;
  
  /** Tags for categorization */
  readonly tags: readonly string[];
  
  /** Interaction history */
  readonly interactions: readonly InteractionRecord[];
  
  /** If promoted, the real entity ID */
  readonly promotedToEntityId?: EntityId;
  
  /** Timestamps */
  readonly createdAt: Timestamp;
  readonly lastInteractionAt?: Timestamp;
  readonly lastUpdatedAt: Timestamp;
}

// ============================================================================
// EVENTS
// ============================================================================

/**
 * Watcher Events
 */
export interface WatcherCreatedPayload {
  readonly type: 'WatcherCreated';
  readonly watcherId: EntityId;
  readonly ownerId: EntityId;
  readonly name: string;
  readonly source: WatcherSource;
  readonly filter: WatcherFilter;
  readonly action: WatcherAction;
  readonly tier: WatcherTier;
}

export interface WatcherPausedPayload {
  readonly type: 'WatcherPaused';
  readonly watcherId: EntityId;
  readonly reason?: string;
}

export interface WatcherResumedPayload {
  readonly type: 'WatcherResumed';
  readonly watcherId: EntityId;
}

export interface WatcherStoppedPayload {
  readonly type: 'WatcherStopped';
  readonly watcherId: EntityId;
  readonly reason: string;
  readonly finalStats: WatcherStats;
}

export interface WatcherTriggeredPayload {
  readonly type: 'WatcherTriggered';
  readonly watcherId: EntityId;
  readonly triggerData: Record<string, unknown>;
  readonly matchedFilter: string;
  readonly actionTaken: WatcherActionType;
  readonly actionResult?: Record<string, unknown>;
  readonly cost: Quantity;
}

export interface WatcherErrorPayload {
  readonly type: 'WatcherError';
  readonly watcherId: EntityId;
  readonly error: string;
  readonly willRetry: boolean;
  readonly retryAt?: Timestamp;
}

/**
 * Shadow Entity Events
 */
export interface ShadowEntityCreatedPayload {
  readonly type: 'ShadowEntityCreated';
  readonly shadowId: EntityId;
  readonly ownerId: EntityId;
  readonly identities: readonly ExternalIdentity[];
  readonly shadowType: ShadowType;
  readonly name: string;
  readonly initialNotes?: string;
}

export interface ShadowEntityUpdatedPayload {
  readonly type: 'ShadowEntityUpdated';
  readonly shadowId: EntityId;
  readonly changes: {
    readonly name?: string;
    readonly notes?: string;
    readonly trustLevel?: ShadowEntity['trustLevel'];
    readonly reputation?: number;
    readonly inferredAttributes?: Record<string, unknown>;
    readonly tags?: readonly string[];
  };
}

export interface ShadowInteractionRecordedPayload {
  readonly type: 'ShadowInteractionRecorded';
  readonly shadowId: EntityId;
  readonly interaction: InteractionRecord;
}

export interface ShadowEntityPromotedPayload {
  readonly type: 'ShadowEntityPromoted';
  readonly shadowId: EntityId;
  readonly newEntityId: EntityId;
  readonly promotedBy: EntityId;
}

export interface ShadowIdentityAddedPayload {
  readonly type: 'ShadowIdentityAdded';
  readonly shadowId: EntityId;
  readonly identity: ExternalIdentity;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate monthly cost for a watcher
 */
export function calculateWatcherMonthlyCost(tier: WatcherTier): number {
  return WATCHER_PRICING[tier].monthlyCost;
}

/**
 * Check if poll interval is valid for tier
 */
export function isValidPollInterval(tier: WatcherTier, intervalMs: number): boolean {
  const minIntervalMs = parseDuration(WATCHER_PRICING[tier].pollMinInterval);
  return intervalMs >= minIntervalMs;
}

/**
 * Parse ISO 8601 duration to milliseconds (simplified)
 */
function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  
  return (hours * 60 * 60 + minutes * 60 + seconds) * 1000;
}

/**
 * Create a new shadow entity
 */
export function createShadowEntity(
  id: EntityId,
  ownerId: EntityId,
  identities: readonly ExternalIdentity[],
  type: ShadowType,
  name: string,
  notes: string = ''
): ShadowEntity {
  const now = Date.now();
  return {
    id,
    ownerId,
    identities,
    type,
    name,
    notes,
    inferredAttributes: {},
    trustLevel: 'Unknown',
    reputation: 50,  // Start neutral
    tags: [],
    interactions: [],
    createdAt: now,
    lastUpdatedAt: now,
  };
}

/**
 * Create a new watcher
 */
export function createWatcher(
  id: EntityId,
  ownerId: EntityId,
  name: string,
  source: WatcherSource,
  filter: WatcherFilter,
  action: WatcherAction,
  tier: WatcherTier = 'Basic'
): Watcher {
  const now = Date.now();
  return {
    id,
    ownerId,
    name,
    source,
    filter,
    action,
    tier,
    status: 'Active',
    stats: {
      triggerCount: 0,
      errorCount: 0,
      totalCost: { amount: BigInt(0), unit: 'mUBL' },
    },
    createdAt: now,
  };
}
