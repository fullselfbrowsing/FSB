// Phase 66 benchmark fixture server (D-13, D-17, T-66-04, T-66-06): binds
// 127.0.0.1 only, keeps a request log per /r/<token>/ run, serves files that
// stay inside the root, and answers evidence reads only to the runner secret.
// Every server here binds port 0; nothing ever binds the hub port 7225.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveFixtureServerOptions, startFixtureServer } from '../scripts/bench/fixture-server.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'bench', 'tasks-sample', 'fixtures');
const PAGE = '/fixtures/sample/index.html';
const PAGE_BYTES = fs.readFileSync(path.join(FIXTURES, 'sample', 'index.html'), 'utf8');
const SERVER_SCRIPT = path.join(ROOT, 'scripts', 'bench', 'fixture-server.mjs');
const REPO_PACKAGE = path.join(ROOT, 'package.json');
const PACKAGE_SIGNATURE = '"name": "fsb-full-self-browsing"';

async function withServer(options, fn) {
  const server = await startFixtureServer({ root: FIXTURES, ...options });
  try {
    return await fn(server);
  } finally {
    await server.close();
  }
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-bench-server-'));
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

// Raw HTTP so the request target reaches the server exactly as written:
// fetch normalizes '..' and '%2e%2e' segments before it sends anything.
function rawRequest(port, { method = 'GET', target, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method, path: target, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('error', reject);
    if (body !== null) request.write(body);
    request.end();
  });
}

function apiUrl(server, token, rest = 'sample/save') {
  return new URL(`../../api/${rest}`, server.runUrl(token, PAGE)).href;
}

function withoutTime(entry) {
  assert.ok(Number.isFinite(entry.t), 'every log entry has a numeric time');
  return { ...entry, t: 0 };
}

function evidenceUrl(server, token) {
  return `${server.baseUrl}/__bench/evidence?run=${token}`;
}

test('listens on 127.0.0.1 with an ephemeral port and a random 32-byte secret', async () => {
  await withServer({}, async (server) => {
    assert.ok(Number.isInteger(server.port) && server.port > 0);
    assert.notEqual(server.port, 7225);
    assert.equal(server.baseUrl, `http://127.0.0.1:${server.port}`);
    assert.match(server.secret, /^[0-9a-f]{64}$/);
    await withServer({}, async (other) => assert.notEqual(other.secret, server.secret));
  });
});

test('the handle keeps the secret out of enumeration and JSON', async () => {
  await withServer({}, async (server) => {
    assert.ok(!Object.keys(server).includes('secret'));
    assert.ok(!JSON.stringify(server).includes(server.secret));
    assert.equal(Object.isFrozen(server), true);
  });
});

test('serves a fixture page under a run prefix and logs one GET entry', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    assert.match(token, /^[A-Za-z0-9_-]{8,64}$/);
    assert.notEqual(server.newRunToken(), token);
    const url = server.runUrl(token, PAGE);
    assert.equal(url, `${server.baseUrl}/r/${token}${PAGE}`);
    const res = await fetch(url);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/html/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(await res.text(), PAGE_BYTES);
    const { requests, dropped } = server.evidence(token);
    assert.equal(dropped, 0);
    assert.equal(requests.length, 1);
    assert.deepEqual(withoutTime(requests[0]), {
      t: 0, method: 'GET', path: PAGE, query: {}, bodyType: 'none', body: null,
    });
  });
});

test('the query is logged with the first value of a repeated key', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    const res = await fetch(`${server.runUrl(token, PAGE)}?view=saved&x=1&x=2`);
    assert.equal(res.status, 200);
    assert.deepEqual(server.evidence(token).requests[0].query, { view: 'saved', x: '1' });
  });
});

test('HEAD returns headers only and is logged', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    const res = await rawRequest(server.port, { method: 'HEAD', target: `/r/${token}${PAGE}` });
    assert.equal(res.status, 200);
    assert.equal(res.body, '');
    assert.deepEqual(withoutTime(server.evidence(token).requests[0]), {
      t: 0, method: 'HEAD', path: PAGE, query: {}, bodyType: 'none', body: null,
    });
  });
});

