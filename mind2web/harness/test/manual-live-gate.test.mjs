import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { refForLabel, javascriptValue, hoverDispatchObserved, findOwnedFixturePopup, callActorTool, inspectArtifacts, manualLiveGate,
  settleOperations, FIXTURE_PATH, DEFAULT_PROFILE_PATH } from '../manual-live-gate.mjs';
import { encodeSolidPng } from '../png.mjs';
import { writeV2 } from '../v2-writer.mjs';
import { verifyLocalGateEvidence, verifyPilotExport } from '../repair-benchmark.mjs';
import { ManualRecordingProxy } from '../manual-recording-proxy.mjs';
import { resultData, resultOK } from '../mcp-record-proxy.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const textResult = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

test('snapshot ref selection requires one exact accessible label and never supplies CSS', () => {
  const snapshot = '`e7: button "Other"` `e12: button "Gate click"`\n`e13: textbox "Gate text"`';
  assert.equal(refForLabel(snapshot, 'Gate click'), 'e12');
  assert.throws(() => refForLabel(snapshot, 'click'), /exactly one/);
  assert.throws(() => refForLabel(snapshot + '\n`e20: button "Gate click"`', 'Gate click'), /exactly one/);
  assert.equal(refForLabel('`e2: button "Label (with + symbols)"`', 'Label (with + symbols)'), 'e2');
});

test('actor helper awaits emission acceptance before returning a coordinate-capable frame', async () => {
  let release, emitted = false;
  const acceptance = new Promise(resolve => { release = resolve; });
  const bytes = encodeSolidPng(120, 100, [20, 40, 60]);
  const result = textResult({ observation: { frame_id: 'unit-frame' } });
  result.content.push({ type: 'image', mimeType: 'image/png', data: bytes.toString('base64') });
  const proxy = { handle: async () => result,
    async noteEmitted(value) { assert.equal(value, result); await acceptance; emitted = true; } };
  let returned = false;
  const pending = callActorTool(proxy, 'capture_screenshot', {}, { imageCount: 1 }).then(value => { returned = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(returned, false);
  release();
  assert.equal((await pending).observation.frame_id, 'unit-frame');
  assert.equal(emitted, true);
});

test('invalid image bytes cannot be acknowledged as an emitted frame', async () => {
  let emitted = false;
  const proxy = { handle: async () => ({ content: [{ type: 'image', mimeType: 'image/png', data: 'invalid' }] }),
    async noteEmitted() { emitted = true; } };
  await assert.rejects(callActorTool(proxy, 'capture_screenshot'), /false !== true/);
  assert.equal(emitted, false);
});

async function unknownActionFixture(t, { flag, changeState = true } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'fsb-gate-unknown-'));
  const taskId = 'unit_completed_unknown', url = `http://127.0.0.1:32123/fixture?marker=${taskId}`;
  const state = { marker: taskId, clicks: 0 }, calls = [];
  let opened = false, captures = 0;
  const upstream = { async request(method, params = {}) {
    assert.equal(method, 'tools/call'); const { name, arguments: args } = params; calls.push({ name, args });
    if (name === 'list_tabs') return textResult({ success: true, tabs: opened ? [{ id: 42 }] : [] });
    if (name === 'open_tab') { opened = true; return textResult({ success: true, tabId: 42 }); }
    if (name === 'close_tab') { opened = false; return textResult({ success: true }); }
    if (name === 'switch_tab') return textResult({ success: true });
    if (name === 'click') {
      if (changeState) state.clicks++;
      return { isError: true, ...textResult({ outcome: 'unknown', mayHaveExecuted: true,
        error: 'Click was dispatched but its effect could not be confirmed.', ...(flag ? { [flag]: true } : {}) }) };
    }
    if (name === 'get_text') { assert.equal(args.selector, '#gate-state'); return textResult({ success: true, text: JSON.stringify(state) }); }
    if (name === 'execute_js') return textResult({ success: true, result: JSON.stringify(state) });
    if (name === 'capture_screenshot') {
      const bytes = encodeSolidPng(120, 100, [40, 60, 80]);
      return { content: [{ type: 'text', text: JSON.stringify({ capture_id: `capture-${++captures}`, source_url: url,
        timestamp: new Date().toISOString(), mode: 'viewport', css_rect: { x: 0, y: 0, width: 120, height: 100 },
        output_width: 120, output_height: 100, sha256: hash(bytes), byte_length: bytes.length,
        effective_emulation: { device_mode: 'current', device_scale_factor: 1 } }) },
      { type: 'image', mimeType: 'image/png', data: bytes.toString('base64') }] };
    }
    throw new Error(`Unexpected fake native tool ${name}`);
  }, async close() {} };
  const proxy = new ManualRecordingProxy({ upstream, rawDir: path.join(root, taskId), taskId, startUrl: url });
  proxy.gateCompletedUnknowns = [];
  t.after(async () => { await proxy.close(); await rm(root, { recursive: true, force: true }); });
  return { root, proxy, calls, state };
}

