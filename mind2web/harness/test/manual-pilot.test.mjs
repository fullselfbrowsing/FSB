import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat, realpath, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fixedCanary, percentile, pairedPilot, concurrencyDecision, operationMetrics } from '../manual-pilot.mjs';
import { BENCH_ROOT } from '../proc.mjs';
import { cachePaths, loadTasks } from '../dataset.mjs';
import { judgeMatrix } from '../judge-jobs.mjs';
import { assertResumeSafe, localGateReceipt, validateAcceptedPilot, waitForModel, runRepairBenchmark, resolveExecutable } from '../repair-benchmark.mjs';
import { MODEL, EFFORT } from '../model-family.mjs';

const json = file => readFile(file, 'utf8').then(JSON.parse);
const save = async (file, value) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value) + '\n'); };
const sources = { fingerprints: { fixture: 'immutable-source-runtime-extension' },
  toolchain: { claude: { path: '/fixture/toolchain/frozen-claude', bytes: 1, sha256: 'f'.repeat(64) } } };
const local = { ok: true, passed_levels: [1, 2, 5, 10], receipt_path: '/fixture/local-receipt.json' };
const manifestSafe = { attempts: [], outcomes: [], active_task_ids: [], state: 'waiting_for_model' };

async function temporary(t, label) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), label)));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function canaryTasks() {
  const spec = await json(path.join(BENCH_ROOT, 'config/browser-manual-v2-canary.json'));
  return spec.task_ids.map((task_id, index) => ({ task_id, confirmed_task: `Unit goal ${index}`, website: `https://site-${index}.test/`, reference_length: 3, level: index < 3 ? 'easy' : 'medium' }));
}

test('toolchain resolution uses the actual executable on child PATH and resolves its binary identity without invoking it', async t => {
  const root = await temporary(t, 'pipeline-toolchain-unit-');
  const first = path.join(root, 'first'), second = path.join(root, 'second'); await mkdir(first); await mkdir(second);
  await writeFile(path.join(first, 'codex'), 'Nonexecutable unit candidate'); await chmod(path.join(first, 'codex'), 0o644);
  const binary = path.join(root, 'pinned-codex'); await writeFile(binary, 'Synthetic executable; never run.'); await chmod(binary, 0o755);
  await symlink(binary, path.join(second, 'codex'));
  assert.equal(await resolveExecutable('codex', [first, second].join(path.delimiter)), binary);
  await assert.rejects(resolveExecutable('codex', first), /not available/);
});
async function pilotFixture(t, { target = 10, fault = false, publicRelease = false } = {}) {
  const outputDir = await temporary(t, 'manual-pilot-unit-'), calls = [];
  const allTasks = await canaryTasks();
  const collect = async options => {
    calls.push(options);
    const candidate = Number(/concurrency-(\d+)/.exec(options.runDir)[1]);
    const isConcurrent = path.basename(options.runDir) === 'concurrent';
    const queue = isConcurrent && candidate > target ? 31_000 : 1000;
    const attempts = [], outcomes = [];
    const phase = { 'serial-a': 0, concurrent: 1, 'serial-b': 2 }[path.basename(options.runDir)];
    const phaseStart = Date.UTC(2026, 9, 18, 10) + phase * 100_000;
    for (const [index, task] of options.tasks.entries()) {
      const raw = path.join(options.runDir, 'raw', task.task_id, 'attempt-1');
      await mkdir(raw, { recursive: true });
      await writeFile(path.join(raw, 'steps.jsonl'), JSON.stringify({ tool: 'click', kind: 'mutation',
        started_at: '2026-10-18T10:00:00.000Z', ended_at: '2026-10-18T10:00:01.000Z',
        timing: { lease_requested: { monotonic_ms: 0 }, lease_acquired: { monotonic_ms: queue }, lease_released: { monotonic_ms: queue + 100 } } }) + '\n');
      const final = { outcome: 'timeout', cleanup_ok: !fault, actor_duration_ms: 1000, queue_expiries: 0, final_answer: 'Synthetic unit data, no browser/model execution' };
      await save(path.join(raw, 'final.json'), final);
      attempts.push({ task_id: task.task_id, index: 1, state: 'finished', raw_dir: raw, final,
        started_at: new Date(phaseStart + index * 1000).toISOString(), ended_at: new Date(phaseStart + index * 1000 + 500).toISOString() });
      outcomes.push({ task_id: task.task_id, selected_attempt: 1, raw_dir: raw, outcome: final.outcome, exported: true, validation: { ok: true } });
    }
    const config = { profile: publicRelease ? 'browser-manual-public-v1' : 'browser-manual-v2', model: MODEL, effort: EFFORT, timeout_seconds: 1200, max_actions: 120,
      ...(publicRelease ? { public_release: true, public_pins: options.publicPins } : {}),
      execution_concurrency: options.concurrency, task_ids: options.tasks.map(task => task.task_id), fingerprints: sources.fingerprints,
      source: options.source, server_command: options.serverCommand, extension_dir: options.extensionDir, gate_receipt: options.gateReceipt, pilot_queue_timing: options.pilotQueueTiming };
    const manifest = { config, attempts, outcomes, collection_complete: true };
    await save(path.join(options.runDir, 'manifest.json'), manifest);
    return { manifest };
  };
  const options = { outputDir, allTasks, source: { sha256: 'unit-dataset' }, serverCommand: ['fake', '/fixture/build/index.js', 'stdio'],
    extensionDir: '/fixture/extension', localReceipt: local, resume: true,
    ...(publicRelease ? { publicRelease: true, publicPins: { fixture: 'unmodified-public-release-pins' } } : {}),
    dependencies: { collect, fingerprint: async () => sources.fingerprints } };
  return { outputDir, calls, options };
}

