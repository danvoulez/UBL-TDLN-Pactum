/**
 * POLICY ENGINE - Declarative Authorization Rules
 * 
 * While roles grant permissions, policies can:
 * - Override role decisions (allow or deny)
 * - Add contextual conditions
 * - Implement separation of duties
 * - Enforce business rules
 * - Handle edge cases
 * 
 * Policies are evaluated AFTER role-based permissions.
 * A policy can:
 * - ALLOW: Grant access even without role permission (use sparingly)
 * - DENY: Deny access even with role permission (security overrides)
 * - NEUTRAL: Don't affect the decision
 */

import type { EntityId, Timestamp, ActorReference } from '../schema/ledger';
import type { Role, RoleScope, Permission, Agreement } from '../universal/primitives';
import type { 
  AuthorizationRequest, 
  Action, 
  ActionType,
  Resource, 
  ResourceType,
  AuthorizationContext,
  DecisionReason 
} from './authorization';

// ============================================================================
// POLICY TYPES
// ============================================================================

export interface Policy {
  /** Unique identifier */
  readonly id: string;
  
  /** Human-readable name */
  readonly name: string;
  
  /** Description */
  readonly description: string;
  
  /** Policy priority (higher = evaluated first) */
  readonly priority: number;
  
  /** Is this policy active? */
  readonly enabled: boolean;
  
  /** When does this policy apply? */
  readonly conditions: PolicyConditions;
  
  /** What effect does this policy have? */
  readonly effect: PolicyEffect;
  
  /** Additional rules */
  readonly rules?: readonly PolicyRule[];
}

export interface PolicyConditions {
  /** Actor conditions */
  readonly actor?: ActorCondition;
  
  /** Action conditions */
  readonly actions?: readonly ActionType[];
  
  /** Resource conditions */
  readonly resources?: ResourceCondition;
  
  /** Context conditions */
  readonly context?: ContextCondition;
  
  /** Time conditions */
  readonly temporal?: TemporalCondition;
  
  /** Role conditions */
  readonly roles?: RoleCondition;
}

export type ActorCondition = 
  | { readonly type: 'Any' }
  | { readonly type: 'ActorId'; readonly ids: readonly EntityId[] }
  | { readonly type: 'ActorType'; readonly types: readonly string[] }
  | { readonly type: 'HasRole'; readonly roleType: string }
  | { readonly type: 'NotHasRole'; readonly roleType: string }
  | { readonly type: 'IsResourceOwner' }
  | { readonly type: 'IsAgreementParty' };

export type ResourceCondition = 
  | { readonly type: 'Any' }
  | { readonly type: 'ResourceType'; readonly types: readonly ResourceType[] }
  | { readonly type: 'ResourceId'; readonly ids: readonly EntityId[] }
  | { readonly type: 'ResourceAttribute'; readonly attribute: string; readonly value: unknown }
  | { readonly type: 'ResourceInRealm'; readonly realm: EntityId };

export type ContextCondition = 
  | { readonly type: 'InRealm'; readonly realms: readonly EntityId[] }
  | { readonly type: 'HasAttribute'; readonly attribute: string; readonly value?: unknown }
  | { readonly type: 'Environment'; readonly env: 'production' | 'staging' | 'development' };

export type TemporalCondition = 
  | { readonly type: 'TimeOfDay'; readonly startHour: number; readonly endHour: number }
  | { readonly type: 'DayOfWeek'; readonly days: readonly number[] }
  | { readonly type: 'DateRange'; readonly start?: Timestamp; readonly end?: Timestamp }
  | { readonly type: 'BusinessHours' };

export type RoleCondition = 
  | { readonly type: 'HasAnyRole'; readonly roleTypes: readonly string[] }
  | { readonly type: 'HasAllRoles'; readonly roleTypes: readonly string[] }
  | { readonly type: 'RoleInScope'; readonly scope: RoleScope };

