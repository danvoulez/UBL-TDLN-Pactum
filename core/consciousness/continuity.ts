/**
 * CONTINUITY - Agent Memory and Context Persistence
 * 
 * Ensures agents maintain identity across:
 * - Provider switches (OpenAI → Anthropic → etc.)
 * - Session boundaries
 * - Model updates
 * 
 * Components:
 * - Provider pooling strategy
 * - Memory hydration protocol
 * - Context injection
 */

import type { EntityId, Timestamp } from '../shared/types';

// =============================================================================
// PROVIDER POOLING
// =============================================================================

export type ProviderStatus = 'available' | 'degraded' | 'unavailable' | 'rate_limited';

export interface ProviderConfig {
  readonly id: string;
  readonly name: string;
  readonly models: string[];
  readonly priority: number;
  readonly costPerToken: number;
  readonly maxTokens: number;
  readonly rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

export interface ProviderState {
  readonly providerId: string;
  readonly status: ProviderStatus;
  readonly lastUsed: Timestamp | null;
  readonly requestCount: number;
  readonly tokenCount: number;
  readonly errorCount: number;
  readonly avgLatencyMs: number;
}

export class ProviderPool {
  private providers: Map<string, ProviderConfig> = new Map();
  private states: Map<string, ProviderState> = new Map();
  private currentProvider: string | null = null;
  
  constructor(providers: ProviderConfig[]) {
    for (const provider of providers) {
      this.providers.set(provider.id, provider);
      this.states.set(provider.id, {
        providerId: provider.id,
        status: 'available',
        lastUsed: null,
        requestCount: 0,
        tokenCount: 0,
        errorCount: 0,
        avgLatencyMs: 0,
      });
    }
  }
  
  /**
   * Select best available provider based on priority and status
   */
  selectProvider(): ProviderConfig | null {
    const available = Array.from(this.providers.values())
      .filter(p => {
        const state = this.states.get(p.id);
        return state?.status === 'available' || state?.status === 'degraded';
      })
      .sort((a, b) => a.priority - b.priority);
    
    if (available.length === 0) return null;
    
    this.currentProvider = available[0].id;
    return available[0];
  }
  
  /**
   * Report provider usage
   */
  reportUsage(providerId: string, tokens: number, latencyMs: number): void {
    const state = this.states.get(providerId);
    if (!state) return;
    
    const newAvgLatency = state.requestCount > 0
      ? (state.avgLatencyMs * state.requestCount + latencyMs) / (state.requestCount + 1)
      : latencyMs;
    
    this.states.set(providerId, {
      ...state,
      lastUsed: Date.now(),
      requestCount: state.requestCount + 1,
      tokenCount: state.tokenCount + tokens,
      avgLatencyMs: newAvgLatency,
    });
  }
  
  /**
   * Report provider error
   */
  reportError(providerId: string, error: string): void {
    const state = this.states.get(providerId);
    if (!state) return;
    
    const newErrorCount = state.errorCount + 1;
    const newStatus: ProviderStatus = newErrorCount > 5 ? 'unavailable' : 
                                       newErrorCount > 2 ? 'degraded' : 'available';
    
    this.states.set(providerId, {
      ...state,
      errorCount: newErrorCount,
      status: newStatus,
    });
  }
  
  /**
   * Mark provider as rate limited
   */
  markRateLimited(providerId: string, resetAt: Timestamp): void {
    const state = this.states.get(providerId);
    if (!state) return;
    
    this.states.set(providerId, {
      ...state,
      status: 'rate_limited',
    });
    
    // Auto-reset after cooldown
    setTimeout(() => {
      const currentState = this.states.get(providerId);
      if (currentState?.status === 'rate_limited') {
        this.states.set(providerId, {
          ...currentState,
          status: 'available',
        });
      }
    }, resetAt - Date.now());
  }
  
  getProviderState(providerId: string): ProviderState | undefined {
    return this.states.get(providerId);
  }
  
