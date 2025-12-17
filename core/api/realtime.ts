/**
 * REALTIME - WebSocket & SSE Streaming
 * 
 * Subscribe to changes in the ledger in real-time.
 * Two modes:
 * - WebSocket: Bidirectional, for interactive clients
 * - SSE: Unidirectional, for simpler integrations
 * 
 * Both support:
 * - Event subscriptions (by type, aggregate, realm)
 * - State change notifications
 * - Workflow transition alerts
 * - Custom queries with live updates
 */

import type { EntityId, Timestamp, Event, AggregateType, ActorReference } from '../schema/ledger';
import type { Query, QueryResult, Subscription } from './query-language';
import type { Intent, IntentResult, Affordance } from './intent-api';

// ============================================================================
// SUBSCRIPTION TYPES
// ============================================================================

/**
 * What to subscribe to
 */
export interface SubscriptionRequest {
  /** Unique subscription ID (client-generated or server-assigned) */
  readonly id?: string;
  
  /** Subscription type */
  readonly type: SubscriptionType;
  
  /** Filters */
  readonly filters: SubscriptionFilters;
  
  /** Include full event payload or just notification */
  readonly includePayload?: boolean;
  
  /** Debounce rapid changes (ms) */
  readonly debounceMs?: number;
  
  /** Replay recent events on subscribe */
  readonly replayFrom?: Timestamp | 'beginning' | number; // number = last N events
}

export type SubscriptionType = 
  | 'events'           // Subscribe to raw events
  | 'aggregate'        // Subscribe to changes on a specific aggregate
  | 'query'            // Subscribe to query result changes
  | 'workflow'         // Subscribe to workflow transitions
  | 'affordances';     // Subscribe to available actions changes

export interface SubscriptionFilters {
  /** Filter by realm */
  readonly realm?: EntityId;
  
  /** Filter by event types */
  readonly eventTypes?: readonly string[];
  
  /** Filter by aggregate */
  readonly aggregate?: {
    readonly type?: AggregateType;
    readonly id?: EntityId;
  };
  
  /** Filter by actor */
  readonly actor?: ActorReference;
  
  /** Custom query for 'query' subscription type */
  readonly query?: Query;
  
  /** For workflow subscriptions */
  readonly workflowDefinitionId?: EntityId;
  readonly workflowStates?: readonly string[];
}

/**
 * Messages sent to subscribers
 */
export type SubscriptionMessage = 
  | EventMessage
  | StateChangeMessage
  | WorkflowMessage
  | AffordanceMessage
  | QueryResultMessage
  | ErrorMessage
  | HeartbeatMessage;

export interface EventMessage {
  readonly type: 'event';
  readonly subscriptionId: string;
  readonly event: {
    readonly id: EntityId;
    readonly sequence: bigint;
    readonly timestamp: Timestamp;
    readonly eventType: string;
    readonly aggregateType: AggregateType;
    readonly aggregateId: EntityId;
    readonly payload?: unknown;
  };
}

export interface StateChangeMessage {
  readonly type: 'stateChange';
  readonly subscriptionId: string;
  readonly aggregate: {
    readonly type: AggregateType;
    readonly id: EntityId;
  };
  readonly change: {
    readonly field: string;
    readonly previousValue: unknown;
    readonly newValue: unknown;
  };
  readonly causedBy: EntityId; // Event ID
}

export interface WorkflowMessage {
  readonly type: 'workflow';
  readonly subscriptionId: string;
  readonly workflowId: EntityId;
  readonly transition: {
    readonly name: string;
    readonly from: string;
    readonly to: string;
  };
  readonly targetAggregate: {
    readonly type: AggregateType;
    readonly id: EntityId;
  };
  readonly timestamp: Timestamp;
}

export interface AffordanceMessage {
  readonly type: 'affordances';
  readonly subscriptionId: string;
  readonly context: {
    readonly targetType?: string;
    readonly targetId?: EntityId;
  };
  readonly affordances: readonly Affordance[];
  readonly reason: string; // Why did affordances change
}

