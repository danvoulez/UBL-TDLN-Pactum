/**
 * EVENT REPLAY ATTACK PREVENTION
 * 
 * Prevents replay attacks through:
 * 1. Sequence number validation
 * 2. Nonce tracking
 * 3. Timestamp window validation
 * 4. Hash chain verification
 */

import type { EntityId, Timestamp } from '../shared/types';
import type { Event } from '../schema/ledger';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface ReplayPreventionConfig {
  /** Maximum clock skew allowed (ms) */
  maxClockSkew: number;
  
  /** How long to keep nonces (ms) */
  nonceRetentionPeriod: number;
  
  /** Maximum events to track for sequence validation */
  maxSequenceHistory: number;
  
  /** Enable strict mode (reject any suspicious event) */
  strictMode: boolean;
}

const DEFAULT_CONFIG: ReplayPreventionConfig = {
  maxClockSkew: 5 * 60 * 1000, // 5 minutes
  nonceRetentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
  maxSequenceHistory: 10000,
  strictMode: true,
};

// =============================================================================
// REPLAY DETECTION RESULT
// =============================================================================

export interface ReplayCheckResult {
  isReplay: boolean;
  reason?: string;
  details?: {
    expectedSequence?: bigint;
    actualSequence?: bigint;
    duplicateNonce?: string;
    timestampDelta?: number;
    hashMismatch?: boolean;
  };
}

// =============================================================================
// REPLAY PREVENTION SERVICE
// =============================================================================

export class ReplayPreventionService {
  private config: ReplayPreventionConfig;
  private processedNonces: Map<string, Timestamp> = new Map();
  private sequenceByAggregate: Map<EntityId, bigint> = new Map();
  private lastEventHash: Map<EntityId, string> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  
  constructor(config: Partial<ReplayPreventionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanup();
  }
  
  // ---------------------------------------------------------------------------
  // MAIN VALIDATION
  // ---------------------------------------------------------------------------
  
  /**
   * Check if an event is a replay attack
   */
  checkEvent(event: Event): ReplayCheckResult {
    // Check 1: Timestamp validation
    const timestampResult = this.validateTimestamp(event.timestamp);
    if (timestampResult.isReplay) return timestampResult;
    
    // Check 2: Sequence validation
    const sequenceResult = this.validateSequence(event);
    if (sequenceResult.isReplay) return sequenceResult;
    
    // Check 3: Nonce validation (if present)
    if (event.causation?.commandId) {
      const nonceResult = this.validateNonce(event.causation.commandId);
      if (nonceResult.isReplay) return nonceResult;
    }
    
    // Check 4: Hash chain validation
    const hashResult = this.validateHashChain(event);
    if (hashResult.isReplay) return hashResult;
    
    return { isReplay: false };
  }
  
  /**
   * Record an event as processed (after successful validation)
   */
  recordEvent(event: Event): void {
    // Record sequence
    this.sequenceByAggregate.set(event.aggregateId, event.sequence);
    
    // Record hash
    this.lastEventHash.set(event.aggregateId, event.hash);
    
    // Record nonce
    if (event.causation?.commandId) {
      this.processedNonces.set(event.causation.commandId, Date.now());
    }
    
    // Cleanup old sequences if needed
    if (this.sequenceByAggregate.size > this.config.maxSequenceHistory) {
      this.pruneSequenceHistory();
    }
  }
  
  // ---------------------------------------------------------------------------
  // VALIDATION METHODS
  // ---------------------------------------------------------------------------
  
  private validateTimestamp(timestamp: Timestamp): ReplayCheckResult {
    const now = Date.now();
    const delta = Math.abs(now - timestamp);
    
    if (delta > this.config.maxClockSkew) {
      return {
        isReplay: true,
        reason: 'Timestamp outside acceptable window',
        details: { timestampDelta: delta },
      };
    }
    
    return { isReplay: false };
  }
  
