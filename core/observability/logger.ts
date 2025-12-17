/**
 * LOGGER - Canonical Structured Logging
 * 
 * Fase 4: Observabilidade do Diamante
 * 
 * ⚠️ CANONICAL SOURCE: This is the ONLY place where the Logger interface
 * and default implementation are defined. All other modules should import from here.
 * 
 * Philosophy:
 * - Structured logs (JSON per line)
 * - Context correlation (traceId, sessionId, realmId)
 * - Simple to use, simple to read
 * - Consistent across pipeline, deploy, API, agent, realm
 */

// ============================================================================
// TYPES
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  component?: string;
  traceId?: string;
  sessionId?: string;
  realmId?: string;
  intent?: string;
  endpoint?: string;
  errorCode?: string;
  turn?: number;
  processingMs?: number;
  affordancesCount?: number;
  suggestionsCount?: number;
  eventsCount?: number;
  messageLength?: number;
  actorType?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface Logger {
  log(level: LogLevel, message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
}

// ============================================================================
// DEFAULT IMPLEMENTATION
// ============================================================================

class ConsoleLogger implements Logger {
  log(level: LogLevel, message: string, context: LogContext = {}): void {
    const payload = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...context,
    };

    const jsonLine = JSON.stringify(payload);

    // Errors and warnings go to stderr, info/debug to stdout
    if (level === 'error' || level === 'warn') {
      console.error(jsonLine);
    } else {
      console.log(jsonLine);
    }
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }
}

// ============================================================================
// CANONICAL LOGGER INSTANCE
// ============================================================================

/**
 * Canonical logger instance.
 * Use this throughout the codebase for consistent structured logging.
 */
export const logger: Logger = new ConsoleLogger();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a simple trace ID (UUID-like or nanoid).
 * For production, consider using a proper UUID library.
 */
export function generateTraceId(): string {
  // Simple trace ID generator (can be replaced with uuid or nanoid)
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `trace-${timestamp}-${random}`;
}

/**
 * Extract trace ID from HTTP headers.
 */
export function extractTraceId(headers: Record<string, string | string[] | undefined>): string | undefined {
  const traceHeader = headers['x-trace-id'] || headers['X-Trace-Id'] || headers['trace-id'];
  if (typeof traceHeader === 'string') {
    return traceHeader;
  }
  if (Array.isArray(traceHeader) && traceHeader.length > 0) {
    return traceHeader[0];
  }
  return undefined;
}

