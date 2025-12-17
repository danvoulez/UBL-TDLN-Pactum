#!/usr/bin/env node
/**
 * LEDGER CLI - Natural Language Interface
 * 
 * Interact with the Universal Ledger using natural language or commands.
 * 
 * Usage:
 *   ledger hire John at Acme Corp as Engineer
 *   ledger sell Product-123 to Customer-456
 *   ledger query employees --active
 *   ledger watch agreements --realm my-company
 *   ledger "what can I do with agreement agr-123?"
 */

import type { EntityId, ActorReference } from '../core/schema/ledger';
import type { Intent, IntentResult, Affordance } from '../core/api/intent-api';
import type { Query } from '../core/api/query-language';

// ============================================================================
// CLI CONFIGURATION
// ============================================================================

interface CLIConfig {
  readonly apiUrl: string;
  readonly realm: EntityId;
  readonly actorId: EntityId;
  readonly format: 'table' | 'json' | 'compact';
  readonly color: boolean;
  readonly verbose: boolean;
}

const DEFAULT_CONFIG: CLIConfig = {
  apiUrl: 'http://localhost:3000',
  realm: 'default' as EntityId,
  actorId: 'cli-user' as EntityId,
  format: 'table',
  color: true,
  verbose: false,
};

// ============================================================================
// COLORS (ANSI escape codes)
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  
  // Foreground
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Background
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

function c(color: keyof typeof colors, text: string, config: CLIConfig): string {
  if (!config.color) return text;
  return `${colors[color]}${text}${colors.reset}`;
}

// ============================================================================
// COMMAND PARSER
// ============================================================================

interface ParsedCommand {
  readonly type: 'intent' | 'query' | 'watch' | 'help' | 'config' | 'history' | 'natural';
  readonly intent?: string;
  readonly payload?: Record<string, unknown>;
  readonly flags?: Record<string, string | boolean>;
  readonly raw?: string;
}

