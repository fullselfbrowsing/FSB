// Action Verification Module for FSB
// Provides post-action verification to ensure actions have their intended effects
//
// Phase 245 (v0.9.60) added the change_report builder pipeline:
//   - startMutationHarvest / stopMutationHarvest: scoped MutationObserver lifecycle (D-02)
//   - buildChangeReport: D-04 output shape with D-03 filter rules and D-08 cross-origin path
//   - applyChangeReportSizeCap: ~2400 byte (~600 token) truncation per D-04
// Existing capturePageState / comparePageStates remain byte-identical (used by stuck
// detection per D-10).

// Animation-class regex (D-03): matches common framework animation/transition classes
// so that class flips that are pure visual noise are filtered out of attrs_changed.
const ANIMATION_CLASS_RE = /(^|\s)(animate-|motion-|[\w-]+-(enter|leave|active|show|hide))/i;

// D-04 size cap: serialized payload budget in bytes (~600 tokens).
const CHANGE_REPORT_SIZE_CAP_BYTES = 2400;

// D-04 array slice limits when truncating.
const CAP_DIALOGS = 3;
const CAP_NODES_ADDED = 5;
const CAP_NODES_REMOVED = 5;
const CAP_ATTRS_CHANGED = 8;

// Text snippet caps (T-245-01 mitigation).
const TEXT_SNIPPET_MAX = 80;

/**
 * Safely extract className as a string (SVG elements have SVGAnimatedString, not a string)
 */
function getClassNameSafe(element) {
  if (!element) return '';
  const cn = element.className;
  if (typeof cn === 'string') return cn;
  if (cn && typeof cn.baseVal === 'string') return cn.baseVal;
  return '';
}

/**
 * Captures the current state of the page for comparison
 */
function capturePageState() {
  const state = {
    url: window.location.href,
    title: document.title,
    bodyText: document.body.innerText.substring(0, 1000), // First 1000 chars
    elementCount: document.querySelectorAll('*').length,
    inputValues: {},
    visibleElements: [],
    timestamp: Date.now()
  };

  // Capture input values
  const inputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
  inputs.forEach((input, index) => {
    if (index < 20) { // Limit to first 20 inputs
      const key = input.id || input.name || `input_${index}`;
      state.inputValues[key] = input.value || input.textContent || '';
    }
  });

  // Capture visible elements
  const visibleSelectors = ['button', 'a', '[role="button"]', '[onclick]', '.modal', '.dialog', '.popup'];
  visibleSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el, index) => {
      if (index < 10 && el.offsetWidth > 0 && el.offsetHeight > 0) {
        state.visibleElements.push({
          tag: el.tagName,
          text: (el.textContent || '').trim().substring(0, 50),
          selector: el.id ? `#${el.id}` : getClassNameSafe(el) ? `.${getClassNameSafe(el).split(' ')[0]}` : el.tagName.toLowerCase()
        });
      }
    });
  });

  return state;
}

/**
 * Compares two page states and returns what changed
 */
function comparePageStates(before, after) {
  const changes = {
    urlChanged: before.url !== after.url,
    titleChanged: before.title !== after.title,
    contentChanged: before.bodyText !== after.bodyText,
    elementCountChanged: Math.abs(before.elementCount - after.elementCount) > 5, // Allow small changes
    inputValuesChanged: {},
    newVisibleElements: [],
    timeDiff: after.timestamp - before.timestamp
  };
  
  // Check input value changes
  for (const key in after.inputValues) {
    if (before.inputValues[key] !== after.inputValues[key]) {
      changes.inputValuesChanged[key] = {
        before: before.inputValues[key],
        after: after.inputValues[key]
      };
    }
  }
  
  // Check for new visible elements (like modals, popups)
  after.visibleElements.forEach(afterEl => {
    const existed = before.visibleElements.some(beforeEl => 
      beforeEl.selector === afterEl.selector && beforeEl.text === afterEl.text
    );
    if (!existed) {
      changes.newVisibleElements.push(afterEl);
    }
  });
  
  // Determine if significant changes occurred
  changes.hasSignificantChanges = 
    changes.urlChanged || 
    changes.titleChanged || 
    changes.elementCountChanged ||
    Object.keys(changes.inputValuesChanged).length > 0 ||
    changes.newVisibleElements.length > 0;
    
  return changes;
}

/**
 * Waits for DOM to stabilize with a timeout.
 * PERF: Uses MutationObserver instead of polling document.body.innerHTML
 * which was extremely expensive on large pages (full serialization every 100ms).
 */
async function waitForDOMStable(maxWait = 3000) {
  const startTime = Date.now();
  let lastChangeTime = Date.now();

  return new Promise((resolve) => {
    let observer;
    let checkTimer;

    const cleanup = () => {
      if (observer) observer.disconnect();
      if (checkTimer) clearInterval(checkTimer);
    };

    // Track DOM mutations via MutationObserver (lightweight)
    observer = new MutationObserver(() => {
      lastChangeTime = Date.now();
    });

    observer.observe(document.body, {
      childList: true,
      attributes: true,
      subtree: true,
      characterData: true
    });

    // Periodically check if DOM has been stable long enough
    checkTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const stableTime = Date.now() - lastChangeTime;

      if (stableTime > 500 || elapsed > maxWait) {
        cleanup();
        resolve({
          stable: stableTime > 500,
          waitTime: elapsed,
          reason: stableTime > 500 ? 'dom_stable' : 'timeout'
        });
      }
    }, 100);
  });
}

/**
 * Verifies a click action had an effect
 */
async function verifyClickEffect(selector, preClickState) {
  // Wait for DOM to stabilize
  const stabilityResult = await waitForDOMStable();

  // Capture post-click state
  const postClickState = capturePageState();

  // FIX: Early success return if URL changed - navigation definitely worked
  // This prevents false negatives where clicks are reported as "no effect" despite navigating
  if (postClickState.url !== preClickState.url) {
    return {
      verified: true,
      changes: { urlChanged: true, navigated: true },
      effects: { navigation: true },
      stabilityResult,
      selector,
      suggestion: null
    };
  }

  // Compare states
  const changes = comparePageStates(preClickState, postClickState);

  // FIX: If DOM element count changed significantly, click definitely worked
  // This catches cases where content updates but URL stays the same
  if (Math.abs(postClickState.elementCount - preClickState.elementCount) > 10) {
    return {
      verified: true,
      changes: { domChanged: true, elementCountDelta: postClickState.elementCount - preClickState.elementCount },
      effects: { contentUpdate: true },
      stabilityResult,
      selector,
      suggestion: null
    };
  }

  // Check for specific click effects
  const clickEffects = {
    navigationStarted: changes.urlChanged,
    modalOpened: changes.newVisibleElements.some(el =>
      el.selector.includes('modal') || el.selector.includes('dialog') || el.selector.includes('popup')
    ),
    formSubmitted: changes.urlChanged || changes.contentChanged,
    dropdownOpened: changes.newVisibleElements.length > 2, // Multiple new elements suggest dropdown
    loadingStarted: document.querySelector('.loading, .spinner, [class*="load"]') !== null,
    contentUpdated: changes.contentChanged && !changes.urlChanged
  };

  // Determine if click was effective
  const wasEffective = changes.hasSignificantChanges || Object.values(clickEffects).some(v => v);

  return {
    verified: wasEffective,
    changes,
    effects: clickEffects,
    stabilityResult,
    selector,
    suggestion: wasEffective ? null : 'Click may not have had the intended effect'
  };
}

/**
 * Verifies a type action entered the text correctly
 */
function verifyTypeEffect(element, expectedText) {
  const actualValue = element.value || element.textContent || element.innerText || '';
  const isExactMatch = actualValue === expectedText;
  const containsText = actualValue.includes(expectedText);
  
  return {
    verified: isExactMatch || containsText,
    exactMatch: isExactMatch,
    containsText: containsText,
    actualValue,
    expectedText,
    suggestion: !containsText ? 'Text was not entered correctly' : null
  };
}

/**
 * Verifies navigation occurred
 */
async function verifyNavigationEffect(expectedUrl, preNavState) {
  // Wait a bit for navigation to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const currentUrl = window.location.href;
  const urlChanged = currentUrl !== preNavState.url;
  const isExpectedUrl = expectedUrl ? currentUrl.includes(expectedUrl) : urlChanged;
  
  return {
    verified: isExpectedUrl,
    urlChanged,
    previousUrl: preNavState.url,
    currentUrl,
    expectedUrl,
    suggestion: !isExpectedUrl ? 'Navigation did not occur as expected' : null
  };
}

// =============================================================================
// Phase 245 -- change_report builder pipeline
// =============================================================================

