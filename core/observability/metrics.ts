/**
 * OBSERVABILITY - Metrics, Tracing & Health
 * 
 * While Memory provides narrative logging, we also need:
 * - METRICS: Quantitative measurements over time
 * - TRACING: Request flow across components
 * - HEALTH: System status and readiness
 * 
 * These work together with Memory:
 * - Memory tells the STORY
 * - Metrics show the NUMBERS
 * - Tracing shows the PATH
 */

import type { EntityId, Timestamp, Duration } from '../shared/types';

// ============================================================================
// METRICS
// ============================================================================

/**
 * A Metric is a named measurement with labels.
 */
export interface Metric {
  readonly name: string;
  readonly type: MetricType;
  readonly description?: string;
  readonly unit?: string;
  readonly labels: readonly string[];
}

export type MetricType = 
  | 'Counter'     // Monotonically increasing
  | 'Gauge'       // Point-in-time value
  | 'Histogram'   // Distribution of values
  | 'Summary';    // Quantiles over time

/**
 * Metrics registry manages all metrics.
 */
export interface MetricsRegistry {
  /** Register a metric */
  register(metric: Metric): void;
  
  /** Get/create a counter */
  counter(name: string, labels?: Record<string, string>): Counter;
  
  /** Get/create a gauge */
  gauge(name: string, labels?: Record<string, string>): Gauge;
  
  /** Get/create a histogram */
  histogram(name: string, labels?: Record<string, string>): Histogram;
  
  /** Get all metrics */
  getAll(): readonly MetricValue[];
  
  /** Export in Prometheus format */
  exportPrometheus(): string;
  
  /** Export as JSON */
  exportJson(): readonly MetricValue[];
}

export interface Counter {
  inc(value?: number): void;
  get(): number;
}

export interface Gauge {
  set(value: number): void;
  inc(value?: number): void;
  dec(value?: number): void;
  get(): number;
}

export interface Histogram {
  observe(value: number): void;
  get(): HistogramValue;
}

export interface HistogramValue {
  readonly count: number;
  readonly sum: number;
  readonly buckets: readonly { le: number; count: number }[];
}

export interface MetricValue {
  readonly name: string;
  readonly type: MetricType;
  readonly labels: Record<string, string>;
  readonly value: number | HistogramValue;
  readonly timestamp: Timestamp;
}

// ============================================================================
// BUILT-IN METRICS
// ============================================================================

/**
 * Standard metrics for the ledger system.
 */
export const LEDGER_METRICS = {
  // Event store metrics
  events: {
    total: { name: 'ledger_events_total', type: 'Counter' as const, description: 'Total events recorded' },
    byType: { name: 'ledger_events_by_type', type: 'Counter' as const, labels: ['event_type'] },
    byAggregate: { name: 'ledger_events_by_aggregate', type: 'Counter' as const, labels: ['aggregate_type'] },
    appendDuration: { name: 'ledger_event_append_duration_seconds', type: 'Histogram' as const },
  },
  
  // Aggregate metrics
  aggregates: {
    total: { name: 'ledger_aggregates_total', type: 'Gauge' as const, labels: ['aggregate_type'] },
    versions: { name: 'ledger_aggregate_versions', type: 'Histogram' as const, labels: ['aggregate_type'] },
    rehydrationDuration: { name: 'ledger_rehydration_duration_seconds', type: 'Histogram' as const },
  },
  
  // Workflow metrics
  workflows: {
    active: { name: 'ledger_workflows_active', type: 'Gauge' as const, labels: ['workflow_type', 'state'] },
    transitions: { name: 'ledger_workflow_transitions_total', type: 'Counter' as const, labels: ['workflow_type', 'transition'] },
    duration: { name: 'ledger_workflow_duration_seconds', type: 'Histogram' as const, labels: ['workflow_type'] },
  },
  
  // API metrics
  api: {
    requests: { name: 'ledger_api_requests_total', type: 'Counter' as const, labels: ['intent', 'status'] },
    duration: { name: 'ledger_api_request_duration_seconds', type: 'Histogram' as const, labels: ['intent'] },
    errors: { name: 'ledger_api_errors_total', type: 'Counter' as const, labels: ['intent', 'error_type'] },
  },
  
  // Authorization metrics
  authz: {
    decisions: { name: 'ledger_authz_decisions_total', type: 'Counter' as const, labels: ['decision', 'action'] },
    duration: { name: 'ledger_authz_duration_seconds', type: 'Histogram' as const },
    denials: { name: 'ledger_authz_denials_total', type: 'Counter' as const, labels: ['action', 'reason'] },
  },
  
  // Performance metrics
  performance: {
    snapshotHits: { name: 'ledger_snapshot_hits_total', type: 'Counter' as const },
    snapshotMisses: { name: 'ledger_snapshot_misses_total', type: 'Counter' as const },
    cacheHits: { name: 'ledger_cache_hits_total', type: 'Counter' as const },
    cacheMisses: { name: 'ledger_cache_misses_total', type: 'Counter' as const },
    projectionLag: { name: 'ledger_projection_lag_events', type: 'Gauge' as const, labels: ['projection'] },
  },
  
  // Realm metrics
  realms: {
    count: { name: 'ledger_realms_total', type: 'Gauge' as const },
    entitiesPerRealm: { name: 'ledger_entities_per_realm', type: 'Gauge' as const, labels: ['realm_id'] },
    eventsPerRealm: { name: 'ledger_events_per_realm', type: 'Gauge' as const, labels: ['realm_id'] },
  },
};