function parseCommand(args: string[]): ParsedCommand {
  if (args.length === 0) {
    return { type: 'help' };
  }
  
  const command = args[0].toLowerCase();
  const rest = args.slice(1);
  
  // Extract flags
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = rest[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        flags[key] = nextArg;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  
  // Route to command type
  switch (command) {
    // Intent commands (verbs)
    case 'hire':
    case 'employ':
      return parseHireCommand(positional, flags);
    
    case 'fire':
    case 'terminate':
      return parseTerminateCommand(positional, flags);
    
    case 'sell':
      return parseSellCommand(positional, flags);
    
    case 'buy':
    case 'purchase':
      return parseBuyCommand(positional, flags);
    
    case 'agree':
    case 'consent':
    case 'accept':
      return parseConsentCommand(positional, flags);
    
    case 'propose':
      return parseProposeCommand(positional, flags);
    
    case 'register':
      return parseRegisterCommand(positional, flags);
    
    case 'transfer':
      return parseTransferCommand(positional, flags);
    
    case 'grant':
      return parseGrantCommand(positional, flags);
    
    case 'revoke':
      return parseRevokeCommand(positional, flags);
    
    // Query commands
    case 'query':
    case 'find':
    case 'list':
    case 'show':
      return parseQueryCommand(positional, flags);
    
    case 'get':
      return parseGetCommand(positional, flags);
    
    case 'history':
      return parseHistoryCommand(positional, flags);
    
    // Watch command (streaming)
    case 'watch':
    case 'stream':
    case 'follow':
      return parseWatchCommand(positional, flags);
    
    // Meta commands
    case 'help':
    case '?':
      return { type: 'help', payload: { topic: positional[0] } };
    
    case 'config':
      return { type: 'config', flags };
    
    case 'what':
      // "what can I do" style queries
      return parseWhatCommand(positional, flags);
    
    default:
      // Treat as natural language
      return {
        type: 'natural',
        raw: args.join(' '),
      };
  }
}

// ============================================================================
// COMMAND PARSERS
// ============================================================================

function parseHireCommand(positional: string[], flags: Record<string, string | boolean>): ParsedCommand {
  // hire <person> at <company> as <role>
  const atIndex = positional.findIndex(p => p.toLowerCase() === 'at');
  const asIndex = positional.findIndex(p => p.toLowerCase() === 'as');
  
  const person = positional.slice(0, atIndex > 0 ? atIndex : undefined).join(' ');
  const company = atIndex > 0 && asIndex > atIndex 
    ? positional.slice(atIndex + 1, asIndex).join(' ')
    : flags['company'] as string;
  const role = asIndex > 0 
    ? positional.slice(asIndex + 1).join(' ')
    : flags['role'] as string;
  
  return {
    type: 'intent',
    intent: 'hire',
    payload: {
      agreementType: 'employment',
      parties: [
        { entityId: company || 'company', role: 'Employer' },
        { entityId: person || 'employee', role: 'Employee' },
      ],
      terms: {
        description: `Employment as ${role || 'Employee'}`,
        clauses: role ? [{ id: 'position', type: 'position', content: role }] : [],
      },
    },
    flags,
  };
}

function parseTerminateCommand(positional: string[], flags: Record<string, string | boolean>): ParsedCommand {
  const agreementId = positional[0] || flags['agreement'] as string;
  const reason = positional.slice(1).join(' ') || flags['reason'] as string || 'Terminated via CLI';
  
  return {
    type: 'intent',
    intent: 'terminate',
    payload: {
      agreementId,
      reason,
    },
    flags,
  };
}

function parseSellCommand(positional: string[], flags: Record<string, string | boolean>): ParsedCommand {
  // sell <asset> to <buyer> [for <price>]
  const toIndex = positional.findIndex(p => p.toLowerCase() === 'to');
  const forIndex = positional.findIndex(p => p.toLowerCase() === 'for');
  
  const asset = positional.slice(0, toIndex > 0 ? toIndex : undefined).join(' ');
  const buyer = toIndex > 0 
    ? positional.slice(toIndex + 1, forIndex > toIndex ? forIndex : undefined).join(' ')
    : flags['to'] as string;
  const price = forIndex > 0 
    ? positional.slice(forIndex + 1).join(' ')
    : flags['price'] as string;
  
  return {
    type: 'intent',
    intent: 'sell',
    payload: {
      agreementType: 'sale',
      parties: [
        { entityId: flags['seller'] as string || 'self', role: 'Seller' },
        { entityId: buyer, role: 'Buyer' },
      ],
      assets: [{ assetId: asset, role: 'Subject' }],
      terms: {
        description: `Sale of ${asset}`,
        consideration: price ? { description: price } : undefined,
      },
    },
    flags,
  };
}

function parseBuyCommand(positional: string[], flags: Record<string, string | boolean>): ParsedCommand {
  // Buying is consenting to a sale agreement
  const agreementId = positional[0] || flags['agreement'] as string;
  
  return {
    type: 'intent',
    intent: 'consent',
    payload: {
      agreementId,
      method: 'Digital',
    },
    flags,
  };
}

function parseConsentCommand(positional: string[], flags: Record<string, string | boolean>): ParsedCommand {
  const agreementId = positional[0] || flags['agreement'] as string;
  const method = flags['method'] as string || 'Digital';
  
  return {
    type: 'intent',
    intent: 'consent',
    payload: {
      agreementId,
      method,
    },
    flags,
  };
}

function parseProposeCommand(positional: string[], flags: Record<string, string | boolean>): ParsedCommand {
  const agreementType = positional[0] || flags['type'] as string;
  
  return {
    type: 'intent',
    intent: 'propose',
    payload: {
      agreementType,
      parties: [], // Would need interactive input
      terms: { description: flags['description'] as string || '' },
    },
    flags,
  };
}

function parseRegisterCommand(positional: string[], flags: Record<string, string | boolean>): ParsedCommand {
  const entityType = positional[0] || flags['type'] as string || 'Person';
  const name = positional.slice(1).join(' ') || flags['name'] as string;
  
  return {
    type: 'intent',
    intent: 'register',
    payload: {
      entityType,
      identity: {
        name,
        identifiers: flags['id'] ? [{ scheme: 'custom', value: flags['id'] as string }] : [],
      },
    },
    flags,
  };
}

function parseTransferCommand(positional: string[], flags: Record<string, string | boolean>): ParsedCommand {
  // transfer <asset> to <entity>
  const toIndex = positional.findIndex(p => p.toLowerCase() === 'to');
  
  const asset = positional.slice(0, toIndex > 0 ? toIndex : 1).join(' ');
  const toEntity = toIndex > 0 ? positional.slice(toIndex + 1).join(' ') : positional[1];
  
  return {
    type: 'intent',
    intent: 'transfer',
    payload: {
      assetId: asset,
      toEntityId: toEntity,
      transferType: flags['custody'] ? 'Custody' : 'Ownership',
      agreementId: flags['agreement'] as string,
    },
    flags,
  };
}

function parseGrantCommand(positional: string[], flags: Record<string, string | boolean>): ParsedCommand {
  // grant <role> to <entity>
  const toIndex = positional.findIndex(p => p.toLowerCase() === 'to');
  
  const role = positional.slice(0, toIndex > 0 ? toIndex : 1).join(' ');
  const toEntity = toIndex > 0 ? positional.slice(toIndex + 1).join(' ') : positional[1];
  
  return {
    type: 'intent',
    intent: 'propose',
    payload: {
      agreementType: 'authorization',
      parties: [
        { entityId: 'self', role: 'Grantor' },
        { entityId: toEntity, role: 'Grantee' },
      ],
      terms: {
        description: `Grant ${role} role`,
        clauses: [{ id: 'role', type: 'role', content: role }],
      },
    },
    flags,
  };
}

function parseRevokeCommand(positional: string[], flags: Record<string, string | boolean>): ParsedCommand {
  const roleOrAgreement = positional[0];
  const fromEntity = positional[2]; // "revoke X from Y"
  
  return {
    type: 'intent',
    intent: 'terminate',
    payload: {
      agreementId: flags['agreement'] as string || roleOrAgreement,
      reason: `Revoked: ${positional.join(' ')}`,
    },
    flags,
  };
}

function parseQueryCommand(positional: string[], flags: Record<string, string | boolean>): ParsedCommand {
  const target = positional[0] || 'entities';
  
  return {
    type: 'query',
    payload: {
      queryType: mapQueryTarget(target),
      filters: buildFiltersFromFlags(flags),
    },
    flags,
  };
}

function parseGetCommand(positional: string[], flags: Record<string, string | boolean>): ParsedCommand {
  const type = positional[0];
  const id = positional[1];
  
  return {
    type: 'query',
    payload: {
      queryType: mapQueryTarget(type),
      filters: { id },
    },
    flags,
  };
}

function parseHistoryCommand(positional: string[], flags: Record<string, string | boolean>): ParsedCommand {
  const target = positional[0];
  
  return {
    type: 'query',
    payload: {
      queryType: 'Event',
      filters: { aggregateId: target },
      orderBy: [{ field: 'sequence', direction: 'desc' }],
      limit: parseInt(flags['limit'] as string) || 50,
    },
    flags,
  };
}

function parseWatchCommand(positional: string[], flags: Record<string, string | boolean>): ParsedCommand {
  const target = positional[0] || 'events';
  
  return {
    type: 'watch',
    payload: {
      subscriptionType: mapWatchTarget(target),
      filters: buildFiltersFromFlags(flags),
    },
    flags,
  };
}

function parseWhatCommand(positional: string[], flags: Record<string, string | boolean>): ParsedCommand {
  // "what can I do" / "what can I do with X"
  const withIndex = positional.findIndex(p => p.toLowerCase() === 'with');
  const targetId = withIndex > 0 ? positional.slice(withIndex + 1).join(' ') : undefined;
  
  return {
    type: 'intent',
    intent: 'what-can-i-do',
    payload: targetId ? { targetId } : {},
    flags,
  };
}

function mapQueryTarget(target: string): string {
  const map: Record<string, string> = {
    'entities': 'Entity',
    'entity': 'Entity',
    'people': 'Entity',
    'person': 'Entity',
    'orgs': 'Entity',
    'organizations': 'Entity',
    'agreements': 'Agreement',
    'agreement': 'Agreement',
    'contracts': 'Agreement',
    'assets': 'Asset',
    'asset': 'Asset',
    'products': 'Asset',
    'roles': 'Role',
    'role': 'Role',
    'events': 'Event',
    'history': 'Event',
    'employees': 'Role', // Special: query roles of type Employee
  };
  return map[target.toLowerCase()] || 'Entity';
}

function mapWatchTarget(target: string): string {
  const map: Record<string, string> = {
    'events': 'events',
    'all': 'events',
    'agreements': 'events',
    'assets': 'events',
    'workflows': 'workflow',
    'transitions': 'workflow',
  };
  return map[target.toLowerCase()] || 'events';
}

function buildFiltersFromFlags(flags: Record<string, string | boolean>): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  
  if (flags['realm']) filters.realm = flags['realm'];
  if (flags['type']) filters.type = flags['type'];
  if (flags['status']) filters.status = flags['status'];
  if (flags['active']) filters.isActive = true;
  if (flags['id']) filters.id = flags['id'];
  
  return filters;
}

