/**
 * FASE 10 - CÓDIGO PEDAGÓGICO
 * 
 * Este módulo funciona como exemplo vivo para humanos + IAs.
 * Não remover "redundâncias" aqui sem substituir por algo igualmente didático.
 * 
 * AGENT PRIMITIVES - Canonical Types
 * 
 * ⚠️ CANONICAL SOURCE: This is the ONLY place where AgentResponse, ChatResponse,
 * and related agent types are defined. All other modules should import from here.
 * 
 * These types define the contract between the agent core and the HTTP API layer.
 * 
 * Fase 6: UX DE OPERADOR DO DIAMANTE
 * - AgentMessageKind: tipos de resposta operacionais
 * - Mensagens de incidente, guidance, diagnóstico
 * - Sugestões operacionais concretas
 * 
 * Helpers "óbvios" aqui servem como âncoras semânticas:
 * - IAs podem buscar por nome da função e encontrar o ponto central
 * - Devs novatos encontram exemplos de uso imediatamente
 * 
 * @see docs/CONTRATO-API-UBL.md for the complete API contract.
 */

import type { EntityId, Timestamp } from '../shared/types';
import type { Affordance } from '../api/intent-api';

// ============================================================================
// AGENT MESSAGE KINDS (Fase 6: UX DE OPERADOR)
// ============================================================================

/**
 * Types of operational messages the agent can produce.
 * This helps categorize responses for better UX and testing.
 */
export type AgentMessageKind =
  | 'informational'      // Normal explanatory response
  | 'action_suggestion'  // Proposing to execute something
  | 'incident'           // Error/problem detected
  | 'guidance'           // Instructing next manual step
  | 'diagnostic';        // Technical analysis/details

// ============================================================================
// CHAT RESPONSE (HTTP API Contract)
// ============================================================================

/**
 * Response from POST /chat
 * This is what the HTTP layer returns to the frontend.
 */
export interface ChatResponse {
  /** The agent's response */
  readonly response: AgentResponse;
  
  /** Session ID (for subsequent requests) */
  readonly sessionId: EntityId;
}

// ============================================================================
// AGENT RESPONSE (Core Agent Contract)
// ============================================================================

/**
 * Response from the conversational agent.
 * This is the core response type that gets wrapped in ChatResponse for HTTP.
 * 
 * ⚠️ INVARIANTS:
 * - content.markdown MUST be non-empty string
 * - affordances MUST be array (can be empty, never null/undefined)
 * - meta.turn MUST be >= 1
 * - meta.processingMs MUST be >= 0
 */
export interface AgentResponse {
  /** Unique response ID */
  readonly id: EntityId;
  
  /** The main content - rendered as Markdown */
  readonly content: {
    readonly type: string; // ex: "markdown", "message", "entity", etc.
    readonly markdown: string; // ⚠️ MUST be non-empty
    readonly data?: unknown; // Optional structured data
  };
  
  /** What the user can do next - rendered as buttons/actions */
  readonly affordances: readonly UIAffordance[]; // ⚠️ MUST be array (never null)
  
  /** Suggestions for what to type next */
  readonly suggestions?: readonly string[];
  
  /** If this response updates the focus */
  readonly focus?: FocusChange;
  
  /** Real-time subscription (if applicable) */
  readonly subscription?: SubscriptionInfo;
  
  /** Response metadata */
  readonly meta: {
    readonly timestamp: number | string;
    readonly processingMs: number; // ⚠️ MUST be >= 0
    readonly turn: number; // ⚠️ MUST be >= 1
    readonly kind?: AgentMessageKind; // Fase 6: Type of operational message
    readonly interpretation?: AgentInterpretation;
    readonly cached?: boolean;
    readonly error?: {
      readonly code: string;
      readonly message: string;
      readonly details?: unknown;
    };
  };
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
// INTERPRETATION
// ============================================================================

/**
 * What the agent understood from the user's message.
 */
export interface AgentInterpretation {
  /** What intent the agent detected */
  readonly intent: string;
  
  /** Confidence level (0-1) */
  readonly confidence: number;
  
  /** Extracted entities */
  readonly entities?: Record<string, unknown>;
  
