/**
 * ADAPTERS - Platform Integration Layer
 * 
 * The Universal Ledger defines WHAT happens (events, agreements, roles).
 * Adapters define WHERE and HOW it executes.
 * 
 * Philosophy:
 * - We don't replace your infrastructure
 * - We give it meaning through the Agreement model
 * - Your investments are preserved
 * - One conceptual model, many implementations
 * 
 * Example:
 * - Stripe payment → "Payment Agreement fulfilled"
 * - Auth0 login → "Session Agreement established"
 * - S3 upload → "Document attached to Agreement"
 * - SendGrid email → "Notification delivered"
 */

import type { EntityId, Timestamp, ActorReference } from '../shared/types';
import type { Event } from '../schema/ledger';

// ============================================================================
// ADAPTER INTERFACE
// ============================================================================

/**
 * Base adapter interface. All platform adapters implement this.
 */
export interface Adapter {
  readonly name: string;
  readonly version: string;
  readonly platform: Platform;
  
  /** Initialize the adapter */
  initialize(config: AdapterConfig): Promise<void>;
  
  /** Health check */
  healthCheck(): Promise<AdapterHealth>;
  
  /** Shutdown gracefully */
  shutdown(): Promise<void>;
}

export type Platform = 
  // Cloud Providers
  | 'AWS'
  | 'GCP'
  | 'Azure'
  | 'Vercel'
  | 'Cloudflare'
  
  // Databases
  | 'PostgreSQL'
  | 'DynamoDB'
  | 'MongoDB'
  | 'Firestore'
  | 'Supabase'
  | 'PlanetScale'
  
  // AI/LLM
  | 'Anthropic'
  | 'OpenAI'
  | 'Google_AI'
  | 'Cohere'
  | 'Mistral'
  | 'Local_LLM'
  
  // Payments
  | 'Stripe'
  | 'Square'
  | 'PayPal'
  | 'Adyen'
  | 'MercadoPago'
  
  // Identity
  | 'Auth0'
  | 'Okta'
  | 'Clerk'
  | 'Firebase_Auth'
  | 'Supabase_Auth'
  | 'Keycloak'
  
  // Communication
  | 'Twilio'
  | 'SendGrid'
  | 'Postmark'
  | 'Resend'
  | 'Slack'
  | 'Discord'
  
  // Storage
  | 'S3'
  | 'GCS'
  | 'Azure_Blob'
  | 'Cloudflare_R2'
  | 'Backblaze_B2'
  
  // Search
  | 'Elasticsearch'
  | 'Algolia'
  | 'Typesense'
  | 'Meilisearch'
  | 'Pinecone'
  
  // Queues
  | 'SQS'
  | 'PubSub'
  | 'RabbitMQ'
  | 'Redis'
  | 'Kafka'
  
  // Custom
  | 'Custom';

export interface AdapterConfig {
  readonly credentials: Record<string, string>;
  readonly options?: Record<string, unknown>;
  readonly region?: string;
  readonly environment?: 'development' | 'staging' | 'production';
}

export interface AdapterHealth {
  readonly healthy: boolean;
  readonly latencyMs: number;
  readonly message?: string;
  readonly details?: Record<string, unknown>;
}

// ============================================================================
// EVENT STORE ADAPTERS
// ============================================================================

/**
 * Event Store adapter - where events are persisted.
 */
export interface EventStoreAdapter extends Adapter {
  readonly category: 'EventStore';
  
  /** Append events */
  append(events: readonly Event[]): Promise<void>;
  
  /** Read events for an aggregate */
  readAggregate(aggregateType: string, aggregateId: EntityId): Promise<readonly Event[]>;
  
  /** Read events after a sequence */
  readAfter(sequence: bigint, limit?: number): Promise<readonly Event[]>;
  
  /** Subscribe to new events */
  subscribe(handler: (event: Event) => Promise<void>): Promise<Subscription>;
  
  /** Get current sequence number */
  getCurrentSequence(): Promise<bigint>;
}

export interface Subscription {
  readonly id: string;
  unsubscribe(): Promise<void>;
}

// ============================================================================
// LLM ADAPTERS
// ============================================================================

/**
 * LLM adapter - for the Agent API.
 */
export interface LLMAdapter extends Adapter {
  readonly category: 'LLM';
  readonly model: string;
  