test('fixed canary preserves the ten metadata-selected IDs and a disjoint five/five order', async () => {
  const tasks = await canaryTasks();
  const chosen = await fixedCanary([...tasks].reverse());
  assert.deepEqual(chosen.tasks.map(task => task.task_id), tasks.map(task => task.task_id));
  assert.equal(chosen.serialA.length, 5); assert.equal(chosen.serialB.length, 5);
  assert.equal(new Set([...chosen.serialA, ...chosen.serialB].map(task => task.task_id)).size, 10);
  assert.deepEqual((await fixedCanary(tasks)).serialA, chosen.serialA);
  await assert.rejects(fixedCanary(tasks.slice(1)), /Missing pinned canary/);
});

test('paired pilot records twenty counterbalanced task executions before accepting ten workers', async t => {
  const f = await pilotFixture(t);
  const result = await pairedPilot(f.options);
  assert.equal(result.ok, true); assert.equal(result.selected_concurrency, 10);
  assert.deepEqual(f.calls.map(call => [path.basename(call.runDir), call.concurrency, call.tasks.length]),
    [['serial-a', 1, 5], ['concurrent', 10, 10], ['serial-b', 1, 5]]);
  const counts = new Map();
  for (const call of f.calls) for (const task of call.tasks) counts.set(task.task_id, (counts.get(task.task_id) ?? 0) + 1);
  assert.deepEqual([...counts.values()], Array(10).fill(2));
  assert.ok(result.artifact_forecast_bytes > 0);
  assert.equal(result.shared_cookies, true); assert.equal(result.human_calibrated, false);
  assert.equal(result.decision.ok, true); assert.match(result.decision.interpretation, /no causal noninferiority/);
});

test('latency degradation reduces concurrency ten to five to two to one with twenty calls per candidate', async t => {
  const f = await pilotFixture(t, { target: 1 });
  const result = await pairedPilot(f.options);
  assert.equal(result.selected_concurrency, 1);
  assert.deepEqual(f.calls.filter(call => path.basename(call.runDir) === 'concurrent').map(call => call.concurrency), [10, 5, 2, 1]);
  for (const candidate of [10, 5, 2, 1]) {
    const phases = f.calls.filter(call => call.runDir.includes(`concurrency-${candidate}/`));
    assert.equal(phases.reduce((count, call) => count + call.tasks.length, 0), 20);
    const saved = await json(path.join(f.outputDir, `concurrency-${candidate}`, 'comparison.json'));
    assert.equal(saved.decision.correctness_ok, true); assert.equal(saved.decision.ok, candidate === 1);
  }
});

test('a correctness or cleanup fault stops the pilot instead of falling back to a smaller pool', async t => {
  const f = await pilotFixture(t, { fault: true });
  const result = await pairedPilot(f.options);
  assert.equal(result.state, 'paused_health'); assert.equal(f.calls.length, 3);
  await assert.rejects(stat(path.join(f.outputDir, 'concurrency-5')), { code: 'ENOENT' });
});

test('pilot refuses changed source fingerprints on resume before collecting another task', async t => {
  const f = await pilotFixture(t); await pairedPilot(f.options);
  f.options.dependencies.fingerprint = async () => ({ fixture: 'changed-runtime' });
  await assert.rejects(pairedPilot(f.options), /Cannot resume changed pilot/);
  assert.equal(f.calls.length, 3);
});

