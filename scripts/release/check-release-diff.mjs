#!/usr/bin/env node
/**
 * Phase 71 release-diff checker (REL-02-c; CONTEXT D-24 and its 2026-10-16
 * amendment; D-02; M-71-10, M-71-11).
 *
 * It needs git history, so it is NOT part of npm test (CI clones are shallow,
 * 67-VALIDATION:27). tests/release-diff.test.mjs covers the pure core in
 * lib/release-diff.mjs and this CLI's refusals through an injected fake
 * runChecked.
 *
 *   node scripts/release/check-release-diff.mjs --measured <V4 sha> --step A|B [--release <ref>]
 *
 * It binds what ships at V6 to the commit V4 measured: the release commit may
 * differ from the measured commit only by docs (the D-24 allowlist, with
 * showcase/server/** narrowed to its *.md files) and by what the step's
 * version setters write. It compares commits, never the working tree.
 *
 * Steps, refusing at the first failing one:
 * 1. Resolve --release (default HEAD) with `git rev-parse --verify
 *    <ref>^{commit}` and print the sha. When it is HEAD's commit and
 *    `git diff --quiet HEAD` exits non-zero, refuse uncommitted_changes
 *    (exit 2) before any export: commit the V6 bump first, then check.
 * 2. Refuse measured_not_ancestor unless `git merge-base --is-ancestor
 *    <measured> <release>`.
 * 3. List the differing paths with `git diff --no-renames --name-status -z`.
 * 4. Export the measured tree with git archive into a temp directory (removed
 *    in finally) and read the setter targets from that tree's
 *    `sync-product-version.mjs --print-targets`.
 * 5. Copy every docs-class path that differs from the release commit
 *    (`git show <release>:<path>`) into the tree; remove docs the release
 *    deleted.
 * 6. Run the step's setters on the tree with FSB_VERSION_SYNC_ROOT=<tree>:
 *    step A `extension <release manifest version>`; step B the same, then
 *    `mcp <release mcp/package.json version>`.
 * 7. judgeDifferences over the differing paths plus the setter targets: a
 *    setter target must equal the release bytes after the setters ran; any
 *    other non-docs difference, addition or deletion fails. Step A ships with
 *    MCP unchanged, which this enforces because the step-A setters write no
 *    MCP version file; docs-class mcp paths (mcp/README.md, mcp/CHANGELOG.md)
 *    follow the docs rule.
 *
 * Output names paths, classes and reasons, never file contents.
 * Exit codes: 0 ok; 1 violations; 2 usage, refusal or setup error.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  UsageError,
  classifyPath,
  judgeDifferences,
  parseArgs,
  parseNameStatus,
} from './lib/release-diff.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..');
export const EXIT = Object.freeze({ OK: 0, VIOLATIONS: 1, REFUSED: 2 });
const SETTER_SCRIPT = 'scripts/sync-product-version.mjs';
const SHOW_MAX_BUFFER = 256 * 1024 * 1024;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

const USAGE = `Usage: node scripts/release/check-release-diff.mjs --measured <sha> --step A|B [--release <ref>]

Checks that the release commit differs from the V4-measured commit only by docs
and by what the step's version setters write (CONTEXT D-24).

  --measured <sha>   the full 40-character commit sha V4 measured
  --step A|B         A: extension setter; B: extension then MCP setter
  --release <ref>    the release commit (default HEAD; must be committed)
  --help             show this help

Exit codes: 0 ok; 1 violations; 2 usage, refusal or setup error.`;

// A failed spawn, a signal or an unexpected exit status: exit 2, not a violation.
export class SetupError extends Error {}

function gitEnv() {
  return { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
}

/**
 * Runs a command without a shell. Returns {status, stdout, stderr} (Buffers).
 * Throws SetupError on a spawn error, a signal, or a status outside
 * options.okStatuses (default [0]).
 */
export function runChecked(command, args, options = {}, label = command) {
  const { okStatuses = [0], ...spawnOptions } = options;
  const result = spawnSync(command, args, { shell: false, maxBuffer: SHOW_MAX_BUFFER, ...spawnOptions });
  if (result.error || result.signal || !okStatuses.includes(result.status)) {
    const stderr = result.stderr ? Buffer.from(result.stderr).toString('utf8').trim() : '';
    const reason = result.error ? result.error.message : (result.signal || `exit ${result.status}`);
    throw new SetupError(`${label} failed (${reason})${stderr ? `: ${stderr.split('\n')[0]}` : ''}`);
  }
  return result;
}

