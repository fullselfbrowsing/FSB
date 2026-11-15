// What the two vendored icon libraries define and which of it the showcase uses.
//
// The generator (build-icon-fonts.mjs) and the parity test (tests/icon-fonts-parity.test.js)
// both read the sources through this module, so an icon the test can see is an icon the
// generator would have shipped. Plain Node: no fontTools, nothing newer than Node 20.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ANGULAR_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SRC_DIR = join(ANGULAR_ROOT, 'src');
export const ICONS_DIR = join(SRC_DIR, 'styles/icons');
export const CSS_FILE = 'icons.generated.css';
export const MANIFEST_FILE = 'icons.manifest.json';

// Paths are relative to ICONS_DIR; `sources` says where each vendored file was downloaded
// from, relative to `baseUrl`. `styleClasses` are the classes that pick a font; their rules
// are always kept. Every other upstream class is kept only when the app uses it.
export const LIBRARIES = {
  fontAwesome: {
    name: 'Font Awesome Free',
    version: '6.6.0',
    homepage: 'https://fontawesome.com',
    css: 'upstream/font-awesome/all.min.css',
    fontDir: 'upstream/font-awesome',
    license: 'upstream/font-awesome/LICENSE.txt',
    publicLicense: 'font-awesome-free.txt',
    baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/',
    sources: {
      'upstream/font-awesome/all.min.css': 'css/all.min.css',
      'upstream/font-awesome/fa-solid-900.woff2': 'webfonts/fa-solid-900.woff2',
      'upstream/font-awesome/fa-regular-400.woff2': 'webfonts/fa-regular-400.woff2',
      'upstream/font-awesome/fa-brands-400.woff2': 'webfonts/fa-brands-400.woff2',
      'upstream/font-awesome/LICENSE.txt': 'https://raw.githubusercontent.com/FortAwesome/Font-Awesome/6.6.0/LICENSE.txt',
    },
    families: ['Font Awesome 6 Free', 'Font Awesome 6 Brands'],
    familyHint: /Font Awesome 6 (?:Free|Brands)|--fa-(?:font|style-family)/,
    styleClasses: ['fa', 'fas', 'far', 'fab', 'fa-solid', 'fa-regular', 'fa-brands', 'fa-classic', 'fa-sharp', 'fa-sharp-solid'],
    iconSelector: /^\.(fa-[a-z0-9-]+):before$/,
  },
  phosphor: {
    name: 'Phosphor Icons',
    version: '2.1.1',
    homepage: 'https://phosphoricons.com',
    css: 'upstream/phosphor/style.css',
    fontDir: 'upstream/phosphor',
    license: 'upstream/phosphor/LICENSE',
    publicLicense: 'phosphor-icons.txt',
    baseUrl: 'https://unpkg.com/@phosphor-icons/web@2.1.1/',
    sources: {
      'upstream/phosphor/style.css': 'src/regular/style.css',
      'upstream/phosphor/Phosphor.woff2': 'src/regular/Phosphor.woff2',
      'upstream/phosphor/LICENSE': 'LICENSE',
    },
    families: ['Phosphor'],
    familyHint: /font(?:-family)?\s*:[^;{}]*\bPhosphor\b/,
    styleClasses: ['ph'],
    iconSelector: /^\.ph\.(ph-[a-z0-9-]+):before$/,
  },
};

// Icon classes assembled at run time, which no scan of string literals can see whole. Each
// entry names the expression and says where its closed set of values comes from. The parity
// test fails on any string-built icon class that is not listed here.
export const DYNAMIC_ICON_CLASSES = [
  {
    file: 'src/app/pages/home/home-page.component.html',
    expression: "'fa-brands ' + browserIconClass",
    values: () => returnedClasses('src/app/pages/home/home-page.component.ts', 'detectBrowserIconClass'),
  },
];

/* ---------- CSS ---------- */

function skipString(css, at) {
  const quote = css[at];
  let i = at + 1;
  while (i < css.length && css[i] !== quote) i += css[i] === '\\' ? 2 : 1;
  return i;
}

/** Splits CSS into its top-level comments, rules and at-rules, keeping each one's exact text. */
export function splitCss(css) {
  const items = [];
  let i = 0;
  while (i < css.length) {
    if (/\s/.test(css[i])) { i += 1; continue; }
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2) + 2;
      items.push({ kind: 'comment', raw: css.slice(i, end) });
      i = end;
      continue;
    }
    const start = i;
    let depth = 0;
    let open = -1;
    for (; i < css.length; i += 1) {
      const c = css[i];
      if (c === '"' || c === "'") i = skipString(css, i);
      else if (c === '/' && css[i + 1] === '*') i = css.indexOf('*/', i + 2) + 1;
      else if (c === '{') { if (depth === 0) open = i; depth += 1; }
      else if (c === '}') { depth -= 1; if (depth === 0) { i += 1; break; } }
      else if (c === ';' && depth === 0) { i += 1; break; }
    }
    const raw = css.slice(start, i);
    if (open === -1) { items.push({ kind: 'statement', raw }); continue; }
    const prelude = css.slice(start, open).trim();
    items.push({ kind: prelude.startsWith('@') ? 'at' : 'rule', prelude, body: css.slice(open + 1, i - 1), raw });
  }
  return items;
}

