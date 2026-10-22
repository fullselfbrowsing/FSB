/**
 * MCP-only tool text (Phase 69 D-07).
 *
 * The shared registry (extension/ai/tool-definitions.js, copied to
 * mcp/ai/tool-definitions.cjs at build time) stays the autopilot source and
 * is never edited for MCP wording. The short text below is applied at MCP
 * registration instead, so only `.describe()` text changes on the MCP wire:
 * names, types, required lists, defaults and enums are untouched, and the
 * autopilot prompt is unchanged with Jev off.
 *
 * Writing rules (Phase 69 D-09 / D-10):
 * - the first sentence of a tool description carries its search terms;
 * - the multi-agent / TAB_NOT_OWNED rule is written once, in the common
 *   tab_id text, never per tool;
 * - the client text names common labels and says how matching works; it
 *   never points at a source file;
 * - the change-report suffix is one sentence that says to inspect the page
 *   before retrying.
 *
 * The lookups never throw: a missing entry falls back to the registry text so
 * the server still starts. Coverage is enforced by
 * tests/mcp-description-budget.test.js instead.
 */

type TextTable = Readonly<Record<string, string>>;

// Common parameter text, shared by every tool that publishes the parameter.
export const MCP_COMMON_PARAM_DESCRIPTIONS: TextTable = Object.freeze({
  tab_id: "Optional target tab; omit if this agent owns one tab. Another agent's tab is rejected (TAB_NOT_OWNED).",
  visual_reason: 'Short reason shown in the overlay.',
  client: 'Client label such as Claude, Codex, Cursor, ChatGPT, Gemini, VS Code, Copilot or Windsurf; case, spaces, _ and - are ignored.',
  is_final: 'True clears the overlay after this call.',
});

// Appended (after one space) to the description of every action tool whose
// registry entry has _emitChangeReport === true.
export const MCP_CHANGE_REPORT_SENTENCE =
  'Returns change_report (what changed); if the outcome is unknown, inspect the page before retrying.';

// The description of the optional `expect` parameter (published by plan 69-06).
export const MCP_EXPECT_DESCRIPTION =
  'Optional same-call check after the action; expect_result reports verified, unmet or uncertain. If unmet or uncertain, inspect the page before retrying.';

