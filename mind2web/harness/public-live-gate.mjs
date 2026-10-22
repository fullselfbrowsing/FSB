import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { appendFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ManualRecordingProxy } from './manual-recording-proxy.mjs';
import { BrowserScheduler } from './browser-scheduler.mjs';
import { PUBLIC_PROFILE, PUBLIC_ALLOWED_TOOLS, publicCatalogReceipt } from './browser-manual-profile.mjs';
import { resultData, resultOK } from './mcp-record-proxy.mjs';
import { ownedTabsFromResult } from './owned-task-session.mjs';
import { PUBLIC_RELEASE_ADAPTER_VERSION } from './public-release-client.mjs';
import { inspectPng } from './png.mjs';
import { writeV2 } from './v2-writer.mjs';
import { validateTrajectoryDir } from './validate-v2.mjs';
import { callActorTool, FIXTURE_PATH, hoverDispatchObserved, inspectArtifacts, javascriptValue,
  refForLabel, settleOperations } from './manual-live-gate.mjs';
import { MISSING_QUEUE_EXPORT_CODES, QUEUE_TIMEOUT_CODES, queueTimingEvidence } from './queue-timing.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PUBLIC_GATE_PROFILE_PATH = path.resolve(HERE, '../config/browser-manual-public-v1.json');
export const PUBLIC_GATE_VERSION = 'public-local-gate-v1';
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const compact = value => JSON.stringify(value);
const nativeRows = response => response.rows.filter(row => !row.observation);
const actorArgs = args => Object.fromEntries(Object.entries(args).filter(([key]) => !['client', 'visual_reason'].includes(key)));
const LEVELS = [1, 2, 5, 10];
const SOURCE_MODULES = ['manual-live-gate.mjs', 'manual-recording-proxy.mjs', 'public-release-client.mjs', 'browser-scheduler.mjs',
  'browser-manual-profile.mjs', 'mcp-client.mjs', 'owned-task-session.mjs', 'observation-recorder.mjs', 'png.mjs', 'v2-writer.mjs',
  'validate-v2.mjs', 'queue-timing.mjs'];
export const PUBLIC_CLICK_SCRIPT = 'document.querySelector("#gate-click").click(); return true;';
export const PUBLIC_STATE_SCRIPT = 'const input=document.querySelector("#gate-text"); input.value="public gate"; input.dispatchEvent(new Event("input",{bubbles:true})); document.querySelector("#gate-enter").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})); const select=document.querySelector("#gate-select"); select.value="blue"; select.dispatchEvent(new Event("change",{bubbles:true})); document.querySelector("#gate-checkbox").click(); document.querySelector("#gate-hover").dispatchEvent(new MouseEvent("mouseenter",{bubbles:false})); document.querySelector("#gate-click").click(); return true;';
const geometryScript = selector => `const element=document.querySelector(${JSON.stringify(selector)}); element.scrollIntoView({block:"center",behavior:"instant"}); const rect=element.getBoundingClientRect(); return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};`;
export const REF_CASES = Object.freeze([
  { tool: 'click', label: 'Gate click', args: {} },
  { tool: 'type_text', label: 'Gate text', args: { text: 'public ref text' } },
  { tool: 'press_enter', label: 'Gate Enter', args: {} },
  { tool: 'select_option', label: 'Gate selection', args: { value: 'blue' } },
  { tool: 'check_box', label: 'Gate checkbox', args: {} },
  { tool: 'hover', label: 'Gate hover', args: {} },
  { tool: 'get_text', label: 'Gate read', args: {} },
]);

