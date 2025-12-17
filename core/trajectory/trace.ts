/**
 * TRAJECTORY TRACE - System Memory
 * 
 * In an event-sourced, audit-first system, logging IS the data.
 * Every event tells part of the trajectory. This module captures
 * those events into coherent traces that can be:
 * 
 * - Queried like any other data
 * - Viewed from different perspectives
 * - Traced causally (what caused what)
 * - Reconstructed at any point in time
 * - Told as human-readable trajectories
 * 
 * This is not traditional logging. This is system trajectory.
 */

import type { EntityId, Timestamp, Event, ActorReference, AggregateType } from '../schema/ledger';

// ============================================================================
// THE TRACE MODEL
// ============================================================================

/**
 * A Trace is a recorded moment in the system's existence.
 * Unlike traditional logs (just text), traces are structured,
 * connected, and meaningful.
 */
export interface Trace {
  /** Unique identifier */
  readonly id: EntityId;
  
  /** When this trace was captured */
  readonly timestamp: Timestamp;
  
  /** The event that created this trace (if event-triggered) */
  readonly eventId?: EntityId;
  
  /** The realm this trace belongs to */
  readonly realmId: EntityId;
  
  /** Classification */
  readonly classification: TraceClassification;
  
  /** The core content */
  readonly content: TraceContent;
  
  /** Causal chain - what led to this */
  readonly causation: Causation;
  
  /** How significant is this trace */
  readonly significance: Significance;
  
  /** Who might care about this trace */
  readonly perspectives: readonly Perspective[];
  
  /** How long to retain this trace */
  readonly retention: RetentionPolicy;
  
  /** Related entities */
  readonly relatedEntities: readonly EntityId[];
  
  /** Tags for filtering */
  readonly tags: readonly string[];
}

// ============================================================================
// CLASSIFICATION
// ============================================================================

export interface TraceClassification {
  /** Primary category */
  readonly category: TraceCategory;
  
  /** Which layer of the system */
  readonly layer: SystemLayer;
  
  /** More specific type within category */
  readonly type: string;
}

export type TraceCategory = 
  | 'Event'         // Business events
  | 'Decision'      // Choices made
  | 'Observation'   // Things noticed
  | 'Milestone'     // Achievements/thresholds
  | 'Anomaly'       // Unexpected things
  | 'Reflection';   // Analysis/summary

export type SystemLayer =
  | 'Business'      // Domain/business logic
  | 'Application'   // Application logic
  | 'Infrastructure'// Technical infrastructure
  | 'Security'      // Auth, permissions
  | 'Integration';  // External systems

// ============================================================================
// CONTENT
// ============================================================================

export interface TraceContent {
  /** Human-readable summary */
  readonly summary: string;
  
  /** Detailed description */
  readonly details?: string;
  
  /** Structured data */
  readonly data?: Record<string, unknown>;
  
  /** Technical details (usually hidden from business users) */
  readonly technical?: TechnicalDetails;
}

export interface TechnicalDetails {
  readonly component?: string;
  readonly function?: string;
  readonly duration?: number;
  readonly metrics?: Record<string, number>;
  readonly stackTrace?: string;
}

// ============================================================================
// CAUSATION - What caused this trace
// ============================================================================

export interface Causation {
  /** What directly triggered this */
  readonly trigger?: CausalReference;
  
  /** Chain of causes (most recent first) */
  readonly chain: readonly CausalReference[];
  
  /** Correlation ID for request tracing */
  readonly correlationId?: string;
  
  /** Span ID for distributed tracing */
  readonly spanId?: string;
}

export interface CausalReference {
  readonly type: 'Event' | 'Trace' | 'External' | 'Timer' | 'User';
  readonly id: EntityId;
  readonly description?: string;
}

// ============================================================================
// SIGNIFICANCE - How important is this trace
// ============================================================================

export interface Significance {
  /** Overall significance level */
  readonly level: SignificanceLevel;
  
  /** Why is it significant */
  readonly reasons: readonly string[];
  
  /** Business impact if applicable */
  readonly businessImpact?: 'Critical' | 'High' | 'Medium' | 'Low' | 'None';
}

export type SignificanceLevel =
  | 'Critical'    // System breaking, immediate attention
  | 'Important'   // Business significant, should be reviewed
  | 'Notable'     // Worth noting, part of the trajectory
  | 'Routine'     // Normal operations
  | 'Debug';      // Developer detail

// ============================================================================
// PERSPECTIVES - Who cares about this trace
// ============================================================================

export interface Perspective {
  /** Who would view this */
  readonly viewer: ViewerType;
  
  /** Custom view transformation */
  readonly view?: PerspectiveView;
}

export type ViewerType =
  | 'Developer'     // Technical details matter
  | 'Operator'      // Ops/monitoring focus
  | 'Business'      // Business outcomes focus
  | 'Auditor'       // Compliance focus
  | 'Customer';     // External party

export interface PerspectiveView {
  readonly summary: string;
  readonly details?: string;
  readonly hiddenFields?: readonly string[];
}

// ============================================================================
// RETENTION
// ============================================================================

export interface RetentionPolicy {
  readonly duration: Duration;
  readonly archiveAfter?: Duration;
  readonly deleteAfter?: Duration;
  readonly compliance?: readonly string[]; // Compliance requirements
}

export type Duration = 
  | { type: 'Forever' }
  | { type: 'Days'; days: number }
  | { type: 'Months'; months: number }
  | { type: 'Years'; years: number }
  | { type: 'UntilEvent'; eventType: string };

