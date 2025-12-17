/**
 * AGREEMENT TYPE SYSTEM
 * 
 * Agreements themselves follow rules. This module defines how
 * agreement types are structured, what they require, and how
 * they behave.
 * 
 * Think of this as the "grammar" of business relationships.
 * Each agreement type is like a sentence structure that must be
 * followed for the agreement to be valid.
 */

import type { EntityId, Timestamp } from '../schema/ledger';
import type { 
  RoleScope, 
  Permission, 
  Validity, 
  Quantity,
  Condition,
  AgreementParticipant,
} from './primitives';

// ============================================================================
// AGREEMENT TYPE DEFINITION
// ============================================================================

/**
 * An Agreement Type defines the structure and rules for a category of agreements.
 * It's like a template or contract of contracts.
 */
export interface AgreementTypeDefinition {
  readonly id: string; // e.g., 'employment', 'sale', 'license', 'testimony'
  readonly name: string;
  readonly description: string;
  readonly version: number;
  
  /** What realm(s) can use this type */
  readonly allowedRealms?: readonly EntityId[] | 'all';
  
  /** Required parties and their constraints */
  readonly requiredParticipants: readonly ParticipantRequirement[];
  
  /** Optional parties */
  readonly optionalParticipants?: readonly ParticipantRequirement[];
  
  /** What roles are created when this agreement becomes active */
  readonly grantsRoles?: readonly RoleGrant[];
  
  /** Required terms/clauses */
  readonly requiredTerms?: readonly TermRequirement[];
  
  /** Asset requirements */
  readonly assetRequirements?: AssetRequirements;
  
  /** Workflow that governs this agreement type */
  readonly workflowId?: EntityId;
  
  /** Parent type (for inheritance) */
  readonly extends?: string;
  
  /** Validation rules */
  readonly validations?: readonly ValidationRule[];
  
  /** Lifecycle hooks */
  readonly hooks?: AgreementHooks;
}

export interface ParticipantRequirement {
  readonly role: string; // e.g., 'Seller', 'Buyer', 'Employee', 'Employer'
  readonly description: string;
  
  /** Minimum count of this role */
  readonly minCount: number;
  
  /** Maximum count (undefined = unlimited) */
  readonly maxCount?: number;
  
  /** What types of entities can fill this role */
  readonly allowedEntityTypes?: readonly string[];
  
  /** Must this party give explicit consent? */
  readonly requiresConsent: boolean;
  
  /** Acceptable consent methods */
  readonly consentMethods?: readonly string[];
  
  /** Is this a witness/supervisor role? */
  readonly isWitness?: boolean;
  readonly isSupervisor?: boolean;
  
  /** Can this role be the same entity as another role? */
  readonly canCombineWith?: readonly string[];
  
  /** Must this role be different from another role? */
  readonly mustDifferFrom?: readonly string[];
}

export interface RoleGrant {
  /** Which participant role receives this system role */
  readonly participantRole: string;
  
  /** The role type to grant */
  readonly roleType: string;
  
  /** Scope of the granted role */
  readonly scope: RoleScope | 'agreement' | 'realm';
  
  /** When is this role valid relative to the agreement */
  readonly validity: 'agreement' | 'custom';
  readonly customValidity?: Partial<Validity>;
  
  /** Permissions included */
  readonly permissions?: readonly Permission[];
  
  /** Can be delegated? */
  readonly delegatable?: boolean;
}

export interface TermRequirement {
  readonly clauseType: string;
  readonly required: boolean;
  readonly description: string;
  readonly validations?: readonly ValidationRule[];
}

export interface AssetRequirements {
  /** Required asset roles */
  readonly required?: readonly {
    readonly role: string; // 'Subject', 'Payment', 'Collateral'
    readonly assetTypes?: readonly string[];
    readonly minCount?: number;
    readonly maxCount?: number;
  }[];
  
  /** Are cross-realm assets allowed? */
  readonly crossRealmAllowed?: boolean;
}

