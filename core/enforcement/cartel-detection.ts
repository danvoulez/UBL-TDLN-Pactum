/**
 * CARTEL DETECTION
 * 
 * SPRINT D.2: Graph-based detection of collusion and market manipulation
 * 
 * Purpose:
 * - Detect coordinated behavior between entities
 * - Identify market manipulation patterns
 * - Prevent cartel formation and price fixing
 * 
 * Methods:
 * - Graph cycle detection for circular transactions
 * - Clustering analysis for coordinated behavior
 * - Temporal correlation for synchronized actions
 */

import type { EntityId, Timestamp } from '../shared/types';

// =============================================================================
// TYPES
// =============================================================================

export interface CartelConfig {
  /** Minimum entities to form a cartel */
  readonly minCartelSize: number;
  
  /** Time window for correlation analysis (ms) */
  readonly correlationWindowMs: number;
  
  /** Minimum correlation coefficient for suspicion */
  readonly correlationThreshold: number;
  
  /** Maximum cycle length to detect */
  readonly maxCycleLength: number;
  
  /** Minimum transaction value to track */
  readonly minTransactionValue: bigint;
}

export interface Transaction {
  readonly id: string;
  readonly from: EntityId;
  readonly to: EntityId;
  readonly amount: bigint;
  readonly timestamp: Timestamp;
  readonly type: string;
}

export interface CartelSuspicion {
  readonly type: CartelType;
  readonly entities: readonly EntityId[];
  readonly confidence: number; // 0-1
  readonly evidence: CartelEvidence;
  readonly detectedAt: Timestamp;
  readonly severity: CartelSeverity;
}

export type CartelType = 
  | 'circular_trading'    // A→B→C→A cycles
  | 'price_fixing'        // Coordinated pricing
  | 'market_manipulation' // Pump and dump
  | 'wash_trading'        // Self-dealing
  | 'coordinated_action'; // Synchronized behavior

export type CartelSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface CartelEvidence {
  readonly cycles?: readonly EntityId[][];
  readonly correlations?: readonly EntityCorrelation[];
  readonly transactions?: readonly Transaction[];
  readonly patterns?: readonly string[];
}

export interface EntityCorrelation {
  readonly entity1: EntityId;
  readonly entity2: EntityId;
  readonly coefficient: number;
  readonly sampleSize: number;
}

// =============================================================================
// GRAPH STRUCTURES
// =============================================================================

class TransactionGraph {
  private adjacency = new Map<EntityId, Map<EntityId, Transaction[]>>();
  private inDegree = new Map<EntityId, number>();
  private outDegree = new Map<EntityId, number>();
  
  addTransaction(tx: Transaction): void {
    // Add edge from → to
    if (!this.adjacency.has(tx.from)) {
      this.adjacency.set(tx.from, new Map());
    }
    
    const edges = this.adjacency.get(tx.from)!;
    if (!edges.has(tx.to)) {
      edges.set(tx.to, []);
    }
    edges.get(tx.to)!.push(tx);
    
    // Update degrees
    this.outDegree.set(tx.from, (this.outDegree.get(tx.from) ?? 0) + 1);
    this.inDegree.set(tx.to, (this.inDegree.get(tx.to) ?? 0) + 1);
  }
  
  getNeighbors(entity: EntityId): EntityId[] {
    const edges = this.adjacency.get(entity);
    return edges ? Array.from(edges.keys()) : [];
  }
  
  getTransactions(from: EntityId, to: EntityId): Transaction[] {
    return this.adjacency.get(from)?.get(to) ?? [];
  }
  
  getAllEntities(): EntityId[] {
    const entities = new Set<EntityId>();
    for (const [from, edges] of this.adjacency) {
      entities.add(from);
      for (const to of edges.keys()) {
        entities.add(to);
      }
    }
    return Array.from(entities);
  }
  
  getInDegree(entity: EntityId): number {
    return this.inDegree.get(entity) ?? 0;
  }
  
  getOutDegree(entity: EntityId): number {
    return this.outDegree.get(entity) ?? 0;
  }
}

// =============================================================================
// CARTEL DETECTOR
// =============================================================================

export class CartelDetector {
  private graph = new TransactionGraph();
  private transactions: Transaction[] = [];
  private entityActions = new Map<EntityId, Timestamp[]>();
  
  constructor(private readonly config: CartelConfig) {}
  
