/**
 * Quick task 260630-hct -- ip-geo.js coarse IPv4 -> region lookup invariants.
 *
 * No framework; PASS/FAIL counter + non-zero exit on failure (matches the
 * existing server-*.test.js style). Exercises:
 *   (a) DBIP_DATASET_PATH -> committed fixture: in-range IP returns the correct
 *       {country, subdivision}; out-of-range IP returns 'unknown'.
 *   (b) DBIP_DATASET_PATH -> non-existent path: deriveRegion returns 'unknown'
 *       and does NOT throw (graceful degradation).
 *   (c) malformed / empty / unmapped IPv6 (loopback, Google DNS, CIDR keys)
 *       returns 'unknown'. Native IPv6 in the sibling fixture (2405:201::/32,
 *       2001:db8::/32) hits. IPv4-mapped IPv6 (`::ffff:a.b.c.d`) unwraps as IPv4.
 *
 * Each scenario re-requires the module via _resetForTest() so the lazy table
 * cache is rebuilt against the scenario's DBIP_DATASET_PATH.
 *
 * Run: node tests/server-ip-geo.test.js
 */

'use strict';

const path = require('path');

const FIXTURE = path.join(__dirname, '..', 'showcase', 'server', 'data', 'dbip-city-lite.fixture.csv');
delete process.env.DBIP_IPV6_DATASET_PATH;
const ipGeo = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'utils', 'ip-geo'));

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

function isUnknown(v) { return v === 'unknown'; }
function regionEq(v, country, subdivision) {
  return v && typeof v === 'object' && v.country === country && v.subdivision === subdivision;
}

console.log('--- server-ip-geo (260630-hct) ---');

// =============================================================================
// (a) Fixture-backed lookup: hits + misses.
// =============================================================================
process.env.DBIP_DATASET_PATH = FIXTURE;
ipGeo._resetForTest();

// 8.8.8.8 is inside 8.8.8.0-8.8.8.255 -> US/California.
let r = ipGeo.deriveRegion('8.8.8.8');
check('8.8.8.8 -> US/California (fixture hit)', regionEq(r, 'US', 'California'), `got ${JSON.stringify(r)}`);

// 9.9.9.100 is inside 9.9.9.0-9.9.9.255 -> US/New York.
r = ipGeo.deriveRegion('9.9.9.100');
check('9.9.9.100 -> US/New York (fixture hit)', regionEq(r, 'US', 'New York'), `got ${JSON.stringify(r)}`);

// 1.1.1.42 is inside 1.1.1.0-1.1.1.255 -> US/Texas (range with smallest start; binary-search left edge).
r = ipGeo.deriveRegion('1.1.1.42');
check('1.1.1.42 -> US/Texas (fixture hit, low range)', regionEq(r, 'US', 'Texas'), `got ${JSON.stringify(r)}`);

// 203.0.113.5 is inside the non-US range -> AU/Victoria (largest start; right edge).
r = ipGeo.deriveRegion('203.0.113.5');
check('203.0.113.5 -> AU/Victoria (fixture hit, high non-US range)', regionEq(r, 'AU', 'Victoria'), `got ${JSON.stringify(r)}`);

// Worldwide (non-US) subdivisions: these are preserved with full granularity by
// the loader (and later rendered as e.g. 'GB-England' by regionLabel). The
// dataset is worldwide; assert several continents resolve to the right
// {country, subdivision} via the typed-array struct-of-arrays path.
check('5.5.5.50 -> GB/England (worldwide fixture hit)', regionEq(ipGeo.deriveRegion('5.5.5.50'), 'GB', 'England'), `got ${JSON.stringify(ipGeo.deriveRegion('5.5.5.50'))}`);
check('10.10.10.10 -> DE/Bavaria (worldwide fixture hit)', regionEq(ipGeo.deriveRegion('10.10.10.10'), 'DE', 'Bavaria'), `got ${JSON.stringify(ipGeo.deriveRegion('10.10.10.10'))}`);
check('20.20.20.200 -> IN/Maharashtra (worldwide fixture hit)', regionEq(ipGeo.deriveRegion('20.20.20.200'), 'IN', 'Maharashtra'), `got ${JSON.stringify(ipGeo.deriveRegion('20.20.20.200'))}`);
// BR/São Paulo: the accented subdivision must round-trip byte-for-byte through
// readFileSync('utf8') -> typed-array line parse -> interned {country,subdivision}.
r = ipGeo.deriveRegion('30.30.30.30');
check('30.30.30.30 -> BR/São Paulo (multibyte subdivision round-trips)', regionEq(r, 'BR', 'São Paulo'), `got ${JSON.stringify(r)}`);

// Exact range boundaries are inclusive.
check('8.8.8.0 (range start, inclusive)', regionEq(ipGeo.deriveRegion('8.8.8.0'), 'US', 'California'), 'start boundary missed');
check('8.8.8.255 (range end, inclusive)', regionEq(ipGeo.deriveRegion('8.8.8.255'), 'US', 'California'), 'end boundary missed');

