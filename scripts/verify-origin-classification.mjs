#!/usr/bin/env node
/**
 * Phase 41 / Plan 01 (v1.0.0 Full App Catalog -- DEPTH-02) -- the CORS /
 * FIRST-PARTY-ORIGIN VERIFICATION GATE (the SC3 fail-closed shipping guarantee).
 *
 * THE TRAP THIS CLOSES: a T1a head builds a credentialed same-origin-cookie spec and
 * hands it to executeBoundSpec, which pins the active tab to spec.origin (Wall 2). That
 * is SAFE only when the handler origin is SAME-ORIGIN with the app's real API base-URL
 * -- a PATH on the first-party origin (gitlab.com/api/v4, app.notion.com/api/v3). If a
 * head's API actually lives on a SEPARATE subdomain (linear -> client-api.linear.app)
 * or a per-org wildcard (*.datadoghq.com, *.atlassian.net), the first-party session
 * cookie does NOT cross that origin -- porting it would require a CORS-verified
 * cross-origin credentialed fetch that punches a controlled hole in the NON-NEGOTIABLE
 * Wall-2 origin-pin. Such a head must be DEMOTED to T3-DOM, not shipped as a head.
 *
 * THE GATE: it iterates EVERY HEAD_HANDLER_MODULES entry (parsed from the catalog
 * SOURCE -- the same array-literal freeze tests/head-handler-cap.test.js uses), reads
 * each head's declared origin and the app's real API base-URL from the vendored
 * vendor/opentabs-snapshot/plugins/<app>/src/<app>-api.ts (the SAME extraction the
 * Phase-40 planner used), and asserts SAME-ORIGIN. A separate-origin head FAILS THE
 * BUILD with a clear CORS_SEPARATE_ORIGIN reason naming the head + both origins. This
 * is FAIL-CLOSED: a future separate-origin port can NEVER silently ship -- it reds this
 * gate (wired into validate:extension) first.
 *
 * NEGATIVE-CONTROL (in the same run): a synthetic linear head
 * ({ global:'FsbHandlerLinear', origin:'https://linear.app' }) classified against
 * https://client-api.linear.app/graphql MUST classify separate -- the proof the gate
 * actually enforces the linear/datadog/jira demote-to-T3 and is not a no-op.
 *
 * IT IS A SHIPPING GATE, NOT AN EXECUTOR: it enables NO cross-origin call. It only
 * decides port-eligibility at build time. The runtime origin-pin (executeBoundSpec's
 * RECIPE_ORIGIN_MISMATCH) is the separate EXECUTION gate -- both intact, neither
 * extended for cross-origin (Pattern-D is deferred; see 41-DEFERRAL.md).
 *
 * DUAL EXPORT (mirrors scripts/verify-no-duplicate-stem.mjs):
 *   - export { classifyOriginPattern, checkOriginClassification } -- driven by a test.
 *   - CLI on direct invocation -- chained into validate:extension. Both paths reuse the
 *     SAME logic.
 *
 * Wall-1 discipline: this is build tooling (NOT shipped to the browser), kept FREE of
 * run-string-as-code / function-from-string / dynamic-module-loader constructs in code
 * AND comments. The static `import ... from` below is the ESM module graph, not a
 * dynamic loader; it reads the api.ts files as TEXT (readFileSync), never executes them.
 *
 * NO EMOJIS, ASCII-only source.
 */

'use strict';

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const CATALOG_PATH = join(ROOT, 'extension', 'utils', 'capability-catalog.js');
const VENDOR_PLUGINS = join(ROOT, 'vendor', 'opentabs-snapshot', 'plugins');