/**
 * Build a stable selector for an element using the heuristic from D-04:
 *   prefer #id  ->  tag.first-class  ->  tag (lowercase).
 * Caller-tolerant: returns '' if element is missing or not an Element-shaped
 * object (text nodes / comment nodes do not have getAttribute).
 */
function buildNodeSelector(node) {
  if (!node) return '';
  // Text/comment nodes: no selector available; describe via parent.
  if (typeof node.tagName !== 'string') return '';
  const tag = node.tagName.toLowerCase();
  const id = (typeof node.getAttribute === 'function') ? node.getAttribute('id') : null;
  if (id) return `#${id}`;
  const cn = getClassNameSafe(node);
  if (cn) {
    const first = cn.trim().split(/\s+/)[0];
    if (first) return `${tag}.${first}`;
  }
  return tag;
}

/**
 * Truncate a text snippet to TEXT_SNIPPET_MAX with no trailing whitespace.
 */
function snippetText(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (s.length <= TEXT_SNIPPET_MAX) return s;
  return s.slice(0, TEXT_SNIPPET_MAX);
}

/**
 * D-02 scope helper: walk up to 3 parents looking for a stable ancestor
 * (<form>, <dialog>, <main>). If none found, return the 3rd ancestor (or the
 * deepest available). If targetSelector cannot be resolved, return
 * document.documentElement so the observer still has a root.
 */
function resolveScopeRoot(targetSelector) {
  if (typeof document === 'undefined') return null;
  let target = null;
  if (targetSelector && typeof document.querySelector === 'function') {
    try { target = document.querySelector(targetSelector); } catch (_) { target = null; }
  }
  if (!target) {
    return (document && document.documentElement) ? document.documentElement : null;
  }
  let cur = target.parentElement || null;
  let steps = 0;
  while (cur && steps < 3) {
    const tag = (cur.tagName || '').toLowerCase();
    if (tag === 'form' || tag === 'dialog' || tag === 'main') return cur;
    cur = cur.parentElement || null;
    steps++;
  }
  // Fall back to the highest ancestor we walked, or documentElement.
  return cur || target.parentElement || document.documentElement || null;
}

/**
 * D-02: Start scoped MutationObserver. Returns a handle the caller passes back
 * to stopMutationHarvest. Records are buffered into handle.mutations.
 */
function startMutationHarvest(targetSelector) {
  const handle = {
    observer: null,
    mutations: [],
    startedAt: Date.now(),
    scopeRoot: null
  };
  if (typeof MutationObserver === 'undefined') return handle;
  const root = resolveScopeRoot(targetSelector);
  handle.scopeRoot = root;
  if (!root) return handle;
  const observer = new MutationObserver((records) => {
    for (let i = 0; i < records.length; i++) handle.mutations.push(records[i]);
  });
  try {
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true
    });
    handle.observer = observer;
  } catch (_) {
    // Observation failed (detached node?). Keep handle but with no observer.
  }
  return handle;
}

/**
 * D-02: Stop the harvest. Returns { mutations, settle_ms } so the builder can
 * use settle_ms when options.settleMs is not supplied.
 */
function stopMutationHarvest(handle) {
  const settleMs = handle && handle.startedAt ? Date.now() - handle.startedAt : 0;
  if (handle && handle.observer && typeof handle.observer.disconnect === 'function') {
    try { handle.observer.disconnect(); } catch (_) { /* swallow */ }
  }
  return {
    mutations: (handle && Array.isArray(handle.mutations)) ? handle.mutations : [],
    settle_ms: settleMs
  };
}

/**
 * D-03 filter: returns true if the mutation is pure noise that should be
 * dropped before populating nodes_added / nodes_removed / attrs_changed.
 */
function isNoiseMutation(record) {
  if (!record) return true;
  const type = record.type;
  // Drop characterData mutations whose new text is < 3 chars.
  if (type === 'characterData') {
    const newVal = (record.target && typeof record.target.textContent === 'string')
      ? record.target.textContent : '';
    const oldVal = record.oldValue || '';
    const delta = (newVal.length - oldVal.length);
    // Filter when both values are short OR the delta is sub-3 chars (e.g. counter ticks).
    if (newVal.trim().length < 3 && oldVal.trim().length < 3) return true;
    if (Math.abs(delta) < 3 && newVal.trim().length < 3) return true;
    return false;
  }
  if (type === 'attributes') {
    const attr = record.attributeName || '';
    // Style-only mutations are noise.
    if (attr === 'style') return true;
    // Scroll position attribute mutations.
    if (attr === 'scrollTop' || attr === 'scrollLeft') return true;
    if (attr === 'class') {
      const newClass = record.target ? getClassNameSafe(record.target) : '';
      const oldClass = record.oldValue || '';
      // If only animation classes flipped on/off, drop it.
      const onlyAnim = ANIMATION_CLASS_RE.test(newClass) || ANIMATION_CLASS_RE.test(oldClass);
      // True noise: at least one side matches the animation pattern AND there
      // is no non-animation class delta. Cheap heuristic: tokens diff.
      if (onlyAnim) {
        const oldTokens = new Set(oldClass.split(/\s+/).filter(Boolean));
        const newTokens = new Set(newClass.split(/\s+/).filter(Boolean));
        let hasNonAnimDelta = false;
        for (const tok of newTokens) {
          if (!oldTokens.has(tok) && !ANIMATION_CLASS_RE.test(tok)) { hasNonAnimDelta = true; break; }
        }
        if (!hasNonAnimDelta) {
          for (const tok of oldTokens) {
            if (!newTokens.has(tok) && !ANIMATION_CLASS_RE.test(tok)) { hasNonAnimDelta = true; break; }
          }
        }
        if (!hasNonAnimDelta) return true;
      }
    }
    // aria-hidden=true that stayed hidden: drop.
    if (attr === 'aria-hidden') {
      const newVal = (record.target && typeof record.target.getAttribute === 'function')
        ? record.target.getAttribute('aria-hidden') : null;
      if (newVal === 'true' && record.oldValue === 'true') return true;
    }
    return false;
  }
  return false;
}

/**
 * D-04 dialog detection: an added node is dialog-like when its tag is DIALOG,
 * its role attribute is dialog/alertdialog, or it carries a class hint
 * (modal/popup) AND has positive offsetWidth (visible).
 */
function isDialogNode(node) {
  if (!node || typeof node.tagName !== 'string') return false;
  const tag = node.tagName.toLowerCase();
  if (tag === 'dialog') return true;
  let role = null;
  if (typeof node.getAttribute === 'function') {
    try { role = node.getAttribute('role'); } catch (_) { role = null; }
  }
  if (role === 'dialog' || role === 'alertdialog') return true;
  const cn = getClassNameSafe(node);
  if (cn && /(^|\s)(modal|popup)(\s|$)/i.test(cn)) {
    const w = (typeof node.offsetWidth === 'number') ? node.offsetWidth : 1;
    return w > 0;
  }
  return false;
}

/**
 * D-04: Build a change_report from before/after page-state captures plus a
 * raw mutations array. options:
 *   - crossOrigin: bool   -- D-08 short-circuit
 *   - settleMs: number    -- override settle_ms (otherwise 0)
 *   - mutationCount: number -- override mutation_count (otherwise mutations.length)
 *
 * Returns the D-04 shape. Does NOT apply size cap; caller should pass through
 * applyChangeReportSizeCap when emitting to the wire.
 */
