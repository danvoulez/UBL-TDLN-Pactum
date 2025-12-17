/**
 * AUTHENTICATION
 * 
 * "Who are you?"
 * 
 * We built the entire authorization system (who can do what)
 * and forgot to verify identity first. Classic. 😅
 * 
 * This module handles:
 * - Identity verification (prove who you are)
 * - Session management (stay logged in)
 * - Token handling (stateless auth)
 * - Multi-factor authentication
 * - API keys for services
 */

import type { EntityId, Timestamp } from '../shared/types';
import type { Event } from '../schema/ledger';

// ============================================================================
// IDENTITY & CREDENTIALS
// ============================================================================

/**
 * How someone proves their identity.
 */
export type AuthenticationMethod = 
  | 'Password'           // Classic username/password
  | 'OAuth2'             // Delegated to provider (Google, GitHub, etc.)
  | 'OIDC'               // OpenID Connect (Auth0, Okta, etc.)
  | 'SAML'               // Enterprise SSO
  | 'ApiKey'             // Service-to-service
  | 'JWT'                // Stateless tokens
  | 'MagicLink'          // Email-based passwordless
  | 'WebAuthn'           // Hardware keys, biometrics
  | 'MFA'                // Multi-factor (combination)
  ;

/**
 * Credential stored for an entity.
 */
export interface Credential {
  readonly id: string;
  readonly entityId: EntityId;
  readonly method: AuthenticationMethod;
  readonly identifier: string;  // Email, username, key ID, etc.
  readonly secret?: {
    /** Hashed, NEVER plain text */
    hash: string;
    algorithm: 'argon2id' | 'bcrypt' | 'scrypt';
    /** When the secret was last changed */
    changedAt: Timestamp;
    /** Force change on next login? */
    mustChange: boolean;
  };
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Timestamp;
  readonly lastUsedAt?: Timestamp;
  readonly expiresAt?: Timestamp;
  readonly revoked: boolean;
}

// ============================================================================
// AUTHENTICATION REQUEST & RESULT
// ============================================================================

/**
 * Someone trying to authenticate.
 */
export interface AuthenticationRequest {
  readonly method: AuthenticationMethod;
  readonly identifier: string;
  readonly secret?: string;  // Password, token, etc.
  readonly mfaCode?: string;
  readonly context: {
    readonly ipAddress?: string;
    readonly userAgent?: string;
    readonly deviceId?: string;
    readonly location?: { lat: number; lon: number };
  };
}

/**
 * Result of authentication attempt.
 */
export type AuthenticationResult = 
  | { success: true; entityId: EntityId; session: Session; }
  | { success: false; error: AuthenticationError; }
  ;

export type AuthenticationError =
  | { code: 'INVALID_CREDENTIALS'; message: string }
  | { code: 'ACCOUNT_LOCKED'; message: string; lockedUntil?: Timestamp }
  | { code: 'MFA_REQUIRED'; message: string; mfaMethods: MFAMethod[] }
  | { code: 'CREDENTIAL_EXPIRED'; message: string }
  | { code: 'ACCOUNT_DISABLED'; message: string }
  | { code: 'SUSPICIOUS_ACTIVITY'; message: string }
  | { code: 'RATE_LIMITED'; message: string; retryAfter: number }
  ;

// ============================================================================
// SESSIONS
// ============================================================================

/**
 * An authenticated session.
 */
export interface Session {
  readonly id: string;
  readonly entityId: EntityId;
  readonly createdAt: Timestamp;
  readonly expiresAt: Timestamp;
  readonly lastActivityAt: Timestamp;
  readonly authMethod: AuthenticationMethod;
  readonly mfaVerified: boolean;
  readonly context: {
    readonly ipAddress?: string;
    readonly userAgent?: string;
    readonly deviceId?: string;
  };
  readonly realmId?: EntityId;
  readonly revoked: boolean;
}

/**
 * Session management operations.
 */
export interface SessionManager {
  /** Create a new session after successful auth */
  create(entityId: EntityId, request: AuthenticationRequest): Promise<Session>;
  
  /** Get session by ID */
  get(sessionId: string): Promise<Session | null>;
  
