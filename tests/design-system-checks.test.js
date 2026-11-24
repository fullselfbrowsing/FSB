/**
 * Design-system checks: proves the two gates can fail.
 *
 * scripts/verify-design-system.mjs and scripts/check-style-literals.mjs run in
 * npm test against the real repository, where they pass. This file feeds their
 * functions small inline fixtures, each built to trip one rule, so a gate that
 * silently accepts everything cannot pass here.
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const load = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

const tokenMap = (css, scope, lexCss, scopeKey) => {
  const out = new Map();
  for (const decl of lexCss(css).decls) {
    if (decl.prop.startsWith('--') && scopeKey(decl.context) === scope) out.set(decl.prop, { decl, file: 'fixture.css' });
  }
  return out;
};

async function main() {
  const css = await load('scripts/lib/design-css.mjs');
  const verify = await load('scripts/verify-design-system.mjs');
  const literals = await load('scripts/check-style-literals.mjs');
  const { lexCss, scopeKey, customProperties } = css;

  console.log('\n--- lexer ---');
  {
    const { decls } = lexCss(':root {\n  --a: #fff; /* proposed */\n  --b: url("x;y.svg");\n  --c: 1px\n    2px;\n}\n@media (max-width: 768px) {\n  :root { --a: #000; }\n}');
    const a = decls.find((d) => d.prop === '--a' && d.context.length === 1);
    check('a same-line comment attaches as trailing', a && a.trailing[0] === 'proposed', JSON.stringify(a));
    check('a semicolon inside url() does not split the declaration', decls.some((d) => d.prop === '--b' && d.value === 'url("x;y.svg")'), JSON.stringify(decls));
    check('multi-line values collapse to one line', decls.some((d) => d.prop === '--c' && d.value === '1px 2px'), JSON.stringify(decls));
    check('declarations inside @media carry the media header', decls.some((d) => d.prop === '--a' && scopeKey(d.context) === '@media (max-width: 768px) > :root'), JSON.stringify(decls.map((d) => d.context)));
    const scss = lexCss('// it\'s a note with #fff\n.a { color: red; // trailing #000\n}', { scss: true });
    check('SCSS line comments are not values', scss.decls.length === 1 && scss.decls[0].value === 'red', JSON.stringify(scss.decls));
  }

  console.log('\n--- token mirrors ---');
  {
    const shipped = customProperties(lexCss(':root { --x: #111111; --y: 4px; }').decls, ':root');
    const mirror = { name: 'fixture', shipped: 'shipped.css', mode: 'both' };
    const same = tokenMap(':root { --x: #111111; --y: 4px; --z: 1px; /* proposed */ }', ':root', lexCss, scopeKey);
    check('matching mirrors with a proposed extra pass', verify.compareMirror(mirror, same, shipped).length === 0, verify.compareMirror(mirror, same, shipped).join('; '));
    const changed = tokenMap(':root { --x: #222222; --y: 4px; }', ':root', lexCss, scopeKey);
    check('a value mismatch fails', verify.compareMirror(mirror, changed, shipped).some((e) => e.includes('--x')), 'no error for --x');
    const missing = tokenMap(':root { --x: #111111; }', ':root', lexCss, scopeKey);
    check('a shipped token missing from the design system fails', verify.compareMirror(mirror, missing, shipped).some((e) => e.includes('--y') && e.includes('missing')), 'no error for --y');
    const unmarked = tokenMap(':root { --x: #111111; --y: 4px; --z: 1px; }', ':root', lexCss, scopeKey);
    check('a design-system-only name without "proposed" fails', verify.compareMirror(mirror, unmarked, shipped).some((e) => e.includes('--z')), 'no error for --z');
    const stale = tokenMap(':root { --x: #111111; /* proposed */ --y: 4px; }', ':root', lexCss, scopeKey);
    check('"proposed" on a token that ships fails', verify.compareMirror(mirror, stale, shipped).some((e) => e.includes('proposed')), 'no error for the stale marker');
    const subset = { ...mirror, mode: 'subset' };
    check('subset mirrors ignore design-system extras', verify.compareMirror(subset, unmarked, shipped).length === 0, verify.compareMirror(subset, unmarked, shipped).join('; '));
  }

  console.log('\n--- overlay tokens ---');
  {
    const js = 'style.textContent = `\n.glow.on { --c1: #ff8c00; }\n.dup { color: #111111; }\n.dup { color: #222222; }\n`;';
    const ok = tokenMap('[s] { --t: #ff8c00; /* .glow.on --c1 */ }', '[s]', lexCss, scopeKey);
    check('an overlay token matching its source passes', verify.checkOverlayTokens(ok, js, 'fx.js').length === 0, verify.checkOverlayTokens(ok, js, 'fx.js').join('; '));
    const off = tokenMap('[s] { --t: #ff6600; /* .glow.on --c1 */ }', '[s]', lexCss, scopeKey);
    check('an overlay value mismatch fails', verify.checkOverlayTokens(off, js, 'fx.js').length === 1, 'no error');
    const bare = tokenMap('[s] { --t: #ff8c00; }', '[s]', lexCss, scopeKey);
    check('an overlay token without a source fails', verify.checkOverlayTokens(bare, js, 'fx.js').some((e) => e.includes('names no source')), 'no error');
    const dup = tokenMap('[s] { --t: #111111; /* .dup color */ }', '[s]', lexCss, scopeKey);
    check('an ambiguous source fails', verify.checkOverlayTokens(dup, js, 'fx.js').some((e) => e.includes('more than one value')), 'no error');
  }

  console.log('\n--- DESIGN.md front matter ---');
  {
    const bad = verify.parseFrontmatter('---\ncolors:\n  primary: #ff6b35\n---\n');
    check('an unquoted hex is caught (YAML reads it as a comment)', bad.errors.some((e) => e.includes('no value')), bad.errors.join('; '));
    const dup = verify.parseFrontmatter('---\ncolors:\n  a: "#fff"\n  a: "#000"\n---\n');
    check('a duplicate key fails', dup.errors.some((e) => e.includes('duplicate')), dup.errors.join('; '));
    const list = verify.parseFrontmatter('---\nomitted:\n  - spacing\n---\n');
    check('lists are rejected', list.errors.some((e) => e.includes('lists')), list.errors.join('; '));
    const tabs = verify.parseFrontmatter('---\ncolors:\n\tprimary: "#fff"\n---\n');
    check('tab indentation is rejected', tabs.errors.some((e) => e.includes('tabs')), tabs.errors.join('; '));
    const good = verify.parseFrontmatter('---\nname: X\ncolors:\n  primary: "#ff6b35" # brand\n  site:\n    dark:\n      surface: "#000000"\ncomponents:\n  button:\n    backgroundColor: "{colors.primary}"\n    border: "{colors.missing}"\n---\n');
    check('nested maps and quoted hex parse', good.errors.length === 0 && good.data.colors.site.dark.surface === '#000000' && good.data.colors.primary === '#ff6b35', good.errors.join('; '));
    const scopes = { site: tokenMap(':root { --primary: #ff6b35; --bg-body: #111111; }', ':root', lexCss, scopeKey) };
    const table = {
      'colors.primary': { scope: 'site', token: '--primary' },
      'colors.site.dark.surface': { scope: 'site', token: '--bg-body' }
    };
    const errors = verify.checkFrontmatter(good.data, scopes, table);
    check('a front-matter value that differs from its token fails', errors.some((e) => e.includes('colors.site.dark.surface')), errors.join('; '));
    check('a component reference to an undefined token fails', errors.some((e) => e.includes('{colors.missing}')), errors.join('; '));
    const unmapped = verify.checkFrontmatter({ colors: { primary: '#ff6b35', extra: '#123456' } }, scopes, { 'colors.primary': table['colors.primary'] });
    check('a front-matter token not tied to a design token fails', unmapped.some((e) => e.includes('colors.extra')), unmapped.join('; '));
    check('clamp() endpoints can be read', verify.pickValue('clamp(2rem, 5vw, 3.5rem)', 'clamp-min') === '2rem' && verify.pickValue('clamp(2rem, 5vw, 3.5rem)', 'clamp-max') === '3.5rem', 'pickValue');
  }

  console.log('\n--- specimen cards ---');
  {
    const scopes = {
      site: tokenMap(':root { --bg-body: #000000; }', ':root', lexCss, scopeKey),
      'site-light': new Map(), product: new Map(), 'product-dark': new Map(), overlay: new Map()
    };
    const card = '<span class="var">--bg-body</span><span class="lbl">#0a0a0a</span>';
    check('a card printing a stale value fails', verify.checkCardLabels('guidelines/x.card.html', card, scopes).length === 1, 'no error');
    const prose = '<span class="var">--bg-body</span><span class="lbl">black @ 0.5</span>';
    check('prose labels are skipped', verify.checkCardLabels('guidelines/x.card.html', prose, scopes).length === 0, 'unexpected error');
  }

  console.log('\n--- links, headings and decisions ---');
  {
    const exists = (p) => p === 'docs/real.md';
    const broken = verify.findBrokenLinks('docs/page.md', '[ok](real.md) [web](https://example.com) [gone](missing.md)\n```\n[skip](nowhere.md)\n```\n', exists);
    check('a broken relative link fails and fenced code is skipped', broken.length === 1 && broken[0].includes('missing.md'), broken.join('; '));
    const refs = verify.findBrokenReferences('DESIGN.md', 'see `@../outside.md` and `@docs/real.md`', exists);
    check('a DESIGN.md reference outside the repo fails', refs.length === 1 && refs[0].includes('outside'), refs.join('; '));
    const order = verify.checkHeadings('p.md', '## Rules\n## Specimens\n## Tokens\n', ['Rules', 'Tokens', 'Specimens']);
    check('required headings out of order fail', order.length === 1 && order[0].includes('Specimens'), order.join('; '));
    const adr = (number, status, extra = '') => ({
      file: `decisions/${number}-x.md`,
      text: `# ${number}. X\n\n- Status: ${status}\n- Date: 2026-01-01\n${extra}\n## Context and problem statement\n## Considered options\n## Decision outcome\n## Consequences\n## Evidence\n`
    });
    check('well-formed decisions pass', verify.checkDecisions([adr('0000', 'Accepted'), adr('0001', 'Proposed')]).length === 0,
      verify.checkDecisions([adr('0000', 'Accepted'), adr('0001', 'Proposed')]).join('; '));
    check('a repeated decision number fails', verify.checkDecisions([adr('0000', 'Accepted'), adr('0000', 'Accepted')]).some((e) => e.includes('used twice')), 'no error');
    check('a gap in decision numbers fails', verify.checkDecisions([adr('0000', 'Accepted'), adr('0002', 'Accepted')]).some((e) => e.includes('without gaps')), 'no error');
    check('an unknown status fails', verify.checkDecisions([adr('0000', 'Maybe')]).some((e) => e.includes('Status')), 'no error');
    check('a supersession needs the successor to say so', verify.checkDecisions([adr('0000', 'Superseded by 0001'), adr('0001', 'Accepted')]).some((e) => e.includes('Supersedes 0000')), 'no error');
  }

  console.log('\n--- raw-value ratchet ---');
  {
    const counted = literals.countCss('.a { color: #fff; /* #000 in a comment */ background: url("data:image/svg+xml,%23ff0000"); z-index: 10; font-family: "X", serif; }\n.b { color: rgba(0, 0, 0, 0.5); font-family: var(--font-mono); }\n@font-face { font-family: "Y"; }');
    check('colours count, comments and data URIs do not', counted.colors === 2, JSON.stringify(counted));
    check('integer z-index counts', counted.zIndex === 1, JSON.stringify(counted));
    check('literal font stacks count; var() and @font-face do not', counted.fontFamily === 1, JSON.stringify(counted));
    const scoped = literals.countCss(':root { --x: #111111; }\n.page { --y: #222222; color: var(--x); }', { mirrored: [':root'] });
    check('tokens in mirrored scopes are exempt, page-local ones fork', scoped.tokenForks === 1 && scoped.colors === 0, JSON.stringify(scoped));
    const marked = literals.countCss('.a { color: #fff; /* design-literal-ok: pinned by a test */ }');
    check('the exemption marker exempts one declaration', marked.colors === 0, JSON.stringify(marked));
    const script = literals.countScript("/* #abcdef in a comment */\nconst s = 'x&#9632;y';\nel.style.cssText = 'z-index:5;color:#ff8c00';\nconst id = '#add-button';");
    check('in scripts, entities, comments and ids are not colours', script.colors === 1 && script.zIndex === 1, JSON.stringify(script));
    const base = { 'a.css': { colors: 2, zIndex: 0, fontFamily: 0, tokenForks: 0 }, 'gone.css': { colors: 0, zIndex: 0, fontFamily: 0, tokenForks: 0 } };
    const rose = literals.compareToBaseline({ 'a.css': { colors: 3, zIndex: 0, fontFamily: 0, tokenForks: 0 } }, base);
    check('a raised count fails', rose.errors.some((e) => e.includes('rose from 2 to 3')), rose.errors.join('; '));
    check('a stale baseline entry fails', rose.errors.some((e) => e.includes('gone.css')), rose.errors.join('; '));
    const fell = literals.compareToBaseline({ 'a.css': { colors: 1, zIndex: 0, fontFamily: 0, tokenForks: 0 } }, { 'a.css': base['a.css'] });
    check('a fallen count fails until it is locked in', fell.errors.some((e) => e.includes('--write')), fell.errors.join('; '));
    const fresh = literals.compareToBaseline({ 'new.css': { colors: 1, zIndex: 0, fontFamily: 0, tokenForks: 0 } }, {});
    check('a new in-scope file must be added by hand', fresh.errors.some((e) => e.includes('new.css is new')), fresh.errors.join('; '));
    const lowered = literals.lowerBaseline({ 'a.css': { colors: 5, zIndex: 0, fontFamily: 0, tokenForks: 0 } }, base);
    check('--write never raises a count and drops files that left scope', lowered['a.css'].colors === 2 && !lowered['gone.css'], JSON.stringify(lowered));
  }

  console.log(`\n=== design-system-checks results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.log(`  FAIL: Test harness failed: ${error && error.stack ? error.stack : error}`);
  console.log(`\n=== design-system-checks results: ${passed} passed, ${failed + 1} failed ===`);
  process.exit(1);
});
