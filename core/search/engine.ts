/**
 * FASE 9 - BUSCA & CONSISTÊNCIA EVENTUAL DO DIAMANTE
 * 
 * Esta camada oferece busca textual e estruturada sobre o ledger,
 * usando um índice externo e consistência eventual.
 * Objetivos principais:
 * - Deixar explícito o "lag" entre eventos e indexação.
 * - Tornar a indexação segura, idempotente e observável.
 * - Expor sinais claros para operadores e para o agente.
 * 
 * The query language handles structured queries. Search handles:
 * - Full-text search across documents and entities
 * - Fuzzy matching ("Joao" matches "João")
 * - Semantic search ("find contracts about software")
 * - Faceted search (filter by type, status, date)
 */

import type { EntityId, Timestamp, AggregateType } from '../shared/types';

// ============================================================================
// SEARCH TYPES
// ============================================================================

/**
 * A search query with various options.
 */
export interface SearchQuery {
  /** The search terms */
  readonly query: string;
  
  /** Type of search */
  readonly type: SearchType;
  
  /** Filters to narrow results */
  readonly filters?: SearchFilters;
  
  /** Facets to compute */
  readonly facets?: readonly string[];
  
  /** Pagination */
  readonly offset?: number;
  readonly limit?: number;
  
  /** Highlighting */
  readonly highlight?: HighlightConfig;
  
  /** Sorting */
  readonly sort?: SearchSort;
}

export type SearchType =
  | 'FullText'    // Traditional keyword search
  | 'Fuzzy'       // Tolerant of typos
  | 'Semantic'    // AI-powered meaning search
  | 'Phrase'      // Exact phrase match
  | 'Prefix'      // Starts with
  | 'Wildcard';   // Pattern matching

export interface SearchFilters {
  /** Filter by aggregate type */
  readonly aggregateTypes?: readonly AggregateType[];
  
  /** Filter by entity type */
  readonly entityTypes?: readonly string[];
  
  /** Filter by agreement type */
  readonly agreementTypes?: readonly string[];
  
  /** Filter by status */
  readonly statuses?: readonly string[];
  
  /** Filter by realm */
  readonly realmId?: EntityId;
  
  /** Filter by date range */
  readonly dateRange?: {
    readonly field: string;
    readonly from?: Timestamp;
    readonly to?: Timestamp;
  };
  
  /** Filter by party */
  readonly involvedParty?: EntityId;
  
  /** Custom field filters */
  readonly fields?: Record<string, unknown>;
}

export interface HighlightConfig {
  readonly enabled: boolean;
  readonly preTag?: string;
  readonly postTag?: string;
  readonly fragmentSize?: number;
  readonly numberOfFragments?: number;
}

export interface SearchSort {
  readonly field: string;
  readonly order: 'asc' | 'desc';
}

// ============================================================================
// SEARCH RESULTS
// ============================================================================

/**
 * Search results with facets and metadata.
 */
export interface SearchResults {
  /** The matching items */
  readonly hits: readonly SearchHit[];
  
  /** Total count (may be more than hits.length) */
  readonly total: number;
  
  /** Facet counts */
  readonly facets?: Record<string, readonly FacetValue[]>;
  
  /** Query metadata */
  readonly meta: SearchMeta;
  
  /** FASE 9: Eventual consistency markers */
  readonly consistency?: IndexConsistency;
}

export interface SearchHit {
  /** The matched item */
  readonly id: EntityId;
  readonly type: AggregateType;
  
  /** Relevance score */
  readonly score: number;
  
  /** Highlighted snippets */
  readonly highlights?: Record<string, readonly string[]>;
  
  /** The document (or summary) */
  readonly document: SearchableDocument;
  
  /** Why did this match? */
  readonly matchedFields?: readonly string[];
}

export interface SearchableDocument {
  readonly id: EntityId;
  readonly type: AggregateType;
  readonly subtype?: string;
  
  /** Primary content */
  readonly title: string;
  readonly description?: string;
  readonly content?: string;
  
  /** Structured fields */
  readonly fields: Record<string, unknown>;
  
