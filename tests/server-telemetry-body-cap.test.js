/**
 * Phase 273 / INGEST-07(a) -- 32 KB body cap.
 *
 * A 33 KB JSON payload posted to /api/telemetry/events returns 413
 * (Payload Too Large) automatically from express.json's limit option.
 *
 * Run: node tests/server-telemetry-body-cap.test.js
 */

'use strict';

const path = require('path');
const http = require('http');

delete process.env.TELEMETRY_RATE_MAX;

const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
const express = require(require.resolve('express', { paths: [SERVER_NM] }));

const { initializeDatabase } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'schema'));
const Queries = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'queries'));
const { hashIp } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'utils', 'telemetry-hash'));
const createTelemetryRouter = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'routes', 'telemetry'));
const { createGlobalJsonParser } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'middleware', 'global-json-parser'));
const { resetPerUuidBudget } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'middleware', 'telemetry-rate-limit'));

resetPerUuidBudget();
const db = new Database(':memory:');
initializeDatabase(db);
const queries = new Queries(db);
const app = express();
app.set('trust proxy', 1);
// Match production ordering: the global parser is mounted before the telemetry
// router, but must skip this namespace so the router's 32 KB parser sees the
// original request stream.
app.use(createGlobalJsonParser());
app.use('/api/telemetry', createTelemetryRouter(db, queries, hashIp));
// Match the production error-handler ordering. Body-parser forwards an
// entity.too.large error, which must remain a 413 instead of becoming the
// server's generic 500 response.
app.use((err, _req, res, _next) => {
  if (err && (err.status === 413 || err.type === 'entity.too.large')) {
    return res.status(413).json({ error: 'payload_too_large' });
  }
  return res.status(500).json({ error: 'Internal server error' });
});
const server = http.createServer(app).listen(0);
const port = server.address().port;

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

function postBody(rawBytes) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: 'POST',
      host: '127.0.0.1',
      port,
      path: '/api/telemetry/events',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': rawBytes.length,
      },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: chunks }));
    });
    req.on('error', reject);
    req.write(rawBytes);
    req.end();
  });
}

(async function main() {
  console.log('--- server-telemetry-body-cap (INGEST-07a) ---');

  // 33 KB of valid JSON: build a fat string inside a payload field.
  // (We don't care that it fails allowlist after the cap -- the cap fires first.)
  const filler = 'A'.repeat(33 * 1024); // 33 KB of A's
  const oversizePayload = JSON.stringify({ events: [], _filler: filler });

  // Confirm size is > 32 KB.
  check('payload exceeds 32 KB', oversizePayload.length > 32 * 1024, `len=${oversizePayload.length}`);

  const r = await postBody(Buffer.from(oversizePayload));
  check('413 PayloadTooLarge on 33 KB body', r.statusCode === 413, `got ${r.statusCode}, body=${r.body}`);

  // Sanity: a small valid payload still works (avoid false-pass from middleware ordering).
  const smallEvents = JSON.stringify({ events: [] });
  const r2 = await postBody(Buffer.from(smallEvents));
  check('empty batch returns 204 (sanity)', r2.statusCode === 204, `got ${r2.statusCode}, body=${r2.body}`);

  server.close();
  db.close();

  console.log(`\n=== server-telemetry-body-cap results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
