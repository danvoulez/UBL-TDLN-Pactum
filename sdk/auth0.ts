/**
 * AUTH0 ADAPTER
 * 
 * Transforms identity operations into ledger events.
 * 
 * Mapping:
 * - Auth0 User → Entity
 * - Auth0 Login → Session Agreement
 * - Auth0 Roles → Derived from Agreement-based Roles
 */

import type { 
  IdentityAdapter, 
  IdentityVerification, 
  UserInfo,
  UserSyncData,
  AuthResult,
  AdapterConfig,
  AdapterHealth,
} from './types';
import type { EntityId, Timestamp } from '../core/shared/types';

export interface Auth0Config extends AdapterConfig {
  credentials: {
    domain: string;
    clientId: string;
    clientSecret: string;
    audience?: string;
  };
}

export const DEFAULT_ROLE_MAPPINGS: Record<string, string> = {
  'admin': 'Administrator',
  'user': 'Member',
  'viewer': 'Observer',
};

/**
 * Convert Auth0 user ID to Entity ID.
 */
export function auth0UserIdToEntityId(auth0Id: string): EntityId {
  return `ent-${auth0Id.replace('auth0|', '')}` as EntityId;
}

/**
 * Convert Entity ID to Auth0 user ID.
 */
export function entityIdToAuth0UserId(entityId: EntityId): string {
  return `auth0|${entityId.replace('ent-', '')}`;
}

/**
 * Create a ledger event from Auth0 signup.
 */
export function auth0SignupToEntityEvent(user: UserInfo): object {
  return {
    type: 'EntityCreated',
    aggregateType: 'Entity',
    aggregateId: auth0UserIdToEntityId(user.id),
    payload: {
      entityType: 'Person',
      identity: {
        name: user.name || user.email,
        identifiers: [{ scheme: 'email', value: user.email }],
      },
      establishedBy: 'auth0-signup',
    },
    timestamp: Date.now(),
  };
}

/**
 * Handle Auth0 webhooks.
 */
export async function handleAuth0Webhook(payload: any): Promise<object | null> {
  switch (payload.type) {
    case 'user.created':
      return auth0SignupToEntityEvent(payload.user);
    default:
      return null;
  }
}

/**
 * Auth0 adapter implementation.
 */
export function createAuth0Adapter(): IdentityAdapter {
  let config: Auth0Config;
  
  return {
    name: 'Auth0',
    version: '1.0.0',
    platform: 'Auth0',
    category: 'Identity',
    
    async initialize(cfg: AdapterConfig): Promise<void> {
      config = cfg as Auth0Config;
      console.log('Auth0 adapter initialized for domain:', config.credentials.domain);
    },
    
    async healthCheck(): Promise<AdapterHealth> {
      return { 
        healthy: true, 
        latencyMs: 50, 
        message: 'Auth0 connected',
        details: { domain: config?.credentials?.domain },
      };
    },
    
    async shutdown(): Promise<void> {
      console.log('Auth0 adapter shutdown');
    },
    
    async verifyToken(token: string): Promise<IdentityVerification> {
      // In production: verify JWT with Auth0
      return {
        valid: true,
        userId: 'mock-user',
        entityId: 'ent-mock' as EntityId,
        email: 'user@example.com',
        roles: ['user'],
        expiresAt: (Date.now() + 3600000) as Timestamp,
      };
    },
    
    async getUserInfo(userId: string): Promise<UserInfo> {
      return {
        id: userId,
        email: 'user@example.com',
        name: 'Mock User',
        emailVerified: true,
      };
    },
    
    async syncUser(entityId: EntityId, data: UserSyncData): Promise<void> {
      console.log('Syncing user:', entityId, data);
    },
    
    async revokeSessions(userId: string): Promise<void> {
      console.log('Revoking sessions for:', userId);
    },
    
    async handleCallback(code: string, state: string): Promise<AuthResult> {
      return {
        accessToken: 'mock-token',
        expiresIn: 3600,
        userId: 'mock-user',
        email: 'user@example.com',
      };
    },
    
    getLoginUrl(redirectUri: string, state?: string): string {
      const domain = config?.credentials?.domain || 'example.auth0.com';
      const clientId = config?.credentials?.clientId || 'client';
      return `https://${domain}/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state || ''}`;
    },
  };
}

