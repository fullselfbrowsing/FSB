import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BENCH_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
export const CACHE_DIR = `${BENCH_ROOT}/cache`;
export const RESULTS_DIR = `${BENCH_ROOT}/results`;
export const CONFIG_DIR = `${BENCH_ROOT}/config`;
export const HARNESS_DIR = `${BENCH_ROOT}/harness`;
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');

// Runs a command to completion and never throws: a missing binary comes back
// as code 127 so callers (and test doubles) see one shape for every failure.
export function killGroup(child, signal = 'SIGTERM') {
  if (!child?.pid) return;
  try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch {} }
}

export function runCommand(cmd, args = [], { input, timeoutMs = 30_000, env, cwd, onStdout, onStderr, capture = true, signal } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { env: env ?? process.env, cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ code: 127, stdout: '', stderr: String(err.message || err) });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let settled = false;
    let timedOut = false;
    const abort = () => killGroup(child, 'SIGKILL');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child, 'SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d) => { if (capture) stdout += d; onStdout?.(d); });
    child.stderr.on('data', (d) => { if (capture) stderr += d; onStderr?.(d); });
    child.stdin.on('error', () => {});
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve({ code: err.code === 'ENOENT' ? 127 : 1, stdout, stderr: stderr || String(err.message || err) });
    });
    child.on('close', (code, closeSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      killGroup(child, 'SIGTERM');
      resolve({ code: code ?? (closeSignal ? 128 : 1), stdout, stderr, signal: closeSignal, timedOut });
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

export function isoNow() {
  return new Date().toISOString();
}
