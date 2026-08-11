(function(global) {
  'use strict';

  var EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

  function navigatorBrands(navigatorLike) {
    try {
      var userAgentData = navigatorLike && navigatorLike.userAgentData;
      if (!userAgentData || !Array.isArray(userAgentData.brands)) return [];
      return userAgentData.brands
        .map(function(entry) {
          return entry && typeof entry.brand === 'string'
            ? entry.brand.toLowerCase()
            : '';
        })
        .filter(Boolean);
    } catch (_error) {
      return [];
    }
  }

  function detectBrowser(navigatorLike) {
    try {
      if (navigatorLike && navigatorLike.brave) return 'brave';
    } catch (_error) {
      // Continue with client hints and user-agent detection.
    }

    var brands = navigatorBrands(navigatorLike);
    if (brands.some(function(brand) { return brand.indexOf('microsoft edge') !== -1; })) {
      return 'edge';
    }
    if (brands.some(function(brand) { return brand.indexOf('brave') !== -1; })) {
      return 'brave';
    }
    if (brands.some(function(brand) { return brand.indexOf('google chrome') !== -1; })) {
      return 'chrome';
    }
    if (brands.some(function(brand) { return brand.indexOf('chromium') !== -1; })) {
      return 'chromium';
    }

    var userAgent = '';
    try {
      userAgent = navigatorLike && typeof navigatorLike.userAgent === 'string'
        ? navigatorLike.userAgent.toLowerCase()
        : '';
    } catch (_error) {
      userAgent = '';
    }
    if (/\bedg\//.test(userAgent)) return 'edge';
    if (/\bbrave\//.test(userAgent)) return 'brave';
    if (/\bchromium\//.test(userAgent)) return 'chromium';
    if (/\bchrome\//.test(userAgent)) return 'chrome';
    return 'chrome';
  }

  function buildInstallCommand(extensionId, navigatorLike) {
    if (typeof extensionId !== 'string' || !EXTENSION_ID_PATTERN.test(extensionId)) {
      return null;
    }
    return 'npx -y fsb-mcp-server@latest install --native-host --browser '
      + detectBrowser(navigatorLike)
      + ' --extension-id '
      + extensionId;
  }

  var api = Object.freeze({
    detectBrowser: detectBrowser,
    buildInstallCommand: buildInstallCommand
  });

  global.FsbNativeHostInstallCommand = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
