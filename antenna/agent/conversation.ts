/**
 * CONVERSATIONAL AGENT - The Flagship Interface
 * 
 * This Agent is the bridge between human language and the Universal Ledger.
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  FRONTEND (logic-less)          ANTENNA                             │
 * │  ─────────────────────          ───────                             │
 * │  • Render markdown              • Agent interprets                  │
 * │  • Show affordance buttons      • Agent executes via Ledger         │
 * │  • Send user text               • Agent formats response            │
 * │  • Display results              • All presentation logic            │
 * └─────────────────────────────────────────────────────────────────────┘
 * 
 * The frontend only needs ONE endpoint: POST /chat
 * Everything else flows through the conversation.
 */

import type { EntityId, Timestamp, ActorReference } from '../../core/shared/types';
import type { Affordance } from '../../core/api/intent-api';

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

/**
 * A message from the user to the agent.
 */
export interface UserMessage {
  /** The natural language input */
  readonly text: string;
  
  /** Optional: Click on an affordance button */
  readonly affordanceClick?: {
    readonly intent: string;
    readonly prefilled?: Record<string, unknown>;
  };
  
  /** Optional: Attached context (e.g., selected entity) */
  readonly context?: MessageContext;
}

export interface MessageContext {
  /** Currently viewing this entity */
  readonly focusedEntity?: { type: string; id: EntityId };
  
  /** Currently in this realm */
  readonly realm?: EntityId;
  
  /** Additional context the frontend wants to pass */
  readonly meta?: Record<string, unknown>;
}

/**
 * A response from the agent to the user.
 * This is what the frontend renders.
 */
export interface AgentResponse {
  /** Unique response ID */
  readonly id: EntityId;
  
  /** The main content - rendered as Markdown */
  readonly content: MarkdownContent;
  
  /** What the user can do next - rendered as buttons/actions */
  readonly affordances: readonly UIAffordance[];
  
  /** Suggestions for what to type next */
  readonly suggestions?: readonly string[];
  
  /** If this response updates the focus */
  readonly focus?: FocusChange;
  
  /** Real-time subscription (if applicable) */
  readonly subscription?: SubscriptionInfo;
  
  /** Response metadata */
  readonly meta: ResponseMeta;
}

// ============================================================================
// MARKDOWN CONTENT
// ============================================================================

/**
 * The content rendered in the chat.
 * Can be simple text or rich structured data.
 */
export interface MarkdownContent {
  /** The markdown string */
  readonly markdown: string;
  
  /** Structured data that the markdown references (for interactivity) */
  readonly data?: ContentData;
  
  /** Content type hint for frontend rendering */
  readonly type: ContentType;
}

export type ContentType = 
  | 'message'      // Simple text response
  | 'entity'       // Single entity display
  | 'list'         // List of entities
  | 'table'        // Tabular data
  | 'timeline'     // Event history
  | 'form'         // Data input needed
  | 'confirmation' // Action confirmation
  | 'error'        // Error display
  | 'story';       // Narrative from memory

export interface ContentData {
  /** Entities referenced in the markdown (clickable) */
  readonly entities?: readonly EntityReference[];
  
  /** If this is a list, the items */
  readonly items?: readonly Record<string, unknown>[];
  
  /** If this is a form, the fields */
  readonly fields?: readonly FormField[];
  
  /** Raw query result (for advanced frontends) */
  readonly raw?: unknown;
}

export interface EntityReference {
  readonly id: EntityId;
  readonly type: string;
  readonly name: string;
  /** Where in the markdown this appears (for linking) */
  readonly marker?: string;
}

export interface FormField {
  readonly name: string;
  readonly label: string;
  readonly type: 'text' | 'number' | 'date' | 'select' | 'entity' | 'boolean';
  readonly required: boolean;
  readonly options?: readonly { value: string; label: string }[];
  readonly placeholder?: string;
  readonly defaultValue?: unknown;
}

// ============================================================================
// UI AFFORDANCES
// ============================================================================

/**
 * Affordances translated to UI elements.
 * The frontend renders these as buttons, menu items, etc.
 */
