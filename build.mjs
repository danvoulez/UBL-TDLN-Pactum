import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

console.log('📦 Building Universal Business Ledger...');

// Build the antenna server as a bundle
await esbuild.build({
  entryPoints: ['antenna/server.ts'],
  outfile: 'dist/antenna/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  packages: 'external', // Don't bundle node_modules
  logLevel: 'info',
  banner: {
    js: '// Universal Business Ledger - Antenna Server\n'
  }
});

// Build the CLI as a bundle
await esbuild.build({
  entryPoints: ['cli/ledger.ts'],
  outfile: 'dist/cli/ledger.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  packages: 'external',
  logLevel: 'info',
  banner: {
    js: '#!/usr/bin/env node\n// Universal Business Ledger - CLI\n'
  }
});

// Build the core library as a bundle
await esbuild.build({
  entryPoints: ['core/index.ts'],
  outfile: 'dist/core/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  packages: 'external',
  logLevel: 'info',
});

// Build the SDK
await esbuild.build({
  entryPoints: ['sdk/index.ts'],
  outfile: 'dist/sdk/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  packages: 'external',
  logLevel: 'info',
});

// Build the worker
await esbuild.build({
  entryPoints: ['workers/job-processor.ts'],
  outfile: 'dist/workers/job-processor.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  packages: 'external',
  logLevel: 'info',
});

// Build the migrate CLI
await esbuild.build({
  entryPoints: ['cli/migrate.ts'],
  outfile: 'dist/cli/migrate.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  packages: 'external',
  logLevel: 'info',
  banner: {
    js: '#!/usr/bin/env node\n// Universal Business Ledger - Migration CLI\n'
  }
});

// Build the UUID diagnostic CLI
await esbuild.build({
  entryPoints: ['cli/diagnostico-uuid.ts'],
  outfile: 'dist/cli/diagnostico-uuid.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  packages: 'external',
  logLevel: 'info',
});

// Build the DB migrate CLI
await esbuild.build({
  entryPoints: ['cli/db-migrate.ts'],
  outfile: 'dist/cli/db-migrate.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  packages: 'external',
  logLevel: 'info',
  banner: {
    js: '#!/usr/bin/env node\n// Universal Business Ledger - DB Migrate CLI\n'
  }
});

// Build the DB status CLI
await esbuild.build({
  entryPoints: ['cli/db-status.ts'],
  outfile: 'dist/cli/db-status.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  packages: 'external',
  logLevel: 'info',
  banner: {
    js: '#!/usr/bin/env node\n// Universal Business Ledger - DB Status CLI\n'
  }
});

// Build the DB reset CLI
await esbuild.build({
  entryPoints: ['cli/db-reset.ts'],
  outfile: 'dist/cli/db-reset.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  packages: 'external',
  logLevel: 'info'
});

// Build the reset database CLI
await esbuild.build({
  entryPoints: ['cli/reset-db.ts'],
  outfile: 'dist/cli/reset-db.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  packages: 'external',
  logLevel: 'info'
});

// Copy SQL schema file to dist
console.log('📋 Copying SQL schema file...');
try {
  mkdirSync('dist/core/store', { recursive: true });
  copyFileSync('core/store/postgres-schema.sql', 'dist/core/store/postgres-schema.sql');
  console.log('✅ SQL schema copied');
} catch (error) {
  console.warn('⚠️  Could not copy SQL schema file:', error.message);
}

console.log('✅ Build complete!');

