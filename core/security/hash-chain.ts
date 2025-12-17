/**
 * HASH CHAIN FOR TRAJECTORY SPANS
 * 
 * Provides cryptographic integrity for agent trajectories.
 * Each span links to the previous via hash, creating an immutable chain.
 */

import { createHash } from 'crypto';
import type { EntityId, Timestamp } from '../shared/types';

// =============================================================================
// HASH CHAIN TYPES
// =============================================================================

export interface HashableSpan {
  readonly entityId: string;
  readonly action: string;
  readonly timestamp: Timestamp;
  readonly input: Record<string, unknown>;
  readonly output: Record<string, unknown>;
  readonly previousHash: string;
}

export interface HashedSpan extends HashableSpan {
  readonly hash: string;
}

export interface HashChainValidationResult {
  valid: boolean;
  brokenAt?: number;
  reason?: string;
  details?: {
    expectedHash?: string;
    actualHash?: string;
    spanIndex?: number;
  };
}

// =============================================================================
// HASH FUNCTIONS
// =============================================================================

/**
 * Compute SHA-256 hash of a span
 */
export function computeSpanHash(span: HashableSpan): string {
  const content = JSON.stringify({
    entityId: span.entityId,
    action: span.action,
    timestamp: span.timestamp,
    input: span.input,
    output: span.output,
    previousHash: span.previousHash,
  });
  
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Create a hashed span from a hashable span
 */
export function createHashedSpan(span: HashableSpan): HashedSpan {
  return {
    ...span,
    hash: computeSpanHash(span),
  };
}

/**
 * Compute hash for the genesis span (first in chain)
 */
export function computeGenesisHash(entityId: string): string {
  const content = `genesis:${entityId}:${Date.now()}`;
  return createHash('sha256').update(content).digest('hex');
}

// =============================================================================
// HASH CHAIN VALIDATION
// =============================================================================

/**
 * Validate a chain of hashed spans
 */
export function validateHashChain(spans: HashedSpan[]): HashChainValidationResult {
  if (spans.length === 0) {
    return { valid: true };
  }
  
  // Validate first span has empty or genesis previousHash
  if (spans[0].previousHash !== '' && !spans[0].previousHash.startsWith('genesis:')) {
    // First span should have empty previousHash or genesis marker
    // This is a soft check - some implementations may differ
  }
  
  // Validate each span's hash
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const computedHash = computeSpanHash(span);
    
    if (computedHash !== span.hash) {
      return {
        valid: false,
        brokenAt: i,
        reason: 'Hash mismatch - span content was modified',
        details: {
          expectedHash: span.hash,
          actualHash: computedHash,
          spanIndex: i,
        },
      };
    }
    
    // Validate chain linkage (except first span)
    if (i > 0) {
      const previousSpan = spans[i - 1];
      if (span.previousHash !== previousSpan.hash) {
        return {
          valid: false,
          brokenAt: i,
          reason: 'Chain broken - previousHash does not match previous span hash',
          details: {
            expectedHash: previousSpan.hash,
            actualHash: span.previousHash,
            spanIndex: i,
          },
        };
      }
    }
  }
  
  return { valid: true };
}

/**
 * Detect tampering in a hash chain
 */
export function detectTampering(spans: HashedSpan[]): {
  tampered: boolean;
  tamperedSpans: number[];
  insertedSpans: number[];
  deletedRanges: Array<{ start: number; end: number }>;
} {
  const tamperedSpans: number[] = [];
  const insertedSpans: number[] = [];
  const deletedRanges: Array<{ start: number; end: number }> = [];
  
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    
    // Check if span hash is valid
    const computedHash = computeSpanHash(span);
    if (computedHash !== span.hash) {
      tamperedSpans.push(i);
    }
    
    // Check chain linkage
    if (i > 0) {
      const previousSpan = spans[i - 1];
      if (span.previousHash !== previousSpan.hash) {
        // Could be insertion or deletion
        // If previousHash doesn't match ANY span, likely insertion
        const matchingSpan = spans.findIndex(s => s.hash === span.previousHash);
        if (matchingSpan === -1) {
          insertedSpans.push(i);
        } else if (matchingSpan < i - 1) {
          // Gap detected - spans were deleted
          deletedRanges.push({ start: matchingSpan + 1, end: i - 1 });
        }
      }
    }
  }
  
  return {
    tampered: tamperedSpans.length > 0 || insertedSpans.length > 0 || deletedRanges.length > 0,
    tamperedSpans,
    insertedSpans,
    deletedRanges,
  };
}