  /** Complete a prompt */
  complete(request: LLMRequest): Promise<LLMResponse>;
  
  /** Stream a completion */
  stream(request: LLMRequest): AsyncIterable<LLMChunk>;
  
  /** Generate embeddings */
  embed(texts: readonly string[]): Promise<readonly number[][]>;
  
  /** Estimate token count */
  estimateTokens(text: string): number;
}

export interface LLMRequest {
  readonly messages: readonly LLMMessage[];
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly stopSequences?: readonly string[];
  readonly systemPrompt?: string;
  readonly tools?: readonly LLMTool[];
}

export interface LLMMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
}

export interface LLMTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

export interface LLMResponse {
  readonly content: string;
  readonly tokensUsed: number;
  readonly finishReason: 'stop' | 'length' | 'tool_use';
  readonly toolCalls?: readonly LLMToolCall[];
}

export interface LLMChunk {
  readonly content: string;
  readonly done: boolean;
}

export interface LLMToolCall {
  readonly tool: string;
  readonly arguments: Record<string, unknown>;
}

// ============================================================================
// PAYMENT ADAPTERS
// ============================================================================

/**
 * Payment adapter - financial transactions become Agreement fulfillments.
 */
export interface PaymentAdapter extends Adapter {
  readonly category: 'Payment';
  
  /** Create a payment intent (maps to Payment Agreement proposal) */
  createPaymentIntent(request: PaymentIntentRequest): Promise<PaymentIntent>;
  
  /** Confirm payment (maps to Agreement fulfillment) */
  confirmPayment(paymentIntentId: string): Promise<PaymentResult>;
  
  /** Refund (maps to compensation Agreement) */
  refund(paymentId: string, amount?: number): Promise<RefundResult>;
  
  /** Create subscription (maps to recurring Agreement) */
  createSubscription(request: SubscriptionRequest): Promise<SubscriptionResult>;
  
  /** Cancel subscription (maps to Agreement termination) */
  cancelSubscription(subscriptionId: string): Promise<void>;
  
  /** Handle webhook (platform → ledger events) */
  handleWebhook(payload: unknown, signature: string): Promise<PaymentEvent>;
}

export interface PaymentIntentRequest {
  readonly amount: number;
  readonly currency: string;
  readonly customerId?: string;
  readonly metadata?: Record<string, string>;
  
  /** Maps to Agreement reference */
  readonly agreementId?: EntityId;
}

export interface PaymentIntent {
  readonly id: string;
  readonly clientSecret: string;
  readonly status: 'pending' | 'processing' | 'succeeded' | 'failed';
  readonly amount: number;
  readonly currency: string;
}

export interface PaymentResult {
  readonly id: string;
  readonly status: 'succeeded' | 'failed';
  readonly amount: number;
  readonly fee: number;
  readonly net: number;
  readonly metadata?: Record<string, string>;
}

export interface RefundResult {
  readonly id: string;
  readonly status: 'pending' | 'succeeded' | 'failed';
  readonly amount: number;
}

export interface SubscriptionRequest {
  readonly customerId: string;
  readonly priceId: string;
  readonly metadata?: Record<string, string>;
  readonly agreementId?: EntityId;
}

export interface SubscriptionResult {
  readonly id: string;
  readonly status: 'active' | 'canceled' | 'past_due';
  readonly currentPeriodStart: Timestamp;
  readonly currentPeriodEnd: Timestamp;
}

export interface PaymentEvent {
  readonly type: string;
  readonly data: unknown;
  
  /** Convert to ledger event */
  toLedgerEvent(): Event | null;
}

// ============================================================================
// IDENTITY ADAPTERS
// ============================================================================

/**
 * Identity adapter - authentication becomes Session Agreements.
 */
export interface IdentityAdapter extends Adapter {
  readonly category: 'Identity';
  
  /** Verify a token (returns the Entity it represents) */
  verifyToken(token: string): Promise<IdentityVerification>;
  
  /** Get user info */
  getUserInfo(userId: string): Promise<UserInfo>;
  
  /** Create/sync user in identity provider */
  syncUser(entityId: EntityId, data: UserSyncData): Promise<void>;
  
  /** Revoke sessions (terminate Session Agreements) */
  revokeSessions(userId: string): Promise<void>;
  
  /** Handle OAuth callback */
  handleCallback(code: string, state: string): Promise<AuthResult>;
  
