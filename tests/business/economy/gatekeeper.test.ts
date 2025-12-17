/**
 * ECONOMIC GATEKEEPER TESTS
 * 
 * FASE 2.4: Tests for the Economic Gatekeeper
 * Separação de concerns: Physics (Container) vs Policy (Economy)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  EconomicGatekeeper,
  InMemoryCircuitBreaker,
  InMemoryTreasury,
  createEconomicGatekeeper,
  type TransferContext,
} from '../../../core/economy/gatekeeper';
import type { EntityId } from '../../../core/shared/types';

describe('Economic Gatekeeper (FASE 2.4)', () => {
  let gatekeeper: EconomicGatekeeper;
  let circuitBreaker: InMemoryCircuitBreaker;
  let treasury: InMemoryTreasury;
  
  const guaranteeFundId = 'cont-guarantee-fund' as EntityId;
  
  beforeEach(() => {
    circuitBreaker = new InMemoryCircuitBreaker();
    treasury = new InMemoryTreasury(guaranteeFundId);
    gatekeeper = new EconomicGatekeeper(circuitBreaker, treasury);
  });
  
  describe('assessTransfer()', () => {
    it('allows transfer when circuit breaker is closed', () => {
      const context: TransferContext = {
        sourceId: 'wallet-1' as EntityId,
        destinationId: 'wallet-2' as EntityId,
        itemId: 'curr-usd' as EntityId,
        amount: 1000n,
        actor: { type: 'Entity', entityId: 'user-1' as EntityId },
      };
      
      const result = gatekeeper.assessTransfer(context);
      
      assert.strictEqual(result.allowed, true);
      assert.ok(result.correlationId.startsWith('tx-'));
    });
    
    it('blocks transfer when circuit breaker is open', () => {
      circuitBreaker.trip('Market crash detected');
      
      const context: TransferContext = {
        sourceId: 'wallet-1' as EntityId,
        destinationId: 'wallet-2' as EntityId,
        itemId: 'curr-usd' as EntityId,
        amount: 1000n,
        actor: { type: 'Entity', entityId: 'user-1' as EntityId },
      };
      
      const result = gatekeeper.assessTransfer(context);
      
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason?.includes('Circuit Breaker is OPEN'));
      assert.ok(result.reason?.includes('Market crash detected'));
      assert.strictEqual(result.netAmount, 0n);
    });
    
    it('calculates 0.1% tax on currency transfers', () => {
      const context: TransferContext = {
        sourceId: 'wallet-1' as EntityId,
        destinationId: 'wallet-2' as EntityId,
        itemId: 'curr-usd' as EntityId,
        amount: 10000n, // 10000 units
        actor: { type: 'Entity', entityId: 'user-1' as EntityId },
      };
      
      const result = gatekeeper.assessTransfer(context);
      
      assert.strictEqual(result.allowed, true);
      assert.strictEqual(result.fees.length, 1);
      assert.strictEqual(result.fees[0].amount, 10n); // 0.1% of 10000
      assert.strictEqual(result.fees[0].recipientId, guaranteeFundId);
      assert.strictEqual(result.fees[0].feeType, 'tax');
      assert.strictEqual(result.netAmount, 9990n); // 10000 - 10
    });
    
    it('applies no tax on non-currency items', () => {
      const context: TransferContext = {
        sourceId: 'workspace-1' as EntityId,
        destinationId: 'workspace-2' as EntityId,
        itemId: 'file-123' as EntityId, // Not a currency
        amount: 1n,
        actor: { type: 'Entity', entityId: 'user-1' as EntityId },
      };
      
      const result = gatekeeper.assessTransfer(context);
      
      assert.strictEqual(result.allowed, true);
      assert.strictEqual(result.fees.length, 0);
      assert.strictEqual(result.netAmount, 1n);
    });
    
    it('handles small amounts (fee floors to 0)', () => {
      const context: TransferContext = {
        sourceId: 'wallet-1' as EntityId,
        destinationId: 'wallet-2' as EntityId,
        itemId: 'curr-usd' as EntityId,
        amount: 5n, // Too small for 0.1% fee
        actor: { type: 'Entity', entityId: 'user-1' as EntityId },
      };
      
      const result = gatekeeper.assessTransfer(context);
      
      assert.strictEqual(result.allowed, true);
      assert.strictEqual(result.fees.length, 0); // No fee for small amounts
      assert.strictEqual(result.netAmount, 5n);
    });
    
    it('generates unique correlation IDs', () => {
      const context: TransferContext = {
        sourceId: 'wallet-1' as EntityId,
        destinationId: 'wallet-2' as EntityId,
        itemId: 'curr-usd' as EntityId,
        amount: 1000n,
        actor: { type: 'System' },
      };
      
      const result1 = gatekeeper.assessTransfer(context);
      const result2 = gatekeeper.assessTransfer(context);
      
      assert.notStrictEqual(result1.correlationId, result2.correlationId);
    });
    
    it('respects custom tax rate', () => {
      treasury.setTaxRateBps(100n); // 1%
      
      const context: TransferContext = {
        sourceId: 'wallet-1' as EntityId,
        destinationId: 'wallet-2' as EntityId,
        itemId: 'curr-usd' as EntityId,
        amount: 10000n,
        actor: { type: 'Entity', entityId: 'user-1' as EntityId },
      };
      
      const result = gatekeeper.assessTransfer(context);
      
      assert.strictEqual(result.fees[0].amount, 100n); // 1% of 10000
      assert.strictEqual(result.netAmount, 9900n);
    });
  });
  
  describe('canTransfer()', () => {
    it('returns true when circuit breaker is closed', () => {
      const context: TransferContext = {
        sourceId: 'wallet-1' as EntityId,
        destinationId: 'wallet-2' as EntityId,
        itemId: 'curr-usd' as EntityId,
        amount: 1000n,
        actor: { type: 'System' },
      };
      
      assert.strictEqual(gatekeeper.canTransfer(context), true);
    });
    
    it('returns false when circuit breaker is open', () => {
      circuitBreaker.trip('Emergency');
      
      const context: TransferContext = {
        sourceId: 'wallet-1' as EntityId,
        destinationId: 'wallet-2' as EntityId,
        itemId: 'curr-usd' as EntityId,
        amount: 1000n,
        actor: { type: 'System' },
      };
      
      assert.strictEqual(gatekeeper.canTransfer(context), false);
    });
  });
  
  describe('getStatus()', () => {
    it('returns current economic status', () => {
      const status = gatekeeper.getStatus();
      
      assert.strictEqual(status.circuitBreakerOpen, false);
      assert.strictEqual(status.reason, null);
      assert.strictEqual(status.taxRateBps, 10n);
      assert.strictEqual(status.guaranteeFundId, guaranteeFundId);
    });
    
    it('reflects circuit breaker state', () => {
      circuitBreaker.trip('Test reason');
      
      const status = gatekeeper.getStatus();
      
      assert.strictEqual(status.circuitBreakerOpen, true);
      assert.strictEqual(status.reason, 'Test reason');
    });
  });
  
  describe('InMemoryCircuitBreaker', () => {
    it('starts closed', () => {
      assert.strictEqual(circuitBreaker.isOpen(), false);
      assert.strictEqual(circuitBreaker.getReason(), null);
      assert.strictEqual(circuitBreaker.getTrippedAt(), null);
    });
    
    it('can be tripped', () => {
      circuitBreaker.trip('Market volatility');
      
      assert.strictEqual(circuitBreaker.isOpen(), true);
      assert.strictEqual(circuitBreaker.getReason(), 'Market volatility');
      assert.ok(circuitBreaker.getTrippedAt()! > 0);
    });
    
    it('can be reset', () => {
      circuitBreaker.trip('Test');
      circuitBreaker.reset();
      
      assert.strictEqual(circuitBreaker.isOpen(), false);
      assert.strictEqual(circuitBreaker.getReason(), null);
    });
  });
  
  describe('InMemoryTreasury', () => {
    it('identifies currency by prefix', () => {
      assert.strictEqual(treasury.isCurrency('curr-usd' as EntityId), true);
      assert.strictEqual(treasury.isCurrency('credit-100' as EntityId), true);
      assert.strictEqual(treasury.isCurrency('ubl-token' as EntityId), true);
      assert.strictEqual(treasury.isCurrency('file-123' as EntityId), false);
      assert.strictEqual(treasury.isCurrency('nft-abc' as EntityId), false);
    });
    
    it('returns guarantee fund ID', () => {
      assert.strictEqual(treasury.getGuaranteeFundId(), guaranteeFundId);
    });
    
    it('allows tax rate adjustment', () => {
      assert.strictEqual(treasury.getTaxRateBps(), 10n);
      
      treasury.setTaxRateBps(50n);
      
      assert.strictEqual(treasury.getTaxRateBps(), 50n);
    });
  });
  
  describe('createEconomicGatekeeper()', () => {
    it('creates gatekeeper with default implementations', () => {
      const gk = createEconomicGatekeeper();
      
      const status = gk.getStatus();
      assert.strictEqual(status.circuitBreakerOpen, false);
      assert.strictEqual(status.taxRateBps, 10n);
    });
  });
});
