/**
 * OPENAPI/SWAGGER STANDARD
 * 
 * OpenAPI is THE standard for describing REST APIs.
 * Every API gateway, documentation tool, and code generator supports it.
 * 
 * By generating OpenAPI specs, companies can:
 * - Use any API gateway (Kong, AWS API Gateway, Apigee)
 * - Generate client SDKs in any language
 * - Import into Postman, Insomnia, etc.
 * - Auto-generate documentation
 * 
 * Our Intent-driven API has a simple spec, but it's fully OpenAPI compliant.
 */

import type { IntentDefinition } from '../../api/intent-api';

// ============================================================================
// OPENAPI 3.1 SPECIFICATION
// ============================================================================

/**
 * Generate OpenAPI 3.1 specification for the Universal Ledger API.
 */
export function generateOpenAPISpec(options: {
  title?: string;
  version?: string;
  serverUrl?: string;
  intents?: readonly IntentDefinition[];
}): OpenAPISpec {
  const { 
    title = 'Universal Business Ledger API',
    version = '1.0.0',
    serverUrl = 'http://localhost:3000',
    intents = [],
  } = options;

  return {
    openapi: '3.1.0',
    info: {
      title,
      version,
      description: `
The Universal Business Ledger API is **intent-driven**.

Instead of traditional REST endpoints like \`POST /employees\`, you express **what you want to achieve**:

\`\`\`json
POST /intent
{
  "intent": "hire",
  "payload": { "employeeId": "...", "terms": {...} }
}
\`\`\`

The API returns:
- **outcome**: What happened
- **affordances**: What you can do next

This makes the API self-documenting and discoverable.
      `.trim(),
      contact: {
        name: 'Universal Ledger',
        url: 'https://github.com/danvoulez/Universal-Business-Ledger',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    
    servers: [
      { url: serverUrl, description: 'API Server' },
    ],
    
    tags: [
      { name: 'Intent', description: 'Execute business intents' },
      { name: 'Query', description: 'Query the ledger' },
      { name: 'Agent', description: 'Natural language interface' },
      { name: 'Realtime', description: 'WebSocket & SSE subscriptions' },
      { name: 'Health', description: 'System health checks' },
    ],
    
    paths: {
      // Intent API
      '/intent': {
        post: {
          operationId: 'executeIntent',
          tags: ['Intent'],
          summary: 'Execute a business intent',
          description: 'Express what you want to achieve. The system figures out how.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/IntentRequest' },
                examples: {
                  hire: {
                    summary: 'Hire an employee',
                    value: {
                      intent: 'hire',
                      payload: {
                        employerId: 'ent-acme-corp',
                        employeeId: 'ent-john-doe',
                        terms: {
                          position: 'Software Engineer',
                          salary: { amount: 100000, currency: 'USD' },
                        },
                      },
                    },
                  },
                  sell: {
                    summary: 'Sell an asset',
                    value: {
                      intent: 'sell',
                      payload: {
                        sellerId: 'ent-seller',
                        buyerId: 'ent-buyer',
                        assetId: 'ast-widget-123',
                        price: { amount: 500, currency: 'USD' },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Intent executed successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/IntentResult' },
                },
              },
            },
            '400': {
              description: 'Invalid intent or validation error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '403': {
              description: 'Not authorized to perform this intent',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      
      '/intent/{intent}': {
        get: {
          operationId: 'describeIntent',
          tags: ['Intent'],
          summary: 'Describe an intent',
          description: 'Get the schema and description for a specific intent.',
          parameters: [
            {
              name: 'intent',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              examples: {
                hire: { value: 'hire' },
                sell: { value: 'sell' },
                transfer: { value: 'transfer' },
              },
            },
          ],
          responses: {
            '200': {
              description: 'Intent description',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/IntentDefinition' },
                },
              },
            },
            '404': {
              description: 'Intent not found',
            },
          },
        },
      },
      
      '/intents': {
        get: {
          operationId: 'listIntents',
          tags: ['Intent'],
          summary: 'List available intents',
          description: 'Get all intents the current actor can execute.',
          responses: {
            '200': {
              description: 'List of available intents',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/IntentDefinition' },
                  },
                },
              },
            },
          },
        },
      },
      
      // Query API
      '/query': {
        post: {
          operationId: 'executeQuery',
          tags: ['Query'],
          summary: 'Execute a query',
          description: 'Query the ledger with the declarative query language.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Query' },
                examples: {
                  activeAgreements: {
                    summary: 'Get active agreements',
                    value: {
                      select: { type: 'Agreement' },
                      where: [{ field: 'status', operator: 'eq', value: 'Active' }],
                      orderBy: [{ field: 'createdAt', direction: 'desc' }],
                      limit: 10,
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Query results',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/QueryResult' },
                },
              },
            },
          },
        },
      },
      
      // Agent API (Chat)
      '/chat': {
        post: {
          operationId: 'chat',
          tags: ['Agent'],
          summary: 'Chat with the ledger',
          description: 'Natural language interface to the ledger. Ask questions, execute intents.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatRequest' },
                examples: {
                  question: {
                    summary: 'Ask a question',
                    value: {
                      message: 'Show me all employees hired this month',
                      sessionId: 'session-123',
                    },
                  },
                  intent: {
                    summary: 'Execute via natural language',
                    value: {
                      message: 'Hire John Doe as a Software Engineer at $100k',
                      sessionId: 'session-123',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Chat response',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ChatResponse' },
                },
              },
            },
          },
        },
      },
      
      // Realtime
      '/events': {
        get: {
          operationId: 'streamEvents',
          tags: ['Realtime'],
          summary: 'Stream events (SSE)',
          description: 'Server-Sent Events stream of ledger events.',
          parameters: [
            {
              name: 'types',
              in: 'query',
              schema: { type: 'string' },
              description: 'Comma-separated event types to subscribe to',
            },
            {
              name: 'aggregateType',
              in: 'query',
              schema: { type: 'string' },
              description: 'Filter by aggregate type',
            },
            {
              name: 'after',
              in: 'query',
              schema: { type: 'string' },
              description: 'Start after this sequence number',
            },
          ],
          responses: {
            '200': {
              description: 'Event stream',
              content: {
                'text/event-stream': {
                  schema: { type: 'string' },
                },
              },
            },
          },
        },
      },
      
      // Health
      '/health': {
        get: {
          operationId: 'healthCheck',
          tags: ['Health'],
          summary: 'Health check',
          responses: {
            '200': {
              description: 'System is healthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthStatus' },
                },
              },
            },
            '503': {
              description: 'System is unhealthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthStatus' },
                },
              },
            },
          },
        },
      },
      
      '/health/live': {
        get: {
          operationId: 'liveness',
          tags: ['Health'],
          summary: 'Liveness probe',
          description: 'For Kubernetes liveness probe',
          responses: {
            '200': { description: 'Service is alive' },
          },
        },
      },
      
      '/health/ready': {
        get: {
          operationId: 'readiness',
          tags: ['Health'],
          summary: 'Readiness probe',
          description: 'For Kubernetes readiness probe',
          responses: {
            '200': { description: 'Service is ready' },
            '503': { description: 'Service is not ready' },
          },
        },
      },
    },
    
    components: {
      schemas: {
        IntentRequest: {
          type: 'object',
          required: ['intent'],
          properties: {
            intent: {
              type: 'string',
              description: 'The intent to execute (e.g., "hire", "sell", "transfer")',
            },
            payload: {
              type: 'object',
              description: 'Intent-specific parameters',
              additionalProperties: true,
            },
            idempotencyKey: {
              type: 'string',
              description: 'Optional key for idempotent execution',
            },
          },
        },
        
        IntentResult: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            intent: { type: 'string' },
            outcome: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['Created', 'Updated', 'Transitioned', 'NoChange'] },
                aggregateType: { type: 'string' },
                aggregateId: { type: 'string' },
                data: { type: 'object' },
              },
            },
            affordances: {
              type: 'array',
              items: { $ref: '#/components/schemas/Affordance' },
              description: 'What you can do next',
            },
            events: {
              type: 'array',
              items: { type: 'string' },
              description: 'Event IDs produced',
            },
          },
        },
        
        Affordance: {
          type: 'object',
          properties: {
            intent: { type: 'string' },
            description: { type: 'string' },
            available: { type: 'boolean' },
            requiredRole: { type: 'string' },
            schema: { type: 'object' },
          },
        },
        
        IntentDefinition: {
          type: 'object',
          properties: {
            intent: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            requiredFields: { type: 'array', items: { type: 'string' } },
            optionalFields: { type: 'array', items: { type: 'string' } },
            produces: { type: 'array', items: { type: 'string' } },
            examples: { type: 'array', items: { type: 'object' } },
          },
        },
        
        Query: {
          type: 'object',
          properties: {
            select: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['Entity', 'Agreement', 'Asset', 'Role', 'Event'] },
                fields: { type: 'array', items: { type: 'string' } },
              },
            },
            where: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  operator: { type: 'string', enum: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'] },
                  value: {},
                },
              },
            },
            orderBy: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  direction: { type: 'string', enum: ['asc', 'desc'] },
                },
              },
            },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
            at: { type: 'integer', description: 'Timestamp for temporal query' },
          },
        },
        
        QueryResult: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'object' } },
            total: { type: 'integer' },
            hasMore: { type: 'boolean' },
            meta: {
              type: 'object',
              properties: {
                executionTime: { type: 'number' },
                scannedEvents: { type: 'integer' },
              },
            },
          },
        },
        
        ChatRequest: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string' },
            sessionId: { type: 'string' },
            context: { type: 'object' },
          },
        },
        
        ChatResponse: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Markdown-formatted response' },
            intent: { type: 'string', description: 'Detected intent, if any' },
            intentResult: { $ref: '#/components/schemas/IntentResult' },
            affordances: {
              type: 'array',
              items: { $ref: '#/components/schemas/Affordance' },
            },
            sessionId: { type: 'string' },
          },
        },
        
        HealthStatus: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            version: { type: 'string' },
            uptime: { type: 'number' },
            checks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  status: { type: 'string' },
                  latency: { type: 'number' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'object' },
          },
        },
      },
      
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token from your identity provider (Auth0, Okta, etc.)',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for service-to-service communication',
        },
      },
    },
    
    security: [
      { bearerAuth: [] },
      { apiKey: [] },
    ],
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
    contact?: { name?: string; url?: string; email?: string };
    license?: { name: string; url?: string };
  };
  servers: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, OpenAPIOperation>>;
  components?: {
    schemas?: Record<string, OpenAPISchema>;
    securitySchemes?: Record<string, OpenAPISecurityScheme>;
  };
  security?: Array<Record<string, string[]>>;
}

