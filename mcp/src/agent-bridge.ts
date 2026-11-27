import type { WebSocketBridge } from './bridge.js';
import type { AgentScope } from './agent-scope.js';
import type { BrowserRosterEntry, MCPMessageType, MCPResponse } from './types.js';
import {
  browserRouteFailure,
  lastFocusedBrowser,
  normalizeBrowserName,
  resolveBrowser,
  tabIdsIn,
} from './browser-routing.js';
import { randomUUID } from 'node:crypto';

type AgentScopedSendOptions = {
  timeout?: number;
  onProgress?: (p: MCPResponse) => void;
  targetTabId?: number | null;
  includeOwnershipToken?: boolean;
  retryOnAgentNotRegistered?: boolean;
  onAgentId?: (agentId: string) => void;
  // The browser the tool call itself names. Most calls name none and follow
  // their tab, or the browser the session is already in.
  browser?: unknown;
  // Told which browser the call went to, before it is sent. A call that must
  // later be found again (a running task, a trigger) keeps this.
  onBrowser?: (browser: string | null) => void;
  // The browser a task or trigger this session started is in. Unlike
  // `browser`, the agent did not choose it for this call, so going there does
  // not move the session.
  returnToBrowser?: string | null;
};

/** A call that has been given its browser, or the failure to return instead. */
export type RoutedBrowserCall =
  // `browser` goes on the wire. `place` is where the session is once the call
  // has been carried: the same browser, or, behind an older hub that takes no
  // name, the browser that hub is known to serve (null when it is not known).
  | { ok: true; browser: string | null; scope: AgentScope; place: string | null; unplaced?: boolean }
  | { ok: false; failure: Record<string, unknown> };

function rosterOf(bridge: WebSocketBridge): BrowserRosterEntry[] | null {
  const roster = (bridge as { browserRoster?: unknown }).browserRoster;
  return Array.isArray(roster) ? roster as BrowserRosterEntry[] : null;
}

/**
 * Why the hub turned away the browser a call belongs to, if it did. A refusal
 * knows only the kind it turned away (a refused upgrade names no install), so
 * a kind matches every refusal of that kind. A Safari key matches a Safari
 * refusal too: the hub attaches at most one unpaired Safari install at a time,
 * so a Safari refusal is about the Safari the session was in. A Chrome key
 * matches none: several extension IDs can be about, and a refusal of another
 * one says nothing about a profile that simply closed. The latest one counts.
 */
function refusalReasonFor(refusals: unknown, browser: string | null): string | null {
  if (!browser || !Array.isArray(refusals)) return null;
  let latest: { reason: string; at: number } | null = null;
  for (const raw of refusals) {
    if (!raw || typeof raw !== 'object') continue;
    const { kind, reason, at } = raw as { kind?: unknown; reason?: unknown; at?: unknown };
    if (typeof reason !== 'string') continue;
    if (kind !== browser && !(kind === 'safari' && browser.startsWith('safari-'))) continue;
    const when = typeof at === 'number' && Number.isFinite(at) ? at : 0;
    if (latest === null || when >= latest.at) latest = { reason, at: when };
  }
  return latest ? latest.reason : null;
}

/**
 * Decide which browser a call goes to, and with which of the session's
 * identities. Decided once per call: the registration, the send and any retry
 * all use the same answer, so a browser that drops out in the middle cannot
 * turn a retry into a call on another browser.
 */
