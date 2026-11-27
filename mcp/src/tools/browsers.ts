import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import type { AgentScope } from '../agent-scope.js';
import type { BrowserRefusal, BrowserRosterEntry, MCPMessageType } from '../types.js';
import { browserKeyStems, resolveBrowser } from '../browser-routing.js';
import { mapFSBError } from '../errors.js';

// One slow profile must not hold the whole list back for long: a browser that
// has not answered by now is listed without its tabs.
const BROWSER_DETAIL_TIMEOUT_MS = 2_500;
const MAX_TITLE_LENGTH = 200;
const MAX_URL_LENGTH = 500;

export const LIST_BROWSERS_DESCRIPTION =
  'List every browser FSB is running in on this machine: each Chrome profile that has the extension, other Chromium browsers '
  + '(Edge, Brave, Arc), and Safari. Each entry gives the `browser` value that names it, its extension version, how many windows and tabs '
  + 'it has open, and the tab in front there, which is how to tell one profile from another. '
  + 'Call it before your first open_tab when the user names a browser or profile, or when the work belongs somewhere other than where you are. '
  + 'Then pass that `browser` value to open_tab, list_tabs or run_task: your later calls stay in that browser, and each agent chooses for itself, '
  + 'so several agents can work in different browsers and profiles at once. Read-only: it opens nothing and does not move you. '
  + 'Related: list_tabs (the tabs of one browser), open_tab (start working in one).';

type BrowserDetails = {
  tabs: number | null;
  activeTab: { title: string; url: string } | null;
};

type SessionPlace = { current: string | null; configured: string | null };

function sessionPlace(agentScope: AgentScope): SessionPlace {
  // An embedder's scope from before per-browser identities knows no place.
  if (typeof agentScope.browserSession !== 'function') return { current: null, configured: null };
  const session = agentScope.browserSession();
  return { current: session.current, configured: session.configured };
}

