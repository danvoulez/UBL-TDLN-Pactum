/**
 * DATABASE VALIDATORS - LLM-Friendly
 * 
 * Validações robustas para operações de banco de dados:
 * - Validação de schema
 * - Validação de migrations
 * - Validação de estrutura de tabelas
 * - Validação de tipos de colunas
 */

import { getDBConnection } from './connection.js';
import { dbError } from './errors.js';
import type { QueryResult } from 'pg';

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  tables: TableInfo[];
  missingTables: string[];
  typeMismatches: ColumnTypeMismatch[];
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  indexes: string[];
  constraints: string[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
}

export interface ColumnTypeMismatch {
  table: string;
  column: string;
  expectedType: string;
  actualType: string;
}

/**
 * Valida estrutura completa do schema
 */
export async function validateSchema(
  connectionString?: string,
  expectedTables: string[] = [
    'events',
    'snapshots',
    'schema_migrations',
    'parties_projection',
    'assets_projection',
    'agreements_projection',
    'roles_projection',
    'workflows_projection',
    'workspace_projection',
  ]
): Promise<SchemaValidationResult> {
  const db = getDBConnection(connectionString);
  const result: SchemaValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    tables: [],
    missingTables: [],
    typeMismatches: [],
  };

  try {
    // Listar todas as tabelas
    const tablesResult = await db.query<{ tablename: string }>(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    const existingTables = tablesResult.rows.map(r => r.tablename);

    // Verificar tabelas esperadas
    for (const expectedTable of expectedTables) {
      if (!existingTables.includes(expectedTable)) {
        result.missingTables.push(expectedTable);
        result.errors.push(`Tabela '${expectedTable}' não encontrada`);
        result.valid = false;
      }
    }

    // Obter informações de cada tabela
    for (const tableName of existingTables) {
      const tableInfo = await getTableInfo(db, tableName);
      result.tables.push(tableInfo);
    }

    // Validar tipos de colunas críticas
    const criticalColumns = [
      { table: 'events', column: 'aggregate_id', expectedType: 'text' },
      { table: 'events', column: 'actor_id', expectedType: 'text' },
      { table: 'snapshots', column: 'aggregate_id', expectedType: 'text' },
    ];

    for (const critical of criticalColumns) {
      const tableInfo = result.tables.find(t => t.name === critical.table);
      if (tableInfo) {
        const column = tableInfo.columns.find(c => c.name === critical.column);
        if (column && column.type !== critical.expectedType) {
          result.typeMismatches.push({
            table: critical.table,
            column: critical.column,
            expectedType: critical.expectedType,
            actualType: column.type,
          });
          result.errors.push(
            `Coluna '${critical.table}.${critical.column}' tem tipo '${column.type}', esperado '${critical.expectedType}'`
          );
          result.valid = false;
        }
      }
    }

    // Validar tabela de migrations
    const migrationsTable = result.tables.find(t => t.name === 'schema_migrations');
    if (!migrationsTable) {
      result.warnings.push('Tabela schema_migrations não encontrada (migrations podem não estar sendo rastreadas)');
    }

    return result;
  } catch (error: any) {
    if ((error as any).dbInfo) {
      throw error;
    }
    throw dbError('SCHEMA_VALIDATION_FAILED',
      'Falha ao validar schema',
      {
        error: error.message,
        expectedTables,
      }
    );
  }
}

/**
 * Obtém informações detalhadas de uma tabela
 */
async function getTableInfo(
  db: ReturnType<typeof getDBConnection>,
  tableName: string
): Promise<TableInfo> {
  // Colunas
  const columnsResult = await db.query<ColumnInfo>(`
    SELECT 
      column_name as name,
      data_type as type,
      is_nullable = 'YES' as nullable,
      column_default as "defaultValue"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position;
  `, [tableName]);

  // Índices
  const indexesResult = await db.query<{ indexname: string }>(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = $1;
  `, [tableName]);

  // Constraints
  const constraintsResult = await db.query<{ constraint_name: string }>(`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = $1;
  `, [tableName]);

  return {
    name: tableName,
    columns: columnsResult.rows,
    indexes: indexesResult.rows.map(r => r.indexname),
    constraints: constraintsResult.rows.map(r => r.constraint_name),
  };
}

/**
 * Valida se migrations foram aplicadas corretamente
 */
export async function validateMigrations(
  connectionString?: string,
  expectedMigrations: number[] = []
): Promise<{
  valid: boolean;
  errors: string[];
  applied: number[];
  missing: number[];
  extra: number[];
}> {
  const db = getDBConnection(connectionString);
  const result = {
    valid: true,
    errors: [],
    applied: [] as number[],
    missing: [] as number[],
    extra: [] as number[],
  };

  try {
    // Verificar se tabela de migrations existe
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'schema_migrations'
      );
    `);

    if (!tableExists.rows[0].exists) {
      result.errors.push('Tabela schema_migrations não existe');
      result.valid = false;
      return result;
    }

    // Obter migrations aplicadas
    const appliedResult = await db.query<{ version: number }>(`
      SELECT version FROM schema_migrations ORDER BY version;
    `);

    result.applied = appliedResult.rows.map(r => r.version);

    // Verificar migrations esperadas
    for (const expected of expectedMigrations) {
      if (!result.applied.includes(expected)) {
        result.missing.push(expected);
        result.errors.push(`Migração ${expected} não foi aplicada`);
        result.valid = false;
      }
    }

    // Verificar migrations extras (não esperadas)
    for (const applied of result.applied) {
      if (expectedMigrations.length > 0 && !expectedMigrations.includes(applied)) {
        result.extra.push(applied);
      }
    }

    return result;
  } catch (error: any) {
    if ((error as any).dbInfo) {
      throw error;
    }
    throw dbError('SCHEMA_VALIDATION_FAILED',
      'Falha ao validar migrations',
      {
        error: error.message,
      }
    );
  }
}

/**
 * Valida se banco está vazio (útil para reset)
 */
export async function validateDatabaseEmpty(
  connectionString?: string
): Promise<{
  empty: boolean;
  tableCount: number;
  eventCount: number;
  message: string;
}> {
  const db = getDBConnection(connectionString);

  try {
    // Contar tabelas
    const tablesResult = await db.query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);

    const tableCount = parseInt(tablesResult.rows[0].count);

    // Contar eventos (se tabela existir)
    let eventCount = 0;
    try {
      const eventsResult = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM events;
      `);
      eventCount = parseInt(eventsResult.rows[0].count);
    } catch {
      // Tabela não existe, está vazio
    }

    const empty = tableCount === 0 || eventCount === 0;
    const message = empty
      ? 'Banco de dados está vazio'
      : `Banco de dados contém ${tableCount} tabela(s) e ${eventCount} evento(s)`;

    return {
      empty,
      tableCount,
      eventCount,
      message,
    };
  } catch (error: any) {
    if ((error as any).dbInfo) {
      throw error;
    }
    throw dbError('SCHEMA_VALIDATION_FAILED',
      'Falha ao validar se banco está vazio',
      {
        error: error.message,
      }
    );
  }
}

