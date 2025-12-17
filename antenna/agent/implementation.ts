/**
 * CONVERSATIONAL AGENT IMPLEMENTATION
 * 
 * AGENTE DO DIAMANTE - UX DE OPERADOR
 * 
 * Este módulo define como o agente conversa com o operador:
 * - tom da mensagem
 * - mensagens de erro operacionais
 * - sugestões de próximas ações
 * - integração com affordances
 * 
 * Núcleo do agente conversacional. Orquestra sessões, turns, affordances e resposta ao usuário.
 * 
 * The actual implementation of the ConversationalAgent interface.
 * This is where the magic happens:
 * 
 * 1. User sends natural language
 * 2. LLM interprets intent
 * 3. Agent executes via Ledger's Intent API
 * 4. Response formatted as Markdown
 * 
 * This implementation uses:
 * - LLM Adapter (Anthropic, OpenAI, etc.) for understanding
 * - Intent API for execution
 * - Memory system for context
 * 
 * Fase 6: Enhanced with operator-friendly messages, runbooks, and operational guidance.
 */

import type { EntityId, ActorReference, Timestamp } from '../../core/shared/types';
import type { LLMAdapter } from '../../sdk/types';
import type { IntentHandler } from '../../core/api/intent-api';
import type {
  ConversationalAgent,
  ConversationSession,
  UserMessage,
  AgentResponse,
  MarkdownContent,
  UIAffordance,
  EntityReference,
  SessionContext,
  FocusChange,
} from './conversation';
import {
  ensureNonEmptyMarkdown,
  ensureAffordancesArray,
  buildSuggestionsFromAffordances,
} from '../../core/agent/primitives';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface AgentConfig {
  /** Default realm for new sessions */
  defaultRealmId?: EntityId;
  
  /** System prompt for the LLM */
  systemPrompt?: string;
  
  /** Max conversation history to send to LLM */
  maxHistoryTurns?: number;
  
  /** Session timeout in ms */
  sessionTimeoutMs?: number;
}

export interface AgentDependencies {
  /** LLM adapter for natural language understanding */
  llm: LLMAdapter;
  
  /** Intent handler for executing intents */
  intents: IntentHandler;
  
  /** Optional: Memory/context loader */
  loadMemory?: (realmId: EntityId, actor: ActorReference) => Promise<string>;
}

// ============================================================================
// DEFAULT SYSTEM PROMPT
// ============================================================================

