/**
 * DATABASE MIGRATIONS - Modular & LLM-Friendly
 * 
 * Sistema de migrations modular e robusto:
 * - Migrations organizadas
 * - Validação de aplicação
 * - Erros LLM-friendly
 * - Rollback (quando suportado)
 */

import { getDBConnection } from './connection.js';
import { dbError, extractPostgresError } from './errors.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Migration {
  version: number;
  name: string;
  up: string;
  down?: string;
  description?: string;
}

// Carregar schema completo
let fullSchema: string | null = null;
const possiblePaths = [
  join(__dirname, '../store/postgres-schema.sql'),
  join(__dirname, '../../core/store/postgres-schema.sql'),
  join(process.cwd(), 'core/store/postgres-schema.sql'),
  join(process.cwd(), 'dist/core/store/postgres-schema.sql'),
];

for (const schemaPath of possiblePaths) {
  try {
    fullSchema = readFileSync(schemaPath, 'utf-8');
    break;
  } catch {
    // Try next path
  }
}

if (!fullSchema) {
  console.warn('⚠️  Could not load postgres-schema.sql from any location');
}

/**
 * Migrations definidas
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '001_initial_schema',
    description: 'Schema inicial do banco de dados',
    up: fullSchema || `
      -- Initial schema fallback
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sequence BIGSERIAL UNIQUE NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        event_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_version INT NOT NULL,
        payload JSONB NOT NULL,
        actor_type TEXT NOT NULL,
        actor_id TEXT,
        previous_hash TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  },
  // Migrations 002 e 003 são definidas em core/store/migrations.ts
  // Importar de lá se necessário, ou manter aqui
];

/**
 * Cria tabela de migrations se não existir
 */
export async function ensureMigrationsTable(
  connectionString?: string
): Promise<void> {
  const db = getDBConnection(connectionString);

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      description TEXT
    );
  `;

  try {
    await db.query(createTableSQL);
  } catch (error: any) {
    const pgError = extractPostgresError(error);
    throw dbError('MIGRATION_FAILED',
      'Falha ao criar tabela de migrations',
      {
        sql: createTableSQL,
        ...pgError,
      }
    );
  }
}

/**
 * Obtém migrations aplicadas
 */
export async function getAppliedMigrations(
  connectionString?: string
): Promise<number[]> {
  const db = getDBConnection(connectionString);

  try {
    await ensureMigrationsTable(connectionString);
    const result = await db.query<{ version: number }>(`
      SELECT version FROM schema_migrations ORDER BY version;
    `);
    return result.rows.map(r => r.version);
  } catch (error: any) {
    // Se tabela não existe, retornar vazio
    if (error.message?.includes('does not exist')) {
      return [];
    }
    const pgError = extractPostgresError(error);
    throw dbError('MIGRATION_FAILED',
      'Falha ao obter migrations aplicadas',
      {
        ...pgError,
      }
    );
  }
}

/**
 * Marca migration como aplicada
 */
export async function markMigrationApplied(
  migration: Migration,
  connectionString?: string
): Promise<void> {
  const db = getDBConnection(connectionString);

  const sql = `
    INSERT INTO schema_migrations (version, name, description)
    VALUES ($1, $2, $3)
    ON CONFLICT (version) DO NOTHING;
  `;

  try {
    await db.query(sql, [migration.version, migration.name, migration.description || null]);
  } catch (error: any) {
    const pgError = extractPostgresError(error);
    throw dbError('MIGRATION_FAILED',
      `Falha ao marcar migration ${migration.version} como aplicada`,
      {
        migration: migration.name,
        version: migration.version,
        ...pgError,
      }
    );
  }
}

/**
 * Executa uma migration
 */
export async function applyMigration(
  migration: Migration,
  connectionString?: string
): Promise<void> {
  const db = getDBConnection(connectionString);

  try {
    // Executar SQL da migration
    const statements = migration.up
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.length > 0) {
        try {
          await db.query(statement);
        } catch (error: any) {
          // Ignorar erros de "already exists" para CREATE IF NOT EXISTS
          if (!error.message.includes('already exists') && 
              !error.message.includes('duplicate key')) {
            const pgError = extractPostgresError(error);
            throw dbError('MIGRATION_FAILED',
              `Falha ao executar statement da migration ${migration.version}`,
              {
                migration: migration.name,
                version: migration.version,
                statement: statement.substring(0, 200),
                ...pgError,
              }
            );
          }
        }
      }
    }

    // Marcar como aplicada
    await markMigrationApplied(migration, connectionString);
  } catch (error: any) {
    if ((error as any).dbInfo) {
      throw error; // Já é um erro estruturado
    }
    const pgError = extractPostgresError(error);
    throw dbError('MIGRATION_FAILED',
      `Falha ao aplicar migration ${migration.version}: ${migration.name}`,
      {
        migration: migration.name,
        version: migration.version,
        ...pgError,
      }
    );
  }
}

/**
 * Executa todas as migrations pendentes
 */
export async function runMigrations(
  connectionString?: string,
  migrations: Migration[] = MIGRATIONS
): Promise<{
  applied: number[];
  skipped: number[];
  failed: Array<{ version: number; error: string }>;
}> {
  const result = {
    applied: [] as number[],
    skipped: [] as number[],
    failed: [] as Array<{ version: number; error: string }>,
  };

  try {
    await ensureMigrationsTable(connectionString);
    const applied = await getAppliedMigrations(connectionString);

    const pending = migrations.filter(m => !applied.includes(m.version));

    if (pending.length === 0) {
      return result;
    }

    for (const migration of pending) {
      try {
        await applyMigration(migration, connectionString);
        result.applied.push(migration.version);
      } catch (error: any) {
        result.failed.push({
          version: migration.version,
          error: error.message || String(error),
        });
        throw error; // Parar em caso de erro
      }
    }

    return result;
  } catch (error: any) {
    if ((error as any).dbInfo) {
      throw error;
    }
    throw dbError('MIGRATION_FAILED',
      'Falha ao executar migrations',
      {
        applied: result.applied,
        failed: result.failed,
        error: error.message,
      }
    );
  }
}

/**
 * Aplica schema completo do arquivo SQL
 */
export async function applyFullSchema(
  schemaSQL: string,
  connectionString?: string
): Promise<void> {
  const db = getDBConnection(connectionString);

  try {
    const statements = schemaSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.length > 0) {
        try {
          await db.query(statement);
        } catch (error: any) {
          // Ignorar erros de "already exists"
          if (!error.message.includes('already exists') &&
              !error.message.includes('duplicate key')) {
            const pgError = extractPostgresError(error);
            throw dbError('MIGRATION_FAILED',
              'Falha ao aplicar schema completo',
              {
                statement: statement.substring(0, 200),
                ...pgError,
              }
            );
          }
        }
      }
    }
  } catch (error: any) {
    if ((error as any).dbInfo) {
      throw error;
    }
    const pgError = extractPostgresError(error);
    throw dbError('MIGRATION_FAILED',
      'Falha ao aplicar schema completo',
      {
        ...pgError,
      }
    );
  }
}