export function routeBrowserCall(
  bridge: WebSocketBridge,
  agentScope: AgentScope,
  call: { browser?: unknown; tabId?: number | null } = {},
): RoutedBrowserCall {
  // An embedder's scope from before per-browser identities has nothing to choose with.
  if (typeof agentScope.forBrowser !== 'function' || typeof agentScope.browserSession !== 'function') {
    return { ok: true, browser: null, scope: agentScope, place: null };
  }
  const session = agentScope.browserSession();
  const tabId = typeof call.tabId === 'number' && Number.isFinite(call.tabId) ? call.tabId : null;
  const roster = rosterOf(bridge);
  // No roster can also mean no hub at all. A relay drops its roster the moment
  // its hub goes away and has none until the next hub answers. That is not an
  // older hub and must not be reported as one. A call that gets here then (one
  // queued before the drop) is refused as not connected, as it would have been
  // a moment later, and sends nothing: the session stays tied to its browser
  // and goes back there once the next hub answers.
  if (roster === null && bridge.isConnected === false) {
    return { ok: false, failure: { success: false, error: 'extension_not_connected' } };
  }
  const route = resolveBrowser({
    roster,
    named: call.browser,
    tabId,
    seenIn: tabId === null ? [] : session.seenIn(tabId),
    current: session.current,
    configured: session.configured,
    // An older hub serves one browser. If it says which, a session tied to
    // that very browser carries on.
    legacy: roster === null
      ? (bridge as { topology?: { extensionAttachment?: unknown } }).topology?.extensionAttachment as
        { extensionId?: unknown; installInstanceId?: unknown } | null | undefined
      : null,
  });
  if (!route.ok) {
    const failure = browserRouteFailure(route);
    // A browser the hub turned away cannot be told why itself (a refused
    // upgrade carries no reason), so the caller that asks for it is.
    const refusalReason = refusalReasonFor(
      (bridge as { refusedBrowsers?: unknown }).refusedBrowsers,
      route.browser,
    );
    if (refusalReason) failure.refusalReason = refusalReason;
    return { ok: false, failure };
  }
  const place = route.browser ?? route.scope ?? null;
  return {
    ok: true,
    browser: route.browser,
    scope: place ? agentScope.forBrowser(place) : agentScope,
    place,
    // The agent named a browser and an older hub, which cannot be told one,
    // is carrying the call. Whatever the session was tied to before, it is now
    // wherever that hub is.
    unplaced: roster === null && place === null && normalizeBrowserName(call.browser) !== null,
  };
}

/** After a call was carried: remember where the session now is. */
function settleBrowserPlace(
  agentScope: AgentScope,
  routed: Extract<RoutedBrowserCall, { ok: true }>,
  tabId: number | null | undefined,
  result: Record<string, unknown> | null | undefined,
  options: { moveSession?: boolean } = {},
): void {
  if (routed.place) {
    noteBrowserResult(agentScope, routed.place, tabId, result, options);
  } else if (routed.unplaced && options.moveSession !== false && result?.success !== false
    && typeof agentScope.leaveBrowser === 'function') {
    agentScope.leaveBrowser();
  }
}

/**
 * Whether the browser a task or trigger is running in can be reached. With no
 * browser recorded (one browser, or a hub from before the roster) this is the
 * bridge's own answer.
 */
export function isBridgeConnectedTo(bridge: WebSocketBridge, browser: string | null | undefined): boolean {
  return browser && typeof bridge.isConnectedTo === 'function'
    ? bridge.isConnectedTo(browser)
    : bridge.isConnected;
}

/**
 * The connected browsers, for a caller that is choosing one. Null unless
 * there is a choice to make.
 */
export function connectedBrowserSummary(
  bridge: WebSocketBridge,
  current: string | null,
): Array<{ browser: string; current: boolean; lastFocused: boolean }> | null {
  const roster = rosterOf(bridge);
  if (!roster || roster.length < 2) return null;
  // Known only when every browser reports focus. It is not always the default:
  // a Safari focused last does not take that from a Chromium browser.
  const lastFocused = lastFocusedBrowser(roster);
  return roster.map((entry) => ({
    browser: entry.key,
    current: entry.key === current,
    lastFocused: entry.key === lastFocused,
  }));
}

/**
 * Remember where a call went and which tabs it showed there. The browser
 * becomes the session's current one, and a later call that names one of those
 * tabs follows it.
 */
export function noteBrowserResult(
  agentScope: AgentScope,
  browser: string | null,
  tabId: number | null | undefined,
  result: Record<string, unknown> | null | undefined,
  options: { moveSession?: boolean } = {},
): void {
  if (!browser || typeof agentScope.noteBrowserUse !== 'function') return;
  // The hub found the browser gone between this session choosing it and the
  // call arriving. Nothing happened there, so the session has not moved there.
  if (result?.code === 'BROWSER_NOT_CONNECTED' || result?.errorCode === 'BROWSER_NOT_CONNECTED') return;
  const tabIds = tabIdsIn(result);
  if (typeof tabId === 'number' && Number.isFinite(tabId) && result?.success !== false) tabIds.push(tabId);
  agentScope.noteBrowserUse(browser, tabIds, options);
}

