// =============================================================================
// FSB Content Script Module: actions.js
// Extracted from content.js lines 4578-9252
// Contains: tools object (all 25+ browser action functions), coordinate utilities,
//           action verification, diagnostics, and ActionRecorder
// =============================================================================
(function() {
  if (window.__FSB_SKIP_INIT__) return;

  const FSB = window.FSB;
  const logger = FSB.logger;

// =============================================================================
// COORDINATE FALLBACK UTILITIES
// Used when all selectors fail and stored coordinates are available
// =============================================================================

/**
 * Validates that coordinates point to a clickable element.
 * Uses elementFromPoint to check what's actually at the viewport coordinates.
 * @param {number} x - Viewport X coordinate
 * @param {number} y - Viewport Y coordinate
 * @returns {{valid: boolean, element?: Element, reason?: string}}
 */
function validateCoordinates(x, y) {
  // Check coordinates are within viewport bounds
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
    return { valid: false, reason: 'coordinates_outside_viewport' };
  }

  const element = document.elementFromPoint(x, y);
  if (!element) {
    return { valid: false, reason: 'no_element_at_coordinates' };
  }

  // Check element is interactable (not hidden, not pointer-events:none)
  const style = window.getComputedStyle(element);
  if (style.pointerEvents === 'none') {
    return { valid: false, reason: 'element_has_pointer_events_none', element };
  }
  if (style.visibility === 'hidden') {
    return { valid: false, reason: 'element_is_hidden', element };
  }

  return { valid: true, element };
}

/**
 * Scrolls to make document coordinates visible in viewport.
 * Converts stored document coordinates to current viewport coordinates.
 * @param {number} docX - Document X coordinate (stored from getBoundingClientRect + scroll)
 * @param {number} docY - Document Y coordinate (stored from getBoundingClientRect + scroll)
 * @param {number} width - Element width
 * @param {number} height - Element height
 * @returns {Promise<{x: number, y: number, scrolled: boolean}>}
 */
async function ensureCoordinatesVisible(docX, docY, width, height) {
  // Convert stored document coordinates to current viewport coordinates
  const viewportX = docX - window.scrollX;
  const viewportY = docY - window.scrollY;

  // Check if already visible (with padding for element size)
  const padding = 50;
  const isVisible = viewportX >= padding &&
                    viewportY >= padding &&
                    viewportX + width <= window.innerWidth - padding &&
                    viewportY + height <= window.innerHeight - padding;

  if (!isVisible) {
    // Scroll to center the target area
    window.scrollTo({
      left: Math.max(0, docX - window.innerWidth / 2 + width / 2),
      top: Math.max(0, docY - window.innerHeight / 2 + height / 2),
      behavior: 'smooth'
    });

    // Wait for scroll animation to complete
    await waitForStability('scroll');
  }

  // Return current viewport coordinates after potential scroll
  return {
    x: docX - window.scrollX,
    y: docY - window.scrollY,
    scrolled: !isVisible
  };
}

/**
 * Clicks at stored coordinates as a fallback when selectors fail.
 * This is a last-resort mechanism for when DOM changes make selectors unreliable.
 * @param {{x: number, y: number, width: number, height: number, originalSelector?: string, reason?: string}} params
 * @returns {Promise<{success: boolean, fallbackUsed: true, ...}>}
 */
async function clickAtCoordinates(params) {
  const { x, y, width = 0, height = 0, originalSelector, reason } = params;

  // Log that we're using coordinate fallback
  logger.warn('Using coordinate fallback', {
    sessionId: FSB.sessionId,
    reason: reason || 'all_selectors_failed',
    originalSelector,
    targetCoordinates: { x, y, width, height }
  });

  // Calculate center point of the element
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  // Ensure coordinates are visible (scroll if needed)
  const scrollResult = await ensureCoordinatesVisible(x, y, width, height);

  // Convert center to current viewport coordinates
  const viewportCenterX = centerX - window.scrollX;
  const viewportCenterY = centerY - window.scrollY;

  // Validate there's a clickable element at these coordinates
  const validation = validateCoordinates(viewportCenterX, viewportCenterY);
  if (!validation.valid) {
    logger.warn('Coordinate fallback validation failed', {
      sessionId: FSB.sessionId,
      reason: validation.reason,
      coordinates: { x: viewportCenterX, y: viewportCenterY }
    });
    return {
      success: false,
      error: `Coordinate fallback failed: ${validation.reason}`,
      coordinates: { x: viewportCenterX, y: viewportCenterY },
      fallbackUsed: true
    };
  }

  const element = validation.element;

  // Dispatch full mouse event sequence (proven pattern from existing click tool)
  const mouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: viewportCenterX,
    clientY: viewportCenterY,
    screenX: viewportCenterX + window.screenX,
    screenY: viewportCenterY + window.screenY,
    button: 0,
    buttons: 1
  };

  element.dispatchEvent(new MouseEvent('mousedown', mouseEventInit));
  element.dispatchEvent(new MouseEvent('mouseup', mouseEventInit));
  element.dispatchEvent(new MouseEvent('click', mouseEventInit));

  // Also call native click as fallback
  if (typeof element.click === 'function') {
    element.click();
  }

  // Wait for potential effects
  await waitForStability('click');

  // Check if DOM click had effect; if not, try CDP mouse as final fallback
  let clickMethod = 'dom_coordinate';
  try {
    const cdpResult = await chrome.runtime.sendMessage({
      action: 'cdpMouseClick',
      x: viewportCenterX,
      y: viewportCenterY
    });
    if (cdpResult?.success) {
      clickMethod = 'cdp_coordinate';
      await waitForStability('click');
    }
  } catch (e) {
    // CDP unavailable, DOM click already dispatched
  }

  logger.log('info', 'Coordinate fallback click executed', {
    sessionId: FSB.sessionId,
    clickedElement: {
      tag: element.tagName,
      id: element.id || null,
      class: FSB.getClassName(element).substring(0, 50) || null
    },
    coordinates: { x: viewportCenterX, y: viewportCenterY },
    scrolled: scrollResult.scrolled,
    method: clickMethod
  });

  return {
    success: true,
    fallbackUsed: true,
    clickedElement: {
      tag: element.tagName,
      id: element.id || null,
      class: FSB.getClassName(element).substring(0, 50) || null
    },
    coordinates: { x: viewportCenterX, y: viewportCenterY },
    scrolled: scrollResult.scrolled,
    method: clickMethod,
    message: `Clicked using ${clickMethod} fallback (selector-based approach failed)`
  };
}

// =============================================================================
// END COORDINATE FALLBACK UTILITIES
// =============================================================================

// =============================================================================
// ACTION VERIFICATION UTILITIES
// =============================================================================

/**
 * Captures comprehensive state before/after an action for verification
 * @param {Element|null} element - The element being acted upon (null for page-level actions)
 * @param {string} actionType - Type of action being performed (click, type, etc.)
 * @returns {Object} State snapshot for comparison
 */
function captureActionState(element, actionType) {
  // Global state - always captured
  const state = {
    timestamp: Date.now(),
    url: window.location.href,
    bodyTextLength: document.body?.innerText?.length || 0,
    elementCount: document.querySelectorAll('*').length,
    activeElement: document.activeElement?.tagName || null,
    element: { exists: false },
    relatedElements: []
  };

  // Element-specific state (if element provided)
  if (element && document.contains(element)) {
    state.element = {
      exists: true,
      tagName: element.tagName,
      className: FSB.getClassName(element),
      value: element.value !== undefined ? element.value : null,
      textContent: element.isContentEditable ? (element.textContent || '').substring(0, 500) : null,
      checked: element.checked !== undefined ? element.checked : null,
      selectedIndex: element.selectedIndex !== undefined ? element.selectedIndex : null,
      innerText: (element.innerText || '').substring(0, 100),
      // ARIA state
      ariaExpanded: element.getAttribute('aria-expanded'),
      ariaSelected: element.getAttribute('aria-selected'),
      ariaChecked: element.getAttribute('aria-checked'),
      ariaPressed: element.getAttribute('aria-pressed'),
      ariaHidden: element.getAttribute('aria-hidden'),
      dataState: element.getAttribute('data-state'),
      // Additional element state
      open: element.open !== undefined ? element.open : null,
      disabled: element.disabled !== undefined ? element.disabled : null
    };

    // For click actions, capture related elements that might change
    if (actionType === 'click' || actionType === 'hover') {
      let relatedSelectors = [];
      try {
        const escapedId = element.id ? CSS.escape(element.id) : null;
        relatedSelectors = [
          element.nextElementSibling,
          element.querySelector('[role="menu"], [role="listbox"], .dropdown-menu, .submenu'),
          element.id ? document.querySelector(`[aria-labelledby="${element.id}"]`) : null,
          element.id ? document.querySelector(`[aria-controls="${element.id}"]`) : null,
          escapedId ? document.querySelector(`#${escapedId}-content, #${escapedId}-panel, #${escapedId}-menu`) : null
        ].filter(Boolean);
      } catch (e) {
        // Don't let related element lookup crash the action
      }

      state.relatedElements = relatedSelectors.map(el => {
        try {
          const style = getComputedStyle(el);
          return {
            tagName: el.tagName,
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            height: el.getBoundingClientRect().height,
            ariaHidden: el.getAttribute('aria-hidden')
          };
        } catch (e) {
          return null;
        }
      }).filter(Boolean);
    }
  }

  return state;
}

/**
 * Expected effects for each action type
 * - required: All must occur for verification to pass
 * - anyOf: At least one must occur (unless optional is true)
 * - optional: Action may not have visible effect (e.g., hover)
 * - timeout: Suggested wait time for effects to manifest
 */
const EXPECTED_EFFECTS = {
  click: {
    anyOf: ['urlChanged', 'contentChanged', 'elementCountChanged', 'ariaExpandedChanged',
            'focusChanged', 'classChanged', 'relatedVisibilityChanged', 'loadingDetected'],
    timeout: 300
  },
  type: {
    anyOf: ['valueChanged', 'textContentChanged'],
    timeout: 200
  },
  selectOption: {
    required: ['selectedIndexChanged'],
    anyOf: ['valueChanged'],
    timeout: 200
  },
  toggleCheckbox: {
    required: ['checkedChanged'],
    timeout: 200
  },
  pressEnter: {
    anyOf: ['urlChanged', 'elementCountChanged', 'contentChanged', 'focusChanged'],
    timeout: 1000
  },
  navigate: {
    required: ['urlChanged'],
    timeout: 5000
  },
  hover: {
    anyOf: ['classChanged', 'ariaExpandedChanged', 'relatedVisibilityChanged'],
    optional: true  // Hover may not have visible effect
  },
  focus: {
    required: ['focusChanged'],
    timeout: 100
  }
};

/**
 * Detects changes between pre and post action states
 * @param {Object} preState - State before action
 * @param {Object} postState - State after action
 * @returns {Object} Object with boolean flags for each type of change
 */
function detectChanges(preState, postState) {
  const changes = {
    // Global changes
    urlChanged: preState.url !== postState.url,
    contentChanged: Math.abs(postState.bodyTextLength - preState.bodyTextLength) > 10,
    elementCountChanged: Math.abs(postState.elementCount - preState.elementCount) > 2,
    focusChanged: preState.activeElement !== postState.activeElement,
    loadingDetected: !!document.querySelector('.loading, .spinner, [class*="load"], [aria-busy="true"]')
  };

  // Element-specific changes (only if element exists in both states)
  if (preState.element.exists && postState.element.exists) {
    changes.classChanged = preState.element.className !== postState.element.className;
    changes.valueChanged = preState.element.value !== postState.element.value;
    changes.textContentChanged = preState.element.textContent !== postState.element.textContent;
    changes.checkedChanged = preState.element.checked !== postState.element.checked;
    changes.selectedIndexChanged = preState.element.selectedIndex !== postState.element.selectedIndex;
    changes.ariaExpandedChanged = preState.element.ariaExpanded !== postState.element.ariaExpanded;
    changes.ariaSelectedChanged = preState.element.ariaSelected !== postState.element.ariaSelected;
    changes.ariaCheckedChanged = preState.element.ariaChecked !== postState.element.ariaChecked;
    changes.ariaPressedChanged = preState.element.ariaPressed !== postState.element.ariaPressed;
    changes.dataStateChanged = preState.element.dataState !== postState.element.dataState;
    changes.openChanged = preState.element.open !== postState.element.open;
  } else {
    // Element became unavailable - treat as a change
    changes.elementLost = preState.element.exists && !postState.element.exists;
    changes.classChanged = false;
    changes.valueChanged = false;
    changes.checkedChanged = false;
    changes.selectedIndexChanged = false;
    changes.ariaExpandedChanged = false;
    changes.ariaSelectedChanged = false;
    changes.ariaCheckedChanged = false;
    changes.ariaPressedChanged = false;
    changes.dataStateChanged = false;
    changes.openChanged = false;
  }

  // Related element visibility changes (for click/hover actions)
  changes.relatedVisibilityChanged = false;
  if (preState.relatedElements.length > 0 && postState.relatedElements.length > 0) {
    changes.relatedVisibilityChanged = preState.relatedElements.some((pre, i) => {
      const post = postState.relatedElements[i];
      if (!post) return false;
      return pre.display !== post.display ||
             pre.visibility !== post.visibility ||
             pre.opacity !== post.opacity ||
             Math.abs(pre.height - post.height) > 5 ||
             pre.ariaHidden !== post.ariaHidden;
    });
  }

  return changes;
}

/**
 * Verifies that an action had its expected effect
 * @param {Object} preState - State captured before action
 * @param {Object} postState - State captured after action
 * @param {string} actionType - Type of action performed
 * @returns {Object} Verification result { verified, reason, changes, details }
 */
function verifyActionEffect(preState, postState, actionType) {
  const changes = detectChanges(preState, postState);
  const expectations = EXPECTED_EFFECTS[actionType];

  // --- Localized change detection ---
  // Track changes near the target element and global state changes
  const localChanges = [];
  let whatChanged = 'No observable changes';

  // Check sibling changes (next/previous element visibility or content)
  if (postState.element?.exists && preState.element?.exists) {
    if (preState.element.innerText !== postState.element.innerText) {
      localChanges.push({ type: 'text_changed', detail: 'Target element text content updated' });
    }
    if (preState.element.ariaExpanded !== postState.element.ariaExpanded) {
      localChanges.push({ type: 'aria_expanded_changed', detail: `aria-expanded: ${preState.element.ariaExpanded} -> ${postState.element.ariaExpanded}` });
    }
    if (preState.element.ariaChecked !== postState.element.ariaChecked) {
      localChanges.push({ type: 'aria_checked_changed', detail: `aria-checked: ${preState.element.ariaChecked} -> ${postState.element.ariaChecked}` });
    }
    if (preState.element.dataState !== postState.element.dataState) {
      localChanges.push({ type: 'data_state_changed', detail: `data-state: ${preState.element.dataState} -> ${postState.element.dataState}` });
    }
  }

  // Check related element visibility changes (parent containers, siblings)
  if (preState.relatedElements && postState.relatedElements) {
    for (let i = 0; i < Math.max(preState.relatedElements.length, postState.relatedElements.length); i++) {
      const pre = preState.relatedElements[i];
      const post = postState.relatedElements[i];
      if (!pre && post) {
        localChanges.push({ type: 'related_appeared', detail: `New related element appeared: ${post.tagName}` });
      } else if (pre && post) {
        if (pre.display !== post.display || pre.visibility !== post.visibility) {
          localChanges.push({ type: 'related_visibility_changed', detail: `Related element visibility changed` });
        }
        if (Math.abs(pre.height - post.height) > 5) {
          localChanges.push({ type: 'related_size_changed', detail: `Related element height changed: ${pre.height} -> ${post.height}` });
        }
      }
    }
  }

  // Check for new global UI elements (menus, dialogs, listboxes)
  if (changes.elementCountChanged) {
    try {
      const newMenus = document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"]');
      if (newMenus.length > 0) {
        localChanges.push({ type: 'global_ui_element', detail: `Found ${newMenus.length} menu/dialog/listbox elements in DOM` });
      }
    } catch (e) {
      // Ignore DOM query errors during verification
    }
  }

  // URL change is a global change
  if (changes.urlChanged) {
    localChanges.push({ type: 'url_changed', detail: `URL changed: ${preState.url} -> ${postState.url}` });
  }

  // Build whatChanged summary
  if (localChanges.length > 0) {
    const types = localChanges.map(c => c.type);
    if (types.includes('url_changed')) whatChanged = 'Navigation occurred';
    else if (types.includes('aria_expanded_changed')) whatChanged = 'Dropdown/section expanded or collapsed';
    else if (types.includes('global_ui_element')) whatChanged = 'Menu or dialog opened';
    else if (types.includes('related_appeared') || types.includes('related_visibility_changed')) whatChanged = 'Related element appeared or changed visibility';
    else if (types.includes('text_changed')) whatChanged = 'Text content updated';
    else if (types.includes('data_state_changed')) whatChanged = 'Element state changed';
    else whatChanged = localChanges.map(c => c.detail).join('; ');
  }

  // --- End localized change detection ---

  // Determine confidence level based on expectations and local changes
  function computeConfidence(requiredMet, anyOfMet) {
    const hasLocal = localChanges.length > 0;
    if (requiredMet !== false && anyOfMet && hasLocal) return 'high';
    if (anyOfMet && !hasLocal) return 'medium';
    if (!anyOfMet && hasLocal) return 'medium';
    return 'low';
  }

  // If no expectations defined for this action type, assume verified
  if (!expectations) {
    const confidence = localChanges.length > 0 ? 'medium' : 'low';
    return {
      verified: true,
      reason: 'No expectations defined for action type',
      changes,
      localChanges,
      confidence,
      whatChanged,
      details: { actionType, expectationsDefined: false }
    };
  }

  const result = {
    verified: false,
    reason: '',
    changes,
    localChanges,
    confidence: 'low',
    whatChanged,
    details: {
      actionType,
      expectations,
      requiredMet: null,
      anyOfMet: null
    }
  };

  // Check required changes (all must occur)
  if (expectations.required) {
    const requiredMet = expectations.required.every(change => changes[change] === true);
    result.details.requiredMet = requiredMet;

    if (!requiredMet) {
      const missingRequired = expectations.required.filter(change => !changes[change]);
      result.reason = `Required changes not detected: ${missingRequired.join(', ')}`;
      result.confidence = computeConfidence(false, false);
      return result;
    }
  }

  // Check anyOf changes (at least one must occur)
  if (expectations.anyOf) {
    const anyOfMet = expectations.anyOf.some(change => changes[change] === true);
    result.details.anyOfMet = anyOfMet;

    if (!anyOfMet) {
      // If action is optional, still verify but with note
      if (expectations.optional) {
        result.verified = true;
        result.reason = 'Optional action - no detectable effect (may be normal)';
        result.confidence = computeConfidence(result.details.requiredMet, false);
        return result;
      }

      result.reason = `No expected effects detected. Expected one of: ${expectations.anyOf.join(', ')}`;
      result.confidence = computeConfidence(result.details.requiredMet, false);
      return result;
    }
  }

  // All checks passed
  result.verified = true;
  const detectedChanges = Object.entries(changes)
    .filter(([key, value]) => value === true)
    .map(([key]) => key);
  result.reason = `Action verified: ${detectedChanges.join(', ')}`;
  result.confidence = computeConfidence(result.details.requiredMet, true);

  return result;
}

/**
 * 8-point diagnostic check for element failures.
 * When a click/type/select action fails, this runs a comprehensive check
 * to determine WHY and provide actionable suggestions to the AI.
 * @param {string} selector - The selector that was used
 * @param {Element|null} element - The element (if found but action failed), or null if not found
 * @returns {Object} Diagnostic result with checks array, summary, and suggestions
 */
function diagnoseElementFailure(selector, element = null) {
  const diagnostic = {
    selector,
    checks: [],
    summary: '',
    suggestions: []
  };

  // If element was found but action failed, diagnose the element
  if (element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    // 1. Visible?
    const isVisible = rect.width > 0 && rect.height > 0 &&
      style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    diagnostic.checks.push({ check: 'visible', passed: isVisible, detail: isVisible ? 'Element visible' : `Hidden: display=${style.display}, visibility=${style.visibility}, opacity=${style.opacity}, size=${rect.width}x${rect.height}` });

    // 2. Disabled?
    const isDisabled = element.disabled || element.getAttribute('aria-disabled') === 'true';
    diagnostic.checks.push({ check: 'enabled', passed: !isDisabled, detail: isDisabled ? 'Element is disabled' : 'Element enabled' });

    // 3. Covered by overlay/modal?
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const topEl = document.elementFromPoint(centerX, centerY);
    const isCovered = topEl && topEl !== element && !element.contains(topEl) && !topEl.contains(element);
    diagnostic.checks.push({ check: 'not_covered', passed: !isCovered, detail: isCovered ? `Covered by ${topEl.tagName}.${topEl.className?.split?.(' ')?.[0] || ''}` : 'Not covered' });

    // 4. Needs scroll into view?
    const inViewport = rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth;
    diagnostic.checks.push({ check: 'in_viewport', passed: inViewport, detail: inViewport ? 'In viewport' : `Out of viewport: top=${Math.round(rect.top)}, bottom=${Math.round(rect.bottom)}` });

    // 5. pointer-events: none?
    const pointerNone = style.pointerEvents === 'none';
    diagnostic.checks.push({ check: 'pointer_events', passed: !pointerNone, detail: pointerNone ? 'pointer-events: none' : 'Pointer events enabled' });

    // 6. Inside collapsed details/accordion?
    let collapsed = false;
    let parent = element.parentElement;
    while (parent) {
      if (parent.tagName === 'DETAILS' && !parent.open) { collapsed = true; break; }
      if (parent.getAttribute('aria-expanded') === 'false' && parent.getAttribute('aria-hidden') === 'true') { collapsed = true; break; }
      parent = parent.parentElement;
    }
    diagnostic.checks.push({ check: 'not_collapsed', passed: !collapsed, detail: collapsed ? 'Inside collapsed container' : 'Not collapsed' });

    // 7. Requires hover to become clickable?
    const needsHover = style.visibility === 'hidden' && element.closest('[class*="hover"]') !== null;
    diagnostic.checks.push({ check: 'no_hover_needed', passed: !needsHover, detail: needsHover ? 'May need hover to reveal' : 'No hover dependency detected' });

    // 8. Element still in DOM?
    const inDOM = document.contains(element);
    diagnostic.checks.push({ check: 'in_dom', passed: inDOM, detail: inDOM ? 'In DOM' : 'REMOVED from DOM since snapshot' });

    // Build summary and suggestions
    const failures = diagnostic.checks.filter(c => !c.passed);
    if (failures.length === 0) {
      diagnostic.summary = 'All checks passed -- element appears interactable';
    } else {
      diagnostic.summary = `Failed: ${failures.map(f => f.check).join(', ')}`;
      for (const f of failures) {
        if (f.check === 'not_covered') diagnostic.suggestions.push('Try dismissing the overlay or modal first, then retry');
        if (f.check === 'in_viewport') diagnostic.suggestions.push('Scroll the element into view first');
        if (f.check === 'enabled') diagnostic.suggestions.push('Element is disabled -- wait for it to become enabled or look for an alternative');
        if (f.check === 'visible') diagnostic.suggestions.push('Element is hidden -- it may appear after a user action like clicking a menu or hovering');
        if (f.check === 'pointer_events') diagnostic.suggestions.push('Element has pointer-events:none -- try clicking its parent or a nearby interactive element');
        if (f.check === 'not_collapsed') diagnostic.suggestions.push('Expand the collapsed section first, then retry');
        if (f.check === 'no_hover_needed') diagnostic.suggestions.push('Try hovering over the parent element first to reveal this element');
        if (f.check === 'in_dom') diagnostic.suggestions.push('Element was removed -- page may have updated. Re-read the page and find the new element');
      }
    }
  } else {
    // Element not found at all
    diagnostic.checks.push({ check: 'exists', passed: false, detail: `No element found for selector: ${selector}` });
    diagnostic.summary = 'Element not found in DOM';
    diagnostic.suggestions.push('The element may have been removed or the page changed. Re-read the page content and use updated refs');
  }

  return diagnostic;
}

/**
 * Build a structured failure report for action handlers.
 * Combines diagnostic info, element state snapshot, and natural language suggestions
 * so the AI gets everything it needs to reason about recovery.
 * @param {string} action - Action name (click, type, select, etc.)
 * @param {string} selector - Selector that was used
 * @param {Element|null} element - The element (if found), or null
 * @param {string} error - Error description
 * @param {Object|null} diagnostic - Pre-computed diagnostic from diagnoseElementFailure, or null to auto-compute
 * @returns {Object} Structured failure report
 */
function buildFailureReport(action, selector, element, error, diagnostic = null) {
  const report = {
    success: false,
    action,
    error,
    reason: error,
    diagnostic: diagnostic || (selector ? diagnoseElementFailure(selector, element) : null),
    suggestions: [],
    elementSnapshot: null
  };

  // Build element state snapshot if element exists and is still in DOM
  if (element && document.contains(element)) {
    try {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      report.elementSnapshot = {
        tag: element.tagName.toLowerCase(),
        visible: rect.width > 0 && rect.height > 0 && style.display !== 'none',
        disabled: element.disabled || element.getAttribute('aria-disabled') === 'true',
        ariaRole: element.getAttribute('role'),
        ariaExpanded: element.getAttribute('aria-expanded'),
        ariaChecked: element.getAttribute('aria-checked'),
        ariaSelected: element.getAttribute('aria-selected'),
        ariaHidden: element.getAttribute('aria-hidden'),
        parentTag: element.parentElement?.tagName?.toLowerCase(),
        parentRole: element.parentElement?.getAttribute('role'),
        nearbyText: (element.parentElement?.textContent?.trim() || '').substring(0, 100),
        rect: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) }
      };
    } catch (e) {
      report.elementSnapshot = { error: 'Could not capture element state' };
    }
  }

  // Build natural language suggestions from diagnostic
  if (report.diagnostic?.suggestions?.length) {
    report.suggestions = report.diagnostic.suggestions;
  } else {
    // Generic suggestions based on error type
    if (error.includes('not found')) {
      report.suggestions.push('The element may have been removed or the page changed. Try re-reading the page to get updated element refs.');
    }
    if (error.includes('disabled')) {
      report.suggestions.push('Wait for the element to become enabled, or look for an alternative action.');
    }
    if (error.includes('timeout')) {
      report.suggestions.push('The page may be loading slowly. Try waiting and retrying, or scroll to ensure the element is visible.');
    }
  }

  return report;
}

