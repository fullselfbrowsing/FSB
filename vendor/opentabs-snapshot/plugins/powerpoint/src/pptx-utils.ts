/**
 * Minimal ZIP parser/writer and OOXML utilities for PPTX manipulation in the browser.
 *
 * PPTX files are ZIP archives containing OOXML (XML) files. This module provides:
 * - ZIP reading: parse a ZIP blob into a map of filename→Uint8Array entries
 * - ZIP writing: pack a map of filename→Uint8Array entries back into a ZIP blob
 * - OOXML helpers: extract text from slides, modify slide XML, add/remove slides
 */

import { getAuthCache, ToolError } from '@opentabs-dev/plugin-sdk';
import { GRAPH_BASE, getCurrentDriveId } from './powerpoint-api.js';

// --- ZIP constants ---
const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;

// --- Helpers ---

const isElement = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE;

const getLocalName = (node: Node): string | undefined => (isElement(node) ? node.localName : undefined);

const collectStreamChunks = async (readable: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  const reader = readable.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (value) chunks.push(value);
    if (done) break;
  }
  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const c of chunks) {
    result.set(c, pos);
    pos += c.length;
  }
  return result;
};

// --- ZIP reader ---

/** Parse a ZIP file into entries. */
export const readZip = async (blob: Blob): Promise<Map<string, Uint8Array>> => {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer as ArrayBuffer);
  const entries = new Map<string, Uint8Array>();

  // Find End of Central Directory record (search backwards from end)
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === END_OF_CENTRAL_DIR_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw ToolError.internal('Invalid ZIP: no EOCD record');

  const centralDirOffset = view.getUint32(eocdOffset + 16, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);

  let offset = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(offset, true) !== CENTRAL_DIR_HEADER_SIG)
      throw ToolError.internal('Invalid ZIP: bad central directory header');

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const name = new TextDecoder().decode(buf.subarray(offset + 46, offset + 46 + nameLen));

    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawData = buf.slice(dataStart, dataStart + compressedSize);

    if (compressionMethod === 0) {
      entries.set(name, new Uint8Array(rawData));
    } else if (compressionMethod === 8) {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      void writer.write(rawData).then(() => writer.close());
      const decompressed = await collectStreamChunks(ds.readable);
      const result = new Uint8Array(uncompressedSize);
      result.set(decompressed.subarray(0, uncompressedSize));
      entries.set(name, result);
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
};

// --- ZIP writer ---

const deflateData = async (data: Uint8Array): Promise<Uint8Array> => {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  // Copy into a fresh ArrayBuffer to satisfy the BufferSource type constraint
  const copy = new Uint8Array(data.length);
  copy.set(data);
  void writer.write(copy).then(() => writer.close());
  return collectStreamChunks(cs.readable);
};

