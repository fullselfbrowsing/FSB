// content/utils.js -- FSB Utility Functions
// Basic utility functions used across all content modules.
// Depends on: content/init.js (window.FSB namespace, __FSB_SKIP_INIT__ guard)

(function() {
  if (window.__FSB_SKIP_INIT__) return;

  const FSB = window.FSB;
  const logger = FSB.logger;

  // currentSessionId is now FSB.sessionId (initialized in init.js)

  /**
   * Safely extract className as a string from any element.
   * SVG elements have className as SVGAnimatedString (object), not a string.
   * Calling string methods on it throws TypeError and crashes the content script.
   * @param {Element} element - DOM element
   * @returns {string} The className as a plain string
   */
  function getClassName(element) {
    if (!element) return '';
    const cn = element.className;
    if (typeof cn === 'string') return cn;
    if (cn && typeof cn.baseVal === 'string') return cn.baseVal;
    return '';
  }

  /**
   * Strip invisible Unicode control/bidirectional characters from a string.
   * Gmail and other apps embed chars like U+202A (LRE), U+202C (PDF) in aria-labels
   * (e.g., "Send \u202a(Cmd+Enter)\u202c") which break CSS selector matching.
   * @param {string} str - Input string
   * @returns {string} Cleaned string with control chars removed
   */
  function stripUnicodeControl(str) {
    if (!str) return str;
    // U+200B-200F: zero-width/directional marks
    // U+202A-202E: bidirectional embedding/override/pop
    // U+2060-2069: word joiner, invisible separators, bidi isolates
    // U+FEFF: byte order mark / zero-width no-break space
    // U+00AD: soft hyphen
    return str.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00AD]/g, '');
  }

  /**
   * Find an element by matching its aria-label after stripping Unicode control chars.
   * Fallback for when document.querySelector() fails because the selector contains
   * clean text but the actual DOM attribute has invisible Unicode chars (or vice versa).
   * @param {string} selectorStr - The full CSS selector string containing aria-label
   * @returns {Element|null} Matching element or null
   */
  function findElementByNormalizedAriaLabel(selectorStr) {
    // Extract the aria-label value and operator from the selector
    // Supports: [aria-label="..."], [aria-label*="..."], [aria-label^="..."], [aria-label$="..."]
    const match = selectorStr.match(/\[aria-label([*^$]?)=["'](.+?)["']\]/);
    if (!match) return null;

    const operator = match[1];
    const searchValue = stripUnicodeControl(match[2]).trim().toLowerCase();
    if (!searchValue) return null;

    // Also extract any tag name prefix (e.g., "button" from "button[aria-label...]")
    const tagMatch = selectorStr.match(/^([a-zA-Z]+)\[aria-label/);
    const tagFilter = tagMatch ? tagMatch[1].toUpperCase() : null;

    const candidates = document.querySelectorAll('[aria-label]');
    for (const el of candidates) {
      if (tagFilter && el.tagName !== tagFilter) continue;
      const raw = el.getAttribute('aria-label');
      const cleaned = stripUnicodeControl(raw).trim().toLowerCase();
      let matches = false;
      switch (operator) {
        case '*': matches = cleaned.includes(searchValue); break;
        case '^': matches = cleaned.startsWith(searchValue); break;
        case '$': matches = cleaned.endsWith(searchValue); break;
        default:  matches = cleaned === searchValue; break;
      }
      if (matches) return el;
    }
    return null;
  }

  /**
   * Check if an element belongs to the FSB overlay (crossing shadow DOM boundaries).
   * element.closest() does NOT cross shadow DOM boundaries, so we also check getRootNode().
   * @param {Element} el - DOM element to check
   * @returns {boolean} True if element is part of the FSB overlay
   */
  const FSB_HOST_IDS = new Set([
    'fsb-progress-host',
    'fsb-viewport-glow-host',
    'fsb-action-glow-host',
    'fsb-inspector-overlay',
    'fsb-inspector-panel',
    'fsb-inspector-indicator'
  ]);

  function isFsbElement(el) {
    if (!el) return false;
    if (FSB_HOST_IDS.has(el.id)) return true;
    if (el.hasAttribute?.('data-fsb-id')) return true;
    // Walk up to check if any ancestor is an FSB host
    if (el.closest) {
      for (const id of FSB_HOST_IDS) {
        if (el.closest(`#${id}`)) return true;
      }
    }
    // Check shadow DOM boundary - element may be inside a shadow root whose host is FSB
    const root = el.getRootNode?.();
    if (root && root !== document && root.host && FSB_HOST_IDS.has(root.host.id)) return true;
    return false;
  }

  /**
   * Return an element's shadow root, closed ones included. chrome.dom gives
   * extension content scripts access to closed roots; without it only open
   * roots are visible.
   * @param {Element} element
   * @returns {ShadowRoot|null}
   */
  function openOrClosedShadowRoot(element) {
    if (!element) return null;
    try {
      const root = globalThis.chrome?.dom?.openOrClosedShadowRoot?.(element);
      if (root) return root;
    } catch (_error) {
      // chrome.dom accepts HTML elements only.
    }
    return element.shadowRoot || null;
  }

  /**
   * document.elementFromPoint stops at the outermost shadow host. Follow the
   * point into each shadow root to the element that is actually under it.
   * @param {number} x - Viewport x
   * @param {number} y - Viewport y
   * @returns {Element|null}
   */
  function deepElementFromPoint(x, y) {
    let hit = document.elementFromPoint(x, y);
    let root = openOrClosedShadowRoot(hit);
    while (root) {
      const inner = root.elementFromPoint(x, y);
      if (!inner || inner === hit) break;
      hit = inner;
      root = openOrClosedShadowRoot(hit);
    }
    return hit;
  }

  /**
   * Node.contains() stops at shadow boundaries. Walk up the composed tree
   * instead, treating slotted content as inside the slot that shows it.
   * @param {Node} ancestor
   * @param {Node} node
   * @returns {boolean}
   */
  function composedContains(ancestor, node) {
    for (let current = node; current; current = current.assignedSlot || current.parentNode || current.host) {
      if (current === ancestor) return true;
    }
    return false;
  }

  /**
   * PERF: Lightweight shallow object equality check.
   * Replaces JSON.stringify(a) !== JSON.stringify(b) for small flat objects
   * like interactionState and attributes. Avoids full serialization overhead.
   */
  function shallowEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return a === b;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) {
      const key = keysA[i];
      if (a[key] !== b[key]) return false;
    }
    return true;
  }

  // Attach all exports to FSB namespace
  FSB.getClassName = getClassName;
  FSB.stripUnicodeControl = stripUnicodeControl;
  FSB.findElementByNormalizedAriaLabel = findElementByNormalizedAriaLabel;
  FSB.FSB_HOST_IDS = FSB_HOST_IDS;
  FSB.isFsbElement = isFsbElement;
  FSB.openOrClosedShadowRoot = openOrClosedShadowRoot;
  FSB.deepElementFromPoint = deepElementFromPoint;
  FSB.composedContains = composedContains;
  FSB.shallowEqual = shallowEqual;

  window.FSB._modules['utils'] = { loaded: true, timestamp: Date.now() };
})();
