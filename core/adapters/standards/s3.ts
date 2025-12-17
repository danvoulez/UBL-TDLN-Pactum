/**
 * S3-COMPATIBLE STORAGE STANDARD
 * 
 * Amazon S3's API has become THE de facto standard for object storage.
 * Many providers offer S3-compatible APIs:
 * 
 * - AWS S3 (the original)
 * - Google Cloud Storage (with S3 compatibility)
 * - Cloudflare R2 (S3-compatible, no egress fees!)
 * - Backblaze B2 (S3-compatible)
 * - MinIO (self-hosted, S3-compatible)
 * - DigitalOcean Spaces
 * - Wasabi
 * - Linode Object Storage
 * 
 * By using S3 API, our document storage works with ANY of these.
 * Switch providers with just a config change.
 */

import type { 
  StorageAdapter, 
  UploadRequest, 
  UploadResult, 
  DownloadResult, 
  StorageObject,
  AdapterConfig,
  AdapterHealth,
} from '../types';
import type { EntityId } from '../../shared/types';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ============================================================================
// S3-COMPATIBLE CONFIGURATION
// ============================================================================

export interface S3CompatibleConfig extends AdapterConfig {
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    /** Session token for temporary credentials */
    sessionToken?: string;
  };
  options: {
    /** Bucket name */
    bucket: string;
    /** Region (required for AWS, optional for others) */
    region?: string;
    /** 
     * Custom endpoint for non-AWS providers:
     * - Cloudflare R2: https://<account_id>.r2.cloudflarestorage.com
     * - Backblaze B2: https://s3.<region>.backblazeb2.com
     * - MinIO: http://localhost:9000
     * - DigitalOcean: https://<region>.digitaloceanspaces.com
     */
    endpoint?: string;
    /** Force path style (required for MinIO and some others) */
    forcePathStyle?: boolean;
    /** Custom domain for public URLs */
    publicUrlBase?: string;
    /** Default ACL for uploads */
    defaultAcl?: 'private' | 'public-read';
    /** Server-side encryption */
    serverSideEncryption?: 'AES256' | 'aws:kms';
    /** KMS key ID (if using aws:kms) */
    kmsKeyId?: string;
  };
}

// ============================================================================
// PROVIDER PRESETS
// ============================================================================

/**
 * Pre-configured settings for popular S3-compatible providers.
 */
export const S3_PROVIDER_PRESETS = {
  /** Amazon S3 */
  aws: (region: string, bucket: string): Partial<S3CompatibleConfig['options']> => ({
    bucket,
    region,
    // AWS S3 uses virtual-hosted style by default
    forcePathStyle: false,
  }),
  
  /** Cloudflare R2 */
  cloudflareR2: (accountId: string, bucket: string): Partial<S3CompatibleConfig['options']> => ({
    bucket,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: 'auto',
    forcePathStyle: true,
  }),
  
  /** Backblaze B2 */
  backblazeB2: (region: string, bucket: string): Partial<S3CompatibleConfig['options']> => ({
    bucket,
    endpoint: `https://s3.${region}.backblazeb2.com`,
    region,
    forcePathStyle: true,
  }),
  
  /** MinIO (self-hosted) */
  minio: (endpoint: string, bucket: string): Partial<S3CompatibleConfig['options']> => ({
    bucket,
    endpoint,
    region: 'us-east-1', // MinIO accepts any region
    forcePathStyle: true,
  }),
  
  /** DigitalOcean Spaces */
  digitalOceanSpaces: (region: string, bucket: string): Partial<S3CompatibleConfig['options']> => ({
    bucket,
    endpoint: `https://${region}.digitaloceanspaces.com`,
    region,
    forcePathStyle: false,
  }),
  
  /** Wasabi */
  wasabi: (region: string, bucket: string): Partial<S3CompatibleConfig['options']> => ({
    bucket,
    endpoint: `https://s3.${region}.wasabisys.com`,
    region,
    forcePathStyle: false,
  }),
  
  /** Google Cloud Storage (S3 compatibility mode) */
  gcsS3Compatible: (bucket: string): Partial<S3CompatibleConfig['options']> => ({
    bucket,
    endpoint: 'https://storage.googleapis.com',
    region: 'auto',
    forcePathStyle: true,
  }),
  
  /** Supabase Storage */
  supabase: (projectRef: string, bucket: string): Partial<S3CompatibleConfig['options']> => ({
    bucket,
    endpoint: `https://${projectRef}.supabase.co/storage/v1/s3`,
    region: 'us-east-1',
    forcePathStyle: true,
  }),
};

// ============================================================================
// S3-COMPATIBLE ADAPTER
// ============================================================================

/**
 * Create an S3-compatible storage adapter.
 * Works with AWS S3, Cloudflare R2, Backblaze B2, MinIO, etc.
 */
