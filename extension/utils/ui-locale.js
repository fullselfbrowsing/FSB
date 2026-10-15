'use strict';

/**
 * Extension UI locale resolver.
 *
 * Public codes match the showcase registry. Chrome catalog folders use
 * zh_CN and zh_TW. chrome.i18n.getMessage follows the browser UI language,
 * so an explicit chrome.storage.local override is applied here.
 *
 * This module does not read cookies. Locale choice comes from chrome.storage.local
 * or the browser UI language.
 */
(function (root) {
  // Content scripts are re-injected into tabs that already run them. Keep the
  // booted instance so earlier callers keep their catalogs and override.
  if (root.fsbUiLocale && typeof root.fsbUiLocale.boot === 'function') {
    if (typeof module !== 'undefined' && module.exports) module.exports = root.fsbUiLocale;
    return;
  }

  var PUBLIC_LOCALES = ['en', 'es', 'de', 'ja', 'ko', 'zh-CN', 'zh-TW'];
  var SOURCE_LOCALE = 'en';
  var STORAGE_KEY = 'fsbUiLocale';
  var FOLDERS = {
    en: 'en',
    es: 'es',
    de: 'de',
    ja: 'ja',
    ko: 'ko',
    'zh-CN': 'zh_CN',
    'zh-TW': 'zh_TW'
  };
  var ZH_HANS = { 'zh-cn': true, 'zh-sg': true, zh: true, 'zh-hans': true };
  var ZH_HANT = { 'zh-tw': true, 'zh-mo': true, 'zh-hk': true, 'zh-hant': true };

  var catalogs = {};
  var activeOverride = null;
  var browserTag = null;

  function folderFor(publicCode) {
    return Object.prototype.hasOwnProperty.call(FOLDERS, publicCode) ? FOLDERS[publicCode] : null;
  }

  function isPublicLocale(value) {
    return PUBLIC_LOCALES.indexOf(value) !== -1;
  }

  function resolveLocale(tag) {
    if (typeof tag !== 'string') return SOURCE_LOCALE;
    var lower = tag.trim().toLowerCase().replace(/_/g, '-');
    if (!lower) return SOURCE_LOCALE;
    if (lower.indexOf('zh-hans') === 0 || ZH_HANS[lower]) return 'zh-CN';
    if (lower.indexOf('zh-hant') === 0 || ZH_HANT[lower]) return 'zh-TW';
    var i;
    for (i = 0; i < PUBLIC_LOCALES.length; i++) {
      if (PUBLIC_LOCALES[i].toLowerCase() === lower) return PUBLIC_LOCALES[i];
    }
    var primary = lower.split('-')[0];
    for (i = 0; i < PUBLIC_LOCALES.length; i++) {
      if (PUBLIC_LOCALES[i].toLowerCase() === primary) return PUBLIC_LOCALES[i];
    }
    return SOURCE_LOCALE;
  }

  function messageFromCatalog(code, key) {
    var cat = catalogs[code];
    if (!cat || !Object.prototype.hasOwnProperty.call(cat, key)) return null;
    var msg = cat[key];
    if (typeof msg !== 'string' || msg.length === 0) return null;
    return msg;
  }

  function applySubs(message, subs) {
    if (subs == null) return message;
    if (Array.isArray(subs)) {
      return message.replace(/\$(\d+)/g, function (_all, n) {
        var idx = Number(n) - 1;
        return idx >= 0 && idx < subs.length && subs[idx] != null ? String(subs[idx]) : '';
      });
    }
    if (typeof subs !== 'object') return message;
    return message.replace(/\$([A-Za-z0-9_]+)\$/g, function (all, name) {
      if (Object.prototype.hasOwnProperty.call(subs, name) && subs[name] != null) return String(subs[name]);
      var lower = name.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(subs, lower) && subs[lower] != null) return String(subs[lower]);
      return all;
    });
  }

  function current() {
    return activeOverride || resolveLocale(browserTag);
  }

  function t(key, subs) {
    var locale = current();
    var msg = messageFromCatalog(locale, key);
    if (msg == null && locale !== SOURCE_LOCALE) msg = messageFromCatalog(SOURCE_LOCALE, key);
    // chrome.i18n.getMessage only takes a string or string array, so named
    // (object) substitutions would come back empty. Those use the English path.
    var namedSubs = subs != null && typeof subs === 'object' && !Array.isArray(subs);
    if (msg == null && !activeOverride && !namedSubs && root.chrome && root.chrome.i18n && typeof root.chrome.i18n.getMessage === 'function') {
      var fromChrome = root.chrome.i18n.getMessage(key, subs);
      if (typeof fromChrome === 'string' && fromChrome.length > 0) return fromChrome;
    }
    if (msg == null) {
      var english = messageFromCatalog(SOURCE_LOCALE, key);
      msg = english == null ? key : english;
    }
    return applySubs(msg, subs);
  }

  function line(english, subs) {
    var key = EXACT[english];
    if (key) return text(key, english, subs);
    return applySubs(english, subs);
  }

  function text(key, english, subs) {
    var value = t(key, subs);
    if (typeof value !== 'string' || value.length === 0 || value === key) {
      if (typeof english !== 'string') return value;
      return applySubs(english, subs);
    }
    return value;
  }

  function writeText(node, value) {
    if (!node) return;
    var child = node.firstChild;
    if (child && child.nodeType === 3) {
      child.nodeValue = value;
      return;
    }
    if (node.childNodes && node.childNodes.length > 0 && node.ownerDocument && typeof node.ownerDocument.createTextNode === 'function') {
      node.insertBefore(node.ownerDocument.createTextNode(value), child);
      return;
    }
    node.textContent = value;
  }

  // Reads back what writeText last wrote, so apply() can tell whether other
  // code has replaced the text since.
  function readText(node) {
    if (!node) return '';
    var child = node.firstChild;
    if (child && child.nodeType === 3) return child.nodeValue;
    return node.textContent;
  }

  function norm(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function clearLive(node) {
    if (!node || typeof node.removeAttribute !== 'function') return;
    node.removeAttribute('data-i18n-live');
    node.removeAttribute('data-i18n-en');
    node.removeAttribute('data-i18n-subs');
    node.removeAttribute('data-i18n-shown');
  }

  function fill(node, key, english, subs) {
    if (node && typeof node.setAttribute === 'function') {
      node.setAttribute('data-i18n-live', key);
      node.setAttribute('data-i18n-en', english);
      if (subs && typeof subs === 'object') node.setAttribute('data-i18n-subs', JSON.stringify(subs));
      else if (typeof node.removeAttribute === 'function') node.removeAttribute('data-i18n-subs');
    }
    var shown = text(key, english, subs);
    writeText(node, shown);
    if (node && typeof node.setAttribute === 'function') node.setAttribute('data-i18n-shown', shown);
    return shown;
  }

  var EXACT = {
    'Ready': 'shell_ready',
    'Welcome to FSB. How can I help?': 'shell_welcome',
    'No active automation to stop.': 'shell_no_automation',
    'Automation stopped. Let me know if you need help with anything else!': 'shell_stopped',
    'Partial result': 'shell_partial',
    'Would you like to try again? ': 'shell_try_again',
    'Retry': 'shell_retry',
    'Switched to popup mode. Extension will close when clicked outside.': 'shell_switched_popup',
    'Running in persistent window mode.': 'shell_persistent',
    'Let me know if you\'d like to try again or need help with something else.': 'shell_try_again_help',
    'Disabled while automation is working on this tab': 'shell_locked_tab',
    'Doctor command copied': 'shell_doctor_copied',
    'Pairing reset command copied': 'shell_pair_copied',
    'Native helper install command copied': 'shell_install_copied',
    'Site map ready. Retry your task? ': 'shell_site_map_ready',
    'Retry with Site Map': 'shell_retry_sitemap',
    'Extension is locked. Please unlock it first by opening the popup.': 'shell_locked_ext',
    'Already completed': 'shell_already_done',
    'Session ended unexpectedly. Ready for your next task.': 'shell_session_ended',
    'This site does not have a map yet. Reconnaissance can help FSB learn the site structure for better performance.': 'shell_no_map',
    'Run Reconnaissance': 'shell_run_recon',
    'The automation got stuck repeating the same actions. Here are some tips:': 'shell_stuck',
    'Try being more specific about what you want to achieve': 'shell_tip_specific',
    'Check if the page requires manual steps like CAPTCHA solving': 'shell_tip_captcha',
    'Ensure the page has fully loaded before starting': 'shell_tip_loaded',
    'No worries! The side panel is still here. Try again or ask for help with something else.': 'shell_no_worries',
    'Password': 'shell_password',
    'Signing in...': 'shell_signing_in',
    'Login skipped. Continuing automation...': 'shell_login_skipped',
    'Saved payment method selected. FSB will fill the card details, but it will not submit the final payment for you.': 'shell_payment_selected',
    'Saved payment method skipped. Review the checkout form manually before any final payment step.': 'shell_payment_skipped',
    'Verified replay preview': 'shell_replay_preview',
    'Fresh recorded-site tab': 'shell_fresh_tab_fallback',
    'Approve replay': 'shell_approve_replay',
    'Cancel': 'shell_cancel',
    'Cannot replay while another automation is running. Stop the current task first.': 'shell_replay_busy',
    'Replay request cancelled. No target tabs were opened.': 'shell_replay_cancelled_request',
    'This recording is verified for inspection, but it has no executable steps.': 'shell_replay_inspect_only',
    'Replay cancelled. The original recording was not changed.': 'shell_replay_cancelled',
    'Session data not found.': 'shell_session_missing',
    'No actions were recorded in this session.': 'shell_no_actions',
    'Failed to load sessions.': 'shell_history_failed',
    'Replay session': 'shell_replay_session',
    'Delete session': 'shell_delete_session',
    'Autopilot': 'shell_autopilot',
    'Checking local agent service': 'shell_checking_local',
    'Checking local agent service. Your message has not been sent.': 'shell_checking_local_sent',
    'FSB is trying to make the local agent service available. Your message has not been sent.': 'shell_wake_body',
    'Checking agent service': 'shell_checking_agent',
    'Agent offline': 'shell_agent_offline',
    'FSB cannot reach the local agent service. Run the doctor command, then try this message again.': 'shell_offline_body',
    'Copy doctor command': 'shell_copy_doctor',
    'Open provider setup': 'shell_open_provider',
    'Automatic connection needs the native helper': 'shell_needs_helper',
    'Install or update the FSB native helper, then try this message again. FSB will connect this browser automatically.': 'shell_install_body',
    'Copy install command': 'shell_copy_install',
    'Back to message': 'shell_back_to_message',
    'Checking provider': 'shell_checking_provider',
    'FSB is checking your AI provider before sending your message.': 'shell_checking_provider_body',
    'Starting agent': 'shell_starting_agent',
    'FSB is handing your message to the agent.': 'shell_starting_agent_body',
    'Starting automation...': 'shell_starting',
    'Continuing...': 'shell_continuing',
    'Connecting to page...': 'shell_connecting',
    'Connected. Analyzing page...': 'shell_connected_analyzing',
    'Analyzing page...': 'shell_analyzing',
    'Starting automation': 'shell_starting_plain',
    'Automation running': 'shell_running',
    'Working': 'shell_working',
    'Error': 'shell_error_status'
  };

  function registerExact(map) {
    if (!map) return;
    Object.keys(map).forEach(function (english) {
      EXACT[english] = map[english];
    });
  }

  function markExact(node, english) {
    var key = EXACT[english];
    if (!key) {
      // Drop any key left by an earlier fill() so apply() does not bring back
      // the old string over this one.
      clearLive(node);
      writeText(node, english);
      return english;
    }
    return fill(node, key, english);
  }

  function setCatalog(code, messages) {
    if (!isPublicLocale(code)) return;
    catalogs[code] = messages || {};
  }

  function setBrowserTag(tag) {
    browserTag = tag;
  }

  function setOverride(code) {
    if (code == null || code === '') {
      activeOverride = null;
      return;
    }
    activeOverride = isPublicLocale(code) ? code : null;
  }

  function parseMessages(json) {
    var out = {};
    if (!json || typeof json !== 'object') return out;
    Object.keys(json).forEach(function (key) {
      var entry = json[key];
      if (entry && typeof entry.message === 'string') out[key] = entry.message;
    });
    return out;
  }

  function catalogUrl(code) {
    var folder = folderFor(code);
    var path = '_locales/' + folder + '/messages.json';
    if (root.chrome && root.chrome.runtime && typeof root.chrome.runtime.getURL === 'function') {
      return root.chrome.runtime.getURL(path);
    }
    return path;
  }

  function loadCatalogs(fetchImpl, codes) {
    var fetchFn = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) return Promise.resolve();
    var list = Array.isArray(codes) ? codes.filter(isPublicLocale) : PUBLIC_LOCALES;
    return Promise.all(list.map(function (code) {
      return Promise.resolve(fetchFn(catalogUrl(code))).then(function (res) {
        return res && typeof res.json === 'function' ? res.json() : res;
      }).then(function (json) {
        setCatalog(code, parseMessages(json));
      }).catch(function () {
        if (!catalogs[code]) setCatalog(code, {});
      });
    }));
  }

  function ensureCatalog(code) {
    if (!isPublicLocale(code) || catalogs[code]) return Promise.resolve();
    return loadCatalogs(null, [code]);
  }

  function isExtensionPage() {
    return typeof location !== 'undefined' && location.protocol === 'chrome-extension:';
  }

  function readStorageOverride() {
    return new Promise(function (resolve) {
      var chromeApi = root.chrome;
      if (!chromeApi || !chromeApi.storage || !chromeApi.storage.local || typeof chromeApi.storage.local.get !== 'function') {
        resolve(null);
        return;
      }
      chromeApi.storage.local.get(STORAGE_KEY, function (data) {
        var value = data && data[STORAGE_KEY];
        if (!isPublicLocale(value)) value = null;
        setOverride(value);
        resolve(value);
      });
    });
  }

  var NATIVE_LABELS = {
    en: 'English',
    es: 'Español',
    de: 'Deutsch',
    ja: '日本語',
    ko: '한국어',
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文'
  };
  var refreshers = [];
  var watching = false;

  function isMessage(key, value) {
    if (typeof value !== 'string' || !key) return false;
    var wanted = norm(value);
    var i;
    for (i = 0; i < PUBLIC_LOCALES.length; i++) {
      var catalog = catalogs[PUBLIC_LOCALES[i]];
      if (catalog && typeof catalog[key] === 'string' && norm(catalog[key]) === wanted) return true;
    }
    return false;
  }

  // True when value shows english or a loaded translation of it, so callers can
  // compare DOM text that line() or markExact() may have translated.
  function isLine(english, value) {
    if (typeof english !== 'string' || typeof value !== 'string') return false;
    var wanted = norm(value);
    if (wanted === norm(english)) return true;
    if (!Object.prototype.hasOwnProperty.call(EXACT, english)) return false;
    return wanted === norm(line(english)) || isMessage(EXACT[english], value);
  }

  function notifyLocaleChange() {
    var i;
    if (isExtensionPage() && typeof document !== 'undefined') {
      apply(document);
    }
    for (i = 0; i < refreshers.length; i++) {
      try { refreshers[i](); } catch (err) { /* a surface refresh must not break the others */ }
    }
  }

  function watchStorage() {
    if (watching) return;
    var chromeApi = root.chrome;
    if (!chromeApi || !chromeApi.storage || !chromeApi.storage.onChanged || typeof chromeApi.storage.onChanged.addListener !== 'function') return;
    watching = true;
    chromeApi.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes || !changes[STORAGE_KEY]) return;
      var next = changes[STORAGE_KEY].newValue;
      setOverride(isPublicLocale(next) ? next : null);
      ensureCatalog(current()).then(notifyLocaleChange);
    });
  }

  function saveOverride(code) {
    return new Promise(function (resolve) {
      var next = isPublicLocale(code) ? code : null;
      setOverride(next);
      var chromeApi = root.chrome;
      var storage = chromeApi && chromeApi.storage && chromeApi.storage.local;
      var done = function () {
        ensureCatalog(current()).then(function () {
          notifyLocaleChange();
          resolve(next);
        });
      };
      if (!storage || typeof storage.set !== 'function' || typeof storage.remove !== 'function') {
        done();
        return;
      }
      if (!next) storage.remove(STORAGE_KEY, done);
      else {
        var payload = {};
        payload[STORAGE_KEY] = next;
        storage.set(payload, done);
      }
    });
  }

  function onChange(fn) {
    if (typeof fn === 'function') refreshers.push(fn);
  }

  function mountSelect(select) {
    if (!select || select.getAttribute('data-fsb-lang') === 'ready') return;
    select.setAttribute('translate', 'no');
    select.setAttribute('data-fsb-lang', 'ready');
    var browser = select.ownerDocument.createElement('option');
    browser.value = '';
    browser.setAttribute('data-i18n', 'lang_follow_browser');
    browser.textContent = t('lang_follow_browser');
    select.appendChild(browser);
    PUBLIC_LOCALES.forEach(function (code) {
      var option = select.ownerDocument.createElement('option');
      option.value = code;
      option.textContent = NATIVE_LABELS[code];
      select.appendChild(option);
    });
    select.value = activeOverride || '';
    select.addEventListener('change', function () {
      saveOverride(select.value);
    });
    // Another surface can change the language; keep this picker in step.
    onChange(function () {
      select.value = activeOverride || '';
    });
  }

  function boot() {
    if (root.chrome && root.chrome.i18n && typeof root.chrome.i18n.getUILanguage === 'function') {
      browserTag = root.chrome.i18n.getUILanguage();
    }
    watchStorage();
    return readStorageOverride().then(function () {
      // Extension pages keep every catalog so isMessage() can recognise text
      // shown in any earlier language. Content scripts load the active locale,
      // the browser locale, and the English fallback: text drawn before boot
      // comes from chrome.i18n in the browser language, and isMessage() must
      // recognise it to replace it. ensureCatalog() adds others on change.
      if (isExtensionPage()) return loadCatalogs();
      var codes = [current()];
      var browserLocale = resolveLocale(browserTag);
      if (codes.indexOf(browserLocale) === -1) codes.push(browserLocale);
      if (codes.indexOf(SOURCE_LOCALE) === -1) codes.push(SOURCE_LOCALE);
      return loadCatalogs(null, codes);
    });
  }

  // Static markup is only re-translated while it still shows a catalog message
  // for its key. Text or attributes that page scripts have since replaced
  // (counters, provider names, status lines) are left alone.
  function apply(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return;
    var i;
    // Live nodes first: fill() owns them, so the static pass below skips any
    // node that still carries a live key.
    var live = doc.querySelectorAll('[data-i18n-live]');
    for (i = 0; i < live.length; i++) {
      if (norm(readText(live[i])) !== norm(live[i].getAttribute('data-i18n-shown'))) {
        clearLive(live[i]);
        continue;
      }
      var liveKey = live[i].getAttribute('data-i18n-live');
      var liveEnglish = live[i].getAttribute('data-i18n-en') || '';
      var liveSubs = null;
      var rawSubs = live[i].getAttribute('data-i18n-subs');
      if (rawSubs) {
        try { liveSubs = JSON.parse(rawSubs); } catch (err) { liveSubs = null; }
      }
      var shown = text(liveKey, liveEnglish, liveSubs);
      writeText(live[i], shown);
      live[i].setAttribute('data-i18n-shown', shown);
    }
    var nodes = doc.querySelectorAll('[data-i18n]');
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-i18n-live') != null) continue;
      // Writing textContent would drop child markup; key the children instead.
      if (nodes[i].children && nodes[i].children.length > 0) continue;
      var key = nodes[i].getAttribute('data-i18n');
      if (isMessage(key, nodes[i].textContent)) nodes[i].textContent = t(key);
    }
    var attrs = doc.querySelectorAll('[data-i18n-attr]');
    for (i = 0; i < attrs.length; i++) {
      var spec = attrs[i].getAttribute('data-i18n-attr') || '';
      spec.split(',').forEach(function (part) {
        var bits = part.split(':');
        if (bits.length !== 2) return;
        var name = bits[0].trim();
        var attrKey = bits[1].trim();
        if (isMessage(attrKey, attrs[i].getAttribute(name))) attrs[i].setAttribute(name, t(attrKey));
      });
    }
  }

  var api = {
    PUBLIC_LOCALES: PUBLIC_LOCALES,
    SOURCE_LOCALE: SOURCE_LOCALE,
    STORAGE_KEY: STORAGE_KEY,
    folderFor: folderFor,
    resolveLocale: resolveLocale,
    t: t,
    text: text,
    line: line,
    fill: fill,
    markExact: markExact,
    registerExact: registerExact,
    exact: EXACT,
    apply: apply,
    setCatalog: setCatalog,
    setBrowserTag: setBrowserTag,
    setOverride: setOverride,
    current: current,
    NATIVE_LABELS: NATIVE_LABELS,
    isMessage: isMessage,
    isLine: isLine,
    saveOverride: saveOverride,
    onChange: onChange,
    mountSelect: mountSelect,
    boot: boot,
    parseMessages: parseMessages,
    loadCatalogs: loadCatalogs,
    ensureCatalog: ensureCatalog
  };

  root.fsbUiLocale = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
