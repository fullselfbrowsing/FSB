#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_GIT_OUTPUT_BYTES = 32 * 1024 * 1024;
const MAX_COMMANDS_JSON_BYTES = 64 * 1024;
const MAX_COMMANDS = 32;
const MAX_ARGV_LENGTH = 64;
const MAX_ARGUMENT_BYTES = 8 * 1024;

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = process.env.FSB_MCP_BUILD_PRESERVING_REPOSITORY_ROOT
  ? resolve(process.env.FSB_MCP_BUILD_PRESERVING_REPOSITORY_ROOT)
  : resolve(dirname(scriptPath), '..');
const buildRoot = resolve(repositoryRoot, 'mcp/build');

function lstatIfPresent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertInsideRepository(path, label) {
  const repositoryRelativePath = relative(repositoryRoot, path);
  if (
    repositoryRelativePath === '..'
    || repositoryRelativePath.startsWith(`..${sep}`)
    || isAbsolute(repositoryRelativePath)
  ) {
    throw new Error(`${label} resolved outside the repository`);
  }
  return repositoryRelativePath;
}

function runGit(args, label) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    shell: false,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`${label} failed`);
  }
  return Buffer.from(result.stdout);
}

function parseNulPaths(bytes) {
  return bytes.toString('utf8').split('\0').filter(Boolean);
}

