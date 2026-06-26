#!/usr/bin/env node
/**
 * Phase 41 / Plan 01 (v1.0.0 Full App Catalog -- DEPTH-02) -- the CORS /
 * FIRST-PARTY-ORIGIN VERIFICATION GATE (the SC3 fail-closed shipping guarantee).
 *
 * THE TRAP THIS CLOSES: a T1a head builds a credentialed same-origin-cookie spec and
 * hands it to executeBoundSpec, which pins the active tab to spec.origin (Wall 2). That
 * is SAFE only when the handler origin is SAME-ORIGIN with the app's real API base-URL
 * -- a PATH on the first-party origin (gitlab.com/api/v4, www.notion.so/api/v3). If a
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
const HEAD_APP_MAP = {
  FsbHandlerGithub: { app: null, fallbackBaseUrl: 'https://github.com' },
  FsbHandlerSlack: { app: 'slack', fallbackBaseUrl: 'https://app.slack.com' },
  FsbHandlerNotion: { app: 'notion', fallbackBaseUrl: 'https://www.notion.so' },
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
 * classifyOriginPattern(handlerOrigin, apiBaseUrl)
 *   -> { sameOrigin, separate, apiOrigin, handlerOrigin, reason }
 *
 * sameOrigin === the API base-URL's origin host EQUALS the handler origin host (a PATH
 * on the same first-party origin, e.g. gitlab.com/api/v4 vs https://gitlab.com).
 * separate === a different host / subdomain (client-api.linear.app vs linear.app) or an
 * unparseable input. The two are mutually exclusive. `reason` is null when same-origin,
 * else a CORS_SEPARATE_ORIGIN (or CORS_UNRESOLVABLE_ORIGIN) string naming both origins.
 */
export function classifyOriginPattern(handlerOrigin, apiBaseUrl) {
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
function parseHeadModules(source) {
  const declMatch = source.match(/var\s+HEAD_HANDLER_MODULES\s*=\s*\[([\s\S]*?)\]\s*;/);
  if (!declMatch) { return null; }
  const body = declMatch[1];
  // Split into entries on the `}` boundary so global+origin stay paired per entry.
  const heads = [];
  const entryRe = /\{[^}]*\}/g;
  let m;
  while ((m = entryRe.exec(body)) !== null) {
    const chunk = m[0];
    const g = chunk.match(/global\s*:\s*'([^']+)'/);
    const o = chunk.match(/origin\s*:\s*'([^']+)'/);
    if (g) {
      heads.push({ global: g[1], origin: o ? o[1] : null });
    }
  }
  return heads;
}

// ---- Read the app's real API base-URL from the vendored <app>-api.ts as TEXT ------
// The base-URL appears as a string literal in the plugin's api module (the SAME
// extraction the Phase-40 planner used): gitlab-api.ts -> 'https://gitlab.com/api/v4';
// notion-api.ts -> `https://www.notion.so/api/v3/...`; slack-api.ts builds
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
    const apiBaseUrl = vendored || mapping.fallbackBaseUrl;
    const classification = classifyOriginPattern(head.origin, apiBaseUrl);
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
    const verdict = r.classification.sameOrigin ? 'SAME-ORIGIN' : 'SEPARATE';
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
