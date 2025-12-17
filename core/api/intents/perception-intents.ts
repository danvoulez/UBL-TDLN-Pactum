/**
 * PERCEPTION INTENTS
 *
 * Intents for the Perception Layer:
 * - Watchers: create, pause, resume, stop
 * - Shadows: create, update, record interaction, promote
 */

import type { IntentDefinition, HandlerContext, IntentResult } from '../intent-api';
import type { EntityId, Quantity } from '../../shared/types';
import { asEntityId, Ids } from '../../shared/types';
import type {
  WatcherSource,
  WatcherFilter,
  WatcherAction,
  WatcherTier,
  ShadowType,
  ExternalIdentity,
  InteractionRecord,
  WatcherCreatedPayload,
  WatcherPausedPayload,
  WatcherResumedPayload,
  WatcherStoppedPayload,
  WatcherTriggeredPayload,
  ShadowEntityCreatedPayload,
  ShadowEntityUpdatedPayload,
  ShadowInteractionRecordedPayload,
  ShadowEntityPromotedPayload,
  ShadowIdentityAddedPayload,
} from '../../schema/perception';
import { calculateWatcherMonthlyCost } from '../../schema/perception';

// ============================================================================
// CREATE WATCHER
// ============================================================================

const createWatcherIntent: IntentDefinition = {
  type: 'create:watcher',
  description: 'Create a new watcher to monitor external sources',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the watcher' },
      description: { type: 'string', description: 'Description of what this watcher does' },
      source: {
        type: 'object',
        description: 'What to watch',
        properties: {
          type: { type: 'string', enum: ['webhook', 'poll', 'email', 'rss', 'websocket', 'event_stream', 'cron'] },
          endpoint: { type: 'string' },
          webhookPath: { type: 'string' },
          emailAddress: { type: 'string' },
          cronExpression: { type: 'string' },
          eventTypes: { type: 'array', items: { type: 'string' } },
        },
        required: ['type'],
      },
      filter: {
        type: 'object',
        description: 'What to look for',
        properties: {
          keywords: { type: 'array', items: { type: 'string' } },
          pattern: { type: 'string' },
          conditions: { type: 'array' },
          minConfidence: { type: 'number' },
        },
      },
      action: {
        type: 'object',
        description: 'What to do when triggered',
        properties: {
          type: { type: 'string', enum: ['notify', 'intent', 'webhook', 'store', 'chain'] },
          intentType: { type: 'string' },
          intentPayload: { type: 'object' },
          webhookUrl: { type: 'string' },
          chainWatcherId: { type: 'string' },
        },
        required: ['type'],
      },
      tier: { type: 'string', enum: ['Basic', 'Standard', 'Premium'], default: 'Basic' },
      pollInterval: { type: 'string', description: 'ISO 8601 duration for poll interval' },
    },
    required: ['name', 'source', 'filter', 'action'],
  },
  examples: [
    {
      description: 'Create a watcher for RSS feed',
      input: {
        name: 'Tech News Watcher',
        source: { type: 'rss', endpoint: 'https://news.ycombinator.com/rss' },
        filter: { keywords: ['AI', 'LLM', 'GPT'] },
        action: { type: 'notify' },
        tier: 'Basic',
      },
    },
    {
      description: 'Create a cron-based watcher',
      input: {
        name: 'Daily Report',
        source: { type: 'cron', cronExpression: '0 9 * * *' },
        filter: {},
        action: { type: 'intent', intentType: 'generate:report' },
        tier: 'Standard',
      },
    },
  ],
  handler: async (
    payload: {
      name: string;
      description?: string;
      source: WatcherSource;
      filter: WatcherFilter;
      action: WatcherAction;
      tier?: WatcherTier;
      pollInterval?: string;
    },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const tier = payload.tier || 'Basic';
    const monthlyCost = calculateWatcherMonthlyCost(tier);

    // Generate IDs
    const watcherId = Ids.entity();

    // Create event
    const eventPayload: WatcherCreatedPayload = {
      type: 'WatcherCreated',
      watcherId,
      ownerId: actor.type === 'Entity' ? actor.entityId : asEntityId('system'),
      name: payload.name,
      source: payload.source,
      filter: payload.filter,
      action: payload.action,
      tier,
    };

    const event = await eventStore.append({
      type: 'WatcherCreated',
      aggregateId: watcherId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Watcher "${payload.name}" created (${tier} tier, ${monthlyCost} ◆/month)`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [
        { intentType: 'pause:watcher', description: 'Pause this watcher' },
        { intentType: 'stop:watcher', description: 'Stop and delete this watcher' },
      ],
      meta: {
        watcherId,
        tier,
        monthlyCost,
      },
    };
  },
};

// ============================================================================
// PAUSE WATCHER
// ============================================================================

const pauseWatcherIntent: IntentDefinition = {
  type: 'pause:watcher',
  description: 'Pause a watcher temporarily',
  schema: {
    type: 'object',
    properties: {
      watcherId: { type: 'string', description: 'ID of the watcher to pause' },
      reason: { type: 'string', description: 'Reason for pausing' },
    },
    required: ['watcherId'],
  },
  examples: [],
  handler: async (
    payload: { watcherId: string; reason?: string },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const watcherId = asEntityId(payload.watcherId);

    const eventPayload: WatcherPausedPayload = {
      type: 'WatcherPaused',
      watcherId,
      reason: payload.reason,
    };

    const event = await eventStore.append({
      type: 'WatcherPaused',
      aggregateId: watcherId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Watcher paused${payload.reason ? `: ${payload.reason}` : ''}`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [
        { intentType: 'resume:watcher', description: 'Resume this watcher' },
      ],
      meta: { watcherId },
    };
  },
};

