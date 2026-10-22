import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PROFILE, ALLOWED_TOOLS, actorToolSchema } from '../browser-manual-profile.mjs';
import { BrowserScheduler } from '../browser-scheduler.mjs';
import { ManualRecordingProxy } from '../manual-recording-proxy.mjs';
import { resultData, resultOK } from '../mcp-record-proxy.mjs';
import { encodeSolidPng } from '../png.mjs';
import { sha256 } from '../observation-recorder.mjs';
import { writeV2, formatAction } from '../v2-writer.mjs';
import { validateTrajectoryDir } from '../validate-v2.mjs';

const require = createRequire(import.meta.url);
const { TOOL_REGISTRY } = require('../../../extension/ai/tool-definitions.js');
const reply = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let mapper;
async function nativeErrorMapper() {
  const { tsImport } = require(require.resolve('tsx/esm/api', { paths: [path.resolve(import.meta.dirname, '../../../mcp')] }));
  return (mapper ??= tsImport('../../../mcp/src/errors.ts', import.meta.url)).then(module => module.mapFSBError);
}

class BrowserDouble {
  constructor() { this.tabs = new Map(); this.active = null; this.counter = 10; this.log = []; this.captures = 0; }
  async request(method, params) {
    if (method === 'initialize') return { capabilities: {} };
    if (method === 'tools/list') return { tools: TOOL_REGISTRY.filter(t => ALLOWED_TOOLS.includes(t.name)) };
    const { name, arguments: args } = params; this.log.push({ name, args });
    const id = args.tab_id ?? args.tabId;
    if (name === 'open_tab') { const tab = { id: ++this.counter, url: args.url, state: 0, geometry: { x: 0, y: 0, width: 100, height: 80 } }; this.tabs.set(tab.id, tab); this.active = tab.id; return reply({ success: true, tabId: tab.id, url: tab.url }); }
    if (name === 'list_tabs') return reply({ success: true, tabs: [...this.tabs.values()].map(t => ({ id: t.id })) });
    if (name === 'close_tab') { this.tabs.delete(id); return reply({ success: true }); }
    if (name === 'get_site_guide') return reply({ success: true, guide: 'Fixture guide' });
    if (name === 'switch_tab') { assert.ok(this.tabs.has(id), 'Cannot focus an unowned tab'); this.active = id; return reply({ success: true, tabId: id }); }
    const tab = this.tabs.get(id); assert.ok(tab, 'Target tab must exist');
    if (name === 'capture_screenshot') {
      assert.equal(this.active, id); this.captures++;
      if (this.badCapture) return reply({ success: false, error: 'capture failed' });
      const bytes = encodeSolidPng(100, 80, [id, tab.state, 0]);
      return { content: [{ type: 'text', text: JSON.stringify({ capture_id: `capture-${this.captures}`, source_url: tab.url,
        timestamp: new Date().toISOString(), mode: 'viewport', css_rect: tab.geometry, output_width: 100, output_height: 80,
        byte_length: bytes.length, sha256: this.badHash ? 'wrong' : sha256(bytes), effective_emulation: { device_mode: 'current', device_scale_factor: 1 } }) },
      { type: 'image', mimeType: 'image/png', data: bytes.toString('base64') }] };
    }
    if (name === 'execute_js' && args.code.startsWith('return {url:location.href')) return reply({ success: true, result: JSON.stringify({ url: tab.url, dpr: 1, ...tab.geometry }) });
    if (name === 'read_page' || name === 'get_page_snapshot') return reply({ success: true, content: `state=${tab.state}`, refs: { e1: 'button' } });
    if (name === 'wait_for_stable') return reply({ success: true, stable: false, reason: 'timeout' });
    if (name === 'search') { assert.equal(args.allow_web_fallback, false); return reply({ success: false, error: 'No site search' }); }
    if (name === 'click_at' || name === 'click' || name === 'read_sheet') {
      assert.equal(this.active, id, 'Native input must focus before dispatch');
      if (args.selector === 'e999') return reply({ success: false, refStale: true, error: 'Unknown ref' });
      if (this.uncertain) throw new Error('MCP tools/call timed out');
      tab.state++; return reply({ success: true, state: tab.state });
    }
    return reply({ success: true });
  }
  notify() {}
  async close() {}
}
async function fixture(t, options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'fsb-manual-v2-'));
  const upstream = new BrowserDouble();
  const proxy = new ManualRecordingProxy({ command: ['fake'], rawDir: dir, startUrl: 'https://fixture.example/', upstream, ...options });
  t.after(async () => { await proxy.close(); await rm(dir, { recursive: true, force: true }); });
  await proxy.handle('initialize', {});
  const call = async (name, args = {}) => { const result = await proxy.handle('tools/call', { name, arguments: args }); await proxy.noteEmitted(result); return result; };
  return { proxy, upstream, dir, call };
}

