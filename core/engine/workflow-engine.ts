/**
 * WORKFLOW ENGINE - State Machine Executor
 * 
 * Executes workflows by:
 * 1. Validating transition requests against guards
 * 2. Checking actor authorization
 * 3. Executing actions
 * 4. Emitting events
 */

import type {
  EntityId,
  Timestamp,
  ActorReference,
  AggregateType,
  Command,
  Event,
} from '../schema/ledger';

import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowTransition,
  WorkflowState,
  WorkflowAction,
  TransitionGuard,
  GuardCondition,
  ActorConstraint,
  WorkflowInstanceCreated,
  WorkflowTransitioned,
  WorkflowCompleted,
} from '../schema/workflow';

import type { EventStore } from '../store/event-store';

// ============================================================================
// WORKFLOW ENGINE INTERFACE
// ============================================================================

export interface WorkflowEngine {
  /**
   * Register a workflow definition
   */
  registerDefinition(definition: WorkflowDefinition): void;
  
  /**
   * Start a new workflow instance for an aggregate
   */
  startWorkflow(
    definitionId: EntityId,
    targetAggregate: { type: AggregateType; id: EntityId },
    actor: ActorReference,
    initialContext?: Record<string, unknown>
  ): Promise<WorkflowInstance>;
  
  /**
   * Request a state transition
   */
  transition(
    instanceId: EntityId,
    transitionName: string,
    actor: ActorReference,
    payload?: Record<string, unknown>
  ): Promise<TransitionResult>;
  
  /**
   * Get available transitions from current state
   */
  getAvailableTransitions(
    instanceId: EntityId,
    actor: ActorReference
  ): Promise<readonly AvailableTransition[]>;
  
  /**
   * Get workflow instance by ID
   */
  getInstance(instanceId: EntityId): Promise<WorkflowInstance | null>;
  
  /**
   * Get workflow instance for an aggregate
   */
  getInstanceByAggregate(
    aggregateType: AggregateType,
    aggregateId: EntityId
  ): Promise<WorkflowInstance | null>;
}

export interface TransitionResult {
  readonly success: boolean;
  readonly instance?: WorkflowInstance;
  readonly error?: TransitionError;
  readonly emittedEvents?: readonly EntityId[];
}

export interface TransitionError {
  readonly code: string;
  readonly message: string;
  readonly failedGuards?: readonly string[];
  readonly details?: Record<string, unknown>;
}

export interface AvailableTransition {
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly description?: string;
  /** Guards that would need to pass */
  readonly guards: readonly string[];
}

// ============================================================================
// WORKFLOW ENGINE IMPLEMENTATION
// ============================================================================

