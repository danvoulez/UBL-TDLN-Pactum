/**
 * UNIVERSAL QUERY LANGUAGE
 * 
 * A declarative query language for the ledger.
 * Inspired by GraphQL but designed for temporal, relational data.
 * 
 * Features:
 * - Temporal queries (state at any point in time)
 * - Relationship traversal (follow agreements, roles)
 * - Aggregations and analytics
 * - Subscription support
 */

import type { EntityId, Timestamp } from '../schema/ledger';

// ============================================================================
// QUERY TYPES
// ============================================================================

/**
 * A universal query that can express any data need.
 */
export interface Query {
  /** What are you looking for? */
  readonly select: Selection;
  
  /** Filters to apply */
  readonly where?: readonly Condition[];
  
  /** Point in time (default: now) */
  readonly at?: Timestamp | 'now' | 'genesis';
  
  /** Traverse relationships */
  readonly include?: readonly Inclusion[];
  
  /** Ordering */
  readonly orderBy?: readonly OrderBy[];
  
  /** Pagination */
  readonly pagination?: Pagination;
  
  /** Aggregations */
  readonly aggregate?: readonly Aggregation[];
  
  /** Group by */
  readonly groupBy?: readonly string[];
}

// ============================================================================
// SELECTION
// ============================================================================

export type Selection = 
  | EntitySelection
  | AgreementSelection
  | AssetSelection
  | RoleSelection
  | EventSelection
  | CustomSelection;

export interface EntitySelection {
  readonly type: 'Entity';
  readonly entityType?: string; // Filter by type
  readonly fields?: readonly string[]; // Specific fields, or all if omitted
}

export interface AgreementSelection {
  readonly type: 'Agreement';
  readonly agreementType?: string;
  readonly status?: string | readonly string[];
  readonly fields?: readonly string[];
}

export interface AssetSelection {
  readonly type: 'Asset';
  readonly assetType?: string;
  readonly status?: string | readonly string[];
  readonly fields?: readonly string[];
}

export interface RoleSelection {
  readonly type: 'Role';
  readonly roleType?: string;
  readonly activeOnly?: boolean;
  readonly fields?: readonly string[];
}

export interface EventSelection {
  readonly type: 'Event';
  readonly eventType?: string | readonly string[];
  readonly fields?: readonly string[];
}

export interface CustomSelection {
  readonly type: 'Custom';
  readonly projection: string; // Name of a custom projection
  readonly fields?: readonly string[];
}

// ============================================================================
// CONDITIONS
// ============================================================================

export type Condition = 
  | FieldCondition
  | LogicalCondition
  | ExistsCondition
  | TemporalCondition
  | RelationCondition;

export interface FieldCondition {
  readonly type: 'Field';
  readonly field: string;
  readonly operator: ComparisonOperator;
  readonly value: unknown;
}

export type ComparisonOperator = 
  | 'eq' | 'neq'           // Equal, Not Equal
  | 'gt' | 'gte'           // Greater Than, Greater Than or Equal
  | 'lt' | 'lte'           // Less Than, Less Than or Equal
  | 'in' | 'nin'           // In array, Not In array
  | 'contains'             // String/array contains
  | 'startsWith'           // String starts with
  | 'endsWith'             // String ends with
  | 'matches'              // Regex match
  | 'isNull' | 'isNotNull' // Null checks
  | 'between';             // Between two values

export interface LogicalCondition {
  readonly type: 'Logical';
  readonly operator: 'and' | 'or' | 'not';
  readonly conditions: readonly Condition[];
}

export interface ExistsCondition {
  readonly type: 'Exists';
  readonly relation: string;
  readonly where?: readonly Condition[];
  readonly negate?: boolean;
}

export interface TemporalCondition {
  readonly type: 'Temporal';
  readonly operator: 'existedAt' | 'createdBefore' | 'createdAfter' | 'changedSince';
  readonly timestamp: Timestamp;
}

export interface RelationCondition {
  readonly type: 'Relation';
  readonly relation: string;
  readonly entityId: EntityId;
  readonly direction?: 'from' | 'to' | 'any';
}

// ============================================================================
// INCLUSIONS (Relationship Traversal)
// ============================================================================

export interface Inclusion {
  /** Relationship to follow */
  readonly relation: string;
  
  /** Alias for the result */
  readonly as?: string;
  
  /** Nested selection */
  readonly select?: Selection;
  
  /** Filters on the related entities */
  readonly where?: readonly Condition[];
  
  /** Nested inclusions */
  readonly include?: readonly Inclusion[];
  
  /** Limit results */
  readonly limit?: number;
}

/**
 * Built-in relations that can be traversed
 */
