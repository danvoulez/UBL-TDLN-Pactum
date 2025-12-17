/**
 * GRPC / PROTOCOL BUFFERS STANDARD
 * 
 * gRPC is Google's high-performance RPC framework used by:
 * - Google Cloud services
 * - Kubernetes
 * - Envoy proxy
 * - Many microservices architectures
 * 
 * Benefits:
 * - Binary protocol (faster than JSON)
 * - Strongly typed with Protocol Buffers
 * - Streaming support (bidirectional)
 * - Code generation for any language
 * - Built-in load balancing
 * 
 * By providing .proto files, companies can:
 * - Generate clients in Go, Java, Python, C#, etc.
 * - Use with service meshes (Istio, Linkerd)
 * - Integrate with Kubernetes-native tooling
 */

// ============================================================================
// PROTOCOL BUFFER DEFINITIONS
// ============================================================================

/**
 * Generate Protocol Buffer definitions for the Universal Ledger.
 */
export function generateProtoFile(): string {
  return `
syntax = "proto3";

package universalledger.v1;

option go_package = "github.com/universalledger/proto/v1;ledgerv1";
option java_package = "io.universalledger.proto.v1";
option java_multiple_files = true;

import "google/protobuf/timestamp.proto";
import "google/protobuf/struct.proto";
import "google/protobuf/empty.proto";

// ============================================================================
// COMMON TYPES
// ============================================================================

// Unique identifier with type prefix
message EntityId {
  string value = 1;
}

// Monetary value
message Money {
  int64 amount = 1;  // In smallest unit (cents)
  string currency = 2;
}

// Time range
message Validity {
  google.protobuf.Timestamp effective_from = 1;
  google.protobuf.Timestamp effective_until = 2;
}

// Actor who performed an action
message Actor {
  oneof actor {
    EntityId entity_id = 1;
    string system_id = 2;
  }
}

// ============================================================================
// ENTITY
// ============================================================================

enum EntityType {
  ENTITY_TYPE_UNSPECIFIED = 0;
  ENTITY_TYPE_PERSON = 1;
  ENTITY_TYPE_ORGANIZATION = 2;
  ENTITY_TYPE_SYSTEM = 3;
  ENTITY_TYPE_DEPARTMENT = 4;
}

message Entity {
  EntityId id = 1;
  EntityType type = 2;
  EntityIdentity identity = 3;
  EntityId realm_id = 4;
  google.protobuf.Timestamp created_at = 5;
  google.protobuf.Timestamp updated_at = 6;
}

message EntityIdentity {
  string name = 1;
  repeated Identifier identifiers = 2;
  repeated Contact contacts = 3;
}

message Identifier {
  string type = 1;
  string value = 2;
  string issued_by = 3;
  google.protobuf.Timestamp valid_until = 4;
}

message Contact {
  string type = 1;
  string value = 2;
  bool verified = 3;
}

// ============================================================================
// AGREEMENT
// ============================================================================

enum AgreementStatus {
  AGREEMENT_STATUS_UNSPECIFIED = 0;
  AGREEMENT_STATUS_DRAFT = 1;
  AGREEMENT_STATUS_PROPOSED = 2;
  AGREEMENT_STATUS_ACTIVE = 3;
  AGREEMENT_STATUS_SUSPENDED = 4;
  AGREEMENT_STATUS_TERMINATED = 5;
  AGREEMENT_STATUS_FULFILLED = 6;
  AGREEMENT_STATUS_EXPIRED = 7;
}

message Agreement {
  EntityId id = 1;
  string type = 2;
  AgreementStatus status = 3;
  repeated AgreementParty parties = 4;
  Terms terms = 5;
  repeated AssetReference assets = 6;
  Validity validity = 7;
  EntityId realm_id = 8;
  google.protobuf.Timestamp created_at = 9;
  google.protobuf.Timestamp activated_at = 10;
  google.protobuf.Timestamp terminated_at = 11;
  
  // Workflow state
  string workflow_state = 12;
  repeated string available_transitions = 13;
}

message AgreementParty {
  EntityId entity_id = 1;
  string role = 2;
  Consent consent = 3;
  repeated Obligation obligations = 4;
  repeated Right rights = 5;
}

message Consent {
  google.protobuf.Timestamp given_at = 1;
  string method = 2;
  google.protobuf.Struct evidence = 3;
}

message Terms {
  string description = 1;
  repeated Clause clauses = 2;
  Consideration consideration = 3;
}

message Clause {
  string id = 1;
  string type = 2;
  string title = 3;
  string content = 4;
}

message Consideration {
  string description = 1;
  Money value = 2;
}

message Obligation {
  string id = 1;
  string description = 2;
  google.protobuf.Timestamp deadline = 3;
  bool fulfilled = 4;
  google.protobuf.Timestamp fulfilled_at = 5;
}

message Right {
  string id = 1;
  string description = 2;
  repeated string conditions = 3;
}

message AssetReference {
  EntityId asset_id = 1;
  string role = 2;
}

// ============================================================================
// ASSET
// ============================================================================

enum AssetStatus {
  ASSET_STATUS_UNSPECIFIED = 0;
  ASSET_STATUS_ACTIVE = 1;
  ASSET_STATUS_RESERVED = 2;
  ASSET_STATUS_TRANSFERRED = 3;
  ASSET_STATUS_ARCHIVED = 4;
  ASSET_STATUS_DISPOSED = 5;
}

message Asset {
  EntityId id = 1;
  string type = 2;
  AssetStatus status = 3;
  EntityId owner_id = 4;
  google.protobuf.Struct properties = 5;
  EntityId realm_id = 6;
  google.protobuf.Timestamp created_at = 7;
}

// ============================================================================
// ROLE
// ============================================================================

enum RoleStatus {
  ROLE_STATUS_UNSPECIFIED = 0;
  ROLE_STATUS_ACTIVE = 1;
  ROLE_STATUS_SUSPENDED = 2;
  ROLE_STATUS_REVOKED = 3;
  ROLE_STATUS_EXPIRED = 4;
}

message Role {
  EntityId id = 1;
  string type = 2;
  RoleStatus status = 3;
  EntityId holder_id = 4;
  EntityId established_by = 5;  // Agreement ID
  RoleScope scope = 6;
  repeated Permission permissions = 7;
  Validity validity = 8;
  google.protobuf.Timestamp created_at = 9;
}

message RoleScope {
  string type = 1;
  EntityId target_id = 2;
}

message Permission {
  string action = 1;
  string resource = 2;
  repeated string conditions = 3;
}

// ============================================================================
// EVENT
// ============================================================================

message Event {
  string id = 1;
  string type = 2;
  string aggregate_type = 3;
  EntityId aggregate_id = 4;
  google.protobuf.Timestamp timestamp = 5;
  Actor actor = 6;
  google.protobuf.Struct payload = 7;
  int64 sequence = 8;
  string hash = 9;
  EntityId realm_id = 10;
}

// ============================================================================
// INTENT (COMMANDS)
// ============================================================================

message Intent {
  string intent = 1;
  google.protobuf.Struct payload = 2;
  string idempotency_key = 3;
}

message IntentResult {
  bool success = 1;
  string intent = 2;
  Outcome outcome = 3;
  repeated Affordance affordances = 4;
  repeated string event_ids = 5;
  IntentError error = 6;
}

message Outcome {
  string type = 1;
  string aggregate_type = 2;
  EntityId aggregate_id = 3;
  google.protobuf.Struct data = 4;
}

message Affordance {
  string intent = 1;
  string description = 2;
  bool available = 3;
  string required_role = 4;
}

message IntentError {
  string code = 1;
  string message = 2;
  google.protobuf.Struct details = 3;
}

// ============================================================================
// SERVICE DEFINITIONS
// ============================================================================

// Main ledger service
service LedgerService {
  // Intent execution
  rpc ExecuteIntent(Intent) returns (IntentResult);
  
  // Entity operations
  rpc GetEntity(GetEntityRequest) returns (Entity);
  rpc ListEntities(ListEntitiesRequest) returns (ListEntitiesResponse);
  rpc GetEntityAtTime(GetAtTimeRequest) returns (Entity);
  
  // Agreement operations
  rpc GetAgreement(GetAgreementRequest) returns (Agreement);
  rpc ListAgreements(ListAgreementsRequest) returns (ListAgreementsResponse);
  rpc GetAgreementAtTime(GetAtTimeRequest) returns (Agreement);
  
  // Asset operations
  rpc GetAsset(GetAssetRequest) returns (Asset);
  rpc ListAssets(ListAssetsRequest) returns (ListAssetsResponse);
  
  // Role operations
  rpc GetRole(GetRoleRequest) returns (Role);
  rpc ListRoles(ListRolesRequest) returns (ListRolesResponse);
  
  // Event operations
  rpc GetEvents(GetEventsRequest) returns (GetEventsResponse);
  rpc StreamEvents(StreamEventsRequest) returns (stream Event);
  
  // Health
  rpc Health(google.protobuf.Empty) returns (HealthResponse);
}

// Streaming service for real-time updates
service StreamService {
  // Subscribe to events
  rpc Subscribe(SubscribeRequest) returns (stream Event);
  
  // Bidirectional streaming for chat/agent
  rpc Chat(stream ChatMessage) returns (stream ChatResponse);
}

// ============================================================================
// REQUEST/RESPONSE MESSAGES
// ============================================================================

message GetEntityRequest {
  EntityId id = 1;
}

message ListEntitiesRequest {
  EntityType type = 1;
  EntityId realm_id = 2;
  string search = 3;
  int32 page_size = 4;
  string page_token = 5;
}

message ListEntitiesResponse {
  repeated Entity entities = 1;
  string next_page_token = 2;
  int32 total_count = 3;
}

message GetAgreementRequest {
  EntityId id = 1;
}

message ListAgreementsRequest {
  string type = 1;
  AgreementStatus status = 2;
  EntityId party_id = 3;
  EntityId realm_id = 4;
  int32 page_size = 5;
  string page_token = 6;
}

message ListAgreementsResponse {
  repeated Agreement agreements = 1;
  string next_page_token = 2;
  int32 total_count = 3;
}

message GetAssetRequest {
  EntityId id = 1;
}

message ListAssetsRequest {
  string type = 1;
  AssetStatus status = 2;
  EntityId owner_id = 3;
  EntityId realm_id = 4;
  int32 page_size = 5;
  string page_token = 6;
}

message ListAssetsResponse {
  repeated Asset assets = 1;
  string next_page_token = 2;
  int32 total_count = 3;
}

message GetRoleRequest {
  EntityId id = 1;
}

message ListRolesRequest {
  string type = 1;
  RoleStatus status = 2;
  EntityId holder_id = 3;
  EntityId realm_id = 4;
}

message ListRolesResponse {
  repeated Role roles = 1;
}

message GetAtTimeRequest {
  string aggregate_type = 1;
  EntityId aggregate_id = 2;
  google.protobuf.Timestamp timestamp = 3;
}

message GetEventsRequest {
  string aggregate_type = 1;
  EntityId aggregate_id = 2;
  string event_type = 3;
  int64 after_sequence = 4;
  int32 limit = 5;
}

message GetEventsResponse {
  repeated Event events = 1;
  int64 last_sequence = 2;
}

message StreamEventsRequest {
  string aggregate_type = 1;
  EntityId aggregate_id = 2;
  repeated string event_types = 3;
  int64 start_sequence = 4;
}

message SubscribeRequest {
  repeated string event_types = 1;
  string aggregate_type = 2;
  EntityId aggregate_id = 3;
  EntityId realm_id = 4;
}

message ChatMessage {
  string session_id = 1;
  string message = 2;
  google.protobuf.Struct context = 3;
}

message ChatResponse {
  string session_id = 1;
  string message = 2;
  string detected_intent = 3;
  IntentResult intent_result = 4;
  repeated Affordance affordances = 5;
}

message HealthResponse {
  enum Status {
    STATUS_UNSPECIFIED = 0;
    STATUS_HEALTHY = 1;
    STATUS_DEGRADED = 2;
    STATUS_UNHEALTHY = 3;
  }
  Status status = 1;
  string version = 2;
  int64 uptime_seconds = 3;
  repeated ComponentHealth components = 4;
}

message ComponentHealth {
  string name = 1;
  HealthResponse.Status status = 2;
  int64 latency_ms = 3;
  string message = 4;
}
`.trim();
}

