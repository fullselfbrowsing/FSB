#!/usr/bin/env node
/**
 * Phase 51 -- conservative bundled T1b recipe generator for same-origin reads.
 *
 * This is intentionally narrow. It promotes only descriptor rows whose vendored
 * source already proves a plain same-origin GET with no required params, no
 * dynamic path segments, and no app-specific bearer/CSRF/tenant header needs.
 * Everything else stays in the Phase 51 worklist.
 */

'use strict';

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

export const GENERATED_RECIPE_DIR = join(ROOT, 'catalog', 'recipes', 'generated');
export const EXTENSION_INDEX_PATH = join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js');

export const SAFE_HELPERS = Object.freeze({
  'plugins/bestbuy/src/bestbuy-api.ts': { basePath: '', origin: 'https://www.bestbuy.com' },
  'plugins/bitbucket/src/bitbucket-api.ts': { basePath: '/!api/2.0' },
  'plugins/circleci/src/circleci-api.ts': { basePath: '/api/v2' },
  'plugins/claude/src/claude-api.ts': { basePath: '/api' },
  'plugins/netlify/src/netlify-api.ts': { basePath: '/access-control/bb-api/api/v1' },
  'plugins/redfin/src/redfin-api.ts': { basePath: '', origin: 'https://www.redfin.com' },
  'plugins/terraform-cloud/src/terraform-cloud-api.ts': { basePath: '/api/v2' },
  'plugins/webflow/src/webflow-api.ts': { basePath: '/api' },
});

const EXCLUDED_SENSITIVE_TERMS =
  /saved[_-]?cards?|payment|billing|balance|invoice|key|token|secret|credential|password/i;

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readJsonDir(absDir, recursive) {
  if (!existsSync(absDir)) return [];
  const files = [];
  function walk(dir, relPrefix) {
    for (const name of readdirSync(dir).sort()) {
      if (name === '_fixtures') continue;
      const abs = join(dir, name);
      const rel = relPrefix ? join(relPrefix, name) : name;
      const st = statSync(abs);
      if (st.isDirectory()) {
        if (recursive) walk(abs, rel);
      } else if (name.endsWith('.json')) {
        files.push({ abs, rel });
      }
    }
  }
  walk(absDir, '');
  return files
    .sort((a, b) => a.rel.localeCompare(b.rel))
    .map((file) => readJsonFile(file.abs));
}

function safeOrigin(service) {
  try {
    const raw = String(service || '').trim();
    if (!raw) return '';
    return new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw).origin;
  } catch (_e) {
    return '';
  }
}

function appFromSlug(slug) {
  const s = String(slug || '');
  if (s.indexOf('opentabs__') === 0) {
    const parts = s.split('__');
    return parts[1] || s;
  }
  const dot = s.indexOf('.');
  return dot === -1 ? s : s.slice(0, dot);
}

function isGapiCandidate(desc) {
  const app = appFromSlug(desc.slug);
  const service = String(desc.service || '').toLowerCase();
  return app === 'gmail' || app === 'gdrive' || app === 'gdocs' || app === 'gsheets' ||
    app === 'gcalendar' || service.indexOf('google.com') !== -1 ||
    service.indexOf('googleapis.com') !== -1;
}

function isPatternDCandidate(desc) {
  const app = appFromSlug(desc.slug);
  const service = String(desc.service || '').toLowerCase();
  const patternApps = new Set([
    'airtable', 'asana', 'aws', 'azure', 'clickup', 'confluence', 'datadog',
    'jira', 'linear', 'posthog', 'salesforce', 'sentry', 'shopify', 'zendesk',
  ]);
  return patternApps.has(app) ||
    service.indexOf('atlassian.net') !== -1 ||
    service.indexOf('myshopify.com') !== -1 ||
    service.indexOf('force.com') !== -1;
}

function buildOriginClassifier() {
  try {
    const denylist = require(join(ROOT, 'extension', 'utils', 'service-denylist.js'));
    const config = require(join(ROOT, 'extension', 'config', 'service-denylist.json'));
    if (denylist && typeof denylist._setForTest === 'function') denylist._setForTest(config);
    if (denylist && typeof denylist.classify === 'function') return denylist.classify;
  } catch (_e) {
    // Fall through to allow; generation still has the explicit policy filters.
  }
  return function classifyUnknown() { return { denied: false, sensitive: false }; };
}

