/**
 * TEMPORAL LEDGER - Core Schema
 * 
 * An append-only, immutable event store that follows the arrow of time.
 * All state is derived from the sequence of events - never mutated directly.
 */

// ============================================================================
// TEMPORAL PRIMITIVES
// ============================================================================

/** Monotonic sequence - the arrow of time */
export type SequenceNumber = bigint;

/** Point in time - wall clock for human reference */
export type Timestamp = number; // Unix epoch milliseconds

/** Cryptographic hash for integrity verification */
export type Hash = string; // SHA-256 hex

/** Universal identifier */
export type EntityId = string; // UUID v7 (time-ordered)

// ============================================================================
// THE EVENT - Fundamental Unit of Truth
// ============================================================================

/**
 * Every change in the system is recorded as an immutable Event.
 * Events are facts that have happened - they cannot be undone, only compensated.
 */
export interface Event<T = unknown> {
  /** Globally unique event identifier */
  readonly id: EntityId;
  
  /** Monotonic sequence number - enforces total ordering */
  readonly sequence: SequenceNumber;
  
  /** When this event was recorded (wall clock) */
  readonly timestamp: Timestamp;
  
  /** Event type discriminator */
  readonly type: string;
  
  /** The aggregate this event belongs to */
  readonly aggregateId: EntityId;
  readonly aggregateType: AggregateType;
  
  /** Version of this aggregate after this event */
  readonly aggregateVersion: number;
  
  /** Event payload - the actual data */
  readonly payload: T;
  
  /** Causal chain - what caused this event */
  readonly causation: {
    /** The command that triggered this event */
    readonly commandId?: EntityId;
    /** The parent event (for event chains) */
    readonly correlationId?: EntityId;
    /** The workflow instance */
    readonly workflowId?: EntityId;
  };
  
  /** Who/what recorded this event */
  readonly actor: ActorReference;
  
  /** Hash of previous event - creates immutable chain */
  readonly previousHash: Hash;
  
  /** Hash of this event (computed) */
  readonly hash: Hash;
  
  /** Digital signature for non-repudiation */
  readonly signature?: string;
}

// ============================================================================
// AGGREGATE TYPES - The Core Entities
// ============================================================================

export type AggregateType = 'Party' | 'Asset' | 'Agreement' | 'Role' | 'Workflow' | 'Flow';

// ============================================================================
// PARTY - Any Entity That Can Act or Be Acted Upon
// ============================================================================

export type PartyType = 'Person' | 'Organization' | 'System' | 'Witness';

export interface Party {
  readonly id: EntityId;
  readonly type: PartyType;
  readonly createdAt: Timestamp;
  readonly version: number;
  
  /** Parties are identified by their attributes at any point in time */
  readonly identity: PartyIdentity;
  
  /** Current roles this party holds (derived from Role aggregates) */
  readonly activeRoles: readonly EntityId[];
}

export interface PartyIdentity {
  /** Legal/formal name */
  readonly name: string;
  
  /** Identity documents/references */
  readonly identifiers: readonly {
    readonly type: string; // 'cpf', 'cnpj', 'passport', 'internal_id'
    readonly value: string;
    readonly issuedBy?: string;
    readonly validFrom?: Timestamp;
    readonly validUntil?: Timestamp;
  }[];
  
  /** Contact information */
  readonly contacts?: readonly {
    readonly type: string; // 'email', 'phone', 'address'
    readonly value: string;
    readonly isPrimary: boolean;
  }[];
}

// Party Events
export interface PartyRegistered {
  readonly type: 'PartyRegistered';
  readonly partyType: PartyType;
  readonly identity: PartyIdentity;
}

export interface PartyIdentityUpdated {
  readonly type: 'PartyIdentityUpdated';
  readonly identity: Partial<PartyIdentity>;
  readonly reason: string;
  readonly effectiveFrom: Timestamp;
}

// ============================================================================
// ASSET - Any Object That Can Be Owned, Transferred, or Transformed
// ============================================================================

export type AssetStatus = 'Created' | 'InStock' | 'Reserved' | 'Sold' | 'Transferred' | 'Consumed' | 'Destroyed';

export interface Asset {
  readonly id: EntityId;
  readonly assetType: string; // Domain-specific: 'Product', 'Document', 'Vehicle', etc.
  readonly createdAt: Timestamp;
  readonly version: number;
  
  /** Current status */
  readonly status: AssetStatus;
  
  /** Current owner (Party reference) */
  readonly ownerId?: EntityId;
  
  /** Current custodian (may differ from owner) */
  readonly custodianId?: EntityId;
  
