/**
 * TEST FIXTURES
 * 
 * Dados de teste reutilizáveis e consistentes:
 * - Eventos de exemplo
 * - Entidades de teste
 * - Agreements de teste
 * - Contextos de teste
 * 
 * Uso:
 *   const event = createTestEvent('PartyRegistered', { partyId: 'ent-123' });
 *   const party = createTestParty({ name: 'Test Party' });
 */

import type { Event } from '../../core/schema/ledger.js';
import { Ids } from '../../core/shared/types.js';
import type { EntityId, Timestamp } from '../../core/shared/types.js';

/**
 * Cria evento de teste com valores padrão
 */
export function createTestEvent(
  type: string,
  overrides: Partial<Event> = {}
): Event {
  const now = Date.now();
  const sequence = overrides.sequence ?? 1n;
  
  return {
    id: overrides.id ?? Ids.event(),
    sequence,
    timestamp: overrides.timestamp ?? now,
    type: type as any,
    aggregateId: overrides.aggregateId ?? Ids.entity(),
    aggregateType: overrides.aggregateType ?? 'Party' as const,
    aggregateVersion: overrides.aggregateVersion ?? 1,
    actor: overrides.actor ?? {
      id: Ids.entity(),
      type: 'System' as const,
      realm: Ids.realm(),
    },
    realm: overrides.realm ?? Ids.realm(),
    hash: overrides.hash ?? '',
    previousHash: overrides.previousHash ?? '',
    payload: overrides.payload ?? {},
    metadata: overrides.metadata ?? {},
    ...overrides,
  };
}

/**
 * Cria evento PartyRegistered de teste
 */
export function createPartyRegisteredEvent(
  overrides: Partial<Event> = {}
): Event {
  return createTestEvent('PartyRegistered', {
    payload: {
      partyId: overrides.aggregateId ?? Ids.entity(),
      partyType: 'Person' as const,
      identity: {
        name: 'Test Person',
        identifiers: [],
        contacts: [],
      },
    },
    ...overrides,
  });
}

/**
 * Cria evento AgreementCreated de teste
 */
export function createAgreementCreatedEvent(
  overrides: Partial<Event> = {}
): Event {
  return createTestEvent('AgreementCreated', {
    aggregateType: 'Agreement' as const,
    aggregateId: overrides.aggregateId ?? Ids.agreement(),
    payload: {
      agreementId: overrides.aggregateId ?? Ids.agreement(),
      agreementType: 'Employment' as const,
      parties: [Ids.entity(), Ids.entity()],
      terms: {
        description: 'Test Agreement',
      },
    },
    ...overrides,
  });
}

/**
 * Cria evento AssetRegistered de teste
 */
export function createAssetRegisteredEvent(
  overrides: Partial<Event> = {}
): Event {
  return createTestEvent('AssetRegistered', {
    aggregateType: 'Asset' as const,
    aggregateId: overrides.aggregateId ?? Ids.asset(),
    payload: {
      assetId: overrides.aggregateId ?? Ids.asset(),
      assetType: 'Document' as const,
      ownerId: Ids.entity(),
      custodianId: Ids.entity(),
    },
    ...overrides,
  });
}

/**
 * Cria evento RoleGranted de teste
 */
export function createRoleGrantedEvent(
  overrides: Partial<Event> = {}
): Event {
  return createTestEvent('RoleGranted', {
    aggregateType: 'Role' as const,
    aggregateId: overrides.aggregateId ?? Ids.role(),
    payload: {
      roleId: overrides.aggregateId ?? Ids.role(),
      holderId: Ids.entity(),
      roleType: 'Employee' as const,
      contextId: Ids.entity(),
    },
    ...overrides,
  });
}

/**
 * Cria sequência de eventos de teste
 */
export function createEventSequence(
  count: number,
  baseEvent: Partial<Event> = {},
  incrementSequence: boolean = true
): Event[] {
  const events: Event[] = [];
  let sequence = baseEvent.sequence ?? 1n;
  let previousHash = baseEvent.previousHash ?? '';
  
  for (let i = 0; i < count; i++) {
    const event = createTestEvent(baseEvent.type ?? 'PartyRegistered', {
      ...baseEvent,
      sequence: incrementSequence ? sequence : baseEvent.sequence ?? 1n,
      previousHash,
    });
    
    events.push(event);
    
    if (incrementSequence) {
      sequence++;
    }
    previousHash = event.hash || `hash-${i}`;
  }
  
  return events;
}

/**
 * Cria party de teste
 */
export function createTestParty(overrides: {
  partyId?: EntityId;
  partyType?: 'Person' | 'Organization';
  name?: string;
  realmId?: EntityId;
} = {}) {
  return {
    partyId: overrides.partyId ?? Ids.entity(),
    partyType: overrides.partyType ?? 'Person' as const,
    identity: {
      name: overrides.name ?? 'Test Party',
      identifiers: [],
      contacts: [],
    },
    realmId: overrides.realmId ?? Ids.realm(),
  };
}

/**
 * Cria agreement de teste
 */
export function createTestAgreement(overrides: {
  agreementId?: EntityId;
  agreementType?: string;
  parties?: EntityId[];
  realmId?: EntityId;
} = {}) {
  return {
    agreementId: overrides.agreementId ?? Ids.agreement(),
    agreementType: overrides.agreementType ?? 'Employment',
    parties: overrides.parties ?? [Ids.entity(), Ids.entity()],
    terms: {
      description: 'Test Agreement',
    },
    realmId: overrides.realmId ?? Ids.realm(),
  };
}

/**
 * Cria asset de teste
 */
export function createTestAsset(overrides: {
  assetId?: EntityId;
  assetType?: string;
  ownerId?: EntityId;
  custodianId?: EntityId;
  realmId?: EntityId;
} = {}) {
  return {
    assetId: overrides.assetId ?? Ids.asset(),
    assetType: overrides.assetType ?? 'Document',
    ownerId: overrides.ownerId ?? Ids.entity(),
    custodianId: overrides.custodianId ?? Ids.entity(),
    realmId: overrides.realmId ?? Ids.realm(),
  };
}

/**
 * Cria actor de teste
 */
export function createTestActor(overrides: {
  actorId?: EntityId;
  actorType?: 'System' | 'Person' | 'Organization';
  realmId?: EntityId;
} = {}) {
  return {
    id: overrides.actorId ?? Ids.entity(),
    type: overrides.actorType ?? 'System' as const,
    realm: overrides.realmId ?? Ids.realm(),
  };
}

/**
 * Cria contexto de teste completo
 */
export function createTestContext(overrides: {
  realmId?: EntityId;
  actorId?: EntityId;
  timestamp?: Timestamp;
} = {}) {
  const realmId = overrides.realmId ?? Ids.realm();
  const actorId = overrides.actorId ?? Ids.entity();
  
  return {
    realmId,
    actor: createTestActor({
      actorId,
      realmId,
    }),
    timestamp: overrides.timestamp ?? Date.now(),
    party1: createTestParty({ realmId }),
    party2: createTestParty({ realmId }),
    agreement: createTestAgreement({
      parties: [Ids.entity(), Ids.entity()],
      realmId,
    }),
  };
}

