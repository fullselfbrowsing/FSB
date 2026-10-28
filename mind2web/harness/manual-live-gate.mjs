import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ManualRecordingProxy } from './manual-recording-proxy.mjs';
import { BrowserScheduler } from './browser-scheduler.mjs';
import { ALLOWED_TOOLS, PROFILE } from './browser-manual-profile.mjs';
import { ownedTabsFromResult } from './owned-task-session.mjs';
import { resultData, resultOK } from './mcp-record-proxy.mjs';
import { inspectPng } from './png.mjs';
import { writeV2 } from './v2-writer.mjs';
import { validateTrajectoryDir } from './validate-v2.mjs';
import { percentile } from './manual-pilot.mjs';
import { QUEUE_TIMEOUT_CODES, MISSING_QUEUE_EXPORT_CODES, queueTimingEvidence } from './queue-timing.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
export const FIXTURE_PATH = path.join(HERE, 'fixtures/manual-live-gate.html');
export const DEFAULT_PROFILE_PATH = path.resolve(HERE, '../config/browser-manual-v2.json');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const imageBlocks = result => (result?.content ?? []).filter(item => item.type === 'image');

export async function settleOperations(operations) {
  const settled = await Promise.allSettled(operations);
  const failure = settled.find(row => row.status === 'rejected');
  if (failure) throw failure.reason;
  return settled.map(row => row.value);
}

export function refForLabel(snapshot, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...snapshot.matchAll(new RegExp(`\\b(e\\d+):\\s+[^\\s\x60]+\\s+"${escaped}"`, 'g'))];
  assert.equal(matches.length, 1, `Expected exactly one snapshot ref for ${label}`);
  return matches[0][1];
}