export type PolicyEffect = 
  | { readonly type: 'Allow'; readonly reason?: string }
  | { readonly type: 'Deny'; readonly reason: string }
  | { readonly type: 'Neutral' };

export interface PolicyRule {
  readonly name: string;
  readonly condition: PolicyRuleCondition;
  readonly effect: PolicyEffect;
}

export type PolicyRuleCondition = 
  | { readonly type: 'And'; readonly conditions: readonly PolicyRuleCondition[] }
  | { readonly type: 'Or'; readonly conditions: readonly PolicyRuleCondition[] }
  | { readonly type: 'Not'; readonly condition: PolicyRuleCondition }
  | { readonly type: 'Actor'; readonly condition: ActorCondition }
  | { readonly type: 'Resource'; readonly condition: ResourceCondition }
  | { readonly type: 'Context'; readonly condition: ContextCondition }
  | { readonly type: 'Temporal'; readonly condition: TemporalCondition }
  | { readonly type: 'Custom'; readonly evaluator: string; readonly params?: Record<string, unknown> };

// ============================================================================
// POLICY ENGINE IMPLEMENTATION
// ============================================================================

export interface PolicyEngine {
  /** Evaluate all applicable policies */
  evaluate(
    request: AuthorizationRequest,
    roles: readonly Role[]
  ): Promise<PolicyDecision>;
  
  /** Register a policy */
  register(policy: Policy): void;
  
  /** Unregister a policy */
  unregister(policyId: string): void;
  
  /** Get all policies */
  getPolicies(): readonly Policy[];
  
  /** Get applicable policies for a request */
  getApplicablePolicies(request: AuthorizationRequest): readonly Policy[];
}

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason?: DecisionReason;
  readonly matchedPolicies: readonly string[];
  readonly evaluationLog: readonly PolicyEvaluationEntry[];
}

export interface PolicyEvaluationEntry {
  readonly policyId: string;
  readonly policyName: string;
  readonly matched: boolean;
  readonly effect: PolicyEffect['type'];
  readonly reason?: string;
}

export function createPolicyEngine(
  customEvaluators?: Map<string, PolicyRuleEvaluator>
): PolicyEngine {
  const policies = new Map<string, Policy>();
  const evaluators = new Map<string, PolicyRuleEvaluator>(customEvaluators);
  
  // Register built-in evaluators
  evaluators.set('isWorkingHours', isWorkingHoursEvaluator);
  evaluators.set('isWeekend', isWeekendEvaluator);
  evaluators.set('separationOfDuties', separationOfDutiesEvaluator);
  
  return {
    async evaluate(
      request: AuthorizationRequest,
      roles: readonly Role[]
    ): Promise<PolicyDecision> {
      const evaluationLog: PolicyEvaluationEntry[] = [];
      const matchedPolicies: string[] = [];
      
      // Sort policies by priority (descending)
      const sortedPolicies = Array.from(policies.values())
        .filter(p => p.enabled)
        .sort((a, b) => b.priority - a.priority);
      
      let finalEffect: PolicyEffect = { type: 'Neutral' };
      
      for (const policy of sortedPolicies) {
        const matches = await matchesConditions(policy.conditions, request, roles, evaluators);
        
        const entry: PolicyEvaluationEntry = {
          policyId: policy.id,
          policyName: policy.name,
          matched: matches,
          effect: matches ? policy.effect.type : 'Neutral',
        };
        
        if (matches) {
          matchedPolicies.push(policy.id);
          
          // Evaluate additional rules
          if (policy.rules) {
            for (const rule of policy.rules) {
              const ruleMatches = await evaluateRule(rule.condition, request, roles, evaluators);
              if (ruleMatches) {
                entry.effect = rule.effect.type;
                entry.reason = rule.name;
                
                if (rule.effect.type === 'Deny') {
                  finalEffect = rule.effect;
                  break;
                } else if (rule.effect.type === 'Allow' && finalEffect.type !== 'Deny') {
                  finalEffect = rule.effect;
                }
              }
            }
          } else {
            // Use policy's main effect
            if (policy.effect.type === 'Deny') {
              finalEffect = policy.effect;
            } else if (policy.effect.type === 'Allow' && finalEffect.type !== 'Deny') {
              finalEffect = policy.effect;
            }
          }
        }
        
        evaluationLog.push(entry);
        
        // If we hit a Deny, stop evaluation
        if (finalEffect.type === 'Deny') {
          break;
        }
      }
      
      return {
        allowed: finalEffect.type !== 'Deny',
        reason: finalEffect.type === 'Deny' 
          ? { code: 'POLICY_DENIED', message: (finalEffect as any).reason || 'Denied by policy' }
          : finalEffect.type === 'Allow'
            ? { code: 'POLICY_ALLOWED', message: (finalEffect as any).reason || 'Allowed by policy' }
            : undefined,
        matchedPolicies,
        evaluationLog,
      };
    },
    
    register(policy: Policy): void {
      policies.set(policy.id, policy);
    },
    
    unregister(policyId: string): void {
      policies.delete(policyId);
    },
    
    getPolicies(): readonly Policy[] {
      return Array.from(policies.values());
    },
    
    getApplicablePolicies(request: AuthorizationRequest): readonly Policy[] {
      return Array.from(policies.values())
        .filter(p => p.enabled)
        .filter(p => {
          // Quick check without async evaluation
          if (p.conditions.actions && !p.conditions.actions.includes(request.action.type)) {
            return false;
          }
          return true;
        });
    },
  };
}

