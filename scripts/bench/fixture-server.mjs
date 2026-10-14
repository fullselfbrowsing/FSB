#!/usr/bin/env node
/**
 * Phase 66 benchmark fixture server (D-13, D-17).
 *
 * It runs on request only and is never used by npm test except its unit test
 * (tests/bench-fixture-server.test.mjs). Evidence is the app's own requests;
 * in-page probes are forbidden because they perturb FSB's network-quiet
 * settle wait (Pitfall 9).
 *
 * Contract (plans 66-07 and 66-08 rely on it):
 * - The server binds 127.0.0.1 only; the host is not configurable, and the
 *   FSB hub port 7225 is refused.
 * - GET /r/<token>/fixtures/<rel> serves <root>/<rel>. A token must match
 *   /^[A-Za-z0-9_-]{8,64}$/; anything else is 404 and logged nowhere. A file
 *   is served only when it resolves inside the root, both lexically and
 *   after symlinks (T-66-06). POST to a page is logged and serves the page,
 *   so a native form can post to a result page.
 * - Any method on /r/<token>/api/<...> returns 200 {"ok":true}. Bodies are
 *   parsed by content type: JSON gives 'json', urlencoded gives 'form' (an
 *   object; a repeated key becomes an array), anything else gives 'text',
 *   and an empty body gives 'none'. A body over maxBodyBytes is drained,
 *   answered 413 and logged as 'too_large'.
 * - Every request under a valid /r/<token>/ is logged for that run as
 *   { t, method, path, query, bodyType, body }: t is the arrival time, path
 *   has the run prefix removed, and query keeps the first value of a
 *   repeated key. An entry is added once its body has been read. A run
 *   keeps its first maxRequestsPerRun entries and counts the rest as dropped.
 * - GET and DELETE /__bench/evidence?run=<token> need the x-bench-secret
 *   header, compared in constant time, else 403. The secret lives in the
 *   runner's memory and is never printed, so a page or agent can neither
 *   read nor clear evidence (T-66-04). The runner normally reads evidence
 *   in process through evidence(token), which returns a deep copy.
 * - Every response sends cache-control: no-store. A Host header other than
 *   127.0.0.1:<port> or localhost:<port> is refused (DNS rebinding).
 *
 * CLI: node scripts/bench/fixture-server.mjs [--port N] [--root DIR]
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { stripRunPrefix } from './lib/outcome.mjs';
import { BENCH_FIXTURES_ROOT } from './lib/tasks.mjs';

const HOST = '127.0.0.1';
const HUB_PORT = 7225;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const RUN_PREFIX_PATTERN = /^\/r\/([^/]*)(?:\/|$)/;
const SECRET_PATTERN = /^[\x21-\x7e]{16,256}$/;
const SECRET_HEADER = 'x-bench-secret';
const EVIDENCE_PATH = '/__bench/evidence';
const FIXTURES_PREFIX = '/fixtures/';
const API_PREFIX = '/api/';
const OPTION_KEYS = Object.freeze(['maxBodyBytes', 'maxRequestsPerRun', 'port', 'root', 'secret']);
const DEFAULTS = Object.freeze({ port: 0, maxRequestsPerRun: 2000, maxBodyBytes: 65536 });
const BASE_HEADERS = Object.freeze({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
const TEXT_TYPE = 'text/plain; charset=utf-8';
const JSON_TYPE = 'application/json; charset=utf-8';
const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': JSON_TYPE,
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`);
  return value;
}

/**
 * Validates and fills in server options without binding anything:
 * { root, rootReal, port, secret, maxRequestsPerRun, maxBodyBytes }.
 * Unknown option keys, including a host, are refused.
 */
