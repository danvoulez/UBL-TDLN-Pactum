/**
 * HTTP SERVER - Universal Intent Gateway
 * 
 * A single endpoint that accepts any intent.
 * This is NOT a REST API with fixed resources.
 * This IS an intent processor with dynamic affordances.
 * 
 * Endpoints:
 *   POST /            - Process any intent
 *   POST /intent       - Process any intent (canonical)
 *   GET  /affordances - Get available actions for context
 *   POST /simulate    - Dry-run an intent
 *   GET  /schema/:intent - Get schema for an intent
 *   GET  /health      - Health check
 * 
 * The magic is in the single POST endpoint that understands
 * what you want to do based on the intent, not the URL.
 */

import type { EntityId, ActorReference } from '../schema/ledger';
import type { 
  Intent, 
  IntentResult, 
  IntentHandler, 
  IntentRegistry,
  Affordance,
  IntentError,
  BUILT_IN_INTENTS,
  INTENT_ALIASES,
} from './intent-api';

// ============================================================================
// HTTP TYPES
// ============================================================================

export interface HttpRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body?: unknown;
  readonly query?: Record<string, string>;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

export interface AuthContext {
  readonly actor: ActorReference;
  readonly realm: EntityId;
  readonly permissions: readonly string[];
  readonly token?: string;
}

// ============================================================================
// REQUEST/RESPONSE FORMATS
// ============================================================================

/**
 * The universal request format.
 * Can be sent as JSON body or as natural language (with NLP parsing).
 */
export interface UniversalRequest {
  /** The intent (verb) - what do you want to do? */
  readonly intent: string;
  
  /** The payload - the details of what you want */
  readonly payload: Record<string, unknown>;
  
  /** Optional: Override realm from auth context */
  readonly realm?: EntityId;
  
  /** Optional: Idempotency key for safe retries */
  readonly idempotencyKey?: string;
  
  /** Optional: Expected outcomes for validation */
  readonly expects?: readonly {
    readonly type: string;
    readonly conditions?: Record<string, unknown>;
  }[];
}

/**
 * Natural language request (optional feature)
 */
export interface NaturalLanguageRequest {
  /** Natural language description of what you want */
  readonly message: string;
  
  /** Context hints */
  readonly context?: {
    readonly targetType?: string;
    readonly targetId?: EntityId;
  };
}

/**
 * The universal response format.
 * Always includes affordances - what you CAN do next.
 */
export interface UniversalResponse {
  /** Did it work? */
  readonly success: boolean;
  
  /** Human-readable summary */
  readonly message: string;
  
  /** The detailed result */
  readonly result?: IntentResult;
  
  /** What can you do now? */
  readonly affordances: readonly Affordance[];
  
  /** Errors if any */
  readonly errors?: readonly IntentError[];
  
  /** Request metadata */
  readonly meta: {
    readonly requestId: string;
    readonly timestamp: number;
    readonly processingTime: number;
  };
}

// ============================================================================
// HTTP SERVER IMPLEMENTATION
// ============================================================================

export interface HttpServerConfig {
  readonly port: number;
  readonly host?: string;
  readonly corsOrigins?: readonly string[];
  readonly rateLimit?: {
    readonly windowMs: number;
    readonly maxRequests: number;
  };
}

export interface HttpServer {
  /** Start the server */
  start(): Promise<void>;
  
  /** Stop the server */
  stop(): Promise<void>;
  
  /** Handle a request (for testing or custom integrations) */
  handleRequest(req: HttpRequest, auth: AuthContext): Promise<HttpResponse>;
}