test('resumed acceptance binds the fixed sample and recomputes its saved timing decision', async t => {
  const f = await pilotFixture(t);
  const receipt = await pairedPilot(f.options);
  const options = { outputDir: f.outputDir, localReceipt: local, fingerprints: sources.fingerprints, allTasks: f.options.allTasks,
    source: f.options.source, serverCommand: f.options.serverCommand, extensionDir: f.options.extensionDir, verifyExport: async () => {} };
  const evidence = await validateAcceptedPilot(receipt, options);
  assert.equal(evidence.path, receipt.comparison);
  await assert.rejects(validateAcceptedPilot({ ...receipt, fixed_sample_sha256: 'different-task-set' }, options), /fixed sample/);
  const comparison = await json(receipt.comparison);
  comparison.concurrent.p95_queue_ms = 30_001;
  await save(receipt.comparison, comparison);
  await assert.rejects(validateAcceptedPilot(receipt, options), /actual raw phase observations/);
});

test('public paired pilot binds the public profile and pins throughout all twenty attempts and resume', async t => {
  const f = await pilotFixture(t, { publicRelease: true });
  const receipt = await pairedPilot(f.options);
  assert.equal(receipt.public_release, true); assert.equal(receipt.decision.public_release, true);
  assert.equal(f.calls.length, 3); assert.ok(f.calls.every(call => call.publicRelease === true && call.publicPins === f.options.publicPins));
  const options = { outputDir: f.outputDir, localReceipt: local, fingerprints: sources.fingerprints,
    allTasks: f.options.allTasks, source: f.options.source, serverCommand: f.options.serverCommand,
    extensionDir: f.options.extensionDir, publicRelease: true, publicPins: f.options.publicPins,
    profilePath: path.join(BENCH_ROOT, 'config/browser-manual-public-v1.json'), verifyExport: async ({ profilePath }) => assert.match(profilePath, /public-v1\.json$/) };
  assert.ok(await validateAcceptedPilot(receipt, options));
  await assert.rejects(validateAcceptedPilot(receipt, { ...options, publicPins: { fixture: 'different-public-build' } }), /config\/task/);
  await assert.rejects(validateAcceptedPilot(receipt, { ...options, publicRelease: false }), /config\/task/);
});

test('pilot starts at the highest passing local level and refuses an empty passing set', async t => {
  const f = await pilotFixture(t);
  await assert.rejects(pairedPilot({ ...f.options, localReceipt: { ...local, passed_levels: [] } }), /At least one fully passing/);
  assert.equal(f.calls.length, 0);
  const result = await pairedPilot({ ...f.options, localReceipt: { ...local, passed_levels: [1, 2, 5] } });
  assert.equal(result.selected_concurrency, 5);
  assert.deepEqual(f.calls.map(call => call.concurrency), [1, 5, 1]);
  assert.equal(f.calls.reduce((sum, call) => sum + call.tasks.length, 0), 20);
});

test('operational thresholds use observed timing and do not infer task goals from normal timeout outcomes', () => {
  const good = { faults: [], per_task: [{ valid_export: true, outcome: 'timeout' }], queue_expiries: 0,
    p95_queue_ms: 30_000, p95_tool_roundtrip_ms: 60_000, p95_lease_service_ms: 150 };
  const serial = { ...good, p95_lease_service_ms: 100 };
  assert.equal(concurrencyDecision({ concurrent: good, serial }).ok, true);
  for (const patch of [{ p95_queue_ms: 30_001 }, { p95_tool_roundtrip_ms: 60_001 }, { p95_lease_service_ms: 151 }, { queue_expiries: 1 }]) {
    assert.equal(concurrencyDecision({ concurrent: { ...good, ...patch }, serial }).ok, false);
  }
  assert.equal(percentile([100, 1, 50, null, NaN], .95), 100);
});

test('local receipt requires all levels tested and real physical passes rather than an ok flag alone', () => {
  const summary = { ok: true, correctness_ok: true, cleanup_ok: true, concurrency: [1, 2, 5, 10].map(workers => ({ workers, ok: true, physical_tests_complete: true, queue_expiries: 0, physical_frames: workers })),
    hard_queue_ms: 60_000, queue_expiries: 0, sessions: [{ cleanup_ok: true, queue_expiries: 0, artifacts: { physical_frames: 2 } }] };
  const options = { summaryEvidence: { path: '/fixture/summary.json', sha256: 'x', bytes: 123 }, fingerprints: sources.fingerprints, receiptPath: '/fixture/receipt.json' };
  assert.deepEqual(localGateReceipt(summary, options).passed_levels, [1, 2, 5, 10]);
  for (const changed of [{ cleanup_ok: false }, { concurrency: summary.concurrency.slice(1) }, { sessions: [{ cleanup_ok: true }] }]) {
    assert.throws(() => localGateReceipt({ ...summary, ...changed }, options), /all four tested levels/);
  }
  const subset = { ...summary, concurrency: summary.concurrency.map(row => row.workers === 10
    ? { ...row, ok: false, failure_kind: 'timing', p95_queue_ms: 31_000 } : row) };
  const receipt = localGateReceipt(subset, options);
  assert.deepEqual(receipt.tested_levels, [1, 2, 5, 10]); assert.deepEqual(receipt.passed_levels, [1, 2, 5]);
  assert.equal(receipt.highest_passing_level, 5);
  assert.throws(() => localGateReceipt({ ...subset, concurrency: subset.concurrency.map(row => row.workers === 5
    ? { ...row, physical_tests_complete: false } : row) }, options), /all four tested levels/);
  assert.throws(() => localGateReceipt({ ...subset, concurrency: subset.concurrency.map(row => row.workers === 10
    ? { ...row, failure_kind: 'correctness' } : row) }, options), /all four tested levels/);
});

