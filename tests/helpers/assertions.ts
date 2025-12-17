/**
 * LLM-FRIENDLY ASSERTIONS
 * 
 * Assertions descritivas com contexto completo para facilitar debugging:
 * - Mensagens claras e específicas
 * - Contexto completo do que foi testado
 * - Valores esperados vs. recebidos
 * - Sugestões de correção
 * 
 * Uso:
 *   assertEventIntegrity(event, { realmId, aggregateId });
 *   assertSequenceCorrect(events, { expectedStart: 1n });
 */

import { strict as assert } from 'node:assert';
import type { Event } from '../../core/schema/ledger.js';
import { llmError, assertLLM, assertEqualLLM } from './llm-errors.js';
import { validateEventIntegrity, validateEventSequence } from './validation-helpers.js';
import type { EventStore } from '../../core/store/event-store.js';

/**
 * Assert com contexto completo para eventos
 */
export function assertEventIntegrity(
  event: Event,
  context: {
    operation?: string;
    aggregateId?: string;
    realmId?: string;
    [key: string]: any;
  } = {}
): void {
  const validation = validateEventIntegrity(event);
  
  if (!validation.isValid) {
    throw llmError('EVENT_INTEGRITY',
      `Evento falhou na validação de integridade`,
      {
        event,
        errors: validation.errors,
        warnings: validation.warnings,
        ...context,
      }
    );
  }
}

/**
 * Assert para sequência de eventos
 */
export async function assertSequenceCorrect(
  events: Event[],
  context: {
    expectedStart?: bigint;
    expectedCount?: number;
    operation?: string;
    [key: string]: any;
  } = {}
): Promise<void> {
  if (events.length === 0) {
    throw llmError('EVENT_SEQUENCE',
      'Sequência de eventos está vazia',
      context
    );
  }
  
  const expectedStart = context.expectedStart ?? 1n;
  const firstSequence = events[0].sequence;
  
  if (firstSequence !== expectedStart) {
    throw llmError('EVENT_SEQUENCE',
      `Primeira sequência não corresponde ao esperado`,
      {
        expectedStart,
        actualStart: firstSequence,
        ...context,
      }
    );
  }
  
  // Verificar monotonicidade
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1].sequence;
    const curr = events[i].sequence;
    
    if (curr !== prev + 1n) {
      throw llmError('EVENT_SEQUENCE',
        `Sequência não é monotônica: evento ${i} tem sequence ${curr}, esperado ${prev + 1n}`,
        {
          index: i,
          previousSequence: prev,
          currentSequence: curr,
          expectedSequence: prev + 1n,
          ...context,
        }
      );
    }
  }
  
  if (context.expectedCount !== undefined && events.length !== context.expectedCount) {
    throw llmError('EVENT_SEQUENCE',
      `Número de eventos não corresponde ao esperado`,
      {
        expectedCount: context.expectedCount,
        actualCount: events.length,
        ...context,
      }
    );
  }
}

/**
 * Assert para hash chain
 */
export function assertHashChainValid(
  events: Event[],
  context: {
    operation?: string;
    [key: string]: any;
  } = {}
): void {
  if (events.length === 0) return;
  
  // Primeiro evento deve ter previousHash vazio ou específico
  if (events.length > 1) {
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const curr = events[i];
      
      if (curr.previousHash !== prev.hash) {
        throw llmError('HASH_CHAIN',
          `Hash chain quebrada no evento ${i}`,
          {
            index: i,
            previousEvent: {
              id: prev.id,
              hash: prev.hash,
            },
            currentEvent: {
              id: curr.id,
              previousHash: curr.previousHash,
            },
            ...context,
          }
        );
      }
    }
  }
}

/**
 * Assert para timestamp razoável
 */
export function assertReasonableTimestamp(
  timestamp: number,
  context: {
    maxFutureMs?: number;
    operation?: string;
    [key: string]: any;
  } = {}
): void {
  const now = Date.now();
  const maxFuture = context.maxFutureMs ?? 60000; // 1 minuto padrão
  
  if (timestamp < 0) {
    throw llmError('TIMESTAMP_INVALID',
      `Timestamp é negativo`,
      {
        timestamp,
        now,
        ...context,
      }
    );
  }
  
  if (timestamp > now + maxFuture) {
    throw llmError('TIMESTAMP_INVALID',
      `Timestamp está muito no futuro`,
      {
        timestamp,
        now,
        maxFuture,
        difference: timestamp - now,
        ...context,
      }
    );
  }
  
  // Permitir até 10 anos no passado
  const tenYearsAgo = now - (10 * 365 * 24 * 60 * 60 * 1000);
  if (timestamp < tenYearsAgo) {
    throw llmError('TIMESTAMP_INVALID',
      `Timestamp está muito no passado`,
      {
        timestamp,
        now,
        tenYearsAgo,
        difference: now - timestamp,
        ...context,
      }
    );
  }
}

