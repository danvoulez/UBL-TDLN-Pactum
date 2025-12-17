/**
 * PATH ENGINE - Weaving Traces into Trajectories
 * 
 * Traces are individual moments. Paths are the threads
 * that connect them into coherent trajectories.
 * 
 * This module provides:
 * - Path reconstruction (what happened to X?)
 * - Causal chains (why did X happen?)
 * - Timeline views (what happened when?)
 * - Perspective filtering (show me the business view)
 * - Pattern detection (what keeps happening?)
 */

import type { EntityId, Timestamp, AggregateType, ActorReference } from '../schema/ledger';
import type { 
  Trace, 
  TraceCategory, 
  SystemLayer, 
  SignificanceLevel,
  ViewerType,
  Perspective,
  Duration,
} from './trace';

// ============================================================================
// PATH TYPES
// ============================================================================

/**
 * A Path is a coherent trajectory constructed from traces.
 */
export interface Path {
  /** Unique identifier */
  readonly id: EntityId;
  
  /** Path title */
  readonly title: string;
  
  /** What is this path about */
  readonly subject: PathSubject;
  
  /** Time span of the path */
  readonly timespan: {
    readonly start: Timestamp;
    readonly end: Timestamp;
  };
  
  /** The segments (grouped traces) */
  readonly segments: readonly Segment[];
  
  /** Overall summary */
  readonly summary: string;
  
  /** Key moments */
  readonly highlights: readonly Highlight[];
  
  /** Detected patterns */
  readonly patterns: readonly Pattern[];
}

export interface PathSubject {
  readonly type: 'Entity' | 'Agreement' | 'Process' | 'Period' | 'Custom';
  readonly id?: EntityId;
  readonly description: string;
}

// ============================================================================
// SEGMENTS - Groupings within a path
// ============================================================================

export interface Segment {
  /** Segment identifier */
  readonly id: EntityId;
  
  /** Segment title */
  readonly title: string;
  
  /** When this segment occurred */
  readonly timespan: {
    readonly start: Timestamp;
    readonly end: Timestamp;
  };
  
  /** Scenes within this segment */
  readonly scenes: readonly Scene[];
  
  /** Segment summary */
  readonly summary: string;
}

export interface Scene {
  /** Scene identifier */
  readonly id: EntityId;
  
  /** Brief description */
  readonly description: string;
  
  /** The traces in this scene */
  readonly traces: readonly Trace[];
  
  /** Who was involved */
  readonly actors: readonly ActorReference[];
  
  /** What changed */
  readonly changes: readonly Change[];
}

export interface Change {
  readonly what: string;
  readonly from?: unknown;
  readonly to?: unknown;
  readonly significance: SignificanceLevel;
}

// ============================================================================
// HIGHLIGHTS & PATTERNS
// ============================================================================

export interface Highlight {
  readonly trace: Trace;
  readonly reason: string;
  readonly impact: string;
}

export interface Pattern {
  readonly name: string;
  readonly description: string;
  readonly occurrences: number;
  readonly examples: readonly EntityId[]; // Trace IDs
  readonly significance: 'Positive' | 'Negative' | 'Neutral';
  readonly recommendation?: string;
}

// ============================================================================
// PATH BUILDER
// ============================================================================

export interface PathBuilder {
  /** Start building a path about a subject */
  about(subject: PathSubject): PathBuilder;
  
  /** Set the time range */
  during(start: Timestamp, end: Timestamp): PathBuilder;
  
  /** Filter by perspective */
  forViewer(viewer: ViewerType): PathBuilder;
  
  /** Filter by significance */
  withMinSignificance(level: SignificanceLevel): PathBuilder;
  
  /** Filter by categories */
  inCategories(categories: readonly TraceCategory[]): PathBuilder;
  
  /** Build the path */
  build(): Promise<Path>;
}

// ============================================================================
// TRACE STORE
// ============================================================================

export interface TraceStore {
  /** Save a trace */
  save(trace: Trace): Promise<void>;
  
  /** Get trace by ID */
  get(id: EntityId): Promise<Trace | null>;
  
