#!/usr/bin/env node
/**
 * Phase 66 referencing-test regression sweep (W11).
 *
 * Runs every tests/*.test.js and tests/*.test.mjs file whose text mentions the
 * basename (without extension) of any --files path, one test at a time, with
 * the invocation package.json uses for that file. A file that no script names
 * runs as `node <file>`.
 *
 * Each test is bounded here, in-process: its process group gets SIGTERM at the
 * limit and SIGKILL five seconds later. Stdin is /dev/null and output goes to
 * a per-test log under the OS temp directory. The sweep never modifies files;
 * the only thing it writes besides those logs is the optional --out JSON.
 *
 * With --baseline, only failures that are absent from the baseline's
 * `failures` list count, so an edit is judged by the failures it adds.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_PER_TEST_LIMIT_MS = 180000;
export const KILL_GRACE_MS = 5000;
export const HUB_PORT = 7225;

const USAGE = `Usage: node scripts/bench/sweep-tests.mjs --files <path> [<path> ...]
         [--baseline <json>] [--out <json>] [--per-test-timeout-ms <ms>]

Runs every tests/*.test.js and tests/*.test.mjs file that mentions the
basename (without extension) of a --files path, using its package.json
invocation (plain \`node <file>\` when no script names it). Paths are
relative to the current directory.

  --files <path> ...          source files whose referencing tests should run
  --baseline <json>           earlier sweep output; only NEW failures fail the run
  --out <json>                write the sweep result JSON here
  --per-test-timeout-ms <ms>  per-test bound (default ${DEFAULT_PER_TEST_LIMIT_MS}); SIGTERM, then
                              SIGKILL ${KILL_GRACE_MS / 1000} s later
  --help                      show this help

Exit codes: 0 no (new) failures; 1 failures (with --baseline: new failures
only); 2 usage or setup error.`;

// Node options whose value is the following token, when not written as --flag=value.
const NODE_FLAGS_WITH_VALUE = new Set([
  '--import', '--require', '-r', '--loader', '--experimental-loader', '--conditions', '-C',
  '--input-type', '--env-file', '--test-reporter', '--test-reporter-destination',
  '--test-name-pattern', '--test-skip-pattern', '--test-concurrency', '--test-shard',
]);

export function parseArgs(argv) {
  const out = { files: [], baseline: null, out: null, perTestLimitMs: DEFAULT_PER_TEST_LIMIT_MS, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else if (arg === '--files') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out.files.push(argv[++i]);
    } else if (arg === '--baseline' || arg === '--out') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a path`);
      out[arg.slice(2)] = value;
      i += 1;
    } else if (arg === '--per-test-timeout-ms') {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error('--per-test-timeout-ms needs a positive integer');
      out.perTestLimitMs = value;
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!out.help && out.files.length === 0) throw new Error('--files needs at least one path');
  return out;
}

export function sourceBasename(file) {
  const base = path.basename(file);
  const ext = path.extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

export function listTestFiles(repoRoot = REPO_ROOT) {
  return fs.readdirSync(path.join(repoRoot, 'tests'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.test\.(js|mjs)$/.test(entry.name))
    .map((entry) => `tests/${entry.name}`)
    .sort();
}

export function selectTests(files, repoRoot = REPO_ROOT) {
  const needles = [...new Set(files.map(sourceBasename))].filter(Boolean);
  return listTestFiles(repoRoot).filter((test) => {
    const text = fs.readFileSync(path.join(repoRoot, test), 'utf8');
    return needles.some((needle) => text.includes(needle));
  });
}

// Every package.json script command, split on ' && ', in the order npm runs
// them for `npm test` (pretest, test), then the remaining scripts.
export function scriptCommands(pkg) {
  const scripts = (pkg && pkg.scripts) || {};
  const order = ['pretest', 'test', ...Object.keys(scripts).filter((k) => k !== 'pretest' && k !== 'test')];
  const out = [];
  for (const name of order) {
    if (typeof scripts[name] !== 'string') continue;
    for (const command of scripts[name].split(' && ')) out.push({ script: name, command: command.trim() });
  }
  return out;
}

function normalizeToken(token) {
  return path.posix.normalize(token.replace(/^\.\//, ''));
}

// Returns the node argv (without the node binary) that runs `test` alone the
// way `command` runs it, or null when `command` does not run `test`.
export function singleFileArgs(command, test) {
  const tokens = command.split(/\s+/).filter(Boolean);
  if (tokens[0] !== 'node') return null;
  const flags = [];
  let i = 1;
  while (i < tokens.length && tokens[i].startsWith('-')) {
    flags.push(tokens[i]);
    if (NODE_FLAGS_WITH_VALUE.has(tokens[i]) && i + 1 < tokens.length) flags.push(tokens[++i]);
    i += 1;
  }
  const positionals = tokens.slice(i);
  const target = normalizeToken(test);
  if (flags.includes('--test')) {
    return positionals.some((t) => normalizeToken(t) === target) ? [...flags, test] : null;
  }
  if (positionals.length === 0 || normalizeToken(positionals[0]) !== target) return null;
  return [...flags, test, ...positionals.slice(1)];
}

export function resolveInvocation(test, commands) {
  for (const { script, command } of commands) {
    const args = singleFileArgs(command, test);
    if (args) return { args, command: ['node', ...args].join(' '), script };
  }
  return { args: [test], command: `node ${test}`, script: null };
}

export function gitHead(repoRoot = REPO_ROOT) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, shell: false, encoding: 'utf8',
  });
  if (result.error || result.status !== 0) return null;
  const sha = String(result.stdout).trim();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

// A loopback connect probe: true when something accepts on 127.0.0.1:<port>,
// false on refusal, null when the probe cannot tell.
export function probePortHeld(port = HUB_PORT, limitMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), limitMs);
    socket.once('connect', () => finish(true));
    socket.once('error', (error) => finish(error && error.code === 'ECONNREFUSED' ? false : null));
  });
}

function signalGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    try { child.kill(signal); } catch { /* already gone */ }
  }
}