  /** Asset properties */
  readonly properties: Record<string, unknown>;
  
  /** Quantity (for fungible assets) */
  readonly quantity?: {
    readonly amount: number;
    readonly unit: string;
  };
}

// Asset Events
export interface AssetCreated {
  readonly type: 'AssetCreated';
  readonly assetType: string;
  readonly ownerId?: EntityId;
  readonly properties: Record<string, unknown>;
  readonly quantity?: { amount: number; unit: string };
}

export interface AssetTransferred {
  readonly type: 'AssetTransferred';
  readonly fromPartyId?: EntityId;
  readonly toPartyId: EntityId;
  readonly agreementId: EntityId; // The contract governing this transfer
  readonly transferType: 'Ownership' | 'Custody';
}

export interface AssetStatusChanged {
  readonly type: 'AssetStatusChanged';
  readonly previousStatus: AssetStatus;
  readonly newStatus: AssetStatus;
  readonly reason: string;
  readonly agreementId?: EntityId;
}

// ============================================================================
// ROLE - A Relationship Between Parties in a Context
// ============================================================================

/**
 * Roles are not static attributes - they are agreements.
 * A person is a "Salesperson" because of a contract with the company.
 * A person is a "Client" because of a relationship established by a purchase.
 * Roles can coexist, change, and have temporal boundaries.
 */
export interface Role {
  readonly id: EntityId;
  readonly roleType: string; // 'Salesperson', 'Client', 'Witness', 'Guardian', 'Supervisor'
  readonly createdAt: Timestamp;
  readonly version: number;
  
  /** The party holding this role */
  readonly holderId: EntityId;
  
  /** The context in which this role exists */
  readonly context: RoleContext;
  
  /** When this role is active */
  readonly validity: {
    readonly from: Timestamp;
    readonly until?: Timestamp; // undefined = indefinite
  };
  
  /** Is this role currently active? */
  readonly isActive: boolean;
  
  /** The agreement that established this role */
  readonly establishedBy: EntityId; // Agreement ID
}

export type RoleContext = 
  | { readonly type: 'Organization'; readonly organizationId: EntityId }
  | { readonly type: 'Agreement'; readonly agreementId: EntityId }
  | { readonly type: 'Asset'; readonly assetId: EntityId }
  | { readonly type: 'Global' };

// Role Events
export interface RoleGranted {
  readonly type: 'RoleGranted';
  readonly roleType: string;
  readonly holderId: EntityId;
  readonly context: RoleContext;
  readonly validFrom: Timestamp;
  readonly validUntil?: Timestamp;
  readonly grantedBy: EntityId; // The agreement establishing this
}

export interface RoleRevoked {
  readonly type: 'RoleRevoked';
  readonly reason: string;
  readonly effectiveAt: Timestamp;
  readonly revokedBy: EntityId; // Party or Agreement
}

// ============================================================================
// AGREEMENT - The Universal Contract
// ============================================================================

/**
 * An Agreement is a generalized contract between entities.
 * It can be:
 * - Bilateral: Two parties with mutual obligations
 * - Unilateral: One party with a witness/testimony
 * - Multilateral: Multiple parties
 * 
 * The structure is flexible enough to represent:
 * - Sales contracts
 * - Employment agreements
 * - Testimony/declarations
 * - Custody arrangements
 * - Any pact between entities
 */
export type AgreementStatus = 
  | 'Draft'
  | 'Proposed' 
  | 'UnderReview'
  | 'Accepted'
  | 'Active'
  | 'Fulfilled'
  | 'Breached'
  | 'Terminated'
  | 'Expired';

export interface Agreement {
  readonly id: EntityId;
  readonly agreementType: string; // 'Sale', 'Employment', 'Testimony', 'Custody', etc.
  readonly createdAt: Timestamp;
  readonly version: number;
  
  /** Current status */
  readonly status: AgreementStatus;
  
  /** The parties involved and their roles in this agreement */
  readonly parties: readonly AgreementParty[];
  
  /** Terms of the agreement */
  readonly terms: AgreementTerms;
  
  /** Assets involved in this agreement */
  readonly assets?: readonly {
    readonly assetId: EntityId;
    readonly role: string; // 'Subject', 'Collateral', 'Payment'
  }[];
  
  /** Parent agreement (for amendments, addendums) */
  readonly parentAgreementId?: EntityId;
  
  /** Validity period */
  readonly validity: {
    readonly effectiveFrom: Timestamp;
    readonly effectiveUntil?: Timestamp;
  };
}

