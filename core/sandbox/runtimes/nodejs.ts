/**
 * NODE.JS RUNTIME PLUGIN
 * 
 * Executes JavaScript/TypeScript code in a Node.js sandbox.
 * 
 * Uses Node.js built-in `vm` module for basic isolation.
 * For production, consider using `vm2` or `isolated-vm` for better isolation.
 */

import { VM } from 'node:vm';
import type { RuntimePlugin, ExecutionRequest, ExecutionResult } from './types';

// ============================================================================
// NODE.JS RUNTIME PLUGIN
// ============================================================================

export function createNodeJSRuntime(): RuntimePlugin {
  return {
    name: 'Node.js',
    runtime: 'Node.js',
    
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      const startTime = Date.now();
      const logs: string[] = [];
      let memoryPeakMB = 0;
      
      try {
        // Validate code is provided
        if (!request.code) {
          return {
            success: false,
            error: {
              message: 'Code is required for execution',
              code: 'MISSING_CODE',
            },
            resources: {
              cpuTimeMs: 0,
              memoryPeakMB: 0,
              durationMs: 0,
            },
            logs,
            durationMs: 0,
          };
        }
        
        // Prepare sandbox context
        const sandbox: Record<string, unknown> = {
          // Input data
          input: request.input,
          
          // Console override to capture logs
          console: {
            log: (...args: unknown[]) => {
              logs.push(args.map(a => String(a)).join(' '));
            },
            error: (...args: unknown[]) => {
              logs.push(`ERROR: ${args.map(a => String(a)).join(' ')}`);
            },
            warn: (...args: unknown[]) => {
              logs.push(`WARN: ${args.map(a => String(a)).join(' ')}`);
            },
            info: (...args: unknown[]) => {
              logs.push(`INFO: ${args.map(a => String(a)).join(' ')}`);
            },
          },
          
          // Environment variables
          process: {
            env: request.environment || {},
          },
          
          // Result placeholder
          __result: undefined,
        };
        
        // Add allowed imports to sandbox (if any)
        // Note: In production, use vm2 or isolated-vm for better import control
        if (request.allowedImports && request.allowedImports.length > 0) {
          // For now, we'll block all imports by default
          // In production, use vm2's require option
        }
        
        // Create VM with resource limits
        const vm = new VM({
          timeout: request.resources.timeoutMs,
          // Note: Node.js VM doesn't support memory limits directly
          // For production, use vm2 or isolated-vm
          sandbox,
          // Block access to require, process, etc. for security
          // In production, use vm2 for better isolation
        });
        
        // Prepare code to execute
        // If entryPoint is provided, try to call it as a function
        let codeToExecute = request.code;
        
        // If entryPoint is a function name, wrap code to call it
        if (request.entryPoint && request.entryPoint !== 'main' && request.entryPoint !== 'index') {
          // Try to extract and call the function
          codeToExecute = `
            ${request.code}
            
            // Try to call the entry point function
            if (typeof ${request.entryPoint} === 'function') {
              __result = ${request.entryPoint}(input);
            } else {
              throw new Error('Entry point "${request.entryPoint}" is not a function');
            }
          `;
        } else {
          // Execute code directly and capture result
          codeToExecute = `
            ${request.code}
            
            // If code doesn't return anything, use last expression
            if (typeof __result === 'undefined') {
              __result = undefined;
            }
          `;
        }
        
        // Execute code
        const output = vm.run(codeToExecute);
        
        // Get result from sandbox
        const result = sandbox.__result !== undefined ? sandbox.__result : output;
        
        // Measure memory (approximate)
        if (global.gc) {
          global.gc();
        }
        const memUsage = process.memoryUsage();
        memoryPeakMB = Math.max(memoryPeakMB, memUsage.heapUsed / 1024 / 1024);
        
        const durationMs = Date.now() - startTime;
        
        return {
          success: true,
          output: result,
          resources: {
            cpuTimeMs: durationMs, // Approximate
            memoryPeakMB,
            durationMs,
          },
          logs,
          durationMs,
        };
      } catch (error: any) {
        const durationMs = Date.now() - startTime;
        
        return {
          success: false,
          error: {
            message: error.message || 'Unknown error',
            stack: error.stack,
            code: error.code,
            type: error.name,
          },
          resources: {
            cpuTimeMs: durationMs,
            memoryPeakMB,
            durationMs,
          },
          logs,
          durationMs,
        };
      }
    },
    
    async healthCheck(): Promise<boolean> {
      // Check if Node.js VM is available
      try {
        const testVM = new VM({ timeout: 100 });
        testVM.run('1 + 1');
        return true;
      } catch {
        return false;
      }
    },
  };
}


