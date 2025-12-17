/**
 * Workspace Projection
 * 
 * Read-optimized view for workspace state, built from events.
 * This projection maintains denormalized workspace data for fast queries.
 */

import { Event, EventStore, SequenceNumber } from './event-store';
import type { Pool } from 'pg';

export interface WorkspaceProjectionRow {
  id: string;
  realm_id: string;
  name: string;
  description?: string;
  runtime: string;
  resources: Record<string, unknown>;
  status: 'Active' | 'Suspended' | 'Archived';
  version: number;
  created_at: number;
  created_by: Record<string, unknown>;
  last_activity_at: number;
  repositories: Array<Record<string, unknown>>;
  files: Array<Record<string, unknown>>;
  functions: string[];
  updated_at: number;
}

export interface WorkspaceProjectionConfig {
  db: Pool;
  eventStore: EventStore;
}

/**
 * Workspace Projection Handler
 * 
 * Processes workspace-related events to maintain the workspace_projection table.
 */
export class WorkspaceProjection {
  private db: Pool;
  private eventStore: EventStore;
  private projectionName = 'workspaces';

  constructor(config: WorkspaceProjectionConfig) {
    this.db = config.db;
    this.eventStore = config.eventStore;
  }

  /**
   * Get the last processed sequence number
   */
  async getCheckpoint(): Promise<SequenceNumber> {
    const result = await this.db.query(
      'SELECT last_sequence FROM projection_checkpoints WHERE projection_name = $1',
      [this.projectionName]
    );
    
    if (result.rows.length === 0) {
      return 1; // Start from genesis event
    }
    
    return BigInt(result.rows[0].last_sequence);
  }

  /**
   * Update the checkpoint
   */
  private async updateCheckpoint(sequence: SequenceNumber): Promise<void> {
    await this.db.query(
      `INSERT INTO projection_checkpoints (projection_name, last_sequence, last_updated)
       VALUES ($1, $2, NOW())
       ON CONFLICT (projection_name)
       DO UPDATE SET last_sequence = $2, last_updated = NOW()`,
      [this.projectionName, sequence.toString()]
    );
  }

  /**
   * Process a single event
   */
  async handle(event: Event): Promise<void> {
    switch (event.type) {
      case 'WorkspaceCreated':
        await this.handleWorkspaceCreated(event);
        break;
      case 'FileUploaded':
        await this.handleFileUploaded(event);
        break;
      case 'FileModified':
        await this.handleFileModified(event);
        break;
      case 'FileDeleted':
        await this.handleFileDeleted(event);
        break;
      case 'FunctionRegistered':
        await this.handleFunctionRegistered(event);
        break;
      case 'FunctionExecuted':
        await this.handleFunctionExecuted(event);
        break;
      // Ignore other events
    }
  }

  /**
   * Handle WorkspaceCreated event
   */
  private async handleWorkspaceCreated(event: Event & { type: 'WorkspaceCreated' }): Promise<void> {
    const payload = event.payload as {
      workspaceId: string;
      realmId: string;
      name: string;
      description?: string;
      runtime: string;
      resources: Record<string, unknown>;
      ownerId: string;
    };

    await this.db.query(
      `INSERT INTO workspace_projection (
        id, realm_id, name, description, runtime, resources, status,
        version, created_at, created_by, last_activity_at,
        repositories, files, functions, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        runtime = EXCLUDED.runtime,
        resources = EXCLUDED.resources,
        version = EXCLUDED.version,
        updated_at = EXCLUDED.updated_at`,
      [
        payload.workspaceId,
        payload.realmId,
        payload.name,
        payload.description || null,
        payload.runtime,
        JSON.stringify(payload.resources),
        'Active',
        event.aggregateVersion,
        event.timestamp,
        JSON.stringify({ type: 'Entity', entityId: payload.ownerId }),
        event.timestamp,
        '[]',
        '[]',
        '{}',
        event.timestamp,
      ]
    );
  }

