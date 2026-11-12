import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCommand } from './proc.mjs';

export function waitForResource(ms, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

export async function modelReady({ driver, model, effort, signal, run = runCommand }) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'om2w-ready-'));
  try {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    const args = driver === 'codex' ? ['exec', '-m', model, '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '-s', 'read-only', '--json',
      '-c', `model_reasoning_effort=${JSON.stringify(effort)}`, '-c', 'features.shell_tool=false', '-c', 'features.apply_patch_freeform=false', '-c', 'web_search="disabled"', '-'] :
      ['-p', '--model', model, '--effort', effort, '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--settings', '{"disableAllHooks":true}', '--no-session-persistence', '--disable-slash-commands', '--max-turns', '1', '--output-format', 'json'];
    const result = await run(driver === 'codex' ? 'codex' : 'claude', args, { input: 'Reply READY only. Do not use tools.', cwd, env, timeoutMs: 45_000, signal });
    let ready = false;
    let usage = null;
    if (driver === 'codex') {
      for (const line of result.stdout.split('\n')) {
        try { const event = JSON.parse(line); if (event.type === 'turn.completed') { ready = true; usage = event.usage; } } catch {}
      }
    } else {
      try { const event = JSON.parse(result.stdout); ready = !event.is_error && event.subtype === 'success'; usage = event.usage; } catch {}
    }
    return { ok: result.code === 0 && ready, usage, checked_at: new Date().toISOString() };
  } finally { await rm(cwd, { recursive: true, force: true }); }
}