export interface AgreementParty {
  readonly partyId: EntityId;
  readonly role: string; // 'Seller', 'Buyer', 'Witness', 'Guarantor', 'Supervisor'
  readonly obligations: readonly string[];
  readonly rights: readonly string[];
  
  /** For unilateral contracts - this marks the testimony/witness */
  readonly isWitness?: boolean;
  readonly isSupervisor?: boolean;
  
  /** Consent tracking */
  readonly consent?: {
    readonly givenAt?: Timestamp;
    readonly method: string; // 'Signature', 'Digital', 'Verbal', 'Implied'
    readonly evidence?: string;
  };
}

export interface AgreementTerms {
  /** Human-readable description */
  readonly description: string;
  
  /** Structured terms for machine processing */
  readonly clauses: readonly {
    readonly id: string;
    readonly type: string;
    readonly content: string;
    readonly conditions?: Record<string, unknown>;
  }[];
  
  /** Value/consideration */
  readonly consideration?: {
    readonly type: string;
    readonly amount?: number;
    readonly currency?: string;
    readonly description?: string;
  };
}

// Agreement Events
export interface AgreementCreated {
  readonly type: 'AgreementCreated';
  readonly agreementType: string;
  readonly parties: readonly AgreementParty[];
  readonly terms: AgreementTerms;
  readonly assets?: readonly { assetId: EntityId; role: string }[];
  readonly validity: { effectiveFrom: Timestamp; effectiveUntil?: Timestamp };
}

export interface AgreementStatusChanged {
  readonly type: 'AgreementStatusChanged';
  readonly previousStatus: AgreementStatus;
  readonly newStatus: AgreementStatus;
  readonly reason: string;
  readonly changedBy: EntityId;
}

export interface ConsentGiven {
  readonly type: 'ConsentGiven';
  readonly partyId: EntityId;
  readonly method: string;
  readonly evidence?: string;
}

export interface AgreementFulfilled {
  readonly type: 'AgreementFulfilled';
  readonly agreementId: EntityId;
  readonly evidence: readonly EvidenceRef[];
  readonly note?: string;
  readonly fulfilledAt: Timestamp;
}

export interface DisputeOpened {
  readonly type: 'DisputeOpened';
  readonly disputeId: EntityId;
  readonly agreementId: EntityId;
  readonly reason: string;
  readonly evidence?: readonly EvidenceRef[];
  readonly openedAt: Timestamp;
}

export interface DisputeResolved {
  readonly type: 'DisputeResolved';
  readonly disputeId: EntityId;
  readonly agreementId: EntityId;
  readonly resolution: 'accepted' | 'rejected' | 'withdrawn';
  readonly note?: string;
  readonly resolvedAt: Timestamp;
}

/** Evidence reference for fulfillment and disputes */
export interface EvidenceRef {
  readonly kind: 'file' | 'url' | 'hash';
  readonly uri: string;
  readonly hash?: string;
  readonly note?: string;
}

// ============================================================================
// ACTOR - Who Performed an Action
// ============================================================================

export type ActorReference = 
  | { readonly type: 'Entity'; readonly entityId: EntityId }
  | { readonly type: 'Party'; readonly partyId: EntityId }
  | { readonly type: 'System'; readonly systemId: string }
  | { readonly type: 'Workflow'; readonly workflowId: EntityId }
  | { readonly type: 'Anonymous'; readonly reason: string };

// ============================================================================
// COMMAND - Intent to Change State
// ============================================================================

/**
 * Commands represent intentions - they may succeed or fail.
 * Unlike events (facts), commands are requests that need validation.
 */
export interface Command<T = unknown> {
  readonly id: EntityId;
  readonly type: string;
  readonly timestamp: Timestamp;
  readonly actor: ActorReference;
  readonly targetAggregate: {
    readonly type: AggregateType;
    readonly id?: EntityId; // undefined for creation commands
  };
  readonly payload: T;
  readonly expectedVersion?: number; // Optimistic concurrency
  readonly workflowId?: EntityId;
}

// ============================================================================
// TYPE UNIONS
// ============================================================================

export type PartyEvent = PartyRegistered | PartyIdentityUpdated;
export type AssetEvent = AssetCreated | AssetTransferred | AssetStatusChanged;
export type RoleEvent = RoleGranted | RoleRevoked;
export type AgreementEvent = AgreementCreated | AgreementStatusChanged | ConsentGiven | AgreementFulfilled | DisputeOpened | DisputeResolved;

export type DomainEvent = PartyEvent | AssetEvent | RoleEvent | AgreementEvent;