  /**
   * Handle FileUploaded event
   */
  private async handleFileUploaded(event: Event & { type: 'FileUploaded' }): Promise<void> {
    const payload = event.payload as {
      workspaceId: string;
      fileId: string;
      path: string;
      size: number;
      mimeType?: string;
    };

    // Get current workspace state
    const workspaceResult = await this.db.query(
      'SELECT files, version FROM workspace_projection WHERE id = $1',
      [payload.workspaceId]
    );

    if (workspaceResult.rows.length === 0) {
      // Workspace not found, skip
      return;
    }

    const currentFiles = workspaceResult.rows[0].files || [];
    const currentVersion = workspaceResult.rows[0].version;

    // Add new file
    const updatedFiles = [
      ...currentFiles,
      {
        id: payload.fileId,
        path: payload.path,
        size: payload.size,
        mimeType: payload.mimeType,
        uploadedAt: event.timestamp,
      },
    ];

    await this.db.query(
      `UPDATE workspace_projection
       SET files = $1, last_activity_at = $2, updated_at = $3, version = $4
       WHERE id = $5`,
      [
        JSON.stringify(updatedFiles),
        event.timestamp,
        event.timestamp,
        currentVersion + 1,
        payload.workspaceId,
      ]
    );
  }

  /**
   * Handle FileModified event
   */
  private async handleFileModified(event: Event & { type: 'FileModified' }): Promise<void> {
    const payload = event.payload as {
      workspaceId: string;
      fileId: string;
      path?: string;
      size?: number;
      mimeType?: string;
    };

    const workspaceResult = await this.db.query(
      'SELECT files, version FROM workspace_projection WHERE id = $1',
      [payload.workspaceId]
    );

    if (workspaceResult.rows.length === 0) {
      return;
    }

    const currentFiles = workspaceResult.rows[0].files || [];
    const currentVersion = workspaceResult.rows[0].version;

    // Update file in array
    const updatedFiles = currentFiles.map((file: Record<string, unknown>) => {
      if (file.id === payload.fileId) {
        return {
          ...file,
          path: payload.path ?? file.path,
          size: payload.size ?? file.size,
          mimeType: payload.mimeType ?? file.mimeType,
          modifiedAt: event.timestamp,
        };
      }
      return file;
    });

    await this.db.query(
      `UPDATE workspace_projection
       SET files = $1, last_activity_at = $2, updated_at = $3, version = $4
       WHERE id = $5`,
      [
        JSON.stringify(updatedFiles),
        event.timestamp,
        event.timestamp,
        currentVersion + 1,
        payload.workspaceId,
      ]
    );
  }

  /**
   * Handle FileDeleted event
   */
  private async handleFileDeleted(event: Event & { type: 'FileDeleted' }): Promise<void> {
    const payload = event.payload as {
      workspaceId: string;
      fileId: string;
    };

    const workspaceResult = await this.db.query(
      'SELECT files, version FROM workspace_projection WHERE id = $1',
      [payload.workspaceId]
    );

    if (workspaceResult.rows.length === 0) {
      return;
    }

    const currentFiles = workspaceResult.rows[0].files || [];
    const currentVersion = workspaceResult.rows[0].version;

    // Remove file from array
    const updatedFiles = currentFiles.filter(
      (file: Record<string, unknown>) => file.id !== payload.fileId
    );

    await this.db.query(
      `UPDATE workspace_projection
       SET files = $1, last_activity_at = $2, updated_at = $3, version = $4
       WHERE id = $5`,
      [
        JSON.stringify(updatedFiles),
        event.timestamp,
        event.timestamp,
        currentVersion + 1,
        payload.workspaceId,
      ]
    );
  }

  /**
   * Handle FunctionRegistered event
   */
  private async handleFunctionRegistered(event: Event & { type: 'FunctionRegistered' }): Promise<void> {
    const payload = event.payload as {
      workspaceId: string;
      functionId: string;
    };

    const workspaceResult = await this.db.query(
      'SELECT functions, version FROM workspace_projection WHERE id = $1',
      [payload.workspaceId]
    );

    if (workspaceResult.rows.length === 0) {
      return;
    }

    const currentFunctions = workspaceResult.rows[0].functions || [];
    const currentVersion = workspaceResult.rows[0].version;

    // Add function ID if not already present
    const updatedFunctions = currentFunctions.includes(payload.functionId)
      ? currentFunctions
      : [...currentFunctions, payload.functionId];

    await this.db.query(
      `UPDATE workspace_projection
       SET functions = $1, last_activity_at = $2, updated_at = $3, version = $4
       WHERE id = $5`,
      [
        JSON.stringify(updatedFunctions),
        event.timestamp,
        event.timestamp,
        currentVersion + 1,
        payload.workspaceId,
      ]
    );
  }