export interface ValidationRule {
  readonly id: string;
  readonly description: string;
  readonly condition: Condition;
  readonly errorMessage: string;
  readonly severity: 'error' | 'warning';
}

export interface AgreementHooks {
  /** Called when agreement is proposed */
  readonly onProposed?: readonly HookAction[];
  
  /** Called when agreement becomes active */
  readonly onActivated?: readonly HookAction[];
  
  /** Called when an obligation is fulfilled */
  readonly onObligationFulfilled?: readonly HookAction[];
  
  /** Called when agreement is terminated */
  readonly onTerminated?: readonly HookAction[];
  
  /** Called when agreement expires */
  readonly onExpired?: readonly HookAction[];
}

export interface HookAction {
  readonly type: string;
  readonly config: Record<string, unknown>;
}

// ============================================================================
// BUILT-IN AGREEMENT TYPES
// ============================================================================

/**
 * The Genesis Agreement Type - the "constitution" that establishes the system
 */
export const GENESIS_AGREEMENT_TYPE: AgreementTypeDefinition = {
  id: 'genesis',
  name: 'Genesis Agreement',
  description: 'The foundational agreement that establishes the ledger itself',
  version: 1,
  allowedRealms: ['00000000-0000-0000-0000-000000000000' as EntityId], // Only primordial realm
  
  requiredParticipants: [
    {
      role: 'System',
      description: 'The system being established',
      minCount: 1,
      maxCount: 1,
      allowedEntityTypes: ['System'],
      requiresConsent: false, // System consents by existing
    },
  ],
  
  grantsRoles: [
    {
      participantRole: 'System',
      roleType: 'SystemAdmin',
      scope: { type: 'Global' },
      validity: 'agreement',
      permissions: [
        { action: 'admin', resource: '*' },
      ],
      delegatable: true,
    },
  ],
};

/**
 * Tenant License - establishes a new realm/tenant
 */
export const TENANT_LICENSE_TYPE: AgreementTypeDefinition = {
  id: 'tenant-license',
  name: 'Tenant License Agreement',
  description: 'Agreement that establishes a new tenant/realm in the system',
  version: 1,
  allowedRealms: ['00000000-0000-0000-0000-000000000000' as EntityId],
  
  requiredParticipants: [
    {
      role: 'Licensor',
      description: 'The system granting the license',
      minCount: 1,
      maxCount: 1,
      allowedEntityTypes: ['System'],
      requiresConsent: false,
    },
    {
      role: 'Licensee',
      description: 'The entity receiving tenant rights',
      minCount: 1,
      maxCount: 1,
      allowedEntityTypes: ['Organization', 'Person'],
      requiresConsent: true,
      consentMethods: ['Digital', 'Signature'],
    },
  ],
  
  optionalParticipants: [
    {
      role: 'Guarantor',
      description: 'Entity guaranteeing the licensee obligations',
      minCount: 0,
      maxCount: 1,
      requiresConsent: true,
    },
  ],
  
  grantsRoles: [
    {
      participantRole: 'Licensee',
      roleType: 'TenantAdmin',
      scope: 'realm', // Will be scoped to the new realm
      validity: 'agreement',
      permissions: [
        { action: 'admin', resource: 'realm:*' },
        { action: 'create', resource: 'entity' },
        { action: 'create', resource: 'agreement' },
      ],
      delegatable: true,
    },
  ],
  
  hooks: {
    onActivated: [
      { type: 'CreateRealm', config: { nameFrom: 'terms.realmName' } },
    ],
  },
};

/**
 * Membership Agreement - adds an entity to a realm
 */
