/**
 * AGGREGATE REHYDRATORS - State Reconstruction from Events
 * 
 * Rehydrators reconstruct the current state of an aggregate by replaying
 * its events. This is the heart of event sourcing - state is DERIVED,
 * never stored directly.
 */

import type {
  EntityId,
  Timestamp,
  Party,
  PartyType,
  PartyIdentity,
  PartyRegistered,
  PartyIdentityUpdated,
  Asset,
  AssetStatus,
  AssetCreated,
  AssetTransferred,
  AssetStatusChanged,
  Agreement,
  AgreementStatus,
  AgreementParty,
  AgreementTerms,
  AgreementCreated,
  AgreementStatusChanged,
  ConsentGiven,
  Role,
  RoleContext,
  RoleGranted,
  RoleRevoked,
  Event,
} from '../schema/ledger';

import type { 
  WorkflowInstance, 
  WorkflowInstanceCreated, 
  WorkflowTransitioned, 
  WorkflowCompleted 
} from '../schema/workflow';

import type { AggregateRehydrator, EventStore } from '../store/event-store';

// ============================================================================
// PARTY REHYDRATOR
// ============================================================================

export interface PartyState extends Party {
  readonly exists: boolean;
}

const INITIAL_PARTY_STATE: PartyState = {
  exists: false,
  id: '' as EntityId,
  type: 'Person',
  createdAt: 0,
  version: 0,
  identity: {
    name: '',
    identifiers: [],
  },
  activeRoles: [],
};

export const partyRehydrator: AggregateRehydrator<PartyState, Event> = {
  initialState: INITIAL_PARTY_STATE,
  
  apply(state: PartyState, event: Event): PartyState {
    switch (event.type) {
      case 'PartyRegistered': {
        const payload = event.payload as PartyRegistered;
        return {
          exists: true,
          id: event.aggregateId,
          type: payload.partyType,
          createdAt: event.timestamp,
          version: event.aggregateVersion,
          identity: payload.identity,
          activeRoles: [],
        };
      }
      
      case 'PartyIdentityUpdated': {
        const payload = event.payload as PartyIdentityUpdated;
        return {
          ...state,
          version: event.aggregateVersion,
          identity: {
            ...state.identity,
            ...payload.identity,
            identifiers: payload.identity.identifiers ?? state.identity.identifiers,
            contacts: payload.identity.contacts ?? state.identity.contacts,
          },
        };
      }
      
      case 'RoleGranted': {
        // A party's active roles are updated when roles are granted
        const payload = event.payload as RoleGranted;
        if (payload.holderId === state.id) {
          return {
            ...state,
            version: event.aggregateVersion,
            activeRoles: [...state.activeRoles, event.aggregateId],
          };
        }
        return state;
      }
      
      case 'RoleRevoked': {
        // Remove revoked role from active roles
        return {
          ...state,
          version: event.aggregateVersion,
          activeRoles: state.activeRoles.filter(r => r !== event.aggregateId),
        };
      }
      
      default:
        return state;
    }
  },
};

// ============================================================================
// ASSET REHYDRATOR
// ============================================================================

export interface AssetState extends Asset {
  readonly exists: boolean;
  readonly lastTransferAgreementId?: EntityId;
}

const INITIAL_ASSET_STATE: AssetState = {
  exists: false,
  id: '' as EntityId,
  assetType: '',
  createdAt: 0,
  version: 0,
  status: 'Created',
  properties: {},
};

