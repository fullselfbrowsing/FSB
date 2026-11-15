/**
 * Self-hosted icon fonts parity.
 *
 * The showcase draws its icons from subset copies of Font Awesome and Phosphor that
 * showcase/angular/scripts/build-icon-fonts.mjs generates by hand (it needs fontTools, which
 * CI and the build image do not have). This test is what notices that the generated files
 * have fallen behind the sources:
 *
 *   - an icon class or codepoint the app uses that the generated CSS and fonts do not carry;
 *   - a generated or vendored file that no longer matches the hash in the manifest;
 *   - an icon class assembled from strings at run time, which no scan can follow, unless it
 *     is listed in DYNAMIC_ICON_CLASSES together with the values it can take.
 *
 * It reads the sources through the same module the generator uses, so the two cannot disagree
 * about what counts as a use. Fix a failure with
 * `cd showcase/angular && node scripts/build-icon-fonts.mjs`.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const ANGULAR = path.join(ROOT, 'showcase/angular');
const REGENERATE = 'rerun node scripts/build-icon-fonts.mjs in showcase/angular';

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

function sha256(file) {
  return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : 'missing';
}

const list = (items, limit = 8) => items.slice(0, limit).join(', ') + (items.length > limit ? `, and ${items.length - limit} more` : '');
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const admitsSpace = (unicodeRange) => unicodeRange.split(',').some((part) => {
  const [from, to = from] = part.trim().replace(/^U\+/i, '').split('-').map((value) => parseInt(value, 16));
  return from <= 0x20 && to >= 0x20;
});

async function main() {
  const usageModule = await import(pathToFileURL(path.join(ANGULAR, 'scripts/icon-font-usage.mjs')).href);
  const { ICONS_DIR, CSS_FILE, MANIFEST_FILE } = usageModule;
  const manifest = JSON.parse(fs.readFileSync(path.join(ICONS_DIR, MANIFEST_FILE), 'utf8'));
  const css = fs.readFileSync(path.join(ICONS_DIR, CSS_FILE), 'utf8');
  const upstream = usageModule.loadUpstream();
  const usage = usageModule.collectUsage(upstream);

  console.log('\n--- vendored upstream files ---');
  for (const [id, lib] of Object.entries(manifest.upstream)) {
    for (const [file, record] of Object.entries(lib.files)) {
      check(`${file} is the file downloaded from ${new URL(record.url).host}`, sha256(path.join(ICONS_DIR, file)) === record.sha256, 'vendored files are never edited; restore it or regenerate after a deliberate upgrade');
    }
    check(`${id} manifest covers every vendored file`, Object.keys(upstream[id].sources).every((file) => lib.files[file]), REGENERATE);
  }

  console.log('\n--- generated files ---');
  for (const [file, record] of Object.entries(manifest.files)) {
    check(`${file} matches the manifest`, sha256(path.join(ICONS_DIR, file)) === record.sha256, `edited by hand or stale; ${REGENERATE}`);
  }
  for (const [file, record] of Object.entries(manifest.licenses)) {
    const served = sha256(path.join(ANGULAR, file));
    check(`${file} is the upstream license text`, served === record.sha256 && served === sha256(path.join(ICONS_DIR, record.from)), REGENERATE);
  }
  const faceCount = Object.values(manifest.libraries).reduce((sum, lib) => sum + lib.faces.length, 0);
  check('the stylesheet opens with the Font Awesome license banner', /^\/\*!\s+\* Font Awesome Free [\d.]+ by @fontawesome/.test(css), 'banner missing');
  check('each family is declared as full font then subset', (css.match(/@font-face/g) || []).length === faceCount * 2, `${(css.match(/@font-face/g) || []).length} @font-face rules for ${faceCount} faces`);
  for (const lib of Object.values(manifest.libraries)) {
    for (const face of lib.faces) {
      const full = css.indexOf(`url("./${face.full}")`);
      const subset = css.indexOf(`url("./${face.subset}")`);
      check(`${face.subset} follows ${face.full.split('/').pop()} with its unicode-range`, full !== -1 && subset > full && new RegExp(`unicode-range:\\s*${escapeRegExp(face.unicodeRange)}[;}]`).test(css.slice(subset)), REGENERATE);
      // A full face that admits U+20 is downloaded by Firefox and Safari on every page.
      check(`${face.full.split('/').pop()} leaves the space to its subset`, admitsSpace(face.unicodeRange) && !admitsSpace(face.fullUnicodeRange) && new RegExp(`unicode-range:\\s*${escapeRegExp(face.fullUnicodeRange)}[;}]`).test(css.slice(full, subset)), 'see FULL_RANGE in build-icon-fonts.mjs');
    }
  }

  console.log('\n--- every icon the app uses is generated ---');
  check('no icon reference is beyond the scan', usage.unresolved.length === 0, usage.unresolved.map((u) => `${u.file}:${u.line} ${u.why}`).join('; '));
  for (const [id, used] of Object.entries(usage.libraries)) {
    const generated = manifest.libraries[id];
    const name = manifest.upstream[id].name;
    const missingIcons = [...used.icons].filter(([icon, codepoint]) => generated.icons[icon] !== usageModule.hex(codepoint)).map(([icon]) => icon);
    check(`${name}: ${used.icons.size} icon classes in the sources are in the manifest`, missingIcons.length === 0, `${list(missingIcons)}; ${REGENERATE}`);

    const missingClasses = [...used.classes].filter((cls) => !generated.classes.includes(cls));
    check(`${name}: other upstream classes in use are in the manifest`, missingClasses.length === 0, `${list(missingClasses)}; ${REGENERATE}`);

    const drawn = new Set(generated.faces.flatMap((face) => face.codepoints));
    const missingGlyphs = usageModule.usedCodepoints(used).map(usageModule.hex).filter((cp) => !drawn.has(cp));
    check(`${name}: every used codepoint is in a subset font`, missingGlyphs.length === 0, `${list(missingGlyphs)}; ${REGENERATE}`);

    const withoutRule = [...used.icons.keys(), ...used.classes].filter((cls) => !new RegExp(`\\.${escapeRegExp(cls)}(?![\\w-])`).test(css));
    check(`${name}: the stylesheet has a rule for each of them`, withoutRule.length === 0, `${list(withoutRule)}; ${REGENERATE}`);
  }

  console.log('\n--- icon classes built from strings ---');
  const stringBuilt = usageModule.findStringBuiltClasses();
  const unlisted = stringBuilt.filter((found) => !usageModule.isAllowedStringBuilt(found));
  check('none outside DYNAMIC_ICON_CLASSES', unlisted.length === 0, `${unlisted.map((u) => `${u.file}:${u.line} ${u.text}`).join('; ')} -- use whole class names as string literals, or list the expression and its values in showcase/angular/scripts/icon-font-usage.mjs`);
  for (const entry of usage.dynamic) {
    const label = `${path.basename(entry.file)}: ${entry.expression}`;
    check(`${label} is still in the template`, stringBuilt.some((found) => found.file === entry.file && found.text.includes(entry.expression)), 'the expression moved or changed; update DYNAMIC_ICON_CLASSES');
    const unknown = entry.values.filter((value) => !Object.values(upstream).some((lib) => lib.icons.has(value)));
    check(`${label} only yields real icons (${entry.values.length})`, entry.values.length > 0 && unknown.length === 0, `not upstream icon classes: ${list(unknown)}`);
    const recorded = manifest.dynamic.find((other) => other.file === entry.file && other.expression === entry.expression);
    const unrecorded = entry.values.filter((value) => !recorded || !recorded.values.includes(value));
    check(`${label} yields nothing the generator did not see`, unrecorded.length === 0, `${list(unrecorded)}; ${REGENERATE}`);
  }

  console.log('\n--- wiring ---');
  const angularJson = JSON.parse(fs.readFileSync(path.join(ANGULAR, 'angular.json'), 'utf8'));
  const architect = angularJson.projects['showcase-angular'].architect;
  const iconCss = `src/styles/icons/${CSS_FILE}`;
  for (const target of ['build', 'test']) {
    const styles = architect[target].options.styles || [];
    check(`${target} loads the icon stylesheet before every other global style`, styles[0] === iconCss, `styles: ${JSON.stringify(styles)}`);
  }
  const remote = usageModule.sourceFiles().filter((file) => file.endsWith('.scss') && /@import\s+(?:url\()?\s*['"]?https?:\/\/[^'")]*(?:font-?awesome|phosphor)/i.test(usageModule.readSource(file)));
  check('no stylesheet imports an icon library from a CDN', remote.length === 0, list(remote));
  // These scripts are copied into the build as they are and are not scanned; that holds only while they draw no icons.
  const shipped = architect.build.options.assets.filter((asset) => asset.input === '../js').map((asset) => asset.glob);
  const drawing = shipped.filter((glob) => {
    const words = usageModule.wordsIn(fs.readFileSync(path.join(ROOT, 'showcase/js', glob), 'utf8'));
    return Object.values(upstream).some((lib) => [...lib.icons.keys()].some((icon) => words.has(icon)));
  });
  check(`the ${shipped.length} scripts copied from showcase/js use no icon classes`, drawing.length === 0, `${list(drawing)} -- add them to sourceFiles() in icon-font-usage.mjs`);

  console.log(`\n=== icon-fonts-parity results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.log(`  FAIL: Test harness failed: ${error && error.stack ? error.stack : error}`);
  console.log(`\n=== icon-fonts-parity results: ${passed} passed, ${failed + 1} failed ===`);
  process.exit(1);
});