export interface UIAffordance {
  /** The intent to execute when clicked */
  readonly intent: string;
  
  /** Button label */
  readonly label: string;
  
  /** Button tooltip/description */
  readonly description?: string;
  
  /** Visual style hint */
  readonly style: 'primary' | 'secondary' | 'danger' | 'ghost';
  
  /** Icon hint (frontend interprets) */
  readonly icon?: string;
  
  /** Pre-filled data for the intent */
  readonly prefilled?: Record<string, unknown>;
  
  /** Does this need confirmation? */
  readonly confirm?: {
    readonly title: string;
    readonly message: string;
  };
  
  /** Keyboard shortcut hint */
  readonly shortcut?: string;
}

// ============================================================================
// FOCUS & NAVIGATION
// ============================================================================

/**
 * The agent can change what the user is "looking at".
 */
export interface FocusChange {
  readonly type: 'entity' | 'list' | 'dashboard' | 'none';
  readonly entity?: { type: string; id: EntityId; name: string };
  readonly breadcrumb?: readonly BreadcrumbItem[];
}

export interface BreadcrumbItem {
  readonly label: string;
  readonly entity?: { type: string; id: EntityId };
}

// ============================================================================
// SUBSCRIPTIONS (Real-time)
// ============================================================================

/**
 * If the response includes live data, the frontend should subscribe.
 */
export interface SubscriptionInfo {
  /** Subscribe to these event types */
  readonly eventTypes: readonly string[];
  
  /** For this entity (optional) */
  readonly entityId?: EntityId;
  
  /** Debounce updates (ms) */
  readonly debounceMs?: number;
}

// ============================================================================
// RESPONSE METADATA
// ============================================================================

export interface ResponseMeta {
  /** When the agent responded */
  readonly timestamp: Timestamp;
  
  /** Processing time */
  readonly processingMs: number;
  
  /** Conversation turn number */
  readonly turn: number;
  
  /** What the agent understood */
  readonly interpretation?: AgentInterpretation;
  
  /** Was this from cache? */
  readonly cached?: boolean;
}

export interface AgentInterpretation {
  /** What intent the agent detected */
  readonly intent: string;
  
  /** Confidence level */
  readonly confidence: number;
  
  /** Extracted entities */
  readonly entities?: Record<string, unknown>;
  
  /** Alternative interpretations */
  readonly alternatives?: readonly string[];
}

// ============================================================================
// CONVERSATION SESSION
// ============================================================================

/**
 * A conversation session maintains context across messages.
 */
export interface ConversationSession {
  readonly id: EntityId;
  readonly realmId: EntityId;
  readonly actor: ActorReference;
  readonly startedAt: Timestamp;
  readonly lastActivityAt: Timestamp;
  
  /** Conversation history (for context) */
  readonly history: readonly ConversationTurn[];
  
  /** Current focus */
  readonly focus?: FocusChange;
  
  /** Session-level context */
  readonly context: SessionContext;
}

export interface ConversationTurn {
  readonly user: UserMessage;
  readonly agent: AgentResponse;
  readonly timestamp: Timestamp;
}

export interface SessionContext {
  /** Entities the user has interacted with */
  readonly recentEntities: readonly EntityReference[];
  
  /** Recent queries (for "do that again" style commands) */
  readonly recentQueries: readonly string[];
  
  /** User preferences learned during session */
  readonly preferences: Record<string, unknown>;
}

// ============================================================================
// AGENT INTERFACE
// ============================================================================

/**
 * The Agent processes user messages and returns responses.
 * This is the main interface the API layer uses.
 */
export interface ConversationalAgent {
  /**
   * Process a user message and return a response.
   * This is the ONE function the frontend needs.
   */
  chat(
    sessionId: EntityId,
    message: UserMessage
  ): Promise<AgentResponse>;
  
  /**
   * Start a new conversation session.
   */
  startSession(
    realmId: EntityId,
    actor: ActorReference
  ): Promise<ConversationSession>;
  
  /**
   * Get session state (for reconnection).
   */
  getSession(sessionId: EntityId): Promise<ConversationSession | null>;
  