/** CRC-32 computation. */
const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc32Table[(crc ^ (data[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/** Write a ZIP file from entries. */
export const writeZip = async (entries: Map<string, Uint8Array>): Promise<Blob> => {
  const parts: ArrayBuffer[] = [];
  const centralDir: ArrayBuffer[] = [];
  let offset = 0;

  for (const [name, data] of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const compressed = await deflateData(data);
    const crcVal = crc32(data);

    const localHeader = new ArrayBuffer(30 + nameBytes.length);
    const lhView = new DataView(localHeader);
    lhView.setUint32(0, LOCAL_FILE_HEADER_SIG, true);
    lhView.setUint16(4, 20, true);
    lhView.setUint16(8, 8, true);
    lhView.setUint32(14, crcVal, true);
    lhView.setUint32(18, compressed.length, true);
    lhView.setUint32(22, data.length, true);
    lhView.setUint16(26, nameBytes.length, true);
    new Uint8Array(localHeader).set(nameBytes, 30);

    parts.push(localHeader);
    parts.push(compressed.buffer as ArrayBuffer);

    const cdEntry = new ArrayBuffer(46 + nameBytes.length);
    const cdView = new DataView(cdEntry);
    cdView.setUint32(0, CENTRAL_DIR_HEADER_SIG, true);
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 20, true);
    cdView.setUint16(10, 8, true);
    cdView.setUint32(16, crcVal, true);
    cdView.setUint32(20, compressed.length, true);
    cdView.setUint32(24, data.length, true);
    cdView.setUint16(28, nameBytes.length, true);
    cdView.setUint32(42, offset, true);
    new Uint8Array(cdEntry).set(nameBytes, 46);

    centralDir.push(cdEntry);
    offset += localHeader.byteLength + compressed.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const cd of centralDir) {
    parts.push(cd);
    centralDirSize += cd.byteLength;
  }

  const eocd = new ArrayBuffer(22);
  const eocdView = new DataView(eocd);
  eocdView.setUint32(0, END_OF_CENTRAL_DIR_SIG, true);
  eocdView.setUint16(8, entries.size, true);
  eocdView.setUint16(10, entries.size, true);
  eocdView.setUint32(12, centralDirSize, true);
  eocdView.setUint32(16, centralDirOffset, true);
  parts.push(eocd);

  return new Blob(parts);
};

// --- OOXML slide helpers ---

const xmlParser = typeof DOMParser !== 'undefined' ? new DOMParser() : undefined;
const xmlSerializer = typeof XMLSerializer !== 'undefined' ? new XMLSerializer() : undefined;

const parseXml = (xml: string): Document => {
  if (!xmlParser) throw ToolError.internal('DOMParser not available');
  return xmlParser.parseFromString(xml, 'application/xml');
};

const serializeXml = (doc: Document): string => {
  if (!xmlSerializer) throw ToolError.internal('XMLSerializer not available');
  return xmlSerializer.serializeToString(doc);
};

export const TEXT_DECODER = new TextDecoder();
export const TEXT_ENCODER = new TextEncoder();

/** Extract all text runs from a slide XML. */
export const extractSlideText = (slideXml: string): string[] => {
  const doc = parseXml(slideXml);
  const texts: string[] = [];
  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (getLocalName(node) === 't' && node.textContent) {
      texts.push(node.textContent);
    }
    node = walker.nextNode();
  }
  return texts;
};

/** Extract speaker notes text from a notes XML file. */
export const extractNotesText = (notesXml: string): string => {
  const doc = parseXml(notesXml);
  const texts: string[] = [];
  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (getLocalName(node) === 't' && node.textContent) {
      texts.push(node.textContent);
    }
    node = walker.nextNode();
  }
  return texts.join('');
};

/** Get the list of slide filenames from the presentation.xml rels. */
export const getSlideList = (entries: Map<string, Uint8Array>): string[] => {
  const presRelsData = entries.get('ppt/_rels/presentation.xml.rels');
  if (!presRelsData) return [];

  const relsXml = TEXT_DECODER.decode(presRelsData);
  const doc = parseXml(relsXml);
  const slides: { target: string; id: string }[] = [];

  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (isElement(node) && getLocalName(node) === 'Relationship') {
      const relType = node.getAttribute('Type') ?? '';
      if (relType.includes('/slide') && !relType.includes('Layout') && !relType.includes('Master')) {
        const target = node.getAttribute('Target') ?? '';
        const id = node.getAttribute('Id') ?? '';
        if (target) slides.push({ target, id });
      }
    }
    node = walker.nextNode();
  }

  slides.sort((a, b) => {
    const numA = Number.parseInt(a.target.match(/slide(\d+)/)?.[1] ?? '0', 10);
    const numB = Number.parseInt(b.target.match(/slide(\d+)/)?.[1] ?? '0', 10);
    return numA - numB;
  });

  return slides.map(s => `ppt/${s.target}`);
};

/** Get the notes filename for a given slide. */
export const getNotesForSlide = (entries: Map<string, Uint8Array>, slideFile: string): string | null => {
  const slideBaseName = slideFile.split('/').pop()?.replace('.xml', '') ?? '';
  const relsPath = `ppt/slides/_rels/${slideBaseName}.xml.rels`;
  const relsData = entries.get(relsPath);
  if (!relsData) return null;

  const relsXml = TEXT_DECODER.decode(relsData);
  const doc = parseXml(relsXml);
  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (isElement(node) && getLocalName(node) === 'Relationship') {
      if ((node.getAttribute('Type') ?? '').includes('/notesSlide')) {
        const target = node.getAttribute('Target') ?? '';
        if (target) return `ppt/notesSlides/${target.split('/').pop()}`;
      }
    }
    node = walker.nextNode();
  }
  return null;
};

// --- Download/Upload helpers ---