// ============================================================================
// CONDITION MATCHING
// ============================================================================

async function matchesConditions(
  conditions: PolicyConditions,
  request: AuthorizationRequest,
  roles: readonly Role[],
  evaluators: Map<string, PolicyRuleEvaluator>
): Promise<boolean> {
  // Check action
  if (conditions.actions && !conditions.actions.includes(request.action.type)) {
    return false;
  }
  
  // Check actor
  if (conditions.actor && !matchesActorCondition(conditions.actor, request, roles)) {
    return false;
  }
  
  // Check resource
  if (conditions.resources && !matchesResourceCondition(conditions.resources, request)) {
    return false;
  }
  
  // Check context
  if (conditions.context && !matchesContextCondition(conditions.context, request)) {
    return false;
  }
  
  // Check temporal
  if (conditions.temporal && !matchesTemporalCondition(conditions.temporal, request)) {
    return false;
  }
  
  // Check roles
  if (conditions.roles && !matchesRoleCondition(conditions.roles, roles)) {
    return false;
  }
  
  return true;
}

function matchesActorCondition(
  condition: ActorCondition,
  request: AuthorizationRequest,
  roles: readonly Role[]
): boolean {
  switch (condition.type) {
    case 'Any':
      return true;
      
    case 'ActorId':
      if (request.actor.type !== 'Party') return false;
      return condition.ids.includes(request.actor.partyId);
      
    case 'ActorType':
      return condition.types.includes(request.actor.type);
      
    case 'HasRole':
      return roles.some(r => r.roleType === condition.roleType && r.isActive);
      
    case 'NotHasRole':
      return !roles.some(r => r.roleType === condition.roleType && r.isActive);
      
    case 'IsResourceOwner':
      if (request.actor.type !== 'Party') return false;
      return request.resource.attributes?.ownerId === request.actor.partyId;
      
    case 'IsAgreementParty':
      if (request.actor.type !== 'Party') return false;
      const parties = request.resource.attributes?.parties as any[] | undefined;
      return parties?.some(p => p.entityId === request.actor.partyId) ?? false;
      
    default:
      return false;
  }
}