  /** Validate session is still valid */
  validate(sessionId: string): Promise<boolean>;
  
  /** Update last activity timestamp */
  touch(sessionId: string): Promise<void>;
  
  /** Revoke a session (logout) */
  revoke(sessionId: string): Promise<void>;
  
  /** Revoke all sessions for an entity (logout everywhere) */
  revokeAll(entityId: EntityId): Promise<void>;
  
  /** List active sessions for an entity */
  listActive(entityId: EntityId): Promise<readonly Session[]>;
}

// ============================================================================
// TOKENS (JWT)
// ============================================================================

/**
 * JWT payload structure.
 */
export interface TokenPayload {
  /** Subject - the entity ID */
  sub: EntityId;
  /** Issuer */
  iss: string;
  /** Audience */
  aud: string | string[];
  /** Issued at */
  iat: number;
  /** Expiration */
  exp: number;
  /** JWT ID */
  jti: string;
  /** Session ID (for revocation) */
  sid?: string;
  /** Realm ID */
  realm?: EntityId;
  /** Scopes/permissions */
  scope?: string[];
}

/**
 * Token pair - access + refresh.
 */
export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAt: Timestamp;
  readonly refreshExpiresAt: Timestamp;
  readonly tokenType: 'Bearer';
}

/**
 * Token management.
 */
export interface TokenManager {
  /** Generate token pair for a session */
  generate(session: Session): Promise<TokenPair>;
  
  /** Verify and decode an access token */
  verify(token: string): Promise<TokenPayload | null>;
  
  /** Refresh tokens using refresh token */
  refresh(refreshToken: string): Promise<TokenPair | null>;
  
  /** Revoke a token (add to blacklist) */
  revoke(token: string): Promise<void>;
}

// ============================================================================
// MULTI-FACTOR AUTHENTICATION
// ============================================================================

export type MFAMethod =
  | 'TOTP'        // Time-based OTP (Google Authenticator, etc.)
  | 'SMS'         // SMS code
  | 'Email'       // Email code
  | 'WebAuthn'    // Hardware key
  | 'Recovery'    // Recovery codes
  ;

/**
 * MFA configuration for an entity.
 */
export interface MFAConfig {
  readonly entityId: EntityId;
  readonly enabled: boolean;
  readonly methods: MFAMethod[];
  readonly preferred: MFAMethod;
  readonly totpSecret?: string;  // Encrypted
  readonly recoveryCodesRemaining: number;
  readonly lastVerifiedAt?: Timestamp;
}

/**
 * MFA verification request.
 */
export interface MFAVerification {
  readonly sessionId: string;
  readonly method: MFAMethod;
  readonly code: string;
}

// ============================================================================
// API KEYS
// ============================================================================

/**
 * API key for service-to-service auth.
 */
export interface ApiKey {
  readonly id: string;
  readonly entityId: EntityId;  // The service entity
  readonly name: string;
  readonly keyPrefix: string;   // First 8 chars for identification
  readonly keyHash: string;     // Hashed key
  readonly scopes: string[];    // What this key can do
  readonly createdAt: Timestamp;
  readonly lastUsedAt?: Timestamp;
  readonly expiresAt?: Timestamp;
  readonly revoked: boolean;
  readonly metadata: {
    createdBy: EntityId;
    description?: string;
    allowedIps?: string[];
  };
}

// ============================================================================
// AUTHENTICATION ENGINE
// ============================================================================

/**
 * Configuration for the auth engine.
 */
export interface AuthConfig {
  /** Session duration in ms (default: 24 hours) */
  sessionDuration: number;
  
  /** Access token duration in ms (default: 15 minutes) */
  accessTokenDuration: number;
  
  /** Refresh token duration in ms (default: 7 days) */
  refreshTokenDuration: number;
  
  /** Max failed attempts before lockout */
  maxFailedAttempts: number;
  
  /** Lockout duration in ms */
  lockoutDuration: number;
  
  /** Require MFA for sensitive operations */
  requireMfaFor: string[];
  
  /** JWT signing config */
  jwt: {
    secret: string;
    algorithm: 'HS256' | 'RS256' | 'ES256';
    issuer: string;
    audience: string;
  };
  
