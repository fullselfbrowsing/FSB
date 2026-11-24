// The typed-login sheet, inside the FSB status pill on a web page.
//
// This page runs as an extension frame, so keys typed here never reach the
// page's scripts. It learns its request from the pill's content script (a
// postMessage "hello" carrying the request id and nonce), then talks only to
// the service worker over the fsb-credential-sheet port. What the user types
// is sent once, on Sign in, and the fields are cleared right away.
//
// Sign in stays disabled while the sheet is covered by something on the page
// (IntersectionObserver v2 visibility) or while typing is paused because the
// page took focus.
(function () {
  'use strict';

  var PORT_NAME = 'fsb-credential-sheet';
  var $ = function (id) { return document.getElementById(id); };
  var els = {
    sheet: $('sheet'),
    modeType: $('modeType'),
    modeAdd: $('modeAdd'),
    siteType: $('siteType'),
    siteAdd: $('siteAdd'),
    siteTypeRow: $('siteTypeRow'),
    siteAddRow: $('siteAddRow'),
    userBox: $('userBox'),
    pwBox: $('pwBox'),
    user: $('user'),
    pw: $('pw'),
    eye: $('eye'),
    saveRow: $('saveRow'),
    saveToggle: $('saveToggle'),
    noSave: $('noSave'),
    pause: $('pause'),
    covered: $('covered'),
    cancelType: $('cancelType'),
    signIn: $('signIn'),
    toAdd: $('toAdd'),
    stillMissing: $('stillMissing'),
    cancelAdd: $('cancelAdd'),
    continueAdd: $('continueAdd'),
    toType: $('toType')
  };

  var state = {
    port: null,
    connecting: false,
    ready: false,
    sent: false,
    canSave: false,
    save: true,
    covered: false,
    paused: false,
    typing: false,
    mode: 'type'
  };

  function t(key, english, subs) {
    var locale = globalThis.fsbUiLocale;
    return locale && typeof locale.text === 'function' ? locale.text(key, english, subs) : english;
  }

  function reportSize() {
    var height = Math.ceil(els.sheet.getBoundingClientRect().height);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ fsbCredentialSheet: 'size', height: height }, '*');
    }
  }

  function refresh() {
    var typed = els.user.value.length > 0 && els.pw.value.length > 0;
    els.signIn.disabled = !state.ready || state.sent || !typed || state.covered || state.paused;
    els.continueAdd.disabled = !state.ready || state.sent;
    els.covered.hidden = !state.covered || state.mode !== 'type';
    els.pause.hidden = !state.paused || state.mode !== 'type';
    els.userBox.classList.toggle('focus', !state.paused && document.activeElement === els.user);
    els.pwBox.classList.toggle('focus', !state.paused && document.activeElement === els.pw);
    els.saveToggle.classList.toggle('on', state.save);
    els.saveToggle.setAttribute('aria-pressed', state.save ? 'true' : 'false');
    reportSize();
  }

  function setMode(mode) {
    state.mode = mode;
    els.modeType.hidden = mode !== 'type';
    els.modeAdd.hidden = mode !== 'add';
    if (mode === 'type') els.stillMissing.hidden = true;
    refresh();
  }

  function send(message) {
    if (!state.port) return false;
    try {
      state.port.postMessage(message);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function clearFields() {
    els.user.value = '';
    els.pw.value = '';
  }

  function showSite(site) {
    var label = typeof site === 'string' ? site : '';
    els.siteType.textContent = label;
    els.siteAdd.textContent = label;
    var insecure = label.indexOf('http:') === 0;
    els.siteTypeRow.classList.toggle('bad', insecure);
    els.siteAddRow.classList.toggle('bad', insecure);
  }

  function start(init) {
    state.ready = true;
    state.canSave = init.canSave === true;
    state.save = state.canSave;
    els.saveRow.hidden = !state.canSave;
    els.noSave.hidden = state.canSave;
    showSite(init.site);
    els.sheet.hidden = false;
    setMode('type');
    try { els.user.focus(); } catch (_e) { /* focus needs a click on some pages */ }
    refresh();
  }

  function stop() {
    state.ready = false;
    state.port = null;
    clearFields();
    refresh();
  }

  function connect(requestId, nonce) {
    if (state.ready || state.connecting) return;
    var port;
    try {
      port = chrome.runtime.connect({ name: PORT_NAME });
    } catch (_e) {
      return;
    }
    state.connecting = true;
    port.onMessage.addListener(function (message) {
      if (!message) return;
      if (!state.ready) {
        if (message.type === 'init') {
          state.connecting = false;
          state.port = port;
          start(message);
        } else if (message.type === 'refused') {
          // A forged hello from the page: drop it and wait for the real one.
          state.connecting = false;
          try { port.disconnect(); } catch (_e) { /* gone */ }
        }
        return;
      }
      if (message.type === 'still_missing') {
        state.sent = false;
        els.stillMissing.hidden = false;
        refresh();
      }
    });
    port.onDisconnect.addListener(function () {
      if (state.port === port) stop();
      else state.connecting = false;
    });
    port.postMessage({ type: 'ready', requestId: requestId, nonce: nonce });
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.fsbCredentialSheet !== 'hello') return;
    if (typeof data.requestId !== 'string' || typeof data.nonce !== 'string') return;
    connect(data.requestId, data.nonce);
  });

  function signIn() {
    if (els.signIn.disabled) return;
    var username = els.user.value;
    var password = els.pw.value;
    state.sent = true;
    clearFields();
    refresh();
    send({ type: 'submit', username: username, password: password, save: state.canSave && state.save });
  }

  els.signIn.addEventListener('click', signIn);
  els.pw.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      signIn();
    }
  });
  els.user.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      els.pw.focus();
    }
  });
  [els.user, els.pw].forEach(function (input) {
    input.addEventListener('input', refresh);
    input.addEventListener('focus', function () {
      state.typing = true;
      refresh();
    });
    input.addEventListener('blur', refresh);
  });

  els.eye.addEventListener('click', function () {
    var show = els.pw.type === 'password';
    els.pw.type = show ? 'text' : 'password';
    els.eye.classList.toggle('on', show);
    els.eye.setAttribute('aria-label', show
      ? t('entry_vault_sheet_hide', 'Hide password')
      : t('panel_6aeaa6a53d', 'Show password'));
    els.pw.focus();
  });

  els.saveToggle.addEventListener('click', function () {
    state.save = !state.save;
    refresh();
  });

  function cancel() {
    if (state.sent) return;
    state.sent = true;
    clearFields();
    refresh();
    send({ type: 'cancel' });
  }
  els.cancelType.addEventListener('click', cancel);
  els.cancelAdd.addEventListener('click', cancel);

  els.toAdd.addEventListener('click', function () { setMode('add'); });
  els.toType.addEventListener('click', function () {
    setMode('type');
    try { els.user.focus(); } catch (_e) { /* no focus */ }
  });
  els.continueAdd.addEventListener('click', function () {
    if (!state.ready || state.sent) return;
    state.sent = true;
    els.stillMissing.hidden = true;
    refresh();
    send({ type: 'retry' });
  });

  // The page took focus while the user was typing: pause, and say so.
  window.addEventListener('blur', function () {
    if (!state.ready || state.sent || !state.typing) return;
    state.paused = true;
    refresh();
  });
  els.pause.addEventListener('click', function () {
    state.paused = false;
    refresh();
    try { (els.user.value ? els.pw : els.user).focus(); } catch (_e) { /* no focus */ }
  });

  // Something on the page drawn over the sheet disables Sign in.
  function watchVisibility() {
    if (typeof IntersectionObserver !== 'function') return;
    try {
      var observer = new IntersectionObserver(function (entries) {
        var entry = entries[entries.length - 1];
        if (!entry) return;
        var visible = typeof entry.isVisible === 'boolean' ? entry.isVisible : entry.isIntersecting;
        if (state.covered === !visible) return;
        state.covered = !visible;
        refresh();
      }, { trackVisibility: true, delay: 100, threshold: [0, 1] });
      observer.observe(els.sheet);
    } catch (_e) { /* visibility tracking unavailable */ }
  }

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(reportSize).observe(els.sheet);
  }
  watchVisibility();

  var locale = globalThis.fsbUiLocale;
  if (locale && typeof locale.boot === 'function') {
    locale.boot().then(function () {
      if (typeof locale.apply === 'function') locale.apply(document);
      reportSize();
    }).catch(function () { /* English stays */ });
    if (typeof locale.onChange === 'function') {
      locale.onChange(function () {
        if (typeof locale.apply === 'function') locale.apply(document);
        reportSize();
      });
    }
  }
})();