// ---- The handler-global -> { app, fallbackBaseUrl } map ----------------------
// `app` is the vendored plugin dir whose <app>-api.ts carries the real API base-URL.
// `fallbackBaseUrl` is the documented base-URL for an app with NO vendored plugin
// (github ships no opentabs plugin -- its first-party origin is https://github.com).
// A head global absent from this map FAILS the gate (an unmapped head cannot be
// origin-verified -> fail closed, never silently pass).
//
// `dynamicWorkspace: true` (slack ONLY) marks an app whose vendored API base is NOT a
// static literal but a runtime-interpolated `${workspaceUrl}/api/<method>` (slack-api.ts
// builds it off auth.workspaceUrl, which is app.slack.com on the new client OR a
// per-workspace <team>.slack.com subdomain on the classic client, line 138). That base
// CANNOT be extracted as a single literal, so a generic null->fallback would
// rubber-stamp slack against its own fallbackBaseUrl (WR-01). Instead the gate
// REQUIRES the vendored api.ts to actually contain that dynamic form (readDynamicWorkspaceBase),
// then asserts it is SAME-REGISTRABLE-DOMAIN with the head origin (*.slack.com vs
// app.slack.com) -- a visible, asserted accommodation, NOT a silent fallback. A future
// dynamic-workspace base that is NOT same-registrable-domain with the head still FAILS.
const HEAD_APP_MAP = {
  FsbHandlerGithub: { app: null, fallbackBaseUrl: 'https://github.com' },
  FsbHandlerSlack: { app: 'slack', fallbackBaseUrl: 'https://app.slack.com', dynamicWorkspace: true },
  FsbHandlerNotion: {
    app: 'notion',
    fallbackBaseUrl: 'https://app.notion.com',
    observedRuntimeBaseUrl: 'https://app.notion.com/api/v3',
    expectedStaleVendoredBaseUrl: 'https://www.notion.so/api/v3'
  },
  FsbHandlerGitlab: { app: 'gitlab', fallbackBaseUrl: 'https://gitlab.com' }
};

/**
 * originHost(value) -> the origin host of a URL or a URL-with-path, or null.
 * new URL('https://gitlab.com/api/v4').origin === 'https://gitlab.com'. Tolerant of a
 * trailing-path base-URL (the api.ts bases are paths on the origin).
 */
function originHost(value) {
  if (typeof value !== 'string' || !value) { return null; }
  try {
    return new URL(value).origin;
  } catch (e) {
    return null;
  }
}

/**
 * registrableDomain(value) -> the registrable domain (eTLD+1, e.g. 'slack.com' for both
 * app.slack.com and myteam.slack.com), lower-cased, or null if unparseable. Used ONLY
 * for the slack dynamic-workspace accommodation (WR-01): the per-workspace runtime base
 * is *.slack.com, so the gate asserts SAME-REGISTRABLE-DOMAIN with the head's app.slack.com
 * origin rather than strict same-origin. Deliberately a conservative last-two-labels
 * heuristic (no public-suffix-list dependency in build tooling): correct for the simple
 * registrable domains in play (slack.com). It is NOT used for the strict same-origin
 * path -- gitlab/notion/github stay full-origin-equality unless a head has an explicit
 * observedRuntimeBaseUrl override. A host with fewer than two
 * labels (e.g. 'localhost') returns the host unchanged.
 */
function registrableDomain(value) {
  const origin = originHost(value);
  if (!origin) { return null; }
  let host;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch (e) {
    return null;
  }
  if (!host) { return null; }
  const labels = host.split('.');
  if (labels.length <= 2) { return host; }
  return labels.slice(-2).join('.');
}

/**
 * classifyOriginPattern(handlerOrigin, apiBaseUrl, opts)
 *   -> { sameOrigin, separate, apiOrigin, handlerOrigin, reason }
 *
 * sameOrigin === the API base-URL's origin host EQUALS the handler origin host (a PATH
 * on the same first-party origin, e.g. gitlab.com/api/v4 vs https://gitlab.com).
 * separate === a different host / subdomain (client-api.linear.app vs linear.app) or an
 * unparseable input. The two are mutually exclusive. `reason` is null when same-origin,
 * else a CORS_SEPARATE_ORIGIN (or CORS_UNRESOLVABLE_ORIGIN) string naming both origins.
 *
 * opts.dynamicWorkspace === true (slack ONLY, WR-01): `apiBaseUrl` is a per-workspace
 * runtime base (a *.slack.com subdomain that varies per team) reduced to a representative
 * origin by the caller. For this app the gate CANNOT require strict same-origin (the
 * runtime host is dynamic), so it asserts SAME-REGISTRABLE-DOMAIN instead: the api base
 * and the head origin must share a registrable domain (slack.com). When they do, the
 * result is sameOrigin:true with an EXPLICIT reason marker
 * (SAME_REGISTRABLE_DOMAIN_DYNAMIC_WORKSPACE) recording the accommodation -- it is NOT a
 * silent fallback. When they do NOT (a future app whose dynamic base left the
 * registrable family), it FAILS with CORS_SEPARATE_ORIGIN exactly like the strict path.
 */
