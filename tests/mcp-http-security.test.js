const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

function request(port, { path = '/health', host = `127.0.0.1:${port}`, origin, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Host: host };
    if (origin !== undefined) headers.Origin = origin;
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
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
    mode: 'hub', extensionConnected: false, hubConnected: true, relayCount: 0,
    activeHubInstanceId: null,
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
    assert.equal(good.headers['access-control-allow-origin'], undefined);

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

test('local HTTP refuses a non-loopback bind', async () => {
  const { startHttpServer } = await import('../mcp/build/http.js');
  await assert.rejects(
    startHttpServer({ host: '0.0.0.0', port: 0, bridge: {}, queue: {} }),
    /loopback --host/,
  );
});