  getAllStates(): ProviderState[] {
    return Array.from(this.states.values());
  }
}

// =============================================================================
// MEMORY HYDRATION
// =============================================================================

export interface MemoryChunk {
  readonly id: string;
  readonly entityId: EntityId;
  readonly type: 'episodic' | 'semantic' | 'procedural';
  readonly content: string;
  readonly embedding?: number[];
  readonly importance: number;
  readonly createdAt: Timestamp;
  readonly lastAccessedAt: Timestamp;
  readonly accessCount: number;
  readonly decayFactor: number;
}

export interface HydrationConfig {
  maxTokens: number;
  recencyWeight: number;
  importanceWeight: number;
  accessWeight: number;
  minImportance: number;
}

const DEFAULT_HYDRATION_CONFIG: HydrationConfig = {
  maxTokens: 4000,
  recencyWeight: 0.3,
  importanceWeight: 0.5,
  accessWeight: 0.2,
  minImportance: 0.1,
};

export class MemoryHydrator {
  private memories: Map<string, MemoryChunk> = new Map();
  private config: HydrationConfig;
  
  constructor(config: Partial<HydrationConfig> = {}) {
    this.config = { ...DEFAULT_HYDRATION_CONFIG, ...config };
  }
  
  /**
   * Store a memory chunk
   */
  store(memory: Omit<MemoryChunk, 'lastAccessedAt' | 'accessCount' | 'decayFactor'>): void {
    this.memories.set(memory.id, {
      ...memory,
      lastAccessedAt: Date.now(),
      accessCount: 0,
      decayFactor: 1.0,
    });
  }
  
  /**
   * Hydrate context with relevant memories
   */
  hydrate(entityId: EntityId, query?: string): MemoryChunk[] {
    const entityMemories = Array.from(this.memories.values())
      .filter(m => m.entityId === entityId)
      .filter(m => m.importance >= this.config.minImportance);
    
    // Score each memory
    const scored = entityMemories.map(m => ({
      memory: m,
      score: this.scoreMemory(m),
    }));
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    // Select memories up to token limit
    const selected: MemoryChunk[] = [];
    let tokenCount = 0;
    
    for (const { memory } of scored) {
      const tokens = this.estimateTokens(memory.content);
      if (tokenCount + tokens > this.config.maxTokens) break;
      
      selected.push(memory);
      tokenCount += tokens;
      
      // Update access stats
      this.memories.set(memory.id, {
        ...memory,
        lastAccessedAt: Date.now(),
        accessCount: memory.accessCount + 1,
      });
    }
    
    return selected;
  }
  
  private scoreMemory(memory: MemoryChunk): number {
    const now = Date.now();
    const ageMs = now - memory.createdAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    
    // Recency score (exponential decay)
    const recencyScore = Math.exp(-ageDays / 30) * this.config.recencyWeight;
    
    // Importance score
    const importanceScore = memory.importance * this.config.importanceWeight;
    
    // Access score (log scale)
    const accessScore = Math.log(memory.accessCount + 1) / 10 * this.config.accessWeight;
    
    return (recencyScore + importanceScore + accessScore) * memory.decayFactor;
  }
  
  private estimateTokens(content: string): number {
    // Rough estimate: 4 chars per token
    return Math.ceil(content.length / 4);
  }
  
  /**
   * Apply decay to old memories
   */
  applyDecay(decayRate: number = 0.99): void {
    for (const [id, memory] of this.memories) {
      this.memories.set(id, {
        ...memory,
        decayFactor: memory.decayFactor * decayRate,
      });
    }
    
    // Remove memories with very low decay
    for (const [id, memory] of this.memories) {
      if (memory.decayFactor < 0.01) {
        this.memories.delete(id);
      }
    }
  }
  
  getMemoryCount(): number {
    return this.memories.size;
  }
}

// =============================================================================
// CONTEXT INJECTION
// =============================================================================

export interface ContextSection {
  readonly name: string;
  readonly content: string;
  readonly priority: number;
  readonly required: boolean;
}

export interface InjectionConfig {
  maxContextTokens: number;
  systemPromptTokens: number;
  memoryTokens: number;
  taskTokens: number;
}

const DEFAULT_INJECTION_CONFIG: InjectionConfig = {
  maxContextTokens: 8000,
  systemPromptTokens: 2000,
  memoryTokens: 3000,
  taskTokens: 3000,
};

export class ContextInjector {
  private config: InjectionConfig;
  private sections: ContextSection[] = [];
  
  constructor(config: Partial<InjectionConfig> = {}) {
    this.config = { ...DEFAULT_INJECTION_CONFIG, ...config };
  }
  
