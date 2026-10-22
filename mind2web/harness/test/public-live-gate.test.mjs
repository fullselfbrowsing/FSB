import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REF_CASES, PUBLIC_CLICK_SCRIPT, PUBLIC_STATE_SCRIPT, PUBLIC_GATE_PROFILE_PATH,
  assessPublicLevel, evaluatePublicRefDiagnostic, publicLiveGate, publicTimingMetrics,
  runPublicRefDiagnostics, summarizePublicRefCapabilities, verifyPublicCleanup,
  verifyPublicFixtureGoal, verifyPublicLocalGateEvidence, verifyPublicPins, verifyPublicSessionArtifacts } from '../public-live-gate.mjs';
import { encodeSolidPng } from '../png.mjs';
import { writeV2 } from '../v2-writer.mjs';
import { inspectArtifacts } from '../manual-live-gate.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const result = (rows, ok = true) => ({ isError: !ok, content: rows.map(row => ({ type: 'text', text: JSON.stringify(row) })) });
const initial = marker => ({ marker, clicks: 0, typed: '', enters: 0, selected: 'red', checked: false,
  hovered: 0, hover_synthetic: 0, hover_trusted: 0, canvas: 0, churn: false });

function diagnostics({ successful = false, unavailable = false, unknown = false } = {}) {
  const marker = 'diagnostic_task', state = initial(marker), calls = []; let id = 0;
  return { calls, async run() { return runPublicRefDiagnostics({ marker, tabId: 42,
    async readState(tab) { assert.equal(tab, 42); return { state: { ...state }, operation_id: `state-${++id}` }; },
    async call(tool, args, options) {
      calls.push({ tool, args, options }); let rows, ok = true;
      if (tool === 'get_page_snapshot') rows = [{ snapshot: unavailable ? 'No labelled controls' : REF_CASES.map((row, index) => `\`e${index + 1}: button "${row.label}"\``).join('\n') }];
      else {
        const index = REF_CASES.findIndex(row => row.tool === tool); assert.ok(index >= 0);
        assert.deepEqual(args, { tab_id: 42, selector: `e${index + 1}`, ...REF_CASES[index].args });
        if (successful || unknown) {
          if (tool === 'click') state.clicks++;
          if (tool === 'type_text') state.typed = args.text;
          if (tool === 'press_enter') state.enters++;
          if (tool === 'select_option') state.selected = args.value;
          if (tool === 'check_box') state.checked = true;
          if (tool === 'hover') { state.hovered++; state.hover_synthetic++; }
        }
        ok = successful;
        rows = successful ? [{ success: true, ...(tool === 'get_text' ? { text: `READ_TEXT ${marker}` } : {}) }]
          : unknown ? [{ outcome: 'unknown', mayHaveExecuted: true }]
            : [{ success: false, error: 'Element not found' }];
      }
      return { result: result(rows, ok), rows, operation_id: `operation-${++id}`, completed_unknown: null };
    } }); } };
}

test('all seven diagnostics use actual snapshot refs with no CSS/text action fallback; native failures remain advisory failures', async () => {
  const fixture = diagnostics(), receipt = await fixture.run();
  assert.equal(receipt.passed, 0); assert.equal(receipt.failed, 7); assert.equal(receipt.unavailable, 0); assert.equal(receipt.admission_requirement, false);
  assert.deepEqual(fixture.calls.map(row => row.tool), REF_CASES.flatMap(row => ['get_page_snapshot', row.tool]));
  assert.equal(fixture.calls.filter(row => row.tool !== 'get_page_snapshot').every(row => /^e\d+$/.test(row.args.selector)), true);
  assert.deepEqual(fixture.calls.find(row => row.tool === 'check_box').args, { tab_id: 42, selector: 'e5' }, 'Stock checkbox schema has no checked parameter');
});

test('seven observed effects plus native success pass the capability diagnostics', async () => {
  const receipt = await diagnostics({ successful: true }).run();
  assert.equal(receipt.passed, 7); assert.equal(receipt.failed, 0);
  assert.ok(receipt.records.every(row => row.native_success && row.observed_effect));
});

test('unknown native outcomes retain nativefalse even if an independent state observation sees an effect', async () => {
  const receipt = await diagnostics({ unknown: true }).run();
  assert.equal(receipt.passed, 0); assert.equal(receipt.failed, 7);
  assert.equal(receipt.records[0].observed_effect, true); assert.equal(receipt.records[0].native_unknown, true);
  assert.equal(receipt.records[0].native_success, false);
});

test('missing snapshot refs are unavailable evidence, never invented eN calls', async () => {
  const fixture = diagnostics({ unavailable: true }), receipt = await fixture.run();
  assert.equal(receipt.unavailable, 7); assert.equal(fixture.calls.length, 7);
  assert.ok(fixture.calls.every(row => row.tool === 'get_page_snapshot'));
});