// ============================================================================
// OUTPUT FORMATTERS
// ============================================================================

function formatResult(result: IntentResult, config: CLIConfig): string {
  if (config.format === 'json') {
    return JSON.stringify(result, null, 2);
  }
  
  const lines: string[] = [];
  
  // Status
  const statusIcon = result.success ? '✓' : '✗';
  const statusColor = result.success ? 'green' : 'red';
  lines.push(c(statusColor, `${statusIcon} ${result.outcome.type}`, config));
  
  // Outcome details
  switch (result.outcome.type) {
    case 'Created':
      lines.push(`  ID: ${c('cyan', result.outcome.id, config)}`);
      break;
    case 'Transitioned':
      lines.push(`  ${c('dim', result.outcome.from, config)} → ${c('bold', result.outcome.to, config)}`);
      break;
    case 'Transferred':
      lines.push(`  Asset: ${result.outcome.asset}`);
      lines.push(`  To: ${result.outcome.to}`);
      break;
  }
  
  // Events
  if (result.events.length > 0) {
    lines.push('');
    lines.push(c('dim', 'Events:', config));
    for (const evt of result.events) {
      lines.push(`  ${c('yellow', evt.type, config)} (${evt.id})`);
    }
  }
  
  // Affordances
  if (result.affordances.length > 0) {
    lines.push('');
    lines.push(c('dim', 'Next actions:', config));
    for (const aff of result.affordances) {
      lines.push(`  ${c('magenta', aff.intent, config)} - ${aff.description}`);
    }
  }
  
  // Errors
  if (result.errors && result.errors.length > 0) {
    lines.push('');
    lines.push(c('red', 'Errors:', config));
    for (const err of result.errors) {
      lines.push(`  ${err.code}: ${err.message}`);
      if (err.suggestion) {
        lines.push(`    ${c('dim', '→ ' + err.suggestion, config)}`);
      }
    }
  }
  
  return lines.join('\n');
}