function buildChangeReport(beforeState, afterState, mutations, options) {
  const before = beforeState || {};
  const after = afterState || {};
  const opts = options || {};

  const urlBefore = before.url == null ? null : before.url;
  const urlAfter = after.url == null ? null : after.url;
  const urlChanged = urlBefore !== urlAfter;

  // D-08 cross-origin: emit URL-only report.
  if (opts.crossOrigin === true) {
    return {
      url: { before: urlBefore, after: urlAfter, changed: urlChanged },
      title_changed: false,
      dialogs_opened: [],
      nodes_added: [],
      nodes_removed: [],
      attrs_changed: [],
      inputs_changed: {},
      focus_shift: null,
      mutation_count: 0,
      settle_ms: 0,
      truncated: false,
      cross_origin: true
    };
  }

  const rawMutations = Array.isArray(mutations) ? mutations : [];
  const mutationCount = (typeof opts.mutationCount === 'number')
    ? opts.mutationCount
    : rawMutations.length;

  const nodesAdded = [];
  const nodesRemoved = [];
  const attrsChanged = [];
  const dialogsOpened = [];
  const seenDialogSelectors = new Set();

  // D-25 (Phase 69): optional redaction data from the page-side harvest.
  // Non-array values are ignored; without these fields, and without a
  // valueRedacted record, every branch below is today's code path.
  const beforeRedacted = Array.isArray(before.redactedInputKeys) ? before.redactedInputKeys : null;
  const afterRedacted = Array.isArray(after.redactedInputKeys) ? after.redactedInputKeys : null;
  const changedRedacted = Array.isArray(after.redactedInputsChanged) ? after.redactedInputsChanged : null;
  const redactedKeys = (beforeRedacted || afterRedacted || changedRedacted)
    ? new Set([].concat(beforeRedacted || [], afterRedacted || [], changedRedacted || []))
    : null;

  for (let i = 0; i < rawMutations.length; i++) {
    const rec = rawMutations[i];
    if (isNoiseMutation(rec)) continue;
    const type = rec.type;
    if (type === 'childList') {
      const added = rec.addedNodes || [];
      for (let j = 0; j < added.length; j++) {
        const n = added[j];
        if (!n || typeof n.tagName !== 'string') continue;
        const selector = buildNodeSelector(n);
        const text = snippetText(n.textContent || '');
        nodesAdded.push({ tag: n.tagName.toLowerCase(), text, selector });
        if (isDialogNode(n) && !seenDialogSelectors.has(selector)) {
          dialogsOpened.push({ selector, text });
          seenDialogSelectors.add(selector);
        }
      }
      const removed = rec.removedNodes || [];
      for (let j = 0; j < removed.length; j++) {
        const n = removed[j];
        if (!n || typeof n.tagName !== 'string') continue;
        nodesRemoved.push({
          tag: n.tagName.toLowerCase(),
          text: snippetText(n.textContent || ''),
          selector: buildNodeSelector(n)
        });
      }
    } else if (type === 'attributes') {
      const target = rec.target;
      const attr = rec.attributeName || '';
      let afterVal = null;
      if (target && typeof target.getAttribute === 'function') {
        try { afterVal = target.getAttribute(attr); } catch (_) { afterVal = null; }
      }
      let beforeOut = rec.oldValue == null ? null : String(rec.oldValue);
      let afterOut = afterVal == null ? null : String(afterVal);
      // D-25: a 'value' attribute record on a sensitive input is masked on
      // both sides when the page flagged it, or when its target id is a
      // listed sensitive key (defence in depth). The flag is not copied.
      if (attr === 'value' && (rec.valueRedacted === true || _fsbRedactionListsTarget(redactedKeys, target))) {
        beforeOut = _fsbRedactChangeValue(beforeOut);
        afterOut = _fsbRedactChangeValue(afterOut);
      }
      attrsChanged.push({
        selector: buildNodeSelector(target),
        attr,
        before: beforeOut,
        after: afterOut
      });
    }
    // characterData mutations that survive the noise filter could be surfaced
    // as nodes_added entries on the parent, but D-04 has no dedicated bucket;
    // we leave them counted in mutation_count only.
  }

  // inputs_changed (D-04): delta of before.inputValues vs after.inputValues.
  const inputsChanged = {};
  const beforeInputs = (before.inputValues && typeof before.inputValues === 'object') ? before.inputValues : {};
  const afterInputs = (after.inputValues && typeof after.inputValues === 'object') ? after.inputValues : {};
  for (const key in afterInputs) {
    if (beforeInputs[key] !== afterInputs[key]) {
      inputsChanged[key] = { before: beforeInputs[key] == null ? '' : beforeInputs[key], after: afterInputs[key] };
    }
  }
  for (const key in beforeInputs) {
    if (!(key in afterInputs)) {
      inputsChanged[key] = { before: beforeInputs[key], after: '' };
    }
  }
  if (redactedKeys) {
    // D-25: a secret that changed is still reported as changed, although the
    // page already replaced both values with the same marker.
    if (changedRedacted) {
      for (let i = 0; i < changedRedacted.length; i++) {
        const key = changedRedacted[i];
        if (typeof key !== 'string' || Object.prototype.hasOwnProperty.call(inputsChanged, key)) continue;
        inputsChanged[key] = {
          before: beforeInputs[key] == null ? '' : beforeInputs[key],
          after: afterInputs[key] == null ? '' : afterInputs[key]
        };
      }
    }
    // Defence in depth: mask every listed key again, whatever the page sent.
    for (const key of redactedKeys) {
      if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(inputsChanged, key)) continue;
      inputsChanged[key] = {
        before: _fsbRedactChangeValue(inputsChanged[key].before),
        after: _fsbRedactChangeValue(inputsChanged[key].after)
      };
    }
  }

  // focus_shift (D-04): caller supplies before/after activeElementSelector.
  let focusShift = null;
  const fromSel = before.activeElementSelector || null;
  const toSel = after.activeElementSelector || null;
  if (fromSel !== toSel) {
    focusShift = { from: fromSel, to: toSel };
  }

  return {
    url: { before: urlBefore, after: urlAfter, changed: urlChanged },
    title_changed: (before.title || null) !== (after.title || null),
    dialogs_opened: dialogsOpened,
    nodes_added: nodesAdded,
    nodes_removed: nodesRemoved,
    attrs_changed: attrsChanged,
    inputs_changed: inputsChanged,
    focus_shift: focusShift,
    mutation_count: mutationCount,
    settle_ms: typeof opts.settleMs === 'number' ? opts.settleMs : 0,
    truncated: false
  };
}

/**
 * D-04 size cap: if the serialized report exceeds CHANGE_REPORT_SIZE_CAP_BYTES,
 * slice arrays to the per-bucket limits and set truncated:true. Returns
 * { report, truncated } for caller introspection.
 *
 * Mutates and returns the same report object for performance (no deep clone).
 * If the caller needs an untouched copy, they should clone first.
 */
function applyChangeReportSizeCap(report) {
  if (!report || typeof report !== 'object') return { report, truncated: false };
  let size = 0;
  try { size = JSON.stringify(report).length; } catch (_) { size = 0; }
  if (size <= CHANGE_REPORT_SIZE_CAP_BYTES) {
    return { report, truncated: false };
  }
  if (Array.isArray(report.dialogs_opened) && report.dialogs_opened.length > CAP_DIALOGS) {
    report.dialogs_opened = report.dialogs_opened.slice(0, CAP_DIALOGS);
  }
  if (Array.isArray(report.nodes_added) && report.nodes_added.length > CAP_NODES_ADDED) {
    report.nodes_added = report.nodes_added.slice(0, CAP_NODES_ADDED);
  }
  if (Array.isArray(report.nodes_removed) && report.nodes_removed.length > CAP_NODES_REMOVED) {
    report.nodes_removed = report.nodes_removed.slice(0, CAP_NODES_REMOVED);
  }
  if (Array.isArray(report.attrs_changed) && report.attrs_changed.length > CAP_ATTRS_CHANGED) {
    report.attrs_changed = report.attrs_changed.slice(0, CAP_ATTRS_CHANGED);
  }
  report.truncated = true;
  return { report, truncated: true };
}

// =============================================================================
// Phase 69 -- same-call `expect` evaluator (MCP-02, SC2)
// =============================================================================
//
// This section owns the `expect` contract (D-01, D-18): the 29-tool list, the
// timing constants, spec normalization, the read-only page probe and the
// bounded evaluation loop. Browser access is injected (evaluateExpectation's
// deps), so the same logic runs in the service worker, in Node unit tests and
// in the MCP caller tests, and Phase 68 done-checks / Phase 70 run_task verify
// can reuse it.
//
// This file is importScripts-loaded into the service worker, so every name
// below is a global there: keep them unique, and never touch chrome, window
// or document at load time.

// D-12: the fixed set of tools that accept `expect`, in this exact order.
const EXPECT_TOOL_NAMES = Object.freeze([
  'execute_js', 'click', 'right_click', 'double_click', 'click_at', 'double_click_at', 'click_and_hold',
  'type_text', 'insert_text', 'press_enter', 'press_key', 'clear_input',
  'select_option', 'check_box', 'set_attribute',
  'drag_drop', 'drag', 'drag_variable_speed', 'drop_file', 'upload_file',
  'select_text_range', 'scroll_to_top', 'scroll_to_bottom', 'scroll_to_element',
  'navigate', 'go_back', 'go_forward', 'refresh', 'back'
]);
const EXPECT_NAV_TOOL_NAMES = Object.freeze(['navigate', 'go_back', 'go_forward', 'refresh', 'back']);

// D-13: the flat, closed spec.
const EXPECT_SPEC_KEYS = Object.freeze([
  'url_includes', 'title_includes', 'text_visible', 'text_gone', 'selector', 'state', 'value', 'dialog_open', 'timeout_ms'
]);
const EXPECT_PREDICATE_KEYS = Object.freeze([
  'url_includes', 'title_includes', 'text_visible', 'text_gone', 'selector', 'dialog_open'
]);
const EXPECT_STATES = Object.freeze(['visible', 'gone', 'checked', 'unchecked']);

