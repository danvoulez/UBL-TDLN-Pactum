#!/usr/bin/env node
/**
 * DB MIGRATE - CLI Modular para Migrations
 * 
 * Executa migrations de forma modular e LLM-friendly
 * 
 * Uso:
 *   npm run db:migrate
 *   node dist/cli/db-migrate.js
 *   node dist/cli/db-migrate.js --full-schema
 */

import { runMigrations, applyFullSchema, MIGRATIONS } from '../core/db/migrations.js';
import { getDBConnection, validateConnectionString } from '../core/db/connection.js';
import { dbError } from '../core/db/errors.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const useFullSchema = process.argv.includes('--full-schema');
  const connectionString = process.env.DATABASE_URL;

  // Validar connection string
  if (!connectionString) {
    throw dbError('INVALID_CONNECTION_STRING',
      'DATABASE_URL não configurado',
      {},
      'Defina DATABASE_URL no ambiente ou passe como parâmetro'
    );
  }

  const validation = validateConnectionString(connectionString);
  if (!validation.valid) {
    throw dbError('INVALID_CONNECTION_STRING',
      'Connection string inválida',
      { errors: validation.errors }
    );
  }

  console.log('🔄 Conectando ao banco de dados...');

  try {
    const db = getDBConnection(connectionString);
    
    // Testar conexão
    const isConnected = await db.test();
    if (!isConnected) {
      throw dbError('CONNECTION_FAILED',
        'Falha ao conectar ao banco de dados',
        { connectionString: connectionString.replace(/:[^:@]+@/, ':****@') }
      );
    }

    console.log('✅ Conexão estabelecida');

    if (useFullSchema) {
      console.log('📦 Aplicando schema completo...');
      
      // Carregar schema
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
          console.log(`✅ Schema carregado de: ${schemaPath}`);
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
      console.log('✅ Schema completo aplicado');

      // Após schema completo, executar migrations incrementais
      console.log('🔄 Executando migrations incrementais...');
      const result = await runMigrations(connectionString, MIGRATIONS);
      
      if (result.applied.length > 0) {
        console.log(`✅ ${result.applied.length} migration(s) aplicada(s): ${result.applied.join(', ')}`);
      } else {
        console.log('✅ Nenhuma migration pendente');
      }
    } else {
      console.log('🔄 Executando migrations...');
      const result = await runMigrations(connectionString, MIGRATIONS);
      
      if (result.applied.length > 0) {
        console.log(`✅ ${result.applied.length} migration(s) aplicada(s): ${result.applied.join(', ')}`);
      } else {
        console.log('✅ Banco de dados está atualizado (nenhuma migration pendente)');
      }

      if (result.failed.length > 0) {
        console.error(`❌ ${result.failed.length} migration(s) falharam:`);
        for (const failure of result.failed) {
          console.error(`   Migration ${failure.version}: ${failure.error}`);
        }
        process.exit(1);
      }
    }

    await db.close();
    console.log('✅ Concluído!');
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

