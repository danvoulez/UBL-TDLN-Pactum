/**
 * GRAPHQL STANDARD
 * 
 * GraphQL is Facebook's query language that lets clients ask for exactly
 * what they need. Many companies have GraphQL APIs:
 * 
 * - Shopify
 * - GitHub  
 * - Stripe (beta)
 * - Contentful
 * - Hasura
 * - Apollo
 * 
 * By exposing a GraphQL schema, we enable:
 * - Precise data fetching (no over-fetching)
 * - Strong typing
 * - Introspection (self-documenting)
 * - Subscriptions (real-time)
 * - Federation (combine multiple services)
 */

// ============================================================================
// GRAPHQL SCHEMA FOR UNIVERSAL LEDGER
// ============================================================================

/**
 * Generate GraphQL SDL (Schema Definition Language) for the ledger.
 */
export function generateGraphQLSchema(): string {
  return `
"""
Universal Business Ledger GraphQL API

All business relationships are Agreements.
All permissions trace to their source.
All history is preserved.
"""

# ============================================================================
# SCALARS
# ============================================================================

"Unique identifier (prefixed: ent-, agr-, ast-, rol-)"
scalar EntityId

"Unix timestamp in milliseconds"
scalar Timestamp

"JSON object for flexible data"
scalar JSON

"Hash value (SHA-256)"
scalar Hash

# ============================================================================
# ENUMS
# ============================================================================

enum EntityType {
  Person
  Organization
  System
  Department
  Service
}

enum AgreementStatus {
  Draft
  Proposed
  Active
  Suspended
  Terminated
  Fulfilled
  Expired
}

enum AssetStatus {
  Active
  Reserved
  Transferred
  Archived
  Disposed
}

enum RoleStatus {
  Active
  Suspended
  Revoked
  Expired
}

# ============================================================================
# CORE TYPES
# ============================================================================

"An Entity is anything that can participate in agreements"
type Entity {
  id: EntityId!
  type: EntityType!
  identity: EntityIdentity!
  realmId: EntityId
  createdAt: Timestamp!
  updatedAt: Timestamp
  
  # Relationships
  "Agreements this entity is a party to"
  agreements(status: AgreementStatus, first: Int, after: String): AgreementConnection!
  
  "Roles this entity currently holds"
  roles(status: RoleStatus): [Role!]!
  
  "Assets owned by this entity"
  assets(status: AssetStatus): [Asset!]!
  
  # Temporal
  "Get state at a specific point in time"
  atTime(timestamp: Timestamp!): Entity
}

type EntityIdentity {
  name: String!
  identifiers: [Identifier!]!
  contacts: [Contact!]!
}

type Identifier {
  type: String!
  value: String!
  issuedBy: String
  validUntil: Timestamp
}

type Contact {
  type: String!
  value: String!
  verified: Boolean
}

"An Agreement establishes relationships between entities"
type Agreement {
  id: EntityId!
  type: String!
  status: AgreementStatus!
  parties: [AgreementParty!]!
  terms: Terms!
  assets: [AssetReference!]
  validity: Validity
  realmId: EntityId
  createdAt: Timestamp!
  activatedAt: Timestamp
  terminatedAt: Timestamp
  
  # Relationships
  "Roles established by this agreement"
  establishedRoles: [Role!]!
  
  "Parent agreement (if amendment or sub-agreement)"
  parent: Agreement
  
  "Child agreements"
  children: [Agreement!]!
  
  # Audit
  "Complete event history"
  events(first: Int, after: String): EventConnection!
  
  # Workflow
  "Current workflow state"
  workflowState: String
  
  "Available transitions"
  availableTransitions: [Transition!]!
  
  # Temporal
  atTime(timestamp: Timestamp!): Agreement
}

type AgreementParty {
  entity: Entity!
  role: String!
  consent: Consent
  obligations: [Obligation!]!
  rights: [Right!]!
}

type Consent {
  givenAt: Timestamp!
  method: String!
  evidence: JSON
}

type Terms {
  description: String!
  clauses: [Clause!]!
  consideration: Consideration
}

type Clause {
  id: String!
  type: String!
  title: String
  content: String!
}

type Consideration {
  description: String!
  value: MonetaryValue
}

type MonetaryValue {
  amount: Float!
  currency: String!
}

type Obligation {
  id: String!
  description: String!
  deadline: Timestamp
  fulfilled: Boolean!
  fulfilledAt: Timestamp
}

type Right {
  id: String!
  description: String!
  conditions: [String!]
}

type Validity {
  effectiveFrom: Timestamp!
  effectiveUntil: Timestamp
}

type AssetReference {
  asset: Asset!
  role: String!
}

"An Asset is anything that can be owned, transferred, or valued"
type Asset {
  id: EntityId!
  type: String!
  status: AssetStatus!
  owner: Entity!
  properties: JSON!
  realmId: EntityId
  createdAt: Timestamp!
  
  # Relationships
  "Agreements involving this asset"
  agreements: [Agreement!]!
  
  # History
  "Ownership history"
  ownershipHistory: [OwnershipRecord!]!
  
  # Temporal
  atTime(timestamp: Timestamp!): Asset
}

type OwnershipRecord {
  owner: Entity!
  from: Timestamp!
  to: Timestamp
  agreement: Agreement
}

"A Role is a relationship established by an agreement"
type Role {
  id: EntityId!
  type: String!
  status: RoleStatus!
  holder: Entity!
  establishedBy: Agreement!
  scope: RoleScope
  permissions: [Permission!]!
  validity: Validity
  createdAt: Timestamp!
  
  # Temporal
  atTime(timestamp: Timestamp!): Role
}

type RoleScope {
  type: String!
  targetId: EntityId
}

type Permission {
  action: String!
  resource: String!
  conditions: [String!]
}

type Transition {
  name: String!
  description: String
  requiredRole: String
}

# ============================================================================
# EVENTS
# ============================================================================

"An Event is an immutable fact that happened"
type Event {
  id: String!
  type: String!
  aggregateType: String!
  aggregateId: EntityId!
  timestamp: Timestamp!
  actor: Actor!
  payload: JSON!
  sequence: String
  hash: Hash!
}

type Actor {
  type: String!
  entityId: EntityId
  systemId: String
}

# ============================================================================
# CONNECTIONS (Pagination)
# ============================================================================

type AgreementConnection {
  edges: [AgreementEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type AgreementEdge {
  node: Agreement!
  cursor: String!
}

type EventConnection {
  edges: [EventEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type EventEdge {
  node: Event!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

# ============================================================================
# QUERIES
# ============================================================================

type Query {
  # Single item lookups
  entity(id: EntityId!): Entity
  agreement(id: EntityId!): Agreement
  asset(id: EntityId!): Asset
  role(id: EntityId!): Role
  event(id: String!): Event
  
  # Lists with filtering
  entities(
    type: EntityType
    realmId: EntityId
    search: String
    first: Int
    after: String
  ): EntityConnection!
  
  agreements(
    type: String
    status: AgreementStatus
    partyId: EntityId
    realmId: EntityId
    first: Int
    after: String
  ): AgreementConnection!
  
  assets(
    type: String
    status: AssetStatus
    ownerId: EntityId
    realmId: EntityId
    first: Int
    after: String
  ): AssetConnection!
  
  roles(
    type: String
    status: RoleStatus
    holderId: EntityId
    realmId: EntityId
  ): [Role!]!
  
  events(
    aggregateType: String
    aggregateId: EntityId
    type: String
    after: String
    first: Int
  ): EventConnection!
  
  # Temporal queries
  "Get state of any aggregate at a point in time"
  stateAt(
    aggregateType: String!
    aggregateId: EntityId!
    timestamp: Timestamp!
  ): JSON
  
  # Search
  search(
    query: String!
    types: [String!]
    realmId: EntityId
    first: Int
  ): SearchResults!
  
  # Introspection
  "Available intent types"
  intents: [IntentDefinition!]!
  
  "Check what the current actor can do"
  myPermissions: [Permission!]!
}

type EntityConnection {
  edges: [EntityEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type EntityEdge {
  node: Entity!
  cursor: String!
}

type AssetConnection {
  edges: [AssetEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type AssetEdge {
  node: Asset!
  cursor: String!
}

type SearchResults {
  hits: [SearchHit!]!
  total: Int!
}

type SearchHit {
  id: EntityId!
  type: String!
  score: Float!
  highlights: JSON
}

type IntentDefinition {
  intent: String!
  description: String!
  category: String!
  requiredFields: [String!]!
  optionalFields: [String!]!
}

# ============================================================================
# MUTATIONS (Intents)
# ============================================================================

type Mutation {
  """
  Execute a business intent.
  This is the primary way to make changes in the ledger.
  """
  intend(input: IntentInput!): IntentResult!
  
  # Convenience mutations (map to intents)
  
  "Register a new entity"
  registerEntity(input: RegisterEntityInput!): Entity!
  
  "Propose an agreement"
  proposeAgreement(input: ProposeAgreementInput!): Agreement!
  
  "Give consent to an agreement"
  consent(agreementId: EntityId!): Agreement!
  
  "Fulfill an obligation"
  fulfillObligation(
    agreementId: EntityId!
    obligationId: String!
    evidence: JSON
  ): Agreement!
  
  "Register an asset"
  registerAsset(input: RegisterAssetInput!): Asset!
  
  "Transfer asset ownership"
  transferAsset(
    assetId: EntityId!
    toEntityId: EntityId!
    agreementId: EntityId
  ): Asset!
}

input IntentInput {
  intent: String!
  payload: JSON!
  idempotencyKey: String
}

type IntentResult {
  success: Boolean!
  intent: String!
  outcome: Outcome
  affordances: [Affordance!]!
  events: [String!]!
  error: IntentError
}

type Outcome {
  type: String!
  aggregateType: String
  aggregateId: EntityId
  data: JSON
}

type Affordance {
  intent: String!
  description: String!
  available: Boolean!
  requiredRole: String
}

type IntentError {
  code: String!
  message: String!
  details: JSON
}

input RegisterEntityInput {
  type: EntityType!
  name: String!
  identifiers: [IdentifierInput!]
  contacts: [ContactInput!]
  realmId: EntityId
}

input IdentifierInput {
  type: String!
  value: String!
}

input ContactInput {
  type: String!
  value: String!
}

input ProposeAgreementInput {
  type: String!
  parties: [PartyInput!]!
  terms: TermsInput!
  assets: [AssetReferenceInput!]
  validity: ValidityInput
}

input PartyInput {
  entityId: EntityId!
  role: String!
}

input TermsInput {
  description: String!
  clauses: [ClauseInput!]
  consideration: ConsiderationInput
}

input ClauseInput {
  type: String!
  title: String
  content: String!
}

input ConsiderationInput {
  description: String!
  amount: Float
  currency: String
}

input AssetReferenceInput {
  assetId: EntityId!
  role: String!
}

input ValidityInput {
  effectiveFrom: Timestamp
  effectiveUntil: Timestamp
}

input RegisterAssetInput {
  type: String!
  properties: JSON!
  ownerId: EntityId!
  realmId: EntityId
}

# ============================================================================
# SUBSCRIPTIONS (Real-time)
# ============================================================================

type Subscription {
  "Subscribe to all events"
  events(
    aggregateType: String
    aggregateId: EntityId
    types: [String!]
  ): Event!
  
  "Subscribe to agreement changes"
  agreementUpdated(agreementId: EntityId!): Agreement!
  
  "Subscribe to entity changes"
  entityUpdated(entityId: EntityId!): Entity!
  
  "Subscribe to workflow transitions"
  workflowTransition(workflowId: EntityId): WorkflowTransitionEvent!
}

type WorkflowTransitionEvent {
  workflowId: EntityId!
  fromState: String!
  toState: String!
  transition: String!
  timestamp: Timestamp!
}
`.trim();
}

