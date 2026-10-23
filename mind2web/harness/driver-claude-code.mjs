import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BENCH_ROOT, HARNESS_DIR, runCommand } from './proc.mjs';
import { deriveOutcome } from './outcomes.mjs';

export async function runClaudeTask({ task, rawDir, serverCommand, model = 'claude-opus-5-5', effort = 'medium', maxTurns = 60, timeoutMs = 600_000, budgetUsd = 5, env = process.env, command = 'claude' }) {
  await mkdir(rawDir, { recursive: true });
  rawDir = path.resolve(rawDir);
  const work = await mkdtemp(path.join(tmpdir(), 'om2w-agent-'));
  const started = Date.now();
  let result = null;
  let init = null;
  let pending = '';
  try {
    const configPath = path.join(work, 'mcp.json');
    await writeFile(configPath, JSON.stringify({ mcpServers: { fsb: {
      command: process.execPath, args: [path.join(HARNESS_DIR, 'mcp-record-proxy.mjs'), '--', ...serverCommand],
      env: { OM2W_RAW_DIR: rawDir, OM2W_START_URL: task.website },
    } } }));
    const allowlist = JSON.parse(await readFile(path.join(BENCH_ROOT, 'config/tool-allowlist.json'), 'utf8'));
    const toolNames = JSON.parse(await readFile(path.join(BENCH_ROOT, 'config/fsb-tool-names.json'), 'utf8')).tools.map(t => t.name);
    const allowed = [...Object.keys(allowlist.actions), ...allowlist.reads];
    const denied = toolNames.filter(n => !allowed.includes(n)).map(n => `mcp__fsb__${n}`);
    const args = ['-p', '--model', model, '--effort', effort, '--tools', '', '--strict-mcp-config', '--mcp-config', configPath,
      '--setting-sources', '', '--settings', '{"disableAllHooks":true}', '--disable-slash-commands', '--no-chrome',
      '--no-session-persistence', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'dontAsk',
      '--allowedTools', allowed.map(n => `mcp__fsb__${n}`).join(','), '--disallowedTools', ['ListMcpResourcesTool', 'ReadMcpResourceTool', ...denied].join(','),
      '--max-turns', String(maxTurns), '--max-budget-usd', String(budgetUsd),
      '--system-prompt-file', path.join(BENCH_ROOT, 'config/agent-prompt.md')];
    const cleanEnv = { ...env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', ENABLE_TOOL_SEARCH: 'false' };
    delete cleanEnv.CLAUDECODE;
    delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;
    delete cleanEnv.HF_TOKEN;
    delete cleanEnv.HUGGING_FACE_HUB_TOKEN;
    const execution = await runCommand(command, args, { cwd: work, env: cleanEnv, input: `Starting website: ${task.website}\nTask: ${task.confirmed_task}\n`, timeoutMs, capture: false,
      onStdout: chunk => {
        appendFileSync(path.join(rawDir, 'stream.jsonl'), chunk);
        pending += chunk;
        const lines = pending.split('\n'); pending = lines.pop();
        for (const line of lines) {
          try { const event = JSON.parse(line); if (event.type === 'result') result = event; if (event.type === 'system' && event.subtype === 'init') init = event; } catch {}
        }
      },
      onStderr: chunk => appendFileSync(path.join(rawDir, 'stderr.log'), chunk),
    });
    let outcome = deriveOutcome(result, execution);
    if (outcome === 'error' && Date.now() - started < 5000) {
      try { await readFile(path.join(rawDir, 'steps.jsonl')); } catch { outcome = 'never_started'; }
    }
    try { if ((await readFile(path.join(rawDir, 'steps.jsonl'), 'utf8')).includes('TAB_NOT_FOREGROUND')) outcome = 'rig_failure'; } catch {}
    const final = { task_id: task.task_id, model, final_answer: outcome === 'complete' && typeof result?.result === 'string' ? result.result : null,
      outcome, num_turns: result?.num_turns ?? null, duration_ms: Date.now() - started, usage: result?.usage ?? null,
      total_cost_usd: result?.total_cost_usd ?? null, session_id: result?.session_id ?? null,
      error: outcome === 'complete' ? null : (result?.result || result?.errors?.join('\n') || execution.stderr || outcome),
      init_tools: init?.tools ?? null, init_mcp_servers: init?.mcp_servers ?? null };
    await writeFile(path.join(rawDir, 'final.json'), `${JSON.stringify(final, null, 2)}\n`);
    return final;
  } finally { await rm(work, { recursive: true, force: true }); }
}