export const assetRehydrator: AggregateRehydrator<AssetState, Event> = {
  initialState: INITIAL_ASSET_STATE,
  
  apply(state: AssetState, event: Event): AssetState {
    switch (event.type) {
      case 'AssetCreated': {
        const payload = event.payload as AssetCreated;
        return {
          exists: true,
          id: event.aggregateId,
          assetType: payload.assetType,
          createdAt: event.timestamp,
          version: event.aggregateVersion,
          status: 'Created',
          ownerId: payload.ownerId,
          properties: payload.properties,
          quantity: payload.quantity,
        };
      }
      
      case 'AssetTransferred': {
        const payload = event.payload as AssetTransferred;
        return {
          ...state,
          version: event.aggregateVersion,
          status: 'Transferred',
          ownerId: payload.transferType === 'Ownership' ? payload.toPartyId : state.ownerId,
          custodianId: payload.transferType === 'Custody' ? payload.toPartyId : state.custodianId,
          lastTransferAgreementId: payload.agreementId,
        };
      }
      
      case 'AssetStatusChanged': {
        const payload = event.payload as AssetStatusChanged;
        return {
          ...state,
          version: event.aggregateVersion,
          status: payload.newStatus,
        };
      }
      
      default:
        return state;
    }
  },
};

// ============================================================================
// AGREEMENT REHYDRATOR
// ============================================================================

export interface AgreementState extends Agreement {
  readonly exists: boolean;
  /** Open dispute on this agreement (only one at a time) */
  readonly openDispute?: {
    readonly disputeId: EntityId;
    readonly reason: string;
    readonly openedAt: Timestamp;
    readonly evidence?: readonly { kind: string; uri: string; hash?: string; note?: string }[];
  };
  /** Evidence provided at fulfillment */
  readonly fulfillmentEvidence?: readonly { kind: string; uri: string; hash?: string; note?: string }[];
  readonly fulfilledAt?: Timestamp;
}

const INITIAL_AGREEMENT_STATE: AgreementState = {
  exists: false,
  id: '' as EntityId,
  agreementType: '',
  createdAt: 0,
  version: 0,
  status: 'Draft',
  parties: [],
  terms: {
    description: '',
    clauses: [],
  },
  validity: {
    effectiveFrom: 0,
  },
};

export const agreementRehydrator: AggregateRehydrator<AgreementState, Event> = {
  initialState: INITIAL_AGREEMENT_STATE,
  
  apply(state: AgreementState, event: Event): AgreementState {
    switch (event.type) {
      case 'AgreementCreated': {
        const payload = event.payload as AgreementCreated;
        return {
          exists: true,
          id: event.aggregateId,
          agreementType: payload.agreementType,
          createdAt: event.timestamp,
          version: event.aggregateVersion,
          status: 'Draft',
          parties: payload.parties,
          terms: payload.terms,
          assets: payload.assets,
          validity: payload.validity,
        };
      }
      
      case 'AgreementStatusChanged': {
        const payload = event.payload as AgreementStatusChanged;
        return {
          ...state,
          version: event.aggregateVersion,
          status: payload.newStatus,
        };
      }
      
      case 'ConsentGiven': {
        const payload = event.payload as ConsentGiven;
        return {
          ...state,
          version: event.aggregateVersion,
          parties: state.parties.map(party =>
            party.partyId === payload.partyId
              ? {
                  ...party,
                  consent: {
                    givenAt: event.timestamp,
                    method: payload.method,
                    evidence: payload.evidence,
                  },
                }
              : party
          ),
        };
      }
      
      case 'AgreementFulfilled': {
        const payload = event.payload as any;
        return {
          ...state,
          version: event.aggregateVersion,
          status: 'Fulfilled' as const,
          fulfillmentEvidence: payload.evidence,
          fulfilledAt: payload.fulfilledAt || event.timestamp,
        };
      }
      
      case 'DisputeOpened': {
        const payload = event.payload as any;
        return {
          ...state,
          version: event.aggregateVersion,
          openDispute: {
            disputeId: payload.disputeId,
            reason: payload.reason,
            openedAt: payload.openedAt || event.timestamp,
            evidence: payload.evidence,
          },
        };
      }
      
      case 'DisputeResolved': {
        return {
          ...state,
          version: event.aggregateVersion,
          openDispute: undefined,
        };
      }
      
      // Handle AgreementProposed (from intent-api.ts propose handler)
      case 'AgreementProposed': {
        const payload = event.payload as any;
        return {
          exists: true,
          id: event.aggregateId,
          agreementType: payload.agreementType,
          createdAt: event.timestamp,
          version: event.aggregateVersion,
          status: 'Proposed' as const,
          parties: (payload.parties || []).map((p: any) => ({
            partyId: p.entityId || p.partyId,
            role: p.role,
            obligations: p.obligations || [],
            rights: p.rights || [],
          })),
          terms: payload.terms || { description: '', clauses: [] },
          assets: payload.assets,
          validity: payload.validity || { effectiveFrom: event.timestamp },
        };
      }
      
      default:
        return state;
    }
  },
};

