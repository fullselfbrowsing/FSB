import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket from 'ws';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';
import type {
  BridgeMode,
  BridgeCapability,
  BridgeOptions,
  BridgeTopologyState,
  BrowserKind,
  BrowserRefusal,
  BrowserRosterEntry,
  ExtensionAttachmentState,
  ExtEvent,
  ExtRequest,
  ExtResponse,
  ExtRequestHandler,
  MCPMessage,
  MCPResponse,
  RelayExtRoute,
  RelayHello,
  RelayState,
  RelayWelcome,
} from './types.js';
import { FSB_ERROR_MESSAGES } from './errors.js';
import {
  FSB_EXT_PROTOCOL,
  authenticateBridgeProtocols,
  bindAllowedExtensionOrigin,
  readBridgeAuthState,
} from './bridge-auth.js';
import { logBridgeEvent } from './bridge-events.js';
import { makeExtError, parseExtFrame } from './ext-protocol.js';
import { FSB_MCP_VERSION } from './version.js';
import {
  BROWSER_KEY_PATTERN,
  browserKeyCandidates,
  compactInstallId,
  isBrowserKind,
  pickDefaultBrowser,
} from './browser-routing.js';

interface PendingRequest {
  resolve: (value: MCPResponse) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  // Hub mode: the browser this request went to. Only that browser may answer
  // it, and only that browser going away fails it. Null in relay mode.
  browser: string | null;
}

/**
 * One attached browser: one extension in one profile. The hub keeps a slot per
 * install, and everything that describes "the extension" lives here, so one
 * browser's heartbeat, reaper or disconnect can never touch another's.
 */
interface ExtensionSlot {
  key: string;
  kind: BrowserKind;
  origin: string;
  // Which install this is: see _identityOf. Two sockets with one identity are
  // the same extension in the same profile, and only they contest a slot.
  identity: string;
  socket: WsWebSocket;
  livenessTimer: ReturnType<typeof setInterval> | null;
  lastHeartbeatAt: number | null;
  heartbeatCount: number;
  closeCause: string | null;
  attachment: ExtensionAttachmentState | null;
  focusedAt: number | null;
  lastBrowserStateAt: number;
  connectedAt: number;
  since: number;
}

/**
 * An extension socket the hub has accepted but cannot name yet. Two profiles
 * of one extension connect with the same Origin, so which install a socket is
 * arrives in its first state frame. Until then it is not a browser: nothing is
 * routed to it and no roster lists it.
 */
interface PendingExtension {
  origin: string;
  timer: ReturnType<typeof setTimeout> | null;
}

/** What an extension says about itself in a state frame, once checked. */
interface ExtensionStateReport {
  attachment: ExtensionAttachmentState;
  focusedAt: unknown;
}

/** Where a forwarded request came from, and which browser holds it. */
interface MessageRoute {
  origin: string; // a relay's instanceId, or 'local'
  browser: string;
}

export interface BrowserNotConnectedError extends Error {
  code: 'BROWSER_NOT_CONNECTED';
  browser: string | null;
  connectedBrowsers: string[];
}

// A relay that names no browser predates the roster. It keeps the browser the
// hub first gave it for this long after that browser goes away, so a worker
// restart cannot move an old client to another browser in the middle of a task.
const LEGACY_RELAY_BINDING_GRACE_MS = 60_000;
// Every extension since 0.9.92 sends its state frame as soon as its socket
// opens. Measured against Chromium 156 that is 76-134 ms after the upgrade on
// a cold start, and 327 ms with every core busy. A socket that has said
// nothing by now is an older build, and is attached under the name its
// extension id gives it. The wait is generous because being wrong is costly
// (a current build attached under the wrong name until it reconnects) and
// being slow is not: only those older builds ever wait it out.
const EXTENSION_IDENTIFY_TIMEOUT_MS = 4_000;
// A browser that comes back this soon after going away is the one that was
// here before (a worker restart, an extension reload), and keeps its place in
// the order the default is chosen by.
const BROWSER_SENIORITY_GRACE_MS = 60_000;
const MAX_BROWSER_SLOTS = 16;
const MAX_BROWSER_REFUSALS = 8;
const MAX_REMEMBERED_IDENTITIES = 256;
const MAX_RELAY_EXT_ROUTES = 64;
const BROWSER_STATE_MIN_INTERVAL_MS = 100;
const MAX_REFUSAL_REASON_LENGTH = 64;
const SAFARI_EXTENSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(?: \([A-Za-z0-9]+\))?$/;

function browserKindOf(origin: string): BrowserKind {
  return origin.startsWith('safari-web-extension://') ? 'safari' : 'chrome';
}

interface AcceptedSocketMetadata {
  browserOrigin: string | null;
  extAuthorized: boolean;
  sessionId: string | null;
  unauthorizedSent: boolean;
  // The browser this socket was attached as. Kept after the socket is
  // replaced, so its late answers are still known to come from that browser.
  browserKey?: string | null;
}

interface ActiveExtRequest {
  id: string;
  originSocket: WsWebSocket;
  // The browser the request came from. Null from a socket not yet attached.
  browser: string | null;
  target: 'local' | 'relay';
  relayId?: string;
  settled: boolean;
  abortController: AbortController | null;
}

interface ActiveRelayedExtRequest {
  hubSocket: WebSocket;
  browser: string | null;
  abortController: AbortController;
}

// The three error messages this file's disconnect paths reject in-flight
// sendAndWait promises with. All three MUST be treated as an MV3 SW-eviction
// signal by consumer tools (autopilot, triggers) so the documented
// `sw_evicted: true` recovery arms instead of surfacing a raw error.
//   - 'Bridge disconnected'    -> disconnect() at line ~139 (server shutdown)
//   - 'Extension disconnected' -> hub-mode extension ws close at line ~398
//                                 (the real MV3 SW-eviction path)
//   - 'Lost connection to hub' -> relay-mode hub loss at line ~691
// A previous version of the consumer tools tested only the shutdown string,
// leaving real eviction unhandled. Any new reject-on-disconnect callsite in
// this file MUST add its message here or update these tools directly.
const BRIDGE_DISCONNECT_MESSAGES = new Set<string>([
  'Bridge disconnected',
  'Extension disconnected',
  'Lost connection to hub',
]);

const BRIDGE_DISCONNECT_REASON_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

const HEARTBEAT_NONCE_MIN_LENGTH = 16;
const HEARTBEAT_NONCE_MAX_LENGTH = 64;
const HEARTBEAT_NONCE_PATTERN = /^[A-Za-z0-9_-]+$/;

// The specific cause travels on a property, never in the message. Several very
// different failures share 'Extension disconnected' -- a real MV3 eviction, an
// authorization revocation, a reaped zombie socket -- and they all want the same
// recovery, so the message must stay in BRIDGE_DISCONNECT_MESSAGES above. Only
// the reporting differs, which is what this property is for. Moving a cause into
// the message would silently disable sw_evicted recovery and no test would catch it.
export interface BridgeDisconnectError extends Error {
  bridgeDisconnectReason?: string;
}

export function isBridgeDisconnectError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return BRIDGE_DISCONNECT_MESSAGES.has(msg);
}

/** The cause behind a bridge-disconnect rejection. Reporting only; never a branch. */
export function bridgeDisconnectReason(err: unknown): string | null {
  const reason = (err as BridgeDisconnectError | null)?.bridgeDisconnectReason;
  return typeof reason === 'string' && BRIDGE_DISCONNECT_REASON_PATTERN.test(reason)
    ? reason
    : null;
}

const MAX_ROSTER_ENTRIES = MAX_BROWSER_SLOTS;

/** The extension id a Chromium Origin names. Safari's Origin carries a random UUID instead. */
function extensionIdOfOrigin(origin: string): string | null {
  const prefix = 'chrome-extension://';
  return origin.startsWith(prefix) ? origin.slice(prefix.length) : null;
}

function boundedString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** A hub's roster as a relay may trust it: null unless it is a list, bad entries dropped. */
function parseRoster(value: unknown): BrowserRosterEntry[] | null {
  if (!Array.isArray(value)) return null;
  const roster: BrowserRosterEntry[] = [];
  for (const raw of value.slice(0, MAX_ROSTER_ENTRIES)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const connectedAt = nonNegativeInteger(entry.connectedAt);
    if (
      typeof entry.key !== 'string' || !BROWSER_KEY_PATTERN.test(entry.key)
      || !isBrowserKind(entry.kind)
      || connectedAt === null
      || roster.some((known) => known.key === entry.key)
    ) continue;
    const since = nonNegativeInteger(entry.since);
    roster.push({
      key: entry.key,
      kind: entry.kind,
      extensionId: boundedString(entry.extensionId, 128),
      extensionVersion: boundedString(entry.extensionVersion, 64),
      installInstanceId: boundedString(entry.installInstanceId, 128),
      windows: nonNegativeInteger(entry.windows),
      authorized: entry.authorized === true,
      focusedAt: nonNegativeInteger(entry.focusedAt),
      connectedAt,
      ...(since === null ? {} : { since }),
    });
  }
  return roster;
}

function parseRefusals(value: unknown): BrowserRefusal[] {
  if (!Array.isArray(value)) return [];
  const refusals: BrowserRefusal[] = [];
  for (const raw of value.slice(0, MAX_ROSTER_ENTRIES)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const at = nonNegativeInteger(entry.at);
    if (
      !isBrowserKind(entry.kind)
      || typeof entry.reason !== 'string'
      || !BRIDGE_DISCONNECT_REASON_PATTERN.test(entry.reason)
      || at === null
    ) continue;
    refusals.push({
      kind: entry.kind,
      reason: entry.reason,
      at,
      extensionId: boundedString(entry.extensionId, 128),
    });
  }
  return refusals;
}

export class WebSocketBridge {
  // Identity
  private instanceId: string;
  private mode: BridgeMode = 'disconnected';
  private port: number;
  private host: string;
  private handshakeTimeoutMs: number;
  private relayHandshakeTimeoutMs: number;
  private extensionPingIntervalMs: number;
  private extensionHeartbeatTimeoutMs: number;
  private promotionJitterMs: number;
  private maxReconnectDelayMs: number;
  private legacyRelayBindingGraceMs: number;
  private extensionIdentifyTimeoutMs: number;
  private allowedBrowserOrigins: string[];
  private capabilities: Set<BridgeCapability>;
  private handleExtRequest: ExtRequestHandler | null;

