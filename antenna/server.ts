/**
 * ANTENNA SERVER - The Universal API Gateway
 * 
 * Philosophy: ONE ENDPOINT TO RULE THEM ALL.
 * 
 * POST /intent { intent, realm, actor, payload }
 * 
 * Everything else is convenience:
 * - GET  /health        → System health
 * - GET  /affordances   → What can I do?
 * - POST /chat          → Conversational wrapper
 * - WS   /subscribe     → Real-time events
 */

import type { EntityId, ActorReference } from '../core/shared/types';
import type { LLMAdapter } from '../sdk/types';
import type { IntentHandler } from '../core/api/intent-api';
import { createIntentHandler } from '../core/api/intent-api';
import { createConversationalAgent } from './agent/implementation';
import { createAgentAPIRouter } from './agent/api';
import type { AgentAPIRouter } from './agent/api';
import { AntennaWebSocketServer } from './websocket';
import type { WebSocketHandlers } from './websocket';
import { createAnthropicAdapter } from '../sdk/anthropic';
import { createOpenAIAdapter } from '../sdk/openai';
import { createOllamaAdapter, createMockLLMAdapter } from '../sdk/ollama';
import { createRedisRateLimiter } from '../core/operational/rate-limiter-redis';
import type { RateLimiter } from '../core/operational/governance';
import { createEventStore } from '../core/store/create-event-store';
import { getConfig } from '../core/config';
import { ProjectionManager } from '../core/store/projections-manager';
import { createWorkflowEngine, AGREEMENT_WORKFLOW, ASSET_WORKFLOW } from '../core/engine/workflow-engine';
import { createAggregateRepository } from '../core/aggregates/rehydrators';
import { createAgreementTypeRegistry } from '../core/universal/agreement-types';
import { createAuditLogger } from '../core/trajectory/event-store-trace';
import { createRoleStore } from './wiring/role-store';
import { createAuthorizationWiring } from './wiring/authorization';
import { route, handleCors, parseBody, type RouterContext, type RouterConfig } from './router';
import { createAuthenticationEngine } from '../core/security/authentication';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface AntennaConfig {
  port: number;
  host?: string;
  corsOrigins?: string[];
  defaultRealmId?: EntityId;
  adapters?: { llm?: LLMAdapter };
  intentHandler?: IntentHandler;
  redisUrl?: string;
  masterApiKey?: string;
}

export interface AntennaInstance {
  start(): Promise<void>;
  stop(): Promise<void>;
  getAgentRouter(): AgentAPIRouter;
}

// ============================================================================
// SERVER FACTORY
// ============================================================================

