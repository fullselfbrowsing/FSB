#!/usr/bin/env node

'use strict';

import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolve(dirname(__filename), '..');
const DEFAULT_SCAN_ROOT = resolve(REPOSITORY_ROOT, 'mcp/src/agent-providers');

const FORBIDDEN_AGENT_PROVIDER_FLAGS = [
  '--dangerously-skip-permissions',
  '--yolo',
  '--auto',
];

function parseScanRoot(argv) {
  if (argv.length === 0) return DEFAULT_SCAN_ROOT;
  if (argv.length === 2 && argv[0] === '--root' && argv[1]) return resolve(argv[1]);
  throw new Error('usage: verify-agent-provider-flags.mjs [--root <path>]');
}

function displayPath(scanRoot, absolutePath) {
  const rel = relative(scanRoot, absolutePath) || '.';
  return rel.split(sep).join('/');
}

function scanSource(source, rel, diagnostics) {
  const lines = source.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const matches = [];
    for (const flag of FORBIDDEN_AGENT_PROVIDER_FLAGS) {
      let offset = lines[lineIndex].indexOf(flag);
      while (offset !== -1) {
        matches.push({ offset, flag });
        offset = lines[lineIndex].indexOf(flag, offset + flag.length);
      }
    }
    matches.sort((a, b) => a.offset - b.offset || a.flag.localeCompare(b.flag));
    for (const _match of matches) {
      diagnostics.push(`${rel}:${lineIndex + 1}: forbidden agent-provider flag`);
    }
  }
}

function scanTree(scanRoot) {
  const diagnostics = [];
  const visitedDirectories = new Set();

  function fail(rel, operation) {
    diagnostics.push(`${rel}: ${operation} failed; agent-provider scan is incomplete`);
  }

  function scanFile(pathname, rel) {
    try {
      scanSource(readFileSync(pathname, 'utf8'), rel, diagnostics);
    } catch (_error) {
      fail(rel, 'read');
    }
  }

  function visitDirectory(pathname, rel, realDirectory) {
    if (visitedDirectories.has(realDirectory)) return;
    visitedDirectories.add(realDirectory);

    let names;
    try {
      names = readdirSync(pathname).sort((a, b) => a.localeCompare(b));
    } catch (_error) {
      fail(rel, 'directory read');
      return;
    }
    for (const name of names) {
      visitNode(resolve(pathname, name));
    }
  }

  function visitNode(pathname) {
    const rel = displayPath(scanRoot, pathname);
    let linkStat;
    try {
      linkStat = lstatSync(pathname);
    } catch (_error) {
      fail(rel, 'metadata read');
      return;
    }

    if (linkStat.isSymbolicLink()) {
      let resolved;
      let targetStat;
      try {
        resolved = realpathSync(pathname);
        targetStat = statSync(resolved);
      } catch (_error) {
        fail(rel, 'symlink resolution');
        return;
      }
      if (targetStat.isFile()) {
        scanFile(pathname, rel);
      } else if (targetStat.isDirectory()) {
        visitDirectory(pathname, rel, resolved);
      }
      return;
    }

    if (linkStat.isFile()) {
      scanFile(pathname, rel);
      return;
    }
    if (linkStat.isDirectory()) {
      let realDirectory;
      try {
        realDirectory = realpathSync(pathname);
      } catch (_error) {
        fail(rel, 'directory resolution');
        return;
      }
      visitDirectory(pathname, rel, realDirectory);
    }
  }

  let rootStat;
  try {
    rootStat = lstatSync(scanRoot);
  } catch (error) {
    if (error && error.code === 'ENOENT') return diagnostics;
    fail('.', 'scan-root metadata read');
    return diagnostics;
  }

  if (!rootStat.isDirectory() && !rootStat.isSymbolicLink()) {
    fail('.', 'scan-root directory validation');
    return diagnostics;
  }
  visitNode(scanRoot);
  return diagnostics;
}

let scanRoot;
try {
  scanRoot = parseScanRoot(process.argv.slice(2));
} catch (error) {
  console.error(`verify-agent-provider-flags: FAIL (${error.message})`);
  process.exit(1);
}

const diagnostics = scanTree(scanRoot);
if (diagnostics.length > 0) {
  console.error('verify-agent-provider-flags: FAIL');
  for (const diagnostic of diagnostics) console.error(diagnostic);
  process.exit(1);
}

console.log('verify-agent-provider-flags: PASS');
