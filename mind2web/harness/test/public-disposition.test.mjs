import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyPublicDisposition, publicAttemptBlocker } from '../public-disposition.mjs';
import { encodeSolidPng } from '../png.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const text = value => JSON.stringify(value, null, 2) + '\n';
const at = second => `2026-10-19T01:00:${String(second).padStart(2, '0')}.000Z`;
const adapter = 'public-release-guard-v1';
const inventory = second => ({ at: at(second), tab_ids: [11], scope_identity_observed: false, continuity_check: second + 1 });

async function fixture(t, edit = () => {}) {
  const rawDir = await mkdtemp(path.join(tmpdir(), 'public-disposition-test-'));
  t.after(() => rm(rawDir, { recursive: true, force: true }));
  const png = encodeSolidPng(120, 110, [20, 40, 80]), source = 'http://127.0.0.1:45821/fixture-guard';
  const response = { isError: true, content: [{ type: 'text', text: JSON.stringify({ success: false,
    code: 'SCREENSHOT_CAPTURE_FAILED', error: 'Known settled native fixture capture error', retryable: false }) }] };
  const fault = { code: 'CAPTURE_FAILED', error: 'Known settled native fixture capture error', seq: 1 };
  const preparation = { ok: true, adapter_version: adapter, method: 'public_guard_presence', guard_tab_id: 11,
    source_url: source, inventory: inventory(0), scope_identity_observed: false };
  const drain = { ok: true, adapter_version: adapter, method: 'public_guard_only_inventory', guard_tab_id: 11,
    task_tab_ids: [], inventory: inventory(4), at: at(4) };
  const disposal = { ok: true, adapter_version: adapter, method: 'public_exact_guard_close_ack_after_guard_only_inventory',
    guard_tab_id: 11, closed: true, at: at(8), prior_inventory: inventory(7), scope_identity_observed: false,
    post_close_inventory_requested: false, private_registry_drain_attested: false };
  const cleanup = { public_release: true, started_at: at(3), ended_at: at(9), ok: true, cleanup_ok: true,
    closes: [{ tab_id: 22, ok: true, result: [{ success: true, tool: 'close_tab', tabId: 22, closed: true }] }],
    lists: [{ at: at(3), tab_ids: [22] }, { at: at(4), tab_ids: [] }],
    public_guard_drain: drain, public_guard_disposal: disposal,
    public_client_shutdown: { ...structuredClone(disposal), cleanup_ok: true, client_closed: true, guard_server_closed: true,
      guard_prepared: true, guard_close_attempted: true, guard_disposed: true, no_guard_open_requested: false } };
  const health = { ok: true, adapter_version: adapter, method: 'public_guard_native_capture', guard_id: 11, guard_tab_id: 11,
    started_at: at(5), ended_at: at(6), read_verified: true, native_metadata_verified: true, not_actor_frame: true,
    model_calls: 0, task_actions_replayed: 0, sha256: sha(png), byte_length: png.length, output_width: 120, output_height: 110,
    before_inventory: inventory(5), after_inventory: inventory(6),
    metadata: { sha256: sha(png), byte_length: png.length, output_width: 120, output_height: 110,
      source_url: source, capture_id: 'independent-health-capture', timestamp: at(5), mode: 'viewport',
      css_rect: { x: 0, y: 0, width: 120, height: 110 }, effective_emulation: { device_mode: 'current', device_scale_factor: 1 } },
    png: { path: path.join(rawDir, 'public-health.png'), bytes: png.length, sha256: sha(png), width: 120, height: 110 } };
  const step = { operation_id: 'failed-capture-operation', seq: 1, kind: 'action', tool: 'click', tab_id: 22,
    execution_outcome: 'reported_success', started_at: at(1), ended_at: at(2), screenshot_path: null, frame_receipt: null,
    timing: { capture_started: { utc: at(1), monotonic_ms: 1000 }, capture_finished: { utc: at(2), monotonic_ms: 2000 } },
    native_capture_result: response };
  const final = { outcome: 'capture_failure', cleanup_ok: true, uncertain_upstream: false, queue_expiries: 0, fault,
    public_disposition: { version: 1, kind: 'public_native_failure', native_result_verified: true, cleanup_verified: true,
      health_verified: true, missing_frame: true, effect_unknown: false, original_fault: structuredClone(fault),
      native_error: { tool: 'capture_screenshot', operation_id: step.operation_id, code: 'SCREENSHOT_CAPTURE_FAILED' } } };
  const f = { rawDir, png, response, step, cleanup, health, preparation, final };
  await edit(f);
  await writeFile(path.join(rawDir, 'steps.jsonl'), JSON.stringify(step) + '\n');
  await writeFile(health.png.path, png);
  for (const [key, name, value] of [['cleanup_evidence', 'childcleanup.json', cleanup], ['health_evidence', 'public-health.json', health]]) {
    const bytes = Buffer.from(text(value)), file = path.join(rawDir, name); await writeFile(file, bytes);
    final.public_disposition[key] = { path: file, bytes: bytes.length, sha256: sha(bytes) };
  }
  final.public_disposition.native_error.response_sha256 = sha(JSON.stringify(step.native_capture_result));
  await writeFile(path.join(rawDir, 'proxy-meta.json'), text({ public_release: true, public_guard: preparation,
    public_disposition: final.public_disposition, cleanup_ok: true, uncertain_upstream: false,
    queue_expiries: 0, task_dispatch_halted: true }));
  return f;
}

