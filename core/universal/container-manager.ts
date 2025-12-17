/**
 * CONTAINER MANAGER - The Unified Service
 * 
 * One service to rule them all.
 * 
 * Instead of:
 * - WalletService
 * - WorkspaceManager  
 * - RealmManager
 * - NetworkService
 * 
 * We have ONE ContainerManager that handles all container types.
 * The behavior differences come from the Container's physics,
 * which are defined by its Governance Agreement.
 */

import type { EntityId, ActorReference, Timestamp } from '../shared/types';
import type { EventStore } from '../store/event-store';
import type { AggregateType } from '../schema/ledger';
import { 
  containerRehydrator, 
  CONTAINER_PHYSICS, 
  validateDeposit,
  validateTransfer,
  type Container, 
  type ContainerPhysics,
  type ContainerType,
  type ContainerItem,
  type Quantity,
} from './container';

// =============================================================================
// CONTAINER MANAGER
// =============================================================================

export class ContainerManager {
  constructor(private readonly eventStore: EventStore) {}

  // ===========================================================================
  // CORE OPERATIONS
  // ===========================================================================

  /**
   * Create a new container with specified physics.
   */
  async create(
    name: string,
    containerType: ContainerType | string,
    physics: ContainerPhysics,
    owner: ActorReference,
    realmId: EntityId,
    parentContainerId?: EntityId
  ): Promise<Container> {
    const id = this.generateId('container');
    const governanceAgreementId = this.generateId('agreement');
    const ownerId = this.getActorEntityId(owner);
    
    // Create the governance agreement first
    await this.eventStore.append({
      type: 'AgreementProposed',
      aggregateType: 'Agreement' as AggregateType,
      aggregateId: governanceAgreementId,
      aggregateVersion: 1,
      actor: owner,
      timestamp: Date.now(),
      payload: {
        type: 'AgreementProposed',
        agreementType: 'ContainerGovernance',
        parties: [{ entityId: ownerId, role: 'Owner' }],
        terms: { containerType, physics },
      },
    });
    
    // Auto-activate
    await this.eventStore.append({
      type: 'AgreementStatusChanged',
      aggregateType: 'Agreement' as AggregateType,
      aggregateId: governanceAgreementId,
      aggregateVersion: 2,
      actor: owner,
      timestamp: Date.now(),
      payload: {
        type: 'AgreementStatusChanged',
        previousStatus: 'Proposed',
        newStatus: 'Active',
      },
    });
    
    // Create the container
    await this.eventStore.append({
      type: 'ContainerCreated',
      aggregateType: 'Container' as AggregateType,
      aggregateId: id,
      aggregateVersion: 1,
      actor: owner,
      timestamp: Date.now(),
      payload: {
        type: 'ContainerCreated',
        name,
        containerType,
        physics,
        governanceAgreementId,
        realmId,
        ownerId,
        parentContainerId,
      },
    });

    return this.get(id);
  }

  /**
   * Get a container by ID.
   */
  async get(id: EntityId): Promise<Container> {
    let state = containerRehydrator.initialState(id);
    
    for await (const event of this.eventStore.getByAggregate('Container' as AggregateType, id)) {
      state = containerRehydrator.apply(state, event);
    }

    if (!state.createdAt) {
      throw new Error(`Container ${id} not found`);
    }
    return state;
  }

  /**
   * Deposit an item into a container.
   */
  async deposit(
    containerId: EntityId,
    item: { 
      id: EntityId; 
      type: AggregateType; 
      quantity?: Quantity; 
      metadata?: Record<string, unknown>;
    },
    actor: ActorReference,
    sourceInfo?: { sourceContainerId: EntityId; transferId: EntityId }
  ): Promise<void> {
    const container = await this.get(containerId);
    
    // Validate physics
    const validation = validateDeposit(container, item);
    if (!validation.valid) {
      throw new Error(`Deposit denied: ${validation.reason}`);
    }

    const nextVersion = container.version + 1;

    await this.eventStore.append({
      type: 'ContainerItemDeposited',
      aggregateType: 'Container' as AggregateType,
      aggregateId: containerId,
      aggregateVersion: nextVersion,
      actor,
      timestamp: Date.now(),
      payload: {
        type: 'ContainerItemDeposited',
        containerId,
        itemId: item.id,
        itemType: item.type,
        quantity: item.quantity,
        metadata: item.metadata,
        sourceContainerId: sourceInfo?.sourceContainerId,
        transferId: sourceInfo?.transferId,
      },
    });
  }