// Tool name -> short MCP description.
export const MCP_TOOL_DESCRIPTIONS: TextTable = Object.freeze({
  // --- registry action tools (registerManualTools, Phase 69 plan 02) ---
  execute_js: 'Execute JavaScript in the page as a function body; use return to send a value back (stringified; Promises are not awaited, so poll a window key for async work). Try it first for DOM reads, clicks and scrolls: it avoids overlay, viewport and CDP timeout issues. Verify a JS click with read_page. Fall back to native tools when a JS click changes nothing (click), for typing into controlled inputs (type_text), for real drags (drag_drop or drag), and for submits that need validated input (click the submit button).',
  navigate: 'Navigate the tab to a URL; returns the final URL after redirects.',
  search: 'Search the current site with its own search box, found automatically; falls back to Google when the site has none. Read results with read_page.',
  go_back: 'Go back one page in browser history; returns the new URL.',
  go_forward: 'Go forward one page in browser history; returns the new URL.',
  refresh: 'Refresh (reload) the current page; returns its URL.',
  click: 'Click an element by CSS selector, element ref (e5) from get_dom_snapshot, or visible text. Custom (non-native) dropdowns take two clicks: open the control, then click the option; select_option is for native <select> only. For canvas or overlay targets, use click_at.',
  type_text: 'Type text into an editable field by selector or ref. Replaces existing text by default (clear_first false appends); in Google Docs it inserts at the cursor unless clear_first is true. Returns the rendered text.',
  press_enter: 'Press Enter to submit a form or confirm input; falls back to clicking the submit button if Enter has no effect.',
  press_key: 'Press a keyboard key, optionally with ctrl, shift or alt, for shortcuts and special keys such as Escape, Tab or ArrowDown.',
  select_option: 'Select an option in a native <select> dropdown by value or visible text. Native <select> only: for custom (div-based) dropdowns use two clicks, first on the control and then on the option. If no error is returned but the value does not change, it is a custom dropdown.',
  check_box: 'Check or uncheck (toggle) a checkbox or switch; returns the new checked state. For custom checkbox widgets, use click.',
  hover: 'Hover the mouse over an element to reveal menus, tooltips or other hover content before clicking.',
  right_click: 'Right-click an element to open its context menu.',
  double_click: 'Double-click an element, for example to select a word or enter edit mode.',
  select_text_range: 'Select text inside an element by character offsets (startOffset to endOffset, end exclusive); returns the selected text. To select a whole word, use double_click.',
  drag_drop: 'Drag and drop one DOM element onto another by selector or ref, for Kanban cards and sortable lists. Tries HTML5 drag events, then pointer, then mouse events, and returns which worked. For canvas or coordinate drags, use drag.',
  drop_file: 'Drop a synthetic text file (name, content, MIME type) onto a dropzone element. For real files on disk, use upload_file; to move DOM elements, use drag_drop.',
  focus: 'Focus an element to prepare it for keyboard input.',
  clear_input: 'Clear the contents of an input field.',
  scroll: 'Scroll the page up or down by pixels (default one viewport); returns the new position.',
  scroll_to_top: 'Scroll to the top of the page.',
  scroll_to_bottom: 'Scroll to the bottom of the page, for example to load lazy content.',
  scroll_to_element: 'Scroll an element into view; returns its position.',
  open_tab: 'Open a URL in a new tab; returns the tab ID. The tab opens in the background unless active is true.',
  switch_tab: 'Switch to a tab this agent owns, by tab ID from list_tabs. The foreground tab does not change unless active is true.',
  close_tab: 'Close a tab this agent owns without changing the foreground tab. It refuses to close the active tab unless allow_active is true; set that only when the user asks to close the active tab.',
  fill_sheet: 'Fill Google Sheets cells with CSV data, starting at a given cell. Open the sheet first; large fills can take minutes.',
  click_at: 'Click at viewport coordinates (CSS pixels) with trusted CDP events, optionally with shift, ctrl or alt. Use it for canvas, SVG or overlay targets when click fails.',
  click_and_hold: 'Click and hold at viewport coordinates for holdMs, for record buttons or long-press menus.',
  drag: 'Drag between two viewport coordinates with trusted CDP mouse events, for canvas drawing, sliders and maps. For DOM elements use drag_drop; for slider CAPTCHAs use drag_variable_speed.',
  drag_variable_speed: 'Drag between two viewport coordinates with a human-like slow-fast-slow speed curve, for slider and puzzle CAPTCHAs. For uniform drags, use drag.',
  scroll_at: 'Scroll the mouse wheel at viewport coordinates, for map or canvas zoom. Negative deltaY zooms in or scrolls up; each call sends one tick.',
  insert_text: 'Insert text with CDP at the caret (default), at the end, or replacing an editable field (position replace_all). Canvas editors need focus first.',
  double_click_at: 'Double-click at viewport coordinates with trusted CDP events, for example to edit a canvas text box or a Sheets cell.',
  set_attribute: 'Set an HTML attribute on an element, for example a hidden field value, an ARIA state or a data attribute.',
  upload_file: 'Upload a real file from an absolute local path to an <input type=file>, or a dropzone wrapping one, through CDP. Secret paths such as ~/.ssh, ~/.aws, .env, private keys and the FSB vault are blocked, and uploads are audit-logged. For dropzones with no file input, use drop_file.',

  // --- registry read-only tools (read-only.ts, Phase 69 plan 04) ---
  read_page: 'Read the page text content: the visible viewport by default, or the whole page with full true. Use it first after navigating; it waits for the DOM to settle and puts main content before navigation, capped at about 8K characters. For selectors or element refs, use get_dom_snapshot.',
  get_text: 'Get the text content of one element by selector or ref, without reading the whole page. For attributes such as href or src, use get_attribute.',
  get_attribute: 'Get an HTML attribute value from an element, such as href, src, value, a data attribute or an ARIA state. For element text, use get_text.',
  get_dom_snapshot: 'Get a structured DOM snapshot of the page elements with refs (e1, e2, ...), tag, text, attributes and position. Take one before click, type_text, hover and other actions, which accept a ref (e5) in place of a selector. For plain page text, use read_page.',
  list_tabs: 'List open browser tabs with their ID, title, URL and active state. Pass an ID to switch_tab to switch tabs.',
  read_sheet: 'Read cell values from a spreadsheet range, such as A1:C5; returns them as an array. Navigate to the sheet first; to write cells, use fill_sheet.',
  get_page_snapshot: 'Get a markdown snapshot of the current page with ref IDs for its interactive elements. Take one at the start of each page and before clicking or typing. For plain text, use read_page.',
  get_site_guide: 'Get the site guide for a domain: known selectors, navigation patterns and automation tips. Use it when starting on a new site or when standard selectors fail.',
  complete_task: 'Signal that the task is complete. Call it only when everything the user asked for is done, with a summary of what was accomplished; never include passwords, tokens, API keys or sensitive form values.',
  partial_task: 'Signal that the task is partially complete: useful work is done, but a blocker such as login, missing or failed credentials, MFA or manual approval stops the final step. Use it instead of fail_task when the finished work still helps the user. Report what you completed, the exact blocker and the manual next step; never include passwords, tokens, API keys or sensitive form values. Let any offered saved-credential or operator-prompt attempt run first.',
  fail_task: 'Signal that the task failed and cannot be completed, with the reason. Call it instead of just stopping on an unrecoverable problem; never include passwords, tokens, API keys or sensitive form values.',

  // --- registry trigger tools (triggers.ts) ---
  trigger: 'Arm a trigger that watches one element until it changes, crosses a threshold, equals or matches a value, or contains text. The watch survives service-worker restarts. The call blocks until the trigger fires or times out unless detached is true; manage it with stop_trigger, get_trigger_status and list_triggers.',
  stop_trigger: 'Stop (cancel) a trigger by trigger_id. It runs promptly even while a trigger or another call is pending, and is safe to repeat on missing or finished triggers.',
  get_trigger_status: 'Get the stored status of one trigger by id: state, watch mode, condition, target tab, owner, current value, timing and any attention details.',
  list_triggers: 'List triggers with their stored status. Returns active and needs-attention watchers by default; include_terminal adds fired and stopped ones.',

  // --- registry screenshot tool (screenshots.ts) ---
  capture_screenshot: 'Capture a screenshot of the page as a lossless PNG: the viewport, the full page, a region or one element. It renders CSS, fonts, SVG, canvas and open shadow DOM but not browser chrome; FSB overlays are hidden by default. Returns an image and a private saved file. Desktop or mobile emulation is temporary and never reloads the page or changes the user agent.',

  // --- vault tools (vault.ts) ---
  list_credentials: 'List saved credentials as domain and username pairs; passwords are never returned. To fill a login form, use fill_credential.',
  fill_credential: "Fill a login form with the saved credential for the tab's domain. The password is resolved inside the extension and typed into the page; it is never returned or sent over the bridge. The credential vault must be unlocked.",
  list_payment_methods: 'List saved payment methods: card brand, last 4 digits and cardholder name only; full card numbers and CVV are never returned. To fill a checkout form, use use_payment_method.',
  use_payment_method: 'Use a saved payment method to fill a checkout form. A confirmation prompt shows the card brand, last 4 digits and merchant domain before any fill. Card data is resolved inside the extension and never returned; the merchant domain comes from the tab URL, not this request. The credential vault and payment access must be unlocked.',

  // --- capability tools (capabilities.ts) ---
  search_capabilities: 'Search the FSB capability catalog by intent; use it before DOM tools for first-party actions on the current site. Returns up to topN hits ranked toward the tab origin, each with slug, service, side-effect class (read, mutate or destructive), readiness and a params schema. Only t1-ready hits run as direct API calls.',
  invoke_capability: "Invoke a capability by slug from a search_capabilities hit, with params matching its schema. Ready capabilities call the service's real web API in your signed-in session, and mutating ones perform real side effects, so check the side-effect class first. On RECIPE_DOM_FALLBACK_PENDING, RECIPE_LEARN_PENDING or RECIPE_EXPIRED, continue the task with DOM tools.",

  // --- back (agents.ts); the mcp:go-back route returns no change_report, so
  // only the inspect-before-retrying guidance is kept from that sentence ---
  back: "Go back one step in browser history on the agent's tab (single step, no count). It does not steal focus, so it works on background tabs. Returns status ok, no_history, cross_origin, bf_cache or fragment_only, with resultingUrl and historyDepth; if the outcome is unknown, inspect the page before retrying.",

  // --- observability tools (observability.ts) ---
  list_sessions: 'List past FSB automation sessions with task, status, duration, action count and cost. Pass a session ID to get_session_detail to inspect it.',
  get_session_detail: 'Get full detail for one automation session: logs, action history and timing, as JSON or a text report. For a session still running (currentSessionId from get_task_status), it returns a partial snapshot with final: false.',
  get_session_replay: 'Get the verified, redacted replay manifest of a recorded session: executable steps, logical tab targets, risk classes and the manifest hash, without signing receipts. Use it instead of rebuilding a replay from logs.',
  replay_session: 'Replay a recorded session after the user approves it. FSB verifies the signed manifest and shows one approval card in the side panel; nothing runs until the user approves that exact manifest. FSB opens the recorded tabs itself, so never ask the user to open target pages manually.',
  get_logs: 'Get recent automation logs, or the logs of one session, with an error and warning summary, to debug what FSB has been doing.',
  search_memory: 'Search FSB memory for past experiences on similar sites or tasks, ranked by keyword relevance and recency. Use it before automating a site to reuse what FSB learned.',
  get_memory_stats: 'Get FSB memory statistics: total count, breakdown by type and storage used.',

  // --- autopilot tools (autopilot.ts) ---
  run_task: 'Run a task with the FSB autopilot, whose built-in AI chooses the steps. Use it only when the user asks for autopilot, says "run a task" or says "let FSB handle it"; otherwise use the manual tools, which are more reliable. It waits for the task to end and returns a completion summary with success status and action log. Progress arrives as notifications; without them, poll get_task_status. Cancel with stop_task.',
  stop_task: "Stop (cancel) the running autopilot task to regain manual control, for example when run_task is slow or off track. Only the calling agent's task is cancelled.",
  get_task_status: "Get the status of the running autopilot task: whether it is running, percent complete, current phase and ETA. Poll it when progress notifications do not arrive; it reports the calling agent's task only.",

  // --- removed visual-session tools (visual-session.ts) ---
  start_visual_session: 'Start a visual session: REMOVED in v0.9.0, returns TOOL_REMOVED. Visual sessions are now implicit: pass visual_reason and client on any action tool, and is_final true to clear the overlay.',
  end_visual_session: 'End a visual session: REMOVED in v0.9.0, returns TOOL_REMOVED. The session now clears after 60 seconds without calls, or at once when an action tool is called with is_final true.',

  // --- settings (settings.ts, Phase 66.1; its contract test pins this text) ---
  settings: 'Read or change FSB settings. No args returns all; key returns one with its allowed values; key and value sets it. API keys and endpoints are read-only.',
});