test('durable circuit waits at most sixty seconds and spends no readiness probe', async () => {
  let calls = 0; const sleeps = [], checkpoints = [];
  const result = await waitForModel({ status: async () => ++calls === 1
    ? { state: 'open', ready: false, generation: 3, not_before_epoch: Date.now() / 1000 + 7200, reason: { kind: 'quota' } }
    : { state: 'open', ready: true, generation: 3, not_before_epoch: 1 },
  sleep: async milliseconds => sleeps.push(milliseconds), checkpoint: async value => checkpoints.push(value) });
  assert.equal(result.ready, true); assert.deepEqual(sleeps, [60_000]); assert.equal(calls, 2);
  assert.ok(checkpoints.every(row => row.readiness_probe.includes('next actual pending task')));
});

test('blocked authentication and no-wait quota return without model probes or unbounded sleeping', async () => {
  for (const state of ['blocked', 'open']) {
    let reads = 0, sleeps = 0;
    const result = await waitForModel({ waitResources: state === 'blocked', status: async () => { reads++; return { state, ready: false, generation: 2 }; }, sleep: async () => sleeps++ });
    assert.equal(result.ready, false); assert.equal(reads, 1); assert.equal(sleeps, 0);
  }
});

test('a live half-open task probe waits a minute rather than polling its expired backoff every second', async () => {
  let reads = 0; const sleeps = [];
  const result = await waitForModel({ status: async () => ++reads === 1
    ? { state: 'half_open', ready: false, generation: 4, not_before_epoch: 1 }
    : { state: 'closed', ready: true, generation: 5 }, sleep: async milliseconds => sleeps.push(milliseconds) });
  assert.equal(result.ready, true); assert.deepEqual(sleeps, [60_000]);
});

test('resume safety checks every historical attempt, active context and cleanup state', async t => {
  const root = await temporary(t, 'pipeline-resume-unit-');
  const file = path.join(root, 'candidate/phase/manifest.json');
  for (const patch of [
    { active_task_ids: ['task'] },
    { attempts: [{ state: 'running' }] },
    { attempts: [{ state: 'finished', final: { cleanup_ok: false } }] },
    { attempts: [{ state: 'finished', final: { cleanup_ok: true, uncertain_upstream: true } }] },
    { state: 'paused_health' },
  ]) {
    await save(file, { ...manifestSafe, ...patch });
    await assert.rejects(assertResumeSafe([root]), /resume refused|health fault/);
  }
  await save(file, { ...manifestSafe, attempts: [{ state: 'finished', final: { cleanup_ok: true } }] });
  assert.equal((await assertResumeSafe([root])).length, 1);
  await save(path.join(path.dirname(file), '.lock'), { pid: process.pid });
  await assert.rejects(assertResumeSafe([root]), /another controller/);
});

