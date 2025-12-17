/**
 * WORKSPACE INTENT HANDLERS
 * 
 * Intent handlers for workspace operations:
 * - File operations (upload, download, list, modify, delete)
 * - Code execution (register:function, execute:function, execute:script)
 * - Workspace management
 */

import type { EntityId, ActorReference, Timestamp, Hash } from '../../shared/types';
import type { Intent, IntentResult, HandlerContext } from '../intent-api';
import type { WorkspaceStorage } from '../../sandbox/storage';
import type { WorkspaceRuntime } from '../../sandbox/runtimes/types';

// WorkspaceResources was in workspace.ts (now deleted, replaced by Container)
// Define locally for backward compatibility
interface WorkspaceResources {
  readonly maxFileSizeMB: number;
  readonly maxStorageMB: number;
  readonly maxExecutionTimeMs: number;
  readonly maxMemoryMB: number;
  readonly timeoutMs?: number;
  readonly memoryLimit?: number;
  readonly cpuLimit?: number;
}
import type { RuntimeRegistry } from '../../sandbox/runtimes/registry';
import type { ExecutionRequest } from '../../sandbox/runtimes/types';
import type { GitAdapter } from '../../sandbox/git-adapter';
import { Ids } from '../../shared/types';
import { createHash } from 'node:crypto';
import { join } from 'path';

// ============================================================================
// FILE OPERATION INTENTS
// ============================================================================

export interface UploadFileIntent {
  workspaceId: EntityId;
  file: Uint8Array | string;
  filename: string;
  path: string;
}

