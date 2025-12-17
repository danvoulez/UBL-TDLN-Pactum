/**
 * FAKE LLM ADAPTER - For Testing
 * 
 * Deterministic, no external calls, predictable responses.
 * Used in tests to avoid hitting real LLM APIs.
 */

import type { LLMAdapter, LLMRequest, LLMResponse, LLMChunk, AdapterConfig, AdapterHealth } from '../adapters/types';

export class FakeLLMAdapter implements LLMAdapter {
  readonly name = 'FakeLLM';
  readonly version = '1.0.0';
  readonly platform = 'Test' as const;
  readonly category = 'LLM' as const;
  readonly model = 'fake-model-v1';
  
  private config: AdapterConfig | null = null;
  
  async initialize(config: AdapterConfig): Promise<void> {
    this.config = config;
  }
  
  async healthCheck(): Promise<AdapterHealth> {
    return {
      healthy: true,
      latencyMs: 0,
      message: 'Fake LLM adapter is always healthy',
    };
  }
  
  async shutdown(): Promise<void> {
    // No-op
  }
  
  async complete(request: LLMRequest): Promise<LLMResponse> {
    // Deterministic response based on last user message
    const lastMessage = request.messages[request.messages.length - 1];
    const userText = lastMessage?.content || '';
    
    // Simple pattern matching for predictable responses
    let responseText = `FAKE: I understand you said "${userText.slice(0, 40)}". `;
    
    if (userText.toLowerCase().includes('hello') || userText.toLowerCase().includes('hi')) {
      responseText = 'Hello! How can I help you with the Universal Business Ledger today?';
    } else if (userText.toLowerCase().includes('agreement')) {
      responseText = 'I can help you create or manage agreements. What would you like to do?';
    } else if (userText.toLowerCase().includes('query') || userText.toLowerCase().includes('show')) {
      responseText = 'Here are the results of your query:\n\n- Item 1\n- Item 2\n- Item 3';
    } else if (userText.toLowerCase().includes('error') || userText.toLowerCase().includes('fail')) {
      // Simulate error response
      responseText = '';
    } else if (userText === '__welcome__') {
      responseText = `# Welcome! 👋

I'm your assistant for the Universal Business Ledger.

I can help you:
- **Create agreements** between entities
- **Query** your data
- **Track** obligations and fulfillments
- **Manage** roles and permissions

What would you like to do?`;
    } else {
      responseText = `I understand you want to: ${userText.slice(0, 50)}. How can I help you with that?`;
    }
    
    return {
      content: responseText,
      tokensUsed: Math.ceil(responseText.length / 4), // Rough estimate
      finishReason: 'stop',
      toolCalls: undefined,
    };
  }
  
  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const response = await this.complete(request);
    
    // Simulate streaming by chunking the response
    const words = response.content.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield {
        content: words[i] + (i < words.length - 1 ? ' ' : ''),
        finishReason: i === words.length - 1 ? 'stop' : undefined,
      };
    }
  }
  
  async embed(texts: readonly string[]): Promise<readonly number[][]> {
    // Return fake embeddings (all zeros for simplicity)
    return texts.map(() => new Array(1536).fill(0));
  }
  
  estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
}

/**
 * Create a fake LLM adapter for testing.
 */
export function createFakeLLMAdapter(): LLMAdapter {
  return new FakeLLMAdapter();
}

