/**
 * COGNITION - Agent Thinking & Memory
 * 
 * This module handles what the AI AGENT thinks and remembers.
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                                                                         │
 * │   COGNITION ≠ TRAJECTORY                                               │
 * │                                                                         │
 * │   Cognition = What the AGENT thinks and remembers                      │
 * │               (conversation context, user preferences, reasoning)       │
 * │                                                                         │
 * │   Trajectory = What the SYSTEM records for audit                       │
 * │                (events, authorization decisions, compliance)            │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * For LLM developers:
 * - Use Cognition for agent context/memory
 * - Use Trajectory for system audit trail
 */

// Memory - What the agent remembers
export type {
  AgentMemory,
  MemoryType,
  MemoryImportance,
  MemoryContext,
  ConversationMessage,
  UserContext,
  AgentMemoryStore,
  MemorySearchOptions,
  ConsolidationResult,
  AgentMemoryManager,
} from './memory';

export {
  createInMemoryStore,
  createAgentMemoryManager,
} from './memory';
