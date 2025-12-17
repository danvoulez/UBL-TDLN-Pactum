/**
 * DATABASE CONNECTION - Modular & LLM-Friendly
 * 
 * Gerenciamento centralizado de conexões PostgreSQL:
 * - Pool de conexões reutilizável
 * - Validação de conexão
 * - Erros LLM-friendly
 * - Health checks
 * - Cleanup automático
 */

import { Pool, Client, type PoolConfig, type QueryResult } from 'pg';
import { dbError, extractPostgresError, DB_ERROR_CODES } from './errors.js';

export interface DBConnectionConfig {
  connectionString: string;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  ssl?: boolean | { rejectUnauthorized: boolean };
}

export interface DBConnection {
  pool: Pool;
  query: <T = any>(text: string, params?: any[]) => Promise<QueryResult<T>>;
  execute: (sql: string) => Promise<QueryResult>;
  test: () => Promise<boolean>;
  health: () => Promise<{
    healthy: boolean;
    latency?: number;
    activeConnections?: number;
    idleConnections?: number;
  }>;
  close: () => Promise<void>;
}

let globalPool: Pool | null = null;

/**
 * Cria ou retorna pool de conexões global
 */
export function createDBConnection(config: DBConnectionConfig): DBConnection {
  // Validar connection string
  if (!config.connectionString) {
    throw dbError('INVALID_CONNECTION_STRING',
      'Connection string não fornecida',
      { config: { ...config, connectionString: '[OCULTO]' } }
    );
  }

  // Validar formato básico
  if (!config.connectionString.startsWith('postgresql://') && 
      !config.connectionString.startsWith('postgres://')) {
    throw dbError('INVALID_CONNECTION_STRING',
      'Connection string deve começar com postgresql:// ou postgres://',
      { connectionString: config.connectionString.substring(0, 50) + '...' }
    );
  }

  // Criar pool se não existir
  if (!globalPool) {
    const poolConfig: PoolConfig = {
      connectionString: config.connectionString,
      max: config.maxConnections ?? 20,
      idleTimeoutMillis: config.idleTimeoutMillis ?? 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis ?? 10000,
      ssl: config.ssl ?? false,
    };

    globalPool = new Pool(poolConfig);

    // Tratamento de erros do pool
    globalPool.on('error', (err) => {
      const pgError = extractPostgresError(err);
      throw dbError('CONNECTION_FAILED',
        'Erro no pool de conexões',
        {
          error: err.message,
          ...pgError,
        }
      );
    });
  }

  return {
    pool: globalPool,
    
    async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
      try {
        return await globalPool!.query<T>(text, params);
      } catch (error: any) {
        const pgError = extractPostgresError(error);
        throw dbError('QUERY_FAILED',
          `Query falhou: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`,
          {
            query: text.substring(0, 200),
            params: params?.map(p => typeof p === 'string' && p.length > 50 ? p.substring(0, 50) + '...' : p),
            ...pgError,
          }
        );
      }
    },

    async execute(sql: string): Promise<QueryResult> {
      return this.query(sql);
    },

    async test(): Promise<boolean> {
      try {
        const start = Date.now();
        await this.query('SELECT 1');
        const latency = Date.now() - start;
        
        if (latency > 5000) {
          throw dbError('CONNECTION_TIMEOUT',
            'Conexão muito lenta',
            { latency }
          );
        }
        
        return true;
      } catch (error: any) {
        if ((error as any).dbInfo) {
          throw error; // Já é um erro DB estruturado
        }
        
        const pgError = extractPostgresError(error);
        throw dbError('CONNECTION_FAILED',
          'Falha ao testar conexão',
          {
            error: error.message,
            ...pgError,
          }
        );
      }
    },

    async health(): Promise<{
      healthy: boolean;
      latency?: number;
      activeConnections?: number;
      idleConnections?: number;
    }> {
      try {
        const start = Date.now();
        await this.query('SELECT 1');
        const latency = Date.now() - start;

        const stats = globalPool!;
        return {
          healthy: true,
          latency,
          activeConnections: stats.totalCount - stats.idleCount,
          idleConnections: stats.idleCount,
        };
      } catch (error: any) {
        return {
          healthy: false,
        };
      }
    },

    async close(): Promise<void> {
      if (globalPool) {
        await globalPool.end();
        globalPool = null;
      }
    },
  };
}

/**
 * Obtém conexão do pool global (cria se não existir)
 */
export function getDBConnection(connectionString?: string): DBConnection {
  const dbUrl = connectionString || process.env.DATABASE_URL;
  
  if (!dbUrl) {
    throw dbError('INVALID_CONNECTION_STRING',
      'DATABASE_URL não configurado e connectionString não fornecida',
      {
        hasEnvVar: !!process.env.DATABASE_URL,
        hasConnectionString: !!connectionString,
      }
    );
  }

  return createDBConnection({
    connectionString: dbUrl,
  });
}

/**
 * Valida connection string sem criar conexão
 */
export function validateConnectionString(connectionString: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!connectionString) {
    errors.push('Connection string está vazia');
    return { valid: false, errors };
  }

  if (!connectionString.startsWith('postgresql://') && 
      !connectionString.startsWith('postgres://')) {
    errors.push('Connection string deve começar com postgresql:// ou postgres://');
  }

  try {
    const url = new URL(connectionString);
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
      errors.push(`Protocolo inválido: ${url.protocol}`);
    }
    if (!url.hostname) {
      errors.push('Hostname não especificado');
    }
    if (!url.pathname || url.pathname === '/') {
      errors.push('Nome do banco de dados não especificado');
    }
  } catch (error: any) {
    errors.push(`URL inválida: ${error.message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Fecha todas as conexões (útil para cleanup)
 */
export async function closeAllConnections(): Promise<void> {
  if (globalPool) {
    await globalPool.end();
    globalPool = null;
  }
}