// Tool name -> parameter name -> short MCP parameter description. Per-tool
// entries win over MCP_COMMON_PARAM_DESCRIPTIONS. Short registry text that
// needs no change is not repeated here.
export const MCP_PARAM_DESCRIPTIONS: Readonly<Record<string, TextTable>> = Object.freeze({
  execute_js: Object.freeze({
    code: 'JavaScript function body; use return to send a value back.',
  }),
  click: Object.freeze({
    selector: 'CSS selector or element ref (e5) from get_dom_snapshot.',
    text: 'Visible text to click instead of a selector; first visible case-insensitive match.',
  }),
  type_text: Object.freeze({
    selector: 'CSS selector or element ref of the field.',
    clear_first: 'Replace existing text; default true, but false in Google Docs (inserts at the cursor). False appends.',
  }),
  select_option: Object.freeze({
    selector: 'CSS selector or element ref of the <select>.',
    value: 'Option value or visible text.',
  }),
  select_text_range: Object.freeze({
    selector: 'CSS selector or element ref of the container.',
    startOffset: "Start offset in the element's text (0-based).",
    endOffset: 'End offset (exclusive).',
  }),
  drag_drop: Object.freeze({
    sourceSelector: 'Selector or ref of the element to drag.',
    targetSelector: 'Selector or ref of the drop target.',
    steps: 'Intermediate moves (default 10).',
    holdMs: 'Hold before moving, in ms (default 150).',
  }),
  drop_file: Object.freeze({
    selector: 'CSS selector of the dropzone.',
    fileName: 'File name, such as photo.jpg.',
    mimeType: 'MIME type, such as text/plain or image/png.',
  }),
  open_tab: Object.freeze({
    active: 'True foregrounds the new tab (steals focus); default false opens it in the background.',
  }),
  switch_tab: Object.freeze({
    active: 'True foregrounds the tab; default false leaves focus unchanged.',
  }),
  close_tab: Object.freeze({
    tab_id: 'Tab to close; omit if this agent owns one tab.',
    allow_active: 'True allows closing the active foreground tab (default false).',
  }),
  click_and_hold: Object.freeze({
    holdMs: 'Hold time in ms (default 5000).',
  }),
  drag: Object.freeze({
    steps: 'Intermediate moves (default 10; more is smoother).',
    stepDelayMs: 'Delay between moves in ms (default 20).',
    shift: 'Hold Shift (constrained movement).',
  }),
  drag_variable_speed: Object.freeze({
    startX: 'Start X in viewport CSS pixels (slider thumb).',
    startY: 'Start Y in viewport CSS pixels.',
    endX: 'End X in viewport CSS pixels (target gap).',
    endY: 'End Y in viewport CSS pixels (often startY).',
    steps: 'Intermediate moves (default 20; more is smoother).',
    minDelayMs: 'Shortest delay between moves in ms, at peak speed (default 5).',
    maxDelayMs: 'Longest delay between moves in ms, at the ends (default 40).',
  }),
  insert_text: Object.freeze({
    text: 'Text to insert.',
  }),
  upload_file: Object.freeze({
    selector: 'CSS selector of the <input type=file>, or of a dropzone that wraps a hidden one.',
    file_path: 'Absolute path of the file on disk; relative and ~ paths are rejected.',
  }),

  // --- registry read-only tools ---
  get_text: Object.freeze({
    selector: 'CSS selector or element ref (e3) from get_dom_snapshot.',
  }),
  get_attribute: Object.freeze({
    selector: 'CSS selector or element ref (e7) from get_dom_snapshot.',
    attribute: 'Attribute name, such as href, src or value.',
  }),
  complete_task: Object.freeze({
    summary: 'What was accomplished.',
    tab_id: 'Tab this outcome belongs to, when more than one may be active.',
    session_token: 'Token from start_visual_session; only to finalize a client-owned visual session.',
  }),
  partial_task: Object.freeze({
    summary: 'Useful work completed before the blocker.',
    blocker: 'What blocked the final step, such as "Messaging requires login".',
    next_step: 'Manual step the user can take to finish or resume; include it for auth or approval blockers.',
    tab_id: 'Tab this outcome belongs to, when more than one may be active.',
    reason: 'Optional blocker category.',
    session_token: 'Token from start_visual_session; only to finalize a client-owned visual session.',
  }),
  fail_task: Object.freeze({
    reason: 'Why the task cannot be completed, such as "Page requires login".',
    tab_id: 'Tab this outcome belongs to, when more than one may be active.',
    session_token: 'Token from start_visual_session; only to end a client-owned visual session.',
  }),

  // --- registry trigger tools ---
  trigger: Object.freeze({
    selector: 'CSS selector of the element to watch.',
    condition: 'Condition object: changed, threshold, delta_percent, equals, contains, regex, or AND/OR of these.',
    trigger_id: 'Optional correlation id (generated if omitted).',
    detached: 'True returns trigger_id at once instead of blocking.',
    timeout_ms: 'Blocking wait in ms (default 120000), then timed_out.',
    rearm_on_fire: 'True keeps watching after a fire (see fire_count, last_event).',
    watch: 'live-observe (DOM mutations) or refresh-poll (reload and re-read).',
    tab_id: 'Optional tab to watch; alias of target_tab_id.',
    target_tab_id: 'Optional tab to watch.',
    extract: 'text, number or attribute (default from the condition).',
    attribute: 'Attribute name when extract is attribute.',
    attrName: 'Alias of attribute.',
    poll_interval_ms: 'refresh-poll interval in ms (runtime minimum applies).',
    locale: 'Number-parsing locale, such as de-DE.',
    decimal_separator: 'Decimal separator override.',
  }),
  stop_trigger: Object.freeze({
    tab_id: 'Optional tab of the trigger, for scoped cleanup.',
  }),
  get_trigger_status: Object.freeze({
    tab_id: 'Optional tab id for scoped trigger access.',
  }),
  list_triggers: Object.freeze({
    include_terminal: 'True also lists fired and stopped triggers.',
    tab_id: 'Optional tab to filter by.',
  }),

  // --- registry screenshot tool ---
  capture_screenshot: Object.freeze({
    coordinate_space: 'Region coordinates: viewport (default) or page.',
    x: 'Region left edge, CSS px.',
    y: 'Region top edge, CSS px.',
    width: 'Region width, CSS px.',
    height: 'Region height, CSS px.',
    selector: 'Element mode: CSS selector or element ref.',
    device_mode: 'current, or temporary desktop or mobile emulation; viewport sizes alone imply desktop.',
    viewport_width: 'Emulated width in CSS px (set both sizes).',
    viewport_height: 'Emulated height in CSS px (set both sizes).',
    device_scale_factor: 'Emulated scale factor, 1 to 4 (default 1).',
    orientation: 'Mobile orientation (default auto).',
    wait_ms: 'Extra settle time, 0 to 5000 ms (default 250).',
    include_fsb_overlays: 'True keeps FSB overlays in the capture (default false).',
  }),

  // --- vault tools (inline; every parameter listed, tab_id uses the common text) ---
  fill_credential: Object.freeze({
    domain: 'Ignored hint kept for compatibility; the tab URL picks the credential.',
  }),
  use_payment_method: Object.freeze({
    payment_method_id: 'Payment method ID from list_payment_methods.',
  }),

  // --- capability tools (inline; every parameter listed, tab_id uses the common text) ---
  search_capabilities: Object.freeze({
    query: 'Natural-language intent, such as "show my github notifications".',
    origin: 'Optional expected origin (https://github.com); must match the tab origin.',
    topN: 'Max results (default 5, max 5).',
  }),
  invoke_capability: Object.freeze({
    slug: 'Capability slug from a search_capabilities hit.',
    params: "Parameters matching the hit's params schema.",
  }),

  // --- observability tools (inline; every parameter listed) ---
  list_sessions: Object.freeze({
    limit: 'Max sessions (default all, max 50).',
  }),
  get_session_detail: Object.freeze({
    sessionId: 'Session ID from list_sessions.',
    format: 'json (default) or text (readable report).',
  }),
  get_session_replay: Object.freeze({
    sessionId: 'Session ID from list_sessions.',
  }),
  replay_session: Object.freeze({
    sessionId: 'Session ID from list_sessions.',
  }),
  get_logs: Object.freeze({
    sessionId: "Only this session's logs; omit for the most recent.",
    count: 'Number of recent logs (default 50, max 200); ignored with sessionId.',
  }),
  search_memory: Object.freeze({
    query: 'Natural language search query.',
    domain: 'Filter by domain, such as amazon.com.',
    type: 'Filter by memory type.',
    topN: 'Max results (default 5).',
  }),

  // --- autopilot tools (inline; every parameter listed) ---
  run_task: Object.freeze({
    task: 'Task to perform, in natural language.',
  }),

  // --- removed visual-session tools (inline; client and tab_id use the common text) ---
  start_visual_session: Object.freeze({
    task: 'Short task title for the overlay.',
    detail: 'Optional first detail line for the overlay.',
  }),
  end_visual_session: Object.freeze({
    session_token: 'Token from start_visual_session.',
    reason: 'Optional end reason.',
  }),

  // --- settings (inline; Phase 66.1 text, pinned by its contract test) ---
  settings: Object.freeze({
    key: 'Setting name',
    value: 'New value (string; true/false and numbers accepted)',
  }),
});