// ============================================================================
// GRPC SERVICE METADATA
// ============================================================================

/**
 * gRPC service reflection metadata for service discovery.
 */
export const GRPC_REFLECTION = {
  services: [
    'universalledger.v1.LedgerService',
    'universalledger.v1.StreamService',
  ],
  
  // Standard health check service
  healthService: 'grpc.health.v1.Health',
};

// ============================================================================
// GRPC-WEB SUPPORT
// ============================================================================

/**
 * Configuration for gRPC-Web (browser support via Envoy).
 */
export const GRPC_WEB_CONFIG = {
  // Envoy filter configuration
  envoyFilter: `
http_filters:
- name: envoy.filters.http.grpc_web
  typed_config:
    "@type": type.googleapis.com/envoy.extensions.filters.http.grpc_web.v3.GrpcWeb
- name: envoy.filters.http.cors
  typed_config:
    "@type": type.googleapis.com/envoy.extensions.filters.http.cors.v3.Cors
`,
  
  // Client configuration
  clientConfig: {
    // Use grpc-web protocol
    protocol: 'grpc-web-text',
    // Enable streaming (requires specific server support)
    streaming: true,
  },
};

// ============================================================================
// INTERCEPTORS
// ============================================================================

/**
 * Common gRPC interceptor patterns.
 */
