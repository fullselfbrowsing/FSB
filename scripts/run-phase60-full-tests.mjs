#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  readlinkSync,
  readdirSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), '..');
const compatibilityDirectory = resolve(
  repositoryRoot,
  '.planning/phases/39-breadth-c-commerce-travel-misc-most-sensitive',
);
const compatibilityPath = resolve(compatibilityDirectory, '39-06-REMAINING-APPS.md');
const archivedPath = resolve(
  repositoryRoot,
  '.planning/milestones/v1.0.0-phases/39-breadth-c-commerce-travel-misc-most-sensitive/39-06-REMAINING-APPS.md',
);
const maximumGitOutput = 4 * 1024 * 1024;

function lstatIfPresent(target) {
  try {
    return lstatSync(target);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function captureGit(args, label) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: maximumGitOutput,
    shell: false,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`${label} failed`);
  }
  return result.stdout;
}

function dirtyLines(status) {
  return status.split(/\r?\n/).filter((line) => line.length > 0);
}

function runRootTests() {
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
let statusBefore;
let stagedBefore;

try {
  statusBefore = captureGit(['status', '--short'], 'initial dirty-state capture');
  stagedBefore = captureGit(
    ['diff', '--cached', '--name-only'],
    'initial staged-state capture',
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

  if (statusBefore !== undefined && stagedBefore !== undefined) {
    try {
      const statusAfter = captureGit(['status', '--short'], 'final dirty-state capture');
      const stagedAfter = captureGit(
        ['diff', '--cached', '--name-only'],
        'final staged-state capture',
      );
      const afterLines = new Set(dirtyLines(statusAfter));
      const missingDirtyLines = dirtyLines(statusBefore)
        .filter((line) => !afterLines.has(line));
      if (missingDirtyLines.length > 0) {
        failures.push(`${missingDirtyLines.length} pre-existing dirty-status line(s) changed or disappeared`);
      }
      if (stagedAfter !== stagedBefore) {
        failures.push('staged-file list changed during the full-suite run');
      }
      if (lstatIfPresent(compatibilityPath) !== null) {
        failures.push('temporary compatibility path remains after final cleanup');
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'workspace preservation check failed');
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[phase60-full-tests] ${failure}`);
  process.exit(primaryExitCode || 1);
}

console.log('[phase60-full-tests] PASS: full suite passed and workspace state was preserved');