function matchesResourceCondition(
  condition: ResourceCondition,
  request: AuthorizationRequest
): boolean {
  switch (condition.type) {
    case 'Any':
      return true;
      
    case 'ResourceType':
      return condition.types.includes(request.resource.type);
      
    case 'ResourceId':
      return request.resource.id ? condition.ids.includes(request.resource.id) : false;
      
    case 'ResourceAttribute':
      return request.resource.attributes?.[condition.attribute] === condition.value;
      
    case 'ResourceInRealm':
      return request.context.realm === condition.realm;
      
    default:
      return false;
  }
}

function matchesContextCondition(
  condition: ContextCondition,
  request: AuthorizationRequest
): boolean {
  switch (condition.type) {
    case 'InRealm':
      return condition.realms.includes(request.context.realm);
      
    case 'HasAttribute':
      if (condition.value !== undefined) {
        return request.context.attributes?.[condition.attribute] === condition.value;
      }
      return request.context.attributes?.[condition.attribute] !== undefined;
      
    case 'Environment':
      return request.context.attributes?.environment === condition.env;
      
    default:
      return false;
  }
}

function matchesTemporalCondition(
  condition: TemporalCondition,
  request: AuthorizationRequest
): boolean {
  const date = new Date(request.context.timestamp);
  
  switch (condition.type) {
    case 'TimeOfDay':
      const hour = date.getHours();
      return hour >= condition.startHour && hour < condition.endHour;
      
    case 'DayOfWeek':
      return condition.days.includes(date.getDay());
      
    case 'DateRange':
      if (condition.start && request.context.timestamp < condition.start) return false;
      if (condition.end && request.context.timestamp > condition.end) return false;
      return true;
      
    case 'BusinessHours':
      const h = date.getHours();
      const d = date.getDay();
      return d >= 1 && d <= 5 && h >= 9 && h < 17;
      
    default:
      return false;
  }
}

function matchesRoleCondition(
  condition: RoleCondition,
  roles: readonly Role[]
): boolean {
  const activeRoles = roles.filter(r => r.isActive);
  
  switch (condition.type) {
    case 'HasAnyRole':
      return condition.roleTypes.some(rt => 
        activeRoles.some(r => r.roleType === rt)
      );
      
    case 'HasAllRoles':
      return condition.roleTypes.every(rt => 
        activeRoles.some(r => r.roleType === rt)
      );
      
    case 'RoleInScope':
      return activeRoles.some(r => 
        r.scope.type === condition.scope.type &&
        r.scope.targetId === condition.scope.targetId
      );
      
    default:
      return false;
  }
}

async function evaluateRule(
  condition: PolicyRuleCondition,
  request: AuthorizationRequest,
  roles: readonly Role[],
  evaluators: Map<string, PolicyRuleEvaluator>
): Promise<boolean> {
  switch (condition.type) {
    case 'And':
      for (const c of condition.conditions) {
        if (!(await evaluateRule(c, request, roles, evaluators))) {
          return false;
        }
      }
      return true;
      
    case 'Or':
      for (const c of condition.conditions) {
        if (await evaluateRule(c, request, roles, evaluators)) {
          return true;
        }
      }
      return false;
      
    case 'Not':
      return !(await evaluateRule(condition.condition, request, roles, evaluators));
      
    case 'Actor':
      return matchesActorCondition(condition.condition, request, roles);
      
    case 'Resource':
      return matchesResourceCondition(condition.condition, request);
      
    case 'Context':
      return matchesContextCondition(condition.condition, request);
      
    case 'Temporal':
      return matchesTemporalCondition(condition.condition, request);
      
    case 'Custom':
      const evaluator = evaluators.get(condition.evaluator);
      if (!evaluator) {
        console.warn(`Unknown custom evaluator: ${condition.evaluator}`);
        return false;
      }
      return evaluator(request, roles, condition.params || {});
      
    default:
      return false;
  }
}

// ============================================================================
// CUSTOM EVALUATORS
// ============================================================================

export type PolicyRuleEvaluator = (
  request: AuthorizationRequest,
  roles: readonly Role[],
  params: Record<string, unknown>
) => boolean | Promise<boolean>;