// ============================================================================
// ROLE REHYDRATOR
// ============================================================================

export interface RoleState extends Role {
  readonly exists: boolean;
}

const INITIAL_ROLE_STATE: RoleState = {
  exists: false,
  id: '' as EntityId,
  roleType: '',
  createdAt: 0,
  version: 0,
  holderId: '' as EntityId,
  context: { type: 'Global' },
  validity: {
    from: 0,
  },
  isActive: false,
  establishedBy: '' as EntityId,
};

export const roleRehydrator: AggregateRehydrator<RoleState, Event> = {
  initialState: INITIAL_ROLE_STATE,
  
  apply(state: RoleState, event: Event): RoleState {
    switch (event.type) {
      case 'RoleGranted': {
        const payload = event.payload as RoleGranted;
        return {
          exists: true,
          id: event.aggregateId,
          roleType: payload.roleType,
          createdAt: event.timestamp,
          version: event.aggregateVersion,
          holderId: payload.holderId,
          context: payload.context,
          validity: {
            from: payload.validFrom,
            until: payload.validUntil,
          },
          isActive: true,
          establishedBy: payload.grantedBy,
        };
      }
      
      case 'RoleRevoked': {
        const payload = event.payload as RoleRevoked;
        return {
          ...state,
          version: event.aggregateVersion,
          isActive: false,
          validity: {
            ...state.validity,
            until: payload.effectiveAt,
          },
        };
      }
      
      default:
        return state;
    }
  },
};

// ============================================================================
// WORKFLOW INSTANCE REHYDRATOR
// ============================================================================

export interface WorkflowInstanceState extends WorkflowInstance {
  readonly exists: boolean;
}

const INITIAL_WORKFLOW_STATE: WorkflowInstanceState = {
  exists: false,
  id: '' as EntityId,
  definitionId: '' as EntityId,
  definitionVersion: 0,
  createdAt: 0,
  version: 0,
  targetAggregate: { type: 'Agreement', id: '' as EntityId },
  currentState: '',
  history: [],
  isComplete: false,
  context: {},
};

export const workflowRehydrator: AggregateRehydrator<WorkflowInstanceState, Event> = {
  initialState: INITIAL_WORKFLOW_STATE,
  
  apply(state: WorkflowInstanceState, event: Event): WorkflowInstanceState {
    switch (event.type) {
      case 'WorkflowInstanceCreated': {
        const payload = event.payload as WorkflowInstanceCreated;
        return {
          exists: true,
          id: event.aggregateId,
          definitionId: payload.definitionId,
          definitionVersion: payload.definitionVersion,
          createdAt: event.timestamp,
          version: event.aggregateVersion,
          targetAggregate: payload.targetAggregate,
          currentState: payload.initialState,
          history: [],
          isComplete: false,
          context: payload.context,
        };
      }
      
      case 'WorkflowTransitioned': {
        const payload = event.payload as WorkflowTransitioned;
        return {
          ...state,
          version: event.aggregateVersion,
          currentState: payload.toState,
          history: [
            ...state.history,
            {
              timestamp: event.timestamp,
              transition: payload.transition,
              fromState: payload.fromState,
              toState: payload.toState,
              actor: event.actor,
              eventId: event.id,
            },
          ],
        };
      }
      
      case 'WorkflowCompleted': {
        const payload = event.payload as WorkflowCompleted;
        return {
          ...state,
          version: event.aggregateVersion,
          isComplete: true,
          completedAt: event.timestamp,
        };
      }
      
      default:
        return state;
    }
  },
};