export function createWorkflowEngine(
  eventStore: EventStore,
  services: WorkflowServices
): WorkflowEngine {
  const definitions = new Map<EntityId, WorkflowDefinition>();
  const instances = new Map<EntityId, WorkflowInstance>();
  const instancesByAggregate = new Map<string, EntityId>();
  
  const makeAggKey = (type: AggregateType, id: EntityId) => `${type}:${id}`;
  
  return {
    registerDefinition(definition: WorkflowDefinition): void {
      definitions.set(definition.id, definition);
    },
    
    async startWorkflow(
      definitionId: EntityId,
      targetAggregate: { type: AggregateType; id: EntityId },
      actor: ActorReference,
      initialContext: Record<string, unknown> = {}
    ): Promise<WorkflowInstance> {
      const definition = definitions.get(definitionId);
      if (!definition) {
        throw new Error(`Workflow definition not found: ${definitionId}`);
      }
      
      // Check if workflow already exists for this aggregate
      const aggKey = makeAggKey(targetAggregate.type, targetAggregate.id);
      if (instancesByAggregate.has(aggKey)) {
        throw new Error(`Workflow already exists for aggregate: ${aggKey}`);
      }
      
      const instanceId = generateId();
      const now = Date.now();
      
      // Create instance
      const instance: WorkflowInstance = {
        id: instanceId,
        definitionId,
        definitionVersion: definition.version,
        createdAt: now,
        version: 1,
        targetAggregate,
        currentState: definition.initialState,
        history: [],
        isComplete: false,
        context: initialContext,
      };
      
      // Emit creation event
      const eventPayload: WorkflowInstanceCreated = {
        type: 'WorkflowInstanceCreated',
        definitionId,
        definitionVersion: definition.version,
        targetAggregate,
        initialState: definition.initialState,
        context: initialContext,
      };
      
      await eventStore.append({
        type: 'WorkflowInstanceCreated',
        aggregateId: instanceId,
        aggregateType: 'Workflow',
        aggregateVersion: 1,
        payload: eventPayload,
        actor,
      });
      
      // Execute onEnter actions for initial state
      const initialStateConfig = definition.states.find(s => s.name === definition.initialState);
      if (initialStateConfig?.onEnter) {
        await executeActions(initialStateConfig.onEnter, instance, services);
      }
      
      // Store instance
      instances.set(instanceId, instance);
      instancesByAggregate.set(aggKey, instanceId);
      
      return instance;
    },
    
    async transition(
      instanceId: EntityId,
      transitionName: string,
      actor: ActorReference,
      payload: Record<string, unknown> = {}
    ): Promise<TransitionResult> {
      const instance = instances.get(instanceId);
      if (!instance) {
        return {
          success: false,
          error: { code: 'INSTANCE_NOT_FOUND', message: `Workflow instance not found: ${instanceId}` },
        };
      }
      
      if (instance.isComplete) {
        return {
          success: false,
          error: { code: 'WORKFLOW_COMPLETE', message: 'Workflow has already completed' },
        };
      }
      
      const definition = definitions.get(instance.definitionId);
      if (!definition) {
        return {
          success: false,
          error: { code: 'DEFINITION_NOT_FOUND', message: 'Workflow definition not found' },
        };
      }
      
      // Find the transition
      const transition = definition.transitions.find(t => {
        if (t.name !== transitionName) return false;
        const fromStates = Array.isArray(t.from) ? t.from : [t.from];
        return fromStates.includes(instance.currentState);
      });
      
      if (!transition) {
        return {
          success: false,
          error: {
            code: 'INVALID_TRANSITION',
            message: `Transition '${transitionName}' not available from state '${instance.currentState}'`,
          },
        };
      }
      
      // Check actor authorization
      const authResult = await checkActorAuthorization(
        actor,
        transition.allowedActors,
        instance,
        services
      );
      
      if (!authResult.authorized) {
        return {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: authResult.reason ?? 'Actor not authorized for this transition',
          },
        };
      }
      
      // Evaluate guards
      const guardContext: GuardContext = {
        actor,
        instance,
        aggregate: await services.getAggregate(
          instance.targetAggregate.type,
          instance.targetAggregate.id
        ),
        payload,
        now: Date.now(),
      };
      
      const failedGuards: string[] = [];
      for (const guard of transition.guards) {
        const result = await evaluateGuard(guard, guardContext, services);
        if (!result.passed) {
          failedGuards.push(guard.name);
        }
      }
      
      if (failedGuards.length > 0) {
        return {
          success: false,
          error: {
            code: 'GUARDS_FAILED',
            message: `Transition guards failed: ${failedGuards.join(', ')}`,
            failedGuards,
          },
        };
      }
      
      // Execute onExit actions for current state
      const currentStateConfig = definition.states.find(s => s.name === instance.currentState);
      if (currentStateConfig?.onExit) {
        await executeActions(currentStateConfig.onExit, instance, services);
      }
      
      // Execute transition actions
      if (transition.actions) {
        await executeActions(transition.actions, instance, services);
      }
      
      // Update instance
      const now = Date.now();
      const newHistory = [
        ...instance.history,
        {
          timestamp: now,
          transition: transitionName,
          fromState: instance.currentState,
          toState: transition.to,
          actor,
          eventId: '' as EntityId, // Will be filled after event creation
        },
      ];
      
      const isComplete = definition.terminalStates.includes(transition.to);
      
      const updatedInstance: WorkflowInstance = {
        ...instance,
        currentState: transition.to,
        history: newHistory,
        version: instance.version + 1,
        isComplete,
        completedAt: isComplete ? now : undefined,
      };
      
      // Emit transition event
      const transitionPayload: WorkflowTransitioned = {
        type: 'WorkflowTransitioned',
        transition: transitionName,
        fromState: instance.currentState,
        toState: transition.to,
        triggeredBy: actor.type === 'Party' ? actor.partyId : instanceId,
      };
      
      const transitionEvent = await eventStore.append({
        type: 'WorkflowTransitioned',
        aggregateId: instanceId,
        aggregateType: 'Workflow',
        aggregateVersion: updatedInstance.version,
        payload: transitionPayload,
        actor,
      });
      
      // Update history with event ID
      updatedInstance.history[updatedInstance.history.length - 1] = {
        ...updatedInstance.history[updatedInstance.history.length - 1],
        eventId: transitionEvent.id,
      };
      
      // Execute onEnter actions for new state
      const newStateConfig = definition.states.find(s => s.name === transition.to);
      if (newStateConfig?.onEnter) {
        await executeActions(newStateConfig.onEnter, updatedInstance, services);
      }
      
      // If completed, emit completion event
      if (isComplete) {
        const completionPayload: WorkflowCompleted = {
          type: 'WorkflowCompleted',
          finalState: transition.to,
          outcome: 'Success',
        };
        
        await eventStore.append({
          type: 'WorkflowCompleted',
          aggregateId: instanceId,
          aggregateType: 'Workflow',
          aggregateVersion: updatedInstance.version + 1,
          payload: completionPayload,
          actor,
        });
      }
      
      // Store updated instance
      instances.set(instanceId, updatedInstance);
      
      return {
        success: true,
        instance: updatedInstance,
        emittedEvents: [transitionEvent.id],
      };
    },
    
    async getAvailableTransitions(
      instanceId: EntityId,
      actor: ActorReference
    ): Promise<readonly AvailableTransition[]> {
      const instance = instances.get(instanceId);
      if (!instance || instance.isComplete) {
        return [];
      }
      
      const definition = definitions.get(instance.definitionId);
      if (!definition) {
        return [];
      }
      
      const available: AvailableTransition[] = [];
      
      for (const transition of definition.transitions) {
        const fromStates = Array.isArray(transition.from) ? transition.from : [transition.from];
        if (!fromStates.includes(instance.currentState)) {
          continue;
        }
        
        // Check if actor could be authorized
        const authResult = await checkActorAuthorization(
          actor,
          transition.allowedActors,
          instance,
          services
        );
        
        if (authResult.authorized) {
          available.push({
            name: transition.name,
            from: instance.currentState,
            to: transition.to,
            guards: transition.guards.map(g => g.name),
          });
        }
      }
      
      return available;
    },
    
    async getInstance(instanceId: EntityId): Promise<WorkflowInstance | null> {
      return instances.get(instanceId) ?? null;
    },
    
    async getInstanceByAggregate(
      aggregateType: AggregateType,
      aggregateId: EntityId
    ): Promise<WorkflowInstance | null> {
      const aggKey = makeAggKey(aggregateType, aggregateId);
      const instanceId = instancesByAggregate.get(aggKey);
      if (!instanceId) return null;
      return instances.get(instanceId) ?? null;
    },
  };
}

