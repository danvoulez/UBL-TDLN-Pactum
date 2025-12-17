/**
 * WEBSOCKET SERVER - Real-time subscriptions
 * 
 * Implements WebSocket server for real-time event subscriptions.
 * Uses the ws library and integrates with core/api/realtime.ts
 */

import { WebSocketServer as WSServer, WebSocket } from 'ws';
import type { Server as HTTPServer } from 'node:http';
import type { 
  SubscriptionRequest, 
  SubscriptionMessage, 
  ServerMessage,
  ClientMessage,
} from '../core/api/realtime';
import type { Intent, IntentResult } from '../core/api/intent-api';
import type { Event } from '../core/schema/ledger';
import type { EntityId, Timestamp } from '../core/shared/types';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface WebSocketServerConfig {
  /** HTTP server to attach to */
  server: HTTPServer;
  
  /** WebSocket path */
  path?: string;
  
  /** Heartbeat interval (ms) */
  heartbeatIntervalMs?: number;
  
  /** Max connections per IP */
  maxConnectionsPerIp?: number;
  
  /** Max subscriptions per connection */
  maxSubscriptionsPerConnection?: number;
}

export interface WebSocketHandlers {
  /** Get current event sequence */
  getCurrentSequence(): bigint;
  
  /** Handle intent execution */
  handleIntent(intent: Intent): Promise<IntentResult>;
  
  /** Get events from sequence */
  getEventsFrom(sequence: bigint): AsyncIterable<Event>;
  
  /** Handle chat message */
  handleChat?(request: {
    sessionId?: string;
    message: { text: string; context?: any };
    startSession?: { realmId: string; actor: any };
  }): Promise<{
    response: {
      id: string;
      content: { type: string; markdown: string };
      affordances?: any[];
      suggestions?: string[];
    };
    sessionId: string;
  }>;
}

// ============================================================================
// CONNECTION STATE
// ============================================================================

interface ConnectionState {
  id: string;
  ws: WebSocket;
  ip: string;
  connectedAt: Timestamp;
  subscriptions: Map<string, SubscriptionRequest>;
  isAlive: boolean;
}

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

export class AntennaWebSocketServer {
  private wss: WSServer | null = null;
  private connections: Map<string, ConnectionState> = new Map();
  private subscriptions: Map<string, { connectionId: string; request: SubscriptionRequest }> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  
  constructor(
    private config: WebSocketServerConfig,
    private handlers: WebSocketHandlers
  ) {}
  
  start(): void {
    const { server, path = '/subscribe' } = this.config;
    
    this.wss = new WSServer({ 
      server,
      path,
    });
    
    this.wss.on('connection', (ws: WebSocket, req) => {
      this.handleConnection(ws, req);
    });
    
    // Start heartbeat
    const interval = this.config.heartbeatIntervalMs || 30000;
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, interval);
    