async function descriptor(file) {
  file = path.resolve(file); const bytes = await readFile(file);
  return { path: file, bytes: bytes.length, sha256: sha(bytes) };
}
async function verifyDescriptor(expected) {
  assert.ok(expected && typeof expected.path === 'string' && /^[a-f0-9]{64}$/.test(expected.sha256));
  const actual = await descriptor(expected.path);
  assert.equal(actual.sha256, expected.sha256, `Evidence changed: ${expected.path}`);
  if (expected.bytes !== undefined) assert.equal(actual.bytes, expected.bytes);
  return actual;
}
function pinFiles(publicPins) {
  const files = Array.isArray(publicPins) ? publicPins : publicPins?.files;
  assert.ok(Array.isArray(files) && files.length, 'Pinned official package/runtime file descriptors are required');
  assert.equal(new Set(files.map(row => path.resolve(row.path))).size, files.length, 'Duplicate public pins');
  return files;
}
export async function verifyPublicPins(publicPins) {
  return Promise.all(pinFiles(publicPins).map(verifyDescriptor));
}
async function within(root, file) {
  const relative = path.relative(await realpath(root), await realpath(file));
  assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'Evidence escaped its directory');
}
async function treeDescriptor(directory) {
  const files = [];
  async function visit(relative = '') {
    for (const item of (await readdir(path.join(directory, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const next = path.join(relative, item.name), full = path.join(directory, next);
      assert.equal((await lstat(full)).isSymbolicLink(), false, 'Gate evidence must not contain symlinks');
      if (item.isDirectory()) await visit(next);
      else { assert.equal(item.isFile(), true); files.push({ relative_path: next, ...await descriptor(full) }); }
    }
  }
  await visit();
  return { path: path.resolve(directory), sha256: sha(compact(files.map(({ relative_path, sha256, bytes }) => ({ relative_path, sha256, bytes })))), files };
}
async function verifyTree(expected) {
  const actual = await treeDescriptor(expected.path);
  assert.deepEqual(actual, expected, 'Raw/export tree changed after the gate');
  return actual;
}
async function records(file, optional = false) {
  let bytes;
  try { bytes = await readFile(file); } catch (error) { if (optional && error.code === 'ENOENT') return []; throw error; }
  const text = bytes.toString('utf8');
  assert.ok(!text || text.endsWith('\n'), `Incomplete JSONL: ${file}`);
  return text.split('\n').filter(Boolean).map(JSON.parse);
}
const parsedRows = step => (step.result_text ?? '').split('\n').filter(Boolean).map(JSON.parse);
const byOperation = steps => new Map(steps.map(step => [step.operation_id, step]));
function stepFor(map, id, tool) {
  const step = map.get(id); assert.ok(step, `Missing operation ${id}`);
  if (tool) assert.equal(step.tool, tool);
  return step;
}
function stateFromStep(step, marker) {
  assert.equal(step.tool, 'get_text'); assert.equal(step.args.selector, '#gate-state'); assert.equal(step.ok, true);
  const state = JSON.parse(parsedRows(step).find(row => typeof row.text === 'string')?.text ?? 'null');
  assert.equal(state?.marker, marker); return state;
}
function assertSettled(proxy) {
  assert.ok(!proxy.meta.uncertain_upstream && !proxy.meta.capture_cleanup_pending && !proxy.meta.fault
    && !proxy.meta.public_native_failure && !proxy.scheduler.halted, 'Public fixture has an ownership, native capture or unresolved-operation fault');
}
function refEffect(tool, before, after, rows, marker) {
  switch (tool) {
    case 'click': return after.clicks === before.clicks + 1;
    case 'type_text': return after.typed === 'public ref text';
    case 'press_enter': return after.enters === before.enters + 1;
    case 'select_option': return after.selected === 'blue';
    case 'check_box': return after.checked === true;
    case 'hover': return hoverDispatchObserved(after, before);
    case 'get_text': return rows.some(row => row.text === `READ_TEXT ${marker}`);
    default: throw new Error('Unexpected ref diagnostic');
  }
}
export function evaluatePublicRefDiagnostic({ tool, ref, before, after, rows, nativeSuccess, nativeOutcome, marker, unavailable }) {
  if (unavailable) return { tool, status: 'unavailable', native_success: false, observed_effect: false };
  assert.match(ref, /^e\d+$/); assert.equal(before.marker, marker); assert.equal(after.marker, marker);
  const observed = refEffect(tool, before, after, rows, marker);
  return { tool, status: nativeSuccess && observed ? 'passed' : 'failed', native_success: nativeSuccess === true,
    observed_effect: observed, native_unknown: nativeOutcome === 'unknown' || rows.some(row => row.outcome === 'unknown' || row.execution_outcome === 'unknown' || row.mayHaveExecuted === true) };
}
export function summarizePublicRefCapabilities(records) {
  assert.deepEqual(records.map(row => row.tool), REF_CASES.map(row => row.tool));
  return { total: 7, passed: records.filter(row => row.status === 'passed').length,
    failed: records.filter(row => row.status === 'failed').length,
    unavailable: records.filter(row => row.status === 'unavailable').length,
    admission_requirement: false, records };
}

// Each tested target comes only from that same task's immediately preceding
// snapshot. A later observation is evidence, never a substitute targeting call.
export async function runPublicRefDiagnostics({ marker, tabId, call, readState }) {
  const output = [];
  for (const spec of REF_CASES) {
    const before = await readState(tabId);
    const snapshot = await call('get_page_snapshot', { tab_id: tabId }, { allowFailure: true, imageCount: 1 });
    let ref;
    try { ref = refForLabel(snapshot.rows.find(row => typeof row.snapshot === 'string')?.snapshot ?? '', spec.label); }
    catch {
      output.push({ ...evaluatePublicRefDiagnostic({ tool: spec.tool, unavailable: true }), label: spec.label,
        snapshot_operation_id: snapshot.operation_id, reason: 'The actual public snapshot did not expose one exact labelled compact ref' });
      continue;
    }
    const response = await call(spec.tool, { tab_id: tabId, selector: ref, ...spec.args },
      { allowFailure: true, observeCompletedUnknown: spec.tool !== 'get_text', imageCount: 1 });
    const after = await readState(tabId);
    output.push({ ...evaluatePublicRefDiagnostic({ tool: spec.tool, ref, before: before.state, after: after.state,
      rows: nativeRows(response), nativeSuccess: resultOK(response.result), nativeOutcome: response.execution_outcome, marker }), label: spec.label, ref,
      snapshot_operation_id: snapshot.operation_id, operation_id: response.operation_id,
      before_operation_id: before.operation_id, after_operation_id: after.operation_id,
      native_result: nativeRows(response), completed_unknown: response.completed_unknown });
  }
  return summarizePublicRefCapabilities(output);
}
function percentile(values) {
  values = values.filter(Number.isFinite).sort((a, b) => a - b);
  return values.length ? values[Math.max(0, Math.ceil(values.length * .95) - 1)] : null;
}
export function publicTimingMetrics(steps, calls, queueExpiries) {
  const elapsed = (end, start) => end && start ? end.monotonic_ms - start.monotonic_ms : NaN;
  return { queue_expiries: queueExpiries,
    p95_queue_ms: percentile(steps.map(row => elapsed(row.timing?.lease_acquired, row.timing?.lease_requested))),
    p95_tool_roundtrip_ms: percentile(calls.map(row => row.roundtrip_ms)),
    p95_ui_lease_ms: percentile(steps.map(row => elapsed(row.timing?.lease_released, row.timing?.lease_acquired))) };
}
export function assessPublicLevel(level, serialLeaseMs) {
  const leaseLimit = Number.isFinite(serialLeaseMs) ? serialLeaseMs * 1.5 : null;
  const passed = level.physical_tests_complete === true && level.queue_expiries === 0
    && Number.isFinite(level.p95_queue_ms) && level.p95_queue_ms <= 30_000
    && Number.isFinite(level.p95_tool_roundtrip_ms) && level.p95_tool_roundtrip_ms <= 60_000
    && Number.isFinite(level.p95_ui_lease_ms) && leaseLimit !== null && level.p95_ui_lease_ms <= leaseLimit;
  return { ...level, ok: passed, failure_kind: passed ? null : 'timing', ui_lease_limit_ms: leaseLimit };
}

async function startFixtureServer() {
  const html = await readFile(FIXTURE_PATH);
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method !== 'GET' || url.pathname !== '/fixture') { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); response.end(html);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
function fixtureUrl(origin, marker, mode = 'full') {
  const url = new URL('/fixture', origin); url.searchParams.set('marker', marker); url.searchParams.set('mode', mode); return url.href;
}
async function gateCall(context, name, args = {}, options = {}) {
  const start = performance.now(), from = context.proxy.seq;
  const response = await callActorTool(context.proxy, name, args, options);
  const steps = (await records(path.join(context.rawDir, 'steps.jsonl'))).filter(step => step.seq >= from);
  const actual = steps.find(step => step.tool === name && step.kind !== 'bootstrap');
  const call = { tool: name, args, started_monotonic_ms: start, ended_monotonic_ms: performance.now(),
    roundtrip_ms: performance.now() - start, operation_ids: steps.map(step => step.operation_id),
    operation_id: actual?.operation_id ?? null, native_success: resultOK(response.result),
    image_count: response.images, frame_id: response.observation?.frame_id ?? null };
  await appendFile(path.join(context.rawDir, 'gate-calls.jsonl'), compact(call) + '\n');
  assertSettled(context.proxy);
  return { ...response, operation_id: call.operation_id, execution_outcome: actual?.execution_outcome };
}
async function readState(context, tabId = context.proxy.tabId) {
  const response = await gateCall(context, 'get_text', { ...(tabId ? { tab_id: tabId } : {}), selector: '#gate-state' }, { imageCount: 1 });
  const state = JSON.parse(response.rows.find(row => typeof row.text === 'string')?.text ?? 'null');
  const expected = response.observation?.tab_id === context.proxy.tabId ? context.marker : `${context.marker}-popup`;
  assert.equal(state?.marker, expected);
  return { state, operation_id: response.operation_id, observation: response.observation };
}
async function clickCoordinates(context, selector, tabId = context.proxy.tabId) {
  const geometry = await gateCall(context, 'execute_js', { tab_id: tabId, code: geometryScript(selector) }, { imageCount: 1 });
  const point = javascriptValue(geometry.rows); assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  const response = await gateCall(context, 'click_at', { tab_id: tabId, frame_id: geometry.observation.frame_id, ...point },
    { imageCount: 1, observeCompletedUnknown: true });
  return { geometry_operation_id: geometry.operation_id, operation_id: response.operation_id };
}
async function exportContext(context, outputDir, profilePath, origin) {
  await writeFile(path.join(context.rawDir, 'final.json'), json({ task_id: context.taskId, outcome: 'complete',
    final_answer: 'Synthetic local rig checks finished; product capability results are recorded separately.', synthetic: true, benchmark_result: false }));
  const written = await writeV2({ task: { task_id: context.taskId, website: context.proxy.startUrl,
    confirmed_task: 'Validate synthetic public-release browser evidence and exact local fixture state.', reference_length: 1, level: 'easy' },
    rawDir: context.rawDir, outDir: path.join(outputDir, 'trajectories'), allowlistPath: profilePath });
  const validation = await validateTrajectoryDir(written.dir); assert.equal(validation.ok, true, validation.errors.join('; '));
  context.export_dir = written.dir;
  context.artifacts = await inspectArtifacts({ rawDir: context.rawDir, expectedOrigin: origin,
    allowedMarkers: [context.marker, `${context.marker}-popup`], exportDir: written.dir });
}
export async function verifyPublicCleanup(meta, cleanup, capturedTabs, steps = []) {
  assert.equal(meta.public_release, true); assert.equal(meta.profile, PUBLIC_PROFILE.id); assert.equal(meta.cleanup_ok, true);
  assert.deepEqual(meta.child_cleanup, cleanup); assert.equal(cleanup.ok, true);
  const drain = cleanup.public_guard_drain, disposal = cleanup.public_guard_disposal, shutdown = cleanup.public_client_shutdown;
  assert.equal(drain?.ok, true); assert.equal(disposal?.ok, true); assert.equal(disposal.closed, true);
  assert.equal(shutdown?.cleanup_ok, true); assert.equal(shutdown.client_closed, true); assert.equal(shutdown.guard_server_closed, true);
  const guardId = meta.public_guard?.guard_tab_id;
  assert.ok(Number.isSafeInteger(guardId) && guardId > 0); assert.equal(meta.public_guard.ok, true);
  for (const [receipt, method] of [[meta.public_guard, 'public_guard_presence'], [drain, 'public_guard_only_inventory'],
    [disposal, 'public_exact_guard_close_ack_after_guard_only_inventory'], [shutdown, 'public_exact_guard_close_ack_after_guard_only_inventory']]) {
    assert.equal(receipt.adapter_version, PUBLIC_RELEASE_ADAPTER_VERSION); assert.equal(receipt.method, method); assert.equal(receipt.guard_tab_id, guardId);
  }
  assert.equal(shutdown.guard_prepared, true); assert.equal(shutdown.guard_close_attempted, true); assert.equal(shutdown.guard_disposed, true);
  assert.equal(shutdown.post_close_inventory_requested, false); assert.ok(!shutdown.fault);
  // A listed popup that FSB assigns to another agent stays in scope until the
  // harness closes it by Chrome tab ID after the client shuts down.
  const byId = (a, b) => a - b, foreignIds = [...(drain.foreign_tab_ids ?? [])].sort(byId);
  assert.deepEqual([...drain.inventory?.tab_ids].sort(byId), [guardId, ...foreignIds].sort(byId)); assert.deepEqual(drain.task_tab_ids, []);
  assert.deepEqual([...disposal.prior_inventory?.tab_ids].sort(byId), [guardId, ...foreignIds].sort(byId)); assert.equal(disposal.post_close_inventory_requested, false);
  if (foreignIds.length) {
    assert.deepEqual(cleanup.foreign_tabs.map(row => row.tab_id).sort(byId), foreignIds);
    for (const row of cleanup.foreign_tabs) assert.match(row.native_error, /is owned by agent_[\w-]+, not the calling agent/);
    assert.equal(cleanup.foreign_tab_closure?.ok, true); assert.deepEqual([...cleanup.foreign_tab_closure.closed].sort(byId), foreignIds);
  } else assert.equal(cleanup.foreign_tabs, undefined);
  assert.equal(disposal.private_registry_drain_attested, false);
  const closed = cleanup.closes.map(row => {
    assert.equal(row.result.length, 1); assert.ok(Number.isSafeInteger(row.tab_id) && row.tab_id > 0 && row.tab_id !== guardId);
    const result = row.result[0], id = result?.tab_id ?? result?.tabId ?? result?.id;
    assert.equal(row.ok, true); assert.equal(result?.success, true); assert.equal(result.closed, true); assert.equal(id, row.tab_id); return id;
  });
  for (const step of steps.filter(row => row.tool === 'close_tab' && row.ok)) {
    const rows = parsedRows(step), result = rows[0], id = result?.tab_id ?? result?.tabId ?? result?.id;
    assert.ok(Number.isSafeInteger(id) && id > 0 && id !== guardId);
    assert.equal(rows.length, 1); assert.equal(result?.success, true); assert.equal(result.closed, true); assert.equal(id, step.args.tab_id);
    closed.push(id);
  }
  assert.equal(new Set(closed).size, closed.length, 'Cleanup must not retry a close');
  assert.deepEqual([...new Set(capturedTabs)].sort((a, b) => a - b), [...closed].sort((a, b) => a - b));
}
export async function verifyPublicSessionArtifacts(session, origin) {
  const steps = await records(path.join(session.raw_dir, 'steps.jsonl'), !session.export_dir);
  const emissions = await records(path.join(session.raw_dir, 'emissions.jsonl'), true);
  for (const step of steps) if (step.frame_receipt) {
    await within(session.raw_dir, step.screenshot_path);
    const receipt = step.frame_receipt, png = inspectPng(await readFile(step.screenshot_path));
    assert.equal(receipt.operation_id, step.operation_id); assert.equal(receipt.model_image_detail, 'original');
    assert.equal(receipt.output_width, png.width); assert.equal(receipt.output_height, png.height);
    if (step.kind !== 'bootstrap') {
      const matches = emissions.filter(row => row.frame_id === receipt.frame_id);
      assert.equal(matches.length, 1); const emitted = matches[0];
      for (const key of ['operation_id', 'task_id', 'tab_id', 'sha256', 'byte_length']) assert.equal(emitted[key], receipt[key]);
      assert.equal(emitted.model_image_detail, 'original');
    }
  }
  if (session.export_dir) {
    const actual = await inspectArtifacts({ rawDir: session.raw_dir, expectedOrigin: origin,
      allowedMarkers: [session.marker, `${session.marker}-popup`], exportDir: session.export_dir });
    assert.deepEqual(actual, session.artifacts); assert.equal((await validateTrajectoryDir(session.export_dir)).ok, true);
  } else {
    const evidence = await queueTimingEvidence(session.raw_dir);
    assert.equal(evidence.valid, true); assert.equal(evidence.can_explain_missing_export, true);
  }
  return { steps, calls: await records(path.join(session.raw_dir, 'gate-calls.jsonl'), true) };
}

export function verifyPublicFixtureGoal(goal, maps, sessions) {
  const session = sessions.get(goal.task_id); assert.ok(session);
  const map = maps.get(goal.task_id), marker = session.marker;
  const state = id => stateFromStep(stepFor(map, id), marker);
  if (['dom_state', 'wave_state'].includes(goal.kind)) {
    const action = stepFor(map, goal.action_operation_id, 'execute_js');
    assert.equal(action.args.code, goal.kind === 'dom_state' ? PUBLIC_STATE_SCRIPT : PUBLIC_CLICK_SCRIPT);
    const before = state(goal.before_operation_id), after = state(goal.after_operation_id);
    assert.equal(after.clicks, before.clicks + 1);
    if (goal.kind === 'dom_state') {
      assert.equal(after.typed, 'public gate'); assert.equal(after.enters, before.enters + 1);
      assert.equal(after.selected, 'blue'); assert.equal(after.checked, true); assert.equal(after.hover_synthetic, before.hover_synthetic + 1);
    }
  } else if (goal.kind === 'canvas') {
    const geometry = stepFor(map, goal.geometry_operation_id, 'execute_js'); assert.equal(geometry.args.code, geometryScript('#gate-canvas'));
    const point = javascriptValue(parsedRows(geometry)); const action = stepFor(map, goal.action_operation_id, 'click_at');
    assert.equal(action.args.frame_id, geometry.frame_receipt.frame_id); assert.equal(action.args.x, point.x); assert.equal(action.args.y, point.y);
    assert.equal(state(goal.after_operation_id).canvas, state(goal.before_operation_id).canvas + 1);
  } else if (goal.kind === 'explicit_capture') {
    const action = stepFor(map, goal.operation_id, 'capture_screenshot'); assert.equal(action.ok, true); assert.ok(action.frame_receipt?.capture_id);
  } else if (goal.kind === 'svg_text') {
    const action = stepFor(map, goal.operation_id, 'get_text'); assert.equal(action.args.selector, '#after-svg');
    assert.ok(parsedRows(action).some(row => row.text === `AFTER_SVG ${marker}`)); assert.equal(action.ok, true);
  } else if (goal.kind === 'site_guide') {
    const action = stepFor(map, goal.operation_id, 'get_site_guide'); assert.equal(action.kind, 'research_read'); assert.equal(action.screenshot_path, null); assert.equal(action.ok, true);
  } else if (goal.kind === 'popup_foreign') {
    assert.notEqual(goal.primary_tab_id, goal.popup_tab_id);
    const probe = stepFor(map, goal.probe_operation_id, 'get_text');
    assert.equal(probe.tab_id, goal.popup_tab_id); assert.equal(probe.kind, 'foreign_read'); assert.equal(probe.error_code, 'PUBLIC_TAB_NOT_CONTROLLABLE');
    assert.match(probe.error, /is owned by agent_[\w-]+, not the calling agent/);
    const inventory = stepFor(map, goal.inventory_operation_id, 'list_tabs');
    const ids = parsedRows(inventory).find(row => Array.isArray(row.tabs))?.tabs.map(row => row.id ?? row.tabId ?? row.tab_id);
    assert.deepEqual([...ids].sort((a, b) => a - b), [goal.primary_tab_id, goal.popup_tab_id].sort((a, b) => a - b));
    assert.equal(state(goal.before_operation_id).clicks, 0); assert.equal(state(goal.after_operation_id).marker, marker);
  } else if (goal.kind === 'popup_isolation') {
    assert.notEqual(goal.primary_tab_id, goal.popup_tab_id);
    const childMarker = `${marker}-popup`;
    const childBefore = stateFromStep(stepFor(map, goal.child_before_operation_id), childMarker);
    const childAfter = stateFromStep(stepFor(map, goal.child_after_operation_id), childMarker);
    const parentBefore = state(goal.before_operation_id), parentMiddle = state(goal.parent_unchanged_operation_id), parentAfter = state(goal.after_operation_id);
    const childAgain = stateFromStep(stepFor(map, goal.child_unchanged_operation_id), childMarker);
    assert.equal(parentBefore.clicks, 0); assert.equal(childBefore.clicks, 0);
    assert.equal(parentMiddle.clicks, 0); assert.equal(childAfter.clicks, 1); assert.equal(parentAfter.clicks, 1); assert.equal(childAgain.clicks, 1);
    for (const [id, tab] of [[goal.child_action_operation_id, goal.popup_tab_id], [goal.parent_action_operation_id, goal.primary_tab_id]]) {
      const action = stepFor(map, id, 'execute_js'); assert.equal(action.tab_id, tab); assert.equal(action.args.code, PUBLIC_CLICK_SCRIPT);
    }
    const child = stepFor(map, goal.child_before_operation_id); assert.equal(child.tab_id, goal.popup_tab_id);
    const url = new URL(child.frame_receipt.source_url); assert.equal(url.searchParams.get('marker'), childMarker); assert.equal(url.searchParams.get('child'), '1');
    const inventory = stepFor(map, goal.inventory_operation_id, 'list_tabs');
    const ids = parsedRows(inventory).find(row => Array.isArray(row.tabs))?.tabs.map(row => row.id ?? row.tabId ?? row.tab_id);
    assert.deepEqual([...ids].sort((a, b) => a - b), [goal.primary_tab_id, goal.popup_tab_id].sort((a, b) => a - b));
  } else if (goal.kind === 'foreign_denial') {
    assert.equal(goal.control.native_success, false);
    assert.match(compact(goal.control.rows), /TAB_NOT_OWNED|Detected: Tab ownership|TAB_OUT_OF_SCOPE/);
    assert.equal(goal.control.tool, 'get_text'); assert.equal(goal.control.args.selector, '#marker');
    const foreign = sessions.get(goal.foreign_task_id); assert.ok(foreign); assert.notEqual(foreign.task_id, session.task_id);
    assert.equal(goal.control.args.tab_id, foreign.primary_tab_id);
    const foreignMap = maps.get(foreign.task_id);
    const before = stateFromStep(stepFor(foreignMap, goal.before_foreign_operation_id), foreign.marker);
    const after = stateFromStep(stepFor(foreignMap, goal.after_foreign_operation_id), foreign.marker);
    for (const key of ['marker', 'clicks', 'typed', 'enters', 'selected', 'checked', 'hover_synthetic', 'canvas', 'churn']) assert.deepEqual(after[key], before[key]);
  } else if (goal.kind === 'last_tab_guard') {
    const action = stepFor(map, goal.operation_id, 'close_tab'); assert.equal(action.kind, 'denied'); assert.equal(action.screenshot_path, null);
    assert.match(action.result_text, /LAST_WORKING_TAB/); assert.equal(action.ok, false);
  } else throw new Error('Unexpected admission goal');
}

/** Revalidate saved public evidence without creating clients, images or files. */
export async function verifyPublicLocalGateEvidence(summary, { gateDir, serverCommand, publicPins, profilePath = PUBLIC_GATE_PROFILE_PATH } = {}) {
  gateDir = path.resolve(gateDir); assert.equal(summary.version, PUBLIC_GATE_VERSION); assert.equal(summary.public_release, true);
  assert.equal(summary.output_dir, gateDir); assert.equal(summary.profile, PUBLIC_PROFILE.id);
  assert.equal(summary.command_sha256, sha(compact(serverCommand)));
  const pins = await verifyPublicPins(publicPins); assert.deepEqual(pins, summary.public_pins);
  const manifest = JSON.parse(await readFile(path.join(gateDir, 'manifest.json'), 'utf8'));
  for (const key of ['version', 'public_release', 'profile', 'output_dir', 'fixture_origin', 'command_sha256', 'sources', 'public_pins']) assert.deepEqual(manifest[key], summary[key]);
  for (const source of summary.sources) await verifyDescriptor(source);
  assert.deepEqual(summary.sources.map(row => row.path), [fileURLToPath(import.meta.url), FIXTURE_PATH, path.resolve(profilePath), ...SOURCE_MODULES.map(file => path.join(HERE, file))]);
  const profile = JSON.parse(await readFile(profilePath, 'utf8'));
  assert.deepEqual(profile.actions, PUBLIC_PROFILE.actions); assert.deepEqual(profile.reads, PUBLIC_PROFILE.reads);
  assert.equal(summary.hard_queue_ms, 60_000); assert.equal(summary.correctness_ok, true); assert.equal(summary.cleanup_ok, true);
  const sessions = new Map(), maps = new Map(), data = new Map();
  for (const session of summary.sessions) {
    assert.ok(!sessions.has(session.task_id)); sessions.set(session.task_id, session);
    await within(gateDir, session.raw_dir); await verifyTree(session.raw_evidence);
    if (session.export_dir) { await within(gateDir, session.export_dir); await verifyTree(session.export_evidence); }
    const rows = await verifyPublicSessionArtifacts(session, summary.fixture_origin); maps.set(session.task_id, byOperation(rows.steps)); data.set(session.task_id, rows);
    const meta = JSON.parse(await readFile(path.join(session.raw_dir, 'proxy-meta.json'), 'utf8'));
    assert.equal(meta.task_id, session.task_id); assert.equal(meta.tab_id, session.primary_tab_id); assert.equal(meta.start_url, fixtureUrl(summary.fixture_origin, session.marker));
    assert.ok(!meta.fault && !meta.public_native_failure && !meta.uncertain_upstream && !meta.capture_cleanup_pending);
    assert.equal(meta.counts.screenshot_errors, 0); assert.equal(meta.cleanup_ok, session.cleanup_ok);
    assert.deepEqual(meta.public_catalog, summary.public_catalog);
    await verifyPublicCleanup(meta, JSON.parse(await readFile(path.join(session.raw_dir, 'childcleanup.json'), 'utf8')),
      rows.steps.filter(row => row.frame_receipt).map(row => row.tab_id), rows.steps);
    assert.equal(meta.queue_expiries ?? 0, session.queue_expiries);
    if (session.queue_expiries || !session.export_dir) {
      assert.equal(session.level_timing_failed, true);
      assert.deepEqual(await queueTimingEvidence(session.raw_dir), session.queue_timing_evidence);
    }
    for (const call of rows.calls) {
      assert.ok(Number.isFinite(call.roundtrip_ms) && call.roundtrip_ms >= 0);
      assert.ok(call.operation_id && call.operation_ids.includes(call.operation_id));
      const step = stepFor(maps.get(session.task_id), call.operation_id, call.tool); assert.deepEqual(actorArgs(step.args), call.args);
      assert.equal(call.native_success, step.ok); assert.equal(call.image_count, step.screenshot_path ? 1 : 0);
    }
  }
  const functional = summary.sessions.filter(row => row.role === 'functional'); assert.equal(functional.length, 1);
  const diagnostic = summary.sessions.filter(row => row.role === 'ref_diagnostics'); assert.equal(diagnostic.length, 1);
  assert.equal(summary.sessions.filter(row => row.role === 'foreign_control').length, 1);
  assert.ok(summary.sessions.every(row => ['functional', 'ref_diagnostics', 'foreign_control', 'wave'].includes(row.role)));
  if (!Array.isArray(publicPins) && publicPins.catalog) {
    const catalog = JSON.parse(await readFile(publicPins.catalog.path, 'utf8'));
    await verifyDescriptor(publicPins.catalog); assert.deepEqual(publicCatalogReceipt(catalog), summary.public_catalog);
  }
  const map = maps.get(diagnostic[0].task_id), marker = diagnostic[0].marker;
  const recalculated = [];
  for (const [index, record] of summary.compact_ref_capabilities.records.entries()) {
    const spec = REF_CASES[index]; assert.equal(record.tool, spec.tool); assert.equal(record.label, spec.label);
    const snapshot = stepFor(map, record.snapshot_operation_id, 'get_page_snapshot');
    let ref; try { ref = refForLabel(parsedRows(snapshot).find(row => typeof row.snapshot === 'string')?.snapshot ?? '', spec.label); } catch {}
    if (record.status === 'unavailable') { assert.equal(ref, undefined); recalculated.push({ ...record, ...evaluatePublicRefDiagnostic({ tool: spec.tool, unavailable: true }) }); continue; }
    assert.equal(record.ref, ref); const action = stepFor(map, record.operation_id, spec.tool);
    assert.deepEqual(actorArgs(action.args), { tab_id: diagnostic[0].primary_tab_id, selector: ref, ...spec.args });
    const before = stateFromStep(stepFor(map, record.before_operation_id), marker), after = stateFromStep(stepFor(map, record.after_operation_id), marker);
    assert.deepEqual(record.native_result, parsedRows(action));
    recalculated.push({ ...record, ...evaluatePublicRefDiagnostic({ tool: spec.tool, ref, before, after, rows: parsedRows(action), nativeSuccess: action.ok, nativeOutcome: action.execution_outcome, marker }) });
  }
  assert.deepEqual(summarizePublicRefCapabilities(recalculated), summary.compact_ref_capabilities);
  const core = summary.admission_goals.filter(row => row.kind !== 'wave_state');
  const popupKind = core.some(row => row.kind === 'popup_foreign') ? 'popup_foreign' : 'popup_isolation';
  assert.deepEqual(core.map(row => row.kind).sort(), ['dom_state', 'canvas', 'explicit_capture', 'svg_text', 'site_guide', popupKind, 'foreign_denial', 'last_tab_guard'].sort());
  for (const goal of summary.admission_goals) {
    assert.equal(sessions.get(goal.task_id)?.role, goal.kind === 'wave_state' ? 'wave' : 'functional');
    verifyPublicFixtureGoal(goal, maps, sessions);
    if (goal.kind === 'foreign_denial') {
      const saved = await records(path.join(sessions.get(goal.task_id).raw_dir, 'public-controls.jsonl'));
      assert.equal(saved.length, 1); assert.deepEqual(saved[0], goal.control);
      assert.deepEqual(summary.controls, [{ name: 'native_foreign_tab_probe', requesting_task: goal.task_id, foreign_task: goal.foreign_task_id, ...goal.control }]);
    }
  }
  assert.deepEqual(summary.concurrency.map(row => row.workers), LEVELS);
  const computed = [];
  for (const level of summary.concurrency) {
    const wave = summary.sessions.filter(row => row.level === level.workers); assert.equal(wave.length, level.workers);
    assert.deepEqual(wave.map(row => row.task_id), level.task_ids);
    const complete = wave.every(row => row.export_dir && summary.admission_goals.some(goal => goal.kind === 'wave_state' && goal.task_id === row.task_id));
    const metrics = publicTimingMetrics(wave.flatMap(row => data.get(row.task_id).steps), wave.flatMap(row => data.get(row.task_id).calls), wave.reduce((n, row) => n + row.queue_expiries, 0));
    if (!complete || metrics.queue_expiries) for (const session of wave.filter(row => row.queue_expiries)) assert.equal((await queueTimingEvidence(session.raw_dir)).valid, true);
    assert.ok(complete || metrics.queue_expiries > 0, 'Incomplete fixture checks are not a passing timing result');
    const actual = assessPublicLevel({ ...level, ...metrics, physical_tests_complete: complete,
      physical_frames: wave.reduce((n, session) => n + (session.artifacts?.physical_frames ?? 0), 0) }, level.workers === 1 ? metrics.p95_ui_lease_ms : computed[0].p95_ui_lease_ms);
    assert.deepEqual(actual, level); computed.push(actual);
  }
  const passed = computed.filter(row => row.ok).map(row => row.workers);
  assert.deepEqual(summary.passed_levels, passed); assert.equal(summary.highest_passing_level, passed.length ? Math.max(...passed) : null);
  assert.equal(summary.ok, passed.length > 0); assert.equal(summary.ok, true);
  return { ok: true, profile: PUBLIC_PROFILE.id, passed_levels: passed, highest_passing_level: summary.highest_passing_level,
    compact_ref_capabilities: { passed: summary.compact_ref_capabilities.passed, failed: summary.compact_ref_capabilities.failed, unavailable: summary.compact_ref_capabilities.unavailable },
    sessions: sessions.size, physical_frames: summary.sessions.reduce((n, row) => n + (row.artifacts?.physical_frames ?? 0), 0), cleanup_ok: true };
}

export async function publicLiveGate({ liveAuthorized = false, outputDir, command, publicPins, publicCatalog,
  profilePath = PUBLIC_GATE_PROFILE_PATH, beforePublicDispatch } = {}) {
  assert.equal(liveAuthorized, true, 'Public live gate requires explicit live authorization');
  assert.ok(Array.isArray(command) && command.length > 1 && command.every(value => typeof value === 'string'), 'An explicitly pinned public MCP command is required');
  const pins = await verifyPublicPins(publicPins); profilePath = path.resolve(profilePath);
  const profile = JSON.parse(await readFile(profilePath, 'utf8'));
  assert.deepEqual(profile.actions, PUBLIC_PROFILE.actions); assert.deepEqual(profile.reads, PUBLIC_PROFILE.reads);
  assert.ok(outputDir); outputDir = path.resolve(outputDir);
  assert.equal((await readdir(outputDir).catch(error => { if (error.code === 'ENOENT') return []; throw error; })).length, 0, 'Use a fresh gate evidence directory');
  await mkdir(outputDir, { recursive: true });
  publicCatalog ??= !Array.isArray(publicPins) && publicPins.catalog ? JSON.parse(await readFile(publicPins.catalog.path, 'utf8')) : undefined;
  const sources = await Promise.all([fileURLToPath(import.meta.url), FIXTURE_PATH, profilePath, ...SOURCE_MODULES.map(file => path.join(HERE, file))].map(descriptor));
  const server = await startFixtureServer(), scheduler = new BrowserScheduler(), contexts = [];
  const summary = { version: PUBLIC_GATE_VERSION, public_release: true, profile: PUBLIC_PROFILE.id,
    synthetic: true, benchmark_result: false, no_model_calls: true, output_dir: outputDir, fixture_origin: server.origin,
    started_at: new Date().toISOString(), command_sha256: sha(compact(command)), public_pins: pins, sources,
    hard_queue_ms: scheduler.maxQueueMs, correctness_ok: false, cleanup_ok: false, ok: false,
    checks: [], admission_goals: [], controls: [], compact_ref_capabilities: null, concurrency: [], sessions: [],
    limitations: ['Capability failures are public FSB results, not benchmark task scores.',
      'Guard continuity and a denied foreign-tab control do not attest to an unexposed native registry or browser-wide tab inventory.',
      'The public MCP may internally re-register/retry; this wrapper does not replay calls.',
      'The public Google search fallback remains available. No unsupported wait or search-disable parameter is used.'] };
  await writeFile(path.join(outputDir, 'manifest.json'), json(summary), { flag: 'wx' });
  async function createContext(role, level = null) {
    const taskId = `public_gate_${role}_${randomUUID().replaceAll('-', '')}`, rawDir = path.join(outputDir, 'raw', taskId);
    const proxy = new ManualRecordingProxy({ command, public_release: true, publicCatalog, beforePublicDispatch,
      rawDir, startUrl: fixtureUrl(server.origin, taskId), taskId, attemptId: 'public-scripted-gate', scheduler,
      maxActions: 120, deadline: Date.now() + 1_200_000, onFault: fault => scheduler.halt(`Public fixture fault: ${fault.code}`) });
    const context = { taskId, marker: taskId, rawDir, proxy, role, level }; proxy.gateCompletedUnknowns = [];
    contexts.push(context); await proxy.upstream.initialize(); await proxy.preparePublicRelease();
    const catalog = await proxy.handle('tools/list'); assert.deepEqual(catalog.tools.map(tool => tool.name).sort(), [...PUBLIC_ALLOWED_TOOLS].sort());
    summary.public_catalog ??= structuredClone(proxy.meta.public_catalog); assert.deepEqual(proxy.meta.public_catalog, summary.public_catalog);
    return context;
  }
  const goal = async value => {
    const sessions = new Map(contexts.map(context => [context.taskId, { task_id: context.taskId, marker: context.marker, primary_tab_id: context.proxy.tabId }]));
    const maps = new Map(await Promise.all(contexts.map(async context => [context.taskId, byOperation(await records(path.join(context.rawDir, 'steps.jsonl'), true))])));
    verifyPublicFixtureGoal(value, maps, sessions); summary.admission_goals.push(value);
    summary.checks.push({ name: value.kind, ok: true, task_id: value.task_id });
  };
  async function executeClick(context, tabId) { return gateCall(context, 'execute_js', { tab_id: tabId, code: PUBLIC_CLICK_SCRIPT }, { imageCount: 1, observeCompletedUnknown: true }); }
  try {
    const diagnostic = await createContext('ref_diagnostics');
    await readState(diagnostic);
    summary.compact_ref_capabilities = await runPublicRefDiagnostics({ marker: diagnostic.marker, tabId: diagnostic.proxy.tabId,
      call: (name, args, options) => gateCall(diagnostic, name, args, options), readState: tabId => readState(diagnostic, tabId) });
    await exportContext(diagnostic, outputDir, profilePath, server.origin); await diagnostic.proxy.close();
    assert.equal(diagnostic.proxy.meta.cleanup_ok, true);

    const context = await createContext('functional'); const before = await readState(context), primary = context.proxy.tabId;
    const action = await gateCall(context, 'execute_js', { tab_id: primary, code: PUBLIC_STATE_SCRIPT }, { imageCount: 1, observeCompletedUnknown: true });
    const after = await readState(context);
    await goal({ kind: 'dom_state', task_id: context.taskId, before_operation_id: before.operation_id, action_operation_id: action.operation_id, after_operation_id: after.operation_id });
    const canvasBefore = await readState(context), canvas = await clickCoordinates(context, '#gate-canvas'), canvasAfter = await readState(context);
    await goal({ kind: 'canvas', task_id: context.taskId, before_operation_id: canvasBefore.operation_id, action_operation_id: canvas.operation_id,
      geometry_operation_id: canvas.geometry_operation_id, after_operation_id: canvasAfter.operation_id });
    const capture = await gateCall(context, 'capture_screenshot', {}, { imageCount: 1 }); await goal({ kind: 'explicit_capture', task_id: context.taskId, operation_id: capture.operation_id });
    const svg = await gateCall(context, 'get_text', { selector: '#after-svg' }, { imageCount: 1 }); await goal({ kind: 'svg_text', task_id: context.taskId, operation_id: svg.operation_id });
    const guide = await gateCall(context, 'get_site_guide', { domain: 'amazon.com' }, { imageCount: 0 }); await goal({ kind: 'site_guide', task_id: context.taskId, operation_id: guide.operation_id });
    await gateCall(context, 'navigate', { tab_id: primary, url: fixtureUrl(server.origin, context.marker, 'isolation') }, { imageCount: 1 });
    const parentBefore = await readState(context); await clickCoordinates(context, '#gate-popup');
    let inventory, child;
    for (let tries = 0; tries < 5 && !child; tries++) {
      inventory = await gateCall(context, 'list_tabs', {}, { imageCount: 0 }); const tabs = ownedTabsFromResult(inventory.result);
      assert.ok(tabs.some(tab => tab.id === primary)); assert.ok(tabs.length <= 2);
      child = tabs.find(tab => tab.id !== primary); if (!child && tries < 4) await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(child, 'Public scoped inventory did not identify exactly one popup');
    // The public release may list the popup while assigning it to another agent.
    // That is recorded as a product capability, like the compact-ref diagnostics.
    const probe = await gateCall(context, 'get_text', { tab_id: child.id, selector: '#gate-state' }, { allowFailure: true });
    const popupForeign = context.proxy.session.foreign.has(child.id);
    summary.popup_capability = { status: popupForeign ? 'foreign_owned' : 'controllable', popup_tab_id: child.id, probe_operation_id: probe.operation_id,
      native_error: popupForeign ? context.proxy.session.foreign.get(child.id).native_error : null, admission_requirement: false };
    if (popupForeign) {
      const parentAfterPopup = await readState(context);
      await goal({ kind: 'popup_foreign', task_id: context.taskId, primary_tab_id: primary, popup_tab_id: child.id,
        inventory_operation_id: inventory.operation_id, before_operation_id: parentBefore.operation_id, probe_operation_id: probe.operation_id,
        after_operation_id: parentAfterPopup.operation_id });
    } else {
      const childBefore = await readState(context, child.id), childAction = await executeClick(context, child.id), childAfter = await readState(context, child.id);
      const parentMiddle = await readState(context), parentAction = await executeClick(context, primary), parentAfter = await readState(context), childAgain = await readState(context, child.id);
      await goal({ kind: 'popup_isolation', task_id: context.taskId, primary_tab_id: primary, popup_tab_id: child.id,
        inventory_operation_id: inventory.operation_id, before_operation_id: parentBefore.operation_id, child_before_operation_id: childBefore.operation_id,
        child_action_operation_id: childAction.operation_id, child_after_operation_id: childAfter.operation_id, parent_unchanged_operation_id: parentMiddle.operation_id,
        parent_action_operation_id: parentAction.operation_id, after_operation_id: parentAfter.operation_id, child_unchanged_operation_id: childAgain.operation_id });
    }
    const foreign = await createContext('foreign_control'), foreignBefore = await readState(foreign);
    const deniedArgs = { tab_id: foreign.proxy.tabId, selector: '#marker' };
    const denied = await scheduler.run(context.proxy.ownerId, () => context.proxy.request('get_text', deniedArgs, 15_000));
    assertSettled(context.proxy); assert.equal(resultOK(denied), false);
    const control = { tool: 'get_text', args: deniedArgs, rows: resultData(denied), native_success: resultOK(denied), isError: denied.isError === true };
    await appendFile(path.join(context.rawDir, 'public-controls.jsonl'), compact(control) + '\n');
    summary.controls.push({ name: 'native_foreign_tab_probe', requesting_task: context.taskId, foreign_task: foreign.taskId, ...control });
    const foreignAfter = await readState(foreign);
    await goal({ kind: 'foreign_denial', task_id: context.taskId, foreign_task_id: foreign.taskId, before_foreign_operation_id: foreignBefore.operation_id,
      after_foreign_operation_id: foreignAfter.operation_id, control });
    // Close the popup first so the actor guard is tested against one working tab.
    // A foreign-owned popup cannot be closed through FSB; cleanup closes it by tab ID.
    if (!popupForeign) await gateCall(context, 'close_tab', { tab_id: child.id }, { imageCount: 1 });
    const refused = await gateCall(context, 'close_tab', { tab_id: primary }, { allowFailure: true, imageCount: 0 });
    await goal({ kind: 'last_tab_guard', task_id: context.taskId, operation_id: refused.operation_id });
    await exportContext(context, outputDir, profilePath, server.origin); await exportContext(foreign, outputDir, profilePath, server.origin);
    await settleOperations([context.proxy.close(), foreign.proxy.close()]);
    assert.ok(context.proxy.meta.cleanup_ok && foreign.proxy.meta.cleanup_ok);

    for (const workers of LEVELS) {
      const from = contexts.length; let error;
      try {
        const wave = await settleOperations(Array.from({ length: workers }, () => createContext('wave', workers)));
        await settleOperations(wave.map(async context => {
          const before = await readState(context), action = await executeClick(context, context.proxy.tabId), after = await readState(context);
          assert.equal(after.state.clicks, before.state.clicks + 1); assert.equal(after.state.marker, context.marker);
          await goal({ kind: 'wave_state', task_id: context.taskId, before_operation_id: before.operation_id, action_operation_id: action.operation_id, after_operation_id: after.operation_id });
          await exportContext(context, outputDir, profilePath, server.origin);
        }));
      } catch (caught) { error = caught; }
      const wave = contexts.slice(from), steps = [], calls = [];
      for (const context of wave) {
        context.queue_evidence = await queueTimingEvidence(context.rawDir);
        if (!context.artifacts) try { await exportContext(context, outputDir, profilePath, server.origin); }
        catch (caught) { if (!(context.queue_evidence.can_explain_missing_export && MISSING_QUEUE_EXPORT_CODES.has(caught.code))) throw caught; }
        await context.proxy.close(); assert.equal(context.proxy.meta.cleanup_ok, true); assertSettled(context.proxy);
        steps.push(...await records(path.join(context.rawDir, 'steps.jsonl'), true)); calls.push(...await records(path.join(context.rawDir, 'gate-calls.jsonl'), true));
      }
      const expiries = wave.reduce((n, context) => n + (context.proxy.meta.queue_expiries ?? 0), 0);
      if (expiries) for (const context of wave.filter(context => context.proxy.meta.queue_expiries)) assert.equal(context.queue_evidence.valid, true);
      if (error && !(expiries && (QUEUE_TIMEOUT_CODES.has(error.code) || error.code === 'ACTOR_IMAGE_COUNT'))) throw error;
      const complete = !error && wave.length === workers && wave.every(context => context.artifacts && summary.admission_goals.some(row => row.kind === 'wave_state' && row.task_id === context.taskId));
      assert.ok(complete || expiries > 0, 'Incomplete physical-state checks require a proved queue denial');
      const metrics = publicTimingMetrics(steps, calls, expiries);
      summary.concurrency.push(assessPublicLevel({ workers, ...metrics, physical_tests_complete: complete, task_ids: wave.map(context => context.taskId),
        physical_frames: wave.reduce((n, context) => n + (context.artifacts?.physical_frames ?? 0), 0) }, workers === 1 ? metrics.p95_ui_lease_ms : summary.concurrency[0].p95_ui_lease_ms));
    }
    summary.correctness_ok = true;
  } catch (error) {
    summary.error = error.message; summary.error_code = error.code ?? error.name; scheduler.halt('Public fixture admission failed');
  } finally {
    for (const context of contexts) {
      try { await context.proxy.close(); } catch (error) { context.cleanup_error = error.message; }
      summary.sessions.push({ task_id: context.taskId, marker: context.marker, role: context.role, level: context.level,
        primary_tab_id: context.proxy.tabId, raw_dir: context.rawDir, export_dir: context.export_dir ?? null,
        artifacts: context.artifacts ?? null, cleanup_ok: context.proxy.meta.cleanup_ok === true,
        cleanup_error: context.cleanup_error ?? context.proxy.meta.cleanup_error ?? null, queue_expiries: context.proxy.meta.queue_expiries ?? 0,
        level_timing_failed: context.level !== null && summary.concurrency.find(level => level.workers === context.level)?.ok === false,
        queue_timing_evidence: context.queue_evidence ?? null,
        completed_unknowns: context.proxy.gateCompletedUnknowns, raw_evidence: await treeDescriptor(context.rawDir),
        export_evidence: context.export_dir ? await treeDescriptor(context.export_dir) : null });
    }
    summary.cleanup_ok = contexts.length > 0 && contexts.every(context => context.proxy.meta.cleanup_ok === true);
    summary.passed_levels = summary.concurrency.filter(row => row.ok).map(row => row.workers);
    summary.highest_passing_level = summary.passed_levels.length ? Math.max(...summary.passed_levels) : null;
    summary.queue_expiries = contexts.reduce((n, context) => n + (context.proxy.meta.queue_expiries ?? 0), 0);
    summary.ok = summary.correctness_ok && summary.cleanup_ok && summary.passed_levels.length > 0;
    await server.close(); summary.ended_at = new Date().toISOString();
    if (summary.ok) try { await verifyPublicLocalGateEvidence(summary, { gateDir: outputDir, serverCommand: command, publicPins, profilePath }); }
    catch (error) { summary.ok = false; summary.correctness_ok = false; summary.error = error.message; summary.error_code = error.code ?? 'PUBLIC_GATE_EVIDENCE_INVALID'; }
    await writeFile(path.join(outputDir, 'summary.json'), json(summary));
  }
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { 'run-live': { type: 'boolean' }, output: { type: 'string' }, profile: { type: 'string' },
    'fsb-server-cmd': { type: 'string' }, 'public-pins': { type: 'string' } } });
  const summary = await publicLiveGate({ liveAuthorized: values['run-live'] === true, outputDir: values.output, profilePath: values.profile,
    command: values['fsb-server-cmd'] ? JSON.parse(values['fsb-server-cmd']) : undefined,
    publicPins: values['public-pins'] ? JSON.parse(await readFile(values['public-pins'], 'utf8')) : undefined });
  console.log(compact({ ok: summary.ok, correctness_ok: summary.correctness_ok, cleanup_ok: summary.cleanup_ok,
    passed_levels: summary.passed_levels, ref_capabilities: summary.compact_ref_capabilities && { passed: summary.compact_ref_capabilities.passed, failed: summary.compact_ref_capabilities.failed, unavailable: summary.compact_ref_capabilities.unavailable },
    output_dir: summary.output_dir, error_code: summary.error_code }));
  if (!summary.ok) process.exitCode = 1;
}