export function resolveFixtureServerOptions(options = {}) {
  if (!isPlainObject(options)) throw new TypeError('fixture server options must be an object');
  for (const key of Object.keys(options)) {
    if (!OPTION_KEYS.includes(key)) throw new TypeError(`unknown option: ${key}`);
  }
  const pick = (key) => (options[key] === undefined ? DEFAULTS[key] : options[key]);
  const port = pick('port');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError('port must be an integer in 0..65535');
  if (port === HUB_PORT) throw new RangeError('port 7225 belongs to the FSB hub; use 0 for an ephemeral port');
  const maxRequestsPerRun = positiveInteger(pick('maxRequestsPerRun'), 'maxRequestsPerRun');
  const maxBodyBytes = positiveInteger(pick('maxBodyBytes'), 'maxBodyBytes');
  const secret = options.secret === undefined ? randomBytes(32).toString('hex') : options.secret;
  if (typeof secret !== 'string' || !SECRET_PATTERN.test(secret)) {
    throw new TypeError('secret must be 16..256 visible ASCII characters');
  }
  const rootOption = options.root === undefined ? BENCH_FIXTURES_ROOT : options.root;
  if (typeof rootOption !== 'string' || !rootOption) throw new TypeError('root must be a directory path');
  const root = path.resolve(rootOption);
  let rootReal;
  try {
    rootReal = fs.realpathSync(root);
    if (!fs.statSync(rootReal).isDirectory()) throw new Error('not a directory');
  } catch {
    throw new Error(`fixture root not found: ${root}`);
  }
  return { root, rootReal, port, secret, maxRequestsPerRun, maxBodyBytes };
}

function assertToken(token) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    throw new TypeError('run token must match /^[A-Za-z0-9_-]{8,64}$/');
  }
}

function send(response, status, { type = TEXT_TYPE, body = '', headers = {} } = {}) {
  if (response.headersSent || response.destroyed) return;
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  response.writeHead(status, { ...BASE_HEADERS, 'content-type': type, 'content-length': payload.length, ...headers });
  response.end(payload);
}

function sendJson(response, status, value) {
  send(response, status, { type: JSON_TYPE, body: JSON.stringify(value) });
}

// First value wins for a repeated key; a null-prototype object means a
// "__proto__" key is stored as data and never touches a prototype.
function queryObject(params) {
  const out = Object.create(null);
  for (const [key, value] of params) if (!hasOwn(out, key)) out[key] = value;
  return out;
}

function formObject(params) {
  const out = Object.create(null);
  for (const [key, value] of params) {
    if (!hasOwn(out, key)) out[key] = value;
    else if (Array.isArray(out[key])) out[key].push(value);
    else out[key] = [out[key], value];
  }
  return out;
}

function parseBody(bytes, contentType) {
  if (bytes.length === 0) return { bodyType: 'none', body: null };
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  const text = bytes.toString('utf8');
  if (type === 'application/json' || type.endsWith('+json')) {
    try {
      return { bodyType: 'json', body: JSON.parse(text) };
    } catch {
      return { bodyType: 'text', body: text };
    }
  }
  if (type === 'application/x-www-form-urlencoded') {
    return { bodyType: 'form', body: formObject(new URLSearchParams(text)) };
  }
  return { bodyType: 'text', body: text };
}

// Reads a request body up to limit bytes. Past the limit the rest is drained
// and discarded, so memory stays bounded; Node's request timeout bounds a
// body that never ends. A body cut off by the client is logged as 'none'.
function readBody(request, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    let settled = false;
    const settle = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
      } else {
        chunks.push(chunk);
      }
    });
    request.on('end', () => settle(tooLarge
      ? { bodyType: 'too_large', body: null }
      : parseBody(Buffer.concat(chunks), request.headers['content-type'])));
    request.on('error', () => settle({ bodyType: 'none', body: null, aborted: true }));
    request.on('close', () => settle({ bodyType: 'none', body: null, aborted: true }));
  });
}

/**
 * Starts the fixture server. Resolves to a frozen handle:
 * { port, baseUrl, secret, newRunToken(), runUrl(token, startPath),
 *   evidence(token), clear(token), runTokens(), close() }.
 * secret is non-enumerable so the handle never serializes it.
 */