// ============================================================================
// RESUME WATCHER
// ============================================================================

const resumeWatcherIntent: IntentDefinition = {
  type: 'resume:watcher',
  description: 'Resume a paused watcher',
  schema: {
    type: 'object',
    properties: {
      watcherId: { type: 'string', description: 'ID of the watcher to resume' },
    },
    required: ['watcherId'],
  },
  examples: [],
  handler: async (
    payload: { watcherId: string },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const watcherId = asEntityId(payload.watcherId);

    const eventPayload: WatcherResumedPayload = {
      type: 'WatcherResumed',
      watcherId,
    };

    const event = await eventStore.append({
      type: 'WatcherResumed',
      aggregateId: watcherId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: 'Watcher resumed',
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [
        { intentType: 'pause:watcher', description: 'Pause this watcher' },
      ],
      meta: { watcherId },
    };
  },
};

// ============================================================================
// STOP WATCHER
// ============================================================================

const stopWatcherIntent: IntentDefinition = {
  type: 'stop:watcher',
  description: 'Stop and delete a watcher permanently',
  schema: {
    type: 'object',
    properties: {
      watcherId: { type: 'string', description: 'ID of the watcher to stop' },
      reason: { type: 'string', description: 'Reason for stopping' },
    },
    required: ['watcherId', 'reason'],
  },
  examples: [],
  handler: async (
    payload: { watcherId: string; reason: string },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const watcherId = asEntityId(payload.watcherId);

    const eventPayload: WatcherStoppedPayload = {
      type: 'WatcherStopped',
      watcherId,
      reason: payload.reason,
      finalStats: {
        triggerCount: 0,  // Would be calculated from events
        errorCount: 0,
        totalCost: { amount: BigInt(0), unit: 'mUBL' },
      },
    };

    const event = await eventStore.append({
      type: 'WatcherStopped',
      aggregateId: watcherId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Watcher stopped: ${payload.reason}`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [],
      meta: { watcherId },
    };
  },
};

// ============================================================================
// CREATE SHADOW ENTITY
// ============================================================================

const createShadowIntent: IntentDefinition = {
  type: 'create:shadow',
  description: 'Create a shadow entity to track an external entity',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Display name for the shadow' },
      shadowType: { type: 'string', enum: ['Person', 'Organization', 'Service', 'Account', 'Unknown'] },
      identities: {
        type: 'array',
        description: 'External identities',
        items: {
          type: 'object',
          properties: {
            platform: { type: 'string' },
            externalId: { type: 'string' },
            handle: { type: 'string' },
            url: { type: 'string' },
          },
          required: ['platform', 'externalId'],
        },
      },
      notes: { type: 'string', description: 'Initial notes about this entity' },
    },
    required: ['name', 'shadowType', 'identities'],
  },
  examples: [
    {
      description: 'Create shadow for a Twitter user',
      input: {
        name: 'John Doe',
        shadowType: 'Person',
        identities: [{ platform: 'twitter', externalId: '12345', handle: '@johndoe' }],
        notes: 'Potential client, interested in AI services',
      },
    },
  ],
  handler: async (
    payload: {
      name: string;
      shadowType: ShadowType;
      identities: ExternalIdentity[];
      notes?: string;
    },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const shadowId = Ids.entity();

    const eventPayload: ShadowEntityCreatedPayload = {
      type: 'ShadowEntityCreated',
      shadowId,
      ownerId: actor.type === 'Entity' ? actor.entityId : asEntityId('system'),
      identities: payload.identities,
      shadowType: payload.shadowType,
      name: payload.name,
      initialNotes: payload.notes,
    };

    const event = await eventStore.append({
      type: 'ShadowEntityCreated',
      aggregateId: shadowId,
      aggregateType: 'Party',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Shadow entity "${payload.name}" created`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [
        { intentType: 'update:shadow', description: 'Update shadow details' },
        { intentType: 'record:shadow-interaction', description: 'Record an interaction' },
        { intentType: 'promote:shadow', description: 'Promote to real entity' },
      ],
      meta: {
        shadowId,
        identityCount: payload.identities.length,
      },
    };
  },
};

// ============================================================================
// UPDATE SHADOW ENTITY
// ============================================================================

const updateShadowIntent: IntentDefinition = {
  type: 'update:shadow',
  description: 'Update a shadow entity',
  schema: {
    type: 'object',
    properties: {
      shadowId: { type: 'string', description: 'ID of the shadow to update' },
      name: { type: 'string' },
      notes: { type: 'string' },
      trustLevel: { type: 'string', enum: ['Unknown', 'Low', 'Medium', 'High'] },
      reputation: { type: 'number', minimum: 0, maximum: 100 },
      inferredAttributes: { type: 'object' },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['shadowId'],
  },
  examples: [],
  handler: async (
    payload: {
      shadowId: string;
      name?: string;
      notes?: string;
      trustLevel?: 'Unknown' | 'Low' | 'Medium' | 'High';
      reputation?: number;
      inferredAttributes?: Record<string, unknown>;
      tags?: string[];
    },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const shadowId = asEntityId(payload.shadowId);

    const changes: ShadowEntityUpdatedPayload['changes'] = {};
    if (payload.name !== undefined) changes.name = payload.name;
    if (payload.notes !== undefined) changes.notes = payload.notes;
    if (payload.trustLevel !== undefined) changes.trustLevel = payload.trustLevel;
    if (payload.reputation !== undefined) changes.reputation = payload.reputation;
    if (payload.inferredAttributes !== undefined) changes.inferredAttributes = payload.inferredAttributes;
    if (payload.tags !== undefined) changes.tags = payload.tags;

    const eventPayload: ShadowEntityUpdatedPayload = {
      type: 'ShadowEntityUpdated',
      shadowId,
      changes,
    };

    const event = await eventStore.append({
      type: 'ShadowEntityUpdated',
      aggregateId: shadowId,
      aggregateType: 'Party',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Shadow entity updated`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [],
      meta: { shadowId, changedFields: Object.keys(changes) },
    };
  },
};

// ============================================================================
// RECORD SHADOW INTERACTION
// ============================================================================

const recordShadowInteractionIntent: IntentDefinition = {
  type: 'record:shadow-interaction',
  description: 'Record an interaction with a shadow entity',
  schema: {
    type: 'object',
    properties: {
      shadowId: { type: 'string', description: 'ID of the shadow' },
      interactionType: { type: 'string', enum: ['inbound', 'outbound', 'observation'] },
      channel: { type: 'string', description: 'Channel of interaction (email, twitter, etc)' },
      summary: { type: 'string', description: 'Summary of the interaction' },
      sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
      metadata: { type: 'object' },
    },
    required: ['shadowId', 'interactionType', 'channel', 'summary'],
  },
  examples: [],
  handler: async (
    payload: {
      shadowId: string;
      interactionType: 'inbound' | 'outbound' | 'observation';
      channel: string;
      summary: string;
      sentiment?: 'positive' | 'neutral' | 'negative';
      metadata?: Record<string, unknown>;
    },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const shadowId = asEntityId(payload.shadowId);

    const interaction: InteractionRecord = {
      timestamp: Date.now(),
      type: payload.interactionType,
      channel: payload.channel,
      summary: payload.summary,
      sentiment: payload.sentiment,
      metadata: payload.metadata,
    };

    const eventPayload: ShadowInteractionRecordedPayload = {
      type: 'ShadowInteractionRecorded',
      shadowId,
      interaction,
    };

    const event = await eventStore.append({
      type: 'ShadowInteractionRecorded',
      aggregateId: shadowId,
      aggregateType: 'Party',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Interaction recorded: ${payload.summary.slice(0, 50)}...`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [],
      meta: { shadowId, interactionType: payload.interactionType },
    };
  },
};

// ============================================================================
// PROMOTE SHADOW TO ENTITY
// ============================================================================

const promoteShadowIntent: IntentDefinition = {
  type: 'promote:shadow',
  description: 'Promote a shadow entity to a real UBL entity',
  schema: {
    type: 'object',
    properties: {
      shadowId: { type: 'string', description: 'ID of the shadow to promote' },
      entityType: { type: 'string', enum: ['Person', 'Organization', 'Agent'] },
      createWallet: { type: 'boolean', default: false },
    },
    required: ['shadowId', 'entityType'],
  },
  examples: [],
  handler: async (
    payload: {
      shadowId: string;
      entityType: 'Person' | 'Organization' | 'Agent';
      createWallet?: boolean;
    },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const shadowId = asEntityId(payload.shadowId);
    const newEntityId = Ids.entity();

    // First, create the real entity (simplified - would normally use register:entity)
    await eventStore.append({
      type: 'EntityRegistered',
      aggregateId: newEntityId,
      aggregateType: 'Party',
      aggregateVersion: 1,
      payload: {
        type: 'EntityRegistered',
        entityId: newEntityId,
        substrate: payload.entityType,
        promotedFromShadow: shadowId,
      },
      actor,
    });

    // Then mark the shadow as promoted
    const eventPayload: ShadowEntityPromotedPayload = {
      type: 'ShadowEntityPromoted',
      shadowId,
      newEntityId,
      promotedBy: actor.type === 'Entity' ? actor.entityId : asEntityId('system'),
    };

    const event = await eventStore.append({
      type: 'ShadowEntityPromoted',
      aggregateId: shadowId,
      aggregateType: 'Party',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Shadow promoted to ${payload.entityType} entity`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [
        { intentType: 'create:wallet', description: 'Create wallet for new entity' },
      ],
      meta: {
        shadowId,
        newEntityId,
        entityType: payload.entityType,
      },
    };
  },
};

// ============================================================================
// ADD IDENTITY TO SHADOW
// ============================================================================

const addShadowIdentityIntent: IntentDefinition = {
  type: 'add:shadow-identity',
  description: 'Add an external identity to a shadow entity',
  schema: {
    type: 'object',
    properties: {
      shadowId: { type: 'string', description: 'ID of the shadow' },
      identity: {
        type: 'object',
        properties: {
          platform: { type: 'string' },
          externalId: { type: 'string' },
          handle: { type: 'string' },
          url: { type: 'string' },
        },
        required: ['platform', 'externalId'],
      },
    },
    required: ['shadowId', 'identity'],
  },
  examples: [],
  handler: async (
    payload: {
      shadowId: string;
      identity: ExternalIdentity;
    },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const shadowId = asEntityId(payload.shadowId);

    const eventPayload: ShadowIdentityAddedPayload = {
      type: 'ShadowIdentityAdded',
      shadowId,
      identity: payload.identity,
    };

    const event = await eventStore.append({
      type: 'ShadowIdentityAdded',
      aggregateId: shadowId,
      aggregateType: 'Party',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Identity added: ${payload.identity.platform}/${payload.identity.externalId}`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [],
      meta: { shadowId, platform: payload.identity.platform },
    };
  },
};

// ============================================================================
// EXPORT ALL INTENTS
// ============================================================================

export const PERCEPTION_INTENTS: IntentDefinition[] = [
  // Watcher intents
  createWatcherIntent,
  pauseWatcherIntent,
  resumeWatcherIntent,
  stopWatcherIntent,
  // Shadow intents
  createShadowIntent,
  updateShadowIntent,
  recordShadowInteractionIntent,
  promoteShadowIntent,
  addShadowIdentityIntent,
];
