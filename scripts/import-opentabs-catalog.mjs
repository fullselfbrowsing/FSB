#!/usr/bin/env node
/**
 * Phase 36 / Plan 01 (v1.0.0 Full App Catalog -- CGEN-01) -- build-time OpenTabs
 * descriptor importer.
 *
 * RUN: node --import tsx ./scripts/import-opentabs-catalog.mjs
 *
 * BUILD-TIME ONLY. NO zod / @opentabs-dev/plugin-sdk / opentabs runtime is ever
 * shipped into the extension (Wall 1). This script mirrors the operation OpenTabs'
 * own `opentabs-plugin build` performs (platform/plugin-tools/src/commands/build.ts:746):
 * `z.toJSONSchema(tool.input)`. It reads a vendored metadata-only slice of the
 * pinned OpenTabs plugin (SHA 4b17021637d2cac12b8d84d21c40e765aa7b85e9) and emits
 * FLAT, provenance-stamped, closed-vocabulary `params` descriptors.
 *
 * The pipeline per op:
 *   1. read package.json.opentabs.urlPatterns -> service/origin
 *   2. import() the plugin index under tsx (handle() bodies are NEVER executed --
 *      only .name/.description/.input/.group/.summary metadata is read)
 *   3. params = z.toJSONSchema(tool.input); delete params.$schema
 *      (plain z.object() already emits additionalProperties:false -> the closed
 *      params contract for free)
 *   4. [Plan 01 Task 3 slots the recursive forbidden-field pre-scan HERE, between
 *      extraction and the gate/emit -- see preScanForbidden]
 *   5. infer sideEffectClass (verb-map + GraphQL/RPC carve-out + override table,
 *      fail-safe-high MAX) and persist the raw signals into provenance
 *   6. classifyGate([{origin,service,slug,description}]) AFTER Denylist.load()
 *      BEFORE any write -- refuse to emit if an unclassified sensitive origin is
 *      present (the denylist-first floor, Phase 35)
 *   7. write catalog/descriptors/opentabs__<service-stem>__<op>.json FLAT
 *      (readJsonDir is non-recursive; provenance is carried IN the descriptor, the
 *      `opentabs/` namespace is the filename prefix + provenance.source, NOT a subdir)
 *   8. fill catalog/descriptors/_fixtures/_provenance.json apps[] with per-app provenance
 *
 * Wall-1 discipline: build tooling (NOT shipped); kept FREE of run-string-as-code /
 * function-from-string / dynamic-module-loader constructs in code AND comments,
 * consistent with the recipe-path guard. (The `await import()` of the plugin module
 * is the standard tsx metadata loader; the recipe-path guard scans the SHIPPED
 * recipe-path files, not this build script.)
 *
 * NO EMOJIS, ASCII-only source.
 */

'use strict';

import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { classifyGate } from './verify-classification-gate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// The denylist source-of-truth classifyGate consults (dual-export IIFE -> module.exports).
const Denylist = require('../extension/utils/service-denylist.js');

// The pinned OpenTabs provenance (hermetic, offline, auditable). MUST match the
// vendor pin at vendor/opentabs-snapshot/_provenance.json.
const OPENTABS_SHA = '4b17021637d2cac12b8d84d21c40e765aa7b85e9';
const OPENTABS_LICENSE = 'MIT';

const VENDOR_ROOT = resolve(ROOT, 'vendor/opentabs-snapshot/plugins');
const DESCRIPTORS_DIR = resolve(ROOT, 'catalog/descriptors');
const PROVENANCE_PATH = resolve(ROOT, 'catalog/descriptors/_fixtures/_provenance.json');

// The smoke-app slice this plan vendors + imports (CONTEXT: ONE non-sensitive
// dev/productivity app; the full breadth is Phases 37-39).
const SMOKE_APPS = ['todoist'];

// ---------------------------------------------------------------------------
// z.toJSONSchema -> closed `params` (Mechanic 1)
// ---------------------------------------------------------------------------
// Plain z.object() emits additionalProperties:false BY DEFAULT (the closed-vocab
// contract). We strip only $schema. Default target (draft-2020-12) + default
// cycles:'ref' ($ref/$defs for any recursive op). We set NO `unrepresentable`
// override so a `.transform()`/`.pipe()` THROWS loudly (the safe direction) rather
// than silently emitting {}.
export function toClosedParams(zodInputSchema) {
  const params = z.toJSONSchema(zodInputSchema);
  if (params && typeof params === 'object') {
    delete params.$schema;
  }
  return params;
}

// ---------------------------------------------------------------------------
// Side-effect inference (Mechanic 2): verb-map + GraphQL/RPC carve-out + override
// table; disagreements resolve fail-safe-high (MAX of read < write < destructive).
// ---------------------------------------------------------------------------
const SIDE_EFFECT_RANK = { read: 0, write: 1, destructive: 2 };
const RANK_TO_CLASS = ['read', 'write', 'destructive'];

