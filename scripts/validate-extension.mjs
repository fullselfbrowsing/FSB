#!/usr/bin/env node
// Static validation gate for the browser extension.
// Runs in CI before the Node test suite. Two checks:
//   1. manifest.json sanity: MV3, required fields, every referenced asset exists.
//   2. JS syntax: every .js file under known extension dirs is parsed via `node --check`.
// Exits non-zero with a clear message on first failure.
//
// Flags:
//   --root=<dir>       validate a different tree (default: extension/)
//   --profile=safari   validate a Safari build output: skips the repo-global
//                      package.json + catalog-snapshot checks (already covered
//                      by the default run) and asserts the Safari-specific
//                      NEGATIVE invariants instead.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const argOf = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const PROFILE = argOf('profile') || 'chrome';
const EXT_ROOT = argOf('root') ? resolve(ROOT, argOf('root')) : join(ROOT, 'extension');
const IS_SAFARI = PROFILE === 'safari';

// Permissions that must NOT survive into a Safari build: Safari implements
// none of them, and leaving them in the manifest is how a silent no-op ships.
const SAFARI_BLOCKED_PERMISSIONS = ['sidePanel', 'debugger', 'offscreen', 'system.memory'];

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

// ---------- 2. package.json semver (repo-global; default profile only) ----------
const pkgPath = join(ROOT, 'package.json');
try {
  if (IS_SAFARI) throw { __skip: true };
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!/^\d+\.\d+\.\d+/.test(pkg.version || '')) {
    fail(`package.json version "${pkg.version}" is not semver-shaped`);
  }
} catch (e) {
  if (!e || !e.__skip) fail(`package.json read failed: ${e.message}`);
}

// ---------- 3. Generated capability catalog snapshot ----------
function readJsonDir(absDir) {
  if (!existsSync(absDir)) return [];
  const files = [];
  function walk(dir, relPrefix = '') {
    for (const name of readdirSync(dir).sort()) {
      if (name === '_fixtures') continue;
      const abs = join(dir, name);
      const rel = relPrefix ? join(relPrefix, name) : name;
      const st = statSync(abs);
      if (st.isDirectory()) {
        walk(abs, rel);
      } else if (name.endsWith('.json')) {
        files.push({ abs, rel });
      }
    }
  }
  walk(absDir);
  return files
    .sort((a, b) => a.rel.localeCompare(b.rel))
    .map((file) => JSON.parse(readFileSync(file.abs, 'utf8')));
}

const catalogSnapshotPath = join(EXT_ROOT, 'catalog', 'recipe-index.generated.js');
if (IS_SAFARI) {
  // Snapshot freshness is a property of the source tree, already asserted by
  // the default run. Re-checking a copied build output adds no signal.
} else if (!existsSync(catalogSnapshotPath)) {
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

// ---------- 5. Safari profile: negative invariants ----------
if (IS_SAFARI && existsSync(manifestPath)) {
  try {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const perm of SAFARI_BLOCKED_PERMISSIONS) {
      if ((m.permissions ?? []).includes(perm)) {
        fail(`safari manifest still declares unsupported permission: ${perm}`);
      }
    }
    if (m.side_panel) fail('safari manifest still declares a side_panel key (Safari has no sidePanel API)');
    if (!(m.permissions ?? []).includes('nativeMessaging')) {
      fail('safari manifest is missing the nativeMessaging permission');
    }
    if (m.action?.default_popup) {
      fail('safari manifest declares action.default_popup; Safari only fires action.onClicked when no popup is set');
    }
    const csp = m.content_security_policy?.extension_pages;
    if (!csp || !csp.includes('connect-src')) {
      fail('safari manifest is missing content_security_policy.extension_pages connect-src');
    }
    const war = (m.web_accessible_resources ?? []).flatMap((w) => w.resources ?? []);
    if (war.some((r) => r.startsWith('offscreen/'))) {
      fail('safari manifest still exposes an offscreen/ web-accessible resource');
    }
  } catch (e) {
    fail(`safari manifest invariant check failed: ${e.message}`);
  }
}

// ---------- report ----------
if (errors.length) {
  console.error(`${IS_SAFARI ? 'validate-extension[safari]' : 'validate-extension'}: ${errors.length} failure(s)\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const label = IS_SAFARI ? 'validate-extension[safari]' : 'validate-extension';
console.log(`${label}: OK (manifest valid, ${checked} JS files parsed clean)`);
