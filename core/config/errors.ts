/**
 * CONFIGURATION ERRORS - LLM-Friendly
 */

export interface ConfigErrorContext {
  [key: string]: any;
}

export interface ConfigErrorInfo {
  code: string;
  type: string;
  message: string;
  context: ConfigErrorContext;
  suggestion: string;
}

/**
 * Códigos de erro para configuração
 */
export const CONFIG_ERROR_CODES = {
  INVALID_PORT: 'CFG001',
  INVALID_DATABASE_URL: 'CFG002',
  INVALID_REDIS_URL: 'CFG003',
  MISSING_CONFIG: 'CFG004',
  MISSING_AWS_REGION: 'CFG005',
  INVALID_ENV_VAR: 'CFG006',
} as const;

/**
 * Cria erro de configuração LLM-friendly
 */
export function configError(
  code: keyof typeof CONFIG_ERROR_CODES,
  message: string,
  context: ConfigErrorContext = {},
  suggestion: string = ''
): Error {
  const errorCode = CONFIG_ERROR_CODES[code];
  const stack = new Error().stack;
  const stackLines = stack?.split('\n') || [];
  
  const callerLine = stackLines[2] || '';
  const locationMatch = callerLine.match(/at .+ \((.+):(\d+):(\d+)\)/) || 
                        callerLine.match(/at (.+):(\d+):(\d+)/);
  
  const location = {
    file: locationMatch ? locationMatch[1] : undefined,
    line: locationMatch ? parseInt(locationMatch[2]) : undefined,
    function: callerLine.match(/at (.+?) \(/)?.[1] || undefined,
  };

  const defaultSuggestion = suggestion || generateDefaultSuggestion(code, context);
  
  const structuredMessage = formatConfigError({
    code: errorCode,
    type: code,
    message,
    context,
    location,
    suggestion: defaultSuggestion,
  });

  const error = new Error(structuredMessage);
  (error as any).configInfo = {
    code: errorCode,
    type: code,
    message,
    context,
    suggestion: defaultSuggestion,
  };
  
  return error;
}

function formatConfigError(info: ConfigErrorInfo & { location: any }): string {
  const lines: string[] = [];
  
  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push(`║            ❌ ERRO: ${info.code} - ${info.type}              ║`);
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push('📋 MENSAGEM:');
  lines.push(`   ${info.message}`);
  lines.push('');
  
  if (Object.keys(info.context).length > 0) {
    lines.push('🔍 CONTEXTO:');
    for (const [key, value] of Object.entries(info.context)) {
      // Ocultar valores sensíveis
      let displayValue = value;
      if (key.toLowerCase().includes('key') || 
          key.toLowerCase().includes('secret') || 
          key.toLowerCase().includes('password')) {
        displayValue = '[OCULTO]';
      }
      lines.push(`   ${key}: ${displayValue}`);
    }
    lines.push('');
  }
  
  if (info.location.file) {
    lines.push('📍 LOCALIZAÇÃO:');
    lines.push(`   Arquivo: ${info.location.file}`);
    if (info.location.line) {
      lines.push(`   Linha: ${info.location.line}`);
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

function generateDefaultSuggestion(
  code: keyof typeof CONFIG_ERROR_CODES,
  context: ConfigErrorContext
): string {
  switch (code) {
    case 'INVALID_PORT':
      return `Defina PORT com um valor entre 1 e 65535:
  export PORT=3000
  ou no arquivo .env: PORT=3000`;
    
    case 'INVALID_DATABASE_URL':
      return `Verifique o formato do DATABASE_URL:
  Formato: postgresql://user:password@host:port/database
  Exemplo: postgresql://user:pass@localhost:5432/ubl_core
  URL-encode caracteres especiais na senha`;
    
    case 'INVALID_REDIS_URL':
      return `Verifique o formato do REDIS_URL:
  Formato: redis://host:port ou rediss://host:port (SSL)
  Exemplo: redis://localhost:6379`;
    
    case 'MISSING_CONFIG':
      return `Defina a variável de ambiente correspondente:
  1. Adicione ao arquivo .env
  2. Ou exporte: export ${context.path?.toUpperCase() || 'VAR'}=valor
  3. Verifique documentação para variáveis obrigatórias`;
    
    case 'MISSING_AWS_REGION':
      return `Defina AWS_REGION quando usar S3:
  export AWS_REGION=us-east-1
  ou no arquivo .env: AWS_REGION=us-east-1`;
    
    default:
      return 'Verifique a documentação de configuração e variáveis de ambiente.';
  }
}

