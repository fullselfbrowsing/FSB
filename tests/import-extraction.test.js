#!/usr/bin/env node
/**
 * Phase 36 / Plan 01 (CGEN-01) -- importer zod->closed-params extraction.
 *
 * Drives z.toJSONSchema over a small fixture Zod schema and asserts the
 * EMPIRICALLY-VERIFIED Mechanic-1 shapes the importer relies on:
 *   - z.object() emits additionalProperties:false BY DEFAULT (the closed contract)
 *   - an optional key DROPS from `required`
 *   - z.union -> anyOf
 *   - z.enum -> { type:string, enum:[...] }
 *   - z.string().default('x') emits "default":"x" AND the key STAYS in required
 *   - $schema is stripped by the importer's normalizer
 *
 * Also imports the importer module (scripts/import-opentabs-catalog.mjs) and
 * exercises its exported `toClosedParams` helper to prove the importer's own
 * normalization (z.toJSONSchema + delete $schema) yields the closed shape.
 *
 * Zero-framework convention: PASS=/FAIL=, process.exit(1) on any failure.
 */
'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

let passed = 0;
let failed = 0;
function check(cond, label) {
  if (cond) {
    passed++;
    console.log('  PASS ' + label);
  } else {
    failed++;
    console.error('  FAIL ' + label);
  }
}