  /**
   * End a session.
   */
  endSession(sessionId: EntityId): Promise<void>;
  
  /**
   * Get suggestions for the current context.
   */
  getSuggestions(
    sessionId: EntityId,
    partialInput?: string
  ): Promise<readonly string[]>;
}

// ============================================================================
// MARKDOWN FORMATTERS
// ============================================================================

/**
 * Format system data as beautiful Markdown for the chat.
 */
export interface MarkdownFormatter {
  /** Format a single entity */
  entity(entity: unknown, type: string): MarkdownContent;
  
  /** Format a list of entities */
  list(entities: readonly unknown[], type: string, title?: string): MarkdownContent;
  
  /** Format a timeline of events */
  timeline(events: readonly unknown[], title?: string): MarkdownContent;
  
  /** Format an error */
  error(message: string, details?: string): MarkdownContent;
  
  /** Format a success message */
  success(message: string, details?: string): MarkdownContent;
  
  /** Format a confirmation request */
  confirmation(action: string, details: Record<string, unknown>): MarkdownContent;
  
  /** Format a story from memory */
  story(narrative: unknown): MarkdownContent;
  
  /** Format a form for input */
  form(fields: readonly FormField[], title: string): MarkdownContent;
}

// ============================================================================
// EXAMPLE RESPONSES
// ============================================================================

/**
 * Example of what the frontend receives and renders.
 */
export const EXAMPLE_RESPONSES = {
  // Simple query response
  entityList: {
    id: 'resp-123' as EntityId,
    content: {
      type: 'list' as const,
      markdown: `## João's Agreements

| Agreement | Type | Status | Since |
|-----------|------|--------|-------|
| [Employment with Acme](#agr-001) | Employment | **Active** ✅ | Jan 15, 2024 |
| [NDA with Beta Corp](#agr-002) | Confidentiality | **Active** ✅ | Mar 1, 2024 |
| [Sale of Vehicle](#agr-003) | Sale | **Fulfilled** | Dec 10, 2023 |

*3 agreements found*`,
      data: {
        entities: [
          { id: 'agr-001' as EntityId, type: 'Agreement', name: 'Employment with Acme', marker: '#agr-001' },
          { id: 'agr-002' as EntityId, type: 'Agreement', name: 'NDA with Beta Corp', marker: '#agr-002' },
          { id: 'agr-003' as EntityId, type: 'Agreement', name: 'Sale of Vehicle', marker: '#agr-003' },
        ],
      },
    },
    affordances: [
      { intent: 'propose', label: 'New Agreement', style: 'primary' as const, icon: 'plus' },
      { intent: 'query', label: 'Filter', style: 'ghost' as const, icon: 'filter', prefilled: { entityId: 'joao-123' } },
    ],
    suggestions: [
      'Show only active agreements',
      'When did the employment start?',
      'Who are the parties in the NDA?',
    ],
    meta: {
      timestamp: Date.now(),
      processingMs: 45,
      turn: 1,
      interpretation: {
        intent: 'query',
        confidence: 0.95,
        entities: { person: 'João', type: 'Agreement' },
      },
    },
  },

  // Action confirmation
  actionConfirmation: {
    id: 'resp-125' as EntityId,
    content: {
      type: 'confirmation' as const,
      markdown: `## ✅ Agreement Terminated

The employment agreement between **Acme Corp** and **João Silva** has been terminated.

### What happened:
1. Agreement status changed to \`Terminated\`
2. João's **Employee** role has been revoked
3. All parties have been notified

### Next steps:
- Final payment obligations remain until fulfilled
- João retains access to download personal documents for 30 days

---
*Terminated at ${new Date().toLocaleString()}*`,
    },
    affordances: [
      { intent: 'query', label: 'View João', style: 'primary' as const, prefilled: { entityId: 'joao-123' } },
      { intent: 'propose', label: 'New Agreement', style: 'secondary' as const },
    ],
    meta: {
      timestamp: Date.now(),
      processingMs: 156,
      turn: 3,
    },
  },
};