test('content types follow the file extension', async () => {
  await withTempDir(async (dir) => {
    const files = {
      'index.html': 'text/html; charset=utf-8',
      'app.js': 'text/javascript; charset=utf-8',
      'style.css': 'text/css; charset=utf-8',
      'data.json': 'application/json; charset=utf-8',
      'icon.svg': 'image/svg+xml',
      'pixel.png': 'image/png',
      'blob.bin': 'application/octet-stream',
    };
    fs.mkdirSync(path.join(dir, 'kinds'));
    for (const name of Object.keys(files)) fs.writeFileSync(path.join(dir, 'kinds', name), name);
    await withServer({ root: dir }, async (server) => {
      const token = server.newRunToken();
      for (const [name, type] of Object.entries(files)) {
        const res = await fetch(server.runUrl(token, `/fixtures/kinds/${name}`));
        assert.equal(res.status, 200, name);
        assert.equal(res.headers.get('content-type'), type, name);
        assert.equal(await res.text(), name);
      }
    });
  });
});

test('traversal attempts never return 200 or bytes from outside the root', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    const up = '..%2f'.repeat(8);
    const targets = [
      `/r/${token}/fixtures/../../../package.json`,
      `/r/${token}/fixtures/../../../../../../../../package.json`,
      `/r/${token}/fixtures/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/package.json`,
      `/r/${token}/fixtures/${up}package.json`,
      `/r/${token}/fixtures/sample/${up}package.json`,
      `/r/${token}/fixtures/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fpackage.json`,
      `/r/${token}/fixtures/${encodeURIComponent(REPO_PACKAGE)}`,
      `/r/${token}/fixtures/${REPO_PACKAGE}`,
      `/r/${token}/fixtures/${'..%5c'.repeat(8)}package.json`,
      `http://127.0.0.1:${server.port}/r/${token}/fixtures/${up}package.json`,
    ];
    for (const target of targets) {
      const res = await rawRequest(server.port, { target });
      assert.notEqual(res.status, 200, target);
      assert.ok(!res.body.includes(PACKAGE_SIGNATURE), `package.json bytes leaked for ${target}`);
    }
  });
});

test('a sibling directory that shares the root prefix and a symlink out of the root are refused', async () => {
  await withTempDir(async (dir) => {
    const root = path.join(dir, 'root');
    fs.mkdirSync(path.join(root, 'app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app', 'index.html'), '<p>inside</p>');
    fs.mkdirSync(path.join(dir, 'root-evil'));
    fs.writeFileSync(path.join(dir, 'root-evil', 'secret.html'), 'SIBLING_SENTINEL_8f2a');
    fs.writeFileSync(path.join(dir, 'outside.html'), 'SYMLINK_SENTINEL_41c7');
    fs.symlinkSync(path.join(dir, 'outside.html'), path.join(root, 'app', 'link.html'));
    await withServer({ root }, async (server) => {
      const token = server.newRunToken();
      const inside = await rawRequest(server.port, { target: `/r/${token}/fixtures/app/index.html` });
      assert.equal(inside.status, 200);
      for (const target of [`/r/${token}/fixtures/..%2froot-evil%2fsecret.html`, `/r/${token}/fixtures/app/link.html`]) {
        const res = await rawRequest(server.port, { target });
        assert.notEqual(res.status, 200, target);
        assert.doesNotMatch(res.body, /SIBLING_SENTINEL_8f2a|SYMLINK_SENTINEL_41c7/, target);
      }
    });
  });
});

test('directories and missing files are 404', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    for (const rel of ['/fixtures/sample', '/fixtures/sample/', '/fixtures/', '/fixtures/sample/missing.html']) {
      const res = await rawRequest(server.port, { target: `/r/${token}${rel}` });
      assert.equal(res.status, 404, rel);
    }
  });
});

test('a malformed token returns 404 and is logged nowhere', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    assert.deepEqual(server.runTokens(), [token]);
    const badTokens = ['bad', 'short7x', 'a'.repeat(65), 'bad.token!', '%41%41%41%41%41%41%41%41', 'has%20space1'];
    for (const bad of badTokens) {
      const res = await rawRequest(server.port, { target: `/r/${bad}${PAGE}` });
      assert.equal(res.status, 404, bad);
    }
    for (const target of ['/r/', '/r', `/r//fixtures${PAGE}`, '/favicon.ico', PAGE]) {
      const res = await rawRequest(server.port, { target });
      assert.equal(res.status, 404, target);
    }
    assert.deepEqual(server.runTokens(), [token]);
    assert.deepEqual(server.evidence(token), { requests: [], dropped: 0 });
    assert.throws(() => server.evidence('bad'), TypeError);
  });
});

