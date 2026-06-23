'use strict';

/**
 * Phase 33 (MEDIA) -- PhantomStream media playback sync.
 *
 * Exercises the pure drift reconciler (reconcileMediaDrift) and the adaptive
 * manifest classifier (classifyManifest) that back FSB's live <video>/<audio>
 * mirroring. Both are re-exported from the package's /protocol surface. The
 * reconciler is pure (no DOM, no media element; the caller supplies `now`), so
 * the whole drift-correction contract is node-testable with no real browser
 * and no media timeline -- the value of the package's MWIRE-02 design.
 *
 * Run: node tests/phantom-stream-media-sync.test.js
 */

const assert = require('node:assert/strict');

const PROTOCOL = '@full-self-browsing/phantom-stream/protocol';

let passed = 0;
function ok(condition, message) {
  assert.equal(Boolean(condition), true, message);
  passed += 1;
  console.log('  PASS:', message);
}
function eq(actual, expected, message) {
  assert.deepStrictEqual(actual, expected, message + ' (got ' + JSON.stringify(actual) + ')');
  passed += 1;
  console.log('  PASS:', message);
}

(async () => {
  console.log('\n--- PhantomStream media sync (Phase 33) ---');

  const protocol = await import(PROTOCOL);
  const {
    reconcileMediaDrift,
    DEFAULT_MEDIA_RECONCILE_CONFIG,
    classifyManifest,
    STREAM,
    MEDIA_SYNC_THROTTLE_MS,
  } = protocol;

  // --- media-protocol surface present on /protocol (0.2.1 uptake) ---
  ok(typeof reconcileMediaDrift === 'function', '/protocol exports reconcileMediaDrift');
  ok(typeof classifyManifest === 'function', '/protocol exports classifyManifest');
  ok(DEFAULT_MEDIA_RECONCILE_CONFIG && typeof DEFAULT_MEDIA_RECONCILE_CONFIG === 'object',
    '/protocol exports DEFAULT_MEDIA_RECONCILE_CONFIG');
  ok(typeof MEDIA_SYNC_THROTTLE_MS === 'number' && MEDIA_SYNC_THROTTLE_MS > 0,
    '/protocol exports a positive MEDIA_SYNC_THROTTLE_MS');
  ok(STREAM.MEDIA === 'ext:dom-media', 'STREAM.MEDIA wire type is ext:dom-media');
  ok(STREAM.MEDIA_HINT === 'ext:dom-media-hint', 'STREAM.MEDIA_HINT wire type is ext:dom-media-hint');

  // --- locked default tolerances ---
  eq(DEFAULT_MEDIA_RECONCILE_CONFIG.holdBandSec, 0.25, 'default holdBandSec is 0.25');
  eq(DEFAULT_MEDIA_RECONCILE_CONFIG.hardSeekSec, 1.0, 'default hardSeekSec is 1.0');

  const NOW = 1000;
  // elapsed 0 (sentAt === now) so expected position == remote.currentTime; the
  // VOD/seek/nudge cases isolate drift from latency compensation.
  const base = { paused: false, playbackRate: 1, sentAt: NOW };

  // 0. incomplete / non-finite remote -> hold (never propagates NaN)
  eq(reconcileMediaDrift({ currentTime: 5 }, null, NOW).action, 'hold',
    'null remote holds (incomplete-remote)');
  eq(reconcileMediaDrift({ currentTime: 5 }, { sentAt: NOW }, NOW).reason, 'incomplete-remote',
    'remote missing currentTime is incomplete');

  // 1. explicit seek short-circuits everything
  {
    const r = reconcileMediaDrift({ currentTime: 5 },
      Object.assign({}, base, { event: 'seeked', currentTime: 42, duration: 100 }), NOW);
    eq(r.action, 'seek', 'seeked event seeks');
    eq(r.toTime, 42, 'seeked event seeks to the captured position');
  }

  // 2. paused remote mirrors pause / holds when local already paused
  eq(reconcileMediaDrift({ currentTime: 5, paused: false },
    Object.assign({}, base, { paused: true, currentTime: 5, duration: 100 }), NOW).action, 'pause',
    'paused remote pauses a playing local');
  eq(reconcileMediaDrift({ currentTime: 5, paused: true },
    Object.assign({}, base, { paused: true, currentTime: 5, duration: 100 }), NOW).reason, 'paused',
    'paused remote + paused local holds');

  // 3. live stream: rejoin edge on large drift, hold in-band (never absolute-seek)
  eq(reconcileMediaDrift({ currentTime: 50 },
    Object.assign({}, base, { live: true, currentTime: 100 }), NOW).action, 'rejoin-edge',
    'live stream rejoins the edge on large drift');
  eq(reconcileMediaDrift({ currentTime: 99.9 },
    Object.assign({}, base, { live: true, currentTime: 100 }), NOW).reason, 'live-in-band',
    'live stream holds when near the edge');

  // 4. VOD: hold band carries revertRate (restores a prior nudge)
  {
    const r = reconcileMediaDrift({ currentTime: 10.1 },
      Object.assign({}, base, { currentTime: 10, duration: 100 }), NOW);
    eq(r.action, 'hold', 'VOD small drift holds');
    eq(r.revertRate, 1, 'VOD hold carries the true rate to revert a prior nudge');
  }

  // 5. VOD: bounded sign-correct nudge in the mid band (smooth, not a snap)
  {
    const r = reconcileMediaDrift({ currentTime: 9.5 },
      Object.assign({}, base, { currentTime: 10, duration: 100 }), NOW);
    eq(r.action, 'nudge', 'VOD mid-band drift nudges instead of snapping');
    ok(r.rate > 1 && r.rate <= 1.05, 'behind -> nudge speeds up within the bounded fraction');
    eq(r.baseRate, 1, 'nudge carries the base rate for later revert');
  }

  // 6. VOD: hard-seek past the threshold, clamped into [0, duration]
  {
    const r = reconcileMediaDrift({ currentTime: 5 },
      Object.assign({}, base, { currentTime: 10, duration: 100 }), NOW);
    eq(r.action, 'seek', 'VOD large drift hard-seeks');
    eq(r.toTime, 10, 'hard-seek targets the latency-compensated expected position');
  }

  // 7. loop wrap: seek to the wrapped position, not the huge raw delta
  {
    const r = reconcileMediaDrift({ currentTime: 9.9 },
      Object.assign({}, base, { currentTime: 0.2, duration: 10, loop: true }), NOW);
    eq(r.action, 'seek', 'loop wrap seeks');
    eq(r.toTime, 0.2, 'loop wrap seeks to the wrapped (near-start) position');
  }

  // 8. latency compensation: elapsed since sentAt advances the expected position
  {
    // remote at t=10 captured 500ms ago at rate 1 -> expected ~10.5; on-time local holds.
    const r = reconcileMediaDrift({ currentTime: 10.5 },
      { paused: false, playbackRate: 1, currentTime: 10, duration: 100, sentAt: NOW - 500 }, NOW);
    eq(r.action, 'hold', 'latency-compensated expected position keeps an on-time local in band');
  }

  // --- classifyManifest (HLS/DASH discovery filter; never throws) ---
  eq(classifyManifest({ url: 'https://cdn.example.com/v/master.m3u8' }), 'hls',
    'm3u8 path classifies as hls');
  eq(classifyManifest({ url: 'https://cdn.example.com/v/manifest.mpd' }), 'dash',
    'mpd path classifies as dash');
  eq(classifyManifest({ contentType: 'application/dash+xml' }), 'dash',
    'dash content-type classifies as dash');
  eq(classifyManifest({ url: 'https://cdn.example.com/v/poster.jpg' }), null,
    'non-manifest url classifies as null');
  eq(classifyManifest(null), null, 'null input classifies as null (never throws)');

  console.log('\nPhantomStream media sync: ' + passed + ' PASS / 0 FAIL');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
