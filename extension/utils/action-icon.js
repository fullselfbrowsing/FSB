/**
 * FSB toolbar action icon - state-driven static / animated frames.
 *
 * Quick 260728-k2v. Replaces the old chrome.action badge connection dot with a
 * frame-swapped toolbar icon carrying one distinct motion per state, as drawn in
 * the design export (Orbit / Sweep / Breathe / Capability ring).
 *
 * Each form quotes an existing on-page signal where one exists, so the icon and
 * the page read as one system. Three of the four do:
 *
 *   idle      - base glyph only. Full strength until a dashboard relay has
 *               connected at least once and then dropped.
 *   thinking  - SWEEP. The indeterminate progress bar, quoting
 *               .fsb-progress-bar.indeterminate .fsb-progress-fill and its
 *               fsbProgressSweep keyframe (1.2s ease-in-out, 38% fill,
 *               translateX -120% -> 320%). No orbit bead.
 *   acting    - ORBIT. The ViewportGlow perimeter bead, 4s, _getDuration().
 *   calling   - CAPABILITY RING. An inset violet border repeating while an
 *               invocation is in flight, plus a ping travelling INWARD -- an
 *               icon cannot paint outside its own box, so the design's outward
 *               spread is unrenderable.
 *               This form has NO upstream source: there is no ring pulse and no
 *               1.6s cadence anywhere in the extension. It is design-only, and
 *               it deliberately diverges from ViewportGlow's 4s calling glow.
 *   watching  - BREATHE. Quotes the trigger badge dot's 2.4s ease-in-out
 *               cadence and loops for as long as a watch remains armed. The
 *               mark fades over a fixed black plate while a deliberately
 *               amplified orange bloom keeps the motion legible at 16px.
 *
 * Everything canvas, timer and persistence related lives in this file. The
 * service worker drives it through the small public API at the bottom.
 *
 * Classic script. Loaded into the MV3 service worker global scope.
 */

