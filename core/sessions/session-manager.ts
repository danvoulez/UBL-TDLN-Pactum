/**
 * SESSION MANAGER
 * 
 * SPRINT D.3: Session materialization as agreements
 * 
 * Purpose:
 * - Create and manage sessions as first-class agreements
 * - Persist session data to the event store
 * - Enable "Right to Forget" via agreement termination
 * - Provide audit trail for AI interactions
 */

import type { EntityId, Timestamp } from '../shared/types';
import type { EventStore, EventInput } from '../store/event-store';

// =============================================================================
// TYPES
// =============================================================================

export interface SessionConfig {
  /** Default retention policy */
  readonly defaultRetentionDays: number;
  
  /** Maximum session duration (ms) */
  readonly maxDurationMs: number;
  
  /** Auto-terminate inactive sessions after (ms) */
  readonly inactivityTimeoutMs: number;
  
  /** Maximum messages per session */
  readonly maxMessages: number;
}

export interface Session {
  readonly id: EntityId;
  readonly agreementId: EntityId;
  readonly userId: EntityId;
  readonly agentId: EntityId;
  readonly guardianId?: EntityId;
  readonly status: SessionStatus;
  readonly startedAt: Timestamp;
  readonly lastActivityAt: Timestamp;
  readonly endedAt?: Timestamp;
  readonly messageCount: number;
  readonly retentionPolicy: RetentionPolicy;
  readonly metadata: SessionMetadata;
}

export type SessionStatus = 
  | 'active'
  | 'paused'
  | 'terminated'
  | 'expired'
  | 'forgotten';

export interface RetentionPolicy {
  readonly type: 'indefinite' | 'fixed' | 'user-controlled';
  readonly retainUntil?: Timestamp;
  readonly deleteOnTermination?: boolean;
  readonly anonymizeAfterDays?: number;
}

export interface SessionMetadata {
  readonly userAgent?: string;
  readonly ipHash?: string; // Hashed for privacy
  readonly locale?: string;
  readonly timezone?: string;
  readonly purpose?: string;
  readonly tags?: readonly string[];
}

export interface SessionMessage {
  readonly id: string;
  readonly sessionId: EntityId;
  readonly role: 'user' | 'agent' | 'system';
  readonly content: string;
  readonly timestamp: Timestamp;
  readonly tokenCount?: number;
  readonly toolCalls?: readonly ToolCall[];
  readonly metadata?: Record<string, unknown>;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
  readonly result?: unknown;
  readonly durationMs?: number;
}

export interface SessionEvent {
  readonly type: SessionEventType;
  readonly sessionId: EntityId;
  readonly timestamp: Timestamp;
  readonly data: Record<string, unknown>;
}

export type SessionEventType =
  | 'SessionStarted'
  | 'SessionPaused'
  | 'SessionResumed'
  | 'SessionTerminated'
  | 'SessionExpired'
  | 'SessionForgotten'
  | 'MessageSent'
  | 'ToolExecuted'
  | 'ErrorOccurred';

// =============================================================================
// SESSION MANAGER
// =============================================================================

export class SessionManager {
  private sessions = new Map<EntityId, Session>();
  private messages = new Map<EntityId, SessionMessage[]>();
  
  constructor(
    private readonly config: SessionConfig,
    private readonly eventStore?: EventStore
  ) {}
  
  /**
   * Create a new session
   */
  async createSession(params: {
    userId: EntityId;
    agentId: EntityId;
    guardianId?: EntityId;
    retentionPolicy?: Partial<RetentionPolicy>;
    metadata?: Partial<SessionMetadata>;
  }): Promise<Session> {
    const now = Date.now();
    const sessionId = this.generateSessionId();
    const agreementId = this.generateAgreementId();
    
    const retentionPolicy: RetentionPolicy = {
      type: params.retentionPolicy?.type ?? 'fixed',
      retainUntil: params.retentionPolicy?.retainUntil ?? 
        now + this.config.defaultRetentionDays * 24 * 60 * 60 * 1000,
      deleteOnTermination: params.retentionPolicy?.deleteOnTermination ?? false,
      anonymizeAfterDays: params.retentionPolicy?.anonymizeAfterDays,
    };
    
    const session: Session = {
      id: sessionId,
      agreementId,
      userId: params.userId,
      agentId: params.agentId,
      guardianId: params.guardianId,
      status: 'active',
      startedAt: now,
      lastActivityAt: now,
      messageCount: 0,
      retentionPolicy,
      metadata: params.metadata ?? {},
    };
    
    this.sessions.set(sessionId, session);
    this.messages.set(sessionId, []);
    
    // Persist to event store
    await this.persistEvent({
      type: 'SessionStarted',
      sessionId,
      timestamp: now,
      data: {
        agreementId,
        userId: params.userId,
        agentId: params.agentId,
        guardianId: params.guardianId,
        retentionPolicy,
        metadata: params.metadata,
      },
    });
    
    return session;
  }
  
  /**
   * Add a message to a session
   */
  async addMessage(
    sessionId: EntityId,
    message: Omit<SessionMessage, 'id' | 'sessionId' | 'timestamp'>
  ): Promise<SessionMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    if (session.status !== 'active') {
      throw new Error(`Session is not active: ${session.status}`);
    }
    
    if (session.messageCount >= this.config.maxMessages) {
      throw new Error(`Session message limit reached: ${this.config.maxMessages}`);
    }
    
    const now = Date.now();
    const fullMessage: SessionMessage = {
      id: this.generateMessageId(),
      sessionId,
      timestamp: now,
      ...message,
    };
    
