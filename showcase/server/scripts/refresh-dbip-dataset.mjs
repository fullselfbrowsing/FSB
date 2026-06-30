#!/usr/bin/env node
/**
 * Quick task 260630-hct -- DB-IP IP-to-City Lite dataset refresh / generation.
 *
 * ============================================================================
 *  IP Geolocation by DB-IP (https://db-ip.com), CC-BY-4.0.
 * ============================================================================
 * This script transforms the upstream DB-IP IP-to-City Lite CSV into the
 * compact range table that showcase/server/src/utils/ip-geo.js reads:
 *
 *     start_ip_int,end_ip_int,country,subdivision
 *
 * (inclusive uint32 IPv4 bounds, sorted ascending by start_ip_int). The output
 * is written to the production dataset path consumed by ip-geo.js
 * (process.env.DBIP_DATASET_PATH || showcase/server/data/dbip-city-lite.csv).
 *
 * The real artifact is ~100MB and is NOT committed (see data/README.md +
 * .gitignore -- the data/dbip-city-lite.* glob is ignored EXCEPT *.fixture.csv).
 * Production data is generated here (or at Docker build) and dropped in.
 *
 * Usage:
 *   1. Download the free monthly "IP to City Lite" CSV from DB-IP:
 *        https://db-ip.com/db/download/ip-to-city-lite
 *      (it ships gzip'd as e.g. dbip-city-lite-YYYY-MM.csv.gz; gunzip it first).
 *      The upstream row shape is:
 *        ip_start,ip_end,continent,country,stateprov,...,city,latitude,longitude
 *      where ip_start/ip_end are dotted-quad (IPv4) or colon-hex (IPv6) strings.
 *
 *   2. Run:
 *        node showcase/server/scripts/refresh-dbip-dataset.mjs --in <downloaded.csv>
 *      optionally with --out <path> (defaults to DBIP_DATASET_PATH or the
 *      production path under showcase/server/data/).
 *
 * Only IPv4 rows are emitted (ip-geo.js is coarse IPv4-only; IPv6 -> 'unknown').
 * If --in is omitted the script prints the download URL + this format spec and
 * exits non-zero, so it is self-documenting but still runnable against a real
 * downloaded source CSV.
 *
 * Run: node showcase/server/scripts/refresh-dbip-dataset.mjs --in dbip-city-lite.csv
 */

'use strict';

import { createReadStream, mkdirSync, createWriteStream, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default production artifact path (mirrors ip-geo.js DEFAULT_DATASET_PATH).
const DEFAULT_OUT = join(__dirname, '..', 'data', 'dbip-city-lite.csv');

const DOWNLOAD_URL = 'https://db-ip.com/db/download/ip-to-city-lite';
const ATTRIBUTION = 'IP Geolocation by DB-IP (https://db-ip.com), CC-BY-4.0';

function parseArgs(argv) {
  const args = { in: null, out: process.env.DBIP_DATASET_PATH || DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--in') args.in = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

/** Dotted-quad IPv4 -> uint32, or null if not a well-formed IPv4 string. */
function ipv4ToInt(ip) {
  if (typeof ip !== 'string') return null;
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const octet of parts) {
    if (!/^\d{1,3}$/.test(octet)) return null;
    const n = Number(octet);
    if (n > 255) return null;
    acc = acc * 256 + n;
  }
  return acc >>> 0;
}

/**
 * Split one upstream CSV line on commas, honouring simple double-quoted fields
 * (DB-IP quotes city/stateprov values that may contain commas). Good enough for
 * the IP-to-City Lite shape; not a full RFC-4180 parser.
 */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; }
      } else { cur += c; }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function printSpecAndExit() {
  console.error('refresh-dbip-dataset: no --in <source.csv> provided.');
  console.error('');
  console.error(`  ${ATTRIBUTION}`);
  console.error('');
  console.error('  1. Download the free "IP to City Lite" CSV from DB-IP:');
  console.error(`       ${DOWNLOAD_URL}`);
  console.error('     (gunzip the .csv.gz first).');
  console.error('  2. Re-run with: --in <downloaded.csv> [--out <path>]');
  console.error('');
  console.error('  Output format (consumed by src/utils/ip-geo.js):');
  console.error('     start_ip_int,end_ip_int,country,subdivision');
  console.error('     (inclusive uint32 IPv4 bounds, sorted ascending; IPv4 rows only)');
  process.exit(2);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.in) printSpecAndExit();
  const inPath = resolve(args.in);
  if (!existsSync(inPath)) {
    console.error(`refresh-dbip-dataset: source CSV not found: ${inPath}`);
    printSpecAndExit();
  }

  const outPath = resolve(args.out);
  mkdirSync(dirname(outPath), { recursive: true });

  // Stream-transform: read upstream rows, emit IPv4 range rows. We collect into
  // memory to sort by start_ip_int before writing (ip-geo.js binary-searches a
  // sorted table). The IP-to-City Lite CSV is large but fits comfortably.
  const rows = [];
  const rl = createInterface({ input: createReadStream(inPath, 'utf8'), crlfDelay: Infinity });

  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    if (line.trim() === '') continue;
    const cols = splitCsvLine(line);
    // Expected upstream order: ip_start, ip_end, continent, country, stateprov, ...
    if (cols.length < 5) continue;
    const startInt = ipv4ToInt(cols[0]);
    const endInt = ipv4ToInt(cols[1]);
    if (startInt === null || endInt === null) continue; // skip IPv6 / malformed
    if (endInt < startInt) continue;
    const country = (cols[3] || '').trim();
    const subdivision = (cols[4] || '').trim();
    if (country === '') continue;
    // Strip commas from labels defensively so the compact 4-field format stays parseable.
    rows.push([startInt, endInt, country.replace(/,/g, ' '), subdivision.replace(/,/g, ' ')]);
  }

  rows.sort((a, b) => a[0] - b[0]);

  const ws = createWriteStream(outPath, 'utf8');
  ws.write(`# Generated by refresh-dbip-dataset.mjs from a DB-IP IP-to-City Lite source CSV.\n`);
  ws.write(`# ${ATTRIBUTION}\n`);
  ws.write(`# Format: start_ip_int,end_ip_int,country,subdivision (uint32 IPv4, sorted ascending).\n`);
  for (const r of rows) {
    ws.write(`${r[0]},${r[1]},${r[2]},${r[3]}\n`);
  }
  await new Promise((res, rej) => { ws.end((err) => (err ? rej(err) : res())); });

  console.log(`refresh-dbip-dataset: wrote ${rows.length} IPv4 ranges to ${outPath}`);
  console.log(`  Source lines read: ${lineNo}`);
  console.log(`  ${ATTRIBUTION}`);
}

main().catch((err) => {
  console.error('refresh-dbip-dataset: failed:', err && err.message ? err.message : err);
  process.exit(1);
});
