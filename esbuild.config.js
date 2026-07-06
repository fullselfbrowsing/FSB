'use strict';

/**
 * FSB extension bundler config -- Phase 5 Plan 05-01 (v0.10.0-attempt-2).
 *
 * Per-entrypoint esbuild configuration emitting to extension/dist/.
 *
 * Locked decisions from .planning/phases/05-mv3-survivability-bundler/05-CONTEXT.md:
 *   D-01: esbuild (single binary, npm-resolvable, no toolchain shift).
 *   D-02: per-entrypoint bundles (NOT a single mega-bundle).
 *   D-03: output topology = extension/dist/ (CD-A resolution: single tree).
 *   D-04: external .js.map sidecars for SW + sidepanel + offscreen;
 *         sourcemaps DISABLED for content-script bundles.
 *   D-05: invoked via package.json scripts.build = "node esbuild.config.js".
 *   D-06: bundler-installed-not-wired. ZERO manifest.json change in Plan 05-01.
 *         The lattice-host placeholder lets Plan 05-04 add the source file
 *         without re-touching this config.
 *   D-17: background.js BYTE-FROZEN; the classic SW + 153 importScripts chain
 *         is NOT a bundler input. The SW does not move through esbuild.
 *
 * Threat model (Phase 5 CONTEXT.md security block):
 *   - NO plugins from the npm registry beyond esbuild core (config is the
 *     only attack surface; in-tree + reviewable).
 *   - format: "iife" for content-script + offscreen bundles so they execute
 *     in their own scope when loaded via <script> or content_scripts. The
 *     offscreen lattice-host bundle uses "esm" because the offscreen HTML
 *     declares <script type="module">.
 *
 * Output layout:
 *   extension/dist/
 *     offscreen/
 *       stt.js             // existing offscreen helper (IIFE)
 *       stt.js.map
 *       lattice-host.js    // NEW in Plan 05-04 (ESM; placeholder generated
 *                          // by Plan 05-01 when the source file is absent)
 *       lattice-host.js.map
 *     content/
 *       canvas-interceptor.js   // IIFE; no sourcemap (D-04 lean payload)
 *     sidepanel/
 *       sidepanel.js       // IIFE; sourcemap external (D-04)
 *       sidepanel.js.map
 *
 * What this config DOES NOT bundle in Phase 5:
 *   - extension/background.js (classic SW; importScripts chain is load-order
 *     sensitive; D-17 byte-freeze).
 *   - extension/ui/sidepanel.html / control_panel.html (HTML stays in place;
 *     only the JS modules they reference move through esbuild IF they are
 *     declared as entries below).
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = __dirname;
const SRC_ROOT = path.join(REPO_ROOT, 'extension');
const SHOWCASE_ROOT = path.join(REPO_ROOT, 'showcase');
const OUT_ROOT = path.join(REPO_ROOT, 'extension', 'dist');

/**
 * Each entry is one bundle. The shape matches what esbuild.build accepts as
 * a single-build-call configuration so each entry runs as its own build (we
 * deliberately do NOT batch all entries into one build call because per-entry
 * format / sourcemap settings differ per D-02 + D-04).
 */