// ============================================================================
// GRAPHQL RESOLVERS SCAFFOLD
// ============================================================================

/**
 * Resolver scaffold for implementing the GraphQL API.
 * This shows the structure - actual implementation connects to the ledger.
 */
export const RESOLVER_SCAFFOLD = {
  Query: {
    entity: '(_, { id }, context) => context.ledger.aggregates.getEntity(id)',
    agreement: '(_, { id }, context) => context.ledger.aggregates.getAgreement(id)',
    asset: '(_, { id }, context) => context.ledger.aggregates.getAsset(id)',
    role: '(_, { id }, context) => context.ledger.aggregates.getRole(id)',
    
    entities: '(_, args, context) => queryEntities(context.ledger, args)',
    agreements: '(_, args, context) => queryAgreements(context.ledger, args)',
    
    stateAt: '(_, { aggregateType, aggregateId, timestamp }, context) => context.ledger.temporal.getAt(aggregateType, aggregateId, timestamp)',
  },
  
  Mutation: {
    intend: '(_, { input }, context) => executeIntent(context.ledger, input, context.actor)',
    registerEntity: '(_, { input }, context) => executeIntent(context.ledger, { intent: "register:entity", payload: input }, context.actor)',
    proposeAgreement: '(_, { input }, context) => executeIntent(context.ledger, { intent: "propose:agreement", payload: input }, context.actor)',
  },
  
  Subscription: {
    events: {
      subscribe: '(_, args, context) => context.ledger.eventStore.subscribe(args)',
    },
  },
  
  // Field resolvers
  Entity: {
    agreements: '(entity, args, context) => queryAgreementsByParty(context.ledger, entity.id, args)',
    roles: '(entity, _, context) => context.ledger.aggregates.getActiveRolesForEntity(entity.id)',
    assets: '(entity, _, context) => queryAssetsByOwner(context.ledger, entity.id)',
  },
  
  Agreement: {
    parties: '(agreement) => agreement.parties.map(p => ({ ...p, entity: defer(() => getEntity(p.entityId)) }))',
    establishedRoles: '(agreement, _, context) => queryRolesByAgreement(context.ledger, agreement.id)',
    events: '(agreement, args, context) => queryEventsForAggregate(context.ledger, "Agreement", agreement.id, args)',
  },
};

