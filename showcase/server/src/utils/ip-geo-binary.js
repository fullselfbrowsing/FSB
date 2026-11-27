/**
 * Compact binary form of the IP range tables that ip-geo.js searches.
 *
 * The CSV tables store every range as text and repeat its place name on every
 * row (about 3.4 M IPv4 and 3.8 M IPv6 rows, but only ~194 k distinct places).
 * This format stores the same ranges as fixed-width records that point into a
 * dictionary of places, so a table is about a fifth of the CSV's size. A
 * lookup returns exactly what the CSV lookup returns for every address; the
 * converter (scripts/convert-dbip-to-binary.mjs) refuses any input for which
 * that cannot be proven, and verifyAgainstRows() checks it after every build.
 *
 * FILE LAYOUT (all integers little-endian):
 *
 *   header   64 bytes
 *     0  8  magic "FSBGEO1\0"
 *     8  1  family: 4 (IPv4) or 6 (IPv6 /64 prefixes)
 *     9  1  record size in bytes: 8 (IPv4) or 12 (IPv6)
 *    10  2  reserved (0)
 *    12  4  record count
 *    16  4  records offset      20  4  dictionary offset   24  4  dictionary size
 *    28  4  notes offset        32  4  notes size          36 28  reserved (0)
 *   notes    UTF-8 text: data attribution and provenance
 *   dictionary
 *            one entry per distinct place: u8 length + country, u8 length +
 *            subdivision, u8 length + city (UTF-8, exactly as the CSV decodes)
 *   records  sorted by start. IPv4: u32 start, u32 placeId. IPv6: u32 high and
 *            u32 low word of the /64 prefix, u32 placeId.
 *
 * Record i covers [start_i, start_(i+1) - 1]; the last record runs to the top
 * of the address space. The first record always starts at 0. placeId is the
 * byte offset of the place's dictionary entry, or 0xFFFFFFFF ("unknown") for
 * the space the CSV has no row for: before the first row, between two rows
 * that are not contiguous, and after the last row.
 *
 * This module never sees an IP address, only the integer keys ip-geo.js
 * derives from one (see the privacy invariant in ip-geo.js). It must not
 * require ip-geo.js: ip-geo.js requires this module.
 */

'use strict';

const fs = require('fs');

const MAGIC = Buffer.from('FSBGEO1\0', 'latin1');
const HEADER_BYTES = 64;
const RECORD_BYTES = Object.freeze({ 4: 8, 6: 12 });
const UNKNOWN_PLACE = 0xFFFFFFFF;
const MAX_FIELD_BYTES = 255;
const MAX_ENTRY_BYTES = 3 + 3 * MAX_FIELD_BYTES;
const MAX_IPV4 = 0xFFFFFFFF;
const MAX_PREFIX64 = 0xFFFFFFFFFFFFFFFFn;
// Offsets are u32, so a table may not exceed 4 GiB (IPv6 is ~51 MB).
const MAX_FILE_BYTES = 0xFFFFFFFF;

// DB-IP marks private/reserved space (RFC 1918, loopback, link-local, ULA incl.
// Fly 6PN) as country 'ZZ'. That is not a place, so it must not become a region.
const RESERVED_COUNTRY = 'ZZ';

function regionFromFields(fields) {
  return fields.country === RESERVED_COUNTRY ? 'unknown' : fields;
}

