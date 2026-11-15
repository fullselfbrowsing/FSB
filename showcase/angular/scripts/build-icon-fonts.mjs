#!/usr/bin/env node
// Builds the self-hosted icon fonts and their stylesheet from the vendored upstream files.
//
// The site used to @import Font Awesome and Phosphor from two CDNs: about 175 kB of CSS
// and 450 kB of fonts for the hundred-odd icons it draws. This script keeps only what the
// sources use and must not change a pixel doing it:
//
//   - rules are copied from the upstream CSS verbatim, in upstream order, never rewritten;
//   - each font is subset with fontTools, then compared with the original glyph by glyph
//     and table by table (icon-font-inspect.py); any difference aborts the run;
//   - every family is declared twice: the full upstream font first, then the subset with the
//     unicode-range of its glyphs, so a glyph outside the subset still renders (from the full
//     font, which a browser fetches only then; FULL_RANGE below is what keeps it unfetched).
//
//   node scripts/build-icon-fonts.mjs
//
// Run by hand after adding an icon; tests/icon-fonts-parity.test.js says when that is
// needed. It is not part of the build because the build image has no fontTools:
//   pip install fonttools brotli        (set PYTHON if it is not `python3`)
//
// Inputs, in src/styles/icons/upstream/ (to upgrade, replace them from the same URLs at the
// new version and update LIBRARIES in icon-font-usage.mjs):
//   https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css
//   https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/webfonts/fa-{solid-900,regular-400,brands-400}.woff2
//   https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/{style.css,Phosphor.woff2}
// Outputs: src/styles/icons/{icons.generated.css,icons.manifest.json,*.subset.woff2} and
// the license texts in public/licenses/, which the site serves at /licenses/.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ANGULAR_ROOT,
  CSS_FILE,
  ICONS_DIR,
  MANIFEST_FILE,
  classesIn,
  collectUsage,
  findStringBuiltClasses,
  hex,
  isAllowedStringBuilt,
  loadUpstream,
  selectorsOf,
  usedCodepoints,
} from './icon-font-usage.mjs';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const PYTHON = process.env.PYTHON || 'python3';
const SPACE = 0x20;