export const MEMBERSHIP_TYPE: AgreementTypeDefinition = {
  id: 'membership',
  name: 'Membership Agreement',
  description: 'Agreement that grants an entity membership in a realm/organization',
  version: 1,
  allowedRealms: 'all',
  
  requiredParticipants: [
    {
      role: 'Organization',
      description: 'The organization/realm granting membership',
      minCount: 1,
      maxCount: 1,
      allowedEntityTypes: ['Organization', 'System'],
      requiresConsent: false, // Represented by authorized agent
    },
    {
      role: 'Member',
      description: 'The entity being granted membership',
      minCount: 1,
      maxCount: 1,
      requiresConsent: true,
    },
  ],
  
  optionalParticipants: [
    {
      role: 'Sponsor',
      description: 'Entity sponsoring the membership',
      minCount: 0,
      maxCount: 1,
      requiresConsent: false,
    },
  ],
  
  grantsRoles: [
    {
      participantRole: 'Member',
      roleType: 'Member',
      scope: 'realm',
      validity: 'agreement',
      permissions: [
        { action: 'read', resource: 'realm:public' },
      ],
    },
  ],
};

/**
 * Employment Agreement
 */
export const EMPLOYMENT_TYPE: AgreementTypeDefinition = {
  id: 'employment',
  name: 'Employment Agreement',
  description: 'Agreement establishing an employment relationship',
  version: 1,
  allowedRealms: 'all',
  
  requiredParticipants: [
    {
      role: 'Employer',
      description: 'The employing organization',
      minCount: 1,
      maxCount: 1,
      allowedEntityTypes: ['Organization'],
      requiresConsent: true,
    },
    {
      role: 'Employee',
      description: 'The person being employed',
      minCount: 1,
      maxCount: 1,
      allowedEntityTypes: ['Person'],
      requiresConsent: true,
      consentMethods: ['Signature', 'Digital'],
    },
  ],
  
  optionalParticipants: [
    {
      role: 'Witness',
      description: 'Witness to the agreement',
      minCount: 0,
      maxCount: 2,
      requiresConsent: false,
      isWitness: true,
    },
    {
      role: 'Supervisor',
      description: 'Immediate supervisor of the employee',
      minCount: 0,
      maxCount: 1,
      requiresConsent: false,
      isSupervisor: true,
    },
  ],
  
  grantsRoles: [
    {
      participantRole: 'Employee',
      roleType: 'Employee',
      scope: 'realm',
      validity: 'agreement',
      permissions: [
        { action: 'read', resource: 'realm:internal' },
        { action: 'execute', resource: 'job:assigned' },
      ],
    },
  ],
  
  requiredTerms: [
    {
      clauseType: 'compensation',
      required: true,
      description: 'Compensation terms',
    },
    {
      clauseType: 'duties',
      required: true,
      description: 'Job duties and responsibilities',
    },
  ],
};

/**
 * Sale Agreement
 */
export const SALE_TYPE: AgreementTypeDefinition = {
  id: 'sale',
  name: 'Sale Agreement',
  description: 'Agreement for the sale of assets',
  version: 1,
  allowedRealms: 'all',
  
  requiredParticipants: [
    {
      role: 'Seller',
      description: 'The party selling the asset(s)',
      minCount: 1,
      maxCount: 1,
      requiresConsent: true,
    },
    {
      role: 'Buyer',
      description: 'The party purchasing the asset(s)',
      minCount: 1,
      maxCount: 1,
      requiresConsent: true,
    },
  ],
  
  optionalParticipants: [
    {
      role: 'Witness',
      description: 'Witness to the sale',
      minCount: 0,
      maxCount: 2,
      isWitness: true,
      requiresConsent: false,
    },
    {
      role: 'Guarantor',
      description: 'Party guaranteeing payment',
      minCount: 0,
      maxCount: 1,
      requiresConsent: true,
    },
  ],
  
  grantsRoles: [
    {
      participantRole: 'Buyer',
      roleType: 'Customer',
      scope: { type: 'Entity', targetId: undefined }, // Scoped to seller
      validity: 'custom',
      customValidity: {
        effectiveFrom: 0, // Will be set at activation
      },
    },
  ],
  
  assetRequirements: {
    required: [
      {
        role: 'Subject',
        minCount: 1,
      },
    ],
  },
  
  hooks: {
    onActivated: [
      { type: 'TransferAssets', config: { from: 'Seller', to: 'Buyer', role: 'Subject' } },
    ],
  },
};

