#!/usr/bin/env node
/**
 * Safari build transform.
 *
 * FSB keeps ONE source tree. `extension/` targets Chrome MV3 and must stay
 * byte-identical wherever a test reads it -- 15 test files assert on extension
 * source contents, and two pin exact counts (background.js is pinned to 334
 * script-import mentions / 330 call sites; the tool registry is pinned by
 * SHA-256). So Safari behaviour is delivered by transforming the OUTPUT, never
 * the source.
 *
 * This script emits build/safari/ from extension/ with exactly three deltas:
 *   1. manifest.json  -- permissions/keys Safari does not implement removed,
 *                        nativeMessaging + CSP + strict_min_version added.
 *   2. background.js  -- platform-adapter.js PREPENDED (never script-imported,
 *                        which would break the 334/330 pins) and the Lattice
 *                        IIFE bundle loaded at EOF (Safari has no offscreen
 *                        document, so the host runs inside the SW).
 *   3. dist/offscreen/lattice-host.iife.js copied in place of the ESM build.
 *
 * Everything else is a byte-for-byte copy, enforced by
 * tests/safari-source-parity.test.js.
 *
 * Usage:
 *   node scripts/build-safari.mjs [--out=build/safari]
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EXT_ROOT = join(ROOT, 'extension');

// ---------------------------------------------------------------------------
// Permission policy.
//
// ALLOWLIST-DRIVEN ON PURPOSE. Every permission in extension/manifest.json must
// appear in exactly one of these two lists. An unclassified permission is a
// hard error, so adding one to the Chrome manifest without deciding what Safari
// should do breaks the Safari build immediately instead of silently shipping a
// permission Safari ignores.
// ---------------------------------------------------------------------------

const PERMISSIONS_KEEP = [
  'activeTab', 'scripting', 'storage', 'unlimitedStorage', 'tabs',
  'windows', 'webNavigation', 'alarms', 'clipboardWrite',
  'nativeMessaging' // Chrome uses it for the native host; Safari for the container app.
];

const PERMISSIONS_DROP = [
  'sidePanel',      // Safari has no sidePanel API; the adapter polyfills it onto a popup window.
  'debugger',       // No CDP in Safari at all; the adapter installs a rejecting shim.
  'offscreen',      // No offscreen documents; the Lattice host moves into the SW.
  'system.memory'   // Chrome-proprietary.
];

// Added even if the Chrome manifest ever drops it: the Safari MCP transport and
// upload_file both depend on the container app.
const PERMISSIONS_ADD = ['nativeMessaging'];

// Safari baseline. content_scripts.world:"MAIN" (which canvas-interceptor.js
// needs at document_start) landed in Safari 18.
const SAFARI_MIN_VERSION = '18.0';

const MCP_BRIDGE_URL = 'ws://localhost:7225';

// Paths never copied into the Safari build, with the reason each is excluded.
// tests/safari-source-parity.test.js asserts this list is exhaustive.
const EXCLUDE = [
  'offscreen/lattice-host.html',        // no offscreen documents in Safari
  'offscreen/lattice-host.js',          // ESM source; Safari ships the IIFE bundle
  'dist/offscreen/lattice-host.js',     // ESM build output
  'dist/offscreen/lattice-host.js.map'
];

// NOTE: extension/test-data/ is deliberately NOT excluded despite looking like
// test fixtures. utils/token-comparator.js:1226 loads it at runtime through
// chrome.runtime.getURL + fetch, and manifest.web_accessible_resources
// advertises it. Dropping 252 KB would break loadJSONBaseline().


const LATTICE_IIFE_REL = 'dist/offscreen/lattice-host.iife.js';

// ---------------------------------------------------------------------------
// transformManifest -- pure, exported for tests
// ---------------------------------------------------------------------------

export function transformManifest(manifest) {
  const out = JSON.parse(JSON.stringify(manifest));
  const declared = out.permissions ?? [];

  const unknown = declared.filter(
    (p) => !PERMISSIONS_KEEP.includes(p) && !PERMISSIONS_DROP.includes(p)
  );
  if (unknown.length) {
    throw new Error(
      `build-safari: unclassified permission(s): ${unknown.join(', ')}. ` +
      'Add each to PERMISSIONS_KEEP or PERMISSIONS_DROP in scripts/build-safari.mjs ' +
      'so the Safari behaviour is an explicit decision.'
    );
  }

  out.permissions = declared.filter((p) => !PERMISSIONS_DROP.includes(p));
  for (const p of PERMISSIONS_ADD) {
    if (!out.permissions.includes(p)) out.permissions.push(p);
  }

  // Safari has no sidePanel API. The adapter polyfills chrome.sidePanel onto a
  // popup-type extension window, so the key itself must not survive.
  delete out.side_panel;

  // No offscreen documents -> nothing under offscreen/ is web-accessible.
  if (Array.isArray(out.web_accessible_resources)) {
    out.web_accessible_resources = out.web_accessible_resources
      .map((entry) => ({
        ...entry,
        resources: (entry.resources ?? []).filter((r) => !r.startsWith('offscreen/'))
      }))
      .filter((entry) => (entry.resources ?? []).length > 0);
  }

  // The direct-WebSocket experiment: Safari refuses ws://localhost from an
  // extension page unless connect-src names it. If this works, the transport
  // probe pins to 'ws' on first connect and the native path never runs.
  //
  // `http:` is NOT optional. Chrome ships no connect-src at all, so naming one
  // here only ever NARROWS what already works, and FSB's local-provider paths
  // dial plain HTTP: config.js defaults lmstudioBaseUrl to
  // http://localhost:1234, and customEndpoint is routinely an Ollama/LM Studio
  // URL -- often on another box on the LAN, which a localhost-only allowlist
  // would break. The scheme is not a security boundary here either: the
  // extension already holds <all_urls>.
  //
  // `ws:` follows for exactly the same reason, and is NOT covered by naming
  // MCP_BRIDGE_URL alone. ws/ws-client.js derives the dashboard socket from
  // the user-editable serverUrl with .replace(/^http/, 'ws'), so anyone
  // pointing FSB at a self-hosted dashboard on http://host:port gets a
  // ws://host:port socket that a wss:-only allowlist would refuse.
  out.content_security_policy = {
    ...(out.content_security_policy ?? {}),
    extension_pages: [
      "script-src 'self'",
      "object-src 'self'",
      `connect-src 'self' ${MCP_BRIDGE_URL} http: https: ws: wss:`
    ].join('; ')
  };

  out.browser_specific_settings = {
    ...(out.browser_specific_settings ?? {}),
    safari: { strict_min_version: SAFARI_MIN_VERSION }
  };

  return out;
}

// ---------------------------------------------------------------------------
// buildSafari
// ---------------------------------------------------------------------------

function isExcluded(rel) {
  const norm = rel.split(sep).join('/');
  return EXCLUDE.some((ex) => norm === ex || norm.startsWith(ex + '/'));
}

function walk(dir, base, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const abs = join(dir, name);
    const rel = relative(base, abs);
    if (isExcluded(rel)) continue;
    if (statSync(abs).isDirectory()) walk(abs, base, out);
    else if (!name.endsWith('.map')) out.push(rel);
  }
  return out;
}

export function buildSafari(opts = {}) {
  const src = opts.root ? resolve(ROOT, opts.root) : EXT_ROOT;
  const out = opts.out ? resolve(ROOT, opts.out) : join(ROOT, 'build', 'safari');
  const warnings = [];

  const adapterPath = join(src, 'utils', 'platform-adapter.js');
  if (!existsSync(adapterPath)) {
    throw new Error('build-safari: extension/utils/platform-adapter.js not found');
  }
  const adapterSrc = readFileSync(adapterPath, 'utf8');

  const transportPath = join(src, 'ws', 'mcp-native-transport.js');
  if (!existsSync(transportPath)) {
    throw new Error('build-safari: extension/ws/mcp-native-transport.js not found');
  }
  const transportSrc = readFileSync(transportPath, 'utf8');

  const fileReaderPath = join(src, 'utils', 'native-file-reader.js');
  if (!existsSync(fileReaderPath)) {
    throw new Error('build-safari: extension/utils/native-file-reader.js not found');
  }
  const fileReaderSrc = readFileSync(fileReaderPath, 'utf8');

  const latticeIife = join(src, LATTICE_IIFE_REL);
  if (!existsSync(latticeIife)) {
    throw new Error(
      `build-safari: ${LATTICE_IIFE_REL} not found. Run \`node esbuild.config.js\` first ` +
      '-- Safari runs the Lattice host inside the service worker and needs the IIFE bundle.'
    );
  }

  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const files = walk(src, src);
  let copied = 0;

  for (const rel of files) {
    const from = join(src, rel);
    const to = join(out, rel);
    mkdirSync(dirname(to), { recursive: true });

    if (rel === 'manifest.json') {
      const manifest = JSON.parse(readFileSync(from, 'utf8'));
      writeFileSync(to, JSON.stringify(transformManifest(manifest), null, 2) + '\n');
    } else if (rel === 'background.js') {
      writeFileSync(to, transformBackground(readFileSync(from, 'utf8'), {
        adapter: adapterSrc,
        modules: [
          { label: 'ws/mcp-native-transport.js -- defines FsbNativeBridgeSocket, which\n// ws/mcp-bridge-client.js resolves off the global in _createSocket().', src: transportSrc },
          { label: 'utils/native-file-reader.js -- defines FsbNativeFileReader, used by\n// executeUploadFile() when caps.cdp is false.', src: fileReaderSrc }
        ]
      }));
    } else {
      copyFileSync(from, to);
    }
    copied += 1;
  }

  let sourceCommit = 'unknown';
  try {
    sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, stdio: 'pipe' })
      .toString().trim();
  } catch {
    warnings.push('git rev-parse failed; BUILD-INFO.sourceCommit is "unknown"');
  }

  writeFileSync(join(out, 'BUILD-INFO.json'), JSON.stringify({
    generator: 'scripts/build-safari.mjs',
    sourceCommit,
    generatedAt: new Date().toISOString(),
    adapterSha256: createHash('sha256').update(adapterSrc).digest('hex'),
    nativeTransportSha256: createHash('sha256').update(transportSrc).digest('hex'),
    nativeFileReaderSha256: createHash('sha256').update(fileReaderSrc).digest('hex'),
    strippedPermissions: PERMISSIONS_DROP,
    addedPermissions: PERMISSIONS_ADD,
    excluded: EXCLUDE,
    transformedFiles: ['manifest.json', 'background.js'],
    fileCount: copied
  }, null, 2) + '\n');

  return { files: copied, out, warnings };
}

/**
 * The two background.js deltas. Both are ANCHOR-FREE (pure prepend/append) so
 * they can never mis-target one of background.js's byte-frozen regions.
 */
