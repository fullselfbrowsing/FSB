// English -> catalog key map for the Skopeo HUD's own copy. It is injected
// with ui-locale.js in front of the Skopeo bundle and registers into the
// instance already running in that world.
(function (root) {
  var extra = {};
  if (root.fsbUiLocale && typeof root.fsbUiLocale.registerExact === 'function') root.fsbUiLocale.registerExact(extra);
})(typeof globalThis !== 'undefined' ? globalThis : this);
