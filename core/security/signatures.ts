/**
 * CRYPTOGRAPHIC SIGNATURES
 * 
 * Provides non-repudiation for events and trajectory spans.
 * Uses Ed25519 for digital signatures.
 */

import { createHash, randomBytes } from 'crypto';
import type { EntityId, Timestamp } from '../shared/types';

// =============================================================================
// KEY TYPES
// =============================================================================

export interface KeyPair {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly algorithm: 'Ed25519' | 'ECDSA-P256';
  readonly createdAt: Timestamp;
}

export interface PublicKeyInfo {
  readonly publicKey: string;
  readonly algorithm: 'Ed25519' | 'ECDSA-P256';
  readonly entityId: string;
  readonly validFrom: Timestamp;
  readonly validUntil?: Timestamp;
  readonly revoked: boolean;
}

// =============================================================================
// SIGNATURE TYPES
// =============================================================================

export interface Signature {
  readonly value: string;
  readonly algorithm: 'Ed25519' | 'ECDSA-P256';
  readonly keyId: string;
  readonly timestamp: Timestamp;
}

export interface SignedData<T> {
  readonly data: T;
  readonly signature: Signature;
}

export interface SignatureVerificationResult {
  valid: boolean;
  reason?: string;
  keyInfo?: PublicKeyInfo;
}

// =============================================================================
// MOCK SIGNATURE SERVICE (for development)
// =============================================================================

/**
 * Mock signature service for development/testing.
 * In production, use actual Ed25519 implementation.
 */
export class MockSignatureService {
  private keys: Map<string, KeyPair> = new Map();
  private publicKeys: Map<string, PublicKeyInfo> = new Map();
  
  /**
   * Generate a new key pair for an entity
   */
  generateKeyPair(entityId: string): KeyPair {
    const keyId = `key-${entityId}-${Date.now()}`;
    const privateKey = randomBytes(32).toString('hex');
    const publicKey = createHash('sha256').update(privateKey).digest('hex');
    
    const keyPair: KeyPair = {
      publicKey,
      privateKey,
      algorithm: 'Ed25519',
      createdAt: Date.now(),
    };
    
    this.keys.set(keyId, keyPair);
    this.publicKeys.set(keyId, {
      publicKey,
      algorithm: 'Ed25519',
      entityId,
      validFrom: Date.now(),
      revoked: false,
    });
    
    return keyPair;
  }
  
  /**
   * Sign data with a private key
   */
  sign(data: unknown, privateKey: string): Signature {
    const content = JSON.stringify(data);
    const hash = createHash('sha256').update(content).digest('hex');
    
    // Mock signature: hash of (content + privateKey)
    const signatureValue = createHash('sha256')
      .update(hash + privateKey)
      .digest('hex');
    
    // Find key ID
    let keyId = 'unknown';
    for (const [id, kp] of this.keys) {
      if (kp.privateKey === privateKey) {
        keyId = id;
        break;
      }
    }
    
    return {
      value: signatureValue,
      algorithm: 'Ed25519',
      keyId,
      timestamp: Date.now(),
    };
  }
  
  /**
   * Verify a signature
   */
  verify(data: unknown, signature: Signature): SignatureVerificationResult {
    const keyInfo = this.publicKeys.get(signature.keyId);
    
    if (!keyInfo) {
      return { valid: false, reason: 'Unknown key ID' };
    }
    
    if (keyInfo.revoked) {
      return { valid: false, reason: 'Key has been revoked', keyInfo };
    }
    
    if (keyInfo.validUntil && Date.now() > keyInfo.validUntil) {
      return { valid: false, reason: 'Key has expired', keyInfo };
    }
    
    // Find private key to verify (mock implementation)
    const keyPair = this.keys.get(signature.keyId);
    if (!keyPair) {
      return { valid: false, reason: 'Key pair not found' };
    }
    
    const content = JSON.stringify(data);
    const hash = createHash('sha256').update(content).digest('hex');
    const expectedSignature = createHash('sha256')
      .update(hash + keyPair.privateKey)
      .digest('hex');
    
    if (signature.value !== expectedSignature) {
      return { valid: false, reason: 'Signature mismatch', keyInfo };
    }
    
    return { valid: true, keyInfo };
  }
  
