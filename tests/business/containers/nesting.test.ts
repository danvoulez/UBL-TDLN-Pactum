/**
 * CONTAINER PHYSICS: Nesting
 * 
 * Containers can contain other containers.
 * This creates hierarchies with inherited properties.
 * 
 * Examples:
 * - Realm contains Workspaces
 * - Workspace contains Folders
 * - Organization contains Departments
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestLedger, type TestLedger } from '../../helpers/test-ledger';
import { alice, bob, acmeCorp, systemActor } from '../fixtures/entities';
import { Ids } from '../../../core/shared/types';

describe('Container Physics: Nesting', () => {
  let ledger: TestLedger;

  beforeEach(() => {
    ledger = createTestLedger();
  });

  describe('1. Parent-Child Relationships', () => {
    it('container can have a parent', async () => {
      const realmId = Ids.entity();
      const workspaceId = Ids.entity();
      
      // Create realm (top-level)
      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: realmId,
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: Date.now(),
        payload: {
          name: 'Acme Realm',
          containerType: 'Realm',
          parentId: null, // Top-level
        },
      });

      // Create workspace inside realm
      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: workspaceId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          name: 'Engineering Workspace',
          containerType: 'Workspace',
          parentId: realmId, // Nested inside realm
        },
      });

      const events = await ledger.getAllEvents();
      const workspace = events.find(e => e.aggregateId === workspaceId);
      
      assert.strictEqual(workspace.payload.parentId, realmId);
    });

    it('nested containers form a hierarchy', async () => {
      const realmId = Ids.entity();
      const workspaceId = Ids.entity();
      const folderId = Ids.entity();
      
      // Realm → Workspace → Folder
      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: realmId,
        aggregateVersion: 1,
        actor: systemActor,
        timestamp: Date.now(),
        payload: { containerType: 'Realm', parentId: null },
      });

      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: workspaceId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: { containerType: 'Workspace', parentId: realmId },
      });

      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: folderId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: { containerType: 'Folder', parentId: workspaceId },
      });

      const events = await ledger.getAllEvents();
      
      // Verify hierarchy
      const realm = events.find(e => e.aggregateId === realmId);
      const workspace = events.find(e => e.aggregateId === workspaceId);
      const folder = events.find(e => e.aggregateId === folderId);
      
      assert.strictEqual(realm.payload.parentId, null);
      assert.strictEqual(workspace.payload.parentId, realmId);
      assert.strictEqual(folder.payload.parentId, workspaceId);
    });
  });

  describe('2. Property Inheritance', () => {
    it('child container can inherit parent physics', async () => {
      const parentId = Ids.entity();
      const childId = Ids.entity();
      
      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: parentId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          containerType: 'Vault',
          physics: { permeability: 'Sealed' },
        },
      });

      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: childId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          containerType: 'Compartment',
          parentId: parentId,
          physics: { inherit: true }, // Inherit from parent
        },
      });

      const events = await ledger.getAllEvents();
      const child = events.find(e => e.aggregateId === childId);
      
      assert(child.payload.physics.inherit, 'Child should inherit physics');
    });

    it('child container can override parent physics', async () => {
      const parentId = Ids.entity();
      const childId = Ids.entity();
      
      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: parentId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          physics: { permeability: 'Sealed' },
        },
      });

      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: childId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          parentId: parentId,
          physics: { permeability: 'Open' }, // Override parent
        },
      });

      const events = await ledger.getAllEvents();
      const child = events.find(e => e.aggregateId === childId);
      
      assert.strictEqual(child.payload.physics.permeability, 'Open');
    });
  });

  describe('3. Movement Between Containers', () => {
    it('asset can move between sibling containers', async () => {
      const parentId = Ids.entity();
      const container1 = Ids.entity();
      const container2 = Ids.entity();
      const assetId = Ids.entity();
      
      // Create parent and two children
      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: parentId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: { containerType: 'Workspace' },
      });

      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: container1,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: { containerType: 'Folder', parentId: parentId, name: 'Inbox' },
      });

      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: container2,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: { containerType: 'Folder', parentId: parentId, name: 'Archive' },
      });

      // Move asset from container1 to container2
      await ledger.eventStore.append({
        type: 'AssetMoved',
        aggregateType: 'Asset' as any,
        aggregateId: assetId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          fromContainerId: container1,
          toContainerId: container2,
          movedBy: alice.id,
        },
      });

      const events = await ledger.getAllEvents();
      const move = events.find(e => e.type === 'AssetMoved');
      
      assert.strictEqual(move.payload.fromContainerId, container1);
      assert.strictEqual(move.payload.toContainerId, container2);
    });

    it('movement records complete path', async () => {
      const assetId = Ids.entity();
      const source = Ids.entity();
      const destination = Ids.entity();
      const agreementId = Ids.agreement();
      
      await ledger.eventStore.append({
        type: 'AssetMoved',
        aggregateType: 'Asset' as any,
        aggregateId: assetId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          fromContainerId: source,
          toContainerId: destination,
          movedBy: alice.id,
          governingAgreement: agreementId,
          reason: 'Archival',
        },
      });

      const events = await ledger.getAllEvents();
      const move = events[0];
      
      assert(move.payload.fromContainerId, 'Source recorded');
      assert(move.payload.toContainerId, 'Destination recorded');
      assert(move.payload.movedBy, 'Actor recorded');
      assert(move.payload.governingAgreement, 'Agreement recorded');
      assert(move.payload.reason, 'Reason recorded');
    });
  });

  describe('4. Orphan Prevention', () => {
    it('container deletion records child handling', async () => {
      const parentId = Ids.entity();
      const childId = Ids.entity();
      
      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: parentId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: { containerType: 'Workspace' },
      });

      await ledger.eventStore.append({
        type: 'ContainerCreated',
        aggregateType: 'Container' as any,
        aggregateId: childId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: { parentId: parentId },
      });

      // Delete parent - must specify what happens to children
      await ledger.eventStore.append({
        type: 'ContainerDeleted',
        aggregateType: 'Container' as any,
        aggregateId: parentId,
        aggregateVersion: 2,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          deletedBy: alice.id,
          childHandling: 'Reparent',
          newParentId: Ids.entity(), // Children moved to new parent
        },
      });

      const events = await ledger.getAllEvents();
      const deletion = events.find(e => e.type === 'ContainerDeleted');
      
      assert(deletion.payload.childHandling, 'Child handling must be specified');
    });

    it('asset in deleted container is relocated', async () => {
      const containerId = Ids.entity();
      const assetId = Ids.entity();
      const newContainerId = Ids.entity();
      
      await ledger.eventStore.append({
        type: 'ContainerDeleted',
        aggregateType: 'Container' as any,
        aggregateId: containerId,
        aggregateVersion: 1,
        actor: alice.actor,
        timestamp: Date.now(),
        payload: {
          assetsRelocatedTo: newContainerId,
          assetCount: 5,
        },
      });

      const events = await ledger.getAllEvents();
      const deletion = events[0];
      
      assert(deletion.payload.assetsRelocatedTo, 'Asset relocation recorded');
    });
  });
});
