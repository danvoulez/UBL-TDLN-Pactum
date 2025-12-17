/**
 * ROLE STORE - Agreement-Based Role Resolution
 * 
 * This module creates a RoleStore that queries roles from:
 * 1. Active Agreements with roleType in terms (ABAC via agreements)
 * 2. RoleGranted events in Role aggregate (traditional)
 * 
 * Extracted from server.ts for modularity.
 */

import type { EntityId, ActorReference, Timestamp } from '../../core/shared/types';
import type { EventStore } from '../../core/store/event-store';
import type { RoleStore } from '../../core/security/authorization';
import type { Role } from '../../core/universal/primitives';
import type { AuditLogger } from '../../core/trajectory/event-store-trace';

export interface RoleStoreConfig {
  eventStore: EventStore;
  auditLogger: AuditLogger;
  primordialRealmId: EntityId;
}

/**
 * Creates a RoleStore that queries roles from agreements.
 * Roles are derived from active agreements with roleType in terms.
 */
export function createRoleStore(config: RoleStoreConfig): RoleStore {
  const { eventStore, auditLogger, primordialRealmId } = config;
  
  // Helper function to find roles by holderId
  async function findRolesByHolder(holderId: EntityId): Promise<Map<EntityId, Role>> {
    const rolesMap = new Map<EntityId, Role>();
    
    // For PostgreSQL, query both Role events AND Agreement events with roleType
    const pool = (eventStore as any).getPool?.();
    
    if (pool) {
      try {
        // Query: Find roles from active agreements where holder is a party
        // Uses proper JSONB operators instead of fragile LIKE on text
        const agreementResult = await pool.query(`
          WITH active_agreements AS (
            SELECT DISTINCT e.aggregate_id, e.payload
            FROM events e
            WHERE e.aggregate_type = 'Agreement'
              AND e.event_type = 'AgreementProposed'
              AND e.payload->'terms'->>'roleType' IS NOT NULL
              AND (
                -- Check if holderId is in the parties array (proper JSONB query)
                EXISTS (
                  SELECT 1 FROM jsonb_array_elements(e.payload->'parties') AS party
                  WHERE party->>'entityId' = $1
                )
                -- Also check proposer/counterparty fields for simpler agreement structures
                OR e.payload->>'proposerId' = $1
                OR e.payload->>'counterpartyId' = $1
                OR e.payload->'terms'->>'holderId' = $1
              )
          ),
          agreement_status AS (
            SELECT DISTINCT ON (aggregate_id) 
              aggregate_id,
              payload->>'newStatus' as status
            FROM events
            WHERE aggregate_type = 'Agreement'
              AND event_type = 'AgreementStatusChanged'
            ORDER BY aggregate_id, sequence DESC
          )
          SELECT aa.aggregate_id, aa.payload
          FROM active_agreements aa
          LEFT JOIN agreement_status ast ON aa.aggregate_id = ast.aggregate_id
          WHERE ast.status = 'Active'
        `, [holderId]);
        
        // Import ROLE_TEMPLATES to get permissions for each role type
        const { ROLE_TEMPLATES, PERMISSION_SETS } = await import('../../core/security/authorization');
        
        for (const row of agreementResult.rows) {
          const payload = row.payload;
          const roleType = payload.terms?.roleType;
          const scope = payload.terms?.scope || { type: 'Global' };
          
          if (roleType) {
            // Get permissions from ROLE_TEMPLATES or PERMISSION_SETS
            const template = (ROLE_TEMPLATES as any)[roleType];
            const permissions = template?.permissions || (PERMISSION_SETS as any)[roleType] || [];
            
            // Normalize scope: agreement uses realmId, Role interface uses targetId
            const normalizedScope = {
              type: scope.type || 'Global',
              targetId: scope.targetId || scope.realmId,
            };
            
            // Create a synthetic Role from the agreement with actual permissions
            const role: Role = {
              id: `role-from-${row.aggregate_id}` as EntityId,
              roleType,
              holderId,
              establishedBy: row.aggregate_id as EntityId,
              scope: normalizedScope as any,
              isActive: true,
              validity: { from: 0 } as any,
              permissions,
            };
            rolesMap.set(role.id, role);
          }
        }
        
        // Query 2: Also check for direct RoleGranted events
        const roleResult = await pool.query(`
          SELECT e.aggregate_id, e.payload
          FROM events e
          WHERE e.aggregate_type = 'Role'
            AND e.event_type = 'RoleGranted'
            AND e.payload->>'holderId' = $1
        `, [holderId]);
        
        for (const row of roleResult.rows) {
          const { roleRehydrator } = await import('../../core/aggregates/rehydrators');
          const { reconstructAggregate } = await import('../../core/store/event-store');
          
          try {
            const roleState = await reconstructAggregate(
              eventStore,
              'Role' as any,
              row.aggregate_id as EntityId,
              roleRehydrator
            );
            
            if (roleState && roleState.exists && roleState.isActive) {
              rolesMap.set(row.aggregate_id as EntityId, roleState as any);
            }
          } catch (err) {
            console.warn(`Failed to rehydrate role ${row.aggregate_id}:`, err);
          }
        }
      } catch (err) {
        console.warn('PostgreSQL query failed:', err);
      }
    }
    
    return rolesMap;
  }
  
  return {
    async getActiveRoles(actor: ActorReference, realm: EntityId, at: Timestamp): Promise<readonly Role[]> {
      // Get entity ID from actor
      let entityId: EntityId | undefined;
      if (actor.type === 'Entity') {
        entityId = actor.entityId;
      } else if ((actor as any).type === 'Party') {
        entityId = (actor as any).partyId;
      } else {
        return []; // System actors don't have roles from agreements
      }
      
      if (!entityId) return [];
      
      // Find all roles for this holder from active agreements
      const rolesMap = await findRolesByHolder(entityId);
      const roles: Role[] = [];
      const now = at || Date.now();
      
      // Filter roles by validity and scope
      const roleEvaluations: Array<{
        roleType: string;
        included: boolean;
        reason: string;
      }> = [];
      
      for (const role of rolesMap.values()) {
        const scopeType = (role.scope as any)?.type || 'Global';
        const scopeTargetId = (role.scope as any)?.targetId;
        const validFrom = (role.validity as any)?.from || 0;
        const validUntil = (role.validity as any)?.until;
        
        // Check active
        if (!role.isActive) {
          roleEvaluations.push({ roleType: role.roleType, included: false, reason: 'Role not active' });
          continue;
        }
        
        // Check validity period
        if (now < validFrom) {
          roleEvaluations.push({ roleType: role.roleType, included: false, reason: 'Not yet valid' });
          continue;
        }
        if (validUntil && now > validUntil) {
          roleEvaluations.push({ roleType: role.roleType, included: false, reason: 'Validity expired' });
          continue;
        }
        
        // Check realm scope
        if (scopeType === 'Global') {
          roles.push(role);
          roleEvaluations.push({ roleType: role.roleType, included: true, reason: 'Global scope' });
        } else if (scopeType === 'Realm' && scopeTargetId === realm) {
          roles.push(role);
          roleEvaluations.push({ roleType: role.roleType, included: true, reason: 'Realm scope matches' });
        } else {
          roleEvaluations.push({ roleType: role.roleType, included: false, reason: `Scope mismatch: ${scopeType}:${scopeTargetId} vs realm:${realm}` });
        }
      }
      
      // LOG: Role resolution via canonical AuditLogger
      await auditLogger.roleResolution({
        actor,
        entityId,
        realm,
        rolesFound: rolesMap.size,
        rolesGranted: roles.length,
        evaluations: roleEvaluations,
      });
      
      return roles;
    },
    
    async getRolesByHolder(holderId: EntityId): Promise<readonly Role[]> {
      const rolesMap = await findRolesByHolder(holderId);
      return Array.from(rolesMap.values()).filter(r => r.isActive);
    },
    
    async getRole(roleId: EntityId): Promise<Role | null> {
      const { roleRehydrator } = await import('../../core/aggregates/rehydrators');
      const { reconstructAggregate } = await import('../../core/store/event-store');
      
      try {
        const roleState = await reconstructAggregate(
          eventStore,
          'Role' as any,
          roleId,
          roleRehydrator
        );
        
        return (roleState && roleState.exists) ? roleState as any : null;
      } catch (err) {
        console.warn(`Failed to rehydrate role ${roleId}:`, err);
        return null;
      }
    },
  };
}
