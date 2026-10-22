import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { BENCH_ROOT, REPO_ROOT } from '../proc.mjs';
import { atomicJson, acquireRunLock } from '../run-state.mjs';
import { encodeSolidPng } from '../png.mjs';
import { writeV2 } from '../v2-writer.mjs';
import { fixedCanary } from '../manual-pilot.mjs';
import { writePilotCheckpointBundle, recordPilotReview } from '../manual-pilot-review.mjs';
import { writeManualReport, verifyFinalizedManualReport, verifyReviewEvidence, trajectoryFingerprint,
  writeBlindedReviewBundle, verifyBlindedReviewBundle } from '../manual-report.mjs';
import { MODEL, EFFORT, JUDGE_ENGINE, JUDGE_ENGINE_CLASS } from '../model-family.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value && typeof value === 'object' ? Array.isArray(value)
  ? value.map(x => JSON.parse(canonical(x))) : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);
const jobs = ['official', 'strict'].flatMap(variant => [1, 2, 3].map(pass => ({ variant, pass, id: `${JUDGE_ENGINE}-${variant}-pass${pass}` })));
const firstJob = jobs[0].id;
// The judge runner fingerprints these shared configuration files beside its Python sources.
const EVALUATOR_CONFIG = ['codex-tool-isolation.json', 'codex-gpt61sol-browser-policy.json', 'codex-gpt61sol-browser-policy.receipt.json', 'model-family.json'];
const datasetPath = path.join(BENCH_ROOT, 'cache/dataset/eacad896a84dc5b65e29b0b06e4699ab0544d701.json');
const dataset = JSON.parse(await readFile(datasetPath));
const json = file => readFile(file, 'utf8').then(JSON.parse);
async function temporary(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'om2w-report-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function preservation(directory) {
  directory = path.join(directory, 'preservation'); await mkdir(directory);
  const archive = Buffer.from('Isolated source archive fixture');
  const receipt = Buffer.from(JSON.stringify({ archive_sha256: sha(archive) }));
  const index = Buffer.from('{}');
  await writeFile(path.join(directory, 'sources.tar.gz'), archive);
  await writeFile(path.join(directory, 'receipt.json'), receipt);
  await writeFile(path.join(directory, 'historical-protected.sha256.json'), index);
  return { directory, receipt_sha256: sha(receipt), index_sha256: sha(index), archive_sha256: sha(archive) };
}
async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(file));
    else if (entry.isFile() && file.endsWith('.py')) files.push(file);
  }
  return files;
}
async function pilotReviewFixture(directory) {
  const pilot = path.join(directory, 'pilot'), outputDir = path.join(pilot, 'review-bundle'), canary = await fixedCanary(dataset);
  const gate = { ok: true, selected_concurrency: 2, fixed_sample_sha256: canary.spec.task_ids_sha256,
    receipt_path: path.join(pilot, 'accepted-gate.json') };
  await atomicJson(gate.receipt_path, gate);
  for (const [phase, tasks] of [['serial-a', canary.serialA], ['concurrent', canary.tasks], ['serial-b', canary.serialB]]) {
    const root = path.join(pilot, 'concurrency-2', phase), attempts = [], outcomes = [];
    for (const [index, task] of tasks.entries()) {
      const raw = path.join(root, 'raw', task.task_id, 'attempt-1'), shot = path.join(raw, 'frame.png');
      await mkdir(raw, { recursive: true }); const bytes = encodeSolidPng(120, 100, [index * 10, 80, 100]); await writeFile(shot, bytes);
      const receipt = { task_id: task.task_id, attempt_id: 'attempt-1', frame_id: `${phase}-${index}`, capture_id: `capture-${phase}-${index}`,
        tab_id: 100 + index, source_url: task.website, sha256: sha(bytes), byte_length: bytes.length,
        output_width: 120, output_height: 100, screenshot_path: shot };
      await writeFile(path.join(raw, 'steps.jsonl'), JSON.stringify({ seq: 0, kind: 'bootstrap', tool: 'open_tab', args: { url: task.website },
        ok: true, url: task.website, tab_id: receipt.tab_id, screenshot_path: shot, frame_receipt: receipt }) + '\n');
      const final = { outcome: 'complete', final_answer: 'Synthetic test', cleanup_ok: true }; await atomicJson(path.join(raw, 'final.json'), final);
      await writeV2({ task, rawDir: raw, outDir: path.join(root, 'trajectories') });
      attempts.push({ task_id: task.task_id, index: 1, raw_dir: raw, state: 'finished', final });
      outcomes.push({ task_id: task.task_id, selected_attempt: 1, exported: true, outcome: 'complete' });
    }
    await atomicJson(path.join(root, 'manifest.json'), { collection_complete: true, attempts, outcomes });
  }
  const built = await writePilotCheckpointBundle({ pilotOutputDir: pilot, outputDir, allTasks: dataset, gateReceipt: gate });
  const publicData = await json(built.public_manifest.path), notesPath = path.join(directory, 'pilot-notes.jsonl');
  await writeFile(notesPath, publicData.pairs.map(pair => JSON.stringify({ review_id: pair.review_id,
    A: { visible_goal: 'insufficient_visible_evidence', evidence: 'Synthetic color fixture shows no readable goal state.' },
    B: { visible_goal: 'insufficient_visible_evidence', evidence: 'Synthetic color fixture shows no readable goal state.' }, comparison: 'not_comparable' })).join('\n') + '\n');
  const review = await recordPilotReview({ outputDir, notesPath, reviewer: 'Synthetic test reviewer' });
  return { path: gate.receipt_path, sha256: sha(await readFile(gate.receipt_path)), descriptive_pilot_review: {
    path: review.receipt.path, sha256: review.receipt.sha256, public_manifest_sha256: review.public_manifest.sha256,
    notes_sha256: review.notes.sha256, descriptive_summary: review.descriptive_summary, human_calibrated: false, affects_operational_gate: false } };
}
async function fixture(t, count = 4, exportFirst = false) {
  const directory = await temporary(t), ids = dataset.slice(0, count).map(task => task.task_id);
  const manifest = { profile: 'browser-manual-v2', judge_protocol: 'scorefield-v2', browser: 'existing',
    timeout_seconds: 1200, max_actions: 120, model: MODEL, effort: EFFORT,
    state: 'collected', collection_complete: true, task_ids: ids, active_task_ids: [],
    circuit_state: path.join(directory, 'circuit.json'), fingerprints: { fixture: 'pinned' },
    source: { path: datasetPath, sha256: sha(await readFile(datasetPath)) }, attempts: [], outcomes: [] };
  await atomicJson(path.join(directory, 'task-ids.json'), ids);
  for (const [index, task_id] of ids.entries()) {
    const raw = path.join(directory, 'raw', task_id, 'attempt-1'); await mkdir(raw, { recursive: true });
    const final = { outcome: 'complete', final_answer: 'Fixture answer', cleanup_ok: true,
      duration_ms: 100, actor_duration_ms: 90, cleanup_duration_ms: 10, usage: { input_tokens: 2, output_tokens: 1 } };
    await atomicJson(path.join(raw, 'final.json'), final);
    const steps = [];
    if (exportFirst && index === 0) {
      const screenshot = path.join(raw, 'frame.png'); await writeFile(screenshot, encodeSolidPng(16, 16));
      steps.push({ seq: 0, kind: 'bootstrap', tool: 'open_tab', args: { url: dataset[index].website }, ok: true,
        url: dataset[index].website, screenshot_path: screenshot });
    }
    await writeFile(path.join(raw, 'steps.jsonl'), steps.map(row => JSON.stringify(row)).join('\n') + (steps.length ? '\n' : ''));
    const exported = exportFirst && index === 0;
    manifest.attempts.push({ task_id, index: 1, state: 'finished', raw_dir: raw, final });
    manifest.outcomes.push({ task_id, outcome: 'complete', selected_attempt: 1, raw_dir: raw, exported });
    if (exported) await writeV2({ task: dataset[index], rawDir: raw, outDir: path.join(directory, 'trajectories'),
      allowlistPath: path.join(BENCH_ROOT, 'config/browser-manual-v2.json') });
  }
  const sources = await sourceFiles(path.join(BENCH_ROOT, 'judge/om2w_judge'));
  sources.push(...['upstream/src/methods/webjudge_online_mind2web.py', 'upstream/src/utils.py', 'requirements.lock.txt'].map(file => path.join(BENCH_ROOT, 'judge', file)),
    ...EVALUATOR_CONFIG.map(file => path.join(BENCH_ROOT, 'config', file)));
  const hashes = Object.fromEntries(await Promise.all(sources.map(async file => [path.relative(path.join(BENCH_ROOT, 'judge'), file), sha(await readFile(file))])));
  for (const job of jobs) {
    const output = path.join(directory, 'judge', job.id);
    const config = { format_version: 2, engine: JUDGE_ENGINE_CLASS, model: manifest.model, effort: manifest.effort,
      job_id: job.id, judge_protocol: 'scorefield-v2', rubric: 'upstream-filter-v1', variant: job.variant,
      workers: 10, engine_concurrency: 10, global_cli_limit: 10, task_ids: ids,
      source_sha256: hashes, adapter_sha256: sha(Buffer.from(canonical(hashes))),
      format_attempts: 3, transport_attempts: 2, call_timeout_seconds: 180, circuit_state: manifest.circuit_state,
      inputs: Object.fromEntries(await Promise.all(ids.map(async id => [id, await trajectoryFingerprint(path.join(directory, 'trajectories', id))]))) };
    await atomicJson(path.join(output, 'config.json'), config);
    const results = ids.map((task_id, index) => index === 0 && exportFirst
      ? { task_id, predicted_label: 1, infrastructure_error: false }
      : { task_id, predicted_label: 0, infrastructure_error: false, error_kind: 'missing_trajectory', error: 'FileNotFoundError: saved result unavailable' });
    await writeFile(path.join(output, 'results.jsonl'), results.map(row => JSON.stringify(row)).join('\n') + '\n');
    await writeFile(path.join(output, 'usage.jsonl'), '');
    await atomicJson(path.join(output, 'summary.json'), { expected: count, successes: Number(exportFirst), errors: count - Number(exportFirst),
      pending_judgments: 0, infrastructure_errors: 0, calls: 0, format_errors: 0, transport_errors: 0,
      success_rate: Number(exportFirst) / count, config_sha256: sha(Buffer.from(canonical(config))) });
  }
  await atomicJson(path.join(directory, 'manifest.json'), manifest);
  return { directory, manifest, options: { preservation: await preservation(directory), verifySources: async value => value.fingerprints,
    verifyReviews: async () => ({ verified: true, fixture: true, descriptive_pilot: { path: '/fixture/pilot' },
      historical: { public_index: '/fixture/historical' }, fresh: { public_index: '/fixture/fresh' } }) } };
}