function hasNoParams(desc) {
  const params = desc && desc.params && typeof desc.params === 'object' ? desc.params : null;
  const required = params && Array.isArray(params.required) ? params.required : [];
  const props = params && params.properties && typeof params.properties === 'object' ? params.properties : {};
  return required.length === 0 && Object.keys(props).length === 0;
}

function sourcePathForDescriptor(desc) {
  const sourcePath = desc && desc.provenance && desc.provenance.sourcePath;
  if (typeof sourcePath !== 'string' || !sourcePath) return null;
  return join(ROOT, 'vendor', 'opentabs-snapshot', sourcePath);
}

function helperIdsForSource(sourcePath, sourceText) {
  const parts = String(sourcePath || '').split('/');
  const plugin = parts[1];
  if (!plugin) return [];
  const ids = [];
  const re = /from ['"]\.\.\/([^'"]+)-api\.js['"]/g;
  let match;
  while ((match = re.exec(sourceText))) {
    ids.push('plugins/' + plugin + '/src/' + match[1] + '-api.ts');
  }
  return ids;
}

function literalApiEndpoints(sourceText) {
  const out = [];
  const re = /\b(?:api|fetchJSON|fetchText|apiRaw)\s*(?:<[^>]+>)?\s*\(\s*(['"`])([^'"`$]+)\1/g;
  let match;
  while ((match = re.exec(sourceText))) {
    if (match[2] && match[2].charAt(0) === '/') out.push(match[2]);
  }
  return out;
}

function recipeFileName(slug) {
  return String(slug).replace(/[^a-zA-Z0-9_.-]/g, '_') + '.json';
}

function existingBundledSlugs() {
  const slugs = new Set();
  for (const recipe of readJsonDir(join(ROOT, 'catalog', 'recipes'), false)) {
    if (recipe && typeof recipe.id === 'string' && recipe.id) slugs.add(recipe.id);
  }
  const handlersDir = join(ROOT, 'catalog', 'handlers');
  if (existsSync(handlersDir)) {
    for (const name of readdirSync(handlersDir).sort()) {
      if (!name.endsWith('.js')) continue;
      try {
        const mod = require(join(handlersDir, name));
        if (mod && typeof mod === 'object') {
          for (const slug of Object.keys(mod)) slugs.add(slug);
        }
      } catch (_e) {
        // A broken handler will fail the normal handler gates; generation skips it.
      }
    }
  }
  return slugs;
}

function buildRecipe(desc, endpoint, helper) {
  return {
    schemaVersion: 2,
    id: desc.slug,
    origin: SAFE_HELPERS[helper].origin || safeOrigin(desc.service),
    endpoint,
    method: 'GET',
    authStrategy: 'same-origin-cookie',
    params: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    extract: '@',
    expectedShape: '@',
  };
}

export function buildGeneratedRecipes(opts = {}) {
  const descriptors = opts.descriptors || readJsonDir(join(ROOT, 'catalog', 'descriptors'), false);
  const classify = opts.classifyOrigin || buildOriginClassifier();
  const existing = opts.existingSlugs || existingBundledSlugs();
  const recipes = [];
  const skipped = [];

  for (const desc of descriptors) {
    if (!desc || typeof desc.slug !== 'string') continue;
    if (existing.has(desc.slug)) continue;
    const signals = desc.provenance && desc.provenance.signals ? desc.provenance.signals : {};
    const origin = safeOrigin(desc.service);
    let originInfo = null;
    try { originInfo = classify(origin); } catch (_e) { originInfo = null; }

    if (desc.backing !== 'dom') continue;
    if (desc.sideEffectClass !== 'read') continue;
    if (signals.httpMethod !== 'GET') continue;
    if (!hasNoParams(desc)) continue;
    if (!origin || (originInfo && originInfo.denied)) continue;
    if (isGapiCandidate(desc) || isPatternDCandidate(desc)) continue;
    if (EXCLUDED_SENSITIVE_TERMS.test(desc.slug + ' ' + String(desc.description || ''))) {
      skipped.push({ slug: desc.slug, reason: 'sensitive-term' });
      continue;
    }

    const sourcePath = desc.provenance && desc.provenance.sourcePath;
    const absSource = sourcePathForDescriptor(desc);
    if (!absSource || !existsSync(absSource)) {
      skipped.push({ slug: desc.slug, reason: 'missing-source' });
      continue;
    }

    const sourceText = readFileSync(absSource, 'utf8');
    const helper = helperIdsForSource(sourcePath, sourceText).find((id) =>
      Object.prototype.hasOwnProperty.call(SAFE_HELPERS, id)
    );
    if (!helper) {
      skipped.push({ slug: desc.slug, reason: 'helper-not-allowed' });
      continue;
    }

    const endpoints = literalApiEndpoints(sourceText);
    if (endpoints.length !== 1) {
      skipped.push({ slug: desc.slug, reason: 'endpoint-not-static' });
      continue;
    }

    const endpoint = SAFE_HELPERS[helper].basePath + endpoints[0];
    if (!endpoint || endpoint.charAt(0) !== '/' || endpoint.indexOf('..') !== -1 || endpoint.indexOf('//') === 0) {
      skipped.push({ slug: desc.slug, reason: 'endpoint-unsafe' });
      continue;
    }

    recipes.push({
      descriptor: desc,
      helper,
      recipe: buildRecipe(desc, endpoint, helper),
    });
  }

  recipes.sort((a, b) => a.recipe.id.localeCompare(b.recipe.id));
  return { recipes, skipped };
}

export function writeGeneratedRecipes(generated) {
  const list = generated && Array.isArray(generated.recipes) ? generated.recipes : [];
  rmSync(GENERATED_RECIPE_DIR, { recursive: true, force: true });
  mkdirSync(GENERATED_RECIPE_DIR, { recursive: true });
  for (const item of list) {
    writeFileSync(
      join(GENERATED_RECIPE_DIR, recipeFileName(item.recipe.id)),
      JSON.stringify(item.recipe, null, 2) + '\n',
      'utf8'
    );
  }
  return list.length;
}

export function renderExtensionIndex(catalogData) {
  return [
    '// GENERATED by scripts/package-extension.mjs -- DO NOT EDIT BY HAND.',
    '// Build-time catalog snapshot (D-16): recipes + descriptors shipped into the',
    '// extension package so the capability-search index has data in a packaged build.',
    '// Pure data dual-export IIFE; loaded via importScripts before capability-search.js.',
    '(function(global) {',
    "  'use strict';",
    '  var DATA = ' + JSON.stringify(catalogData, null, 2) + ';',
    '  global.FsbRecipeIndex = DATA;',
    "  if (typeof module !== 'undefined' && module.exports) { module.exports = DATA; }",
    "})(typeof globalThis !== 'undefined' ? globalThis : this);",
    '',
  ].join('\n');
}

export function writeExtensionCatalogIndex() {
  const catalogData = {
    recipes: readJsonDir(join(ROOT, 'catalog', 'recipes'), true),
    descriptors: readJsonDir(join(ROOT, 'catalog', 'descriptors'), false),
  };
  writeFileSync(EXTENSION_INDEX_PATH, renderExtensionIndex(catalogData), 'utf8');
  return catalogData;
}

function runCli() {
  const generated = buildGeneratedRecipes();
  const count = writeGeneratedRecipes(generated);
  const catalog = writeExtensionCatalogIndex();
  console.log(
    'generate-t1-same-origin-read-recipes: wrote ' + count +
    ' generated recipe(s); extension index now has ' + catalog.recipes.length +
    ' recipe(s), ' + catalog.descriptors.length + ' descriptor(s)'
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    runCli();
  } catch (err) {
    console.error('generate-t1-same-origin-read-recipes: ERROR ' +
      (err && err.message ? err.message : String(err)));
    process.exit(1);
  }
}