test('hover diagnostic distinguishes a synthetic tool event from ambient trusted hover', () => {
  const marker = 'hover', before = initial(marker), after = { ...before, hovered: 1, hover_trusted: 1 };
  assert.equal(evaluatePublicRefDiagnostic({ tool: 'hover', ref: 'e1', before, after, rows: [{ success: true }], nativeSuccess: true, marker }).status, 'failed');
  assert.throws(() => summarizePublicRefCapabilities([]));
});

test('timing admission enforces all limits, requires physical completion, and records the 1.5x serial bound', () => {
  const baseline = { workers: 10, physical_tests_complete: true, queue_expiries: 0, p95_queue_ms: 30_000, p95_tool_roundtrip_ms: 60_000, p95_ui_lease_ms: 1500 };
  assert.equal(assessPublicLevel(baseline, 1000).ok, true);
  for (const change of [{ physical_tests_complete: false }, { queue_expiries: 1 }, { p95_queue_ms: 30_001 }, { p95_tool_roundtrip_ms: 60_001 }, { p95_ui_lease_ms: 1501 }, { p95_ui_lease_ms: null }])
    assert.equal(assessPublicLevel({ ...baseline, ...change }, 1000).ok, false);
  assert.equal(assessPublicLevel(baseline, null).ok, false);
});

test('metrics use complete call duration and one UI lease, without summing nested capture intervals', () => {
  const steps = [{ timing: { lease_requested: { monotonic_ms: 10 }, lease_acquired: { monotonic_ms: 30 }, lease_released: { monotonic_ms: 100 },
    capture_started: { monotonic_ms: 40 }, capture_finished: { monotonic_ms: 90 } } }];
  assert.deepEqual(publicTimingMetrics(steps, [{ roundtrip_ms: 105 }], 0), { queue_expiries: 0, p95_queue_ms: 20, p95_tool_roundtrip_ms: 105, p95_ui_lease_ms: 70 });
});

async function directory(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'fsb-public-gate-')); t.after(() => rm(root, { recursive: true, force: true })); return root;
}
test('official pins are content verified, independently of changed worktree product bytes', async t => {
  const root = await directory(t), file = path.join(root, 'official.js'); await writeFile(file, 'official public bytes');
  const pin = { path: file, sha256: hash('official public bytes'), bytes: 21 };
  assert.equal((await verifyPublicPins({ files: [pin] }))[0].sha256, pin.sha256);
  await writeFile(file, 'modified official bytes'); await assert.rejects(verifyPublicPins([pin]), /Evidence changed/);
});

test('no authorization fails before output, native client or pin access', async t => {
  const root = await directory(t), output = path.join(root, 'not-created');
  await assert.rejects(publicLiveGate({ outputDir: output }), /explicit live authorization/);
  await assert.rejects(stat(output), { code: 'ENOENT' });
});

function cleanupFixture() {
  const guard = 50, common = { adapter_version: 'public-release-guard-v1', guard_tab_id: guard };
  const cleanup = { ok: true, closes: [{ tab_id: 42, ok: true, result: [{ success: true, tabId: 42, closed: true }] }],
    public_guard_drain: { ...common, method: 'public_guard_only_inventory', ok: true, inventory: { tab_ids: [guard] }, task_tab_ids: [] },
    public_guard_disposal: { ...common, method: 'public_exact_guard_close_ack_after_guard_only_inventory', ok: true, closed: true, prior_inventory: { tab_ids: [guard] }, post_close_inventory_requested: false, private_registry_drain_attested: false },
    public_client_shutdown: { ...common, method: 'public_exact_guard_close_ack_after_guard_only_inventory', cleanup_ok: true, client_closed: true, guard_server_closed: true,
      guard_prepared: true, guard_close_attempted: true, guard_disposed: true, post_close_inventory_requested: false } };
  return { cleanup, meta: { public_release: true, profile: 'browser-manual-public-v1', cleanup_ok: true, public_guard: { ...common, ok: true, method: 'public_guard_presence' }, child_cleanup: cleanup } };
}
test('cleanup requires guard-only inventory, exact close acknowledgment and client/server shutdown', async () => {
  const { cleanup, meta } = cleanupFixture(); await verifyPublicCleanup(meta, cleanup, [42, 42]);
  for (const mutate of [c => { c.public_guard_drain.inventory.tab_ids.push(99); }, c => { c.public_guard_disposal.closed = false; }, c => { c.public_client_shutdown.client_closed = false; }, c => { c.closes[0].result[0].tabId = 99; }]) {
    const bad = structuredClone(cleanup); mutate(bad);
    await assert.rejects(verifyPublicCleanup({ ...meta, child_cleanup: bad }, bad, [42]));
  }
});
test('cleanup includes a previously acknowledged actor popup close without demanding a forbidden final post-list', async () => {
  const { cleanup, meta } = cleanupFixture();
  const closed = { tool: 'close_tab', ok: true, args: { tab_id: 43 }, result_text: JSON.stringify({ success: true, tab_id: 43, closed: true }) };
  await verifyPublicCleanup(meta, cleanup, [42, 43], [closed]);
  await assert.rejects(verifyPublicCleanup(meta, cleanup, [42, 43]));
});