/** Compare two 64-bit values given as uint32 (hi, lo) word pairs. */
function cmp64(aHi, aLo, bHi, bLo) {
  if (aHi !== bHi) return aHi < bHi ? -1 : 1;
  if (aLo !== bLo) return aLo < bLo ? -1 : 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

function readFully(fd, buf, length, position) {
  return fs.readSync(fd, buf, 0, length, position) === length;
}

/** True when the open file starts with the FSBGEO1 magic. */
function hasMagic(fd, size) {
  if (size < MAGIC.length) return false;
  const head = Buffer.alloc(MAGIC.length);
  return readFully(fd, head, MAGIC.length, 0) && head.equals(MAGIC);
}

function regionFits(offset, bytes, size) {
  return Number.isInteger(offset) && Number.isInteger(bytes) &&
    offset >= HEADER_BYTES && bytes >= 0 && offset + bytes <= size;
}

/**
 * Validate the header of an open FSBGEO1 file and return a lookup handle, or
 * null when anything is inconsistent (wrong family, sizes or offsets outside
 * the file, overlapping sections, a first record that does not start at 0).
 * Every check runs before any buffer is sized from the file's contents.
 *
 * @param {number} fd     open file descriptor (the caller owns it)
 * @param {number} size   file size in bytes
 * @param {4|6} family    the table this file must be
 * @returns {object|null}
 */
function openBinary(fd, size, family) {
  if (family !== 4 && family !== 6) return null;
  if (!Number.isInteger(size) || size < HEADER_BYTES || size > MAX_FILE_BYTES) return null;
  const header = Buffer.alloc(HEADER_BYTES);
  if (!readFully(fd, header, HEADER_BYTES, 0)) return null;
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) return null;
  if (header[8] !== family || header[9] !== RECORD_BYTES[family]) return null;

  const recordBytes = RECORD_BYTES[family];
  const recordCount = header.readUInt32LE(12);
  const recordsOffset = header.readUInt32LE(16);
  const dictOffset = header.readUInt32LE(20);
  const dictBytes = header.readUInt32LE(24);
  const notesOffset = header.readUInt32LE(28);
  const notesBytes = header.readUInt32LE(32);

  if (recordCount < 1) return null;
  const recordsBytes = recordCount * recordBytes;
  if (!regionFits(recordsOffset, recordsBytes, size)) return null;
  if (!regionFits(dictOffset, dictBytes, size)) return null;
  if (!regionFits(notesOffset, notesBytes, size)) return null;
  const overlaps = (aOff, aLen, bOff, bLen) => aLen > 0 && bLen > 0 && aOff < bOff + bLen && bOff < aOff + aLen;
  if (overlaps(recordsOffset, recordsBytes, dictOffset, dictBytes)) return null;
  if (overlaps(recordsOffset, recordsBytes, notesOffset, notesBytes)) return null;
  if (overlaps(dictOffset, dictBytes, notesOffset, notesBytes)) return null;

  const file = {
    kind: 'bin',
    fd,
    size,
    family,
    recordBytes,
    recordCount,
    recordsOffset,
    dictOffset,
    dictBytes,
    notesOffset,
    notesBytes,
    scratch: Buffer.alloc(recordBytes),
    entry: Buffer.alloc(MAX_ENTRY_BYTES),
  };
  // Coverage starts at address 0, so every key has a record at or below it.
  if (!readFully(fd, file.scratch, recordBytes, recordsOffset)) return null;
  if (file.scratch.readUInt32LE(0) !== 0) return null;
  if (family === 6 && file.scratch.readUInt32LE(4) !== 0) return null;
  return file;
}

function readRecord(file, index) {
  if (!readFully(file.fd, file.scratch, file.recordBytes, file.recordsOffset + index * file.recordBytes)) {
    throw new Error('ip-geo-binary: short read');
  }
  return file.scratch;
}

/**
 * Decode the dictionary entry at byte offset placeId into
 * { country, subdivision, city }, or null when the offset or any length runs
 * outside the dictionary.
 */
function readEntry(file, placeId) {
  if (!Number.isInteger(placeId) || placeId < 0 || placeId >= file.dictBytes) return null;
  const n = Math.min(MAX_ENTRY_BYTES, file.dictBytes - placeId);
  if (!readFully(file.fd, file.entry, n, file.dictOffset + placeId)) return null;
  const fields = [];
  let p = 0;
  for (let f = 0; f < 3; f++) {
    if (p >= n) return null;
    const len = file.entry[p];
    p += 1;
    if (p + len > n) return null;
    fields.push(file.entry.toString('utf8', p, p + len));
    p += len;
  }
  return { country: fields[0], subdivision: fields[1], city: fields[2] };
}

function placeOf(file, placeId) {
  if (placeId === UNKNOWN_PLACE) return 'unknown';
  const fields = readEntry(file, placeId);
  return fields ? regionFromFields(fields) : 'unknown';
}

/**
 * Place for a uint32 IPv4 key: binary search for the last record whose start
 * is <= key (record 0 starts at 0, so one always exists).
 */
function lookup4(file, key) {
  let lo = 0;
  let hi = file.recordCount - 1;
  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2);
    if (readRecord(file, mid).readUInt32LE(0) <= key) lo = mid;
    else hi = mid - 1;
  }
  return placeOf(file, readRecord(file, lo).readUInt32LE(4));
}

/** Same for an IPv6 /64 prefix given as uint32 (hi, lo) words. */
function lookup6(file, keyHi, keyLo) {
  let lo = 0;
  let hi = file.recordCount - 1;
  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2);
    const rec = readRecord(file, mid);
    if (cmp64(rec.readUInt32LE(0), rec.readUInt32LE(4), keyHi, keyLo) <= 0) lo = mid;
    else hi = mid - 1;
  }
  return placeOf(file, readRecord(file, lo).readUInt32LE(8));
}

/** The notes text (attribution and provenance), or '' if unreadable. */
function readNotes(file) {
  if (file.notesBytes === 0) return '';
  const buf = Buffer.alloc(file.notesBytes);
  return readFully(file.fd, buf, file.notesBytes, file.notesOffset) ? buf.toString('utf8') : '';
}

