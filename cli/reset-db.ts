#!/usr/bin/env node
/**
 * RESET DATABASE - Aplica schema completo do zero
 * Use apenas se o banco estiver vazio ou você quiser começar do zero
 */

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não configurado');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function resetDatabase() {
  try {
    console.log('🔄 Conectando ao banco...');
    
    // Verificar se há dados
    const checkResult = await pool.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'events'
    `);
    
    const hasEventsTable = checkResult.rows[0].count > 0;
    
    if (hasEventsTable) {
      const eventCount = await pool.query('SELECT COUNT(*) as count FROM events');
      const count = parseInt(eventCount.rows[0].count);
      
      if (count > 0) {
        console.error('❌ BANCO NÃO ESTÁ VAZIO! Existem eventos no banco.');
        console.error('   Use apenas se tiver certeza que quer resetar tudo!');
        process.exit(1);
      }
    }
    
    console.log('🗑️  Removendo todas as tabelas existentes...');
    
    // Dropar todas as tabelas
    await pool.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `);
    
    // Dropar todas as extensões e recriar
    await pool.query('DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE');
    await pool.query('DROP EXTENSION IF EXISTS "pgcrypto" CASCADE');
    
    console.log('✅ Tabelas removidas');
    
    console.log('📦 Aplicando schema completo do zero...');
    
    // Ler e aplicar schema
    const schemaPath = join(__dirname, '../core/store/postgres-schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Aplicar schema
    await pool.query(schema);
    
    console.log('✅ Schema aplicado com sucesso!');
    console.log('');
    console.log('📊 Verificando estrutura da tabela events...');
    
    const columns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'events'
        AND column_name IN ('id', 'aggregate_id', 'actor_id')
      ORDER BY column_name;
    `);
    
    columns.rows.forEach((row: any) => {
      const marker = row.data_type === 'uuid' ? ' ⚠️  UUID!' : ' ✅';
      console.log(`   ${row.column_name}: ${row.data_type}${marker}`);
    });
    
    console.log('');
    console.log('✅ Banco resetado e schema aplicado!');
    
  } catch (error: any) {
    console.error('❌ Erro ao resetar banco:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetDatabase();