test('a saved native capture failure is accepted only with separate guard PNG and exact cleanup evidence', async t => {
  const f = await fixture(t);
  const verified = await verifyPublicDisposition(f.rawDir, f.final);
  assert.equal(verified.kind, 'public_native_failure'); assert.equal(verified.missing_frame, true);
  assert.equal(verified.goal_state, 'unknown_without_terminal_evidence');
  assert.equal(await publicAttemptBlocker({ state: 'finished', raw_dir: f.rawDir, final: f.final }, { publicRelease: true }), false);
  assert.equal(await publicAttemptBlocker({ state: 'finished', raw_dir: f.rawDir, final: f.final }), true);
  assert.equal(f.step.screenshot_path, null, 'Independent guard health must never substitute for the missing actor frame');
});

test('the original fault is compared structurally and cannot be replaced', async t => {
  const f = await fixture(t, f => { f.final.public_disposition.original_fault = { seq: 1, error: f.final.fault.error, code: 'CAPTURE_FAILED' }; });
  assert.ok(await verifyPublicDisposition(f.rawDir, f.final));
  f.final.public_disposition.original_fault.code = 'different';
  await assert.rejects(verifyPublicDisposition(f.rawDir, f.final));
});

test('action-effect uncertainty and fault identity stay bound to the actual failed operation', async t => {
  const uncertain = await fixture(t, f => { f.step.execution_outcome = 'unknown'; f.final.public_disposition.effect_unknown = true; });
  assert.equal((await verifyPublicDisposition(uncertain.rawDir, uncertain.final)).effect_unknown, true);
  const hidden = await fixture(t, f => { f.step.execution_outcome = 'unknown'; });
  await assert.rejects(verifyPublicDisposition(hidden.rawDir, hidden.final));
  const wrongFault = await fixture(t, f => { f.final.fault.seq = 2; f.final.public_disposition.original_fault.seq = 2; });
  await assert.rejects(verifyPublicDisposition(wrongFault.rawDir, wrongFault.final));
});

test('authoritative native failure cannot be replaced with ownership/global/pending or malformed responses', async t => {
  const edits = {
    'non-error envelope': f => { delete f.response.isError; },
    'ownership rejection': f => { f.final.public_disposition.native_error.code = 'TAB_NOT_OWNED';
      f.response.content[0].text = JSON.stringify({ success: false, code: 'TAB_NOT_OWNED' }); },
    'hidden cleanup pending': f => { const row = JSON.parse(f.response.content[0].text); row.cleanup_pending = true; f.response.content[0].text = JSON.stringify(row); },
    'global fault in error text': f => { const row = JSON.parse(f.response.content[0].text); row.error = 'extension_not_connected'; f.response.content[0].text = JSON.stringify(row); },
    'malformed extra result': f => { f.response.content.push({ type: 'text', text: 'Unparsed native failure' }); },
    'extra unknown resource': f => { f.response.content.push({ type: 'resource', resource: { uri: 'fixture:unknown' } }); },
  };
  for (const [name, edit] of Object.entries(edits)) await t.test(name, async t => {
    const f = await fixture(t, edit); await assert.rejects(verifyPublicDisposition(f.rawDir, f.final));
  });
});

test('a missing actor frame cannot be filled by a substitute or duplicated operation row', async t => {
  const f = await fixture(t, f => { f.step.screenshot_path = f.health.png.path; });
  await assert.rejects(verifyPublicDisposition(f.rawDir, f.final));
  const other = await fixture(t); await writeFile(path.join(other.rawDir, 'steps.jsonl'), (JSON.stringify(other.step) + '\n').repeat(2));
  await assert.rejects(verifyPublicDisposition(other.rawDir, other.final));
});