  // Hub mode state
  private wss: WebSocketServer | null = null;
  private httpServer: Server | null = null;
  private slots = new Map<string, ExtensionSlot>(); // browser key -> its slot
  private pendingExtensions = new Map<WsWebSocket, PendingExtension>(); // accepted, not yet named
  // Which key each install was given. Kept for the life of the process so a
  // key is never handed to a second install while sessions may still hold it.
  private identityKeys = new Map<string, string>(); // identity -> key
  private keyIdentities = new Map<string, string>(); // key -> identity
  private firstAttachedAt = new Map<string, number>(); // browser key -> when it was first attached
  private relayClients = new Map<string, WsWebSocket>();
  private relayCapabilities = new Map<string, Set<BridgeCapability>>();
  private activeExtRequests = new Map<string, ActiveExtRequest>();
  private messageOrigin = new Map<string, MessageRoute>(); // msgId -> who asked, and which browser holds it
  private handshakeTimers = new Map<WsWebSocket, ReturnType<typeof setTimeout>>();
  private acceptedSocketMetadata = new WeakMap<WsWebSocket, AcceptedSocketMetadata>();
  private legacyRelayBrowsers = new Map<string, string>(); // relay instanceId -> the browser it was given
  private legacyBindingTimers = new Set<ReturnType<typeof setTimeout>>();
  private slotGoneAt = new Map<string, number>(); // browser key -> when its slot last closed
  private browserRefusals = new Map<string, BrowserRefusal>(); // Origin -> why it was turned away
  private lastFocusedAt = new Map<string, number>(); // browser key -> last reported focus, kept across a reconnect

  // Relay mode state
  private hubConnection: WebSocket | null = null;
  private relayActiveExtRequests = new Map<string, ActiveRelayedExtRequest>();
  private relayExtRoutes = new Map<string, string>(); // ext request id -> the browser the hub said it came from
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 0;
  private intentionalClose = false;
  private promotionInFlight = false;

  // Shared state
  private pendingRequests = new Map<string, PendingRequest>();
  private progressListeners = new Map<string, (progress: MCPResponse) => void>();
  private msgIdCounter = 0;
  private connected = false;
  private hubConnected = false;
  private activeHubInstanceId: string | null = null;
  private relayExtensionConnected = false;
  private relayCount = 0;
  private lastDisconnectReason: string | null = null;
  // Relay mode: what the hub last reported. The roster is null until a hub
  // sends one, and stays null against a hub that predates it.
  private relayLastExtensionHeartbeatAt: number | null = null;
  private relayExtensionAttachment: ExtensionAttachmentState | null = null;
  private relayBrowsers: BrowserRosterEntry[] | null = null;
  private relayRefusedBrowsers: BrowserRefusal[] = [];
  private relayHubVersion: string | null = null;

  constructor(options: BridgeOptions = {}) {
    this.port = options.port ?? 7225;
    this.host = options.host ?? '127.0.0.1';
    if (!WebSocketBridge.isLoopbackBindHost(this.host)) {
      const error = new Error('BRIDGE_NON_LOOPBACK_BIND') as NodeJS.ErrnoException;
      error.code = 'BRIDGE_NON_LOOPBACK_BIND';
      throw error;
    }
    this.instanceId = options.instanceId ?? randomBytes(4).toString('hex');
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 2_000;
    this.relayHandshakeTimeoutMs = options.relayHandshakeTimeoutMs ?? 5_000;
    // 30s is deliberately not harmonic with the extension's own 25s mcp:ping,
    // so the two heartbeats interleave instead of beating against each other.
    // 90s is 3x that ping, so two consecutive extension misses are tolerated.
    this.extensionPingIntervalMs = options.extensionPingIntervalMs ?? 30_000;
    this.extensionHeartbeatTimeoutMs = options.extensionHeartbeatTimeoutMs ?? 90_000;
    this.promotionJitterMs = options.promotionJitterMs ?? 500;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30_000;
    this.legacyRelayBindingGraceMs = options.legacyRelayBindingGraceMs ?? LEGACY_RELAY_BINDING_GRACE_MS;
    const identifyTimeout = options.extensionIdentifyTimeoutMs;
    this.extensionIdentifyTimeoutMs = typeof identifyTimeout === 'number'
      && Number.isFinite(identifyTimeout) && identifyTimeout >= 0
      ? identifyTimeout
      : EXTENSION_IDENTIFY_TIMEOUT_MS;
    // Safari Web Extensions send Origin: safari-web-extension://<UUID>, both
    // from a direct WebSocket and from the container app's native socket.
    this.allowedBrowserOrigins = options.allowedBrowserOrigins ??
      ['chrome-extension://', 'safari-web-extension://'];
    this.handleExtRequest = typeof options.handleExtRequest === 'function'
      ? options.handleExtRequest
      : null;
    this.capabilities = new Set(
      this.handleExtRequest && options.capabilities?.includes('agent-spawn')
        ? ['agent-spawn']
        : [],
    );
    if (options.capabilities?.includes('agent-spawn') && !this.handleExtRequest) {
      console.error(`[FSB Bridge ${this.instanceId}] Ignoring agent-spawn capability without a handler`);
    }
  }

  private static isLoopbackBindHost(host: string): boolean {
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Try to start as hub (WebSocket server on port 7225).
   * If the port is taken, fall back to relay mode (connect as client).
   */
  async connect(): Promise<void> {
    try {
      await this._startAsHub();
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        console.error(`[FSB Bridge ${this.instanceId}] Port ${this.port} in use, connecting as relay client`);
        await this._startAsRelay();
      } else {
        throw err;
      }
    }
  }

  /**
   * Gracefully shut down regardless of mode.
   */
  disconnect(): void {
    this.intentionalClose = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    for (const route of [...this.activeExtRequests.values()]) {
      this._abortExtRoute(route);
    }
    for (const [id, route] of [...this.relayActiveExtRequests]) {
      this._abortRelayedExtRequest(id, route.hubSocket);
    }

    if (this.mode === 'hub') {
      this._closeHubSockets();
    } else if (this.mode === 'relay') {
      if (this.hubConnection) {
        this.hubConnection.close();
        this.hubConnection = null;
      }
    }

    // Phase 239 plan 03 -- IMPORTANT: do NOT change the rejection of pendingRequests
    // on disconnect (lines below). The MCP server's run_task tool catches
    // the resulting `Error('Bridge disconnected')` and resolves with sw_evicted: true
    // per CONTEXT.md D-05. Removing the rejection would cause sendAndWait Promises
    // to hang indefinitely on bridge disconnect.
    this._rejectPendingRequests('Bridge disconnected');
    this.progressListeners.clear();
    this.messageOrigin.clear();
    this.relayCapabilities.clear();
    this.activeExtRequests.clear();
    this.relayActiveExtRequests.clear();
    this.connected = false;
    this.hubConnected = false;
    this.activeHubInstanceId = null;
    this.relayExtensionConnected = false;
    this.relayCount = 0;
    this._clearBrowserState();
    this.mode = 'disconnected';
    console.error(`[FSB Bridge ${this.instanceId}] Disconnected`);
  }