// D-20 bounds. Every timing and size choice here is uncalibrated, pending V4.
const EXPECT_DEFAULT_TIMEOUT_MS = 2000;     // uncalibrated, pending V4
const EXPECT_MAX_TIMEOUT_MS = 5000;         // uncalibrated, pending V4
const EXPECT_POLL_INTERVAL_MS = 200;        // uncalibrated, pending V4
const EXPECT_OBSERVED_MAX = 120;            // uncalibrated, pending V4
const EXPECT_STRING_MAX = 2000;             // uncalibrated, pending V4
const EXPECT_TEXT_SCAN_MAX_CHARS = 200000;  // uncalibrated, pending V4
const EXPECT_SHADOW_HOST_BUDGET = 2000;     // uncalibrated, pending V4

// D-19 / D-25: one redaction marker for expect_result and change_report.
const EXPECT_REDACTED = '[redacted]';

// Sensitive-name pattern (D-19, D-25), compiled with the 'i' flag after the
// camelCase word split in _fsbExpectSplitWords. It matches password, passcode,
// passwd, pwd, otp / totp, cvv, cvc, card number, cc number, security code and
// one-time code / pass. The short terms (t?otp, pwd, cvv, cvc, cc number) are
// boundary-aware: no letter may stand on either side, so ordinary ids that
// merely contain the letters ('footprint', 'hotpot', 'notpad') do not match
// and keep today's change_report bytes. Trade-off: run-together lowercase ids
// such as 'otpcode' or 'userpwd' are not caught by this name rule; the type
// and autocomplete rules still apply to them.
const EXPECT_SENSITIVE_NAME_SOURCE = '(?<![a-z])(?:t?otp|pwd|cvv|cvc|cc[-_ ]?num(?:ber)?)(?![a-z])|pass(?:wd|[-_ ]?(?:word|code))|card[-_ ]?num(?:ber)?|security[-_ ]?code|one[-_ ]?time[-_ ]?(?:code|pass)';

// D-19 result contract (plus the optional top-level reason, RESEARCH Open
// Question 1: present only when status is 'uncertain').
const EXPECT_RESULT_KEYS = Object.freeze(['status', 'checks', 'waited_ms', 'timeout_ms', 'reason']);
const EXPECT_CHECK_KEYS = Object.freeze(['kind', 'expected', 'observed', 'status']);
const EXPECT_CHECK_KINDS = Object.freeze([
  'url_includes', 'title_includes', 'text_visible', 'text_gone', 'state', 'value', 'dialog_open'
]);
const EXPECT_STATUSES = Object.freeze(['verified', 'unmet', 'uncertain']);
const EXPECT_CHECK_STATUSES = Object.freeze(['met', 'unmet', 'uncertain']);
const EXPECT_UNCERTAIN_REASONS = Object.freeze([
  'extension_unsupported', 'invalid_expect', 'evaluator_unavailable', 'evaluator_failed', 'no_tab',
  'tab_closed', 'restricted_page', 'no_commit', 'still_loading', 'page_unresponsive', 'probe_failed',
  'probe_timeout', 'stale_document', 'ref_unavailable', 'invalid_selector', 'text_budget_exhausted',
  'no_toggle_signal', 'value_unreadable'
]);

// The string-typed spec fields; only `value` may be '' or blank (D-13: '' is
// the natural check after clear_input).
const _fsbExpectStringKeys = Object.freeze(['url_includes', 'title_includes', 'text_visible', 'text_gone', 'selector', 'value']);

// No 'g' flag, so test() keeps no lastIndex state between calls.
const _fsbExpectSensitiveNameRe = new RegExp(EXPECT_SENSITIVE_NAME_SOURCE, 'i');

/**
 * camelCase word split applied before the sensitive-name test: a space goes
 * between a lowercase letter or digit and a following uppercase letter, and
 * between an uppercase run and an uppercase letter that starts a capitalised
 * word. 'otpCode' -> 'otp Code', 'userPwd' -> 'user Pwd', 'OTPCode' -> 'OTP Code'.
 */
function _fsbExpectSplitWords(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

function _fsbExpectIsPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * A value check's selector that itself names a sensitive field. Used only to
 * redact `expected` when the probe cannot report on the field.
 */
function _fsbExpectSelectorLooksSensitive(selector) {
  if (typeof selector !== 'string' || selector.length === 0) return false;
  if (/type\s*[~|^$*]?=\s*["']?\s*(?:password|hidden)(?![a-z])/i.test(selector)) return true;
  if (/autocomplete[^\]]*(?:current-password|new-password|one-time-code|cc-)/i.test(selector)) return true;
  return _fsbExpectSensitiveNameRe.test(_fsbExpectSplitWords(selector));
}

/**
 * D-20: clamp a caller timeout to [0, EXPECT_MAX_TIMEOUT_MS]. Absent or
 * non-finite values give the default; numeric strings are accepted; values
 * are truncated toward zero.
 */
function clampExpectTimeoutMs(raw) {
  let n;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    n = Number(raw);
  } else {
    return EXPECT_DEFAULT_TIMEOUT_MS;
  }
  if (!Number.isFinite(n)) return EXPECT_DEFAULT_TIMEOUT_MS;
  n = Math.trunc(n) || 0;
  if (n < 0) return 0;
  if (n > EXPECT_MAX_TIMEOUT_MS) return EXPECT_MAX_TIMEOUT_MS;
  return n;
}

/**
 * Validate a raw `expect` spec (a mirror of the MCP zod validation, so a newer
 * or older MCP server cannot drive the evaluator with a malformed spec) and
 * build its check list in the fixed order url_includes, title_includes,
 * text_visible, text_gone, state, value, dialog_open.
 *
 * Returns { ok: true, spec: { timeoutMs, checks: [{ kind, expected, selector?, sensitiveHint? }] } }
 * or { ok: false, reason: 'invalid_expect', detail }.
 */
function normalizeExpectSpec(raw) {
  const fail = (detail) => ({ ok: false, reason: 'invalid_expect', detail });
  if (!_fsbExpectIsPlainObject(raw)) return fail('expect must be a plain object');
  const keys = Object.keys(raw);
  for (let i = 0; i < keys.length; i++) {
    if (!EXPECT_SPEC_KEYS.includes(keys[i])) return fail('unknown key: ' + keys[i]);
  }
  const has = (key) => Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== undefined;

  for (let i = 0; i < _fsbExpectStringKeys.length; i++) {
    const key = _fsbExpectStringKeys[i];
    if (!has(key)) continue;
    const v = raw[key];
    if (typeof v !== 'string') return fail(key + ' must be a string');
    if (v.length === 0 && key !== 'value') return fail(key + ' must not be empty');
    // Matching collapses whitespace, so a blank predicate is vacuous (always
    // met, or never met for text_gone); value keeps '' and blank strings.
    if (key !== 'value' && v.trim().length === 0) return fail(key + ' must not be blank');
    if (v.length > EXPECT_STRING_MAX) return fail(key + ' is longer than ' + EXPECT_STRING_MAX + ' characters');
  }
  if (has('state') && !(typeof raw.state === 'string' && EXPECT_STATES.includes(raw.state))) {
    return fail('state must be one of ' + EXPECT_STATES.join(', '));
  }
  if (has('dialog_open') && typeof raw.dialog_open !== 'boolean') return fail('dialog_open must be a boolean');
  if (has('timeout_ms') && raw.timeout_ms !== null) {
    // Mirrors MCP's coerced integer form: a finite integer, as a number or a
    // non-empty numeric string. Out-of-range values are clamped, not rejected.
    // null means omitted (the default applies), as on the MCP side.
    const t = raw.timeout_ms;
    let n = NaN;
    if (typeof t === 'number') n = t;
    else if (typeof t === 'string' && t.trim() !== '') n = Number(t);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return fail('timeout_ms must be an integer');
  }
  if (!EXPECT_PREDICATE_KEYS.some(has)) return fail('expect needs at least one predicate');
  if ((has('state') || has('value')) && !has('selector')) return fail('state and value require selector');

  const checks = [];
  if (has('url_includes')) checks.push({ kind: 'url_includes', expected: raw.url_includes });
  if (has('title_includes')) checks.push({ kind: 'title_includes', expected: raw.title_includes });
  if (has('text_visible')) checks.push({ kind: 'text_visible', expected: raw.text_visible });
  if (has('text_gone')) checks.push({ kind: 'text_gone', expected: raw.text_gone });
  if (has('selector')) {
    if (has('state') || !has('value')) {
      checks.push({ kind: 'state', expected: has('state') ? raw.state : 'visible', selector: raw.selector });
    }
    if (has('value')) {
      const valueCheck = { kind: 'value', expected: raw.value, selector: raw.selector };
      if (_fsbExpectSelectorLooksSensitive(raw.selector)) valueCheck.sensitiveHint = true;
      checks.push(valueCheck);
    }
  }
  if (has('dialog_open')) checks.push({ kind: 'dialog_open', expected: raw.dialog_open });

  return { ok: true, spec: { timeoutMs: clampExpectTimeoutMs(raw.timeout_ms), checks } };
}

/**
 * D-19 overall status: verified when every check is met, unmet when any check
 * is unmet, otherwise uncertain (including an empty list).
 */
function aggregateExpectStatus(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return 'uncertain';
  if (checks.every((c) => c && c.status === 'met')) return 'verified';
  if (checks.some((c) => c && c.status === 'unmet')) return 'unmet';
  return 'uncertain';
}

/**
 * D-19 bound: strings longer than EXPECT_OBSERVED_MAX become the first
 * EXPECT_OBSERVED_MAX - 3 characters plus '...'. Non-strings are unchanged.
 */
function capObserved(value) {
  if (typeof value !== 'string' || value.length <= EXPECT_OBSERVED_MAX) return value;
  return value.slice(0, EXPECT_OBSERVED_MAX - 3) + '...';
}

/**
 * D-19 / D-25 sensitive-field predicate over { tag, type, autocomplete, name, id }:
 *   - input type password or hidden;
 *   - an autocomplete token current-password, new-password, one-time-code or cc-*;
 *   - name, id or autocomplete matching EXPECT_SENSITIVE_NAME_SOURCE after the
 *     camelCase word split.
 * The change-report harvest functions in ws/mcp-tool-dispatcher.js and the
 * page probe below carry inline copies of these exact rules (they run in the
 * page and cannot reach this scope).
 */
function isRedactedField(desc) {
  if (!desc || typeof desc !== 'object') return false;
  const tag = typeof desc.tag === 'string' ? desc.tag.toLowerCase() : '';
  const type = typeof desc.type === 'string' ? desc.type.toLowerCase() : '';
  if ((tag === '' || tag === 'input') && (type === 'password' || type === 'hidden')) return true;
  const autocomplete = typeof desc.autocomplete === 'string' ? desc.autocomplete.toLowerCase() : '';
  const tokens = autocomplete.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'current-password' || t === 'new-password' || t === 'one-time-code' || t.indexOf('cc-') === 0) return true;
  }
  const names = [desc.name, desc.id, desc.autocomplete];
  for (let i = 0; i < names.length; i++) {
    const v = names[i];
    if (typeof v === 'string' && v.length > 0 && _fsbExpectSensitiveNameRe.test(_fsbExpectSplitWords(v))) return true;
  }
  return false;
}

