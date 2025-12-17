/**
 * DISPUTE INTENTS
 * 
 * Intent handlers for dispute resolution:
 * - dispute:open: Open a dispute on an agreement
 * - dispute:resolve: Resolve a dispute
 */

import type { IntentDefinition, Intent, IntentResult, HandlerContext } from '../intent-api';
import { Ids } from '../../shared/types';

export const DISPUTE_INTENTS: readonly IntentDefinition[] = [
  {
    name: 'dispute:open',
    description: 'Open a dispute on an agreement',
    category: 'Agreement',
    schema: {
      type: 'object',
      required: ['agreementId', 'reason'],
      properties: {
        agreementId: { type: 'string' },
        reason: { type: 'string' },
        evidence: { type: 'array', items: { type: 'string' } },
        requestedResolution: { type: 'string' },
      },
    },
    requiredPermissions: ['agreement:dispute'],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as any;
      const eventStore = context.eventStore as any;
      const disputeId = Ids.entity();
      
      const event = await eventStore.append({
        type: 'DisputeOpened',
        aggregateType: 'Agreement' as any,
        aggregateId: payload.agreementId,
        aggregateVersion: 1,
        actor: intent.actor,
        timestamp: intent.timestamp || Date.now(),
        payload: {
          disputeId,
          reason: payload.reason,
          evidence: payload.evidence,
          requestedResolution: payload.requestedResolution,
        },
      });
      
      return {
        success: true,
        outcome: { 
          type: 'Created' as const, 
          entity: { id: disputeId, type: 'Dispute', agreementId: payload.agreementId },
          id: disputeId 
        },
        events: [event],
        affordances: [
          { intent: 'dispute:resolve', description: 'Resolve this dispute', required: ['disputeId', 'resolution'] },
        ],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    },
  },
  
  {
    name: 'dispute:resolve',
    description: 'Resolve a dispute',
    category: 'Agreement',
    schema: {
      type: 'object',
      required: ['disputeId', 'resolution'],
      properties: {
        disputeId: { type: 'string' },
        agreementId: { type: 'string' },
        resolution: { type: 'string', enum: ['Accepted', 'Rejected', 'Compromised', 'Escalated'] },
        terms: { type: 'string' },
        compensations: { type: 'array' },
      },
    },
    requiredPermissions: ['agreement:dispute:resolve'],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as any;
      const eventStore = context.eventStore as any;
      
      const event = await eventStore.append({
        type: 'DisputeResolved',
        aggregateType: 'Agreement' as any,
        aggregateId: payload.agreementId || payload.disputeId,
        aggregateVersion: 1,
        actor: intent.actor,
        timestamp: intent.timestamp || Date.now(),
        payload: {
          disputeId: payload.disputeId,
          resolution: payload.resolution,
          terms: payload.terms,
          compensations: payload.compensations,
        },
      });
      
      return {
        success: true,
        outcome: { type: 'Transitioned' as const, from: 'Disputed', to: payload.resolution },
        events: [event],
        affordances: [],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    },
  },
];