/**
 * Heuristic fix engine: tries deterministic DOM-level fixes for common failure patterns.
 * Runs in content script (has DOM access). Called by background.js via HEURISTIC_FIX message.
 * @param {Object} failedAction - The action result that failed (with diagnostic)
 * @returns {Promise<Object>} { resolved: boolean, fix?: string }
 */
async function runHeuristicFix(failedAction) {
  const diagnostic = failedAction.diagnostic;
  if (!diagnostic) return { resolved: false };

  const failures = diagnostic.checks?.filter(c => !c.passed) || [];
  const selector = failedAction.selector || failedAction.selectorTried;

  for (const failure of failures) {
    // Pattern: Element covered by overlay/modal -> try dismissing with Escape
    if (failure.check === 'not_covered') {
      try {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await waitForStability('click');
        if (selector) {
          const el = document.querySelector(selector);
          if (el) {
            const retryDiag = diagnoseElementFailure(selector, el);
            const stillCovered = retryDiag.checks.find(c => c.check === 'not_covered' && !c.passed);
            if (!stillCovered) {
              return { resolved: true, fix: 'Dismissed overlay with Escape key' };
            }
          }
        }
      } catch (e) { /* continue to next pattern */ }
    }

    // Pattern: Element needs scroll into view
    if (failure.check === 'in_viewport' && selector) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          await waitForStability('scroll');
          return { resolved: true, fix: 'Scrolled element into view' };
        }
      } catch (e) { /* continue */ }
    }

    // Pattern: Element inside collapsed container -> try expanding parent
    if (failure.check === 'not_collapsed' && selector) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          let parent = el.parentElement;
          while (parent) {
            if (parent.tagName === 'DETAILS' && !parent.open) {
              parent.open = true;
              return { resolved: true, fix: 'Expanded collapsed details element' };
            }
            if (parent.getAttribute('aria-expanded') === 'false') {
              parent.click();
              await waitForStability('click');
              return { resolved: true, fix: 'Expanded collapsed accordion' };
            }
            parent = parent.parentElement;
          }
        }
      } catch (e) { /* continue */ }
    }
  }

  return { resolved: false };
}

// =============================================================================
// DIAGNOSTIC MESSAGES AND ACTION RECORDING
// =============================================================================

/**
 * Diagnostic message templates for different failure types
 * Each provides: message, details, suggestions, and optional fields
 */
const DIAGNOSTIC_MESSAGES = {
  elementNotFound: {
    message: 'Element not found',
    getDetails: (context) => `Selector "${context.selector}" did not match any element on the page`,
    suggestions: [
      'Element may not exist yet - check if page is still loading',
      'Selector may be stale - page content may have changed',
      'Element may be inside an iframe or shadow DOM',
      'Try using a more specific or alternative selector'
    ]
  },
  elementNotVisible: {
    message: 'Element not visible',
    getDetails: (context) => {
      const style = context.style || {};
      return `Element exists but is not visible: display=${style.display || 'unknown'}, visibility=${style.visibility || 'unknown'}, opacity=${style.opacity || 'unknown'}`;
    },
    suggestions: [
      'Element may be hidden by CSS - check parent containers',
      'Element may require scroll into view',
      'Element may be covered by overlay or modal',
      'Wait for animation to complete'
    ]
  },
  elementDisabled: {
    message: 'Element disabled',
    getDetails: (context) => `Element has disabled=${context.disabled}, aria-disabled=${context.ariaDisabled || 'false'}`,
    suggestions: [
      'Wait for element to become enabled',
      'Check if prerequisite actions are needed (form validation, etc.)',
      'Fill required fields before interacting with this element'
    ]
  },
  clickIntercepted: {
    message: 'Click intercepted by overlay',
    getDetails: (context) => {
      const cover = context.coveringElement || {};
      return `Click would hit ${cover.tagName || 'unknown'}.${typeof cover.className === 'string' ? cover.className : ''} instead of target`;
    },
    suggestions: [
      'Close any modal or overlay first',
      'Scroll to bring element into view',
      'Wait for animation to complete',
      'Try clicking the covering element to dismiss it'
    ]
  },
  noEffect: {
    message: 'Action had no effect',
    getDetails: (context) => `${context.action || 'Action'} executed but no expected changes detected`,
    suggestions: [
      'Element may not be interactive (decoration only)',
      'JavaScript event handler may not be attached',
      'Try alternative selector or action method',
      'Element may require focus before interaction'
    ]
  },
  notReady: {
    message: 'Element not ready',
    getDetails: (context) => {
      const checks = context.checks || {};
      const failed = Object.entries(checks)
        .filter(([key, val]) => val && !val.passed)
        .map(([key]) => key);
      return `Element failed readiness checks: ${failed.join(', ') || 'unknown'}`;
    },
    suggestions: [
      'Wait for element to stabilize',
      'Element may be animating or transitioning',
      'Check if element is covered by another element',
      'Ensure element is within viewport'
    ]
  }
};

/**
 * Generates a diagnostic object for a specific failure type
 * @param {string} failureType - One of: elementNotFound, elementNotVisible, elementDisabled, clickIntercepted, noEffect, notReady
 * @param {Object} context - Context data for the failure (selector, style, checks, etc.)
 * @returns {Object} Diagnostic object with message, details, suggestions, and context-specific fields
 */
function generateDiagnostic(failureType, context = {}) {
  const template = DIAGNOSTIC_MESSAGES[failureType];

  if (!template) {
    return {
      message: failureType || 'Unknown failure',
      details: JSON.stringify(context),
      suggestions: ['Check the logs for more information']
    };
  }

  const diagnostic = {
    message: template.message,
    details: template.getDetails(context),
    suggestions: template.suggestions
  };

  // Add context-specific fields
  if (context.selector) {
    diagnostic.tried = Array.isArray(context.tried) ? context.tried : [context.selector];
  }

  if (context.coveringElement) {
    diagnostic.coveringElement = {
      tagName: context.coveringElement.tagName,
      className: FSB.getClassName(context.coveringElement),
      id: context.coveringElement.id
    };
  }

  if (context.checks) {
    diagnostic.checkResults = context.checks;
  }

  return diagnostic;
}

/**
 * Captures details about an element for action recording
 * @param {Element|null} element - The DOM element to capture details from
 * @returns {Object|null} Element details including visibility, position, interactability, or null if element is null
 */
function captureElementDetails(element) {
  if (!element) return null;

  try {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    return {
      // Basic identity
      tagName: element.tagName,
      id: element.id || null,
      className: FSB.getClassName(element) || null,
      text: (element.innerText || element.textContent || '').substring(0, 50),

      // Visibility state
      isVisible: style.display !== 'none' &&
                 style.visibility !== 'hidden' &&
                 parseFloat(style.opacity) > 0,
      isEnabled: !element.disabled && element.getAttribute('aria-disabled') !== 'true',
      isInViewport: rect.top >= 0 && rect.left >= 0 &&
                    rect.bottom <= viewportHeight &&
                    rect.right <= viewportWidth,

      // Position
      boundingRect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  } catch (error) {
    // Return minimal info on error
    return {
      tagName: element.tagName || 'UNKNOWN',
      error: error.message
    };
  }
}

/**
 * ActionRecorder class for structured action logging
 * Records every action attempt with full context for debugging and replay
 */
class ActionRecorder {
  constructor() {
    this.records = [];
    this.currentSessionId = null;
  }

  /**
   * Sets the current session ID for all subsequent records
   * @param {string} sessionId - The session ID to associate with records
   */
  setSession(sessionId) {
    this.currentSessionId = sessionId;
  }

  /**
   * Records an action with full context
   * @param {string|null} actionId - Unique action ID (generated if not provided)
   * @param {string} tool - The tool/action name (e.g., 'click', 'type')
   * @param {Object} params - Original parameters passed to the tool
   * @param {Object} data - Additional data (selectorTried, elementFound, coordinates, success, etc.)
   * @returns {string} The action ID for reference
   */
  record(actionId, tool, params, data = {}) {
    const id = actionId || crypto.randomUUID();

    const record = {
      actionId: id,
      sessionId: this.currentSessionId,
      timestamp: Date.now(),
      tool,
      params,
      // Spread additional data fields
      selectorTried: data.selectorTried || null,
      selectorUsed: data.selectorUsed || null,
      elementFound: data.elementFound !== undefined ? data.elementFound : null,
      elementDetails: data.elementDetails || null,
      coordinatesUsed: data.coordinatesUsed || null,
      coordinateSource: data.coordinateSource || null,
      success: data.success !== undefined ? data.success : null,
      error: data.error || null,
      hadEffect: data.hadEffect !== undefined ? data.hadEffect : null,
      effectDetails: data.effectDetails || null,
      diagnostic: data.diagnostic || null,
      duration: data.duration || null
    };

    // Store in local records
    this.records.push(record);

    // Keep records bounded
    if (this.records.length > 1000) {
      this.records = this.records.slice(-500);
    }

    // Log via logger if available
    if (logger && logger.logActionRecord) {
      logger.logActionRecord(record);
    }

    return id;
  }

  /**
   * Returns all recorded actions
   * @returns {Array} All action records
   */
  getRecords() {
    return this.records;
  }

  /**
   * Clears all records
   */
  clear() {
    this.records = [];
  }
}

// Create singleton instance
const actionRecorder = new ActionRecorder();

/**
 * SPEED-01: Detects the outcome of an action to determine appropriate wait strategy
 * Classifies outcomes: navigation, network, majorDOMChange, minorDOMChange, elementStateChange, noChange
 * @param {Object} preState - State captured before action (from captureActionState)
 * @param {Object} postState - State captured after action (from captureActionState)
 * @param {Object} actionResult - Result from action handler (contains verification info)
 * @returns {Object} Outcome { type, confidence, details }
 */
function detectActionOutcome(preState, postState, actionResult = {}) {
  // Calculate deltas
  const elementDelta = Math.abs((postState?.elementCount || 0) - (preState?.elementCount || 0));
  const textDelta = Math.abs((postState?.bodyTextLength || 0) - (preState?.bodyTextLength || 0));

  // Priority 1: Navigation detected (URL changed)
  if (preState?.url && postState?.url && preState.url !== postState.url) {
    return {
      type: 'navigation',
      confidence: 'HIGH',
      details: {
        fromUrl: preState.url,
        toUrl: postState.url
      }
    };
  }

  // Priority 2: Network activity (actionResult indicates network or pending requests)
  if (actionResult?.triggeredNetwork || (postState?.pendingRequests && postState.pendingRequests > 0)) {
    return {
      type: 'network',
      confidence: 'HIGH',
      details: {
        triggeredNetwork: actionResult?.triggeredNetwork || false,
        pendingRequests: postState?.pendingRequests || 0
      }
    };
  }

  // Priority 3: Major DOM change (significant element or text changes)
  if (elementDelta > 10 || textDelta > 500) {
    return {
      type: 'majorDOMChange',
      confidence: 'HIGH',
      details: {
        elementDelta,
        textDelta
      }
    };
  }

  // Priority 4: Minor DOM change (any element or text change)
  if (elementDelta > 0 || textDelta > 0) {
    return {
      type: 'minorDOMChange',
      confidence: 'MEDIUM',
      details: {
        elementDelta,
        textDelta
      }
    };
  }

  // Priority 5: Element state change (class, aria-expanded, etc.)
  const changes = actionResult?.verification?.changes || {};
  if (changes.classChanged || changes.ariaExpandedChanged ||
      changes.ariaSelectedChanged || changes.ariaPressedChanged ||
      changes.dataStateChanged || changes.openChanged) {
    return {
      type: 'elementStateChange',
      confidence: 'HIGH',
      details: {
        classChanged: changes.classChanged,
        ariaExpandedChanged: changes.ariaExpandedChanged,
        ariaSelectedChanged: changes.ariaSelectedChanged,
        ariaPressedChanged: changes.ariaPressedChanged
      }
    };
  }

  // Default: No detectable change
  return {
    type: 'noChange',
    confidence: 'HIGH',
    details: {
      elementDelta,
      textDelta,
      reason: 'No detectable outcome from action'
    }
  };
}

/**
 * Waits for page stability - both DOM stable AND network quiet
 * Enhanced version of waitForDOMStable with proper network request tracking
 * @param {Object} options - Configuration options
 * @param {number} options.maxWait - Maximum wait time in ms (default: 5000)
 * @param {number} options.stableTime - DOM must be stable for this long in ms (default: 500)
 * @param {number} options.networkQuietTime - No network activity for this long in ms (default: 300)
 * @returns {Promise<Object>} Stability info { stable, timedOut, domStableFor, networkQuietFor, pendingRequests, waitTime }
 */
async function waitForPageStability(options = {}) {
  const {
    maxWait = 5000,
    stableTime = 500,
    networkQuietTime = 300,
    uiReadySelector = null  // CSS selector -- if this element is enabled/visible, proceed even with pending network
  } = options;

  const startTime = Date.now();
  let lastDOMChange = Date.now();
  let lastNetworkActivity = Date.now();
  let pendingRequestCount = 0;
  let domChangeCount = 0;
  let networkRequestCount = 0;

  // Store original functions
  const originalFetch = window.fetch;
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  // Track fetch requests with proper completion tracking
  window.fetch = function(...args) {
    pendingRequestCount++;
    networkRequestCount++;
    lastNetworkActivity = Date.now();
    return originalFetch.apply(this, args).finally(() => {
      pendingRequestCount--;
      lastNetworkActivity = Date.now();
    });
  };

  // Track XHR requests with proper completion tracking
  XMLHttpRequest.prototype.open = function(...args) {
    networkRequestCount++;
    lastNetworkActivity = Date.now();
    return originalXHROpen.apply(this, args);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    pendingRequestCount++;
    lastNetworkActivity = Date.now();

    // Track completion
    this.addEventListener('loadend', () => {
      pendingRequestCount--;
      lastNetworkActivity = Date.now();
    }, { once: true });

    return originalXHRSend.apply(this, args);
  };

  // Create mutation observer
  const observer = new MutationObserver((mutations) => {
    // Filter out trivial changes (loading indicators, etc.)
    const significantMutations = mutations.filter(mutation => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const target = mutation.target;
        if (target.classList && (
          target.classList.contains('loading') ||
          target.classList.contains('spinner') ||
          target.classList.contains('progress')
        )) {
          return false;
        }
      }
      return true;
    });

    if (significantMutations.length > 0) {
      domChangeCount += significantMutations.length;
      lastDOMChange = Date.now();
    }
  });

  try {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: false,
      characterData: true,
      attributeFilter: ['class', 'id', 'data-state', 'aria-expanded', 'aria-hidden', 'aria-selected']
    });

    return await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const now = Date.now();
        const totalTime = now - startTime;
        const domStableFor = now - lastDOMChange;
        const networkQuietFor = now - lastNetworkActivity;

        // Check if both DOM and network are stable
        const isDOMStable = domStableFor >= stableTime;
        const isNetworkQuiet = networkQuietFor >= networkQuietTime && pendingRequestCount === 0;
        const isStable = isDOMStable && isNetworkQuiet;
        const hasTimedOut = totalTime >= maxWait;

        // UI-ready override: if the target element is interactable, proceed even if network isn't quiet
        if (uiReadySelector && isDOMStable && !isStable) {
          try {
            const readyEl = document.querySelector(uiReadySelector);
            if (readyEl) {
              const isReady = !readyEl.disabled &&
                readyEl.getAttribute('aria-disabled') !== 'true' &&
                getComputedStyle(readyEl).pointerEvents !== 'none' &&
                readyEl.getBoundingClientRect().width > 0;
              if (isReady) {
                clearInterval(checkInterval);
                observer.disconnect();
                window.fetch = originalFetch;
                XMLHttpRequest.prototype.open = originalXHROpen;
                XMLHttpRequest.prototype.send = originalXHRSend;
                resolve({
                  stable: true,
                  timedOut: false,
                  domStableFor,
                  networkQuietFor,
                  pendingRequests: pendingRequestCount,
                  waitTime: totalTime,
                  domChangeCount,
                  networkRequestCount,
                  reason: 'ui_ready'
                });
                return;
              }
            }
          } catch (e) { /* uiReadySelector check failed, fall through to normal logic */ }
        }

        if (isStable || hasTimedOut) {
          clearInterval(checkInterval);
          observer.disconnect();

          // Restore original functions
          window.fetch = originalFetch;
          XMLHttpRequest.prototype.open = originalXHROpen;
          XMLHttpRequest.prototype.send = originalXHRSend;

          const result = {
            stable: isStable,
            timedOut: hasTimedOut && !isStable,
            domStableFor,
            networkQuietFor,
            pendingRequests: pendingRequestCount,
            waitTime: totalTime,
            domChangeCount,
            networkRequestCount,
            reason: isStable ? 'stable' : (hasTimedOut ? 'timeout' : 'pending')
          };

          // Log for debugging
          if (logger && FSB.sessionId) {
            logger.logTiming(FSB.sessionId, 'WAIT', 'page_stability', totalTime, {
              domChanges: domChangeCount,
              networkRequests: networkRequestCount,
              pendingRequests: pendingRequestCount,
              stable: isStable
            });
          }

          resolve(result);
        }
      }, 50);

      // Safety timeout
      setTimeout(() => {
        clearInterval(checkInterval);
        observer.disconnect();

        // Restore original functions
        window.fetch = originalFetch;
        XMLHttpRequest.prototype.open = originalXHROpen;
        XMLHttpRequest.prototype.send = originalXHRSend;

        resolve({
          stable: false,
          timedOut: true,
          domStableFor: Date.now() - lastDOMChange,
          networkQuietFor: Date.now() - lastNetworkActivity,
          pendingRequests: pendingRequestCount,
          waitTime: maxWait + 1000,
          domChangeCount,
          networkRequestCount,
          reason: 'safety_timeout'
        });
      }, maxWait + 1000);
    });
  } catch (error) {
    // Ensure restoration on error
    observer.disconnect();
    window.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalXHROpen;
    XMLHttpRequest.prototype.send = originalXHRSend;

    return {
      stable: false,
      timedOut: false,
      error: error.message,
      waitTime: Date.now() - startTime,
      reason: 'error'
    };
  }
}

// =============================================================================
// END ACTION VERIFICATION UTILITIES
// =============================================================================

/**
 * Generic ARIA binary state pre-check.
 * Checks whether an element is already in the target state (checked, expanded, etc.)
 * to prevent unnecessary toggles (double-toggling).
 * @param {Element} element - The DOM element to check
 * @param {string} intent - One of: check, uncheck, expand, collapse, select, deselect, press, unpress
 * @returns {Object} { shouldAct, reason, currentState?, targetState?, attribute? }
 */
function checkBinaryState(element, intent) {
  const stateMap = {
    check: { attr: 'aria-checked', target: 'true', current: element.getAttribute('aria-checked') },
    uncheck: { attr: 'aria-checked', target: 'false', current: element.getAttribute('aria-checked') },
    expand: { attr: 'aria-expanded', target: 'true', current: element.getAttribute('aria-expanded') },
    collapse: { attr: 'aria-expanded', target: 'false', current: element.getAttribute('aria-expanded') },
    select: { attr: 'aria-selected', target: 'true', current: element.getAttribute('aria-selected') },
    deselect: { attr: 'aria-selected', target: 'false', current: element.getAttribute('aria-selected') },
    press: { attr: 'aria-pressed', target: 'true', current: element.getAttribute('aria-pressed') },
    unpress: { attr: 'aria-pressed', target: 'false', current: element.getAttribute('aria-pressed') }
  };

  const mapping = stateMap[intent];

  // Check native checkbox/radio checked property first
  if (element.type === 'checkbox' || element.type === 'radio') {
    if (intent === 'check' && element.checked) {
      return { shouldAct: false, reason: 'already_in_state', currentState: 'true', targetState: 'true', attribute: 'checked (native)' };
    }
    if (intent === 'uncheck' && !element.checked) {
      return { shouldAct: false, reason: 'already_in_state', currentState: 'false', targetState: 'false', attribute: 'checked (native)' };
    }
  }

  if (!mapping) return { shouldAct: true, reason: 'unknown_intent' };

  // Try ARIA attribute first
  if (mapping.current !== null) {
    if (mapping.current === mapping.target) {
      return {
        shouldAct: false,
        reason: 'already_in_state',
        currentState: mapping.current,
        targetState: mapping.target,
        attribute: mapping.attr
      };
    }
    return { shouldAct: true, reason: 'state_change_needed', currentState: mapping.current, targetState: mapping.target };
  }

  // Fallback: check data-state attribute
  const dataState = element.getAttribute('data-state');
  if (dataState !== null) {
    const dataStateMap = {
      check: ['checked'],
      uncheck: ['unchecked', ''],
      expand: ['open', 'expanded'],
      collapse: ['closed', 'collapsed'],
      select: ['selected', 'active'],
      deselect: ['unselected', 'inactive']
    };
    const targetStates = dataStateMap[intent];
    if (targetStates && targetStates.includes(dataState)) {
      return {
        shouldAct: false,
        reason: 'already_in_state',
        currentState: dataState,
        targetState: targetStates[0],
        attribute: 'data-state'
      };
    }
    if (targetStates) {
      return { shouldAct: true, reason: 'state_change_needed', currentState: dataState, targetState: targetStates[0] };
    }
  }

  return { shouldAct: true, reason: 'no_aria_state' };
}

// ============================================================================
// STABILITY PROFILES -- observation-based waits replacing hardcoded setTimeout
// Each profile tunes maxWait, stableTime, and networkQuietTime for its use case.
// ============================================================================
const STABILITY_PROFILES = {
  scroll:         { maxWait: 2000, stableTime: 200, networkQuietTime: 150 },
  click:          { maxWait: 3000, stableTime: 300, networkQuietTime: 200 },
  type_keystroke: { maxWait:  500, stableTime:  50, networkQuietTime:  50 },
  type_complete:  { maxWait: 2000, stableTime: 200, networkQuietTime: 150 },
  select:         { maxWait: 2000, stableTime: 300, networkQuietTime: 200 },
  light:          { maxWait: 1000, stableTime: 150, networkQuietTime: 100 }
};

/**
 * Convenience wrapper for waitForPageStability using named profiles.
 * @param {string} profile - One of the STABILITY_PROFILES keys (default: 'click')
 * @param {Object} [overrides] - Optional overrides merged onto the profile options
 * @returns {Promise<Object>} Stability result from waitForPageStability
 */
async function waitForStability(profile = 'click', overrides = {}) {
  const base = STABILITY_PROFILES[profile] || STABILITY_PROFILES.click;
  return waitForPageStability({ ...base, ...overrides });
}

/**
 * Find the submit button within a form element using priority-ordered selectors.
 * Priority: button[type=submit] > input[type=submit] > last non-reset button > input[type=image]
 * @param {HTMLFormElement} formElement - The form to search within
 * @returns {HTMLElement|null} The submit button or null if not found
 */
function findSubmitButton(formElement) {
  if (!formElement) return null;
  // Priority 1: explicit submit buttons
  const explicitSubmit = formElement.querySelector('button[type="submit"], input[type="submit"]');
  if (explicitSubmit && !explicitSubmit.disabled) return explicitSubmit;
  // Priority 2: last non-reset, non-button-type button (common pattern)
  const buttons = formElement.querySelectorAll('button:not([type="reset"]):not([type="button"])');
  for (let i = buttons.length - 1; i >= 0; i--) {
    if (!buttons[i].disabled) return buttons[i];
  }
  // Priority 3: input[type=image] (rare submit variant)
  const imageSubmit = formElement.querySelector('input[type="image"]');
  if (imageSubmit && !imageSubmit.disabled) return imageSubmit;
  return null;
}

/**
 * Detect the current site's search input using a 5-tier DOM heuristic cascade.
 * No AI calls -- pure DOM queries with visibility filtering.
 *
 * Tier 1: input[type="search"]
 * Tier 2: [role="search"] input/textarea
 * Tier 3: input[name="q"], input[name="query"], etc.
 * Tier 4: input[placeholder*="Search" i], input[aria-label*="search" i], etc.
 * Tier 5: form[action*="search"] input[type="text"], form[action*="search"] input:not([type])
 *
 * @returns {Object|null} { element, tier, selector } or null if no visible match
 */
function detectSiteSearchInput() {
  const tiers = [
    { tier: 1, selector: 'input[type="search"]' },
    { tier: 2, selector: '[role="search"] input, [role="search"] textarea' },
    { tier: 3, selector: 'input[name="q"], input[name="query"], input[name="search_query"], input[name="search"], input[name="keyword"], input[name="keywords"]' },
    { tier: 4, selector: 'input[placeholder*="Search" i], input[aria-label*="search" i], textarea[placeholder*="Search" i]' },
    { tier: 5, selector: 'form[action*="search"] input[type="text"], form[action*="search"] input:not([type])' }
  ];

  for (const { tier, selector } of tiers) {
    const candidates = document.querySelectorAll(selector);
    if (candidates.length === 0) continue;

    // Filter by visibility: offsetParent !== null OR computed display !== 'none'
    const visible = Array.from(candidates).filter(el => {
      if (el.offsetParent === null) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        // offsetParent can be null for position:fixed elements -- check explicitly
        if (style.position !== 'fixed' && style.position !== 'sticky') return false;
      }
      return true;
    });

    if (visible.length === 0) continue;

    // Prefer elements in viewport
    const inViewport = visible.filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.left >= 0 &&
             rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
             rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
             rect.width > 0 && rect.height > 0;
    });

    const bestMatch = inViewport.length > 0 ? inViewport[0] : visible[0];
    return { element: bestMatch, tier, selector };
  }

  return null;
}

