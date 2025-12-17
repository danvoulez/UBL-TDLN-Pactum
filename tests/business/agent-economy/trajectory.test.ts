/**
 * TRAJECTORY TESTS
 * 
 * FASE 2.3: Tests for trajectory tracking and TrajectoryAggregate
 * "The agent IS its trajectory."
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createInMemoryEventStore, type EventStore } from '../../../core/store/event-store';
import { TrajectoryAggregate, type TrajectoryState } from '../../../core/aggregates/trajectory-aggregate';
import type { EntityId, AggregateType } from '../../../core/schema/ledger';

describe('Trajectory Tracking (FASE 2.3)', () => {
  let eventStore: EventStore;
  const testActor = { type: 'System' as const, systemId: 'test' };
  
  const entityId = 'agent-001' as EntityId;
  
  beforeEach(() => {
    eventStore = createInMemoryEventStore();
  });
  
  async function recordSpan(options: {
    action: string;
    success?: boolean;
    tokens?: { input: number; output: number };
    cost?: bigint;
    durationMs?: number;
  }): Promise<void> {
    const version = await eventStore.getNextVersion('Trajectory' as AggregateType, entityId);
    const spanId = `span-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` as EntityId;
    
    await eventStore.append({
      type: 'TrajectorySpanRecorded',
      aggregateId: entityId,
      aggregateType: 'Trajectory' as AggregateType,
      aggregateVersion: version,
      actor: testActor,
      payload: {
        entityId,
        spanId,
        action: options.action,
        success: options.success ?? true,
        inputHash: 'hash-input-' + spanId,
        outputHash: 'hash-output-' + spanId,
        execution: {
          provider: 'anthropic',
          model: 'claude-3',
          tokens: options.tokens ?? { input: 100, output: 50 },
          cost: options.cost ?? 10n,
          durationMs: options.durationMs ?? 500,
        },
      },
    });
  }
  
  async function rehydrateTrajectory(): Promise<TrajectoryAggregate> {
    const aggregate = new TrajectoryAggregate(entityId);
    
    for await (const event of eventStore.getByAggregate('Trajectory' as AggregateType, entityId)) {
      aggregate.apply(event);
    }
    
    return aggregate;
  }
  
  describe('TrajectoryAggregate', () => {
    it('starts with empty state', async () => {
      const trajectory = new TrajectoryAggregate(entityId);
      const state = trajectory.getState();
      
      assert.strictEqual(state.entityId, entityId);
      assert.strictEqual(state.totalSpans, 0);
      assert.strictEqual(state.totalCost, 0n);
      assert.strictEqual(state.totalTokens, 0);
      assert.strictEqual(state.successRate, 1.0);
    });
    
    it('records trajectory spans', async () => {
      await recordSpan({ action: 'chat' });
      
      const trajectory = await rehydrateTrajectory();
      const state = trajectory.getState();
      
      assert.strictEqual(state.totalSpans, 1);
      assert.strictEqual(state.spans.length, 1);
      assert.strictEqual(state.spans[0].action, 'chat');
      assert.ok(state.firstActionAt);
      assert.ok(state.lastActionAt);
    });
    
    it('tracks action counts', async () => {
      await recordSpan({ action: 'chat' });
      await recordSpan({ action: 'chat' });
      await recordSpan({ action: 'search' });
      await recordSpan({ action: 'chat' });
      
      const trajectory = await rehydrateTrajectory();
      const state = trajectory.getState();
      
      assert.strictEqual(state.actionCounts['chat'], 3);
      assert.strictEqual(state.actionCounts['search'], 1);
      assert.strictEqual(state.totalSpans, 4);
    });
    
    it('calculates success rate', async () => {
      await recordSpan({ action: 'chat', success: true });
      await recordSpan({ action: 'chat', success: true });
      await recordSpan({ action: 'chat', success: false });
      await recordSpan({ action: 'chat', success: true });
      
      const trajectory = await rehydrateTrajectory();
      const state = trajectory.getState();
      
      // 3 successes out of 4 = 75%
      assert.strictEqual(state.successRate, 0.75);
    });
    
    it('accumulates token usage', async () => {
      await recordSpan({ action: 'chat', tokens: { input: 100, output: 50 } });
      await recordSpan({ action: 'chat', tokens: { input: 200, output: 100 } });
      
      const trajectory = await rehydrateTrajectory();
      const state = trajectory.getState();
      
      assert.strictEqual(state.totalTokens, 450); // 150 + 300
    });
    
    it('accumulates costs', async () => {
      await recordSpan({ action: 'chat', cost: 100n });
      await recordSpan({ action: 'search', cost: 50n });
      await recordSpan({ action: 'chat', cost: 75n });
      
      const trajectory = await rehydrateTrajectory();
      const state = trajectory.getState();
      
      assert.strictEqual(state.totalCost, 225n);
    });
    
    it('tracks duration', async () => {
      await recordSpan({ action: 'chat', durationMs: 500 });
      await recordSpan({ action: 'chat', durationMs: 300 });
      
      const trajectory = await rehydrateTrajectory();
      const state = trajectory.getState();
      
      assert.strictEqual(state.totalDurationMs, 800);
    });
    
    it('maintains chronological order', async () => {
      await recordSpan({ action: 'first' });
      await new Promise(r => setTimeout(r, 10));
      await recordSpan({ action: 'second' });
      await new Promise(r => setTimeout(r, 10));
      await recordSpan({ action: 'third' });
      
      const trajectory = await rehydrateTrajectory();
      const state = trajectory.getState();
      
      assert.strictEqual(state.spans[0].action, 'first');
      assert.strictEqual(state.spans[1].action, 'second');
      assert.strictEqual(state.spans[2].action, 'third');
      assert.ok(state.firstActionAt! < state.lastActionAt!);
    });
  });
  
  describe('Trajectory Queries', () => {
    it('can query spans by action type', async () => {
      await recordSpan({ action: 'chat' });
      await recordSpan({ action: 'search' });
      await recordSpan({ action: 'chat' });
      
      const trajectory = await rehydrateTrajectory();
      const chatSpans = trajectory.getSpansByAction('chat');
      
      assert.strictEqual(chatSpans.length, 2);
      assert.ok(chatSpans.every(s => s.action === 'chat'));
    });
    
    it('can get recent spans by count', async () => {
      await recordSpan({ action: 'old1' });
      await recordSpan({ action: 'old2' });
      await recordSpan({ action: 'recent1' });
      await recordSpan({ action: 'recent2' });
      await recordSpan({ action: 'recent3' });
      
      const trajectory = await rehydrateTrajectory();
      const recent = trajectory.getSpans(3); // Gets last 3 spans
      
      assert.strictEqual(recent.length, 3);
      assert.strictEqual(recent[0].action, 'recent1');
      assert.strictEqual(recent[2].action, 'recent3');
    });
    
    it('calculates average cost per action', async () => {
      await recordSpan({ action: 'chat', cost: 100n });
      await recordSpan({ action: 'chat', cost: 200n });
      await recordSpan({ action: 'chat', cost: 150n });
      
      const trajectory = await rehydrateTrajectory();
      const avgCost = trajectory.getAverageCost();
      
      assert.strictEqual(avgCost, 150n); // (100 + 200 + 150) / 3
    });
  });
  
  describe('Trajectory Integrity', () => {
    it('stores input/output hashes for verification', async () => {
      await recordSpan({ action: 'chat' });
      
      const trajectory = await rehydrateTrajectory();
      const state = trajectory.getState();
      
      assert.ok(state.spans[0].inputHash.startsWith('hash-input-'));
      assert.ok(state.spans[0].outputHash.startsWith('hash-output-'));
    });
    
    it('preserves execution metadata', async () => {
      await recordSpan({
        action: 'chat',
        tokens: { input: 500, output: 250 },
        cost: 1000n,
        durationMs: 2500,
      });
      
      const trajectory = await rehydrateTrajectory();
      const span = trajectory.getState().spans[0];
      
      assert.strictEqual(span.execution.provider, 'anthropic');
      assert.strictEqual(span.execution.model, 'claude-3');
      assert.strictEqual(span.execution.tokens?.input, 500);
      assert.strictEqual(span.execution.tokens?.output, 250);
    });
  });
});
