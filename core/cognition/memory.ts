/**
 * AGENT MEMORY - What the AI Remembers
 * 
 * @deprecated This module is being phased out. See docs/MEMORIA.md
 * 
 * NEW MODEL: Memory = Query(Ledger, Access)
 * 
 * There is no separate "memory" - everything is Events in the Ledger.
 * What you can "remember" is what you can query given your access level.
 * 
 * - Script memory = Events the script can read
 * - Session context = Events in the current session
 * - Audit trail = All events (for admins)
 * 
 * This file is kept for backward compatibility but new code should
 * query the EventStore directly with appropriate ABAC permissions.
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                                                                         │
 * │   DEPRECATED: Use EventStore queries instead                           │
 * │                                                                         │
 * │   // Old way                                                           │
 * │   const memory = await memoryManager.loadContext(sessionId);           │
 * │                                                                         │
 * │   // New way                                                           │
 * │   const events = await eventStore.query({                              │
 * │     filter: { aggregateId: scriptId },                                 │
 * │     actor: currentActor,                                               │
 * │   });                                                                  │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import type { EntityId, Timestamp } from '../shared/types';

// ============================================================================
// AGENT MEMORY TYPES
// ============================================================================

/**
 * A single memory unit - something the agent remembers.
 * Named AgentMemory to be explicit this is agent cognition, not system audit.
 */
export interface AgentMemory {
  /** Unique identifier */
  readonly id: EntityId;
  
  /** When this memory was formed */
  readonly createdAt: Timestamp;
  
  /** When this memory was last accessed */
  readonly lastAccessedAt: Timestamp;
  
  /** The type of memory */
  readonly type: MemoryType;
  
  /** The actual content */
  readonly content: string;
  
  /** Structured data if applicable */
  readonly data?: Record<string, unknown>;
  
  /** Who this memory is about/for */
  readonly subjectId?: EntityId;
  
  /** The realm this memory belongs to */
  readonly realmId: EntityId;
  
  /** How important is this memory (affects retention) */
  readonly importance: MemoryImportance;
  
  /** Tags for retrieval */
  readonly tags: readonly string[];
  
  /** Embedding vector for semantic search */
  readonly embedding?: readonly number[];
}

export type MemoryType =
  | 'Conversation'    // A conversation exchange
  | 'Preference'      // User preference learned
  | 'Fact'            // A fact about the user/context
  | 'Summary'         // Consolidated summary
  | 'Instruction'     // Special instructions to remember
  | 'Feedback';       // User feedback on agent behavior

export type MemoryImportance =
  | 'Critical'        // Always include in context
  | 'High'            // Include when relevant
  | 'Medium'          // Include if space permits
  | 'Low';            // Archive, rarely include

// ============================================================================
// MEMORY CONTEXT - What gets loaded for a conversation
// ============================================================================

/**
 * The context loaded for a conversation.
 * This is what gets injected into the LLM prompt.
 */
export interface MemoryContext {
  /** Recent conversation history */
  readonly recentMessages: readonly ConversationMessage[];
  
  /** Relevant memories retrieved */
  readonly relevantMemories: readonly AgentMemory[];
  
  /** User facts/preferences */
  readonly userContext: UserContext;
  
  /** System instructions */
  readonly systemInstructions: readonly string[];
  
  /** Total tokens estimated */
  readonly estimatedTokens: number;
}

export interface ConversationMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly timestamp: Timestamp;
  readonly metadata?: Record<string, unknown>;
}

export interface UserContext {
  readonly userId: EntityId;
  readonly name?: string;
  readonly preferences: Record<string, unknown>;
  readonly facts: readonly string[];
}

// ============================================================================
// AGENT MEMORY STORE
// ============================================================================

export interface AgentMemoryStore {
  /** Save a memory */
  save(memory: AgentMemory): Promise<void>;
  
  /** Get memory by ID */
  get(id: EntityId): Promise<AgentMemory | null>;
  
  /** Search memories by text */
  search(query: string, options?: MemorySearchOptions): Promise<readonly AgentMemory[]>;
  
  /** Search by semantic similarity (requires embeddings) */
  searchSemantic(embedding: readonly number[], options?: MemorySearchOptions): Promise<readonly AgentMemory[]>;
  
  /** Get memories for a subject */
  forSubject(subjectId: EntityId, options?: MemorySearchOptions): Promise<readonly AgentMemory[]>;
  
  /** Get recent memories */
  recent(realmId: EntityId, limit?: number): Promise<readonly AgentMemory[]>;
  
  /** Delete old/low-importance memories */
  consolidate(realmId: EntityId): Promise<ConsolidationResult>;
}

export interface MemorySearchOptions {
  readonly types?: readonly MemoryType[];
  readonly minImportance?: MemoryImportance;
  readonly realmId?: EntityId;
  readonly limit?: number;
  readonly tags?: readonly string[];
}

export interface ConsolidationResult {
  readonly memoriesRemoved: number;
  readonly summariesCreated: number;
  readonly tokensFreed: number;
}

// ============================================================================
// AGENT MEMORY MANAGER
// ============================================================================

export interface AgentMemoryManager {
  /** Load context for a conversation */
  loadContext(sessionId: EntityId, query?: string): Promise<MemoryContext>;
  
