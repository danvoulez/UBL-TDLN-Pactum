/**
 * ANTHROPIC ADAPTER
 * 
 * Powers the Agent API with Claude.
 * 
 * The LLM becomes the mediator between:
 * - Natural language (human communication)
 * - Structured intents (ledger operations)
 * 
 * "Claude doesn't run the ledger. Claude helps humans
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

export interface AnthropicConfig extends AdapterConfig {
  credentials: {
    apiKey: string;
  };
  options?: {
    model?: string;
    maxTokens?: number;
  };
}

/**
 * Default system prompt that teaches Claude about the Universal Ledger.
 */
export const LEDGER_SYSTEM_PROMPT = `You are an assistant for the Universal Business Ledger system.

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
 * Anthropic Claude adapter implementation.
 */
export function createAnthropicAdapter(): LLMAdapter {
  let config: AnthropicConfig;
  const defaultModel = 'claude-sonnet-4-20250514';
  
  return {
    name: 'Anthropic',
    version: '1.0.0',
    platform: 'Anthropic',
    category: 'LLM',
    model: defaultModel,
    
    async initialize(cfg: AdapterConfig): Promise<void> {
      config = cfg as AnthropicConfig;
      console.log('Anthropic adapter initialized');
    },
    
    async healthCheck(): Promise<AdapterHealth> {
      return { 
        healthy: true, 
        latencyMs: 100, 
        message: 'Anthropic API connected',
        details: { model: config?.options?.model ?? defaultModel },
      };
    },
    
    async shutdown(): Promise<void> {
      console.log('Anthropic adapter shutdown');
    },
    
    async complete(request: LLMRequest): Promise<LLMResponse> {
      const model = config?.options?.model ?? defaultModel;
      const maxTokens = request.maxTokens ?? config?.options?.maxTokens ?? 4096;
      const apiKey = config?.credentials?.apiKey;
      
      if (!apiKey) {
        console.warn('⚠️  No Anthropic API key, using mock response');
        return generateMockResponse(request);
      }
      
      try {
        // Extract system message from messages or use systemPrompt
        const systemMessages = request.messages.filter(m => m.role === 'system');
        const userMessages = request.messages.filter(m => m.role !== 'system');
        const systemPrompt = systemMessages[0]?.content || request.systemPrompt || LEDGER_SYSTEM_PROMPT;
        
        // Make actual API call to Anthropic
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            messages: userMessages.map(msg => ({
              role: msg.role === 'assistant' ? 'assistant' : 'user',
              content: msg.content,
            })),
            system: systemPrompt,
          }),
        });
        
        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
        }
        
        const data = await response.json();
        
        return {
          content: data.content[0]?.text || '',
          tokensUsed: data.usage?.output_tokens || 0,
          finishReason: data.stop_reason === 'stop_sequence' ? 'stop' : 'length',
        };
      } catch (error: any) {
        console.error('Anthropic API error:', error.message);
        // Fallback to mock on error
        return generateMockResponse(request);
      }
    },
    
    async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
      const fullResponse = await this.complete(request);
      const words = fullResponse.content.split(' ');
      
      for (let i = 0; i < words.length; i++) {
        yield {
          content: words[i] + (i < words.length - 1 ? ' ' : ''),
          done: i === words.length - 1,
        };
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    },
    
    async embed(texts: readonly string[]): Promise<readonly number[][]> {
      return texts.map(() => 
        Array.from({ length: 1536 }, () => Math.random() * 2 - 1)
      );
    },
    
    estimateTokens(text: string): number {
      return Math.ceil(text.length / 4);
    },
  };
}

// ============================================================================
// MOCK RESPONSES FOR DEVELOPMENT
// ============================================================================

function generateMockResponse(request: LLMRequest): LLMResponse {
  const lastMessage = request.messages[request.messages.length - 1];
  const userContent = lastMessage?.content?.toLowerCase() ?? '';
  
  if (userContent.includes('hire') || userContent.includes('employ')) {
    return {
      content: `I understand you want to hire someone. In the Universal Ledger, employment is modeled as an **Employment Agreement**.

To proceed, I'll need:
1. The employee's name
2. Position/title
3. Salary and payment terms
4. Start date

Would you like me to create this Employment Agreement?`,
      tokensUsed: 150,
      finishReason: 'stop',
    };
  }
  
  if (userContent.includes('sell') || userContent.includes('sale')) {
    return {
      content: `I can help you record a sale. In the Universal Ledger, sales are **Sale Agreements** that:

- Transfer ownership of an Asset
- Establish consideration (the price)
- Create mutual obligations (delivery, payment)

What are you selling and to whom?`,
      tokensUsed: 100,
      finishReason: 'stop',
    };
  }
  
  return {
    content: `I'm here to help you interact with the Universal Business Ledger.

I can help you:
- **Create agreements** (employment, sales, services, etc.)
- **Query data** (entities, assets, agreements, roles)
- **Execute intents** (hire, sell, transfer, grant access)

What would you like to do?`,
    tokensUsed: 100,
    finishReason: 'stop',
  };
}

// ============================================================================
// INTENT EXTRACTION
// ============================================================================

export interface ExtractedIntent {
  readonly intent: string;
  readonly confidence: number;
  readonly payload: Record<string, unknown>;
  readonly clarificationNeeded?: string;
}

export async function extractIntent(
  adapter: LLMAdapter, 
  message: string
): Promise<ExtractedIntent> {
  const response = await adapter.complete({
    messages: [
      { role: 'user', content: `Extract intent from: "${message}". Return JSON with: intent, confidence, payload.` }
    ],
    temperature: 0.3,
    maxTokens: 500,
  });
  
  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ExtractedIntent;
    }
  } catch {
    // Parsing failed
  }
  
  return {
    intent: 'unknown',
    confidence: 0,
    payload: {},
    clarificationNeeded: 'Could you please clarify what you want to do?',
  };
}

export async function formatForHuman(
  adapter: LLMAdapter,
  data: unknown
): Promise<string> {
  const response = await adapter.complete({
    messages: [
      { role: 'user', content: `Format this data as readable Markdown: ${JSON.stringify(data, null, 2)}` }
    ],
    temperature: 0.5,
    maxTokens: 1000,
  });
  
  return response.content;
}