function stateStep(id, state, tab = 42) { return { operation_id: id, tool: 'get_text', ok: true, tab_id: tab, args: { selector: '#gate-state' }, result_text: JSON.stringify({ success: true, text: JSON.stringify(state) }) }; }
test('exact fixture goal rechecks the actual operation code and independent before/after state', () => {
  const marker = 'goal', before = initial(marker), after = { ...before, clicks: 1, typed: 'public gate', enters: 1, selected: 'blue', checked: true, hovered: 1, hover_synthetic: 1 };
  const action = { operation_id: 'action', tool: 'execute_js', args: { code: PUBLIC_STATE_SCRIPT } };
  const maps = new Map([[marker, new Map([['before', stateStep('before', before)], ['action', action], ['after', stateStep('after', after)]])]]);
  const sessions = new Map([[marker, { marker }]]), goal = { kind: 'dom_state', task_id: marker, before_operation_id: 'before', action_operation_id: 'action', after_operation_id: 'after' };
  verifyPublicFixtureGoal(goal, maps, sessions);
  action.args.code = PUBLIC_CLICK_SCRIPT; assert.throws(() => verifyPublicFixtureGoal(goal, maps, sessions));
  action.args.code = PUBLIC_STATE_SCRIPT; maps.get(marker).set('after', stateStep('after', { ...after, checked: false }));
  assert.throws(() => verifyPublicFixtureGoal(goal, maps, sessions));
});

async function artifacts(t, { queueOnly = false } = {}) {
  const root = await directory(t), taskId = 'public_unit', rawDir = path.join(root, taskId), exportRoot = path.join(root, 'exports');
  await mkdir(path.join(rawDir, 'shots'), { recursive: true });
  const url = `http://127.0.0.1:32123/fixture?marker=${taskId}&mode=full`, steps = [], emissions = [];
  if (queueOnly) {
    steps.push({ seq: 0, operation_id: 'denied', kind: 'denied', tool: 'open_tab', args: { url },
      error_code: 'BROWSER_QUEUE_TIMEOUT', screenshot_path: null, timing: {}, result_text: JSON.stringify({ success: false, code: 'BROWSER_QUEUE_TIMEOUT' }) });
  } else for (let seq = 0; seq < 3; seq++) {
    const bytes = encodeSolidPng(120, 100, [seq * 40, 70, 90]), pngPath = path.join(rawDir, 'shots', `${seq}.png`);
    await writeFile(pngPath, bytes);
    const receipt = { frame_id: `frame-${seq}`, capture_id: `capture-${seq}`, task_id: taskId, attempt_id: 'unit', tab_id: 42,
      operation_id: `op-${seq}`, source_url: url, sha256: hash(bytes), byte_length: bytes.length, output_width: 120, output_height: 100, model_image_detail: 'original' };
    steps.push({ seq, operation_id: receipt.operation_id, kind: ['bootstrap', 'action', 'read'][seq], tool: ['open_tab', 'execute_js', 'get_text'][seq],
      args: seq === 1 ? { code: PUBLIC_CLICK_SCRIPT } : {}, tab_id: 42, ok: true, url, screenshot_path: pngPath, frame_receipt: receipt });
    if (seq) emissions.push({ frame_id: receipt.frame_id, operation_id: receipt.operation_id, task_id: taskId, tab_id: 42, sha256: receipt.sha256, byte_length: bytes.length, model_image_detail: 'original' });
  }
  await writeFile(path.join(rawDir, 'steps.jsonl'), steps.map(row => JSON.stringify(row)).join('\n') + '\n');
  await writeFile(path.join(rawDir, 'emissions.jsonl'), emissions.map(row => JSON.stringify(row)).join('\n') + (emissions.length ? '\n' : ''));
  const session = { task_id: taskId, marker: taskId, raw_dir: rawDir, export_dir: null };
  if (!queueOnly) {
    await writeFile(path.join(rawDir, 'final.json'), JSON.stringify({ outcome: 'complete', final_answer: 'synthetic' }));
    const exported = await writeV2({ task: { task_id: taskId, confirmed_task: 'Synthetic provenance', website: url, reference_length: 1 }, rawDir, outDir: exportRoot, allowlistPath: PUBLIC_GATE_PROFILE_PATH });
    session.export_dir = exported.dir; session.artifacts = await inspectArtifacts({ rawDir, expectedOrigin: new URL(url).origin, allowedMarkers: [taskId], exportDir: exported.dir });
  }
  return { session, steps, origin: new URL(url).origin };
}
test('saved public images, original emission identities and byte-identical trajectory export are independently revalidated', async t => {
  const { session, steps, origin } = await artifacts(t);
  assert.equal((await verifyPublicSessionArtifacts(session, origin)).steps.length, 3);
  const file = path.join(session.export_dir, 'trajectory', '0000.png');
  const exported = JSON.parse(await readFile(path.join(session.export_dir, 'result.json'), 'utf8'));
  const actualFile = path.join(session.export_dir, 'trajectory', exported.action_history[0].screenshot);
  await writeFile(actualFile, encodeSolidPng(120, 100, [1, 2, 3]));
  await assert.rejects(verifyPublicSessionArtifacts(session, origin), /Export did not retain/);
  assert.ok(file); assert.ok(steps);
});
test('omitting both image acknowledgment and receipt identity cannot pass saved evidence', async t => {
  const { session, origin } = await artifacts(t);
  await writeFile(path.join(session.raw_dir, 'emissions.jsonl'), '');
  await assert.rejects(verifyPublicSessionArtifacts(session, origin));
});
test('only a proven non-dispatch queue denial can retain a missing local export; corrupt pixels remain hard failure', async t => {
  const { session, origin } = await artifacts(t, { queueOnly: true });
  await verifyPublicSessionArtifacts(session, origin);
  const stepsFile = path.join(session.raw_dir, 'steps.jsonl'), rows = (await readFile(stepsFile, 'utf8')).trim().split('\n').map(JSON.parse);
  rows[0].error_code = 'SCREENSHOT_CAPTURE_FAILED'; rows[0].timing.capture_started = { monotonic_ms: 1 };
  await writeFile(stepsFile, rows.map(JSON.stringify).join('\n') + '\n');
  await assert.rejects(verifyPublicSessionArtifacts(session, origin));
});
test('resume verifier binds explicit public command before trusting any saved capability aggregate', async () => {
  await assert.rejects(verifyPublicLocalGateEvidence({ version: 'public-local-gate-v1', public_release: true, profile: 'browser-manual-public-v1', output_dir: '/tmp/gate', command_sha256: hash('[]') },
    { gateDir: '/tmp/gate', serverCommand: ['different', 'public'] }));
});

