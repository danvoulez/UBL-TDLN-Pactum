/**
 * ATTACHMENTS - Files, Documents & Digital Signatures
 * 
 * Agreements often have attached documents:
 * - Contract PDFs
 * - Identity documents
 * - Proof of delivery
 * - Supporting evidence
 * 
 * Documents are:
 * - Immutable (like events)
 * - Versioned (new version = new document)
 * - Signed (digital signatures for non-repudiation)
 * - Content-addressed (hash = identity)
 */

import type { EntityId, Timestamp, ActorReference, Hash } from '../shared/types';

// ============================================================================
// DOCUMENTS
// ============================================================================

/**
 * A Document is an immutable file attached to the ledger.
 */
export interface Document {
  readonly id: EntityId;
  
  /** Content-addressed hash (SHA-256 of content) */
  readonly contentHash: Hash;
  
  /** File metadata */
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  
  /** Semantic metadata */
  readonly documentType: DocumentType;
  readonly title?: string;
  readonly description?: string;
  
  /** Where is this document stored? */
  readonly storage: StorageReference;
  
  /** Upload info */
  readonly uploadedAt: Timestamp;
  readonly uploadedBy: ActorReference;
  
  /** What is this document attached to? */
  readonly attachedTo: readonly DocumentAttachment[];
  
  /** Digital signatures on this document */
  readonly signatures: readonly DocumentSignature[];
  
  /** Access control */
  readonly visibility: DocumentVisibility;
  
  /** Version info (if this is a revision) */
  readonly version: number;
  readonly previousVersionId?: EntityId;
}

export type DocumentType =
  | 'Contract'           // The agreement document itself
  | 'Amendment'          // Amendment to an agreement
  | 'Identity'           // ID document (passport, license)
  | 'Proof'              // Proof of something (delivery, payment)
  | 'Evidence'           // Supporting evidence
  | 'Certificate'        // Certificate (incorporation, compliance)
  | 'Invoice'            // Invoice/receipt
  | 'Report'             // Generated report
  | 'Communication'      // Emails, letters
  | 'Other';

export interface StorageReference {
  /** Storage backend */
  readonly backend: 'S3' | 'GCS' | 'Azure' | 'Local' | 'IPFS';
  
  /** Backend-specific location */
  readonly location: string;
  
  /** Encryption info */
  readonly encrypted: boolean;
  readonly encryptionKeyId?: string;
}

export interface DocumentAttachment {
  /** What is this attached to? */
  readonly entityType: 'Agreement' | 'Entity' | 'Asset' | 'Obligation' | 'Event';
  readonly entityId: EntityId;
  
  /** Role of this document */
  readonly role: string; // 'MainContract', 'Exhibit A', 'ProofOfPayment', etc.
  
  /** When was it attached? */
  readonly attachedAt: Timestamp;
  readonly attachedBy: ActorReference;
}

export type DocumentVisibility =
  | { readonly type: 'Public' }
  | { readonly type: 'Realm'; readonly realmId: EntityId }
  | { readonly type: 'Parties'; readonly partyIds: readonly EntityId[] }
  | { readonly type: 'Private'; readonly ownerId: EntityId };

// ============================================================================
// DIGITAL SIGNATURES
// ============================================================================

/**
 * A cryptographic signature on a document.
 */
export interface DocumentSignature {
  readonly id: EntityId;
  readonly documentId: EntityId;
  
  /** Who signed */
  readonly signerId: EntityId;
  readonly signerName: string;
  
  /** Signature data */
  readonly algorithm: SignatureAlgorithm;
  readonly publicKey: string;
  readonly signature: string;
  
  /** What was signed (hash of document + timestamp) */
  readonly signedHash: Hash;
  readonly timestamp: Timestamp;
  
  /** Signature meaning */
  readonly purpose: SignaturePurpose;
  readonly statement?: string; // Optional statement like "I agree to the terms"
  
  /** Verification */
  readonly verified: boolean;
  readonly verifiedAt?: Timestamp;
  readonly certificate?: SignatureCertificate;
}

export type SignatureAlgorithm =
  | 'RSA-SHA256'
  | 'ECDSA-P256'
  | 'Ed25519';

export type SignaturePurpose =
  | 'Consent'        // Agreeing to terms
  | 'Witness'        // Witnessing a document
  | 'Notarization'   // Notary signature
  | 'Approval'       // Approving content
  | 'Certification'  // Certifying accuracy
  | 'Receipt';       // Acknowledging receipt

export interface SignatureCertificate {
  readonly issuer: string;
  readonly subject: string;
  readonly validFrom: Timestamp;
  readonly validUntil: Timestamp;
  readonly serialNumber: string;
}

// ============================================================================
// DOCUMENT STORE
// ============================================================================

/**
 * Document store handles document storage and retrieval.
 */
export interface DocumentStore {
  /** Upload a document */
  upload(
    content: Uint8Array | ReadableStream,
    metadata: DocumentMetadata,
    actor: ActorReference
  ): Promise<Document>;
  
  /** Get document metadata */
  getMetadata(documentId: EntityId): Promise<Document | null>;
  
  /** Get document content */
  getContent(documentId: EntityId): Promise<Uint8Array | null>;
  