/**
 * Assert para isolamento de realms
 */
export function assertRealmIsolation(
  realm1Events: Event[],
  realm2Events: Event[],
  realm1Id: string,
  realm2Id: string,
  context: {
    operation?: string;
    [key: string]: any;
  } = {}
): void {
  // Verificar que eventos de realm1 não referenciam realm2
  for (const event of realm1Events) {
    const payload = event.payload as any;
    if (payload?.realmId === realm2Id) {
      throw llmError('REALM_ISOLATION',
        `Evento do realm1 referencia realm2`,
        {
          eventId: event.id,
          eventType: event.type,
          realm1Id,
          realm2Id,
          payload,
          ...context,
        }
      );
    }
  }
  
  // Verificar que eventos de realm2 não referenciam realm1
  for (const event of realm2Events) {
    const payload = event.payload as any;
    if (payload?.realmId === realm1Id) {
      throw llmError('REALM_ISOLATION',
        `Evento do realm2 referencia realm1`,
        {
          eventId: event.id,
          eventType: event.type,
          realm1Id,
          realm2Id,
          payload,
          ...context,
        }
      );
    }
  }
}

/**
 * Assert para presença de actor
 */
export function assertActorPresent(
  event: Event,
  context: {
    operation?: string;
    [key: string]: any;
  } = {}
): void {
  if (!event.actor) {
    throw llmError('ACTOR_MISSING',
      `Evento não possui actor`,
      {
        eventId: event.id,
        eventType: event.type,
        ...context,
      }
    );
  }
  
  if (!event.actor.id || typeof event.actor.id !== 'string') {
    throw llmError('ACTOR_MISSING',
      `Actor do evento não possui ID válido`,
      {
        eventId: event.id,
        actor: event.actor,
        ...context,
      }
    );
  }
}

/**
 * Assert para resultado de intent
 */
export function assertIntentResult(
  result: any,
  context: {
    intent?: string;
    expectedSuccess?: boolean;
    [key: string]: any;
  } = {}
): void {
  if (typeof result !== 'object' || result === null) {
    throw llmError('INTENT_RESULT',
      `Resultado de intent não é um objeto`,
      {
        result,
        ...context,
      }
    );
  }
  
  if (typeof result.success !== 'boolean') {
    throw llmError('INTENT_RESULT',
      `Resultado de intent não possui campo 'success'`,
      {
        result,
        ...context,
      }
    );
  }
  
  if (context.expectedSuccess !== undefined && result.success !== context.expectedSuccess) {
    throw llmError('INTENT_RESULT',
      `Resultado de intent não corresponde ao esperado`,
      {
        expectedSuccess: context.expectedSuccess,
        actualSuccess: result.success,
        result,
        ...context,
      }
    );
  }
  
  if (!result.outcome) {
    throw llmError('INTENT_RESULT',
      `Resultado de intent não possui campo 'outcome'`,
      {
        result,
        ...context,
      }
    );
  }
  
  if (!result.outcome.type) {
    throw llmError('INTENT_RESULT',
      `Outcome de intent não possui campo 'type'`,
      {
        result,
        outcome: result.outcome,
        ...context,
      }
    );
  }
}

/**
 * Assert para performance
 */
export async function assertPerformance<T>(
  fn: () => Promise<T>,
  maxMs: number,
  description: string,
  context: {
    [key: string]: any;
  } = {}
): Promise<T> {
  const start = process.hrtime.bigint();
  const result = await fn();
  const end = process.hrtime.bigint();
  const durationMs = Number(end - start) / 1_000_000;
  
  if (durationMs > maxMs) {
    throw llmError('PERFORMANCE',
      `${description} excedeu o tempo limite`,
      {
        operation: description,
        maxMs,
        actualMs: durationMs,
        ...context,
      }
    );
  }
  
  return result;
}

/**
 * Assert genérico com mensagem descritiva
 */
export function assertWithContext<T>(
  condition: T,
  message: string,
  context: {
    expected?: any;
    actual?: any;
    [key: string]: any;
  } = {}
): asserts condition {
  if (!condition) {
    throw llmError('ASSERTION_FAILED',
      message,
      context
    );
  }
}

/**
 * Re-exporta assert padrão com contexto opcional
 */
export { assert };

