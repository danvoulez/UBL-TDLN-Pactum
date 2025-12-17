/**
 * FASE 10 - CÓDIGO PEDAGÓGICO
 * 
 * Este módulo funciona como exemplo vivo para humanos + IAs.
 * Não remover "redundâncias" aqui sem substituir por algo igualmente didático.
 * 
 * UNIVERSAL PRIMITIVES
 * 
 * The fundamental building blocks of any business system.
 * These are the "physics" upon which all business logic is built.
 * 
 * Core Axioms:
 * 1. Everything that can act or be acted upon is an Entity
 * 2. Everything that can be owned, transferred, or transformed is an Asset
 * 3. Every relationship between entities is established by an Agreement
 * 4. Roles are not attributes—they are relationships established by Agreements
 * 5. Time flows forward; events are immutable facts
 * 
 * ⚠️ CANONICAL SOURCE: This is the ONLY place where Realm and Agreement types
 * are defined. All other modules import from here.
 */

import type { EntityId, Timestamp, Hash } from '../schema/ledger';

// ============================================================================
// REALM - The Container of Reality
// ============================================================================

/**
 * A Realm is a self-contained universe within the ledger.
 * It can represent:
 * - A tenant in a multi-tenant system
 * - A department within an organization
 * - A project, a country, a jurisdiction
 * - Any bounded context that needs isolation
 * 
 * The Primordial Realm (realm_id = 0) contains the meta-structure:
 * - The System entity
 * - Tenant entities
 * - License/ToS agreements between System and Tenants
 * 
 * ⚠️ CANONICAL SOURCE: This is the ONLY place where Realm and RealmConfig are defined.
 * All other modules should import from here, not redefine them.
 * 
 * @see docs/REALM-CONTRACT.md for the complete contract and invariants.
 */
export interface Realm {
  readonly id: EntityId;
  readonly name: string;
  readonly parentRealmId?: EntityId; // For hierarchical realms
  readonly createdAt: Timestamp;
  
  /** The agreement that established this realm */
  readonly establishedBy: EntityId;
  
  /** Configuration for this realm */
  readonly config: RealmConfig;
}

export interface RealmConfig {
  /** Allowed entity types in this realm */
  readonly allowedEntityTypes?: readonly string[];
  
  /** Allowed agreement types in this realm */
  readonly allowedAgreementTypes?: readonly string[];
  
  /** Custom workflows for this realm */
  readonly customWorkflows?: readonly EntityId[];
  
  /** Isolation level */
  readonly isolation: 'Full' | 'Shared' | 'Hierarchical';
  
  /** Can entities from this realm interact with other realms? */
  readonly crossRealmAllowed: boolean;
}

// ============================================================================
// ENTITY - The Universal Actor
// ============================================================================

/**
 * An Entity is anything that can:
 * - Enter into Agreements
 * - Hold Roles
 * - Own or custody Assets
 * - Perform actions (be an Actor)
 * 
 * This generalizes Party to include:
 * - Natural persons
 * - Legal persons (organizations)
 * - Systems and services
 * - The Ledger itself
 * - Abstract entities (departments, roles-as-entities)
 */
export interface Entity {
  readonly id: EntityId;
  readonly realmId: EntityId;
  readonly entityType: string; // Extensible: 'Person', 'Organization', 'System', 'Service', 'Department'
  readonly createdAt: Timestamp;
  readonly version: number;
  
  /** How this entity is identified */
  readonly identity: EntityIdentity;
  
  /** The agreement that brought this entity into existence in the system */
  readonly establishedBy?: EntityId; // Only the Primordial Entity has no establisher
  
  /** Metadata - extensible per domain */
  readonly meta: Record<string, unknown>;
}

export interface EntityIdentity {
  /** Display name */
  readonly name: string;
  
  /** Unique identifiers (extensible) */
  readonly identifiers: readonly Identifier[];
  
  /** Contact methods (optional) */
  readonly contacts?: readonly Contact[];
  
  /** Attributes specific to entity type */
  readonly attributes?: Record<string, unknown>;
}

export interface Identifier {
  readonly scheme: string; // 'email', 'cpf', 'cnpj', 'uuid', 'did', 'custom:...'
  readonly value: string;
  readonly issuedBy?: EntityId;
  readonly validFrom?: Timestamp;
  readonly validUntil?: Timestamp;
  readonly verified?: boolean;
}

