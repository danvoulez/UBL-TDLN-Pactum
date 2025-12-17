/**
 * CONTAINER - The Fractal Primitive
 * 
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                                                                             │
 * │   "A Container is an Asset that holds other Assets,                        │
 * │    governed by an Agreement."                                               │
 * │                                                                             │
 * │   Wallet, Workspace, Realm, Network - they are all Containers.             │
 * │   The difference is not in the code. It's in the Agreement.                │
 * │                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * 
 * This unifies:
 * - Wallet: Container for Credits (strict conservation)
 * - Workspace: Container for Files/Code (versioned replication)
 * - Realm: Container for Entities (constitutional governance)
 * - Network: Container for Links (transient routing)
 */

import type { EntityId, Timestamp, ActorReference } from '../shared/types';
import type { Event, AggregateType } from '../schema/ledger';

// =============================================================================
// CONTAINER PHYSICS - The "Laws of Nature" for this box
// =============================================================================

/**
 * The physics of a container - how it behaves.
 * This is configuration, not implementation.
 */
export interface ContainerPhysics {
  /** 
   * Conservation of Mass rules:
   * - Strict: Items move (debit/credit). Cannot exist in two places. (Money, Unique Identity)
   * - Versioned: Items copy/fork. Originals remain. (Files, Code)
   * - Transient: Items flow through but don't stay. (Network packets)
   */
  readonly fungibility: 'Strict' | 'Versioned' | 'Transient';

  /**
   * What fits inside?
   * - Values: Pure quantities (Currencies)
   * - Objects: Passive assets (Files, Products)
   * - Subjects: Active entities (People, Agents)
   * - Links: Connections/Routes (Graph edges)
   */
  readonly topology: 'Values' | 'Objects' | 'Subjects' | 'Links';

  /**
   * Input/Output Rules:
   * - Sealed: Nothing in/out without explicit admin action (Cold Storage)
   * - Gated: Requires visa/permission (Realms, Private Wallets)
   * - Collaborative: Open to members (Workspaces)
   * - Open: Public access (Public Networks)
   */
  readonly permeability: 'Sealed' | 'Gated' | 'Collaborative' | 'Open';

  /**
   * Can code run here?
   * - Disabled: Inert storage (Wallets)
   * - Sandboxed: Isolated execution (Workspaces)
   * - Full: System level access (Root Realm)
   */
  readonly execution: 'Disabled' | 'Sandboxed' | 'Full';
}

// =============================================================================
// CONTAINER PHYSICS PRESETS
// =============================================================================

export const CONTAINER_PHYSICS = {
  /** A digital wallet or safe */
  Wallet: {
    fungibility: 'Strict',
    topology: 'Values',
    permeability: 'Sealed',
    execution: 'Disabled',
  } as ContainerPhysics,

  /** A code workspace or folder */
  Workspace: {
    fungibility: 'Versioned',
    topology: 'Objects',
    permeability: 'Collaborative',
    execution: 'Sandboxed',
  } as ContainerPhysics,

  /** A tenant or domain (Realm) */
  Realm: {
    fungibility: 'Strict',
    topology: 'Subjects',
    permeability: 'Gated',
    execution: 'Full',
  } as ContainerPhysics,

  /** A network graph */
  Network: {
    fungibility: 'Transient',
    topology: 'Links',
    permeability: 'Open',
    execution: 'Disabled',
  } as ContainerPhysics,
  
  /** Warehouse or Inventory */
  Inventory: {
    fungibility: 'Strict',
    topology: 'Objects',
    permeability: 'Gated',
    execution: 'Disabled',
  } as ContainerPhysics,
} as const;

export type ContainerType = keyof typeof CONTAINER_PHYSICS;

// =============================================================================
// QUANTITY - For fungible items
// =============================================================================

export interface Quantity {
  readonly amount: number;
  readonly unit: string;
}

// =============================================================================
// CONTAINER AGGREGATE
// =============================================================================

export interface Container {
  readonly id: EntityId;
  readonly realmId: EntityId;
  readonly name: string;
  
  /** The type of container (Wallet, Workspace, Realm, etc.) */
  readonly containerType: ContainerType | string;
  