async function pipelineFixture(t, { publicRelease = false } = {}) {
  let dataset;
  try { dataset = await loadTasks({ datasetPath: cachePaths().json }); }
  catch (error) { if (error.code === 'ENOENT') { t.skip('Pinned gated dataset is not cached; no network or model calls in tests'); return null; } throw error; }
  const root = await temporary(t, 'repair-pipeline-unit-');
  const context = path.join(root, 'context'), results = path.join(root, 'results'), extension = path.join(root, 'extension');
  await mkdir(context); await mkdir(results); await mkdir(extension);
  await save(path.join(extension, 'manifest.json'), { manifest_version: 3, name: 'Synthetic test extension', version: '0.0.0' });
  const calls = [], sourceState = { value: sources };
  const outputDir = path.join(context, 'pipeline');
  const syntheticPilot = await pilotFixture(t, { target: 5, publicRelease });
  const dependencies = { contextRoot: context, resultsRoot: results, historicalRunDir: path.join(root, 'historical'),
    excludedTaskIds: [], loadTasks: async () => dataset, captureSources: async () => sourceState.value,
    verifyPilotExport: async ({ row, attempt }) => { assert.equal(row.raw_dir, attempt.raw_dir); },
    verifyLocalEvidence: async () => ({ ok: true }),
    verifyCompleted: async () => ({ ok: true }),
    imageContract: async options => {
      calls.push('image-contract');
      assert.equal(path.basename(options.outputDir), 'claude-image-contract');
      assert.equal(options.command, sources.toolchain.claude.path, 'The contract runs the frozen pinned CLI');
      assert.equal(options.model, MODEL); assert.equal(options.effort, EFFORT);
      const receipt = { ok: true, synthetic_unit_test: true, benchmark_result: false };
      await save(path.join(options.outputDir, 'receipt.json'), receipt);
      return receipt;
    },
    circuit: async action => { calls.push(`circuit:${action}`); return { ready: true, state: 'closed', generation: 0 }; },
    bundle: async options => {
      assert.equal((await json(path.join(outputDir, 'frozen-config.json'))).tool_count, publicRelease ? 44 : 46);
      const fresh = options.outputDir.endsWith('/fresh-blinded-human-review');
      if (!calls.includes('bundle')) assert.ok(!calls.includes('pilot'));
      if (fresh) { assert.equal(options.seed, 'fsb-fresh-manual-v2-review-20261018'); assert.ok(calls.includes('collect')); }
      calls.push(fresh ? 'fresh-bundle' : 'bundle');
      return { output_dir: options.outputDir, count: 60, human_calibrated: false, selection_sha256: 'a'.repeat(64), provenance_sha256: 'b'.repeat(64) };
    },
    reviewBundle: async options => { calls.push('pilot-review-bundle'); return { output_dir: options.outputDir, task_count: 10, image_count: 20 }; },
    verifyReview: async directory => ({ complete: true, receipt: { path: path.join(directory, 'completion.json'), sha256: 'c'.repeat(64), bytes: 123 },
      public_manifest: { sha256: 'd'.repeat(64) }, notes: { sha256: 'e'.repeat(64) },
      descriptive_summary: { human_calibrated: false, affects_operational_gate: false, visibly_met: 0 } }),
    localGate: async options => {
      calls.push('local');
      const summary = { ok: true, correctness_ok: true, cleanup_ok: true, concurrency: [1, 2, 5, 10].map(workers => ({ workers, ok: true, physical_tests_complete: true, queue_expiries: 0, physical_frames: workers })),
        hard_queue_ms: 60_000, queue_expiries: 0, sessions: [{ cleanup_ok: true, queue_expiries: 0, artifacts: { physical_frames: 2 } }] };
      await save(path.join(options.outputDir, 'summary.json'), summary); return summary;
    },
    pilot: async options => {
      calls.push('pilot');
      return pairedPilot({ ...options, dependencies: { fingerprint: async () => sources.fingerprints, collect: syntheticPilot.options.dependencies.collect } });
    },
    disk: async () => { calls.push('disk'); return { free_bytes: 1e12, required_bytes: 5e9 }; },
    collect: async options => {
      calls.push('collect'); assert.equal(options.tasks.length, 300); assert.equal(options.concurrency, 5);
      const config = { version: 3, profile: publicRelease ? 'browser-manual-public-v1' : 'browser-manual-v2', model: options.model, effort: options.effort, browser: 'existing', shared_cookies: true,
        ...(publicRelease ? { public_release: true, public_pins: options.publicPins, profile_tool_count: 44,
          profile_path: path.join(BENCH_ROOT, 'config/browser-manual-public-v1.json') } : {}),
        timeout_seconds: 1200, max_actions: 120, execution_concurrency: options.concurrency, judge_protocol: 'scorefield-v2',
        circuit_state: options.circuitState, server_command: options.serverCommand, extension_dir: options.extensionDir,
        task_ids: options.tasks.map(task => task.task_id), source: options.source, gate_receipt: options.gateReceipt, fingerprints: sources.fingerprints };
      const manifest = { ...manifestSafe, task_ids: options.tasks.map(task => task.task_id), collection_complete: true, state: 'collected',
        outcomes: options.tasks.map(task => ({ task_id: task.task_id, outcome: 'timeout' })), config };
      await save(path.join(options.runDir, 'manifest.json'), manifest); return { manifest };
    },
    judges: async options => { calls.push('judges'); assert.equal(options.passes, 3); assert.equal(options.model, MODEL); assert.equal(options.effort, EFFORT);
      const result = { complete: true, jobs: judgeMatrix().map(job => ({ ...job, status: 'complete' })) };
      await save(path.join(options.runDir, 'judge-jobs.json'), result); return result; },
    report: async (runDir, manifest, options) => {
      calls.push('report'); assert.equal(options.finalize, true); assert.equal(manifest.outcomes.length, 300);
      await save(path.join(runDir, 'FINAL-AUDIT.json'), { ok: true, synthetic_unit_test: true,
        manifest_sha256: createHash('sha256').update(await readFile(path.join(runDir, 'manifest.json'))).digest('hex') });
      await writeFile(path.join(runDir, 'REPORT.md'), 'Synthetic unit report; no browser or model was called.\n');
      return { finalized: true, expected: 300, jobs_complete: 6 };
    },
  };
  const options = { extensionDir: extension, outputDir, fullRunId: 'unit-full-run',
    ...(publicRelease ? { publicRelease: true, publicPins: syntheticPilot.options.publicPins } : {}),
    serverCommand: [process.execPath, path.join(root, 'client/build/index.js'), 'stdio'],
    circuitState: path.join(root, 'circuit.json'), log: () => {}, dependencies };
  return { root, outputDir, calls, sourceState, dependencies, options };
}

