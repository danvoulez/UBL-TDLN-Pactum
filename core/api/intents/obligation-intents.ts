/**
 * UNILATERAL OBLIGATION INTENTS
 * 
 * Intents for declaring, fulfilling, and abandoning unilateral obligations.
 * 
 * Flow:
 *   Stimulus → Reasoning → Obligation → Fulfillment/Abandonment
 */

import type { IntentDefinition, HandlerContext, IntentResult } from '../intent-api';
import type { EntityId } from '../../shared/types';
import { asEntityId, Ids } from '../../shared/types';
import type { 
  ObligationType, 
  StimulusSource 
} from '../../schema/unilateral-obligations';

// ============================================================================
// RECORD STIMULUS
// ============================================================================

const recordStimulusIntent: IntentDefinition = {
  name: 'record:stimulus',
  description: 'Record an external stimulus that triggered agent reasoning',
  category: 'Entity',
  schema: {
    type: 'object',
    properties: {
      source: { 
        type: 'string', 
        enum: ['Watcher', 'DirectMessage', 'APICall', 'Schedule', 'ChainReaction', 'Manual'],
        description: 'Source of the stimulus',
      },
      content: { type: 'string', description: 'Raw content of the stimulus' },
      data: { type: 'object', description: 'Structured data if available' },
      sourceRef: { type: 'string', description: 'Source reference (watcher ID, message ID, etc.)' },
      platform: { type: 'string', description: 'Platform/channel if applicable' },
    },
    required: ['source', 'content'],
  },
  requiredPermissions: ['stimulus:record'],
  examples: [
    {
      source: 'Watcher',
      content: 'New tweet mentioning @client from competitor',
      sourceRef: 'watcher-123',
      platform: 'twitter',
    },
  ],
  handler: async (intent, context): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const payload = intent.payload as {
      source: StimulusSource;
      content: string;
      data?: Record<string, unknown>;
      sourceRef?: string;
      platform?: string;
    };
    
    const stimulusId = Ids.entity();
    
    const event = await eventStore.append({
      type: 'StimulusReceived',
      aggregateId: stimulusId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: {
        type: 'StimulusReceived',
        source: payload.source,
        content: payload.content,
        data: payload.data,
        sourceRef: payload.sourceRef ? asEntityId(payload.sourceRef) : undefined,
        platform: payload.platform,
      },
      actor,
    });

    return {
      success: true,
      outcome: { type: 'Created', entity: { stimulusId }, id: stimulusId },
      events: [{ id: event.id, type: event.type, sequence: event.sequence }],
      affordances: [
        { intent: 'record:reasoning', description: 'Record reasoning based on this stimulus', required: ['stimulusId'] },
      ],
      meta: {
        processedAt: Date.now(),
        processingTime: 0,
      },
    };
  },
};

// ============================================================================
// RECORD REASONING
// ============================================================================

const recordReasoningIntent: IntentDefinition = {
  name: 'record:reasoning',
  description: 'Record agent reasoning process that led to a decision',
  category: 'Entity',
  schema: {
    type: 'object',
    properties: {
      agentId: { type: 'string', description: 'Agent that did the reasoning' },
      stimulusId: { type: 'string', description: 'Stimulus that triggered reasoning' },
      context: { type: 'string', description: 'The prompt/context given to LLM' },
      reasoning: { type: 'string', description: 'The LLM reasoning output' },
      decision: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['CreateObligation', 'Ignore', 'Defer', 'Escalate'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          alternatives: { type: 'array', items: { type: 'string' } },
        },
        required: ['action', 'confidence'],
      },
      execution: {
        type: 'object',
        properties: {
          provider: { type: 'string' },
          model: { type: 'string' },
          tokens: { type: 'number' },
          cost: { type: 'number' },
          durationMs: { type: 'number' },
        },
        required: ['provider', 'model', 'tokens', 'cost', 'durationMs'],
      },
    },
    required: ['agentId', 'stimulusId', 'reasoning', 'decision', 'execution'],
  },
  requiredPermissions: ['reasoning:record'],
  examples: [
    {
      agentId: 'agent-123',
      stimulusId: 'stimulus-456',
      context: 'Client mentioned need for market report...',
      reasoning: 'Based on client history and current request...',
      decision: { action: 'CreateObligation', confidence: 0.85 },
      execution: { provider: 'openai', model: 'gpt-4', tokens: 1500, cost: 0.045, durationMs: 2300 },
    },
  ],
  handler: async (intent, context): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const payload = intent.payload as {
      agentId: string;
      stimulusId: string;
      context?: string;
      reasoning: string;
      decision: { action: string; confidence: number; alternatives?: string[] };
      execution: { provider: string; model: string; tokens: number; cost: number; durationMs: number };
    };
    
    const reasoningId = Ids.entity();
    
    const event = await eventStore.append({
      type: 'ReasoningCompleted',
      aggregateId: reasoningId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: {
        type: 'ReasoningCompleted',
        agentId: asEntityId(payload.agentId),
        stimulusId: asEntityId(payload.stimulusId),
        reasoning: payload.reasoning,
        decision: payload.decision,
        execution: payload.execution,
      },
      actor,
    });

    return {
      success: true,
      outcome: { type: 'Created', entity: { reasoningId }, id: reasoningId },
      events: [{ id: event.id, type: event.type, sequence: event.sequence }],
      affordances: payload.decision.action === 'CreateObligation' 
        ? [{ intent: 'declare:obligation', description: 'Declare obligation based on this reasoning', required: ['reasoningId'] }]
        : [],
      meta: {
        processedAt: Date.now(),
        processingTime: 0,
      },
    };
  },
};

