#!/usr/bin/env node
// Phase 55 / CI-02..CI-04 -- Translation source-drift gate.
// Fails when any EN messages.xlf <source> text (keyed by trans-unit id) differs
// from the mirrored <source> in a target locale XLIFF. Ignores context-group /
// linenumber churn. Target locale list is derived from locale-constants.ts
// (never hardcoded). Orphan ids (in locale file but absent from EN) are
// WARNING-only so pre-existing 54-per-locale debt does not red the gate on day one.
//
// Usage (from showcase/angular/, matching verify-hreflang.mjs):
//   node scripts/verify-translation-drift.mjs
//
// Exit 0 = no source drift. Exit 1 = one or more drifted/missing ids.
// Exit 2 = tool failure (missing registry / unreadable XLIFF).

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const LOCALE_DIR = join(ROOT, 'src', 'locale');
const LOCALE_CONSTANTS_PATH = join(ROOT, 'src', 'app', 'core', 'i18n', 'locale-constants.ts');
const SOURCE_FILE = join(LOCALE_DIR, 'messages.xlf');

function extractLocales(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const match = text.match(/LOCALES\s*[:=]\s*\[([^\]]+)\]/);
  if (!match) {
    throw new Error(`Could not find LOCALES array literal in ${filePath}`);
  }
  return match[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function extractSourceLocale(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const match = text.match(/SOURCE_LOCALE\s*=\s*['"]([^'"]+)['"]/);
  if (!match) {
    throw new Error(`Could not find SOURCE_LOCALE in ${filePath}`);
  }
  return match[1];
}

function extractSourceMap(xliffText) {
  const map = new Map();
  const unitRe = /<trans-unit id="([^"]+)"[^>]*>([\s\S]*?)<\/trans-unit>/g;
  let m;
  while ((m = unitRe.exec(xliffText)) !== null) {
    const [, id, body] = m;
    const sourceMatch = /<source>([\s\S]*?)<\/source>/.exec(body);
    if (sourceMatch) map.set(id, sourceMatch[1].trim());
  }
  return map;
}

function main() {
  if (!existsSync(LOCALE_CONSTANTS_PATH)) {
    console.error(`FATAL: locale registry missing: ${LOCALE_CONSTANTS_PATH}`);
    process.exit(2);
  }
  if (!existsSync(SOURCE_FILE)) {
    console.error(`FATAL: EN XLIFF missing: ${SOURCE_FILE}`);
    process.exit(2);
  }

  let locales;
  let sourceLocale;
  try {
    locales = extractLocales(LOCALE_CONSTANTS_PATH);
    sourceLocale = extractSourceLocale(LOCALE_CONSTANTS_PATH);
  } catch (err) {
    console.error(`FATAL: ${(err && err.message) || err}`);
    process.exit(2);
  }

  const targetLocales = locales.filter((l) => l !== sourceLocale);
  if (targetLocales.length === 0) {
    console.error('FATAL: no target locales derived from locale registry');
    process.exit(2);
  }

  let sourceMap;
  try {
    sourceMap = extractSourceMap(readFileSync(SOURCE_FILE, 'utf8'));
  } catch (err) {
    console.error(`FATAL: cannot read/parse ${SOURCE_FILE}: ${(err && err.message) || err}`);
    process.exit(2);
  }

  const failures = [];
  const orphanWarnings = [];

  for (const locale of targetLocales) {
    const targetPath = join(LOCALE_DIR, `messages.${locale}.xlf`);
    if (!existsSync(targetPath)) {
      console.error(`FATAL: target XLIFF missing: ${targetPath}`);
      process.exit(2);
    }
    let targetMap;
    try {
      targetMap = extractSourceMap(readFileSync(targetPath, 'utf8'));
    } catch (err) {
      console.error(`FATAL: cannot read/parse ${targetPath}: ${(err && err.message) || err}`);
      process.exit(2);
    }

    for (const [id, enSource] of sourceMap) {
      const mirrored = targetMap.get(id);
      if (mirrored === undefined) {
        failures.push({ locale, id, reason: 'missing-trans-unit' });
      } else if (mirrored !== enSource) {
        failures.push({ locale, id, reason: 'source-drift' });
      }
    }

    for (const id of targetMap.keys()) {
      if (!sourceMap.has(id)) {
        orphanWarnings.push({ locale, id });
      }
    }
  }

  if (orphanWarnings.length > 0) {
    console.warn(
      `WARNING: ${orphanWarnings.length} orphaned (locale, id) pairs present in target XLIFF but absent from EN (informational; not a hard fail).`
    );
    const byLocale = new Map();
    for (const w of orphanWarnings) {
      byLocale.set(w.locale, (byLocale.get(w.locale) || 0) + 1);
    }
    for (const [locale, count] of byLocale) {
      console.warn(`  [${locale}] ${count} orphaned ids`);
    }
  }

  if (failures.length > 0) {
    console.error(
      `Translation drift detected: ${failures.length} (locale, id) pairs out of sync.`
    );
    const sample = failures.slice(0, 40);
    for (const f of sample) {
      console.error(`  [${f.locale}] ${f.id}: ${f.reason}`);
    }
    if (failures.length > sample.length) {
      console.error(`  ... and ${failures.length - sample.length} more`);
    }
    process.exit(1);
  }

  console.log(
    `Translation drift check passed: ${sourceMap.size} EN trans-units × ${targetLocales.length} locales (${targetLocales.join(', ')}), zero source drift.`
  );
  process.exit(0);
}

main();