export function transformBackground(source, opts) {
  const adapterSrc = opts.adapter;
  const modules = opts.modules || [];
  const preamble = [
    '// ---------------------------------------------------------------------------',
    '// SAFARI BUILD PREAMBLE -- generated by scripts/build-safari.mjs. Do not edit.',
    '//',
    '// extension/utils/platform-adapter.js is inlined here rather than loaded as a',
    '// script import because tests/lattice-provider-bridge-smoke.test.js pins',
    '// background.js to an exact script-import count. Inlining keeps the Chrome',
    '// source untouched while still installing the shims before ANY listener',
    '// registers -- which matters because the file registers debugger.onEvent and',
    '// debugger.onDetach handlers at top level.',
    '// ---------------------------------------------------------------------------',
    'globalThis.__FSB_FORCE_PLATFORM__ = "safari";',
    '',
    adapterSrc,
    '',
    'globalThis.FsbPlatform.install();',
    '',
    '// Safari-only modules, inlined for the same reason as the adapter: they must',
    '// register their globals BEFORE background.js runs, and adding script-import',
    '// lines to the Chrome source would break the 334/330 count pins.',
    ...modules.flatMap((m) => ['', '// ' + m.label, m.src]),
    '// --------------------------- END SAFARI PREAMBLE ---------------------------',
    ''
  ].join('\n');

  // Loading the Lattice host at EOF guarantees the adapter's onMessage wrapper
  // is already installed when the host registers its two listeners -- without
  // that ordering the in-SW loopback would miss them and every LLM call would
  // fail, since agent-loop.js made the Lattice bridge the unconditional path.
  //
  // captureLoopback() is what makes those two listeners -- and ONLY those two --
  // join the fan-out. Capturing every onMessage listener instead would enrol
  // background.js's fsbHandleRuntimeMessage, whose `default:` branch answers any
  // message with no request.action (i.e. every lattice-* envelope) and, being
  // registered first, would claim the reply before the host ever saw it.
  const epilogue = [
    '',
    '// --------------------------- SAFARI BUILD EPILOGUE -------------------------',
    '// Safari has no chrome.offscreen, so the Lattice provider bus runs inside the',
    '// service worker. The IIFE bundle exists precisely because a SW that uses',
    '// importScripts() can never be a module.',
    '//',
    '// The captureLoopback() wrapper is synchronous, so importScripts still runs',
    '// during the service worker\'s initial evaluation as MV3 requires.',
    '//',
    '// NOTE: the 334/330 count pins in tests/lattice-provider-bridge-smoke.test.js',
    '// read extension/background.js. This line only ever lands in the generated',
    '// build/safari/background.js, so it cannot affect them.',
    'globalThis.FsbPlatform.captureLoopback(function () {',
    `  importScripts('${LATTICE_IIFE_REL}');`,
    '});',
    '// ------------------------- END SAFARI BUILD EPILOGUE -----------------------',
    ''
  ].join('\n');

  return preamble + source + epilogue;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const outArg = process.argv.slice(2).find((a) => a.startsWith('--out='));
  try {
    const res = buildSafari({ out: outArg ? outArg.slice(6) : undefined });
    for (const w of res.warnings) console.warn(`build-safari: WARN ${w}`);
    console.log(`build-safari: OK (${res.files} files -> ${relative(ROOT, res.out)})`);
  } catch (err) {
    console.error(`build-safari: FAILED\n  ${err.message}`);
    process.exit(1);
  }
}
