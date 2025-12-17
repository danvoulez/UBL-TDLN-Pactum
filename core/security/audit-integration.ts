/**
 * SECURITY-MEMORY INTEGRATION
 * 
 * Authorization decisions ARE part of the system memory.
 * Every Allow/Deny becomes a Memory that tells a story.
 * 
 * This connects:
 * - Authorization Engine → Memory Logger
 * - Policy Decisions → Narrative
 * - Security Events → Audit Trail
 */

import type { Timestamp, ActorReference, EntityId } from '../shared/types';
import type { AuthorizationDecision } from './authorization';

// ============================================================================
// LOCAL TYPES FOR SECURITY MEMORY
// These are specific to security audit and don't need to match trajectory/trace
// ============================================================================

type SystemLayer = 'Business' | 'Application' | 'Infrastructure' | 'Security' | 'Integration';
type MemoryCategory = 'Event' | 'Decision' | 'Observation' | 'Milestone' | 'Anomaly' | 'Reflection' | 'Relationship';
type SignificanceLevel = 'Critical' | 'Error' | 'Warning' | 'Notice' | 'Info' | 'Debug';
type ViewerType = 'Developer' | 'Operator' | 'Business' | 'Auditor' | 'Customer' | 'Security' | 'System';

interface Memory {
  readonly id: EntityId;
  readonly timestamp: Timestamp;
  readonly realmId: EntityId;
  readonly classification: {
    readonly category: MemoryCategory;
    readonly subcategory?: string;
    readonly domain?: string;
    readonly layer: SystemLayer;
  };
  readonly content: {
    readonly what: string;
    readonly data?: Record<string, unknown>;
    readonly narrative?: {
      readonly summary: string;
      readonly description?: string;
      readonly implications?: readonly string[];
      readonly perspectives?: Record<string, string>;
    };
    readonly technical?: {
      readonly operation?: string;
      readonly durationMs?: number;
      readonly request?: Record<string, unknown>;
    };
  };
  readonly causation: {
    readonly correlationId?: string;
    readonly spanId?: string;
    readonly parentSpanId?: string;
    readonly initiator?: ActorReference;
    readonly intent?: string;
  };
  readonly significance: {
    readonly level: SignificanceLevel;
    readonly reason?: string;
    readonly audience?: readonly string[];
    readonly alertWorthy?: boolean;
    readonly retention?: {
      readonly minRetention?: { amount: number; unit: string };
      readonly reason?: string;
      readonly legalHold?: boolean;
    };
  };
  readonly perspectives: readonly Perspective[];
  readonly tags: readonly string[];
  readonly related: readonly EntityId[];
}

interface Perspective {
  readonly viewer: ViewerType;
  readonly view: {
    readonly title: string;
    readonly description?: string;
    readonly action?: string;
    readonly visible: boolean;
  };
}

interface MemoryFormer {
  form(input: unknown): Memory;
}

interface MemoryContext {
  readonly realmId: EntityId;
  readonly correlationId?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly initiator?: ActorReference;
}

// ============================================================================
// SECURITY MEMORY INTEGRATION
// ============================================================================

/**
 * Converts authorization decisions into memories.
 * Every security decision becomes part of the system's story.
 */
export interface SecurityMemoryIntegration {
  /** Log an authorization decision as a memory */
  logDecision(decision: AuthorizationDecision, context: SecurityContext): Promise<Memory>;
  
  /** Log a policy evaluation */
  logPolicyEvaluation(evaluation: PolicyEvaluationMemory): Promise<Memory>;
  
  /** Log a security anomaly (suspicious activity) */
  logAnomaly(anomaly: SecurityAnomalyData): Promise<Memory>;
  
  /** Log role changes */
  logRoleChange(change: RoleChangeMemory): Promise<Memory>;
}

export interface SecurityContext extends Omit<MemoryContext, 'initiator'> {
  readonly requestPath?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly geoLocation?: string;
}

export interface PolicyEvaluationMemory {
  readonly policyId: string;
  readonly policyName: string;
  readonly matched: boolean;
  readonly effect: 'Allow' | 'Deny' | 'Neutral';
  readonly request: {
    readonly actor: ActorReference;
    readonly action: string;
    readonly resource: string;
  };
  readonly context: SecurityContext;
}

export interface SecurityAnomalyData {
  readonly type: SecurityAnomalyType;
  readonly severity: 'Low' | 'Medium' | 'High' | 'Critical';
  readonly description: string;
  readonly actor?: ActorReference;
  readonly details: Record<string, unknown>;
  readonly recommendedAction?: string;
}

