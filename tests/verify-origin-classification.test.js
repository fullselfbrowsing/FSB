#!/usr/bin/env node
'use strict';

/**
 * Phase 41 / Plan 01 (v1.0.0 Full App Catalog -- DEPTH-02) -- the CORS /
 * FIRST-PARTY-ORIGIN GATE unit proof (WR-02).
 *
 * THE COVERAGE GAP THIS CLOSES: scripts/verify-origin-classification.mjs documents a
 * dual-export contract ("export { classifyOriginPattern, checkOriginClassification } --
 * driven by a test") but no test drove the EXPORTED functions -- the failure path rested
 * solely on the CLI inline linear negative-control inside validate:extension. So the
 * per-branch logic (parseHeadModules entry-splitting, the unmapped-head fail-closed
 * branch, the CORS_UNRESOLVABLE branch, the slack dynamic-workspace same-registrable
 * accommodation) had NO focused unit coverage; a refactor could silently mis-parse until
 * the whole validate:extension happened to notice.
 *
 * This drives the REAL exports (NOT a re-implemented copy; mirrors
 * tests/no-duplicate-stem.test.js's real-export pattern):
 *   (a) parseHeadModules on the REAL catalog source -> exactly the known head globals
 *       with their correct origins; PLUS a synthetic NESTED-brace entry parses whole
 *       (IN-01 hardening: origin is captured, not dropped to null).
 *   (b) the classifier returns sameOrigin:true for gitlab.com/api/v4,
 *       app.notion.com/api/v3, AND the slack dynamic-workspace accommodation
 *       (same-registrable-domain, explicit SAME_REGISTRABLE_DOMAIN_DYNAMIC_WORKSPACE
 *       reason) -- including the real end-to-end checkOriginClassification() over the
 *       live catalog + vendored slack-api.ts.
 *   (c) sameOrigin:false / CORS_SEPARATE_ORIGIN for a synthetic separate-origin head
 *       (linear -> client-api.linear.app) AND a per-org wildcard (app.datadoghq.com ->
 *       *.datadoghq.com api subdomain); AND a dynamic-workspace base OUTSIDE the head
 *       registrable family still FAILS (the accommodation is asserted, not a rubber-stamp).
 *   (d) the unmapped-head (CORS_UNMAPPED_HEAD) and CORS_UNRESOLVABLE_ORIGIN branches
 *       return the right reason.
 *
 * Zero-framework node test: a check(cond,msg) counter, PASS=/FAIL= summary,
 * process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/verify-origin-classification.test.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

(async () => {
  console.log('--- DEPTH-02 origin-classification gate unit proof (WR-02: the CORS-gate exports are non-vacuously tested) ---');

  const ROOT = path.resolve(__dirname, '..');
  const gateUrl = pathToFileURL(path.join(ROOT, 'scripts', 'verify-origin-classification.mjs')).href;
  const gate = await import(gateUrl);

  check(typeof gate.classifyOriginPattern === 'function',
    'classifyOriginPattern is a named export of the real gate (not re-implemented here)');
  check(typeof gate.checkOriginClassification === 'function',
    'checkOriginClassification is a named export of the real gate');
  check(typeof gate.parseHeadModules === 'function',
    'parseHeadModules is a named export of the real gate (driven directly, IN-01 coverage)');

  // ===== (a) parseHeadModules on the REAL catalog source =====================
  const CATALOG_PATH = path.join(ROOT, 'extension', 'utils', 'capability-catalog.js');
  check(fs.existsSync(CATALOG_PATH), '(a) capability-catalog.js exists (the head manifest source)');
  const catalogSrc = fs.existsSync(CATALOG_PATH) ? fs.readFileSync(CATALOG_PATH, 'utf8') : '';
  const realHeads = gate.parseHeadModules(catalogSrc) || [];
  check(realHeads.length === 7,
    '(a) parseHeadModules returns exactly 7 heads from the real catalog source; got ' + realHeads.length);
  const byGlobal = {};
  for (const h of realHeads) { byGlobal[h.global] = h.origin; }
  check(byGlobal.FsbHandlerGithub === 'https://github.com',
    '(a) FsbHandlerGithub origin parsed as https://github.com');
  check(byGlobal.FsbHandlerSlack === 'https://app.slack.com',
    '(a) FsbHandlerSlack origin parsed as https://app.slack.com');
  check(byGlobal.FsbHandlerNotion === 'https://app.notion.com',
    '(a) FsbHandlerNotion origin parsed as https://app.notion.com');
  check(byGlobal.FsbHandlerGitlab === 'https://gitlab.com',
    '(a) FsbHandlerGitlab origin parsed as https://gitlab.com');
  check(byGlobal.FsbHandlerNetlify === 'https://app.netlify.com',
    '(a) FsbHandlerNetlify origin parsed as https://app.netlify.com');
  check(byGlobal.FsbHandlerBitbucket === 'https://bitbucket.org',
    '(a) FsbHandlerBitbucket origin parsed as https://bitbucket.org');
  check(byGlobal.FsbHandlerCircleci === 'https://app.circleci.com',
    '(a) FsbHandlerCircleci origin parsed as https://app.circleci.com');

  // (a-IN01) a synthetic NESTED-brace entry parses WHOLE (origin not dropped to null).
  // The old /\{[^}]*\}/g entry regex would have truncated this entry at the inner `}` of
  // `meta: { region: 'us' }`, dropping origin -> origin:null -> a confusing false red.
  const nestedSrc = [
    'var HEAD_HANDLER_MODULES = [',
    "  { global: 'FsbHandlerGithub', service: 'github.com', origin: 'https://github.com' },",
    "  { global: 'FsbHandlerFuture', meta: { region: 'us' }, origin: 'https://future.example.com' },",
    "  { global: 'FsbHandlerSlack', service: 'app.slack.com', origin: 'https://app.slack.com' }",
    '];'
  ].join('\n');
  const nestedHeads = gate.parseHeadModules(nestedSrc) || [];
  check(nestedHeads.length === 3,
    '(a-IN01) a nested-brace manifest parses all 3 entries; got ' + nestedHeads.length);
  const future = nestedHeads.find((h) => h.global === 'FsbHandlerFuture');
  check(!!future && future.origin === 'https://future.example.com',
    '(a-IN01) the NESTED-brace entry keeps its origin (https://future.example.com, NOT null) -- IN-01 hardening');

  // (a) a `}` inside a quoted string value does not falsely close an entry.
  const quotedSrc = [
    'var HEAD_HANDLER_MODULES = [',
    "  { global: 'FsbHandlerQuote', note: 'a } brace in a string', origin: 'https://quote.example.com' }",
    '];'
  ].join('\n');
  const quotedHeads = gate.parseHeadModules(quotedSrc) || [];
  const quoteEntry = quotedHeads.find((h) => h.global === 'FsbHandlerQuote');
  check(!!quoteEntry && quoteEntry.origin === 'https://quote.example.com',
    '(a) a `}` inside a quoted string value does not split the entry (string-aware scan)');

  // ===== (b) same-origin / same-registrable PASS rows ========================
  const gl = gate.classifyOriginPattern('https://gitlab.com', 'https://gitlab.com/api/v4');
  check(gl.sameOrigin === true && gl.separate === false && gl.reason === null,
    '(b) gitlab.com vs gitlab.com/api/v4 -> sameOrigin:true (strict same-origin path)');
  const nt = gate.classifyOriginPattern('https://app.notion.com', 'https://app.notion.com/api/v3/${endpoint}');
  check(nt.sameOrigin === true && nt.separate === false && nt.reason === null,
    '(b) app.notion.com vs app.notion.com/api/v3 -> sameOrigin:true (strict same-origin path)');
  const sl = gate.classifyOriginPattern('https://app.slack.com', 'https://workspace.slack.com', { dynamicWorkspace: true });
  check(sl.sameOrigin === true && sl.separate === false,
    '(b) slack app.slack.com vs *.slack.com dynamic base -> sameOrigin:true (registrable-domain accommodation)');
  check(typeof sl.reason === 'string' && sl.reason.indexOf('SAME_REGISTRABLE_DOMAIN_DYNAMIC_WORKSPACE') === 0,
    '(b) the slack accommodation carries the EXPLICIT SAME_REGISTRABLE_DOMAIN_DYNAMIC_WORKSPACE reason (asserted, not a silent fallback)');
  // a per-team classic-client subdomain is still same-registrable (the real runtime case).
  const slTeam = gate.classifyOriginPattern('https://app.slack.com', 'https://myteam.slack.com', { dynamicWorkspace: true });
  check(slTeam.sameOrigin === true,
    '(b) slack per-team classic-client subdomain (myteam.slack.com) -> sameOrigin:true (same registrable domain slack.com)');
  const relativeApi = gate.classifyOriginPattern('https://app.netlify.com', 'https://app.netlify.com/access-control/bb-api/api/v1');
  check(relativeApi.sameOrigin === true && relativeApi.separate === false,
    '(b) same-origin relative vendored API bases classify as strict same-origin after joining with the handler origin');

  // (b) REAL end-to-end: checkOriginClassification() over the LIVE catalog + vendored
  // slack-api.ts -- proves the real heads all pass and slack rides the dynamic
  // accommodation against the genuinely-extracted vendored dynamic form (not a stub).
  const real = gate.checkOriginClassification();
  check(real && Array.isArray(real.failures) && real.failures.length === 0,
    '(b) the REAL 7 heads over the live catalog + vendored source yield 0 failures ['
      + (real && real.failures && real.failures.length ? real.failures.join(' | ') : 'all same-origin') + ']');
  const realSlack = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerSlack') : null;
  check(!!realSlack && realSlack.classification.sameOrigin === true
    && typeof realSlack.classification.reason === 'string'
    && realSlack.classification.reason.indexOf('SAME_REGISTRABLE_DOMAIN_DYNAMIC_WORKSPACE') === 0,
    '(b) the REAL slack head classifies via the dynamic-workspace accommodation (grounded in the vendored slack-api.ts), not a fallback rubber-stamp');
  const realGitlab = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerGitlab') : null;
  check(!!realGitlab && realGitlab.apiBaseUrl === 'https://gitlab.com/api/v4',
    '(b) the REAL gitlab head is verified against its genuinely-extracted vendored base gitlab.com/api/v4');
  const realNotion = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerNotion') : null;
  check(!!realNotion && realNotion.apiBaseUrl === 'https://app.notion.com/api/v3'
    && realNotion.classification && realNotion.classification.sameOrigin === true,
    '(b) the REAL notion head uses the explicit observed runtime override app.notion.com/api/v3 and still classifies same-origin');
  const realNetlify = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerNetlify') : null;
  check(!!realNetlify && realNetlify.apiBaseUrl === 'https://app.netlify.com/access-control/bb-api/api/v1'
    && realNetlify.classification && realNetlify.classification.sameOrigin === true,
    '(b) the REAL netlify head joins the relative vendored base to app.netlify.com and classifies same-origin');
  const realBitbucket = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerBitbucket') : null;
  check(!!realBitbucket && realBitbucket.apiBaseUrl === 'https://bitbucket.org/!api/2.0'
    && realBitbucket.classification && realBitbucket.classification.sameOrigin === true,
    '(b) the REAL bitbucket head joins the relative vendored base to bitbucket.org and classifies same-origin');
  const realCircleci = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerCircleci') : null;
  check(!!realCircleci && realCircleci.apiBaseUrl === 'https://app.circleci.com/api/v2'
    && realCircleci.classification && realCircleci.classification.sameOrigin === true,
    '(b) the REAL circleci head joins the relative vendored base to app.circleci.com and classifies same-origin');

  const badNotionOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerNotionBad', origin: 'https://app.notion.com' }],
    {
      appMap: {
        FsbHandlerNotionBad: {
          app: 'notion',
          fallbackBaseUrl: 'https://app.notion.com',
          observedRuntimeBaseUrl: 'https://app.notion.com/api/v3',
          expectedStaleVendoredBaseUrl: 'https://wrong.notion.so/api/v3'
        }
      }
    }
  );
  check(badNotionOverride && badNotionOverride.failures.length === 1
    && badNotionOverride.failures[0].indexOf('CORS_OBSERVED_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Notion observed-runtime override fails closed instead of broadening the CORS gate');

  // ===== (c) separate-origin / wildcard FAIL rows ============================
  const linear = gate.classifyOriginPattern('https://linear.app', 'https://client-api.linear.app/graphql');
  check(linear.sameOrigin === false && linear.separate === true
    && typeof linear.reason === 'string' && linear.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(c) linear.app vs client-api.linear.app -> CORS_SEPARATE_ORIGIN (the demote-to-T3 the gate enforces)');
  const datadog = gate.classifyOriginPattern('https://app.datadoghq.com', 'https://api.datadoghq.com/api/v1');
  check(datadog.sameOrigin === false && datadog.separate === true
    && typeof datadog.reason === 'string' && datadog.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(c) per-org wildcard app.datadoghq.com vs api.datadoghq.com -> CORS_SEPARATE_ORIGIN (a different subdomain is a separate origin)');
  // a dynamic-workspace base OUTSIDE the head registrable family must STILL fail
  // (the accommodation is asserted same-registrable, not a blanket slack waiver).
  const dynBad = gate.classifyOriginPattern('https://app.slack.com', 'https://evil.example.com', { dynamicWorkspace: true });
  check(dynBad.sameOrigin === false && dynBad.separate === true
    && typeof dynBad.reason === 'string' && dynBad.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(c) a dynamic-workspace base OUTSIDE the head registrable family (evil.example.com) still FAILS CORS_SEPARATE_ORIGIN');
  // suffix-confusion: slack.com.evil.com is registrable evil.com, NOT slack.com.
  const dynConfuse = gate.classifyOriginPattern('https://app.slack.com', 'https://slack.com.evil.com', { dynamicWorkspace: true });
  check(dynConfuse.sameOrigin === false,
    '(c) suffix-confusion slack.com.evil.com (registrable evil.com) does NOT match slack.com -> FAILS');

  // a separate-origin head drives checkOriginClassification to exactly 1 failure.
  const synthSep = gate.checkOriginClassification(
    [{ global: 'FsbHandlerLinearSynthetic', origin: 'https://linear.app' }],
    { appMap: { FsbHandlerLinearSynthetic: { app: null, fallbackBaseUrl: 'https://client-api.linear.app/graphql' } } }
  );
  check(synthSep && synthSep.failures.length === 1
    && synthSep.failures[0].indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(c) a synthetic separate-origin head drives checkOriginClassification to exactly 1 CORS_SEPARATE_ORIGIN failure');

  // ===== (d) unmapped-head + unresolvable branches ===========================
  const unmapped = gate.checkOriginClassification(
    [{ global: 'FsbHandlerNeverHeardOf', origin: 'https://whatever.example.com' }],
    { appMap: {} }
  );
  check(unmapped && unmapped.failures.length === 1
    && unmapped.failures[0].indexOf('CORS_UNMAPPED_HEAD') === 0,
    '(d) an UNMAPPED head global -> exactly 1 CORS_UNMAPPED_HEAD failure (fail closed, never silently pass)');
  const unresolvable = gate.classifyOriginPattern('https://app.slack.com', 'not-a-url');
  check(unresolvable.sameOrigin === false && unresolvable.separate === true
    && typeof unresolvable.reason === 'string' && unresolvable.reason.indexOf('CORS_UNRESOLVABLE_ORIGIN') === 0,
    '(d) classifyOriginPattern(x, "not-a-url") -> CORS_UNRESOLVABLE_ORIGIN (an unparseable origin is demoted to T3-DOM)');

  console.log('\nverify-origin-classification: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: verify-origin-classification test threw:', err && err.message ? err.message : err);
  process.exit(1);
});
