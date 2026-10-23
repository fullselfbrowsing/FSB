import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startTaskGateway } from '../task-gateway.mjs';
import { ManualRecordingProxy } from '../manual-recording-proxy.mjs';
import { encodeSolidPng } from '../png.mjs';
import { sha256 } from '../observation-recorder.mjs';
import { resultData, resultOK } from '../mcp-record-proxy.mjs';

const { TOOL_REGISTRY } = createRequire(import.meta.url)('../../../extension/ai/tool-definitions.js');
const reply = data => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const pause = () => new Promise(resolve => setTimeout(resolve, 1));
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!await predicate()) { if (Date.now() > deadline) throw new Error('Fixture condition did not settle'); await pause(); }
}
class FakeClock {
  constructor() { this.value = 1_800_000_000_000; this.start = this.value; this.timers = new Set(); }
  now = () => this.value;
  clock = () => ({ utc: new Date(this.value).toISOString(), monotonic_ms: this.value - this.start });
  setTimeout = (fn, delay) => { const timer = { at: this.value + delay, fn }; this.timers.add(timer); return timer; };
  clearTimeout = timer => this.timers.delete(timer);
  advance(ms) {
    const end = this.value + ms;
    while (true) {
      const next = [...this.timers].filter(timer => timer.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.value = next.at; this.timers.delete(next); next.fn();
    }
    this.value = end;
  }
}
class BrowserDouble {
  constructor() { this.log = []; this.tabs = new Map(); this.hooks = new Map(); this.next = 50; this.captures = 0; }
  async request(method, params = {}, options) {
    const name = method === 'tools/call' ? params.name : method, args = params.arguments ?? {};
    this.log.push({ method, name, args, timeout_ms: options?.timeoutMs });
    const replacement = await this.hooks.get(name)?.(args, options);
    if (replacement !== undefined) return replacement;
    if (method === 'initialize') return { capabilities: {} };
    if (method === 'tools/list') return { tools: TOOL_REGISTRY };
    if (method !== 'tools/call') return {};
    const id = args.tab_id ?? args.tabId;
    if (name === 'list_tabs') return reply({ success: true, tabs: [...this.tabs.values()].map(tab => ({ id: tab.id })) });
    if (name === 'open_tab') { const tab = { id: ++this.next, url: args.url }; this.tabs.set(tab.id, tab); this.active = tab.id; return reply({ success: true, tabId: tab.id }); }
    if (name === 'switch_tab') { assert.ok(this.tabs.has(id)); this.active = id; return reply({ success: true, tabId: id }); }
    if (name === 'close_tab') { this.tabs.delete(id); return reply({ success: true }); }
    const tab = this.tabs.get(id); assert.ok(tab, 'Only task-owned tabs reach the browser double');
    if (name === 'capture_screenshot') {
      assert.equal(this.active, id); const bytes = encodeSolidPng(100, 100); this.captures++;
      return { content: [{ type: 'text', text: JSON.stringify({ capture_id: `capture-${this.captures}`, source_url: tab.url,
        timestamp: new Date().toISOString(), mode: 'viewport', css_rect: { x: 0, y: 0, width: 100, height: 100 },
        output_width: 100, output_height: 100, byte_length: bytes.length, sha256: sha256(bytes),
        effective_emulation: { device_mode: 'current', device_scale_factor: 1 } }) },
      { type: 'image', mimeType: 'image/png', data: bytes.toString('base64') }] };
    }
    return reply({ success: true, content: 'Current fixture state' });
  }
  notify() {}
  async close() { this.closed = true; }
}
async function connect(socketPath) {
  const socket = createConnection(socketPath); await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
  const lines = createInterface({ input: socket }), pending = new Map(), messages = []; let next = 0;
  lines.on('line', line => { const message = JSON.parse(line); messages.push(message); const held = pending.get(message.id);
    if (held) { pending.delete(message.id); held.resolve(message); } });
  const request = (method, params = {}, id = ++next) => {
    const held = deferred(); pending.set(id, held); socket.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return { id, response: held.promise, result: held.promise.then(message => { if (message.error) throw new Error(message.error.message); return message.result; }) };
  };
  return { request, messages, call: (name, args = {}) => request('tools/call', { name, arguments: args }),
    cancel(id) { socket.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id } }) + '\n'); },
    close() { lines.close(); socket.destroy(); } };
}
async function fixture(t, extra = {}) {
  const rawDir = await mkdtemp(path.join(tmpdir(), 'task-gateway-test-')), upstream = new BrowserDouble(), clock = new FakeClock();
  const holds = [], clients = [];
  const gateway = await startTaskGateway({ ProxyClass: ManualRecordingProxy, command: ['fake'], rawDir, upstream,
    startUrl: 'https://fixture.test/', gatewayNow: clock.now, gatewayClock: clock.clock,
    gatewaySetTimeout: clock.setTimeout, gatewayClearTimeout: clock.clearTimeout, ...extra });
  await gateway.initialize();
  const actor = await connect(gateway.socketPath); clients.push(actor);
  t.after(async () => {
    holds.forEach(hold => hold.resolve()); clients.forEach(client => client.close());
    if (extra.expectedCloseError) await assert.rejects(gateway.close(), extra.expectedCloseError);
    else await gateway.close();
    await rm(rawDir, { recursive: true, force: true });
  });
  const rows = async file => { try { return (await readFile(path.join(rawDir, file), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } };
  return { gateway, proxy: gateway.proxy, actor, upstream, clock, rawDir, rows,
    hold(name, replacement) { const entered = deferred(), release = deferred(); holds.push(release); upstream.hooks.set(name, async () => { entered.resolve(); await release.promise; return replacement; }); return { entered: entered.promise, release: () => release.resolve() }; },
    async connect() { const client = await connect(gateway.socketPath); clients.push(client); return client; } };
}

test('queued cancellation is immediate, charged once, logged with args, and never bootstraps or dispatches later', async t => {
  const f = await fixture(t), blocked = f.hold('tools/list');
  const first = f.actor.request('tools/list'); await blocked.entered;
  const queued = f.actor.call('click', { selector: 'e7' }); await until(() => f.proxy.meta.counts.actions === 1);
  f.actor.cancel(queued.id); const rejected = resultData(await queued.result)[0];
  assert.equal(rejected.code, 'GATEWAY_CANCELLED'); assert.equal(rejected.execution_outcome, 'not_executed');
  assert.equal(f.proxy.boot, undefined); assert.equal(f.upstream.log.some(row => row.method === 'tools/call'), false);
  const rows = await f.rows('gateway-rejections.jsonl'); assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].args, { selector: 'e7' }); assert.equal(rows[0].budget_charged, true);
  f.actor.cancel(queued.id); f.clock.advance(61_000); blocked.release(); await first.result;
  await until(async () => (await f.rows('gateway-requests.jsonl')).some(row => row.event === 'finished' && row.request_id === first.id));
  assert.equal(f.proxy.meta.counts.actions, 1); assert.equal(f.upstream.log.some(row => row.name === 'click' || row.name === 'open_tab'), false);
  assert.equal((await f.rows('gateway-rejections.jsonl')).length, 1);
});
test('an emission acknowledgement failure halts dispatch while retaining and closing owned evidence', async t => {
  const faults = [];
  const f = await fixture(t, { expectedCloseError: /Emission acknowledgement fixture/, onFault: fault => faults.push(fault) });
  f.proxy.noteEmitted = async () => { throw new Error('Emission acknowledgement fixture'); };
  const response = await f.actor.call('read_page').result;
  assert.ok(response.content.some(row => row.type === 'image'));
  await until(() => f.proxy.scheduler.halted);
  assert.equal(resultData(await f.actor.call('click', { selector: 'e1' }).result)[0].code, 'BROWSER_HALTED');
  assert.equal(f.upstream.log.filter(row => row.name === 'click').length, 0);
  assert.ok(faults.some(row => row.code === 'GATEWAY_EVIDENCE_FAILED'));
  assert.ok(!(await f.rows('gateway-requests.jsonl')).some(row => row.event === 'emitted'));
  await assert.rejects(f.gateway.close(), /Emission acknowledgement fixture/);
  assert.equal(f.proxy.meta.cleanup_ok, true);
  assert.equal(f.upstream.tabs.size, 0);
});

