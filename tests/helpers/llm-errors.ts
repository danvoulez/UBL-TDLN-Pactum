/**
 * LLM-FRIENDLY ERROR HELPERS
 * 
 * Erros estruturados e descritivos para facilitar debugging por LLMs:
 * - Códigos de erro únicos
 * - Contexto completo
 * - Sugestões de correção
 * - Localização exata
 * 
 * Uso:
 *   throw llmError('TEST_EVENT_INTEGRITY', 'Event integrity failed', { event, errors });
 */

export interface LLMErrorContext {
  [key: string]: any;
}

export interface LLMErrorInfo {
  code: string;
  type: string;
  message: string;
  context: LLMErrorContext;
  location: {
    file?: string;
    line?: number;
    function?: string;
  };
  suggestion: string;
  stack?: string;
}

/**
 * Códigos de erro únicos para testes
 */
export const TEST_ERROR_CODES = {
  EVENT_INTEGRITY: 'TE001',
  EVENT_SEQUENCE: 'TE002',
  HASH_CHAIN: 'TE003',
  TIMESTAMP_INVALID: 'TE004',
  REALM_ISOLATION: 'TE005',
  ACTOR_MISSING: 'TE006',
  INTENT_RESULT: 'TE007',
  PERFORMANCE: 'TE008',
  SETUP_FAILED: 'TE009',
  CLEANUP_FAILED: 'TE010',
  ASSERTION_FAILED: 'TE011',
  TYPE_MISMATCH: 'TE012',
  VALUE_OUT_OF_RANGE: 'TE013',
  MISSING_REQUIRED_FIELD: 'TE014',
  INVALID_FORMAT: 'TE015',
} as const;

/**
 * Cria erro estruturado LLM-friendly
 */
