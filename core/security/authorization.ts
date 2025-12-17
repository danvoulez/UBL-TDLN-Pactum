/**
 * AUTHORIZATION - Agreement-Based Access Control (ABAC)
 * 
 * Traditional RBAC:
 *   User → has → Roles → have → Permissions → control → Resources
 *   (Static, opaque, hard to audit)
 * 
 * Our system (ABAC - Agreement-Based):
 *   Entity → holds → Role (via Agreement) → grants → Permissions → in Scope
 *   (Dynamic, traceable, fully auditable)
 * 
 * Key differences:
 * 1. Roles are NOT attributes - they are relationships established by Agreements
 * 2. Every permission is traceable to the Agreement that granted it
 * 3. Roles have temporal validity (can expire, be revoked)
 * 4. Roles have scope (realm, organization, asset, specific agreement)
 * 5. Permissions can be conditional
 * 6. The entire authorization history is in the event log
 */

import type { EntityId, Timestamp, ActorReference, AggregateType } from '../schema/ledger';
import type { Role, RoleScope, Permission, Agreement, Entity } from '../universal/primitives';

// ============================================================================
// AUTHORIZATION REQUEST
// ============================================================================

/**
 * An authorization request asks: "Can this actor do this action on this resource?"
 */
export interface AuthorizationRequest {
  /** Who is trying to do something */
  readonly actor: ActorReference;
  
  /** What they're trying to do */
  readonly action: Action;
  
  /** What they're trying to do it to */
  readonly resource: Resource;
  
  /** In what context */
  readonly context: AuthorizationContext;
}

export interface Action {
  /** The action verb */
  readonly type: ActionType;
  
  /** Specific operation (for custom actions) */
  readonly operation?: string;
  
  /** Intent that triggered this (for audit) */
  readonly intent?: string;
}

export type ActionType = 
  // CRUD
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  // Workflow
  | 'transition'
  | 'approve'
  | 'reject'
  // Agreement-specific
  | 'propose'
  | 'consent'
  | 'fulfill'
  | 'terminate'
  // Asset-specific
  | 'transfer'
  | 'reserve'
  // Role-specific
  | 'grant'
  | 'revoke'
  | 'delegate'
  // Admin
  | 'admin'
  | 'configure'
  // Custom
  | 'custom';

export interface Resource {
  /** Type of resource */
  readonly type: ResourceType;
  
  /** Specific resource ID (if applicable) */
  readonly id?: EntityId;
  
  /** Resource attributes (for ABAC conditions) */
  readonly attributes?: Record<string, unknown>;
}

export type ResourceType = 
  | 'Entity'
  | 'Agreement'
  | 'Asset'
  | 'Role'
  | 'Workflow'
  | 'Realm'
  | 'Event'
  | 'Memory'
  | 'Configuration'
  | 'Workspace'
  | '*'; // Wildcard

/**
 * Workspace-specific resources
 */
export const WORKSPACE_RESOURCES = {
  'Workspace:*': 'All workspace operations',
  'Workspace:Content': 'Workspace content (files)',
  'Workspace:Members': 'Workspace membership',
  'Workspace:Function': 'Workspace functions',
  'Workspace:Git': 'Git operations',
  'Workspace:File': 'File operations',
} as const;

export interface AuthorizationContext {
  /** Current realm */
  readonly realm: EntityId;
  
  /** Current time (for temporal checks) */
  readonly timestamp: Timestamp;
  
  /** Request correlation ID (for audit) */
  readonly correlationId: EntityId;
  
  /** Additional context */
  readonly attributes?: Record<string, unknown>;
}

// ============================================================================
// AUTHORIZATION DECISION
// ============================================================================

export interface AuthorizationDecision {
  /** Is the action allowed? */
  readonly allowed: boolean;
  
  /** Why was this decision made? */
  readonly reason: DecisionReason;
  
  /** Which permission(s) granted access (if allowed) */
  readonly grantedBy?: readonly PermissionGrant[];
  
  /** What roles were evaluated */
  readonly evaluatedRoles: readonly EvaluatedRole[];
  
  /** Conditions that were checked */
  readonly evaluatedConditions: readonly EvaluatedCondition[];
  
  /** Audit trail */
  readonly audit: AuthorizationAudit;
}