function defaultDeps() {
  return {
    runChecked,
    repoRoot: REPO_ROOT,
    nodePath: process.execPath,
    tmpRoot: os.tmpdir(),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  };
}

function asText(value) {
  if (value === undefined || value === null) return '';
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  return Buffer.from(asText(value), 'utf8');
}

// <tree>/<relative>, refusing anything that would leave the tree.
function treePath(tree, relativePath) {
  const resolved = path.resolve(tree, ...relativePath.split('/'));
  if (resolved !== tree && !resolved.startsWith(`${tree}${path.sep}`)) {
    throw new SetupError(`path leaves the exported tree: ${relativePath}`);
  }
  return resolved;
}

function readIfPresent(file) {
  try {
    return fs.readFileSync(file);
  } catch (error) {
    if (error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * CLI entry. Returns the exit code; never calls process.exit.
 * overrides replace any dependency (tests inject runChecked and output).
 */
export async function main(argv = process.argv.slice(2), overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  const out = (text) => deps.stdout(`${text}\n`);
  const err = (text) => deps.stderr(`${text}\n`);
  const refuse = (code, detail) => {
    err(`check-release-diff: refused ${code}${detail ? `: ${detail}` : ''}`);
    return EXIT.REFUSED;
  };

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    err(`check-release-diff: usage error: ${error.message}\n${USAGE}`);
    return EXIT.REFUSED;
  }
  if (options.help) {
    out(USAGE);
    return EXIT.OK;
  }

  const git = (args, extra = {}, label = `git ${args[0]}`) => deps.runChecked('git', args, {
    cwd: deps.repoRoot,
    env: gitEnv(),
    ...extra,
  }, label);
  const showBlob = (sha, relativePath) => asBuffer(git(['show', `${sha}:${relativePath}`], {}, `git show ${relativePath}`).stdout);
  const resolveCommit = (ref) => {
    const sha = asText(git(['rev-parse', '--verify', `${ref}^{commit}`], {}, `git rev-parse ${ref}`).stdout).trim();
    if (!SHA_PATTERN.test(sha)) throw new SetupError(`git rev-parse ${ref} did not print a commit sha`);
    return sha;
  };

  let tmp = null;
  try {
    // 1. The release commit, and the uncommitted-changes refusal.
    const releaseSha = resolveCommit(options.release);
    const headSha = resolveCommit('HEAD');
    out(`check-release-diff: measured ${options.measured}; release ${options.release} -> ${releaseSha}; step ${options.step}`);
    if (releaseSha === headSha) {
      const dirty = git(['diff', '--quiet', 'HEAD'], { okStatuses: [0, 1] }, 'git diff --quiet HEAD');
      if (dirty.status !== 0) {
        return refuse('uncommitted_changes', 'the release is HEAD and tracked changes are not committed; commit them, then re-run');
      }
    }

    // 2. The measured commit must be an ancestor of the release.
    const ancestor = git(['merge-base', '--is-ancestor', options.measured, releaseSha], { okStatuses: [0, 1] },
      'git merge-base --is-ancestor');
    if (ancestor.status !== 0) {
      return refuse('measured_not_ancestor', `${options.measured} is not an ancestor of ${releaseSha}`);
    }

    // 3. Every path that differs between the two commits.
    const entries = parseNameStatus(asText(git(['diff', '--no-renames', '--name-status', '-z', options.measured, releaseSha],
      {}, 'git diff --name-status').stdout));

    // 4. Export the measured tree; the setter targets come from its own setter.
    tmp = fs.mkdtempSync(path.join(deps.tmpRoot, 'fsb-release-diff-'));
    const tree = path.join(tmp, 'tree');
    const tarPath = path.join(tmp, 'measured.tar');
    fs.mkdirSync(tree);
    git(['archive', '--format=tar', `--output=${tarPath}`, options.measured], {}, 'git archive');
    deps.runChecked('tar', ['-x', '-f', tarPath, '-C', tree], {}, 'tar -x');
    fs.rmSync(tarPath, { force: true });

    const setterEnv = { ...process.env, FSB_VERSION_SYNC_ROOT: tree };
    const setterScript = treePath(tree, SETTER_SCRIPT);
    const targetsText = asText(deps.runChecked(deps.nodePath, [setterScript, '--print-targets'],
      { cwd: tree, env: setterEnv }, 'sync-product-version.mjs --print-targets').stdout);
    let setterTargets;
    try {
      setterTargets = JSON.parse(targetsText);
    } catch {
      throw new SetupError('sync-product-version.mjs --print-targets did not print JSON');
    }
    if (!Array.isArray(setterTargets) || setterTargets.length === 0 || !setterTargets.every((item) => typeof item === 'string')) {
      throw new SetupError('sync-product-version.mjs --print-targets did not print a list of paths');
    }
    const classify = (relativePath) => classifyPath(relativePath, { setterTargets });

    const statusByPath = new Map(entries.map((entry) => [entry.path, entry.status]));
    const paths = [...new Set([...entries.map((entry) => entry.path), ...setterTargets])].sort();
    const measured = new Map();
    for (const relativePath of paths) {
      const bytes = readIfPresent(treePath(tree, relativePath));
      if (bytes !== undefined) measured.set(relativePath, bytes);
    }

    // 5. The release's docs, so the setters see the release CHANGELOGs.
    let docsCopied = 0;
    for (const entry of entries) {
      if (classify(entry.path) !== 'docs') continue;
      const file = treePath(tree, entry.path);
      if (entry.status === 'D') {
        fs.rmSync(file, { force: true });
      } else {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, showBlob(releaseSha, entry.path));
      }
      docsCopied++;
    }

    // 6. The step's setters, at the release's versions.
    const releaseVersion = (relativePath) => {
      let version;
      try {
        version = JSON.parse(showBlob(releaseSha, relativePath).toString('utf8')).version;
      } catch {
        throw new SetupError(`cannot read the release version from ${relativePath}`);
      }
      if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
        throw new SetupError(`${relativePath} in the release has no X.Y.Z version`);
      }
      return version;
    };
    const setters = [['extension', releaseVersion('extension/manifest.json')]];
    if (options.step === 'B') setters.push(['mcp', releaseVersion('mcp/package.json')]);
    for (const [domain, version] of setters) {
      deps.runChecked(deps.nodePath, [setterScript, domain, version], { cwd: tree, env: setterEnv },
        `sync-product-version.mjs ${domain} ${version}`);
    }

    // 7. Compare.
    const afterSetter = new Map();
    const release = new Map();
    for (const relativePath of paths) {
      const bytes = readIfPresent(treePath(tree, relativePath));
      if (bytes !== undefined) afterSetter.set(relativePath, bytes);
      if (classify(relativePath) === 'docs' || statusByPath.get(relativePath) === 'D') continue;
      release.set(relativePath, showBlob(releaseSha, relativePath));
    }
    const result = judgeDifferences({ paths, classify, measured, release, afterSetter });

    const counts = { docs: 0, setter: 0, forbidden: 0 };
    for (const entry of entries) counts[classify(entry.path)]++;
    out(`check-release-diff: ${entries.length} differing paths (${counts.docs} docs, ${counts.setter} setter, ${counts.forbidden} other); `
      + `${docsCopied} docs copied from the release; setters: ${setters.map(([domain, version]) => `${domain} ${version}`).join(', ')}; `
      + `${paths.length} paths compared`);
    if (result.ok) {
      out('check-release-diff: OK: the release differs from the measured commit only by docs and setter output');
      return EXIT.OK;
    }
    for (const violation of result.violations) {
      out(`check-release-diff: VIOLATION ${violation.class} ${violation.path}: ${violation.reason}`);
    }
    out(`check-release-diff: FAIL: ${result.violations.length} violation(s); any code change after V4 needs a re-measure`);
    return EXIT.VIOLATIONS;
  } catch (error) {
    if (error instanceof SetupError || error instanceof TypeError) {
      err(`check-release-diff: setup error: ${error.message}`);
      return EXIT.REFUSED;
    }
    throw error;
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const invokedPath = (() => {
  try {
    return process.argv[1] ? pathToFileURL(fs.realpathSync(process.argv[1])).href : null;
  } catch {
    return null;
  }
})();
if (invokedPath === import.meta.url) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }, (error) => {
    process.stderr.write(`check-release-diff: unexpected failure: ${error && error.message ? error.message : error}\n`);
    process.exitCode = EXIT.REFUSED;
  });
}
