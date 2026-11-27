import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * MCP tool annotations for every FSB tool, kept in one place.
 *
 * Hosts read these hints to decide how to treat a call: a read-only tool may
 * run in parallel with others, and a destructive one may need the user's
 * confirmation first. Each entry is written by hand from what the tool does in
 * the browser. Do not derive hints from the registry's _readOnly flag or from
 * the module that registers a tool: stop_trigger is _readOnly in the registry
 * but cancels a watcher, and complete_task, partial_task and fail_task live in
 * read-only.ts but record an outcome.
 *
 * openWorldHint is true when the tool acts on, or reads from, the web page in
 * a tab. It is false when the tool only touches FSB's own state or the tab
 * list.
 */
export type ToolAnnotationEntry = Readonly<{
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}>;

export const TOOL_ANNOTATIONS: Readonly<Record<string, ToolAnnotationEntry>> = Object.freeze({
  // Read-only, reading the page in a tab.
  read_page: { title: 'Read Page', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  get_text: { title: 'Get Element Text', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  get_attribute: { title: 'Get Element Attribute', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  get_dom_snapshot: { title: 'Get DOM Snapshot', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  get_page_snapshot: { title: 'Get Page Snapshot', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  read_sheet: { title: 'Read Spreadsheet', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  capture_screenshot: { title: 'Capture Screenshot', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },

  // Read-only, reading FSB's own state or the tab list.
  list_tabs: { title: 'List Tabs', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  get_site_guide: { title: 'Get Site Guide', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  get_task_status: { title: 'Get Autopilot Task Status', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  get_trigger_status: { title: 'Get Trigger Status', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  list_triggers: { title: 'List Triggers', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  list_sessions: { title: 'List Sessions', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  get_session_detail: { title: 'Get Session Detail', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  get_session_replay: { title: 'Get Session Replay Manifest', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  get_logs: { title: 'Get Logs', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  search_memory: { title: 'Search FSB Memory', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  get_memory_stats: { title: 'Get FSB Memory Stats', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  list_credentials: { title: 'List Saved Logins', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  list_payment_methods: { title: 'List Saved Payment Methods', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  search_capabilities: { title: 'Search Capabilities', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  list_browsers: { title: 'List Browsers', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },

  // Changes browser or FSB state without destroying anything.
  navigate: { title: 'Navigate to URL', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  search: { title: 'Search Site or Web', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  go_back: { title: 'Go Back', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  go_forward: { title: 'Go Forward', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  refresh: { title: 'Reload Page', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  open_tab: { title: 'Open Tab', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  switch_tab: { title: 'Switch Tab', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  hover: { title: 'Hover Element', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  focus: { title: 'Focus Element', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  scroll: { title: 'Scroll Page', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  scroll_to_top: { title: 'Scroll to Top', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  scroll_to_bottom: { title: 'Scroll to Bottom', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  scroll_to_element: { title: 'Scroll to Element', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  scroll_at: { title: 'Scroll at Coordinates', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  select_text_range: { title: 'Select Text Range', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  trigger: { title: 'Watch Element', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  stop_trigger: { title: 'Stop Trigger', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  stop_task: { title: 'Stop Autopilot Task', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  complete_task: { title: 'Report Task Complete', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  partial_task: { title: 'Report Task Partially Complete', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  fail_task: { title: 'Report Task Failed', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },

  // Can submit, overwrite, delete, spend or run code: hosts may ask first.
  execute_js: { title: 'Run JavaScript in Page', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  click: { title: 'Click Element', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  double_click: { title: 'Double-Click Element', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  right_click: { title: 'Right-Click Element', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  click_at: { title: 'Click at Coordinates', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  double_click_at: { title: 'Double-Click at Coordinates', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  click_and_hold: { title: 'Click and Hold', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  drag_drop: { title: 'Drag and Drop Element', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  drag: { title: 'Drag at Coordinates', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  drag_variable_speed: { title: 'Drag at Variable Speed', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  type_text: { title: 'Type Text', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  insert_text: { title: 'Insert Text at Caret', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  clear_input: { title: 'Clear Input', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  press_enter: { title: 'Press Enter', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  press_key: { title: 'Press Key', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  select_option: { title: 'Select Dropdown Option', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  check_box: { title: 'Toggle Checkbox', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  set_attribute: { title: 'Set Element Attribute', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  drop_file: { title: 'Drop Synthetic File', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  upload_file: { title: 'Upload Local File', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  fill_sheet: { title: 'Fill Spreadsheet', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  close_tab: { title: 'Close Tab', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  run_task: { title: 'Run Autopilot Task', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  replay_session: { title: 'Replay Session', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  invoke_capability: { title: 'Invoke Capability', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  fill_credential: { title: 'Fill Saved Login', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  use_payment_method: { title: 'Fill Saved Payment Method', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  settings: { title: 'FSB Settings', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
});

/**
 * Names that have an entry above but that this server does not register yet.
 * Their entries are written ahead so the code that registers them needs no
 * change here. The annotation test allows these names to be missing from the
 * server; remove a name once its tool is registered.
 */
export const PENDING_TOOL_NAMES: ReadonlySet<string> = new Set(['list_browsers', 'settings']);

/**
 * Hints for a tool with no entry above. They assume the worst, so a host asks
 * before running it, until an explicit entry is added.
 */
export function defaultToolAnnotations(name: string): ToolAnnotationEntry {
  const title = name
    .split(/[_\s-]+/u)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return {
    title: title || name,
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  };
}

type RegisteredToolHandle = {
  annotations?: Record<string, unknown>;
  update?: (updates: Record<string, unknown>) => void;
};

type RegistrationMethod = (...args: unknown[]) => unknown;

const REGISTRATION_METHODS = ['tool', 'registerTool'] as const;
const annotatedServers = new WeakSet<object>();

function applyAnnotations(name: unknown, handle: unknown): void {
  const toolName = typeof name === 'string' ? name : String(name);
  let entry: ToolAnnotationEntry;
  if (Object.hasOwn(TOOL_ANNOTATIONS, toolName)) {
    entry = TOOL_ANNOTATIONS[toolName];
  } else {
    entry = defaultToolAnnotations(toolName);
    console.error(`[FSB Annotations] ${toolName}: no annotation entry, using destructive defaults`);
  }
  const registered = handle as RegisteredToolHandle | null | undefined;
  if (typeof registered?.update !== 'function') return;
  registered.update({
    title: entry.title,
    annotations: {
      ...(registered.annotations ?? {}),
      title: entry.title,
      readOnlyHint: entry.readOnlyHint,
      destructiveHint: entry.destructiveHint,
      idempotentHint: entry.idempotentHint,
      openWorldHint: entry.openWorldHint,
    },
  });
}

/**
 * Wrap this server instance's tool() and registerTool() so every tool gets its
 * title and hints as it is registered. Call it before any tool is registered.
 * Only the instance is patched, never McpServer.prototype, because serve mode
 * builds one server per session.
 */
export function annotateTools(server: McpServer): void {
  if (annotatedServers.has(server)) return;
  annotatedServers.add(server);
  const methods = server as unknown as Record<string, unknown>;
  for (const method of REGISTRATION_METHODS) {
    const original = methods[method];
    if (typeof original !== 'function') continue;
    methods[method] = function annotatedRegistration(...args: unknown[]): unknown {
      const handle = (original as RegistrationMethod).apply(server, args);
      applyAnnotations(args[0], handle);
      return handle;
    };
  }
}