  /**
   * Send a message to the extension and wait for a response.
   * Works in both hub and relay modes.
   */
  async sendAndWait(
    msg: Omit<MCPMessage, 'id'>,
    options?: { timeout?: number; onProgress?: (p: MCPResponse) => void },
  ): Promise<Record<string, unknown>> {
    if (!this.connected) {
      console.error(`[FSB Bridge ${this.instanceId}] sendAndWait: NOT CONNECTED (mode=${this.mode})`);
      throw new Error(FSB_ERROR_MESSAGES['extension_not_connected']);
    }

    // `browser` is routing for the hub, never part of what an extension reads.
    const { browser: requestedBrowser, ...body } = msg;
    const browser = typeof requestedBrowser === 'string' && requestedBrowser ? requestedBrowser : null;

    // Chosen before anything is registered: a browser that is not attached must
    // fail the call here, not after a pending entry and its timer exist.
    let slot: ExtensionSlot | null = null;
    if (this.mode === 'hub') {
      slot = browser ? this.slots.get(browser) ?? null : this._defaultSlot();
      if (!slot) throw this._browserNotConnectedError(browser);
    }

    const id = this.generateId();
    const fullMsg: MCPMessage = { id, ...body };
    const timeoutMs = options?.timeout ?? 30_000;

    console.error(`[FSB Bridge ${this.instanceId}] >> Sending: ${msg.type} (id=${id}, mode=${this.mode}, timeout=${timeoutMs}ms)`);

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.progressListeners.delete(id);
        if (this.mode === 'hub') this.messageOrigin.delete(id);
        console.error(`[FSB Bridge ${this.instanceId}] TIMEOUT: ${msg.type} (id=${id}) after ${timeoutMs}ms`);
        reject(new Error(`Request ${id} (${msg.type}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (resp: MCPResponse) => {
          const success = resp.payload?.success;
          const error = resp.payload?.error;
          console.error(`[FSB Bridge ${this.instanceId}] << Response: ${msg.type} (id=${id}) success=${success}${error ? ` error="${error}"` : ''}`);
          resolve(resp.payload);
        },
        reject,
        timeout: timer,
        browser: slot ? slot.key : null,
      });

      if (options?.onProgress) {
        this.progressListeners.set(id, options.onProgress);
      }

      if (slot) {
        // Send directly to the chosen browser
        this.messageOrigin.set(id, { origin: 'local', browser: slot.key });
        slot.socket.send(JSON.stringify(fullMsg));
      } else if (this.mode === 'relay') {
        // Send to hub for forwarding. The hub routes on `browser`. A hub that
        // sent no roster predates it and serves one browser: it is sent the
        // frame it has always understood.
        this.hubConnection!.send(JSON.stringify(
          browser && this.relayBrowsers !== null ? { ...fullMsg, browser } : fullMsg,
        ));
      }
    });
  }

  /** Whether this bridge can reach an extension (directly or via relay). */
  get isConnected(): boolean {
    return this.topology.extensionConnected;
  }

  /** Whether one named browser is attached. False against a hub with no roster. */
  isConnectedTo(browser: string): boolean {
    return (this.browserRoster ?? []).some((entry) => entry.key === browser);
  }

  /**
   * The attached browsers. Null when this process relays through a hub that
   * predates the roster: that hub serves one browser and takes no `browser`.
   */
  get browserRoster(): BrowserRosterEntry[] | null {
    if (this.mode === 'hub') return this._hubRoster();
    return this.mode === 'relay' ? this.relayBrowsers : null;
  }

  /** Browsers that tried to attach and were turned away, with the reason. */
  get refusedBrowsers(): BrowserRefusal[] {
    return this.mode === 'hub' ? [...this.browserRefusals.values()] : this.relayRefusedBrowsers;
  }

  /** Current operating mode. */
  get currentMode(): BridgeMode {
    return this.mode;
  }

  get topology(): BridgeTopologyState {
    const extensionConnected = this.mode === 'hub' ? this.connected : this.relayExtensionConnected;
    return {
      instanceId: this.instanceId,
      mode: this.mode,
      hubConnected: this.mode === 'hub' ? this.httpServer?.listening === true : this.hubConnected,
      extensionConnected,
      relayCount: this.mode === 'hub' ? this.relayClients.size : this.relayCount,
      pendingRequestCount: this.pendingRequests.size,
      activeHubInstanceId: this.mode === 'hub' ? this.instanceId : this.activeHubInstanceId,
      lastExtensionHeartbeatAt: this.lastExtensionHeartbeatAt,
      lastDisconnectReason: this.lastDisconnectReason,
      extensionAttachment: this.extensionAttachment,
      browsers: this.browserRoster,
      refusedBrowsers: this.refusedBrowsers,
      hubVersion: this.mode === 'hub' ? FSB_MCP_VERSION : this.relayHubVersion,
    };
  }

  // --------------------------------------------------------------------------
  // Browser slots
  // --------------------------------------------------------------------------

  // The single-browser names below are kept as views of the default slot. With
  // one browser attached they mean exactly what the fields they replace meant.

  private get extensionClient(): WsWebSocket | null {
    return this._defaultSlot()?.socket ?? null;
  }

  private get extensionHeartbeatCount(): number {
    return this._defaultSlot()?.heartbeatCount ?? 0;
  }

  private get lastExtensionHeartbeatAt(): number | null {
    return this.mode === 'hub'
      ? this._defaultSlot()?.lastHeartbeatAt ?? null
      : this.relayLastExtensionHeartbeatAt;
  }

  private get extensionAttachment(): ExtensionAttachmentState | null {
    return this.mode === 'hub'
      ? this._defaultSlot()?.attachment ?? null
      : this.relayExtensionAttachment;
  }

  /**
   * The browser a call lands in when it names none. The rule is the sessions'
   * own (pickDefaultBrowser): a Chromium browser before Safari, then the most
   * recently focused, then one with a window, then whichever attached first.
   */
  private _defaultSlot(): ExtensionSlot | null {
    if (this.slots.size === 0) return null;
    const key = pickDefaultBrowser(this._hubRoster());
    return key ? this.slots.get(key) ?? null : null;
  }

  private _slotOf(ws: WsWebSocket): ExtensionSlot | null {
    for (const slot of this.slots.values()) {
      if (slot.socket === ws) return slot;
    }
    return null;
  }

  private _hubRoster(): BrowserRosterEntry[] {
    return [...this.slots.values()].map((slot) => ({
      key: slot.key,
      kind: slot.kind,
      // A Chromium Origin is the extension id, and the browser sets it, so it
      // is preferred to what the extension says about itself.
      extensionId: extensionIdOfOrigin(slot.origin) ?? slot.attachment?.extensionId ?? null,
      extensionVersion: slot.attachment?.extensionVersion ?? null,
      installInstanceId: slot.attachment?.installInstanceId ?? null,
      windows: slot.attachment?.normalWindowCount ?? null,
      authorized: this.acceptedSocketMetadata.get(slot.socket)?.extAuthorized === true,
      focusedAt: slot.focusedAt,
      connectedAt: slot.connectedAt,
      since: slot.since,
    }));
  }

  /**
   * Which install a socket is. Two profiles of one extension share an Origin
   * and differ in the install id each made for itself, so both are needed.
   * Safari gives its extension a new Origin on every launch, so there the
   * install id stands alone. A build that reports no install id is one
   * identity per extension: its profiles cannot be told apart.
   */
  private _identityOf(kind: BrowserKind, origin: string, installId: string | null): string {
    return `${kind === 'safari' ? 'safari' : origin}\n${installId ?? ''}`;
  }

  /**
   * The key an install is attached under: the one it had before, or the
   * shortest one no other install has had. Null when every candidate is taken,
   * which takes ten installs whose ids start the same way.
   */
  private _keyFor(kind: BrowserKind, origin: string, identity: string, installId: string | null): string | null {
    const known = this.identityKeys.get(identity);
    if (known) return known;
    // A key is never taken back from an install, so that it can never come to
    // mean another one. Past this many installs in one process no more are
    // named, which no real machine reaches.
    if (this.identityKeys.size >= MAX_REMEMBERED_IDENTITIES) return null;
    for (const candidate of browserKeyCandidates(kind, extensionIdOfOrigin(origin), installId)) {
      const holder = this.keyIdentities.get(candidate);
      if (holder !== undefined && holder !== identity) continue;
      this.identityKeys.set(identity, candidate);
      this.keyIdentities.set(candidate, identity);
      return candidate;
    }
    return null;
  }

  private _browserNotConnectedError(browser: string | null): BrowserNotConnectedError {
    const error = new Error('browser_not_connected') as BrowserNotConnectedError;
    error.code = 'BROWSER_NOT_CONNECTED';
    error.browser = browser;
    error.connectedBrowsers = [...this.slots.keys()];
    return error;
  }

  private _noteBrowserRefusal(origin: string, reason: string): void {
    // Re-inserted so the map stays ordered by the latest refusal.
    this.browserRefusals.delete(origin);
    if (this.browserRefusals.size >= MAX_BROWSER_REFUSALS) {
      const oldest = this.browserRefusals.keys().next().value;
      if (oldest !== undefined) this.browserRefusals.delete(oldest);
    }
    this.browserRefusals.set(origin, {
      kind: browserKindOf(origin),
      reason: reason.slice(0, MAX_REFUSAL_REASON_LENGTH),
      at: Date.now(),
      extensionId: extensionIdOfOrigin(origin),
    });
  }

  /** Forget everything known about attached browsers, in either mode. */
  private _clearBrowserState(): void {
    this.relayLastExtensionHeartbeatAt = null;
    this.relayExtensionAttachment = null;
    this.relayBrowsers = null;
    this.relayRefusedBrowsers = [];
    this.relayHubVersion = null;
    this.legacyRelayBrowsers.clear();
    this.slotGoneAt.clear();
    this.browserRefusals.clear();
    this.lastFocusedAt.clear();
    this.firstAttachedAt.clear();
    this.relayExtRoutes.clear();
  }

  /** Generate a unique message ID with instance prefix. */
  generateId(): string {
    return `mcp_${this.instanceId}_${++this.msgIdCounter}_${Date.now()}`;
  }

  // --------------------------------------------------------------------------
  // Hub mode
  // --------------------------------------------------------------------------

  private _startAsHub(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const wss = new WebSocketServer({
        noServer: true,
        handleProtocols: (protocols) => protocols.has(FSB_EXT_PROTOCOL) ? FSB_EXT_PROTOCOL : false,
      });
      const httpServer = createServer((_req, res) => {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not found');
      });
      this.wss = wss;
      this.httpServer = httpServer;
      let startupSettled = false;

      httpServer.on('upgrade', (req, socket, head) => {
        const classification = this._classifyUpgrade(req);
        if (!classification) {
          this._rejectUpgrade(socket);
          return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
          this.acceptedSocketMetadata.set(ws, classification);
          wss.emit('connection', ws, req);
        });
      });

      httpServer.on('clientError', (_error, socket) => {
        this._rejectUpgrade(socket);
      });

      httpServer.on('listening', () => {
        startupSettled = true;
        this.mode = 'hub';
        this.hubConnected = true;
        this.activeHubInstanceId = this.instanceId;
        this.relayExtensionConnected = false;
        this.relayCount = 0;
        this.lastDisconnectReason = null;
        console.error(`[FSB Bridge ${this.instanceId}] Hub mode: WebSocket server listening on ${this.host}:${this.port}`);
        resolve();
      });

      httpServer.on('error', (err: NodeJS.ErrnoException) => {
        if (!startupSettled) {
          startupSettled = true;
          this._closeHubServers();
          this.hubConnected = false;
          reject(err);
          return;
        }

        // Post-startup the instance fields may already belong to a newer
        // _startAsHub. A late error from an older server must close only that
        // server -- otherwise it tears down a healthy listener someone else
        // just bound.
        if (this.httpServer !== httpServer) {
          try {
            wss.close();
          } catch {
            // A noServer WebSocketServer may not have accepted a socket yet.
          }
          if (httpServer.listening) {
            try {
              httpServer.close();
            } catch {
              // The server may already be closing after the error.
            }
          }
          return;
        }

        const errorCode = typeof err.code === 'string' ? err.code.toLowerCase() : undefined;
        // Separate events so a burst of accept failures cannot coalesce away
        // the one line that records the listener actually dying.
        const logged = logBridgeEvent({
          event: httpServer.listening ? 'hub_server_error' : 'hub_listener_lost',
          instanceId: this.instanceId,
          reason: errorCode,
        });

        // Node keeps the listening handle open after an accept failure such as
        // EMFILE, so the hub is still serving. Tearing it down here would turn
        // a transient error into an outage. Such failures can repeat once per
        // incoming connection, hence the coalesced log.
        if (httpServer.listening) {
          if (logged) {
            console.error(`[FSB Bridge ${this.instanceId}] Hub HTTP server error (still listening):`, err.message);
          }
          return;
        }

        // The listener is really gone. Staying in 'hub' mode would leave the
        // extension and every relay attached to a hub that accepts nobody and
        // never demotes, so drop them all and compete for the port again --
        // the same path a relay takes when its hub disappears.
        console.error(`[FSB Bridge ${this.instanceId}] Hub HTTP server error, listener lost:`, err.message);
        this._abandonHub('hub_server_error');
        void this._attemptPromotion();
      });

      wss.on('connection', (ws: WsWebSocket) => {
        this._handleNewConnection(ws);
      });

      wss.on('error', (err: Error) => {
        console.error(`[FSB Bridge ${this.instanceId}] Hub WebSocket server error:`, err.message);
      });

      httpServer.listen(this.port, this.host);
    });
  }

  private _closeHubServers(): void {
    const wss = this.wss;
    const httpServer = this.httpServer;
    this.wss = null;
    this.httpServer = null;

    if (wss) {
      try {
        wss.close();
      } catch {
        // A noServer WebSocketServer may not have accepted a socket yet.
      }
    }
    if (httpServer?.listening) {
      try {
        httpServer.close();
      } catch {
        // The server may already be closing after an error.
      }
    }
  }

  /** Close every socket and server this process holds as hub. */
  private _closeHubSockets(): void {
    for (const [id, ws] of this.relayClients) {
      ws.close();
      this.relayClients.delete(id);
      this.relayCapabilities.delete(id);
    }
    // Cleared before close() so each socket's own close handler sees a stale
    // slot and leaves the bridge state to the caller.
    const slots = [...this.slots.values()];
    this.slots.clear();
    for (const slot of slots) {
      this._stopSlotLiveness(slot);
      slot.socket.close();
    }
    const pending = [...this.pendingExtensions];
    this.pendingExtensions.clear();
    for (const [socket, waiting] of pending) {
      if (waiting.timer) clearTimeout(waiting.timer);
      socket.close();
    }
    for (const timer of this.legacyBindingTimers) clearTimeout(timer);
    this.legacyBindingTimers.clear();
    this._closeHubServers();
    for (const [, timer] of this.handshakeTimers) {
      clearTimeout(timer);
    }
    this.handshakeTimers.clear();
  }

  private _rejectPendingRequests(message: string, reason?: string): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      const error = new Error(message) as BridgeDisconnectError;
      if (reason) error.bridgeDisconnectReason = reason;
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }

  /**
   * Leave hub mode without shutting down: unlike disconnect() this is not
   * intentional, so the caller is expected to compete for the port again.
   */
  private _abandonHub(reason: string): void {
    for (const route of [...this.activeExtRequests.values()]) {
      this._abortExtRoute(route);
    }
    this._closeHubSockets();
    this._rejectPendingRequests('Bridge disconnected', reason);
    this.progressListeners.clear();
    this.messageOrigin.clear();
    this.relayCapabilities.clear();
    this.activeExtRequests.clear();
    this.connected = false;
    this.hubConnected = false;
    this.activeHubInstanceId = null;
    this._clearBrowserState();
    this.mode = 'disconnected';
    this.lastDisconnectReason = reason;
  }

  private _activePort(): number {
    const address = this.httpServer?.address();
    return address && typeof address === 'object' ? address.port : this.port;
  }

  private _singleRawHeader(req: IncomingMessage, name: string): string | null {
    const values: string[] = [];
    for (let index = 0; index < req.rawHeaders.length; index += 2) {
      if (req.rawHeaders[index]?.toLowerCase() === name) {
        values.push(req.rawHeaders[index + 1] ?? '');
      }
    }
    return values.length === 1 && values[0].length > 0 ? values[0] : null;
  }

  private _hasRawHeader(req: IncomingMessage, name: string): boolean {
    for (let index = 0; index < req.rawHeaders.length; index += 2) {
      if (req.rawHeaders[index]?.toLowerCase() === name) return true;
    }
    return false;
  }

  private _hasAllowedHost(req: IncomingMessage): boolean {
    const hostHeader = this._singleRawHeader(req, 'host');
    if (!hostHeader || typeof req.headers.host !== 'string') return false;
    const normalized = hostHeader.toLowerCase();
    if (req.headers.host.toLowerCase() !== normalized) return false;

    const port = this._activePort();
    const allowed = new Set([
      `127.0.0.1:${port}`,
      `localhost:${port}`,
      ...(this.host === '::1' ? [`[::1]:${port}`] : []),
    ]);
    return allowed.has(normalized);
  }

  private _parseBrowserOrigin(req: IncomingMessage): string | null | false {
    if (!this._hasRawHeader(req, 'origin')) return null;
    const originHeader = this._singleRawHeader(req, 'origin');
    if (!originHeader || typeof req.headers.origin !== 'string' || originHeader.includes(',')) {
      return false;
    }

    try {
      const parsed = new URL(originHeader);
      if (
        (parsed.protocol !== 'chrome-extension:' && parsed.protocol !== 'safari-web-extension:')
        || !parsed.host
        || parsed.port
        || parsed.username
        || parsed.password
        || (parsed.pathname !== '' && parsed.pathname !== '/')
        || parsed.search
        || parsed.hash
      ) {
        return false;
      }
      const canonical = `${parsed.protocol}//${parsed.host}`;
      if (originHeader !== canonical && originHeader !== `${canonical}/`) return false;
      if (!this.allowedBrowserOrigins.some((allowedOrigin) =>
        allowedOrigin.endsWith('://')
          ? canonical.startsWith(allowedOrigin)
          : canonical === allowedOrigin)) {
        return false;
      }
      return canonical;
    } catch {
      return false;
    }
  }

  private _classifyUpgrade(req: IncomingMessage): AcceptedSocketMetadata | null {
    if (!this._hasAllowedHost(req)) {
      logBridgeEvent({ event: 'upgrade_rejected_host', instanceId: this.instanceId });
      return null;
    }

    const browserOrigin = this._parseBrowserOrigin(req);
    if (browserOrigin === false) return null;
    const state = readBridgeAuthState();

    if (browserOrigin && state?.allowedExtensionOrigin && state.allowedExtensionOrigin !== browserOrigin) {
      // This rejection is a bare 403 with no WebSocket, no close code and no
      // reason, so the extension sees an indistinguishable generic failure and
      // retries forever. Naming the pin and its cure here is the only place the
      // answer can surface. Gated on the journal's write decision so a retry
      // loop cannot flood stderr.
      if (logBridgeEvent({
        event: 'upgrade_rejected_origin_pin',
        instanceId: this.instanceId,
        origin: browserOrigin,
        pinnedOrigin: state.allowedExtensionOrigin,
      })) {
        console.error(
          `[FSB Bridge ${this.instanceId}] Refusing upgrade from ${browserOrigin}: `
          + `bridge pairing is bound to ${state.allowedExtensionOrigin}. `
          + 'Cure: npx -y fsb-mcp-server@latest pair --reset',
        );
      }
      // A refused upgrade is a bare 403 and carries no reason to the browser,
      // so the reason is kept here for status, doctor and tool errors.
      this._noteBrowserRefusal(browserOrigin, 'extension_origin_pin_mismatch');
      this.lastDisconnectReason = 'extension_origin_pin_mismatch';
      this._broadcastRelayState();
      return null;
    }

    let extAuthorized = false;
    let sessionId = state?.sessionId ?? null;
    if (browserOrigin && state && authenticateBridgeProtocols(req.headers['sec-websocket-protocol'], state)) {
      try {
        const boundState = state.allowedExtensionOrigin === null
          ? bindAllowedExtensionOrigin(browserOrigin)
          : state;
        extAuthorized = boundState.allowedExtensionOrigin === browserOrigin
          && authenticateBridgeProtocols(req.headers['sec-websocket-protocol'], boundState);
        if (!extAuthorized) return null;
        sessionId = boundState.sessionId;
      } catch {
        return null;
      }
    }

    if (browserOrigin && !extAuthorized) {
      // Worth recording precisely because it is the normal, healthy state for
      // an unpaired extension: ordinary browser tools work fine, only the
      // reverse channel is gated. From the outside it is indistinguishable
      // from the broken case, so the journal is where the difference lives.
      logBridgeEvent({
        event: 'upgrade_accepted_unauthorized',
        instanceId: this.instanceId,
        origin: browserOrigin,
      });
    }

    return {
      browserOrigin: browserOrigin || null,
      extAuthorized,
      sessionId,
      unauthorizedSent: false,
    };
  }

  private _rejectUpgrade(socket: Duplex): void {
    if (socket.destroyed) return;
    try {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    } catch {
      socket.destroy();
    }
  }

  private _parseRelayHello(raw: string): RelayHello | null {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const keys = Object.keys(parsed);
      if (keys.some((key) => key !== 'type' && key !== 'instanceId' && key !== 'capabilities')) {
        return null;
      }
      if (
        parsed.type !== 'relay:hello'
        || typeof parsed.instanceId !== 'string'
        || parsed.instanceId.length === 0
        || parsed.instanceId.length > 200
        || parsed.instanceId.trim() !== parsed.instanceId
      ) {
        return null;
      }
      if (Object.prototype.hasOwnProperty.call(parsed, 'capabilities')) {
        if (
          !Array.isArray(parsed.capabilities)
          || parsed.capabilities.length > 1
          || parsed.capabilities.some((capability) => capability !== 'agent-spawn')
        ) {
          return null;
        }
      }
      return parsed as unknown as RelayHello;
    } catch {
      return null;
    }
  }

