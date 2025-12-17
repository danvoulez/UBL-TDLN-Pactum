/**
 * UNIVERSAL INTEROPERABILITY STANDARD (UIS) 1.0
 * 
 * SPRINT E.2: Cross-realm interoperability protocol
 * 
 * Purpose:
 * - Enable communication between independent realms
 * - Standardize message formats and protocols
 * - Support federated ledger operations
 * - Maintain sovereignty while enabling cooperation
 * 
 * Principles:
 * - Realms are sovereign - no forced compliance
 * - Explicit trust relationships
 * - Cryptographic verification
 * - Eventual consistency across realms
 */

import type { EntityId, Timestamp } from '../shared/types';

// =============================================================================
// TYPES
// =============================================================================

export interface UISConfig {
  /** This realm's unique identifier */
  readonly realmId: EntityId;
  
  /** This realm's public key for verification */
  readonly publicKey: string;
  
  /** Trusted realms and their public keys */
  readonly trustedRealms: Map<EntityId, TrustedRealm>;
  
  /** Message TTL (ms) */
  readonly messageTTL: number;
  
  /** Maximum message size (bytes) */
  readonly maxMessageSize: number;
  
  /** Retry configuration */
  readonly retryConfig: RetryConfig;
}

export interface TrustedRealm {
  readonly realmId: EntityId;
  readonly name: string;
  readonly publicKey: string;
  readonly endpoint: string;
  readonly trustLevel: TrustLevel;
  readonly establishedAt: Timestamp;
  readonly capabilities: readonly RealmCapability[];
}

export type TrustLevel = 
  | 'Full'        // Complete trust - all operations allowed
  | 'Verified'    // Verified identity - most operations
  | 'Limited'     // Limited trust - read-only mostly
  | 'Untrusted';  // No trust - only public data

export type RealmCapability =
  | 'EntityTransfer'    // Can transfer entities between realms
  | 'AssetTransfer'     // Can transfer assets
  | 'CreditTransfer'    // Can transfer credits
  | 'MessageRelay'      // Can relay messages
  | 'EventSync'         // Can sync events
  | 'QueryProxy';       // Can proxy queries

export interface RetryConfig {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
}

// =============================================================================
// MESSAGES
// =============================================================================

export interface UISMessage {
  readonly id: string;
  readonly version: '1.0';
  readonly type: MessageType;
  readonly sourceRealm: EntityId;
  readonly targetRealm: EntityId;
  readonly timestamp: Timestamp;
  readonly expiresAt: Timestamp;
  readonly payload: MessagePayload;
  readonly signature: string;
  readonly correlationId?: string;
  readonly replyTo?: string;
}

export type MessageType =
  | 'Handshake'
  | 'HandshakeAck'
  | 'EntityTransfer'
  | 'EntityTransferAck'
  | 'AssetTransfer'
  | 'AssetTransferAck'
  | 'CreditTransfer'
  | 'CreditTransferAck'
  | 'Query'
  | 'QueryResponse'
  | 'EventBroadcast'
  | 'Ping'
  | 'Pong'
  | 'Error';

export type MessagePayload =
  | HandshakePayload
  | EntityTransferPayload
  | AssetTransferPayload
  | CreditTransferPayload
  | QueryPayload
  | EventBroadcastPayload
  | ErrorPayload
  | { type: 'Ping' | 'Pong' | 'Ack' };

export interface HandshakePayload {
  readonly type: 'Handshake';
  readonly realmName: string;
  readonly publicKey: string;
  readonly capabilities: readonly RealmCapability[];
  readonly protocolVersion: string;
}

export interface EntityTransferPayload {
  readonly type: 'EntityTransfer';
  readonly entityId: EntityId;
  readonly entityType: string;
  readonly entityData: Record<string, unknown>;
  readonly transferReason: string;
  readonly sourceAgreementId?: EntityId;
}

export interface AssetTransferPayload {
  readonly type: 'AssetTransfer';
  readonly assetId: EntityId;
  readonly assetType: string;
  readonly assetData: Record<string, unknown>;
  readonly fromOwner: EntityId;
  readonly toOwner: EntityId;
  readonly transferReason: string;
}

export interface CreditTransferPayload {
  readonly type: 'CreditTransfer';
  readonly amount: bigint;
  readonly currency: string;
  readonly fromWallet: EntityId;
  readonly toWallet: EntityId;
  readonly memo?: string;
}

export interface QueryPayload {
  readonly type: 'Query';
  readonly queryType: 'Entity' | 'Asset' | 'Balance' | 'History';
  readonly targetId: EntityId;
  readonly filters?: Record<string, unknown>;
}

export interface EventBroadcastPayload {
  readonly type: 'EventBroadcast';
  readonly eventType: string;
  readonly eventData: Record<string, unknown>;
  readonly scope: 'Public' | 'Trusted' | 'Bilateral';
}

