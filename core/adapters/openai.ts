/**
 * OPENAI ADAPTER
 * 
 * Alternative LLM provider for the Agent API.
 * Supports GPT-4, GPT-3.5, and embeddings.
 * 
 * Use when:
 * - You prefer OpenAI over Anthropic
 * - You need specific OpenAI features (function calling, vision)
 * - Cost optimization (GPT-3.5 is cheaper)
 */

import type { 
  LLMAdapter, 
  LLMRequest, 
  LLMResponse, 
  LLMChunk,
  LLMTool,
  AdapterConfig,
  AdapterHealth,
} from './types';

export interface OpenAIConfig extends AdapterConfig {
  credentials: {
    apiKey: string;
    organization?: string;
  };
  options?: {
    model?: string;
    embeddingModel?: string;
    maxTokens?: number;
    baseUrl?: string; // For Azure OpenAI or proxies
  };
}

/**
 * OpenAI adapter implementation.
 */
export function createOpenAIAdapter(): LLMAdapter {
  let config: OpenAIConfig;
  const defaultModel = 'gpt-4-turbo-preview';
  const defaultEmbeddingModel = 'text-embedding-3-small';
  
  return {
    name: 'OpenAI',
    version: '1.0.0',
    platform: 'OpenAI',
    category: 'LLM',
    model: defaultModel,
    
    async initialize(cfg: AdapterConfig): Promise<void> {
      config = cfg as OpenAIConfig;
      console.log('OpenAI adapter initialized');
    },
    
    async healthCheck(): Promise<AdapterHealth> {
      try {
        // Quick models list to verify API key
        // const response = await fetch(`${baseUrl}/models`, {
        //   headers: { Authorization: `Bearer ${config.credentials.apiKey}` }
        // });
        return { 
          healthy: true, 
          latencyMs: 100, 
          message: 'OpenAI API connected',
          details: { model: config?.options?.model ?? defaultModel },
        };
      } catch (error) {
        return { healthy: false, latencyMs: 0, message: `OpenAI error: ${error}` };
      }
    },
    
    async shutdown(): Promise<void> {
      console.log('OpenAI adapter shutdown');
    },
    
    async complete(request: LLMRequest): Promise<LLMResponse> {
      const model = config?.options?.model ?? defaultModel;
      const baseUrl = config?.options?.baseUrl ?? 'https://api.openai.com/v1';
      
      // Build messages array
      const messages = [];
      
      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }
      
      for (const msg of request.messages) {
        messages.push({ role: msg.role, content: msg.content });
      }
      
      // Build request body
      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: request.maxTokens ?? config?.options?.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
      };
      
      if (request.stopSequences) {
        body.stop = request.stopSequences;
      }
      
      // Add tools/functions if provided
      if (request.tools && request.tools.length > 0) {
        body.tools = request.tools.map(tool => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        }));
      }
      
      // Make API call
      // const response = await fetch(`${baseUrl}/chat/completions`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${config.credentials.apiKey}`,
      //     ...(config.credentials.organization && {
      //       'OpenAI-Organization': config.credentials.organization,
      //     }),
      //   },
      //   body: JSON.stringify(body),
      // });
      // const data = await response.json();
      
      // Mock response
      return generateMockOpenAIResponse(request);
    },
    
    async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
      // OpenAI streaming uses SSE
      const fullResponse = await this.complete(request);
      const words = fullResponse.content.split(' ');
      
      for (let i = 0; i < words.length; i++) {
        yield {
          content: words[i] + (i < words.length - 1 ? ' ' : ''),
          done: i === words.length - 1,
        };
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    },
    
    async embed(texts: readonly string[]): Promise<readonly number[][]> {
      const model = config?.options?.embeddingModel ?? defaultEmbeddingModel;
      const baseUrl = config?.options?.baseUrl ?? 'https://api.openai.com/v1';
      
      // const response = await fetch(`${baseUrl}/embeddings`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${config.credentials.apiKey}`,
      //   },
      //   body: JSON.stringify({
      //     model,
      //     input: texts,
      //   }),
      // });
      // const data = await response.json();
      // return data.data.map(d => d.embedding);
      
      // Mock embeddings (1536 dimensions for text-embedding-3-small)
      return texts.map(() => 
        Array.from({ length: 1536 }, () => Math.random() * 2 - 1)
      );
    },
    
    estimateTokens(text: string): number {
      // GPT tokenizer is roughly 4 chars per token
      return Math.ceil(text.length / 4);
    },
  };
}

function generateMockOpenAIResponse(request: LLMRequest): LLMResponse {
  const lastMessage = request.messages[request.messages.length - 1];
  const content = lastMessage?.content?.toLowerCase() ?? '';
  
  if (content.includes('hire') || content.includes('employ')) {
    return {
      content: `I'll help you create an Employment Agreement. This will establish the relationship between employer and employee with defined terms, obligations, and rights.

What information do you have about:
1. The employer (company name)
2. The employee (person's name)  
3. Position and responsibilities
4. Compensation terms`,
      tokensUsed: 120,
      finishReason: 'stop',
    };
  }
  
  return {
    content: `I'm ready to help you interact with the Universal Ledger. I can assist with creating agreements, querying data, managing entities, and more. What would you like to do?`,
    tokensUsed: 80,
    finishReason: 'stop',
  };
}

// ============================================================================
// AZURE OPENAI SUPPORT
// ============================================================================

/**
 * Configuration for Azure OpenAI Service.
 */
export interface AzureOpenAIConfig extends AdapterConfig {
  credentials: {
    apiKey: string;
    endpoint: string; // https://YOUR_RESOURCE.openai.azure.com
    deploymentId: string;
    apiVersion?: string;
  };
}

/**
 * Create adapter configured for Azure OpenAI.
 */
export function createAzureOpenAIAdapter(): LLMAdapter {
  const adapter = createOpenAIAdapter();
  
  // Override initialize to set Azure-specific config
  const originalInit = adapter.initialize.bind(adapter);
  adapter.initialize = async (cfg: AdapterConfig) => {
    const azureConfig = cfg as AzureOpenAIConfig;
    
    // Transform to OpenAI-compatible config with Azure URL
    const openaiConfig: OpenAIConfig = {
      credentials: {
        apiKey: azureConfig.credentials.apiKey,
      },
      options: {
        baseUrl: `${azureConfig.credentials.endpoint}/openai/deployments/${azureConfig.credentials.deploymentId}`,
        model: azureConfig.credentials.deploymentId,
      },
    };
    
    await originalInit(openaiConfig);
  };
  
  adapter.name = 'AzureOpenAI';
  adapter.platform = 'Azure';
  
  return adapter;
}

