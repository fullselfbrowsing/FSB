'use strict';

const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const express = require('../showcase/server/node_modules/express');
const {
  createShowcaseRouteFallback,
} = require('../showcase/server/src/middleware/showcase-route-fallback');

function request(server, requestPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      path: requestPath,
      method,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForServer(child, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      reject(new Error(`showcase server did not start in time:\n${output}`));
    }, timeoutMs);
    const onOutput = (chunk) => {
      output += chunk.toString();
      if (!output.includes('[FSB Server] Running on')) return;
      clearTimeout(timeout);
      child.stdout.off('data', onOutput);
      child.stderr.off('data', onOutput);
      resolve();
    };
    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`showcase server exited before startup (${code}):\n${output}`));
    });
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function verifyRealServerOrdering() {
  // The default CI command runs showcase-build-smoke immediately before this
  // test, so the real Angular dist is available. Keeping the isolated test
  // above runnable without a build still helps fast middleware development.
  const distPath = path.join(__dirname, '../showcase/dist/showcase-angular/browser');
  if (!fs.existsSync(path.join(distPath, 'index.csr.html'))) {
    console.log('showcase route fallback: real-server check skipped (Angular dist not built)');
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-showcase-server-'));
  const port = await reservePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '../showcase/server'),
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: path.join(tempDir, 'route-test.db'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(child);
    const origin = { address: () => ({ port }) };
    const stats = await request(origin, '/stats');
    assert.strictEqual(stats.status, 200);
    assert.strictEqual(stats.headers['x-robots-tag'], 'noindex, nofollow');
    assert.match(stats.body, /<app-root(?:\s|>)/);
    assert.doesNotMatch(stats.body, /<app-home-page(?:\s|>)/);
    assert.doesNotMatch(stats.body, /rel=["']canonical["']/i);
    // The site-wide Organization schema intentionally lives in the base shell;
    // route-specific Home schemas must not leak into the client-only response.
    assert.doesNotMatch(stats.body, /data-ld=|"@type":"SoftwareApplication"/i);

    const trailing = await request(origin, '/stats/');
    assert.strictEqual(trailing.status, 308);
    assert.strictEqual(trailing.headers.location, '/stats');
  } finally {
    await stopServer(child);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function run() {
  const staticPath = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-showcase-route-'));
  try {
    fs.mkdirSync(path.join(staticPath, 'about'), { recursive: true });
    fs.mkdirSync(path.join(staticPath, 'es'), { recursive: true });
    fs.writeFileSync(path.join(staticPath, 'index.html'), '<title>HOME</title><main>prerendered home</main>');
    fs.writeFileSync(path.join(staticPath, 'index.csr.html'), '<title>CSR</title><app-root></app-root>');
    fs.writeFileSync(path.join(staticPath, 'about', 'index.html'), '<title>ABOUT</title>');
    fs.writeFileSync(path.join(staticPath, 'es', 'index.csr.html'), '<title>CSR ES</title><app-root></app-root>');

    const app = express();
    app.use(createShowcaseRouteFallback({
      staticPath,
      localeSubpaths: ['es'],
      marketingRoutes: new Set(['/', '/about']),
      clientShellRoutes: new Set(['/stats']),
      noIndexClientRoutes: new Set(['/stats']),
    }));
    app.use((_req, res) => res.status(404).send('not found'));
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
      const stats = await request(server, '/stats');
      assert.strictEqual(stats.status, 200);
      assert.match(stats.body, /<title>CSR<\/title>/);
      assert.doesNotMatch(stats.body, /prerendered home/);
      assert.strictEqual(stats.headers['x-robots-tag'], 'noindex, nofollow');

      const localized = await request(server, '/es/stats');
      assert.strictEqual(localized.status, 200);
      assert.match(localized.body, /<title>CSR ES<\/title>/);
      assert.strictEqual(localized.headers['x-robots-tag'], 'noindex, nofollow');

      const trailing = await request(server, '/stats/?source=test');
      assert.strictEqual(trailing.status, 308);
      assert.strictEqual(trailing.headers.location, '/stats?source=test');

      const about = await request(server, '/about');
      assert.strictEqual(about.status, 200);
      assert.match(about.body, /<title>ABOUT<\/title>/);
      assert.strictEqual(about.headers['x-robots-tag'], undefined);

      const nested = await request(server, '/stats/private');
      assert.strictEqual(nested.status, 404);

      const head = await request(server, '/stats', 'HEAD');
      assert.strictEqual(head.status, 200);
      assert.strictEqual(head.body, '');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    fs.rmSync(staticPath, { recursive: true, force: true });
  }

  await verifyRealServerOrdering();

  console.log('showcase route fallback: all assertions passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