// ============================================================================
// DECLARE OBLIGATION
// ============================================================================

const declareObligationIntent: IntentDefinition = {
  name: 'declare:obligation',
  description: 'Declare a unilateral obligation - a promise made without requiring consent',
  category: 'Agreement',
  schema: {
    type: 'object',
    properties: {
      obligorId: { type: 'string', description: 'Entity making the promise' },
      beneficiaryId: { type: 'string', description: 'Entity benefiting (optional)' },
      obligationType: { 
        type: 'string', 
        enum: ['Deliver', 'Pay', 'Notify', 'Attend', 'Refrain', 'Custom'],
        description: 'Type of obligation',
      },
      description: { type: 'string', description: 'Human-readable description' },
      deliverable: { type: 'string', description: 'What is promised' },
      deadline: { type: 'number', description: 'When it should be fulfilled (timestamp)' },
      conditions: { type: 'array', items: { type: 'string' }, description: 'Any conditions' },
      quantity: {
        type: 'object',
        properties: {
          amount: { type: 'number' },
          unit: { type: 'string' },
        },
      },
      stimulusId: { type: 'string', description: 'ID of the stimulus that triggered this' },
      reasoningId: { type: 'string', description: 'ID of the reasoning that led to this' },
    },
    required: ['obligorId', 'obligationType', 'description', 'deliverable', 'stimulusId', 'reasoningId'],
  },
  requiredPermissions: ['obligation:declare'],
  affectsAgreementTypes: ['UnilateralObligation'],
  examples: [
    {
      obligorId: 'agent-123',
      beneficiaryId: 'client-456',
      obligationType: 'Deliver',
      description: 'Deliver market analysis report',
      deliverable: 'PDF report with Q4 market analysis',
      deadline: Date.now() + 86400000,
      stimulusId: 'stimulus-789',
      reasoningId: 'reasoning-abc',
    },
  ],
  handler: async (intent, context): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const payload = intent.payload as {
      obligorId: string;
      beneficiaryId?: string;
      obligationType: ObligationType;
      description: string;
      deliverable: string;
      deadline?: number;
      conditions?: string[];
      quantity?: { amount: number; unit: string };
      stimulusId: string;
      reasoningId: string;
    };
    
    const obligationId = Ids.entity();
    
    const event = await eventStore.append({
      type: 'ObligationDeclared',
      aggregateId: obligationId,
      aggregateType: 'Agreement',
      aggregateVersion: 1,
      payload: {
        type: 'ObligationDeclared',
        obligorId: asEntityId(payload.obligorId),
        beneficiaryId: payload.beneficiaryId ? asEntityId(payload.beneficiaryId) : undefined,
        obligationType: payload.obligationType,
        description: payload.description,
        terms: {
          deliverable: payload.deliverable,
          deadline: payload.deadline,
          conditions: payload.conditions,
          quantity: payload.quantity,
        },
        stimulusId: asEntityId(payload.stimulusId),
        reasoningId: asEntityId(payload.reasoningId),
      },
      actor,
    });

    return {
      success: true,
      outcome: { type: 'Created', entity: { obligationId }, id: obligationId },
      events: [{ id: event.id, type: event.type, sequence: event.sequence }],
      affordances: [
        { intent: 'fulfill:obligation', description: 'Fulfill this obligation', required: ['obligationId'] },
        { intent: 'abandon:obligation', description: 'Abandon this obligation', required: ['obligationId', 'reason'] },
      ],
      meta: {
        processedAt: Date.now(),
        processingTime: 0,
      },
    };
  },
};