// ============================================================================
// SUPPORTING TYPES AND FUNCTIONS
// ============================================================================

export interface WorkflowServices {
  /** Get current state of an aggregate */
  getAggregate(type: AggregateType, id: EntityId): Promise<unknown>;
  
  /** Get roles for an actor */
  getActorRoles(actor: ActorReference): Promise<readonly string[]>;
  
  /** Get parties in an agreement */
  getAgreementParties(agreementId: EntityId): Promise<readonly { partyId: EntityId; role: string }[]>;
  
  /** Execute a custom validator */
  executeCustomValidator(validatorId: string, params: Record<string, unknown>): Promise<boolean>;
  
  /** Execute a custom action handler */
  executeCustomHandler(handlerId: string, params: Record<string, unknown>): Promise<void>;
  
  /** Send notification */
  sendNotification(partyId: EntityId, template: string, data: Record<string, unknown>): Promise<void>;
}

interface GuardContext {
  readonly actor: ActorReference;
  readonly instance: WorkflowInstance;
  readonly aggregate: unknown;
  readonly payload: Record<string, unknown>;
  readonly now: Timestamp;
}

interface AuthorizationResult {
  readonly authorized: boolean;
  readonly reason?: string;
}

async function checkActorAuthorization(
  actor: ActorReference,
  constraints: readonly ActorConstraint[],
  instance: WorkflowInstance,
  services: WorkflowServices
): Promise<AuthorizationResult> {
  if (constraints.length === 0) {
    return { authorized: true };
  }
  
  const actorRoles = await services.getActorRoles(actor);
  
  for (const constraint of constraints) {
    switch (constraint.type) {
      case 'System':
        if (actor.type === 'System') {
          return { authorized: true };
        }
        break;
        
      case 'Role':
        if (actorRoles.includes(constraint.roleType)) {
          return { authorized: true };
        }
        break;
        
      case 'Party':
        if (actor.type === 'Party' && actor.partyId === constraint.partyId) {
          return { authorized: true };
        }
        break;
        
      case 'Self':
        if (actor.type === 'Party' && actor.partyId === instance.targetAggregate.id) {
          return { authorized: true };
        }
        break;
        
      case 'AgreementParty':
        if (actor.type === 'Party' && instance.targetAggregate.type === 'Agreement') {
          const parties = await services.getAgreementParties(instance.targetAggregate.id);
          const match = parties.find(
            p => p.partyId === actor.partyId && p.role === constraint.role
          );
          if (match) {
            return { authorized: true };
          }
        }
        break;
    }
  }
  
  return { authorized: false, reason: 'No matching authorization constraint' };
}

