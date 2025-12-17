/**
 * UNIVERSAL LOGGER - Trajectory-Based Logging
 * 
 * This logger doesn't just write text to files.
 * It forms traces that build trajectories.
 * 
 * Features:
 * - Traditional logging interface (for familiarity)
 * - Automatic trace formation from logs
 * - Context propagation (correlation, causation)
 * - Multiple perspectives (dev, ops, business)
 * - Structured + trajectory output
 * - Integration with event store
 */

import type { EntityId, Timestamp, ActorReference, Event } from '../schema/ledger';
import type { EventStore } from '../store/event-store';
import type { 
  Trace, 
  TraceCategory, 
  SystemLayer, 
  SignificanceLevel,
  ViewerType,
  TrajectoryFormer,
  TrajectoryContext,
  Observation,
  AnomalyData,
  MilestoneData,
  ReflectionData,
} from './trace';
import type { TraceStore } from './path';

// ============================================================================
// LOGGER INTERFACE
// ============================================================================

export interface Logger {
  // Traditional log levels
  trace(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
  fatal(message: string, error?: Error, data?: Record<string, unknown>): void;
  
  // Trajectory logging
  milestone(name: string, description: string, metrics?: Record<string, number>): void;
  decision(what: string, options: string[], chosen: string, reason: string): void;
  relationship(action: string, entity1: string, entity2: string, context?: string): void;
  
  // Context management
  child(context: Partial<LogContext>): Logger;
  withCorrelation(correlationId: string): Logger;
  withActor(actor: ActorReference): Logger;
  
  // Flush pending traces
  flush(): Promise<void>;
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  readonly realmId: EntityId;
  readonly correlationId?: string;
  readonly spanId?: string;
  readonly actor?: ActorReference;
  readonly component?: string;
  readonly operation?: string;
  readonly tags?: readonly string[];
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createLogger(
  context: LogContext,
  trajectoryFormer?: TrajectoryFormer,
  traceStore?: TraceStore
): Logger {
  const pendingTraces: Trace[] = [];
  
  const levelToSignificance: Record<LogLevel, SignificanceLevel> = {
    trace: 'Debug',
    debug: 'Debug',
    info: 'Routine',
    warn: 'Notable',
    error: 'Important',
    fatal: 'Critical',
  };
  
  function log(level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const component = context.component ? `[${context.component}]` : '';
    
    // Traditional console output
    const logFn = level === 'error' || level === 'fatal' ? console.error : console.log;
    logFn(`${prefix}${component} ${message}`, data || '', error || '');
    
    // Form trajectory trace if configured
    if (trajectoryFormer) {
      const trace = trajectoryFormer.observe({
        what: message,
        details: error?.message,
        data: { ...data, error: error?.stack },
        layer: 'Application',
        significance: levelToSignificance[level],
      });
      
      pendingTraces.push(trace);
    }
  }
  
  const logger: Logger = {
    trace: (msg, data) => log('trace', msg, data),
    debug: (msg, data) => log('debug', msg, data),
    info: (msg, data) => log('info', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    error: (msg, err, data) => log('error', msg, data, err),
    fatal: (msg, err, data) => log('fatal', msg, data, err),
    
    milestone(name, description, metrics) {
      console.log(`[MILESTONE] ${name}: ${description}`, metrics || '');
      
      if (trajectoryFormer) {
        const trace = trajectoryFormer.milestone({ name, description, metrics });
        pendingTraces.push(trace);
      }
    },
    
    decision(what, options, chosen, reason) {
      console.log(`[DECISION] ${what}: chose "${chosen}" from [${options.join(', ')}] because: ${reason}`);
      
      if (trajectoryFormer) {
        const trace = trajectoryFormer.observe({
          what: `Decision: ${what}`,
          details: `Chose "${chosen}" because: ${reason}`,
          data: { options, chosen, reason },
          layer: 'Business',
          significance: 'Notable',
        });
        pendingTraces.push(trace);
      }
    },
    
    relationship(action, entity1, entity2, ctx) {
      console.log(`[RELATIONSHIP] ${entity1} ${action} ${entity2}`, ctx || '');
      
      if (trajectoryFormer) {
        const trace = trajectoryFormer.observe({
          what: `${entity1} ${action} ${entity2}`,
          details: ctx,
          layer: 'Business',
          significance: 'Notable',
        });
        pendingTraces.push(trace);
      }
    },
    
    child(childContext) {
      return createLogger(
        { ...context, ...childContext },
        trajectoryFormer,
        traceStore
      );
    },
    
    withCorrelation(correlationId) {
      return createLogger(
        { ...context, correlationId },
        trajectoryFormer,
        traceStore
      );
    },
    
    withActor(actor) {
      return createLogger(
        { ...context, actor },
        trajectoryFormer,
        traceStore
      );
    },
    
    async flush() {
      if (traceStore && pendingTraces.length > 0) {
        for (const trace of pendingTraces) {
          await traceStore.save(trace);
        }
        pendingTraces.length = 0;
      }
    },
  };
  
  return logger;
}

