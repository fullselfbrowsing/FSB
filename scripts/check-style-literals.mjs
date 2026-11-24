#!/usr/bin/env node
/**
 * Ratchet on raw style values in shipped UI code.
 *
 * Counts four things in each in-scope file:
 *   colors      colour literals (#hex, rgb[a](), hsl[a]()) in declarations
 *   zIndex      integer z-index values
 *   fontFamily  literal font-family stacks (var(), inherit and @font-face skipped)
 *   tokenForks  colour literals inside custom properties declared outside the
 *               token blocks that design-system/tokens mirrors (page-local
 *               palettes and per-page dark overrides)
 *
 * The counts must equal design-system/style-literals.baseline.json exactly. A rise
 * means new raw values: use a token (see DESIGN.md), or put a comment that starts
 * with `design-literal-ok:` and a reason inside or right after the declaration.
 * A fall means the baseline is stale: run with --write to lock the improvement in.
 * --write never raises a count; raising one is a hand edit that shows in review.
 *
 * Not counted: url() bodies and data URIs (SVG fills there cannot use var()),
 * inline style attributes and <style> blocks in HTML, and the legacy showcase/css.
 *
 * Usage:
 *   node scripts/check-style-literals.mjs           check (what npm test runs)
 *   node scripts/check-style-literals.mjs --write   lower counts that fell, drop deleted files
 *   node scripts/check-style-literals.mjs --init    write a first baseline (refuses to overwrite)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COLOR_FUNCTION, HEX_COLOR, countColors, hasMarker, lexCss, scopeKey } from './lib/design-css.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE = 'design-system/style-literals.baseline.json';
export const METRICS = ['colors', 'zIndex', 'fontFamily', 'tokenForks'];
const EXEMPT = 'design-literal-ok:';

/** Token blocks mirrored by design-system/tokens: naming a value there is the point. */
export const MIRRORED_SCOPES = {
  'showcase/angular/src/styles.scss': [':root', '[data-theme="light"]', '@media (max-width: 768px) > :root'],
  'extension/shared/fsb-ui-core.css': [':root', '[data-theme="dark"]'],
  'extension/ui/onboarding.css': [':root', '[data-theme="light"]']
};

/** Shipped files whose CSS lives inside JavaScript strings. */
export const SCRIPT_FILES = ['extension/content/visual-feedback.js'];