async function main() {
  // zod is a devDependency (build-time); this is a build-time test, so importing
  // it here is fine (the test never ships to the browser).
  const { z } = await import('zod');
  const importerUrl = pathToFileURL(
    path.resolve(__dirname, '..', 'scripts', 'import-opentabs-catalog.mjs')
  ).href;
  const importer = await import(importerUrl);

  check(typeof importer.toClosedParams === 'function', 'importer exports toClosedParams');

  // ---- 1. z.object closed-by-default + optional drops from required ----------
  const objSchema = z.object({
    title: z.string().min(1),
    body: z.string().optional(),
  });
  const objParams = importer.toClosedParams(objSchema);
  check(objParams.type === 'object', 'object -> type:object');
  check(objParams.additionalProperties === false, 'object -> additionalProperties:false by default');
  check(Array.isArray(objParams.required) && objParams.required.includes('title'), 'required includes title');
  check(Array.isArray(objParams.required) && !objParams.required.includes('body'), 'optional body drops from required');
  check(objParams.$schema === undefined, '$schema is stripped');

  // ---- 2. z.union -> anyOf --------------------------------------------------
  const unionParams = importer.toClosedParams(z.object({ v: z.union([z.string(), z.number()]) }));
  const vSchema = unionParams.properties && unionParams.properties.v;
  check(!!vSchema && Array.isArray(vSchema.anyOf), 'union -> anyOf');
  check(
    !!vSchema && Array.isArray(vSchema.anyOf) &&
      vSchema.anyOf.some((b) => b.type === 'string') &&
      vSchema.anyOf.some((b) => b.type === 'number'),
    'anyOf carries string + number branches'
  );

  // ---- 3. z.enum -> { type:string, enum:[...] } -----------------------------
  const enumParams = importer.toClosedParams(z.object({ state: z.enum(['open', 'closed', 'all']) }));
  const stateSchema = enumParams.properties && enumParams.properties.state;
  check(!!stateSchema && stateSchema.type === 'string', 'enum -> type:string');
  check(
    !!stateSchema && Array.isArray(stateSchema.enum) &&
      stateSchema.enum.length === 3 && stateSchema.enum.includes('open'),
    'enum -> enum:[open,closed,all]'
  );

  // ---- 4. default emits "default" AND stays required ------------------------
  const defParams = importer.toClosedParams(z.object({ mode: z.string().default('hi') }));
  const modeSchema = defParams.properties && defParams.properties.mode;
  check(!!modeSchema && modeSchema.default === 'hi', 'default value emitted');
  check(Array.isArray(defParams.required) && defParams.required.includes('mode'), 'defaulted key STAYS in required');

  // ---- 5. LO-02 (43-REVIEW): isOverClaim is WHOLE-WORD, not substring -------
  // The over-claim guard's `\b<tok>\b` boundary is load-bearing for correctness: a
  // guarded token must drop only a WHOLE-WORD cross-claim, never a substring (a future
  // "simplify to .includes(tok)" would over-drop "statuses"/"pages" phrasings + shift
  // rankings with no other safety net, since the corpus-tier is RECORDED). Pin it.
  check(typeof importer.isOverClaim === 'function', 'importer exports isOverClaim (LO-02)');
  check(importer.OVER_CLAIM_GUARD && Array.isArray(importer.OVER_CLAIM_GUARD['sentry.update_issue'])
    && importer.OVER_CLAIM_GUARD['sentry.update_issue'].includes('status'),
    'OVER_CLAIM_GUARD[sentry.update_issue] guards the "status" token (the fixture for the whole-word pin)');
  // The guarded 'status' token MATCHES a whole-word cross-claim ("status update" -> dropped).
  check(importer.isOverClaim('sentry.update_issue', 'tweet a status update') === true,
    'isOverClaim: a WHOLE-WORD guarded token ("status" in "tweet a status update") IS dropped (the intended cross-claim suppression)');
  // The guarded 'status' token does NOT match inside "statuses" ("view all issue statuses"
  // stays -- a sentry issue-status read is NOT wrongly dropped). THIS is the whole-word
  // contract a substring guard would break.
  check(importer.isOverClaim('sentry.update_issue', 'view all issue statuses') === false,
    'isOverClaim: a SUBSTRING-only match ("status" inside "statuses" in "view all issue statuses") is NOT dropped -- whole-word, not substring (a .includes(tok) refactor would FAIL this)');
  // An unguarded slug never drops anything.
  check(importer.isOverClaim('linear.create_issue', 'tweet a status update') === false,
    'isOverClaim: a slug with no OVER_CLAIM_GUARD entry drops nothing (the guard is per-slug)');

  // ---- transport-signal extraction (method max-merge + plugin-api default) ----
  check(typeof importer.extractTransportSignalsFromText === 'function',
    'importer exports extractTransportSignalsFromText (the pure text scan)');
  check(typeof importer.pluginApiDefaultMethodFromText === 'function',
    'importer exports pluginApiDefaultMethodFromText');

  // (t1) Method literals MAX-merge: an op that POSTs on one leg and DELETEs on
  // another persists the MOST-SEVERE method, not the first literal (the
  // starbucks.toggle_favorite_store shape: favorite POST, unfavorite DELETE).
  const toggleShape =
    "if (params.favorite) {\n  await api('/stores/favorites', {\n    method: 'POST',\n    body: { storeNumber: params.store_number },\n  });\n} else {\n  await api(`/stores/favorites/${params.store_number}`, {\n    method: 'DELETE',\n  });\n}";
  const t1 = importer.extractTransportSignalsFromText(toggleShape, '');
  check(t1.httpMethod === 'DELETE',
    '(t1) POST-then-DELETE literals max-merge to DELETE (was first-literal POST)');
  const t1b = importer.extractTransportSignalsFromText(
    "await api('/x', { method: 'DELETE' });\nawait api('/y', { method: 'POST' });", '');
  check(t1b.httpMethod === 'DELETE',
    '(t1) DELETE-then-POST also yields DELETE (order-independent, severity-keyed)');

  // (t2) Helper max-merge stays intact: apiGet before apiPost -> apiPost/POST
  // (the datadog.clone_dashboard shape).
  const t2 = importer.extractTransportSignalsFromText(
    'const original = await apiGet<Rec>(`/api/v1/dashboard/${id}`);\nconst created = await apiPost<Rec>(`/api/v1/dashboard`, body);', '');
  check(t2.transportHelper === 'apiPost' && t2.httpMethod === 'POST',
    '(t2) apiGet-then-apiPost max-merges to apiPost/POST (clone_dashboard unchanged)');

  // (t3) Generic api + no literal + plugin api() defaulting GET -> GET.
  const getApi = "export const api = async (endpoint, options = {}) => {\n  const method = options.method ?? 'GET';\n  return fetchJSON(endpoint, { method });\n};\nexport const other = 1;";
  const t3 = importer.extractTransportSignalsFromText('const d = await api(`/x`);', getApi);
  check(t3.transportHelper === 'api' && t3.httpMethod === 'GET',
    '(t3) generic api with a confirmed per-plugin GET default stamps GET');
  check(importer.pluginApiDefaultMethodFromText(getApi) === 'GET',
    '(t3) pluginApiDefaultMethodFromText reads the ?? GET default');

  // (t4) Generic api + a MUTATING per-plugin default (POST-RPC innertube/uber
  // shape) -> NO method stamped (the wire method is uninformative; the op-name
  // verb classifies, and deriveClass floors ambiguous verbs to write). Blindly
  // stamping GET was the youtube.subscribe-classed-read false-negative;
  // stamping POST would flip every RPC READ to write.
  const postApi = "export const api = async (endpoint, body) => {\n  const method = body === undefined ? 'GET' : 'POST';\n  return fetchJSON(endpoint, { method: options.method ?? 'POST' });\n};\nexport const other = 1;";
  const t4 = importer.extractTransportSignalsFromText('const d = await api(`/x`, payload);', postApi);
  check(t4.transportHelper === 'api' && t4.httpMethod === null,
    '(t4) generic api with a mutating per-plugin default stamps NO method (RPC carve-out)');

  // (t5) An UNCONDITIONALLY hardcoded POST api() (no caller method at all) is
  // recognized as a POST default -> RPC carve-out (no GET understatement).
  const hardcodedApi = "export const api = async (endpoint, body) => {\n  const init = { method: 'POST', headers: {} };\n  return fetchJSON(endpoint, init);\n};\nexport const other = 1;";
  check(importer.pluginApiDefaultMethodFromText(hardcodedApi) === 'POST',
    '(t5) an unconditionally-POST api() reads as a POST default');
  const t5 = importer.extractTransportSignalsFromText('const d = await api(`/x`);', hardcodedApi);
  check(t5.httpMethod === null,
    '(t5) generic api over a hardcoded-POST helper stamps NO method (never a fabricated GET)');

  // (t6) No plugin api source at all -> the documented GET default stands.
  const t6 = importer.extractTransportSignalsFromText('const d = await api(`/x`);', '');
  check(t6.transportHelper === 'api' && t6.httpMethod === 'GET',
    '(t6) generic api with no plugin source keeps the documented GET default');

  // ---- report ---------------------------------------------------------------
  if (failed > 0) {
    console.error('import-extraction.test: FAIL (' + failed + ' failure(s), ' + passed + ' passed)');
    process.exit(1);
  }
  console.log('import-extraction.test: PASS (' + passed + ' checks)');
  process.exit(0);
}

main().catch((err) => {
  console.error('import-extraction.test: ERROR ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