// ============================================================================
// AGGREGATE REPOSITORY - Unified access to all aggregates
// ============================================================================

export interface AggregateRepository {
  /** Get a Party by ID */
  getParty(id: EntityId): Promise<PartyState | null>;
  
  /** Get a Party at a specific point in time */
  getPartyAt(id: EntityId, at: { version?: number; timestamp?: Timestamp }): Promise<PartyState | null>;
  
  /** Get an Asset by ID */
  getAsset(id: EntityId): Promise<AssetState | null>;
  
  /** Get an Asset at a specific point in time */
  getAssetAt(id: EntityId, at: { version?: number; timestamp?: Timestamp }): Promise<AssetState | null>;
  
  /** Get an Agreement by ID */
  getAgreement(id: EntityId): Promise<AgreementState | null>;
  
  /** Get an Agreement at a specific point in time */
  getAgreementAt(id: EntityId, at: { version?: number; timestamp?: Timestamp }): Promise<AgreementState | null>;
  
  /** Get a Role by ID */
  getRole(id: EntityId): Promise<RoleState | null>;
  
  /** Get all active roles for a party */
  getActiveRolesForParty(partyId: EntityId): Promise<readonly RoleState[]>;
  
  /** Get a Workflow Instance by ID */
  getWorkflowInstance(id: EntityId): Promise<WorkflowInstanceState | null>;
  
  /** Get Workflow Instance for an aggregate */
  getWorkflowForAggregate(
    aggregateType: string,
    aggregateId: EntityId
  ): Promise<WorkflowInstanceState | null>;
}

export function createAggregateRepository(eventStore: EventStore): AggregateRepository {
  // Helper to reconstruct any aggregate
  async function reconstruct<TState>(
    aggregateType: string,
    aggregateId: EntityId,
    rehydrator: AggregateRehydrator<TState, Event>,
    options?: { atVersion?: number; atTimestamp?: Timestamp }
  ): Promise<TState> {
    let state = rehydrator.initialState;
    
    for await (const event of eventStore.getByAggregate(
      aggregateType as any,
      aggregateId,
      {
        toVersion: options?.atVersion,
        toTimestamp: options?.atTimestamp,
      }
    )) {
      state = rehydrator.apply(state, event);
    }
    
    return state;
  }
  
  return {
    async getParty(id: EntityId): Promise<PartyState | null> {
      const state = await reconstruct('Party', id, partyRehydrator);
      return state.exists ? state : null;
    },
    
    async getPartyAt(id: EntityId, at: { version?: number; timestamp?: Timestamp }): Promise<PartyState | null> {
      const state = await reconstruct('Party', id, partyRehydrator, {
        atVersion: at.version,
        atTimestamp: at.timestamp,
      });
      return state.exists ? state : null;
    },
    
    async getAsset(id: EntityId): Promise<AssetState | null> {
      const state = await reconstruct('Asset', id, assetRehydrator);
      return state.exists ? state : null;
    },
    
    async getAssetAt(id: EntityId, at: { version?: number; timestamp?: Timestamp }): Promise<AssetState | null> {
      const state = await reconstruct('Asset', id, assetRehydrator, {
        atVersion: at.version,
        atTimestamp: at.timestamp,
      });
      return state.exists ? state : null;
    },
    
    async getAgreement(id: EntityId): Promise<AgreementState | null> {
      const state = await reconstruct('Agreement', id, agreementRehydrator);
      return state.exists ? state : null;
    },
    
    async getAgreementAt(id: EntityId, at: { version?: number; timestamp?: Timestamp }): Promise<AgreementState | null> {
      const state = await reconstruct('Agreement', id, agreementRehydrator, {
        atVersion: at.version,
        atTimestamp: at.timestamp,
      });
      return state.exists ? state : null;
    },
    
    async getRole(id: EntityId): Promise<RoleState | null> {
      const state = await reconstruct('Role', id, roleRehydrator);
      return state.exists ? state : null;
    },
    
    async getActiveRolesForParty(partyId: EntityId): Promise<readonly RoleState[]> {
      // This would need an index or projection in production
      // For now, we'd need to scan all roles
      const roles: RoleState[] = [];
      
      // In a real implementation, you'd query a projection
      // that indexes roles by holder
      
      return roles.filter(r => r.isActive && r.holderId === partyId);
    },
    
    async getWorkflowInstance(id: EntityId): Promise<WorkflowInstanceState | null> {
      const state = await reconstruct('Workflow', id, workflowRehydrator);
      return state.exists ? state : null;
    },
    
    async getWorkflowForAggregate(
      aggregateType: string,
      aggregateId: EntityId
    ): Promise<WorkflowInstanceState | null> {
      // This would need an index or projection in production
      // For now, return null
      return null;
    },
  };
}

