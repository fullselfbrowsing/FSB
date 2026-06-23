#!/usr/bin/env node
// Static validation gate for the Chrome extension.
// Runs in CI before the Node test suite. Two checks:
//   1. manifest.json sanity: MV3, required fields, every referenced asset exists.
//   2. JS syntax: every .js file under known extension dirs is parsed via `node --check`.
// Exits non-zero with a clear message on first failure.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EXT_ROOT = join(ROOT, 'extension');
const require = createRequire(import.meta.url);

const errors = [];
const fail = (msg) => errors.push(msg);

// ---------- 1. manifest.json ----------
const manifestPath = join(EXT_ROOT, 'manifest.json');
if (!existsSync(manifestPath)) {
  fail('manifest.json not found at extension/manifest.json');
} else {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    fail(`manifest.json is not valid JSON: ${e.message}`);
  }
  if (manifest) {
    if (manifest.manifest_version !== 3) fail(`manifest_version must be 3, got ${manifest.manifest_version}`);
    for (const key of ['name', 'version', 'description']) {
      if (!manifest[key]) fail(`manifest.json missing required field: ${key}`);
    }
    if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
      fail(`manifest.json version "${manifest.version}" is not semver-shaped`);
    }

    const referenced = [];
    if (manifest.background?.service_worker) referenced.push(manifest.background.service_worker);
    if (manifest.side_panel?.default_path) referenced.push(manifest.side_panel.default_path);
    if (manifest.options_page) referenced.push(manifest.options_page);
    if (manifest.action?.default_popup) referenced.push(manifest.action.default_popup);
    for (const cs of manifest.content_scripts ?? []) {
      for (const f of cs.js ?? []) referenced.push(f);
      for (const f of cs.css ?? []) referenced.push(f);
    }
    for (const war of manifest.web_accessible_resources ?? []) {
      for (const r of war.resources ?? []) {
        // Skip glob resources; only check literal paths.
        if (!r.includes('*')) referenced.push(r);
      }
    }
    for (const sizeKey of Object.keys(manifest.icons ?? {})) {
      referenced.push(manifest.icons[sizeKey]);
    }

    for (const rel of referenced) {
      const abs = join(EXT_ROOT, rel);
      if (!existsSync(abs)) fail(`manifest.json references missing file: ${rel}`);
    }
  }
}

// ---------- 2. package.json semver ----------
const pkgPath = join(ROOT, 'package.json');
try {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!/^\d+\.\d+\.\d+/.test(pkg.version || '')) {
    fail(`package.json version "${pkg.version}" is not semver-shaped`);
  }
} catch (e) {
  fail(`package.json read failed: ${e.message}`);
}

// ---------- 3. Generated capability catalog snapshot ----------
function readJsonDir(absDir) {
  if (!existsSync(absDir)) return [];
  return readdirSync(absDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(absDir, name), 'utf8')));
}

const catalogSnapshotPath = join(EXT_ROOT, 'catalog', 'recipe-index.generated.js');
if (!existsSync(catalogSnapshotPath)) {
  fail('capability catalog snapshot missing: extension/catalog/recipe-index.generated.js; run npm run package:extension');
} else {
  try {
    const generated = require(catalogSnapshotPath);
    const catalogRoot = join(ROOT, 'catalog');
    const expected = {
      recipes: readJsonDir(join(catalogRoot, 'recipes')),
      descriptors: readJsonDir(join(catalogRoot, 'descriptors')),
    };
    if (JSON.stringify(generated) !== JSON.stringify(expected)) {
      fail('capability catalog snapshot is stale: run npm run package:extension and commit extension/catalog/recipe-index.generated.js');
    }
  } catch (e) {
    fail(`capability catalog snapshot validation failed: ${e.message}`);
  }
}

// ---------- 4. JS syntax check ----------
// Directories whose .js files ship to the browser as the extension.
const EXT_DIRS = ['content', 'ui', 'agents', 'ws', 'offscreen', 'ai', 'utils', 'site-guides', 'shared', 'config', 'lib', 'catalog'];
const ROOT_FILES = ['background.js', 'canvas-interceptor.js'];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

const jsFiles = [];
for (const f of ROOT_FILES) {
  const p = join(EXT_ROOT, f);
  if (existsSync(p)) jsFiles.push(p);
}
for (const d of EXT_DIRS) walk(join(EXT_ROOT, d), jsFiles);

let checked = 0;
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    checked++;
  } catch (e) {
    const stderr = e.stderr?.toString() || e.message;
    fail(`syntax error in ${file.replace(ROOT + '/', '')}:\n${stderr.trim()}`);
  }
}

// ---------- report ----------
if (errors.length) {
  console.error(`validate-extension: ${errors.length} failure(s)\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`validate-extension: OK (manifest valid, ${checked} JS files parsed clean)`);