/**
 * Send a message that carries no agent identity (logs, sessions, the vault
 * lists) to the browser this session is in, or the one the call names.
 */
export async function sendBrowserMessage(
  bridge: WebSocketBridge,
  agentScope: AgentScope,
  message: { type: MCPMessageType; payload: Record<string, unknown> },
  options: { timeout?: number; browser?: unknown; tabId?: number | null } = {},
): Promise<Record<string, unknown>> {
  const routed = routeBrowserCall(bridge, agentScope, { browser: options.browser, tabId: options.tabId });
  if (!routed.ok) return routed.failure;
  const result = await bridge.sendAndWait(
    routed.browser ? { ...message, browser: routed.browser } : message,
    options.timeout === undefined ? undefined : { timeout: options.timeout },
  );
  settleBrowserPlace(agentScope, routed, options.tabId, result);
  return result;
}

function isAgentNotRegistered(result: Record<string, unknown> | null | undefined): boolean {
  return result?.code === 'AGENT_NOT_REGISTERED'
    || result?.errorCode === 'AGENT_NOT_REGISTERED';
}

export function targetTabIdFromParams(params: Record<string, unknown>): number | null {
  if (typeof params.tab_id === 'number' && Number.isFinite(params.tab_id)) return params.tab_id;
  if (typeof params.tabId === 'number' && Number.isFinite(params.tabId)) return params.tabId;
  return null;
}

function currentOwnershipToken(agentScope: AgentScope, targetTabId: number | null): string | null {
  const specific = (typeof agentScope.ownershipTokenFor === 'function')
    ? agentScope.ownershipTokenFor(targetTabId)
    : null;
  if (specific) return specific;
  return (typeof agentScope.currentOwnershipToken === 'function')
    ? agentScope.currentOwnershipToken()
    : null;
}

function currentConnectionId(agentScope: AgentScope): string | null {
  return (typeof agentScope.currentConnectionId === 'function')
    ? agentScope.currentConnectionId()
    : null;
}

function captureOwnershipToken(agentScope: AgentScope, result: Record<string, unknown> | null | undefined): void {
  if (!result || typeof result.ownershipToken !== 'string') return;
  if (typeof agentScope.captureOwnershipToken !== 'function') return;
  agentScope.captureOwnershipToken(
    typeof result.tabId === 'number' ? result.tabId : null,
    result.ownershipToken,
  );
}

function supportsRecordingCallLifecycle(agentScope: AgentScope): boolean {
  return typeof agentScope.beginRecordingCall === 'function'
    && typeof agentScope.completeRecordingCall === 'function';
}

const RECORDING_LEASE_DEFAULT_MS = 30_000;
const RECORDING_LEASE_MIN_MS = 1_000;
const RECORDING_LEASE_MAX_MS = 15 * 60_000;
const RECORDING_LEASE_SETTLE_GRACE_MS = 5_000;

function recordingLeaseMs(timeout: number | undefined): number {
  const requested = typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0
    ? timeout
    : RECORDING_LEASE_DEFAULT_MS;
  return Math.max(
    RECORDING_LEASE_MIN_MS,
    Math.min(RECORDING_LEASE_MAX_MS, Math.ceil(requested) + RECORDING_LEASE_SETTLE_GRACE_MS),
  );
}

