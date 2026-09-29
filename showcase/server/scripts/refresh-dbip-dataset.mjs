#!/usr/bin/env node
/**
 * Quick task 260630-hct -- DB-IP IP-to-City Lite dataset refresh / generation.
 *
 * ============================================================================
 *  IP Geolocation by DB-IP (https://db-ip.com), CC-BY-4.0.
 * ============================================================================
 * This script transforms the upstream DB-IP IP-to-City Lite CSV into the
 * compact sorted tables that showcase/server/src/utils/ip-geo.js searches:
 *
 *     start_ip_int,end_ip_int,country,subdivision,city     (IPv4)
 *     start64,end64,country,subdivision,city               (IPv6 /64 prefixes, 16 hex digits)
 *     label,lat,lon                                        (places, sorted by label)
 *
 * Range bounds are inclusive and each file is sorted ascending. The IPv4 output
 * is written to the production dataset path consumed by ip-geo.js
 * (process.env.DBIP_DATASET_PATH || showcase/server/data/dbip-city-lite.csv).
 * IPv6 goes to --ipv6-out or a sibling `*.ipv6.csv` (DBIP_IPV6_DATASET_PATH),
 * places to --places-out or a sibling `*.places.csv` (DBIP_PLACES_DATASET_PATH).
 *
 * The places file holds one approximate centroid per region label at every
 * level (country 'US', subdivision 'US-CA', city 'US-CA/San Jose'), labelled by
 * the same regionLabel() the ingest route stores. Each centroid is the mean
 * position of that place's upstream ranges, rounded to 0.1 degree.
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
 *      optionally with --out <path>, --ipv6-out <path> and --places-out <path>.
 *
 * Run: node showcase/server/scripts/refresh-dbip-dataset.mjs --in dbip-city-lite.csv
 */

'use strict';