async function evaluateGuard(
  guard: TransitionGuard,
  context: GuardContext,
  services: WorkflowServices
): Promise<{ passed: boolean; reason?: string }> {
  const condition = guard.condition;
  
  switch (condition.type) {
    case 'HasRole': {
      const roles = await services.getActorRoles(context.actor);
      return {
        passed: roles.includes(condition.roleType),
        reason: guard.errorMessage,
      };
    }
    
    case 'HasConsent': {
      const aggregate = context.aggregate as any;
      if (!aggregate?.parties) {
        return { passed: false, reason: 'No parties on aggregate' };
      }
      
      const principals = aggregate.parties.filter(
        (p: any) => !p.isWitness && !p.isSupervisor
      );
      
      if (condition.fromAll) {
        const allConsented = principals.every((p: any) => p.consent?.givenAt);
        return { passed: allConsented, reason: guard.errorMessage };
      } else {
        const anyConsented = principals.some((p: any) => p.consent?.givenAt);
        return { passed: anyConsented, reason: guard.errorMessage };
      }
    }
    
    case 'TimeElapsed': {
      // Find when we entered the specified state
      const stateEntry = [...context.instance.history]
        .reverse()
        .find(h => h.toState === condition.since);
      
      if (!stateEntry) {
        return { passed: false, reason: `Never entered state: ${condition.since}` };
      }
      
      const elapsed = context.now - stateEntry.timestamp;
      return {
        passed: elapsed >= condition.duration,
        reason: guard.errorMessage,
      };
    }
    
    case 'AssetInStatus': {
      const aggregate = context.aggregate as any;
      return {
        passed: aggregate?.status === condition.status,
        reason: guard.errorMessage,
      };
    }
    
    case 'AgreementInStatus': {
      const aggregate = context.aggregate as any;
      return {
        passed: aggregate?.status === condition.status,
        reason: guard.errorMessage,
      };
    }
    
    case 'Custom': {
      const passed = await services.executeCustomValidator(
        condition.validatorId,
        condition.params ?? {}
      );
      return { passed, reason: guard.errorMessage };
    }
    
    default:
      return { passed: false, reason: 'Unknown guard condition type' };
  }
}

