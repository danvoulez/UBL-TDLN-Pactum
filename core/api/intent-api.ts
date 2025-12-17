/**
 * INTENT-DRIVEN API
 * 
 * A universal API that responds to intent, not fixed endpoints.
 * 
 * Instead of:
 *   POST /employees
 *   POST /sales
 *   PUT /orders/:id/status
 * 
 * We have:
 *   POST /intent { intent: "employ", ... }
 *   POST /intent { intent: "sell", ... }
 *   POST /intent { intent: "transition", ... }
 * 
 * The system understands what you want to achieve and routes
 * to the appropriate agreement type, workflow, and validation.
 */

import type { EntityId, Timestamp, ActorReference } from '../schema/ledger';
import type { 
  Entity, 
  Agreement, 
  Asset, 
  Role,
  AgreementParticipant,
  Terms,
  Validity,
  Quantity,
} from '../universal/primitives';

// ============================================================================
// THE UNIVERSAL REQUEST
// ============================================================================

/**
 * Every API call is an Intent.
 * An Intent expresses what you want to achieve, not how to achieve it.
 */
export interface Intent<T = unknown> {
  /** What do you want to do? */
  readonly intent: string;
  
  /** In which realm? */
  readonly realm: EntityId;
  
  /** Who is making this intent? */
  readonly actor: ActorReference;
  
  /** When was this intent expressed? (for offline-first) */
  readonly timestamp?: Timestamp;
  
  /** Intent-specific payload */
  readonly payload: T;
  
  /** Idempotency key */
  readonly idempotencyKey?: string;
  
  /** Expected outcomes (for validation) */
  readonly expects?: ExpectedOutcome[];
}

export interface ExpectedOutcome {
  readonly type: 'AgreementCreated' | 'RoleGranted' | 'AssetTransferred' | 'StateChanged';
  readonly conditions?: Record<string, unknown>;
}

// ============================================================================
// THE UNIVERSAL RESPONSE
// ============================================================================

export interface IntentResult<T = unknown> {
  /** Did the intent succeed? */
  readonly success: boolean;
  
  /** What happened? */
  readonly outcome: Outcome<T>;
  
  /** Events that were recorded */
  readonly events: readonly EventReference[];
  
  /** What can you do next? */
  readonly affordances: readonly Affordance[];
  
  /** If failed, why? */
  readonly errors?: readonly IntentError[];
  
  /** Processing metadata */
  readonly meta: {
    readonly processedAt: Timestamp;
    readonly processingTime: number;
    readonly idempotencyKey?: string;
  };
}

export type Outcome<T = unknown> = 
  | { readonly type: 'Created'; readonly entity: T; readonly id: EntityId }
  | { readonly type: 'Updated'; readonly entity: T; readonly changes: string[] }
  | { readonly type: 'Transitioned'; readonly from: string; readonly to: string }
  | { readonly type: 'Transferred'; readonly asset: EntityId; readonly to: EntityId }
  | { readonly type: 'Consented'; readonly agreement: EntityId; readonly party: EntityId }
  | { readonly type: 'Fulfilled'; readonly obligation: string }
  | { readonly type: 'Queried'; readonly results: T }
  | { readonly type: 'Nothing'; readonly reason: string };

export interface EventReference {
  readonly id: EntityId;
  readonly type: string;
  readonly sequence: bigint;
}

/**
 * Affordances tell the client what they CAN do next.
 * This is HATEOAS on steroids - driven by workflow state.
 */
export interface Affordance {
  readonly intent: string;
  readonly description: string;
  readonly required: readonly string[];
  readonly optional?: readonly string[];
  readonly constraints?: Record<string, unknown>;
}

export interface IntentError {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
  readonly suggestion?: string;
}

// ============================================================================
// INTENT TYPES
// ============================================================================

/**
 * All the intents the system understands.
 * These are verbs, not nouns. Actions, not resources.
 */

// --- ENTITY INTENTS ---

export interface RegisterEntityIntent {
  readonly entityType: string;
  readonly identity: {
    readonly name: string;
    readonly identifiers?: readonly { scheme: string; value: string }[];
    readonly contacts?: readonly { type: string; value: string }[];
    readonly attributes?: Record<string, unknown>;
  };
  readonly establishedBy?: EntityId; // Agreement that creates this entity
  readonly meta?: Record<string, unknown>;
}

