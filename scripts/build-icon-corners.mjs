#!/usr/bin/env node
/**
 * Cuts the rounded corners into the FSB toolbar icon PNGs and keeps their copies in step.
 *
 *   node scripts/build-icon-corners.mjs          rewrite whatever differs
 *   node scripts/build-icon-corners.mjs --check  exit 1 if anything would change
 *
 * The artwork is a full-bleed black tile, so rounding it is only an alpha mask: pixels outside
 * a rounded square of radius RADIUS_128 / 128 of the side become transparent, with each edge
 * pixel's alpha set to how much of it the rounded square covers (16 x 16 samples per pixel).
 * Colour is never touched. Re-running on an already cut icon writes identical bytes, so a
 * re-exported square icon only needs this script run over it again.
 *
 * The radius matches the rounded icon tiles the showcase draws (8/34 and 20/86 in the release
 * notes). extension/utils/action-icon.js draws its animated toolbar frames over these files and
 * cuts every frame with their alpha, so CORNER_RATIO there must equal RADIUS_128 / 128 here;
 * tests/fsb-icon-corners.test.js checks both, and that the copies below are byte-identical.
 *
 * It also writes the light pair (LIGHT below): the cut icon with its luminance inverted, a white
 * tile with the black lockup, the same inversion the brand's light logo (fsb_logo_light.png) is.
 * action-icon.js draws it when FSB's theme is set to Light. Alpha is untouched, so the light
 * icon has exactly the same rounded edge, and its cut corners come out white, which is what lets
 * the toolbar animation rebuild the uncut tile by painting white under it.
 *
 * No dependencies: PNG decoding and encoding use node:zlib and a CRC table, and the output
 * holds only IHDR, IDAT and IEND, so editor metadata in a re-exported file is dropped.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const RADIUS_128 = 30;
export const SOURCES = ['extension/assets/icon16.png', 'extension/assets/icon48.png', 'extension/assets/icon128.png'];
// Copy -> source. These ship the same icon from other folders.
export const COPIES = {
  'extension/assets/onboarding/icon48.png': 'extension/assets/icon48.png',
  'showcase/assets/icon48.png': 'extension/assets/icon48.png',
  'showcase/assets/icon128.png': 'extension/assets/icon128.png',
};
// Light icon -> the source it inverts. Only the two sizes the toolbar animation draws from.
export const LIGHT = {
  'extension/assets/icon16_light.png': 'extension/assets/icon16.png',
  'extension/assets/icon128_light.png': 'extension/assets/icon128.png',
};
// A cut pixel brighter than this would lose visible artwork, and would break the toolbar
// animation's assumption that black under the icon rebuilds the square tile.
export const MAX_CORNER_LUMA = 8;

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** 8-bit, non-interlaced grey, grey+alpha, RGB or RGBA PNG -> { width, height, rgba }. */
export function decodePng(bytes) {
  if (!Buffer.from(bytes.subarray(0, 8)).equals(SIGNATURE)) throw new Error('not a PNG');
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colorType: body[9], interlace: body[12] };
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (!header) throw new Error('PNG has no IHDR');
  const channels = CHANNELS[header.colorType];
  if (header.depth !== 8 || !channels || header.interlace !== 0) {
    throw new Error(`unsupported PNG (depth ${header.depth}, colour type ${header.colorType}, interlace ${header.interlace})`);
  }
  const { width, height } = header;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      pixels[y * stride + x] = value & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const p = pixels.subarray(i * channels, (i + 1) * channels);
    const [r, g, b] = channels >= 3 ? p : [p[0], p[0], p[0]];
    rgba.set([r, g, b, channels === 2 ? p[1] : channels === 4 ? p[3] : 255], i * 4);
  }
  return { width, height, rgba };
}

