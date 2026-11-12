import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { PROFILE, PUBLIC_PROFILE, ALLOWED_TOOLS, PUBLIC_ALLOWED_TOOLS, classifyTool, publicCatalogReceipt, actorToolSchema, actorPrompt, loadPublicCatalog } from '../browser-manual-profile.mjs';
import { PublicReleaseClient } from '../public-release-client.mjs';
import { ManualRecordingProxy } from '../manual-recording-proxy.mjs';
import { BrowserScheduler } from '../browser-scheduler.mjs';
import { encodeSolidPng } from '../png.mjs';
import { sha256 } from '../observation-recorder.mjs';
import { resultData, resultOK } from '../mcp-record-proxy.mjs';
import { writeV2 } from '../v2-writer.mjs';
import { validateTrajectoryDir } from '../validate-v2.mjs';
import { verifyPublicDisposition } from '../public-disposition.mjs';
import { collectManual } from '../manual-runner.mjs';

const { TOOL_REGISTRY } = createRequire(import.meta.url)('../../../extension/ai/tool-definitions.js');
const extras = ['start_visual_session', 'end_visual_session', 'list_sessions', 'get_session_detail', 'get_session_replay', 'replay_session',
  'get_logs', 'get_memory_stats', 'back', 'list_credentials', 'fill_credential', 'list_payment_methods', 'use_payment_method',
  'search_capabilities', 'invoke_capability', 'run_task', 'stop_task', 'get_task_status'];
const CATALOG = [...TOOL_REGISTRY.filter(t => !['wait_for_element', 'wait_for_stable', 'report_progress'].includes(t.name)),
  ...extras.map(name => ({ name, description: 'Excluded fixture tool', inputSchema: { type: 'object', properties: {} } }))];