export const INTERCEPTOR_PATTERNS = {
  // Authentication interceptor
  auth: `
async function authInterceptor(ctx, next) {
  const token = ctx.metadata.get('authorization')[0];
  if (!token) {
    throw new GrpcError('Unauthenticated', Status.UNAUTHENTICATED);
  }
  ctx.actor = await verifyToken(token);
  return next();
}
`,
  
  // Logging interceptor
  logging: `
async function loggingInterceptor(ctx, next) {
  const start = Date.now();
  try {
    const result = await next();
    logger.info({
      method: ctx.method,
      duration: Date.now() - start,
      status: 'OK',
    });
    return result;
  } catch (error) {
    logger.error({
      method: ctx.method,
      duration: Date.now() - start,
      error: error.message,
    });
    throw error;
  }
}
`,
  
  // Rate limiting interceptor
  rateLimiting: `
async function rateLimitInterceptor(ctx, next) {
  const key = ctx.actor?.id ?? ctx.peer;
  const allowed = await rateLimiter.check(key);
  if (!allowed) {
    throw new GrpcError('Rate limit exceeded', Status.RESOURCE_EXHAUSTED);
  }
  return next();
}
`,
};

// ============================================================================
// BUF CONFIGURATION
// ============================================================================

/**
 * Buf (modern protobuf tooling) configuration.
 * https://buf.build
 */
export const BUF_CONFIG = {
  'buf.yaml': `
version: v1
name: buf.build/universalledger/api
breaking:
  use:
    - FILE
lint:
  use:
    - DEFAULT
`,
  
  'buf.gen.yaml': `
version: v1
plugins:
  # Go
  - plugin: buf.build/protocolbuffers/go
    out: gen/go
    opt: paths=source_relative
  - plugin: buf.build/grpc/go
    out: gen/go
    opt: paths=source_relative
  
  # TypeScript
  - plugin: buf.build/community/timostamm-protobuf-ts
    out: gen/ts
  
  # Python
  - plugin: buf.build/protocolbuffers/python
    out: gen/python
  - plugin: buf.build/grpc/python
    out: gen/python
  
  # Java
  - plugin: buf.build/protocolbuffers/java
    out: gen/java
  - plugin: buf.build/grpc/java
    out: gen/java
`,
};