(function () {
  'use strict';

  // ---- Locked geometry + cadence -----------------------------------------
  var FRAME_INTERVAL_MS = 66;        // ~15fps. chrome.alarms floors at 30s.
  var BEAD_FRACTION = 0.12;          // bead spans 12% of the square perimeter
  var FADE_FRACTION = 0.02;          // 2% of the perimeter fades at each end
  var SIZES = [16, 32];              // toolbar renders 16/24/32 DIPs
  var ORBIT_WIDTH_RATIO = 0.10;
  // Full bleed, so the toolbar mark is the same size as the static manifest icon.
  // Orbit's centreline sits half its own width inside that tile: its outside edge
  // is flush with the square artwork without being clipped by the canvas.
  var GLYPH_SCALE = 1.0;
  var BEAD_SEGMENTS = 24;
  var SEAM_OVERLAP = 0.5;            // fraction of a segment
  var DIM_ALPHA = 0.5;
  var DIM_FILTER = 'grayscale(0.8)';

  // ---- Sweep (thinking) ---------------------------------------------------
  // Canonical: visual-feedback.js .fsb-progress-bar / .fsb-progress-fill and the
  // fsbProgressSweep keyframe. The track is scaled for legibility rather than
  // proportionally -- the canonical 4/128 height lands at half a pixel at 16px.
  var SWEEP_TRACK_W_RATIO = 0.594;   // 76/128, the design's own 32px check
  var SWEEP_TRACK_H_RATIO = 0.0625;  // 8/128 -> 1px at 16, 2px at 32
  var SWEEP_TRACK_H_MIN = 1;
  // The artwork's baked-in tag ends at y 0.656, so 0.75 keeps the track in the
  // clear band beneath it.
  var SWEEP_CENTER_Y_RATIO = 0.75;
  var SWEEP_FILL_FRACTION = 0.38;
  var SWEEP_FROM_PCT = -1.20;        // translateX(-120%), of the fill's own width
  var SWEEP_TO_PCT = 3.20;           // translateX(320%)
  var SWEEP_TRACK_COLOR = 'rgba(255, 255, 255, 0.1)';

  // ---- Breathe (watching) -------------------------------------------------
  // Canonical cadence: the .badge-dot fsb-trigger-badge-dot keyframe, 2.4s
  // ease-in-out. The dot also scales 1 -> 1.15; the icon does not, because
  // rescaling the mark at 16px aliases it. The glow colour is the dot's own
  // static box-shadow colour.
  var GLOW_RGB = '255, 140, 0';
  // The plate the lockup sits on. Repainting it is not the "opaque background"
  // the notes warn against -- the artwork already carries this exact tile; this
  // just keeps it solid while the mark above it fades.
  var PLATE_COLOR = '#000000';
  var BREATHE_MIN_ALPHA = 0.45;
  var BREATHE_GLOW_RATIO = 0.15625;  // 20/128 -> 2.5px at 16, 5px at 32
  var BREATHE_GLOW_ALPHA = 0.95;
  // Null means the breathe runs for as long as a watch is armed. This is the one
  // line that decides whether an armed trigger keeps the service worker awake:
  // set it to a number (6000 was the previous value) to restore a bounded hold.
  var BREATHE_HOLD_MS = null;
  // The settle frame is not invented: it is the badge dot's reduced-motion state
  // (animation: none; opacity: 0.85) plus its static 8px glow.
  var SETTLE_ALPHA = 0.85;
  var SETTLE_GLOW_RATIO = 0.0625;    // 8/128
  var SETTLE_GLOW_ALPHA = 0.75;

  // ---- Capability ring (calling) ------------------------------------------
  // Design-only. 3/128 is sub-pixel at both output sizes, so the stroke has a
  // 1px floor and the ring reads as a hairline border rather than a 3px band.
  // Scaled for legibility rather than proportionally, exactly as the sweep track
  // is: the design's 3/128 lands at 0.75px on a 32px tile, and the 1px hairline
  // it floored to did not read as a per-call pulse at toolbar size.
  var CAP_COLOR = '#8b5cf6';
  var CAP_RING_W_RATIO = 0.0625;     // 2px at 32, 1px at 16
  var CAP_RING_W_MIN = 1;
  var CAP_PING_INSET_RATIO = 0.15;   // ~4.8px of inward travel at 32
  var CAP_ALPHA_HIGH = 0.9;
  var CAP_ALPHA_LOW = 0.35;
  var CAP_PING_ALPHA = 0.55;
  var CAP_PING_STOP = 0.7;           // the keyframe's 70% stop

  var INTENT_KEY = 'fsbActionIconIntent';
  var ANIMATIONS_KEY = 'animatedActionHighlights';
  // Install-scoped, so it outlives the session record above. Dimming means "the
  // relay you use is down", not "you have never opened the dashboard": the relay
  // has no enable switch and connect() runs unconditionally at startup, so a
  // plain extension/MCP user would otherwise sit at the dimmed frame forever.
  var RELAY_SEEN_KEY = 'fsbActionIconRelaySeen';
  // Armed only while a loop is owed. A frozen static frame needs no repair --
  // action state lives in the browser process and survives eviction intact --
  // so a permanent beat here would wake the worker every 30s forever for
  // nothing, which is the same keepalive shape that kept watching static.
  var WATCHDOG_ALARM = 'fsb-action-icon-watchdog';
  var WATCHDOG_PERIOD_MINUTES = 0.5;   // Chrome's periodic floor.
  // How long the latest tool call on a tab keeps its activity claim alive.
  // The form's own duration still controls each animation cycle.
  var ACTIVITY_TTL_MS = 60000;
  // A rejected action update must not turn into the same 15fps failure loop as
  // a healthy animation. Retry the latest desired frame at a bounded cadence;
  // a success resets the backoff immediately.
  var EMIT_RETRY_BASE_MS = 1000;
  var EMIT_RETRY_MAX_MS = 30000;
  // One source per output size. icon16 is not a downscale of icon128 -- its mark
  // was redrawn about a fifth chunkier to stay legible, so 16 has to come from
  // its own asset or the mark renders thin. 128 into 32 is an exact 4:1 reduction.
  var GLYPH_PATHS = { 16: 'assets/icon16.png', 32: 'assets/icon128.png' };

  // Normalized fade width expressed within the bead's own 0..1 span.
  var FADE_SPAN = FADE_FRACTION / BEAD_FRACTION;

  // ---- Locked forms, palettes + periods -----------------------------------
  // Each state names its own canonical source; only acting still tracks
  // ViewportGlow. `bounded` means the loop runs for that long and then settles.
  // Keyed by the form itself. The old phase names (acting / thinking / calling)
  // would actively mislead here: orbit now means READING, so a key called
  // "acting" naming the read animation is a trap for the next reader.
  var STATES = {
    // Driving the browser. fsbProgressSweep, visual-feedback.js -- 1.2s ease-in-out.
    sweep: { duration: 1200, form: 'sweep', from: '#ff8c00', to: '#ff6600', animated: true },
    // Reading. ViewportGlow _getDuration() + .state-acting custom properties.
    orbit: { duration: 4000, form: 'orbit', from: '#ff6600', to: '#ff8c00', animated: true },
    // An in-flight capability invocation. Design-only: no ring pulse or 1.6s cadence exists upstream.
    ring: { duration: 1600, form: 'ring', from: '#8b5cf6', to: '#8b5cf6', animated: true },
    // A trigger watch. fsb-trigger-badge-dot cadence.
    breathe: { duration: 2400, form: 'breathe', from: '#ff8c00', to: '#ffa500', animated: true, bounded: BREATHE_HOLD_MS }
  };

  // Highest claim wins. A watch outranks everything on every tab: it is the one
  // state the user armed deliberately and is waiting on.
  var RANK = { breathe: 4, ring: 3, orbit: 2, sweep: 1 };

  // ---- Module state -------------------------------------------------------
  var unavailable = false;
  var ready = false;
  var initPromise = null;
  var liveSessionProbe = null;

  var contexts = Object.create(null);       // size -> CanvasRenderingContext2D
  var scratches = Object.create(null);      // size -> scratch ctx, for the glow
  var animatedFrames = Object.create(null); // state -> array of frame records
  var animatedBuilds = Object.create(null); // state -> in-flight build promise
  var staticFrames = Object.create(null);   // key -> frame record
  var canonicalFrameBuckets = Object.create(null); // pixel hash -> frame records
  var glyphCache = null;                    // decoded bitmaps, shared by builds
  var glyphBuild = null;                    // in-flight decode
  var emitFailureLogged = false;

  // The toolbar icon is global but the things it reports are not: several tabs
  // and several agents can be doing different things at once. Each source keeps
  // its own claim and the icon renders the highest-ranked one, so nothing is
  // decided by whoever wrote last.
  var claims = Object.create(null);   // 'session:' | 'capability:' | 'watch:' keyed by tab -> state
  var preReadyClaimKeys = Object.create(null); // keys explicitly touched before restore
  var activityTimers = Object.create(null);  // claim key -> expiry timeout id
  var capabilityCounts = Object.create(null); // 'capability:<tabId>' -> in-flight invoke count
  var resolved = null;                // the state currently on screen
  var animating = false;
  var animationsEnabled = true;
  var preferenceListenerArmed = false;
  var connected = false;
  var relaySeen = false;
  var connectedExplicit = false;
  var startTime = 0;
  var timerId = null;
  // chrome.action.setIcon is asynchronous. Keep one browser-process update in
  // flight and one latest-wins mailbox behind it; otherwise a slow browser can
  // accumulate stale frames faster than it can display them.
  var lastEmitted = null;             // last frame whose setIcon call succeeded
  var activeEmitFrame = null;
  var pendingEmitFrame = null;
  var emitInFlight = false;
  var emitBlocked = false;
  var emitRetryTimerId = null;
  var emitFailureCount = 0;
  var watchdogArmed = false;

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

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function alphaColor(rgb, alpha) {
    return 'rgba(' + rgb + ', ' + alpha + ')';
  }

  // ---- CSS timing functions ------------------------------------------------
  // Frames are built once per state and never inside the tick, so solving the
  // bezier by bisection is more than fast enough and reads clearer than Newton.

  function bezierAxis(p1, p2, t) {
    var mt = 1 - t;
    return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t;
  }

  function cubicBezier(p1x, p1y, p2x, p2y, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var lo = 0;
    var hi = 1;
    var mid = 0;
    for (var i = 0; i < 24; i++) {
      mid = (lo + hi) / 2;
      if (bezierAxis(p1x, p2x, mid) < x) lo = mid; else hi = mid;
    }
    return bezierAxis(p1y, p2y, (lo + hi) / 2);
  }

  function easeInOut(x) { return cubicBezier(0.42, 0, 0.58, 1, x); }
  function easeOut(x) { return cubicBezier(0, 0, 0.58, 1, x); }

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

  // Probed rather than assumed. Assigning an unsupported filter is silently
  // ignored instead of throwing, so the only way to tell is to read it back.
  var dropShadows = null;

  function supportsDropShadow(ctx) {
    if (dropShadows !== null) return dropShadows;
    try {
      ctx.filter = 'blur(1px)';
      dropShadows = typeof ctx.filter === 'string' && ctx.filter.indexOf('blur') !== -1;
      ctx.filter = 'none';
    } catch (_e) {
      dropShadows = false;
    }
    return dropShadows;
  }

  // One scratch surface per size, reused. Needed because the artwork is a FLAT
  // opaque tile: the mark is distinguished from the plate by luminance, not by
  // alpha, so it cannot be isolated with a composite op on the main canvas.
  function scratchFor(size) {
    var ctx = scratches[size];
    if (!ctx) {
      ctx = new OffscreenCanvas(size, size).getContext('2d', { willReadFrequently: true });
      scratches[size] = ctx;
    }
    return ctx;
  }

  // An orange halo around the MARK, not around the tile.
  //
  // 'multiply' on the scratch turns the white mark orange and leaves the black
  // plate black (x * 0 = 0). Compositing that back with 'lighter' then adds only
  // where the scratch is non-black, so the halo hugs the lettering and the plate
  // contributes nothing. A filter on the tile itself would halo the SQUARE.
  function drawMarkGlow(ctx, size, bitmap, spec, offset, drawn) {
    var scratch = scratchFor(size);
    scratch.globalCompositeOperation = 'source-over';
    scratch.globalAlpha = 1;
    scratch.filter = 'none';
    scratch.clearRect(0, 0, size, size);
    scratch.drawImage(bitmap, offset, offset, drawn, drawn);
    scratch.globalCompositeOperation = 'multiply';
    scratch.fillStyle = alphaColor(GLOW_RGB, 1);
    scratch.fillRect(0, 0, size, size);
    scratch.globalCompositeOperation = 'source-over';

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = spec.glowAlpha;
    ctx.filter = 'blur(' + (spec.glowRatio * size).toFixed(2) + 'px)';
    ctx.drawImage(scratch.canvas, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // The design's breathe animates the LOCKUP inside a static black plate -- the
  // plate itself never moves. Fading the artwork instead fades the whole icon,
  // because the artwork IS the plate. So the plate is painted solid first and the
  // mark composited over it: black-on-black is a no-op, so only the lettering
  // varies. Dim is deliberately different -- a dropped relay recedes the whole
  // icon, and it outranks the glow because grayscale would fight an orange halo.
  function drawGlyph(ctx, size, bitmap, spec) {
    var drawn = size * GLYPH_SCALE;
    var offset = (size - drawn) / 2;

    if (spec.dimmed === true) {
      ctx.globalAlpha = DIM_ALPHA;
      ctx.filter = DIM_FILTER;
      ctx.drawImage(bitmap, offset, offset, drawn, drawn);
      ctx.globalAlpha = 1;
      ctx.filter = 'none';
      return;
    }

    var markAlpha = typeof spec.glyphAlpha === 'number' ? spec.glyphAlpha : 1;
    var wantsGlow = typeof spec.glowRatio === 'number' && spec.glowRatio > 0
      && spec.glowAlpha > 0 && supportsDropShadow(ctx);
    if (markAlpha >= 1 && !wantsGlow) {
      ctx.drawImage(bitmap, offset, offset, drawn, drawn);
      return;
    }

    ctx.fillStyle = PLATE_COLOR;
    ctx.fillRect(0, 0, size, size);
    if (wantsGlow) drawMarkGlow(ctx, size, bitmap, spec, offset, drawn);
    ctx.globalAlpha = markAlpha;
    ctx.drawImage(bitmap, offset, offset, drawn, drawn);
    ctx.globalAlpha = 1;
  }

  function squareOrbitGeometry(size) {
    var width = ORBIT_WIDTH_RATIO * size;
    var half = width / 2;
    var side = size - width;
    return {
      width: width,
      half: half,
      left: half,
      top: half,
      right: size - half,
      bottom: size - half,
      side: side,
      perimeter: side * 4
    };
  }

  // Distance zero is the top-left corner. Increasing distance walks clockwise:
  // top -> right -> bottom -> left. Callers use side / 2 as their phase offset,
  // preserving Orbit's old 12-o'clock (top-centre) starting position.
  function squareOrbitPointAt(geometry, distance) {
    var perimeter = geometry.perimeter;
    var d = distance % perimeter;
    if (d < 0) d += perimeter;
    if (d < geometry.side) {
      return { x: geometry.left + d, y: geometry.top };
    }
    d -= geometry.side;
    if (d < geometry.side) {
      return { x: geometry.right, y: geometry.top + d };
    }
    d -= geometry.side;
    if (d < geometry.side) {
      return { x: geometry.right - d, y: geometry.bottom };
    }
    d -= geometry.side;
    return { x: geometry.left, y: geometry.bottom - d };
  }

  // Append one unwrapped distance interval. Corner distances are inserted as
  // explicit vertices, so a segment that turns a corner follows the square and
  // never shortcuts diagonally across the artwork.
  function appendSquareOrbitInterval(ctx, geometry, start, end) {
    var point = squareOrbitPointAt(geometry, start);
    ctx.moveTo(point.x, point.y);
    var corner = (Math.floor(start / geometry.side) + 1) * geometry.side;
    while (corner < end) {
      point = squareOrbitPointAt(geometry, corner);
      ctx.lineTo(point.x, point.y);
      corner += geometry.side;
    }
    point = squareOrbitPointAt(geometry, end);
    ctx.lineTo(point.x, point.y);
  }

  // Canvas has no gradient primitive that follows an arbitrary path. The bead
  // is therefore a short sequence of colour/alpha segments, pre-rendered with
  // the rest of the animation. Each segment carries a mitered polyline when it
  // crosses a corner, keeping the outside edge sharp and fully inside the tile.
  function strokeSquareOrbit(ctx, size, palette, progress) {
    var geometry = squareOrbitGeometry(size);
    var head = parseHex(palette.from);
    var tail = parseHex(palette.to);
    var start = progress * geometry.perimeter + geometry.side / 2;
    ctx.lineWidth = geometry.width;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 2;
    for (var i = 0; i < BEAD_SEGMENTS; i++) {
      var t0 = i / BEAD_SEGMENTS;
      var t1 = (i + 1) / BEAD_SEGMENTS;
      var mid = (t0 + t1) / 2;
      var alpha = beadAlpha(mid);
      if (alpha <= 0) continue;
      // Butt caps meet exactly, which can leave an antialiasing hairline.
      // Everything but the last segment runs slightly long to cover it; the last
      // one still ends at exactly BEAD_FRACTION.
      var tEnd = i === BEAD_SEGMENTS - 1 ? t1 : t1 + SEAM_OVERLAP / BEAD_SEGMENTS;
      ctx.strokeStyle = mixColor(head, tail, mid, alpha);
      var d0 = start + t0 * BEAD_FRACTION * geometry.perimeter;
      var d1 = start + tEnd * BEAD_FRACTION * geometry.perimeter;
      ctx.beginPath();
      appendSquareOrbitInterval(ctx, geometry, d0, d1);
      ctx.stroke();
    }
  }

  // ---- Sweep --------------------------------------------------------------

  // arcTo rather than the native roundRect, matching the shape already used at
  // extension/lib/visualization/knowledge-graph.js.
  function roundRectPath(ctx, x, y, w, h, r) {
    if (r > h / 2) r = h / 2;
    if (r > w / 2) r = w / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function barPath(ctx, x, y, w, h, r) {
    if (r > 0) { roundRectPath(ctx, x, y, w, h, r); return; }
    // A 1px track has no room for a radius, and arcTo with r=0 is just a rect.
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }

  function drawSweep(ctx, size, palette, progress) {
    var trackW = SWEEP_TRACK_W_RATIO * size;
    var trackH = Math.max(SWEEP_TRACK_H_MIN, Math.round(SWEEP_TRACK_H_RATIO * size));
    var x = (size - trackW) / 2;
    var y = Math.round(SWEEP_CENTER_Y_RATIO * size - trackH / 2);
    var radius = trackH <= 2 ? 0 : trackH / 2;

    ctx.fillStyle = SWEEP_TRACK_COLOR;
    barPath(ctx, x, y, trackW, trackH, radius);
    ctx.fill();

    // The fill is translated by a multiple of its OWN width, exactly as the
    // canonical translateX percentages do, and the track clips it the way
    // .fsb-progress-bar's overflow:hidden does.
    var fillW = SWEEP_FILL_FRACTION * trackW;
    var fillX = x + lerp(SWEEP_FROM_PCT, SWEEP_TO_PCT, easeInOut(progress)) * fillW;
    ctx.save();
    barPath(ctx, x, y, trackW, trackH, radius);
    ctx.clip();
    var grad = ctx.createLinearGradient(fillX, y, fillX + fillW, y);
    grad.addColorStop(0, palette.from);
    grad.addColorStop(1, palette.to);
    ctx.fillStyle = grad;
    barPath(ctx, fillX, y, fillW, trackH, radius);
    ctx.fill();
    ctx.restore();
  }

  // ---- Capability ring ----------------------------------------------------

  // Two strokes: the inset border, whose alpha dips and recovers, and a ping.
  // The design's ping spreads outward, which an icon cannot do -- there is no
  // canvas outside the tile -- so it travels inward from the border instead.
  function drawCapabilityRing(ctx, size, progress) {
    var rgb = parseHex(CAP_COLOR);
    var width = Math.max(CAP_RING_W_MIN, Math.round(CAP_RING_W_RATIO * size));
    var half = width / 2;
    var ringAlpha;
    var pingAlpha = 0;
    var pingTravel = 0;
    if (progress < CAP_PING_STOP) {
      var out = easeOut(progress / CAP_PING_STOP);
      ringAlpha = lerp(CAP_ALPHA_HIGH, CAP_ALPHA_LOW, out);
      pingAlpha = lerp(CAP_PING_ALPHA, 0, out);
      pingTravel = out;
    } else {
      ringAlpha = lerp(CAP_ALPHA_LOW, CAP_ALPHA_HIGH,
        easeOut((progress - CAP_PING_STOP) / (1 - CAP_PING_STOP)));
    }

    ctx.lineWidth = width;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = mixColor(rgb, rgb, 0, ringAlpha);
    ctx.beginPath();
    ctx.rect(half, half, size - width, size - width);
    ctx.stroke();

    if (pingAlpha <= 0) return;
    var inset = half + CAP_PING_INSET_RATIO * size * pingTravel;
    var span = size - inset * 2;
    if (span <= 0) return;
    ctx.strokeStyle = mixColor(rgb, rgb, 0, pingAlpha);
    ctx.beginPath();
    ctx.rect(inset, inset, span, span);
    ctx.stroke();
  }

  // Renders one frame at every shipped size, each from its own source bitmap.
  // Nothing paints a background of its own -- the artwork already carries an
  // opaque tile, and a service worker cannot read the toolbar theme to pick one.
  //
  // Exactly one clearRect and one drawImage per frame, glyph first: the test
  // harness splits its recorded op log on clearRect to reconstruct frames.
  function renderFrame(bitmaps, spec) {
    var frame = {};
    for (var i = 0; i < SIZES.length; i++) {
      var size = SIZES[i];
      var ctx = contextFor(size);
      var progress = spec.progress || 0;
      ctx.clearRect(0, 0, size, size);
      drawGlyph(ctx, size, bitmaps[size], spec);
      if (spec.form === 'orbit') strokeSquareOrbit(ctx, size, spec.palette, progress);
      else if (spec.form === 'sweep') drawSweep(ctx, size, spec.palette, progress);
      else if (spec.form === 'ring') drawCapabilityRing(ctx, size, progress);
      frame[size] = ctx.getImageData(0, 0, size, size);
    }
    // Reuse this exact request object for every cycle. Rebuilding the two nested
    // dictionaries at 15fps creates avoidable garbage even though the ImageData
    // records themselves are cached.
    frame.request = { imageData: { 16: frame[16], 32: frame[32] } };
    return internFrame(frame);
  }

  function imageDataEqual(a, b) {
    if (a === b) return true;
    var left = a && a.data;
    var right = b && b.data;
    if (!left || !right || left.length !== right.length) return false;
    for (var i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }

  function framePixelsEqual(a, b) {
    return !!a && !!b
      && imageDataEqual(a[16], b[16])
      && imageDataEqual(a[32], b[32]);
  }

  function framePixelHash(frame) {
    var hash = 2166136261;
    for (var s = 0; s < SIZES.length; s++) {
      var pixels = frame && frame[SIZES[s]] && frame[SIZES[s]].data;
      if (!pixels) return null;
      hash ^= pixels.length;
      hash = Math.imul(hash, 16777619);
      for (var i = 0; i < pixels.length; i++) {
        hash ^= pixels[i];
        hash = Math.imul(hash, 16777619);
      }
    }
    return String(hash >>> 0);
  }

  // Intern across static frames and every animation cycle. Hashing narrows the
  // search; the full byte comparison at both sizes is authoritative, so a hash
  // collision can never suppress a visible frame.
  function internFrame(frame) {
    var hash = framePixelHash(frame);
    if (hash === null) return frame;
    var bucket = canonicalFrameBuckets[hash];
    if (!bucket) {
      canonicalFrameBuckets[hash] = [frame];
      return frame;
    }
    for (var i = 0; i < bucket.length; i++) {
      if (framePixelsEqual(bucket[i], frame)) return bucket[i];
    }
    bucket.push(frame);
    return frame;
  }

  // Per-frame parameters for one state at one point in its cycle. CSS applies a
  // timing function BETWEEN adjacent keyframes, so a form with an intermediate
  // stop eases each segment separately rather than easing the whole cycle once.
  function frameSpec(state, progress) {
    var def = STATES[state];
    var spec = { form: def.form, palette: def, progress: progress, dimmed: false };
    if (def.form === 'breathe') {
      // 0%,100% -> min, 50% -> peak.
      var toPeak = progress < 0.5
        ? easeInOut(progress / 0.5)
        : 1 - easeInOut((progress - 0.5) / 0.5);
      spec.glyphAlpha = lerp(BREATHE_MIN_ALPHA, 1, toPeak);
      // Blur AND alpha both ramp, per drop-shadow(0 0 0 ..0) -> (0 0 10px ..85).
      // Animating only the alpha would fade a fixed-size halo in and out; the
      // design blooms the halo outward from nothing.
      spec.glowRatio = lerp(0, BREATHE_GLOW_RATIO, toPeak);
      spec.glowAlpha = lerp(0, BREATHE_GLOW_ALPHA, toPeak);
    }
    return spec;
  }

  // What an armed watch shows before its frames exist -- during init, and on the
  // repair path after a worker restart. The breathe itself no longer settles.
  function settledSpec(dimmed) {
    return {
      form: 'breathe',
      palette: STATES.breathe,
      progress: 0,
      dimmed: dimmed,
      glyphAlpha: SETTLE_ALPHA,
      glowRatio: SETTLE_GLOW_RATIO,
      glowAlpha: SETTLE_GLOW_ALPHA
    };
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

  // Decoded once per worker and kept. Every state's build used to re-fetch and
  // re-decode both PNGs, so a session that touched all four states paid the I/O
  // and the decode four times over. The bitmaps are small; the decode is not.
  function ensureGlyphs() {
    if (glyphCache) return Promise.resolve(glyphCache);
    if (glyphBuild) return glyphBuild;
    glyphBuild = loadGlyphs().then(function (bitmaps) {
      glyphCache = bitmaps;
      glyphBuild = null;
      return bitmaps;
    }, function (e) {
      glyphBuild = null;
      throw e;
    });
    return glyphBuild;
  }

  // Only the four resting frames and one Ring kickoff are rendered up front. A
  // worker wake that never animates should not pay for full animation cycles.
  async function buildStaticCache() {
    var bitmaps = await ensureGlyphs();
    staticFrames['idle:on'] = renderFrame(bitmaps, { dimmed: false });
    staticFrames['idle:off'] = renderFrame(bitmaps, { dimmed: true });
    // Keep the reduced-motion watching frames cached alongside idle so a cold
    // restore can render watch state without rebuilding the glyphs.
    staticFrames['watching:on'] = renderFrame(bitmaps, settledSpec(false));
    staticFrames['watching:off'] = renderFrame(bitmaps, settledSpec(true));
    // Keep one Ring frame ready so a short capability invoke can paint
    // immediately without delaying business logic for the full frame build.
    staticFrames['ring:kickoff'] = renderFrame(bitmaps, frameSpec('ring', 0));
  }

  // One state's worth of frames, rendered on first use and kept for the life of
  // the worker. Concurrent callers share the in-flight build; a failed build is
  // dropped so a later transition can retry it.
  function ensureAnimatedFrames(state) {
    if (animatedFrames[state]) return Promise.resolve(animatedFrames[state]);
    if (animatedBuilds[state]) return animatedBuilds[state];
    var build = (async function () {
      var bitmaps = await ensureGlyphs();
      var count = Math.round(STATES[state].duration / FRAME_INTERVAL_MS);
      var frames = new Array(count);
      for (var f = 0; f < count; f++) {
        frames[f] = renderFrame(bitmaps, frameSpec(state, f / count));
      }
      animatedFrames[state] = frames;
      return frames;
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
    console.error('[FSB] action icon: setIcon failed; updates paused and will retry with backoff:', err && err.message);
  }

  function clearEmitRetry() {
    if (emitRetryTimerId === null) return;
    clearTimeout(emitRetryTimerId);
    emitRetryTimerId = null;
  }

  function emitRetryDelay() {
    var exponent = Math.max(0, Math.min(emitFailureCount - 1, 10));
    return Math.min(EMIT_RETRY_MAX_MS, EMIT_RETRY_BASE_MS * Math.pow(2, exponent));
  }

  function scheduleEmitRetry() {
    clearEmitRetry();
    emitRetryTimerId = setTimeout(function () {
      emitRetryTimerId = null;
      emitBlocked = false;
      // A failed frame is stale by definition after a backoff. Re-derive from
      // wall clock so recovery resumes at the same phase the old loop intended.
      pendingEmitFrame = null;
      var desired = animating && resolved ? frameAt(Date.now()) : staticFrame();
      emit(desired);
      if (animating && resolved && !emitBlocked) startLoop();
    }, emitRetryDelay());
  }

  function finishEmit(frame) {
    emitInFlight = false;
    activeEmitFrame = null;
    lastEmitted = frame;
    emitBlocked = false;
    emitFailureCount = 0;
    clearEmitRetry();
    drainEmit();
  }

  function failEmit(frame, err) {
    emitInFlight = false;
    activeEmitFrame = null;
    emitBlocked = true;
    emitFailureCount++;
    // Preserve only the latest desired frame; the retry recomputes its phase.
    if (!pendingEmitFrame) pendingEmitFrame = frame;
    stopLoop();
    noteEmitFailure(err);
    scheduleEmitRetry();
  }

  function drainEmit() {
    if (emitInFlight || emitBlocked || !pendingEmitFrame) return;
    var frame = pendingEmitFrame;
    pendingEmitFrame = null;
    if (frame === lastEmitted) {
      drainEmit();
      return;
    }
    emitInFlight = true;
    activeEmitFrame = frame;
    try {
      var result = chrome.action.setIcon(frame.request || {
        imageData: { 16: frame[16], 32: frame[32] }
      });
      if (result && typeof result.then === 'function') {
        result.then(function () { finishEmit(frame); }, function (err) { failEmit(frame, err); });
      } else {
        finishEmit(frame);
      }
    } catch (e) {
      failEmit(frame, e);
    }
  }

  // Always global. A per-surface icon permanently shadows the global one, which
  // would silently strand the loop for that surface.
  function emit(frame) {
    if (!frame) return;
    if (!emitInFlight && !emitBlocked && frame === lastEmitted) return;
    if (frame === activeEmitFrame) {
      // The in-flight frame became current again before it committed. Any queued
      // frame is now stale, so discard it rather than displaying it out of phase.
      pendingEmitFrame = null;
      return;
    }
    if (frame === pendingEmitFrame) return;
    pendingEmitFrame = frame;
    drainEmit();
  }

  // Dim is a "your relay dropped" signal, so it needs a relay to have been there
  // in the first place. Until one has connected once, every resting frame is
  // full strength -- that is the only appearance the design has.
  function staticFrame() {
    var dim = relaySeen && !connected;
    // A settled breathe keeps its claim, so the resting frame it lands on is the
    // watching one; only an empty claim set falls back to idle.
    var base = resolved === 'breathe' ? 'watching' : 'idle';
    return staticFrames[base + (dim ? ':off' : ':on')];
  }

  function frameAt(now) {
    var frames = animatedFrames[resolved];
    if (!frames || !frames.length) return null;
    var duration = STATES[resolved].duration;
    var elapsed = (now - startTime) % duration;
    var progress = elapsed / duration;
    var index = Math.min(frames.length - 1, Math.floor(progress * frames.length));
    return frames[index];
  }

  // ---- Loop ---------------------------------------------------------------

  // Find the next point on the ORIGINAL 66ms poll grid whose canonical frame is
  // different. Skipped poll points would have reached emit() and returned on the
  // same object, so omitting their timer wake cannot alter a displayed pixel or
  // the time at which a distinct frame is requested.
  function nextVisibleTickDelay(now, currentFrame) {
    var frames = animatedFrames[resolved];
    if (!frames || !frames.length) return null;
    var elapsed = Math.max(0, now - startTime);
    var ordinal = Math.floor(elapsed / FRAME_INTERVAL_MS) + 1;
    var checks = frames.length * 3 + 3;
    var hold = STATES[resolved].bounded;
    for (var i = 0; i < checks; i++, ordinal++) {
      var candidateTime = startTime + ordinal * FRAME_INTERVAL_MS;
      if (typeof hold === 'number' && candidateTime - startTime >= hold) {
        return Math.max(0, candidateTime - now);
      }
      if (frameAt(candidateTime) !== currentFrame) {
        return Math.max(0, candidateTime - now);
      }
    }
    // An entire cycle (with ample rounding headroom) is byte-identical. There is
    // no visible transition to schedule; state and watchdog intent remain intact.
    return null;
  }

  function scheduleNextTick(now, currentFrame) {
    if (!animating || !resolved || emitBlocked) return;
    var delay = nextVisibleTickDelay(now, currentFrame);
    if (delay === null) return;
    timerId = setTimeout(tick, delay);
  }

  function tick() {
    timerId = null;
    if (!animating || !resolved) {
      stopLoop();
      return;
    }
    var now = Date.now();
    // A bounded form says its piece and stops. Holding the loop open for an
    // always-armed state is exactly the keepalive shape being avoided.
    var hold = STATES[resolved].bounded;
    if (typeof hold === 'number' && now - startTime >= hold) {
      settleAnimation();
      return;
    }
    var frame = frameAt(now);
    emit(frame);
    scheduleNextTick(now, frame);
  }

  function stopLoop() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function startLoop() {
    stopLoop();
    if (emitBlocked) return;
    tick();
  }

  // ---- Watchdog -----------------------------------------------------------

  // Guarded on watchdogArmed because create() on an existing name RESTARTS the
  // period. A session that changes phase every few seconds would otherwise push
  // the fire time out on every transition and the watchdog would never run.
  function armWatchdog() {
    if (watchdogArmed) return;
    try {
      var alarms = chrome.alarms;
      if (!alarms || typeof alarms.create !== 'function') return;
      alarms.create(WATCHDOG_ALARM, { periodInMinutes: WATCHDOG_PERIOD_MINUTES });
      watchdogArmed = true;
    } catch (_e) { /* the watchdog is best-effort */ }
  }

  // Unconditional, unlike arm: module state is gone after an eviction, so this
  // is also what clears an alarm a previous worker generation left behind.
  function disarmWatchdog() {
    watchdogArmed = false;
    try {
      var alarms = chrome.alarms;
      if (!alarms || typeof alarms.clear !== 'function') return;
      var result = alarms.clear(WATCHDOG_ALARM);
      if (result && typeof result.catch === 'function') result.catch(function () {});
    } catch (_e) { /* the watchdog is best-effort */ }
  }

  // ---- Persistence --------------------------------------------------------

  function persistIntent() {
    try {
      var area = chrome.storage && chrome.storage.session;
      if (!area || typeof area.set !== 'function') return;
      // Only watch claims persist. Activity timers and in-flight capability
      // promises do not survive worker eviction, so restoring either would leave
      // a claim that nothing can finish or expire.
      var claimCopy = {};
      var claimKeys = Object.keys(claims);
      for (var c = 0; c < claimKeys.length; c++) {
        if (claimKeys[c].indexOf('watch:') !== 0) continue;
        claimCopy[claimKeys[c]] = claims[claimKeys[c]];
      }
      var record = {};
      record[INTENT_KEY] = {
        animating: animating,
        claims: claimCopy,
        resolved: resolved,
        connected: connected,
        updatedAt: Date.now()
      };
      var result = area.set(record);
      if (result && typeof result.catch === 'function') result.catch(function () {});
    } catch (_e) { /* persistence is best-effort */ }
  }

  function persistRelaySeen() {
    try {
      var area = chrome.storage && chrome.storage.local;
      if (!area || typeof area.set !== 'function') return;
      var record = {};
      record[RELAY_SEEN_KEY] = true;
      var result = area.set(record);
      if (result && typeof result.catch === 'function') result.catch(function () {});
    } catch (_e) { /* persistence is best-effort */ }
  }

  async function readRelaySeen() {
    try {
      var area = chrome.storage && chrome.storage.local;
      if (!area || typeof area.get !== 'function') return false;
      var stored = await area.get(RELAY_SEEN_KEY);
      return !!(stored && stored[RELAY_SEEN_KEY] === true);
    } catch (_e) {
      return false;
    }
  }

  async function readAnimationsEnabled() {
    try {
      var area = chrome.storage && chrome.storage.local;
      if (!area || typeof area.get !== 'function') return true;
      var stored = await area.get(ANIMATIONS_KEY);
      return !(stored && stored[ANIMATIONS_KEY] === false);
    } catch (_e) {
      return true;
    }
  }

  function armPreferenceListener() {
    if (preferenceListenerArmed) return;
    try {
      var changed = chrome.storage && chrome.storage.onChanged;
      if (!changed || typeof changed.addListener !== 'function') return;
      changed.addListener(function (changes, area) {
        if (area !== 'local' || !changes || !changes[ANIMATIONS_KEY]) return;
        setAnimationsEnabled(changes[ANIMATIONS_KEY].newValue !== false);
      });
      preferenceListenerArmed = true;
    } catch (_e) { /* preference synchronization is best-effort */ }
  }

  // Tab ids are stable within a browser session, which is exactly the scope of
  // the session store the claims came from -- but a tab can close while the
  // worker is evicted, so its claim has to be swept on the way back up.
  async function pruneClosedTabClaims() {
    try {
      if (!chrome.tabs || typeof chrome.tabs.query !== 'function') return;
      var open = await chrome.tabs.query({});
      var alive = Object.create(null);
      for (var i = 0; i < open.length; i++) alive[String(open[i].id)] = true;
      var keys = Object.keys(claims);
      for (var j = 0; j < keys.length; j++) {
        var id = keys[j].slice(keys[j].indexOf(':') + 1);
        if (id !== 'global' && !alive[id]) {
          clearActivityTimer(keys[j]);
          delete capabilityCounts[keys[j]];
          delete claims[keys[j]];
        }
      }
    } catch (_e) { /* pruning is best-effort */ }
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

  // Every state owns a distinct visual form, so a transition is always a form
  // change and there is no visual position worth carrying across it -- each one
  // starts at frame 0.
  function startAnimation(next) {
    if (!animationsEnabled || !STATES[next] || !STATES[next].animated) return;
    resolved = next;
    animating = true;
    armWatchdog();
    persistIntent();
    if (next === 'ring' && !animatedFrames[next]) {
      emit(staticFrames['ring:kickoff']);
    }
    if (animatedFrames[next]) {
      // The clock starts WITH the loop, never before it. Setting it earlier let
      // the frame build eat into the cycle: the first showing of a state began
      // mid-animation, and a bounded hold was short by the build's duration.
      startTime = Date.now();
      startLoop();
      return;
    }
    ensureAnimatedFrames(next).then(function () {
      if (!animating || resolved !== next) return;
      startTime = Date.now();
      startLoop();
    }).catch(function () { /* reported by ensureAnimatedFrames */ });
  }

  // A bounded form has said its piece. The claim survives -- the icon simply
  // stops repainting and rests on the frame that claim settles to.
  function settleAnimation() {
    stopLoop();
    disarmWatchdog();
    animating = false;
    persistIntent();
    emit(staticFrame());
  }

  function stopAnimation() {
    var changed = animating || resolved !== null;
    stopLoop();
    disarmWatchdog();
    animating = false;
    resolved = null;
    if (changed) persistIntent();
    emit(staticFrame());
  }

  // ---- Claims -------------------------------------------------------------

  function tabKey(tabId) {
    return (tabId === undefined || tabId === null || !Number.isFinite(Number(tabId)))
      ? 'global'
      : String(Number(tabId));
  }

  function topClaim() {
    var best = null;
    var bestRank = 0;
    var keys = Object.keys(claims);
    for (var i = 0; i < keys.length; i++) {
      var rank = RANK[claims[keys[i]]] || 0;
      if (rank > bestRank) {
        bestRank = rank;
        best = claims[keys[i]];
      }
    }
    return best;
  }

  // Only a change in the WINNER repaints. Several tabs claiming the same state
  // resolve to one animation, so the per-trigger rearm loop cannot restart it.
  function applyResolved() {
    if (!animationsEnabled) return;
    var next = topClaim();
    if (next === resolved) return;
    if (next === null) stopAnimation();
    else startAnimation(next);
  }

  function setClaim(key, state) {
    var had = Object.prototype.hasOwnProperty.call(claims, key) ? claims[key] : null;
    var want = state || null;
    // A removal can be a no-op in memory while still overriding a persisted
    // claim that init() has not restored yet.
    if (!ready) preReadyClaimKeys[key] = true;
    if (had === want) return;
    if (want) claims[key] = want; else delete claims[key];
    if (!ready) return;
    persistIntent();
    if (animationsEnabled) applyResolved();
  }

  function setAnimationsEnabled(isEnabled) {
    var next = isEnabled !== false;
    if (animationsEnabled === next) return;
    animationsEnabled = next;
    if (!ready || unavailable) return;
    if (!animationsEnabled) {
      // Preserve claims so re-enabling immediately restores the correct winner,
      // but match the existing disabled-Autopilot appearance: static idle.
      stopAnimation();
      return;
    }
    applyResolved();
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
        disarmWatchdog();
        console.error('[FSB] action icon: canvas or chrome.action missing, staying on the manifest icon');
        return;
      }
      if (options && typeof options.hasLiveSession === 'function') {
        liveSessionProbe = options.hasLiveSession;
      }
      animationsEnabled = await readAnimationsEnabled();
      armPreferenceListener();
      try {
        await buildStaticCache();
      } catch (e) {
        unavailable = true;
        // repair() no-ops once unavailable, so a beat left armed by an earlier
        // generation would wake the worker forever with nothing to do.
        disarmWatchdog();
        console.error('[FSB] action icon: base frames failed to render, icon disabled:', e && e.message);
        return;
      }
      var intent = await readIntent();
      if (intent) {
        if (!connectedExplicit) connected = intent.connected === true;
        if (intent.claims && typeof intent.claims === 'object') {
          var storedKeys = Object.keys(intent.claims);
          for (var s = 0; s < storedKeys.length; s++) {
            var sk = storedKeys[s];
            // Capability claims never survive their owning promise or worker.
            // Ignore any stale record written by an older worker generation.
            if (sk.indexOf('capability:') === 0) continue;
            // A call that raced this init already holds the truth for its key.
            if (Object.prototype.hasOwnProperty.call(preReadyClaimKeys, sk)) continue;
            if (STATES[intent.claims[sk]]) claims[sk] = intent.claims[sk];
          }
        }
      }
      // OR, never assign: a setConnected(true) that raced this init already
      // learned the relay, and the stored write may not have landed yet.
      if (!relaySeen) relaySeen = await readRelaySeen();
      await pruneClosedTabClaims();
      var live = true;
      if (liveSessionProbe) {
        try { live = liveSessionProbe() === true; } catch (_e) { live = false; }
      }
      // A session claim cannot outlive the session that made it. Watch claims
      // can: the trigger runtime owns them and restores them independently.
      if (!live) {
        var liveKeys = Object.keys(claims);
        for (var l = 0; l < liveKeys.length; l++) {
          if (liveKeys[l].indexOf('session:') === 0) delete claims[liveKeys[l]];
        }
      }
      ready = true;
      preReadyClaimKeys = null;
      // Restart from frame 0 rather than resuming mid-cycle; this matches the
      // overlay being destroyed and recreated on a page reload.
      resolved = null;
      var initial = topClaim();
      if (initial && animationsEnabled) startAnimation(initial);
      else stopAnimation();
      persistIntent();
    })();
    return initPromise;
  }

  // Single drive point. Callers classify the tool with resolveIconActivity()
  // (extension/ai/tool-definitions.js) and report what kind of work is running.
  //
  // A tool call is instantaneous, so the claim DECAYS rather than being cleared
  // by anything: each call on a tab refreshes its own expiry. That is why the
  // icon no longer depends on visual-session lifecycle -- read-only tools never
  // open a session at all, and making them do so would put the on-page overlay
  // up on every read_page.
  function noteActivity(tabId, activity) {
    if (unavailable) return;
    // Ring is deliberately unavailable through generic activity reporting.
    // Only a balanced capability lifecycle may create a Ring claim.
    if (activity !== 'orbit' && activity !== 'sweep') return;
    var key = 'session:' + tabKey(tabId);
    clearActivityTimer(key);
    activityTimers[key] = setTimeout(function () {
      delete activityTimers[key];
      setClaim(key, null);
    }, ACTIVITY_TTL_MS);
    setClaim(key, activity);
  }

  function clearActivityTimer(key) {
    if (!activityTimers[key]) return;
    clearTimeout(activityTimers[key]);
    delete activityTimers[key];
  }

  // Capability invokes are durations, not activity pulses. Reference counts
  // balance overlapping invokes on one tab, while per-tab claims ensure one
  // completion cannot clear an invoke that is still running elsewhere.
  function beginCapability(tabId) {
    if (unavailable) return;
    var key = 'capability:' + tabKey(tabId);
    var count = capabilityCounts[key] || 0;
    capabilityCounts[key] = count + 1;
    if (count === 0) setClaim(key, 'ring');
  }

  function endCapability(tabId) {
    var key = 'capability:' + tabKey(tabId);
    var count = capabilityCounts[key] || 0;
    if (count <= 0) return;
    if (count > 1) {
      capabilityCounts[key] = count - 1;
      return;
    }
    delete capabilityCounts[key];
    if (unavailable) {
      delete claims[key];
      return;
    }
    setClaim(key, null);
  }

  // Keyed per tab, because the count that feeds this is per tab. A single global
  // flag turned "tab B stopped watching" into "nothing is watching" while tab A
  // still was, and each flip cost a full breathe.
  // A watch claim is a STATE, not an activity pulse, so it carries no expiry --
  // only disarming it or closing its tab takes it away.
  function setWatching(isWatching, tabId) {
    if (unavailable) return;
    setClaim('watch:' + tabKey(tabId), isWatching === true ? 'breathe' : null);
  }

  // A closed tab cannot still be acting, invoking a capability, or watching.
  function dropTab(tabId) {
    var suffix = ':' + tabKey(tabId);
    var keys = Object.keys(claims);
    var changed = false;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].length >= suffix.length
          && keys[i].slice(keys[i].length - suffix.length) === suffix) {
        clearActivityTimer(keys[i]);
        delete capabilityCounts[keys[i]];
        delete claims[keys[i]];
        changed = true;
      }
    }
    if (!changed || !ready || unavailable) return;
    persistIntent();
    applyResolved();
  }

  function setConnected(isConnected) {
    if (unavailable) return;
    var next = isConnected === true;
    connectedExplicit = true;
    // Recorded before the no-op bail so the very first connect still arms the
    // dim, even when it lands on an already-true value restored from intent.
    var learned = false;
    if (next && !relaySeen) {
      relaySeen = true;
      learned = true;
      persistRelaySeen();
    }
    if (connected === next && !learned) return;
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
      if (!animationsEnabled) {
        stopAnimation();
        return;
      }
      if (animating && resolved && STATES[resolved]) {
        var revived = resolved;
        if (animatedFrames[revived]) {
          startTime = Date.now();
          startLoop();
        } else {
          ensureAnimatedFrames(revived).then(function () {
            if (!animating || resolved !== revived) return;
            startTime = Date.now();
            startLoop();
          }).catch(function () { /* reported by ensureAnimatedFrames */ });
        }
      } else {
        // Nothing is owed, so the beat that woke us retires itself here. This is
        // also the self-heal for an alarm stranded by an earlier generation.
        stopLoop();
        disarmWatchdog();
        emit(staticFrame());
      }
    }).catch(function () { /* the icon is presentation-only */ });
  }

  globalThis.fsbActionIcon = Object.freeze({
    init: init,
    noteActivity: noteActivity,
    beginCapability: beginCapability,
    endCapability: endCapability,
    setWatching: setWatching,
    setAnimationsEnabled: setAnimationsEnabled,
    setConnected: setConnected,
    dropTab: dropTab,
    repair: repair
  });
})();
