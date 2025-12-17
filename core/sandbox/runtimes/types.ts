/**
 * RUNTIME EXECUTION TYPES
 * 
 * Types for runtime execution requests and results.
 */

import type { EntityId } from '../../shared/types';

// WorkspaceRuntime was in workspace.ts (now deleted, replaced by Container)
// Define locally for backward compatibility
export type WorkspaceRuntime = 'Node.js' | 'Python' | 'Deno' | 'WebAssembly' | 'Multi';

// ============================================================================
// EXECUTION REQUEST
// ============================================================================

export interface ExecutionRequest {
  /** Workspace ID where execution happens */
  readonly workspaceId: EntityId;
  
  /** Function ID (if executing a registered function) */
  readonly functionId?: EntityId;
  
  /** Code to execute (if executing script directly) */
  readonly code?: string;
  
  /** Language/runtime to use */
  readonly runtime: WorkspaceRuntime;
  
  /** Entry point (function name to call, or script path) */
  readonly entryPoint: string;
  
  /** Input parameters */
  readonly input: unknown;
  
  /** Resource limits */
  readonly resources: {
    readonly timeoutMs: number;
    readonly memoryLimitMB: number;
    readonly cpuLimit?: number;
  };
  
  /** Environment variables */
  readonly environment?: Record<string, string>;
  
  /** Allowed imports (security) */
  readonly allowedImports?: readonly string[];
  
  /** Blocked imports (security) */
  readonly blockedImports?: readonly string[];
}

// ============================================================================
// EXECUTION RESULT
// ============================================================================

export interface ExecutionResult {
  /** Whether execution succeeded */
  readonly success: boolean;
  
  /** Output/return value (if successful) */
  readonly output?: unknown;
  
  /** Error (if failed) */
  readonly error?: ExecutionError;
  
  /** Resource usage metrics */
  readonly resources: ResourceUsage;
  
  /** Execution logs */
  readonly logs: readonly string[];
  
  /** Execution duration in milliseconds */
  readonly durationMs: number;
}

export interface ExecutionError {
  readonly message: string;
  readonly stack?: string;
  readonly code?: string;
  readonly type?: string;
}

export interface ResourceUsage {
  readonly cpuTimeMs: number;
  readonly memoryPeakMB: number;
  readonly durationMs: number;
}

// ============================================================================
// RUNTIME PLUGIN INTERFACE
// ============================================================================

export interface RuntimePlugin {
  /** Plugin name */
  readonly name: string;
  
  /** Runtime identifier */
  readonly runtime: WorkspaceRuntime;
  
  /** Execute code in this runtime */
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  
  /** Health check */
  healthCheck?(): Promise<boolean>;
  
  /** Cleanup/shutdown */
  shutdown?(): Promise<void>;
}