// -I keeps Python from importing anything that sits beside the fonts or this script.
function python(args) {
  try {
    return execFileSync(PYTHON, ['-I', ...args], { cwd: tmpdir(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`${PYTHON} ${args[0]} failed. fontTools and brotli are required (pip install fonttools brotli).\n${error.stderr || error.message}`);
  }
}

function inspect(font, subset) {
  return JSON.parse(python([join(SCRIPTS_DIR, 'icon-font-inspect.py'), font, ...(subset ? [subset] : [])]));
}

// pyftsubset, told to leave alone everything it would otherwise tidy: all layout features
// and name records stay (Phosphor's ligatures, both fonts' copyright and license strings),
// the .notdef outline stays, and nothing font-wide is recalculated, so hhea, OS/2 and the
// bounding box read exactly as upstream and a line of text is the same height either way.
function subsetFont(source, target, codepoints) {
  python([
    '-m', 'fontTools.subset', source,
    `--unicodes=${codepoints.map(hex).join(',')}`,
    `--output-file=${target}`,
    '--flavor=woff2',
    '--layout-features=*',
    '--notdef-outline',
    '--name-IDs=*', '--name-languages=*', '--name-legacy',
    '--no-prune-unicode-ranges', '--no-prune-codepage-ranges',
    '--no-recalc-bounds', '--no-recalc-average-width', '--no-recalc-max-context', '--no-recalc-timestamp',
    // FontForge's timestamp table; fontTools cannot subset it and nothing reads it.
    '--drop-tables+=FFTM',
  ]);
}

const fileRecord = (path) => {
  const data = readFileSync(path);
  return { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
};
const iconFile = (file) => fileRecord(join(ICONS_DIR, file));

/**
 * Subsets every face of a library into workDir. An icon codepoint goes into each face that
 * has a glyph for it, so `fa-solid fa-copy` and `fa-regular fa-copy` both work without this
 * script having to know which style a template asked for.
 */
function buildFaces(lib, codepoints, workDir) {
  const faces = [];
  const drawn = new Set();
  for (const item of lib.items) {
    if (!item.fontFace || !lib.families.includes(item.fontFace.family)) continue;
    const { family, weight, file } = item.fontFace;
    const full = `${lib.fontDir}/${file}`;
    const available = new Set(inspect(join(ICONS_DIR, full)).codepoints);
    const wanted = codepoints.filter((cp) => available.has(cp));
    wanted.forEach((cp) => drawn.add(cp));
    // Phosphor draws a space, Font Awesome does not; the subset follows upstream either way.
    const glyphs = available.has(SPACE) ? [SPACE, ...wanted] : wanted;

    const subset = file.replace(/\.woff2$/, '.subset.woff2');
    const built = join(workDir, subset);
    subsetFont(join(ICONS_DIR, full), built, glyphs);
    const report = inspect(join(ICONS_DIR, full), built);
    const got = report.subset.codepoints;
    if (got.length !== glyphs.length || got.some((cp, i) => cp !== glyphs[i])) {
      throw new Error(`${subset}: asked for ${glyphs.length} codepoints, the subset maps ${got.length}`);
    }
    if (report.subset.differences.length) {
      throw new Error(`${subset} would not render like ${full}:\n  ${report.subset.differences.join('\n  ')}`);
    }
    faces.push({ item, family, weight, full, subset, built, codepoints: wanted, fontTools: report.fontTools });
  }
  const missing = codepoints.filter((cp) => !drawn.has(cp));
  if (missing.length) throw new Error(`${lib.name}: no font has a glyph for ${missing.map((cp) => `U+${hex(cp).toUpperCase()}`).join(', ')}`);
  return faces;
}

// Which face owns the space decides what gets downloaded. A browser takes a family's line
// metrics from the first face whose unicode-range admits U+20, and Firefox and Safari go on
// to fetch every face that admits it until one has the glyph (Font Awesome has none). So the
// subset claims the space, whether or not it can draw one, and the full font gives it up:
// measuring an icon then needs the subset alone, and its metrics are upstream's.
const FULL_RANGE = 'U+0-1F,U+21-10FFFF';

function unicodeRange(codepoints) {
  return [SPACE, ...codepoints].map((cp) => `U+${hex(cp).toUpperCase()}`).join(',');
}

// The upstream @font-face with its src pointed at a local file and a unicode-range added.
// Every other descriptor, font-display included, stays as upstream wrote it.
function fontFaceRules(item, face) {
  const pretty = item.raw.includes('\n');
  const rule = (file, range) => item.raw
    .replace(/src\s*:\s*[^;}]+/, `src:${pretty ? ' ' : ''}url("./${file}") format("woff2")`)
    .replace(/;?\s*}$/, pretty ? `;\n  unicode-range: ${range};\n}` : `;unicode-range:${range}}`);
  return [rule(face.full, FULL_RANGE), rule(face.subset, unicodeRange(face.codepoints))];
}

/** The upstream rules this app needs, each as upstream wrote it, in upstream order. */
function renderLibrary(lib, used, faces) {
  const active = new Set([...lib.styleClasses, ...used.icons.keys(), ...used.classes]);
  const matches = (prelude) => selectorsOf(prelude).some((selector) => classesIn(selector).every((name) => active.has(name)));

  const kept = [];
  for (const item of lib.items) {
    if (item.kind === 'comment') {
      kept.push(item.raw);
    } else if (item.fontFace) {
      const face = faces.find((candidate) => candidate.item === item);
      if (face) kept.push(...fontFaceRules(item, face));
    } else if (item.keyframes) {
      kept.push(item);
    } else if (item.icon) {
      const names = item.icon.names.filter((name) => used.icons.has(name));
      if (names.length === item.icon.names.length) kept.push(item.raw);
      // An upstream rule lists every alias of a glyph; keep the ones in use, nothing else.
      else if (names.length) kept.push(item.raw.replace(item.prelude, selectorsOf(item.prelude).filter((s) => names.includes(lib.iconSelector.exec(s)[1])).join(',')));
    } else if (item.kind === 'rule') {
      if (matches(item.prelude)) kept.push(item.raw);
    } else if (item.rules) {
      if (item.rules.some((rule) => matches(rule.prelude))) kept.push(item.raw);
    } else {
      throw new Error(`${lib.css}: do not know whether to keep "${item.raw.slice(0, 60)}"`);
    }
  }
  // Keyframes ride along only with a kept rule that plays them.
  const text = kept.filter((entry) => typeof entry === 'string').join('\n');
  return kept
    .filter((entry) => typeof entry === 'string' || new RegExp(`animation(?:-name)?\\s*:[^;}]*\\b${entry.keyframes}\\b`).test(text))
    .map((entry) => (typeof entry === 'string' ? entry : entry.raw));
}

// Font Awesome's stylesheet opens with its own banner. Phosphor's has none, so write one
// from its LICENSE file.
function banner(lib, rules) {
  if (rules[0].startsWith('/*!')) return rules.shift();
  const license = readFileSync(join(ICONS_DIR, lib.license), 'utf8').split('\n');
  const copyright = license.find((line) => /^Copyright/.test(line));
  return `/*!\n * ${lib.name} ${lib.version} - ${lib.homepage}\n * License - ${license[0].trim()}\n * ${copyright.trim()}\n */`;
}

function renderCss(upstream, usage, faces) {
  const libraries = Object.values(upstream);
  const out = [];
  for (const lib of libraries) {
    const rules = renderLibrary(lib, usage.libraries[lib.id], faces[lib.id]);
    out.push(banner(lib, rules));
    if (lib === libraries[0]) {
      out.push(
        '/* Generated by scripts/build-icon-fonts.mjs from the files in ./upstream. Do not edit; rerun',
        ` * the script. The production build drops comments, so the license texts also ship as`,
        ` * ${libraries.map((l) => `/licenses/${l.publicLicense}`).join(' and ')}. */`,
      );
    }
    out.push(...rules, '');
  }
  return out.join('\n');
}

function main() {
  const upstream = loadUpstream();
  const usage = collectUsage(upstream);
  if (usage.unresolved.length) {
    throw new Error(`Icon references the scan cannot resolve:\n${usage.unresolved.map((u) => `  ${u.file}:${u.line} ${u.why}`).join('\n')}`);
  }
  const unlisted = findStringBuiltClasses().filter((found) => !isAllowedStringBuilt(found));
  if (unlisted.length) {
    throw new Error(`String-built icon classes (list them in DYNAMIC_ICON_CLASSES with their values):\n${unlisted.map((u) => `  ${u.file}:${u.line} ${u.text}`).join('\n')}`);
  }

  const workDir = mkdtempSync(join(tmpdir(), 'icon-fonts-'));
  const faces = {};
  try {
    for (const [id, lib] of Object.entries(upstream)) faces[id] = buildFaces(lib, usedCodepoints(usage.libraries[id]), workDir);
    // Nothing is replaced until every subset has passed its comparison.
    for (const face of Object.values(faces).flat()) renameSync(face.built, join(ICONS_DIR, face.subset));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  writeFileSync(join(ICONS_DIR, CSS_FILE), renderCss(upstream, usage, faces));

  const manifest = {
    generator: 'showcase/angular/scripts/build-icon-fonts.mjs',
    fontTools: faces.fontAwesome[0].fontTools,
    upstream: {},
    libraries: {},
    dynamic: usage.dynamic,
    files: {},
    licenses: {},
  };
  mkdirSync(join(ANGULAR_ROOT, 'public/licenses'), { recursive: true });
  for (const [id, lib] of Object.entries(upstream)) {
    const used = usage.libraries[id];
    manifest.upstream[id] = {
      name: lib.name,
      version: lib.version,
      files: Object.fromEntries(Object.entries(lib.sources).map(([file, url]) => [file, { url: new URL(url, lib.baseUrl).href, ...iconFile(file) }])),
    };
    manifest.libraries[id] = {
      icons: Object.fromEntries([...used.icons].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, cp]) => [name, hex(cp)])),
      classes: [...used.classes].sort(),
      styleCodepoints: [...used.styleCodepoints].sort((a, b) => a - b).map(hex),
      faces: faces[id].map((face) => ({
        family: face.family,
        weight: face.weight,
        full: face.full,
        fullUnicodeRange: FULL_RANGE,
        subset: face.subset,
        codepoints: face.codepoints.map(hex),
        unicodeRange: unicodeRange(face.codepoints),
      })),
    };
    for (const face of faces[id]) manifest.files[face.subset] = iconFile(face.subset);

    const served = `public/licenses/${lib.publicLicense}`;
    copyFileSync(join(ICONS_DIR, lib.license), join(ANGULAR_ROOT, served));
    manifest.licenses[served] = { from: lib.license, ...fileRecord(join(ANGULAR_ROOT, served)) };
  }
  manifest.files[CSS_FILE] = iconFile(CSS_FILE);
  writeFileSync(join(ICONS_DIR, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);

  for (const [id, lib] of Object.entries(upstream)) {
    console.log(`${lib.name} ${lib.version}: ${usage.libraries[id].icons.size} icon classes`);
    for (const face of faces[id]) {
      console.log(`  ${face.subset}  ${face.codepoints.length} icon glyphs  ${iconFile(face.subset).bytes} B  (full ${iconFile(face.full).bytes} B)`);
    }
  }
  const upstreamCss = Object.values(upstream).reduce((sum, lib) => sum + iconFile(lib.css).bytes, 0);
  console.log(`${CSS_FILE}  ${iconFile(CSS_FILE).bytes} B  (upstream CSS ${upstreamCss} B)`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
