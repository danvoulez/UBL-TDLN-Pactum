/**
 * TEST FIXTURES: Entities
 * 
 * Reusable entity fixtures for business logic tests.
 */

import { Ids, type EntityId } from '../../../core/shared/types';
import type { ActorReference } from '../../../core/schema/ledger';

// ============================================================================
// ENTITY FIXTURES
// ============================================================================

export interface TestEntity {
  readonly id: EntityId;
  readonly name: string;
  readonly type: 'Person' | 'Organization' | 'System';
  readonly actor: ActorReference;
}

function createEntity(name: string, type: 'Person' | 'Organization' | 'System'): TestEntity {
  const id = Ids.entity();
  return {
    id,
    name,
    type,
    actor: {
      type: 'Entity',
      entityId: id,
    } as any,
  };
}

// People
export const alice = createEntity('Alice', 'Person');
export const bob = createEntity('Bob', 'Person');
export const charlie = createEntity('Charlie', 'Person');
export const diana = createEntity('Diana', 'Person');
export const eve = createEntity('Eve', 'Person'); // Often the eavesdropper
export const mallory = createEntity('Mallory', 'Person'); // The attacker

// Organizations
export const acmeCorp = createEntity('Acme Corporation', 'Organization');
export const globexInc = createEntity('Globex Inc', 'Organization');
export const initech = createEntity('Initech', 'Organization');

// System actors
export const systemActor: ActorReference = {
  type: 'System',
  systemId: 'test-system',
} as any;

export const anonymousActor: ActorReference = {
  type: 'Anonymous',
  reason: 'test',
} as any;

// ============================================================================
// PARTY CONFIGURATIONS
// ============================================================================

export interface PartyConfig {
  readonly entityId: EntityId;
  readonly role: string;
  readonly obligations?: readonly { id: string; description: string }[];
  readonly rights?: readonly { id: string; description: string }[];
}

export function asEmployer(entity: TestEntity): PartyConfig {
  return {
    entityId: entity.id,
    role: 'Employer',
    obligations: [
      { id: 'pay-salary', description: 'Pay agreed salary on time' },
      { id: 'provide-workspace', description: 'Provide adequate workspace' },
    ],
    rights: [
      { id: 'assign-work', description: 'Assign work within job description' },
      { id: 'terminate', description: 'Terminate with notice' },
    ],
  };
}

export function asEmployee(entity: TestEntity): PartyConfig {
  return {
    entityId: entity.id,
    role: 'Employee',
    obligations: [
      { id: 'perform-duties', description: 'Perform assigned duties' },
      { id: 'maintain-confidentiality', description: 'Maintain confidentiality' },
    ],
    rights: [
      { id: 'receive-salary', description: 'Receive agreed salary' },
      { id: 'resign', description: 'Resign with notice' },
    ],
  };
}

export function asSeller(entity: TestEntity): PartyConfig {
  return {
    entityId: entity.id,
    role: 'Seller',
    obligations: [
      { id: 'deliver-goods', description: 'Deliver goods as specified' },
    ],
    rights: [
      { id: 'receive-payment', description: 'Receive agreed payment' },
    ],
  };
}

export function asBuyer(entity: TestEntity): PartyConfig {
  return {
    entityId: entity.id,
    role: 'Buyer',
    obligations: [
      { id: 'pay', description: 'Pay agreed price' },
    ],
    rights: [
      { id: 'receive-goods', description: 'Receive goods as specified' },
    ],
  };
}

export function asCustodian(entity: TestEntity): PartyConfig {
  return {
    entityId: entity.id,
    role: 'Custodian',
    obligations: [
      { id: 'safekeep', description: 'Safekeep entrusted assets' },
      { id: 'return', description: 'Return assets on demand' },
    ],
  };
}

export function asOwner(entity: TestEntity): PartyConfig {
  return {
    entityId: entity.id,
    role: 'Owner',
    rights: [
      { id: 'reclaim', description: 'Reclaim assets at any time' },
    ],
  };
}
