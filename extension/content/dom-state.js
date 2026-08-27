// content/dom-state.js -- FSB DOM State Management
// DOMStateManager, ElementCache, RefMap classes and singletons.
// Depends on: content/init.js (FSB namespace), content/utils.js (shallowEqual)

(function() {
  if (window.__FSB_SKIP_INIT__) return;

  const FSB = window.FSB;
  const logger = FSB.logger;

  class DOMStateManager {
    constructor() {
      // Previous DOM state for comparison
      this.previousState = null;

      // Cache of elements by their hash
      this.elementCache = new Map();

      // Track mutations in real-time
      this.mutationObserver = null;
      this.pendingMutations = [];

      // Changed elements since last snapshot
      this.changedElements = new Set();

      // Configuration
      this.config = {
        maxUnchangedElements: 50, // Max unchanged elements to include
        importantSelectors: [
          'button', 'a[href]', 'input', 'textarea', 'select',
          '[role="button"]', '[onclick]', 'form', '[data-testid]'
        ],
        textTruncateLength: 100,
        enableMutationTracking: true
      };
    }

    /**
     * Initialize MutationObserver to track real-time DOM changes
     */
    initMutationObserver() {
      if (!this.config.enableMutationTracking) return;

      this.mutationObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          this.recordMutation(mutation);
        });
      });

      // PERFORMANCE: Observe with optimized config using attributeFilter
      // Only track attributes that actually matter for automation
      this.mutationObserver.observe(document.body, {
        childList: true,
        attributes: true,
        attributeOldValue: true,
        characterData: false, // Ignore text node changes (reduces callback noise)
        subtree: true,
        // PERFORMANCE: Only observe attributes that affect automation decisions
        attributeFilter: [
          'class', 'style', 'disabled', 'readonly', 'hidden',
          'aria-hidden', 'aria-expanded', 'aria-selected', 'aria-checked', 'aria-pressed',
          'aria-label', 'aria-describedby', 'aria-busy',
          'value', 'checked', 'selected', 'href', 'src', 'data-state',
          'data-testid', 'data-test-id', 'role', 'tabindex', 'contenteditable'
        ]
      });
    }

    /**
     * Record a DOM mutation for later processing
     */
    recordMutation(mutation) {
      this.pendingMutations.push({
        type: mutation.type,
        target: mutation.target,
        addedNodes: Array.from(mutation.addedNodes),
        removedNodes: Array.from(mutation.removedNodes),
        attributeName: mutation.attributeName,
        oldValue: mutation.oldValue
      });
    }

    /**
     * Generate a unique hash for element identification
     */
    hashElement(element) {
      // Structural-path fingerprint: uses DOM identity fields, NOT position or class
      // Position is scroll-dependent; class is framework-toggled (e.g. React, Tailwind)
      const type = element.type || '';
      const stableId = element.id || '';
      const testId = element.attributes?.['data-testid'] || '';
      const role = element.attributes?.role || '';
      const name = element.attributes?.name || '';
      const parentTag = element.context?.parentContext?.tag || '';
      const parentRole = element.context?.parentContext?.role || '';
      const formId = element.formId || '';
      const text = element.text ? element.text.substring(0, 30) : '';
      const hashStr = `${type}|${stableId}|${testId}|${role}|${name}|${parentTag}:${parentRole}|${formId}|${text}`;

      // Simple string hash that handles Unicode
      let hash = 0;
      for (let i = 0; i < hashStr.length; i++) {
        const char = hashStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }

      // Convert to base36 for shorter string and ensure positive
      return 'h' + Math.abs(hash).toString(36);
    }

    /**
     * Check if an element is important and should be included even if unchanged
     */
    isImportantElement(element) {
      // Interactive elements are always important
      if (element.isButton || element.isInput || element.isLink) return true;

      // Elements in viewport are important
      if (element.position?.inViewport) return true;

      // Elements with specific attributes
      if (element.attributes?.['data-testid'] || element.attributes?.['aria-label']) return true;

      // Form elements
      if (element.formId) return true;

      return false;
    }

    /**
     * Check if an element has changed between states
     */
    hasElementChanged(current, previous) {
      // Check text changes
      if (current.text !== previous.text) return true;

      // Position check removed: scroll causes viewport-relative position changes
      // that are not meaningful DOM mutations. Structural identity is handled by hashElement.

      // Check visibility changes
      if (current.visibility?.display !== previous.visibility?.display) return true;

      // Check interaction state changes (PERF: shallow compare instead of JSON.stringify)
      if (!FSB.shallowEqual(current.interactionState, previous.interactionState)) return true;

      // Check attribute changes (PERF: shallow compare instead of JSON.stringify)
      if (!FSB.shallowEqual(current.attributes, previous.attributes)) return true;

      return false;
    }

    /**
     * Compute diff between current and previous DOM states
     */
    computeDiff(currentDOM) {
      const diff = {
        added: [],
        removed: [],
        modified: [],
        unchanged: [],
        metadata: {
          totalElements: currentDOM.elements?.length || 0,
          previousElements: this.previousState?.elements?.length || 0,
          changeRatio: 0
        }
      };

      // First time - return full DOM
      if (!this.previousState) {
        this.updateState(currentDOM);
        return {
          ...diff,
          added: currentDOM.elements || [],
          isInitial: true
        };
      }

      // Create current element map
      const currentElementMap = new Map();
      (currentDOM.elements || []).forEach(element => {
        const hash = this.hashElement(element);
        currentElementMap.set(hash, element);
      });

      // Find added and modified elements
      currentElementMap.forEach((element, hash) => {
        const previousElement = this.elementCache.get(hash);

        if (!previousElement) {
          diff.added.push(element);
        } else if (this.hasElementChanged(element, previousElement)) {
          diff.modified.push({
            ...element,
            _changes: this.getElementChanges(element, previousElement)
          });
        } else if (this.isImportantElement(element)) {
          // Include important unchanged elements (limited number)
          if (diff.unchanged.length < this.config.maxUnchangedElements) {
            diff.unchanged.push(element);
          }
        }
      });

      // Find removed elements
      this.elementCache.forEach((element, hash) => {
        if (!currentElementMap.has(hash)) {
          diff.removed.push({
            ...element,
            _wasAt: { x: element.position?.x, y: element.position?.y }
          });
        }
      });

      // Calculate change metrics
      const totalChanges = diff.added.length + diff.removed.length + diff.modified.length;
      diff.metadata.changeRatio = totalChanges / Math.max(diff.metadata.totalElements, 1);
      diff.metadata.addedCount = diff.added.length;
      diff.metadata.removedCount = diff.removed.length;
      diff.metadata.modifiedCount = diff.modified.length;

      // Update state for next comparison
      this.updateState(currentDOM);

      return diff;
    }

    /**
     * Get specific changes between two element states
     */
    getElementChanges(current, previous) {
      const changes = {};

      if (current.text !== previous.text) {
        changes.text = { old: previous.text, new: current.text };
      }

      if (current.position?.x !== previous.position?.x || current.position?.y !== previous.position?.y) {
        changes.position = {
          old: { x: previous.position?.x, y: previous.position?.y },
          new: { x: current.position?.x, y: current.position?.y }
        };
      }

      // PERF: shallow compare instead of JSON.stringify
      if (!FSB.shallowEqual(current.attributes, previous.attributes)) {
        changes.attributes = {
          old: previous.attributes,
          new: current.attributes
        };
      }

      return changes;
    }

    /**
     * Update internal state with new DOM snapshot
     */
    updateState(currentDOM) {
      this.previousState = currentDOM;

      // Update element cache
      this.elementCache.clear();
      (currentDOM.elements || []).forEach(element => {
        const hash = this.hashElement(element);
        this.elementCache.set(hash, element);
      });

      // Clear pending mutations
      this.pendingMutations = [];
      this.changedElements.clear();
    }

    /**
     * Generate optimized DOM payload for AI
     * PERFORMANCE FIX: Compare delta vs full size and use smaller one
     */
    generateOptimizedPayload(currentDOM) {
      logger.logDOMOperation(FSB.sessionId, 'compute_diff', { phase: 'start' });
      const diff = this.computeDiff(currentDOM);

      // Log diff statistics
      logger.logDOMOperation(FSB.sessionId, 'diff_computed', {
        isInitial: diff.isInitial || false,
        added: diff.added.length,
        removed: diff.removed.length,
        modified: diff.modified.length,
        unchanged: diff.unchanged.length,
        changeRatio: (diff.metadata.changeRatio * 100).toFixed(1) + '%'
      });

      // For initial load, return filtered full DOM
      if (diff.isInitial) {
        logger.logDOMOperation(FSB.sessionId, 'initial_capture', { reason: 'no_previous_state' });
        const payload = {
          type: 'initial',
          elements: this.filterAndCompressElements(diff.added),
          htmlContext: this.compressHTMLContext(currentDOM.htmlContext),
          metadata: {
            totalElements: diff.metadata.totalElements,
            includedElements: diff.added.length
          }
        };
        logger.logDOMOperation(FSB.sessionId, 'initial_payload', { elementCount: payload.elements.length });
        return payload;
      }

      // PERFORMANCE FIX: Build both delta and compact full payloads, use smaller one
      // Build delta payload
      const deltaPayload = {
        type: 'delta',
        changes: {
          added: this.filterAndCompressElements(diff.added),
          removed: diff.removed.map(el => ({
            elementId: el.elementId,
            selector: el.selectors?.[0],
            _wasAt: el._wasAt
          })),
          modified: this.filterAndCompressElements(diff.modified)
        },
        context: {
          unchanged: this.filterAndCompressElements(diff.unchanged, true), // Heavy compression
          metadata: diff.metadata
        }
      };

      // Include updated HTML context only if significant changes
      if (diff.metadata.changeRatio > 0.3) {
        deltaPayload.htmlContext = this.compressHTMLContext(currentDOM.htmlContext);
      }

      // Build compact full payload (just essential elements for AI)
      const compactFullPayload = {
        type: 'compact_full',
        elements: this.filterAndCompressElements(
          (currentDOM.elements || [])
            .filter(el => el.position?.inViewport)
            .slice(0, 100), // Limit to top 100 most relevant elements
          false
        ),
        htmlContext: this.compressHTMLContext(currentDOM.htmlContext),
        metadata: {
          totalElements: currentDOM.elements?.length || 0,
          includedElements: Math.min(100, currentDOM.elements?.length || 0)
        }
      };

      // Compare sizes and use smaller payload
      const deltaSize = JSON.stringify(deltaPayload).length;
      const compactFullSize = JSON.stringify(compactFullPayload).length;

      logger.logDOMOperation(FSB.sessionId, 'payload_comparison', {
        deltaSize,
        compactFullSize,
        winner: deltaSize < compactFullSize ? 'DELTA' : 'COMPACT_FULL',
        savings: Math.abs(deltaSize - compactFullSize)
      });

      // Use whichever is smaller (with 20% margin to prefer delta for consistency)
      if (deltaSize < compactFullSize * 0.8) {
        logger.logDOMOperation(FSB.sessionId, 'using_delta', { reason: 'smaller_payload' });
        return deltaPayload;
      } else {
        logger.logDOMOperation(FSB.sessionId, 'using_compact_full', { reason: 'smaller_or_similar' });
        return compactFullPayload;
      }
    }

    /**
     * Filter and compress elements for smaller payload
     */
    filterAndCompressElements(elements, heavyCompression = false) {
      return elements.map(el => {
        const compressed = {
          elementId: el.elementId,
          type: el.type,
          selectors: el.selectors?.slice(0, 2) // Limit selectors
        };

        // Add essential properties
        if (el.text) {
          compressed.text = el.text.substring(0, heavyCompression ? 50 : this.config.textTruncateLength);
        }

        if (!heavyCompression) {
          // Include more details for changed elements
          if (el.id) compressed.id = el.id;
          if (el.class) compressed.class = el.class.split(' ').slice(0, 3).join(' ');
          if (el.position?.inViewport) compressed.inViewport = true;
          if (el.attributes?.['data-testid']) compressed.testId = el.attributes['data-testid'];
          if (el._changes) compressed._changes = el._changes;

          // Include interaction properties
          if (el.isButton || el.isInput || el.isLink) {
            compressed.interactive = true;
            if (el.href) compressed.href = el.href;
            if (el.inputType) compressed.inputType = el.inputType;
          }
        }

        return compressed;
      });
    }

    /**
     * Compress HTML context for smaller payload
     */
    compressHTMLContext(htmlContext) {
      if (!htmlContext) return null;

      const compressed = {};

      if (htmlContext.pageStructure) {
        compressed.page = {
          title: htmlContext.pageStructure.title,
          url: htmlContext.pageStructure.url
        };

        // Include only form structure
        if (htmlContext.pageStructure.forms?.length > 0) {
          compressed.forms = htmlContext.pageStructure.forms.map(form => ({
            id: form.id,
            fields: form.fields?.length || 0
          }));
        }
      }

      return compressed;
    }

    /**
     * Reset state (useful for navigation)
     */
    reset() {
      this.previousState = null;
      this.elementCache.clear();
      this.pendingMutations = [];
      this.changedElements.clear();

      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
      }
    }

    /**
     * Cleanup resources
     */
    destroy() {
      this.reset();
      this.mutationObserver = null;
    }
  }

  // Initialize DOM state manager singleton
  const domStateManager = new DOMStateManager();

  /**
   * ElementCache - Caches element lookups with MutationObserver invalidation
   * Uses WeakRef for automatic cleanup when elements are garbage collected
   * SPEED-04: Reduces repeated DOM queries within same page state
   */
  const DEFAULT_ELEMENT_CACHE_SIZE = 200;

  class ElementCache {
    constructor(maxCacheSize = DEFAULT_ELEMENT_CACHE_SIZE) {
      this.cache = new Map(); // selector -> { ref: WeakRef(element), version: number, timestamp: number }
      this.stateVersion = 0;
      this.observer = null;
      this.maxCacheSize = maxCacheSize;
    }

    /**
     * Initialize MutationObserver to track DOM changes
     */
    initialize() {
      if (this.observer) return; // Already initialized

      this.observer = new MutationObserver((mutations) => {
        // Invalidate cache on structural changes or high mutation count
        if (mutations.length > 20 || this.hasStructuralChange(mutations)) {
          this.invalidate();
        }
      });

      // Wait for body to be available
      if (document.body) {
        this.observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'id', 'disabled', 'hidden', 'style']
        });
      }
    }

    /**
     * Check if any mutation is a structural change (added/removed nodes)
     * @param {MutationRecord[]} mutations - Array of mutation records
     * @returns {boolean} True if structural change detected
     */
    hasStructuralChange(mutations) {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
          return true;
        }
      }
      return false;
    }

    /**
     * Get cached element for selector
     * @param {string} selector - CSS selector
     * @returns {Element|null} Cached element or null if not found/invalid
     */
    get(selector) {
      const entry = this.cache.get(selector);
      if (!entry) return null;

      // Check version matches current state
      if (entry.version !== this.stateVersion) {
        this.cache.delete(selector);
        return null;
      }

      // Dereference WeakRef and verify element is still connected
      const element = entry.ref.deref();
      if (!element || !element.isConnected) {
        this.cache.delete(selector);
        return null;
      }

      return element;
    }

    /**
     * Cache element for selector
     * @param {string} selector - CSS selector
     * @param {Element} element - DOM element to cache
     */
    set(selector, element) {
      if (!element) return;

      // Evict oldest entries if cache is full
      if (this.cache.size >= this.maxCacheSize) {
        // Remove oldest entry (first in Map iteration order)
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      this.cache.set(selector, {
        ref: new WeakRef(element),
        version: this.stateVersion,
        timestamp: Date.now()
      });
    }

    /**
     * Invalidate entire cache (called on significant DOM changes)
     */
    invalidate() {
      this.cache.clear();
      this.stateVersion++;
    }

    /**
     * Cleanup and disconnect observer
     */
    destroy() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      this.cache.clear();
    }
  }

  // Global element cache singleton
  const elementCache = new ElementCache(DEFAULT_ELEMENT_CACHE_SIZE);

  function applyElementCacheSize(value) {
    if (!Number.isFinite(Number(value))) return;
    const newSize = Math.max(10, Math.min(1000, Number(value)));
    if (newSize === elementCache.maxCacheSize) return;
    elementCache.maxCacheSize = newSize;
    if (elementCache.cache.size > newSize) elementCache.invalidate();
  }

  // Configuration is projected by the background through one fixed bridge.
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
    try {
      chrome.runtime.sendMessage({ action: 'fsb:element-cache-config-get' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.ok === true) applyElementCacheSize(response.elementCacheSize);
      });
    } catch (_error) {
      // Keep the bounded default when the extension context is unavailable.
    }

    if (chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
      chrome.runtime.onMessage.addListener((message) => {
        if (!message || typeof message !== 'object' || Array.isArray(message)) return;
        const keys = Object.keys(message).sort();
        if (keys.length !== 2 || keys[0] !== 'action' || keys[1] !== 'elementCacheSize') return;
        if (message.action !== 'fsb:element-cache-config-changed') return;
        applyElementCacheSize(message.elementCacheSize);
      });
    }
  }

  // ============================================================================
  // COMPACT ELEMENT REFERENCES - RefMap for token-efficient AI communication
  // ============================================================================

  /**
   * RefMap - Maps compact refs (e1, e2, ...) to DOM elements for AI communication
   * Uses WeakRef to prevent memory leaks when DOM elements are garbage-collected.
   * Each generateCompactSnapshot() call resets and rebuilds the map.
   */
  class RefMap {
    constructor() {
      this.map = new Map();    // ref -> { element: WeakRef, selector, role, name }
      this.counter = 0;
      this.generationId = 0;
      this.generationUrl = '';
    }

    reset() {
      this.map.clear();
      this.counter = 0;
      this.generationId++;
    }

    register(element, selector, role, name) {
      this.counter++;
      const ref = `e${this.counter}`;
      this.map.set(ref, {
        element: new WeakRef(element),
        selector,
        role: role || 'generic',
        name: name || ''
      });
      return ref;
    }

    resolve(ref) {
      const entry = this.map.get(ref);
      if (!entry) return null;
      const el = entry.element.deref();
      if (!el || !el.isConnected) return { element: null, selector: entry.selector, stale: true };
      return { element: el, selector: entry.selector, stale: false };
    }

    getInfo(ref) {
      const entry = this.map.get(ref);
      return entry ? { role: entry.role, name: entry.name, selector: entry.selector } : null;
    }

    get size() { return this.map.size; }
  }

  const refMap = new RefMap();

  /**
   * Check if the document is fully ready for interaction
   * Provides detailed readiness state for smart page load detection
   * @returns {Object} Readiness state with details
   */
  function checkDocumentReady() {
    const state = {
      readyState: document.readyState,
      isComplete: document.readyState === 'complete',
      isInteractive: document.readyState !== 'loading',
      hasBody: !!document.body,
      bodyHasContent: document.body?.children?.length > 0,

      // Check for common loading indicators
      isLoading: !!document.querySelector(
        '[class*="loading"], [class*="spinner"], [aria-busy="true"], ' +
        '.loader, .skeleton, [data-loading="true"], .is-loading, ' +
        '.MuiCircularProgress-root, .ant-spin, .el-loading-mask'
      ),

      // Check for blocking overlays
      hasBlockingOverlay: false,

      // Network activity (if Performance API available)
      pendingResources: 0,

      // Additional context
      url: window.location.href,
      timestamp: Date.now()
    };

    // Check for visible blocking overlays
    const overlaySelectors = [
      '.overlay:not([style*="display: none"]):not([style*="display:none"])',
      '.modal-backdrop:not([style*="display: none"])',
      '[class*="loading-overlay"]:not([style*="display: none"])',
      '.loading-mask:not([style*="display: none"])',
      '[class*="page-loader"]:not([style*="display: none"])'
    ];

    for (const selector of overlaySelectors) {
      try {
        const overlay = document.querySelector(selector);
        if (overlay) {
          const rect = overlay.getBoundingClientRect();
          const styles = window.getComputedStyle(overlay);
          // Only count as blocking if visible and covers significant area
          if (rect.width > 100 && rect.height > 100 &&
              styles.display !== 'none' &&
              styles.visibility !== 'hidden' &&
              parseFloat(styles.opacity) > 0.1) {
            state.hasBlockingOverlay = true;
            break;
          }
        }
      } catch (e) {
        // Ignore selector errors
      }
    }

    // Check for pending resources via Performance API
    if (window.performance && window.performance.getEntriesByType) {
      try {
        const resources = window.performance.getEntriesByType('resource');
        // Count resources that haven't finished loading
        state.pendingResources = resources.filter(r =>
          r.responseEnd === 0 || r.duration === 0
        ).length;
      } catch (e) {
        // Performance API might not be available
      }
    }

    // Determine overall readiness
    state.isReady = state.isComplete &&
                    state.hasBody &&
                    state.bodyHasContent &&
                    !state.isLoading &&
                    !state.hasBlockingOverlay;

    return state;
  }

  // Legacy DOM state cache for backward compatibility
  let previousDOMState = null;
  let domStateCache = new Map();

  // PERF: Pre-built element type indexes for faster fallback selector matching
  // Rebuilt on demand and invalidated by DOM mutations
  let _elementIndexes = null;
  let _elementIndexTimestamp = 0;
  const _ELEMENT_INDEX_TTL = 2000; // 2 seconds -- invalidated faster than a full iteration

  function getElementIndexes() {
    const now = Date.now();
    if (_elementIndexes && (now - _elementIndexTimestamp) < _ELEMENT_INDEX_TTL) {
      return _elementIndexes;
    }
    _elementIndexes = {
      clickable: document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a.btn, a.button'),
      input: document.querySelectorAll('input, textarea, [contenteditable="true"]'),
      link: document.querySelectorAll('a[href]')
    };
    _elementIndexTimestamp = now;
    return _elementIndexes;
  }

  function invalidateElementIndexes() {
    _elementIndexes = null;
    _elementIndexTimestamp = 0;
  }

  // Attach classes and singletons to namespace
  FSB.DOMStateManager = DOMStateManager;
  FSB.domStateManager = domStateManager;
  FSB.ElementCache = ElementCache;
  FSB.elementCache = elementCache;
  FSB.RefMap = RefMap;
  FSB.refMap = refMap;
  FSB.checkDocumentReady = checkDocumentReady;
  FSB.previousDOMState = previousDOMState;
  FSB.domStateCache = domStateCache;
  FSB.getElementIndexes = getElementIndexes;
  FSB.invalidateElementIndexes = invalidateElementIndexes;

  window.FSB._modules['dom-state'] = { loaded: true, timestamp: Date.now() };
})();