// 100.100.100.100 is outside every fixture range -> 'unknown'.
r = ipGeo.deriveRegion('100.100.100.100');
check('100.100.100.100 -> unknown (no range match)', isUnknown(r), `got ${JSON.stringify(r)}`);

// Just-below the lowest range start and just-above the highest range end -> unknown.
check('1.1.0.255 (just below lowest range) -> unknown', isUnknown(ipGeo.deriveRegion('1.1.0.255')), 'expected unknown');
check('203.0.114.0 (just above highest range) -> unknown', isUnknown(ipGeo.deriveRegion('203.0.114.0')), 'expected unknown');

// =============================================================================
// (b) Absent dataset: graceful degradation, never throws.
// =============================================================================
process.env.DBIP_DATASET_PATH = path.join(__dirname, '__no_such_dir__', 'none.csv');
ipGeo._resetForTest();
let threw = false;
let degraded;
try {
  degraded = ipGeo.deriveRegion('8.8.8.8');
} catch (e) {
  threw = true;
}
check('absent dataset: deriveRegion does NOT throw', !threw, 'unexpected throw');
check('absent dataset: 8.8.8.8 -> unknown (graceful degradation)', isUnknown(degraded), `got ${JSON.stringify(degraded)}`);
// Repeated calls stay 'unknown' (null table cached; no re-stat crash).
check('absent dataset: repeated call still unknown', isUnknown(ipGeo.deriveRegion('9.9.9.9')), 'expected unknown');

// =============================================================================
// (c) Malformed / IPv6 / empty input -> 'unknown' (with fixture present).
// =============================================================================
process.env.DBIP_DATASET_PATH = FIXTURE;
ipGeo._resetForTest();
const BAD_INPUTS = [
  ['empty string', ''],
  ['IPv6 ::1', '::1'],
  ['IPv6 full', '2001:4860:4860::8888'],
  ['IPv6 /56 rate-limit key', '2001:4860:4860::/56'],
  ['garbage', 'not-an-ip'],
  ['too few octets', '8.8.8'],
  ['too many octets', '8.8.8.8.8'],
  ['octet > 255', '8.8.8.999'],
  ['non-numeric octet', '8.8.8.x'],
  ['null', null],
  ['undefined', undefined],
  ['number', 134744072],
];
for (const [label, input] of BAD_INPUTS) {
  let v; let threw2 = false;
  try { v = ipGeo.deriveRegion(input); } catch { threw2 = true; }
  check(`malformed input (${label}) -> unknown, no throw`, !threw2 && isUnknown(v), `threw=${threw2} got=${JSON.stringify(v)}`);
}

check(
  'IPv4-mapped ::ffff:8.8.8.8 -> US/California (unwrap then fixture hit)',
  regionEq(ipGeo.deriveRegion('::ffff:8.8.8.8'), 'US', 'California'),
  `got ${JSON.stringify(ipGeo.deriveRegion('::ffff:8.8.8.8'))}`
);
check(
  'IPv4-mapped :ffff:8.8.8.8 -> US/California',
  regionEq(ipGeo.deriveRegion(':ffff:8.8.8.8'), 'US', 'California'),
  `got ${JSON.stringify(ipGeo.deriveRegion(':ffff:8.8.8.8'))}`
);

check('classifyIp 8.8.8.8 -> ipv4', ipGeo.classifyIp('8.8.8.8') === 'ipv4', ipGeo.classifyIp('8.8.8.8'));
check('classifyIp ::ffff:8.8.8.8 -> ipv4-mapped', ipGeo.classifyIp('::ffff:8.8.8.8') === 'ipv4-mapped', ipGeo.classifyIp('::ffff:8.8.8.8'));
check('classifyIp 2001:db8::1 -> ipv6', ipGeo.classifyIp('2001:db8::1') === 'ipv6', ipGeo.classifyIp('2001:db8::1'));
check('classifyIp fdaa:35:8f81::2 -> ipv6-ula', ipGeo.classifyIp('fdaa:35:8f81::2') === 'ipv6-ula', ipGeo.classifyIp('fdaa:35:8f81::2'));
check('classifyIp 2001:db8::/56 -> ipv6-cidr', ipGeo.classifyIp('2001:db8::/56') === 'ipv6-cidr', ipGeo.classifyIp('2001:db8::/56'));
check('classifyIp empty -> empty', ipGeo.classifyIp('') === 'empty', ipGeo.classifyIp(''));