const DEFAULT_SYSTEM_PROMPT = `You are an intelligent assistant for the Universal Business Ledger system.

## Core Concepts

The Universal Business Ledger is built on these fundamental principles:

1. **Events** - Immutable facts that have happened. Everything is recorded as events.
2. **Entities** - People, organizations, or systems that can act in the ledger.
3. **Agreements** - The universal primitive for ALL relationships. Employment, sales, licenses, partnerships - everything is an agreement.
4. **Assets** - Things that can be owned, transferred, or valued.
5. **Roles** - Permissions and relationships established BY agreements, not static attributes.

**Key Principle:** "All relationships are agreements."

## Your Role

You help users interact with the ledger by:
1. Understanding their intent in natural language
2. Translating to the appropriate ledger operation (Intent)
3. Explaining what will happen clearly
4. Formatting responses in Markdown for readability

## Available Intents

- **register:entity** - Create a new entity (person, organization, system)
- **propose:agreement** - Create a new agreement (employment, sale, service, etc.)
- **consent** - Give consent to an agreement
- **fulfill** - Mark an obligation as fulfilled
- **terminate** - End an agreement
- **query** - Search and retrieve data (entities, agreements, events)
- **transfer:asset** - Transfer ownership of an asset
- **register:asset** - Create a new asset

## Response Format

- Use Markdown for formatting
- Be clear and helpful
- Explain the Agreement model when relevant
- Show available actions (affordances) when appropriate
- Always be accurate about what the ledger can do

## Examples

User: "I want to hire John as a developer"
→ You explain: "I'll create an Employment Agreement between you and John. This will establish the employment relationship, define roles, and set obligations."

User: "Show me all active agreements"
→ You execute: query intent to find agreements with status='Active'

Remember: The ledger models business relationships through agreements, not static data.`;

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createConversationalAgent(
  deps: AgentDependencies,
  config: AgentConfig = {}
): ConversationalAgent {
  const {
    defaultRealmId = 'default-realm' as EntityId,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    maxHistoryTurns = 10,
    sessionTimeoutMs = 30 * 60 * 1000, // 30 minutes
  } = config;
  
  // In-memory session storage (use Redis/DB in production)
  const sessions = new Map<string, ConversationSession>();
  
  // Helper: Generate ID
  function generateId(prefix: string): EntityId {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` as EntityId;
  }
  
  // Helper: Build LLM messages from history
  function buildMessages(session: ConversationSession, newMessage: UserMessage) {
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];
    
    // Add recent history
    const recentHistory = session.history.slice(-maxHistoryTurns);
    for (const turn of recentHistory) {
      messages.push({ role: 'user', content: turn.user.text });
      messages.push({ role: 'assistant', content: turn.agent.content.markdown });
    }
    
    // Add new message
    if (newMessage.affordanceClick) {
      messages.push({
        role: 'user',
        content: `[User clicked: ${newMessage.affordanceClick.intent}] ${JSON.stringify(newMessage.affordanceClick.prefilled || {})}`,
      });
    } else {
      messages.push({ role: 'user', content: newMessage.text });
    }
    
    return messages;
  }
  
  // Helper: Extract affordances from intent result
  function extractAffordances(intentResult: any): UIAffordance[] {
    if (!intentResult?.affordances) return [];
    
    return intentResult.affordances.map((a: any) => ({
      intent: a.intent,
      label: a.description?.split(' ').slice(0, 3).join(' ') || a.intent,
      description: a.description,
      style: a.intent === 'terminate' ? 'danger' as const : 'secondary' as const,
      prefilled: a.prefilled,
    }));
  }
  
  return {
    async chat(sessionId: EntityId, message: UserMessage): Promise<AgentResponse> {
      const startTime = Date.now();
      const session = sessions.get(sessionId);
      
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      
      // Handle special welcome message
      if (message.text === '__welcome__') {
        const welcomeAffordances: UIAffordance[] = [
          { intent: 'register', label: 'New Entity', style: 'primary', icon: 'user-plus' },
          { intent: 'propose', label: 'New Agreement', style: 'secondary', icon: 'file-plus' },
          { intent: 'query', label: 'Search', style: 'ghost', icon: 'search' },
        ];
        
        const welcomeResponse: AgentResponse = {
          id: generateId('resp'),
          content: {
            type: 'message',
            markdown: `# Welcome! 👋

I'm your assistant for the Universal Business Ledger.

I can help you:
- **Create agreements** between entities
- **Query** your data
- **Track** obligations and fulfillments
- **Manage** roles and permissions

What would you like to do?`,
          },
          affordances: ensureAffordancesArray(welcomeAffordances),
          suggestions: buildSuggestionsFromAffordances(welcomeAffordances, 3),
          meta: {
            timestamp: Date.now() as Timestamp,
            processingMs: Math.max(0, Date.now() - startTime),
            turn: 1, // ⚠️ turn >= 1 (welcome is turn 1)
            kind: 'informational', // Fase 6: Welcome is informational
          },
        };
        
        return welcomeResponse;
      }
      
      // Build messages for LLM
      const messages = buildMessages(session, message);
      
      // Call LLM with system prompt
      const llmResponse = await deps.llm.complete({
        messages,
        systemPrompt: systemPrompt, // Pass system prompt explicitly
        maxTokens: 2000,
        temperature: 0.7,
      });
      
      // Parse LLM response for potential intent execution
      // (In a more sophisticated implementation, use function calling)
      let affordances: UIAffordance[] = [
        { intent: 'query', label: 'Search', style: 'ghost', icon: 'search' },
      ];
      
      // Try to get contextual affordances
      try {
        const available = await deps.intents.getAvailableIntents(
          session.realmId,
          session.actor,
          session.focus?.entity ? { targetType: session.focus.entity.type, targetId: session.focus.entity.id } : undefined
        );
        affordances = available.slice(0, 4).map(a => ({
          intent: a.intent,
          label: a.description.split(' ').slice(0, 3).join(' '),
          description: a.description,
          style: 'secondary' as const,
        }));
      } catch (e) {
        // Use defaults
      }
      
      // ⚠️ CONTRACT: Ensure invariants
      const safeMarkdown = ensureNonEmptyMarkdown(llmResponse.content);
      const safeAffordances = ensureAffordancesArray(affordances);
      const suggestions = buildSuggestionsFromAffordances(safeAffordances, 3);
      const currentTurn = Math.max(1, session.history.length + 1); // ⚠️ turn >= 1
      const processingMs = Math.max(0, Date.now() - startTime); // ⚠️ processingMs >= 0
      
      // Fase 6: Determine message kind (default to informational for normal responses)
      const messageKind: AgentMessageKind = 'informational';
      
      // Fase 6: Add affordance explanation if available
      let finalMarkdown = safeMarkdown;
      if (safeAffordances.length > 0 && safeMarkdown.length < 500) {
        // Only add if message is short (to avoid clutter)
        const { buildAffordanceExplanation } = await import('../../core/agent/messages/operatorMessages');
        const affordanceText = buildAffordanceExplanation(safeAffordances);
        finalMarkdown = `${safeMarkdown}\n\n${affordanceText}`;
      }
      
      const response: AgentResponse = {
        id: generateId('resp'),
        content: {
          type: 'message',
          markdown: finalMarkdown,
        },
        affordances: safeAffordances,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        meta: {
          timestamp: Date.now() as Timestamp,
          processingMs,
          turn: currentTurn,
          kind: messageKind, // Fase 6: Set message kind
          interpretation: {
            intent: 'chat',
            confidence: 0.8,
          },
        },
      };
      
      // Update session history
      const updatedSession: ConversationSession = {
        ...session,
        lastActivityAt: Date.now() as Timestamp,
        history: [
          ...session.history,
          { user: message, agent: response, timestamp: Date.now() as Timestamp },
        ],
      };
      sessions.set(sessionId, updatedSession);
      
      return response;
    },
    
    async startSession(realmId: EntityId, actor: ActorReference): Promise<ConversationSession> {
      const sessionId = generateId('sess');
      const now = Date.now() as Timestamp;
      
      // Load memory context if available
      let memoryContext = '';
      if (deps.loadMemory) {
        try {
          memoryContext = await deps.loadMemory(realmId, actor);
        } catch (e) {
          // No memory available
        }
      }
      
      const session: ConversationSession = {
        id: sessionId,
        realmId,
        actor,
        startedAt: now,
        lastActivityAt: now,
        history: [],
        context: {
          recentEntities: [],
          recentQueries: [],
          preferences: {},
        },
      };
      
      sessions.set(sessionId, session);
      
      return session;
    },
    
    async getSession(sessionId: EntityId): Promise<ConversationSession | null> {
      return sessions.get(sessionId) ?? null;
    },
    
    async endSession(sessionId: EntityId): Promise<void> {
      sessions.delete(sessionId);
    },
    
    async getSuggestions(sessionId: EntityId, partialInput?: string): Promise<readonly string[]> {
      const session = sessions.get(sessionId);
      if (!session) return [];
      
      // Basic suggestions based on context
      const suggestions = [
        'Show me all agreements',
        'Create a new entity',
        'What can I do?',
      ];
      
      if (partialInput) {
        return suggestions.filter(s => 
          s.toLowerCase().includes(partialInput.toLowerCase())
        );
      }
      
      return suggestions;
    },
  };
}

