/**
 * DATABASE ERRORS - LLM-Friendly
 * 
 * Erros estruturados e descritivos para operações de banco de dados:
 * - Códigos de erro únicos
 * - Contexto completo
 * - Sugestões de correção
 * - Localização exata
 */

export interface DBErrorContext {
  [key: string]: any;
}

export interface DBErrorInfo {
  code: string;
  type: string;
  message: string;
  context: DBErrorContext;
  location: {
    file?: string;
    line?: number;
    function?: string;
  };
  suggestion: string;
  sqlState?: string;
  sqlMessage?: string;
}

/**
 * Códigos de erro únicos para banco de dados
 */
export const DB_ERROR_CODES = {
  CONNECTION_FAILED: 'DB001',
  CONNECTION_TIMEOUT: 'DB002',
  AUTHENTICATION_FAILED: 'DB003',
  SCHEMA_NOT_FOUND: 'DB004',
  MIGRATION_FAILED: 'DB005',
  MIGRATION_CONFLICT: 'DB006',
  TABLE_NOT_FOUND: 'DB007',
  COLUMN_TYPE_MISMATCH: 'DB008',
  CONSTRAINT_VIOLATION: 'DB009',
  QUERY_FAILED: 'DB010',
  TRANSACTION_FAILED: 'DB011',
  INVALID_CONNECTION_STRING: 'DB012',
  DATABASE_NOT_EMPTY: 'DB013',
  MIGRATION_ALREADY_APPLIED: 'DB014',
  MIGRATION_MISSING: 'DB015',
  SCHEMA_VALIDATION_FAILED: 'DB016',
} as const;

/**
 * Cria erro estruturado LLM-friendly para banco de dados
 */
export function dbError(
  code: keyof typeof DB_ERROR_CODES,
  message: string,
  context: DBErrorContext = {},
  suggestion: string = '',
  sqlState?: string,
  sqlMessage?: string
): Error {
  const errorCode = DB_ERROR_CODES[code];
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
  const structuredMessage = formatDBError({
    code: errorCode,
    type: code,
    message,
    context,
    location,
    suggestion: defaultSuggestion,
    sqlState,
    sqlMessage,
  });

  const error = new Error(structuredMessage);
  (error as any).dbInfo = {
    code: errorCode,
    type: code,
    message,
    context,
    location,
    suggestion: defaultSuggestion,
    sqlState,
    sqlMessage,
  };
  
  return error;
}

/**
 * Formata erro para exibição LLM-friendly
 */