  /**
   * Revoke a key
   */
  revokeKey(keyId: string): boolean {
    const keyInfo = this.publicKeys.get(keyId);
    if (!keyInfo) return false;
    
    this.publicKeys.set(keyId, { ...keyInfo, revoked: true });
    return true;
  }
  
  /**
   * Get public key info
   */
  getPublicKeyInfo(keyId: string): PublicKeyInfo | undefined {
    return this.publicKeys.get(keyId);
  }
}

// =============================================================================
// SIGNATURE HELPERS
// =============================================================================

/**
 * Create a signable representation of an event
 */
export function createSignableEventContent(event: {
  type: string;
  aggregateId: string;
  aggregateVersion: number;
  payload: unknown;
  timestamp: number;
}): string {
  return JSON.stringify({
    type: event.type,
    aggregateId: event.aggregateId,
    aggregateVersion: event.aggregateVersion,
    payload: event.payload,
    timestamp: event.timestamp,
  });
}

/**
 * Create a signable representation of a trajectory span
 */
export function createSignableSpanContent(span: {
  entityId: string;
  action: string;
  input: unknown;
  output: unknown;
  timestamp: number;
  previousHash: string;
}): string {
  return JSON.stringify({
    entityId: span.entityId,
    action: span.action,
    input: span.input,
    output: span.output,
    timestamp: span.timestamp,
    previousHash: span.previousHash,
  });
}

// =============================================================================
// SIGNATURE CHAIN
// =============================================================================

export interface SignatureChainEntry {
  readonly index: number;
  readonly data: unknown;
  readonly signature: Signature;
  readonly previousSignature: string;
}

/**
 * Validate a chain of signatures
 */
export function validateSignatureChain(
  chain: SignatureChainEntry[],
  signatureService: MockSignatureService
): { valid: boolean; brokenAt?: number; reason?: string } {
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    
    // Verify signature
    const result = signatureService.verify(entry.data, entry.signature);
    if (!result.valid) {
      return { valid: false, brokenAt: i, reason: result.reason };
    }
    
    // Verify chain linkage
    if (i > 0) {
      const previousEntry = chain[i - 1];
      if (entry.previousSignature !== previousEntry.signature.value) {
        return { valid: false, brokenAt: i, reason: 'Signature chain broken' };
      }
    }
  }
  
  return { valid: true };
}

// =============================================================================
// KEY REGISTRY
// =============================================================================

export class KeyRegistry {
  private keys: Map<string, PublicKeyInfo[]> = new Map();
  
  /**
   * Register a public key for an entity
   */
  registerKey(entityId: string, keyInfo: PublicKeyInfo): void {
    const existing = this.keys.get(entityId) || [];
    existing.push(keyInfo);
    this.keys.set(entityId, existing);
  }
  
  /**
   * Get current valid key for an entity
   */
  getCurrentKey(entityId: string): PublicKeyInfo | undefined {
    const keys = this.keys.get(entityId) || [];
    const now = Date.now();
    
    return keys.find(k => 
      !k.revoked && 
      k.validFrom <= now && 
      (!k.validUntil || k.validUntil > now)
    );
  }
  
  /**
   * Get key valid at a specific time
   */
  getKeyAt(entityId: string, timestamp: Timestamp): PublicKeyInfo | undefined {
    const keys = this.keys.get(entityId) || [];
    
    return keys.find(k => 
      !k.revoked && 
      k.validFrom <= timestamp && 
      (!k.validUntil || k.validUntil > timestamp)
    );
  }
  
  /**
   * Get all keys for an entity
   */
  getAllKeys(entityId: string): PublicKeyInfo[] {
    return this.keys.get(entityId) || [];
  }
  
  /**
   * Revoke all keys for an entity
   */
  revokeAllKeys(entityId: string): number {
    const keys = this.keys.get(entityId) || [];
    let count = 0;
    
    for (const key of keys) {
      if (!key.revoked) {
        (key as { revoked: boolean }).revoked = true;
        count++;
      }
    }
    
    return count;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createSignatureService(): MockSignatureService {
  return new MockSignatureService();
}

export function createKeyRegistry(): KeyRegistry {
  return new KeyRegistry();
}