  /** Generate login URL */
  getLoginUrl(redirectUri: string, state?: string): string;
}

export interface IdentityVerification {
  readonly valid: boolean;
  readonly userId?: string;
  readonly entityId?: EntityId;
  readonly email?: string;
  readonly roles?: readonly string[];
  readonly expiresAt?: Timestamp;
  
  /** The implicit Session Agreement */
  readonly sessionAgreement?: {
    readonly issuedAt: Timestamp;
    readonly expiresAt: Timestamp;
    readonly scopes: readonly string[];
  };
}

export interface UserInfo {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
  readonly picture?: string;
  readonly emailVerified: boolean;
  readonly metadata?: Record<string, unknown>;
}

export interface UserSyncData {
  readonly email: string;
  readonly name?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AuthResult {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresIn: number;
  readonly userId: string;
  readonly email: string;
}

// ============================================================================
// STORAGE ADAPTERS
// ============================================================================

/**
 * Storage adapter - file storage for Documents.
 */
export interface StorageAdapter extends Adapter {
  readonly category: 'Storage';
  
  /** Upload a file */
  upload(request: UploadRequest): Promise<UploadResult>;
  
  /** Download a file */
  download(key: string): Promise<DownloadResult>;
  
  /** Get a signed URL for direct access */
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  
  /** Delete a file */
  delete(key: string): Promise<void>;
  
  /** List files */
  list(prefix?: string): Promise<readonly StorageObject[]>;
  
  /** Check if file exists */
  exists(key: string): Promise<boolean>;
}

export interface UploadRequest {
  readonly key: string;
  readonly content: Uint8Array | ReadableStream;
  readonly contentType: string;
  readonly metadata?: Record<string, string>;
  
  /** Link to Document in ledger */
  readonly documentId?: EntityId;
}

export interface UploadResult {
  readonly key: string;
  readonly url: string;
  readonly size: number;
  readonly etag: string;
}

export interface DownloadResult {
  readonly content: Uint8Array;
  readonly contentType: string;
  readonly size: number;
  readonly metadata?: Record<string, string>;
}

export interface StorageObject {
  readonly key: string;
  readonly size: number;
  readonly lastModified: Timestamp;
  readonly contentType?: string;
}

// ============================================================================
// COMMUNICATION ADAPTERS
// ============================================================================

/**
 * Communication adapter - for notifications.
 */
export interface CommunicationAdapter extends Adapter {
  readonly category: 'Communication';
  readonly channels: readonly CommunicationChannel[];
  
  /** Send a message */
  send(request: SendRequest): Promise<SendResult>;
  
  /** Send batch */
  sendBatch(requests: readonly SendRequest[]): Promise<readonly SendResult[]>;
  
  /** Handle inbound (webhook) */
  handleInbound(payload: unknown): Promise<InboundMessage | null>;
}

export type CommunicationChannel = 'email' | 'sms' | 'push' | 'slack' | 'discord' | 'whatsapp';

export interface SendRequest {
  readonly channel: CommunicationChannel;
  readonly to: string | readonly string[];
  readonly subject?: string;
  readonly body: string;
  readonly bodyHtml?: string;
  readonly from?: string;
  readonly replyTo?: string;
  readonly attachments?: readonly Attachment[];
  readonly metadata?: Record<string, string>;
  
  /** Link to notification in ledger */
  readonly notificationId?: EntityId;
}

export interface Attachment {
  readonly filename: string;
  readonly content: Uint8Array | string;
  readonly contentType: string;
}

export interface SendResult {
  readonly id: string;
  readonly status: 'sent' | 'queued' | 'failed';
  readonly channel: CommunicationChannel;
  readonly error?: string;
}

export interface InboundMessage {
  readonly from: string;
  readonly to: string;
  readonly channel: CommunicationChannel;
  readonly body: string;
  readonly receivedAt: Timestamp;
}

// ============================================================================
// SEARCH ADAPTERS
// ============================================================================

/**
 * Search adapter - for full-text and vector search.
 */
export interface SearchAdapter extends Adapter {
  readonly category: 'Search';
  readonly capabilities: readonly SearchCapability[];
  
  /** Index documents */
  index(documents: readonly SearchDocument[]): Promise<void>;
  
  /** Search */
  search(query: SearchQuery): Promise<SearchResult>;
  
  /** Delete from index */
  delete(ids: readonly string[]): Promise<void>;
  
