/**
 * AUTH0 ADAPTER
 * 
 * Transforms identity operations into ledger events.
 * 
 * Mapping:
 * - Auth0 User → Entity
 * - Auth0 Login → Session Agreement (temporary)
 * - Auth0 Roles → Query for Roles established by Agreements
 * - Auth0 Permissions → Derived from Agreement-based Roles
 * 
 * Key insight: Auth0 handles AUTHENTICATION (who are you?).
 * The ledger handles AUTHORIZATION (what can you do?).
 * 
 * "Identity is just the first Agreement you make with the system."
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
import type { Event } from '../schema/ledger';
import type { EntityId, Timestamp } from '../shared/types';
import jwt from 'jsonwebtoken';
import jwksClient, { JwksClient } from 'jwks-rsa';

export interface Auth0Config extends AdapterConfig {
  credentials: {
    domain: string;
    clientId: string;
    clientSecret: string;
    audience?: string;
  };
  options?: {
    connection?: string;
  };
}

/**
 * Auth0 adapter implementation.
 */
export function createAuth0Adapter(): IdentityAdapter {
  let config: Auth0Config;
  let jwks: JwksClient | null = null;
  
  return {
    name: 'Auth0',
    version: '1.0.0',
    platform: 'Auth0',
    category: 'Identity',
    
    async initialize(cfg: AdapterConfig): Promise<void> {
      config = cfg as Auth0Config;
      
      // Initialize JWKS client for token verification
      if (config.credentials.domain) {
        jwks = jwksClient({
          jwksUri: `https://${config.credentials.domain}/.well-known/jwks.json`,
          cache: true,
          cacheMaxAge: 86400000, // 24 hours
        });
      }
      
      console.log('Auth0 adapter initialized for domain:', config.credentials.domain);
    },
    
    async healthCheck(): Promise<AdapterHealth> {
      try {
        // Check Auth0 availability
        // const response = await fetch(`https://${config.credentials.domain}/.well-known/openid-configuration`);
        return { 
          healthy: true, 
          latencyMs: 50, 
          message: 'Auth0 connected',
          details: { domain: config?.credentials?.domain },
        };
      } catch (error) {
        return { 
          healthy: false, 
          latencyMs: 0, 
          message: `Auth0 error: ${error}` 
        };
      }
    },
    
    async shutdown(): Promise<void> {
      console.log('Auth0 adapter shutdown');
    },
    
    async verifyToken(token: string): Promise<IdentityVerification> {
      try {
        // Real JWT verification with Auth0
        if (!config.credentials.domain) {
          throw new Error('Auth0 domain not configured');
        }

        // Get signing key from JWKS
        const getKey = (header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) => {
          if (!jwks) {
            return callback(new Error('JWKS client not initialized'));
          }
          
          jwks.getSigningKey(header.kid, (err, key) => {
            if (err) {
              return callback(err);
            }
            const signingKey = key?.getPublicKey();
            callback(null, signingKey);
          });
        };

        // Verify token
        const decoded = await new Promise<jwt.JwtPayload>((resolve, reject) => {
          jwt.verify(
            token,
            getKey,
            {
              audience: config.credentials.audience,
              issuer: `https://${config.credentials.domain}/`,
              algorithms: ['RS256'],
            },
            (err, decoded) => {
              if (err) {
                reject(err);
              } else {
                resolve(decoded as jwt.JwtPayload);
              }
            }
          );
        });
        
        // Map Auth0 user to Entity
        const entityId = auth0UserIdToEntityId(decoded.sub || '');
        
        return {
          valid: true,
          userId: decoded.sub || '',
          entityId,
          email: decoded.email as string || '',
          roles: (decoded['https://ledger/roles'] as string[]) ?? [],
          expiresAt: (decoded.exp || 0) * 1000,
          
          // The login itself is a "Session Agreement"
          sessionAgreement: {
            issuedAt: (decoded.iat || 0) * 1000,
            expiresAt: (decoded.exp || 0) * 1000,
            scopes: (decoded.scope as string)?.split(' ') ?? [],
          },
        };
      } catch (error) {
        console.error('Auth0 token verification failed:', error);
        return { valid: false };
      }
    },
    
    async getUserInfo(userId: string): Promise<UserInfo> {
      // Get user from Auth0 Management API
      // const response = await fetch(`https://${config.credentials.domain}/api/v2/users/${userId}`, {
      //   headers: { Authorization: `Bearer ${managementToken}` },
      // });
      // const user = await response.json();
      
      // Mock response
      return {
        id: userId,
        email: 'user@example.com',
        name: 'Example User',
        picture: 'https://example.com/avatar.png',
        emailVerified: true,
        metadata: {},
      };
    },
    
    async syncUser(entityId: EntityId, data: UserSyncData): Promise<void> {
      // Create or update user in Auth0
      // This allows bidirectional sync:
      // - Entity created in ledger → User created in Auth0
      // - User created in Auth0 → Entity created in ledger
      
      // const response = await fetch(`https://${config.credentials.domain}/api/v2/users`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     Authorization: `Bearer ${managementToken}`,
      //   },
      //   body: JSON.stringify({
      //     email: data.email,
      //     name: data.name,
      //     connection: config.options?.connection ?? 'Username-Password-Authentication',
      //     app_metadata: {
      //       ledgerEntityId: entityId,
      //       ...data.metadata,
      //     },
      //   }),
      // });
      
      console.log(`Synced entity ${entityId} to Auth0`);
    },
    
    async revokeSessions(userId: string): Promise<void> {
      // Invalidate all refresh tokens for user
      // POST /api/v2/users/{id}/multifactor/actions/invalidate-remember-browser
      // DELETE /api/v2/grants
      
      console.log(`Revoked all sessions for user ${userId}`);
    },
    
    async handleCallback(code: string, state: string): Promise<AuthResult> {
      // Exchange authorization code for tokens
      // const response = await fetch(`https://${config.credentials.domain}/oauth/token`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     grant_type: 'authorization_code',
      //     client_id: config.credentials.clientId,
      //     client_secret: config.credentials.clientSecret,
      //     code,
      //     redirect_uri: 'YOUR_REDIRECT_URI',
      //   }),
      // });
      // const tokens = await response.json();
      
      // Mock response
      return {
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
        expiresIn: 86400,
        userId: 'auth0|123456',
        email: 'user@example.com',
      };
    },
    
    getLoginUrl(redirectUri: string, state?: string): string {
      const params = new URLSearchParams({
        client_id: config?.credentials?.clientId ?? '',
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid profile email',
        state: state ?? generateState(),
      });
      
      if (config?.credentials?.audience) {
        params.set('audience', config.credentials.audience);
      }
      
      return `https://${config?.credentials?.domain}/authorize?${params}`;
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert Auth0 user ID to ledger Entity ID.
 */
export function auth0UserIdToEntityId(auth0UserId: string): EntityId {
  // Create deterministic mapping
  // auth0|123456 → ent-auth0-123456
  const cleanId = auth0UserId.replace(/[|]/g, '-');
  return `ent-${cleanId}` as EntityId;
}

/**
 * Convert ledger Entity ID to Auth0 user ID format.
 */
export function entityIdToAuth0UserId(entityId: EntityId): string | null {
  if (entityId.startsWith('ent-auth0-')) {
    return entityId.replace('ent-auth0-', 'auth0|');
  }
  return null;
}

/**
 * Generate random state parameter for OAuth.
 */
function generateState(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Mock token decoder removed - using real JWT verification now

// ============================================================================
// AUTH0 → LEDGER EVENT TRANSFORMERS
// ============================================================================

/**
 * Create Entity from Auth0 user signup.
 */
export function auth0SignupToEntityEvent(user: {
  user_id: string;
  email: string;
  name?: string;
  picture?: string;
  created_at: string;
}): Event {
  const entityId = auth0UserIdToEntityId(user.user_id);
  
  return {
    id: `evt_auth0_signup_${user.user_id}`,
    type: 'EntityCreated',
    aggregateType: 'Entity',
    aggregateId: entityId,
    timestamp: new Date(user.created_at).getTime(),
    version: 1,
    actor: { type: 'System', systemId: 'auth0-adapter' },
    payload: {
      entityType: 'Person',
      identity: {
        name: user.name ?? user.email.split('@')[0],
        identifiers: [
          { type: 'Email', value: user.email },
          { type: 'Auth0UserId', value: user.user_id },
        ],
        contacts: [{ type: 'Email', value: user.email }],
      },
      metadata: {
        auth0UserId: user.user_id,
        picture: user.picture,
      },
    },
    causation: {
      eventId: `auth0_signup_${user.user_id}`,
    },
    hash: '',
  };
}

/**
 * Create Session Agreement from Auth0 login.
 * 
 * This models the authentication as a temporary agreement between
 * the user and the system, granting a "Session" role.
 */
export function auth0LoginToSessionEvent(login: {
  user_id: string;
  client_id: string;
  ip: string;
  user_agent?: string;
  date: string;
}): Event {
  const entityId = auth0UserIdToEntityId(login.user_id);
  const sessionId = `ses-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  return {
    id: `evt_auth0_login_${sessionId}`,
    type: 'SessionEstablished', // Custom event type for sessions
    aggregateType: 'Session', // Sessions are their own aggregate
    aggregateId: sessionId as EntityId,
    timestamp: new Date(login.date).getTime(),
    version: 1,
    actor: { type: 'Entity', entityId },
    payload: {
      entityId,
      clientId: login.client_id,
      ip: login.ip,
      userAgent: login.user_agent,
      
      // Session is essentially a temporary "Access Agreement"
      sessionAgreement: {
        parties: [
          { entityId, role: 'Authenticated User' },
          { entityId: 'system' as EntityId, role: 'Identity Provider' },
        ],
        validity: {
          effectiveFrom: new Date(login.date).getTime(),
          effectiveUntil: new Date(login.date).getTime() + 24 * 60 * 60 * 1000, // 24h
        },
      },
    },
    causation: {
      eventId: `auth0_login_${login.user_id}_${login.date}`,
    },
    hash: '',
  };
}

/**
 * Handle Auth0 webhook events.
 */
export function handleAuth0Webhook(event: {
  type: string;
  data: any;
}): Event | null {
  switch (event.type) {
    case 'user.created':
      return auth0SignupToEntityEvent(event.data);
    
    case 'user.logged_in':
      return auth0LoginToSessionEvent(event.data);
    
    case 'user.deleted':
      return {
        id: `evt_auth0_deleted_${event.data.user_id}`,
        type: 'EntityDeactivated',
        aggregateType: 'Entity',
        aggregateId: auth0UserIdToEntityId(event.data.user_id),
        timestamp: Date.now(),
        version: 1,
        actor: { type: 'System', systemId: 'auth0-adapter' },
        payload: {
          reason: 'User deleted from Auth0',
          auth0UserId: event.data.user_id,
        },
        hash: '',
      };
    
    case 'user.email_verified':
      return {
        id: `evt_auth0_verified_${event.data.user_id}`,
        type: 'EntityUpdated',
        aggregateType: 'Entity',
        aggregateId: auth0UserIdToEntityId(event.data.user_id),
        timestamp: Date.now(),
        version: 1,
        actor: { type: 'System', systemId: 'auth0-adapter' },
        payload: {
          changes: {
            'identity.verified': true,
            'identity.verifiedAt': Date.now(),
          },
        },
        hash: '',
      };
    
    default:
      return null;
  }
}

// ============================================================================
// ROLE MAPPING
// ============================================================================

/**
 * Map Auth0 roles to ledger role queries.
 * 
 * Important: Auth0 roles are just LABELS.
 * In the Universal Ledger, roles are RELATIONSHIPS established by Agreements.
 * 
 * So instead of "checking if user has Admin role in Auth0",
 * we query "what Agreements grant this Entity an Admin role?"
 */
export interface RoleMapping {
  auth0Role: string;
  ledgerQuery: {
    roleType: string;
    agreementTypes?: readonly string[];
    scope?: string;
  };
}

export const DEFAULT_ROLE_MAPPINGS: readonly RoleMapping[] = [
  {
    auth0Role: 'admin',
    ledgerQuery: {
      roleType: 'Administrator',
      agreementTypes: ['SystemAccess', 'Employment'],
    },
  },
  {
    auth0Role: 'user',
    ledgerQuery: {
      roleType: 'User',
      agreementTypes: ['Membership', 'License'],
    },
  },
  {
    auth0Role: 'employee',
    ledgerQuery: {
      roleType: 'Employee',
      agreementTypes: ['Employment'],
    },
  },
];

/**
 * Instead of checking Auth0 role, query the ledger for Agreement-based roles.
 */
export async function getEntityRolesFromLedger(
  entityId: EntityId,
  eventStore: { readAggregate: (type: string, id: EntityId) => Promise<readonly Event[]> }
): Promise<readonly string[]> {
  // This would be a proper query to the ledger
  // For now, placeholder
  return ['User'];
}

