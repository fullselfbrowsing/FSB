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
 *     start_ip_int,end_ip_int,country,subdivision          (IPv4)
 *     start64,end64,country,subdivision                    (IPv6 /64 prefixes, 16 hex digits)
 *
 * (inclusive bounds, each file sorted ascending). The IPv4 output is written to
 * the production dataset path consumed by ip-geo.js
 * (process.env.DBIP_DATASET_PATH || showcase/server/data/dbip-city-lite.csv).
 * IPv6 goes to --ipv6-out or a sibling `*.ipv6.csv` (DBIP_IPV6_DATASET_PATH).
 *
 * The real artifacts are tens of MB and are NOT committed (see data/README.md +
 * .gitignore -- the data/dbip-city-lite.* glob is ignored EXCEPT *.fixture.csv).
 * Production data is generated here (off the 256 MB Fly VM) and dropped in.
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
 *      optionally with --out <path> and --ipv6-out <path>.
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
const DEFAULT_IPV6_OUT = join(__dirname, '..', 'data', 'dbip-city-lite.ipv6.csv');

const DOWNLOAD_URL = 'https://db-ip.com/db/download/ip-to-city-lite';
const ATTRIBUTION = 'IP Geolocation by DB-IP (https://db-ip.com), CC-BY-4.0';

function siblingIpv6Path(ipv4Path) {
  if (typeof ipv4Path !== 'string' || ipv4Path === '') return DEFAULT_IPV6_OUT;
  if (ipv4Path.endsWith('.fixture.csv')) {
    return ipv4Path.replace(/\.fixture\.csv$/, '.ipv6.fixture.csv');
  }
  if (ipv4Path.endsWith('.csv')) return ipv4Path.slice(0, -4) + '.ipv6.csv';
  return ipv4Path + '.ipv6';
}

