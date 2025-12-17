/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                                                                           ║
 * ║                    UNIVERSAL LEDGER SYSTEM                                ║
 * ║                                                                           ║
 * ║   An append-only, immutable event store for business entities.            ║
 * ║   Built on Event Sourcing, CQRS, and Domain-Driven Design.                ║
 * ║                                                                           ║
 * ║   Core Principles:                                                        ║
 * ║   1. Events are immutable facts                                           ║
 * ║   2. State is derived from events                                         ║
 * ║   3. Agreements establish all relationships                               ║
 * ║   4. Roles are agreements, not attributes                                 ║
 * ║   5. Authorization is traceable and auditable                             ║
 * ║   6. Time flows forward; the past is immutable                            ║
 * ║                                                                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// ============================================================================
// CONFIGURATION - Centralized and validated
// ============================================================================

export {
  getConfig,
  getConfigValue,
  hasConfig,
  requireConfig,
  clearConfigCache,
  type Config,
} from './config';

// ============================================================================
// DATABASE - Modular and LLM-friendly
// ============================================================================

export {
  getDBConnection,
  createDBConnection,
  validateConnectionString,
  closeAllConnections,
  type DBConnection,
  type DBConnectionConfig,
} from './db/connection';

export {
  runMigrations,
  applyFullSchema,
  getAppliedMigrations,
  markMigrationApplied,
  ensureMigrationsTable,
  type Migration,
  MIGRATIONS,
} from './db/migrations';

export {
  validateSchema,
  validateMigrations,
  validateDatabaseEmpty,
  type SchemaValidationResult,
  type TableInfo,
  type ColumnInfo,
} from './db/validators';

export {
  dbError,
  extractPostgresError,
  DB_ERROR_CODES,
  type DBErrorContext,
  type DBErrorInfo,
} from './db/errors';

// ============================================================================
// API - Errors and validators
// ============================================================================

export {
  apiError,
  APIError,
  API_ERROR_CODES,
  type APIErrorContext,
  type APIErrorInfo,
} from './api/errors';

export {
  validateIntentRequest,
  validateIntent,
  validateApiKey,
  validateRealmId,
  validateEntityId,
} from './api/validators';

// ============================================================================
// SHARED PRIMITIVES - The foundation everything builds upon
// ============================================================================

export {
  // Types
  type SequenceNumber,
  type Timestamp,
  type Hash,
  type EntityId,
  type Duration as SharedDuration,
  type DurationUnit,
  type Validity,
  type Quantity,
  type ActorReference,
  type Condition,
  type Result,
  type AggregateType,
  type Scope,
  type ScopeType,
  type Causation as SharedCausation,
  
  // Functions
  asEntityId,
  generateId,
  Ids,
  durationToMs,
  isValidAt,
  scopeContains,
  describeActor,
  ok,
  err,
  
  // Constants
  PRIMORDIAL_SYSTEM_ID,
  PRIMORDIAL_REALM_ID,
  GENESIS_AGREEMENT_ID,
} from './shared';

// ============================================================================
// SCHEMA - Domain model definitions
// ============================================================================

export type {
  // Event System
  Event,
  Command,
  
  // Legacy types (for backward compatibility)
  Party,
  PartyType,
  PartyIdentity,
  PartyRegistered,
  PartyIdentityUpdated,
  PartyEvent,
  
  // Original Asset types
  Asset as LegacyAsset,
  AssetStatus,
  AssetCreated,
  AssetTransferred,
  AssetStatusChanged,
  AssetEvent,
  
  // Original Agreement types  
  Agreement as LegacyAgreement,
  AgreementStatus,
  AgreementParty,
  AgreementTerms,
  AgreementCreated,
  AgreementStatusChanged,
  ConsentGiven,
  AgreementFulfilled,
  DisputeOpened,
  DisputeResolved,
  EvidenceRef,
  AgreementEvent,
  
  // Original Role types
  Role as LegacyRole,
  RoleContext,
  RoleGranted,
  RoleRevoked,
  RoleEvent,
  
  // Union Types
  DomainEvent,
} from './schema/ledger';

// ============================================================================
// UNIVERSAL PRIMITIVES - The generalized domain model
// ============================================================================