export async function startFixtureServer(options = {}) {
  const config = resolveFixtureServerOptions(options);
  const runs = new Map();
  const secretBytes = Buffer.from(config.secret, 'utf8');
  const secretDigest = createHash('sha256').update(secretBytes).digest();
  let port = 0;

  function logFor(token) {
    let log = runs.get(token);
    if (!log) {
      log = { requests: [], dropped: 0 };
      runs.set(token, log);
    }
    return log;
  }

  function record(token, entry) {
    const log = logFor(token);
    if (log.requests.length < config.maxRequestsPerRun) log.requests.push(entry);
    else log.dropped += 1;
  }

  // The digests always have equal lengths, so timingSafeEqual runs on
  // equal-length buffers whatever the guess; a length mismatch still fails.
  function secretMatches(provided) {
    if (typeof provided !== 'string') return false;
    const providedBytes = Buffer.from(provided, 'utf8');
    const digest = createHash('sha256').update(providedBytes).digest();
    const same = timingSafeEqual(digest, secretDigest);
    return same && providedBytes.length === secretBytes.length;
  }

  function hostAllowed(host) {
    if (typeof host !== 'string') return false;
    const value = host.toLowerCase();
    return value === `${HOST}:${port}` || value === `localhost:${port}`;
  }

  function evidence(token) {
    assertToken(token);
    const log = runs.get(token);
    if (!log) return { requests: [], dropped: 0 };
    return JSON.parse(JSON.stringify({ requests: log.requests, dropped: log.dropped }));
  }

  function clear(token) {
    assertToken(token);
    runs.delete(token);
  }

  function handleEvidence(request, response, url) {
    if (!secretMatches(request.headers[SECRET_HEADER])) {
      send(response, 403, { body: 'forbidden' });
      return;
    }
    if (request.method !== 'GET' && request.method !== 'DELETE') {
      send(response, 405, { body: 'method not allowed', headers: { allow: 'GET, DELETE' } });
      return;
    }
    const token = url.searchParams.get('run');
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
      send(response, 400, { body: 'run must be a valid run token' });
      return;
    }
    if (request.method === 'DELETE') {
      clear(token);
      sendJson(response, 200, { ok: true });
      return;
    }
    sendJson(response, 200, evidence(token));
  }

  async function serveFile(response, routePath) {
    let rel;
    try {
      rel = decodeURIComponent(routePath.slice(FIXTURES_PREFIX.length - 1));
    } catch {
      send(response, 400, { body: 'bad path' });
      return;
    }
    if (rel.includes('\0')) {
      send(response, 400, { body: 'bad path' });
      return;
    }
    const lexical = path.resolve(config.root, `.${rel}`);
    if (lexical !== config.root && !lexical.startsWith(config.root + path.sep)) {
      send(response, 403, { body: 'forbidden' });
      return;
    }
    let real;
    try {
      real = await fs.promises.realpath(lexical);
    } catch {
      send(response, 404, { body: 'not found' });
      return;
    }
    if (real !== config.rootReal && !real.startsWith(config.rootReal + path.sep)) {
      send(response, 403, { body: 'forbidden' });
      return;
    }
    let bytes;
    try {
      if (!(await fs.promises.stat(real)).isFile()) {
        send(response, 404, { body: 'not found' });
        return;
      }
      bytes = await fs.promises.readFile(real);
    } catch {
      send(response, 404, { body: 'not found' });
      return;
    }
    const type = CONTENT_TYPES[path.extname(lexical).toLowerCase()] || 'application/octet-stream';
    send(response, 200, { type, body: bytes });
  }

  async function handleRequest(request, response) {
    const arrivedAt = Date.now();
    if (!hostAllowed(request.headers.host)) {
      request.resume();
      send(response, 403, { body: 'forbidden host' });
      return;
    }
    let url;
    try {
      url = new URL(request.url, `http://${HOST}`);
    } catch {
      request.resume();
      send(response, 400, { body: 'bad request' });
      return;
    }
    if (url.pathname === EVIDENCE_PATH) {
      request.resume();
      handleEvidence(request, response, url);
      return;
    }
    const match = RUN_PREFIX_PATTERN.exec(url.pathname);
    if (!match || !TOKEN_PATTERN.test(match[1])) {
      request.resume();
      send(response, 404, { body: 'not found' });
      return;
    }
    const token = match[1];
    const routePath = stripRunPrefix(url.pathname, token);
    const method = request.method;
    let parsed = { bodyType: 'none', body: null };
    if (method === 'GET' || method === 'HEAD') request.resume();
    else parsed = await readBody(request, config.maxBodyBytes);
    record(token, {
      t: arrivedAt,
      method,
      path: routePath,
      query: queryObject(url.searchParams),
      bodyType: parsed.bodyType,
      body: parsed.body,
    });
    if (parsed.aborted) return;
    if (parsed.bodyType === 'too_large') {
      sendJson(response, 413, { ok: false });
    } else if (routePath.startsWith(API_PREFIX)) {
      sendJson(response, 200, { ok: true });
    } else if (routePath.startsWith(FIXTURES_PREFIX)) {
      if (method === 'GET' || method === 'HEAD' || method === 'POST') await serveFile(response, routePath);
      else send(response, 405, { body: 'method not allowed', headers: { allow: 'GET, HEAD, POST' } });
    } else {
      send(response, 404, { body: 'not found' });
    }
  }

  const server = http.createServer((request, response) => {
    response.on('error', () => {});
    handleRequest(request, response).catch(() => {
      if (!response.headersSent) send(response, 500, { body: 'internal error' });
      else response.destroy();
    });
  });
  // Malformed HTTP gets the same no-store header as every other response.
  server.on('clientError', (_error, socket) => {
    if (socket.writable) {
      socket.end('HTTP/1.1 400 Bad Request\r\ncache-control: no-store\r\nconnection: close\r\ncontent-length: 0\r\n\r\n');
    } else {
      socket.destroy();
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port: config.port, host: HOST }, () => {
      server.off('error', reject);
      resolve();
    });
  });
  port = server.address().port;
  const baseUrl = `http://${HOST}:${port}`;

  let closing = null;
  function close() {
    if (!closing) {
      closing = new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      });
    }
    return closing;
  }

  const handle = {
    port,
    baseUrl,
    newRunToken() {
      const token = randomBytes(16).toString('base64url');
      logFor(token);
      return token;
    },
    runUrl(token, startPath) {
      assertToken(token);
      if (typeof startPath !== 'string' || !startPath.startsWith('/') || startPath.includes('..')) {
        throw new TypeError('startPath must start with / and must not contain ..');
      }
      return `${baseUrl}/r/${token}${startPath}`;
    },
    evidence,
    clear,
    runTokens() {
      return [...runs.keys()].sort();
    },
    close,
  };
  Object.defineProperty(handle, 'secret', { value: config.secret, enumerable: false });
  return Object.freeze(handle);
}

