import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ManualRecordingProxy } from '../manual-recording-proxy.mjs';
import { encodeSolidPng } from '../png.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const rows = file => readFile(file, 'utf8').then(text => text.trim().split('\n').map(JSON.parse));

async function fixture(t, { captureInitial = true } = {}) {
  const rawDir = await mkdtemp(path.join(tmpdir(), 'original-frame-emission-'));
  t.after(() => rm(rawDir, { recursive: true, force: true }));
  const png = encodeSolidPng(120, 90, [20, 40, 60]), faults = [], tabs = new Map();
  const proxy = new ManualRecordingProxy({ command: ['unused'], rawDir, startUrl: 'https://fixture.test/',
    taskId: 'task-one', attemptId: 'attempt-one', onFault: fault => faults.push(fault),
    upstream: { async request(method, params) {
      assert.equal(method, 'tools/call');
      const reply = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
      if (params.name === 'list_tabs') return reply({ success: true, tabs: [...tabs.values()] });
      if (params.name === 'open_tab') { tabs.set(11, { id: 11, url: params.arguments.url }); return reply({ success: true, tabId: 11 }); }
      if (params.name === 'switch_tab') return reply({ success: true, tabId: params.arguments.tabId });
      if (params.name === 'read_page') return reply({ success: true, content: 'Recorded fixture state' });
      assert.equal(params.name, 'capture_screenshot');
      return { content: [{ type: 'text', text: JSON.stringify({ capture_id: 'capture-' + params.arguments.tab_id,
        source_url: 'https://fixture.test/', timestamp: '2026-10-18T00:00:00.000Z', mode: 'viewport',
        css_rect: { x: 0, y: 0, width: 120, height: 90 }, output_width: 120, output_height: 90,
        byte_length: png.length, sha256: digest(png), effective_emulation: { device_mode: 'current', device_scale_factor: 1 } }) },
      { type: 'image', mimeType: 'image/png', data: png.toString('base64') }] };
    } } });
  await proxy.ready;
  async function capture(tabId = 11, seq = 0) {
    tabs.set(tabId, { id: tabId, url: 'https://fixture.test/' });
    proxy.session.registerOpenedTab(tabId);
    const observation = await proxy.observations.captureOnce({ operationId: 'operation-' + seq, seq, tabId, timing: {} });
    const receipt = observation.receipt;
    proxy.pendingVerification.set(tabId, 'prior-unknown-action');
    proxy.verificationObservations.set(receipt.operation_id, tabId);
    const result = { content: [{ type: 'text', text: JSON.stringify({ success: true }) },
      { type: 'text', text: JSON.stringify({ observation: receipt }) }, observation.image] };
    return { observation, receipt, result };
  }
  const captured = captureInitial ? await capture() : {};
  const context = { request_id: 7, gateway_request_id: 'gateway-one', operation_ids: captureInitial ? [captured.receipt.operation_id] : [],
    returned_observations: captureInitial ? [structuredClone(captured.receipt)] : [],
    signal: new AbortController().signal, now: Date.now, operation_deadline_epoch_ms: Date.now() + 60_000,
    received: { epoch_ms: 1 }, dispatched: { epoch_ms: 2 }, finished: { epoch_ms: 3 }, queue_wait_ms: 1 };
  return { proxy, rawDir, png, faults, context, capture, ...captured };
}

function editReceipt(result, edit) {
  const block = result.content.find(block => block.type === 'text' && JSON.parse(block.text).observation);
  const value = JSON.parse(block.text); edit(value.observation); block.text = JSON.stringify(value);
}