export type {
  // Realm (multitenancy)
  Realm,
  RealmConfig,
  
  // Entity (generalized Party)
  Entity,
  EntityIdentity,
  Identifier,
  Contact,
  
  // Asset (with realm)
  Asset,
  
  // Agreement (universal contract)
  Agreement,
  AgreementParticipant,
  Obligation,
  Right,
  Terms,
  Clause,
  Consideration,
  Governance,
  AssetReference,
  
  // Role (agreement-based)
  Role,
  RoleScope,
  Permission,
  
  // Events
  EntityCreated,
  EntityUpdated,
  AssetRegistered,
  AssetStateChanged,
  AgreementProposed,
  ConsentRecorded,
  AgreementActivated,
  ObligationFulfilled,
  AgreementTerminated,
  RoleDelegated,
  RealmCreated,
  RealmConfigUpdated,
} from './universal/primitives';

export type {
  // Agreement Types
  AgreementTypeDefinition,
  AgreementTypeRegistry,
} from './universal/agreement-types';

export {
  BUILT_IN_AGREEMENT_TYPES as AGREEMENT_TYPES,
  createAgreementTypeRegistry,
} from './universal/agreement-types';

// Realm Manager - Now handled by ContainerManager
// Use: createContainerManager({ eventStore }).createRealm(name, owner, parentRealmId)
export { ContainerManager, createContainerManager, bootstrap } from './universal';

// ============================================================================
// WORKFLOW - State machine definitions and execution
// ============================================================================

export type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowState,
  WorkflowTransition,
  WorkflowAction,
  TransitionGuard,
  GuardCondition,
  ActorConstraint,
  WorkflowHistoryEntry,
  WorkflowInstanceCreated,
  WorkflowTransitioned,
  WorkflowCompleted,
  WorkflowEvent,
  
  FlowDefinition,
  FlowInstance,
  FlowStep,
  FlowStepBase,
  FlowWorkflowStep,
  FlowDecisionStep,
  FlowParallelStep,
  FlowWaitStep,
  FlowActionStep,
  FlowBranch,
  FlowErrorHandler,
  FlowHistoryEntry,
  FlowInstanceCreated,
  FlowStepExecuted,
  FlowCompleted,
  FlowEvent,
} from './schema/workflow';

// ============================================================================
// ENFORCEMENT - Rules, validation, and integrity
// ============================================================================

export type {
  HashChain,
  ChainVerificationResult,
  TemporalEnforcer,
  TemporalValidationResult,
  TemporalViolation,
  InvariantRule,
  InvariantCheckResult,
  CommandValidator,
  ValidationContext,
  CustomValidator,
  CommandValidationResult,
  ValidationError,
  GuardEvaluator,
  GuardContext,
  GuardEvaluationResult,
  AuditEntry,
  AuditTrailQuery,
  EnforcementSystem,
} from './enforcement/invariants';

export {
  createHashChain,
  createTemporalEnforcer,
  CORE_INVARIANTS,
} from './enforcement/invariants';

// ============================================================================
// STORE - Event persistence
// ============================================================================

export type {
  EventStore,
  EventInput,
  ReadOptions,
  EventFilter,
  AggregateRehydrator,
  Projection,
} from './store/event-store';

export {
  createInMemoryEventStore,
  reconstructAggregate,
} from './store/event-store';

// ============================================================================
// ENGINE - Workflow and flow execution
// ============================================================================

export type {
  WorkflowEngine,
  TransitionResult,
  TransitionError,
  AvailableTransition,
  WorkflowServices,
} from './engine/workflow-engine';

export {
  createWorkflowEngine,
  AGREEMENT_WORKFLOW,
  ASSET_WORKFLOW,
} from './engine/workflow-engine';

export type {
  FlowOrchestrator,
  FlowServices,
} from './engine/flow-orchestrator';

export {
  createFlowOrchestrator,
  SALE_FLOW,
} from './engine/flow-orchestrator';

// ============================================================================
// AGGREGATES - State reconstruction
// ============================================================================

export type {
  PartyState,
  AssetState,
  AgreementState,
  RoleState,
  WorkflowInstanceState,
  AggregateRepository,
  TemporalQueries,
} from './aggregates/rehydrators';

export {
  partyRehydrator,
  assetRehydrator,
  agreementRehydrator,
  roleRehydrator,
  workflowRehydrator,
  createAggregateRepository,
  createTemporalQueries,
} from './aggregates/rehydrators';

// ============================================================================
// API - Intent-driven interface
// ============================================================================

export type {
  Intent,
  IntentResult,
  IntentHandler,
  IntentRegistry,
  IntentDefinition,
  Affordance,
  IntentError,
  Outcome,
  EventReference,
  ExpectedOutcome,
  ValidationResult,
  Explanation,
  IntentContext,
  HandlerContext,
} from './api/intent-api';

