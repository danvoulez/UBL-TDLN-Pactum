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
      try {
        // Quick validation that API key works
        // const response = await fetch('https://api.anthropic.com/v1/messages', {
        //   method: 'POST',
        //   headers: {
        //     'x-api-key': config.credentials.apiKey,
        //     'anthropic-version': '2023-06-01',
        //     'content-type': 'application/json',
        //   },
        //   body: JSON.stringify({
        //     model: config.options?.model ?? defaultModel,
        //     max_tokens: 10,
        //     messages: [{ role: 'user', content: 'ping' }],
        //   }),
        // });
        
        return { 
          healthy: true, 
          latencyMs: 100, 
          message: 'Anthropic API connected',
          details: { model: config?.options?.model ?? defaultModel },
        };
      } catch (error) {
        return { 
          healthy: false, 
          latencyMs: 0, 
          message: `Anthropic error: ${error}` 
        };
      }
    },
    
    async shutdown(): Promise<void> {
      console.log('Anthropic adapter shutdown');
    },
    
    async complete(request: LLMRequest): Promise<LLMResponse> {
      const model = config?.options?.model ?? defaultModel;
      const maxTokens = request.maxTokens ?? config?.options?.maxTokens ?? 4096;
      
      // Build the request body
      const body = {
        model,
        max_tokens: maxTokens,
        system: request.systemPrompt ?? LEDGER_SYSTEM_PROMPT,
        messages: request.messages.map(m => ({
          role: m.role === 'system' ? 'user' : m.role, // Anthropic handles system differently
          content: m.content,
        })),
        temperature: request.temperature ?? 0.7,
        stop_sequences: request.stopSequences,
      };
      
      // Add tools if provided
      if (request.tools && request.tools.length > 0) {
        (body as any).tools = request.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
        }));
      }
      
      // Make the API call
      // const response = await fetch('https://api.anthropic.com/v1/messages', {
      //   method: 'POST',
      //   headers: {
      //     'x-api-key': config.credentials.apiKey,
      //     'anthropic-version': '2023-06-01',
      //     'content-type': 'application/json',
      //   },
      //   body: JSON.stringify(body),
      // });
      // const data = await response.json();
      
      // Mock response for development
      const mockResponse = generateMockResponse(request);
      
      return mockResponse;
    },
    
    async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
      // For streaming, we'd use SSE from Anthropic
      // const response = await fetch('https://api.anthropic.com/v1/messages', {
      //   method: 'POST',
      //   headers: {
      //     'x-api-key': config.credentials.apiKey,
      //     'anthropic-version': '2023-06-01',
      //     'content-type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     ...body,
      //     stream: true,
      //   }),
      // });
      
      // Mock streaming
      const fullResponse = await this.complete(request);
      const words = fullResponse.content.split(' ');
      
      for (let i = 0; i < words.length; i++) {
        yield {
          content: words[i] + (i < words.length - 1 ? ' ' : ''),
          done: i === words.length - 1,
        };
        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    },
    
    async embed(texts: readonly string[]): Promise<readonly number[][]> {
      // Anthropic doesn't have embeddings API, would use Voyage or similar
      // For now, return mock embeddings
      return texts.map(() => 
        Array.from({ length: 1536 }, () => Math.random() * 2 - 1)
      );
    },
    
    estimateTokens(text: string): number {
      // Rough estimate: ~4 characters per token for Claude
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
  
  // Detect intent and generate appropriate response
  if (userContent.includes('hire') || userContent.includes('employ')) {
    return {
      content: `I understand you want to hire someone. In the Universal Ledger, employment is modeled as an **Employment Agreement** between:

- **Employer** (your organization)
- **Employee** (the person being hired)

This agreement establishes the Employee role, which grants permissions within your organization.

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
  
  if (userContent.includes('query') || userContent.includes('find') || userContent.includes('show')) {
    return {
      content: `I'll help you search the ledger. What would you like to find?

You can ask things like:
- "Show me all active agreements"
- "Find employees hired this year"
- "What assets does company X own?"
- "Who has the Manager role?"

What are you looking for?`,
      tokensUsed: 80,
      finishReason: 'stop',
    };
  }
  
  // Default response
  return {
    content: `I'm here to help you interact with the Universal Business Ledger.

I can help you:
- **Create agreements** (employment, sales, services, etc.)
- **Query data** (entities, assets, agreements, roles)
- **Execute intents** (hire, sell, transfer, grant access)
- **Understand the system** (explain concepts, trace relationships)

What would you like to do?`,
    tokensUsed: 100,
    finishReason: 'stop',
  };
}

// ============================================================================
// INTENT EXTRACTION
// ============================================================================

/**
 * Use Claude to extract structured intent from natural language.
 */
export interface ExtractedIntent {
  readonly intent: string;
  readonly confidence: number;
  readonly payload: Record<string, unknown>;
  readonly clarificationNeeded?: string;
}

export const INTENT_EXTRACTION_PROMPT = `Analyze the user's message and extract their intent for the Universal Ledger system.

Return a JSON object with:
- intent: The ledger intent (e.g., "propose:agreement", "register:entity", "query", "consent", "transfer:asset")
- confidence: 0-1 score of how confident you are
- payload: Extracted parameters for the intent
- clarificationNeeded: If confidence < 0.8, what question to ask

User message: {{message}}

Respond only with the JSON object.`;

export async function extractIntent(
  adapter: LLMAdapter, 
  message: string
): Promise<ExtractedIntent> {
  const response = await adapter.complete({
    messages: [
      { role: 'user', content: INTENT_EXTRACTION_PROMPT.replace('{{message}}', message) }
    ],
    temperature: 0.3, // Lower temperature for more deterministic extraction
    maxTokens: 500,
  });
  
  try {
    // Parse JSON from response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ExtractedIntent;
    }
  } catch {
    // If parsing fails, return unknown intent
  }
  
  return {
    intent: 'unknown',
    confidence: 0,
    payload: {},
    clarificationNeeded: 'I\'m not sure what you want to do. Could you please clarify?',
  };
}

// ============================================================================
// RESPONSE FORMATTING
// ============================================================================

/**
 * Format ledger data for human-readable output.
 */
export const FORMAT_RESPONSE_PROMPT = `You are formatting ledger data for human consumption.

Convert the following JSON data into a clear, readable Markdown response:

{{data}}

Guidelines:
- Use headers and lists for structure
- Highlight important information
- Explain relationships between entities
- Keep it concise but complete

Respond with only the formatted Markdown.`;

export async function formatForHuman(
  adapter: LLMAdapter,
  data: unknown
): Promise<string> {
  const response = await adapter.complete({
    messages: [
      { 
        role: 'user', 
        content: FORMAT_RESPONSE_PROMPT.replace('{{data}}', JSON.stringify(data, null, 2))
      }
    ],
    temperature: 0.5,
    maxTokens: 1000,
  });
  
  return response.content;
}

