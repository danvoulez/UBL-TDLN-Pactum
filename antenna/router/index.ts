/**
 * UNIVERSAL API ROUTER
 * 
 * The philosophy: ONE ENDPOINT TO RULE THEM ALL.
 * 
 * POST /intent { intent, realm, actor, payload }
 * 
 * Everything else is just convenience:
 * - GET /health        → System health
 * - GET /affordances   → What can I do?
 * - POST /chat         → Conversational wrapper around intents
 * - WS /subscribe      → Real-time events
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EntityId, ActorReference } from '../../core/shared/types';
import type { IntentHandler, IntentResult } from '../../core/api/intent-api';
import { logger, generateTraceId, extractTraceId } from '../../core/observability/logger';
import { authenticateRequest, type AuthenticationEngine } from '../../core/security/authentication';

// ============================================================================
// TYPES
// ============================================================================

export interface RouterConfig {
  intentHandler: IntentHandler;
  defaultRealmId: EntityId;
  corsOrigins: string[];
  isProduction: boolean;
}

export interface RouterContext {
  config: RouterConfig;
  eventStore: any;
  agentRouter?: any;
  rateLimiter?: any;
  authEngine?: AuthenticationEngine;
}

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: any,
  ctx: RouterContext
) => Promise<void>;

// ============================================================================
// CORS MIDDLEWARE
// ============================================================================

export function handleCors(
  req: IncomingMessage,
  res: ServerResponse,
  config: RouterConfig
): boolean {
  const origin = req.headers.origin || '';
  const allowAllOrigins = config.corsOrigins.includes('*') || !config.isProduction;
  const originAllowed = allowAllOrigins || config.corsOrigins.includes(origin);
  
  if (originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', allowAllOrigins ? (origin || '*') : origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Idempotency-Key, X-Request-ID, X-API-Key');
  res.setHeader('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Request-ID');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(originAllowed ? 204 : 403);
    res.end();
    return true; // Request handled
  }
  
  return false; // Continue processing
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

export function sendJson(res: ServerResponse, status: number, data: any): void {
  const serialized = JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(serialized);
}

export function sendError(res: ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, {
    success: false,
    outcome: { type: 'Nothing', reason: message },
    events: [],
    affordances: [],
    errors: [{ code, message }],
    meta: { processedAt: Date.now(), processingTime: 0 },
  });
}

// ============================================================================
// ROUTE: POST /intent (THE UNIVERSAL ENDPOINT)
// ============================================================================

export const handleIntent: RouteHandler = async (req, res, body, ctx) => {
  const traceId = extractTraceId(req.headers) || generateTraceId();
  const startTime = Date.now();
  
  // Validate request
  if (!body.intent) {
    sendError(res, 400, 'MISSING_INTENT', 'Intent name is required');
    return;
  }
  
  // Build intent object
  const intent = {
    intent: body.intent,
    realm: (body.realm || ctx.config.defaultRealmId) as EntityId,
    actor: (body.actor || { type: 'Anonymous', reason: 'no-auth' }) as ActorReference,
    timestamp: body.timestamp || Date.now(),
    payload: body.payload || {},
    idempotencyKey: body.idempotencyKey || req.headers['x-idempotency-key'],
  };
  
  logger.info('intent.request', {
    component: 'router',
    traceId,
    intent: intent.intent,
    realm: intent.realm,
    actorType: intent.actor.type,
  });
  
  try {
    // Rate limiting
    if (ctx.rateLimiter) {
      const check = await ctx.rateLimiter.check({ type: 'Realm', realmId: intent.realm });
      if (!check.allowed) {
        res.setHeader('Retry-After', check.retryAfter?.toString() || '60');
        sendError(res, 429, 'RATE_LIMITED', 'Rate limit exceeded');
        return;
      }
      await ctx.rateLimiter.record({ type: 'Realm', realmId: intent.realm });
    }
    
    // Execute intent
    const result = await ctx.config.intentHandler.handle(intent);
    
    logger.info('intent.response', {
      component: 'router',
      traceId,
      intent: intent.intent,
      success: result.success,
      processingMs: Date.now() - startTime,
    });
    
    sendJson(res, 200, result);
    
  } catch (error: any) {
    logger.error('intent.error', {
      component: 'router',
      traceId,
      intent: intent.intent,
      error: error.message,
    });
    
    sendError(res, 500, 'INTENT_ERROR', error.message || 'Internal error');
  }
};

// ============================================================================
// ROUTE: GET /health
// ============================================================================

export const handleHealth: RouteHandler = async (req, res, body, ctx) => {
  const eventStoreHealth = await ctx.eventStore.healthCheck?.() || { healthy: false };
  const eventStoreName = ctx.eventStore.name || 'Unknown';
  
  sendJson(res, 200, {
    status: 'ok',
    service: 'antenna',
    timestamp: Date.now(),
    eventStore: {
      type: eventStoreName,
      healthy: eventStoreHealth.healthy,
    },
  });
};

// ============================================================================
// ROUTE: GET /affordances
// ============================================================================

export const handleAffordances: RouteHandler = async (req, res, body, ctx) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const realm = (url.searchParams.get('realm') || ctx.config.defaultRealmId) as EntityId;
  const actor = { type: 'Anonymous', reason: 'affordances-query' } as ActorReference;
  
  const affordances = await ctx.config.intentHandler.getAvailableIntents(realm, actor);
  sendJson(res, 200, affordances);
};

// ============================================================================
// ROUTE: POST /chat (Conversational wrapper)
// ============================================================================

export const handleChat: RouteHandler = async (req, res, body, ctx) => {
  if (!ctx.agentRouter) {
    sendError(res, 503, 'AGENT_NOT_READY', 'Conversational agent not initialized');
    return;
  }
  
  const traceId = extractTraceId(req.headers) || generateTraceId();
  
  // ─────────────────────────────────────────────────────────────────────
  // AUTHENTICATION REQUIRED
  // The /chat endpoint can execute intents via LLM, so it requires auth.
  // Use /affordances (public) to see what's available without auth.
  // ─────────────────────────────────────────────────────────────────────
  if (ctx.authEngine) {
    const authContext = await authenticateRequest(ctx.authEngine, {
      authorization: req.headers.authorization as string | undefined,
      'x-api-key': req.headers['x-api-key'] as string | undefined,
    });
    
    if (!authContext) {
      sendJson(res, 401, {
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
        hint: 'Provide Authorization: Bearer <token> or X-API-Key header. Use /affordances to see available actions without auth.',
      });
      return;
    }
    
    // Inject authenticated actor into startSession if not provided
    if (body.startSession && !body.startSession.actor) {
      body.startSession.actor = { type: 'Entity', entityId: authContext.entityId };
    }
  }
  
  // Validate session
  if (!body.sessionId && !body.startSession) {
    sendJson(res, 400, {
      error: 'Session ID or startSession required',
      hint: 'Provide either sessionId (for existing session) or startSession (for new session)',
    });
    return;
  }
  
  try {
    const result = await ctx.agentRouter.chat(body);
    sendJson(res, 200, result);
  } catch (error: any) {
    logger.error('chat.error', { component: 'router', traceId, error: error.message });
    sendError(res, 500, 'CHAT_ERROR', error.message || 'Chat error');
  }
};

// ============================================================================
// ROUTE: POST /session/start
// ============================================================================

export const handleSessionStart: RouteHandler = async (req, res, body, ctx) => {
  if (!ctx.agentRouter) {
    sendError(res, 503, 'AGENT_NOT_READY', 'Conversational agent not initialized');
    return;
  }
  
  const result = await ctx.agentRouter.startSession(body);
  sendJson(res, 200, result);
};

// ============================================================================
// ROUTE: GET /session/:id
// ============================================================================

export const handleSessionGet: RouteHandler = async (req, res, body, ctx) => {
  if (!ctx.agentRouter) {
    sendError(res, 503, 'AGENT_NOT_READY', 'Conversational agent not initialized');
    return;
  }
  
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const sessionId = url.pathname.split('/')[2] as EntityId;
  
  const result = await ctx.agentRouter.getSession(sessionId);
  if (!result) {
    sendError(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
    return;
  }
  
  sendJson(res, 200, result);
};

// ============================================================================
// ROUTE: POST /signup (PUBLIC - no auth required)
// ============================================================================

export const handleSignup: RouteHandler = async (req, res, body, ctx) => {
  const traceId = extractTraceId(req.headers) || generateTraceId();
  
  // Validate required fields
  if (!body.email || !body.name) {
    sendJson(res, 400, {
      error: 'Missing required fields',
      code: 'VALIDATION_ERROR',
      hint: 'Provide email and name in request body',
    });
    return;
  }
  
  try {
    // Execute public:signup intent (no auth required)
    const result = await ctx.config.intentHandler.handle({
      intent: 'public:signup',
      realm: '00000000-0000-0000-0000-000000000000' as EntityId, // Primordial realm for signup
      actor: { type: 'System', systemId: 'public-signup' } as ActorReference,
      timestamp: Date.now(),
      payload: {
        email: body.email,
        name: body.name,
        password: body.password,
        realmName: body.realmName,
        inviteToken: body.inviteToken,
      },
    });
    
    if (result.success) {
      sendJson(res, 201, {
        success: true,
        message: 'Account created successfully',
        user: result.outcome.type === 'Created' ? result.outcome.entity : null,
        affordances: result.affordances,
      });
    } else {
      sendJson(res, 400, {
        success: false,
        error: result.outcome.type === 'Nothing' ? result.outcome.reason : 'Signup failed',
        code: result.errors?.[0]?.code || 'SIGNUP_FAILED',
      });
    }
  } catch (error: any) {
    logger.error('signup.error', { component: 'router', traceId, error: error.message });
    sendError(res, 500, 'SIGNUP_ERROR', error.message || 'Signup error');
  }
};

// ============================================================================
// ROUTE: GET /suggestions
// ============================================================================

export const handleSuggestions: RouteHandler = async (req, res, body, ctx) => {
  if (!ctx.agentRouter) {
    sendError(res, 503, 'AGENT_NOT_READY', 'Conversational agent not initialized');
    return;
  }
  
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId') as EntityId;
  const partialInput = url.searchParams.get('partialInput') || undefined;
  
  const result = await ctx.agentRouter.getSuggestions({ sessionId, partialInput });
  sendJson(res, 200, result);
};

// ============================================================================
// MAIN ROUTER
// ============================================================================

export async function route(
  req: IncomingMessage,
  res: ServerResponse,
  body: any,
  ctx: RouterContext
): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method || 'GET';
  
  // Route matching
  if (path === '/health' && method === 'GET') {
    return handleHealth(req, res, body, ctx);
  }
  
  if ((path === '/' || path === '/intent') && method === 'POST') {
    return handleIntent(req, res, body, ctx);
  }
  
  if (path === '/affordances' && method === 'GET') {
    return handleAffordances(req, res, body, ctx);
  }
  
  if (path === '/chat' && method === 'POST') {
    return handleChat(req, res, body, ctx);
  }
  
  if (path === '/session/start' && method === 'POST') {
    return handleSessionStart(req, res, body, ctx);
  }
  
  if (path.startsWith('/session/') && method === 'GET') {
    return handleSessionGet(req, res, body, ctx);
  }
  
  if (path === '/suggestions' && method === 'GET') {
    return handleSuggestions(req, res, body, ctx);
  }
  
  if (path === '/signup' && method === 'POST') {
    return handleSignup(req, res, body, ctx);
  }
  
  // Not found
  sendError(res, 404, 'NOT_FOUND', `Route not found: ${method} ${path}`);
}

// ============================================================================
// BODY PARSER
// ============================================================================

export async function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: any) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}