/**
 * Testimony/Declaration Agreement - unilateral with witness
 */
export const TESTIMONY_TYPE: AgreementTypeDefinition = {
  id: 'testimony',
  name: 'Testimony/Declaration',
  description: 'Unilateral declaration with witness attestation',
  version: 1,
  allowedRealms: 'all',
  
  requiredParticipants: [
    {
      role: 'Declarant',
      description: 'The party making the declaration',
      minCount: 1,
      maxCount: 1,
      requiresConsent: true,
    },
    {
      role: 'Witness',
      description: 'Witness attesting to the declaration',
      minCount: 1,
      maxCount: 3,
      isWitness: true,
      requiresConsent: true,
      mustDifferFrom: ['Declarant'],
    },
  ],
  
  optionalParticipants: [
    {
      role: 'Supervisor',
      description: 'Authority figure overseeing the declaration',
      minCount: 0,
      maxCount: 1,
      isSupervisor: true,
      requiresConsent: false,
    },
  ],
};

/**
 * Authorization Agreement - grants permissions/access
 */
export const AUTHORIZATION_TYPE: AgreementTypeDefinition = {
  id: 'authorization',
  name: 'Authorization Agreement',
  description: 'Agreement granting specific permissions or access rights',
  version: 1,
  allowedRealms: 'all',
  
  requiredParticipants: [
    {
      role: 'Grantor',
      description: 'The party granting authorization',
      minCount: 1,
      maxCount: 1,
      requiresConsent: true,
    },
    {
      role: 'Grantee',
      description: 'The party receiving authorization',
      minCount: 1,
      maxCount: 1,
      requiresConsent: true,
    },
  ],
  
  requiredTerms: [
    {
      clauseType: 'permissions',
      required: true,
      description: 'Specific permissions being granted',
    },
    {
      clauseType: 'scope',
      required: true,
      description: 'Scope of the authorization',
    },
  ],
  
  grantsRoles: [
    {
      participantRole: 'Grantee',
      roleType: 'Authorized',
      scope: 'agreement', // Scoped to what the agreement specifies
      validity: 'agreement',
      delegatable: false,
    },
  ],
};

/**
 * Custody Agreement - transfers custody (not ownership)
 */
export const CUSTODY_TYPE: AgreementTypeDefinition = {
  id: 'custody',
  name: 'Custody Agreement',
  description: 'Agreement transferring custody of assets without ownership transfer',
  version: 1,
  allowedRealms: 'all',
  
  requiredParticipants: [
    {
      role: 'Owner',
      description: 'The owner of the asset(s)',
      minCount: 1,
      maxCount: 1,
      requiresConsent: true,
    },
    {
      role: 'Custodian',
      description: 'The party receiving custody',
      minCount: 1,
      maxCount: 1,
      requiresConsent: true,
    },
  ],
  
  assetRequirements: {
    required: [
      {
        role: 'Subject',
        minCount: 1,
      },
    ],
  },
  
  grantsRoles: [
    {
      participantRole: 'Custodian',
      roleType: 'Custodian',
      scope: { type: 'Asset', targetId: undefined }, // Scoped to the assets
      validity: 'agreement',
    },
  ],
  
  hooks: {
    onActivated: [
      { type: 'TransferCustody', config: { from: 'Owner', to: 'Custodian', role: 'Subject' } },
    ],
    onTerminated: [
      { type: 'TransferCustody', config: { from: 'Custodian', to: 'Owner', role: 'Subject' } },
    ],
  },
};

// ============================================================================
// AGREEMENT TYPE REGISTRY
// ============================================================================

/**
 * Workspace Membership Agreement - grants access to a workspace
 */
