(function(global) {
  'use strict';

  var BYTES_PER_GIB = 1024 * 1024 * 1024;
  var DEFAULT_AGENT_CAP_FALLBACK = 8;
  var AGENT_CAP_MIN = 1;
  var AGENT_CAP_MAX = 64;

  function clampAgentCap(value, fallbackValue) {
    var fallback = (typeof fallbackValue === 'number' && Number.isFinite(fallbackValue))
      ? Math.floor(fallbackValue)
      : DEFAULT_AGENT_CAP_FALLBACK;
    var n = (typeof value === 'number') ? value : Number(value);
    if (typeof value === 'string' && value.trim() === '') n = NaN;
    if (!Number.isFinite(n)) n = fallback;
    var i = Math.floor(n);
    if (i < AGENT_CAP_MIN) return AGENT_CAP_MIN;
    if (i > AGENT_CAP_MAX) return AGENT_CAP_MAX;
    return i;
  }

  function recommendAgentCapFromCapacityBytes(capacityBytes) {
    if (typeof capacityBytes !== 'number' || !Number.isFinite(capacityBytes) || capacityBytes <= 0) {
      return DEFAULT_AGENT_CAP_FALLBACK;
    }
    var totalGiB = capacityBytes / BYTES_PER_GIB;
    return clampAgentCap(Math.floor(totalGiB / 3), DEFAULT_AGENT_CAP_FALLBACK);
  }

  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }

  function getSystemMemoryInfo() {
    var c = _getChrome();
    if (!c || !c.system || !c.system.memory || typeof c.system.memory.getInfo !== 'function') {
      return Promise.resolve(null);
    }

    return new Promise(function(resolve) {
      var settled = false;
      function finish(info) {
        if (settled) return;
        settled = true;
        resolve(info && typeof info === 'object' ? info : null);
      }

      try {
        var callbackResult = c.system.memory.getInfo(finish);
        if (callbackResult && typeof callbackResult.then === 'function') {
          callbackResult.then(finish, function() { finish(null); });
        } else if (callbackResult && typeof callbackResult === 'object') {
          finish(callbackResult);
        }
      } catch (_callbackError) {
        try {
          var promiseResult = c.system.memory.getInfo();
          if (promiseResult && typeof promiseResult.then === 'function') {
            promiseResult.then(finish, function() { finish(null); });
          } else if (promiseResult && typeof promiseResult === 'object') {
            finish(promiseResult);
          } else {
            finish(null);
          }
        } catch (_promiseError) {
          finish(null);
        }
      }
    });
  }

  async function getRecommendedAgentCap() {
    try {
      var info = await getSystemMemoryInfo();
      return recommendAgentCapFromCapacityBytes(info && info.capacity);
    } catch (_e) {
      return DEFAULT_AGENT_CAP_FALLBACK;
    }
  }

  var exportsObj = {
    BYTES_PER_GIB: BYTES_PER_GIB,
    DEFAULT_AGENT_CAP_FALLBACK: DEFAULT_AGENT_CAP_FALLBACK,
    AGENT_CAP_MIN: AGENT_CAP_MIN,
    AGENT_CAP_MAX: AGENT_CAP_MAX,
    clampAgentCap: clampAgentCap,
    recommendAgentCapFromCapacityBytes: recommendAgentCapFromCapacityBytes,
    getSystemMemoryInfo: getSystemMemoryInfo,
    getRecommendedAgentCap: getRecommendedAgentCap
  };

  global.FsbAgentCapRecommendation = exportsObj;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
