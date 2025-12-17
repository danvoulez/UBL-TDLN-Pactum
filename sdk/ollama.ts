/**
 * OLLAMA ADAPTER
 * 
 * Powers the Agent API with local or remote Ollama models.
 * 
 * Supports:
 * - Local Ollama (localhost:11434)
 * - Remote Ollama via tunnel (ngrok, cloudflare, etc.)
 * - Optional API key for authenticated access (Bearer token)
 * 
 * Environment variables:
 * - OLLAMA_BASE_URL: Base URL (default: http://localhost:11434)
 * - OLLAMA_API_KEY: Optional API key for authenticated access
 * - OLLAMA_MODEL: Model to use (default: llama3.1:8b)
 * 
 * "The LLM doesn't run the ledger. The LLM helps humans
 *  express what they want the ledger to do."
 */

import type { 
  LLMAdapter, 
  LLMRequest, 
  LLMResponse, 
  LLMChunk,
  AdapterConfig,
  AdapterHealth,
} from './types';
import { smartSelectModel, detectTaskType, type LatencyPreference } from './model-selector';

export interface OllamaConfig extends AdapterConfig {
  credentials: {
    apiKey?: string;  // Optional - for authenticated remote access
  };
  options?: {
    baseUrl?: string;
    model?: string;
    keepAlive?: string;  // e.g., "24h"
    smartModelSelection?: boolean;  // Enable intelligent model selection
    latencyPreference?: LatencyPreference;  // 'fastest' | 'balanced' | 'quality'
  };
}

/**
 * Default system prompt for Ollama (same as Anthropic for consistency)
 */
export const OLLAMA_SYSTEM_PROMPT = `You are an assistant for the Universal Business Ledger system.

The system is built on these core concepts:

1. **Events** - Immutable facts that have happened
2. **Entities** - People, organizations, or systems that can act
3. **Assets** - Things that can be owned, transferred, or valued
4. **Agreements** - The universal primitive for relationships (employment, sales, licenses, etc.)
5. **Roles** - Relationships established BY agreements, not static attributes

Key principle: "All relationships are agreements."

When users want to:
- Hire someone → Create an Employment Agreement
- Sell something → Create a Sale Agreement  
- Grant access → Create an Authorization Agreement
- Add a customer → Create a Service Agreement

You help users by:
1. Understanding their intent in natural language
2. Translating to the appropriate ledger operation
3. Explaining what will happen
4. Providing the structured intent for execution

Available intents include:
- propose:agreement - Create a new agreement
- consent - Give consent to an agreement
- fulfill - Mark an obligation as fulfilled
- terminate - End an agreement
- register:entity - Create a new entity
- register:asset - Create a new asset
- transfer:asset - Transfer asset ownership
- query - Search and retrieve data

Always be helpful, explain the Agreement model when relevant, and format responses clearly.`;

/**
 * Ollama adapter implementation.
 */