test('valid original native PNG is acknowledged with unchanged bytes even on an MCP error result', async t => {
  for (const isError of [false, true]) await t.test(String(isError), async t => {
    const f = await fixture(t); f.result.isError = isError;
    const before = JSON.stringify(f.result);
    await f.proxy.noteEmitted(f.result, f.context);
    assert.equal(JSON.stringify(f.result), before, 'Acknowledgment must not rewrite the MCP result');
    assert.deepEqual(await readFile(f.receipt.screenshot_path), f.png);
    assert.ok(f.receipt.emitted_at);
    assert.equal(f.proxy.pendingVerification.has(11), false);
    assert.equal(f.proxy.verificationObservations.has(f.receipt.operation_id), false);
    assert.equal(f.proxy.scheduler.halted, null); assert.deepEqual(f.faults, []);
    const [emission] = await rows(path.join(f.rawDir, 'emissions.jsonl'));
    assert.equal(emission.sha256, digest(f.png)); assert.equal(emission.byte_length, f.png.length);
    assert.equal(emission.model_image_detail, 'original');
    assert.equal(emission.frame_id, f.receipt.frame_id); assert.equal(emission.operation_id, f.receipt.operation_id);
    assert.equal(emission.gateway_request_id, 'gateway-one'); assert.equal(emission.request_id, 7);
    assert.match(emission.delivery, /socket writer; model processing is unobserved/);
  });
});

test('invalid original-frame response halts and persists a fault without acknowledging or clearing verification', async t => {
  const cases = {
    'missing native original metadata': f => { delete f.result.content.at(-1)._meta; },
    'changed native original metadata': f => { f.result.content.at(-1)._meta['codex/imageDetail'] = 'high'; },
    'missing original marker on recorded receipt': f => { delete f.receipt.model_image_detail; editReceipt(f.result, r => { delete r.model_image_detail; }); },
    'tampered valid PNG bytes': f => { f.result.content.at(-1).data = encodeSolidPng(120, 90, [90, 80, 70]).toString('base64'); },
    'invalid base64': f => { f.result.content.at(-1).data += '!'; },
    'wrong native MIME': f => { f.result.content.at(-1).mimeType = 'image/jpeg'; },
    'wrong frame identity': f => editReceipt(f.result, r => { r.frame_id = 'foreign-frame'; }),
    'wrong operation identity': f => editReceipt(f.result, r => { r.operation_id = 'foreign-operation'; }),
    'wrong attempt identity': f => editReceipt(f.result, r => { r.attempt_id = 'foreign-attempt'; }),
    'wrong operation request binding': f => { f.context.operation_ids = ['other-operation']; },
    'missing native image': f => { f.result.content.pop(); },
    'image without observation': f => { f.result.content.splice(1, 1); },
    'extra native image': f => { f.result.content.push(structuredClone(f.result.content.at(-1))); },
    'duplicate receipt and image': f => { f.result.content.push(...structuredClone(f.result.content.slice(1))); },
    'image-shaped JSON text is not a native image': f => { const image = f.result.content.pop(); f.result.content.push({ type: 'text', text: JSON.stringify(image) }); },
  };
  for (const [name, change] of Object.entries(cases)) await t.test(name, async t => {
    const f = await fixture(t); change(f);
    await assert.rejects(f.proxy.noteEmitted(f.result, f.context), { code: 'EMISSION_FRAME_INVALID' });
    assert.equal(f.receipt.emitted_at, null);
    assert.equal(f.proxy.pendingVerification.get(11), 'prior-unknown-action');
    assert.equal(f.proxy.verificationObservations.get(f.receipt.operation_id), 11);
    assert.ok(f.proxy.scheduler.halted); assert.equal(f.faults.length, 1);
    assert.equal(f.proxy.meta.fault.code, 'EMISSION_FRAME_INVALID');
    assert.equal(JSON.parse(await readFile(path.join(f.rawDir, 'proxy-meta.json'))).fault.code, 'EMISSION_FRAME_INVALID');
    await assert.rejects(stat(path.join(f.rawDir, 'emissions.jsonl')), { code: 'ENOENT' });
  });
});

test('all frames are validated before any frame in the response is acknowledged', async t => {
  const f = await fixture(t), second = await f.capture(12, 1);
  f.context.operation_ids.push(second.receipt.operation_id);
  f.context.returned_observations.push(structuredClone(second.receipt));
  f.result.content.push(...second.result.content.slice(1));
  f.result.content.at(-1).data = encodeSolidPng(120, 90, [1, 2, 3]).toString('base64');
  await assert.rejects(f.proxy.noteEmitted(f.result, f.context), { code: 'EMISSION_FRAME_INVALID' });
  for (const receipt of [f.receipt, second.receipt]) {
    assert.equal(receipt.emitted_at, null); assert.equal(f.proxy.pendingVerification.has(receipt.tab_id), true);
    assert.equal(f.proxy.verificationObservations.has(receipt.operation_id), true);
  }
  await assert.rejects(stat(path.join(f.rawDir, 'emissions.jsonl')), { code: 'ENOENT' });
});