/** { width, height, rgba } -> PNG bytes. Grey+alpha when every pixel is grey, else RGBA. */
export function encodePng({ width, height, rgba }) {
  let grey = true;
  for (let i = 0; i < width * height && grey; i++) {
    grey = rgba[i * 4] === rgba[i * 4 + 1] && rgba[i * 4] === rgba[i * 4 + 2];
  }
  const channels = grey ? 2 : 4;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const at = y * (stride + 1) + 1 + x * channels;
      if (grey) { raw[at] = rgba[i]; raw[at + 1] = rgba[i + 3]; }
      else raw.set(rgba.subarray(i, i + 4), at);
    }
  }
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = grey ? 4 : 6;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** How much of each pixel a rounded square of the given radius covers, 0-255. */
export function cornerMask(size, radius, samples = 16) {
  const mask = new Uint8Array(size * size);
  const r2 = radius * radius;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside = 0;
      for (let sy = 0; sy < samples; sy++) {
        const py = y + (sy + 0.5) / samples;
        const dy = Math.max(radius - py, 0, py - (size - radius));
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples;
          const dx = Math.max(radius - px, 0, px - (size - radius));
          if (dx * dx + dy * dy <= r2) inside++;
        }
      }
      mask[y * size + x] = Math.round((255 * inside) / (samples * samples));
    }
  }
  return mask;
}

function maskFor(width, height) {
  if (width !== height) throw new Error(`icon is ${width}x${height}, not square`);
  return cornerMask(width, (RADIUS_128 / 128) * width);
}

/** The brightest pixel the corner cut touches (max of R, G, B), for MAX_CORNER_LUMA. */
export function cornerInk(bytes) {
  const image = decodePng(bytes);
  const mask = maskFor(image.width, image.height);
  let brightest = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] < 255) brightest = Math.max(brightest, image.rgba[i * 4], image.rgba[i * 4 + 1], image.rgba[i * 4 + 2]);
  }
  return brightest;
}

/** PNG bytes -> the same icon with its corners cut. Idempotent. */
export function cutCorners(bytes) {
  const image = decodePng(bytes);
  const mask = maskFor(image.width, image.height);
  const rgba = Uint8Array.from(image.rgba);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] < 255) rgba[i * 4 + 3] = mask[i];
  }
  return encodePng({ width: image.width, height: image.height, rgba });
}

/** PNG bytes -> the same icon with every pixel's R, G and B inverted and its alpha kept. */
export function invertLuma(bytes) {
  const image = decodePng(bytes);
  const rgba = Uint8Array.from(image.rgba);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 255 - rgba[i];
    rgba[i + 1] = 255 - rgba[i + 1];
    rgba[i + 2] = 255 - rgba[i + 2];
  }
  return encodePng({ width: image.width, height: image.height, rgba });
}

function main() {
  const check = process.argv.includes('--check');
  const stale = [];
  const write = (relative, bytes) => {
    const file = path.join(ROOT, relative);
    if (existsSync(file) && Buffer.compare(readFileSync(file), bytes) === 0) return;
    stale.push(relative);
    if (!check) writeFileSync(file, bytes);
  };
  const cut = {};
  for (const source of SOURCES) {
    const bytes = readFileSync(path.join(ROOT, source));
    const ink = cornerInk(bytes);
    if (ink > MAX_CORNER_LUMA) {
      throw new Error(`${source}: the corners carry artwork (brightness ${ink}), so cutting them would lose it`);
    }
    cut[source] = cutCorners(bytes);
    write(source, cut[source]);
  }
  for (const [copy, source] of Object.entries(COPIES)) write(copy, cut[source]);
  for (const [light, source] of Object.entries(LIGHT)) write(light, invertLuma(cut[source]));
  if (check) {
    if (stale.length) {
      console.error(`out of date: ${stale.join(', ')}\nrun node scripts/build-icon-corners.mjs`);
      process.exit(1);
    }
    console.log('icon corners are up to date');
  } else {
    console.log(stale.length ? `wrote ${stale.join(', ')}` : 'icon corners were already up to date');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