/**
 * Iterate every record in file order as { start, placeId }. start is a Number
 * for IPv4 and a BigInt /64 prefix for IPv6.
 */
function* readRecords(file) {
  const perChunk = 4096;
  const chunk = Buffer.alloc(perChunk * file.recordBytes);
  for (let first = 0; first < file.recordCount; first += perChunk) {
    const count = Math.min(perChunk, file.recordCount - first);
    const bytes = count * file.recordBytes;
    if (!readFully(file.fd, chunk, bytes, file.recordsOffset + first * file.recordBytes)) {
      throw new Error('ip-geo-binary: short read');
    }
    for (let i = 0; i < count; i++) {
      const p = i * file.recordBytes;
      if (file.family === 4) {
        yield { start: chunk.readUInt32LE(p), placeId: chunk.readUInt32LE(p + 4) };
      } else {
        const start = (BigInt(chunk.readUInt32LE(p)) << 32n) | BigInt(chunk.readUInt32LE(p + 4));
        yield { start, placeId: chunk.readUInt32LE(p + 8) };
      }
    }
  }
}

/**
 * The address space as the file describes it: consecutive intervals
 * { lo, hi, fields } from 0 to the top, fields null for 'unknown' space.
 */
function* binaryIntervals(file) {
  const max = file.family === 4 ? MAX_IPV4 : MAX_PREFIX64;
  const one = file.family === 4 ? 1 : 1n;
  let prev = null;
  for (const rec of readRecords(file)) {
    if (prev) yield { lo: prev.start, hi: rec.start - one, fields: fieldsOf(file, prev.placeId) };
    prev = rec;
  }
  if (prev) yield { lo: prev.start, hi: max, fields: fieldsOf(file, prev.placeId) };
}

