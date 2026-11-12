import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { runClaudeTask } from '../driver-claude-code.mjs';
import { HARNESS_DIR } from '../proc.mjs';

const task = { task_id: 'b'.repeat(32), website: 'https://store.example/', confirmed_task: 'Find a price.', reference_length: 2, level: 'easy' };
async function cliFixture(t, code) {
  const root = await mkdtemp(path.join(tmpdir(), 'om2w-driver-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const command = path.join(root, 'fake-claude');
  await writeFile(command, '#!/usr/bin/env node\n' + code);
  await chmod(command, 0o755);
  return { root, command };
}
test('driver persists a complete result and loads only its configured MCP server', async t => {
  const { root, command } = await cliFixture(t, `
    const fs = require('node:fs');
    const args=process.argv.slice(2);
    const config=JSON.parse(fs.readFileSync(args[args.indexOf('--mcp-config')+1]));
    console.log(JSON.stringify({type:'system',subtype:'init',tools:[],mcp_servers:[]}));
    console.log(JSON.stringify({type:'result',subtype:'success',num_turns:1,result:JSON.stringify({args,servers:Object.keys(config.mcpServers),url:config.mcpServers.fsb.env.OM2W_START_URL})}));
  `);
  const rawDir = path.join(root, 'raw');
  const final = await runClaudeTask({ task, rawDir, command, serverCommand: [process.execPath, 'fake-server'] });
  assert.equal(final.outcome, 'complete');
  const answer = JSON.parse(final.final_answer);
  assert.deepEqual(answer.servers, ['fsb']); assert.equal(answer.url, task.website);
  assert.equal(answer.args[answer.args.indexOf('--tools') + 1], '');
  assert.ok(answer.args.includes('--strict-mcp-config'));
  assert.ok(answer.args[answer.args.indexOf('--disallowedTools') + 1].includes('mcp__fsb__run_task'));
  assert.equal(JSON.parse(await readFile(path.join(rawDir, 'final.json'), 'utf8')).outcome, 'complete');
});
test('driver records wall-clock expiry even without a CLI result', async t => {
  const { root, command } = await cliFixture(t, 'setInterval(()=>{},1000);');
  const final = await runClaudeTask({ task, rawDir: path.join(root, 'raw'), command, serverCommand: ['unused'], timeoutMs: 100 });
  assert.equal(final.outcome, 'timeout'); assert.equal(final.final_answer, null);
});
const lateAnswer = `setTimeout(() => {
  console.log(JSON.stringify({ type: 'result', subtype: 'success', num_turns: 1, result: 'late answer' }));
  process.exit(0);
}, 1500); setInterval(() => {}, 1000);`;
test('cancelling a run stops the CLI before it can finish the task', async t => {
  const { root, command } = await cliFixture(t, lateAnswer);
  const rawDir = path.join(root, 'raw'), controller = new AbortController(), started = Date.now();
  setTimeout(() => controller.abort(), 100);
  const final = await runClaudeTask({ task, rawDir, command, serverCommand: ['unused'], signal: controller.signal });
  assert.ok(Date.now() - started < 1200, 'the CLI is stopped, not waited for');
  assert.notEqual(final.outcome, 'complete'); assert.equal(final.final_answer, null);
  assert.doesNotMatch(await readFile(path.join(rawDir, 'stream.jsonl'), 'utf8').catch(() => ''), /late answer/);
});
test('a run that is already cancelled never completes the task', async t => {
  const { root, command } = await cliFixture(t, lateAnswer);
  const started = Date.now();
  const final = await runClaudeTask({ task, rawDir: path.join(root, 'raw'), command, serverCommand: ['unused'], signal: AbortSignal.abort() });
  assert.ok(Date.now() - started < 1200, 'the CLI is stopped, not waited for');
  assert.notEqual(final.outcome, 'complete'); assert.equal(final.final_answer, null);
});
const stubServer = [process.execPath, path.join(HARNESS_DIR, 'stub-fsb-server.mjs')];
const mcpClient = pathToFileURL(path.join(HARNESS_DIR, 'mcp-client.mjs')).href;
// Three mutating calls through the real proxy, then a claimed success.
const threeClicks = showRefusal => `(async () => {
  const fs = require('node:fs');
  const { StdioClient } = await import(${JSON.stringify(mcpClient)});
  const args = process.argv.slice(2);
  const fsb = JSON.parse(fs.readFileSync(args[args.indexOf('--mcp-config') + 1])).mcpServers.fsb;
  const client = new StdioClient([fsb.command, ...fsb.args], { env: { ...process.env, ...fsb.env }, stderr: null });
  await client.initialize();
  for (let i = 0; i < 3; i++) {
    const reply = await client.request('tools/call', { name: 'click', arguments: { selector: '#go' } });
    if (${showRefusal}) console.log(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't' + i, is_error: reply.isError === true, content: reply.content }] } }));
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  console.log(JSON.stringify({ type: 'result', subtype: 'success', num_turns: 3, result: 'finished anyway' }));
  await client.close(); process.exit(0);
})();`;
const actionsIn = async rawDir => (await readFile(path.join(rawDir, 'steps.jsonl'), 'utf8')).trim().split('\n')
  .map(line => JSON.parse(line)).filter(step => step.kind === 'action').length;
test('a run stops at its action limit as soon as the refusal is seen', async t => {
  const { root, command } = await cliFixture(t, threeClicks(true));
  const rawDir = path.join(root, 'raw');
  const final = await runClaudeTask({ task, rawDir, command, serverCommand: stubServer, maxActions: 1 });
  assert.equal(final.outcome, 'step_limit'); assert.equal(final.final_answer, null);
  assert.equal(final.error, 'Benchmark action limit reached');
  assert.equal(await actionsIn(rawDir), 1);
  assert.doesNotMatch(await readFile(path.join(rawDir, 'stream.jsonl'), 'utf8'), /finished anyway/);
});
test('the action limit holds even when the stream never shows the refusal', async t => {
  const { root, command } = await cliFixture(t, threeClicks(false));
  const rawDir = path.join(root, 'raw');
  const final = await runClaudeTask({ task, rawDir, command, serverCommand: stubServer, maxActions: 1 });
  assert.equal(final.outcome, 'step_limit'); assert.equal(final.final_answer, null);
  assert.equal(await actionsIn(rawDir), 1);
});
test('a run under its action limit completes normally', async t => {
  const { root, command } = await cliFixture(t, threeClicks(true));
  const rawDir = path.join(root, 'raw');
  const final = await runClaudeTask({ task, rawDir, command, serverCommand: stubServer, maxActions: 5 });
  assert.equal(final.outcome, 'complete'); assert.equal(final.final_answer, 'finished anyway');
  assert.equal(await actionsIn(rawDir), 3);
});
test('page text that quotes the limit message does not end the run', async t => {
  const { root, command } = await cliFixture(t, `
    const text = 'Benchmark action limit reached';
    console.log(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', is_error: false, content: [{ type: 'text', text }] }] } }));
    console.log(JSON.stringify({ type: 'result', subtype: 'success', num_turns: 1, result: 'done' }));
  `);
  const final = await runClaudeTask({ task, rawDir: path.join(root, 'raw'), command, serverCommand: ['unused'] });
  assert.equal(final.outcome, 'complete');
});