async function executeActions(
  actions: readonly WorkflowAction[],
  instance: WorkflowInstance,
  services: WorkflowServices
): Promise<void> {
  for (const action of actions) {
    switch (action.type) {
      case 'NotifyParty':
        await services.sendNotification(action.partyId, action.template, {
          workflowId: instance.id,
          currentState: instance.currentState,
        });
        break;
        
      case 'Custom':
        await services.executeCustomHandler(action.handlerId, action.params ?? {});
        break;
        
      // Other action types would be handled here
    }
  }
}

function generateId(): EntityId {
  const timestamp = Date.now().toString(16);
  const random = Math.random().toString(16).slice(2, 10);
  return `wf-${timestamp}-${random}`;
}

// ============================================================================
// PREDEFINED WORKFLOW DEFINITIONS
// ============================================================================

/**
 * Standard Agreement Workflow
 */
export const AGREEMENT_WORKFLOW: WorkflowDefinition = {
  id: 'workflow-agreement-standard',
  name: 'Standard Agreement Workflow',
  version: 1,
  targetType: 'Agreement',
  
  states: [
    { name: 'Draft', description: 'Agreement is being drafted' },
    { name: 'Proposed', description: 'Agreement has been proposed to parties' },
    { name: 'UnderReview', description: 'Parties are reviewing the agreement' },
    { name: 'Active', description: 'Agreement is active and in effect' },
    { name: 'Fulfilled', description: 'All obligations have been fulfilled' },
    { name: 'Breached', description: 'Agreement has been breached' },
    { name: 'Terminated', description: 'Agreement has been terminated' },
    { name: 'Expired', description: 'Agreement has expired' },
  ],
  
  transitions: [
    {
      name: 'propose',
      from: 'Draft',
      to: 'Proposed',
      allowedActors: [
        { type: 'AgreementParty', role: 'Proposer' },
        { type: 'Role', roleType: 'Admin' },
      ],
      guards: [
        {
          name: 'MinimumParties',
          condition: { type: 'Custom', validatorId: 'agreement-minimum-parties' },
          errorMessage: 'Agreement must have minimum required parties',
        },
      ],
    },
    {
      name: 'review',
      from: 'Proposed',
      to: 'UnderReview',
      allowedActors: [
        { type: 'AgreementParty', role: 'Buyer' },
        { type: 'AgreementParty', role: 'Seller' },
        { type: 'AgreementParty', role: 'Principal' },
      ],
      guards: [],
    },
    {
      name: 'accept',
      from: ['Proposed', 'UnderReview'],
      to: 'Active',
      allowedActors: [
        { type: 'AgreementParty', role: 'Buyer' },
        { type: 'AgreementParty', role: 'Principal' },
      ],
      guards: [
        {
          name: 'AllConsent',
          condition: { type: 'HasConsent', fromAll: true },
          errorMessage: 'All principals must give consent',
        },
      ],
    },
    {
      name: 'fulfill',
      from: 'Active',
      to: 'Fulfilled',
      allowedActors: [
        { type: 'System' },
        { type: 'Role', roleType: 'Admin' },
      ],
      guards: [
        {
          name: 'ObligationsMet',
          condition: { type: 'Custom', validatorId: 'all-obligations-met' },
          errorMessage: 'Not all obligations have been fulfilled',
        },
      ],
    },
    {
      name: 'breach',
      from: 'Active',
      to: 'Breached',
      allowedActors: [
        { type: 'AgreementParty', role: 'Buyer' },
        { type: 'AgreementParty', role: 'Seller' },
        { type: 'Role', roleType: 'Arbitrator' },
      ],
      guards: [],
    },
    {
      name: 'terminate',
      from: ['Draft', 'Proposed', 'UnderReview', 'Active', 'Breached'],
      to: 'Terminated',
      allowedActors: [
        { type: 'Role', roleType: 'Admin' },
        { type: 'AgreementParty', role: 'Proposer' },
      ],
      guards: [],
    },
    {
      name: 'expire',
      from: 'Active',
      to: 'Expired',
      allowedActors: [{ type: 'System' }],
      guards: [
        {
          name: 'PastExpiry',
          condition: { type: 'Custom', validatorId: 'past-expiry-date' },
          errorMessage: 'Agreement has not yet expired',
        },
      ],
    },
  ],
  
  initialState: 'Draft',
  terminalStates: ['Fulfilled', 'Breached', 'Terminated', 'Expired'],
};