test('journal failure retains the evidence-failure code and never acknowledges a valid image', async t => {
  const f = await fixture(t); await mkdir(path.join(f.rawDir, 'emissions.jsonl'));
  await assert.rejects(f.proxy.noteEmitted(f.result, f.context), { code: 'EMISSION_EVIDENCE_FAILED' });
  assert.equal(f.receipt.emitted_at, null); assert.equal(f.proxy.pendingVerification.has(11), true);
  assert.equal(f.proxy.verificationObservations.has(f.receipt.operation_id), true);
  assert.equal(f.faults[0].code, 'EMISSION_EVIDENCE_FAILED'); assert.ok(f.proxy.scheduler.halted);
  assert.equal(JSON.parse(await readFile(path.join(f.rawDir, 'proxy-meta.json'))).fault.code, 'EMISSION_EVIDENCE_FAILED');
});

test('a legitimate no-frame error does not invent emission evidence or clear pending verification', async t => {
  const f = await fixture(t);
  const context = { ...f.context, operation_ids: [], returned_observations: [] };
  await f.proxy.noteEmitted({ isError: true, content: [{ type: 'text', text: '{"success":false,"code":"NOT_EXECUTED"}' }] }, context);
  assert.equal(f.receipt.emitted_at, null); assert.equal(f.proxy.pendingVerification.has(11), true);
  assert.equal(f.proxy.verificationObservations.has(f.receipt.operation_id), true);
  assert.deepEqual(f.faults, []); assert.equal(f.proxy.scheduler.halted, null);
  await assert.rejects(stat(path.join(f.rawDir, 'emissions.jsonl')), { code: 'ENOENT' });
});

test('the actual recorded request binds its expected observation even if both returned blocks disappear', async t => {
  const f = await fixture(t, { captureInitial: false });
  const result = await f.proxy.handle('tools/call', { name: 'read_page', arguments: {} }, f.context);
  const current = f.proxy.session.latestFrame(11);
  assert.equal(f.context.operation_ids.length, 2, 'Bootstrap and the requested read have separate operations');
  assert.equal(f.context.returned_observations.length, 1, 'Only the returned read observation is expected');
  assert.equal(f.context.returned_observations[0].frame_id, current.frame_id);
  assert.notEqual(f.context.returned_observations[0], current, 'Expected identity must be an independent snapshot');
  f.proxy.pendingVerification.set(11, 'prior-unknown-action');
  result.content = result.content.filter(block => block.type === 'text' && !JSON.parse(block.text).observation);
  await assert.rejects(f.proxy.noteEmitted(result, f.context), { code: 'EMISSION_FRAME_INVALID' });
  assert.equal(current.emitted_at, null); assert.equal(f.proxy.pendingVerification.get(11), 'prior-unknown-action');
  assert.equal(f.proxy.verificationObservations.has(current.operation_id), true);
  assert.equal(f.proxy.meta.fault.code, 'EMISSION_FRAME_INVALID'); assert.ok(f.proxy.scheduler.halted);
  await assert.rejects(stat(path.join(f.rawDir, 'emissions.jsonl')), { code: 'ENOENT' });
});

test('first research inventory leaves its intentionally unreturned bootstrap frame unacknowledged', async t => {
  const f = await fixture(t, { captureInitial: false });
  const result = await f.proxy.handle('tools/call', { name: 'list_tabs', arguments: {} }, f.context);
  const bootstrap = f.proxy.session.latestFrame(11);
  assert.ok(f.context.operation_ids.includes(bootstrap.operation_id));
  assert.deepEqual(f.context.returned_observations, []);
  await f.proxy.noteEmitted(result, f.context);
  assert.equal(bootstrap.emitted_at, null); assert.deepEqual(f.faults, []); assert.equal(f.proxy.scheduler.halted, null);
  await assert.rejects(stat(path.join(f.rawDir, 'emissions.jsonl')), { code: 'ENOENT' });
});
