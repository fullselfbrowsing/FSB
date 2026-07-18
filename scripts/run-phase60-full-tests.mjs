#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = process.env.FSB_PHASE60_TEST_REPOSITORY_ROOT
  ? resolve(process.env.FSB_PHASE60_TEST_REPOSITORY_ROOT)
  : resolve(dirname(scriptPath), '..');
const compatibilityDirectory = resolve(
  repositoryRoot,
  '.planning/phases/39-breadth-c-commerce-travel-misc-most-sensitive',
);
const compatibilityPath = resolve(compatibilityDirectory, '39-06-REMAINING-APPS.md');
const archivedPath = resolve(
  repositoryRoot,
  '.planning/milestones/v1.0.0-phases/39-breadth-c-commerce-travel-misc-most-sensitive/39-06-REMAINING-APPS.md',
);
const maximumGitOutput = 16 * 1024 * 1024;

function lstatIfPresent(target) {
  try {
    return lstatSync(target);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function captureGitBuffer(args, label) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    maxBuffer: maximumGitOutput,
    shell: false,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`${label} failed`);
  }
  return Buffer.from(result.stdout);
}

function resolveGitIndexPath() {
  const rawPath = captureGitBuffer(
    ['rev-parse', '--git-path', 'index'],
    'Git index path capture',
  ).toString('utf8').trim();
  if (!rawPath || rawPath.includes('\0') || rawPath.includes('\n') || rawPath.includes('\r')) {
    throw new Error('Git returned an invalid index path');
  }
  return isAbsolute(rawPath) ? resolve(rawPath) : resolve(repositoryRoot, rawPath);
}

function captureGitIndex(indexPath) {
  const stat = lstatIfPresent(indexPath);
  if (!stat) return Object.freeze({ kind: 'missing' });
  if (stat.isSymbolicLink()) return Object.freeze({ kind: 'symlink' });
  if (stat.isDirectory()) return Object.freeze({ kind: 'directory' });
  if (!stat.isFile()) return Object.freeze({ kind: 'other' });
  return Object.freeze({
    kind: 'file',
    mode: stat.mode & 0o7777,
    bytes: Buffer.from(readFileSync(indexPath)),
  });
}

function restoreGitIndex(indexPath, snapshot) {
  const current = captureGitIndex(indexPath);
  if (current.kind !== 'file') {
    throw new Error('raw Git index is not a regular file');
  }
  unlinkSync(indexPath);
  writeFileSync(indexPath, snapshot.bytes, { flag: 'wx', mode: snapshot.mode });
  chmodSync(indexPath, snapshot.mode);
}

function nulPaths(value) {
  return value.toString('utf8').split('\0').filter((entry) => entry.length > 0);
}

function updateField(hash, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  hash.update(String(bytes.length));
  hash.update(':');
  hash.update(bytes);
  hash.update('\0');
}

function updatePathFingerprint(hash, relativePath) {
  const absolutePath = resolve(repositoryRoot, relativePath);
  const repositoryRelativePath = relative(repositoryRoot, absolutePath);
  if (repositoryRelativePath.startsWith('..') || isAbsolute(repositoryRelativePath)) {
    throw new Error('git returned a path outside the repository');
  }
  updateField(hash, relativePath);
  const stat = lstatIfPresent(absolutePath);
  if (!stat) {
    updateField(hash, 'missing');
    return;
  }
  updateField(hash, stat.mode);
  if (stat.isSymbolicLink()) {
    updateField(hash, 'symlink');
    updateField(hash, readlinkSync(absolutePath));
    return;
  }
  if (stat.isFile()) {
    updateField(hash, 'file');
    updateField(hash, readFileSync(absolutePath));
    return;
  }
  if (stat.isDirectory()) {
    updateField(hash, 'directory');
    return;
  }
  throw new Error(`unsupported workspace entry type: ${relativePath}`);
}

function fingerprintPaths(paths) {
  const hash = createHash('sha256');
  for (const relativePath of [...new Set(paths)].sort()) {
    updatePathFingerprint(hash, relativePath);
  }
  return hash.digest('hex');
}

function snapshotWorkspacePath(relativePath) {
  const absolutePath = resolve(repositoryRoot, relativePath);
  const repositoryRelativePath = relative(repositoryRoot, absolutePath);
  if (repositoryRelativePath.startsWith('..') || isAbsolute(repositoryRelativePath)) {
    throw new Error('git returned a path outside the repository');
  }
  const stat = lstatIfPresent(absolutePath);
  if (!stat) return Object.freeze({ relativePath, kind: 'missing' });
  if (stat.isSymbolicLink()) {
    return Object.freeze({
      relativePath,
      kind: 'symlink',
      target: readlinkSync(absolutePath),
    });
  }
  if (stat.isFile()) {
    return Object.freeze({
      relativePath,
      kind: 'file',
      mode: stat.mode & 0o777,
      bytes: Buffer.from(readFileSync(absolutePath)),
    });
  }
  throw new Error(`unsupported dirty workspace entry type: ${relativePath}`);
}

