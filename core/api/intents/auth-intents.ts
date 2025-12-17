/**
 * AUTH INTENTS
 * 
 * Intent handlers for authentication and authorization:
 * - delegate:auth: Create a realm-scoped API key
 */

import type { IntentDefinition, Intent, IntentResult, HandlerContext } from '../intent-api';
import type { EntityId } from '../../shared/types';

export const AUTH_INTENTS: readonly IntentDefinition[] = [
  {
    name: 'delegate:auth',
    description: 'Create a realm-scoped API key for delegation',
    category: 'Entity' as any, // Authentication category
    schema: {
      type: 'object',
      required: ['realmId'],
      properties: {
        realmId: { type: 'string' },
        entityId: { type: 'string' },
        name: { type: 'string' },
        scopes: { type: 'array', items: { type: 'string' } },
        expiresInDays: { type: 'number' },
      },
    },
    requiredPermissions: ['admin'],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as any;
      const eventStore = context.eventStore as any;
      
      if (!eventStore) {
        return {
          success: false,
          outcome: { type: 'Nothing' as const, reason: 'Event store not available' },
          events: [],
          affordances: [],
          errors: [{ code: 'ERROR', message: 'Event store required' }],
          meta: { processedAt: Date.now(), processingTime: 0 },
        };
      }
      
      // Dynamically import createApiKey to avoid circular deps
      const { createApiKey } = await import('../../../antenna/admin');
      
      const keyData = await createApiKey({
        realmId: payload.realmId,
        entityId: payload.entityId || (intent.actor.type === 'Entity' ? (intent.actor as any).entityId : '' as EntityId),
        name: payload.name || `Delegated key for ${payload.realmId}`,
        scopes: payload.scopes || ['read', 'write'],
        expiresInDays: payload.expiresInDays || 365,
      }, eventStore);
      
      return {
        success: true,
        outcome: {
          type: 'Created' as const,
          entity: {
            id: keyData.apiKey.id,
            realmId: keyData.apiKey.realmId,
            name: keyData.apiKey.name,
          },
          id: keyData.apiKey.id,
        },
        events: [],
        affordances: [],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    },
  },
];