    // Update session
    const updatedSession: Session = {
      ...session,
      lastActivityAt: now,
      messageCount: session.messageCount + 1,
    };
    this.sessions.set(sessionId, updatedSession);
    
    // Store message
    const sessionMessages = this.messages.get(sessionId) ?? [];
    sessionMessages.push(fullMessage);
    this.messages.set(sessionId, sessionMessages);
    
    // Persist to event store
    await this.persistEvent({
      type: 'MessageSent',
      sessionId,
      timestamp: now,
      data: {
        messageId: fullMessage.id,
        role: fullMessage.role,
        contentHash: this.hashContent(fullMessage.content),
        tokenCount: fullMessage.tokenCount,
        hasToolCalls: (fullMessage.toolCalls?.length ?? 0) > 0,
      },
    });
    
    return fullMessage;
  }
  
  /**
   * Terminate a session
   */
  async terminateSession(sessionId: EntityId, reason?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    const now = Date.now();
    const updatedSession: Session = {
      ...session,
      status: 'terminated',
      endedAt: now,
    };
    this.sessions.set(sessionId, updatedSession);
    
    await this.persistEvent({
      type: 'SessionTerminated',
      sessionId,
      timestamp: now,
      data: { reason },
    });
    
    // Apply retention policy if delete on termination
    if (session.retentionPolicy.deleteOnTermination) {
      await this.forgetSession(sessionId);
    }
  }
  
  /**
   * Forget a session (Right to Forget)
   */
  async forgetSession(sessionId: EntityId): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    const now = Date.now();
    
    // Update status
    const updatedSession: Session = {
      ...session,
      status: 'forgotten',
      endedAt: session.endedAt ?? now,
    };
    this.sessions.set(sessionId, updatedSession);
    
    // Clear messages
    this.messages.delete(sessionId);
    
    await this.persistEvent({
      type: 'SessionForgotten',
      sessionId,
      timestamp: now,
      data: {
        messageCount: session.messageCount,
        duration: (session.endedAt ?? now) - session.startedAt,
      },
    });
  }
  
  /**
   * Get a session by ID
   */
  getSession(sessionId: EntityId): Session | undefined {
    return this.sessions.get(sessionId);
  }
  
  /**
   * Get messages for a session
   */
  getMessages(sessionId: EntityId): readonly SessionMessage[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    if (session.status === 'forgotten') {
      return []; // Data has been deleted
    }
    
    return this.messages.get(sessionId) ?? [];
  }
  
  /**
   * Get active sessions for a user
   */
  getActiveSessionsForUser(userId: EntityId): readonly Session[] {
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId && s.status === 'active');
  }
  
  /**
   * Check for expired sessions and terminate them
   */
  async cleanupExpiredSessions(): Promise<number> {
    const now = Date.now();
    let count = 0;
    
    for (const session of this.sessions.values()) {
      if (session.status !== 'active') continue;
      
      // Check max duration
      if (now - session.startedAt > this.config.maxDurationMs) {
        await this.expireSession(session.id, 'max_duration_exceeded');
        count++;
        continue;
      }
      
      // Check inactivity
      if (now - session.lastActivityAt > this.config.inactivityTimeoutMs) {
        await this.expireSession(session.id, 'inactivity_timeout');
        count++;
      }
    }
    
    return count;
  }
  
  /**
   * Expire a session
   */
  private async expireSession(sessionId: EntityId, reason: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const now = Date.now();
    const updatedSession: Session = {
      ...session,
      status: 'expired',
      endedAt: now,
    };
    this.sessions.set(sessionId, updatedSession);
    
    await this.persistEvent({
      type: 'SessionExpired',
      sessionId,
      timestamp: now,
      data: { reason },
    });
  }
  
  /**
   * Persist event to event store
   */
  private async persistEvent(event: SessionEvent): Promise<void> {
    if (!this.eventStore) return;
    
    const eventInput: EventInput = {
      type: event.type,
      aggregateType: 'Session' as any, // Session is a valid aggregate type
      aggregateId: event.sessionId,
      aggregateVersion: 1, // Sessions are append-only, version not critical
      timestamp: event.timestamp,
      actor: { type: 'System', systemId: 'session-manager' },
      payload: event.data,
    };
    
    await this.eventStore.append(eventInput);
  }
  
  /**
   * Generate session ID
   */
  private generateSessionId(): EntityId {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}` as EntityId;
  }
  
  /**
   * Generate agreement ID
   */
  private generateAgreementId(): EntityId {
    return `agreement-${Date.now()}-${Math.random().toString(36).slice(2, 11)}` as EntityId;
  }
  
  /**
   * Generate message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
  
  /**
   * Hash content for privacy
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
  
  /**
   * Get statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    forgottenSessions: number;
    totalMessages: number;
  } {
    let activeSessions = 0;
    let forgottenSessions = 0;
    let totalMessages = 0;
    
    for (const session of this.sessions.values()) {
      if (session.status === 'active') activeSessions++;
      if (session.status === 'forgotten') forgottenSessions++;
      totalMessages += session.messageCount;
    }
    
    return {
      totalSessions: this.sessions.size,
      activeSessions,
      forgottenSessions,
      totalMessages,
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createSessionManager(
  config?: Partial<SessionConfig>,
  eventStore?: EventStore
): SessionManager {
  const defaultConfig: SessionConfig = {
    defaultRetentionDays: 30,
    maxDurationMs: 24 * 60 * 60 * 1000, // 24 hours
    inactivityTimeoutMs: 60 * 60 * 1000, // 1 hour
    maxMessages: 1000,
  };
  
  return new SessionManager({ ...defaultConfig, ...config }, eventStore);
}
