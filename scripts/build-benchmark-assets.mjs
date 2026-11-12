#!/usr/bin/env node
// Draws the Online-Mind2Web leaderboard from the showcase home page as standalone
// artwork: an animated dark/light SVG pair for the README and a static 1200x630 social card.
// Every number comes from showcase/angular/src/app/core/seo/online-mind2web.json, the same
// file the home page renders, so the three can only change together.
//
//   node scripts/build-benchmark-assets.mjs        writes docs/assets/online-mind2web-{dark,light}.svg
//   node scripts/build-benchmark-assets.mjs --og   also renders showcase/assets/og/online-mind2web.png
//                                                  (needs Chrome; set CHROME_PATH if it is not in /Applications)
//
// tests/benchmark-assets-parity.test.js regenerates the SVGs in memory and fails if the
// committed files differ, so rerun this script after editing the JSON or the drawing code.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_PATH = join(ROOT, 'showcase/angular/src/app/core/seo/online-mind2web.json');
export const SVG_PATHS = {
  dark: join(ROOT, 'docs/assets/online-mind2web-dark.svg'),
  light: join(ROOT, 'docs/assets/online-mind2web-light.svg'),
};
export const OG_PATH = join(ROOT, 'showcase/assets/og/online-mind2web.png');
const OG_SIZE = { width: 1200, height: 630 };

export function loadBenchmark() {
  return JSON.parse(readFileSync(DATA_PATH, 'utf8'));
}

// Colors are the showcase theme tokens (showcase/angular/src/styles.scss) and the leaderboard
// rules in home-page.component.scss.
const THEMES = {
  dark: {
    body: '#000000',
    text: '#f1f5f9',
    secondary: '#94a3b8',
    muted: '#64748b',
    border: 'rgba(255,255,255,0.08)',
  },
  light: {
    body: '#ffffff',
    text: '#0f172a',
    secondary: '#475569',
    muted: '#64748b',
    border: 'rgba(0,0,0,0.08)',
  },
};
const PRIMARY = '#ff6b35';
const FSB_ORANGE = '#e04e12';
const FSB_ORANGE_END = '#f26a1b';
const BAR = 'rgba(148,163,184,0.38)';
const FSB_ROW = 'rgba(255,107,53,0.07)';
const GLOW = 'rgba(255,107,53,0.3)';
const DOT = 'rgba(100,116,139,0.22)';
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Monaco, 'Roboto Mono', Menlo, Consolas, monospace";
// Monospace advance used to pin label widths with textLength, so the caret and the external-link
// icon land in the same place whichever monospace font the viewer's system substitutes.
const MONO_ADVANCE = 0.6;

// The FSB wordmark: F is Poppins Thin and S is Poppins Black, outlined from
// extension/assets/onboarding/fonts/poppins-100.ttf and poppins-900.ttf with fontTools
// (SVGPathPen through a y-flip), in font units (1000 per em, baseline at y = 0).
// B is the hand-drawn path every FSB wordmark on the site uses (viewBox -3 -3 78 103).
const GLYPH_F = { advance: 469, d: 'M429 -704V-686H105V-361H399V-343H105V0H85V-704Z' };
const GLYPH_S = {
  advance: 625,
  d: 'M28 -227H264Q269 -166 318 -166Q336 -166 348.5 -174.5Q361 -183 361 -201Q361 -226 334 -241.5Q307 -257 250 -277Q182 -301 137.5 -324Q93 -347 61 -391Q29 -435 30 -504Q30 -573 65.5 -621.5Q101 -670 162.5 -695Q224 -720 301 -720Q431 -720 507.5 -660Q584 -600 588 -491H349Q348 -521 334 -534Q320 -547 300 -547Q286 -547 277 -537.5Q268 -528 268 -511Q268 -487 294.5 -471.5Q321 -456 379 -434Q446 -409 489.5 -386Q533 -363 565 -322Q597 -281 597 -219Q597 -154 565 -102.5Q533 -51 472 -22Q411 7 327 7Q200 7 117.5 -52.5Q35 -112 28 -227Z',
};
const GLYPH_B = 'M0 0 L40 0 C58 0 70 10 70 26 C70 38 62 46 50 49 C64 51 72 60 72 74 C72 90 60 100 40 100 L0 100 Z';