// --- AGREEMENT INTENTS ---

export interface ProposeAgreementIntent {
  readonly agreementType: string;
  readonly parties: readonly {
    readonly entityId: EntityId;
    readonly role: string;
    readonly obligations?: readonly { id: string; description: string }[];
    readonly rights?: readonly { id: string; description: string }[];
  }[];
  readonly terms: {
    readonly description: string;
    readonly clauses?: readonly { id: string; type: string; content: string }[];
    readonly consideration?: {
      readonly description: string;
      readonly value?: { amount: number; currency: string };
    };
  };
  readonly assets?: readonly { assetId: EntityId; role: string }[];
  readonly validity?: {
    readonly effectiveFrom?: Timestamp;
    readonly effectiveUntil?: Timestamp;
  };
  readonly parentAgreementId?: EntityId;
}

export interface GiveConsentIntent {
  readonly agreementId: EntityId;
  readonly method: string; // 'Digital', 'Signature', 'Verbal', 'Click'
  readonly evidence?: string;
}

export interface FulfillObligationIntent {
  readonly agreementId: EntityId;
  readonly obligationId: string;
  readonly evidence?: string;
}

export interface TerminateAgreementIntent {
  readonly agreementId: EntityId;
  readonly reason: string;
}

// --- ASSET INTENTS ---

export interface RegisterAssetIntent {
  readonly assetType: string;
  readonly ownerId?: EntityId;
  readonly properties: Record<string, unknown>;
  readonly quantity?: { amount: number; unit: string };
  readonly establishedBy?: EntityId;
}

export interface TransferAssetIntent {
  readonly assetId: EntityId;
  readonly toEntityId: EntityId;
  readonly transferType: 'Ownership' | 'Custody';
  readonly agreementId: EntityId; // Must have a governing agreement
  readonly quantity?: { amount: number; unit: string }; // For partial transfers
}

// --- WORKFLOW INTENTS ---

export interface TransitionIntent {
  readonly targetType: 'Agreement' | 'Asset' | 'Workflow';
  readonly targetId: EntityId;
  readonly transition: string;
  readonly payload?: Record<string, unknown>;
}

// --- QUERY INTENTS ---

export interface QueryIntent {
  readonly queryType: 'Entity' | 'Agreement' | 'Asset' | 'Role' | 'History' | 'Affordances';
  readonly filters?: Record<string, unknown>;
  readonly atTime?: Timestamp; // Point-in-time query
  readonly pagination?: {
    readonly cursor?: string;
    readonly limit?: number;
  };
}

// --- META INTENTS ---

export interface ExplainIntent {
  /** What agreement type or workflow to explain */
  readonly subject: string;
  /** Level of detail */
  readonly depth?: 'summary' | 'full' | 'schema';
}

export interface SimulateIntent {
  /** The intent to simulate */
  readonly intent: Intent;
  /** Return what WOULD happen without doing it */
  readonly dryRun: true;
}

// ============================================================================
// INTENT HANDLER
// ============================================================================

export interface IntentHandler {
  /**
   * Process any intent
   */
  handle<T>(intent: Intent<T>): Promise<IntentResult>;
  
  /**
   * Get available intents for current context
   */
  getAvailableIntents(
    realm: EntityId,
    actor: ActorReference,
    context?: { targetType?: string; targetId?: EntityId }
  ): Promise<readonly Affordance[]>;
  
  /**
   * Validate an intent without executing
   */
  validate<T>(intent: Intent<T>): Promise<ValidationResult>;
  
  /**
   * Explain what an intent would do
   */
  explain<T>(intent: Intent<T>): Promise<Explanation>;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly IntentError[];
  readonly warnings: readonly IntentError[];
}

export interface Explanation {
  readonly description: string;
  readonly steps: readonly string[];
  readonly effects: readonly string[];
  readonly requirements: readonly string[];
}

// ============================================================================
// INTENT REGISTRY
// ============================================================================

/**
 * Maps intent names to their handlers and schemas.
 * This is extensible - domains can register their own intents.
 */
export interface IntentRegistry {
  /** Register an intent handler */
  register(intentName: string, definition: IntentDefinition): void;
  
  /** Get an intent definition */
  get(intentName: string): IntentDefinition | undefined;
  
  /** Get all registered intents */
  getAll(): readonly IntentDefinition[];
  
