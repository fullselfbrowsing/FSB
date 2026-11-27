/**
 * The stored ip_hash keeps only the first 64 bits of the daily-salted HMAC, and
 * initializeDatabase() shortens rows written before that. Every ip_hash reader
 * must answer the same before and after: the per-IP daily budgets
 * (checkPerIpDailyContribution) and the per-source active-agent cap in
 * selectGlobalForDayRange. Also checks the WAL size cap.
 *
 * Run: node tests/server-telemetry-ip-hash-compact.test.js
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.TELEMETRY_IP_DAILY_UUID_MAX = '3';
process.env.TELEMETRY_IP_DAILY_TOKEN_MAX = '1000';

const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
const { initializeDatabase } = require('../showcase/server/src/db/schema');
const Queries = require('../showcase/server/src/db/queries');
const { hashIp, IP_HASH_HEX_CHARS } = require('../showcase/server/src/utils/telemetry-hash');
const { getOrMintTodaySalt } = require('../showcase/server/src/utils/telemetry-salt');
const {
  checkPerIpDailyContribution,
  PER_IP_DAILY_UUID_BUDGET,
  PER_IP_DAILY_TOKEN_BUDGET,
} = require('../showcase/server/src/middleware/telemetry-rate-limit');

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Silence initializeDatabase()'s one-line boot log.
const realLog = console.log;
function quietInit(db) {
  console.log = () => {};
  try { initializeDatabase(db); } finally { console.log = realLog; }
}

console.log('--- server-telemetry-ip-hash-compact ---');
check('budgets come from this test\'s env', PER_IP_DAILY_UUID_BUDGET === 3 && PER_IP_DAILY_TOKEN_BUDGET === 1000,
  `${PER_IP_DAILY_UUID_BUDGET}/${PER_IP_DAILY_TOKEN_BUDGET}`);

// ---------------------------------------------------------------------------
// 1. hashIp
// ---------------------------------------------------------------------------
{
  const db = new Database(':memory:');
  quietInit(db);
  const ip = '203.0.113.7';
  const h = hashIp(ip, db);
  const { salt_hex } = getOrMintTodaySalt(db);
  const full = crypto.createHmac('sha256', Buffer.from(salt_hex, 'hex')).update(ip, 'utf8').digest('hex');
  check('IP_HASH_HEX_CHARS is 16 (64 bits)', IP_HASH_HEX_CHARS === 16, String(IP_HASH_HEX_CHARS));
  check('hashIp returns 16 lowercase hex chars', /^[0-9a-f]{16}$/.test(h), h);
  check('hashIp is the first 64 bits of HMAC-SHA256 with today\'s salt', h === full.slice(0, 16), `${h} vs ${full}`);
  check('the same IP gives the same hash', hashIp(ip, db) === h, 'changed');
  const seen = new Set();
  for (let i = 0; i < 5000; i++) seen.add(hashIp(`198.51.${i >> 8}.${i & 255}`, db));
  check('5,000 distinct IPs give 5,000 distinct hashes', seen.size === 5000, String(seen.size));
  db.close();
}

// ---------------------------------------------------------------------------
// 2. Boot migration: identical answers before and after
// ---------------------------------------------------------------------------
const NOW = Date.UTC(2026, 10, 27, 12, 0, 0); // fixed midday, so "today" cannot roll over mid-test
const DAY = 86400000;
const TODAY = Date.UTC(2026, 10, 27);
const fullOf = (label) => crypto.createHash('sha256').update(label).digest('hex'); // a pre-change 64-char value
const A = fullOf('source-A');
const B = fullOf('source-B');
const C = fullOf('source-C');
const SHORT = crypto.createHash('sha256').update('already-short').digest('hex').slice(0, 16);
const u = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ev = (n) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;

const db = new Database(':memory:');
quietInit(db);
const queries = new Queries(db);
let nextEvent = 1;
function insert(installNo, ipHash, receivedAt, { tokens = 0, active = 0 } = {}) {
  queries.insertTelemetryEventWithRegionV3.run(
    ev(nextEvent++), u(installNo), receivedAt - 30000, 'Codex', 'gpt-5', tokens, 0,
    active, 2, 'periodic', ipHash, receivedAt, 'US-CA/San Jose', 'ipv4');
}
// Source A: three installs today (its UUID budget), 30 active agents each (capped at 64 per source).
for (const n of [1, 2, 3]) insert(n, A, NOW - n * 60000, { active: 30 });
// Source B: one install with 990 of its 1,000 daily tokens.
insert(4, B, NOW - 5 * 60000, { tokens: 990, active: 10 });
// Source C: rows from three days ago.
for (const n of [5, 6]) insert(n, C, NOW - 3 * DAY, { active: 4 });
// Values that must be left alone.
insert(7, 'h1', NOW - 7 * 60000, { active: 1 });
insert(8, SHORT, NOW - 8 * 60000, { active: 1 });

const candidate = (installNo, tokens) => [{ event_id: ev(900000 + installNo * 10 + tokens), install_uuid: u(installNo), tokens_in: tokens, tokens_out: 0 }];
function budgetAnswers(key) {
  return {
    newInstallA: checkPerIpDailyContribution(db, key(A), u(9), candidate(9, 1), NOW),
    knownInstallA: checkPerIpDailyContribution(db, key(A), u(1), candidate(1, 1), NOW),
    overTokensB: checkPerIpDailyContribution(db, key(B), u(4), candidate(4, 20), NOW),
    underTokensB: checkPerIpDailyContribution(db, key(B), u(4), candidate(4, 5), NOW),
    replayedEvent: checkPerIpDailyContribution(db, key(A), u(9), [{ event_id: ev(1), install_uuid: u(9), tokens_in: 1, tokens_out: 0 }], NOW),
  };
}
function aggregateAnswers() {
  return {
    today: queries.selectGlobalForDayRange.get(TODAY, TODAY + DAY),
    threeDaysAgo: queries.selectGlobalForDayRange.get(TODAY - 3 * DAY, TODAY - 2 * DAY),
  };
}
const master = () => db.prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name').all();
const hashes = () => db.prepare('SELECT rowid, ip_hash FROM telemetry_events ORDER BY rowid').all();

const before = { budgets: budgetAnswers((h) => h), aggregates: aggregateAnswers() };
const masterBefore = master();
const hashesBefore = hashes();
check('fixture: source A is at its UUID budget', before.budgets.newInstallA.reason === 'distinct_install_uuids',
  JSON.stringify(before.budgets.newInstallA));
check('fixture: source B would exceed its token budget', before.budgets.overTokensB.reason === 'token_contribution',
  JSON.stringify(before.budgets.overTokensB));
check('fixture: source A is capped at 64 active agents', before.aggregates.today.agents_active_sum === 64 + 10 + 2,
  JSON.stringify(before.aggregates.today));

quietInit(db); // runs the migration

const after = { budgets: budgetAnswers((h) => (h.length === 64 ? h.slice(0, 16) : h)), aggregates: aggregateAnswers() };
check('per-IP budget answers are identical after the migration', same(before.budgets, after.budgets),
  `${JSON.stringify(before.budgets)} vs ${JSON.stringify(after.budgets)}`);
check('per-source aggregates are identical after the migration', same(before.aggregates, after.aggregates),
  `${JSON.stringify(before.aggregates)} vs ${JSON.stringify(after.aggregates)}`);

const hashesAfter = hashes();
check('every 64-char hash became its 16-char prefix', hashesAfter.every((r, i) => {
  const old = hashesBefore[i].ip_hash;
  return r.rowid === hashesBefore[i].rowid && r.ip_hash === (old.length === 64 ? old.slice(0, 16) : old);
}), JSON.stringify(hashesAfter));
check('no 64-char hash remains', db.prepare('SELECT COUNT(*) AS n FROM telemetry_events WHERE length(ip_hash) = 64').get().n === 0, 'some remain');
check('short and non-hex values are left alone',
  hashesAfter.some((r) => r.ip_hash === 'h1') && hashesAfter.some((r) => r.ip_hash === SHORT), JSON.stringify(hashesAfter));
check('the schema is unchanged by the migration', same(masterBefore, master()), 'sqlite_master changed');
check('the page cache is restored after the migration', db.pragma('cache_size', { simple: true }) === -64000,
  String(db.pragma('cache_size', { simple: true })));

quietInit(db);
check('the migration is idempotent', same(hashesAfter, hashes()), 'a second run changed rows');

// New rows (hashIp output) group with migrated rows from the same source.
insert(1, A.slice(0, 16), NOW - 30000, { active: 30 });
check('a new row from source A still counts toward its budget',
  checkPerIpDailyContribution(db, A.slice(0, 16), u(9), candidate(9, 2), NOW).reason === 'distinct_install_uuids', 'budget split');
db.close();

// ---------------------------------------------------------------------------
// 3. Batching: more rows than one batch
// ---------------------------------------------------------------------------
{
  const big = new Database(':memory:');
  quietInit(big);
  const q = new Queries(big);
  const insertMany = big.transaction(() => {
    for (let i = 0; i < 12345; i++) {
      q.insertTelemetryEventWithRegionV3.run(crypto.randomUUID(), u(i % 50), NOW - i, 'unknown', null, 0, 0, 0, 2,
        'periodic', fullOf(`ip-${i % 300}`), NOW - i, 'unknown', 'ipv4');
    }
  });
  insertMany();
  quietInit(big);
  const left = big.prepare('SELECT COUNT(*) AS n FROM telemetry_events WHERE length(ip_hash) = 64').get().n;
  const distinct = big.prepare('SELECT COUNT(DISTINCT ip_hash) AS n FROM telemetry_events').get().n;
  check('12,345 rows (three batches) are all shortened', left === 0, `${left} left`);
  check('300 sources stay 300 distinct hashes', distinct === 300, String(distinct));
  big.close();
}

// ---------------------------------------------------------------------------
// 4. WAL size cap
// ---------------------------------------------------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-wal-cap-'));
  try {
    const file = path.join(dir, 'cap.db');
    const fdb = new Database(file);
    quietInit(fdb);
    check('journal_size_limit is 4 MiB', fdb.pragma('journal_size_limit', { simple: true }) === 4194304,
      String(fdb.pragma('journal_size_limit', { simple: true })));
    fdb.exec('CREATE TABLE wal_probe (blob BLOB)');
    const put = fdb.prepare('INSERT INTO wal_probe VALUES (?)');
    fdb.transaction(() => { for (let i = 0; i < 3000; i++) put.run(crypto.randomBytes(4096)); })();
    const grown = fs.statSync(`${file}-wal`).size;
    fdb.pragma('wal_checkpoint(RESTART)');
    put.run(Buffer.from('x')); // the next write resets the WAL, which applies the limit
    const capped = fs.statSync(`${file}-wal`).size;
    check(`WAL grew past 4 MiB during a big write (${grown} bytes)`, grown > 4194304, String(grown));
    check(`WAL is truncated to at most 4 MiB afterwards (${capped} bytes)`, capped <= 4194304, String(capped));
    fdb.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`\n=== server-telemetry-ip-hash-compact results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