test('a JSON POST to the app API returns {"ok":true} and logs the parsed body', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    const url = apiUrl(server, token);
    assert.equal(url, `${server.baseUrl}/r/${token}/api/sample/save`);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'alpha' }),
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^application\/json/);
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(withoutTime(server.evidence(token).requests[0]), {
      t: 0, method: 'POST', path: '/api/sample/save', query: {}, bodyType: 'json', body: { value: 'alpha' },
    });
  });
});

test('a urlencoded POST gives a form object, with arrays for repeated keys', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    const res = await fetch(apiUrl(server, token, 'checklist/save'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'value=alpha&checked=a&checked=b&__proto__=x',
    });
    assert.equal(res.status, 200);
    const [entry] = server.evidence(token).requests;
    assert.equal(entry.bodyType, 'form');
    assert.deepEqual(entry.body, JSON.parse('{"value":"alpha","checked":["a","b"],"__proto__":"x"}'));
    assert.equal(Object.getPrototypeOf(entry.body), Object.prototype, 'a form key never sets a prototype');
  });
});

test('other bodies are text, invalid JSON is text, and an empty body is none', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    const url = apiUrl(server, token, 'notes/save');
    await fetch(url, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: 'hello' });
    await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{not json' });
    await fetch(url, { method: 'DELETE' });
    await fetch(url);
    const kinds = server.evidence(token).requests.map((e) => [e.method, e.bodyType, e.body]);
    assert.deepEqual(kinds, [
      ['PUT', 'text', 'hello'],
      ['PATCH', 'text', '{not json'],
      ['DELETE', 'none', null],
      ['GET', 'none', null],
    ]);
  });
});

test('a body over maxBodyBytes returns 413 and is logged as too_large', async () => {
  await withServer({ maxBodyBytes: 64 }, async (server) => {
    const token = server.newRunToken();
    const url = apiUrl(server, token);
    const atLimit = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x'.repeat(64) });
    assert.equal(atLimit.status, 200);
    const over = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(200) }),
    });
    assert.equal(over.status, 413);
    assert.equal(over.headers.get('cache-control'), 'no-store');
    const [first, second] = server.evidence(token).requests;
    assert.equal(first.bodyType, 'text');
    assert.deepEqual(withoutTime(second), {
      t: 0, method: 'POST', path: '/api/sample/save', query: {}, bodyType: 'too_large', body: null,
    });
    // The connection survives: the next request is served normally.
    assert.equal((await fetch(server.runUrl(token, PAGE))).status, 200);
  });
});

test('the default body limit is 65536 bytes', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    const url = apiUrl(server, token);
    const ok = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'y'.repeat(65536) });
    assert.equal(ok.status, 200);
    const tooBig = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'y'.repeat(65537) });
    assert.equal(tooBig.status, 413);
  });
});

test('two tokens keep isolated logs and clear(token) empties one only', async () => {
  await withServer({}, async (server) => {
    const a = server.newRunToken();
    const b = server.newRunToken();
    await fetch(server.runUrl(a, PAGE));
    await fetch(apiUrl(server, a), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"value":"a"}' });
    await fetch(server.runUrl(b, PAGE));
    assert.equal(server.evidence(a).requests.length, 2);
    assert.equal(server.evidence(b).requests.length, 1);
    assert.deepEqual(server.evidence(b).requests.map((e) => e.path), [PAGE]);
    server.clear(a);
    assert.deepEqual(server.evidence(a), { requests: [], dropped: 0 });
    assert.equal(server.evidence(b).requests.length, 1);
  });
});

test('evidence(token) returns a deep copy', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    await fetch(apiUrl(server, token), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"value":"alpha"}' });
    const copy = server.evidence(token);
    copy.requests[0].body.value = 'tampered';
    copy.requests.push({ injected: true });
    copy.dropped = 99;
    assert.deepEqual(server.evidence(token).requests.map((e) => e.body), [{ value: 'alpha' }]);
    assert.equal(server.evidence(token).dropped, 0);
  });
});

