/**
 * ip-geo.js compact binary tables (FSBGEO1, src/utils/ip-geo-binary.js).
 *
 * A binary table must answer EXACTLY like the CSV it was built from, for every
 * address. This test:
 *   1. converts the committed fixtures with the CLI and verifies them interval
 *      by interval;
 *   2. compares deriveRegion() over the CSV and binary tables on every range
 *      boundary, both sides of every gap, 10k random IPv4 and IPv6 addresses,
 *      and edge inputs (mapped IPv4, ULA, /56 keys, garbage);
 *   3. covers a synthetic table with a range starting at 0, a range ending at
 *      the top of the address space, multibyte names, 4-column rows, CRLF
 *      lines, padded fields and reserved 'ZZ' rows;
 *   4. checks every converter refusal (overlap, order, malformed line, IPv4 end
 *      overflow, oversized field, over-long line, empty table, --out suffix)
 *      and that a refused conversion leaves no files behind;
 *   5. checks that truncated, corrupt, wrong-family and places-slot binaries
 *      resolve to 'unknown' / null without throwing;
 *   6. checks the size win on a realistic synthetic table and the RSS of an
 *      isolated lookup process over a 1M-range binary.
 *
 * No framework; PASS/FAIL counter + non-zero exit on failure.
 * Run: node tests/server-ip-geo-binary.test.js
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const SERVER = path.join(__dirname, '..', 'showcase', 'server');
const IP_GEO = path.join(SERVER, 'src', 'utils', 'ip-geo');
const ipGeo = require(IP_GEO);
const geoBin = require(path.join(SERVER, 'src', 'utils', 'ip-geo-binary'));
const CONVERT = path.join(SERVER, 'scripts', 'convert-dbip-to-binary.mjs');
const DATA = path.join(SERVER, 'data');
const FIX4 = path.join(DATA, 'dbip-city-lite.fixture.csv');
const FIX6 = path.join(DATA, 'dbip-city-lite.ipv6.fixture.csv');
const FIXP = path.join(DATA, 'dbip-city-lite.places.fixture.csv');

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-geo-bin-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });
const tmp = (name) => path.join(TMP, name);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cli(args) {
  return spawnSync(process.execPath, [CONVERT, ...args], { encoding: 'utf8' });
}

function convert(family, csvPath, binPath) {
  const r = cli(['--family', String(family), '--in', csvPath, '--out', binPath]);
  if (r.status !== 0) throw new Error(`convert failed (${r.status}): ${r.stderr}`);
  return r.stdout;
}

function rowsOf(csvPath, family) {
  return [...ipGeo._csvInternals.dataRows(fs.readFileSync(csvPath), family)];
}

function withBinary(binPath, family, fn) {
  const fd = fs.openSync(binPath, 'r');
  try {
    const file = geoBin.openBinary(fd, fs.fstatSync(fd).size, family);
    return fn(file);
  } finally {
    fs.closeSync(fd);
  }
}

function usePaths(v4, v6, places) {
  process.env.DBIP_DATASET_PATH = v4;
  process.env.DBIP_IPV6_DATASET_PATH = v6;
  process.env.DBIP_PLACES_DATASET_PATH = places;
  ipGeo._resetForTest();
}

function answers(paths, ips) {
  usePaths(...paths);
  return ips.map((ip) => JSON.stringify(ipGeo.deriveRegion(ip)));
}

function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

// A /64 prefix as an address: once with '::1' low bits, once with all-ones low
// bits (both must map to the prefix).
function prefixToIps(prefix) {
  const g = [48n, 32n, 16n, 0n].map((s) => ((prefix >> s) & 0xFFFFn).toString(16));
  return [`${g.join(':')}::1`, `${g.join(':')}:ffff:ffff:ffff:ffff`];
}

function boundaryIps(rows, family) {
  const max = family === 4 ? 0xFFFFFFFF : 0xFFFFFFFFFFFFFFFFn;
  const zero = family === 4 ? 0 : 0n;
  const one = family === 4 ? 1 : 1n;
  const keys = new Set([zero, max]);
  for (const r of rows) {
    for (const k of [r.start - one, r.start, r.end, r.end + one]) {
      if (k >= zero && k <= max) keys.add(k);
    }
  }
  const out = [];
  for (const k of keys) {
    if (family === 4) out.push(intToIp(k));
    else out.push(...prefixToIps(k));
  }
  return out;
}

// Deterministic PRNG (mulberry32) so a failure reproduces.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  };
}

function randomIps(rows, family, n, seed) {
  const next = rng(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const inRow = rows.length > 0 && (i % 2 === 0);
    if (family === 4) {
      if (inRow) {
        const r = rows[next() % rows.length];
        out.push(intToIp(r.start + (next() % (r.end - r.start + 1))));
      } else {
        out.push(intToIp(next()));
      }
    } else {
      let prefix;
      if (inRow) {
        const r = rows[next() % rows.length];
        const span = r.end - r.start + 1n;
        const offset = ((BigInt(next()) << 32n) | BigInt(next())) % span;
        prefix = r.start + offset;
      } else {
        prefix = (BigInt(next()) << 32n) | BigInt(next());
      }
      out.push(prefixToIps(prefix)[i % 2]);
    }
  }
  return out;
}

function compare(label, csvPaths, binPaths, ips) {
  const a = answers(csvPaths, ips);
  const b = answers(binPaths, ips);
  const diffs = [];
  for (let i = 0; i < ips.length; i++) {
    if (a[i] !== b[i]) diffs.push(`${ips[i]}: csv ${a[i]} vs bin ${b[i]}`);
  }
  check(`${label}: ${ips.length} lookups identical`, diffs.length === 0, diffs.slice(0, 5).join('; '));
}

const EDGE_IPS = [
  '0.0.0.0', '0.0.0.1', '1.1.1.1', '224.0.0.1', '255.255.255.254', '255.255.255.255',
  '::ffff:1.1.1.1', '::ffff:8.8.8.8', ':ffff:8.8.8.8', '::', '::1', 'fdaa::1', 'fe80::1',
  '2001:db8::1', '2405:201::1', '2405:201:abcd::/56', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
  'garbage', '', '1.2.3', '1.2.3.4.5', '01.2.3.4', '2001:db8::1%eth0', '::ffff:1.2.3.4/96',
];

// ---------------------------------------------------------------------------
// 1-2. Committed fixtures
// ---------------------------------------------------------------------------

console.log('\n1. Fixtures: convert, verify, compare');
const fx4 = tmp('fixture.bin');
const fx6 = tmp('fixture.ipv6.bin');
{
  const out4 = convert(4, FIX4, fx4);
  const out6 = convert(6, FIX6, fx6);
  check('IPv4 fixture converts and verifies', /verified: \d+ intervals/.test(out4), out4);
  check('IPv6 fixture converts and verifies', /verified: \d+ intervals/.test(out6), out6);
  check('no .tmp left after a successful conversion', !fs.existsSync(`${fx4}.tmp`) && !fs.existsSync(`${fx6}.tmp`), 'tmp file remains');

  const v = cli(['--verify', '--family', '4', '--in', FIX4, '--bin', fx4]);
  check('CLI --verify accepts the IPv4 fixture', v.status === 0 && /matches/.test(v.stdout), v.stderr || v.stdout);

  const rows4 = rowsOf(FIX4, 4);
  const rows6 = rowsOf(FIX6, 6);
  const proof4 = withBinary(fx4, 4, (f) => geoBin.verifyAgainstRows(f, rows4));
  const proof6 = withBinary(fx6, 6, (f) => geoBin.verifyAgainstRows(f, rows6));
  check(`IPv4 proof covers every CSV row (${proof4.places} = ${rows4.length})`, proof4.places === rows4.length, JSON.stringify(proof4));
  check(`IPv6 proof covers every CSV row (${proof6.places} = ${rows6.length})`, proof6.places === rows6.length, JSON.stringify(proof6));
  check('notes carry the DB-IP attribution',
    withBinary(fx4, 4, (f) => geoBin.readNotes(f)).includes('IP Geolocation by DB-IP (https://db-ip.com), CC-BY-4.0'),
    'attribution missing');

  const csvPaths = [FIX4, FIX6, FIXP];
  const binPaths = [fx4, fx6, FIXP];
  compare('fixture boundaries (IPv4)', csvPaths, binPaths, boundaryIps(rows4, 4));
  compare('fixture boundaries (IPv6)', csvPaths, binPaths, boundaryIps(rows6, 6));
  compare('fixture random IPv4', csvPaths, binPaths, randomIps(rows4, 4, 10000, 1));
  compare('fixture random IPv6', csvPaths, binPaths, randomIps(rows6, 6, 10000, 2));
  compare('edge inputs', csvPaths, binPaths, EDGE_IPS);

  // The 4-column row decodes with an empty city, in both forms.
  usePaths(fx4, fx6, FIXP);
  const texas = ipGeo.deriveRegion('1.1.1.1');
  check('4-column fixture row resolves with an empty city from the binary',
    texas && texas.country === 'US' && texas.subdivision === 'Texas' && texas.city === '', JSON.stringify(texas));
  const melbourne = ipGeo.placeCentroid('AU-Victoria/Melbourne');
  check('places stay CSV and still resolve beside binary range tables',
    melbourne && melbourne.lat === -37.8 && melbourne.lon === 145, JSON.stringify(melbourne));

  // Dump decodes back to the same rows.
  const dumped = tmp('fixture.dump.csv');
  const d = cli(['--dump', '--family', '4', '--bin', fx4, '--out', dumped]);
  check('CLI --dump writes the rows back', d.status === 0, d.stderr);
  const back = rowsOf(dumped, 4);
  check('dumped rows decode to the fixture rows', JSON.stringify(back) === JSON.stringify(rows4), 'dump differs');
}

// ---------------------------------------------------------------------------
// 3. Synthetic edge tables
// ---------------------------------------------------------------------------

console.log('\n3. Synthetic edge tables');
const syn4 = tmp('syn.csv');
const syn6 = tmp('syn.ipv6.csv');
fs.writeFileSync(syn4, [
  '# synthetic IPv4 edge table',
  '0,255,AA,Zero,Start',
  '',
  '1000,1999,BR,São Paulo,São Paulo',
  '2000,2999,JP,東京都,渋谷区\r',
  '3000,3999,CH,Zürich',
  '   # an indented comment',
  '  5000,5999, US , California , San Jose ',
  '6000,6999,ZZ,,',
  '7000,7999,IN,Maharashtra,Mumbai\r',
  '4294967040,4294967295,NZ,Auckland,Auckland',
].join('\n'));
fs.writeFileSync(syn6, [
  '# synthetic IPv6 edge table',
  '0000000000000000,00000000ffffffff,AA,,Low',
  '2001000000000000,2001ffffffffffff,FR,Île-de-France,Paris',
  '2002000000000000,2002000000000000,ZZ,,',
  'ffffffff00000000,ffffffffffffffff,NZ,Auckland,Auckland',
].join('\n'));
{
  const b4 = tmp('syn.bin');
  const b6 = tmp('syn.ipv6.bin');
  convert(4, syn4, b4);
  convert(6, syn6, b6);
  const rows4 = rowsOf(syn4, 4);
  const rows6 = rowsOf(syn6, 6);
  const p4 = withBinary(b4, 4, (f) => geoBin.verifyAgainstRows(f, rows4));
  check('a range starting at 0 needs no leading gap record', withBinary(b4, 4, (f) => {
    const first = geoBin.readRecords(f).next().value;
    return first.start === 0 && first.placeId !== geoBin.UNKNOWN_PLACE;
  }), 'first record is a gap');
  check('IPv4 table ending at 255.255.255.255 has no trailing gap', p4.unknown === 3, JSON.stringify(p4));
  const csvPaths = [syn4, syn6, FIXP];
  const binPaths = [b4, b6, FIXP];
  compare('synthetic boundaries (IPv4)', csvPaths, binPaths, boundaryIps(rows4, 4));
  compare('synthetic boundaries (IPv6)', csvPaths, binPaths, boundaryIps(rows6, 6));
  compare('synthetic random IPv4', csvPaths, binPaths, randomIps(rows4, 4, 5000, 3));
  compare('synthetic random IPv6', csvPaths, binPaths, randomIps(rows6, 6, 5000, 4));

  usePaths(b4, b6, FIXP);
  const tokyo = ipGeo.deriveRegion(intToIp(2500));
  check('multibyte names round-trip', tokyo && tokyo.subdivision === '東京都' && tokyo.city === '渋谷区', JSON.stringify(tokyo));
  const padded = ipGeo.deriveRegion(intToIp(5500));
  check('padded fields decode trimmed, as in the CSV', padded && padded.country === 'US' && padded.city === 'San Jose', JSON.stringify(padded));
  check('reserved ZZ rows resolve to unknown', ipGeo.deriveRegion(intToIp(6500)) === 'unknown', 'ZZ resolved');
  const top = ipGeo.deriveRegion('255.255.255.255');
  check('the top IPv4 address resolves to its row', top && top.country === 'NZ', JSON.stringify(top));
  const topV6 = ipGeo.deriveRegion('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff');
  check('the top IPv6 prefix resolves to its row', topV6 && topV6.country === 'NZ', JSON.stringify(topV6));
}

// The production-shaped table: a refresh-style CSV dumps back byte-identical.
{
  const lines = ['1000,1999,US,California,San Jose', '2000,2999,US,California,Los Angeles', '5000,5999,DE,Bavaria,Munich'];
  const csvPath = tmp('refresh-style.csv');
  fs.writeFileSync(csvPath, `# header\n${lines.join('\n')}\n`);
  const binPath = tmp('refresh-style.bin');
  convert(4, csvPath, binPath);
  const dumped = tmp('refresh-style.dump.csv');
  cli(['--dump', '--family', '4', '--bin', binPath, '--out', dumped]);
  check('refresh-style CSV dumps back byte-identical', fs.readFileSync(dumped, 'utf8') === `${lines.join('\n')}\n`,
    JSON.stringify(fs.readFileSync(dumped, 'utf8')));
}

// ---------------------------------------------------------------------------
// 4. Converter refusals
// ---------------------------------------------------------------------------

console.log('\n4. Converter refusals');
function refuses(label, family, text, pattern) {
  const csvPath = tmp(`refuse-${passed + failed}.csv`);
  const binPath = `${csvPath}.bin`;
  fs.writeFileSync(csvPath, text);
  const r = cli(['--family', String(family), '--in', csvPath, '--out', binPath]);
  check(`refuses ${label}`, r.status !== 0 && pattern.test(r.stderr), `status ${r.status}: ${r.stderr}`);
  check(`refused ${label} leaves no output`, !fs.existsSync(binPath) && !fs.existsSync(`${binPath}.tmp`), 'output written');
}
refuses('overlapping rows', 4, '100,200,US,A,B\n150,300,US,C,D\n', /overlaps or is out of order/);
refuses('rows out of order', 4, '300,400,US,A,B\n100,200,US,C,D\n', /overlaps or is out of order/);
refuses('a malformed data line', 4, '100,200,US,A,B\n300,abc,US,C,D\n', /not an IPv4 range row/);
refuses('an IPv4 end above 255.255.255.255', 4, '4294967040,4294967296,US,A,B\n', /ends above 255\.255\.255\.255/);
refuses('a field longer than 255 bytes', 4, `100,200,US,A,${'x'.repeat(256)}\n`, /longer than 255 bytes/);
refuses('a line too long for the on-disk search', 4, `# ${'x'.repeat(70 * 1024)}\n100,200,US,A,B\n`, /too long/);
refuses('a table with no data rows', 4, '# only a comment\n\n', /no IPv4 data rows/);
refuses('an IPv6 row in an IPv4 table', 4, '20010db800000000,20010db8ffffffff,AU,Victoria,Melbourne\n', /not an IPv4 range row/);
refuses('overlapping IPv6 rows', 6, '2001000000000000,2001ffffffffffff,FR,A,B\n2001800000000000,2002ffffffffffff,FR,C,D\n', /overlaps or is out of order/);
{
  const r = cli(['--family', '4', '--in', FIX4, '--out', tmp('wrong-suffix.csv')]);
  check('refuses an --out that is not .bin', r.status === 2 && !fs.existsSync(tmp('wrong-suffix.csv')), `status ${r.status}`);
}

// ---------------------------------------------------------------------------
// 5. Graceful degradation
// ---------------------------------------------------------------------------

console.log('\n5. Corrupt and misplaced binaries');
function variant(name, mutate) {
  const p = tmp(name);
  const buf = Buffer.from(fs.readFileSync(fx4));
  fs.writeFileSync(p, mutate(buf));
  return p;
}
const header = (buf, offset, value) => { buf.writeUInt32LE(value >>> 0, offset); return buf; };
const recordsOffset = fs.readFileSync(fx4).readUInt32LE(16);
const bad = {
  'truncated to half': variant('trunc.bin', (b) => b.subarray(0, Math.floor(b.length / 2))),
  'header only': variant('header-only.bin', (b) => b.subarray(0, 64)),
  'record count too large': variant('count.bin', (b) => header(b, 12, 0xFFFFFFFF)),
  'record count zero': variant('count0.bin', (b) => header(b, 12, 0)),
  'records offset outside the file': variant('roff.bin', (b) => header(b, 16, 0x7FFFFFFF)),
  'dictionary larger than the file': variant('dict.bin', (b) => header(b, 24, 0x7FFFFFFF)),
  'first record not at 0': variant('first.bin', (b) => header(b, recordsOffset, 5)),
  'family byte changed': variant('family.bin', (b) => { b[8] = 6; return b; }),
  'magic changed': variant('magic.bin', (b) => { b[0] = 0x58; return b; }),
};
for (const [label, p] of Object.entries(bad)) {
  let threw = null;
  let results = [];
  try {
    usePaths(p, fx6, FIXP);
    results = ['1.1.1.1', '8.8.8.8', '0.0.0.0', '255.255.255.255'].map((ip) => ipGeo.deriveRegion(ip));
  } catch (err) {
    threw = err;
  }
  check(`${label}: lookups return 'unknown' without throwing`,
    threw === null && results.every((r) => r === 'unknown'), threw ? threw.message : JSON.stringify(results));
}
{
  // A placeId pointing past the dictionary resolves to 'unknown', not a throw.
  const p = variant('placeid.bin', (b) => {
    const count = b.readUInt32LE(12);
    for (let i = 0; i < count; i++) {
      const at = recordsOffset + i * 8 + 4;
      if (b.readUInt32LE(at) !== geoBin.UNKNOWN_PLACE) b.writeUInt32LE(0x7FFFFFF0, at);
    }
    return b;
  });
  usePaths(p, fx6, FIXP);
  check('a placeId outside the dictionary resolves to unknown', ipGeo.deriveRegion('8.8.8.8') === 'unknown', 'resolved');
}
{
  usePaths(fx6, fx4, FIXP); // swapped families
  check('an IPv6 table in the IPv4 slot is rejected', ipGeo.deriveRegion('8.8.8.8') === 'unknown', 'accepted');
  check('an IPv4 table in the IPv6 slot is rejected', ipGeo.deriveRegion('2405:201::1') === 'unknown', 'accepted');
  usePaths(fx4, fx6, fx4); // a binary file in the places slot
  check('a binary file in the places slot yields no centroid', ipGeo.placeCentroid('US') === null, 'centroid returned');
  usePaths(tmp('missing.bin'), tmp('missing.ipv6.bin'), tmp('missing.places.csv'));
  check('absent binary tables degrade to unknown', ipGeo.deriveRegion('8.8.8.8') === 'unknown', 'resolved');
}
{
  check('siblingIpv6Path maps .bin to .ipv6.bin', ipGeo.siblingIpv6Path('/d/dbip-city-lite.bin') === '/d/dbip-city-lite.ipv6.bin',
    ipGeo.siblingIpv6Path('/d/dbip-city-lite.bin'));
  check('siblingPlacesPath maps .bin to .places.csv', ipGeo.siblingPlacesPath('/d/dbip-city-lite.bin') === '/d/dbip-city-lite.places.csv',
    ipGeo.siblingPlacesPath('/d/dbip-city-lite.bin'));
  check('siblingIpv6Path for .csv is unchanged', ipGeo.siblingIpv6Path('/d/dbip-city-lite.csv') === '/d/dbip-city-lite.ipv6.csv',
    ipGeo.siblingIpv6Path('/d/dbip-city-lite.csv'));
}

// ---------------------------------------------------------------------------
// 6. Size and memory at scale
// ---------------------------------------------------------------------------

console.log('\n6. Size and memory at scale');
{
  // 50k rows with ~25-byte labels from a few thousand places, like the real data.
  const csvPath = tmp('realistic.csv');
  const next = rng(5);
  const fd = fs.openSync(csvPath, 'w');
  let chunk = '# realistic synthetic table\n';
  let start = 16777216;
  for (let i = 0; i < 50000; i++) {
    const len = 1 + (next() % 4096);
    const place = next() % 3000;
    chunk += `${start},${start + len - 1},C${place % 200},Subdivision ${place % 700},City ${place}\n`;
    start += len + (i % 1000 === 0 ? 256 : 0);
    if (chunk.length > 1 << 20) { fs.writeSync(fd, chunk); chunk = ''; }
  }
  fs.writeSync(fd, chunk);
  fs.closeSync(fd);
  const binPath = tmp('realistic.bin');
  convert(4, csvPath, binPath);
  const ratio = fs.statSync(binPath).size / fs.statSync(csvPath).size;
  console.log(`  [info] realistic table: binary is ${(ratio * 100).toFixed(1)}% of the CSV`);
  check(`binary is under 35% of the CSV (got ${(ratio * 100).toFixed(1)}%)`, ratio < 0.35, `ratio ${ratio}`);
  compare('realistic random IPv4', [csvPath, FIX6, FIXP], [binPath, FIX6, FIXP], randomIps(rowsOf(csvPath, 4), 4, 5000, 6));
}
{
  // 1M ranges, built by streaming rows into the encoder.
  const N = 1000000;
  function* rows() {
    for (let i = 0; i < N; i++) {
      const place = i % 1000;
      yield { start: i * 256, end: i * 256 + 255, country: 'XX', subdivision: `Région ${place % 50}`, city: `Città ${place}` };
    }
  }
  const binPath = tmp('scale.bin');
  fs.writeFileSync(binPath, geoBin.encode(rows(), 4, 'scale test'));
  const probe = `
    process.env.DBIP_DATASET_PATH = ${JSON.stringify(binPath)};
    process.env.DBIP_IPV6_DATASET_PATH = ${JSON.stringify(tmp('none.ipv6.bin'))};
    process.env.DBIP_PLACES_DATASET_PATH = ${JSON.stringify(FIXP)};
    const g = require(${JSON.stringify(IP_GEO)});
    let ok = 0;
    for (let i = 0; i < 2000; i++) {
      const n = (i * 7919) % ${N};
      const r = g.deriveRegion([(n >>> 16) & 255, (n >>> 8) & 255, n & 255, 7].join('.'));
      if (r && r.city === 'Città ' + (n % 1000)) ok++;
    }
    const tail = g.deriveRegion('255.255.255.255');
    console.log(JSON.stringify({ ok, tail, rss: process.memoryUsage().rss }));
  `;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', probe], { encoding: 'utf8' }).trim());
  const rssMb = out.rss / 1048576;
  console.log(`  [info] isolated lookup RSS over ${N} ranges: ${rssMb.toFixed(1)}MB`);
  check('2000 lookups over 1M binary ranges are all correct', out.ok === 2000, `ok=${out.ok}`);
  check('the space past the last range resolves to unknown', out.tail === 'unknown', JSON.stringify(out.tail));
  check(`isolated lookup RSS < 100MB (got ${rssMb.toFixed(1)}MB)`, rssMb < 100, `RSS ${rssMb.toFixed(1)}MB`);
}

usePaths(FIX4, FIX6, FIXP);
delete process.env.DBIP_DATASET_PATH;
delete process.env.DBIP_IPV6_DATASET_PATH;
delete process.env.DBIP_PLACES_DATASET_PATH;
ipGeo._resetForTest();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