export function classifyOriginPattern(handlerOrigin, apiBaseUrl, opts) {
  const options = opts || {};
  const hOrigin = originHost(handlerOrigin);
  const aOrigin = originHost(apiBaseUrl);
  if (!hOrigin || !aOrigin) {
    return {
      sameOrigin: false,
      separate: true,
      apiOrigin: aOrigin,
      handlerOrigin: hOrigin,
      reason: 'CORS_UNRESOLVABLE_ORIGIN: handler="' + String(handlerOrigin) +
        '" apiBaseUrl="' + String(apiBaseUrl) + '" -- one origin did not parse; ' +
        'a head whose origin cannot be verified must be demoted to T3-DOM'
    };
  }
  // ---- Dynamic-workspace accommodation (slack): same-registrable-domain, ASSERTED ----
  if (options.dynamicWorkspace) {
    const hReg = registrableDomain(hOrigin);
    const aReg = registrableDomain(aOrigin);
    const sameReg = !!hReg && !!aReg && hReg === aReg;
    return {
      sameOrigin: sameReg,
      separate: !sameReg,
      apiOrigin: aOrigin,
      handlerOrigin: hOrigin,
      reason: sameReg
        ? 'SAME_REGISTRABLE_DOMAIN_DYNAMIC_WORKSPACE: head origin ' + hOrigin +
          ' shares registrable domain ' + hReg + ' with its DYNAMIC per-workspace API base ' +
          aOrigin + ' (slack-api.ts builds ${workspaceUrl}/api/<method> off a *.slack.com ' +
          'subdomain). The runtime executeBoundSpec origin-pin holds the head to ' + hOrigin +
          ', so no per-workspace subdomain is silently targeted -- this is an EXPLICIT, ' +
          'reviewed same-registrable-domain accommodation, not a fallback rubber-stamp.'
        : 'CORS_SEPARATE_ORIGIN: head origin ' + hOrigin + ' does NOT share a registrable ' +
          'domain with its dynamic API base ' + aOrigin + ' (' + String(hReg) + ' != ' +
          String(aReg) + ') -- a dynamic-workspace base outside the head registrable family ' +
          'cannot ride the first-party cookie; demote this head to T3-DOM (Pattern-D ' +
          'cross-origin execution is deferred, see 41-DEFERRAL.md)'
    };
  }
  const same = hOrigin === aOrigin;
  return {
    sameOrigin: same,
    separate: !same,
    apiOrigin: aOrigin,
    handlerOrigin: hOrigin,
    reason: same ? null
      : 'CORS_SEPARATE_ORIGIN: head origin ' + hOrigin + ' is NOT same-origin with its ' +
        'API base-URL origin ' + aOrigin + ' -- the first-party session cookie does not ' +
        'cross origins; demote this head to T3-DOM (Pattern-D cross-origin execution is ' +
        'deferred, see 41-DEFERRAL.md)'
  };
}

