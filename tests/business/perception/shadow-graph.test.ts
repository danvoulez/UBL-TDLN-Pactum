/**
 * SHADOW GRAPH TESTS
 * 
 * FASE 2.3: Tests for shadow entity management
 * - Creation and updates of shadow entities
 * - Interaction tracking
 * - Trust and reputation management
 * - Promotion to real entities
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createInMemoryEventStore, type EventStore } from '../../../core/store/event-store';
import {
  createShadowEntity,
  type ShadowEntity,
  type ShadowType,
  type ExternalIdentity,
  type InteractionRecord,
} from '../../../core/schema/perception';
import { Ids } from '../../../core/shared/types';
import type { EntityId, AggregateType } from '../../../core/schema/ledger';

describe('Shadow Graph (FASE 2.3)', () => {
  let eventStore: EventStore;
  const testActor = { type: 'System' as const, systemId: 'test' };
  
  const ownerId = Ids.entity();
  
  beforeEach(() => {
    eventStore = createInMemoryEventStore();
  });
  
  function createTestShadow(overrides?: Partial<{
    type: ShadowType;
    name: string;
    identities: ExternalIdentity[];
  }>): ShadowEntity {
    const shadowId = Ids.entity();
    const identities: ExternalIdentity[] = overrides?.identities ?? [
      { platform: 'twitter', externalId: '12345', handle: '@testuser' },
    ];
    
    // createShadowEntity(id, ownerId, identities, type, name, notes)
    return createShadowEntity(
      shadowId,
      ownerId,
      identities,
      overrides?.type ?? 'Person',
      overrides?.name ?? 'Test Shadow'
    );
  }
  
  describe('Shadow Entity Creation', () => {
    it('creates shadow entity with default values', () => {
      const shadow = createTestShadow();
      
      assert.ok(shadow.id);
      assert.strictEqual(shadow.ownerId, ownerId);
      assert.strictEqual(shadow.name, 'Test Shadow');
      assert.strictEqual(shadow.type, 'Person');
      assert.strictEqual(shadow.trustLevel, 'Unknown');
      assert.strictEqual(shadow.reputation, 50); // Default neutral
    });
    
    it('supports multiple external identities', () => {
      const shadow = createTestShadow({
        identities: [
          { platform: 'twitter', externalId: '12345', handle: '@user' },
          { platform: 'github', externalId: 'user123', handle: 'user123' },
          { platform: 'email', externalId: 'user@example.com' },
        ],
      });
      
      assert.strictEqual(shadow.identities.length, 3);
      assert.strictEqual(shadow.identities[0].platform, 'twitter');
      assert.strictEqual(shadow.identities[1].platform, 'github');
      assert.strictEqual(shadow.identities[2].platform, 'email');
    });
    
    it('supports different shadow types', () => {
      const types: ShadowType[] = ['Person', 'Organization', 'Service', 'Account', 'Unknown'];
      
      for (const type of types) {
        const shadow = createTestShadow({ type });
        assert.strictEqual(shadow.type, type);
      }
    });
  });
  
  describe('Shadow Entity Events', () => {
    it('records ShadowEntityCreated event', async () => {
      const shadow = createTestShadow();
      
      await eventStore.append({
        type: 'ShadowEntityCreated',
        aggregateId: shadow.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 1,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          shadowId: shadow.id,
          ownerId: shadow.ownerId,
          name: shadow.name,
          type: shadow.type,
          identities: shadow.identities,
        },
      });
      
      const result = await eventStore.query({
        eventTypes: ['ShadowEntityCreated'],
      });
      
      assert.strictEqual(result.total, 1);
    });
    
    it('records ShadowEntityUpdated event', async () => {
      const shadow = createTestShadow();
      
      await eventStore.append({
        type: 'ShadowEntityCreated',
        aggregateId: shadow.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 1,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          shadowId: shadow.id,
          ownerId: shadow.ownerId,
          name: shadow.name,
          type: shadow.type,
          identities: shadow.identities,
        },
      });
      
      await eventStore.append({
        type: 'ShadowEntityUpdated',
        aggregateId: shadow.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 2,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          shadowId: shadow.id,
          updates: {
            notes: 'Updated notes about this entity',
            trustLevel: 'Medium',
          },
        },
      });
      
      const result = await eventStore.query({
        aggregateIds: [shadow.id],
      });
      
      assert.strictEqual(result.total, 2);
      assert.strictEqual(result.events[1].type, 'ShadowEntityUpdated');
    });
  });
  
  describe('Interaction Tracking', () => {
    it('records ShadowInteraction event', async () => {
      const shadow = createTestShadow();
      
      await eventStore.append({
        type: 'ShadowEntityCreated',
        aggregateId: shadow.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 1,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          shadowId: shadow.id,
          ownerId: shadow.ownerId,
          name: shadow.name,
          type: shadow.type,
          identities: shadow.identities,
        },
      });
      
      const interaction: InteractionRecord = {
        timestamp: Date.now(),
        type: 'inbound',
        channel: 'twitter',
        summary: 'Received DM about project collaboration',
        sentiment: 'positive',
      };
      
      await eventStore.append({
        type: 'ShadowInteraction',
        aggregateId: shadow.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 2,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          shadowId: shadow.id,
          interaction,
        },
      });
      
      const result = await eventStore.query({
        eventTypes: ['ShadowInteraction'],
      });
      
      assert.strictEqual(result.total, 1);
    });
    
    it('tracks multiple interactions', async () => {
      const shadow = createTestShadow();
      
      await eventStore.append({
        type: 'ShadowEntityCreated',
        aggregateId: shadow.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 1,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          shadowId: shadow.id,
          ownerId: shadow.ownerId,
          name: shadow.name,
          type: shadow.type,
          identities: shadow.identities,
        },
      });
      
      const interactions: InteractionRecord[] = [
        { timestamp: Date.now(), type: 'inbound', channel: 'email', summary: 'Initial contact', sentiment: 'neutral' },
        { timestamp: Date.now() + 1000, type: 'outbound', channel: 'email', summary: 'Response sent', sentiment: 'positive' },
        { timestamp: Date.now() + 2000, type: 'observation', channel: 'twitter', summary: 'Posted about our product', sentiment: 'positive' },
      ];
      
      for (let i = 0; i < interactions.length; i++) {
        await eventStore.append({
          type: 'ShadowInteraction',
          aggregateId: shadow.id,
          aggregateType: 'Shadow' as AggregateType,
          aggregateVersion: i + 2,
          actor: { type: 'Entity' as const, entityId: ownerId },
          payload: {
            shadowId: shadow.id,
            interaction: interactions[i],
          },
        });
      }
      
      const result = await eventStore.query({
        eventTypes: ['ShadowInteraction'],
        aggregateIds: [shadow.id],
      });
      
      assert.strictEqual(result.total, 3);
    });
  });
  
  describe('Trust and Reputation', () => {
    it('records TrustLevelChanged event', async () => {
      const shadow = createTestShadow();
      
      await eventStore.append({
        type: 'ShadowEntityCreated',
        aggregateId: shadow.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 1,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          shadowId: shadow.id,
          ownerId: shadow.ownerId,
          name: shadow.name,
          type: shadow.type,
          identities: shadow.identities,
        },
      });
      
      await eventStore.append({
        type: 'ShadowTrustChanged',
        aggregateId: shadow.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 2,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          shadowId: shadow.id,
          previousTrust: 'Unknown',
          newTrust: 'High',
          reason: 'Verified identity through multiple channels',
        },
      });
      
      const result = await eventStore.query({
        eventTypes: ['ShadowTrustChanged'],
      });
      
      assert.strictEqual(result.total, 1);
    });
    
    it('records ReputationUpdated event', async () => {
      const shadow = createTestShadow();
      
      await eventStore.append({
        type: 'ShadowEntityCreated',
        aggregateId: shadow.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 1,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          shadowId: shadow.id,
          ownerId: shadow.ownerId,
          name: shadow.name,
          type: shadow.type,
          identities: shadow.identities,
        },
      });
      
      await eventStore.append({
        type: 'ShadowReputationUpdated',
        aggregateId: shadow.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 2,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          shadowId: shadow.id,
          previousReputation: 50,
          newReputation: 75,
          reason: 'Positive interactions and reliable behavior',
        },
      });
      
      const result = await eventStore.query({
        eventTypes: ['ShadowReputationUpdated'],
      });
      
      assert.strictEqual(result.total, 1);
    });
  });
  
  describe('Shadow Promotion', () => {
    it('records ShadowPromoted event when promoted to real entity', async () => {
      const shadow = createTestShadow();
      const realEntityId = Ids.entity();
      
      await eventStore.append({
        type: 'ShadowEntityCreated',
        aggregateId: shadow.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 1,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          shadowId: shadow.id,
          ownerId: shadow.ownerId,
          name: shadow.name,
          type: shadow.type,
          identities: shadow.identities,
        },
      });
      
      await eventStore.append({
        type: 'ShadowPromoted',
        aggregateId: shadow.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 2,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          shadowId: shadow.id,
          promotedToEntityId: realEntityId,
          reason: 'User registered in UBL system',
        },
      });
      
      const result = await eventStore.query({
        eventTypes: ['ShadowPromoted'],
      });
      
      assert.strictEqual(result.total, 1);
    });
  });
  
  describe('Shadow Privacy', () => {
    it('shadows are private to owner (query by owner)', async () => {
      const shadow1 = createTestShadow({ name: 'Shadow 1' });
      const shadow2 = createTestShadow({ name: 'Shadow 2' });
      const otherOwnerId = Ids.entity();
      const shadow3Id = Ids.entity();
      
      // Create shadows for our owner
      await eventStore.append({
        type: 'ShadowEntityCreated',
        aggregateId: shadow1.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 1,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: { shadowId: shadow1.id, ownerId, name: 'Shadow 1', type: 'Person', identities: [] },
      });
      
      await eventStore.append({
        type: 'ShadowEntityCreated',
        aggregateId: shadow2.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 1,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: { shadowId: shadow2.id, ownerId, name: 'Shadow 2', type: 'Organization', identities: [] },
      });
      
      // Create shadow for different owner
      await eventStore.append({
        type: 'ShadowEntityCreated',
        aggregateId: shadow3Id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 1,
        actor: { type: 'Entity' as const, entityId: otherOwnerId },
        payload: { shadowId: shadow3Id, ownerId: otherOwnerId, name: 'Other Shadow', type: 'Person', identities: [] },
      });
      
      // Query all shadows
      const result = await eventStore.query({
        eventTypes: ['ShadowEntityCreated'],
      });
      
      assert.strictEqual(result.total, 3);
      
      // Filter by owner (in production this would be enforced by ABAC)
      const ownerShadows = result.events.filter(
        e => (e.payload as { ownerId: EntityId }).ownerId === ownerId
      );
      assert.strictEqual(ownerShadows.length, 2);
    });
  });
  
  describe('Identity Merging', () => {
    it('records IdentityAdded event', async () => {
      const shadow = createTestShadow();
      
      await eventStore.append({
        type: 'ShadowEntityCreated',
        aggregateId: shadow.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 1,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          shadowId: shadow.id,
          ownerId: shadow.ownerId,
          name: shadow.name,
          type: shadow.type,
          identities: shadow.identities,
        },
      });
      
      const newIdentity: ExternalIdentity = {
        platform: 'linkedin',
        externalId: 'john-doe-123',
        url: 'https://linkedin.com/in/john-doe-123',
      };
      
      await eventStore.append({
        type: 'ShadowIdentityAdded',
        aggregateId: shadow.id,
        aggregateType: 'Shadow' as AggregateType,
        aggregateVersion: 2,
        actor: { type: 'Entity' as const, entityId: ownerId },
        payload: {
          shadowId: shadow.id,
          identity: newIdentity,
        },
      });
      
      const result = await eventStore.query({
        eventTypes: ['ShadowIdentityAdded'],
      });
      
      assert.strictEqual(result.total, 1);
    });
  });
});
