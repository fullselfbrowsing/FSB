#!/usr/bin/env node
/**
 * Coverage gate for package-owned extension chrome.
 *
 * Fails when an in-scope UI file contains an English sentence that is not an
 * English catalog message and is not producer-owned (user text, model output,
 * page DOM, secrets, or logs) or a provider name. Static HTML text must also
 * sit inside a data-i18n (or translate="no") element, because apply() only
 * translates keyed nodes. Text and labelled attributes in markup that JS
 * builds must go through a locale helper, for the same reason.
 *
 * Usage:
 *   node scripts/verify-extension-copy.mjs
 *   node scripts/verify-extension-copy.mjs --file tests/fixtures/extension-i18n/bad-sentence/ui.js
 */
import { readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCOPE = [
  'extension/ui/sidepanel.html',
  'extension/ui/sidepanel.js',
  'extension/ui/popup.html',
  'extension/ui/popup.js',
  'extension/ui/options.js',
  'extension/ui/control_panel.html',
  'extension/ui/onboarding.html',
  'extension/ui/onboarding.js',
  'extension/ui/unlock.html',
  'extension/ui/unlock.js',
  'extension/ui/microphone-permission.html',
  'extension/ui/microphone-permission.js',
  'extension/content/visual-feedback.js'
];

const UNTRANSLATED = new Set([
  'CVV / CVC'
]);

const PROVIDERS = new Set([
  'xAI (Grok)',
  'Google Gemini',
  'OpenAI',
  'Anthropic (Claude)',
  'OpenRouter',
  'LM Studio',
  'Claude Code',
  'Grok Build',
  'OpenClaw',
  'Google AI Studio',
  'Claude Routines',
  'Google AI Studio'
]);

const BRANDS = new Set([
  'FSB',
  'Discord',
  'GitHub'
]);

function arg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || !process.argv[idx + 1]) return '';
  return process.argv[idx + 1];
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function decodeJs(body) {
  return body
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, ' ')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\`/g, '`')
    .replace(/\\u2019/g, '’')
    .replace(/\\u00d7/gi, '×')
    .replace(/\\u2026/g, '…');
}

const MARKUP = /<\/?[A-Za-z]/;
const REGEX_KEYWORDS = /^(?:return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await|instanceof)$/;

// A slash after an operator, punctuation, or keyword opens a regex literal.
// After a value (name, number, `)` or `]`) it is division.
function regexAllowed(source, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(source[j])) j -= 1;
  if (j < 0) return true;
  if (/[(,=:[!&|?{};+\-*%<>~^]/.test(source[j])) return true;
  const word = source.slice(Math.max(0, j - 12), j + 1).match(/[A-Za-z_$]+$/);
  return Boolean(word && REGEX_KEYWORDS.test(word[0]));
}

function skipRegex(source, start) {
  let i = start + 1;
  let inClass = false;
  while (i < source.length && source[i] !== '\n') {
    const c = source[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
    } else if (c === '[') {
      inClass = true;
    } else if (c === '/') {
      i += 1;
      while (/[a-z]/.test(source[i] || '')) i += 1;
      return i;
    }
    i += 1;
  }
  // No closing slash on the line, so it was division after all.
  return start + 1;
}

// index is the opening quote or backtick, which isLog() looks behind; rawIndex
// is where body starts in the source.
function pushJsText(found, body, index, rawIndex) {
  const text = decodeJs(body).replace(/\s+/g, ' ').trim();
  if (text) found.push({ text, index, raw: body, rawIndex });
}

function scanQuoted(source, start, found) {
  const quote = source[start];
  let i = start + 1;
  let body = '';
  while (i < source.length && source[i] !== quote && source[i] !== '\n') {
    if (source[i] === '\\') {
      body += source[i] + (source[i + 1] || '');
      i += 2;
      continue;
    }
    body += source[i];
    i += 1;
  }
  if (source[i] === quote) pushJsText(found, body, start, start + 1);
  return i + 1;
}

function scanTemplate(source, start, found) {
  let i = start + 1;
  let partStart = i;
  let body = '';
  while (i < source.length && source[i] !== '`') {
    if (source[i] === '\\') {
      body += source[i] + (source[i + 1] || '');
      i += 2;
      continue;
    }
    if (source[i] === '$' && source[i + 1] === '{') {
      pushJsText(found, body, start, partStart);
      body = '';
      // Strings inside ${...} render too (option labels, status lines).
      i = scanJs(source, i + 2, found, true);
      partStart = i;
      continue;
    }
    body += source[i];
    i += 1;
  }
  pushJsText(found, body, start, partStart);
  return i + 1;
}

// Walks code once, skipping comments and regex literals, so a quote or `//`
// inside either cannot shift the scan. With nested set, returns just past the
// `}` that closes a template ${...} expression.
function scanJs(source, start, found, nested) {
  let i = start;
  let depth = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (c === '/' && regexAllowed(source, i)) {
      i = skipRegex(source, i);
      continue;
    }
    if (c === "'" || c === '"') {
      i = scanQuoted(source, i, found);
      continue;
    }
    if (c === '`') {
      i = scanTemplate(source, i, found);
      continue;
    }
    if (nested) {
      if (c === '{') {
        depth += 1;
      } else if (c === '}') {
        if (depth === 0) return i + 1;
        depth -= 1;
      }
    }
    i += 1;
  }
  return i;
}