  /** Get content as stream (for large files) */
  getContentStream(documentId: EntityId): Promise<ReadableStream | null>;
  
  /** Get download URL (pre-signed, time-limited) */
  getDownloadUrl(documentId: EntityId, expiresIn?: number): Promise<string>;
  
  /** Attach document to an entity */
  attach(documentId: EntityId, attachment: Omit<DocumentAttachment, 'attachedAt'>): Promise<void>;
  
  /** Detach document from an entity */
  detach(documentId: EntityId, entityType: string, entityId: EntityId): Promise<void>;
  
  /** Get documents attached to an entity */
  getAttachedDocuments(entityType: string, entityId: EntityId): Promise<readonly Document[]>;
  
  /** Create a new version of a document */
  createVersion(
    previousDocumentId: EntityId,
    content: Uint8Array | ReadableStream,
    metadata: Partial<DocumentMetadata>,
    actor: ActorReference
  ): Promise<Document>;
  
  /** Get version history */
  getVersionHistory(documentId: EntityId): Promise<readonly Document[]>;
}

export interface DocumentMetadata {
  readonly filename: string;
  readonly mimeType: string;
  readonly documentType: DocumentType;
  readonly title?: string;
  readonly description?: string;
  readonly visibility: DocumentVisibility;
}

// ============================================================================
// SIGNATURE SERVICE
// ============================================================================

/**
 * Signature service handles digital signature operations.
 */
export interface SignatureService {
  /** Sign a document */
  sign(
    documentId: EntityId,
    signerId: EntityId,
    purpose: SignaturePurpose,
    privateKey: string, // Or key reference
    statement?: string
  ): Promise<DocumentSignature>;
  
  /** Verify a signature */
  verify(signatureId: EntityId): Promise<SignatureVerificationResult>;
  
  /** Verify all signatures on a document */
  verifyDocument(documentId: EntityId): Promise<DocumentVerificationResult>;
  
  /** Get signatures for a document */
  getSignatures(documentId: EntityId): Promise<readonly DocumentSignature[]>;
  
  /** Get documents signed by an entity */
  getSignedBy(signerId: EntityId): Promise<readonly Document[]>;
  
  /** Request signature from another party */
  requestSignature(request: SignatureRequest): Promise<SignatureRequestRecord>;
  
  /** Get pending signature requests */
  getPendingRequests(signerId: EntityId): Promise<readonly SignatureRequestRecord[]>;
}

export interface SignatureVerificationResult {
  readonly signatureId: EntityId;
  readonly valid: boolean;
  readonly reason?: string;
  readonly verifiedAt: Timestamp;
  readonly certificateValid?: boolean;
  readonly certificateExpired?: boolean;
}

export interface DocumentVerificationResult {
  readonly documentId: EntityId;
  readonly allValid: boolean;
  readonly signatures: readonly SignatureVerificationResult[];
  readonly verifiedAt: Timestamp;
}

export interface SignatureRequest {
  readonly documentId: EntityId;
  readonly requestedSignerId: EntityId;
  readonly purpose: SignaturePurpose;
  readonly requestedBy: ActorReference;
  readonly deadline?: Timestamp;
  readonly message?: string;
}

export interface SignatureRequestRecord extends SignatureRequest {
  readonly id: EntityId;
  readonly status: 'Pending' | 'Signed' | 'Declined' | 'Expired';
  readonly createdAt: Timestamp;
  readonly respondedAt?: Timestamp;
  readonly signatureId?: EntityId;
  readonly declineReason?: string;
}

// ============================================================================
// DOCUMENT TEMPLATES
// ============================================================================

/**
 * Templates for generating documents from agreements.
 */
export interface DocumentTemplate {
  readonly id: EntityId;
  readonly name: string;
  readonly description?: string;
  
  /** Template format */
  readonly format: 'Markdown' | 'HTML' | 'DOCX' | 'PDF';
  
  /** Template content (with placeholders) */
  readonly content: string;
  
  /** Expected variables */
  readonly variables: readonly TemplateVariable[];
  
  /** What agreement types can use this template? */
  readonly forAgreementTypes?: readonly string[];
  
  /** Version */
  readonly version: number;
  readonly createdAt: Timestamp;
}

export interface TemplateVariable {
  readonly name: string;
  readonly type: 'string' | 'number' | 'date' | 'boolean' | 'entity' | 'list';
  readonly required: boolean;
  readonly description?: string;
  readonly defaultValue?: unknown;
}

/**
 * Document generator creates documents from templates and data.
 */
export interface DocumentGenerator {
  /** Generate a document from a template */
  generate(
    templateId: EntityId,
    variables: Record<string, unknown>,
    outputFormat: 'PDF' | 'DOCX' | 'HTML',
    actor: ActorReference
  ): Promise<Document>;
  
  /** Preview generated content (without saving) */
  preview(
    templateId: EntityId,
    variables: Record<string, unknown>
  ): Promise<string>;
  
  /** Get available templates */
  getTemplates(agreementType?: string): Promise<readonly DocumentTemplate[]>;
  
  /** Validate variables against template */
  validateVariables(
    templateId: EntityId,
    variables: Record<string, unknown>
  ): Promise<ValidationResult>;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly { field: string; message: string }[];
  readonly warnings: readonly { field: string; message: string }[];
}

