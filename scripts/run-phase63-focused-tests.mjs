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
const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), '..');
const buildRoot = resolve(repositoryRoot, 'mcp/build');
const innerWrapperPath = resolve(repositoryRoot, 'scripts/run-mcp-build-preserving-workspace.mjs');

const PHASE63_ROOT_COMMANDS = Object.freeze([
  'node tests/mcp-native-host-packaging.test.js --section workflow-and-pack',
  'node tests/mcp-native-host-protocol.test.js',
  'node tests/mcp-native-host-daemon.test.js',
  'node tests/mcp-native-host-install.test.js',
  'node tests/native-host-background-wake.test.js',
]);

const COMPILED_COMMANDS = Object.freeze([
  Object.freeze(['node', 'tests/mcp-native-host-packaging.test.js', '--section', 'workspace-preserving-build']),
  Object.freeze(['node', 'tests/mcp-native-host-packaging.test.js', '--section', 'runtime-layout']),
  Object.freeze(['node', 'tests/mcp-native-host-packaging.test.js', '--section', 'workflow-and-pack']),
  Object.freeze(['node', 'tests/mcp-native-host-protocol.test.js']),
  Object.freeze(['node', 'tests/mcp-native-host-daemon.test.js']),
  Object.freeze(['node', 'tests/mcp-native-host-install.test.js']),
  Object.freeze(['node', 'tests/native-host-background-wake.test.js']),
  Object.freeze(['node', 'tests/mcp-bridge-background-dispatch.test.js']),
  Object.freeze(['node', 'tests/mcp-diagnostics-status.test.js']),
  Object.freeze(['node', 'tests/mcp-install-platforms.test.js']),
  Object.freeze(['node', 'tests/delegation-sidepanel-ui.test.js']),
  Object.freeze(['node', 'tests/mcp-bridge-topology.test.js']),
  Object.freeze(['node', 'tests/mcp-version-parity.test.js']),
  Object.freeze(['node', 'tests/delegation-phase-contract.test.js']),
]);