  /** Indexing metadata */
  readonly indexedAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export interface FacetValue {
  readonly value: string;
  readonly count: number;
}

export interface SearchMeta {
  readonly took: number; // milliseconds
  readonly query: string;
  readonly filters: SearchFilters;
  readonly offset: number;
  readonly limit: number;
}

// ============================================================================
// SEARCH ENGINE
// ============================================================================

/**
 * FASE 9: Index consistency marker
 */
export interface IndexConsistency {
  realmId?: EntityId;
  lastIndexedEventId: string | null;
  lastEventStoreEventId: string | null;
  indexLagEvents: number; // diferença entre os dois
  lastIndexedAt?: Timestamp;
}

/**
 * Search engine interface.
 * 
 * FASE 9: Extended with eventual consistency support.
 */
export interface SearchEngine {
  /** Perform a search */
  search(query: SearchQuery): Promise<SearchResults>;
  
  /** Get search suggestions (autocomplete) */
  suggest(prefix: string, options?: SuggestOptions): Promise<readonly Suggestion[]>;
  
  /** Index a document */
  index(document: SearchableDocument): Promise<void>;
  
  /** Index multiple documents */
  indexBulk(documents: readonly SearchableDocument[]): Promise<BulkIndexResult>;
  
  /** Remove a document from index */
  remove(id: EntityId, type: AggregateType): Promise<void>;
  
  /** Update a document */
  update(id: EntityId, type: AggregateType, updates: Partial<SearchableDocument>): Promise<void>;
  
  /** Reindex all documents of a type */
  reindex(type: AggregateType): Promise<ReindexResult>;
  
  /** Get index statistics */
  getStats(): Promise<IndexStats>;
  
  /** FASE 9: Get index consistency for a realm */
  getIndexConsistency?(params: { realmId?: EntityId }): Promise<IndexConsistency>;
}

export interface SuggestOptions {
  readonly limit?: number;
  readonly types?: readonly AggregateType[];
  readonly realmId?: EntityId;
}

export interface Suggestion {
  readonly text: string;
  readonly type: 'entity' | 'query' | 'recent';
  readonly score: number;
  readonly metadata?: Record<string, unknown>;
}

export interface BulkIndexResult {
  readonly indexed: number;
  readonly failed: number;
  readonly errors?: readonly { id: EntityId; error: string }[];
}

export interface ReindexResult {
  readonly type: AggregateType;
  readonly indexed: number;
  readonly duration: number;
}

export interface IndexStats {
  readonly totalDocuments: number;
  readonly byType: Record<AggregateType, number>;
  readonly indexSize: number;
  readonly lastUpdated: Timestamp;
}

/**
 * FASE 9: Index consistency marker
 */
export interface IndexConsistency {
  realmId?: EntityId;
  lastIndexedEventId: string | null;
  lastEventStoreEventId: string | null;
  indexLagEvents: number; // diferença entre os dois
  lastIndexedAt?: Timestamp;
}

// ============================================================================
// SEMANTIC SEARCH
// ============================================================================

/**
 * Semantic search uses embeddings to find similar content.
 */
export interface SemanticSearchEngine {
  /** Search by meaning */
  searchSemantic(query: string, options?: SemanticSearchOptions): Promise<SemanticSearchResults>;
  
  /** Find similar documents */
  findSimilar(documentId: EntityId, options?: SimilarityOptions): Promise<SearchResults>;
  
  /** Generate embeddings for a document */
  embed(text: string): Promise<number[]>;
  
  /** Index document with embeddings */
  indexWithEmbeddings(document: SearchableDocument): Promise<void>;
}

export interface SemanticSearchOptions {
  readonly limit?: number;
  readonly threshold?: number; // Minimum similarity score
  readonly filters?: SearchFilters;
}

export interface SemanticSearchResults {
  readonly hits: readonly SemanticHit[];
  readonly total: number;
  readonly meta: SearchMeta;
}

export interface SemanticHit extends SearchHit {
  readonly similarity: number; // 0-1 similarity score
  readonly explanation?: string; // Why this matched
}

export interface SimilarityOptions {
  readonly limit?: number;
  readonly excludeTypes?: readonly AggregateType[];
  readonly sameTypeOnly?: boolean;
}

// ============================================================================
// INDEXING
// ============================================================================

/**
 * Indexer converts domain objects to searchable documents.
 */
export interface SearchIndexer {
  /** Index an entity */
  indexEntity(entity: unknown, type: string): Promise<void>;
  