function removeWorkspacePath(absolutePath) {
  const stat = lstatIfPresent(absolutePath);
  if (!stat) return;
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    rmSync(absolutePath, { recursive: true, force: true });
    return;
  }
  unlinkSync(absolutePath);
}

function restoreWorkspacePaths(snapshots) {
  for (const snapshot of snapshots) {
    const absolutePath = resolve(repositoryRoot, snapshot.relativePath);
    removeWorkspacePath(absolutePath);
    if (snapshot.kind === 'missing') continue;
    mkdirSync(dirname(absolutePath), { recursive: true });
    if (snapshot.kind === 'symlink') {
      symlinkSync(snapshot.target, absolutePath);
      continue;
    }
    if (snapshot.kind === 'file') {
      writeFileSync(absolutePath, snapshot.bytes);
      chmodSync(absolutePath, snapshot.mode);
      continue;
    }
    throw new Error(`unsupported dirty workspace snapshot: ${snapshot.relativePath}`);
  }
}

function captureWorkspaceState(label) {
  const unstagedPaths = nulPaths(captureGitBuffer(
    ['diff', '--name-only', '-z', '--no-ext-diff', '--no-textconv'],
    `${label} unstaged-path capture`,
  ));
  const stagedPaths = nulPaths(captureGitBuffer(
    ['diff', '--cached', '--name-only', '-z', '--no-ext-diff', '--no-textconv'],
    `${label} staged-path capture`,
  ));
  const untrackedListing = captureGitBuffer(
    ['ls-files', '--others', '--exclude-standard', '-z'],
    `${label} untracked-path capture`,
  );
  const untrackedPaths = nulPaths(untrackedListing);
  const worktreeDirtyPaths = [...new Set(unstagedPaths)].sort();
  const trackedDirtyPaths = [...new Set([...worktreeDirtyPaths, ...stagedPaths])].sort();
  return Object.freeze({
    status: createHash('sha256').update(captureGitBuffer(
      ['status', '--short', '-z', '--untracked-files=all'],
      `${label} dirty-state capture`,
    )).digest('hex'),
    indexEntries: createHash('sha256').update(captureGitBuffer(
      ['ls-files', '--stage', '-z'],
      `${label} index-entry capture`,
    )).digest('hex'),
    trackedPaths: fingerprintPaths(trackedDirtyPaths),
    trackedDirtyPaths: Object.freeze(trackedDirtyPaths),
    worktreeDirtyPaths: Object.freeze(worktreeDirtyPaths),
    untrackedPaths: fingerprintPaths(untrackedPaths),
    untrackedListing: createHash('sha256').update(untrackedListing).digest('hex'),
  });
}

