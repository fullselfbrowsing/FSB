/**
 * Quick task 260630-hct (worldwide) -- refresh-dbip-dataset.mjs range-merge check.
 *
 * Runs the real transform script (via child_process) against a synthetic
 * upstream-DB-IP-shape CSV and asserts the merge pass:
 *   - consecutive rows with the SAME (country, subdivision) and contiguous IPv4
 *     ranges collapse into ONE row spanning the full range;
 *   - a row with a DIFFERENT label stays separate;
 *   - a same-label row separated by a GAP stays separate;
 *   - IPv6 upstream rows are skipped (IPv4-only output).
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

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

const inPath = path.join(os.tmpdir(), `fsb-dbip-merge-in-${process.pid}.csv`);
const outPath = path.join(os.tmpdir(), `fsb-dbip-merge-out-${process.pid}.csv`);

// Upstream DB-IP IP-to-City Lite shape: ip_start,ip_end,continent,country,stateprov,city,lat,lon
const upstream = [
  '1.0.0.0,1.0.0.255,EU,DE,Bavaria,Munich,48.1,11.5',       // \
  '1.0.1.0,1.0.1.255,EU,DE,Bavaria,Nuremberg,49.4,11.0',    //  >- adjacent same label -> merge into one
  '1.0.2.0,1.0.2.255,EU,DE,Bavaria,Augsburg,48.3,10.8',     // /
  '1.0.3.0,1.0.3.255,EU,FR,Île-de-France,Paris,48.8,2.3',   // different label -> separate
  '2001:db8::,2001:db8::1,AS,JP,Tokyo,Tokyo,35.6,139.6',    // IPv6 -> skipped entirely
  '2.0.0.0,2.0.0.255,EU,DE,Bavaria,Regensburg,49.0,12.1',   // same label but GAP -> separate
];

console.log('--- server-ip-geo-merge (260630-hct) ---');

try {
  fs.writeFileSync(inPath, upstream.join('\n') + '\n');

  // Run the real transform script. Throws (failing the test) on non-zero exit.
  execFileSync(process.execPath, [SCRIPT, '--in', inPath, '--out', outPath], { stdio: 'pipe' });

  const text = fs.readFileSync(outPath, 'utf8');
  const dataLines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));

  // 1.0.0.0=16777216, 1.0.2.255=16777983, 1.0.3.0=16777984, 1.0.3.255=16778239,
  // 2.0.0.0=33554432, 2.0.0.255=33554687.
  const MERGED_DE = '16777216,16777983,DE,Bavaria';        // three adjacent rows collapsed
  const FR_ROW = '16777984,16778239,FR,Île-de-France';     // different label stays separate
  const GAP_DE = '33554432,33554687,DE,Bavaria';           // same label, gap -> separate

  check('exactly 3 merged data rows', dataLines.length === 3, `got ${dataLines.length}: ${JSON.stringify(dataLines)}`);
  check('adjacent same-label DE/Bavaria collapsed to one span', dataLines.includes(MERGED_DE), `got ${JSON.stringify(dataLines)}`);
  check('different label (FR/Île-de-France) stayed separate', dataLines.includes(FR_ROW), `got ${JSON.stringify(dataLines)}`);
  check('gapped same-label DE/Bavaria stayed separate', dataLines.includes(GAP_DE), `got ${JSON.stringify(dataLines)}`);
  check('IPv6 upstream row skipped (no Tokyo / JP in output)', !text.includes('Tokyo') && !/,JP,/.test(text), 'IPv6 row leaked into output');
  check('output is sorted ascending by start', (() => {
    const starts = dataLines.map((l) => Number(l.split(',')[0]));
    for (let i = 1; i < starts.length; i++) if (starts[i] < starts[i - 1]) return false;
    return true;
  })(), `starts not ascending: ${JSON.stringify(dataLines)}`);
} finally {
  try { fs.unlinkSync(inPath); } catch { /* best effort */ }
  try { fs.unlinkSync(outPath); } catch { /* best effort */ }
}

console.log(`\n=== server-ip-geo-merge results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
