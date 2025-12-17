/**
 * BOOTSTRAP - System Initialization
 * 
 * Creates the primordial realm, system entity, and genesis agreement.
 * This is the "In the beginning..." of the ledger.
 * 
 * The Primordial Realm is the root Container that holds all other Containers.
 */

import type { EntityId, Timestamp, ActorReference } from '../shared/types';
import type { EventStore } from '../store/event-store';
import type { AggregateType } from '../schema/ledger';
import { CONTAINER_PHYSICS, type Container } from './container';
import { ContainerManager } from './container-manager';

// =============================================================================
// CANONICAL IDS
// =============================================================================

/** The root realm - contains all other realms */
export const PRIMORDIAL_REALM_ID = '00000000-0000-0000-0000-000000000000' as EntityId;

/** The system entity - the ledger itself as a participant */
export const PRIMORDIAL_SYSTEM_ID = '00000000-0000-0000-0000-000000000001' as EntityId;

/** The genesis agreement - establishes the system's existence */
export const GENESIS_AGREEMENT_ID = '00000000-0000-0000-0000-000000000002' as EntityId;

// =============================================================================
// BOOTSTRAP RESULT
// =============================================================================

export interface BootstrapResult {
  readonly primordialRealm: Container;
  readonly systemEntityId: EntityId;
  readonly genesisAgreementId: EntityId;
  readonly alreadyExisted: boolean;
}

// =============================================================================
// BOOTSTRAP FUNCTION
// =============================================================================

/**
 * Bootstrap the system.
 * 
 * Creates:
 * 1. The Primordial Realm (root Container with Realm physics)
 * 2. The System Entity (the ledger itself)
 * 3. The Genesis Agreement (establishes the system's existence)
 * 
 * Idempotent: If already bootstrapped, returns existing state.
 */
export async function bootstrap(eventStore: EventStore): Promise<BootstrapResult> {
  const systemActor: ActorReference = { 
    type: 'System', 
    systemId: 'bootstrap' 
  } as any;
  
  // Check if already bootstrapped by looking for the primordial realm
  const existingEvents: any[] = [];
  try {
    for await (const event of eventStore.getByAggregate('Container' as AggregateType, PRIMORDIAL_REALM_ID)) {
      existingEvents.push(event);
    }
  } catch {
    // No events found, need to bootstrap
  }
  
  if (existingEvents.length > 0) {
    // Already bootstrapped - reconstruct and return
    const containers = new ContainerManager(eventStore);
    const primordialRealm = await containers.get(PRIMORDIAL_REALM_ID);
    
    return {
      primordialRealm,
      systemEntityId: PRIMORDIAL_SYSTEM_ID,
      genesisAgreementId: GENESIS_AGREEMENT_ID,
      alreadyExisted: true,
    };
  }
  
  // === BOOTSTRAP: Create the primordial structures ===
  
  const now = Date.now() as Timestamp;
  
  // 1. Create the Genesis Agreement first
  await eventStore.append({
    type: 'AgreementProposed',
    aggregateType: 'Agreement' as AggregateType,
    aggregateId: GENESIS_AGREEMENT_ID,
    aggregateVersion: 1,
    actor: systemActor,
    timestamp: now,
    payload: {
      type: 'AgreementProposed',
      agreementType: 'Genesis',
      parties: [{ entityId: PRIMORDIAL_SYSTEM_ID, role: 'System' }],
      terms: {
        description: 'In the beginning was the Event, and the Event was with the Ledger, and the Event was the Ledger.',
        clauses: [
          {
            id: 'existence',
            type: 'declaration',
            title: 'Declaration of Existence',
            content: 'This agreement establishes the existence of the system and its primordial realm.',
          },
        ],
      },
    },
  });
  
  // Auto-activate genesis agreement
  await eventStore.append({
    type: 'AgreementStatusChanged',
    aggregateType: 'Agreement' as AggregateType,
    aggregateId: GENESIS_AGREEMENT_ID,
    aggregateVersion: 2,
    actor: systemActor,
    timestamp: now,
    payload: {
      type: 'AgreementStatusChanged',
      previousStatus: 'Proposed',
      newStatus: 'Active',
    },
  });
  
  // 2. Create the System Entity
  await eventStore.append({
    type: 'EntityCreated',
    aggregateType: 'Party' as AggregateType,
    aggregateId: PRIMORDIAL_SYSTEM_ID,
    aggregateVersion: 1,
    actor: systemActor,
    timestamp: now,
    payload: {
      type: 'EntityCreated',
      entityType: 'System',
      identity: {
        name: 'System',
        identifiers: [
          { scheme: 'system', value: 'primordial', verified: true },
        ],
      },
      meta: { isPrimordial: true },
    },
  });
  
  // 3. Create the Primordial Realm (as a Container with Realm physics)
  await eventStore.append({
    type: 'ContainerCreated',
    aggregateType: 'Container' as AggregateType,
    aggregateId: PRIMORDIAL_REALM_ID,
    aggregateVersion: 1,
    actor: systemActor,
    timestamp: now,
    payload: {
      type: 'ContainerCreated',
      name: 'Primordial Realm',
      containerType: 'Realm',
      physics: {
        ...CONTAINER_PHYSICS.Realm,
        // Primordial realm has special permissions
        permeability: 'Open', // Can interact with all child realms
      },
      governanceAgreementId: GENESIS_AGREEMENT_ID,
      realmId: PRIMORDIAL_REALM_ID, // Self-referential
      ownerId: PRIMORDIAL_SYSTEM_ID,
    },
  });
  
  // Reconstruct and return
  const containers = new ContainerManager(eventStore);
  const primordialRealm = await containers.get(PRIMORDIAL_REALM_ID);
  
  console.log('🌍 Primordial Realm created');
  console.log('🤖 System Entity created');
  console.log('📜 Genesis Agreement created');
  
  return {
    primordialRealm,
    systemEntityId: PRIMORDIAL_SYSTEM_ID,
    genesisAgreementId: GENESIS_AGREEMENT_ID,
    alreadyExisted: false,
  };
}

/**
 * Check if the system has been bootstrapped.
 */
export async function isBootstrapped(eventStore: EventStore): Promise<boolean> {
  try {
    for await (const event of eventStore.getByAggregate('Container' as AggregateType, PRIMORDIAL_REALM_ID)) {
      if (event.type === 'ContainerCreated') {
        return true;
      }
    }
  } catch {
    // No events found
  }
  return false;
}