function fieldsOf(file, placeId) {
  if (placeId === UNKNOWN_PLACE) return null;
  const fields = readEntry(file, placeId);
  if (!fields) throw new Error(`ip-geo-binary: placeId ${placeId} is outside the dictionary`);
  return fields;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

class U32List {
  constructor() { this.words = new Uint32Array(1 << 16); this.length = 0; }
  push(value) {
    if (this.length === this.words.length) {
      const grown = new Uint32Array(this.words.length * 2);
      grown.set(this.words);
      this.words = grown;
    }
    this.words[this.length++] = value;
  }
}

function encodeEntry(fields) {
  const parts = [fields.country, fields.subdivision, fields.city].map((s) => Buffer.from(String(s), 'utf8'));
  for (const part of parts) {
    if (part.length > MAX_FIELD_BYTES) throw new Error(`ip-geo-binary: place field longer than ${MAX_FIELD_BYTES} bytes`);
  }
  return Buffer.concat([
    Buffer.from([parts[0].length]), parts[0],
    Buffer.from([parts[1].length]), parts[1],
    Buffer.from([parts[2].length]), parts[2],
  ]);
}

/**
 * Encode CSV rows as an FSBGEO1 file. rows must be sorted, non-overlapping
 * { start, end, country, subdivision, city } objects (Numbers for IPv4,
 * BigInt /64 prefixes for IPv6) -- ip-geo.js _csvInternals.dataRows() yields
 * exactly that and rejects anything else.
 *
 * @param {Iterable<object>} rows
 * @param {4|6} family
 * @param {string} notes  attribution / provenance text stored in the file
 * @returns {Buffer} the complete file
 */
function encode(rows, family, notes) {
  if (family !== 4 && family !== 6) throw new Error('ip-geo-binary: family must be 4 or 6');
  const max = family === 4 ? MAX_IPV4 : MAX_PREFIX64;
  const zero = family === 4 ? 0 : 0n;
  const one = family === 4 ? 1 : 1n;
  const words = new U32List();
  const entries = [];
  const idByEntry = new Map();
  let dictBytes = 0;

  const pushRecord = (start, placeId) => {
    if (family === 4) {
      words.push(start);
    } else {
      words.push(Number(start >> 32n));
      words.push(Number(start & 0xFFFFFFFFn));
    }
    words.push(placeId);
  };

  let covered = null; // last address covered so far (null: none yet)
  for (const row of rows) {
    if (typeof row.start !== typeof zero || typeof row.end !== typeof zero ||
        row.start < zero || row.end < row.start || row.end > max) {
      throw new Error('ip-geo-binary: row bounds are invalid for this family');
    }
    if (covered === null ? row.start > zero : row.start > covered + one) {
      pushRecord(covered === null ? zero : covered + one, UNKNOWN_PLACE);
    } else if (covered !== null && row.start <= covered) {
      throw new Error('ip-geo-binary: rows overlap or are out of order');
    }
    const entry = encodeEntry(row);
    const key = entry.toString('latin1');
    let placeId = idByEntry.get(key);
    if (placeId === undefined) {
      placeId = dictBytes;
      idByEntry.set(key, placeId);
      entries.push(entry);
      dictBytes += entry.length;
      if (dictBytes >= UNKNOWN_PLACE) throw new Error('ip-geo-binary: dictionary too large');
    }
    pushRecord(row.start, placeId);
    covered = row.end;
  }
  if (covered === null) pushRecord(zero, UNKNOWN_PLACE);
  else if (covered < max) pushRecord(covered + one, UNKNOWN_PLACE);

  const recordBytes = RECORD_BYTES[family];
  const recordCount = (words.length * 4) / recordBytes;
  const notesBuf = Buffer.from(String(notes || ''), 'utf8');
  const notesOffset = HEADER_BYTES;
  const dictOffset = notesOffset + notesBuf.length;
  const recordsOffset = dictOffset + dictBytes;
  const total = recordsOffset + words.length * 4;
  if (total > MAX_FILE_BYTES) throw new Error('ip-geo-binary: table too large');

  const header = Buffer.alloc(HEADER_BYTES);
  MAGIC.copy(header, 0);
  header[8] = family;
  header[9] = recordBytes;
  header.writeUInt32LE(recordCount, 12);
  header.writeUInt32LE(recordsOffset, 16);
  header.writeUInt32LE(dictOffset, 20);
  header.writeUInt32LE(dictBytes, 24);
  header.writeUInt32LE(notesOffset, 28);
  header.writeUInt32LE(notesBuf.length, 32);

  const records = Buffer.alloc(words.length * 4);
  for (let i = 0; i < words.length; i++) records.writeUInt32LE(words.words[i], i * 4);
  return Buffer.concat([header, notesBuf, ...entries, records], total);
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * The address space as the CSV rows describe it, built independently of
 * encode(): consecutive { lo, hi, fields } intervals from 0 to the top, with
 * fields null where the CSV has no row (the CSV lookup returns 'unknown').
 */
function* csvIntervals(rows, family) {
  const max = family === 4 ? MAX_IPV4 : MAX_PREFIX64;
  const one = family === 4 ? 1 : 1n;
  let next = family === 4 ? 0 : 0n; // first address not yet described
  for (const row of rows) {
    if (row.end < row.start || row.end > max) throw new Error('ip-geo-binary: row bounds are invalid for this family');
    if (row.start < next) throw new Error('ip-geo-binary: rows overlap or are out of order');
    if (row.start > next) yield { lo: next, hi: row.start - one, fields: null };
    yield { lo: row.start, hi: row.end, fields: { country: row.country, subdivision: row.subdivision, city: row.city } };
    next = row.end + one; // a plain JS number or BigInt: never written to a u32
  }
  if (next <= max) yield { lo: next, hi: max, fields: null };
}

function sameFields(a, b) {
  if (a === null || b === null) return a === b;
  return a.country === b.country && a.subdivision === b.subdivision && a.city === b.city;
}

/**
 * Prove that an open FSBGEO1 file answers exactly like the CSV rows it was
 * built from: both must describe the same intervals with the same places.
 * Throws on the first difference.
 *
 * @returns {{ intervals: number, places: number, unknown: number }}
 */
function verifyAgainstRows(file, rows) {
  const fromCsv = csvIntervals(rows, file.family);
  const fromBin = binaryIntervals(file);
  let intervals = 0;
  let places = 0;
  let unknown = 0;
  for (;;) {
    const a = fromCsv.next();
    const b = fromBin.next();
    if (a.done || b.done) {
      if (a.done !== b.done) throw new Error(`ip-geo-binary: interval count differs after ${intervals}`);
      break;
    }
    const c = a.value;
    const d = b.value;
    if (c.lo !== d.lo || c.hi !== d.hi || !sameFields(c.fields, d.fields)) {
      throw new Error(`ip-geo-binary: interval ${intervals} differs (csv ${c.lo}-${c.hi}, bin ${d.lo}-${d.hi})`);
    }
    intervals += 1;
    if (c.fields) places += 1; else unknown += 1;
  }
  return { intervals, places, unknown };
}

module.exports = {
  MAGIC,
  HEADER_BYTES,
  RECORD_BYTES,
  UNKNOWN_PLACE,
  MAX_FIELD_BYTES,
  RESERVED_COUNTRY,
  regionFromFields,
  cmp64,
  hasMagic,
  openBinary,
  readEntry,
  readNotes,
  readRecords,
  binaryIntervals,
  lookup4,
  lookup6,
  encode,
  verifyAgainstRows,
};