  /** Remember something from the conversation */
  remember(memory: Omit<AgentMemory, 'id' | 'createdAt' | 'lastAccessedAt'>): Promise<AgentMemory>;
  
  /** Update user preference */
  setPreference(userId: EntityId, key: string, value: unknown): Promise<void>;
  
  /** Record a fact about the user */
  recordFact(userId: EntityId, fact: string): Promise<void>;
  
  /** Consolidate old memories into summaries */
  consolidate(realmId: EntityId): Promise<ConsolidationResult>;
  
  /** Clear conversation history (keep preferences/facts) */
  clearConversation(sessionId: EntityId): Promise<void>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Create an in-memory store (for development/testing).
 */
export function createInMemoryStore(): AgentMemoryStore {
  const memories = new Map<EntityId, AgentMemory>();
  
  return {
    async save(memory) {
      memories.set(memory.id, memory);
    },
    
    async get(id) {
      return memories.get(id) || null;
    },
    
    async search(query, options) {
      const queryLower = query.toLowerCase();
      return Array.from(memories.values())
        .filter(m => {
          if (options?.types && !options.types.includes(m.type)) return false;
          if (options?.realmId && m.realmId !== options.realmId) return false;
          return m.content.toLowerCase().includes(queryLower);
        })
        .slice(0, options?.limit || 10);
    },
    
    async searchSemantic(embedding, options) {
      // Would use vector similarity - for now, return recent
      return this.recent(options?.realmId || 'default' as EntityId, options?.limit);
    },
    
    async forSubject(subjectId, options) {
      return Array.from(memories.values())
        .filter(m => m.subjectId === subjectId)
        .slice(0, options?.limit || 20);
    },
    
    async recent(realmId, limit = 10) {
      return Array.from(memories.values())
        .filter(m => m.realmId === realmId)
        .sort((a, b) => (b.createdAt as number) - (a.createdAt as number))
        .slice(0, limit);
    },
    
    async consolidate(realmId) {
      // Simple consolidation: remove low-importance old memories
      const now = Date.now();
      const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
      
      let removed = 0;
      for (const [id, memory] of memories) {
        if (
          memory.realmId === realmId &&
          memory.importance === 'Low' &&
          (memory.createdAt as number) < oneWeekAgo
        ) {
          memories.delete(id);
          removed++;
        }
      }
      
      return {
        memoriesRemoved: removed,
        summariesCreated: 0,
        tokensFreed: removed * 100, // Rough estimate
      };
    },
  };
}

/**
 * Create an agent memory manager.
 */
export function createAgentMemoryManager(
  store: AgentMemoryStore,
  options?: {
    maxContextTokens?: number;
    recentMessageCount?: number;
  }
): AgentMemoryManager {
  const maxTokens = options?.maxContextTokens || 4000;
  const recentCount = options?.recentMessageCount || 10;
  
  // Track conversation messages per session
  const sessionMessages = new Map<EntityId, ConversationMessage[]>();
  
  return {
    async loadContext(sessionId, query) {
      const messages = sessionMessages.get(sessionId) || [];
      const recentMessages = messages.slice(-recentCount);
      
      // Get relevant memories
      const relevantMemories = query 
        ? await store.search(query, { limit: 5 })
        : [];
      
      // Build user context from stored preferences/facts
      const userFacts = await store.search('', { 
        types: ['Preference', 'Fact'], 
        limit: 10 
      });
      
      const userContext: UserContext = {
        userId: sessionId, // Simplified - would be actual user ID
        preferences: {},
        facts: userFacts.filter(m => m.type === 'Fact').map(m => m.content),
      };
      
      // Load preferences
      for (const mem of userFacts.filter(m => m.type === 'Preference')) {
        if (mem.data) {
          Object.assign(userContext.preferences, mem.data);
        }
      }
      
      // Get system instructions
      const instructions = await store.search('', { types: ['Instruction'], limit: 5 });
      
      return {
        recentMessages,
        relevantMemories,
        userContext,
        systemInstructions: instructions.map(m => m.content),
        estimatedTokens: estimateTokens(recentMessages, relevantMemories),
      };
    },
    
    async remember(partial) {
      const memory: AgentMemory = {
        ...partial,
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2)}` as EntityId,
        createdAt: Date.now() as Timestamp,
        lastAccessedAt: Date.now() as Timestamp,
      };
      
      await store.save(memory);
      return memory;
    },
    
    async setPreference(userId, key, value) {
      await this.remember({
        type: 'Preference',
        content: `User prefers ${key}: ${value}`,
        data: { [key]: value },
        subjectId: userId,
        realmId: 'default' as EntityId,
        importance: 'High',
        tags: ['preference', key],
      });
    },
    
    async recordFact(userId, fact) {
      await this.remember({
        type: 'Fact',
        content: fact,
        subjectId: userId,
        realmId: 'default' as EntityId,
        importance: 'Medium',
        tags: ['fact'],
      });
    },
    
    async consolidate(realmId) {
      return store.consolidate(realmId);
    },
    
    async clearConversation(sessionId) {
      sessionMessages.delete(sessionId);
    },
  };
}

function estimateTokens(
  messages: readonly ConversationMessage[], 
  memories: readonly AgentMemory[]
): number {
  let chars = 0;
  for (const m of messages) chars += m.content.length;
  for (const m of memories) chars += m.content.length;
  return Math.ceil(chars / 4); // Rough token estimate
}
