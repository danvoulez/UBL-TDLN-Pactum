/**
 * DATABASE MIGRATIONS
 * 
 * Versioned database migrations for PostgreSQL.
 * Run migrations in order to set up the database schema.
 */

import type { EventStoreAdapter } from '../api/event-store';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// MIGRATION SYSTEM
// ============================================================================

export interface Migration {
  version: number;
  name: string;
  up: string; // SQL to apply migration
  down?: string; // SQL to rollback (optional)
}

// Load schema from SQL file
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try multiple paths (dist, source, process.cwd)
let fullSchema: string | null = null;
const possiblePaths = [
  join(__dirname, 'postgres-schema.sql'), // dist/core/store/
  join(__dirname, '../../core/store/postgres-schema.sql'), // source
  join(process.cwd(), 'core/store/postgres-schema.sql'), // from project root
  join(process.cwd(), 'dist/core/store/postgres-schema.sql'), // dist from root
];

for (const schemaPath of possiblePaths) {
  try {
    fullSchema = readFileSync(schemaPath, 'utf-8');
    break;
  } catch (e) {
    // Try next path
  }
}

if (!fullSchema) {
  console.warn('Could not load postgres-schema.sql from any location');
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '001_initial_schema',
    up: fullSchema || `
      -- Initial schema
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
      
      CREATE INDEX IF NOT EXISTS idx_events_aggregate 
        ON events(aggregate_type, aggregate_id);
      CREATE INDEX IF NOT EXISTS idx_events_type 
        ON events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp 
        ON events(timestamp);
    `,
  },
  {
    version: 2,
    name: '002_aggregate_id_text_migration',
    up: `
      -- Migrate aggregate_id from UUID to TEXT to support custom IDs
      -- This migration handles existing databases that may have UUID aggregate_id
      
      -- Check if column is UUID type and migrate
      DO $$
      DECLARE
        col_type TEXT;
      BEGIN
        -- Check if aggregate_id is UUID type in events table
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'events' 
            AND column_name = 'aggregate_id' 
            AND data_type = 'uuid'
        ) THEN
          -- Migrate events table
          ALTER TABLE events ALTER COLUMN aggregate_id TYPE TEXT USING aggregate_id::TEXT;
          
          -- Recreate indexes that depend on aggregate_id
          DROP INDEX IF EXISTS idx_events_aggregate;
          CREATE INDEX idx_events_aggregate ON events (aggregate_type, aggregate_id, aggregate_version);
        END IF;
        
        -- Check if aggregate_id is UUID type in snapshots table
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'snapshots' 
            AND column_name = 'aggregate_id' 
            AND data_type = 'uuid'
        ) THEN
          -- Migrate snapshots table
          ALTER TABLE snapshots ALTER COLUMN aggregate_id TYPE TEXT USING aggregate_id::TEXT;
          
          -- Recreate indexes
          DROP INDEX IF EXISTS idx_snapshots_aggregate;
          CREATE INDEX idx_snapshots_aggregate ON snapshots (aggregate_type, aggregate_id, version DESC);
        END IF;
        
        -- Update projection tables: convert all ID columns from UUID to TEXT
        RAISE NOTICE 'Altering projection table IDs from UUID to TEXT...';
          -- parties_projection
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'parties_projection') THEN
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_name = 'parties_projection' AND column_name = 'id';
            IF col_type = 'uuid' THEN
              ALTER TABLE parties_projection ALTER COLUMN id TYPE TEXT USING id::TEXT;
            END IF;
          END IF;
          
          -- assets_projection
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assets_projection') THEN
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_name = 'assets_projection' AND column_name = 'id';
            IF col_type = 'uuid' THEN
              ALTER TABLE assets_projection ALTER COLUMN id TYPE TEXT USING id::TEXT;
            END IF;
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_name = 'assets_projection' AND column_name = 'owner_id';
            IF col_type = 'uuid' THEN
              ALTER TABLE assets_projection ALTER COLUMN owner_id TYPE TEXT USING owner_id::TEXT;
            END IF;
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_name = 'assets_projection' AND column_name = 'custodian_id';
            IF col_type = 'uuid' THEN
              ALTER TABLE assets_projection ALTER COLUMN custodian_id TYPE TEXT USING custodian_id::TEXT;
            END IF;
          END IF;
          
          -- agreements_projection
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agreements_projection') THEN
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_name = 'agreements_projection' AND column_name = 'id';
            IF col_type = 'uuid' THEN
              ALTER TABLE agreements_projection ALTER COLUMN id TYPE TEXT USING id::TEXT;
            END IF;
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_name = 'agreements_projection' AND column_name = 'parent_id';
            IF col_type = 'uuid' THEN
              ALTER TABLE agreements_projection ALTER COLUMN parent_id TYPE TEXT USING parent_id::TEXT;
            END IF;
          END IF;
          
          -- roles_projection
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roles_projection') THEN
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_name = 'roles_projection' AND column_name = 'id';
            IF col_type = 'uuid' THEN
              ALTER TABLE roles_projection ALTER COLUMN id TYPE TEXT USING id::TEXT;
            END IF;
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_name = 'roles_projection' AND column_name = 'holder_id';
            IF col_type = 'uuid' THEN
              ALTER TABLE roles_projection ALTER COLUMN holder_id TYPE TEXT USING holder_id::TEXT;
            END IF;
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_name = 'roles_projection' AND column_name = 'context_id';
            IF col_type = 'uuid' THEN
              ALTER TABLE roles_projection ALTER COLUMN context_id TYPE TEXT USING context_id::TEXT;
            END IF;
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_name = 'roles_projection' AND column_name = 'established_by';
            IF col_type = 'uuid' THEN
              ALTER TABLE roles_projection ALTER COLUMN established_by TYPE TEXT USING established_by::TEXT;
            END IF;
          END IF;
          
          -- workflows_projection
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflows_projection') THEN
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_name = 'workflows_projection' AND column_name = 'id';
            IF col_type = 'uuid' THEN
              ALTER TABLE workflows_projection ALTER COLUMN id TYPE TEXT USING id::TEXT;
            END IF;
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_name = 'workflows_projection' AND column_name = 'definition_id';
            IF col_type = 'uuid' THEN
              ALTER TABLE workflows_projection ALTER COLUMN definition_id TYPE TEXT USING definition_id::TEXT;
            END IF;
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_name = 'workflows_projection' AND column_name = 'target_id';
            IF col_type = 'uuid' THEN
              ALTER TABLE workflows_projection ALTER COLUMN target_id TYPE TEXT USING target_id::TEXT;
            END IF;
          END IF;
          
          -- workspace_projection
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspace_projection') THEN
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_name = 'workspace_projection' AND column_name = 'id';
            IF col_type = 'uuid' THEN
              ALTER TABLE workspace_projection ALTER COLUMN id TYPE TEXT USING id::TEXT;
            END IF;
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_name = 'workspace_projection' AND column_name = 'realm_id';
            IF col_type = 'uuid' THEN
              ALTER TABLE workspace_projection ALTER COLUMN realm_id TYPE TEXT USING realm_id::TEXT;
            END IF;
          END IF;
        
        -- Update stored procedures that use aggregate_id
        -- These will be recreated by the full schema with TEXT parameters
        DROP FUNCTION IF EXISTS get_events_at_time(TEXT, UUID, TIMESTAMPTZ);
        DROP FUNCTION IF EXISTS get_events_at_time(TEXT, TEXT, TIMESTAMPTZ);
        DROP FUNCTION IF EXISTS get_events_at_version(TEXT, UUID, INT);
        DROP FUNCTION IF EXISTS get_events_at_version(TEXT, TEXT, INT);
        DROP FUNCTION IF EXISTS get_audit_trail(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT);
        DROP FUNCTION IF EXISTS get_audit_trail(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT);
        DROP FUNCTION IF EXISTS get_actor_actions(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT);
      END $$;
    `,
    down: `
      -- Rollback: Convert TEXT back to UUID (may fail if non-UUID values exist)
      ALTER TABLE events ALTER COLUMN aggregate_id TYPE UUID USING aggregate_id::UUID;
      ALTER TABLE snapshots ALTER COLUMN aggregate_id TYPE UUID USING aggregate_id::UUID;
    `,
  },
  {
    version: 3,
    name: '003_force_uuid_to_text_conversion',
    up: `
      -- FORCE conversion of ALL UUID columns to TEXT for custom IDs
      -- This migration is idempotent and will convert only if needed
      -- It handles all tables and columns that store custom IDs (ent-xxx, agr-xxx, etc.)
      
      DO $$
      DECLARE
        col_type TEXT;
        table_exists BOOLEAN;
      BEGIN
        -- ========================================================================
        -- EVENTS TABLE
        -- ========================================================================
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'events'
        ) INTO table_exists;
        
        IF table_exists THEN
          -- aggregate_id
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'events' AND column_name = 'aggregate_id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting events.aggregate_id from UUID to TEXT...';
            ALTER TABLE events ALTER COLUMN aggregate_id TYPE TEXT USING aggregate_id::TEXT;
            DROP INDEX IF EXISTS idx_events_aggregate;
            CREATE INDEX IF NOT EXISTS idx_events_aggregate ON events (aggregate_type, aggregate_id, aggregate_version);
          END IF;
          
          -- actor_id (if it exists and is UUID)
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'events' AND column_name = 'actor_id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting events.actor_id from UUID to TEXT...';
            ALTER TABLE events ALTER COLUMN actor_id TYPE TEXT USING actor_id::TEXT;
          END IF;
        END IF;
        
        -- ========================================================================
        -- SNAPSHOTS TABLE
        -- ========================================================================
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'snapshots'
        ) INTO table_exists;
        
        IF table_exists THEN
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'snapshots' AND column_name = 'aggregate_id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting snapshots.aggregate_id from UUID to TEXT...';
            ALTER TABLE snapshots ALTER COLUMN aggregate_id TYPE TEXT USING aggregate_id::TEXT;
            DROP INDEX IF EXISTS idx_snapshots_aggregate;
            CREATE INDEX IF NOT EXISTS idx_snapshots_aggregate ON snapshots (aggregate_type, aggregate_id, version DESC);
          END IF;
        END IF;
        
        -- ========================================================================
        -- PROJECTION TABLES
        -- ========================================================================
        
        -- parties_projection
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'parties_projection'
        ) INTO table_exists;
        
        IF table_exists THEN
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'parties_projection' AND column_name = 'id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting parties_projection.id from UUID to TEXT...';
            ALTER TABLE parties_projection ALTER COLUMN id TYPE TEXT USING id::TEXT;
          END IF;
        END IF;
        
        -- assets_projection
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'assets_projection'
        ) INTO table_exists;
        
        IF table_exists THEN
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'assets_projection' AND column_name = 'id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting assets_projection.id from UUID to TEXT...';
            ALTER TABLE assets_projection ALTER COLUMN id TYPE TEXT USING id::TEXT;
          END IF;
          
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'assets_projection' AND column_name = 'owner_id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting assets_projection.owner_id from UUID to TEXT...';
            ALTER TABLE assets_projection ALTER COLUMN owner_id TYPE TEXT USING owner_id::TEXT;
          END IF;
          
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'assets_projection' AND column_name = 'custodian_id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting assets_projection.custodian_id from UUID to TEXT...';
            ALTER TABLE assets_projection ALTER COLUMN custodian_id TYPE TEXT USING custodian_id::TEXT;
          END IF;
        END IF;
        
        -- agreements_projection
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'agreements_projection'
        ) INTO table_exists;
        
        IF table_exists THEN
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'agreements_projection' AND column_name = 'id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting agreements_projection.id from UUID to TEXT...';
            ALTER TABLE agreements_projection ALTER COLUMN id TYPE TEXT USING id::TEXT;
          END IF;
          
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'agreements_projection' AND column_name = 'parent_id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting agreements_projection.parent_id from UUID to TEXT...';
            ALTER TABLE agreements_projection ALTER COLUMN parent_id TYPE TEXT USING parent_id::TEXT;
          END IF;
        END IF;
        
        -- roles_projection
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'roles_projection'
        ) INTO table_exists;
        
        IF table_exists THEN
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'roles_projection' AND column_name = 'id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting roles_projection.id from UUID to TEXT...';
            ALTER TABLE roles_projection ALTER COLUMN id TYPE TEXT USING id::TEXT;
          END IF;
          
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'roles_projection' AND column_name = 'holder_id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting roles_projection.holder_id from UUID to TEXT...';
            ALTER TABLE roles_projection ALTER COLUMN holder_id TYPE TEXT USING holder_id::TEXT;
          END IF;
          
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'roles_projection' AND column_name = 'context_id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting roles_projection.context_id from UUID to TEXT...';
            ALTER TABLE roles_projection ALTER COLUMN context_id TYPE TEXT USING context_id::TEXT;
          END IF;
          
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'roles_projection' AND column_name = 'established_by';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting roles_projection.established_by from UUID to TEXT...';
            ALTER TABLE roles_projection ALTER COLUMN established_by TYPE TEXT USING established_by::TEXT;
          END IF;
        END IF;
        
        -- workflows_projection
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'workflows_projection'
        ) INTO table_exists;
        
        IF table_exists THEN
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'workflows_projection' AND column_name = 'id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting workflows_projection.id from UUID to TEXT...';
            ALTER TABLE workflows_projection ALTER COLUMN id TYPE TEXT USING id::TEXT;
          END IF;
          
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'workflows_projection' AND column_name = 'definition_id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting workflows_projection.definition_id from UUID to TEXT...';
            ALTER TABLE workflows_projection ALTER COLUMN definition_id TYPE TEXT USING definition_id::TEXT;
          END IF;
          
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'workflows_projection' AND column_name = 'target_id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting workflows_projection.target_id from UUID to TEXT...';
            ALTER TABLE workflows_projection ALTER COLUMN target_id TYPE TEXT USING target_id::TEXT;
          END IF;
        END IF;
        
        -- workspace_projection
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'workspace_projection'
        ) INTO table_exists;
        
        IF table_exists THEN
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'workspace_projection' AND column_name = 'id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting workspace_projection.id from UUID to TEXT...';
            ALTER TABLE workspace_projection ALTER COLUMN id TYPE TEXT USING id::TEXT;
          END IF;
          
          SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name = 'workspace_projection' AND column_name = 'realm_id';
          IF col_type = 'uuid' THEN
            RAISE NOTICE 'Converting workspace_projection.realm_id from UUID to TEXT...';
            ALTER TABLE workspace_projection ALTER COLUMN realm_id TYPE TEXT USING realm_id::TEXT;
          END IF;
        END IF;
        
        -- ========================================================================
        -- DROP AND RECREATE STORED PROCEDURES WITH TEXT PARAMETERS
        -- ========================================================================
        RAISE NOTICE 'Dropping old stored procedures with UUID parameters...';
        
        DROP FUNCTION IF EXISTS get_events_at_time(TEXT, UUID, TIMESTAMPTZ);
        DROP FUNCTION IF EXISTS get_events_at_version(TEXT, UUID, INT);
        DROP FUNCTION IF EXISTS get_audit_trail(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT);
        DROP FUNCTION IF EXISTS get_actor_actions(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT);
        
        RAISE NOTICE 'Migration 003 completed successfully. All UUID columns for custom IDs have been converted to TEXT.';
      END $$;
    `,
    down: `
      -- Rollback is not recommended as TEXT can store UUIDs
      -- This migration is one-way: UUID -> TEXT
      RAISE NOTICE 'Rollback for migration 003 is not supported. TEXT columns can store UUID values.';
    `,
  },
];