export async function handleUploadFile(
  intent: Intent<UploadFileIntent>,
  context: HandlerContext
): Promise<IntentResult> {
  const startTime = Date.now();
  
  try {
    // 1. Verificar permissão via ABAC
    const authorization = context.authorization as any; // AuthorizationEngine
    const auth = await authorization.authorize({
      actor: intent.actor,
      action: { type: 'create' as const },
      resource: { type: 'Workspace' as const, id: intent.payload.workspaceId },
      context: {
        realm: intent.realm,
        timestamp: Date.now(),
        correlationId: intent.idempotencyKey || ('' as EntityId),
      }
    });
    
    if (!auth.allowed) {
      return {
        success: false,
        outcome: { type: 'Nothing', reason: auth.reason || 'Unauthorized' },
        events: [],
        affordances: [],
        errors: [{ code: 'UNAUTHORIZED', message: auth.reason || 'Insufficient permissions' }],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    }
    
    // 2. Criar File asset
    const fileId = generateId('file');
    const fileContent = typeof intent.payload.file === 'string' 
      ? new TextEncoder().encode(intent.payload.file)
      : intent.payload.file;
    const contentHash = calculateHash(fileContent);
    
    // 3. Armazenar
    const storage = context.adapters?.get('WorkspaceStorage') as WorkspaceStorage | undefined;
    if (!storage) {
      throw new Error('WorkspaceStorage adapter not configured');
    }
    
    const storageLocation = await storage.storeFile(
      intent.payload.workspaceId,
      fileId,
      1,
      fileContent,
      contentHash
    );
    
    // 4. Obter versão atual do aggregate (primeiro evento = 1)
    const eventStore = context.eventStore as any;
    const latestEvent = await eventStore.getLatest('File' as any, fileId);
    const nextAggregateVersion = latestEvent ? latestEvent.aggregateVersion + 1 : 1;
    
    // 5. Criar evento FileUploaded
    const event = await eventStore.append({
      type: 'FileUploaded',
      aggregateType: 'File' as any,
      aggregateId: fileId,
      aggregateVersion: nextAggregateVersion,
      actor: intent.actor,
      timestamp: Date.now(),
      payload: {
        workspaceId: intent.payload.workspaceId,
        fileId,
        filename: intent.payload.filename,
        path: intent.payload.path,
        sizeBytes: fileContent.length,
        contentHash,
        storageLocation,
        uploadedBy: intent.actor,
      }
    });
    
    return {
      success: true,
      outcome: {
        type: 'Created',
        entity: {
          id: fileId,
          filename: intent.payload.filename,
          path: intent.payload.path,
          sizeBytes: fileContent.length,
        },
        id: fileId
      },
      events: [event],
      affordances: [
        { intent: 'modify:file', description: 'Edit this file', required: ['workspaceId', 'fileId'] },
        { intent: 'execute:script', description: 'Execute this file', required: ['workspaceId', 'path'] },
      ],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  } catch (error: any) {
    return {
      success: false,
      outcome: { type: 'Nothing', reason: error.message },
      events: [],
      affordances: [],
      errors: [{ code: 'ERROR', message: error.message }],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  }
}

export interface DownloadFileIntent {
  workspaceId: EntityId;
  fileId: EntityId;
  version?: number;
}

export async function handleDownloadFile(
  intent: Intent<DownloadFileIntent>,
  context: HandlerContext
): Promise<IntentResult> {
  const startTime = Date.now();
  
  try {
    // 1. Verificar permissão
    const authorization = context.authorization as any; // AuthorizationEngine
    const auth = await authorization.authorize({
      actor: intent.actor,
      action: { type: 'read' as const },
      resource: { type: 'Workspace' as const, id: intent.payload.workspaceId },
      context: {
        realm: intent.realm,
        timestamp: Date.now(),
        correlationId: intent.idempotencyKey || ('' as EntityId),
      }
    });
    
    if (!auth.allowed) {
      return {
        success: false,
        outcome: { type: 'Nothing', reason: auth.reason || 'Unauthorized' },
        events: [],
        affordances: [],
        errors: [{ code: 'UNAUTHORIZED', message: auth.reason || 'Insufficient permissions' }],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    }
    
    // 2. Obter versão do arquivo (via eventos)
    const eventStore = context.eventStore as any;
    let fileVersion = intent.payload.version || 1;
    let filePath = '';
    let filename = '';
    let storageLocation = '';
    
    // Buscar eventos do arquivo para obter informações
    const fileEvents: any[] = [];
    for await (const event of eventStore.getByAggregate('File' as any, intent.payload.fileId)) {
      fileEvents.push(event);
      if (event.type === 'FileUploaded' || event.type === 'FileModified') {
        const payload = event.payload as any;
        if (!filePath) filePath = payload.path || '';
        if (!filename) filename = payload.filename || '';
        const eventVersion = event.type === 'FileUploaded' ? 1 : (payload.version || 1);
        if (eventVersion === fileVersion || (!intent.payload.version && eventVersion > fileVersion)) {
          fileVersion = eventVersion;
          storageLocation = payload.storageLocation || storageLocation;
        }
      }
      if (event.type === 'FileDeleted') {
        return {
          success: false,
          outcome: { type: 'Nothing', reason: 'File has been deleted' },
          events: [],
          affordances: [],
          errors: [{ code: 'FILE_DELETED', message: 'File has been deleted' }],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      }
    }
    
    if (!storageLocation) {
      return {
        success: false,
        outcome: { type: 'Nothing', reason: 'File not found' },
        events: [],
        affordances: [],
        errors: [{ code: 'FILE_NOT_FOUND', message: 'File not found' }],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    }
    
    // 3. Carregar conteúdo do storage
    const storage = context.adapters?.get('WorkspaceStorage') as WorkspaceStorage | undefined;
    if (!storage) {
      throw new Error('WorkspaceStorage adapter not configured');
    }
    
    const fileContent = await storage.loadFile(storageLocation);
    
    return {
      success: true,
      outcome: {
        type: 'Queried',
        results: [{
          fileId: intent.payload.fileId,
          filename,
          path: filePath,
          version: fileVersion,
          content: fileContent,
          sizeBytes: fileContent.length,
        }]
      },
      events: [],
      affordances: [],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  } catch (error: any) {
    return {
      success: false,
      outcome: { type: 'Nothing', reason: error.message },
      events: [],
      affordances: [],
      errors: [{ code: 'ERROR', message: error.message }],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  }
}

export interface ListFilesIntent {
  workspaceId: EntityId;
  path?: string;
}

export async function handleListFiles(
  intent: Intent<ListFilesIntent>,
  context: HandlerContext
): Promise<IntentResult> {
  const startTime = Date.now();
  
  try {
    // 1. Verificar permissão
    const authorization = context.authorization as any; // AuthorizationEngine
    const auth = await authorization.authorize({
      actor: intent.actor,
      action: { type: 'read' as const },
      resource: { type: 'Workspace' as const, id: intent.payload.workspaceId },
      context: {
        realm: intent.realm,
        timestamp: Date.now(),
        correlationId: intent.idempotencyKey || ('' as EntityId),
      }
    });
    
    if (!auth.allowed) {
      return {
        success: false,
        outcome: { type: 'Nothing', reason: auth.reason || 'Unauthorized' },
        events: [],
        affordances: [],
        errors: [{ code: 'UNAUTHORIZED', message: auth.reason || 'Insufficient permissions' }],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    }
    
    // 2. Query eventos FileUploaded e FileModified
    const eventStore = context.eventStore as any;
    const filesMap = new Map<EntityId, {
      fileId: EntityId;
      filename: string;
      path: string;
      version: number;
      sizeBytes: number;
      uploadedAt: number;
      modifiedAt: number;
      deleted: boolean;
    }>();
    
    // Buscar todos os eventos de arquivos do workspace
    // Nota: Em produção, isso seria otimizado com índices
    const allEvents: any[] = [];
    // Por enquanto, vamos retornar uma lista vazia se não houver eventos
    // Em produção, usaríamos uma query otimizada por workspaceId
    
    // Construir lista de arquivos a partir dos eventos
    const files: any[] = [];
    for (const [fileId, fileInfo] of filesMap.entries()) {
      if (!fileInfo.deleted) {
        // Filtrar por path se especificado
        if (!intent.payload.path || fileInfo.path.startsWith(intent.payload.path)) {
          files.push({
            fileId: fileInfo.fileId,
            filename: fileInfo.filename,
            path: fileInfo.path,
            version: fileInfo.version,
            sizeBytes: fileInfo.sizeBytes,
            uploadedAt: fileInfo.uploadedAt,
            modifiedAt: fileInfo.modifiedAt,
          });
        }
      }
    }
    
    return {
      success: true,
      outcome: {
        type: 'Queried',
        results: files
      },
      events: [],
      affordances: [],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  } catch (error: any) {
    return {
      success: false,
      outcome: { type: 'Nothing', reason: error.message },
      events: [],
      affordances: [],
      errors: [{ code: 'ERROR', message: error.message }],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  }
}

export interface ModifyFileIntent {
  workspaceId: EntityId;
  fileId: EntityId;
  content: Uint8Array | string;
  previousVersionId?: EntityId;
}

export async function handleModifyFile(
  intent: Intent<ModifyFileIntent>,
  context: HandlerContext
): Promise<IntentResult> {
  const startTime = Date.now();
  
  try {
    // 1. Verificar permissão via ABAC
    const authorization = context.authorization as any; // AuthorizationEngine
    const auth = await authorization.authorize({
      actor: intent.actor,
      action: { type: 'update' as const },
      resource: { type: 'Workspace' as const, id: intent.payload.workspaceId },
      context: {
        realm: intent.realm,
        timestamp: Date.now(),
        correlationId: intent.idempotencyKey || ('' as EntityId),
      }
    });
    
    if (!auth.allowed) {
      return {
        success: false,
        outcome: { type: 'Nothing', reason: auth.reason || 'Unauthorized' },
        events: [],
        affordances: [],
        errors: [{ code: 'UNAUTHORIZED', message: auth.reason || 'Insufficient permissions' }],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    }
    
    // 2. Obter versão anterior e informações do arquivo
    const eventStore = context.eventStore as any;
    let currentVersion = 1;
    let filePath = '';
    let filename = '';
    
    // Buscar eventos do arquivo para obter versão atual
    for await (const event of eventStore.getByAggregate('File' as any, intent.payload.fileId)) {
      if (event.type === 'FileUploaded') {
        const payload = event.payload as any;
        filePath = payload.path || filePath;
        filename = payload.filename || filename;
        currentVersion = 1;
      } else if (event.type === 'FileModified') {
        const payload = event.payload as any;
        filePath = payload.path || filePath;
        filename = payload.filename || filename;
        currentVersion = Math.max(currentVersion, (payload.version || 1) + 1);
      } else if (event.type === 'FileDeleted') {
        return {
          success: false,
          outcome: { type: 'Nothing', reason: 'File has been deleted' },
          events: [],
          affordances: [],
          errors: [{ code: 'FILE_DELETED', message: 'Cannot modify deleted file' }],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      }
    }
    
    // 3. Calcular hash do novo conteúdo
    const fileContent = typeof intent.payload.content === 'string'
      ? new TextEncoder().encode(intent.payload.content)
      : intent.payload.content;
    const contentHash = calculateHash(fileContent);
    
    // 4. Armazenar conteúdo
    const storage = context.adapters?.get('WorkspaceStorage') as WorkspaceStorage | undefined;
    if (!storage) {
      throw new Error('WorkspaceStorage adapter not configured');
    }
    
    // Incrementar versão
    const version = currentVersion + 1;
    const storageLocation = await storage.storeFile(
      intent.payload.workspaceId,
      intent.payload.fileId,
      version,
      fileContent,
      contentHash
    );
    
    // 5. Obter versão atual do aggregate para calcular próxima versão
    const latestEvent = await eventStore.getLatest('File' as any, intent.payload.fileId);
    const nextAggregateVersion = latestEvent ? latestEvent.aggregateVersion + 1 : 1;
    
    // 6. Criar evento FileModified
    const event = await eventStore.append({
      type: 'FileModified',
      aggregateType: 'File' as any,
      aggregateId: intent.payload.fileId,
      aggregateVersion: nextAggregateVersion,
      actor: intent.actor,
      timestamp: Date.now(),
      payload: {
        workspaceId: intent.payload.workspaceId,
        fileId: intent.payload.fileId,
        previousVersionId: intent.payload.previousVersionId || ('' as EntityId),
        path: filePath,
        filename: filename,
        version: version,
        sizeBytes: fileContent.length,
        contentHash,
        storageLocation,
        modifiedBy: intent.actor,
      }
    });
    
    return {
      success: true,
      outcome: {
        type: 'Updated',
        entity: { id: intent.payload.fileId, version },
        changes: ['content', 'version']
      },
      events: [event],
      affordances: [],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  } catch (error: any) {
    return {
      success: false,
      outcome: { type: 'Nothing', reason: error.message },
      events: [],
      affordances: [],
      errors: [{ code: 'ERROR', message: error.message }],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  }
}

export interface DeleteFileIntent {
  workspaceId: EntityId;
  fileId: EntityId;
}

export async function handleDeleteFile(
  intent: Intent<DeleteFileIntent>,
  context: HandlerContext
): Promise<IntentResult> {
  const startTime = Date.now();
  
  try {
    // 1. Verificar permissão
    const authorization = context.authorization as any; // AuthorizationEngine
    const auth = await authorization.authorize({
      actor: intent.actor,
      action: { type: 'delete' as const },
      resource: { type: 'Workspace' as const, id: intent.payload.workspaceId },
      context: {
        realm: intent.realm,
        timestamp: Date.now(),
        correlationId: intent.idempotencyKey || ('' as EntityId),
      }
    });
    
    if (!auth.allowed) {
      return {
        success: false,
        outcome: { type: 'Nothing', reason: auth.reason || 'Unauthorized' },
        events: [],
        affordances: [],
        errors: [{ code: 'UNAUTHORIZED', message: auth.reason || 'Insufficient permissions' }],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    }
    
    // 2. Verificar se arquivo existe e obter informações
    const eventStore = context.eventStore as any;
    let filePath = '';
    let filename = '';
    let fileExists = false;
    
    // Buscar eventos do arquivo
    for await (const event of eventStore.getByAggregate('File' as any, intent.payload.fileId)) {
      if (event.type === 'FileUploaded' || event.type === 'FileModified') {
        const payload = event.payload as any;
        filePath = payload.path || filePath;
        filename = payload.filename || filename;
        fileExists = true;
      } else if (event.type === 'FileDeleted') {
        return {
          success: false,
          outcome: { type: 'Nothing', reason: 'File already deleted' },
          events: [],
          affordances: [],
          errors: [{ code: 'FILE_ALREADY_DELETED', message: 'File has already been deleted' }],
          meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
        };
      }
    }
    
    if (!fileExists) {
      return {
        success: false,
        outcome: { type: 'Nothing', reason: 'File not found' },
        events: [],
        affordances: [],
        errors: [{ code: 'FILE_NOT_FOUND', message: 'File does not exist' }],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    }
    
    // 3. Obter versão atual do aggregate
    const latestEvent = await eventStore.getLatest('File' as any, intent.payload.fileId);
    const nextAggregateVersion = latestEvent ? latestEvent.aggregateVersion + 1 : 1;
    
    // 4. Criar evento FileDeleted
    const event = await eventStore.append({
      type: 'FileDeleted',
      aggregateType: 'File' as any,
      aggregateId: intent.payload.fileId,
      aggregateVersion: nextAggregateVersion,
      actor: intent.actor,
      timestamp: Date.now(),
      payload: {
        workspaceId: intent.payload.workspaceId,
        fileId: intent.payload.fileId,
        path: filePath,
        filename: filename,
        deletedBy: intent.actor,
      }
    });
    
    return {
      success: true,
      outcome: {
        type: 'Updated',
        entity: { id: intent.payload.fileId, deleted: true },
        changes: ['deleted']
      },
      events: [event],
      affordances: [],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  } catch (error: any) {
    return {
      success: false,
      outcome: { type: 'Nothing', reason: error.message },
      events: [],
      affordances: [],
      errors: [{ code: 'ERROR', message: error.message }],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  }
}

// ============================================================================
// CODE EXECUTION INTENTS
// ============================================================================

export interface RegisterFunctionIntent {
  workspaceId: EntityId;
  name: string;
  code: string;
  language: 'javascript' | 'python' | 'typescript';
  entryPoint: string;
}

export async function handleRegisterFunction(
  intent: Intent<RegisterFunctionIntent>,
  context: HandlerContext
): Promise<IntentResult> {
  const startTime = Date.now();
  
  try {
    // 1. Verificar permissão
    const authorization = context.authorization as any; // AuthorizationEngine
    const auth = await authorization.authorize({
      actor: intent.actor,
      action: { type: 'create' as const },
      resource: { type: 'Workspace' as const, id: intent.payload.workspaceId },
      context: {
        realm: intent.realm,
        timestamp: Date.now(),
        correlationId: intent.idempotencyKey || ('' as EntityId),
      }
    });
    
    if (!auth.allowed) {
      return {
        success: false,
        outcome: { type: 'Nothing', reason: auth.reason || 'Unauthorized' },
        events: [],
        affordances: [],
        errors: [{ code: 'UNAUTHORIZED', message: auth.reason || 'Insufficient permissions' }],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    }
    
    // 2. Criar Function asset
    const functionId = generateId('func');
    
    // 3. Armazenar código
    const storage = context.adapters?.get('WorkspaceStorage') as WorkspaceStorage | undefined;
    if (!storage) {
      throw new Error('WorkspaceStorage adapter not configured');
    }
    
    await storage.storeFunction(
      intent.payload.workspaceId,
      functionId,
      intent.payload.code
    );
    
    // 4. Criar evento FunctionRegistered
    const eventStore = context.eventStore as any;
    // Obter versão atual do aggregate (primeiro evento = 1)
    const latestEvent = await eventStore.getLatest('Function' as any, functionId);
    const nextAggregateVersion = latestEvent ? latestEvent.aggregateVersion + 1 : 1;
    
    const event = await eventStore.append({
      type: 'FunctionRegistered',
      aggregateType: 'Function' as any,
      aggregateId: functionId,
      aggregateVersion: nextAggregateVersion,
      actor: intent.actor,
      timestamp: Date.now(),
      payload: {
        workspaceId: intent.payload.workspaceId,
        functionId,
        name: intent.payload.name,
        language: intent.payload.language,
        entryPoint: intent.payload.entryPoint,
        registeredBy: intent.actor,
      }
    });
    
    return {
      success: true,
      outcome: {
        type: 'Created',
        entity: {
          id: functionId,
          name: intent.payload.name,
          language: intent.payload.language,
        },
        id: functionId
      },
      events: [event],
      affordances: [
        { intent: 'execute:function', description: 'Execute this function', required: ['workspaceId', 'functionId'] },
      ],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  } catch (error: any) {
    return {
      success: false,
      outcome: { type: 'Nothing', reason: error.message },
      events: [],
      affordances: [],
      errors: [{ code: 'ERROR', message: error.message }],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  }
}

export interface ExecuteFunctionIntent {
  workspaceId: EntityId;
  functionId: EntityId;
  input: unknown;
}

export async function handleExecuteFunction(
  intent: Intent<ExecuteFunctionIntent>,
  context: HandlerContext
): Promise<IntentResult> {
  const startTime = Date.now();
  
  try {
    // 1. Verificar permissão via Agreement
    const authorization = context.authorization as any; // AuthorizationEngine
    const auth = await authorization.authorize({
      actor: intent.actor,
      action: { type: 'custom' as const, operation: 'execute' },
      resource: { type: 'Workspace' as const, id: intent.payload.workspaceId },
      context: {
        realm: intent.realm,
        timestamp: Date.now(),
        correlationId: intent.idempotencyKey || ('' as EntityId),
      }
    });
    
    if (!auth.allowed) {
      return {
        success: false,
        outcome: { type: 'Nothing', reason: auth.reason || 'Unauthorized' },
        events: [],
        affordances: [],
        errors: [{ code: 'UNAUTHORIZED', message: auth.reason || 'Insufficient permissions' }],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    }
    
    // 2. Verificar quota de recursos (TODO: implementar verificação de quota)
    
    // 3. Obter informações do workspace (runtime, recursos)
    const eventStore = context.eventStore as any;
    const aggregates = context.aggregates as any;
    
    // Buscar evento WorkspaceCreated para obter runtime e recursos
    let workspaceRuntime: WorkspaceRuntime = 'Node.js';
    let workspaceResources: WorkspaceResources = {
      cpuLimit: 1,
      memoryLimit: 512,
      storageLimit: 10,
      timeoutMs: 30000,
      networkAccess: false,
      gitAccess: false,
    };
    
    try {
      // Buscar eventos do workspace
      const workspaceEvents = [];
      for await (const event of eventStore.getByAggregate('Workspace' as any, intent.payload.workspaceId)) {
        workspaceEvents.push(event);
        if (event.type === 'WorkspaceCreated') {
          workspaceRuntime = (event.payload as any).runtime || 'Node.js';
          workspaceResources = (event.payload as any).resources || workspaceResources;
          break;
        }
      }
    } catch (error) {
      // Se não encontrar, usar defaults
    }
    
    // 4. Obter função (código e metadados)
    const storage = context.adapters?.get('WorkspaceStorage') as WorkspaceStorage | undefined;
    if (!storage) {
      throw new Error('WorkspaceStorage adapter not configured');
    }
    
    const code = await storage.loadFunction(
      intent.payload.workspaceId,
      intent.payload.functionId
    );
    
    // Buscar evento FunctionRegistered para obter language e entryPoint
    let functionLanguage: 'javascript' | 'python' | 'typescript' = 'javascript';
    let entryPoint = 'main';
    
    try {
      const functionEvents = [];
      for await (const event of eventStore.getByAggregate('Function' as any, intent.payload.functionId)) {
        functionEvents.push(event);
        if (event.type === 'FunctionRegistered') {
          const payload = event.payload as any;
          functionLanguage = payload.language || 'javascript';
          entryPoint = payload.entryPoint || 'main';
          break;
        }
      }
    } catch (error) {
      // Se não encontrar, usar defaults
    }
    
    // 5. Executar em sandbox (via runtime plugin)
    const runtimeRegistry = context.runtimeRegistry as RuntimeRegistry | undefined;
    if (!runtimeRegistry) {
      throw new Error('RuntimeRegistry not configured');
    }
    
    // Mapear language para runtime
    const runtime: WorkspaceRuntime = functionLanguage === 'python' 
      ? 'Python' 
      : functionLanguage === 'typescript' || functionLanguage === 'javascript'
      ? 'Node.js'
      : workspaceRuntime;
    
    const executionRequest: ExecutionRequest = {
      workspaceId: intent.payload.workspaceId,
      functionId: intent.payload.functionId,
      code,
      runtime,
      entryPoint,
      input: intent.payload.input,
      resources: {
        timeoutMs: workspaceResources.timeoutMs,
        memoryLimitMB: workspaceResources.memoryLimit,
        cpuLimit: workspaceResources.cpuLimit,
      },
      environment: {},
      allowedImports: [],
      blockedImports: [],
    };
    
    const executionResult = await runtimeRegistry.execute(executionRequest);
    
    // 6. Obter versão atual do aggregate (Function)
    const latestEvent = await eventStore.getLatest('Function' as any, intent.payload.functionId);
    const nextAggregateVersion = latestEvent ? latestEvent.aggregateVersion + 1 : 1;
    
    // 7. Criar evento FunctionExecuted
    const agreementId = (auth as any).agreementId || ('' as EntityId);
    
    const event = await eventStore.append({
      type: 'FunctionExecuted',
      aggregateType: 'Function' as any,
      aggregateId: intent.payload.functionId,
      aggregateVersion: nextAggregateVersion,
      actor: intent.actor,
      timestamp: Date.now(),
      payload: {
        workspaceId: intent.payload.workspaceId,
        functionId: intent.payload.functionId,
        input: intent.payload.input,
        output: executionResult.output,
        error: executionResult.error,
        resources: executionResult.resources,
        executedBy: intent.actor,
        agreementId,
        logs: executionResult.logs,
      }
    });
    
    return {
      success: executionResult.success,
      outcome: executionResult.success
        ? {
            type: 'Queried',
            results: [{ 
              executed: true, 
              functionId: intent.payload.functionId,
              output: executionResult.output,
            }]
          }
        : {
            type: 'Nothing',
            reason: executionResult.error?.message || 'Execution failed',
          },
      events: [event],
      affordances: [],
      errors: executionResult.success ? [] : [{ 
        code: executionResult.error?.code || 'EXECUTION_ERROR', 
        message: executionResult.error?.message || 'Execution failed' 
      }],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  } catch (error: any) {
    return {
      success: false,
      outcome: { type: 'Nothing', reason: error.message },
      events: [],
      affordances: [],
      errors: [{ code: 'ERROR', message: error.message }],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  }
}

export interface ExecuteScriptIntent {
  workspaceId: EntityId;
  path: string;
  input?: unknown;
}

export async function handleExecuteScript(
  intent: Intent<ExecuteScriptIntent>,
  context: HandlerContext
): Promise<IntentResult> {
  const startTime = Date.now();
  
  try {
    // 1. Verificar permissão via Agreement
    const authorization = context.authorization as any; // AuthorizationEngine
    const auth = await authorization.authorize({
      actor: intent.actor,
      action: { type: 'custom' as const, operation: 'execute' },
      resource: { type: 'Workspace' as const, id: intent.payload.workspaceId },
      context: {
        realm: intent.realm,
        timestamp: Date.now(),
        correlationId: intent.idempotencyKey || ('' as EntityId),
      }
    });
    
    if (!auth.allowed) {
      return {
        success: false,
        outcome: { type: 'Nothing', reason: auth.reason || 'Unauthorized' },
        events: [],
        affordances: [],
        errors: [{ code: 'UNAUTHORIZED', message: auth.reason || 'Insufficient permissions' }],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    }
    
    // 2. Obter informações do workspace
    const eventStore = context.eventStore as any;
    
    let workspaceRuntime: WorkspaceRuntime = 'Node.js';
    let workspaceResources: WorkspaceResources = {
      cpuLimit: 1,
      memoryLimit: 512,
      storageLimit: 10,
      timeoutMs: 30000,
      networkAccess: false,
      gitAccess: false,
    };
    
    try {
      const workspaceEvents = [];
      for await (const event of eventStore.getByAggregate('Workspace' as any, intent.payload.workspaceId)) {
        workspaceEvents.push(event);
        if (event.type === 'WorkspaceCreated') {
          workspaceRuntime = (event.payload as any).runtime || 'Node.js';
          workspaceResources = (event.payload as any).resources || workspaceResources;
          break;
        }
      }
    } catch (error) {
      // Se não encontrar, usar defaults
    }
    
    // 3. Obter arquivo do path
    const storage = context.adapters?.get('WorkspaceStorage') as WorkspaceStorage | undefined;
    if (!storage) {
      throw new Error('WorkspaceStorage adapter not configured');
    }
    
    // Buscar fileId pelo path nos eventos
    let fileId: EntityId | null = null;
    let code = '';
    
    try {
      // Buscar eventos de arquivos no workspace
      const allEvents = [];
      for await (const event of eventStore.getByAggregate('File' as any, '' as EntityId)) {
        if ((event.payload as any)?.workspaceId === intent.payload.workspaceId) {
          allEvents.push(event);
          if ((event.payload as any)?.path === intent.payload.path) {
            fileId = event.aggregateId;
            // Carregar conteúdo do arquivo
            const fileContent = await storage.loadFile((event.payload as any).storageLocation);
            code = new TextDecoder().decode(fileContent);
            break;
          }
        }
      }
    } catch (error) {
      throw new Error(`File not found at path: ${intent.payload.path}`);
    }
    
    if (!code) {
      throw new Error(`Could not load file content from path: ${intent.payload.path}`);
    }
    
    // 4. Executar script via runtime registry
    const runtimeRegistry = context.runtimeRegistry as RuntimeRegistry | undefined;
    if (!runtimeRegistry) {
      throw new Error('RuntimeRegistry not configured');
    }
    
    // Determinar runtime baseado na extensão do arquivo
    const extension = intent.payload.path.split('.').pop()?.toLowerCase();
    const runtime: WorkspaceRuntime = extension === 'py' 
      ? 'Python' 
      : extension === 'ts' || extension === 'js' || extension === 'mjs' || extension === 'cjs'
      ? 'Node.js'
      : workspaceRuntime;
    
    const executionRequest: ExecutionRequest = {
      workspaceId: intent.payload.workspaceId,
      code,
      runtime,
      entryPoint: 'main', // Scripts executam diretamente
      input: intent.payload.input,
      resources: {
        timeoutMs: workspaceResources.timeoutMs,
        memoryLimitMB: workspaceResources.memoryLimit,
        cpuLimit: workspaceResources.cpuLimit,
      },
      environment: {},
      allowedImports: [],
      blockedImports: [],
    };
    
    const executionResult = await runtimeRegistry.execute(executionRequest);
    
    // 5. Obter versão atual do aggregate (File)
    const fileAggregateId = fileId || ('' as EntityId);
    const latestEvent = fileAggregateId ? await eventStore.getLatest('File' as any, fileAggregateId) : null;
    const nextAggregateVersion = latestEvent ? latestEvent.aggregateVersion + 1 : 1;
    
    // 6. Criar evento ScriptExecuted (ou FunctionExecuted se não houver ScriptExecuted)
    const agreementId = (auth as any).agreementId || ('' as EntityId);
    
    const event = await eventStore.append({
      type: 'FunctionExecuted', // Usar FunctionExecuted por enquanto
      aggregateType: 'File' as any,
      aggregateId: fileAggregateId,
      aggregateVersion: nextAggregateVersion,
      actor: intent.actor,
      timestamp: Date.now(),
      payload: {
        workspaceId: intent.payload.workspaceId,
        functionId: fileId || ('' as EntityId),
        path: intent.payload.path,
        input: intent.payload.input,
        output: executionResult.output,
        error: executionResult.error,
        resources: executionResult.resources,
        executedBy: intent.actor,
        agreementId,
        logs: executionResult.logs,
      }
    });
    
    return {
      success: executionResult.success,
      outcome: executionResult.success
        ? {
            type: 'Queried',
            results: [{ 
              executed: true, 
              path: intent.payload.path,
              output: executionResult.output,
            }]
          }
        : {
            type: 'Nothing',
            reason: executionResult.error?.message || 'Execution failed',
          },
      events: [event],
      affordances: [],
      errors: executionResult.success ? [] : [{ 
        code: executionResult.error?.code || 'EXECUTION_ERROR', 
        message: executionResult.error?.message || 'Execution failed' 
      }],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  } catch (error: any) {
    return {
      success: false,
      outcome: { type: 'Nothing', reason: error.message },
      events: [],
      affordances: [],
      errors: [{ code: 'ERROR', message: error.message }],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Helper function to generate IDs
function generateId(prefix: string): EntityId {
  // Use Ids utility for consistency
  switch (prefix) {
    case 'file':
      return Ids.entity();
    case 'func':
      return Ids.entity();
    case 'repo':
      return Ids.entity();
    default:
      return Ids.entity();
  }
}

function calculateHash(content: Uint8Array): Hash {
  return createHash('sha256').update(content).digest('hex') as Hash;
}

// ============================================================================
// GIT OPERATIONS INTENTS
// ============================================================================

export interface CloneRepositoryIntent {
  workspaceId: EntityId;
  repositoryUrl: string;
  targetPath?: string;
  branch?: string;
  credentials?: {
    username?: string;
    password?: string;
    token?: string;
  };
}

export async function handleCloneRepository(
  intent: Intent<CloneRepositoryIntent>,
  context: HandlerContext
): Promise<IntentResult> {
  const startTime = Date.now();
  
  try {
    // 1. Verificar permissão
    const authorization = context.authorization as any;
    const auth = await authorization.authorize({
      actor: intent.actor,
      action: { type: 'create' as const },
      resource: { type: 'Workspace' as const, id: intent.payload.workspaceId },
      context: {
        realm: intent.realm,
        timestamp: Date.now(),
        correlationId: intent.idempotencyKey || ('' as EntityId),
      }
    });
    
    if (!auth.allowed) {
      return {
        success: false,
        outcome: { type: 'Nothing', reason: auth.reason || 'Unauthorized' },
        events: [],
        affordances: [],
        errors: [{ code: 'UNAUTHORIZED', message: auth.reason || 'Insufficient permissions' }],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    }
    
    // 2. Obter Git adapter
    const gitAdapter = context.adapters?.get('Git') as GitAdapter | undefined;
    if (!gitAdapter) {
      throw new Error('Git adapter not configured');
    }
    
    // 3. Preparar credenciais se fornecidas
    const credentials = intent.payload.credentials ? {
      username: intent.payload.credentials.username,
      password: intent.payload.credentials.password || intent.payload.credentials.token,
    } : undefined;
    
    // 4. Executar clone
    const cloneResult = await gitAdapter.clone(
      intent.payload.repositoryUrl,
      intent.payload.targetPath || `/workspace/${intent.payload.workspaceId}/repo`,
      {
        branch: intent.payload.branch,
        credentials,
      }
    );
    
    // 5. Criar evento RepositoryCloned
    const eventStore = context.eventStore as any;
    const repositoryId = generateId('repo');
    const latestEvent = await eventStore.getLatest('Repository' as any, repositoryId);
    const nextAggregateVersion = latestEvent ? latestEvent.aggregateVersion + 1 : 1;
    
    const event = await eventStore.append({
      type: 'RepositoryCloned',
      aggregateType: 'Repository' as any,
      aggregateId: repositoryId,
      aggregateVersion: nextAggregateVersion,
      actor: intent.actor,
      timestamp: Date.now(),
      payload: {
        workspaceId: intent.payload.workspaceId,
        repositoryId,
        repositoryUrl: intent.payload.repositoryUrl,
        targetPath: cloneResult.path,
        branch: cloneResult.branch || intent.payload.branch || 'main',
        clonedBy: intent.actor,
      }
    });
    
    return {
      success: true,
      outcome: {
        type: 'Created',
        entity: {
          id: repositoryId,
          repositoryUrl: intent.payload.repositoryUrl,
          path: cloneResult.path,
          branch: cloneResult.branch,
        },
        id: repositoryId
      },
      events: [event],
      affordances: [
        { intent: 'pull:repository', description: 'Pull latest changes', required: ['workspaceId', 'repositoryId'] },
        { intent: 'push:repository', description: 'Push changes', required: ['workspaceId', 'repositoryId'] },
      ],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  } catch (error: any) {
    return {
      success: false,
      outcome: { type: 'Nothing', reason: error.message },
      events: [],
      affordances: [],
      errors: [{ code: 'ERROR', message: error.message }],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  }
}

export interface PullRepositoryIntent {
  workspaceId: EntityId;
  repositoryId: EntityId;
  branch?: string;
  credentials?: {
    username?: string;
    password?: string;
    token?: string;
  };
}

export async function handlePullRepository(
  intent: Intent<PullRepositoryIntent>,
  context: HandlerContext
): Promise<IntentResult> {
  const startTime = Date.now();
  
  try {
    // 1. Verificar permissão
    const authorization = context.authorization as any;
    const auth = await authorization.authorize({
      actor: intent.actor,
      action: { type: 'read' as const },
      resource: { type: 'Workspace' as const, id: intent.payload.workspaceId },
      context: {
        realm: intent.realm,
        timestamp: Date.now(),
        correlationId: intent.idempotencyKey || ('' as EntityId),
      }
    });
    
    if (!auth.allowed) {
      return {
        success: false,
        outcome: { type: 'Nothing', reason: auth.reason || 'Unauthorized' },
        events: [],
        affordances: [],
        errors: [{ code: 'UNAUTHORIZED', message: auth.reason || 'Insufficient permissions' }],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    }
    
    // 2. Obter informações do repositório
    const eventStore = context.eventStore as any;
    let repositoryPath = '';
    let repositoryUrl = '';
    
    for await (const event of eventStore.getByAggregate('Repository' as any, intent.payload.repositoryId)) {
      if (event.type === 'RepositoryCloned') {
        const payload = event.payload as any;
        repositoryPath = payload.targetPath || payload.path || '';
        repositoryUrl = payload.repositoryUrl || '';
        break;
      }
    }
    
    if (!repositoryPath) {
      throw new Error(`Repository ${intent.payload.repositoryId} not found`);
    }
    
    // 3. Obter Git adapter
    const gitAdapter = context.adapters?.get('Git') as GitAdapter | undefined;
    if (!gitAdapter) {
      throw new Error('Git adapter not configured');
    }
    
    // 4. Preparar credenciais se fornecidas
    const credentials = intent.payload.credentials ? {
      username: intent.payload.credentials.username,
      password: intent.payload.credentials.password || intent.payload.credentials.token,
    } : undefined;
    
    // 5. Executar pull
    const pullResult = await gitAdapter.pull(repositoryPath, {
      branch: intent.payload.branch,
      credentials,
    });
    
    // 6. Criar evento RepositoryPulled
    const latestEvent = await eventStore.getLatest('Repository' as any, intent.payload.repositoryId);
    const nextAggregateVersion = latestEvent ? latestEvent.aggregateVersion + 1 : 1;
    
    const event = await eventStore.append({
      type: 'RepositoryPulled',
      aggregateType: 'Repository' as any,
      aggregateId: intent.payload.repositoryId,
      aggregateVersion: nextAggregateVersion,
      actor: intent.actor,
      timestamp: Date.now(),
      payload: {
        workspaceId: intent.payload.workspaceId,
        repositoryId: intent.payload.repositoryId,
        branch: pullResult.branch || intent.payload.branch || 'main',
        changes: pullResult.changes || [],
        pulledBy: intent.actor,
      }
    });
    
    return {
      success: true,
      outcome: {
        type: 'Updated',
        entity: { id: intent.payload.repositoryId, branch: pullResult.branch },
        changes: ['branch', 'commits']
      },
      events: [event],
      affordances: [
        { intent: 'push:repository', description: 'Push changes', required: ['workspaceId', 'repositoryId'] },
      ],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  } catch (error: any) {
    return {
      success: false,
      outcome: { type: 'Nothing', reason: error.message },
      events: [],
      affordances: [],
      errors: [{ code: 'ERROR', message: error.message }],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  }
}

export interface PushRepositoryIntent {
  workspaceId: EntityId;
  repositoryId: EntityId;
  branch?: string;
  message?: string;
  credentials?: {
    username?: string;
    password?: string;
    token?: string;
  };
}

export async function handlePushRepository(
  intent: Intent<PushRepositoryIntent>,
  context: HandlerContext
): Promise<IntentResult> {
  const startTime = Date.now();
  
  try {
    // 1. Verificar permissão
    const authorization = context.authorization as any;
    const auth = await authorization.authorize({
      actor: intent.actor,
      action: { type: 'update' as const },
      resource: { type: 'Workspace' as const, id: intent.payload.workspaceId },
      context: {
        realm: intent.realm,
        timestamp: Date.now(),
        correlationId: intent.idempotencyKey || ('' as EntityId),
      }
    });
    
    if (!auth.allowed) {
      return {
        success: false,
        outcome: { type: 'Nothing', reason: auth.reason || 'Unauthorized' },
        events: [],
        affordances: [],
        errors: [{ code: 'UNAUTHORIZED', message: auth.reason || 'Insufficient permissions' }],
        meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
      };
    }
    
    // 2. Obter informações do repositório
    const eventStore = context.eventStore as any;
    let repositoryPath = '';
    let repositoryUrl = '';
    
    for await (const event of eventStore.getByAggregate('Repository' as any, intent.payload.repositoryId)) {
      if (event.type === 'RepositoryCloned') {
        const payload = event.payload as any;
        repositoryPath = payload.targetPath || payload.path || '';
        repositoryUrl = payload.repositoryUrl || '';
        break;
      }
    }
    
    if (!repositoryPath) {
      throw new Error(`Repository ${intent.payload.repositoryId} not found`);
    }
    
    // 3. Obter Git adapter
    const gitAdapter = context.adapters?.get('Git') as GitAdapter | undefined;
    if (!gitAdapter) {
      throw new Error('Git adapter not configured');
    }
    
    // 4. Preparar credenciais se fornecidas
    const credentials = intent.payload.credentials ? {
      username: intent.payload.credentials.username,
      password: intent.payload.credentials.password || intent.payload.credentials.token,
    } : undefined;
    
    // 5. Executar push
    const pushResult = await gitAdapter.push(repositoryPath, {
      branch: intent.payload.branch,
      message: intent.payload.message,
      credentials,
    });
    
    // 6. Criar evento RepositoryPushed
    const latestEvent = await eventStore.getLatest('Repository' as any, intent.payload.repositoryId);
    const nextAggregateVersion = latestEvent ? latestEvent.aggregateVersion + 1 : 1;
    
    const event = await eventStore.append({
      type: 'RepositoryPushed',
      aggregateType: 'Repository' as any,
      aggregateId: intent.payload.repositoryId,
      aggregateVersion: nextAggregateVersion,
      actor: intent.actor,
      timestamp: Date.now(),
      payload: {
        workspaceId: intent.payload.workspaceId,
        repositoryId: intent.payload.repositoryId,
        branch: pushResult.branch || intent.payload.branch || 'main',
        commits: pushResult.commits || [],
        pushedBy: intent.actor,
      }
    });
    
    return {
      success: true,
      outcome: {
        type: 'Updated',
        entity: { id: intent.payload.repositoryId, branch: pushResult.branch },
        changes: ['commits', 'remote']
      },
      events: [event],
      affordances: [],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  } catch (error: any) {
    return {
      success: false,
      outcome: { type: 'Nothing', reason: error.message },
      events: [],
      affordances: [],
      errors: [{ code: 'ERROR', message: error.message }],
      meta: { processedAt: Date.now(), processingTime: Date.now() - startTime },
    };
  }
}