test('pipeline freezes first, prepares a separate holdout, gates, collects300, then completes only six Claude jobs', async t => {
  const f = await pipelineFixture(t); if (!f) return;
  const result = await runRepairBenchmark(f.options);
  assert.equal(result.state, 'complete');
  assert.deepEqual(f.calls.filter(call => !call.startsWith('circuit:')), ['bundle', 'image-contract', 'local', 'pilot', 'pilot-review-bundle', 'disk', 'collect', 'fresh-bundle', 'judges', 'report']);
  const config = await json(path.join(f.outputDir, 'frozen-config.json'));
  assert.equal(config.timeout_seconds, 1200); assert.equal(config.max_actions, 120); assert.equal(config.browser, 'existing');
  assert.deepEqual(config.judge_jobs, judgeMatrix().map(job => job.id));
  assert.equal(config.historical_review_dir, path.join(f.outputDir, 'blinded-human-review'));
  assert.equal(config.fresh_review_dir, path.join(f.outputDir, 'fresh-blinded-human-review'));
  assert.equal((await json(path.join(f.outputDir, 'local-gate-receipt.json'))).passed_levels.length, 4);
  assert.equal(config.image_contract, 'claude-mcp-image-v1');
  assert.equal(config.model, MODEL); assert.equal(config.effort, EFFORT);
  await assert.rejects(stat(path.join(f.outputDir, '.lock')), { code: 'ENOENT' });
  const count = f.calls.length;
  const again = await runRepairBenchmark({ ...f.options, resume: true });
  assert.equal(again.already_complete, true); assert.equal(f.calls.length, count);
});

test('public pipeline uses44 tools, explicit public gates and pins through collection and completed resume', async t => {
  const f = await pipelineFixture(t, { publicRelease: true }); if (!f) return;
  for (const name of ['imageContract', 'localGate', 'pilot', 'collect']) {
    const original = f.dependencies[name];
    f.dependencies[name] = async options => {
      if (name === 'localGate') assert.match(options.profilePath, /browser-manual-public-v1\.json$/);
      else assert.equal(options.publicRelease, true);
      assert.deepEqual(options.publicPins, f.options.publicPins);
      return original(options);
    };
  }
  const result = await runRepairBenchmark(f.options);
  assert.equal(result.state, 'complete');
  const config = await json(path.join(f.outputDir, 'frozen-config.json'));
  assert.equal(config.profile, 'browser-manual-public-v1'); assert.equal(config.tool_count, 44);
  assert.equal(config.public_release, true); assert.deepEqual(config.public_pins, f.options.publicPins);
  assert.equal((await runRepairBenchmark({ ...f.options, resume: true })).already_complete, true);
});

test('completed resume verifies the original collection and judge checkpoint bytes before returning success', async t => {
  const f = await pipelineFixture(t); if (!f) return;
  const result = await runRepairBenchmark(f.options), count = f.calls.length;
  const manifestPath = path.join(result.full_run_dir, 'manifest.json');
  const manifest = await json(manifestPath); manifest.outcomes[0].outcome = 'tampered'; await save(manifestPath, manifest);
  await assert.rejects(runRepairBenchmark({ ...f.options, resume: true }), /Saved pipeline evidence changed/);
  assert.equal(f.calls.length, count);
});