export const WORKSPACE_MEMBERSHIP_TYPE: AgreementTypeDefinition = {
  id: 'workspace-membership',
  name: 'Workspace Membership',
  description: 'Grants access to a workspace',
  version: 1,
  allowedRealms: 'all',
  
  requiredParticipants: [
    {
      role: 'WorkspaceOwner',
      description: 'The owner of the workspace',
      minCount: 1,
      maxCount: 1,
      allowedEntityTypes: ['Person', 'Organization'],
      requiresConsent: false, // Owner auto-consents when creating workspace (explicit in agreement type)
      consentMethods: ['Implicit'], // Explicitly allow implicit consent for owner
    },
    {
      role: 'Member',
      description: 'The entity being granted workspace access',
      minCount: 1,
      maxCount: null,
      allowedEntityTypes: ['Person', 'Organization'],
      requiresConsent: true,
    }
  ],
  
  grantsRoles: [
    {
      participantRole: 'WorkspaceOwner',
      roleType: 'WorkspaceOwner',
      scope: { type: 'Asset', targetId: undefined }, // Will be set to workspace asset ID
      validity: 'agreement',
      permissions: [
        { action: '*', resource: 'Workspace:*' },
        { action: 'manage', resource: 'Workspace:Members' },
        { action: 'delete', resource: 'Workspace:*' },
        { action: 'configure', resource: 'Workspace:*' },
      ],
      delegatable: true,
    },
    {
      participantRole: 'Member',
      roleType: 'WorkspaceMember',
      scope: { type: 'Asset', targetId: undefined }, // Will be set to workspace asset ID
      validity: 'agreement',
      permissions: [
        { action: 'read', resource: 'Workspace:*' },
        { action: 'edit', resource: 'Workspace:Content' },
        { action: 'create', resource: 'Workspace:Resource' },
        { action: 'execute', resource: 'Workspace:Function' },
      ],
      delegatable: false,
    }
  ],
  
  requiredTerms: [
    {
      clauseType: 'workspaceAssetId',
      required: true,
      description: 'ID of the workspace asset',
    }
  ]
};

/**
 * Workspace Execution Agreement - grants permission to execute code in a workspace
 */
export const WORKSPACE_EXECUTION_TYPE: AgreementTypeDefinition = {
  id: 'workspace-execution',
  name: 'Workspace Execution Agreement',
  description: 'Grants permission to execute code in a workspace',
  version: 1,
  allowedRealms: 'all',
  
  requiredParticipants: [
    {
      role: 'WorkspaceOwner',
      description: 'The owner of the workspace',
      minCount: 1,
      allowedEntityTypes: ['Person', 'Organization'],
      requiresConsent: false,
    },
    {
      role: 'Executor',
      description: 'The entity being granted execution permission',
      minCount: 1,
      allowedEntityTypes: ['Person', 'Organization', 'System'],
      requiresConsent: true,
    }
  ],
  
  grantsRoles: [
    {
      participantRole: 'Executor',
      roleType: 'WorkspaceExecutor',
      scope: { type: 'Asset', targetId: undefined }, // Will be set to workspace asset ID
      validity: 'agreement',
      permissions: [
        { action: 'execute', resource: 'Workspace:Function:*' },
        { action: 'execute', resource: 'Workspace:Script:*' },
      ],
      delegatable: false,
    }
  ],
  
  requiredTerms: [
    {
      clauseType: 'workspaceAssetId',
      required: true,
      description: 'ID of the workspace asset',
    },
    {
      clauseType: 'resourceQuota',
      required: true,
      description: 'Resource quota for execution',
    }
  ]
};

/**
 * Session Agreement - materializes AI/agent sessions as agreements
 * 
 * SPRINT D.3: Sessions as first-class agreements for compliance/audit
 * 
 * Purpose:
 * - Track all interactions in a session
 * - Enable "Right to Forget" via agreement termination
 * - Provide audit trail for AI interactions
 * - Comply with data retention policies
 */
