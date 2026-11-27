// ============================================================================
// VAULT PILL - on-page status for 1Password work driven over MCP, and the
// sheet for typing a login when 1Password has none for the site.
// ============================================================================
// The service worker sends { action: 'vaultPill', state } (messaging.js routes
// it here). States carry no secret values. While the pill asks, its body is an
// extension frame (ui/credential-sheet.html): the user types there, so the
// page never receives a keystroke, and the frame talks only to the worker.
// The pill lives in a closed shadow root in the top layer, and hides the
// progress card while it is up.
// Depends on: init.js (FSB namespace), ui-locale.js (fsbUiLocale, optional).

(function () {
  if (window.__FSB_SKIP_INIT__) return;
  const FSB = window.FSB;
  if (!FSB || FSB.vaultPill) return;

  function ov(key, english, subs) {
    var locale = globalThis.fsbUiLocale;
    if (locale && typeof locale.text === 'function') return locale.text(key, english, subs);
    if (!subs || typeof english !== 'string') return english;
    return english.replace(/\$([A-Za-z0-9_]+)\$/g, function (all, name) {
      var value = subs[name] != null ? subs[name] : subs[name.toLowerCase()];
      return value == null ? all : String(value);
    });
  }

  var WIDTH = { seed: 56, head: 176, text: 248, vault: 272, wide: 304, ask: 300 };
  var EXIT_AFTER = { done: 3000, cancelled: 2600, guard: 4000 };
  var FRAME_MIN = 80;
  var FRAME_MAX = 640;
  // The platform monospace stack (design-system/decisions/0012). A shadow root
  // ignores font-face rules, so the pill uses fonts the system already has.
  var MONO = "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace";

  var CSS = [
    ':host { all: initial; }',
    '.dim { position: fixed; inset: 0; background: rgba(20, 18, 14, 0.18); opacity: 0; transition: opacity 0.3s ease; pointer-events: none; }',
    '.dim.on { opacity: 1; }',
    '.op { position: fixed; top: 16px; right: 16px; pointer-events: auto; --c1: #ff8c00; --ring: rgba(255, 140, 0, 0.32); --morph: cubic-bezier(0.5, 0, 0.15, 1.22); border-radius: 18px; background: #000000; color: #f1f5f9; font: 500 12.5px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; box-shadow: 0 10px 36px rgba(0, 0, 0, 0.42), 0 0 0 1px var(--ring); overflow: hidden; transform-origin: calc(100% - 28px) 0; transition: width 0.52s var(--morph), height 0.52s var(--morph), box-shadow 0.4s ease, border-radius 0.52s var(--morph), opacity 0.26s ease, transform 0.36s cubic-bezier(0.3, 1.4, 0.5, 1); }',
    '.op.vault { --c1: #e4e4e7; --ring: rgba(255, 255, 255, 0.26); }',
    '.op.ask { --c1: #ff8c00; --ring: rgba(255, 140, 0, 0.6); border-radius: 20px; }',
    '.op.guard { --c1: #f5a524; --ring: rgba(245, 165, 36, 0.65); }',
    '.op.done { --c1: #34d399; --ring: rgba(52, 211, 153, 0.55); }',
    '.op.err { --c1: #f87171; --ring: rgba(248, 113, 113, 0.55); }',
    '.inner { position: relative; }',
    '.op-top { display: flex; align-items: center; height: 36px; padding: 0 14px 0 12px; }',
    '.op-mark { flex: none; width: 32px; font-size: 17px; color: #ffffff; }',
    '.fsb-mark { display: inline-block; line-height: 1; }',
    ".fsb-row { display: inline-flex; align-items: baseline; letter-spacing: -0.02em; font-family: 'fsb-vault-poppins', system-ui, sans-serif; line-height: 1; }",
    '.fsb-f { font-weight: 200; }',
    '.fsb-s { font-weight: 900; }',
    '.fsb-b { display: inline-block; height: 0.68em; width: auto; margin-left: 0.01em; fill: currentColor; vertical-align: baseline; }',
    '.op-div { flex: none; width: 1px; height: 14px; margin: 0 10px; background: rgba(255, 255, 255, 0.16); }',
    '.op-agent { flex: none; font: 400 9.6px/1 ' + MONO + '; letter-spacing: 0.16em; text-transform: uppercase; color: #94a3b8; white-space: nowrap; }',
    '.op-gap { flex: 1 1 10px; min-width: 10px; }',
    '.op-time { flex: none; font: 400 10.5px/1 ' + MONO + '; letter-spacing: 0.04em; color: #94a3b8; white-space: nowrap; }',
    '.op-text { margin: -5px 0 0; padding: 0 14px 0 12px; font-size: 12.5px; line-height: 17px; color: #f1f5f9; }',
    '.op-meta { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 14px 0 12px; font: 400 10px/1 ' + MONO + '; letter-spacing: 0.14em; text-transform: uppercase; color: #94a3b8; white-space: nowrap; }',
    '.op-meta .who { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; letter-spacing: 0.02em; text-transform: none; font-size: 10.5px; color: #cbd5e1; }',
    '.op-key { flex: none; width: 14px; height: 14px; color: #a1a1aa; }',
    '.op-key.fv-breathe { animation: fvBreathe 2.4s ease-in-out infinite; }',
    '.op-chips { display: flex; gap: 6px; padding: 0 14px 10px 12px; }',
    '.op-chip { display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 7px; border-radius: 999px; background: rgba(255, 255, 255, 0.07); font: 400 9px/1 ' + MONO + '; letter-spacing: 0.12em; text-transform: uppercase; color: #cbd5e1; }',
    '.op-chip.ok { background: rgba(52, 211, 153, 0.14); color: #6ee7b7; }',
    '.op-chip svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }',
    '.op-track { position: absolute; left: 12px; right: 14px; bottom: 4px; height: 2px; border-radius: 1px; overflow: hidden; background: rgba(255, 255, 255, 0.1); }',
    '.op-track i { display: block; width: 38%; height: 100%; border-radius: 1px; background: linear-gradient(90deg, #ff8c00, #ff6600); animation: opSweep 1.2s ease-in-out infinite; }',
    '.op.vault .op-track i { background: linear-gradient(90deg, rgba(255, 255, 255, 0.35), #ffffff); }',
    '.op-frame { display: block; width: 300px; height: 236px; border: 0; margin: 0; padding: 0; background: #000000; color-scheme: dark; }',
    '.fv-in { animation: fvIn 0.42s cubic-bezier(0.16, 1, 0.3, 1) backwards; }',
    '@keyframes fvIn { from { opacity: 0; transform: translateY(6px); } }',
    '@keyframes fvBreathe { 0%, 100% { opacity: 0.55; transform: scale(0.96); } 50% { opacity: 1; transform: scale(1.04); } }',
    '@keyframes opSweep { from { transform: translateX(-120%); } to { transform: translateX(320%); } }',
    '@media (prefers-reduced-motion: reduce) { .op, .dim { transition: none; } .fv-in { animation: none; } .op-track i { animation-duration: 2.4s; } }'
  ].join('\n');

  var MARK_SVG = '<svg class="fsb-b" viewBox="-3 -3 78 103" aria-hidden="true"><path d="M0 0 L40 0 C58 0 70 10 70 26 C70 38 62 46 50 49 C64 51 72 60 72 74 C72 90 60 100 40 100 L0 100 Z"></path></svg>';
  var KEY_SVG = '<svg class="op-key" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"></rect><circle cx="12" cy="12" r="4.2"></circle></svg>';
  var CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"></path></svg>';

  function chipLabel(field) {
    if (field === 'username') return ov('entry_vault_chip_username', 'Username');
    if (field === 'password') return ov('entry_vault_chip_password', 'Password');
    if (field === 'one-time-code') return ov('entry_vault_chip_code', 'Code');
    if (field === 'cc-number') return ov('entry_vault_chip_number', 'Number');
    if (field === 'cc-exp' || field === 'cc-exp-month' || field === 'cc-exp-year') return ov('entry_vault_chip_expiry', 'Expiry');
    if (field === 'cc-csc') return ov('entry_vault_chip_cvc', 'CVC');
    if (field === 'cc-name') return ov('entry_vault_chip_name', 'Name');
    return '';
  }

  // One chip per kind of field, in the order the page took them.
  function chipLabels(fields) {
    var seen = Object.create(null);
    return (Array.isArray(fields) ? fields : []).map(chipLabel).filter(function (label) {
      if (!label || seen[label]) return false;
      seen[label] = true;
      return true;
    });
  }

  function typedBy(client) {
    return client
      ? ov('entry_vault_typed_by_you', 'typed by you · not sent to $CLIENT$', { client: client })
      : ov('entry_vault_typed_by_you_agent', 'typed by you · not sent to your agent');
  }

  function several(count, client) {
    var n = String(count > 1 ? count : 2);
    return client
      ? ov('entry_vault_several', '$COUNT$ logins match · $CLIENT$ will ask you', { count: n, client: client })
      : ov('entry_vault_several_agent', '$COUNT$ logins match · your agent will ask you', { count: n });
  }

  // What each worker phase looks like. `then` is the follow-up view shown after
  // the chips have had a moment on screen.
  function viewFor(state) {
    var s = state || {};
    switch (s.phase) {
      case 'checking':
        return { mode: 'vault', tone: 'vault', text: ov('entry_vault_checking', 'Checking 1Password'), who: s.site || '' };
      case 'approve':
        return { mode: 'vault', tone: 'vault', breathe: true, text: ov('entry_vault_approve', 'Approve FSB in 1Password'), who: ov('entry_vault_waiting_for_you', 'waiting for you') };
      case 'filled_code':
        return {
          mode: 'vault', tone: 'vault', text: ov('entry_vault_entering_code', 'Entering the code'), chips: s.chips,
          who: s.who ? s.who + ' · ' + ov('entry_vault_one_time_code', 'one-time code') : ov('entry_vault_one_time_code', 'one-time code'),
          then: { mode: 'text', tone: 'done', text: ov('entry_vault_filled_1p', 'Filled from 1Password'), exitAfter: EXIT_AFTER.done }
        };
      case 'not_https':
        return { mode: 'text', tone: 'guard', text: ov('entry_vault_not_https', 'Not filled · page isn\'t https'), exitAfter: EXIT_AFTER.guard };
      case 'card_needs_https':
        return { mode: 'text', tone: 'guard', text: ov('entry_vault_card_needs_https', 'Not filled · cards need https'), exitAfter: EXIT_AFTER.guard };
      case 'locked':
        return { mode: 'vault', tone: 'guard', noTrack: true, text: ov('entry_vault_locked', '1Password is locked'), who: ov('entry_vault_unlock', 'unlock it to continue'), exitAfter: EXIT_AFTER.guard };
      case 'unreachable':
        return { mode: 'text', tone: 'err', text: ov('entry_vault_unreachable', 'Can\'t reach 1Password'), exitAfter: EXIT_AFTER.guard };
      case 'filling_card':
        return { mode: 'vault', tone: 'vault', text: ov('entry_vault_filling_card', 'Filling card'), who: s.who || '' };
      case 'card_filled':
        return {
          mode: 'vault', tone: 'vault', text: ov('entry_vault_filling_card', 'Filling card'), who: s.who || '', chips: s.chips,
          then: { mode: 'text', tone: 'done', text: ov('entry_vault_card_filled', 'Card filled · review and pay'), exitAfter: EXIT_AFTER.done }
        };
      case 'signing_1p':
        return { mode: 'vault', tone: 'vault', text: ov('entry_vault_signing_1p', 'Signing in with 1Password'), who: s.who || '' };
      case 'filled_1p':
        return {
          mode: 'vault', tone: 'vault', text: ov('entry_vault_signing_1p', 'Signing in with 1Password'), who: s.who || '', chips: s.chips,
          then: { mode: 'text', tone: 'done', text: ov('entry_vault_filled_1p', 'Filled from 1Password'), exitAfter: EXIT_AFTER.done }
        };
      case 'ask':
        return { mode: 'ask', tone: 'ask' };
      case 'signing_typed':
        return { mode: 'vault', tone: 'vault', text: ov('entry_vault_signing_typed', 'Signing in'), who: typedBy(s.client) };
      case 'filled_saved':
      case 'filled_not_saved':
        return {
          mode: 'vault', tone: 'vault', text: ov('entry_vault_signing_typed', 'Signing in'), who: typedBy(s.client), chips: s.chips,
          then: {
            mode: 'text', tone: 'done', exitAfter: EXIT_AFTER.done,
            text: s.phase === 'filled_saved'
              ? ov('entry_vault_filled_saved', 'Filled · saved to 1Password')
              : ov('entry_vault_filled_not_saved', 'Filled · not saved')
          }
        };
      case 'cancelled':
        return { mode: 'text', tone: '', text: ov('entry_vault_cancelled', 'Cancelled · nothing filled'), exitAfter: EXIT_AFTER.cancelled };
      case 'page_changed':
        return { mode: 'text', tone: 'guard', text: ov('entry_vault_page_changed', 'Page changed · nothing filled'), exitAfter: EXIT_AFTER.guard };
      case 'several':
        return { mode: 'text', tone: 'ask', text: several(s.count, s.client), exitAfter: EXIT_AFTER.guard };
      default:
        return null;
    }
  }

  // ---- fonts: binary FontFace data works under any page font-src policy -----
  var fontsRequested = false;
  function loadFonts() {
    if (fontsRequested || typeof FontFace !== 'function' || !document.fonts) return;
    fontsRequested = true;
    [
      ['fsb-vault-poppins', 'assets/onboarding/fonts/poppins-100.ttf', '200'],
      ['fsb-vault-poppins', 'assets/onboarding/fonts/poppins-900.ttf', '900']
    ].forEach(function (spec) {
      fetch(chrome.runtime.getURL(spec[1]))
        .then(function (response) { return response.arrayBuffer(); })
        .then(function (data) {
          var face = new FontFace(spec[0], data, { weight: spec[2], style: 'normal' });
          return face.load().then(function () { document.fonts.add(face); });
        })
        .catch(function () { /* the fallback stacks still render */ });
    });
  }

  // ---- the pill ---------------------------------------------------------------
  var host = null;
  var shadow = null;
  var els = null;
  var current = null;      // the view on screen
  var target = null;       // the view to land on once the intro finishes
  var startedAt = 0;
  var timers = [];
  var tick = null;
  var introUntil = 0;
  var frame = null;
  var frameAsk = null;     // { requestId, nonce, origin } for the frame on screen
  var client = '';

  var introTimers = [];
  function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function clearIntro() { introTimers.forEach(clearTimeout); introTimers = []; }

  function progressHost() { return document.getElementById('fsb-progress-host'); }

  function suppressProgress(on) {
    var card = progressHost();
    if (!card) return;
    if (on) card.style.setProperty('visibility', 'hidden', 'important');
    else card.style.removeProperty('visibility');
  }

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement('fsb-vault-pill');
    host.setAttribute('data-fsb-overlay', 'vault-pill');
    host.style.cssText = 'all: initial !important; position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; background: transparent !important; overflow: visible !important; pointer-events: none !important; z-index: 2147483647 !important; display: block !important;';
    shadow = host.attachShadow({ mode: 'closed' });
    var style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);
    var dim = document.createElement('div');
    dim.className = 'dim';
    var op = document.createElement('div');
    op.className = 'op';
    op.setAttribute('aria-label', 'FSB');
    op.setAttribute('aria-live', 'polite');
    op.setAttribute('translate', 'no');
    var inner = document.createElement('div');
    inner.className = 'inner';
    op.appendChild(inner);
    shadow.appendChild(dim);
    shadow.appendChild(op);
    els = { dim: dim, op: op, inner: inner };
    // Start collapsed and invisible so the first view grows out of the corner.
    op.style.width = WIDTH.seed + 'px';
    op.style.height = '36px';
    op.style.opacity = '0';
    op.style.transform = 'translateY(-14px) scale(0.4)';
    document.documentElement.appendChild(host);
    if (typeof host.showPopover === 'function') {
      try {
        host.setAttribute('popover', 'manual');
        host.showPopover();
      } catch (_e) {
        host.removeAttribute('popover');
      }
    }
    loadFonts();
  }

  function elapsedLabel() {
    var secs = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
    return Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  }

  function topRow(mode) {
    var row = document.createElement('div');
    row.className = 'op-top';
    row.innerHTML = '<span class="op-mark fsb-mark"><span class="fsb-row"><span class="fsb-f">F</span><span class="fsb-s">S</span>' + MARK_SVG + '</span></span>';
    if (mode !== 'seed') {
      if (client) {
        var div = document.createElement('span');
        div.className = 'op-div fv-in';
        var agent = document.createElement('span');
        agent.className = 'op-agent fv-in';
        agent.textContent = client;
        row.appendChild(div);
        row.appendChild(agent);
      }
      var gap = document.createElement('span');
      gap.className = 'op-gap';
      var time = document.createElement('span');
      time.className = 'op-time fv-in';
      time.textContent = elapsedLabel();
      row.appendChild(gap);
      row.appendChild(time);
    }
    return row;
  }

  function bodyFor(view) {
    var wrap = document.createElement('div');
    wrap.className = 'fv-in';
    wrap.style.animationDelay = '0.14s';
    if (view.mode === 'text') {
      var p = document.createElement('p');
      p.className = 'op-text';
      p.style.paddingBottom = '12px';
      p.textContent = view.text || '';
      wrap.appendChild(p);
      return wrap;
    }
    if (view.mode === 'vault') {
      var line = document.createElement('p');
      line.className = 'op-text';
      line.textContent = view.text || '';
      var meta = document.createElement('div');
      meta.className = 'op-meta';
      meta.innerHTML = view.breathe ? KEY_SVG.replace('class="op-key"', 'class="op-key fv-breathe"') : KEY_SVG;
      var who = document.createElement('span');
      who.className = 'who';
      who.textContent = view.who || '';
      meta.appendChild(who);
      wrap.appendChild(line);
      wrap.appendChild(meta);
      var chips = chipLabels(view.chips);
      if (chips.length) {
        var row = document.createElement('div');
        row.className = 'op-chips';
        chips.forEach(function (label) {
          var chip = document.createElement('span');
          chip.className = 'op-chip ok';
          chip.innerHTML = CHECK_SVG;
          chip.appendChild(document.createTextNode(label));
          row.appendChild(chip);
        });
        wrap.appendChild(row);
      } else {
        var spacer = document.createElement('div');
        spacer.style.height = '8px';
        wrap.appendChild(spacer);
      }
      if (!view.noTrack) {
        var track = document.createElement('div');
        track.className = 'op-track';
        track.appendChild(document.createElement('i'));
        wrap.appendChild(track);
      }
      return wrap;
    }
    return null;
  }

  function widthFor(view) {
    if (view.mode === 'vault' && chipLabels(view.chips).length > 3) return WIDTH.wide;
    return WIDTH[view.mode] || WIDTH.seed;
  }

  function measure() {
    if (!els || !current) return;
    if (current.mode === 'seed' || current.mode === 'head') {
      els.op.style.height = '36px';
      return;
    }
    var h = Math.ceil(els.inner.offsetHeight);
    if (h) els.op.style.height = h + 'px';
  }

  function removeFrame() {
    if (frame) {
      frame.remove();
      frame = null;
    }
    frameAsk = null;
  }

  function buildFrame(state) {
    removeFrame();
    var url;
    try {
      url = new URL(String(state.frameUrl || ''));
    } catch (_e) {
      return null;
    }
    var expected = chrome.runtime.getURL('ui/credential-sheet.html');
    if (url.href.split(/[?#]/)[0] !== expected) return null;
    frame = document.createElement('iframe');
    frame.className = 'op-frame';
    frame.setAttribute('title', 'FSB');
    frame.setAttribute('scrolling', 'no');
    frameAsk = { requestId: String(state.requestId || ''), nonce: String(state.nonce || ''), origin: url.origin };
    var ask = frameAsk;
    var node = frame;
    // The nonce reaches the frame only through postMessage to its own origin.
    frame.addEventListener('load', function () {
      if (frame !== node || frameAsk !== ask || !node.contentWindow) return;
      node.contentWindow.postMessage({ fsbCredentialSheet: 'hello', requestId: ask.requestId, nonce: ask.nonce }, ask.origin);
    });
    frame.src = expected;
    return frame;
  }

  // The frame is attached exactly once: moving an iframe in the DOM reloads it,
  // which would drop what the user typed and end the request. The intro steps
  // (seed, head) leave a frame that is waiting to be shown alone.
  function render(view) {
    current = view;
    var op = els.op;
    var intro = view.mode === 'seed' || view.mode === 'head';
    op.className = 'op' + (view.tone ? ' ' + view.tone : '');
    op.setAttribute('role', view.mode === 'ask' ? 'dialog' : 'status');
    els.dim.classList.toggle('on', view.mode === 'ask');
    if (view.mode === 'ask' && frame && frame.isConnected && view.frame === frame) {
      measure();
      return;
    }
    if (view.mode !== 'ask' && !intro) removeFrame();
    els.inner.textContent = '';
    els.inner.appendChild(topRow(view.mode));
    if (view.mode === 'ask') {
      if (!frame || view.frame !== frame) return;
      els.inner.appendChild(frame);
    } else {
      var body = bodyFor(view);
      if (body) els.inner.appendChild(body);
    }
    // The inner box takes the final width at once (the pill's own width
    // animates), so the height below is measured at the width it lands on.
    var width = widthFor(view);
    els.inner.style.width = width + 'px';
    op.style.width = width + 'px';
    op.style.opacity = '1';
    op.style.transform = 'none';
    measure();
  }

  function startTick() {
    if (tick) return;
    tick = setInterval(function () {
      if (!shadow) return;
      var time = shadow.querySelector('.op-time');
      if (time) time.textContent = elapsedLabel();
    }, 1000);
  }

  function exit() {
    clearTimers();
    clearIntro();
    if (!els) return;
    removeFrame();
    els.dim.classList.remove('on');
    els.op.style.opacity = '0';
    els.op.style.transform = 'translateY(-14px) scale(0.4)';
    var leaving = host;
    later(620, function () {
      if (tick) { clearInterval(tick); tick = null; }
      if (leaving && leaving === host) {
        try { if (typeof leaving.hidePopover === 'function' && leaving.hasAttribute('popover')) leaving.hidePopover(); } catch (_e) { /* already hidden */ }
        leaving.remove();
        host = null;
        shadow = null;
        els = null;
        current = null;
        target = null;
        startedAt = 0;
      }
      suppressProgress(false);
    });
  }

  function land(view) {
    target = null;
    render(view);
    if (view.then) {
      later(1100, function () {
        if (current !== view) return;
        land(view.then);
      });
    } else if (view.exitAfter) {
      later(view.exitAfter, function () {
        if (current === view) exit();
      });
    }
  }

  // Applies one worker state. Returns { shown } for the worker: an ask counts
  // as shown once the frame is on the page.
  function apply(state) {
    var view = viewFor(state);
    if (state && typeof state.client === 'string') client = state.client;
    if (!view) {
      exit();
      return { shown: false };
    }
    if (view.mode === 'ask') {
      var built = buildFrame(state);
      if (!built) return { shown: false };
      view.frame = built;
    }
    clearTimers();
    var fresh = !host || !host.isConnected || !current;
    ensureHost();
    suppressProgress(true);
    if (fresh) {
      // Grow out of the corner: seed, head, then whatever state is latest.
      clearIntro();
      startedAt = Date.now();
      startTick();
      target = view;
      render({ mode: 'seed', tone: '' });
      introUntil = Date.now() + 900;
      introTimers.push(setTimeout(function () { render({ mode: 'head', tone: '' }); }, 380));
      introTimers.push(setTimeout(function () { if (target) land(target); }, 900));
    } else if (Date.now() < introUntil) {
      // Still growing: the intro lands on this state instead.
      target = view;
    } else {
      land(view);
    }
    return { shown: true };
  }

  // The frame reports its content height. Only that frame's window is heard.
  window.addEventListener('message', function (event) {
    if (!frame || event.source !== frame.contentWindow) return;
    var data = event.data;
    if (!data || data.fsbCredentialSheet !== 'size') return;
    var height = Number(data.height);
    if (!Number.isFinite(height)) return;
    frame.style.height = Math.min(FRAME_MAX, Math.max(FRAME_MIN, Math.ceil(height))) + 'px';
    measure();
  });

  FSB.vaultPill = { apply: apply, exit: exit };
})();