/**
 * D-25 change_report marker rule for one side of a sensitive entry:
 * EXPECT_REDACTED when non-empty, '' when empty, null when absent.
 */
function _fsbRedactChangeValue(value) {
  if (value === null) return null;
  if (value === undefined || value === '') return '';
  return EXPECT_REDACTED;
}

/**
 * D-25 defence in depth: true when a mutation target's id (getAttribute('id'),
 * or the serialised `_id` when getAttribute is absent) is a listed sensitive
 * input key.
 */
function _fsbRedactionListsTarget(redactedKeys, target) {
  if (!redactedKeys || !target) return false;
  let id = null;
  if (typeof target.getAttribute === 'function') {
    try { id = target.getAttribute('id'); } catch (_) { id = null; }
  } else if (typeof target._id === 'string') {
    id = target._id;
  }
  return typeof id === 'string' && id.length > 0 && redactedKeys.has(id);
}

/**
 * Build an all-uncertain expect_result for a (normalized) spec. Used when the
 * evaluator cannot run at all (invalid spec, evaluator missing or failed, MCP
 * version-skew fill). A value check's `expected` is always the redaction
 * marker here: nothing observed the field, so nothing proves it is not a
 * secret (the MCP-side fill does the same).
 */
function buildUncertainExpectResult(spec, reason) {
  const checks = (spec && Array.isArray(spec.checks)) ? spec.checks : [];
  return {
    status: 'uncertain',
    checks: checks.map((c) => ({
      kind: c.kind,
      expected: c.kind === 'value' ? EXPECT_REDACTED : capObserved(c.expected),
      observed: null,
      status: 'uncertain'
    })),
    waited_ms: 0,
    timeout_ms: clampExpectTimeoutMs(spec ? spec.timeoutMs : undefined),
    reason: EXPECT_UNCERTAIN_REASONS.includes(reason) ? reason : 'evaluator_failed'
  };
}

