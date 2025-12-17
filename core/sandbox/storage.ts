/**
 * WORKSPACE STORAGE INTERFACE
 * 
 * Interface for storing workspace files, functions, and repositories.
 * Implementations can use S3, local filesystem, or other storage backends.
 */

import type { EntityId, Hash } from '../shared/types';
import type { StorageAdapter } from '../adapters/types';

// ============================================================================
// WORKSPACE STORAGE INTERFACE
// ============================================================================

export interface WorkspaceStorage {
  // File operations
  storeFile(
    workspaceId: EntityId,
    fileId: EntityId,
    version: number,
    content: Uint8Array,
    hash: Hash
  ): Promise<string>; // Returns storage location/path
  
  loadFile(storageLocation: string): Promise<Uint8Array>;
  
  // Function storage
  storeFunction(
    workspaceId: EntityId,
    functionId: EntityId,
    code: string
  ): Promise<void>;
  
  loadFunction(
    workspaceId: EntityId,
    functionId: EntityId
  ): Promise<string>;
  
  // Repository storage
  getRepositoryPath(
    workspaceId: EntityId,
    repositoryId: EntityId
  ): Promise<string>;
  
  // Export
  createExport(
    workspaceId: EntityId,
    format: string,
    files: string[]
  ): Promise<string>; // Returns URL
}

// ============================================================================
// WORKSPACE STORAGE IMPLEMENTATION (using StorageAdapter)
// ============================================================================

/**
 * Create a WorkspaceStorage implementation using a StorageAdapter (e.g., S3)
 */
export function createWorkspaceStorageFromAdapter(
  storageAdapter: StorageAdapter
): WorkspaceStorage {
  return {
    async storeFile(
      workspaceId: EntityId,
      fileId: EntityId,
      version: number,
      content: Uint8Array,
      hash: Hash
    ): Promise<string> {
      const key = `workspace-files/${workspaceId}/${fileId}/v${version}`;
      await storageAdapter.upload({
        key,
        content,
        contentType: 'application/octet-stream',
        metadata: {
          workspaceId,
          fileId,
          version: version.toString(),
          hash,
        },
      });
      return key;
    },

    async loadFile(storageLocation: string): Promise<Uint8Array> {
      const result = await storageAdapter.download(storageLocation);
      // result.content is Uint8Array per DownloadResult interface
      return result.content;
    },

    async storeFunction(
      workspaceId: EntityId,
      functionId: EntityId,
      code: string
    ): Promise<void> {
      const key = `workspace-functions/${workspaceId}/${functionId}`;
      await storageAdapter.upload({
        key,
        content: new TextEncoder().encode(code),
        contentType: 'text/plain',
        metadata: {
          workspaceId,
          functionId,
        },
      });
    },

    async loadFunction(
      workspaceId: EntityId,
      functionId: EntityId
    ): Promise<string> {
      const key = `workspace-functions/${workspaceId}/${functionId}`;
      const result = await storageAdapter.download(key);
      // result.content is Uint8Array per DownloadResult interface
      return new TextDecoder().decode(result.content);
    },

    async getRepositoryPath(
      workspaceId: EntityId,
      repositoryId: EntityId
    ): Promise<string> {
      // For now, return a path. In a real implementation, this might
      // create a local directory or return an S3 path
      return `workspace-repos/${workspaceId}/${repositoryId}`;
    },

    async createExport(
      workspaceId: EntityId,
      format: string,
      files: string[]
    ): Promise<string> {
      // For now, return a placeholder URL
      // In a real implementation, this would create a zip/tar/json file
      // and upload it to S3, then return a signed URL
      const exportKey = `workspace-exports/${workspaceId}/${Date.now()}.${format}`;
      const url = await storageAdapter.getSignedUrl(exportKey, 3600); // 1 hour expiry
      return url;
    },
  };
}


