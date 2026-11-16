(function () {
  'use strict';

  /* Depth engine for a wizard. Every step is a plane on the z axis. The step in focus rests at
     distance 0; later steps wait behind it (the next one faint and out of focus), earlier ones have
     flown past the camera.

     Moving between steps is a flight, and the flight is the point. The camera dives through the
     thing you chose: the vanishing point moves to that card or button, the plane peels away around
     it one element after another, the chosen element is the last to pass, and the next step grows
     out of the same spot. Going back runs the same flight in reverse. Switching between the two
     setup tracks is a sidestep instead: Agent lives to the left, in-browser to the right, the way
     the two cards sit on the path step. Swipes, the arrow keys and the step rail fly the camera
     too, but only as far as the wizard allows: a step that still needs an answer gives a little
     and springs back. The mouse wheel does not move between steps. It only writes inline styles on nodes onboarding.js rendered;
     onboarding.js never writes the style attribute of a node it has already rendered. */
  function obDepth(root, comp) {
    var doc = root.ownerDocument, win = doc.defaultView || window;
    var stage = root.querySelector('[data-depth-stage]');
    if (!stage) return null;
    var cueEl = root.querySelector('.ob3-cue'), bloomEl = root.querySelector('.ob3-bloom');
    var reduce = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var P = 1200, BASE = reduce ? 0.3 : 0.12;
    // Every step's content rests at 95% of its fitted size, so the room reads a little further away.
    var ZOOM = 0.95;
    var T_FWD = 594, T_BACK = 522, T_SIDE = 623, SPREAD = 188;
    var layers = {}, order = [];
    Array.prototype.forEach.call(stage.querySelectorAll('.ob3-layer'), function (el) {
      var id = el.getAttribute('data-step');
      layers[id] = { id: id, el: el, tgt: null, off: 2, lat: 0, s: 1, on: null, door: null };
      order.push(id);
    });
    var items = [], parents = [], geo = [], W = 0, H = 0;
    var g = 0, gDir = 0, running = false, raf = 0, lastT = 0, alive = true, cueLast = -1;
    var gesturing = false, touch = null;
    var vp = { x: 0, y: 0, tx: 0, ty: 0 }, flight = null, press = null;

    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function easeInOut(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
    function easeOut(u) { return 1 - Math.pow(1 - u, 3); }
    function goal(L) { return L.tgt === null ? L.off : L.tgt - g; }
    function current() { for (var i = 0; i < order.length; i++) if (layers[order[i]].tgt === 0) return layers[order[i]]; return null; }
    function itemOf(el) { for (var i = 0; i < items.length; i++) if (items[i].el.contains(el)) return items[i]; return null; }
    function splitList(s) { var out = [], depth = 0, cur = ''; for (var i = 0; i < s.length; i++) { var c = s[i]; if (c === '(') depth++; if (c === ')') depth--; if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += c; } if (cur.trim()) out.push(cur.trim()); return out; }

    // keep an element's own hover transitions, drop the ones that would smear the depth motion
    function strip(el) {
      var st = el.style;
      st.transitionProperty = ''; st.transitionDuration = ''; st.transitionTimingFunction = ''; st.transitionDelay = '';
      var cs = win.getComputedStyle(el);
      var props = splitList(cs.transitionProperty), durs = splitList(cs.transitionDuration), fns = splitList(cs.transitionTimingFunction), dels = splitList(cs.transitionDelay);
      var P2 = [], D2 = [], F2 = [], L2 = [];
      props.forEach(function (pr, j) {
        var list = pr === 'all' ? ['color', 'background-color', 'border-color', 'box-shadow', 'transform'] : [pr];
        list.forEach(function (x) {
          if (x === 'opacity' || x === 'filter' || x === 'translate' || x === 'visibility' || x === 'none') return;
          P2.push(x); D2.push(durs[j % durs.length] || '0s'); F2.push(fns[j % fns.length] || 'ease'); L2.push(dels[j % dels.length] || '0s');
        });
        // a choice comes toward you (scale): that settles slower and springier than a hover
        if (pr === 'all') { P2.push('scale'); D2.push('0.6s'); F2.push('cubic-bezier(0.16, 1, 0.3, 1)'); L2.push('0s'); }
      });
      st.transitionProperty = P2.length ? P2.join(', ') : 'none';
      if (P2.length) { st.transitionDuration = D2.join(', '); st.transitionTimingFunction = F2.join(', '); st.transitionDelay = L2.join(', '); }
    }

    // a render can add or replace travelling elements (the summary on the last plane): find them again
    function collect() {
      items = items.filter(function (it) { return it.el.isConnected; });
      order.forEach(function (id) {
        var L = layers[id];
        Array.prototype.forEach.call(L.el.querySelectorAll('[data-di]'), function (el) {
          for (var j = 0; j < items.length; j++) if (items[j].el === el) return;
          items.push({ el: el, L: L, k: clamp(parseFloat(el.getAttribute('data-di')) || 0, 0, 1), p: goal(L), q: L.lat, last: '', fit: !!el.closest('.ob3-fit'), tw: null, door: false });
        });
      });
      var next = [];
      items.forEach(function (it) { strip(it.el); it.last = ''; if (next.indexOf(it.el.parentElement) < 0) next.push(it.el.parentElement); });
      parents.forEach(function (par) { if (next.indexOf(par) < 0) { par.style.perspective = ''; par.style.perspectiveOrigin = ''; } });
      parents = next;
    }

    function layout() {
      if (!alive) return;
      H = stage.clientHeight; W = stage.clientWidth;
      order.forEach(function (id) {
        var L = layers[id], fit = L.el.firstElementChild, s = 1;
        if (fit) {
          var cs = win.getComputedStyle(L.el), h = fit.offsetHeight;
          var avail = L.el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 24;
          s = (h > 0 ? Math.min(1, avail / h) : 1) * ZOOM;
        }
        var tf = s < 0.999 ? 'scale(' + s.toFixed(4) + ')' : '';
        if (fit && fit.style.transform !== tf) fit.style.transform = tf;
        L.s = s;
      });
      var sr = stage.getBoundingClientRect();
      geo = parents.map(function (par) {
        var le = par.closest('.ob3-layer'), L = le ? layers[le.getAttribute('data-step')] : null, s = (L && par.closest('.ob3-fit') && L.s) || 1;
        var r = par.getBoundingClientRect();
        par.style.perspective = (P / s).toFixed(1) + 'px';
        return { el: par, x: r.left - sr.left, y: r.top - sr.top, s: s, last: '' };
      });
      origins();
      items.forEach(function (it) { it.last = ''; apply(it); });
    }

    // every plane shares one vanishing point; it sits at the centre of the room, or on the thing being flown through
    function origins() {
      var cx = W / 2 + vp.x, cy = H / 2 + vp.y;
      geo.forEach(function (q) {
        var v = ((cx - q.x) / q.s).toFixed(1) + 'px ' + ((cy - q.y) / q.s).toFixed(1) + 'px';
        if (v !== q.last) { q.last = v; q.el.style.perspectiveOrigin = v; }
      });
      if (bloomEl) { bloomEl.style.left = cx.toFixed(1) + 'px'; bloomEl.style.top = cy.toFixed(1) + 'px'; }
    }

    // how far along z an element at distance d sits (in the room's pixels)
    function zOf(it) {
      var d = it.p;
      if (reduce) return 0;
      if (d >= 0) return -d * 900;
      return it.door ? Math.min(-d * 1500, 1000) : Math.min(-d * 820, 760);
    }

    function apply(it) {
      var d = it.p, s = (it.fit && it.L.s) || 1, z = zOf(it), o = 1, b = 0, sat = 1;
      if (reduce) o = clamp(1 - Math.abs(d) * 1.6, 0, 1);
      else if (d >= 0) { o = d < 1 ? 1 - d * 0.91 : Math.max(0, 0.09 - (d - 1) * 0.18); b = Math.min(d * 12, 16); sat = 1 - Math.min(d, 1) * 0.7; }
      // the element being flown through comes right up to the camera and fills the view before it lets go
      else if (it.door) { o = clamp(1 - (-d - 0.25) / 0.5, 0, 1); b = Math.min(-d * 10, 8); }
      else { o = Math.max(0, 1 + d * 1.55); b = Math.min(-d * 14, 12); }
      // a sidestep: the plane slides off toward its own track, falling back and out of focus as it goes
      var q = it.q || 0, x = 0;
      if (q) {
        var aq = Math.abs(q);
        o *= clamp(1 - aq * 1.2, 0, 1);
        if (!reduce) { x = q * W * 0.5; z -= aq * 320; b = Math.max(b, Math.min(aq * 12, 12)); }
      }
      var rest = Math.abs(d) < 0.0005 && Math.abs(q) < 0.0005;
      var key = rest ? 'rest' : x.toFixed(1) + '|' + z.toFixed(1) + '|' + o.toFixed(3) + '|' + b.toFixed(2);
      if (key === it.last) return;
      it.last = key;
      var st = it.el.style;
      if (rest) { st.translate = ''; st.opacity = ''; st.filter = ''; st.visibility = ''; st.willChange = ''; return; }
      st.willChange = 'translate, opacity, filter';
      st.translate = x || z ? (x / s).toFixed(1) + 'px 0 ' + (z / s).toFixed(1) + 'px' : '';
      st.opacity = o.toFixed(3);
      st.filter = b > 0.05 ? 'blur(' + b.toFixed(2) + 'px)' + (sat < 0.99 ? ' saturate(' + sat.toFixed(2) + ')' : '') : '';
      st.visibility = o < 0.004 ? 'hidden' : '';
    }

    // paint order follows depth: planes that have flown past sit in front, planes still ahead sit behind
    function sync() {
      order.forEach(function (id) {
        var L = layers[id], on = L.tgt === 0, d = L.tgt === null ? L.off : L.tgt;
        L.el.style.zIndex = on ? '3' : d < 0 ? '4' : d < 1.5 ? '2' : '1';
        if (L.on === on) return;
        L.on = on;
        L.el.style.pointerEvents = on ? 'auto' : 'none';
        if (on) { L.el.removeAttribute('inert'); L.el.removeAttribute('aria-hidden'); }
        else { L.el.setAttribute('inert', ''); L.el.setAttribute('aria-hidden', 'true'); }
      });
    }

    // the cue lifts and warms, and light blooms at the vanishing point, while a plane is on its way in
    function cue() {
      var L = current(), lead = null, v = 0;
      if (L && !reduce) {
        items.forEach(function (it) { if (it.L === L && (!lead || it.k < lead.k)) lead = it; });
        if (lead) v = Math.sin(Math.PI * clamp(Math.max(Math.abs(lead.p), Math.abs(lead.q || 0)), 0, 1));
      }
      v = Math.round(v * 1000) / 1000;
      if (v === cueLast) return;
      cueLast = v;
      if (cueEl) cueEl.style.setProperty('--cue', String(v));
      if (bloomEl) { bloomEl.style.opacity = v.toFixed(3); bloomEl.style.transform = 'translate(-50%, -50%) scale(' + (0.3 + v * 0.9).toFixed(3) + ')'; }
    }

    // ---- the vanishing point ----
    // where an element rests on the plane, whatever stage of a flight it is in: undo the projection
    function centre(el) {
      var it = itemOf(el), r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      var x = r.left + r.width / 2 - sr.left - W / 2, y = r.top + r.height / 2 - sr.top - H / 2;
      var z = it ? zOf(it) : 0, f = (P - z) / P;
      return { x: vp.x + (x - vp.x) * f, y: vp.y + (y - vp.y) * f };
    }
    /* What a step is left through. A choice on the plane (the path card) always is the way out; a
       pick (the provider) is the way out when moving on; otherwise it is whatever was just pressed. */
    function doorEl(L, soft) {
      var a = L.el.querySelector('.sel[data-door="always"]');
      if (a) return a;
      var pr = !soft && press && win.performance.now() - press.t < 1600 && press.el.isConnected && L.el.contains(press.el) ? press.el : null;
      if (!pr || pr.getAttribute('data-door') === 'primary') { var b = L.el.querySelector('.sel[data-door="next"]'); if (b) return b; }
      return pr;
    }
    function aim(d) { vp.tx = d ? clamp(d.x, -W * 0.42, W * 0.42) : 0; vp.ty = d ? clamp(d.y, -H * 0.42, H * 0.42) : 0; }
    function leave(L, soft) {
      var el = doorEl(L, soft), c = el ? centre(el) : null;
      L.door = c ? { x: c.x, y: c.y, el: el } : null;
      return L.door;
    }
    function onPress(e) {
      var el = e.target && e.target.closest ? e.target.closest('button, a') : null;
      if (el && stage.contains(el)) press = { el: el, t: win.performance.now() };
    }

    function land() {
      if (flight && flight.door) { flight.door.door = false; flight.door.last = ''; apply(flight.door); }
      flight = null; aim(null);
    }

    function frame(t) {
      var dt = clamp(t - lastT, 0, 64) || 16.67; lastT = t;
      var moving = false;
      var dx = vp.tx - vp.x, dy = vp.ty - vp.y;
      if (dx || dy) {
        if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) { vp.x = vp.tx; vp.y = vp.ty; }
        else { var kv = 1 - Math.pow(1 - 0.265, dt / 16.67); vp.x += dx * kv; vp.y += dy * kv; moving = true; }
        origins();
      }
      items.forEach(function (it) {
        var tw = it.tw;
        if (tw) {
          var u = (t - tw.t0) / tw.dur;
          if (u >= 1) { it.p = tw.to; it.q = tw.qt; it.tw = null; }
          else { if (u > 0) { var e = tw.ease(u); it.p = tw.from + (tw.to - tw.from) * e; it.q = tw.qf + (tw.qt - tw.qf) * e; } moving = true; }
        } else {
          var to = goal(it.L), r = reduce ? BASE : BASE / (1 + it.k * 0.9);
          var f = 1 - Math.pow(1 - r, dt / 16.67);
          it.p += (to - it.p) * f; it.q += (it.L.lat - it.q) * f;
          if (Math.abs(to - it.p) < 0.0005) it.p = to; else moving = true;
          if (Math.abs(it.L.lat - it.q) < 0.0005) it.q = it.L.lat; else moving = true;
        }
        apply(it);
      });
      cue();
      if (!moving && flight) { land(); moving = vp.x !== vp.tx || vp.y !== vp.ty; }
      if (moving) raf = win.requestAnimationFrame(frame); else running = false;
    }
    function kick() { if (running || !alive) return; running = true; lastT = win.performance.now(); raf = win.requestAnimationFrame(frame); }

    /* A flight from one step to another. Each element follows the same curve, set off one after
       another in the order it sits on the plane (reversed on the way back): the plane being left
       peels away first, the way out goes last, and the plane arriving follows it through. A press
       starts from rest, so it eases in and out; a scroll or swipe is already moving, so it only
       eases out. */
    function fly(out, cur, dir, soft, side) {
      var now = win.performance.now();
      if (flight && flight.door) { flight.door.door = false; flight.door.last = ''; }
      var hops = out && out.tgt !== null ? Math.abs(out.tgt) : 1;
      var dur = side ? T_SIDE : soft ? 406 : (dir < 0 ? T_BACK : T_FWD) + clamp(hops - 1, 0, 3) * 109;
      var spread = soft ? 80 : SPREAD, ease = soft ? easeOut : easeInOut, door = null, doorIt = null;
      if (side) door = null;
      else if (dir > 0 && out) door = soft && out.door && gDir > 0 ? out.door : leave(out, soft);
      else if (dir < 0 && cur) door = cur.door && cur.door.el.isConnected ? cur.door : null;
      aim(door);
      doorIt = door ? itemOf(door.el) : null;
      if (doorIt) { doorIt.door = true; doorIt.last = ''; }
      items.forEach(function (it) {
        var to = goal(it.L), qt = it.L.lat;
        if (Math.abs(to - it.p) < 0.0005 && Math.abs(qt - it.q) < 0.0005) { it.p = to; it.q = qt; it.tw = null; return; }
        var k = dir < 0 ? 1 - it.k : it.k, going = dir < 0 ? it.p > -0.001 : it.p < 0.001;
        var delay = it === doorIt ? spread * (dir < 0 ? 0.4 : 0.55) : going ? k * spread * 0.55 : spread * 0.4 + k * spread * 0.8;
        it.tw = { from: it.p, to: to, qf: it.q, qt: qt, t0: now + delay, dur: dur, ease: ease };
      });
      flight = { door: doorIt };
    }

    /* targets: step id -> its distance from the step in focus (0 for that one), or null when the
       step is not on the route. dir says which way the wizard moved, for planes joining or leaving. */
    function set(targets, dir, instant, side) {
      var out = current(), soft = Math.abs(g) > 0.02;
      order.forEach(function (id) {
        var L = layers[id], nt = targets[id] == null ? null : targets[id], was = L.tgt;
        if (nt === null) {
          // leaving the route: the plane in focus flies past (or falls back when going back), others just fade
          if (was !== null) {
            // switching track: the plane in focus steps aside instead of flying past
            if (side && Math.abs(was) < 0.5) { L.off = 0; L.lat = -side; }
            else L.off = Math.abs(was) < 0.5 ? (dir >= 0 ? -1.3 : 2) : (was < 0 ? -1.3 : 2);
          }
        } else if (was === null && !instant) {
          // joining the route: arrive from the side the motion implies
          var from = nt === 0 ? (dir >= 0 ? 1 : -1) : (nt > 0 ? Math.max(2, nt) : Math.min(-1.3, nt)), fq = 0;
          if (side && nt === 0) { from = 0; fq = side; }
          L.lat = 0;
          items.forEach(function (it) { if (it.L === L) { it.p = from; it.q = fq; it.tw = null; it.last = ''; } });
        }
        L.tgt = nt;
      });
      g = 0; gesturing = false;
      if (instant) {
        items.forEach(function (it) { it.tw = null; it.door = false; it.p = goal(it.L); it.q = it.L.lat; it.last = ''; apply(it); });
        flight = null; vp.x = vp.tx = vp.y = vp.ty = 0; origins();
      } else if (reduce) items.forEach(function (it) { it.tw = null; });
      else fly(out, current(), dir, soft, side || 0);
      gDir = 0;
      sync();
      kick();
    }

    // ---- gestures: swipes and keys move the camera as far as the wizard allows ----
    function owns(e) { var t = e.target; return !!(t && t.closest && t.closest('[data-depth-own]')); }
    function bounds() { return [comp.canStep(-1) ? -1 : -0.15, comp.canStep(1) ? 1 : 0.15]; }
    // a gesture takes the camera by hand: drop any flight in progress and point at the way out
    function grab() {
      if (!gesturing) { items.forEach(function (it) { it.tw = null; }); gesturing = true; }
      var dir = g > 0.02 ? 1 : g < -0.02 ? -1 : 0;
      if (dir === gDir || reduce) return;
      gDir = dir;
      var L = current();
      if (!L || !dir) { aim(null); return; }
      if (dir > 0) aim(comp.canStep(1) ? leave(L, true) : null);
      else {
        var i = order.length, prev = null;
        while (i--) if (layers[order[i]].tgt === -1) prev = layers[order[i]];
        aim(prev && prev.door && prev.door.el.isConnected ? prev.door : null);
      }
    }
    function settle() {
      if (!gesturing) return;
      gesturing = false;
      var dir = g > 0.1 ? 1 : g < -0.1 ? -1 : 0;
      if (dir && comp.canStep(dir)) { comp.step(dir); return; }
      if (dir > 0) comp.nudge();
      g = 0; gDir = 0; aim(null); kick();
    }
    // The wheel does not move between steps. It is still held so the room never rubber-bands;
    // pinch-zoom and areas that scroll on their own keep it.
    function onWheel(e) {
      if (e.ctrlKey || owns(e)) return;
      e.preventDefault();
    }
    function onKey(e) {
      var tg = e.target, tag = tg && tg.tagName;
      if (e.defaultPrevented || !root.isConnected) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (tg && tg.isContentEditable) || e.altKey || e.ctrlKey || e.metaKey) return;
      var interactive = /^(BUTTON|A|SUMMARY)$/.test(tag), k = e.key;
      var down = k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !interactive && !e.shiftKey);
      var up = k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && !interactive && e.shiftKey);
      if (down) { press = null; if (comp.canStep(1)) comp.step(1); else comp.nudge(); }
      else if (up) { press = null; if (comp.canStep(-1)) comp.step(-1); }
      else return;
      e.preventDefault();
    }
    function onTouchStart(e) { if (e.touches.length !== 1 || owns(e)) { touch = null; return; } touch = { y: e.touches[0].clientY, on: false }; }
    function onTouchMove(e) {
      if (!touch) return;
      var dy = touch.y - e.touches[0].clientY;
      if (!touch.on) { if (Math.abs(dy) < 6) return; touch.on = true; touch.y = e.touches[0].clientY; dy = 0; }
      e.preventDefault();
      var b = bounds();
      g = clamp(dy / (stage.clientHeight * 0.5), b[0], b[1]);
      grab();
      kick();
    }
    function onTouchEnd() { if (!touch) return; var on = touch.on; touch = null; if (on) settle(); }

    root.addEventListener('click', onPress, true);
    root.addEventListener('wheel', onWheel, { passive: false });
    doc.addEventListener('keydown', onKey);
    stage.addEventListener('touchstart', onTouchStart, { passive: true });
    stage.addEventListener('touchmove', onTouchMove, { passive: false });
    stage.addEventListener('touchend', onTouchEnd);
    stage.addEventListener('touchcancel', onTouchEnd);

    // sizes change when stylesheets and fonts land, when the window resizes and when a render replaces nodes
    var relayT = 0;
    function relayout() { win.clearTimeout(relayT); relayT = win.setTimeout(function () { if (!alive) return; collect(); layout(); kick(); }, 50); }
    var ro = win.ResizeObserver ? new win.ResizeObserver(function () { layout(); }) : null;
    if (ro) { ro.observe(stage); order.forEach(function (id) { if (layers[id].el.firstElementChild) ro.observe(layers[id].el.firstElementChild); }); }
    else win.addEventListener('resize', layout);
    var mo = win.MutationObserver ? new win.MutationObserver(relayout) : null;
    if (mo) mo.observe(stage, { childList: true, subtree: true });
    var links = Array.prototype.slice.call(doc.querySelectorAll('link[rel~="stylesheet"]'));
    links.forEach(function (l) { if (!l.sheet) l.addEventListener('load', relayout); });
    if (doc.readyState !== 'complete') win.addEventListener('load', relayout);
    var t1 = win.setTimeout(relayout, 400), t2 = win.setTimeout(relayout, 1500), t3 = win.setTimeout(relayout, 4000);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(relayout);

    collect();
    layout();

    return {
      root: root,
      set: set,
      focus: function () { try { stage.focus({ preventScroll: true }); } catch (err) { /* focus is a convenience */ } },
      destroy: function () {
        alive = false;
        root.removeEventListener('click', onPress, true);
        root.removeEventListener('wheel', onWheel); doc.removeEventListener('keydown', onKey);
        stage.removeEventListener('touchstart', onTouchStart); stage.removeEventListener('touchmove', onTouchMove);
        stage.removeEventListener('touchend', onTouchEnd); stage.removeEventListener('touchcancel', onTouchEnd);
        if (ro) ro.disconnect(); else win.removeEventListener('resize', layout);
        if (mo) mo.disconnect();
        links.forEach(function (l) { l.removeEventListener('load', relayout); });
        win.removeEventListener('load', relayout);
        [t1, t2, t3, relayT].forEach(function (t) { win.clearTimeout(t); });
        win.cancelAnimationFrame(raf);
      }
    };
  }

  globalThis.FSBOnboardingDepth = { create: obDepth };
})();