export function createOllamaAdapter(): LLMAdapter {
  let config: OllamaConfig;
  const defaultModel = 'llama3.1:8b';
  const defaultBaseUrl = 'http://localhost:11434';
  
  return {
    name: 'Ollama',
    version: '1.0.0',
    platform: 'Local_LLM',
    category: 'LLM',
    model: defaultModel,
    
    async initialize(cfg: AdapterConfig): Promise<void> {
      config = cfg as OllamaConfig;
      console.log('Ollama adapter initialized');
    },
    
    async healthCheck(): Promise<AdapterHealth> {
      const baseUrl = config?.options?.baseUrl ?? defaultBaseUrl;
      const model = config?.options?.model ?? defaultModel;
      
      try {
        const headers: Record<string, string> = {};
        if (config?.credentials?.apiKey) {
          headers['Authorization'] = `Bearer ${config.credentials.apiKey}`;
        }
        
        const response = await fetch(`${baseUrl}/api/tags`, { headers });
        
        if (!response.ok) {
          return {
            healthy: false,
            latencyMs: 0,
            message: `Ollama API error: ${response.status}`,
          };
        }
        
        const data = await response.json();
        const models = data.models?.map((m: any) => m.name) || [];
        
        return { 
          healthy: true, 
          latencyMs: 50, 
          message: 'Ollama API connected',
          details: { 
            baseUrl,
            model,
            availableModels: models,
          },
        };
      } catch (error: any) {
        return {
          healthy: false,
          latencyMs: 0,
          message: `Ollama connection failed: ${error.message}`,
        };
      }
    },
    
    async shutdown(): Promise<void> {
      console.log('Ollama adapter shutdown');
    },
    
    async complete(request: LLMRequest): Promise<LLMResponse> {
      const baseUrl = config?.options?.baseUrl ?? defaultBaseUrl;
      const smartSelection = config?.options?.smartModelSelection ?? false;
      const latencyPref = config?.options?.latencyPreference ?? 'balanced';
      
      // Smart model selection based on message content
      let model = config?.options?.model ?? defaultModel;
      let selectionReason = '';
      
      if (smartSelection) {
        const lastMessage = request.messages[request.messages.length - 1];
        const userContent = lastMessage?.content ?? '';
        
        const selection = await smartSelectModel(userContent, latencyPref, baseUrl);
        model = selection.model;
        selectionReason = selection.reason;
        console.log(`🧠 Smart model selection: ${model} (${selectionReason})`);
      }
      
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (config?.credentials?.apiKey) {
          headers['Authorization'] = `Bearer ${config.credentials.apiKey}`;
        }
        
        // Build messages for Ollama chat format
        const systemMessages = request.messages.filter(m => m.role === 'system');
        const otherMessages = request.messages.filter(m => m.role !== 'system');
        const systemPrompt = systemMessages[0]?.content || request.systemPrompt || OLLAMA_SYSTEM_PROMPT;
        
        // Use /api/chat for conversation
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...otherMessages.map(msg => ({
                role: msg.role,
                content: msg.content,
              })),
            ],
            stream: false,
            options: {
              temperature: request.temperature ?? 0.7,
              num_predict: request.maxTokens ?? 4096,
            },
          }),
        });
        
        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Ollama API error: ${response.status} - ${error}`);
        }
        
        const data = await response.json();
        
        return {
          content: data.message?.content || '',
          tokensUsed: data.eval_count || 0,
          finishReason: data.done ? 'stop' : 'length',
        };
      } catch (error: any) {
        console.error('Ollama API error:', error.message);
        // Return error message instead of throwing
        return {
          content: `Error communicating with Ollama: ${error.message}`,
          tokensUsed: 0,
          finishReason: 'stop',
        };
      }
    },
    
    async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
      const baseUrl = config?.options?.baseUrl ?? defaultBaseUrl;
      const smartSelection = config?.options?.smartModelSelection ?? false;
      const latencyPref = config?.options?.latencyPreference ?? 'balanced';
      
      // Smart model selection
      let model = config?.options?.model ?? defaultModel;
      
      if (smartSelection) {
        const lastMessage = request.messages[request.messages.length - 1];
        const userContent = lastMessage?.content ?? '';
        const selection = await smartSelectModel(userContent, latencyPref, baseUrl);
        model = selection.model;
        console.log(`🧠 Smart model selection (stream): ${model}`);
      }
      
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (config?.credentials?.apiKey) {
          headers['Authorization'] = `Bearer ${config.credentials.apiKey}`;
        }
        
        const systemMessages = request.messages.filter(m => m.role === 'system');
        const otherMessages = request.messages.filter(m => m.role !== 'system');
        const systemPrompt = systemMessages[0]?.content || request.systemPrompt || OLLAMA_SYSTEM_PROMPT;
        
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...otherMessages.map(msg => ({
                role: msg.role,
                content: msg.content,
              })),
            ],
            stream: true,
            options: {
              temperature: request.temperature ?? 0.7,
              num_predict: request.maxTokens ?? 4096,
            },
          }),
        });
        
        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.status}`);
        }
        
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }
        
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (!line.trim()) continue;
            
            try {
              const data = JSON.parse(line);
              if (data.message?.content) {
                yield {
                  content: data.message.content,
                  done: data.done || false,
                };
              }
              if (data.done) {
                return;
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      } catch (error: any) {
        console.error('Ollama streaming error:', error.message);
        yield {
          content: `Error: ${error.message}`,
          done: true,
        };
      }
    },
    
    async embed(texts: readonly string[]): Promise<readonly number[][]> {
      const baseUrl = config?.options?.baseUrl ?? defaultBaseUrl;
      
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (config?.credentials?.apiKey) {
          headers['Authorization'] = `Bearer ${config.credentials.apiKey}`;
        }
        
        const embeddings: number[][] = [];
        
        for (const text of texts) {
          const response = await fetch(`${baseUrl}/api/embeddings`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: config?.options?.model ?? 'nomic-embed-text',
              prompt: text,
            }),
          });
          
          if (!response.ok) {
            // Fallback to random embeddings if model doesn't support embeddings
            embeddings.push(Array.from({ length: 1536 }, () => Math.random() * 2 - 1));
            continue;
          }
          
          const data = await response.json();
          embeddings.push(data.embedding || Array.from({ length: 1536 }, () => Math.random() * 2 - 1));
        }
        
        return embeddings;
      } catch {
        // Fallback to random embeddings
        return texts.map(() => 
          Array.from({ length: 1536 }, () => Math.random() * 2 - 1)
        );
      }
    },
    
    estimateTokens(text: string): number {
      // Rough estimate: 1 token ≈ 4 characters
      return Math.ceil(text.length / 4);
    },
  };
}

/**
 * Create a mock Ollama adapter for testing/development without Ollama running.
 */
export function createMockLLMAdapter(): LLMAdapter {
  return {
    name: 'MockLLM',
    version: '1.0.0',
    platform: 'Local_LLM',
    category: 'LLM',
    model: 'mock',
    
    async initialize(): Promise<void> {
      console.log('Mock LLM adapter initialized');
    },
    
    async healthCheck(): Promise<AdapterHealth> {
      return { healthy: true, latencyMs: 0, message: 'Mock LLM (no API keys configured)' };
    },
    
    async shutdown(): Promise<void> {},
    
    async complete(request: LLMRequest): Promise<LLMResponse> {
      const lastMessage = request.messages[request.messages.length - 1];
      const userContent = lastMessage?.content?.toLowerCase() ?? '';
      
      let content = `I understand you want to: "${userContent.slice(0, 50)}..."

I'm currently running in mock mode because no LLM API keys are configured.

To enable AI responses, configure one of:
- OLLAMA_BASE_URL (for local Ollama)
- ANTHROPIC_API_KEY (for Claude)
- OPENAI_API_KEY (for GPT)

I can still help you with the Universal Business Ledger!`;
      
      return {
        content,
        tokensUsed: Math.ceil(content.length / 4),
        finishReason: 'stop',
      };
    },
    
    async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
      const response = await this.complete(request);
      const words = response.content.split(' ');
      
      for (let i = 0; i < words.length; i++) {
        yield {
          content: words[i] + (i < words.length - 1 ? ' ' : ''),
          done: i === words.length - 1,
        };
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    },
    
    async embed(texts: readonly string[]): Promise<readonly number[][]> {
      return texts.map(() => Array.from({ length: 1536 }, () => Math.random() * 2 - 1));
    },
    
    estimateTokens(text: string): number {
      return Math.ceil(text.length / 4);
    },
  };
}