test('whole public gate admits a valid stdio-only rig with seven native ref failures, then independently rejects altered raw evidence', async t => {
  const root = await directory(t), native = fileURLToPath(new URL('./fixtures/public-gate-native.mjs', import.meta.url));
  const bytes = await readFile(native), pins = [{ path: native, sha256: hash(bytes), bytes: bytes.length }], command = [process.execPath, native];
  const outputDir = path.join(root, 'gate'), summary = await publicLiveGate({ liveAuthorized: true, outputDir, command, publicPins: pins });
  assert.equal(summary.ok, true, summary.error); assert.equal(summary.cleanup_ok, true); assert.equal(summary.correctness_ok, true);
  assert.equal(summary.compact_ref_capabilities.failed, 7); assert.equal(summary.sessions.length, 21);
  assert.deepEqual(summary.concurrency.map(level => level.workers), [1, 2, 5, 10]); assert.ok(summary.passed_levels.includes(1));
  const verified = await verifyPublicLocalGateEvidence(summary, { gateDir: outputDir, serverCommand: command, publicPins: pins });
  assert.equal(verified.ok, true); assert.ok(verified.physical_frames > 50);
  const stepFile = path.join(summary.sessions[0].raw_dir, 'steps.jsonl'); await writeFile(stepFile, (await readFile(stepFile, 'utf8')) + '\n');
  await assert.rejects(verifyPublicLocalGateEvidence(summary, { gateDir: outputDir, serverCommand: command, publicPins: pins }), /Raw\/export tree changed/);
});

test('an actual native capture failure in the isolated healthy-fixture protocol cannot be waived as a capability limitation', async t => {
  const root = await directory(t), native = fileURLToPath(new URL('./fixtures/public-gate-native.mjs', import.meta.url));
  const bytes = await readFile(native), pins = [{ path: native, sha256: hash(bytes), bytes: bytes.length }];
  const summary = await publicLiveGate({ liveAuthorized: true, outputDir: path.join(root, 'failed-gate'), command: [process.execPath, native, '--capture-failure'], publicPins: pins });
  assert.equal(summary.ok, false); assert.equal(summary.correctness_ok, false); assert.equal(summary.concurrency.length, 0);
  assert.equal(summary.sessions.length, 1); assert.equal(summary.sessions[0].export_dir, null);
});