export type BuiltInRelation =
  // Entity relations
  | 'roles'              // Entity → Roles held by this entity
  | 'agreements'         // Entity → Agreements this entity is party to
  | 'ownedAssets'        // Entity → Assets owned by this entity
  | 'custodiedAssets'    // Entity → Assets in custody of this entity
  
  // Agreement relations
  | 'parties'            // Agreement → Entities that are parties
  | 'assets'             // Agreement → Assets involved
  | 'parentAgreement'    // Agreement → Parent agreement (if amendment)
  | 'childAgreements'    // Agreement → Child agreements
  | 'grantedRoles'       // Agreement → Roles granted by this agreement
  | 'workflow'           // Agreement → Active workflow instance
  
  // Asset relations
  | 'owner'              // Asset → Owner entity
  | 'custodian'          // Asset → Custodian entity
  | 'governingAgreements' // Asset → Agreements involving this asset
  
  // Role relations
  | 'holder'             // Role → Entity holding this role
  | 'establishingAgreement' // Role → Agreement that established this role
  | 'delegatedFrom'      // Role → Parent role if delegated
  | 'delegatedTo'        // Role → Child roles delegated from this
  
  // Event relations
  | 'aggregate'          // Event → The aggregate this event belongs to
  | 'actor'              // Event → The actor that created this event
  | 'causedBy'           // Event → The command/event that caused this
  | 'caused';            // Event → Events caused by this event

// ============================================================================
// ORDERING
// ============================================================================

export interface OrderBy {
  readonly field: string;
  readonly direction: 'asc' | 'desc';
  readonly nulls?: 'first' | 'last';
}

// ============================================================================
// PAGINATION
// ============================================================================

export interface Pagination {
  /** Cursor-based (preferred) */
  readonly after?: string;
  readonly before?: string;
  
  /** Offset-based (legacy) */
  readonly offset?: number;
  
  /** Page size */
  readonly limit: number;
}

// ============================================================================
// AGGREGATIONS
// ============================================================================

export interface Aggregation {
  readonly function: AggregateFunction;
  readonly field?: string; // Required for most functions
  readonly as: string;     // Name for the result
}

export type AggregateFunction = 
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'first'
  | 'last'
  | 'collect'; // Collect all values into array

// ============================================================================
// QUERY RESULT
// ============================================================================

export interface QueryResult<T = unknown> {
  /** The data */
  readonly data: readonly T[];
  
  /** Pagination info */
  readonly pageInfo: PageInfo;
  
  /** Aggregation results */
  readonly aggregations?: Record<string, unknown>;
  
  /** Query metadata */
  readonly meta: QueryMeta;
}

export interface PageInfo {
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
  readonly startCursor?: string;
  readonly endCursor?: string;
  readonly totalCount?: number;
}

export interface QueryMeta {
  readonly executionTime: number;
  readonly scannedRecords: number;
  readonly atTimestamp: Timestamp;
}

// ============================================================================
// QUERY BUILDER (Fluent API)
// ============================================================================

// Mutable version of Query for builder pattern
type MutableQuery = {
  -readonly [K in keyof Query]: Query[K] extends readonly (infer T)[] ? T[] : Query[K];
};

export class QueryBuilder {
  private query: Partial<MutableQuery> = {};
  
  static entities(entityType?: string): QueryBuilder {
    const builder = new QueryBuilder();
    builder.query.select = { type: 'Entity', entityType };
    return builder;
  }
  
  static agreements(agreementType?: string): QueryBuilder {
    const builder = new QueryBuilder();
    builder.query.select = { type: 'Agreement', agreementType };
    return builder;
  }
  
  static assets(assetType?: string): QueryBuilder {
    const builder = new QueryBuilder();
    builder.query.select = { type: 'Asset', assetType };
    return builder;
  }
  
  static roles(roleType?: string): QueryBuilder {
    const builder = new QueryBuilder();
    builder.query.select = { type: 'Role', roleType };
    return builder;
  }
  
  static events(eventType?: string | readonly string[]): QueryBuilder {
    const builder = new QueryBuilder();
    builder.query.select = { type: 'Event', eventType };
    return builder;
  }
  
  where(field: string, operator: ComparisonOperator, value: unknown): QueryBuilder {
    const condition: FieldCondition = { type: 'Field', field, operator, value };
    this.query.where = [...(this.query.where || []), condition];
    return this;
  }
  
  and(...conditions: Condition[]): QueryBuilder {
    const logical: LogicalCondition = { type: 'Logical', operator: 'and', conditions };
    this.query.where = [...(this.query.where || []), logical];
    return this;
  }
  
  or(...conditions: Condition[]): QueryBuilder {
    const logical: LogicalCondition = { type: 'Logical', operator: 'or', conditions };
    this.query.where = [...(this.query.where || []), logical];
    return this;
  }
  
  hasRelation(relation: string, entityId: EntityId): QueryBuilder {
    const condition: RelationCondition = { type: 'Relation', relation, entityId };
    this.query.where = [...(this.query.where || []), condition];
    return this;
  }
  