  /** Query traces */
  query(query: TraceQuery): Promise<readonly Trace[]>;
  
  /** Get traces for an entity */
  forEntity(entityId: EntityId, options?: TraceQueryOptions): Promise<readonly Trace[]>;
  
  /** Get traces in a time range */
  inRange(start: Timestamp, end: Timestamp, options?: TraceQueryOptions): Promise<readonly Trace[]>;
}

export interface TraceQuery {
  readonly realmId?: EntityId;
  readonly entityIds?: readonly EntityId[];
  readonly categories?: readonly TraceCategory[];
  readonly layers?: readonly SystemLayer[];
  readonly minSignificance?: SignificanceLevel;
  readonly viewers?: readonly ViewerType[];
  readonly tags?: readonly string[];
  readonly timeRange?: { start: Timestamp; end: Timestamp };
  readonly limit?: number;
  readonly offset?: number;
}

export interface TraceQueryOptions {
  readonly categories?: readonly TraceCategory[];
  readonly minSignificance?: SignificanceLevel;
  readonly limit?: number;
}

// ============================================================================
// GUIDE - Path narrator
// ============================================================================

export interface Guide {
  /** Reconstruct the path of an entity */
  traceEntity(entityId: EntityId, options?: GuideOptions): Promise<Path>;
  
  /** Trace a process/saga */
  traceProcess(correlationId: string, options?: GuideOptions): Promise<Path>;
  
  /** Generate a period summary */
  summarizePeriod(start: Timestamp, end: Timestamp, options?: GuideOptions): Promise<Path>;
  
  /** Answer "what happened to X?" */
  whatHappened(subject: string, options?: GuideOptions): Promise<Path>;
  
  /** Answer "why did X happen?" */
  whyDidThisHappen(traceId: EntityId): Promise<CausalExplanation>;
}

export interface GuideOptions {
  readonly viewer?: ViewerType;
  readonly minSignificance?: SignificanceLevel;
  readonly includePatterns?: boolean;
}