  /** Event Store for persistent API key validation (optional) */
  eventStore?: any;
}

const DEFAULT_CONFIG: AuthConfig = {
  sessionDuration: 24 * 60 * 60 * 1000,      // 24 hours
  accessTokenDuration: 15 * 60 * 1000,        // 15 minutes
  refreshTokenDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxFailedAttempts: 5,
  lockoutDuration: 15 * 60 * 1000,            // 15 minutes
  requireMfaFor: ['DeleteAgreement', 'TransferOwnership', 'RevokeRole'],
  jwt: {
    secret: 'CHANGE_ME_IN_PRODUCTION',
    algorithm: 'HS256',
    issuer: 'universal-ledger',
    audience: 'universal-ledger',
  },
};

/**
 * The authentication engine.
 */
export interface AuthenticationEngine {
  /** Authenticate a request */
  authenticate(request: AuthenticationRequest): Promise<AuthenticationResult>;
  
  /** Verify MFA */
  verifyMfa(verification: MFAVerification): Promise<boolean>;
  
  /** Create API key */
  createApiKey(entityId: EntityId, name: string, scopes: string[]): Promise<{ key: string; apiKey: ApiKey }>;
  
  /** Verify API key */
  verifyApiKey(key: string): Promise<ApiKey | null>;
  
  /** Session manager */
  sessions: SessionManager;
  
  /** Token manager */
  tokens: TokenManager;
}

/**
 * Create the authentication engine.
 */