function isoTime(value: number | null | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? new Date(value).toISOString()
    : null;
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/**
 * What one browser has open, asked of that browser alone. It carries no agent
 * identity, so listing registers nobody anywhere, and it names its browser, so
 * it never moves this session or an older client's binding.
 */
async function readBrowserDetails(bridge: WebSocketBridge, browser: string | null): Promise<BrowserDetails | null> {
  try {
    const message = { type: 'mcp:get-diagnostics' as MCPMessageType, payload: {} };
    const result = await bridge.sendAndWait(
      browser ? { ...message, browser } : message,
      { timeout: BROWSER_DETAIL_TIMEOUT_MS },
    );
    if (!result || result.success !== true) return null;
    const summary = result.tabsSummary as { totalTabs?: unknown } | null | undefined;
    const active = result.activeTab as { id?: unknown; title?: unknown; url?: unknown } | null | undefined;
    const totalTabs = summary?.totalTabs;
    return {
      tabs: typeof totalTabs === 'number' && Number.isSafeInteger(totalTabs) && totalTabs >= 0
        ? totalTabs
        : null,
      activeTab: active && typeof active.id === 'number'
        ? { title: clip(active.title, MAX_TITLE_LENGTH), url: clip(active.url, MAX_URL_LENGTH) }
        : null,
    };
  } catch {
    return null;
  }
}

function describeRefusal(refusal: BrowserRefusal): Record<string, unknown> {
  return {
    kind: refusal.kind,
    extensionId: refusal.extensionId ?? null,
    reason: refusal.reason,
    at: isoTime(refusal.at),
    ...(refusal.reason === 'extension_origin_pin_mismatch'
      ? { fix: 'The bridge is paired to another extension. Release it with: npx -y fsb-mcp-server@latest pair --reset' }
      : {}),
    ...(refusal.reason === 'another_extension_attached'
      ? { fix: 'Another build of the extension (a different extension ID) is attached, and one ID is served at a time. Close the browser running the other build, or disable FSB there.' }
      : {}),
  };
}

/** The list_browsers result. Exported for the tests, which call it without a server. */
export async function listBrowsers(
  bridge: WebSocketBridge,
  agentScope: AgentScope,
): Promise<Record<string, unknown>> {
  const place = sessionPlace(agentScope);
  const roster = bridge.browserRoster;
  const refused = bridge.refusedBrowsers.map(describeRefusal);

  if (roster === null) {
    // No roster: this process relays through an older fsb-mcp-server, which
    // serves one Chromium browser and cannot be told which.
    const topology = bridge.topology;
    if (!topology.extensionConnected) {
      return {
        success: true,
        tool: 'list_browsers',
        browsers: [],
        current: null,
        default: null,
        choice: false,
        hint: 'No browser is connected. Open a browser with the FSB extension enabled, then call list_browsers again.',
      };
    }
    const attachment = topology.extensionAttachment;
    const details = await readBrowserDetails(bridge, null);
    // Named as a current hub would name it when the older one says which
    // install it holds, so a name written into a client's config, or held by
    // a session, means the same browser whichever server runs the bridge.
    const name = (attachment
      ? browserKeyStems('chrome', attachment.extensionId, attachment.installInstanceId)[0]
      : undefined) ?? 'chrome';
    return {
      success: true,
      tool: 'list_browsers',
      browsers: [{
        browser: name,
        kind: 'chrome',
        extensionId: attachment?.extensionId ?? null,
        extensionVersion: attachment?.extensionVersion ?? null,
        windows: attachment?.normalWindowCount ?? null,
        tabs: details?.tabs ?? null,
        activeTab: details?.activeTab ?? null,
        connectedAt: attachment?.connectedAt ?? null,
        lastFocusedAt: null,
        paired: false,
        current: true,
        default: true,
      }],
      current: name,
      default: name,
      choice: false,
      hint: 'The FSB bridge on this machine is run by an older fsb-mcp-server, which serves one browser. '
        + 'Restart your MCP clients on the current one (npx -y fsb-mcp-server@latest) to see and choose between browsers and profiles.',
    };
  }

  // Where a call that names no browser would go from this session right now.
  const route = roster.length > 0
    ? resolveBrowser({ roster, current: place.current, configured: place.configured })
    : null;
  const defaultBrowser = route?.ok ? route.browser : null;
  const current = place.current && roster.some((entry) => entry.key === place.current)
    ? place.current
    : null;

  const details = await Promise.all(roster.map((entry) => readBrowserDetails(bridge, entry.key)));
  const browsers = roster.map((entry: BrowserRosterEntry, index) => ({
    browser: entry.key,
    kind: entry.kind,
    extensionId: entry.extensionId,
    extensionVersion: entry.extensionVersion,
    windows: entry.windows,
    tabs: details[index]?.tabs ?? null,
    activeTab: details[index]?.activeTab ?? null,
    connectedAt: isoTime(entry.connectedAt),
    lastFocusedAt: isoTime(entry.focusedAt),
    paired: entry.authorized,
    current: entry.key === current,
    default: entry.key === defaultBrowser,
  }));

  const result: Record<string, unknown> = {
    success: true,
    tool: 'list_browsers',
    browsers,
    current,
    default: defaultBrowser,
    choice: true,
  };
  if (roster.length === 0) {
    result.hint = 'No browser is connected. Open a browser with the FSB extension enabled, then call list_browsers again.';
  } else if (route && !route.ok) {
    // This session is tied to a browser that is away. It is not moved for it.
    result.hint = `This session belongs to "${route.browser ?? 'a browser'}", which is not connected. `
      + 'Open it, or pass one of the browsers above to open_tab or list_tabs to work there instead.';
  } else if (roster.length > 1) {
    result.hint = 'Pass a `browser` value from this list to open_tab, list_tabs or run_task to work there. '
      + 'A call that names none goes to `default`.';
  }
  if (refused.length > 0) result.notConnected = refused;
  return result;
}

/**
 * Register list_browsers. It lives in the MCP layer and not in the shared tool
 * registry: an extension runs inside one browser and has nothing to list.
 */
export function registerBrowserTools(
  server: McpServer,
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
): void {
  server.tool(
    'list_browsers',
    LIST_BROWSERS_DESCRIPTION,
    {},
    async () => queue.enqueue('list_browsers', async () => mapFSBError(await listBrowsers(bridge, agentScope))),
  );
}
