#!/usr/bin/env node
'use strict';

/**
 * Phase 41 Plan 01 (DEPTH-02) -- the SC1 fail-closed guarded-write proof harness.
 *
 * THE SECURITY KEYSTONE of the guarded-write phase. Every WRITE head shipped this
 * milestone ships FAIL-CLOSED: handle() returns the dual-field
 * RECIPE_DOM_FALLBACK_PENDING and NEVER calls ctx.executeBoundSpec -- so NO mutation
 * fires for an [ASSUMED-ENDPOINT] write until a live-captured body activates it (the
 * shipped github.issues.create pattern, catalog/handlers/github.js:111-123).
 *
 * For each Phase-41 guarded write slug (WRITE_HEADS): if its handler module exists,
 * require it fresh, invoke handle({}, ctx) with a RECORDING executeBoundSpec stub, and
 * assert:
 *   (a) result.code === 'RECIPE_DOM_FALLBACK_PENDING'
 *   (b) result.errorCode === result.error === result.code   (INV-03 dual-field)
 *   (c) result.success === false
 *   (d) result.fellBackToDom === true
 *   (e) the executeBoundSpec recorder array length === 0   (NO mutation fired)
 *
 * The recorder-stays-EMPTY check (e) is the load-bearing assertion: a write that calls
 * ctx.executeBoundSpec for an unverified [ASSUMED] mutation REDS this gate. (a)-(d)
 * alone are not enough -- a handler could return the typed reason AND still have fired
 * a mutation; (e) forbids that.
 *
 * NEGATIVE CONTROL: a synthetic in-test handler that DOES call ctx.executeBoundSpec is
 * run through the same recording-ctx path; the recorder MUST be non-empty afterward.
 * This proves the harness genuinely distinguishes a mutation-firing write from a
 * fail-closed one (a green that could never red is worthless).
 *
 * Wave-0 RED-by-design: the write slugs do not exist until plans 02/03/04 land them.
 * An absent handler file OR a missing slug entry emits ONE deterministic FAIL per slug
 * (the existsSync pattern mirrored from tests/head-handler-upgrade.test.js). The gate
 * turns GREEN as each plan registers its writes; 41-05 requires EXIT 0.
 *
 * Zero-framework FSB convention: module-level passed/failed counters, check(cond,msg),
 * process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/guarded-write-failclosed.test.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const HANDLERS_DIR = path.join(REPO_ROOT, 'catalog', 'handlers');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

// ---- The Phase-41 guarded WRITE slugs + their handler modules + first-party origins.
//
// Each slug EXISTS as catalog/descriptors/opentabs__<app>__<op>.json (backing:'dom',
// sideEffectClass:'write', DOT-form slug). The write head registers the EXACT slug so
// resolve() upgrades the breadth descriptor dom->T1a (proven separately in
// head-handler-upgrade.test.js); THIS harness proves each write is INERT (fail-closed).
// origin is the app's OWN first-party origin (Wall 2). handlerFile is the module that
// ports the write.
const WRITE_HEADS = [
  // gitlab x3 -- EXTEND the existing module (41-02), origin https://gitlab.com
  { slug: 'gitlab.create_issue', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.create_merge_request', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.create_note', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  // notion x3 -- EXTEND the existing module (41-03), origin https://www.notion.so
  { slug: 'notion.create_page', origin: 'https://www.notion.so', handlerFile: 'notion.js' },
  { slug: 'notion.update_page', origin: 'https://www.notion.so', handlerFile: 'notion.js' },
  { slug: 'notion.create_database_item', origin: 'https://www.notion.so', handlerFile: 'notion.js' },
  // slack x1 -- EXTEND the existing module (41-04), origin https://app.slack.com
  { slug: 'slack.send_message', origin: 'https://app.slack.com', handlerFile: 'slack.js' }
];

// makeRecordingCtx(origin) -> { recorder, ctx }. The ctx.executeBoundSpec stub pushes
// every { spec, tabId } it receives onto the exposed recorder array and resolves a
// canned { success:true } 200. A FAIL-CLOSED write never touches this member, so its
// recorder stays EMPTY. The recorder is the proof surface for assertion (e).
function makeRecordingCtx(origin) {
  const recorder = [];
  return {
    recorder,
    ctx: {
      origin: origin,
      tabId: 99,
      async executeBoundSpec(spec, tabId) {
        recorder.push({ spec: spec, tabId: tabId });
        return { success: true, status: 200, data: { ok: true }, text: null };
      }
    }
  };
}

// Fresh-require a handler module so its self-registration runs against the current
// global, and return its slug-keyed export object. Clearing the cache makes each
// invocation independent (a handler self-registers at require time). Returns null if
// the file is absent (Wave-0 RED leg).
function freshRequireHandler(handlerFile) {
  const p = path.join(HANDLERS_DIR, handlerFile);
  if (!fs.existsSync(p)) { return null; }
  try { delete require.cache[require.resolve(p)]; } catch (e) { /* not cached */ }
  return require(p);
}

