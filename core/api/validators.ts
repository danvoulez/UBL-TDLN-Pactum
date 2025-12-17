/**
 * API VALIDATORS - Modular & LLM-Friendly
 * 
 * Validações centralizadas para API:
 * - Validação de intents
 * - Validação de payloads
 * - Validação de autenticação
 * - Mensagens claras
 */

import { apiError } from './errors.js';
import type { Intent } from './intent-api.js';

/**
 * Valida intent request
 */
export function validateIntentRequest(intent: string, payload: any): {
  valid: boolean;
  errors: Array<{ code: string; message: string; field?: string }>;
} {
  const errors: Array<{ code: string; message: string; field?: string }> = [];

  // Validar intent
  if (!intent || typeof intent !== 'string') {
    errors.push({
      code: 'API001',
      message: 'Campo "intent" é obrigatório e deve ser uma string',
      field: 'intent',
    });
  } else if (intent.trim().length === 0) {
    errors.push({
      code: 'API001',
      message: 'Campo "intent" não pode estar vazio',
      field: 'intent',
    });
  }

  // Validar payload
  if (payload !== undefined && typeof payload !== 'object') {
    errors.push({
      code: 'API003',
      message: 'Campo "payload" deve ser um objeto',
      field: 'payload',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Valida intent completo
 */
export function validateIntent(intent: Intent): {
  valid: boolean;
  errors: Array<{ code: string; message: string; field?: string }>;
} {
  const errors: Array<{ code: string; message: string; field?: string }> = [];

  // Validar intent name
  if (!intent.intent || typeof intent.intent !== 'string') {
    errors.push({
      code: 'API001',
      message: 'Campo "intent" é obrigatório',
      field: 'intent',
    });
  }

  // Validar realm
  if (!intent.realm || typeof intent.realm !== 'string') {
    errors.push({
      code: 'API003',
      message: 'Campo "realm" é obrigatório',
      field: 'realm',
    });
  }

  // Validar actor
  if (!intent.actor) {
    errors.push({
      code: 'API003',
      message: 'Campo "actor" é obrigatório',
      field: 'actor',
    });
  } else {
    if (!intent.actor.id || typeof intent.actor.id !== 'string') {
      errors.push({
        code: 'API003',
        message: 'Campo "actor.id" é obrigatório',
        field: 'actor.id',
      });
    }
    if (!intent.actor.type || typeof intent.actor.type !== 'string') {
      errors.push({
        code: 'API003',
        message: 'Campo "actor.type" é obrigatório',
        field: 'actor.type',
      });
    }
  }

  // Validar payload
  if (intent.payload === undefined || intent.payload === null) {
    errors.push({
      code: 'API003',
      message: 'Campo "payload" é obrigatório',
      field: 'payload',
    });
  } else if (typeof intent.payload !== 'object') {
    errors.push({
      code: 'API003',
      message: 'Campo "payload" deve ser um objeto',
      field: 'payload',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Valida API key
 */
export function validateApiKey(apiKey: string | undefined): {
  valid: boolean;
  error?: string;
} {
  if (!apiKey) {
    return {
      valid: false,
      error: 'API key não fornecida',
    };
  }

  if (typeof apiKey !== 'string') {
    return {
      valid: false,
      error: 'API key deve ser uma string',
    };
  }

  if (apiKey.trim().length === 0) {
    return {
      valid: false,
      error: 'API key não pode estar vazia',
    };
  }

  // Validar formato básico (deve começar com ubl_)
  if (!apiKey.startsWith('ubl_')) {
    return {
      valid: false,
      error: 'API key deve começar com "ubl_"',
    };
  }

  if (apiKey.length < 20) {
    return {
      valid: false,
      error: 'API key muito curta',
    };
  }

  return { valid: true };
}

/**
 * Valida realm ID
 */
export function validateRealmId(realmId: string | undefined): {
  valid: boolean;
  error?: string;
} {
  if (!realmId) {
    return {
      valid: false,
      error: 'Realm ID não fornecido',
    };
  }

  if (typeof realmId !== 'string') {
    return {
      valid: false,
      error: 'Realm ID deve ser uma string',
    };
  }

  if (realmId.trim().length === 0) {
    return {
      valid: false,
      error: 'Realm ID não pode estar vazio',
    };
  }

  // Validar formato básico (deve começar com rlm_)
  if (!realmId.startsWith('rlm-')) {
    return {
      valid: false,
      error: 'Realm ID deve começar com "rlm-"',
    };
  }

  return { valid: true };
}

/**
 * Valida entity ID
 */
export function validateEntityId(entityId: string | undefined, field: string = 'id'): {
  valid: boolean;
  error?: string;
} {
  if (!entityId) {
    return {
      valid: false,
      error: `${field} não fornecido`,
    };
  }

  if (typeof entityId !== 'string') {
    return {
      valid: false,
      error: `${field} deve ser uma string`,
    };
  }

  if (entityId.trim().length === 0) {
    return {
      valid: false,
      error: `${field} não pode estar vazio`,
    };
  }

  return { valid: true };
}

