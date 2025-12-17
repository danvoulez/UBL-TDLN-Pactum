/**
 * ASSET INTENT HANDLERS
 * 
 * Intent handlers for asset operations, including Workspace support.
 */

import type { EntityId, ActorReference } from '../../shared/types';
import type { Intent, IntentResult, HandlerContext, RegisterAssetIntent } from '../intent-api';
import type { WorkspaceStorage } from '../../sandbox/storage';
import { Ids } from '../../shared/types';

/**
 * Handle register-asset intent with Workspace support
 */
export async function handleRegisterAsset(
  intent: Intent<RegisterAssetIntent>,
  context: HandlerContext
): Promise<IntentResult> {
  const startTime = Date.now();
  
  try {
    // Check if this is a Workspace asset
    if (intent.payload.assetType === 'Workspace') {
      return await handleRegisterWorkspace(intent, context);
    }
    
    // Default asset registration (existing behavior)
    const assetId = Ids.asset();
    const eventStore = context.eventStore as any;
    
    // Get current aggregate version (first event = 1)
    const latestEvent = await eventStore.getLatest('Asset' as any, assetId);
    const nextAggregateVersion = latestEvent ? latestEvent.aggregateVersion + 1 : 1;
    
    const event = await eventStore.append({
      type: 'AssetRegistered',
      aggregateType: 'Asset',
      aggregateId: assetId,
      aggregateVersion: nextAggregateVersion,
      actor: intent.actor,
      timestamp: Date.now(),
      payload: {
        assetType: intent.payload.assetType,
        ownerId: intent.payload.ownerId || (intent.actor.type === 'Entity' ? intent.actor.entityId : undefined),
        properties: intent.payload.properties,
        quantity: intent.payload.quantity,
        establishedBy: intent.payload.establishedBy,
      }
    });
    
    return {
      success: true,
      outcome: {
        type: 'Created',
        entity: { id: assetId, assetType: intent.payload.assetType },
        id: assetId
      },
      events: [event],
      affordances: [
        { intent: 'transfer', description: 'Transfer this asset', required: ['toEntityId', 'agreementId'] },
      ],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  } catch (error: any) {
    return {
      success: false,
      outcome: { type: 'Nothing', reason: error.message },
      events: [],
      affordances: [],
      errors: [{ code: 'ERROR', message: error.message }],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  }
}

/**
 * Handle Workspace asset registration
 */
async function handleRegisterWorkspace(
  intent: Intent<RegisterAssetIntent>,
  context: HandlerContext
): Promise<IntentResult> {
  const startTime = Date.now();
  
  // Extract workspace properties - handle undefined properties
  const properties = (intent.payload.properties || {}) as any;
  const workspaceId = Ids.asset();
  const name = properties?.name || properties?.identity?.name || intent.payload.name || 'Unnamed Workspace';
  const runtime = properties?.runtime || intent.payload.runtime || 'Node.js';
  const resources = properties?.resources || intent.payload.resources || {
    cpuLimit: 1,
    memoryLimit: 512,
    storageLimit: 10,
    timeoutMs: 30000,
    networkAccess: false,
    gitAccess: false,
  };
  
  const eventStore = context.eventStore as any;
  
  // Get current aggregate versions
  const latestAssetEvent = await eventStore.getLatest('Asset' as any, workspaceId);
  const nextAssetVersion = latestAssetEvent ? latestAssetEvent.aggregateVersion + 1 : 1;
  
  const latestWorkspaceEvent = await eventStore.getLatest('Workspace' as any, workspaceId);
  const nextWorkspaceVersion = latestWorkspaceEvent ? latestWorkspaceEvent.aggregateVersion + 1 : 1;
  
  // Create workspace asset
  const assetEvent = await eventStore.append({
    type: 'AssetRegistered',
    aggregateType: 'Asset' as any,
    aggregateId: workspaceId,
    aggregateVersion: nextAssetVersion,
    actor: intent.actor,
    timestamp: Date.now(),
    payload: {
      assetType: 'Workspace',
      ownerId: intent.payload.ownerId || (intent.actor.type === 'Entity' ? intent.actor.entityId : undefined),
      properties: {
        name,
        runtime,
        resources,
      },
      establishedBy: intent.payload.establishedBy,
    }
  });
  
  // Create WorkspaceCreated event
  const workspaceEvent = await eventStore.append({
    type: 'WorkspaceCreated',
    aggregateType: 'Workspace' as any,
    aggregateId: workspaceId,
    aggregateVersion: nextWorkspaceVersion,
    actor: intent.actor,
    timestamp: Date.now(),
    payload: {
      name,
      runtime,
      resources,
      createdBy: intent.actor,
    }
  });
  
  // Create workspace-membership agreement automatically
  const agreementId = Ids.agreement();
  const agreementTypeRegistry = context.agreements as any;
  const workspaceMembershipType = agreementTypeRegistry.get('workspace-membership');
  
  if (workspaceMembershipType) {
    // Get current aggregate version (first event = 1)
    const latestAgreementEvent = await eventStore.getLatest('Agreement' as any, agreementId);
    const nextAgreementVersion = latestAgreementEvent ? latestAgreementEvent.aggregateVersion + 1 : 1;
    
    const agreementEvent = await eventStore.append({
      type: 'AgreementProposed',
      aggregateType: 'Agreement' as any,
      aggregateId: agreementId,
      aggregateVersion: nextAgreementVersion,
      actor: intent.actor,
      timestamp: Date.now(),
      payload: {
        agreementType: 'workspace-membership',
        parties: [
          {
            entityId: intent.payload.ownerId || (intent.actor.type === 'Entity' ? intent.actor.entityId : '' as EntityId),
            role: 'WorkspaceOwner',
          }
        ],
        terms: {
          workspaceAssetId: workspaceId,
        },
      }
    });
    
    // Auto-consent for owner (explicitly allowed by agreement type: requiresConsent: false, consentMethods: ['Implicit'])
    // This follows ORIGINAL philosophy: consent can be "Implied" when explicitly defined in agreement type
    const ownerId = intent.payload.ownerId || (intent.actor.type === 'Entity' ? intent.actor.entityId : '' as EntityId);
    const latestConsentEvent = await eventStore.getLatest('Agreement' as any, agreementId);
    const nextConsentVersion = latestConsentEvent ? latestConsentEvent.aggregateVersion + 1 : 2;
    
    const consentEvent = await eventStore.append({
      type: 'PartyConsented',
      aggregateType: 'Agreement' as any,
      aggregateId: agreementId,
      aggregateVersion: nextConsentVersion,
      actor: { type: 'Entity', entityId: ownerId }, // Use owner entity, not intent.actor (follows ORIGINAL: actor is the party)
      timestamp: Date.now(),
      payload: {
        partyId: ownerId,
        method: 'Implicit', // Explicitly allowed by agreement type definition
      }
    });
    
    // Activate agreement (only after all required consents given)
    // According to ORIGINAL: activation happens when all required parties consent
    // For workspace-membership, only WorkspaceOwner requires consent (and it's implicit)
    const latestActivateEvent = await eventStore.getLatest('Agreement' as any, agreementId);
    const nextActivateVersion = latestActivateEvent ? latestActivateEvent.aggregateVersion + 1 : 3;
    
    const activateEvent = await eventStore.append({
      type: 'AgreementActivated',
      aggregateType: 'Agreement' as any,
      aggregateId: agreementId,
      aggregateVersion: nextActivateVersion,
      actor: { type: 'Entity', entityId: ownerId }, // Use owner entity (the party that completed consent), not System
      timestamp: Date.now(),
      payload: {
        activatedAt: Date.now(),
      }
    });
    
    return {
      success: true,
      outcome: {
        type: 'Created',
        entity: {
          id: workspaceId,
          name,
          runtime,
          agreementId,
        },
        id: workspaceId
      },
      events: [assetEvent, workspaceEvent, agreementEvent, consentEvent, activateEvent],
      affordances: [
        { intent: 'clone:repository', description: 'Clone a git repository', required: ['workspaceId', 'url'] },
        { intent: 'upload:file', description: 'Upload a file', required: ['workspaceId', 'file', 'path'] },
        { intent: 'register:function', description: 'Register a function', required: ['workspaceId', 'name', 'code'] },
      ],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  }
  
  return {
    success: true,
    outcome: {
      type: 'Created',
      entity: { id: workspaceId, name, runtime },
      id: workspaceId
    },
    events: [assetEvent, workspaceEvent],
    affordances: [
      { intent: 'clone:repository', description: 'Clone a git repository', required: ['workspaceId', 'url'] },
      { intent: 'upload:file', description: 'Upload a file', required: ['workspaceId', 'file', 'path'] },
    ],
    meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
  };
}