function runRootTests() {
  const injected = process.env.FSB_PHASE60_TEST_COMMAND_JSON;
  if (injected !== undefined) {
    let command;
    try {
      command = JSON.parse(injected);
    } catch {
      throw new Error('injected test command must be valid JSON');
    }
    if (
      !Array.isArray(command)
      || command.length < 1
      || command.length > 32
      || command.some((value) => typeof value !== 'string' || value.length === 0 || value.includes('\0'))
    ) {
      throw new Error('injected test command must be a non-empty string array');
    }
    return spawnSync(command[0], command.slice(1), {
      cwd: repositoryRoot,
      stdio: 'inherit',
      shell: false,
    });
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawnSync(npm, ['test'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: false,
  });
}

const failures = [];
let primaryExitCode = 0;
let createdDirectory = false;
let createdLink = false;
let workspaceBefore;
let trackedDirtySnapshots;
let indexPath;
let indexBefore;
let indexEntriesUnchanged = false;

try {
  indexPath = resolveGitIndexPath();
  indexBefore = captureGitIndex(indexPath);
  if (indexBefore.kind !== 'file') {
    throw new Error('raw Git index must be an existing regular file');
  }
  workspaceBefore = captureWorkspaceState('initial');
  trackedDirtySnapshots = Object.freeze(
    workspaceBefore.worktreeDirtyPaths.map(snapshotWorkspacePath),
  );

  if (lstatIfPresent(compatibilityPath) !== null) {
    throw new Error('compatibility path must be absent before the full-suite run');
  }
  const archiveStat = lstatIfPresent(archivedPath);
  if (!archiveStat || !archiveStat.isFile() || archiveStat.isSymbolicLink()) {
    throw new Error('archived Phase 39 compatibility target is unavailable');
  }

  const directoryStat = lstatIfPresent(compatibilityDirectory);
  if (directoryStat === null) {
    mkdirSync(compatibilityDirectory);
    createdDirectory = true;
  } else if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error('compatibility directory is not a safe existing directory');
  }

  symlinkSync(archivedPath, compatibilityPath, 'file');
  createdLink = true;

  if (process.env.FSB_PHASE60_INJECT_FAILURE === 'after-link') {
    primaryExitCode = 86;
    throw new Error('injected post-link failure');
  }

  const testResult = runRootTests();
  if (testResult.error || testResult.signal || !Number.isInteger(testResult.status)) {
    primaryExitCode = 1;
    failures.push('root test process did not return a usable exit status');
  } else if (testResult.status !== 0) {
    primaryExitCode = testResult.status;
    failures.push(`root test suite exited ${testResult.status}`);
  }
} catch (error) {
  if (primaryExitCode === 0) primaryExitCode = 1;
  failures.push(error instanceof Error ? error.message : 'full-suite setup failed');
} finally {
  if (createdLink) {
    try {
      const linkStat = lstatIfPresent(compatibilityPath);
      if (!linkStat || !linkStat.isSymbolicLink()) {
        throw new Error('temporary compatibility path is no longer the created symlink');
      }
      if (readlinkSync(compatibilityPath) !== archivedPath) {
        throw new Error('temporary compatibility symlink target changed during the run');
      }
      unlinkSync(compatibilityPath);
      if (lstatIfPresent(compatibilityPath) !== null) {
        throw new Error('temporary compatibility symlink remains after unlink');
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'compatibility link cleanup failed');
    }
  }

  if (createdDirectory) {
    try {
      if (readdirSync(compatibilityDirectory).length !== 0) {
        throw new Error('created compatibility directory is not empty after link cleanup');
      }
      rmdirSync(compatibilityDirectory);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'compatibility directory cleanup failed');
    }
  }

  if (trackedDirtySnapshots !== undefined) {
    try {
      restoreWorkspacePaths(trackedDirtySnapshots);
    } catch (error) {
      failures.push(error instanceof Error
        ? `pre-existing tracked dirty byte restoration failed: ${error.message}`
        : 'pre-existing tracked dirty byte restoration failed');
    }
  }

  if (workspaceBefore !== undefined) {
    try {
      const workspaceAfter = captureWorkspaceState('final');
      indexEntriesUnchanged = workspaceAfter.indexEntries === workspaceBefore.indexEntries;
      if (!indexEntriesUnchanged) {
        failures.push('staged index bytes changed during the full-suite run');
      }
      if (workspaceAfter.trackedPaths !== workspaceBefore.trackedPaths) {
        failures.push('pre-existing tracked dirty bytes changed during the full-suite run');
      }
      if (
        workspaceAfter.untrackedListing !== workspaceBefore.untrackedListing
        || workspaceAfter.untrackedPaths !== workspaceBefore.untrackedPaths
      ) {
        failures.push('untracked workspace entries changed during the full-suite run');
      }
      if (workspaceAfter.status !== workspaceBefore.status) {
        failures.push('workspace path/status set changed during the full-suite run');
      }
      if (lstatIfPresent(compatibilityPath) !== null) {
        failures.push('temporary compatibility path remains after final cleanup');
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'workspace preservation check failed');
    }
  }

  if (indexBefore !== undefined && indexPath !== undefined) {
    try {
      const indexAfter = captureGitIndex(indexPath);
      if (indexAfter.kind === 'missing') {
        failures.push('raw Git index is missing after the full-suite run');
      } else if (indexAfter.kind !== 'file') {
        failures.push('raw Git index is not a regular file after the full-suite run');
      } else if (indexAfter.mode !== indexBefore.mode) {
        failures.push('raw Git index mode changed during the full-suite run');
      } else if (indexEntriesUnchanged) {
        if (!indexAfter.bytes.equals(indexBefore.bytes)) {
          restoreGitIndex(indexPath, indexBefore);
        }
        const restoredIndex = captureGitIndex(indexPath);
        if (
          restoredIndex.kind !== 'file'
          || restoredIndex.mode !== indexBefore.mode
          || !restoredIndex.bytes.equals(indexBefore.bytes)
        ) {
          failures.push('raw Git index identity differs after restoration');
        }
      }
    } catch (error) {
      failures.push(error instanceof Error
        ? `raw Git index preservation failed: ${error.message}`
        : 'raw Git index preservation failed');
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[phase60-full-tests] ${failure}`);
  process.exit(primaryExitCode || 1);
}

console.log('[phase60-full-tests] PASS: full suite passed and workspace state was preserved');
