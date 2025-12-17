/**
 * API ERRORS - LLM-Friendly
 * 
 * Erros estruturados para respostas de API:
 * - Códigos de erro únicos
 * - Contexto completo
 * - Sugestões de correção
 * - Status HTTP apropriado
 */

export interface APIErrorContext {
  [key: string]: any;
}

export interface APIErrorInfo {
  code: string;
  type: string;
  message: string;
  statusCode: number;
  context: APIErrorContext;
  suggestion: string;
}

/**
 * Códigos de erro para API
 */
export const API_ERROR_CODES = {
  MISSING_INTENT: 'API001',
  INVALID_INTENT: 'API002',
  VALIDATION_ERROR: 'API003',
  UNAUTHORIZED: 'API004',
  FORBIDDEN: 'API005',
  NOT_FOUND: 'API006',
  RATE_LIMIT_EXCEEDED: 'API007',
  INTERNAL_ERROR: 'API008',
  BAD_REQUEST: 'API009',
  METHOD_NOT_ALLOWED: 'API010',
} as const;

/**
 * Cria erro de API LLM-friendly
 */
export function apiError(
  code: keyof typeof API_ERROR_CODES,
  message: string,
  context: APIErrorContext = {},
  suggestion: string = ''
): APIError {
  const errorCode = API_ERROR_CODES[code];
  const statusCode = getStatusCodeForError(code);
  
  const defaultSuggestion = suggestion || generateDefaultSuggestion(code, context);
  
  const error = new APIError(message, statusCode);
  (error as any).apiInfo = {
    code: errorCode,
    type: code,
    message,
    statusCode,
    context,
    suggestion: defaultSuggestion,
  };
  
  return error;
}

/**
 * Classe de erro para API
 */
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public apiInfo?: APIErrorInfo
  ) {
    super(message);
    this.name = 'APIError';
  }

  /**
   * Converte para resposta HTTP estruturada
   */
  toResponse(requestId?: string): {
    success: false;
    error: string;
    errors: Array<{
      code: string;
      message: string;
      field?: string;
      suggestion?: string;
    }>;
    meta: {
      requestId?: string;
      timestamp: number;
      processingTime: number;
    };
  } {
    const info = this.apiInfo || {
      code: 'API008',
      type: 'INTERNAL_ERROR',
      message: this.message,
      statusCode: this.statusCode,
      context: {},
      suggestion: '',
    };

    return {
      success: false,
      error: info.message,
      errors: [{
        code: info.code,
        message: info.message,
        field: info.context.field,
        suggestion: info.suggestion,
      }],
      meta: {
        requestId,
        timestamp: Date.now(),
        processingTime: 0,
      },
    };
  }
}

function getStatusCodeForError(code: keyof typeof API_ERROR_CODES): number {
  switch (code) {
    case 'MISSING_INTENT':
    case 'INVALID_INTENT':
    case 'VALIDATION_ERROR':
    case 'BAD_REQUEST':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'METHOD_NOT_ALLOWED':
      return 405;
    case 'RATE_LIMIT_EXCEEDED':
      return 429;
    case 'INTERNAL_ERROR':
    default:
      return 500;
  }
}

function generateDefaultSuggestion(
  code: keyof typeof API_ERROR_CODES,
  context: APIErrorContext
): string {
  switch (code) {
    case 'MISSING_INTENT':
      return `Forneça o campo 'intent' na requisição:
  { "intent": "register", "payload": {...} }
  Verifique a documentação para intents disponíveis`;
    
    case 'INVALID_INTENT':
      return `Intent '${context.intent || 'desconhecido'}' não é válido.
  Use GET /affordances para ver intents disponíveis
  Verifique a documentação da API`;
    
    case 'VALIDATION_ERROR':
      return `Corrija os erros de validação acima.
  Campo: ${context.field || 'desconhecido'}
  Verifique o formato e valores esperados`;
    
    case 'UNAUTHORIZED':
      return `Autenticação necessária:
  1. Forneça API key no header: Authorization: Bearer <api-key>
  2. Ou use autenticação via Auth0
  3. Verifique se a API key está válida`;
    
    case 'FORBIDDEN':
      return `Você não tem permissão para esta ação:
  1. Verifique se está no realm correto
  2. Verifique se tem as roles necessárias
  3. Entre em contato com o administrador do realm`;
    
    case 'NOT_FOUND':
      return `Recurso não encontrado:
  1. Verifique se o ID está correto
  2. Verifique se o recurso existe no realm
  3. Use GET /affordances para ver recursos disponíveis`;
    
    case 'RATE_LIMIT_EXCEEDED':
      return `Limite de requisições excedido:
  1. Aguarde ${context.retryAfter || 60} segundos
  2. Reduza a frequência de requisições
  3. Considere usar batch operations`;
    
    case 'INTERNAL_ERROR':
      return `Erro interno do servidor:
  1. Tente novamente em alguns instantes
  2. Se persistir, entre em contato com suporte
  3. Verifique logs do servidor para mais detalhes`;
    
    default:
      return 'Verifique a documentação da API e tente novamente.';
  }
}

