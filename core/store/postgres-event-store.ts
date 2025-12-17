/**
 * POSTGRESQL EVENT STORE
 * 
 * Production-grade EventStore implementation using PostgreSQL.
 * Implements append-only ledger with cryptographic integrity.
 */

import { Pool, Client } from 'pg';
import type {
  Event,
  EntityId,
  Hash,
  SequenceNumber,
  Timestamp,
  AggregateType,
} from '../schema/ledger';
import type {
  EventStore,
  EventInput,
  ReadOptions,
  EventFilter,
} from './event-store';
import type { ChainVerificationResult } from '../enforcement/invariants';
import { createHashChain } from '../enforcement/invariants';
import { generateId } from '../shared/types';
import { readFileSync } from 'fs';
import { join } from 'path';

interface PostgresEventStoreConfig {
  connectionString: string;
  schema?: string;
  maxConnections?: number;
  enableNotify?: boolean;
}

/**
 * Create PostgreSQL EventStore
 */
export function createPostgresEventStoreImpl(
  connectionString: string
): EventStore {
  let pool: Pool | null = null;
  let notifyClient: Client | null = null;
  const hashChain = createHashChain();
  const subscribers = new Set<{
    filter?: EventFilter;
    callback: (event: Event) => void;
  }>();

  const config: PostgresEventStoreConfig = {
    connectionString,
    schema: 'public',
    maxConnections: 20,
    enableNotify: true,
  };

  // Initialize connection pool
  async function initialize(): Promise<void> {
    if (pool) return;

    pool = new Pool({
      connectionString: config.connectionString,
      max: config.maxConnections ?? 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Test connection
    await pool.query('SELECT 1');

    // Ensure schema exists
    await ensureSchema();

    // Set up LISTEN/NOTIFY for real-time subscriptions
    if (config.enableNotify) {
      notifyClient = new Client({
        connectionString: config.connectionString,
      });
      await notifyClient.connect();
      await notifyClient.query('LISTEN new_event');
      
      notifyClient.on('notification', (msg) => {
        if (msg.channel === 'new_event' && msg.payload) {
          try {
            const eventData = JSON.parse(msg.payload);
            // Notify subscribers
            for (const sub of subscribers) {
              if (matchesFilter(eventData, sub.filter)) {
                sub.callback(eventData);
              }
            }
          } catch (err) {
            console.error('Error processing notification:', err);
          }
        }
      });
    }
  }

  // Run automatic migrations to fix known issues
  async function runMigrations(): Promise<void> {
    if (!pool) return;
    
    try {
      // Remove restrictive CHECK constraints that cause issues
      await pool.query(`
        ALTER TABLE IF EXISTS events 
        DROP CONSTRAINT IF EXISTS events_aggregate_type_check;
      `);
      console.log('✅ Migration: Removed aggregate_type constraint');
    } catch (err) {
      // Ignore errors - constraint might not exist
    }
  }

  // Ensure schema exists
  async function ensureSchema(): Promise<void> {
    if (!pool) throw new Error('Pool not initialized');

    try {
      // Check if events table exists
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'events'
        );
      `);
      
      // Run migrations on existing tables
      if (result.rows[0].exists) {
        await runMigrations();
      }

      if (!result.rows[0].exists) {
        // Load and execute schema
        try {
          // Try multiple possible paths
          const possiblePaths = [
            join(process.cwd(), 'core/store/postgres-schema.sql'),
            join(process.cwd(), 'Universal-Business-Ledger/core/store/postgres-schema.sql'),
            join(__dirname || process.cwd(), 'postgres-schema.sql'),
            join(process.cwd(), 'dist/core/store/postgres-schema.sql'),
          ];
          
          let schema: string | null = null;
          let usedPath = '';
          for (const schemaPath of possiblePaths) {
            try {
              schema = readFileSync(schemaPath, 'utf-8');
              usedPath = schemaPath;
              break;
            } catch {
              // Try next path
            }
          }
          
          if (schema) {
            await pool.query(schema);
            console.log(`✅ PostgreSQL schema created from ${usedPath}`);
          } else {
            throw new Error('Schema file not found in any expected location');
          }
        } catch (err: any) {
          console.warn(`⚠️  Could not load schema file: ${err.message}, using minimal schema`);
          // Create minimal schema
          await pool.query(`
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
              command_id UUID,
              correlation_id UUID,
              workflow_id UUID,
              actor_type TEXT NOT NULL,
              actor_id TEXT,
              actor_reason TEXT,
              previous_hash TEXT NOT NULL,
              hash TEXT NOT NULL,
              signature TEXT,
              signer_id UUID,
              metadata JSONB DEFAULT '{}'::jsonb,
              CONSTRAINT unique_aggregate_version UNIQUE (aggregate_type, aggregate_id, aggregate_version)
            );
            
            CREATE INDEX IF NOT EXISTS idx_events_aggregate ON events (aggregate_type, aggregate_id, aggregate_version);
            CREATE INDEX IF NOT EXISTS idx_events_type ON events (event_type);
            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp);
            CREATE INDEX IF NOT EXISTS idx_events_actor ON events (actor_type, actor_id);
          `);
        }
      }
    } catch (err) {
      console.error('Error ensuring schema:', err);
      throw err;
    }
  }

  // Compute hash for event
  function computeEventHash(event: Omit<Event, 'hash'>): Hash {
    return hashChain.computeHash(event);
  }

  // Get previous hash
  async function getPreviousHash(): Promise<Hash> {
    if (!pool) throw new Error('Pool not initialized');
    
    const result = await pool.query(`
      SELECT hash FROM events ORDER BY sequence DESC LIMIT 1
    `);
    
    return result.rows[0]?.hash ?? 'genesis';
  }

  // Get current sequence from database
  async function getCurrentSequenceFromDB(): Promise<SequenceNumber> {
    if (!pool) throw new Error('Pool not initialized');
    
    const result = await pool.query(`
      SELECT COALESCE(MAX(sequence), 0)::bigint as max_sequence FROM events
    `);
    
    return BigInt(result.rows[0]?.max_sequence ?? 0);
  }

  // Check if aggregate version is valid
  async function checkAggregateVersion(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    version: number
  ): Promise<boolean> {
    if (!pool) throw new Error('Pool not initialized');
    
    const result = await pool.query(`
      SELECT COALESCE(MAX(aggregate_version), 0) + 1 as expected_version
      FROM events
      WHERE aggregate_type = $1 AND aggregate_id = $2
    `, [aggregateType, aggregateId]);
    
    const expectedVersion = result.rows[0]?.expected_version ?? 1;
    return version === expectedVersion;
  }

  // Convert database row to Event
  function rowToEvent(row: any): Event {
    return {
      id: row.id,
      sequence: BigInt(row.sequence),
      timestamp: new Date(row.timestamp).getTime(),
      type: row.event_type,
      aggregateId: row.aggregate_id,
      aggregateType: row.aggregate_type,
      aggregateVersion: row.aggregate_version,
      payload: row.payload,
      causation: {
        commandId: row.command_id,
        correlationId: row.correlation_id,
        workflowId: row.workflow_id,
      },
      actor: {
        type: row.actor_type as any,
        ...(row.actor_id && { id: row.actor_id }),
        ...(row.actor_reason && { reason: row.actor_reason }),
      },
      previousHash: row.previous_hash,
      hash: row.hash,
      ...(row.signature && { signature: row.signature }),
      ...(row.signer_id && { signerId: row.signer_id }),
      ...(row.metadata && Object.keys(row.metadata).length > 0 && { metadata: row.metadata }),
    };
  }

  // Check if event matches filter
  function matchesFilter(event: Event, filter?: EventFilter): boolean {
    if (!filter) return true;
    
    if (filter.aggregateTypes && !filter.aggregateTypes.includes(event.aggregateType)) {
      return false;
    }
    
    if (filter.eventTypes && !filter.eventTypes.includes(event.type)) {
      return false;
    }
    
    if (filter.afterSequence && event.sequence <= filter.afterSequence) {
      return false;
    }
    
    return true;
  }

  // Initialize on first use
  let initialized = false;
  const initPromise = initialize().then(() => {
    initialized = true;
  });

  // Expose pool getter for projections
  const getPool = (): Pool | null => pool;

  return {
    name: 'PostgreSQL',
    getPool, // Expose pool for projections
    
    async healthCheck(): Promise<{ healthy: boolean; latencyMs?: number; message?: string }> {
      if (!pool) {
        return { healthy: false, message: 'Not initialized' };
      }
      
      try {
        const start = Date.now();
        await pool.query('SELECT 1');
        const latencyMs = Date.now() - start;
        
        // Check if events table exists
        const tableCheck = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'events'
          );
        `);
        
        return {
          healthy: true,
          latencyMs,
          message: tableCheck.rows[0].exists ? 'Connected and schema ready' : 'Connected but schema not initialized',
        };
      } catch (err: any) {
        return {
          healthy: false,
          message: err.message || 'Health check failed',
        };
      }
    },
    
    async append<T>(eventData: EventInput<T>): Promise<Event<T>> {
      if (!initialized) await initPromise;
      if (!pool) throw new Error('Pool not initialized');

      // Check aggregate version
      const versionValid = await checkAggregateVersion(
        eventData.aggregateType,
        eventData.aggregateId,
        eventData.aggregateVersion
      );
      
      if (!versionValid) {
        throw new Error(
          `Optimistic concurrency violation for ${eventData.aggregateType}:${eventData.aggregateId}`
        );
      }

      // Get previous hash and current sequence
      const previousHash = await getPreviousHash();
      const currentSequence = await getCurrentSequenceFromDB();
      
      // Create event without hash
      const eventWithoutHash: Omit<Event<T>, 'hash'> = {
        id: generateId('evt') as EntityId,
        sequence: currentSequence + 1n,
        timestamp: eventData.timestamp ?? Date.now(),
        type: eventData.type,
        aggregateId: eventData.aggregateId,
        aggregateType: eventData.aggregateType,
        aggregateVersion: eventData.aggregateVersion,
        payload: eventData.payload,
        causation: eventData.causation ?? {},
        actor: eventData.actor,
        previousHash,
      };

      // Compute hash
      const hash = computeEventHash(eventWithoutHash);
      const event: Event<T> = { ...eventWithoutHash, hash };

      // Insert into database
      await pool.query(`
        INSERT INTO events (
          id, sequence, timestamp, event_type,
          aggregate_id, aggregate_type, aggregate_version,
          payload, command_id, correlation_id, workflow_id,
          actor_type, actor_id, actor_reason,
          previous_hash, hash, metadata
        ) VALUES (
          $1, $2, to_timestamp($3 / 1000.0), $4,
          $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14,
          $15, $16, $17
        )
      `, [
        event.id,
        event.sequence.toString(),
        event.timestamp,
        event.type,
        event.aggregateId,
        event.aggregateType,
        event.aggregateVersion,
        JSON.stringify(event.payload),
        event.causation?.commandId ?? null,
        event.causation?.correlationId ?? null,
        event.causation?.workflowId ?? null,
        event.actor.type,
        'id' in event.actor ? event.actor.id : null,
        'reason' in event.actor ? event.actor.reason : null,
        event.previousHash,
        event.hash,
        JSON.stringify(event.metadata ?? {}),
      ]);

      // Notify subscribers
      for (const sub of subscribers) {
        if (matchesFilter(event, sub.filter)) {
          sub.callback(event);
        }
      }

      return event;
    },

    async *getByAggregate(
      aggregateType: AggregateType,
      aggregateId: EntityId,
      options?: ReadOptions
    ): AsyncIterable<Event> {
      if (!initialized) await initPromise;
      if (!pool) throw new Error('Pool not initialized');

      let query = `
        SELECT * FROM events
        WHERE aggregate_type = $1 AND aggregate_id = $2
      `;
      const params: any[] = [aggregateType, aggregateId];

      if (options?.fromVersion) {
        query += ` AND aggregate_version >= $${params.length + 1}`;
        params.push(options.fromVersion);
      }
      if (options?.toVersion) {
        query += ` AND aggregate_version <= $${params.length + 1}`;
        params.push(options.toVersion);
      }
      if (options?.fromTimestamp) {
        query += ` AND timestamp >= to_timestamp($${params.length + 1} / 1000.0)`;
        params.push(options.fromTimestamp);
      }
      if (options?.toTimestamp) {
        query += ` AND timestamp <= to_timestamp($${params.length + 1} / 1000.0)`;
        params.push(options.toTimestamp);
      }

      query += ` ORDER BY aggregate_version ASC`;
      
      if (options?.limit) {
        query += ` LIMIT $${params.length + 1}`;
        params.push(options.limit);
      }

      const result = await pool.query(query, params);
      
      for (const row of result.rows) {
        yield rowToEvent(row);
      }
    },

    async *getBySequence(
      from: SequenceNumber,
      to?: SequenceNumber
    ): AsyncIterable<Event> {
      if (!initialized) await initPromise;
      if (!pool) throw new Error('Pool not initialized');

      let query = `SELECT * FROM events WHERE sequence >= $1`;
      const params: any[] = [from.toString()];

      if (to) {
        query += ` AND sequence <= $2`;
        params.push(to.toString());
      }

      query += ` ORDER BY sequence ASC`;

      const result = await pool.query(query, params);
      
      for (const row of result.rows) {
        yield rowToEvent(row);
      }
    },

    async getById(eventId: EntityId): Promise<Event | null> {
      if (!initialized) await initPromise;
      if (!pool) throw new Error('Pool not initialized');

      const result = await pool.query(
        `SELECT * FROM events WHERE id = $1`,
        [eventId]
      );

      return result.rows.length > 0 ? rowToEvent(result.rows[0]) : null;
    },

    async getLatest(
      aggregateType: AggregateType,
      aggregateId: EntityId
    ): Promise<Event | null> {
      if (!initialized) await initPromise;
      if (!pool) throw new Error('Pool not initialized');

      const result = await pool.query(`
        SELECT * FROM events
        WHERE aggregate_type = $1 AND aggregate_id = $2
        ORDER BY aggregate_version DESC
        LIMIT 1
      `, [aggregateType, aggregateId]);

      return result.rows.length > 0 ? rowToEvent(result.rows[0]) : null;
    },

    async getCurrentSequence(): Promise<SequenceNumber> {
      if (!initialized) await initPromise;
      return await getCurrentSequenceFromDB();
    },

    async *subscribe(filter?: EventFilter): AsyncIterable<Event> {
      if (!initialized) await initPromise;
      
      // For now, poll-based subscription
      // In production, use LISTEN/NOTIFY
      let lastSequence = await getCurrentSequenceFromDB();
      
      while (true) {
        const currentSequence = await getCurrentSequenceFromDB();
        
        if (currentSequence > lastSequence) {
          for await (const event of this.getBySequence(
            lastSequence + 1n,
            currentSequence
          )) {
            if (matchesFilter(event, filter)) {
              yield event;
            }
          }
          lastSequence = currentSequence;
        }
        
        // Poll every 100ms
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    },

    async verifyIntegrity(
      from?: SequenceNumber,
      to?: SequenceNumber
    ): Promise<ChainVerificationResult> {
      if (!initialized) await initPromise;
      if (!pool) throw new Error('Pool not initialized');

      let query = `SELECT * FROM events WHERE sequence >= $1`;
      const params: any[] = [from?.toString() ?? '1'];

      if (to) {
        query += ` AND sequence <= $2`;
        params.push(to.toString());
      }

      query += ` ORDER BY sequence ASC`;

      const result = await pool.query(query, params);
      const events = result.rows.map(rowToEvent);

      return hashChain.verifyChain(events);
    },
  };
}

