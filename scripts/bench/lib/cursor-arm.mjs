/**
 * Phase 66 benchmark Cursor driver: EXPERIMENTAL, and excluded from the
 * Phase 66 two-arm baseline (orchestrator decision 7). A run only uses it
 * when --arms lists cursor, and its rows carry the experimental_arm flag.
 *
 * It shares the Claude Code driver's lifecycle (claude-arm.mjs): the same
 * allowlisted environment (B3), its own process group killed as a group
 * (W10), and the SIGINT/SIGTERM/SIGKILL ladder on budget expiry. The
 * workdir is an empty temp dir holding only .cursor/mcp.json, which points
 * at the same worktree MCP server. The instruction is the final positional
 * argument, after the print-mode argv from host-stream.mjs.
 *
 * No permission-bypass flag is passed. If Cursor needs interactive MCP
 * approval, the run ends without tool calls and is classified as an infra
 * error rather than a task failure.
 *
 * Cursor reports durations only, so its tokens and cost are labelled
 * "unavailable (host does not report)" (D-12).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBenchChildEnv, hostVersion, loadProviderKeyNames, runHostCli } from './claude-arm.mjs';
import { buildCursorArgv, summarizeCursorStream } from './host-stream.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');

/** `cursor-agent --version`, or null. */
export function cursorVersion({ command = 'cursor-agent', commandArgsPrefix = [], providerKeyNames = [] } = {}) {
  return hostVersion({ command, commandArgsPrefix, providerKeyNames });
}

/**
 * Runs one benchmark task through cursor-agent in print mode. Resolves
 * { t0, initAt, t1, exitedAt, exitCode, signal, timedOut, aborted,
 * spawnError, summary, envKeyNames, envKeyNamesSha256, streamStats }.
 */
export async function runCursorTask({
  repoRoot = REPO_ROOT, instruction, model, budgetMs, rawStreamPath,
  command = 'cursor-agent', commandArgsPrefix = [], sigintGraceMs = 10000, sigtermGraceMs = 5000,
  providerKeyNames = null, signal = null,
} = {}) {
  if (typeof instruction !== 'string' || !instruction.trim() || instruction.startsWith('-')) {
    throw new TypeError('instruction must be a non-empty string that does not start with "-"');
  }
  const keyNames = Array.isArray(providerKeyNames) ? providerKeyNames : await loadProviderKeyNames(repoRoot);
  const childEnv = buildBenchChildEnv(process.env, { toolSearch: 'unset', providerKeyNames: keyNames });
  const argv = [...buildCursorArgv({ model }), instruction];
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-bench-cursor-'));
  try {
    fs.mkdirSync(path.join(workdir, '.cursor'), { mode: 0o700 });
    fs.writeFileSync(path.join(workdir, '.cursor', 'mcp.json'), JSON.stringify({
      mcpServers: {
        fsb: { command: process.execPath, args: [path.join(repoRoot, 'mcp', 'build', 'index.js')] },
      },
    }), { mode: 0o600 });
    const run = await runHostCli({
      command,
      args: [...commandArgsPrefix, ...argv],
      cwd: workdir,
      env: childEnv.env,
      stdinText: null,
      budgetMs,
      rawStreamPath,
      sigintGraceMs,
      sigtermGraceMs,
      signal,
    });
    const { events, ...rest } = run;
    return {
      ...rest,
      summary: summarizeCursorStream(events),
      envKeyNames: childEnv.keyNames,
      envKeyNamesSha256: childEnv.keyNamesSha256,
    };
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}
