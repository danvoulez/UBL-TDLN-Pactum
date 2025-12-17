/**
 * UNIVERSAL API BATTLE TESTS
 * 
 * Testing the philosophy: ONE ENDPOINT TO RULE THEM ALL.
 * 
 * These tests verify:
 * 1. The /intent endpoint handles all operations
 * 2. Response format is consistent (IntentResult)
 * 3. Error handling is uniform
 * 4. CORS and security headers work
 * 5. Rate limiting functions
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  route,
  handleCors,
  parseBody,
  sendJson,
  sendError,
  type RouterConfig,
  type RouterContext,
} from '../../../antenna/router';
import type { EntityId, ActorReference } from '../../../core/shared/types';
import type { IntentHandler, IntentResult, Affordance } from '../../../core/api/intent-api';

// ============================================================================
// MOCK HELPERS
// ============================================================================

function createMockRequest(method: string, url: string, headers: Record<string, string> = {}): any {
  return {
    method,
    url,
    headers: {
      host: 'localhost:3000',
      ...headers,
    },
  };
}

function createMockResponse(): any {
  const res: any = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      if (headers) {
        Object.entries(headers).forEach(([k, v]) => this.setHeader(k, v));
      }
    },
    end(body?: string) {
      this.body = body || '';
    },
  };
  return res;
}

function createMockIntentHandler(): IntentHandler {
  return {
    async handle(intent): Promise<IntentResult> {
      if (intent.intent === 'fail') {
        throw new Error('Intentional failure');
      }
      if (intent.intent === 'invalid') {
        return {
          success: false,
          outcome: { type: 'Nothing', reason: 'Invalid intent' },
          events: [],
          affordances: [],
          errors: [{ code: 'INVALID', message: 'Invalid intent' }],
          meta: { processedAt: Date.now(), processingTime: 1 },
        };
      }
      return {
        success: true,
        outcome: { 
          type: 'Created', 
          entity: { id: 'test-123', ...intent.payload }, 
          id: 'test-123' as EntityId 
        },
        events: [],
        affordances: [
          { intent: 'next-action', description: 'Do something next', required: [] },
        ],
        meta: { processedAt: Date.now(), processingTime: 1 },
      };
    },
    async getAvailableIntents(): Promise<readonly Affordance[]> {
      return [
        { intent: 'register', description: 'Register entity', required: ['entityType'] },
        { intent: 'propose', description: 'Propose agreement', required: ['agreementType'] },
      ];
    },
    async validate() {
      return { valid: true, errors: [], warnings: [] };
    },
    async explain() {
      return {
        description: 'Test explanation',
        steps: ['Step 1', 'Step 2'],
        effects: ['Effect 1'],
        requirements: ['Requirement 1'],
      };
    },
  };
}

function createRouterContext(overrides: Partial<RouterContext> = {}): RouterContext {
  return {
    config: {
      intentHandler: createMockIntentHandler(),
      defaultRealmId: 'test-realm' as EntityId,
      corsOrigins: ['http://localhost:3000'],
      isProduction: false,
    },
    eventStore: {
      name: 'TestStore',
      async healthCheck() { return { healthy: true }; },
    },
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Universal API - Router', () => {
  describe('1. CORS Handling', () => {
    it('allows configured origins', () => {
      const req = createMockRequest('GET', '/health', { origin: 'http://localhost:3000' });
      const res = createMockResponse();
      const config: RouterConfig = {
        intentHandler: createMockIntentHandler(),
        defaultRealmId: 'test' as EntityId,
        corsOrigins: ['http://localhost:3000'],
        isProduction: true,
      };

      const handled = handleCors(req, res, config);

      assert.strictEqual(handled, false); // Not OPTIONS, so not fully handled
      assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:3000');
      assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
    });

    it('handles OPTIONS preflight', () => {
      const req = createMockRequest('OPTIONS', '/intent', { origin: 'http://localhost:3000' });
      const res = createMockResponse();
      const config: RouterConfig = {
        intentHandler: createMockIntentHandler(),
        defaultRealmId: 'test' as EntityId,
        corsOrigins: ['http://localhost:3000'],
        isProduction: false,
      };

      const handled = handleCors(req, res, config);

      assert.strictEqual(handled, true); // OPTIONS fully handled
      assert.strictEqual(res.statusCode, 204);
    });

    it('rejects unauthorized origins in production', () => {
      const req = createMockRequest('OPTIONS', '/intent', { origin: 'http://evil.com' });
      const res = createMockResponse();
      const config: RouterConfig = {
        intentHandler: createMockIntentHandler(),
        defaultRealmId: 'test' as EntityId,
        corsOrigins: ['http://localhost:3000'],
        isProduction: true,
      };

      const handled = handleCors(req, res, config);

      assert.strictEqual(handled, true);
      assert.strictEqual(res.statusCode, 403);
    });

    it('allows all origins in development', () => {
      const req = createMockRequest('GET', '/health', { origin: 'http://any-origin.com' });
      const res = createMockResponse();
      const config: RouterConfig = {
        intentHandler: createMockIntentHandler(),
        defaultRealmId: 'test' as EntityId,
        corsOrigins: ['http://localhost:3000'],
        isProduction: false,
      };

      handleCors(req, res, config);

      assert.strictEqual(res.headers['access-control-allow-origin'], 'http://any-origin.com');
    });
  });

  describe('2. POST /intent - The Universal Endpoint', () => {
    it('executes valid intent and returns IntentResult', async () => {
      const req = createMockRequest('POST', '/intent');
      const res = createMockResponse();
      const ctx = createRouterContext();
      const body = {
        intent: 'register',
        realm: 'test-realm',
        actor: { type: 'Entity', entityId: 'user-1' },
        payload: { entityType: 'Person', name: 'Alice' },
      };

      await route(req, res, body, ctx);

      assert.strictEqual(res.statusCode, 200);
      const result = JSON.parse(res.body);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.outcome.type, 'Created');
      assert(Array.isArray(result.affordances));
      assert(result.meta.processedAt);
    });

    it('returns error for missing intent name', async () => {
      const req = createMockRequest('POST', '/intent');
      const res = createMockResponse();
      const ctx = createRouterContext();
      const body = { payload: { foo: 'bar' } };

      await route(req, res, body, ctx);

      assert.strictEqual(res.statusCode, 400);
      const result = JSON.parse(res.body);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.errors[0].code, 'MISSING_INTENT');
    });

    it('handles intent handler errors gracefully', async () => {
      const req = createMockRequest('POST', '/intent');
      const res = createMockResponse();
      const ctx = createRouterContext();
      const body = { intent: 'fail' };

      await route(req, res, body, ctx);

      assert.strictEqual(res.statusCode, 500);
      const result = JSON.parse(res.body);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.errors[0].code, 'INTENT_ERROR');
    });

    it('uses default realm when not provided', async () => {
      const req = createMockRequest('POST', '/intent');
      const res = createMockResponse();
      
      let capturedIntent: any = null;
      const ctx = createRouterContext({
        config: {
          intentHandler: {
            async handle(intent) {
              capturedIntent = intent;
              return {
                success: true,
                outcome: { type: 'Nothing', reason: 'ok' },
                events: [],
                affordances: [],
                meta: { processedAt: Date.now(), processingTime: 1 },
              };
            },
            async getAvailableIntents() { return []; },
            async validate() { return { valid: true, errors: [], warnings: [] }; },
            async explain() { return { description: '', steps: [], effects: [], requirements: [] }; },
          },
          defaultRealmId: 'default-realm' as EntityId,
          corsOrigins: [],
          isProduction: false,
        },
        eventStore: { name: 'Test', async healthCheck() { return { healthy: true }; } },
      });
      
      const body = { intent: 'test' };

      await route(req, res, body, ctx);

      assert.strictEqual(capturedIntent.realm, 'default-realm');
    });

    it('uses Anonymous actor when not provided', async () => {
      const req = createMockRequest('POST', '/intent');
      const res = createMockResponse();
      
      let capturedIntent: any = null;
      const ctx = createRouterContext({
        config: {
          intentHandler: {
            async handle(intent) {
              capturedIntent = intent;
              return {
                success: true,
                outcome: { type: 'Nothing', reason: 'ok' },
                events: [],
                affordances: [],
                meta: { processedAt: Date.now(), processingTime: 1 },
              };
            },
            async getAvailableIntents() { return []; },
            async validate() { return { valid: true, errors: [], warnings: [] }; },
            async explain() { return { description: '', steps: [], effects: [], requirements: [] }; },
          },
          defaultRealmId: 'test' as EntityId,
          corsOrigins: [],
          isProduction: false,
        },
        eventStore: { name: 'Test', async healthCheck() { return { healthy: true }; } },
      });
      
      const body = { intent: 'test' };

      await route(req, res, body, ctx);

      assert.strictEqual(capturedIntent.actor.type, 'Anonymous');
    });
  });

  describe('3. GET /health', () => {
    it('returns health status', async () => {
      const req = createMockRequest('GET', '/health');
      const res = createMockResponse();
      const ctx = createRouterContext();

      await route(req, res, {}, ctx);

      assert.strictEqual(res.statusCode, 200);
      const result = JSON.parse(res.body);
      assert.strictEqual(result.status, 'ok');
      assert.strictEqual(result.service, 'antenna');
      assert(result.timestamp);
      assert.strictEqual(result.eventStore.type, 'TestStore');
      assert.strictEqual(result.eventStore.healthy, true);
    });
  });

  describe('4. GET /affordances', () => {
    it('returns available intents', async () => {
      const req = createMockRequest('GET', '/affordances');
      const res = createMockResponse();
      const ctx = createRouterContext();

      await route(req, res, {}, ctx);

      assert.strictEqual(res.statusCode, 200);
      const result = JSON.parse(res.body);
      assert(Array.isArray(result));
      assert(result.length >= 2);
      assert(result.some((a: any) => a.intent === 'register'));
      assert(result.some((a: any) => a.intent === 'propose'));
    });
  });

  describe('5. 404 Not Found', () => {
    it('returns 404 for unknown routes', async () => {
      const req = createMockRequest('GET', '/unknown');
      const res = createMockResponse();
      const ctx = createRouterContext();

      await route(req, res, {}, ctx);

      assert.strictEqual(res.statusCode, 404);
      const result = JSON.parse(res.body);
      assert.strictEqual(result.errors[0].code, 'NOT_FOUND');
    });

    it('returns 404 for wrong method', async () => {
      const req = createMockRequest('DELETE', '/intent');
      const res = createMockResponse();
      const ctx = createRouterContext();

      await route(req, res, {}, ctx);

      assert.strictEqual(res.statusCode, 404);
    });
  });

  describe('6. Response Format Consistency', () => {
    it('all error responses follow IntentResult format', async () => {
      const testCases = [
        { method: 'POST', url: '/intent', body: {} }, // Missing intent
        { method: 'GET', url: '/unknown', body: {} }, // 404
      ];

      for (const tc of testCases) {
        const req = createMockRequest(tc.method, tc.url);
        const res = createMockResponse();
        const ctx = createRouterContext();

        await route(req, res, tc.body, ctx);

        const result = JSON.parse(res.body);
        
        // All responses should have these fields
        assert.strictEqual(result.success, false, `${tc.url} should have success: false`);
        assert(result.outcome, `${tc.url} should have outcome`);
        assert(Array.isArray(result.events), `${tc.url} should have events array`);
        assert(Array.isArray(result.affordances), `${tc.url} should have affordances array`);
        assert(Array.isArray(result.errors), `${tc.url} should have errors array`);
        assert(result.meta, `${tc.url} should have meta`);
      }
    });

    it('success responses include affordances for next actions', async () => {
      const req = createMockRequest('POST', '/intent');
      const res = createMockResponse();
      const ctx = createRouterContext();
      const body = { intent: 'register', payload: {} };

      await route(req, res, body, ctx);

      const result = JSON.parse(res.body);
      assert.strictEqual(result.success, true);
      assert(result.affordances.length > 0, 'Should suggest next actions');
      assert(result.affordances[0].intent, 'Affordance should have intent');
      assert(result.affordances[0].description, 'Affordance should have description');
    });
  });

  describe('7. Rate Limiting', () => {
    it('enforces rate limits when limiter is configured', async () => {
      const req = createMockRequest('POST', '/intent');
      const res = createMockResponse();
      
      const ctx = createRouterContext({
        rateLimiter: {
          async check() {
            return { allowed: false, retryAfter: 60 };
          },
          async record() {},
        },
      });
      
      const body = { intent: 'test' };

      await route(req, res, body, ctx);

      assert.strictEqual(res.statusCode, 429);
      assert.strictEqual(res.headers['retry-after'], '60');
      const result = JSON.parse(res.body);
      assert.strictEqual(result.errors[0].code, 'RATE_LIMITED');
    });

    it('allows requests within rate limit', async () => {
      const req = createMockRequest('POST', '/intent');
      const res = createMockResponse();
      
      let recorded = false;
      const ctx = createRouterContext({
        rateLimiter: {
          async check() {
            return { allowed: true };
          },
          async record() {
            recorded = true;
          },
        },
      });
      
      const body = { intent: 'test' };

      await route(req, res, body, ctx);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(recorded, true, 'Should record the request');
    });
  });

  describe('8. Chat Endpoint', () => {
    it('returns 503 when agent not initialized', async () => {
      const req = createMockRequest('POST', '/chat');
      const res = createMockResponse();
      const ctx = createRouterContext({ agentRouter: undefined });
      const body = { sessionId: 'test', message: { text: 'hello' } };

      await route(req, res, body, ctx);

      assert.strictEqual(res.statusCode, 503);
      const result = JSON.parse(res.body);
      assert.strictEqual(result.errors[0].code, 'AGENT_NOT_READY');
    });

    it('requires sessionId or startSession', async () => {
      const req = createMockRequest('POST', '/chat');
      const res = createMockResponse();
      const ctx = createRouterContext({
        agentRouter: {
          async chat() { return {}; },
        },
      });
      const body = { message: { text: 'hello' } };

      await route(req, res, body, ctx);

      assert.strictEqual(res.statusCode, 400);
    });
  });
});

describe('Universal API - Philosophy', () => {
  it('POST / is alias for POST /intent', async () => {
    const req1 = createMockRequest('POST', '/');
    const req2 = createMockRequest('POST', '/intent');
    const res1 = createMockResponse();
    const res2 = createMockResponse();
    const ctx = createRouterContext();
    const body = { intent: 'test' };

    await route(req1, res1, body, ctx);
    await route(req2, res2, body, ctx);

    // Both should succeed with same result structure
    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(res2.statusCode, 200);
    
    const result1 = JSON.parse(res1.body);
    const result2 = JSON.parse(res2.body);
    
    assert.strictEqual(result1.success, result2.success);
    assert.strictEqual(result1.outcome.type, result2.outcome.type);
  });

  it('everything returns IntentResult format', async () => {
    const endpoints = [
      { method: 'POST', url: '/', body: { intent: 'test' } },
      { method: 'POST', url: '/intent', body: { intent: 'test' } },
      { method: 'POST', url: '/intent', body: {} }, // Error case
    ];

    for (const ep of endpoints) {
      const req = createMockRequest(ep.method, ep.url);
      const res = createMockResponse();
      const ctx = createRouterContext();

      await route(req, res, ep.body, ctx);

      const result = JSON.parse(res.body);
      
      // IntentResult structure
      assert('success' in result, `${ep.url} should have success`);
      assert('outcome' in result, `${ep.url} should have outcome`);
      assert('events' in result, `${ep.url} should have events`);
      assert('affordances' in result, `${ep.url} should have affordances`);
      assert('meta' in result, `${ep.url} should have meta`);
    }
  });
});