// =============================================================================
// HASH CHAIN BUILDER
// =============================================================================

export class HashChainBuilder {
  private spans: HashedSpan[] = [];
  private lastHash: string = '';
  
  constructor(private readonly entityId: string) {}
  
  /**
   * Add a new span to the chain
   */
  addSpan(
    action: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    timestamp: Timestamp = Date.now()
  ): HashedSpan {
    const span: HashableSpan = {
      entityId: this.entityId,
      action,
      timestamp,
      input,
      output,
      previousHash: this.lastHash,
    };
    
    const hashedSpan = createHashedSpan(span);
    this.spans.push(hashedSpan);
    this.lastHash = hashedSpan.hash;
    
    return hashedSpan;
  }
  
  /**
   * Get all spans in the chain
   */
  getChain(): HashedSpan[] {
    return [...this.spans];
  }
  
  /**
   * Get the last hash in the chain
   */
  getLastHash(): string {
    return this.lastHash;
  }
  
  /**
   * Validate the entire chain
   */
  validate(): HashChainValidationResult {
    return validateHashChain(this.spans);
  }
  
  /**
   * Get chain length
   */
  get length(): number {
    return this.spans.length;
  }
}

// =============================================================================
// MERKLE ROOT (for efficient verification)
// =============================================================================

/**
 * Compute Merkle root of span hashes for efficient verification
 */
export function computeMerkleRoot(spans: HashedSpan[]): string {
  if (spans.length === 0) {
    return createHash('sha256').update('empty').digest('hex');
  }
  
  let hashes = spans.map(s => s.hash);
  
  while (hashes.length > 1) {
    const nextLevel: string[] = [];
    
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] || left; // Duplicate last if odd
      const combined = createHash('sha256')
        .update(left + right)
        .digest('hex');
      nextLevel.push(combined);
    }
    
    hashes = nextLevel;
  }
  
  return hashes[0];
}

/**
 * Generate Merkle proof for a specific span
 */
export function generateMerkleProof(
  spans: HashedSpan[],
  spanIndex: number
): { proof: string[]; directions: ('left' | 'right')[] } {
  if (spanIndex < 0 || spanIndex >= spans.length) {
    return { proof: [], directions: [] };
  }
  
  const proof: string[] = [];
  const directions: ('left' | 'right')[] = [];
  
  let hashes = spans.map(s => s.hash);
  let index = spanIndex;
  
  while (hashes.length > 1) {
    const isLeft = index % 2 === 0;
    const siblingIndex = isLeft ? index + 1 : index - 1;
    
    if (siblingIndex < hashes.length) {
      proof.push(hashes[siblingIndex]);
      directions.push(isLeft ? 'right' : 'left');
    }
    
    // Move to next level
    const nextLevel: string[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] || left;
      nextLevel.push(createHash('sha256').update(left + right).digest('hex'));
    }
    
    hashes = nextLevel;
    index = Math.floor(index / 2);
  }
  
  return { proof, directions };
}

/**
 * Verify a Merkle proof
 */
export function verifyMerkleProof(
  spanHash: string,
  proof: string[],
  directions: ('left' | 'right')[],
  merkleRoot: string
): boolean {
  let currentHash = spanHash;
  
  for (let i = 0; i < proof.length; i++) {
    const sibling = proof[i];
    const direction = directions[i];
    
    if (direction === 'left') {
      currentHash = createHash('sha256').update(sibling + currentHash).digest('hex');
    } else {
      currentHash = createHash('sha256').update(currentHash + sibling).digest('hex');
    }
  }
  
  return currentHash === merkleRoot;
}

// =============================================================================
// FACTORY
// =============================================================================

export function createHashChainBuilder(entityId: string): HashChainBuilder {
  return new HashChainBuilder(entityId);
}