export interface Contact {
  readonly type: string;
  readonly value: string;
  readonly verified?: boolean;
  readonly preferences?: Record<string, unknown>;
}

// ============================================================================
// ASSET - The Universal Object
// ============================================================================

/**
 * An Asset is anything that can be:
 * - Owned (has an owner entity)
 * - Transferred (ownership can change via agreement)
 * - Transformed (can change state, be consumed, combined)
 * - Valued (has worth, can be consideration in agreements)
 * 
 * Assets are always associated with a Realm.
 * Cross-realm transfers require special agreements.
 */
export interface Asset {
  readonly id: EntityId;
  readonly realmId: EntityId;
  readonly assetType: string; // Extensible: 'Product', 'Service', 'Document', 'Token', 'Currency'
  readonly createdAt: Timestamp;
  readonly version: number;
  
  /** Current status in lifecycle */
  readonly status: string; // Extensible, governed by workflow
  
  /** Current owner (Entity reference) */
  readonly ownerId?: EntityId;
  
  /** Current custodian (may differ from owner) */
  readonly custodianId?: EntityId;
  
  /** For fungible assets */
  readonly quantity?: Quantity;
  
  /** Asset properties - extensible per type */
  readonly properties: Record<string, unknown>;
  
  /** The agreement that created/registered this asset */
  readonly establishedBy?: EntityId;
}

export interface Quantity {
  readonly amount: number | bigint;
  readonly unit: string;
  readonly precision?: number;
}

// ============================================================================
// AGREEMENT - The Universal Relationship
// ============================================================================

/**
 * An Agreement is the ONLY way relationships exist.
 * 
 * This is the fundamental insight: there are no "static" relationships.
 * Every connection between entities is an agreement—explicit or implicit,
 * formal or informal, but always an agreement.
 * 
 * Types of agreements:
 * - Bilateral: Two parties with mutual obligations
 * - Unilateral: One party makes a declaration/commitment
 * - Multilateral: Multiple parties in concert
 * - Standing: Ongoing relationship (employment, membership)
 * - Transactional: One-time exchange (sale, service)
 * - Meta: Agreements about how to make agreements (constitutions, protocols)
 * 
 * ⚠️ CANONICAL SOURCE: This is the ONLY place where Agreement is defined.
 * All other modules should import from here, not redefine them.
 * 
 * NOTE: There is a legacy Agreement type in core/schema/ledger.ts for backward compatibility,
 * but new code should use this one from primitives.ts.
 */
export interface Agreement {
  readonly id: EntityId;
  readonly realmId: EntityId;
  readonly agreementType: string; // Extensible: 'Employment', 'Sale', 'License', 'Testimony', 'Membership'
  readonly createdAt: Timestamp;
  readonly version: number;
  
  /** Current status */
  readonly status: string; // Governed by workflow
  
  /** The parties and their roles in this agreement */
  readonly parties: readonly AgreementParticipant[];
  
  /** The terms of the agreement */
  readonly terms: Terms;
  
  /** Assets involved */
  readonly assets?: readonly AssetReference[];
  
  /** When this agreement is effective */
  readonly validity: Validity;
  
  /** Parent agreement (for amendments, sub-agreements) */
  readonly parentId?: EntityId;
  
  /** The agreement that authorizes this type of agreement (meta) */
  readonly authorizedBy?: EntityId;
}

export interface AgreementParticipant {
  readonly entityId: EntityId;
  
  /** Role in this specific agreement */
  readonly role: string; // 'Seller', 'Buyer', 'Witness', 'Guarantor', 'Principal', 'Agent'
  
  /** What this party must do */
  readonly obligations: readonly Obligation[];
  
  /** What this party receives */
  readonly rights: readonly Right[];
  
  /** Consent status */
  readonly consent?: Consent;
  
  /** Special flags */
  readonly flags?: {
    readonly isWitness?: boolean;
    readonly isSupervisor?: boolean;
    readonly isGuarantor?: boolean;
    readonly canDelegate?: boolean;
  };
}

export interface Obligation {
  readonly id: string;
  readonly description: string;
  readonly conditions?: readonly Condition[];
  readonly deadline?: Timestamp | Duration;
  readonly status: 'Pending' | 'InProgress' | 'Fulfilled' | 'Breached' | 'Waived';
}

export interface Right {
  readonly id: string;
  readonly description: string;
  readonly conditions?: readonly Condition[];
  readonly exercisedAt?: Timestamp;
}