export interface ErrorPayload {
  readonly type: 'Error';
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

// =============================================================================
// TRANSFER STATES
// =============================================================================

export interface CrossRealmTransfer {
  readonly id: string;
  readonly type: 'Entity' | 'Asset' | 'Credit';
  readonly sourceRealm: EntityId;
  readonly targetRealm: EntityId;
  readonly status: TransferStatus;
  readonly initiatedAt: Timestamp;
  readonly completedAt?: Timestamp;
  readonly payload: EntityTransferPayload | AssetTransferPayload | CreditTransferPayload;
  readonly messages: readonly UISMessage[];
  readonly error?: string;
}

export type TransferStatus =
  | 'Initiated'
  | 'Pending'
  | 'AwaitingAck'
  | 'Confirmed'
  | 'Completed'
  | 'Failed'
  | 'Cancelled'
  | 'Expired';

// =============================================================================
// UIS GATEWAY
// =============================================================================

export class UISGateway {
  private trustedRealms = new Map<EntityId, TrustedRealm>();
  private pendingTransfers = new Map<string, CrossRealmTransfer>();
  private messageLog: UISMessage[] = [];
  private idCounter = 0;
  
  constructor(private readonly config: UISConfig) {
    // Initialize trusted realms from config
    for (const [id, realm] of config.trustedRealms) {
      this.trustedRealms.set(id, realm);
    }
  }
  
  // ---------------------------------------------------------------------------
  // TRUST MANAGEMENT
  // ---------------------------------------------------------------------------
  
  /**
   * Establish trust with another realm
   */
  establishTrust(realm: TrustedRealm): void {
    if (this.trustedRealms.has(realm.realmId)) {
      throw new Error(`Realm already trusted: ${realm.realmId}`);
    }
    this.trustedRealms.set(realm.realmId, realm);
  }
  
  /**
   * Revoke trust from a realm
   */
  revokeTrust(realmId: EntityId): void {
    if (!this.trustedRealms.has(realmId)) {
      throw new Error(`Realm not trusted: ${realmId}`);
    }
    this.trustedRealms.delete(realmId);
  }
  
  /**
   * Update trust level
   */
  updateTrustLevel(realmId: EntityId, trustLevel: TrustLevel): void {
    const realm = this.trustedRealms.get(realmId);
    if (!realm) throw new Error(`Realm not trusted: ${realmId}`);
    
    this.trustedRealms.set(realmId, { ...realm, trustLevel });
  }
  
  /**
   * Check if realm is trusted
   */
  isTrusted(realmId: EntityId): boolean {
    return this.trustedRealms.has(realmId);
  }
  
  /**
   * Get trust level for realm
   */
  getTrustLevel(realmId: EntityId): TrustLevel {
    return this.trustedRealms.get(realmId)?.trustLevel ?? 'Untrusted';
  }
  
  // ---------------------------------------------------------------------------
  // MESSAGE HANDLING
  // ---------------------------------------------------------------------------
  
  /**
   * Create a new message
   */
  createMessage(
    type: MessageType,
    targetRealm: EntityId,
    payload: MessagePayload,
    correlationId?: string
  ): UISMessage {
    const now = Date.now();
    
    const message: UISMessage = {
      id: `msg-${++this.idCounter}-${now}`,
      version: '1.0',
      type,
      sourceRealm: this.config.realmId,
      targetRealm,
      timestamp: now,
      expiresAt: now + this.config.messageTTL,
      payload,
      signature: this.sign(payload),
      correlationId,
    };
    
    this.messageLog.push(message);
    return message;
  }
  
  /**
   * Verify a received message
   */
  verifyMessage(message: UISMessage): boolean {
    // Check expiration
    if (message.expiresAt < Date.now()) {
      return false;
    }
    
    // Check source realm trust
    if (!this.isTrusted(message.sourceRealm)) {
      return false;
    }
    
    // Verify signature (simplified)
    return this.verifySignature(message.payload, message.signature, message.sourceRealm);
  }
  
  /**
   * Process incoming message
   */
  async processMessage(message: UISMessage): Promise<UISMessage | null> {
    if (!this.verifyMessage(message)) {
      return this.createMessage('Error', message.sourceRealm, {
        type: 'Error',
        code: 'INVALID_MESSAGE',
        message: 'Message verification failed',
      }, message.id);
    }
    
    switch (message.type) {
      case 'Handshake':
        return this.handleHandshake(message);
      case 'EntityTransfer':
        return this.handleEntityTransfer(message);
      case 'AssetTransfer':
        return this.handleAssetTransfer(message);
      case 'CreditTransfer':
        return this.handleCreditTransfer(message);
      case 'Query':
        return this.handleQuery(message);
      case 'Ping':
        return this.createMessage('Pong', message.sourceRealm, { type: 'Pong' }, message.id);
      default:
        return null;
    }
  }
  