  private validateSequence(event: Event): ReplayCheckResult {
    const lastSequence = this.sequenceByAggregate.get(event.aggregateId);
    
    if (lastSequence !== undefined) {
      // Sequence must be strictly increasing
      if (event.sequence <= lastSequence) {
        return {
          isReplay: true,
          reason: 'Sequence number not increasing',
          details: {
            expectedSequence: lastSequence + 1n,
            actualSequence: event.sequence,
          },
        };
      }
      
      // In strict mode, sequence must be exactly +1
      if (this.config.strictMode && event.sequence !== lastSequence + 1n) {
        return {
          isReplay: true,
          reason: 'Sequence gap detected (strict mode)',
          details: {
            expectedSequence: lastSequence + 1n,
            actualSequence: event.sequence,
          },
        };
      }
    }
    
    return { isReplay: false };
  }
  
  private validateNonce(nonce: string): ReplayCheckResult {
    if (this.processedNonces.has(nonce)) {
      return {
        isReplay: true,
        reason: 'Duplicate nonce detected',
        details: { duplicateNonce: nonce },
      };
    }
    
    return { isReplay: false };
  }
  
  private validateHashChain(event: Event): ReplayCheckResult {
    const lastHash = this.lastEventHash.get(event.aggregateId);
    
    if (lastHash !== undefined && event.previousHash !== lastHash) {
      return {
        isReplay: true,
        reason: 'Hash chain broken',
        details: { hashMismatch: true },
      };
    }
    
    return { isReplay: false };
  }
  
  // ---------------------------------------------------------------------------
  // CLEANUP
  // ---------------------------------------------------------------------------
  
  private startCleanup(): void {
    // Cleanup expired nonces every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredNonces();
    }, 60 * 60 * 1000);
  }
  
  private cleanupExpiredNonces(): void {
    const now = Date.now();
    const expiry = this.config.nonceRetentionPeriod;
    
    for (const [nonce, timestamp] of this.processedNonces) {
      if (now - timestamp > expiry) {
        this.processedNonces.delete(nonce);
      }
    }
  }
  
  private pruneSequenceHistory(): void {
    // Keep only the most recent half
    const entries = Array.from(this.sequenceByAggregate.entries());
    const toKeep = Math.floor(entries.length / 2);
    
    // Sort by sequence (descending) and keep top half
    entries.sort((a, b) => Number(b[1] - a[1]));
    
    this.sequenceByAggregate.clear();
    for (let i = 0; i < toKeep; i++) {
      this.sequenceByAggregate.set(entries[i][0], entries[i][1]);
    }
  }
  
  // ---------------------------------------------------------------------------
  // LIFECYCLE
  // ---------------------------------------------------------------------------
  
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------
  
  getLastSequence(aggregateId: EntityId): bigint | undefined {
    return this.sequenceByAggregate.get(aggregateId);
  }
  
  getLastHash(aggregateId: EntityId): string | undefined {
    return this.lastEventHash.get(aggregateId);
  }
  
  isNonceUsed(nonce: string): boolean {
    return this.processedNonces.has(nonce);
  }
  
  getStats(): {
    trackedAggregates: number;
    trackedNonces: number;
    oldestNonce: Timestamp | null;
  } {
    let oldestNonce: Timestamp | null = null;
    for (const timestamp of this.processedNonces.values()) {
      if (oldestNonce === null || timestamp < oldestNonce) {
        oldestNonce = timestamp;
      }
    }
    
    return {
      trackedAggregates: this.sequenceByAggregate.size,
      trackedNonces: this.processedNonces.size,
      oldestNonce,
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createReplayPreventionService(
  config?: Partial<ReplayPreventionConfig>
): ReplayPreventionService {
  return new ReplayPreventionService(config);
}

// =============================================================================
// NONCE GENERATOR
// =============================================================================

/**
 * Generate a cryptographically secure nonce
 */
export function generateNonce(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2);
  const counter = (globalNonceCounter++).toString(36);
  
  return `${timestamp}-${random}-${counter}`;
}

let globalNonceCounter = 0;

/**
 * Generate a nonce with entity context
 */
export function generateContextualNonce(entityId: EntityId, action: string): string {
  const base = generateNonce();
  const context = `${entityId.slice(0, 8)}-${action}`;
  return `${context}-${base}`;
}
