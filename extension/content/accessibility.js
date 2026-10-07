// =============================================================================
// ACCESSIBILITY TREE FUNCTIONS & ELEMENT READINESS CHECKS
// =============================================================================
// Extracted from content.js lines 3335-4576
// Depends on: init.js (FSB namespace, logger), utils.js (isFsbElement, stripUnicodeControl),
//             selectors.js (querySelectorWithShadow)

(function() {
  if (window.__FSB_SKIP_INIT__) return;
  const FSB = window.FSB;
  const logger = FSB.logger;

  // =============================================================================
  // ACCESSIBILITY TREE FUNCTIONS (Playwright MCP-inspired)
  // =============================================================================

  /**
   * Get the implicit ARIA role for an input element based on type
   * @param {HTMLInputElement} input - The input element
   * @returns {string|null} The implicit ARIA role
   */
  function getInputRole(input) {
    const typeRoles = {
      'button': 'button',
      'checkbox': 'checkbox',
      'email': 'textbox',
      'image': 'button',
      'number': 'spinbutton',
      'radio': 'radio',
      'range': 'slider',
      'reset': 'button',
      'search': 'searchbox',
      'submit': 'button',
      'tel': 'textbox',
      'text': 'textbox',
      'url': 'textbox',
      'password': 'textbox',
      'date': 'textbox',
      'datetime-local': 'textbox',
      'month': 'textbox',
      'week': 'textbox',
      'time': 'textbox',
      'file': 'button',
      'color': 'button'
    };
    return typeRoles[input.type] || 'textbox';
  }

  /**
   * Get the implicit ARIA role for semantic HTML elements
   * Based on WAI-ARIA specification
   * @param {Element} node - The DOM element
   * @returns {string|null} The implicit or explicit ARIA role
   */
  function getImplicitRole(node) {
    // Explicit role overrides implicit
    const explicitRole = node.getAttribute('role');
    if (explicitRole) return explicitRole;

    const tagRoles = {
      'A': node.href ? 'link' : null,
      'ARTICLE': 'article',
      'ASIDE': 'complementary',
      'BUTTON': 'button',
      'DATALIST': 'listbox',
      'DETAILS': 'group',
      'DIALOG': 'dialog',
      'FIELDSET': 'group',
      'FIGURE': 'figure',
      'FOOTER': 'contentinfo',
      'FORM': 'form',
      'H1': 'heading', 'H2': 'heading', 'H3': 'heading',
      'H4': 'heading', 'H5': 'heading', 'H6': 'heading',
      'HEADER': 'banner',
      'HR': 'separator',
      'IMG': node.alt ? 'img' : 'presentation',
      'INPUT': getInputRole(node),
      'LI': 'listitem',
      'MAIN': 'main',
      'MENU': 'menu',
      'NAV': 'navigation',
      'OL': 'list',
      'OPTGROUP': 'group',
      'OPTION': 'option',
      'OUTPUT': 'status',
      'PROGRESS': 'progressbar',
      'SECTION': node.getAttribute('aria-label') || node.getAttribute('aria-labelledby') ? 'region' : null,
      'SELECT': node.multiple ? 'listbox' : 'combobox',
      'SUMMARY': 'button',
      'TABLE': 'table',
      'TBODY': 'rowgroup', 'THEAD': 'rowgroup', 'TFOOT': 'rowgroup',
      'TD': 'cell',
      'TEXTAREA': 'textbox',
      'TH': 'columnheader',
      'TR': 'row',
      'UL': 'list'
    };

    return tagRoles[node.tagName] || null;
  }

  /**
   * Compute accessible name following ARIA specification algorithm
   * Priority: aria-labelledby > aria-label > native label > contents > title/placeholder
   * @param {Element} node - The DOM element
   * @returns {Object} { name: string, source: string }
   */
  function computeAccessibleName(node) {
    // 1. aria-labelledby (highest priority)
    const labelledBy = node.getAttribute('aria-labelledby');
    if (labelledBy) {
      const names = labelledBy.split(/\s+/)
        .map(id => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean);
      if (names.length > 0) return { name: names.join(' '), source: 'aria-labelledby' };
    }

    // 2. aria-label (strip invisible Unicode control chars for clean AI output)
    const ariaLabel = node.getAttribute('aria-label');
    if (ariaLabel) return { name: FSB.stripUnicodeControl(ariaLabel), source: 'aria-label' };

    // 3. Native label association (for form controls)
    if (node.id) {
      const label = document.querySelector(`label[for="${node.id}"]`);
      if (label) return { name: label.textContent?.trim(), source: 'label-for' };
    }

    // Implicit label (wrapped in label element)
    const parentLabel = node.closest('label');
    if (parentLabel && parentLabel !== node) {
      const labelText = parentLabel.textContent?.trim();
      if (labelText) return { name: labelText, source: 'label-wrap' };
    }

    // 4. Text content (for buttons, links, etc.)
    const role = getImplicitRole(node);
    if (['button', 'link', 'menuitem', 'option', 'tab', 'treeitem'].includes(role)) {
      const text = node.textContent?.trim();
      if (text) return { name: text.substring(0, 200), source: 'contents' };
    }

    // 5. Special cases
    if (node.tagName === 'IMG') {
      if (node.alt) return { name: node.alt, source: 'alt' };
    }
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
      if (node.placeholder) return { name: node.placeholder, source: 'placeholder' };
    }

    // 6. title attribute (lowest priority)
    const title = node.getAttribute('title');
    if (title) return { name: title, source: 'title' };

    return { name: '', source: 'none' };
  }

  /**
   * Extract ARIA relationships for an element
   * These help AI understand compound widgets and element associations
   * @param {Element} node - The DOM element
   * @returns {Object|null} Relationship mappings or null if none
   */
  function getARIARelationships(node) {
    const relationships = {};

    // aria-controls: elements this element controls
    const controls = node.getAttribute('aria-controls');
    if (controls) {
      relationships.controls = controls.split(/\s+/).filter(id => document.getElementById(id));
    }

    // aria-owns: elements logically owned by this element
    const owns = node.getAttribute('aria-owns');
    if (owns) {
      relationships.owns = owns.split(/\s+/).filter(id => document.getElementById(id));
    }

    // aria-describedby: elements that describe this element
    const describedBy = node.getAttribute('aria-describedby');
    if (describedBy) {
      const descriptions = describedBy.split(/\s+/)
        .map(id => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean);
      if (descriptions.length > 0) {
        relationships.describedBy = descriptions.join(' ').substring(0, 200);
      }
    }

    // aria-activedescendant: currently active descendant
    const activeDesc = node.getAttribute('aria-activedescendant');
    if (activeDesc && document.getElementById(activeDesc)) {
      relationships.activeDescendant = activeDesc;
    }

    // aria-flowto: next element in reading order
    const flowTo = node.getAttribute('aria-flowto');
    if (flowTo) {
      relationships.flowTo = flowTo.split(/\s+/).filter(id => document.getElementById(id));
    }

    // Clean up empty arrays
    Object.keys(relationships).forEach(key => {
      if (Array.isArray(relationships[key]) && relationships[key].length === 0) {
        delete relationships[key];
      }
    });

    return Object.keys(relationships).length > 0 ? relationships : null;
  }

  /**
   * Check if element is truly actionable (can be clicked/typed/focused)
   * More comprehensive than simple visibility check
   * @param {Element} node - The DOM element
   * @returns {Object} { actionable: boolean, reasons: string[], focusable: boolean, obscuredBy?: string }
   */
  function isElementActionable(node) {
    const result = {
      actionable: true,
      reasons: []
    };

    // 1. Check display/visibility
    const style = window.getComputedStyle(node);
    if (style.display === 'none') {
      result.actionable = false;
      result.reasons.push('display:none');
    }
    if (style.visibility === 'hidden') {
      result.actionable = false;
      result.reasons.push('visibility:hidden');
    }
    if (parseFloat(style.opacity) === 0) {
      result.actionable = false;
      result.reasons.push('opacity:0');
    }

    // 2. Check pointer-events
    if (style.pointerEvents === 'none') {
      result.actionable = false;
      result.reasons.push('pointer-events:none');
    }

    // 3. Check disabled state (element and ancestors)
    if (node.disabled) {
      result.actionable = false;
      result.reasons.push('disabled');
    }
    if (node.getAttribute('aria-disabled') === 'true') {
      result.actionable = false;
      result.reasons.push('aria-disabled');
    }

    // Check parent fieldset disabled
    const fieldset = node.closest('fieldset');
    if (fieldset?.disabled && !node.closest('legend')) {
      result.actionable = false;
      result.reasons.push('fieldset-disabled');
    }

    // 4. Check if obscured by another element
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Only check if center point is in viewport
      if (centerX >= 0 && centerX <= window.innerWidth &&
          centerY >= 0 && centerY <= window.innerHeight) {
        const topElement = FSB.deepElementFromPoint(centerX, centerY);
        if (topElement && topElement !== node && !FSB.composedContains(node, topElement) && !FSB.composedContains(topElement, node)) {
          // Ignore FSB's own overlay elements (including shadow DOM children)
          if (!FSB.isFsbElement(topElement)) {
            result.actionable = false;
            result.reasons.push('obscured');
            result.obscuredBy = topElement.tagName.toLowerCase() +
              (topElement.id ? `#${topElement.id}` : '') +
              (topElement.className && typeof topElement.className === 'string'
                ? `.${topElement.className.split(' ')[0]}`
                : '');
          }
        }
      }
    }

    // 5. Check if zero dimensions
    if (rect.width === 0 && rect.height === 0) {
      result.actionable = false;
      result.reasons.push('zero-size');
    }

    // 6. Check keyboard accessibility (for focus operations)
    const tabindex = node.getAttribute('tabindex');
    const isNativelyFocusable = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName);
    result.focusable = isNativelyFocusable || (tabindex !== null && tabindex !== '-1');

    return result;
  }

  // =============================================================================
  // ELEMENT READINESS CHECK FUNCTIONS (Playwright-style actionability validation)
  // =============================================================================

  /**
   * Check if element is visible (not hidden by CSS or zero dimensions)
   * @param {Element} element - The DOM element to check
   * @returns {Object} { passed: boolean, reason: string|null, details: object }
   */
  function checkElementVisibility(element) {
    // Check element exists
    if (!element) {
      return {
        passed: false,
        reason: 'Element is null or undefined',
        details: { elementExists: false }
      };
    }

    // Check bounding box has non-zero dimensions
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      // Contenteditable elements and role="textbox" can be interactable
      // even with zero bounding rect (e.g., Gmail compose body when empty)
      const isEditable = element.contentEditable === 'true' ||
                         element.hasAttribute('contenteditable') ||
                         element.getAttribute('role') === 'textbox';
      if (isEditable) {
        const style = window.getComputedStyle(element);
        const isCSSVisible = style.display !== 'none' &&
                             style.visibility !== 'hidden' &&
                             parseFloat(style.opacity) > 0;
        if (isCSSVisible) {
          // Allow through -- element is editable and CSS-visible despite zero rect
          logger.debug('Zero-dim editable element bypassed visibility check', {
            tag: element.tagName,
            role: element.getAttribute('role'),
            contentEditable: element.contentEditable,
            rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left }
          });
        } else {
          return {
            passed: false,
            reason: 'Element has zero dimensions',
            details: {
              rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
              editableBypass: 'failed-css-hidden'
            }
          };
        }
      } else {
        return {
          passed: false,
          reason: 'Element has zero dimensions',
          details: {
            rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left }
          }
        };
      }
    }

    // Use modern checkVisibility API if available
    if (typeof element.checkVisibility === 'function') {
      const isVisible = element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
      if (!isVisible) {
        // Fallback to get specific reason via computed style
        const style = window.getComputedStyle(element);
        return {
          passed: false,
          reason: 'Element not visible (checkVisibility returned false)',
          details: {
            rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity
          }
        };
      }
    } else {
      // Fallback to getComputedStyle checks
      const style = window.getComputedStyle(element);

      if (style.display === 'none') {
        return {
          passed: false,
          reason: 'Element has display:none',
          details: {
            rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
            display: style.display
          }
        };
      }

      if (style.visibility === 'hidden') {
        return {
          passed: false,
          reason: 'Element has visibility:hidden',
          details: {
            rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
            visibility: style.visibility
          }
        };
      }

      if (parseFloat(style.opacity) === 0) {
        return {
          passed: false,
          reason: 'Element has opacity:0',
          details: {
            rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
            opacity: style.opacity
          }
        };
      }
    }

    return {
      passed: true,
      reason: null,
      details: {
        rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left }
      }
    };
  }

  /**
   * Check if element is enabled (not disabled by various mechanisms)
   * @param {Element} element - The DOM element to check
   * @returns {Object} { passed: boolean, reason: string|null, details: object }
   */
  function checkElementEnabled(element) {
    const details = {};

    // Check native disabled (catches fieldset-disabled too via :disabled pseudo-class)
    try {
      if (element.matches(':disabled')) {
        details.nativeDisabled = true;
        return {
          passed: false,
          reason: 'Element is disabled (native :disabled)',
          details
        };
      }
      details.nativeDisabled = false;
    } catch (e) {
      // :disabled not applicable to this element type
      details.nativeDisabled = false;
    }

    // Check aria-disabled on element
    if (element.getAttribute('aria-disabled') === 'true') {
      details.ariaDisabled = true;
      return {
        passed: false,
        reason: 'Element has aria-disabled="true"',
        details
      };
    }
    details.ariaDisabled = false;

    // Check ancestor aria-disabled
    const disabledAncestor = element.closest('[aria-disabled="true"]');
    if (disabledAncestor && disabledAncestor !== element) {
      details.ancestorAriaDisabled = true;
      return {
        passed: false,
        reason: 'Ancestor has aria-disabled="true"',
        details
      };
    }
    details.ancestorAriaDisabled = false;

    // Check inert (element is inert or inside inert container)
    try {
      if (element.matches('[inert], [inert] *')) {
        details.inert = true;
        return {
          passed: false,
          reason: 'Element is inert or inside inert container',
          details
        };
      }
      details.inert = false;
    } catch (e) {
      details.inert = false;
    }

    return {
      passed: true,
      reason: null,
      details
    };
  }

  /**
   * Check if element position is stable (not animating)
   * @param {Element} element - The DOM element to check
   * @param {number} maxWaitMs - Maximum time to wait for stability (default 300ms)
   * @returns {Promise<Object>} { passed: boolean, reason: string|null, details: object }
   */
  async function checkElementStable(element, maxWaitMs = 300) {
    const startTime = Date.now();
    const TOLERANCE = 1; // 1px tolerance for position comparison

    // Get initial position
    const getPosition = () => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    };

    const initialPosition = getPosition();

    // Check position after one frame
    const checkAfterFrame = () => {
      return new Promise(resolve => {
        requestAnimationFrame(() => {
          const newPosition = getPosition();
          const delta = {
            top: Math.abs(newPosition.top - initialPosition.top),
            left: Math.abs(newPosition.left - initialPosition.left),
            width: Math.abs(newPosition.width - initialPosition.width),
            height: Math.abs(newPosition.height - initialPosition.height)
          };

          const isStable = delta.top <= TOLERANCE &&
                           delta.left <= TOLERANCE &&
                           delta.width <= TOLERANCE &&
                           delta.height <= TOLERANCE;

          resolve({ isStable, newPosition, delta });
        });
      });
    };

    // First check
    let result = await checkAfterFrame();

    if (result.isStable) {
      return {
        passed: true,
        reason: null,
        details: {
          position: initialPosition,
          checkTime: Date.now() - startTime
        }
      };
    }

    // Element is moving - wait for stability up to maxWaitMs
    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(r => setTimeout(r, 50)); // Check every 50ms

      const prevPosition = result.newPosition;
      result = await checkAfterFrame();

      // Check against previous position, not initial
      const delta = {
        top: Math.abs(result.newPosition.top - prevPosition.top),
        left: Math.abs(result.newPosition.left - prevPosition.left),
        width: Math.abs(result.newPosition.width - prevPosition.width),
        height: Math.abs(result.newPosition.height - prevPosition.height)
      };

      const nowStable = delta.top <= TOLERANCE &&
                        delta.left <= TOLERANCE &&
                        delta.width <= TOLERANCE &&
                        delta.height <= TOLERANCE;

      if (nowStable) {
        return {
          passed: true,
          reason: null,
          details: {
            position: result.newPosition,
            checkTime: Date.now() - startTime
          }
        };
      }
    }

    // Timed out waiting for stability
    return {
      passed: false,
      reason: 'Element position is unstable (animating)',
      details: {
        position: result.newPosition,
        delta: result.delta,
        checkTime: Date.now() - startTime
      }
    };
  }

  /**
   * Detect if an element is inside a code editor (Monaco, CodeMirror, ACE, etc.)
   * Uses DOM ancestry inspection -- no site-specific logic.
   * @param {Element} element - The DOM element to check
   * @returns {Object} { isCodeEditor: boolean, type: string|null, container: Element|null }
   */
  function detectCodeEditor(element) {
    const editorPatterns = [
      { selector: '.monaco-editor', type: 'monaco' },
      { selector: '.CodeMirror', type: 'codemirror' },
      { selector: '.cm-editor', type: 'codemirror6' },
      { selector: '.ace_editor', type: 'ace' },
      { selector: '[data-mode-id]', type: 'monaco' },
      { selector: '.code-editor', type: 'generic' },
    ];

    for (const { selector, type } of editorPatterns) {
      const container = element.closest(selector);
      if (container) {
        return { isCodeEditor: true, type, container };
      }
    }

    // Broader check: walk up to 10 ancestors looking for editor-like class names
    let parent = element.parentElement;
    for (let depth = 0; parent && depth < 10; depth++) {
      if (parent.classList) {
        const hasEditorClass = Array.from(parent.classList).some(c =>
          /monaco|codemirror|ace[_-]editor|code[_-]?editor/i.test(c)
        );
        if (hasEditorClass) {
          return { isCodeEditor: true, type: 'unknown', container: parent };
        }
      }
      parent = parent.parentElement;
    }

    return { isCodeEditor: false, type: null, container: null };
  }

  /**
   * Check if element can receive pointer events (not obscured by other elements)
   * Uses multi-point hit testing for more reliable detection
   * @param {Element} element - The DOM element to check
   * @returns {Object} { passed: boolean, reason: string|null, details: object, obscuredBy?: string }
   */
  function checkElementReceivesEvents(element) {
    // Canvas-based editors (Google Sheets/Docs/Slides) have inherently layered UIs
    // with sidebars, panels, and overlays that cause elementFromPoint to return
    // overlay elements instead of the target. Skip obscuration check for these apps.
    if (FSB.isCanvasBasedEditor && FSB.isCanvasBasedEditor()) {
      return { passed: true, reason: null, details: { checkedPoints: 0, passedPoints: 0, skipped: 'canvas-editor' } };
    }

    let rect = element.getBoundingClientRect();

    // Helper to calculate 5 check points from a rect
    const getCheckPoints = (r) => [
      { name: 'center', x: r.left + r.width / 2, y: r.top + r.height / 2 },
      { name: 'topLeft', x: r.left + r.width * 0.25, y: r.top + r.height * 0.25 },
      { name: 'topRight', x: r.left + r.width * 0.75, y: r.top + r.height * 0.25 },
      { name: 'bottomLeft', x: r.left + r.width * 0.25, y: r.top + r.height * 0.75 },
      { name: 'bottomRight', x: r.left + r.width * 0.75, y: r.top + r.height * 0.75 }
    ];

    let points = getCheckPoints(rect);

    // Filter to points within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let pointsInViewport = points.filter(p =>
      p.x >= 0 && p.x <= viewportWidth && p.y >= 0 && p.y <= viewportHeight
    );

    if (pointsInViewport.length === 0) {
      // Attempt to scroll element into view before giving up
      try {
        element.scrollIntoView({ behavior: 'instant', block: 'center' });
        // Re-check after scroll
        const newRect = element.getBoundingClientRect();
        const newPoints = getCheckPoints(newRect).filter(p =>
          p.x >= 0 && p.x <= viewportWidth && p.y >= 0 && p.y <= viewportHeight
        );
        if (newPoints.length > 0) {
          // Element is now in viewport after scroll -- update and continue with checks
          rect = newRect;
          points = getCheckPoints(newRect);
          pointsInViewport = newPoints;
        } else {
          return {
            passed: false,
            reason: 'Element is outside viewport (even after scroll attempt)',
            details: {
              checkedPoints: 0,
              passedPoints: 0,
              rect: { top: newRect.top, left: newRect.left, width: newRect.width, height: newRect.height }
            }
          };
        }
      } catch (e) {
        return {
          passed: false,
          reason: 'Element is outside viewport',
          details: {
            checkedPoints: 0,
            passedPoints: 0,
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
          }
        };
      }
    }

    // Check each point
    const checkedPoints = [];
    const passedPoints = [];
    let obscuredBy = null;

    for (const point of pointsInViewport) {
      const hitElement = FSB.deepElementFromPoint(point.x, point.y);
      checkedPoints.push(point.name);

      // Check if hit element is the target, or they have a parent/child relationship
      // across shadow boundaries
      const hitIsTarget = hitElement === element;
      const targetContainsHit = hitElement && FSB.composedContains(element, hitElement);
      const hitContainsTarget = hitElement && FSB.composedContains(hitElement, element);

      if (hitIsTarget || targetContainsHit || hitContainsTarget) {
        passedPoints.push(point.name);
      } else if (FSB.isFsbElement(hitElement)) {
        // FSB's own overlay (including shadow DOM children) -- ignore, treat target as accessible
        passedPoints.push(point.name);
      } else if (!obscuredBy && hitElement) {
        // Record what's obscuring (only first one)
        obscuredBy = hitElement.tagName.toLowerCase() +
          (hitElement.id ? `#${hitElement.id}` : '') +
          (hitElement.className && typeof hitElement.className === 'string'
            ? `.${hitElement.className.split(' ')[0]}`
            : '');
      }
    }

    // Require center point to pass (if it was checked), or at least 1 point if center not in viewport
    const centerChecked = checkedPoints.includes('center');
    const centerPassed = passedPoints.includes('center');

    const passed = centerChecked ? centerPassed : passedPoints.length > 0;

    const result = {
      passed,
      reason: passed ? null : `Element is obscured at ${centerChecked ? 'center' : 'all visible points'}`,
      details: {
        checkedPoints: checkedPoints.length,
        passedPoints: passedPoints.length,
        checkedPointNames: checkedPoints,
        passedPointNames: passedPoints
      }
    };

    if (obscuredBy) {
      result.obscuredBy = obscuredBy;
    }

    // Detect if obstruction is caused by a fixed/sticky positioned element (header, navbar, etc.)
    if (!passed && obscuredBy) {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const obscuringElement = FSB.deepElementFromPoint(centerX, centerY);

      if (obscuringElement && obscuringElement !== element && !FSB.composedContains(element, obscuringElement)) {
        const obscStyle = getComputedStyle(obscuringElement);
        let isFixedOrSticky = obscStyle.position === 'fixed' || obscStyle.position === 'sticky';

        // Also check ancestors -- the obscuring element might be inside a fixed
        // container, including a header built as a web component
        if (!isFixedOrSticky) {
          const composedParent = (el) => el.parentElement || el.getRootNode().host || null;
          let ancestor = composedParent(obscuringElement);
          while (ancestor && ancestor !== document.body) {
            const aStyle = getComputedStyle(ancestor);
            if (aStyle.position === 'fixed' || aStyle.position === 'sticky') {
              isFixedOrSticky = true;
              break;
            }
            ancestor = composedParent(ancestor);
          }
        }

        if (isFixedOrSticky) {
          result.obscuredByFixedHeader = true;
          result.reason = `Element obscured by fixed/sticky element: ${obscuredBy}`;
        }
      }
    }

    return result;
  }

  /**
   * Check if element is editable (for input operations)
   * @param {Element} element - The DOM element to check
   * @returns {Object} { passed: boolean, reason: string|null, details: object }
   */
  function checkElementEditable(element) {
    const details = {};

    // Check disabled
    try {
      if (element.matches(':disabled')) {
        details.disabled = true;
        return {
          passed: false,
          reason: 'Element is disabled',
          details
        };
      }
      details.disabled = false;
    } catch (e) {
      details.disabled = false;
    }

    // Check readonly property
    if (element.readOnly) {
      details.readonly = true;
      return {
        passed: false,
        reason: 'Element is readonly',
        details
      };
    }
    details.readonly = false;

    // Check aria-readonly
    if (element.getAttribute('aria-readonly') === 'true') {
      details.ariaReadonly = true;
      return {
        passed: false,
        reason: 'Element has aria-readonly="true"',
        details
      };
    }
    details.ariaReadonly = false;

    // Check contenteditable="false" for contenteditable elements
    const contentEditable = element.getAttribute('contenteditable');
    if (contentEditable !== null) {
      details.contenteditable = contentEditable;
      if (contentEditable === 'false') {
        return {
          passed: false,
          reason: 'Element has contenteditable="false"',
          details
        };
      }
    }

    return {
      passed: true,
      reason: null,
      details
    };
  }

  /**
   * Detect the total height of fixed/sticky headers anchored at the top of the viewport.
   * Queries common header/nav selectors and checks computed position + top offset.
   * @returns {number} The bottom edge of the tallest fixed/sticky top-anchored element, or 0 if none.
   */
  function getStickyHeaderHeight() {
    const candidates = document.querySelectorAll(
      'header, nav, [role="banner"], [class*="header"], [class*="navbar"], [class*="topbar"], [class*="app-bar"]'
    );
    let maxBottom = 0;
    for (const el of candidates) {
      try {
        const style = getComputedStyle(el);
        if (style.position !== 'fixed' && style.position !== 'sticky') continue;
        const rect = el.getBoundingClientRect();
        // Only consider elements anchored at the top of the viewport (not sticky footers or sidebars)
        if (rect.top < 10) {
          maxBottom = Math.max(maxBottom, rect.bottom);
        }
      } catch (e) {
        // Skip elements that throw on getComputedStyle (e.g., disconnected nodes)
      }
    }
    return maxBottom;
  }

  /**
   * Scroll element into view only if needed (not fully visible or center not visible)
   * @param {Element} element - The DOM element to scroll into view
   * @returns {Promise<Object>} { scrolled: boolean, details: object }
   */
  async function scrollIntoViewIfNeeded(element) {
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Check if element is fully visible in viewport (account for fixed/sticky headers)
    const stickyHeaderHeight = getStickyHeaderHeight();
    const wasFullyVisible = rect.top >= stickyHeaderHeight &&
                            rect.left >= 0 &&
                            rect.bottom <= viewportHeight &&
                            rect.right <= viewportWidth;

    // Check if center is visible (even if edges are clipped)
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const wasCenterVisible = centerX >= 0 &&
                             centerX <= viewportWidth &&
                             centerY >= 0 &&
                             centerY <= viewportHeight;

    const initialRect = {
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      right: rect.right,
      width: rect.width,
      height: rect.height
    };

    // If fully visible and center is visible, no need to scroll
    if (wasFullyVisible && wasCenterVisible) {
      return {
        scrolled: false,
        details: {
          initialRect,
          wasFullyVisible,
          wasCenterVisible
        }
      };
    }

    // Need to scroll - use smooth scroll to center
    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

    // Wait for scroll animation (300ms)
    await new Promise(r => setTimeout(r, 300));

    // Compensate for fixed/sticky headers: if element is behind a header, scroll to clear it
    const postScrollHeaderHeight = getStickyHeaderHeight();
    if (postScrollHeaderHeight > 0) {
      const postScrollRect = element.getBoundingClientRect();
      if (postScrollRect.top < postScrollHeaderHeight + 8) {
        // Element is behind the fixed header -- scroll the page upward so element moves down in viewport
        window.scrollBy(0, postScrollRect.top - postScrollHeaderHeight - 16);
        // Wait for the adjustment scroll
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // Get final rect
    const finalRectRaw = element.getBoundingClientRect();
    const finalRect = {
      top: finalRectRaw.top,
      left: finalRectRaw.left,
      bottom: finalRectRaw.bottom,
      right: finalRectRaw.right,
      width: finalRectRaw.width,
      height: finalRectRaw.height
    };

    return {
      scrolled: true,
      details: {
        initialRect,
        finalRect,
        wasFullyVisible,
        wasCenterVisible,
        stickyHeaderHeight: postScrollHeaderHeight
      }
    };
  }

  /**
   * Perform quick readiness check for fast-path detection
   * SPEED-05: Skip full readiness checks when element is obviously ready
   * @param {Element} element - The DOM element to check
   * @returns {Object} Quick check result with definitelyReady/definitelyNotReady flags
   */
  function performQuickReadinessCheck(element) {
    const checks = {
      hasSize: false,
      notDisabled: false,
      visible: false,
      receivesEvents: false,
      inViewport: false
    };

    // Early return for null/undefined element
    if (!element) {
      return {
        definitelyReady: false,
        definitelyNotReady: true,
        concern: 'no-element',
        checks
      };
    }

    // Get bounding rect for size and viewport checks
    const rect = element.getBoundingClientRect();

    // Check 1: Has size (width > 0 AND height > 0)
    checks.hasSize = rect.width > 0 && rect.height > 0;

    // Check 2: Not disabled
    checks.notDisabled = !element.disabled && element.getAttribute('aria-disabled') !== 'true';

    // Check 3: Visible (computed style)
    const style = getComputedStyle(element);
    checks.visible = style.display !== 'none' &&
                     style.visibility !== 'hidden' &&
                     parseFloat(style.opacity) > 0;

    // Check 4: In viewport (account for fixed/sticky headers at the top)
    const quickStickyHeight = getStickyHeaderHeight();
    checks.inViewport = rect.top >= quickStickyHeight &&
                        rect.bottom <= window.innerHeight &&
                        rect.left >= 0 &&
                        rect.right <= window.innerWidth;

    // Check 5: Receives events (element at center point)
    // Canvas editors skip this check — their layered UI causes false obscuration failures
    if (FSB.isCanvasBasedEditor && FSB.isCanvasBasedEditor()) {
      checks.receivesEvents = true;
    } else {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const elementAtPoint = FSB.deepElementFromPoint(centerX, centerY);
      checks.receivesEvents = elementAtPoint === element || FSB.composedContains(element, elementAtPoint);
    }

    // Determine overall status
    const basicChecksPass = checks.hasSize && checks.notDisabled && checks.visible;
    const definitelyNotReady = !checks.hasSize || !checks.notDisabled || !checks.visible;
    const definitelyReady = basicChecksPass && checks.inViewport && checks.receivesEvents;

    // Determine concern if not definitely ready
    let concern = null;
    if (!definitelyReady && !definitelyNotReady) {
      if (!checks.inViewport) concern = 'scroll';
      else if (!checks.receivesEvents) concern = 'obscured';
    }

    return {
      definitelyReady,
      definitelyNotReady,
      concern,
      checks
    };
  }

  // =============================================================================
  // COOKIE CONSENT AUTO-DISMISS (OVLY-01 through OVLY-04)
  // =============================================================================

  /**
   * Detect and dismiss cookie consent overlays proactively.
   * 3-tier detection: CMP-specific, generic overlay patterns, text-based fallback.
   * Prefers reject/decline buttons over Accept All to minimize tracking.
   * Idempotent: safe to call multiple times on the same page.
   */
  async function dismissCookieConsent() {
    if (window.__FSB_COOKIE_DISMISSED__) {
      return { dismissed: false, method: null, cmp: null, skipped: true, reason: 'already dismissed on this page' };
    }
    const currentURL = window.location.href;
    if (FSB._lastCookieDismissURL === currentURL &&
        FSB._lastCookieDismissTime && (Date.now() - FSB._lastCookieDismissTime) < 5000) {
      return { dismissed: false, method: null, cmp: null, skipped: true, reason: 'cooldown (same URL within 5s)' };
    }
    FSB._lastCookieDismissURL = currentURL;
    FSB._lastCookieDismissTime = Date.now();

    const CMP_CONFIGS = [
      {
        name: 'onetrust',
        containers: ['#onetrust-consent-sdk', '#onetrust-banner-sdk'],
        rejectButtons: ['button[class*="ot-pc-refuse-all-handler"]', '.onetrust-close-btn-handler[aria-label*="reject" i]', '#onetrust-reject-all-handler'],
        acceptButtons: ['#onetrust-accept-btn-handler']
      },
      {
        name: 'cookiebot',
        containers: ['#CybotCookiebotDialog'],
        rejectButtons: ['#CybotCookiebotDialogBodyButtonDecline', '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll', 'a[id*="Decline"]'],
        acceptButtons: ['#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll']
      },
      {
        name: 'trustarc',
        containers: ['#truste_overlay', '#consent_blackbar'],
        rejectButtons: ['.trustarc-manage-btn', '#truste-consent-required'],
        acceptButtons: ['#truste-consent-button']
      },
      {
        name: 'quantcast',
        containers: ['#qc-cmp2-container', '.qc-cmp2-main'],
        rejectButtons: ['.qc-cmp2-summary-buttons button:last-child', 'button[mode="secondary"]'],
        acceptButtons: ['.qc-cmp2-summary-buttons button:first-child', 'button[mode="primary"]']
      },
      {
        name: 'didomi',
        containers: ['#didomi-popup', '#didomi-notice'],
        rejectButtons: ['#didomi-notice-disagree-button', 'button.didomi-components-button--secondary'],
        acceptButtons: ['#didomi-notice-agree-button']
      },
      {
        name: 'sourcepoint',
        containers: ['div[class*="sp_veil"]', 'div.message-overlay'],
        rejectButtons: ['button[title*="Reject" i]', 'button[title*="Ablehnen" i]', 'button[title*="Refuser" i]', 'button.sp_choice_type_REJECT_ALL'],
        acceptButtons: ['button.sp_choice_type_11']
      }
    ];

    const NON_COOKIE_KEYWORDS = ['password', 'log in', 'login', 'sign in', 'signin', 'age verification', 'over 18', 'over 21'];
    const COOKIE_TEXT_KEYWORDS = ['cookie', 'consent', 'gdpr', 'privacy policy', 'data protection', 'we use cookies', 'this site uses cookies', 'datenschutz', 'protection des donnees', 'informativa sulla privacy'];
    const REJECT_TEXT_PATTERN = /^(reject|decline|refuse|deny|necessary only|essential only|tout refuser|ablehnen|rifiuta|rechazar|refuser|nur notwendige|solo necessari|solo esenciales)$/i;
    const ACCEPT_TEXT_PATTERN = /^(accept|agree|ok|got it|allow|i understand|j'accepte|akzeptieren|accetta|aceptar|accept all|allow all)$/i;

    function isVisibleEl(el) { return el.offsetWidth > 0 && el.offsetHeight > 0; }
    function hasOverlayPos(el) {
      const style = getComputedStyle(el);
      return style.position === 'fixed' || style.position === 'sticky' || (parseInt(style.zIndex) || 0) >= 999;
    }
    function isInsideMain(el) { return !!el.closest('main, [role="main"]'); }
    function hasNonCookieKW(el) {
      const text = (el.innerText || '').substring(0, 500).toLowerCase();
      return NON_COOKIE_KEYWORDS.some(kw => text.includes(kw));
    }
    function hasCookieText(el) {
      const text = (el.innerText || '').substring(0, 1000).toLowerCase();
      return COOKIE_TEXT_KEYWORDS.some(kw => text.includes(kw));
    }
    function isValidCookieOverlay(el) {
      return isVisibleEl(el) && hasOverlayPos(el) && !isInsideMain(el) && !hasNonCookieKW(el);
    }
    function findBtnBySelectors(container, selectors) {
      for (const sel of selectors) {
        try { const btn = container.querySelector(sel); if (btn && isVisibleEl(btn)) return btn; } catch (e) {}
      }
      return null;
    }
    function findBtnByText(container, pattern) {
      const btns = container.querySelectorAll('button, a[role="button"], a[href="#"], input[type="button"], input[type="submit"]');
      for (const btn of btns) {
        const text = (btn.innerText || btn.value || '').trim();
        if (text && pattern.test(text) && isVisibleEl(btn)) return btn;
      }
      return null;
    }
    function findCloseBtn(container) {
      const sels = ['button[aria-label*="close" i]', 'button[aria-label*="dismiss" i]', '.close-button', '[class*="close"]'];
      for (const sel of sels) {
        try { const btn = container.querySelector(sel); if (btn && isVisibleEl(btn)) return btn; } catch (e) {}
      }
      return null;
    }

    async function tryDismiss(container, cmpName, rejectSelectors, acceptSelectors) {
      // Priority 1: Reject/decline buttons (from CMP config or text match)
      let btn = rejectSelectors ? findBtnBySelectors(container, rejectSelectors) : null;
      let method = 'reject';
      if (!btn) { btn = findBtnByText(container, REJECT_TEXT_PATTERN); method = 'reject-text'; }
      // Priority 2: Accept as last resort
      if (!btn) {
        btn = acceptSelectors ? findBtnBySelectors(container, acceptSelectors) : null;
        method = 'accept-fallback';
      }
      if (!btn) { btn = findBtnByText(container, ACCEPT_TEXT_PATTERN); method = 'accept-text'; }
      // Priority 3: Close/X button
      if (!btn) { btn = findCloseBtn(container); method = 'close'; }
      if (!btn) return { dismissed: false, method: null, cmp: cmpName, skipped: false, reason: 'no dismiss button found' };

      btn.click();
      await new Promise(r => setTimeout(r, 500));
      if (!isVisibleEl(container) || container.offsetParent === null) {
        window.__FSB_COOKIE_DISMISSED__ = true;
        return { dismissed: true, method, cmp: cmpName, skipped: false, reason: null };
      }
      return { dismissed: false, method, cmp: cmpName, skipped: false, reason: 'overlay persisted after click' };
    }

    // Tier 1: CMP-specific detection
    for (const cmp of CMP_CONFIGS) {
      for (const sel of cmp.containers) {
        try {
          const container = document.querySelector(sel);
          if (container && isValidCookieOverlay(container)) {
            return await tryDismiss(container, cmp.name, cmp.rejectButtons, cmp.acceptButtons);
          }
        } catch (e) {}
      }
    }

    // Tier 2: Generic overlay detection
    const genericSelectors = [
      'div[role="dialog"][class*="cookie" i]', 'div[class*="consent-banner" i]',
      'div[class*="cookie-banner" i]', 'div[id*="cookie-banner" i]',
      'div[id*="cookie-notice" i]', 'div[id*="consent-banner" i]',
      'div[class*="cookie-consent" i]', 'div[class*="gdpr" i]',
      'div[id*="gdpr" i]', 'div[class*="cookie-notice" i]'
    ];
    for (const sel of genericSelectors) {
      try {
        const container = document.querySelector(sel);
        if (container && isValidCookieOverlay(container) && hasCookieText(container)) {
          return await tryDismiss(container, 'generic', null, null);
        }
      } catch (e) {}
    }

    // Tier 3: Text-based fallback (scan direct children of body only, cap at 20)
    const bodyChildren = document.querySelectorAll('body > div, body > aside, body > section');
    let scanned = 0;
    for (const el of bodyChildren) {
      if (scanned >= 20) break;
      scanned++;
      try {
        if (isValidCookieOverlay(el) && hasCookieText(el)) {
          return await tryDismiss(el, 'text-fallback', null, null);
        }
      } catch (e) {}
    }

    return { dismissed: false, method: null, cmp: null, skipped: false, reason: 'no cookie consent overlay detected' };
  }

  /**
   * Smart element readiness wrapper that uses fast-path when possible
   * SPEED-05: Bypass full ensureElementReady when quick check passes
   * @param {Element} element - The DOM element to check
   * @param {string} actionType - Type of action to perform (default 'click')
   * @returns {Promise<Object>} Readiness result object
   */
  async function smartEnsureReady(element, actionType = 'click') {
    // Proactively dismiss cookie consent overlays before readiness checks (OVLY-03)
    try { await dismissCookieConsent(); } catch (e) { /* non-fatal */ }

    // Perform quick readiness check
    const quickCheck = performQuickReadinessCheck(element);

    // Fast path: element is definitely ready, skip full checks
    if (quickCheck.definitelyReady) {
      return {
        ready: true,
        element: element,
        scrolled: false,
        fastPath: true,
        checks: quickCheck.checks
      };
    }

    // Slow path: element has concerns or is definitely not ready
    // Fall through to full ensureElementReady
    return ensureElementReady(element, actionType);
  }

  /**
   * Orchestrator function to ensure element is ready for interaction
   * Calls all readiness checks in correct order and returns unified result
   * @param {Element} element - The DOM element to check
   * @param {string} actionType - Type of action to perform (default 'click')
   * @returns {Promise<Object>} Unified readiness result object
   */
  async function ensureElementReady(element, actionType = 'click') {
    const inputActions = ['type', 'fill', 'clear', 'clearInput', 'selectText'];
    const result = {
      ready: true,
      element: element,
      scrolled: false,
      checks: {},
      failureReason: null,
      failureDetails: null
    };

    // 1. Check visibility - fail fast if not visible
    const visibleCheck = checkElementVisibility(element);
    result.checks.visible = visibleCheck;
    if (!visibleCheck.passed) {
      result.ready = false;
      result.failureReason = visibleCheck.reason;
      result.failureDetails = visibleCheck.details;
      return result;
    }

    // 1b. Post-render delay for zero-dim editable elements
    // If the element passed visibility via the contenteditable bypass (zero rect but CSS-visible),
    // wait briefly for it to finish rendering, then re-check dimensions
    const elRect = element.getBoundingClientRect();
    if ((elRect.width === 0 || elRect.height === 0) &&
        (element.contentEditable === 'true' || element.hasAttribute('contenteditable') ||
         element.getAttribute('role') === 'textbox')) {
      logger.debug('Zero-dim editable passed visibility, waiting 200ms for render');
      await new Promise(resolve => setTimeout(resolve, 200));
      const updatedRect = element.getBoundingClientRect();
      if (updatedRect.width > 0 && updatedRect.height > 0) {
        logger.debug('Editable element gained dimensions after render wait', {
          width: updatedRect.width, height: updatedRect.height
        });
      }
      // Proceed regardless -- the contenteditable bypass already approved this element
    }

    // 2. Check enabled - fail fast if disabled
    const enabledCheck = checkElementEnabled(element);
    result.checks.enabled = enabledCheck;
    if (!enabledCheck.passed) {
      result.ready = false;
      result.failureReason = enabledCheck.reason;
      result.failureDetails = enabledCheck.details;
      return result;
    }

    // 3. Scroll into view if needed
    const scrollResult = await scrollIntoViewIfNeeded(element);
    result.scrolled = scrollResult.scrolled;

    // 4. Check stability - wait for animations
    const editorInfo = detectCodeEditor(element);
    const stabilityTimeout = editorInfo.isCodeEditor ? 1500 : 300;
    if (editorInfo.isCodeEditor) {
      logger.debug('Code editor detected, using extended stability timeout', {
        type: editorInfo.type,
        timeout: stabilityTimeout
      });
    }
    const stableCheck = await checkElementStable(element, stabilityTimeout);
    result.checks.stable = stableCheck;
    if (!stableCheck.passed) {
      result.ready = false;
      result.failureReason = stableCheck.reason;
      result.failureDetails = stableCheck.details;
      return result;
    }

    // 5. Check receives events - not obscured
    let eventsCheck = checkElementReceivesEvents(element);

    // Retry if obscured by fixed/sticky header -- scroll to clear and re-check
    if (!eventsCheck.passed && eventsCheck.obscuredByFixedHeader) {
      const headerHeight = getStickyHeaderHeight();
      if (headerHeight > 0) {
        // First attempt: scroll element below the header
        const r = element.getBoundingClientRect();
        window.scrollBy(0, r.top - headerHeight - 20);
        await new Promise(resolve => setTimeout(resolve, 150));
        eventsCheck = checkElementReceivesEvents(element);

        // Second attempt if still obscured
        if (!eventsCheck.passed && eventsCheck.obscuredByFixedHeader) {
          const r2 = element.getBoundingClientRect();
          window.scrollBy(0, r2.top - headerHeight - 30);
          await new Promise(resolve => setTimeout(resolve, 150));
          eventsCheck = checkElementReceivesEvents(element);
        }
      }
    }

    result.checks.receivesEvents = eventsCheck;
    if (!eventsCheck.passed) {
      result.ready = false;
      result.failureReason = eventsCheck.obscuredByFixedHeader
        ? `Element obscured by fixed/sticky element: ${eventsCheck.obscuredBy || 'unknown'}`
        : eventsCheck.reason;
      result.failureDetails = eventsCheck.details;
      if (eventsCheck.obscuredBy) {
        result.failureDetails.obscuredBy = eventsCheck.obscuredBy;
      }
      return result;
    }

    // 6. Check editable - only for input actions
    if (inputActions.includes(actionType)) {
      const editableCheck = checkElementEditable(element);
      result.checks.editable = editableCheck;
      if (!editableCheck.passed) {
        result.ready = false;
        result.failureReason = editableCheck.reason;
        result.failureDetails = editableCheck.details;
        return result;
      }
    }

    return result;
  }

  // =============================================================================
  // Attach all exports to FSB namespace
  // =============================================================================

  // ARIA / Accessibility functions
  FSB.getInputRole = getInputRole;
  FSB.getImplicitRole = getImplicitRole;
  FSB.computeAccessibleName = computeAccessibleName;
  FSB.getARIARelationships = getARIARelationships;
  FSB.isElementActionable = isElementActionable;

  // Element readiness check functions
  FSB.getStickyHeaderHeight = getStickyHeaderHeight;
  FSB.checkElementVisibility = checkElementVisibility;
  FSB.checkElementEnabled = checkElementEnabled;
  FSB.checkElementStable = checkElementStable;
  FSB.detectCodeEditor = detectCodeEditor;
  FSB.checkElementReceivesEvents = checkElementReceivesEvents;
  FSB.checkElementEditable = checkElementEditable;
  FSB.scrollIntoViewIfNeeded = scrollIntoViewIfNeeded;
  FSB.performQuickReadinessCheck = performQuickReadinessCheck;
  FSB.dismissCookieConsent = dismissCookieConsent;
  FSB.smartEnsureReady = smartEnsureReady;
  FSB.ensureElementReady = ensureElementReady;

  window.FSB._modules['accessibility'] = { loaded: true, timestamp: Date.now() };
})();