  at(timestamp: Timestamp | 'now' | 'genesis'): QueryBuilder {
    this.query.at = timestamp;
    return this;
  }
  
  include(relation: string, config?: Partial<Omit<Inclusion, 'relation'>>): QueryBuilder {
    const inclusion: Inclusion = { relation, ...config };
    this.query.include = [...(this.query.include || []), inclusion];
    return this;
  }
  
  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): QueryBuilder {
    const order: OrderBy = { field, direction };
    this.query.orderBy = [...(this.query.orderBy || []), order];
    return this;
  }
  
  limit(limit: number): QueryBuilder {
    this.query.pagination = { ...this.query.pagination, limit };
    return this;
  }
  
  after(cursor: string): QueryBuilder {
    this.query.pagination = { ...this.query.pagination, after: cursor, limit: this.query.pagination?.limit ?? 20 };
    return this;
  }
  
  count(as: string = 'count'): QueryBuilder {
    this.query.aggregate = [...(this.query.aggregate || []), { function: 'count', as }];
    return this;
  }
  
  sum(field: string, as?: string): QueryBuilder {
    this.query.aggregate = [...(this.query.aggregate || []), { function: 'sum', field, as: as ?? `sum_${field}` }];
    return this;
  }
  
  groupBy(...fields: string[]): QueryBuilder {
    this.query.groupBy = [...(this.query.groupBy || []), ...fields];
    return this;
  }
  
  build(): Query {
    if (!this.query.select) {
      throw new Error('Select is required');
    }
    return this.query as Query;
  }
}

// ============================================================================
// QUERY EXAMPLES
// ============================================================================

/**
 * Example queries demonstrating the language's expressiveness
 */
export const QUERY_EXAMPLES = {
  // Find all active employees in a realm
  activeEmployees: QueryBuilder
    .roles('Employee')
    .where('isActive', 'eq', true)
    .include('holder', { select: { type: 'Entity', fields: ['name', 'identifiers'] } })
    .include('establishingAgreement', { select: { type: 'Agreement', fields: ['status', 'validity'] } })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .build(),
  
  // Find agreements where a specific entity is a party
  entityAgreements: (entityId: EntityId) => QueryBuilder
    .agreements()
    .where('status', 'in', ['Active', 'Proposed'])
    .hasRelation('parties', entityId)
    .include('parties', { 
      include: [{ relation: 'holder', select: { type: 'Entity', fields: ['name'] } }]
    })
    .include('assets')
    .orderBy('createdAt', 'desc')
    .build(),
  
  // Get entity state at a past point in time
  entityAtTime: (entityId: EntityId, timestamp: Timestamp) => QueryBuilder
    .entities()
    .where('id', 'eq', entityId)
    .at(timestamp)
    .include('roles', { where: [{ type: 'Field', field: 'isActive', operator: 'eq', value: true }] })
    .include('ownedAssets')
    .build(),
  
  // Sales report with aggregations
  salesReport: (fromDate: Timestamp, toDate: Timestamp) => QueryBuilder
    .agreements('sale')
    .where('status', 'eq', 'Fulfilled')
    .and(
      { type: 'Field', field: 'createdAt', operator: 'gte', value: fromDate },
      { type: 'Field', field: 'createdAt', operator: 'lte', value: toDate }
    )
    .sum('terms.consideration.value.amount', 'totalRevenue')
    .count('salesCount')
    .groupBy('parties[role=Seller].entityId')
    .orderBy('totalRevenue', 'desc')
    .build(),
  
  // Audit trail for an entity
  auditTrail: (entityId: EntityId) => QueryBuilder
    .events()
    .where('aggregateId', 'eq', entityId)
    .include('actor', { select: { type: 'Entity', fields: ['name'] } })
    .orderBy('sequence', 'desc')
    .limit(100)
    .build(),
  
  // Find assets needing attention (in certain states)
  assetsNeedingAttention: QueryBuilder
    .assets()
    .where('status', 'in', ['Reserved', 'PendingTransfer'])
    .and({
      type: 'Temporal',
      operator: 'changedSince',
      timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
    })
    .include('owner')
    .include('governingAgreements', { where: [{ type: 'Field', field: 'status', operator: 'eq', value: 'Active' }] })
    .build(),
};

// ============================================================================
// SUBSCRIPTION (Real-time queries)
// ============================================================================

/**
 * Subscribe to changes matching a query
 */
export interface Subscription {
  readonly query: Query;
  readonly events: readonly string[]; // Event types to watch
  readonly debounceMs?: number;
}

export interface SubscriptionResult<T = unknown> {
  readonly type: 'initial' | 'added' | 'updated' | 'removed';
  readonly data: T;
  readonly event?: {
    readonly id: EntityId;
    readonly type: string;
    readonly timestamp: Timestamp;
  };
}