function extractJsStrings(source) {
  const found = [];
  scanJs(source, 0, found, false);
  return found;
}

function labelledAttrs(source) {
  const found = [];
  const attr = /(?:aria-label|placeholder|title|alt)="([^"]+)"/g;
  let match;
  while ((match = attr.exec(source))) {
    found.push({ kind: 'attr', text: decodeEntities(match[1]).replace(/\s+/g, ' ').trim(), index: match.index });
  }
  return found;
}

function extractHtmlStrings(source) {
  const withoutScripts = source.replace(/<script[\s\S]*?<\/script>/gi, (block) => ' '.repeat(block.length)).replace(/<style[\s\S]*?<\/style>/gi, (block) => ' '.repeat(block.length));
  const found = labelledAttrs(withoutScripts);
  let match;
  // Open elements whose text is keyed (data-i18n) or deliberately left
  // untranslated (translate="no").
  const i18nDepth = [];
  const token = /<!--[\s\S]*?-->|<\/([A-Za-z0-9]+)>|<([A-Za-z0-9]+)([^>]*)>|([^<]+)/g;
  while ((match = token.exec(withoutScripts))) {
    if (match[0].startsWith('<!--')) continue;
    if (match[1]) {
      const name = match[1].toLowerCase();
      for (let n = i18nDepth.length - 1; n >= 0; n -= 1) {
        if (i18nDepth[n] === name) {
          i18nDepth.splice(n, 1);
          break;
        }
      }
      continue;
    }
    if (match[2]) {
      const name = match[2].toLowerCase();
      const selfClosing = /\/$/.test(match[3] || '') || /^(img|input|br|hr|meta|link)$/.test(name);
      if (!selfClosing && /\b(?:data-i18n=|translate="no")/.test(match[3] || '')) i18nDepth.push(name);
      continue;
    }
    if (i18nDepth.length > 0) continue;
    const value = decodeEntities(match[4] || '').replace(/\s+/g, ' ').trim();
    if (value) found.push({ kind: 'text', text: value, index: match.index });
  }
  return found;
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/&rarr;/g, '→')
    .replace(/&times;/g, '×')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function isProse(text) {
  if (!text || text.includes('<') || text.includes('>')) return false;
  if (PROVIDERS.has(text) || UNTRANSLATED.has(text)) return false;
  // A sentence may open with a placeholder, e.g. "$NAME$ API key is required".
  if (!/^(?:[A-Z]|\$[A-Z][A-Z0-9_]*\$)/.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  if (/^https?:\/\//.test(text)) return false;
  if (/^[A-Z0-9_]{6,}$/.test(text)) return false;
  return true;
}

// Static HTML text that reads as UI copy, including short labels such as
// "Clear Logs". Brand names, domains, paths, counters, and all-caps tokens
// are not copy.
function isHtmlCopy(text) {
  if (!text || /[<>]/.test(text) || text.startsWith('!')) return false;
  // A trailing separator does not make a token copy ("MCP ·").
  const core = text.replace(/[\s·:|,;]+$/, '');
  if (PROVIDERS.has(core) || UNTRANSLATED.has(core) || BRANDS.has(core)) return false;
  if ((core.match(/[A-Za-z]/g) || []).length < 2) return false;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(core)) return false;
  if (/^\/\S*$/.test(core)) return false;
  if (/^[\d.,:]+\s*[A-Za-z%]{0,3}$/.test(core)) return false;
  if (/^[A-Z0-9_]{2,}$/.test(core)) return false;
  return true;
}

// Template parts split at ${...} can open inside a tag (`" id="x">`) or end
// inside one (`<input value="`). Drop those partial tags before tokenizing.
function trimPartialTags(text) {
  let start = 0;
  let end = text.length;
  const firstOpen = text.indexOf('<');
  const firstClose = text.indexOf('>');
  if (firstClose !== -1 && (firstOpen === -1 || firstClose < firstOpen)) start = firstClose + 1;
  const lastOpen = text.lastIndexOf('<');
  if (lastOpen >= start && lastOpen > text.lastIndexOf('>')) end = lastOpen;
  return { text: text.slice(start, end), offset: start };
}

// Text and labelled attributes in markup that JS builds. Raw markup text is
// never translated, so a catalog match does not count; it must go through a
// locale helper (or sit in a data-i18n / translate="no" element).
function markupCopy(item) {
  const out = [];
  const add = (seg, base, lead) => {
    const value = decodeJs(seg.text).replace(/\s+/g, ' ').trim();
    if (isHtmlCopy(value)) out.push({ text: value, index: base + seg.index + lead });
  };
  // Attributes are read from the whole part: a closed title="..." after a
  // ${...} value still sits in the partial tag that trimming drops.
  for (const seg of labelledAttrs(item.raw)) add(seg, item.rawIndex, 0);
  const { text, offset } = trimPartialTags(item.raw);
  for (const seg of extractHtmlStrings(text)) {
    if (seg.kind !== 'text') continue;
    add(seg, item.rawIndex + offset, Math.max(0, text.slice(seg.index).search(/\S/)));
  }
  return out.sort((a, b) => a.index - b.index);
}

function isLog(source, index) {
  const before = source.slice(Math.max(0, index - 280), index);
  if (/(?:console|logger|automationLogger)\s*\.\s*(?:log|warn|error|debug|info)\s*\([^)]*$/.test(before)) return true;
  if (/addLog\s*\(\s*['"`][^'"`]+['"`]\s*,\s*$/.test(before)) return true;
  if (/showDebugOutput\s*\(\s*$/.test(before)) return true;
  if (/_sendControl\s*\(/.test(before) && /\}\s*,\s*$/.test(before)) return true;
  return false;
}

function loadEnglish() {
  const json = JSON.parse(readFileSync(join(ROOT, 'extension/_locales/en/messages.json'), 'utf8'));
  const messages = new Set();
  for (const entry of Object.values(json)) {
    if (entry && typeof entry.message === 'string') {
      messages.add(entry.message);
      messages.add(entry.message.trim());
    }
  }
  return messages;
}

export function findUncataloged(files, catalog) {
  const misses = [];
  for (const file of files) {
    const raw = readFileSync(join(ROOT, file), 'utf8');
    const isHtml = file.endsWith('.html');
    // The JS scanner skips comments itself and needs the raw source to tell
    // a regex literal from a comment.
    const source = isHtml ? stripComments(raw) : raw;
    const lineAt = (index) => source.slice(0, index).split('\n').length;
    const items = isHtml ? extractHtmlStrings(source) : extractJsStrings(source);
    for (const item of items) {
      if (item.kind === 'text') {
        // apply() only translates static text through a data-i18n hook, so a
        // catalog match alone leaves the text in English.
        if (isHtmlCopy(item.text)) misses.push({ file, line: lineAt(item.index), text: item.text, reason: 'unwired chrome (needs data-i18n)' });
        continue;
      }
      if (item.raw !== undefined && MARKUP.test(item.raw)) {
        if (isLog(source, item.index)) continue;
        for (const seg of markupCopy(item)) {
          misses.push({ file, line: lineAt(seg.index), text: seg.text, reason: 'unwired chrome in markup (route through the locale helper)' });
        }
        continue;
      }
      if (!isProse(item.text)) continue;
      if (isLog(source, item.index)) continue;
      if (catalog.has(item.text)) continue;
      misses.push({ file, line: lineAt(item.index), text: item.text, reason: 'uncataloged chrome' });
    }
  }
  return misses;
}

function main() {
  const only = arg('--file');
  const files = only ? [only] : SCOPE;
  const catalog = loadEnglish();
  const misses = findUncataloged(files, catalog);
  if (misses.length === 0) {
    console.log(`extension copy coverage passed (${files.length} file${files.length === 1 ? '' : 's'})`);
    return;
  }
  for (const miss of misses) {
    console.error(`${relative(ROOT, miss.file)}:${miss.line}: ${miss.reason}: ${miss.text}`);
  }
  console.error(`${misses.length} package-owned string${misses.length === 1 ? '' : 's'} not cataloged or not wired`);
  process.exit(1);
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) main();