test('a failed large-image CLI contract stops before any live browser gate or actor', async t => {
  const f = await pipelineFixture(t); if (!f) return;
  f.dependencies.imageContract = async () => { throw new Error('Synthetic PNG hash changed before model delivery'); };
  await assert.rejects(runRepairBenchmark(f.options), /PNG hash changed/);
  assert.equal(f.calls.includes('local'), false); assert.equal(f.calls.includes('pilot'), false);
  assert.equal((await json(path.join(f.outputDir, 'pipeline.json'))).state, 'paused_health');
});

test('resume refuses a changed image-delivery contract receipt before more actor calls', async t => {
  const f = await pipelineFixture(t); if (!f) return;
  f.dependencies.pilot = async () => ({ ok: false, state: 'waiting_for_model' });
  const paused = await runRepairBenchmark({ ...f.options, waitResources: false });
  assert.equal(paused.state, 'waiting_for_model');
  await save(path.join(f.outputDir, 'claude-image-contract/receipt.json'), { ok: true, tampered: true });
  await assert.rejects(runRepairBenchmark({ ...f.options, resume: true, waitResources: false }), /Saved pipeline evidence changed/);
  assert.equal(f.calls.filter(call => call === 'image-contract').length, 1);
});

test('pipeline resource pause resumes the pending pilot with the same gate and no readiness model call', async t => {
  const f = await pipelineFixture(t); if (!f) return;
  const actualPilot = f.dependencies.pilot; let pending = true;
  f.dependencies.pilot = async options => {
    if (pending) { pending = false; f.calls.push('pilot-pending'); return { ok: false, state: 'waiting_for_model' }; }
    return actualPilot(options);
  };
  const paused = await runRepairBenchmark({ ...f.options, waitResources: false });
  assert.equal(paused.state, 'waiting_for_model'); assert.equal(paused.phase, 'paired_pilot');
  assert.equal(f.calls.filter(call => call === 'local').length, 1); assert.equal(f.calls.includes('collect'), false);
  const resumed = await runRepairBenchmark({ ...f.options, resume: true });
  assert.equal(resumed.state, 'complete'); assert.equal(f.calls.filter(call => call === 'local').length, 1);
  assert.equal(f.calls.filter(call => call === 'pilot').length, 1);
});

test('pipeline pauses for twenty-image automated descriptive notes before dispatching the fresh collection', async t => {
  const f = await pipelineFixture(t); if (!f) return;
  let reviewed = false; const verify = f.dependencies.verifyReview;
  f.dependencies.verifyReview = async directory => reviewed ? verify(directory) : { complete: false };
  const paused = await runRepairBenchmark(f.options);
  assert.equal(paused.state, 'paused_review'); assert.equal(paused.phase, 'pilot_review');
  assert.equal(paused.pilot_review_bundle.image_count, 20); assert.equal(f.calls.includes('collect'), false);
  await assert.rejects(stat(paused.full_run_dir), { code: 'ENOENT' });
  const accepted = await readFile(path.join(f.outputDir, 'pilot/accepted-gate.json'));
  reviewed = true;
  const result = await runRepairBenchmark({ ...f.options, resume: true });
  assert.equal(result.state, 'complete'); assert.equal(result.descriptive_pilot_review.descriptive_summary.visibly_met, 0);
  assert.equal(result.execution_concurrency, 5); assert.equal(f.calls.filter(call => call === 'pilot').length, 1);
  assert.deepEqual(await readFile(path.join(f.outputDir, 'pilot/accepted-gate.json')), accepted);
});

test('pipeline reuses the accepted pilot on a later collection resume without changing its receipt hash', async t => {
  const f = await pipelineFixture(t); if (!f) return;
  const collect = f.dependencies.collect; let first = true;
  f.dependencies.collect = async options => {
    if (!first) return collect(options); first = false; f.calls.push('collect-pending');
    const manifest = { ...manifestSafe, collection_complete: false };
    await save(path.join(options.runDir, 'manifest.json'), manifest); return { manifest };
  };
  const paused = await runRepairBenchmark({ ...f.options, waitResources: false });
  assert.equal(paused.phase, 'full_collection'); assert.equal(paused.state, 'waiting_for_model');
  const receiptBytes = await readFile(path.join(f.outputDir, 'pilot/accepted-gate.json'));
  assert.equal((await runRepairBenchmark({ ...f.options, resume: true })).state, 'complete');
  assert.equal(f.calls.filter(call => call === 'pilot').length, 1);
  assert.deepEqual(await readFile(path.join(f.outputDir, 'pilot/accepted-gate.json')), receiptBytes);
});