  /**
   * Add a transaction for analysis
   */
  addTransaction(tx: Transaction): void {
    if (tx.amount < this.config.minTransactionValue) return;
    
    this.transactions.push(tx);
    this.graph.addTransaction(tx);
    
    // Track action timestamps
    if (!this.entityActions.has(tx.from)) {
      this.entityActions.set(tx.from, []);
    }
    this.entityActions.get(tx.from)!.push(tx.timestamp);
    
    // Trim old transactions
    const cutoff = Date.now() - this.config.correlationWindowMs * 2;
    this.transactions = this.transactions.filter(t => t.timestamp > cutoff);
  }
  
  /**
   * Run full cartel detection analysis
   */
  analyze(): CartelSuspicion[] {
    const suspicions: CartelSuspicion[] = [];
    
    // Detect circular trading
    const cycles = this.detectCycles();
    if (cycles.length > 0) {
      suspicions.push(this.createCycleSuspicion(cycles));
    }
    
    // Detect wash trading (self-dealing)
    const washTrading = this.detectWashTrading();
    if (washTrading.length > 0) {
      suspicions.push(this.createWashTradingSuspicion(washTrading));
    }
    
    // Detect coordinated actions
    const correlations = this.detectCorrelatedBehavior();
    if (correlations.length > 0) {
      suspicions.push(this.createCorrelationSuspicion(correlations));
    }
    
    return suspicions;
  }
  
  /**
   * Detect cycles in transaction graph (circular trading)
   */
  private detectCycles(): EntityId[][] {
    const cycles: EntityId[][] = [];
    const entities = this.graph.getAllEntities();
    
    for (const start of entities) {
      const found = this.findCyclesFrom(start);
      for (const cycle of found) {
        // Avoid duplicates (same cycle starting from different nodes)
        if (!this.isDuplicateCycle(cycles, cycle)) {
          cycles.push(cycle);
        }
      }
    }
    
    return cycles;
  }
  
  /**
   * DFS to find cycles starting from a node
   */
  private findCyclesFrom(start: EntityId): EntityId[][] {
    const cycles: EntityId[][] = [];
    const visited = new Set<EntityId>();
    const path: EntityId[] = [];
    
    const dfs = (current: EntityId, depth: number): void => {
      if (depth > this.config.maxCycleLength) return;
      
      path.push(current);
      
      for (const neighbor of this.graph.getNeighbors(current)) {
        if (neighbor === start && path.length >= this.config.minCartelSize) {
          // Found a cycle back to start
          cycles.push([...path]);
        } else if (!visited.has(neighbor)) {
          visited.add(neighbor);
          dfs(neighbor, depth + 1);
          visited.delete(neighbor);
        }
      }
      
      path.pop();
    };
    
    visited.add(start);
    dfs(start, 1);
    
    return cycles;
  }
  
  /**
   * Check if cycle is duplicate (same entities, different start)
   */
  private isDuplicateCycle(existing: EntityId[][], newCycle: EntityId[]): boolean {
    const sorted = [...newCycle].sort();
    
    for (const cycle of existing) {
      if (cycle.length !== newCycle.length) continue;
      
      const sortedExisting = [...cycle].sort();
      if (sorted.every((e, i) => e === sortedExisting[i])) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Detect wash trading (entity trading with itself via intermediaries)
   */
  private detectWashTrading(): Transaction[] {
    const suspicious: Transaction[] = [];
    
    // Look for A→B→A patterns within short time
    for (const tx of this.transactions) {
      const returnTxs = this.graph.getTransactions(tx.to, tx.from);
      
      for (const returnTx of returnTxs) {
        // Check if return happened within window
        const timeDiff = Math.abs(returnTx.timestamp - tx.timestamp);
        if (timeDiff < this.config.correlationWindowMs) {
          // Check if amounts are similar (within 10%)
          const amountDiff = Number(tx.amount - returnTx.amount);
          const avgAmount = Number(tx.amount + returnTx.amount) / 2;
          if (Math.abs(amountDiff) / avgAmount < 0.1) {
            suspicious.push(tx);
            suspicious.push(returnTx);
          }
        }
      }
    }
    
    return suspicious;
  }
  
  /**
   * Detect correlated behavior between entities
   */
  private detectCorrelatedBehavior(): EntityCorrelation[] {
    const correlations: EntityCorrelation[] = [];
    const entities = Array.from(this.entityActions.keys());
    
    // Compare each pair of entities
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const correlation = this.calculateCorrelation(entities[i], entities[j]);
        
        if (correlation && correlation.coefficient > this.config.correlationThreshold) {
          correlations.push(correlation);
        }
      }
    }
    
    return correlations;
  }
  