  /**
   * Browser-Origin sockets are extension candidates. Origin-less sockets must
   * prove that they are an MCP relay with a valid relay:hello before the short
   * handshake deadline; they never fall through to extension authority.
   */
  private _handleNewConnection(ws: WsWebSocket): void {
    const metadata = this.acceptedSocketMetadata.get(ws);
    if (!metadata) {
      ws.close(1008, 'Socket classification unavailable');
      return;
    }

    if (metadata.browserOrigin) {
      this._acceptExtensionSocket(ws, metadata.browserOrigin);
      return;
    }

    let identified = false;

    const onMessage = (data: Buffer | string): void => {
      const raw = typeof data === 'string' ? data : data.toString();
      if (identified) return;
      identified = true;
      clearTimeout(handshakeTimer);
      this.handshakeTimers.delete(ws);
      const hello = this._parseRelayHello(raw);
      if (!hello) {
        ws.close(1008, 'Relay handshake required');
        return;
      }
      this._registerRelayClient(ws, hello);
    };

    ws.on('message', onMessage);

    // An Origin-less socket that does not identify itself is never an extension.
    const handshakeTimer = setTimeout(() => {
      if (!identified) {
        identified = true;
        this.handshakeTimers.delete(ws);
        ws.close(1008, 'Relay handshake required');
      }
    }, this.handshakeTimeoutMs);

    this.handshakeTimers.set(ws, handshakeTimer);

    ws.on('close', () => {
      if (!identified) {
        identified = true;
        clearTimeout(handshakeTimer);
        this.handshakeTimers.delete(ws);
      }
    });
  }

  /**
   * Take an extension socket in. It is heard from at once, because its first
   * frame is what names it, but it becomes a browser only in _attachExtension.
   */
  private _acceptExtensionSocket(ws: WsWebSocket, origin: string): void {
    if (this.slots.size + this.pendingExtensions.size >= MAX_BROWSER_SLOTS) {
      this._refuseExtension(ws, origin, 'browser_limit_reached', 'Too many browsers attached');
      return;
    }

    ws.on('message', (data: Buffer | string) => {
      this._handleExtensionMessage(ws, typeof data === 'string' ? data : data.toString());
    });
    ws.on('error', (err: Error) => {
      console.error(`[FSB Bridge ${this.instanceId}] Extension error:`, err.message);
    });
    ws.on('close', () => {
      const waiting = this.pendingExtensions.get(ws);
      if (waiting?.timer) clearTimeout(waiting.timer);
      this.pendingExtensions.delete(ws);
      // A socket can use the reverse channel before it is named, and one that
      // is turned away never gets a slot whose close would settle its routes.
      this._abortRoutesForOrigin(ws);
    });

    if (this.extensionIdentifyTimeoutMs <= 0) {
      this._attachExtension(ws, origin, null);
      return;
    }
    const timer = setTimeout(() => {
      const waiting = this.pendingExtensions.get(ws);
      if (!waiting) return;
      waiting.timer = null;
      this._attachExtension(ws, origin, null);
    }, this.extensionIdentifyTimeoutMs);
    timer.unref?.();
    this.pendingExtensions.set(ws, { origin, timer });
  }

  private _refuseExtension(ws: WsWebSocket, origin: string, reason: string, closeReason: string): void {
    // Coalesced: an extension that keeps retrying lands here once per attempt,
    // which is how a single lockout produced tens of thousands of identical
    // lines in the field.
    if (logBridgeEvent({
      event: 'extension_slot_refused',
      instanceId: this.instanceId,
      origin,
      ...(reason === 'extension_slot_held' ? {} : { reason }),
    })) {
      console.error(reason === 'extension_slot_held'
        ? `[FSB Bridge ${this.instanceId}] Unprivileged extension candidate cannot replace active extension`
        : `[FSB Bridge ${this.instanceId}] Refusing extension socket (${reason})`);
    }
    if (reason !== 'extension_slot_held') this._noteBrowserRefusal(origin, reason);
    ws.close(1008, closeReason);
  }