export interface OpenAPIOperation {
  operationId?: string;
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: {
    required?: boolean;
    content: Record<string, { schema: OpenAPISchema; examples?: Record<string, { summary?: string; value: unknown }> }>;
  };
  responses: Record<string, {
    description: string;
    content?: Record<string, { schema: OpenAPISchema }>;
  }>;
}

export interface OpenAPIParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  schema: OpenAPISchema;
  description?: string;
  examples?: Record<string, { value: unknown }>;
}

export interface OpenAPISchema {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, OpenAPISchema>;
  items?: OpenAPISchema;
  required?: string[];
  enum?: string[];
  $ref?: string;
  additionalProperties?: boolean | OpenAPISchema;
}

export interface OpenAPISecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  in?: string;
  name?: string;
  description?: string;
}

// ============================================================================
// EXPORT FORMATS
// ============================================================================

/**
 * Export OpenAPI spec as JSON.
 */
export function exportAsJSON(spec: OpenAPISpec): string {
  return JSON.stringify(spec, null, 2);
}

/**
 * Export OpenAPI spec as YAML.
 */
export function exportAsYAML(spec: OpenAPISpec): string {
  // Simple YAML serialization (for full support, use a library)
  return toYAML(spec);
}

function toYAML(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);
  
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'string') {
    if (obj.includes('\n')) {
      return `|\n${obj.split('\n').map(line => spaces + '  ' + line).join('\n')}`;
    }
    return obj.includes(':') || obj.includes('#') ? `"${obj}"` : obj;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map(item => `${spaces}- ${toYAML(item, indent + 1).trimStart()}`).join('\n');
  }
  
  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    return entries
      .map(([key, value]) => {
        const yamlValue = toYAML(value, indent + 1);
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return `${spaces}${key}:\n${yamlValue}`;
        }
        return `${spaces}${key}: ${yamlValue}`;
      })
      .join('\n');
  }
  
  return String(obj);
}