import { createReadStream, mkdirSync, createWriteStream, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const { regionLabel } = require('../src/utils/region-label.js');

// Default production artifact path (mirrors ip-geo.js DEFAULT_DATASET_PATH).
const DEFAULT_OUT = join(__dirname, '..', 'data', 'dbip-city-lite.csv');
const DEFAULT_IPV6_OUT = join(__dirname, '..', 'data', 'dbip-city-lite.ipv6.csv');
const DEFAULT_PLACES_OUT = join(__dirname, '..', 'data', 'dbip-city-lite.places.csv');

const DOWNLOAD_URL = 'https://db-ip.com/db/download/ip-to-city-lite';
const ATTRIBUTION = 'IP Geolocation by DB-IP (https://db-ip.com), CC-BY-4.0';

/** Sibling artifact for an IPv4 output path (mirrors ip-geo.js siblingPath). */
function siblingPath(ipv4Path, kind, fallback) {
  if (typeof ipv4Path !== 'string' || ipv4Path === '') return fallback;
  if (ipv4Path.endsWith('.fixture.csv')) {
    return ipv4Path.replace(/\.fixture\.csv$/, `.${kind}.fixture.csv`);
  }
  if (ipv4Path.endsWith('.csv')) return ipv4Path.slice(0, -4) + `.${kind}.csv`;
  return `${ipv4Path}.${kind}`;
}

function parseArgs(argv) {
  const args = {
    in: null,
    out: process.env.DBIP_DATASET_PATH || DEFAULT_OUT,
    ipv6Out: process.env.DBIP_IPV6_DATASET_PATH || null,
    placesOut: process.env.DBIP_PLACES_DATASET_PATH || null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--in') args.in = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--ipv6-out') args.ipv6Out = argv[++i];
    else if (argv[i] === '--places-out') args.placesOut = argv[++i];
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

function sameLabel(a, b) {
  return a[2] === b[2] && a[3] === b[3] && a[4] === b[4];
}

/** Add one upstream row's position to the country, subdivision and city labels. */
function addPlace(placeSums, country, subdivision, city, lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  const x = Math.cos(phi) * Math.cos(lambda);
  const y = Math.cos(phi) * Math.sin(lambda);
  const z = Math.sin(phi);
  const labels = new Set([
    regionLabel({ country }),
    regionLabel({ country, subdivision }),
    regionLabel({ country, subdivision, city }),
  ]);
  for (const label of labels) {
    if (label === 'unknown') continue;
    const sum = placeSums.get(label);
    if (sum) { sum[0] += x; sum[1] += y; sum[2] += z; } else placeSums.set(label, [x, y, z]);
  }
}

function centroidOf([x, y, z]) {
  const round = (deg) => Math.round(deg * 10) / 10;
  const lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
  const lon = (Math.atan2(y, x) * 180) / Math.PI;
  // -0 would print as 0 anyway; normalise so the file never carries '-0'.
  return [round(lat) || 0, round(lon) || 0];
}

function printSpecAndExit() {
  console.error('refresh-dbip-dataset: no --in <source.csv> provided.');
  console.error('');
  console.error(`  ${ATTRIBUTION}`);
  console.error('');
  console.error('  1. Download the free "IP to City Lite" CSV from DB-IP:');
  console.error(`       ${DOWNLOAD_URL}`);
  console.error('     (gunzip the .csv.gz first).');
  console.error('  2. Re-run with: --in <downloaded.csv> [--out <path>] [--ipv6-out <path>] [--places-out <path>]');
  console.error('');
  console.error('  IPv4 output (consumed by src/utils/ip-geo.js):');
  console.error('     start_ip_int,end_ip_int,country,subdivision,city');
  console.error('     (inclusive uint32 IPv4 bounds, sorted ascending)');
  console.error('  IPv6 output (sibling *.ipv6.csv unless --ipv6-out / DBIP_IPV6_DATASET_PATH):');
  console.error('     start64,end64,country,subdivision,city');
  console.error('     (inclusive /64 prefixes as 16 hex digits, sorted ascending)');
  console.error('  Places output (sibling *.places.csv unless --places-out / DBIP_PLACES_DATASET_PATH):');
  console.error('     label,lat,lon');
  console.error('     (one approximate centroid per region label, sorted by label)');
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
  const ipv6OutPath = resolve(args.ipv6Out || siblingPath(outPath, 'ipv6', DEFAULT_IPV6_OUT));
  const placesOutPath = resolve(args.placesOut || siblingPath(outPath, 'places', DEFAULT_PLACES_OUT));
  for (const p of [outPath, ipv6OutPath, placesOutPath]) mkdirSync(dirname(p), { recursive: true });

  // Stream-transform: read upstream rows, emit IPv4 and IPv6 range rows. We
  // collect into memory to sort before writing (ip-geo.js binary-searches a
  // sorted table). Run this OFF the 256 MB Fly VM -- the source CSV is ~685 MB.
  const rows = [];
  const v6rows = [];
  // label -> [sum x, sum y, sum z] of unit vectors, so a place straddling the
  // antimeridian (Fiji, Chukotka) averages to the right side of the globe.
  const placeSums = new Map();
  const rl = createInterface({ input: createReadStream(inPath, 'utf8'), crlfDelay: Infinity });

  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    if (line.trim() === '') continue;
    const cols = splitCsvLine(line);
    // Expected upstream order: ip_start, ip_end, continent, country, stateprov, city, lat, lon
    if (cols.length < 5) continue;
    const country = (cols[3] || '').trim();
    // DB-IP's ZZ marks private/reserved space; it is not a place.
    if (country === '' || country === 'ZZ') continue;
    // Commas separate the output columns, so none may survive in a name.
    const clean = (name) => (name || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    const countrySafe = clean(country);
    const subSafe = clean(cols[4]);
    const citySafe = clean(cols[5]);
    addPlace(placeSums, countrySafe, subSafe, citySafe, Number(cols[6]), Number(cols[7]));

    const startInt = ipv4ToInt(cols[0]);
    const endInt = ipv4ToInt(cols[1]);
    if (startInt !== null && endInt !== null) {
      if (endInt < startInt) continue;
      rows.push([startInt, endInt, countrySafe, subSafe, citySafe]);
      continue;
    }

    const startV6 = ipv6ToPrefix64(cols[0]);
    const endV6 = ipv6ToPrefix64(cols[1]);
    if (startV6 === null || endV6 === null || endV6 < startV6) continue;
    v6rows.push([startV6, endV6, countrySafe, subSafe, citySafe]);
  }

  rows.sort((a, b) => a[0] - b[0]);
  // Stable sort: rows sharing a /64 keep upstream (ascending address) order.
  v6rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  // Range-merge: collapse CONSECUTIVE rows that share country, subdivision and
  // city AND whose ranges are contiguous or overlapping (nextStart <= lastEnd +
  // 1) into a single range. Upstream often splits one city's block into several
  // rows (different coordinates within the city), so this trims the table a
  // little. Merge only inspects the immediate predecessor, so the prior sort is
  // required.
  const merged = [];
  for (const r of rows) {
    const last = merged.length > 0 ? merged[merged.length - 1] : null;
    if (last && sameLabel(last, r) && r[0] <= last[1] + 1) {
      if (r[1] > last[1]) last[1] = r[1];
    } else {
      merged.push([r[0], r[1], r[2], r[3], r[4]]);
    }
  }

  // IPv6 is keyed on /64 prefixes, so the few upstream ranges narrower than a
  // /64 collapse onto the same key. The first (lowest-address) label claims the
  // prefix; later overlapping rows are trimmed past it or dropped. Then adjacent
  // same-label prefixes merge exactly like IPv4.
  const mergedV6 = [];
  for (const row of v6rows) {
    const r = [row[0], row[1], row[2], row[3], row[4]];
    const last = mergedV6.length > 0 ? mergedV6[mergedV6.length - 1] : null;
    if (last && r[0] <= last[1]) {
      if (r[1] <= last[1]) continue;
      r[0] = last[1] + 1n;
    }
    if (last && sameLabel(last, r) && r[0] <= last[1] + 1n) {
      last[1] = r[1];
      continue;
    }
    mergedV6.push(r);
  }

  const ws = createWriteStream(outPath, 'utf8');
  ws.write(`# Generated by refresh-dbip-dataset.mjs from a DB-IP IP-to-City Lite source CSV.\n`);
  ws.write(`# ${ATTRIBUTION}\n`);
  ws.write(`# Format: start_ip_int,end_ip_int,country,subdivision,city (uint32 IPv4, sorted ascending; adjacent same-place ranges merged).\n`);
  for (const r of merged) {
    ws.write(`${r[0]},${r[1]},${r[2]},${r[3]},${r[4]}\n`);
  }
  await new Promise((res, rej) => { ws.end((err) => (err ? rej(err) : res())); });

  const ws6 = createWriteStream(ipv6OutPath, 'utf8');
  ws6.write(`# Generated by refresh-dbip-dataset.mjs from a DB-IP IP-to-City Lite source CSV.\n`);
  ws6.write(`# ${ATTRIBUTION}\n`);
  ws6.write(`# Format: start64,end64,country,subdivision,city (inclusive IPv6 /64 prefixes as 16 hex digits, sorted ascending; adjacent same-place ranges merged).\n`);
  for (const r of mergedV6) {
    ws6.write(`${hex64(r[0])},${hex64(r[1])},${r[2]},${r[3]},${r[4]}\n`);
  }
  await new Promise((res, rej) => { ws6.end((err) => (err ? rej(err) : res())); });

  // ip-geo.js compares labels as JS strings, so sort with the same comparison.
  const places = [...placeSums.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const wsp = createWriteStream(placesOutPath, 'utf8');
  wsp.write(`# Generated by refresh-dbip-dataset.mjs from a DB-IP IP-to-City Lite source CSV.\n`);
  wsp.write(`# ${ATTRIBUTION}\n`);
  wsp.write(`# Format: label,lat,lon (approximate centroid per region label, 0.1 degree; sorted by label).\n`);
  for (const label of places) {
    const [lat, lon] = centroidOf(placeSums.get(label));
    wsp.write(`${label},${lat},${lon}\n`);
  }
  await new Promise((res, rej) => { wsp.end((err) => (err ? rej(err) : res())); });

  const reduction = rows.length > 0 ? Math.round((1 - merged.length / rows.length) * 100) : 0;
  const reduction6 = v6rows.length > 0 ? Math.round((1 - mergedV6.length / v6rows.length) * 100) : 0;
  console.log(`refresh-dbip-dataset: wrote ${merged.length} IPv4 ranges to ${outPath}`);
  console.log(`  Merged from ${rows.length} raw IPv4 ranges (${reduction}% reduction).`);
  console.log(`refresh-dbip-dataset: wrote ${mergedV6.length} IPv6 ranges to ${ipv6OutPath}`);
  console.log(`  Merged from ${v6rows.length} raw IPv6 ranges (${reduction6}% reduction).`);
  console.log(`refresh-dbip-dataset: wrote ${places.length} place centroids to ${placesOutPath}`);
  console.log(`  Source lines read: ${lineNo}`);
  console.log(`  ${ATTRIBUTION}`);
}

main().catch((err) => {
  console.error('refresh-dbip-dataset: failed:', err && err.message ? err.message : err);
  process.exit(1);
});
