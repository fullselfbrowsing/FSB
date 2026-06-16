/**
 * Canonical Tool Registry for FSB Browser Automation
 *
 * Single source of truth for all 52 browser automation tool definitions.
 * Shared between autopilot (agent loop) and MCP server.
 *
 * Per D-11/D-12: Each tool is a plain object with JSON Schema inputSchema
 * and routing metadata (_route, _readOnly, _contentVerb, _cdpVerb).
 *
 * Per D-01: All tool names use snake_case matching MCP convention.
 * Per D-04: All 52 tools defined (49 original + 2 vault fill tools + close_tab).
 *
 * @module tool-definitions
 */

'use strict';

// =========================================================================
// VISUAL-SESSION FIELD BUNDLE (v0.9.62 Implicit Visual Session Contract)
//
// Source-of-truth: .planning/v0.9.62-CONTRACT.md (Field Bundle section).
// Every action tool in the canonical 36-name list (see contract artifact
// -- Action Tools section) MUST merge this fragment into its inputSchema
// via withVisualSessionFields() below. Read-only tools (see contract
// artifact -- Read-Only Tools section) MUST NOT carry this fragment;
// their input schemas remain byte-for-byte unchanged.
//
// The badge allowlist that validates `client` lives at extension/utils/
// mcp-visual-session.js (canonical) with an MCP-side mirror at
// mcp/src/tools/visual-session.ts. The dispatch-chokepoint validator
// wired in Plan 03 (mcp/src/tools/manual.ts) calls
// isAllowedMcpVisualClientLabel() from the mirror; this fragment is
// schema-shape only and does not embed an allowlist.
// =========================================================================

const VISUAL_SESSION_FIELDS = {
  visual_reason: {
    type: 'string',
    description: 'Short human-readable reason shown in the overlay (for example, "Logging in to GitHub"). Required.'
  },
  client: {
    type: 'string',
    description: 'Allowlisted client label. Validated against the shared v0.9.36 server/extension allowlist (see mcp/src/tools/visual-session.ts -- MCP_VISUAL_CLIENT_LABELS). Required.'
  },
  is_final: {
    type: 'boolean',
    description: 'When true, the visual session clears immediately after this tool resolves. Optional (default false).'
  }
};

const VISUAL_SESSION_REQUIRED = ['visual_reason', 'client'];

/**
 * Merge the v0.9.62 visual-session field bundle into a ToolDefinition's
 * inputSchema. Returns a NEW ToolDefinition; the original is not mutated.
 * Apply this helper to every action tool in the canonical 36-name list
 * pinned in .planning/v0.9.62-CONTRACT.md (Action Tools section).
 *
 * @param {ToolDefinition} tool - The ToolDefinition to augment.
 * @returns {ToolDefinition} A new ToolDefinition with visual_reason /
 *   client / is_final added to inputSchema.properties and visual_reason
 *   / client appended to inputSchema.required (deduplicated).
 */
function withVisualSessionFields(tool) {
  const existingProps = (tool.inputSchema && tool.inputSchema.properties) || {};
  const existingRequired = (tool.inputSchema && tool.inputSchema.required) || [];
  return {
    ...tool,
    inputSchema: {
      ...tool.inputSchema,
      type: 'object',
      properties: { ...existingProps, ...VISUAL_SESSION_FIELDS },
      required: Array.from(new Set([...existingRequired, ...VISUAL_SESSION_REQUIRED]))
    }
  };
}

/**
 * @typedef {Object} ToolDefinition
 * @property {string} name - snake_case tool name (per D-01)
 * @property {string} description - When to use, what it does, related tools
 * @property {Object} inputSchema - JSON Schema object with type, properties, required
 * @property {'content'|'cdp'|'background'} _route - Execution route
 * @property {boolean} _readOnly - True for read-only tools that bypass mutation queue
 * @property {string|null} _contentVerb - FSB.tools key for content-routed tools
 * @property {string|null} _cdpVerb - executeCDPToolDirect switch case for CDP tools
 */

/**
 * All 52 browser automation tool definitions.
 * Grouped by category: Navigation, Interaction, Scrolling, Waiting, Tabs, Data, CDP, Read-Only.
 * @type {ToolDefinition[]}
 */
