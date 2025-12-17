/**
 * SDK - External Service Integrations
 * 
 * The "2025 things" - clients/wrappers for external services.
 * These may change as services evolve, but the core Ledger remains stable.
 * 
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                                                                               ║
 * ║   "We don't replace your infrastructure. We give it meaning."                ║
 * ║                                                                               ║
 * ║   ┌─────────────────┐                      ┌─────────────────┐               ║
 * ║   │                 │                      │                 │               ║
 * ║   │  Stripe         │──┐                   │  Universal      │               ║
 * ║   │  Auth0          │──┤                   │  Agreement      │               ║
 * ║   │  Anthropic      │──┼── SDK ───────────▶│  Model          │               ║
 * ║   │  Postgres       │──┤                   │                 │               ║
 * ║   │  SendGrid       │──┘                   │  (in core/)     │               ║
 * ║   │  ...            │                      │                 │               ║
 * ║   └─────────────────┘                      └─────────────────┘               ║
 * ║                                                                               ║
 * ║   EXTERNAL SERVICES          SDK TRANSLATES          LEDGER CONCEPTS         ║
 * ║   (2025 things)              (outbound glue)         (durable)               ║
 * ║                                                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 * 
 * Categories:
 * 
 * EVENT STORES:
 *   - PostgreSQL (production recommended)
 *   - Supabase, Neon (managed Postgres)
 * 
 * LLM/AI:
 *   - Anthropic Claude (recommended for Agent)
 *   - OpenAI GPT
 * 
 * PAYMENTS:
 *   - Stripe
 * 
 * IDENTITY:
 *   - Auth0
 * 
 * COMMUNICATION:
 *   - SendGrid (email)
 *   - Twilio (SMS)
 *   - Slack
 * 
 * STORAGE:
 *   - S3-compatible (AWS, R2, etc.)
 * 
 * STANDARDS:
 *   - CloudEvents
 *   - OpenAPI
 *   - GraphQL
 *   - gRPC
 */

// ============================================================================
// TYPES - Interfaces that all SDKs implement
// ============================================================================

export * from './types';

// ============================================================================
// DATABASE / EVENT STORE
// ============================================================================

export {
  createPostgresAdapter,
  createSupabaseAdapter,
  createNeonAdapter,
  POSTGRES_QUERIES,
  POSTGRES_MIGRATIONS,
  POOL_CONFIGURATIONS,
  type PostgresConfig,
  type SupabaseConfig,
  type NeonConfig,
} from './postgres';

// ============================================================================
// LLM / AI
// ============================================================================

export {
  createAnthropicAdapter,
  extractIntent,
  formatForHuman,
  LEDGER_SYSTEM_PROMPT,
  type AnthropicConfig,
} from './anthropic';

export {
  createOpenAIAdapter,
  createAzureOpenAIAdapter,
  type OpenAIConfig,
  type AzureOpenAIConfig,
} from './openai';

export {
  createOllamaAdapter,
  createMockLLMAdapter,
  OLLAMA_SYSTEM_PROMPT,
  type OllamaConfig,
} from './ollama';

export {
  selectModel,
  smartSelectModel,
  detectTaskType,
  getAvailableModels,
  MODEL_PROFILES,
  type ModelProfile,
  type TaskType,
  type LatencyPreference,
  type ModelSelectionRequest,
  type ModelSelectionResult,
} from './model-selector';

// ============================================================================
// PAYMENTS
// ============================================================================

export {
  createStripeAdapter,
  stripeCustomerToEntity,
} from './stripe';

// ============================================================================
// IDENTITY
// ============================================================================

export {
  createAuth0Adapter,
  auth0UserIdToEntityId,
  entityIdToAuth0UserId,
  auth0SignupToEntityEvent,
  handleAuth0Webhook,
  DEFAULT_ROLE_MAPPINGS,
} from './auth0';

// ============================================================================
// COMMUNICATION
// ============================================================================

export {
  createSendGridAdapter,
  EMAIL_TEMPLATES,
  type SendGridConfig,
} from './sendgrid';

export {
  createTwilioAdapter,
  SMS_TEMPLATES,
  type TwilioConfig,
} from './twilio';

export {
  createSlackAdapter,
  SlackBlocks,
  SLACK_NOTIFICATIONS,
  type SlackConfig,
} from './slack';

// ============================================================================
// STORAGE
// ============================================================================

export {
  createS3CompatibleAdapter,
  S3_PROVIDER_PRESETS,
  type S3Config,
} from './s3';

// ============================================================================
// INDUSTRY STANDARDS (coming soon)
// ============================================================================
// CloudEvents, OpenAPI, GraphQL, gRPC standards will be added here