  private handleHandshake(message: UISMessage): UISMessage {
    const payload = message.payload as HandshakePayload;
    
    // Auto-establish limited trust for handshake
    if (!this.isTrusted(message.sourceRealm)) {
      this.establishTrust({
        realmId: message.sourceRealm,
        name: payload.realmName,
        publicKey: payload.publicKey,
        endpoint: '', // Would come from transport layer
        trustLevel: 'Limited',
        establishedAt: Date.now(),
        capabilities: payload.capabilities,
      });
    }
    
    return this.createMessage('HandshakeAck', message.sourceRealm, {
      type: 'Handshake',
      realmName: 'This Realm', // Would come from config
      publicKey: this.config.publicKey,
      capabilities: ['EntityTransfer', 'AssetTransfer', 'CreditTransfer', 'QueryProxy'],
      protocolVersion: '1.0',
    }, message.id);
  }
  
  private handleEntityTransfer(message: UISMessage): UISMessage {
    const payload = message.payload as EntityTransferPayload;
    
    // Check capability
    const trustLevel = this.getTrustLevel(message.sourceRealm);
    if (trustLevel === 'Untrusted' || trustLevel === 'Limited') {
      return this.createMessage('Error', message.sourceRealm, {
        type: 'Error',
        code: 'INSUFFICIENT_TRUST',
        message: 'Entity transfer requires Verified or Full trust',
      }, message.id);
    }
    
    // Record transfer
    const transfer: CrossRealmTransfer = {
      id: `transfer-${++this.idCounter}`,
      type: 'Entity',
      sourceRealm: message.sourceRealm,
      targetRealm: this.config.realmId,
      status: 'Confirmed',
      initiatedAt: message.timestamp,
      completedAt: Date.now(),
      payload,
      messages: [message],
    };
    this.pendingTransfers.set(transfer.id, transfer);
    
    return this.createMessage('EntityTransferAck', message.sourceRealm, {
      type: 'Ack',
    }, message.id);
  }
  
  private handleAssetTransfer(message: UISMessage): UISMessage {
    const payload = message.payload as AssetTransferPayload;
    
    const trustLevel = this.getTrustLevel(message.sourceRealm);
    if (trustLevel === 'Untrusted' || trustLevel === 'Limited') {
      return this.createMessage('Error', message.sourceRealm, {
        type: 'Error',
        code: 'INSUFFICIENT_TRUST',
        message: 'Asset transfer requires Verified or Full trust',
      }, message.id);
    }
    
    const transfer: CrossRealmTransfer = {
      id: `transfer-${++this.idCounter}`,
      type: 'Asset',
      sourceRealm: message.sourceRealm,
      targetRealm: this.config.realmId,
      status: 'Confirmed',
      initiatedAt: message.timestamp,
      completedAt: Date.now(),
      payload,
      messages: [message],
    };
    this.pendingTransfers.set(transfer.id, transfer);
    
    return this.createMessage('AssetTransferAck', message.sourceRealm, {
      type: 'Ack',
    }, message.id);
  }
  
  private handleCreditTransfer(message: UISMessage): UISMessage {
    const payload = message.payload as CreditTransferPayload;
    
    const trustLevel = this.getTrustLevel(message.sourceRealm);
    if (trustLevel !== 'Full') {
      return this.createMessage('Error', message.sourceRealm, {
        type: 'Error',
        code: 'INSUFFICIENT_TRUST',
        message: 'Credit transfer requires Full trust',
      }, message.id);
    }
    
    const transfer: CrossRealmTransfer = {
      id: `transfer-${++this.idCounter}`,
      type: 'Credit',
      sourceRealm: message.sourceRealm,
      targetRealm: this.config.realmId,
      status: 'Confirmed',
      initiatedAt: message.timestamp,
      completedAt: Date.now(),
      payload,
      messages: [message],
    };
    this.pendingTransfers.set(transfer.id, transfer);
    
    return this.createMessage('CreditTransferAck', message.sourceRealm, {
      type: 'Ack',
    }, message.id);
  }
  
  private handleQuery(message: UISMessage): UISMessage {
    const payload = message.payload as QueryPayload;
    
    // Simplified query response
    return this.createMessage('QueryResponse', message.sourceRealm, {
      type: 'Ack', // Would contain actual query results
    }, message.id);
  }
  
  // ---------------------------------------------------------------------------
  // TRANSFER OPERATIONS
  // ---------------------------------------------------------------------------
  
