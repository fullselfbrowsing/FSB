// content/lifecycle.js -- MutationObserver, SPA navigation detection, background port, collectExplorerData
// Depends on: init.js, utils.js, dom-state.js, visual-feedback.js, messaging.js, dom-analysis.js
(function() {
  if (window.__FSB_SKIP_INIT__) return;

  const FSB = window.FSB;
  const logger = FSB.logger;

  // ============================================================================
  // SITE EXPLORER DATA COLLECTION
  // ============================================================================

  function collectExplorerData() {
    return {
      navigation: explorerExtractNavigation(),
      headings: explorerExtractHeadings(),
      layout: explorerDetectLayout(),
      internalLinks: explorerExtractInternalLinks(),
      loadingPatterns: explorerDetectLoadingPatterns(),
      keySelectors: explorerExtractKeySelectors()
    };
  }

  function explorerBuildSelector(el) {
    if (!el || !el.tagName) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    const testId = el.getAttribute('data-testid');
    if (testId) return '[data-testid="' + testId + '"]';
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.length < 60) {
      return el.tagName.toLowerCase() + '[aria-label="' + CSS.escape(ariaLabel) + '"]';
    }
    const tag = el.tagName.toLowerCase();
    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
      if (siblings.length === 1 && parent.id) {
        return '#' + CSS.escape(parent.id) + ' > ' + tag;
      }
      const index = siblings.indexOf(el) + 1;
      return tag + ':nth-of-type(' + index + ')';
    }
    return tag;
  }

  function explorerExtractNavigation() {
    const navs = [];
    const navElements = document.querySelectorAll('nav, [role="navigation"]');
    navElements.forEach((nav, idx) => {
      const links = Array.from(nav.querySelectorAll('a[href]'));
      navs.push({
        type: 'nav',
        selector: nav.id ? '#' + nav.id : 'nav:nth-of-type(' + (idx + 1) + ')',
        ariaLabel: nav.getAttribute('aria-label') || '',
        items: links.slice(0, 50).map(a => ({
          text: (a.textContent || '').trim().substring(0, 100),
          href: a.href,
          selector: explorerBuildSelector(a)
        }))
      });
    });
    const menus = document.querySelectorAll('[role="menu"], [role="menubar"]');
    menus.forEach(menu => {
      const items = Array.from(menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]'));
      navs.push({
        type: 'menu',
        selector: explorerBuildSelector(menu),
        items: items.slice(0, 30).map(item => ({
          text: (item.textContent || '').trim().substring(0, 100),
          href: item.href || '',
          selector: explorerBuildSelector(item)
        }))
      });
    });
    const breadcrumbs = document.querySelectorAll('[aria-label*="breadcrumb" i], .breadcrumb, .breadcrumbs, nav.breadcrumb');
    breadcrumbs.forEach(bc => {
      const links = Array.from(bc.querySelectorAll('a[href], [aria-current]'));
      if (links.length > 0) {
        navs.push({
          type: 'breadcrumb',
          selector: explorerBuildSelector(bc),
          items: links.map(a => ({
            text: (a.textContent || '').trim().substring(0, 100),
            href: a.href || '',
            selector: explorerBuildSelector(a)
          }))
        });
      }
    });
    return navs;
  }

  function explorerExtractHeadings() {
    const headings = [];
    document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
      const text = (el.textContent || '').trim();
      if (text) {
        headings.push({
          level: parseInt(el.tagName.charAt(1)),
          text: text.substring(0, 200),
          id: el.id || '',
          selector: explorerBuildSelector(el)
        });
      }
    });
    return headings;
  }

  function explorerDetectLayout() {
    const layout = {};
    const regions = {
      header: 'header, [role="banner"]',
      footer: 'footer, [role="contentinfo"]',
      sidebar: 'aside, [role="complementary"]',
      main: 'main, [role="main"]',
      search: '[role="search"]',
      form: '[role="form"]'
    };
    for (const [name, selector] of Object.entries(regions)) {
      const el = document.querySelector(selector);
      if (el) {
        layout[name] = {
          exists: true,
          selector: explorerBuildSelector(el),
          tagName: el.tagName.toLowerCase(),
          id: el.id || '',
          className: (el.className || '').toString().substring(0, 100)
        };
      } else {
        layout[name] = { exists: false };
      }
    }
    return layout;
  }

  function explorerExtractInternalLinks() {
    const currentHost = window.location.hostname;
    const seen = new Set();
    const links = [];

    function processElement(el, href) {
      if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return;
      try {
        const parsed = new URL(href, window.location.origin);
        if (parsed.hostname !== currentHost) return;
        const normalized = parsed.origin + parsed.pathname.replace(/\/$/, '') + parsed.search;
        if (seen.has(normalized)) return;
        seen.add(normalized);
        links.push({
          url: normalized,
          text: (el.textContent || '').trim().substring(0, 100),
          selector: explorerBuildSelector(el)
        });
      } catch (e) {
        // Invalid URL, skip
      }
    }

    // Standard <a href> links
    document.querySelectorAll('a[href]').forEach(a => {
      processElement(a, a.href);
    });

    // [role="link"] elements (LinkedIn, SPAs)
    document.querySelectorAll('[role="link"]').forEach(el => {
      const href = el.getAttribute('href') || el.getAttribute('data-href') || el.getAttribute('data-url');
      if (href) {
        processElement(el, href);
      }
    });

    return links;
  }

  function explorerDetectLoadingPatterns() {
    const patterns = [];
    document.querySelectorAll('[aria-busy="true"]').forEach(el => {
      patterns.push({ type: 'aria-busy', selector: explorerBuildSelector(el) });
    });
    const spinnerSelectors = [
      '.spinner', '.loader', '.loading', '.skeleton',
      '[class*="spinner"]', '[class*="loader"]', '[class*="loading"]', '[class*="skeleton"]',
      '.progress', '[role="progressbar"]'
    ];
    for (const sel of spinnerSelectors) {
      document.querySelectorAll(sel).forEach(el => {
        if (el.offsetParent !== null) {
          patterns.push({ type: 'spinner/loader', selector: explorerBuildSelector(el), className: (el.className || '').toString().substring(0, 80) });
        }
      });
    }
    return patterns;
  }

  function explorerExtractKeySelectors() {
    const selectors = [];
    document.querySelectorAll('[data-testid]').forEach(el => {
      selectors.push({
        selector: '[data-testid="' + el.getAttribute('data-testid') + '"]',
        elementType: el.tagName.toLowerCase(),
        purpose: 'test-id',
        reliability: 'high'
      });
    });
    document.querySelectorAll('[id]').forEach(el => {
      const id = el.id;
      if (id && !/^[0-9]|^:/.test(id) && id.length < 60 && !/^\w{20,}$/.test(id)) {
        const tagName = el.tagName.toLowerCase();
        if (['button', 'input', 'select', 'textarea', 'form', 'a', 'nav', 'main', 'header', 'footer'].includes(tagName)) {
          selectors.push({
            selector: '#' + CSS.escape(id),
            elementType: tagName,
            purpose: 'unique-id',
            reliability: 'high'
          });
        }
      }
    });
    document.querySelectorAll('[aria-label]').forEach(el => {
      const label = el.getAttribute('aria-label');
      if (label && label.length < 80) {
        selectors.push({
          selector: '[aria-label="' + CSS.escape(label) + '"]',
          elementType: el.tagName.toLowerCase(),
          purpose: 'aria-label',
          reliability: 'medium'
        });
      }
    });
    return selectors.slice(0, 200);
  }

  // ============================================================================
  // DIRECT LOGIN HANDLER (Passwords Beta)
  // ============================================================================

  async function executeDirectLogin({ usernameSelector, passwordSelector, submitSelector, username, password }) {
    let filledUsername = false;
    let filledPassword = false;

    function findElement(selector) {
      if (!selector) return null;
      try {
        return document.querySelector(selector);
      } catch {
        return null;
      }
    }

    function setInputValue(el, value) {
      if (!el || !value) return false;
      el.focus();
      el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, value);
      } else {
        el.value = value;
      }

      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      return true;
    }

    // Fill username
    if (usernameSelector && username) {
      const usernameEl = findElement(usernameSelector);
      if (usernameEl) {
        filledUsername = setInputValue(usernameEl, username);
      } else {
        const fallbackSelectors = [
          'input[type="email"]',
          'input[name="email"]',
          'input[name="username"]',
          'input[name="login"]',
          'input[type="text"][autocomplete="username"]',
          'input[type="text"][autocomplete*="user"]',
          'input[type="text"][name*="user"]',
          'input[type="text"][name*="login"]'
        ];
        for (const sel of fallbackSelectors) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            filledUsername = setInputValue(el, username);
            if (filledUsername) break;
          }
        }
      }
    }

    // Fill password
    if (passwordSelector && password) {
      const passwordEl = findElement(passwordSelector);
      if (passwordEl) {
        filledPassword = setInputValue(passwordEl, password);
      } else {
        const el = document.querySelector('input[type="password"]');
        if (el && el.offsetParent !== null) {
          filledPassword = setInputValue(el, password);
        }
      }
    }

    // Click submit button
    if (submitSelector || filledUsername || filledPassword) {
      await new Promise(r => setTimeout(r, 200));

      const submitEl = findElement(submitSelector);
      if (submitEl) {
        submitEl.click();
      } else {
        const fallbackSubmit = [
          'button[type="submit"]',
          'input[type="submit"]',
          'button[name="login"]',
          'button[name="submit"]'
        ];
        for (const sel of fallbackSubmit) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            el.click();
            break;
          }
        }
      }
    }

    return { success: true, filledUsername, filledPassword };
  }

  // ============================================================================
  // DOM MUTATION OBSERVER
  // ============================================================================

  // Intelligent DOM change filtering
  let lastNotificationTime = 0;
  let accumulatedChanges = 0;
  let significantChangeTimeout = null;

  // Helper to check if mutation is significant
  function isSignificantMutation(mutation) {
    // Ignore pure style changes
    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
      return false;
    }

    // Ignore changes to invisible elements
    if (mutation.target.nodeType === Node.ELEMENT_NODE) {
      const styles = window.getComputedStyle(mutation.target);
      if (styles.display === 'none' || styles.visibility === 'hidden') {
        return false;
      }
    }

    // Ignore changes in script/style tags
    if (mutation.target.tagName === 'SCRIPT' || mutation.target.tagName === 'STYLE') {
      return false;
    }

    // Ignore attribute changes on non-interactive elements
    if (mutation.type === 'attributes' &&
        !['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA'].includes(mutation.target.tagName)) {
      const importantAttrs = ['id', 'class', 'data-testid', 'aria-label', 'href', 'src'];
      if (!importantAttrs.includes(mutation.attributeName)) {
        return false;
      }
    }

    return true;
  }

  // Set up mutation observer for dynamic content
  const observer = new MutationObserver((mutations) => {
    // Filter out insignificant mutations
    const significantMutations = mutations.filter(isSignificantMutation);

    if (significantMutations.length === 0) return;

    accumulatedChanges += significantMutations.length;

    // Clear existing timeout
    if (significantChangeTimeout) {
      clearTimeout(significantChangeTimeout);
    }

    // Batch DOM change notifications
    significantChangeTimeout = setTimeout(() => {
      const now = Date.now();
      const timeSinceLastNotification = now - lastNotificationTime;

      // Only notify if we have significant changes and enough time has passed
      if (accumulatedChanges > 5 && timeSinceLastNotification > 1000) {
        logger.logDOMOperation(FSB.sessionId, 'significant_changes', { changeCount: accumulatedChanges });

        chrome.runtime.sendMessage({
          action: 'domChanged',
          changeCount: accumulatedChanges,
          significantChanges: true
        });

        lastNotificationTime = now;
        accumulatedChanges = 0;
      }
    }, 500); // Wait 500ms to batch changes
  });

  // Start observing - with null check for fast-loading pages
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });
    logger.logInit('mutation_observer', 'started', { target: 'document.body' });
    // Initialize element cache observer
    FSB.elementCache.initialize();
  } else {
    // Body not ready yet, wait for it
    logger.logInit('mutation_observer', 'waiting', { reason: 'document.body not ready' });
    const startObserver = () => {
      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true
        });
        logger.logInit('mutation_observer', 'started_after_dom', {});
        FSB.elementCache.initialize();
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver);
    } else {
      setTimeout(startObserver, 100);
    }
  }

  logger.logInit('content_script', 'loaded', { version: chrome?.runtime?.getManifest?.().version || 'unknown', url: window.location.href });

  // ============================================================================
  // SPA NAVIGATION DETECTION
  // ============================================================================

  // Google-specific SPA navigation detection
  if (window.location.hostname.includes('google.com')) {
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      chrome.runtime.sendMessage({
        action: 'spaNavigation',
        url: args[2],
        method: 'pushState'
      }).catch((err) => {
        try {
          if (typeof automationLogger !== 'undefined' && automationLogger && typeof automationLogger.debug === 'function') {
            automationLogger.debug('[FSB DOM] SPA navigation sendMessage failed', {
              method: 'pushState',
              err: (typeof redactForLog === 'function') ? redactForLog(err) : { kind: 'error', message: err && err.message ? err.message : '' }
            });
          }
          if (typeof logDebugToRing === 'function') {
            logDebugToRing('DOM', 'spa-navigation', 'SPA navigation sendMessage failed', { method: 'pushState' });
          }
        } catch (loggerErr) { /* logger missing in some realms */ }
      });
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      chrome.runtime.sendMessage({
        action: 'spaNavigation',
        url: args[2],
        method: 'replaceState'
      }).catch((err) => {
        try {
          if (typeof automationLogger !== 'undefined' && automationLogger && typeof automationLogger.debug === 'function') {
            automationLogger.debug('[FSB DOM] SPA navigation sendMessage failed', {
              method: 'replaceState',
              err: (typeof redactForLog === 'function') ? redactForLog(err) : { kind: 'error', message: err && err.message ? err.message : '' }
            });
          }
          if (typeof logDebugToRing === 'function') {
            logDebugToRing('DOM', 'spa-navigation', 'SPA navigation sendMessage failed', { method: 'replaceState' });
          }
        } catch (loggerErr) { /* logger missing in some realms */ }
      });
    };

    window.addEventListener('popstate', () => {
      chrome.runtime.sendMessage({
        action: 'spaNavigation',
        url: window.location.href,
        method: 'popstate'
      }).catch((err) => {
        try {
          if (typeof automationLogger !== 'undefined' && automationLogger && typeof automationLogger.debug === 'function') {
            automationLogger.debug('[FSB DOM] SPA navigation sendMessage failed', {
              method: 'popstate',
              err: (typeof redactForLog === 'function') ? redactForLog(err) : { kind: 'error', message: err && err.message ? err.message : '' }
            });
          }
          if (typeof logDebugToRing === 'function') {
            logDebugToRing('DOM', 'spa-navigation', 'SPA navigation sendMessage failed', { method: 'popstate' });
          }
        } catch (loggerErr) { /* logger missing in some realms */ }
      });
    });

    logger.logInit('spa_detection', 'enabled', { hostname: 'google.com' });
  }

  // ============================================================================
  // BACKGROUND PORT CONNECTION
  // ============================================================================

  let backgroundPort = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;

  function establishBackgroundConnection() {
    logger.debug('[FSB Content] establishBackgroundConnection called');

    // Check if extension context is still valid
    try {
      if (!chrome.runtime?.id) {
        logger.warn('[FSB Content] Extension context invalid, cannot establish connection');
        return;
      }
      logger.debug('[FSB Content] Extension context valid', { id: chrome.runtime.id });
    } catch (e) {
      logger.warn('[FSB Content] Extension context check failed', { error: e.message });
      return;
    }

    try {
      logger.debug('[FSB Content] Attempting chrome.runtime.connect...');
      backgroundPort = chrome.runtime.connect({ name: 'content-script' });
      logger.debug('[FSB Content] Port created', { success: !!backgroundPort });

      backgroundPort.onDisconnect.addListener(() => {
        backgroundPort = null;
        const lastError = chrome.runtime.lastError;
        logger.warn('Background port disconnected', {
          error: lastError?.message,
          reconnectAttempts
        });

        // Clean up lingering overlays
        try {
          FSB.viewportGlow.destroy();
          FSB.progressOverlay.destroy();
          FSB.actionGlowOverlay.destroy();
          if (FSB._overlayWatchdogTimer) {
            clearTimeout(FSB._overlayWatchdogTimer);
            FSB._overlayWatchdogTimer = null;
          }
          if (FSB.overlayState && FSB.overlayState.lifecycle !== 'cleared') {
            FSB.overlayState = Object.assign({}, FSB.overlayState, {
              reconnecting: true
            });
          }
          FSB.lastActionStatusText = null;
        } catch (cleanupErr) {
          // Non-blocking
        }

        // Reconnect with exponential backoff
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
          setTimeout(() => {
            reconnectAttempts++;
            establishBackgroundConnection();
          }, delay);
        }
      });

      backgroundPort.onMessage.addListener((msg) => {
        if (msg.type === 'heartbeat') {
          backgroundPort.postMessage({
            type: 'heartbeat-ack',
            timestamp: Date.now()
          });
        }
      });

      // Reset reconnect counter on successful connection
      reconnectAttempts = 0;

      // Send ready signal via port
      backgroundPort.postMessage({
        type: 'ready',
        url: window.location.href,
        readyState: document.readyState,
        timestamp: Date.now()
      });

      logger.logComm(FSB.sessionId, 'send', 'port_ready', true, {});
    } catch (e) {
      logger.error('Failed to establish background connection', { error: e.message });
    }
  }

  // ============================================================================
  // BF CACHE RECOVERY (pageshow / pagehide)
  // ============================================================================

  // When Chrome moves a page into BF cache (Chrome 123+), it proactively closes
  // all extension message ports. The JS context survives -- FSB namespace,
  // MutationObserver, DOM state are all intact (per D-03). Only the port dies.
  // On restore, pageshow fires with event.persisted=true. We reset the port
  // and reconnect immediately, bypassing the onDisconnect exponential backoff.

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      logger.info('[FSB Content] BF cache restore detected via pageshow', {
        url: window.location.href,
        hadPort: !!backgroundPort,
        fsbHealthy: !!(window.FSB && window.FSB._modules)
      });

      // Port is dead from BF cache entry -- null it and reset backoff counter
      backgroundPort = null;
      reconnectAttempts = 0;

      // Re-establish port immediately (not via onDisconnect backoff)
      establishBackgroundConnection();
    }
  });

  window.addEventListener('pagehide', (event) => {
    if (event.persisted) {
      logger.debug('[FSB Content] Page entering BF cache (pagehide persisted)', {
        url: window.location.href
      });
      // Port will be closed by Chrome -- nothing to do here except log.
      // The pageshow handler above will reconnect when restored.
    }
  });

  // ============================================================================
  // READY SIGNAL
  // ============================================================================

  // Signal to background script that content script is fully initialized and ready
  logger.debug('[FSB Content] About to start sendReadySignal IIFE');
  (async function sendReadySignal() {
    logger.debug('[FSB Content] sendReadySignal started');

    // Strategy 1: Port-based connection
    try {
      establishBackgroundConnection();
    } catch (portError) {
      console.error('[FSB Content] Port connection failed:', portError.message);
    }

    // Strategy 2: Message-based fallback with retries
    logger.debug('[FSB Content] Starting message-based ready signal attempts');
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        logger.debug('[FSB Content] Sending contentScriptReady', { attempt });
        await chrome.runtime.sendMessage({
          action: 'contentScriptReady',
          timestamp: Date.now(),
          url: window.location.href,
          readyState: document.readyState,
          attempt
        });
        logger.debug('[FSB Content] contentScriptReady sent successfully', { attempt });
        logger.logComm(FSB.sessionId, 'send', 'contentScriptReady', true, { attempt });

        // Confirmation ping
        await new Promise(resolve => setTimeout(resolve, 50));
        await chrome.runtime.sendMessage({
          action: 'contentScriptConfirmation',
          timestamp: Date.now(),
          url: window.location.href
        });
        logger.logComm(FSB.sessionId, 'send', 'contentScriptConfirmation', true, {});
        break;
      } catch (e) {
        if (attempt < 5) {
          await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt - 1)));
        } else {
          logger.error('All ready signal attempts failed', { error: e.message });
        }
      }
    }
  })();

  // ============================================================================
  // EXPORT TO NAMESPACE
  // ============================================================================

  FSB.collectExplorerData = collectExplorerData;
  FSB.executeDirectLogin = executeDirectLogin;
  FSB.establishBackgroundConnection = establishBackgroundConnection;

  window.FSB._modules['lifecycle'] = { loaded: true, timestamp: Date.now() };
})();
