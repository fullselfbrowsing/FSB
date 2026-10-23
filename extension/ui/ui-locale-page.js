/**
 * Locale boot for extension pages that have no page script of their own to
 * start it (control panel, unlock, microphone permission).
 *
 * Kept out of the HTML because MV3's default CSP (`script-src 'self'`)
 * blocks inline scripts on extension pages. Depends on
 * extension/utils/ui-locale.js loading first.
 */
(function () {
  'use strict';
  var locale = globalThis.fsbUiLocale;
  if (!locale || typeof locale.boot !== 'function') return;
  locale.boot().then(function () {
    if (typeof locale.mountSelect === 'function') {
      locale.mountSelect(document.getElementById('fsbUiLocaleSelect'));
    }
    // refresh() applies the catalog and also runs page callbacks registered
    // with onChange (the control panel's custom dropdowns, for one).
    if (typeof locale.refresh === 'function') locale.refresh();
    else locale.apply(document);
  });
})();