  /**
   * Initiate entity transfer to another realm
   */
  initiateEntityTransfer(
    targetRealm: EntityId,
    entityId: EntityId,
    entityType: string,
    entityData: Record<string, unknown>,
    reason: string
  ): CrossRealmTransfer {
    if (!this.isTrusted(targetRealm)) {
      throw new Error(`Target realm not trusted: ${targetRealm}`);
    }
    
    const payload: EntityTransferPayload = {
      type: 'EntityTransfer',
      entityId,
      entityType,
      entityData,
      transferReason: reason,
    };
    
    const message = this.createMessage('EntityTransfer', targetRealm, payload);
    
    const transfer: CrossRealmTransfer = {
      id: `transfer-${++this.idCounter}`,
      type: 'Entity',
      sourceRealm: this.config.realmId,
      targetRealm,
      status: 'Initiated',
      initiatedAt: Date.now(),
      payload,
      messages: [message],
    };
    
    this.pendingTransfers.set(transfer.id, transfer);
    return transfer;
  }
  
  /**
   * Initiate credit transfer to another realm
   */
  initiateCreditTransfer(
    targetRealm: EntityId,
    amount: bigint,
    currency: string,
    fromWallet: EntityId,
    toWallet: EntityId,
    memo?: string
  ): CrossRealmTransfer {
    if (this.getTrustLevel(targetRealm) !== 'Full') {
      throw new Error('Credit transfer requires Full trust');
    }
    
    const payload: CreditTransferPayload = {
      type: 'CreditTransfer',
      amount,
      currency,
      fromWallet,
      toWallet,
      memo,
    };
    
    const message = this.createMessage('CreditTransfer', targetRealm, payload);
    
    const transfer: CrossRealmTransfer = {
      id: `transfer-${++this.idCounter}`,
      type: 'Credit',
      sourceRealm: this.config.realmId,
      targetRealm,
      status: 'Initiated',
      initiatedAt: Date.now(),
      payload,
      messages: [message],
    };
    
    this.pendingTransfers.set(transfer.id, transfer);
    return transfer;
  }
  
  // ---------------------------------------------------------------------------
  // CRYPTOGRAPHY (SIMPLIFIED)
  // ---------------------------------------------------------------------------
  
  private sign(payload: MessagePayload): string {
    // Simplified signing - would use actual crypto in production
    const data = JSON.stringify(payload);
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `sig-${hash.toString(16)}-${this.config.realmId}`;
  }
  
  private verifySignature(payload: MessagePayload, signature: string, sourceRealm: EntityId): boolean {
    // Simplified verification - would use actual crypto in production
    const realm = this.trustedRealms.get(sourceRealm);
    if (!realm) return false;
    
    // Just check signature format for now
    return signature.startsWith('sig-') && signature.includes(sourceRealm as string);
  }
  
  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------
  
  /**
   * Get all trusted realms
   */
  getTrustedRealms(): readonly TrustedRealm[] {
    return Array.from(this.trustedRealms.values());
  }
  
  /**
   * Get pending transfers
   */
  getPendingTransfers(): readonly CrossRealmTransfer[] {
    return Array.from(this.pendingTransfers.values())
      .filter(t => t.status === 'Initiated' || t.status === 'Pending' || t.status === 'AwaitingAck');
  }
  
  /**
   * Get transfer by ID
   */
  getTransfer(transferId: string): CrossRealmTransfer | undefined {
    return this.pendingTransfers.get(transferId);
  }
  
  /**
   * Get message log
   */
  getMessageLog(limit: number = 100): readonly UISMessage[] {
    return this.messageLog.slice(-limit);
  }
  
  /**
   * Get statistics
   */
  getStats(): UISStats {
    const transfers = Array.from(this.pendingTransfers.values());
    
    return {
      trustedRealms: this.trustedRealms.size,
      totalMessages: this.messageLog.length,
      totalTransfers: transfers.length,
      completedTransfers: transfers.filter(t => t.status === 'Completed' || t.status === 'Confirmed').length,
      failedTransfers: transfers.filter(t => t.status === 'Failed').length,
      pendingTransfers: transfers.filter(t => 
        t.status === 'Initiated' || t.status === 'Pending' || t.status === 'AwaitingAck'
      ).length,
    };
  }
}

export interface UISStats {
  trustedRealms: number;
  totalMessages: number;
  totalTransfers: number;
  completedTransfers: number;
  failedTransfers: number;
  pendingTransfers: number;
}

// =============================================================================
// FACTORY
// =============================================================================

export function createUISGateway(config?: Partial<UISConfig>): UISGateway {
  const defaultConfig: UISConfig = {
    realmId: 'default-realm' as EntityId,
    publicKey: 'default-public-key',
    trustedRealms: new Map(),
    messageTTL: 60 * 60 * 1000, // 1 hour
    maxMessageSize: 1024 * 1024, // 1MB
    retryConfig: {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    },
  };
  
  return new UISGateway({ ...defaultConfig, ...config });
}