test('a long read_sheet cannot let an expired queued UI call execute or consume twice', async t => {
  const f = await fixture(t), blocked = f.hold('read_sheet');
  const first = f.actor.call('read_sheet', { range: 'A1:B3' }); await blocked.entered;
  const queued = f.actor.call('click', { selector: 'e9' }); await until(() => f.proxy.meta.counts.actions === 2);
  f.clock.advance(60_000);
  const rejected = resultData(await queued.result)[0]; assert.equal(rejected.code, 'GATEWAY_QUEUE_TIMEOUT');
  assert.equal(rejected.execution_outcome, 'not_executed'); assert.equal(f.proxy.meta.queue_expiries, 1);
  blocked.release(); assert.equal(resultOK(await first.result), true);
  await f.gateway.close();
  assert.equal(f.proxy.meta.counts.actions, 2); assert.equal(f.proxy.meta.counts.actor_mutations_dispatched, 1);
  assert.equal(f.upstream.log.filter(row => row.name === 'read_sheet').length, 1);
  assert.equal(f.upstream.log.filter(row => row.name === 'click').length, 0);
  const journal = await f.rows('gateway-requests.jsonl'), rejectedRow = journal.find(row => row.event === 'rejected' && row.request_id === queued.id);
  assert.equal(rejectedRow.queue_wait_ms, 60_000); assert.equal(rejectedRow.dispatched, null);
  assert.ok(!journal.some(row => row.event === 'dispatched' && row.request_id === queued.id));
  assert.deepEqual((await f.rows('steps.jsonl')).map(row => row.tool), ['open_tab', 'read_sheet']);
});

