/**
 * MIGRATION CLI
 * 
 * Run database migrations from command line.
 * 
 * Usage:
 *   npm run migrate
 *   node dist/cli/migrate.js
 */

// DEPRECATED: Use cli/db-migrate.ts instead
// This file is kept for backward compatibility

import { getConfig, requireConfig } from '../core/config/index.js';
import { getDBConnection } from '../core/db/connection.js';
import { runMigrations, applyFullSchema, MIGRATIONS } from '../core/db/migrations.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  try {
    const config = getConfig();
    const databaseUrl = config.database.url || requireConfig('database.url');
    
    console.log('🔄 Conectando ao banco de dados...');
    
    const db = getDBConnection(databaseUrl);
    await db.test();
    console.log('✅ Conexão estabelecida');
    
    // Check if we should run full schema or migrations
    const useFullSchema = process.argv.includes('--full-schema');
    
    if (useFullSchema) {
      // Run full schema from file
      const schemaPath = join(__dirname, '../core/store/postgres-schema.sql');
      try {
        const schema = readFileSync(schemaPath, 'utf-8');
        await applyFullSchema(schema, databaseUrl);
        console.log('✅ Schema completo aplicado');
        
        // After full schema, also run incremental migrations
        console.log('🔄 Executando migrations incrementais...');
        const result = await runMigrations(databaseUrl, MIGRATIONS);
        
        if (result.applied.length > 0) {
          console.log(`✅ ${result.applied.length} migration(s) aplicada(s): ${result.applied.join(', ')}`);
        } else {
          console.log('✅ Nenhuma migration pendente');
        }
      } catch (error: any) {
        if ((error as any).dbInfo) {
          console.error(error.message);
        } else {
          console.error('❌ Falha ao carregar schema:', error.message);
        }
        process.exit(1);
      }
    } else {
      // Run migrations
      console.log('🔄 Executando migrations...');
      const result = await runMigrations(databaseUrl, MIGRATIONS);
      
      if (result.applied.length > 0) {
        console.log(`✅ ${result.applied.length} migration(s) aplicada(s): ${result.applied.join(', ')}`);
      } else {
        console.log('✅ Banco de dados está atualizado (nenhuma migration pendente)');
      }
    }
    
    await db.close();
    console.log('✅ Concluído!');
  } catch (error: any) {
    if ((error as any).configInfo || (error as any).dbInfo) {
      console.error(error.message);
    } else {
      console.error('❌ Erro:', error.message);
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});