  /**
   * Make an accepted socket a browser. `report` is its first state frame, or
   * null for a build that sent none in time.
   *
   * Only a socket that is the same install as an attached one contests its
   * slot, and it wins only with pairing authority, as a second socket always
   * has. Another profile is another install and takes a slot of its own.
   */
  private _attachExtension(ws: WsWebSocket, origin: string, report: ExtensionStateReport | null): void {
    const waiting = this.pendingExtensions.get(ws);
    if (waiting?.timer) clearTimeout(waiting.timer);
    this.pendingExtensions.delete(ws);
    if (ws.readyState !== WebSocket.OPEN) return;

    const kind = browserKindOf(origin);
    const installId = compactInstallId(report?.attachment.installInstanceId);
    const identity = this._identityOf(kind, origin, installId);

    // Every attached Chromium browser runs the same extension. Profiles share
    // an extension id, and that is all this admits: a second id is turned away
    // while the first is attached, exactly as it was when the hub held one
    // socket. Otherwise any other extension in the browser could attach beside
    // FSB and, by claiming focus, be handed the calls that name no browser.
    // Safari's Origin is random, so there one install is the most that can be
    // told to be FSB. Even that one may be another extension, which is why a
    // Safari install never takes the default from a Chromium browser, however
    // recently it says it was focused (pickDefaultBrowser). A paired socket is
    // past this: it has proved itself, and attaching it closes whatever is
    // outside its pin.
    const stranger = [...this.slots.values()].some((slot) => slot.kind === kind
      && (kind === 'safari' ? slot.identity !== identity : slot.origin !== origin));
    if (stranger && !this._isCurrentExtAuthority(ws)) {
      this._refuseExtension(ws, origin, 'another_extension_attached', 'Another extension is attached');
      return;
    }

    const key = this._keyFor(kind, origin, identity, installId);
    if (!key) {
      this._refuseExtension(ws, origin, 'browser_key_unavailable', 'No browser key available');
      return;
    }
    if (this.slots.has(key) && !this._isCurrentExtAuthority(ws)) {
      this._refuseExtension(ws, origin, 'extension_slot_held', 'Extension authorization required');
      return;
    }
    this._registerExtensionClient(ws, { key, kind, origin, identity }, report);
  }

  private _registerExtensionClient(
    ws: WsWebSocket,
    named: Pick<ExtensionSlot, 'key' | 'kind' | 'origin' | 'identity'>,
    report: ExtensionStateReport | null,
  ): void {
    const metadata = this.acceptedSocketMetadata.get(ws);
    const { key, kind, origin } = named;
    const previous = this.slots.get(key);

    if (previous) {
      this._stopSlotLiveness(previous);
      console.error(`[FSB Bridge ${this.instanceId}] New extension connected, closing previous`);
      this.lastDisconnectReason = 'extension_replaced';
      previous.closeCause = 'extension_replaced';
      logBridgeEvent({
        event: 'extension_replaced',
        instanceId: this.instanceId,
        origin: this.acceptedSocketMetadata.get(previous.socket)?.browserOrigin ?? null,
      });
      this._abortRoutesForOrigin(previous.socket);
      previous.socket.close();
    }

    const now = Date.now();
    // A worker restart is the same browser: it keeps its place in the order
    // the default is chosen by, and its last focus stands until it reports.
    const goneAt = this.slotGoneAt.get(key);
    const cameBack = previous !== undefined
      || (goneAt !== undefined && now - goneAt <= BROWSER_SENIORITY_GRACE_MS);
    const since = (cameBack ? this.firstAttachedAt.get(key) : undefined) ?? now;
    this.firstAttachedAt.set(key, since);
    const slot: ExtensionSlot = {
      ...named,
      socket: ws,
      livenessTimer: null,
      lastHeartbeatAt: now,
      heartbeatCount: 0,
      closeCause: null,
      attachment: report?.attachment ?? null,
      focusedAt: this.lastFocusedAt.get(key) ?? null,
      lastBrowserStateAt: 0,
      connectedAt: now,
      since,
    };
    if (metadata) metadata.browserKey = key;
    this.slots.set(key, slot);
    this.slotGoneAt.delete(key);
    this.browserRefusals.delete(origin);
    if (report) this._applyFocus(slot, report.focusedAt);
    this.connected = true;
    this.lastDisconnectReason = null;
    console.error(`[FSB Bridge ${this.instanceId}] Extension connected (${key})`);
    if (metadata?.extAuthorized) this._closeSlotsOutsidePin(slot);
    this._broadcastRelayState();
    this._startExtensionLiveness(slot);

    ws.on('close', (code: number) => {
      if (this.slots.get(key) !== slot) return;
      this._stopSlotLiveness(slot);

      // The rejection message below stays literal so the sw_evicted recovery
      // keeps arming -- that recovery (reconnect, then fetch the persisted
      // snapshot) is right for an authorization close too, because the task
      // really was interrupted. The specific cause rides on a property of the
      // Error instead, so callers can report what actually happened without
      // any recovery branch changing.
      const cause = slot.closeCause
        ?? (code === 1008 ? 'extension_policy_closed' : 'extension_disconnected');
      slot.closeCause = null;

      console.error(`[FSB Bridge ${this.instanceId}] Extension disconnected (${key}: ${cause}, code=${code})`);
      logBridgeEvent({
        event: 'extension_closed',
        instanceId: this.instanceId,
        origin: this.acceptedSocketMetadata.get(ws)?.browserOrigin ?? null,
        closeCode: code,
        reason: cause,
      });
      this.slots.delete(key);
      this.slotGoneAt.set(key, Date.now());
      this.connected = this.slots.size > 0;
      this.lastDisconnectReason = cause;
      if ([...this.legacyRelayBrowsers.values()].includes(key)) this._scheduleLegacyBindingExpiry();

      // Fail only what this browser was holding. Calls in another browser go on.
      for (const [id, pending] of this.pendingRequests) {
        if (pending.browser !== key) continue;
        clearTimeout(pending.timeout);
        const error = new Error('Extension disconnected') as BridgeDisconnectError;
        error.bridgeDisconnectReason = cause;
        pending.reject(error);
        this.pendingRequests.delete(id);
        this.progressListeners.delete(id);
      }

      this._abortRoutesForOrigin(ws);

      // Relay clients learn of the requests this browser can no longer answer
      // when those time out. Their routes are dropped here.
      for (const [msgId, route] of this.messageOrigin) {
        if (route.browser === key) this.messageOrigin.delete(msgId);
      }
      this._broadcastRelayState();
    });
  }

  /**
   * A paired browser owns the bridge: once its origin is pinned, the upgrade
   * gate refuses every other origin. A browser that attached before the pin
   * was bound is closed here, so the outcome is the same whoever came first.
   */
  private _closeSlotsOutsidePin(paired: ExtensionSlot): void {
    const pinnedOrigin = this.acceptedSocketMetadata.get(paired.socket)?.browserOrigin ?? null;
    for (const other of [...this.slots.values()]) {
      if (other === paired) continue;
      const origin = this.acceptedSocketMetadata.get(other.socket)?.browserOrigin ?? null;
      if (origin === pinnedOrigin) continue;
      other.closeCause = 'extension_origin_pin_mismatch';
      if (origin) this._noteBrowserRefusal(origin, 'extension_origin_pin_mismatch');
      logBridgeEvent({
        event: 'extension_slot_refused',
        instanceId: this.instanceId,
        origin,
        reason: 'extension_origin_pin_mismatch',
      });
      console.error(
        `[FSB Bridge ${this.instanceId}] Closing ${other.key}: bridge pairing is now bound to another browser`,
      );
      other.socket.close(1008, 'Bridge pairing is bound to another browser');
    }
  }

  /**
   * The extension slot is freed only by the incumbent socket's own close event,
   * so a peer that stops answering without ever sending FIN holds it forever.
   * Two independent tiers close that hole:
   *
   *   Tier A (transport) -- protocol ping/pong. Catches half-open sockets and
   *     dead TCP peers, and cannot false-positive because every RFC 6455
   *     endpoint must answer a ping.
   *   Tier B (application) -- the extension's own mcp:ping. Catches a live
   *     transport whose service worker is gone; a browser answers protocol
   *     pings below the worker, so a pong alone does not prove the worker is
   *     running. Armed only once this socket has sent at least one mcp:ping,
   *     so an older extension build that never sends one is governed by Tier A
   *     alone and is never terminated merely for staying quiet.
   */
  private _startExtensionLiveness(slot: ExtensionSlot): void {
    const ws = slot.socket;
    let awaitingPong = false;
    let sawAppHeartbeat = false;

    ws.on('pong', () => {
      awaitingPong = false;
    });

    const timer = setInterval(() => {
      if (this.slots.get(slot.key) !== slot) {
        this._stopSlotLiveness(slot);
        return;
      }
      if (ws.readyState !== WebSocket.OPEN) {
        this._reapExtensionClient(ws, 'transport_closed');
        return;
      }

      const heartbeatAt = slot.lastHeartbeatAt;
      // Counted rather than inferred from timestamps: registration and a fast
      // first ping can land in the same millisecond, and a comparison would
      // then never arm this tier at all.
      if (slot.heartbeatCount > 0) sawAppHeartbeat = true;

      if (awaitingPong) {
        this._reapExtensionClient(ws, 'pong_timeout');
        return;
      }
      if (
        sawAppHeartbeat
        && heartbeatAt !== null
        && Date.now() - heartbeatAt > this.extensionHeartbeatTimeoutMs
      ) {
        this._reapExtensionClient(ws, 'heartbeat_timeout');
        return;
      }

      awaitingPong = true;
      try {
        ws.ping();
      } catch {
        // A socket that cannot even be pinged is already gone; the readyState
        // check on the next tick reaps it.
        awaitingPong = false;
      }
    }, this.extensionPingIntervalMs);

    timer.unref?.();
    slot.livenessTimer = timer;
  }

  /** Each browser has its own timer: stopping one must never stop another's. */
  private _stopSlotLiveness(slot: ExtensionSlot): void {
    if (!slot.livenessTimer) return;
    clearInterval(slot.livenessTimer);
    slot.livenessTimer = null;
  }

  /**
   * terminate() rather than close(): a peer that has stopped answering will not
   * complete a closing handshake either. terminate() still fires the socket's
   * own 'close' handler, which is the one place that frees the slot.
   */
  private _reapExtensionClient(ws: WsWebSocket, reason: string): void {
    const slot = this._slotOf(ws);
    if (!slot) return;
    this._stopSlotLiveness(slot);
    console.error(`[FSB Bridge ${this.instanceId}] Extension liveness lost (${slot.key}: ${reason}), terminating socket`);
    logBridgeEvent({
      event: 'extension_reaped',
      instanceId: this.instanceId,
      origin: this.acceptedSocketMetadata.get(ws)?.browserOrigin ?? null,
      reason,
    });
    slot.closeCause = `extension_reaped_${reason}`;
    ws.terminate();
  }