export {
  BUILT_IN_INTENTS,
  INTENT_ALIASES,
} from './api/intent-api';

export type {
  Query,
  QueryResult,
  QueryBuilder,
  Selection,
  Condition as QueryCondition,
  Inclusion,
  OrderBy,
  Pagination,
  Aggregation,
  PageInfo,
  QueryMeta,
  Subscription,
  SubscriptionResult,
} from './api/query-language';

export {
  QueryBuilder as QB,
  QUERY_EXAMPLES,
} from './api/query-language';

// ============================================================================
// REALTIME - WebSocket and SSE streaming
// ============================================================================

export type {
  SubscriptionRequest,
  SubscriptionType,
  SubscriptionFilters,
  SubscriptionMessage,
  EventMessage,
  StateChangeMessage,
  WorkflowMessage,
  AffordanceMessage,
  QueryResultMessage,
  ErrorMessage,
  HeartbeatMessage,
  ClientMessage,
  ServerMessage,
  WebSocketServer,
  WebSocketServerConfig,
  SSEServerConfig,
  SSEStream,
  SSEEvent,
  SSEEndpoint,
  SSEConnectionRequest,
} from './api/realtime';

export {
  createWebSocketServer,
  createSSEEndpoint,
  STREAMING_PATTERNS,
} from './api/realtime';

// ============================================================================
// SECURITY - Authentication, Authorization, and Policies
// ============================================================================

// Authentication - "Who are you?"
export type {
  AuthenticationMethod,
  Credential,
  AuthenticationRequest as AuthRequest,
  AuthenticationResult,
  AuthenticationError,
  Session,
  SessionManager,
  TokenPayload,
  TokenPair,
  TokenManager,
  MFAMethod,
  MFAConfig,
  MFAVerification,
  ApiKey,
  AuthConfig,
  AuthenticationEngine,
  AuthenticationEventType,
  AuthenticatedContext,
} from './security/authentication';

export {
  createAuthenticationEngine,
  createAuthEvent,
  extractBearerToken,
  extractApiKey,
  authenticateRequest,
} from './security/authentication';

// Authorization - "What can you do?"
export type {
  AuthorizationRequest,
  AuthorizationDecision,
  AuthorizationEngine,
  AuthorizationContext,
  AuthorizationAudit,
  Action,
  ActionType,
  Resource,
  ResourceType,
  DecisionReason,
  PermissionGrant,
  EvaluatedRole,
  EvaluatedCondition,
  EffectivePermission,
  PermissionCondition,
  AuditQuery,
  RoleStore,
  PolicyEngine,
  PolicyDecision,
  AuthorizationAuditLogger,
} from './security/authorization';

export {
  createAuthorizationEngine,
  PERMISSION_SETS,
  ROLE_TEMPLATES,
} from './security/authorization';

export type {
  Policy,
  PolicyConditions,
  ActorCondition,
  ResourceCondition,
  ContextCondition,
  TemporalCondition as PolicyTemporalCondition,
  RoleCondition,
  PolicyEffect,
  PolicyRule,
  PolicyRuleCondition,
  PolicyEvaluationEntry,
  PolicyRuleEvaluator,
} from './security/policies';

export {
  createPolicyEngine,
  BUILT_IN_POLICIES,
} from './security/policies';

export type {
  SecurityMemoryIntegration,
  SecurityContext,
  PolicyEvaluationMemory,
  SecurityAnomalyData,
  SecurityAnomalyType,
  RoleChangeMemory,
} from './security/audit-integration';

export {
  createSecurityMemoryIntegration,
} from './security/audit-integration';

// ============================================================================
// TRAJECTORY - System audit trail (not agent memory!)
// ============================================================================

export type {
  // Trace types
  Trace as TrajectoryTrace,
  TraceClassification,
  TraceCategory,
  SystemLayer,
  TraceContent,
  TechnicalDetails,
  Causation as TrajectoryCausation,
  CausalReference,
  Significance,
  SignificanceLevel,
  RetentionPolicy,
  Perspective,
  ViewerType,
  PerspectiveView,
  Duration as TrajectoryDuration,
  
  // Trajectory former
  TrajectoryFormer,
  TrajectoryContext,
  Observation,
  MilestoneData,
  AnomalyData,
  ReflectionData,
  
  // Path types
  Path,
  PathSubject,
  Segment,
  Scene,
  Change,
  Highlight,
  Pattern,
  PathBuilder,
  TraceStore,
  TraceQuery,
  Guide,
  CausalExplanation,
  
  // Logger
  Logger as TrajectoryLogger,
  LogLevel as TrajectoryLogLevel,
  LogContext as TrajectoryLogContext,
} from './trajectory';