const FONT_KEYWORDS = /^(var\(|inherit$|initial$|unset$|revert$|revert-layer$)/i;

function zeroCounts() {
  return { colors: 0, zIndex: 0, fontFamily: 0, tokenForks: 0 };
}

/** Counts raw values in a stylesheet. */
export function countCss(text, { scss = false, mirrored = [] } = {}) {
  const counts = zeroCounts();
  for (const decl of lexCss(text, { scss }).decls) {
    if (hasMarker(decl, EXEMPT)) continue;
    const prop = decl.prop.toLowerCase();
    if (prop.startsWith('--')) {
      if (!mirrored.includes(scopeKey(decl.context))) counts.tokenForks += countColors(decl.value);
      continue;
    }
    counts.colors += countColors(decl.value);
    if (prop === 'z-index' && /^-?\d+$/.test(decl.value.replace(/!important/i, '').trim())) counts.zIndex += 1;
    if (prop === 'font-family'
      && !decl.context.some((header) => /^@font-face\b/i.test(header))
      && !FONT_KEYWORDS.test(decl.value.trim())) {
      counts.fontFamily += 1;
    }
  }
  return counts;
}

/**
 * Counts raw values in a script that writes CSS into strings. Comments and
 * lines that carry the exemption marker are removed first, then HTML entities
 * (&#9632;) so they cannot read as colours.
 */
export function countScript(text) {
  const counts = zeroCounts();
  const cleaned = text
    .split('\n')
    .filter((line) => !line.includes(EXEMPT))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/&#x?[0-9a-fA-F]+;/g, ' ');
  counts.colors = (cleaned.match(HEX_COLOR) || []).length + (cleaned.match(COLOR_FUNCTION) || []).length;
  counts.zIndex = (cleaned.match(/z-index\s*:\s*-?\d+/gi) || []).length
    + (cleaned.match(/\.zIndex\s*=\s*['"`]?-?\d+/g) || []).length
    + (cleaned.match(/setProperty\(\s*['"]z-index['"]\s*,\s*['"`]?-?\d+/g) || []).length;
  counts.fontFamily = (cleaned.match(/font-family\s*:\s*(?!var\(|inherit|initial|unset|revert)/gi) || []).length
    + (cleaned.match(/\.fontFamily\s*=\s*['"`](?!var\()/g) || []).length;
  return counts;
}

function listDir(relDir, predicate, recursive) {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(join(ROOT, dir))) return;
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const child = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (recursive) walk(child);
      } else if (predicate(child)) {
        out.push(child);
      }
    }
  };
  walk(relDir);
  return out;
}

/** Every file the ratchet covers, sorted. */
export function scopeFiles() {
  return [
    ...listDir('extension/ui', (file) => file.endsWith('.css'), false),
    ...listDir('extension/shared', (file) => file.endsWith('.css'), false),
    ...listDir('showcase/angular/src', (file) => file.endsWith('.scss'), true),
    ...SCRIPT_FILES.filter((file) => existsSync(join(ROOT, file)))
  ].sort();
}

export function countFile(file, text) {
  if (SCRIPT_FILES.includes(file)) return countScript(text);
  return countCss(text, { scss: file.endsWith('.scss'), mirrored: MIRRORED_SCOPES[file] || [] });
}

export function measure() {
  const out = {};
  for (const file of scopeFiles()) out[file] = countFile(file, readFileSync(join(ROOT, file), 'utf8'));
  return out;
}

/**
 * Compares current counts with the baseline.
 * @returns {{ errors: string[], lowered: string[] }}
 */
export function compareToBaseline(current, baseline) {
  const errors = [];
  const lowered = [];
  for (const [file, counts] of Object.entries(current)) {
    const base = baseline[file];
    if (!base) {
      const found = METRICS.filter((metric) => counts[metric] > 0).map((metric) => `${metric} ${counts[metric]}`);
      errors.push(`${file} is new and not in ${BASELINE}${found.length ? ` (it has ${found.join(', ')})` : ''}; use tokens, then add an entry by hand`);
      continue;
    }
    for (const metric of METRICS) {
      const now = counts[metric];
      const was = base[metric] ?? 0;
      if (now > was) {
        errors.push(`${file}: ${metric} rose from ${was} to ${now}; use a token (DESIGN.md), or mark the declaration with "${EXEMPT} <reason>"`);
      } else if (now < was) {
        lowered.push(`${file}: ${metric} fell from ${was} to ${now}`);
      }
    }
  }
  for (const file of Object.keys(baseline)) {
    if (!current[file]) errors.push(`${BASELINE} lists ${file}, which is no longer in scope; run node scripts/check-style-literals.mjs --write`);
  }
  if (lowered.length) {
    errors.push(...lowered.map((line) => `${line}; lock it in with node scripts/check-style-literals.mjs --write`));
  }
  return { errors, lowered };
}

/** The baseline --write produces: lower counts that fell, drop files that left scope. */
export function lowerBaseline(current, baseline) {
  const next = {};
  for (const [file, base] of Object.entries(baseline)) {
    if (!current[file]) continue;
    next[file] = {};
    for (const metric of METRICS) next[file][metric] = Math.min(base[metric] ?? 0, current[file][metric]);
  }
  return next;
}

function serialize(files) {
  const sorted = Object.fromEntries(Object.keys(files).sort().map((file) => [file, files[file]]));
  return `${JSON.stringify({
    about: 'Raw style values per file, held by scripts/check-style-literals.mjs. Counts may only go down; see DESIGN.md.',
    files: sorted
  }, null, 2)}\n`;
}

function readBaseline() {
  const path = join(ROOT, BASELINE);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')).files;
}

function main() {
  const args = process.argv.slice(2);
  const current = measure();
  const baseline = readBaseline();

  if (args.includes('--init')) {
    if (baseline) {
      console.error(`${BASELINE} already exists; use --write to lower it`);
      process.exit(1);
    }
    writeFileSync(join(ROOT, BASELINE), serialize(current));
    console.log(`check-style-literals: wrote ${BASELINE} for ${Object.keys(current).length} files`);
    return;
  }

  if (!baseline) {
    console.error(`check-style-literals: ${BASELINE} is missing; create it once with --init`);
    process.exit(1);
  }

  if (args.includes('--write')) {
    writeFileSync(join(ROOT, BASELINE), serialize(lowerBaseline(current, baseline)));
    console.log(`check-style-literals: lowered ${BASELINE} where counts fell`);
  }

  const { errors } = compareToBaseline(current, args.includes('--write') ? readBaseline() : baseline);
  if (errors.length) {
    console.error(`check-style-literals: ${errors.length} problem(s)`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  const totals = zeroCounts();
  for (const counts of Object.values(current)) for (const metric of METRICS) totals[metric] += counts[metric];
  console.log(`check-style-literals: ok, ${Object.keys(current).length} files at baseline `
    + `(colors ${totals.colors}, zIndex ${totals.zIndex}, fontFamily ${totals.fontFamily}, tokenForks ${totals.tokenForks})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