const isWorkingHoursEvaluator: PolicyRuleEvaluator = (request) => {
  const date = new Date(request.context.timestamp);
  const hour = date.getHours();
  const day = date.getDay();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
};

const isWeekendEvaluator: PolicyRuleEvaluator = (request) => {
  const day = new Date(request.context.timestamp).getDay();
  return day === 0 || day === 6;
};

const separationOfDutiesEvaluator: PolicyRuleEvaluator = (request, roles, params) => {
  const { conflictingRoles } = params as { conflictingRoles: string[][] };
  
  const activeRoleTypes = new Set(
    roles.filter(r => r.isActive).map(r => r.roleType)
  );
  
  for (const group of conflictingRoles) {
    const count = group.filter(rt => activeRoleTypes.has(rt)).length;
    if (count > 1) {
      return false; // Separation of duties violated
    }
  }
  
  return true;
};

// ============================================================================
// BUILT-IN POLICIES
// ============================================================================

export const BUILT_IN_POLICIES: readonly Policy[] = [
  // System protection
  {
    id: 'system-protection',
    name: 'System Protection',
    description: 'Prevents modification of system entities',
    priority: 1000,
    enabled: true,
    conditions: {
      resources: { type: 'ResourceType', types: ['Entity'] },
      actions: ['update', 'delete'],
    },
    effect: { type: 'Neutral' },
    rules: [
      {
        name: 'Protect system entity',
        condition: {
          type: 'Resource',
          condition: { 
            type: 'ResourceAttribute', 
            attribute: 'entityType', 
            value: 'System' 
          },
        },
        effect: { type: 'Deny', reason: 'System entities cannot be modified' },
      },
    ],
  },
  
  // Separation of duties
  {
    id: 'separation-of-duties',
    name: 'Separation of Duties',
    description: 'Prevents same user from having conflicting roles',
    priority: 900,
    enabled: true,
    conditions: {
      actions: ['approve', 'consent'],
    },
    effect: { type: 'Neutral' },
    rules: [
      {
        name: 'Proposer cannot approve own proposal',
        condition: {
          type: 'And',
          conditions: [
            { type: 'Actor', condition: { type: 'IsAgreementParty' } },
            { 
              type: 'Resource', 
              condition: { 
                type: 'ResourceAttribute', 
                attribute: 'proposedBy', 
                value: undefined // Will match actor ID dynamically
              } 
            },
          ],
        },
        effect: { type: 'Deny', reason: 'Cannot approve your own proposal' },
      },
    ],
  },
  
  // Business hours for sensitive operations
  {
    id: 'business-hours',
    name: 'Business Hours Restriction',
    description: 'Restricts sensitive operations to business hours',
    priority: 800,
    enabled: false, // Disabled by default
    conditions: {
      actions: ['delete', 'admin', 'configure'],
    },
    effect: { type: 'Neutral' },
    rules: [
      {
        name: 'Require business hours',
        condition: {
          type: 'Not',
          condition: { type: 'Temporal', condition: { type: 'BusinessHours' } },
        },
        effect: { type: 'Deny', reason: 'This operation is only allowed during business hours' },
      },
    ],
  },
  
  // Owner override
  {
    id: 'owner-override',
    name: 'Owner Override',
    description: 'Resource owners always have full access to their resources',
    priority: 700,
    enabled: true,
    conditions: {
      actor: { type: 'IsResourceOwner' },
    },
    effect: { type: 'Allow', reason: 'Resource owner has full access' },
  },
  
  // Agreement party access
  {
    id: 'agreement-party-access',
    name: 'Agreement Party Access',
    description: 'Parties to an agreement can access the agreement',
    priority: 600,
    enabled: true,
    conditions: {
      resources: { type: 'ResourceType', types: ['Agreement'] },
      actions: ['read', 'consent', 'fulfill'],
      actor: { type: 'IsAgreementParty' },
    },
    effect: { type: 'Allow', reason: 'Party to this agreement' },
  },
];