  /** The physics governing this container's behavior */
  readonly physics: ContainerPhysics;
  
  /** The Agreement that governs this container */
  readonly governanceAgreementId: EntityId;
  
  /** Who owns this container? */
  readonly ownerId: EntityId;
  
  /** Parent container (for nesting) */
  readonly parentContainerId?: EntityId;
  
  /** The Contents (Inventory) */
  readonly items: Map<EntityId, ContainerItem>;
  
  /** Aggregate version */
  readonly version: number;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export interface ContainerItem {
  readonly id: EntityId;
  readonly type: AggregateType; // 'Asset' or 'Entity'
  
  /** For fungible items (Values) */
  readonly quantity?: Quantity;
  
  /** For non-fungible items (Objects/Subjects) */
  readonly metadata?: Record<string, unknown>;
  
  readonly addedAt: Timestamp;
  readonly addedBy?: EntityId;
}

// =============================================================================
// CONTAINER EVENTS
// =============================================================================

export interface ContainerCreated extends Event {
  readonly type: 'ContainerCreated';
  readonly payload: {
    readonly type: 'ContainerCreated';
    readonly name: string;
    readonly containerType: ContainerType | string;
    readonly physics: ContainerPhysics;
    readonly governanceAgreementId: EntityId;
    readonly realmId: EntityId;
    readonly ownerId: EntityId;
    readonly parentContainerId?: EntityId;
  };
}

export interface ContainerItemDeposited extends Event {
  readonly type: 'ContainerItemDeposited';
  readonly payload: {
    readonly type: 'ContainerItemDeposited';
    readonly containerId: EntityId;
    readonly itemId: EntityId;
    readonly itemType: AggregateType;
    readonly quantity?: Quantity;
    readonly metadata?: Record<string, unknown>;
    readonly sourceContainerId?: EntityId;
    readonly transferId?: EntityId;
  };
}

export interface ContainerItemWithdrawn extends Event {
  readonly type: 'ContainerItemWithdrawn';
  readonly payload: {
    readonly type: 'ContainerItemWithdrawn';
    readonly containerId: EntityId;
    readonly itemId: EntityId;
    readonly quantity?: Quantity;
    readonly destContainerId?: EntityId;
    readonly transferId?: EntityId;
    readonly reason?: string;
  };
}

export interface ContainerPhysicsUpdated extends Event {
  readonly type: 'ContainerPhysicsUpdated';
  readonly payload: {
    readonly type: 'ContainerPhysicsUpdated';
    readonly containerId: EntityId;
    readonly changes: Partial<ContainerPhysics>;
    readonly reason: string;
  };
}

export type ContainerEvent = 
  | ContainerCreated 
  | ContainerItemDeposited 
  | ContainerItemWithdrawn 
  | ContainerPhysicsUpdated;

// =============================================================================
// REHYDRATOR - Reconstruct state from events
// =============================================================================

export const containerRehydrator = {
  initialState(id: EntityId): Container {
    return {
      id,
      realmId: '' as EntityId,
      name: '',
      containerType: 'Wallet',
      physics: CONTAINER_PHYSICS.Wallet,
      governanceAgreementId: '' as EntityId,
      ownerId: '' as EntityId,
      items: new Map(),
      version: 0,
      createdAt: 0 as Timestamp,
      updatedAt: 0 as Timestamp,
    };
  },

  apply(state: Container, event: Event): Container {
    switch (event.type) {
      case 'ContainerCreated': {
        const p = event.payload as ContainerCreated['payload'];
        return {
          ...state,
          realmId: p.realmId,
          name: p.name,
          containerType: p.containerType,
          physics: p.physics,
          governanceAgreementId: p.governanceAgreementId,
          ownerId: p.ownerId,
          parentContainerId: p.parentContainerId,
          version: event.aggregateVersion,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };
      }

      case 'ContainerItemDeposited': {
        const p = event.payload as ContainerItemDeposited['payload'];
        const items = new Map(state.items);
        
        // Handle fungible quantity aggregation
        const existing = items.get(p.itemId);
        let newQuantity = p.quantity;
        
        if (existing?.quantity && p.quantity) {
          newQuantity = {
            ...existing.quantity,
            amount: existing.quantity.amount + p.quantity.amount,
          };
        }

        items.set(p.itemId, {
          id: p.itemId,
          type: p.itemType,
          quantity: newQuantity,
          metadata: { ...existing?.metadata, ...p.metadata },
          addedAt: event.timestamp,
        });

        return {
          ...state,
          items,
          version: event.aggregateVersion,
          updatedAt: event.timestamp,
        };
      }

      case 'ContainerItemWithdrawn': {
        const p = event.payload as ContainerItemWithdrawn['payload'];
        const items = new Map(state.items);
        const existing = items.get(p.itemId);

        if (!existing) return state;

        // Handle partial withdrawal of fungible items
        if (existing.quantity && p.quantity) {
          const remaining = existing.quantity.amount - p.quantity.amount;
          if (remaining > 0) {
            items.set(p.itemId, {
              ...existing,
              quantity: { ...existing.quantity, amount: remaining },
            });
          } else {
            items.delete(p.itemId);
          }
        } else {
          // Non-fungible or full withdrawal
          items.delete(p.itemId);
        }

        return {
          ...state,
          items,
          version: event.aggregateVersion,
          updatedAt: event.timestamp,
        };
      }

      case 'ContainerPhysicsUpdated': {
        const p = event.payload as ContainerPhysicsUpdated['payload'];
        return {
          ...state,
          physics: { ...state.physics, ...p.changes },
          version: event.aggregateVersion,
          updatedAt: event.timestamp,
        };
      }

      default:
        return state;
    }
  },
};

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate that an item can be deposited into a container.
 */
export function validateDeposit(
  container: Container,
  item: { type: AggregateType; quantity?: Quantity }
): { valid: boolean; reason?: string } {
  const p = container.physics;
  
  // Check Topology
  if (p.topology === 'Values' && !item.quantity) {
    return { valid: false, reason: `Container only accepts Values (Quantities)` };
  }
  if (p.topology === 'Subjects' && item.type !== 'Party') {
    return { valid: false, reason: `Container only accepts Subjects (Entities)` };
  }
  if (p.topology === 'Objects' && item.type !== 'Asset') {
    return { valid: false, reason: `Container only accepts Objects (Assets)` };
  }
  
  return { valid: true };
}

/**
 * Validate a transfer between containers.
 */
export function validateTransfer(
  source: Container,
  dest: Container,
  itemId: EntityId,
  quantity?: Quantity
): { valid: boolean; reason?: string; mode?: 'Move' | 'Copy' } {
  const item = source.items.get(itemId);
  if (!item) {
    return { valid: false, reason: 'Item not found in source container' };
  }
  
  // Check quantity for fungible items
  if (quantity && item.quantity) {
    if (item.quantity.amount < quantity.amount) {
      return { valid: false, reason: `Insufficient quantity. Have: ${item.quantity.amount}, Need: ${quantity.amount}` };
    }
  }
  
  // Determine transfer mode based on physics
  const mode = source.physics.fungibility === 'Strict' ? 'Move' : 'Copy';
  
  // Validate destination can accept
  const depositCheck = validateDeposit(dest, { type: item.type, quantity });
  if (!depositCheck.valid) {
    return depositCheck;
  }
  
  // Cross-realm checks
  if (source.realmId !== dest.realmId) {
    if (source.physics.permeability === 'Sealed') {
      return { valid: false, reason: 'Source container is sealed' };
    }
    if (dest.physics.permeability === 'Sealed') {
      return { valid: false, reason: 'Destination container is sealed' };
    }
  }
  
  return { valid: true, mode };
}

// =============================================================================
// PHILOSOPHICAL CONCLUSION
// =============================================================================

/**
 * The difference between a Wallet and a Workspace is not in the code.
 * It's in the Agreement.
 * 
 * A Wallet is just a Folder where the Agreement says "You cannot copy files."
 * A Realm is just a Folder where the Agreement says "Everyone inside must obey me."
 * A Network is just a Folder where the Agreement says "You can pass through."
 * 
 * This keeps the kernel incredibly small.
 * You don't program "money features" - you program "conservation constraints."
 */