const TICKS = [0, 20, 40, 60, 80];

function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function num(value) {
  return Number(value.toFixed(2)).toString();
}

function percent(score) {
  return `${score.toFixed(1)}%`;
}

export function fsbScore(data) {
  return Math.round((data.fsb.passed / data.fsb.total) * 1000) / 10;
}

function rows(data) {
  return data.leaderboard.map((entry, index) => ({
    ...entry,
    rank: String(index + 1).padStart(2, '0'),
  }));
}

/* Width of the wordmark at a font size, matching the site's .fsb-row: F, S, then a B whose
   height is 0.74em plus a 0.01em gap. */
function wordmarkWidth(size) {
  const bWidth = (0.74 * size * 78) / 103;
  return ((GLYPH_F.advance + GLYPH_S.advance) / 1000) * size + 0.01 * size + bWidth;
}

function wordmark(x, baseline, size, fill) {
  const unit = size / 1000;
  const bScale = (0.74 * size) / 103;
  const bLeft = x + ((GLYPH_F.advance + GLYPH_S.advance) / 1000) * size + 0.01 * size;
  return [
    `<g fill="${fill}" aria-hidden="true">`,
    `<path transform="translate(${num(x)} ${num(baseline)}) scale(${num(unit)})" d="${GLYPH_F.d}"/>`,
    `<path transform="translate(${num(x + (GLYPH_F.advance / 1000) * size)} ${num(baseline)}) scale(${num(unit)})" d="${GLYPH_S.d}"/>`,
    `<path transform="translate(${num(bLeft + 3 * bScale)} ${num(baseline - 100 * bScale)}) scale(${num(bScale)})" d="${GLYPH_B}"/>`,
    '</g>',
  ].join('');
}

/* A bar with square left corners and 4px rounded right corners, like .lb-bar. */
function barPath(x, y, width, height) {
  const r = Math.min(4, width / 2);
  return `M${num(x)} ${num(y)}h${num(width - r)}a${r} ${r} 0 0 1 ${r} ${r}v${num(height - 2 * r)}a${r} ${r} 0 0 1 -${r} ${r}h-${num(width - r)}z`;
}

function caret(x, baseline, fill, cls) {
  // fa-caret-up at 0.95rem, drawn as a softened triangle centered on the label's x-height.
  return `<path class="${cls}" d="M${num(x)} ${num(baseline - 2.5)}h9l-4.5-5.4z" fill="${fill}" stroke="${fill}" stroke-width="1.6" stroke-linejoin="round"/>`;
}