export interface QueryResultMessage {
  readonly type: 'queryResult';
  readonly subscriptionId: string;
  readonly change: 'added' | 'updated' | 'removed';
  readonly data: unknown;
  readonly causedBy: EntityId; // Event ID
}

export interface ErrorMessage {
  readonly type: 'error';
  readonly subscriptionId?: string;
  readonly code: string;
  readonly message: string;
}

export interface HeartbeatMessage {
  readonly type: 'heartbeat';
  readonly timestamp: Timestamp;
  readonly serverSequence: bigint;
}

// ============================================================================
// WEBSOCKET PROTOCOL
// ============================================================================

/**
 * Messages FROM client TO server
 */
export type ClientMessage = 
  | SubscribeMessage
  | UnsubscribeMessage
  | IntentMessage
  | ChatMessage
  | PingMessage;

export interface SubscribeMessage {
  readonly action: 'subscribe';
  readonly subscription: SubscriptionRequest;
}

export interface UnsubscribeMessage {
  readonly action: 'unsubscribe';
  readonly subscriptionId: string;
}

export interface IntentMessage {
  readonly action: 'intend';
  readonly intent: Intent;
  readonly requestId?: string;
}

export interface ChatMessage {
  readonly action: 'chat';
  readonly sessionId?: string;
  readonly message: { text: string; context?: any };
  readonly startSession?: { realmId: string; actor: any };
  readonly requestId?: string;
}

export interface PingMessage {
  readonly action: 'ping';
}

/**
 * Messages FROM server TO client
 */
export type ServerMessage = 
  | SubscriptionMessage
  | SubscribedMessage
  | UnsubscribedMessage
  | IntentResultMessage
  | ChatResponseMessage
  | PongMessage;

export interface SubscribedMessage {
  readonly type: 'subscribed';
  readonly subscriptionId: string;
  readonly replayCount?: number;
}

export interface UnsubscribedMessage {
  readonly type: 'unsubscribed';
  readonly subscriptionId: string;
}

export interface IntentResultMessage {
  readonly type: 'intentResult';
  readonly requestId?: string;
  readonly result: IntentResult;
}

export interface ChatResponseMessage {
  readonly type: 'chatResponse';
  readonly requestId?: string;
  readonly response: {
    id: string;
    content: { type: string; markdown: string };
    affordances?: any[];
    suggestions?: string[];
  };
  readonly sessionId: string;
}

export interface PongMessage {
  readonly type: 'pong';
  readonly timestamp: Timestamp;
}

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

export interface WebSocketServer {
  /** Start the WebSocket server */
  start(): Promise<void>;
  
  /** Stop the server */
  stop(): Promise<void>;
  
  /** Broadcast to all matching subscriptions */
  broadcast(message: SubscriptionMessage): void;
  
  /** Get active connections count */
  getConnectionCount(): number;
  
  /** Get active subscriptions count */
  getSubscriptionCount(): number;
}

export interface WebSocketServerConfig {
  readonly port: number;
  readonly path?: string; // Default: /ws
  readonly heartbeatIntervalMs?: number; // Default: 30000
  readonly maxConnectionsPerIp?: number;
  readonly maxSubscriptionsPerConnection?: number;
}

