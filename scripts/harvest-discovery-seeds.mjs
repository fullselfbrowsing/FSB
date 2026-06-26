#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Phase 42 plan 01 (DSEED-01) -- harvest-discovery-seeds.mjs
//
// A BUILD-TIME harvester (alongside import-opentabs-catalog.mjs) that reads each
// vendored plugins/<app>/src/*-api.ts and emits extension/config/discovery-seeds.json:
//   { "<origin>": { hints:[{op,method,path}], provenance:{app,source} }, ...,
//     "_meta": { generator, vendorSha, originCount, hintCount } }
// NOTE (IN-01): NO 'generatedAt' -- the output is byte-REPRODUCIBLE (vendorSha is the
// provenance anchor) so a no-op rerun yields an empty git diff.
//
// The ORIGIN is derived EXACTLY like the importer's readPluginMeta:
//   package.json.opentabs.urlPatterns[0].match(/:\/\/([^/]+)\//) -> strip a leading
//   '*.' -> prefix 'https://'. An app with NO urlPatterns host (a self-hosted slice,
//   the importer's BLOCKER-C skip) is SKIPPED with a clean continue -- never abort.
//
// The HINTS are op/path/method literals extracted from the plugin's *-api.ts text
// WITHOUT executing it (a static text scan, never an import of app code):
//   - exported tool op names  (export const <op> = async ... )
//   - endpoint constants      (const X_ENDPOINT = 'https://.../graphql' -> path /graphql)
//   - API_BASE prefixes       (const API_BASE = '/v1')
//   - fetch target paths       (fetch('/v3/items', ...), doFetch('/_graphql', ...))
//   - method literals          (method: 'GET' | 'POST', or default 'GET')
//
// PER DSEED-01 / SC1: the harvester writes METADATA ONLY. A hint biases the
// synthesizer's recognition; it is NEVER a fetch right. The harvester adds NO host
// permission and the loader (network-capture.js, Plan 02) reads the file via the
// EXISTING capture permissions -- no manifest change.
//
// PROVENANCE: vendorSha is read from vendor/opentabs-snapshot/_provenance.json
// (.sha); absent -> 'unpinned' + a single console.warn (never throw).
//
// Run: node scripts/harvest-discovery-seeds.mjs
// NO EMOJIS, ASCII-only source.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const VENDOR_ROOT = join(REPO_ROOT, 'vendor', 'opentabs-snapshot', 'plugins');
const PROVENANCE_PATH = join(REPO_ROOT, 'vendor', 'opentabs-snapshot', '_provenance.json');
const OUT_PATH = join(REPO_ROOT, 'extension', 'config', 'discovery-seeds.json');