function formatQueryResult(results: unknown[], config: CLIConfig): string {
  if (config.format === 'json') {
    return JSON.stringify(results, null, 2);
  }
  
  if (results.length === 0) {
    return c('dim', 'No results found', config);
  }
  
  // Simple table format
  const lines: string[] = [];
  lines.push(c('dim', `Found ${results.length} result(s):`, config));
  lines.push('');
  
  for (const item of results) {
    const obj = item as Record<string, unknown>;
    lines.push(c('cyan', `• ${obj.id || obj.name || 'Unknown'}`, config));
    for (const [key, value] of Object.entries(obj)) {
      if (key !== 'id' && key !== 'name' && value !== undefined) {
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        lines.push(`  ${c('dim', key + ':', config)} ${displayValue}`);
      }
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

function formatStreamEvent(event: unknown, config: CLIConfig): string {
  const evt = event as Record<string, unknown>;
  const timestamp = new Date(evt.timestamp as number).toISOString();
  const type = evt.type || evt.eventType;
  
  if (config.format === 'json') {
    return JSON.stringify(evt);
  }
  
  return `${c('dim', timestamp, config)} ${c('yellow', String(type), config)} ${c('cyan', String(evt.aggregateId || evt.id), config)}`;
}

// ============================================================================
// HELP TEXT
// ============================================================================

function getHelpText(topic?: string): string {
  if (topic) {
    return getTopicHelp(topic);
  }
  
  return `
${colors.bold}LEDGER CLI${colors.reset} - Universal Ledger Interface

${colors.yellow}USAGE${colors.reset}
  ledger <command> [arguments] [--flags]
  ledger "<natural language query>"

${colors.yellow}COMMANDS${colors.reset}

  ${colors.cyan}Intent Commands (Actions)${colors.reset}
    hire <person> at <company> as <role>    Create employment agreement
    fire <agreement-id> [reason]            Terminate agreement
    sell <asset> to <buyer> [for <price>]   Create sale agreement
    buy <agreement-id>                      Consent to purchase
    agree <agreement-id>                    Give consent
    propose <type> --description "..."      Propose new agreement
    register <type> <name>                  Register new entity
    transfer <asset> to <entity>            Transfer asset
    grant <role> to <entity>                Grant authorization
    revoke <role> from <entity>             Revoke authorization

  ${colors.cyan}Query Commands${colors.reset}
    query <target> [--filters]              Query entities/agreements/assets
    get <type> <id>                         Get specific item
    history <entity-id>                     Show event history
    what can I do [with <id>]               Show available actions

  ${colors.cyan}Streaming Commands${colors.reset}
    watch <target> [--filters]              Stream real-time updates
    watch events --realm <id>               Watch all events in realm
    watch agreements --status Active        Watch agreement changes
    watch workflows                         Watch workflow transitions

  ${colors.cyan}Meta Commands${colors.reset}
    help [topic]                            Show help
    config --key value                      Set configuration

${colors.yellow}FLAGS${colors.reset}
    --realm <id>          Target realm
    --format <type>       Output format: table, json, compact
    --verbose             Show detailed output
    --no-color            Disable colors

${colors.yellow}EXAMPLES${colors.reset}
    ledger hire "John Smith" at "Acme Corp" as "Engineer"
    ledger sell "Product-123" to "customer-456" for "1000 USD"
    ledger query employees --active
    ledger watch agreements --realm my-company
    ledger "what agreements involve John?"

${colors.dim}For more help on a topic: ledger help <topic>${colors.reset}
`;
}

function getTopicHelp(topic: string): string {
  const topics: Record<string, string> = {
    'hire': `
${colors.bold}HIRE COMMAND${colors.reset}

Create an employment agreement between an employer and employee.

${colors.yellow}USAGE${colors.reset}
  ledger hire <person> at <company> as <role>

${colors.yellow}EXAMPLES${colors.reset}
  ledger hire "John Smith" at "Acme Corp" as "Software Engineer"
  ledger hire john-123 at company-456 as Manager --start-date 2024-01-01

${colors.yellow}FLAGS${colors.reset}
  --company <id>      Employer entity ID (alternative to "at")
  --role <name>       Position/role name (alternative to "as")
  --start-date <date> Employment start date
  --salary <amount>   Salary amount
`,
    'query': `
${colors.bold}QUERY COMMAND${colors.reset}

Query entities, agreements, assets, or roles.

${colors.yellow}USAGE${colors.reset}
  ledger query <target> [--filters]

${colors.yellow}TARGETS${colors.reset}
  entities, people, orgs     Query entities
  agreements, contracts      Query agreements
  assets, products           Query assets
  roles, employees           Query roles

${colors.yellow}FLAGS${colors.reset}
  --type <type>       Filter by type
  --status <status>   Filter by status
  --active            Only active items
  --realm <id>        Filter by realm
  --limit <n>         Limit results

${colors.yellow}EXAMPLES${colors.reset}
  ledger query employees --active
  ledger query agreements --status Active --type sale
  ledger query assets --type Product
`,
    'watch': `
${colors.bold}WATCH COMMAND${colors.reset}

Stream real-time updates from the ledger.

${colors.yellow}USAGE${colors.reset}
  ledger watch <target> [--filters]

${colors.yellow}TARGETS${colors.reset}
  events              All events
  agreements          Agreement changes
  assets              Asset changes
  workflows           Workflow transitions

${colors.yellow}FLAGS${colors.reset}
  --realm <id>        Filter by realm
  --type <type>       Filter by event type
  --aggregate <id>    Filter by aggregate ID

${colors.yellow}EXAMPLES${colors.reset}
  ledger watch events --realm my-company
  ledger watch agreements --status Active
  ledger watch workflows
`,
  };
  
  return topics[topic.toLowerCase()] || `No help available for "${topic}". Try: ledger help`;
}

// ============================================================================
// MAIN CLI
// ============================================================================

interface CLI {
  run(args: string[]): Promise<void>;
}

export function createCLI(config: Partial<CLIConfig> = {}): CLI {
  const fullConfig: CLIConfig = { ...DEFAULT_CONFIG, ...config };
  
  return {
    async run(args: string[]) {
      // Handle --no-color flag early
      if (args.includes('--no-color')) {
        (fullConfig as any).color = false;
        args = args.filter(a => a !== '--no-color');
      }
      
      const command = parseCommand(args);
      
      switch (command.type) {
        case 'help':
          console.log(getHelpText(command.payload?.topic as string));
          break;
          
        case 'config':
          console.log('Current configuration:');
          console.log(JSON.stringify(fullConfig, null, 2));
          break;
          
        case 'intent':
          await executeIntent(command, fullConfig);
          break;
          
        case 'query':
          await executeQuery(command, fullConfig);
          break;
          
        case 'watch':
          await executeWatch(command, fullConfig);
          break;
          
        case 'natural':
          await executeNatural(command.raw!, fullConfig);
          break;
      }
    },
  };
}

async function executeIntent(command: ParsedCommand, config: CLIConfig): Promise<void> {
  console.log(c('dim', `→ Executing intent: ${command.intent}`, config));
  
  // In real implementation, this would call the API
  const mockResult: IntentResult = {
    success: true,
    outcome: { type: 'Created', entity: {}, id: `${command.intent}-${Date.now()}` as EntityId },
    events: [{ id: `evt-${Date.now()}` as EntityId, type: 'MockEvent', sequence: 1n }],
    affordances: [
      { intent: 'consent', description: 'Give consent to this agreement', required: ['method'] },
    ],
    meta: { processedAt: Date.now(), processingTime: 42 },
  };
  
  console.log('');
  console.log(formatResult(mockResult, config));
}

async function executeQuery(command: ParsedCommand, config: CLIConfig): Promise<void> {
  console.log(c('dim', `→ Querying: ${JSON.stringify(command.payload)}`, config));
  
  // Mock results
  const mockResults = [
    { id: 'entity-1', name: 'John Smith', type: 'Person', status: 'Active' },
    { id: 'entity-2', name: 'Jane Doe', type: 'Person', status: 'Active' },
  ];
  
  console.log('');
  console.log(formatQueryResult(mockResults, config));
}

async function executeWatch(command: ParsedCommand, config: CLIConfig): Promise<void> {
  console.log(c('dim', `→ Watching: ${JSON.stringify(command.payload)}`, config));
  console.log(c('yellow', 'Streaming events (Ctrl+C to stop)...', config));
  console.log('');
  
  // Mock streaming
  let seq = 0;
  const interval = setInterval(() => {
    const mockEvent = {
      id: `evt-${++seq}`,
      timestamp: Date.now(),
      type: ['AgreementCreated', 'AssetTransferred', 'ConsentRecorded'][seq % 3],
      aggregateId: `agg-${Math.floor(Math.random() * 100)}`,
    };
    console.log(formatStreamEvent(mockEvent, config));
  }, 2000);
  
  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('');
    console.log(c('dim', 'Stream closed.', config));
    process.exit(0);
  });
}

async function executeNatural(text: string, config: CLIConfig): Promise<void> {
  console.log(c('dim', `→ Understanding: "${text}"`, config));
  
  // Simple pattern matching (would use NLP in production)
  const lower = text.toLowerCase();
  
  if (lower.includes('what') && lower.includes('agreement')) {
    console.log('');
    console.log(c('cyan', 'Interpreting as: query agreements', config));
    await executeQuery({ type: 'query', payload: { queryType: 'Agreement' } }, config);
  } else if (lower.includes('who') && lower.includes('work')) {
    console.log('');
    console.log(c('cyan', 'Interpreting as: query employees', config));
    await executeQuery({ type: 'query', payload: { queryType: 'Role', filters: { roleType: 'Employee' } } }, config);
  } else {
    console.log('');
    console.log(c('yellow', "I'm not sure what you mean. Try:", config));
    console.log('  ledger help');
    console.log('  ledger query <target>');
    console.log('  ledger <verb> <arguments>');
  }
}

// ============================================================================
// ENTRYPOINT
// ============================================================================

// Export for programmatic use
export { parseCommand, formatResult, formatQueryResult, getHelpText };

// CLI entrypoint
if (typeof require !== 'undefined' && require.main === module) {
  const cli = createCLI();
  cli.run(process.argv.slice(2)).catch(console.error);
}