function lstatIfPresent(target) {
  try {
    return lstatSync(target);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertInsideRepository(target, label) {
  const repositoryRelativePath = relative(repositoryRoot, target);
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

function nulPaths(bytes) {
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
    return Object.freeze({ label, kind: 'symlink', target: readlinkSync(absolutePath) });
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
    return Object.freeze({ label, kind: 'directory', mode: stat.mode & 0o7777 });
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

function removeEntry(absolutePath) {
  const stat = lstatIfPresent(absolutePath);
  if (!stat) return;
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    rmSync(absolutePath, { recursive: true, force: true });
    return;
  }
  unlinkSync(absolutePath);
}

function restoreEntry(absolutePath, snapshot) {
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
  throw new Error(`cannot restore unsupported entry ${snapshot.label}`);
}

function captureTree(root) {
  const entries = [];
  function visit(absolutePath, relativePath) {
    const entry = captureEntry(absolutePath, relativePath || '.');
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

function restoreTree(root, snapshot) {
  removeEntry(root);
  if (snapshot.length === 1 && snapshot[0].kind === 'missing') return;
  const directories = snapshot
    .filter((entry) => entry.kind === 'directory')
    .sort((left, right) => left.relativePath.split('/').length - right.relativePath.split('/').length);
  for (const entry of directories) {
    const absolutePath = entry.relativePath ? resolve(root, entry.relativePath) : root;
    mkdirSync(absolutePath, { mode: entry.mode });
  }
  for (const entry of snapshot) {
    if (entry.kind === 'directory' || entry.kind === 'missing') continue;
    const absolutePath = entry.relativePath ? resolve(root, entry.relativePath) : root;
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
    chmodSync(entry.relativePath ? resolve(root, entry.relativePath) : root, entry.mode);
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
    `${label} index-entry capture`,
  );
  return Object.freeze({
    status,
    unstaged,
    staged,
    untracked,
    indexEntries,
    trackedDirtyPaths: Object.freeze([...new Set([
      ...nulPaths(unstaged),
      ...nulPaths(staged),
    ])].sort()),
    untrackedPaths: Object.freeze(nulPaths(untracked).sort()),
    fingerprint: hashFields([status, unstaged, staged, untracked, indexEntries]),
  });
}

function isBuildPath(relativePath) {
  return relativePath === 'mcp/build' || relativePath.startsWith('mcp/build/');
}

function snapshotWorkspaceEntries(paths) {
  return Object.freeze(paths
    .filter((relativePath) => !isBuildPath(relativePath))
    .map((relativePath) => {
      const absolutePath = resolve(repositoryRoot, relativePath);
      assertInsideRepository(absolutePath, 'workspace path');
      return Object.freeze({
        relativePath,
        entry: captureEntry(absolutePath, relativePath),
      });
    }));
}

function entriesFingerprint(entries) {
  return hashFields(entries.map(({ relativePath, entry }) => (
    hashFields([relativePath, entryFingerprint(entry)])
  )));
}

function captureCurrentEntries(entries) {
  return Object.freeze(entries.map(({ relativePath }) => Object.freeze({
    relativePath,
    entry: captureEntry(resolve(repositoryRoot, relativePath), relativePath),
  })));
}

function restoreWorkspaceEntries(entries) {
  for (const { relativePath, entry } of entries) {
    restoreEntry(resolve(repositoryRoot, relativePath), entry);
  }
}

function exactOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function assertStaticContracts() {
  const rootPackage = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'));
  const mcpPackage = JSON.parse(readFileSync(resolve(repositoryRoot, 'mcp/package.json'), 'utf8'));
  const ciSource = readFileSync(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');
  const rootCommands = rootPackage.scripts.test.split(' && ');
  for (const command of PHASE63_ROOT_COMMANDS) {
    if (rootCommands.filter((candidate) => candidate === command).length !== 1) {
      throw new Error(`root Phase 63 command count is not exact: ${command}`);
    }
  }
  const buildIndex = rootCommands.indexOf('npm --prefix mcp run build');
  const firstExistingMcpSeam = rootCommands.indexOf('node tests/mcp-bridge-client-lifecycle.test.js');
  const phase63Indexes = PHASE63_ROOT_COMMANDS.map((command) => rootCommands.indexOf(command));
  if (
    buildIndex < 0
    || firstExistingMcpSeam < 0
    || phase63Indexes.some((index) => index <= buildIndex || index >= firstExistingMcpSeam)
    || phase63Indexes.some((index, position) => position > 0 && index <= phase63Indexes[position - 1])
  ) {
    throw new Error('root Phase 63 gates are not in the protected serial slot');
  }
  if (rootCommands.filter((command) => command === 'npm --prefix mcp run build').length !== 1) {
    throw new Error('root MCP build boundary is not unique');
  }
  if (
    exactOccurrences(mcpPackage.scripts.prebuild, 'verify-native-host-boundary.mjs --source') !== 1
    || exactOccurrences(mcpPackage.scripts.build, 'verify-native-host-boundary.mjs --compiled') !== 1
    || rootPackage.scripts.test.includes('verify-native-host-boundary.mjs')
    || JSON.stringify(COMPILED_COMMANDS).includes('verify-native-host-boundary.mjs')
  ) {
    throw new Error('source/compiled native-host boundary modes are not the exact build-owned pair');
  }
  if (
    exactOccurrences(ciSource, 'run: npm test') !== 1
    || exactOccurrences(ciSource, 'Phase 63 native-host contract (sole Linux root invocation)') !== 1
    || ciSource.includes('run: node scripts/run-phase63-focused-tests.mjs')
  ) {
    throw new Error('CI does not retain one source-pinned Linux Phase 63 root invocation');
  }
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
      // The single cleanup path remains authoritative.
    }
  }
}

process.on('SIGINT', () => onSignal('SIGINT'));
process.on('SIGTERM', () => onSignal('SIGTERM'));

function runChild(command, label) {
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
      if (receivedSignal) child.kill(receivedSignal);
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
let indexPath;
let indexBefore;
let workspaceBefore;
let trackedBefore;
let untrackedBefore;
let trackedFingerprintBefore;
let untrackedFingerprintBefore;
let buildBefore;
let buildFingerprintBefore;
let cleanupComplete = false;

function recordFailure(error, fallback) {
  failures.push(error instanceof Error ? error.message : fallback);
}

function cleanup() {
  if (cleanupComplete) return;
  cleanupComplete = true;

  if (receivedSignal) {
    failures.push(`wrapper received ${receivedSignal}`);
    if (primaryExitCode === 0) primaryExitCode = receivedSignal === 'SIGINT' ? 130 : 143;
  }

  if (indexBefore && indexPath) {
    try {
      if (entryFingerprint(captureEntry(indexPath, 'Git index')) !== entryFingerprint(indexBefore)) {
        failures.push('Git index bytes or mode changed during the focused lifecycle');
      }
    } catch (error) {
      recordFailure(error, 'Git index mutation check failed');
    }
  }
  if (trackedBefore) {
    try {
      if (entriesFingerprint(captureCurrentEntries(trackedBefore)) !== trackedFingerprintBefore) {
        failures.push('pre-existing tracked dirty bytes, modes, or symlinks changed');
      }
    } catch (error) {
      recordFailure(error, 'tracked dirty mutation check failed');
    }
  }
  if (untrackedBefore) {
    try {
      if (entriesFingerprint(captureCurrentEntries(untrackedBefore)) !== untrackedFingerprintBefore) {
        failures.push('pre-existing untracked bytes, modes, or symlinks changed');
      }
    } catch (error) {
      recordFailure(error, 'untracked mutation check failed');
    }
  }

  if (workspaceBefore) {
    try {
      const currentUntracked = nulPaths(runGit(
        ['ls-files', '--others', '--exclude-standard', '-z'],
        'cleanup untracked capture',
      ));
      const initialUntracked = new Set(workspaceBefore.untrackedPaths);
      for (const relativePath of currentUntracked
        .filter((path) => !initialUntracked.has(path) && !isBuildPath(path))
        .sort((left, right) => right.split('/').length - left.split('/').length)) {
        const absolutePath = resolve(repositoryRoot, relativePath);
        assertInsideRepository(absolutePath, 'created untracked path');
        removeEntry(absolutePath);
      }
    } catch (error) {
      recordFailure(error, 'created-path cleanup failed');
    }
  }
  if (buildBefore) {
    try {
      restoreTree(buildRoot, buildBefore);
    } catch (error) {
      recordFailure(error, 'MCP build tree restoration failed');
    }
  }
  if (trackedBefore) {
    try {
      restoreWorkspaceEntries(trackedBefore);
    } catch (error) {
      recordFailure(error, 'tracked dirty workspace restoration failed');
    }
  }
  if (untrackedBefore) {
    try {
      restoreWorkspaceEntries(untrackedBefore);
    } catch (error) {
      recordFailure(error, 'untracked workspace restoration failed');
    }
  }
  if (indexBefore && indexPath) {
    try {
      restoreEntry(indexPath, indexBefore);
    } catch (error) {
      recordFailure(error, 'Git index restoration failed');
    }
  }

  if (buildBefore) {
    try {
      if (treeFingerprint(captureTree(buildRoot)) !== buildFingerprintBefore) {
        failures.push('MCP build tree identity differs after restoration');
      }
    } catch (error) {
      recordFailure(error, 'MCP build tree verification failed');
    }
  }
  if (trackedBefore) {
    try {
      if (entriesFingerprint(captureCurrentEntries(trackedBefore)) !== trackedFingerprintBefore) {
        failures.push('tracked dirty workspace identity differs after restoration');
      }
    } catch (error) {
      recordFailure(error, 'tracked dirty verification failed');
    }
  }
  if (untrackedBefore) {
    try {
      if (entriesFingerprint(captureCurrentEntries(untrackedBefore)) !== untrackedFingerprintBefore) {
        failures.push('untracked workspace identity differs after restoration');
      }
    } catch (error) {
      recordFailure(error, 'untracked verification failed');
    }
  }
  if (workspaceBefore) {
    try {
      const workspaceAfter = captureWorkspaceState('final');
      if (workspaceAfter.fingerprint !== workspaceBefore.fingerprint) {
        failures.push('Git status, dirty paths, index entries, or untracked listing changed');
      }
    } catch (error) {
      recordFailure(error, 'final workspace comparison failed');
    }
  }
  if (indexBefore && indexPath) {
    try {
      restoreEntry(indexPath, indexBefore);
      if (entryFingerprint(captureEntry(indexPath, 'Git index')) !== entryFingerprint(indexBefore)) {
        failures.push('Git index identity differs after final restoration');
      }
    } catch (error) {
      recordFailure(error, 'Git index final verification failed');
    }
  }
}

try {
  if (process.argv.length !== 2) {
    throw new Error('usage: run-phase63-focused-tests.mjs');
  }
  assertInsideRepository(buildRoot, 'MCP build root');
  indexPath = resolveIndexPath();
  indexBefore = captureEntry(indexPath, 'Git index');
  if (indexBefore.kind !== 'file') throw new Error('Git index must be an existing regular file');
  workspaceBefore = captureWorkspaceState('initial');
  restoreEntry(indexPath, indexBefore);
  trackedBefore = snapshotWorkspaceEntries(workspaceBefore.trackedDirtyPaths);
  untrackedBefore = snapshotWorkspaceEntries(workspaceBefore.untrackedPaths);
  trackedFingerprintBefore = entriesFingerprint(trackedBefore);
  untrackedFingerprintBefore = entriesFingerprint(untrackedBefore);
  buildBefore = captureTree(buildRoot);
  buildFingerprintBefore = treeFingerprint(buildBefore);

  assertStaticContracts();
  const result = await runChild([
    process.execPath,
    innerWrapperPath,
    '--commands-json',
    JSON.stringify(COMPILED_COMMANDS),
  ], 'guarded Phase 63 matrix');
  const failure = resultFailure(result);
  if (failure) {
    failures.push(failure);
    primaryExitCode = Number.isInteger(result.status) && result.status !== 0 ? result.status : 1;
  }
} catch (error) {
  if (primaryExitCode === 0) primaryExitCode = 1;
  recordFailure(error, 'focused wrapper execution failed');
} finally {
  cleanup();
}

if (failures.length > 0) {
  for (const failure of [...new Set(failures)]) {
    console.error(`[phase63-focused-tests] ${failure}`);
  }
  process.exit(primaryExitCode || 1);
}

console.log('[phase63-focused-tests] PASS: focused matrix passed and complete workspace identity was preserved');