  /** Index an agreement */
  indexAgreement(agreement: unknown): Promise<void>;
  
  /** Index an asset */
  indexAsset(asset: unknown): Promise<void>;
  
  /** Index an event (for audit search) */
  indexEvent(event: unknown): Promise<void>;
  
  /** Index a document/attachment */
  indexDocument(document: unknown): Promise<void>;
  
  /** Subscribe to events and auto-index */
  startAutoIndexing(): void;
  stopAutoIndexing(): void;
}

/**
 * Field mapping for indexing.
 */
export interface FieldMapping {
  readonly name: string;
  readonly type: FieldType;
  readonly searchable: boolean;
  readonly facetable: boolean;
  readonly sortable: boolean;
  readonly boost?: number;
  readonly analyzer?: string;
}

export type FieldType =
  | 'text'       // Full-text searchable
  | 'keyword'    // Exact match only
  | 'number'
  | 'date'
  | 'boolean'
  | 'object'
  | 'nested';

// ============================================================================
// EXAMPLE MAPPINGS
// ============================================================================

export const SEARCH_MAPPINGS = {
  Entity: {
    fields: [
      { name: 'identity.name', type: 'text' as FieldType, searchable: true, facetable: false, sortable: true, boost: 2 },
      { name: 'entityType', type: 'keyword' as FieldType, searchable: false, facetable: true, sortable: false },
      { name: 'identity.identifiers.value', type: 'text' as FieldType, searchable: true, facetable: false, sortable: false },
      { name: 'realmId', type: 'keyword' as FieldType, searchable: false, facetable: true, sortable: false },
      { name: 'createdAt', type: 'date' as FieldType, searchable: false, facetable: false, sortable: true },
    ],
  },
  
  Agreement: {
    fields: [
      { name: 'agreementType', type: 'keyword' as FieldType, searchable: false, facetable: true, sortable: false },
      { name: 'status', type: 'keyword' as FieldType, searchable: false, facetable: true, sortable: false },
      { name: 'terms.description', type: 'text' as FieldType, searchable: true, facetable: false, sortable: false, boost: 1.5 },
      { name: 'terms.clauses.content', type: 'text' as FieldType, searchable: true, facetable: false, sortable: false },
      { name: 'parties.entityId', type: 'keyword' as FieldType, searchable: false, facetable: true, sortable: false },
      { name: 'realmId', type: 'keyword' as FieldType, searchable: false, facetable: true, sortable: false },
      { name: 'validity.effectiveFrom', type: 'date' as FieldType, searchable: false, facetable: false, sortable: true },
    ],
  },
  
  Asset: {
    fields: [
      { name: 'assetType', type: 'keyword' as FieldType, searchable: false, facetable: true, sortable: false },
      { name: 'status', type: 'keyword' as FieldType, searchable: false, facetable: true, sortable: false },
      { name: 'properties', type: 'object' as FieldType, searchable: true, facetable: false, sortable: false },
      { name: 'ownerId', type: 'keyword' as FieldType, searchable: false, facetable: true, sortable: false },
      { name: 'realmId', type: 'keyword' as FieldType, searchable: false, facetable: true, sortable: false },
    ],
  },
  
  Document: {
    fields: [
      { name: 'filename', type: 'text' as FieldType, searchable: true, facetable: false, sortable: true },
      { name: 'title', type: 'text' as FieldType, searchable: true, facetable: false, sortable: true, boost: 2 },
      { name: 'documentType', type: 'keyword' as FieldType, searchable: false, facetable: true, sortable: false },
      { name: 'content', type: 'text' as FieldType, searchable: true, facetable: false, sortable: false }, // Extracted text
      { name: 'uploadedAt', type: 'date' as FieldType, searchable: false, facetable: false, sortable: true },
    ],
  },
};