// -----------------------------------------------------------------------------
// _fsbExpectProbeInPage: the read-only page probe (D-18).
//
// Serialized and injected with chrome.scripting.executeScript (plan 69-05 uses
// the ISOLATED world, where page scripts cannot spoof it and window.FSB, the
// content scripts' selector helpers, is reachable: RESEARCH Finding 15). It
// must therefore be self-contained: every helper is declared inside the body,
// all inputs come from its one serialisable argument, and it reads
// globalThis.window / globalThis.document so Node tests can stub them.
//
// Read-only and one-shot by design: synchronous DOM reads only, with no
// timers, no mutation observers and no animation-frame callbacks (frames are
// throttled in background tabs, RESEARCH Pitfall 10), so a late execution on
// a hung renderer is harmless. The loop below polls by injecting it again.
// The one side effect: FSB.resolveRef / FSB.querySelectorWithShadow may update
// FSB's own element cache in the ISOLATED world; the page itself is untouched.
//
// Toggle signals follow D-13 (native checked, aria-checked, aria-pressed,
// aria-selected, data-state, open) and deliberately leave out aria-expanded,
// which content/actions.js uses for click-effect detection but D-13 does not
// list: an expanded menu is not a checked control.
//
// D-19 vault-filled guarantee: a value check compares inside the page and
// returns only holds, redact and the observed-rule result (the caller's
// expected string when equal, the redaction marker otherwise). The raw field
// value never leaves the page, so a value filled from the vault is never
// echoed even though no vault-filled marker exists to detect it.
//
// probeSpec = { checks, textScanMax, shadowHostBudget, observedMax, redacted, sensitiveNameSource }
// returns { ok: true, observations: [{ kind, observable, holds, observed, redact, reason? }], textTruncated, readyState }
//      or { ok: false, error }
// readyState is document.readyState (null when unreadable); the loop uses it
// so a document that is still parsing cannot settle a negative check.
// -----------------------------------------------------------------------------
function _fsbExpectProbeInPage(probeSpec) {
  try {
    const spec = (probeSpec && typeof probeSpec === 'object') ? probeSpec : {};
    const scope = (typeof globalThis !== 'undefined') ? globalThis : {};
    const win = scope.window || null;
    const doc = scope.document || (win && win.document) || null;
    if (!doc) return { ok: false, error: 'no document' };
    const checks = Array.isArray(spec.checks) ? spec.checks : [];
    const textScanMax = (typeof spec.textScanMax === 'number' && spec.textScanMax > 0) ? spec.textScanMax : 200000;
    const hostBudget = (typeof spec.shadowHostBudget === 'number' && spec.shadowHostBudget >= 0) ? spec.shadowHostBudget : 2000;
    const REDACTED = (typeof spec.redacted === 'string' && spec.redacted) ? spec.redacted : '[redacted]';
    const observedMax = (typeof spec.observedMax === 'number' && spec.observedMax > 3) ? spec.observedMax : 120;
    function cap(s) { return (typeof s === 'string' && s.length > observedMax) ? s.slice(0, observedMax - 3) + '...' : s; }
    let nameRe = null;
    let nameRuleBroken = false;
    if (typeof spec.sensitiveNameSource === 'string' && spec.sensitiveNameSource) {
      try { nameRe = new RegExp(spec.sensitiveNameSource, 'i'); } catch (e) { nameRuleBroken = true; }
    }

    function lower(v) { return (typeof v === 'string') ? v.toLowerCase() : ''; }
    function normText(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase(); }
    function attr(el, name) {
      try { return (el && typeof el.getAttribute === 'function') ? el.getAttribute(name) : null; } catch (e) { return null; }
    }
    function splitWords(v) {
      return String(v).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    }
    // Same rules as isRedactedField (utils/action-verification.js).
    function isSensitive(el) {
      if (!el || typeof el !== 'object') return false;
      const tag = lower(el.tagName);
      let type = (typeof el.type === 'string') ? el.type : attr(el, 'type');
      type = lower(type);
      if ((tag === '' || tag === 'input') && (type === 'password' || type === 'hidden')) return true;
      let ac = attr(el, 'autocomplete');
      if (typeof ac !== 'string') ac = (typeof el.autocomplete === 'string') ? el.autocomplete : '';
      const tokens = ac.toLowerCase().split(/\s+/);
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t === 'current-password' || t === 'new-password' || t === 'one-time-code' || t.indexOf('cc-') === 0) return true;
      }
      if (nameRuleBroken) return true; // fail closed when the name rule cannot be compiled
      if (!nameRe) return false;
      let name = attr(el, 'name');
      if (typeof name !== 'string') name = (typeof el.name === 'string') ? el.name : '';
      let id = attr(el, 'id');
      if (typeof id !== 'string') id = (typeof el.id === 'string') ? el.id : '';
      const names = [name, id, ac];
      for (let i = 0; i < names.length; i++) {
        if (names[i] && nameRe.test(splitWords(names[i]))) return true;
      }
      return false;
    }
    function isVisible(el) {
      if (!el) return false;
      if (el.isConnected === false) return false;
      if (typeof el.getClientRects === 'function') {
        let rects = null;
        try { rects = el.getClientRects(); } catch (e) { rects = null; }
        if (!rects || rects.length === 0) return false;
      }
      if (win && typeof win.getComputedStyle === 'function') {
        try {
          const cs = win.getComputedStyle(el);
          if (cs && (cs.visibility === 'hidden' || cs.visibility === 'collapse')) return false;
        } catch (e) { /* style unavailable: rely on the client rects */ }
      }
      return true;
    }

    // Text: body innerText plus open shadow-root text, bounded by textScanMax
    // characters and hostBudget shadow roots. Computed once per probe.
    let textCache = null;
    function shadowText(root) {
      let out = '';
      const kids = (root && root.childNodes) || [];
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        if (!k) continue;
        if (k.nodeType === 3) {
          out += ' ' + (k.textContent || '');
        } else if (k.nodeType === 1) {
          const tag = lower(k.tagName);
          if (tag === 'style' || tag === 'script' || tag === 'template') continue;
          out += ' ' + ((typeof k.innerText === 'string') ? k.innerText : (k.textContent || ''));
        }
      }
      return out;
    }
    function pageText() {
      if (textCache) return textCache;
      const parts = [];
      let total = 0;
      let truncated = false;
      function add(s) {
        if (truncated) return;
        const str = (typeof s === 'string') ? s : '';
        if (total + str.length > textScanMax) {
          parts.push(str.slice(0, Math.max(0, textScanMax - total)));
          total = textScanMax;
          truncated = true;
          return;
        }
        parts.push(str);
        total += str.length + 1;
      }
      const body = doc.body || doc.documentElement || null;
      add(body ? ((typeof body.innerText === 'string') ? body.innerText : (body.textContent || '')) : '');
      let hosts = 0;
      const queue = [doc];
      while (queue.length > 0 && !truncated) {
        const root = queue.shift();
        let all = [];
        try { all = (root && typeof root.querySelectorAll === 'function') ? root.querySelectorAll('*') : []; } catch (e) { all = []; }
        for (let i = 0; i < all.length; i++) {
          const sr = all[i] && all[i].shadowRoot;
          if (!sr) continue;
          if (hosts >= hostBudget) { truncated = true; break; }
          hosts++;
          add(shadowText(sr));
          if (truncated) break;
          queue.push(sr);
        }
      }
      textCache = { text: normText(parts.join(' ')), truncated: truncated };
      return textCache;
    }

    // Selector: an FSB ref (e12) through FSB.resolveRef; CSS through
    // FSB.querySelectorWithShadow when present, else document.querySelector.
    function resolveTarget(sel) {
      const fsb = win && win.FSB;
      if (/^e\d+$/.test(sel)) {
        if (!fsb || typeof fsb.resolveRef !== 'function') return { reason: 'ref_unavailable' };
        try { return { el: fsb.resolveRef(sel) || null }; } catch (e) { return { reason: 'ref_unavailable' }; }
      }
      const hasFsbQuery = !!(fsb && typeof fsb.querySelectorWithShadow === 'function');
      let el = null;
      if (hasFsbQuery) {
        try { el = fsb.querySelectorWithShadow(sel) || null; } catch (e) { el = null; }
        if (el && el.isConnected === false) el = null; // a stale cache entry
      }
      if (!el) {
        // FSB-only syntax (XPath, >>> shadow piercing) has no native fallback.
        const fsbOnly = hasFsbQuery && (sel.indexOf('>>>') !== -1 || sel.charAt(0) === '/');
        if (!fsbOnly) {
          try { el = doc.querySelector(sel) || null; } catch (e) { return { reason: 'invalid_selector' }; }
        }
      }
      return { el: el };
    }
    function toggleSignals(el) {
      const out = { any: false, positive: false };
      if (!el) return out;
      const tag = lower(el.tagName);
      const type = lower((typeof el.type === 'string') ? el.type : attr(el, 'type'));
      if (typeof el.checked === 'boolean' && !(tag === 'input' && type !== 'checkbox' && type !== 'radio')) {
        out.any = true;
        if (el.checked) out.positive = true;
      }
      const aria = ['aria-checked', 'aria-pressed', 'aria-selected'];
      for (let i = 0; i < aria.length; i++) {
        const v = attr(el, aria[i]);
        if (v != null) { out.any = true; if (lower(String(v)) === 'true') out.positive = true; }
      }
      const ds = attr(el, 'data-state');
      if (ds != null) {
        out.any = true;
        const d = lower(String(ds));
        if (d === 'checked' || d === 'on' || d === 'active' || d === 'open') out.positive = true;
      }
      if (typeof el.open === 'boolean') { out.any = true; if (el.open) out.positive = true; }
      return out;
    }
    // Mirrors getAssociatedStateElement (content/actions.js) with the D-13 set.
    function associatedControl(el) {
      let node = el;
      for (let depth = 0; node && depth <= 5; depth++, node = node.parentElement) {
        const tag = (typeof node.tagName === 'string') ? node.tagName.toUpperCase() : '';
        if (tag === 'LABEL') {
          const control = node.control;
          return control && control !== el ? control : null;
        }
        const parent = node.parentElement;
        if (tag === 'SUMMARY' && parent && typeof parent.tagName === 'string' && parent.tagName.toUpperCase() === 'DETAILS') {
          return parent;
        }
        if (node !== el && typeof node.hasAttribute === 'function') {
          const names = ['aria-checked', 'aria-pressed', 'aria-selected', 'data-state'];
          for (let i = 0; i < names.length; i++) {
            if (node.hasAttribute(names[i])) return node;
          }
        }
      }
      return null;
    }
    function readValue(el) {
      const ce = attr(el, 'contenteditable');
      const editable = el.isContentEditable === true
        || ce === '' || lower(ce) === 'true' || lower(ce) === 'plaintext-only';
      if (editable) return (typeof el.textContent === 'string') ? el.textContent : null;
      if (typeof el.value === 'string') return el.value;
      return null;
    }
    // Mirrors isDialogNode / D-04's dialog definition.
    function dialogIsOpen() {
      let nodes = [];
      try { nodes = doc.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]'); } catch (e) { nodes = []; }
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (!n) continue;
        if (lower(n.tagName) === 'dialog') {
          if (n.open === true || attr(n, 'open') !== null) return true;
          continue;
        }
        if (isVisible(n)) return true;
      }
      return false;
    }

    function unobservable(kind, reason, redact) {
      return { kind: kind, observable: false, holds: false, observed: null, redact: redact, reason: reason };
    }

    const observations = [];
    let textTruncated = false;
    for (let i = 0; i < checks.length; i++) {
      const c = checks[i] || {};
      const kind = c.kind;
      if (kind === 'text_visible' || kind === 'text_gone') {
        const t = pageText();
        if (t.truncated) textTruncated = true;
        const found = t.text.indexOf(normText(c.expected)) !== -1;
        if (!found && t.truncated) {
          observations.push(unobservable(kind, 'text_budget_exhausted', false));
        } else {
          observations.push({
            kind: kind, observable: true,
            holds: kind === 'text_visible' ? found : !found,
            observed: found ? 'present' : 'absent', redact: false
          });
        }
      } else if (kind === 'state' || kind === 'value') {
        const sel = (typeof c.selector === 'string') ? c.selector : '';
        const target = resolveTarget(sel);
        if (target.reason) { observations.push(unobservable(kind, target.reason, null)); continue; }
        const el = target.el;
        if (kind === 'state') {
          const expected = c.expected;
          if (expected === 'visible' || expected === 'gone') {
            const vis = !!el && isVisible(el);
            const observed = !el ? 'absent' : (vis ? 'visible' : 'hidden');
            observations.push({ kind: kind, observable: true, holds: expected === 'visible' ? vis : !vis, observed: observed, redact: false });
          } else if (!el) {
            observations.push({ kind: kind, observable: true, holds: false, observed: 'absent', redact: false });
          } else {
            let sig = toggleSignals(el);
            if (!sig.any) {
              const assoc = associatedControl(el);
              if (assoc) sig = toggleSignals(assoc);
            }
            if (!sig.any) {
              observations.push(unobservable(kind, 'no_toggle_signal', false));
            } else {
              const state = sig.positive ? 'checked' : 'unchecked';
              observations.push({ kind: kind, observable: true, holds: state === expected, observed: state, redact: false });
            }
          }
        } else {
          if (!el) { observations.push(unobservable(kind, 'value_unreadable', null)); continue; }
          const redact = isSensitive(el);
          const raw = readValue(el);
          if (typeof raw !== 'string') { observations.push(unobservable(kind, 'value_unreadable', redact)); continue; }
          const expectedValue = String(c.expected == null ? '' : c.expected);
          const holds = raw === expectedValue;
          observations.push({
            kind: kind, observable: true, holds: holds,
            observed: redact ? REDACTED : (holds ? cap(expectedValue) : REDACTED),
            redact: redact
          });
        }
      } else if (kind === 'dialog_open') {
        const open = dialogIsOpen();
        observations.push({ kind: kind, observable: true, holds: open === (c.expected === true), observed: open, redact: false });
      } else {
        observations.push(unobservable(kind, 'probe_failed', null));
      }
    }
    let readyState = null;
    try { readyState = (typeof doc.readyState === 'string') ? doc.readyState : null; } catch (e) { readyState = null; }
    return { ok: true, observations: observations, textTruncated: textTruncated, readyState: readyState };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// -----------------------------------------------------------------------------
