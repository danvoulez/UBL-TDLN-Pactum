/**
 * SESSION MANAGER TESTS
 * 
 * SPRINT D.3: Tests for session materialization
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  SessionManager,
  createSessionManager,
  type Session,
} from '../../../core/sessions/session-manager';
import type { EntityId } from '../../../core/schema/ledger';

describe('Session Manager (SPRINT D.3)', () => {
  
  let manager: SessionManager;
  
  beforeEach(() => {
    manager = createSessionManager({
      defaultRetentionDays: 30,
      maxDurationMs: 60000, // 1 minute for testing
      inactivityTimeoutMs: 10000, // 10 seconds for testing
      maxMessages: 100,
    });
  });
  
  describe('Session Creation', () => {
    it('creates a new session', async () => {
      const session = await manager.createSession({
        userId: 'user-1' as EntityId,
        agentId: 'agent-1' as EntityId,
      });
      
      assert.ok(session.id);
      assert.ok(session.agreementId);
      assert.strictEqual(session.userId, 'user-1');
      assert.strictEqual(session.agentId, 'agent-1');
      assert.strictEqual(session.status, 'active');
      assert.strictEqual(session.messageCount, 0);
    });
    
    it('creates session with guardian', async () => {
      const session = await manager.createSession({
        userId: 'user-1' as EntityId,
        agentId: 'agent-1' as EntityId,
        guardianId: 'guardian-1' as EntityId,
      });
      
      assert.strictEqual(session.guardianId, 'guardian-1');
    });
    
    it('creates session with custom retention policy', async () => {
      const session = await manager.createSession({
        userId: 'user-1' as EntityId,
        agentId: 'agent-1' as EntityId,
        retentionPolicy: {
          type: 'user-controlled',
          deleteOnTermination: true,
        },
      });
      
      assert.strictEqual(session.retentionPolicy.type, 'user-controlled');
      assert.strictEqual(session.retentionPolicy.deleteOnTermination, true);
    });
    
    it('creates session with metadata', async () => {
      const session = await manager.createSession({
        userId: 'user-1' as EntityId,
        agentId: 'agent-1' as EntityId,
        metadata: {
          userAgent: 'Test/1.0',
          locale: 'en-US',
          purpose: 'testing',
        },
      });
      
      assert.strictEqual(session.metadata.userAgent, 'Test/1.0');
      assert.strictEqual(session.metadata.locale, 'en-US');
    });
  });
  
  describe('Message Handling', () => {
    let session: Session;
    
    beforeEach(async () => {
      session = await manager.createSession({
        userId: 'user-1' as EntityId,
        agentId: 'agent-1' as EntityId,
      });
    });
    
    it('adds messages to session', async () => {
      const message = await manager.addMessage(session.id, {
        role: 'user',
        content: 'Hello, agent!',
      });
      
      assert.ok(message.id);
      assert.strictEqual(message.sessionId, session.id);
      assert.strictEqual(message.role, 'user');
      assert.strictEqual(message.content, 'Hello, agent!');
      
      const updatedSession = manager.getSession(session.id);
      assert.strictEqual(updatedSession?.messageCount, 1);
    });
    
    it('tracks message count', async () => {
      await manager.addMessage(session.id, { role: 'user', content: 'Message 1' });
      await manager.addMessage(session.id, { role: 'agent', content: 'Response 1' });
      await manager.addMessage(session.id, { role: 'user', content: 'Message 2' });
      
      const updatedSession = manager.getSession(session.id);
      assert.strictEqual(updatedSession?.messageCount, 3);
    });
    
    it('retrieves messages', async () => {
      await manager.addMessage(session.id, { role: 'user', content: 'Hello' });
      await manager.addMessage(session.id, { role: 'agent', content: 'Hi there!' });
      
      const messages = manager.getMessages(session.id);
      assert.strictEqual(messages.length, 2);
      assert.strictEqual(messages[0].content, 'Hello');
      assert.strictEqual(messages[1].content, 'Hi there!');
    });
    
    it('rejects messages on terminated session', async () => {
      await manager.terminateSession(session.id);
      
      await assert.rejects(
        () => manager.addMessage(session.id, { role: 'user', content: 'Hello' }),
        /not active/
      );
    });
    
    it('enforces message limit', async () => {
      // Create manager with low limit
      const limitedManager = createSessionManager({ maxMessages: 3 });
      const limitedSession = await limitedManager.createSession({
        userId: 'user-1' as EntityId,
        agentId: 'agent-1' as EntityId,
      });
      
      await limitedManager.addMessage(limitedSession.id, { role: 'user', content: '1' });
      await limitedManager.addMessage(limitedSession.id, { role: 'agent', content: '2' });
      await limitedManager.addMessage(limitedSession.id, { role: 'user', content: '3' });
      
      await assert.rejects(
        () => limitedManager.addMessage(limitedSession.id, { role: 'agent', content: '4' }),
        /limit reached/
      );
    });
  });
  
  describe('Session Termination', () => {
    it('terminates a session', async () => {
      const session = await manager.createSession({
        userId: 'user-1' as EntityId,
        agentId: 'agent-1' as EntityId,
      });
      
      await manager.terminateSession(session.id, 'user requested');
      
      const terminated = manager.getSession(session.id);
      assert.strictEqual(terminated?.status, 'terminated');
      assert.ok(terminated?.endedAt);
    });
    
    it('deletes data on termination if policy requires', async () => {
      const session = await manager.createSession({
        userId: 'user-1' as EntityId,
        agentId: 'agent-1' as EntityId,
        retentionPolicy: { deleteOnTermination: true },
      });
      
      await manager.addMessage(session.id, { role: 'user', content: 'Secret message' });
      await manager.terminateSession(session.id);
      
      const forgotten = manager.getSession(session.id);
      assert.strictEqual(forgotten?.status, 'forgotten');
      
      const messages = manager.getMessages(session.id);
      assert.strictEqual(messages.length, 0);
    });
  });
  
  describe('Right to Forget', () => {
    it('forgets a session', async () => {
      const session = await manager.createSession({
        userId: 'user-1' as EntityId,
        agentId: 'agent-1' as EntityId,
      });
      
      await manager.addMessage(session.id, { role: 'user', content: 'Remember this' });
      await manager.addMessage(session.id, { role: 'agent', content: 'I will remember' });
      
      await manager.forgetSession(session.id);
      
      const forgotten = manager.getSession(session.id);
      assert.strictEqual(forgotten?.status, 'forgotten');
      
      const messages = manager.getMessages(session.id);
      assert.strictEqual(messages.length, 0);
    });
  });
  
  describe('Session Queries', () => {
    it('gets active sessions for user', async () => {
      await manager.createSession({
        userId: 'user-1' as EntityId,
        agentId: 'agent-1' as EntityId,
      });
      
      await manager.createSession({
        userId: 'user-1' as EntityId,
        agentId: 'agent-2' as EntityId,
      });
      
      const session3 = await manager.createSession({
        userId: 'user-2' as EntityId,
        agentId: 'agent-1' as EntityId,
      });
      
      await manager.terminateSession(session3.id);
      
      const user1Sessions = manager.getActiveSessionsForUser('user-1' as EntityId);
      assert.strictEqual(user1Sessions.length, 2);
      
      const user2Sessions = manager.getActiveSessionsForUser('user-2' as EntityId);
      assert.strictEqual(user2Sessions.length, 0);
    });
  });
  
  describe('Session Cleanup', () => {
    it('expires inactive sessions', async () => {
      // Create manager with very short timeout
      const shortTimeoutManager = createSessionManager({
        inactivityTimeoutMs: 1, // 1ms
        maxDurationMs: 60000,
      });
      
      await shortTimeoutManager.createSession({
        userId: 'user-1' as EntityId,
        agentId: 'agent-1' as EntityId,
      });
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const expired = await shortTimeoutManager.cleanupExpiredSessions();
      assert.strictEqual(expired, 1);
    });
  });
  
  describe('Statistics', () => {
    it('provides session statistics', async () => {
      const session1 = await manager.createSession({
        userId: 'user-1' as EntityId,
        agentId: 'agent-1' as EntityId,
      });
      
      await manager.addMessage(session1.id, { role: 'user', content: 'Hello' });
      await manager.addMessage(session1.id, { role: 'agent', content: 'Hi' });
      
      const session2 = await manager.createSession({
        userId: 'user-2' as EntityId,
        agentId: 'agent-1' as EntityId,
      });
      
      await manager.forgetSession(session2.id);
      
      const stats = manager.getStats();
      
      assert.strictEqual(stats.totalSessions, 2);
      assert.strictEqual(stats.activeSessions, 1);
      assert.strictEqual(stats.forgottenSessions, 1);
      assert.strictEqual(stats.totalMessages, 2);
    });
  });
  
  describe('Factory', () => {
    it('createSessionManager uses defaults', () => {
      const defaultManager = createSessionManager();
      assert.ok(defaultManager);
    });
  });
});