export function selectorsOf(prelude) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < prelude.length; i += 1) {
    if (prelude[i] === '(') depth += 1;
    else if (prelude[i] === ')') depth -= 1;
    else if (prelude[i] === ',' && depth === 0) { out.push(prelude.slice(start, i).trim()); start = i + 1; }
  }
  out.push(prelude.slice(start).trim());
  return out;
}

export function classesIn(selector) {
  return [...selector.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]);
}

function contentCodepoint(body) {
  const m = /^\s*content\s*:\s*"(?:\\([0-9a-fA-F]{1,6})|([^"\\]))"\s*;?\s*$/u.exec(body);
  if (!m) return null;
  return m[1] ? parseInt(m[1], 16) : m[2].codePointAt(0);
}

function descriptor(body, name) {
  const m = new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;}]+)`).exec(body);
  return m ? m[1].trim() : '';
}

/**
 * Parses one upstream stylesheet. Every item keeps its raw text; icon rules, @font-face rules
 * and @keyframes are tagged so the generator can filter without rewriting anything it keeps.
 */
function parseLibrary(id) {
  const lib = LIBRARIES[id];
  const css = readFileSync(join(ICONS_DIR, lib.css), 'utf8');
  const items = splitCss(css);
  const icons = new Map();
  const classes = new Set();
  const fontFaces = [];
  const noteClasses = (prelude) => selectorsOf(prelude).forEach((s) => classesIn(s).forEach((c) => classes.add(c)));

  for (const item of items) {
    if (item.kind === 'rule') {
      noteClasses(item.prelude);
      const selectors = selectorsOf(item.prelude);
      const names = selectors.map((s) => (lib.iconSelector.exec(s) || [])[1]);
      const codepoint = contentCodepoint(item.body);
      if (codepoint !== null && names.every(Boolean)) {
        item.icon = { names, codepoint };
        for (const name of names) {
          if (icons.has(name) && icons.get(name) !== codepoint) throw new Error(`${lib.css}: ${name} has two codepoints`);
          icons.set(name, codepoint);
        }
      }
    } else if (item.kind === 'at' && item.prelude === '@font-face') {
      const family = descriptor(item.body, 'font-family').replace(/^["']|["']$/g, '');
      const url = (/url\(\s*["']?([^"')]+?\.woff2)["']?\s*\)/.exec(descriptor(item.body, 'src')) || [])[1] || '';
      item.fontFace = { family, weight: descriptor(item.body, 'font-weight'), file: url.split('/').pop() };
      fontFaces.push(item.fontFace);
    } else if (item.kind === 'at' && /^@keyframes\s/.test(item.prelude)) {
      item.keyframes = item.prelude.replace(/^@keyframes\s+/, '');
    } else if (item.kind === 'at') {
      item.rules = splitCss(item.body).filter((inner) => inner.kind === 'rule');
      item.rules.forEach((inner) => noteClasses(inner.prelude));
    }
  }
  if (icons.size === 0) throw new Error(`${lib.css}: no icon rules recognised`);
  const legacyFamilies = [...new Set(fontFaces.map((f) => f.family))].filter((f) => !lib.families.includes(f));
  return { id, ...lib, items, icons, classes, legacyFamilies };
}

export function loadUpstream() {
  return Object.fromEntries(Object.keys(LIBRARIES).map((id) => [id, parseLibrary(id)]));
}

/* ---------- sources ---------- */

const SOURCE_FILE = /\.(?:html|ts|scss)$/;

/** Every template, component and stylesheet the app compiles, as paths relative to showcase/angular. */
export function sourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { if (full !== ICONS_DIR) walk(full); }
      else if (SOURCE_FILE.test(entry.name) && !entry.name.endsWith('.spec.ts')) files.push(full);
    }
  };
  walk(SRC_DIR);
  return files.sort().map((full) => relative(ANGULAR_ROOT, full).split(sep).join('/'));
}

export function readSource(file) {
  return readFileSync(join(ANGULAR_ROOT, file), 'utf8');
}

/** The class-shaped words in a piece of text. `--fa-display` and `my-fa-x` stay one word each. */
export function wordsIn(text) {
  return new Set(text.match(/[A-Za-z0-9_-]+/g) || []);
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function enclosingBlock(text, index) {
  let depth = 0;
  let start = 0;
  for (let i = index; i >= 0; i -= 1) {
    if (text[i] === '}') depth += 1;
    else if (text[i] === '{') { if (depth === 0) { start = i; break; } depth -= 1; }
  }
  depth = 0;
  let end = text.length;
  for (let i = start + 1; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') { if (depth === 0) { end = i; break; } depth -= 1; }
  }
  return text.slice(start, end);
}

const isPrivateUse = (cp) => (cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000;
const blankComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));

// A partly written icon name ('fa-' + x, `ph-${x}`, fa-{{ x }}) or a font class joined to an
// expression ('fa-brands ' + x). The second form is fine when x only ever holds whole class
// names that appear as literals elsewhere, but that has to be checked by a person once.
const STRING_BUILT = [
  /(?<![\w-])(?:fa|ph)-(?:[a-z0-9]+-)*(?:['"`]\s*\+|\$\{|\{\{)/g,
  /(?<![\w-])(?:fa|fas|far|fab|ph|fa-(?:solid|regular|brands|classic))\s+(?:['"`]\s*\+|\$\{|\{\{)/g,
];

/** String-built icon classes in the sources, each with the line it sits on. */
export function findStringBuiltClasses(files = sourceFiles()) {
  const found = new Map();
  for (const file of files) {
    const text = readSource(file);
    for (const pattern of STRING_BUILT) {
      for (const m of text.matchAll(pattern)) {
        const line = lineOf(text, m.index);
        found.set(`${file}:${line}`, { file, line, text: text.split('\n')[line - 1].trim() });
      }
    }
  }
  return [...found.values()];
}

export function isAllowedStringBuilt(found) {
  return DYNAMIC_ICON_CLASSES.some((entry) => entry.file === found.file && found.text.includes(entry.expression));
}

/** The class names a function returns as string literals, e.g. detectBrowserIconClass(). */
export function returnedClasses(file, functionName) {
  const text = readSource(file);
  const start = text.search(new RegExp(`function\\s+${functionName}\\s*\\(`));
  if (start === -1) throw new Error(`${file}: function ${functionName} not found`);
  const end = text.indexOf('\n}', start);
  const body = text.slice(start, end === -1 ? text.length : end);
  const values = [...body.matchAll(/\breturn\s+(['"])([^'"]+)\1/g)].map((m) => m[2]);
  const returns = (body.match(/\breturn\b/g) || []).length;
  if (values.length === 0 || values.length !== returns) {
    throw new Error(`${file}: ${functionName} must return only string literals (${values.length} of ${returns} returns are)`);
  }
  return [...new Set(values)];
}

/**
 * Scans the sources once and reports, per library, the icons and other upstream classes in
 * use and the codepoints stylesheets write directly (`content: '\e61b'` next to an icon
 * font-family). `unresolved` lists references the scan cannot attribute; it must stay empty.
 */
export function collectUsage(upstream = loadUpstream(), files = sourceFiles()) {
  const usage = { libraries: {}, unresolved: [], dynamic: [] };
  for (const id of Object.keys(upstream)) usage.libraries[id] = { icons: new Map(), classes: new Set(), styleCodepoints: new Set() };

  const noteWord = (word) => {
    for (const [id, lib] of Object.entries(upstream)) {
      if (lib.icons.has(word)) usage.libraries[id].icons.set(word, lib.icons.get(word));
      else if (lib.classes.has(word) && !lib.styleClasses.includes(word)) usage.libraries[id].classes.add(word);
    }
  };

  for (const file of files) {
    const raw = readSource(file);
    wordsIn(raw).forEach(noteWord);

    const text = blankComments(raw);
    const unresolved = (index, why) => usage.unresolved.push({ file, line: lineOf(text, index), why });

    // `content: '\e61b'` in a stylesheet; inline component styles in a .ts file double the backslash.
    for (const m of text.matchAll(/content\s*:\s*['"]\\{1,2}([0-9a-fA-F]{1,6})\s?['"]/g)) {
      const codepoint = parseInt(m[1], 16);
      const block = enclosingBlock(text, m.index);
      const owner = Object.values(upstream).find((lib) => lib.familyHint.test(block));
      if (owner) usage.libraries[owner.id].styleCodepoints.add(codepoint);
      else if (isPrivateUse(codepoint)) unresolved(m.index, `content '\\${m[1]}' is a private-use codepoint but its rule names no icon font-family`);
    }
    if (!file.endsWith('.scss')) {
      for (const m of text.matchAll(/&#x([0-9a-fA-F]{4,6});|\\u\{?([0-9a-fA-F]{4,6})\}?/g)) {
        if (isPrivateUse(parseInt(m[1] || m[2], 16))) unresolved(m.index, `${m[0]} is a private-use codepoint written outside a stylesheet`);
      }
    }
    for (const m of text.matchAll(/[\ue000-\uf8ff]/g)) unresolved(m.index, 'a raw private-use character');
    for (const lib of Object.values(upstream)) {
      for (const family of lib.legacyFamilies) {
        const at = text.search(new RegExp(`["']${family}["']`));
        if (at !== -1) unresolved(at, `font-family "${family}" is an upstream alias the generated CSS does not declare`);
      }
    }
  }

  for (const entry of DYNAMIC_ICON_CLASSES) {
    const values = entry.values();
    usage.dynamic.push({ file: entry.file, expression: entry.expression, values });
    values.forEach(noteWord);
  }
  return usage;
}

/** The codepoints a library must be able to draw: its used icons plus what stylesheets write directly. */
export function usedCodepoints(libraryUsage) {
  return [...new Set([...libraryUsage.icons.values(), ...libraryUsage.styleCodepoints])].sort((a, b) => a - b);
}

export const hex = (codepoint) => codepoint.toString(16);
