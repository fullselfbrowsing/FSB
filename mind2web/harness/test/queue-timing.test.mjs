import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { queueTimingEvidence } from '../queue-timing.mjs';
import { encodeSolidPng } from '../png.mjs';
import { collectManual } from '../manual-runner.mjs';
import { pairedPilot, operationMetrics } from '../manual-pilot.mjs';
import { assertResumeSafe } from '../repair-benchmark.mjs';
import { BENCH_ROOT } from '../proc.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => readFile(file, 'utf8').then(JSON.parse);
const clock = monotonic_ms => ({ utc: '2026-10-18T10:00:00.000Z', monotonic_ms });
const lines = (file, rows) => writeFile(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
async function temporary(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'manual-queue-timing-'));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}
async function rawEvidence(rawDir, task, mode = 'physical') {
  await mkdir(path.join(rawDir, 'shots'), { recursive: true });
  const queue = { seq: 1, kind: 'denied', tool: 'click', error_code: 'BROWSER_QUEUE_TIMEOUT',
    execution_outcome: 'reported_failure', timing: { lease_requested: clock(0) },
    started_at: '2026-10-18T10:00:00.000Z', ended_at: '2026-10-18T10:01:00.000Z', screenshot_path: null };
  const steps = [], emissions = [];
  if (mode === 'denied-bootstrap') steps.push({ ...queue, seq: 0, tool: 'open_tab' });
  else for (let seq = 0; seq < 2; seq++) {
    const bytes = encodeSolidPng(120, 100, [40 + seq * 20, 60, 80]);
    const screenshot_path = path.join(rawDir, 'shots', `${seq}.png`);
    await writeFile(screenshot_path, bytes);
    const frame_receipt = { task_id: task.task_id, tab_id: 42, source_url: task.website,
      frame_id: `${task.task_id}-frame-${seq}`, capture_id: `${task.task_id}-capture-${seq}`,
      output_width: 120, output_height: 100, sha256: hash(bytes), byte_length: bytes.length };
    steps.push({ seq, kind: seq ? 'action' : 'bootstrap', tool: seq ? 'click' : 'open_tab',
      args: seq ? { selector: '#button' } : { url: task.website }, tab_id: 42, ok: true, url: task.website,
      screenshot_path, frame_receipt, execution_outcome: 'reported_success',
      started_at: '2026-10-18T10:00:00.000Z', ended_at: '2026-10-18T10:00:01.000Z',
      timing: { lease_requested: clock(0), lease_acquired: clock(1000), upstream_started: clock(1010),
        upstream_finished: clock(1020), capture_started: clock(1030), lease_released: clock(1100) } });
    if (seq) emissions.push({ frame_id: frame_receipt.frame_id });
  }
  if (mode === 'missing-action') {
    steps[1].screenshot_path = null; delete steps[1].frame_receipt;
    steps.push({ ...queue, seq: 2 });
  }
  if (mode === 'corrupt-action') {
    await writeFile(steps[1].screenshot_path, 'Corrupt retained pixels'); steps.push({ ...queue, seq: 2 });
  }
  if (mode === 'denied-read-capture') {
    steps[1] = { ...queue, kind: 'read', tool: 'read_page', ok: true, execution_outcome: 'reported_success',
      timing: { upstream_started: clock(10), upstream_finished: clock(20), lease_requested: clock(25) } };
  }
  if (mode === 'denied-action-capture') {
    steps[1] = { ...queue, kind: 'action', tool: 'click', ok: true, execution_outcome: 'reported_success',
      timing: { upstream_started: clock(10), upstream_finished: clock(20), lease_requested: clock(25) } };
  }
  await lines(path.join(rawDir, 'steps.jsonl'), steps);
  if (emissions.length) await lines(path.join(rawDir, 'emissions.jsonl'), emissions);
  const queued = mode !== 'physical';
  const final = { outcome: 'timeout', cleanup_ok: true, action_count: 1, actor_mutations_dispatched: mode === 'denied-bootstrap' ? 0 : 1,
    duration_ms: 1100, actor_duration_ms: 1000, cleanup_duration_ms: 100, queue_expiries: queued ? 1 : 0,
    model_spawn_requested: true, usage: null, final_answer: 'Synthetic fixture, no browser or model call.', error: null };
  await writeFile(path.join(rawDir, 'final.json'), JSON.stringify(final));
  return { final, steps };
}
function collectorDependencies(modeFor, state) {
  return { keeper: { async initialize() {}, async close() {} }, fingerprint: async () => ({ unit: 'frozen' }),
    circuit: async () => ({ allowed: true, ready: true, family: 'codex', generation: 0 }),
    drive: async options => {
      assert.equal((await options.beforeSpawn()).allowed, true); state.push(options);
      return (await rawEvidence(options.rawDir, options.task, modeFor(options))).final;
    } };
}