  /**
   * Handle FunctionExecuted event
   */
  private async handleFunctionExecuted(event: Event & { type: 'FunctionExecuted' }): Promise<void> {
    const payload = event.payload as {
      workspaceId: string;
    };

    // Just update last_activity_at
    await this.db.query(
      `UPDATE workspace_projection
       SET last_activity_at = $1, updated_at = $2
       WHERE id = $3`,
      [event.timestamp, event.timestamp, payload.workspaceId]
    );
  }

  /**
   * Process all new events since last checkpoint
   */
  async processNewEvents(): Promise<void> {
    const checkpoint = await this.getCheckpoint();
    const currentSequence = await this.eventStore.getCurrentSequence();
    
    if (checkpoint >= currentSequence) {
      // No new events
      return;
    }

    // Get events by sequence range
    for await (const event of this.eventStore.getBySequence(checkpoint + 1n, currentSequence)) {
      // Only process workspace-related events
      if (
        event.type === 'WorkspaceCreated' ||
        event.type === 'FileUploaded' ||
        event.type === 'FileModified' ||
        event.type === 'FileDeleted' ||
        event.type === 'FunctionRegistered' ||
        event.type === 'FunctionExecuted'
      ) {
        await this.handle(event);
      }

      // Update checkpoint after each event
      await this.updateCheckpoint(event.sequence);
    }
  }

  /**
   * Rebuild the projection from scratch
   */
  async rebuild(): Promise<void> {
    // Clear existing projection
    await this.db.query('TRUNCATE TABLE workspace_projection');
    
    // Reset checkpoint
    await this.db.query(
      `UPDATE projection_checkpoints SET last_sequence = 1, status = 'rebuilding' WHERE projection_name = $1`,
      [this.projectionName]
    );

    // Process all events from the beginning (sequence 1 onwards)
    const currentSequence = await this.eventStore.getCurrentSequence();
    
    for await (const event of this.eventStore.getBySequence(1n, currentSequence)) {
      if (
        event.type === 'WorkspaceCreated' ||
        event.type === 'FileUploaded' ||
        event.type === 'FileModified' ||
        event.type === 'FileDeleted' ||
        event.type === 'FunctionRegistered' ||
        event.type === 'FunctionExecuted'
      ) {
        await this.handle(event);
      }
      await this.updateCheckpoint(event.sequence);
    }

    // Mark as running
    await this.db.query(
      `UPDATE projection_checkpoints SET status = 'running' WHERE projection_name = $1`,
      [this.projectionName]
    );
  }

  /**
   * Query workspace by ID
   */
  async getWorkspace(workspaceId: string): Promise<WorkspaceProjectionRow | null> {
    const result = await this.db.query(
      'SELECT * FROM workspace_projection WHERE id = $1',
      [workspaceId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      realm_id: row.realm_id,
      name: row.name,
      description: row.description,
      runtime: row.runtime,
      resources: row.resources,
      status: row.status,
      version: Number(row.version),
      created_at: Number(row.created_at),
      created_by: row.created_by,
      last_activity_at: Number(row.last_activity_at),
      repositories: row.repositories,
      files: row.files,
      functions: row.functions,
      updated_at: Number(row.updated_at),
    };
  }

  /**
   * Query workspaces by realm
   */
  async getWorkspacesByRealm(realmId: string): Promise<WorkspaceProjectionRow[]> {
    const result = await this.db.query(
      'SELECT * FROM workspace_projection WHERE realm_id = $1 ORDER BY created_at DESC',
      [realmId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      realm_id: row.realm_id,
      name: row.name,
      description: row.description,
      runtime: row.runtime,
      resources: row.resources,
      status: row.status,
      version: Number(row.version),
      created_at: Number(row.created_at),
      created_by: row.created_by,
      last_activity_at: Number(row.last_activity_at),
      repositories: row.repositories,
      files: row.files,
      functions: row.functions,
      updated_at: Number(row.updated_at),
    }));
  }
}

