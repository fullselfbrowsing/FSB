#!/usr/bin/env node
/**
 * Extension catalog gate.
 *
 * Fails when any locale is missing a key, has an empty message, changes
 * placeholders, uses a $NAME$ token without a placeholders entry (Chrome
 * refuses to load such a catalog), copies English prose that is not on the
 * hash-bound allowlist, or drops a protected literal that the English message
 * contains.
 *
 * Usage:
 *   node scripts/verify-extension-i18n.mjs
 *   node scripts/verify-extension-i18n.mjs --root tests/fixtures/extension-i18n/bad-missing --locales en,es
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LOCALES = [
  ['en', 'en'],
  ['es', 'es'],
  ['de', 'de'],
  ['ja', 'ja'],
  ['ko', 'ko'],
  ['zh-CN', 'zh_CN'],
  ['zh-TW', 'zh_TW']
];
const PROTECTED = ['FSB', 'Full Self-Browsing', 'Chrome', 'Chrome Web Store'];

function arg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || !process.argv[idx + 1]) return fallback;
  return process.argv[idx + 1];
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function placeholders(message) {
  const found = new Set();
  const named = message.matchAll(/\$[A-Za-z_][A-Za-z0-9_]*\$/g);
  for (const match of named) found.add(match[0]);
  const numeric = message.matchAll(/\$\d+/g);
  for (const match of numeric) found.add(match[0]);
  return [...found].sort();
}

function undefinedPlaceholders(entry) {
  const defined = new Set(Object.keys((entry && entry.placeholders) || {})
    .filter((name) => typeof entry.placeholders[name]?.content === 'string')
    .map((name) => name.toLowerCase()));
  const missing = new Set();
  for (const match of entry.message.matchAll(/\$([A-Za-z0-9_@]+)\$/g)) {
    if (!defined.has(match[1].toLowerCase())) missing.add(match[0]);
  }
  return [...missing];
}

function sameSet(a, b) {
  return a.length === b.length && a.every((token, i) => token === b[i]);
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const catalogRoot = join(ROOT, arg('--root', 'extension/_locales'));
const localeArg = arg('--locales', '');
const locales = localeArg
  ? localeArg.split(',').map((pair) => {
      const [code, folder] = pair.split(':');
      return [code, folder || code];
    })
  : DEFAULT_LOCALES;

const errors = [];
const catalogs = new Map();

for (const [code, folder] of locales) {
  const path = join(catalogRoot, folder, 'messages.json');
  if (!existsSync(path)) {
    errors.push(`${code}: missing catalog ${path}`);
    continue;
  }
  let json;
  try {
    json = loadJson(path);
  } catch (err) {
    errors.push(`${code}: invalid JSON (${err.message})`);
    continue;
  }
  catalogs.set(code, json);
}

const allowPath = join(catalogRoot, 'same-source-allowlist.json');
const allowlist = existsSync(allowPath) ? loadJson(allowPath) : {};
const english = catalogs.get('en');

if (!english) {
  errors.push('en: source catalog missing');
} else {
  const sourceKeys = Object.keys(english).sort();
  for (const key of sourceKeys) {
    const source = english[key] && english[key].message;
    if (typeof source !== 'string' || source.length === 0) {
      errors.push(`en: ${key} has an empty message`);
      continue;
    }
    const sourceTokens = placeholders(source);
    for (const [code] of locales) {
      if (code === 'en') continue;
      const catalog = catalogs.get(code);
      if (!catalog) continue;
      if (!Object.prototype.hasOwnProperty.call(catalog, key)) {
        errors.push(`${code}: missing key ${key}`);
        continue;
      }
      const target = catalog[key] && catalog[key].message;
      if (typeof target !== 'string' || target.length === 0) {
        errors.push(`${code}: ${key} has an empty message`);
        continue;
      }
      const targetTokens = placeholders(target);
      if (!sameSet(sourceTokens, targetTokens)) {
        errors.push(`${code}: ${key} placeholders ${JSON.stringify(targetTokens)} != ${JSON.stringify(sourceTokens)}`);
      }
      if (target === source) {
        const expected = allowlist[key];
        if (expected !== sha256(source)) {
          errors.push(`${code}: ${key} copies English prose and is not on the hash-bound allowlist`);
        }
      }
      for (const term of PROTECTED) {
        if (source.includes(term) && !target.includes(term)) {
          errors.push(`${code}: ${key} dropped protected literal ${term}`);
        }
      }
    }
  }
  for (const [code] of locales) {
    if (code === 'en') continue;
    const catalog = catalogs.get(code);
    if (!catalog) continue;
    for (const key of Object.keys(catalog)) {
      if (!Object.prototype.hasOwnProperty.call(english, key)) {
        errors.push(`${code}: orphan key ${key}`);
      }
    }
  }
}

for (const [code, catalog] of catalogs) {
  for (const [key, entry] of Object.entries(catalog)) {
    if (!entry || typeof entry.message !== 'string') continue;
    for (const token of undefinedPlaceholders(entry)) {
      errors.push(`${code}: ${key} uses ${token} without a placeholders entry`);
    }
  }
}

if (errors.length) {
  console.error(`Extension i18n gate failed (${errors.length})`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Extension i18n gate passed (${locales.map(([code]) => code).join(', ')})`);