export {
  createTrajectoryFormer,
  createPathBuilder,
  createGuide,
  createLogger,
} from './trajectory';

// ============================================================================
// AGENT - Moved to antenna/
// ============================================================================
// The conversational AI agent is now in the antenna/ module.
// import { ... } from '../antenna';

// ============================================================================
// SDK - Moved to sdk/
// ============================================================================
// External service adapters are now in the sdk/ module.
// import { ... } from '../sdk';

// ============================================================================
// EVOLUTION - Schema versioning & migrations
// ============================================================================

export type {
  SchemaVersion,
  SchemaRegistry,
  VersionedEvent,
  Upcaster,
  UpcasterChain,
  Migration as EvolutionMigration,
  MigrationRunner,
  MigrationResult,
  MigrationPreview,
  MigrationRecord,
  MigrationError,
  AggregateVersion,
  AggregateVersionManager,
  Deprecation,
  DeprecationRegistry,
} from './evolution/versioning';

export {
  createUpcasterChain,
  EXAMPLE_UPCASTERS,
} from './evolution/versioning';

// ============================================================================
// PERFORMANCE - Snapshots, projections & caching
// ============================================================================

export type {
  Snapshot,
  SnapshotStore,
  SnapshotPolicy,
  SnapshotLoader,
  LoadOptions,
  LoadResult,
  Projection as ProjectionView,
  ProjectionQuery,
  ProjectionManager,
  ProjectionStatus,
  RebuildResult,
  AggregateCache,
  CacheStats,
  CachePolicy,
} from './performance/snapshots';

export {
  DEFAULT_SNAPSHOT_POLICY,
  EXAMPLE_PROJECTION_ACTIVE_AGREEMENTS,
  EXAMPLE_PROJECTION_DAILY_SUMMARY,
} from './performance/snapshots';

// ============================================================================
// DISTRIBUTED - Sagas, cross-realm & conflict resolution
// ============================================================================

export type {
  Saga,
  SagaStep,
  StepResult,
  SagaExecution,
  SagaState,
  SagaError,
  SagaCoordinator,
  CrossRealmOperation,
  CrossRealmOperationType,
  CrossRealmState,
  CrossRealmGateway,
  CrossRealmReference,
  Conflict,
  ConflictType,
  ConflictStatus,
  ConflictResolution,
  ResolutionStrategy,
  ConflictResolver,
  ConflictResolverFn,
} from './distributed/saga';

export {
  HIRE_EMPLOYEE_SAGA,
  CROSS_REALM_SALE_SAGA,
} from './distributed/saga';

// ============================================================================
// SCHEDULING - Time-based triggers & deadlines
// ============================================================================

export type {
  ScheduledTask,
  TaskSchedule,
  RelativeAnchor,
  TaskState,
  TaskAction,
  EmitEventAction,
  ExecuteIntentAction,
  TriggerWorkflowAction,
  SendNotificationAction,
  CallWebhookAction,
  CustomAction,
  TaskContext,
  TaskExecution,
  RetryPolicy,
  Deadline,
  DeadlineSubject,
  DeadlineStage,
  StageTrigger,
  DeadlineState,
  Scheduler,
} from './scheduling/scheduler';

export {
  SCHEDULE_PATTERNS,
} from './scheduling/scheduler';

// ============================================================================
// ATTACHMENTS - Documents & digital signatures
// ============================================================================

export type {
  Document,
  DocumentType,
  StorageReference,
  DocumentAttachment,
  DocumentVisibility,
  DocumentSignature,
  SignatureAlgorithm,
  SignaturePurpose,
  SignatureCertificate,
  DocumentStore,
  DocumentMetadata,
  SignatureService,
  SignatureVerificationResult,
  DocumentVerificationResult,
  SignatureRequest,
  SignatureRequestRecord,
  DocumentTemplate,
  TemplateVariable as DocumentTemplateVariable,
  DocumentGenerator,
  ValidationResult as DocumentValidationResult,
} from './attachments/documents';

// ============================================================================
// OUTBOUND - Webhooks, notifications & integrations
// ============================================================================

