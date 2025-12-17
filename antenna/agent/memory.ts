/**
 * AGENT MEMORY - Re-export from core/cognition
 * 
 * @deprecated Import from 'core/cognition' instead
 * 
 * This file re-exports from the canonical location for backward compatibility.
 * The agent's cognitive memory now lives in core/cognition/memory.ts
 * 
 * NAMING CONVENTION:
 * - Cognition = What the AGENT thinks and remembers (this module)
 * - Trajectory = What the SYSTEM records for audit (core/trajectory)
 */

// Re-export everything from core/cognition for backward compatibility
export {
  // Types
  type AgentMemory as Memory,  // Alias for backward compatibility
  type AgentMemory,
  type MemoryType,
  type MemoryImportance,
  type MemoryContext,
  type ConversationMessage,
  type UserContext,
  type AgentMemoryStore as MemoryStore,  // Alias for backward compatibility
  type AgentMemoryStore,
  type MemorySearchOptions,
  type ConsolidationResult,
  type AgentMemoryManager as MemoryManager,  // Alias for backward compatibility
  type AgentMemoryManager,
  
  // Functions
  createInMemoryStore,
  createAgentMemoryManager as createMemoryManager,  // Alias for backward compatibility
  createAgentMemoryManager,
} from '../../core/cognition/memory';