check(
  'native IPv6 2405:201:e00:1::1 -> IN/Maharashtra (Jio-like fixture hit)',
  regionEq(ipGeo.deriveRegion('2405:201:e00:1::1'), 'IN', 'Maharashtra'),
  `got ${JSON.stringify(ipGeo.deriveRegion('2405:201:e00:1::1'))}`
);
check(
  'native IPv6 2405:201:: range start -> IN/Maharashtra',
  regionEq(ipGeo.deriveRegion('2405:201::'), 'IN', 'Maharashtra'),
  `got ${JSON.stringify(ipGeo.deriveRegion('2405:201::'))}`
);
check(
  'native IPv6 2001:db8::1 -> AU/Victoria (docs-prefix fixture hit)',
  regionEq(ipGeo.deriveRegion('2001:db8::1'), 'AU', 'Victoria'),
  `got ${JSON.stringify(ipGeo.deriveRegion('2001:db8::1'))}`
);
check(
  'native IPv6 2001:4860:4860::8888 -> unknown (not in fixture)',
  isUnknown(ipGeo.deriveRegion('2001:4860:4860::8888')),
  `got ${JSON.stringify(ipGeo.deriveRegion('2001:4860:4860::8888'))}`
);

const indiaPrefix = ipGeo.ipv6ToPrefix64('2405:201:e00:1::1');
check(
  'ipv6ToPrefix64 2405:201:e00:1::1 is the /64 as two uint32 words',
  !!(indiaPrefix && indiaPrefix.hi === 0x24050201 && indiaPrefix.lo === 0x0e000001),
  `got ${JSON.stringify(indiaPrefix)}`
);
check('ipv6ToPrefix64 rejects /56 CIDR key', ipGeo.ipv6ToPrefix64('2001:db8::/56') === null, 'expected null');
check('ipv6ToPrefix64 parses ::1', !!ipGeo.ipv6ToPrefix64('::1'), 'expected a prefix');
check('::1 -> unknown (loopback not in fixture)', isUnknown(ipGeo.deriveRegion('::1')), 'expected unknown');

// =============================================================================
// (e) DB-IP 'ZZ' (private/reserved) -> 'unknown'; IPv6 /64 boundaries that share
//     the high word; a retired decimal-halves IPv6 file degrades to 'unknown'.
// =============================================================================
{
  const fs = require('fs');
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-ip-geo-'));
  const v4 = path.join(dir, 'geo.csv');
  const v6 = path.join(dir, 'geo.ipv6.csv');
  fs.writeFileSync(v4, [
    '167772160,184549375,ZZ,',            // 10.0.0.0/8
    '134744064,134744319,US,California',  // 8.8.8.0/24
  ].sort((a, b) => Number(a.split(',')[0]) - Number(b.split(',')[0])).join('\n') + '\n');
  fs.writeFileSync(v6, [
    '2405020100000000,2405020100000fff,IN,Maharashtra',
    '2405020100001000,24050201ffffffff,IN,Delhi',
    'fd00000000000000,fdffffffffffffff,ZZ,',
  ].join('\n') + '\n');
  process.env.DBIP_DATASET_PATH = v4;
  process.env.DBIP_IPV6_DATASET_PATH = v6;
  ipGeo._resetForTest();

  check('10.1.2.3 (DB-IP ZZ) -> unknown', isUnknown(ipGeo.deriveRegion('10.1.2.3')), JSON.stringify(ipGeo.deriveRegion('10.1.2.3')));
  check('8.8.8.8 still resolves beside a ZZ row', regionEq(ipGeo.deriveRegion('8.8.8.8'), 'US', 'California'), JSON.stringify(ipGeo.deriveRegion('8.8.8.8')));
  check('fdaa:0:1::3 (Fly 6PN, DB-IP ZZ) -> unknown', isUnknown(ipGeo.deriveRegion('fdaa:0:1::3')), JSON.stringify(ipGeo.deriveRegion('fdaa:0:1::3')));
  check('2405:201:0:fff::1 -> last /64 of the low-word range',
    regionEq(ipGeo.deriveRegion('2405:201:0:fff::1'), 'IN', 'Maharashtra'), JSON.stringify(ipGeo.deriveRegion('2405:201:0:fff::1')));
  check('2405:201:0:1000::1 -> first /64 of the next range (low-word compare)',
    regionEq(ipGeo.deriveRegion('2405:201:0:1000::1'), 'IN', 'Delhi'), JSON.stringify(ipGeo.deriveRegion('2405:201:0:1000::1')));
  check('2405:201:ffff:ffff:ffff::1 -> upper edge of the high word',
    regionEq(ipGeo.deriveRegion('2405:201:ffff:ffff:ffff::1'), 'IN', 'Delhi'), JSON.stringify(ipGeo.deriveRegion('2405:201:ffff:ffff:ffff::1')));
  check('2405:202::1 -> just past the table -> unknown', isUnknown(ipGeo.deriveRegion('2405:202::1')), JSON.stringify(ipGeo.deriveRegion('2405:202::1')));

  fs.writeFileSync(v6, '2595482963567181824,0,2595482967862149119,18446744073709551615,IN,Maharashtra\n');
  ipGeo._resetForTest();
  let threw = false;
  let legacy;
  try { legacy = ipGeo.deriveRegion('2405:201:e00:1::1'); } catch { threw = true; }
  check('retired decimal-halves IPv6 file -> unknown, no throw', !threw && isUnknown(legacy), `threw=${threw} got ${JSON.stringify(legacy)}`);

  delete process.env.DBIP_IPV6_DATASET_PATH;
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n=== server-ip-geo results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