// Tool functions for browser automation
const tools = {
  // Scroll the page - supports direction ("up"/"down") or raw amount
  scroll: async (params) => {
    let amount;
    if (params.direction) {
      const viewportScroll = window.innerHeight - 100;
      amount = params.direction === 'up' ? -viewportScroll : viewportScroll;
    } else {
      amount = params.amount || 300;
    }
    window.scrollBy(0, amount);
    await waitForStability('scroll');
    const pageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const maxScroll = pageHeight - window.innerHeight;
    const atBottom = window.scrollY >= maxScroll - 10;
    return {
      success: true,
      scrollY: window.scrollY,
      pageHeight,
      atTop: window.scrollY === 0,
      atBottom,
      hasMoreBelow: !atBottom
    };
  },

  // Scroll to top of page
  scrollToTop: async () => {
    window.scrollTo(0, 0);
    await waitForStability('scroll');
    return { success: true, scrollY: 0, atTop: true };
  },

  // Scroll to bottom of page
  scrollToBottom: async () => {
    window.scrollTo(0, document.body.scrollHeight);
    await waitForStability('scroll');
    return { success: true, scrollY: window.scrollY, atBottom: true };
  },

  // Scroll a specific element into view
  scrollToElement: async (params) => {
    const selector = params.selector;
    if (!selector) return { success: false, error: 'No selector provided' };
    const element = document.querySelector(selector);
    if (!element) return { success: false, error: `Element not found: ${selector}` };
    const position = params.position || 'center';
    element.scrollIntoView({ behavior: 'smooth', block: position === 'center' ? 'center' : 'start' });
    await waitForStability('scroll');
    const rect = element.getBoundingClientRect();
    const inViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
    return { success: true, scrollY: window.scrollY, elementInViewport: inViewport };
  },

  // Click an element
  click: async (params) => {
    const startTime = Date.now();

    // Explicit error when called with neither selector nor text (TE-04)
    if (!params.selector && !params.selectors && !params.text && !params.coordinates && !params.ref) {
      return {
        success: false,
        hadEffect: false,
        error: 'click requires either a "selector", "text", "ref", or "coordinates" parameter. Provide a CSS selector from get_dom_snapshot or text content to find and click.',
        tool: 'click'
      };
    }

    const selectorTried = params.selector;
    let coordinatesUsed = null;
    let coordinateSource = null;
    let element = null;
    let selectorUsed = null;

    // TEXT-BASED TARGETING (D-03, D-04, D-05)
    // When params.text is provided, find element by visible text content.
    // This handles dynamic apps (LinkedIn/Ember, Facebook/React) where IDs
    // regenerate and CSS classes are shared across list items.
    if (params.text && typeof params.text === 'string') {
      const searchText = params.text.toLowerCase();
      const candidates = [];

      // Use TreeWalker for efficient traversal of all elements
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            // Skip invisible containers early
            const style = window.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden') {
              return NodeFilter.FILTER_REJECT; // Skip node and its children
            }
            // Check if this element's own text content matches
            // Use innerText (rendered text only) for accuracy
            const nodeText = (node.innerText || node.textContent || '').toLowerCase();
            if (nodeText.includes(searchText)) {
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP; // Skip node but check children
          }
        }
      );

      let node;
      while ((node = walker.nextNode())) {
        candidates.push(node);
      }

      // Find the most specific match: prefer the deepest (most nested) element
      // whose text matches, as it is closest to the actual text content.
      // Filter for visibility: non-zero dimensions.
      let textMatchElement = null;
      for (let i = candidates.length - 1; i >= 0; i--) {
        const el = candidates[i];
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          textMatchElement = el;
          break;
        }
      }

      // D-05: If no "deepest visible" found, fall back to first visible match
      if (!textMatchElement) {
        for (const el of candidates) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            textMatchElement = el;
            break;
          }
        }
      }

      if (textMatchElement) {
        // Found element by text -- skip the selector cascade and proceed
        // directly to the readiness/click logic below.
        element = textMatchElement;
        selectorUsed = `[text-match: "${params.text}"]`;
        // Cache element for potential re-use
        const textSelector = `[text-match-${Date.now()}]`;
        FSB.elementCache?.set(textSelector, element);
      } else {
        // No visible element matches the text
        actionRecorder.record(null, 'click', params, {
          selectorTried: `text:"${params.text}"`,
          selectorUsed: null,
          elementFound: false,
          elementDetails: null,
          coordinatesUsed: null,
          coordinateSource: null,
          success: false,
          error: `No visible element found containing text "${params.text}"`,
          duration: Date.now() - startTime
        });
        return {
          success: false,
          error: `No visible element found containing text "${params.text}". ${candidates.length} hidden/zero-dimension elements matched. Try scrolling the page or using a CSS selector instead.`,
          tool: 'click',
          textSearched: params.text,
          hiddenMatches: candidates.length
        };
      }
    }

    // Support selector cascade -- try multiple selectors before falling back to coordinates
    // Skip if element was already found by text matching above
    if (!element) {
      const selectors = params.selectors || [params.selector];

      for (const sel of selectors) {
        if (!sel) continue; // skip undefined/null selectors when text param was used without selector
        element = FSB.querySelectorWithShadow(sel);
        if (element) {
          selectorUsed = sel;
          break;
        }
      }
    }

    if (!element) {
      // Try coordinate fallback if coordinates provided
      if (params.coordinates && typeof params.coordinates.x === 'number' && typeof params.coordinates.y === 'number') {
        coordinatesUsed = { x: params.coordinates.x, y: params.coordinates.y };
        coordinateSource = 'fallback';
        const result = await clickAtCoordinates({
          x: params.coordinates.x,
          y: params.coordinates.y,
          width: params.coordinates.width || 0,
          height: params.coordinates.height || 0,
          originalSelector: params.selector,
          reason: 'selector_not_found'
        });
        // Record the action
        actionRecorder.record(null, 'click', params, {
          selectorTried,
          selectorUsed: null,
          elementFound: false,
          elementDetails: null,
          coordinatesUsed,
          coordinateSource,
          success: result.success,
          error: result.error || null,
          hadEffect: result.hadEffect,
          duration: Date.now() - startTime
        });
        return result;
      }

      // Record failure - element not found, no fallback
      const clickNotFoundDiagnostic = diagnoseElementFailure(params.selector);
      actionRecorder.record(null, 'click', params, {
        selectorTried,
        selectorUsed: null,
        elementFound: false,
        elementDetails: null,
        coordinatesUsed: null,
        coordinateSource: null,
        success: false,
        error: 'Element not found and no coordinates available for fallback',
        diagnostic: clickNotFoundDiagnostic,
        duration: Date.now() - startTime
      });
      return buildFailureReport('click', params.selector, null, 'Element not found and no coordinates available for fallback', clickNotFoundDiagnostic);
    }

    // Canvas-based editors (Google Sheets/Docs/Slides): skip readiness checks entirely.
    // Their layered canvas UI causes elementFromPoint, stability checks, and visibility
    // checks to hang or return false positives. DOM toolbar elements (Name Box, formula bar)
    // are always interactive despite what readiness checks report.
    const isCanvasEditor = FSB.isCanvasBasedEditor && FSB.isCanvasBasedEditor();
    let readiness = { ready: true, scrolled: false };
    if (!isCanvasEditor) {
      // SPEED-05: Use smart readiness check with fast-path for ready elements
      readiness = await FSB.smartEnsureReady(element, 'click');
      if (!readiness.ready) {
        // If element is obscured (e.g., toolbar button behind canvas overlay),
        // try programmatic element.click() as fallback before giving up.
        // Canvas-heavy apps (TradingView, Figma, Miro) have DOM toolbar buttons
        // behind their canvas layers -- these ARE clickable via .click().
        const isObscured = readiness.failureReason && readiness.failureReason.includes('obscured');
        if (isObscured && element && typeof element.click === 'function') {
          try {
            element.click();
            await delay(300);
            return {
              success: true,
              clicked: params.selector,
              hadEffect: true,
              scrolled: false,
              method: 'programmatic_click_obscured_fallback',
              verification: { verified: false, reason: 'obscured_fallback_no_verification' },
              elementInfo: { tag: element.tagName, text: (element.innerText || '').substring(0, 50), wasScrolledIntoView: false },
              duration: Date.now() - startTime
            };
          } catch (fallbackErr) {
            // Fallback also failed, continue to original error
          }
        }
        // Record failure - element not ready
        actionRecorder.record(null, 'click', params, {
          selectorTried,
          selectorUsed: selectorUsed,
          elementFound: true,
          elementDetails: captureElementDetails(element),
          coordinatesUsed: null,
          coordinateSource: null,
          success: false,
          error: `Element not ready: ${readiness.failureReason}`,
          diagnostic: generateDiagnostic('notReady', { selector: selectorUsed, checks: readiness.checks }),
          duration: Date.now() - startTime
        });
        return buildFailureReport('click', params.selector, element, `Element not ready: ${readiness.failureReason}`);
      }
    }

    // Re-fetch element after scroll (may have become stale)
    if (readiness.scrolled) {
      element = FSB.querySelectorWithShadow(selectorUsed);
      if (!element) {
        return buildFailureReport('click', params.selector, null, 'Element became stale after scrolling');
      }
    }

    // Track if element was scrolled for response
    const wasScrolled = readiness.scrolled;

    if (element) {
      // Verify element is still interactive
      if (!document.contains(element)) {
        return buildFailureReport('click', params.selector, null, 'Element no longer in DOM');
      }

      // FIX: Handle target="_blank" links that would open in a new tab
      // Instead, navigate in the current tab for automation continuity
      const anchor = element.tagName === 'A' ? element : element.closest('a');
      if (anchor) {
        const opensNewTab = anchor.target === '_blank' ||
                            anchor.target === '_new' ||
                            anchor.rel?.includes('noopener');

        if (opensNewTab && anchor.href) {
          logger.logActionExecution(FSB.sessionId, 'click', 'redirect_navigation', { originalTarget: anchor.target, href: anchor.href });

          // Navigate directly using window.location for same-tab navigation
          const targetUrl = anchor.href;
          window.location.href = targetUrl;

          return {
            success: true,
            clicked: params.selector,
            hadEffect: true,
            navigationTriggered: true,
            method: 'direct-navigation',
            message: 'Navigated directly instead of opening in new tab',
            targetUrl: targetUrl,
            originalTarget: anchor.target
          };
        }
      }

      // VERIFY-04: Capture pre-state using SHARED verification utility
      const preState = captureActionState(element, 'click');

      // Perform the click using proper mouse events for better compatibility
      // Many modern sites (Amazon, etc.) need full event sequence
      const clickRect = element.getBoundingClientRect();
      const centerX = clickRect.left + clickRect.width / 2;
      const centerY = clickRect.top + clickRect.height / 2;

      const mouseEventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY,
        screenX: centerX + window.screenX,
        screenY: centerY + window.screenY,
        button: 0,
        buttons: 1
      };

      // Dispatch full mouse event sequence for proper JS handler triggering
      element.dispatchEvent(new MouseEvent('mousedown', mouseEventInit));
      element.dispatchEvent(new MouseEvent('mouseup', mouseEventInit));
      element.dispatchEvent(new MouseEvent('click', mouseEventInit));

      // Also call native click as fallback for some elements
      element.click();

      // VERIFY-04: Wait for page stability (REPLACE fixed 300ms with dynamic stability detection)
      await waitForPageStability({ maxWait: 1000, stableTime: 200 });

      // VERIFY-04: Capture post-state and verify using SHARED utilities
      const postState = captureActionState(element, 'click');
      const verification = verifyActionEffect(preState, postState, 'click');

      // Check for loading indicators (not captured by standard verification)
      const loadingDetected = !!document.querySelector('.loading, .spinner, [class*="load"], [aria-busy="true"]');

      // Determine if click had an effect
      // For anchor tags, require URL change or significant DOM change (not just focus)
      // For radio/checkbox elements, treat checkedChanged as a valid effect
      const isAnchorElement = element.tagName === 'A' || element.closest('a');
      const isCheckableElement = element.type === 'radio' || element.type === 'checkbox' ||
        element.getAttribute('role') === 'radio' || element.getAttribute('role') === 'checkbox' ||
        element.getAttribute('role') === 'switch';
      // Canvas-based editors (Google Docs, Sheets, Slides) handle clicks internally;
      // DOM verification is not possible so treat clicks as successful
      const isCanvasTarget = FSB.isCanvasBasedEditor() || element.tagName === 'CANVAS';
      // Angular Material comboboxes (mat-select, autocomplete triggers) report
      // hadEffect via aria-expanded change, class change (mat-select-open), or
      // overlay element count change -- not via standard verification.verified.
      const isAngularCombobox = element.tagName === 'MAT-SELECT' ||
        element.classList.contains('mat-mdc-select') ||
        element.classList.contains('mat-mdc-autocomplete-trigger') ||
        (element.getAttribute('role') === 'combobox' && element.tagName.startsWith('MAT-'));
      const hadEffect = isCanvasTarget
        ? true
        : isAngularCombobox
          ? (verification.changes?.ariaExpandedChanged || verification.changes?.classChanged ||
             verification.changes?.elementCountChanged || verification.changes?.contentChanged || loadingDetected)
          : isCheckableElement
            ? (verification.changes?.checkedChanged || verification.changes?.ariaExpandedChanged || verification.verified)
            : isAnchorElement
              ? (verification.changes?.urlChanged || verification.changes?.contentChanged ||
                 verification.changes?.elementCountChanged || verification.changes?.ariaExpandedChanged ||
                 verification.changes?.relatedVisibilityChanged || loadingDetected || false)
              : (verification.verified || loadingDetected);

      // CRITICAL FIX: Return success=false when click has no effect
      // This prevents AI from continuing after failed clicks
      if (!hadEffect) {
        // FALLBACK: For anchor tags with valid href, try direct navigation
        // Google and other sites may intercept click events, preventing programmatic navigation
        const failedAnchor = element.tagName === 'A' ? element : element.closest('a');
        if (failedAnchor && failedAnchor.href &&
            failedAnchor.href.startsWith('http') &&
            !failedAnchor.href.includes('javascript:')) {
          logger.logActionExecution(FSB.sessionId, 'click', 'href_fallback', {
            href: failedAnchor.href,
            originalSelector: params.selector
          });
          window.location.href = failedAnchor.href;
          return {
            success: true,
            clicked: params.selector,
            hadEffect: true,
            navigationTriggered: true,
            method: 'href-fallback',
            message: 'Click had no effect, navigated via href fallback',
            targetUrl: failedAnchor.href,
            elementInfo: {
              tag: element.tagName,
              text: element.textContent?.trim().substring(0, 50),
              wasScrolledIntoView: wasScrolled
            }
          };
        }

        // FALLBACK 2: For form submit buttons, try form.submit()
        const isSubmitButton = (element.tagName === 'INPUT' && element.type === 'submit') ||
          (element.tagName === 'BUTTON' && (element.type === 'submit' || !element.type));
        const parentForm = element.closest('form');
        if (isSubmitButton && parentForm) {
          logger.logActionExecution(FSB.sessionId, 'click', 'form_submit_fallback', {
            formAction: parentForm.action,
            originalSelector: params.selector
          });
          try {
            parentForm.submit();
            return {
              success: true,
              clicked: params.selector,
              hadEffect: true,
              navigationTriggered: true,
              method: 'form-submit-fallback',
              message: 'Click had no effect, submitted form directly',
              elementInfo: {
                tag: element.tagName,
                text: element.textContent?.trim().substring(0, 50) || element.value?.substring(0, 50),
                wasScrolledIntoView: wasScrolled
              }
            };
          } catch (formError) {
            logger.warn('Form submit fallback failed', { error: formError.message });
          }
        }

        // FALLBACK 3: CDP mouse click at element coordinates (browser-level input)
        // Bypasses React synthetic events, Shadow DOM, and event listener interception
        try {
          const cdpRect = element.getBoundingClientRect();
          const cdpX = cdpRect.left + cdpRect.width / 2;
          const cdpY = cdpRect.top + cdpRect.height / 2;

          logger.logActionExecution(FSB.sessionId, 'click', 'cdp_mouse_fallback', {
            x: Math.round(cdpX), y: Math.round(cdpY), selector: params.selector
          });

          const cdpResult = await chrome.runtime.sendMessage({
            action: 'cdpMouseClick',
            x: cdpX,
            y: cdpY
          });

          if (cdpResult?.success) {
            await waitForPageStability({ maxWait: 1500, stableTime: 200 });
            const postState2 = captureActionState(element, 'click');
            const verification2 = verifyActionEffect(preState, postState2, 'click');
            const cdpHadEffect = verification2.verified ||
              verification2.changes?.urlChanged ||
              verification2.changes?.contentChanged ||
              verification2.changes?.elementCountChanged;

            if (cdpHadEffect) {
              actionRecorder.record(null, 'click', params, {
                selectorTried, selectorUsed: selectorTried, elementFound: true,
                coordinatesUsed: { x: Math.round(cdpX), y: Math.round(cdpY) },
                coordinateSource: 'cdp_mouse', success: true, hadEffect: true,
                duration: Date.now() - startTime
              });
              return {
                success: true,
                clicked: params.selector,
                hadEffect: true,
                method: 'cdp-mouse-fallback',
                message: 'DOM click had no effect, CDP mouse click succeeded',
                elementInfo: {
                  tag: element.tagName,
                  text: element.textContent?.trim().substring(0, 50),
                  wasScrolledIntoView: wasScrolled
                }
              };
            }
          }
        } catch (cdpErr) {
          logger.debug('CDP mouse fallback unavailable', { error: cdpErr.message, sessionId: FSB.sessionId });
        }

        // Record action - click had no effect (all fallbacks exhausted)
        const clickNoEffectDiagnostic = diagnoseElementFailure(selectorTried, element);
        actionRecorder.record(null, 'click', params, {
          selectorTried,
          selectorUsed: selectorTried,
          elementFound: true,
          elementDetails: captureElementDetails(element),
          coordinatesUsed: { x: Math.round(centerX), y: Math.round(centerY) },
          coordinateSource: 'selector',
          success: false,
          error: 'Click executed but had no detectable effect on the page',
          hadEffect: false,
          effectDetails: verification.changes,
          verification: {
            verified: verification.verified,
            changes: verification.changes,
            reason: verification.reason
          },
          diagnostic: clickNoEffectDiagnostic,
          duration: Date.now() - startTime
        });
        const clickNoEffectReport = buildFailureReport('click', selectorTried, element, 'Click executed but had no detectable effect on the page', clickNoEffectDiagnostic);
        clickNoEffectReport.clicked = params.selector;
        clickNoEffectReport.hadEffect = false;
        clickNoEffectReport.verification = {
          preState,
          postState,
          verified: verification.verified,
          changes: verification.changes,
          reason: verification.reason,
          localChanges: verification.localChanges,
          confidence: verification.confidence,
          whatChanged: verification.whatChanged
        };
        return clickNoEffectReport;
      }

      // Record successful action
      actionRecorder.record(null, 'click', params, {
        selectorTried,
        selectorUsed: selectorTried,
        elementFound: true,
        elementDetails: captureElementDetails(element),
        coordinatesUsed: { x: Math.round(centerX), y: Math.round(centerY) },
        coordinateSource: 'selector',
        success: true,
        hadEffect: true,
        effectDetails: verification.changes,
        verification: {
          verified: verification.verified,
          changes: verification.changes,
          reason: verification.reason
        },
        duration: Date.now() - startTime
      });
      return {
        success: true,
        clicked: params.selector,
        hadEffect: true,
        scrolled: wasScrolled,
        verification: {
          localChanges: verification.localChanges,
          confidence: verification.confidence,
          whatChanged: verification.whatChanged,
          preState,
          postState,
          verified: verification.verified,
          changes: verification.changes,
          reason: verification.reason
        },
        elementInfo: {
          tag: element.tagName,
          text: element.textContent?.trim().substring(0, 50),
          wasScrolledIntoView: wasScrolled
        }
      };
    }
  },

  // Click on search result links (Google, Bing, DuckDuckGo, etc.)
  clickSearchResult: async (params) => {
    logger.logActionExecution(FSB.sessionId, 'clickSearchResult', 'start', params);

    // Detect "no results" pages before attempting to click
    const noResultsDetected = FSB.detectSearchNoResults();
    if (noResultsDetected) {
      logger.logActionExecution(FSB.sessionId, 'clickSearchResult', 'no_results_page', { message: noResultsDetected });
      return {
        success: false,
        error: `Search returned no results: ${noResultsDetected}`,
        noResults: true,
        suggestion: 'Try a different search query with fewer or different keywords'
      };
    }

    // Common selectors for search result links across different search engines
    // NOTE: Modern Google uses "a > h3" structure (link contains heading), not "h3 > a"
    const searchResultSelectors = [
      // Google search results - MODERN STRUCTURE (link contains heading)
      'a[href] h3',                     // Link contains H3 heading (current Google structure)
      'a[href] h2',                     // Link contains H2 heading
      '.yuRUbf a',                      // Current Google result container
      '.g a[href]:not([href*="google"])', // Result links (not Google's own links)
      '#search a[jsname]',              // Google's JS-rendered results (only within search container)

      // Google search results - LEGACY STRUCTURE (heading contains link)
      'h3 a',                           // Older Google: H3 contains link
      '.rc .r a',                       // Older Google format

      // Bing search results
      '.b_algo h2 a',                   // Bing main results
      '.b_title a',                     // Bing title links

      // DuckDuckGo results
      '.result__a',                     // DuckDuckGo results
      '.result__title a',               // DuckDuckGo title links

      // Generic patterns - handles various search engines
      '[role="listitem"] a[href]',     // Accessible list-based results
      '[data-testid*="result"] a',     // Test ID patterns
      '.search-result a',               // Generic search result class
      '.result a',                      // Generic result class
      'article a[href]',                // Article-based results

      // If specific text is provided, try to match it
      params.text ? `a:contains("${params.text}")` : null,
      params.domain ? `a[href*="${params.domain}"]` : null
    ].filter(Boolean);

    // Try primary selector if provided
    if (params.selector) {
      const element = FSB.querySelectorWithShadow(params.selector);
      if (element && element.tagName === 'A') {
        element.click();
        return {
          success: true,
          clicked: params.selector,
          href: element.href,
          text: element.textContent?.trim().substring(0, 100)
        };
      }
    }

    // Try to find the nth result if index is specified
    if (params.index !== undefined) {
      // Include both modern (a > h3) and legacy (h3 > a) patterns for maximum compatibility
      const allResults = document.querySelectorAll('a[href] h3, h3 a, .yuRUbf a, .b_algo h2 a, .result__a');
      if (allResults[params.index]) {
        const result = allResults[params.index];
        result.click();
        return {
          success: true,
          clicked: `Result #${params.index + 1}`,
          href: result.href,
          text: result.textContent?.trim().substring(0, 100)
        };
      }
    }

    // CRITICAL FIX: Improved search result click logic
    // Try each selector to find a clickable result
    for (const selector of searchResultSelectors) {
      try {
        const elements = document.querySelectorAll(selector);

        // FIXED: Better filtering logic - don't filter out legitimate nested Google links
        const visibleLinks = Array.from(elements).filter(el => {
          if (el.tagName !== 'A') return false;
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          const hasHref = el.href && !el.href.includes('javascript:');

          // FIXED: Only filter out actual Google search page links, not legitimate result links
          // Allow links that are search results even if they contain google.com
          const isSearchPageLink = el.href.includes('google.com/search?') ||
                                   el.href.includes('google.com/url?');
          const notSearchLink = !isSearchPageLink;

          return isVisible && hasHref && notSearchLink;
        });

        if (visibleLinks.length > 0) {
          // Click the first visible result or one matching the domain/text
          let targetLink = visibleLinks[0];

          // IMPROVED: Better domain matching with priority
          if (params.domain) {
            const domainMatch = visibleLinks.find(link => {
              const linkDomain = new URL(link.href).hostname.toLowerCase();
              const searchDomain = params.domain.toLowerCase();
              return linkDomain.includes(searchDomain) || searchDomain.includes(linkDomain);
            });
            if (domainMatch) {
              targetLink = domainMatch;
              logger.logActionExecution(FSB.sessionId, 'clickSearchResult', 'domain_match', { domain: params.domain, href: targetLink.href });
            }
          }

          // IMPROVED: Better text matching - check both link text and parent heading
          if (params.text) {
            const textMatch = visibleLinks.find(link => {
              const linkText = link.textContent?.toLowerCase() || '';
              const parentText = link.closest('h3, h2, h1')?.textContent?.toLowerCase() || '';
              const searchText = params.text.toLowerCase();
              return linkText.includes(searchText) || parentText.includes(searchText);
            });
            if (textMatch) {
              targetLink = textMatch;
              logger.logActionExecution(FSB.sessionId, 'clickSearchResult', 'text_match', { text: params.text, href: targetLink.href });
            }
          }

          // FIXED: Use actual click instead of navigation
          targetLink.click();
          logger.logActionExecution(FSB.sessionId, 'clickSearchResult', 'clicked', { href: targetLink.href });

          return {
            success: true,
            clicked: selector,
            href: targetLink.href,
            text: targetLink.textContent?.trim().substring(0, 100),
            totalResults: visibleLinks.length,
            matchMethod: params.domain ? 'domain' : params.text ? 'text' : 'first'
          };
        }
      } catch (e) {
        logger.debug('Selector failed for search result', { sessionId: FSB.sessionId, selector, error: e.message });
      }
    }

    // REMOVED: Navigation fallback - force proper clicking instead
    // If we get here, no results were found - return proper error

    return {
      success: false,
      error: 'No search results found to click',
      suggestion: 'Make sure search results are loaded or try a different search query'
    };
  },
  // Type text into an input
  type: async (params) => {
    const startTime = Date.now();
    logger.logActionExecution(FSB.sessionId, 'type', 'start', params);

    // Build selectors array for alternative selector support
    const selectors = params.selectors || [params.selector];
    let lastAttemptError = null;
    let lastVerification = null;
    let selectorUsed = null;
    let lastElement = null;

    // Try each selector until one succeeds with verified effect
    for (let selectorIndex = 0; selectorIndex < selectors.length; selectorIndex++) {
      const currentSelector = selectors[selectorIndex];
      logger.debug('Trying selector for type', { sessionId: FSB.sessionId, selectorIndex, selector: currentSelector });

    try {
      // Find element using shadow DOM aware query
      let element = FSB.querySelectorWithShadow(currentSelector);
      if (!element) {
        lastAttemptError = `Element not found with selector: ${currentSelector}`;
        continue; // Try next selector
      }

      // SPEED-05: Use smart readiness check with fast-path for ready elements
      const readiness = await FSB.smartEnsureReady(element, 'type');
      if (!readiness.ready) {
        lastAttemptError = `Element not ready for typing: ${readiness.failureReason}`;
        continue; // Try next selector
      }

      // Re-fetch element after potential scroll (may have become stale)
      if (readiness.scrolled) {
        element = FSB.querySelectorWithShadow(currentSelector);
        if (!element) {
          lastAttemptError = 'Element became stale after scrolling';
          continue; // Try next selector
        }
      }

      logger.logActionExecution(FSB.sessionId, 'type', 'element_ready', { tagName: element.tagName, scrolled: readiness.scrolled });

      // Capture pre-state for verification
      const preState = captureActionState(element, 'type');

    if (element) {
      // Check if it's a valid input element with enhanced contenteditable detection
      const isInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';

      // Enhanced universal text input detection for all platforms
      const isContentEditable = element.contentEditable === 'true' ||
                                element.getAttribute('contenteditable') === 'true' ||
                                element.hasAttribute('contenteditable') ||
                                element.getAttribute('role') === 'textbox' ||
                                // Universal messaging patterns
                                FSB.isUniversalMessageInput(element);

      const codeEditorInfo = FSB.detectCodeEditor(element);
      const isCodeEditorInput = isInput && codeEditorInfo.isCodeEditor;

      // Canvas-based editor bypass: skip element gate and use CDP directly.
      const canvasEditor = FSB.isCanvasBasedEditor();

      // Google Sheets Name Box guard: if AI targets the Name Box with non-cell-reference text,
      // redirect to keyboard emulator to type into the active cell instead.
      if (canvasEditor && isInput) {
        const isGoogleSheets = window.location.hostname === 'docs.google.com' &&
                               window.location.pathname.startsWith('/spreadsheets/');
        const isNameBox = element.dataset?.fsbRole === 'name-box' ||
                          element.id === 't-name-box' ||
                          element.getAttribute('name') === 't-name-box';
        const textVal = (params.text || '').trim();
        const isCellReference = /^[A-Z]{1,3}[0-9]{1,7}(:[A-Z]{1,3}[0-9]{1,7})?$/i.test(textVal);

        if (isGoogleSheets && isNameBox && textVal && !isCellReference) {
          logger.debug('Name Box guard: redirecting non-cell-reference data to active cell', {
            text: textVal.substring(0, 30),
            sessionId: FSB.sessionId
          });
          // Press Escape first to blur the Name Box and return focus to the grid
          try { await tools.keyPress({ key: 'Escape', useDebuggerAPI: true }); } catch(e) {}
          await waitForStability('type_keystroke');
          try {
            const twkResult = await tools.typeWithKeys({ text: params.text, clearFirst: false, delay: 20 });
            if (twkResult.success) {
              if (params.pressEnter) {
                await waitForStability('type_keystroke');
                await tools.keyPress({ key: 'Enter', useDebuggerAPI: true });
              }
              return {
                success: true,
                typed: params.text,
                method: 'google_sheets_keyboard',
                pressedEnter: !!params.pressEnter,
                hadEffect: true,
                note: 'Google Sheets Name Box guard -- data redirected to active cell via keyboard emulator'
              };
            }
          } catch (e) {
            logger.debug('Name Box guard typeWithKeys failed, falling through', { error: e.message });
          }
        }
      }

      if (canvasEditor && !isInput) {
        // Google Sheets: use keyboard emulator (typeWithKeys) instead of CDP Input.insertText.
        // Google Sheets requires keyDown events to enter cell edit mode -- Input.insertText
        // bypasses the keyboard event pipeline entirely, so text has nowhere to go.
        const isGoogleSheets = window.location.hostname === 'docs.google.com' &&
                               window.location.pathname.startsWith('/spreadsheets/');
        if (isGoogleSheets) {
          logger.logActionExecution(FSB.sessionId, 'type', 'google_sheets_keyboard_entry', { hostname: window.location.hostname, textLength: params.text?.length });
          try {
            // clearFirst: false -- in Sheets, typing into a selected cell naturally replaces content.
            // Ctrl+A before typing would select all cells (catastrophic), not just cell content.
            const twkResult = await tools.typeWithKeys({ text: params.text, clearFirst: false, delay: 20 });
            if (twkResult.success) {
              if (params.pressEnter) {
                await waitForStability('type_keystroke');
                await tools.keyPress({ key: 'Enter', useDebuggerAPI: true });
              }
              return {
                success: true,
                typed: params.text,
                method: 'google_sheets_keyboard',
                pressedEnter: !!params.pressEnter,
                hadEffect: true,
                note: 'Google Sheets -- keyboard emulator used for proper keyDown event processing'
              };
            }
          } catch (twkError) {
            logger.debug('Google Sheets typeWithKeys failed, falling through to CDP', { error: twkError.message });
          }
          // Fall through to standard CDP path as last resort
        }

        logger.logActionExecution(FSB.sessionId, 'type', 'canvas_editor_cdp_direct', { hostname: window.location.hostname });

        // --- FORMATTED PASTE PATH ---
        const isGoogleDocs = window.location.hostname === 'docs.google.com' &&
                             window.location.pathname.startsWith('/document/');
        const textHasFormatting = FSB.hasMarkdownFormatting(params.text);

        if (isGoogleDocs && textHasFormatting) {
          logger.logActionExecution(FSB.sessionId, 'type', 'gdocs_formatted_paste_attempt', {
            textLength: params.text.length,
            hasFormatting: true
          });
          try {
            const cursorTarget = document.querySelector('.kix-page-content-wrapper') ||
                                 document.querySelector('.kix-paginateddocumentplugin') ||
                                 document.querySelector('.kix-page') ||
                                 document.querySelector('.kix-appview-editor');
            if (cursorTarget) {
              cursorTarget.focus();
              cursorTarget.click();
              logger.debug('gdocs_formatted_paste: focused cursor target', { tagName: cursorTarget.tagName, className: cursorTarget.className?.substring?.(0, 60) });
              await waitForStability('click');
            }

            // If clearFirst, select all and delete before pasting
            if (params.clearFirst) {
              const isMac = navigator.userAgent?.includes('Macintosh') || navigator.platform?.includes('Mac');
              await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                  action: 'keyboardDebuggerAction',
                  method: 'pressKey',
                  key: 'a',
                  modifiers: { ctrl: !isMac, meta: isMac, shift: false, alt: false }
                }, (response) => {
                  if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                  else resolve(response);
                });
              });
              await waitForStability('type_complete');
              await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                  action: 'keyboardDebuggerAction',
                  method: 'pressKey',
                  key: 'Backspace',
                  modifiers: { ctrl: false, meta: false, shift: false, alt: false }
                }, (response) => {
                  if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                  else resolve(response);
                });
              });
              await waitForStability('type_complete');
            }

            const html = FSB.markdownToHTML(params.text);
            const plainText = FSB.stripMarkdown(params.text);
            const pasteResult = await FSB.clipboardPasteHTML(html, plainText);

            if (pasteResult.success) {
              logger.logActionExecution(FSB.sessionId, 'type', 'gdocs_formatted_paste_verified', {
                textLenBefore: pasteResult.textLenBefore,
                textLenAfter: pasteResult.textLenAfter
              });
              if (params.pressEnter) {
                await waitForStability('type_keystroke');
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
              }
              return {
                success: true,
                typed: params.text,
                method: 'gdocs_formatted_clipboard_paste',
                pressedEnter: !!params.pressEnter,
                hadEffect: true,
                note: 'Google Docs -- markdown converted to HTML, pasted via clipboard for rich formatting'
              };
            }
            // If clipboard paste failed (verified -- no text appeared), fall through to plain CDP insertText
            logger.warn('Formatted paste failed (verified), falling back to plain CDP insertText', {
              error: pasteResult.error,
              textLenBefore: pasteResult.textLenBefore,
              textLenAfter: pasteResult.textLenAfter
            });
          } catch (fmtError) {
            logger.debug('Formatted paste error, falling back to plain CDP insertText', { error: fmtError.message });
          }
        }
        // --- END FORMATTED PASTE PATH ---

        const cdpText = (isGoogleDocs && textHasFormatting) ? FSB.stripMarkdown(params.text) : params.text;

        try {
          const cdpResult = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              action: 'cdpInsertText',
              text: cdpText,
              clearFirst: !!params.clearFirst
            }, (response) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else if (response && response.success) resolve(response);
              else reject(new Error(response?.error || 'CDP insertion failed'));
            });
          });
          // Trust CDP on canvas editors -- no DOM validation possible
          if (params.pressEnter) {
            await waitForStability('type_keystroke');
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
          }
          return {
            success: true,
            typed: params.text,
            method: 'canvas_editor_cdp',
            pressedEnter: !!params.pressEnter,
            hadEffect: true,
            note: 'Canvas-based editor -- CDP insertion used, DOM validation skipped'
          };
        } catch (cdpError) {
          logger.debug('Canvas editor CDP failed, trying typeWithKeys', { error: cdpError.message });
          try {
            const twkResult = await tools.typeWithKeys({ text: params.text, clearFirst: false });
            if (twkResult.success) return { ...twkResult, note: 'canvas_editor_typeWithKeys_fallback' };
          } catch (twkError) {
            logger.debug('Canvas editor typeWithKeys also failed', { error: twkError.message });
          }
          return { success: false, error: 'Canvas-based editor: CDP and typeWithKeys both failed', typed: params.text };
        }
      }

      if (!isInput && !isContentEditable) {
        lastAttemptError = 'Element is not an input field';
        continue; // Try next selector
      }

      // Universal activation strategy - click ALL input elements by default
      const shouldSkipClick = params.clickFirst === false; // Explicit opt-out only

      // Universal click-first activation (unless explicitly disabled)
      if (!shouldSkipClick) {
        element.click();
        await waitForStability('light');

        if (document.activeElement !== element && element.id) {
          const label = document.querySelector(`label[for="${element.id}"]`);
          if (label) {
            label.click();
            await waitForStability('type_keystroke');
          }
        }

        if (document.activeElement !== element && element.parentElement) {
          element.parentElement.click();
          await waitForStability('type_keystroke');
        }
      }

      // Always focus after clicking
      element.focus();
      await waitForStability('type_keystroke');

      // Final verification - ensure element is truly focused and ready
      let focusAttempts = 0;
      while (document.activeElement !== element && focusAttempts < 3) {
        element.click();
        element.focus();
        await waitForStability('light');
        focusAttempts++;
      }

      // Universal text insertion handling for both input elements and contenteditable
      let previousValue = '';
      let insertionSuccess = false;

      // CODE EDITOR CDP FAST-PATH
      if (codeEditorInfo.isCodeEditor) {
        // STEP 1: Try MAIN world executeEdits (Monaco/CM6)
        if (codeEditorInfo.type === 'monaco' || codeEditorInfo.type === 'codemirror6') {
          try {
            logger.debug('Trying editor API via MAIN world injection', {
              sessionId: FSB.sessionId,
              editorType: codeEditorInfo.type,
              textLength: params.text.length
            });

            const editorResult = await new Promise((resolve, reject) => {
              chrome.runtime.sendMessage({
                action: 'monacoEditorInsert',
                text: params.text
              }, (response) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else if (response?.success) resolve(response);
                else reject(new Error(response?.error || 'Editor API failed'));
              });
            });

            await waitForStability('type_complete');

            logger.debug('Editor API via MAIN world succeeded', {
              sessionId: FSB.sessionId,
              editorType: codeEditorInfo.type,
              method: editorResult.method
            });

            return {
              success: true,
              typed: params.text,
              method: editorResult.method,
              pressedEnter: !!params.pressEnter,
              clickedFirst: !shouldSkipClick,
              hadEffect: true,
              editorType: codeEditorInfo.type,
              elementInfo: {
                tag: element.tagName,
                type: 'code_editor',
                name: element.name || element.id || element.className
              }
            };
          } catch (editorApiError) {
            logger.debug('Editor API failed, falling through to CDP', {
              sessionId: FSB.sessionId,
              error: editorApiError.message
            });
          }
        }

        // STEP 2: CDP fast-path
        try {
          logger.debug('Code editor detected, using CDP fast-path', {
            sessionId: FSB.sessionId,
            editorType: codeEditorInfo.type,
            elementTag: element.tagName,
            textLength: params.text.length
          });

          const cdpResult = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              action: 'cdpInsertText',
              text: params.text,
              clearFirst: true
            }, (response) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else if (response?.success) resolve(response);
              else reject(new Error(response?.error || 'CDP failed'));
            });
          });

          await waitForStability('type_complete');

          logger.debug('CDP code editor fast-path succeeded', {
            sessionId: FSB.sessionId,
            editorType: codeEditorInfo.type
          });

          return {
            success: true,
            typed: params.text,
            method: 'cdp_code_editor',
            pressedEnter: !!params.pressEnter,
            clickedFirst: !shouldSkipClick,
            hadEffect: true,
            editorType: codeEditorInfo.type,
            elementInfo: {
              tag: element.tagName,
              type: 'code_editor',
              name: element.name || element.id || element.className
            }
          };
        } catch (cdpCodeEditorError) {
          logger.debug('CDP code editor fast-path failed, falling through to standard methods', {
            sessionId: FSB.sessionId,
            error: cdpCodeEditorError.message
          });
        }
      }

      if (isCodeEditorInput) {
        previousValue = element.value || '';
        element.focus();
        await waitForStability('light');

        let codeInserted = false;

        if (!codeInserted && document.execCommand) {
          try {
            element.select();
            if (document.execCommand('insertText', false, params.text)) {
              codeInserted = true;
            }
          } catch (e) {
            logger.debug('Code editor execCommand failed', { error: e.message });
          }
        }

        if (!codeInserted) {
          try {
            element.select();
            element.dispatchEvent(new InputEvent('beforeinput', {
              inputType: 'insertText',
              data: params.text,
              bubbles: true,
              cancelable: true,
              composed: true
            }));
            element.dispatchEvent(new InputEvent('input', {
              inputType: 'insertText',
              data: params.text,
              bubbles: true
            }));
            codeInserted = true;
          } catch (e) {
            logger.debug('Code editor InputEvent failed', { error: e.message });
          }
        }

        if (!codeInserted) {
          try {
            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text/plain', params.text);
            element.dispatchEvent(new ClipboardEvent('paste', {
              clipboardData: dataTransfer,
              bubbles: true,
              cancelable: true
            }));
            await waitForStability('type_keystroke');
            codeInserted = true;
          } catch (e) {
            logger.debug('Code editor clipboard paste failed', { error: e.message });
          }
        }

        if (!codeInserted) {
          element.value = params.text;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }

        logger.debug('Code editor typing complete', {
          sessionId: FSB.sessionId,
          editorType: codeEditorInfo.type,
          method: codeInserted ? 'specialized' : 'fallback',
          textLength: params.text.length
        });

      } else if (isInput) {
        previousValue = element.value;
        element.value = '';
        element.value = params.text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      } else if (isContentEditable) {
        previousValue = element.textContent || element.innerText || '';
        insertionSuccess = false;

        if (!insertionSuccess && document.execCommand) {
          try {
            element.focus();
            document.execCommand('selectAll', false, null);
            if (document.execCommand('insertText', false, params.text)) {
              insertionSuccess = true;
            }
          } catch (e) {
            logger.debug('execCommand insertText failed', { sessionId: FSB.sessionId, error: e.message });
          }
        }

        if (!insertionSuccess) {
          try {
            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text/plain', params.text);
            const pasteEvent = new ClipboardEvent('paste', {
              clipboardData: dataTransfer,
              bubbles: true,
              cancelable: true
            });
            element.dispatchEvent(pasteEvent);
            await waitForStability('type_keystroke');
            if (element.textContent.includes(params.text)) {
              insertionSuccess = true;
            }
          } catch (e) {
            logger.debug('Clipboard paste simulation failed', { sessionId: FSB.sessionId, error: e.message });
          }
        }

        if (!insertionSuccess) {
          try {
            element.innerHTML = '';
            element.textContent = '';
            const textNode = document.createTextNode(params.text);
            element.appendChild(textNode);
            const range = document.createRange();
            const selection = window.getSelection();
            range.setStartAfter(textNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            insertionSuccess = true;
          } catch (e) {
            logger.debug('Range/Selection API insertion failed', { sessionId: FSB.sessionId, error: e.message });
          }
        }

        if (!insertionSuccess) {
          if (element.innerHTML.includes('<p><br></p>') || element.innerHTML.includes('<br>')) {
            element.innerHTML = '';
          } else {
            element.textContent = '';
          }
          try {
            element.textContent = params.text;
            insertionSuccess = true;
          } catch (e) {
            logger.debug('Direct manipulation failed', { sessionId: FSB.sessionId, error: e.message });
          }
        }

        const events = [
          new Event('input', { bubbles: true }),
          new Event('change', { bubbles: true }),
          new KeyboardEvent('keydown', { bubbles: true }),
          new KeyboardEvent('keyup', { bubbles: true }),
          new Event('blur', { bubbles: true }),
          new Event('focus', { bubbles: true })
        ];

        events.forEach(event => {
          try {
            element.dispatchEvent(event);
          } catch (e) {
            logger.debug('Event dispatch failed', { sessionId: FSB.sessionId, eventType: event.type, error: e.message });
          }
        });

        await waitForStability('type_keystroke');
      }

      // Gmail/email recipient field: dispatch Tab to confirm the recipient "chip"
      const recipientKeywords = ['to recipients', 'cc recipients', 'bcc recipients', 'to', 'cc', 'bcc', 'recipients'];
      const elAriaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
      const elName = (element.getAttribute('name') || '').toLowerCase();
      const isRecipientField = recipientKeywords.some(kw => elAriaLabel.includes(kw)) ||
                               ['to', 'cc', 'bcc'].includes(elName);
      const looksLikeEmail = params.text && params.text.includes('@');

      if (isRecipientField && looksLikeEmail) {
        logger.debug('Recipient field detected, sending Tab to confirm chip', {
          sessionId: FSB.sessionId, ariaLabel: elAriaLabel, text: params.text
        });
        await waitForStability('type_complete');
        element.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true, cancelable: true
        }));
        element.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true, cancelable: true
        }));
        await waitForStability('type_complete');
      }

      // Optional: Press Enter after typing
      if (params.pressEnter) {
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        });
        element.dispatchEvent(enterEvent);
        const enterUpEvent = new KeyboardEvent('keyup', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        });
        element.dispatchEvent(enterUpEvent);
      }

      // Post-typing validation
      const finalValue = isInput ? (element.value || '') : (element.textContent || element.value || '');
      const typingSuccessful = finalValue.includes(params.text) || finalValue === params.text;

      // Amazon-specific validation
      const isAmazonSearch = element.id === 'twotabsearchtextbox' ||
                           element.name === 'searchtext' ||
                           window.location.hostname.includes('amazon');

      if (isAmazonSearch && !typingSuccessful) {
        logger.logActionExecution(FSB.sessionId, 'type', 'amazon_retry', { reason: 'initial_typing_failed' });
        try {
          element.focus();
          await waitForStability('light');
          element.value = '';
          element.value = params.text;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: params.text.slice(-1) }));
          element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: params.text.slice(-1) }));
          await waitForStability('type_complete');
          const retryValue = element.value || '';
          if (retryValue.includes(params.text) || retryValue === params.text) {
            logger.logActionExecution(FSB.sessionId, 'type', 'amazon_retry_success', {});
          }
        } catch (amazonError) {
          logger.warn('Amazon-specific retry failed', { sessionId: FSB.sessionId, error: amazonError.message });
        }
      }

      // CRITICAL FIX: Strengthen validation
      const finalCheck = isInput ? (element.value || '') : (element.textContent || element.value || '');
      const trimmedFinal = finalCheck.trim();
      const trimmedExpected = params.text.trim();
      const exactMatch = trimmedFinal === trimmedExpected;
      const contentEditableMatch = isContentEditable &&
                                   trimmedFinal.replace(/\s+/g, ' ') === trimmedExpected.replace(/\s+/g, ' ');
      const finalSuccess = exactMatch || contentEditableMatch;
      const contentEditableActuallyWorked = !isContentEditable || (insertionSuccess && finalSuccess);

      // Gmail recipient chip check
      if (isRecipientField && looksLikeEmail && !finalSuccess) {
        const chipEl = element.closest('[role="list"], .fX, .afV')?.querySelector(
          '.vR, [data-hovercard-id], [data-name], .afX'
        );
        const fieldCleared = trimmedFinal === '' || !trimmedFinal.includes(params.text);
        if (chipEl || fieldCleared) {
          logger.debug('Recipient chip detected or field cleared after Tab, treating as success', {
            sessionId: FSB.sessionId, chipFound: !!chipEl, fieldCleared
          });
          return {
            success: true,
            typed: params.text,
            method: 'recipient_chip',
            pressedEnter: !!params.pressEnter,
            clickedFirst: !shouldSkipClick,
            hadEffect: true,
            note: chipEl ? 'recipient_chip_confirmed' : 'field_cleared_after_tab',
            elementInfo: {
              tag: element.tagName,
              type: isInput ? element.type : 'contenteditable',
              name: element.name || element.id || FSB.getClassName(element)
            }
          };
        }
      }

      // Return failure if typing didn't work
      if (!finalSuccess || (isContentEditable && !isCodeEditorInput && !insertionSuccess)) {
        const recheck = isInput ? (element.value || '') : (element.textContent || element.innerText || '');
        if (recheck.includes(params.text)) {
          return {
            success: true,
            typed: params.text,
            method: 'standard',
            pressedEnter: !!params.pressEnter,
            clickedFirst: !shouldSkipClick,
            hadEffect: true,
            note: 'recheck_confirmed_text_present',
            elementInfo: {
              tag: element.tagName,
              type: isInput ? element.type : 'contenteditable',
              name: element.name || element.id || element.className
            }
          };
        }

        // ENHANCED: Try CDP-based text insertion as last resort
        logger.logActionExecution(FSB.sessionId, 'type', 'cdp_fallback_attempt', { reason: 'standard_methods_failed' });

        try {
          const cdpResult = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              action: 'cdpInsertText',
              text: params.text,
              clearFirst: true
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else if (response && response.success) {
                resolve(response);
              } else {
                reject(new Error(response?.error || 'CDP insertion failed'));
              }
            });
          });

          await waitForStability('type_complete');
          const cdpCanvasEditor = FSB.isCanvasBasedEditor();
          const cdpFinalCheck = cdpCanvasEditor ? '' : (isInput ? (element.value || '') : (element.textContent || element.value || ''));
          const cdpSuccess = cdpCanvasEditor || cdpFinalCheck.includes(params.text) || cdpFinalCheck.trim() === params.text.trim();

          if (cdpSuccess) {
            logger.logActionExecution(FSB.sessionId, 'type', cdpCanvasEditor ? 'cdp_fallback_canvas_success' : 'cdp_fallback_success', {});
            return {
              success: true,
              typed: params.text,
              method: cdpCanvasEditor ? 'cdp_fallback_canvas' : 'cdp_fallback',
              pressedEnter: !!params.pressEnter,
              clickedFirst: !shouldSkipClick,
              hadEffect: true,
              note: cdpCanvasEditor ? 'Canvas-based editor -- DOM validation skipped, CDP trusted' : undefined,
              elementInfo: {
                tag: element.tagName,
                type: isInput ? element.type : 'contenteditable',
                name: element.name || element.id || element.className
              }
            };
          }
        } catch (cdpError) {
          logger.debug('CDP fallback failed', { sessionId: FSB.sessionId, error: cdpError.message });
        }

        return {
          success: false,
          error: isContentEditable
            ? 'ContentEditable insertion failed - text not entered correctly (CDP fallback also failed)'
            : 'Text validation failed - expected text not found in element',
          typed: params.text,
          actualValue: finalCheck,
          expectedValue: params.text,
          pressedEnter: !!params.pressEnter,
          clickedFirst: !shouldSkipClick,
          focused: document.activeElement === element,
          insertionSuccess: isContentEditable ? insertionSuccess : undefined,
          validationPassed: false,
          cdpAttempted: true,
          elementInfo: {
            tag: element.tagName,
            type: isInput ? element.type : 'contenteditable',
            previousValue: previousValue.substring(0, 20),
            name: element.name || element.id || FSB.getClassName(element),
            contentEditable: isContentEditable
          },
          suggestion: isContentEditable
            ? 'Try alternative selector or wait for page to be ready'
            : 'Element may not accept input correctly'
        };
      }

      // Wait for page stability before capturing post-state
      await waitForPageStability({ maxWait: 1000, stableTime: 200 });

      // Capture post-state for verification
      const postState = captureActionState(element, 'type');
      const verification = verifyActionEffect(preState, postState, 'type');
      lastVerification = verification;

      if (!verification.verified) {
        logger.debug('Type verification failed, trying next selector', {
          sessionId: FSB.sessionId,
          selector: currentSelector,
          reason: verification.reason
        });
        lastAttemptError = `Type action had no verified effect: ${verification.reason}`;
        continue; // Try next selector
      }

      // Record successful action
      selectorUsed = currentSelector;
      actionRecorder.record(null, 'type', params, {
        selectorTried: params.selector,
        selectorUsed: currentSelector,
        elementFound: true,
        elementDetails: captureElementDetails(element),
        coordinatesUsed: null,
        coordinateSource: null,
        success: true,
        hadEffect: true,
        effectDetails: verification.changes,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        typed: params.text,
        selector: currentSelector,
        selectorIndex: selectorIndex,
        usedFallback: selectorIndex > 0,
        hadEffect: true,
        verification: {
          verified: verification.verified,
          reason: verification.reason,
          changes: verification.changes
        },
        actualValue: finalCheck,
        pressedEnter: !!params.pressEnter,
        clickedFirst: !shouldSkipClick,
        focused: document.activeElement === element,
        focusAttempts: focusAttempts,
        scrolled: readiness.scrolled || false,
        insertionSuccess: isContentEditable ? insertionSuccess : true,
        amazonSpecific: isAmazonSearch,
        validationPassed: true,
        finalTextContent: finalCheck,
        elementInfo: {
          tag: element.tagName,
          type: isInput ? element.type : 'contenteditable',
          previousValue: previousValue.substring(0, 20),
          name: element.name || element.id || FSB.getClassName(element),
          contentEditable: isContentEditable,
          ariaLabel: element.getAttribute('aria-label'),
          dataTestId: element.getAttribute('data-testid'),
          className: FSB.getClassName(element)
        }
      };
    }

    // Try fallback selectors for messaging interfaces
    const fallbackSelectors = FSB.generateMessagingSelectors(currentSelector);
    logger.debug('Trying fallback selectors for type', { sessionId: FSB.sessionId, count: fallbackSelectors.length });

    for (const fallbackSelector of fallbackSelectors) {
      const fallbackElement = document.querySelector(fallbackSelector);
      if (fallbackElement) {
        logger.logActionExecution(FSB.sessionId, 'type', 'fallback_found', { selector: fallbackSelector });
        return await tools.type({...params, selector: fallbackSelector});
      }
    }

    // Enhanced error reporting for debugging
    const availableInputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'))
      .map(el => ({
        tag: el.tagName,
        id: el.id,
        name: el.name,
        class: FSB.getClassName(el),
        type: el.type || 'contenteditable',
        visible: el.offsetWidth > 0 && el.offsetHeight > 0
      }))
      .slice(0, 5);

    logger.error('Failed to find typeable element', { sessionId: FSB.sessionId, selector: currentSelector, availableInputs });
    lastAttemptError = 'Input element not found with any selector';

    } catch (error) {
      logger.error('Unexpected error in type function', {
        sessionId: FSB.sessionId,
        error: error.message,
        stack: error.stack,
        params,
        currentSelector: currentSelector
      });

      if (lastVerification && lastVerification.verified) {
        logger.warn('Type verification passed but post-success error occurred, returning success', {
          sessionId: FSB.sessionId,
          error: error.message,
          verification: lastVerification.reason
        });
        return {
          success: true,
          typed: params.text,
          selector: currentSelector,
          hadEffect: true,
          verification: {
            verified: true,
            reason: lastVerification.reason,
            changes: lastVerification.changes
          },
          pressedEnter: !!params.pressEnter,
          validationPassed: true,
          recoveredFromError: error.message
        };
      }

      lastAttemptError = error.message || 'Unknown error occurred in type function';
    }
    } // End selector loop

    // Canvas editor fallback: when all selectors fail but we're on a canvas editor
    if (FSB.isCanvasBasedEditor()) {
      // Google Sheets: use keyboard emulator first (same reason as above -- Input.insertText
      // doesn't enter cell edit mode, so text goes nowhere)
      const isGoogleSheetsFallback = window.location.hostname === 'docs.google.com' &&
                                     window.location.pathname.startsWith('/spreadsheets/');
      if (isGoogleSheetsFallback) {
        logger.logActionExecution(FSB.sessionId, 'type', 'google_sheets_fallback_keyboard', {
          hostname: window.location.hostname,
          reason: 'all selectors exhausted, using keyboard emulator for Sheets'
        });
        try {
          const twkResult = await tools.typeWithKeys({ text: params.text, clearFirst: false, delay: 20 });
          if (twkResult.success) {
            if (params.pressEnter) {
              await waitForStability('type_keystroke');
              await tools.keyPress({ key: 'Enter', useDebuggerAPI: true });
            }
            return {
              success: true,
              typed: params.text,
              method: 'google_sheets_keyboard_fallback',
              pressedEnter: !!params.pressEnter,
              note: 'Google Sheets fallback -- keyboard emulator used (all selectors exhausted)'
            };
          }
        } catch (twkErr) {
          logger.debug('Google Sheets fallback typeWithKeys failed', { error: twkErr.message });
        }
        // Fall through to standard canvas CDP fallback as last resort
      }

      logger.logActionExecution(FSB.sessionId, 'type', 'canvas_fallback_attempt', {
        hostname: window.location.hostname,
        reason: 'all selectors exhausted'
      });
      try {
        const canvasTarget = document.querySelector('.kix-page-column') || document.querySelector('.kix-appview-editor');
        if (canvasTarget) {
          canvasTarget.click();
          await waitForStability('click');
          const eventTargetIframe = document.querySelector('.docs-texteventtarget-iframe');
          if (eventTargetIframe && eventTargetIframe.contentDocument) {
            try {
              const innerEditable = eventTargetIframe.contentDocument.querySelector('[contenteditable="true"]');
              if (innerEditable) innerEditable.focus();
            } catch (e) {
              // Cross-origin iframe
            }
          }
          await waitForStability('type_complete');
        }
        const cdpResult = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'cdpInsertText',
            text: params.text,
            clearFirst: !!params.clearFirst
          }, (response) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (response && response.success) resolve(response);
            else reject(new Error(response?.error || 'CDP insertion failed'));
          });
        });
        if (params.pressEnter) {
          await waitForStability('type_keystroke');
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
          document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }
        return {
          success: true,
          typed: params.text,
          method: 'canvas_editor_cdp_fallback',
          pressedEnter: !!params.pressEnter,
          note: 'Canvas editor fallback -- no element found, CDP insertion used directly'
        };
      } catch (cdpFallbackErr) {
        logger.debug('Canvas editor CDP fallback failed', { error: cdpFallbackErr.message });
        try {
          const twkResult = await tools.typeWithKeys({ text: params.text, clearFirst: false });
          if (twkResult.success) return { ...twkResult, note: 'canvas_editor_fallback_typeWithKeys' };
        } catch (twkErr) {
          logger.debug('Canvas editor fallback typeWithKeys also failed', { error: twkErr.message });
        }
        lastAttemptError = `Canvas editor CDP fallback failed: ${cdpFallbackErr.message}`;
      }
    }

    // Record failure - all selectors exhausted
    const typeNotFoundDiagnostic = diagnoseElementFailure(params.selector);
    actionRecorder.record(null, 'type', params, {
      selectorTried: params.selector,
      selectorUsed: null,
      elementFound: false,
      elementDetails: null,
      coordinatesUsed: null,
      coordinateSource: null,
      success: false,
      error: lastAttemptError || 'Type action had no effect with any available selector',
      hadEffect: false,
      diagnostic: typeNotFoundDiagnostic,
      duration: Date.now() - startTime
    });

    const typeFailReport = buildFailureReport('type', params.selector, lastElement, lastAttemptError || 'Type action had no effect with any available selector', typeNotFoundDiagnostic);
    typeFailReport.hadEffect = false;
    typeFailReport.selectorsTriad = selectors.length;
    typeFailReport.lastVerification = lastVerification;
    return typeFailReport;
  },
  // Press Enter key on an element with verification
  pressEnter: async (params) => {
    const startTime = Date.now();
    const selectors = params.selectors || [params.selector];
    let lastAttemptError = null;
    let lastVerification = null;
    let lastElement = null;

    for (let selectorIndex = 0; selectorIndex < selectors.length; selectorIndex++) {
      const currentSelector = selectors[selectorIndex];

      try {
        let element = FSB.querySelectorWithShadow(currentSelector);
        if (!element) {
          lastAttemptError = `Element not found with selector: ${currentSelector}`;
          continue;
        }

        const readiness = await FSB.smartEnsureReady(element, 'pressEnter');
        if (!readiness.ready) {
          lastAttemptError = `Element not ready: ${readiness.failureReason}`;
          continue;
        }

        if (readiness.scrolled) {
          element = FSB.querySelectorWithShadow(currentSelector);
          if (!element) {
            lastAttemptError = 'Element became stale after scrolling';
            continue;
          }
        }

        const isInsideForm = !!element.closest('form');
        const formElement = element.closest('form');
        const preState = captureActionState(element, 'pressEnter');

        element.focus();

        const enterDownEvent = new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        });
        element.dispatchEvent(enterDownEvent);

        const enterUpEvent = new KeyboardEvent('keyup', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        });
        element.dispatchEvent(enterUpEvent);

        await waitForPageStability({ maxWait: 2000, stableTime: 300 });

        const postState = captureActionState(element, 'pressEnter');
        const verification = verifyActionEffect(preState, postState, 'pressEnter');
        lastVerification = verification;

        if (!verification.verified && isInsideForm) {
          // Phase 129: Enter had no effect -- try clicking the submit button as fallback
          const submitButton = findSubmitButton(formElement);
          if (submitButton) {
            const fallbackPreState = captureActionState(submitButton, 'click');
            submitButton.click();
            await waitForPageStability({ maxWait: 2000, stableTime: 300 });
            const fallbackPostState = captureActionState(submitButton, 'click');
            const fallbackVerification = verifyActionEffect(fallbackPreState, fallbackPostState, 'click');

            if (fallbackVerification.verified) {
              actionRecorder.record(null, 'pressEnter', params, {
                selectorTried: params.selector,
                selectorUsed: currentSelector,
                elementFound: true,
                elementDetails: captureElementDetails(submitButton),
                coordinatesUsed: null,
                coordinateSource: null,
                success: true,
                hadEffect: true,
                usedSubmitFallback: true,
                effectDetails: fallbackVerification.changes,
                duration: Date.now() - startTime
              });

              return {
                success: true,
                key: 'Enter',
                selector: currentSelector,
                selectorIndex: selectorIndex,
                usedFallback: selectorIndex > 0,
                usedSubmitFallback: true,
                submitButtonSelector: submitButton.id ? `#${submitButton.id}` : submitButton.className ? `.${submitButton.className.split(' ')[0]}` : submitButton.tagName.toLowerCase(),
                hadEffect: true,
                isInsideForm: true,
                verification: {
                  verified: true,
                  reason: 'Submit button click fallback triggered form submission',
                  changes: fallbackVerification.changes
                }
              };
            }
          }
          // Submit button not found or click had no effect either -- continue to next selector
          lastAttemptError = `Enter key pressed but form submission had no effect${submitButton ? ' (submit button fallback also failed)' : ' (no submit button found in form)'}`;
          continue;
        }

        actionRecorder.record(null, 'pressEnter', params, {
          selectorTried: params.selector,
          selectorUsed: currentSelector,
          elementFound: true,
          elementDetails: captureElementDetails(element),
          coordinatesUsed: null,
          coordinateSource: null,
          success: true,
          hadEffect: verification.verified,
          effectDetails: verification.changes,
          duration: Date.now() - startTime
        });

        return {
          success: true,
          key: 'Enter',
          selector: currentSelector,
          selectorIndex: selectorIndex,
          usedFallback: selectorIndex > 0,
          hadEffect: verification.verified,
          isInsideForm: isInsideForm,
          verification: {
            verified: verification.verified,
            reason: verification.reason,
            changes: verification.changes
          }
        };
      } catch (error) {
        lastAttemptError = error.message;
      }
    }

    const enterNotFoundDiagnostic = diagnoseElementFailure(params.selector);
    actionRecorder.record(null, 'pressEnter', params, {
      selectorTried: params.selector,
      selectorUsed: null,
      elementFound: false,
      elementDetails: null,
      coordinatesUsed: null,
      coordinateSource: null,
      success: false,
      error: lastAttemptError || 'Enter key had no effect with any available selector',
      hadEffect: false,
      diagnostic: enterNotFoundDiagnostic,
      duration: Date.now() - startTime
    });

    const enterFailReport = buildFailureReport('pressEnter', params.selector, lastElement, lastAttemptError || 'Enter key had no effect with any available selector', enterNotFoundDiagnostic);
    enterFailReport.hadEffect = false;
    enterFailReport.selectorsTriad = selectors.length;
    enterFailReport.lastVerification = lastVerification;
    return enterFailReport;
  },

  // Move mouse to coordinates (simulated)
  moveMouse: (params) => {
    const element = document.elementFromPoint(params.x, params.y);
    if (element) {
      element.dispatchEvent(new MouseEvent('mouseover', {
        bubbles: true,
        clientX: params.x,
        clientY: params.y
      }));
      return { success: true, movedTo: { x: params.x, y: params.y } };
    }
    return { success: false, error: 'No element at coordinates' };
  },

  // CAPTCHA solving via 2Captcha service
  solveCaptcha: async (params) => {
    const settings = await new Promise(resolve => {
      chrome.storage.local.get(['captchaSolverEnabled', 'captchaApiKey'], resolve);
    });

    if (!settings.captchaSolverEnabled) {
      return { success: false, error: 'CAPTCHA solving is disabled. Enable it in FSB settings (Advanced > CAPTCHA Solver).' };
    }
    if (!settings.captchaApiKey) {
      return { success: false, error: 'No 2Captcha API key configured. Add it in FSB settings (Advanced > CAPTCHA Solver).' };
    }

    let captchaType = null;
    let sitekey = null;

    // reCAPTCHA v2
    const recaptchaEl = document.querySelector('.g-recaptcha, [data-sitekey]');
    const recaptchaIframe = document.querySelector('iframe[src*="recaptcha"]');
    if (recaptchaEl) {
      captchaType = 'recaptcha';
      sitekey = recaptchaEl.getAttribute('data-sitekey');
    } else if (recaptchaIframe) {
      captchaType = 'recaptcha';
      try {
        const iframeSrc = new URL(recaptchaIframe.src);
        sitekey = iframeSrc.searchParams.get('k');
      } catch (e) { /* URL parse failed */ }
    }

    // hCaptcha
    if (!captchaType) {
      const hcaptchaEl = document.querySelector('.h-captcha, [data-hcaptcha-sitekey]');
      const hcaptchaIframe = document.querySelector('iframe[src*="hcaptcha"]');
      if (hcaptchaEl) {
        captchaType = 'hcaptcha';
        sitekey = hcaptchaEl.getAttribute('data-sitekey') || hcaptchaEl.getAttribute('data-hcaptcha-sitekey');
      } else if (hcaptchaIframe) {
        captchaType = 'hcaptcha';
        try {
          const iframeSrc = new URL(hcaptchaIframe.src);
          sitekey = iframeSrc.searchParams.get('sitekey');
        } catch (e) { /* URL parse failed */ }
      }
    }

    // Cloudflare Turnstile
    if (!captchaType) {
      const turnstileEl = document.querySelector('.cf-turnstile, [data-turnstile-sitekey]');
      const turnstileIframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
      if (turnstileEl) {
        captchaType = 'turnstile';
        sitekey = turnstileEl.getAttribute('data-sitekey') || turnstileEl.getAttribute('data-turnstile-sitekey');
      } else if (turnstileIframe) {
        captchaType = 'turnstile';
        try {
          const iframeSrc = new URL(turnstileIframe.src);
          sitekey = iframeSrc.searchParams.get('k');
        } catch (e) { /* URL parse failed */ }
      }
    }

    if (!captchaType) {
      return { success: false, error: 'No supported CAPTCHA found on page (supports reCAPTCHA v2, hCaptcha, Turnstile).' };
    }
    if (!sitekey) {
      return { success: false, error: `Found ${captchaType} CAPTCHA but could not extract sitekey from the page.` };
    }

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'solveCaptcha',
          captchaType: captchaType,
          sitekey: sitekey,
          pageUrl: window.location.href,
          apiKey: settings.captchaApiKey
        }, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });

      if (!response || !response.success) {
        return { success: false, error: response?.error || 'CAPTCHA solve failed' };
      }

      const token = response.token;

      try {
        if (captchaType === 'recaptcha') {
          const textarea = document.querySelector('#g-recaptcha-response, textarea[name="g-recaptcha-response"]');
          if (textarea) {
            textarea.style.display = 'block';
            textarea.value = token;
            textarea.style.display = 'none';
          }
          const recaptchaWidget = document.querySelector('.g-recaptcha, [data-sitekey]');
          const callbackName = recaptchaWidget?.getAttribute('data-callback');
          if (callbackName && typeof window[callbackName] === 'function') {
            window[callbackName](token);
          } else if (typeof window.___grecaptcha_cfg !== 'undefined') {
            try {
              const clients = window.___grecaptcha_cfg?.clients;
              if (clients) {
                for (const clientKey of Object.keys(clients)) {
                  const client = clients[clientKey];
                  for (const key of Object.keys(client)) {
                    const obj = client[key];
                    if (obj && typeof obj === 'object') {
                      for (const innerKey of Object.keys(obj)) {
                        if (typeof obj[innerKey] === 'function') {
                          obj[innerKey](token);
                          break;
                        }
                      }
                    }
                  }
                }
              }
            } catch (e) { /* callback trigger failed, token still set */ }
          }
        } else if (captchaType === 'hcaptcha') {
          const textarea = document.querySelector('textarea[name="h-captcha-response"], textarea[name="g-recaptcha-response"]');
          if (textarea) {
            textarea.style.display = 'block';
            textarea.value = token;
            textarea.style.display = 'none';
          }
          const hcaptchaWidget = document.querySelector('.h-captcha, [data-hcaptcha-sitekey]');
          const callbackName = hcaptchaWidget?.getAttribute('data-callback');
          if (callbackName && typeof window[callbackName] === 'function') {
            window[callbackName](token);
          }
        } else if (captchaType === 'turnstile') {
          const input = document.querySelector('input[name="cf-turnstile-response"]');
          if (input) {
            input.value = token;
          }
          const turnstileWidget = document.querySelector('.cf-turnstile, [data-turnstile-sitekey]');
          const callbackName = turnstileWidget?.getAttribute('data-callback');
          if (callbackName && typeof window[callbackName] === 'function') {
            window[callbackName](token);
          }
        }

        return { success: true, captchaType: captchaType, message: `${captchaType} CAPTCHA solved and token injected` };
      } catch (injectError) {
        return {
          success: false,
          error: `Token injection failed: ${injectError.message}. Raw token available for manual use.`,
          token: token,
          captchaType: captchaType
        };
      }
    } catch (error) {
      return { success: false, error: `CAPTCHA solve request failed: ${error.message}` };
    }
  },

  // Navigate to a URL
  navigate: async (params) => {
    if (!params.url) {
      return { success: false, error: 'No URL provided' };
    }

    const preNavState = {
      url: window.location.href,
      timestamp: Date.now()
    };

    let targetUrl;
    try {
      const url = new URL(params.url);
      targetUrl = params.url;
    } catch (e) {
      if (!params.url.startsWith('http://') && !params.url.startsWith('https://')) {
        const urlWithProtocol = 'https://' + params.url;
        try {
          new URL(urlWithProtocol);
          targetUrl = urlWithProtocol;
        } catch (e2) {
          return { success: false, error: 'Invalid URL format' };
        }
      } else {
        return { success: false, error: 'Invalid URL format' };
      }
    }

    window.location.href = targetUrl;

    return {
      success: true,
      hadEffect: true,
      navigatingTo: targetUrl,
      fromUrl: preNavState.url,
      verification: {
        note: 'Navigation initiated - verification will occur after page load',
        expectedUrl: targetUrl
      }
    };
  },

  // Search Google for a website
  searchGoogle: (params) => {
    if (!params.query) {
      return { success: false, error: 'No search query provided' };
    }

    const encodedQuery = encodeURIComponent(params.query);
    const googleSearchUrl = `https://www.google.com/search?q=${encodedQuery}`;

    window.location.href = googleSearchUrl;
    return { success: true, searchingFor: params.query, url: googleSearchUrl };
  },

  // Site-aware search: uses the current site's own search input when available,
  // falling back to Google search only when no site search input is found.
  siteSearch: async (params) => {
    if (!params.query) {
      return { success: false, error: 'No search query provided' };
    }

    const detected = detectSiteSearchInput();

    // Fallback to Google if no site search input found
    if (!detected) {
      const googleResult = tools.searchGoogle(params);
      return { ...googleResult, method: 'google-fallback' };
    }

    const { element: searchInput, tier, selector: matchedSelector } = detected;

    try {
      // Ensure element is ready (also dismisses cookie consent per Phase 130)
      if (typeof FSB.smartEnsureReady === 'function') {
        await FSB.smartEnsureReady(searchInput, 'click');
      }

      // Focus and click the search input
      searchInput.focus();
      searchInput.click();

      // Clear existing text
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Type the query (set value directly + dispatch input event)
      searchInput.value = params.query;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait 200ms for autocomplete to populate
      await new Promise(resolve => setTimeout(resolve, 200));

      // Capture pre-submit state for verifying effect
      const preUrl = window.location.href;

      // Submit via Enter keydown + keyup
      const enterDown = new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true
      });
      const enterUp = new KeyboardEvent('keyup', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true
      });
      searchInput.dispatchEvent(enterDown);
      searchInput.dispatchEvent(enterUp);

      // Wait for page stability after submit
      await waitForPageStability({ maxWait: 3000, stableTime: 500 });

      // If URL did not change, try submit button fallback (reuse Phase 129 findSubmitButton)
      if (window.location.href === preUrl) {
        const form = searchInput.closest('form');
        if (form) {
          const submitBtn = findSubmitButton(form) ||
            form.querySelector('[role="button"][aria-label*="search" i]');
          if (submitBtn) {
            submitBtn.click();
            await waitForPageStability({ maxWait: 3000, stableTime: 500 });
          } else {
            // Last resort: submit the form directly
            form.submit();
            await waitForPageStability({ maxWait: 3000, stableTime: 500 });
          }
        }
      }

      return {
        success: true,
        query: params.query,
        method: 'site-search',
        searchInputSelector: matchedSelector,
        tier,
        url: window.location.href
      };
    } catch (error) {
      // On error, fall back to Google
      const googleResult = tools.searchGoogle(params);
      return { ...googleResult, method: 'google-fallback', siteSearchError: error.message };
    }
  },

  // Wait for element to appear
  waitForElement: async (params) => {
    const { selector, timeout = 5000 } = params;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const element = FSB.querySelectorWithShadow(selector);
        if (element || Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          resolve({
            success: !!element,
            found: !!element,
            selector,
            waitTime: Date.now() - startTime
          });
        }
      }, 100);
    });
  },

  // Verify if a message was successfully sent by checking DOM changes
  verifyMessageSent: async (params) => {
    const { timeout = 5000, messageText = '' } = params;
    const startTime = Date.now();

    try {
      const indicators = [
        () => {
          const messages = document.querySelectorAll([
            '[data-testid*="message"]', '.message', '.chat-message', '.msg-',
            '[aria-label*="message"]', '.conversation-message', '.dm-message',
            '.tweet-text', '.msg-form__sent-confirm', '.message-in', '.copyable-text'
          ].join(', '));

          if (messageText) {
            return Array.from(messages).some(msg =>
              msg.textContent?.includes(messageText.substring(0, 20))
            );
          } else {
            const currentCount = messages.length;
            const previousCount = window.fsb_lastMessageCount || 0;
            window.fsb_lastMessageCount = currentCount;
            return currentCount > previousCount;
          }
        },
        () => {
          const inputs = document.querySelectorAll([
            '[contenteditable="true"]', 'textarea', 'input[type="text"]',
            '.message-input', '.compose-input'
          ].join(', '));
          return Array.from(inputs).some(input => {
            const content = input.textContent || input.value || '';
            return content.trim() === '';
          });
        },
        () => {
          const confirmations = document.querySelectorAll([
            '.sent-confirmation', '.message-sent', '.delivery-confirmation',
            '[aria-label*="sent"]', '.success-indicator', '.checkmark'
          ].join(', '));
          return confirmations.length > 0 &&
                 Array.from(confirmations).some(el => el.offsetParent !== null);
        },
        () => {
          const sendButtons = document.querySelectorAll([
            '[aria-label*="send"]', 'button[type="submit"]',
            '.send-button', '.submit-button', '[data-testid*="send"]'
          ].join(', '));
          return Array.from(sendButtons).some(button =>
            button.disabled ||
            button.classList.contains('loading') ||
            button.classList.contains('sent') ||
            button.textContent?.toLowerCase().includes('sent')
          );
        }
      ];

      while (Date.now() - startTime < timeout) {
        for (let i = 0; i < indicators.length; i++) {
          try {
            if (indicators[i]()) {
              return {
                success: true,
                verified: true,
                method: `indicator_${i + 1}`,
                waitTime: Date.now() - startTime
              };
            }
          } catch (error) {
            // Ignore individual indicator errors
          }
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      return {
        success: true,
        verified: false,
        waitTime: Date.now() - startTime,
        note: 'Could not verify message sending, but no errors occurred'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        waitTime: Date.now() - startTime
      };
    }
  },
  waitForDOMStable: async (params) => {
    const { timeout = 5000, stableTime = 500 } = params;
    const startTime = Date.now();
    let lastChangeTime = Date.now();
    let changeCount = 0;
    let networkRequestCount = 0;

    const originalFetch = window.fetch;
    const originalXHROpen = XMLHttpRequest.prototype.open;

    window.fetch = function(...args) {
      networkRequestCount++;
      lastChangeTime = Date.now();
      return originalFetch.apply(this, args);
    };

    XMLHttpRequest.prototype.open = function(...args) {
      networkRequestCount++;
      lastChangeTime = Date.now();
      return originalXHROpen.apply(this, args);
    };

    return new Promise((resolve) => {
      const observer = new MutationObserver((mutations) => {
        const significantMutations = mutations.filter(mutation => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            const target = mutation.target;
            if (target.classList && (
              target.classList.contains('loading') ||
              target.classList.contains('spinner') ||
              target.classList.contains('progress')
            )) {
              return false;
            }
          }
          return true;
        });

        if (significantMutations.length > 0) {
          changeCount += significantMutations.length;
          lastChangeTime = Date.now();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeOldValue: false,
        characterData: true,
        attributeFilter: ['class', 'id', 'data-*', 'aria-*']
      });

      const checkInterval = setInterval(() => {
        const now = Date.now();
        const timeSinceLastChange = now - lastChangeTime;
        const totalTime = now - startTime;

        const isStable = timeSinceLastChange >= stableTime;
        const hasTimedOut = totalTime >= timeout;

        if (isStable || hasTimedOut) {
          clearInterval(checkInterval);
          observer.disconnect();

          window.fetch = originalFetch;
          XMLHttpRequest.prototype.open = originalXHROpen;

          const result = {
            success: true,
            stable: isStable,
            waitTime: totalTime,
            changeCount,
            networkRequestCount,
            reason: hasTimedOut ? 'timeout' : 'stable',
            stability: isStable ? 'good' : 'poor'
          };

          logger.logTiming(FSB.sessionId, 'WAIT', 'dom_stable', totalTime, { changes: changeCount });
          logger.logDOMOperation(FSB.sessionId, 'stability_check', result);
          resolve(result);
        }
      }, 50);

      setTimeout(() => {
        clearInterval(checkInterval);
        observer.disconnect();
        window.fetch = originalFetch;
        XMLHttpRequest.prototype.open = originalXHROpen;

        resolve({
          success: true,
          stable: false,
          waitTime: timeout,
          changeCount,
          networkRequestCount,
          reason: 'safety_timeout',
          stability: 'unknown'
        });
      }, timeout + 1000);
    });
  },

  // Detect loading indicators
  detectLoadingState: (params) => {
    const detectStart = Date.now();
    const loadingPatterns = [
      '.loading', '.loader', '.spinner', '.progress', '.loading-spinner',
      '.load-more', '.is-loading', '.in-progress', '.pending',
      'div[class*="loading"]', 'div[class*="loader"]', 'div[class*="spinner"]',
      'div[class*="progress"]', '[aria-busy="true"]',
      '.MuiCircularProgress-root', '.ant-spin', '.el-loading-mask',
      '[data-loading="true"]', '[data-state="loading"]'
    ];

    for (const pattern of loadingPatterns) {
      const elements = document.querySelectorAll(pattern);
      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0 &&
                         window.getComputedStyle(element).display !== 'none' &&
                         window.getComputedStyle(element).visibility !== 'hidden';

        if (isVisible) {
          const result = {
            loading: true,
            indicator: pattern,
            element: {
              tag: element.tagName,
              class: FSB.getClassName(element),
              id: element.id
            }
          };
          logger.logTiming(FSB.sessionId, 'WAIT', 'loading_detect', Date.now() - detectStart, { loading: true, indicator: pattern });
          return result;
        }
      }
    }

    const loadingTexts = ['loading', 'please wait', 'processing', 'fetching', 'updating'];
    const textElements = document.querySelectorAll('*');

    for (const element of textElements) {
      const text = element.textContent?.toLowerCase() || '';
      if (loadingTexts.some(loadingText => text.includes(loadingText))) {
        const rect = element.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;

        if (isVisible && element.children.length === 0) {
          const result = {
            loading: true,
            indicator: 'text',
            text: element.textContent?.trim().substring(0, 50)
          };
          logger.logTiming(FSB.sessionId, 'WAIT', 'loading_detect', Date.now() - detectStart, { loading: true, indicator: 'text' });
          return result;
        }
      }
    }

    logger.logTiming(FSB.sessionId, 'WAIT', 'loading_detect', Date.now() - detectStart, { loading: false });
    return { loading: false };
  },

  // Right click on element
  rightClick: async (params) => {
    const startTime = Date.now();
    let element = FSB.querySelectorWithShadow(params.selector);
    if (!element) {
      actionRecorder.record(null, 'rightClick', params, { selectorTried: params.selector, elementFound: false, success: false, error: 'Element not found', diagnostic: generateDiagnostic('elementNotFound', { selector: params.selector }), duration: Date.now() - startTime });
      return { success: false, error: 'Element not found', selector: params.selector };
    }

    const readiness = await FSB.smartEnsureReady(element, 'rightClick');
    if (!readiness.ready) {
      actionRecorder.record(null, 'rightClick', params, { selectorTried: params.selector, selectorUsed: params.selector, elementFound: true, elementDetails: captureElementDetails(element), success: false, error: `Element not ready for right click: ${readiness.failureReason}`, diagnostic: generateDiagnostic('notReady', { selector: params.selector, checks: readiness.checks }), duration: Date.now() - startTime });
      return { success: false, error: `Element not ready for right click: ${readiness.failureReason}`, selector: params.selector, checks: readiness.checks };
    }

    if (readiness.scrolled) {
      element = FSB.querySelectorWithShadow(params.selector);
      if (!element) {
        actionRecorder.record(null, 'rightClick', params, { selectorTried: params.selector, elementFound: false, success: false, error: 'Element became stale after scrolling', diagnostic: generateDiagnostic('elementNotFound', { selector: params.selector }), duration: Date.now() - startTime });
        return { success: false, error: 'Element became stale after scrolling', selector: params.selector };
      }
    }

    const rect = element.getBoundingClientRect();
    const event = new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    });
    element.dispatchEvent(event);
    actionRecorder.record(null, 'rightClick', params, { selectorTried: params.selector, selectorUsed: params.selector, elementFound: true, elementDetails: captureElementDetails(element), coordinatesUsed: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, coordinateSource: 'element_center', success: true, hadEffect: true, duration: Date.now() - startTime });
    return { success: true, rightClicked: params.selector, scrolled: readiness.scrolled };
  },

  // Double click on element
  doubleClick: async (params) => {
    const startTime = Date.now();
    let element = FSB.querySelectorWithShadow(params.selector);
    if (!element) {
      actionRecorder.record(null, 'doubleClick', params, { selectorTried: params.selector, elementFound: false, success: false, error: 'Element not found', diagnostic: generateDiagnostic('elementNotFound', { selector: params.selector }), duration: Date.now() - startTime });
      return { success: false, error: 'Element not found', selector: params.selector };
    }

    const readiness = await FSB.smartEnsureReady(element, 'doubleClick');
    if (!readiness.ready) {
      actionRecorder.record(null, 'doubleClick', params, { selectorTried: params.selector, selectorUsed: params.selector, elementFound: true, elementDetails: captureElementDetails(element), success: false, error: `Element not ready for double click: ${readiness.failureReason}`, diagnostic: generateDiagnostic('notReady', { selector: params.selector, checks: readiness.checks }), duration: Date.now() - startTime });
      return { success: false, error: `Element not ready for double click: ${readiness.failureReason}`, selector: params.selector, checks: readiness.checks };
    }

    if (readiness.scrolled) {
      element = FSB.querySelectorWithShadow(params.selector);
      if (!element) {
        actionRecorder.record(null, 'doubleClick', params, { selectorTried: params.selector, elementFound: false, success: false, error: 'Element became stale after scrolling', diagnostic: generateDiagnostic('elementNotFound', { selector: params.selector }), duration: Date.now() - startTime });
        return { success: false, error: 'Element became stale after scrolling', selector: params.selector };
      }
    }

    const rect = element.getBoundingClientRect();
    const event = new MouseEvent('dblclick', {
      bubbles: true, cancelable: true, view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    });
    element.dispatchEvent(event);
    actionRecorder.record(null, 'doubleClick', params, { selectorTried: params.selector, selectorUsed: params.selector, elementFound: true, elementDetails: captureElementDetails(element), coordinatesUsed: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, coordinateSource: 'element_center', success: true, hadEffect: true, duration: Date.now() - startTime });
    return { success: true, doubleClicked: params.selector, scrolled: readiness.scrolled };
  },

  // Enhanced keyboard key press with Chrome Debugger API fallback
  keyPress: async (params) => {
    const { key, ctrlKey = false, shiftKey = false, altKey = false, metaKey = false, selector, useDebuggerAPI = true } = params;

    // Track whether the trusted CDP path was attempted and, if so, why it failed.
    // These surface on the synthetic domEvents fallback below so a no-op untrusted
    // dispatch (e.g. inside a cross-origin payment/OAuth iframe) is not masked as a
    // plain success.
    let cdpAttempted = false;
    let cdpError = null;

    if (useDebuggerAPI) {
      cdpAttempted = true;
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'keyboardDebuggerAction',
          method: 'pressKey',
          key: key,
          modifiers: { ctrl: ctrlKey, shift: shiftKey, alt: altKey, meta: metaKey }
        });

        if (response.success) {
          return { success: true, key, method: 'debuggerAPI', target: selector || 'activeElement', result: response.result };
        } else {
          cdpError = (response && response.error) || 'debugger API returned failure';
          logger.logRecovery(FSB.sessionId, 'debugger_api_failed', 'dom_events_fallback', 'started', { error: response.error });
        }
      } catch (error) {
        cdpError = error.message || 'debugger API unavailable';
        logger.logRecovery(FSB.sessionId, 'debugger_api_unavailable', 'dom_events_fallback', 'started', { error: error.message });
      }
    }

    const target = selector ? document.querySelector(selector) : document.activeElement;
    if (!target) {
      return { success: false, error: 'No target element' };
    }

    target.focus();

    const keyEvent = new KeyboardEvent('keydown', {
      key, code: key, ctrlKey, shiftKey, altKey, metaKey, bubbles: true, cancelable: true
    });
    target.dispatchEvent(keyEvent);

    const keyUpEvent = new KeyboardEvent('keyup', {
      key, code: key, ctrlKey, shiftKey, altKey, metaKey, bubbles: true, cancelable: true
    });
    target.dispatchEvent(keyUpEvent);

    // Synthetic KeyboardEvents are untrusted (isTrusted:false) and are a NO-OP inside
    // cross-origin iframes (e.g. the Stripe CVC frame). Surface honest signals so the
    // caller/operator can see a degraded untrusted dispatch instead of an unqualified
    // success. `success:true` is preserved for existing same-origin callers.
    // TODO(260701-2du): reliably detect "focus is inside a cross-origin iframe" from the
    // content script and, in that specific case, return success:false rather than only
    // flagging degraded -- fuller cross-origin-iframe detection is a follow-up.
    const degraded = cdpAttempted && cdpError !== null;
    if (degraded) {
      logger.warn('keyPress fell back to untrusted domEvents dispatch (no-op inside cross-origin iframes)', {
        sessionId: FSB.sessionId, key, cdpError, target: selector || 'activeElement'
      });
    }

    const result = {
      success: true,
      key,
      method: 'domEvents',
      trusted: false,
      target: selector || 'activeElement',
      modifiers: { ctrlKey, shiftKey, altKey, metaKey }
    };
    if (degraded) {
      result.degraded = true;
      result.cdpError = cdpError;
    }
    return result;
  },

  // Press a sequence of keys
  pressKeySequence: async (params) => {
    const { keys, modifiers = {}, delay = 50, useDebuggerAPI = true } = params;

    if (!Array.isArray(keys) || keys.length === 0) {
      return { success: false, error: 'Keys array is required' };
    }

    if (useDebuggerAPI) {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'keyboardDebuggerAction', method: 'pressKeySequence',
          keys: keys, modifiers: modifiers, delay: delay
        });

        if (response.success) {
          return { success: true, action: 'pressKeySequence', keys, modifiers, method: 'debuggerAPI', result: response.result };
        } else {
          logger.logRecovery(FSB.sessionId, 'debugger_api_key_sequence_failed', 'dom_events_fallback', 'started', { error: response.error });
        }
      } catch (error) {
        logger.logRecovery(FSB.sessionId, 'debugger_api_key_sequence_unavailable', 'dom_events_fallback', 'started', { error: error.message });
      }
    }

    const results = [];
    try {
      for (const key of keys) {
        const result = await tools.keyPress({
          key,
          ctrlKey: modifiers.ctrl || modifiers.control,
          shiftKey: modifiers.shift,
          altKey: modifiers.alt,
          metaKey: modifiers.meta || modifiers.cmd,
          useDebuggerAPI: false
        });
        results.push(result);
        if (!result.success) {
          return { success: false, error: `Failed at key: ${key}`, completedKeys: results.length - 1, results };
        }
        if (delay > 0 && keys.indexOf(key) < keys.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      return { success: true, action: 'pressKeySequence', keys, modifiers, method: 'domEvents', results };
    } catch (error) {
      return { success: false, error: error.message || 'Key sequence failed', keys, modifiers, results };
    }
  },

  // Type text using real keyboard events
  typeWithKeys: async (params) => {
    const { text, delay = 30, useDebuggerAPI = true, clearFirst = true } = params;

    if (!text || typeof text !== 'string') {
      return { success: false, error: 'Text parameter is required' };
    }

    if (useDebuggerAPI) {
      try {
        if (clearFirst) {
          try {
            await chrome.runtime.sendMessage({ action: 'keyboardDebuggerAction', method: 'pressKey', key: 'a', modifiers: { ctrl: true } });
            await new Promise(resolve => setTimeout(resolve, 30));
            await chrome.runtime.sendMessage({ action: 'keyboardDebuggerAction', method: 'pressKey', key: 'Backspace', modifiers: {} });
            await new Promise(resolve => setTimeout(resolve, 30));
          } catch (clearErr) { /* Non-fatal */ }
        }

        const response = await chrome.runtime.sendMessage({
          action: 'keyboardDebuggerAction', method: 'typeText', text: text, delay: delay
        });

        if (response.success) {
          return { success: true, action: 'typeWithKeys', text, method: 'debuggerAPI', characterCount: text.length, result: response.result };
        } else {
          logger.logRecovery(FSB.sessionId, 'debugger_api_text_failed', 'return_error', 'failed', { error: response.error });
          return { success: false, error: response.error || 'Keyboard debugger API failed', completedChars: response.result?.completedChars || 0, method: 'debugger-failed', text, action: 'typeWithKeys' };
        }
      } catch (error) {
        logger.logRecovery(FSB.sessionId, 'debugger_api_text_unavailable', 'return_error', 'failed', { error: error.message });
        return { success: false, error: error.message || 'Debugger API unavailable', method: 'debugger-exception', text, action: 'typeWithKeys' };
      }
    }

    // Fallback to DOM events
    const results = [];
    try {
      if (clearFirst) {
        const activeEl = document.activeElement;
        if (activeEl) {
          if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
            activeEl.value = '';
            activeEl.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (activeEl.contentEditable === 'true') {
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
          }
        }
      }

      for (const char of text) {
        let key = char;
        let modifiers = {};

        if (char >= 'A' && char <= 'Z') {
          key = char.toLowerCase();
          modifiers.shift = true;
        }

        const shiftChars = {
          '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
          '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
          '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\',
          ':': ';', '"': "'", '<': ',', '>': '.', '?': '/'
        };

        if (shiftChars[char]) {
          key = shiftChars[char];
          modifiers.shift = true;
        }

        const result = await tools.keyPress({ key, shiftKey: modifiers.shift, useDebuggerAPI: false });
        results.push({ char, key, modifiers, result });

        if (!result.success) {
          return { success: false, error: `Failed at character: ${char}`, completedChars: results.length - 1, results };
        }

        if (delay > 0 && text.indexOf(char) < text.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      return { success: true, action: 'typeWithKeys', text, method: 'domEvents', characterCount: text.length, results };
    } catch (error) {
      return { success: false, error: error.message || 'Text typing failed', text, results };
    }
  },

  // Send special keys
  sendSpecialKey: async (params) => {
    const { specialKey, useDebuggerAPI = true } = params;

    if (!specialKey || typeof specialKey !== 'string') {
      return { success: false, error: 'SpecialKey parameter is required' };
    }

    if (useDebuggerAPI) {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'keyboardDebuggerAction', method: 'sendSpecialKey', specialKey: specialKey
        });
        if (response.success) {
          return { success: true, action: 'sendSpecialKey', specialKey, method: 'debuggerAPI', result: response.result };
        } else {
          logger.logRecovery(FSB.sessionId, 'debugger_api_special_key_failed', 'dom_events_fallback', 'started', { error: response.error });
        }
      } catch (error) {
        logger.logRecovery(FSB.sessionId, 'debugger_api_special_key_unavailable', 'dom_events_fallback', 'started', { error: error.message });
      }
    }

    try {
      const parts = specialKey.split('+').map(part => part.trim());
      const modifiers = {};
      let targetKey = parts[parts.length - 1];

      for (let i = 0; i < parts.length - 1; i++) {
        const modifier = parts[i].toLowerCase();
        if (modifier === 'ctrl' || modifier === 'control') modifiers.ctrlKey = true;
        else if (modifier === 'alt') modifiers.altKey = true;
        else if (modifier === 'shift') modifiers.shiftKey = true;
        else if (modifier === 'meta' || modifier === 'cmd' || modifier === 'command') modifiers.metaKey = true;
      }

      const result = await tools.keyPress({ key: targetKey, ...modifiers, useDebuggerAPI: false });
      return { success: result.success, action: 'sendSpecialKey', specialKey, method: 'domEvents', parsedKey: targetKey, parsedModifiers: modifiers, result };
    } catch (error) {
      return { success: false, error: error.message || 'Special key send failed', specialKey };
    }
  },

  // Select text in element
  selectText: (params) => {
    const element = FSB.querySelectorWithShadow(params.selector);
    if (element) {
      if (element.select) {
        element.select();
      } else if (window.getSelection) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      return { success: true, selected: params.selector };
    }
    return { success: false, error: 'Element not found' };
  },

  // Select a specific text range within an element by character offsets
  selectTextRange: (params) => {
    const { selector, startOffset, endOffset } = params;
    const element = FSB.querySelectorWithShadow(selector);
    if (!element) {
      return { success: false, error: 'Element not found', selector };
    }

    // Walk text nodes to find the node and offset for a given character position
    function findTextPosition(root, charOffset) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      let currentOffset = 0;
      let node;
      while ((node = walker.nextNode())) {
        const nodeLen = node.textContent.length;
        if (currentOffset + nodeLen >= charOffset) {
          return { node, offset: charOffset - currentOffset };
        }
        currentOffset += nodeLen;
      }
      // If charOffset exceeds total text length, clamp to end of last text node
      const allText = root.textContent || '';
      const lastNode = walker.currentNode || root;
      return { node: lastNode, offset: lastNode.textContent ? lastNode.textContent.length : 0 };
    }

    try {
      const totalText = element.textContent || '';
      const clampedStart = Math.max(0, Math.min(startOffset, totalText.length));
      const clampedEnd = Math.max(clampedStart, Math.min(endOffset, totalText.length));

      const startPos = findTextPosition(element, clampedStart);
      const endPos = findTextPosition(element, clampedEnd);

      const range = document.createRange();
      range.setStart(startPos.node, startPos.offset);
      range.setEnd(endPos.node, endPos.offset);

      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      const selectedText = selection.toString();
      return {
        success: true,
        selectedText,
        startOffset: clampedStart,
        endOffset: clampedEnd,
        totalLength: totalText.length,
        selector
      };
    } catch (error) {
      return { success: false, error: error.message || 'Text range selection failed', selector };
    }
  },

  // Focus on element with auto-wait
  focus: async (params) => {
    const startTime = Date.now();
    let element = FSB.querySelectorWithShadow(params.selector);
    if (!element) {
      actionRecorder.record(null, 'focus', params, { selectorTried: params.selector, elementFound: false, success: false, error: 'Element not found', diagnostic: generateDiagnostic('elementNotFound', { selector: params.selector }), duration: Date.now() - startTime });
      return { success: false, error: 'Element not found', selector: params.selector };
    }

    const readiness = await FSB.smartEnsureReady(element, 'focus');
    if (!readiness.ready) {
      // Obscured fallback: programmatic focus bypasses canvas overlays
      const isObscured = readiness.failureReason && readiness.failureReason.includes('obscured');
      if (isObscured && element && typeof element.focus === 'function') {
        try { element.focus(); return { success: true, focused: params.selector, method: 'programmatic_focus_obscured_fallback' }; } catch (e) { /* continue to error */ }
      }
      actionRecorder.record(null, 'focus', params, { selectorTried: params.selector, selectorUsed: params.selector, elementFound: true, elementDetails: captureElementDetails(element), success: false, error: `Element not ready for focus: ${readiness.failureReason}`, diagnostic: generateDiagnostic('notReady', { selector: params.selector, checks: readiness.checks }), duration: Date.now() - startTime });
      return { success: false, error: `Element not ready for focus: ${readiness.failureReason}`, selector: params.selector, checks: readiness.checks };
    }

    if (readiness.scrolled) {
      element = FSB.querySelectorWithShadow(params.selector);
      if (!element) {
        actionRecorder.record(null, 'focus', params, { selectorTried: params.selector, elementFound: false, success: false, error: 'Element became stale after scrolling', diagnostic: generateDiagnostic('elementNotFound', { selector: params.selector }), duration: Date.now() - startTime });
        return { success: false, error: 'Element became stale after scrolling', selector: params.selector };
      }
    }

    element.focus();
    actionRecorder.record(null, 'focus', params, { selectorTried: params.selector, selectorUsed: params.selector, elementFound: true, elementDetails: captureElementDetails(element), success: true, hadEffect: true, duration: Date.now() - startTime });
    return { success: true, focused: params.selector, scrolled: readiness.scrolled };
  },

  // Blur (unfocus) element
  blur: (params) => {
    const startTime = Date.now();
    const element = FSB.querySelectorWithShadow(params.selector);
    if (element) {
      element.blur();
      actionRecorder.record(null, 'blur', params, { selectorTried: params.selector, selectorUsed: params.selector, elementFound: true, elementDetails: captureElementDetails(element), success: true, hadEffect: true, duration: Date.now() - startTime });
      return { success: true, blurred: params.selector };
    }
    actionRecorder.record(null, 'blur', params, { selectorTried: params.selector, elementFound: false, success: false, error: 'Element not found', diagnostic: generateDiagnostic('elementNotFound', { selector: params.selector }), duration: Date.now() - startTime });
    return { success: false, error: 'Element not found' };
  },

  // Hover over element
  hover: async (params) => {
    const startTime = Date.now();
    let element = FSB.querySelectorWithShadow(params.selector);
    if (!element) {
      actionRecorder.record(null, 'hover', params, { selectorTried: params.selector, elementFound: false, success: false, error: 'Element not found', diagnostic: generateDiagnostic('elementNotFound', { selector: params.selector }), duration: Date.now() - startTime });
      return { success: false, error: 'Element not found', selector: params.selector };
    }

    const readiness = await FSB.smartEnsureReady(element, 'hover');
    if (!readiness.ready) {
      // Obscured fallback: dispatch hover events programmatically past canvas overlays
      const isObscured = readiness.failureReason && readiness.failureReason.includes('obscured');
      if (isObscured && element) {
        try {
          const rect = element.getBoundingClientRect();
          element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
          element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
          return { success: true, hovered: params.selector, method: 'programmatic_hover_obscured_fallback' };
        } catch (e) { /* continue to error */ }
      }
      actionRecorder.record(null, 'hover', params, { selectorTried: params.selector, selectorUsed: params.selector, elementFound: true, elementDetails: captureElementDetails(element), success: false, error: `Element not ready for hover: ${readiness.failureReason}`, diagnostic: generateDiagnostic('notReady', { selector: params.selector, checks: readiness.checks }), duration: Date.now() - startTime });
      return { success: false, error: `Element not ready for hover: ${readiness.failureReason}`, selector: params.selector, checks: readiness.checks };
    }

    if (readiness.scrolled) {
      element = FSB.querySelectorWithShadow(params.selector);
      if (!element) {
        actionRecorder.record(null, 'hover', params, { selectorTried: params.selector, elementFound: false, success: false, error: 'Element became stale after scrolling', diagnostic: generateDiagnostic('elementNotFound', { selector: params.selector }), duration: Date.now() - startTime });
        return { success: false, error: 'Element became stale after scrolling', selector: params.selector };
      }
    }

    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));

    actionRecorder.record(null, 'hover', params, { selectorTried: params.selector, selectorUsed: params.selector, elementFound: true, elementDetails: captureElementDetails(element), success: true, hadEffect: true, duration: Date.now() - startTime });
    return { success: true, hovering: params.selector, scrolled: readiness.scrolled };
  },

  // Select dropdown option with verification
  selectOption: async (params) => {
    const startTime = Date.now();
    const selectors = params.selectors || [params.selector];
    let lastAttemptError = null;
    let lastVerification = null;

    for (let selectorIndex = 0; selectorIndex < selectors.length; selectorIndex++) {
      const currentSelector = selectors[selectorIndex];
      try {
        let element = FSB.querySelectorWithShadow(currentSelector);
        if (!element || element.tagName !== 'SELECT') { lastAttemptError = `Select element not found with selector: ${currentSelector}`; continue; }

        const readiness = await FSB.smartEnsureReady(element, 'selectOption');
        if (!readiness.ready) { lastAttemptError = `Element not ready: ${readiness.failureReason}`; continue; }
        if (readiness.scrolled) { element = FSB.querySelectorWithShadow(currentSelector); if (!element) { lastAttemptError = 'Element became stale after scrolling'; continue; } }

        const preState = captureActionState(element, 'selectOption');

        if (params.value !== undefined) { element.value = params.value; }
        else if (params.index !== undefined) { element.selectedIndex = params.index; }
        else if (params.text !== undefined) { const option = Array.from(element.options).find(opt => opt.text === params.text); if (option) { option.selected = true; } }

        element.dispatchEvent(new Event('change', { bubbles: true }));
        await waitForPageStability({ maxWait: 1000, stableTime: 200 });

        const postState = captureActionState(element, 'selectOption');
        const verification = verifyActionEffect(preState, postState, 'selectOption');
        lastVerification = verification;
        if (!verification.verified) { lastAttemptError = `Selection had no verified effect: ${verification.reason}`; continue; }

        actionRecorder.record(null, 'selectOption', params, { selectorTried: selectors[0], selectorUsed: currentSelector, elementFound: true, elementDetails: captureElementDetails(element), success: true, hadEffect: true, verification: verification, duration: Date.now() - startTime });
        return { success: true, selected: params.value || params.text || params.index, selector: currentSelector, selectorIndex, usedFallback: selectorIndex > 0, hadEffect: true, verification: { verified: verification.verified, reason: verification.reason, changes: verification.changes } };
      } catch (error) { lastAttemptError = error.message; }
    }

    actionRecorder.record(null, 'selectOption', params, { selectorTried: selectors[0], selectorUsed: null, elementFound: false, success: false, error: lastAttemptError || 'Selection had no effect with any available selector', diagnostic: generateDiagnostic('noEffect', { selector: selectors[0] }), duration: Date.now() - startTime });
    return buildFailureReport('selectOption', selectors[0], null, lastAttemptError || 'Selection had no effect with any available selector');
  },

  // Check/uncheck checkbox or radio with verification
  toggleCheckbox: async (params) => {
    const startTime = Date.now();
    const selectors = params.selectors || [params.selector];
    let lastAttemptError = null;
    let lastVerification = null;

    for (let selectorIndex = 0; selectorIndex < selectors.length; selectorIndex++) {
      const currentSelector = selectors[selectorIndex];
      try {
        let element = FSB.querySelectorWithShadow(currentSelector);
        if (!element || (element.type !== 'checkbox' && element.type !== 'radio')) { lastAttemptError = `Checkbox/radio element not found with selector: ${currentSelector}`; continue; }

        // Binary state pre-check: skip if already in target state
        if (params.checked !== undefined) {
          const targetIntent = params.checked ? 'check' : 'uncheck';
          const stateCheck = checkBinaryState(element, targetIntent);
          if (!stateCheck.shouldAct) {
            return {
              success: true,
              action: 'toggleCheckbox',
              alreadyInState: true,
              checked: element.checked,
              message: `Already ${targetIntent}ed (${stateCheck.attribute}=${stateCheck.currentState})`,
              selector: currentSelector
            };
          }
        }

        const readiness = await FSB.smartEnsureReady(element, 'toggleCheckbox');
        if (!readiness.ready) { lastAttemptError = `Element not ready: ${readiness.failureReason}`; continue; }
        if (readiness.scrolled) { element = FSB.querySelectorWithShadow(currentSelector); if (!element) { lastAttemptError = 'Element became stale after scrolling'; continue; } }

        const preState = captureActionState(element, 'toggleCheckbox');
        if (params.checked !== undefined) { element.checked = params.checked; } else { element.checked = !element.checked; }
        element.dispatchEvent(new Event('change', { bubbles: true }));
        await waitForPageStability({ maxWait: 1000, stableTime: 200 });

        const postState = captureActionState(element, 'toggleCheckbox');
        const verification = verifyActionEffect(preState, postState, 'toggleCheckbox');
        lastVerification = verification;
        if (!verification.verified) { lastAttemptError = `Toggle had no verified effect: ${verification.reason}`; continue; }

        actionRecorder.record(null, 'toggleCheckbox', params, { selectorTried: selectors[0], selectorUsed: currentSelector, elementFound: true, elementDetails: captureElementDetails(element), success: true, hadEffect: true, verification: verification, duration: Date.now() - startTime });
        return { success: true, checked: element.checked, selector: currentSelector, selectorIndex, usedFallback: selectorIndex > 0, hadEffect: true, verification: { verified: verification.verified, reason: verification.reason, changes: verification.changes } };
      } catch (error) { lastAttemptError = error.message; }
    }

    actionRecorder.record(null, 'toggleCheckbox', params, { selectorTried: selectors[0], selectorUsed: null, elementFound: false, success: false, error: lastAttemptError || 'Toggle had no effect with any available selector', diagnostic: generateDiagnostic('noEffect', { selector: selectors[0] }), duration: Date.now() - startTime });
    return buildFailureReport('toggleCheckbox', selectors[0], null, lastAttemptError || 'Toggle had no effect with any available selector');
  },

  refresh: () => { window.location.reload(); return { success: true, action: 'page refresh initiated' }; },
  goBack: () => { window.history.back(); return { success: true, action: 'navigated back' }; },
  goForward: () => { window.history.forward(); return { success: true, action: 'navigated forward' }; },

  getText: (params) => {
    const element = FSB.querySelectorWithShadow(params.selector);
    if (element) {
      const textValue = element.innerText || element.textContent || element.value || '';
      return { success: true, text: textValue, value: textValue };
    }
    return { success: false, error: 'Element not found' };
  },

  readPage: (params) => {
    try {
      const fullMode = params.full === true;
      const selectorArg = params.selector || null;
      const root = selectorArg ? document.querySelector(selectorArg) : document.body;

      if (selectorArg && !root) {
        return { success: false, error: 'Selector not found: ' + selectorArg };
      }

      const text = FSB.extractPageText(root || document.body, {
        viewportOnly: !fullMode,
        format: 'markdown-lite'
      });

      if (!text || text.trim().length === 0) {
        return { success: true, text: '[No readable text content on page]', charCount: 0 };
      }
      return { success: true, text, charCount: text.length };
    } catch (err) {
      return { success: false, error: 'readPage failed: ' + err.message };
    }
  },

  getEditorContent: (params) => {
    const viewLines = document.querySelector('.view-lines');
    if (viewLines) { const lines = viewLines.querySelectorAll('.view-line'); const content = Array.from(lines).map(line => line.textContent).join('\n'); return { success: true, content, method: 'monacoViewLines', lineCount: lines.length }; }
    const editorSelector = params?.selector || '[role="textbox"]';
    const editor = document.querySelector(editorSelector);
    if (editor) { const content = editor.innerText || editor.textContent || ''; return { success: true, content, method: 'contenteditable', lineCount: content.split('\n').length }; }
    const cmContent = document.querySelector('.cm-content');
    if (cmContent) { const content = cmContent.innerText || cmContent.textContent || ''; return { success: true, content, method: 'codeMirror', lineCount: content.split('\n').length }; }
    const aceContent = document.querySelector('.ace_text-layer');
    if (aceContent) { const content = aceContent.innerText || aceContent.textContent || ''; return { success: true, content, method: 'aceEditor', lineCount: content.split('\n').length }; }
    const codeTextarea = document.querySelector('.monaco-editor textarea, .CodeMirror textarea, .ace_editor textarea');
    if (codeTextarea && codeTextarea.value) { return { success: true, content: codeTextarea.value, method: 'editorTextarea', lineCount: codeTextarea.value.split('\n').length }; }
    return { success: false, error: 'No code editor content found on page' };
  },

  getAttribute: (params) => {
    const element = FSB.querySelectorWithShadow(params.selector);
    if (element) { return { success: true, attribute: params.attribute, value: element.getAttribute(params.attribute) }; }
    return { success: false, error: 'Element not found' };
  },

  setAttribute: (params) => {
    const element = FSB.querySelectorWithShadow(params.selector);
    if (element) { element.setAttribute(params.attribute, params.value); return { success: true, attribute: params.attribute, value: params.value }; }
    return { success: false, error: 'Element not found' };
  },

  clearInput: (params) => {
    const startTime = Date.now();
    const element = FSB.querySelectorWithShadow(params.selector);
    if (element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) {
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      actionRecorder.record(null, 'clearInput', params, { selectorTried: params.selector, selectorUsed: params.selector, elementFound: true, elementDetails: captureElementDetails(element), success: true, hadEffect: true, duration: Date.now() - startTime });
      return { success: true, cleared: params.selector };
    }
    actionRecorder.record(null, 'clearInput', params, { selectorTried: params.selector, elementFound: false, success: false, error: 'Input element not found', diagnostic: generateDiagnostic('elementNotFound', { selector: params.selector }), duration: Date.now() - startTime });
    return { success: false, error: 'Input element not found' };
  },

  // Multi-tab management tools
  openNewTab: async (params) => {
    const url = params.url || 'about:blank';
    try { const response = await chrome.runtime.sendMessage({ action: 'openNewTab', url: url, active: params.active !== false }); if (response.success) { return { success: true, tabId: response.tabId, url: url, active: params.active !== false }; } else { return { success: false, error: response.error || 'Failed to open new tab' }; } } catch (error) { return { success: false, error: `Failed to communicate with background script: ${error.message}` }; }
  },

  switchToTab: async (params) => {
    const tabId = params.tabId;
    if (!tabId) { return { success: false, error: 'Tab ID is required' }; }
    try { const response = await chrome.runtime.sendMessage({ action: 'switchToTab', tabId: tabId }); if (response.success) { return { success: true, tabId: tabId, previousTab: response.previousTab }; } else { return { success: false, error: response.error || 'Failed to switch to tab' }; } } catch (error) { return { success: false, error: `Failed to communicate with background script: ${error.message}` }; }
  },

  closeTab: async (params) => {
    const tabId = params.tabId;
    if (!tabId) { return { success: false, error: 'Tab ID is required' }; }
    try { const response = await chrome.runtime.sendMessage({ action: 'closeTab', tabId: tabId }); if (response.success) { return { success: true, tabId: tabId, closed: true }; } else { return { success: false, error: response.error || 'Failed to close tab' }; } } catch (error) { return { success: false, error: `Failed to communicate with background script: ${error.message}` }; }
  },

  listTabs: async (params) => {
    try { const response = await chrome.runtime.sendMessage({ action: 'listTabs', currentWindowOnly: params.currentWindowOnly !== false }); if (response.success) { return { success: true, tabs: response.tabs, currentTab: response.currentTab, totalTabs: response.tabs.length }; } else { return { success: false, error: response.error || 'Failed to list tabs' }; } } catch (error) { return { success: false, error: `Failed to communicate with background script: ${error.message}` }; }
  },

  getCurrentTab: async (params) => {
    try { const response = await chrome.runtime.sendMessage({ action: 'getCurrentTab' }); if (response.success) { return { success: true, tabId: response.tab.id, url: response.tab.url, title: response.tab.title, active: response.tab.active, tab: response.tab }; } else { return { success: false, error: response.error || 'Failed to get current tab info' }; } } catch (error) { return { success: false, error: `Failed to communicate with background script: ${error.message}` }; }
  },

  waitForTabLoad: async (params) => {
    const tabId = params.tabId;
    const timeout = params.timeout || 30000;
    if (!tabId) { return { success: false, error: 'Tab ID is required' }; }
    try { const response = await chrome.runtime.sendMessage({ action: 'waitForTabLoad', tabId: tabId, timeout: timeout }); if (response.success) { return { success: true, tabId: tabId, loaded: true, url: response.url, loadTime: response.loadTime }; } else { return { success: false, error: response.error || 'Tab failed to load within timeout' }; } } catch (error) { return { success: false, error: `Failed to communicate with background script: ${error.message}` }; }
  },

  // Game controls helper
  gameControl: async (params) => {
    const { action } = params;
    const gameKeyMap = { 'start': 'Enter', 'enter': 'Enter', 'up': 'ArrowUp', 'down': 'ArrowDown', 'left': 'ArrowLeft', 'right': 'ArrowRight', 'fire': ' ', 'shoot': ' ', 'jump': ' ', 'thrust': 'ArrowUp', 'hyperspace': 'Shift', 'pause': 'Escape' };
    const key = gameKeyMap[action.toLowerCase()] || action;
    const gameTargets = ['canvas', 'iframe[src*="game"]', 'div[id*="game"]', 'div[class*="game"]', 'body'];
    let targetElement = null;
    for (const selector of gameTargets) { targetElement = document.querySelector(selector); if (targetElement) break; }
    if (targetElement && targetElement !== document.body) { targetElement.focus(); await waitForStability('light'); }
    const result = await tools.keyPress({ key: key, useDebuggerAPI: true });
    return { success: result.success, action: action, key: key, targetElement: targetElement ? targetElement.tagName : 'body', gameControlUsed: true, result: result };
  },

  arrowUp: async (params = {}) => { return await tools.keyPress({ key: 'ArrowUp', useDebuggerAPI: true, ...params }); },
  arrowDown: async (params = {}) => { return await tools.keyPress({ key: 'ArrowDown', useDebuggerAPI: true, ...params }); },
  arrowLeft: async (params = {}) => { return await tools.keyPress({ key: 'ArrowLeft', useDebuggerAPI: true, ...params }); },
  arrowRight: async (params = {}) => { return await tools.keyPress({ key: 'ArrowRight', useDebuggerAPI: true, ...params }); },

  // =========================================================================
  // GOOGLE SHEETS: fillsheet — mechanical CSV data entry
  // AI generates data, this tool handles the cell-by-cell typing deterministically
  // =========================================================================
  fillsheet: async (params) => {
    const { startCell, data, sheetName } = params;
    if (!data || typeof data !== 'string') {
      return { success: false, error: 'data parameter is required (CSV string)' };
    }
    if (!startCell || typeof startCell !== 'string') {
      return { success: false, error: 'startCell parameter is required (e.g., "A1")' };
    }

    // Verify we're on Google Sheets
    if (!FSB.isCanvasBasedEditor || !FSB.isCanvasBasedEditor()) {
      return { success: false, error: 'fillsheet only works on Google Sheets (canvas-based editor not detected)' };
    }

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Parse CSV with basic quoting support
    function parseCSV(csvText) {
      const rows = [];
      let current = '';
      let inQuotes = false;
      const chars = csvText.split('');
      let row = [];

      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (ch === '"' && (i === 0 || chars[i - 1] !== '\\')) {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          row.push(current.trim());
          current = '';
        } else if (ch === '\n' && !inQuotes) {
          row.push(current.trim());
          if (row.length > 0 && row.some(c => c !== '')) rows.push(row);
          row = [];
          current = '';
        } else if (ch === '\\' && i + 1 < chars.length && chars[i + 1] === 'n' && !inQuotes) {
          // Handle literal \n in unquoted context as newline
          row.push(current.trim());
          if (row.length > 0 && row.some(c => c !== '')) rows.push(row);
          row = [];
          current = '';
          i++; // skip 'n'
        } else {
          current += ch;
        }
      }
      // Last cell
      row.push(current.trim());
      if (row.length > 0 && row.some(c => c !== '')) rows.push(row);
      return rows;
    }

    const rows = parseCSV(data);
    if (rows.length === 0) {
      return { success: false, error: 'No data rows parsed from CSV' };
    }

    const totalCells = rows.reduce((sum, r) => sum + r.length, 0);
    console.info(`[fillsheet] Starting: ${rows.length} rows, ${rows[0]?.length || 0} cols, ${totalCells} cells from ${startCell}`);

    try {
      // Step 1: Exit any edit mode
      await tools.keyPress({ key: 'Escape', useDebuggerAPI: true });
      await delay(100);

      // Step 2: Navigate to start cell via Name Box
      const nameBox = document.querySelector('#t-name-box');
      if (!nameBox) {
        return { success: false, error: 'Name Box (#t-name-box) not found — not on a Google Sheets page?' };
      }

      // Click Name Box
      nameBox.focus();
      nameBox.click();
      await delay(100);

      // Select all text in Name Box and type the cell reference
      await tools.keyPress({ key: 'a', ctrlKey: true, useDebuggerAPI: true });
      await delay(50);
      await tools.typeWithKeys({ text: startCell, clearFirst: false, delay: 20 });
      await delay(50);

      // Press Enter to navigate
      await tools.keyPress({ key: 'Enter', useDebuggerAPI: true });
      await delay(200);

      // Step 2b: Rename spreadsheet if sheetName provided
      if (sheetName) {
        try {
          const titleEl = document.querySelector('.docs-title-input, #docs-title-input, input[aria-label*="Rename" i], .docs-title-widget input');
          if (titleEl) {
            // Focus then click to enter edit mode (both needed for Sheets title input)
            titleEl.focus();
            await delay(100);
            titleEl.click();
            await delay(300);
            // Use native .select() for input elements — more reliable than Ctrl+A via Debugger API
            if (typeof titleEl.select === 'function') {
              titleEl.select();
            } else {
              await tools.keyPress({ key: 'a', ctrlKey: true, useDebuggerAPI: true });
            }
            await delay(100);
            await tools.typeWithKeys({ text: sheetName, clearFirst: false, delay: 20 });
            await delay(100);
            await tools.keyPress({ key: 'Enter', useDebuggerAPI: true });
            await delay(500);
            // Re-navigate to start cell after rename (focus may have shifted)
            nameBox.focus();
            nameBox.click();
            await delay(100);
            await tools.keyPress({ key: 'a', ctrlKey: true, useDebuggerAPI: true });
            await delay(50);
            await tools.typeWithKeys({ text: startCell, clearFirst: false, delay: 20 });
            await delay(50);
            await tools.keyPress({ key: 'Enter', useDebuggerAPI: true });
            await delay(200);
          }
        } catch (nameErr) {
          console.warn('[fillsheet] Sheet rename failed (non-fatal):', nameErr.message);
        }
      }

      // Step 3: Type data cell by cell
      let cellsFilled = 0;
      let errors = [];

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        for (let c = 0; c < row.length; c++) {
          const value = row[c];
          if (value !== '') {
            // Sanitize: prefix with space if starts with = + - @ to prevent formula injection
            const safeValue = /^[=+\-@]/.test(value) ? ' ' + value : value;
            const typeResult = await tools.typeWithKeys({ text: safeValue, clearFirst: false, delay: 15 });
            if (!typeResult.success) {
              errors.push({ row: r, col: c, value, error: typeResult.error });
            }
          }
          cellsFilled++;

          // Move to next cell
          if (c < row.length - 1) {
            // Tab = next column
            await tools.keyPress({ key: 'Tab', useDebuggerAPI: true });
            await delay(30);
          }
        }
        // Enter = next row (Sheets moves to column A of next row after Enter from last Tab position)
        // First press Enter to confirm current cell, then position for next row
        if (r < rows.length - 1) {
          await tools.keyPress({ key: 'Enter', useDebuggerAPI: true });
          await delay(50);

          // Navigate to the start column of the next row via Name Box
          // Calculate the next row's start cell
          const colLetter = startCell.replace(/[0-9]/g, '');
          const startRow = parseInt(startCell.replace(/[A-Za-z]/g, ''), 10);
          const nextCell = colLetter + (startRow + r + 1);
          nameBox.focus();
          nameBox.click();
          await delay(80);
          await tools.keyPress({ key: 'a', ctrlKey: true, useDebuggerAPI: true });
          await delay(30);
          await tools.typeWithKeys({ text: nextCell, clearFirst: false, delay: 20 });
          await delay(30);
          await tools.keyPress({ key: 'Enter', useDebuggerAPI: true });
          await delay(150);
        }
      }

      // Final Enter to confirm last cell
      await tools.keyPress({ key: 'Enter', useDebuggerAPI: true });
      await delay(100);

      console.info(`[fillsheet] Complete: ${cellsFilled} cells filled, ${errors.length} errors`);

      // Step 4: Auto-format header row (bold) if there are headers + data rows
      if (rows.length > 1) {
        try {
          // Navigate back to start cell
          nameBox.focus();
          nameBox.click();
          await delay(80);
          await tools.keyPress({ key: 'a', ctrlKey: true, useDebuggerAPI: true });
          await delay(30);
          await tools.typeWithKeys({ text: startCell, clearFirst: false, delay: 20 });
          await delay(30);
          await tools.keyPress({ key: 'Enter', useDebuggerAPI: true });
          await delay(150);

          // Select header row (Shift+Ctrl+Right to select to last data column)
          await tools.keyPress({ key: 'ArrowRight', shiftKey: true, ctrlKey: true, useDebuggerAPI: true });
          await delay(50);

          // Bold the selection
          await tools.keyPress({ key: 'b', ctrlKey: true, useDebuggerAPI: true });
          await delay(50);

          // Press Escape to deselect
          await tools.keyPress({ key: 'Escape', useDebuggerAPI: true });
        } catch (fmtErr) {
          console.warn('[fillsheet] Header formatting failed (non-fatal):', fmtErr.message);
        }
      }

      return {
        success: errors.length === 0,
        action: 'fillsheet',
        startCell,
        rows: rows.length,
        cols: rows[0]?.length || 0,
        cellsFilled,
        errors: errors.length > 0 ? errors : undefined,
        hadEffect: true
      };
    } catch (error) {
      return { success: false, error: error.message, action: 'fillsheet' };
    }
  },

  // =========================================================================
  // GOOGLE SHEETS: readsheet — read cell range via Name Box + formula bar
  // Returns CSV of existing data for AI to see what's already in the sheet
  // =========================================================================
  readsheet: async (params) => {
    const { range } = params;
    if (!range || typeof range !== 'string') {
      return { success: false, error: 'range parameter is required (e.g., "A1:C5")' };
    }

    if (!FSB.isCanvasBasedEditor || !FSB.isCanvasBasedEditor()) {
      return { success: false, error: 'readsheet only works on Google Sheets' };
    }

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Parse range like "A1:C5" into start/end
    const rangeMatch = range.match(/^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/);
    if (!rangeMatch) {
      return { success: false, error: 'Invalid range format. Use "A1:C5" style.' };
    }

    function colToNum(col) {
      let num = 0;
      for (let i = 0; i < col.length; i++) {
        num = num * 26 + (col.toUpperCase().charCodeAt(i) - 64);
      }
      return num;
    }

    function numToCol(num) {
      let col = '';
      while (num > 0) {
        const rem = (num - 1) % 26;
        col = String.fromCharCode(65 + rem) + col;
        num = Math.floor((num - 1) / 26);
      }
      return col;
    }

    const startCol = colToNum(rangeMatch[1]);
    const startRow = parseInt(rangeMatch[2], 10);
    const endCol = colToNum(rangeMatch[3]);
    const endRow = parseInt(rangeMatch[4], 10);

    if (endRow - startRow > 50 || endCol - startCol > 26) {
      return { success: false, error: 'Range too large. Max 50 rows x 26 columns.' };
    }

    const nameBox = document.querySelector('#t-name-box');
    if (!nameBox) {
      return { success: false, error: 'Name Box not found' };
    }

    // Find formula bar element for reading values
    const formulaBarSelectors = ['#t-formula-bar-input', '.cell-input', '[aria-label="Formula bar"]'];

    function getFormulaBarContent() {
      for (const sel of formulaBarSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          // Try multiple reading strategies
          const editable = el.querySelector('[contenteditable="true"]');
          if (editable) {
            const text = (editable.innerText || editable.textContent || '').trim();
            if (text) return text;
          }
          const direct = (el.innerText || el.textContent || '').trim();
          if (direct) return direct;
          // Check parent for display siblings
          const parent = el.parentElement;
          if (parent) {
            const display = parent.querySelector('.cell-input, [aria-label*="formula"]');
            if (display && display !== el) {
              return (display.innerText || display.textContent || '').trim();
            }
          }
        }
      }
      return '';
    }

    try {
      // Exit edit mode first
      await tools.keyPress({ key: 'Escape', useDebuggerAPI: true });
      await delay(100);

      const csvRows = [];
      const totalCells = (endRow - startRow + 1) * (endCol - startCol + 1);
      console.info(`[readsheet] Reading ${range}: ${endRow - startRow + 1} rows x ${endCol - startCol + 1} cols = ${totalCells} cells`);

      for (let r = startRow; r <= endRow; r++) {
        const rowValues = [];
        for (let c = startCol; c <= endCol; c++) {
          const cellRef = numToCol(c) + r;

          // Navigate to cell via Name Box
          nameBox.focus();
          nameBox.click();
          await delay(60);
          await tools.keyPress({ key: 'a', ctrlKey: true, useDebuggerAPI: true });
          await delay(30);
          await tools.typeWithKeys({ text: cellRef, clearFirst: false, delay: 15 });
          await delay(30);
          await tools.keyPress({ key: 'Enter', useDebuggerAPI: true });
          await delay(150);

          // Read formula bar content
          const value = getFormulaBarContent();
          rowValues.push(value);
        }
        csvRows.push(rowValues.join(','));
      }

      const csvResult = csvRows.join('\n');
      console.info(`[readsheet] Complete: read ${totalCells} cells`);

      return {
        success: true,
        action: 'readsheet',
        range,
        rows: endRow - startRow + 1,
        cols: endCol - startCol + 1,
        data: csvResult,
        hadEffect: false
      };
    } catch (error) {
      return { success: false, error: error.message, action: 'readsheet' };
    }
  },

  // =========================================================================
  // DRAG-AND-DROP: dragdrop — mechanical drag simulation with 3 fallback methods
  // Tries HTML5 DragEvent, PointerEvent sequence, MouseEvent sequence in order.
  // Returns { success, method } on success or { success: false, error } on failure.
  // =========================================================================
  dragdrop: async (params) => {
    const { sourceRef, targetRef, steps: userSteps, holdMs: userHoldMs, stepDelayMs: userStepDelayMs } = params;

    if (!sourceRef || !targetRef) {
      return { success: false, error: 'sourceRef and targetRef are required (element references, e.g., "e5" and "e12")', action: 'dragdrop' };
    }

    // Resolve element references through FSB's element map
    const source = typeof sourceRef === 'string' ? FSB.getElementByRef?.(sourceRef) || document.querySelector(`[data-fsb-ref="${sourceRef}"]`) : sourceRef;
    const target = typeof targetRef === 'string' ? FSB.getElementByRef?.(targetRef) || document.querySelector(`[data-fsb-ref="${targetRef}"]`) : targetRef;

    if (!source) {
      return { success: false, error: `Source element not found: ${sourceRef}`, action: 'dragdrop' };
    }
    if (!target) {
      return { success: false, error: `Target element not found: ${targetRef}`, action: 'dragdrop' };
    }

    const steps = userSteps || 10;
    const holdMs = userHoldMs || 150;
    const stepDelayMs = userStepDelayMs || 20;
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Snapshot DOM state for change detection
    function snapshotState() {
      const sourceParent = source.parentElement;
      const targetParent = target.parentElement;
      return {
        sourceIndex: sourceParent ? Array.from(sourceParent.children).indexOf(source) : -1,
        sourceParentChildCount: sourceParent ? sourceParent.children.length : 0,
        targetParentChildCount: targetParent ? targetParent.children.length : 0,
        sourceInDOM: document.contains(source),
        sourceParentId: sourceParent ? (sourceParent.id || sourceParent.dataset?.testid || '') : '',
        targetParentId: targetParent ? (targetParent.id || targetParent.dataset?.testid || '') : ''
      };
    }

    function detectChange(before, after) {
      // Source moved out of its original parent
      if (before.sourceParentChildCount !== after.sourceParentChildCount) return true;
      // Target parent gained a child
      if (before.targetParentChildCount !== after.targetParentChildCount) return true;
      // Source index within parent changed
      if (before.sourceIndex !== after.sourceIndex) return true;
      // Source removed from DOM entirely (some drag libs re-render)
      if (before.sourceInDOM && !after.sourceInDOM) return true;
      return false;
    }

    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const startX = sourceRect.left + sourceRect.width / 2;
    const startY = sourceRect.top + sourceRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    // -----------------------------------------------------------------------
    // Method 1: HTML5 DragEvent sequence
    // -----------------------------------------------------------------------
    try {
      const before = snapshotState();
      const dt = new DataTransfer();

      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      await delay(50);
      target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      await delay(50);
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
      await delay(100);

      const after = snapshotState();
      if (detectChange(before, after)) {
        logger.log('info', 'dragdrop succeeded with HTML5 DragEvent', { sessionId: FSB.sessionId, method: 'html5_drag' });
        return { success: true, method: 'html5_drag', action: 'dragdrop', hadEffect: true };
      }
    } catch (e) {
      // Method 1 failed, continue to Method 2
    }

    // -----------------------------------------------------------------------
    // Method 2: PointerEvent sequence (works for react-beautiful-dnd and similar)
    // -----------------------------------------------------------------------
    try {
      const before = snapshotState();

      source.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, clientX: startX, clientY: startY, pointerId: 1,
        button: 0, buttons: 1, pointerType: 'mouse'
      }));
      await delay(holdMs);

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = startX + (endX - startX) * t;
        const y = startY + (endY - startY) * t;
        document.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1,
          button: 0, buttons: 1, pointerType: 'mouse'
        }));
        await delay(stepDelayMs);
      }

      document.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, clientX: endX, clientY: endY, pointerId: 1,
        button: 0, buttons: 0, pointerType: 'mouse'
      }));
      await delay(200);

      const after = snapshotState();
      if (detectChange(before, after)) {
        logger.log('info', 'dragdrop succeeded with PointerEvent sequence', { sessionId: FSB.sessionId, method: 'pointer_events' });
        return { success: true, method: 'pointer_events', action: 'dragdrop', hadEffect: true };
      }
    } catch (e) {
      // Method 2 failed, continue to Method 3
    }

    // -----------------------------------------------------------------------
    // Method 3: MouseEvent sequence (fallback for basic drag implementations)
    // -----------------------------------------------------------------------
    try {
      const before = snapshotState();

      source.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true, clientX: startX, clientY: startY,
        button: 0, buttons: 1, view: window
      }));
      await delay(holdMs);

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = startX + (endX - startX) * t;
        const y = startY + (endY - startY) * t;
        document.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true, cancelable: true, clientX: x, clientY: y,
          button: 0, buttons: 1, view: window
        }));
        await delay(stepDelayMs);
      }

      document.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true, cancelable: true, clientX: endX, clientY: endY,
        button: 0, buttons: 0, view: window
      }));
      await delay(200);

      const after = snapshotState();
      if (detectChange(before, after)) {
        logger.log('info', 'dragdrop succeeded with MouseEvent sequence', { sessionId: FSB.sessionId, method: 'mouse_events' });
        return { success: true, method: 'mouse_events', action: 'dragdrop', hadEffect: true };
      }
    } catch (e) {
      // Method 3 failed
    }

    // All methods exhausted
    logger.log('warn', 'dragdrop: all three methods failed', { sessionId: FSB.sessionId, sourceRef, targetRef });
    return { success: false, error: 'All drag methods failed - use keyboard move alternative', action: 'dragdrop', hadEffect: false };
  }
};

  // =========================================================================
  // DROP FILE: dropfile -- simulate file drop onto a dropzone element
  // Creates a synthetic File in a DataTransfer object and dispatches
  // dragenter, dragover, drop events on the target element.
  // Works with Dropzone.js, react-dropzone, native HTML5 drop handlers.
  // =========================================================================
  tools.dropfile = async (params) => {
    const { selector, fileName, fileContent, mimeType } = params;

    if (!selector) {
      return { success: false, error: 'selector is required (CSS selector for the dropzone element)', action: 'dropfile' };
    }

    const name = fileName || 'test-upload.txt';
    const content = fileContent || 'FSB automated file upload test content.';
    const type = mimeType || 'text/plain';

    // Resolve element
    const element = FSB.querySelectorWithShadow(selector);
    if (!element) {
      return buildFailureReport('dropfile', selector, null, 'Dropzone element not found');
    }

    try {
      // Create a real File object
      const file = new File([content], name, { type, lastModified: Date.now() });

      // Create DataTransfer with the file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Dispatch the full drag-and-drop event sequence on the target
      // 1. dragenter -- signals a drag has entered the dropzone
      element.dispatchEvent(new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
        dataTransfer
      }));

      // 2. dragover -- must be dispatched and default prevented for drop to work
      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer
      });
      element.dispatchEvent(dragOverEvent);

      // Small delay to let dropzone libraries process dragenter/dragover
      await new Promise(resolve => setTimeout(resolve, 100));

      // 3. drop -- the actual file drop event
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer
      });
      element.dispatchEvent(dropEvent);

      // 4. dragleave -- cleanup signal
      element.dispatchEvent(new DragEvent('dragleave', {
        bubbles: true,
        cancelable: true,
        dataTransfer
      }));

      // Wait for the dropzone to process the file
      await waitForStability('dropfile');

      // Check for success indicators: file name appearing in DOM, progress bar, upload status
      const dropzoneText = element.textContent || element.innerText || '';
      const parentText = element.parentElement ? (element.parentElement.textContent || '') : '';
      const nameWithoutExt = name.replace(/\.[^.]+$/, '');
      const fileNameVisible = dropzoneText.includes(name) || dropzoneText.includes(nameWithoutExt) ||
                              parentText.includes(name) || parentText.includes(nameWithoutExt);

      // Check if a file input was populated as a side effect
      const nearbyInputs = element.querySelectorAll('input[type="file"]');
      const inputPopulated = Array.from(nearbyInputs).some(inp => inp.files && inp.files.length > 0);

      logger.log('info', 'dropfile dispatched DragEvent sequence', {
        sessionId: FSB.sessionId,
        selector,
        fileName: name,
        mimeType: type,
        contentLength: content.length,
        fileNameVisible,
        inputPopulated
      });

      return {
        success: true,
        action: 'dropfile',
        fileName: name,
        mimeType: type,
        contentLength: content.length,
        fileNameVisible,
        inputPopulated,
        note: fileNameVisible ? 'File name detected in dropzone area after drop' :
              inputPopulated ? 'File input populated after drop' :
              'DragEvent sequence dispatched -- verify file acceptance via DOM snapshot'
      };
    } catch (e) {
      logger.log('error', 'dropfile failed', { sessionId: FSB.sessionId, error: e.message, selector });
      return { success: false, error: `dropfile failed: ${e.message}`, action: 'dropfile', selector };
    }
  };

  // =========================================================================
  // NAMESPACE EXPORTS
  // =========================================================================
  FSB.validateCoordinates = validateCoordinates;
  FSB.ensureCoordinatesVisible = ensureCoordinatesVisible;
  // =========================================================================
  // CHECK / UNCHECK: Generic ARIA-based intent commands
  // These enforce a target state (checked or unchecked) without toggling.
  // Uses checkBinaryState() to skip if already in target state.
  // Works with any ARIA-compatible checkbox, toggle, or switch.
  // CLI registration: check and uncheck are auto-discovered from the tools object.
  // =========================================================================
  tools.check = async (params) => {
    const selectors = params.selectors || [params.selector];
    let element = null;
    let selectorUsed = null;

    for (const sel of selectors) {
      element = FSB.querySelectorWithShadow(sel);
      if (element) { selectorUsed = sel; break; }
    }

    if (!element) {
      return buildFailureReport('check', params.selector, null, 'Element not found');
    }

    const stateCheck = checkBinaryState(element, 'check');
    if (!stateCheck.shouldAct) {
      return { success: true, action: 'check', alreadyInState: true, message: 'Already checked', selector: selectorUsed };
    }

    // Capture pre-state for verification
    const preState = captureActionState(element, 'click');

    // Perform the check action
    if (element.type === 'checkbox' || element.type === 'radio') {
      element.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      element.click();
    }
    await waitForStability('light');

    // Verify it's now checked
    const postCheck = checkBinaryState(element, 'check');
    const postState = captureActionState(element, 'click');
    const verification = verifyActionEffect(preState, postState, 'click');

    return {
      success: !postCheck.shouldAct,
      action: 'check',
      toggled: true,
      verified: !postCheck.shouldAct,
      selector: selectorUsed,
      verification: {
        confidence: verification.confidence,
        whatChanged: verification.whatChanged,
        localChanges: verification.localChanges
      }
    };
  };

  tools.uncheck = async (params) => {
    const selectors = params.selectors || [params.selector];
    let element = null;
    let selectorUsed = null;

    for (const sel of selectors) {
      element = FSB.querySelectorWithShadow(sel);
      if (element) { selectorUsed = sel; break; }
    }

    if (!element) {
      return buildFailureReport('uncheck', params.selector, null, 'Element not found');
    }

    const stateCheck = checkBinaryState(element, 'uncheck');
    if (!stateCheck.shouldAct) {
      return { success: true, action: 'uncheck', alreadyInState: true, message: 'Already unchecked', selector: selectorUsed };
    }

    // Capture pre-state for verification
    const preState = captureActionState(element, 'click');

    // Perform the uncheck action
    if (element.type === 'checkbox') {
      element.checked = false;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      element.click();
    }
    await waitForStability('light');

    // Verify it's now unchecked
    const postCheck = checkBinaryState(element, 'uncheck');
    const postState = captureActionState(element, 'click');
    const verification = verifyActionEffect(preState, postState, 'click');

    return {
      success: !postCheck.shouldAct,
      action: 'uncheck',
      toggled: true,
      verified: !postCheck.shouldAct,
      selector: selectorUsed,
      verification: {
        confidence: verification.confidence,
        whatChanged: verification.whatChanged,
        localChanges: verification.localChanges
      }
    };
  };

  // =========================================================================
  // TOGGLECHECK: Notion-aware checkbox toggle
  //
  // Strategy 1: Find the checkbox element inside .notion-to_do-block and .click() it
  // Strategy 2: CDP mouse click at checkbox coordinates (left edge of block)
  // NO Strategy 3 (keyboard Escape→Ctrl+Enter) — it has side effects that uncheck OTHER blocks
  //
  // IMPORTANT: Filters out empty spacer blocks. Notion renders empty .notion-to_do-block
  // elements between real todos. Only blocks with text content are counted.
  // =========================================================================
  tools.togglecheck = async (params) => {
    const { index } = params;
    const idx = (typeof index === 'number' && index >= 1) ? index : 1;

    // Filter out empty spacer blocks — only count blocks with actual text content
    const allBlocks = document.querySelectorAll('.notion-selectable.notion-to_do-block');
    const todoBlocks = Array.from(allBlocks).filter(b => b.textContent?.trim().length > 0);

    if (!todoBlocks.length) {
      return { success: false, error: `No Notion todo blocks with text found (${allBlocks.length} empty blocks skipped)`, action: 'togglecheck' };
    }
    if (idx > todoBlocks.length) {
      return { success: false, error: `Todo index ${idx} out of range (found ${todoBlocks.length} todos, ${allBlocks.length - todoBlocks.length} empty blocks skipped)`, action: 'togglecheck' };
    }

    const block = todoBlocks[idx - 1];
    const text = block.textContent?.trim()?.substring(0, 60) || '(empty)';
    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    console.log(`[FSB togglecheck] Starting toggle for todo ${idx}/${todoBlocks.length}: "${text}" (${allBlocks.length - todoBlocks.length} empty blocks filtered out)`);

    block.scrollIntoView({ block: 'center', behavior: 'instant' });
    await delay(150);

    // Pre-state: check strikethrough on the textbox
    const textEl = block.querySelector('[role="textbox"]') || block;
    const getStrike = () => window.getComputedStyle(textEl).textDecorationLine?.includes('line-through') || false;
    const preStrike = getStrike();

    // IDEMPOTENT: If already checked, skip — don't uncheck
    // The AI may call togglecheck multiple times to "verify". Without this guard,
    // repeated calls create a check→uncheck→check cycle.
    if (preStrike) {
      console.log(`[FSB togglecheck] Todo ${idx} already checked (strikethrough detected), skipping`);
      return {
        success: true,
        action: 'togglecheck',
        todoIndex: idx,
        todoText: text,
        totalTodos: todoBlocks.length,
        skippedEmpty: allBlocks.length - todoBlocks.length,
        alreadyChecked: true,
        wasChecked: true,
        nowChecked: true,
        toggled: false,
        method: 'skipped_already_checked'
      };
    }

    // ---- STRATEGY 1: Find and .click() the checkbox element directly ----
    let method = 'none';

    const candidates = [
      block.querySelector('[role="checkbox"]'),
      block.querySelector('div[contenteditable="false"]'),
      ...Array.from(block.children).filter(c =>
        c.tagName === 'DIV' && c.getAttribute('role') !== 'textbox' && !c.querySelector('[role="textbox"]')
      ),
      block.firstElementChild?.firstElementChild,
    ].filter(Boolean);

    const seen = new Set();
    const uniqueCandidates = candidates.filter(c => { if (seen.has(c)) return false; seen.add(c); return true; });

    for (const candidate of uniqueCandidates) {
      const cRect = candidate.getBoundingClientRect();
      if (cRect.width > 40 || cRect.height > 40) continue;
      if (cRect.width === 0 || cRect.height === 0) continue;

      candidate.click();
      await delay(400);
      if (getStrike() !== preStrike) { method = 'direct_click'; break; }

      const cCenter = { x: cRect.left + cRect.width / 2, y: cRect.top + cRect.height / 2 };
      const mInit = { bubbles: true, cancelable: true, view: window, clientX: cCenter.x, clientY: cCenter.y, button: 0, buttons: 1 };
      candidate.dispatchEvent(new MouseEvent('mousedown', mInit));
      candidate.dispatchEvent(new MouseEvent('mouseup', mInit));
      candidate.dispatchEvent(new MouseEvent('click', mInit));
      await delay(400);
      if (getStrike() !== preStrike) { method = 'dispatch_click'; break; }
    }

    // ---- STRATEGY 2: CDP mouse click at checkbox coordinates ----
    if (method === 'none') {
      const blockRect = block.getBoundingClientRect();
      const cbX = blockRect.left + 14;
      const cbY = blockRect.top + blockRect.height / 2;

      try {
        await chrome.runtime.sendMessage({ action: 'cdpMouseClick', x: cbX, y: cbY });
      } catch (e) {
        const pointEl = document.elementFromPoint(cbX, cbY);
        if (pointEl) pointEl.click();
      }
      await delay(400);
      if (getStrike() !== preStrike) { method = 'cdp_mouse'; }
    }

    // NO Strategy 3 — keyboard shortcuts (Escape→Ctrl+Enter) have side effects
    // that uncheck previously-toggled blocks. If Strategy 1+2 fail, report failure.

    const postStrike = getStrike();
    const toggled = preStrike !== postStrike;

    console.log(`[FSB togglecheck] FINAL: method=${method}, pre=${preStrike}, post=${postStrike}, toggled=${toggled}, text="${text}"`);

    return {
      success: toggled,
      action: 'togglecheck',
      todoIndex: idx,
      todoText: text,
      totalTodos: todoBlocks.length,
      skippedEmpty: allBlocks.length - todoBlocks.length,
      wasChecked: preStrike,
      nowChecked: postStrike,
      toggled,
      method
    };
  };

  tools.cdpClickAt = async (params) => {
    const { x, y, shiftKey, ctrlKey, altKey } = params;
    if (typeof x !== 'number' || typeof y !== 'number') {
      return { success: false, error: 'x and y coordinates required (viewport-relative numbers)' };
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (x < 0 || y < 0 || x > vw || y > vh) {
      return { success: false, error: `Coordinates (${x}, ${y}) outside viewport bounds (${vw}x${vh}). Use values within 0-${vw} for x and 0-${vh} for y.` };
    }
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'cdpMouseClick', x, y,
        shiftKey: !!shiftKey, ctrlKey: !!ctrlKey, altKey: !!altKey
      });
      return result || { success: false, error: 'No response from CDP click handler' };
    } catch (e) {
      return { success: false, error: `CDP click failed: ${e.message}` };
    }
  };

  tools.cdpClickAndHold = async (params) => {
    const { x, y, holdMs } = params;
    if (typeof x !== 'number' || typeof y !== 'number') {
      return { success: false, error: 'x and y coordinates required (viewport-relative numbers)' };
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (x < 0 || y < 0 || x > vw || y > vh) {
      return { success: false, error: `Coordinates (${x}, ${y}) outside viewport bounds (${vw}x${vh}). Use values within 0-${vw} for x and 0-${vh} for y.` };
    }
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'cdpMouseClickAndHold', x, y,
        holdMs: holdMs || 5000
      });
      return result || { success: false, error: 'No response from CDP click-and-hold handler' };
    } catch (e) {
      return { success: false, error: `CDP click-and-hold failed: ${e.message}` };
    }
  };

  tools.cdpDrag = async (params) => {
    const { startX, startY, endX, endY, steps, stepDelayMs, shiftKey, ctrlKey, altKey } = params;
    if (typeof startX !== 'number' || typeof startY !== 'number' ||
        typeof endX !== 'number' || typeof endY !== 'number') {
      return { success: false, error: 'startX, startY, endX, endY required (viewport-relative numbers)' };
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (startX < 0 || startY < 0 || startX > vw || startY > vh ||
        endX < 0 || endY < 0 || endX > vw || endY > vh) {
      return { success: false, error: `Drag coordinates outside viewport bounds (${vw}x${vh}). start=(${startX},${startY}) end=(${endX},${endY}). All values must be within viewport.` };
    }
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'cdpMouseDrag', startX, startY, endX, endY,
        steps: steps || 10, stepDelayMs: stepDelayMs || 20,
        shiftKey: !!shiftKey, ctrlKey: !!ctrlKey, altKey: !!altKey
      });
      return result || { success: false, error: 'No response from CDP drag handler' };
    } catch (e) {
      return { success: false, error: `CDP drag failed: ${e.message}` };
    }
  };

  tools.cdpDragVariableSpeed = async (params) => {
    const { startX, startY, endX, endY, steps, minDelayMs, maxDelayMs } = params;
    if (typeof startX !== 'number' || typeof startY !== 'number' ||
        typeof endX !== 'number' || typeof endY !== 'number') {
      return { success: false, error: 'startX, startY, endX, endY required (viewport-relative numbers)' };
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (startX < 0 || startY < 0 || startX > vw || startY > vh ||
        endX < 0 || endY < 0 || endX > vw || endY > vh) {
      return { success: false, error: `Drag coordinates outside viewport bounds (${vw}x${vh}). start=(${startX},${startY}) end=(${endX},${endY}). All values must be within viewport.` };
    }
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'cdpMouseDragVariableSpeed', startX, startY, endX, endY,
        steps: steps || 20, minDelayMs: minDelayMs || 5, maxDelayMs: maxDelayMs || 40
      });
      return result || { success: false, error: 'No response from CDP variable-speed drag handler' };
    } catch (e) {
      return { success: false, error: `CDP variable-speed drag failed: ${e.message}` };
    }
  };

  tools.cdpScrollAt = async (params) => {
    const { x, y, deltaX, deltaY } = params;
    if (typeof x !== 'number' || typeof y !== 'number') {
      return { success: false, error: 'x and y coordinates required (viewport-relative numbers)' };
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (x < 0 || y < 0 || x > vw || y > vh) {
      return { success: false, error: `Coordinates (${x}, ${y}) outside viewport bounds (${vw}x${vh}). Use values within 0-${vw} for x and 0-${vh} for y.` };
    }
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'cdpMouseWheel', x, y,
        deltaX: deltaX || 0, deltaY: (typeof deltaY === 'number') ? deltaY : -120
      });
      return result || { success: false, error: 'No response from CDP mouseWheel handler' };
    } catch (e) {
      return { success: false, error: `CDP mouseWheel failed: ${e.message}` };
    }
  };

  // =========================================================================
  // VAULT FILL: fillCredentialFields -- fill login form using classified inputs
  // Uses FSB.inferElementPurpose to detect credential-input fields by role/intent.
  // Params: { username, password } -- decrypted values from background vault lookup.
  // Returns: { success, filled, fieldsFound } or { success: false, error }.
  // =========================================================================
  tools.fillCredentialFields = async (params) => {
    const { username, password } = params;
    if (!username && !password) {
      return { success: false, error: 'No credentials provided' };
    }

    // Find all visible input fields on the page
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])'));
    let usernameField = null;
    let passwordField = null;

    for (const input of inputs) {
      if (!input.offsetParent && input.type !== 'password') continue; // skip invisible (except password which may be in visible form)
      const classification = FSB.inferElementPurpose(input);
      if (!classification) continue;

      if (classification.role === 'credential-input' && classification.intent === 'username' && !usernameField) {
        usernameField = input;
      } else if (classification.role === 'credential-input' && classification.intent === 'password' && !passwordField) {
        passwordField = input;
      } else if (classification.role === 'contact-input' && classification.intent === 'email' && !usernameField) {
        // Email fields often serve as username on login forms
        usernameField = input;
      }
    }

    const filled = [];

    if (usernameField && username) {
      usernameField.focus();
      usernameField.value = username;
      usernameField.dispatchEvent(new Event('input', { bubbles: true }));
      usernameField.dispatchEvent(new Event('change', { bubbles: true }));
      filled.push('username');
    }

    if (passwordField && password) {
      passwordField.focus();
      passwordField.value = password;
      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
      passwordField.dispatchEvent(new Event('change', { bubbles: true }));
      filled.push('password');
    }

    if (filled.length === 0) {
      return { success: false, error: 'No login fields detected on this page' };
    }

    return { success: true, filled, fieldsFound: { username: !!usernameField, password: !!passwordField } };
  };

  // =========================================================================
  // VAULT FILL: fillPaymentFields -- fill checkout form using classified inputs
  // Uses FSB.inferElementPurpose to detect payment-input fields by role/intent.
  // Params: { cardNumber, cvv, expiryMonth, expiryYear, cardholderName, billingAddress }
  //   billingAddress: { line1, line2, city, region, postalCode, country }
  // Returns: { success, filled, totalFieldsDetected } or { success: false, error }.
  // =========================================================================
  tools.fillPaymentFields = async (params) => {
    const { cardNumber, cvv, expiryMonth, expiryYear, cardholderName, billingAddress } = params;

    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select'));
    const fieldMap = {}; // intent -> element

    for (const input of inputs) {
      if (!input.offsetParent) continue; // skip invisible
      const classification = FSB.inferElementPurpose(input);
      if (!classification || classification.role !== 'payment-input') continue;
      // Only take the first match per intent
      if (!fieldMap[classification.intent]) {
        fieldMap[classification.intent] = input;
      }
    }

    const filled = [];

    function fillField(element, value) {
      if (!element || !value) return false;
      element.focus();
      if (element.tagName === 'SELECT') {
        // For select elements, find matching option
        const options = Array.from(element.options);
        const match = options.find(o => o.value === value || o.textContent.trim() === value);
        if (match) {
          element.value = match.value;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    // Fill card number
    if (fillField(fieldMap['cc-number'], cardNumber)) filled.push('cc-number');

    // Fill CVV/CVC
    if (fillField(fieldMap['cc-csc'], cvv)) filled.push('cc-csc');

    // Fill expiry -- handle combined and split fields
    if (fieldMap['cc-exp'] && expiryMonth && expiryYear) {
      // Combined MM/YY field
      const expValue = String(expiryMonth).padStart(2, '0') + '/' + String(expiryYear).slice(-2);
      if (fillField(fieldMap['cc-exp'], expValue)) filled.push('cc-exp');
    } else {
      if (fillField(fieldMap['cc-exp-month'], String(expiryMonth).padStart(2, '0'))) filled.push('cc-exp-month');
      if (fillField(fieldMap['cc-exp-year'], expiryYear)) filled.push('cc-exp-year');
    }

    // Fill cardholder name
    if (fillField(fieldMap['cc-name'], cardholderName)) filled.push('cc-name');

    // Fill billing address fields
    if (billingAddress) {
      if (fillField(fieldMap['billing-address-line1'], billingAddress.line1)) filled.push('billing-address-line1');
      if (fillField(fieldMap['billing-address-line2'], billingAddress.line2)) filled.push('billing-address-line2');
      if (fillField(fieldMap['billing-city'], billingAddress.city)) filled.push('billing-city');
      if (fillField(fieldMap['billing-region'], billingAddress.region)) filled.push('billing-region');
      if (fillField(fieldMap['billing-postal-code'], billingAddress.postalCode)) filled.push('billing-postal-code');
      if (fillField(fieldMap['billing-country'], billingAddress.country)) filled.push('billing-country');
      if (fillField(fieldMap['billing-name'], cardholderName)) filled.push('billing-name');
    }

    if (filled.length === 0) {
      return { success: false, error: 'No payment fields detected on this page' };
    }

    return { success: true, filled, totalFieldsDetected: Object.keys(fieldMap).length };
  };

  FSB.clickAtCoordinates = clickAtCoordinates;
  FSB.captureActionState = captureActionState;
  FSB.EXPECTED_EFFECTS = EXPECTED_EFFECTS;
  FSB.detectChanges = detectChanges;
  FSB.verifyActionEffect = verifyActionEffect;
  FSB.DIAGNOSTIC_MESSAGES = DIAGNOSTIC_MESSAGES;
  FSB.generateDiagnostic = generateDiagnostic;
  FSB.diagnoseElementFailure = diagnoseElementFailure;
  FSB.buildFailureReport = buildFailureReport;
  FSB.runHeuristicFix = runHeuristicFix;
  FSB.checkBinaryState = checkBinaryState;
  FSB.captureElementDetails = captureElementDetails;
  FSB.ActionRecorder = ActionRecorder;
  FSB.actionRecorder = actionRecorder;
  FSB.detectActionOutcome = detectActionOutcome;
  FSB.waitForPageStability = waitForPageStability;
  FSB.waitForStability = waitForStability;
  FSB.STABILITY_PROFILES = STABILITY_PROFILES;
  FSB.detectSiteSearchInput = detectSiteSearchInput;
  FSB.findSubmitButton = findSubmitButton;
  FSB.tools = tools;

  window.FSB._modules['actions'] = { loaded: true, timestamp: Date.now() };
})();
