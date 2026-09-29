/**
 * Quick task 260630-hct (worldwide) -- refresh-dbip-dataset.mjs range-merge check.
 *
 * Runs the real transform script (via child_process) against a synthetic
 * upstream-DB-IP-shape CSV and asserts the merge pass:
 *   - consecutive rows with the SAME (country, subdivision, city) and contiguous
 *     IPv4 ranges collapse into ONE row spanning the full range;
 *   - a row with a DIFFERENT label (another city in the same state) stays separate;
 *   - a same-label row separated by a GAP stays separate;
 *   - IPv6 upstream rows are written to the sibling *.ipv6.csv, not the IPv4 file;
 *     adjacent same-label IPv6 ranges merge; IPv6 is keyed on /64 prefixes, so a
 *     later different-label slice of an already-claimed /64 is dropped.
 *   - DB-IP 'ZZ' (private/reserved) rows are dropped from both outputs.
 *   - the places file carries one centroid per country, subdivision, and city
 *     label, sorted by label, averaged on the sphere (Fiji straddles 180°).
 *
 * No framework; PASS/FAIL counter + non-zero exit on failure.
 * Run: node tests/server-ip-geo-merge.test.js
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'showcase', 'server', 'scripts', 'refresh-dbip-dataset.mjs');
delete process.env.DBIP_IPV6_DATASET_PATH;

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

const inPath = path.join(os.tmpdir(), `fsb-dbip-merge-in-${process.pid}.csv`);
const outPath = path.join(os.tmpdir(), `fsb-dbip-merge-out-${process.pid}.csv`);
const ipv6OutPath = outPath.slice(0, -4) + '.ipv6.csv';
const placesOutPath = outPath.slice(0, -4) + '.places.csv';

// Upstream DB-IP IP-to-City Lite shape: ip_start,ip_end,continent,country,stateprov,city,lat,lon
const upstream = [
  '1.0.0.0,1.0.0.255,EU,DE,Bavaria,Munich,48.1,11.5',        // \
  '1.0.1.0,1.0.1.255,EU,DE,Bavaria,Munich,48.2,11.6',        //  >- adjacent same place -> merge into one
  '1.0.2.0,1.0.2.255,EU,DE,Bavaria,Munich,48.1,11.6',        // /
  '1.0.3.0,1.0.3.255,EU,DE,Bavaria,Nuremberg,49.4,11.0',     // adjacent, different city -> separate
  '1.0.4.0,1.0.4.255,EU,FR,Île-de-France,Paris,48.8,2.3',    // different country -> separate
  '2001:db8::,2001:db8::1,AS,JP,Tokyo,Tokyo,35.6,139.6',      // \
  '2001:db8::2,2001:db8::3,AS,JP,Tokyo,Tokyo,35.7,139.7',     //  >- adjacent same IPv6 place -> merge
  '2001:db8::4,2001:db8::5,AS,KR,Seoul,Seoul,37.5,127.0',     // same /64, different label -> dropped (first label wins)
  '2001:db8:1::,2001:db8:1::1,AS,JP,Osaka,Osaka,34.6,135.5',  // different IPv6 subdivision
  '10.0.0.0,10.255.255.255,ZZ,ZZ,,,0,0',                      // DB-IP private/reserved -> dropped
  'fd00::,fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff,ZZ,ZZ,,,0,0', // IPv6 ULA reserved -> dropped
  '2.0.0.0,2.0.0.255,EU,DE,Bavaria,Munich,48.1,11.5',        // same place but GAP -> separate
  '3.0.0.0,3.0.0.255,NA,US,California,"San Jose, Downtown",37.3,-121.9', // quoted comma in a city
  '4.0.0.0,4.0.0.255,OC,FJ,Western,Lautoka,-17.6,177.4',     // \
  '4.0.1.0,4.0.1.255,OC,FJ,Eastern,Lakeba,-18.2,-178.8',     //  >- Fiji spans the antimeridian
];

console.log('--- server-ip-geo-merge (260630-hct) ---');

try {
  fs.writeFileSync(inPath, upstream.join('\n') + '\n');

  // Run the real transform script. Throws (failing the test) on non-zero exit.
  execFileSync(process.execPath, [SCRIPT, '--in', inPath, '--out', outPath], { stdio: 'pipe' });

  const text = fs.readFileSync(outPath, 'utf8');
  const dataLines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));

  // 1.0.0.0=16777216, 1.0.2.255=16777983, 1.0.3.0=16777984, 1.0.3.255=16778239,
  // 1.0.4.0=16778240, 1.0.4.255=16778495, 2.0.0.0=33554432, 2.0.0.255=33554687,
  // 3.0.0.0=50331648, 3.0.0.255=50331903.
  const MERGED_MUNICH = '16777216,16777983,DE,Bavaria,Munich';     // three adjacent rows collapsed
  const NUREMBERG = '16777984,16778239,DE,Bavaria,Nuremberg';       // other city, same state: separate
  const FR_ROW = '16778240,16778495,FR,Île-de-France,Paris';        // different label stays separate
  const GAP_MUNICH = '33554432,33554687,DE,Bavaria,Munich';        // same label, gap -> separate
  const SAN_JOSE = '50331648,50331903,US,California,San Jose Downtown'; // comma stripped, not a column

  check('exactly 7 merged data rows', dataLines.length === 7, `got ${dataLines.length}: ${JSON.stringify(dataLines)}`);
  check('adjacent same-place DE/Bavaria/Munich collapsed to one span', dataLines.includes(MERGED_MUNICH), `got ${JSON.stringify(dataLines)}`);
  check('adjacent other city (Nuremberg) stayed separate', dataLines.includes(NUREMBERG), `got ${JSON.stringify(dataLines)}`);
  check('different label (FR/Île-de-France/Paris) stayed separate', dataLines.includes(FR_ROW), `got ${JSON.stringify(dataLines)}`);
  check('gapped same-place Munich stayed separate', dataLines.includes(GAP_MUNICH), `got ${JSON.stringify(dataLines)}`);
  check('a comma inside a quoted city never becomes a column', dataLines.includes(SAN_JOSE), `got ${JSON.stringify(dataLines)}`);
  check('every row has exactly five columns', dataLines.every((l) => l.split(',').length === 5), `got ${JSON.stringify(dataLines)}`);
  check('IPv6 upstream row not in IPv4 file', !text.includes('Tokyo') && !/,JP,/.test(text), 'IPv6 row leaked into IPv4 output');
  check('output is sorted ascending by start', (() => {
    const starts = dataLines.map((l) => Number(l.split(',')[0]));
    for (let i = 1; i < starts.length; i++) if (starts[i] < starts[i - 1]) return false;
    return true;
  })(), `starts not ascending: ${JSON.stringify(dataLines)}`);

  const v6text = fs.readFileSync(ipv6OutPath, 'utf8');
  const v6lines = v6text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  const MERGED_JP = '20010db800000000,20010db800000000,JP,Tokyo,Tokyo';
  const OSAKA = '20010db800010000,20010db800010000,JP,Osaka,Osaka';
  check('exactly 2 merged IPv6 data rows', v6lines.length === 2, `got ${v6lines.length}: ${JSON.stringify(v6lines)}`);
  check('adjacent same-label JP/Tokyo IPv6 collapsed', v6lines.includes(MERGED_JP), `got ${JSON.stringify(v6lines)}`);
  check('different IPv6 subdivision JP/Osaka stayed separate', v6lines.includes(OSAKA), `got ${JSON.stringify(v6lines)}`);
  check('later different-label slice of a claimed /64 dropped', !v6text.includes('Seoul'), `got ${JSON.stringify(v6lines)}`);
  check('DB-IP ZZ rows dropped from both outputs', !/,ZZ,/.test(text) && !/,ZZ,/.test(v6text), 'ZZ row written');

  const placeLines = fs.readFileSync(placesOutPath, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  const places = new Map(placeLines.map((l) => {
    const [label, lat, lon] = l.split(',');
    return [label, { lat: Number(lat), lon: Number(lon) }];
  }));
  const labels = placeLines.map((l) => l.split(',')[0]);
  const near = (p, lat, lon) => !!p && Math.abs(p.lat - lat) <= 0.15 && Math.abs(p.lon - lon) <= 0.15;
  check('places sorted by label in JS string order',
    labels.every((l, i) => i === 0 || labels[i - 1] < l), `got ${JSON.stringify(labels)}`);
  check('places has every level for Munich',
    ['DE', 'DE-Bavaria', 'DE-Bavaria/Munich', 'DE-Bavaria/Nuremberg'].every((l) => places.has(l)), `got ${JSON.stringify(labels)}`);
  check('US labels use the state code and the cleaned city',
    places.has('US-CA') && places.has('US-CA/San Jose Downtown'), `got ${JSON.stringify(labels)}`);
  check('Munich centroid is the mean of its four ranges', near(places.get('DE-Bavaria/Munich'), 48.1, 11.55), JSON.stringify(places.get('DE-Bavaria/Munich')));
  check('IPv6 rows feed the places file too', near(places.get('JP-Tokyo/Tokyo'), 35.65, 139.65), JSON.stringify(places.get('JP-Tokyo/Tokyo')));
  const fiji = places.get('FJ');
  check('Fiji averages across 180°, not to the prime-meridian side',
    !!fiji && Math.abs(fiji.lon) > 170 && fiji.lat < -17 && fiji.lat > -18.5, JSON.stringify(fiji));
  check('no ZZ or unknown place', !places.has('ZZ') && !places.has('unknown') && !labels.some((l) => l.startsWith('ZZ')), `got ${JSON.stringify(labels)}`);
  check('coordinates are rounded to 0.1 degree',
    placeLines.every((l) => l.split(',').slice(1).every((n) => /^-?\d+(\.\d)?$/.test(n))), `got ${JSON.stringify(placeLines)}`);
} finally {
  try { fs.unlinkSync(inPath); } catch { /* best effort */ }
  try { fs.unlinkSync(outPath); } catch { /* best effort */ }
  try { fs.unlinkSync(ipv6OutPath); } catch { /* best effort */ }
  try { fs.unlinkSync(placesOutPath); } catch { /* best effort */ }
}

console.log(`\n=== server-ip-geo-merge results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
