#!/usr/bin/env node
// Builds the Chrome Web Store-ready archive from extension/ only.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EXT_ROOT = join(ROOT, 'extension');
const DIST_DIR = join(ROOT, 'dist');

function fail(message) {
  console.error(`package-extension: ${message}`);
  process.exit(1);
}

const manifestPath = join(EXT_ROOT, 'manifest.json');
if (!existsSync(manifestPath)) {
  fail('extension/manifest.json not found');
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(`extension/manifest.json is not valid JSON: ${error.message}`);
}

if (!/^(\d+\.){2,3}\d+$/.test(manifest.version || '')) {
  fail(`extension/manifest.json version "${manifest.version}" is not a Chrome extension version`);
}

mkdirSync(DIST_DIR, { recursive: true });

const zipName = `fsb-extension-v${manifest.version}.zip`;
const zipPath = join(DIST_DIR, zipName);
rmSync(zipPath, { force: true });

const excludes = [
  '.DS_Store',
  '*/.DS_Store',
  '*.log',
  '*.tmp',
  '*.temp',
  '*.pem',
  'config/secrets.json',
  'config/dev-*',
  'config/local-*',
  'node_modules/*',
  'build/*',
];

try {
  execFileSync('zip', ['-r', '-q', zipPath, '.', '-x', ...excludes], {
    cwd: EXT_ROOT,
    stdio: 'inherit',
  });
} catch (error) {
  if (error.code === 'ENOENT') {
    fail('zip CLI is required to build the extension archive');
  }
  process.exit(error.status || 1);
}

console.log(`package-extension: wrote ${zipPath.replace(`${ROOT}/`, '')}`);