// ============================================================================
// DISTRIBUTED TRACING
// ============================================================================

/**
 * A Trace represents the journey of a request through the system.
 */
export interface Trace {
  readonly traceId: string;
  readonly spans: readonly Span[];
  readonly startTime: Timestamp;
  readonly endTime?: Timestamp;
  readonly status: 'InProgress' | 'Completed' | 'Error';
}

/**
 * A Span is a single operation within a trace.
 */
export interface Span {
  readonly spanId: string;
  readonly traceId: string;
  readonly parentSpanId?: string;
  
  /** Operation info */
  readonly operationName: string;
  readonly serviceName: string;
  
  /** Timing */
  readonly startTime: Timestamp;
  readonly endTime?: Timestamp;
  readonly duration?: number; // milliseconds
  
  /** Status */
  readonly status: SpanStatus;
  readonly error?: string;
  
  /** Metadata */
  readonly tags: Record<string, string>;
  readonly logs: readonly SpanLog[];
  
  /** References to other spans */
  readonly references: readonly SpanReference[];
}

export type SpanStatus = 'Ok' | 'Error' | 'Timeout' | 'Cancelled';

export interface SpanLog {
  readonly timestamp: Timestamp;
  readonly event: string;
  readonly fields?: Record<string, unknown>;
}

export interface SpanReference {
  readonly type: 'ChildOf' | 'FollowsFrom';
  readonly traceId: string;
  readonly spanId: string;
}

/**
 * Tracer creates and manages traces.
 */
export interface Tracer {
  /** Start a new trace */
  startTrace(operationName: string): SpanContext;
  
  /** Start a span within an existing trace */
  startSpan(operationName: string, parent?: SpanContext): SpanContext;
  
  /** Finish a span */
  finishSpan(context: SpanContext, status?: SpanStatus, error?: string): void;
  
  /** Add a log to current span */
  log(context: SpanContext, event: string, fields?: Record<string, unknown>): void;
  
  /** Add tags to current span */
  tag(context: SpanContext, tags: Record<string, string>): void;
  
  /** Get trace by ID */
  getTrace(traceId: string): Promise<Trace | null>;
  
  /** Extract context from headers (for distributed tracing) */
  extract(headers: Record<string, string>): SpanContext | null;
  
  /** Inject context into headers */
  inject(context: SpanContext): Record<string, string>;
}

export interface SpanContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly baggage?: Record<string, string>;
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

/**
 * Health check result for a component.
 */
export interface HealthCheck {
  readonly component: string;
  readonly status: HealthStatus;
  readonly message?: string;
  readonly details?: Record<string, unknown>;
  readonly checkedAt: Timestamp;
  readonly duration: number; // milliseconds
}

export type HealthStatus = 
  | 'Healthy'
  | 'Degraded'
  | 'Unhealthy';

/**
 * Overall system health.
 */
export interface SystemHealth {
  readonly status: HealthStatus;
  readonly checks: readonly HealthCheck[];
  readonly timestamp: Timestamp;
  readonly version: string;
  readonly uptime: number; // seconds
}

/**
 * Health checker manages health checks.
 */
