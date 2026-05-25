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
    // Plan 05-04 lands the source file. Plan 05-01 emits an EMPTY placeholder
    // bundle so the dist tree is shape-complete; the bundle gets re-emitted
    // with real content when Plan 05-04 lands extension/offscreen/lattice-host.js.
    entryPoints: [path.join(SRC_ROOT, 'offscreen', 'lattice-host.js')],
    outfile: path.join(OUT_ROOT, 'offscreen', 'lattice-host.js'),
    format: 'esm',
    sourcemap: 'external',
    platform: 'browser',
    target: ['chrome120'],
    bundle: true,
    legalComments: 'none',
    allowOverwrite: true,
    optional: true, // skip if source file does not exist yet (Plan 05-01 phase)
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