  private _registerRelayClient(ws: WsWebSocket, hello: RelayHello): void {
    const clientId = hello.instanceId;
    const capabilities = new Set<BridgeCapability>(
      Array.isArray(hello.capabilities) && hello.capabilities.includes('agent-spawn')
        ? ['agent-spawn']
        : [],
    );

    if (this.relayClients.has(clientId)) {
      console.error(`[FSB Bridge ${this.instanceId}] Relay client ${clientId} reconnected, closing old`);
      this._settleRoutesForRelay(clientId);
      this.relayClients.get(clientId)!.close();
    }

    this.relayClients.set(clientId, ws);
    this.relayCapabilities.set(clientId, capabilities);
    console.error(`[FSB Bridge ${this.instanceId}] Relay client ${clientId} registered (total: ${this.relayClients.size})`);

    // Send welcome
    const welcome: RelayWelcome = {
      ...this._relayView(clientId),
      type: 'relay:welcome',
      instanceId: clientId,
    };
    ws.send(JSON.stringify(welcome));
    this._broadcastRelayState();

    // Replace message handler
    ws.removeAllListeners('message');
    ws.on('message', (data: Buffer | string) => {
      this._handleRelayClientMessage(clientId, typeof data === 'string' ? data : data.toString());
    });

    ws.on('close', () => {
      console.error(`[FSB Bridge ${this.instanceId}] Relay client ${clientId} disconnected`);
      if (this.relayClients.get(clientId) === ws) {
        this.relayClients.delete(clientId);
        this.relayCapabilities.delete(clientId);
        this.legacyRelayBrowsers.delete(clientId);
        this._settleRoutesForRelay(clientId);
      }

      // Clean up messageOrigin entries for this client
      for (const [msgId, route] of this.messageOrigin) {
        if (route.origin === clientId) {
          this.messageOrigin.delete(msgId);
        }
      }
      this._broadcastRelayState();
    });

    ws.on('error', (err: Error) => {
      console.error(`[FSB Bridge ${this.instanceId}] Relay client ${clientId} error:`, err.message);
    });
  }

  /**
   * What one relay is told. The single-extension fields describe one browser:
   * the one a relay was given if it names none (a client from before the
   * roster, which must go on seeing the one-browser bridge it expects), and
   * otherwise the default. `browsers` lists all of them for clients that can
   * choose.
   */
  private _relayView(relayId: string | null): Omit<RelayState, 'type'> {
    const boundKey = relayId ? this._legacyBinding(relayId) : undefined;
    const slot = boundKey ? this.slots.get(boundKey) ?? null : this._defaultSlot();
    return {
      hubInstanceId: this.instanceId,
      extensionConnected: slot !== null,
      relayCount: this.relayClients.size,
      lastExtensionHeartbeatAt: slot?.lastHeartbeatAt ?? null,
      lastDisconnectReason: this.lastDisconnectReason,
      extensionAttachment: slot?.attachment ?? null,
      browsers: this._hubRoster(),
      refusedBrowsers: [...this.browserRefusals.values()],
      hubVersion: FSB_MCP_VERSION,
    };
  }

  /**
   * The browser an older relay is tied to, or undefined once that browser has
   * been gone longer than the binding grace. The tie is dropped then, so the
   * relay is described, and next served, by whichever browser is the default.
   */
  private _legacyBinding(relayId: string): string | undefined {
    const key = this.legacyRelayBrowsers.get(relayId);
    if (!key || this.slots.has(key)) return key;
    const goneAt = this.slotGoneAt.get(key);
    if (goneAt !== undefined && Date.now() - goneAt <= this.legacyRelayBindingGraceMs) return key;
    this.legacyRelayBrowsers.delete(relayId);
    return undefined;
  }

  /**
   * An older relay sends nothing while it is told no extension is connected,
   * so it cannot be left waiting for its own next frame to learn that its
   * browser is gone for good. Once the grace is over it is told again, and by
   * then _legacyBinding describes the browser that is left.
   */
  private _scheduleLegacyBindingExpiry(): void {
    const timer = setTimeout(() => {
      this.legacyBindingTimers.delete(timer);
      if (this.mode === 'hub') this._broadcastRelayState();
    }, this.legacyRelayBindingGraceMs + 10);
    timer.unref?.();
    this.legacyBindingTimers.add(timer);
  }

  private _buildRelayState(relayId: string | null = null): RelayState {
    return { type: 'relay:state', ...this._relayView(relayId) };
  }