function maxClass(a, b) {
  const ra = SIDE_EFFECT_RANK[a] === undefined ? 0 : SIDE_EFFECT_RANK[a];
  const rb = SIDE_EFFECT_RANK[b] === undefined ? 0 : SIDE_EFFECT_RANK[b];
  return RANK_TO_CLASS[Math.max(ra, rb)];
}

// op-name verb prefix -> action verb + a coarse read/write/destructive lean.
const READ_VERBS = new Set(['list', 'get', 'search', 'read', 'fetch', 'find', 'show', 'view']);
const DESTRUCTIVE_VERBS = new Set(['delete', 'remove', 'destroy', 'purge', 'void', 'cancel']);
const WRITE_VERBS = new Set([
  'create', 'update', 'add', 'set', 'edit', 'rename', 'move', 'archive', 'unarchive',
  'close', 'reopen', 'complete', 'finalize', 'merge', 'assign', 'upload', 'post', 'send',
]);

export function verbPrefix(opName) {
  const s = String(opName || '');
  const m = s.match(/^([a-zA-Z]+)/);
  return m ? m[1].toLowerCase() : '';
}

function classFromVerb(verb) {
  if (DESTRUCTIVE_VERBS.has(verb)) return 'destructive';
  if (READ_VERBS.has(verb)) return 'read';
  if (WRITE_VERBS.has(verb)) return 'write';
  // Unknown verb -> fail-safe-high to write (never silently read).
  return 'write';
}

// HTTP method -> class (when a method literal is present).
function classFromMethod(method) {
  const m = String(method || '').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return 'read';
  if (m === 'DELETE') return 'destructive';
  if (m === 'POST' || m === 'PUT' || m === 'PATCH') return 'write';
  return null; // no usable signal
}

// Override table (FLOOR -- max-merged, never a downgrade). Known-destructive /
// known-mutating ops whose name/transport understates them. (RESEARCH A3.)
const SIDE_EFFECT_OVERRIDES = {
  void_invoice: 'destructive',
  delete_customer: 'destructive',
  cancel_subscription: 'destructive',
  refund_charge: 'destructive',
  delete_record: 'destructive',
  archive_project: 'destructive',
  merge_pull_request: 'write',
};

// GraphQL/RPC transport helpers: the HTTP method is uninformative (always POST), so
// classify by NAME verb, never auto-read.
const GRAPHQL_HELPERS = new Set(['graphql', 'gql', 'gqlrequest', 'query', 'mutate']);

/**
 * inferSideEffect(tool, signals) -> { sideEffectClass, signals }
 *
 * signals: { transportHelper, httpMethod, opNameVerb } persisted into provenance so
 * the Plan-03 cross-check re-derives without re-parsing TS.
 */
export function inferSideEffect(tool, signals) {
  const opName = tool && tool.name ? String(tool.name) : '';
  const opNameVerb = verbPrefix(opName);
  const helper = String((signals && signals.transportHelper) || '').toLowerCase();
  const method = (signals && signals.httpMethod) || null;

  const nameClass = classFromVerb(opNameVerb);

  let derived;
  if (GRAPHQL_HELPERS.has(helper)) {
    // GraphQL/RPC carve-out (highest priority): NAME decides; never auto-read.
    derived = nameClass;
  } else {
    // Named verb helper OR generic api({method}): use the method signal if present,
    // else the name verb; then MAX with the name verb (the cross-check partner).
    const methodClass = classFromMethod(method);
    derived = methodClass ? maxClass(methodClass, nameClass) : nameClass;
  }

  // Override table is the highest-specificity FLOOR (UPGRADE only).
  const override = SIDE_EFFECT_OVERRIDES[opName];
  if (override) derived = maxClass(derived, override);

  return {
    sideEffectClass: derived,
    signals: { transportHelper: helper || null, httpMethod: method || null, opNameVerb: opNameVerb || null },
  };
}