/**
 * Asset Lifecycle Workflow
 */
export const ASSET_WORKFLOW: WorkflowDefinition = {
  id: 'workflow-asset-lifecycle',
  name: 'Asset Lifecycle Workflow',
  version: 1,
  targetType: 'Asset',
  
  states: [
    { name: 'Created', description: 'Asset has been created/registered' },
    { name: 'InStock', description: 'Asset is in inventory' },
    { name: 'Reserved', description: 'Asset is reserved for a transaction' },
    { name: 'Sold', description: 'Asset has been sold' },
    { name: 'Transferred', description: 'Asset ownership has been transferred' },
    { name: 'Consumed', description: 'Asset has been consumed/used' },
    { name: 'Destroyed', description: 'Asset has been destroyed/written off' },
  ],
  
  transitions: [
    {
      name: 'stock',
      from: 'Created',
      to: 'InStock',
      allowedActors: [
        { type: 'Role', roleType: 'InventoryManager' },
        { type: 'Role', roleType: 'Admin' },
      ],
      guards: [],
    },
    {
      name: 'reserve',
      from: 'InStock',
      to: 'Reserved',
      allowedActors: [
        { type: 'Role', roleType: 'Salesperson' },
        { type: 'System' },
      ],
      guards: [],
    },
    {
      name: 'release',
      from: 'Reserved',
      to: 'InStock',
      allowedActors: [
        { type: 'Role', roleType: 'Salesperson' },
        { type: 'System' },
      ],
      guards: [],
    },
    {
      name: 'sell',
      from: ['InStock', 'Reserved'],
      to: 'Sold',
      allowedActors: [
        { type: 'Role', roleType: 'Salesperson' },
        { type: 'Role', roleType: 'Admin' },
      ],
      guards: [
        {
          name: 'HasSaleAgreement',
          condition: { type: 'Custom', validatorId: 'has-sale-agreement' },
          errorMessage: 'Asset must have an associated sale agreement',
        },
      ],
    },
    {
      name: 'transfer',
      from: ['Sold', 'Created'],
      to: 'Transferred',
      allowedActors: [
        { type: 'Role', roleType: 'Admin' },
        { type: 'Self' },
      ],
      guards: [
        {
          name: 'HasTransferAgreement',
          condition: { type: 'Custom', validatorId: 'has-transfer-agreement' },
          errorMessage: 'Asset transfer must have a governing agreement',
        },
      ],
    },
    {
      name: 'consume',
      from: ['InStock', 'Transferred'],
      to: 'Consumed',
      allowedActors: [
        { type: 'Self' },
        { type: 'Role', roleType: 'Admin' },
      ],
      guards: [],
    },
    {
      name: 'destroy',
      from: ['Created', 'InStock', 'Sold', 'Transferred'],
      to: 'Destroyed',
      allowedActors: [
        { type: 'Role', roleType: 'Admin' },
      ],
      guards: [],
    },
  ],
  
  initialState: 'Created',
  terminalStates: ['Consumed', 'Destroyed'],
};