export interface DecisionReason {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export interface PermissionGrant {
  readonly roleId: EntityId;
  readonly roleType: string;
  readonly permission: Permission;
  readonly agreementId: EntityId; // The agreement that established the role
  readonly scope: RoleScope;
}

export interface EvaluatedRole {
  readonly roleId: EntityId;
  readonly roleType: string;
  readonly isActive: boolean;
  readonly inScope: boolean;
  readonly hasPermission: boolean;
  readonly reason?: string;
}

export interface EvaluatedCondition {
  readonly condition: string;
  readonly result: boolean;
  readonly reason?: string;
}

export interface AuthorizationAudit {
  readonly requestId: EntityId;
  readonly timestamp: Timestamp;
  readonly actor: ActorReference;
  readonly action: Action;
  readonly resource: Resource;
  readonly decision: 'Allow' | 'Deny';
  readonly durationMs: number;
}

// ============================================================================
// AUTHORIZATION ENGINE
// ============================================================================

export interface AuthorizationEngine {
  /**
   * Check if an action is authorized
   */
  authorize(request: AuthorizationRequest): Promise<AuthorizationDecision>;
  
  /**
   * Get all permissions for an actor in a context
   */
  getEffectivePermissions(
    actor: ActorReference,
    context: AuthorizationContext
  ): Promise<readonly EffectivePermission[]>;
  
  /**
   * Get all actions an actor can perform on a resource
   */
  getAllowedActions(
    actor: ActorReference,
    resource: Resource,
    context: AuthorizationContext
  ): Promise<readonly ActionType[]>;
  
  /**
   * Check if actor has a specific role
   */
  hasRole(
    actor: ActorReference,
    roleType: string,
    scope?: RoleScope
  ): Promise<boolean>;
  
