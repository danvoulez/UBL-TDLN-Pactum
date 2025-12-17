/**
 * ASSET INTENTS
 * 
 * Intent handlers for asset management:
 * - register-asset: Register a new asset
 * - transfer: Transfer asset ownership/custody
 * - transition: Transition asset state
 */

import type { IntentDefinition, Intent, IntentResult, HandlerContext } from '../intent-api';
import { Ids } from '../../shared/types';
import { handleRegisterAsset } from '../intent-handlers/asset-intents';

export const ASSET_INTENTS: readonly IntentDefinition[] = [
  {
    name: 'register-asset',
    description: 'Register a new asset',
    category: 'Asset',
    schema: {
      type: 'object',
      required: ['assetType', 'properties'],
      properties: {
        assetType: { type: 'string' },
        ownerId: { type: 'string' },
        properties: { type: 'object' },
        quantity: { type: 'object' },
      },
    },
    requiredPermissions: ['Asset:create'],
    handler: handleRegisterAsset,
  },
  
  {
    name: 'transfer',
    description: 'Transfer asset ownership or custody',
    category: 'Asset',
    schema: {
      type: 'object',
      required: ['assetId', 'toEntityId', 'transferType', 'agreementId'],
      properties: {
        assetId: { type: 'string' },
        toEntityId: { type: 'string' },
        transferType: { type: 'string', enum: ['Ownership', 'Custody'] },
        agreementId: { type: 'string' },
        quantity: { type: 'object' },
      },
    },
    requiredPermissions: ['Asset:transfer'],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as any;
      const eventStore = context.eventStore as any;
      
      const event = await eventStore.append({
        type: payload.transferType === 'Ownership' ? 'OwnershipTransferred' : 'CustodyTransferred',
        aggregateType: 'Asset' as any,
        aggregateId: payload.assetId,
        aggregateVersion: 1,
        actor: intent.actor,
        timestamp: intent.timestamp || Date.now(),
        payload: {
          toEntityId: payload.toEntityId,
          agreementId: payload.agreementId,
          quantity: payload.quantity,
        },
      });
      
      return {
        success: true,
        outcome: { type: 'Transferred' as const, asset: payload.assetId, to: payload.toEntityId },
        events: [event],
        affordances: [],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    },
  },
  
  {
    name: 'transition',
    description: 'Transition an entity to a new state',
    category: 'Workflow',
    schema: {
      type: 'object',
      required: ['targetType', 'targetId', 'transition'],
      properties: {
        targetType: { type: 'string', enum: ['Agreement', 'Asset', 'Workflow'] },
        targetId: { type: 'string' },
        transition: { type: 'string' },
        payload: { type: 'object' },
      },
    },
    requiredPermissions: ['Workflow:transition'],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as any;
      const eventStore = context.eventStore as any;
      
      const event = await eventStore.append({
        type: 'StateTransitioned',
        aggregateType: payload.targetType as any,
        aggregateId: payload.targetId,
        aggregateVersion: 1,
        actor: intent.actor,
        timestamp: intent.timestamp || Date.now(),
        payload: {
          transition: payload.transition,
          data: payload.payload,
        },
      });
      
      return {
        success: true,
        outcome: { type: 'Transitioned' as const, from: 'unknown', to: payload.transition },
        events: [event],
        affordances: [],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    },
  },
];
