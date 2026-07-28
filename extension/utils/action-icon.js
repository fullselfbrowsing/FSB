/**
 * FSB toolbar action icon - state-driven static / animated frames.
 *
 * Quick 260728-k2v. Replaces the old chrome.action badge connection dot with a
 * frame-swapped toolbar icon that mirrors the on-page ViewportGlow overlay
 * (extension/content/visual-feedback.js): same periods, same palettes, same
 * phase vocabulary, same retime-on-state-change behaviour.
 *
 * States:
 *   idle      - base glyph only. Full strength when the dashboard relay is
 *               connected, dimmed + desaturated when it is not.
 *   watching  - STATIC single frame in the watching palette. Deliberately not
 *               animated: trigger-watch is an always-armed ambient state and a
 *               perpetual repaint loop is a keepalive pattern Chrome restricts.
 *   thinking / acting / calling - animated orbit bead, one setInterval loop.
 *
 * Everything canvas, timer and persistence related lives in this file. The
 * service worker only calls the five public methods.
 *
 * Classic script. Loaded into the MV3 service worker global scope.
 */

(function () {
  'use strict';

  // ---- Locked geometry + cadence -----------------------------------------
  var FRAME_INTERVAL_MS = 66;        // ~15fps. chrome.alarms floors at 30s.
  var BEAD_FRACTION = 0.12;          // bead spans 12% of the ring circumference
  var FADE_FRACTION = 0.02;          // 2% of the circumference fades at each end
  var SIZES = [16, 32];              // toolbar renders 16/24/32 DIPs
  var RING_INSET_RATIO = 0.09;
  var RING_WIDTH_RATIO = 0.10;
  // Full bleed, so the toolbar mark is the same size as the static manifest icon.
  // The bead therefore rides over the artwork's empty black border instead of
  // orbiting outside it, which is deliberate. Do not re-derive this from the ring
  // constants: the old 1 - 2*inset - width made the tile narrower than the ring,
  // so the bead left the artwork on the axes and cut across its corners.
  var GLYPH_SCALE = 1.0;
  var BEAD_SEGMENTS = 24;
  var DIM_ALPHA = 0.5;
  var DIM_FILTER = 'grayscale(0.8)';

  var INTENT_KEY = 'fsbActionIconIntent';
  // One source per output size. icon16 is not a downscale of icon128 -- its mark
  // was redrawn about a fifth chunkier to stay legible, so 16 has to come from
  // its own asset or the mark renders thin. 128 into 32 is an exact 4:1 reduction.
  var GLYPH_PATHS = { 16: 'assets/icon16.png', 32: 'assets/icon128.png' };

  // Normalized fade width expressed within the bead's own 0..1 span.
  var FADE_SPAN = FADE_FRACTION / BEAD_FRACTION;

  // ---- Locked palettes + periods -----------------------------------------
  // Canonical source: visual-feedback.js _getDuration() and the shadow-root
  // custom properties --glow-color-1 / --glow-color-2.
  var STATES = {
    thinking: { duration: 6000, from: '#ff8c00', to: '#f59e0b', animated: true },
    acting: { duration: 4000, from: '#ff6600', to: '#ff8c00', animated: true },
    calling: { duration: 4000, from: '#8b5cf6', to: '#a78bfa', animated: true },
    watching: { duration: 5000, from: '#ff8c00', to: '#ffa500', animated: false }
  };

  // ---- Module state -------------------------------------------------------
  var unavailable = false;
  var ready = false;
  var initPromise = null;
  var liveSessionProbe = null;

  var contexts = Object.create(null);       // size -> CanvasRenderingContext2D
  var animatedFrames = Object.create(null); // state -> array of frame records
  var animatedBuilds = Object.create(null); // state -> in-flight build promise
  var staticFrames = Object.create(null);   // key -> frame record
  var emitFailureLogged = false;

  var currentState = null;   // a STATES key with animated:true while animating
  var animating = false;
  var watching = false;
  var connected = false;
  var watchingExplicit = false;
  var connectedExplicit = false;
  var startTime = 0;
  var timerId = null;
  var lastEmitted = null;

  // ---- Colour helpers -----------------------------------------------------

  function parseHex(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function mixColor(head, tail, t, alpha) {
    var r = Math.round(head.r + (tail.r - head.r) * t);
    var g = Math.round(head.g + (tail.g - head.g) * t);
    var b = Math.round(head.b + (tail.b - head.b) * t);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  // Alpha ramp across the bead: 0 -> 1 over the leading fade, 1 -> 0 over the
  // trailing fade, solid in between. Mirrors the overlay's own bead profile.
  function beadAlpha(t) {
    if (t < FADE_SPAN) return t / FADE_SPAN;
    if (t > 1 - FADE_SPAN) return (1 - t) / FADE_SPAN;
    return 1;
  }

  // ---- Canvas -------------------------------------------------------------

  function contextFor(size) {
    var ctx = contexts[size];
    if (!ctx) {
      // willReadFrequently keeps getImageData off the GPU readback path.
      ctx = new OffscreenCanvas(size, size).getContext('2d', { willReadFrequently: true });
      contexts[size] = ctx;
    }
    return ctx;
  }

  function drawGlyph(ctx, size, bitmap, dimmed) {
    var drawn = size * GLYPH_SCALE;
    var offset = (size - drawn) / 2;
    if (dimmed) {
      ctx.globalAlpha = DIM_ALPHA;
      ctx.filter = DIM_FILTER;
    }
    ctx.drawImage(bitmap, offset, offset, drawn, drawn);
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
  }

  function strokeBead(ctx, size, palette, progress) {
    var center = size / 2;
    var radius = size / 2 - RING_INSET_RATIO * size;
    var head = parseHex(palette.from);
    var tail = parseHex(palette.to);
    var full = Math.PI * 2;
    ctx.lineWidth = RING_WIDTH_RATIO * size;
    ctx.lineCap = 'round';
    for (var i = 0; i < BEAD_SEGMENTS; i++) {
      var t0 = i / BEAD_SEGMENTS;
      var t1 = (i + 1) / BEAD_SEGMENTS;
      var mid = (t0 + t1) / 2;
      var alpha = beadAlpha(mid);
      if (alpha <= 0) continue;
      ctx.strokeStyle = mixColor(head, tail, mid, alpha);
      var a0 = (progress + t0 * BEAD_FRACTION) * full - Math.PI / 2;
      var a1 = (progress + t1 * BEAD_FRACTION) * full - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(center, center, radius, a0, a1);
      ctx.stroke();
    }
  }

  // Renders one frame at every shipped size, each from its own source bitmap.
  // Nothing paints a background of its own -- the artwork already carries an
  // opaque tile, and a service worker cannot read the toolbar theme to pick one.
  function renderFrame(bitmaps, spec) {
    var frame = {};
    for (var i = 0; i < SIZES.length; i++) {
      var size = SIZES[i];
      var ctx = contextFor(size);
      ctx.clearRect(0, 0, size, size);
      drawGlyph(ctx, size, bitmaps[size], spec.dimmed === true);
      if (spec.bead === true) strokeBead(ctx, size, spec.palette, spec.progress || 0);
      frame[size] = ctx.getImageData(0, 0, size, size);
    }
    return frame;
  }

  function closeGlyphs(bitmaps) {
    for (var i = 0; i < SIZES.length; i++) {
      var bitmap = bitmaps[SIZES[i]];
      if (bitmap) bitmap.close();
    }
  }

  // One bitmap per output size. createImageBitmap rejects SVG sources in a
  // worker, so PNG is the only viable base image here. A partial failure closes
  // whatever already decoded rather than stranding it.
  async function loadGlyphs() {
    var bitmaps = {};
    try {
      for (var i = 0; i < SIZES.length; i++) {
        var size = SIZES[i];
        var response = await fetch(chrome.runtime.getURL(GLYPH_PATHS[size]));
        var blob = await response.blob();
        bitmaps[size] = await createImageBitmap(blob);
      }
    } catch (e) {
      closeGlyphs(bitmaps);
      throw e;
    }
    return bitmaps;
  }

  // Only the four resting frames are rendered up front. A worker wake that never
  // animates should not pay for a couple hundred frames it will never show.
  async function buildStaticCache() {
    var bitmaps = await loadGlyphs();
    try {
      staticFrames['idle:on'] = renderFrame(bitmaps, { bead: false, dimmed: false });
      staticFrames['idle:off'] = renderFrame(bitmaps, { bead: false, dimmed: true });
      staticFrames['watching:on'] = renderFrame(bitmaps, {
        palette: STATES.watching, progress: 0, bead: true, dimmed: false
      });
      staticFrames['watching:off'] = renderFrame(bitmaps, {
        palette: STATES.watching, progress: 0, bead: true, dimmed: true
      });
    } finally {
      closeGlyphs(bitmaps);
    }
  }

  // One state's worth of frames, rendered on first use and kept for the life of
  // the worker. Concurrent callers share the in-flight build; a failed build is
  // dropped so a later transition can retry it.
  function ensureAnimatedFrames(state) {
    if (animatedFrames[state]) return Promise.resolve(animatedFrames[state]);
    if (animatedBuilds[state]) return animatedBuilds[state];
    var build = (async function () {
      var bitmaps = await loadGlyphs();
      try {
        var spec = STATES[state];
        var count = Math.round(spec.duration / FRAME_INTERVAL_MS);
        var frames = new Array(count);
        for (var f = 0; f < count; f++) {
          frames[f] = renderFrame(bitmaps, {
            palette: spec,
            progress: f / count,
            bead: true,
            dimmed: false
          });
        }
        animatedFrames[state] = frames;
        return frames;
      } finally {
        closeGlyphs(bitmaps);
      }
    })();
    animatedBuilds[state] = build;
    build.catch(function (e) {
      delete animatedBuilds[state];
      console.error('[FSB] action icon: could not render ' + state + ' frames:', e && e.message);
    });
    return build;
  }

  // ---- Emission -----------------------------------------------------------

  // Reported once. A repaint failure repeats every frame, so the first one is
  // the only useful signal and the rest would be noise.
  function noteEmitFailure(err) {
    if (emitFailureLogged) return;
    emitFailureLogged = true;
    console.error('[FSB] action icon: setIcon failed, the icon will stop updating:', err && err.message);
  }

  // Always global. A per-surface icon permanently shadows the global one, which
  // would silently strand the loop for that surface.
  function emit(frame) {
    if (!frame || frame === lastEmitted) return;
    lastEmitted = frame;
    try {
      var result = chrome.action.setIcon({ imageData: { 16: frame[16], 32: frame[32] } });
      if (result && typeof result.catch === 'function') result.catch(noteEmitFailure);
    } catch (e) { noteEmitFailure(e); }
  }

  function staticFrame() {
    return staticFrames[(watching ? 'watching' : 'idle') + (connected ? ':on' : ':off')];
  }

  function frameAt(now) {
    var frames = animatedFrames[currentState];
    if (!frames || !frames.length) return null;
    var duration = STATES[currentState].duration;
    var elapsed = (now - startTime) % duration;
    var progress = elapsed / duration;
    var index = Math.min(frames.length - 1, Math.floor(progress * frames.length));
    return frames[index];
  }

  // ---- Loop ---------------------------------------------------------------

  function tick() {
    if (!animating || !currentState) {
      stopLoop();
      return;
    }
    emit(frameAt(Date.now()));
  }

  function stopLoop() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startLoop() {
    stopLoop();
    timerId = setInterval(tick, FRAME_INTERVAL_MS);
    tick();
  }

  // ---- Persistence --------------------------------------------------------

  function persistIntent() {
    try {
      var area = chrome.storage && chrome.storage.session;
      if (!area || typeof area.set !== 'function') return;
      var record = {};
      record[INTENT_KEY] = {
        animating: animating,
        state: currentState,
        watching: watching,
        connected: connected,
        updatedAt: Date.now()
      };
      var result = area.set(record);
      if (result && typeof result.catch === 'function') result.catch(function () {});
    } catch (_e) { /* persistence is best-effort */ }
  }

  async function readIntent() {
    try {
      var area = chrome.storage && chrome.storage.session;
      if (!area || typeof area.get !== 'function') return null;
      var stored = await area.get(INTENT_KEY);
      var value = stored && stored[INTENT_KEY];
      return value && typeof value === 'object' ? value : null;
    } catch (_e) {
      return null;
    }
  }

  // ---- Transitions --------------------------------------------------------

  function startAnimation(next, fresh) {
    if (!STATES[next] || !STATES[next].animated) return;
    if (fresh !== true && animating && currentState === next && timerId !== null) return;
    var running = animating && timerId !== null && currentState && STATES[currentState];
    var now = Date.now();
    if (fresh !== true && running) {
      // Preserve the visual position across a period change so the bead does
      // not jump mid-cycle (ported from the overlay's setState).
      var oldDuration = STATES[currentState].duration;
      var elapsed = (now - startTime) % oldDuration;
      var progress = elapsed / oldDuration;
      startTime = now - progress * STATES[next].duration;
    } else {
      startTime = now;
    }
    currentState = next;
    animating = true;
    persistIntent();
    if (animatedFrames[next]) {
      startLoop();
      return;
    }
    // First time this state is shown: render its frames, then pick the loop up
    // only if the state still applies once they are ready.
    ensureAnimatedFrames(next).then(function () {
      if (animating && currentState === next) startLoop();
    }).catch(function () { /* reported by ensureAnimatedFrames */ });
  }

  function stopAnimation() {
    var changed = animating;
    stopLoop();
    animating = false;
    currentState = null;
    if (changed) persistIntent();
    emit(staticFrame());
  }

  // ---- Public API ---------------------------------------------------------

  function init(options) {
    if (initPromise) return initPromise;
    initPromise = (async function () {
      if (typeof OffscreenCanvas === 'undefined'
          || typeof createImageBitmap !== 'function'
          || typeof chrome === 'undefined'
          || !chrome.action
          || typeof chrome.action.setIcon !== 'function') {
        unavailable = true;
        console.error('[FSB] action icon: canvas or chrome.action missing, staying on the manifest icon');
        return;
      }
      if (options && typeof options.hasLiveSession === 'function') {
        liveSessionProbe = options.hasLiveSession;
      }
      try {
        await buildStaticCache();
      } catch (e) {
        unavailable = true;
        console.error('[FSB] action icon: base frames failed to render, icon disabled:', e && e.message);
        return;
      }
      var intent = await readIntent();
      if (intent) {
        if (!watchingExplicit) watching = intent.watching === true;
        if (!connectedExplicit) connected = intent.connected === true;
      }
      ready = true;
      var live = true;
      if (liveSessionProbe) {
        try { live = liveSessionProbe() === true; } catch (_e) { live = false; }
      }
      if (intent && intent.animating === true
          && STATES[intent.state] && STATES[intent.state].animated && live) {
        // Restart the cycle from frame 0 rather than resuming mid-phase; this
        // matches the overlay being destroyed and recreated on a page reload.
        startAnimation(intent.state, true);
      } else {
        stopAnimation();
        persistIntent();
      }
    })();
    return initPromise;
  }

  // Single drive point. Gate and phase map are identical to the content-script
  // overlay: highlight.animated decides animated vs static, then the phase
  // selects the palette and period.
  function applyOverlayState(overlayState) {
    if (unavailable || !ready) return;
    var highlight = overlayState && overlayState.highlight;
    if (!highlight || highlight.animated !== true) {
      stopAnimation();
      return;
    }
    var phase = overlayState.phase;
    var next = phase === 'calling'
      ? 'calling'
      : (phase === 'acting' || phase === 'writing' || phase === 'switching_tab')
        ? 'acting'
        : 'thinking';
    startAnimation(next, false);
  }

  function setWatching(isWatching) {
    if (unavailable) return;
    var next = isWatching === true;
    watchingExplicit = true;
    if (watching === next) return;
    watching = next;
    if (!ready) return;
    persistIntent();
    if (!animating) emit(staticFrame());
  }

  function setConnected(isConnected) {
    if (unavailable) return;
    var next = isConnected === true;
    connectedExplicit = true;
    if (connected === next) return;
    connected = next;
    if (!ready) return;
    persistIntent();
    if (!animating) emit(staticFrame());
  }

  // Watchdog entry point. A worker killed mid-cycle leaves the icon frozen on
  // its last frame because action state lives in the browser process; this
  // re-derives the intended frame and revives the loop when one is owed.
  function repair() {
    if (unavailable || !initPromise) return Promise.resolve();
    return initPromise.then(function () {
      if (unavailable || !ready) return;
      lastEmitted = null;
      if (animating && currentState && STATES[currentState]) {
        if (timerId === null) startTime = Date.now();
        var revived = currentState;
        if (animatedFrames[revived]) {
          startLoop();
        } else {
          ensureAnimatedFrames(revived).then(function () {
            if (animating && currentState === revived) startLoop();
          }).catch(function () { /* reported by ensureAnimatedFrames */ });
        }
      } else {
        stopLoop();
        emit(staticFrame());
      }
    }).catch(function () { /* the icon is presentation-only */ });
  }

  globalThis.fsbActionIcon = Object.freeze({
    init: init,
    applyOverlayState: applyOverlayState,
    setWatching: setWatching,
    setConnected: setConnected,
    repair: repair
  });
})();
