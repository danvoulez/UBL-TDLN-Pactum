/**
 * Projections Manager
 * 
 * Manages and coordinates multiple projections, processing events incrementally.
 */

import { EventStore, SequenceNumber, Event } from './event-store';
import { WorkspaceProjection, WorkspaceProjectionConfig } from './workspace-projection';
import type { Pool } from 'pg';

export interface ProjectionManagerConfig {
  eventStore: EventStore;
  db?: Pool; // Optional - only needed for PostgreSQL projections
}

export interface ProjectionStatus {
  name: string;
  lastSequence: SequenceNumber;
  status: 'running' | 'paused' | 'rebuilding' | 'error';
  errorMessage?: string;
}

/**
 * Projection Manager
 * 
 * Coordinates multiple projections, processing events from the event store.
 */
export class ProjectionManager {
  private eventStore: EventStore;
  private db?: Pool;
  private projections: Map<string, { projection: WorkspaceProjection; status: ProjectionStatus }> = new Map();
  private processingInterval?: NodeJS.Timeout;
  private isProcessing = false;

  constructor(config: ProjectionManagerConfig) {
    this.eventStore = config.eventStore;
    this.db = config.db;
  }

  /**
   * Register a workspace projection
   */
  registerWorkspaceProjection(): void {
    if (!this.db) {
      console.warn('⚠️  Workspace projection requires PostgreSQL (db pool not provided)');
      return;
    }

    const projection = new WorkspaceProjection({
      db: this.db,
      eventStore: this.eventStore,
    });

    this.projections.set('workspaces', {
      projection,
      status: {
        name: 'workspaces',
        lastSequence: 1n,
        status: 'running',
      },
    });

    console.log('✅ Workspace projection registered');
  }

  /**
   * Start processing events for all projections
   */
  async start(): Promise<void> {
    if (this.processingInterval) {
      console.warn('⚠️  Projection manager already started');
      return;
    }

    // Initial processing
    await this.processNewEvents();

    // Set up periodic processing (every 5 seconds)
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processNewEvents();
      }
    }, 5000);

    console.log('✅ Projection manager started');
  }

  /**
   * Stop processing
   */
  stop(): Promise<void> {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    console.log('✅ Projection manager stopped');
  }

  /**
   * Process new events for all projections
   */
  private async processNewEvents(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      for (const [name, { projection, status }] of this.projections.entries()) {
        if (status.status !== 'running') {
          continue;
        }

        try {
          await projection.processNewEvents();
          const checkpoint = await projection.getCheckpoint();
          status.lastSequence = checkpoint;
        } catch (error: any) {
          console.error(`❌ Error processing projection ${name}:`, error);
          status.status = 'error';
          status.errorMessage = error.message;
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get projection status
   */
  async getStatus(projectionName: string): Promise<ProjectionStatus | null> {
    const entry = this.projections.get(projectionName);
    if (!entry) {
      return null;
    }

    const checkpoint = await entry.projection.getCheckpoint();
    return {
      ...entry.status,
      lastSequence: checkpoint,
    };
  }

  /**
   * Get all projection statuses
   */
  async getAllStatuses(): Promise<ProjectionStatus[]> {
    const statuses: ProjectionStatus[] = [];

    for (const [name, { projection, status }] of this.projections.entries()) {
      const checkpoint = await projection.getCheckpoint();
      statuses.push({
        ...status,
        lastSequence: checkpoint,
      });
    }

    return statuses;
  }

  /**
   * Rebuild a projection from scratch
   */
  async rebuild(projectionName: string): Promise<{ success: boolean; message: string }> {
    const entry = this.projections.get(projectionName);
    if (!entry) {
      return { success: false, message: `Projection ${projectionName} not found` };
    }

    try {
      entry.status.status = 'rebuilding';
      await entry.projection.rebuild();
      entry.status.status = 'running';
      entry.status.errorMessage = undefined;

      return { success: true, message: `Projection ${projectionName} rebuilt successfully` };
    } catch (error: any) {
      entry.status.status = 'error';
      entry.status.errorMessage = error.message;
      return { success: false, message: error.message };
    }
  }

  /**
   * Get workspace projection instance (for direct queries)
   */
  getWorkspaceProjection(): WorkspaceProjection | null {
    const entry = this.projections.get('workspaces');
    return entry?.projection ?? null;
  }
}



