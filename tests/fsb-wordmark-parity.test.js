#!/usr/bin/env node
/**
 * FSB wordmark parity.
 *
 * The wordmark (a thin F, a black S and a hand-drawn SVG B) is defined once, in
 * showcase/angular/src/styles/fsb-wordmark.css. Copies of it have drifted before: three
 * different B heights, and a Poppins requested from Google Fonts that the site's CSP refuses,
 * so every logo on the site quietly rendered in the system font. This test fails as soon as
 * a copy drifts again:
 *
 *   1. markup     every <svg viewBox="-3 -3 78 103"> in the showcase templates and the
 *                 extension onboarding is class="fsb-b" with no inline style, draws the
 *                 canonical path, and follows .fsb-f and .fsb-s inside an .fsb-row;
 *   2. values     the shared sheet keeps the geometry (B 0.74em after a 0.01em gap) and the
 *                 Poppins Thin / Black weights;
 *   3. one source no other showcase stylesheet restyles the parts (letter-spacing on .fsb-row
 *                 is the one allowed override), and angular.json loads the sheet;
 *   4. fonts      the two single-glyph 'FSB Wordmark' faces are inline WOFF2 matching the
 *                 pinned hashes, and the Poppins license is served;
 *   5. CSP        font-src still allows data:, or the inline faces are refused;
 *   6. extension  onboarding.css keeps the same B and weights, with its bundled Poppins;
 *   7. charts     scripts/build-benchmark-assets.mjs draws the same B at the same scale.
 *
 * Fix a failure by making the copy match src/styles/fsb-wordmark.css, not the other way round.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ANGULAR = path.join(ROOT, 'showcase/angular');
const SHEET_REL = 'src/styles/fsb-wordmark.css';
const SHEET = path.join(ANGULAR, SHEET_REL);
const SHEET_HINT = `match showcase/angular/${SHEET_REL}`;

const B_VIEWBOX = '-3 -3 78 103';
const B_PATH = 'M0 0 L40 0 C58 0 70 10 70 26 C70 38 62 46 50 49 C64 51 72 60 72 74 C72 90 60 100 40 100 L0 100 Z';
const B_PATH_START = 'M0 0 L40 0 C58 0 70 10 70 26';

// sha256 of the decoded WOFF2 in each face's src. Rebuilding the subsets (command in the
// sheet's header) changes them; before updating a hash, confirm the face still maps only its
// one glyph (fontTools: TTFont(file).getBestCmap()).
const FACES = {
  100: { range: 'U+0046', glyph: 'F', sha256: '7a84d1a2b00499984ccd3db25f72f64a0779608b9282097c7dd2573fe8191cde' },
  900: { range: 'U+0053', glyph: 'S', sha256: '145c55a62b2d888d663b0e20b15d2de37b5a1794435b33854087453e917bfdca' },
};

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

const rel = (file) => path.relative(ROOT, file);
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function walk(dir, exts, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out);
    else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

// Innermost CSS/SCSS rule blocks with their declarations. Comments are dropped first; for SCSS
// nesting, the selector is the text after the last declaration of the enclosing block.
function cssRules(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const rules = [];
  for (const match of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = match[1].split(';').pop().trim();
    if (!selector || selector.startsWith('@')) continue;
    const decls = {};
    for (const decl of match[2].split(';')) {
      const at = decl.indexOf(':');
      if (at > 0) decls[decl.slice(0, at).trim()] = decl.slice(at + 1).trim();
    }
    rules.push({ selector, selectors: selector.split(',').map((s) => s.trim()), decls });
  }
  return rules;
}

const PART = /\.fsb-(row|f|s|b)(?![\w-])/;
const ruleFor = (rules, selector) => rules.filter((r) => r.selectors.includes(selector));
const quoteless = (value) => (value || '').replace(/["']/g, '');

// ---- 1. markup ---------------------------------------------------------------------------
console.log('\n1. Every wordmark uses the shared markup');
{
  const showcaseFiles = walk(path.join(ANGULAR, 'src'), ['.html', '.ts']);
  const extensionFiles = walk(path.join(ROOT, 'extension/ui'), ['.html', '.js']);
  const counts = { showcase: 0, extension: 0 };
  const problems = [];

  for (const [surface, files] of [['showcase', showcaseFiles], ['extension', extensionFiles]]) {
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      if (surface === 'showcase' && text.includes('rn-fsb-')) {
        problems.push(`${rel(file)} still uses rn-fsb-* letters; use .fsb-f / .fsb-s`);
      }
      // Any copy of the B path must sit in a canonical svg, so a pasted variant can't slip by.
      for (const m of text.matchAll(new RegExp(B_PATH_START, 'g'))) {
        const tagStart = text.lastIndexOf('<svg', m.index);
        const tag = text.slice(tagStart, text.indexOf('>', tagStart) + 1);
        if (tagStart < 0 || !tag.includes(`viewBox="${B_VIEWBOX}"`)) {
          problems.push(`${rel(file)}:${lineOf(text, m.index)} draws the B outside <svg viewBox="${B_VIEWBOX}">`);
        }
      }
      for (const m of text.matchAll(new RegExp(`viewBox="${B_VIEWBOX}"`, 'g'))) {
        const where = `${rel(file)}:${lineOf(text, m.index)}`;
        counts[surface] += 1;
        const tagStart = text.lastIndexOf('<svg', m.index);
        const tagEnd = text.indexOf('>', m.index) + 1;
        const tag = text.slice(tagStart, tagEnd);
        if (!/class="fsb-b"/.test(tag)) problems.push(`${where} svg is not class="fsb-b"`);
        if (/\sstyle=/.test(tag)) problems.push(`${where} svg has an inline style; its size comes from .fsb-b`);
        const d = /^\s*<path d="([^"]*)"/.exec(text.slice(tagEnd));
        if (!d || d[1] !== B_PATH) problems.push(`${where} B path differs from the canonical one`);
        const before = text.slice(Math.max(0, tagStart - 600), tagStart);
        const letters = surface === 'showcase'
          ? /<span class="fsb-f">\s*<\/span>\s*<span class="fsb-s">\s*<\/span>\s*$/
          : /<span class="fsb-f">F<\/span>\s*<span class="fsb-s">S<\/span>\s*$/;
        if (!letters.test(before)) {
          problems.push(surface === 'showcase'
            ? `${where} is not preceded by empty <span class="fsb-f"></span><span class="fsb-s"></span> (the letters come from CSS)`
            : `${where} is not preceded by <span class="fsb-f">F</span><span class="fsb-s">S</span>`);
        } else if (!/class="[^"]*\bfsb-row\b[^"]*"[^>]*>\s*<span class="fsb-f">[^<]*<\/span>\s*<span class="fsb-s">[^<]*<\/span>\s*$/.test(before)) {
          problems.push(`${where} letters are not directly inside an .fsb-row`);
        }
      }
    }
  }
  check(`found the wordmarks (${counts.showcase} showcase, ${counts.extension} extension)`,
    counts.showcase > 0 && counts.extension > 0, 'the scan found none; the markup or this test moved');
  check('every copy is fsb-row > fsb-f + fsb-s + svg.fsb-b with the canonical path and no inline geometry',
    problems.length === 0, `\n      ${problems.join('\n      ')}\n      Copy the markup from the header of showcase/angular/${SHEET_REL}`);
}

// ---- 2. values ---------------------------------------------------------------------------
console.log('\n2. The shared sheet keeps the geometry');
const sheetText = fs.existsSync(SHEET) ? fs.readFileSync(SHEET, 'utf8') : '';
check(`showcase/angular/${SHEET_REL} exists`, sheetText !== '', 'the wordmark has no definition');
{
  const rules = cssRules(sheetText);
  const one = (selector) => {
    const found = ruleFor(rules, selector);
    return found.length === 1 ? found[0].decls : null;
  };
  const row = one('.fsb-row');
  const f = one('.fsb-f');
  const fBefore = one('.fsb-f::before');
  const s = one('.fsb-s');
  const sBefore = one('.fsb-s::before');
  const b = one('.fsb-b');
  check('.fsb-row sets the FSB Wordmark family first, -0.02em spacing, baseline inline-flex',
    row && /^["']FSB Wordmark["']/.test(row['font-family'] || '') && row['letter-spacing'] === '-0.02em'
      && row.display === 'inline-flex' && row['align-items'] === 'baseline',
    `got ${JSON.stringify(row)}`);
  check('.fsb-f is weight 100 with content F', f && f['font-weight'] === '100' && fBefore && quoteless(fBefore.content) === 'F',
    `got ${JSON.stringify({ f, fBefore })}`);
  check('.fsb-s is weight 900 with content S', s && s['font-weight'] === '900' && sBefore && quoteless(sBefore.content) === 'S',
    `got ${JSON.stringify({ s, sBefore })}`);
  check('.fsb-b is 0.74em tall after a 0.01em gap, filled with currentColor, on the baseline',
    b && b.height === '0.74em' && b['margin-left'] === '0.01em' && b.fill === 'currentColor' && b['vertical-align'] === 'baseline',
    `got ${JSON.stringify(b)}; 0.74em puts the B's ink top (0.718em) level with Poppins Black's S (0.720em)`);
}

// ---- 3. one source -----------------------------------------------------------------------
console.log('\n3. Nothing else restyles the parts');
{
  const sheets = walk(path.join(ANGULAR, 'src'), ['.scss', '.css'])
    .filter((file) => file !== SHEET && !file.includes(`${path.sep}icons${path.sep}`));
  const problems = [];
  for (const file of sheets) {
    for (const rule of cssRules(fs.readFileSync(file, 'utf8'))) {
      const part = rule.selectors.map((sel) => PART.exec(sel)).find(Boolean);
      if (!part) continue;
      const props = Object.keys(rule.decls);
      const allowed = part[1] === 'row' && props.every((p) => p === 'letter-spacing');
      if (!allowed) problems.push(`${rel(file)}: "${rule.selector}" sets ${props.join(', ') || 'nothing'}`);
    }
  }
  check('no other showcase stylesheet declares .fsb-f / .fsb-s / .fsb-b, and .fsb-row only takes letter-spacing',
    problems.length === 0, `\n      ${problems.join('\n      ')}\n      Size and colour belong on the wrapper; the parts come from ${SHEET_REL}`);

  const angular = JSON.parse(fs.readFileSync(path.join(ANGULAR, 'angular.json'), 'utf8'));
  const missing = [];
  for (const [name, project] of Object.entries(angular.projects)) {
    for (const target of ['build', 'test']) {
      const styles = project.architect?.[target]?.options?.styles;
      if (styles && !styles.includes(SHEET_REL)) missing.push(`${name}:${target}`);
    }
  }
  check('angular.json loads the sheet in every build and test target', missing.length === 0,
    `${missing.join(', ')} does not list ${SHEET_REL} in options.styles`);
}

// ---- 4. fonts ----------------------------------------------------------------------------
console.log('\n4. The wordmark fonts are inline single-glyph Poppins');
{
  const faces = [...sheetText.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const wordmarkFaces = faces.filter((body) => /font-family:\s*["']FSB Wordmark["']/.test(body));
  check('the sheet declares exactly two FSB Wordmark faces and no other', faces.length === 2 && wordmarkFaces.length === 2,
    `found ${faces.length} @font-face rules, ${wordmarkFaces.length} for FSB Wordmark`);
  for (const [weight, want] of Object.entries(FACES)) {
    const body = wordmarkFaces.find((b) => new RegExp(`font-weight:\\s*${weight}\\s*;`).test(b)) || '';
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1].trim();
    const src = /src:\s*url\((["']?)data:font\/woff2;base64,([A-Za-z0-9+/=]+)\1\)\s*format\(["']woff2["']\)/.exec(body);
    const bytes = src ? Buffer.from(src[2], 'base64') : Buffer.alloc(0);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    check(`weight ${weight} carries only "${want.glyph}" (unicode-range ${want.range})`, range === want.range,
      `unicode-range is ${range || 'missing'}`);
    check(`weight ${weight} is an inline WOFF2 matching its pinned hash`,
      bytes.subarray(0, 4).toString('latin1') === 'wOF2' && hash === want.sha256 && bytes.length < 2048,
      src ? `sha256 ${hash}, ${bytes.length} bytes; rebuild with the command in the sheet's header, then update FACES here`
        : 'src is not url(data:font/woff2;base64,...) format(woff2); a hosted font would need its own CSP entry');
  }
  const license = path.join(ANGULAR, 'public/licenses/poppins.txt');
  const licenseText = fs.existsSync(license) ? fs.readFileSync(license, 'utf8') : '';
  check('the Poppins OFL is served at /licenses/poppins.txt',
    licenseText.includes('SIL OPEN FONT LICENSE Version 1.1') && licenseText.includes('The Poppins Project Authors'),
    `${rel(license)} is missing or is not the Poppins OFL`);
}

// ---- 5. CSP ------------------------------------------------------------------------------
console.log('\n5. The CSP admits the inline fonts');
{
  const server = fs.readFileSync(path.join(ROOT, 'showcase/server/server.js'), 'utf8');
  // The directive values hold single-quoted keywords ('self'), so the entry is a "..." string.
  const fontSrc = /"font-src ([^"]*)"/.exec(server)?.[1].split(/\s+/) || [];
  check("font-src in showcase/server/server.js includes data:", fontSrc.includes('data:'),
    `font-src is "${fontSrc.join(' ')}"; without data: the wordmark falls back to the system font`);
}

// ---- 6. extension ------------------------------------------------------------------------
console.log('\n6. The extension onboarding matches');
{
  const cssFile = path.join(ROOT, 'extension/ui/onboarding.css');
  const css = fs.readFileSync(cssFile, 'utf8');
  const rules = cssRules(css);
  const exact = (selector) => ruleFor(rules, selector).map((r) => r.decls);
  const [b] = exact('.fsb-b');
  const [f] = exact('.fsb-f');
  const [s] = exact('.fsb-s');
  const [row] = exact('.fsb-row');
  check('.fsb-b is 0.74em tall after a 0.01em gap', b && b.height === '0.74em' && b['margin-left'] === '0.01em',
    `got ${JSON.stringify(b)}; ${SHEET_HINT}`);
  check('.fsb-f is 100, .fsb-s is 900, .fsb-row is Poppins at -0.02em',
    f?.['font-weight'] === '100' && s?.['font-weight'] === '900'
      && /^["']Poppins["']/.test(row?.['font-family'] || '') && row?.['letter-spacing'] === '-0.02em',
    `got ${JSON.stringify({ f, s, row })}; ${SHEET_HINT}`);
  const others = rules.filter((r) => r.selectors.some((sel) => PART.test(sel))
    && !['.fsb-row', '.fsb-f', '.fsb-s', '.fsb-b'].includes(r.selector));
  check('no other onboarding rule restyles the parts', others.length === 0,
    others.map((r) => `"${r.selector}"`).join(', '));
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1])
    .filter((body) => /font-family:\s*["']Poppins["']/.test(body));
  for (const weight of ['100', '900']) {
    const body = faces.find((x) => new RegExp(`font-weight:\\s*${weight}\\s*;`).test(x)) || '';
    const url = /url\(["']?([^"')]+)["']?\)/.exec(body)?.[1];
    const file = url && path.resolve(path.dirname(cssFile), url);
    check(`Poppins ${weight} is declared and its bundled font exists`, Boolean(file && fs.existsSync(file)),
      url ? `${url} does not resolve to a file` : `no Poppins ${weight} @font-face in onboarding.css`);
  }
}

// ---- 7. charts ---------------------------------------------------------------------------
console.log('\n7. The benchmark charts draw the same mark');
{
  const script = fs.readFileSync(path.join(ROOT, 'scripts/build-benchmark-assets.mjs'), 'utf8');
  const glyphB = /const GLYPH_B = '([^']+)'/.exec(script)?.[1];
  check('GLYPH_B is the canonical B path', glyphB === B_PATH, 'scripts/build-benchmark-assets.mjs GLYPH_B differs');
  check('wordmark() scales the B to 0.74em after a 0.01em gap',
    /const bScale = \(0\.74 \* size\) \/ 103;/.test(script) && /const bWidth = \(0\.74 \* size \* 78\) \/ 103;/.test(script)
      && /\+ 0\.01 \* size/.test(script),
    `the B scale or gap in wordmark()/wordmarkWidth() changed; ${SHEET_HINT}`);
}

console.log(`\nfsb-wordmark-parity: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
