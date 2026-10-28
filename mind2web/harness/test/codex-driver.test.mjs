import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCodexTask, codexToolViolation } from '../driver-codex.mjs';
import { StdioClient } from '../mcp-client.mjs';
import { HARNESS_DIR } from '../proc.mjs';

const task = { task_id: 'c'.repeat(32), confirmed_task: 'Find the price of the Blue Widget.', website: 'https://store.example/', reference_length: 2, level: 'easy' };
const serverCommand = [process.execPath, path.join(HARNESS_DIR, 'stub-fsb-server.mjs')];
async function directory(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'om2w-codex-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
function fakeModel(actions = [['read_page', {}], ['click', { selector: '#blue-widget' }]]) {
  return async (_command, args, options) => {
    assert.equal(args[args.indexOf('-m') + 1], 'gpt-6.1-sol');
    assert.ok(args.includes('--ignore-user-config'));
    assert.ok(args.includes('mcp_servers.fsb.default_tools_approval_mode="approve"'));
    const rpc = JSON.parse(args.find(arg => arg.startsWith('mcp_servers.fsb.args=')).split('=').slice(1).join('='));
    const client = new StdioClient([process.execPath, ...rpc], { stderr: null });
    options.onStdout(JSON.stringify({ type: 'thread.started', thread_id: 'test-session' }) + '\n');
    try {
      await client.initialize();
      const { tools } = await client.request('tools/list');
      assert.ok(!tools.some(t => t.name === 'run_task'));
      for (const [name, args] of actions) {
        const result = await client.request('tools/call', { name, arguments: args });
        options.onStdout(JSON.stringify({ type: 'item.completed', item: { type: 'mcp_tool_call', server: 'fsb', tool: name } }) + '\n');
        if (result.isError) break;
      }
      if (!options.signal.aborted) {
        await writeFile(args[args.indexOf('-o') + 1], 'The Blue Widget costs $19.99.');
        options.onStdout(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } }) + '\n');
      }
      return { code: options.signal.aborted ? 1 : 0, stdout: '', stderr: '' };
    } finally { await client.close(); }
  };
}
test('Codex uses the controller-owned FSB connection, correct badge and cleanup', async t => {
  const rawDir = await directory(t);
  const final = await runCodexTask({ task, rawDir, serverCommand, run: fakeModel() });
  assert.equal(final.outcome, 'complete'); assert.equal(final.cleanup_ok, true);
  assert.equal(final.final_answer, 'The Blue Widget costs $19.99.');
  assert.equal(final.action_count, 1); assert.equal(final.tool_calls, 2);
  const meta = JSON.parse(await readFile(path.join(rawDir, 'proxy-meta.json'), 'utf8'));
  assert.equal(meta.client, 'Codex'); assert.equal(meta.cleanup_ok, true);
  const steps = (await readFile(path.join(rawDir, 'steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(steps[0].args.client, 'Codex'); assert.equal(steps.at(-1).args.client, 'Codex');
});
test('the action limit prevents an extra action and still closes the owned tab', async t => {
  const rawDir = await directory(t);
  const final = await runCodexTask({ task, rawDir, serverCommand, maxActions: 1, run: fakeModel([['click', {}], ['click', {}]]) });
  assert.equal(final.outcome, 'step_limit'); assert.equal(final.action_count, 1); assert.equal(final.cleanup_ok, true);
});
test('a disallowed tool invalidates the attempt', async t => {
  const rawDir = await directory(t);
  const run = async (_command, _args, options) => {
    options.onStdout(JSON.stringify({ type: 'item.started', item: { type: 'command_execution', command: 'curl https://example.com' } }) + '\n');
    return { code: 1 };
  };
  const final = await runCodexTask({ task, rawDir, serverCommand, run });
  assert.equal(final.outcome, 'tool_violation'); assert.match(final.error, /command_execution/);
  assert.equal(codexToolViolation({ item: { type: 'mcp_tool_call', server: 'other', tool: 'read_page' } }, ['read_page']), 'Disallowed MCP tool: other/read_page');
});
test('a model timeout is recorded and does not orphan the controller', async t => {
  const rawDir = await directory(t);
  const command = path.join(rawDir, 'fake-codex');
  await writeFile(command, '#!/usr/bin/env node\nsetInterval(()=>{},1000);'); await chmod(command, 0o755);
  const final = await runCodexTask({ task, rawDir, serverCommand, command, timeoutMs: 100 });
  assert.equal(final.outcome, 'timeout'); assert.equal(final.final_answer, null);
});
test('missing model binary has a resumable startup outcome', async t => {
  const rawDir = await directory(t);
  const final = await runCodexTask({ task, rawDir, serverCommand, command: '/nonexistent/om2w-codex' });
  assert.equal(final.outcome, 'never_started');
});
test('unusable screenshots are an infrastructure pause rather than a fabricated trajectory', async t => {
  const rawDir = await directory(t);
  const image = path.join(rawDir, 'broken.png'); await writeFile(image, 'not a PNG');
  const run = async (_command, args, options) => {
    const rpc = JSON.parse(args.find(arg => arg.startsWith('mcp_servers.fsb.args=')).split('=').slice(1).join('='));
    const client = new StdioClient([process.execPath, ...rpc], { stderr: null });
    try { await client.initialize(); await assert.rejects(client.request('tools/call', { name: 'read_page', arguments: {} }), /bootstrap failed/); }
    finally { await client.close(); }
    return { code: 1, stderr: '' };
  };
  const final = await runCodexTask({ task, rawDir, serverCommand, env: { ...process.env, OM2W_STUB_SCREENSHOT: image }, run });
  assert.equal(final.outcome, 'rig_failure'); assert.equal(final.cleanup_ok, true); assert.equal(final.final_answer, null);
});