test('the evidence endpoint answers only to the runner secret', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    await fetch(server.runUrl(token, PAGE));
    const url = evidenceUrl(server, token);

    const none = await fetch(url);
    assert.equal(none.status, 403);
    assert.equal(none.headers.get('cache-control'), 'no-store');
    const sameLength = await fetch(url, { headers: { 'x-bench-secret': 'f'.repeat(64) } });
    assert.equal(sameLength.status, 403);
    const shorter = await fetch(url, { headers: { 'x-bench-secret': server.secret.slice(0, 63) } });
    assert.equal(shorter.status, 403);
    const longer = await fetch(url, { headers: { 'x-bench-secret': `${server.secret}0` } });
    assert.equal(longer.status, 403);

    const ok = await fetch(url, { headers: { 'x-bench-secret': server.secret } });
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-type'), /^application\/json/);
    assert.deepEqual(await ok.json(), server.evidence(token));
    assert.equal(server.evidence(token).requests.length, 1, 'evidence reads are never logged into a run');
  });
});

test('the evidence endpoint refuses a bad run, a bad method and an unauthenticated DELETE', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    await fetch(server.runUrl(token, PAGE));
    const auth = { 'x-bench-secret': server.secret };
    assert.equal((await fetch(`${server.baseUrl}/__bench/evidence`, { headers: auth })).status, 400);
    assert.equal((await fetch(`${server.baseUrl}/__bench/evidence?run=bad`, { headers: auth })).status, 400);
    assert.equal((await fetch(evidenceUrl(server, token), { method: 'POST', headers: auth })).status, 405);

    const unauthenticated = await fetch(evidenceUrl(server, token), { method: 'DELETE' });
    assert.equal(unauthenticated.status, 403);
    assert.equal(server.evidence(token).requests.length, 1, 'a refused DELETE clears nothing');

    const cleared = await fetch(evidenceUrl(server, token), { method: 'DELETE', headers: auth });
    assert.equal(cleared.status, 200);
    assert.deepEqual(await cleared.json(), { ok: true });
    assert.deepEqual(server.evidence(token), { requests: [], dropped: 0 });
  });
});

test('a page cannot read evidence with a relative URL', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    const fromPage = new URL(`../../../../__bench/evidence?run=${token}`, server.runUrl(token, PAGE)).href;
    assert.equal(fromPage, evidenceUrl(server, token));
    assert.equal((await fetch(fromPage)).status, 403);
  });
});

test('maxRequestsPerRun keeps the first entries and counts the rest as dropped', async () => {
  await withServer({ maxRequestsPerRun: 3 }, async (server) => {
    const token = server.newRunToken();
    for (let i = 0; i < 4; i += 1) {
      const res = await fetch(`${server.runUrl(token, PAGE)}?n=${i}`);
      assert.equal(res.status, 200, 'a dropped entry is still served');
    }
    const { requests, dropped } = server.evidence(token);
    assert.equal(requests.length, 3);
    assert.equal(dropped, 1);
    assert.deepEqual(requests.map((e) => e.query.n), ['0', '1', '2']);
  });
});

test('a foreign Host header is refused and not logged', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    const res = await rawRequest(server.port, {
      target: `/r/${token}${PAGE}`,
      headers: { host: `rebound.example:${server.port}` },
    });
    assert.equal(res.status, 403);
    assert.deepEqual(server.evidence(token), { requests: [], dropped: 0 });
    const local = await rawRequest(server.port, { target: `/r/${token}${PAGE}`, headers: { host: `localhost:${server.port}` } });
    assert.equal(local.status, 200);
  });
});

test('every response sends cache-control: no-store', async () => {
  await withServer({ maxBodyBytes: 8 }, async (server) => {
    const token = server.newRunToken();
    const targets = [
      { target: `/r/${token}${PAGE}` },
      { target: `/r/${token}/fixtures/missing.html` },
      { target: `/r/bad${PAGE}` },
      { target: '/favicon.ico' },
      { target: `/r/${token}/api/sample/save`, method: 'POST', body: '0123456789' },
      { target: `/r/${token}/api/sample/save`, method: 'POST', body: '01' },
      { target: `/r/${token}/fixtures/${'..%2f'.repeat(8)}package.json` },
      { target: `/__bench/evidence?run=${token}` },
      { target: `/r/${token}${PAGE}`, headers: { host: 'rebound.example' } },
    ];
    for (const spec of targets) {
      const res = await rawRequest(server.port, spec);
      assert.equal(res.headers['cache-control'], 'no-store', `${spec.method || 'GET'} ${spec.target}`);
    }
  });
});