// ============================================================================
// FEDERATION SUPPORT
// ============================================================================

/**
 * Apollo Federation directives for combining with other GraphQL services.
 */
export function generateFederatedSchema(): string {
  return `
extend schema
  @link(url: "https://specs.apollo.dev/federation/v2.0",
        import: ["@key", "@shareable", "@external", "@requires"])

type Entity @key(fields: "id") {
  id: EntityId!
  # ... rest of fields
}

type Agreement @key(fields: "id") {
  id: EntityId!
  # ... rest of fields
}

# External types that might come from other services
extend type User @key(fields: "id") {
  id: ID! @external
  entity: Entity @requires(fields: "id")
}
`.trim();
}

// ============================================================================
// DATALOADERS
// ============================================================================

/**
 * DataLoader patterns to prevent N+1 queries.
 */
export const DATALOADER_PATTERNS = {
  entities: `
    new DataLoader(async (ids: readonly EntityId[]) => {
      const entities = await ledger.aggregates.getEntitiesBatch(ids);
      return ids.map(id => entities.find(e => e.id === id) ?? null);
    })
  `,
  
  agreements: `
    new DataLoader(async (ids: readonly EntityId[]) => {
      const agreements = await ledger.aggregates.getAgreementsBatch(ids);
      return ids.map(id => agreements.find(a => a.id === id) ?? null);
    })
  `,
  
  roles: `
    new DataLoader(async (ids: readonly EntityId[]) => {
      const roles = await ledger.aggregates.getRolesBatch(ids);
      return ids.map(id => roles.find(r => r.id === id) ?? null);
    })
  `,
};

// ============================================================================
// DIRECTIVES
// ============================================================================

/**
 * Custom directives for the ledger.
 */
export const CUSTOM_DIRECTIVES = `
"Requires the actor to have a specific permission"
directive @requiresPermission(action: String!, resource: String!) on FIELD_DEFINITION

"Field is only visible to parties of the agreement"
directive @partiesOnly on FIELD_DEFINITION

"Automatically log access to this field"
directive @audit on FIELD_DEFINITION

"Cache this field's result"
directive @cached(ttl: Int!) on FIELD_DEFINITION

"This field supports temporal queries"
directive @temporal on FIELD_DEFINITION
`;