function externalLinkIcon(x, y, stroke) {
  return `<path d="M${num(x + 4.2)} ${num(y + 1)}H${num(x + 1)}V${num(y + 10)}H${num(x + 10)}V${num(y + 6.8)}M${num(x + 6.2)} ${num(y + 1)}H${num(x + 10)}V${num(y + 4.8)}M${num(x + 10)} ${num(y + 1)}L${num(x + 5)} ${num(y + 6)}" fill="none" stroke="${stroke}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function summary(data) {
  const list = rows(data)
    .map((row) => (row.fsb ? `FSB ${percent(row.score)} (AI-reviewed result, ${data.fsb.passed}/${data.fsb.total})` : `${row.name} ${percent(row.score)}`))
    .join(', ');
  return `${list}. Other values are transcribed from the leaderboard. Evaluation methods differ; numerical placement is illustrative, not an official leaderboard ranking.`;
}

/* The README chart: the showcase leaderboard card drawn at its 960px desktop width, on the
   section's dotted grid. Geometry follows home-page.component.scss (.lb and friends) at a
   1280px viewport. */
export function renderBenchmarkSvg(data, theme) {
  const t = THEMES[theme];
  if (!t) throw new Error(`Unknown theme ${theme}`);

  const frame = 24;
  const cardW = 960;
  const padX = 36;
  const cardX = frame;
  const cardY = frame;
  const contentX = cardX + padX;
  const contentRight = cardX + cardW - padX;
  const top = cardY + 28;

  // .lb-head: 12px eyebrow and 21.6px title (line-height 1.6, 4px gap); 13.6px metric label
  // pinned to the bottom edge.
  const eyebrowBaseline = top + 9.6 + 4.2;
  const titleBaseline = top + 19.2 + 4 + 17.28 + 7.56;
  const headBottom = top + 19.2 + 4 + 34.56;
  const metricBaseline = headBottom - 10.88 + 4.76;

  // .lb-row: 10px side padding, 28px rank, 190px name, 14px gaps, track with a 64px gutter.
  const rowsTop = headBottom + 20;
  const rowX = contentX;
  const rowW = contentRight - contentX;
  const rankX = rowX + 10;
  const nameRight = rankX + 28 + 14 + 190;
  const trackX = nameRight + 14;
  const trackW = contentRight - 10 - 64 - trackX;
  const rowH = 40;
  const pitch = 44;
  const list = rows(data);
  const rowsBottom = rowsTop + list.length * rowH + (list.length - 1) * 4;

  const axisBaseline = rowsBottom + 6 + 12.9;
  const ruleY = rowsBottom + 24 + 20;
  const notesTop = ruleY + 1 + 16;
  const line1 = notesTop + 13.7;
  const line2 = line1 + 22.72;
  const line3Top = notesTop + 18.72 + 4 + 18.72 + 4 + 6;
  const line3 = line3Top + 9 + 4.2;
  const cardH = line3Top + 18 + 24 - cardY;
  const width = cardW + 2 * frame;
  const height = Math.round(cardY + cardH + frame);

  const fsb = list.find((row) => row.fsb);
  const fsbBarW = (trackW * fsb.score) / 100;
  const shineW = fsbBarW * 0.35;
  const delay = (index) => 250 + index * 90;

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="om2w-title om2w-desc">`);
  out.push(`<title id="om2w-title">${esc(data.name)}: top 10 agents by average success rate</title>`);
  out.push(`<desc id="om2w-desc">${esc(summary(data))}</desc>`);
  out.push('<style>');
  out.push(`.sans{font-family:${SANS}}.mono{font-family:${MONO}}`);
  out.push(`.grow{transform-origin:${num(trackX)}px 0;animation:om2wGrow 900ms cubic-bezier(.16,1,.3,1) both}`);
  out.push('.fade{animation:om2wFade 450ms ease-out both}');
  out.push('.glow{opacity:.8;animation:om2wGlow 3.2s ease-in-out infinite}');
  out.push(`.shine{transform:translateX(${num(-1.2 * shineW)}px);animation:om2wShine 3.2s ease-in-out 1.6s infinite}`);
  out.push('.rise{animation:om2wRise 1.8s ease-in-out infinite}');
  out.push('@keyframes om2wGrow{from{transform:scaleX(0)}}');
  out.push('@keyframes om2wFade{from{opacity:0}}');
  out.push('@keyframes om2wGlow{0%,100%{opacity:.55}50%{opacity:1}}');
  out.push(`@keyframes om2wShine{0%{transform:translateX(${num(-1.2 * shineW)}px)}55%,100%{transform:translateX(${num(3.2 * shineW)}px)}}`);
  out.push('@keyframes om2wRise{0%,100%{transform:translateY(1px);opacity:.75}50%{transform:translateY(-3px);opacity:1}}');
  out.push('@media (prefers-reduced-motion:reduce){*{animation:none!important}}');
  out.push('</style>');

  out.push('<defs>');
  out.push(`<pattern id="om2w-dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="9" cy="9" r="1" fill="${DOT}"/></pattern>`);
  out.push(`<linearGradient id="om2w-fsb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${FSB_ORANGE}"/><stop offset="1" stop-color="${FSB_ORANGE_END}"/></linearGradient>`);
  out.push('<linearGradient id="om2w-shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>');
  out.push('<filter id="om2w-glow" x="-10%" y="-150%" width="120%" height="400%"><feGaussianBlur stdDeviation="9"/></filter>');
  out.push('</defs>');

  // Section background with the dot grid, then the solid card.
  out.push(`<rect width="${width}" height="${height}" rx="16" fill="${t.body}"/>`);
  out.push(`<rect width="${width}" height="${height}" rx="16" fill="url(#om2w-dots)"/>`);
  out.push(`<rect x="${cardX + 0.5}" y="${cardY + 0.5}" width="${cardW - 1}" height="${num(cardH - 1)}" rx="16" fill="${t.body}" stroke="${t.border}"/>`);

  // Header.
  const eyebrow = data.name.toUpperCase();
  const eyebrowWidth = eyebrow.length * (12 * MONO_ADVANCE + 0.96) - 0.96;
  out.push(`<text class="mono" x="${contentX}" y="${num(eyebrowBaseline)}" font-size="12" letter-spacing="0.96" fill="${t.muted}" textLength="${num(eyebrowWidth)}" lengthAdjust="spacingAndGlyphs">${esc(eyebrow)}</text>`);
  out.push(externalLinkIcon(contentX + eyebrowWidth + 6, eyebrowBaseline - 9.6, t.muted));
  out.push(`<text class="sans" x="${contentX}" y="${num(titleBaseline)}" font-size="21.6" font-weight="700" fill="${t.text}">Top 10 agents</text>`);
  out.push(`<text class="sans" x="${contentRight}" y="${num(metricBaseline)}" font-size="13.6" text-anchor="end" fill="${t.secondary}">Average success rate</text>`);

  // Rows.
  list.forEach((row, index) => {
    const rowTop = rowsTop + index * pitch;
    const center = rowTop + rowH / 2;
    const trackTop = rowTop + 7;
    const barW = (trackW * row.score) / 100;
    const valueX = trackX + barW + 8;
    const grow = `style="animation-delay:${delay(index)}ms"`;
    const fade = `style="animation-delay:${delay(index) + 550}ms"`;

    if (row.fsb) out.push(`<rect x="${rowX}" y="${num(rowTop)}" width="${rowW}" height="${rowH}" rx="8" fill="${FSB_ROW}"/>`);
    out.push(`<text class="mono" x="${rankX}" y="${num(center + 4.2)}" font-size="12" fill="${row.fsb ? FSB_ORANGE : t.muted}">${row.rank}</text>`);
    if (row.fsb) {
      out.push(wordmark(nameRight - wordmarkWidth(20), center + 7, 20, t.text));
    } else {
      out.push(`<text class="sans" x="${nameRight}" y="${num(center + 5)}" font-size="14.4" font-weight="500" text-anchor="end" fill="${t.text}">${esc(row.name)}</text>`);
    }
    for (const tick of TICKS) {
      out.push(`<rect x="${num(trackX + (trackW * tick) / 100)}" y="${num(trackTop)}" width="1" height="26" fill="${t.border}"/>`);
    }
    const bar = barPath(trackX, trackTop + 4, barW, 18);
    if (row.fsb) {
      out.push(`<g class="grow" ${grow}>`);
      out.push(`<path class="glow" d="${bar}" fill="${GLOW}" filter="url(#om2w-glow)"/>`);
      out.push(`<clipPath id="om2w-fsb-bar"><path d="${bar}"/></clipPath>`);
      out.push(`<path d="${bar}" fill="url(#om2w-fsb)"/>`);
      out.push(`<g clip-path="url(#om2w-fsb-bar)"><rect class="shine" x="${num(trackX)}" y="${num(trackTop + 4)}" width="${num(shineW)}" height="18" fill="url(#om2w-shine)"/></g>`);
      out.push('</g>');
      const label = percent(row.score);
      const labelWidth = label.length * 12.8 * MONO_ADVANCE;
      out.push(`<g class="fade" ${fade}>`);
      out.push(`<text class="mono" x="${num(valueX)}" y="${num(center + 4.5)}" font-size="12.8" font-weight="700" fill="${FSB_ORANGE}" textLength="${num(labelWidth)}" lengthAdjust="spacingAndGlyphs">${label}</text>`);
      out.push(caret(valueX + labelWidth + 6, center + 4.5, FSB_ORANGE, 'rise'));
      out.push('</g>');
    } else {
      out.push(`<path class="grow" ${grow} d="${bar}" fill="${BAR}"/>`);
      out.push(`<text class="mono fade" ${fade} x="${num(valueX)}" y="${num(center + 4.5)}" font-size="12.8" font-weight="500" fill="${t.secondary}">${percent(row.score)}</text>`);
    }
  });

  // Axis.
  for (const tick of TICKS) {
    out.push(`<text class="mono" x="${num(trackX + (trackW * tick) / 100)}" y="${num(axisBaseline)}" font-size="11.2" text-anchor="middle" fill="${t.muted}">${tick}%</text>`);
  }

  // Notes, verbatim from the site.
  out.push(`<rect x="${contentX}" y="${num(ruleY)}" width="${contentRight - contentX}" height="1" fill="${t.border}"/>`);
  out.push(`<text class="sans" x="${contentX}" y="${num(line1)}" font-size="12.48" fill="${t.muted}">FSB: <tspan fill="${PRIMARY}" text-decoration="underline">AI-reviewed result (${data.fsb.passed}/${data.fsb.total})</tspan>. Other values are transcribed from the leaderboard.</text>`);
  out.push(`<text class="sans" x="${contentX}" y="${num(line2)}" font-size="12.48" fill="${t.muted}">Evaluation methods differ; numerical placement is illustrative, not an official leaderboard ranking.</text>`);
  out.push(`<text class="mono" x="${contentX}" y="${num(line3)}" font-size="12" fill="${t.secondary}">Tested on FSB v${esc(data.fsb.extensionVersion)} · MCP v${esc(data.fsb.mcpVersion)}<tspan dx="10" font-style="italic">It only gets better</tspan><tspan dx="10" fill="${PRIMARY}" font-weight="700">;)</tspan></text>`);

  out.push('</svg>');
  return `${out.join('\n')}\n`;
}

