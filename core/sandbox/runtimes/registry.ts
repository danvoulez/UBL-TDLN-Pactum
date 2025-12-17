/**
 * RUNTIME REGISTRY
 * 
 * Registry for runtime plugins (Node.js, Python, Deno, etc.)
 * 
 * Follows UBL philosophy:
 * - Extensible: Apps can register their own runtimes
 * - Plugin-based: Runtimes are plugins, not hardcoded
 * - Agreement-based: Execution controlled by agreements
 */

import type { WorkspaceRuntime } from './types';
import type { RuntimePlugin, ExecutionRequest, ExecutionResult } from './types';

// ============================================================================
// RUNTIME REGISTRY
// ============================================================================

export interface RuntimeRegistry {
  /** Register a runtime plugin */
  register(plugin: RuntimePlugin): void;
  
  /** Get runtime plugin by identifier */
  get(runtime: WorkspaceRuntime): RuntimePlugin | null;
  
  /** Get all registered runtimes */
  getAll(): readonly RuntimePlugin[];
  
  /** Check if runtime is available */
  has(runtime: WorkspaceRuntime): boolean;
  
  /** Execute code using the appropriate runtime */
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  
  /** Health check all runtimes */
  healthCheck(): Promise<Record<string, boolean>>;
  
  /** Shutdown all runtimes */
  shutdown(): Promise<void>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export class InMemoryRuntimeRegistry implements RuntimeRegistry {
  private plugins: Map<WorkspaceRuntime, RuntimePlugin> = new Map();
  
  register(plugin: RuntimePlugin): void {
    if (this.plugins.has(plugin.runtime)) {
      throw new Error(`Runtime ${plugin.runtime} is already registered`);
    }
    this.plugins.set(plugin.runtime, plugin);
  }
  
  get(runtime: WorkspaceRuntime): RuntimePlugin | null {
    return this.plugins.get(runtime) || null;
  }
  
  getAll(): readonly RuntimePlugin[] {
    return Array.from(this.plugins.values());
  }
  
  has(runtime: WorkspaceRuntime): boolean {
    return this.plugins.has(runtime);
  }
  
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const plugin = this.get(request.runtime);
    
    if (!plugin) {
      return {
        success: false,
        error: {
          message: `Runtime ${request.runtime} is not available`,
          code: 'RUNTIME_NOT_FOUND',
        },
        resources: {
          cpuTimeMs: 0,
          memoryPeakMB: 0,
          durationMs: 0,
        },
        logs: [],
        durationMs: 0,
      };
    }
    
    return await plugin.execute(request);
  }
  
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    for (const [runtime, plugin] of this.plugins.entries()) {
      if (plugin.healthCheck) {
        try {
          results[runtime] = await plugin.healthCheck();
        } catch (error) {
          results[runtime] = false;
        }
      } else {
        // If no health check, assume healthy if plugin exists
        results[runtime] = true;
      }
    }
    
    return results;
  }
  
  async shutdown(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];
    
    for (const plugin of this.plugins.values()) {
      if (plugin.shutdown) {
        shutdownPromises.push(plugin.shutdown());
      }
    }
    
    await Promise.all(shutdownPromises);
    this.plugins.clear();
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createRuntimeRegistry(): RuntimeRegistry {
  return new InMemoryRuntimeRegistry();
}