function parseArgs(argv) {
  const args = {
    in: null,
    out: process.env.DBIP_DATASET_PATH || DEFAULT_OUT,
    ipv6Out: process.env.DBIP_IPV6_DATASET_PATH || null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--in') args.in = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--ipv6-out') args.ipv6Out = argv[++i];
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
 * Native IPv6 -> its top 64 bits (the /64 prefix) as a BigInt, or null. Same
 * parse rules as ip-geo.js (reject CIDR, zone IDs, dotted mixed form).
 *
 * @param {unknown} ip
 * @returns {bigint|null}
 */
function ipv6ToPrefix64(ip) {
  if (typeof ip !== 'string') return null;
  const s = ip.trim().toLowerCase();
  if (s === '' || s.includes('/') || s.includes('%') || s.includes('.')) return null;
  if (!s.includes(':')) return null;

  const sides = s.split('::');
  if (sides.length > 2) return null;

  const parseSide = (side) => {
    if (side === '') return [];
    const parts = side.split(':');
    const out = [];
    for (const p of parts) {
      if (!/^[0-9a-f]{1,4}$/.test(p)) return null;
      out.push(parseInt(p, 16));
    }
    return out;
  };

  let groups;
  if (sides.length === 1) {
    groups = parseSide(sides[0]);
    if (!groups || groups.length !== 8) return null;
  } else {
    const head = parseSide(sides[0]);
    const tail = parseSide(sides[1]);
    if (!head || !tail) return null;
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = head.concat(new Array(missing).fill(0), tail);
  }

  let prefix = 0n;
  for (let i = 0; i < 4; i++) prefix = (prefix << 16n) + BigInt(groups[i]);
  return prefix;
}

const hex64 = (n) => n.toString(16).padStart(16, '0');

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
  console.error('  2. Re-run with: --in <downloaded.csv> [--out <path>] [--ipv6-out <path>]');
  console.error('');
  console.error('  IPv4 output (consumed by src/utils/ip-geo.js):');
  console.error('     start_ip_int,end_ip_int,country,subdivision');
  console.error('     (inclusive uint32 IPv4 bounds, sorted ascending)');
  console.error('  IPv6 output (sibling *.ipv6.csv unless --ipv6-out / DBIP_IPV6_DATASET_PATH):');
  console.error('     start64,end64,country,subdivision');
  console.error('     (inclusive /64 prefixes as 16 hex digits, sorted ascending)');
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
  const ipv6OutPath = resolve(args.ipv6Out || siblingIpv6Path(outPath));
  mkdirSync(dirname(outPath), { recursive: true });
  mkdirSync(dirname(ipv6OutPath), { recursive: true });

  // Stream-transform: read upstream rows, emit IPv4 and IPv6 range rows. We
  // collect into memory to sort before writing (ip-geo.js binary-searches a
  // sorted table). Run this OFF the 256 MB Fly VM -- the source CSV is ~685 MB.
  const rows = [];
  const v6rows = [];
  const rl = createInterface({ input: createReadStream(inPath, 'utf8'), crlfDelay: Infinity });

  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    if (line.trim() === '') continue;
    const cols = splitCsvLine(line);
    // Expected upstream order: ip_start, ip_end, continent, country, stateprov, ...
    if (cols.length < 5) continue;
    const country = (cols[3] || '').trim();
    const subdivision = (cols[4] || '').trim();
    // DB-IP's ZZ marks private/reserved space; it is not a place.
    if (country === '' || country === 'ZZ') continue;
    const countrySafe = country.replace(/,/g, ' ');
    const subSafe = subdivision.replace(/,/g, ' ');

    const startInt = ipv4ToInt(cols[0]);
    const endInt = ipv4ToInt(cols[1]);
    if (startInt !== null && endInt !== null) {
      if (endInt < startInt) continue;
      rows.push([startInt, endInt, countrySafe, subSafe]);
      continue;
    }

    const startV6 = ipv6ToPrefix64(cols[0]);
    const endV6 = ipv6ToPrefix64(cols[1]);
    if (startV6 === null || endV6 === null || endV6 < startV6) continue;
    v6rows.push([startV6, endV6, countrySafe, subSafe]);
  }

  rows.sort((a, b) => a[0] - b[0]);
  // Stable sort: rows sharing a /64 keep upstream (ascending address) order.
  v6rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  // Range-merge: collapse CONSECUTIVE rows that share country+subdivision AND
  // whose ranges are contiguous or overlapping (nextStart <= lastEnd + 1) into a
  // single range. The IP-to-City Lite source splits ranges by *city*; collapsing
  // to (country, subdivision) removes a large fraction of rows, which keeps the
  // compact output small enough to (a) stay well under V8's ~512 MiB string cap
  // when ip-geo.js reads it and (b) fit the 256 MB Fly VM after parsing. Merge
  // only inspects the immediate predecessor, so the prior sort is required.
  const merged = [];
  for (const r of rows) {
    const last = merged.length > 0 ? merged[merged.length - 1] : null;
    if (last && last[2] === r[2] && last[3] === r[3] && r[0] <= last[1] + 1) {
      if (r[1] > last[1]) last[1] = r[1];
    } else {
      merged.push([r[0], r[1], r[2], r[3]]);
    }
  }

  // IPv6 is keyed on /64 prefixes, so the few upstream ranges narrower than a
  // /64 collapse onto the same key. The first (lowest-address) label claims the
  // prefix; later overlapping rows are trimmed past it or dropped. Then adjacent
  // same-label prefixes merge exactly like IPv4.
  const mergedV6 = [];
  for (const row of v6rows) {
    const r = [row[0], row[1], row[2], row[3]];
    const last = mergedV6.length > 0 ? mergedV6[mergedV6.length - 1] : null;
    if (last && r[0] <= last[1]) {
      if (r[1] <= last[1]) continue;
      r[0] = last[1] + 1n;
    }
    if (last && last[2] === r[2] && last[3] === r[3] && r[0] <= last[1] + 1n) {
      last[1] = r[1];
      continue;
    }
    mergedV6.push(r);
  }

  const ws = createWriteStream(outPath, 'utf8');
  ws.write(`# Generated by refresh-dbip-dataset.mjs from a DB-IP IP-to-City Lite source CSV.\n`);
  ws.write(`# ${ATTRIBUTION}\n`);
  ws.write(`# Format: start_ip_int,end_ip_int,country,subdivision (uint32 IPv4, sorted ascending; adjacent same-region ranges merged).\n`);
  for (const r of merged) {
    ws.write(`${r[0]},${r[1]},${r[2]},${r[3]}\n`);
  }
  await new Promise((res, rej) => { ws.end((err) => (err ? rej(err) : res())); });

  const ws6 = createWriteStream(ipv6OutPath, 'utf8');
  ws6.write(`# Generated by refresh-dbip-dataset.mjs from a DB-IP IP-to-City Lite source CSV.\n`);
  ws6.write(`# ${ATTRIBUTION}\n`);
  ws6.write(`# Format: start64,end64,country,subdivision (inclusive IPv6 /64 prefixes as 16 hex digits, sorted ascending; adjacent same-region ranges merged).\n`);
  for (const r of mergedV6) {
    ws6.write(`${hex64(r[0])},${hex64(r[1])},${r[2]},${r[3]}\n`);
  }
  await new Promise((res, rej) => { ws6.end((err) => (err ? rej(err) : res())); });

  const reduction = rows.length > 0 ? Math.round((1 - merged.length / rows.length) * 100) : 0;
  const reduction6 = v6rows.length > 0 ? Math.round((1 - mergedV6.length / v6rows.length) * 100) : 0;
  console.log(`refresh-dbip-dataset: wrote ${merged.length} IPv4 ranges to ${outPath}`);
  console.log(`  Merged from ${rows.length} raw IPv4 ranges (${reduction}% reduction).`);
  console.log(`refresh-dbip-dataset: wrote ${mergedV6.length} IPv6 ranges to ${ipv6OutPath}`);
  console.log(`  Merged from ${v6rows.length} raw IPv6 ranges (${reduction6}% reduction).`);
  console.log(`  Source lines read: ${lineNo}`);
  console.log(`  ${ATTRIBUTION}`);
}

main().catch((err) => {
  console.error('refresh-dbip-dataset: failed:', err && err.message ? err.message : err);
  process.exit(1);
});