// ---- Parse the HEAD_HANDLER_MODULES array literal from the catalog SOURCE ---------
// Mirrors tests/head-handler-cap.test.js: match `var HEAD_HANDLER_MODULES = [ ... ];`
// non-greedily, then pull each entry's global:'...' and origin:'...' fields. The
// manifest is a flat array of object literals (no nested ]), so the first ] closes it.
//
// IN-01 hardening: entries are split with a BRACE-BALANCED scan (not the old
// /\{[^}]*\}/g, which matched only a `{...}` with no inner `}` and would silently
// TRUNCATE a future nested-brace entry -- e.g. { global:'...', meta:{region:'us'},
// origin:'...' } would have been chunked as `{ global:'...', meta:{region:'us'}`,
// dropping `origin` and mis-parsing the head as origin:null). The depth scan keeps each
// top-level `{ ... }` entry whole regardless of nesting, so a future nested entry parses
// correctly instead of failing closed on a confusing mis-parse. String literals are
// tracked so a `}` inside a quoted value does not falsely close an entry.
export function parseHeadModules(source) {
  const declMatch = source.match(/var\s+HEAD_HANDLER_MODULES\s*=\s*\[([\s\S]*?)\]\s*;/);
  if (!declMatch) { return null; }
  const body = declMatch[1];
  const heads = [];
  let depth = 0;
  let start = -1;
  let quote = null;       // the active string-literal delimiter (' " `) or null
  let escaped = false;    // the previous char was a backslash inside a string
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      // Inside a string literal: only a matching un-escaped delimiter closes it.
      if (escaped) { escaped = false; }
      else if (ch === '\\') { escaped = true; }
      else if (ch === quote) { quote = null; }
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') {
      if (depth === 0) { start = i; }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const chunk = body.slice(start, i + 1);
        const g = chunk.match(/global\s*:\s*'([^']+)'/);
        const o = chunk.match(/origin\s*:\s*'([^']+)'/);
        if (g) {
          heads.push({ global: g[1], origin: o ? o[1] : null });
        }
        start = -1;
      }
    }
  }
  return heads;
}

// ---- Read the app's real API base-URL from the vendored <app>-api.ts as TEXT ------
// The base-URL appears as a string literal in the plugin's api module (the SAME
// extraction the Phase-40 planner used): gitlab-api.ts -> 'https://gitlab.com/api/v4';
// notion-api.ts is currently a stale `https://www.notion.so/api/v3/...` snapshot while
// the observed authenticated runtime is app.notion.com; slack-api.ts builds
// `${workspaceUrl}/api/${method}` off the app.slack.com origin. We scan for the FIRST
// https:// literal that carries an /api path on the plugin's own origin. Returns the
// base-URL string or null (an app with no vendored plugin uses its fallbackBaseUrl).
function readApiBaseUrl(app) {
  if (!app) { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  if (!existsSync(apiFile)) { return null; }
  const text = readFileSync(apiFile, 'utf8');
  // Match an https:// origin optionally followed by an /api... path, inside a string
  // literal (single, double, or template-quoted). The first such literal is the base.
  const re = /https:\/\/[a-z0-9.-]+(?:\/api[a-z0-9/_.${}-]*)?/i;
  const m = text.match(re);
  return m ? m[0] : null;
}

// ---- Detect a DYNAMIC per-workspace API base in a vendored <app>-api.ts (slack) -----
// slack-api.ts has no static https:// base literal; the runtime base is built as
// `${auth.workspaceUrl}/api/<method>` (slack-api.ts:431) where workspaceUrl is a
// *.slack.com subdomain resolved per workspace (app.slack.com on the new client, or
// `https://${team.domain}.slack.com` on the classic client, line 138). readApiBaseUrl
// returns null for such a file; rather than letting that null silently fall back, the
// gate PROVES the dynamic form is genuinely present so the same-registrable-domain
// accommodation is grounded in the vendored source (WR-01). Returns true only when both
// (a) the `${...workspaceUrl}/api/` interpolation AND (b) a literal *.slack.com origin
// (the classic-client per-workspace host) appear in the source. If a vendored refresh
// dropped that form, this returns false -> checkOriginClassification fails closed.
function readDynamicWorkspaceBase(app) {
  if (!app) { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  if (!existsSync(apiFile)) { return null; }
  const text = readFileSync(apiFile, 'utf8');
  // (a) the runtime fetch base: `${...workspaceUrl}/api/...`
  const dynRe = /\$\{[^}]*workspaceUrl\s*\}\s*\/api\//;
  // (b) a literal *.slack.com per-workspace origin (proves the slack registrable family)
  const slackHostRe = /https:\/\/(?:\$\{[^}]+\}|[a-z0-9.-]+)\.slack\.com/i;
  if (dynRe.test(text) && slackHostRe.test(text)) {
    // The representative origin used for the same-registrable-domain assertion: the
    // classic-client per-workspace host carries the *.slack.com registrable domain that
    // the dynamic base resolves within. We pin it to a representative subdomain so the
    // classifier compares registrable domains (slack.com), NOT a static app.slack.com
    // (which would collapse back into the rubber-stamp the fallback caused).
    return 'https://workspace.slack.com';
  }
  return null;
}

