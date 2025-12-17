/**
 * CONFIGURATION MODULE - Modular & LLM-Friendly
 * 
 * Configuração centralizada e validada:
 * - Environment variables
 * - Validações robustas
 * - Erros LLM-friendly
 * - Type-safe config
 */

import { configError } from './errors.js';
import type { Config } from './types.js';

let cachedConfig: Config | null = null;

/**
 * Carrega e valida configuração do ambiente
 */
export function loadConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const config: Config = {
    // Server
    server: {
      port: parseInt(process.env.PORT || '3000', 10),
      host: process.env.HOST || '0.0.0.0',
      nodeEnv: process.env.NODE_ENV || 'development',
    },

    // Database
    database: {
      url: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true',
    },

    // AWS
    aws: {
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      s3Bucket: process.env.AWS_S3_BUCKET,
    },

    // LLM
    llm: {
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
      geminiApiKey: process.env.GEMINI_API_KEY,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
      ollamaApiKey: process.env.OLLAMA_API_KEY,
      ollamaModel: process.env.OLLAMA_MODEL,
    },

    // Redis
    redis: {
      url: process.env.REDIS_URL,
    },

    // Auth
    auth: {
      masterApiKey: process.env.UBL_MASTER_API_KEY,
      auth0Domain: process.env.AUTH0_DOMAIN,
      auth0ClientId: process.env.AUTH0_CLIENT_ID,
      auth0ClientSecret: process.env.AUTH0_CLIENT_SECRET,
    },
  };

  // Validar configuração
  validateConfig(config);

  cachedConfig = config;
  return config;
}

/**
 * Valida configuração e lança erros LLM-friendly
 */
function validateConfig(config: Config): void {
  // Validar server
  if (config.server.port < 1 || config.server.port > 65535) {
    throw configError('INVALID_PORT',
      `Porta inválida: ${config.server.port}`,
      { port: config.server.port },
      'Porta deve estar entre 1 e 65535'
    );
  }

  // Validar database (se fornecido)
  if (config.database.url) {
    if (!config.database.url.startsWith('postgresql://') && 
        !config.database.url.startsWith('postgres://')) {
      throw configError('INVALID_DATABASE_URL',
        'DATABASE_URL deve começar com postgresql:// ou postgres://',
        { url: config.database.url.substring(0, 50) + '...' },
        'Formato esperado: postgresql://user:password@host:port/database'
      );
    }
  }

  // Validar AWS (se S3 bucket fornecido)
  if (config.aws.s3Bucket) {
    if (!config.aws.region) {
      throw configError('MISSING_AWS_REGION',
        'AWS_REGION é obrigatório quando AWS_S3_BUCKET está configurado',
        { s3Bucket: config.aws.s3Bucket }
      );
    }
  }

  // Validar Redis (se URL fornecido)
  if (config.redis.url) {
    if (!config.redis.url.startsWith('redis://') && 
        !config.redis.url.startsWith('rediss://')) {
      throw configError('INVALID_REDIS_URL',
        'REDIS_URL deve começar com redis:// ou rediss://',
        { url: config.redis.url.substring(0, 50) + '...' },
        'Formato esperado: redis://host:port ou rediss://host:port (SSL)'
      );
    }
  }
}

/**
 * Obtém configuração (carrega se necessário)
 */
export function getConfig(): Config {
  return loadConfig();
}

/**
 * Limpa cache de configuração (útil para testes)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Obtém valor de configuração com fallback
 */
export function getConfigValue<T>(
  path: string,
  defaultValue?: T
): T | undefined {
  const config = getConfig();
  const keys = path.split('.');
  let value: any = config;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key as keyof typeof value];
    } else {
      return defaultValue;
    }
  }

  return value ?? defaultValue;
}

/**
 * Verifica se configuração está presente
 */
export function hasConfig(path: string): boolean {
  return getConfigValue(path) !== undefined;
}

/**
 * Requer configuração (lança erro se ausente)
 */
export function requireConfig(path: string): any {
  const value = getConfigValue(path);
  if (value === undefined) {
    throw configError('MISSING_CONFIG',
      `Configuração obrigatória ausente: ${path}`,
      { path },
      `Defina a variável de ambiente correspondente ou configure ${path}`
    );
  }
  return value;
}

