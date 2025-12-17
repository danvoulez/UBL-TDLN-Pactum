/**
 * ENTITY INTENTS
 * 
 * Intent handlers for entity registration and management.
 */

import type { IntentDefinition, Intent, IntentResult, HandlerContext } from '../intent-api';
import { Ids } from '../../shared/types';
import type { EntityId } from '../../shared/types';
import { PLATFORM_ACCESS_TYPE } from '../../universal/agreement-types';

export const ENTITY_INTENTS: readonly IntentDefinition[] = [
  {
    name: 'register',
    description: 'Register a new entity (person, organization, system)',
    category: 'Entity',
    schema: {
      type: 'object',
      required: ['entityType', 'identity'],
      properties: {
        entityType: { type: 'string', enum: ['Person', 'Organization', 'System', 'Department', 'Device'] },
        identity: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            identifiers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  scheme: { type: 'string' },
                  value: { type: 'string' },
                  verified: { type: 'boolean' },
                },
              },
            },
            contacts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  value: { type: 'string' },
                },
              },
            },
            attributes: { type: 'object' },
          },
        },
        establishedBy: { type: 'string', description: 'Agreement ID that establishes this entity' },
        meta: { type: 'object' },
      },
    },
    requiredPermissions: ['Entity:create'],
    examples: [
      {
        entityType: 'Person',
        identity: {
          name: 'João Silva',
          identifiers: [{ scheme: 'CPF', value: '123.456.789-00', verified: true }],
          contacts: [{ type: 'email', value: 'joao@example.com' }],
        },
      },
      {
        entityType: 'Organization',
        identity: {
          name: 'Acme Corp',
          identifiers: [{ scheme: 'CNPJ', value: '12.345.678/0001-90', verified: true }],
        },
      },
    ],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const entityId = Ids.entity();
      const eventStore = context.eventStore as any;
      const payload = intent.payload as any;
      
      // Get current aggregate version
      const latestEvent = await eventStore.getLatest?.('Party' as any, entityId);
      const nextAggregateVersion = latestEvent ? latestEvent.aggregateVersion + 1 : 1;
      
      // Create PartyRegistered event
      const event = await eventStore.append({
        type: 'PartyRegistered',
        aggregateType: 'Party' as any,
        aggregateId: entityId,
        aggregateVersion: nextAggregateVersion,
        actor: intent.actor,
        timestamp: intent.timestamp || Date.now(),
        payload: {
          entityType: payload.entityType,
          identity: payload.identity,
          establishedBy: payload.establishedBy,
          meta: payload.meta,
        },
      });
      
      // ─────────────────────────────────────────────────────────────────────
      // AUTO-CREATE PLATFORM ACCESS AGREEMENT
      // This is the "onboarding bundle" - grants basic platform access
      // including chat/AI interaction, session creation, etc.
      // ─────────────────────────────────────────────────────────────────────
      const platformAccessAgreementId = Ids.agreement();
      const platformAccessEvent = await eventStore.append({
        type: 'AgreementProposed',
        aggregateType: 'Agreement' as any,
        aggregateId: platformAccessAgreementId,
        aggregateVersion: 1,
        actor: { type: 'System', systemId: 'registration-handler' },
        timestamp: Date.now(),
        payload: {
          agreementType: PLATFORM_ACCESS_TYPE.id,
          parties: [
            { entityId: 'system' as EntityId, role: 'Platform', consent: { givenAt: Date.now(), method: 'Implicit' } },
            { entityId, role: 'User', consent: { givenAt: Date.now(), method: 'Implicit' } },
          ],
          terms: {
            description: 'Platform access agreement granting basic chat and AI interaction capabilities',
            grantedPermissions: PLATFORM_ACCESS_TYPE.grantsRoles?.[0]?.permissions || [],
          },
          validity: {
            effectiveFrom: Date.now(),
          },
          autoActivate: true,
        },
      });
      
      // Auto-activate the platform access agreement
      const platformAccessActivatedEvent = await eventStore.append({
        type: 'AgreementActivated',
        aggregateType: 'Agreement' as any,
        aggregateId: platformAccessAgreementId,
        aggregateVersion: 2,
        actor: { type: 'System', systemId: 'registration-handler' },
        timestamp: Date.now(),
        payload: {
          activatedAt: Date.now(),
          reason: 'Auto-activated on registration',
        },
      });
      
      return {
        success: true,
        outcome: { 
          type: 'Created' as const, 
          entity: {
            id: entityId,
            type: payload.entityType,
            identity: payload.identity,
            platformAccessAgreementId,
          }, 
          id: entityId,
        },
        events: [event, platformAccessEvent, platformAccessActivatedEvent],
        affordances: [
          { intent: 'propose', description: 'Create an agreement involving this entity', required: ['agreementType', 'parties'] },
          { intent: 'chat', description: 'Start a conversation with the AI assistant', required: [] },
        ],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    },
  },
];