// evaluateExpectation: the bounded evaluation loop (D-19, D-20).
//
// Planner decisions (Claude's discretion items in CONTEXT):
//   - Repeated short probes, not one long-lived in-page poller: a poller breaks
//     on navigation and stacks up on hung renderers.
//   - Poll interval EXPECT_POLL_INTERVAL_MS (uncalibrated, pending V4).
//   - At most one DOM probe in flight, and none after a probe timed out: a
//     page that missed one 750 ms race is not hammered again.
//   - No extra settle injection: evaluation starts right after the action's
//     own settle and returns as soon as every check holds.
//   - Negative predicates (text_gone, state gone / unchecked, dialog_open
//     false) need two consecutive holding probes before an early exit
//     (RESEARCH Pitfall 5: the spinner may not have appeared yet). The rule
//     gates only the early exit; at the deadline the final probe decides.
//   - A negative predicate also holds trivially on a document that is still
//     parsing (an empty body has no error text and no dialog) and on a
//     document that a pending navigation is about to replace. Such a probe
//     is "unsettled": it does not count toward the two-probe streak, and a
//     negative check whose last holding probe was unsettled ends as
//     uncertain still_loading instead of met. Unsettled means the tab has a
//     pendingUrl while loading, or the probed document.readyState is
//     'loading' (the tab's own loading status when readyState is unknown).
//   - Navigation checks are not judged until the commit is seen, and DOM
//     observations count only from the committed document (Pitfall 1).
//   - Overall reason = the first uncertain check's reason.
// -----------------------------------------------------------------------------

const _fsbExpectRestrictedPrefixes = Object.freeze([
  'chrome://', 'chrome-extension://', 'chrome-untrusted://', 'chrome-search://', 'edge://', 'brave://',
  'opera://', 'vivaldi://', 'devtools://', 'view-source:', 'https://chromewebstore.google.com/',
  'https://chrome.google.com/webstore', 'https://microsoftedge.microsoft.com/addons'
]);

function _fsbExpectIsRestrictedUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  const u = url.toLowerCase();
  if (u === 'https://chromewebstore.google.com') return true;
  for (let i = 0; i < _fsbExpectRestrictedPrefixes.length; i++) {
    if (u.indexOf(_fsbExpectRestrictedPrefixes[i]) === 0) return true;
  }
  if (u.indexOf('about:') === 0) {
    return !(u === 'about:blank' || u.indexOf('about:blank#') === 0 || u.indexOf('about:blank?') === 0);
  }
  return false;
}

function _fsbExpectNormText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
}

// url_includes observed value: the tab URL without userinfo, query or
// fragment, so OAuth codes, magic-link tokens and signed parameters never
// ride expect_result into logs or session recordings. Matching still runs on
// the full URL; only the echo is reduced. null when the URL cannot be parsed.
function _fsbExpectSafeUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return null;
  try {
    const u = new URL(url);
    u.username = '';
    u.password = '';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch (_) {
    return null;
  }
}

function _fsbExpectIsNegative(check) {
  if (!check) return false;
  if (check.kind === 'text_gone') return true;
  if (check.kind === 'state') return check.expected === 'gone' || check.expected === 'unchecked';
  if (check.kind === 'dialog_open') return check.expected === false;
  return false;
}

// Observed values for DOM checks are re-derived here instead of trusted from
// the probe, so a regressed probe cannot put page text into expect_result.
function _fsbExpectSanitizeObserved(check, obs) {
  const holds = obs.holds === true;
  switch (check.kind) {
    case 'text_visible': return holds ? 'present' : 'absent';
    case 'text_gone': return holds ? 'absent' : 'present';
    case 'dialog_open': return holds ? check.expected === true : check.expected !== true;
    case 'state':
      return ['visible', 'hidden', 'absent', 'checked', 'unchecked'].includes(obs.observed) ? obs.observed : null;
    default: return null; // value: _fsbExpectApplyValueRule decides
  }
}

// D-19 value-check observed rule, applied to every value check whatever the
// probe returned: met -> the caller's expected string (an echo of caller
// input, never a page read); unmet -> EXPECT_REDACTED; uncertain -> null.
// This rule, not the name heuristics, is what delivers D-19's "vault-filled
// fields are never echoed": no page-read value ever reaches expect_result.
function _fsbExpectApplyValueRule(status, expected) {
  if (status === 'met') return expected;
  if (status === 'unmet') return EXPECT_REDACTED;
  return null;
}

function _fsbExpectBuildCheck(check, st) {
  let expected = check.expected;
  let observed = st.status === 'uncertain' ? null : st.observed;
  if (check.kind === 'value') {
    observed = _fsbExpectApplyValueRule(st.status, expected);
    // Redact expected (and observed) when the field is sensitive, and also
    // when nothing proved it is not: the field was never seen.
    if (check.sensitiveHint === true || st.sawRedact || !st.sawPlain) {
      expected = EXPECT_REDACTED;
      if (observed !== null) observed = EXPECT_REDACTED;
    }
  }
  return { kind: check.kind, expected: capObserved(expected), observed: capObserved(observed), status: st.status };
}