  /** Get intents available for a context */
  getForContext(context: IntentContext): readonly IntentDefinition[];
}

export interface IntentDefinition {
  readonly name: string;
  readonly description: string;
  readonly category: 'Entity' | 'Agreement' | 'Asset' | 'Workflow' | 'Query' | 'Meta';
  
  /** JSON Schema for the payload */
  readonly schema: Record<string, unknown>;
  
  /** What permissions are required */
  readonly requiredPermissions: readonly string[];
  
  /** What agreement types this intent creates/affects */
  readonly affectsAgreementTypes?: readonly string[];
  
  /** Example payloads */
  readonly examples?: readonly Record<string, unknown>[];
  
  /** The handler function */
  readonly handler: (intent: Intent, context: HandlerContext) => Promise<IntentResult>;
}

export interface IntentContext {
  readonly realm: EntityId;
  readonly actor: ActorReference;
  readonly targetType?: string;
  readonly targetId?: EntityId;
  readonly currentState?: string;
}

export interface HandlerContext extends IntentContext {
  readonly eventStore: import('../store/event-store').EventStore;
  readonly aggregates: import('../aggregates/rehydrators').AggregateRepository;
  readonly workflows: import('../engine/workflow-engine').WorkflowEngine;
  readonly agreements: import('../universal/agreement-types').AgreementTypeRegistry;
  readonly authorization: import('../security/authorization').AuthorizationEngine;
  readonly adapters?: Map<string, unknown>;
  readonly runtimeRegistry?: unknown;
  readonly containerManager?: import('../universal/container-manager').ContainerManager;
}

// ============================================================================
// BUILT-IN INTENTS - Now modularized in ./intents/
// ============================================================================

// Import all intents from modular structure
import { ALL_INTENTS } from './intents';

// Re-export for backward compatibility
export const BUILT_IN_INTENTS: readonly IntentDefinition[] = ALL_INTENTS;

// Import Ids for entity ID generation (used by createIntentHandler)
import { Ids } from '../shared/types.js';

// Old BUILT_IN_INTENTS array removed - now imported from ./intents/
// See: core/api/intents/ for modular intent definitions


// ============================================================================
// SHORTHAND INTENTS (Natural Language Mapping)
// ============================================================================

/**
 * These map natural expressions to formal intents.
 * "I want to hire someone" → propose:employment
 * "Sell this to them" → propose:sale + transfer
 */
export const INTENT_ALIASES: Record<string, { intent: string; defaults?: Record<string, unknown> }> = {
  // Employment
  'hire': { intent: 'propose', defaults: { agreementType: 'employment' } },
  'employ': { intent: 'propose', defaults: { agreementType: 'employment' } },
  'fire': { intent: 'terminate', defaults: {} },
  'terminate-employment': { intent: 'terminate', defaults: {} },
  
  // Sales
  'sell': { intent: 'propose', defaults: { agreementType: 'sale' } },
  'buy': { intent: 'consent', defaults: {} },
  'purchase': { intent: 'propose', defaults: { agreementType: 'sale' } },
  
  // Membership
  'invite': { intent: 'propose', defaults: { agreementType: 'membership' } },
  'join': { intent: 'consent', defaults: {} },
  'leave': { intent: 'terminate', defaults: {} },
  
  // Authorization
  'grant-access': { intent: 'propose', defaults: { agreementType: 'authorization' } },
  'revoke-access': { intent: 'terminate', defaults: {} },
  'authorize': { intent: 'propose', defaults: { agreementType: 'authorization' } },
  
  // Custody
  'entrust': { intent: 'propose', defaults: { agreementType: 'custody' } },
  'return': { intent: 'terminate', defaults: {} },
  
  // Testimony
  'declare': { intent: 'propose', defaults: { agreementType: 'testimony' } },
  'witness': { intent: 'consent', defaults: { method: 'Signature' } },
  'attest': { intent: 'consent', defaults: { method: 'Signature' } },
  
  // General
  'agree': { intent: 'consent', defaults: {} },
  'accept': { intent: 'consent', defaults: {} },
  'reject': { intent: 'terminate', defaults: { reason: 'Rejected by party' } },
  'complete': { intent: 'fulfill', defaults: {} },
  'done': { intent: 'fulfill', defaults: {} },
};

