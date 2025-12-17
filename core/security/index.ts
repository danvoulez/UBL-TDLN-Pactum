/**
 * SECURITY MODULE
 * 
 * Complete security layer for the Universal Ledger:
 * 
 * 1. Authentication - "Who are you?" (Prove identity)
 * 2. Authorization  - "What can you do?" (Check permissions)
 * 3. Policies       - "Are there exceptions?" (Override rules)
 * 4. Audit          - "What happened?" (Record everything)
 */

// ============================================================================
// AUTHENTICATION - Identity Verification
// ============================================================================

export {
  // Types
  type AuthenticationMethod,
  type Credential,
  type AuthenticationRequest,
  type AuthenticationResult,
  type AuthenticationError,
  type Session,
  type SessionManager,
  type TokenPayload,
  type TokenPair,
  type TokenManager,
  type MFAMethod,
  type MFAConfig,
  type MFAVerification,
  type ApiKey,
  type AuthConfig,
  type AuthenticationEngine,
  type AuthenticationEventType,
  type AuthenticatedContext,
  
  // Functions
  createAuthenticationEngine,
  createAuthEvent,
  extractBearerToken,
  extractApiKey,
  authenticateRequest,
} from './authentication';

// ============================================================================
// AUTHORIZATION - Permission Checking
// ============================================================================

export {
  // Types
  type AuthorizationRequest,
  type AuthorizationDecision,
  type AuthorizationEngine,
  
  // Functions
  createAuthorizationEngine,
} from './authorization';

// ============================================================================
// POLICIES - Rule Engine
// ============================================================================

export {
  // Types
  type Policy,
  type PolicyConditions,
  type PolicyEngine,
  
  // Functions
  createPolicyEngine,
  BUILT_IN_POLICIES,
} from './policies';

// ============================================================================
// AUDIT INTEGRATION - Security Logging
// ============================================================================

export {
  // Types
  type SecurityContext,
  type SecurityMemoryIntegration,
  
  // Functions
  createSecurityMemoryIntegration,
} from './audit-integration';