// ============================================================================
// FULFILL OBLIGATION
// ============================================================================

const fulfillObligationIntent: IntentDefinition = {
  name: 'fulfill:obligation',
  description: 'Mark an obligation as fulfilled',
  category: 'Agreement',
  schema: {
    type: 'object',
    properties: {
      obligationId: { type: 'string', description: 'ID of the obligation to fulfill' },
      evidence: { type: 'string', description: 'Proof of fulfillment' },
      deliveredAssetId: { type: 'string', description: 'ID of delivered asset if applicable' },
    },
    required: ['obligationId'],
  },
  requiredPermissions: ['obligation:fulfill'],
  affectsAgreementTypes: ['UnilateralObligation'],
  examples: [
    {
      obligationId: 'obligation-123',
      evidence: 'Report delivered via email at 14:30 UTC',
      deliveredAssetId: 'asset-456',
    },
  ],
  handler: async (intent, context): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const payload = intent.payload as {
      obligationId: string;
      evidence?: string;
      deliveredAssetId?: string;
    };
    
    const event = await eventStore.append({
      type: 'ObligationFulfilled',
      aggregateId: asEntityId(payload.obligationId),
      aggregateType: 'Agreement',
      aggregateVersion: 2, // Assuming version 1 was declaration
      payload: {
        type: 'ObligationFulfilled',
        obligationId: asEntityId(payload.obligationId),
        evidence: payload.evidence,
        deliveredAssetId: payload.deliveredAssetId ? asEntityId(payload.deliveredAssetId) : undefined,
      },
      actor,
    });

    return {
      success: true,
      outcome: { type: 'Fulfilled', obligation: payload.obligationId },
      events: [{ id: event.id, type: event.type, sequence: event.sequence }],
      affordances: [],
      meta: {
        processedAt: Date.now(),
        processingTime: 0,
      },
    };
  },
};

// ============================================================================
// ABANDON OBLIGATION
// ============================================================================

const abandonObligationIntent: IntentDefinition = {
  name: 'abandon:obligation',
  description: 'Abandon an obligation with reason',
  category: 'Agreement',
  schema: {
    type: 'object',
    properties: {
      obligationId: { type: 'string', description: 'ID of the obligation to abandon' },
      reason: { type: 'string', description: 'Why the obligation is being abandoned' },
      compensationOffered: { type: 'string', description: 'Compensation offered if any' },
    },
    required: ['obligationId', 'reason'],
  },
  requiredPermissions: ['obligation:abandon'],
  affectsAgreementTypes: ['UnilateralObligation'],
  examples: [
    {
      obligationId: 'obligation-123',
      reason: 'Required data source became unavailable',
      compensationOffered: 'Partial refund of 50%',
    },
  ],
  handler: async (intent, context): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const payload = intent.payload as {
      obligationId: string;
      reason: string;
      compensationOffered?: string;
    };
    
    const event = await eventStore.append({
      type: 'ObligationAbandoned',
      aggregateId: asEntityId(payload.obligationId),
      aggregateType: 'Agreement',
      aggregateVersion: 2,
      payload: {
        type: 'ObligationAbandoned',
        obligationId: asEntityId(payload.obligationId),
        reason: payload.reason,
        compensationOffered: payload.compensationOffered,
      },
      actor,
    });

    return {
      success: true,
      outcome: { type: 'Transitioned', from: 'Declared', to: 'Abandoned' },
      events: [{ id: event.id, type: event.type, sequence: event.sequence }],
      affordances: [],
      meta: {
        processedAt: Date.now(),
        processingTime: 0,
      },
    };
  },
};

// ============================================================================
// EXPORT
// ============================================================================

export const OBLIGATION_INTENTS: readonly IntentDefinition[] = [
  recordStimulusIntent,
  recordReasoningIntent,
  declareObligationIntent,
  fulfillObligationIntent,
  abandonObligationIntent,
];
