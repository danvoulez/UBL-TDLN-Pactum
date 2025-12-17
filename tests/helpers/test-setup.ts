/**
 * TEST SETUP HELPERS
 * 
 * Funções utilitárias para configurar ambiente de testes:
 * - Criar event store (in-memory ou PostgreSQL)
 * - Criar ledger instance
 * - Limpar dados entre testes
 * - Criar fixtures
 * - Logging e feedback LLM-friendly
 */

import { createInMemoryEventStore } from '../../core/store/event-store.js';
import { createPostgresEventStoreImpl } from '../../core/store/postgres-event-store.js';
import { createUniversalLedger } from '../../core/index.js';
import type { EventStore } from '../../core/store/event-store.js';
import type { UniversalLedger } from '../../core/index.js';
import { llmError } from './llm-errors.js';

export interface TestContext {
  eventStore: EventStore;
  ledger: UniversalLedger;
  cleanup: () => Promise<void>;
}

/**
 * Create test context with in-memory event store (fast, isolated)
 */
export async function createTestContext(): Promise<TestContext> {
  const eventStore = createInMemoryEventStore();
  const ledger = createUniversalLedger({ eventStore });
  
  return {
    eventStore,
    ledger,
    async cleanup() {
      // In-memory store doesn't need cleanup
      if (typeof eventStore.shutdown === 'function') {
        await eventStore.shutdown();
      }
    }
  };
}

/**
 * Create test context with PostgreSQL (for integration tests)
 */
export async function createPostgresTestContext(
  connectionString?: string
): Promise<TestContext> {
  const databaseUrl = connectionString || process.env.TEST_DATABASE_URL;
  
  if (!databaseUrl) {
    throw llmError('SETUP_FAILED',
      'TEST_DATABASE_URL ou connectionString necessário para testes PostgreSQL',
      {
        hasEnvVar: !!process.env.TEST_DATABASE_URL,
        hasConnectionString: !!connectionString,
      },
      'Defina TEST_DATABASE_URL no ambiente ou passe connectionString como parâmetro'
    );
  }
  
  try {
    const eventStore = createPostgresEventStoreImpl(databaseUrl);
    const ledger = createUniversalLedger({ eventStore });
    
    return {
      eventStore,
      ledger,
      async cleanup() {
        // Optionally clean test data
        // In production, use transactions and rollback
        if (typeof eventStore.shutdown === 'function') {
          await eventStore.shutdown();
        }
      }
    };
  } catch (error: any) {
    throw llmError('SETUP_FAILED',
      'Falha ao criar contexto de teste PostgreSQL',
      {
        error: error.message,
        stack: error.stack,
        databaseUrl: databaseUrl.replace(/:[^:@]+@/, ':****@'), // Ocultar senha
      },
      'Verifique se o banco de dados está acessível e as credenciais estão corretas'
    );
  }
}

/**
 * Create test entity with defaults
 */
export function createTestEntity(overrides: Partial<any> = {}) {
  return {
    entityType: 'Person',
    identity: {
      name: 'Test Entity',
      identifiers: [],
      contacts: []
    },
    ...overrides
  };
}

/**
 * Create test agreement with defaults
 */
export function createTestAgreement(overrides: Partial<any> = {}) {
  return {
    agreementType: 'Employment',
    parties: [],
    terms: {
      description: 'Test Agreement'
    },
    ...overrides
  };
}

/**
 * Wait for async operations to complete
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