  /** Alternative interpretations */
  readonly alternatives?: readonly string[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build suggestions from affordances.
 * Transforms affordances into user-friendly suggestion strings.
 * Fase 6: Enhanced with operational suggestions.
 */
export function buildSuggestionsFromAffordances(
  affordances: readonly UIAffordance[],
  maxSuggestions: number = 3
): string[] {
  if (affordances.length === 0) {
    return [];
  }
  
  // Take up to maxSuggestions affordances
  const selected = affordances.slice(0, maxSuggestions);
  
  // Transform to friendly suggestions
  return selected.map(aff => {
    // Use description if available, otherwise label
    return aff.description || aff.label;
  });
}

/**
 * Build operational suggestions based on context.
 * Fase 6: Operator-friendly suggestions for common scenarios.
 */
export function buildOperationalSuggestions(context: {
  hasError?: boolean;
  endpoint?: string;
  isDeployContext?: boolean;
  isRealmContext?: boolean;
}): string[] {
  const suggestions: string[] = [];
  
  if (context.hasError) {
    if (context.endpoint === '/chat' || context.endpoint === '/intent') {
      suggestions.push('Rodar ./cicd/testar-api-endpoints.sh');
      suggestions.push('Rodar ./cicd/verificar-status-aws.sh');
    }
    if (context.isDeployContext) {
      suggestions.push('Ver logs de deploy: tail -n 200 /tmp/deploy-aws-*.log');
      suggestions.push('Rodar pipeline novamente: ./cicd/pipeline-oficial.sh');
    }
  }
  
  if (context.isRealmContext) {
    suggestions.push('Listar realms disponíveis');
    suggestions.push('Ver detalhes do Primordial Realm');
  }
  
  // Always include general help if we have space
  if (suggestions.length < 3) {
    suggestions.push('Ver documentação: docs/OBSERVABILITY-UBL.md');
  }
  
  return suggestions.slice(0, 3);
}

/**
 * Build an error response that maintains the ChatResponse contract.
 * 
 * Fase 6: Enhanced with operational messages and runbooks.
 * 
 * This ensures that even when errors occur, the API returns a valid ChatResponse
 * with a user-friendly message instead of a stack trace.
 */
export function buildAgentErrorResponse(
  sessionId: EntityId,
  error: unknown,
  turn: number = 1,
  context?: {
    traceId?: string;
    endpoint?: string;
    operation?: string;
  }
): ChatResponse {
  let errorMessage = 'Desculpe, ocorreu um erro ao processar sua solicitação.';
  let errorCode = 'UNKNOWN_ERROR';
  let errorDetails: unknown = undefined;
  
  if (error instanceof Error) {
    errorMessage = error.message;
    errorCode = error.name || 'ERROR';
    errorDetails = error.stack;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (error && typeof error === 'object' && 'message' in error) {
    errorMessage = String(error.message);
    errorCode = String(error.code || 'ERROR');
    errorDetails = error;
  }
  
  // Fase 6: Build operational message based on context
  let markdown: string;
  let suggestions: string[] = [];
  
  if (context?.endpoint) {
    // Use operator message for API errors
    markdown = `⚠️ **Ocorreu um erro na API**

**Endpoint**: \`${context.endpoint}\`
**Mensagem**: ${errorMessage}
${context.traceId ? `\n**Trace ID**: \`${context.traceId}\`` : ''}
${errorCode !== 'UNKNOWN_ERROR' ? `\n**Código**: \`${errorCode}\`` : ''}

**Próximos passos:**

1. **Rodar verificação de status:**
   \`\`\`bash
   ./cicd/verificar-status-aws.sh
   \`\`\`

2. **Ver logs recentes:**
   \`\`\`bash
   tail -n 200 /tmp/deploy-aws-*.log
   \`\`\`

3. **Testar endpoints:**
   \`\`\`bash
   ./cicd/testar-api-endpoints.sh http://api.logline.world
   \`\`\`

Se o problema persistir, consulte \`docs/OBSERVABILITY-UBL.md\` para mais detalhes.`;
    
    suggestions = [
      'Rodar ./cicd/verificar-status-aws.sh',
      'Ver logs recentes',
      'Testar endpoints da API',
    ];
  } else {
    // Simple fallback message
    const userMessage = errorMessage.includes('stack')
      ? 'Ocorreu um erro interno. Por favor, tente novamente ou reformule sua solicitação.'
      : errorMessage;
    
    markdown = `⚠️ ${userMessage}`;
    suggestions = [
      'Tente reformular sua solicitação',
      'Verifique se todos os campos necessários foram preenchidos',
    ];
  }
  
  const response: AgentResponse = {
    id: `error-${Date.now()}` as EntityId,
    content: {
      type: 'error',
      markdown,
    },
    affordances: [],
    suggestions,
    meta: {
      timestamp: Date.now(),
      processingMs: 0,
      turn,
      kind: 'incident', // Fase 6: Mark as incident
      error: {
        code: errorCode,
        message: errorMessage,
        details: errorDetails,
      },
    },
  };
  
  return {
    response,
    sessionId,
  };
}

/**
 * Validate that an AgentResponse follows the contract invariants.
 * Throws if invalid.
 */
export function validateAgentResponse(response: AgentResponse): void {
  if (!response.content.markdown || response.content.markdown.trim().length === 0) {
    throw new Error('AgentResponse.content.markdown MUST be non-empty string');
  }
  
  if (!Array.isArray(response.affordances)) {
    throw new Error('AgentResponse.affordances MUST be an array (never null/undefined)');
  }
  
  if (response.meta.turn < 1) {
    throw new Error('AgentResponse.meta.turn MUST be >= 1');
  }
  
  if (response.meta.processingMs < 0) {
    throw new Error('AgentResponse.meta.processingMs MUST be >= 0');
  }
}

/**
 * Ensure content.markdown is never empty.
 * Returns a fallback message if markdown is empty.
 */
export function ensureNonEmptyMarkdown(
  markdown: string | null | undefined,
  fallback: string = 'Não consegui entender sua solicitação. Pode reformular?'
): string {
  if (!markdown || markdown.trim().length === 0) {
    return fallback;
  }
  return markdown;
}

/**
 * Ensure affordances is always an array (never null/undefined).
 */
export function ensureAffordancesArray(
  affordances: readonly UIAffordance[] | null | undefined
): readonly UIAffordance[] {
  if (!affordances || !Array.isArray(affordances)) {
    return [];
  }
  return affordances;
}