export function createHttpServer(
  config: HttpServerConfig,
  intentHandler: IntentHandler,
  intentRegistry: IntentRegistry
): HttpServer {
  
  // Request handler
  async function handleRequest(req: HttpRequest, auth: AuthContext): Promise<HttpResponse> {
    const startTime = Date.now();
    const requestId = generateRequestId();
    
    try {
      // Route based on path
      switch (req.path) {
        case '/':
        case '/intent':
          return await handleIntend(req, auth, requestId, startTime);
          
        case '/affordances':
          return await handleAffordances(req, auth, requestId, startTime);
          
        case '/simulate':
          return await handleSimulate(req, auth, requestId, startTime);
          
        case '/health':
          return handleHealth(requestId, startTime);
          
        default:
          // Check for schema requests
          if (req.path.startsWith('/schema/')) {
            const intentName = req.path.slice(8);
            return handleSchema(intentName, requestId, startTime);
          }
          
          return {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
            body: {
              success: false,
              message: 'Not found. Use POST / with an intent.',
              affordances: getBaseAffordances(),
              meta: { requestId, timestamp: Date.now(), processingTime: Date.now() - startTime },
            },
          };
      }
    } catch (error) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: false,
          message: 'Internal server error',
          errors: [{ code: 'INTERNAL_ERROR', message: String(error) }],
          affordances: getBaseAffordances(),
          meta: { requestId, timestamp: Date.now(), processingTime: Date.now() - startTime },
        },
      };
    }
  }
  
  // Main intent handler
  async function handleIntend(
    req: HttpRequest,
    auth: AuthContext,
    requestId: string,
    startTime: number
  ): Promise<HttpResponse> {
    if (req.method !== 'POST') {
      return {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Allow': 'POST' },
        body: {
          success: false,
          message: 'Use POST to submit intents',
          affordances: getBaseAffordances(),
          meta: { requestId, timestamp: Date.now(), processingTime: Date.now() - startTime },
        },
      };
    }
    
    const body = req.body as UniversalRequest | NaturalLanguageRequest;
    
    // Check if this is a natural language request
    if ('message' in body && typeof body.message === 'string') {
      return await handleNaturalLanguage(body, auth, requestId, startTime);
    }
    
    // Parse intent request
    const intentReq = body as UniversalRequest;
    if (!intentReq.intent) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: false,
          message: 'Missing required field: intent',
          errors: [{ code: 'MISSING_INTENT', message: 'The "intent" field is required', field: 'intent' }],
          affordances: getBaseAffordances(),
          meta: { requestId, timestamp: Date.now(), processingTime: Date.now() - startTime },
        },
      };
    }
    
    // Resolve aliases
    let intentName = intentReq.intent;
    let payload = intentReq.payload || {};
    
    const alias = INTENT_ALIASES[intentName.toLowerCase()];
    if (alias) {
      intentName = alias.intent;
      payload = { ...alias.defaults, ...payload };
    }
    
    // Build the intent
    const intent: Intent = {
      intent: intentName,
      realm: intentReq.realm || auth.realm,
      actor: auth.actor,
      timestamp: Date.now(),
      payload,
      idempotencyKey: intentReq.idempotencyKey,
      expects: intentReq.expects,
    };
    
    // Validate first
    const validation = await intentHandler.validate(intent);
    if (!validation.valid) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: false,
          message: 'Intent validation failed',
          errors: validation.errors,
          affordances: await intentHandler.getAvailableIntents(auth.realm, auth.actor),
          meta: { requestId, timestamp: Date.now(), processingTime: Date.now() - startTime },
        },
      };
    }
    
    // Execute the intent
    const result = await intentHandler.handle(intent);
    
    // Build response
    const message = buildResultMessage(result);
    
    return {
      status: result.success ? 200 : 422,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: result.success,
        message,
        result,
        affordances: result.affordances,
        errors: result.errors,
        meta: { requestId, timestamp: Date.now(), processingTime: Date.now() - startTime },
      },
    };
  }
  
  // Natural language handler (simplified - would use NLP in production)
  async function handleNaturalLanguage(
    req: NaturalLanguageRequest,
    auth: AuthContext,
    requestId: string,
    startTime: number
  ): Promise<HttpResponse> {
    const message = req.message.toLowerCase();
    
    // Simple pattern matching (replace with proper NLP)
    let intent: string | null = null;
    let payload: Record<string, unknown> = {};
    
    if (message.includes('hire') || message.includes('employ')) {
      intent = 'propose';
      payload = { agreementType: 'employment' };
    } else if (message.includes('sell')) {
      intent = 'propose';
      payload = { agreementType: 'sale' };
    } else if (message.includes('agree') || message.includes('accept') || message.includes('consent')) {
      intent = 'consent';
    } else if (message.includes('what can i do') || message.includes('help')) {
      intent = 'what-can-i-do';
    }
    
    if (!intent) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: false,
          message: 'Could not understand your intent. Try being more specific.',
          affordances: await intentHandler.getAvailableIntents(auth.realm, auth.actor),
          meta: { requestId, timestamp: Date.now(), processingTime: Date.now() - startTime },
        },
      };
    }
    
    // Redirect to standard intent handling
    const universalReq: UniversalRequest = {
      intent,
      payload,
    };
    
    return await handleIntend(
      { ...({} as HttpRequest), method: 'POST', path: '/intent', headers: {}, body: universalReq },
      auth,
      requestId,
      startTime
    );
  }
  
  // Affordances handler
  async function handleAffordances(
    req: HttpRequest,
    auth: AuthContext,
    requestId: string,
    startTime: number
  ): Promise<HttpResponse> {
    const targetType = req.query?.targetType;
    const targetId = req.query?.targetId as EntityId | undefined;
    
    const affordances = await intentHandler.getAvailableIntents(
      auth.realm,
      auth.actor,
      targetType || targetId ? { targetType, targetId } : undefined
    );
    
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: true,
        message: `${affordances.length} actions available`,
        affordances,
        meta: { requestId, timestamp: Date.now(), processingTime: Date.now() - startTime },
      },
    };
  }
  
  // Simulate handler
  async function handleSimulate(
    req: HttpRequest,
    auth: AuthContext,
    requestId: string,
    startTime: number
  ): Promise<HttpResponse> {
    if (req.method !== 'POST') {
      return {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Allow': 'POST' },
        body: {
          success: false,
          message: 'Use POST to simulate intents',
          affordances: getBaseAffordances(),
          meta: { requestId, timestamp: Date.now(), processingTime: Date.now() - startTime },
        },
      };
    }
    
    const body = req.body as UniversalRequest;
    
    const intent: Intent = {
      intent: body.intent,
      realm: body.realm || auth.realm,
      actor: auth.actor,
      timestamp: Date.now(),
      payload: body.payload || {},
    };
    
    const explanation = await intentHandler.explain(intent);
    
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: true,
        message: 'Simulation complete',
        result: {
          description: explanation.description,
          steps: explanation.steps,
          effects: explanation.effects,
          requirements: explanation.requirements,
        },
        affordances: getBaseAffordances(),
        meta: { requestId, timestamp: Date.now(), processingTime: Date.now() - startTime },
      },
    };
  }
  
  // Schema handler
  function handleSchema(intentName: string, requestId: string, startTime: number): HttpResponse {
    const definition = intentRegistry.get(intentName);
    
    if (!definition) {
      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: false,
          message: `Unknown intent: ${intentName}`,
          affordances: getBaseAffordances(),
          meta: { requestId, timestamp: Date.now(), processingTime: Date.now() - startTime },
        },
      };
    }
    
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: true,
        message: `Schema for intent: ${intentName}`,
        result: {
          name: definition.name,
          description: definition.description,
          category: definition.category,
          schema: definition.schema,
          requiredPermissions: definition.requiredPermissions,
          examples: definition.examples,
        },
        affordances: getBaseAffordances(),
        meta: { requestId, timestamp: Date.now(), processingTime: Date.now() - startTime },
      },
    };
  }
  
  // Health check
  function handleHealth(requestId: string, startTime: number): HttpResponse {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: true,
        message: 'System operational',
        result: {
          status: 'healthy',
          uptime: process.uptime?.() ?? 0,
        },
        affordances: getBaseAffordances(),
        meta: { requestId, timestamp: Date.now(), processingTime: Date.now() - startTime },
      },
    };
  }
  
  // Helpers
  function getBaseAffordances(): Affordance[] {
    return [
      { intent: 'register', description: 'Register a new entity', required: ['entityType', 'identity'] },
      { intent: 'propose', description: 'Propose an agreement', required: ['agreementType', 'parties', 'terms'] },
      { intent: 'query', description: 'Query the ledger', required: ['queryType'] },
      { intent: 'what-can-i-do', description: 'Get available actions', required: [] },
    ];
  }
  
  function buildResultMessage(result: IntentResult): string {
    switch (result.outcome.type) {
      case 'Created':
        return `Created successfully with ID: ${result.outcome.id}`;
      case 'Updated':
        return `Updated: ${result.outcome.changes.join(', ')}`;
      case 'Transitioned':
        return `Transitioned from ${result.outcome.from} to ${result.outcome.to}`;
      case 'Transferred':
        return `Asset ${result.outcome.asset} transferred to ${result.outcome.to}`;
      case 'Consented':
        return `Consent recorded for agreement ${result.outcome.agreement}`;
      case 'Fulfilled':
        return `Obligation "${result.outcome.obligation}" fulfilled`;
      case 'Queried':
        return `Query completed`;
      case 'Nothing':
        return result.outcome.reason;
      default:
        return 'Operation completed';
    }
  }
  
  function generateRequestId(): string {
    return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  
  // Return server interface
  return {
    async start() {
      // In a real implementation, this would start an HTTP server
      console.log(`Intent Gateway listening on ${config.host || '0.0.0.0'}:${config.port}`);
      console.log('');
      console.log('Endpoints:');
      console.log('  POST /         - Process any intent');
      console.log('  GET  /affordances - Get available actions');
      console.log('  POST /simulate - Dry-run an intent');
      console.log('  GET  /schema/:intent - Get intent schema');
      console.log('');
    },
    
    async stop() {
      console.log('Intent Gateway stopped');
    },
    
    handleRequest,
  };
}

// Placeholder for INTENT_ALIASES - would be imported in real implementation
const INTENT_ALIASES: Record<string, { intent: string; defaults?: Record<string, unknown> }> = {
  'hire': { intent: 'propose', defaults: { agreementType: 'employment' } },
  'employ': { intent: 'propose', defaults: { agreementType: 'employment' } },
  'sell': { intent: 'propose', defaults: { agreementType: 'sale' } },
  'buy': { intent: 'consent', defaults: {} },
  'agree': { intent: 'consent', defaults: {} },
  'accept': { intent: 'consent', defaults: {} },
};

