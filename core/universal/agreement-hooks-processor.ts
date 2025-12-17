/**
 * AGREEMENT HOOKS PROCESSOR
 * 
 * Processes Agreement Type hooks when agreements transition states.
 * This ensures that hooks defined in AgreementTypeDefinition are executed
 * at the appropriate lifecycle events.
 */

import type { EntityId, ActorReference, Event, RoleContext } from '../schema/ledger';
import type { AgreementTypeDefinition, HookAction } from './agreement-types';
import type { EventStore } from '../store/event-store';
import type { AgreementTypeRegistry } from './agreement-types';
import type { ContainerManager } from './container-manager';

export interface AgreementHooksServices {
  eventStore: EventStore;
  agreementTypeRegistry: AgreementTypeRegistry;
  containerManager: ContainerManager;
}

/**
 * Process hooks for an agreement when it becomes activated
 * Returns the created realm ID if CreateRealm hook was executed
 */
export async function processAgreementActivatedHooks(
  agreementId: EntityId,
  agreementType: string,
  agreementState: any, // Agreement aggregate state
  services: AgreementHooksServices
): Promise<{ createdRealmId?: EntityId }> {
  const agreementTypeDef = services.agreementTypeRegistry.get(agreementType);
  if (!agreementTypeDef || !agreementTypeDef.hooks?.onActivated) {
    return {}; // No hooks to process
  }

  const hooks = agreementTypeDef.hooks.onActivated || [];
  let createdRealmId: EntityId | undefined;
  
  // Process hooks first (e.g., CreateRealm)
  for (const hook of hooks) {
    const result = await executeHookAction(hook, agreementId, agreementState, services);
    if (result?.createdRealmId) {
      createdRealmId = result.createdRealmId;
    }
  }
  
  // Process grantsRoles to create roles
  if (agreementTypeDef.grantsRoles && agreementTypeDef.grantsRoles.length > 0) {
    await processGrantsRoles(agreementId, agreementTypeDef, agreementState, services, createdRealmId);
  }
  
  return { createdRealmId };
}

/**
 * Execute a single hook action
 */
async function executeHookAction(
  hook: HookAction,
  agreementId: EntityId,
  agreementState: any,
  services: AgreementHooksServices
): Promise<{ createdRealmId?: EntityId; apiKey?: string } | void> {
  switch (hook.type) {
    case 'CreateRealm':
      return await executeCreateRealmHook(hook, agreementId, agreementState, services);
    
    case 'CreateApiKey':
      return await executeCreateApiKeyHook(hook, agreementId, agreementState, services);
    
    case 'GrantPlatformAccess':
      // Platform access is granted via the role system (grantsRoles)
      // This hook is a no-op placeholder for explicit documentation
      console.log(`Platform access granted via agreement ${agreementId}`);
      break;
    
    case 'TransferAssets':
      // TODO: Implement asset transfer hook
      console.warn(`Hook type 'TransferAssets' not yet implemented`);
      break;
    
    case 'TransferCustody':
      // TODO: Implement custody transfer hook
      console.warn(`Hook type 'TransferCustody' not yet implemented`);
      break;
    
    default:
      console.warn(`Unknown hook type: ${hook.type}`);
  }
}

/**
 * Execute CreateRealm hook
 * Creates a realm when tenant-license agreement is activated
 */
async function executeCreateRealmHook(
  hook: HookAction,
  agreementId: EntityId,
  agreementState: any,
  services: AgreementHooksServices
): Promise<{ createdRealmId: EntityId }> {
  const config = hook.config as { nameFrom?: string };
  
  // Extract realm name from agreement terms
  let realmName = 'Unnamed Realm';
  if (config?.nameFrom) {
    // Support paths like 'terms.realmName' or 'terms.clauses[0].content'
    const pathParts = config.nameFrom.split('.');
    let value: any = agreementState.terms;
    
    for (const part of pathParts.slice(1)) { // Skip 'terms'
      if (part.includes('[') && part.includes(']')) {
        // Array access like 'clauses[0]'
        const [key, indexStr] = part.split('[');
        const index = parseInt(indexStr.replace(']', ''), 10);
        value = value?.[key]?.[index];
      } else {
        value = value?.[part];
      }
    }
    
    if (typeof value === 'string') {
      realmName = value;
    }
  }
  
  // Extract realm config from agreement terms if available
  const realmConfig: any = {};
  if (agreementState.terms?.realmConfig) {
    Object.assign(realmConfig, agreementState.terms.realmConfig);
  }
  
  // Create realm via container manager (Realm = Container with Realm physics)
  const { PRIMORDIAL_REALM_ID } = await import('./bootstrap');
  const systemActor: ActorReference = { type: 'System', systemId: 'agreement-hooks' } as any;
  
  const realm = await services.containerManager.createRealm(
    realmName,
    systemActor,
    PRIMORDIAL_REALM_ID // Parent realm
  );
  
  console.log(`Realm ${realm.id} created via tenant-license agreement ${agreementId}`);
  
  return { createdRealmId: realm.id };
}

