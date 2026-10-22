/**
 * Online-Mind2Web benchmark parity.
 *
 * The leaderboard on the showcase home page, the README chart, the social card, the home
 * page's structured data and the llms crawler files all state the same result. Their numbers
 * come from showcase/angular/src/app/core/seo/online-mind2web.json; this test fails when any
 * of them drifts from that file or from the wording the site uses for the result.
 *
 * Regenerate the artwork with `node scripts/build-benchmark-assets.mjs --og`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

const RESULT_NOTE = 'Other values are transcribed from the leaderboard.';
// The project never describes this result with the past participle of "assist"; it is built
// from parts so this file does not contain it either.
const FORBIDDEN_TERM = new RegExp(`\\b${['as', 'sisted'].join('')}\\b`, 'i');
const METHOD_NOTE = 'Evaluation methods differ; numerical placement is illustrative, not an official leaderboard ranking.';

function pngSize(file) {
  const bytes = fs.readFileSync(file);
  const signature = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { signature, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function main() {
  const assets = await import(pathToFileURL(path.join(ROOT, 'scripts/build-benchmark-assets.mjs')).href);
  const data = assets.loadBenchmark();
  const { leaderboard, fsb } = data;
  const percent = (score) => `${score.toFixed(1)}%`;
  const result = `AI-reviewed result (${fsb.passed}/${fsb.total})`;

  console.log('\n--- data ---');
  check('ten leaderboard rows', leaderboard.length === 10, `${leaderboard.length} rows`);
  const scores = leaderboard.map((row) => row.score);
  check('rows are sorted by score', scores.every((score, i) => i === 0 || scores[i - 1] >= score), scores.join(', '));
  const fsbRows = leaderboard.filter((row) => row.fsb);
  check('exactly one FSB row', fsbRows.length === 1, `${fsbRows.length} FSB rows`);
  check('FSB score equals passed/total', fsbRows[0] && fsbRows[0].score === assets.fsbScore(data), `${fsbRows[0] && fsbRows[0].score} vs ${assets.fsbScore(data)}`);
  check('agent names are unique', new Set(leaderboard.map((row) => row.name)).size === leaderboard.length, 'duplicate agent name');

  console.log('\n--- README artwork ---');
  for (const [theme, file] of Object.entries(assets.SVG_PATHS)) {
    const committed = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    check(`${theme} SVG matches the generator`, committed === assets.renderBenchmarkSvg(data, theme), `rerun node scripts/build-benchmark-assets.mjs (${path.relative(ROOT, file)})`);
    check(`${theme} SVG states the FSB result`, committed.includes(result), result);
    // The README prose stays short; the chart is where its readers see the site's two caveats.
    check(`${theme} SVG carries both site notes`, committed.includes(RESULT_NOTE) && committed.includes(METHOD_NOTE), 'note missing');
    check(`${theme} SVG honors reduced motion`, committed.includes('prefers-reduced-motion'), 'missing reduced-motion rule');
  }
  const og = pngSize(assets.OG_PATH);
  check('social card is a 1200x630 PNG', og.signature && og.width === 1200 && og.height === 630, `${og.width}x${og.height}`);

  console.log('\n--- README ---');
  const readme = read('README.md');
  check('README links the benchmark from the hero', readme.includes('[Benchmark](#benchmark)') && readme.includes('](#benchmark)\n'), 'nav link or badge missing');
  check('README has a Benchmark section', /^## Benchmark$/m.test(readme), 'missing ## Benchmark');
  for (const theme of ['dark', 'light']) {
    check(`README picture uses the ${theme} SVG`, readme.includes(`srcset="docs/assets/online-mind2web-${theme}.svg"`), `${theme} source missing`);
  }
  for (const [index, row] of leaderboard.entries()) {
    const rank = String(index + 1).padStart(2, '0');
    const line = row.fsb ? `| **${rank}** | **FSB** | **${percent(row.score)}** |` : `| ${rank} | ${row.name} | ${percent(row.score)} |`;
    check(`README table row ${rank}`, readme.includes(line), line);
  }
  check('README states the result with its report link', readme.includes(`[${result}](${data.reportUrl})`), result);

  console.log('\n--- showcase ---');
  const home = read('showcase/angular/src/app/pages/home/home-page.component.ts');
  const template = read('showcase/angular/src/app/pages/home/home-page.component.html');
  check('home leaderboard reads the shared JSON', home.includes("import ONLINE_MIND2WEB from '../../core/seo/online-mind2web.json';") && home.includes('= ONLINE_MIND2WEB.leaderboard;'), 'home component no longer imports the JSON');
  check('home social image is the benchmark card', home.includes('`${HOST}/assets/og/online-mind2web.png`'), 'OG_IMAGE changed');
  check('home title leads with the score', home.includes(`${percent(fsbRows[0].score)} on ${data.name}`), 'meta title');
  check('home structured data restates the result', home.includes(`'@id': \`\${HOST}/#online-mind2web\``) && home.includes(`FSB: ${result}, ${percent(fsbRows[0].score)}.`), 'Dataset node');
  check('visible leaderboard links match the JSON', template.includes(`href="${data.leaderboardUrl}"`) && template.includes(`href="${data.resultsUrl}"`), 'template links drifted from the JSON');

  console.log('\n--- crawler files ---');
  for (const file of ['showcase/angular/scripts/llms.source.md', 'showcase/angular/scripts/llms-full.source.md', 'showcase/angular/public/llms.txt', 'showcase/angular/public/llms-full.txt']) {
    const text = read(file);
    check(`${path.basename(file)} states the result`, text.includes(result) && text.includes(percent(fsbRows[0].score)), result);
    check(`${path.basename(file)} carries the method note`, text.includes(METHOD_NOTE), 'method note missing');
    check(`${path.basename(file)} lists every agent`, leaderboard.every((row) => text.includes(row.name) && text.includes(percent(row.score))), 'agent missing');
  }
  check('robots.txt points crawlers at llms.txt', read('showcase/angular/public/robots.txt').includes('https://full-selfbrowsing.com/llms.txt'), 'pointer missing');

  console.log('\n--- wording ---');
  const surfaces = {
    'README.md': readme,
    'online-mind2web.json': read('showcase/angular/src/app/core/seo/online-mind2web.json'),
    'build-benchmark-assets.mjs': read('scripts/build-benchmark-assets.mjs'),
    'online-mind2web-dark.svg': fs.readFileSync(assets.SVG_PATHS.dark, 'utf8'),
    'online-mind2web-light.svg': fs.readFileSync(assets.SVG_PATHS.light, 'utf8'),
    'llms.source.md': read('showcase/angular/scripts/llms.source.md'),
    'llms-full.source.md': read('showcase/angular/scripts/llms-full.source.md'),
    'home-page.component.ts': home,
  };
  for (const [name, text] of Object.entries(surfaces)) {
    check(`${name} avoids the retired result wording`, !FORBIDDEN_TERM.test(text), 'use "AI-reviewed", as the site does');
  }

  console.log(`\n=== benchmark-assets-parity results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.log(`  FAIL: Test harness failed: ${error && error.stack ? error.stack : error}`);
  console.log(`\n=== benchmark-assets-parity results: ${passed} passed, ${failed + 1} failed ===`);
  process.exit(1);
});