(async function run() {
  console.log('--- DEPTH-02 SC1 fail-closed guarded-write harness (Phase 41) ---');

  // ===== The Phase-41 guarded writes: each must be INERT (fail-closed) =============
  for (let i = 0; i < WRITE_HEADS.length; i++) {
    const row = WRITE_HEADS[i];
    const handlers = freshRequireHandler(row.handlerFile);

    if (!handlers) {
      // Wave-0: the handler module is absent -> a single deterministic FAIL (the
      // correct RED). Its plan turns this PASS.
      check(false, 'FAILCLOSED ' + row.slug + ' (handler ' + row.handlerFile +
        ' not present yet -- expected Wave-0 RED, GREEN after its plan lands)');
      continue;
    }

    const entry = handlers[row.slug];
    if (!entry || typeof entry.handle !== 'function') {
      // The module exists but the write slug has not been registered yet -> one
      // deterministic FAIL (the correct RED until the slug's plan lands).
      check(false, 'FAILCLOSED ' + row.slug + ' (slug not yet added to ' +
        row.handlerFile + ' -- expected Wave-0 RED, GREEN after its plan lands)');
      continue;
    }

    const rec = makeRecordingCtx(row.origin);
    let result;
    try {
      result = await entry.handle({}, rec.ctx);
    } catch (e) {
      check(false, 'FAILCLOSED ' + row.slug + ' handle() threw: ' +
        (e && e.message ? e.message : e));
      continue;
    }

    // (a) the typed reason code
    check(result && result.code === 'RECIPE_DOM_FALLBACK_PENDING',
      'FAILCLOSED ' + row.slug + ' -> code === RECIPE_DOM_FALLBACK_PENDING; got ' +
      (result ? result.code : 'null'));
    // (b) INV-03 dual-field byte-equality (code === errorCode === error)
    check(result && result.errorCode === result.code && result.error === result.code,
      'FAILCLOSED ' + row.slug + ' -> errorCode === error === code (INV-03 dual-field)');
    // (c) success false
    check(result && result.success === false,
      'FAILCLOSED ' + row.slug + ' -> success === false');
    // (d) fellBackToDom marker
    check(result && result.fellBackToDom === true,
      'FAILCLOSED ' + row.slug + ' -> fellBackToDom === true');
    // (e) THE keystone: the executeBoundSpec recorder stayed EMPTY (no mutation fired)
    check(rec.recorder.length === 0,
      'FAILCLOSED ' + row.slug + ' -> executeBoundSpec recorder is EMPTY (NO mutation fired -- the SC1 keystone); got ' +
      rec.recorder.length + ' call(s)');
  }

  // ===== NEGATIVE CONTROL: the harness catches a mutation-firing write =============
  // A synthetic handler that DOES call ctx.executeBoundSpec proves the recorder is a
  // real proof surface: after invoking it the recorder MUST be non-empty. If this did
  // NOT fire, assertion (e) above could never red (a worthless green).
  const mutatingHandler = {
    async handle(args, ctx) {
      await ctx.executeBoundSpec({
        url: 'https://example.com/api/mutate', method: 'POST',
        headers: {}, body: '{}', query: {},
        authStrategy: 'same-origin-cookie', origin: 'https://example.com', extract: '@'
      }, ctx.tabId);
      return { success: true };
    }
  };
  const negRec = makeRecordingCtx('https://example.com');
  await mutatingHandler.handle({}, negRec.ctx);
  check(negRec.recorder.length !== 0,
    'NEGATIVE CONTROL: a synthetic mutation-firing handler leaves the recorder NON-empty ' +
    '(proves the harness distinguishes a fired mutation from a fail-closed write); got ' +
    negRec.recorder.length + ' call(s)');

  // ---- Exit convention --------------------------------------------------------
  console.log('\nguarded-write-failclosed: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (err) {
  console.error('FATAL (guarded-write-failclosed):', err && err.stack ? err.stack : err);
  console.log('  passed:', passed);
  console.log('  failed:', failed + 1);
  process.exit(1);
});