  /**
   * Withdraw an item from a container.
   */
  async withdraw(
    containerId: EntityId,
    itemId: EntityId,
    quantity: Quantity | undefined,
    actor: ActorReference,
    destInfo?: { destContainerId: EntityId; transferId: EntityId },
    reason?: string
  ): Promise<void> {
    const container = await this.get(containerId);
    const item = container.items.get(itemId);

    if (!item) {
      throw new Error(`Item ${itemId} not found in container ${containerId}`);
    }
    
    // Check quantity for fungible items
    if (quantity && item.quantity) {
      if (item.quantity.amount < quantity.amount) {
        throw new Error(`Insufficient quantity. Have: ${item.quantity.amount}, Need: ${quantity.amount}`);
      }
    }

    const nextVersion = container.version + 1;

    await this.eventStore.append({
      type: 'ContainerItemWithdrawn',
      aggregateType: 'Container' as AggregateType,
      aggregateId: containerId,
      aggregateVersion: nextVersion,
      actor,
      timestamp: Date.now(),
      payload: {
        type: 'ContainerItemWithdrawn',
        containerId,
        itemId,
        quantity,
        destContainerId: destInfo?.destContainerId,
        transferId: destInfo?.transferId,
        reason,
      },
    });
  }

  /**
   * THE UNIVERSAL TRANSFER
   * 
   * Moves anything from anywhere to anywhere, respecting physics.
   * - Pay someone: Transfer credits between wallets (Strict → Move)
   * - Deploy code: Transfer files between workspaces (Versioned → Copy)
   * - Migrate tenant: Transfer entity between realms (Strict → Move)
   */
  async transfer(
    fromContainerId: EntityId,
    toContainerId: EntityId,
    itemId: EntityId,
    quantity: Quantity | undefined,
    actor: ActorReference,
    agreementId?: EntityId
  ): Promise<void> {
    const source = await this.get(fromContainerId);
    const dest = await this.get(toContainerId);
    const item = source.items.get(itemId);

    if (!item) {
      throw new Error(`Item ${itemId} not found in source container`);
    }

    // Validate transfer
    const validation = validateTransfer(source, dest, itemId, quantity);
    if (!validation.valid) {
      throw new Error(`Transfer denied: ${validation.reason}`);
    }

    const transferId = this.generateId('tx');
    const isMove = validation.mode === 'Move';

    // 1. Withdraw from source (if Move/Strict physics)
    if (isMove) {
      await this.withdraw(fromContainerId, itemId, quantity, actor, {
        destContainerId: toContainerId,
        transferId,
      }, `Transfer to ${toContainerId}`);
    }

    // 2. Deposit to destination
    // For Copy (Versioned), we could generate a new ID, but keeping same for simplicity
    await this.deposit(toContainerId, {
      id: itemId,
      type: item.type,
      quantity: quantity || item.quantity,
      metadata: item.metadata,
    }, actor, {
      sourceContainerId: fromContainerId,
      transferId,
    });
  }

  /**
   * List items in a container.
   */
  async listItems(containerId: EntityId): Promise<readonly ContainerItem[]> {
    const container = await this.get(containerId);
    return Array.from(container.items.values());
  }

  // ===========================================================================
  // CONVENIENCE FACTORIES
  // ===========================================================================

  /**
   * Create a Wallet (strict conservation, sealed).
   */
  async createWallet(name: string, owner: ActorReference, realmId: EntityId): Promise<Container> {
    return this.create(name, 'Wallet', CONTAINER_PHYSICS.Wallet, owner, realmId);
  }

  /**
   * Create a Workspace (versioned, collaborative).
   */
  async createWorkspace(
    name: string, 
    owner: ActorReference, 
    realmId: EntityId,
    parentContainerId?: EntityId
  ): Promise<Container> {
    return this.create(name, 'Workspace', CONTAINER_PHYSICS.Workspace, owner, realmId, parentContainerId);
  }

  /**
   * Create a Realm (constitutional governance).
   */
  async createRealm(name: string, owner: ActorReference, parentRealmId: EntityId): Promise<Container> {
    return this.create(name, 'Realm', CONTAINER_PHYSICS.Realm, owner, parentRealmId);
  }

