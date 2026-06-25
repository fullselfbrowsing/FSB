/**
 * Utilities for reading and creating .docx files in the browser.
 *
 * A .docx file is a ZIP archive containing OOXML parts:
 *   [Content_Types].xml  — content type declarations
 *   _rels/.rels          — relationship mappings
 *   word/document.xml    — the actual document content
 *
 * Text is stored in <w:t> elements within <w:r> (run) within <w:p> (paragraph) nodes.
 */

/** Read a little-endian uint16 from a byte array. */
function readUint16LE(data: Uint8Array, offset: number): number {
  return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8);
}

/** Read a little-endian uint32 from a byte array. */
function readUint32LE(data: Uint8Array, offset: number): number {
  return (
    (data[offset] ?? 0) |
    ((data[offset + 1] ?? 0) << 8) |
    ((data[offset + 2] ?? 0) << 16) |
    (((data[offset + 3] ?? 0) << 24) >>> 0)
  );
}

/**
 * Extract a file entry from a ZIP archive by name.
 * Handles both STORE (uncompressed) and DEFLATE (compressed) entries.
 */
export async function extractZipEntry(zipBytes: Uint8Array, filename: string): Promise<string | null> {
  let offset = 0;
  while (offset < zipBytes.length - 30) {
    // Local file header signature: PK\x03\x04
    if (readUint32LE(zipBytes, offset) !== 0x04034b50) {
      offset++;
      continue;
    }

    const compressionMethod = readUint16LE(zipBytes, offset + 8);
    const compressedSize = readUint32LE(zipBytes, offset + 18);
    const nameLen = readUint16LE(zipBytes, offset + 26);
    const extraLen = readUint16LE(zipBytes, offset + 28);

    const name = new TextDecoder().decode(zipBytes.slice(offset + 30, offset + 30 + nameLen));
    const dataStart = offset + 30 + nameLen + extraLen;
    const rawData = zipBytes.slice(dataStart, dataStart + compressedSize);

    if (name === filename) {
      if (compressionMethod === 8) {
        const bytes = await decompressDeflateRaw(rawData);
        return new TextDecoder().decode(bytes);
      }
      // STORE (method 0) — uncompressed
      return new TextDecoder().decode(rawData);
    }

    offset += 30 + nameLen + extraLen + compressedSize;
  }
  return null;
}

/** Decompress a DEFLATE-raw buffer using the browser DecompressionStream API. */
async function decompressDeflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  // Copy into a fresh ArrayBuffer to satisfy the BufferSource type constraint
  const copy = new Uint8Array(data.length);
  copy.set(data);
  writer.write(copy);
  writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}

/**
 * Extract plain text paragraphs from OOXML document.xml content.
 * Returns an array of paragraph strings.
 */
export function extractTextFromDocumentXml(xml: string): string[] {
  const paraBlocks = xml.split(/<\/w:p>/);
  const paragraphs: string[] = [];

  for (const block of paraBlocks) {
    const texts: string[] = [];
    const regex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let match: RegExpExecArray | null = regex.exec(block);
    while (match !== null) {
      texts.push(match[1] ?? '');
      match = regex.exec(block);
    }
    const paraText = texts.join('');
    if (paraText) {
      paragraphs.push(paraText);
    }
  }

  return paragraphs;
}

/** A raw entry extracted from a ZIP archive. Binary data is preserved as-is. */
export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Extract all entries from a ZIP archive, decompressing DEFLATE entries.
 * Returns raw byte data for each entry (to preserve binary entries like images).
 */
export async function extractAllZipEntries(zipBytes: Uint8Array): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  let offset = 0;
  while (offset < zipBytes.length - 30) {
    if (readUint32LE(zipBytes, offset) !== 0x04034b50) {
      offset++;
      continue;
    }

    const compressionMethod = readUint16LE(zipBytes, offset + 8);
    const compressedSize = readUint32LE(zipBytes, offset + 18);
    const nameLen = readUint16LE(zipBytes, offset + 26);
    const extraLen = readUint16LE(zipBytes, offset + 28);

    const name = new TextDecoder().decode(zipBytes.slice(offset + 30, offset + 30 + nameLen));
    const dataStart = offset + 30 + nameLen + extraLen;
    const rawData = zipBytes.slice(dataStart, dataStart + compressedSize);

    let data: Uint8Array;
    if (compressionMethod === 8) {
      data = await decompressDeflateRaw(rawData);
    } else {
      data = rawData;
    }

    entries.push({ name, data });
    offset += 30 + nameLen + extraLen + compressedSize;
  }
  return entries;
}

/**
 * Rebuild a ZIP archive from entries, replacing one entry's content.
 * All entries are stored uncompressed (STORE method).
 */
export function rebuildZip(entries: ZipEntry[]): Uint8Array {
  return createZipFromBinary(entries);
}

