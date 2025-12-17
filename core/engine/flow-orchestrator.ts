/**
 * FLOW ORCHESTRATOR - Process Coordination
 * 
 * Flows orchestrate multiple workflows and coordinate complex business processes.
 * They are the conductors that manage the symphony of state machines.
 */

import type {
  EntityId,
  Timestamp,
  ActorReference,
  AggregateType,
} from '../schema/ledger';

import type {
  FlowDefinition,
  FlowInstance,
  FlowStep,
  FlowBranch,
  FlowWorkflowStep,
  FlowDecisionStep,
  FlowParallelStep,
  FlowWaitStep,
  FlowActionStep,
  FlowErrorHandler,
  GuardCondition,
  WorkflowAction,
  FlowInstanceCreated,
  FlowStepExecuted,
  FlowCompleted,
} from '../schema/workflow';

import type { EventStore } from '../store/event-store';
import type { WorkflowEngine, WorkflowServices } from './workflow-engine';

// ============================================================================
// FLOW ORCHESTRATOR INTERFACE
// ============================================================================

export interface FlowOrchestrator {
  /**
   * Register a flow definition
   */
  registerDefinition(definition: FlowDefinition): void;
  
  /**
   * Start a new flow instance
   */
  startFlow(
    definitionId: EntityId,
    actor: ActorReference,
    initialVariables?: Record<string, unknown>
  ): Promise<FlowInstance>;
  
  /**
   * Resume a waiting flow (when an external event occurs)
   */
  resumeFlow(
    instanceId: EntityId,
    event: { type: string; payload: Record<string, unknown> },
    actor: ActorReference
  ): Promise<FlowInstance>;
  
  /**
   * Cancel a running flow
   */
  cancelFlow(
    instanceId: EntityId,
    reason: string,
    actor: ActorReference
  ): Promise<FlowInstance>;
  
  /**
   * Get flow instance by ID
   */
  getInstance(instanceId: EntityId): Promise<FlowInstance | null>;
  
  /**
   * Get all active flows
   */
  getActiveFlows(): Promise<readonly FlowInstance[]>;
}

// ============================================================================
// FLOW ORCHESTRATOR IMPLEMENTATION
// ============================================================================