export interface CausalExplanation {
  readonly trace: Trace;
  readonly directCause?: Trace;
  readonly causalChain: readonly Trace[];
  readonly explanation: string;
  readonly rootCauses: readonly string[];
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createPathBuilder(traceStore: TraceStore): PathBuilder {
  let subject: PathSubject | undefined;
  let startTime: Timestamp | undefined;
  let endTime: Timestamp | undefined;
  let viewer: ViewerType | undefined;
  let minSignificance: SignificanceLevel | undefined;
  let categories: readonly TraceCategory[] | undefined;

  const builder: PathBuilder = {
    about(s: PathSubject) {
      subject = s;
      return builder;
    },
    
    during(start: Timestamp, end: Timestamp) {
      startTime = start;
      endTime = end;
      return builder;
    },
    
    forViewer(v: ViewerType) {
      viewer = v;
      return builder;
    },
    
    withMinSignificance(level: SignificanceLevel) {
      minSignificance = level;
      return builder;
    },
    
    inCategories(cats: readonly TraceCategory[]) {
      categories = cats;
      return builder;
    },
    
    async build(): Promise<Path> {
      if (!subject) {
        throw new Error('Path subject is required');
      }
      
      // Query traces
      const traces = await traceStore.query({
        entityIds: subject.id ? [subject.id] : undefined,
        categories,
        minSignificance,
        viewers: viewer ? [viewer] : undefined,
        timeRange: startTime && endTime ? { start: startTime, end: endTime } : undefined,
      });
      
      // Group into segments
      const segments = groupIntoSegments(traces);
      
      // Find highlights
      const highlights = findHighlights(traces);
      
      // Detect patterns
      const patterns = detectPatterns(traces);
      
      return {
        id: `path-${Date.now()}` as EntityId,
        title: `Trajectory of ${subject.description}`,
        subject,
        timespan: {
          start: traces[0]?.timestamp ?? (Date.now() as Timestamp),
          end: traces[traces.length - 1]?.timestamp ?? (Date.now() as Timestamp),
        },
        segments,
        summary: generateSummary(traces, subject),
        highlights,
        patterns,
      };
    },
  };

  return builder;
}

function groupIntoSegments(traces: readonly Trace[]): Segment[] {
  if (traces.length === 0) return [];
  
  // Simple grouping by day for now
  const byDay = new Map<string, Trace[]>();
  
  for (const trace of traces) {
    const day = new Date(trace.timestamp).toISOString().split('T')[0];
    if (!byDay.has(day)) {
      byDay.set(day, []);
    }
    byDay.get(day)!.push(trace);
  }
  
  return Array.from(byDay.entries()).map(([day, dayTraces]) => ({
    id: `segment-${day}` as EntityId,
    title: day,
    timespan: {
      start: dayTraces[0].timestamp,
      end: dayTraces[dayTraces.length - 1].timestamp,
    },
    scenes: [{
      id: `scene-${day}` as EntityId,
      description: `Events on ${day}`,
      traces: dayTraces,
      actors: [],
      changes: [],
    }],
    summary: `${dayTraces.length} traces recorded`,
  }));
}

function findHighlights(traces: readonly Trace[]): Highlight[] {
  return traces
    .filter(t => t.significance.level === 'Critical' || t.significance.level === 'Important')
    .map(trace => ({
      trace,
      reason: trace.significance.reasons[0] || 'Significant event',
      impact: trace.significance.businessImpact || 'Unknown',
    }));
}

function detectPatterns(traces: readonly Trace[]): Pattern[] {
  // Simple pattern detection - count event types
  const typeCounts = new Map<string, number>();
  
  for (const trace of traces) {
    const type = trace.classification.type;
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }
  
  return Array.from(typeCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([type, count]) => ({
      name: `Recurring: ${type}`,
      description: `${type} occurred ${count} times`,
      occurrences: count,
      examples: traces.filter(t => t.classification.type === type).map(t => t.id),
      significance: 'Neutral' as const,
    }));
}

function generateSummary(traces: readonly Trace[], subject: PathSubject): string {
  if (traces.length === 0) {
    return `No activity recorded for ${subject.description}`;
  }
  
  const critical = traces.filter(t => t.significance.level === 'Critical').length;
  const important = traces.filter(t => t.significance.level === 'Important').length;
  
  let summary = `${traces.length} events in the trajectory of ${subject.description}`;
  if (critical > 0) summary += `. ${critical} critical`;
  if (important > 0) summary += `. ${important} important`;
  
  return summary;
}

export function createGuide(traceStore: TraceStore): Guide {
  return {
    async traceEntity(entityId, options) {
      return createPathBuilder(traceStore)
        .about({ type: 'Entity', id: entityId, description: `Entity ${entityId}` })
        .forViewer(options?.viewer || 'Business')
        .withMinSignificance(options?.minSignificance || 'Routine')
        .build();
    },
    
    async traceProcess(correlationId, options) {
      // Would query by correlation ID
      return createPathBuilder(traceStore)
        .about({ type: 'Process', description: `Process ${correlationId}` })
        .build();
    },
    
    async summarizePeriod(start, end, options) {
      return createPathBuilder(traceStore)
        .about({ type: 'Period', description: `Period ${new Date(start).toISOString()} to ${new Date(end).toISOString()}` })
        .during(start, end)
        .build();
    },
    
    async whatHappened(subject, options) {
      return createPathBuilder(traceStore)
        .about({ type: 'Custom', description: subject })
        .build();
    },
    
    async whyDidThisHappen(traceId) {
      const trace = await traceStore.get(traceId);
      if (!trace) {
        throw new Error(`Trace ${traceId} not found`);
      }
      
      // Follow causal chain
      const chain: Trace[] = [];
      for (const ref of trace.causation.chain) {
        const cause = await traceStore.get(ref.id);
        if (cause) chain.push(cause);
      }
      
      return {
        trace,
        directCause: chain[0],
        causalChain: chain,
        explanation: `This trace was triggered by ${chain.length} preceding events`,
        rootCauses: chain.length > 0 ? [chain[chain.length - 1].content.summary] : ['Unknown'],
      };
    },
  };
}