/** Escape text for use inside OOXML <w:t> elements. */
export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Build OOXML paragraph elements from plain text strings. */
export function textToParagraphXml(paragraphs: string[]): string {
  return paragraphs.map(text => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`).join('');
}

/**
 * Append paragraphs to an existing document.xml string.
 * Inserts new <w:p> elements before the closing </w:body> tag.
 */
export function appendParagraphsToXml(existingXml: string, paragraphs: string[]): string {
  const newContent = textToParagraphXml(paragraphs);
  // Insert before </w:body>
  const bodyCloseIdx = existingXml.lastIndexOf('</w:body>');
  if (bodyCloseIdx === -1) {
    // Malformed — wrap in a body
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${newContent}</w:body></w:document>`;
  }
  return existingXml.slice(0, bodyCloseIdx) + newContent + existingXml.slice(bodyCloseIdx);
}

/**
 * Replace all document body content with new paragraphs, preserving
 * the XML declaration and document wrapper attributes.
 */
export function replaceBodyContent(existingXml: string, paragraphs: string[]): string {
  const newContent = textToParagraphXml(paragraphs);

  // Find <w:body...> opening and </w:body> closing
  const bodyOpenMatch = existingXml.match(/<w:body[^>]*>/);
  const bodyCloseIdx = existingXml.lastIndexOf('</w:body>');

  if (!bodyOpenMatch || bodyCloseIdx === -1) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${newContent}</w:body></w:document>`;
  }

  const bodyOpenEnd = (bodyOpenMatch.index ?? 0) + bodyOpenMatch[0].length;
  return existingXml.slice(0, bodyOpenEnd) + newContent + existingXml.slice(bodyCloseIdx);
}

/**
 * Perform find-and-replace on text within <w:t> elements in document.xml.
 * Replaces all occurrences of `find` with `replace` within each text run.
 */
export function replaceTextInXml(xml: string, find: string, replace: string): { xml: string; count: number } {
  let count = 0;
  const escaped = escapeXml(find);
  const escapedReplace = escapeXml(replace);

  // Replace within <w:t> content — match each <w:t>...</w:t> and replace inside
  const result = xml.replace(
    /(<w:t[^>]*>)([\s\S]*?)(<\/w:t>)/g,
    (_match, open: string, content: string, close: string) => {
      if (!content.includes(escaped)) return _match;
      const parts = content.split(escaped);
      count += parts.length - 1;
      return open + parts.join(escapedReplace) + close;
    },
  );

  return { xml: result, count };
}

/**
 * Compute CRC-32 for a byte array (used by ZIP format).
 */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] ?? 0;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Build a minimal valid .docx file (ZIP archive) from an array of text paragraphs.
 * Uses STORE (no compression) for simplicity and reliability.
 */
export function buildDocx(paragraphs: string[]): Uint8Array {
  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '</Types>',
  ].join('');

  const rels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
    '</Relationships>',
  ].join('');

  const escapedParagraphs = paragraphs.map(text => {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<w:p><w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
  });

  const documentXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '<w:body>',
    ...escapedParagraphs,
    '</w:body>',
    '</w:document>',
  ].join('');

  return createZip([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rels],
    ['word/document.xml', documentXml],
  ]);
}

/**
 * Create a ZIP archive from an array of [filename, textContent] entries.
 * Uses STORE method (no compression).
 */
function createZip(files: [string, string][]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name);
    const contentBytes = encoder.encode(content);
    const crc = crc32(contentBytes);

    // Local file header (30 bytes) + name + content
    const local = new Uint8Array(30 + nameBytes.length + contentBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true); // STORE
    lv.setUint32(14, crc, true);
    lv.setUint32(18, contentBytes.length, true);
    lv.setUint32(22, contentBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(contentBytes, 30 + nameBytes.length);
    localParts.push(local);

    // Central directory entry (46 bytes) + name
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true); // STORE
    cv.setUint32(16, crc, true);
    cv.setUint32(20, contentBytes.length, true);
    cv.setUint32(24, contentBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const centralDirSize = centralParts.reduce((s, c) => s + c.length, 0);
  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralDirSize + 22;
  const result = new Uint8Array(total);
  let pos = 0;
  for (const part of localParts) {
    result.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    result.set(part, pos);
    pos += part.length;
  }
  result.set(endRecord, pos);
  return result;
}

/**
 * Create a ZIP archive from binary entries (ZipEntry[]).
 * Used by rebuildZip to repackage a modified .docx.
 */
function createZipFromBinary(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const contentBytes = entry.data;
    const crc = crc32(contentBytes);

    const local = new Uint8Array(30 + nameBytes.length + contentBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true); // STORE
    lv.setUint32(14, crc, true);
    lv.setUint32(18, contentBytes.length, true);
    lv.setUint32(22, contentBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(contentBytes, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true); // STORE
    cv.setUint32(16, crc, true);
    cv.setUint32(20, contentBytes.length, true);
    cv.setUint32(24, contentBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const centralDirSize = centralParts.reduce((s, c) => s + c.length, 0);
  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralDirSize + 22;
  const result = new Uint8Array(total);
  let pos = 0;
  for (const part of localParts) {
    result.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    result.set(part, pos);
    pos += part.length;
  }
  result.set(endRecord, pos);
  return result;
}