async function buildAgentPayload(
  bridge: WebSocketBridge,
  agentScope: AgentScope,
  basePayload: Record<string, unknown>,
  options: AgentScopedSendOptions,
  recordingCallId: string,
): Promise<Record<string, unknown>> {
  const agentId = await agentScope.ensure(bridge);
  options.onAgentId?.(agentId);

  const payload: Record<string, unknown> = {
    ...basePayload,
    agentId,
    recordingCallId,
    recordingLeaseMs: recordingLeaseMs(options.timeout),
  };
  if (options.includeOwnershipToken !== false) {
    const ownershipToken = currentOwnershipToken(agentScope, options.targetTabId ?? null);
    if (ownershipToken) payload.ownershipToken = ownershipToken;
  }

  const connectionId = currentConnectionId(agentScope);
  if (connectionId) payload.connectionId = connectionId;

  // Compatibility: pre-journal embedders omit correlation, while the first
  // journal implementation exposes only ensureRecordingRun(). Newer scopes
  // track physical attempts so long-running calls do not look idle.
  if (supportsRecordingCallLifecycle(agentScope)) {
    payload.recordingRunId = agentScope.beginRecordingCall();
  } else if (typeof agentScope.ensureRecordingRun === 'function') {
    payload.recordingRunId = agentScope.ensureRecordingRun();
  }
  return payload;
}

async function sendBridgeAttempt(
  bridge: WebSocketBridge,
  agentScope: AgentScope,
  type: MCPMessageType,
  payload: Record<string, unknown>,
  sendOptions: Pick<AgentScopedSendOptions, 'timeout' | 'onProgress'>,
  browser: string | null,
): Promise<Record<string, unknown>> {
  try {
    return await bridge.sendAndWait(browser ? { type, payload, browser } : { type, payload }, sendOptions);
  } finally {
    const runId = payload.recordingRunId;
    if (typeof runId === 'string' && supportsRecordingCallLifecycle(agentScope)) {
      agentScope.completeRecordingCall(runId);
    }
  }
}

function isConfirmedTerminalLifecycle(
  type: MCPMessageType,
  basePayload: Record<string, unknown>,
  result: Record<string, unknown> | null | undefined,
): boolean {
  if (type !== 'mcp:task-status' || !result) return false;
  const tool = basePayload.tool;
  if (tool === 'complete_task') return result.status === 'completed';
  if (tool === 'partial_task') return result.status === 'partial';
  if (tool === 'fail_task') return result.status === 'failed';
  return false;
}

export async function sendAgentScopedBridgeMessage(
  bridge: WebSocketBridge,
  agentScope: AgentScope,
  type: MCPMessageType,
  basePayload: Record<string, unknown>,
  options: AgentScopedSendOptions = {},
): Promise<Record<string, unknown>> {
  const sendOptions = {
    timeout: options.timeout,
    onProgress: options.onProgress,
  };
  let recordingCallId = randomUUID();

  // The browser is chosen once, here. `scope` is the session's identity in
  // that browser, and everything below, the retry included, stays with both.
  const returning = typeof options.returnToBrowser === 'string' && options.returnToBrowser.length > 0;
  const routed = routeBrowserCall(bridge, agentScope, {
    browser: returning ? options.returnToBrowser : options.browser,
    tabId: options.targetTabId,
  });
  if (!routed.ok) return routed.failure;
  const { scope, browser } = routed;
  options.onBrowser?.(browser);

  let payload = await buildAgentPayload(bridge, scope, basePayload, options, recordingCallId);
  let result = await sendBridgeAttempt(bridge, scope, type, payload, sendOptions, browser);

  if (options.retryOnAgentNotRegistered !== false && isAgentNotRegistered(result)) {
    // Only this browser's identity is stale. The session's identity in any
    // other browser, and its tabs there, are untouched.
    scope.reset();
    recordingCallId = randomUUID();
    payload = await buildAgentPayload(bridge, scope, basePayload, options, recordingCallId);
    result = await sendBridgeAttempt(bridge, scope, type, payload, sendOptions, browser);
  }

  captureOwnershipToken(scope, result);
  if (isConfirmedTerminalLifecycle(type, basePayload, result)) {
    if (typeof scope.rotateRecordingRun === 'function') scope.rotateRecordingRun();
  }
  settleBrowserPlace(agentScope, routed, options.targetTabId, result, { moveSession: !returning });
  // With more than one browser attached, every result says which one it came
  // from. With one, nothing changes for the caller.
  if (
    browser
    && result
    && typeof result === 'object'
    && !Array.isArray(result)
    && result.browser === undefined
    && (rosterOf(bridge)?.length ?? 0) > 1
  ) {
    result.browser = browser;
  }
  return result;
}
