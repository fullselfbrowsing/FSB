import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { PublicAttachmentMonitor, ATTACHMENT_IDENTITY, attachmentIdentity } from '../public-attachment-monitor.mjs';

const expected = { extensionId: 'public-id', extensionVersion: '0.9.92', installInstanceId: 'fixture-instance', connectedAt: '2026-10-19T00:00:00Z' };
const identity = { extensionId: 'public-id', extensionVersion: '0.9.92', installInstanceId: 'fixture-instance' };
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, options = {}) {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = signal => { queueMicrotask(() => child.emit('close', signal === 'SIGTERM' ? 0 : 137)); return true; };
  let time = 1000, command;
  const monitor = new PublicAttachmentMonitor({ command: ['/node', '/public/build/index.js', 'stdio'], expected,
    now: () => time, spawnProcess: (...args) => { command = args; return child; }, ...options });
  t.after(() => monitor.close());
  const update = attachment => child.stdout.write(JSON.stringify({ extensionConnected: true,
    extensionAttachment: attachment ?? expected, private_config: 'Never recorded' }) + '\n');
  const disconnect = () => child.stdout.write(JSON.stringify({ extensionConnected: false, extensionAttachment: expected }) + '\n');
  return { monitor, child, update, disconnect, setTime: value => { time = value; }, command: () => command };
}

test('public monitor uses only stock read-only watch and checks fresh observed identity without another spawn', async t => {
  const f = fixture(t), first = f.monitor.beforeDispatch(); f.update(); await first;
  assert.deepEqual(f.command()[1], ['/public/build/index.js', 'status', '--watch', '--json', '--interval', '500']);
  assert.equal((await f.monitor.beforeDispatch()).ok, true);
  f.child.stderr.write('Unknown private upstream diagnostics');
  const receipt = await f.monitor.close();
  assert.equal(receipt.continuity_ok, true); assert.equal(receipt.updates, 1);
  assert.equal(receipt.stderr_bytes_discarded, 36);
  assert.deepEqual(receipt.attachment, identity); assert.equal(receipt.reconnect_grace_ms, 60_000);
  assert.deepEqual(receipt.reconnects, []); assert.equal(receipt.disconnected_observations, 0);
  assert.equal(JSON.stringify(receipt).includes('Never recorded'), false);
  assert.equal(JSON.stringify(receipt).includes('Unknown private'), false);
});

test('stale attachment observations hold dispatch until a fresh stock update arrives', async t => {
  const f = fixture(t); f.update(); f.setTime(7001);
  let admitted = false;
  const waiting = f.monitor.beforeDispatch().then(() => { admitted = true; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(admitted, false);
  f.update(); await waiting; assert.equal(admitted, true);
});

test('any changed attachment identity is latched and cannot silently recover on a later healthy report', async t => {
  assert.deepEqual(ATTACHMENT_IDENTITY, Object.keys(identity));
  for (const key of ATTACHMENT_IDENTITY) await t.test(key, async t => {
    const f = fixture(t); f.update(); f.update({ ...expected, [key]: `changed-${key}` }); f.update();
    await assert.rejects(f.monitor.beforeDispatch(), { code: 'PUBLIC_ATTACHMENT_CHANGED' });
    assert.equal((await f.monitor.close()).continuity_ok, false);
  });
});

test('a reconnect of the same install is recorded and keeps admitting dispatch', async t => {
  const f = fixture(t), reconnected = { ...expected, connectedAt: '2026-10-19T00:01:00Z' };
  assert.deepEqual(attachmentIdentity(reconnected), identity);
  f.update(); f.setTime(2000); f.update(reconnected); await settle();
  assert.deepEqual(await f.monitor.beforeDispatch(), { ok: true });
  const receipt = await f.monitor.close();
  assert.equal(receipt.continuity_ok, true); assert.equal(receipt.updates, 2);
  assert.deepEqual(receipt.reconnects, [{ observed_at: new Date(2000).toISOString(),
    previous_connected_at: expected.connectedAt, connected_at: reconnected.connectedAt }]);
});

test('a disconnect holds dispatch until the same install reconnects, but only within the grace window', async t => {
  await t.test('a same-identity reconnect resumes dispatch and is recorded', { timeout: 10_000 }, async t => {
    const f = fixture(t); f.update();
    f.disconnect(); f.child.stdout.write(JSON.stringify({ extensionConnected: true }) + '\n'); await settle();
    let state = 'pending';
    const waiting = f.monitor.beforeDispatch().then(() => { state = 'admitted'; }, error => { state = error.code; });
    await settle(); assert.equal(state, 'pending');
    f.setTime(3000); f.update({ ...expected, connectedAt: '2026-10-19T00:02:00Z' }); await waiting;
    assert.equal(state, 'admitted'); assert.deepEqual(await f.monitor.beforeDispatch(), { ok: true });
    const receipt = await f.monitor.close();
    assert.equal(receipt.continuity_ok, true); assert.equal(receipt.disconnected_observations, 2);
    assert.deepEqual(receipt.reconnects, [{ observed_at: new Date(3000).toISOString(),
      previous_connected_at: expected.connectedAt, connected_at: '2026-10-19T00:02:00Z' }]);
  });
  await t.test('staying disconnected past the grace window latches', { timeout: 10_000 }, async t => {
    const f = fixture(t, { intervalMs: 10, maxAgeMs: 20, reconnectGraceMs: 200 }); f.update(); f.disconnect(); await settle();
    const started = Date.now();
    await assert.rejects(f.monitor.beforeDispatch(), { code: 'PUBLIC_ATTACHMENT_CHANGED' });
    assert.ok(Date.now() - started >= 150, 'The default dispatch wait is the reconnect grace window');
    f.update(); await assert.rejects(f.monitor.beforeDispatch(), { code: 'PUBLIC_ATTACHMENT_CHANGED' });
    const receipt = await f.monitor.close();
    assert.equal(receipt.continuity_ok, false); assert.equal(receipt.reconnect_grace_ms, 200);
    assert.equal(receipt.disconnected_observations, 1);
    assert.equal((await fixture(t, { intervalMs: 10, maxAgeMs: 300, reconnectGraceMs: 1 }).monitor.close()).reconnect_grace_ms, 300);
  });
});

test('lost, malformed, oversized and expired monitoring never admits another dispatch', async t => {
  for (const [name, mutate] of Object.entries({
    malformed: f => f.child.stdout.write('{invalid}\n'),
    oversized: f => f.child.stdout.write('x'.repeat(2_000_001)),
    exited: f => f.child.emit('close', 1),
    error: f => f.child.emit('error', new Error('Private transport error')),
  })) await t.test(name, async t => {
    // A later healthy report cannot admit dispatch, so these latch at once rather than waiting out the reconnect grace.
    const f = fixture(t); mutate(f); f.update();
    await assert.rejects(f.monitor.beforeDispatch(), { code: 'PUBLIC_ATTACHMENT_CHANGED' });
  });
  const f = fixture(t); await assert.rejects(f.monitor.beforeDispatch({ timeoutMs: 5 }), { code: 'PUBLIC_ATTACHMENT_CHANGED' });
  f.update(); await assert.rejects(f.monitor.beforeDispatch(), { code: 'PUBLIC_ATTACHMENT_CHANGED' });
});