// ---------------------------------------------------------------------------
// Transport-signal extraction from the vendored op source (metadata-only).
// We read the op's .ts source as TEXT to recover which helper it calls and any
// {method:'...'} literal -- WITHOUT executing the handle body (Wall 1). This is a
// static string scan, not code execution.
// ---------------------------------------------------------------------------
function extractTransportSignals(app, opFileBase) {
  const srcPath = join(VENDOR_ROOT, app, 'src', 'tools', `${opFileBase}.ts`);
  let text = '';
  try {
    text = readFileSync(srcPath, 'utf8');
  } catch (_e) {
    text = '';
  }
  // transport helper: the imported helper actually called in handle (api / apiVoid /
  // apiGet / apiPost / graphql / ...). Prefer the most specific named-verb helper.
  let transportHelper = null;
  const helperMatch = text.match(/\b(apiGet|apiPost|apiPut|apiPatch|apiDelete|apiVoid|graphql|gql|gqlRequest|api)\b\s*[<(]/);
  if (helperMatch) transportHelper = helperMatch[1];
  // method literal: {method:'POST'} / { method: "DELETE" }
  let httpMethod = null;
  const methodMatch = text.match(/method\s*:\s*['"]([A-Za-z]+)['"]/);
  if (methodMatch) {
    httpMethod = methodMatch[1].toUpperCase();
  } else if (transportHelper) {
    // No literal: infer the helper's documented DEFAULT method.
    //   api (generic)    -> default GET
    //   apiVoid          -> default POST
    //   apiGet           -> GET ; apiPost/apiPut/apiPatch -> their verb ; apiDelete -> DELETE
    const h = transportHelper.toLowerCase();
    if (h === 'api') httpMethod = 'GET';
    else if (h === 'apivoid') httpMethod = 'POST';
    else if (h === 'apiget') httpMethod = 'GET';
    else if (h === 'apipost') httpMethod = 'POST';
    else if (h === 'apiput') httpMethod = 'PUT';
    else if (h === 'apipatch') httpMethod = 'PATCH';
    else if (h === 'apidelete') httpMethod = 'DELETE';
  }
  return { transportHelper, httpMethod };
}

// op name (snake_case) -> op file base (kebab-case), matching the vendored layout.
function opFileBaseOf(opName) {
  return String(opName || '').replace(/_/g, '-');
}

// ---------------------------------------------------------------------------
// intentSynonyms: >=3-4 phrases seeded from displayName/summary/description.
// ---------------------------------------------------------------------------
function synthSynonyms(tool, serviceStem) {
  const out = [];
  const push = (s) => {
    const v = String(s || '').trim();
    if (v && !out.includes(v)) out.push(v);
  };
  const summary = tool.summary ? String(tool.summary).toLowerCase() : '';
  const display = tool.displayName ? String(tool.displayName).toLowerCase() : '';
  const verb = verbPrefix(tool.name);
  if (summary) push(`${summary} in ${serviceStem}`);
  if (display) push(`${display.replace(/\s+/g, ' ')} on ${serviceStem}`);
  // verb + noun heuristic from the op name (create_task -> "create a task")
  const parts = String(tool.name || '').split('_');
  if (parts.length >= 2) {
    const noun = parts.slice(1).join(' ');
    push(`${parts[0]} a ${noun}`);
    push(`${parts[0]} ${noun} in ${serviceStem}`);
  }
  if (summary) push(summary);
  // Guarantee at least 3 entries.
  while (out.length < 3) {
    push(`${verb} ${serviceStem} ${out.length}`);
  }
  return out.slice(0, 5);
}

// ---------------------------------------------------------------------------
// service/origin from package.json.opentabs.urlPatterns
// ---------------------------------------------------------------------------
function readPluginMeta(app) {
  const pkgPath = join(VENDOR_ROOT, app, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const ot = (pkg && pkg.opentabs) || {};
  const patterns = Array.isArray(ot.urlPatterns) ? ot.urlPatterns : [];
  // First urlPattern like "*://app.todoist.com/*" -> host "app.todoist.com".
  let service = '';
  if (patterns.length) {
    const m = patterns[0].match(/:\/\/([^/]+)\//);
    if (m) service = m[1].replace(/^\*\./, '');
  }
  return { pkg, service };
}

// ---------------------------------------------------------------------------
// gateItems(items) -- the EXACT denylist-first gate the per-emit path calls.
// Loads the denylist first (else classify() reads an empty roster -> fail-closed).
// ---------------------------------------------------------------------------
export async function gateItems(items) {
  await Denylist.load();
  return classifyGate(items);
}

// ---------------------------------------------------------------------------
// extractDescriptors(app) -- pure extraction (no write); reused by tests + emit.
// ---------------------------------------------------------------------------
export async function extractDescriptors(app) {
  const { service } = readPluginMeta(app);
  if (!service) throw new Error(`importer: ${app} has no opentabs.urlPatterns host`);
  const serviceStem = service.replace(/^app\./, '').split('.')[0]; // app.todoist.com -> todoist

  const indexUrl = pathToFileURL(join(VENDOR_ROOT, app, 'src', 'index.ts')).href;
  const mod = await import(indexUrl);
  const plugin = mod.default || mod.plugin;
  if (!plugin || !Array.isArray(plugin.tools)) {
    throw new Error(`importer: ${app} index did not export a plugin with tools[]`);
  }

  const descriptors = [];
  for (const tool of plugin.tools) {
    if (!tool || !tool.name || !tool.input) continue;
    const params = toClosedParams(tool.input);

    // ---- [Plan 01 Task 3 slot] recursive forbidden-field pre-scan goes HERE,
    // ---- between extraction and the gate/emit. (Wired in Task 3.)

    const opFileBase = opFileBaseOf(tool.name);
    const rawSignals = extractTransportSignals(app, opFileBase);
    const { sideEffectClass, signals } = inferSideEffect(tool, rawSignals);

    const slug = `${serviceStem}.${tool.name}`;
    const descriptor = {
      slug,
      service,
      intentSynonyms: synthSynonyms(tool, serviceStem),
      description: tool.description ? String(tool.description) : '',
      actionVerb: verbPrefix(tool.name),
      sideEffectClass,
      params,
      // backing drives the Plan-02 resolve() T2/T3 leg. The non-seeded smoke app is
      // DOM-backed (seeds land in Phase 42).
      backing: 'dom',
      provenance: {
        source: 'opentabs',
        sha: OPENTABS_SHA,
        sourcePath: `plugins/${app}/src/tools/${opFileBase}.ts`,
        license: OPENTABS_LICENSE,
        signals,
      },
    };
    descriptors.push({ app, serviceStem, descriptor });
  }
  return descriptors;
}

// ---------------------------------------------------------------------------
// runImport() -- the end-to-end emit: extract -> gate-before-emit -> flat write ->
// fill provenance apps[].
// ---------------------------------------------------------------------------
export async function runImport() {
  await Denylist.load();

  const emittedByApp = new Map(); // app -> { service, slugs: [] }
  const toWrite = []; // { path, json }
  const gateItemsList = [];

  for (const app of SMOKE_APPS) {
    const rows = await extractDescriptors(app);
    for (const { serviceStem, descriptor } of rows) {
      gateItemsList.push({
        origin: `https://${descriptor.service}`,
        service: descriptor.service,
        slug: descriptor.slug,
        description: descriptor.description,
      });
      const opName = descriptor.slug.slice(serviceStem.length + 1);
      const fileName = `opentabs__${serviceStem}__${opName}.json`;
      toWrite.push({ path: join(DESCRIPTORS_DIR, fileName), json: descriptor });
      if (!emittedByApp.has(app)) emittedByApp.set(app, { service: descriptor.service, slugs: [] });
      emittedByApp.get(app).slugs.push(descriptor.slug);
    }
  }

  // GATE BEFORE EMIT: refuse an unclassified sensitive origin (denylist-first).
  const { failures } = classifyGate(gateItemsList);
  if (failures.length) {
    throw new Error('classifyGate refused emit (an unclassified sensitive origin was found):\n  - ' + failures.join('\n  - '));
  }

  // Write each descriptor FLAT (Pitfall 1: no opentabs/ subdir -- readJsonDir is non-recursive).
  if (!existsSync(DESCRIPTORS_DIR)) mkdirSync(DESCRIPTORS_DIR, { recursive: true });
  for (const { path, json } of toWrite) {
    writeFileSync(path, JSON.stringify(json, null, 2) + '\n', 'utf8');
  }

  // Fill catalog/descriptors/_fixtures/_provenance.json apps[] with per-app provenance.
  fillProvenance(emittedByApp);

  return { emitted: toWrite.length, apps: [...emittedByApp.keys()] };
}

function fillProvenance(emittedByApp) {
  let prov;
  try {
    prov = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
  } catch (_e) {
    prov = { apps: [] };
  }
  if (!Array.isArray(prov.apps)) prov.apps = [];
  for (const [app, info] of emittedByApp.entries()) {
    const entry = {
      app,
      service: info.service,
      source: 'opentabs',
      sha: OPENTABS_SHA,
      license: OPENTABS_LICENSE,
      sourcePath: `plugins/${app}/`,
      descriptors: info.slugs.slice().sort(),
    };
    const idx = prov.apps.findIndex((a) => a && a.app === app);
    if (idx >= 0) prov.apps[idx] = entry;
    else prov.apps.push(entry);
  }
  prov.apps.sort((a, b) => String(a.app).localeCompare(String(b.app)));
  writeFileSync(PROVENANCE_PATH, JSON.stringify(prov, null, 2) + '\n', 'utf8');
}

// ---- CLI entry (only when invoked directly, not when imported) ---------------
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runImport()
    .then((r) => {
      console.log(
        `import-opentabs-catalog: emitted ${r.emitted} flat descriptor(s) for [${r.apps.join(', ')}] ` +
          `(closed params + provenance; gated by classifyGate before emit)`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error('import-opentabs-catalog: ERROR ' + (err && err.message ? err.message : err));
      process.exit(1);
    });
}