const TOOL_REGISTRY = [

  // =========================================================================
  // POWER TOOL (1 tool)
  // =========================================================================

  withVisualSessionFields({
    name: 'execute_js',
    description: 'Run JavaScript directly in the active page. PRIMARY INTERACTION TOOL: try execute_js FIRST for clicks, scrolls, reads, attribute lookups, and most other DOM work -- it bypasses overlay/obscured-element issues, viewport constraints, and CDP timeouts that block native click/scroll. Typical patterns: `return document.querySelector(\'#add-to-cart-button\').click(), true;` for clicks; `return Array.from(document.querySelectorAll(\'a\')).map(a=>a.href);` for extraction; `window.scrollTo(0, document.body.scrollHeight); return true;` for scroll. After a JS click, verify with read_page or get_page_snapshot (a true click should produce observable DOM change). FALLBACK TO NATIVE TOOLS WHEN: (1) JS click reports success but the page state did not change (framework swallowed the synthetic event -- use native click which fires real CDP events that React/Angular/Vue listen to); (2) typing into controlled text inputs (use native `type` so React onChange fires correctly -- `element.value = ...` will NOT update component state); (3) real drag operations on react-beautiful-dnd / Sortable.js / Trello-style widgets (use drag_drop / drag for real pointer events); (4) form submission that depends on validated input state (use native click on submit). Code runs as a function body -- use `return` to send values back (results are stringified). Async work: Promises are not awaited, so fire-and-forget then poll on `window.__yourKey`. Related: read_page (verify result), get_dom_snapshot (debug after JS click), click / type / drag_drop (fallbacks when JS doesn\'t take effect). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute in the page (use `return` to send a value back, e.g., "return document.title;" or "document.querySelector(\'button\').click()")'
        },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['code']
    },
    _route: 'background',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  // =========================================================================
  // NAVIGATION TOOLS (5 tools)
  // =========================================================================

  withVisualSessionFields({
    name: 'navigate',
    description: 'Open a URL in the active browser tab. Returns the final URL after any redirects. When to use: as the first step to reach a target website. Related: read_page (read content after navigating), list_tabs (see what tabs are already open). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['url']
    },
    _route: 'background',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'search',
    description: 'Search for content on the current site or web. When to use: to find content on the current site or web. Automatically detects the site\'s search input (Amazon, YouTube, GitHub, etc.) via DOM heuristics -- only falls back to Google when no site search exists. Returns search results status. Related: read_page (read search results after searching), click (click a specific search result). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query text' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['query']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'siteSearch',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  }),

  withVisualSessionFields({
    name: 'go_back',
    description: 'Navigate back one page in browser history. Returns the new URL. When to use: to return to the previous page after following a link or navigating away. Related: go_forward (undo a go_back), navigate (go to a specific URL instead). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: []
    },
    _route: 'background',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'go_forward',
    description: 'Navigate forward one page in browser history. Returns the new URL. When to use: after using go_back, to move forward again. Related: go_back (go back in history), navigate (go to a specific URL instead). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: []
    },
    _route: 'background',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'refresh',
    description: 'Reload the current page. Returns the refreshed URL. When to use: when page content may be stale, after errors, or to reset page state. Related: navigate (go to a different URL), wait_for_stable (wait for page to settle after refresh). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: []
    },
    _route: 'background',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  // =========================================================================
  // INTERACTION TOOLS (14 tools)
  // =========================================================================

  withVisualSessionFields({
    name: 'click',
    description: 'Click an element on the page. When to use: to press buttons, follow links, activate controls, or select items. Get selectors from get_dom_snapshot first. If click fails, try refreshing selectors with get_dom_snapshot or use click_at with viewport coordinates. Supports text-based targeting: pass "text" instead of "selector" to click the first visible element containing that text (useful for dynamic apps like LinkedIn where element IDs change). CUSTOM DROPDOWN PATTERN: custom (non-native) dropdowns require TWO clicks -- (1) `click` the dropdown control to open the listbox, (2) `click` the option element. Example: react-select / Material-UI Select / Headless UI -- `click e5` opens, `click e23` picks "Green". `select_option` only works on native <select> elements. Returns whether the click succeeded. Related: get_dom_snapshot (find element selectors/refs), click_at (coordinate-based fallback for canvas/overlay elements), hover (for menus that need hover before click), select_option (for native <select> only). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or element reference from get_dom_snapshot (e.g., "#submit-btn", ".nav-link", or element ref "e5")' },
        text: { type: 'string', description: 'Text content to find and click. Case-insensitive substring match. Clicks the first visible element containing this text. Use when CSS selectors are unstable (e.g., LinkedIn, Facebook). Example: "Latha Pulipati" or "Send message".' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: []
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'click',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'type_text',
    description: 'Type text into an input field by selector. When to use: to fill text inputs, search boxes, or text areas. Use clear_input first if the field already has text. Returns confirmation of typed text. Related: clear_input (clear field before typing), press_enter (submit after typing), get_dom_snapshot (find input selectors). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or element ref for the input field (e.g., "#email", "input[name=search]", or "e12" from get_dom_snapshot)' },
        text: { type: 'string', description: 'Text to type into the field' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['selector', 'text']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'type',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'press_enter',
    description: 'Press the Enter key to submit a form or confirm input. When to use: after typing into a search box or form field. Automatically falls back to clicking the submit button if Enter has no effect. Returns key press confirmation. Related: type_text (type before pressing Enter), click (click submit button directly). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'Optional CSS selector or element reference to press Enter on' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: []
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'pressEnter',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'press_key',
    description: 'Press a keyboard key with optional modifiers (ctrl, shift, alt). Returns key press confirmation. When to use: for keyboard shortcuts (Ctrl+C, Ctrl+V), special keys (Escape, Tab, ArrowDown), or key combinations. Related: press_enter (dedicated Enter key tool), type_text (type full strings), focus (focus element before sending keys). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key to press (e.g., \'Escape\', \'Tab\', \'ArrowDown\')' },
        ctrl: { type: 'boolean', description: 'Hold Ctrl' },
        shift: { type: 'boolean', description: 'Hold Shift' },
        alt: { type: 'boolean', description: 'Hold Alt' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['key']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'keyPress',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'select_option',
    description: 'Select an option from a NATIVE <select> dropdown by value or visible text. NATIVE-ONLY: this tool only works on real <select> elements -- it has no effect on custom (div-based) dropdowns like react-select, Material-UI Select, Headless UI Listbox, or any non-<select> picker. For CUSTOM DROPDOWNS, use the two-click pattern instead: (1) `click` the dropdown control to open the listbox, (2) `click` the desired option element. Example: react-select on react-select.com -- `click e5` to open, then `click e23` on the "Green" option. If `select_option` returns no error but the dropdown value does not change, you are on a custom dropdown -- switch to the two-click pattern. Returns the selected value. Related: get_dom_snapshot (find select element selectors), click (the correct tool for custom non-native dropdowns). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or element ref for the <select> dropdown (e.g., "#country", "select[name=size]", or "e8")' },
        value: { type: 'string', description: 'Option value attribute or visible text (e.g., "US", "Large", "Option 3")' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['selector', 'value']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'selectOption',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'check_box',
    description: 'Toggle a checkbox element. Returns the new checked state. When to use: to check or uncheck form checkboxes or toggle switches. Related: get_dom_snapshot (find checkbox selectors), click (alternative for custom checkbox UI components). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or element reference for the checkbox' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['selector']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'toggleCheckbox',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'hover',
    description: 'Move the mouse over an element. Returns hover confirmation. When to use: to reveal dropdown menus, tooltips, or hover-activated content before clicking. Related: click (click revealed menu item after hover), get_dom_snapshot (find element selectors). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or element reference to hover over' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['selector']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'hover',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  }),

  withVisualSessionFields({
    name: 'right_click',
    description: 'Open context menu on an element. Returns context menu confirmation. When to use: to access right-click context menu options on an element. Related: click (standard left-click), get_dom_snapshot (find element selectors). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or element reference to right-click' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['selector']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'rightClick',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'double_click',
    description: 'Double-click an element. Returns click confirmation. When to use: for actions requiring double-click such as selecting a word, opening items in file managers, or activating edit mode. Related: click (single click), select_text_range (precise text selection by offsets), get_dom_snapshot (find element selectors). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or element reference to double-click' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['selector']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'doubleClick',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'select_text_range',
    description: 'Select a specific substring within a DOM element by character offsets. Uses the Range API to highlight text from startOffset to endOffset within the element\'s text content. Essential for precise text selection like highlighting a specific sentence in a paragraph. Returns the selected text for verification. For selecting an entire element\'s text, use double-click instead. Related: double_click (select entire word/element text), get_text (read element text to determine offsets), get_dom_snapshot (find container selectors). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or element reference for the container element (e.g., "#mw-content-text p:nth-of-type(3)" for third paragraph)' },
        startOffset: { type: 'number', description: 'Character offset where selection starts (0-based, counting from start of element text content)' },
        endOffset: { type: 'number', description: 'Character offset where selection ends (exclusive, like string.substring)' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['selector', 'startOffset', 'endOffset']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'selectTextRange',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'drag_drop',
    description: 'Drag and drop one DOM element onto another using element references. Tries three methods in order: HTML5 DragEvent (dragstart/drop), PointerEvent sequence (for react-beautiful-dnd and similar libraries), and MouseEvent sequence (basic fallback). Use for Kanban card reordering, sortable lists, file drag targets, or any drag-and-drop interaction between two identifiable DOM elements. Returns which method succeeded. For canvas/coordinate-based drag, use the drag tool instead. Related: drag (coordinate-based drag for canvas/map), drop_file (drop files onto upload zones), get_dom_snapshot (find source and target element refs). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceSelector: { type: 'string', description: 'CSS selector or element reference (e.g., "e5", "#card-1") for the element to drag' },
        targetSelector: { type: 'string', description: 'CSS selector or element reference (e.g., "e12", "#column-2") for the drop target element' },
        steps: { type: 'number', description: 'Number of intermediate move events during drag (default 10)' },
        holdMs: { type: 'number', description: 'Milliseconds to hold before starting drag motion (default 150, increase for libraries that need longer press)' },
        stepDelayMs: { type: 'number', description: 'Delay in ms between each move step (default 20)' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['sourceSelector', 'targetSelector']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'dragdrop',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'drop_file',
    description: 'Simulate dropping a file onto a dropzone element. Creates a synthetic File with the given name, content, and MIME type, then dispatches HTML5 DragEvent sequence (dragenter, dragover, drop) on the target element. Use for file upload dropzones (Dropzone.js, react-dropzone, native HTML5 drop handlers). For drag-and-drop of DOM elements (not files), use drag_drop instead. Related: drag_drop (drag DOM elements between containers), get_dom_snapshot (find dropzone selectors). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the dropzone element (the area where files are dropped)' },
        fileName: { type: 'string', description: 'Name of the synthetic file to drop (e.g., "photo.jpg", "document.pdf")' },
        fileContent: { type: 'string', description: 'Text content of the file (for text-based files)' },
        mimeType: { type: 'string', description: 'MIME type of the file (e.g., "text/plain", "image/png", "application/pdf")' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['selector']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'dropfile',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'focus',
    description: 'Move keyboard focus to an element. Returns focus confirmation. When to use: to prepare an element for keyboard input, or to bring an element into the accessibility focus ring. Related: type_text (type into a focused input), press_key (send keystrokes to focused element), click (also focuses the clicked element). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or element reference to focus' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['selector']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'focus',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  }),

  withVisualSessionFields({
    name: 'clear_input',
    description: 'Clear the contents of an input field. Returns clear confirmation. When to use: before typing new text into an already-filled field to remove existing content. Related: type_text (type new text after clearing), get_dom_snapshot (find input selectors). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or element reference for the input to clear' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['selector']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'clearInput',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  // =========================================================================
  // SCROLLING TOOLS (4 tools)
  // =========================================================================

  withVisualSessionFields({
    name: 'scroll',
    description: 'Scroll the page up or down by a specified amount. Returns new scroll position. When to use: to bring off-screen content into view, load lazy-loaded content, or navigate long pages. Related: scroll_to_top, scroll_to_bottom (quick jumps), read_page (read content after scrolling). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
        amount: { type: 'number', description: 'Scroll amount in pixels (default: one viewport)' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['direction']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'scroll',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  }),

  withVisualSessionFields({
    name: 'scroll_to_top',
    description: 'Scroll to the top of the page. Returns confirmation. When to use: to return to the beginning of the page or reset scroll position. Related: scroll_to_bottom (jump to end), scroll (scroll by specific amount), read_page (read content after scrolling). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: []
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'scrollToTop',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'scroll_to_bottom',
    description: 'Scroll to the bottom of the page. Returns confirmation. When to use: to reach the end of the page, load lazy content, or trigger infinite scroll. Related: scroll_to_top (jump to beginning), scroll (scroll by specific amount), read_page (read content after scrolling). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: []
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'scrollToBottom',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'scroll_to_element',
    description: 'Scroll a specific element into the visible viewport. Returns confirmation with element position. When to use: when you need to bring a particular element into view before interacting with it, especially on long pages where the element is off-screen. Related: scroll (scroll by pixel amount), click (interact after scrolling into view), get_dom_snapshot (find element selectors). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or element reference to scroll into view' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['selector']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'scrollToElement',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  // =========================================================================
  // WAITING TOOLS (2 tools)
  // =========================================================================

  {
    name: 'wait_for_element',
    description: 'Wait until an element matching the selector appears on the page. Returns when element is found or times out. When to use: after navigation or actions that load new content asynchronously. Related: wait_for_stable (wait for all DOM changes to settle), read_page (read content after element appears). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to wait for (e.g., ".results-loaded", "#content", "table.data") -- must be CSS, not element ref' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['selector']
    },
    _route: 'content',
    _readOnly: true,
    _contentVerb: 'waitForElement',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  {
    name: 'wait_for_stable',
    description: 'Wait until the page stops changing (no DOM mutations). Returns when page is stable. When to use: after actions that trigger dynamic content loading, animations, or AJAX requests. Note: read_page already auto-waits for stability internally. Related: wait_for_element (wait for a specific element), read_page (read content after page stabilizes). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: []
    },
    _route: 'content',
    _readOnly: true,
    _contentVerb: 'waitForDOMStable',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  // =========================================================================
  // TAB TOOLS (3 tools)
  // =========================================================================

  withVisualSessionFields({
    name: 'open_tab',
    description: 'Open a new browser tab with the given URL. Returns the new tab ID. When to use: when you need to work on a different site without losing the current page. Related: switch_tab (switch between open tabs), list_tabs (see all open tabs), navigate (change URL in current tab instead). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Active behavior: defaults to background (active=false); pass active:true to steal focus.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to open in new tab' },
        active: {
          type: 'boolean',
          default: false,
          description: 'When true, the new tab is foregrounded (steals focus). Multi-agent default is FALSE (background) so this agent does not steal focus from the user or another agent. Set true ONLY when the new tab needs immediate user visibility.'
        }
      },
      required: ['url']
    },
    _route: 'background',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'switch_tab',
    description: 'Select an agent-owned browser tab by tab ID without changing the foreground tab by default. Returns confirmation with the selected tab info. When to use: to move between tabs for multi-tab workflows while keeping the user foreground undisturbed. Pass active:true only when the user explicitly wants this tab foregrounded. Related: list_tabs (get available tab IDs first), open_tab (open a new tab). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64).',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID to select (get IDs from list_tabs tool)' },
        active: {
          type: 'boolean',
          default: false,
          description: 'When true, foreground this tab. Default false selects the tab for this agent without stealing focus.'
        }
      },
      required: ['tabId']
    },
    _route: 'background',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: null,
    // switch_tab can foreground only when params.active === true.
    _forceForeground: true,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'close_tab',
    description: 'Close an agent-owned browser tab without changing the foreground tab. When to use: clean up background tabs opened by this agent after work is complete. By default, refuses to close the current active foreground tab; pass allow_active:true only when the user explicitly wants the active tab closed. Related: open_tab (create a new tab), list_tabs (find tab IDs), switch_tab (select an agent tab). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: {
          type: 'number',
          description: 'Optional. Tab id to close. Omit when the calling agent owns exactly one tab; required to disambiguate when the agent owns multiple.'
        },
        allow_active: {
          type: 'boolean',
          default: false,
          description: 'When true, allow closing the active foreground tab. Default false protects the user-visible active tab.'
        }
      },
      required: []
    },
    _route: 'background',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  // =========================================================================
  // DATA TOOLS (2 tools)
  // =========================================================================

  withVisualSessionFields({
    name: 'fill_sheet',
    description: 'Fill cells in a spreadsheet starting from a given cell with CSV data. Returns fill confirmation. When to use: for bulk data entry into Google Sheets. Related: read_sheet (read existing data before filling), navigate (go to the spreadsheet first). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        startCell: { type: 'string', description: 'Starting cell reference (e.g., "A1", "B5", "D10")' },
        csvData: { type: 'string', description: 'CSV data with \\n for row breaks' },
        sheetName: { type: 'string', description: 'Optional sheet name to set' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['startCell', 'csvData']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'fillsheet',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  {
    name: 'read_sheet',
    description: 'Read cell values from a spreadsheet range. Returns cell values as array. When to use: to extract tabular data from a spreadsheet. Related: fill_sheet (write data), navigate (go to the spreadsheet first). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        range: { type: 'string', description: 'Cell range to read (e.g., \'A1:C5\')' },
        tab_id: {
          type: 'number',
          description: 'Optional. Tab id this read targets. Omit when the calling agent owns exactly one tab; required to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.'
        }
      },
      required: ['range']
    },
    _route: 'content',
    _readOnly: true,
    _contentVerb: 'readsheet',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  // =========================================================================
  // CDP COORDINATE TOOLS (7 tools)
  // =========================================================================

  withVisualSessionFields({
    name: 'click_at',
    description: 'Click at specific viewport coordinates using CDP trusted events. Supports modifier keys for shift+click (multi-select), ctrl+click, alt+click. Coordinates are CSS pixels relative to the browser viewport (use getBoundingClientRect() values). Returns success/failure with method used. When to use: for canvas elements, SVG graphics, overlays, or any element where DOM-based click (click tool) does not work. Fallback for click failures. Related: click (preferred for DOM elements -- use click_at only when click fails), get_dom_snapshot (check element coordinates via position data), drag (for click-and-drag interactions). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate in viewport CSS pixels' },
        y: { type: 'number', description: 'Y coordinate in viewport CSS pixels' },
        shift: { type: 'boolean', description: 'Hold Shift key during click (for multi-select)' },
        ctrl: { type: 'boolean', description: 'Hold Ctrl key during click' },
        alt: { type: 'boolean', description: 'Hold Alt key during click' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['x', 'y']
    },
    _route: 'cdp',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: 'cdpClickAt',
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'click_and_hold',
    description: 'Click and hold at specific viewport coordinates for a specified duration using CDP trusted events. Dispatches mousePressed, waits holdMs milliseconds, then dispatches mouseReleased at the same position. Coordinates are CSS pixels relative to the browser viewport. When to use: for record buttons, long-press menus, or any UI that requires sustained mouse press. Related: click_at (simple click without hold), drag (click, move, and release for dragging interactions). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate in viewport CSS pixels' },
        y: { type: 'number', description: 'Y coordinate in viewport CSS pixels' },
        holdMs: { type: 'number', description: 'Duration to hold the mouse button in milliseconds (default 5000 = 5 seconds)' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['x', 'y']
    },
    _route: 'cdp',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: 'cdpClickAndHold',
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'drag',
    description: 'Drag from one viewport coordinate to another using CDP trusted events. Produces mousePressed at start, N intermediate mouseMoved events, then mouseReleased at end. Essential for canvas drawing tools, sliders, and map interactions where DOM drag events are ignored. Supports modifier keys for constrained drawing (shift+drag). Coordinates are CSS pixels relative to the browser viewport. Related: drag_drop (DOM element-to-element drag using selectors), drag_variable_speed (human-like variable-speed drag for CAPTCHAs), click_at (simple click at coordinates), click_and_hold (press and hold without moving). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        startX: { type: 'number', description: 'Start X coordinate in viewport CSS pixels' },
        startY: { type: 'number', description: 'Start Y coordinate in viewport CSS pixels' },
        endX: { type: 'number', description: 'End X coordinate in viewport CSS pixels' },
        endY: { type: 'number', description: 'End Y coordinate in viewport CSS pixels' },
        steps: { type: 'number', description: 'Number of intermediate mouseMoved events (default 10, increase for smoother drag)' },
        stepDelayMs: { type: 'number', description: 'Delay in ms between each mouseMoved step (default 20)' },
        shift: { type: 'boolean', description: 'Hold Shift key during drag (for constrained movement)' },
        ctrl: { type: 'boolean', description: 'Hold Ctrl key during drag' },
        alt: { type: 'boolean', description: 'Hold Alt key during drag' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['startX', 'startY', 'endX', 'endY']
    },
    _route: 'cdp',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: 'cdpDrag',
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'drag_variable_speed',
    description: 'Drag from one viewport coordinate to another at variable speed using an ease-in-out timing curve. Produces mousePressed at start, N intermediate mouseMoved events with varying delays (slow-fast-slow), then mouseReleased at end. The speed curve mimics human drag behavior: slow acceleration at start, peak speed in the middle, slow deceleration at end. Essential for slider CAPTCHAs and puzzle CAPTCHAs where constant-speed drag is detected as bot behavior. For uniform-speed drag (canvas drawing, map panning), use the regular drag tool instead. Related: drag (uniform-speed drag for canvas/maps), drag_drop (DOM element-to-element drag). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        startX: { type: 'number', description: 'Start X coordinate in viewport CSS pixels (slider thumb position)' },
        startY: { type: 'number', description: 'Start Y coordinate in viewport CSS pixels (slider thumb position)' },
        endX: { type: 'number', description: 'End X coordinate in viewport CSS pixels (target/gap position)' },
        endY: { type: 'number', description: 'End Y coordinate in viewport CSS pixels (usually same as startY for horizontal slider)' },
        steps: { type: 'number', description: 'Number of intermediate mouseMoved events (default 20, more = smoother curve)' },
        minDelayMs: { type: 'number', description: 'Minimum delay in ms between steps at peak speed (default 5, center of drag)' },
        maxDelayMs: { type: 'number', description: 'Maximum delay in ms between steps at start/end (default 40, edges of drag)' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['startX', 'startY', 'endX', 'endY']
    },
    _route: 'cdp',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: 'cdpDragVariableSpeed',
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'scroll_at',
    description: 'Scroll (mouse wheel) at specific viewport coordinates using CDP trusted events. Negative deltaY = zoom in / scroll up, positive deltaY = zoom out / scroll down. Each call dispatches one wheel tick; call multiple times for more zoom. Coordinates are CSS pixels relative to the browser viewport. When to use: for map zoom (Google Maps, Leaflet), canvas zoom, or any element where page-level scrolling does not trigger the desired zoom/scroll behavior. Related: scroll (page-level scroll up/down), scroll_to_top/scroll_to_bottom (quick page jumps). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate in viewport CSS pixels (center of zoom target)' },
        y: { type: 'number', description: 'Y coordinate in viewport CSS pixels (center of zoom target)' },
        deltaY: { type: 'number', description: 'Vertical scroll delta (-120 = one tick zoom in, 120 = one tick zoom out)' },
        deltaX: { type: 'number', description: 'Horizontal scroll delta (usually 0)' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['x', 'y']
    },
    _route: 'cdp',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: 'cdpScrollAt',
    _forceForeground: false,
    _emitChangeReport: false
  }),

  withVisualSessionFields({
    name: 'insert_text',
    description: 'Insert text at the current cursor position via CDP Input.insertText. Bypasses DOM event dispatch and directly inserts into the focused element. When to use: for canvas-based editors (Excalidraw, Google Docs, Slack) where type_text does not work because there is no real input element. The element must already be focused or in edit mode (use double_click_at or click_at first). Related: type_text (for real DOM input fields), double_click_at (enter edit mode in canvas editors before inserting text), click_at (focus canvas element before inserting). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to insert at current cursor position via CDP' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['text']
    },
    _route: 'cdp',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: 'cdpInsertText',
    _forceForeground: false,
    _emitChangeReport: true
  }),

  withVisualSessionFields({
    name: 'double_click_at',
    description: 'Double-click at specific viewport coordinates using CDP trusted events. Dispatches two rapid mousePressed/mouseReleased cycles with clickCount=2 on the second pair. Supports modifier keys. Coordinates are CSS pixels relative to the browser viewport. When to use: for entering edit mode in canvas-based editors (Excalidraw text boxes, Google Sheets cells), selecting words in contenteditable elements, or any double-click on coordinate-targeted elements. Related: click_at (single click at coordinates), double_click (double-click DOM elements by selector), insert_text (type text after entering edit mode via double-click). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate in viewport CSS pixels' },
        y: { type: 'number', description: 'Y coordinate in viewport CSS pixels' },
        shift: { type: 'boolean', description: 'Hold Shift key during double-click' },
        ctrl: { type: 'boolean', description: 'Hold Ctrl key during double-click' },
        alt: { type: 'boolean', description: 'Hold Alt key during double-click' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['x', 'y']
    },
    _route: 'cdp',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: 'cdpDoubleClickAt',
    _forceForeground: false,
    _emitChangeReport: true
  }),

  // =========================================================================
  // READ-ONLY / INFORMATION TOOLS (6 tools)
  // =========================================================================

  {
    name: 'read_page',
    description: 'Read the text content of the current page. When to use: as the FIRST step after navigating to understand what is on the page. Automatically waits for DOM stability on JS-heavy sites. Returns main content prioritized over sidebars/nav/footer, capped at ~8K chars. Related: get_dom_snapshot (get structured element data with selectors for interaction), navigate (go to a page first), scroll (scroll to load more content before reading). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        full: { type: 'boolean', description: 'If true, read entire page; if false (default), read visible viewport only' },
        tab_id: {
          type: 'number',
          description: 'Optional. Tab id this read targets. Omit when the calling agent owns exactly one tab; required to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.'
        }
      },
      required: []
    },
    _route: 'content',
    _readOnly: true,
    _contentVerb: 'readPage',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  {
    name: 'get_text',
    description: 'Get the text content of a specific element. Returns the element\'s text. When to use: to read a specific element\'s text without reading the whole page. Related: read_page (read full page), get_attribute (read element attributes like href, src). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or element ref (e.g., "#price", ".title", or "e3" from get_dom_snapshot)' },
        tab_id: {
          type: 'number',
          description: 'Optional. Tab id this read targets. Omit when the calling agent owns exactly one tab; required to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.'
        }
      },
      required: ['selector']
    },
    _route: 'content',
    _readOnly: true,
    _contentVerb: 'getText',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  {
    name: 'get_attribute',
    description: 'Get an HTML attribute value from an element. Returns the attribute value. When to use: to read href, src, value, data attributes, or ARIA properties from an element. Related: get_text (read element text content), get_dom_snapshot (find element selectors). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or element ref (e.g., "#link", "a.nav-item", or "e7" from get_dom_snapshot)' },
        attribute: { type: 'string', description: 'HTML attribute name (e.g., \'href\', \'src\', \'value\')' },
        tab_id: {
          type: 'number',
          description: 'Optional. Tab id this read targets. Omit when the calling agent owns exactly one tab; required to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.'
        }
      },
      required: ['selector', 'attribute']
    },
    _route: 'content',
    _readOnly: true,
    _contentVerb: 'getAttribute',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  withVisualSessionFields({
    name: 'set_attribute',
    description: 'Set an HTML attribute value on an element. Returns confirmation. When to use: to modify element attributes for form manipulation, changing hidden field values, toggling ARIA states, or setting data attributes. Related: get_attribute (read attribute value first), get_dom_snapshot (find element selectors). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or element ref for the target element' },
        attribute: { type: 'string', description: 'HTML attribute name to set' },
        value: { type: 'string', description: 'Value to set the attribute to' },
        tab_id: { type: 'number', description: 'Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.' }
      },
      required: ['selector', 'attribute', 'value']
    },
    _route: 'content',
    _readOnly: false,
    _contentVerb: 'setAttribute',
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: true
  }),

  {
    name: 'get_dom_snapshot',
    description: 'Get a structured DOM snapshot with element references (e.g., e1, e2, e3). When to use: BEFORE any interaction tool (click, type_text, etc.) to find the right selector or element ref. Returns elements with tag, text, attributes, and position data. Element refs like \'e5\' can be passed directly to click, type_text, hover, and other tools. Related: read_page (quick text content), click/type_text/hover (use refs from this snapshot). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        maxElements: { type: 'number', description: 'Maximum elements to include (default: 2000)' },
        tab_id: {
          type: 'number',
          description: 'Optional. Tab id this read targets. Omit when the calling agent owns exactly one tab; required to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.'
        }
      },
      required: []
    },
    _route: 'content',
    _readOnly: true,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  {
    name: 'list_tabs',
    description: 'List all open browser tabs with title, URL, and active status. Returns array of tab objects. When to use: to see all open tabs before switching. Related: switch_tab (switch to a tab by ID), open_tab (open a new tab). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    _route: 'background',
    _readOnly: true,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  // =========================================================================
  // ON-DEMAND CONTEXT TOOLS (3 tools) -- Phase 138
  // =========================================================================

  {
    name: 'get_page_snapshot',
    description: 'Get a markdown snapshot of the current page DOM. Returns interactive elements with ref IDs for targeting. When to use: BEFORE any click/type/interaction to see current page state. Call this at the start of each new page or when you need to find elements. Related: read_page (plain text content), get_text (single element text). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64). Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: {
          type: 'number',
          description: 'Optional. Tab id this read targets. Omit when the calling agent owns exactly one tab; required to disambiguate when the agent owns multiple. Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this.'
        }
      },
      required: []
    },
    _route: 'content',
    _readOnly: true,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  {
    name: 'get_site_guide',
    description: 'Get site-specific automation guidance for a domain. Returns selectors, navigation patterns, and tips for automating the site. When to use: when starting work on a new site or when standard selectors fail. Related: get_page_snapshot (see current elements), get_dom_snapshot (raw DOM). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64).',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Domain name to get guide for (e.g. "google.com", "github.com")'
        }
      },
      required: ['domain']
    },
    _route: 'background',
    _readOnly: true,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  {
    name: 'search_memory',
    description: 'Search FSB memory for relevant past experiences on similar sites or tasks. Returns memories ranked by relevance using keyword + recency scoring (same scorer the MCP search_memory tool uses). PURPOSE: consult prior experience before deciding the next action so you do not redo work or repeat known-bad selectors. WHEN TO USE: (a) before attempting an unfamiliar interaction pattern on a new domain, (b) when stuck after 3+ failed attempts on the same target, or (c) when the prompt-injected memory hints clearly do not cover the current sub-task. Use sparingly -- this is a read-only research call, not a per-turn ritual. PARAMETERS: query (natural-language search, required), domain (optional filter such as "amazon.com" -- pass the bare hostname), type (optional: task | episodic | semantic | procedural), topN (optional max results, default 5, hard-capped at 25). RETURNS: array of memory entries with id, type, text excerpt, and metadata. RELATED: report_progress (narrate what you learned), get_site_guide (curated selectors instead of free-form memory). Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query describing the situation or pattern you are looking for' },
        domain: { type: 'string', description: 'Optional domain filter, e.g. "amazon.com" -- pass the bare hostname without scheme' },
        type: { type: 'string', enum: ['task', 'episodic', 'semantic', 'procedural'], description: 'Optional memory type filter' },
        topN: { type: 'number', description: 'Maximum results to return (default 5, capped at 25)' }
      },
      required: ['query']
    },
    _route: 'background',
    _readOnly: true,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  {
    name: 'report_progress',
    description: 'Bonus pairing with start_visual_session: sends real-time narration to the overlay using the same session_token. Display a status message in the overlay. Without session_token, THIS TOOL DOES NOT PERFORM ANY ACTION -- it is narration only and never clicks, types, navigates, submits, or changes the page. Provide session_token only when continuing a client-owned visual session previously started with start_visual_session. Do NOT describe clicks, typing, or submissions in the message unless you have already called the corresponding action tool (click, type_text, press_enter, select_option, navigate, ...) in the same or a previous turn. When to use: between real action tools to keep the user informed of what you are doing. Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64).',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Progress message to display to the user (e.g. "Filling out the contact form", "Searching for flights")'
        },
        session_token: {
          type: 'string',
          description: 'Optional token returned by start_visual_session. Provide this only when updating a client-owned visual session; omit it for normal narration-only progress.'
        }
      },
      required: ['message']
    },
    _route: 'background',
    _readOnly: true,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  // =========================================================================
  // TASK LIFECYCLE TOOLS (3 tools)
  // =========================================================================

  {
    name: 'complete_task',
    description: 'Signal that the task is fully complete. ONLY call this when the user\'s requested task has been fully achieved -- all data collected, all entries made, all actions performed. Include a summary of what was accomplished. Provide session_token only when completing a client-owned visual session created by start_visual_session; otherwise omit it and keep the normal task-lifecycle semantics. Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64).',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Summary of what was accomplished (e.g. "Found 50 Tesla internships and added them to Google Sheet with title, department, location columns")' },
        session_token: {
          type: 'string',
          description: 'Optional token returned by start_visual_session. Provide this only when finalizing a client-owned visual session.'
        }
      },
      required: ['summary']
    },
    _route: 'background',
    _readOnly: true,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  {
    name: 'partial_task',
    description: 'Signal that the task is partially complete because useful work was completed but an external blocker prevents the final step. Use this instead of fail_task when the user can still benefit from the completed work, especially for auth/manual handoff blockers after research, drafting, or data entry is already done. Auth/manual blockers include login required, no saved credentials, user skipped login, credentials failed, and manual approval, MFA, or external verification. Preserve three things clearly: what you completed, the exact blocker, and the manual next step the user should take. If the runtime offers one saved-credential or operator-prompt attempt, let that single attempt happen first; call partial_task only after that attempt is unavailable, skipped, exhausted, or fails. Provide session_token only when finalizing a client-owned visual session created by start_visual_session. Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64).',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Summary of the useful work that was completed before the blocker was hit' },
        blocker: { type: 'string', description: 'What prevented the final step from being completed (e.g. "Messaging requires login", "Manual approval required")' },
        next_step: { type: 'string', description: 'Manual next step the user can take to finish manually or resume later. Include this for auth or approval blockers.' },
        reason: {
          type: 'string',
          description: 'Optional machine-readable blocker category. Keep it narrow and stable for blocked/manual-handoff outcomes.',
          enum: ['blocked', 'auth_required', 'credentials_missing', 'user_skipped_login', 'credentials_failed', 'manual_approval']
        },
        session_token: {
          type: 'string',
          description: 'Optional token returned by start_visual_session. Provide this only when finalizing a client-owned visual session.'
        }
      },
      required: ['summary', 'blocker']
    },
    _route: 'background',
    _readOnly: true,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  {
    name: 'fail_task',
    description: 'Signal that the task cannot be completed. Include the reason why. Call this instead of just stopping when you encounter an unrecoverable problem. Provide session_token only when ending a client-owned visual session created by start_visual_session; otherwise omit it and keep the normal task-failure semantics. Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED; cap configurable (default 8, 1-64).',
    inputSchema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why the task cannot be completed (e.g. "Page requires login", "Data not found on page")' },
        session_token: {
          type: 'string',
          description: 'Optional token returned by start_visual_session. Provide this only when failing a client-owned visual session.'
        }
      },
      required: ['reason']
    },
    _route: 'background',
    _readOnly: true,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  // =========================================================================
  // TRIGGER TOOLS (4 tools)
  // =========================================================================

  {
    name: 'trigger',
    description: 'Arm a reactive DOM trigger on one selector. Use this when the user wants to watch an element until it changes, crosses a threshold, equals or matches a value, or contains text. The watch is owned by the background trigger runtime and persisted across service-worker eviction. Pass one selector and one condition object; runtime validation checks the nested condition details before arming. Use stop_trigger to cancel, get_trigger_status to inspect one watcher, and list_triggers to enumerate watchers.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or stable element selector to watch.'
        },
        condition: {
          type: 'object',
          description: 'Trigger condition object validated by the trigger manager. Supported kinds include changed, threshold, delta_percent, equals, contains, regex, and compound AND/OR conditions.',
          additionalProperties: true
        },
        watch: {
          type: 'string',
          enum: ['live-observe', 'refresh-poll'],
          description: 'Optional watch mechanism. live-observe uses in-page mutation observation; refresh-poll periodically reloads the trigger-owned tab and reads the selector.'
        },
        tab_id: {
          type: 'number',
          description: 'Optional. Tab id to arm the trigger against. Alias of target_tab_id for callers that use ordinary tool tab targeting.'
        },
        target_tab_id: {
          type: 'number',
          description: 'Optional. Explicit target tab id for the watched page.'
        },
        extract: {
          type: 'string',
          enum: ['text', 'number', 'attribute'],
          description: 'Optional value extraction mode. Defaults are selected by the trigger runtime from the condition.'
        },
        attribute: {
          type: 'string',
          description: 'Optional attribute name when extract is attribute.'
        },
        attrName: {
          type: 'string',
          description: 'Optional alias for attribute when content-side trigger readers use attrName.'
        },
        poll_interval_ms: {
          type: 'number',
          description: 'Optional refresh-poll interval in milliseconds. The background runtime enforces its minimum floor.'
        },
        locale: {
          type: 'string',
          description: 'Optional locale hint for numeric parsing, such as en-US or de-DE.'
        },
        decimal_separator: {
          type: 'string',
          description: 'Optional decimal separator override for numeric parsing.'
        }
      },
      required: ['selector', 'condition']
    },
    _route: 'background',
    _readOnly: false,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  {
    name: 'stop_trigger',
    description: 'Cancel a trigger by id. This is cancellation-critical and bypass-class: it must be callable promptly even if a trigger or another mutation is pending. Missing or already terminal triggers are handled idempotently by the background trigger runtime.',
    inputSchema: {
      type: 'object',
      properties: {
        trigger_id: {
          type: 'string',
          description: 'Trigger id returned by trigger.'
        },
        tab_id: {
          type: 'number',
          description: 'Optional. Tab id associated with the trigger when needed for scoped cleanup.'
        }
      },
      required: ['trigger_id']
    },
    _route: 'background',
    _readOnly: true,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  {
    name: 'get_trigger_status',
    description: 'Read the persisted status for one trigger by id. Returns storage-of-truth trigger state including status, watch mode, condition, target tab, owner, current value, timing, and attention details when available.',
    inputSchema: {
      type: 'object',
      properties: {
        trigger_id: {
          type: 'string',
          description: 'Trigger id returned by trigger.'
        },
        tab_id: {
          type: 'number',
          description: 'Optional. Tab id used to disambiguate scoped trigger access.'
        }
      },
      required: ['trigger_id']
    },
    _route: 'background',
    _readOnly: true,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  {
    name: 'list_triggers',
    description: 'List persisted trigger snapshots. By default, returns active and attention-state watchers; include_terminal can include fired and stopped triggers for audit or cleanup workflows.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['armed', 'blocked', 'fired', 'stopped'],
          description: 'Optional status filter.'
        },
        include_terminal: {
          type: 'boolean',
          description: 'Optional. When true, include terminal fired or stopped triggers in the listing.'
        },
        tab_id: {
          type: 'number',
          description: 'Optional. Limit results to a target tab when supported by the background route.'
        }
      },
      required: []
    },
    _route: 'background',
    _readOnly: true,
    _contentVerb: null,
    _cdpVerb: null,
    _forceForeground: false,
    _emitChangeReport: false
  },

  // =========================================================================
  // VAULT FILL TOOLS -- registered separately via vault.ts (security boundary)
  // Tools: list_credentials, fill_credential, list_payment_methods, use_payment_method
  // NOT in this registry to avoid duplicate registration errors.
  // =========================================================================
];

// =========================================================================
// HELPER FUNCTIONS
// =========================================================================

/**
 * Look up a tool definition by name.
 * @param {string} name - Tool name (snake_case)
 * @returns {ToolDefinition|null} Tool definition or null if not found
 */
function getToolByName(name) {
  return TOOL_REGISTRY.find(t => t.name === name) || null;
}

/**
 * Get all read-only tools (those that bypass the mutation queue).
 * @returns {ToolDefinition[]} Array of read-only tool definitions
 */
function getReadOnlyTools() {
  return TOOL_REGISTRY.filter(t => t._readOnly);
}

/**
 * Get all tools for a specific execution route.
 * @param {'content'|'cdp'|'background'} route - The execution route
 * @returns {ToolDefinition[]} Array of tool definitions for that route
 */
function getToolsByRoute(route) {
  return TOOL_REGISTRY.filter(t => t._route === route);
}

// =========================================================================
// EXPORTS
// =========================================================================

// CommonJS for Chrome extension context and Node.js require()
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TOOL_REGISTRY,
    getToolByName,
    getReadOnlyTools,
    getToolsByRoute,
    VISUAL_SESSION_FIELDS,
    VISUAL_SESSION_REQUIRED,
    withVisualSessionFields
  };
}