export const SESSION_TYPE: AgreementTypeDefinition = {
  id: 'session',
  name: 'Session Agreement',
  description: 'Agreement that materializes an AI/agent session for compliance and audit',
  version: 1,
  allowedRealms: 'all',
  
  requiredParticipants: [
    {
      role: 'User',
      description: 'The user initiating the session',
      minCount: 1,
      maxCount: 1,
      allowedEntityTypes: ['Person', 'Organization', 'System'],
      requiresConsent: true,
      consentMethods: ['Implicit', 'Digital'], // Implicit consent by starting session
    },
    {
      role: 'Agent',
      description: 'The AI agent participating in the session',
      minCount: 1,
      maxCount: 1,
      allowedEntityTypes: ['Agent', 'System'],
      requiresConsent: false, // Agent consents by responding
    },
  ],
  
  optionalParticipants: [
    {
      role: 'Guardian',
      description: 'Guardian overseeing the agent',
      minCount: 0,
      maxCount: 1,
      requiresConsent: false,
      isSupervisor: true,
    },
    {
      role: 'Witness',
      description: 'System witness for audit purposes',
      minCount: 0,
      maxCount: 1,
      isWitness: true,
      requiresConsent: false,
    },
  ],
  
  grantsRoles: [
    {
      participantRole: 'User',
      roleType: 'SessionParticipant',
      scope: 'agreement',
      validity: 'agreement',
      permissions: [
        { action: 'read', resource: 'Session:*' },
        { action: 'write', resource: 'Session:Messages' },
        { action: 'terminate', resource: 'Session:*' },
      ],
    },
    {
      participantRole: 'Agent',
      roleType: 'SessionAgent',
      scope: 'agreement',
      validity: 'agreement',
      permissions: [
        { action: 'read', resource: 'Session:*' },
        { action: 'write', resource: 'Session:Messages' },
        { action: 'execute', resource: 'Session:Tools' },
      ],
    },
  ],
  
  requiredTerms: [
    {
      clauseType: 'sessionId',
      required: true,
      description: 'Unique identifier for the session',
    },
    {
      clauseType: 'retentionPolicy',
      required: true,
      description: 'Data retention policy for session data',
    },
  ],
  
  hooks: {
    onActivated: [
      { type: 'CreateSessionContainer', config: { physics: 'Versioned' } },
      { type: 'RecordSessionStart', config: {} },
    ],
    onTerminated: [
      { type: 'RecordSessionEnd', config: {} },
      { type: 'ApplyRetentionPolicy', config: {} },
    ],
  },
};

/**
 * Platform Access Agreement - the "onboarding bundle"
 * 
 * This is the foundational agreement created when a user registers.
 * It grants basic platform access including:
 * - Chat/AI interaction
 * - Session creation
 * - Basic realm membership
 * 
 * Think of this as the "Terms of Service" agreement that every user
 * implicitly accepts when they sign up.
 */
export const PLATFORM_ACCESS_TYPE: AgreementTypeDefinition = {
  id: 'platform-access',
  name: 'Platform Access Agreement',
  description: 'Foundational agreement granting basic platform access including chat and AI interactions',
  version: 1,
  allowedRealms: 'all',
  
  requiredParticipants: [
    {
      role: 'Platform',
      description: 'The platform/system granting access',
      minCount: 1,
      maxCount: 1,
      allowedEntityTypes: ['System'],
      requiresConsent: false, // Platform auto-consents
    },
    {
      role: 'User',
      description: 'The user being granted platform access',
      minCount: 1,
      maxCount: 1,
      allowedEntityTypes: ['Person', 'Organization'],
      requiresConsent: true,
      consentMethods: ['Implicit', 'Digital'], // Implicit by signing up
    },
  ],
  
  grantsRoles: [
    {
      participantRole: 'User',
      roleType: 'PlatformUser',
      scope: { type: 'Global' },
      validity: 'agreement',
      permissions: [
        { action: 'use', resource: 'Chat:*' },
        { action: 'create', resource: 'Session:*' },
        { action: 'read', resource: 'Affordances:*' },
        { action: 'read', resource: 'Entity:self' },
        { action: 'update', resource: 'Entity:self' },
      ],
      delegatable: false,
    },
  ],
  
  hooks: {
    onActivated: [
      { type: 'GrantPlatformAccess', config: {} },
      { type: 'CreateApiKey', config: { 
        nameFrom: 'parties.User.name',
        scopes: ['read', 'write'],
        forParticipant: 'User',
      }},
    ],
  },
};

