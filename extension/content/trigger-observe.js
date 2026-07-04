// content/trigger-observe.js -- FSB live trigger observer
// Watches one resolved element via a stable ancestor and reports raw value
// changes to the service worker. Depends on: content/selectors.js.

(function() {
  if (window.__FSB_SKIP_INIT__) return;

  var FSB = window.FSB;
  if (!FSB) return;

  var DEBOUNCE_MS = 200;
  var FORM_VALUE_LISTENER_CAPTURE = true;
  var registry = new Map();

  function optsFor(extract, attrName) {
    if (extract === 'attribute' && attrName) {
      return { attributes: true, attributeFilter: [attrName], subtree: true };
    }
    return { childList: true, characterData: true, subtree: true };
  }

  function isFormValueElement(node) {
    if (!node || !node.tagName) return false;
    var tag = String(node.tagName).toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  function readValue(leaf, extract, attrName) {
    if (!leaf) return { text: '' };

    if (extract === 'attribute' && attrName) {
      var rawAttr = '';
      if (typeof leaf.getAttribute === 'function') {
        rawAttr = leaf.getAttribute(attrName) || '';
      }
      var attrValue = String(rawAttr).trim();
      var attrs = {};
      attrs[attrName] = attrValue;
      return { text: attrValue, attributes: attrs };
    }

    var raw = '';
    var tag = leaf.tagName ? String(leaf.tagName).toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      raw = leaf.value == null ? '' : leaf.value;
    } else {
      raw = leaf.textContent == null ? '' : leaf.textContent;
    }
    return { text: String(raw).trim() };
  }

  function hasStableAnchor(node) {
    if (!node) return false;
    if (node.id) return true;
    if (typeof node.getAttribute === 'function') {
      return !!(node.getAttribute('role') || node.getAttribute('data-testid'));
    }
    return !!(node.attributes && (node.attributes.role || node.attributes['data-testid']));
  }

  function stableAncestor(leaf) {
    if (!leaf) return null;
    var fallback = leaf.parentElement || leaf.parentNode || leaf;
    var cur = fallback;
    for (var depth = 0; cur && depth < 5; depth++) {
      if (hasStableAnchor(cur)) return cur;
      cur = cur.parentElement || cur.parentNode || null;
    }
    // The SW watchdog re-issues observe when this heuristic guesses wrong.
    return fallback;
  }

  function cacheKeyFor(selector) {
    if (FSB && typeof FSB.sanitizeSelector === 'function') {
      return FSB.sanitizeSelector(selector);
    }
    return selector;
  }

  function resolveLeaf(selector) {
    if (!FSB || typeof FSB.querySelectorWithShadow !== 'function') return null;
    var leaf = FSB.querySelectorWithShadow(selector);
    if (leaf && leaf.isConnected === false) {
      var key = cacheKeyFor(selector);
      if (FSB.elementCache && key && typeof FSB.elementCache.delete === 'function') {
        try { FSB.elementCache.delete(key); } catch (_e) { /* non-blocking */ }
      }
      leaf = FSB.querySelectorWithShadow(selector);
      if (leaf && leaf.isConnected === false) leaf = null;
    }
    return leaf || null;
  }

  function sendValue(triggerId, value) {
    try {
      chrome.runtime.sendMessage({
        action: 'triggerValueChanged',
        trigger_id: triggerId,
        value: value
      }).catch(function() { /* extension context may be invalidated */ });
    } catch (_e) {
      // Extension context may be invalidated.
    }
  }

  function scheduleFlush(triggerId, entry) {
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.debounceTimer = setTimeout(function() {
      flush(triggerId);
    }, DEBOUNCE_MS);
  }

  function eventTargetsLeaf(event, leaf) {
    if (!event || !leaf) return false;
    var target = event.target || null;
    if (target === leaf) return true;

    if (typeof event.composedPath === 'function') {
      try {
        var path = event.composedPath();
        if (path && path.indexOf(leaf) !== -1) return true;
      } catch (_e) {
        // Fall back to contains() below.
      }
    }

    if (target && typeof leaf.contains === 'function') {
      try {
        return leaf.contains(target);
      } catch (_e2) {
        return false;
      }
    }
    return false;
  }

  function attachFormValueListeners(triggerId, entry) {
    if (entry.extract === 'attribute' || !isFormValueElement(entry.leaf)) return;
    if (!entry.container || typeof entry.container.addEventListener !== 'function') return;

    var listener = function(event) {
      var leaf = resolveLeaf(entry.selector);
      if (!eventTargetsLeaf(event, leaf)) return;
      scheduleFlush(triggerId, entry);
    };
    entry.formValueListener = listener;
    entry.container.addEventListener('input', listener, FORM_VALUE_LISTENER_CAPTURE);
    entry.container.addEventListener('change', listener, FORM_VALUE_LISTENER_CAPTURE);
  }

  function detachFormValueListeners(entry) {
    if (!entry || !entry.formValueListener) return;
    if (entry.container && typeof entry.container.removeEventListener === 'function') {
      entry.container.removeEventListener('input', entry.formValueListener, FORM_VALUE_LISTENER_CAPTURE);
      entry.container.removeEventListener('change', entry.formValueListener, FORM_VALUE_LISTENER_CAPTURE);
    }
    entry.formValueListener = null;
  }

  function flush(triggerId) {
    var entry = registry.get(triggerId);
    if (!entry) return;
    entry.debounceTimer = null;
    var leaf = resolveLeaf(entry.selector);
    if (!leaf) {
      // Transient DOM detach (framework re-render mid-swap): never report a
      // fabricated {text:''} -- it would spuriously satisfy a 'changed'
      // condition against a non-empty baseline. The next mutation after the
      // re-attach schedules a fresh flush; permanent removal is covered by
      // the SW watchdog + the trigger TTL.
      return;
    }
    var value = readValue(leaf, entry.extract, entry.attrName);
    sendValue(triggerId, value);
  }

  function stop(triggerId) {
    var entry = registry.get(triggerId);
    if (!entry) return { ok: true };

    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
      entry.debounceTimer = null;
    }
    if (entry.observer && typeof entry.observer.disconnect === 'function') {
      entry.observer.disconnect();
    }
    detachFormValueListeners(entry);
    if (entry.leaf && entry.leaf.dataset && entry.leaf.dataset.fsbTriggerArmed === triggerId) {
      delete entry.leaf.dataset.fsbTriggerArmed;
    }
    registry.delete(triggerId);
    return { ok: true };
  }

  function start(triggerId, selector, extract, attrName) {
    if (!triggerId || !selector) {
      return { ok: false, reason: 'invalid_request' };
    }

    stop(triggerId);

    var leaf = resolveLeaf(selector);
    if (!leaf) {
      return { ok: false, reason: 'not_found' };
    }

    var container = stableAncestor(leaf);
    if (!container) {
      return { ok: false, reason: 'not_found' };
    }

    var entry = {
      observer: null,
      debounceTimer: null,
      container: container,
      leaf: leaf,
      selector: selector,
      extract: extract || 'text',
      attrName: attrName || null,
      formValueListener: null
    };

    entry.observer = new MutationObserver(function() {
      scheduleFlush(triggerId, entry);
    });

    entry.observer.observe(container, optsFor(entry.extract, entry.attrName));
    attachFormValueListeners(triggerId, entry);
    if (leaf.dataset) {
      leaf.dataset.fsbTriggerArmed = triggerId;
    }
    registry.set(triggerId, entry);
    return { ok: true };
  }

  function disconnectAll() {
    Array.from(registry.keys()).forEach(function(id) {
      stop(id);
    });
    return { ok: true };
  }

  window.addEventListener('beforeunload', disconnectAll);
  window.addEventListener('pagehide', function(e) {
    if (!e.persisted) disconnectAll();
  });

  FSB.triggerObserve = {
    start: start,
    stop: stop,
    disconnectAll: disconnectAll,
    optsFor: optsFor,
    readValue: readValue
  };

  if (window.FSB && window.FSB._modules) {
    window.FSB._modules['trigger-observe'] = { loaded: true, timestamp: Date.now() };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      DEBOUNCE_MS: DEBOUNCE_MS,
      registry: registry,
      start: start,
      stop: stop,
      disconnectAll: disconnectAll,
      optsFor: optsFor,
      readValue: readValue
    };
  }
})();