export function createAntenna(config: AntennaConfig): AntennaInstance {
  const {
    port,
    host = '0.0.0.0',
    corsOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
    defaultRealmId = 'default-realm' as EntityId,
    adapters = {},
  } = config;

  let llmAdapter: LLMAdapter | undefined = adapters.llm;
  let agentRouter: AgentAPIRouter | null = null;
  let intentHandler: IntentHandler | null = null;
  let rateLimiter: RateLimiter | null = null;
  let server: any = null;
  let wsServer: AntennaWebSocketServer | null = null;
  let projectionManager: ProjectionManager | null = null;
  let eventStore: any = null;

  return {
    async start() {
      const appConfig = getConfig();
      const PRIMORDIAL_REALM_ID = '00000000-0000-0000-0000-000000000000' as EntityId;

      // ─────────────────────────────────────────────────────────────────────
      // 1. INITIALIZE LLM ADAPTER
      // Priority: Ollama (local/remote) > Anthropic > OpenAI > Mock
      // ─────────────────────────────────────────────────────────────────────
      if (!llmAdapter) {
        const ollamaBaseUrl = appConfig.llm.ollamaBaseUrl;
        const ollamaApiKey = appConfig.llm.ollamaApiKey;
        const ollamaModel = appConfig.llm.ollamaModel;
        const anthropicKey = appConfig.llm.anthropicApiKey;
        const openaiKey = appConfig.llm.openaiApiKey;

        if (ollamaBaseUrl || ollamaApiKey) {
          // Ollama configured (local or remote)
          // Model selection happens at the Ollama host (smart-proxy.js)
          console.log('🤖 Using Ollama:', ollamaBaseUrl || 'http://localhost:11434');
          llmAdapter = createOllamaAdapter();
          await llmAdapter.initialize({
            credentials: { apiKey: ollamaApiKey },
            options: { 
              baseUrl: ollamaBaseUrl || 'http://localhost:11434',
              model: ollamaModel || 'llama3.1:8b',
            },
          });
        } else if (anthropicKey && anthropicKey !== 'your-anthropic-api-key') {
          console.log('🤖 Using Anthropic Claude');
          llmAdapter = createAnthropicAdapter();
          await llmAdapter.initialize({
            credentials: { apiKey: anthropicKey },
            options: { model: 'claude-sonnet-4-20250514' },
          });
        } else if (openaiKey && openaiKey !== 'your-openai-api-key') {
          console.log('🤖 Using OpenAI');
          llmAdapter = createOpenAIAdapter();
          await llmAdapter.initialize({
            credentials: { apiKey: openaiKey },
            options: { model: 'gpt-4' },
          });
        } else {
          console.log('⚠️  No LLM configured, using mock adapter');
          llmAdapter = createMockLLMAdapter();
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // 2. INITIALIZE CORE SERVICES
      // ─────────────────────────────────────────────────────────────────────
      eventStore = createEventStore();
      const trajectoryAuditLogger = createAuditLogger(eventStore, PRIMORDIAL_REALM_ID);

      // Projection Manager (PostgreSQL only)
      const dbPool = (eventStore as any).getPool?.();
      if (dbPool) {
        projectionManager = new ProjectionManager({ eventStore, db: dbPool });
        projectionManager.registerWorkspaceProjection();
        await projectionManager.start();
        console.log('✅ Projection manager started');
      }

      const aggregates = createAggregateRepository(eventStore);
      const roleStore = createRoleStore({
        eventStore,
        auditLogger: trajectoryAuditLogger,
        primordialRealmId: PRIMORDIAL_REALM_ID,
      });

      const workflowEngine = createWorkflowEngine(eventStore, {
        async getAggregate(type, id) {
          switch (type) {
            case 'Party': return aggregates.getParty(id);
            case 'Asset': return aggregates.getAsset(id);
            case 'Agreement': return aggregates.getAgreement(id);
            case 'Role': return aggregates.getRole(id);
            case 'Workflow': return aggregates.getWorkflowInstance(id);
            default: return null;
          }
        },
        async getActorRoles(actor) {
          if (actor.type !== 'Party') return [];
          const roles = await roleStore.getRolesByHolder((actor as any).partyId);
          return roles.map(r => r.roleType);
        },
        async getAgreementParties() { return []; },
        async executeCustomValidator() { return { valid: true }; },
        async executeCustomHandler() { return {}; },
        async sendNotification() {},
      } as any);

      workflowEngine.registerDefinition(AGREEMENT_WORKFLOW);
      workflowEngine.registerDefinition(ASSET_WORKFLOW);

      const agreementTypeRegistry = createAgreementTypeRegistry();
      const { authorizationEngine } = createAuthorizationWiring({
        roleStore,
        trajectoryAuditLogger,
        primordialRealmId: PRIMORDIAL_REALM_ID,
      });

      // Container Manager
      const { createContainerManager, bootstrap } = await import('../core/universal');
      const containerManager = createContainerManager({ eventStore });
      await bootstrap(eventStore);

      // ─────────────────────────────────────────────────────────────────────
      // 3. CREATE INTENT HANDLER
      // ─────────────────────────────────────────────────────────────────────
      intentHandler = config.intentHandler || createIntentHandler(undefined, {
        eventStore,
        aggregates,
        workflows: workflowEngine,
        agreements: agreementTypeRegistry,
        authorization: authorizationEngine,
        adapters: new Map(),
        containerManager,
      });

      // ─────────────────────────────────────────────────────────────────────
      // 4. CREATE CONVERSATIONAL AGENT
      // ─────────────────────────────────────────────────────────────────────
      const agent = createConversationalAgent(
        { llm: llmAdapter, intents: intentHandler },
        { defaultRealmId }
      );
      agentRouter = createAgentAPIRouter(agent);

      // ─────────────────────────────────────────────────────────────────────
      // 5. INITIALIZE RATE LIMITER
      // ─────────────────────────────────────────────────────────────────────
      const redisUrl = config.redisUrl || appConfig.redis?.url;
      if (redisUrl) {
        rateLimiter = createRedisRateLimiter({ redis: redisUrl });
        rateLimiter.register({
          id: 'intent-requests' as EntityId,
          name: 'Intent Requests',
          description: 'Rate limit for POST /intent',
          scope: { type: 'Realm' },
          limit: 100,
          window: { amount: 60000, unit: 'milliseconds' } as any,
          action: { type: 'Reject', message: 'Rate limit exceeded' },
          enabled: true,
        } as any);
        console.log('✅ Rate limiter initialized');
      }

      // ─────────────────────────────────────────────────────────────────────
      // 6. CREATE HTTP SERVER
      // ─────────────────────────────────────────────────────────────────────
      const http = await import('node:http');
      const isProduction = appConfig.server.nodeEnv === 'production';

      const routerConfig: RouterConfig = {
        intentHandler,
        defaultRealmId,
        corsOrigins,
        isProduction,
      };

      // Initialize authentication engine with Event Store for persistent API keys
      const authEngine = createAuthenticationEngine({
        jwt: {
          secret: process.env.JWT_SECRET || 'ubl-dev-secret-change-in-production',
          algorithm: 'HS256',
          issuer: 'universal-ledger',
          audience: 'universal-ledger',
        },
        eventStore, // Enable persistent API key validation from Event Store
      });
      console.log('✅ Authentication engine initialized');

      const routerContext: RouterContext = {
        config: routerConfig,
        eventStore,
        agentRouter,
        rateLimiter,
        authEngine,
      };

      server = http.createServer(async (req, res) => {
        // CORS
        if (handleCors(req, res, routerConfig)) return;

        // Parse body for POST
        const body = req.method === 'POST' ? await parseBody(req) : {};

        // Route
        await route(req, res, body, routerContext);
      });

      // ─────────────────────────────────────────────────────────────────────
      // 7. START WEBSOCKET SERVER
      // ─────────────────────────────────────────────────────────────────────
      server.listen(port, host, () => {
        const wsHandlers: WebSocketHandlers = {
          getCurrentSequence: () => eventStore.getCurrentSequence() as any,
          handleIntent: async (intent: any) => {
            return intentHandler!.handle({
              intent: intent.intent,
              realm: (intent.realm || defaultRealmId) as EntityId,
              actor: intent.actor || { type: 'Anonymous' } as ActorReference,
              timestamp: Date.now(),
              payload: intent.payload || {},
            });
          },
          getEventsFrom: async function* (sequence: bigint) {
            const current = await eventStore.getCurrentSequence();
            if (sequence > current) return;
            for await (const event of eventStore.getBySequence(sequence, current)) {
              yield event;
            }
          },
          handleChat: async (request: any) => {
            if (!agentRouter) throw new Error('Agent not initialized');
            return agentRouter.chat(request) as any;
          },
        };

        wsServer = new AntennaWebSocketServer({ server, path: '/subscribe' }, wsHandlers);
        wsServer.start();

        console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                         UNIVERSAL BUSINESS LEDGER                             ║
║                                                                               ║
║   📡 Antenna listening on http://${host}:${port}                              
║                                                                               ║
║   THE UNIVERSAL API: Everything is an intent.                                 ║
║                                                                               ║
║   POST /intent    Execute any intent                                          ║
║   GET  /health    System health                                               ║
║   GET  /affordances  What can I do?                                           ║
║   POST /chat      Conversational AI                                           ║
║   WS   /subscribe Real-time events                                            ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);
      });
    },

    async stop() {
      if (projectionManager) await projectionManager.stop();
      if (wsServer) { wsServer.stop(); wsServer = null; }
      if (server) { server.close(); console.log('Antenna stopped'); }
    },

    getAgentRouter() {
      if (!agentRouter) throw new Error('Agent not initialized. Call start() first.');
      return agentRouter;
    },
  };
}

// ============================================================================
// CONVENIENCE STARTER
// ============================================================================

export async function startAntenna(config: Partial<AntennaConfig> = {}): Promise<AntennaInstance> {
  const appConfig = getConfig();
  const antenna = createAntenna({
    port: config.port || appConfig.server.port,
    host: config.host || appConfig.server.host,
    ...config,
  });
  await antenna.start();
  return antenna;
}

// ============================================================================
// AUTO-START
// ============================================================================

startAntenna().catch(err => {
  console.error('❌ Failed to start Antenna:', err);
  process.exit(1);
});