// --- CLI --------------------------------------------------------------------

const USAGE = [
  'usage: node scripts/bench/fixture-server.mjs [--port N] [--root DIR]',
  '  --port N    port to bind on 127.0.0.1 (default 0: an ephemeral port; 7225 is refused)',
  '  --root DIR  fixtures root (default scripts/bench/fixtures)',
  'Serves /r/<token>/fixtures/... and logs each run. Stop with Ctrl-C (SIGINT) or SIGTERM.',
].join('\n');

function parseCliArgs(argv) {
  const args = { port: 0, root: undefined, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--port' || arg === '--root') {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      i += 1;
      if (arg === '--port') {
        if (!/^\d{1,5}$/.test(value)) throw new Error('--port must be an integer in 0..65535');
        args.port = Number(value);
      } else {
        args.root = path.resolve(value);
      }
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function messageOf(error) {
  return error && error.message ? error.message : String(error);
}

async function runCli(argv) {
  let options;
  try {
    const args = parseCliArgs(argv);
    if (args.help) {
      console.log(USAGE);
      return;
    }
    options = { port: args.port, ...(args.root ? { root: args.root } : {}) };
    resolveFixtureServerOptions(options);
  } catch (error) {
    console.error(`fixture-server: ${messageOf(error)}`);
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  let handle;
  try {
    handle = await startFixtureServer(options);
  } catch (error) {
    console.error(`fixture-server: ${messageOf(error)}`);
    process.exitCode = 1;
    return;
  }
  const banner = `fixture server on ${handle.baseUrl} (evidence secret held in memory)`;
  console.log(banner);
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    handle.close().then(() => process.exit(0), () => process.exit(1));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

const invokedPath = process.argv[1] ? (() => {
  try {
    return pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return null;
  }
})() : null;
if (invokedPath === import.meta.url) {
  runCli(process.argv.slice(2));
}
