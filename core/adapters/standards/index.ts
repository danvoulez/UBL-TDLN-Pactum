/**
 * INDUSTRY STANDARDS
 * 
 * These are the universal languages that platforms speak.
 * By supporting these standards, we're compatible with:
 * 
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                           UNIVERSAL STANDARDS                               │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │  CLOUDEVENTS (CNCF)                                                        │
 * │  ─────────────────                                                         │
 * │  Standard event format supported by:                                       │
 * │  • AWS EventBridge                                                         │
 * │  • Google Cloud Eventarc                                                   │
 * │  • Azure Event Grid                                                        │
 * │  • Knative                                                                 │
 * │  • Apache Kafka                                                            │
 * │                                                                             │
 * │  Our ledger events ↔ CloudEvents = interop with any event system          │
 * │                                                                             │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │  OPENAPI (Swagger)                                                         │
 * │  ─────────────────                                                         │
 * │  Standard API specification supported by:                                  │
 * │  • Every API gateway (Kong, AWS API Gateway, Apigee)                      │
 * │  • Every documentation tool (Swagger UI, ReDoc)                           │
 * │  • Every code generator (OpenAPI Generator)                               │
 * │  • Every testing tool (Postman, Insomnia)                                 │
 * │                                                                             │
 * │  Our Intent API spec = discoverable, documented, SDK-ready                │
 * │                                                                             │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │  S3 API                                                                     │
 * │  ──────                                                                     │
 * │  De facto standard for object storage:                                     │
 * │  • AWS S3                                                                  │
 * │  • Cloudflare R2                                                           │
 * │  • Backblaze B2                                                            │
 * │  • MinIO                                                                   │
 * │  • Google Cloud Storage (S3 mode)                                         │
 * │  • DigitalOcean Spaces                                                     │
 * │                                                                             │
 * │  One adapter = works with ANY S3-compatible provider                       │
 * │                                                                             │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │  OAUTH 2.0 / OIDC                                                          │
 * │  ────────────────                                                          │
 * │  Standard identity protocol supported by:                                  │
 * │  • Auth0, Okta, Clerk                                                      │
 * │  • Google, Microsoft, GitHub                                               │
 * │  • Keycloak, FusionAuth                                                    │
 * │                                                                             │
 * │  Any OIDC provider = can authenticate to the ledger                        │
 * │                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

// CloudEvents - CNCF standard event format
export {
  type CloudEvent,
  type CloudEventsConfig,
  type CloudEventsSubscription,
  type CloudEventsFilter,
  toCloudEvent,
  fromCloudEvent,
  toCloudEventBatch,
  getStructuredHeaders,
  getBinaryHeaders,
  parseFromBinaryMode,
  SUBSCRIPTION_TEMPLATES,
  LEDGER_EVENT_TYPES,
} from './cloudevents';

// OpenAPI - API specification standard
export {
  generateOpenAPISpec,
  exportAsJSON,
  exportAsYAML,
  type OpenAPISpec,
  type OpenAPIOperation,
  type OpenAPIParameter,
  type OpenAPISchema,
} from './openapi';

// S3 - Object storage standard
export {
  createS3CompatibleAdapter,
  S3_PROVIDER_PRESETS,
  DOCUMENT_KEY_PATTERNS,
  contentAddressedKey,
  LIFECYCLE_POLICIES,
  createMultipartUpload,
  MIN_PART_SIZE,
  MAX_PART_SIZE,
  MAX_PARTS,
  type S3CompatibleConfig,
  type MultipartUpload,
  type UploadPart,
} from './s3';

// GraphQL - Query language standard
export {
  generateGraphQLSchema,
  generateFederatedSchema,
  RESOLVER_SCAFFOLD,
  DATALOADER_PATTERNS,
  CUSTOM_DIRECTIVES,
} from './graphql';

// gRPC - High-performance RPC standard
export {
  generateProtoFile,
  GRPC_REFLECTION,
  GRPC_WEB_CONFIG,
  INTERCEPTOR_PATTERNS,
  BUF_CONFIG,
} from './grpc';

// AMQP / Message Queues - Messaging standard
export {
  createAMQPAdapter,
  eventToAMQPMessage,
  amqpMessageToEvent,
  LEDGER_TOPOLOGY,
  // Kafka
  KAFKA_TOPICS,
  getKafkaKey,
  getKafkaHeaders,
  // AWS SQS/SNS
  eventToSQSMessage,
  SNS_TOPICS,
  // Google Pub/Sub
  eventToPubSubMessage,
  PUBSUB_CONFIG,
  // Redis Streams
  REDIS_STREAMS,
  // NATS
  NATS_SUBJECTS,
  eventToNATSMessage,
  type AMQPConfig,
  type AMQPMessageProperties,
  type AMQPExchangeType,
  type SQSMessage,
  type PubSubMessage,
} from './amqp';

