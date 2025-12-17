/**
 * ADAPTERS - Platform Integration Layer
 * 
 * The Universal Ledger speaks the language of business (Agreements, Entities, Roles).
 * Adapters translate this to the language of platforms (APIs, webhooks, SDKs).
 * 
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                                                                               ║
 * ║   "We don't replace your infrastructure. We give it meaning."                ║
 * ║                                                                               ║
 * ║   ┌─────────────────┐                      ┌─────────────────┐               ║
 * ║   │                 │                      │                 │               ║
 * ║   │  Stripe         │──┐                   │  Universal      │               ║
 * ║   │  Auth0          │──┤                   │  Agreement      │               ║
 * ║   │  AWS            │──┼── ADAPTERS ──────▶│  Model          │               ║
 * ║   │  Anthropic      │──┤                   │                 │               ║
 * ║   │  SendGrid       │──┘                   │  Entities       │               ║
 * ║   │  ...            │                      │  Events         │               ║
 * ║   │                 │                      │  Roles          │               ║
 * ║   └─────────────────┘                      └─────────────────┘               ║
 * ║                                                                               ║
 * ║   YOUR INVESTMENT          UNIVERSAL            ONE CONCEPTUAL               ║
 * ║   IS PRESERVED             TRANSLATION          MODEL                        ║
 * ║                                                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 * 
 * Supported Platforms:
 * 
 * EVENT STORES:
 *   - PostgreSQL (production recommended)
 *   - DynamoDB
 *   - Firestore
 *   - MongoDB
 * 
 * LLM/AI:
 *   - Anthropic Claude (recommended for Agent API)
 *   - OpenAI GPT
 *   - Google AI (Gemini)
 *   - Local LLMs (Ollama, etc.)
 * 
 * PAYMENTS:
 *   - Stripe (most complete)
 *   - Square
 *   - PayPal
 *   - Adyen
 * 
 * IDENTITY:
 *   - Auth0
 *   - Okta
 *   - Clerk
 *   - Firebase Auth
 *   - Keycloak
 * 
 * STORAGE:
 *   - AWS S3
 *   - Google Cloud Storage
 *   - Azure Blob Storage
 *   - Cloudflare R2
 * 
 * COMMUNICATION:
 *   - SendGrid (email)
 *   - Twilio (SMS)
 *   - Slack
 *   - Resend
 * 
 * SEARCH:
 *   - Elasticsearch
 *   - Algolia
 *   - Typesense
 *   - Pinecone (vector)
 * 
 * QUEUES:
 *   - AWS SQS
 *   - Google Pub/Sub
 *   - Redis
 *   - RabbitMQ
 */

// Types
export * from './types';

// ============================================================================
// INDUSTRY STANDARDS
// ============================================================================

// CloudEvents - CNCF event format standard
export {
  type CloudEvent,
  type CloudEventsConfig,
  toCloudEvent,
  fromCloudEvent,
  toCloudEventBatch,
  getStructuredHeaders,
  getBinaryHeaders,
  SUBSCRIPTION_TEMPLATES,
  LEDGER_EVENT_TYPES,
} from './standards/cloudevents';

// OpenAPI - API specification standard
export {
  generateOpenAPISpec,
  exportAsJSON,
  exportAsYAML,
  type OpenAPISpec,
} from './standards/openapi';

// S3 - Object storage standard
export {
  createS3CompatibleAdapter,
  S3_PROVIDER_PRESETS,
  DOCUMENT_KEY_PATTERNS,
  contentAddressedKey,
  type S3CompatibleConfig,
} from './standards/s3';

// ============================================================================
// PLATFORM-SPECIFIC ADAPTERS
// ============================================================================

// ────────────────────────────────────────────────────────────────────────────
// PAYMENTS
// ────────────────────────────────────────────────────────────────────────────

// Stripe
export { createStripeAdapter, stripeCustomerToEntity } from './stripe';

// ────────────────────────────────────────────────────────────────────────────
// AI / LLM
// ────────────────────────────────────────────────────────────────────────────

// Anthropic (Claude)
export { 
  createAnthropicAdapter, 
  extractIntent, 
  formatForHuman,
  LEDGER_SYSTEM_PROMPT,
  INTENT_EXTRACTION_PROMPT,
  FORMAT_RESPONSE_PROMPT,
} from './anthropic';

// OpenAI (GPT-4, GPT-3.5)
export {
  createOpenAIAdapter,
  createAzureOpenAIAdapter,
  type OpenAIConfig,
  type AzureOpenAIConfig,
} from './openai';

// ────────────────────────────────────────────────────────────────────────────
// IDENTITY
// ────────────────────────────────────────────────────────────────────────────

// Auth0
export { 
  createAuth0Adapter,
  auth0UserIdToEntityId,
  entityIdToAuth0UserId,
  auth0SignupToEntityEvent,
  auth0LoginToSessionEvent,
  handleAuth0Webhook,
  DEFAULT_ROLE_MAPPINGS,
  getEntityRolesFromLedger,
} from './auth0';

// ────────────────────────────────────────────────────────────────────────────
// COMMUNICATION
// ────────────────────────────────────────────────────────────────────────────

// Twilio (SMS, Voice, WhatsApp)
export {
  createTwilioAdapter,
  SMS_TEMPLATES,
  TwiML,
  VOICE_SCRIPTS,
  type TwilioConfig,
  type VoiceCallRequest,
} from './twilio';

// SendGrid (Email)
export {
  createSendGridAdapter,
  EMAIL_TEMPLATES,
  SENDGRID_TEMPLATE_IDS,
  buildDynamicTemplateRequest,
  type SendGridConfig,
} from './sendgrid';

// Slack (Team Messaging)
export {
  createSlackAdapter,
  SlackBlocks,
  SLACK_NOTIFICATIONS,
  SLASH_COMMANDS,
  parseSlashCommand,
  type SlackConfig,
} from './slack';

// ────────────────────────────────────────────────────────────────────────────
// DATABASE / EVENT STORE
// ────────────────────────────────────────────────────────────────────────────

// PostgreSQL (Production Event Store)
export {
  createPostgresAdapter,
  createSupabaseAdapter,
  createNeonAdapter,
  POSTGRES_QUERIES,
  POSTGRES_MIGRATIONS,
  POOL_CONFIGURATIONS,
  NOTIFY_CHANNELS,
  CREATE_NOTIFY_TRIGGER,
  type PostgresConfig,
  type SupabaseConfig,
  type NeonConfig,
} from './postgres';