export type {
  Webhook,
  WebhookAuth,
  WebhookFilters,
  WebhookTransform,
  WebhookRetryPolicy,
  WebhookState,
  WebhookStats,
  WebhookDelivery,
  WebhookManager,
  Notification,
  NotificationChannel,
  NotificationState,
  NotificationAction,
  NotificationTemplate,
  ChannelTemplate,
  NotificationService,
  Integration,
  IntegrationType,
  IntegrationCredentials,
  IntegrationTrigger,
  IntegrationManager,
  ConnectionTestResult,
  SyncResult,
} from './outbound/integrations';

export {
  BUILT_IN_TEMPLATES as NOTIFICATION_TEMPLATES,
} from './outbound/integrations';

// ============================================================================
// OBSERVABILITY - Metrics, tracing & health
// ============================================================================

export type {
  Metric,
  MetricType,
  MetricsRegistry,
  Counter,
  Gauge,
  Histogram,
  HistogramValue,
  MetricValue,
  Trace as ObservabilityTrace,
  Span,
  SpanStatus,
  SpanLog,
  SpanReference,
  Tracer,
  SpanContext,
  HealthCheck,
  HealthStatus,
  SystemHealth,
  HealthChecker,
  HealthCheckResult,
  AlertRule,
  AlertCondition,
  AlertSeverity,
  AlertNotification,
  Alert,
  AlertManager,
} from './observability/metrics';

export {
  LEDGER_METRICS,
  HEALTH_CHECKS,
} from './observability/metrics';

// ============================================================================
// OPERATIONAL - Rate limits, quotas, export & archival
// ============================================================================

export type {
  RateLimit,
  RateLimitScope,
  RateLimitAction,
  RateLimitState,
  RateLimiter,
  RateLimitCheckResult,
  Quota,
  QuotaResource,
  QuotaAction,
  OveragePricing,
  QuotaUsage,
  QuotaManager,
  QuotaCheckResult,
  ExportRequest,
  ExportType,
  ExportScope,
  ExportFormat,
  ExportState,
  ExportResult,
  ExportService,
  ArchivalPolicy,
  ArchivalScope,
  ArchivalDestination,
  ArchivalAction,
  ArchivedBatch,
  ArchivalManager,
  ArchivalResult,
  RestoreResult,
  VerificationResult,
  RetentionPolicy as DataRetentionPolicy,
  RetentionScope,
  RetentionAction,
  RetentionManager,
  DeletionEligibility,
  RetentionProcessingResult,
} from './operational/governance';

// ============================================================================
// TEMPLATES - Agreement & workflow templates
// ============================================================================

export type {
  AgreementTemplate,
  TemplateCategory,
  TemplateVisibility,
  TemplateStructure,
  PartyRoleTemplate,
  ObligationTemplate,
  RightTemplate,
  TermsTemplate,
  ClauseTemplate,
  ConsiderationTemplate,
  AssetRoleTemplate,
  ValidityTemplate,
  TemplateVariable,
  VariableType,
  VariableOption,
  VariableValidation,
  TemplateValidation,
  TemplateRegistry,
  InstantiationResult,
  ValidationResult as TemplateValidationResult,
  PreviewResult,
  ClauseLibraryEntry,
  ClauseLibrary,
  WorkflowTemplate,
} from './templates/registry';

export {
  BUILT_IN_TEMPLATES as AGREEMENT_TEMPLATES,
} from './templates/registry';

// ============================================================================
// SEARCH - Full-text & semantic search
// ============================================================================

export type {
  SearchQuery,
  SearchType,
  SearchFilters,
  HighlightConfig,
  SearchSort,
  SearchResults,
  SearchHit,
  SearchableDocument,
  FacetValue,
  SearchMeta,
  SearchEngine,
  SuggestOptions,
  Suggestion,
  BulkIndexResult,
  ReindexResult,
  IndexStats,
  SemanticSearchEngine,
  SemanticSearchOptions,
  SemanticSearchResults,
  SemanticHit,
  SimilarityOptions,
  SearchIndexer,
  FieldMapping,
  FieldType,
} from './search/engine';

export {
  SEARCH_MAPPINGS,
} from './search/engine';

// ============================================================================
// TESTING - Time-travel, fixtures & property tests
// ============================================================================