test('guard cleanup requires the exact adapter method, positive causal ID and acknowledged shutdown', async t => {
  const edits = {
    'unverified client': f => { f.cleanup.public_client_shutdown.client_closed = false; },
    'wrong drain method': f => { f.cleanup.public_guard_drain.method = 'assumed_empty'; },
    'wrong adapter version': f => { f.cleanup.public_guard_disposal.adapter_version = 'unknown'; },
    'invented private proof': f => { f.cleanup.public_guard_disposal.private_registry_drain_attested = true; },
    'missing real guard preparation': f => { f.cleanup.public_client_shutdown.guard_prepared = false; },
    'no actual guard close attempt': f => { f.cleanup.public_client_shutdown.guard_close_attempted = false; },
    'failed task close': f => { f.cleanup.closes[0].ok = false; },
  };
  for (const [name, edit] of Object.entries(edits)) await t.test(name, async t => {
    const f = await fixture(t, edit); await assert.rejects(verifyPublicDisposition(f.rawDir, f.final));
  });
});

test('independent guard health must identify the same prepared local fixture and be fresh before disposal', async t => {
  const edits = {
    'foreign website image': f => { f.health.metadata.source_url = 'https://unrelated.test/'; },
    'different loopback fixture': f => { f.health.metadata.source_url = 'http://127.0.0.1:45821/other-fixture'; },
    'stale health before failure': f => { f.health.started_at = at(0); f.health.ended_at = at(1); f.health.metadata.timestamp = at(0); },
    'health after guard disposal': f => { f.health.ended_at = at(9); },
    'emulated health': f => { f.health.metadata.effective_emulation.device_mode = 'mobile'; },
    'model-driven control': f => { f.health.model_calls = 1; },
    'replayed task action': f => { f.health.task_actions_replayed = 1; },
  };
  for (const [name, edit] of Object.entries(edits)) await t.test(name, async t => {
    const f = await fixture(t, edit); await assert.rejects(verifyPublicDisposition(f.rawDir, f.final));
  });
});

test('changed, missing and symlinked saved health artifacts are rejected', async t => {
  const changed = await fixture(t); await writeFile(changed.health.png.path, encodeSolidPng(120, 110, [80, 40, 20]));
  await assert.rejects(verifyPublicDisposition(changed.rawDir, changed.final));
  const missing = await fixture(t); await rm(path.join(missing.rawDir, 'public-health.json'));
  await assert.rejects(verifyPublicDisposition(missing.rawDir, missing.final));
  const linked = await fixture(t), png = await readFile(linked.health.png.path), alternate = path.join(linked.rawDir, 'alternate.png');
  await writeFile(alternate, png); await rm(linked.health.png.path); await symlink(alternate, linked.health.png.path);
  await assert.rejects(verifyPublicDisposition(linked.rawDir, linked.final), /symlink/);
});

test('in-flight, uncertain, or uncleared cleanup state remains blocked', async t => {
  const f = await fixture(t);
  for (const attempt of [
    { state: 'running', raw_dir: f.rawDir, final: f.final },
    { state: 'finished', raw_dir: f.rawDir, final: { ...f.final, uncertain_upstream: true } },
    { state: 'finished', raw_dir: f.rawDir, final: { ...f.final, cleanup_ok: false } },
  ]) assert.equal(await publicAttemptBlocker(attempt, { publicRelease: true }), true);
});

test('settled public capture refusals of any code or diagnostic text classify as native failures; ambiguity does not', async () => {
  const { publicNativeCaptureFailure } = await import('../public-disposition.mjs');
  const failure = (...texts) => ({ isError: true, content: texts.map(text => ({ type: 'text', text })) });
  assert.equal(publicNativeCaptureFailure(failure(JSON.stringify({ success: false, code: 'SCREENSHOT_DEBUGGER_BUSY', error: 'busy' }))).code, 'SCREENSHOT_DEBUGGER_BUSY');
  assert.equal(publicNativeCaptureFailure(failure('Detected: Page responsiveness\nWhy: The current page did not respond before the page-read deadline.\nNext action: Use navigate.')).code, 'PAGE_UNRESPONSIVE');
  assert.equal(publicNativeCaptureFailure(failure('Detected: JavaScript dialog\nWhy: A dialog blocks capture.\nNext action: Dismiss it.')).code, 'PUBLIC_CAPTURE_FAILED');
  assert.equal(publicNativeCaptureFailure(failure('Something unparsed')), null);
  assert.equal(publicNativeCaptureFailure(failure(JSON.stringify({ success: false, code: 'X', cleanup_pending: true }))), null);
  assert.equal(publicNativeCaptureFailure(failure(JSON.stringify({ success: false, error: 'extension_not_connected' }))), null);
  assert.equal(publicNativeCaptureFailure(failure(JSON.stringify({ success: true }))), null);
  assert.equal(publicNativeCaptureFailure({ content: [{ type: 'text', text: '{"success":false}' }] }), null, 'not an isError result');
});