export interface Condition {
  readonly type: string;
  readonly parameters: Record<string, unknown>;
}

export interface Duration {
  readonly amount: number;
  readonly unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';
}

export interface Consent {
  readonly givenAt?: Timestamp;
  readonly method: string; // 'Signature', 'Digital', 'Verbal', 'Implied', 'Click'
  readonly evidence?: string;
  readonly revokedAt?: Timestamp;
  readonly revocationReason?: string;
}

export interface Terms {
  /** Human-readable description */
  readonly description: string;
  
  /** Structured clauses */
  readonly clauses: readonly Clause[];
  
  /** What is exchanged (consideration) */
  readonly consideration?: Consideration;
  
  /** Governing rules */
  readonly governance?: Governance;
}

export interface Clause {
  readonly id: string;
  readonly type: string;
  readonly title?: string;
  readonly content: string;
  readonly conditions?: readonly Condition[];
  readonly references?: readonly EntityId[];
}

export interface Consideration {
  readonly description: string;
  readonly value?: {
    readonly amount: number | bigint;
    readonly currency: string;
  };
  readonly assets?: readonly AssetReference[];
  readonly services?: readonly string[];
}

export interface Governance {
  readonly jurisdiction?: string;
  readonly disputeResolution?: string;
  readonly amendmentProcess?: string;
  readonly terminationConditions?: readonly Condition[];
}

export interface AssetReference {
  readonly assetId: EntityId;
  readonly role: string; // 'Subject', 'Collateral', 'Payment', 'Deliverable'
  readonly quantity?: Quantity;
}

export interface Validity {
  readonly effectiveFrom: Timestamp;
  readonly effectiveUntil?: Timestamp;
  readonly autoRenew?: boolean;
  readonly renewalTerms?: string;
}

// ============================================================================
// ROLE - Relationship as First-Class Citizen
// ============================================================================

/**
 * A Role is NOT an attribute of an entity.
 * A Role IS a relationship established by an Agreement.
 * 
 * This is crucial:
 * - "John is a Salesperson" → "John has the Salesperson role granted by Employment Agreement X"
 * - "Mary is a Customer" → "Mary has the Customer role granted by Purchase Agreement Y"
 * - "System is Admin" → "System has Admin role granted by Authorization Agreement Z"
 * 
 * Roles:
 * - Have temporal validity
 * - Can coexist (one entity, many roles)
 * - Can be scoped (role within a realm, organization, or agreement)
 * - Can be delegated (if the granting agreement allows)
 * - Are always traceable to their establishing agreement
 */
export interface Role {
  readonly id: EntityId;
  readonly realmId: EntityId;
  readonly roleType: string; // The type of role
  readonly createdAt: Timestamp;
  readonly version: number;
  
  /** Who holds this role */
  readonly holderId: EntityId;
  
  /** The scope/context of this role */
  readonly scope: RoleScope;
  
  /** The agreement that established this role */
  readonly establishedBy: EntityId;
  
  /** When this role is valid */
  readonly validity: Validity;
  
  /** Is currently active */
  readonly isActive: boolean;
  
  /** Permissions granted by this role */
  readonly permissions: readonly Permission[];
  
  /** Can this role be delegated? */
  readonly delegatable: boolean;
  
  /** If delegated, from which role */
  readonly delegatedFrom?: EntityId;
}

export interface RoleScope {
  readonly type: 'Global' | 'Realm' | 'Entity' | 'Agreement' | 'Asset';
  readonly targetId?: EntityId;
}

export interface Permission {
  readonly action: string; // 'read', 'write', 'execute', 'delegate', 'admin'
  readonly resource: string; // What type of resource
  readonly conditions?: readonly Condition[];
}

// ============================================================================
// THE PRIMORDIAL ENTITIES
// ============================================================================

/**
 * Every ledger has these primordial entities that exist by axiom.
 * 
 * ⚠️ CANONICAL SOURCE: This is the ONLY place where these constants are defined.
 * All other modules should import from here, not redefine them.
 * 
 * @see docs/REALM-CONTRACT.md for the contract governing these entities.
 */

/** The System itself - the first entity, establishes all others */
export const PRIMORDIAL_SYSTEM_ID = '00000000-0000-0000-0000-000000000001' as EntityId;

