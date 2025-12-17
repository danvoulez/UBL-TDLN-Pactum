/**
 * AUTHENTICATION RULES
 * 
 * Regras de autenticação e autorização para o UBL:
 * 
 * 1. Usuários sempre pertencem a um realm
 * 2. Na criação de usuário, realmId é OBRIGATÓRIO
 * 3. Em outros logins, realmId vem automaticamente da API key
 * 4. API keys são sempre realm-scoped
 */

import type { EntityId } from '../shared/types';

// ============================================================================
// REGRAS DE AUTENTICAÇÃO
// ============================================================================

/**
 * Regra: Usuário sempre pertence a um realm
 */
export interface UserRealmRule {
  readonly userId: EntityId;
  readonly realmId: EntityId;
  readonly isAdmin: boolean;
  readonly createdAt: number;
}

/**
 * Regra: API Key sempre pertence a um realm
 */
export interface ApiKeyRealmRule {
  readonly apiKey: string;
  readonly realmId: EntityId;
  readonly entityId: EntityId;
  readonly scopes: string[];
}

/**
 * Validação: realmId é obrigatório na criação de usuário
 */
export function validateCreateUserPayload(payload: {
  realmId?: EntityId;
  email: string;
  name: string;
  createRealmIfNotExists?: boolean;
}): { valid: boolean; error?: string } {
  // Se createRealmIfNotExists=true, realmId pode ser opcional
  if (payload.createRealmIfNotExists) {
    return { valid: true };
  }
  
  // Caso contrário, realmId é obrigatório
  if (!payload.realmId) {
    return {
      valid: false,
      error: 'realmId is required for createUser intent. Provide realmId in payload or set createRealmIfNotExists=true to create realm automatically.',
    };
  }
  
  return { valid: true };
}

/**
 * Validação: realmId deve corresponder à API key usada
 */
export function validateRealmAccess(
  requestedRealmId: EntityId | undefined,
  apiKeyRealmId: EntityId | undefined
): { valid: boolean; error?: string } {
  // Se não tem API key, não pode validar (mas pode ser permitido para alguns intents)
  if (!apiKeyRealmId) {
    return { valid: true }; // Deixa passar, será validado em outro lugar
  }
  
  // Se não foi fornecido realmId na requisição, usar o da API key
  if (!requestedRealmId) {
    return { valid: true };
  }
  
  // Se foi fornecido, deve corresponder
  if (requestedRealmId !== apiKeyRealmId) {
    return {
      valid: false,
      error: `Realm ID mismatch: API key belongs to realm ${apiKeyRealmId}, but request specifies ${requestedRealmId}`,
    };
  }
  
  return { valid: true };
}

/**
 * Regra: Em logins subsequentes, realmId vem da API key automaticamente
 */
export function resolveRealmId(
  providedRealmId: EntityId | undefined,
  apiKeyRealmId: EntityId | undefined,
  defaultRealmId: EntityId
): EntityId {
  // Prioridade: API key > fornecido > default
  return apiKeyRealmId || providedRealmId || defaultRealmId;
}

/**
 * Regra: Criar realm + usuário admin em uma chamada
 */
export interface CreateRealmAndUserRequest {
  realmName: string;
  userEmail: string;
  userName: string;
  userPassword?: string;
  realmConfig?: {
    isolation?: 'Full' | 'Shared' | 'Hierarchical';
    crossRealmAllowed?: boolean;
  };
}

export function validateCreateRealmAndUser(
  payload: CreateRealmAndUserRequest
): { valid: boolean; error?: string } {
  if (!payload.realmName) {
    return { valid: false, error: 'realmName is required' };
  }
  
  if (!payload.userEmail) {
    return { valid: false, error: 'userEmail is required' };
  }
  
  if (!payload.userName) {
    return { valid: false, error: 'userName is required' };
  }
  
  return { valid: true };
}