    console.log(`🔌 WebSocket server ready on ${path}`);
  }
  
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    // Close all connections
    for (const conn of this.connections.values()) {
      conn.ws.close();
    }
    
    this.connections.clear();
    this.subscriptions.clear();
    
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    
    console.log('🔌 WebSocket server stopped');
  }
  
  /**
   * Broadcast a message to all matching subscriptions
   */
  broadcast(message: SubscriptionMessage): void {
    for (const [subId, sub] of this.subscriptions) {
      if (this.matchesSubscription(message, sub.request)) {
        const conn = this.connections.get(sub.connectionId);
        if (conn && conn.ws.readyState === WebSocket.OPEN) {
          this.send(conn, { ...message, subscriptionId: subId });
        }
      }
    }
  }
  
  getConnectionCount(): number {
    return this.connections.size;
  }
  
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }
  
  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================
  
  private handleConnection(ws: WebSocket, req: any): void {
    const connId = this.generateId();
    const ip = req.socket.remoteAddress || 'unknown';
    
    const conn: ConnectionState = {
      id: connId,
      ws,
      ip,
      connectedAt: Date.now() as Timestamp,
      subscriptions: new Map(),
      isAlive: true,
    };
    
    this.connections.set(connId, conn);
    
    // Setup ping/pong for keepalive
    ws.on('pong', () => {
      conn.isAlive = true;
    });
    
    // Handle messages
    ws.on('message', async (data: Buffer) => {
      try {
        const message: ClientMessage = JSON.parse(data.toString());
        await this.handleMessage(conn, message);
      } catch (error: any) {
        this.sendError(conn, 'Invalid message format', error.message);
      }
    });
    
    // Handle close
    ws.on('close', () => {
      this.handleDisconnection(connId);
    });
    
    // Handle errors
    ws.on('error', (error) => {
      console.error(`WebSocket error (${connId}):`, error);
      this.handleDisconnection(connId);
    });
    
    console.log(`🔌 WebSocket connected: ${connId} from ${ip}`);
  }
  
  private async handleMessage(conn: ConnectionState, message: ClientMessage): Promise<void> {
    switch (message.action) {
      case 'subscribe':
        await this.handleSubscribe(conn, message.subscription);
        break;
        
      case 'unsubscribe':
        this.handleUnsubscribe(conn, message.subscriptionId);
        break;
        
      case 'intend':
        await this.handleIntent(conn, message.intent, message.requestId);
        break;
        
      case 'chat':
        await this.handleChat(conn, message as any);
        break;
        
      case 'ping':
        this.send(conn, { type: 'pong', timestamp: Date.now() });
        break;
        
      default:
        this.sendError(conn, 'Unknown action', `Unknown action: ${(message as any).action}`);
    }
  }
  
  private async handleSubscribe(conn: ConnectionState, request: SubscriptionRequest): Promise<void> {
    const subId = request.id || this.generateId();
    
    // Check subscription limit
    const maxSubs = this.config.maxSubscriptionsPerConnection || 10;
    if (conn.subscriptions.size >= maxSubs) {
      this.sendError(conn, 'Subscription limit reached', `Max ${maxSubs} subscriptions per connection`);
      return;
    }
    
    // Store subscription
    conn.subscriptions.set(subId, request);
    this.subscriptions.set(subId, {
      connectionId: conn.id,
      request,
    });
    
    // Send confirmation
    this.send(conn, {
      type: 'subscribed',
      subscriptionId: subId,
    });
    
    // Replay events if requested
    if (request.replayFrom) {
      await this.replayEvents(conn, subId, request);
    }
    
    console.log(`📡 Subscription created: ${subId} (${conn.id})`);
  }
  
  private handleUnsubscribe(conn: ConnectionState, subscriptionId: string): void {
    if (conn.subscriptions.has(subscriptionId)) {
      conn.subscriptions.delete(subscriptionId);
      this.subscriptions.delete(subscriptionId);
      
      this.send(conn, {
        type: 'unsubscribed',
        subscriptionId,
      });
      
      console.log(`📡 Subscription removed: ${subscriptionId} (${conn.id})`);
    }
  }
  
  private async handleIntent(conn: ConnectionState, intent: Intent, requestId?: string): Promise<void> {
    try {
      const result = await this.handlers.handleIntent(intent);
      
      this.send(conn, {
        type: 'intentResult',
        requestId,
        result,
      });
    } catch (error: any) {
      this.sendError(conn, 'Intent execution failed', error.message, requestId);
    }
  }
  
  private async handleChat(conn: ConnectionState, message: any): Promise<void> {
    if (!this.handlers.handleChat) {
      this.sendError(conn, 'Chat not supported', 'Chat handler not configured', message.requestId);
      return;
    }
    
    try {
      const result = await this.handlers.handleChat({
        sessionId: message.sessionId,
        message: message.message,
        startSession: message.startSession,
      });
      
      this.send(conn, {
        type: 'chatResponse',
        requestId: message.requestId,
        response: result.response,
        sessionId: result.sessionId,
      });
    } catch (error: any) {
      this.sendError(conn, 'Chat failed', error.message, message.requestId);
    }
  }
  
  private async replayEvents(conn: ConnectionState, subId: string, request: SubscriptionRequest): Promise<void> {
    if (!request.replayFrom) return;
    
    let fromSequence: bigint;
    if (request.replayFrom === 'beginning') {
      fromSequence = BigInt(0);
    } else if (typeof request.replayFrom === 'number') {
      // Last N events
      const current = this.handlers.getCurrentSequence();
      fromSequence = current - BigInt(request.replayFrom);
    } else {
      // Timestamp - would need to query by timestamp
      fromSequence = BigInt(0);
    }
    
    let count = 0;
    for await (const event of this.handlers.getEventsFrom(fromSequence)) {
      if (this.matchesSubscription({ type: 'event', event }, request)) {
        this.send(conn, {
          type: 'event',
          subscriptionId: subId,
          event: {
            id: event.id,
            sequence: event.sequence,
            timestamp: event.timestamp,
            eventType: event.type,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            payload: request.includePayload ? event.payload : undefined,
          },
        });
        count++;
      }
    }
    
    if (count > 0) {
      console.log(`📡 Replayed ${count} events for subscription ${subId}`);
    }
  }
  
  private matchesSubscription(message: SubscriptionMessage | { type: 'event'; event: any }, request: SubscriptionRequest): boolean {
    const filters = request.filters;
    
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
      
      // Check realm filter
      if (filters.realm) {
        // Would need to check event realm - simplified for now
      }
    }
    
    return true;
  }
  
  private handleDisconnection(connId: string): void {
    const conn = this.connections.get(connId);
    if (!conn) return;
    
    // Remove all subscriptions
    for (const subId of conn.subscriptions.keys()) {
      this.subscriptions.delete(subId);
    }
    
    this.connections.delete(connId);
    console.log(`🔌 WebSocket disconnected: ${connId}`);
  }
  
  private send(conn: ConnectionState, message: ServerMessage): void {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(message));
    }
  }
  
  private sendError(conn: ConnectionState, error: string, details?: string, requestId?: string): void {
    this.send(conn, {
      type: 'error',
      code: error,
      message: details || error,
      subscriptionId: requestId,
    } as any);
  }
  
  private sendHeartbeat(): void {
    const heartbeat: ServerMessage = {
      type: 'heartbeat',
      timestamp: Date.now(),
      serverSequence: this.handlers.getCurrentSequence(),
    };
    
    // Ping all connections and remove dead ones
    for (const [connId, conn] of this.connections) {
      if (!conn.isAlive) {
        conn.ws.terminate();
        this.handleDisconnection(connId);
        continue;
      }
      
      conn.isAlive = false;
      conn.ws.ping();
      this.send(conn, heartbeat);
    }
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