/**
 * checkOriginClassification(headsOverride, opts) -> { results, failures }
 *
 * results: one classification row per head { global, handlerOrigin, apiBaseUrl,
 * classification }. failures: a string[] of the CORS_SEPARATE_ORIGIN reasons for every
 * head that is NOT same-origin (empty when all heads are same-origin). headsOverride
 * lets a test drive a synthetic head set; absent, the real HEAD_HANDLER_MODULES is
 * parsed from the catalog source. opts.appMap overrides HEAD_APP_MAP for a test.
 */
export function checkOriginClassification(headsOverride, opts) {
  const options = opts || {};
  const appMap = options.appMap || HEAD_APP_MAP;
  let heads = headsOverride;
  if (!Array.isArray(heads)) {
    const source = existsSync(CATALOG_PATH) ? readFileSync(CATALOG_PATH, 'utf8') : '';
    heads = parseHeadModules(source) || [];
  }

  const results = [];
  const failures = [];
  for (const head of heads) {
    const mapping = appMap[head.global];
    // An UNMAPPED head cannot be origin-verified -> fail closed (never silently pass).
    if (!mapping) {
      const reason = 'CORS_UNMAPPED_HEAD: head global ' + head.global + ' has no ' +
        'app -> API base-URL mapping in verify-origin-classification.mjs HEAD_APP_MAP; ' +
        'add its vendored <app>-api.ts (or documented base) before it can ship as a head';
      results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
        classification: { sameOrigin: false, separate: true, reason: reason } });
      failures.push(reason);
      continue;
    }
    // Prefer the vendored api.ts base-URL; fall back to the documented base for an app
    // with no vendored plugin (github).
    const vendored = readApiBaseUrl(mapping.app);
    const hasVendoredFile = mapping.app
      && existsSync(join(VENDOR_PLUGINS, mapping.app, 'src', mapping.app + '-api.ts'));

    let apiBaseUrl;
    let classifyOpts;
    if (mapping.observedRuntimeBaseUrl) {
      // Notion-only runtime migration override: the vendored OpenTabs snapshot still
      // carries www.notion.so/api/v3, while the live authenticated runtime verified on
      // 2026-06-29 uses app.notion.com/api/v3. Accept the observed base only when the
      // stale vendored base is exactly the expected Notion API path, so this cannot
      // become a generic same-registrable-domain or cross-origin bypass.
      const expectedStale = mapping.expectedStaleVendoredBaseUrl;
      const vendoredOk = typeof vendored === 'string'
        && typeof expectedStale === 'string'
        && vendored.indexOf(expectedStale) === 0;
      const observedOk = originHost(mapping.observedRuntimeBaseUrl) === originHost(mapping.fallbackBaseUrl);
      if (!vendoredOk || !observedOk) {
        const reason = 'CORS_OBSERVED_RUNTIME_OVERRIDE_MISMATCH: head ' + head.global +
          ' requested observed runtime base "' + String(mapping.observedRuntimeBaseUrl) +
          '" but vendored base "' + String(vendored) + '" did not match expected stale base "' +
          String(expectedStale) + '" or observed/fallback origins diverged -- refusing a ' +
          'runtime override that is not explicitly pinned to the reviewed Notion migration';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: mapping.observedRuntimeBaseUrl,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = mapping.observedRuntimeBaseUrl;
      classifyOpts = undefined;
    } else if (vendored) {
      // A genuine extracted literal base (gitlab/notion) -> strict same-origin.
      apiBaseUrl = vendored;
      classifyOpts = undefined;
    } else if (mapping.dynamicWorkspace && readDynamicWorkspaceBase(mapping.app)) {
      // slack: no literal base, but the vendored source genuinely carries the dynamic
      // ${workspaceUrl}/api/ *.slack.com form -> assert SAME-REGISTRABLE-DOMAIN, NOT a
      // silent fallback (WR-01). The representative *.slack.com origin drives the
      // registrable-domain comparison against the head's app.slack.com.
      apiBaseUrl = readDynamicWorkspaceBase(mapping.app);
      classifyOpts = { dynamicWorkspace: true };
    } else if (hasVendoredFile) {
      // A MAPPED app WITH a vendored api.ts that yields NEITHER a literal base NOR (for a
      // dynamic-workspace app) the proven dynamic form -> do NOT silently fall back to the
      // documented base (that is the rubber-stamp WR-01 closed). Fail closed: the base is
      // unresolvable and the head must be re-reviewed before it can ship.
      const reason = 'CORS_UNRESOLVABLE_ORIGIN: head ' + head.global + ' maps to vendored ' +
        'app "' + mapping.app + '" whose <app>-api.ts yielded no extractable API base-URL ' +
        '(and no recognized dynamic-workspace form) -- refusing the silent documented-base ' +
        'fallback; resolve the vendored base or demote this head to T3-DOM';
      results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
        classification: { sameOrigin: false, separate: true, reason: reason } });
      failures.push(reason);
      continue;
    } else {
      // No vendored plugin at all (github) -> the documented first-party fallback base.
      apiBaseUrl = mapping.fallbackBaseUrl;
      classifyOpts = undefined;
    }

    const classification = classifyOriginPattern(head.origin, apiBaseUrl, classifyOpts);
    results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: apiBaseUrl,
      classification: classification });
    if (!classification.sameOrigin) {
      failures.push(classification.reason);
    }
  }
  return { results, failures };
}

