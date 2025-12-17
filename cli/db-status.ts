#!/usr/bin/env node
/**
 * DB STATUS - CLI para Status do Banco
 * 
 * Mostra status completo do banco de dados de forma LLM-friendly
 * 
 * Uso:
 *   npm run db:status
 *   node dist/cli/db-status.js
 */

import { getDBConnection } from '../core/db/connection.js';
import { validateSchema, validateMigrations } from '../core/db/validators.js';
import { dbError } from '../core/db/errors.js';

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw dbError('INVALID_CONNECTION_STRING',
      'DATABASE_URL não configurado'
    );
  }

  console.log('🔍 Verificando status do banco de dados...\n');

  try {
    const db = getDBConnection(connectionString);

    // Testar conexão
    console.log('📡 Testando conexão...');
    const isConnected = await db.test();
    if (!isConnected) {
      throw dbError('CONNECTION_FAILED',
        'Falha ao conectar ao banco de dados'
      );
    }
    console.log('✅ Conexão OK\n');

    // Health check
    console.log('💚 Health check...');
    const health = await db.health();
    if (health.healthy) {
      console.log(`✅ Saudável (latência: ${health.latency}ms)`);
      console.log(`   Conexões ativas: ${health.activeConnections}`);
      console.log(`   Conexões idle: ${health.idleConnections}\n`);
    } else {
      console.log('❌ Não saudável\n');
    }

    // Validar schema
    console.log('📋 Validando schema...');
    const schemaValidation = await validateSchema(connectionString);
    if (schemaValidation.valid) {
      console.log('✅ Schema válido');
      console.log(`   Tabelas: ${schemaValidation.tables.length}`);
    } else {
      console.log('❌ Schema inválido');
      console.log(`   Erros: ${schemaValidation.errors.length}`);
      for (const error of schemaValidation.errors) {
        console.log(`     - ${error}`);
      }
      if (schemaValidation.missingTables.length > 0) {
        console.log(`   Tabelas faltando: ${schemaValidation.missingTables.join(', ')}`);
      }
      if (schemaValidation.typeMismatches.length > 0) {
        console.log(`   Tipos incorretos: ${schemaValidation.typeMismatches.length}`);
        for (const mismatch of schemaValidation.typeMismatches) {
          console.log(`     - ${mismatch.table}.${mismatch.column}: ${mismatch.actualType} (esperado: ${mismatch.expectedType})`);
        }
      }
    }
    console.log('');

    // Validar migrations
    console.log('🔄 Validando migrations...');
    const migrationsValidation = await validateMigrations(connectionString);
    if (migrationsValidation.valid) {
      console.log('✅ Migrations válidas');
      console.log(`   Aplicadas: ${migrationsValidation.applied.length} (${migrationsValidation.applied.join(', ')})`);
    } else {
      console.log('❌ Migrations inválidas');
      for (const error of migrationsValidation.errors) {
        console.log(`     - ${error}`);
      }
      if (migrationsValidation.missing.length > 0) {
        console.log(`   Faltando: ${migrationsValidation.missing.join(', ')}`);
      }
    }
    console.log('');

    // Estatísticas
    console.log('📊 Estatísticas:');
    try {
      const stats = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM events) as event_count,
          (SELECT COUNT(*) FROM schema_migrations) as migration_count,
          (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') as table_count;
      `);
      
      const row = stats.rows[0];
      console.log(`   Eventos: ${row.event_count}`);
      console.log(`   Migrations: ${row.migration_count}`);
      console.log(`   Tabelas: ${row.table_count}`);
    } catch (error: any) {
      console.log('   ⚠️  Não foi possível obter estatísticas');
    }

    await db.close();
    console.log('\n✅ Status verificado');
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