  /**
   * Get the audit trail for authorization decisions
   */
  getAuditTrail(query: AuditQuery): Promise<readonly AuthorizationAudit[]>;
}

export interface EffectivePermission {
  readonly permission: Permission;
  readonly grantedBy: PermissionGrant;
  readonly expiresAt?: Timestamp;
  readonly conditions?: readonly PermissionCondition[];
}

export interface PermissionCondition {
  readonly type: string;
  readonly parameters: Record<string, unknown>;
  readonly description: string;
}

export interface AuditQuery {
  readonly actor?: ActorReference;
  readonly resource?: Resource;
  readonly action?: ActionType;
  readonly decision?: 'Allow' | 'Deny';
  readonly timeRange?: { from?: Timestamp; to?: Timestamp };
  readonly limit?: number;
}

// ============================================================================
// AUTHORIZATION ENGINE IMPLEMENTATION
// ============================================================================

export function createAuthorizationEngine(
  roleStore: RoleStore,
  policyEngine: PolicyEngine,
  auditLogger: AuthorizationAuditLogger
): AuthorizationEngine {
  return {
    async authorize(request: AuthorizationRequest): Promise<AuthorizationDecision> {
      const startTime = Date.now();
      const requestId = generateRequestId();
      
      // 1. Get all active roles for the actor
      const roles = await roleStore.getActiveRoles(
        request.actor,
        request.context.realm,
        request.context.timestamp
      );
      
      const evaluatedRoles: EvaluatedRole[] = [];
      const grantedBy: PermissionGrant[] = [];
      const evaluatedConditions: EvaluatedCondition[] = [];
      
      // 2. For each role, check if it grants the required permission
      for (const role of roles) {
        const evaluation: EvaluatedRole = {
          roleId: role.id,
          roleType: role.roleType,
          isActive: role.isActive,
          inScope: isScopeValid(role.scope, request.resource, request.context),
          hasPermission: false,
        };
        
        if (!evaluation.isActive) {
          evaluation.reason = 'Role is not active';
          evaluatedRoles.push(evaluation);
          continue;
        }
        
        if (!evaluation.inScope) {
          evaluation.reason = 'Role scope does not match resource';
          evaluatedRoles.push(evaluation);
          continue;
        }
        
        // Check permissions
        for (const permission of role.permissions) {
          if (permissionMatches(permission, request.action, request.resource)) {
            // Check conditions
            const conditionResults = await evaluateConditions(
              permission.conditions || [],
              request,
              role
            );
            
            evaluatedConditions.push(...conditionResults);
            
            if (conditionResults.every(c => c.result)) {
              evaluation.hasPermission = true;
              grantedBy.push({
                roleId: role.id,
                roleType: role.roleType,
                permission,
                agreementId: role.establishedBy,
                scope: role.scope,
              });
            }
          }
        }
        
        evaluatedRoles.push(evaluation);
      }
      
      // 3. Check policies (can override role-based decisions)
      const policyDecision = await policyEngine.evaluate(request, roles);
      
      // 4. Make final decision
      const allowed = grantedBy.length > 0 && policyDecision.allowed;
      
      const decision: AuthorizationDecision = {
        allowed,
        reason: allowed
          ? { code: 'GRANTED', message: `Granted by ${grantedBy.length} permission(s)` }
          : policyDecision.reason || { code: 'DENIED', message: 'No matching permissions' },
        grantedBy: allowed ? grantedBy : undefined,
        evaluatedRoles,
        evaluatedConditions,
        audit: {
          requestId,
          timestamp: request.context.timestamp,
          actor: request.actor,
          action: request.action,
          resource: request.resource,
          decision: allowed ? 'Allow' : 'Deny',
          durationMs: Date.now() - startTime,
        },
      };
      
      // 5. Log for audit
      await auditLogger.log(decision.audit);
      
      return decision;
    },
    
    async getEffectivePermissions(
      actor: ActorReference,
      context: AuthorizationContext
    ): Promise<readonly EffectivePermission[]> {
      const roles = await roleStore.getActiveRoles(actor, context.realm, context.timestamp);
      const permissions: EffectivePermission[] = [];
      
      for (const role of roles) {
        for (const permission of role.permissions) {
          permissions.push({
            permission,
            grantedBy: {
              roleId: role.id,
              roleType: role.roleType,
              permission,
              agreementId: role.establishedBy,
              scope: role.scope,
            },
            expiresAt: role.validity.until,
            conditions: permission.conditions?.map(c => ({
              type: c.type,
              parameters: c.parameters,
              description: describeCondition(c),
            })),
          });
        }
      }
      
      return permissions;
    },
    
    async getAllowedActions(
      actor: ActorReference,
      resource: Resource,
      context: AuthorizationContext
    ): Promise<readonly ActionType[]> {
      const actions: Set<ActionType> = new Set();
      const allActions: ActionType[] = [
        'create', 'read', 'update', 'delete',
        'transition', 'approve', 'reject',
        'propose', 'consent', 'fulfill', 'terminate',
        'transfer', 'reserve',
        'grant', 'revoke', 'delegate',
        'admin', 'configure',
      ];
      
      for (const actionType of allActions) {
        const decision = await this.authorize({
          actor,
          action: { type: actionType },
          resource,
          context,
        });
        
        if (decision.allowed) {
          actions.add(actionType);
        }
      }
      
      return Array.from(actions);
    },
    
    async hasRole(
      actor: ActorReference,
      roleType: string,
      scope?: RoleScope
    ): Promise<boolean> {
      if (actor.type !== 'Party') return false;
      
      const roles = await roleStore.getRolesByHolder(actor.partyId);
      
      return roles.some(r => 
        r.roleType === roleType && 
        r.isActive &&
        (!scope || scopeMatches(r.scope, scope))
      );
    },
    
    async getAuditTrail(query: AuditQuery): Promise<readonly AuthorizationAudit[]> {
      return auditLogger.query(query);
    },
  };
}

// ============================================================================
// SUPPORTING INTERFACES
// ============================================================================

export interface RoleStore {
  /** Get all active roles for an actor */
  getActiveRoles(
    actor: ActorReference,
    realm: EntityId,
    at: Timestamp
  ): Promise<readonly Role[]>;
  
  /** Get roles by holder */
  getRolesByHolder(holderId: EntityId): Promise<readonly Role[]>;
  
  /** Get role by ID */
  getRole(roleId: EntityId): Promise<Role | null>;
}

export interface PolicyEngine {
  /** Evaluate policies against a request */
  evaluate(
    request: AuthorizationRequest,
    roles: readonly Role[]
  ): Promise<PolicyDecision>;
}

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason?: DecisionReason;
  readonly matchedPolicies: readonly string[];
}

export interface AuthorizationAuditLogger {
  /** Log an authorization decision */
  log(audit: AuthorizationAudit): Promise<void>;
  
