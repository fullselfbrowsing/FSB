import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseTasks, downloadDataset, readCachedDataset } from '../dataset.mjs';
import { selectTasks } from '../sample.mjs';
import { deriveOutcome } from '../outcomes.mjs';
import { preflight } from '../preflight.mjs';
import { options } from '../run-bench.mjs';
import { runCommand } from '../proc.mjs';

const rows = Array.from({ length: 12 }, (_, i) => ({ task_id: i.toString(16).padStart(32, '0'), confirmed_task: `Task ${i}`, website: 'https://example.com/', reference_length: 2, level: ['easy', 'medium', 'hard'][i % 3] }));
test('dataset validates IDs, levels, URLs and reference lengths', () => {
  assert.equal(parseTasks(JSON.stringify(rows)).length, 12);
  for (const value of [{ reference_length: 0 }, { level: 'other' }, { website: 'file:///bad' }, { task_id: '../bad' }]) {
    assert.throws(() => parseTasks(JSON.stringify([{ ...rows[0], ...value }])));
  }
  assert.throws(() => parseTasks(JSON.stringify([rows[0], rows[0]])), /duplicate/);
});
test('dataset download and cache verify pinned metadata and bytes', async t => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'om2w-dataset-'));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const fresh = await downloadDataset({ cacheDir, token: 'test', fetchImpl: async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test');
    return new Response(JSON.stringify(rows));
  } });
  assert.equal((await readCachedDataset({ cacheDir })).tasks.length, 12);
  await writeFile(fresh.path, '[]');
  await assert.rejects(readCachedDataset({ cacheDir }), /sha256/);
  await assert.rejects(downloadDataset({ cacheDir, token: '' }), /HF_TOKEN/);
  await assert.rejects(downloadDataset({ cacheDir, token: 'test', fetchImpl: async () => new Response('', { status: 403 }) }), /terms/);
});
test('pilot selection is deterministic and stratified independently of source order', () => {
  const a = selectTasks(rows, { count: 6 });
  assert.deepEqual(a, selectTasks([...rows].reverse(), { count: 6 }));
  for (const level of ['easy', 'medium', 'hard']) assert.equal(a.filter(t => t.level === level).length, 2);
  assert.throws(() => selectTasks(rows, { count: 100 }));
  assert.throws(() => selectTasks(rows, { ids: ['missing'] }));
});
test('driver outcome never equates CLI completion with benchmark success', () => {
  assert.equal(deriveOutcome({ subtype: 'success', is_error: true }, { code: 0 }), 'error');
  assert.equal(deriveOutcome({ subtype: 'success' }, { code: 1 }), 'error');
  assert.equal(deriveOutcome({ subtype: 'error_max_turns' }, { code: 0 }), 'max_turns');
  assert.equal(deriveOutcome(null, { code: 127 }), 'never_started');
  assert.equal(deriveOutcome(null, { code: 128, timedOut: true }), 'timeout');
});
test('preflight reports occupied ports without connecting or killing anything', async () => {
  const report = await preflight({ datasetPath: '/fixture', chromePath: process.execPath, filesystem: async () => ({ bavail: 100, bsize: 1e9 }),
    run: async cmd => ({ code: 0, stdout: cmd === 'lsof' ? 'node 48247 user TCP 127.0.0.1:7225 (LISTEN)' : 'version', stderr: '' }) });
  assert.equal(report.ok, false); assert.equal(report.checks.find(c => c.name === 'bridge_ports').ok, false);
});
test('CLI validates run IDs and limits', () => {
  assert.equal(options(['--dry-run', '--run-id', 'test-1'])['dry-run'], true);
  assert.throws(() => options(['--run-id', '../escape']));
  assert.throws(() => options(['--max-turns', '0']));
});
test('command timeout kills its process group and reports timeout', async () => {
  const result = await runCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 50 });
  assert.equal(result.timedOut, true); assert.notEqual(result.code, 0);
});
test('streamed output preserves multibyte characters across chunks', async () => {
  let output = '';
  const r = await runCommand(process.execPath, ['-e', 'const b=Buffer.from("✓");process.stdout.write(b.subarray(0,1));setTimeout(()=>process.stdout.end(b.subarray(1)),15)'], { onStdout: chunk => { output += chunk; } });
  assert.equal(r.stdout, '✓'); assert.equal(output, '✓');
});