test('queue evidence permits an undispatched bootstrap or read capture but never a missing action observation', async t => {
  const root = await temporary(t), task = { task_id: 'unit_task', website: 'https://fixture.test/' };
  for (const mode of ['denied-bootstrap', 'denied-read-capture', 'denied-action-capture', 'missing-action', 'corrupt-action']) {
    const raw = path.join(root, mode, task.task_id, 'attempt-1'); await rawEvidence(raw, task, mode);
    const proof = await queueTimingEvidence(raw);
    assert.equal(proof.valid, ['denied-bootstrap', 'denied-read-capture'].includes(mode), mode);
    assert.equal(proof.can_explain_missing_export, proof.valid, mode);
  }
});

test('gateway-only non-dispatch queue expiry binds the complete journal and no native operation', async t => {
  const root = await temporary(t), raw = path.join(root, 'task', 'attempt-1'); await mkdir(raw, { recursive: true });
  const row = { event: 'rejected', method: 'tools/call', tool: 'click', request_id: 7, gateway_request_id: 'request-7',
    received: clock(0), at: clock(60_000), rejected: clock(60_000), dispatched: null,
    code: 'GATEWAY_QUEUE_TIMEOUT', queue_wait_ms: 60_000, execution_outcome: 'not_executed' };
  await lines(path.join(raw, 'gateway-requests.jsonl'), [row]);
  const proof = await queueTimingEvidence(raw); assert.equal(proof.valid, true); assert.equal(proof.can_explain_missing_export, true);
  assert.equal(proof.frames.length, 0); assert.ok(proof.gateway.sha256);
  await lines(path.join(raw, 'gateway-requests.jsonl'), [{ ...row, dispatched: clock(1) }]);
  assert.equal((await queueTimingEvidence(raw)).valid, false);
});

test('paired pilot retains a queue-only failed candidate and executes a fresh full twenty at lower concurrency', async t => {
  const root = await temporary(t), spec = await json(path.join(BENCH_ROOT, 'config/browser-manual-v2-canary.json'));
  const allTasks = spec.task_ids.map(task_id => ({ task_id, website: 'https://fixture.test/', confirmed_task: 'Click the fixture button', reference_length: 1 }));
  const phases = [], drives = [];
  const collect = async options => {
    phases.push(options);
    const denied = options.runDir.includes('concurrency-10/concurrent');
    return collectManual({ ...options, dependencies: collectorDependencies(o => denied && o.task.task_id === allTasks[0].task_id ? 'denied-bootstrap' : 'physical', drives) });
  };
  const receipt = await pairedPilot({ outputDir: root, allTasks, source: { sha256: 'unit-dataset' },
    serverCommand: ['fake', '/fixture/build/index.js', 'stdio'], extensionDir: '/fixture/extension',
    localReceipt: { ok: true, passed_levels: [1, 2, 5, 10] }, dependencies: { collect, fingerprint: async () => ({ unit: 'frozen' }) } });
  assert.equal(receipt.selected_concurrency, 5); assert.equal(drives.length, 40);
  for (const level of [10, 5]) assert.equal(phases.filter(p => p.runDir.includes(`concurrency-${level}/`)).reduce((sum, p) => sum + p.tasks.length, 0), 20);
  const failed = await json(path.join(root, 'concurrency-10/comparison.json'));
  assert.equal(failed.decision.correctness_ok, true); assert.equal(failed.decision.physical_evidence_ok, false); assert.equal(failed.decision.timing_ok, false);
  const unavailable = failed.concurrent.per_task.filter(row => row.timing_unavailable);
  assert.equal(unavailable.length, 1); assert.equal(unavailable[0].valid_export, false);
  const passed = await json(receipt.comparison); assert.equal(passed.serial.per_task.length + passed.concurrent.per_task.length, 20);
  assert.equal(passed.decision.physical_evidence_ok, true);
  assert.equal((await assertResumeSafe([root])).length, 6);
});