// ============================================================================
// TEMPORAL QUERIES - Point-in-time and difference queries
// ============================================================================

export interface TemporalQueries {
  /**
   * Get the state of an aggregate at a specific point in time
   */
  getStateAt<T>(
    aggregateType: string,
    aggregateId: EntityId,
    at: Timestamp
  ): Promise<T | null>;
  
  /**
   * Get the differences between two versions of an aggregate
   */
  getDiff(
    aggregateType: string,
    aggregateId: EntityId,
    fromVersion: number,
    toVersion: number
  ): Promise<readonly Event[]>;
  
  /**
   * Get all events that affected an aggregate in a time range
   */
  getHistory(
    aggregateType: string,
    aggregateId: EntityId,
    from?: Timestamp,
    to?: Timestamp
  ): Promise<readonly Event[]>;
}

export function createTemporalQueries(eventStore: EventStore): TemporalQueries {
  return {
    async getStateAt<T>(
      aggregateType: string,
      aggregateId: EntityId,
      at: Timestamp
    ): Promise<T | null> {
      // Select the appropriate rehydrator
      let rehydrator: AggregateRehydrator<any, Event>;
      
      switch (aggregateType) {
        case 'Party':
          rehydrator = partyRehydrator;
          break;
        case 'Asset':
          rehydrator = assetRehydrator;
          break;
        case 'Agreement':
          rehydrator = agreementRehydrator;
          break;
        case 'Role':
          rehydrator = roleRehydrator;
          break;
        case 'Workflow':
          rehydrator = workflowRehydrator;
          break;
        default:
          return null;
      }
      
      let state = rehydrator.initialState;
      
      for await (const event of eventStore.getByAggregate(
        aggregateType as any,
        aggregateId,
        { toTimestamp: at }
      )) {
        state = rehydrator.apply(state, event);
      }
      
      return state.exists ? state : null;
    },
    
    async getDiff(
      aggregateType: string,
      aggregateId: EntityId,
      fromVersion: number,
      toVersion: number
    ): Promise<readonly Event[]> {
      const events: Event[] = [];
      
      for await (const event of eventStore.getByAggregate(
        aggregateType as any,
        aggregateId,
        { fromVersion: fromVersion + 1, toVersion }
      )) {
        events.push(event);
      }
      
      return events;
    },
    
    async getHistory(
      aggregateType: string,
      aggregateId: EntityId,
      from?: Timestamp,
      to?: Timestamp
    ): Promise<readonly Event[]> {
      const events: Event[] = [];
      
      for await (const event of eventStore.getByAggregate(
        aggregateType as any,
        aggregateId,
        { fromTimestamp: from, toTimestamp: to }
      )) {
        events.push(event);
      }
      
      return events;
    },
  };
}

