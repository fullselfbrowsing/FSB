/**
 * Phase 223 MET-06 + MET-07 dashboard render checks (Wave 0 / TDD-first).
 *
 * Asserts the showcase dashboard component (Angular) and its vanilla mirror
 * (showcase/js/dashboard.js) both wire ext:metrics to renderMetrics() /
 * clearMetrics(), use textContent (not innerHTML) for untrusted payload
 * values, and call clearMetrics() from ws.onclose so the dashboard
 * transitions to "no data yet" within one render cycle on disconnect.
 *
 * Today (Wave 0) these assertions FAIL by design -- Plan 03 lands the
 * Angular + vanilla parity implementation that makes them green.
 *
 * Static-analysis only. Mirrors tests/sync-tab-runtime.test.js pattern.
 *
 * Run: node tests/dashboard-metrics-render.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const TS = read(path.join('showcase', 'angular', 'src', 'app', 'pages', 'dashboard', 'dashboard-page.component.ts'));
const HTML = read(path.join('showcase', 'angular', 'src', 'app', 'pages', 'dashboard', 'dashboard-page.component.html'));
const VANILLA = read(path.join('showcase', 'js', 'dashboard.js'));
const SHELL = read(path.join('showcase', 'dashboard.html'));

console.log('\n--- Phase 223 A2: Vanilla mirror still load-bearing ---');
assert(
  SHELL.includes('js/dashboard.js'),
  '[A2] showcase/dashboard.html still loads showcase/js/dashboard.js -- dual-write required'
);

console.log('\n--- Phase 223 MET-06: Angular component renders 5 metric groups ---');

['id="stat-runs-today"', 'id="stat-success-rate"', 'id="stat-total-cost"', 'id="stat-enabled"', 'id="stat-cost-saved"'].forEach(function (id) {
  assert(HTML.includes(id), '[MET-06] dashboard HTML retains stat card ' + id + ' (population target)');
});
['Total Tokens', 'Requests', 'Success Rate', 'Total Cost', 'Remote'].forEach(function (label) {
  assert(HTML.includes(label) && SHELL.includes(label), '[MET-06] dashboard stat labels mirror control-panel metrics: ' + label);
});

assert(
  /if\s*\(\s*msg\.type\s*===\s*['"]ext:metrics['"]\s*\)/.test(TS),
  '[MET-06] dashboard-page.component.ts handleWSMessage branches on ext:metrics frame type'
);
assert(
  /\brenderMetrics\s*\(/.test(TS),
  '[MET-06] dashboard-page.component.ts defines renderMetrics()'
);
assert(
  /\bclearMetrics\s*\(/.test(TS),
  '[MET-06 / MET-07] dashboard-page.component.ts defines clearMetrics()'
);

const renderFnMatch = TS.match(/renderMetrics\s*\([^)]*\)\s*[:\w<>]*\s*\{[\s\S]*?\n  \}/);
assert(!!renderFnMatch, '[MET-06] renderMetrics body locatable for security audit');
const renderBody = renderFnMatch ? renderFnMatch[0] : '';
assert(
  !/\.innerHTML\s*=/.test(renderBody),
  '[MET-06 / SEC] renderMetrics does NOT use .innerHTML (XSS guard on metrics payload)'
);
assert(
  renderBody.includes('payload.usage || {}') &&
  renderBody.includes('usage.totalTokens') &&
  renderBody.includes('usage.totalRequests'),
  '[MET-06] renderMetrics consumes stable ext:metrics usage payload'
);

console.log('\n--- Phase 223 MET-07: Disconnect clears metrics within one render cycle ---');

const oncloseMatch = TS.match(/this\.ws\.onclose\s*=\s*\(e\)\s*=>\s*\{[\s\S]*?\n    \};/);
assert(!!oncloseMatch, '[MET-07] dashboard ws.onclose handler block locatable');
const oncloseBody = oncloseMatch ? oncloseMatch[0] : '';
assert(
  /this\.clearMetrics\s*\(\s*\)/.test(oncloseBody),
  '[MET-07] dashboard ws.onclose calls this.clearMetrics() so dashboard transitions to "no data yet" within one render cycle'
);

console.log('\n--- Phase 223 MET-06 / A2: Vanilla parity ---');

assert(
  /msg\.type\s*===\s*['"]ext:metrics['"]/.test(VANILLA),
  '[MET-06 / A2] showcase/js/dashboard.js handleWSMessage also branches on ext:metrics (vanilla parity)'
);
assert(
  /\brenderMetrics\b/.test(VANILLA) && /\bclearMetrics\b/.test(VANILLA),
  '[MET-06 / A2] showcase/js/dashboard.js defines renderMetrics + clearMetrics (vanilla parity)'
);

const vOncloseMatch = VANILLA.match(/ws\.onclose\s*=\s*function\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\};/);
assert(!!vOncloseMatch, '[MET-07 / A2] vanilla ws.onclose locatable');
assert(
  vOncloseMatch && /clearMetrics\s*\(/.test(vOncloseMatch[0]),
  '[MET-07 / A2] vanilla ws.onclose calls clearMetrics()'
);

console.log('\n=== Phase 223 dashboard render results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