test('full collection still pauses on queue expiry, and independent missing/corrupt pixels never become pilot timing rows', async t => {
  const root = await temporary(t), tasks = [0, 1].map(i => ({ task_id: `task_${i}`, website: 'https://fixture.test/', confirmed_task: 'Click fixture', reference_length: 1 }));
  for (const mode of ['denied-bootstrap', 'missing-action', 'corrupt-action']) {
    const state = [], pilot = mode !== 'denied-bootstrap';
    const result = await collectManual({ runDir: path.join(root, mode), tasks, concurrency: 1,
      serverCommand: ['fake', '/fixture/build/index.js', 'stdio'], source: {},
      gateReceipt: pilot ? { kind: 'pilot' } : null, pilotQueueTiming: pilot,
      dependencies: collectorDependencies(() => mode, state) });
    assert.equal(result.manifest.state, 'paused_health', mode); assert.equal(result.manifest.collection_complete, false);
    assert.equal(state.length, 1); assert.equal(result.manifest.outcomes[0].pilot_timing_unavailable, undefined);
    if (!pilot) {
      result.manifest.state = 'running';
      await writeFile(path.join(root, mode, 'manifest.json'), JSON.stringify(result.manifest));
      await assert.rejects(collectManual({ runDir: path.join(root, mode), tasks, concurrency: 1,
        serverCommand: ['fake', '/fixture/build/index.js', 'stdio'], source: {}, resume: true,
        dependencies: collectorDependencies(() => mode, state) }), /prior queue expiry/);
      assert.equal(state.length, 1);
    }
  }
  await assert.rejects(collectManual({ runDir: path.join(root, 'forbidden'), tasks, concurrency: 1, pilotQueueTiming: true }), /restricted to paired pilot/);
});

test('pilot metrics use same-call gateway receive to emission and separately measure each queue', async t => {
  const root = await temporary(t), raw = path.join(root, 'raw/task/attempt-1');
  const task = { task_id: 'task', website: 'https://fixture.test/' }, { final } = await rawEvidence(raw, task);
  await lines(path.join(raw, 'gateway-requests.jsonl'), [
    { event: 'received', method: 'initialize', request_id: 1, gateway_request_id: 'initialize', at: clock(0), received: clock(0) },
    { event: 'finished', method: 'initialize', request_id: 1, gateway_request_id: 'initialize', at: clock(100_000), finished: clock(100_000), received: clock(0) },
    { event: 'received', method: 'tools/call', tool: 'click', request_id: 2, gateway_request_id: 'click', at: clock(0), received: clock(0) },
    { event: 'dispatched', method: 'tools/call', tool: 'click', request_id: 2, gateway_request_id: 'click', at: clock(35_000), received: clock(0), dispatched: clock(35_000), queue_wait_ms: 35_000 },
    { event: 'emitted', method: 'tools/call', tool: 'click', request_id: 2, gateway_request_id: 'click', at: clock(40_000), received: clock(0), dispatched: clock(35_000), finished: clock(39_000), emitted: clock(40_000), queue_wait_ms: 35_000 },
  ]);
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ attempts: [{ task_id: 'task', index: 1, state: 'finished', raw_dir: raw, final }],
    outcomes: [{ task_id: 'task', selected_attempt: 1, exported: true }] }));
  const metrics = await operationMetrics([root]);
  assert.equal(metrics.gateway_requests, 1); assert.equal(metrics.p95_gateway_queue_ms, 35_000);
  assert.equal(metrics.p95_browser_queue_ms, 1000); assert.equal(metrics.p95_queue_ms, 35_000);
  assert.equal(metrics.p95_tool_roundtrip_ms, 40_000); assert.equal(metrics.p95_lease_service_ms, 100);
});