  /** Query audit logs */
  query(query: AuditQuery): Promise<readonly AuthorizationAudit[]>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isScopeValid(
  roleScope: RoleScope,
  resource: Resource,
  context: AuthorizationContext
): boolean {
  switch (roleScope.type) {
    case 'Global':
      return true;
      
    case 'Realm':
      return roleScope.targetId === context.realm;
      
    case 'Entity':
      return resource.type === 'Entity' && resource.id === roleScope.targetId;
      
    case 'Agreement':
      return resource.type === 'Agreement' && resource.id === roleScope.targetId;
      
    case 'Asset':
      return resource.type === 'Asset' && resource.id === roleScope.targetId;
      
    default:
      return false;
  }
}

function scopeMatches(scope1: RoleScope, scope2: RoleScope): boolean {
  if (scope1.type !== scope2.type) return false;
  if (scope1.type === 'Global') return true;
  return scope1.targetId === scope2.targetId;
}

function permissionMatches(
  permission: Permission,
  action: Action,
  resource: Resource
): boolean {
  // Check action
  if (permission.action !== '*' && permission.action !== action.type) {
    return false;
  }
  
  // Check resource type
  if (permission.resource !== '*') {
    const [permResourceType, permResourceId] = permission.resource.split(':');
    
    if (permResourceType !== resource.type && permResourceType !== '*') {
      return false;
    }
    
    if (permResourceId && permResourceId !== '*' && permResourceId !== resource.id) {
      return false;
    }
  }
  
  return true;
}

async function evaluateConditions(
  conditions: readonly { type: string; parameters: Record<string, unknown> }[],
  request: AuthorizationRequest,
  role: Role
): Promise<EvaluatedCondition[]> {
  const results: EvaluatedCondition[] = [];
  
  for (const condition of conditions) {
    const result = await evaluateCondition(condition, request, role);
    results.push({
      condition: describeCondition(condition),
      result,
      reason: result ? 'Condition satisfied' : 'Condition not met',
    });
  }
  
  return results;
}

async function evaluateCondition(
  condition: { type: string; parameters: Record<string, unknown> },
  request: AuthorizationRequest,
  role: Role
): Promise<boolean> {
  switch (condition.type) {
    case 'TimeOfDay':
      const hour = new Date(request.context.timestamp).getHours();
      const { startHour, endHour } = condition.parameters as { startHour: number; endHour: number };
      return hour >= startHour && hour < endHour;
      
    case 'DayOfWeek':
      const day = new Date(request.context.timestamp).getDay();
      const { allowedDays } = condition.parameters as { allowedDays: number[] };
      return allowedDays.includes(day);
      
    case 'IpRange':
      // Would check IP range in real implementation
      return true;
      
    case 'ResourceOwner':
      // Check if actor is owner of resource
      const { ownerField } = condition.parameters as { ownerField: string };
      return request.resource.attributes?.[ownerField] === 
        (request.actor.type === 'Party' ? request.actor.partyId : null);
      
    case 'AgreementParty':
      // Check if actor is party to the agreement
      // Would query agreement in real implementation
      return true;
      
    case 'Custom':
      // Custom condition evaluation
      return true;
      
    default:
      return true;
  }
}

function describeCondition(condition: { type: string; parameters: Record<string, unknown> }): string {
  switch (condition.type) {
    case 'TimeOfDay':
      const { startHour, endHour } = condition.parameters as { startHour: number; endHour: number };
      return `Time must be between ${startHour}:00 and ${endHour}:00`;
      
    case 'DayOfWeek':
      const { allowedDays } = condition.parameters as { allowedDays: number[] };
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return `Day must be: ${allowedDays.map(d => days[d]).join(', ')}`;
      
    case 'ResourceOwner':
      return 'Actor must be the resource owner';
      
    case 'AgreementParty':
      return 'Actor must be a party to the agreement';
      
    default:
      return `Custom condition: ${condition.type}`;
  }
}

function generateRequestId(): EntityId {
  return `authz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` as EntityId;
}

// ============================================================================
// BUILT-IN PERMISSION SETS
// ============================================================================

/**
 * Standard permission sets that can be granted via agreements
 */
export const PERMISSION_SETS = {
  /** Founder - owns the system, can create realms, delegate everything */
  Founder: [
    { action: '*', resource: '*' },
    { action: 'create', resource: 'Realm' },
    { action: 'delegate', resource: '*' },
    { action: 'grant', resource: 'Role:Admin' },
    { action: 'grant', resource: 'Role:RealmAdmin' },
  ] as Permission[],
  
  /** Full administrative access (within a realm) */
  Admin: [
    { action: '*', resource: '*' },
  ] as Permission[],
  
  /** Realm administrator */
  RealmAdmin: [
    { action: 'admin', resource: 'Realm:*' },
    { action: 'create', resource: 'Entity' },
    { action: 'create', resource: 'Agreement' },
    { action: 'create', resource: 'Asset' },
    { action: 'read', resource: '*' },
    { action: 'configure', resource: 'Realm:*' },
  ] as Permission[],
  
  /** Standard member */
  Member: [
    { action: 'read', resource: 'Entity:*' },
    { action: 'read', resource: 'Agreement:*' },
    { action: 'read', resource: 'Asset:*' },
    { action: 'propose', resource: 'Agreement' },
    { action: 'consent', resource: 'Agreement:*' },
    { action: 'create', resource: 'Session:*' },
    { action: 'use', resource: 'Chat:*' },
  ] as Permission[],
  
  /** Read-only access */
  Viewer: [
    { action: 'read', resource: '*' },
  ] as Permission[],
  
  /** Agreement party permissions */
  AgreementParty: [
    { action: 'read', resource: 'Agreement:*' },
    { action: 'consent', resource: 'Agreement:*' },
    { action: 'fulfill', resource: 'Agreement:*' },
    { action: 'terminate', resource: 'Agreement:*' },
  ] as Permission[],
  
  /** Asset owner permissions */
  AssetOwner: [
    { action: 'read', resource: 'Asset:*' },
    { action: 'update', resource: 'Asset:*' },
    { action: 'transfer', resource: 'Asset:*' },
    { action: 'delete', resource: 'Asset:*' },
  ] as Permission[],
  
  /** Employee standard permissions */
  Employee: [
    { action: 'read', resource: 'Entity:*' },
    { action: 'read', resource: 'Agreement:*' },
    { action: 'read', resource: 'Asset:*' },
    { action: 'propose', resource: 'Agreement' },
    { action: 'create', resource: 'Asset' },
  ] as Permission[],
  
  /** Manager permissions (extends Employee) */
  Manager: [
    { action: 'read', resource: '*' },
    { action: 'create', resource: 'Entity' },
    { action: 'propose', resource: 'Agreement' },
    { action: 'approve', resource: 'Agreement:*' },
    { action: 'grant', resource: 'Role' },
    { action: 'transition', resource: 'Workflow:*' },
  ] as Permission[],
  
  /** Auditor permissions */
  Auditor: [
    { action: 'read', resource: '*' },
    { action: 'read', resource: 'Event:*' },
    { action: 'read', resource: 'Memory:*' },
  ] as Permission[],
};

// ============================================================================
// ROLE TEMPLATES
// ============================================================================

/**
 * Standard role types that can be granted via agreements
 */
export const ROLE_TEMPLATES = {
  // Founder role - highest level, owns the system
  Founder: {
    roleType: 'Founder',
    permissions: PERMISSION_SETS.Founder,
    delegatable: true, // Can delegate to create Admins
    description: 'System founder - can create realms and delegate admin roles',
  },
  
  // System roles
  SystemAdmin: {
    roleType: 'SystemAdmin',
    permissions: PERMISSION_SETS.Admin,
    delegatable: false,
  },
  
  // Realm roles
  TenantAdmin: {
    roleType: 'TenantAdmin',
    permissions: PERMISSION_SETS.RealmAdmin,
    delegatable: true,
  },
  
  // Membership roles
  Member: {
    roleType: 'Member',
    permissions: PERMISSION_SETS.Member,
    delegatable: false,
  },
  
  Viewer: {
    roleType: 'Viewer',
    permissions: PERMISSION_SETS.Viewer,
    delegatable: false,
  },
  
  // Employment roles
  Employee: {
    roleType: 'Employee',
    permissions: PERMISSION_SETS.Employee,
    delegatable: false,
  },
  
  Manager: {
    roleType: 'Manager',
    permissions: PERMISSION_SETS.Manager,
    delegatable: true,
  },
  
  // Specialized roles
  Auditor: {
    roleType: 'Auditor',
    permissions: PERMISSION_SETS.Auditor,
    delegatable: false,
  },
  
  // Dynamic roles (granted per-agreement)
  AgreementParty: {
    roleType: 'AgreementParty',
    permissions: PERMISSION_SETS.AgreementParty,
    delegatable: false,
  },
  
  AssetOwner: {
    roleType: 'AssetOwner',
    permissions: PERMISSION_SETS.AssetOwner,
    delegatable: true,
  },
};