export function createWebSocketServer(
  config: WebSocketServerConfig,
  handlers: WebSocketHandlers
): WebSocketServer {
  const connections = new Map<string, ConnectionState>();
  const subscriptions = new Map<string, SubscriptionState>();
  
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  
  return {
    async start() {
      console.log(`WebSocket server starting on port ${config.port}${config.path || '/ws'}`);
      
      // Start heartbeat
      heartbeatInterval = setInterval(() => {
        const heartbeat: HeartbeatMessage = {
          type: 'heartbeat',
          timestamp: Date.now(),
          serverSequence: handlers.getCurrentSequence(),
        };
        
        for (const conn of connections.values()) {
          conn.send(heartbeat);
        }
      }, config.heartbeatIntervalMs || 30000);
      
      console.log('WebSocket server ready');
      console.log('');
      console.log('Protocol:');
      console.log('  → { action: "subscribe", subscription: {...} }');
      console.log('  → { action: "unsubscribe", subscriptionId: "..." }');
      console.log('  → { action: "intend", intent: {...} }');
      console.log('  → { action: "ping" }');
      console.log('');
      console.log('  ← { type: "event", ... }');
      console.log('  ← { type: "stateChange", ... }');
      console.log('  ← { type: "workflow", ... }');
      console.log('  ← { type: "heartbeat", ... }');
    },
    
    async stop() {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      
      // Close all connections
      for (const conn of connections.values()) {
        conn.close();
      }
      
      connections.clear();
      subscriptions.clear();
      
      console.log('WebSocket server stopped');
    },
    
    broadcast(message: SubscriptionMessage) {
      // Find matching subscriptions
      for (const [subId, sub] of subscriptions) {
        if (matchesSubscription(message, sub)) {
          const conn = connections.get(sub.connectionId);
          if (conn) {
            conn.send({ ...message, subscriptionId: subId });
          }
        }
      }
    },
    
    getConnectionCount() {
      return connections.size;
    },
    
    getSubscriptionCount() {
      return subscriptions.size;
    },
  };
}

interface ConnectionState {
  readonly id: string;
  readonly connectedAt: Timestamp;
  readonly subscriptions: Set<string>;
  send(message: ServerMessage): void;
  close(): void;
}

interface SubscriptionState {
  readonly id: string;
  readonly connectionId: string;
  readonly request: SubscriptionRequest;
  readonly createdAt: Timestamp;
}

interface WebSocketHandlers {
  getCurrentSequence(): bigint;
  handleIntent(intent: Intent): Promise<IntentResult>;
  getEventsFrom(sequence: bigint): AsyncIterable<Event>;
}

function matchesSubscription(message: SubscriptionMessage, sub: SubscriptionState): boolean {
  const filters = sub.request.filters;
  
  if (message.type === 'event') {
    // Check event type filter
    if (filters.eventTypes && !filters.eventTypes.includes(message.event.eventType)) {
      return false;
    }
    
    // Check aggregate filter
    if (filters.aggregate) {
      if (filters.aggregate.type && message.event.aggregateType !== filters.aggregate.type) {
        return false;
      }
      if (filters.aggregate.id && message.event.aggregateId !== filters.aggregate.id) {
        return false;
      }
    }
    
    return true;
  }
  
  // Other message types would have their own matching logic
  return true;
}

// ============================================================================
// SSE (Server-Sent Events) STREAMING
// ============================================================================

/**
 * SSE is simpler than WebSocket - unidirectional, HTTP-based.
 * Great for dashboards, monitoring, and simple clients.
 */

export interface SSEServerConfig {
  readonly path?: string; // Default: /events
  readonly keepAliveIntervalMs?: number; // Default: 15000
  readonly retryMs?: number; // Client retry interval on disconnect
}

export interface SSEStream {
  /** Send an event to the stream */
  send(event: SSEEvent): void;
  
  /** Send a comment (keep-alive) */
  comment(text: string): void;
  
  /** Close the stream */
  close(): void;
  
  /** Is the stream open? */
  readonly isOpen: boolean;
}

export interface SSEEvent {
  /** Event type (maps to EventSource event listener) */
  readonly event?: string;
  
  /** Event data (will be JSON stringified if object) */
  readonly data: unknown;
  
  /** Event ID (for Last-Event-ID reconnection) */
  readonly id?: string;
  
  /** Retry interval for client */
  readonly retry?: number;
}

/**
 * SSE endpoint handler
 */
export interface SSEEndpoint {
  /** Handle a new SSE connection */
  handleConnection(
    request: SSEConnectionRequest,
    stream: SSEStream
  ): Promise<void>;
}

export interface SSEConnectionRequest {
  readonly realm: EntityId;
  readonly actor: ActorReference;
  readonly lastEventId?: string; // For reconnection
  readonly filters?: SubscriptionFilters;
}

