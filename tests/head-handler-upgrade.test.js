#!/usr/bin/env node
'use strict';

/**
 * Phase 40 Plan 01 (DEPTH-01) -- the dom->T1a upgrade-assertion harness.
 *
 * THE CORRECTNESS KEYSTONE of the depth phase. A hand-ported READ head must
 * register the EXACT opentabs descriptor slug (dot-form, read from
 * catalog/descriptors/opentabs__<app>__<op>.json) so capability-catalog.resolve()
 * -- which checks the REGISTRY first (capability-catalog.js:329, :396-403) --
 * UPGRADES the breadth descriptor from its backing:'dom' T3 resolution
 * (capability-catalog.js:347-355) to a T1a head with the registered handler.
 *
 * A WRONG slug does NOT upgrade -- it mints a DEAD second REGISTRY entry while the
 * real breadth slug still resolves T3. Only this harness catches that silent
 * failure mode (the head-handlers unit suite asserts the handler's own behavior;
 * it never asserts the breadth slug actually flipped tier). This file is the sole
 * proof that "each hand-port UPGRADES its existing opentabs slug dom->T1a" instead
 * of duplicating it.
 *
 * Asserts, for the 10 Phase-40 READ slugs:
 *   - resolve(slug, originForThatApp) returns tier 'T1a' (NOT 'T3')
 *   - the resolved descriptor.slug equals the ported slug BYTE-EXACT
 *   - the resolved entry exposes a handler with an async handle
 * Plus:
 *   - NEGATIVE CONTROL: a deliberately-wrong slug (gitlab.list_projectz) does NOT
 *     resolve T1a -- a mis-registered slug is a dead duplicate, not an upgrade.
 *   - BEFORE/AFTER for one slug: with FsbRecipeIndex seeded with the real
 *     backing:'dom' descriptor but the handler NOT required, resolve() is 'T3';
 *     after requiring the handler (fresh catalog), 'T1a'. This is the upgrade
 *     itself, demonstrated end-to-end.
 *
 * Wave-0 note: gitlab.js does not exist until 40-02. The gitlab rows are guarded
 * by existsSync; absent, they emit a single deterministic FAIL each (the correct
 * Wave-0 RED). 40-02 turns the gitlab rows GREEN; 40-05 requires EXIT 0.
 *
 * Zero-framework FSB convention: module-level passed/failed counters, check(cond,
 * msg), process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/head-handler-upgrade.test.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-catalog.js');
const HANDLERS_DIR = path.join(REPO_ROOT, 'catalog', 'handlers');
const DESCRIPTORS_DIR = path.join(REPO_ROOT, 'catalog', 'descriptors');

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

// ---- The Phase-40/41/46/48 ported slugs + their FIRST-PARTY origins -----------
//
// Each slug EXISTS as catalog/descriptors/opentabs__<app>__<op>.json (backing:
// 'dom', sideEffectClass:'read', DOT-form slug). The slug strings here are read
// from those descriptors -- NOT invented. origin is the app's OWN first-party
// origin (Wall 2), which the handler registers and resolve() returns on the T1a
// entry. handlerFile is the catalog/handlers module that ports the slug.
const PORTED = [
  // gitlab x5 -- NEW module (40-02), origin https://gitlab.com
  { slug: 'gitlab.list_projects', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.get_project', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.list_issues', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.get_issue', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.list_merge_requests', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  // netlify x4 -- NEW same-origin read module (46), origin https://app.netlify.com
  { slug: 'netlify.list_sites', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.get_site', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_deploys', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_forms', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  // bitbucket x3 -- NEW same-origin read module (46), origin https://bitbucket.org
  { slug: 'bitbucket.list_workspaces', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.list_repositories', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.get_repository', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  // circleci x3 -- NEW same-origin read module (46), origin https://app.circleci.com
  { slug: 'circleci.get_current_user', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.list_pipelines', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_project', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  // circleci x7 -- EXTEND same-origin read module (48), origin https://app.circleci.com
  { slug: 'circleci.get_pipeline', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_pipeline_workflows', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_workflow', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_workflow_jobs', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_job', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_job_artifacts', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_job_tests', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  // vercel x7 -- NEW same-origin read module (48), origin https://vercel.com
  { slug: 'vercel.get_user', origin: 'https://vercel.com', handlerFile: 'vercel.js' },
  { slug: 'vercel.list_teams', origin: 'https://vercel.com', handlerFile: 'vercel.js' },
  { slug: 'vercel.list_projects', origin: 'https://vercel.com', handlerFile: 'vercel.js' },
  { slug: 'vercel.get_project', origin: 'https://vercel.com', handlerFile: 'vercel.js' },
  { slug: 'vercel.list_deployments', origin: 'https://vercel.com', handlerFile: 'vercel.js' },
  { slug: 'vercel.get_deployment', origin: 'https://vercel.com', handlerFile: 'vercel.js' },
  { slug: 'vercel.list_domains', origin: 'https://vercel.com', handlerFile: 'vercel.js' },
  // retool x16 -- NEW same-origin read module (51), origin https://retool.com
  { slug: 'retool.get_current_user', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_organization', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_source_control_settings', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_workflow_run_count', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_workflows_config', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_agents', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_apps', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_branches', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_environments', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_experiments', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_grids', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_page_names', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_playground_queries', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_resources', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_user_spaces', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_workflows', origin: 'https://retool.com', handlerFile: 'retool.js' },
  // slack x3 -- EXTEND existing module (40-03), origin https://app.slack.com
  { slug: 'slack.list_channels', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  { slug: 'slack.list_members', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  { slug: 'slack.get_channel_info', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  // notion x2 -- EXTEND existing module (40-04), origin https://app.notion.com
  { slug: 'notion.search', origin: 'https://app.notion.com', handlerFile: 'notion.js' },
  { slug: 'notion.get_database', origin: 'https://app.notion.com', handlerFile: 'notion.js' },

  // ===== Phase 41 (DEPTH-02) guarded WRITE slugs ============================
  // Each EXISTS as catalog/descriptors/opentabs__<app>__<op>.json (backing:'dom',
  // sideEffectClass:'WRITE'). The write head registers the EXACT slug so resolve()
  // UPGRADES the breadth WRITE descriptor dom->T1a (slug-exact, the same mechanism as
  // the read rows). expectWrite drives an ADDITIONAL assertion that the upgraded
  // descriptor.sideEffectClass === 'write' (the write rows carry the write class --
  // distinct from the read rows). The existsSync Wave-0-RED guard still applies: the
  // handler files exist, so each write row resolves the breadth T3 until ITS plan adds
  // the slug -> a deterministic FAIL (the correct RED), GREEN once the slug is registered.
  // gitlab x3 -- EXTEND the existing module (41-02), origin https://gitlab.com
  { slug: 'gitlab.create_issue', origin: 'https://gitlab.com', handlerFile: 'gitlab.js', expectWrite: true },
  { slug: 'gitlab.create_merge_request', origin: 'https://gitlab.com', handlerFile: 'gitlab.js', expectWrite: true },
  { slug: 'gitlab.create_note', origin: 'https://gitlab.com', handlerFile: 'gitlab.js', expectWrite: true },
  // notion x4 -- EXTEND the existing module (41-03), origin https://app.notion.com
  // (append_block is a READ descriptor -> excluded; create_database_item is the WRITE.)
  { slug: 'notion.create_page', origin: 'https://app.notion.com', handlerFile: 'notion.js', expectWrite: true },
  { slug: 'notion.update_page', origin: 'https://app.notion.com', handlerFile: 'notion.js', expectWrite: true },
  { slug: 'notion.create_database', origin: 'https://app.notion.com', handlerFile: 'notion.js', expectWrite: true },
  { slug: 'notion.create_database_item', origin: 'https://app.notion.com', handlerFile: 'notion.js', expectWrite: true },
  // slack x1 -- EXTEND the existing module (41-04), origin https://app.slack.com
  // (slug-DISTINCT from the hand-only executable slack.chat.postMessage -- no collision.)
  { slug: 'slack.send_message', origin: 'https://app.slack.com', handlerFile: 'slack.js', expectWrite: true }
];

// The descriptor whose backing:'dom' T3 resolution proves the BEFORE leg, and
// whose flip to T1a proves the AFTER leg. notion.search is chosen because its
// handler (notion.js) already exists pre-Wave-1 in shape (the slug is added in
// 40-04), but the BEFORE/AFTER mechanism is generic -- it seeds the real
// descriptor JSON and toggles only whether the handler is required.
const BEFORE_AFTER_SLUG = 'notion.search';
const BEFORE_AFTER_ORIGIN = 'https://app.notion.com';
const BEFORE_AFTER_HANDLER = 'notion.js';

const NEGATIVE_SLUG = 'gitlab.list_projectz';   // a deliberate typo -- must NOT upgrade
const NEGATIVE_ORIGIN = 'https://gitlab.com';

function descriptorPath(slug) {
  // opentabs__<app>__<op>.json from the dot-form slug <app>.<op>.
  var dot = slug.indexOf('.');
  if (dot === -1) { return null; }
  var app = slug.slice(0, dot);
  var op = slug.slice(dot + 1);
  return path.join(DESCRIPTORS_DIR, 'opentabs__' + app + '__' + op + '.json');
}

function readDescriptor(slug) {
  var p = descriptorPath(slug);
  if (!p || !fs.existsSync(p)) { return null; }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

// Fresh-require the catalog so its REGISTRY starts EMPTY, then optionally require
// the named handler(s) so they self-register into THAT fresh catalog. Returns the
// catalog module exports. Clearing the require cache for BOTH the catalog and every
// handler is what makes the BEFORE leg (handler absent) and the AFTER leg (handler
// present) independent -- a handler self-registers at require time against whatever
// global.FsbCapabilityCatalog is current, so the catalog must be (re)required FIRST.
function freshCatalog(handlerFiles) {
  delete require.cache[require.resolve(CATALOG_PATH)];
  // Drop any cached handler modules so they re-run their self-registration against
  // the fresh catalog global below.
  for (var i = 0; i < PORTED.length; i++) {
    var hp = path.join(HANDLERS_DIR, PORTED[i].handlerFile);
    if (fs.existsSync(hp)) {
      try { delete require.cache[require.resolve(hp)]; } catch (e) { /* not cached */ }
    }
  }
  var Catalog = require(CATALOG_PATH);   // sets global.FsbCapabilityCatalog
  var list = handlerFiles || [];
  for (var j = 0; j < list.length; j++) {
    var p = path.join(HANDLERS_DIR, list[j]);
    if (fs.existsSync(p)) { require(p); }   // self-registers into the fresh catalog
  }
  return Catalog;
}