  /**
   * Add a context section
   */
  addSection(section: ContextSection): void {
    this.sections.push(section);
    this.sections.sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * Build complete context for LLM
   */
  buildContext(
    systemPrompt: string,
    memories: MemoryChunk[],
    task: string
  ): string {
    const parts: string[] = [];
    
    // System prompt (always included)
    parts.push(`<system>\n${systemPrompt}\n</system>`);
    
    // Memories
    if (memories.length > 0) {
      const memoryContent = memories
        .map(m => `[${m.type}] ${m.content}`)
        .join('\n');
      parts.push(`<memories>\n${memoryContent}\n</memories>`);
    }
    
    // Custom sections (by priority)
    for (const section of this.sections) {
      if (section.required || this.hasTokenBudget(parts, section.content)) {
        parts.push(`<${section.name}>\n${section.content}\n</${section.name}>`);
      }
    }
    
    // Task (always included)
    parts.push(`<task>\n${task}\n</task>`);
    
    return parts.join('\n\n');
  }
  
  private hasTokenBudget(currentParts: string[], newContent: string): boolean {
    const currentTokens = this.estimateTokens(currentParts.join('\n'));
    const newTokens = this.estimateTokens(newContent);
    return currentTokens + newTokens <= this.config.maxContextTokens;
  }
  
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }
  
  clearSections(): void {
    this.sections = [];
  }
}

// =============================================================================
// CONTINUITY MANAGER
// =============================================================================

export class ContinuityManager {
  private providerPool: ProviderPool;
  private hydrator: MemoryHydrator;
  private injector: ContextInjector;
  
  constructor(
    providers: ProviderConfig[],
    hydrationConfig?: Partial<HydrationConfig>,
    injectionConfig?: Partial<InjectionConfig>
  ) {
    this.providerPool = new ProviderPool(providers);
    this.hydrator = new MemoryHydrator(hydrationConfig);
    this.injector = new ContextInjector(injectionConfig);
  }
  
  /**
   * Prepare context for an agent execution
   */
  prepareExecution(
    entityId: EntityId,
    systemPrompt: string,
    task: string
  ): {
    provider: ProviderConfig | null;
    context: string;
    memories: MemoryChunk[];
  } {
    const provider = this.providerPool.selectProvider();
    const memories = this.hydrator.hydrate(entityId);
    const context = this.injector.buildContext(systemPrompt, memories, task);
    
    return { provider, context, memories };
  }
  
  /**
   * Record execution result
   */
  recordExecution(
    entityId: EntityId,
    providerId: string,
    tokens: number,
    latencyMs: number,
    output: string,
    importance: number = 0.5
  ): void {
    this.providerPool.reportUsage(providerId, tokens, latencyMs);
    
    // Store output as episodic memory
    this.hydrator.store({
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      entityId,
      type: 'episodic',
      content: output.slice(0, 1000), // Truncate long outputs
      importance,
      createdAt: Date.now(),
    });
  }
  
  /**
   * Record error
   */
  recordError(providerId: string, error: string): void {
    this.providerPool.reportError(providerId, error);
  }
  
  getProviderPool(): ProviderPool {
    return this.providerPool;
  }
  
  getHydrator(): MemoryHydrator {
    return this.hydrator;
  }
  
  getInjector(): ContextInjector {
    return this.injector;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createContinuityManager(
  providers: ProviderConfig[],
  hydrationConfig?: Partial<HydrationConfig>,
  injectionConfig?: Partial<InjectionConfig>
): ContinuityManager {
  return new ContinuityManager(providers, hydrationConfig, injectionConfig);
}

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    priority: 1,
    costPerToken: 0.00003,
    maxTokens: 128000,
    rateLimit: { requestsPerMinute: 500, tokensPerMinute: 150000 },
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
    priority: 2,
    costPerToken: 0.000015,
    maxTokens: 200000,
    rateLimit: { requestsPerMinute: 1000, tokensPerMinute: 100000 },
  },
  {
    id: 'google',
    name: 'Google',
    models: ['gemini-pro', 'gemini-ultra'],
    priority: 3,
    costPerToken: 0.00001,
    maxTokens: 32000,
    rateLimit: { requestsPerMinute: 300, tokensPerMinute: 60000 },
  },
];
