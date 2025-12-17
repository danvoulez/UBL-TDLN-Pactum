/**
 * AGENT MODULE - The Flagship Conversational Interface
 * 
 * This module provides the AI-powered conversational interface to the Universal Ledger.
 * 
 * For frontend developers:
 * - You only need POST /chat
 * - Everything comes back as Markdown
 * - Affordances tell you what buttons to show
 * 
 * For backend developers:
 * - Use createConversationalAgent() with your LLM adapter
 * - The agent interprets natural language → Ledger intents
 * - Responses are formatted as beautiful Markdown
 */

// Conversation types
export type {
  UserMessage,
  MessageContext,
  AgentResponse,
  MarkdownContent,
  ContentType,
  ContentData,
  EntityReference,
  FormField,
  UIAffordance,
  FocusChange,
  BreadcrumbItem,
  SubscriptionInfo,
  ResponseMeta,
  AgentInterpretation,
  ConversationSession,
  ConversationTurn,
  SessionContext,
  ConversationalAgent,
  MarkdownFormatter,
} from './conversation';

export {
  EXAMPLE_RESPONSES,
} from './conversation';

// API types
export type {
  ChatRequest,
  ChatResponse,
  StartSessionRequest,
  StartSessionResponse,
  GetSessionResponse,
  SuggestionsRequest,
  SuggestionsResponse,
  AgentAPIRouter,
} from './api';

export {
  createAgentAPIRouter,
  OPENAPI_SPEC,
  FRONTEND_EXAMPLES,
} from './api';

// Agent implementation
export { createConversationalAgent } from './implementation';
export type { AgentConfig, AgentDependencies } from './implementation';

// Memory (conversation context)
export type {
  Memory,
  MemoryType,
  MemoryImportance,
  MemoryContext,
  ConversationMessage,
  UserContext,
  MemoryStore,
  MemorySearchOptions,
  ConsolidationResult,
  MemoryManager,
} from './memory';

export {
  createInMemoryStore,
  createMemoryManager,
} from './memory';