export function llmError(
  code: keyof typeof TEST_ERROR_CODES,
  message: string,
  context: LLMErrorContext = {},
  suggestion: string = ''
): Error {
  const errorCode = TEST_ERROR_CODES[code];
  const stack = new Error().stack;
  const stackLines = stack?.split('\n') || [];
  
  // Extrair localização do stack trace
  const callerLine = stackLines[2] || '';
  const locationMatch = callerLine.match(/at .+ \((.+):(\d+):(\d+)\)/) || 
                        callerLine.match(/at (.+):(\d+):(\d+)/);
  
  const location = {
    file: locationMatch ? locationMatch[1] : undefined,
    line: locationMatch ? parseInt(locationMatch[2]) : undefined,
    function: callerLine.match(/at (.+?) \(/)?.[1] || undefined,
  };

  // Gerar sugestão padrão se não fornecida
  const defaultSuggestion = suggestion || generateDefaultSuggestion(code, context);
  
  // Criar mensagem estruturada
  const structuredMessage = formatLLMError({
    code: errorCode,
    type: code,
    message,
    context,
    location,
    suggestion: defaultSuggestion,
    stack,
  });

  const error = new Error(structuredMessage);
  (error as any).llmInfo = {
    code: errorCode,
    type: code,
    message,
    context,
    location,
    suggestion: defaultSuggestion,
  };
  
  return error;
}

/**
 * Formata erro para exibição LLM-friendly
 */
function formatLLMError(info: LLMErrorInfo): string {
  const lines: string[] = [];
  
  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push(`║              ❌ ERRO: ${info.code} - ${info.type}              ║`);
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push('📋 MENSAGEM:');
  lines.push(`   ${info.message}`);
  lines.push('');
  
  if (Object.keys(info.context).length > 0) {
    lines.push('🔍 CONTEXTO:');
    for (const [key, value] of Object.entries(info.context)) {
      const valueStr = typeof value === 'object' 
        ? JSON.stringify(value, null, 2).split('\n').map(l => `   ${l}`).join('\n')
        : String(value);
      lines.push(`   ${key}: ${valueStr}`);
    }
    lines.push('');
  }
  
  if (info.location.file) {
    lines.push('📍 LOCALIZAÇÃO:');
    lines.push(`   Arquivo: ${info.location.file}`);
    if (info.location.line) {
      lines.push(`   Linha: ${info.location.line}`);
    }
    if (info.location.function) {
      lines.push(`   Função: ${info.location.function}`);
    }
    lines.push('');
  }
  
  if (info.suggestion) {
    lines.push('💡 SUGESTÃO DE CORREÇÃO:');
    lines.push(`   ${info.suggestion}`);
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Gera sugestão padrão baseada no código de erro
 */
function generateDefaultSuggestion(
  code: keyof typeof TEST_ERROR_CODES,
  context: LLMErrorContext
): string {
  switch (code) {
    case 'EVENT_INTEGRITY':
      return `Verifique se o evento possui todos os campos obrigatórios:
  - id, sequence, timestamp, type, aggregateId, aggregateType
  - aggregateVersion, actor, hash, previousHash
  - payload (se aplicável)
Evento recebido: ${JSON.stringify(context.event, null, 2)}`;
    
    case 'EVENT_SEQUENCE':
      return `Verifique se a sequência de eventos está correta:
  - Sequências devem ser monotônicas (crescentes)
  - Cada evento deve ter sequence = previous.sequence + 1n
  - Verifique se há eventos faltando ou duplicados
Sequência esperada: ${context.expectedSequence}, recebida: ${context.actualSequence}`;
    
    case 'HASH_CHAIN':
      return `Verifique a integridade da hash chain:
  - Cada evento.hash deve ser calculado corretamente
  - Cada evento.previousHash deve corresponder ao hash do evento anterior
  - Verifique se algum evento foi modificado após criação
Evento com problema: ${context.eventId || 'desconhecido'}`;
    
    case 'TIMESTAMP_INVALID':
      return `Verifique o timestamp do evento:
  - Deve ser um número positivo
  - Não deve estar muito no futuro (> 1 minuto)
  - Não deve estar muito no passado (> 10 anos)
Timestamp recebido: ${context.timestamp}, agora: ${Date.now()}`;
    
    case 'REALM_ISOLATION':
      return `Verifique isolamento de realms:
  - Eventos de diferentes realms não devem se referenciar
  - Verifique se realmId está correto em todos os eventos
  - Verifique se não há vazamento de dados entre realms
Realm 1: ${context.realm1Id}, Realm 2: ${context.realm2Id}`;
    
    case 'ACTOR_MISSING':
      return `Verifique se o evento possui um actor válido:
  - actor.id deve ser uma string não vazia
  - actor.type deve ser um dos tipos válidos
  - actor.realm deve corresponder ao realm do evento
Evento sem actor: ${context.eventId || 'desconhecido'}`;
    
    case 'INTENT_RESULT':
      return `Verifique a estrutura do IntentResult:
  - Deve ter success: boolean
  - Deve ter outcome com type e dados
  - Deve ter meta com processedAt
  - Se success=false, deve ter error
Resultado recebido: ${JSON.stringify(context.result, null, 2)}`;
    
    case 'PERFORMANCE':
      return `Operação excedeu o tempo limite:
  - Tempo esperado: < ${context.maxMs}ms
  - Tempo real: ${context.actualMs}ms
  - Considere otimizar a operação ou aumentar o timeout
Operação: ${context.operation || 'desconhecida'}`;
    
    case 'SETUP_FAILED':
      return `Falha ao configurar ambiente de teste:
  - Verifique se todas as dependências estão instaladas
  - Verifique se variáveis de ambiente estão configuradas
  - Verifique conectividade com banco de dados (se aplicável)
Erro: ${context.error || 'desconhecido'}`;
    
    case 'ASSERTION_FAILED':
      return `Assertion falhou:
  - Valor esperado: ${JSON.stringify(context.expected)}
  - Valor recebido: ${JSON.stringify(context.actual)}
  - Verifique a lógica do teste e os dados de entrada
Campo: ${context.field || 'desconhecido'}`;
    
    default:
      return 'Verifique os dados de entrada e a lógica do teste.';
  }
}

/**
 * Wrapper para assertions com erro LLM-friendly
 */
export function assertLLM<T>(
  condition: T,
  code: keyof typeof TEST_ERROR_CODES,
  message: string,
  context: LLMErrorContext = {}
): asserts condition {
  if (!condition) {
    throw llmError(code, message, context);
  }
}

/**
 * Assert com comparação de valores
 */
export function assertEqualLLM<T>(
  actual: T,
  expected: T,
  field: string = 'value',
  context: LLMErrorContext = {}
): void {
  if (actual !== expected) {
    throw llmError('ASSERTION_FAILED', 
      `${field} não corresponde ao valor esperado`,
      {
        field,
        expected,
        actual,
        ...context,
      }
    );
  }
}

/**
 * Assert com validação de tipo
 */
export function assertTypeLLM(
  value: any,
  expectedType: string,
  field: string = 'value',
  context: LLMErrorContext = {}
): void {
  const actualType = typeof value;
  if (actualType !== expectedType) {
    throw llmError('TYPE_MISMATCH',
      `${field} tem tipo incorreto`,
      {
        field,
        expectedType,
        actualType,
        value,
        ...context,
      }
    );
  }
}

/**
 * Assert com validação de formato
 */
export function assertFormatLLM(
  value: string,
  format: RegExp | ((v: string) => boolean),
  field: string = 'value',
  context: LLMErrorContext = {}
): void {
  const isValid = typeof format === 'function' 
    ? format(value)
    : format.test(value);
    
  if (!isValid) {
    throw llmError('INVALID_FORMAT',
      `${field} não corresponde ao formato esperado`,
      {
        field,
        value,
        expectedFormat: format.toString(),
        ...context,
      }
    );
  }
}