export function createS3CompatibleAdapter(
  providerName = 'S3Compatible'
): StorageAdapter {
  let config: S3CompatibleConfig;
  let s3Client: S3Client | null = null;
  
  return {
    name: providerName,
    version: '1.0.0',
    platform: 'S3',
    category: 'Storage',
    
    async initialize(cfg: AdapterConfig): Promise<void> {
      config = cfg as S3CompatibleConfig;
      
      // Initialize S3 client
      // If credentials are empty, AWS SDK will use IAM Role (when running on EC2)
      const s3Config: any = {
        region: config.options.region ?? 'us-east-1',
        endpoint: config.options.endpoint,
        forcePathStyle: config.options.forcePathStyle,
      };
      
      // Only set credentials if they are provided (non-empty)
      if (config.credentials.accessKeyId && config.credentials.secretAccessKey) {
        s3Config.credentials = {
          accessKeyId: config.credentials.accessKeyId,
          secretAccessKey: config.credentials.secretAccessKey,
          sessionToken: config.credentials.sessionToken,
        };
      }
      // Otherwise, AWS SDK will automatically use IAM Role credentials when running on EC2
      
      s3Client = new S3Client(s3Config);
      
      console.log(`S3-compatible adapter initialized for bucket: ${config.options.bucket}${s3Config.credentials ? ' (with explicit credentials)' : ' (using IAM Role)'}`);
    },
    
    async healthCheck(): Promise<AdapterHealth> {
      try {
        if (!s3Client) {
          return {
            healthy: false,
            latencyMs: 0,
            message: 'S3 client not initialized',
          };
        }
        
        const startTime = Date.now();
        await s3Client.send(new HeadBucketCommand({ Bucket: config.options.bucket }));
        const latencyMs = Date.now() - startTime;
        
        return {
          healthy: true,
          latencyMs,
          message: `Connected to bucket: ${config.options.bucket}`,
          details: {
            bucket: config.options.bucket,
            endpoint: config.options.endpoint ?? 'AWS S3',
          },
        };
      } catch (error: any) {
        return {
          healthy: false,
          latencyMs: 0,
          message: `S3 error: ${error.message || error}`,
        };
      }
    },
    
    async shutdown(): Promise<void> {
      if (s3Client) {
        s3Client.destroy();
        s3Client = null;
      }
      console.log('S3-compatible adapter shutdown');
    },
    
    async upload(request: UploadRequest): Promise<UploadResult> {
      if (!s3Client) {
        throw new Error('S3 client not initialized');
      }
      
      const { key, content, contentType, metadata } = request;
      
      // Convert content to Buffer if needed
      let body: Buffer | Uint8Array;
      if (content instanceof Uint8Array) {
        body = Buffer.from(content);
      } else if (typeof content === 'string') {
        body = Buffer.from(content, 'utf-8');
      } else {
        body = content;
      }
      
      const command = new PutObjectCommand({
        Bucket: config.options.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
        ACL: config.options.defaultAcl,
        ServerSideEncryption: config.options.serverSideEncryption,
        SSEKMSKeyId: config.options.kmsKeyId,
      });
      
      const result = await s3Client.send(command);
      const size = body.length;
      
      return {
        key,
        url: buildObjectUrl(config, key),
        size,
        etag: result.ETag || `"${generateMockEtag()}"`,
      };
    },
    
    async download(key: string): Promise<DownloadResult> {
      if (!s3Client) {
        throw new Error('S3 client not initialized');
      }
      
      const command = new GetObjectCommand({
        Bucket: config.options.bucket,
        Key: key,
      });
      
      const result = await s3Client.send(command);
      
      // Convert stream to Uint8Array
      const chunks: Uint8Array[] = [];
      if (result.Body) {
        for await (const chunk of result.Body as any) {
          chunks.push(chunk);
        }
      }
      
      const content = new Uint8Array(
        chunks.reduce((acc, chunk) => acc + chunk.length, 0)
      );
      let offset = 0;
      for (const chunk of chunks) {
        content.set(chunk, offset);
        offset += chunk.length;
      }
      
      return {
        content,
        contentType: result.ContentType || 'application/octet-stream',
        size: content.length,
        metadata: result.Metadata || {},
      };
    },
    
    async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
      if (!s3Client) {
        throw new Error('S3 client not initialized');
      }
      
      const command = new GetObjectCommand({
        Bucket: config.options.bucket,
        Key: key,
      });
      
      return await getSignedUrl(s3Client, command, { expiresIn });
    },
    
    async delete(key: string): Promise<void> {
      if (!s3Client) {
        throw new Error('S3 client not initialized');
      }
      
      const command = new DeleteObjectCommand({
        Bucket: config.options.bucket,
        Key: key,
      });
      
      await s3Client.send(command);
      console.log(`Deleted: ${key}`);
    },
    
    async list(prefix?: string): Promise<readonly StorageObject[]> {
      if (!s3Client) {
        throw new Error('S3 client not initialized');
      }
      
      const command = new ListObjectsV2Command({
        Bucket: config.options.bucket,
        Prefix: prefix,
      });
      
      const result = await s3Client.send(command);
      
      return (result.Contents || []).map(obj => ({
        key: obj.Key || '',
        size: obj.Size || 0,
        lastModified: obj.LastModified?.getTime() || Date.now(),
        etag: obj.ETag || '',
      }));
    },
    
    async exists(key: string): Promise<boolean> {
      if (!s3Client) {
        return false;
      }
      
      try {
        const command = new HeadObjectCommand({
          Bucket: config.options.bucket,
          Key: key,
        });
        await s3Client.send(command);
        return true;
      } catch {
        return false;
      }
    },
  };
}

