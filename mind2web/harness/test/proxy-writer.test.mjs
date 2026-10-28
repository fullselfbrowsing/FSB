import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { HARNESS_DIR } from '../proc.mjs';
import { StdioClient } from '../mcp-client.mjs';
import { RecordingProxy } from '../mcp-record-proxy.mjs';
import { writeV2, formatAction } from '../v2-writer.mjs';
import { validateTrajectoryDir } from '../validate-v2.mjs';
import { inspectPng, encodeSolidPng } from '../png.mjs';
import { crc32 } from 'node:zlib';

const allowlist = JSON.parse(await readFile(new URL('../../config/tool-allowlist.json', import.meta.url), 'utf8'));
const task = { task_id: 'a'.repeat(32), confirmed_task: 'Find the price.', website: 'https://store.example/', reference_length: 2, level: 'easy' };
async function fixture(t, env = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'om2w-test-'));
  const raw = path.join(root, 'raw');
  const client = new StdioClient([process.execPath, path.join(HARNESS_DIR, 'mcp-record-proxy.mjs'), '--', process.execPath, path.join(HARNESS_DIR, 'stub-fsb-server.mjs')], {
    env: { ...process.env, ...env, OM2W_RAW_DIR: raw, OM2W_START_URL: task.website }, stderr: null,
  });
  t.after(async () => { await client.close(); await rm(root, { recursive: true, force: true }); });
  await client.initialize();
  return { root, raw, client };
}
test('proxy hides tools and surfaces; denies hidden calls without forwarding', async t => {
  const { client, raw } = await fixture(t);
  const tools = (await client.request('tools/list')).tools;
  assert.equal(tools.length, Object.keys(allowlist.actions).length + allowlist.reads.length);
  assert.ok(!tools.some(t => t.name === 'execute_js' || t.name === 'capture_screenshot'));
  assert.ok(!tools.find(t => t.name === 'click').inputSchema.properties.client);
  assert.deepEqual(await client.request('resources/list'), { resources: [] });
  await assert.rejects(client.request('resources/read', { uri: 'file:///secret' }), /disabled/);
  const denied = await client.request('tools/call', { name: 'open_tab', arguments: { url: 'https://bad.example' } });
  assert.equal(denied.isError, true);
  const steps = (await readFile(path.join(raw, 'steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].kind, 'denied');
});
test('concurrent action calls serialize their screenshots and override tab/client', async t => {
  const { client, raw, root } = await fixture(t);
  await Promise.all([
    client.request('tools/call', { name: 'navigate', arguments: { url: 'https://store.example/a', client: 'Other', tab_id: 99, visual_reason: 'Open item' } }),
    client.request('tools/call', { name: 'navigate', arguments: { url: 'https://store.example/b', tab_id: 99, visual_reason: 'Open second item' } }),
  ]);
  const steps = (await readFile(path.join(raw, 'steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(steps.map(e => e.seq), [0, 1, 2]);
  assert.deepEqual(steps.slice(1).map(e => e.url), ['https://store.example/a', 'https://store.example/b']);
  assert.equal(steps[1].args.tab_id, 17); assert.equal(steps[1].args.client, 'Claude');
  for (const entry of steps) assert.equal(inspectPng(await readFile(entry.screenshot_path)).ok, true);
  await writeFile(path.join(raw, 'final.json'), JSON.stringify({ final_answer: 'Price: $19.99\n"Blue" ✓', outcome: 'complete' }));
  const written = await writeV2({ task, rawDir: raw, outDir: path.join(root, 'trajectories') });
  assert.deepEqual(await validateTrajectoryDir(written.dir), { ok: true, errors: [] });
  const result = JSON.parse(await readFile(written.resultPath, 'utf8'));
  assert.equal(result.reference_length, 2);
  assert.equal(result.action_history.at(-1).action, 'TASK_COMPLETE -> ANSWER: Price: $19.99\n"Blue" ✓');
  assert.equal(result.action_history[1].thought, 'Open item');
});
test('failed actions remain in the trajectory with FAILED status', async t => {
  const { client, raw, root } = await fixture(t, { OM2W_STUB_FAIL_TOOL: 'click' });
  assert.equal((await client.request('tools/call', { name: 'click', arguments: { selector: '#x' } })).isError, true);
  await writeFile(path.join(raw, 'final.json'), JSON.stringify({ outcome: 'error', final_answer: null }));
  const written = await writeV2({ task, rawDir: raw, outDir: path.join(root, 'out') });
  const result = JSON.parse(await readFile(written.resultPath, 'utf8'));
  assert.equal(result.action_history[1].action_status, 'FAILED');
  assert.equal(result.agent_final_answer, null);
  assert.equal((await validateTrajectoryDir(written.dir)).ok, true);
});
test('read-only tasks export the latest observation as terminal evidence', async t => {
  const { client, raw, root } = await fixture(t);
  await client.request('tools/call', { name: 'read_page', arguments: {} });
  await client.close();
  const steps = (await readFile(path.join(raw, 'steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  const fresh = encodeSolidPng(40, 40, [255, 0, 0]);
  await writeFile(steps[1].screenshot_path, fresh);
  await writeFile(path.join(raw, 'final.json'), JSON.stringify({ outcome: 'complete', final_answer: '$19.99' }));
  const written = await writeV2({ task, rawDir: raw, outDir: path.join(root, 'out') });
  const result = JSON.parse(await readFile(written.resultPath, 'utf8'));
  assert.equal(result.action_history.length, 2);
  assert.deepEqual(await readFile(path.join(written.dir, 'trajectory', result.action_history.at(-1).screenshot)), fresh);
});
test('bootstrap failure returns promptly and refuses the agent call', async t => {
  const { client } = await fixture(t, { OM2W_STUB_FAIL_TOOL: 'open_tab' });
  await assert.rejects(client.request('tools/call', { name: 'read_page', arguments: {} }), /bootstrap failed/);
});
test('a replaced frame retries only capture, preserves the failure and exports genuine evidence', async t => {
  const { client, raw, root } = await fixture(t, { OM2W_STUB_TRANSIENT_CAPTURES: '1' });
  await client.request('tools/call', { name: 'click', arguments: { selector: '#blue-widget' } });
  await client.close();
  const steps = (await readFile(path.join(raw, 'steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(steps.length, 2); assert.equal(steps[0].screenshot_attempts.length, 2);
  assert.match(steps[0].screenshot_attempts[0].error, /Frame with ID 0 was removed/);
  assert.equal(steps[0].screenshot_attempts[1].ok, true);
  const meta = JSON.parse(await readFile(path.join(raw, 'proxy-meta.json')));
  assert.equal(meta.counts.screenshot_retries, 1); assert.equal(meta.counts.screenshot_errors, 0); assert.equal(meta.counts.actions, 1);
  const written = await writeV2({ task, rawDir: raw, outDir: path.join(root, 'out') });
  assert.equal((await validateTrajectoryDir(written.dir)).ok, true);
});
test('persistent frame loss stops after bounded capture retries without fabricating a screenshot', async t => {
  const { client, raw } = await fixture(t, { OM2W_STUB_TRANSIENT_CAPTURES: '10' });
  await assert.rejects(client.request('tools/call', { name: 'read_page', arguments: {} }), /bootstrap failed/);
  const first = JSON.parse((await readFile(path.join(raw, 'steps.jsonl'), 'utf8')).trim());
  assert.equal(first.screenshot_attempts.length, 4); assert.equal(first.screenshot_path, null);
  const meta = JSON.parse(await readFile(path.join(raw, 'proxy-meta.json')));
  assert.equal(meta.counts.screenshot_retries, 3); assert.equal(meta.counts.screenshot_errors, 1); assert.equal(meta.counts.reads, 0);
});
test('upstream exit is caught without hanging the downstream request', async t => {
  const { client } = await fixture(t, { OM2W_STUB_EXIT_TOOL: 'click' });
  const result = await client.request('tools/call', { name: 'click', arguments: {} });
  assert.equal(result.isError, true);
});
test('writer refuses incomplete screenshots and corrupt logs', async t => {
  const { client, raw, root } = await fixture(t);
  await client.request('tools/call', { name: 'click', arguments: {} });
  await client.close();
  const file = path.join(raw, 'steps.jsonl');
  const steps = (await readFile(file, 'utf8')).trim().split('\n').map(JSON.parse);
  await writeFile(steps[1].screenshot_path, '');
  await assert.rejects(writeV2({ task, rawDir: raw, outDir: path.join(root, 'out') }), /screenshot unusable/);
  await writeFile(file, '{broken\n');
  await assert.rejects(writeV2({ task, rawDir: raw, outDir: path.join(root, 'out') }), /not valid JSON/);
});
test('validator detects answer mismatch, missing thought, wrong reference length, corrupt image', async t => {
  const { client, raw, root } = await fixture(t);
  await client.request('tools/call', { name: 'read_page', arguments: {} });
  const written = await writeV2({ task, rawDir: raw, outDir: path.join(root, 'out') });
  const result = JSON.parse(await readFile(written.resultPath, 'utf8'));
  result.agent_final_answer = 'invented'; result.reference_length = 0; delete result.action_history[0].thought;
  await writeFile(written.resultPath, JSON.stringify(result));
  await writeFile(path.join(written.dir, 'trajectory/0000.png'), Buffer.alloc(0));
  const checked = await validateTrajectoryDir(written.dir);
  assert.equal(checked.ok, false); assert.ok(checked.errors.length >= 4);
});
test('action descriptions keep agent intent in thought, not factual action strings', () => {
  const action = formatAction('click', 'CLICK', { selector: '#x' }, true, 'All requirements are complete');
  assert.ok(!action.includes('All requirements'));
  assert.equal(inspectPng(encodeSolidPng(20, 20)).ok, true);
  assert.equal(inspectPng(Buffer.alloc(0)).ok, false);
});
test('PNG validation rejects invalid compressed data even when chunk CRCs are valid', () => {
  const bytes = encodeSolidPng(20, 20);
  let offset = 8;
  while (bytes.toString('latin1', offset + 4, offset + 8) !== 'IDAT') offset += bytes.readUInt32BE(offset) + 12;
  const length = bytes.readUInt32BE(offset);
  bytes[offset + 8] = 0;
  bytes.writeUInt32BE(crc32(bytes.subarray(offset + 4, offset + 8 + length)), offset + 8 + length);
  assert.equal(inspectPng(bytes).ok, false);
});
