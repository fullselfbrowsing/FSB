/**
 * Quick task 260630-hct -- ip-geo.js coarse IPv4 -> region lookup invariants.
 *
 * No framework; PASS/FAIL counter + non-zero exit on failure (matches the
 * existing server-*.test.js style). Exercises:
 *   (a) DBIP_DATASET_PATH -> committed fixture: in-range IP returns the correct
 *       {country, subdivision}; out-of-range IP returns 'unknown'.
 *   (b) DBIP_DATASET_PATH -> non-existent path: deriveRegion returns 'unknown'
 *       and does NOT throw (graceful degradation).
 *   (c) malformed / IPv6 / empty input returns 'unknown'.
 *
 * Each scenario re-requires the module via _resetForTest() so the lazy table
 * cache is rebuilt against the scenario's DBIP_DATASET_PATH.
 *
 * Run: node tests/server-ip-geo.test.js
 */

'use strict';

const path = require('path');

const FIXTURE = path.join(__dirname, '..', 'showcase', 'server', 'data', 'dbip-city-lite.fixture.csv');
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
  ['IPv4-mapped-IPv6', '::ffff:8.8.8.8'],
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

console.log(`\n=== server-ip-geo results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
