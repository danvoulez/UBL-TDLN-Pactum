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

import type { EntityId, ActorReference } from '../shared/types';
import type { 
  UserMessage, 
  ConversationSession,
  ConversationalAgent,
} from './conversation';
import type { 
  ChatResponse,
  AgentResponse,
} from './primitives';

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

// ChatResponse is now defined in primitives.ts (canonical source)
// Re-exported here for backward compatibility
export type { ChatResponse } from './primitives';

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

/**
 * Ponto de entrada principal da API de chat.
 * Não contém lógica de domínio; apenas traduz HTTP ↔ core ConversationalAgent.
 */
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
      
      // ⚠️ CONTRACT: Either sessionId or startSession MUST be provided
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
    title: 'Universal Ledger Agent API',
    version: '1.0.0',
    description: `
# The Universal Interface

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
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ChatRequest' },
              examples: {
                simpleQuery: {
                  summary: 'Simple query',
                  value: {
                    sessionId: 'sess-123',
                    message: { text: 'show me João\'s agreements' },
                  },
                },
                affordanceClick: {
                  summary: 'Click an affordance button',
                  value: {
                    sessionId: 'sess-123',
                    message: {
                      text: '',
                      affordanceClick: {
                        intent: 'terminate',
                        prefilled: { agreementId: 'agr-456' },
                      },
                    },
                  },
                },
                firstMessage: {
                  summary: 'First message (starts session)',
                  value: {
                    message: { text: 'hello' },
                    startSession: {
                      realmId: 'realm-123',
                      actor: { type: 'Entity', entityId: 'user-456' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Agent response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatResponse' },
              },
            },
          },
        },
      },
    },
    '/session/start': {
      post: {
        summary: 'Start a new conversation session',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StartSessionRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Session started',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StartSessionResponse' },
              },
            },
          },
        },
      },
    },
    '/session/{sessionId}': {
      get: {
        summary: 'Get session state',
        parameters: [
          {
            name: 'sessionId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Session state',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GetSessionResponse' },
              },
            },
          },
          404: { description: 'Session not found' },
        },
      },
    },
    '/suggestions': {
      get: {
        summary: 'Get autocomplete suggestions',
        parameters: [
          {
            name: 'sessionId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'partialInput',
            in: 'query',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Suggestions',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SuggestionsResponse' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ChatRequest: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          message: { $ref: '#/components/schemas/UserMessage' },
          startSession: {
            type: 'object',
            properties: {
              realmId: { type: 'string' },
              actor: { $ref: '#/components/schemas/ActorReference' },
            },
          },
        },
        required: ['message'],
      },
      UserMessage: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          affordanceClick: {
            type: 'object',
            properties: {
              intent: { type: 'string' },
              prefilled: { type: 'object' },
            },
          },
          context: { type: 'object' },
        },
        required: ['text'],
      },
      ActorReference: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['Entity', 'System', 'Workflow', 'Anonymous'] },
          entityId: { type: 'string' },
          systemId: { type: 'string' },
        },
      },
      ChatResponse: {
        type: 'object',
        properties: {
          response: { $ref: '#/components/schemas/AgentResponse' },
          sessionId: { type: 'string' },
        },
      },
      AgentResponse: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          content: { $ref: '#/components/schemas/MarkdownContent' },
          affordances: {
            type: 'array',
            items: { $ref: '#/components/schemas/UIAffordance' },
          },
          suggestions: { type: 'array', items: { type: 'string' } },
          focus: { type: 'object' },
          subscription: { type: 'object' },
          meta: { type: 'object' },
        },
      },
      MarkdownContent: {
        type: 'object',
        properties: {
          markdown: { type: 'string' },
          data: { type: 'object' },
          type: {
            type: 'string',
            enum: ['message', 'entity', 'list', 'table', 'timeline', 'form', 'confirmation', 'error', 'story'],
          },
        },
      },
      UIAffordance: {
        type: 'object',
        properties: {
          intent: { type: 'string' },
          label: { type: 'string' },
          description: { type: 'string' },
          style: { type: 'string', enum: ['primary', 'secondary', 'danger', 'ghost'] },
          icon: { type: 'string' },
          prefilled: { type: 'object' },
          confirm: { type: 'object' },
          shortcut: { type: 'string' },
        },
      },
      StartSessionRequest: {
        type: 'object',
        properties: {
          realmId: { type: 'string' },
          actor: { $ref: '#/components/schemas/ActorReference' },
        },
        required: ['realmId', 'actor'],
      },
      StartSessionResponse: {
        type: 'object',
        properties: {
          session: { type: 'object' },
          welcome: { $ref: '#/components/schemas/AgentResponse' },
        },
      },
      GetSessionResponse: {
        type: 'object',
        properties: {
          session: { type: 'object' },
        },
      },
      SuggestionsResponse: {
        type: 'object',
        properties: {
          suggestions: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

// ============================================================================
// FRONTEND INTEGRATION EXAMPLES
// ============================================================================

/**
 * Example code for frontend integration.
 * This shows how simple the frontend can be.
 */
export const FRONTEND_EXAMPLES = {
  // React hook example
  reactHook: `
// useChat.ts - The only hook you need
import { useState, useCallback } from 'react';

interface ChatState {
  sessionId: string | null;
  messages: Array<{ user: string; agent: AgentResponse }>;
  loading: boolean;
}

export function useChat(realmId: string, actorId: string) {
  const [state, setState] = useState<ChatState>({
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
          startSession: {
            realmId,
            actor: { type: 'Entity', entityId: actorId },
          },
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

  // Simple HTML/JS example
  vanillaJS: `
<!-- The simplest possible chat UI -->
<div id="chat">
  <div id="messages"></div>
  <input id="input" placeholder="Type a message...">
  <button id="send">Send</button>
</div>

<script>
let sessionId = null;

async function send() {
  const input = document.getElementById('input');
  const text = input.value;
  input.value = '';

  const res = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      message: { text },
      ...(!sessionId && {
        startSession: {
          realmId: 'my-realm',
          actor: { type: 'Entity', entityId: 'my-user' },
        },
      }),
    }),
  });

  const data = await res.json();
  sessionId = data.sessionId;

  // Render markdown (use a library like marked.js)
  document.getElementById('messages').innerHTML +=
    '<div class="agent">' + marked.parse(data.response.content.markdown) + '</div>';

  // Render affordance buttons
  data.response.affordances.forEach(a => {
    const btn = document.createElement('button');
    btn.textContent = a.label;
    btn.onclick = () => clickAffordance(a);
    document.getElementById('messages').appendChild(btn);
  });
}

function clickAffordance(affordance) {
  fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      message: {
        text: '',
        affordanceClick: {
          intent: affordance.intent,
          prefilled: affordance.prefilled,
        },
      },
    }),
  }).then(r => r.json()).then(data => {
    // Handle response...
  });
}

document.getElementById('send').onclick = send;
document.getElementById('input').onkeypress = e => e.key === 'Enter' && send();
</script>
  `,
};

