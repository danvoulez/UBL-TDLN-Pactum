/**
 * FASE 8 - GOVERNANÇA COMPUTÁVEL DO DIAMANTE
 * 
 * Esta camada aplica políticas operacionais (rate limiting, quotas, throttling)
 * por Realm/Entidade/Intent/API Key.
 * Objetivos principais:
 * - Proteger o sistema contra abuso e "vizinhos barulhentos".
 * - Tornar políticas observáveis, auditáveis e previsíveis.
 * - Integrar com logs e com a UX do agente (mensagens de governança).
 */

import type { RateLimiter, RateLimitScope, RateLimitCheckResult } from './governance';
import type { QuotaManager, QuotaResource, QuotaCheckResult } from './governance';
import type { EntityId } from '../shared/types';
import { logger } from '../observability/logger';

export interface GovernanceContext {
  realmId?: EntityId;
  entityId?: EntityId;
  intent?: string;
  apiKeyId?: EntityId;
  traceId?: string;
  resourceType?: QuotaResource;
}

export type GovernanceDecision =
  | { allowed: true; reason?: string; rateLimit?: RateLimitCheckResult; quota?: QuotaCheckResult }
  | { 
      allowed: false; 
      reason: string; 
      kind: 'rate_limit' | 'quota_exceeded' | 'policy_denied';
      rateLimit?: RateLimitCheckResult;
      quota?: QuotaCheckResult;
      retryAfter?: number;
    };

export interface GovernanceEvaluator {
  /**
   * Evaluate governance policies for a given context.
   */
  evaluate(ctx: GovernanceContext): Promise<GovernanceDecision>;
  
  /**
   * Record usage after an operation (for quotas).
   */
  recordUsage(ctx: GovernanceContext, amount?: number): Promise<void>;
}

/**
 * Create a governance evaluator that combines rate limiting and quotas.
 */
export function createGovernanceEvaluator(
  rateLimiter: RateLimiter,
  quotaManager: QuotaManager
): GovernanceEvaluator {
  /**
   * Evaluate governance for a context.
   */
  async function evaluate(ctx: GovernanceContext): Promise<GovernanceDecision> {
    const { realmId, entityId, intent, apiKeyId, traceId, resourceType } = ctx;
    
    // Build rate limit scope
    const rateLimitScope: RateLimitScope = intent
      ? { type: 'Intent', intentType: intent }
      : realmId
      ? { type: 'Realm', realmId }
      : entityId
      ? { type: 'Entity', entityId }
      : { type: 'Global' };
    
    // Check rate limit
    const rateLimitResult = await rateLimiter.check(rateLimitScope);
    
    if (!rateLimitResult.allowed) {
      logger.warn('governance.decision.denied', {
        kind: 'rate_limit',
        realmId,
        entityId,
        intent,
        apiKeyId,
        traceId,
        limit: rateLimitResult.limit,
        remaining: rateLimitResult.remaining,
        retryAfter: rateLimitResult.retryAfter,
      });
      
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${rateLimitResult.remaining}/${rateLimitResult.limit} remaining`,
        kind: 'rate_limit',
        rateLimit: rateLimitResult,
        retryAfter: rateLimitResult.retryAfter,
      };
    }
    
    // Check quota if resource type is specified
    if (resourceType) {
      const quotaResult = await quotaManager.check(resourceType, realmId);
      
      if (!quotaResult.allowed) {
        logger.warn('governance.decision.denied', {
          kind: 'quota_exceeded',
          realmId,
          entityId,
          intent,
          resourceType,
          traceId,
          current: quotaResult.current,
          limit: quotaResult.limit,
          remaining: quotaResult.remaining,
        });
        
        return {
          allowed: false,
          reason: quotaResult.message || `Quota exceeded: ${quotaResult.current}/${quotaResult.limit}`,
          kind: 'quota_exceeded',
          quota: quotaResult,
        };
      }
      
      // Log allowed decision
      logger.info('governance.decision.allowed', {
        realmId,
        entityId,
        intent,
        apiKeyId,
        traceId,
        rateLimitRemaining: rateLimitResult.remaining,
        quotaRemaining: quotaResult.remaining,
      });
      
      return {
        allowed: true,
        reason: 'Governance check passed',
        rateLimit: rateLimitResult,
        quota: quotaResult,
      };
    }
    
    // Log allowed decision (no quota check)
    logger.info('governance.decision.allowed', {
      realmId,
      entityId,
      intent,
      apiKeyId,
      traceId,
      rateLimitRemaining: rateLimitResult.remaining,
    });
    
    return {
      allowed: true,
      reason: 'Governance check passed',
      rateLimit: rateLimitResult,
    };
  }
  
  /**
   * Record usage after an operation.
   */
  async function recordUsage(ctx: GovernanceContext, amount: number = 1): Promise<void> {
    const { realmId, entityId, intent, resourceType } = ctx;
    
    // Record rate limit usage
    const rateLimitScope: RateLimitScope = intent
      ? { type: 'Intent', intentType: intent }
      : realmId
      ? { type: 'Realm', realmId }
      : entityId
      ? { type: 'Entity', entityId }
      : { type: 'Global' };
    
    await rateLimiter.record(rateLimitScope);
    
    // Record quota usage if resource type is specified
    if (resourceType) {
      await quotaManager.record(resourceType, amount, realmId);
    }
  }
  
  return {
    evaluate,
    recordUsage,
  };
}

