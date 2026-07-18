#!/usr/bin/env node

'use strict';

import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolve(dirname(__filename), '..');
const MAX_SOURCE_BYTES = 256 * 1024;
const EXPECTED_SOURCE_GRAPH = Object.freeze([
  'constants.ts',
  'daemon.ts',
  'entry.ts',
  'index.ts',
  'platform.ts',
  'protocol.ts',
  'runtime-layout.ts',
]);
const EXPECTED_COMPILED_GRAPH = Object.freeze(
  EXPECTED_SOURCE_GRAPH.map((entry) => entry.replace(/\.ts$/u, '.js')),
);
const ALLOWED_CORE_IMPORTS = Object.freeze({
  'daemon.ts': new Set(['node:path']),
  'daemon.js': new Set(['node:path']),
  'platform.ts': new Set([
    'node:child_process',
    'node:crypto',
    'node:fs/promises',
    'node:http',
    'node:path',
    'node:url',
  ]),
  'platform.js': new Set([
    'node:child_process',
    'node:crypto',
    'node:fs/promises',
    'node:http',
    'node:path',
    'node:url',
  ]),
  'protocol.ts': new Set(['node:os']),
  'protocol.js': new Set(['node:os']),
  'runtime-layout.ts': new Set(['node:path']),
  'runtime-layout.js': new Set(['node:path']),
});

const GRAPH_CONFIG = Object.freeze({
  source: Object.freeze({
    root: resolve(REPOSITORY_ROOT, 'mcp/src/native-host'),
    entry: resolve(REPOSITORY_ROOT, 'mcp/src/native-host/index.ts'),
    expected: EXPECTED_SOURCE_GRAPH,
  }),
  compiled: Object.freeze({
    root: resolve(REPOSITORY_ROOT, 'mcp/build/native-host'),
    entry: resolve(REPOSITORY_ROOT, 'mcp/build/native-host/index.js'),
    expected: EXPECTED_COMPILED_GRAPH,
  }),
});

