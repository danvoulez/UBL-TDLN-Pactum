/**
 * WORKSPACE INTENTS
 * 
 * Intent definitions for workspace operations.
 * Handlers are in ../intent-handlers/workspace-intents.ts
 */

import type { IntentDefinition } from '../intent-api';
import {
  handleUploadFile,
  handleDownloadFile,
  handleListFiles,
  handleModifyFile,
  handleDeleteFile,
  handleRegisterFunction,
  handleExecuteFunction,
  handleExecuteScript,
  handleCloneRepository,
  handlePullRepository,
  handlePushRepository,
} from '../intent-handlers/workspace-intents';

export const WORKSPACE_INTENTS: readonly IntentDefinition[] = [
  {
    name: 'upload:file',
    description: 'Upload a file to a workspace',
    category: 'Asset',
    schema: {
      type: 'object',
      required: ['workspaceId', 'file', 'filename', 'path'],
      properties: {
        workspaceId: { type: 'string' },
        file: { type: 'string' },
        filename: { type: 'string' },
        path: { type: 'string' },
      },
    },
    requiredPermissions: ['Workspace:File:create'],
    handler: handleUploadFile,
  },
  {
    name: 'download:file',
    description: 'Download a file from a workspace',
    category: 'Asset',
    schema: {
      type: 'object',
      required: ['workspaceId', 'fileId'],
      properties: {
        workspaceId: { type: 'string' },
        fileId: { type: 'string' },
        version: { type: 'number' },
      },
    },
    requiredPermissions: ['Workspace:File:read'],
    handler: handleDownloadFile,
  },
  {
    name: 'list:files',
    description: 'List files in a workspace directory',
    category: 'Query',
    schema: {
      type: 'object',
      required: ['workspaceId'],
      properties: {
        workspaceId: { type: 'string' },
        path: { type: 'string' },
        recursive: { type: 'boolean' },
      },
    },
    requiredPermissions: ['Workspace:File:read'],
    handler: handleListFiles,
  },
  {
    name: 'modify:file',
    description: 'Modify a file in a workspace',
    category: 'Asset',
    schema: {
      type: 'object',
      required: ['workspaceId', 'fileId', 'content'],
      properties: {
        workspaceId: { type: 'string' },
        fileId: { type: 'string' },
        content: { type: 'string' },
      },
    },
    requiredPermissions: ['Workspace:File:update'],
    handler: handleModifyFile,
  },
  {
    name: 'delete:file',
    description: 'Delete a file from a workspace',
    category: 'Asset',
    schema: {
      type: 'object',
      required: ['workspaceId', 'fileId'],
      properties: {
        workspaceId: { type: 'string' },
        fileId: { type: 'string' },
      },
    },
    requiredPermissions: ['Workspace:File:delete'],
    handler: handleDeleteFile,
  },
  {
    name: 'register:function',
    description: 'Register a function in a workspace',
    category: 'Asset',
    schema: {
      type: 'object',
      required: ['workspaceId', 'name', 'code', 'runtime'],
      properties: {
        workspaceId: { type: 'string' },
        name: { type: 'string' },
        code: { type: 'string' },
        runtime: { type: 'string' },
        entryPoint: { type: 'string' },
      },
    },
    requiredPermissions: ['Workspace:Function:create'],
    handler: handleRegisterFunction,
  },
  {
    name: 'execute:function',
    description: 'Execute a registered function',
    category: 'Workflow',
    schema: {
      type: 'object',
      required: ['workspaceId', 'functionId', 'input'],
      properties: {
        workspaceId: { type: 'string' },
        functionId: { type: 'string' },
        input: { type: 'object' },
      },
    },
    requiredPermissions: ['Workspace:Function:execute'],
    handler: handleExecuteFunction,
  },
  {
    name: 'execute:script',
    description: 'Execute a script directly',
    category: 'Workflow',
    schema: {
      type: 'object',
      required: ['workspaceId', 'code', 'runtime'],
      properties: {
        workspaceId: { type: 'string' },
        code: { type: 'string' },
        runtime: { type: 'string' },
        input: { type: 'object' },
      },
    },
    requiredPermissions: ['Workspace:Script:execute'],
    handler: handleExecuteScript,
  },
  {
    name: 'clone:repository',
    description: 'Clone a git repository into a workspace',
    category: 'Asset',
    schema: {
      type: 'object',
      required: ['workspaceId', 'url'],
      properties: {
        workspaceId: { type: 'string' },
        url: { type: 'string' },
        branch: { type: 'string' },
        credentials: { type: 'object' },
      },
    },
    requiredPermissions: ['Workspace:Repository:create'],
    handler: handleCloneRepository,
  },
  {
    name: 'pull:repository',
    description: 'Pull changes from remote repository',
    category: 'Asset',
    schema: {
      type: 'object',
      required: ['workspaceId', 'repositoryId'],
      properties: {
        workspaceId: { type: 'string' },
        repositoryId: { type: 'string' },
        branch: { type: 'string' },
      },
    },
    requiredPermissions: ['Workspace:Repository:update'],
    handler: handlePullRepository,
  },
  {
    name: 'push:repository',
    description: 'Push changes to remote repository',
    category: 'Asset',
    schema: {
      type: 'object',
      required: ['workspaceId', 'repositoryId'],
      properties: {
        workspaceId: { type: 'string' },
        repositoryId: { type: 'string' },
        message: { type: 'string' },
        branch: { type: 'string' },
      },
    },
    requiredPermissions: ['Workspace:Repository:update'],
    handler: handlePushRepository,
  },
];