/* The 1200x630 social card: a static dark composition built from the same data. */
export function renderOgSvg(data) {
  const t = THEMES.dark;
  const { width, height } = OG_SIZE;
  const list = rows(data);
  const fsb = list.find((row) => row.fsb);

  const panelX = 548;
  const panelY = 64;
  const panelW = 588;
  const panelH = 502;
  // Rank column (26px) and a 12px gap sit left of the right-aligned 170px name column.
  const nameRight = panelX + 28 + 26 + 12 + 170;
  const trackX = nameRight + 14;
  const trackW = panelX + panelW - 28 - 58 - trackX;
  const rowsTop = panelY + 70;
  const pitch = 41;

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  out.push('<defs>');
  out.push(`<pattern id="og-dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="9" cy="9" r="1" fill="${DOT}"/></pattern>`);
  out.push(`<linearGradient id="og-fsb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${FSB_ORANGE}"/><stop offset="1" stop-color="${FSB_ORANGE_END}"/></linearGradient>`);
  out.push('<filter id="og-glow" x="-10%" y="-150%" width="120%" height="400%"><feGaussianBlur stdDeviation="9"/></filter>');
  out.push('</defs>');
  out.push(`<rect width="${width}" height="${height}" fill="${t.body}"/>`);
  out.push(`<rect width="${width}" height="${height}" fill="url(#og-dots)"/>`);

  // Left column: identity and the headline result.
  out.push(wordmark(64, 112, 46, t.text));
  out.push(`<text font-family="${MONO}" x="64" y="196" font-size="19" letter-spacing="1.5" fill="${t.muted}">${esc(data.name.toUpperCase())}</text>`);
  out.push(`<text font-family="${SANS}" x="60" y="318" font-size="124" font-weight="800" fill="${PRIMARY}">${percent(fsb.score)}</text>`);
  out.push(`<text font-family="${SANS}" x="64" y="372" font-size="30" font-weight="600" fill="${t.text}">AI-reviewed result (${data.fsb.passed}/${data.fsb.total})</text>`);
  out.push(`<text font-family="${MONO}" x="64" y="414" font-size="17" fill="${t.secondary}">Tested on FSB v${esc(data.fsb.extensionVersion)} · MCP v${esc(data.fsb.mcpVersion)}</text>`);
  out.push(`<text font-family="${SANS}" x="64" y="512" font-size="15" fill="${t.muted}">Evaluation methods differ; numerical placement is</text>`);
  out.push(`<text font-family="${SANS}" x="64" y="534" font-size="15" fill="${t.muted}">illustrative, not an official leaderboard ranking.</text>`);
  out.push(`<text font-family="${MONO}" x="64" y="580" font-size="18" fill="${t.secondary}">full-selfbrowsing.com</text>`);

  // Right column: the top 10, condensed.
  out.push(`<rect x="${panelX + 0.5}" y="${panelY + 0.5}" width="${panelW - 1}" height="${panelH - 1}" rx="16" fill="${t.body}" stroke="rgba(255,255,255,0.12)"/>`);
  out.push(`<text font-family="${SANS}" x="${panelX + 28}" y="${panelY + 44}" font-size="20" font-weight="700" fill="${t.text}">Top 10 agents</text>`);
  out.push(`<text font-family="${SANS}" x="${panelX + panelW - 28}" y="${panelY + 44}" font-size="14" text-anchor="end" fill="${t.secondary}">Average success rate</text>`);
  list.forEach((row, index) => {
    const rowTop = rowsTop + index * pitch;
    const center = rowTop + 17;
    const barW = (trackW * row.score) / 100;
    if (row.fsb) out.push(`<rect x="${panelX + 16}" y="${rowTop}" width="${panelW - 32}" height="34" rx="8" fill="${FSB_ROW}"/>`);
    out.push(`<text font-family="${MONO}" x="${panelX + 28}" y="${num(center + 4.5)}" font-size="13" fill="${row.fsb ? FSB_ORANGE : t.muted}">${row.rank}</text>`);
    if (row.fsb) {
      out.push(wordmark(nameRight - wordmarkWidth(19), center + 6.7, 19, t.text));
    } else {
      out.push(`<text font-family="${SANS}" x="${nameRight}" y="${num(center + 5)}" font-size="14.5" font-weight="500" text-anchor="end" fill="${t.text}">${esc(row.name)}</text>`);
    }
    const bar = barPath(trackX, center - 8, barW, 16);
    if (row.fsb) {
      out.push(`<path d="${bar}" fill="${GLOW}" filter="url(#og-glow)"/>`);
      out.push(`<path d="${bar}" fill="url(#og-fsb)"/>`);
    } else {
      out.push(`<path d="${bar}" fill="${BAR}"/>`);
    }
    out.push(`<text font-family="${MONO}" x="${num(trackX + barW + 7)}" y="${num(center + 4.5)}" font-size="13" font-weight="${row.fsb ? 700 : 500}" fill="${row.fsb ? FSB_ORANGE : t.secondary}">${percent(row.score)}</text>`);
  });
  out.push('</svg>');
  return `${out.join('\n')}\n`;
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  return candidates.find((candidate) => {
    try {
      readFileSync(candidate);
      return true;
    } catch {
      return false;
    }
  });
}

function renderOgPng(data) {
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome not found; set CHROME_PATH to render the social card');
  const scratch = mkdtempSync(join(tmpdir(), 'fsb-og-'));
  try {
    const svgPath = join(scratch, 'og.svg');
    writeFileSync(svgPath, renderOgSvg(data));
    mkdirSync(dirname(OG_PATH), { recursive: true });
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${OG_SIZE.width},${OG_SIZE.height}`,
      `--user-data-dir=${join(scratch, 'profile')}`,
      `--screenshot=${OG_PATH}`,
      pathToFileURL(svgPath).href,
    ], { stdio: 'ignore' });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function main() {
  const data = loadBenchmark();
  for (const [theme, path] of Object.entries(SVG_PATHS)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, renderBenchmarkSvg(data, theme));
    console.log(`wrote ${path.slice(ROOT.length + 1)}`);
  }
  if (process.argv.includes('--og')) {
    renderOgPng(data);
    console.log(`wrote ${OG_PATH.slice(ROOT.length + 1)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
