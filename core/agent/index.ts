/**
 * AGENT MODULE - The Universal Interface
 * 
 * This module provides the conversational interface to the Universal Ledger.
 * 
 * For frontend developers:
 * - You only need POST /chat
 * - Everything comes back as Markdown + Blocks
 * - Affordances tell you what buttons to show
 * - Plans are staged records awaiting your confirmation
 * 
 * For backend developers:
 * - Use ResponseBuilder for constructing rich responses
 * - Plans allow "staged" records before committing
 * - All frontend rendering logic lives here
 */

// ============================================================================
// RICH INTERFACE - Blocks, Plans, Panels (MAIN)
// ============================================================================

export type {
  // Blocks
  Block,
  MarkdownBlock,
  TableBlock,
  TableColumn,
  TableRow,
  ChartBlock,
  ChartDataPoint,
  CalendarBlock,
  CalendarEvent,
  RecordGridBlock,
  RecordItem,
  RecordType,
  RecordStatus,
  ActionButtonsBlock,
  ActionButton,
  PlanBlock,
  PlannedRecord,
  AlertBlock,
  ProgressBlock,
  TimelineBlock,
  TimelineEvent,
  FormBlock,
  FormField as RichFormField,
  
  // Response structure
  RichAgentResponse,
  Affordance,
  ToolCall,
  
  // Panels
  SidebarUpdate,
  ConversationSummary,
  FlowSummary,
  PinnedItem,
  UserInfo,
  LedgerPanelUpdate,
  LedgerRecord,
  LedgerFilters,
  ActiveFilters,
  Subscription,
  ConversationContext,
  
  // Plan management
  PlanManager,
  ConfirmPlanResult,
} from './rich-interface';

export {
  // Response builder
  ResponseBuilder,
  response,
  createPlanManager,
  
  // Examples
  exampleHireResponse,
  exampleListResponse,
} from './rich-interface';

// ============================================================================
// CONVERSATION - Session & Message Types
// ============================================================================

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

// ============================================================================
// PRIMITIVES - Canonical Types (Fase 3)
// ============================================================================

export type {
  ChatResponse,
  // AgentResponse, UIAffordance, FocusChange, BreadcrumbItem, SubscriptionInfo, AgentInterpretation
  // already exported from ./conversation above
} from './primitives';

export {
  buildSuggestionsFromAffordances,
  buildAgentErrorResponse,
  validateAgentResponse,
  ensureNonEmptyMarkdown,
  ensureAffordancesArray,
} from './primitives';

export {
  createFakeLLMAdapter,
} from './fake-llm-adapter';

// ============================================================================
// API - HTTP Routes
// ============================================================================

export type {
  ChatRequest,
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

