import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PublicReleaseClient } from '../public-release-client.mjs';
import { encodeSolidPng } from '../png.mjs';

const reply = row => ({ content: [{ type: 'text', text: JSON.stringify(row) }] });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const parsed = result => JSON.parse(result.content[0].text);

async function fixture(t, { realServer = false, identity = null } = {}) {
  const tabs = new Map(), calls = [], notifications = [], marker = 'fixed-public-guard-marker';
  const png = encodeSolidPng(120, 110, [20, 40, 80]); let nextId = 101, guardUrl, actualMarker = marker;
  let rawClosed = 0, serverClosed = 0;
  const raw = {
    intercept: null,
    async initialize() { return { serverInfo: { name: 'unchanged public fake', version: '0.11.2' } }; },
    async request(method, params) {
      calls.push({ method, params: structuredClone(params) });
      if (this.intercept) {
        const intercepted = await this.intercept(method, params);
        if (intercepted !== undefined) return intercepted;
      }
      if (method !== 'tools/call') return { tools: [] };
      const { name, arguments: args } = params;
      const idFields = identity ? { agentId: identity } : {};
      if (name === 'list_tabs') return reply({ success: true, tool: name, tabs: [...tabs.values()], totalTabs: tabs.size,
        activeTabId: null, ...idFields });
      if (name === 'open_tab') {
        const id = nextId++; tabs.set(id, { id, url: args.url });
        if (!guardUrl) {
          guardUrl = args.url;
          if (realServer) {
            const html = await (await fetch(guardUrl)).text();
            actualMarker = /<main id="public-release-guard">([^<]+)<\/main>/.exec(html)?.[1];
            assert.ok(actualMarker, 'The real local HTTP fixture must contain its visible marker');
          }
        }
        return reply({ success: true, tool: name, tabId: id, url: args.url,
          ownershipToken: `fake-credential-for-${id}`, connectionId: 'fake-private-connection', ...idFields });
      }
      if (name === 'close_tab') { tabs.delete(args.tab_id); return reply({ success: true, tool: name, tabId: args.tab_id, closed: true, ...idFields }); }
      if (name === 'switch_tab') return reply({ success: true, tool: name, tabId: args.tabId, ...idFields });
      if (name === 'get_text') return reply({ success: true, text: actualMarker, ...idFields });
      if (name === 'capture_screenshot') return { content: [
        { type: 'text', text: JSON.stringify({ capture_id: 'public-native-capture', source_url: guardUrl,
          timestamp: '2026-10-19T00:00:00.000Z', mode: 'viewport', css_rect: { x: 0, y: 0, width: 120, height: 110 },
          output_width: 120, output_height: 110, byte_length: png.length, sha256: digest(png),
          effective_emulation: { device_mode: 'current', device_scale_factor: 1 } }) },
        { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
      ] };
      return reply({ success: true, tool: name, ...idFields });
    },
    notify(method, params) { notifications.push({ method, params }); },
    async close() { rawClosed++; },
  };
  const client = new PublicReleaseClient(raw, realServer ? {} : { createGuardServer: async () => ({
    url: 'http://127.0.0.1:12345/fixed-guard', marker, async close() { serverClosed++; },
  }) });
  t.after(() => client.close());
  await client.initialize();
  return { client, raw, tabs, calls, notifications, png, counts: () => ({ rawClosed, serverClosed }), guardUrl: () => guardUrl };
}

test('guard setup uses one background local open, filters actor inventory and protects the hidden target', async t => {
  const f = await fixture(t); const prepared = await f.client.prepareGuard();
  const id = f.client.getGuardId(); assert.equal(prepared.guard_tab_id, id);
  const opens = f.calls.filter(call => call.params?.name === 'open_tab');
  assert.equal(opens.length, 1); assert.equal(opens[0].params.arguments.active, false);
  assert.equal(new URL(opens[0].params.arguments.url).hostname, '127.0.0.1');
  assert.deepEqual(parsed(await f.client.request('tools/call', { name: 'list_tabs', arguments: {} })).tabs, []);
  f.tabs.set(202, { id: 202, url: 'https://task.test/' });
  const inventory = parsed(await f.client.request('tools/call', { name: 'list_tabs', arguments: {} }));
  assert.equal(inventory.totalTabs, 1); assert.deepEqual(inventory.tabs.map(tab => tab.id), [202]);
  const before = f.calls.length;
  await assert.rejects(f.client.request('tools/call', { name: 'navigate', arguments: { tab_id: id, url: 'https://task.test/' } }), { code: 'PUBLIC_GUARD_PROTECTED' });
  assert.equal(f.calls.length, before);
  assert.equal(JSON.stringify(inventory).includes(f.guardUrl()), false);
});

test('missing guard halts before dispatch and never earns cleanup credit', async t => {
  const f = await fixture(t); await f.client.prepareGuard(); f.tabs.clear();
  await assert.rejects(f.client.request('tools/call', { name: 'click', arguments: { tab_id: 202, selector: '#go' } }), { code: 'PUBLIC_GUARD_MISSING' });
  assert.equal(f.calls.filter(call => call.params?.name === 'click').length, 0);
  await assert.rejects(f.client.disposeGuard(), { code: 'PUBLIC_GUARD_MISSING' });
  assert.equal((await f.client.close()).cleanup_ok, false);
});

test('guard continuity loss after an internal stock scope reset is reported without replaying the requested call', async t => {
  const f = await fixture(t); await f.client.prepareGuard();
  f.raw.intercept = (_method, params) => {
    if (params?.name === 'click') { f.tabs.clear(); return reply({ success: true, tool: 'click' }); }
  };
  await assert.rejects(f.client.request('tools/call', { name: 'click', arguments: { tab_id: 202 } }), { code: 'PUBLIC_GUARD_MISSING' });
  assert.equal(f.calls.filter(call => call.params?.name === 'click').length, 1);
  assert.equal((await f.client.close()).cleanup_ok, false);
});

test('provided original agent identity changes halt even when the guard ID remains present', async t => {
  const f = await fixture(t, { identity: 'fake-original-agent' }); await f.client.prepareGuard();
  f.raw.intercept = (_method, params) => params?.name === 'list_tabs'
    ? reply({ success: true, tabs: [...f.tabs.values()], agentId: 'fake-replacement-agent' }) : undefined;
  await assert.rejects(f.client.verifyTaskDrain(), { code: 'PUBLIC_SCOPE_IDENTITY_CHANGED' });
  assert.equal((await f.client.close()).cleanup_ok, false);
});

test('duplicate, malformed, ambiguous and inconsistent inventories fail closed', async t => {
  const variants = {
    duplicate: id => reply({ success: true, tabs: [{ id }, { id }] }),
    malformed: id => reply({ success: true, tabs: [{ id }, { id: '202' }] }),
    conflicting: id => reply({ success: true, tabs: [{ id, tab_id: id + 1 }] }),
    count: id => reply({ success: true, tabs: [{ id }], totalTabs: 7 }),
    active: id => reply({ success: true, tabs: [{ id }], activeTabId: 999 }),
    unstructured: () => ({ content: [{ type: 'text', text: 'Unavailable' }] }),
    ambiguous: id => ({ content: [reply({ success: true, tabs: [{ id }] }).content[0], reply({ success: true, tabs: [] }).content[0]] }),
  };
  for (const [name, value] of Object.entries(variants)) await t.test(name, async t => {
    const f = await fixture(t); await f.client.prepareGuard();
    f.raw.intercept = (_method, params) => params?.name === 'list_tabs' ? value(f.client.getGuardId()) : undefined;
    await assert.rejects(f.client.verifyTaskDrain(), { code: 'PUBLIC_INVENTORY_INVALID' });
    assert.equal((await f.client.close()).cleanup_ok, false);
  });
});

test('ownership credentials are removed recursively before results or notifications leave the adapter', async t => {
  const f = await fixture(t); await f.client.prepareGuard();
  f.raw.intercept = (_method, params) => params?.name === 'get_text' ? reply({ success: true,
    ownershipToken: 'fresh-fake-private-token', nested: { ownershipTokens: { 202: 'nested-fake-token' },
      ownedBindings: [{ tabId: 202, ownershipToken: 'binding-fake-token' }] },
    text: 'fresh-fake-private-token nested-fake-token binding-fake-token fake-private-connection' }) : undefined;
  const result = await f.client.request('tools/call', { name: 'get_text', arguments: { tab_id: 202 } });
  const printed = JSON.stringify(result);
  for (const value of ['fresh-fake-private-token', 'nested-fake-token', 'binding-fake-token', 'fake-private-connection', 'ownershipToken', 'ownedBindings']) assert.equal(printed.includes(value), false);
  assert.equal(JSON.stringify(f.client), '{}', 'Raw client and secrets are private memory');
  let notification;
  f.client.onNotification = value => { notification = value; };
  f.raw.onNotification({ method: 'notifications/progress', params: { ownershipToken: 'notification-secret', text: 'notification-secret' } });
  assert.equal(JSON.stringify(notification).includes('notification-secret'), false);
  f.client.notify('notifications/initialized'); assert.equal(f.notifications.length, 1);
  assert.throws(() => f.client.notify('unsafe/mutation'), { code: 'PUBLIC_NOTIFICATION_DISABLED' });
});

test('task drain requires actual guard-only inventory before guard disposal', async t => {
  const f = await fixture(t); await f.client.prepareGuard(); f.tabs.set(202, { id: 202 });
  await assert.rejects(f.client.verifyTaskDrain(), { code: 'PUBLIC_TASK_DRAIN_INCOMPLETE' });
  await assert.rejects(f.client.disposeGuard(), { code: 'PUBLIC_TASK_DRAIN_INCOMPLETE' });
  assert.equal(f.calls.filter(call => call.params?.name === 'close_tab').length, 0);
  f.tabs.delete(202);
  const drain = await f.client.verifyTaskDrain(); assert.deepEqual(drain.task_tab_ids, []);
  assert.deepEqual(drain.inventory.tab_ids, [f.client.getGuardId()]);
  await f.client.disposeGuard(); assert.equal((await f.client.close()).cleanup_ok, true);
});

test('exact last-guard close acknowledgment is followed by shutdown without a post-close list or repeat close', async t => {
  const f = await fixture(t); await f.client.prepareGuard(); await f.client.verifyTaskDrain();
  const receipt = await f.client.disposeGuard();
  assert.equal(receipt.method, 'public_exact_guard_close_ack_after_guard_only_inventory');
  assert.equal(receipt.post_close_inventory_requested, false); assert.equal(receipt.private_registry_drain_attested, false);
  assert.equal(receipt.scope_identity_observed, false); assert.match(receipt.limitations[0], /internally re-register and retry/);
  const count = f.calls.length;
  await assert.rejects(f.client.request('tools/call', { name: 'list_tabs', arguments: {} }), { code: 'PUBLIC_GUARD_DISPOSED' });
  await assert.rejects(f.client.disposeGuard(), { code: 'PUBLIC_GUARD_DISPOSED' });
  assert.equal(f.calls.length, count); assert.equal(f.calls.at(-1).params.name, 'close_tab');
  assert.equal((await f.client.close()).cleanup_ok, true); assert.equal((await f.client.close()).cleanup_ok, true);
  assert.deepEqual(f.counts(), { rawClosed: 1, serverClosed: 1 });
});

test('unknown, wrong-target and malformed close replies are never retried or credited', async t => {
  for (const [name, answer] of Object.entries({
    missing: {}, failed: { isError: true, ...reply({ success: false, error: 'close uncertain' }) },
    wrong: reply({ success: true, closed: true, tabId: 999 }),
    absentAcknowledgment: reply({ success: true, tabId: 101 }),
    extra: { content: [...reply({ success: true, closed: true, tabId: 101 }).content, { type: 'text', text: 'unknown extra' }] },
  })) await t.test(name, async t => {
    const f = await fixture(t); await f.client.prepareGuard();
    f.raw.intercept = (_method, params) => params?.name === 'close_tab' ? answer : undefined;
    await assert.rejects(f.client.disposeGuard(), { code: 'PUBLIC_GUARD_CLOSE_UNVERIFIED' });
    await assert.rejects(f.client.disposeGuard());
    assert.equal(f.calls.filter(call => call.params?.name === 'close_tab').length, 1);
    assert.equal((await f.client.close()).cleanup_ok, false);
  });
});

test('transport uncertainty does not replay or permit guard disposal', async t => {
  const f = await fixture(t); await f.client.prepareGuard();
  f.raw.intercept = (_method, params) => { if (params?.name === 'click') throw new Error('contains fake-private-connection'); };
  await assert.rejects(f.client.request('tools/call', { name: 'click', arguments: { tab_id: 202 } }), { code: 'PUBLIC_TRANSPORT_UNCERTAIN' });
  await assert.rejects(f.client.disposeGuard(), { code: 'PUBLIC_TRANSPORT_UNCERTAIN' });
  assert.equal(f.calls.filter(call => call.params?.name === 'click').length, 1);
  const final = await f.client.close(); assert.equal(final.cleanup_ok, false);
  assert.equal(JSON.stringify(final).includes('fake-private-connection'), false);
  assert.equal(f.calls.filter(call => call.params?.name === 'close_tab').length, 0);
});

test('independent guard health uses exact visible local text and unchanged native PNG after task drain', async t => {
  const f = await fixture(t); await f.client.prepareGuard();
  const health = await f.client.captureGuardHealth();
  assert.equal(health.ok, true); assert.equal(health.read_verified, true); assert.equal(health.model_calls, 0);
  assert.equal(health.task_actions_replayed, 0); assert.equal(health.sha256, digest(f.png));
  assert.deepEqual(Buffer.from(health.image.data, 'base64'), f.png);
  assert.equal(health.metadata.source_url, f.guardUrl());
  const tools = f.calls.map(call => call.params?.name);
  assert.equal(tools.filter(name => name === 'capture_screenshot').length, 1);
  assert.ok(tools.indexOf('switch_tab') < tools.indexOf('get_text'));
  await f.client.disposeGuard(); assert.equal((await f.client.close()).cleanup_ok, true);
});

test('tampered native health evidence stops without a capture retry or cleanup credit', async t => {
  const f = await fixture(t); await f.client.prepareGuard();
  f.raw.intercept = (_method, params) => params?.name === 'capture_screenshot'
    ? { content: [reply({ capture_id: 'wrong', source_url: f.guardUrl(), sha256: 'wrong' }).content[0],
      { type: 'image', mimeType: 'image/png', data: f.png.toString('base64') }] } : undefined;
  await assert.rejects(f.client.captureGuardHealth(), { code: 'PUBLIC_GUARD_HEALTH_FAILED' });
  await assert.rejects(f.client.disposeGuard(), { code: 'PUBLIC_GUARD_HEALTH_FAILED' });
  assert.equal(f.calls.filter(call => call.params?.name === 'capture_screenshot').length, 1);
  assert.equal((await f.client.close()).cleanup_ok, false);
});

test('default guard HTTP fixture serves only its bounded local page and closes after exact disposal', async t => {
  const f = await fixture(t, { realServer: true }); await f.client.prepareGuard();
  const response = await fetch(f.guardUrl()); assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal((await fetch(new URL('/unrelated', f.guardUrl()))).status, 404);
  const health = await f.client.captureGuardHealth(); assert.equal(health.ok, true);
  await f.client.disposeGuard(); assert.equal((await f.client.close()).cleanup_ok, true);
  await assert.rejects(fetch(f.guardUrl()));
});

test('initial foreign tabs prevent guard creation and task dispatch', async t => {
  const f = await fixture(t); f.tabs.set(7, { id: 7 });
  await assert.rejects(f.client.prepareGuard(), { code: 'PUBLIC_INITIAL_SCOPE_NOT_EMPTY' });
  assert.equal(f.calls.filter(call => call.params?.name === 'open_tab').length, 0);
  assert.equal((await f.client.close()).cleanup_ok, false);
});

test('public initialize request and notifications retain stock protocol compatibility', async t => {
  const f = await fixture(t);
  await f.client.request('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  f.client.notify('notifications/initialized'); await f.client.prepareGuard();
  assert.equal(f.calls.some(call => call.method === 'initialize'), true);
  assert.equal(f.notifications[0].method, 'notifications/initialized');
  await f.client.disposeGuard(); assert.equal((await f.client.close()).cleanup_ok, true);
});

test('a settled native agent rejection remains a reported failure and is not replayed by the adapter', async t => {
  const f = await fixture(t); await f.client.prepareGuard();
  const rejection = { isError: true, ...reply({ success: false, code: 'AGENT_NOT_REGISTERED', error: 'Native pre-dispatch rejection' }) };
  f.raw.intercept = (_method, params) => params?.name === 'click' ? rejection : undefined;
  const result = await f.client.request('tools/call', { name: 'click', arguments: { tab_id: 202 } });
  assert.equal(result.isError, true); assert.equal(parsed(result).code, 'AGENT_NOT_REGISTERED');
  assert.equal(f.calls.filter(call => call.params?.name === 'click').length, 1);
  await f.client.disposeGuard(); assert.equal((await f.client.close()).cleanup_ok, true);
});

test('a verified guard close cannot earn final cleanup credit when client shutdown fails', async t => {
  const f = await fixture(t); await f.client.prepareGuard(); await f.client.disposeGuard();
  f.raw.close = async () => { throw new Error('shutdown unverified'); };
  const final = await f.client.close(); assert.equal(final.guard_disposed, true);
  assert.equal(final.cleanup_ok, false); assert.equal(final.client_closed, false);
  assert.equal(final.fault.code, 'PUBLIC_CLIENT_CLOSE_UNVERIFIED');
});

const notAttached = { isError: true, content: [{ type: 'text', text: 'Detected: Extension attachment\nWhy: The bridge is reachable, but the FSB browser extension is not attached to ws://localhost:7225.\nNext action: Open Chrome/Edge/Brave with FSB enabled, then retry.' }] };

test('guard setup waits for a fresh relay to see the extension before its first inventory', async t => {
  const f = await fixture(t);
  let pending = 3;
  f.raw.intercept = async (method, params) => method === 'tools/call' && params.name === 'list_tabs' && pending-- > 0 ? notAttached : undefined;
  await f.client.initialize();
  const guard = await f.client.prepareGuard();
  assert.equal(guard.ok, true);
  const lists = f.calls.filter(call => call.params?.name === 'list_tabs');
  assert.ok(lists.length >= 5, 'three not-attached reads, then the ready read and the initial inventory');
  assert.equal(f.calls.filter(call => call.params?.name === 'open_tab').length, 1, 'the guard opens only after the relay is ready');
});

test('guard setup still fails at once on any other unsuccessful inventory', async t => {
  const f = await fixture(t);
  f.raw.intercept = async (method, params) => method === 'tools/call' && params.name === 'list_tabs'
    ? { isError: true, content: [{ type: 'text', text: JSON.stringify({ success: false, code: 'TAB_SCOPE_ERROR' }) }] } : undefined;
  await f.client.initialize();
  await assert.rejects(f.client.prepareGuard(), error => error.code === 'PUBLIC_INVENTORY_INVALID');
  assert.equal(f.calls.filter(call => call.params?.name === 'list_tabs').length, 1, 'no retry for an unrelated failure');
  assert.equal(f.calls.filter(call => call.params?.name === 'open_tab').length, 0);
});

test('guard open accepts the public pre-navigation about:blank URL but no other foreign URL', async t => {
  for (const [url, ok] of [['about:blank', true], ['https://foreign.test/', false]]) {
    const f = await fixture(t);
    f.raw.intercept = async (method, params) => {
      if (method !== 'tools/call' || params.name !== 'open_tab') return undefined;
      f.tabs.set(150, { id: 150, url });
      return reply({ success: true, tool: 'open_tab', tabId: 150, url });
    };
    if (ok) assert.equal((await f.client.prepareGuard()).guard_tab_id, 150);
    else await assert.rejects(f.client.prepareGuard(), error => error.code === 'PUBLIC_GUARD_OPEN_UNVERIFIED');
  }
});
