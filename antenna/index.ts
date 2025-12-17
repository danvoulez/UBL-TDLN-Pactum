/**
 * ANTENNA - The Flagship HTTP Server
 * 
 * The Universal Business Ledger is the engine.
 * The Antenna is the flagship experience built with that engine.
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                                                                         │
 * │   "The Antenna receives signals from the world and translates them     │
 * │    into the language of agreements, entities, and events."             │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * Features:
 * - HTTP server with Intent API
 * - Conversational AI Agent (the flagship interface)
 * - Authentication middleware
 * - Real-time subscriptions (WebSocket/SSE)
 * - Presentation adapters (LLM, Identity, Communication)
 * 
 * Usage:
 * ```typescript
 * import { startAntenna } from 'universal-business-ledger/antenna';
 * 
 * startAntenna({
 *   port: 3000,
 *   adapters: {
 *     llm: createAnthropicAdapter({ apiKey: '...' }),
 *     identity: createAuth0Adapter({ domain: '...' }),
 *   },
 * });
 * ```
 */

// Server
export { startAntenna, createAntenna } from './server.js';
export type { AntennaConfig, AntennaInstance } from './server.js';

// Agent - The Conversational Interface
export {
  // Types
  type UserMessage,
  type MessageContext,
  type AgentResponse,
  type MarkdownContent,
  type ContentType,
  type ContentData,
  type EntityReference,
  type FormField,
  type UIAffordance,
  type FocusChange,
  type BreadcrumbItem,
  type SubscriptionInfo,
  type ResponseMeta,
  type AgentInterpretation,
  type ConversationSession,
  type ConversationTurn,
  type SessionContext,
  type ConversationalAgent,
  type MarkdownFormatter,
  
  // API Types
  type ChatRequest,
  type ChatResponse,
  type StartSessionRequest,
  type StartSessionResponse,
  type GetSessionResponse,
  type SuggestionsRequest,
  type SuggestionsResponse,
  type AgentAPIRouter,
  
  // Functions
  createAgentAPIRouter,
  createConversationalAgent,
  
  // Constants
  EXAMPLE_RESPONSES,
  OPENAPI_SPEC,
  FRONTEND_EXAMPLES,
} from './agent/index.js';

// Note: SDK adapters are in ../sdk/ - import from there
// import { createAnthropicAdapter, createAuth0Adapter, ... } from '../sdk';

