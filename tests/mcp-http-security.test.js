const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

function request(port, { path = '/health', host = `127.0.0.1:${port}`, origin, method = 'GET', hostname = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Host: host };
    if (origin !== undefined) headers.Origin = origin;
    const req = http.request({ hostname, port, path, method, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('local HTTP accepts only loopback Host and requests without Origin', async () => {
  const { startHttpServer } = await import('../mcp/build/http.js');
  const topology = {
    mode: 'hub', extensionConnected: true, hubConnected: true, relayCount: 0,
    activeHubInstanceId: null,
    extensionAttachment: { extensionId: 'a'.repeat(32), extensionVersion: '0.9.91',
      installInstanceId: 'install-fixture', normalWindowCount: 0,
      connectedAt: '2026-09-29T00:00:00.000Z' },
  };
  const running = await startHttpServer({
    host: '127.0.0.1', port: 0,
    bridge: { topology }, queue: { isRunning: false },
  });
  const port = Number(new URL(running.healthEndpoint).port);
  try {
    const good = await request(port);
    assert.equal(good.status, 200);
    assert.equal(JSON.parse(good.body).ok, true);
    assert.deepEqual(JSON.parse(good.body).extensionAttachment, topology.extensionAttachment);
    assert.equal(good.headers['access-control-allow-origin'], undefined);

    const initialize = await fetch(running.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-03-26', capabilities: {},
        clientInfo: { name: 'loopback-test', version: '1' }
      } })
    });
    assert.equal(initialize.status, 200);
    assert.ok(initialize.headers.get('mcp-session-id'));
    assert.equal((await initialize.json()).result.serverInfo.name, 'fsb');

    for (const path of ['/health', '/mcp']) {
      assert.equal((await request(port, { path, host: `evil.example:${port}` })).status, 403);
      assert.equal((await request(port, { path, origin: 'https://evil.example' })).status, 403);
      assert.equal((await request(port, { path, origin: 'null', method: 'OPTIONS' })).status, 403);
    }
    assert.equal((await request(port, { host: `localhost:${port}` })).status, 200);
  } finally {
    await running.close();
  }
});

test('local HTTP serves requests on the IPv6 loopback', async (t) => {
  const { startHttpServer } = await import('../mcp/build/http.js');
  const topology = { mode: 'hub', extensionConnected: false, hubConnected: true, relayCount: 0 };
  let running;
  try {
    running = await startHttpServer({ host: '::1', port: 0, bridge: { topology }, queue: { isRunning: false } });
  } catch (err) {
    if (['EADDRNOTAVAIL', 'EAFNOSUPPORT'].includes(err.code)) return t.skip('no IPv6 loopback on this host');
    throw err;
  }
  try {
    assert.match(running.healthEndpoint, /^http:\/\/\[::1\]:\d+\/health$/);
    const port = Number(new URL(running.healthEndpoint).port);
    const health = await request(port, { hostname: '::1', host: `[::1]:${port}` });
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).ok, true);
    assert.equal((await request(port, { hostname: '::1', host: `[::1]:${port}`, path: '/nope' })).status, 404);
  } finally {
    await running.close();
  }
});

test('local HTTP refuses a non-loopback bind', async () => {
  const { startHttpServer } = await import('../mcp/build/http.js');
  await assert.rejects(
    startHttpServer({ host: '0.0.0.0', port: 0, bridge: {}, queue: {} }),
    /loopback --host/,
  );
});