export function createSSEEndpoint(
  config: SSEServerConfig,
  handlers: SSEHandlers
): SSEEndpoint {
  return {
    async handleConnection(request, stream) {
      console.log(`SSE connection from realm ${request.realm}`);
      
      // Send retry interval
      stream.send({ retry: config.retryMs || 3000, data: '' });
      
      // Replay from last event if reconnecting
      if (request.lastEventId) {
        const sequence = BigInt(request.lastEventId);
        for await (const event of handlers.getEventsFrom(sequence + 1n)) {
          if (!stream.isOpen) break;
          
          stream.send({
            event: event.type,
            data: formatEventForSSE(event),
            id: event.sequence.toString(),
          });
        }
      }
      
      // Subscribe to new events
      const unsubscribe = handlers.subscribe(request.filters || {}, (event) => {
        if (!stream.isOpen) {
          unsubscribe();
          return;
        }
        
        stream.send({
          event: event.type,
          data: formatEventForSSE(event),
          id: event.sequence.toString(),
        });
      });
      
      // Keep-alive
      const keepAlive = setInterval(() => {
        if (stream.isOpen) {
          stream.comment(`keep-alive ${Date.now()}`);
        } else {
          clearInterval(keepAlive);
          unsubscribe();
        }
      }, config.keepAliveIntervalMs || 15000);
    },
  };
}

interface SSEHandlers {
  getEventsFrom(sequence: bigint): AsyncIterable<Event>;
  subscribe(filters: SubscriptionFilters, callback: (event: Event) => void): () => void;
}

function formatEventForSSE(event: Event): object {
  return {
    id: event.id,
    sequence: event.sequence.toString(),
    timestamp: event.timestamp,
    type: event.type,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: event.payload,
  };
}

// ============================================================================
// STREAMING PATTERNS
// ============================================================================

/**
 * Common streaming patterns for different use cases
 */
export const STREAMING_PATTERNS = {
  /**
   * Dashboard: All events in a realm
   */
  dashboard: (realmId: EntityId): SubscriptionRequest => ({
    type: 'events',
    filters: { realm: realmId },
    includePayload: true,
  }),
  
  /**
   * Entity detail: Changes to a specific entity
   */
  entityDetail: (entityId: EntityId): SubscriptionRequest => ({
    type: 'aggregate',
    filters: {
      aggregate: { type: 'Party', id: entityId },
    },
    includePayload: true,
  }),
  
  /**
   * Agreement tracker: All agreement state changes
   */
  agreementTracker: (realmId: EntityId): SubscriptionRequest => ({
    type: 'events',
    filters: {
      realm: realmId,
      eventTypes: ['AgreementCreated', 'AgreementStatusChanged', 'ConsentRecorded'],
    },
  }),
  
  /**
   * Workflow monitor: All workflow transitions
   */
  workflowMonitor: (realmId: EntityId): SubscriptionRequest => ({
    type: 'workflow',
    filters: { realm: realmId },
  }),
  
  /**
   * Audit log: All events by a specific actor
   */
  auditLog: (actorId: EntityId): SubscriptionRequest => ({
    type: 'events',
    filters: {
      actor: { type: 'Party', partyId: actorId },
    },
    includePayload: true,
  }),
  
  /**
   * Asset tracker: Changes to specific asset
   */
  assetTracker: (assetId: EntityId): SubscriptionRequest => ({
    type: 'aggregate',
    filters: {
      aggregate: { type: 'Asset', id: assetId },
    },
  }),
  
  /**
   * Live query: Keep a query result up to date
   */
  liveQuery: (query: Query): SubscriptionRequest => ({
    type: 'query',
    filters: { query },
    debounceMs: 500,
  }),
};

// ============================================================================
// SSE URL EXAMPLES
// ============================================================================

/**
 * Example SSE URLs for common use cases:
 * 
 * /events?realm=abc123
 *   → All events in realm
 * 
 * /events?realm=abc123&type=AgreementCreated,AgreementStatusChanged
 *   → Only agreement events
 * 
 * /events?aggregate=Party:person-123
 *   → All events for a specific entity
 * 
 * /events?lastEventId=42
 *   → Reconnect from event 42
 */

