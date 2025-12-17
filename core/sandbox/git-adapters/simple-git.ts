/**
 * SimpleGit Adapter
 * 
 * Git adapter implementation using simple-git library.
 */

import type {
  GitAdapter,
  GitCloneOptions,
  GitCloneResult,
  GitPullOptions,
  GitPullResult,
  GitPushOptions,
  GitPushResult,
  GitStatus,
  GitRepositoryInfo,
  GitCredentials,
} from '../git-adapter';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Dynamic import to avoid requiring simple-git at build time
let simpleGit: any = null;

async function getSimpleGit() {
  if (!simpleGit) {
    try {
      simpleGit = (await import('simple-git')).default;
    } catch (error) {
      throw new Error(
        'simple-git is not installed. Install it with: npm install simple-git'
      );
    }
  }
  return simpleGit;
}

/**
 * Create SimpleGit adapter instance
 */
export function createSimpleGitAdapter(): GitAdapter {
  return {
    async clone(
      repositoryUrl: string,
      targetPath: string,
      options?: GitCloneOptions
    ): Promise<GitCloneResult> {
      try {
        const git = await getSimpleGit();
        
        // Ensure target directory exists
        const parentDir = join(targetPath, '..');
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true });
        }

        // Prepare clone options
        const cloneOptions: string[] = [];
        if (options?.branch) {
          cloneOptions.push('--branch', options.branch);
        }
        if (options?.depth) {
          cloneOptions.push('--depth', options.depth.toString());
        }

        // Configure credentials if provided
        const env: Record<string, string> = {};
        if (options?.credentials) {
          if (options.credentials.token) {
            // For GitHub/GitLab, embed token in URL
            const url = new URL(repositoryUrl);
            url.username = options.credentials.token;
            repositoryUrl = url.toString();
          } else if (options.credentials.username && options.credentials.password) {
            const url = new URL(repositoryUrl);
            url.username = options.credentials.username;
            url.password = options.credentials.password;
            repositoryUrl = url.toString();
          }
        }

        // Clone repository
        await git().clone(repositoryUrl, targetPath, cloneOptions);

        // Get branch and commit info
        const repo = git(targetPath);
        const branch = await repo.revparse(['--abbrev-ref', 'HEAD']);
        const commit = await repo.revparse(['HEAD']);

        return {
          success: true,
          path: targetPath,
          branch: branch.trim(),
          commit: commit.trim(),
        };
      } catch (error: any) {
        return {
          success: false,
          path: targetPath,
          branch: '',
          commit: '',
          error: error.message,
        };
      }
    },

    async pull(
      repositoryPath: string,
      options?: GitPullOptions
    ): Promise<GitPullResult> {
      try {
        const git = await getSimpleGit();
        const repo = git(repositoryPath);

        // Get current commit before pull
        const beforeCommit = await repo.revparse(['HEAD']);

        // Configure credentials if provided
        if (options?.credentials) {
          if (options.credentials.token) {
            // Set up credential helper or use token in remote URL
            // This is a simplified version - in production, use proper credential management
            const remotes = await repo.getRemotes(true);
            if (remotes.length > 0) {
              const remote = remotes[0];
              const url = new URL(remote.refs.fetch);
              url.username = options.credentials.token;
              await repo.removeRemote(remote.name);
              await repo.addRemote(remote.name, url.toString());
            }
          }
        }

        // Pull changes
        const branch = options?.branch || (await repo.revparse(['--abbrev-ref', 'HEAD'])).trim();
        await repo.pull('origin', branch);

        // Get commit after pull
        const afterCommit = await repo.revparse(['HEAD']);
        const updated = beforeCommit.trim() !== afterCommit.trim();

        return {
          success: true,
          updated,
          commit: afterCommit.trim(),
        };
      } catch (error: any) {
        return {
          success: false,
          updated: false,
          error: error.message,
        };
      }
    },

    async push(
      repositoryPath: string,
      options?: GitPushOptions
    ): Promise<GitPushResult> {
      try {
        const git = await getSimpleGit();
        const repo = git(repositoryPath);

        // Configure credentials if provided
        if (options?.credentials) {
          if (options.credentials.token) {
            const remotes = await repo.getRemotes(true);
            if (remotes.length > 0) {
              const remote = remotes[0];
              const url = new URL(remote.refs.push);
              url.username = options.credentials.token;
              await repo.removeRemote(remote.name);
              await repo.addRemote(remote.name, url.toString());
            }
          }
        }

        // Get current branch
        const branch = options?.branch || (await repo.revparse(['--abbrev-ref', 'HEAD'])).trim();
        
        // Get commit before push
        const beforeCommit = await repo.revparse(['HEAD']);

        // Push changes
        const pushOptions: string[] = [];
        if (options?.force) {
          pushOptions.push('--force');
        }
        
        await repo.push('origin', branch, pushOptions);

        // Get commit after push (should be same, but verify)
        const afterCommit = await repo.revparse(['HEAD']);
        const pushed = beforeCommit.trim() === afterCommit.trim(); // If commit matches, push was successful

        return {
          success: true,
          pushed,
          commit: afterCommit.trim(),
        };
      } catch (error: any) {
        return {
          success: false,
          pushed: false,
          error: error.message,
        };
      }
    },

    async status(repositoryPath: string): Promise<GitStatus> {
      try {
        const git = await getSimpleGit();
        const repo = git(repositoryPath);

        // Check if it's a git repository
        try {
          await repo.status();
        } catch {
          return {
            isRepository: false,
            ahead: 0,
            behind: 0,
            modified: [],
            untracked: [],
          };
        }

        const status = await repo.status();
        const branch = await repo.revparse(['--abbrev-ref', 'HEAD']);
        const commit = await repo.revparse(['HEAD']);

        // Get ahead/behind counts
        try {
          const branchInfo = await repo.branchLocal();
          const currentBranch = branchInfo.current;
          const ahead = status.ahead || 0;
          const behind = status.behind || 0;

          return {
            isRepository: true,
            branch: currentBranch,
            commit: commit.trim(),
            ahead,
            behind,
            modified: status.modified || [],
            untracked: status.not_added || [],
          };
        } catch {
          return {
            isRepository: true,
            branch: branch.trim(),
            commit: commit.trim(),
            ahead: 0,
            behind: 0,
            modified: status.modified || [],
            untracked: status.not_added || [],
          };
        }
      } catch (error: any) {
        return {
          isRepository: false,
          ahead: 0,
          behind: 0,
          modified: [],
          untracked: [],
          error: error.message,
        };
      }
    },

    async getInfo(repositoryPath: string): Promise<GitRepositoryInfo> {
      try {
        const git = await getSimpleGit();
        const repo = git(repositoryPath);

        const branch = (await repo.revparse(['--abbrev-ref', 'HEAD'])).trim();
        const commit = (await repo.revparse(['HEAD'])).trim();
        const remotes = await repo.getRemotes(true);

        return {
          branch,
          commit,
          remotes: remotes.map((remote: any) => ({
            name: remote.name,
            url: remote.refs.fetch || remote.refs.push || '',
          })),
        };
      } catch (error: any) {
        throw new Error(`Failed to get repository info: ${error.message}`);
      }
    },
  };
}