export function createAuthenticationEngine(
  config: Partial<AuthConfig> = {}
): AuthenticationEngine {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const sessions = new Map<string, Session>();
  const failedAttempts = new Map<string, { count: number; lockedUntil?: Timestamp }>();
  const apiKeys = new Map<string, ApiKey>();
  const revokedTokens = new Set<string>();
  
  const sessionManager: SessionManager = {
    async create(entityId, request) {
      const session: Session = {
        id: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        entityId,
        createdAt: Date.now() as Timestamp,
        expiresAt: (Date.now() + cfg.sessionDuration) as Timestamp,
        lastActivityAt: Date.now() as Timestamp,
        authMethod: request.method,
        mfaVerified: false,
        context: request.context,
        revoked: false,
      };
      sessions.set(session.id, session);
      return session;
    },
    
    async get(sessionId) {
      return sessions.get(sessionId) ?? null;
    },
    
    async validate(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) return false;
      if (session.revoked) return false;
      if (Date.now() > session.expiresAt) return false;
      return true;
    },
    
    async touch(sessionId) {
      const session = sessions.get(sessionId);
      if (session) {
        sessions.set(sessionId, {
          ...session,
          lastActivityAt: Date.now() as Timestamp,
        });
      }
    },
    
    async revoke(sessionId) {
      const session = sessions.get(sessionId);
      if (session) {
        sessions.set(sessionId, { ...session, revoked: true });
      }
    },
    
    async revokeAll(entityId) {
      for (const [id, session] of sessions) {
        if (session.entityId === entityId) {
          sessions.set(id, { ...session, revoked: true });
        }
      }
    },
    
    async listActive(entityId) {
      const now = Date.now();
      return Array.from(sessions.values())
        .filter(s => 
          s.entityId === entityId && 
          !s.revoked && 
          s.expiresAt > now
        );
    },
  };
  
  const tokenManager: TokenManager = {
    async generate(session) {
      const now = Date.now();
      
      const accessPayload: TokenPayload = {
        sub: session.entityId,
        iss: cfg.jwt.issuer,
        aud: cfg.jwt.audience,
        iat: Math.floor(now / 1000),
        exp: Math.floor((now + cfg.accessTokenDuration) / 1000),
        jti: `at-${Math.random().toString(36).slice(2)}`,
        sid: session.id,
        realm: session.realmId,
      };
      
      const refreshPayload: TokenPayload = {
        sub: session.entityId,
        iss: cfg.jwt.issuer,
        aud: cfg.jwt.audience,
        iat: Math.floor(now / 1000),
        exp: Math.floor((now + cfg.refreshTokenDuration) / 1000),
        jti: `rt-${Math.random().toString(36).slice(2)}`,
        sid: session.id,
      };
      
      // In production, use proper JWT signing
      const accessToken = btoa(JSON.stringify(accessPayload));
      const refreshToken = btoa(JSON.stringify(refreshPayload));
      
      return {
        accessToken,
        refreshToken,
        accessExpiresAt: (now + cfg.accessTokenDuration) as Timestamp,
        refreshExpiresAt: (now + cfg.refreshTokenDuration) as Timestamp,
        tokenType: 'Bearer',
      };
    },
    
    async verify(token) {
      if (revokedTokens.has(token)) return null;
      
      try {
        const payload = JSON.parse(atob(token)) as TokenPayload;
        if (payload.exp * 1000 < Date.now()) return null;
        return payload;
      } catch {
        return null;
      }
    },
    
    async refresh(refreshToken) {
      const payload = await this.verify(refreshToken);
      if (!payload || !payload.sid) return null;
      
      const session = await sessionManager.get(payload.sid);
      if (!session || session.revoked) return null;
      
      // Revoke old refresh token
      revokedTokens.add(refreshToken);
      
      return this.generate(session);
    },
    
    async revoke(token) {
      revokedTokens.add(token);
    },
  };
  
  return {
    async authenticate(request) {
      const attemptKey = `${request.method}:${request.identifier}`;
      const attempts = failedAttempts.get(attemptKey);
      
      // Check lockout
      if (attempts?.lockedUntil && Date.now() < attempts.lockedUntil) {
        return {
          success: false,
          error: {
            code: 'ACCOUNT_LOCKED',
            message: 'Account temporarily locked due to too many failed attempts',
            lockedUntil: attempts.lockedUntil,
          },
        };
      }
      
      // In production: verify against credential store
      // For now, mock successful auth
      const entityId = `ent-${request.identifier.replace(/[^a-z0-9]/gi, '-')}` as EntityId;
      
      // Check if MFA required
      // const mfaConfig = await getMfaConfig(entityId);
      // if (mfaConfig?.enabled && !request.mfaCode) {
      //   return {
      //     success: false,
      //     error: {
      //       code: 'MFA_REQUIRED',
      //       message: 'Multi-factor authentication required',
      //       mfaMethods: mfaConfig.methods,
      //     },
      //   };
      // }
      
      // Create session
      const session = await sessionManager.create(entityId, request);
      
      // Clear failed attempts
      failedAttempts.delete(attemptKey);
      
      return { success: true, entityId, session };
    },
    
    async verifyMfa(verification) {
      const session = await sessionManager.get(verification.sessionId);
      if (!session) return false;
      
      // In production: verify code against TOTP/SMS/etc.
      const isValid = verification.code.length === 6;
      
      if (isValid) {
        sessions.set(session.id, { ...session, mfaVerified: true });
      }
      
      return isValid;
    },
    
    async createApiKey(entityId, name, scopes) {
      const key = `ul_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      const keyHash = btoa(key); // In production: proper hashing
      
      const apiKey: ApiKey = {
        id: `key-${Date.now()}`,
        entityId,
        name,
        keyPrefix: key.slice(0, 10),
        keyHash,
        scopes,
        createdAt: Date.now() as Timestamp,
        revoked: false,
        metadata: {
          createdBy: entityId,
        },
      };
      
      apiKeys.set(keyHash, apiKey);
      
      // Return the raw key only once - it won't be retrievable again
      return { key, apiKey };
    },
    
    async verifyApiKey(key) {
      // First, try Event Store if available (persistent API keys)
      if (cfg.eventStore) {
        const keyHash = Buffer.from(key).toString('base64');
        
        // Find ApiKeyCreated event with matching hash or key
        // Get current sequence to set upper bound
        const currentSeq = await cfg.eventStore.getCurrentSequence?.() || 1000000n;
        for await (const event of cfg.eventStore.getBySequence(1n, currentSeq)) {
          if (event.type === 'ApiKeyCreated') {
            const payload = event.payload as any;
            // Support both keyHash (new format) and key (bootstrap format)
            if (payload.keyHash === keyHash || payload.key === key) {
              const keyId = event.aggregateId;
              
              // Check if revoked (aggregate type may be 'System' or 'ApiKey')
              let isRevoked = false;
              for await (const revokeEvent of cfg.eventStore.getByAggregate('System' as any, keyId)) {
                if (revokeEvent.type === 'ApiKeyRevoked') {
                  isRevoked = true;
                  break;
                }
              }
              
              if (isRevoked) return null;
              
              // Check expiration
              if (payload.expiresAt && Date.now() > payload.expiresAt) {
                return null;
              }
              
              // Return API key info
              return {
                id: keyId,
                entityId: payload.entityId as EntityId,
                name: payload.name,
                keyPrefix: key.slice(0, 10),
                keyHash,
                scopes: payload.scopes || [],
                createdAt: event.timestamp as Timestamp,
                expiresAt: payload.expiresAt,
                revoked: false,
                metadata: { createdBy: payload.entityId },
              } as ApiKey;
            }
          }
        }
      }
      
      // Fallback to in-memory storage
      const keyHash = btoa(key); // In production: proper hashing
      const apiKey = apiKeys.get(keyHash);
      
      if (!apiKey) return null;
      if (apiKey.revoked) return null;
      if (apiKey.expiresAt && Date.now() > apiKey.expiresAt) return null;
      
      // Update last used
      apiKeys.set(keyHash, {
        ...apiKey,
        lastUsedAt: Date.now() as Timestamp,
      });
      
      return apiKey;
    },
    
    sessions: sessionManager,
    tokens: tokenManager,
  };
}

// ============================================================================
// AUTHENTICATION EVENTS
// ============================================================================

/**
 * Events for audit trail.
 */
export type AuthenticationEventType =
  | 'AuthenticationAttempted'
  | 'AuthenticationSucceeded'
  | 'AuthenticationFailed'
  | 'SessionCreated'
  | 'SessionRevoked'
  | 'MfaEnabled'
  | 'MfaDisabled'
  | 'MfaVerified'
  | 'ApiKeyCreated'
  | 'ApiKeyRevoked'
  | 'PasswordChanged'
  | 'AccountLocked'
  | 'AccountUnlocked'
  ;

/**
 * Create authentication event for audit.
 */
export function createAuthEvent(
  type: AuthenticationEventType,
  entityId: EntityId | null,
  payload: Record<string, unknown>,
  context: AuthenticationRequest['context']
): Partial<Event> {
  return {
    type,
    aggregateType: 'Authentication',
    aggregateId: entityId ?? ('auth-anonymous' as EntityId),
    payload: {
      ...payload,
      context: {
        ...context,
        timestamp: Date.now(),
      },
    },
  };
}

// ============================================================================
// MIDDLEWARE HELPERS
// ============================================================================

/**
 * Extract token from Authorization header.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

/**
 * Extract API key from header.
 */
export function extractApiKey(apiKeyHeader: string | undefined): string | null {
  return apiKeyHeader ?? null;
}

/**
 * Authentication middleware result.
 */
export interface AuthenticatedContext {
  entityId: EntityId;
  session?: Session;
  apiKey?: ApiKey;
  scopes: string[];
  realmId?: EntityId;
}

/**
 * Authenticate a request (middleware helper).
 */
export async function authenticateRequest(
  engine: AuthenticationEngine,
  headers: { authorization?: string; 'x-api-key'?: string }
): Promise<AuthenticatedContext | null> {
  // Try Bearer token first
  const bearerToken = extractBearerToken(headers.authorization);
  if (bearerToken) {
    const payload = await engine.tokens.verify(bearerToken);
    if (payload) {
      const session = payload.sid 
        ? await engine.sessions.get(payload.sid) 
        : undefined;
      
      return {
        entityId: payload.sub,
        session: session ?? undefined,
        scopes: payload.scope ?? [],
        realmId: payload.realm,
      };
    }
  }
  
  // Try API key
  const apiKeyValue = extractApiKey(headers['x-api-key']);
  if (apiKeyValue) {
    const apiKey = await engine.verifyApiKey(apiKeyValue);
    if (apiKey) {
      return {
        entityId: apiKey.entityId,
        apiKey,
        scopes: apiKey.scopes,
      };
    }
  }
  
  return null;
}