/**
 * Process grantsRoles to create RoleGranted events
 */
async function processGrantsRoles(
  agreementId: EntityId,
  agreementTypeDef: AgreementTypeDefinition,
  agreementState: any,
  services: AgreementHooksServices,
  createdRealmId?: EntityId
): Promise<void> {
  if (!agreementTypeDef.grantsRoles) {
    return;
  }
  
  for (const roleGrant of agreementTypeDef.grantsRoles) {
    // Find the party with the specified role
    const party = agreementState.parties?.find(
      (p: any) => p.role === roleGrant.participantRole
    );
    
    if (!party) {
      console.warn(`Party with role '${roleGrant.participantRole}' not found in agreement ${agreementId}`);
      continue;
    }
    
    const holderId = party.entityId;
    
    // Determine role scope
    // Note: RoleContext doesn't have 'Realm' type, so we use 'Global' for realm-scoped roles
    // The realm context is implicit through the agreement and the realm created by the hook
    let scope: RoleContext;
    if (roleGrant.scope === 'realm') {
      // Realm-scoped roles are Global in the RoleContext type system
      // The actual realm association is maintained through the agreement
      scope = { type: 'Global' };
    } else if (roleGrant.scope === 'agreement') {
      scope = { type: 'Agreement', agreementId: agreementId };
    } else if (typeof roleGrant.scope === 'object' && roleGrant.scope.type === 'Organization') {
      scope = { type: 'Organization', organizationId: (roleGrant.scope as any).targetId };
    } else if (typeof roleGrant.scope === 'object' && roleGrant.scope.type === 'Asset') {
      scope = { type: 'Asset', assetId: (roleGrant.scope as any).targetId };
    } else {
      scope = { type: 'Global' };
    }
    
    // Determine validity
    const now = Date.now();
    let validFrom = now;
    let validUntil: number | undefined;
    
    if (roleGrant.validity === 'agreement') {
      validFrom = agreementState.validity?.effectiveFrom || now;
      validUntil = agreementState.validity?.effectiveUntil;
    } else if (roleGrant.validity === 'custom' && roleGrant.customValidity) {
      validFrom = roleGrant.customValidity.effectiveFrom || now;
      validUntil = roleGrant.customValidity.effectiveUntil;
    }
    
    // Create RoleGranted event
    // According to ORIGINAL philosophy: roles are established by agreements, so the actor should be the agreement parties
    // Use the party that holds the role being granted as the actor (the role holder is the one receiving the role)
    const roleId = generateId('role');
    const latestRoleEvent = await services.eventStore.getLatest('Role' as any, roleId);
    const nextRoleVersion = latestRoleEvent ? latestRoleEvent.aggregateVersion + 1 : 1;
    
    await services.eventStore.append({
      type: 'RoleGranted',
      aggregateId: roleId,
      aggregateType: 'Role' as any,
      aggregateVersion: nextRoleVersion,
      payload: {
        type: 'RoleGranted',
        roleType: roleGrant.roleType,
        holderId,
        context: scope,
        validFrom,
        validUntil,
        grantedBy: agreementId,
      },
      // Use the party receiving the role as actor (follows ORIGINAL: actor is the entity performing the action)
      // The role is granted BY the agreement, but the ACTION (receiving the role) is performed BY the holder
      actor: { type: 'Entity', entityId: holderId } as ActorReference,
      timestamp: now,
    });
    
    console.log(`Role '${roleGrant.roleType}' granted to ${holderId} via agreement ${agreementId}`);
  }
}

function generateId(prefix: string): EntityId {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${timestamp}-${random}` as EntityId;
}