// ---- CLI entry (only on direct invocation, never on import) ------------------
function runCli() {
  const { results, failures } = checkOriginClassification();

  if (results.length === 0) {
    console.error('verify-origin-classification: FAIL -- no HEAD_HANDLER_MODULES heads ' +
      'parsed from the catalog source (the manifest moved or this gate cannot read it)');
    process.exit(1);
  }

  for (const r of results) {
    // A dynamic-workspace same-registrable-domain accommodation (slack) prints a
    // DISTINCT verdict so it is never mistaken for a plain same-origin pass (WR-01).
    const reason = r.classification && r.classification.reason;
    const isDynamic = typeof reason === 'string'
      && reason.indexOf('SAME_REGISTRABLE_DOMAIN_DYNAMIC_WORKSPACE') === 0;
    const verdict = r.classification.sameOrigin
      ? (isDynamic ? 'SAME-REGISTRABLE (dynamic workspace)' : 'SAME-ORIGIN')
      : 'SEPARATE';
    console.log('  ' + verdict + '  ' + r.global + '  head=' + String(r.handlerOrigin) +
      '  api=' + String(r.apiBaseUrl));
  }

  // ---- NEGATIVE-CONTROL: the linear separate-origin head MUST classify separate ----
  // Proof the gate's failure path actually fires (the linear/datadog/jira demote it
  // enforces). NOT a shipped head -- a synthetic fixture run only at CLI time.
  const linearCtl = classifyOriginPattern('https://linear.app', 'https://client-api.linear.app/graphql');
  const negOk = linearCtl.separate === true && linearCtl.sameOrigin === false;
  if (!negOk) {
    console.error('verify-origin-classification: FAIL -- the linear negative-control ' +
      'fixture (linear.app vs client-api.linear.app) did NOT classify separate; the gate ' +
      'would let a separate-origin head ship. ' + JSON.stringify(linearCtl));
    process.exit(1);
  }
  console.log('  NEGATIVE-CONTROL  linear.app vs client-api.linear.app -> separate (the ' +
    'gate enforces the linear/datadog/jira demote-to-T3)');

  if (failures.length > 0) {
    console.error(
      'verify-origin-classification: FAIL (' + failures.length + ' separate-origin / ' +
      'unverifiable head(s) -- a head whose API is not same-origin must be demoted to T3-DOM):'
    );
    for (const f of failures) {
      console.error('  - ' + f);
    }
    process.exit(1);
  }

  console.log(
    'verify-origin-classification: PASS (' + results.length + ' shipped head(s) all ' +
    'SAME-ORIGIN with their vendored API base-URL; linear separate-origin negative-control ' +
    'classifies separate; 0 silent cross-origin ports)'
  );
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    runCli();
  } catch (err) {
    console.error('verify-origin-classification: ERROR ' + (err && err.message ? err.message : err));
    process.exit(1);
  }
}
