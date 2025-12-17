/**
 * SDK TYPES - Interfaces for External Service Integration
 * 
 * All SDK adapters implement these interfaces.
 * The Ledger core remains decoupled from specific services.
 */

import type { EntityId, Timestamp, ActorReference } from '../core/shared/types';
import type { Event } from '../core/schema/ledger';

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
  | 'AWS' | 'GCP' | 'Azure' | 'Vercel' | 'Cloudflare'
  // Databases
  | 'PostgreSQL' | 'DynamoDB' | 'MongoDB' | 'Firestore' | 'Supabase' | 'PlanetScale'
  // AI/LLM
  | 'Anthropic' | 'OpenAI' | 'Google_AI' | 'Cohere' | 'Mistral' | 'Local_LLM'
  // Payments
  | 'Stripe' | 'Square' | 'PayPal' | 'Adyen' | 'MercadoPago'
  // Identity
  | 'Auth0' | 'Okta' | 'Clerk' | 'Firebase_Auth' | 'Supabase_Auth' | 'Keycloak'
  // Communication
  | 'Twilio' | 'SendGrid' | 'Postmark' | 'Resend' | 'Slack' | 'Discord'
  // Storage
  | 'S3' | 'GCS' | 'Azure_Blob' | 'Cloudflare_R2' | 'Backblaze_B2'
  // Search
  | 'Elasticsearch' | 'Algolia' | 'Typesense' | 'Meilisearch' | 'Pinecone'
  // Queues
  | 'SQS' | 'PubSub' | 'RabbitMQ' | 'Redis' | 'Kafka'
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
// EVENT STORE ADAPTER
// ============================================================================

export interface EventStoreAdapter extends Adapter {
  readonly category: 'EventStore';
  append(events: readonly Event[]): Promise<void>;
  readAggregate(aggregateType: string, aggregateId: EntityId): Promise<readonly Event[]>;
  readAfter(sequence: bigint, limit?: number): Promise<readonly Event[]>;
  subscribe(handler: (event: Event) => Promise<void>): Promise<Subscription>;
  getCurrentSequence(): Promise<bigint>;
}

export interface Subscription {
  readonly id: string;
  unsubscribe(): Promise<void>;
}

// ============================================================================
// LLM ADAPTER
// ============================================================================

export interface LLMAdapter extends Adapter {
  readonly category: 'LLM';
  readonly model: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
  stream(request: LLMRequest): AsyncIterable<LLMChunk>;
  embed(texts: readonly string[]): Promise<readonly number[][]>;
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
// PAYMENT ADAPTER
// ============================================================================

export interface PaymentAdapter extends Adapter {
  readonly category: 'Payment';
  createPaymentIntent(request: PaymentIntentRequest): Promise<PaymentIntent>;
  confirmPayment(paymentIntentId: string): Promise<PaymentResult>;
  refund(paymentId: string, amount?: number): Promise<RefundResult>;
  createSubscription(request: SubscriptionRequest): Promise<SubscriptionResult>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  handleWebhook(payload: unknown, signature: string): Promise<PaymentEvent>;
}

export interface PaymentIntentRequest {
  readonly amount: number;
  readonly currency: string;
  readonly customerId?: string;
  readonly metadata?: Record<string, string>;
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
  toLedgerEvent(): Event | null;
}

// ============================================================================
// IDENTITY ADAPTER
// ============================================================================

export interface IdentityAdapter extends Adapter {
  readonly category: 'Identity';
  verifyToken(token: string): Promise<IdentityVerification>;
  getUserInfo(userId: string): Promise<UserInfo>;
  syncUser(entityId: EntityId, data: UserSyncData): Promise<void>;
  revokeSessions(userId: string): Promise<void>;
  handleCallback(code: string, state: string): Promise<AuthResult>;
  getLoginUrl(redirectUri: string, state?: string): string;
}

export interface IdentityVerification {
  readonly valid: boolean;
  readonly userId?: string;
  readonly entityId?: EntityId;
  readonly email?: string;
  readonly roles?: readonly string[];
  readonly expiresAt?: Timestamp;
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
// STORAGE ADAPTER
// ============================================================================

export interface StorageAdapter extends Adapter {
  readonly category: 'Storage';
  upload(request: UploadRequest): Promise<UploadResult>;
  download(key: string): Promise<DownloadResult>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<readonly StorageObject[]>;
  exists(key: string): Promise<boolean>;
}

export interface UploadRequest {
  readonly key: string;
  readonly content: Uint8Array | ReadableStream;
  readonly contentType: string;
  readonly metadata?: Record<string, string>;
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
// COMMUNICATION ADAPTER
// ============================================================================

export interface CommunicationAdapter extends Adapter {
  readonly category: 'Communication';
  readonly channels: readonly CommunicationChannel[];
  send(request: SendRequest): Promise<SendResult>;
  sendBatch(requests: readonly SendRequest[]): Promise<readonly SendResult[]>;
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
// ADAPTER REGISTRY
// ============================================================================

export type AdapterCategory = 
  | 'EventStore' | 'LLM' | 'Payment' | 'Identity' 
  | 'Storage' | 'Communication' | 'Search' | 'Queue';

export interface AdapterRegistry {
  register<T extends Adapter>(adapter: T): void;
  get<T extends Adapter>(category: AdapterCategory): T | null;
  getAll<T extends Adapter>(category: AdapterCategory): readonly T[];
  initializeAll(): Promise<void>;
  healthCheckAll(): Promise<Record<string, AdapterHealth>>;
  shutdownAll(): Promise<void>;
}

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

