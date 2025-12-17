/**
 * Git Adapter Interface
 * 
 * Abstraction for Git operations in workspaces.
 * Allows different Git implementations (simple-git, libgit2, etc.)
 */

import type { EntityId } from '../shared/types';

export interface GitAdapter {
  /**
   * Clone a repository into a workspace directory
   */
  clone(
    repositoryUrl: string,
    targetPath: string,
    options?: GitCloneOptions
  ): Promise<GitCloneResult>;

  /**
   * Pull latest changes from remote
   */
  pull(
    repositoryPath: string,
    options?: GitPullOptions
  ): Promise<GitPullResult>;

  /**
   * Push local changes to remote
   */
  push(
    repositoryPath: string,
    options?: GitPushOptions
  ): Promise<GitPushResult>;

  /**
   * Get repository status
   */
  status(repositoryPath: string): Promise<GitStatus>;

  /**
   * Get repository information
   */
  getInfo(repositoryPath: string): Promise<GitRepositoryInfo>;
}

export interface GitCloneOptions {
  branch?: string;
  depth?: number; // Shallow clone depth
  credentials?: GitCredentials;
}

export interface GitPullOptions {
  branch?: string;
  credentials?: GitCredentials;
}

export interface GitPushOptions {
  branch?: string;
  force?: boolean;
  credentials?: GitCredentials;
}

export interface GitCredentials {
  username?: string;
  password?: string;
  token?: string; // For GitHub/GitLab personal access tokens
}

export interface GitCloneResult {
  success: boolean;
  path: string;
  branch: string;
  commit: string;
  message?: string;
  error?: string;
}

export interface GitPullResult {
  success: boolean;
  updated: boolean; // Whether there were updates
  commit?: string;
  message?: string;
  error?: string;
}

export interface GitPushResult {
  success: boolean;
  pushed: boolean; // Whether anything was pushed
  commit?: string;
  message?: string;
  error?: string;
}

export interface GitStatus {
  isRepository: boolean;
  branch?: string;
  commit?: string;
  ahead: number; // Commits ahead of remote
  behind: number; // Commits behind remote
  modified: string[]; // Modified files
  untracked: string[]; // Untracked files
  error?: string;
}

export interface GitRepositoryInfo {
  url?: string;
  branch: string;
  commit: string;
  remotes: Array<{
    name: string;
    url: string;
  }>;
}



