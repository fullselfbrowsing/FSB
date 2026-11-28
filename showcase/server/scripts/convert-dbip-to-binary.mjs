#!/usr/bin/env node
/**
 * Convert a DB-IP range table from the CSV form that
 * showcase/server/src/utils/ip-geo.js searches into its compact FSBGEO1 binary
 * form (see src/utils/ip-geo-binary.js), verify a binary against its CSV, or
 * write a binary back out as CSV rows.
 *
 * ============================================================================
 *  IP Geolocation by DB-IP (https://db-ip.com), CC-BY-4.0.
 * ============================================================================
 *
 * Usage:
 *   node showcase/server/scripts/convert-dbip-to-binary.mjs --family 4 --in dbip-city-lite.csv --out dbip-city-lite.bin
 *   node showcase/server/scripts/convert-dbip-to-binary.mjs --family 6 --in dbip-city-lite.ipv6.csv --out dbip-city-lite.ipv6.bin
 *   node showcase/server/scripts/convert-dbip-to-binary.mjs --verify --family 4 --in dbip-city-lite.csv --bin dbip-city-lite.bin
 *   node showcase/server/scripts/convert-dbip-to-binary.mjs --dump --family 4 --bin dbip-city-lite.bin --out rows.csv
 *
 * A conversion refuses any CSV whose answers the binary could not reproduce
 * exactly (overlapping or unsorted rows, unparseable lines, oversized fields;
 * see csvDataRows in ip-geo.js). It writes <out>.tmp, verifies it against the
 * CSV interval by interval, and only then renames it to <out>. The places file
 * stays CSV and is not converted.
 */

import { readFileSync, writeFileSync, renameSync, rmSync, openSync, closeSync, fstatSync, writeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ipGeo = require('../src/utils/ip-geo.js');
const geoBin = require('../src/utils/ip-geo-binary.js');

const ATTRIBUTION = 'IP Geolocation by DB-IP (https://db-ip.com), CC-BY-4.0';
const BUILDER = 'built by showcase/server/scripts/convert-dbip-to-binary.mjs (FSBGEO1)';

function* counted(rows, counter) {
  for (const row of rows) {
    counter.rows += 1;
    yield row;
  }
}

/**
 * Open binPath as an FSBGEO1 table of `family` and pass the handle to fn.
 */
function withBinary(binPath, family, fn) {
  const fd = openSync(binPath, 'r');
  try {
    const file = geoBin.openBinary(fd, fstatSync(fd).size, family);
    if (!file) throw new Error(`${binPath} is not a valid FSBGEO1 IPv${family} table`);
    return fn(file);
  } finally {
    closeSync(fd);
  }
}

/**
 * Prove binPath answers exactly like csvPath for every address.
 *
 * @returns {{ intervals: number, places: number, unknown: number }}
 */
export function verifyBinFile(csvPath, binPath, family, csvBuf) {
  const csv = csvBuf || readFileSync(csvPath);
  return withBinary(binPath, family, (file) =>
    geoBin.verifyAgainstRows(file, ipGeo._csvInternals.dataRows(csv, family)));
}

/**
 * Convert csvPath into binPath (via binPath.tmp, verified before the rename).
 *
 * @returns {{ rows: number, bytes: number, sha256: string, intervals: number, places: number, unknown: number }}
 */
export function convertCsvFile(csvPath, binPath, family) {
  if (family !== 4 && family !== 6) throw new Error('family must be 4 or 6');
  const csv = readFileSync(csvPath);
  const sha256 = createHash('sha256').update(csv).digest('hex');
  const counter = { rows: 0 };
  const notes = `${ATTRIBUTION}\nsource sha256 ${sha256}\n${BUILDER}\n`;
  const out = geoBin.encode(counted(ipGeo._csvInternals.dataRows(csv, family), counter), family, notes);
  if (counter.rows === 0) throw new Error(`${csvPath} has no IPv${family} data rows`);

  const tmp = `${binPath}.tmp`;
  writeFileSync(tmp, out);
  try {
    const proof = verifyBinFile(csvPath, tmp, family, csv);
    renameSync(tmp, binPath);
    return { rows: counter.rows, bytes: out.length, sha256, ...proof };
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

/**
 * Write binPath's rows back out as CSV data lines (decimal IPv4 bounds, 16-hex
 * IPv6 prefixes), skipping the 'unknown' gaps.
 *
 * @returns {number} rows written
 */
export function dumpBinFile(binPath, family, outPath) {
  const hex64 = (n) => n.toString(16).padStart(16, '0');
  return withBinary(binPath, family, (file) => {
    const fd = openSync(outPath, 'w');
    try {
      let rows = 0;
      let lines = [];
      const flush = () => {
        if (lines.length > 0) writeSync(fd, lines.join(''));
        lines = [];
      };
      for (const iv of geoBin.binaryIntervals(file)) {
        if (!iv.fields) continue;
        const lo = family === 4 ? iv.lo : hex64(iv.lo);
        const hi = family === 4 ? iv.hi : hex64(iv.hi);
        lines.push(`${lo},${hi},${iv.fields.country},${iv.fields.subdivision},${iv.fields.city}\n`);
        rows += 1;
        if (lines.length >= 10000) flush();
      }
      flush();
      return rows;
    } finally {
      closeSync(fd);
    }
  });
}

function usage() {
  console.error('Usage:');
  console.error('  convert-dbip-to-binary.mjs --family 4|6 --in <table.csv> --out <table.bin>');
  console.error('  convert-dbip-to-binary.mjs --verify --family 4|6 --in <table.csv> --bin <table.bin>');
  console.error('  convert-dbip-to-binary.mjs --dump --family 4|6 --bin <table.bin> --out <rows.csv>');
  console.error(`  ${ATTRIBUTION}`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = { family: null, in: null, out: null, bin: null, verify: false, dump: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--family') args.family = Number(argv[++i]);
    else if (a === '--in') args.in = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--bin') args.bin = argv[++i];
    else if (a === '--verify') args.verify = true;
    else if (a === '--dump') args.dump = true;
    else usage();
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const family = args.family;
  if (family !== 4 && family !== 6) usage();

  if (args.dump) {
    if (!args.bin || !args.out) usage();
    const rows = dumpBinFile(args.bin, family, args.out);
    console.log(`convert-dbip-to-binary: wrote ${rows} IPv${family} rows from ${args.bin} to ${args.out}`);
    return;
  }
  if (args.verify) {
    if (!args.in || !args.bin) usage();
    const proof = verifyBinFile(args.in, args.bin, family);
    console.log(`convert-dbip-to-binary: ${args.bin} matches ${args.in}: ${proof.intervals} intervals ` +
      `(${proof.places} places, ${proof.unknown} unknown)`);
    return;
  }
  if (!args.in || !args.out) usage();
  if (!args.out.endsWith('.bin')) {
    console.error('convert-dbip-to-binary: --out must end in .bin');
    process.exit(2);
  }
  const r = convertCsvFile(args.in, args.out, family);
  console.log(`convert-dbip-to-binary: wrote ${args.out} (${r.bytes} bytes) from ${r.rows} IPv${family} rows`);
  console.log(`  verified: ${r.intervals} intervals (${r.places} places, ${r.unknown} unknown)`);
  console.log(`  source ${args.in} sha256 ${r.sha256}`);
  console.log(`  ${ATTRIBUTION}`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    main();
  } catch (err) {
    console.error('convert-dbip-to-binary: failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
}
