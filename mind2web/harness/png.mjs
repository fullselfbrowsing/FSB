import { crc32, deflateSync, inflateSync } from 'node:zlib';

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function hasPngSignature(buf) {
  return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

// Walks the chunk list and checks lengths, CRCs, IHDR first and IEND last.
// Returns { ok, error, width, height }.
export function inspectPng(buf) {
  if (buf.length === 0) return { ok: false, error: 'empty file' };
  if (!hasPngSignature(buf)) return { ok: false, error: 'missing PNG signature' };
  let offset = 8;
  let width = null;
  let height = null;
  let first = true;
  let sawIdat = false;
  const compressed = [];
  let depth, color, interlace;
  while (offset < buf.length) {
    if (offset + 12 > buf.length) return { ok: false, error: `truncated chunk header at byte ${offset}` };
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > buf.length) return { ok: false, error: `chunk ${type} overruns file` };
    const expected = buf.readUInt32BE(offset + 8 + length);
    const actual = crc32(buf.subarray(offset + 4, offset + 8 + length));
    if (expected !== actual) return { ok: false, error: `bad CRC in chunk ${type}` };
    if (first) {
      if (type !== 'IHDR' || length !== 13) return { ok: false, error: 'first chunk is not IHDR' };
      width = buf.readUInt32BE(offset + 8);
      height = buf.readUInt32BE(offset + 12);
      if (width === 0 || height === 0) return { ok: false, error: 'zero image dimensions' };
      if (width * height > 100_000_000) return { ok: false, error: 'image exceeds validation size limit' };
      depth = buf[offset + 16]; color = buf[offset + 17]; interlace = buf[offset + 20];
      if (!({ 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }[color]?.includes(depth)) || buf[offset + 18] || buf[offset + 19] || interlace > 1) return { ok: false, error: 'unsupported PNG header' };
      first = false;
    }
    if (type === 'IDAT') { sawIdat = true; compressed.push(buf.subarray(offset + 8, offset + 8 + length)); }
    if (type === 'IEND') {
      if (!sawIdat) return { ok: false, error: 'no IDAT chunk' };
      if (length !== 0 || end !== buf.length) return { ok: false, error: 'invalid IEND or trailing data' };
      try {
        const raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: 512_000_000 });
        const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
        const stride = Math.ceil(width * depth * channels / 8) + 1;
        if (!raw.length || (!interlace && raw.length !== height * stride)) return { ok: false, error: 'invalid PNG pixel data length' };
        if (!interlace) for (let row = 0; row < height; row++) if (raw[row * stride] > 4) return { ok: false, error: 'invalid PNG row filter' };
      } catch { return { ok: false, error: 'invalid compressed PNG data' }; }
      return { ok: true, error: null, width, height };
    }
    offset = end;
  }
  return { ok: false, error: 'missing IEND chunk' };
}

// Signature-level check for the non-PNG formats the schema allows.
export function inspectImage(buf, ext) {
  const kind = ext.toLowerCase();
  if (kind === 'png') return inspectPng(buf);
  if (buf.length === 0) return { ok: false, error: 'empty file' };
  if (kind === 'jpg' || kind === 'jpeg') {
    const ok = buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
    return ok ? { ok: true, error: null } : { ok: false, error: 'not a complete JPEG' };
  }
  if (kind === 'webp') {
    const ok = buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
    return ok ? { ok: true, error: null } : { ok: false, error: 'not a WEBP file' };
  }
  return { ok: false, error: `unsupported image extension .${ext}` };
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// Encodes a solid-colour 8-bit RGB PNG. Used to build fixtures.
export function encodeSolidPng(width, height, [r, g, b] = [255, 255, 255]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
