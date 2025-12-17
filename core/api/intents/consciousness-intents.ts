/**
 * CONSCIOUSNESS INTENTS
 *
 * Intents for the Consciousness Layer:
 * - Daemons: start, stop, sleep, wake, adjust budget
 * - Loops: add, remove, enable, disable
 * - Memory: set, get, clear
 */

import type { IntentDefinition, HandlerContext, IntentResult } from '../intent-api';
import type { EntityId, Quantity } from '../../shared/types';
import { asEntityId, Ids } from '../../shared/types';
import type {
  DaemonMode,
  DaemonBudget,
  DaemonLoop,
  LoopSchedule,
  LoopAction,
  DaemonProvider,
  DaemonStartedPayload,
  DaemonStoppedPayload,
  DaemonSleptPayload,
  DaemonWokePayload,
  DaemonBudgetAdjustedPayload,
  DaemonLoopAddedPayload,
  DaemonLoopRemovedPayload,
  DaemonMemoryUpdatedPayload,
  DaemonHeartbeatPayload,
} from '../../schema/consciousness';
import { createDaemon, createLoop, BUDGET_PRESETS } from '../../schema/consciousness';

// ============================================================================
// START DAEMON
// ============================================================================

const startDaemonIntent: IntentDefinition = {
  type: 'start:daemon',
  description: 'Start a new daemon for autonomous operation',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the daemon' },
      description: { type: 'string', description: 'What this daemon does' },
      mode: { type: 'string', enum: ['Persistent', 'Scheduled', 'Reactive'], default: 'Scheduled' },
      budgetPreset: { type: 'string', enum: ['minimal', 'standard', 'premium', 'unlimited'], default: 'standard' },
      budget: {
        type: 'object',
        description: 'Custom budget (overrides preset)',
        properties: {
          hourlyMax: { type: 'number' },
          dailyMax: { type: 'number' },
          onExhausted: { type: 'string', enum: ['sleep', 'stop', 'notify'] },
        },
      },
      heartbeatInterval: { type: 'string', description: 'ISO 8601 duration for heartbeat (Persistent mode)' },
      loops: {
        type: 'array',
        description: 'Initial loops to add',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            schedule: { type: 'object' },
            action: { type: 'object' },
          },
        },
      },
      provider: {
        type: 'object',
        description: 'LLM provider configuration',
        properties: {
          provider: { type: 'string' },
          model: { type: 'string' },
          contextStrategy: { type: 'string', enum: ['full', 'sliding', 'summary'] },
        },
      },
    },
    required: ['name'],
  },
  examples: [
    {
      description: 'Start a scheduled daemon for daily reports',
      input: {
        name: 'Daily Reporter',
        mode: 'Scheduled',
        budgetPreset: 'standard',
        loops: [
          {
            name: 'Generate Report',
            schedule: { cron: '0 9 * * *' },
            action: { intentType: 'generate:report' },
          },
        ],
      },
    },
  ],
  handler: async (
    payload: {
      name: string;
      description?: string;
      mode?: DaemonMode;
      budgetPreset?: keyof typeof BUDGET_PRESETS;
      budget?: Partial<DaemonBudget>;
      heartbeatInterval?: string;
      loops?: Array<{ name: string; schedule: LoopSchedule; action: LoopAction }>;
      provider?: DaemonProvider;
    },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const mode = payload.mode || 'Scheduled';
    
    // Get budget from preset or custom
    const presetBudget = BUDGET_PRESETS[payload.budgetPreset || 'standard'];
    const budget = {
      hourlyMax: payload.budget?.hourlyMax || presetBudget.hourlyMax,
      dailyMax: payload.budget?.dailyMax || presetBudget.dailyMax,
      onExhausted: payload.budget?.onExhausted || presetBudget.onExhausted,
    };

    const daemonId = Ids.entity();
    const entityId = actor.type === 'Entity' ? actor.entityId : asEntityId('system');

    // Create loops
    const loops: DaemonLoop[] = (payload.loops || []).map((l, i) => 
      createLoop(`loop-${i}`, l.name, l.schedule, l.action)
    );

    const eventPayload: DaemonStartedPayload = {
      type: 'DaemonStarted',
      daemonId,
      entityId,
      name: payload.name,
      mode,
      budget: {
        ...budget,
        currentHourSpend: { amount: BigInt(0), unit: 'mUBL' },
        currentDaySpend: { amount: BigInt(0), unit: 'mUBL' },
        hourResetAt: Date.now() + 3600000,
        dayResetAt: Date.now() + 86400000,
      },
      loops,
    };

    const event = await eventStore.append({
      type: 'DaemonStarted',
      aggregateId: daemonId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Daemon "${payload.name}" started (${mode} mode)`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [
        { intentType: 'stop:daemon', description: 'Stop this daemon' },
        { intentType: 'add:daemon-loop', description: 'Add a loop' },
        { intentType: 'adjust:daemon-budget', description: 'Adjust budget' },
      ],
      meta: {
        daemonId,
        mode,
        loopCount: loops.length,
      },
    };
  },
};

// ============================================================================
// STOP DAEMON
// ============================================================================

const stopDaemonIntent: IntentDefinition = {
  type: 'stop:daemon',
  description: 'Stop a running daemon',
  schema: {
    type: 'object',
    properties: {
      daemonId: { type: 'string', description: 'ID of the daemon to stop' },
      reason: { type: 'string', description: 'Reason for stopping' },
      graceful: { type: 'boolean', default: true, description: 'Wait for current operations to complete' },
    },
    required: ['daemonId', 'reason'],
  },
  examples: [],
  handler: async (
    payload: { daemonId: string; reason: string; graceful?: boolean },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const daemonId = asEntityId(payload.daemonId);

    const eventPayload: DaemonStoppedPayload = {
      type: 'DaemonStopped',
      daemonId,
      reason: payload.reason,
      graceful: payload.graceful ?? true,
      finalStats: {
        totalLoopRuns: 0,
        totalHeartbeats: 0,
        totalCost: { amount: BigInt(0), unit: 'mUBL' },
        totalErrors: 0,
        uptimeSeconds: 0,
      },
    };

    const event = await eventStore.append({
      type: 'DaemonStopped',
      aggregateId: daemonId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Daemon stopped: ${payload.reason}`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [
        { intentType: 'start:daemon', description: 'Start a new daemon' },
      ],
      meta: { daemonId, graceful: payload.graceful ?? true },
    };
  },
};