export const BUILT_IN_AGREEMENT_TYPES: readonly AgreementTypeDefinition[] = [
  GENESIS_AGREEMENT_TYPE,
  TENANT_LICENSE_TYPE,
  MEMBERSHIP_TYPE,
  EMPLOYMENT_TYPE,
  SALE_TYPE,
  TESTIMONY_TYPE,
  AUTHORIZATION_TYPE,
  CUSTODY_TYPE,
  WORKSPACE_MEMBERSHIP_TYPE,
  WORKSPACE_EXECUTION_TYPE,
  SESSION_TYPE,
  PLATFORM_ACCESS_TYPE,
];

/**
 * Agreement Type Registry - manages available agreement types
 */
export interface AgreementTypeRegistry {
  /** Register a new agreement type */
  register(type: AgreementTypeDefinition): void;
  
  /** Get an agreement type by ID */
  get(typeId: string): AgreementTypeDefinition | undefined;
  
  /** Get all registered types */
  getAll(): readonly AgreementTypeDefinition[];
  
  /** Get types available for a realm */
  getForRealm(realmId: EntityId): readonly AgreementTypeDefinition[];
  
  /** Validate an agreement against its type */
  validate(agreement: any, typeId: string): ValidationResult;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function createAgreementTypeRegistry(): AgreementTypeRegistry {
  const types = new Map<string, AgreementTypeDefinition>();
  
  // Register built-in types
  for (const type of BUILT_IN_AGREEMENT_TYPES) {
    types.set(type.id, type);
  }
  
  return {
    register(type: AgreementTypeDefinition): void {
      if (types.has(type.id)) {
        throw new Error(`Agreement type already registered: ${type.id}`);
      }
      types.set(type.id, type);
    },
    
    get(typeId: string): AgreementTypeDefinition | undefined {
      return types.get(typeId);
    },
    
    getAll(): readonly AgreementTypeDefinition[] {
      return Array.from(types.values());
    },
    
    getForRealm(realmId: EntityId): readonly AgreementTypeDefinition[] {
      return Array.from(types.values()).filter(type => {
        if (type.allowedRealms === 'all') return true;
        return type.allowedRealms?.includes(realmId);
      });
    },
    
    validate(agreement: any, typeId: string): ValidationResult {
      const type = types.get(typeId);
      if (!type) {
        return { valid: false, errors: [`Unknown agreement type: ${typeId}`], warnings: [] };
      }
      
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // Validate required participants
      for (const req of type.requiredParticipants) {
        const matching = (agreement.parties || []).filter(
          (p: AgreementParticipant) => p.role === req.role
        );
        
        if (matching.length < req.minCount) {
          errors.push(`Required at least ${req.minCount} ${req.role}(s), found ${matching.length}`);
        }
        
        if (req.maxCount && matching.length > req.maxCount) {
          errors.push(`Maximum ${req.maxCount} ${req.role}(s) allowed, found ${matching.length}`);
        }
        
        // Check consent requirements
        if (req.requiresConsent) {
          for (const participant of matching) {
            if (!participant.consent?.givenAt) {
              errors.push(`${req.role} must give consent`);
            }
          }
        }
      }
      
      // Validate asset requirements
      if (type.assetRequirements?.required) {
        for (const req of type.assetRequirements.required) {
          const matching = (agreement.assets || []).filter(
            (a: any) => a.role === req.role
          );
          
          if (req.minCount && matching.length < req.minCount) {
            errors.push(`Required at least ${req.minCount} asset(s) with role '${req.role}'`);
          }
        }
      }
      
      return { valid: errors.length === 0, errors, warnings };
    },
  };
}

