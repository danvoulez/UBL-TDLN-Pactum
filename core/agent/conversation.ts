/**
 * CONVERSATIONAL AGENT - The Universal Interface
 * 
 * Núcleo do agente conversacional. Orquestra sessões, turns, affordances e resposta ao usuário.
 * 
 * This Agent is the bridge between human language and the Universal Ledger.
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  FRONTEND (logic-less)          BACKEND                             │
 * │  ─────────────────────          ───────                             │
 * │  • Render markdown              • Agent interprets                  │
 * │  • Show affordance buttons      • Agent executes                    │
 * │  • Send user text               • Agent formats response            │
 * │  • Display results              • All business logic                │
 * └─────────────────────────────────────────────────────────────────────┘
 * 
 * The frontend only needs ONE endpoint: POST /chat
 * Everything else flows through the conversation.
 */

import type { EntityId, Timestamp, ActorReference } from '../shared/types';
import type { Affordance } from '../api/intent-api';
import type { AgentResponse, UIAffordance, FocusChange, SubscriptionInfo, AgentInterpretation, BreadcrumbItem } from './primitives';

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

// AgentResponse is now imported from primitives.ts above
// Re-export for backward compatibility
export type { AgentResponse } from './primitives';

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

// UIAffordance is now imported from primitives.ts above
// Re-export for backward compatibility
export type { UIAffordance } from './primitives';

// ============================================================================
// FOCUS & NAVIGATION
// ============================================================================

// These types are now imported from primitives.ts above
// Re-export for backward compatibility
export type { 
  FocusChange,
  BreadcrumbItem,
  SubscriptionInfo,
  AgentInterpretation,
} from './primitives';

// ============================================================================
// RESPONSE METADATA
// ============================================================================

/**
 * Response metadata (extended version for conversation.ts internal use).
 * The canonical meta structure is in AgentResponse from primitives.ts.
 */
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
  readonly agent: AgentResponse; // From primitives.ts
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

  // Entity detail response
  entityDetail: {
    id: 'resp-124' as EntityId,
    content: {
      type: 'entity' as const,
      markdown: `## 📄 Employment Agreement

**Between:** Acme Corp (Employer) ↔ João Silva (Employee)

### Status
\`\`\`
Active ✅  Since January 15, 2024
\`\`\`

### Terms
- **Position:** Software Engineer
- **Compensation:** R$ 15,000/month
- **Working Hours:** 40h/week

### Obligations
| Party | Obligation | Status |
|-------|------------|--------|
| Acme Corp | Pay salary monthly | ✅ Ongoing |
| João | Perform engineering duties | ✅ Ongoing |

### Timeline
- **Jan 15, 2024** — Agreement activated
- **Jan 15, 2024** — Both parties consented
- **Jan 10, 2024** — Agreement proposed

---
*Last updated: 2 hours ago*`,
      data: {
        entities: [
          { id: 'acme-123' as EntityId, type: 'Entity', name: 'Acme Corp' },
          { id: 'joao-123' as EntityId, type: 'Entity', name: 'João Silva' },
        ],
      },
    },
    affordances: [
      { intent: 'amend', label: 'Amend', style: 'secondary' as const, icon: 'edit' },
      { 
        intent: 'terminate', 
        label: 'Terminate', 
        style: 'danger' as const, 
        icon: 'x',
        confirm: {
          title: 'Terminate Agreement?',
          message: 'This will end the employment relationship. This action cannot be undone.',
        },
      },
      { intent: 'query', label: 'View History', style: 'ghost' as const, icon: 'history', prefilled: { showHistory: true } },
    ],
    focus: {
      type: 'entity' as const,
      entity: { type: 'Agreement', id: 'agr-001' as EntityId, name: 'Employment with Acme' },
      breadcrumb: [
        { label: 'João Silva', entity: { type: 'Entity', id: 'joao-123' as EntityId } },
        { label: 'Agreements' },
        { label: 'Employment with Acme' },
      ],
    },
    subscription: {
      eventTypes: ['AgreementStatusChanged', 'ObligationFulfilled'],
      entityId: 'agr-001' as EntityId,
    },
    meta: {
      timestamp: Date.now(),
      processingMs: 32,
      turn: 2,
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