test('cancelled unknown UI calls and capped later calls have exact receipt-time budget without native work', async t => {
  let limit = 0;
  const f = await fixture(t, { maxActions: 2, onLimit: () => limit++ }), blocked = f.hold('tools/list');
  const first = f.actor.request('tools/list'); await blocked.entered;
  const unknown = f.actor.call('not_a_browser_tool', { value: 'unknown' }); await until(() => f.proxy.meta.counts.actions === 1);
  f.actor.cancel(unknown.id); assert.equal(resultData(await unknown.result)[0].code, 'GATEWAY_CANCELLED');
  const second = f.actor.call('click', { selector: 'e3' }); await until(() => f.proxy.meta.counts.actions === 2);
  f.actor.cancel(second.id); await second.result;
  const capped = f.actor.call('click', { selector: 'e4' }); assert.equal(resultData(await capped.result)[0].code, 'ACTION_LIMIT');
  assert.equal(f.proxy.meta.counts.actions, 2); assert.equal(limit, 1); assert.equal(f.proxy.boot, undefined);
  blocked.release(); await first.result; await f.gateway.close();
  const rejected = await f.rows('gateway-rejections.jsonl');
  assert.deepEqual(rejected.map(row => row.budget_charged), [true, true, false]);
  assert.ok(rejected.every(row => row.execution_outcome === 'not_executed'));
  assert.equal(f.upstream.log.filter(row => row.method === 'tools/call').length, 0);
});

test('queue time and bootstrap retain one receive+295s deadline through the actual sheet operation', async t => {
  const f = await fixture(t), blocked = f.hold('tools/list');
  const first = f.actor.request('tools/list'); await blocked.entered;
  const sheet = f.actor.call('read_sheet', { range: 'A1' }); await until(() => f.proxy.meta.counts.actions === 1);
  f.clock.advance(50_000);
  f.upstream.hooks.set('open_tab', () => f.clock.advance(55_000));
  f.upstream.hooks.set('switch_tab', () => f.clock.advance(10_000));
  f.upstream.hooks.set('capture_screenshot', () => f.clock.advance(40_000));
  blocked.release(); await first.result; assert.equal(resultOK(await sheet.result), true); await f.gateway.close();
  assert.equal(f.upstream.log.find(row => row.name === 'read_sheet').timeout_ms, 130_000,
    'Native sheet timeout is bounded by remaining time since original receipt, not restarted at dispatch or after bootstrap');
  const steps = await f.rows('steps.jsonl'), events = await f.rows('gateway-requests.jsonl'), emissions = await f.rows('emissions.jsonl');
  assert.ok(steps.every(row => row.request_id === sheet.id && row.timing.operation_deadline_epoch_ms === f.clock.start + 295_000));
  const dispatched = events.find(row => row.event === 'dispatched' && row.request_id === sheet.id);
  assert.equal(dispatched.queue_wait_ms, 50_000);
  const emitted = events.find(row => row.event === 'emitted' && row.request_id === sheet.id);
  assert.ok(emitted.roundtrip_ms >= 50_000); assert.equal(emitted.observations.length, 1);
  assert.equal(emissions.at(-1).gateway_request_id, emitted.gateway_request_id);
  assert.equal(emissions.at(-1).operation_id, emitted.observations[0].operation_id);
});

test('running cancellation retains its slot and actual action trace until bounded drain, with no late image emission', async t => {
  const f = await fixture(t), blocked = f.hold('click');
  const first = f.actor.call('click', { selector: 'e1' }); await blocked.entered;
  f.actor.cancel(first.id); const cancelled = resultData(await first.result)[0];
  assert.equal(cancelled.code, 'GATEWAY_CANCELLED'); assert.equal(cancelled.execution_outcome, 'unknown');
  const premature = f.actor.call('click', { selector: 'e2' });
  const next = f.actor.call('read_page'); let completed = false; next.result.then(() => { completed = true; });
  await until(() => f.proxy.meta.counts.reads === 1); assert.equal(completed, false);
  assert.equal(f.upstream.log.some(row => row.name === 'read_page'), false);
  blocked.release(); assert.equal(resultData(await premature.result)[0].code, 'VERIFICATION_REQUIRED');
  assert.equal(resultOK(await next.result), true);
  assert.equal(f.upstream.log.filter(row => row.name === 'click').length, 1);
  assert.equal(resultOK(await f.actor.call('click', { selector: 'e3' }).result), true);
  await f.gateway.close();
  const rows = await f.rows('steps.jsonl'), action = rows.find(row => row.tool === 'click');
  assert.equal(action.execution_outcome, 'reported_success'); assert.ok(action.screenshot_path);
  assert.equal(f.upstream.log.filter(row => row.name === 'click').length, 2);
  const events = await f.rows('gateway-requests.jsonl'), actionFinished = events.find(row => row.event === 'finished' && row.request_id === first.id);
  assert.equal(actionFinished.cancelled, true); assert.ok(!events.some(row => row.event === 'emitted' && row.request_id === first.id));
  const emissions = await f.rows('emissions.jsonl'); assert.ok(!emissions.some(row => row.gateway_request_id === action.gateway_request_id));
  assert.ok(events.find(row => row.event === 'dispatched' && row.request_id === next.id).at.monotonic_ms >= actionFinished.at.monotonic_ms);
});

