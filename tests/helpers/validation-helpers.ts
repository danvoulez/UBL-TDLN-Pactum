/**
 * VALIDATION HELPERS - Rigorous Test Utilities
 * 
 * Funções auxiliares para validações rigorosas em testes:
 * - Integridade de eventos
 * - Hash chains
 * - Ordem temporal
 * - Estrutura de dados
 * - Edge cases
 * 
 * Uso: import { validateEventIntegrity, validateHashChain, ... } from '../helpers/validation-helpers.js';
 */

import type { Event } from '../../core/schema/ledger.js';
import type { EventStore } from '../../core/store/event-store.js';
import { createHashChain } from '../../core/enforcement/invariants.js';
import type { ChainVerificationResult } from '../../core/enforcement/invariants.js';

// ============================================================================
// EVENT INTEGRITY VALIDATION
// ============================================================================

export interface EventIntegrityResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Valida integridade completa de um evento
 */
export function validateEventIntegrity(event: Event): EventIntegrityResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Campos obrigatórios
  if (!event.id) errors.push('Event missing id');
  if (!event.sequence) errors.push('Event missing sequence');
  if (!event.timestamp) errors.push('Event missing timestamp');
  if (!event.type) errors.push('Event missing type');
  if (!event.aggregateId) errors.push('Event missing aggregateId');
  if (!event.aggregateType) errors.push('Event missing aggregateType');
  if (event.aggregateVersion === undefined) errors.push('Event missing aggregateVersion');
  if (!event.actor) errors.push('Event missing actor');
  if (!event.hash) errors.push('Event missing hash');
  if (!event.previousHash) errors.push('Event missing previousHash');
  
  // Validação de tipos
  if (typeof event.id !== 'string') errors.push('Event id must be string');
  if (typeof event.sequence !== 'bigint') errors.push('Event sequence must be bigint');
  if (typeof event.timestamp !== 'number') errors.push('Event timestamp must be number');
  if (typeof event.type !== 'string') errors.push('Event type must be string');
  if (typeof event.aggregateId !== 'string') errors.push('Event aggregateId must be string');
  if (typeof event.aggregateVersion !== 'number') errors.push('Event aggregateVersion must be number');
  if (typeof event.hash !== 'string') errors.push('Event hash must be string');
  if (typeof event.previousHash !== 'string') errors.push('Event previousHash must be string');
  
  // Validação de formatos
  if (event.hash && !event.hash.startsWith('sha256:')) {
    errors.push(`Event hash must start with 'sha256:': ${event.hash}`);
  }
  
  if (event.sequence && event.sequence <= 0n) {
    errors.push(`Event sequence must be positive: ${event.sequence}`);
  }
  
  if (event.timestamp && event.timestamp <= 0) {
    errors.push(`Event timestamp must be positive: ${event.timestamp}`);
  }
  
  if (event.timestamp && event.timestamp > Date.now() + 60000) {
    warnings.push(`Event timestamp is in the future: ${event.timestamp}`);
  }
  
  // Validação de hash
  if (event.hash) {
    const hashChain = createHashChain();
    if (!hashChain.verifyHash(event)) {
      errors.push('Event hash verification failed');
    }
  }
  
  // Validação de actor
  if (event.actor) {
    if (!event.actor.type) {
      errors.push('Event actor missing type');
    } else {
      switch (event.actor.type) {
        case 'Entity':
          if (!(event.actor as any).entityId) {
            errors.push('Entity actor missing entityId');
          }
          break;
        case 'System':
          if (!(event.actor as any).systemId) {
            errors.push('System actor missing systemId');
          }
          break;
        case 'Workflow':
          if (!(event.actor as any).workflowId) {
            errors.push('Workflow actor missing workflowId');
          }
          break;
        case 'Anonymous':
          if (!(event.actor as any).reason) {
            warnings.push('Anonymous actor missing reason');
          }
          break;
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Valida integridade de uma sequência de eventos
 */
export async function validateEventSequence(
  events: Event[],
  eventStore?: EventStore
): Promise<EventIntegrityResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (events.length === 0) {
    return { isValid: true, errors: [], warnings: [] };
  }
  
  // Validar cada evento individualmente
  for (const event of events) {
    const result = validateEventIntegrity(event);
    if (!result.isValid) {
      errors.push(...result.errors.map(e => `Event ${event.id}: ${e}`));
    }
    warnings.push(...result.warnings.map(w => `Event ${event.id}: ${w}`));
  }
  
  // Validar ordem de sequência
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    
    if (curr.sequence <= prev.sequence) {
      errors.push(`Sequence not monotonic: ${prev.sequence} -> ${curr.sequence}`);
    }
    
    if (curr.timestamp < prev.timestamp) {
      errors.push(`Timestamp not monotonic: ${prev.timestamp} -> ${curr.timestamp}`);
    }
    
    if (curr.previousHash !== prev.hash) {
      errors.push(`Hash chain broken: expected ${prev.hash}, got ${curr.previousHash}`);
    }
  }
  
  // Validar hash chain completa
  if (eventStore) {
    const result = await eventStore.verifyIntegrity();
    if (!result.isValid) {
      errors.push(`Hash chain verification failed: ${result.error}`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// ============================================================================
// DATA STRUCTURE VALIDATION
// ============================================================================

/**
 * Valida estrutura de resposta de intent
 */
export function validateIntentResult(result: any): EventIntegrityResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Campos obrigatórios
  if (result === null || result === undefined) {
    errors.push('Intent result is null or undefined');
    return { isValid: false, errors, warnings };
  }
  
  if (typeof result.success !== 'boolean') {
    errors.push('Intent result missing success field');
  }
  
  if (!result.outcome) {
    errors.push('Intent result missing outcome');
  } else {
    if (!result.outcome.type) {
      errors.push('Intent outcome missing type');
    }
  }
  
  if (!result.meta) {
    warnings.push('Intent result missing meta');
  } else {
    if (typeof result.meta.processedAt !== 'number') {
      warnings.push('Intent meta missing processedAt');
    }
  }
  
  // Validar eventos se presentes
  if (result.events && Array.isArray(result.events)) {
    for (const event of result.events) {
      const eventResult = validateEventIntegrity(event);
      if (!eventResult.isValid) {
        errors.push(...eventResult.errors);
      }
      warnings.push(...eventResult.warnings);
    }
  }
  
  // Validar affordances se presentes
  if (result.affordances && Array.isArray(result.affordances)) {
    for (const affordance of result.affordances) {
      if (!affordance.intent) {
        warnings.push('Affordance missing intent');
      }
      if (!affordance.description) {
        warnings.push('Affordance missing description');
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Valida formato de ID
 */
export function validateIdFormat(id: string, expectedPrefix?: string): boolean {
  if (!id || typeof id !== 'string') return false;
  if (id.length < 5) return false;
  if (expectedPrefix && !id.startsWith(expectedPrefix)) return false;
  return true;
}

/**
 * Valida formato de API key
 */
export function validateApiKeyFormat(apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') return false;
  if (!apiKey.startsWith('ubl_')) return false;
  if (apiKey.length < 20) return false;
  return true;
}

// ============================================================================
// EDGE CASE VALIDATION
// ============================================================================

/**
 * Valida que valores não são null ou undefined quando esperados
 */
export function assertNotNull<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

/**
 * Valida que array não está vazio quando esperado
 */
export function assertNotEmpty<T>(array: T[], message: string): asserts array is [T, ...T[]] {
  if (!Array.isArray(array) || array.length === 0) {
    throw new Error(message);
  }
}

/**
 * Valida que número está dentro de limites
 */
export function assertInRange(
  value: number,
  min: number,
  max: number,
  message?: string
): void {
  if (value < min || value > max) {
    throw new Error(message || `Value ${value} is outside range [${min}, ${max}]`);
  }
}

/**
 * Valida que timestamp é razoável (não muito no futuro/passado)
 */
export function assertReasonableTimestamp(timestamp: number, maxFutureMs = 60000): void {
  const now = Date.now();
  if (timestamp < 0) {
    throw new Error(`Timestamp is negative: ${timestamp}`);
  }
  if (timestamp > now + maxFutureMs) {
    throw new Error(`Timestamp is too far in the future: ${timestamp} (now: ${now})`);
  }
  // Permitir timestamps antigos (até 10 anos atrás)
  const tenYearsAgo = now - (10 * 365 * 24 * 60 * 60 * 1000);
  if (timestamp < tenYearsAgo) {
    throw new Error(`Timestamp is too old: ${timestamp} (now: ${now})`);
  }
}

// ============================================================================
// PERFORMANCE VALIDATION
// ============================================================================

/**
 * Mede tempo de execução e valida que está dentro do limite
 */
export async function assertPerformance<T>(
  fn: () => Promise<T>,
  maxMs: number,
  description: string
): Promise<T> {
  const start = process.hrtime.bigint();
  const result = await fn();
  const end = process.hrtime.bigint();
  const durationMs = Number(end - start) / 1_000_000;
  
  if (durationMs > maxMs) {
    throw new Error(
      `${description} took ${durationMs.toFixed(2)}ms, expected < ${maxMs}ms`
    );
  }
  
  return result;
}

/**
 * Valida que operação completa em tempo razoável
 */
export async function assertReasonablePerformance<T>(
  fn: () => Promise<T>,
  description: string
): Promise<T> {
  return assertPerformance(fn, 5000, description); // 5 segundos padrão
}

// ============================================================================
// ISOLATION VALIDATION
// ============================================================================

/**
 * Valida que eventos de diferentes realms estão isolados
 */
export async function validateRealmIsolation(
  realm1Events: Event[],
  realm2Events: Event[],
  realm1Id: string,
  realm2Id: string
): Promise<EventIntegrityResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Verificar que nenhum evento de realm1 referencia realm2
  for (const event of realm1Events) {
    const payload = event.payload as any;
    if (payload?.realmId === realm2Id) {
      errors.push(`Realm1 event ${event.id} references realm2`);
    }
  }
  
  // Verificar que nenhum evento de realm2 referencia realm1
  for (const event of realm2Events) {
    const payload = event.payload as any;
    if (payload?.realmId === realm1Id) {
      errors.push(`Realm2 event ${event.id} references realm1`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}