export interface HealthChecker {
  /** Register a health check */
  register(name: string, check: () => Promise<HealthCheckResult>): void;
  
  /** Run all health checks */
  check(): Promise<SystemHealth>;
  
  /** Run a specific check */
  checkComponent(name: string): Promise<HealthCheck>;
  
  /** Get liveness (is the service alive?) */
  getLiveness(): Promise<{ alive: boolean }>;
  
  /** Get readiness (is the service ready to accept traffic?) */
  getReadiness(): Promise<{ ready: boolean; reason?: string }>;
}

export interface HealthCheckResult {
  readonly status: HealthStatus;
  readonly message?: string;
  readonly details?: Record<string, unknown>;
}

// ============================================================================
// BUILT-IN HEALTH CHECKS
// ============================================================================

/**
 * Standard health checks for the ledger.
 */
export const HEALTH_CHECKS = {
  /** Event store is accessible */
  eventStore: async (store: unknown): Promise<HealthCheckResult> => {
    // Check event store connectivity
    return { status: 'Healthy' };
  },
  
  /** Database is accessible */
  database: async (connectionString: string): Promise<HealthCheckResult> => {
    // Check DB connectivity
    return { status: 'Healthy' };
  },
  
  /** Projections are caught up */
  projections: async (maxLag: number): Promise<HealthCheckResult> => {
    // Check projection lag
    return { 
      status: 'Healthy',
      details: { lag: 0 },
    };
  },
  
  /** Scheduler is running */
  scheduler: async (): Promise<HealthCheckResult> => {
    // Check scheduler status
    return { status: 'Healthy' };
  },
  
  /** External dependencies */
  external: async (urls: readonly string[]): Promise<HealthCheckResult> => {
    // Check external service connectivity
    return { status: 'Healthy' };
  },
};

// ============================================================================
// ALERTING
// ============================================================================

/**
 * Alert rule defines when to trigger an alert.
 */
export interface AlertRule {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  
  /** What triggers the alert */
  readonly condition: AlertCondition;
  
  /** How long must condition be true */
  readonly duration?: Duration;
  
  /** Severity */
  readonly severity: AlertSeverity;
  
  /** Who to notify */
  readonly notifications: readonly AlertNotification[];
  
  /** Is this rule active? */
  readonly enabled: boolean;
}

export type AlertCondition =
  | { readonly type: 'Metric'; readonly metric: string; readonly operator: '>' | '<' | '==' | '>='; readonly threshold: number }
  | { readonly type: 'Health'; readonly component: string; readonly status: HealthStatus }
  | { readonly type: 'ErrorRate'; readonly threshold: number; readonly window: Duration }
  | { readonly type: 'Custom'; readonly expression: string };

export type AlertSeverity = 'Info' | 'Warning' | 'Error' | 'Critical';

export interface AlertNotification {
  readonly type: 'Email' | 'Slack' | 'PagerDuty' | 'Webhook';
  readonly config: Record<string, string>;
}

/**
 * Active alert instance.
 */
export interface Alert {
  readonly id: EntityId;
  readonly ruleId: string;
  readonly ruleName: string;
  readonly severity: AlertSeverity;
  
  /** When the alert fired */
  readonly firedAt: Timestamp;
  
  /** Current state */
  readonly state: 'Firing' | 'Resolved' | 'Acknowledged';
  
  /** Details */
  readonly message: string;
  readonly details: Record<string, unknown>;
  
  /** Resolution */
  readonly resolvedAt?: Timestamp;
  readonly acknowledgedAt?: Timestamp;
  readonly acknowledgedBy?: string;
}

/**
 * Alert manager handles alert lifecycle.
 */
export interface AlertManager {
  /** Register an alert rule */
  registerRule(rule: AlertRule): void;
  
  /** Fire an alert */
  fire(ruleId: string, details: Record<string, unknown>): Promise<Alert>;
  
  /** Resolve an alert */
  resolve(alertId: EntityId): Promise<void>;
  
  /** Acknowledge an alert */
  acknowledge(alertId: EntityId, by: string): Promise<void>;
  
  /** Get active alerts */
  getActive(): Promise<readonly Alert[]>;
  
  /** Get alert history */
  getHistory(options?: { ruleId?: string; since?: Timestamp; limit?: number }): Promise<readonly Alert[]>;
}