/** The Primordial Realm - realm 0, contains meta-structure */
export const PRIMORDIAL_REALM_ID = '00000000-0000-0000-0000-000000000000' as EntityId;

/** The Genesis Agreement - the "constitution" of the ledger */
export const GENESIS_AGREEMENT_ID = '00000000-0000-0000-0000-000000000002' as EntityId;

// ============================================================================
// UNIVERSAL EVENT TYPES
// ============================================================================

/**
 * These are the fundamental events that can occur in any domain.
 * Domain-specific events extend from these.
 */

// Entity Events
export interface EntityCreated {
  readonly type: 'EntityCreated';
  readonly entityType: string;
  readonly identity: EntityIdentity;
  readonly establishedBy?: EntityId;
  readonly meta?: Record<string, unknown>;
}

export interface EntityUpdated {
  readonly type: 'EntityUpdated';
  readonly changes: Partial<EntityIdentity>;
  readonly reason: string;
}

// Asset Events
export interface AssetRegistered {
  readonly type: 'AssetRegistered';
  readonly assetType: string;
  readonly ownerId?: EntityId;
  readonly properties: Record<string, unknown>;
  readonly quantity?: Quantity;
  readonly establishedBy?: EntityId;
}

export interface AssetTransferred {
  readonly type: 'AssetTransferred';
  readonly fromEntityId?: EntityId;
  readonly toEntityId: EntityId;
  readonly agreementId: EntityId;
  readonly transferType: 'Ownership' | 'Custody';
  readonly quantity?: Quantity;
}

export interface AssetStateChanged {
  readonly type: 'AssetStateChanged';
  readonly previousState: string;
  readonly newState: string;
  readonly reason: string;
  readonly agreementId?: EntityId;
}

// Agreement Events
export interface AgreementProposed {
  readonly type: 'AgreementProposed';
  readonly agreementType: string;
  readonly parties: readonly AgreementParticipant[];
  readonly terms: Terms;
  readonly assets?: readonly AssetReference[];
  readonly validity: Validity;
  readonly parentId?: EntityId;
  readonly authorizedBy?: EntityId;
}

export interface ConsentRecorded {
  readonly type: 'ConsentRecorded';
  readonly entityId: EntityId;
  readonly consent: Consent;
}

export interface AgreementActivated {
  readonly type: 'AgreementActivated';
  readonly activatedBy: EntityId;
}

export interface ObligationFulfilled {
  readonly type: 'ObligationFulfilled';
  readonly obligationId: string;
  readonly fulfilledBy: EntityId;
  readonly evidence?: string;
}

export interface AgreementTerminated {
  readonly type: 'AgreementTerminated';
  readonly reason: string;
  readonly terminatedBy: EntityId;
}

// Role Events
export interface RoleGranted {
  readonly type: 'RoleGranted';
  readonly roleType: string;
  readonly holderId: EntityId;
  readonly scope: RoleScope;
  readonly establishedBy: EntityId;
  readonly validity: Validity;
  readonly permissions: readonly Permission[];
  readonly delegatable: boolean;
}

export interface RoleRevoked {
  readonly type: 'RoleRevoked';
  readonly reason: string;
  readonly revokedBy: EntityId;
}

export interface RoleDelegated {
  readonly type: 'RoleDelegated';
  readonly fromRoleId: EntityId;
  readonly toEntityId: EntityId;
  readonly scope?: RoleScope;
  readonly validity?: Validity;
}

// Realm Events
export interface RealmCreated {
  readonly type: 'RealmCreated';
  readonly name: string;
  readonly parentRealmId?: EntityId;
  readonly establishedBy: EntityId;
  readonly config: RealmConfig;
}

export interface RealmConfigUpdated {
  readonly type: 'RealmConfigUpdated';
  readonly changes: Partial<RealmConfig>;
  readonly reason: string;
}

// API Key Events (following ORIGINAL philosophy: everything via events)
export interface ApiKeyCreated {
  readonly type: 'ApiKeyCreated';
  readonly realmId: EntityId;
  readonly entityId: EntityId;
  readonly name: string;
  readonly scopes: readonly string[];
  readonly keyHash: string; // Hash of the key (not the raw key)
  readonly expiresAt?: Timestamp;
  readonly revoked: boolean;
}

export interface ApiKeyRevoked {
  readonly type: 'ApiKeyRevoked';
  readonly apiKeyId: EntityId;
  readonly revokedAt: Timestamp;
  readonly reason: string;
}