// ============================================================================
// MIGRATION TRACKING
// ============================================================================

/**
 * Create migrations table to track applied migrations
 */
export async function createMigrationsTable(adapter: any): Promise<void> {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  
  // Execute via adapter (needs to support raw SQL)
  if (adapter.execute) {
    await adapter.execute(createTableSQL);
  } else {
    console.warn('Adapter does not support raw SQL execution');
  }
}

/**
 * Get applied migrations
 */
export async function getAppliedMigrations(adapter: any): Promise<number[]> {
  try {
    if (adapter.query) {
      const result = await adapter.query('SELECT version FROM schema_migrations ORDER BY version');
      return result.rows?.map((r: any) => r.version) || [];
    }
  } catch (e) {
    // Table doesn't exist yet
    return [];
  }
  return [];
}

/**
 * Mark migration as applied
 */
export async function markMigrationApplied(
  adapter: any,
  migration: Migration
): Promise<void> {
  const sql = `
    INSERT INTO schema_migrations (version, name)
    VALUES ($1, $2)
    ON CONFLICT (version) DO NOTHING;
  `;
  
  if (adapter.query) {
    await adapter.query(sql, [migration.version, migration.name]);
  }
}

/**
 * Run all pending migrations
 */
export async function runMigrations(adapter: any): Promise<void> {
  console.log('🔄 Running database migrations...');
  
  // Create migrations table
  await createMigrationsTable(adapter);
  
  // Get applied migrations
  const applied = await getAppliedMigrations(adapter);
  
  // Find pending migrations
  const pending = MIGRATIONS.filter(m => !applied.includes(m.version));
  
  if (pending.length === 0) {
    console.log('✅ Database is up to date');
    return;
  }
  
  console.log(`📦 Found ${pending.length} pending migration(s)`);
  
  // Apply each migration
  for (const migration of pending) {
    console.log(`  → Applying migration ${migration.version}: ${migration.name}`);
    
    try {
      // Execute migration SQL
      if (adapter.execute) {
        await adapter.execute(migration.up);
      } else if (adapter.query) {
        // Split by semicolon and execute each statement
        const statements = migration.up
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        for (const statement of statements) {
          await adapter.query(statement);
        }
      }
      
      // Mark as applied
      await markMigrationApplied(adapter, migration);
      
      console.log(`  ✅ Migration ${migration.version} applied`);
    } catch (error: any) {
      console.error(`  ❌ Migration ${migration.version} failed:`, error.message);
      throw error;
    }
  }
  
  console.log('✅ All migrations applied');
}

/**
 * Run migrations from SQL file directly (for initial setup)
 */
export async function runSchemaFromFile(
  adapter: any,
  schemaSQL: string
): Promise<void> {
  console.log('🔄 Running schema from file...');
  
  // Split by semicolon and execute
  const statements = schemaSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (const statement of statements) {
    if (statement.length > 0) {
      try {
        if (adapter.execute) {
          await adapter.execute(statement);
        } else if (adapter.query) {
          await adapter.query(statement);
        }
      } catch (error: any) {
        // Ignore "already exists" errors
        if (!error.message.includes('already exists')) {
          console.warn('SQL warning:', error.message);
        }
      }
    }
  }
  
  console.log('✅ Schema applied');
}