test('completed unknown keeps its failed native result and performs one emitted fresh read before exact state inspection, without replay', async t => {
  const f = await unknownActionFixture(t);
  const response = await callActorTool(f.proxy, 'click', { selector: 'e1' }, { observeCompletedUnknown: true, imageCount: 1 });
  assert.equal(resultOK(response.result), false); assert.equal(response.completed_unknown.native_success, false);
  assert.equal(response.completed_unknown.outcome, 'unknown'); assert.equal(response.completed_unknown.replayed, false);
  assert.equal(f.proxy.pendingVerification.size, 0, 'The actual proxy must receive the fresh read emission before another mutation');
  const inspected = await callActorTool(f.proxy, 'execute_js', { code: 'return JSON.parse(document.querySelector("#gate-state").textContent);' }, { imageCount: 1 });
  assert.equal(javascriptValue(inspected.rows).clicks, 1);
  assert.deepEqual(f.calls.filter(row => ['click', 'get_text', 'execute_js'].includes(row.name)).map(row => row.name), ['click', 'get_text', 'execute_js']);
  const steps = (await readFile(path.join(f.proxy.rawDir, 'steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(steps.map(row => row.tool), ['open_tab', 'click', 'get_text', 'execute_js']);
  assert.equal(steps[1].ok, false); assert.equal(steps[1].execution_outcome, 'unknown');
  assert.equal(f.proxy.meta.counts.actor_mutations_dispatched, 2, 'Only the one click plus the later explicit DOM assertion dispatch as mutations');
  const emissions = (await readFile(path.join(f.proxy.rawDir, 'emissions.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(emissions.some(row => row.frame_id === response.completed_unknown.fresh_read.frame_id));
  assert.equal(f.proxy.gateCompletedUnknowns.length, 1);
});

test('completed unknown is not itself a goal assertion when a fresh read shows no effect', async t => {
  const f = await unknownActionFixture(t, { changeState: false });
  await callActorTool(f.proxy, 'click', { selector: 'e1' }, { observeCompletedUnknown: true, imageCount: 1 });
  const inspected = await callActorTool(f.proxy, 'execute_js', { code: 'return JSON.parse(document.querySelector("#gate-state").textContent);' }, { imageCount: 1 });
  assert.throws(() => assert.equal(javascriptValue(inspected.rows).clicks, 1), /0 !== 1/);
  assert.equal(f.calls.filter(row => row.name === 'click').length, 1);
});

test('pending native work cannot use completed-unknown recovery or dispatch a fresh read', async t => {
  for (const flag of ['in_flight', 'cleanup_pending']) await t.test(flag, async t => {
    const f = await unknownActionFixture(t, { flag });
    await assert.rejects(callActorTool(f.proxy, 'click', { selector: 'e1' }, { observeCompletedUnknown: true, imageCount: 1 }), /unresolved native work/);
    assert.equal(f.calls.filter(row => row.name === 'click').length, 1);
    assert.equal(f.calls.some(row => row.name === 'get_text' || row.name === 'execute_js'), false);
    assert.equal(f.proxy.meta.uncertain_upstream, true);
  });
});

test('ordinary queue refusals retain their queue code instead of entering completed-unknown recovery', async () => {
  let calls = 0;
  const proxy = { handle: async () => { calls++; return { isError: true, ...textResult({ code: 'BROWSER_QUEUE_TIMEOUT', execution_outcome: 'not_executed' }) }; }, async noteEmitted() {} };
  await assert.rejects(callActorTool(proxy, 'click', { selector: 'e1' }, { observeCompletedUnknown: true, imageCount: 1 }), { code: 'BROWSER_QUEUE_TIMEOUT' });
  assert.equal(calls, 1);
});

test('an unknown result without its physical PNG cannot dispatch an observation-recovery read', async () => {
  let calls = 0;
  const proxy = { handle: async () => { calls++; return { isError: true, ...textResult({ outcome: 'unknown', mayHaveExecuted: true }) }; }, async noteEmitted() {} };
  await assert.rejects(callActorTool(proxy, 'click', { selector: 'e1' }, { observeCompletedUnknown: true, imageCount: 1 }), /requires its actual native PNG/);
  assert.equal(calls, 1);
});

test('JavaScript DOM values are decoded without treating the observation receipt as the value', () => {
  assert.deepEqual(javascriptValue([{ observation: {} }, { result: '{"marker":"unit"}' }]), { marker: 'unit' });
  assert.throws(() => javascriptValue([{ observation: {} }]), /no value/);
});

test('live execution is refused before touching an output directory without staging authorization', async () => {
  const output = path.join(tmpdir(), `fsb-gate-not-created-${process.pid}-${Date.now()}`);
  await assert.rejects(manualLiveGate({ outputDir: output }), /explicit authorization/);
  await assert.rejects(stat(output), error => error.code === 'ENOENT');
});

test('a failed concurrent operation drains its started peers before cleanup can begin', async () => {
  let release, rejected = false;
  const peer = new Promise(resolve => { release = resolve; });
  const pending = settleOperations([Promise.reject(new Error('failed operation')), peer]);
  pending.catch(() => { rejected = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rejected, false);
  release('finished peer');
  await assert.rejects(pending, /failed operation/);
});

async function artifactFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'fsb-gate-unit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const taskId = 'unit_gate_provenance', rawDir = path.join(root, taskId);
  await mkdir(path.join(rawDir, 'shots'), { recursive: true });
  const url = 'http://127.0.0.1:32123/fixture?marker=unit-marker';
  const steps = [];
  for (let seq = 0; seq < 3; seq++) {
    const bytes = encodeSolidPng(120, 100, [40 + seq * 20, 50, 60]);
    const screenshot = path.join(rawDir, 'shots', `${seq}.png`);
    await writeFile(screenshot, bytes);
    const receipt = { frame_id: `unit-frame-${seq}`, task_id: taskId, tab_id: 42,
      capture_id: `unit-capture-${seq}`, source_url: url, sha256: hash(bytes), byte_length: bytes.length };
    steps.push({ seq, kind: ['bootstrap', 'action', 'read'][seq], tool: ['open_tab', 'click', 'read_page'][seq],
      args: seq ? { selector: 'e1' } : { url }, tab_id: 42, ok: true, url,
      screenshot_path: screenshot, frame_receipt: receipt });
  }
  await writeFile(path.join(rawDir, 'steps.jsonl'), steps.map(row => JSON.stringify(row)).join('\n') + '\n');
  await writeFile(path.join(rawDir, 'emissions.jsonl'), steps.slice(1).map(row => JSON.stringify({ frame_id: row.frame_receipt.frame_id })).join('\n') + '\n');
  await writeFile(path.join(rawDir, 'final.json'), JSON.stringify({ outcome: 'complete', final_answer: 'unit fixture' }));
  const task = { task_id: taskId, confirmed_task: 'Unit-test frame provenance', website: url, reference_length: 1 };
  const written = await writeV2({ rawDir, outDir: path.join(root, 'trajectories'), allowlistPath: DEFAULT_PROFILE_PATH, task });
  const options = { rawDir, exportDir: written.dir, expectedOrigin: new URL(url).origin, allowedMarkers: ['unit-marker'] };
  return { root, task, options, steps, rawDir, exportDir: written.dir };
}

test('artifact check binds native receipt bytes, source task, emissions and action-specific exports', async t => {
  const f = await artifactFixture(t);
  const checked = await inspectArtifacts(f.options);
  assert.equal(checked.physical_frames, 3);
  assert.equal(checked.emitted_frames, 2);
  assert.equal(checked.exported_frames, 3);
  assert.equal(checked.frames[0].source_url, f.steps[0].url);
});

test('a valid PNG from the wrong operation cannot replace an exported action frame', async t => {
  const f = await artifactFixture(t);
  await copyFile(f.steps[2].screenshot_path, path.join(f.exportDir, 'trajectory/0001.png'));
  await assert.rejects(inspectArtifacts(f.options), /corresponding native frame/);
});

test('foreign task source metadata fails even when the PNG and hash are valid', async t => {
  const f = await artifactFixture(t);
  f.steps[1].url = f.steps[1].frame_receipt.source_url = 'http://127.0.0.1:32123/fixture?marker=foreign';
  await writeFile(path.join(f.rawDir, 'steps.jsonl'), f.steps.map(row => JSON.stringify(row)).join('\n') + '\n');
  await assert.rejects(inspectArtifacts(f.options), /another fixture task/);
});

test('a retained PNG without actor delivery acknowledgement fails the gate', async t => {
  const f = await artifactFixture(t);
  await writeFile(path.join(f.rawDir, 'emissions.jsonl'), JSON.stringify({ frame_id: 'unit-frame-2' }) + '\n');
  await assert.rejects(inspectArtifacts(f.options), /not acknowledged/);
});

test('resumed local evidence rechecks native PNGs, emissions, exported frames and source bytes', async t => {
  const f = await artifactFixture(t), sourcePath = path.join(f.root, 'fixture-source.js');
  const sourceBytes = Buffer.from('Synthetic unit source; no browser calls.\n'); await writeFile(sourcePath, sourceBytes);
  const sources = [{ path: sourcePath, bytes: sourceBytes.length, sha256: hash(sourceBytes) }];
  const command = ['/unit/node', '/unit/build/index.js', 'stdio'];
  await writeFile(path.join(f.root, 'manifest.json'), JSON.stringify({ sources, command_sha256: hash(JSON.stringify(command)) }));
  const summary = { sources, sessions: [{ raw_dir: f.rawDir, export_dir: f.exportDir, marker: 'unit-marker', artifacts: await inspectArtifacts(f.options) }] };
  assert.equal((await verifyLocalGateEvidence(summary, { gateDir: f.root, serverCommand: command })).ok, true);
  const original = await readFile(f.steps[0].screenshot_path);
  await writeFile(f.steps[0].screenshot_path, encodeSolidPng(120, 100, [150, 10, 20]));
  await assert.rejects(verifyLocalGateEvidence(summary, { gateDir: f.root, serverCommand: command }));
  await writeFile(f.steps[0].screenshot_path, original);
  await writeFile(sourcePath, 'Changed source bytes');
  await assert.rejects(verifyLocalGateEvidence(summary, { gateDir: f.root, serverCommand: command }), /Saved pipeline evidence changed/);
});

test('pilot export reuse regenerates from raw evidence and rejects a valid but substituted PNG', async t => {
  const f = await artifactFixture(t);
  const attempt = { raw_dir: f.rawDir, final: { outcome: 'complete' } };
  const row = { task_id: f.task.task_id, raw_dir: f.rawDir, outcome: 'complete' };
  const options = { directory: f.root, row, attempt, task: f.task };
  await verifyPilotExport(options);
  await copyFile(f.steps[2].screenshot_path, path.join(f.exportDir, 'trajectory/0001.png'));
  await assert.rejects(verifyPilotExport(options), /physical export differs/);
});

function fixtureDom(html, query) {
  const handlers = new Map(), nodes = new Map(), opened = [], intervals = [], timeouts = [];
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
    nodes.set(id, { textContent: '', hidden: false,
      addEventListener(type, callback) { handlers.set(`${id}:${type}`, callback); },
      getContext: () => ({ fillRect() {}, fillText() {} }) });
  }
  const location = new URL(`http://fixture.test/fixture?${query}`);
  const sandbox = { URL, URLSearchParams, location,
    document: { getElementById: id => nodes.get(id) },
    window: { open: (...args) => opened.push(args) },
    setInterval: callback => { intervals.push(callback); return intervals.length; },
    clearInterval() {}, setTimeout: callback => timeouts.push(callback) };
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, sandbox);
  return { nodes, opened, intervals, timeouts,
    fire(id, type, event = {}) { handlers.get(`${id}:${type}`)({ target: {}, isTrusted: false, preventDefault() {}, ...event }); },
    state: () => JSON.parse(nodes.get('gate-state').textContent) };
}

test('fixture labels remain accessible siblings so the actual snapshot walker emits all four input refs', async () => {
  const html = await readFile(FIXTURE_PATH, 'utf8');
  const section = html.match(/<section id="controls">([\s\S]*?)<\/section>/)[1];
  const makeNode = (tag, attrs = {}, parent = null) => ({ nodeType: 1, tagName: tag.toUpperCase(), dataset: {},
    children: [], childNodes: [], parentElement: parent,
    getAttribute: key => attrs[key] ?? null, hasAttribute: key => key in attrs,
    getBoundingClientRect: () => ({ width: 100, height: 20 }), get textContent() { return this.childNodes.map(node => node.textContent).join(''); } });
  const root = makeNode('section'), stack = [root], nodes = [];
  for (const token of section.match(/<[^>]+>|[^<]+/g)) {
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (token.startsWith('<')) {
      const tag = token.match(/^<([a-z]+)/i)[1], attrs = Object.fromEntries([...token.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
      const parent = stack.at(-1), node = makeNode(tag, attrs, parent); parent.children.push(node); parent.childNodes.push(node); nodes.push(node);
      if (!['input', 'br', 'hr'].includes(tag)) stack.push(node);
    } else stack.at(-1).childNodes.push({ nodeType: 3, textContent: token });
  }
  const targets = ['gate-text', 'gate-enter', 'gate-select', 'gate-checkbox'].map(id => nodes.find(node => node.getAttribute('id') === id));
  assert.ok(targets.every(node => node && node.parentElement.tagName !== 'LABEL'));
  for (const node of targets) assert.ok(nodes.some(label => label.tagName === 'LABEL' && label.getAttribute('for') === node.getAttribute('id')));
  const interactive = new Set(nodes.filter(node => ['LABEL', 'INPUT', 'SELECT', 'BUTTON'].includes(node.tagName)));
  const refMap = { map: new Map([...interactive].map((node, index) => [`e${index + 1}`, { element: { deref: () => node } }])) };
  const analysisPath = new URL('../../../extension/content/dom-analysis.js', import.meta.url);
  const source = await readFile(analysisPath, 'utf8');
  const begin = source.indexOf('  const BLOCK_TAGS = new Set([');
  const end = source.indexOf('  /**\n   * Build a unified markdown snapshot', begin);
  assert.ok(begin > 0 && end > begin);
  const context = vm.createContext({ Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    isFsbElement: () => false, FSB: {}, logger: { logDOMOperation() {} }, getRegion: () => '@main',
    getImplicitRole: node => node.tagName === 'INPUT' ? node.getAttribute('type') === 'checkbox' ? 'checkbox' : 'textbox' : node.tagName === 'SELECT' ? 'combobox' : null,
    computeAccessibleName: node => ({ name: node.getAttribute('aria-label') ?? '' }),
    window: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
    SHEETS_CELL_REF_REGEX: /^[A-Z]+\d+$/ });
  const walk = vm.runInContext(source.slice(begin, end) + '\nwalkDOMToMarkdown;', context);
  const markdown = walk(root, interactive, refMap, null).map(row => row.text).join('\n');
  for (const label of ['Gate text', 'Gate Enter', 'Gate selection', 'Gate checkbox']) assert.match(refForLabel(markdown, label), /^e\d+$/);
  // Moving controls back inside interactive labels reproduces the saved omission.
  for (const node of targets) {
    const label = nodes.find(candidate => candidate.getAttribute('for') === node.getAttribute('id'));
    const parent = node.parentElement; parent.childNodes = parent.childNodes.filter(child => child !== node);
    label.childNodes.push(node); node.parentElement = label;
  }
  const nested = walk(root, interactive, refMap, null).map(row => row.text).join('\n');
  assert.throws(() => refForLabel(nested, 'Gate text'), /exactly one/);
});

test('local fixture exposes observable state changes and document-specific popup markers', async () => {
  const html = await readFile(FIXTURE_PATH, 'utf8');
  const h = fixtureDom(html, 'marker=unit-marker');
  h.fire('gate-click', 'click');
  h.fire('gate-text', 'input', { target: { value: 'typed' } });
  h.fire('gate-enter', 'keydown', { key: 'Enter' });
  h.fire('gate-select', 'change', { target: { value: 'blue' } });
  h.fire('gate-checkbox', 'change', { target: { checked: true } });
  h.fire('gate-hover', 'mouseenter'); h.fire('gate-canvas', 'click');
  assert.deepEqual(h.state(), { marker: 'unit-marker', clicks: 1, typed: 'typed', enters: 1,
    selected: 'blue', checked: true, hovered: 1, hover_synthetic: 1, hover_trusted: 0, canvas: 1, churn: false });
  h.fire('gate-popup', 'click');
  const destination = new URL(h.opened[0][0]);
  assert.equal(destination.searchParams.get('marker'), 'unit-marker-popup');
  assert.equal(destination.searchParams.get('child'), '1');
  assert.equal(h.nodes.get('gate-popup').hidden, true);
  h.fire('gate-churn', 'click'); h.intervals[0]();
  assert.equal(h.state().churn, true);
  assert.match(h.nodes.get('gate-tick').textContent, /DOM tick 1/);
  h.timeouts[0](); assert.equal(h.state().churn, false);
  const child = fixtureDom(html, 'marker=unit-marker-popup&mode=isolation&child=1');
  assert.equal(child.nodes.get('controls').hidden, true);
  assert.equal(child.nodes.get('gate-popup').hidden, true);
  assert.match(child.nodes.get('after-svg').textContent, /unit-marker-popup/);
});

test('actual fixture distinguishes one dispatched hover from ambient trusted entries and duplicate dispatches', async () => {
  const h = fixtureDom(await readFile(FIXTURE_PATH, 'utf8'), 'marker=unit-hover');
  h.fire('gate-hover', 'mouseenter', { isTrusted: true });
  const before = h.state();
  h.fire('gate-hover', 'mouseenter', { isTrusted: true });
  assert.equal(hoverDispatchObserved(h.state(), before), false, 'Ambient native pointer entry must not prove tool dispatch');
  h.fire('gate-hover', 'mouseenter', { isTrusted: false });
  h.fire('gate-hover', 'mouseenter', { isTrusted: true });
  assert.equal(hoverDispatchObserved(h.state(), before), true);
  assert.equal(h.state().hovered, 4); assert.equal(h.state().hover_synthetic, 1); assert.equal(h.state().hover_trusted, 3);
  h.fire('gate-hover', 'mouseenter', { isTrusted: false });
  assert.equal(hoverDispatchObserved(h.state(), before), false, 'Two synthetic entries must not satisfy exact-one assertion');
  assert.equal(hoverDispatchObserved({ ...h.state(), hover_synthetic: undefined }, before), false);
});

function popupFixture({ stateMarker = 'unit-popup', captureMarker = 'unit-popup', childIds = [42] } = {}) {
  const calls = [], emitted = [], bytes = encodeSolidPng(120, 100, [20, 40, 60]);
  const proxy = { startUrl: 'http://127.0.0.1:32123/fixture?marker=unit&mode=full',
    async handle(method, { name, arguments: args }) {
      assert.equal(method, 'tools/call'); calls.push({ name, args });
      if (name === 'list_tabs') return textResult({ success: true, tabs: [7, ...childIds].map(id => ({ id, title: 'FSB manual browser gate', domain: '127.0.0.1' })) });
      assert.equal(args.tab_id, 42);
      const result = name === 'get_page_snapshot' ? textResult({ success: true, snapshot: '`e1: button "Gate click"`' })
        : name === 'execute_js' ? textResult({ success: true, result: JSON.stringify({ marker: stateMarker }) })
        : assert.fail(`Unexpected tool ${name}`);
      result.content.push({ type: 'text', text: JSON.stringify({ observation: { tab_id: 42, frame_id: `frame-${name}`,
        capture_id: `capture-${name}`, source_url: `http://127.0.0.1:32123/fixture?marker=${captureMarker}&mode=isolation&child=1` } }) },
      { type: 'image', mimeType: 'image/png', data: bytes.toString('base64') });
      return result;
    }, async noteEmitted(result) { emitted.push(result); } };
  return { proxy, calls, emitted };
}

test('popup discovery accepts URL-free scoped inventory only after emitted child capture and exact state verification', async () => {
  const f = popupFixture();
  const popup = await findOwnedFixturePopup(f.proxy, { primary: 7, marker: 'unit', attempts: 1 });
  assert.equal(popup.id, 42); assert.equal(popup.identity.state_marker, 'unit-popup');
  assert.equal(popup.identity.frame_id, 'frame-get_page_snapshot');
  assert.deepEqual(f.calls.map(row => row.name), ['list_tabs', 'get_page_snapshot', 'execute_js']);
  assert.equal(f.emitted.length, 3, 'Each consumed response must be acknowledged before discovery returns');
  assert.equal(f.calls.some(row => row.name === 'click' || row.name === 'click_at'), false);
});

test('an owned child with the wrong capture or state marker cannot pass popup discovery', async () => {
  const wrongCapture = popupFixture({ captureMarker: 'other-popup' });
  await assert.rejects(findOwnedFixturePopup(wrongCapture.proxy, { primary: 7, marker: 'unit', attempts: 1 }), /capture has the wrong task marker/);
  assert.deepEqual(wrongCapture.calls.map(row => row.name), ['list_tabs', 'get_page_snapshot']);
  const wrongState = popupFixture({ stateMarker: 'other-popup' });
  await assert.rejects(findOwnedFixturePopup(wrongState.proxy, { primary: 7, marker: 'unit', attempts: 1 }), /state has the wrong task marker/);
  const ambiguous = popupFixture({ childIds: [42, 43] });
  await assert.rejects(findOwnedFixturePopup(ambiguous.proxy, { primary: 7, marker: 'unit', attempts: 1 }), /more than one additional owned tab/);
  assert.deepEqual(ambiguous.calls.map(row => row.name), ['list_tabs']);
});