test('runUrl and the token accessors validate their input', async () => {
  await withServer({}, async (server) => {
    const token = server.newRunToken();
    assert.throws(() => server.runUrl('bad', PAGE), TypeError);
    assert.throws(() => server.runUrl(token, 'fixtures/sample/index.html'), TypeError);
    assert.throws(() => server.runUrl(token, '/fixtures/../package.json'), TypeError);
    assert.throws(() => server.clear('bad'), TypeError);
    assert.deepEqual(server.evidence(server.newRunToken()), { requests: [], dropped: 0 });
  });
});

test('close() resolves, is idempotent, and the port stops accepting connections', async () => {
  const server = await startFixtureServer({ root: FIXTURES });
  const { port } = server;
  const token = server.newRunToken();
  assert.equal((await fetch(server.runUrl(token, PAGE))).status, 200);
  await server.close();
  await server.close();
  await assert.rejects(new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(); });
    socket.once('error', reject);
  }), (error) => error.code === 'ECONNREFUSED');
  assert.equal(server.evidence(token).requests.length, 1, 'evidence stays readable after close');
});

test('options are validated before anything binds, and port 7225 is refused', () => {
  const resolved = resolveFixtureServerOptions({ root: FIXTURES });
  assert.equal(resolved.port, 0);
  assert.equal(resolved.maxRequestsPerRun, 2000);
  assert.equal(resolved.maxBodyBytes, 65536);
  assert.match(resolved.secret, /^[0-9a-f]{64}$/);
  assert.throws(() => resolveFixtureServerOptions({ root: FIXTURES, port: 7225 }), /7225/);
  assert.throws(() => resolveFixtureServerOptions({ root: FIXTURES, port: 70000 }), /port/);
  assert.throws(() => resolveFixtureServerOptions({ root: FIXTURES, port: 1.5 }), /port/);
  assert.throws(() => resolveFixtureServerOptions({ root: path.join(FIXTURES, 'absent') }), /root/);
  assert.throws(() => resolveFixtureServerOptions({ root: FIXTURES, secret: 'short' }), /secret/);
  assert.throws(() => resolveFixtureServerOptions({ root: FIXTURES, maxRequestsPerRun: 0 }), /maxRequestsPerRun/);
  assert.throws(() => resolveFixtureServerOptions({ root: FIXTURES, maxBodyBytes: -1 }), /maxBodyBytes/);
  assert.throws(() => resolveFixtureServerOptions({ root: FIXTURES, host: '0.0.0.0' }), /unknown option: host/);
});

test('startFixtureServer rejects a missing root', async () => {
  await assert.rejects(startFixtureServer({ root: path.join(FIXTURES, 'absent') }), /root/);
});

test('the direct-run CLI prints its banner without the secret and exits 0 on SIGTERM', async () => {
  const child = spawn(process.execPath, [SERVER_SCRIPT, '--port', '0', '--root', FIXTURES], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    const deadline = Date.now() + 10_000;
    while (!output.includes('\n') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const banner = output.split('\n')[0];
    const match = /^fixture server on http:\/\/127\.0\.0\.1:(\d+) \(evidence secret held in memory\)$/.exec(banner);
    assert.ok(match, `unexpected banner: ${banner}`);
    const port = Number(match[1]);
    assert.ok(port > 0 && port !== 7225);
    const res = await fetch(`http://127.0.0.1:${port}/r/cliTOKEN01${PAGE}`);
    assert.equal(res.status, 200);
    await res.text();
    child.kill('SIGTERM');
    assert.deepEqual(await exited, { code: 0, signal: null });
    assert.doesNotMatch(output, /[0-9a-f]{64}/, 'the secret is never printed');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
});

test('the CLI prints usage for --help and exits 2 on an unknown argument', async () => {
  const run = (args) => new Promise((resolve) => {
    const child = spawn(process.execPath, [SERVER_SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('exit', (code) => resolve({ code, output }));
  });
  const help = await run(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.output, /usage: node scripts\/bench\/fixture-server\.mjs \[--port N\]/);
  const unknown = await run(['--bogus']);
  assert.equal(unknown.code, 2);
  const badPort = await run(['--port', 'abc']);
  assert.equal(badPort.code, 2);
});
