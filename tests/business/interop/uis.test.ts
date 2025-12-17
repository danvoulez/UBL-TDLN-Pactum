/**
 * UIS GATEWAY TESTS
 * 
 * SPRINT E.2: Tests for cross-realm interoperability
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  UISGateway,
  createUISGateway,
  type TrustedRealm,
  type UISMessage,
} from '../../../core/interop/uis-1.0';
import type { EntityId } from '../../../core/schema/ledger';

describe('UIS Gateway (SPRINT E.2)', () => {
  
  let gateway: UISGateway;
  const realmA = 'realm-a' as EntityId;
  const realmB = 'realm-b' as EntityId;
  
  beforeEach(() => {
    gateway = createUISGateway({
      realmId: realmA,
      publicKey: 'pk-realm-a',
      trustedRealms: new Map(),
      messageTTL: 60000,
      maxMessageSize: 1024,
    });
  });
  
  describe('Trust Management', () => {
    it('establishes trust with another realm', () => {
      const trustedRealm: TrustedRealm = {
        realmId: realmB,
        name: 'Realm B',
        publicKey: 'pk-realm-b',
        endpoint: 'https://realm-b.example.com',
        trustLevel: 'Verified',
        establishedAt: Date.now(),
        capabilities: ['EntityTransfer', 'AssetTransfer'],
      };
      
      gateway.establishTrust(trustedRealm);
      
      assert.strictEqual(gateway.isTrusted(realmB), true);
      assert.strictEqual(gateway.getTrustLevel(realmB), 'Verified');
    });
    
    it('revokes trust', () => {
      gateway.establishTrust({
        realmId: realmB,
        name: 'Realm B',
        publicKey: 'pk-realm-b',
        endpoint: '',
        trustLevel: 'Limited',
        establishedAt: Date.now(),
        capabilities: [],
      });
      
      gateway.revokeTrust(realmB);
      
      assert.strictEqual(gateway.isTrusted(realmB), false);
    });
    
    it('updates trust level', () => {
      gateway.establishTrust({
        realmId: realmB,
        name: 'Realm B',
        publicKey: 'pk-realm-b',
        endpoint: '',
        trustLevel: 'Limited',
        establishedAt: Date.now(),
        capabilities: [],
      });
      
      gateway.updateTrustLevel(realmB, 'Full');
      
      assert.strictEqual(gateway.getTrustLevel(realmB), 'Full');
    });
    
    it('returns Untrusted for unknown realms', () => {
      assert.strictEqual(gateway.getTrustLevel('unknown' as EntityId), 'Untrusted');
    });
  });
  
  describe('Message Creation', () => {
    it('creates a message', () => {
      gateway.establishTrust({
        realmId: realmB,
        name: 'Realm B',
        publicKey: 'pk-realm-b',
        endpoint: '',
        trustLevel: 'Full',
        establishedAt: Date.now(),
        capabilities: [],
      });
      
      const message = gateway.createMessage('Ping', realmB, { type: 'Ping' });
      
      assert.ok(message.id);
      assert.strictEqual(message.version, '1.0');
      assert.strictEqual(message.type, 'Ping');
      assert.strictEqual(message.sourceRealm, realmA);
      assert.strictEqual(message.targetRealm, realmB);
      assert.ok(message.signature);
    });
    
    it('creates message with correlation ID', () => {
      gateway.establishTrust({
        realmId: realmB,
        name: 'Realm B',
        publicKey: 'pk-realm-b',
        endpoint: '',
        trustLevel: 'Full',
        establishedAt: Date.now(),
        capabilities: [],
      });
      
      const message = gateway.createMessage('Pong', realmB, { type: 'Pong' }, 'corr-123');
      
      assert.strictEqual(message.correlationId, 'corr-123');
    });
  });
  
  describe('Message Processing', () => {
    beforeEach(() => {
      gateway.establishTrust({
        realmId: realmB,
        name: 'Realm B',
        publicKey: 'pk-realm-b',
        endpoint: '',
        trustLevel: 'Full',
        establishedAt: Date.now(),
        capabilities: ['EntityTransfer', 'CreditTransfer'],
      });
    });
    
    it('processes ping message', async () => {
      const ping: UISMessage = {
        id: 'msg-1',
        version: '1.0',
        type: 'Ping',
        sourceRealm: realmB,
        targetRealm: realmA,
        timestamp: Date.now(),
        expiresAt: Date.now() + 60000,
        payload: { type: 'Ping' },
        signature: `sig-0-${realmB}`,
      };
      
      const response = await gateway.processMessage(ping);
      
      assert.ok(response);
      assert.strictEqual(response.type, 'Pong');
    });
    
    it('rejects expired messages', async () => {
      const expired: UISMessage = {
        id: 'msg-1',
        version: '1.0',
        type: 'Ping',
        sourceRealm: realmB,
        targetRealm: realmA,
        timestamp: Date.now() - 120000,
        expiresAt: Date.now() - 60000, // Already expired
        payload: { type: 'Ping' },
        signature: `sig-0-${realmB}`,
      };
      
      const response = await gateway.processMessage(expired);
      
      assert.ok(response);
      assert.strictEqual(response.type, 'Error');
    });
    
    it('rejects messages from untrusted realms', async () => {
      const untrusted: UISMessage = {
        id: 'msg-1',
        version: '1.0',
        type: 'Ping',
        sourceRealm: 'untrusted-realm' as EntityId,
        targetRealm: realmA,
        timestamp: Date.now(),
        expiresAt: Date.now() + 60000,
        payload: { type: 'Ping' },
        signature: 'sig-0-untrusted',
      };
      
      const response = await gateway.processMessage(untrusted);
      
      assert.ok(response);
      assert.strictEqual(response.type, 'Error');
    });
  });
  
  describe('Entity Transfer', () => {
    beforeEach(() => {
      gateway.establishTrust({
        realmId: realmB,
        name: 'Realm B',
        publicKey: 'pk-realm-b',
        endpoint: '',
        trustLevel: 'Verified',
        establishedAt: Date.now(),
        capabilities: ['EntityTransfer'],
      });
    });
    
    it('initiates entity transfer', () => {
      const transfer = gateway.initiateEntityTransfer(
        realmB,
        'entity-1' as EntityId,
        'Agent',
        { name: 'Test Agent', skills: ['coding'] },
        'Migration'
      );
      
      assert.ok(transfer.id);
      assert.strictEqual(transfer.type, 'Entity');
      assert.strictEqual(transfer.status, 'Initiated');
      assert.strictEqual(transfer.targetRealm, realmB);
    });
    
    it('rejects transfer to untrusted realm', () => {
      assert.throws(
        () => gateway.initiateEntityTransfer(
          'untrusted' as EntityId,
          'entity-1' as EntityId,
          'Agent',
          {},
          'Test'
        ),
        /not trusted/
      );
    });
  });
  
  describe('Credit Transfer', () => {
    it('initiates credit transfer with Full trust', () => {
      gateway.establishTrust({
        realmId: realmB,
        name: 'Realm B',
        publicKey: 'pk-realm-b',
        endpoint: '',
        trustLevel: 'Full',
        establishedAt: Date.now(),
        capabilities: ['CreditTransfer'],
      });
      
      const transfer = gateway.initiateCreditTransfer(
        realmB,
        1000n,
        'UBL',
        'wallet-1' as EntityId,
        'wallet-2' as EntityId,
        'Payment'
      );
      
      assert.ok(transfer.id);
      assert.strictEqual(transfer.type, 'Credit');
      assert.strictEqual(transfer.status, 'Initiated');
    });
    
    it('rejects credit transfer without Full trust', () => {
      gateway.establishTrust({
        realmId: realmB,
        name: 'Realm B',
        publicKey: 'pk-realm-b',
        endpoint: '',
        trustLevel: 'Verified', // Not Full
        establishedAt: Date.now(),
        capabilities: ['CreditTransfer'],
      });
      
      assert.throws(
        () => gateway.initiateCreditTransfer(
          realmB,
          1000n,
          'UBL',
          'wallet-1' as EntityId,
          'wallet-2' as EntityId
        ),
        /Full trust/
      );
    });
  });
  
  describe('Statistics', () => {
    it('provides gateway statistics', () => {
      gateway.establishTrust({
        realmId: realmB,
        name: 'Realm B',
        publicKey: 'pk-realm-b',
        endpoint: '',
        trustLevel: 'Full',
        establishedAt: Date.now(),
        capabilities: [],
      });
      
      gateway.createMessage('Ping', realmB, { type: 'Ping' });
      gateway.initiateEntityTransfer(
        realmB,
        'entity-1' as EntityId,
        'Agent',
        {},
        'Test'
      );
      
      const stats = gateway.getStats();
      
      assert.strictEqual(stats.trustedRealms, 1);
      assert.ok(stats.totalMessages >= 2);
      assert.strictEqual(stats.totalTransfers, 1);
    });
  });
  
  describe('Factory', () => {
    it('createUISGateway uses defaults', () => {
      const defaultGateway = createUISGateway();
      assert.ok(defaultGateway);
    });
  });
});
