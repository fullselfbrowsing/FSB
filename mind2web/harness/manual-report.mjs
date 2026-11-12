import { readFile, writeFile, mkdir, readdir, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { BENCH_ROOT, REPO_ROOT } from './proc.mjs';
import { atomicJson, acquireRunLock } from './run-state.mjs';
import { validateTrajectoryDir } from './validate-v2.mjs';
import { writeV2 } from './v2-writer.mjs';
import { verifyPilotReviewComplete } from './manual-pilot-review.mjs';
import { verifyPublicDisposition, publicAttemptBlocker } from './public-disposition.mjs';
import { PUBLIC_PROFILE_ID, PROFILE_ID } from './browser-manual-profile.mjs';
import { MODEL, EFFORT, JUDGE_ENGINE, JUDGE_ENGINE_CLASS } from './model-family.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => readFile(file, 'utf8').then(JSON.parse);
const JOBS = ['official', 'strict'].flatMap(variant => [1, 2, 3].map(pass => ({ id: `${JUDGE_ENGINE}-${variant}-pass${pass}`, variant, pass })));
const SCOPE = `${JUDGE_ENGINE}_only`;
// The runner fingerprints these configuration files alongside its Python sources.
const EVALUATOR_CONFIG = ['codex-tool-isolation.json', 'codex-gpt61sol-browser-policy.json', 'codex-gpt61sol-browser-policy.receipt.json', 'model-family.json'];
const DATASET_SHA256 = '7dedf381531d423dc0fc48d21dc1d425655dd75f38b10211a880fa09102f257f';
const EXCLUDED_CASES_SHA256 = '6e5169aab1e1a20f8ebbb19b384281a27bd2c6c262fcb5ef43a30859b1dbd2ae';
const canonical = value => JSON.stringify(value && typeof value === 'object' ? Array.isArray(value)
  ? value.map(x => JSON.parse(canonical(x))) : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);
const cell = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
const ARCHIVE = path.join(REPO_ROOT, '.context/om2w/repair-v2/before-implementation');
const PRESERVATION = Object.freeze({ directory: ARCHIVE,
  receipt_sha256: '3c56e7ef119e839177cd8e267fe639e882312c4864b231e76fff1883a6f1fba2',
  index_sha256: 'cb0c5c1f315820e9bf021ae5f25c1b900bd9b4f4a574773dd4dc3b1572fb5141',
  archive_sha256: 'fe2778c8266529751697920ac33d428cfa294682bff9cf570a2d9e394a388c30' });

async function optionalJson(file) {
  try { return await json(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function jsonl(file, { final = false } = {}) {
  let bytes;
  try { bytes = await readFile(file); } catch (error) { if (error.code === 'ENOENT') return { rows: [], missing: true, partial: false }; throw error; }
  const lines = bytes.toString('utf8').split('\n');
  let partial = false;
  if (lines.at(-1) !== '') { partial = true; lines.pop(); }
  if (final && partial) throw new Error(`Incomplete final JSONL: ${file}`);
  return { rows: lines.filter(line => line.trim()).map(line => JSON.parse(line)), partial,
    file: { path: file, bytes: bytes.length, sha256: sha(bytes) } };
}
async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Artifact symlinks are not accepted');
    if (entry.isDirectory()) files.push(...await filesBelow(file));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort();
}
export async function trajectoryFingerprint(directory) {
  const hash = createHash('sha256');
  let files;
  try { files = await filesBelow(directory); } catch (error) { if (error.code === 'ENOENT') return hash.digest('hex'); throw error; }
  for (const file of files) hash.update(path.relative(directory, file)).update('\0').update(await readFile(file)).update('\0');
  return hash.digest('hex');
}
export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const q = fraction => sorted.length ? sorted[Math.floor((sorted.length - 1) * fraction)] : null;
  return { count: sorted.length, p50_ms: q(.5), p95_ms: q(.95), max_ms: sorted.at(-1) ?? null };
}
const elapsed = (start, end) => start && end && Number.isFinite(start.monotonic_ms) && Number.isFinite(end.monotonic_ms)
  ? Math.max(0, end.monotonic_ms - start.monotonic_ms) : null;

async function preservationReceipt(spec, deep) {
  const receiptBytes = await readFile(path.join(spec.directory, 'receipt.json'));
  const indexBytes = await readFile(path.join(spec.directory, 'historical-protected.sha256.json'));
  if (sha(receiptBytes) !== spec.receipt_sha256 || sha(indexBytes) !== spec.index_sha256) throw new Error('Original preservation receipt/index changed');
  const receipt = JSON.parse(receiptBytes), index = JSON.parse(indexBytes);
  if (receipt.archive_sha256 !== spec.archive_sha256) throw new Error('Original source archive receipt differs');
  if (deep) {
    if (sha(await readFile(path.join(spec.directory, 'sources.tar.gz'))) !== spec.archive_sha256) throw new Error('Original source archive changed');
    for (const [relative, hash] of Object.entries(index)) {
      const file = path.resolve(REPO_ROOT, relative);
      if (!file.startsWith(REPO_ROOT + path.sep) || sha(await readFile(file)) !== hash) throw new Error('Protected historical artifact changed: ' + relative);
    }
  }
  return { ...spec, historical_files: Object.keys(index).length, historical_bytes_verified: deep };
}

async function verifyFreshSources(manifest) {
  const { sourceFingerprint } = await import('./manual-runner.mjs');
  const actual = await sourceFingerprint({ serverCommand: manifest.server_command, extensionDir: manifest.extension_dir,
    publicRelease: manifest.public_release === true, publicPins: manifest.public_pins });
  if (canonical(actual) !== canonical(manifest.fingerprints)) throw new Error('Fresh run source/runtime fingerprints changed');
  return actual;
}

async function evaluatorSources() {
  const root = path.join(BENCH_ROOT, 'judge');
  const files = (await filesBelow(path.join(root, 'om2w_judge'))).filter(file => file.endsWith('.py'));
  files.push(...['upstream/src/methods/webjudge_online_mind2web.py', 'upstream/src/utils.py', 'requirements.lock.txt'].map(file => path.join(root, file)),
    ...EVALUATOR_CONFIG.map(file => path.join(BENCH_ROOT, 'config', file)));
  return Object.fromEntries(await Promise.all(files.map(async file => [path.relative(root, file), sha(await readFile(file))])));
}

async function verifySelectedExport(runDir, row, attempt, task, profile = PROFILE_ID) {
  const directory = path.join(runDir, 'trajectories', row.task_id);
  const checked = await validateTrajectoryDir(directory);
  if (!checked.ok) throw new Error('Exported trajectory validation failed');
  const temporary = await mkdtemp(path.join(tmpdir(), 'om2w-export-audit-'));
  try {
    const rendered = await writeV2({ task, rawDir: attempt.raw_dir, outDir: temporary,
      allowlistPath: path.join(BENCH_ROOT, 'config', `${profile}.json`) });
    if (await trajectoryFingerprint(rendered.dir) !== await trajectoryFingerprint(directory)) throw new Error('Selected raw attempt and exported trajectory differ');
    return { task_id: row.task_id, selected_attempt: row.selected_attempt,
      trajectory_sha256: await trajectoryFingerprint(directory), final_sha256: sha(await readFile(path.join(attempt.raw_dir, 'final.json'))) };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

async function acquireJudgeEvidenceLock(runDir) {
  const directory = path.join(runDir, 'judge'); await mkdir(directory, { recursive: true });
  // This child only holds the same advisory lock as run_pass. EOF releases it
  // even if the Node publisher exits unexpectedly; it imports no judge code.
  const script = 'import fcntl,sys\nf=open(sys.argv[1],"a+")\nfcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\nprint("locked",flush=True)\nsys.stdin.read()\n';
  const child = spawn(path.join(BENCH_ROOT, 'judge/.venv/bin/python'), ['-B', '-c', script, path.join(directory, '.judge-worker.lock')], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', errors = '';
  child.stderr.on('data', bytes => { errors += bytes; });
  const completed = new Promise(resolve => child.once('close', code => resolve(code)));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Timed out acquiring judge evidence lock')); }, 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', () => { clearTimeout(timer); reject(new Error('Judge evidence is active or its lock could not be acquired: ' + errors.trim())); });
    child.stdout.on('data', bytes => { output += bytes; if (output === 'locked\n') { clearTimeout(timer); resolve(); } });
  });
  return async () => { child.stdin.end(); await completed; };
}

export async function verifyReviewEvidence(runDir, manifest) {
  runDir = path.resolve(runDir);
  const gate = manifest.gate_receipt, reference = gate?.descriptive_pilot_review;
  if (!reference?.path || !path.isAbsolute(reference.path) || path.basename(reference.path) !== 'completion.json' ||
      canonical(manifest.config?.gate_receipt) !== canonical(gate)) throw new Error('Missing frozen descriptive pilot review reference');
  const pilot = await verifyPilotReviewComplete(path.dirname(reference.path));
  if (!pilot.complete || pilot.receipt.sha256 !== reference.sha256 || pilot.public_manifest.sha256 !== reference.public_manifest_sha256 ||
      pilot.notes.sha256 !== reference.notes_sha256 || canonical(pilot.descriptive_summary) !== canonical(reference.descriptive_summary) ||
      reference.human_calibrated !== false || reference.affects_operational_gate !== false ||
      pilot.operational_gate.path !== gate.path || pilot.operational_gate.sha256 !== gate.sha256) throw new Error('Frozen descriptive pilot completion evidence differs');
  const verified = {};
  for (const kind of ['historical', 'fresh']) {
    const plan = gate.review_bundles?.[kind];
    if (!plan?.output_dir || !path.isAbsolute(plan.output_dir)) throw new Error('Missing planned blinded review bundle');
    const privatePath = path.join(plan.output_dir, 'private/selection.json');
    const selection = await json(privatePath);
    const seed = kind === 'historical' ? 'fsb-judge-human-holdout-v2-20261018' : 'fsb-fresh-manual-v2-review-20261018';
    if (selection.selection?.seed !== seed || (kind === 'fresh' && plan.seed !== seed) || !selection.records?.[0]?.source) throw new Error('Blinded review source or seed differs');
    const source = kind === 'fresh' ? runDir : path.dirname(path.dirname(selection.records[0].source));
    const current = await verifyBlindedReviewBundle({ historicalRunDir: source, outputDir: plan.output_dir,
      datasetPath: manifest.source.path, excludedTaskIds: selection.selection.excluded_ids, seed,
      publicRelease: kind === 'fresh' && manifest.public_release === true });
    if (kind === 'historical' && (current.selection_sha256 !== plan.selection_sha256 || current.provenance_sha256 !== plan.provenance_sha256)) throw new Error('Frozen historical review evidence differs');
    verified[kind] = { ...current, public_index: path.join(plan.output_dir, 'review/index.json'),
      private_selection: privatePath, source_manifest_sha256: selection.selection.historical_manifest_sha256, seed };
  }
  return { verified: true, descriptive_pilot: { ...reference, complete: true,
    public_manifest: pilot.public_manifest, private_key: pilot.private_key, notes: pilot.notes }, ...verified };
}

async function finalizedEvidence(runDir, manifest, { verifySources = verifyFreshSources, preservation = PRESERVATION,
  verifyReviews = verifyReviewEvidence } = {}) {
  const audit = await json(path.join(runDir, 'FINAL-AUDIT.json'));
  const names = ['summary.json', 'per-task.json', 'per-task.csv', 'judge-disagreements.json', 'REPORT.md'];
  if (audit.ok !== true || audit.scope !== SCOPE || audit.expected !== 300 || audit.terminal !== 300 || audit.jobs_complete !== 6 ||
      canonical(Object.keys(audit.output_sha256 ?? {}).sort()) !== canonical([...names].sort()) ||
      audit.report_source_sha256 !== sha(await readFile(fileURLToPath(import.meta.url))) ||
      audit.manifest_sha256 !== sha(await readFile(path.join(runDir, 'manifest.json'))) ||
      audit.manifest_canonical_sha256 !== sha(Buffer.from(canonical(manifest)))) throw new Error('Finalized checkpoint provenance differs');
  for (const name of names) if (sha(await readFile(path.join(runDir, name))) !== audit.output_sha256[name]) throw new Error('Finalized report output changed');
  if (canonical(audit.source_hashes) !== canonical(await verifySources(manifest))) throw new Error('Finalized source/runtime fingerprints differ');
  const evaluator = await evaluatorSources(), inputHashes = new Map();
  if (canonical(audit.judge_inputs?.map(row => row.job)) !== canonical(JOBS.map(job => job.id))) throw new Error('Finalized judge evidence is incomplete');
  for (const row of audit.judge_inputs) {
    const directory = path.join(runDir, 'judge', row.job);
    for (const [name, evidence] of [['results.jsonl', row.results], ['usage.jsonl', row.usage], ['config.json', row.config]]) {
      const file = path.join(directory, name);
      if (evidence?.path !== file) throw new Error('Finalized judge evidence path differs');
      if (evidence.missing) {
        try { await readFile(file); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        throw new Error('A missing finalized usage artifact was replaced');
      }
      const bytes = await readFile(file);
      if (bytes.length !== evidence.bytes || sha(bytes) !== evidence.sha256) throw new Error('Finalized judge evidence changed');
    }
    const config = await json(path.join(directory, 'config.json'));
    if (sha(Buffer.from(canonical(config))) !== row.config_sha256 || canonical(config.source_sha256) !== canonical(evaluator)) throw new Error('Finalized judge configuration changed');
    for (const id of manifest.task_ids) {
      if (!inputHashes.has(id)) inputHashes.set(id, await trajectoryFingerprint(path.join(runDir, 'trajectories', id)));
      if (inputHashes.get(id) !== config.inputs[id]) throw new Error('Finalized graded input changed');
    }
  }
  const attempts = manifest.attempts ?? [];
  if (audit.attempt_evidence?.length !== attempts.length || new Set(audit.attempt_evidence.map(row => `${row.task_id}:${row.index}`)).size !== attempts.length) throw new Error('Finalized raw attempt inventory differs');
  for (const row of audit.attempt_evidence) {
    const attempt = attempts.find(attempt => attempt.task_id === row.task_id && attempt.index === row.index);
    if (!attempt || attempt.raw_dir !== row.raw_dir || await trajectoryFingerprint(row.raw_dir) !== row.raw_sha256 ||
        sha(await readFile(path.join(row.raw_dir, 'final.json'))) !== row.final_sha256) throw new Error('Finalized raw attempt evidence changed');
  }
  const exported = manifest.outcomes.filter(row => row.exported);
  if (audit.selected_evidence?.length !== exported.length || new Set(audit.selected_evidence.map(row => row.task_id)).size !== exported.length) throw new Error('Finalized selected export inventory differs');
  for (const row of audit.selected_evidence) {
    const selected = exported.find(outcome => outcome.task_id === row.task_id && outcome.selected_attempt === row.selected_attempt);
    if (!selected || await trajectoryFingerprint(path.join(runDir, 'trajectories', row.task_id)) !== row.trajectory_sha256 ||
        sha(await readFile(path.join(selected.raw_dir, 'final.json'))) !== row.final_sha256) throw new Error('Finalized selected evidence changed');
  }
  for (const [key, value] of Object.entries(preservation)) if (audit.preservation?.[key] !== value) throw new Error('Finalized preservation receipt differs from its pins');
  await preservationReceipt(preservation, true);
  if (canonical(audit.review_evidence) !== canonical(await verifyReviews(runDir, manifest))) throw new Error('Finalized review evidence changed');
  return { ok: true, summary: await json(path.join(runDir, 'summary.json')), audit };
}

export async function verifyFinalizedManualReport(runDir, manifest, options = {}) {
  runDir = path.resolve(runDir);
  if (![PROFILE_ID, PUBLIC_PROFILE_ID].includes(manifest.profile) || manifest.judge_protocol !== 'scorefield-v2') throw new Error('Expected fresh manual report evidence');
  const publication = path.join(runDir, '.report-publication'); await mkdir(publication, { recursive: true });
  const releasePublication = await acquireRunLock(publication);
  let releaseRun, releaseJudge;
  try {
    releaseRun = await acquireRunLock(runDir);
    releaseJudge = await acquireJudgeEvidenceLock(runDir);
    return await finalizedEvidence(runDir, manifest, options);
  } finally {
    try { if (releaseJudge) await releaseJudge(); }
    finally { try { if (releaseRun) await releaseRun(); } finally { await releasePublication(); } }
  }
}

export async function writeManualReport(runDir, manifest, options = {}) {
  runDir = path.resolve(runDir);
  if (![PROFILE_ID, PUBLIC_PROFILE_ID].includes(manifest.profile) || manifest.judge_protocol !== 'scorefield-v2') throw new Error('Report requires a frozen browser manual profile and scorefield-v2');
  const publication = path.join(runDir, '.report-publication'); await mkdir(publication, { recursive: true });
  const releasePublication = await acquireRunLock(publication);
  let releaseRun, releaseJudge;
  try {
    const prior = await optionalJson(path.join(runDir, 'FINAL-AUDIT.json'));
    if (!options.finalize && prior?.ok) {
      releaseJudge = await acquireJudgeEvidenceLock(runDir);
      return (await finalizedEvidence(runDir, manifest, options)).summary;
    }
    let manifestBytes;
    if (options.finalize) {
      releaseRun = await acquireRunLock(runDir);
      releaseJudge = await acquireJudgeEvidenceLock(runDir);
      manifestBytes = await readFile(path.join(runDir, 'manifest.json'));
      if (canonical(JSON.parse(manifestBytes)) !== canonical(manifest)) throw new Error('On-disk manifest differs from the requested final evidence');
    }
    return await writeManualReportUnlocked(runDir, manifest, { ...options,
      manifestFileSha256: manifestBytes ? sha(manifestBytes) : null });
  } finally {
    try { if (releaseJudge) await releaseJudge(); }
    finally { try { if (releaseRun) await releaseRun(); } finally { await releasePublication(); } }
  }
}

async function writeManualReportUnlocked(runDir, manifest, { finalize = false, preservation = PRESERVATION,
  verifySources = verifyFreshSources, verifyReviews = verifyReviewEvidence, manifestFileSha256 = null } = {}) {
  runDir = path.resolve(runDir);
  if (![PROFILE_ID, PUBLIC_PROFILE_ID].includes(manifest.profile) || manifest.judge_protocol !== 'scorefield-v2') throw new Error('Report requires a frozen browser manual profile and scorefield-v2');
  const publicRelease = manifest.public_release === true;
  if ((manifest.profile === PUBLIC_PROFILE_ID) !== publicRelease) throw new Error('Public profile and public release provenance disagree');
  if (manifest.browser !== 'existing' || manifest.timeout_seconds !== 1200 || manifest.max_actions !== 120) throw new Error('Report requires the locked existing-Chrome1200s/120 profile');
  if (manifest.model !== MODEL || manifest.effort !== EFFORT) throw new Error(`Report requires the locked ${MODEL} model and ${EFFORT} effort`);
  if (finalize) await atomicJson(path.join(runDir, 'FINAL-AUDIT.json'), { ok: false, state: 'verifying',
    started_at: new Date().toISOString(), report_source_sha256: sha(await readFile(fileURLToPath(import.meta.url))) });
  const ids = manifest.task_ids;
  if (!Array.isArray(ids) || !ids.length || ids.length !== new Set(ids).size || ids.some(id => !/^[A-Za-z0-9_-]+$/.test(id))) throw new Error('Expected unique safe task IDs');
  if (canonical(await json(path.join(runDir, 'task-ids.json'))) !== canonical(ids)) throw new Error('Task IDs differ from frozen run');
  const outcomes = new Map();
  for (const row of manifest.outcomes ?? []) {
    if (!ids.includes(row.task_id) || outcomes.has(row.task_id)) throw new Error('Unexpected or duplicate terminal task');
    outcomes.set(row.task_id, row);
  }
  const expected = ids.length, scores = [], latestByJob = new Map(), integrity = [], parsedCalls = [];
  const actualEvaluatorSources = finalize ? await evaluatorSources() : null, inputHashes = new Map();
  for (const job of JOBS) {
    const directory = path.join(runDir, 'judge', job.id);
    const config = await optionalJson(path.join(directory, 'config.json'));
    const saved = await optionalJson(path.join(directory, 'summary.json'));
    const results = await jsonl(path.join(directory, 'results.jsonl'), { final: finalize });
    const usage = await jsonl(path.join(directory, 'usage.jsonl'), { final: finalize });
    const latest = new Map(), normal = new Set(), callIds = new Set();
    for (const row of results.rows) {
      if (!ids.includes(row.task_id)) throw new Error('Unexpected judge task ID');
      if (normal.has(row.task_id)) throw new Error('A normal verdict was overwritten or repeated');
      if (!row.infrastructure_error) {
        if (![0, 1].includes(row.predicted_label)) throw new Error('Normal judgment must be binary');
        if (row.error && row.predicted_label !== 0) throw new Error('An errored task cannot receive success');
        normal.add(row.task_id);
      } else if (row.predicted_label !== null) throw new Error('Infrastructure pending is not a completed zero');
      latest.set(row.task_id, row);
    }
    for (const call of usage.rows) {
      if (!ids.includes(call.task_id) || call.job_id !== job.id || !call.call_id || callIds.has(call.call_id) ||
          call.engine !== JUDGE_ENGINE_CLASS || call.model !== manifest.model || call.effort !== manifest.effort ||
          !['key_points', 'image', 'final'].includes(call.stage)) throw new Error('Invalid correlated judge usage');
      callIds.add(call.call_id);
      if (call.response !== undefined && sha(Buffer.from(call.response)) !== call.response_sha256) throw new Error('Judge response hash differs');
      parsedCalls.push(call);
    }
    const rows = [...latest.values()], infra = rows.filter(row => row.infrastructure_error).length;
    const pending = expected - latest.size + infra, successes = rows.filter(row => row.predicted_label === 1).length;
    const errors = rows.filter(row => row.error).length;
    const stages = { key_points: 0, image: 0, final: 0 };
    let missing = 0, other = 0;
    for (const row of rows.filter(row => row.error && !row.infrastructure_error)) {
      const stage = /Malformed (key_points|image|final) reply/.exec(row.error)?.[1];
      if (stage) stages[stage]++; else if (row.error_kind === 'missing_trajectory' || row.error.startsWith('FileNotFoundError:')) missing++; else other++;
    }
    const formatCalls = usage.rows.filter(call => call.format_error).length;
    const transportCalls = usage.rows.filter(call => !call.ok && !call.format_error).length;
    const complete = pending === 0 && Boolean(config) && !results.partial && !usage.partial;
    if (config) {
      if (config.format_version !== 2 || config.judge_protocol !== 'scorefield-v2' || config.rubric !== 'upstream-filter-v1' ||
          config.engine !== JUDGE_ENGINE_CLASS || config.job_id !== job.id || config.model !== manifest.model || config.effort !== manifest.effort ||
          config.variant !== job.variant || config.workers !== 10 || config.engine_concurrency !== 10 || config.global_cli_limit !== 10 ||
          canonical(config.task_ids) !== canonical(ids)) throw new Error('Judge configuration differs from approved six-job run');
    }
    if (finalize) {
      if (!complete || !saved || canonical(Object.keys(config.inputs).sort()) !== canonical([...ids].sort())) throw new Error('All six jobs require complete evidence before finalization');
      for (const [key, value] of Object.entries({ expected, successes, errors, pending_judgments: pending,
        infrastructure_errors: infra, calls: usage.rows.length, format_errors: formatCalls, transport_errors: transportCalls })) {
        if (saved[key] !== value) throw new Error('Saved judge summary differs: ' + key);
      }
      if (saved.success_rate !== successes / expected || saved.config_sha256 !== sha(Buffer.from(canonical(config)))) throw new Error('Judge summary score/config hash differs');
      if (canonical(config.source_sha256) !== canonical(actualEvaluatorSources) || config.adapter_sha256 !== sha(Buffer.from(canonical(actualEvaluatorSources))) ||
          config.format_attempts !== 3 || config.transport_attempts !== 2 || config.call_timeout_seconds !== 180 ||
          path.resolve(config.circuit_state) !== path.resolve(manifest.circuit_state)) throw new Error('Evaluator source inventory or retry/circuit configuration differs');
      for (const [relative, hash] of Object.entries(config.source_sha256)) {
        const file = path.resolve(BENCH_ROOT, 'judge', relative);
        if (![path.join(BENCH_ROOT, 'judge'), path.join(BENCH_ROOT, 'config')].some(root => file.startsWith(root + path.sep))
            || sha(await readFile(file)) !== hash) throw new Error('Evaluator source fingerprint differs');
      }
      for (const id of ids) {
        if (!inputHashes.has(id)) inputHashes.set(id, await trajectoryFingerprint(path.join(runDir, 'trajectories', id)));
        if (inputHashes.get(id) !== config.inputs[id]) throw new Error('Graded trajectory fingerprint differs');
      }
      const configBytes = await readFile(path.join(directory, 'config.json'));
      integrity.push({ job: job.id, results: results.file, usage: usage.file ?? { path: path.join(directory, 'usage.jsonl'), missing: true },
        config: { path: path.join(directory, 'config.json'), bytes: configBytes.length, sha256: sha(configBytes) }, config_sha256: saved.config_sha256 });
    }
    scores.push({ job: job.id, variant: job.variant, pass: job.pass, expected, complete, successes,
      success_rate: complete ? successes / expected : null, errors, infrastructure_pending: infra, pending,
      missing_trajectory_zeros: missing, task_format_errors: Object.values(stages).reduce((x, y) => x + y, 0),
      format_error_stages: stages, other_task_errors: other, call_format_attempts: formatCalls,
      historical_infrastructure_rows: results.rows.filter(row => row.infrastructure_error).length,
      calls: usage.rows.length, transport_attempt_errors: transportCalls });
    latestByJob.set(job.id, latest);
  }
  const attempts = manifest.attempts ?? [], finals = [], finalByAttempt = new Map(), queue = [], upstream = [], capture = [], observations = [], nativeFailures = [];
  let partialTrace = false;
  for (const attempt of attempts) {
    const final = attempt.raw_dir ? await optionalJson(path.join(attempt.raw_dir, 'final.json')) : null;
    if (final && attempt.final && finalize && canonical(final) !== canonical(attempt.final)) throw new Error('Saved raw final and manifest attempt differ');
    const recorded = final ?? attempt.final;
    if (recorded) {
      finals.push(recorded); finalByAttempt.set(attempt, recorded);
      if (publicRelease) {
        const disposition = await verifyPublicDisposition(attempt.raw_dir, recorded);
        if (disposition) nativeFailures.push({ task_id: attempt.task_id, index: attempt.index, ...disposition });
      }
    }
    if (attempt.raw_dir) {
      const steps = await jsonl(path.join(attempt.raw_dir, 'steps.jsonl'), { final: finalize });
      partialTrace ||= steps.partial;
      for (const step of steps.rows) {
        const t = step.timing ?? {};
        queue.push(elapsed(t.lease_requested, t.lease_acquired));
        upstream.push(elapsed(t.upstream_started, t.upstream_finished));
        capture.push(elapsed(t.capture_started, t.capture_finished));
        const total = Date.parse(step.ended_at) - Date.parse(step.started_at);
        if (Number.isFinite(total) && total >= 0) observations.push(total);
      }
    }
  }
  const cleanupBlockers = attempts.filter(attempt => attempt.state === 'running' || finalByAttempt.get(attempt)?.cleanup_ok !== true).length;
  const rows = ids.map(task_id => {
    const outcome = outcomes.get(task_id) ?? { outcome: 'pending', exported: false };
    const verdicts = Object.fromEntries(JOBS.map(job => [job.id, latestByJob.get(job.id).get(task_id)?.infrastructure_error
      ? null : latestByJob.get(job.id).get(task_id)?.predicted_label ?? null]));
    const majority = variant => { const values = JOBS.filter(job => job.variant === variant).map(job => verdicts[job.id]);
      return values.every(value => value !== null) ? Number(values.reduce((n, value) => n + value, 0) >= 2) : null; };
    const native = nativeFailures.find(row => row.task_id === task_id && row.index === outcome.selected_attempt);
    return { task_id, ...outcome, ...(native ? { public_native_failure: native, goal_state: 'unknown_without_terminal_evidence' } : {}),
      judge_verdicts: verdicts, official_majority: majority('official'), strict_majority: majority('strict') };
  });
  const aggregates = Object.fromEntries(['official', 'strict'].map(variant => {
    const subset = scores.filter(score => score.variant === variant), complete = manifest.collection_complete && subset.every(score => score.complete);
    const rates = subset.map(score => score.success_rate);
    const majority = rows.filter(row => row[`${variant}_majority`] === 1).length;
    return [variant, { complete, passes: 3, mean_success_rate: complete ? rates.reduce((n, rate) => n + rate, 0) / 3 : null,
      min_success_rate: complete ? Math.min(...rates) : null, max_success_rate: complete ? Math.max(...rates) : null,
      majority_successes: complete ? majority : null, majority_success_rate: complete ? majority / expected : null }];
  }));
  const disagreements = rows.filter(row => Object.values(row.judge_verdicts).every(value => value !== null) &&
    new Set(Object.values(row.judge_verdicts)).size > 1).map(row => ({ task_id: row.task_id, verdicts: row.judge_verdicts }));
  const tokenTotals = records => Object.fromEntries(['input_tokens', 'cached_input_tokens', 'output_tokens'].map(key =>
    [key, records.reduce((n, row) => n + (row.usage?.[key] ?? 0), 0)]));
  const preserved = await preservationReceipt(preservation, finalize);
  let sourceHashes = manifest.fingerprints, selectedEvidence = [], attemptEvidence = [];
  let reviewEvidence = { verified: false, descriptive_pilot: manifest.gate_receipt?.descriptive_pilot_review ?? null,
    ...(manifest.gate_receipt?.review_bundles ?? {}) };
  if (finalize) {
    const owner = await optionalJson(path.join(runDir, 'judge/.judge-worker-owner.json'));
    if (owner) { try { process.kill(owner.pid, 0); throw new Error('Judge worker is still active'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; } }
    if (expected !== 300 || outcomes.size !== 300 || !manifest.collection_complete || !scores.every(score => score.complete) || cleanupBlockers ||
        (manifest.active_task_ids?.length ?? 0) || partialTrace) throw new Error('Finalization requires300 terminal tasks, six complete jobs and verified cleanup');
    if (finals.length !== attempts.length || (await Promise.all(attempts.map(attempt => publicAttemptBlocker({ ...attempt, final: finalByAttempt.get(attempt) }, { publicRelease })))).some(Boolean)
        || finals.some(final => final.queue_expiries)) throw new Error('Original attempt evidence has an unresolved operational blocker');
    const datasetBytes = await readFile(manifest.source.path);
    if (sha(datasetBytes) !== DATASET_SHA256 || manifest.source.sha256 !== DATASET_SHA256) throw new Error('Final report requires the pinned300-task dataset');
    const dataset = JSON.parse(datasetBytes), tasks = new Map(dataset.map(task => [task.task_id, task]));
    if (canonical(ids) !== canonical(dataset.map(task => task.task_id))) throw new Error('Full run IDs differ from the pinned dataset order');
    for (const row of rows) {
      const selected = attempts.find(attempt => attempt.task_id === row.task_id && attempt.index === row.selected_attempt);
      if (row.exported) {
        if (!selected || selected.raw_dir !== row.raw_dir || finalByAttempt.get(selected)?.outcome !== row.outcome) throw new Error('Terminal selection differs from the original attempt');
        selectedEvidence.push(await verifySelectedExport(runDir, row, selected, tasks.get(row.task_id), manifest.profile));
      } else {
        if (publicRelease && (!selected || selected.raw_dir !== row.raw_dir || finalByAttempt.get(selected)?.outcome !== row.outcome
            || !await verifyPublicDisposition(selected.raw_dir, finalByAttempt.get(selected)))) throw new Error('Public missing trajectory lacks a selected verified native failure');
        let found = false;
        try { await readFile(path.join(runDir, 'trajectories', row.task_id, 'result.json')); found = true; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (found || JOBS.some(job => { const verdict = latestByJob.get(job.id).get(row.task_id);
          return verdict.predicted_label !== 0 || verdict.error_kind !== 'missing_trajectory'; })) throw new Error('Unavailable trajectories must have explicit missing-input zeros');
      }
    }
    sourceHashes = await verifySources(manifest);
    reviewEvidence = await verifyReviews(runDir, manifest);
    for (const attempt of attempts) attemptEvidence.push({ task_id: attempt.task_id, index: attempt.index,
      raw_dir: attempt.raw_dir, raw_sha256: await trajectoryFingerprint(attempt.raw_dir),
      final_sha256: sha(await readFile(path.join(attempt.raw_dir, 'final.json'))) });
  }
  const summary = { format_version: 2, profile: manifest.profile, judge_protocol: manifest.judge_protocol,
    scope: SCOPE, run_id: path.basename(runDir), state: manifest.state, finalized: finalize,
    expected, terminal: outcomes.size, exported: rows.filter(row => row.exported).length,
    unavailable_trajectories: rows.filter(row => outcomes.has(row.task_id) && !row.exported).length,
    ...(publicRelease ? { public_release: true, public_pins: manifest.public_pins, verified_public_native_failures: nativeFailures.length,
      native_failure_goal_states: 'Unknown without final page evidence; missing-trajectory judge zeros are metric conventions, not demonstrated goal failures.' } : {}),
    scores, aggregates, disagreements: disagreements.length, cleanup_blockers: cleanupBlockers,
    jobs_complete: scores.filter(score => score.complete).length, human_calibrated: false, unverified: true,
    actor_usage: { ...tokenTotals(finals), records: finals.length, records_with_usage: finals.filter(row => row.usage).length,
      incomplete: finals.some(row => !row.usage), total_cost_usd: null },
    judge_usage: { ...tokenTotals(parsedCalls), call_attempts: parsedCalls.length,
      cli_processes_spawned: parsedCalls.filter(row => row.cli_spawned).length, total_cost_usd: null },
    latency: { actor_duration: distribution(finals.map(row => row.actor_duration_ms)), cleanup_duration: distribution(finals.map(row => row.cleanup_duration_ms)),
      task_duration: distribution(finals.map(row => row.duration_ms)), queue_wait: distribution(queue), upstream_service: distribution(upstream),
      capture: distribution(capture), operation_record: distribution(observations),
      judge_call: distribution(parsedCalls.map(row => row.duration_ms)) },
    source_hashes: sourceHashes, preservation: preserved, review_evidence: reviewEvidence,
    disclosures: ['Existing Chrome profile: cookies, authentication and site state are shared across separately owned task tabs.',
      'Limits:1200 seconds and120 mutating calls; adaptive measured concurrency up to10.',
      ...(publicRelease ? [
        'Unmodified public release: Chrome Web Store extension0.9.92 and published fsb-mcp-server0.11.2. Experimental product patches are excluded.',
        'The browser-manual-public-v1 actor profile exposes44 tools from the actual public MCP catalogue. The two unregistered wait tools are absent; public Google/browser search fallback is preserved.',
        'Public read_page may dismiss consent UI; all its attempts consume the UI budget and acquire the foreground lease.',
        'The external recorder uses one hidden owned guard tab per task. Cleanup is proven by guard-only inventory, exact guard close acknowledgement and client shutdown; the public release exposes no private registry-zero attestation.',
        'Stock public MCP may internally retry an explicit AGENT_NOT_REGISTERED rejection. The wrapper never replays uncertain actions; guard continuity does not attest identical agent identity when the public inventory omits it.',
        'Native capture failures retain their original response, missing frame and unknown goal state. Continued collection requires separately verified owned cleanup and a guard health PNG; that PNG is excluded from actor evidence and trajectories.',
        'Source binding uses the normal Web Store runtime identity/version and identical archived installed package content; exact profile path and in-memory bytecode are not attested.',
      ] : ['browser-manual-v2 expands actor observations/tools; product and scorefield-v2 parser changes accompany the fresh run.']),
      `Actor and judges are both ${MODEL} (${EFFORT} effort) through Claude Code. Scores are uncalibrated substitute WebJudge judging, not o4-mini and not OSU-verified. Vendored upstream prompts and filter rubric remain unchanged. Pilot visible-state notes are automated and descriptive; their ratings do not affect the operational concurrency gate.`,
      'Historical and fresh60-case blinded evidence bundles are separate from the20-image pilot review. Human labeling does not gate this run or establish completed calibration.',
      'Missing trajectories and terminal task-format errors count zero in each full300 denominator. Infrastructure pending is provisional, not a completed zero.',
      publicRelease ? 'Historical score differences combine public product versions, actor observations/toolset, budget and parser changes; they are not attributed solely to product behavior or repairs.'
        : 'Before/after differences combine product, profile, limits and evaluator changes; no causal attribution to one change is claimed.'] };
  await mkdir(runDir, { recursive: true });
  await atomicJson(path.join(runDir, 'summary.json'), summary);
  await atomicJson(path.join(runDir, 'per-task.json'), rows);
  await atomicJson(path.join(runDir, 'judge-disagreements.json'), disagreements);
  const fields = ['task_id', 'outcome', 'exported', 'selected_attempt', 'action_count', 'duration_ms', 'cleanup_ok', 'official_majority', 'strict_majority'];
  await writeFile(path.join(runDir, 'per-task.csv'), [...fields, ...JOBS.map(job => job.id)].map(cell).join(',') + '\n' + rows.map(row =>
    [...fields.map(key => row[key]), ...JOBS.map(job => row.judge_verdicts[job.id])].map(cell).join(',')).join('\n') + '\n');
  const markdown = [`# ${manifest.model} + FSB — ${finalize ? 'completed' : 'provisional'} evaluation`, '',
    `${outcomes.size}/${expected} terminal tasks; ${summary.exported} exports; ${summary.jobs_complete}/6 judge jobs complete.`, '',
    ...summary.disclosures.map(text => '- ' + text), '', '| Job | Successes / expected | Task format errors | Missing zeros | Infrastructure pending |',
    '|---|---:|---:|---:|---:|', ...scores.map(score => `| ${score.job} | ${score.complete ? `${score.successes}/${expected}` : 'pending'} | ${score.task_format_errors} | ${score.missing_trajectory_zeros} | ${score.pending} |`), '',
    ...Object.entries(aggregates).map(([variant, aggregate]) => `${variant}: ${aggregate.complete ?
      `mean ${(aggregate.mean_success_rate * 100).toFixed(2)}%; range ${(aggregate.min_success_rate * 100).toFixed(2)}–${(aggregate.max_success_rate * 100).toFixed(2)}%; majority ${aggregate.majority_successes}/${expected}.` : 'pending; no completed aggregate score.'}`), '',
    `Disagreements: ${disagreements.length}. Cleanup blockers: ${cleanupBlockers}. Usage and latency distributions are in summary.json.`, '',
    ...(reviewEvidence.verified ? [
      `Automated descriptive pilot review: [completion receipt](<${reviewEvidence.descriptive_pilot.path}>). Ratings describe visible final checkpoints and do not establish full goal success.`,
      `Blinded saved-evidence review: [historical60](<${reviewEvidence.historical.public_index}>) and [fresh60](<${reviewEvidence.fresh.public_index}>). Labels remain uncalibrated.`, ''
    ] : [])];
  await writeFile(path.join(runDir, 'REPORT.md'), markdown.join('\n'));
  if (finalize) await atomicJson(path.join(runDir, 'FINAL-AUDIT.json'), { ok: true, scope: SCOPE, expected: 300,
    terminal: 300, jobs_complete: 6, human_calibrated: false, finalized_at: new Date().toISOString(),
    report_source_sha256: sha(await readFile(fileURLToPath(import.meta.url))), source_hashes: sourceHashes,
    preservation: preserved, judge_inputs: integrity, selected_evidence: selectedEvidence, attempt_evidence: attemptEvidence, review_evidence: reviewEvidence,
    manifest_sha256: manifestFileSha256, manifest_canonical_sha256: sha(Buffer.from(canonical(manifest))), output_sha256: Object.fromEntries(await Promise.all(
      ['summary.json', 'per-task.json', 'per-task.csv', 'judge-disagreements.json', 'REPORT.md'].map(async name => [name, sha(await readFile(path.join(runDir, name)))]))) });
  return summary;
}

async function blindedSelection({ historicalRunDir, outputDir, datasetPath,
  excludedTaskIds, seed = 'fsb-judge-human-holdout-v2-20261018', quotas = { easy: 16, medium: 28, hard: 16 }, publicRelease = false }) {
  historicalRunDir = path.resolve(historicalRunDir); outputDir = path.resolve(outputDir);
  if (outputDir.startsWith(historicalRunDir + path.sep) || outputDir === historicalRunDir) throw new Error('Review bundle must be outside historical run');
  if (!Array.isArray(excludedTaskIds) || excludedTaskIds.length !== 25 || new Set(excludedTaskIds).size !== 25) throw new Error('Exactly25 diagnostic cases must be excluded');
  if (sha(Buffer.from([...excludedTaskIds].sort().join('\n'))) !== EXCLUDED_CASES_SHA256) throw new Error('Diagnostic exclusion IDs differ from the frozen25-case review');
  const datasetBytes = await readFile(datasetPath);
  if (sha(datasetBytes) !== DATASET_SHA256) throw new Error('Blinded review requires the pinned dataset');
  const historicalManifest = await readFile(path.join(historicalRunDir, 'manifest.json'));
  const manifest = JSON.parse(historicalManifest);
  if (publicRelease && (manifest.public_release !== true || manifest.collection_complete !== true
      || manifest.outcomes?.length !== 300 || seed !== 'fsb-fresh-manual-v2-review-20261018')) throw new Error('Public review requires the complete frozen public300-task collection');
  const exported = new Set(manifest.outcomes.filter(row => row.exported).map(row => row.task_id));
  const population = publicRelease ? new Set(manifest.outcomes.map(row => row.task_id)) : exported;
  const eligible = JSON.parse(datasetBytes).filter(task => population.has(task.task_id) && !excludedTaskIds.includes(task.task_id));
  if (canonical(quotas) !== canonical({ easy: 16, medium: 28, hard: 16 })) throw new Error('Blinded review uses frozen16/28/16 quotas');
  const selected = Object.entries(quotas).flatMap(([level, count]) => eligible.filter(task => task.level === level)
    .sort((a, b) => sha(Buffer.from(`${seed}|${level}|${a.task_id}`)).localeCompare(sha(Buffer.from(`${seed}|${level}|${b.task_id}`)))).slice(0, count));
  if (selected.length !== 60) throw new Error('Insufficient review tasks for the frozen level quotas');
  const spec = { seed, quotas, dataset_sha256: sha(datasetBytes), historical_manifest_sha256: sha(historicalManifest),
    excluded_ids: [...excludedTaskIds].sort(),
    selected_ids: selected.map(task => task.task_id), human_calibrated: false, blocks_full_run: false,
    ...(publicRelease ? { public_release: true, sampling_population: 'All300 terminal tasks, including missing native page evidence; export availability does not affect selection.' } : {}) };
  return { historicalRunDir, outputDir, selected, spec, quotas, seed, manifest, publicRelease };
}

async function missingReviewEvidence(runDir, manifest, task, reviewId) {
  const selected = manifest.outcomes.find(row => row.task_id === task.task_id);
  const attempt = manifest.attempts.find(attempt => attempt.task_id === task.task_id && attempt.index === selected?.selected_attempt);
  if (!attempt || selected.exported !== false || attempt.state !== 'finished'
      || attempt.raw_dir !== path.join(runDir, 'raw', task.task_id, `attempt-${attempt.index}`)
      || selected.raw_dir !== attempt.raw_dir || selected.outcome !== attempt.final.outcome) throw new Error('Missing public review card lacks an exact selected raw outcome');
  const finalPath = path.join(attempt.raw_dir, 'final.json'), bytes = await readFile(finalPath), final = JSON.parse(bytes);
  if (canonical(final) !== canonical(attempt.final)) throw new Error('Missing public review raw final changed');
  const disposition = await verifyPublicDisposition(attempt.raw_dir, final);
  if (!disposition || final.provider_error) throw new Error('Missing public review evidence remains infrastructure pending');
  const taskRecord = { review_id: reviewId, task: task.confirmed_task, agent_final_answer: final.final_answer ?? null,
    reference_length: task.reference_length, action_history: null, evidence_status: 'unavailable',
    evidence_note: 'Final native page evidence is unavailable. No earlier page image, independent health image or trajectory is substituted. The saved evidence cannot establish the task goal; use insufficient_evidence.' };
  const artifacts = [finalPath, path.join(attempt.raw_dir, 'steps.jsonl'), path.join(attempt.raw_dir, 'proxy-meta.json'),
    disposition.cleanup_evidence.path, disposition.health_evidence.path, disposition.health_png.path];
  const sources = await Promise.all(artifacts.map(async file => {
    const bytes = await readFile(file); return { path: file, bytes: bytes.length, sha256: sha(bytes) };
  }));
  return { taskRecord, raw_dir: attempt.raw_dir, selected_attempt: attempt.index, final_sha256: sha(bytes), disposition, sources };
}

export async function verifyBlindedReviewBundle(options) {
  const { historicalRunDir, outputDir, selected, spec, quotas, manifest, publicRelease } = await blindedSelection(options);
  const selectionFile = path.join(outputDir, 'private/selection.json'), prior = await json(selectionFile);
  if (canonical(prior.selection) !== canonical(spec) || prior.records?.length !== 60 ||
      new Set(prior.records.map(row => row.review_id)).size !== 60 ||
      canonical(prior.records.map(row => row.task_id).sort()) !== canonical(spec.selected_ids.toSorted())) throw new Error('Review output contains a different selection');
  const ordered = selected.toSorted((a, b) => sha(Buffer.from(`${spec.seed}|display|${a.task_id}`)).localeCompare(sha(Buffer.from(`${spec.seed}|display|${b.task_id}`))));
  for (const [index, task] of ordered.entries()) {
    const row = prior.records.find(row => row.task_id === task.task_id), reviewId = `review-${String(index + 1).padStart(3, '0')}`;
    const source = path.join(historicalRunDir, 'trajectories', task.task_id);
    if (row.review_id !== reviewId || row.source !== source || row.level !== task.level) throw new Error('Saved blinded task provenance differs');
    const outcome = manifest.outcomes.find(row => row.task_id === task.task_id);
    if (publicRelease && !outcome.exported) {
      const expected = await missingReviewEvidence(historicalRunDir, manifest, task, reviewId);
      const { taskRecord, ...evidence } = expected;
      const publicTask = await readFile(path.join(outputDir, 'review', reviewId, 'task.json'));
      if (row.evidence_status !== 'unavailable' || canonical(row.missing_evidence) !== canonical(evidence)
          || row.evidence?.length !== 0 || sha(publicTask) !== row.public_task_sha256
          || canonical(JSON.parse(publicTask)) !== canonical(taskRecord)) throw new Error('Missing blinded evidence card or its raw proof changed');
      const publicFiles = await filesBelow(path.join(outputDir, 'review', reviewId));
      if (canonical(publicFiles) !== canonical([path.join(outputDir, 'review', reviewId, 'task.json')])) throw new Error('Missing final evidence was replaced with an image');
      continue;
    }
    const original = await readFile(path.join(source, 'result.json')), result = JSON.parse(original);
    const expectedFiles = result.action_history.map(step => `trajectory/${step.screenshot}`);
    if (canonical(row.evidence?.map(file => file.file)) !== canonical(expectedFiles)) throw new Error('Saved blinded frame inventory differs');
    for (const evidence of row.evidence) {
      if (path.dirname(evidence.file) !== 'trajectory' || path.basename(evidence.file) !== evidence.file.slice('trajectory/'.length)) throw new Error('Unsafe blinded evidence path');
      for (const file of [path.join(outputDir, 'review', reviewId, evidence.file), path.join(source, evidence.file)]) {
        const bytes = await readFile(file);
        if (bytes.length !== evidence.bytes || sha(bytes) !== evidence.sha256) throw new Error('Saved blinded evidence changed');
      }
    }
    const publicTask = await readFile(path.join(outputDir, 'review', reviewId, 'task.json'));
    if (sha(await readFile(path.join(outputDir, 'private', reviewId, 'original-result.json'))) !== row.original_result_sha256 ||
        sha(original) !== row.original_result_sha256 || sha(publicTask) !== row.public_task_sha256 ||
        canonical(JSON.parse(publicTask)) !== canonical({ review_id: reviewId, task: result.task,
          agent_final_answer: result.agent_final_answer, reference_length: result.reference_length, action_history: result.action_history })) throw new Error('Saved blinded task evidence changed');
  }
  const metadata = ['review/index.json', 'review/labels-template.jsonl', 'review/INSTRUCTIONS.md', 'review/BENCHMARK-RUBRIC.md'];
  if (canonical(Object.keys(prior.public_metadata_sha256 ?? {}).sort()) !== canonical(metadata.toSorted())) throw new Error('Saved blinded metadata inventory differs');
  for (const relative of metadata) if (sha(await readFile(path.join(outputDir, relative))) !== prior.public_metadata_sha256[relative]) throw new Error('Saved blinded metadata changed');
  return { output_dir: outputDir, count: 60, selection_sha256: sha(Buffer.from(canonical(spec))),
    provenance_sha256: sha(await readFile(selectionFile)), quotas, human_calibrated: false, already_recorded: true };
}

export async function writeBlindedReviewBundle(options) {
  const { historicalRunDir, outputDir, selected, spec, quotas, seed, manifest, publicRelease } = await blindedSelection(options);
  const prior = await optionalJson(path.join(outputDir, 'private/selection.json'));
  if (prior) return verifyBlindedReviewBundle(options);
  const records = [], privateRecords = [];
  const ordered = selected.sort((a, b) => sha(Buffer.from(`${seed}|display|${a.task_id}`)).localeCompare(sha(Buffer.from(`${seed}|display|${b.task_id}`))));
  for (const [index, task] of ordered.entries()) {
    const id = `review-${String(index + 1).padStart(3, '0')}`, source = path.join(historicalRunDir, 'trajectories', task.task_id);
    const outcome = manifest.outcomes.find(row => row.task_id === task.task_id);
    if (publicRelease && !outcome.exported) {
      const { taskRecord, ...evidence } = await missingReviewEvidence(historicalRunDir, manifest, task, id);
      const directory = path.join(outputDir, 'review', id); await mkdir(directory, { recursive: true });
      await atomicJson(path.join(directory, 'task.json'), taskRecord);
      records.push({ review_id: id, task: taskRecord.task, evidence: `${id}/task.json` });
      privateRecords.push({ review_id: id, task_id: task.task_id, level: task.level, source, evidence_status: 'unavailable',
        public_task_sha256: sha(await readFile(path.join(directory, 'task.json'))), evidence: [], missing_evidence: evidence });
      continue;
    }
    const checked = await validateTrajectoryDir(source); if (!checked.ok) throw new Error('Invalid historical review export');
    const resultBytes = await readFile(path.join(source, 'result.json')), result = JSON.parse(resultBytes);
    const directory = path.join(outputDir, 'review', id); await mkdir(path.join(directory, 'trajectory'), { recursive: true });
    const files = [];
    for (const step of result.action_history) {
      const input = path.join(source, 'trajectory', step.screenshot), target = path.join(directory, 'trajectory', step.screenshot);
      if (path.dirname(path.resolve(input)) !== path.join(source, 'trajectory')) throw new Error('Unsafe review screenshot');
      const bytes = await readFile(input); await copyFile(input, target);
      if (sha(await readFile(target)) !== sha(bytes)) throw new Error('Review evidence copy differs');
      files.push({ file: `trajectory/${step.screenshot}`, bytes: bytes.length, sha256: sha(bytes) });
    }
    await atomicJson(path.join(directory, 'task.json'), { review_id: id, task: result.task,
      agent_final_answer: result.agent_final_answer, reference_length: result.reference_length, action_history: result.action_history });
    await mkdir(path.join(outputDir, 'private', id), { recursive: true });
    await writeFile(path.join(outputDir, 'private', id, 'original-result.json'), resultBytes);
    records.push({ review_id: id, task: result.task, evidence: `${id}/task.json` });
    privateRecords.push({ review_id: id, task_id: task.task_id, level: task.level, source,
      original_result_sha256: sha(resultBytes), public_task_sha256: sha(await readFile(path.join(directory, 'task.json'))), evidence: files });
  }
  await atomicJson(path.join(outputDir, 'review/index.json'), { count: 60, records, blinded: true, human_calibration_completed: false });
  await writeFile(path.join(outputDir, 'review/labels-template.jsonl'), records.map(record => JSON.stringify({ review_id: record.review_id,
    reviewer: null, benchmark_rubric: null, literal_goal: null, evidence: [], confidence: null, notes: null })).join('\n') + '\n');
  await writeFile(path.join(outputDir, 'review/INSTRUCTIONS.md'), '# Blinded saved-evidence review\n\nReview only this review/ directory; private/ contains provenance and is withheld from reviewers. No old judge labels, outcomes, model names or reasoning are included here.\n\nTwo reviewers label independently before adjudication. Copy labels-template.jsonl to a new reviewer-specific filename; retain the supplied template and evidence unchanged. For benchmark_rubric apply the supplied upstream filter criteria; for literal_goal assess the stated goal without adding mandatory UI workflows. Use met, not_met or insufficient_evidence and cite screenshot/action indices. Do not turn a timeout or an honest blocker report into a success/failure assumption. A later full-raw causal review is a separate evidence condition. This bundle does not block the new run and is not completed human calibration.\n');
  const upstream = await readFile(path.join(BENCH_ROOT, 'judge/upstream/src/methods/webjudge_online_mind2web.py'), 'utf8');
  const criteria = upstream.slice(upstream.indexOf('*Important Evaluation Criteria*:'), upstream.indexOf('*IMPORTANT*', upstream.indexOf('*Important Evaluation Criteria*:')));
  await writeFile(path.join(outputDir, 'review/BENCHMARK-RUBRIC.md'), criteria + '\n');
  await atomicJson(path.join(outputDir, 'private/selection.json'), { selection: spec, records: privateRecords,
    public_metadata_sha256: Object.fromEntries(await Promise.all(['review/index.json', 'review/labels-template.jsonl',
      'review/INSTRUCTIONS.md', 'review/BENCHMARK-RUBRIC.md'].map(async relative => [relative, sha(await readFile(path.join(outputDir, relative)))]))) });
  return { output_dir: outputDir, count: 60, selection_sha256: sha(Buffer.from(canonical(spec))),
    provenance_sha256: sha(await readFile(path.join(outputDir, 'private/selection.json'))), quotas, human_calibrated: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { 'run-dir': { type: 'string' }, finalize: { type: 'boolean', default: false } } });
  if (!values['run-dir']) throw new Error('--run-dir is required');
  const directory = path.resolve(values['run-dir']);
  writeManualReport(directory, await json(path.join(directory, 'manifest.json')), { finalize: values.finalize })
    .then(summary => console.log(JSON.stringify({ expected: summary.expected, jobs_complete: summary.jobs_complete, finalized: summary.finalized })))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