const FORBIDDEN_TOKENS = Object.freeze([
  ['agent-provider authority', /agent-providers|spawn-supervisor/iu],
  ['task or prompt authority', /(?:^|[^A-Za-z])(?:task|prompt|delegation)(?:[^A-Za-z]|$)/iu],
  ['browser or tab authority', /(?:^|[^A-Za-z])(?:browser|tabs?|tab-state)(?:[^A-Za-z]|$)/iu],
  ['bridge authentication authority', /bridge-auth|session-secret|session_secret/iu],
  ['installer authority', /native-host-install|(?:^|[/\\])install\.(?:ts|js)\b/iu],
  ['doctor or diagnostics authority', /(?:^|[/_.-])(?:doctor|diagnostics?)(?:[/_.-]|$)/iu],
  ['CLI router authority', /mcp[/\\](?:src|build)[/\\]index\.(?:ts|js)/iu],
  ['historical native IPC authority', /com\.fsb\.mcp|native-host-shim|mcp-to-ext|ext-to-mcp|ipc[-_ ]relay|echo[-_ ]mode/iu],
]);

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function verifyProductionAuthority(sources, diagnostics) {
  const daemon = sources.get('daemon.ts') ?? sources.get('daemon.js') ?? '';
  const platform = sources.get('platform.ts') ?? sources.get('platform.js') ?? '';
  const entry = sources.get('entry.ts') ?? sources.get('entry.js') ?? '';
  const executable = sources.get('index.ts') ?? sources.get('index.js') ?? '';

  const exactTuple = /\[\s*runtime\.absoluteStableBuildIndex,\s*['"]serve['"],\s*['"]--host['"],\s*['"]127\.0\.0\.1['"],\s*['"]--port['"],\s*['"]7226['"],?\s*\]/gu;
  if (countMatches(daemon, exactTuple) !== 1) {
    diagnostics.push('daemon: exact serve argv tuple is not uniquely pinned');
  }
  if (
    countMatches(
      daemon,
      /dependencies\.spawn\(\s*runtime\.absoluteNode,\s*argv,\s*options\s*\)/gu,
    ) !== 1
    || countMatches(daemon, /dependencies\.spawn\s*\(/gu) !== 1
  ) {
    diagnostics.push('daemon: exact absolute-Node spawn edge is not uniquely pinned');
  }
  for (const [label, pattern] of [
    ['shell false', /\bshell:\s*false\b/gu],
    ['detached true', /\bdetached:\s*true\b/gu],
    ['ignored stdio', /\bstdio:\s*['"]ignore['"]/gu],
    ['hidden Windows console', /\bwindowsHide:\s*true\b/gu],
  ]) {
    if (countMatches(daemon, pattern) !== 1) {
      diagnostics.push(`daemon: ${label} is not uniquely pinned`);
    }
  }
  if (
    countMatches(platform, /\bspawnChild\(\s*command,\s*\[\.\.\.argv\],\s*options\s*\)/gu) !== 1
    || countMatches(platform, /\bspawnChild\s*\(/gu) !== 1
    || countMatches(
      platform,
      /import\s*\{\s*spawn\s+as\s+spawnChild\s*\}\s*from\s+['"]node:child_process['"]/gu,
    ) !== 1
    || /\b(?:fork|exec|execSync|execFile|execFileSync|spawnSync)\s*\(/u.test(platform)
  ) {
    diagnostics.push('platform: child-process authority is not the one injected spawn edge');
  }
  if (/\b(?:process\.kill|\.kill\s*\(|SIGTERM|SIGKILL|SIGINT)\b/u.test(`${daemon}\n${platform}`)) {
    diagnostics.push('daemon: process signaling authority is forbidden');
  }
  if (/\b(?:rm|rmSync)\s*\(|recursive\s*:\s*true/u.test(platform)) {
    diagnostics.push('platform: recursive wake-lock deletion authority is forbidden');
  }
  if (countMatches(entry, /wakeServeDaemon\s*\(/gu) !== 1) {
    diagnostics.push('entry: wakeServeDaemon must be invoked exactly once');
  }
  if (
    countMatches(executable, /runProductionNativeHostEntry\s*\(\s*productionEnvironment\s*\)/gu) !== 1
  ) {
    diagnostics.push('index: production one-shot entry must be invoked exactly once');
  }
}

function parseModes(argv) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === '--all')) {
    return ['source', 'compiled'];
  }
  if (argv.length === 1 && argv[0] === '--source') return ['source'];
  if (argv.length === 1 && argv[0] === '--compiled') return ['compiled'];
  throw new Error('usage: verify-native-host-boundary.mjs [--source|--compiled|--all]');
}

function display(root, pathname) {
  const value = relative(root, pathname) || '.';
  return value.split(sep).join('/');
}

function isWithin(root, pathname) {
  const value = relative(root, pathname);
  return value === '' || (!value.startsWith(`..${sep}`) && value !== '..' && !value.startsWith(sep));
}

function readRegularFile(pathname, diagnostics, graphRoot) {
  try {
    const stat = lstatSync(pathname);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_SOURCE_BYTES) {
      diagnostics.push(`${display(graphRoot, pathname)}: invalid graph file`);
      return null;
    }
    return readFileSync(pathname, 'utf8');
  } catch (_error) {
    diagnostics.push(`${display(graphRoot, pathname)}: graph file is unreadable`);
    return null;
  }
}

function collectImportSpecifiers(source, rel, diagnostics) {
  const specifiers = [];
  const fromPattern = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[\s\S]*?\sfrom\s*(['"])([^'"\r\n]+)\1\s*;?/gu;
  const barePattern = /(?:^|\n)\s*import\s*(['"])([^'"\r\n]+)\1\s*;?/gu;
  const dynamicPattern = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/gu;
  let match;
  while ((match = fromPattern.exec(source)) !== null) specifiers.push(match[2]);
  while ((match = barePattern.exec(source)) !== null) specifiers.push(match[2]);
  while ((match = dynamicPattern.exec(source)) !== null) {
    diagnostics.push(`${rel}: dynamic import is forbidden`);
  }
  if (/\brequire\s*\(/u.test(source)) {
    diagnostics.push(`${rel}: require call is forbidden`);
  }
  return [...new Set(specifiers)];
}

function resolveLocalImport(importer, specifier, mode, graphRoot, diagnostics) {
  const unresolved = resolve(dirname(importer), specifier);
  if (!isWithin(graphRoot, unresolved)) {
    diagnostics.push(`${display(graphRoot, importer)}: local import escapes native-host graph`);
    return null;
  }
  const candidates = [unresolved];
  if (mode === 'source' && extname(unresolved) === '.js') {
    candidates.push(`${unresolved.slice(0, -3)}.ts`);
  }
  for (const candidate of candidates) {
    try {
      const stat = lstatSync(candidate);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      const real = realpathSync(candidate);
      if (!isWithin(realpathSync(graphRoot), real)) {
        diagnostics.push(`${display(graphRoot, importer)}: local import resolves outside graph`);
        return null;
      }
      return real;
    } catch (_error) {
      // Try the next closed candidate.
    }
  }
  diagnostics.push(`${display(graphRoot, importer)}: unresolved local import`);
  return null;
}

function scanMode(mode) {
  const config = GRAPH_CONFIG[mode];
  const diagnostics = [];
  const pending = [config.entry];
  const visited = new Set();
  const sources = new Map();

  while (pending.length > 0) {
    const pathname = pending.pop();
    let real;
    try {
      real = realpathSync(pathname);
    } catch (_error) {
      diagnostics.push(`${display(config.root, pathname)}: graph entry is missing`);
      continue;
    }
    if (visited.has(real)) continue;
    visited.add(real);
    const rel = display(config.root, real);
    const source = readRegularFile(real, diagnostics, config.root);
    if (source === null) continue;
    sources.set(rel, source);

    for (const [label, pattern] of FORBIDDEN_TOKENS) {
      if (pattern.test(`${rel}\n${source}`)) diagnostics.push(`${rel}: forbidden ${label}`);
    }

    for (const specifier of collectImportSpecifiers(source, rel, diagnostics)) {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const resolved = resolveLocalImport(real, specifier, mode, config.root, diagnostics);
        if (resolved) pending.push(resolved);
        continue;
      }
      if (!(ALLOWED_CORE_IMPORTS[rel]?.has(specifier))) {
        diagnostics.push(`${rel}: forbidden external import`);
      }
    }
  }

  const actual = [...visited]
    .map((pathname) => display(config.root, pathname))
    .sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(actual) !== JSON.stringify(config.expected)) {
    diagnostics.push(`${mode}: native-host graph does not match the exact leaf roster`);
  }
  verifyProductionAuthority(sources, diagnostics);
  return diagnostics;
}

let modes;
try {
  modes = parseModes(process.argv.slice(2));
} catch (error) {
  console.error(`verify-native-host-boundary: FAIL (${error.message})`);
  process.exit(1);
}

const diagnostics = modes.flatMap((mode) => scanMode(mode));
if (diagnostics.length > 0) {
  console.error('verify-native-host-boundary: FAIL');
  for (const diagnostic of diagnostics) console.error(diagnostic);
  process.exit(1);
}

console.log(`verify-native-host-boundary: PASS (${modes.join('+')})`);