  /**
   * Create a Network (transient routing).
   */
  async createNetwork(name: string, owner: ActorReference, realmId: EntityId): Promise<Container> {
    return this.create(name, 'Network', CONTAINER_PHYSICS.Network, owner, realmId);
  }

  /**
   * Create an Inventory (strict, gated).
   */
  async createInventory(name: string, owner: ActorReference, realmId: EntityId): Promise<Container> {
    return this.create(name, 'Inventory', CONTAINER_PHYSICS.Inventory, owner, realmId);
  }

  // ===========================================================================
  // HIGH-LEVEL OPERATIONS
  // ===========================================================================

  /**
   * Pay: Transfer credits between wallets.
   */
  async pay(
    fromWalletId: EntityId,
    toWalletId: EntityId,
    amount: number,
    unit: string,
    actor: ActorReference,
    agreementId?: EntityId
  ): Promise<void> {
    const wallet = await this.get(fromWalletId);
    
    // Find the currency item
    const currencyItem = Array.from(wallet.items.values()).find(
      item => item.quantity?.unit === unit
    );
    
    if (!currencyItem) {
      throw new Error(`No ${unit} found in wallet`);
    }

    await this.transfer(
      fromWalletId,
      toWalletId,
      currencyItem.id,
      { amount, unit },
      actor,
      agreementId
    );
  }

  /**
   * Deploy: Copy a file from one workspace to another.
   */
  async deploy(
    fileId: EntityId,
    fromWorkspaceId: EntityId,
    toWorkspaceId: EntityId,
    actor: ActorReference,
    agreementId?: EntityId
  ): Promise<void> {
    await this.transfer(
      fromWorkspaceId,
      toWorkspaceId,
      fileId,
      undefined, // No quantity for files
      actor,
      agreementId
    );
  }

  // ===========================================================================
  // QUERY OPERATIONS
  // ===========================================================================

  /**
   * Get containers by owner.
   */
  async getByOwner(ownerId: EntityId, containerType?: ContainerType): Promise<readonly Container[]> {
    const pool = (this.eventStore as any).getPool?.();
    if (!pool) return [];

    try {
      let query = `
        SELECT DISTINCT aggregate_id
        FROM events
        WHERE aggregate_type = 'Container'
          AND event_type = 'ContainerCreated'
          AND payload->>'ownerId' = $1
      `;
      const params: any[] = [ownerId];

      if (containerType) {
        query += ` AND payload->>'containerType' = $2`;
        params.push(containerType);
      }

      const result = await pool.query(query, params);
      
      const containers: Container[] = [];
      for (const row of result.rows) {
        try {
          const container = await this.get(row.aggregate_id as EntityId);
          containers.push(container);
        } catch {
          // Container may have been deleted or is invalid
        }
      }
      
      return containers;
    } catch (err) {
      console.warn('Failed to query containers:', err);
      return [];
    }
  }

  /**
   * Get child containers.
   */
  async getChildren(parentContainerId: EntityId): Promise<readonly Container[]> {
    const pool = (this.eventStore as any).getPool?.();
    if (!pool) return [];

    try {
      const result = await pool.query(`
        SELECT DISTINCT aggregate_id
        FROM events
        WHERE aggregate_type = 'Container'
          AND event_type = 'ContainerCreated'
          AND payload->>'parentContainerId' = $1
      `, [parentContainerId]);

      const containers: Container[] = [];
      for (const row of result.rows) {
        try {
          const container = await this.get(row.aggregate_id as EntityId);
          containers.push(container);
        } catch {
          // Skip invalid containers
        }
      }
      
      return containers;
    } catch (err) {
      console.warn('Failed to query child containers:', err);
      return [];
    }
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private generateId(prefix: string): EntityId {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${timestamp}-${random}` as EntityId;
  }

  private getActorEntityId(actor: ActorReference): EntityId {
    if ('entityId' in actor) return (actor as any).entityId;
    if ('partyId' in actor) return (actor as any).partyId;
    if ('systemId' in actor) return (actor as any).systemId as EntityId;
    return 'unknown' as EntityId;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createContainerManager(context: { eventStore: EventStore }): ContainerManager {
  return new ContainerManager(context.eventStore);
}