export function runOne({ test, args, command }, { repoRoot = REPO_ROOT, limitMs, logPath, env }) {
  return new Promise((resolve) => {
    const fd = fs.openSync(logPath, 'w');
    fs.writeSync(fd, `$ ${command}\n`);
    const started = Date.now();
    const child = spawn(process.execPath, args, {
      cwd: repoRoot, env, stdio: ['ignore', fd, fd], detached: true, shell: false,
    });
    fs.closeSync(fd);
    let timedOut = false;
    let killTimer = null;
    const limitTimer = setTimeout(() => {
      timedOut = true;
      signalGroup(child, 'SIGTERM');
      killTimer = setTimeout(() => signalGroup(child, 'SIGKILL'), KILL_GRACE_MS);
    }, limitMs);
    const settle = (exitCode, signal) => {
      clearTimeout(limitTimer);
      if (killTimer) clearTimeout(killTimer);
      // A test that hit the limit may leave descendants that ignored SIGTERM.
      if (timedOut) signalGroup(child, 'SIGKILL');
      resolve({ test, command, exitCode, signal: signal || null, timedOut, durationMs: Date.now() - started });
    };
    child.once('error', () => settle(null, null));
    child.once('close', (code, signal) => settle(code, signal));
  });
}

export function isFailure(result) {
  return result.timedOut || result.signal !== null || result.exitCode !== 0;
}

export function newFailures(failures, baseline) {
  const known = new Set(Array.isArray(baseline && baseline.failures) ? baseline.failures : []);
  return failures.filter((test) => !known.has(test));
}

export async function sweep(options, { repoRoot = REPO_ROOT, write = (line) => process.stdout.write(`${line}\n`) } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const commands = scriptCommands(pkg);
  const files = options.files.map((file) => path.relative(repoRoot, path.resolve(repoRoot, file)).split(path.sep).join('/'));
  const tests = selectTests(files, repoRoot);
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-sweep-'));
  const env = { ...process.env, PATH: `${path.join(repoRoot, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH || ''}` };
  const startedAt = new Date().toISOString();
  const port7225Held = await probePortHeld(HUB_PORT);
  write(`sweep: ${tests.length} referencing tests for ${files.length} file(s); per-test limit ${options.perTestLimitMs} ms; 7225 held=${port7225Held}; logs ${logDir}`);

  const results = [];
  for (const [index, test] of tests.entries()) {
    const invocation = resolveInvocation(test, commands);
    const logPath = path.join(logDir, `${String(index + 1).padStart(3, '0')}-${path.basename(test)}.log`);
    const result = await runOne({ test, ...invocation }, { repoRoot, limitMs: options.perTestLimitMs, logPath, env });
    results.push(result);
    const status = isFailure(result) ? 'FAIL' : 'PASS';
    const why = status === 'FAIL'
      ? ` exit=${result.exitCode}${result.signal ? ` signal=${result.signal}` : ''}${result.timedOut ? ' timed-out' : ''} log=${logPath}`
      : '';
    write(`${status} ${test} (${result.durationMs} ms)${why}`);
  }

  const failures = [...new Set(results.filter(isFailure).map((r) => r.test))].sort();
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    head: gitHead(repoRoot),
    nodeVersion: process.version,
    port7225Held,
    perTestTimeoutMs: options.perTestLimitMs,
    files,
    results,
    failures,
  };
}

export async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`sweep-tests: ${error.message}\n\n${USAGE}\n`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const absoluteFiles = options.files.map((file) => path.resolve(file));
  const missing = options.files.filter((file, i) => !fs.existsSync(absoluteFiles[i]));
  if (missing.length) {
    process.stderr.write(`sweep-tests: no such file: ${missing.join(', ')}\n`);
    return 2;
  }
  options = { ...options, files: absoluteFiles };
  let baseline = null;
  if (options.baseline) {
    try {
      baseline = JSON.parse(fs.readFileSync(path.resolve(options.baseline), 'utf8'));
    } catch (error) {
      process.stderr.write(`sweep-tests: cannot read baseline ${options.baseline}: ${error.message}\n`);
      return 2;
    }
  }

  const result = await sweep(options);
  if (options.out) fs.writeFileSync(path.resolve(options.out), `${JSON.stringify(result, null, 2)}\n`);

  const passed = result.results.length - result.results.filter(isFailure).length;
  process.stdout.write(`sweep: ${passed}/${result.results.length} passed; failing: ${result.failures.length ? result.failures.join(', ') : 'none'}\n`);
  if (!baseline) return result.failures.length ? 1 : 0;

  if (baseline.port7225Held !== result.port7225Held) {
    process.stdout.write(`sweep: note: 7225 held=${result.port7225Held} now but ${baseline.port7225Held} in the baseline; port-bound results may differ\n`);
  }
  const added = newFailures(result.failures, baseline);
  const cleared = (baseline.failures || []).filter((test) => result.results.some((r) => r.test === test) && !result.failures.includes(test));
  if (cleared.length) process.stdout.write(`sweep: no longer failing: ${cleared.join(', ')}\n`);
  process.stdout.write(`sweep: NEW failures vs baseline: ${added.length ? added.join(', ') : 'none'}\n`);
  return added.length ? 1 : 0;
}

const invokedPath = process.argv[1] ? (() => {
  try { return pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return null; }
})() : null;
if (invokedPath === import.meta.url) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    process.stderr.write(`sweep-tests: ${error && error.stack ? error.stack : error}\n`);
    process.exitCode = 2;
  });
}