function formatDBError(info: DBErrorInfo): string {
  const lines: string[] = [];
  
  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push(`║            ❌ ERRO: ${info.code} - ${info.type}              ║`);
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push('📋 MENSAGEM:');
  lines.push(`   ${info.message}`);
  lines.push('');
  
  if (info.sqlState || info.sqlMessage) {
    lines.push('🗄️  DETALHES SQL:');
    if (info.sqlState) {
      lines.push(`   SQL State: ${info.sqlState}`);
    }
    if (info.sqlMessage) {
      lines.push(`   SQL Message: ${info.sqlMessage}`);
    }
    lines.push('');
  }
  
  if (Object.keys(info.context).length > 0) {
    lines.push('🔍 CONTEXTO:');
    for (const [key, value] of Object.entries(info.context)) {
      // Ocultar senhas em connection strings
      let displayValue = value;
      if (key === 'connectionString' || key === 'databaseUrl' || key === 'DATABASE_URL') {
        displayValue = String(value).replace(/:[^:@]+@/, ':****@');
      }
      const valueStr = typeof displayValue === 'object' 
        ? JSON.stringify(displayValue, null, 2).split('\n').map(l => `   ${l}`).join('\n')
        : String(displayValue);
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
  code: keyof typeof DB_ERROR_CODES,
  context: DBErrorContext
): string {
  switch (code) {
    case 'CONNECTION_FAILED':
      return `Verifique a conexão com o banco de dados:
  1. Verifique se o servidor PostgreSQL está rodando
  2. Verifique se o host e porta estão corretos
  3. Verifique se o firewall permite conexões
  4. Teste a conexão: psql "${context.connectionString?.replace(/:[^:@]+@/, ':****@') || 'DATABASE_URL'}"
  5. Verifique logs do PostgreSQL para mais detalhes`;
    
    case 'CONNECTION_TIMEOUT':
      return `Conexão excedeu o tempo limite:
  1. Verifique se o servidor está acessível
  2. Aumente o timeout de conexão
  3. Verifique latência de rede
  4. Verifique se há muitas conexões abertas`;
    
    case 'AUTHENTICATION_FAILED':
      return `Falha na autenticação:
  1. Verifique se o usuário e senha estão corretos
  2. Verifique se o usuário tem permissões no banco
  3. Verifique pg_hba.conf para regras de autenticação
  4. Verifique se a senha contém caracteres especiais (URL-encode se necessário)
  5. Teste: psql -U ${context.user || 'usuario'} -d ${context.database || 'database'}`;
    
    case 'SCHEMA_NOT_FOUND':
      return `Schema SQL não encontrado:
  1. Verifique se o arquivo postgres-schema.sql existe
  2. Verifique o caminho: ${context.expectedPath || 'desconhecido'}
  3. Verifique se o arquivo foi copiado durante o build
  4. Execute: npm run build para garantir que o arquivo está em dist/`;
    
    case 'MIGRATION_FAILED':
      return `Migração falhou:
  1. Analise o erro SQL acima
  2. Verifique se a migração anterior foi aplicada corretamente
  3. Verifique se há conflitos com o schema atual
  4. Execute: SELECT * FROM schema_migrations ORDER BY version; para ver migrações aplicadas
  5. Se necessário, corrija a migração e reaplique`;
    
    case 'MIGRATION_CONFLICT':
      return `Conflito de migração:
  1. A migração ${context.version || 'N'} já foi aplicada ou está em conflito
  2. Verifique: SELECT * FROM schema_migrations WHERE version = ${context.version || 'N'};
  3. Se necessário, marque como aplicada: INSERT INTO schema_migrations (version, name) VALUES (...);
  4. Ou reverta e reaplique: DELETE FROM schema_migrations WHERE version = ${context.version || 'N'};`;
    
    case 'TABLE_NOT_FOUND':
      return `Tabela não encontrada:
  1. Verifique se o schema foi aplicado: npm run migrate:full
  2. Verifique se está no schema correto: SELECT current_schema();
  3. Liste tabelas: SELECT tablename FROM pg_tables WHERE schemaname = 'public';
  4. Aplique o schema: node dist/cli/migrate.js --full-schema`;
    
    case 'COLUMN_TYPE_MISMATCH':
      return `Tipo de coluna incorreto:
  1. Coluna esperada: ${context.expectedType || 'desconhecido'}
  2. Coluna atual: ${context.actualType || 'desconhecido'}
  3. Execute migração para converter: ALTER TABLE ${context.table || 'table'} ALTER COLUMN ${context.column || 'column'} TYPE ${context.expectedType || 'TEXT'};
  4. Ou aplique migração: npm run migrate`;
    
    case 'CONSTRAINT_VIOLATION':
      return `Violação de constraint:
  1. Verifique os dados que estão sendo inseridos
  2. Verifique constraints: SELECT * FROM information_schema.table_constraints WHERE table_name = '${context.table || 'table'}';
  3. Verifique valores únicos, foreign keys, e NOT NULL constraints
  4. Ajuste os dados ou a constraint conforme necessário`;
    
    case 'QUERY_FAILED':
      return `Query falhou:
  1. Analise o erro SQL acima
  2. Verifique a sintaxe SQL
  3. Verifique se as tabelas/colunas existem
  4. Teste a query diretamente: psql -c "${context.query?.substring(0, 100) || 'query'}..."`;
    
    case 'TRANSACTION_FAILED':
      return `Transação falhou:
  1. Verifique se há deadlocks ou locks
  2. Verifique logs do PostgreSQL
  3. Tente novamente após alguns segundos
  4. Verifique se há transações abertas: SELECT * FROM pg_stat_activity WHERE state = 'active';`;
    
    case 'INVALID_CONNECTION_STRING':
      return `Connection string inválida:
  1. Formato esperado: postgresql://user:password@host:port/database
  2. Verifique se está no formato correto
  3. URL-encode caracteres especiais na senha
  4. Exemplo: postgresql://user:pass%40word@localhost:5432/dbname`;
    
    case 'DATABASE_NOT_EMPTY':
      return `Banco de dados não está vazio:
  1. Esta operação requer um banco vazio
  2. Verifique: SELECT COUNT(*) FROM events;
  3. Se tiver certeza, exporte os dados primeiro
  4. Use com cuidado: node dist/cli/reset-db.js (apenas se vazio)`;
    
    case 'SCHEMA_VALIDATION_FAILED':
      return `Validação de schema falhou:
  1. Verifique se todas as tabelas necessárias existem
  2. Verifique tipos de colunas: ${context.columnIssues || 'verifique logs'}
  3. Execute: node dist/cli/db-validate.js para diagnóstico completo
  4. Aplique schema: npm run migrate:full`;
    
    default:
      return 'Verifique os logs do PostgreSQL e a documentação para mais detalhes.';
  }
}

/**
 * Extrai informações de erro do PostgreSQL
 */
export function extractPostgresError(error: any): {
  sqlState?: string;
  sqlMessage?: string;
  code?: string;
} {
  return {
    sqlState: error.code || error.sqlState,
    sqlMessage: error.message || error.sqlMessage,
    code: error.code,
  };
}

