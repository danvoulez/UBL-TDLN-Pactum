/**
 * AUTHORIZATION WIRING - Creates Authorization Engine with Ledger Persistence
 * 
 * This module wires together:
 * - RoleStore (from role-store.ts)
 * - PolicyEngine
 * - AuditLogger (persists to ledger via trajectory)
 * 
 * Extracted from server.ts for modularity.
 */

import type { EntityId } from '../../core/shared/types';
import type { EventStore } from '../../core/store/event-store';
import type { RoleStore, AuthorizationAuditLogger, AuthorizationAudit, AuditQuery, AuthorizationEngine } from '../../core/security/authorization';
import { createAuthorizationEngine } from '../../core/security/authorization';
import { createPolicyEngine } from '../../core/security/policies';
import type { AuditLogger } from '../../core/trajectory/event-store-trace';

export interface AuthorizationWiringConfig {
  roleStore: RoleStore;
  trajectoryAuditLogger: AuditLogger;
  primordialRealmId: EntityId;
}

export interface AuthorizationWiring {
  authorizationEngine: AuthorizationEngine;
  auditLogger: AuthorizationAuditLogger;
}

/**
 * Creates the authorization engine with ledger-backed audit logging.
 * 
 * The audit logger bridges AuthorizationAuditLogger interface to our
 * canonical trajectory AuditLogger, ensuring all authorization decisions
 * are persisted to the ledger.
 */
export function createAuthorizationWiring(config: AuthorizationWiringConfig): AuthorizationWiring {
  const { roleStore, trajectoryAuditLogger, primordialRealmId } = config;
  
  // Create policy engine
  const policyEngine = createPolicyEngine();
  
  // Create audit logger that persists to the ledger via trajectory
  // This bridges AuthorizationAuditLogger interface to our canonical AuditLogger
  const auditLogs: AuthorizationAudit[] = []; // Keep in-memory for queries
  const auditLogger: AuthorizationAuditLogger = {
    async log(audit: AuthorizationAudit): Promise<void> {
      // Store in memory for queries
      auditLogs.push(audit);
      
      // ALSO persist to the ledger via trajectory AuditLogger
      await trajectoryAuditLogger.authorization({
        actor: audit.actor,
        action: String(audit.action),
        resource: audit.resource.type,
        resourceId: audit.resource.id as EntityId,
        decision: audit.decision === 'Allow' ? 'GRANTED' : 'DENIED',
        reason: `Authorization ${audit.decision} in ${audit.durationMs}ms`,
        realm: primordialRealmId,
      });
    },
    async query(query: AuditQuery): Promise<readonly AuthorizationAudit[]> {
      // Query from in-memory cache (could be enhanced to query ledger)
      return auditLogs.filter(log => {
        if (query.timeRange) {
          if (query.timeRange.from && log.timestamp < query.timeRange.from) return false;
          if (query.timeRange.to && log.timestamp > query.timeRange.to) return false;
        }
        return true;
      }).slice(0, query.limit || 100);
    },
  };
  
  // Create authorization engine
  const authorizationEngine = createAuthorizationEngine(roleStore, policyEngine, auditLogger);
  
  return {
    authorizationEngine,
    auditLogger,
  };
}