export function javascriptValue(rows) {
  const row = rows.find(value => value.result !== undefined || value.value !== undefined);
  assert.ok(row, 'execute_js returned no value');
  const value = row.result ?? row.value;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

export function hoverDispatchObserved(state, before) {
  const valid = value => value && ['hovered', 'hover_synthetic', 'hover_trusted']
    .every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
    && value.hovered === value.hover_synthetic + value.hover_trusted;
  return valid(before) && valid(state)
    && state.hover_synthetic === before.hover_synthetic + 1
    && state.hover_trusted >= before.hover_trusted;
}

// The gate consumes the result, then records its delivery before another call can use the frame.
export async function callActorTool(proxy, name, args = {}, { allowFailure = false, observeCompletedUnknown = false, imageCount } = {}) {
  const result = await proxy.handle('tools/call', { name, arguments: args });
  const rows = resultData(result), images = imageBlocks(result);
  const observation = rows.find(row => row.observation)?.observation ?? null;
  for (const block of images) {
    assert.equal(block.mimeType, 'image/png');
    assert.equal(inspectPng(Buffer.from(block.data, 'base64')).ok, true);
  }
  await proxy.noteEmitted(result);
  let completedUnknown;
  const native = rows.find(row => row.outcome === 'unknown' && row.mayHaveExecuted === true);
  if (!resultOK(result) && observeCompletedUnknown && native) {
    assert.ok(!rows.some(row => row.in_flight === true || row.cleanup_pending === true || row.pending === true)
      && !proxy.meta?.uncertain_upstream && !proxy.meta?.capture_cleanup_pending && !proxy.meta?.fault
      && !proxy.scheduler?.halted, `${name}: unresolved native work cannot be inspected as a completed action`);
    assert.equal(images.length, 1, `${name}: completed unknown requires its actual native PNG`);
    assert.ok(observation?.frame_id && observation?.operation_id && Number.isInteger(observation?.tab_id), `${name}: completed unknown requires a physical observation identity`);
    const bytes = Buffer.from(images[0].data, 'base64'), image = inspectPng(bytes);
    assert.equal(observation.sha256, digest(bytes)); assert.equal(observation.byte_length, bytes.length);
    assert.equal(observation.output_width, image.width); assert.equal(observation.output_height, image.height);
    assert.equal(observation.tab_id, args.tab_id ?? args.tabId ?? proxy.tabId);
    if (proxy.taskId) assert.equal(observation.task_id, proxy.taskId);
    if (proxy.session) assert.equal(proxy.session.resolveTarget({ tab_id: observation.tab_id }), observation.tab_id);
    // An observation delivered with an unknown action does not authorize another
    // mutation. This fresh read preserves the ref generation and verifies state.
    const fresh = await callActorTool(proxy, 'get_text', { tab_id: observation.tab_id, selector: '#gate-state' }, { imageCount: 1 });
    assert.notEqual(fresh.observation?.frame_id, observation.frame_id);
    assert.equal(fresh.observation?.tab_id, observation.tab_id);
    assert.equal(fresh.observation?.source_url, observation.source_url);
    const state = JSON.parse(fresh.rows.find(row => typeof row.text === 'string')?.text ?? 'null');
    assert.ok(state && typeof state.marker === 'string', 'Fresh fixture observation returned no task marker');
    const expectedMarker = new URL(observation.source_url).searchParams.get('marker');
    if (proxy.taskId) assert.ok([proxy.taskId, `${proxy.taskId}-popup`].includes(expectedMarker));
    assert.equal(state.marker, expectedMarker);
    completedUnknown = { tool: name, native_success: false, outcome: native.outcome, mayHaveExecuted: true,
      native_result: rows.filter(row => !row.observation), operation_id: observation.operation_id,
      tab_id: observation.tab_id, capture_id: observation.capture_id, frame_id: observation.frame_id,
      fresh_read: { tool: 'get_text', operation_id: fresh.observation.operation_id,
        frame_id: fresh.observation.frame_id, capture_id: fresh.observation.capture_id, source_url: fresh.observation.source_url },
      replayed: false, confirmation: 'Fresh fixture observation; caller independently asserts exact goal state' };
    proxy.gateCompletedUnknowns?.push(completedUnknown);
  }
  if (!allowFailure && !completedUnknown && !resultOK(result)) throw Object.assign(new Error(`${name}: ${JSON.stringify(rows)}`), { code: rows.find(row => row.code)?.code ?? 'ACTOR_TOOL_FAILED' });
  if (imageCount !== undefined && images.length !== imageCount) throw Object.assign(new Error(`${name}: unexpected inline image count`), { code: 'ACTOR_IMAGE_COUNT' });
  return { result, rows, observation, images: images.length, completed_unknown: completedUnknown ?? null };
}

export async function inspectArtifacts({ rawDir, expectedOrigin, allowedMarkers, exportDir }) {
  const steps = (await readFile(path.join(rawDir, 'steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  const emissions = (await readFile(path.join(rawDir, 'emissions.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  const emitted = new Set(emissions.map(row => row.frame_id));
  const frames = [];
  let lastFrame;
  const expectedExport = [];
  for (const entry of steps) {
    if (['research_read', 'denied', 'foreign_read'].includes(entry.kind)) {
      assert.equal(entry.screenshot_path, null, 'Research, denied and foreign-tab reads must not invent images');
      continue;
    }
    assert.ok(entry.screenshot_path, `${entry.tool} seq ${entry.seq} has no physical capture`);
    const bytes = await readFile(entry.screenshot_path), png = inspectPng(bytes), receipt = entry.frame_receipt;
    assert.equal(png.ok, true);
    assert.ok(png.width >= 100 && png.height >= 100, 'Expected a real viewport, not a placeholder PNG');
    assert.equal(receipt?.sha256, digest(bytes));
    assert.equal(receipt.byte_length, bytes.length);
    assert.equal(receipt.task_id, path.basename(rawDir));
    const url = new URL(receipt.source_url);
    assert.equal(url.origin, expectedOrigin);
    assert.equal(url.pathname, '/fixture');
    assert.ok(allowedMarkers.includes(url.searchParams.get('marker')), 'Capture source belongs to another fixture task');
    assert.equal(receipt.tab_id, entry.tab_id);
    assert.equal(entry.url, receipt.source_url);
    if (entry.kind !== 'bootstrap') assert.ok(emitted.has(receipt.frame_id), 'Actor image was not acknowledged as emitted');
    frames.push({ seq: entry.seq, tool: entry.tool, task_id: receipt.task_id, tab_id: receipt.tab_id,
      sha256: receipt.sha256, capture_id: receipt.capture_id, source_url: receipt.source_url,
      byte_length: bytes.length, path: entry.screenshot_path });
    lastFrame = frames.at(-1);
    if (entry.kind === 'bootstrap' || entry.kind === 'action') expectedExport.push(lastFrame);
  }
  assert.ok(lastFrame);
  expectedExport.push(lastFrame);
  const exported = JSON.parse(await readFile(path.join(exportDir, 'result.json'), 'utf8'));
  assert.equal(exported.action_history.length, expectedExport.length);
  for (const [index, entry] of exported.action_history.entries()) {
    const bytes = await readFile(path.join(exportDir, 'trajectory', entry.screenshot));
    assert.equal(digest(bytes), expectedExport[index].sha256, 'Export did not retain the corresponding native frame bytes');
    assert.equal(entry.url, expectedExport[index].source_url);
  }
  return { physical_frames: frames.length, emitted_frames: emissions.length,
    exported_frames: exported.action_history.length, frames };
}

async function sourceDescriptor(file) {
  const bytes = await readFile(file);
  return { path: file, sha256: digest(bytes), bytes: bytes.length };
}

async function startFixtureServer() {
  const html = await readFile(FIXTURE_PATH);
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname !== '/fixture') { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(html);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}

function fixtureUrl(origin, marker, mode = 'full') {
  const url = new URL('/fixture', origin);
  url.searchParams.set('marker', marker); url.searchParams.set('mode', mode);
  return url.href;
}

async function pageState(proxy, tabId) {
  return javascriptValue((await callActorTool(proxy, 'execute_js', {
    tab_id: tabId, code: 'return JSON.parse(document.querySelector("#gate-state").textContent);'
  }, { imageCount: 1 })).rows);
}

async function snapshotRef(proxy, label, tabId) {
  const response = await callActorTool(proxy, 'get_page_snapshot', { tab_id: tabId }, { imageCount: 1 });
  const snapshot = response.rows.find(row => typeof row.snapshot === 'string')?.snapshot;
  assert.ok(snapshot, 'Native snapshot did not return markdown');
  return refForLabel(snapshot, label);
}

export async function findOwnedFixturePopup(proxy, { primary, marker, attempts = 5, delayMs = 200 }) {
  let popup;
  for (let attempt = 0; attempt < attempts && !popup; attempt++) {
    const inventory = await callActorTool(proxy, 'list_tabs', {}, { imageCount: 0 });
    const owned = ownedTabsFromResult(inventory.result);
    assert.ok(owned.some(row => row.id === primary), 'Popup inventory lost the primary fixture tab');
    const children = owned.filter(row => row.id !== primary);
    assert.ok(children.length <= 1, 'Popup fixture produced more than one additional owned tab');
    popup = children[0];
    if (!popup && attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  assert.ok(popup, 'The trusted fixture click did not produce a task-owned popup');
  // Scoped inventory supplies ownership, not a destination URL. Verify the child
  // through its own emitted observation before using it for isolation assertions.
  const observed = await callActorTool(proxy, 'get_page_snapshot', { tab_id: popup.id }, { imageCount: 1 });
  assert.equal(observed.observation?.tab_id, popup.id);
  const actual = new URL(observed.observation?.source_url);
  const parent = new URL(proxy.startUrl);
  assert.equal(actual.origin, parent.origin, 'Owned popup capture has the wrong fixture origin');
  assert.equal(actual.pathname, '/fixture');
  assert.equal(actual.searchParams.get('marker'), `${marker}-popup`, 'Owned popup capture has the wrong task marker');
  assert.equal(actual.searchParams.get('mode'), 'isolation');
  assert.equal(actual.searchParams.get('child'), '1');
  const state = await pageState(proxy, popup.id);
  assert.equal(state.marker, `${marker}-popup`, 'Owned popup state has the wrong task marker');
  return { ...popup, identity: { tab_id: popup.id, source_url: actual.href, state_marker: state.marker,
    frame_id: observed.observation.frame_id, capture_id: observed.observation.capture_id } };
}

async function clickCoordinates(proxy, selector, tabId, { observeCompletedUnknown = false } = {}) {
  const geometry = await callActorTool(proxy, 'execute_js', { tab_id: tabId,
    code: `const element = document.querySelector(${JSON.stringify(selector)}); element.scrollIntoView({block:"center",behavior:"instant"}); const rect = element.getBoundingClientRect(); return {x:rect.left + rect.width/2,y:rect.top + rect.height/2};`
  }, { imageCount: 1 });
  assert.ok(geometry.observation?.frame_id);
  const point = javascriptValue(geometry.rows);
  return callActorTool(proxy, 'click_at', { tab_id: tabId, frame_id: geometry.observation.frame_id, x: point.x, y: point.y }, { imageCount: 1, observeCompletedUnknown });
}

async function exportSession(context, outputDir, profilePath, origin) {
  const { proxy, taskId, marker, rawDir } = context;
  const task = { task_id: taskId, confirmed_task: 'Verify the local browser-manual FSB fixture state and retain real observation evidence.',
    website: proxy.startUrl, reference_length: 7, level: 'easy' };
  await writeFile(path.join(rawDir, 'final.json'), json({ task_id: taskId, outcome: 'complete',
    final_answer: `Local installed-FSB checks passed for ${marker}.`, synthetic: true, benchmark_result: false }));
  const written = await writeV2({ task, rawDir, outDir: path.join(outputDir, 'trajectories'), allowlistPath: profilePath });
  const validation = await validateTrajectoryDir(written.dir);
  assert.equal(validation.ok, true, validation.errors.join('; '));
  context.artifacts = await inspectArtifacts({ rawDir, expectedOrigin: origin,
    allowedMarkers: [marker, `${marker}-popup`], exportDir: written.dir });
  context.export_dir = written.dir;
}

export async function refBoundaryChecks(proxy, primary, check) {
  const before = await pageState(proxy, primary);
  const identityRef = await snapshotRef(proxy, 'Gate click', primary);
  const unknownRef = 'e999999999';
  const traps = await callActorTool(proxy, 'execute_js', { tab_id: primary, code: `
    const original = document.getElementById('gate-click');
    const duplicate = original.cloneNode(true);
    duplicate.setAttribute('data-gate-ref-trap', 'css');
    duplicate.setAttribute('aria-label', 'Gate CSS collision');
    duplicate.addEventListener('click', () => { document.body.dataset.gateCssTrap = String(Number(document.body.dataset.gateCssTrap || 0) + 1); });
    original.before(duplicate);
    for (const ref of ${JSON.stringify([identityRef, unknownRef])}) {
      const tag = document.createElement(ref);
      tag.textContent = 'Compact reference CSS tag trap ' + ref;
      tag.setAttribute('data-gate-ref-trap', ref);
      tag.style.display = 'inline-block'; tag.style.padding = '8px';
      tag.addEventListener('click', () => { document.body.dataset.gateTagTrap = String(Number(document.body.dataset.gateTagTrap || 0) + 1); });
      original.before(tag);
    }
    return { duplicate_ids: document.querySelectorAll('#gate-click').length, original_connected: original.isConnected };
  ` }, { imageCount: 1 });
  assert.equal(javascriptValue(traps.rows).duplicate_ids, 2);
  const identityClick = await callActorTool(proxy, 'click', { tab_id: primary, selector: identityRef }, { imageCount: 1, observeCompletedUnknown: true });
  assert.equal((await pageState(proxy, primary)).clicks, before.clicks + 1, 'Connected compact ref must retain exact identity despite CSS collisions');
  const rejected = await callActorTool(proxy, 'click', { tab_id: primary, selector: unknownRef }, { allowFailure: true, imageCount: 1 });
  assert.equal(resultOK(rejected.result), false);
  assert.match(JSON.stringify(rejected.rows), /Unknown ref|stale|not found/i, 'Unknown compact refs must fail closed rather than query an identically named HTML tag');
  const collisionState = javascriptValue((await callActorTool(proxy, 'execute_js', { tab_id: primary, code: `
    const counts = { css: Number(document.body.dataset.gateCssTrap || 0), tag: Number(document.body.dataset.gateTagTrap || 0) };
    document.querySelectorAll('[data-gate-ref-trap]').forEach(element => element.remove());
    return counts;
  ` }, { imageCount: 1 })).rows);
  assert.deepEqual(collisionState, { css: 0, tag: 0 });
  check('compact_ref_exact_identity_and_unknown_fail_closed', { ref: identityRef, unknown_ref: unknownRef, collisions: collisionState,
    native_success: resultOK(identityClick.result), completed_unknown: identityClick.completed_unknown });

  const precedenceBefore = await pageState(proxy, primary);
  const textClick = await callActorTool(proxy, 'click', { tab_id: primary, selector: unknownRef, text: 'Increment this tab' }, { imageCount: 1, observeCompletedUnknown: true });
  assert.equal((await pageState(proxy, primary)).clicks, precedenceBefore.clicks + 1, 'Public click text target must take precedence over an unused selector');
  const cssClick = await callActorTool(proxy, 'click', { tab_id: primary, selector: '#gate-click' }, { imageCount: 1, observeCompletedUnknown: true });
  assert.equal((await pageState(proxy, primary)).clicks, precedenceBefore.clicks + 2, 'Ordinary CSS selector compatibility must be retained');
  check('public_click_target_precedence_and_css_compatibility', { native_outcomes: [
    { target: 'text', native_success: resultOK(textClick.result), completed_unknown: textClick.completed_unknown },
    { target: 'css', native_success: resultOK(cssClick.result), completed_unknown: cssClick.completed_unknown } ] });

  const staleRef = await snapshotRef(proxy, 'Gate click', primary);
  const replacement = await callActorTool(proxy, 'execute_js', { tab_id: primary, code: `
    const original = document.getElementById('gate-click');
    const next = original.cloneNode(true);
    next.setAttribute('data-gate-stale-replacement', 'true');
    next.dataset.gateStaleClicks = '0';
    next.addEventListener('click', () => { next.dataset.gateStaleClicks = String(Number(next.dataset.gateStaleClicks) + 1); });
    original.replaceWith(next);
    return { original_connected: original.isConnected, replacement_connected: next.isConnected };
  ` }, { imageCount: 1 });
  assert.deepEqual(javascriptValue(replacement.rows), { original_connected: false, replacement_connected: true });
  const staleClick = await callActorTool(proxy, 'click', { tab_id: primary, selector: staleRef }, { imageCount: 1, observeCompletedUnknown: true });
  const staleClicks = javascriptValue((await callActorTool(proxy, 'execute_js', { tab_id: primary,
    code: 'return { clicks: Number(document.querySelector("[data-gate-stale-replacement]").dataset.gateStaleClicks) };'
  }, { imageCount: 1 })).rows);
  assert.equal(staleClicks.clicks, 1, 'A known detached ref must recover through its stored CSS selector');
  check('known_stale_ref_stored_css_recovery', { ref: staleRef, replacement_clicks: staleClicks.clicks,
    native_success: resultOK(staleClick.result), completed_unknown: staleClick.completed_unknown });
}

async function functionalChecks(context, createContext, check, controls) {
  const { proxy, marker } = context;
  await callActorTool(proxy, 'get_page_snapshot', {}, { imageCount: 1 });
  const primary = proxy.tabId;
  for (const [tool, label, args, predicate] of [
    ['click', 'Gate click', {}, state => state.clicks === 1],
    ['type_text', 'Gate text', { text: `typed-${marker}` }, state => state.typed === `typed-${marker}`],
    ['press_enter', 'Gate Enter', {}, state => state.enters === 1],
    ['select_option', 'Gate selection', { value: 'blue' }, state => state.selected === 'blue'],
    ['check_box', 'Gate checkbox', {}, state => state.checked === true],
    ['hover', 'Gate hover', {}, hoverDispatchObserved],
    ['get_text', 'Gate read', {}, () => true],
  ]) {
    const pointerPark = tool === 'hover' ? await clickCoordinates(proxy, '#marker', primary) : null;
    const ref = await snapshotRef(proxy, label, primary);
    assert.match(ref, /^e\d+$/);
    const before = tool === 'hover' ? await pageState(proxy, primary) : null;
    const response = await callActorTool(proxy, tool, { tab_id: primary, selector: ref, ...args }, { imageCount: 1, observeCompletedUnknown: tool !== 'get_text' });
    if (tool === 'get_text') assert.equal(response.rows.find(row => row.text !== undefined)?.text, `READ_TEXT ${marker}`);
    const state = await pageState(proxy, primary);
    assert.equal(state.marker, marker); assert.equal(predicate(state, before), true, `${tool} did not produce the exact expected state`);
    check(`ref_${tool}`, { ref, tab_id: primary, state, native_success: resultOK(response.result), completed_unknown: response.completed_unknown,
      ...(pointerPark ? { hover_before: before,
        hover_assertion: 'Exactly one synthetic mouseenter; ambient trusted pointer entries retained separately',
        pointer_park: { tool: 'click_at', native_success: resultOK(pointerPark.result), frame_id: pointerPark.observation.frame_id,
          capture_id: pointerPark.observation.capture_id, source_url: pointerPark.observation.source_url } } : {}) });
  }
  await refBoundaryChecks(proxy, primary, check);
  const waitingRef = await snapshotRef(proxy, 'Gate click', primary);
  const waited = await callActorTool(proxy, 'wait_for_element', { tab_id: primary, selector: waitingRef }, { imageCount: 1 });
  assert.equal(waited.rows.find(row => row.found !== undefined)?.found, true);
  check('wait_ref', { ref: waitingRef });
  const readable = await callActorTool(proxy, 'read_page', { tab_id: primary, full: true }, { imageCount: 1 });
  assert.match(JSON.stringify(readable.rows), new RegExp(`AFTER_SVG ${marker}`));
  check('svg_read_page_and_snapshots', { marker });
  const canvasClick = await clickCoordinates(proxy, '#gate-canvas', primary, { observeCompletedUnknown: true });
  assert.equal((await pageState(proxy, primary)).canvas, 1);
  check('frame_grounded_canvas_click', { tab_id: primary, native_success: resultOK(canvasClick.result), completed_unknown: canvasClick.completed_unknown });
  const capturesBefore = context.requestCounts.get('capture_screenshot') ?? 0;
  const capture = await callActorTool(proxy, 'capture_screenshot', { tab_id: primary }, { imageCount: 1 });
  assert.equal((context.requestCounts.get('capture_screenshot') ?? 0) - capturesBefore, 1);
  assert.ok(capture.observation?.capture_id);
  check('one_explicit_inline_capture', { capture_id: capture.observation.capture_id });
  await callActorTool(proxy, 'get_site_guide', { domain: 'amazon.com' }, { imageCount: 0 });
  check('site_guide_without_invented_image');
  const search = await callActorTool(proxy, 'search', { tab_id: primary, query: 'must stay local', allow_web_fallback: true }, { allowFailure: true, imageCount: 1 });
  assert.equal(resultOK(search.result), false);
  assert.match(JSON.stringify(search.rows), /web fallback is disabled/);
  const stateAfterSearch = await pageState(proxy, primary);
  assert.equal(stateAfterSearch.marker, marker);
  const searchStep = (await readFile(path.join(context.rawDir, 'steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse).find(entry => entry.tool === 'search');
  assert.equal(searchStep.effective_args.allow_web_fallback, false);
  check('forced_site_only_search', { effective_allow_web_fallback: false, source_url: search.observation.source_url });
  const steady = await callActorTool(proxy, 'wait_for_stable', { tab_id: primary }, { imageCount: 1 });
  assert.equal(steady.rows.find(row => row.stable !== undefined)?.stable, true);
  const churnRef = await snapshotRef(proxy, 'Gate churn', primary);
  const churnClick = await callActorTool(proxy, 'click', { tab_id: primary, selector: churnRef }, { imageCount: 1, observeCompletedUnknown: true });
  assert.equal((await pageState(proxy, primary)).churn, true, 'Churn action must actually start the fixture mutation timer');
  const unsettled = await callActorTool(proxy, 'wait_for_stable', { tab_id: primary }, { imageCount: 1 });
  const timeout = unsettled.rows.find(row => row.stable !== undefined);
  assert.equal(timeout.success, true); assert.equal(timeout.stable, false); assert.equal(timeout.reason, 'timeout');
  check('wait_stable_flags', { stable: true, timeout: { success: timeout.success, stable: timeout.stable, reason: timeout.reason },
    churn_native_success: resultOK(churnClick.result), completed_unknown: churnClick.completed_unknown });

  await callActorTool(proxy, 'navigate', { tab_id: primary, url: fixtureUrl(new URL(proxy.startUrl).origin, marker, 'isolation') }, { imageCount: 1 });
  const popupOpen = await clickCoordinates(proxy, '#gate-popup', primary, { observeCompletedUnknown: true });
  const popup = await findOwnedFixturePopup(proxy, { primary, marker });
  const parentRef = await snapshotRef(proxy, 'Gate click', primary);
  const popupRef = await snapshotRef(proxy, 'Gate click', popup.id);
  assert.equal(parentRef, popupRef, 'Isolation fixture must expose the same compact token in both documents');
  const popupClick = await callActorTool(proxy, 'click', { tab_id: popup.id, selector: popupRef }, { imageCount: 1, observeCompletedUnknown: true });
  assert.equal((await pageState(proxy, popup.id)).clicks, 1);
  assert.equal((await pageState(proxy, primary)).clicks, 0);
  const parentClick = await callActorTool(proxy, 'click', { tab_id: primary, selector: parentRef }, { imageCount: 1, observeCompletedUnknown: true });
  assert.equal((await pageState(proxy, primary)).clicks, 1);
  assert.equal((await pageState(proxy, popup.id)).clicks, 1);
  check('popup_same_ref_document_isolation', { parent_tab_id: primary, popup_tab_id: popup.id, ref: parentRef, popup_identity: popup.identity,
    native_outcomes: [ ['open', popupOpen], ['popup', popupClick], ['parent', parentClick] ].map(([target, response]) => ({
      target, native_success: resultOK(response.result), completed_unknown: response.completed_unknown })) });
  await callActorTool(proxy, 'close_tab', { tab_id: popup.id }, { imageCount: 1 });

  const foreign = await createContext('foreign_control');
  await callActorTool(foreign.proxy, 'get_page_snapshot', {}, { imageCount: 1 });
  const denied = await proxy.request('get_text', { tab_id: foreign.proxy.tabId, selector: '#marker' }, 15000);
  controls.push({ name: 'native_foreign_tab_probe', requesting_task: context.taskId,
    foreign_task: foreign.taskId, foreign_tab_id: foreign.proxy.tabId, result: resultData(denied), isError: denied.isError === true });
  assert.equal(resultOK(denied), false);
  assert.match(JSON.stringify(resultData(denied)), /TAB_NOT_OWNED|Detected: Tab ownership/);
  assert.equal((await pageState(foreign.proxy, foreign.proxy.tabId)).marker, foreign.marker);
  check('installed_native_foreign_tab_denial', { foreign_tab_id: foreign.proxy.tabId });
  const lastClose = await callActorTool(proxy, 'close_tab', { tab_id: primary }, { allowFailure: true, imageCount: 0 });
  assert.match(JSON.stringify(lastClose.rows), /LAST_WORKING_TAB/);
  check('actor_last_working_tab_guard', { tab_id: primary });
  return { foreign, primary };
}

export async function manualLiveGate({ liveAuthorized = false, outputDir, command,
  profilePath = DEFAULT_PROFILE_PATH, concurrency = [1, 2, 5, 10] } = {}) {
  assert.equal(liveAuthorized, true, 'Live gate requires explicit authorization after staged extension/runtime installation');
  assert.ok(concurrency.length && concurrency.every(value => [1, 2, 5, 10].includes(value)));
  outputDir = path.resolve(outputDir ?? path.join(ROOT, '.context/om2w/repair-v2', `manual-live-gate-${Date.now()}`));
  assert.equal((await readdir(outputDir).catch(error => { if (error.code === 'ENOENT') return []; throw error; })).length, 0, 'Choose an empty new evidence directory');
  await mkdir(outputDir, { recursive: true });
  profilePath = path.resolve(profilePath);
  const profile = JSON.parse(await readFile(profilePath, 'utf8'));
  assert.deepEqual(profile.actions, PROFILE.actions); assert.deepEqual(profile.reads, PROFILE.reads);
  command ??= [process.execPath, path.join(homedir(), '.fsb/native-host/runtime/package/build/index.js'), 'stdio'];
  assert.ok(Array.isArray(command) && command.length && command.every(value => typeof value === 'string'));
  const sources = await Promise.all([fileURLToPath(import.meta.url), FIXTURE_PATH, profilePath,
    path.join(HERE, 'manual-recording-proxy.mjs'), path.join(HERE, 'browser-scheduler.mjs')].map(sourceDescriptor));
  const server = await startFixtureServer();
  const scheduler = new BrowserScheduler();
  const contexts = [], controls = [];
  const summary = { synthetic: true, benchmark_result: false, no_model_calls: true,
    transport: 'installed native MCP plus local fixture; existing Chrome', profile: PROFILE.id,
    started_at: new Date().toISOString(), output_dir: outputDir, checks: [], controls,
    concurrency: [], sessions: [], ok: false, correctness_ok: false, cleanup_ok: false, hard_queue_ms: scheduler.maxQueueMs,
    sources };
  const check = (name, detail = {}) => summary.checks.push({ name, ok: true, ...detail });
  try {
    await writeFile(path.join(outputDir, 'manifest.json'), json({ ...summary, command_sha256: digest(JSON.stringify(command)) }), { flag: 'wx' });
  } catch (error) { await server.close(); throw error; }
  async function createContext(prefix) {
    const taskId = `gate_${prefix}_${randomUUID().replaceAll('-', '')}`, marker = taskId;
    const rawDir = path.join(outputDir, 'raw', taskId);
    const proxy = new ManualRecordingProxy({ command, rawDir, startUrl: fixtureUrl(server.origin, marker),
      taskId, attemptId: 'scripted-gate', scheduler, maxActions: 120, deadline: Date.now() + 1200000,
      onFault: fault => scheduler.halt(`Fixture ${taskId}: ${fault.code}`) });
    const context = { proxy, taskId, marker, rawDir, cleanable: false, requestCounts: new Map() };
    proxy.gateCompletedUnknowns = [];
    const request = proxy.request.bind(proxy);
    proxy.request = (name, ...args) => {
      context.requestCounts.set(name, (context.requestCounts.get(name) ?? 0) + 1);
      return request(name, ...args);
    };
    contexts.push(context);
    await proxy.upstream.initialize();
    const tools = await proxy.handle('tools/list');
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), [...ALLOWED_TOOLS].sort());
    const readyUntil = Date.now() + 10_000;
    let baseline;
    do {
      baseline = await proxy.request('list_tabs', {}, Math.max(1, readyUntil - Date.now()));
      if (resultOK(baseline) || Date.now() >= readyUntil) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    } while (Date.now() < readyUntil);
    assert.deepEqual(ownedTabsFromResult(baseline), [], 'A fresh fixture client must not adopt existing user tabs');
    context.cleanable = true;
    return context;
  }
  try {
    const functional = await createContext('functional');
    const { foreign, primary } = await functionalChecks(functional, createContext, check, controls);
    await exportSession(functional, outputDir, profilePath, server.origin);
    await exportSession(foreign, outputDir, profilePath, server.origin);
    // Administrative cleanup probe: no actor trajectory can capture after its final tab is closed.
    const nativeClose = await scheduler.run(functional.proxy.ownerId, () => functional.proxy.request('close_tab', {
      tab_id: primary, allow_active: true, client: 'Claude', visual_reason: 'Verify native last-owned-tab cleanup in the local gate'
    }), { cleanup: true });
    controls.push({ name: 'native_last_owned_tab_close', task_id: functional.taskId, tab_id: primary, result: resultData(nativeClose) });
    assert.equal(resultOK(nativeClose), true);
    assert.deepEqual((await functional.proxy.inventory()).rows, []);
    check('installed_native_last_owned_tab_close', { tab_id: primary });
    await Promise.all([functional.proxy.close(), foreign.proxy.close()]);

    for (const workers of concurrency) {
      const start = contexts.length; let error = null;
      try {
        const wave = await settleOperations(Array.from({ length: workers }, (_, index) => createContext(`c${workers}_${index}`)));
        const refs = await settleOperations(wave.map(context => snapshotRef(context.proxy, 'Gate click', undefined)));
        await settleOperations(wave.map(async (context, index) => {
          const response = await callActorTool(context.proxy, 'click', { selector: refs[index] }, { imageCount: 1, observeCompletedUnknown: true });
          const state = await pageState(context.proxy, context.proxy.tabId);
          assert.equal(state.marker, context.marker); assert.equal(state.clicks, 1);
          context.ref_click_check = { task_id: context.taskId, ref: refs[index], tab_id: context.proxy.tabId,
            state, native_success: resultOK(response.result), completed_unknown: response.completed_unknown };
          await exportSession(context, outputDir, profilePath, server.origin);
        }));
      } catch (caught) { error = caught; }
      const wave = contexts.slice(start), steps = [];
      for (const context of wave) {
        context.level = workers;
        context.queueEvidence = await queueTimingEvidence(context.rawDir);
        if (!context.artifacts) {
          try { await exportSession(context, outputDir, profilePath, server.origin); }
          catch (caught) {
            context.export_error = caught.message;
            if (!context.queueEvidence.can_explain_missing_export || !MISSING_QUEUE_EXPORT_CODES.has(caught.code)) throw caught;
          }
        }
        if (context.cleanable) await context.proxy.close();
        else { await context.proxy.upstream.close(); context.proxy.meta.cleanup_ok = false; }
        assert.equal(context.proxy.meta.cleanup_ok, true, 'A failed local level must still prove owned cleanup before another level');
        const rows = (await readFile(path.join(context.rawDir, 'steps.jsonl'), 'utf8').catch(caught => { if (caught.code === 'ENOENT') return ''; throw caught; })).split('\n').filter(Boolean).map(JSON.parse);
        steps.push(...rows);
      }
      const expired = wave.reduce((sum, context) => sum + (context.proxy.meta.queue_expiries ?? 0), 0);
      if (expired && wave.some(context => context.proxy.meta.queue_expiries && !context.queueEvidence.valid)) throw new Error('Local queue expiry lacks valid non-dispatch evidence');
      if (error && !(expired && (QUEUE_TIMEOUT_CODES.has(error.code) || error.code === 'ACTOR_IMAGE_COUNT'))) throw error;
      const queue = percentile(steps.map(entry => entry.timing?.lease_acquired && entry.timing?.lease_requested
        ? entry.timing.lease_acquired.monotonic_ms - entry.timing.lease_requested.monotonic_ms : null));
      const roundtrip = percentile(steps.filter(entry => !['research_read', 'denied'].includes(entry.kind))
        .map(entry => Date.parse(entry.ended_at) - Date.parse(entry.started_at)));
      const complete = !error && wave.length === workers && wave.every(context => context.artifacts?.physical_frames > 0);
      if (!complete && !expired) throw new Error('Incomplete local physical-state checks without a proved queue expiry require repair');
      const passed = complete && !expired && queue !== null && queue <= 30_000 && roundtrip !== null && roundtrip <= 60_000;
      for (const context of wave) context.level_timing_failed = !passed;
      summary.concurrency.push({ workers, ok: passed, failure_kind: passed ? null : 'timing', physical_tests_complete: complete,
        queue_expiries: expired, p95_queue_ms: queue, p95_tool_roundtrip_ms: roundtrip,
        error: error?.message ?? null, error_code: error?.code ?? null, task_ids: wave.map(context => context.taskId),
        ref_checks: wave.map(context => context.ref_click_check).filter(Boolean),
        physical_frames: wave.reduce((sum, context) => sum + (context.artifacts?.physical_frames ?? 0), 0) });
    }
    summary.correctness_ok = true;
    summary.ok = summary.concurrency.some(level => level.ok);
  } catch (error) {
    summary.error = error.message; summary.error_code = error.code ?? error.name;
    scheduler.halt('Local live gate stopped after a failed assertion');
  } finally {
    for (const context of contexts) {
      try {
        if (context.cleanable) await context.proxy.close();
        else { await context.proxy.upstream.close(); context.proxy.meta.cleanup_ok = false; }
      } catch (error) { context.cleanup_error = error.message; }
      summary.sessions.push({ task_id: context.taskId, marker: context.marker, primary_tab_id: context.proxy.tabId,
        raw_dir: context.rawDir, export_dir: context.export_dir ?? null,
        cleanup_ok: context.proxy.meta.cleanup_ok === true, cleanup_error: context.cleanup_error ?? context.proxy.meta.cleanup_error,
        queue_expiries: context.proxy.meta.queue_expiries ?? 0,
        level: context.level ?? null, level_timing_failed: context.level_timing_failed ?? false,
        queue_timing_evidence: context.queueEvidence ?? null, export_error: context.export_error ?? null,
        completed_unknowns: context.proxy.gateCompletedUnknowns ?? [],
        proxy_counts: { ...context.proxy.meta.counts },
        upstream_request_counts: Object.fromEntries(context.requestCounts),
        artifacts: context.artifacts ?? null });
    }
    summary.cleanup_ok = contexts.length > 0 && contexts.every(context => context.proxy.meta.cleanup_ok === true);
    summary.queue_expiries = contexts.reduce((sum, context) => sum + (context.proxy.meta.queue_expiries ?? 0), 0);
    summary.ok &&= summary.cleanup_ok && summary.correctness_ok;
    summary.passed_levels = summary.concurrency.filter(level => level.ok).map(level => level.workers);
    summary.highest_passing_level = summary.passed_levels.length ? Math.max(...summary.passed_levels) : null;
    await server.close();
    summary.ended_at = new Date().toISOString();
    await writeFile(path.join(outputDir, 'summary.json'), json(summary));
  }
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { 'run-live': { type: 'boolean' }, output: { type: 'string' },
    profile: { type: 'string' }, 'fsb-server-cmd': { type: 'string' }, concurrency: { type: 'string' } } });
  const summary = await manualLiveGate({ liveAuthorized: values['run-live'] === true, outputDir: values.output,
    profilePath: values.profile, command: values['fsb-server-cmd'] ? JSON.parse(values['fsb-server-cmd']) : undefined,
    concurrency: values.concurrency ? values.concurrency.split(',').map(Number) : undefined });
  console.log(JSON.stringify({ ok: summary.ok, cleanup_ok: summary.cleanup_ok, output_dir: summary.output_dir,
    checks: summary.checks.length, concurrency: summary.concurrency.map(row => row.workers), error: summary.error }));
  if (!summary.ok) process.exitCode = 1;
}