export type {
  TimeTravelHarness,
  StateDiff,
  FieldChange,
  TestFixture,
  FixtureEvent,
  FixtureAggregate,
  FixtureManager,
  FixtureLoadResult,
  TestFactory,
  FactoryRegistry,
  FactoryDefinition,
  PropertyTest,
  PropertyGenerator,
  PropertyVerifier,
  PropertyResult,
  PropertyTestRunner,
  PropertyTestResult,
  PropertyTestSuiteResult,
  InvariantChecker,
  Invariant as TestInvariant,
  InvariantCheckResult as TestInvariantCheckResult,
  ScenarioBuilder,
  ScenarioResult,
  StepResult as ScenarioStepResult,
} from './testing/harness';

export {
  TestAssertions,
  BUILT_IN_FIXTURES,
  BUILT_IN_INVARIANTS,
} from './testing/harness';

// ============================================================================
// FACTORY - System bootstrap
// ============================================================================

import { createInMemoryEventStore } from './store/event-store';
import { createWorkflowEngine, AGREEMENT_WORKFLOW, ASSET_WORKFLOW } from './engine/workflow-engine';
import { createFlowOrchestrator } from './engine/flow-orchestrator';
import { createAggregateRepository, createTemporalQueries } from './aggregates/rehydrators';
import type { EventStore } from './store/event-store';
import type { WorkflowEngine } from './engine/workflow-engine';
import type { FlowOrchestrator, FlowServices } from './engine/flow-orchestrator';
import type { AggregateRepository, TemporalQueries } from './aggregates/rehydrators';

export interface UniversalLedger {
  readonly eventStore: EventStore;
  readonly workflowEngine: WorkflowEngine;
  readonly flowOrchestrator: FlowOrchestrator;
  readonly aggregates: AggregateRepository;
  readonly temporal: TemporalQueries;
}

/**
 * Create a complete Universal Ledger system.
 * 
 * This is the main entry point for bootstrapping the ledger.
 * For production, provide custom services and use PostgreSQL event store.
 * 
 * @example
 * ```typescript
 * // Development (in-memory)
 * const ledger = createUniversalLedger();
 * 
 * // Production
 * const ledger = createUniversalLedger({
 *   eventStore: createPostgresEventStore(connectionString),
 *   services: productionServices,
 * });
 * ```
 */
export function createUniversalLedger(
  customServices?: Partial<FlowServices>
): UniversalLedger {
  const eventStore = createInMemoryEventStore();
  
  // Default services implementation
  const defaultServices: FlowServices = {
    async getAggregate(type, id) {
      const repo = createAggregateRepository(eventStore);
      switch (type) {
        case 'Party': return repo.getParty(id);
        case 'Asset': return repo.getAsset(id);
        case 'Agreement': return repo.getAgreement(id);
        case 'Role': return repo.getRole(id);
        case 'Workflow': return repo.getWorkflowInstance(id);
        default: return null;
      }
    },
    async getActorRoles(actor) {
      if (actor.type !== 'Party') return [];
      const repo = createAggregateRepository(eventStore);
      const roles = await repo.getActiveRolesForParty(actor.partyId);
      return roles.map(r => r.roleType);
    },
    async getAgreementParties(agreementId) {
      const repo = createAggregateRepository(eventStore);
      const agreement = await repo.getAgreement(agreementId);
      if (!agreement) return [];
      return agreement.parties.map(p => ({ partyId: p.partyId, role: p.role }));
    },
    async executeCustomValidator(validatorId, params) {
      console.log(`Custom validator: ${validatorId}`, params);
      return true;
    },
    async executeCustomHandler(handlerId, params) {
      console.log(`Custom handler: ${handlerId}`, params);
    },
    async sendNotification(partyId, template, data) {
      console.log(`Notification to ${partyId}: ${template}`, data);
    },
    async emitDomainEvent(eventType, payload) {
      console.log(`Domain event: ${eventType}`, payload);
    },
    ...customServices,
  };
  
  const workflowEngine = createWorkflowEngine(eventStore, defaultServices);
  const flowOrchestrator = createFlowOrchestrator(eventStore, workflowEngine, defaultServices);
  
  // Register default workflows
  workflowEngine.registerDefinition(AGREEMENT_WORKFLOW);
  workflowEngine.registerDefinition(ASSET_WORKFLOW);
  
  return {
    eventStore,
    workflowEngine,
    flowOrchestrator,
    aggregates: createAggregateRepository(eventStore),
    temporal: createTemporalQueries(eventStore),
  };
}

// Legacy alias
export const createTemporalLedger = createUniversalLedger;

// ============================================================================
// OBSERVABILITY - Structured Logging (Fase 4)
// ============================================================================

export { logger, generateTraceId, extractTraceId } from './observability/logger';
export type { Logger, LogContext, LogLevel } from './observability/logger';
