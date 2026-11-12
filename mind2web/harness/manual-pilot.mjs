import { readFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { BENCH_ROOT } from './proc.mjs';
import { atomicJson } from './run-state.mjs';
import { collectManual, artifactBytes, sourceFingerprint } from './manual-runner.mjs';
import { publicAttemptBlocker, verifyPublicDisposition } from './public-disposition.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const json = file => readFile(file, 'utf8').then(JSON.parse);
export function percentile(values, p = .95) { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : null; }
export async function fixedCanary(tasks) {
  const spec = await json(path.join(BENCH_ROOT, 'config/browser-manual-v2-canary.json'));
  if (hash(JSON.stringify(spec.task_ids)) !== spec.task_ids_sha256) throw new Error('Fixed canary IDs changed');
  const chosen = spec.task_ids.map(id => { const task = tasks.find(x => x.task_id === id); if (!task) throw new Error(`Missing pinned canary ${id}`); return task; });
  const byOrder = [...chosen].sort((a, b) => hash(`${spec.seed}|order|${a.task_id}`).localeCompare(hash(`${spec.seed}|order|${b.task_id}`)));
  return { spec, tasks: chosen, serialA: byOrder.slice(0, 5), serialB: byOrder.slice(5) };
}
export async function operationMetrics(runDirs, { publicRelease = false } = {}) {
  const entries = [], finals = [], perTask = [], gateway = [], faults = [];
  for (const runDir of runDirs) {
    const manifest = await json(path.join(runDir, 'manifest.json'));
    for (const attempt of manifest.attempts.filter(x => x.state === 'finished')) {
      finals.push(attempt.final);
      const disposition = publicRelease ? await verifyPublicDisposition(attempt.raw_dir, attempt.final) : null;
      if (await publicAttemptBlocker(attempt, { publicRelease })) faults.push({ task_id: attempt.task_id,
        fault: attempt.final.fault, cleanup_ok: attempt.final.cleanup_ok, uncertain_upstream: attempt.final.uncertain_upstream });
      const rows = (await readFile(path.join(attempt.raw_dir, 'steps.jsonl'), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; })).split('\n').filter(Boolean).map(JSON.parse);
      entries.push(...rows);
      const requests = (await readFile(path.join(attempt.raw_dir, 'gateway-requests.jsonl'), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; })).split('\n').filter(Boolean).map(JSON.parse);
      const byRequest = new Map();
      for (const row of requests) {
        const id = row.gateway_request_id ?? row.request_id; if (id === undefined) continue;
        const record = byRequest.get(id) ?? { tool: row.tool };
        Object.assign(record, row);
        if (row.event && row.at) record[row.event] = row.at;
        byRequest.set(id, record);
      }
      gateway.push(...[...byRequest.values()].filter(row => row.method === 'tools/call' && typeof row.tool === 'string'));
      const selected = manifest.outcomes.find(x => x.task_id === attempt.task_id);
      perTask.push({ task_id: attempt.task_id, selected: manifest.outcomes.some(x => x.task_id === attempt.task_id && x.selected_attempt === attempt.index),
        outcome: attempt.final.outcome, valid_export: selected?.exported ?? false, timing_unavailable: selected?.pilot_timing_unavailable === true,
        ...(publicRelease ? { public_native_failure: disposition, original_fault: attempt.final.fault ?? null } : {}),
        actor_duration_ms: attempt.final.actor_duration_ms, raw_dir: attempt.raw_dir, final_answer: attempt.final.final_answer });
    }
  }
  const timing = (e, begin, end) => e.timing?.[begin] && e.timing?.[end] ? e.timing[end].monotonic_ms - e.timing[begin].monotonic_ms : null;
  const ordinary = entries.filter(e => !['fill_sheet', 'read_sheet'].includes(e.tool) && !['research_read', 'denied'].includes(e.kind));
  const gatewayQueue = percentile(gateway.map(row => row.queue_wait_ms));
  const browserQueue = percentile(entries.map(e => timing(e, 'lease_requested', 'lease_acquired')));
  const gatewayRoundtrip = gateway.filter(row => !['fill_sheet', 'read_sheet', 'list_tabs', 'get_site_guide'].includes(row.tool))
    .map(row => { const begin = row.received?.monotonic_ms, end = (row.emitted ?? row.finished)?.monotonic_ms; return Number.isFinite(begin) && Number.isFinite(end) ? end - begin : null; }).filter(Number.isFinite);
  return { entries: entries.length, attempts: finals.length, gateway_requests: gateway.length,
    p95_browser_queue_ms: browserQueue, p95_gateway_queue_ms: gatewayQueue,
    p95_queue_ms: browserQueue === null ? gatewayQueue : gatewayQueue === null ? browserQueue : Math.max(browserQueue, gatewayQueue),
    p95_tool_roundtrip_ms: percentile(gatewayRoundtrip.length ? gatewayRoundtrip : ordinary.map(e => Date.parse(e.ended_at) - Date.parse(e.started_at))),
    p95_lease_service_ms: percentile(ordinary.map(e => timing(e, 'lease_acquired', 'lease_released'))),
    queue_expiries: finals.reduce((sum, f) => sum + (f.queue_expiries ?? 0), 0),
    faults,
    per_task: perTask };
}
export function concurrencyDecision({ concurrent, serial, publicRelease = false }) {
  const correctness = concurrent.faults.length === 0 && serial.faults.length === 0
    && concurrent.per_task.every(x => x.valid_export || x.timing_unavailable || publicRelease && x.public_native_failure)
    && serial.per_task.every(x => x.valid_export || x.timing_unavailable || publicRelease && x.public_native_failure);
  const physical = concurrent.per_task.every(x => x.valid_export) && serial.per_task.every(x => x.valid_export);
  const productEvidence = concurrent.per_task.every(x => x.valid_export || publicRelease && x.public_native_failure)
    && serial.per_task.every(x => x.valid_export || publicRelease && x.public_native_failure);
  const timing = concurrent.queue_expiries === 0 && serial.queue_expiries === 0
    && (publicRelease ? productEvidence : physical)
    && concurrent.p95_queue_ms !== null && concurrent.p95_queue_ms <= 30_000
    && concurrent.p95_tool_roundtrip_ms !== null && concurrent.p95_tool_roundtrip_ms <= 60_000
    && serial.p95_tool_roundtrip_ms !== null && serial.p95_tool_roundtrip_ms <= 60_000
    && concurrent.p95_lease_service_ms !== null && serial.p95_lease_service_ms !== null
    && concurrent.p95_lease_service_ms <= serial.p95_lease_service_ms * 1.5;
  return { ok: correctness && timing, correctness_ok: correctness, physical_evidence_ok: physical, timing_ok: timing,
    ...(publicRelease ? { public_release: true, product_outcome_evidence_ok: productEvidence,
      missing_final_frames: [...concurrent.per_task, ...serial.per_task].filter(row => row.public_native_failure).length } : {}),
    thresholds: { p95_queue_ms: 30_000, hard_queue_ms: 60_000, p95_ordinary_roundtrip_ms: 60_000, max_service_ratio: 1.5 },
    interpretation: 'Operational gate with shared cookies and live-site variation; no causal noninferiority claim. Task goal checkpoints are descriptive, not inferred from call counts or normal CLI completion.' };
}
export async function pairedPilot({ outputDir, allTasks, source, serverCommand, extensionDir, localReceipt, circuitState, signal, shouldStop = () => false, resume = false,
  publicRelease = false, publicPins = null, dependencies = {} }) {
  await mkdir(outputDir, { recursive: true });
  if (!localReceipt.ok || !localReceipt.passed_levels?.length || localReceipt.passed_levels.some(n => ![1, 2, 5, 10].includes(n))) throw new Error('At least one fully passing installed local fixture level is required before the live pilot');
  const frozen = await (dependencies.fingerprint ?? sourceFingerprint)({ serverCommand, extensionDir, publicRelease, publicPins });
  const selected = await fixedCanary(allTasks);
  const partition = { ...selected.spec, serial_a_ids: selected.serialA.map(t => t.task_id), serial_b_ids: selected.serialB.map(t => t.task_id), fingerprints: frozen };
  const prior = await json(path.join(outputDir, 'pilot-selection.json')).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (prior && JSON.stringify(prior) !== JSON.stringify(partition)) throw new Error('Cannot resume changed pilot sample, configuration or source bytes');
  await atomicJson(path.join(outputDir, 'pilot-selection.json'), partition);
  for (const concurrency of [10, 5, 2, 1].filter(level => localReceipt.passed_levels.includes(level))) {
    if (shouldStop()) return { ok: false, state: 'paused_drained', detail: 'Pilot dispatch stopped after draining active work' };
    const root = path.join(outputDir, `concurrency-${concurrency}`);
    const phases = [['serial-a', selected.serialA, 1], ['concurrent', selected.tasks, concurrency], ['serial-b', selected.serialB, 1]];
    for (const [name, tasks, workers] of phases) {
      if (shouldStop()) return { ok: false, state: 'paused_drained', run_dir: path.join(root, name), detail: 'Pilot dispatch stopped after draining active work' };
      const runDir = path.join(root, name);
      const result = await (dependencies.collect ?? collectManual)({ runDir, tasks, concurrency: workers, source, serverCommand, extensionDir, circuitState, publicRelease, publicPins,
        beforePublicDispatch: dependencies.beforePublicDispatch,
        gateReceipt: { kind: 'pilot', local_receipt: localReceipt.receipt_path ?? null, fixed_sample_sha256: selected.spec.task_ids_sha256 }, pilotQueueTiming: true, signal, shouldStop, resume });
      if (!result.manifest.collection_complete) return { ok: false, state: result.manifest.state, run_dir: runDir, detail: result.manifest.last_block };
    }
    const serial = await operationMetrics([path.join(root, 'serial-a'), path.join(root, 'serial-b')], { publicRelease });
    const concurrent = await operationMetrics([path.join(root, 'concurrent')], { publicRelease });
    const decision = concurrencyDecision({ concurrent, serial, publicRelease });
    await atomicJson(path.join(root, 'comparison.json'), { concurrency, serial, concurrent, decision, created_at: new Date().toISOString() });
    if (!decision.correctness_ok) return { ok: false, state: 'paused_health', detail: 'Pilot correctness/evidence/cleanup fault requires repair and regating', comparison: path.join(root, 'comparison.json') };
    if (!decision.ok) continue;
    const taskSizes = [];
    for (const [name] of phases) {
      const raw = path.join(root, name, 'raw');
      for (const id of await readdir(raw)) taskSizes.push(await artifactBytes(path.join(raw, id)));
    }
    const receipt = { ok: true, created_at: new Date().toISOString(), selected_concurrency: concurrency,
      ...(publicRelease ? { public_release: true } : {}),
      fixed_sample_sha256: selected.spec.task_ids_sha256, fingerprints: frozen, local_receipt: localReceipt,
      comparison: path.join(root, 'comparison.json'), decision,
      artifact_forecast_bytes: Math.ceil((percentile(taskSizes) ?? 0) * 300 * 2),
      artifact_forecast_policy: 'p95 raw task directory bytes times300, doubled for exports and six judge pass logs; disk gate separately adds25percent headroom and5GB reserve',
      shared_cookies: true, budget: { timeout_seconds: 1200, max_actions: 120 }, human_calibrated: false };
    receipt.receipt_path = path.join(outputDir, 'accepted-gate.json');
    await atomicJson(receipt.receipt_path, receipt); return receipt;
  }
  return { ok: false, state: 'paused_health', detail: 'No tested concurrency level passed the operational gate' };
}