export function createFlowOrchestrator(
  eventStore: EventStore,
  workflowEngine: WorkflowEngine,
  services: FlowServices
): FlowOrchestrator {
  const definitions = new Map<EntityId, FlowDefinition>();
  const instances = new Map<EntityId, FlowInstance>();
  const waitingFlows = new Map<string, Set<EntityId>>(); // eventType -> flowInstanceIds
  
  // Internal: Execute a single step
  async function executeStep(
    instance: FlowInstance,
    stepId: string,
    actor: ActorReference
  ): Promise<FlowInstance> {
    const definition = definitions.get(instance.definitionId);
    if (!definition) {
      throw new Error(`Flow definition not found: ${instance.definitionId}`);
    }
    
    const step = definition.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }
    
    // Record step entry
    const entryPayload: FlowStepExecuted = {
      type: 'FlowStepExecuted',
      stepId,
      action: 'Enter',
    };
    
    await eventStore.append({
      type: 'FlowStepExecuted',
      aggregateId: instance.id,
      aggregateType: 'Flow',
      aggregateVersion: instance.version + 1,
      payload: entryPayload,
      actor,
    });
    
    let updatedInstance = {
      ...instance,
      version: instance.version + 1,
      history: [
        ...instance.history,
        { timestamp: Date.now(), stepId, action: 'Enter' as const },
      ],
    };
    
    // Execute based on step type
    switch (step.type) {
      case 'Workflow':
        updatedInstance = await executeWorkflowStep(updatedInstance, step, actor);
        break;
        
      case 'Decision':
        updatedInstance = await executeDecisionStep(updatedInstance, step, actor);
        break;
        
      case 'Parallel':
        updatedInstance = await executeParallelStep(updatedInstance, step, actor);
        break;
        
      case 'Wait':
        updatedInstance = await executeWaitStep(updatedInstance, step, actor);
        break;
        
      case 'Action':
        updatedInstance = await executeActionStep(updatedInstance, step, actor);
        break;
    }
    
    // Store updated instance
    instances.set(instance.id, updatedInstance);
    
    return updatedInstance;
  }
  
  // Execute workflow step
  async function executeWorkflowStep(
    instance: FlowInstance,
    step: FlowWorkflowStep,
    actor: ActorReference
  ): Promise<FlowInstance> {
    // Start the workflow
    const workflowInstance = await workflowEngine.startWorkflow(
      step.workflowDefinitionId,
      { type: 'Flow', id: instance.id } as any, // Flow acts as the aggregate context
      actor,
      step.input
    );
    
    // Add to active workflows
    const updatedInstance: FlowInstance = {
      ...instance,
      activeWorkflows: [...instance.activeWorkflows, workflowInstance.id],
    };
    
    // If workflow completed immediately, proceed to next step
    if (workflowInstance.isComplete) {
      return await proceedToNext(updatedInstance, step, actor);
    }
    
    // Otherwise, wait for workflow to complete
    return {
      ...updatedInstance,
      status: 'Waiting',
    };
  }
  
  // Execute decision step
  async function executeDecisionStep(
    instance: FlowInstance,
    step: FlowDecisionStep,
    actor: ActorReference
  ): Promise<FlowInstance> {
    // Evaluate branches in order
    for (const branch of step.branches) {
      const result = await evaluateCondition(branch.condition, instance);
      if (result) {
        return await executeStep(instance, branch.target, actor);
      }
    }
    
    // Use default if no branch matched
    if (step.default) {
      return await executeStep(instance, step.default, actor);
    }
    
    throw new Error(`No branch matched in decision step: ${step.id}`);
  }
  
  // Execute parallel step
  async function executeParallelStep(
    instance: FlowInstance,
    step: FlowParallelStep,
    actor: ActorReference
  ): Promise<FlowInstance> {
    // Start all branches in parallel
    const branchPromises = step.branches.map(branchStepId =>
      executeStep(instance, branchStepId, actor)
    );
    
    switch (step.joinType) {
      case 'All':
        // Wait for all branches to complete
        await Promise.all(branchPromises);
        break;
        
      case 'Any':
        // Wait for any branch to complete
        await Promise.any(branchPromises);
        break;
        
      case 'First':
        // Wait for first branch to complete
        await Promise.race(branchPromises);
        break;
    }
    
    return await proceedToNext(instance, step, actor);
  }
  
  // Execute wait step
  async function executeWaitStep(
    instance: FlowInstance,
    step: FlowWaitStep,
    actor: ActorReference
  ): Promise<FlowInstance> {
    const waitFor = step.waitFor;
    
    switch (waitFor.type) {
      case 'Duration':
        // Schedule a timer (in production, use a job queue)
        setTimeout(async () => {
          const currentInstance = instances.get(instance.id);
          if (currentInstance && currentInstance.status === 'Waiting') {
            const resumed = await proceedToNext(currentInstance, step, actor);
            instances.set(instance.id, resumed);
          }
        }, waitFor.duration);
        
        return {
          ...instance,
          status: 'Waiting',
        };
        
      case 'Event':
        // Register to wait for this event type
        if (!waitingFlows.has(waitFor.eventType)) {
          waitingFlows.set(waitFor.eventType, new Set());
        }
        waitingFlows.get(waitFor.eventType)!.add(instance.id);
        
        return {
          ...instance,
          status: 'Waiting',
          variables: {
            ...instance.variables,
            __waitingFor: waitFor,
            __nextStep: step.next,
          },
        };
        
      case 'Condition':
        // Poll condition (in production, use event-driven approach)
        const checkCondition = async () => {
          const result = await evaluateCondition(waitFor.condition, instance);
          if (result) {
            const currentInstance = instances.get(instance.id);
            if (currentInstance && currentInstance.status === 'Waiting') {
              const resumed = await proceedToNext(currentInstance, step, actor);
              instances.set(instance.id, resumed);
            }
          } else {
            setTimeout(checkCondition, 1000); // Check again in 1 second
          }
        };
        setTimeout(checkCondition, 1000);
        
        return {
          ...instance,
          status: 'Waiting',
        };
    }
  }
  
  // Execute action step
  async function executeActionStep(
    instance: FlowInstance,
    step: FlowActionStep,
    actor: ActorReference
  ): Promise<FlowInstance> {
    // Execute all actions
    for (const action of step.actions) {
      await executeAction(action, instance, services);
    }
    
    return await proceedToNext(instance, step, actor);
  }
  
  // Proceed to next step
  async function proceedToNext(
    instance: FlowInstance,
    step: FlowStep & { next?: string | readonly FlowBranch[] },
    actor: ActorReference
  ): Promise<FlowInstance> {
    const definition = definitions.get(instance.definitionId);
    if (!definition) {
      throw new Error(`Flow definition not found: ${instance.definitionId}`);
    }
    
    // Record step exit
    const exitPayload: FlowStepExecuted = {
      type: 'FlowStepExecuted',
      stepId: step.id,
      action: 'Exit',
    };
    
    await eventStore.append({
      type: 'FlowStepExecuted',
      aggregateId: instance.id,
      aggregateType: 'Flow',
      aggregateVersion: instance.version + 1,
      payload: exitPayload,
      actor,
    });
    
    const updatedInstance = {
      ...instance,
      version: instance.version + 1,
      history: [
        ...instance.history,
        { timestamp: Date.now(), stepId: step.id, action: 'Exit' as const },
      ],
    };
    
    // Check if this is an end step
    if (definition.endSteps.includes(step.id)) {
      return await completeFlow(updatedInstance, 'Success', actor);
    }
    
    // Determine next step
    if (!step.next) {
      throw new Error(`Step ${step.id} has no next step defined`);
    }
    
    if (typeof step.next === 'string') {
      return await executeStep(updatedInstance, step.next, actor);
    }
    
    // Evaluate branches
    for (const branch of step.next) {
      const result = await evaluateCondition(branch.condition, updatedInstance);
      if (result) {
        return await executeStep(updatedInstance, branch.target, actor);
      }
    }
    
    throw new Error(`No branch matched for step: ${step.id}`);
  }
  
  // Complete flow
  async function completeFlow(
    instance: FlowInstance,
    outcome: 'Success' | 'Failure' | 'Cancelled',
    actor: ActorReference
  ): Promise<FlowInstance> {
    const completionPayload: FlowCompleted = {
      type: 'FlowCompleted',
      outcome,
      finalVariables: instance.variables,
    };
    
    await eventStore.append({
      type: 'FlowCompleted',
      aggregateId: instance.id,
      aggregateType: 'Flow',
      aggregateVersion: instance.version + 1,
      payload: completionPayload,
      actor,
    });
    
    return {
      ...instance,
      status: 'Completed',
      version: instance.version + 1,
    };
  }
  
  // Evaluate a condition
  async function evaluateCondition(
    condition: GuardCondition,
    instance: FlowInstance
  ): Promise<boolean> {
    switch (condition.type) {
      case 'HasRole':
        // Check if any active workflow party has this role
        return false; // Simplified - would need context
        
      case 'Custom':
        return await services.executeCustomValidator(
          condition.validatorId,
          { ...condition.params, flowInstance: instance }
        );
        
      default:
        return false;
    }
  }
  
  // Execute an action
  async function executeAction(
    action: WorkflowAction,
    instance: FlowInstance,
    services: FlowServices
  ): Promise<void> {
    switch (action.type) {
      case 'NotifyParty':
        await services.sendNotification(action.partyId, action.template, {
          flowId: instance.id,
          variables: instance.variables,
        });
        break;
        
      case 'EmitEvent':
        await services.emitDomainEvent(action.eventType, action.payload);
        break;
        
      case 'Custom':
        await services.executeCustomHandler(action.handlerId, action.params ?? {});
        break;
    }
  }
  
  return {
    registerDefinition(definition: FlowDefinition): void {
      definitions.set(definition.id, definition);
    },
    
    async startFlow(
      definitionId: EntityId,
      actor: ActorReference,
      initialVariables: Record<string, unknown> = {}
    ): Promise<FlowInstance> {
      const definition = definitions.get(definitionId);
      if (!definition) {
        throw new Error(`Flow definition not found: ${definitionId}`);
      }
      
      // Validate required variables
      for (const variable of definition.variables) {
        if (variable.required && !(variable.name in initialVariables)) {
          if (variable.defaultValue !== undefined) {
            initialVariables[variable.name] = variable.defaultValue;
          } else {
            throw new Error(`Required variable not provided: ${variable.name}`);
          }
        }
      }
      
      const instanceId = generateId();
      const now = Date.now();
      
      const instance: FlowInstance = {
        id: instanceId,
        definitionId,
        definitionVersion: definition.version,
        createdAt: now,
        version: 1,
        status: 'Running',
        currentSteps: [definition.startStep],
        activeWorkflows: [],
        variables: initialVariables,
        history: [],
      };
      
      // Emit creation event
      const creationPayload: FlowInstanceCreated = {
        type: 'FlowInstanceCreated',
        definitionId,
        definitionVersion: definition.version,
        initialVariables,
      };
      
      await eventStore.append({
        type: 'FlowInstanceCreated',
        aggregateId: instanceId,
        aggregateType: 'Flow',
        aggregateVersion: 1,
        payload: creationPayload,
        actor,
      });
      
      instances.set(instanceId, instance);
      
      // Start execution
      const executedInstance = await executeStep(instance, definition.startStep, actor);
      
      return executedInstance;
    },
    
    async resumeFlow(
      instanceId: EntityId,
      event: { type: string; payload: Record<string, unknown> },
      actor: ActorReference
    ): Promise<FlowInstance> {
      const instance = instances.get(instanceId);
      if (!instance) {
        throw new Error(`Flow instance not found: ${instanceId}`);
      }
      
      if (instance.status !== 'Waiting') {
        throw new Error(`Flow is not waiting: ${instance.status}`);
      }
      
      // Check if this is the event we're waiting for
      const waitingFor = instance.variables.__waitingFor as any;
      if (waitingFor?.eventType !== event.type) {
        throw new Error(`Flow is not waiting for event type: ${event.type}`);
      }
      
      // Check filter if any
      if (waitingFor.filter) {
        for (const [key, value] of Object.entries(waitingFor.filter)) {
          if (event.payload[key] !== value) {
            throw new Error(`Event does not match filter`);
          }
        }
      }
      
      // Update variables with event data
      const updatedInstance: FlowInstance = {
        ...instance,
        status: 'Running',
        variables: {
          ...instance.variables,
          __lastEvent: event,
        },
      };
      
      // Remove from waiting list
      waitingFlows.get(event.type)?.delete(instanceId);
      
      // Proceed to next step
      const nextStep = instance.variables.__nextStep as string;
      if (nextStep) {
        return await executeStep(updatedInstance, nextStep, actor);
      }
      
      return updatedInstance;
    },
    
    async cancelFlow(
      instanceId: EntityId,
      reason: string,
      actor: ActorReference
    ): Promise<FlowInstance> {
      const instance = instances.get(instanceId);
      if (!instance) {
        throw new Error(`Flow instance not found: ${instanceId}`);
      }
      
      if (instance.status === 'Completed' || instance.status === 'Cancelled') {
        throw new Error(`Flow already ended: ${instance.status}`);
      }
      
      return await completeFlow(
        {
          ...instance,
          variables: { ...instance.variables, __cancelReason: reason },
        },
        'Cancelled',
        actor
      );
    },
    
    async getInstance(instanceId: EntityId): Promise<FlowInstance | null> {
      return instances.get(instanceId) ?? null;
    },
    
    async getActiveFlows(): Promise<readonly FlowInstance[]> {
      return Array.from(instances.values()).filter(
        i => i.status === 'Running' || i.status === 'Waiting'
      );
    },
  };
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