test('checkpoint reports separate task-format zeros, missing inputs and provisional infrastructure', async t => {
  const f = await fixture(t), file = path.join(f.directory, 'judge', firstJob, 'results.jsonl');
  const rows = [
    { task_id: f.manifest.task_ids[0], predicted_label: 1, infrastructure_error: false },
    { task_id: f.manifest.task_ids[1], predicted_label: 0, infrastructure_error: false, error: 'FormatError: Malformed image reply; scorefield-v2: duplicate' },
    { task_id: f.manifest.task_ids[2], predicted_label: 0, infrastructure_error: false, error: 'FileNotFoundError: missing', error_kind: 'missing_trajectory' },
    { task_id: f.manifest.task_ids[3], predicted_label: null, infrastructure_error: true, error: 'CircuitOpen: pending' },
  ];
  await writeFile(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  const summary = await writeManualReport(f.directory, f.manifest, f.options), score = summary.scores[0];
  assert.equal(score.successes, 1); assert.equal(score.success_rate, null); assert.equal(score.pending, 1);
  assert.equal(score.format_error_stages.image, 1); assert.equal(score.missing_trajectory_zeros, 1);
  assert.equal(score.infrastructure_pending, 1); assert.equal(summary.aggregates.official.mean_success_rate, null);
  assert.equal(summary.human_calibrated, false); assert.equal(summary.finalized, false);
});

test('final report verifies all300 selected/input/source/summary/preservation bytes before writing its audit', async t => {
  const f = await fixture(t, 300, true), options = { ...f.options, finalize: true };
  const finalize = async () => { await atomicJson(path.join(f.directory, 'manifest.json'), f.manifest); return writeManualReport(f.directory, f.manifest, options); };
  const summary = await finalize();
  assert.equal(summary.jobs_complete, 6); assert.equal(summary.expected, 300);
  assert.equal(summary.scores[0].success_rate, 1 / 300); assert.equal(summary.scores[0].missing_trajectory_zeros, 299);
  const audit = await json(path.join(f.directory, 'FINAL-AUDIT.json'));
  assert.equal(audit.selected_evidence.length, 1); assert.equal(audit.preservation.historical_bytes_verified, true);
  assert.equal(audit.attempt_evidence.length, 300);
  const receiptBefore = await readFile(path.join(f.directory, 'FINAL-AUDIT.json'));
  assert.equal((await verifyFinalizedManualReport(f.directory, f.manifest, f.options)).ok, true);
  assert.deepEqual(await readFile(path.join(f.directory, 'FINAL-AUDIT.json')), receiptBefore);
  const usagePath = path.join(f.directory, 'judge', firstJob, 'usage.jsonl');
  await writeFile(usagePath, '{"changed":true}\n');
  await assert.rejects(verifyFinalizedManualReport(f.directory, f.manifest, f.options), /Finalized judge evidence changed/);
  await writeFile(usagePath, '');
  const rawSteps = path.join(f.manifest.attempts[0].raw_dir, 'steps.jsonl'), stepBytes = await readFile(rawSteps);
  await writeFile(rawSteps, Buffer.concat([stepBytes, Buffer.from('\n')]));
  await assert.rejects(verifyFinalizedManualReport(f.directory, f.manifest, f.options), /Finalized raw attempt evidence changed/);
  await writeFile(rawSteps, stepBytes);
  const reportBefore = await readFile(path.join(f.directory, 'REPORT.md'));
  assert.equal((await writeManualReport(f.directory, f.manifest, f.options)).finalized, true);
  assert.deepEqual(await readFile(path.join(f.directory, 'REPORT.md')), reportBefore);
  await writeFile(path.join(f.directory, 'REPORT.md'), 'changed');
  await assert.rejects(writeManualReport(f.directory, f.manifest, f.options), /Finalized report output changed/);
  await writeFile(path.join(f.directory, 'REPORT.md'), reportBefore);
  const exported = path.join(f.directory, 'trajectories', f.manifest.task_ids[0], 'result.json');
  const original = await readFile(exported), changed = JSON.parse(original); changed.agent_final_answer = 'Changed';
  changed.action_history.at(-1).action = 'TASK_COMPLETE -> ANSWER: Changed'; await atomicJson(exported, changed);
  await assert.rejects(finalize(), /Graded trajectory fingerprint/);
  assert.equal((await json(path.join(f.directory, 'FINAL-AUDIT.json'))).ok, false);
  await writeFile(exported, original);
  const raw = f.manifest.attempts[0].raw_dir, rawFinal = await readFile(path.join(raw, 'final.json'));
  const newFinal = JSON.parse(rawFinal); newFinal.final_answer = 'Changed';
  await atomicJson(path.join(raw, 'final.json'), newFinal); f.manifest.attempts[0].final = newFinal;
  await assert.rejects(finalize(), /Selected raw attempt/);
  await writeFile(path.join(raw, 'final.json'), rawFinal); f.manifest.attempts[0].final = JSON.parse(rawFinal);
  const file = path.join(f.directory, 'judge', firstJob, 'summary.json'), prior = await readFile(file);
  const saved = JSON.parse(prior); saved.successes++; await atomicJson(file, saved);
  await assert.rejects(finalize(), /Saved judge summary/);
  await writeFile(file, prior);
  const configFile = path.join(f.directory, 'judge', firstJob, 'config.json'), configBytes = await readFile(configFile);
  const config = JSON.parse(configBytes); config.source_sha256 = {};
  await atomicJson(configFile, config); saved.successes--; saved.config_sha256 = sha(Buffer.from(canonical(config))); await atomicJson(file, saved);
  await assert.rejects(finalize(), /Evaluator source inventory/);
  await writeFile(configFile, configBytes); await writeFile(file, prior);
  f.manifest.attempts[0].final.cleanup_ok = false; await atomicJson(path.join(raw, 'final.json'), f.manifest.attempts[0].final);
  await assert.rejects(finalize(), /verified cleanup/);
  f.manifest.attempts[0].final.cleanup_ok = true; await writeFile(path.join(raw, 'final.json'), rawFinal);
  await writeFile(path.join(f.options.preservation.directory, 'sources.tar.gz'), 'tampered');
  await assert.rejects(finalize(), /source archive changed/);
});

test('finalization excludes collectors and publishers and binds the on-disk manifest', async t => {
  const f = await fixture(t), releaseRun = await acquireRunLock(f.directory);
  await assert.rejects(writeManualReport(f.directory, f.manifest, { ...f.options, finalize: true }), /already active/);
  await releaseRun();
  const releasePublication = await acquireRunLock(path.join(f.directory, '.report-publication'));
  await assert.rejects(writeManualReport(f.directory, f.manifest, f.options), /already active/);
  await releasePublication();
  const child = spawn(path.join(BENCH_ROOT, 'judge/.venv/bin/python'), ['-B', '-c',
    'import fcntl,sys\nf=open(sys.argv[1],"a+")\nfcntl.flock(f,fcntl.LOCK_EX)\nprint("ready",flush=True)\nsys.stdin.read()',
    path.join(f.directory, 'judge/.judge-worker.lock')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = new Promise(resolve => child.once('close', resolve));
  await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); });
  try { await assert.rejects(writeManualReport(f.directory, f.manifest, { ...f.options, finalize: true }), /Judge evidence is active/); }
  finally { child.stdin.end(); await exited; }
  await atomicJson(path.join(f.directory, 'manifest.json'), { ...f.manifest, state: 'changed' });
  await assert.rejects(writeManualReport(f.directory, f.manifest, { ...f.options, finalize: true }), /On-disk manifest differs/);
});