function hashFields(fields) {
  const hash = createHash('sha256');
  for (const field of fields) {
    const bytes = Buffer.isBuffer(field) ? field : Buffer.from(String(field));
    hash.update(String(bytes.length));
    hash.update(':');
    hash.update(bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function captureEntry(absolutePath, label) {
  const stat = lstatIfPresent(absolutePath);
  if (!stat) return Object.freeze({ label, kind: 'missing' });
  if (stat.isSymbolicLink()) {
    return Object.freeze({
      label,
      kind: 'symlink',
      target: readlinkSync(absolutePath),
    });
  }
  if (stat.isFile()) {
    return Object.freeze({
      label,
      kind: 'file',
      mode: stat.mode & 0o7777,
      bytes: Buffer.from(readFileSync(absolutePath)),
    });
  }
  if (stat.isDirectory()) {
    return Object.freeze({
      label,
      kind: 'directory',
      mode: stat.mode & 0o7777,
    });
  }
  throw new Error(`${label} has an unsupported filesystem type`);
}

function entryFingerprint(entry) {
  const fields = [entry.label, entry.kind];
  if (entry.kind === 'file') fields.push(entry.mode, entry.bytes);
  if (entry.kind === 'directory') fields.push(entry.mode);
  if (entry.kind === 'symlink') fields.push(entry.target);
  return hashFields(fields);
}

function captureTree(root) {
  const entries = [];

  function visit(absolutePath, relativePath) {
    const label = relativePath || '.';
    const entry = captureEntry(absolutePath, label);
    entries.push(Object.freeze({ ...entry, relativePath }));
    if (entry.kind !== 'directory') return;
    for (const name of readdirSync(absolutePath).sort()) {
      visit(resolve(absolutePath, name), relativePath ? `${relativePath}/${name}` : name);
    }
  }

  visit(root, '');
  return Object.freeze(entries);
}

function treeFingerprint(entries) {
  return hashFields(entries.map(entryFingerprint));
}

function removeEntry(absolutePath) {
  const stat = lstatIfPresent(absolutePath);
  if (!stat) return;
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    rmSync(absolutePath, { recursive: true, force: true });
    return;
  }
  unlinkSync(absolutePath);
}

function restoreSingleEntry(absolutePath, snapshot) {
  removeEntry(absolutePath);
  if (snapshot.kind === 'missing') return;
  mkdirSync(dirname(absolutePath), { recursive: true });
  if (snapshot.kind === 'file') {
    writeFileSync(absolutePath, snapshot.bytes, { flag: 'wx', mode: snapshot.mode });
    chmodSync(absolutePath, snapshot.mode);
    return;
  }
  if (snapshot.kind === 'symlink') {
    symlinkSync(snapshot.target, absolutePath);
    return;
  }
  if (snapshot.kind === 'directory') {
    mkdirSync(absolutePath, { mode: snapshot.mode });
    chmodSync(absolutePath, snapshot.mode);
    return;
  }
  throw new Error(`cannot restore unsupported ${snapshot.label} entry`);
}

function restoreTree(root, snapshot) {
  removeEntry(root);
  if (snapshot.length === 1 && snapshot[0].kind === 'missing') return;

  const directories = snapshot
    .filter((entry) => entry.kind === 'directory')
    .sort((left, right) => left.relativePath.split('/').length - right.relativePath.split('/').length);
  for (const entry of directories) {
    const absolutePath = entry.relativePath
      ? resolve(root, entry.relativePath)
      : root;
    mkdirSync(absolutePath, { mode: entry.mode });
  }

  for (const entry of snapshot) {
    if (entry.kind === 'directory' || entry.kind === 'missing') continue;
    const absolutePath = entry.relativePath
      ? resolve(root, entry.relativePath)
      : root;
    if (entry.kind === 'file') {
      writeFileSync(absolutePath, entry.bytes, { flag: 'wx', mode: entry.mode });
      chmodSync(absolutePath, entry.mode);
    } else if (entry.kind === 'symlink') {
      symlinkSync(entry.target, absolutePath);
    } else {
      throw new Error(`cannot restore unsupported build entry ${entry.label}`);
    }
  }

  for (const entry of [...directories].reverse()) {
    const absolutePath = entry.relativePath
      ? resolve(root, entry.relativePath)
      : root;
    chmodSync(absolutePath, entry.mode);
  }
}

function captureWorkspaceState(label) {
  const status = runGit(
    ['status', '--short', '-z', '--untracked-files=all'],
    `${label} status capture`,
  );
  const unstaged = runGit(
    ['diff', '--name-only', '-z', '--no-ext-diff', '--no-textconv'],
    `${label} unstaged capture`,
  );
  const staged = runGit(
    ['diff', '--cached', '--name-only', '-z', '--no-ext-diff', '--no-textconv'],
    `${label} staged capture`,
  );
  const untracked = runGit(
    ['ls-files', '--others', '--exclude-standard', '-z'],
    `${label} untracked capture`,
  );
  const indexEntries = runGit(
    ['ls-files', '--stage', '-z'],
    `${label} index entries capture`,
  );
  const dirtyPaths = [...new Set([
    ...parseNulPaths(unstaged),
    ...parseNulPaths(staged),
    ...parseNulPaths(untracked),
  ])].sort();
  return Object.freeze({
    status,
    unstaged,
    staged,
    untracked,
    indexEntries,
    dirtyPaths: Object.freeze(dirtyPaths),
    fingerprint: hashFields([status, unstaged, staged, untracked, indexEntries]),
  });
}

function isBuildPath(relativePath) {
  return relativePath === 'mcp/build' || relativePath.startsWith('mcp/build/');
}

function snapshotUnrelatedDirtyEntries(paths) {
  return Object.freeze(paths
    .filter((relativePath) => !isBuildPath(relativePath))
    .map((relativePath) => {
      const absolutePath = resolve(repositoryRoot, relativePath);
      assertInsideRepository(absolutePath, 'dirty workspace path');
      return Object.freeze({
        relativePath,
        entry: captureEntry(absolutePath, relativePath),
      });
    }));
}

function unrelatedDirtyFingerprint(entries) {
  return hashFields(entries.map(({ relativePath, entry }) => (
    hashFields([relativePath, entryFingerprint(entry)])
  )));
}

function captureCurrentUnrelatedDirtyEntries(entries) {
  return Object.freeze(entries.map(({ relativePath }) => Object.freeze({
    relativePath,
    entry: captureEntry(resolve(repositoryRoot, relativePath), relativePath),
  })));
}

function restoreUnrelatedDirtyEntries(entries) {
  for (const { relativePath, entry } of entries) {
    restoreSingleEntry(resolve(repositoryRoot, relativePath), entry);
  }
}

function resolveIndexPath() {
  const rawPath = runGit(['rev-parse', '--git-path', 'index'], 'Git index path capture')
    .toString('utf8')
    .trim();
  if (!rawPath || rawPath.includes('\0') || rawPath.includes('\n') || rawPath.includes('\r')) {
    throw new Error('Git returned an invalid index path');
  }
  return isAbsolute(rawPath) ? resolve(rawPath) : resolve(repositoryRoot, rawPath);
}

function parseCommands(argv) {
  if (argv.length !== 2 || argv[0] !== '--commands-json') {
    throw new Error('usage: run-mcp-build-preserving-workspace.mjs --commands-json <json>');
  }
  if (Buffer.byteLength(argv[1], 'utf8') > MAX_COMMANDS_JSON_BYTES) {
    throw new Error('commands JSON exceeds the allowed byte limit');
  }
  let parsed;
  try {
    parsed = JSON.parse(argv[1]);
  } catch {
    throw new Error('commands JSON must be valid JSON');
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_COMMANDS) {
    throw new Error('commands JSON must be a bounded non-empty array');
  }
  for (const command of parsed) {
    if (!Array.isArray(command) || command.length < 1 || command.length > MAX_ARGV_LENGTH) {
      throw new Error('every command must be a bounded non-empty argv array');
    }
    for (const argument of command) {
      if (
        typeof argument !== 'string'
        || argument.length === 0
        || argument.includes('\0')
        || Buffer.byteLength(argument, 'utf8') > MAX_ARGUMENT_BYTES
      ) {
        throw new Error('every command argument must be a bounded non-empty string');
      }
    }
  }
  return Object.freeze(parsed.map((command) => Object.freeze([...command])));
}

let activeChild = null;
let receivedSignal = null;

function onSignal(signal) {
  if (receivedSignal) return;
  receivedSignal = signal;
  if (activeChild && activeChild.exitCode === null && activeChild.signalCode === null) {
    try {
      activeChild.kill(signal);
    } catch {
      // Cleanup and the final workspace comparison remain authoritative.
    }
  }
}

process.on('SIGINT', () => onSignal('SIGINT'));
process.on('SIGTERM', () => onSignal('SIGTERM'));

function runArgv(command, label) {
  return new Promise((resolveResult) => {
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      activeChild = null;
      resolveResult(result);
    };
    try {
      const child = spawn(command[0], command.slice(1), {
        cwd: repositoryRoot,
        env: process.env,
        stdio: 'inherit',
        shell: false,
      });
      activeChild = child;
      child.once('error', (error) => settle(Object.freeze({ label, error })));
      child.once('exit', (status, signal) => settle(Object.freeze({ label, status, signal })));
      if (receivedSignal) {
        try {
          child.kill(receivedSignal);
        } catch {
          // The exit/error event supplies the primary result.
        }
      }
    } catch (error) {
      settle(Object.freeze({ label, error }));
    }
  });
}

function resultFailure(result) {
  if (result.error) return `${result.label} could not be spawned`;
  if (result.signal) return `${result.label} exited from ${result.signal}`;
  if (!Number.isInteger(result.status)) return `${result.label} returned no exit status`;
  if (result.status !== 0) return `${result.label} exited ${result.status}`;
  return null;
}

const failures = [];
let primaryExitCode = 0;
let workspaceBefore;
let buildBefore;
let buildFingerprintBefore;
let indexPath;
let indexBefore;
let unrelatedBefore;
let unrelatedFingerprintBefore;

try {
  const commands = parseCommands(process.argv.slice(2));
  assertInsideRepository(buildRoot, 'MCP build root');
  workspaceBefore = captureWorkspaceState('initial');
  buildBefore = captureTree(buildRoot);
  buildFingerprintBefore = treeFingerprint(buildBefore);
  indexPath = resolveIndexPath();
  indexBefore = captureEntry(indexPath, 'Git index');
  if (indexBefore.kind !== 'file') {
    throw new Error('Git index must be an existing regular file');
  }
  unrelatedBefore = snapshotUnrelatedDirtyEntries(workspaceBefore.dirtyPaths);
  unrelatedFingerprintBefore = unrelatedDirtyFingerprint(unrelatedBefore);

  const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const buildResult = await runArgv(
    [npmExecutable, '--prefix', 'mcp', 'run', 'build'],
    'MCP build',
  );
  const buildFailure = resultFailure(buildResult);
  if (buildFailure) {
    failures.push(buildFailure);
    primaryExitCode = Number.isInteger(buildResult.status) && buildResult.status !== 0
      ? buildResult.status
      : 1;
  }

  if (!buildFailure && !receivedSignal) {
    for (let index = 0; index < commands.length; index += 1) {
      const result = await runArgv(commands[index], `command ${index + 1}`);
      const failure = resultFailure(result);
      if (failure) {
        failures.push(failure);
        primaryExitCode = Number.isInteger(result.status) && result.status !== 0
          ? result.status
          : 1;
        break;
      }
      if (receivedSignal) break;
    }
  }
} catch (error) {
  if (primaryExitCode === 0) primaryExitCode = 1;
  failures.push(error instanceof Error ? error.message : 'wrapper execution failed');
} finally {
  if (receivedSignal) {
    failures.push(`wrapper received ${receivedSignal}`);
    if (primaryExitCode === 0) primaryExitCode = receivedSignal === 'SIGINT' ? 130 : 143;
  }

  if (indexBefore && indexPath) {
    try {
      const indexDuring = captureEntry(indexPath, 'Git index');
      if (entryFingerprint(indexDuring) !== entryFingerprint(indexBefore)) {
        failures.push('Git index bytes or mode changed during the guarded lifecycle');
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'Git index mutation check failed');
    }
  }

  if (unrelatedBefore) {
    try {
      const unrelatedDuring = captureCurrentUnrelatedDirtyEntries(unrelatedBefore);
      if (unrelatedDirtyFingerprint(unrelatedDuring) !== unrelatedFingerprintBefore) {
        failures.push('pre-existing unrelated dirty or untracked bytes changed during the guarded lifecycle');
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'unrelated workspace mutation check failed');
    }
  }

  if (buildBefore) {
    try {
      restoreTree(buildRoot, buildBefore);
    } catch (error) {
      failures.push(error instanceof Error
        ? `MCP build tree restoration failed: ${error.message}`
        : 'MCP build tree restoration failed');
    }
  }

  if (indexBefore && indexPath) {
    try {
      restoreSingleEntry(indexPath, indexBefore);
    } catch (error) {
      failures.push(error instanceof Error
        ? `Git index restoration failed: ${error.message}`
        : 'Git index restoration failed');
    }
  }

  if (unrelatedBefore) {
    try {
      restoreUnrelatedDirtyEntries(unrelatedBefore);
    } catch (error) {
      failures.push(error instanceof Error
        ? `unrelated dirty workspace restoration failed: ${error.message}`
        : 'unrelated dirty workspace restoration failed');
    }
  }

  if (buildBefore) {
    try {
      if (treeFingerprint(captureTree(buildRoot)) !== buildFingerprintBefore) {
        failures.push('MCP build tree identity differs after restoration');
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'MCP build tree verification failed');
    }
  }

  if (indexBefore && indexPath) {
    try {
      if (entryFingerprint(captureEntry(indexPath, 'Git index')) !== entryFingerprint(indexBefore)) {
        failures.push('Git index identity differs after restoration');
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'Git index verification failed');
    }
  }

  if (unrelatedBefore) {
    try {
      const unrelatedAfter = captureCurrentUnrelatedDirtyEntries(unrelatedBefore);
      if (unrelatedDirtyFingerprint(unrelatedAfter) !== unrelatedFingerprintBefore) {
        failures.push('unrelated dirty workspace identity differs after restoration');
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'unrelated workspace verification failed');
    }
  }

  if (workspaceBefore) {
    try {
      const workspaceAfter = captureWorkspaceState('final');
      if (workspaceAfter.fingerprint !== workspaceBefore.fingerprint) {
        failures.push('Git status, dirty paths, index entries, or untracked listing changed');
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'final workspace comparison failed');
    }
  }
}

if (failures.length > 0) {
  for (const failure of [...new Set(failures)]) {
    console.error(`[mcp-build-preserver] ${failure}`);
  }
  process.exit(primaryExitCode || 1);
}

console.log('[mcp-build-preserver] PASS: MCP build and commands completed with workspace identity preserved');