export interface FlowServices extends WorkflowServices {
  /** Emit a domain event */
  emitDomainEvent(eventType: string, payload: Record<string, unknown>): Promise<void>;
}

function generateId(): EntityId {
  const timestamp = Date.now().toString(16);
  const random = Math.random().toString(16).slice(2, 10);
  return `flow-${timestamp}-${random}`;
}

// ============================================================================
// PREDEFINED FLOW DEFINITIONS
// ============================================================================

/**
 * Sale Flow - Orchestrates a complete sale process
 */
export const SALE_FLOW: FlowDefinition = {
  id: 'flow-sale-standard',
  name: 'Standard Sale Flow',
  version: 1,
  description: 'Orchestrates a complete sale from order to delivery',
  
  variables: [
    { name: 'buyerId', type: 'EntityId', required: true },
    { name: 'sellerId', type: 'EntityId', required: true },
    { name: 'assetIds', type: 'EntityId[]', required: true },
    { name: 'totalAmount', type: 'number', required: true },
    { name: 'currency', type: 'string', required: true, defaultValue: 'BRL' },
  ],
  
  steps: [
    {
      id: 'create-agreement',
      name: 'Create Sale Agreement',
      type: 'Action',
      actions: [
        {
          type: 'Custom',
          handlerId: 'create-sale-agreement',
          params: {},
        },
      ],
      next: 'reserve-assets',
    },
    {
      id: 'reserve-assets',
      name: 'Reserve Assets',
      type: 'Action',
      actions: [
        {
          type: 'Custom',
          handlerId: 'reserve-assets',
          params: {},
        },
      ],
      next: 'start-agreement-workflow',
    },
    {
      id: 'start-agreement-workflow',
      name: 'Start Agreement Workflow',
      type: 'Workflow',
      workflowDefinitionId: 'workflow-agreement-standard',
      input: {},
      next: 'check-agreement-status',
    },
    {
      id: 'check-agreement-status',
      name: 'Check Agreement Status',
      type: 'Decision',
      branches: [
        {
          condition: { type: 'Custom', validatorId: 'agreement-is-active' },
          target: 'wait-for-payment',
        },
        {
          condition: { type: 'Custom', validatorId: 'agreement-is-terminated' },
          target: 'release-assets',
        },
      ],
      default: 'release-assets',
    },
    {
      id: 'wait-for-payment',
      name: 'Wait for Payment',
      type: 'Wait',
      waitFor: {
        type: 'Event',
        eventType: 'PaymentReceived',
        filter: {},
      },
      next: 'transfer-assets',
    },
    {
      id: 'transfer-assets',
      name: 'Transfer Assets',
      type: 'Action',
      actions: [
        {
          type: 'Custom',
          handlerId: 'transfer-assets-to-buyer',
          params: {},
        },
      ],
      next: 'complete-sale',
    },
    {
      id: 'release-assets',
      name: 'Release Reserved Assets',
      type: 'Action',
      actions: [
        {
          type: 'Custom',
          handlerId: 'release-reserved-assets',
          params: {},
        },
      ],
      next: 'sale-cancelled',
    },
    {
      id: 'complete-sale',
      name: 'Complete Sale',
      type: 'Action',
      actions: [
        {
          type: 'Custom',
          handlerId: 'complete-agreement',
          params: {},
        },
        {
          type: 'NotifyParty',
          partyId: '' as EntityId, // Will be filled from variables
          template: 'sale-completed',
        },
      ],
    },
    {
      id: 'sale-cancelled',
      name: 'Sale Cancelled',
      type: 'Action',
      actions: [
        {
          type: 'NotifyParty',
          partyId: '' as EntityId,
          template: 'sale-cancelled',
        },
      ],
    },
  ],
  
  startStep: 'create-agreement',
  endSteps: ['complete-sale', 'sale-cancelled'],
};

