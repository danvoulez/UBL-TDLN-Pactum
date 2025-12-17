/**
 * ADMIN INTENTS - System Administration via Universal API
 * 
 * Following the philosophy: EVERYTHING is an intent.
 * No special endpoints. No hardcoded routes.
 * 
 * Admin operations are just intents with elevated permissions.
 * Category: 'Meta' (system-level operations)
 */

import type { IntentDefinition, Intent, IntentResult, HandlerContext } from '../intent-api';
import type { EntityId, ActorReference } from '../../shared/types';

// ============================================================================
// INTENT DEFINITIONS
// ============================================================================

export const ADMIN_INTENTS: readonly IntentDefinition[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // REALM MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'realm:create',
    description: 'Create a new realm (tenant). Returns realm ID and initial API key.',
    category: 'Meta',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 100 },
        config: {
          type: 'object',
          properties: {
            isolation: { type: 'string', enum: ['Full', 'Shared', 'Hierarchical'] },
            crossRealmAllowed: { type: 'boolean' },
            allowedEntityTypes: { type: 'array', items: { type: 'string' } },
            allowedAgreementTypes: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    requiredPermissions: ['admin:realm:create'],
    examples: [
      { name: 'Acme Corp' },
      { name: 'Startup Inc', config: { isolation: 'Full' } },
    ],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as { name: string; config?: any };
      
      // Dynamic import to avoid circular dependency
      const admin = await import('../../../antenna/admin.js');
      
      // Get the intent handler from context (passed through runtimeRegistry or similar)
      const intentHandler = (context as any).intentHandler || (context as any).runtimeRegistry?.intentHandler;
      
      if (!intentHandler) {
        return {
          success: false,
          outcome: { type: 'Nothing', reason: 'Intent handler not available in context' },
          events: [],
          affordances: [],
          errors: [{ code: 'MISSING_HANDLER', message: 'Intent handler required for realm creation' }],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      }
      
      try {
        const result = await admin.createRealm(
          { name: payload.name, config: payload.config },
          intentHandler
        );
        
        return {
          success: true,
          outcome: {
            type: 'Created' as const,
            entity: {
              id: result.realm.id,
              name: result.realm.name,
              apiKey: result.apiKey,
              entityId: result.entityId,
            },
            id: result.realm.id,
          },
          events: [],
          affordances: [
            { intent: 'user:create', description: 'Create a user in this realm', required: ['realmId', 'email', 'name'] },
            { intent: 'apikey:create', description: 'Create additional API keys', required: ['realmId', 'entityId', 'name'] },
            { intent: 'register', description: 'Register an entity in this realm', required: ['entityType', 'identity'] },
          ],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      } catch (error: any) {
        return {
          success: false,
          outcome: { type: 'Nothing', reason: error.message || String(error) },
          events: [],
          affordances: [],
          errors: [{ code: 'CREATE_REALM_ERROR', message: error.message || String(error) }],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      }
    },
  },

  {
    name: 'realm:query',
    description: 'Query realms. Returns list of realms or single realm if realmId provided.',
    category: 'Query',
    schema: {
      type: 'object',
      properties: {
        realmId: { type: 'string' },
      },
    },
    requiredPermissions: ['admin:realm:read'],
    examples: [
      {},
      { realmId: 'realm-abc123' },
    ],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as { realmId?: string };
      const admin = await import('../../../antenna/admin.js');
      const eventStore = context.eventStore as any;
      
      try {
        let results;
        if (payload.realmId) {
          const realm = await admin.getRealm(payload.realmId as EntityId, eventStore);
          results = realm ? [realm] : [];
        } else {
          results = await admin.listRealms(eventStore);
        }
        
        return {
          success: true,
          outcome: { type: 'Queried' as const, results },
          events: [],
          affordances: results.length > 0 ? [
            { intent: 'user:create', description: 'Create a user in a realm', required: ['realmId', 'email', 'name'] },
          ] : [
            { intent: 'realm:create', description: 'Create your first realm', required: ['name'] },
          ],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      } catch (error: any) {
        return {
          success: false,
          outcome: { type: 'Nothing', reason: error.message || String(error) },
          events: [],
          affordances: [],
          errors: [{ code: 'QUERY_REALM_ERROR', message: error.message || String(error) }],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      }
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // USER MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'user:create',
    description: 'Create a user in a realm. Returns user ID, credentials, and API key.',
    category: 'Entity',
    schema: {
      type: 'object',
      required: ['realmId', 'email', 'name'],
      properties: {
        realmId: { type: 'string' },
        email: { type: 'string', format: 'email' },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        password: { type: 'string', minLength: 8 },
        isAdmin: { type: 'boolean' },
      },
    },
    requiredPermissions: ['admin:user:create'],
    examples: [
      { realmId: 'realm-abc', email: 'alice@example.com', name: 'Alice' },
      { realmId: 'realm-abc', email: 'bob@example.com', name: 'Bob', isAdmin: true },
    ],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as { realmId: string; email: string; name: string; password?: string; isAdmin?: boolean };
      const admin = await import('../../../antenna/admin.js');
      const intentHandler = (context as any).intentHandler || (context as any).runtimeRegistry?.intentHandler;
      
      try {
        const result = await admin.createUser(payload as any, intentHandler);
        
        return {
          success: true,
          outcome: {
            type: 'Created' as const,
            entity: {
              id: result.entityId,
              ...result.user,
              apiKey: result.apiKey,
              credentials: result.credentials,
            },
            id: result.entityId,
          },
          events: [],
          affordances: [
            { intent: 'apikey:create', description: 'Create additional API keys for this user', required: ['realmId', 'entityId', 'name'] },
            { intent: 'propose', description: 'Propose an agreement', required: ['agreementType', 'parties'] },
          ],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      } catch (error: any) {
        return {
          success: false,
          outcome: { type: 'Nothing', reason: error.message || String(error) },
          events: [],
          affordances: [],
          errors: [{ code: 'CREATE_USER_ERROR', message: error.message || String(error) }],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      }
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // API KEY MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'apikey:create',
    description: 'Create an API key for an entity in a realm.',
    category: 'Meta',
    schema: {
      type: 'object',
      required: ['realmId', 'entityId', 'name'],
      properties: {
        realmId: { type: 'string' },
        entityId: { type: 'string' },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        scopes: { type: 'array', items: { type: 'string' } },
        expiresInDays: { type: 'number', minimum: 1, maximum: 365 },
      },
    },
    requiredPermissions: ['admin:apikey:create'],
    examples: [
      { realmId: 'realm-abc', entityId: 'ent-123', name: 'Production Key' },
      { realmId: 'realm-abc', entityId: 'ent-123', name: 'CI Key', scopes: ['read'], expiresInDays: 30 },
    ],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as { realmId: string; entityId: string; name: string; scopes?: string[]; expiresInDays?: number };
      const admin = await import('../../../antenna/admin.js');
      const eventStore = context.eventStore as any;
      
      try {
        const result = await admin.createApiKey(payload as any, eventStore);
        
        return {
          success: true,
          outcome: {
            type: 'Created' as const,
            entity: {
              id: result.apiKey.id,
              key: result.key,
              ...result.apiKey,
            },
            id: result.apiKey.id,
          },
          events: [],
          affordances: [
            { intent: 'apikey:query', description: 'List all API keys', required: [] },
            { intent: 'apikey:revoke', description: 'Revoke this key if compromised', required: ['keyId'] },
          ],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      } catch (error: any) {
        return {
          success: false,
          outcome: { type: 'Nothing', reason: error.message || String(error) },
          events: [],
          affordances: [],
          errors: [{ code: 'CREATE_APIKEY_ERROR', message: error.message || String(error) }],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      }
    },
  },

  {
    name: 'apikey:revoke',
    description: 'Revoke an API key. The key will immediately stop working.',
    category: 'Meta',
    schema: {
      type: 'object',
      required: ['keyId'],
      properties: {
        keyId: { type: 'string' },
      },
    },
    requiredPermissions: ['admin:apikey:revoke'],
    examples: [
      { keyId: 'key-abc123' },
    ],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as { keyId: string };
      const admin = await import('../../../antenna/admin.js');
      const eventStore = context.eventStore as any;
      
      try {
        const revoked = await admin.revokeApiKey(payload.keyId as EntityId, eventStore, intent.actor);
        
        return {
          success: revoked,
          outcome: revoked
            ? { type: 'Updated' as const, entity: { id: payload.keyId, revoked: true }, changes: ['revoked'] }
            : { type: 'Nothing' as const, reason: 'API key not found' },
          events: [],
          affordances: [
            { intent: 'apikey:create', description: 'Create a new API key', required: ['realmId', 'entityId', 'name'] },
          ],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      } catch (error: any) {
        return {
          success: false,
          outcome: { type: 'Nothing', reason: error.message || String(error) },
          events: [],
          affordances: [],
          errors: [{ code: 'REVOKE_APIKEY_ERROR', message: error.message || String(error) }],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      }
    },
  },

  {
    name: 'apikey:query',
    description: 'Query API keys. Filter by realm and/or entity.',
    category: 'Query',
    schema: {
      type: 'object',
      properties: {
        realmId: { type: 'string' },
        entityId: { type: 'string' },
      },
    },
    requiredPermissions: ['admin:apikey:read'],
    examples: [
      {},
      { realmId: 'realm-abc' },
      { realmId: 'realm-abc', entityId: 'ent-123' },
    ],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as { realmId?: string; entityId?: string };
      const admin = await import('../../../antenna/admin.js');
      const eventStore = context.eventStore as any;
      
      try {
        const results = await admin.listApiKeys(payload.realmId as EntityId, payload.entityId as EntityId, eventStore);
        
        return {
          success: true,
          outcome: { type: 'Queried' as const, results },
          events: [],
          affordances: results.length > 0 ? [
            { intent: 'apikey:revoke', description: 'Revoke a key', required: ['keyId'] },
          ] : [
            { intent: 'apikey:create', description: 'Create an API key', required: ['realmId', 'entityId', 'name'] },
          ],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      } catch (error: any) {
        return {
          success: false,
          outcome: { type: 'Nothing', reason: error.message || String(error) },
          events: [],
          affordances: [],
          errors: [{ code: 'QUERY_APIKEY_ERROR', message: error.message || String(error) }],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      }
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC SIGNUP - No auth required
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'public:signup',
    description: 'Self-service signup. Creates user + personal Realm if no invite. No auth required.',
    category: 'Meta',
    schema: {
      type: 'object',
      required: ['email', 'name'],
      properties: {
        email: { type: 'string', format: 'email' },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        password: { type: 'string', minLength: 8 },
        realmName: { type: 'string', minLength: 1, maxLength: 100, description: 'Name for personal realm (default: "{name}\'s Space")' },
        inviteToken: { type: 'string', description: 'Optional invite token to join existing realm' },
      },
    },
    requiredPermissions: [], // PUBLIC - no permissions required
    examples: [
      { email: 'alice@example.com', name: 'Alice' },
      { email: 'bob@example.com', name: 'Bob', realmName: 'Bob\'s Startup' },
      { email: 'carol@example.com', name: 'Carol', inviteToken: 'inv_abc123' },
    ],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as { 
        email: string; 
        name: string; 
        password?: string; 
        realmName?: string;
        inviteToken?: string;
      };
      
      const admin = await import('../../../antenna/admin.js');
      const intentHandler = (context as any).intentHandler || (context as any).runtimeRegistry?.intentHandler;
      
      try {
        // Check if user already exists by email
        const eventStore = context.eventStore as any;
        let existingUser = null;
        
        // TODO: Check inviteToken and get realmId from it
        // For now, always create new realm if no inviteToken
        
        let realmId: EntityId | undefined;
        let isAdmin = true; // User is admin of their own realm
        
        if (payload.inviteToken) {
          // TODO: Validate invite token and get realm
          // For now, reject invites (not implemented)
          return {
            success: false,
            outcome: { type: 'Nothing', reason: 'Invite system not yet implemented. Please signup without invite.' },
            events: [],
            affordances: [],
            errors: [{ code: 'INVITE_NOT_IMPLEMENTED', message: 'Invite tokens are not yet supported' }],
            meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
          };
        }
        
        // No invite = create personal realm + user as admin
        const realmName = payload.realmName || `${payload.name}'s Space`;
        
        // Step 1: Create realm
        const realmResult = await admin.createRealm({ name: realmName }, intentHandler);
        realmId = realmResult.realm.id;
        
        // Step 2: Create user in that realm as admin
        const userResult = await admin.createUser({
          realmId,
          email: payload.email,
          name: payload.name,
          password: payload.password,
          isAdmin: true,
        }, intentHandler);
        
        return {
          success: true,
          outcome: {
            type: 'Created' as const,
            entity: {
              id: userResult.entityId,
              email: payload.email,
              name: payload.name,
              realmId,
              realmName,
              isAdmin: true,
              apiKey: userResult.apiKey,
              credentials: userResult.credentials,
            },
            id: userResult.entityId,
          },
          events: [],
          affordances: [
            { intent: 'chat', description: 'Start chatting with the system', required: [] },
            { intent: 'user:create', description: 'Invite others to your realm', required: ['email', 'name'] },
            { intent: 'propose', description: 'Create agreements with others', required: ['agreementType', 'parties'] },
          ],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      } catch (error: any) {
        return {
          success: false,
          outcome: { type: 'Nothing', reason: error.message || String(error) },
          events: [],
          affordances: [],
          errors: [{ code: 'SIGNUP_ERROR', message: error.message || String(error) }],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      }
    },
  },
];