/** Download a PPTX from the Graph API and return its ZIP entries. */
export const downloadPptx = async (itemId: string): Promise<Map<string, Uint8Array>> => {
  const auth = getAuthCache<{ token: string }>('powerpoint');
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Microsoft 365.');
  const driveId = getCurrentDriveId();

  const itemResp = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${itemId}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!itemResp.ok) throw ToolError.internal(`Failed to get item: ${itemResp.status}`);
  const itemData = (await itemResp.json()) as { '@microsoft.graph.downloadUrl'?: string };
  const downloadUrl = itemData['@microsoft.graph.downloadUrl'];
  if (!downloadUrl) throw ToolError.internal('No download URL available');

  const pptxResp = await fetch(downloadUrl, { signal: AbortSignal.timeout(60_000) });
  if (!pptxResp.ok) throw ToolError.internal(`Failed to download PPTX: ${pptxResp.status}`);
  const blob = await pptxResp.blob();

  return readZip(blob);
};

/** Upload a PPTX to the Graph API by re-zipping the entries. */
export const uploadPptx = async (itemId: string, entries: Map<string, Uint8Array>): Promise<void> => {
  const auth = getAuthCache<{ token: string }>('powerpoint');
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Microsoft 365.');
  const driveId = getCurrentDriveId();

  const blob = await writeZip(entries);
  const url = `${GRAPH_BASE}/drives/${driveId}/items/${itemId}/content`;

  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
    body: blob,
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) {
    const errorBody = (await resp.text().catch(() => '')).substring(0, 512);
    throw ToolError.internal(`Failed to upload PPTX: ${resp.status} — ${errorBody}`);
  }
};

/** Replace all text runs in a slide XML with new text content. */
export const replaceSlideText = (slideXml: string, newText: string): string => {
  const doc = parseXml(slideXml);
  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT);

  // Find the first text body with content
  let firstBody: Element | null = null;
  let node = walker.nextNode();
  while (node) {
    if (isElement(node) && getLocalName(node) === 'txBody') {
      const paragraphs = Array.from(node.childNodes).filter(n => isElement(n) && n.localName === 'p');
      if (paragraphs.length > 0 && !firstBody) {
        firstBody = node;
      }
    }
    node = walker.nextNode();
  }

  if (firstBody) {
    const paragraphs = Array.from(firstBody.childNodes).filter(
      (n): n is Element => isElement(n) && n.localName === 'p',
    );
    const lines = newText.split('\n');
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      if (!p) continue;
      const runs = Array.from(p.childNodes).filter((n): n is Element => isElement(n) && n.localName === 'r');
      if (runs.length > 0 && i < lines.length) {
        const firstRun = runs[0];
        if (!firstRun) continue;
        const tElements = Array.from(firstRun.childNodes).filter(
          (n): n is Element => isElement(n) && n.localName === 't',
        );
        const firstT = tElements[0];
        if (firstT) {
          firstT.textContent = lines[i] ?? '';
        }
        for (let j = 1; j < runs.length; j++) {
          const run = runs[j];
          if (run) p.removeChild(run);
        }
      }
    }
  }

  return serializeXml(doc);
};

/** Replace speaker notes text in a notes XML. */
export const replaceNotesText = (notesXml: string, newText: string): string => {
  const doc = parseXml(notesXml);
  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT);

  let notesBody: Element | null = null;
  let node = walker.nextNode();
  while (node) {
    if (isElement(node) && getLocalName(node) === 'txBody') {
      const hasType = node.parentElement?.querySelector('[type]');
      if (!hasType || hasType.getAttribute('type')?.includes('body')) {
        notesBody = node;
      }
    }
    node = walker.nextNode();
  }

  if (notesBody) {
    const paragraphs = Array.from(notesBody.childNodes).filter(
      (n): n is Element => isElement(n) && n.localName === 'p',
    );
    const firstP = paragraphs[0];
    if (firstP) {
      const runs = Array.from(firstP.childNodes).filter((n): n is Element => isElement(n) && n.localName === 'r');
      const firstRun = runs[0];
      if (firstRun) {
        const tElements = Array.from(firstRun.childNodes).filter(
          (n): n is Element => isElement(n) && n.localName === 't',
        );
        const firstT = tElements[0];
        if (firstT) {
          firstT.textContent = newText;
        }
      }
    }
  }

  return serializeXml(doc);
};