// ============================================================================
// URL BUILDING
// ============================================================================

function buildObjectUrl(config: S3CompatibleConfig, key: string): string {
  // Use custom public URL if configured
  if (config.options.publicUrlBase) {
    return `${config.options.publicUrlBase}/${key}`;
  }
  
  // Build URL based on endpoint style
  const bucket = config.options.bucket;
  
  if (config.options.endpoint) {
    // Custom endpoint (R2, B2, MinIO, etc.)
    if (config.options.forcePathStyle) {
      return `${config.options.endpoint}/${bucket}/${key}`;
    }
    // Virtual-hosted style for custom endpoint
    const url = new URL(config.options.endpoint);
    return `${url.protocol}//${bucket}.${url.host}/${key}`;
  }
  
  // AWS S3
  const region = config.options.region ?? 'us-east-1';
  if (region === 'us-east-1') {
    return `https://${bucket}.s3.amazonaws.com/${key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

function generateMockEtag(): string {
  return Array.from({ length: 32 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

// ============================================================================
// DOCUMENT STORAGE PATTERNS
// ============================================================================

/**
 * Key patterns for organizing documents in the bucket.
 */
export const DOCUMENT_KEY_PATTERNS = {
  /** By realm and document ID */
  byRealm: (realmId: EntityId, documentId: EntityId, filename: string) =>
    `realms/${realmId}/documents/${documentId}/${filename}`,
  
  /** By agreement */
  byAgreement: (agreementId: EntityId, documentId: EntityId, filename: string) =>
    `agreements/${agreementId}/documents/${documentId}/${filename}`,
  
  /** By entity */
  byEntity: (entityId: EntityId, documentId: EntityId, filename: string) =>
    `entities/${entityId}/documents/${documentId}/${filename}`,
  
  /** Temporary uploads (for processing) */
  temporary: (uploadId: string, filename: string) =>
    `temp/${uploadId}/${filename}`,
  
  /** Archive */
  archive: (year: number, month: number, documentId: EntityId, filename: string) =>
    `archive/${year}/${month.toString().padStart(2, '0')}/${documentId}/${filename}`,
};

/**
 * Content-addressed storage (like IPFS but simpler).
 * Uses content hash as key for deduplication.
 */
export function contentAddressedKey(
  contentHash: string,
  mimeType: string
): string {
  const extension = mimeTypeToExtension(mimeType);
  // First 2 chars as directory (like git objects)
  return `cas/${contentHash.slice(0, 2)}/${contentHash}${extension}`;
}

function mimeTypeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'application/json': '.json',
    'text/plain': '.txt',
    'text/html': '.html',
    'text/markdown': '.md',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  };
  return map[mimeType] ?? '';
}

// ============================================================================
// LIFECYCLE POLICIES
// ============================================================================

/**
 * S3 Lifecycle policy for automatic archival/deletion.
 * This is configured at the bucket level, not in code.
 * These are templates for bucket configuration.
 */
export const LIFECYCLE_POLICIES = {
  /** Move to cheaper storage after 90 days */
  archiveAfter90Days: {
    ID: 'archive-old-documents',
    Status: 'Enabled',
    Filter: { Prefix: 'documents/' },
    Transitions: [
      {
        Days: 90,
        StorageClass: 'GLACIER', // Or 'STANDARD_IA' for less cold
      },
    ],
  },
  
  /** Delete temporary files after 1 day */
  cleanupTemp: {
    ID: 'cleanup-temp',
    Status: 'Enabled',
    Filter: { Prefix: 'temp/' },
    Expiration: { Days: 1 },
  },
  
  /** Delete old versions after 30 days */
  cleanupVersions: {
    ID: 'cleanup-versions',
    Status: 'Enabled',
    NoncurrentVersionExpiration: { NoncurrentDays: 30 },
  },
};

// ============================================================================
// MULTIPART UPLOAD (for large files)
// ============================================================================

export interface MultipartUpload {
  readonly uploadId: string;
  readonly key: string;
  readonly parts: readonly UploadPart[];
}

export interface UploadPart {
  readonly partNumber: number;
  readonly etag: string;
  readonly size: number;
}

/**
 * Multipart upload helper for large files (>5MB recommended).
 */
export async function createMultipartUpload(
  adapter: StorageAdapter,
  key: string,
  contentType: string
): Promise<MultipartUpload> {
  // In real implementation:
  // const command = new CreateMultipartUploadCommand({
  //   Bucket: bucket,
  //   Key: key,
  //   ContentType: contentType,
  // });
  // const result = await s3Client.send(command);
  
  return {
    uploadId: `upload-${Date.now()}`,
    key,
    parts: [],
  };
}

// Minimum part size is 5MB (except last part)
export const MIN_PART_SIZE = 5 * 1024 * 1024;
export const MAX_PART_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
export const MAX_PARTS = 10000;