// ---- origin from package.json.opentabs.urlPatterns[0] (mirror readPluginMeta) ----
function originForApp(app) {
  const pkgPath = join(VENDOR_ROOT, app, 'package.json');
  if (!existsSync(pkgPath)) return null;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
  const ot = (pkg && pkg.opentabs) || {};
  const patterns = Array.isArray(ot.urlPatterns) ? ot.urlPatterns : [];
  if (!patterns.length) return null; // BLOCKER-C: self-hosted, no host -> skip
  const m = String(patterns[0]).match(/:\/\/([^/]+)\//);
  if (!m) return null;
  const host = m[1].replace(/^\*\./, '');
  if (!host) return null;
  return 'https://' + host;
}

// ---- the *-api.ts files for an app (the transport layer) -----------------------
function apiFilesForApp(app) {
  const srcDir = join(VENDOR_ROOT, app, 'src');
  if (!existsSync(srcDir)) return [];
  let entries;
  try {
    entries = readdirSync(srcDir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => /-api\.ts$/.test(f))
    .map((f) => join(srcDir, f))
    .filter((p) => existsSync(p) && statSync(p).isFile());
}

// ---- extract a normalized path from a candidate URL/path literal --------------
// A full 'https://host/p/q' -> '/p/q'; a bare '/p/q' stays '/p/q'; a template head
// (the literal prefix before a `${...}`) is kept so a hint like '/shares/' survives.
function normalizePath(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  // Cut a template interpolation: keep the static head only.
  const interp = s.indexOf('${');
  if (interp !== -1) s = s.slice(0, interp);
  // Strip a scheme+host if present.
  const schemeAt = s.indexOf('://');
  if (schemeAt !== -1) {
    const afterHost = s.slice(schemeAt + 3).indexOf('/');
    s = afterHost === -1 ? '/' : s.slice(schemeAt + 3 + afterHost);
  }
  // Drop a query/fragment if any.
  s = s.split('?')[0].split('#')[0];
  if (!s) return null;
  if (s.charAt(0) !== '/') return null; // not a path
  // Trim a trailing slash (but keep a bare '/').
  if (s.length > 1) s = s.replace(/\/+$/, '');
  return s || '/';
}

// ---- harvest hints from a single *-api.ts file's TEXT (no execution) -----------
function harvestHintsFromText(text) {
  const hints = [];
  const seen = new Set();
  const push = (op, method, path) => {
    const key = (op || '') + '|' + (method || '') + '|' + (path || '');
    if (seen.has(key)) return;
    seen.add(key);
    hints.push({ op: op || null, method: method || null, path: path || null });
  };

  // (1) endpoint constants: const X_ENDPOINT = 'https://.../graphql' / '/api/...'
  //     and  const API_BASE = '/v1'
  const constRe = /const\s+([A-Z_][A-Z0-9_]*)\s*=\s*(['"`])([^'"`]+)\2/g;
  let m;
  while ((m = constRe.exec(text)) !== null) {
    const name = m[1];
    const val = m[3];
    if (!/(ENDPOINT|API_BASE|BASE_URL|GRAPHQL|API_URL|API_ROOT)/.test(name)) continue;
    const p = normalizePath(val);
    if (p) push(name.toLowerCase(), null, p);
  }

  // (2) fetch / doFetch / api( first-arg path or url literal:
  //     fetch('https://.../x'), doFetch('/y', ...), api('/z', { method })
  const fetchRe = /\b(?:fetch|doFetch|api|request|call)\s*\(\s*(['"`])([^'"`$]*)\1/g;
  while ((m = fetchRe.exec(text)) !== null) {
    const p = normalizePath(m[2]);
    if (p && p !== '/') push(null, null, p);
  }

  // (3) template-literal fetch targets: fetch(`https://.../v3/${endpoint}`)
  const tmplRe = /\b(?:fetch|doFetch|api|request|call)\s*\(\s*`([^`]*)`/g;
  while ((m = tmplRe.exec(text)) !== null) {
    const p = normalizePath(m[1]);
    if (p && p !== '/') push(null, null, p);
  }

  // (4) standalone /vN/... or /_graphql style path literals anywhere in the text
  //     (REST version prefixes + the GitHub-style /_graphql persisted-query path).
  const pathLitRe = /(['"`])(\/(?:v\d+|_?graphql|api)\b[A-Za-z0-9/_.\-]*)\1/g;
  while ((m = pathLitRe.exec(text)) !== null) {
    const p = normalizePath(m[2]);
    if (p && p !== '/') push(null, null, p);
  }

  // (5) exported op names -> recognition keys (op with null path when not
  //     statically resolvable to a single path; recognition still keys on origin).
  const opRe = /export\s+const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*async\b/g;
  const SKIP_OPS = new Set(['isAuthenticated', 'waitForAuth', 'getAuth', 'api', 'doFetch', 'graphql']);
  while ((m = opRe.exec(text)) !== null) {
    const op = m[1];
    if (SKIP_OPS.has(op)) continue;
    push(op, null, null);
  }

  // (6) method literals observed in the file (attach the dominant one at file level
  //     as a coarse recognition hint when no per-op binding is resolvable).
  const methodRe = /method\s*:\s*(['"`])(GET|POST|PUT|PATCH|DELETE|HEAD)\1/g;
  const methods = new Set();
  while ((m = methodRe.exec(text)) !== null) methods.add(m[2]);
  if (methods.size) {
    // Stamp the method onto path-bearing hints that have no method yet (best-effort,
    // metadata only -- the synthesizer reads a captured call's real method).
    const dominant = methods.has('GET') ? 'GET' : Array.from(methods)[0];
    for (const h of hints) {
      if (h.path && !h.method) h.method = dominant;
    }
  }

  return hints;
}

// ---- vendorSha from _provenance.json (.sha); absent -> 'unpinned' + warn --------
function resolveVendorSha() {
  try {
    if (existsSync(PROVENANCE_PATH)) {
      const prov = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
      if (prov && typeof prov.sha === 'string' && prov.sha.length >= 7) return prov.sha;
    }
  } catch {
    // fall through to unpinned
  }
  console.warn('[harvest-discovery-seeds] vendor SHA not resolvable -> stamping vendorSha:"unpinned"');
  return 'unpinned';
}

// ---- main ----------------------------------------------------------------------
function main() {
  if (!existsSync(VENDOR_ROOT)) {
    console.error('[harvest-discovery-seeds] vendor plugins root not found: ' + VENDOR_ROOT);
    process.exit(1);
  }
  const apps = readdirSync(VENDOR_ROOT).filter((a) => {
    try {
      return statSync(join(VENDOR_ROOT, a)).isDirectory();
    } catch {
      return false;
    }
  });

  const seeds = {};
  let originCount = 0;
  let hintCount = 0;
  let skipped = 0;

  for (const app of apps.sort()) {
    const origin = originForApp(app);
    if (!origin) {
      skipped++;
      continue; // self-hosted / no host -> clean skip (BLOCKER-C parity), never abort
    }
    const files = apiFilesForApp(app);
    let appHints = [];
    let primarySource = null;
    for (const f of files) {
      let text = '';
      try {
        text = readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      const fileHints = harvestHintsFromText(text);
      if (fileHints.length) {
        if (!primarySource) primarySource = f.split('/').slice(-1)[0];
        appHints = appHints.concat(fileHints);
      }
    }
    // Dedupe across files for this app.
    const dedup = new Map();
    for (const h of appHints) {
      const key = (h.op || '') + '|' + (h.method || '') + '|' + (h.path || '');
      if (!dedup.has(key)) dedup.set(key, h);
    }
    const finalHints = Array.from(dedup.values());

    // An origin with zero api files still seeds (recognition keys on origin alone).
    const existing = seeds[origin];
    if (existing) {
      // Two apps share an origin: merge hints, keep first provenance.
      const merged = new Map();
      for (const h of existing.hints.concat(finalHints)) {
        merged.set((h.op || '') + '|' + (h.method || '') + '|' + (h.path || ''), h);
      }
      existing.hints = Array.from(merged.values());
    } else {
      seeds[origin] = {
        hints: finalHints,
        provenance: { app: app, source: primarySource || null }
      };
      originCount++;
    }
  }

  for (const origin of Object.keys(seeds)) {
    hintCount += seeds[origin].hints.length;
  }

  const vendorSha = resolveVendorSha();
  // IN-01: NO wall-clock 'generatedAt' -- it made the artifact non-byte-reproducible
  // (a regen never matched the committed file, defeating a "seeds are fresh vs the
  // pinned vendor SHA" byte-equality check). vendorSha IS the provenance anchor; it
  // pins the INPUT snapshot, and dropping the timestamp makes the OUTPUT deterministic
  // so `harvest -> git diff` is empty on a no-op rerun.
  seeds._meta = {
    generator: 'harvest-discovery-seeds.mjs',
    vendorSha: vendorSha,
    originCount: originCount,
    hintCount: hintCount
  };

  writeFileSync(OUT_PATH, JSON.stringify(seeds, null, 2) + '\n', 'utf8');
  console.log(
    '[harvest-discovery-seeds] wrote ' + OUT_PATH +
    ' -- origins=' + originCount + ' hints=' + hintCount +
    ' skipped(no-host)=' + skipped + ' vendorSha=' + vendorSha
  );
}

main();
