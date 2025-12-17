/**
 * EVENT STORE FACTORY
 * 
 * Creates the appropriate EventStore based on environment configuration.
 * - If DATABASE_URL is set: Uses PostgreSQL (production)
 * - Otherwise: Uses in-memory store (development)
 */

import type { EventStore } from './event-store';
import { createInMemoryEventStore } from './event-store';
import { getConfig } from '../config/index.js';

/**
 * Create EventStore based on environment
 */
export function createEventStore(): EventStore {
  const config = getConfig();
  const databaseUrl = config.database.url;
  
  if (databaseUrl) {
    // PostgreSQL is configured - use it
    console.log('📦 Using PostgreSQL EventStore (DATABASE_URL detected)');
    return createPostgresEventStore(databaseUrl);
  } else {
    // No database configured - use in-memory
    console.warn('⚠️  Using in-memory EventStore (DATABASE_URL not set) - data will not persist!');
    return createInMemoryEventStore();
  }
}

/**
 * Create PostgreSQL EventStore
 */
function createPostgresEventStore(connectionString: string): EventStore {
  try {
    const { createPostgresEventStoreImpl } = require('./postgres-event-store');
    return createPostgresEventStoreImpl(connectionString);
  } catch (err) {
    console.error('❌ Failed to create PostgreSQL EventStore:', err);
    console.warn('⚠️  Falling back to in-memory store');
    return createInMemoryEventStore();
  }
}

