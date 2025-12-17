/**
 * AGENT API - The Universal Endpoint
 * 
 * This is what the frontend consumes.
 * 
 * Main endpoint:
 *   POST /chat - Send a message, get a response
 * 
 * Helper endpoints:
 *   POST /session/start - Start a conversation
 *   GET  /session/:id - Get session state
 *   POST /session/:id/end - End a conversation
 *   GET  /suggestions - Get autocomplete suggestions
 *   WS   /subscribe - Real-time updates
 * 
 * That's it. One main endpoint. Everything flows through the conversation.
 */

import type { EntityId, ActorReference } from '../../core/shared/types';
import type { 
  UserMessage, 
  AgentResponse, 
  ConversationSession,
  ConversationalAgent,
} from './conversation';

// ============================================================================
// HTTP API TYPES
// ============================================================================

/**
 * POST /chat
 * The ONE endpoint the frontend needs for all interactions.
 */
export interface ChatRequest {
  /** Session ID (required after first message) */
  sessionId?: EntityId;
  
  /** The message */
  message: UserMessage;
  
  /** For first message: start a new session */
  startSession?: {
    realmId: EntityId;
    actor: ActorReference;
  };
}

export interface ChatResponse {
  /** The agent's response */
  response: AgentResponse;
  
  /** Session ID (for subsequent requests) */
  sessionId: EntityId;
}

/**
 * POST /session/start
 * Start a new conversation session.
 */
export interface StartSessionRequest {
  realmId: EntityId;
  actor: ActorReference;
}

export interface StartSessionResponse {
  session: ConversationSession;
  /** Welcome message */
  welcome: AgentResponse;
}

/**
 * GET /session/:id
 * Get session state (for reconnection).
 */
export interface GetSessionResponse {
  session: ConversationSession;
}

/**
 * GET /suggestions
 * Get autocomplete suggestions.
 */
export interface SuggestionsRequest {
  sessionId: EntityId;
  partialInput?: string;
}

export interface SuggestionsResponse {
  suggestions: readonly string[];
}

// ============================================================================
// API ROUTER
// ============================================================================

/**
 * Creates the API router for the agent.
 * This can be mounted on Express, Fastify, Hono, etc.
 */
export interface AgentAPIRouter {
  /**
   * Handle POST /chat
   */
  chat(request: ChatRequest): Promise<ChatResponse>;
  
  /**
   * Handle POST /session/start
   */
  startSession(request: StartSessionRequest): Promise<StartSessionResponse>;
  
  /**
   * Handle GET /session/:id
   */
  getSession(sessionId: EntityId): Promise<GetSessionResponse | null>;
  
  /**
   * Handle POST /session/:id/end
   */
  endSession(sessionId: EntityId): Promise<void>;
  
  /**
   * Handle GET /suggestions
   */
  getSuggestions(request: SuggestionsRequest): Promise<SuggestionsResponse>;
}

export function createAgentAPIRouter(agent: ConversationalAgent): AgentAPIRouter {
  return {
    async chat(request: ChatRequest): Promise<ChatResponse> {
      let sessionId = request.sessionId;
      
      // Start session if needed
      if (!sessionId && request.startSession) {
        const session = await agent.startSession(
          request.startSession.realmId,
          request.startSession.actor
        );
        sessionId = session.id;
      }
      
      if (!sessionId) {
        throw new Error('Session ID required. Start a session first or provide startSession.');
      }
      
      const response = await agent.chat(sessionId, request.message);
      
      return { response, sessionId };
    },
    
    async startSession(request: StartSessionRequest): Promise<StartSessionResponse> {
      const session = await agent.startSession(request.realmId, request.actor);
      
      // Generate welcome message
      const welcome = await agent.chat(session.id, {
        text: '__welcome__', // Special marker for welcome
      });
      
      return { session, welcome };
    },
    
    async getSession(sessionId: EntityId): Promise<GetSessionResponse | null> {
      const session = await agent.getSession(sessionId);
      if (!session) return null;
      return { session };
    },
    
    async endSession(sessionId: EntityId): Promise<void> {
      await agent.endSession(sessionId);
    },
    
    async getSuggestions(request: SuggestionsRequest): Promise<SuggestionsResponse> {
      const suggestions = await agent.getSuggestions(
        request.sessionId,
        request.partialInput
      );
      return { suggestions };
    },
  };
}

// ============================================================================
// OPENAPI SPEC (for documentation)
// ============================================================================

export const OPENAPI_SPEC = {
  openapi: '3.0.0',
  info: {
    title: 'Universal Ledger Antenna API',
    version: '1.0.0',
    description: `
# The Flagship Interface

This API provides a conversational interface to the Universal Ledger.

## Philosophy

- **One main endpoint** - POST /chat handles everything
- **Markdown responses** - All data comes back as beautiful markdown
- **Affordances** - The API tells you what you can do next
- **Natural language** - Just type what you want

## Quick Start

\`\`\`bash
# Start a session
curl -X POST /session/start \\
  -d '{"realmId": "realm-123", "actor": {"type": "Entity", "entityId": "user-456"}}'

# Chat
curl -X POST /chat \\
  -d '{"sessionId": "sess-789", "message": {"text": "show me all active agreements"}}'
\`\`\`
    `,
  },
  paths: {
    '/chat': {
      post: {
        summary: 'Send a message to the agent',
        description: 'The ONE endpoint you need. Send natural language, get markdown back.',
      },
    },
    '/session/start': {
      post: {
        summary: 'Start a new conversation session',
      },
    },
    '/session/{sessionId}': {
      get: {
        summary: 'Get session state',
      },
    },
    '/suggestions': {
      get: {
        summary: 'Get autocomplete suggestions',
      },
    },
  },
};

// ============================================================================
// FRONTEND INTEGRATION EXAMPLES
// ============================================================================

export const FRONTEND_EXAMPLES = {
  reactHook: `
// useChat.ts - The only hook you need
import { useState, useCallback } from 'react';

export function useChat(realmId: string, actorId: string) {
  const [state, setState] = useState({
    sessionId: null,
    messages: [],
    loading: false,
  });

  const send = useCallback(async (text: string, affordanceClick?: any) => {
    setState(s => ({ ...s, loading: true }));

    const response = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.sessionId,
        message: { text, affordanceClick },
        ...(!state.sessionId && {
          startSession: { realmId, actor: { type: 'Entity', entityId: actorId } },
        }),
      }),
    });

    const data = await response.json();

    setState(s => ({
      sessionId: data.sessionId,
      messages: [...s.messages, { user: text, agent: data.response }],
      loading: false,
    }));

    return data.response;
  }, [state.sessionId, realmId, actorId]);

  return { ...state, send };
}
  `,
};