  private _broadcastRelayState(): void {
    for (const [relayId, ws] of this.relayClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(this._buildRelayState(relayId)));
      }
    }
  }

  /** A state frame, checked field by field. Null if any of it is not as expected. */
  private _parseExtensionState(
    frame: Record<string, unknown>,
    kind: BrowserKind,
  ): ExtensionStateReport | null {
    const { extensionId, extensionVersion, installInstanceId, normalWindowCount, connectedAt } = frame;
    // Chrome's id is 32 letters. Safari's is its bundle id, followed by the
    // signing team in parentheses.
    const idPattern = kind === 'safari' ? SAFARI_EXTENSION_ID_PATTERN : /^[a-p]{32}$/;
    if (
      typeof extensionId !== 'string' || extensionId.length > 128 || !idPattern.test(extensionId)
      || typeof extensionVersion !== 'string' || extensionVersion.length > 64
      || typeof installInstanceId !== 'string' || installInstanceId.length > 128
      || !Number.isInteger(normalWindowCount) || (normalWindowCount as number) < 0
      || (normalWindowCount as number) > 1000
      || !(connectedAt === null || (typeof connectedAt === 'string' && connectedAt.length <= 64))
    ) return null;
    return {
      attachment: {
        extensionId,
        extensionVersion,
        installInstanceId,
        normalWindowCount: normalWindowCount as number,
        connectedAt: connectedAt as string | null,
      },
      focusedAt: frame.focusedAt,
    };
  }

  /** Record a focus report. True when it moved the browser's last focus forward. */
  private _applyFocus(slot: ExtensionSlot, value: unknown): boolean {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return false;
    // Never later than now: a browser cannot claim the default from the future.
    const at = Math.min(value, Date.now());
    if (slot.focusedAt !== null && at <= slot.focusedAt) return false;
    slot.focusedAt = at;
    this.lastFocusedAt.set(slot.key, at);
    return true;
  }

  /**
   * Handle a message FROM the extension (a response to some request).
   * Route it to the correct origin (local pending request or relay client).
   */
  private _handleExtensionMessage(ws: WsWebSocket, raw: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed.type === 'mcp:ping') {
        const heartbeat = this._parseHeartbeatPing(parsed);
        if (!heartbeat) return;
        const heartbeatAt = Date.now();
        // A socket just replaced can still deliver a ping already in flight. It
        // is answered, but must not arm or refresh its successor's liveness.
        // Nor may one browser's ping refresh another browser's slot.
        const pinged = this._slotOf(ws);
        const current = pinged !== null;
        if (pinged) {
          pinged.lastHeartbeatAt = heartbeatAt;
          pinged.heartbeatCount += 1;
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(heartbeat.nonce === undefined
            ? { type: 'mcp:pong', ts: heartbeatAt }
            : { type: 'mcp:pong', ts: heartbeatAt, nonce: heartbeat.nonce }));
        }
        if (current) this._broadcastRelayState();
        return;
      }
      const stateSlot = parsed.type === 'mcp:extension-state' || parsed.type === 'mcp:browser-state'
        ? this._slotOf(ws)
        : null;
      if (parsed.type === 'mcp:extension-state') {
        const waiting = this.pendingExtensions.get(ws);
        if (!stateSlot && !waiting) return;
        const report = this._parseExtensionState(
          parsed,
          stateSlot ? stateSlot.kind : browserKindOf((waiting as PendingExtension).origin),
        );
        if (!report) return;
        if (waiting) {
          // The frame that says which install this socket is.
          this._attachExtension(ws, waiting.origin, report);
          return;
        }
        if (stateSlot) {
          // A slot keeps the name it was attached under. A build that reports
          // late is still shown with what it says about itself.
          stateSlot.attachment = report.attachment;
          this._applyFocus(stateSlot, report.focusedAt);
          this._broadcastRelayState();
        }
        return;
      }
      if (parsed.type === 'mcp:browser-state' && stateSlot) {
        // Focus reports decide the default browser, so they are rate limited
        // and taken only from a socket that holds a slot.
        const now = Date.now();
        if (now - stateSlot.lastBrowserStateAt < BROWSER_STATE_MIN_INTERVAL_MS) return;
        stateSlot.lastBrowserStateAt = now;
        if (this._applyFocus(stateSlot, parsed.focusedAt)) this._broadcastRelayState();
        return;
      }
      if (parsed.type === 'mcp:extension-state' || parsed.type === 'mcp:browser-state') return;
    } catch {
      console.error(`[FSB Bridge ${this.instanceId}] Failed to parse extension message`);
      return;
    }

    if (typeof parsed.type === 'string' && parsed.type.startsWith('ext:')) {
      if (!this._isCurrentExtAuthority(ws)) {
        this._revokeExtAuthority(ws, parsed.id);
        return;
      }

      const extFrame = parseExtFrame(parsed);
      if (extFrame?.type === 'ext:request') {
        this._handleExtRequest(ws, extFrame);
      } else {
        const id = typeof parsed.id === 'string' && parsed.id.length > 0 && parsed.id.length <= 200
          ? parsed.id
          : 'invalid_ext_request';
        this._sendExtResponse(ws, makeExtError(
          id,
          'invalid_ext_request',
          'Extension request frame is invalid',
          false,
        ));
      }
      return;
    }

    const resp = parsed as unknown as MCPResponse;

    const route = this.messageOrigin.get(resp.id);
    // An answer counts only from the browser the request went to. Another
    // browser that happens to use the same id must not settle it.
    const asked = route?.browser ?? this.pendingRequests.get(resp.id)?.browser ?? null;
    if (asked !== null && asked !== (this.acceptedSocketMetadata.get(ws)?.browserKey ?? null)) {
      console.error(`[FSB Bridge ${this.instanceId}] Dropped a response from a browser that was not asked`);
      return;
    }
    const origin = route?.origin;

    // Progress notifications
    if (resp.type === 'mcp:progress') {
      if (origin === 'local') {
        const listener = this.progressListeners.get(resp.id);
        if (listener) listener(resp);
      } else if (origin) {
        // Forward progress to relay client
        const relayWs = this.relayClients.get(origin);
        if (relayWs) relayWs.send(raw);
      }
      return;
    }

    // Final result
    if (origin === 'local' || !origin) {
      // Handle locally (same as original logic)
      const pending = this.pendingRequests.get(resp.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(resp.id);
        this.progressListeners.delete(resp.id);
        this.messageOrigin.delete(resp.id);
        pending.resolve(resp);
      }
    } else {
      // Forward to relay client
      const relayWs = this.relayClients.get(origin);
      if (relayWs) {
        relayWs.send(raw);
      }
      this.messageOrigin.delete(resp.id);
    }
  }

  private _parseHeartbeatPing(
    value: Record<string, unknown>,
  ): { nonce?: string } | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const keys = Object.keys(value).sort();
    const hasNonce = Object.prototype.hasOwnProperty.call(value, 'nonce');
    if (
      keys.length !== (hasNonce ? 3 : 2)
      || keys[0] !== (hasNonce ? 'nonce' : 'ts')
      || keys[hasNonce ? 1 : 0] !== 'ts'
      || keys[hasNonce ? 2 : 1] !== 'type'
      || value.type !== 'mcp:ping'
      || typeof value.ts !== 'number'
      || !Number.isSafeInteger(value.ts)
      || value.ts < 0
    ) {
      return null;
    }
    if (!hasNonce) return {};
    if (
      typeof value.nonce !== 'string'
      || value.nonce.length < HEARTBEAT_NONCE_MIN_LENGTH
      || value.nonce.length > HEARTBEAT_NONCE_MAX_LENGTH
      || !HEARTBEAT_NONCE_PATTERN.test(value.nonce)
    ) {
      return null;
    }
    return { nonce: value.nonce };
  }

  private _isCurrentExtAuthority(ws: WsWebSocket): boolean {
    const metadata = this.acceptedSocketMetadata.get(ws);
    if (!metadata?.extAuthorized || !metadata.browserOrigin || !metadata.sessionId) return false;
    const state = readBridgeAuthState();
    return state !== null
      && state.sessionId === metadata.sessionId
      && state.allowedExtensionOrigin === metadata.browserOrigin;
  }

  private _revokeExtAuthority(ws: WsWebSocket, requestId: unknown): void {
    const metadata = this.acceptedSocketMetadata.get(ws);
    if (!metadata) return;
    metadata.extAuthorized = false;
    const revoked = this._slotOf(ws);
    if (revoked) revoked.closeCause = 'extension_auth_revoked';
    logBridgeEvent({
      event: 'ext_authority_revoked',
      instanceId: this.instanceId,
      origin: metadata.browserOrigin,
    });
    if (!metadata.unauthorizedSent && ws.readyState === WebSocket.OPEN) {
      metadata.unauthorizedSent = true;
      const id = typeof requestId === 'string' && requestId.length > 0 && requestId.length <= 200
        ? requestId
        : 'ext_unauthorized';
      ws.send(JSON.stringify(makeExtError(
        id,
        'ext_unauthorized',
        'Extension authorization is unavailable',
        false,
      )));
    }
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(1008, 'Extension authorization revoked');
    }
  }

  private _handleExtRequest(ws: WsWebSocket, request: ExtRequest): void {
    if (request.method === 'bridge.auth-status') {
      this._sendExtResponse(ws, {
        id: request.id,
        type: 'ext:response',
        payload: { authorized: true },
      });
      return;
    }

    if (this.activeExtRequests.has(request.id)) {
      this._sendExtResponse(ws, makeExtError(
        request.id,
        'invalid_ext_request',
        'Extension request ID is already active',
        false,
      ));
      return;
    }

    // The browser this request came from. What it starts (a delegated run)
    // belongs to that profile, so the handler is told which one it is.
    const browser = this._slotOf(ws)?.key ?? null;

    if (this.capabilities.has('agent-spawn') && this.handleExtRequest) {
      const route: ActiveExtRequest = {
        id: request.id,
        originSocket: ws,
        browser,
        target: 'local',
        settled: false,
        abortController: new AbortController(),
      };
      this.activeExtRequests.set(request.id, route);
      void this._invokeLocalExtHandler(request, route);
      return;
    }

    for (const [relayId, relaySocket] of this.relayClients) {
      if (
        relaySocket.readyState === WebSocket.OPEN
        && this.relayCapabilities.get(relayId)?.has('agent-spawn')
      ) {
        const route: ActiveExtRequest = {
          id: request.id,
          originSocket: ws,
          browser,
          target: 'relay',
          relayId,
          settled: false,
          abortController: null,
        };
        this.activeExtRequests.set(request.id, route);
        if (browser) {
          // Sent first, and as its own frame: the request itself has an exact
          // key list. A relay from before this ignores a frame it does not know.
          const extRoute: RelayExtRoute = { type: 'relay:ext-route', requestId: request.id, browser };
          relaySocket.send(JSON.stringify(extRoute));
        }
        relaySocket.send(JSON.stringify(request));
        return;
      }
    }

    this._sendExtResponse(ws, makeExtError(
      request.id,
      'agent_provider_offline',
      'No extension request handler is available',
      true,
    ));
  }

  private async _invokeLocalExtHandler(
    request: ExtRequest,
    route: ActiveExtRequest,
  ): Promise<void> {
    const handler = this.handleExtRequest;
    if (!handler) return;
    const emit = (event: ExtEvent): void => {
      const current = this.activeExtRequests.get(request.id);
      const parsedEvent = parseExtFrame(event);
      if (
        current !== route
        || route.settled
        || parsedEvent?.type !== 'ext:event'
        || parsedEvent.id !== request.id
      ) {
        console.error(`[FSB Bridge ${this.instanceId}] Dropped invalid or late local extension event`);
        return;
      }
      if (route.originSocket.readyState === WebSocket.OPEN) {
        route.originSocket.send(JSON.stringify(parsedEvent));
      }
    };

    try {
      const payload = await handler(request, emit, {
        signal: route.abortController!.signal,
        browser: route.browser,
      });
      const response = parseExtFrame({
        id: request.id,
        type: 'ext:response',
        payload,
      });
      if (response?.type !== 'ext:response' || !('payload' in response)) {
        throw new Error('invalid handler result');
      }
      this._settleExtRoute(route, response);
    } catch {
      console.error(`[FSB Bridge ${this.instanceId}] Local extension request handler failed`);
      this._settleExtRoute(route, makeExtError(
        request.id,
        'invalid_ext_request',
        'Extension request handler failed',
        false,
      ));
    }
  }

  private _settleExtRoute(route: ActiveExtRequest, response: ExtResponse): void {
    if (route.settled || this.activeExtRequests.get(route.id) !== route) return;
    route.settled = true;
    this.activeExtRequests.delete(route.id);
    this._sendExtResponse(route.originSocket, response);
  }

  private _abortRoutesForOrigin(originSocket: WsWebSocket): void {
    for (const route of [...this.activeExtRequests.values()]) {
      if (route.originSocket === originSocket) this._abortExtRoute(route);
    }
  }

  private _abortExtRoute(route: ActiveExtRequest): void {
    if (route.settled || this.activeExtRequests.get(route.id) !== route) return;
    route.settled = true;
    this.activeExtRequests.delete(route.id);
    if (route.target === 'local') {
      route.abortController?.abort(new Error('route_lost'));
      return;
    }
    if (!route.relayId) return;
    const relaySocket = this.relayClients.get(route.relayId);
    if (relaySocket?.readyState === WebSocket.OPEN) {
      relaySocket.send(JSON.stringify(makeExtError(
        route.id,
        'bridge_topology_changed',
        'Extension route closed before delegation settled',
        true,
      )));
    }
  }

  private _sendExtResponse(socket: WsWebSocket, response: ExtResponse): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(response));
  }

  private _settleRoutesForRelay(relayId: string): void {
    for (const route of [...this.activeExtRequests.values()]) {
      if (route.target !== 'relay' || route.relayId !== relayId) continue;
      this._settleExtRoute(route, makeExtError(
        route.id,
        'bridge_topology_changed',
        'Selected relay disconnected before responding',
        true,
      ));
    }
  }

  /**
   * Handle a message FROM a relay client (a request to forward to extension).
   */
  private _handleRelayClientMessage(clientId: string, raw: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.error(`[FSB Bridge ${this.instanceId}] Failed to parse relay client message`);
      return;
    }

    if (typeof parsed.type === 'string' && parsed.type.startsWith('ext:')) {
      const frame = parseExtFrame(parsed);
      if (frame?.type !== 'ext:event' && frame?.type !== 'ext:response') {
        console.error(`[FSB Bridge ${this.instanceId}] Dropped invalid relay extension frame`);
        return;
      }
      const route = this.activeExtRequests.get(frame.id);
      if (route?.target !== 'relay' || route.relayId !== clientId || route.settled) {
        console.error(`[FSB Bridge ${this.instanceId}] Dropped extension frame from unselected relay`);
        return;
      }
      if (frame.type === 'ext:event') {
        if (route.originSocket.readyState === WebSocket.OPEN) {
          route.originSocket.send(JSON.stringify(frame));
        }
        return;
      }
      this._settleExtRoute(route, frame);
      return;
    }

    const msg = parsed as unknown as MCPMessage;

    const target = this._slotForRelayFrame(clientId, parsed.browser);
    if (!target.slot) {
      // Can't forward -- send error back to relay client
      const errorResp: MCPResponse = {
        id: msg.id,
        type: 'mcp:error',
        payload: target.error,
      };
      const relayWs = this.relayClients.get(clientId);
      if (relayWs) relayWs.send(JSON.stringify(errorResp));
      return;
    }

    // Track origin so we can route the response back
    this.messageOrigin.set(msg.id, { origin: clientId, browser: target.slot.key });

    // Forward to the browser. `browser` is this hub's own routing: an
    // extension is sent the frame without it.
    if (Object.prototype.hasOwnProperty.call(parsed, 'browser')) {
      const { browser: _routing, ...frame } = parsed;
      target.slot.socket.send(JSON.stringify(frame));
    } else {
      target.slot.socket.send(raw);
    }
  }

  /**
   * Choose the browser for one relayed request.
   *
   * A frame that names a browser goes there or fails: it never falls back to
   * another one. A frame that names none comes from a client that predates the
   * roster. That relay is given the default browser on its first frame and
   * keeps it, through a worker restart too, until the browser has been gone
   * for the binding grace (a minute by default).
   */
  private _slotForRelayFrame(
    relayId: string,
    requested: unknown,
  ): { slot: ExtensionSlot; error?: undefined } | { slot: null; error: Record<string, unknown> } {
    if (typeof requested === 'string' && requested) {
      const slot = BROWSER_KEY_PATTERN.test(requested) ? this.slots.get(requested) ?? null : null;
      if (slot) return { slot };
      return {
        slot: null,
        error: {
          success: false,
          error: 'browser_not_connected',
          code: 'BROWSER_NOT_CONNECTED',
          browser: requested.slice(0, 32),
          connectedBrowsers: [...this.slots.keys()],
        },
      };
    }

    let key = this._legacyBinding(relayId);
    if (!key) {
      const fallback = this._defaultSlot();
      if (fallback) {
        key = fallback.key;
        this.legacyRelayBrowsers.set(relayId, key);
        // From here on this relay hears about its own browser.
        const relayWs = this.relayClients.get(relayId);
        if (relayWs?.readyState === WebSocket.OPEN) {
          relayWs.send(JSON.stringify(this._buildRelayState(relayId)));
        }
      }
    }
    const slot = key ? this.slots.get(key) ?? null : null;
    return slot ? { slot } : { slot: null, error: { success: false, error: 'extension_not_connected' } };
  }

  // --------------------------------------------------------------------------
  // Relay mode
  // --------------------------------------------------------------------------

  private _applyRelayState(state: RelayWelcome | RelayState): void {
    this.hubConnected = true;
    this.activeHubInstanceId = state.hubInstanceId;
    // Replaced whole on every state: a roster is never merged with an older
    // one, and a hub that sends none leaves it null.
    this.relayBrowsers = parseRoster(state.browsers);
    this.relayRefusedBrowsers = parseRefusals(state.refusedBrowsers);
    this.relayHubVersion = typeof state.hubVersion === 'string' && state.hubVersion.length <= 32
      ? state.hubVersion
      : null;
    this.relayExtensionConnected = this.relayBrowsers
      ? this.relayBrowsers.length > 0
      : state.extensionConnected === true;
    this.relayCount = Number.isFinite(state.relayCount) ? state.relayCount : 0;
    this.relayLastExtensionHeartbeatAt = typeof state.lastExtensionHeartbeatAt === 'number'
      ? state.lastExtensionHeartbeatAt
      : null;
    this.lastDisconnectReason = typeof state.lastDisconnectReason === 'string'
      ? state.lastDisconnectReason
      : null;
    this.relayExtensionAttachment = state.extensionAttachment ?? null;
    this.connected = this.relayExtensionConnected;
  }

  private _startAsRelay(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.intentionalClose = false;
      this.mode = 'relay';
      this.hubConnected = false;
      this.activeHubInstanceId = null;
      this.relayExtensionConnected = false;
      this.connected = false;

      let handshakeSettled = false;
      let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
      const settleResolve = (): void => {
        if (handshakeSettled) return;
        handshakeSettled = true;
        if (handshakeTimer) clearTimeout(handshakeTimer);
        resolve();
      };
      const settleReject = (err: Error): void => {
        if (handshakeSettled) return;
        handshakeSettled = true;
        if (handshakeTimer) clearTimeout(handshakeTimer);
        reject(err);
      };

      try {
        const relayHost = this.host === '::1' ? '[::1]' : this.host;
        this.hubConnection = new WebSocket(`ws://${relayHost}:${this.port}`);
      } catch (err) {
        settleReject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      const hubSocket = this.hubConnection;

      handshakeTimer = setTimeout(() => {
        if (!this.hubConnected && this.mode === 'relay') {
          this.hubConnection?.close();
          settleReject(new Error('Relay handshake timed out'));
        }
      }, this.relayHandshakeTimeoutMs);

      this.hubConnection.on('open', () => {
        // Send handshake
        const hello: RelayHello = this.capabilities.size > 0
          ? {
              type: 'relay:hello',
              instanceId: this.instanceId,
              capabilities: [...this.capabilities],
            }
          : { type: 'relay:hello', instanceId: this.instanceId };
        this.hubConnection!.send(JSON.stringify(hello));
        console.error(`[FSB Bridge ${this.instanceId}] Relay mode: connected to hub, sent hello`);
      });

      this.hubConnection.on('message', (data: Buffer | string) => {
        const raw = typeof data === 'string' ? data : data.toString();
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(raw);
        } catch {
          console.error(`[FSB Bridge ${this.instanceId}] Failed to parse hub message`);
          return;
        }

        // Handle welcome handshake
        if (parsed.type === 'relay:welcome') {
          this._applyRelayState(parsed as unknown as RelayWelcome);
          this.reconnectDelay = 0;
          console.error(`[FSB Bridge ${this.instanceId}] Relay mode: handshake complete, ready`);
          settleResolve();
          return;
        }

        if (parsed.type === 'relay:state') {
          this._applyRelayState(parsed as unknown as RelayState);
          return;
        }

        if (parsed.type === 'relay:ext-route') {
          this._noteRelayExtRoute(parsed);
          return;
        }

        if (typeof parsed.type === 'string' && parsed.type.startsWith('ext:')) {
          const frame = parseExtFrame(parsed);
          if (frame?.type === 'ext:request') {
            this._handleRelayedExtRequest(frame);
          } else if (
            frame?.type === 'ext:response'
            && frame.error?.code === 'bridge_topology_changed'
          ) {
            this._abortRelayedExtRequest(frame.id, hubSocket);
          } else {
            console.error(`[FSB Bridge ${this.instanceId}] Dropped invalid hub extension frame`);
          }
          return;
        }

        // Handle responses routed back from hub
        this._handleRelayResponse(parsed as unknown as MCPResponse);
      });

      this.hubConnection.on('close', () => {
        if (!handshakeSettled) {
          settleReject(new Error('Relay connection closed before handshake completed'));
        }

        for (const [id, route] of [...this.relayActiveExtRequests]) {
          if (route.hubSocket === hubSocket) this._abortRelayedExtRequest(id, hubSocket);
        }
        if (this.hubConnection === hubSocket) this.hubConnection = null;
        this.hubConnected = false;
        this.activeHubInstanceId = null;
        this.relayExtensionConnected = false;
        this.relayCount = 0;
        this.connected = false;
        // The roster described a hub that is gone. Whoever is hub next, this
        // process included, starts from none.
        this.relayBrowsers = null;
        this.relayRefusedBrowsers = [];
        this.relayHubVersion = null;
        this.lastDisconnectReason = 'hub_disconnected';
        console.error(`[FSB Bridge ${this.instanceId}] Relay mode: disconnected from hub`);

        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timeout);
          pending.reject(new Error('Lost connection to hub'));
          this.pendingRequests.delete(id);
        }
        this.progressListeners.clear();

        if (!this.intentionalClose) {
          // Try to promote to hub or reconnect as relay
          this._attemptPromotion();
        }
      });

      this.hubConnection.on('error', (err: Error) => {
        console.error(`[FSB Bridge ${this.instanceId}] Relay error:`, err.message);
        // onclose fires after onerror, promotion/reconnect handled there
      });
    });
  }

  /**
   * The hub naming the browser an ext:request it is about to forward came
   * from. Held only until that request arrives, which is the next frame.
   */
  private _noteRelayExtRoute(frame: Record<string, unknown>): void {
    const { requestId, browser } = frame;
    if (
      typeof requestId !== 'string' || requestId.length === 0 || requestId.length > 200
      || typeof browser !== 'string' || !BROWSER_KEY_PATTERN.test(browser)
    ) return;
    if (this.relayExtRoutes.size >= MAX_RELAY_EXT_ROUTES) {
      const oldest = this.relayExtRoutes.keys().next().value;
      if (oldest !== undefined) this.relayExtRoutes.delete(oldest);
    }
    this.relayExtRoutes.set(requestId, browser);
  }

  private _handleRelayedExtRequest(request: ExtRequest): void {
    // Taken whatever happens next, so a refused request leaves nothing behind.
    const browser = this.relayExtRoutes.get(request.id) ?? null;
    this.relayExtRoutes.delete(request.id);
    const hubSocket = this.hubConnection;
    if (!hubSocket || hubSocket.readyState !== WebSocket.OPEN) return;
    if (this.relayActiveExtRequests.has(request.id)) {
      hubSocket.send(JSON.stringify(makeExtError(
        request.id,
        'invalid_ext_request',
        'Extension request ID is already active',
        false,
      )));
      return;
    }
    if (!this.capabilities.has('agent-spawn') || !this.handleExtRequest) {
      hubSocket.send(JSON.stringify(makeExtError(
        request.id,
        'agent_provider_offline',
        'No extension request handler is available',
        true,
      )));
      return;
    }

    const route: ActiveRelayedExtRequest = {
      hubSocket,
      browser,
      abortController: new AbortController(),
    };
    this.relayActiveExtRequests.set(request.id, route);
    void this._invokeRelayedExtHandler(request, route);
  }

  private async _invokeRelayedExtHandler(
    request: ExtRequest,
    route: ActiveRelayedExtRequest,
  ): Promise<void> {
    const handler = this.handleExtRequest;
    if (!handler) return;
    const { hubSocket } = route;
    const isActive = (): boolean => this.relayActiveExtRequests.get(request.id) === route;
    const emit = (event: ExtEvent): void => {
      const parsedEvent = parseExtFrame(event);
      if (
        !isActive()
        || parsedEvent?.type !== 'ext:event'
        || parsedEvent.id !== request.id
      ) {
        console.error(`[FSB Bridge ${this.instanceId}] Dropped invalid or late relayed extension event`);
        return;
      }
      if (hubSocket.readyState === WebSocket.OPEN) hubSocket.send(JSON.stringify(parsedEvent));
    };

    let response: ExtResponse;
    try {
      const payload = await handler(request, emit, {
        signal: route.abortController.signal,
        browser: route.browser,
      });
      const parsedResponse = parseExtFrame({
        id: request.id,
        type: 'ext:response',
        payload,
      });
      if (parsedResponse?.type !== 'ext:response' || !('payload' in parsedResponse)) {
        throw new Error('invalid handler result');
      }
      response = parsedResponse;
    } catch {
      console.error(`[FSB Bridge ${this.instanceId}] Relayed extension request handler failed`);
      response = makeExtError(
        request.id,
        'invalid_ext_request',
        'Extension request handler failed',
        false,
      );
    }

    if (!isActive()) return;
    this.relayActiveExtRequests.delete(request.id);
    if (hubSocket.readyState === WebSocket.OPEN) hubSocket.send(JSON.stringify(response));
  }

  private _abortRelayedExtRequest(id: string, hubSocket: WebSocket): void {
    const route = this.relayActiveExtRequests.get(id);
    if (!route || route.hubSocket !== hubSocket) return;
    this.relayActiveExtRequests.delete(id);
    route.abortController.abort(new Error('route_lost'));
  }

  /**
   * Handle a response message routed from the hub back to this relay client.
   */
  private _handleRelayResponse(resp: MCPResponse): void {
    // Progress notifications
    if (resp.type === 'mcp:progress') {
      const listener = this.progressListeners.get(resp.id);
      if (listener) listener(resp);
      return;
    }

    // Final result
    const pending = this.pendingRequests.get(resp.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(resp.id);
      this.progressListeners.delete(resp.id);
      pending.resolve(resp);
    }
  }

  /**
   * After losing hub connection, try to become the new hub.
   * If the port is still taken (another relay won the race), reconnect as relay.
   */
  private async _attemptPromotion(): Promise<void> {
    // The jitter below means two overlapping callers would both wake up and
    // race to bind the same port, and the loser's failure path schedules yet
    // another attempt.
    if (this.intentionalClose || this.promotionInFlight) return;
    this.promotionInFlight = true;

    try {
      // Random jitter to avoid thundering herd
      const jitter = Math.floor(Math.random() * this.promotionJitterMs);
      console.error(`[FSB Bridge ${this.instanceId}] Attempting promotion in ${jitter}ms`);

      await new Promise(r => setTimeout(r, jitter));

      if (this.intentionalClose) return;

      try {
        await this._startAsHub();
        this.hubConnected = true;
        this.activeHubInstanceId = this.instanceId;
        this.relayExtensionConnected = false;
        this.relayCount = 0;
        console.error(`[FSB Bridge ${this.instanceId}] Promoted to hub mode`);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          console.error(`[FSB Bridge ${this.instanceId}] Promotion failed (port taken), reconnecting as relay`);
          this._scheduleRelayReconnect();
        } else {
          console.error(`[FSB Bridge ${this.instanceId}] Promotion failed:`, err);
          this._scheduleRelayReconnect();
        }
      }
    } finally {
      this.promotionInFlight = false;
    }
  }

  private _scheduleRelayReconnect(): void {
    if (this.intentionalClose) return;
    if (this.reconnectTimer) return;

    if (this.reconnectDelay === 0) {
      this.reconnectDelay = Math.min(2_000, this.maxReconnectDelayMs);
    } else {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelayMs);
    }

    console.error(`[FSB Bridge ${this.instanceId}] Relay reconnect in ${this.reconnectDelay}ms`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.intentionalClose) return;
      try {
        await this._startAsRelay();
      } catch {
        // Failed to connect as relay, maybe try promotion again
        this._attemptPromotion();
      }
    }, this.reconnectDelay);
  }
}