function ownText(table: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  if (!table || !Object.prototype.hasOwnProperty.call(table, key)) return undefined;
  const value = table[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function hasMcpToolDescription(name: string): boolean {
  return ownText(MCP_TOOL_DESCRIPTIONS, name) !== undefined;
}

// Module text for the tool, otherwise the fallback (normally the registry
// text), otherwise ''.
export function mcpToolDescription(name: string, fallback?: string): string {
  return ownText(MCP_TOOL_DESCRIPTIONS, name) ?? fallback ?? '';
}

// A fresh map of the common parameter text merged with the tool's own
// parameter text (per-tool wins). Suitable as jsonSchemaToZod's override map.
export function mcpParamDescriptions(toolName: string): Readonly<Record<string, string>> {
  const merged: Record<string, string> = { ...MCP_COMMON_PARAM_DESCRIPTIONS };
  const own = Object.prototype.hasOwnProperty.call(MCP_PARAM_DESCRIPTIONS, toolName)
    ? MCP_PARAM_DESCRIPTIONS[toolName]
    : undefined;
  if (own) {
    for (const [param, text] of Object.entries(own)) {
      if (typeof text === 'string' && text.length > 0) merged[param] = text;
    }
  }
  return merged;
}

// Per-tool text, else common text, else the fallback, else ''.
export function mcpParamDescription(toolName: string, param: string, fallback?: string): string {
  const own = Object.prototype.hasOwnProperty.call(MCP_PARAM_DESCRIPTIONS, toolName)
    ? MCP_PARAM_DESCRIPTIONS[toolName]
    : undefined;
  return ownText(own, param) ?? ownText(MCP_COMMON_PARAM_DESCRIPTIONS, param) ?? fallback ?? '';
}