const reply = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const nativeError = value => ({ ...reply({ success: false, ...value }), isError: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const task = { task_id: 'fixture', website: 'https://fixture.example/', confirmed_task: 'Inspect the visible fixture', reference_length: 1 };

class PublicBrowserDouble {
  constructor() { this.tabs = new Map(); this.counter = 10; this.log = []; this.captures = 0; this.closed = false; }
  async request(method, params = {}) {
    if (method === 'initialize') return { capabilities: { tools: {} }, serverInfo: { name: 'fake-public', version: '0.11.2' } };
    if (method === 'tools/list') return { tools: structuredClone(CATALOG) };
    const { name, arguments: args = {} } = params; this.log.push({ name, args: structuredClone(args) });
    const id = args.tab_id ?? args.tabId;
    if (name === 'open_tab') {
      const tab = { id: ++this.counter, url: args.url, state: 0 }; this.tabs.set(tab.id, tab); if (args.active !== false) this.active = tab.id;
      return reply({ success: true, tool: name, tabId: tab.id, url: tab.url, agentId: 'original-fixture-agent', connectionId: 'sensitive_connection', ownershipToken: `sensitive_ownership_${tab.id}` });
    }
    if (name === 'list_tabs') return reply({ success: true, tabs: [...this.tabs.values()].map(t => ({ id: t.id, title: 'Fixture' })), totalTabs: this.tabs.size, agentId: 'original-fixture-agent' });
    if (name === 'switch_tab') { assert.ok(this.tabs.has(id)); this.active = id; return reply({ success: true, tabId: id }); }
    if (name === 'close_tab') { assert.ok(this.tabs.has(id)); this.tabs.delete(id); return reply({ success: true, closed: true, tabId: id }); }
    const tab = this.tabs.get(id); assert.ok(tab, 'Every page call targets a known owned tab');
    if (name === 'get_text') return reply({ success: true, text: 'public-test-marker' });
    if (name === 'capture_screenshot') {
      this.captures++;
      const guard = tab.url.startsWith('http://127.0.0.1:');
      if (this.captures === this.failCaptureNumber || guard && this.failHealth) return nativeError({ code: 'SCREENSHOT_CAPTURE_FAILED', error: 'Capture is blocked by the browser for this page', ...(this.pendingCapture ? { cleanup_pending: true } : {}) });
      assert.equal(this.active, id);
      const bytes = encodeSolidPng(200, 120, [id, tab.state, 30]);
      return { content: [{ type: 'text', text: JSON.stringify({ capture_id: `native-${this.captures}`, source_url: tab.url,
        timestamp: new Date().toISOString(), mode: 'viewport', css_rect: { x: 0, y: 0, width: 200, height: 120 },
        output_width: 200, output_height: 120, byte_length: bytes.length, sha256: sha256(bytes),
        effective_emulation: { device_mode: 'current', device_scale_factor: 1 } }) },
      { type: 'image', mimeType: 'image/png', data: bytes.toString('base64') }] };
    }
    if (name === 'read_page') {
      assert.equal(this.active, id, 'Potential consent UI must hold foreground');
      if (this.failRead) return nativeError({ code: 'ELEMENT_NOT_FOUND', error: 'Public fixture tool failed' });
      tab.state++; return reply({ success: true, content: 'Public observation', connectionId: 'sensitive_connection' });
    }
    if (name === 'search') return nativeError({ code: 'ELEMENT_NOT_FOUND', error: 'No site search' });
    if (name === 'click' && this.transportFault) throw new Error('MCP transport timed out');
    return reply({ success: true });
  }
  notify() {}
  async close() { this.closed = true; }
}

async function fixture(t, options = {}) {
  const rawDir = options.rawDir ?? await mkdtemp(path.join(tmpdir(), 'manual-public-'));
  const raw = new PublicBrowserDouble();
  const client = new PublicReleaseClient(raw, { createGuardServer: async () => ({ url: 'http://127.0.0.1:39457/fixture-guard', marker: 'public-test-marker', async close() {} }) });
  const proxy = new ManualRecordingProxy({ command: ['fake'], rawDir, startUrl: task.website, public_release: true,
    publicCatalog: CATALOG, upstream: client, ...options });
  t.after(async () => { await proxy.close(); if (!options.rawDir) await rm(rawDir, { recursive: true, force: true }); });
  await proxy.handle('initialize', {}); await proxy.preparePublicRelease();
  const call = async (name, args = {}) => { const result = await proxy.handle('tools/call', { name, arguments: args }); await proxy.noteEmitted(result); return result; };
  return { proxy, raw, rawDir, call };
}

test('public profile freezes44 actual tools while the default46/waits remain unchanged', async t => {
  assert.equal(ALLOWED_TOOLS.length, 46); assert.equal(PUBLIC_ALLOWED_TOOLS.length, 44);
  assert.equal(PROFILE.reads.includes('read_page'), true); assert.equal(PROFILE.actions.read_page, undefined);
  assert.equal(PUBLIC_PROFILE.actions.read_page.verb, 'READ_PAGE'); assert.equal(classifyTool('read_page', PUBLIC_PROFILE), 'mutation');
  assert.throws(() => classifyTool('wait_for_stable', PUBLIC_PROFILE), /disabled/);
  const { proxy, call } = await fixture(t); const { tools } = await proxy.handle('tools/list');
  assert.equal(proxy.meta.public_release, true); assert.equal(proxy.meta.profile, 'browser-manual-public-v1');
  assert.equal(tools.length, 44); assert.equal(proxy.meta.public_catalog.registered_tool_count, 72);
  assert.deepEqual(new Set(tools.map(t => t.name)), new Set(PUBLIC_ALLOWED_TOOLS));
  assert.equal(proxy.meta.public_catalog.source_catalog_sha256, publicCatalogReceipt(CATALOG).source_catalog_sha256);
  const listed = resultData(await call('list_tabs')).find(row => row.tabs).tabs;
  assert.ok(listed.every(tab => tab.id !== proxy.upstream.getGuardId()));
  assert.equal(actorToolSchema(TOOL_REGISTRY.find(t => t.name === 'search'), PUBLIC_PROFILE).description.includes('disables automatic Google'), false);
  assert.ok(actorPrompt('Use wait_for_element/wait_for_stable for waits.\nThe search tool uses the current site\'s UI and will not fall back to Google.', true).includes('may fall back to Google'));
});

test('public catalog autoload verifies pinned bytes and rejects changed, missing, mismatched or incomplete catalogs', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'manual-public-catalog-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'tools.json'), bytes = Buffer.from(JSON.stringify({ tools: CATALOG }));
  await writeFile(file, bytes);
  const publicPins = { catalog: { path: file, bytes: bytes.length, sha256: sha256(bytes) } };
  assert.equal(publicCatalogReceipt(await loadPublicCatalog({ publicPins })).registered_tool_count, 72);
  await assert.rejects(loadPublicCatalog({}), /pinned tools\/list/);
  await assert.rejects(loadPublicCatalog({ publicPins: { catalog: { ...publicPins.catalog, bytes: -1 } } }), /descriptor/);
  await assert.rejects(loadPublicCatalog({ publicPins, publicCatalog: [...CATALOG].reverse() }), /differs/);
  await assert.rejects(loadPublicCatalog({ publicCatalog: CATALOG.filter(tool => tool.name !== 'read_page') }), /read_page/);
  await writeFile(file, Buffer.concat([bytes, Buffer.from('\n')]));
  await assert.rejects(loadPublicCatalog({ publicPins }), /bytes changed/);
});

test('public read_page failures consume UI budget under the lease, retain native errors/PNGs and export READ_PAGE', async t => {
  const { proxy, raw, call, rawDir } = await fixture(t, { maxActions: 2 });
  raw.failRead = true;
  const failed = await call('read_page'); assert.equal(failed.isError, true); assert.ok(failed.content.some(b => b.type === 'image'));
  assert.equal(proxy.meta.counts.actions, 1); assert.equal(proxy.meta.counts.actor_mutations_dispatched, 1);
  await call('read_page'); const before = raw.log.length;
  assert.equal(resultData(await call('read_page'))[0].code, 'ACTION_LIMIT'); assert.equal(raw.log.length, before);
  await writeFile(path.join(rawDir, 'final.json'), JSON.stringify({ outcome: 'complete', final_answer: 'The public tool reported a failure.' }));
  const output = await writeV2({ task, rawDir, outDir: path.join(rawDir, 'v2'), allowlistPath: path.resolve(import.meta.dirname, '../../config/browser-manual-public-v1.json') });
  assert.ok((await validateTrajectoryDir(output.dir)).ok);
  const trace = JSON.parse(await readFile(output.resultPath));
  assert.ok(JSON.stringify(trace).includes('READ_PAGE'));
  const text = await readFile(path.join(rawDir, 'steps.jsonl'), 'utf8');
  assert.equal(text.includes('sensitive_ownership_'), false); assert.equal(text.includes('sensitive_connection'), false);
});

test('queued public read_page cancellations and expiries are charged once without bootstrap or native dispatch', async t => {
  const { proxy, raw, rawDir } = await fixture(t, { maxActions: 2 });
  const before = raw.log.length;
  for (const [index, code] of ['GATEWAY_CANCELLED', 'GATEWAY_QUEUE_TIMEOUT'].entries()) {
    const context = { request_id: index + 1, gateway_request_id: `queued-${index}`, received: { at: new Date().toISOString() } };
    const params = { name: 'read_page', arguments: {} };
    await proxy.accountGatewayRequest('tools/call', params, context);
    await proxy.rejectGatewayRequest('tools/call', params, context, code, 'Queued call was not dispatched');
    await proxy.rejectGatewayRequest('tools/call', params, context, code, 'Duplicate notification');
  }
  assert.equal(proxy.meta.counts.actions, 2); assert.equal(proxy.meta.counts.actor_mutations_dispatched, 0);
  assert.equal(raw.log.length, before); assert.equal(proxy.boot, undefined);
  const records = (await readFile(path.join(rawDir, 'gateway-rejections.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(records.length, 2); assert.ok(records.every(row => row.ui_attempt && row.budget_charged && row.execution_outcome === 'not_executed'));
  assert.equal((await proxy.accountGatewayRequest('tools/call', { name: 'read_page' }, {})).code, 'ACTION_LIMIT');
});

test('public potential UI read waits behind foreground work and search preserves the unmodified fallback argument', async t => {
  const scheduler = new BrowserScheduler(), { proxy, raw, call } = await fixture(t, { scheduler });
  await proxy.bootstrap();
  let release, entered; const holding = new Promise(r => { entered = r; });
  const held = scheduler.run('other-task', async () => { entered(); await new Promise(r => { release = r; }); });
  await holding; const pending = call('read_page'); await wait(10);
  assert.equal(raw.log.some(row => row.name === 'read_page'), false); release(); await held; await pending;
  const result = await call('search', { query: 'visible terms' }); assert.equal(result.isError, true);
  const sent = raw.log.find(row => row.name === 'search'); assert.equal(Object.hasOwn(sent.args, 'allow_web_fallback'), false);
  assert.ok(result.content.some(block => block.type === 'image'));
});

test('settled public capture failure retains raw error and gets separate healthy guard proof before exact cleanup', async t => {
  const { proxy, raw, call, rawDir } = await fixture(t); raw.failCaptureNumber = 2;
  const failed = await call('read_page'); assert.equal(failed.isError, true); assert.equal(failed.content.some(b => b.type === 'image'), false);
  assert.equal(proxy.meta.fault.code, 'CAPTURE_FAILED'); assert.equal(proxy.scheduler.halted, null);
  const count = raw.log.length; await call('click', { selector: '#x' }); assert.equal(raw.log.length, count);
  await proxy.close(); assert.equal(proxy.meta.cleanup_ok, true); assert.equal(raw.tabs.size, 0); assert.equal(raw.closed, true);
  const final = { cleanup_ok: true, queue_expiries: 0, uncertain_upstream: false, fault: proxy.meta.fault, public_disposition: proxy.meta.public_disposition };
  assert.ok(await verifyPublicDisposition(rawDir, final));
  const health = JSON.parse(await readFile(path.join(rawDir, 'public-health.json')));
  assert.equal(health.not_actor_frame, true); assert.equal(sha256(await readFile(health.png.path)), health.metadata.sha256);
  const steps = (await readFile(path.join(rawDir, 'steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  const bad = steps.find(row => row.native_capture_result);
  assert.equal(bad.screenshot_path, null); assert.equal(bad.frame_receipt, undefined);
  assert.ok(steps.every(row => row.tab_id !== proxy.upstream.getGuardId()));
  const closes = raw.log.filter(row => row.name === 'close_tab'); assert.equal(closes.length, 2);
  assert.equal(proxy.meta.child_cleanup.public_guard_disposal.post_close_inventory_requested, false);
});

test('failed independent health cannot turn missing capture into a completed public outcome', async t => {
  const { proxy, raw, call } = await fixture(t); raw.failCaptureNumber = 2; raw.failHealth = true;
  await call('read_page'); await proxy.close();
  assert.equal(proxy.meta.cleanup_ok, false); assert.equal(proxy.meta.public_disposition, undefined); assert.ok(proxy.scheduler.halted);
});

test('public in-flight capture or transport uncertainty forbids every cleanup mutation and disposition', async t => {
  for (const mode of ['pending', 'transport']) await t.test(mode, async t => {
    const { proxy, raw, call } = await fixture(t);
    if (mode === 'pending') { raw.failCaptureNumber = 2; raw.pendingCapture = true; await call('read_page'); }
    else { await call('read_page'); raw.transportFault = true; await call('click', { selector: '#x' }); }
    await proxy.close(); assert.equal(proxy.meta.cleanup_ok, false); assert.equal(proxy.meta.public_disposition, undefined);
    assert.equal(raw.log.filter(row => row.name === 'close_tab').length, 0); assert.ok(proxy.scheduler.halted);
  });
});

test('public attachment change blocks native dispatch and never silently regains a scope', async t => {
  let current = true;
  const { proxy, raw, call } = await fixture(t, { beforePublicDispatch: async () => ({ ok: current }) });
  const before = raw.log.length; current = false;
  await assert.rejects(call('read_page'), /attachment changed|ready/i);
  assert.equal(raw.log.length, before); assert.equal(proxy.meta.uncertain_upstream, true); assert.ok(proxy.scheduler.halted);
});

test('collector forwards public freeze/config/export and pauses unknown public failures without selecting or replaying', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'manual-public-collector-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const writes = [], calls = [];
  const options = { runDir: dir, tasks: [task], concurrency: 1, serverCommand: ['fake', '/public/build/index.js'], extensionDir: '/official/cws',
    publicRelease: true, publicPins: { published_version: '0.11.2' }, publicCatalog: CATALOG,
    dependencies: { keeper: { async initialize() {}, async close() {} }, fingerprint: async input => { assert.equal(input.publicRelease, true); return { public_fixture: true }; },
      circuit: async () => ({ allowed: true, ready: true }), validate: async () => ({ ok: true }),
      writeV2: async args => { writes.push(args); return { dir: '/fake/v2' }; },
      drive: async input => { calls.push(input); await input.beforeSpawn(); return { outcome: 'rig_failure', cleanup_ok: true, fault: { code: 'CAPTURE_FAILED' },
        uncertain_upstream: false, actor_mutations_dispatched: 1, model_spawn_requested: true }; } } };
  const { manifest } = await collectManual(options);
  assert.equal(manifest.config.public_release, true); assert.equal(manifest.config.profile_tool_count, 44);
  assert.equal(calls[0].public_release, true); assert.deepEqual(calls[0].publicPins, options.publicPins);
  assert.equal(manifest.state, 'paused_health'); assert.equal(manifest.collection_complete, false); assert.equal(manifest.outcomes.length, 0);
  assert.equal(manifest.attempts[0].requires_task_recovery, true); assert.equal(writes.length, 0);
  manifest.state = 'running'; manifest.attempts[0].requires_task_recovery = false;
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(collectManual({ ...options, resume: true }), /explicit recovery|ordinary resume/i); assert.equal(calls.length, 1);
});

test('collector selects only proven native failure raw evidence and continues without exporting a prefix or retrying the task', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'manual-public-proof-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const bytes = Buffer.from(JSON.stringify({ tools: CATALOG })), catalogPath = path.join(dir, 'tools.json'); await writeFile(catalogPath, bytes);
  const publicPins = { catalog: { path: catalogPath, bytes: bytes.length, sha256: sha256(bytes) } };
  const tasks = [task, { ...task, task_id: 'next' }], driven = [], written = [];
  const result = await collectManual({ runDir: dir, tasks, concurrency: 1, serverCommand: ['fake', '/public/build/index.js'],
    extensionDir: '/official/cws', publicRelease: true, publicPins,
    dependencies: { keeper: { async initialize() {}, async close() {} }, fingerprint: async () => ({ fixture: true }),
      circuit: async () => ({ allowed: true, ready: true }), validate: async () => ({ ok: true }),
      writeV2: async options => { written.push(options); return { dir: '/fixture/v2' }; },
      drive: async input => {
        driven.push(input.task.task_id); assert.equal(publicCatalogReceipt(input.publicCatalog).tool_count, 44); await input.beforeSpawn();
        if (input.task.task_id === 'next') return { outcome: 'complete', cleanup_ok: true, actor_mutations_dispatched: 1, model_spawn_requested: true };
        const { proxy, raw, call } = await fixture(t, { rawDir: input.rawDir, taskId: input.task.task_id, scheduler: input.scheduler });
        raw.failCaptureNumber = 2; await call('read_page'); await proxy.close();
        const final = { outcome: 'capture_failure', cleanup_ok: proxy.meta.cleanup_ok, fault: proxy.meta.fault,
          uncertain_upstream: false, queue_expiries: 0, public_disposition: proxy.meta.public_disposition,
          actor_mutations_dispatched: 1, action_count: 1, model_spawn_requested: true };
        await writeFile(path.join(input.rawDir, 'final.json'), JSON.stringify(final)); return final;
      } } });
  assert.equal(result.manifest.collection_complete, true); assert.deepEqual(driven, ['fixture', 'next']);
  assert.deepEqual(written.map(row => row.task.task_id), ['next']);
  assert.equal(path.basename(written[0].allowlistPath), 'browser-manual-public-v1.json');
  const first = result.manifest.outcomes[0];
  assert.equal(first.outcome, 'capture_failure'); assert.equal(first.outcome_kind, 'public_native_failure');
  assert.equal(first.selected_attempt, 1); assert.equal(first.exported, false); assert.equal(first.missing_frame, true);
  assert.equal(first.model_task_failure_demonstrated, false); assert.equal(result.manifest.attempts.length, 2);
  assert.equal(first.raw_dir, result.manifest.attempts[0].raw_dir);
});

test('collector rejects tampered native health or coincident provider failure before any terminal selection', async t => {
  for (const mode of ['tampered-health', 'provider-error']) await t.test(mode, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'manual-public-tamper-')); t.after(() => rm(dir, { recursive: true, force: true }));
  let drives = 0, writes = 0;
  const result = await collectManual({ runDir: dir, tasks: [task, { ...task, task_id: 'next' }], concurrency: 1,
    serverCommand: ['fake', '/public/build/index.js'], extensionDir: '/official/cws', publicRelease: true,
    publicPins: { fixture: true }, publicCatalog: CATALOG,
    dependencies: { keeper: { async initialize() {}, async close() {} }, fingerprint: async () => ({ fixture: true }),
      circuit: async () => ({ allowed: true, ready: true }), writeV2: async () => { writes++; },
      drive: async input => {
        drives++; await input.beforeSpawn();
        const { proxy, raw, call } = await fixture(t, { rawDir: input.rawDir, scheduler: input.scheduler });
        raw.failCaptureNumber = 2; await call('read_page'); await proxy.close();
        const final = { outcome: 'capture_failure', cleanup_ok: true, fault: proxy.meta.fault, uncertain_upstream: false,
          queue_expiries: 0, public_disposition: proxy.meta.public_disposition, actor_mutations_dispatched: 1, model_spawn_requested: true };
        if (mode === 'tampered-health') await writeFile(path.join(input.rawDir, 'public-health.png'), Buffer.from('changed'));
        else final.provider_error = 'Usage limit reached';
        await writeFile(path.join(input.rawDir, 'final.json'), JSON.stringify(final)); return final;
      } } });
  assert.equal(result.manifest.state, 'paused_health'); assert.equal(result.manifest.outcomes.length, 0);
  assert.equal(result.manifest.attempts[0].requires_task_recovery, true);
  assert.match(result.manifest.attempts[0].public_disposition_verification_error, mode === 'tampered-health' ? /artifact changed/ : /provider error/);
  assert.equal(drives, 1); assert.equal(writes, 0);
  });
});
