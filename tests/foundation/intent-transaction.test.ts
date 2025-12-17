/**
 * INTENT TRANSACTION TESTS
 * 
 * FASE 2.2: Tests for IntentTransaction with compensation steps
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createInMemoryEventStore, type EventStore } from '../../core/store/event-store';
import {
  IntentTransaction,
  createIntentTransaction,
  createTransferTransaction,
  type TransactionStep,
} from '../../core/transactions/intent-transaction';
import type { EntityId, AggregateType } from '../../core/schema/ledger';

describe('IntentTransaction (FASE 2.2)', () => {
  let eventStore: EventStore;
  const testActor = { type: 'System' as const, systemId: 'test' };
  
  beforeEach(() => {
    eventStore = createInMemoryEventStore();
  });
  
  describe('Basic Transaction', () => {
    it('executes steps in order', async () => {
      const executionOrder: string[] = [];
      
      const tx = createIntentTransaction(eventStore, testActor);
      
      tx.addStep({
        name: 'step1',
        execute: async () => {
          executionOrder.push('step1');
          return 'result1';
        },
      });
      
      tx.addStep({
        name: 'step2',
        execute: async () => {
          executionOrder.push('step2');
          return 'result2';
        },
      });
      
      const result = await tx.execute();
      
      assert.strictEqual(result.status, 'committed');
      assert.deepStrictEqual(executionOrder, ['step1', 'step2']);
      assert.strictEqual(result.steps.length, 2);
      assert.ok(result.steps.every(s => s.status === 'success'));
    });
    
    it('generates unique correlation ID', async () => {
      const tx1 = createIntentTransaction(eventStore, testActor);
      const tx2 = createIntentTransaction(eventStore, testActor);
      
      assert.notStrictEqual(tx1.getCorrelationId(), tx2.getCorrelationId());
      assert.ok(tx1.getCorrelationId().startsWith('corr-'));
    });
    
    it('generates unique transaction ID', async () => {
      const tx1 = createIntentTransaction(eventStore, testActor);
      const tx2 = createIntentTransaction(eventStore, testActor);
      
      assert.notStrictEqual(tx1.getTransactionId(), tx2.getTransactionId());
      assert.ok(tx1.getTransactionId().startsWith('tx-'));
    });
    
    it('tracks execution duration', async () => {
      const tx = createIntentTransaction(eventStore, testActor);
      
      tx.addStep({
        name: 'slow-step',
        execute: async () => {
          await new Promise(r => setTimeout(r, 10));
          return 'done';
        },
      });
      
      const result = await tx.execute();
      
      assert.ok(result.steps[0].duration >= 10);
    });
  });
  
  describe('Compensation (Rollback)', () => {
    it('compensates on failure in reverse order', async () => {
      const compensationOrder: string[] = [];
      
      const tx = createIntentTransaction(eventStore, testActor);
      
      tx.addStep({
        name: 'step1',
        execute: async () => 'result1',
        compensate: async () => {
          compensationOrder.push('comp1');
        },
      });
      
      tx.addStep({
        name: 'step2',
        execute: async () => 'result2',
        compensate: async () => {
          compensationOrder.push('comp2');
        },
      });
      
      tx.addStep({
        name: 'step3-fails',
        execute: async () => {
          throw new Error('Step 3 failed');
        },
      });
      
      const result = await tx.execute();
      
      assert.strictEqual(result.status, 'rolled_back');
      assert.deepStrictEqual(compensationOrder, ['comp2', 'comp1']); // Reverse order
      assert.ok(result.error?.includes('Step 3 failed'));
    });
    
    it('records compensation step results', async () => {
      const tx = createIntentTransaction(eventStore, testActor);
      
      tx.addStep({
        name: 'step1',
        execute: async () => 'result1',
        compensate: async () => {},
      });
      
      tx.addStep({
        name: 'step2-fails',
        execute: async () => {
          throw new Error('Failed');
        },
      });
      
      const result = await tx.execute();
      
      const compStep = result.steps.find(s => s.name === 'step1:compensate');
      assert.ok(compStep);
      assert.strictEqual(compStep.status, 'compensated');
    });
    
    it('handles compensation failures gracefully', async () => {
      const tx = createIntentTransaction(eventStore, testActor);
      
      tx.addStep({
        name: 'step1',
        execute: async () => 'result1',
        compensate: async () => {
          throw new Error('Compensation failed');
        },
      });
      
      tx.addStep({
        name: 'step2-fails',
        execute: async () => {
          throw new Error('Step failed');
        },
      });
      
      const result = await tx.execute();
      
      assert.strictEqual(result.status, 'rolled_back');
      const compStep = result.steps.find(s => s.name === 'step1:compensate');
      assert.strictEqual(compStep?.status, 'failed');
      assert.ok(compStep?.error?.includes('Compensation failed'));
    });
  });
  
  describe('Event Append Steps', () => {
    it('appends events with correlation ID', async () => {
      const tx = createIntentTransaction(eventStore, testActor);
      
      tx.appendEvent('create-wallet', {
        type: 'WalletCreated',
        aggregateId: 'wallet-1' as EntityId,
        aggregateType: 'Wallet' as AggregateType,
        aggregateVersion: 1,
        actor: testActor,
        payload: { name: 'Test Wallet' },
      });
      
      const result = await tx.execute();
      
      assert.strictEqual(result.status, 'committed');
      
      // Verify event has correlation ID
      const queryResult = await eventStore.query({
        correlationId: tx.getCorrelationId() as EntityId,
      });
      
      assert.strictEqual(queryResult.total, 1);
      assert.strictEqual(queryResult.events[0].type, 'WalletCreated');
    });
  });
  
  describe('Transfer Transaction', () => {
    it('creates transfer with proper correlation', async () => {
      const tx = createTransferTransaction(eventStore, testActor, {
        fromContainerId: 'wallet-1' as EntityId,
        toContainerId: 'wallet-2' as EntityId,
        itemId: 'curr-usd' as EntityId,
        amount: 1000n,
      });
      
      const result = await tx.execute();
      
      assert.strictEqual(result.status, 'committed');
      assert.strictEqual(result.steps.length, 2); // withdraw + deposit
      
      // All events should have same correlation ID
      const queryResult = await eventStore.query({
        correlationId: tx.getCorrelationId() as EntityId,
      });
      
      assert.strictEqual(queryResult.total, 2);
    });
    
    it('creates transfer with fees', async () => {
      const tx = createTransferTransaction(eventStore, testActor, {
        fromContainerId: 'wallet-1' as EntityId,
        toContainerId: 'wallet-2' as EntityId,
        itemId: 'curr-usd' as EntityId,
        amount: 1000n,
        fees: [
          {
            recipientId: 'guarantee-fund' as EntityId,
            amount: 1n,
            reason: 'Network Tax',
          },
        ],
      });
      
      const result = await tx.execute();
      
      assert.strictEqual(result.status, 'committed');
      assert.strictEqual(result.steps.length, 3); // withdraw + deposit + fee
      
      // All events should have same correlation ID
      const queryResult = await eventStore.query({
        correlationId: tx.getCorrelationId() as EntityId,
      });
      
      assert.strictEqual(queryResult.total, 3);
    });
  });
  
  describe('Transaction State', () => {
    it('prevents adding steps after execution starts', async () => {
      const tx = createIntentTransaction(eventStore, testActor);
      
      tx.addStep({
        name: 'step1',
        execute: async () => 'done',
      });
      
      await tx.execute();
      
      assert.throws(() => {
        tx.addStep({
          name: 'step2',
          execute: async () => 'too late',
        });
      }, /Cannot add steps/);
    });
    
    it('prevents double execution', async () => {
      const tx = createIntentTransaction(eventStore, testActor);
      
      tx.addStep({
        name: 'step1',
        execute: async () => 'done',
      });
      
      await tx.execute();
      
      await assert.rejects(
        async () => tx.execute(),
        /already committed/
      );
    });
    
    it('tracks status correctly', async () => {
      const tx = createIntentTransaction(eventStore, testActor);
      
      assert.strictEqual(tx.getStatus(), 'pending');
      
      tx.addStep({
        name: 'step1',
        execute: async () => 'done',
      });
      
      await tx.execute();
      
      assert.strictEqual(tx.getStatus(), 'committed');
    });
  });
});
