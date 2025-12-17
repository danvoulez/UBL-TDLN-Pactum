/**
 * TRAJECTORY - System Audit Trail
 * 
 * The trajectory module tracks the path of events through time.
 * It's the system's memory for compliance, debugging, and understanding.
 * 
 * NOT to be confused with agent "memory" (conversation context).
 * 
 * Trajectory = "What happened in the system" (audit)
 * Memory = "What the AI remembers" (agent context)
 */

export type {
  // Trace types
  Trace,
  TraceClassification,
  TraceCategory,
  SystemLayer,
  TraceContent,
  TechnicalDetails,
  Causation,
  CausalReference,
  Significance,
  SignificanceLevel,
  Perspective,
  ViewerType,
  PerspectiveView,
  RetentionPolicy,
  Duration,
  
  // Trajectory former
  TrajectoryFormer,
  TrajectoryContext,
  Observation,
  MilestoneData,
  AnomalyData,
  ReflectionData,
} from './trace';

export { createTrajectoryFormer } from './trace';

export type {
  // Path types
  Path,
  PathSubject,
  Segment,
  Scene,
  Change,
  Highlight,
  Pattern,
  
  // Building paths
  PathBuilder,
  TraceStore,
  TraceQuery,
  TraceQueryOptions,
  
  // Guide
  Guide,
  GuideOptions,
  CausalExplanation,
} from './path';

export { createPathBuilder, createGuide } from './path';

export type {
  // Logger
  Logger,
  LogLevel,
  LogContext,
} from './logger';

export { createLogger } from './logger';

export type {
  // Event Store Trace
  EventStoreTraceConfig,
  AuditLogger,
} from './event-store-trace';

export { createEventStoreTraceStore, createAuditLogger } from './event-store-trace';
