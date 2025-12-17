#!/usr/bin/env node
/**
 * Diagnóstico completo de colunas UUID no banco de dados
 * Identifica todas as colunas UUID que podem estar causando erros
 */

import { Pool } from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não configurado');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function diagnostico() {
  try {
    console.log('🔍 Executando diagnóstico completo de UUID...\n');

    // 1. Verificar todas as colunas UUID
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1. COLUNAS UUID EM TODAS AS TABELAS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const uuidColumns = await pool.query(`
      SELECT 
          table_name,
          column_name,
          data_type,
          is_nullable,
          column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type = 'uuid'
      ORDER BY table_name, column_name;
    `);
    
    if (uuidColumns.rows.length === 0) {
      console.log('✅ Nenhuma coluna UUID encontrada (todas foram convertidas para TEXT)');
    } else {
      console.log(`⚠️  Encontradas ${uuidColumns.rows.length} coluna(s) UUID:`);
      uuidColumns.rows.forEach((row: any) => {
        console.log(`   - ${row.table_name}.${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
      });
    }

    // 2. Verificar estrutura da tabela events
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('2. ESTRUTURA DA TABELA EVENTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const eventsColumns = await pool.query(`
      SELECT 
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'events'
      ORDER BY ordinal_position;
    `);
    
    eventsColumns.rows.forEach((row: any) => {
      const marker = row.data_type === 'uuid' ? ' ⚠️  UUID!' : '';
      console.log(`   - ${row.column_name}: ${row.data_type}${marker}`);
    });

    // 3. Tentar inserção de teste
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('3. TESTE DE INSERÇÃO (para identificar coluna problemática)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      // Obter próximo sequence
      const seqResult = await pool.query('SELECT COALESCE(MAX(sequence), 0) + 1 as next_seq FROM events');
      const nextSeq = seqResult.rows[0].next_seq;

      await pool.query(`
        INSERT INTO events (
            id,
            sequence,
            timestamp,
            event_type,
            aggregate_id,
            aggregate_type,
            aggregate_version,
            payload,
            actor_type,
            actor_id,
            previous_hash,
            hash
        ) VALUES (
            gen_random_uuid(),
            $1,
            NOW(),
            'TestEvent',
            'ent-test-123',
            'Party',
            1,
            '{}'::jsonb,
            'System',
            'system',
            'sha256:test',
            'sha256:test'
        )
      `, [nextSeq]);

      console.log('✅ Inserção de teste bem-sucedida!');
      
      // Limpar registro de teste
      await pool.query('DELETE FROM events WHERE event_type = $1', ['TestEvent']);
      console.log('✅ Registro de teste removido');
    } catch (error: any) {
      console.log(`❌ ERRO na inserção de teste:`);
      console.log(`   Mensagem: ${error.message}`);
      console.log(`   Código: ${error.code}`);
      console.log(`   Detalhes: ${error.detail || 'N/A'}`);
      
      // Tentar identificar a coluna problemática
      if (error.message.includes('invalid input syntax for type uuid')) {
        console.log('\n🔍 Analisando erro...');
        const match = error.message.match(/invalid input syntax for type uuid: "([^"]+)"/);
        if (match) {
          const problematicValue = match[1];
          console.log(`   Valor problemático: ${problematicValue}`);
          console.log(`   Este valor está sendo inserido em uma coluna UUID`);
          console.log(`   Possíveis colunas: id, command_id, correlation_id, workflow_id, signer_id`);
        }
      }
    }

    // 4. Verificar triggers
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('4. TRIGGERS NA TABELA EVENTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const triggers = await pool.query(`
      SELECT 
          trigger_name,
          event_object_table,
          action_statement,
          action_timing,
          event_manipulation
      FROM information_schema.triggers
      WHERE event_object_schema = 'public'
        AND event_object_table = 'events'
      ORDER BY trigger_name;
    `);
    
    if (triggers.rows.length === 0) {
      console.log('✅ Nenhum trigger encontrado');
    } else {
      triggers.rows.forEach((row: any) => {
        console.log(`   - ${row.trigger_name} (${row.action_timing} ${row.event_manipulation})`);
      });
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Diagnóstico completo!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error: any) {
    console.error('❌ Erro durante diagnóstico:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

diagnostico();