async function _fsbExpectRun(tabId, spec, deps, commitArg, pageUnresponsive, clock) {
  const checks = spec.checks;
  const timeoutMs = clampExpectTimeoutMs(spec.timeoutMs);
  const commit = (commitArg && commitArg.required === true) ? commitArg : null;
  const states = checks.map(() => ({ status: 'uncertain', reason: 'probe_failed', observed: null, streak: 0, sawPlain: false, sawRedact: false, unsettled: false }));
  const tabIdx = [];
  const domIdx = [];
  checks.forEach((c, i) => {
    if (c && (c.kind === 'url_includes' || c.kind === 'title_includes')) tabIdx.push(i);
    else domIdx.push(i);
  });
  const probeSpec = {
    checks: domIdx.map((i) => {
      const c = checks[i] || {};
      const out = { kind: c.kind, expected: c.expected };
      if (typeof c.selector === 'string') out.selector = c.selector;
      return out;
    }),
    textScanMax: EXPECT_TEXT_SCAN_MAX_CHARS,
    shadowHostBudget: EXPECT_SHADOW_HOST_BUDGET,
    observedMax: EXPECT_OBSERVED_MAX,
    redacted: EXPECT_REDACTED,
    sensitiveNameSource: EXPECT_SENSITIVE_NAME_SOURCE
  };

  function setResult(i, holds, observed) {
    const st = states[i];
    st.status = holds ? 'met' : 'unmet';
    st.reason = null;
    st.observed = observed;
    st.streak = holds ? st.streak + 1 : 0;
    st.unsettled = false;
  }
  function setUncertain(i, reason) {
    const st = states[i];
    st.status = 'uncertain';
    st.reason = reason;
    st.observed = null;
    st.streak = 0;
    st.unsettled = false;
  }

  const start = deps.now();
  clock.start = start;
  const deadline = start + timeoutMs;
  let lastTab = null;
  let probeTimedOut = false;

  for (;;) {
    const tab = await deps.tabsGet(tabId);
    lastTab = tab || null;
    if (!tab) {
      for (let i = 0; i < states.length; i++) setUncertain(i, 'tab_closed');
      break;
    }
    // The tab lets the watcher reject a same-document event that came from
    // the outgoing document while a cross-document navigation is pending.
    const committed = !commit || (typeof commit.isCommitted === 'function' && commit.isCommitted(tab) === true);
    if (!committed) {
      for (let i = 0; i < states.length; i++) setUncertain(i, 'no_commit');
    } else {
      // url_includes / title_includes come from tabs.get, never from the page
      // (T-69-01), so they stay observable across cross-origin moves (D-18).
      for (let k = 0; k < tabIdx.length; k++) {
        const i = tabIdx[k];
        const c = checks[i];
        if (c.kind === 'url_includes') {
          if (typeof tab.url !== 'string') setUncertain(i, 'restricted_page');
          else setResult(i, tab.url.indexOf(c.expected) !== -1, _fsbExpectSafeUrl(tab.url));
        } else if (typeof tab.title !== 'string') {
          setUncertain(i, 'restricted_page');
        } else {
          setResult(i, _fsbExpectNormText(tab.title).indexOf(_fsbExpectNormText(c.expected)) !== -1, tab.title);
        }
      }
      if (domIdx.length > 0) {
        let domReason = null;
        if (pageUnresponsive) domReason = 'page_unresponsive';
        else if (_fsbExpectIsRestrictedUrl(tab.url)) domReason = 'restricted_page';
        else if (probeTimedOut) domReason = 'probe_timeout';
        else {
          const res = await deps.executeProbe(tabId, _fsbExpectProbeInPage, [probeSpec]);
          if (!res || res.ok !== true) {
            if (res && res.reason === 'timeout') { probeTimedOut = true; domReason = 'probe_timeout'; }
            else domReason = 'probe_failed'; // injection refused: cross-origin, closed frame, ...
          } else {
            const wantDoc = (commit && typeof commit.documentId === 'function') ? commit.documentId() : null;
            const result = res.result;
            if (wantDoc && res.documentId && res.documentId !== wantDoc) {
              domReason = 'stale_document';
            } else if (!result || result.ok !== true || !Array.isArray(result.observations)) {
              domReason = 'probe_failed';
            } else {
              // Unsettled probe (see the planner notes above): a navigation
              // is pending, or this document is still parsing.
              const readyState = (typeof result.readyState === 'string') ? result.readyState : null;
              const navPending = tab.status === 'loading' && typeof tab.pendingUrl === 'string' && tab.pendingUrl.length > 0;
              const docLoading = readyState !== null ? readyState === 'loading' : tab.status === 'loading';
              const unsettled = navPending || docLoading;
              for (let k = 0; k < domIdx.length; k++) {
                const i = domIdx[k];
                const c = checks[i];
                const o = result.observations[k];
                if (!o || typeof o !== 'object' || o.kind !== c.kind) { setUncertain(i, 'probe_failed'); continue; }
                if (c.kind === 'value') {
                  if (o.redact === true) states[i].sawRedact = true;
                  else if (o.redact === false) states[i].sawPlain = true;
                }
                if (o.observable !== true) {
                  setUncertain(i, EXPECT_UNCERTAIN_REASONS.includes(o.reason) ? o.reason : 'probe_failed');
                  continue;
                }
                setResult(i, o.holds === true, _fsbExpectSanitizeObserved(c, o));
                if (unsettled && states[i].status === 'met' && _fsbExpectIsNegative(c)) {
                  states[i].streak = 0;
                  states[i].unsettled = true;
                }
              }
            }
          }
        }
        if (domReason) {
          for (let k = 0; k < domIdx.length; k++) setUncertain(domIdx[k], domReason);
        }
      }
    }

    // Early exit: every check holds, negative ones on two consecutive probes.
    const settled = states.every((st, i) => st.status === 'met' && (!_fsbExpectIsNegative(checks[i]) || st.streak >= 2));
    if (settled) break;
    // Nothing left to learn: the DOM checks can no longer be probed and every
    // tab-level check already holds.
    const domDead = domIdx.length > 0 && (pageUnresponsive || probeTimedOut);
    if (domDead && tabIdx.every((i) => states[i].status === 'met')) break;
    const t = deps.now();
    if (t >= deadline) break;
    await deps.sleep(Math.min(EXPECT_POLL_INTERVAL_MS, deadline - t));
  }

  // A tab still loading toward another URL has not shown its final state yet.
  if (lastTab && lastTab.status === 'loading' && lastTab.pendingUrl) {
    for (let i = 0; i < states.length; i++) {
      if (states[i].status === 'unmet') setUncertain(i, 'still_loading');
    }
  }
  // A negative check last seen holding only on an unsettled probe was never
  // observed on a settled document: report it as still loading, not met.
  for (let i = 0; i < states.length; i++) {
    if (states[i].status === 'met' && states[i].unsettled === true) setUncertain(i, 'still_loading');
  }

  const out = checks.map((c, i) => _fsbExpectBuildCheck(c, states[i]));
  const status = aggregateExpectStatus(out);
  const result = {
    status,
    checks: out,
    waited_ms: Math.max(0, Math.round(deps.now() - start)),
    timeout_ms: timeoutMs
  };
  if (status === 'uncertain') {
    const first = states.find((st) => st.status === 'uncertain');
    result.reason = (first && EXPECT_UNCERTAIN_REASONS.includes(first.reason)) ? first.reason : 'invalid_expect';
  }
  return result;
}

/**
 * Evaluate a same-call `expect` after an action (D-17..D-20). Never throws:
 * internal errors become status 'uncertain' with reason 'evaluator_failed'.
 *
 * @param {Object} args
 * @param {number} args.tabId
 * @param {Object} args.spec - normalized spec ({ timeoutMs, checks }); a raw
 *   expect object is normalized first.
 * @param {Object} args.deps - { tabsGet(tabId) -> Promise<tab|null>,
 *   executeProbe(tabId, func, args) -> Promise<{ ok, result, documentId, reason }>,
 *   now() -> number, sleep(ms) -> Promise }
 * @param {Object} [args.commit] - navigation tools only:
 *   { required, isCommitted(tab) -> boolean, documentId() -> string|null };
 *   isCommitted receives the latest tabs.get result for this iteration.
 * @param {boolean} [args.pageUnresponsive]
 * @returns {Promise<Object>} expect_result
 */
async function evaluateExpectation(args) {
  const a = (args && typeof args === 'object') ? args : {};
  let spec = a.spec;
  const clock = { start: null };
  try {
    if (!spec || typeof spec !== 'object' || !Array.isArray(spec.checks)) {
      const n = normalizeExpectSpec(spec);
      if (!n.ok) return buildUncertainExpectResult(null, 'invalid_expect');
      spec = n.spec;
    }
    const deps = a.deps;
    if (!deps || typeof deps.tabsGet !== 'function' || typeof deps.executeProbe !== 'function'
        || typeof deps.now !== 'function' || typeof deps.sleep !== 'function') {
      return buildUncertainExpectResult(spec, 'evaluator_unavailable');
    }
    if (!Number.isFinite(a.tabId)) return buildUncertainExpectResult(spec, 'no_tab');
    return await _fsbExpectRun(a.tabId, spec, deps, a.commit, a.pageUnresponsive === true, clock);
  } catch (_) {
    const failed = buildUncertainExpectResult(spec && Array.isArray(spec.checks) ? spec : null, 'evaluator_failed');
    try {
      if (clock.start !== null && a.deps && typeof a.deps.now === 'function') {
        failed.waited_ms = Math.max(0, Math.round(a.deps.now() - clock.start)) || 0;
      }
    } catch (__) { /* keep 0 */ }
    return failed;
  }
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    capturePageState,
    comparePageStates,
    waitForDOMStable,
    verifyClickEffect,
    verifyTypeEffect,
    verifyNavigationEffect,
    // Phase 245 additions
    startMutationHarvest,
    stopMutationHarvest,
    buildChangeReport,
    applyChangeReportSizeCap,
    // Phase 69 additions (expect contract)
    EXPECT_TOOL_NAMES,
    EXPECT_NAV_TOOL_NAMES,
    EXPECT_SPEC_KEYS,
    EXPECT_PREDICATE_KEYS,
    EXPECT_STATES,
    EXPECT_DEFAULT_TIMEOUT_MS,
    EXPECT_MAX_TIMEOUT_MS,
    EXPECT_POLL_INTERVAL_MS,
    EXPECT_OBSERVED_MAX,
    EXPECT_STRING_MAX,
    EXPECT_TEXT_SCAN_MAX_CHARS,
    EXPECT_SHADOW_HOST_BUDGET,
    EXPECT_REDACTED,
    EXPECT_SENSITIVE_NAME_SOURCE,
    EXPECT_RESULT_KEYS,
    EXPECT_CHECK_KEYS,
    EXPECT_CHECK_KINDS,
    EXPECT_STATUSES,
    EXPECT_CHECK_STATUSES,
    EXPECT_UNCERTAIN_REASONS,
    clampExpectTimeoutMs,
    normalizeExpectSpec,
    aggregateExpectStatus,
    capObserved,
    isRedactedField,
    buildUncertainExpectResult,
    _fsbExpectProbeInPage,
    evaluateExpectation
  };
}