// ============================================================================
// SLEEP DAEMON
// ============================================================================

const sleepDaemonIntent: IntentDefinition = {
  type: 'sleep:daemon',
  description: 'Put a daemon to sleep temporarily',
  schema: {
    type: 'object',
    properties: {
      daemonId: { type: 'string', description: 'ID of the daemon' },
      reason: { type: 'string', enum: ['budget', 'schedule', 'manual', 'error'] },
      wakeAt: { type: 'number', description: 'Timestamp to wake up (optional)' },
    },
    required: ['daemonId', 'reason'],
  },
  examples: [],
  handler: async (
    payload: { daemonId: string; reason: 'budget' | 'schedule' | 'manual' | 'error'; wakeAt?: number },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const daemonId = asEntityId(payload.daemonId);

    const eventPayload: DaemonSleptPayload = {
      type: 'DaemonSlept',
      daemonId,
      reason: payload.reason,
      wakeAt: payload.wakeAt,
    };

    const event = await eventStore.append({
      type: 'DaemonSlept',
      aggregateId: daemonId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Daemon sleeping (${payload.reason})${payload.wakeAt ? `, will wake at ${new Date(payload.wakeAt).toISOString()}` : ''}`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [
        { intentType: 'wake:daemon', description: 'Wake this daemon' },
      ],
      meta: { daemonId, reason: payload.reason },
    };
  },
};

// ============================================================================
// WAKE DAEMON
// ============================================================================

const wakeDaemonIntent: IntentDefinition = {
  type: 'wake:daemon',
  description: 'Wake a sleeping daemon',
  schema: {
    type: 'object',
    properties: {
      daemonId: { type: 'string', description: 'ID of the daemon' },
      trigger: { type: 'string', enum: ['schedule', 'event', 'manual'] },
    },
    required: ['daemonId', 'trigger'],
  },
  examples: [],
  handler: async (
    payload: { daemonId: string; trigger: 'schedule' | 'event' | 'manual' },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const daemonId = asEntityId(payload.daemonId);

    const eventPayload: DaemonWokePayload = {
      type: 'DaemonWoke',
      daemonId,
      sleepDurationMs: 0,  // Would be calculated from events
      trigger: payload.trigger,
    };

    const event = await eventStore.append({
      type: 'DaemonWoke',
      aggregateId: daemonId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Daemon woke (${payload.trigger})`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [
        { intentType: 'sleep:daemon', description: 'Put daemon to sleep' },
        { intentType: 'stop:daemon', description: 'Stop daemon' },
      ],
      meta: { daemonId, trigger: payload.trigger },
    };
  },
};

// ============================================================================
// ADJUST DAEMON BUDGET
// ============================================================================

const adjustDaemonBudgetIntent: IntentDefinition = {
  type: 'adjust:daemon-budget',
  description: 'Adjust a daemon\'s budget limits',
  schema: {
    type: 'object',
    properties: {
      daemonId: { type: 'string', description: 'ID of the daemon' },
      hourlyMax: { type: 'number', description: 'New hourly max (in mUBL)' },
      dailyMax: { type: 'number', description: 'New daily max (in mUBL)' },
      onExhausted: { type: 'string', enum: ['sleep', 'stop', 'notify'] },
      reason: { type: 'string', description: 'Reason for adjustment' },
    },
    required: ['daemonId', 'reason'],
  },
  examples: [],
  handler: async (
    payload: {
      daemonId: string;
      hourlyMax?: number;
      dailyMax?: number;
      onExhausted?: 'sleep' | 'stop' | 'notify';
      reason: string;
    },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const daemonId = asEntityId(payload.daemonId);
    const adjustedBy = actor.type === 'Entity' ? actor.entityId : asEntityId('system');

    // Build new budget (would merge with existing in real implementation)
    const newBudget: DaemonBudget = {
      hourlyMax: payload.hourlyMax 
        ? { amount: BigInt(payload.hourlyMax), unit: 'mUBL' }
        : { amount: BigInt(1000), unit: 'mUBL' },
      dailyMax: payload.dailyMax
        ? { amount: BigInt(payload.dailyMax), unit: 'mUBL' }
        : { amount: BigInt(10000), unit: 'mUBL' },
      onExhausted: payload.onExhausted || 'notify',
      currentHourSpend: { amount: BigInt(0), unit: 'mUBL' },
      currentDaySpend: { amount: BigInt(0), unit: 'mUBL' },
      hourResetAt: Date.now() + 3600000,
      dayResetAt: Date.now() + 86400000,
    };

    const eventPayload: DaemonBudgetAdjustedPayload = {
      type: 'DaemonBudgetAdjusted',
      daemonId,
      previousBudget: newBudget,  // Would be fetched from aggregate
      newBudget,
      adjustedBy,
      reason: payload.reason,
    };

    const event = await eventStore.append({
      type: 'DaemonBudgetAdjusted',
      aggregateId: daemonId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Daemon budget adjusted: ${payload.reason}`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [],
      meta: { daemonId },
    };
  },
};

// ============================================================================
// ADD DAEMON LOOP
// ============================================================================

const addDaemonLoopIntent: IntentDefinition = {
  type: 'add:daemon-loop',
  description: 'Add a recurring loop to a daemon',
  schema: {
    type: 'object',
    properties: {
      daemonId: { type: 'string', description: 'ID of the daemon' },
      name: { type: 'string', description: 'Name of the loop' },
      description: { type: 'string' },
      schedule: {
        type: 'object',
        properties: {
          cron: { type: 'string' },
          interval: { type: 'string' },
          onEvent: { type: 'string' },
          condition: { type: 'string' },
        },
      },
      action: {
        type: 'object',
        properties: {
          intentType: { type: 'string' },
          intentPayload: { type: 'object' },
          functionRef: { type: 'string' },
          timeout: { type: 'string' },
        },
        required: ['intentType'],
      },
    },
    required: ['daemonId', 'name', 'schedule', 'action'],
  },
  examples: [
    {
      description: 'Add hourly check loop',
      input: {
        daemonId: 'daemon-123',
        name: 'Hourly Health Check',
        schedule: { cron: '0 * * * *' },
        action: { intentType: 'check:health' },
      },
    },
  ],
  handler: async (
    payload: {
      daemonId: string;
      name: string;
      description?: string;
      schedule: LoopSchedule;
      action: LoopAction;
    },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const daemonId = asEntityId(payload.daemonId);
    const loopId = `loop-${Date.now()}`;

    const loop = createLoop(loopId, payload.name, payload.schedule, payload.action);

    const eventPayload: DaemonLoopAddedPayload = {
      type: 'DaemonLoopAdded',
      daemonId,
      loop: {
        ...loop,
        description: payload.description,
      },
    };

    const event = await eventStore.append({
      type: 'DaemonLoopAdded',
      aggregateId: daemonId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Loop "${payload.name}" added to daemon`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [
        { intentType: 'remove:daemon-loop', description: 'Remove this loop' },
      ],
      meta: { daemonId, loopId },
    };
  },
};

// ============================================================================
// REMOVE DAEMON LOOP
// ============================================================================

const removeDaemonLoopIntent: IntentDefinition = {
  type: 'remove:daemon-loop',
  description: 'Remove a loop from a daemon',
  schema: {
    type: 'object',
    properties: {
      daemonId: { type: 'string', description: 'ID of the daemon' },
      loopId: { type: 'string', description: 'ID of the loop to remove' },
      reason: { type: 'string', description: 'Reason for removal' },
    },
    required: ['daemonId', 'loopId', 'reason'],
  },
  examples: [],
  handler: async (
    payload: { daemonId: string; loopId: string; reason: string },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const daemonId = asEntityId(payload.daemonId);

    const eventPayload: DaemonLoopRemovedPayload = {
      type: 'DaemonLoopRemoved',
      daemonId,
      loopId: payload.loopId,
      reason: payload.reason,
    };

    const event = await eventStore.append({
      type: 'DaemonLoopRemoved',
      aggregateId: daemonId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Loop removed: ${payload.reason}`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [],
      meta: { daemonId, loopId: payload.loopId },
    };
  },
};

// ============================================================================
// SET DAEMON MEMORY
// ============================================================================

const setDaemonMemoryIntent: IntentDefinition = {
  type: 'set:daemon-memory',
  description: 'Set a value in daemon\'s working memory',
  schema: {
    type: 'object',
    properties: {
      daemonId: { type: 'string', description: 'ID of the daemon' },
      key: { type: 'string', description: 'Memory key' },
      value: { description: 'Value to store (any JSON-serializable value)' },
      expiresIn: { type: 'string', description: 'ISO 8601 duration until expiry' },
    },
    required: ['daemonId', 'key', 'value'],
  },
  examples: [],
  handler: async (
    payload: { daemonId: string; key: string; value: unknown; expiresIn?: string },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const daemonId = asEntityId(payload.daemonId);

    const eventPayload: DaemonMemoryUpdatedPayload = {
      type: 'DaemonMemoryUpdated',
      daemonId,
      key: payload.key,
      newValue: payload.value,
    };

    const event = await eventStore.append({
      type: 'DaemonMemoryUpdated',
      aggregateId: daemonId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: `Memory set: ${payload.key}`,
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [],
      meta: { daemonId, key: payload.key },
    };
  },
};

// ============================================================================
// SEND HEARTBEAT
// ============================================================================

const sendHeartbeatIntent: IntentDefinition = {
  type: 'send:daemon-heartbeat',
  description: 'Send a heartbeat from a daemon (proof of life)',
  schema: {
    type: 'object',
    properties: {
      daemonId: { type: 'string', description: 'ID of the daemon' },
      memorySnapshot: { type: 'array', description: 'Current memory state' },
    },
    required: ['daemonId'],
  },
  examples: [],
  handler: async (
    payload: { daemonId: string; memorySnapshot?: Array<{ key: string; value: unknown }> },
    context: HandlerContext
  ): Promise<IntentResult> => {
    const { eventStore, actor } = context;
    const daemonId = asEntityId(payload.daemonId);

    const eventPayload: DaemonHeartbeatPayload = {
      type: 'DaemonHeartbeat',
      daemonId,
      status: 'Running',
      memorySnapshot: payload.memorySnapshot?.map(m => ({
        key: m.key,
        value: m.value,
        updatedAt: Date.now(),
      })),
      budgetRemaining: {
        hourly: { amount: BigInt(0), unit: 'mUBL' },
        daily: { amount: BigInt(0), unit: 'mUBL' },
      },
    };

    const event = await eventStore.append({
      type: 'DaemonHeartbeat',
      aggregateId: daemonId,
      aggregateType: 'Asset',
      aggregateVersion: 1,
      payload: eventPayload,
      actor,
    });

    return {
      outcome: {
        status: 'Executed',
        summary: 'Heartbeat sent',
      },
      events: [{ eventId: event.id, type: event.type }],
      affordances: [],
      meta: { daemonId },
    };
  },
};

// ============================================================================
// EXPORT ALL INTENTS
// ============================================================================

export const CONSCIOUSNESS_INTENTS: IntentDefinition[] = [
  startDaemonIntent,
  stopDaemonIntent,
  sleepDaemonIntent,
  wakeDaemonIntent,
  adjustDaemonBudgetIntent,
  addDaemonLoopIntent,
  removeDaemonLoopIntent,
  setDaemonMemoryIntent,
  sendHeartbeatIntent,
];
