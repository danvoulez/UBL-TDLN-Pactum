#!/usr/bin/env node
/**
 * DB RESET - CLI Modular para Reset do Banco
 * 
 * Reseta banco de dados de forma segura e LLM-friendly
 * 
 * Uso:
 *   npm run db:reset
 *   node dist/cli/db-reset.js
 *   node dist/cli/db-reset.js --force  # Força reset mesmo com dados
 */

import { getDBConnection } from '../core/db/connection.js';
import { validateDatabaseEmpty } from '../core/db/validators.js';
import { applyFullSchema } from '../core/db/migrations.js';
import { dbError } from '../core/db/errors.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const force = process.argv.includes('--force');
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw dbError('INVALID_CONNECTION_STRING',
      'DATABASE_URL não configurado'
    );
  }

  console.log('🔄 Conectando ao banco de dados...');

  try {
    const db = getDBConnection(connectionString);
    await db.test();
    console.log('✅ Conexão estabelecida\n');

    // Validar se banco está vazio
    console.log('🔍 Verificando se banco está vazio...');
    const emptyCheck = await validateDatabaseEmpty(connectionString);
    
    if (!emptyCheck.empty && !force) {
      throw dbError('DATABASE_NOT_EMPTY',
        'Banco de dados não está vazio',
        {
          tableCount: emptyCheck.tableCount,
          eventCount: emptyCheck.eventCount,
        },
        'Use --force para forçar reset (CUIDADO: apaga todos os dados!)'
      );
    }

    if (!emptyCheck.empty && force) {
      console.log('⚠️  ATENÇÃO: Banco contém dados, mas --force foi usado');
      console.log(`   Tabelas: ${emptyCheck.tableCount}, Eventos: ${emptyCheck.eventCount}\n`);
    } else {
      console.log('✅ Banco está vazio\n');
    }

    // Dropar todas as tabelas
    console.log('🗑️  Removendo todas as tabelas...');
    await db.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `);
    console.log('✅ Tabelas removidas\n');

    // Dropar extensões
    console.log('🗑️  Removendo extensões...');
    await db.query('DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE');
    await db.query('DROP EXTENSION IF EXISTS "pgcrypto" CASCADE');
    console.log('✅ Extensões removidas\n');

    // Carregar e aplicar schema
    console.log('📦 Aplicando schema completo...');
    const possiblePaths = [
      join(__dirname, '../core/store/postgres-schema.sql'),
      join(__dirname, '../../core/store/postgres-schema.sql'),
      join(process.cwd(), 'core/store/postgres-schema.sql'),
      join(process.cwd(), 'dist/core/store/postgres-schema.sql'),
    ];

    let schemaSQL: string | null = null;
    for (const schemaPath of possiblePaths) {
      try {
        schemaSQL = readFileSync(schemaPath, 'utf-8');
        console.log(`✅ Schema carregado de: ${schemaPath}\n`);
        break;
      } catch {
        // Try next path
      }
    }

    if (!schemaSQL) {
      throw dbError('SCHEMA_NOT_FOUND',
        'Arquivo postgres-schema.sql não encontrado',
        { paths: possiblePaths }
      );
    }

    await applyFullSchema(schemaSQL, connectionString);
    console.log('✅ Schema aplicado\n');

    // Verificar estrutura
    console.log('📊 Verificando estrutura...');
    const columns = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'events'
        AND column_name IN ('id', 'aggregate_id', 'actor_id')
      ORDER BY column_name;
    `);

    console.log('   Colunas críticas:');
    for (const row of columns.rows) {
      const marker = row.data_type === 'uuid' ? ' ⚠️  UUID!' : ' ✅';
      console.log(`     ${row.column_name}: ${row.data_type}${marker}`);
    }

    await db.close();
    console.log('\n✅ Banco resetado e schema aplicado!');
  } catch (error: any) {
    if ((error as any).dbInfo) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error('❌ Erro:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