(function run() {
  console.log('--- DEPTH-01 dom->T1a upgrade-assertion harness (Phase 40) ---');

  // Make sure no stale FsbRecipeIndex from an earlier section leaks into the main
  // 10-slug pass (the registry-first T1a path does NOT need the index, but a stale
  // index must not change behavior).
  delete global.FsbRecipeIndex;

  // Require every handler that exists so all available slugs self-register. The
  // catalog is required first (sets the global), then each handler. Also run
  // seedHeadHandlers() to exercise BOTH the self-register and the manifest path.
  var handlerFiles = [];
  var seen = {};
  for (var i = 0; i < PORTED.length; i++) {
    if (!seen[PORTED[i].handlerFile]) { seen[PORTED[i].handlerFile] = true; handlerFiles.push(PORTED[i].handlerFile); }
  }
  var Catalog = freshCatalog(handlerFiles);
  check(typeof Catalog.resolve === 'function', 'capability-catalog exports resolve');
  if (typeof Catalog.seedHeadHandlers === 'function') {
    Catalog.seedHeadHandlers();   // re-assert from the manifest (defense in depth)
  }

  // ===== Every ported slug must resolve T1a, byte-exact, with a handle =============
  PORTED.forEach(function (row) {
    var handlerExists = fs.existsSync(path.join(HANDLERS_DIR, row.handlerFile));
    var res = Catalog.resolve(row.slug, row.origin);

    if (!handlerExists) {
      // Wave-0: the gitlab handler is not written yet -> a single deterministic
      // FAIL (the correct RED). 40-02 makes this PASS.
      check(false, 'UPGRADE ' + row.slug + ' -> T1a (handler ' + row.handlerFile +
        ' not present yet -- expected Wave-0 RED, GREEN after its plan lands)');
      return;
    }

    check(res && res.tier === 'T1a',
      'UPGRADE ' + row.slug + ' resolves tier T1a on ' + row.origin +
      ' (was backing:dom -> T3); got ' + (res ? res.tier : 'null'));
    check(res && res.descriptor && res.descriptor.slug === row.slug,
      'UPGRADE ' + row.slug + ' carries a BYTE-EXACT descriptor.slug (the correctness keystone)');
    check(res && res.handler && typeof res.handler.handle === 'function',
      'UPGRADE ' + row.slug + ' exposes a handler with an async handle');
    check(res && res.origin === row.origin,
      'UPGRADE ' + row.slug + ' resolves the first-party origin ' + row.origin + ' (Wall 2)');

    // Phase 41: the WRITE rows must upgrade dom->T1a AND carry the write class -- the
    // descriptor.sideEffectClass === 'write' distinguishes a mutating head from a read
    // head (both upgrade dom->T1a; only the write is mutation-gated by consent).
    if (row.expectWrite) {
      check(res && res.descriptor && res.descriptor.sideEffectClass === 'write',
        'UPGRADE ' + row.slug + ' carries descriptor.sideEffectClass === write (the guarded-write class); got ' +
        (res && res.descriptor ? res.descriptor.sideEffectClass : 'null'));
    }
  });

  // ===== NEGATIVE CONTROL: a wrong slug is a dead duplicate, NOT an upgrade ========
  // A typo'd slug must NOT resolve T1a. With no FsbRecipeIndex seeded it resolves
  // null (genuinely unknown); even with the index it would be at most T3 -- never
  // T1a. The keystone: only a BYTE-EXACT slug upgrades.
  var neg = Catalog.resolve(NEGATIVE_SLUG, NEGATIVE_ORIGIN);
  check(!neg || neg.tier !== 'T1a',
    'NEGATIVE CONTROL ' + NEGATIVE_SLUG + ' does NOT resolve T1a (a mis-registered slug is a dead duplicate, never an upgrade); got ' +
    (neg ? neg.tier : 'null'));

  // ===== BEFORE/AFTER: the upgrade itself, demonstrated end-to-end =================
  var desc = readDescriptor(BEFORE_AFTER_SLUG);
  check(!!desc && desc.slug === BEFORE_AFTER_SLUG && desc.backing === 'dom',
    'BEFORE/AFTER fixture: the real opentabs descriptor for ' + BEFORE_AFTER_SLUG +
    ' exists and is backing:dom');

  if (desc) {
    // ---- BEFORE: seed the descriptor in FsbRecipeIndex, handler NOT required ----
    // resolve() finds no REGISTRY entry -> the CGEN-03 descriptor-only fallback
    // returns T3 (backing:'dom'). This is the breadth state the depth phase upgrades.
    global.FsbRecipeIndex = { recipes: [], descriptors: [desc] };
    var beforeCatalog = freshCatalog([]);   // no handler required -> REGISTRY empty for this slug
    var before = beforeCatalog.resolve(BEFORE_AFTER_SLUG, BEFORE_AFTER_ORIGIN);
    check(before && before.tier === 'T3',
      'BEFORE ' + BEFORE_AFTER_SLUG + ' (handler absent, descriptor seeded) resolves T3 -- the breadth dom fallback; got ' +
      (before ? before.tier : 'null'));
    check(before && before.descriptor && before.descriptor.slug === BEFORE_AFTER_SLUG,
      'BEFORE ' + BEFORE_AFTER_SLUG + ' carries the breadth descriptor (slug byte-exact)');

    // ---- AFTER: require the handler -> it self-registers -> resolve() flips T1a ----
    var afterCatalog = freshCatalog([BEFORE_AFTER_HANDLER]);
    var after = afterCatalog.resolve(BEFORE_AFTER_SLUG, BEFORE_AFTER_ORIGIN);
    check(after && after.tier === 'T1a',
      'AFTER ' + BEFORE_AFTER_SLUG + ' (handler required) resolves T1a -- the dom->T1a UPGRADE, proven; got ' +
      (after ? after.tier : 'null'));
    check(after && after.descriptor && after.descriptor.slug === BEFORE_AFTER_SLUG,
      'AFTER ' + BEFORE_AFTER_SLUG + ' preserves the BYTE-EXACT slug across the upgrade');
    check(after && after.handler && typeof after.handler.handle === 'function',
      'AFTER ' + BEFORE_AFTER_SLUG + ' exposes the registered handler');

    delete global.FsbRecipeIndex;
  }

  // ---- Exit convention --------------------------------------------------------
  console.log('\nhead-handler-upgrade: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})();