export type SecurityAnomalyType =
  | 'BruteForce'           // Too many failed attempts
  | 'PrivilegeEscalation'  // Attempting unauthorized actions
  | 'SuspiciousPattern'    // Unusual access patterns
  | 'PolicyViolation'      // Explicit policy breach
  | 'UnauthorizedAccess'   // Access without proper role
  | 'SessionAnomaly'       // Session-related issues
  | 'DataExfiltration';    // Unusual data access

export interface RoleChangeMemory {
  readonly roleId: EntityId;
  readonly roleType: string;
  readonly holderId: EntityId;
  readonly change: 'Granted' | 'Revoked' | 'Delegated' | 'Expired';
  readonly changedBy: ActorReference;
  readonly agreementId: EntityId;
  readonly reason?: string;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createSecurityMemoryIntegration(
  memoryFormer: MemoryFormer,
  memoryStore: MemoryStore
): SecurityMemoryIntegration {
  return {
    async logDecision(decision: AuthorizationDecision, context: SecurityContext): Promise<Memory> {
      const narrative = generateDecisionNarrative(decision);
      
      const memory: Memory = {
        id: generateSecurityMemoryId(),
        timestamp: decision.audit.timestamp,
        realmId: context.realmId,
        classification: {
          category: 'Decision' as MemoryCategory,
          subcategory: decision.allowed ? 'AccessGranted' : 'AccessDenied',
          domain: 'Security',
          layer: 'Security' as SystemLayer,
        },
        content: {
          what: `Authorization: ${decision.allowed ? 'ALLOWED' : 'DENIED'} - ${decision.audit.action.type} on ${decision.audit.resource.type}`,
          data: {
            decision: decision.allowed ? 'Allow' : 'Deny',
            action: decision.audit.action,
            resource: decision.audit.resource,
            actor: decision.audit.actor,
            reason: decision.reason,
            grantedBy: decision.grantedBy,
            evaluatedRoles: decision.evaluatedRoles,
            durationMs: decision.audit.durationMs,
          },
          narrative,
          technical: {
            operation: 'authorization-check',
            durationMs: decision.audit.durationMs,
            request: { path: context.requestPath, ip: context.ipAddress },
          },
        },
        causation: {
          correlationId: context.correlationId,
          spanId: context.spanId,
          parentSpanId: context.parentSpanId,
          initiator: decision.audit.actor,
          intent: decision.audit.action.intent,
        },
        significance: {
          level: determineSecuritySignificance(decision),
          reason: decision.allowed ? undefined : 'Access denied',
          audience: ['Security', 'Auditor', 'Operator'],
          alertWorthy: !decision.allowed && isHighRiskAction(decision.audit.action.type),
          retention: {
            minRetention: { amount: 7, unit: 'years' },
            reason: 'Security compliance',
          },
        },
        perspectives: generateSecurityPerspectives(decision),
        tags: generateSecurityTags(decision, context),
        related: [],
      };
      
      await memoryStore.store(memory);
      return memory;
    },
    
    async logPolicyEvaluation(evaluation: PolicyEvaluationMemory): Promise<Memory> {
      const memory: Memory = {
        id: generateSecurityMemoryId(),
        timestamp: Date.now(),
        realmId: evaluation.context.realmId,
        classification: {
          category: 'Decision' as MemoryCategory,
          subcategory: 'PolicyEvaluation',
          domain: 'Security',
          layer: 'Security' as SystemLayer,
        },
        content: {
          what: `Policy "${evaluation.policyName}" ${evaluation.matched ? 'matched' : 'did not match'}`,
          data: {
            policyId: evaluation.policyId,
            policyName: evaluation.policyName,
            matched: evaluation.matched,
            effect: evaluation.effect,
            request: evaluation.request,
          },
          narrative: {
            summary: `Policy evaluation: ${evaluation.policyName} → ${evaluation.effect}`,
            description: evaluation.matched
              ? `Policy "${evaluation.policyName}" was triggered and returned ${evaluation.effect}`
              : `Policy "${evaluation.policyName}" did not match the request conditions`,
          },
        },
        causation: {
          correlationId: evaluation.context.correlationId,
          initiator: evaluation.request.actor,
        },
        significance: {
          level: evaluation.effect === 'Deny' ? 'Warning' : 'Debug',
          audience: ['Security', 'Developer'],
          alertWorthy: false,
          retention: { minRetention: { amount: 90, unit: 'days' } },
        },
        perspectives: [],
        tags: ['policy', evaluation.policyId, evaluation.effect.toLowerCase()],
        related: [],
      };
      
      await memoryStore.store(memory);
      return memory;
    },
    
    async logAnomaly(anomaly: SecurityAnomalyData): Promise<Memory> {
      const significanceMap: Record<SecurityAnomalyData['severity'], SignificanceLevel> = {
        'Low': 'Notice',
        'Medium': 'Warning',
        'High': 'Error',
        'Critical': 'Critical',
      };
      
      const memory: Memory = {
        id: generateSecurityMemoryId(),
        timestamp: Date.now(),
        realmId: PRIMORDIAL_REALM_ID,
        classification: {
          category: 'Anomaly' as MemoryCategory,
          subcategory: anomaly.type,
          domain: 'Security',
          layer: 'Security' as SystemLayer,
        },
        content: {
          what: `Security Anomaly: ${anomaly.type}`,
          data: {
            type: anomaly.type,
            severity: anomaly.severity,
            actor: anomaly.actor,
            ...anomaly.details,
          },
          narrative: {
            summary: anomaly.description,
            implications: anomaly.recommendedAction 
              ? [`Recommended action: ${anomaly.recommendedAction}`]
              : undefined,
          },
        },
        causation: {
          correlationId: generateSecurityMemoryId(),
          initiator: anomaly.actor || { type: 'System', systemId: 'security-monitor' },
        },
        significance: {
          level: significanceMap[anomaly.severity],
          reason: anomaly.type,
          audience: ['Security', 'Operator'],
          alertWorthy: anomaly.severity === 'High' || anomaly.severity === 'Critical',
          retention: {
            minRetention: { amount: 1, unit: 'years' },
            legalHold: anomaly.severity === 'Critical',
          },
        },
        perspectives: [
          {
            viewer: 'Security' as const,
            view: {
              title: `🚨 ${anomaly.severity}: ${anomaly.type}`,
              description: anomaly.description,
              action: anomaly.recommendedAction,
              visible: true,
            },
          },
          {
            viewer: 'Operator' as const,
            view: {
              title: `Security Alert: ${anomaly.type}`,
              description: anomaly.description,
              action: anomaly.recommendedAction,
              visible: true,
            },
          },
        ],
        tags: ['security', 'anomaly', anomaly.type.toLowerCase(), anomaly.severity.toLowerCase()],
        related: [],
      };
      
      await memoryStore.store(memory);
      return memory;
    },
    
    async logRoleChange(change: RoleChangeMemory): Promise<Memory> {
      const emoji = {
        'Granted': '✅',
        'Revoked': '❌',
        'Delegated': '🔄',
        'Expired': '⏰',
      }[change.change];
      
      const memory: Memory = {
        id: generateSecurityMemoryId(),
        timestamp: Date.now(),
        realmId: PRIMORDIAL_REALM_ID,
        classification: {
          category: 'Relationship' as MemoryCategory,
          subcategory: `Role${change.change}`,
          domain: 'Security',
          layer: 'Security' as SystemLayer,
        },
        content: {
          what: `Role ${change.change}: ${change.roleType}`,
          data: {
            roleId: change.roleId,
            roleType: change.roleType,
            holderId: change.holderId,
            change: change.change,
            changedBy: change.changedBy,
            agreementId: change.agreementId,
            reason: change.reason,
          },
          narrative: {
            summary: `${emoji} Role "${change.roleType}" ${change.change.toLowerCase()} for entity ${change.holderId}`,
            description: change.reason || `Role change via agreement ${change.agreementId}`,
            perspectives: {
              security: `Role ${change.change.toLowerCase()}: ${change.roleType} for ${change.holderId}`,
              business: `${change.change === 'Granted' ? 'New' : change.change === 'Revoked' ? 'Removed' : 'Changed'} role assignment`,
            },
          },
        },
        causation: {
          correlationId: change.agreementId,
          initiator: change.changedBy,
        },
        significance: {
          level: change.change === 'Granted' || change.change === 'Revoked' ? 'Notice' : 'Info',
          audience: ['Security', 'Business', 'Auditor'],
          alertWorthy: false,
          retention: { minRetention: { amount: 7, unit: 'years' } },
        },
        perspectives: [
          {
            viewer: 'Business' as const,
            view: {
              title: `Role Change: ${change.roleType}`,
              description: `${change.change} for entity via agreement`,
              visible: true,
            },
          },
          {
            viewer: 'Auditor' as const,
            view: {
              title: `[AUDIT] Role ${change.change}: ${change.roleType}`,
              description: `Holder: ${change.holderId}, Agreement: ${change.agreementId}, Changed by: ${describeActorShort(change.changedBy)}`,
              visible: true,
            },
          },
        ],
        tags: ['role', change.change.toLowerCase(), change.roleType.toLowerCase()],
        related: [change.agreementId],
      };
      
      await memoryStore.store(memory);
      return memory;
    },
  };
}

// ============================================================================
// HELPER INTERFACES
// ============================================================================

interface MemoryStore {
  store(memory: Memory): Promise<void>;
}

// Import from shared/types
import { PRIMORDIAL_REALM_ID, generateId as generateIdFromShared } from '../shared/types';

function generateSecurityMemoryId(): EntityId {
  return generateIdFromShared('sec');
}

// ============================================================================
// NARRATIVE GENERATION
// ============================================================================

function generateDecisionNarrative(decision: AuthorizationDecision) {
  const actor = describeActorShort(decision.audit.actor);
  const action = decision.audit.action.type;
  const resource = `${decision.audit.resource.type}${decision.audit.resource.id ? ':' + decision.audit.resource.id : ''}`;
  
  if (decision.allowed) {
    const grantedByRoles = decision.grantedBy?.map(g => g.roleType).join(', ') || 'unknown';
    return {
      summary: `${actor} was ALLOWED to ${action} on ${resource}`,
      description: `Access granted via role(s): ${grantedByRoles}`,
      perspectives: {
        security: `✅ Authorized: ${actor} → ${action} → ${resource}`,
        auditor: `Access granted. Roles evaluated: ${decision.evaluatedRoles.length}. Permissions matched: ${decision.grantedBy?.length || 0}.`,
      },
    };
  } else {
    return {
      summary: `${actor} was DENIED to ${action} on ${resource}`,
      description: `Reason: ${decision.reason.message}`,
      implications: ['Access was blocked', 'Actor may need additional permissions'],
      perspectives: {
        security: `❌ Denied: ${actor} → ${action} → ${resource}. Reason: ${decision.reason.code}`,
        auditor: `Access denied. Code: ${decision.reason.code}. Message: ${decision.reason.message}`,
      },
    };
  }
}

function describeActorShort(actor: ActorReference): string {
  switch (actor.type) {
    case 'Entity': return `Entity:${actor.entityId.slice(-8)}`;
    case 'System': return `System:${actor.systemId}`;
    case 'Workflow': return `Workflow:${actor.workflowId.slice(-8)}`;
    case 'Anonymous': return 'Anonymous';
    default: return 'Unknown';
  }
}

function determineSecuritySignificance(decision: AuthorizationDecision): SignificanceLevel {
  if (!decision.allowed) {
    if (isHighRiskAction(decision.audit.action.type)) return 'Warning';
    return 'Notice';
  }
  if (isHighRiskAction(decision.audit.action.type)) return 'Info';
  return 'Debug';
}

function isHighRiskAction(action: string): boolean {
  const highRisk = ['delete', 'admin', 'configure', 'terminate', 'grant', 'revoke'];
  return highRisk.includes(action);
}

function generateSecurityPerspectives(decision: AuthorizationDecision): Perspective[] {
  return [
    {
      viewer: 'System' as const,
      view: {
        title: decision.allowed ? 'Access Granted' : 'Access Denied',
        description: `${decision.audit.action.type} on ${decision.audit.resource.type}`,
        visible: true,
      },
    },
    {
      viewer: 'Auditor' as const,
      view: {
        title: `[${decision.allowed ? 'ALLOW' : 'DENY'}] ${decision.audit.action.type}`,
        description: `Actor: ${describeActorShort(decision.audit.actor)}, Resource: ${decision.audit.resource.type}:${decision.audit.resource.id || '*'}, Reason: ${decision.reason.code}`,
        visible: true,
      },
    },
  ];
}

function generateSecurityTags(decision: AuthorizationDecision, context: SecurityContext): string[] {
  const tags = ['security', 'authorization'];
  
  tags.push(decision.allowed ? 'allowed' : 'denied');
  tags.push(decision.audit.action.type);
  tags.push(decision.audit.resource.type.toLowerCase());
  
  if (context.ipAddress) {
    tags.push(`ip:${context.ipAddress.replace(/\./g, '-')}`);
  }
  
  return tags;
}