  /** Vector search (if supported) */
  vectorSearch?(embedding: readonly number[], limit?: number): Promise<SearchResult>;
}

export type SearchCapability = 'fulltext' | 'fuzzy' | 'vector' | 'facets' | 'highlights';

export interface SearchDocument {
  readonly id: string;
  readonly content: Record<string, unknown>;
  readonly embedding?: readonly number[];
}

export interface SearchQuery {
  readonly query: string;
  readonly filters?: Record<string, unknown>;
  readonly limit?: number;
  readonly offset?: number;
}

export interface SearchResult {
  readonly hits: readonly SearchHit[];
  readonly total: number;
  readonly took: number;
}

export interface SearchHit {
  readonly id: string;
  readonly score: number;
  readonly content: Record<string, unknown>;
  readonly highlights?: Record<string, readonly string[]>;
}

// ============================================================================
// QUEUE ADAPTERS
// ============================================================================

/**
 * Queue adapter - for async processing.
 */
export interface QueueAdapter extends Adapter {
  readonly category: 'Queue';
  
  /** Publish a message */
  publish(queue: string, message: QueueMessage): Promise<void>;
  
  /** Subscribe to a queue */
  subscribe(queue: string, handler: QueueHandler): Promise<QueueSubscription>;
  
  /** Acknowledge a message */
  ack(messageId: string): Promise<void>;
  
  /** Reject/requeue a message */
  nack(messageId: string, requeue?: boolean): Promise<void>;
}

export interface QueueMessage {
  readonly body: unknown;
  readonly attributes?: Record<string, string>;
  readonly delaySeconds?: number;
}

export interface QueueSubscription {
  readonly id: string;
  unsubscribe(): Promise<void>;
}

export type QueueHandler = (message: ReceivedMessage) => Promise<void>;

export interface ReceivedMessage {
  readonly id: string;
  readonly body: unknown;
  readonly attributes?: Record<string, string>;
  readonly receivedAt: Timestamp;
  readonly retryCount: number;
}

// ============================================================================
// ADAPTER REGISTRY
// ============================================================================

/**
 * Registry of all configured adapters.
 */
export interface AdapterRegistry {
  /** Register an adapter */
  register<T extends Adapter>(adapter: T): void;
  
  /** Get adapter by category */
  get<T extends Adapter>(category: AdapterCategory): T | null;
  
  /** Get all adapters of a category */
  getAll<T extends Adapter>(category: AdapterCategory): readonly T[];
  
  /** Initialize all adapters */
  initializeAll(): Promise<void>;
  
  /** Health check all adapters */
  healthCheckAll(): Promise<Record<string, AdapterHealth>>;
  
  /** Shutdown all adapters */
  shutdownAll(): Promise<void>;
}

export type AdapterCategory = 
  | 'EventStore'
  | 'LLM'
  | 'Payment'
  | 'Identity'
  | 'Storage'
  | 'Communication'
  | 'Search'
  | 'Queue';

export function createAdapterRegistry(): AdapterRegistry {
  const adapters = new Map<AdapterCategory, Adapter[]>();
  
  return {
    register<T extends Adapter>(adapter: T): void {
      const category = (adapter as any).category as AdapterCategory;
      if (!adapters.has(category)) {
        adapters.set(category, []);
      }
      adapters.get(category)!.push(adapter);
    },
    
    get<T extends Adapter>(category: AdapterCategory): T | null {
      const list = adapters.get(category);
      return (list?.[0] as T) ?? null;
    },
    
    getAll<T extends Adapter>(category: AdapterCategory): readonly T[] {
      return (adapters.get(category) as T[]) ?? [];
    },
    
    async initializeAll(): Promise<void> {
      for (const list of adapters.values()) {
        for (const adapter of list) {
          // Config would come from environment
          await adapter.initialize({} as AdapterConfig);
        }
      }
    },
    
    async healthCheckAll(): Promise<Record<string, AdapterHealth>> {
      const results: Record<string, AdapterHealth> = {};
      for (const [category, list] of adapters) {
        for (const adapter of list) {
          results[`${category}:${adapter.name}`] = await adapter.healthCheck();
        }
      }
      return results;
    },
    
    async shutdownAll(): Promise<void> {
      for (const list of adapters.values()) {
        for (const adapter of list) {
          await adapter.shutdown();
        }
      }
    },
  };
}