test('normal verdict history and correlated usage cannot be silently replaced', async t => {
  const f = await fixture(t), directory = path.join(f.directory, 'judge', firstJob);
  await writeFile(path.join(directory, 'results.jsonl'), JSON.stringify({ task_id: f.manifest.task_ids[0], predicted_label: 0 }) + '\n' +
    JSON.stringify({ task_id: f.manifest.task_ids[0], predicted_label: 1 }) + '\n');
  await assert.rejects(writeManualReport(f.directory, f.manifest, f.options), /overwritten or repeated/);
  await writeFile(path.join(directory, 'results.jsonl'), '');
  await writeFile(path.join(directory, 'usage.jsonl'), JSON.stringify({ task_id: f.manifest.task_ids[0], job_id: 'other', call_id: 'one' }) + '\n');
  await assert.rejects(writeManualReport(f.directory, f.manifest, f.options), /correlated judge usage/);
});

test('blinded holdout uses frozen exclusions and seeded level quotas, preserving evidence and review edits on repeat', async t => {
  const directory = await temporary(t), historical = path.join(directory, 'historical'), output = path.join(directory, 'bundle');
  const diagnostic = await json(path.join(REPO_ROOT, '.context/om2w/postmortem-cases-sample.json'));
  const excludedTaskIds = [...diagnostic.selected.map(row => row.task_id), '9829f3087ab1f9c8eba6b6dd2b831d25_112325'];
  const selected = Object.entries({ easy: 16, medium: 28, hard: 16 }).flatMap(([level, count]) => dataset.filter(task => task.level === level && !excludedTaskIds.includes(task.task_id)).slice(0, count + 2));
  for (const task of selected) {
    const raw = path.join(directory, 'raw', task.task_id); await mkdir(raw, { recursive: true });
    const shot = path.join(raw, 'frame.png'); await writeFile(shot, encodeSolidPng(16, 16));
    await writeFile(path.join(raw, 'steps.jsonl'), JSON.stringify({ seq: 0, kind: 'bootstrap', tool: 'open_tab', args: { url: task.website }, ok: true, screenshot_path: shot }) + '\n');
    await atomicJson(path.join(raw, 'final.json'), { outcome: 'complete', final_answer: 'Saved evidence', cleanup_ok: true });
    await writeV2({ task, rawDir: raw, outDir: path.join(historical, 'trajectories') });
  }
  await atomicJson(path.join(historical, 'manifest.json'), { outcomes: selected.map(task => ({ task_id: task.task_id, exported: true })) });
  const options = { historicalRunDir: historical, outputDir: output, datasetPath, excludedTaskIds };
  const result = await writeBlindedReviewBundle(options); assert.equal(result.count, 60);
  const privateData = await json(path.join(output, 'private/selection.json'));
  assert.deepEqual(privateData.records.reduce((counts, row) => ({ ...counts, [row.level]: counts[row.level] + 1 }), { easy: 0, medium: 0, hard: 0 }), { easy: 16, medium: 28, hard: 16 });
  assert.equal(privateData.records.some(row => excludedTaskIds.includes(row.task_id)), false);
  const publicTask = await json(path.join(output, 'review/review-001/task.json'));
  for (const key of ['task_id', 'predicted_label', 'outcome', 'model', 'key_points']) assert.equal(Object.hasOwn(publicTask, key), false);
  const labelFile = path.join(output, 'review/labels-template.jsonl');
  await writeFile(path.join(output, 'review/human-labels.jsonl'), '{"review_id":"review-001","literal_goal":"met"}\n');
  const labelsBefore = await readFile(labelFile);
  assert.equal((await writeBlindedReviewBundle(options)).already_recorded, true);
  assert.deepEqual(await readFile(labelFile), labelsBefore);
  assert.match(await readFile(path.join(output, 'review/human-labels.jsonl'), 'utf8'), /met/);
  const fresh = path.join(directory, 'fresh-run'), freshOutput = path.join(directory, 'fresh-bundle');
  await cp(path.join(historical, 'trajectories'), path.join(fresh, 'trajectories'), { recursive: true });
  const gate = await pilotReviewFixture(directory);
  gate.review_bundles = { historical: { output_dir: output, selection_sha256: result.selection_sha256, provenance_sha256: result.provenance_sha256 },
    fresh: { output_dir: freshOutput, seed: 'fsb-fresh-manual-v2-review-20261018' } };
  const freshManifest = { outcomes: selected.map(task => ({ task_id: task.task_id, exported: true })), source: { path: datasetPath },
    gate_receipt: gate, config: { gate_receipt: gate } };
  await atomicJson(path.join(fresh, 'manifest.json'), freshManifest);
  await writeBlindedReviewBundle({ historicalRunDir: fresh, outputDir: freshOutput, datasetPath, excludedTaskIds, seed: gate.review_bundles.fresh.seed });
  const checked = await verifyReviewEvidence(fresh, freshManifest);
  assert.equal(checked.verified, true); assert.equal(checked.descriptive_pilot.complete, true);
  assert.equal(checked.historical.count, 60); assert.equal(checked.fresh.count, 60);
  const notesFile = path.join(path.dirname(gate.descriptive_pilot_review.path), 'review/notes.jsonl'), notes = await readFile(notesFile);
  await writeFile(notesFile, Buffer.concat([notes, Buffer.from('\n')]));
  await assert.rejects(verifyReviewEvidence(fresh, freshManifest), /source or copied evidence changed/);
  await writeFile(notesFile, notes);
  const privateFile = path.join(freshOutput, 'private/selection.json'), privateBytes = await readFile(privateFile);
  await rm(privateFile); await assert.rejects(verifyReviewEvidence(fresh, freshManifest), { code: 'ENOENT' });
  await assert.rejects(readFile(privateFile), { code: 'ENOENT' }); await writeFile(privateFile, privateBytes);
  const freshSelection = JSON.parse(privateBytes), native = freshSelection.records[0], nativeFrame = path.join(native.source, native.evidence[0].file);
  const nativeBytes = await readFile(nativeFrame); await writeFile(nativeFrame, 'replaced original PNG');
  await assert.rejects(verifyReviewEvidence(fresh, freshManifest), /Saved blinded evidence changed/);
  await writeFile(nativeFrame, nativeBytes);
  assert.equal((await verifyBlindedReviewBundle({ ...options })).count, 60);
  const first = privateData.records[0]; await writeFile(path.join(output, 'review', first.review_id, first.evidence[0].file), 'tampered');
  await assert.rejects(writeBlindedReviewBundle(options), /Saved blinded evidence changed/);
  await assert.rejects(writeBlindedReviewBundle({ ...options, excludedTaskIds: excludedTaskIds.map((id, index) => index ? id : 'different') }), /frozen25/);
});