test('a judging resource resume preserves the completed collection bytes and fresh review provenance', async t => {
  const f = await pipelineFixture(t); if (!f) return;
  const judges = f.dependencies.judges; let pending = true;
  f.dependencies.judges = async options => {
    if (pending) { pending = false; f.calls.push('judges-pending'); return { complete: false, jobs: judgeMatrix() }; }
    return judges(options);
  };
  const paused = await runRepairBenchmark({ ...f.options, waitResources: false });
  assert.equal(paused.phase, 'judging'); assert.equal(paused.state, 'waiting_for_model');
  const manifestPath = path.join(paused.full_run_dir, 'manifest.json'), manifestBytes = await readFile(manifestPath);
  assert.equal((await runRepairBenchmark({ ...f.options, resume: true })).state, 'complete');
  assert.equal(f.calls.filter(call => call === 'collect').length, 1);
  assert.equal(f.calls.filter(call => call === 'disk').length, 1, 'The full collection forecast is not charged again after all300 are stored');
  assert.deepEqual(await readFile(manifestPath), manifestBytes);
});

test('a disk shortage checkpoints a resumable resource wait and preserves all accepted gate bytes', async t => {
  const f = await pipelineFixture(t); if (!f) return;
  const disk = f.dependencies.disk; let full = true;
  f.dependencies.disk = async (...args) => {
    if (full) throw Object.assign(new Error('Synthetic disk gate: free bytes below unchanged forecast and reserve'), { code: 'DISK_BUDGET' });
    return disk(...args);
  };
  const paused = await runRepairBenchmark({ ...f.options, waitResources: false });
  assert.equal(paused.state, 'waiting_for_disk'); assert.equal(f.calls.includes('collect'), false);
  const accepted = await readFile(path.join(f.outputDir, 'pilot/accepted-gate.json'));
  full = false;
  assert.equal((await runRepairBenchmark({ ...f.options, resume: true })).state, 'complete');
  assert.equal(f.calls.filter(call => call === 'pilot').length, 1);
  assert.deepEqual(await readFile(path.join(f.outputDir, 'pilot/accepted-gate.json')), accepted);
});

test('default resource waiting checks disk once per minute without starting an actor until it passes', async t => {
  const f = await pipelineFixture(t); if (!f) return;
  const disk = f.dependencies.disk; let attempts = 0; const sleeps = [];
  f.dependencies.disk = async (...args) => {
    if (++attempts === 1) throw Object.assign(new Error('Synthetic disk gate'), { code: 'DISK_BUDGET' });
    return disk(...args);
  };
  f.dependencies.sleep = async milliseconds => { sleeps.push(milliseconds); assert.equal(f.calls.includes('collect'), false); };
  assert.equal((await runRepairBenchmark(f.options)).state, 'complete');
  assert.deepEqual(sleeps, [60_000]); assert.equal(attempts, 2);
});

test('source drift after a model phase stops judging and checkpoints a health fault', async t => {
  const f = await pipelineFixture(t); if (!f) return;
  const collect = f.dependencies.collect;
  f.dependencies.collect = async options => { const result = await collect(options); f.sourceState.value = { fingerprints: { fixture: 'changed-runtime' } }; return result; };
  await assert.rejects(runRepairBenchmark(f.options), /frozen source\/runtime\/extension bytes changed/);
  assert.equal(f.calls.includes('judges'), false); assert.equal(f.calls.includes('report'), false);
  assert.equal((await json(path.join(f.outputDir, 'pipeline.json'))).state, 'paused_health');
  await assert.rejects(stat(path.join(f.outputDir, '.lock')), { code: 'ENOENT' });
});

test('pipeline failure and resume do not silently replace partial fixture evidence', async t => {
  const f = await pipelineFixture(t); if (!f) return;
  f.dependencies.localGate = async options => { await save(path.join(options.outputDir, 'manifest.json'), { partial: true }); throw new Error('Synthetic fixture capture failure'); };
  await assert.rejects(runRepairBenchmark(f.options), /fixture capture failure/);
  assert.equal(f.calls.includes('pilot'), false);
  assert.equal((await json(path.join(f.outputDir, 'local-gate/manifest.json'))).partial, true);
  await assert.rejects(runRepairBenchmark({ ...f.options, resume: true }), /prior pipeline health fault/);
});

test('pipeline graceful drain starts no pilot and abort signal remains unset', async t => {
  const f = await pipelineFixture(t); if (!f) return;
  const controller = new AbortController(); let drain = false;
  const gate = f.dependencies.localGate;
  f.dependencies.localGate = async options => { const summary = await gate(options); drain = true; return summary; };
  const result = await runRepairBenchmark({ ...f.options, signal: controller.signal, shouldStop: () => drain });
  assert.equal(result.state, 'paused_drained'); assert.equal(result.phase, 'paired_pilot');
  assert.equal(controller.signal.aborted, false); assert.equal(f.calls.includes('pilot'), false);
});