// ============================================================================
// TRAJECTORY FORMER - Creating traces from events
// ============================================================================

export interface TrajectoryFormer {
  /** Form a trace from an event */
  fromEvent(event: Event): Trace;
  
  /** Record an observation */
  observe(observation: Observation): Trace;
  
  /** Record a milestone */
  milestone(data: MilestoneData): Trace;
  
  /** Record an anomaly */
  anomaly(data: AnomalyData): Trace;
  
  /** Record a reflection/summary */
  reflect(data: ReflectionData): Trace;
}

export interface TrajectoryContext {
  readonly realmId: EntityId;
  readonly correlationId?: string;
  readonly spanId?: string;
  readonly actor?: ActorReference;
  readonly tags?: readonly string[];
}

export interface Observation {
  readonly what: string;
  readonly details?: string;
  readonly data?: Record<string, unknown>;
  readonly layer?: SystemLayer;
  readonly significance?: SignificanceLevel;
}

export interface MilestoneData {
  readonly name: string;
  readonly description: string;
  readonly metrics?: Record<string, number>;
  readonly threshold?: { metric: string; expected: number; actual: number };
}

export interface AnomalyData {
  readonly what: string;
  readonly expected: string;
  readonly actual: string;
  readonly severity: 'Critical' | 'Warning' | 'Info';
  readonly possibleCauses?: readonly string[];
}

export interface ReflectionData {
  readonly period: { start: Timestamp; end: Timestamp };
  readonly summary: string;
  readonly patterns?: readonly string[];
  readonly recommendations?: readonly string[];
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createTrajectoryFormer(context: TrajectoryContext): TrajectoryFormer {
  const baseTrace = (category: TraceCategory, type: string): Partial<Trace> => ({
    id: `trace-${Date.now()}-${Math.random().toString(36).slice(2)}` as EntityId,
    timestamp: Date.now() as Timestamp,
    realmId: context.realmId,
    causation: {
      chain: [],
      correlationId: context.correlationId,
      spanId: context.spanId,
    },
    tags: context.tags ? [...context.tags] : [],
  });

  return {
    fromEvent(event: Event): Trace {
      return {
        ...baseTrace('Event', event.type),
        eventId: event.id,
        classification: {
          category: 'Event',
          layer: 'Business',
          type: event.type,
        },
        content: {
          summary: `${event.type} on ${event.aggregateType}:${event.aggregateId}`,
          data: event.payload as Record<string, unknown>,
        },
        significance: {
          level: 'Notable',
          reasons: ['Business event recorded'],
        },
        perspectives: [
          { viewer: 'Business' },
          { viewer: 'Auditor' },
        ],
        retention: { duration: { type: 'Forever' } },
        relatedEntities: [event.aggregateId],
      } as Trace;
    },

    observe(observation: Observation): Trace {
      return {
        ...baseTrace('Observation', 'observation'),
        classification: {
          category: 'Observation',
          layer: observation.layer || 'Application',
          type: 'observation',
        },
        content: {
          summary: observation.what,
          details: observation.details,
          data: observation.data,
        },
        significance: {
          level: observation.significance || 'Routine',
          reasons: [],
        },
        perspectives: [{ viewer: 'Developer' }],
        retention: { duration: { type: 'Days', days: 30 } },
        relatedEntities: [],
      } as Trace;
    },

    milestone(data: MilestoneData): Trace {
      return {
        ...baseTrace('Milestone', data.name),
        classification: {
          category: 'Milestone',
          layer: 'Business',
          type: data.name,
        },
        content: {
          summary: data.name,
          details: data.description,
          data: data.metrics,
        },
        significance: {
          level: 'Important',
          reasons: ['Milestone achieved'],
          businessImpact: 'Medium',
        },
        perspectives: [
          { viewer: 'Business' },
          { viewer: 'Operator' },
        ],
        retention: { duration: { type: 'Forever' } },
        relatedEntities: [],
      } as Trace;
    },

    anomaly(data: AnomalyData): Trace {
      const severityToLevel: Record<string, SignificanceLevel> = {
        Critical: 'Critical',
        Warning: 'Important',
        Info: 'Notable',
      };
      
      return {
        ...baseTrace('Anomaly', 'anomaly'),
        classification: {
          category: 'Anomaly',
          layer: 'Application',
          type: 'anomaly',
        },
        content: {
          summary: data.what,
          details: `Expected: ${data.expected}, Actual: ${data.actual}`,
          data: { possibleCauses: data.possibleCauses },
        },
        significance: {
          level: severityToLevel[data.severity] || 'Notable',
          reasons: ['Unexpected behavior detected'],
          businessImpact: data.severity === 'Critical' ? 'High' : 'Low',
        },
        perspectives: [
          { viewer: 'Developer' },
          { viewer: 'Operator' },
        ],
        retention: { duration: { type: 'Months', months: 6 } },
        relatedEntities: [],
      } as Trace;
    },

    reflect(data: ReflectionData): Trace {
      return {
        ...baseTrace('Reflection', 'summary'),
        classification: {
          category: 'Reflection',
          layer: 'Business',
          type: 'summary',
        },
        content: {
          summary: data.summary,
          data: {
            period: data.period,
            patterns: data.patterns,
            recommendations: data.recommendations,
          },
        },
        significance: {
          level: 'Important',
          reasons: ['Period analysis'],
        },
        perspectives: [
          { viewer: 'Business' },
          { viewer: 'Auditor' },
        ],
        retention: { duration: { type: 'Years', years: 7 } },
        relatedEntities: [],
      } as Trace;
    },
  };
}