const ENTRIES = [
  {
    name: 'offscreen-stt',
    entryPoints: [path.join(SRC_ROOT, 'offscreen', 'stt.js')],
    outfile: path.join(OUT_ROOT, 'offscreen', 'stt.js'),
    format: 'iife',
    sourcemap: 'external',
    platform: 'browser',
    target: ['chrome120'],
    bundle: true,
    legalComments: 'none',
    allowOverwrite: true,
  },
  {
    name: 'offscreen-lattice-host',
    entryPoints: [path.join(SRC_ROOT, 'offscreen', 'lattice-host.js')],
    outfile: path.join(OUT_ROOT, 'offscreen', 'lattice-host.js'),
    format: 'esm',
    sourcemap: 'external',
    platform: 'browser',
    target: ['chrome120'],
    bundle: true,
    legalComments: 'none',
    allowOverwrite: true,
    // UAT-1 fix (2026-05-31): Lattice's dist/index.js top-level imports node:fs/promises,
    // node:path, node:url, etc. for its artifact-storage submodule. Our offscreen import
    // surface (checkpoint/signer/survivability) does NOT exercise those code paths at
    // runtime, but ESM top-level imports cannot be tree-shaken merely by marking them
    // external -- esbuild preserves the import specifier verbatim, and Chrome MV3 CSP
    // (script-src 'self') rejects any surviving `node:*` import in the offscreen bundle.
    //
    // Fix: resolve every node:* specifier to a local stub module at build time via an
    // inline esbuild plugin. The stub exports no-op shims for the fs / path / url surface
    // Lattice's artifact-storage references. Dead code paths from artifact-storage stay
    // in the bundle but call into local no-ops; no CSP-blocked imports survive in output.
    banner: {
      js: [
        '// Buffer polyfill for receipts/envelope.ts base64 encoding (UAT-08 fix; lattice-side',
        '// uses Buffer.from(bytes).toString("base64") which Node provides but the offscreen',
        '// browser context does not. INV-06 byte-freeze stays intact -- fix is build-side, not Lattice-side.',
        'if (typeof globalThis.Buffer === "undefined") {',
        '  globalThis.Buffer = {',
        '    from: function (input, encoding) {',
        '      if (typeof input === "string" && encoding === "base64") {',
        '        var bin = atob(input);',
        '        var bytes = new Uint8Array(bin.length);',
        '        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);',
        '        return bytes;',
        '      }',
        '      if (input instanceof Uint8Array || (input && typeof input.length === "number" && typeof input !== "string")) {',
        '        var bytes = input;',
        '        return {',
        '          toString: function (enc) {',
        '            if (enc === "base64") {',
        '              var s = "";',
        '              for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] & 0xFF);',
        '              return btoa(s);',
        '            }',
        '            throw new Error("Buffer polyfill: unsupported toString encoding: " + enc);',
        '          }',
        '        };',
        '      }',
        '      throw new Error("Buffer polyfill: unsupported Buffer.from() input");',
        '    }',
        '  };',
        '}'
      ].join("\n"),
    },
    plugins: [
      {
        name: 'stub-node-builtins',
        setup(build) {
          build.onResolve({ filter: /^node:/ }, () => ({
            path: 'node-stub',
            namespace: 'node-stub-ns',
          }));
          build.onLoad({ filter: /.*/, namespace: 'node-stub-ns' }, () => ({
            contents: [
              'export default {};',
              'export const join = (...p) => p.filter(Boolean).join("/");',
              'export const fileURLToPath = (u) => String(u);',
              'export const mkdir = async () => undefined;',
              'export const readFile = async () => "";',
              'export const readdir = async () => [];',
              'export const rm = async () => undefined;',
              'export const stat = async () => ({});',
              'export const writeFile = async () => undefined;',
            ].join('\n'),
            loader: 'js',
          }));
        },
      },
    ],
  },
  {
    name: 'content-canvas-interceptor',
    entryPoints: [path.join(SRC_ROOT, 'canvas-interceptor.js')],
    outfile: path.join(OUT_ROOT, 'content', 'canvas-interceptor.js'),
    format: 'iife',
    sourcemap: false, // D-04: content-script bundles have NO sourcemap (lean payload)
    platform: 'browser',
    target: ['chrome120'],
    bundle: true,
    legalComments: 'none',
    allowOverwrite: true,
    optional: true, // canvas-interceptor.js is small + may not always be present
  },
  {
    name: 'content-phantom-stream-capture',
    entryPoints: [path.join(SRC_ROOT, 'content', 'phantom-stream-capture-entry.js')],
    outfile: path.join(SRC_ROOT, 'content', 'phantom-stream-capture.js'),
    format: 'iife',
    sourcemap: false,
    platform: 'browser',
    target: ['chrome120'],
    bundle: true,
    legalComments: 'none',
    allowOverwrite: true,
  },
  {
    name: 'ws-phantom-stream-protocol',
    entryPoints: [path.join(SRC_ROOT, 'ws', 'phantom-stream-protocol-entry.js')],
    outfile: path.join(SRC_ROOT, 'ws', 'phantom-stream-protocol.js'),
    format: 'iife',
    sourcemap: false,
    platform: 'browser',
    target: ['chrome120'],
    bundle: true,
    legalComments: 'none',
    allowOverwrite: true,
  },
  {
    name: 'showcase-phantom-stream-viewer',
    entryPoints: [path.join(SHOWCASE_ROOT, 'js', 'phantom-stream-viewer-entry.js')],
    outfile: path.join(SHOWCASE_ROOT, 'js', 'phantom-stream-viewer.js'),
    format: 'iife',
    sourcemap: false,
    platform: 'browser',
    target: ['chrome120'],
    bundle: true,
    legalComments: 'none',
    allowOverwrite: true,
  },
];

/**
 * Filter out optional entries whose source file does not exist yet.
 * Plan 05-01 ships the config and accepts that the lattice-host entry has
 * no source until Plan 05-04 lands.
 */
function resolveEntries() {
  return ENTRIES.filter((entry) => {
    const src = entry.entryPoints[0];
    if (entry.optional && !fs.existsSync(src)) {
      return false;
    }
    return true;
  });
}

async function buildAll() {
  const entries = resolveEntries();
  if (entries.length === 0) {
    console.log('[esbuild] no entries to build (all optional sources absent)');
    return;
  }
  console.log('[esbuild] building', entries.length, 'entries to', OUT_ROOT);
  for (const entry of entries) {
    console.log('[esbuild]  -', entry.name, '->', path.relative(REPO_ROOT, entry.outfile));
    const { name, optional, ...buildOpts } = entry;
    await esbuild.build(buildOpts);
  }
  console.log('[esbuild] done');
}

buildAll().catch((err) => {
  console.error('[esbuild] build failed:', err && err.message ? err.message : err);
  process.exit(1);
});

module.exports = { ENTRIES, resolveEntries, buildAll };