// ============================================================================
// INTENT REGISTRY IMPLEMENTATION
// ============================================================================

class SimpleIntentRegistry implements IntentRegistry {
  private intents: Map<string, IntentDefinition> = new Map();

  register(intentName: string, definition: IntentDefinition): void {
    this.intents.set(intentName, definition);
  }

  get(intentName: string): IntentDefinition | undefined {
    return this.intents.get(intentName);
  }

  getAll(): readonly IntentDefinition[] {
    return Array.from(this.intents.values());
  }

  getForContext(context: IntentContext): readonly IntentDefinition[] {
    // For now, return all intents. In the future, filter by permissions/context
    return this.getAll();
  }
}

// ============================================================================
// INTENT HANDLER CREATION
// ============================================================================

/**
 * Create an IntentHandler from BUILT_IN_INTENTS
 */
export function createIntentHandler(
  registry?: IntentRegistry,
  context?: Partial<HandlerContext>
): IntentHandler {
  const intentRegistry = registry || (() => {
    const reg = new SimpleIntentRegistry();
    // Register all built-in intents
    for (const intent of BUILT_IN_INTENTS) {
      reg.register(intent.name, intent);
    }
    return reg;
  })();

  // Create adapters map if not provided
  const adapters = context?.adapters || new Map<string, unknown>();

  const defaultContext: Partial<HandlerContext> = {
    realm: 'default-realm' as EntityId,
    actor: { type: 'Anonymous', reason: 'default' } as any,
    adapters,
    ...context,
  };

  // Store the full context including eventStore, agreements, realmManager
  const fullContext: Partial<HandlerContext> = {
    ...defaultContext,
    ...context, // Ensure context passed to function is included
  };
  
  const handler: IntentHandler & { context?: Partial<HandlerContext> } = {
    context: fullContext,
    async handle<T>(intent: Intent<T>): Promise<IntentResult> {
      // Add self-reference to context so handlers can call other intents
      (fullContext as any).intentHandler = handler;
      const definition = intentRegistry.get(intent.intent);
      
      if (!definition) {
        return {
          success: false,
          outcome: {
            type: 'Nothing',
            reason: `Intent "${intent.intent}" not found`,
          },
          events: [],
          affordances: [],
          meta: {
            processedAt: Date.now(),
            processingTime: 0,
          },
        };
      }

      try {
        // Merge contexts: defaultContext (from handler creation) + context (from function parameter)
        // This ensures eventStore, agreements, etc. are available
        const handlerContext: HandlerContext = {
          realm: intent.realm,
          actor: intent.actor,
          ...defaultContext, // This includes eventStore, agreements, realmManager from createIntentHandler
          ...context, // Override with any additional context
          intentHandler: handler, // Self-reference for nested intent calls
        } as HandlerContext;

        // =====================================================================
        // ABAC ENFORCEMENT - Check permissions before executing handler
        // Log all authorization decisions to the ledger for auditability
        // =====================================================================
        const authorization = handlerContext.authorization as any;
        const eventStore = handlerContext.eventStore as any;
        
        // System actors bypass ABAC for bootstrap/signup operations
        const isSystemActor = intent.actor.type === 'System';
        const isPublicIntent = definition.requiredPermissions.length === 0;
        
        if (authorization && definition.requiredPermissions.length > 0 && !isSystemActor) {
          // Map intent category to resource type
          const resourceType = definition.category === 'Agreement' ? 'Agreement'
            : definition.category === 'Asset' ? 'Asset'
            : definition.category === 'Entity' ? 'Entity'
            : definition.category === 'Workflow' ? 'Workflow'
            : 'Entity';
          
          // Check authorization for each required permission
          // Permission format: "resource:action" e.g. "entity:create", "agreement:propose"
          for (const permission of definition.requiredPermissions) {
            const parts = permission.split(':');
            const action = parts.length > 1 ? parts[1] : parts[0]; // Get action (second part or only part)
            
            const authResult = await authorization.authorize({
              actor: intent.actor,
              action: { type: action as any },
              resource: { type: resourceType as any, id: (intent.payload as any)?.agreementId || (intent.payload as any)?.entityId },
              context: {
                realm: intent.realm,
                timestamp: Date.now(),
                attributes: {},
              },
            });
            
            // LOG AUTHORIZATION DECISION TO LEDGER (permanent audit trail)
            if (eventStore) {
              try {
                // Each audit event gets a unique aggregate ID to avoid concurrency issues
                const auditId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` as EntityId;
                await eventStore.append({
                  type: authResult.allowed ? 'AuthorizationGranted' : 'AuthorizationDenied',
                  aggregateType: 'System' as any,
                  aggregateId: auditId, // Unique per audit event
                  aggregateVersion: 1,
                  actor: intent.actor,
                  timestamp: Date.now(),
                  payload: {
                    type: authResult.allowed ? 'AuthorizationGranted' : 'AuthorizationDenied',
                    auditId,
                    intent: intent.intent,
                    permission,
                    action,
                    resourceType,
                    actor: intent.actor,
                    realm: intent.realm,
                    decision: authResult.allowed ? 'GRANTED' : 'DENIED',
                    reason: authResult.reason?.message || (authResult.allowed ? 'Permission granted' : 'No matching permissions'),
                    rolesFound: authResult.evaluatedRoles?.length || 0,
                    evaluatedRoles: authResult.evaluatedRoles?.map((r: any) => ({
                      roleType: r.roleType,
                      isActive: r.isActive,
                      inScope: r.inScope,
                      hasPermission: r.hasPermission,
                      reason: r.reason,
                    })),
                    grantedBy: authResult.grantedBy?.map((g: any) => ({
                      roleType: g.roleType,
                      permission: g.permission,
                    })),
                  },
                });
              } catch (auditErr: any) {
                // If audit logging fails, still continue - but this is a problem we should track
                console.error('[AUDIT] Failed to log authorization event:', auditErr.message);
              }
            }
            
            if (!authResult.allowed) {
              return {
                success: false,
                outcome: {
                  type: 'Nothing',
                  reason: `Access denied: ${authResult.reason?.message || 'Insufficient permissions'}`,
                },
                events: [],
                affordances: [],
                errors: [{
                  code: 'FORBIDDEN',
                  message: `Permission "${permission}" required for intent "${intent.intent}"`,
                }],
                meta: {
                  processedAt: Date.now(),
                  processingTime: 0,
                } as any,
              };
            }
          }
        }
        // =====================================================================

        return await definition.handler(intent, handlerContext);
      } catch (error: any) {
        return {
          success: false,
          outcome: {
            type: 'Nothing',
            reason: error.message || 'Intent execution failed',
          },
          events: [],
          affordances: [],
          meta: {
            processedAt: Date.now(),
            processingTime: 0,
          },
        };
      }
    },

    async getAvailableIntents(
      realm: EntityId,
      actor: ActorReference,
      context?: { targetType?: string; targetId?: EntityId }
    ): Promise<readonly Affordance[]> {
      const ctx: IntentContext = {
        realm,
        actor,
        targetType: context?.targetType,
        targetId: context?.targetId,
      };
      
      const intents = intentRegistry.getForContext(ctx);
      
      return intents.map(intent => ({
        intent: intent.name,
        description: intent.description,
        required: Object.keys(intent.schema.properties || {}).filter(
          key => ((intent.schema.required || []) as string[]).includes(key)
        ),
      }));
    },

    async validate<T>(intent: Intent<T>): Promise<ValidationResult> {
      const definition = intentRegistry.get(intent.intent);
      
      if (!definition) {
        return {
          valid: false,
          errors: [{
            code: 'INTENT_NOT_FOUND',
            message: `Intent "${intent.intent}" is not registered`,
            field: 'intent',
          }],
          warnings: [],
        };
      }

      // Basic schema validation would go here
      // For now, just check if intent exists
      return {
        valid: true,
        errors: [],
        warnings: [],
      };
    },

    async explain<T>(intent: Intent<T>): Promise<Explanation> {
      const definition = intentRegistry.get(intent.intent);
      
      if (!definition) {
        return {
          description: `Intent "${intent.intent}" is not registered`,
          steps: [],
          effects: [],
          requirements: [],
        };
      }

      return {
        description: definition.description,
        steps: [
          'Validate intent payload',
          'Check permissions',
          'Execute handler',
          'Record events',
        ],
        effects: [
          'Events will be recorded',
          'State may be updated',
        ],
        requirements: [
          `Permissions: ${definition.requiredPermissions.join(', ')}`,
        ],
      };
    },
  };
  
  return handler;
}

