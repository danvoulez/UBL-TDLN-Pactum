/**
 * AGREEMENT INTENTS
 * 
 * Intent handlers for agreement lifecycle:
 * - propose: Create a new agreement
 * - consent: Give consent to an agreement
 * - fulfill: Fulfill an obligation
 * - terminate: Terminate an agreement
 */

import type { IntentDefinition, Intent, IntentResult, HandlerContext } from '../intent-api';
import { Ids } from '../../shared/types';
import type { EntityId } from '../../shared/types';

export const AGREEMENT_INTENTS: readonly IntentDefinition[] = [
  {
    name: 'propose',
    description: 'Propose a new agreement between parties',
    category: 'Agreement',
    schema: {
      type: 'object',
      required: ['agreementType', 'parties', 'terms'],
      properties: {
        agreementType: { type: 'string' },
        parties: { type: 'array' },
        terms: { type: 'object' },
        assets: { type: 'array' },
        validity: { type: 'object' },
      },
    },
    requiredPermissions: ['agreement:propose'],
    affectsAgreementTypes: ['*'],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const agreementId = Ids.agreement();
      const eventStore = context.eventStore as any;
      const payload = intent.payload as any;
      
      const latestEvent = await eventStore.getLatest?.('Agreement' as any, agreementId);
      const nextAggregateVersion = latestEvent ? latestEvent.aggregateVersion + 1 : 1;
      
      const event = await eventStore.append({
        type: 'AgreementProposed',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: nextAggregateVersion,
        actor: intent.actor,
        timestamp: intent.timestamp || Date.now(),
        payload: {
          agreementType: payload.agreementType,
          parties: payload.parties,
          terms: payload.terms,
          assets: payload.assets,
          validity: payload.validity,
          parentAgreementId: payload.parentAgreementId,
        },
      });
      
      return {
        success: true,
        outcome: { 
          type: 'Created' as const, 
          entity: {
            id: agreementId,
            agreementType: payload.agreementType,
            status: 'Proposed',
            parties: payload.parties,
          }, 
          id: agreementId 
        },
        events: [event],
        affordances: [
          { intent: 'consent', description: 'Give consent to this agreement', required: ['agreementId', 'method'] },
          { intent: 'terminate', description: 'Terminate this agreement', required: ['agreementId', 'reason'] },
        ],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    },
  },
  
  {
    name: 'consent',
    description: 'Give consent to an agreement',
    category: 'Agreement',
    schema: {
      type: 'object',
      required: ['agreementId', 'method'],
      properties: {
        agreementId: { type: 'string' },
        method: { type: 'string', enum: ['Digital', 'Signature', 'Verbal', 'Click', 'Implied'] },
        evidence: { type: 'string' },
      },
    },
    requiredPermissions: ['agreement:consent'],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as any;
      const { agreementId, method, evidence } = payload;
      const eventStore = context.eventStore as any;
      const aggregates = context.aggregates as any;
      
      const agreement = await aggregates?.getAgreement?.(agreementId);
      if (!agreement || !agreement.exists) {
        return {
          success: false,
          outcome: { type: 'Nothing' as const, reason: 'Agreement not found' },
          events: [],
          affordances: [],
          errors: [{ code: 'NOT_FOUND', message: `Agreement ${agreementId} not found` }],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      }
      
      const partyId = intent.actor.type === 'Entity' ? (intent.actor as any).entityId : null;
      
      const event = await eventStore.append({
        type: 'ConsentGiven',
        aggregateType: 'Agreement' as any,
        aggregateId: agreementId,
        aggregateVersion: (agreement.version || 0) + 1,
        actor: intent.actor,
        timestamp: intent.timestamp || Date.now(),
        payload: { partyId, method, evidence },
      });
      
      return {
        success: true,
        outcome: { type: 'Consented' as const, agreement: agreementId, party: partyId },
        events: [event],
        affordances: [
          { intent: 'fulfill', description: 'Fulfill an obligation', required: ['agreementId', 'obligationId'] },
        ],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    },
  },
  
  {
    name: 'fulfill',
    description: 'Fulfill an obligation in an agreement',
    category: 'Agreement',
    schema: {
      type: 'object',
      required: ['agreementId', 'obligationId'],
      properties: {
        agreementId: { type: 'string' },
        obligationId: { type: 'string' },
        evidence: { type: 'string' },
      },
    },
    requiredPermissions: ['agreement:fulfill'],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as any;
      const eventStore = context.eventStore as any;
      
      const event = await eventStore.append({
        type: 'ObligationFulfilled',
        aggregateType: 'Agreement' as any,
        aggregateId: payload.agreementId,
        aggregateVersion: 1,
        actor: intent.actor,
        timestamp: intent.timestamp || Date.now(),
        payload: {
          obligationId: payload.obligationId,
          evidence: payload.evidence,
        },
      });
      
      return {
        success: true,
        outcome: { type: 'Fulfilled' as const, obligation: payload.obligationId },
        events: [event],
        affordances: [],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    },
  },
  
  {
    name: 'terminate',
    description: 'Terminate an agreement',
    category: 'Agreement',
    schema: {
      type: 'object',
      required: ['agreementId', 'reason'],
      properties: {
        agreementId: { type: 'string' },
        reason: { type: 'string' },
      },
    },
    requiredPermissions: ['agreement:terminate'],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as any;
      const eventStore = context.eventStore as any;
      
      const event = await eventStore.append({
        type: 'AgreementTerminated',
        aggregateType: 'Agreement' as any,
        aggregateId: payload.agreementId,
        aggregateVersion: 1,
        actor: intent.actor,
        timestamp: intent.timestamp || Date.now(),
        payload: { reason: payload.reason },
      });
      
      return {
        success: true,
        outcome: { type: 'Transitioned' as const, from: 'Active', to: 'Terminated' },
        events: [event],
        affordances: [],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    },
  },
];
