#!/usr/bin/env node

// Copies plugins/claude into a checkout of the public plugin repository
// (fullselfbrowsing/fsb-claude-plugin), whose root is what the Claude plugin
// directory validates. The monorepo cannot be submitted directly: its root
// .gitattributes uses an LFS filter and the repository is near the directory's
// size limits.
//
// Usage: node scripts/export-claude-plugin.mjs <checkout-dir> [--force]
//
// <checkout-dir> must be a git checkout whose origin is the plugin repository.
// Everything in it except .git is replaced with the plugin folder. --force
// skips the origin check (for a scratch repository), never the path checks.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectClaudePluginErrors } from './claude-plugin-checks.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = join(repositoryRoot, 'plugins', 'claude');
const PLUGIN_REPOSITORY = /(?:^|[/:])fullselfbrowsing\/fsb-claude-plugin(?:\.git)?$/u;

function fail(message) {
  console.error(`export-claude-plugin: ${message}`);
  process.exit(1);
}

function isInside(child, parent) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !path.startsWith(sep) && path !== '..');
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const positional = args.filter((arg) => arg !== '--force');
if (positional.length !== 1) fail('usage: export-claude-plugin.mjs <checkout-dir> [--force]');

const target = resolve(positional[0]);
if (!existsSync(target) || !statSync(target).isDirectory()) fail(`${target} is not a directory`);
const realTarget = realpathSync(target);
const realRepository = realpathSync(repositoryRoot);
const realHome = realpathSync(homedir());
if (isInside(realTarget, realRepository) || isInside(realRepository, realTarget)) {
  fail(`refusing ${realTarget}: it is inside or above the FSB repository`);
}
if (realTarget === realHome || isInside(realHome, realTarget)) {
  fail(`refusing ${realTarget}: it is the home directory or above it`);
}
if (!existsSync(join(realTarget, '.git'))) fail(`${realTarget} is not a git checkout (no .git)`);
if (!force) {
  const origin = spawnSync('git', ['-C', realTarget, 'remote', 'get-url', 'origin'], { encoding: 'utf8' });
  const url = (origin.stdout || '').trim();
  if (origin.status !== 0 || !PLUGIN_REPOSITORY.test(url)) {
    fail(`${realTarget} origin is ${JSON.stringify(url)}, not fullselfbrowsing/fsb-claude-plugin (use --force for a scratch repository)`);
  }
}

const mcpVersion = JSON.parse(readFileSync(join(repositoryRoot, 'mcp', 'package.json'), 'utf8')).version;
const errors = collectClaudePluginErrors(pluginRoot, { mcpVersion });
if (errors.length > 0) fail(`plugins/claude fails its checks:\n- ${errors.join('\n- ')}`);

for (const name of readdirSync(realTarget)) {
  if (name === '.git') continue;
  rmSync(join(realTarget, name), { recursive: true, force: true });
}
cpSync(pluginRoot, realTarget, { recursive: true });

const exported = collectClaudePluginErrors(realTarget, { mcpVersion });
if (exported.length > 0) fail(`exported copy fails its checks:\n- ${exported.join('\n- ')}`);
console.log(`export-claude-plugin: exported plugin ${mcpVersion} to ${realTarget}`);