  /**
   * Calculate temporal correlation between two entities
   */
  private calculateCorrelation(e1: EntityId, e2: EntityId): EntityCorrelation | null {
    const times1 = this.entityActions.get(e1) ?? [];
    const times2 = this.entityActions.get(e2) ?? [];
    
    if (times1.length < 3 || times2.length < 3) return null;
    
    // Count synchronized actions (within 1 second of each other)
    let synchronized = 0;
    const syncWindow = 1000; // 1 second
    
    for (const t1 of times1) {
      for (const t2 of times2) {
        if (Math.abs(t1 - t2) < syncWindow) {
          synchronized++;
          break;
        }
      }
    }
    
    const coefficient = synchronized / Math.min(times1.length, times2.length);
    
    return {
      entity1: e1,
      entity2: e2,
      coefficient,
      sampleSize: Math.min(times1.length, times2.length),
    };
  }
  
  /**
   * Create suspicion for cycle detection
   */
  private createCycleSuspicion(cycles: EntityId[][]): CartelSuspicion {
    const allEntities = new Set<EntityId>();
    for (const cycle of cycles) {
      for (const entity of cycle) {
        allEntities.add(entity);
      }
    }
    
    return {
      type: 'circular_trading',
      entities: Array.from(allEntities),
      confidence: Math.min(1, cycles.length * 0.2),
      evidence: { cycles },
      detectedAt: Date.now(),
      severity: cycles.length > 3 ? 'critical' : cycles.length > 1 ? 'high' : 'medium',
    };
  }
  
  /**
   * Create suspicion for wash trading
   */
  private createWashTradingSuspicion(transactions: Transaction[]): CartelSuspicion {
    const entities = new Set<EntityId>();
    for (const tx of transactions) {
      entities.add(tx.from);
      entities.add(tx.to);
    }
    
    return {
      type: 'wash_trading',
      entities: Array.from(entities),
      confidence: Math.min(1, transactions.length * 0.1),
      evidence: { transactions },
      detectedAt: Date.now(),
      severity: transactions.length > 10 ? 'critical' : transactions.length > 5 ? 'high' : 'medium',
    };
  }
  
  /**
   * Create suspicion for correlated behavior
   */
  private createCorrelationSuspicion(correlations: EntityCorrelation[]): CartelSuspicion {
    const entities = new Set<EntityId>();
    for (const corr of correlations) {
      entities.add(corr.entity1);
      entities.add(corr.entity2);
    }
    
    const avgCorrelation = correlations.reduce((sum, c) => sum + c.coefficient, 0) / correlations.length;
    
    return {
      type: 'coordinated_action',
      entities: Array.from(entities),
      confidence: avgCorrelation,
      evidence: { correlations },
      detectedAt: Date.now(),
      severity: avgCorrelation > 0.9 ? 'critical' : avgCorrelation > 0.7 ? 'high' : 'medium',
    };
  }
  
  /**
   * Get current graph statistics
   */
  getStats(): {
    entityCount: number;
    transactionCount: number;
    avgDegree: number;
  } {
    const entities = this.graph.getAllEntities();
    const totalDegree = entities.reduce(
      (sum, e) => sum + this.graph.getInDegree(e) + this.graph.getOutDegree(e),
      0
    );
    
    return {
      entityCount: entities.length,
      transactionCount: this.transactions.length,
      avgDegree: entities.length > 0 ? totalDegree / entities.length : 0,
    };
  }
  
  /**
   * Reset the detector
   */
  reset(): void {
    this.graph = new TransactionGraph();
    this.transactions = [];
    this.entityActions.clear();
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createCartelDetector(config?: Partial<CartelConfig>): CartelDetector {
  const defaultConfig: CartelConfig = {
    minCartelSize: 3,
    correlationWindowMs: 3600000, // 1 hour
    correlationThreshold: 0.7,
    maxCycleLength: 5,
    minTransactionValue: 100n,
  };
  
  return new CartelDetector({ ...defaultConfig, ...config });
}
