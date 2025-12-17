/**
 * FASE 9 - Fake Search Engine for Testing
 * 
 * In-memory implementation of SearchEngine for deterministic testing.
 */

import type {
  SearchEngine,
  SearchQuery,
  SearchResults,
  SearchableDocument,
  BulkIndexResult,
  ReindexResult,
  IndexStats,
  IndexConsistency,
  SuggestOptions,
  Suggestion,
} from './engine';
import type { EntityId, AggregateType, Timestamp } from '../shared/types';

/**
 * Create a fake in-memory search engine for testing.
 */
export function createFakeSearchEngine(): SearchEngine & {
  /**
   * Get all indexed documents (for testing).
   */
  getAllDocuments(): readonly SearchableDocument[];
  
  /**
   * Clear all documents (for testing).
   */
  clear(): void;
} {
  const documents = new Map<string, SearchableDocument>();
  let lastIndexedEventId: string | null = null;
  
  async function search(query: SearchQuery): Promise<SearchResults> {
    const allDocs = Array.from(documents.values());
    
    // Simple text matching
    let filtered = allDocs;
    if (query.query) {
      const queryLower = query.query.toLowerCase();
      filtered = allDocs.filter(doc => {
        const title = doc.title?.toLowerCase() || '';
        const description = doc.description?.toLowerCase() || '';
        const content = doc.content?.toLowerCase() || '';
        return title.includes(queryLower) || description.includes(queryLower) || content.includes(queryLower);
      });
    }
    
    // Apply filters
    if (query.filters) {
      if (query.filters.realmId) {
        filtered = filtered.filter(doc => doc.fields.realmId === query.filters!.realmId);
      }
      if (query.filters.aggregateTypes && query.filters.aggregateTypes.length > 0) {
        filtered = filtered.filter(doc => query.filters!.aggregateTypes!.includes(doc.type));
      }
    }
    
    // Pagination
    const offset = query.offset || 0;
    const limit = query.limit || 10;
    const paginated = filtered.slice(offset, offset + limit);
    
    // Convert to hits
    const hits = paginated.map(doc => ({
      id: doc.id,
      type: doc.type,
      score: 1.0,
      document: doc,
      matchedFields: ['title', 'description'],
    }));
    
    return {
      hits,
      total: filtered.length,
      meta: {
        took: 0,
        query: query.query || '',
        filters: query.filters || {},
        offset,
        limit,
      },
      consistency: {
        lastIndexedEventId,
        lastEventStoreEventId: null,
        indexLagEvents: 0,
      },
    };
  }
  
  async function suggest(prefix: string, options?: SuggestOptions): Promise<readonly Suggestion[]> {
    const allDocs = Array.from(documents.values());
    const prefixLower = prefix.toLowerCase();
    
    const suggestions = allDocs
      .filter(doc => {
        if (options?.realmId && doc.fields.realmId !== options.realmId) {
          return false;
        }
        if (options?.types && !options.types.includes(doc.type)) {
          return false;
        }
        return doc.title.toLowerCase().startsWith(prefixLower);
      })
      .slice(0, options?.limit || 10)
      .map(doc => ({
        text: doc.title,
        type: 'entity' as const,
        score: 1.0,
        metadata: { id: doc.id, type: doc.type },
      }));
    
    return suggestions;
  }
  
  async function index(document: SearchableDocument): Promise<void> {
    const key = `${document.type}:${document.id}`;
    documents.set(key, {
      ...document,
      indexedAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  
  async function indexBulk(docs: readonly SearchableDocument[]): Promise<BulkIndexResult> {
    let indexed = 0;
    let failed = 0;
    const errors: { id: EntityId; error: string }[] = [];
    
    for (const doc of docs) {
      try {
        await index(doc);
        indexed++;
      } catch (error) {
        failed++;
        errors.push({
          id: doc.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    return { indexed, failed, errors: errors.length > 0 ? errors : undefined };
  }
  
  async function remove(id: EntityId, type: AggregateType): Promise<void> {
    const key = `${type}:${id}`;
    documents.delete(key);
  }
  
  async function update(
    id: EntityId,
    type: AggregateType,
    updates: Partial<SearchableDocument>
  ): Promise<void> {
    const key = `${type}:${id}`;
    const existing = documents.get(key);
    if (existing) {
      documents.set(key, {
        ...existing,
        ...updates,
        updatedAt: Date.now(),
      });
    }
  }
  
  async function reindex(type: AggregateType): Promise<ReindexResult> {
    const startTime = Date.now();
    const typeDocs = Array.from(documents.values()).filter(doc => doc.type === type);
    
    // Reindex all documents of this type
    for (const doc of typeDocs) {
      await index(doc);
    }
    
    return {
      type,
      indexed: typeDocs.length,
      duration: Date.now() - startTime,
    };
  }
  
  async function getStats(): Promise<IndexStats> {
    const byType: Record<AggregateType, number> = {} as any;
    
    for (const doc of documents.values()) {
      byType[doc.type] = (byType[doc.type] || 0) + 1;
    }
    
    return {
      totalDocuments: documents.size,
      byType,
      indexSize: documents.size * 1024, // Simulated
      lastUpdated: Date.now(),
    };
  }
  
  async function getIndexConsistency(params?: { realmId?: EntityId }): Promise<IndexConsistency> {
    return {
      realmId: params?.realmId,
      lastIndexedEventId,
      lastEventStoreEventId: null,
      indexLagEvents: 0,
    };
  }
  
  function getAllDocuments(): readonly SearchableDocument[] {
    return Array.from(documents.values());
  }
  
  function clear(): void {
    documents.clear();
    lastIndexedEventId = null;
  }
  
  return {
    search,
    suggest,
    index,
    indexBulk,
    remove,
    update,
    reindex,
    getStats,
    getIndexConsistency,
    getAllDocuments,
    clear,
  };
}