test('profile exposes exactly46 tools, both waits, grounded coordinate schemas, no credentials/files/global resources', async t => {
  const { proxy } = await fixture(t);
  const { tools } = await proxy.handle('tools/list'); assert.equal(tools.length, 46);
  assert.deepEqual(new Set(tools.map(t => t.name)), new Set(ALLOWED_TOOLS));
  assert.ok(tools.find(t => t.name === 'drag').inputSchema.required.includes('frame_id'));
  assert.ok(!tools.some(t => /upload_file|drop_file|memory|credential|run_task|trigger/.test(t.name)));
  assert.deepEqual(await proxy.handle('resources/list'), { resources: [] });
  assert.deepEqual(Object.keys(tools.find(t => t.name === 'capture_screenshot').inputSchema.properties).sort(), ['tab_id', 'wait_ms']);
});
test('native focus precedes action; captured bytes, emitted image and trajectory agree', async t => {
  const { proxy, upstream, call, dir } = await fixture(t);
  await call('read_page'); const out = await call('click', { selector: 'e1' });
  const receipt = resultData(out).find(x => x.observation).observation;
  const image = out.content.find(x => x.type === 'image');
  assert.equal(sha256(Buffer.from(image.data, 'base64')), receipt.sha256);
  assert.equal(sha256(await readFile(receipt.screenshot_path)), receipt.sha256);
  const actionIndex = upstream.log.findIndex(row => row.name === 'click'); assert.equal(upstream.log[actionIndex - 1].name, 'switch_tab');
  await writeFile(path.join(dir, 'final.json'), JSON.stringify({ outcome: 'complete', final_answer: 'Verified fixture state1' }));
  const config = path.join(dir, 'profile.json'); await writeFile(config, JSON.stringify(PROFILE));
  const task = { task_id: 'fixture', confirmed_task: 'Change fixture state', website: proxy.startUrl, reference_length: 1 };
  const exported = await writeV2({ task, rawDir: dir, outDir: path.join(dir, 'v2'), allowlistPath: config });
  assert.ok((await validateTrajectoryDir(exported.dir)).ok);
  assert.equal(sha256(await readFile(path.join(exported.dir, 'trajectory/0001.png'))), receipt.sha256);
});
test('explicit capture happens once; guides/inventory do not replace latest emitted frame', async t => {
  const { proxy, upstream, call } = await fixture(t); await call('read_page');
  const before = upstream.captures; const out = await call('capture_screenshot'); assert.equal(upstream.captures, before + 1);
  const id = resultData(out).find(x => x.observation).observation.frame_id;
  await call('list_tabs'); await call('get_site_guide', { domain: 'fixture.example' });
  assert.equal(proxy.session.latestFrame(proxy.tabId).frame_id, id);
});
test('coordinates require latest emitted frame and reject changed URL or geometry without executing', async t => {
  const { proxy, upstream, call } = await fixture(t); await call('read_page');
  const frame = proxy.session.latestFrame(proxy.tabId);
  assert.equal(resultOK(await call('click_at', { x: 10, y: 10, frame_id: 'old' })), false);
  upstream.tabs.get(proxy.tabId).url += 'changed';
  assert.equal(resultOK(await call('click_at', { x: 10, y: 10, frame_id: frame.frame_id })), false);
  assert.equal(upstream.tabs.get(proxy.tabId).state, 0);
  await call('capture_screenshot');
  upstream.tabs.get(proxy.tabId).geometry.dpr = 2;
  assert.equal(resultOK(await call('click_at', { x: 10, y: 10, frame_id: proxy.session.latestFrame(proxy.tabId).frame_id })), false);
  upstream.tabs.get(proxy.tabId).geometry.dpr = 1;
  assert.equal(resultOK(await call('click_at', { x: 10, y: 10, frame_id: proxy.session.latestFrame(proxy.tabId).frame_id })), true);
  assert.equal(upstream.tabs.get(proxy.tabId).state, 1);
});
test('owned popup may be selected, unrelated IDs and final-tab close fail closed', async t => {
  const { proxy, upstream, call } = await fixture(t); await call('read_page');
  assert.equal(resultOK(await call('close_tab')), false);
  upstream.tabs.set(50, { id: 50, url: proxy.startUrl + 'child', state: 0, geometry: { x: 0, y: 0, width: 100, height: 80 } });
  await call('list_tabs'); await call('switch_tab', { tabId: 50 }); await call('click', { selector: 'e1' });
  assert.equal(upstream.tabs.get(50).state, 1); assert.equal(upstream.tabs.get(proxy.tabId).state, 0);
  const before = upstream.log.length; assert.equal(resultOK(await call('click', { selector: 'e1', tab_id: 999 })), false);
  assert.ok(!upstream.log.slice(before).some(x => x.name === 'click'));
  await proxy.close(); assert.equal(upstream.tabs.size, 0); assert.equal(proxy.meta.cleanup_ok, true);
});
test('failed attempts, sheet UI reads and JS policies count toward120; no Google fallback', async t => {
  const { proxy, call } = await fixture(t, { maxActions: 4 });
  await call('read_page'); await call('click', { selector: 'e999' }); await call('read_sheet', { range: 'A1' });
  assert.equal(resultOK(await call('execute_js', { code: 'return fetch("https://example.com")' })), false);
  await call('search', { query: 'test' }); assert.equal(proxy.meta.counts.actions, 4);
  assert.equal(resultOK(await call('click', { selector: 'e1' })), false);
  const stable = resultData(await call('wait_for_stable'))[0]; assert.equal(stable.stable, false);
});
test('bad frame hashes stop the attempt and never produce an actor image or substituted export frame', async t => {
  const { proxy, upstream, call } = await fixture(t); await call('read_page'); upstream.badHash = true;
  const result = await call('click', { selector: 'e1' }); assert.ok(!result.content.some(x => x.type === 'image'));
  assert.equal(proxy.meta.fault.code, 'FRAME_HASH_MISMATCH'); assert.equal(proxy.meta.counts.screenshot_errors, 1);
});
test('failed emission evidence never makes its frame eligible or permits another mutation', async t => {
  const { proxy, upstream, dir } = await fixture(t);
  const result = await proxy.handle('tools/call', { name: 'read_page', arguments: {} });
  await mkdir(path.join(dir, 'emissions.jsonl'));
  await assert.rejects(proxy.noteEmitted(result), { code: 'EMISSION_EVIDENCE_FAILED' });
  assert.equal(proxy.session.latestFrame(proxy.tabId).emitted_at, null);
  assert.equal(proxy.meta.fault.code, 'EMISSION_EVIDENCE_FAILED');
  assert.ok(proxy.scheduler.halted);
  assert.equal(resultData(await proxy.handle('tools/call', { name: 'click', arguments: { selector: 'e1' } }))[0].code, 'BROWSER_HALTED');
  assert.equal(upstream.log.filter(row => row.name === 'click').length, 0);
});
test('uncertain upstream mutation is retained and halts new dispatch instead of replaying', async t => {
  const { proxy, upstream, call, dir } = await fixture(t); await call('read_page'); upstream.uncertain = true;
  const result = await call('click', { selector: 'e1' }); assert.equal(resultOK(result), false);
  assert.ok(proxy.scheduler.halted); assert.equal(upstream.log.filter(x => x.name === 'click').length, 1);
  const rows = (await readFile(path.join(dir, 'steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.at(-1).execution_outcome, 'unknown'); assert.equal(proxy.meta.uncertain_upstream, true);
});
test('uncertain controller focus halts before actor input and preserves its separate timing interval', async t => {
  const { proxy, upstream, call, dir } = await fixture(t); await call('read_page');
  const request = upstream.request.bind(upstream), before = upstream.log.length;
  upstream.request = (method, params) => {
    if (params?.name === 'switch_tab') throw new Error('Native foreground response timed out');
    return request(method, params);
  };
  const result = await call('click', { selector: 'e1' });
  assert.equal(resultOK(result), false);
  assert.equal(proxy.meta.fault.code, 'FOREGROUND_UNCERTAIN');
  assert.equal(proxy.meta.uncertain_upstream, true);
  assert.ok(proxy.scheduler.halted);
  assert.equal(proxy.meta.counts.actor_mutations_dispatched, 0);
  assert.ok(!upstream.log.slice(before).some(row => ['click', 'capture_screenshot', 'close_tab'].includes(row.name)));
  const row = (await readFile(path.join(dir, 'steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse).at(-1);
  assert.equal(row.timing.focus_intervals.length, 1);
  assert.ok(row.timing.focus_intervals[0].finished.monotonic_ms >= row.timing.focus_intervals[0].started.monotonic_ms);
});
test('lost authoritative inventory is a global health fault before another mutation', async t => {
  const { proxy, upstream, call } = await fixture(t); await call('read_page');
  const request = upstream.request.bind(upstream);
  let broken = true;
  upstream.request = (method, params) => {
    if (broken && params?.name === 'list_tabs') throw new Error('Scoped connection disappeared');
    return request(method, params);
  };
  assert.equal(resultOK(await call('click', { selector: 'e1' })), false);
  assert.equal(proxy.meta.fault.code, 'OWNED_INVENTORY_FAILED');
  assert.ok(proxy.scheduler.halted);
  assert.equal(upstream.tabs.get(proxy.tabId).state, 0);
  broken = false;
  assert.equal(resultOK(await call('click', { selector: 'e1' })), false);
  assert.equal(upstream.tabs.get(proxy.tabId).state, 0);
});
test('actual mapped completed-unknown action requires an emitted fresh observation before the next mutation', async t => {
  const { proxy, upstream, call, dir } = await fixture(t); await call('read_page');
  const mapFSBError = await nativeErrorMapper(), original = upstream.request.bind(upstream);
  let clicks = 0;
  upstream.request = async (method, params) => {
    if (method === 'tools/call' && params.name === 'click' && ++clicks === 1) {
      upstream.log.push({ name: params.name, args: params.arguments }); upstream.tabs.get(proxy.tabId).state++;
      return mapFSBError({ success: false, error: 'Port closed after dispatch', outcome: 'unknown',
        mayHaveExecuted: true, in_flight: false, cleanup_pending: false, code: 'ACTION_OUTCOME_UNKNOWN' });
    }
    return original(method, params);
  };
  const unknown = await call('click', { selector: 'e1' });
  assert.equal(resultOK(unknown), false); assert.equal(proxy.scheduler.halted, null);
  assert.equal(resultData(unknown).find(row => row.mayHaveExecuted).outcome, 'unknown');
  assert.ok(proxy.pendingVerification.has(proxy.tabId));
  assert.equal(resultData(await call('click', { selector: 'e1' }))[0].code, 'VERIFICATION_REQUIRED');
  assert.equal(clicks, 1, 'The uncertain action is never replayed');
  const fresh = await proxy.handle('tools/call', { name: 'read_page', arguments: {} });
  assert.ok(proxy.pendingVerification.has(proxy.tabId), 'Preparing a frame alone is not actor delivery');
  await proxy.noteEmitted(fresh); assert.equal(proxy.pendingVerification.has(proxy.tabId), false);
  assert.equal(resultOK(await call('click', { selector: 'e1' })), true); assert.equal(clicks, 2);
  const rows = (await readFile(path.join(dir, 'steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  const entry = rows.find(row => row.tool === 'click' && row.execution_outcome === 'unknown');
  assert.ok(entry.screenshot_path); assert.match(entry.result_text, /"mayHaveExecuted":true/);
});
test('an unknown tab opening halts instead of choosing an arbitrary frame or replaying the open', async t => {
  const mapFSBError = await nativeErrorMapper();
  const { proxy, upstream, call, dir } = await fixture(t); await call('read_page');
  const request = upstream.request.bind(upstream);
  upstream.request = async (method, params) => {
    const result = await request(method, params);
    if (params?.name === 'open_tab') return mapFSBError({ success: false, error: 'Tab opening result was not confirmed', mayHaveExecuted: true });
    return result;
  };
  const captures = upstream.captures, opens = upstream.log.filter(row => row.name === 'open_tab').length;
  const result = await call('open_tab', { url: 'https://fixture.example/child' });
  assert.equal(resultOK(result), false);
  assert.equal(upstream.captures, captures);
  assert.equal(proxy.meta.fault.code, 'NO_OWNED_TAB');
  assert.ok(proxy.scheduler.halted);
  assert.equal(resultData(await call('open_tab', { url: 'https://fixture.example/child' }))[0].code, 'BROWSER_HALTED');
  assert.equal(upstream.log.filter(row => row.name === 'open_tab').length, opens + 1);
  const row = (await readFile(path.join(dir, 'steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse).at(-1);
  assert.equal(row.execution_outcome, 'unknown'); assert.equal(row.screenshot_path, null);
  await proxy.close(); assert.equal(proxy.meta.cleanup_ok, true); assert.equal(upstream.tabs.size, 0);
});
test('actual mapped in-flight or pending-cleanup native calls halt before further capture or dispatch', async t => {
  const mapFSBError = await nativeErrorMapper();
  for (const tool of ['click', 'read_page']) for (const flag of ['in_flight', 'cleanup_pending']) await t.test(`${tool}:${flag}`, async t => {
    const { proxy, upstream, call, dir } = await fixture(t); await call('read_page');
    const original = upstream.request.bind(upstream);
    upstream.request = async (method, params) => {
      if (method === 'tools/call' && params.name === tool) {
        upstream.log.push({ name: params.name, args: params.arguments });
        return mapFSBError({ success: false, error: 'Native call is not settled', outcome: 'unknown',
          mayHaveExecuted: true, code: 'ACTION_RESPONSE_TIMEOUT', [flag]: true,
          ...(tool === 'read_page' ? { failure_category: 'page_read', tool } : {}) });
      }
      return original(method, params);
    };
    const captures = upstream.captures, unknown = await call(tool, tool === 'click' ? { selector: 'e1' } : {});
    assert.equal(resultData(unknown).find(row => row[flag] === true)[flag], true);
    assert.equal(proxy.meta.uncertain_upstream, true); assert.ok(proxy.scheduler.halted);
    assert.equal(upstream.captures, captures, 'No capture or focus may follow unresolved native work');
    assert.equal(upstream.log.at(-1).name, tool);
    const count = upstream.log.length;
    assert.equal(resultData(await call('read_page'))[0].code, 'BROWSER_HALTED');
    assert.equal(resultData(await call('click', { selector: 'e1' }))[0].code, 'BROWSER_HALTED');
    await proxy.close(); assert.equal(upstream.log.length, count, 'Cleanup cannot focus or close an uncertain tab');
    assert.equal(proxy.meta.cleanup_ok, false);
    const rows = (await readFile(path.join(dir, 'steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(rows.at(-1).execution_outcome, 'unknown'); assert.equal(rows.at(-1).screenshot_path, null);
    assert.match(rows.at(-1).result_text, new RegExp(`"${flag}":true`));
  });
});
test('FIFO scheduling cancels expired/aborted queued operations before execution', async () => {
  const scheduler = new BrowserScheduler({ maxQueueMs: 20 }); const executed = [];
  const first = scheduler.run('one', async () => { executed.push('one'); await wait(60); });
  const expired = scheduler.run('two', async () => executed.push('two'));
  await assert.rejects(expired, { code: 'BROWSER_QUEUE_TIMEOUT' }); await first;
  assert.deepEqual(executed, ['one']);
  const active = scheduler.run('one', () => wait(10));
  const aborted = scheduler.run('two', () => executed.push('bad')); scheduler.cancelOwner('two');
  await assert.rejects(aborted, { code: 'TASK_DEADLINE' }); await active; assert.ok(!executed.includes('bad'));
});
test('a late completed read cannot start another capture queue beyond its receive-time deadline', async t => {
  const { proxy, upstream, call, dir } = await fixture(t); await call('read_page');
  const original = upstream.request.bind(upstream), captures = upstream.captures, before = upstream.log.length;
  upstream.request = async (method, params) => {
    if (params?.name === 'read_page') await wait(40);
    return original(method, params);
  };
  const result = await proxy.handle('tools/call', { name: 'read_page', arguments: {} }, {
    signal: new AbortController().signal, now: Date.now, operation_deadline_epoch_ms: Date.now() + 20,
    operation_ids: [], received: {}, dispatched: {}, queue_wait_ms: 0,
  });
  assert.equal(upstream.captures, captures);
  assert.ok(!upstream.log.slice(before).some(row => ['switch_tab', 'capture_screenshot'].includes(row.name)));
  assert.ok(!result.content.some(row => row.type === 'image'));
  const entry = (await readFile(path.join(dir, 'steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse).at(-1);
  assert.equal(entry.error_code, 'OPERATION_DEADLINE');
  assert.equal(entry.execution_outcome, 'reported_success');
  assert.equal(entry.screenshot_path, null);
});
test('trajectory strings retain actual keyboard, drag, JS and unknown outcomes', () => {
  assert.match(formatAction('press_key', 'PRESS_KEY', { key: 'Escape', ctrl: true }, true), /Ctrl\+Escape/);
  assert.match(formatAction('drag', 'DRAG', { startX: 2, endX: 20 }, true), /"endX":20/);
  assert.match(formatAction('execute_js', 'EXECUTE_JS', { code: 'document.querySelector("button").click()' }, false, null, 'unknown'), /UNKNOWN$/);
});

test('unknown and excluded tool attempts consume UI budget before any bootstrap or execution', async t => {
  let limited = 0;
  const { proxy, upstream, dir, call } = await fixture(t, { maxActions: 2, onLimit: () => limited++ });
  assert.equal(resultOK(await call('unknown_browser_tool', { text: 'first' })), false);
  assert.equal(proxy.meta.counts.actions, 1); assert.equal(proxy.boot, undefined); assert.equal(upstream.log.length, 0);
  assert.equal(resultOK(await call('run_task', { task: 'excluded autopilot' })), false);
  assert.equal(proxy.meta.counts.actions, 2); assert.equal(proxy.boot, undefined); assert.equal(upstream.log.length, 0);
  const denied = (await readFile(path.join(dir, 'denied-tools.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(denied.map(row => row.tool), ['unknown_browser_tool', 'run_task']);
  assert.ok(denied.every(row => row.execution_outcome === 'not_executed' && row.budget_policy));
  assert.equal(resultData(await call('another_unknown'))[0].code, 'ACTION_LIMIT');
  assert.equal(limited, 1); assert.equal(proxy.meta.counts.actions, 2); assert.equal(upstream.log.length, 0);
  assert.equal(proxy.meta.counts.actor_mutations_dispatched, 0);
});

test('a known mutation is charged when bootstrap fails, and the health halt prevents replay', async t => {
  const { proxy, upstream, call } = await fixture(t, { maxActions: 1 });
  const original = upstream.request.bind(upstream);
  upstream.request = async (method, params) => {
    if (method === 'tools/call' && params.name === 'open_tab') {
      upstream.log.push({ name: 'open_tab', args: params.arguments });
      return reply({ success: false, error: 'Starting page could not be opened' });
    }
    return original(method, params);
  };
  await assert.rejects(call('click', { selector: 'e1' }), /bootstrap failed/i);
  assert.equal(proxy.meta.counts.actions, 1); assert.equal(proxy.meta.counts.actor_mutations_dispatched, 0);
  assert.equal(upstream.log.filter(row => row.name === 'open_tab').length, 1);
  assert.equal(resultData(await call('click', { selector: 'e1' }))[0].code, 'BROWSER_HALTED');
  assert.equal(upstream.log.filter(row => row.name === 'open_tab').length, 1);
  assert.equal(upstream.log.filter(row => row.name === 'click').length, 0);
});
