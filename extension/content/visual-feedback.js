// ============================================================================
// VISUAL FEEDBACK - Highlight Manager, Progress Overlay, Viewport Glow,
//                   Action Glow Overlay, Element Inspector
// ============================================================================
// Extracted from content.js lines 895-2129
// Depends on: init.js (FSB namespace, logger), utils.js (isFsbElement, getClassName),
//             selectors.js (generateSelectors)

(function() {
  if (window.__FSB_SKIP_INIT__) return;
  const FSB = window.FSB;
  const logger = FSB.logger;

  // ============================================================================
  // VISUAL FEEDBACK - Highlight Manager and Progress Overlay
  // ============================================================================

  /**
   * HighlightManager - Manages element highlighting with orange glow effect
   *
   * Uses inline styles with !important to override host page styles.
   * Single highlight at a time to avoid visual clutter.
   * WeakMap storage for original styles prevents memory leaks.
   */
  class HighlightManager {
    constructor() {
      this.activeHighlight = null;
      this.originalStyles = new WeakMap();
      this.pendingTimeout = null;
    }

    /**
     * Show orange glow highlight on an element
     * @param {Element} element - DOM element to highlight
     * @param {Object} options - Configuration options
     * @param {number} options.duration - How long to show highlight (default: 500ms)
     * @param {string} options.color - Outline color (default: #FF8C00)
     * @param {string} options.glowColor - Glow color (default: rgba(255, 140, 0, 0.8))
     * @returns {Promise} Resolves after duration
     */
    show(element, options = {}) {
      const {
        duration = 500,
        color = '#FF8C00',
        glowColor = 'rgba(255, 140, 0, 0.8)'
      } = options;

      // Clean up any existing highlight first
      this.hide();

      // Validate element
      if (!element || !element.style) {
        return Promise.resolve();
      }

      // Store original styles for clean restoration
      this.originalStyles.set(element, {
        outline: element.style.outline,
        boxShadow: element.style.boxShadow,
        transition: element.style.transition,
        zIndex: element.style.zIndex,
        position: element.style.position
      });

      this.activeHighlight = element;

      // PERF: Read computed style BEFORE any writes to avoid layout thrashing
      const computedPosition = window.getComputedStyle(element).position;

      // Batch all style writes together
      element.style.setProperty('outline', `3px solid ${color}`, 'important');
      element.style.setProperty('box-shadow', `0 0 10px ${glowColor}, 0 0 20px ${glowColor}, 0 0 30px rgba(255, 140, 0, 0.4)`, 'important');
      element.style.setProperty('transition', 'box-shadow 0.15s ease-out', 'important');
      element.style.setProperty('z-index', '2147483646', 'important');

      // Only set position: relative if currently static (preserve existing positioning)
      if (computedPosition === 'static') {
        element.style.setProperty('position', 'relative', 'important');
      }

      // Return promise that resolves after duration
      return new Promise(resolve => {
        this.pendingTimeout = setTimeout(() => {
          this.pendingTimeout = null;
          resolve();
        }, duration);
      });
    }

    /**
     * Hide the current highlight and restore original styles
     */
    hide() {
      if (!this.activeHighlight) return;

      const element = this.activeHighlight;
      const original = this.originalStyles.get(element);

      if (original) {
        // Restore each property individually
        this._restoreProperty(element, 'outline', original.outline);
        this._restoreProperty(element, 'boxShadow', original.boxShadow);
        this._restoreProperty(element, 'transition', original.transition);
        this._restoreProperty(element, 'zIndex', original.zIndex);
        this._restoreProperty(element, 'position', original.position);

        this.originalStyles.delete(element);
      }

      this.activeHighlight = null;
    }

    /**
     * Restore a single style property, handling empty values properly
     * @param {Element} element - DOM element
     * @param {string} property - CSS property name (camelCase)
     * @param {string} value - Original value to restore
     */
    _restoreProperty(element, property, value) {
      if (value === '' || value === undefined || value === null) {
        // Convert camelCase to kebab-case for removeProperty
        const kebabProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
        element.style.removeProperty(kebabProperty);
      } else {
        element.style[property] = value;
      }
    }

    /**
     * Clean up all highlights and cancel pending timeouts
     */
    cleanup() {
      // Cancel any pending timeout
      if (this.pendingTimeout) {
        clearTimeout(this.pendingTimeout);
        this.pendingTimeout = null;
      }
      this.hide();
    }
  }

  // Singleton instance for highlight management
  const highlightManager = new HighlightManager();

  /**
   * promoteToTopLayer - Promote an element to the browser's top layer using the Popover API.
   *
   * The top layer renders ABOVE all z-index stacking contexts, solving the problem
   * where complex web apps (Google Docs, Sheets, etc.) create parent stacking contexts
   * that trap z-index resolution and cause page elements to render above our overlays.
   *
   * Uses popover="manual" which:
   * - Promotes element to the top layer (above ALL z-index)
   * - Does NOT make the rest of the page inert (unlike dialog.showModal())
   * - Does NOT light-dismiss (won't close on outside click)
   * - Allows multiple popovers simultaneously
   * - Works with Shadow DOM and CSS animations inside
   *
   * Falls back to z-index approach if the Popover API is not available.
   *
   * @param {HTMLElement} element - The element to promote
   * @returns {boolean} true if promoted to top layer, false if falling back to z-index
   */
  function promoteToTopLayer(element) {
    if (!element) return false;

    // Check if Popover API is supported
    if (typeof element.showPopover === 'function') {
      try {
        element.setAttribute('popover', 'manual');

        // The element must be connected to the document before showPopover()
        if (!element.isConnected) {
          document.documentElement.appendChild(element);
        }

        element.showPopover();
        return true;
      } catch (e) {
        // Fallback: if popover fails for any reason, rely on z-index
        console.warn('[FSB] Top-layer promotion failed, falling back to z-index:', e.message);
        element.removeAttribute('popover');
        return false;
      }
    }

    return false;
  }

  /**
   * demoteFromTopLayer - Remove an element from the browser's top layer.
   *
   * Calls hidePopover() before removing the element from the DOM to
   * cleanly exit the top layer.
   *
   * @param {HTMLElement} element - The element to demote
   */
  function demoteFromTopLayer(element) {
    if (!element) return;

    if (typeof element.hidePopover === 'function' && element.hasAttribute('popover')) {
      try {
        element.hidePopover();
      } catch (e) {
        // Element may already be hidden or disconnected - safe to ignore
      }
    }
  }

  function markOverlayElement(element, role) {
    if (!element) return element;
    element.setAttribute('data-fsb-overlay', 'true');
    element.setAttribute('aria-hidden', 'true');
    if (role) {
      element.setAttribute('data-fsb-overlay-role', role);
    }
    return element;
  }

  /**
   * ProgressOverlay - Floating progress indicator using Shadow DOM
   *
   * Uses Shadow DOM for complete style isolation from host page.
   * Shows task name, step number, step text, and progress bar.
   * Positioned in top-right corner with maximum z-index.
   * Promoted to the browser's top layer via Popover API for guaranteed
   * rendering above all page content (including complex apps like Google Docs).
   */
  // Phase 229-01: minimum interval (ms) between visible status-text writes.
  // Rapid bursts of update() inside this window coalesce to the latest payload.
  const PROGRESS_TEXT_DEBOUNCE_MS = 400;
  // Phase 230: minimum dwell time (ms) — once text becomes visible, it must stay
  // for at least this long before a new payload can replace it. Stacks on top
  // of the 400ms debounce; the effective wait is max(debounce_remaining, dwell_remaining).
  // Bypassed for the first write of a session and for `lifecycle === 'final'`.
  const MIN_DISPLAY_DURATION_MS = 1200;

  class ProgressOverlay {
    constructor() {
      this.host = null;
      this.shadow = null;
      this.container = null;
      this._startTime = null;
      this._timerRAF = null;
      this._frozen = false;
      this._autoHideTimer = null;
      // Phase 229-01 cadence/stability fields:
      this._pendingDisplay = null;       // latest queued text payload
      this._textDebounceTimer = null;    // setTimeout handle
      this._lastTextWriteAt = 0;         // performance.now() of last visible text write
      this._lastVisiblePercent = 0;      // monotonic clamp floor
      this._lastActionCount = null;      // last written actionCount (batching gate)
    }

    /**
     * Phase 229-01 (OVERLAY-01): debounced status-text writer.
     * Coalesces bursts of text changes inside PROGRESS_TEXT_DEBOUNCE_MS to the
     * latest payload. Bypasses the debounce when isFinal === true so the
     * v0.9.26 completion freeze (green-flash, Done pill) renders without delay.
     */
    _scheduleTextWrite(wantsText, isFinal) {
      if (!this.container) return;
      if (isFinal) {
        if (this._textDebounceTimer !== null) {
          clearTimeout(this._textDebounceTimer);
          this._textDebounceTimer = null;
        }
        this._pendingDisplay = wantsText;
        this._flushPendingText();
        return;
      }
      this._pendingDisplay = wantsText;
      var now = performance.now();
      var elapsed = now - this._lastTextWriteAt;
      // Phase 230: first write of session bypasses dwell floor (don't sit on a blank pill).
      var isFirstWrite = this._lastTextWriteAt === 0;
      var dwellFloor = isFirstWrite ? 0 : MIN_DISPLAY_DURATION_MS;
      var debounceFloor = PROGRESS_TEXT_DEBOUNCE_MS;
      var requiredWait = Math.max(debounceFloor, dwellFloor);
      if (elapsed >= requiredWait && this._textDebounceTimer === null) {
        this._flushPendingText();
        return;
      }
      if (this._textDebounceTimer === null) {
        var self = this;
        var delay = Math.max(0, requiredWait - elapsed);
        this._textDebounceTimer = setTimeout(function() {
          self._textDebounceTimer = null;
          self._flushPendingText();
        }, delay);
      }
      // else: existing timer will pick up the latest _pendingDisplay when it fires.
    }

    /**
     * Phase 229-01: flush the latest pending text payload to the DOM.
     */
    _flushPendingText() {
      if (!this.container || !this._pendingDisplay) return;
      var p = this._pendingDisplay;
      var taskEl = this.container.querySelector('.fsb-task');
      var summaryEl = this.container.querySelector('.fsb-summary');
      var stepTextEl = this.container.querySelector('.fsb-step-text');
      var stepNumberEl = this.container.querySelector('.fsb-step-number');
      if (taskEl) taskEl.textContent = p.title;
      if (summaryEl) summaryEl.textContent = p.subtitle;
      if (stepTextEl) stepTextEl.textContent = p.detail;
      if (stepNumberEl) stepNumberEl.textContent = p.stepNumberLabel;
      this._lastTextWriteAt = performance.now();
      this._pendingDisplay = null;
    }

    /**
     * Format elapsed milliseconds as M:SS (e.g., "0:42", "1:05")
     * No leading zero on minutes per D-03.
     */
    _formatElapsed(ms) {
      var totalSeconds = Math.floor(ms / 1000);
      var minutes = Math.floor(totalSeconds / 60);
      var seconds = totalSeconds % 60;
      return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    }

    /**
     * Start the rAF-driven elapsed timer loop (D-05).
     * Updates .fsb-phase with M:SS elapsed time every frame.
     */
    _startTimerLoop() {
      if (this._timerRAF !== null) return;
      var self = this;
      function tick() {
        if (self._frozen || !self._startTime || !self.container) {
          self._timerRAF = null;  // clear stale handle on early exit
          return;
        }
        var elapsed = performance.now() - self._startTime;
        var phaseEl = self.container.querySelector('.fsb-phase');
        if (phaseEl) {
          phaseEl.textContent = self._formatElapsed(elapsed);
        }
        self._timerRAF = requestAnimationFrame(tick);
      }
      self._timerRAF = requestAnimationFrame(tick);
    }

    /**
     * Stop the rAF timer loop and clean up the animation frame.
     */
    _stopTimerLoop() {
      if (this._timerRAF !== null) {
        cancelAnimationFrame(this._timerRAF);
        this._timerRAF = null;
      }
    }

    /**
     * Create the overlay in Shadow DOM if not already created
     */
    create() {
      if (this.host) return; // Already created

      // Create host element
      this.host = markOverlayElement(document.createElement('div'), 'progress-host');
      this.host.id = 'fsb-progress-host';
      // Reset all inherited styles and position at top of stacking context
      // z-index is kept as fallback for browsers without Popover API support
      this.host.style.cssText = `
      all: initial !important;
      display: block !important;
      position: fixed !important;
      inset: auto !important;
      top: 16px !important;
      right: 16px !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      background: none !important;
    `;

      // Create shadow root for complete style isolation
      this.shadow = this.host.attachShadow({ mode: 'open' });

      // Inject styles (completely isolated from host page)
      const style = document.createElement('style');
      style.textContent = `
      :host {
        display: block !important;
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font: inherit;
        color: inherit;
      }

      .fsb-overlay {
        width: min(320px, calc(100vw - 32px));
        max-width: 320px;
        background: #000000;
        color: #ffffff;
        padding: 14px 18px;
        border-radius: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 140, 0, 0.3);
        pointer-events: none;
        opacity: 1;
        transition: opacity 0.2s ease-out;
        contain: layout paint;
      }

      .fsb-overlay.hidden {
        opacity: 0;
        pointer-events: none;
      }

      .fsb-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .fsb-logo {
        width: 20px;
        height: 20px;
        border-radius: 4px;
        object-fit: contain;
      }

      .fsb-title {
        font-weight: 600;
        color: #ffffff;
        font-size: 13px;
      }

      .fsb-client-badge {
        display: none;
        margin-left: auto;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.88);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .fsb-task {
        color: rgba(255, 255, 255, 0.7);
        font-size: 12px;
        margin-bottom: 8px;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }

      .fsb-summary {
        color: rgba(255, 255, 255, 0.5);
        font-size: 11px;
        margin-bottom: 6px;
        font-style: italic;
      }

      .fsb-summary:empty {
        display: none;
      }

      .fsb-step {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 10px;
      }

      .fsb-step-number {
        background: rgba(255, 140, 0, 0.2);
        color: #FF8C00;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        flex-shrink: 0;
      }

      .fsb-step-text {
        color: rgba(255, 255, 255, 0.9);
        font-size: 12px;
        flex: 1;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }

      .fsb-meta {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }

      .fsb-phase,
      .fsb-eta {
        color: rgba(255, 255, 255, 0.5);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .fsb-progress-bar {
        height: 4px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        overflow: hidden;
        position: relative;
      }

      .fsb-progress-bar.hidden {
        display: none;
      }

      .fsb-progress-bar.indeterminate .fsb-progress-fill {
        width: 38%;
        transform-origin: center center;
        animation: fsbProgressSweep 1.2s ease-in-out infinite;
      }

      .fsb-progress-fill {
        height: 100%;
        width: 100%;
        background: linear-gradient(90deg, #FF8C00, #FF6600);
        border-radius: 2px;
        transform-origin: left center;
        transform: scaleX(0);
        transition: transform 0.3s ease-out;
        will-change: transform;
      }

      .fsb-progress-fill.complete {
        background: #34D399;
        transform: scaleX(1) !important;
      }

      @keyframes fsbProgressSweep {
        0% { transform: translateX(-120%); }
        100% { transform: translateX(320%); }
      }

      @media (prefers-reduced-motion: reduce) {
        .fsb-overlay,
        .fsb-progress-fill {
          transition: none;
        }
        .fsb-progress-fill.complete {
          transition: none;
        }
        .fsb-progress-bar.indeterminate .fsb-progress-fill {
          animation: none;
          transform: none;
          width: 45%;
        }
        /* Phase 229-02 (OVERLAY-06): strict text-surface no-animation. */
        .fsb-task,
        .fsb-summary,
        .fsb-step-text,
        .fsb-step-number,
        .fsb-eta {
          transition: none !important;
          animation: none !important;
        }
        /* .fsb-progress-fill.complete background change is a single state,
           not an animation -- preserved as the only celebratory cue. */
      }
    `;

      this.shadow.appendChild(style);

      // Create overlay container
      this.container = document.createElement('div');
      this.container.className = 'fsb-overlay';
      this.container.innerHTML = `
      <div class="fsb-header">
        <img class="fsb-logo" src="" alt="FSB">
        <span class="fsb-title">FSB Automating</span>
        <span class="fsb-client-badge"></span>
      </div>
      <div class="fsb-task">-</div>
      <div class="fsb-summary"></div>
      <div class="fsb-step">
        <span class="fsb-step-number">Planning</span>
        <span class="fsb-step-text">Initializing...</span>
      </div>
      <div class="fsb-meta">
        <span class="fsb-phase"></span>
        <span class="fsb-eta"></span>
      </div>
      <div class="fsb-progress-bar">
        <div class="fsb-progress-fill"></div>
      </div>
    `;

      // Set logo image src using chrome.runtime.getURL for web_accessible_resources
      const logoImg = this.container.querySelector('.fsb-logo');
      logoImg.src = chrome.runtime.getURL('assets/icon48.png');

      this.shadow.appendChild(this.container);

      // Promote to top layer via Popover API for guaranteed rendering above all page content.
      // This bypasses stacking context issues on complex sites like Google Docs.
      // Falls back to z-index approach if Popover API is unavailable.
      this._inTopLayer = promoteToTopLayer(this.host);
      if (!this._inTopLayer) {
        // Fallback: append to documentElement with z-index
        document.documentElement.appendChild(this.host);
      }
    }

    /**
     * Update overlay content
     * @param {Object} data - Update data
     * @param {string} data.taskName - Task description
     * @param {number} data.stepNumber - Current step number
     * @param {string} data.stepText - Step description
     * @param {number} data.progress - Progress percentage (0-100)
     */
    update(state) {
      if (!this.container) return;

      // Once frozen (lifecycle=final received), ignore further updates
      // to prevent post-completion status messages from altering the display
      if (this._frozen) return;

      // Phase 229-02 (OVERLAY-05 first-sentence guard): legacy state.stepText
      // bypasses the upstream sanitization pipeline in overlay-state.js. Route
      // it through sanitizeActionText(firstSentence(...)) so multi-sentence /
      // raw-tool-call strings cannot leak directly into .fsb-step-text.
      var legacyUtils = window.FSBOverlayStateUtils;
      var overlayState = state && state.display ? state : {
        lifecycle: 'running',
        phase: state && state.phase ? state.phase : 'planning',
        display: {
          title: state && state.taskName ? String(state.taskName) : '-',
          subtitle: state && state.taskSummary ? String(state.taskSummary) : '',
          detail: state && state.stepText
            ? (legacyUtils && typeof legacyUtils.sanitizeActionText === 'function' && typeof legacyUtils.firstSentence === 'function'
                ? legacyUtils.sanitizeActionText(legacyUtils.firstSentence(String(state.stepText)))
                : String(state.stepText))
            : 'Working'
        },
        progress: state && state.progress !== undefined
          ? {
              mode: 'determinate',
              percent: Math.min(100, Math.max(0, Math.round(Number(state.progress) || 0))),
              label: Math.round(Number(state.progress) || 0) + '%',
              eta: state && state.eta ? String(state.eta) : ''
            }
          : {
              mode: 'indeterminate',
              percent: null,
              label: (function() {
                var utils = window.FSBOverlayStateUtils;
                var phase = state && state.phase ? state.phase : 'planning';
                return (utils && typeof utils.humanizeOverlayPhase === 'function')
                  ? utils.humanizeOverlayPhase(phase)
                  : 'Working';
              })(),
              eta: ''
            }
      };

      // Timer lifecycle (D-04, D-05)
      // Start elapsed timer on first update call (first sessionStatus)
      if (!this._startTime && overlayState.lifecycle !== 'cleared') {
        this._startTime = performance.now();
        this._frozen = false;
        // Phase 229-01 (OVERLAY-03): reset monotonic floor for new session.
        this._lastVisiblePercent = 0;
        var phaseEl = this.container.querySelector('.fsb-phase');
        if (phaseEl) phaseEl.textContent = '0:00';  // seed before first rAF fires
        this._startTimerLoop();
      }

      var utils = window.FSBOverlayStateUtils;
      var phaseLabel = utils && typeof utils.humanizeOverlayPhase === 'function'
        ? utils.humanizeOverlayPhase(overlayState.phase)
        : (overlayState.phase || 'Working');
      var display = overlayState.display || {};
      var progress = overlayState.progress || { mode: 'indeterminate', label: phaseLabel };
      // Phase 243 plan 03 (UI-01): badge displays "<clientLabel> / <agentIdShort>"
      // when both are present (just clientLabel if only that; just agentIdShort if
      // only that; hidden if neither). agentIdShort is produced upstream in
      // overlay-state.js via formatAgentIdForDisplay (agent-registry.js:184) --
      // never sliced locally. The combine logic is extracted into the pure
      // FSBBadgeCombine helper so the rule is unit-testable without a DOM.
      var clientLabel = overlayState.clientLabel ? String(overlayState.clientLabel).trim() : '';
      var agentIdShort = overlayState.agentIdShort ? String(overlayState.agentIdShort).trim() : '';
      var combined = (window.FSBBadgeCombine && typeof window.FSBBadgeCombine.combineBadgeText === 'function')
        ? window.FSBBadgeCombine.combineBadgeText(clientLabel, agentIdShort)
        : (clientLabel && agentIdShort ? clientLabel + ' / ' + agentIdShort : (clientLabel || agentIdShort));
      var clientBadgeEl = this.container.querySelector('.fsb-client-badge');

      if (clientBadgeEl) {
        clientBadgeEl.textContent = combined;
        clientBadgeEl.style.display = combined ? 'inline-flex' : 'none';
      }

      // Phase 229-02 (OVERLAY-05): suppress generic 'thinking-class' phase
      // labels in detail when session elapsed < 1s. Avoids the 'Thinking...'
      // / 'Planning...' flash on fast turns. Only suppresses when detail is
      // the generic placeholder ('Working' or the phase label) -- real status
      // text (e.g. AI summary 'Reviewing search results') flows through.
      var elapsedMs = this._startTime ? (performance.now() - this._startTime) : 0;
      var isThinking = utils && typeof utils.isThinkingPhase === 'function'
        && utils.isThinkingPhase(overlayState.phase);
      var detailIsGeneric = !display.detail
        || display.detail === 'Working'
        || display.detail === phaseLabel;
      var suppressDetail = isThinking && detailIsGeneric && elapsedMs < 1000;

      // Phase 229-01 (OVERLAY-01): debounce text writes (flushes immediately on final).
      var wantsText = {
        title: display.title || '-',
        subtitle: display.subtitle || '',
        detail: suppressDetail ? '' : (display.detail || 'Working'),
        stepNumberLabel: progress.label || phaseLabel
      };
      var isFinal = overlayState.lifecycle === 'final';
      this._scheduleTextWrite(wantsText, isFinal);

      // .fsb-phase elapsed timer display (D-02) -- initial 0:00 seeded in timer-start block above

      // Phase 229-01 (OVERLAY-04): action counter batching -- write only when value changes.
      var actionCount = overlayState.actionCount;
      var etaEl = this.container.querySelector('.fsb-eta');
      if (etaEl && actionCount !== this._lastActionCount) {
        if (actionCount !== null && actionCount !== undefined) {
          etaEl.textContent = 'Actions: ' + actionCount;
        } else {
          etaEl.textContent = '';
        }
        this._lastActionCount = actionCount;
      }

      var bar = this.container.querySelector('.fsb-progress-bar');
      var fill = this.container.querySelector('.fsb-progress-fill');
      // Trigger watchers don't have progress -- they sit and observe. The
      // indeterminate sweep implies forward motion, which misreads as
      // "something is happening". Hide the bar entirely; the breathing
      // edge-glow + static caption carry the "armed and waiting" signal.
      var isTriggerWatch = overlayState.phase === 'trigger-watch'
        || overlayState.mode === 'trigger-watch';
      if (isTriggerWatch) {
        fill.style.transform = '';
        fill.style.transformOrigin = '';
        bar.classList.add('hidden');
        bar.classList.remove('indeterminate');
      } else if (progress.mode === 'determinate' && progress.percent !== null) {
        bar.classList.remove('indeterminate');
        bar.classList.remove('hidden');
        fill.style.width = '100%';
        // Phase 229-01 (OVERLAY-03): monotonic clamp -- never let bar visibly retreat.
        var clampedPercent = Math.max(this._lastVisiblePercent || 0, progress.percent);
        this._lastVisiblePercent = clampedPercent;
        fill.style.transform = 'scaleX(' + (clampedPercent / 100) + ')';
      } else {
        fill.style.width = '38%';
        fill.style.transform = '';
        fill.style.transformOrigin = '';
        if (overlayState.lifecycle === 'final') {
          bar.classList.add('hidden');
          bar.classList.remove('indeterminate');
        } else {
          bar.classList.remove('hidden');
          bar.classList.add('indeterminate');
        }
      }

      // Completion freeze (D-08, D-09, D-10, POLISH-03)
      if (overlayState.lifecycle === 'final' && !this._frozen) {
        this._frozen = true;
        this._stopTimerLoop();

        // Freeze elapsed time at final value
        if (this._startTime) {
          var finalElapsed = performance.now() - this._startTime;
          var finalPhaseEl = this.container.querySelector('.fsb-phase');
          if (finalPhaseEl) {
            finalPhaseEl.textContent = this._formatElapsed(finalElapsed);
          }
        }

        // Success-specific presentation (D-08)
        if (overlayState.result === 'success') {
          // Green progress bar
          fill.classList.add('complete');
          // Green glow on overlay
          this.container.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(52, 211, 153, 0.3)';
          // Done pill
          this.container.querySelector('.fsb-step-number').textContent = 'Done';
        }
        // Failure: bar stays orange, pill keeps existing text (D-10) -- no action needed

        // Auto-hide after 3 seconds (D-09)
        var self = this;
        if (this._autoHideTimer !== null) clearTimeout(this._autoHideTimer);
        this._autoHideTimer = setTimeout(function() {
          self._autoHideTimer = null;
          if (self.container) {
            self.container.classList.add('hidden');
          }
        }, 3000);
      }

      // Auto-broadcast overlay state to dashboard if streaming
      if (window.FSB && window.FSB.domStream && window.FSB.domStream.isStreaming()) {
        window.FSB.domStream.broadcastOverlayState();
      }
    }

    /**
     * Show the overlay (remove hidden class)
     */
    show() {
      if (this.host && this.host.parentNode) {
        if (this._inTopLayer) {
          // Re-promote to top layer to ensure we're on top of any newly opened popovers
          try { this.host.hidePopover(); } catch (e) { /* ignore */ }
          try { this.host.showPopover(); } catch (e) { /* ignore */ }
        } else {
          // Fallback: Re-append to ensure we're last in DOM (wins z-index ties)
          document.documentElement.appendChild(this.host);
        }
      }
      if (this.container) {
        this.container.classList.remove('hidden');
      }
    }

    /**
     * Hide the overlay (add hidden class for fade out)
     */
    hide() {
      if (this.container) {
        this.container.classList.add('hidden');
      }
    }

    /**
     * Remove overlay from DOM completely
     */
    destroy() {
      this._stopTimerLoop();
      if (this._autoHideTimer !== null) {
        clearTimeout(this._autoHideTimer);
        this._autoHideTimer = null;
      }
      // Phase 229-01: clear cadence/stability state so a re-created overlay starts clean.
      if (this._textDebounceTimer !== null) {
        clearTimeout(this._textDebounceTimer);
        this._textDebounceTimer = null;
      }
      this._pendingDisplay = null;
      this._lastTextWriteAt = 0;
      this._lastVisiblePercent = 0;
      this._lastActionCount = null;
      this._startTime = null;
      this._frozen = false;
      if (this.host) {
        demoteFromTopLayer(this.host);
        this.host.remove();
        this.host = null;
        this.shadow = null;
        this.container = null;
        this._inTopLayer = false;
      }
    }
  }

  // Singleton instance for progress overlay
  const progressOverlay = new ProgressOverlay();

  // Persist the last action-specific status text so thinking phases can reuse it
  // (shared state -- attached to FSB namespace below)
  let lastActionStatusText = null;

  /**
   * ViewportGlow - Full-viewport border glow indicating AI activity state
   *
   * Uses Shadow DOM for style isolation. A single requestAnimationFrame loop
   * drives one continuous light bead clockwise around the viewport border,
   * with perimeter-proportional timing so the bead moves at uniform speed
   * regardless of aspect ratio. Two color states:
   * - 'thinking' (orange/amber): AI analyzing page or planning actions (6s cycle)
   * - 'acting' (orange/red): Executing actions on the page (4s cycle)
   */
  class ViewportGlow {
    constructor() {
      this.host = null;
      this.shadow = null;
      this.state = null; // 'thinking' | 'acting' | 'watching'
      this._rafId = null;
      this._startTime = null;
      this._bars = null; // cached DOM references: { top, right, bottom, left }
    }

    show(state) {
      if (!this.host) {
        this._create();
        this.state = state;
        const root = this.shadow.querySelector('.viewport-glow-root');
        if (root) root.classList.add(`state-${state}`);
        this._startAnimation();
        return;
      }
      if (this.host.parentNode) {
        if (this._inTopLayer) {
          // Re-promote to top layer to ensure we're on top of any newly opened popovers
          try { this.host.hidePopover(); } catch (e) { /* ignore */ }
          try { this.host.showPopover(); } catch (e) { /* ignore */ }
        } else {
          // Fallback: Re-append to ensure we're last in DOM (wins z-index ties)
          document.documentElement.appendChild(this.host);
        }
      }
      this.setState(state);
    }

    setState(state) {
      if (!this.shadow || this.state === state) return;
      // Preserve visual position across speed change
      if (this._startTime !== null) {
        const now = performance.now();
        const oldDuration = this._getDuration();
        const elapsed = (now - this._startTime) % oldDuration;
        const progress = elapsed / oldDuration;
        this.state = state;
        const newDuration = this._getDuration();
        // Adjust start time so new duration yields the same progress
        this._startTime = now - progress * newDuration;
      } else {
        this.state = state;
      }
      const root = this.shadow.querySelector('.viewport-glow-root');
      if (root) {
        root.classList.remove('state-thinking', 'state-acting', 'state-watching');
        root.classList.add(`state-${state}`);
      }
    }

    _getDuration() {
      if (this.state === 'acting') return 4000;
      if (this.state === 'watching') return 5000;
      return 6000;
    }

    /**
     * Calculate perimeter segment boundaries based on viewport dimensions.
     * Returns { s1, s2, s3 } where segments are:
     *   top:    [0, s1)
     *   right:  [s1, s2)
     *   bottom: [s2, s3)
     *   left:   [s3, 1)
     */
    _getSegments() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const perim = 2 * (w + h);
      const s1 = w / perim;          // end of top
      const s2 = (w + h) / perim;    // end of right (= 0.5)
      const s3 = (2 * w + h) / perim; // end of bottom
      return { s1, s2, s3 };
    }

    /**
     * Calculate how much a bead [beadStart, beadEnd] overlaps a segment [segStart, segEnd].
     * Returns null if no overlap, or { start, end } as fractions within the segment (0-1).
     * Handles wrap-around at the 0/1 boundary.
     */
    _beadOverlap(beadStart, beadEnd, segStart, segEnd) {
      // Normalize bead into [0, 1) range -- beadEnd may exceed 1.0 for wrap
      const segLen = segEnd - segStart;
      if (segLen <= 0) return null;

      // Check two ranges: the bead itself, and the wrapped portion (if any)
      const ranges = [{ s: beadStart, e: beadEnd }];
      if (beadEnd > 1.0) {
        ranges.push({ s: beadStart - 1.0, e: beadEnd - 1.0 });
      }
      if (beadStart < 0) {
        ranges.push({ s: beadStart + 1.0, e: beadEnd + 1.0 });
      }

      for (const r of ranges) {
        const overlapStart = Math.max(r.s, segStart);
        const overlapEnd = Math.min(r.e, segEnd);
        if (overlapEnd > overlapStart) {
          return {
            start: (overlapStart - segStart) / segLen,
            end: (overlapEnd - segStart) / segLen
          };
        }
      }
      return null;
    }

    _startAnimation() {
      this._startTime = performance.now();
      const tick = (now) => {
        const duration = this._getDuration();
        const elapsed = (now - this._startTime) % duration;
        const progress = elapsed / duration;
        this._updateBars(progress);
        this._rafId = requestAnimationFrame(tick);
      };
      this._rafId = requestAnimationFrame(tick);
    }

    _stopAnimation() {
      if (this._rafId !== null) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
      this._startTime = null;
    }

    _updateBars(progress) {
      if (!this._bars) return;
      const { s1, s2, s3 } = this._getSegments();
      const beadLen = 0.12; // 12% of perimeter
      const fadeLen = 0.02; // 2% fade on each end
      const beadStart = progress;
      const beadEnd = progress + beadLen;

      // Top bar: segment [0, s1), gradient left-to-right
      this._renderBar(this._bars.top, beadStart, beadEnd, 0, s1, fadeLen, 'horizontal', false);
      // Right bar: segment [s1, s2), gradient top-to-bottom
      this._renderBar(this._bars.right, beadStart, beadEnd, s1, s2, fadeLen, 'vertical', false);
      // Bottom bar: segment [s2, s3), gradient right-to-left (reversed)
      this._renderBar(this._bars.bottom, beadStart, beadEnd, s2, s3, fadeLen, 'horizontal', true);
      // Left bar: segment [s3, 1), gradient bottom-to-top (reversed)
      this._renderBar(this._bars.left, beadStart, beadEnd, s3, 1.0, fadeLen, 'vertical', true);
    }

    _renderBar(bar, beadStart, beadEnd, segStart, segEnd, fadeLen, orientation, reversed) {
      const overlap = this._beadOverlap(beadStart, beadEnd, segStart, segEnd);
      if (!overlap) {
        bar.style.opacity = '0';
        return;
      }

      bar.style.opacity = '';  // fall back to CSS var(--glow-opacity)

      let start = overlap.start;
      let end = overlap.end;
      if (reversed) {
        const tmp = start;
        start = 1 - end;
        end = 1 - tmp;
      }

      // Convert fadeLen from perimeter-fraction to segment-fraction
      const segLen = segEnd - segStart;
      const fadeFrac = segLen > 0 ? fadeLen / segLen : 0;
      // Clamp fade so it doesn't exceed the overlap region
      const overlapLen = end - start;
      const actualFade = Math.min(fadeFrac, overlapLen / 2);

      const fadeStart = Math.max(0, start - actualFade);
      const fadeEnd = Math.min(1, end + actualFade);

      const pct = (v) => (v * 100).toFixed(2) + '%';

      if (orientation === 'horizontal') {
        bar.style.background = `linear-gradient(90deg, transparent ${pct(fadeStart)}, var(--glow-color-1) ${pct(start)}, var(--glow-color-2) ${pct(end)}, transparent ${pct(fadeEnd)})`;
      } else {
        bar.style.background = `linear-gradient(180deg, transparent ${pct(fadeStart)}, var(--glow-color-1) ${pct(start)}, var(--glow-color-2) ${pct(end)}, transparent ${pct(fadeEnd)})`;
      }
    }

    _create() {
      this.host = markOverlayElement(document.createElement('div'), 'viewport-glow-host');
      this.host.id = 'fsb-viewport-glow-host';
      // z-index kept as fallback; top-layer via Popover API is the primary mechanism
      this.host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;margin:0!important;padding:0!important;border:none!important;background:none!important;';

      this.shadow = this.host.attachShadow({ mode: 'closed' });

      const style = document.createElement('style');
      style.textContent = `
      :host { all: initial !important; }

      .viewport-glow-root {
        position: fixed;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        --glow-color-1: #ff8c00;
        --glow-color-2: #f59e0b;
        --glow-opacity: 0;
        --glow-brightness: 1.25;
        --ambient-inner: rgba(255, 140, 0, 0);
        --ambient-outer: rgba(245, 158, 11, 0);
      }

      .viewport-glow-root.state-thinking {
        --glow-color-1: #ff8c00;
        --glow-color-2: #f59e0b;
        --glow-opacity: 1;
        --glow-brightness: 1.625;
        --ambient-inner: rgba(255, 140, 0, 0.34);
        --ambient-outer: rgba(245, 158, 11, 0.17);
      }
      .viewport-glow-root.state-acting {
        --glow-color-1: #ff6600;
        --glow-color-2: #ff8c00;
        --glow-opacity: 1;
        --glow-brightness: 1.95;
        --ambient-inner: rgba(255, 140, 0, 0.51);
        --ambient-outer: rgba(255, 102, 0, 0.26);
      }
      .viewport-glow-root.state-watching {
        --glow-color-1: #ff8c00;
        --glow-color-2: #ffa500;
        --glow-opacity: 0.85;
        --glow-brightness: 1.4;
        --ambient-inner: rgba(255, 140, 0, 0.27);
        --ambient-outer: rgba(255, 166, 0, 0.13);
      }

      /* Ambient inset glow */
      .viewport-ambient {
        position: absolute;
        inset: 0;
        box-shadow:
          inset 0 0 83px var(--ambient-inner),
          inset 0 0 166px var(--ambient-outer);
        transition: box-shadow 0.5s ease;
      }

      /* Bar elements -- JS controls background and opacity directly */
      .bar {
        position: absolute;
        opacity: 0;
        filter: blur(2px) brightness(var(--glow-brightness));
        transition: filter 0.5s ease;
        will-change: opacity, background;
      }

      .bar-top, .bar-bottom {
        left: 0; right: 0; height: 6.5px;
      }
      .bar-left, .bar-right {
        top: 0; bottom: 0; width: 6.5px;
      }

      .bar-top    { top: 0; }
      .bar-bottom { bottom: 0; }
      .bar-left   { left: 0; }
      .bar-right  { right: 0; }
    `;
      this.shadow.appendChild(style);

      const root = document.createElement('div');
      root.className = 'viewport-glow-root';
      root.innerHTML = `
      <div class="viewport-ambient"></div>
      <div class="bar bar-top"></div>
      <div class="bar bar-right"></div>
      <div class="bar bar-bottom"></div>
      <div class="bar bar-left"></div>
    `;
      this.shadow.appendChild(root);

      // Cache bar references for rAF loop
      this._bars = {
        top: root.querySelector('.bar-top'),
        right: root.querySelector('.bar-right'),
        bottom: root.querySelector('.bar-bottom'),
        left: root.querySelector('.bar-left')
      };

      // Promote to top layer via Popover API for guaranteed rendering above all page content
      this._inTopLayer = promoteToTopLayer(this.host);
      if (!this._inTopLayer) {
        document.documentElement.appendChild(this.host);
      }
    }

    destroy() {
      this._stopAnimation();
      if (this.host) {
        demoteFromTopLayer(this.host);
        this.host.remove();
        this.host = null;
        this.shadow = null;
        this.state = null;
        this._bars = null;
        this._inTopLayer = false;
      }
    }
  }

  // Singleton instance for viewport glow
  const viewportGlow = new ViewportGlow();

  /**
   * TriggerBadge - Compact pill in the top-right viewport that tallies armed
   * trigger watchers and their fire counts. Mirrors the visual language of the
   * other overlays (Shadow DOM + Popover top-layer + orange palette) and stays
   * deliberately quiet: no animation while idle, soft fade when counts shift.
   *
   * API:
   *   show({watching, fired}) — show or update; pass {watching:0, fired:0} to fade out
   *   hide()                  — fade and remove
   *   destroy()               — synchronous teardown
   */
  class TriggerBadge {
    constructor() {
      this.host = null;
      this.shadow = null;
      this.root = null;
      this.watchingEl = null;
      this.firedEl = null;
      this.lastWatching = 0;
      this.lastFired = 0;
      this._inTopLayer = false;
    }

    _create() {
      this.host = markOverlayElement(document.createElement('div'), 'trigger-badge-host');
      this.host.id = 'fsb-trigger-badge-host';
      this.host.style.cssText = 'all:initial!important;position:fixed!important;bottom:0!important;right:0!important;z-index:2147483647!important;pointer-events:none!important;margin:0!important;padding:0!important;border:none!important;background:none!important;';

      this.shadow = this.host.attachShadow({ mode: 'closed' });

      const style = document.createElement('style');
      style.textContent = `
        :host { all: initial !important; }
        .badge-root {
          position: fixed;
          bottom: 14px;
          right: 14px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          font: 500 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #fff5e6;
          background: rgba(20, 16, 12, 0.88);
          border: 1px solid rgba(255, 140, 0, 0.55);
          border-radius: 999px;
          box-shadow: 0 4px 16px rgba(255, 140, 0, 0.18), 0 0 0 1px rgba(255, 140, 0, 0.10);
          opacity: 0;
          transform: translateY(4px);
          transition: opacity 220ms ease-out, transform 220ms ease-out;
          pointer-events: none;
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }
        .badge-root.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .badge-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: rgba(255, 166, 0, 0.95);
          box-shadow: 0 0 8px rgba(255, 140, 0, 0.75);
          animation: fsb-trigger-badge-dot 2.4s ease-in-out infinite;
        }
        @keyframes fsb-trigger-badge-dot {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.15); }
        }
        .badge-text {
          white-space: nowrap;
        }
        .badge-sep {
          opacity: 0.45;
          margin: 0 2px;
        }
        .badge-fired {
          color: rgba(255, 220, 180, 0.75);
        }
        .badge-fired.zero { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .badge-root { transition: opacity 80ms linear; transform: none; }
          .badge-root.visible { transform: none; }
          .badge-dot { animation: none; opacity: 0.85; }
        }
      `;
      this.shadow.appendChild(style);

      this.root = document.createElement('div');
      this.root.className = 'badge-root';
      this.root.innerHTML = `
        <span class="badge-dot"></span>
        <span class="badge-text"><span class="badge-watching">0 watching</span><span class="badge-sep badge-fired-sep"> · </span><span class="badge-fired zero">0 fired</span></span>
      `;
      this.shadow.appendChild(this.root);

      this.watchingEl = this.root.querySelector('.badge-watching');
      this.firedEl = this.root.querySelector('.badge-fired');
      this.firedSepEl = this.root.querySelector('.badge-fired-sep');

      this._inTopLayer = promoteToTopLayer(this.host);
      if (!this._inTopLayer) {
        document.documentElement.appendChild(this.host);
      }
    }

    show(counts) {
      const watching = Math.max(0, Number((counts && counts.watching) || 0));
      const fired = Math.max(0, Number((counts && counts.fired) || 0));
      this.lastWatching = watching;
      this.lastFired = fired;

      if (watching === 0 && fired === 0) {
        this.hide();
        return;
      }

      if (!this.host) {
        this._create();
        requestAnimationFrame(() => {
          if (this.root) this.root.classList.add('visible');
        });
      } else {
        this.root.classList.add('visible');
      }

      if (this.watchingEl) {
        this.watchingEl.textContent = watching + (watching === 1 ? ' watching' : ' watching');
      }
      if (this.firedEl) {
        this.firedEl.textContent = fired + ' fired';
        this.firedEl.classList.toggle('zero', fired === 0);
      }
      if (this.firedSepEl) {
        this.firedSepEl.style.display = fired > 0 ? '' : 'none';
      }
    }

    hide() {
      if (!this.root) {
        this.destroy();
        return;
      }
      this.root.classList.remove('visible');
      setTimeout(() => {
        if (this.lastWatching === 0 && this.lastFired === 0) {
          this.destroy();
        }
      }, 250);
    }

    destroy() {
      if (this.host) {
        try { demoteFromTopLayer(this.host); } catch (_e) { /* best-effort */ }
        try { this.host.remove(); } catch (_e) { /* best-effort */ }
      }
      this.host = null;
      this.shadow = null;
      this.root = null;
      this.watchingEl = null;
      this.firedEl = null;
      this.firedSepEl = null;
      this._inTopLayer = false;
    }
  }

  // Singleton instance for trigger badge
  const triggerBadge = new TriggerBadge();

  /**
   * ActionGlowOverlay - Animated target-aware highlight that persists during action execution
   *
   * Uses Shadow DOM for style isolation. Inline links and text-first targets
   * receive an orange text-highlight treatment, while controls and larger
   * surfaces keep a tighter pulsing outline.
   */
  class ActionGlowOverlay {
    constructor() {
      this.host = null;
      this.shadow = null;
      this.overlayRoot = null;
      this.boxOverlay = null;
      this.targetElement = null;
      this.trackingId = null;
      this.currentGeometry = null;
      this.currentMode = null;
      this._isVisible = false;
      this._pulseMode = false;
      // Phase 229-01 (OVERLAY-02): rect memoization fields.
      this._rectDirty = true;
      this._onWindowChange = null;
      this._listenersAttached = false;
    }

    /**
     * Find the nearest visually meaningful parent to highlight instead of a tiny inner element.
     * Walks up the DOM to find interactive or reasonably sized ancestors.
     */
    _findHighlightTarget(element) {
      const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA']);
      const INTERACTIVE_ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'option', 'switch']);

      // If element is already interactive, use it directly
      if (INTERACTIVE_TAGS.has(element.tagName)) return element;
      const role = element.getAttribute('role');
      if (role && INTERACTIVE_ROLES.has(role)) return element;

      // Walk up to find a better target
      let candidate = null;
      let current = element.parentElement;
      for (let i = 0; i < 5 && current && current !== document.body; i++) {
        // Check if parent is interactive
        if (INTERACTIVE_TAGS.has(current.tagName)) return current;
        const parentRole = current.getAttribute('role');
        if (parentRole && INTERACTIVE_ROLES.has(parentRole)) return current;

        // Check if parent has a reasonable visual size
        const rect = current.getBoundingClientRect();
        if (rect.width >= 32 && rect.height >= 32) {
          if (!candidate) candidate = current;
          // If the next parent is much wider, stop at current candidate
          const nextParent = current.parentElement;
          if (nextParent && nextParent !== document.body) {
            const nextRect = nextParent.getBoundingClientRect();
            if (nextRect.width > rect.width * 3) return candidate;
          }
        }
        current = current.parentElement;
      }

      return candidate || element;
    }

    _shouldUseTextHighlight(element) {
      if (!element || !element.isConnected) return false;

      const tagName = element.tagName;
      if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION'].includes(tagName)) return false;
      if (element.isContentEditable) return false;

      const text = (element.innerText || '').trim();
      if (!text) return false;

      const rect = element.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return false;

      const compactTarget = rect.height <= 72
        && rect.width <= Math.min(window.innerWidth * 0.8, 560);

      const role = element.getAttribute('role');
      if (tagName === 'A' || role === 'link') return compactTarget;

      const computed = window.getComputedStyle(element);
      const inlineDisplay = computed.display === 'inline'
        || computed.display === 'inline-block'
        || computed.display === 'inline-flex';

      return inlineDisplay
        && rect.height <= 56
        && rect.width <= Math.min(window.innerWidth * 0.75, 520);
    }

    _clampRect(rect) {
      if (!rect) return null;

      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(window.innerWidth, rect.left + rect.width);
      const bottom = Math.min(window.innerHeight, rect.top + rect.height);

      if (right <= left || bottom <= top) return null;

      return {
        left: Math.round(left * 100) / 100,
        top: Math.round(top * 100) / 100,
        width: Math.round((right - left) * 100) / 100,
        height: Math.round((bottom - top) * 100) / 100
      };
    }

    _mergeTextRects(rects) {
      if (!rects.length) return [];

      const sorted = rects
        .map(rect => this._clampRect(rect))
        .filter(Boolean)
        .sort((a, b) => (a.top - b.top) || (a.left - b.left));

      if (!sorted.length) return [];

      const merged = [];
      for (const rect of sorted) {
        const previous = merged[merged.length - 1];
        if (!previous) {
          merged.push({ ...rect });
          continue;
        }

        const sameLine = Math.abs(previous.top - rect.top) <= 3
          && Math.abs(previous.height - rect.height) <= 6;
        const closeEnough = rect.left <= (previous.left + previous.width + 12);

        if (sameLine && closeEnough) {
          const right = Math.max(previous.left + previous.width, rect.left + rect.width);
          previous.left = Math.min(previous.left, rect.left);
          previous.top = Math.min(previous.top, rect.top);
          previous.width = right - previous.left;
          previous.height = Math.max(previous.height, rect.height);
        } else {
          merged.push({ ...rect });
        }
      }

      return merged;
    }

    _getTextRects(element) {
      if (!element || !element.isConnected) return [];

      const range = document.createRange();
      try {
        range.selectNodeContents(element);
        const rawRects = Array.from(range.getClientRects())
          .filter(rect => rect.width >= 6 && rect.height >= 8)
          .map(rect => ({
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
          }));
        return this._mergeTextRects(rawRects);
      } catch (e) {
        return [];
      } finally {
        if (typeof range.detach === 'function') {
          range.detach();
        }
      }
    }

    _getUnionBounds(rects) {
      if (!rects.length) return null;

      let left = rects[0].left;
      let top = rects[0].top;
      let right = rects[0].left + rects[0].width;
      let bottom = rects[0].top + rects[0].height;

      for (let i = 1; i < rects.length; i++) {
        const rect = rects[i];
        left = Math.min(left, rect.left);
        top = Math.min(top, rect.top);
        right = Math.max(right, rect.left + rect.width);
        bottom = Math.max(bottom, rect.top + rect.height);
      }

      return this._clampRect({
        left,
        top,
        width: right - left,
        height: bottom - top
      });
    }

    _buildTextHighlightSpec(element) {
      const textRects = this._getTextRects(element);
      if (!textRects.length) return null;

      const expandedRects = textRects
        .map(rect => this._clampRect({
          left: rect.left - 4,
          top: rect.top - 2,
          width: rect.width + 8,
          height: rect.height + 4
        }))
        .filter(Boolean);

      if (!expandedRects.length) return null;

      return {
        mode: 'text',
        rects: expandedRects,
        bounds: this._getUnionBounds(expandedRects)
      };
    }

    _buildBoxHighlightSpec(element) {
      if (!element || !element.isConnected) return null;

      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const tagName = element.tagName;
      const paddingX = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) ? 4 : 6;
      const paddingY = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) ? 4 : (rect.height <= 40 ? 4 : 6);
      const expandedRect = this._clampRect({
        left: rect.left - paddingX,
        top: rect.top - paddingY,
        width: rect.width + paddingX * 2,
        height: rect.height + paddingY * 2
      });

      if (!expandedRect) return null;

      const computed = window.getComputedStyle(element);
      const rawRadius = parseFloat(computed.borderTopLeftRadius);
      const radius = Number.isFinite(rawRadius)
        ? Math.min(18, Math.max(6, rawRadius + 4))
        : (rect.height <= 36 ? 8 : 10);

      return {
        mode: 'box',
        rect: expandedRect,
        bounds: expandedRect,
        radius
      };
    }

    _buildHighlightSpec(element) {
      if (!element || !element.isConnected) return null;

      if (this._shouldUseTextHighlight(element)) {
        const textSpec = this._buildTextHighlightSpec(element);
        if (textSpec) return textSpec;
      }

      return this._buildBoxHighlightSpec(element);
    }

    _ensureBoxOverlay() {
      if (!this.overlayRoot || this.boxOverlay) return;

      this.boxOverlay = document.createElement('div');
      this.boxOverlay.className = 'box-overlay';
      this.overlayRoot.appendChild(this.boxOverlay);
    }

    _clearTextHighlights() {
      if (!this.overlayRoot) return;
      this.overlayRoot.querySelectorAll('.text-highlight').forEach(node => node.remove());
    }

    _renderTextHighlights(rects) {
      if (!this.overlayRoot) return;

      const existing = Array.from(this.overlayRoot.querySelectorAll('.text-highlight'));

      rects.forEach((rect, index) => {
        const node = existing[index] || document.createElement('div');
        if (!existing[index]) {
          node.className = 'text-highlight';
          this.overlayRoot.appendChild(node);
        }

        node.style.top = `${rect.top}px`;
        node.style.left = `${rect.left}px`;
        node.style.width = `${rect.width}px`;
        node.style.height = `${rect.height}px`;

        if (this._isVisible) {
          node.classList.add('active');
        } else {
          node.classList.remove('active');
        }
      });

      for (let i = rects.length; i < existing.length; i++) {
        existing[i].remove();
      }
    }

    _setActiveState(isActive) {
      this._isVisible = isActive;

      if (this.boxOverlay) {
        this.boxOverlay.classList.toggle('active', isActive && this.currentMode === 'box');
      }

      if (this.overlayRoot) {
        this.overlayRoot.querySelectorAll('.text-highlight').forEach(node => {
          node.classList.toggle('active', isActive && this.currentMode === 'text');
        });
      }
    }

    show(element) {
      // Destroy any existing overlay first
      this.destroy();

      // Find the best visual target to highlight
      this.targetElement = this._findHighlightTarget(element);

      // Create host element
      this.host = markOverlayElement(document.createElement('div'), 'action-glow-host');
      this.host.id = 'fsb-action-glow-host';
      // z-index kept as fallback; top-layer via Popover API is the primary mechanism
      this.host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important;pointer-events:none!important;margin:0!important;padding:0!important;border:none!important;background:none!important;';

      // Attach Shadow DOM
      this.shadow = this.host.attachShadow({ mode: 'closed' });

      // Inject styles
      const style = document.createElement('style');
      style.textContent = `
      @keyframes fsbActionGlow {
        0%, 100% {
          box-shadow:
            0 0 6px 2px rgba(255, 140, 0, 0.55),
            0 0 16px 4px rgba(255, 140, 0, 0.33),
            0 0 32px 8px rgba(255, 140, 0, 0.17),
            0 0 56px 12px rgba(255, 140, 0, 0.09);
          border-color: rgba(255, 140, 0, 0.77);
        }
        50% {
          box-shadow:
            0 0 10px 2px rgba(255, 140, 0, 0.77),
            0 0 20px 6px rgba(255, 140, 0, 0.50),
            0 0 40px 12px rgba(255, 140, 0, 0.28),
            0 0 64px 16px rgba(255, 140, 0, 0.13);
          border-color: rgba(255, 140, 0, 1);
        }
      }
      @keyframes fsbGlowAppear {
        0%   { transform: scale(1); }
        40%  { transform: scale(1.03); }
        100% { transform: scale(1); }
      }
      @keyframes fsb-trigger-pulse {
        0%, 100% {
          opacity: 0.55;
          transform: scale(1);
          border-color: rgba(255, 140, 0, 0.55);
          background: rgba(255, 140, 0, 0.03);
        }
        50% {
          opacity: 0.92;
          transform: scale(1.025);
          border-color: rgba(255, 166, 0, 0.85);
          background: rgba(255, 140, 0, 0.08);
        }
      }
      @keyframes fsbTextGlow {
        0%, 100% {
          background: linear-gradient(90deg, rgba(255, 140, 0, 0.30), rgba(255, 166, 0, 0.16));
          box-shadow:
            0 0 0 1px rgba(255, 140, 0, 0.24),
            0 0 10px rgba(255, 140, 0, 0.18);
        }
        50% {
          background: linear-gradient(90deg, rgba(255, 140, 0, 0.44), rgba(255, 166, 0, 0.24));
          box-shadow:
            0 0 0 1px rgba(255, 140, 0, 0.36),
            0 0 16px rgba(255, 140, 0, 0.24);
        }
      }
      .glow-root {
        position: fixed;
        inset: 0;
        pointer-events: none;
      }
      .box-overlay,
      .text-highlight {
        position: fixed;
        pointer-events: none;
        opacity: 0;
        will-change: top, left, width, height, opacity, transform;
      }
      .box-overlay {
        border: 2.5px solid rgba(255, 140, 0, 0.8);
        border-radius: 10px;
        transition: opacity 0.25s ease-out;
        animation: fsbActionGlow 1.5s ease-in-out infinite;
        background: rgba(255, 140, 0, 0.04);
      }
      .box-overlay.active {
        opacity: 1;
        animation: fsbActionGlow 1.5s ease-in-out infinite, fsbGlowAppear 0.3s ease-out;
      }
      .box-overlay.trigger-pulse,
      .box-overlay.trigger-pulse.active {
        opacity: 1;
        border-color: rgba(255, 140, 0, 0.65);
        background: rgba(255, 140, 0, 0.05);
        animation: fsb-trigger-pulse 2.4s ease-in-out infinite;
        will-change: opacity, transform, border-color, background;
      }
      .text-highlight {
        border-radius: 6px;
        transform: scale(0.985);
        transition: opacity 0.18s ease-out, transform 0.18s ease-out;
        background: linear-gradient(90deg, rgba(255, 140, 0, 0.30), rgba(255, 166, 0, 0.16));
        box-shadow:
          0 0 0 1px rgba(255, 140, 0, 0.24),
          0 0 10px rgba(255, 140, 0, 0.18);
      }
      .text-highlight.active {
        opacity: 1;
        transform: scale(1);
        animation: fsbTextGlow 1.3s ease-in-out infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .box-overlay,
        .text-highlight {
          transition: none;
        }
        .box-overlay.active,
        .text-highlight.active {
          animation: none;
        }
        .box-overlay.trigger-pulse,
        .box-overlay.trigger-pulse.active {
          animation: none;
          opacity: 1;
          transform: none;
          border-color: rgba(255, 140, 0, 0.75);
          background: rgba(255, 140, 0, 0.08);
        }
      }
    `;
      this.shadow.appendChild(style);

      this.overlayRoot = document.createElement('div');
      this.overlayRoot.className = 'glow-root';
      this.shadow.appendChild(this.overlayRoot);

      // Promote to top layer via Popover API for guaranteed rendering above all page content
      this._inTopLayer = promoteToTopLayer(this.host);
      if (!this._inTopLayer) {
        document.documentElement.appendChild(this.host);
      }

      // Position over element
      // Phase 229-01 (OVERLAY-02): initial sync compute, then mark cache clean
      // so the first rAF tick does not redundantly recompute.
      this._rectDirty = true;
      this._updatePosition();
      this._rectDirty = false;
      if (!this.currentGeometry) {
        this.destroy();
        return;
      }

      // Trigger fade-in on next frame
      requestAnimationFrame(() => {
        this._setActiveState(true);
      });

      // Start position tracking
      this._startTracking();

      // Broadcast glow position to dashboard DOM stream
      if (window.FSB && window.FSB.domStream && window.FSB.domStream.isStreaming()) {
        window.FSB.domStream.broadcastOverlayState();
      }
    }

    showPulse(element) {
      this.show(element);
      this._pulseMode = true;
      if (this.boxOverlay) {
        this.boxOverlay.classList.add('trigger-pulse');
      }
    }

    clearPulse() {
      this._pulseMode = false;
      if (this.boxOverlay) {
        this.boxOverlay.classList.remove('trigger-pulse');
      }
      this.destroy();
    }

    _updatePosition() {
      if (!this.targetElement || !this.overlayRoot) return;

      // Check if element is still in DOM
      if (!this.targetElement.isConnected) {
        this.destroy();
        return;
      }

      const spec = this._buildHighlightSpec(this.targetElement);
      if (!spec || !spec.bounds) {
        this.destroy();
        return;
      }

      this.currentMode = spec.mode;

      if (spec.mode === 'text') {
        if (this.boxOverlay) {
          this.boxOverlay.classList.remove('active');
          this.boxOverlay.style.display = 'none';
        }
        this._renderTextHighlights(spec.rects || []);
      } else {
        this._clearTextHighlights();
        this._ensureBoxOverlay();
        this.boxOverlay.style.display = 'block';
        this.boxOverlay.style.top = `${spec.rect.top}px`;
        this.boxOverlay.style.left = `${spec.rect.left}px`;
        this.boxOverlay.style.width = `${spec.rect.width}px`;
        this.boxOverlay.style.height = `${spec.rect.height}px`;
        this.boxOverlay.style.borderRadius = `${spec.radius || 10}px`;
        if (this._isVisible) {
          this.boxOverlay.classList.add('active');
        } else {
          this.boxOverlay.classList.remove('active');
        }
        if (this._pulseMode) {
          this.boxOverlay.classList.add('trigger-pulse');
        }
      }

      this.currentGeometry = {
        mode: spec.mode,
        x: spec.bounds.left,
        y: spec.bounds.top,
        w: spec.bounds.width,
        h: spec.bounds.height,
        fragments: spec.rects
          ? spec.rects.map(rect => ({
              x: rect.left,
              y: rect.top,
              w: rect.width,
              h: rect.height
            }))
          : null
      };
    }

    getStreamState() {
      if (!this.currentGeometry) return null;

      return {
        x: this.currentGeometry.x,
        y: this.currentGeometry.y,
        w: this.currentGeometry.w,
        h: this.currentGeometry.h,
        state: 'active',
        mode: this.currentGeometry.mode || 'box',
        fragments: this.currentGeometry.fragments || null
      };
    }

    _startTracking() {
      // Phase 229-01 (OVERLAY-02): attach invalidation listeners ONCE per lifecycle.
      // Cached rect is reused on every rAF tick until resize/scroll/show() fires.
      if (!this._listenersAttached) {
        this._onWindowChange = () => { this._rectDirty = true; };
        window.addEventListener('resize', this._onWindowChange);
        window.addEventListener('scroll', this._onWindowChange, { passive: true, capture: true });
        this._listenersAttached = true;
      }
      const track = () => {
        // PERF: Stop tracking if host element was removed from DOM (prevents RAF leak)
        if (!this.host || !document.documentElement.contains(this.host)) {
          this.trackingId = null;
          return;
        }
        // Cheap (no layout flush) connection check -- preserves destroy-on-disconnect.
        if (this.targetElement && !this.targetElement.isConnected) {
          this.destroy();
          return;
        }
        // Only recompute geometry when rect cache is dirty.
        if (this._rectDirty) {
          this._updatePosition();
          this._rectDirty = false;
        }
        if (this.targetElement) {
          this.trackingId = requestAnimationFrame(track);
        }
      };
      this.trackingId = requestAnimationFrame(track);
    }

    _stopTracking() {
      if (this.trackingId) {
        cancelAnimationFrame(this.trackingId);
        this.trackingId = null;
      }
      // Phase 229-01 (OVERLAY-02): remove invalidation listeners so they do not leak.
      if (this._listenersAttached && this._onWindowChange) {
        window.removeEventListener('resize', this._onWindowChange);
        window.removeEventListener('scroll', this._onWindowChange, { passive: true, capture: true });
        this._listenersAttached = false;
        this._onWindowChange = null;
      }
    }

    hide() {
      // Broadcast glow removal to dashboard DOM stream before clearing
      if (window.FSB && window.FSB.domStream && window.FSB.domStream.isStreaming()) {
        this.currentGeometry = null;
        this.targetElement = null;
        window.FSB.domStream.broadcastOverlayState();
      }

      this._stopTracking();

      this._setActiveState(false);

      // Wait for fade-out transition then clean up
      setTimeout(() => {
        if (this.host) {
          demoteFromTopLayer(this.host);
          this.host.remove();
        }
        this.host = null;
        this.shadow = null;
        this.overlayRoot = null;
        this.boxOverlay = null;
        this.targetElement = null;
        this.currentGeometry = null;
        this.currentMode = null;
        this._isVisible = false;
        this._pulseMode = false;
        this._inTopLayer = false;
      }, 250);
    }

    destroy() {
      // Broadcast glow removal to dashboard DOM stream
      if (window.FSB && window.FSB.domStream && window.FSB.domStream.isStreaming()) {
        this.currentGeometry = null;
        this.targetElement = null;
        window.FSB.domStream.broadcastOverlayState();
      }

      this._stopTracking();
      if (this.host) {
        demoteFromTopLayer(this.host);
        this.host.remove();
      }
      this.host = null;
      this.shadow = null;
      this.overlayRoot = null;
      this.boxOverlay = null;
      this.targetElement = null;
      this.currentGeometry = null;
      this.currentMode = null;
      this._isVisible = false;
      this._pulseMode = false;
      this._inTopLayer = false;
    }
  }

  // Singleton instance for action glow overlay
  const actionGlowOverlay = new ActionGlowOverlay();

  /**
   * ElementInspector - Debugging tool for inspecting elements as FSB sees them
   *
   * Allows users to hover over elements to see their bounds and click to inspect
   * detailed information including selectors FSB would try, attributes, and
   * interactability status. Uses Shadow DOM for complete style isolation.
   */
  class ElementInspector {
    constructor() {
      this.isActive = false;
      this.hoverOverlay = null;
      this.inspectionPanel = null;
      this.currentElement = null;
      this.activeIndicator = null;
      this.handleMouseMove = this.handleMouseMove.bind(this);
      this.handleClick = this.handleClick.bind(this);
    }

    enable() {
      if (this.isActive) return;
      this.isActive = true;
      this.createHoverOverlay();
      this.createInspectionPanel();
      this.createActiveIndicator();
      document.addEventListener('mousemove', this.handleMouseMove, true);
      document.addEventListener('click', this.handleClick, true);
    }

    disable() {
      if (!this.isActive) return;
      this.isActive = false;
      document.removeEventListener('mousemove', this.handleMouseMove, true);
      document.removeEventListener('click', this.handleClick, true);
      if (this.hoverOverlay) { demoteFromTopLayer(this.hoverOverlay); this.hoverOverlay.remove(); this.hoverOverlay = null; this._hoverInTopLayer = false; }
      if (this.inspectionPanel) { demoteFromTopLayer(this.inspectionPanel); this.inspectionPanel.remove(); this.inspectionPanel = null; this._panelInTopLayer = false; }
      if (this.activeIndicator) { demoteFromTopLayer(this.activeIndicator); this.activeIndicator.remove(); this.activeIndicator = null; this._indicatorInTopLayer = false; }
      this.currentElement = null;
    }

    createHoverOverlay() {
      if (this.hoverOverlay) return;
      this.hoverOverlay = markOverlayElement(document.createElement('div'), 'inspector-hover');
      this.hoverOverlay.id = 'fsb-inspector-overlay';
      // z-index kept as fallback; top-layer via Popover API is the primary mechanism
      // Use visibility:hidden instead of display:none for popover compatibility
      this.hoverOverlay.style.cssText = 'all:initial!important;position:fixed!important;pointer-events:none!important;z-index:2147483647!important;border:2px dashed #FF8C00!important;background:rgba(255,165,0,0.1)!important;visibility:hidden!important;box-sizing:border-box!important;margin:0!important;padding:0!important;inset:auto!important;';
      this._hoverInTopLayer = promoteToTopLayer(this.hoverOverlay);
      if (!this._hoverInTopLayer) {
        document.documentElement.appendChild(this.hoverOverlay);
      }
    }

    createInspectionPanel() {
      if (this.inspectionPanel) return;
      this.inspectionPanel = markOverlayElement(document.createElement('div'), 'inspector-panel');
      this.inspectionPanel.id = 'fsb-inspector-panel';
      // z-index kept as fallback; top-layer via Popover API is the primary mechanism
      // Use visibility:hidden instead of display:none for popover compatibility
      this.inspectionPanel.style.cssText = 'all:initial!important;position:fixed!important;inset:auto!important;bottom:20px!important;right:20px!important;z-index:2147483647!important;visibility:hidden!important;margin:0!important;padding:0!important;border:none!important;background:none!important;';
      const shadow = this.inspectionPanel.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = ':host{all:initial!important}*{box-sizing:border-box;margin:0;padding:0}.panel{width:350px;max-height:400px;overflow-y:auto;background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#333}.header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#FF8C00;color:#fff;border-radius:8px 8px 0 0;font-weight:600}.header-tag{font-size:14px}.badge{display:inline-block;background:rgba(255,255,255,0.2);padding:2px 6px;border-radius:4px;font-size:10px;margin-left:4px}.close-btn{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:0 4px;line-height:1}.close-btn:hover{opacity:0.8}.section{padding:12px 16px;border-bottom:1px solid #eee}.section:last-child{border-bottom:none}.section-title{font-weight:600;color:#666;margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px}.selector-list{list-style:none}.selector-item{display:flex;align-items:flex-start;margin-bottom:6px;gap:8px}.selector-index{background:#f0f0f0;color:#666;padding:2px 6px;border-radius:3px;font-size:10px;min-width:20px;text-align:center}.selector-value{font-family:Monaco,Menlo,monospace;font-size:11px;word-break:break-all;color:#0066cc}.attr-list{display:grid;grid-template-columns:auto 1fr;gap:4px 12px}.attr-key{font-weight:500;color:#666}.attr-value{font-family:Monaco,Menlo,monospace;font-size:11px;color:#333;word-break:break-all}.check-list{display:grid;grid-template-columns:1fr 1fr;gap:6px}.check-item{display:flex;align-items:center;gap:6px}.check-pass{color:#22c55e}.check-fail{color:#ef4444}.position-info{font-family:Monaco,Menlo,monospace;font-size:11px;color:#666}.text-preview{font-style:italic;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
      shadow.appendChild(style);
      const container = document.createElement('div');
      container.className = 'panel';
      container.innerHTML = '<div class="section">Click an element to inspect</div>';
      shadow.appendChild(container);
      this._panelInTopLayer = promoteToTopLayer(this.inspectionPanel);
      if (!this._panelInTopLayer) {
        document.documentElement.appendChild(this.inspectionPanel);
      }
    }

    createActiveIndicator() {
      if (this.activeIndicator) return;
      this.activeIndicator = markOverlayElement(document.createElement('div'), 'inspector-indicator');
      this.activeIndicator.id = 'fsb-inspector-indicator';
      // z-index kept as fallback; top-layer via Popover API is the primary mechanism
      this.activeIndicator.style.cssText = 'all:initial!important;position:fixed!important;inset:auto!important;top:10px!important;left:50%!important;transform:translateX(-50%)!important;z-index:2147483647!important;background:#FF8C00!important;color:#fff!important;padding:6px 16px!important;border-radius:20px!important;font-family:system-ui,-apple-system,sans-serif!important;font-size:12px!important;font-weight:600!important;box-shadow:0 2px 10px rgba(0,0,0,0.3)!important;pointer-events:none!important;margin:0!important;border:none!important;';
      this.activeIndicator.textContent = 'FSB Inspector Mode (Ctrl+Shift+E to exit)';
      this._indicatorInTopLayer = promoteToTopLayer(this.activeIndicator);
      if (!this._indicatorInTopLayer) {
        document.documentElement.appendChild(this.activeIndicator);
      }
    }

    handleMouseMove(e) {
      if (!this.isActive) return;
      const element = document.elementFromPoint(e.clientX, e.clientY);
      if (!element || this.isOwnElement(element)) return;
      if (element !== this.currentElement) {
        this.currentElement = element;
        this.updateOverlayPosition(element);
      }
    }

    handleClick(e) {
      if (!this.isActive) return;
      e.preventDefault();
      e.stopPropagation();
      const element = document.elementFromPoint(e.clientX, e.clientY);
      if (!element || this.isOwnElement(element)) return;
      this.showInspectionPanel(element);
    }

    isOwnElement(element) {
      return element === this.hoverOverlay || element === this.inspectionPanel || element === this.activeIndicator || this.inspectionPanel?.contains(element) || this.hoverOverlay?.contains(element) || this.activeIndicator?.contains(element);
    }

    updateOverlayPosition(element) {
      if (!this.hoverOverlay || !element) return;
      const rect = element.getBoundingClientRect();
      this.hoverOverlay.style.setProperty('top', rect.top + 'px', 'important');
      this.hoverOverlay.style.setProperty('left', rect.left + 'px', 'important');
      this.hoverOverlay.style.setProperty('width', rect.width + 'px', 'important');
      this.hoverOverlay.style.setProperty('height', rect.height + 'px', 'important');
      this.hoverOverlay.style.setProperty('visibility', 'visible', 'important');
    }

    getElementInspection(element) {
      if (!element) return null;
      const selectors = FSB.generateSelectors(element);
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        tagName: element.tagName,
        id: element.id || null,
        className: FSB.getClassName(element) || null,
        selectors: selectors,
        preferredSelector: selectors[0]?.selector || null,
        attributes: {
          'data-testid': element.getAttribute('data-testid'),
          'aria-label': element.getAttribute('aria-label'),
          'role': element.getAttribute('role'),
          'type': element.type || null,
          'name': element.name || null,
          'href': element.href || null,
          'value': element.value ? element.value.substring(0, 50) : null
        },
        interactability: {
          isVisible: style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0,
          isEnabled: !element.disabled,
          isInViewport: rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth,
          receivesPointerEvents: style.pointerEvents !== 'none'
        },
        boundingRect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        text: element.innerText ? element.innerText.substring(0, 100) : null
      };
    }

    showInspectionPanel(element) {
      const inspection = this.getElementInspection(element);
      if (!inspection || !this.inspectionPanel) return;
      const shadow = this.inspectionPanel.shadowRoot;
      const container = shadow.querySelector('.panel');
      if (!container) return;
      let headerContent = '<span class="header-tag">&lt;' + inspection.tagName.toLowerCase() + '&gt;</span>';
      if (inspection.id) headerContent += '<span class="badge">#' + inspection.id + '</span>';
      let selectorsHtml = '<ul class="selector-list">';
      inspection.selectors.forEach((sel, idx) => {
        const uniqueIcon = sel.isUnique ? ' [unique]' : ' [' + sel.matchCount + ' matches]';
        selectorsHtml += '<li class="selector-item"><span class="selector-index">' + (idx + 1) + '</span><span class="selector-value">' + this.escapeHtml(sel.selector) + uniqueIcon + '</span></li>';
      });
      selectorsHtml += '</ul>';
      let attrsHtml = '<div class="attr-list">';
      let hasAttrs = false;
      for (const [key, value] of Object.entries(inspection.attributes)) {
        if (value !== null && value !== undefined) {
          hasAttrs = true;
          attrsHtml += '<span class="attr-key">' + key + ':</span><span class="attr-value">' + this.escapeHtml(String(value)) + '</span>';
        }
      }
      attrsHtml += '</div>';
      const checks = inspection.interactability;
      const checkIcon = (pass) => pass ? '<span class="check-pass">OK</span>' : '<span class="check-fail">FAIL</span>';
      const interactHtml = '<div class="check-list"><div class="check-item">' + checkIcon(checks.isVisible) + ' Visible</div><div class="check-item">' + checkIcon(checks.isEnabled) + ' Enabled</div><div class="check-item">' + checkIcon(checks.isInViewport) + ' In Viewport</div><div class="check-item">' + checkIcon(checks.receivesPointerEvents) + ' Pointer Events</div></div>';
      const pos = inspection.boundingRect;
      const positionHtml = '<span class="position-info">x: ' + pos.x + ', y: ' + pos.y + ', w: ' + pos.width + ', h: ' + pos.height + '</span>';
      let textHtml = '';
      if (inspection.text) textHtml = '<div class="section"><div class="section-title">Text Content</div><div class="text-preview">' + this.escapeHtml(inspection.text) + '</div></div>';
      container.innerHTML = '<div class="header"><div>' + headerContent + '</div><button class="close-btn" id="fsb-close-panel">x</button></div><div class="section"><div class="section-title">Selectors FSB Would Try</div>' + selectorsHtml + '</div>' + (hasAttrs ? '<div class="section"><div class="section-title">Attributes</div>' + attrsHtml + '</div>' : '') + '<div class="section"><div class="section-title">Interactability</div>' + interactHtml + '</div><div class="section"><div class="section-title">Position</div>' + positionHtml + '</div>' + textHtml;
      const closeBtn = shadow.querySelector('#fsb-close-panel');
      if (closeBtn) closeBtn.addEventListener('click', () => { this.inspectionPanel.style.setProperty('visibility', 'hidden', 'important'); });
      this.inspectionPanel.style.setProperty('visibility', 'visible', 'important');
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // Singleton instance for element inspector
  const elementInspector = new ElementInspector();

  // Keyboard shortcut to toggle inspection mode (Ctrl+Shift+E)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      if (elementInspector.isActive) elementInspector.disable();
      else elementInspector.enable();
    }
  });

  /**
   * CrawlProgressOverlay - In-page progress indicator for site crawler
   *
   * Uses Shadow DOM for complete style isolation from host page.
   * Shows domain, page count, progress bar, and current pathname.
   * Positioned in bottom-right corner to avoid conflict with ProgressOverlay (top-right).
   * Blue accent color (#38bdf8) to distinguish from automation's orange.
   * Promoted to top layer via Popover API.
   */
  class CrawlProgressOverlay {
    constructor() {
      this.host = null;
      this.shadow = null;
      this.container = null;
    }

    /**
     * Create the overlay in Shadow DOM if not already created
     */
    create() {
      if (this.host) return;

      this.host = markOverlayElement(document.createElement('div'), 'crawl-progress-host');
      this.host.id = 'fsb-crawl-progress-host';
      this.host.style.cssText = `
      all: initial !important;
      display: block !important;
      position: fixed !important;
      inset: auto !important;
      bottom: 16px !important;
      right: 16px !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      background: none !important;
    `;

      this.shadow = this.host.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = `
      :host {
        display: block !important;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      .fsb-crawl-overlay {
        width: 280px;
        background: rgba(15, 23, 42, 0.92);
        color: #ffffff;
        padding: 12px 16px;
        border-radius: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(56, 189, 248, 0.3);
        pointer-events: auto;
        opacity: 1;
        transition: opacity 0.2s ease-out;
        contain: paint;
      }
      .fsb-crawl-overlay.hidden {
        opacity: 0;
        pointer-events: none;
      }
      .fsb-crawl-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .fsb-crawl-logo {
        width: 18px;
        height: 18px;
        border-radius: 4px;
        object-fit: contain;
      }
      .fsb-crawl-title {
        font-weight: 600;
        color: #38bdf8;
        font-size: 12px;
      }
      .fsb-crawl-domain {
        color: rgba(255, 255, 255, 0.8);
        font-size: 12px;
        margin-bottom: 6px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .fsb-crawl-count {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      }
      .fsb-crawl-pages {
        color: rgba(255, 255, 255, 0.7);
        font-size: 11px;
      }
      .fsb-crawl-percent {
        background: rgba(56, 189, 248, 0.2);
        color: #38bdf8;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
      }
      .fsb-crawl-progress-bar {
        height: 4px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 6px;
      }
      .fsb-crawl-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #0ea5e9, #38bdf8);
        border-radius: 2px;
        transition: width 0.3s ease-out;
      }
      .fsb-crawl-path {
        color: rgba(255, 255, 255, 0.5);
        font-size: 10px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `;
      this.shadow.appendChild(style);

      this.container = document.createElement('div');
      this.container.className = 'fsb-crawl-overlay';
      this.container.innerHTML = `
      <div class="fsb-crawl-header">
        <img class="fsb-crawl-logo" src="" alt="FSB">
        <span class="fsb-crawl-title">FSB Crawling</span>
      </div>
      <div class="fsb-crawl-domain">--</div>
      <div class="fsb-crawl-count">
        <span class="fsb-crawl-pages">0 / 0 pages</span>
        <span class="fsb-crawl-percent">0%</span>
      </div>
      <div class="fsb-crawl-progress-bar">
        <div class="fsb-crawl-progress-fill" style="width: 0%"></div>
      </div>
      <div class="fsb-crawl-path"></div>
    `;

      // Set logo
      const logoImg = this.container.querySelector('.fsb-crawl-logo');
      logoImg.src = chrome.runtime.getURL('assets/icon48.png');

      this.shadow.appendChild(this.container);

      this._inTopLayer = promoteToTopLayer(this.host);
      if (!this._inTopLayer) {
        document.documentElement.appendChild(this.host);
      }
    }

    /**
     * Update overlay content
     * @param {Object} data
     * @param {string} data.domain
     * @param {number} data.pagesCollected
     * @param {number} data.maxPages
     * @param {string} data.currentPath
     * @param {number} data.percent
     */
    update(data) {
      if (!this.container) return;

      if (data.domain !== undefined) {
        this.container.querySelector('.fsb-crawl-domain').textContent = 'Crawling ' + data.domain;
      }
      if (data.pagesCollected !== undefined && data.maxPages !== undefined) {
        this.container.querySelector('.fsb-crawl-pages').textContent = data.pagesCollected + ' / ' + data.maxPages + ' pages';
      }
      if (data.percent !== undefined) {
        const clamped = Math.min(100, Math.max(0, data.percent));
        this.container.querySelector('.fsb-crawl-percent').textContent = clamped + '%';
        this.container.querySelector('.fsb-crawl-progress-fill').style.width = clamped + '%';
      }
      if (data.currentPath !== undefined) {
        this.container.querySelector('.fsb-crawl-path').textContent = data.currentPath || '';
      }
    }

    /**
     * Remove overlay from DOM completely
     */
    destroy() {
      if (this.host) {
        demoteFromTopLayer(this.host);
        this.host.remove();
        this.host = null;
        this.shadow = null;
        this.container = null;
        this._inTopLayer = false;
      }
    }
  }

  // Singleton instance for crawl progress overlay
  const crawlProgressOverlay = new CrawlProgressOverlay();

  // VIS-07: Clean up visual feedback on page navigation/unload
  // PERF: Also disconnect MutationObservers to prevent orphaned observers on BFCache navigation
  window.addEventListener('beforeunload', () => {
    try {
      // Clear the overlay watchdog timer on page unload
      if (FSB._overlayWatchdogTimer) {
        clearTimeout(FSB._overlayWatchdogTimer);
        FSB._overlayWatchdogTimer = null;
      }
      viewportGlow.destroy();
      actionGlowOverlay.destroy();
      highlightManager.cleanup();
      progressOverlay.destroy();
      crawlProgressOverlay.destroy();
      elementInspector.disable();
      FSB.overlayState = null;
      // Disconnect MutationObservers to prevent leaks on BFCache/re-injection
      if (FSB.domStateManager && FSB.domStateManager.mutationObserver) {
        FSB.domStateManager.mutationObserver.disconnect();
      }
      if (FSB.elementCache && FSB.elementCache.observer) {
        FSB.elementCache.observer.disconnect();
      }
    } catch (e) { /* ignore cleanup errors on unload */ }
  });

  window.addEventListener('pagehide', (e) => {
    if (e.persisted) return;
    try {
      actionGlowOverlay.destroy();
    } catch (_err) { /* ignore cleanup errors on pagehide */ }
  });

  // ============================================================================
  // Attach all exports to FSB namespace
  // ============================================================================

  // Classes (for potential subclassing or testing)
  FSB.HighlightManager = HighlightManager;
  FSB.ProgressOverlay = ProgressOverlay;
  FSB.ViewportGlow = ViewportGlow;
  FSB.ActionGlowOverlay = ActionGlowOverlay;
  FSB.TriggerBadge = TriggerBadge;
  FSB.ElementInspector = ElementInspector;
  FSB.CrawlProgressOverlay = CrawlProgressOverlay;

  // Singleton instances
  FSB.highlightManager = highlightManager;
  FSB.progressOverlay = progressOverlay;
  FSB.viewportGlow = viewportGlow;
  FSB.actionGlowOverlay = actionGlowOverlay;
  FSB.triggerBadge = triggerBadge;
  FSB.elementInspector = elementInspector;
  FSB.crawlProgressOverlay = crawlProgressOverlay;

  // Utility functions
  FSB.promoteToTopLayer = promoteToTopLayer;
  FSB.demoteFromTopLayer = demoteFromTopLayer;

  // Shared mutable state
  FSB.lastActionStatusText = lastActionStatusText;

  window.FSB._modules['visual-feedback'] = { loaded: true, timestamp: Date.now() };

  // Phase 229-01: test-only export hook (CommonJS) so jsdom-free node tests
  // can construct ProgressOverlay/ActionGlowOverlay in isolation. Production
  // Chrome extension context never enters this branch (no module global).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ProgressOverlay: ProgressOverlay,
      ActionGlowOverlay: ActionGlowOverlay,
      PROGRESS_TEXT_DEBOUNCE_MS: PROGRESS_TEXT_DEBOUNCE_MS
    };
  }
})();