test('the running receive-time deadline never releases uncertain work or dispatches a queued call later', async t => {
  const f = await fixture(t, { gatewayOperationTimeoutMs: 1000 }), blocked = f.hold('tools/list');
  const first = f.actor.request('tools/list'); await blocked.entered;
  const queued = f.actor.call('click', { selector: 'e8' }); await until(() => f.proxy.meta.counts.actions === 1);
  const expired = assert.rejects(first.result, /receive-time deadline/);
  f.clock.advance(1000); await expired;
  assert.equal(resultData(await queued.result)[0].code, 'OPERATION_DEADLINE');
  assert.equal(f.proxy.boot, undefined); assert.equal(f.upstream.log.filter(row => row.method === 'tools/call').length, 0);
  blocked.release(); await f.gateway.close();
  const rows = await f.rows('gateway-requests.jsonl');
  assert.ok(rows.some(row => row.event === 'cancel_requested' && row.request_id === first.id && row.running_slot_retained));
  assert.ok(!rows.some(row => row.event === 'dispatched' && row.request_id === queued.id));
  assert.equal(f.proxy.meta.counts.actions, 1); assert.equal(f.proxy.meta.queue_expiries ?? 0, 0);
});

test('late native pending flags after running cancellation still halt globally without another focus or capture', async t => {
  for (const flag of ['in_flight', 'cleanup_pending']) await t.test(flag, async t => {
    const f = await fixture(t), native = { isError: true, ...reply({ success: false, code: 'ACTION_RESPONSE_TIMEOUT', mayHaveExecuted: true, [flag]: true }) };
    const blocked = f.hold('click', native), action = f.actor.call('click', { selector: 'e1' }); await blocked.entered;
    const captures = f.upstream.captures;
    f.actor.cancel(action.id); assert.equal(resultData(await action.result)[0].execution_outcome, 'unknown');
    const queued = f.actor.call('read_page'); blocked.release();
    assert.equal(resultData(await queued.result)[0].code, 'BROWSER_HALTED'); await f.gateway.close();
    assert.equal(f.proxy.meta.uncertain_upstream, true); assert.ok(f.proxy.scheduler.halted);
    assert.equal(f.proxy.meta.cleanup_ok, false); assert.equal(f.upstream.captures, captures);
    assert.equal(f.upstream.log.at(-1).name, 'click');
    const steps = await f.rows('steps.jsonl'); assert.equal(steps.at(-1).execution_outcome, 'unknown');
    assert.equal(steps.at(-1).screenshot_path, null); assert.match(steps.at(-1).result_text, new RegExp(`"${flag}":true`));
  });
});

test('controller cancellation and caller disconnect reject queued work across sockets without losing accounting', async t => {
  const f = await fixture(t), blocked = f.hold('tools/list'), other = await f.connect();
  const first = f.actor.request('tools/list'); await blocked.entered;
  const disconnect = other.call('click', { selector: 'e2' }); await until(() => f.proxy.meta.counts.actions === 1); other.close();
  await until(async () => (await f.rows('gateway-rejections.jsonl')).length === 1);
  const cancel = f.actor.call('click', { selector: 'e3' }); await until(() => f.proxy.meta.counts.actions === 2);
  const runningCancelled = assert.rejects(first.result, /controller cancelled/);
  f.gateway.cancelPending(); assert.equal(resultData(await cancel.result)[0].code, 'GATEWAY_CANCELLED');
  await runningCancelled; blocked.release(); await f.gateway.close();
  assert.equal(f.proxy.meta.counts.actions, 2); assert.equal(f.proxy.boot, undefined);
  assert.equal(f.upstream.log.filter(row => row.method === 'tools/call').length, 0);
  assert.deepEqual((await f.rows('gateway-rejections.jsonl')).map(row => row.code), ['GATEWAY_CLIENT_DISCONNECTED', 'GATEWAY_CANCELLED']);
  assert.ok(disconnect.id);
});
