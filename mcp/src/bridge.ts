import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket from 'ws';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';
import type {
  BridgeMode,
  BridgeCapability,
  BridgeOptions,
  BridgeTopologyState,
  ExtensionAttachmentState,
  ExtEvent,
  ExtRequest,
  ExtResponse,
  ExtRequestHandler,
  MCPMessage,
  MCPResponse,
  RelayHello,
  RelayState,
  RelayWelcome,
} from './types.js';
import { FSB_ERROR_MESSAGES } from './errors.js';
import { createOnePasswordExtHandler, isOnePasswordExtMethod } from './onepassword/ext-handler.js';
import {
  FSB_EXT_PROTOCOL,
  authenticateBridgeProtocols,
  bindAllowedExtensionOrigin,
  readBridgeAuthState,
} from './bridge-auth.js';
import { logBridgeEvent } from './bridge-events.js';
import { probeDaemonHealth } from './daemon-health.js';
import { makeExtError, parseExtFrame } from './ext-protocol.js';
import { NATIVE_HOST_HEALTH_TIMEOUT_MS } from './native-host/constants.js';

interface PendingRequest {
  resolve: (value: MCPResponse) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface AcceptedSocketMetadata {
  browserOrigin: string | null;
  extAuthorized: boolean;
  sessionId: string | null;
  unauthorizedSent: boolean;
}

interface ActiveExtRequest {
  id: string;
  originSocket: WsWebSocket;
  target: 'local' | 'relay';
  relayId?: string;
  settled: boolean;
  abortController: AbortController | null;
}

interface ActiveRelayedExtRequest {
  hubSocket: WebSocket;
  abortController: AbortController;
}

/**
 * Which process should own the hub port when the long-lived local service is
 * running.
 *
 * That service (`fsb-mcp-server serve`, which the browser starts through the
 * native host and which listens on 7226) outlives the MCP clients that come
 * and go, so the extension's requests are best answered there. A stdio server
 * therefore gives way to it: it joins as a relay instead of binding the hub
 * port while the service is up, and when it does hold the port it hands it
 * over once the service asks and nothing is in flight.
 */
export interface DaemonHandoffOptions {
  /**
   * Port of the service's loopback /health endpoint. Set it on a bridge that
   * should give way to the service. Left unset, the bridge competes for the
   * hub port as it always has and refuses every takeover request.
   */
  daemonHealthPort?: number | null;
  /**
   * This bridge belongs to the service itself. It takes the port without
   * promotion jitter, and once claimHub() has been called it asks any hub it
   * relays through to hand the port over.
   */
  daemon?: boolean;
  /** How long a /health check may take before the service counts as down. */
  daemonProbeTimeoutMs?: number;
  /** How often a hub that has agreed to hand over re-checks whether it is idle. */
  hubHandoffPollMs?: number;
  /** How long a hub waits for the service to bind after releasing the port. */
  hubHandoffTimeoutMs?: number;
  /**
   * How long a hub that has released the port keeps draining what it still
   * carries before it hands everyone over regardless.
   */
  hubHandoffDrainMs?: number;
  /** First wait before the service asks a hub again after a passing refusal. */
  hubClaimRetryMs?: number;
}

export type WebSocketBridgeOptions = BridgeOptions & DaemonHandoffOptions;

/**
 * Hub-side progress of a handover to the service.
 *   verifying -- the request's proof matched; checking that it really came
 *                from the process serving the service's /health.
 *   waiting   -- agreed; waiting for this hub to be idle.
 *   released  -- the listening socket is closed and the service was told to
 *                bind. Every accepted socket is still open and served here.
 *   draining  -- the service holds the port; waiting to be idle once more
 *                before closing the sockets so everyone moves across.
 */
interface HubHandoff {
  successorId: string;
  socket: WsWebSocket;
  phase: 'verifying' | 'waiting' | 'released' | 'draining';
  timer: ReturnType<typeof setTimeout> | null;
  /** Set on entering `draining`: past it the hub hands over regardless. */
  drainDeadline: number | null;
}

// Relays are not authenticated -- relay:hello carries only an instance id --
// so a takeover request proves its sender can read the bridge pairing secret
// in ~/.fsb/bridge-auth.json (owner-only, the same file the extension's
// pairing code comes from). The proof is an HMAC over the hub's and the
// relay's instance ids and a fresh nonce, keyed with that secret, so it cannot
// be replayed against another hub or on behalf of another relay. The hub also
// confirms the requester is the relay the service's own /health reports.
const HUB_HANDOFF_PROOF_CONTEXT = 'fsb-relay-yield-to-daemon-v1';
const HUB_HANDOFF_NONCE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const HUB_HANDOFF_PROOF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DEFAULT_HUB_HANDOFF_POLL_MS = 100;
const DEFAULT_HUB_HANDOFF_TIMEOUT_MS = 5_000;
// While draining, the service already holds the port but has no extension, so
// every call to it fails until the drain ends. Cut a long one short.
const DEFAULT_HUB_HANDOFF_DRAIN_MS = 30_000;
// The service asks again after a refusal that may pass, backing off to the cap.
const DEFAULT_HUB_CLAIM_RETRY_MS = 5_000;
const HUB_CLAIM_RETRY_MAX_MS = 5 * 60_000;
// Refusals worth asking again after; the others will not change.
const TRANSIENT_HUB_REFUSALS = new Set([
  'daemon_unconfirmed',
  'proof_mismatch',
  'pairing_unavailable',
  'handoff_in_progress',
  'bind_timeout',
  'bind_failed',
]);
// A relay that was told which process takes over reconnects this soon; the
// new hub is already listening by the time the old one closes its sockets.
const HUB_HANDOFF_RECONNECT_MS = 50;
// How many promotions in a row may be skipped because the service looks up
// without any hub being reachable. Past that the bridge binds the port itself,
// so a service that is up but not taking the port cannot leave nobody as hub.
const DAEMON_DEFERRAL_LIMIT = 3;
const DAEMON_DEFERRAL_RECONNECT_MS = 250;

function hubHandoffProof(
  sessionSecret: string,
  hubInstanceId: string,
  relayInstanceId: string,
  nonce: string,
): string {
  return createHmac('sha256', Buffer.from(sessionSecret, 'base64url'))
    .update(`${HUB_HANDOFF_PROOF_CONTEXT}\n${hubInstanceId}\n${relayInstanceId}\n${nonce}`)
    .digest('base64url');
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

// The onepassword.* handler is declared here, next to the code that uses it,
// and merged into BridgeOptions, so every option type built on BridgeOptions
// carries it without having to name it.
declare module './types.js' {
  interface BridgeOptions {
    /** onepassword.* handler; defaults to the shared broker, null disables it. */
    handleOnePasswordRequest?: ExtRequestHandler | null;
  }
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
  private allowedBrowserOrigins: string[];
  private capabilities: Set<BridgeCapability>;
  private handleExtRequest: ExtRequestHandler | null;
  // Answers the extension's onepassword.* requests in whichever process is hub.
  private handleOnePasswordRequest: ExtRequestHandler | null;

  // Hub mode state
  private wss: WebSocketServer | null = null;
  private httpServer: Server | null = null;
  private extensionClient: WsWebSocket | null = null;
  private relayClients = new Map<string, WsWebSocket>();
  private relayCapabilities = new Map<string, Set<BridgeCapability>>();
  private activeExtRequests = new Map<string, ActiveExtRequest>();
  private messageOrigin = new Map<string, string>(); // msgId -> instanceId | "local"
  // Relay messages still unanswered when their extension socket was replaced,
  // msgId -> relay instanceId, dropped once that socket closes.
  private relayRoutesOnReplacedSocket = new WeakMap<WsWebSocket, Map<string, string>>();
  private handshakeTimers = new Map<WsWebSocket, ReturnType<typeof setTimeout>>();
  private acceptedSocketMetadata = new WeakMap<WsWebSocket, AcceptedSocketMetadata>();
  private extensionLivenessTimer: ReturnType<typeof setInterval> | null = null;

  // Relay mode state
  private hubConnection: WebSocket | null = null;
  private relayActiveExtRequests = new Map<string, ActiveRelayedExtRequest>();
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
  private lastExtensionHeartbeatAt: number | null = null;
  private extensionHeartbeatCount = 0;
  private extensionCloseCause: string | null = null;
  private lastDisconnectReason: string | null = null;
  private extensionAttachment: ExtensionAttachmentState | null = null;

  // Handing the hub port to the long-lived local service
  private daemonHealthPort: number | null;
  private isDaemon: boolean;
  private daemonProbeTimeoutMs: number;
  private hubHandoffPollMs: number;
  private hubHandoffTimeoutMs: number;
  private hubHandoffDrainMs: number;
  private hubClaimRetryMs: number;
  private hubClaimRetryDelayMs: number;
  private hubClaimRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private hubHandoff: HubHandoff | null = null;
  private hubClaimed = false;
  private takeoverInFlight = false;
  private daemonDeferrals = 0;
  // The hub socket that announced it is handing over to another relay; when
  // it closes this relay reconnects instead of competing for the port.
  private handoffNoticeSocket: WebSocket | null = null;
  // After this process took the hub over, its old relay socket stays open
  // only to finish what was already sent through it.
  private retiredHubConnection: WebSocket | null = null;
  private retiredHubSockets = new WeakSet<WebSocket>();
  private retiredRequestIds = new Set<string>();

  constructor(options: WebSocketBridgeOptions = {}) {
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
    this.allowedBrowserOrigins = options.allowedBrowserOrigins ?? ['chrome-extension://'];
    this.handleExtRequest = typeof options.handleExtRequest === 'function'
      ? options.handleExtRequest
      : null;
    this.handleOnePasswordRequest = options.handleOnePasswordRequest === null
      ? null
      : (typeof options.handleOnePasswordRequest === 'function'
          ? options.handleOnePasswordRequest
          : createOnePasswordExtHandler());
    this.capabilities = new Set(
      this.handleExtRequest && options.capabilities?.includes('agent-spawn')
        ? ['agent-spawn']
        : [],
    );
    if (options.capabilities?.includes('agent-spawn') && !this.handleExtRequest) {
      console.error(`[FSB Bridge ${this.instanceId}] Ignoring agent-spawn capability without a handler`);
    }
    this.isDaemon = options.daemon === true;
    this.daemonHealthPort = !this.isDaemon
      && Number.isInteger(options.daemonHealthPort)
      && (options.daemonHealthPort as number) > 0
      && (options.daemonHealthPort as number) <= 65_535
      ? options.daemonHealthPort as number
      : null;
    this.daemonProbeTimeoutMs = options.daemonProbeTimeoutMs ?? NATIVE_HOST_HEALTH_TIMEOUT_MS;
    this.hubHandoffPollMs = options.hubHandoffPollMs ?? DEFAULT_HUB_HANDOFF_POLL_MS;
    this.hubHandoffTimeoutMs = options.hubHandoffTimeoutMs ?? DEFAULT_HUB_HANDOFF_TIMEOUT_MS;
    this.hubHandoffDrainMs = options.hubHandoffDrainMs ?? DEFAULT_HUB_HANDOFF_DRAIN_MS;
    this.hubClaimRetryMs = options.hubClaimRetryMs ?? DEFAULT_HUB_CLAIM_RETRY_MS;
    this.hubClaimRetryDelayMs = this.hubClaimRetryMs;
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
   *
   * A bridge that gives way to the local service first checks whether that
   * service is up and ready; if it is, the service either holds the hub port
   * or is about to take it, so this bridge joins as a relay without binding.
   */
  async connect(): Promise<void> {
    if (await this._daemonIsReady()) {
      console.error(`[FSB Bridge ${this.instanceId}] Local FSB service is running; joining its hub as a relay`);
      try {
        await this._startAsRelay({ promoteIfUnreachable: false });
        return;
      } catch {
        // The service answered but no hub took the connection. Drop the
        // failed socket and compete for the port the ordinary way.
        const stale = this.hubConnection;
        this.hubConnection = null;
        try {
          stale?.terminate();
        } catch {
          // Already closed.
        }
        console.error(`[FSB Bridge ${this.instanceId}] No hub answered as a relay; competing for port ${this.port}`);
      }
    }
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
    if (this.retiredHubConnection) {
      this.retiredHubConnection.close();
      this.retiredHubConnection = null;
    }
    this.retiredRequestIds.clear();
    this.handoffNoticeSocket = null;
    this._cancelHubClaimRetry();

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
    this.lastExtensionHeartbeatAt = null;
    this.extensionAttachment = null;
    this.extensionHeartbeatCount = 0;
    this.extensionCloseCause = null;
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

    const id = this.generateId();
    const fullMsg: MCPMessage = { id, ...msg };
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
      });

      if (options?.onProgress) {
        this.progressListeners.set(id, options.onProgress);
      }

      if (this.mode === 'hub') {
        // Send directly to extension
        this.messageOrigin.set(id, 'local');
        this.extensionClient!.send(JSON.stringify(fullMsg));
      } else if (this.mode === 'relay') {
        // Send to hub for forwarding
        this.hubConnection!.send(JSON.stringify(fullMsg));
      }
    });
  }

  /** Whether this bridge can reach the extension (directly or via relay). */
  get isConnected(): boolean {
    return this.topology.extensionConnected;
  }

  /** Current operating mode. */
  get currentMode(): BridgeMode {
    return this.mode;
  }

  /**
   * True when this bridge carries no work in either direction: no extension
   * request is being handled here or routed to a relay, no relay's message is
   * still waiting for the extension's answer, and no local sendAndWait call is
   * pending. A process that wants to exit without cutting a call short waits
   * for this.
   */
  isIdle(): boolean {
    return this.activeExtRequests.size === 0
      && this.relayActiveExtRequests.size === 0
      && this.messageOrigin.size === 0
      && this.pendingRequests.size === 0;
  }

  /**
   * Called by the long-lived local service once it is ready to answer the
   * extension. From then on, whenever this bridge is attached to a hub as a
   * relay, it asks that hub to hand the port over. A hub that predates the
   * request, or that is not set up to give way, simply keeps the port.
   */
  claimHub(): void {
    if (!this.isDaemon) return;
    this.hubClaimed = true;
    if (this.mode === 'relay' && this.hubConnected && this.hubConnection) {
      this._requestHubHandoff(this.hubConnection);
    }
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
    };
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
    this._clearHubHandoff();
    for (const [id, ws] of this.relayClients) {
      ws.close();
      this.relayClients.delete(id);
      this.relayCapabilities.delete(id);
    }
    this._stopExtensionLiveness();
    // Cleared before close() so the socket's own close handler sees a stale
    // client and leaves the bridge state to the caller.
    const extensionClient = this.extensionClient;
    this.extensionClient = null;
    extensionClient?.close();
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
    this.lastExtensionHeartbeatAt = null;
    this.extensionAttachment = null;
    this.extensionHeartbeatCount = 0;
    this.extensionCloseCause = null;
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
        parsed.protocol !== 'chrome-extension:'
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
      const canonical = `chrome-extension://${parsed.host}`;
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
      if (this.extensionClient && !this._isCurrentExtAuthority(ws)) {
        // Coalesced: an extension that keeps retrying lands here once per
        // attempt, which is how a single lockout produced tens of thousands of
        // identical lines in the field.
        if (logBridgeEvent({
          event: 'extension_slot_refused',
          instanceId: this.instanceId,
          origin: metadata.browserOrigin,
        })) {
          console.error(`[FSB Bridge ${this.instanceId}] Unprivileged extension candidate cannot replace active extension`);
        }
        ws.close(1008, 'Extension authorization required');
        return;
      }
      this._registerExtensionClient(ws);
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

  private _registerExtensionClient(ws: WsWebSocket): void {
    this._stopExtensionLiveness();

    if (this.extensionClient) {
      console.error(`[FSB Bridge ${this.instanceId}] New extension connected, closing previous`);
      this.lastDisconnectReason = 'extension_replaced';
      this.extensionCloseCause = 'extension_replaced';
      logBridgeEvent({
        event: 'extension_replaced',
        instanceId: this.instanceId,
        origin: this.acceptedSocketMetadata.get(this.extensionClient)?.browserOrigin ?? null,
      });
      this._abortRoutesForOrigin(this.extensionClient);
      // Every relay message waiting here went to the socket being replaced,
      // since relay messages only ever go to the current one. They stay routed
      // while it closes, so a late answer still reaches its relay.
      const relayRoutes = new Map<string, string>();
      for (const [msgId, origin] of this.messageOrigin) {
        if (origin !== 'local') relayRoutes.set(msgId, origin);
      }
      if (relayRoutes.size > 0) this.relayRoutesOnReplacedSocket.set(this.extensionClient, relayRoutes);
      this.extensionClient.close();
    }

    this.extensionClient = ws;
    this.connected = true;
    this.lastExtensionHeartbeatAt = Date.now();
    this.extensionHeartbeatCount = 0;
    this.lastDisconnectReason = null;
    this.extensionAttachment = null;
    this.extensionCloseCause = null;
    console.error(`[FSB Bridge ${this.instanceId}] Extension connected`);
    this._broadcastRelayState();
    this._startExtensionLiveness(ws);

    // Replace the temporary message handler with the real one
    ws.removeAllListeners('message');
    ws.on('message', (data: Buffer | string) => {
      this._handleExtensionMessage(ws, typeof data === 'string' ? data : data.toString());
    });

    ws.on('close', (code: number) => {
      if (this.extensionClient !== ws) {
        this._dropRelayRoutesOnReplacedSocket(ws);
        return;
      }
      this._stopExtensionLiveness();

      // The rejection message below stays literal so the sw_evicted recovery
      // keeps arming -- that recovery (reconnect, then fetch the persisted
      // snapshot) is right for an authorization close too, because the task
      // really was interrupted. The specific cause rides on a property of the
      // Error instead, so callers can report what actually happened without
      // any recovery branch changing.
      const cause = this.extensionCloseCause
        ?? (code === 1008 ? 'extension_policy_closed' : 'extension_disconnected');
      this.extensionCloseCause = null;

      console.error(`[FSB Bridge ${this.instanceId}] Extension disconnected (${cause}, code=${code})`);
      logBridgeEvent({
        event: 'extension_closed',
        instanceId: this.instanceId,
        origin: this.acceptedSocketMetadata.get(ws)?.browserOrigin ?? null,
        closeCode: code,
        reason: cause,
      });
      this.extensionClient = null;
      this.connected = false;
      this.lastDisconnectReason = cause;
      this.lastExtensionHeartbeatAt = null;
      this.extensionAttachment = null;
      this.extensionHeartbeatCount = 0;

      // Reject all pending local requests
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        const error = new Error('Extension disconnected') as BridgeDisconnectError;
        error.bridgeDisconnectReason = cause;
        pending.reject(error);
        this.pendingRequests.delete(id);
      }
      this.progressListeners.clear();

      this._abortRoutesForOrigin(ws);

      // Nothing sent to the extension can be answered any more: relays find
      // out when their calls time out, and every local call was rejected
      // above. A local entry left here would keep isIdle() false for good,
      // blocking step-down, uninstall and hub handover.
      this.messageOrigin.clear();
      this._broadcastRelayState();
    });

    ws.on('error', (err: Error) => {
      console.error(`[FSB Bridge ${this.instanceId}] Extension error:`, err.message);
    });
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
  private _startExtensionLiveness(ws: WsWebSocket): void {
    let awaitingPong = false;
    let sawAppHeartbeat = false;

    ws.on('pong', () => {
      awaitingPong = false;
    });

    const timer = setInterval(() => {
      if (this.extensionClient !== ws) {
        this._stopExtensionLiveness();
        return;
      }
      if (ws.readyState !== WebSocket.OPEN) {
        this._reapExtensionClient(ws, 'transport_closed');
        return;
      }

      const heartbeatAt = this.lastExtensionHeartbeatAt;
      // Counted rather than inferred from timestamps: registration and a fast
      // first ping can land in the same millisecond, and a comparison would
      // then never arm this tier at all.
      if (this.extensionHeartbeatCount > 0) sawAppHeartbeat = true;

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
    this.extensionLivenessTimer = timer;
  }

  private _stopExtensionLiveness(): void {
    if (!this.extensionLivenessTimer) return;
    clearInterval(this.extensionLivenessTimer);
    this.extensionLivenessTimer = null;
  }

  /**
   * terminate() rather than close(): a peer that has stopped answering will not
   * complete a closing handshake either. terminate() still fires the socket's
   * own 'close' handler, which is the one place that frees the slot.
   */
  private _reapExtensionClient(ws: WsWebSocket, reason: string): void {
    this._stopExtensionLiveness();
    if (this.extensionClient !== ws) return;
    console.error(`[FSB Bridge ${this.instanceId}] Extension liveness lost (${reason}), terminating socket`);
    logBridgeEvent({
      event: 'extension_reaped',
      instanceId: this.instanceId,
      origin: this.acceptedSocketMetadata.get(ws)?.browserOrigin ?? null,
      reason,
    });
    this.extensionCloseCause = `extension_reaped_${reason}`;
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
      type: 'relay:welcome',
      instanceId: clientId,
      hubInstanceId: this.instanceId,
      extensionConnected: this.connected,
      relayCount: this.relayClients.size,
      lastExtensionHeartbeatAt: this.lastExtensionHeartbeatAt,
      lastDisconnectReason: this.lastDisconnectReason,
      extensionAttachment: this.extensionAttachment,
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
        this._settleRoutesForRelay(clientId);
      }
      if (this.hubHandoff?.socket === ws) this._onHandoffSuccessorClosed(this.hubHandoff);

      // Clean up messageOrigin entries for this client
      for (const [msgId, origin] of this.messageOrigin) {
        if (origin === clientId) {
          this.messageOrigin.delete(msgId);
        }
      }
      this._broadcastRelayState();
    });

    ws.on('error', (err: Error) => {
      console.error(`[FSB Bridge ${this.instanceId}] Relay client ${clientId} error:`, err.message);
    });
  }

  private _buildRelayState(): RelayState {
    return {
      type: 'relay:state',
      hubInstanceId: this.instanceId,
      extensionConnected: this.connected,
      relayCount: this.relayClients.size,
      lastExtensionHeartbeatAt: this.lastExtensionHeartbeatAt,
      lastDisconnectReason: this.lastDisconnectReason,
      extensionAttachment: this.extensionAttachment,
    };
  }

  private _broadcastRelayState(): void {
    const raw = JSON.stringify(this._buildRelayState());
    for (const [, ws] of this.relayClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(raw);
      }
    }
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
        const current = this.extensionClient === ws;
        if (current) {
          this.lastExtensionHeartbeatAt = heartbeatAt;
          this.extensionHeartbeatCount += 1;
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(heartbeat.nonce === undefined
            ? { type: 'mcp:pong', ts: heartbeatAt }
            : { type: 'mcp:pong', ts: heartbeatAt, nonce: heartbeat.nonce }));
        }
        if (current) this._broadcastRelayState();
        return;
      }
      if (parsed.type === 'mcp:extension-state' && this.extensionClient === ws) {
        const { extensionId, extensionVersion, installInstanceId, normalWindowCount, connectedAt } = parsed;
        if (typeof extensionId === 'string' && /^[a-p]{32}$/.test(extensionId)
          && typeof extensionVersion === 'string' && extensionVersion.length <= 64
          && typeof installInstanceId === 'string' && installInstanceId.length <= 128
          && Number.isInteger(normalWindowCount) && (normalWindowCount as number) >= 0
          && (normalWindowCount as number) <= 1000
          && (connectedAt === null || (typeof connectedAt === 'string' && connectedAt.length <= 64))) {
          this.extensionAttachment = { extensionId, extensionVersion, installInstanceId,
            normalWindowCount: normalWindowCount as number, connectedAt: connectedAt as string | null };
          this._broadcastRelayState();
        }
        return;
      }
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

    const origin = this.messageOrigin.get(resp.id);

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
      // Handle locally (same as original logic). A late answer to a call that
      // already gave up still clears its routing entry.
      this.messageOrigin.delete(resp.id);
      const pending = this.pendingRequests.get(resp.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(resp.id);
        this.progressListeners.delete(resp.id);
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
    if (this.extensionClient === ws) this.extensionCloseCause = 'extension_auth_revoked';
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

    // 1Password requests never leave the hub: the secret values in their
    // responses go back on the extension socket only, never to a relay.
    if (isOnePasswordExtMethod(request.method)) {
      const handler = this.handleOnePasswordRequest;
      if (!handler) {
        this._sendExtResponse(ws, makeExtError(
          request.id,
          'invalid_ext_request',
          '1Password is not available in this FSB server',
          false,
        ));
        return;
      }
      const route: ActiveExtRequest = {
        id: request.id,
        originSocket: ws,
        target: 'local',
        settled: false,
        abortController: new AbortController(),
      };
      this.activeExtRequests.set(request.id, route);
      void this._invokeLocalExtHandler(request, route, handler);
      return;
    }

    if (this.capabilities.has('agent-spawn') && this.handleExtRequest) {
      const route: ActiveExtRequest = {
        id: request.id,
        originSocket: ws,
        target: 'local',
        settled: false,
        abortController: new AbortController(),
      };
      this.activeExtRequests.set(request.id, route);
      void this._invokeLocalExtHandler(request, route);
      return;
    }

    // While draining, the service holds the port but has no extension yet,
    // so a delegated run started now could not reach the browser, and its
    // open route would hold the drain. The extension retries once it has
    // moved to the service.
    if (this.hubHandoff?.phase === 'draining') {
      this._sendExtResponse(ws, makeExtError(
        request.id,
        'agent_provider_offline',
        'The local agent service is taking over the connection; retry shortly',
        true,
      ));
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
          target: 'relay',
          relayId,
          settled: false,
          abortController: null,
        };
        this.activeExtRequests.set(request.id, route);
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
    handlerOverride?: ExtRequestHandler,
  ): Promise<void> {
    const handler = handlerOverride ?? this.handleExtRequest;
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

  /**
   * A replaced extension socket has closed, so nothing it was sent can be
   * answered any more. Relays find out when their calls time out; an entry
   * left here would keep isIdle() false for good, blocking step-down,
   * uninstall and hub handover.
   */
  private _dropRelayRoutesOnReplacedSocket(ws: WsWebSocket): void {
    const relayRoutes = this.relayRoutesOnReplacedSocket.get(ws);
    if (!relayRoutes) return;
    this.relayRoutesOnReplacedSocket.delete(ws);
    for (const [msgId, relayId] of relayRoutes) {
      if (this.messageOrigin.get(msgId) === relayId) this.messageOrigin.delete(msgId);
    }
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

    // Relay control frames are for the hub alone and are never passed on to
    // the extension, including ones this version does not know.
    if (typeof parsed.type === 'string' && parsed.type.startsWith('relay:')) {
      this._handleRelayControlFrame(clientId, parsed);
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

    if (!this.extensionClient) {
      // Can't forward -- send error back to relay client
      const errorResp: MCPResponse = {
        id: msg.id,
        type: 'mcp:error',
        payload: { success: false, error: 'extension_not_connected' },
      };
      const relayWs = this.relayClients.get(clientId);
      if (relayWs) relayWs.send(JSON.stringify(errorResp));
      return;
    }

    // Track origin so we can route the response back
    this.messageOrigin.set(msg.id, clientId);

    // Forward to extension
    this.extensionClient.send(raw);
  }

  // --------------------------------------------------------------------------
  // Relay mode
  // --------------------------------------------------------------------------

  private _applyRelayState(state: RelayWelcome | RelayState): void {
    this.hubConnected = true;
    this.activeHubInstanceId = state.hubInstanceId;
    this.relayExtensionConnected = state.extensionConnected === true;
    this.relayCount = Number.isFinite(state.relayCount) ? state.relayCount : 0;
    this.lastExtensionHeartbeatAt = typeof state.lastExtensionHeartbeatAt === 'number'
      ? state.lastExtensionHeartbeatAt
      : null;
    this.lastDisconnectReason = typeof state.lastDisconnectReason === 'string'
      ? state.lastDisconnectReason
      : null;
    this.extensionAttachment = state.extensionAttachment ?? null;
    this.connected = this.relayExtensionConnected;
  }

  /**
   * Connect to the hub as a relay. With promoteIfUnreachable false, a
   * connection that never completes its handshake leaves the next step to the
   * caller instead of competing for the port from its close handler.
   */
  private _startAsRelay(
    { promoteIfUnreachable = true }: { promoteIfUnreachable?: boolean } = {},
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.intentionalClose = false;
      this.mode = 'relay';
      this.hubConnected = false;
      this.activeHubInstanceId = null;
      this.relayExtensionConnected = false;
      this.connected = false;

      let welcomed = false;
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

        // Once this process has taken the hub over, the old hub only finishes
        // what was already sent through it; its view of the topology is stale.
        if (this.retiredHubSockets.has(hubSocket)) {
          this._handleRetiredHubMessage(hubSocket, parsed);
          return;
        }

        // Handle welcome handshake
        if (parsed.type === 'relay:welcome') {
          this._applyRelayState(parsed as unknown as RelayWelcome);
          this.reconnectDelay = 0;
          this.daemonDeferrals = 0;
          welcomed = true;
          console.error(`[FSB Bridge ${this.instanceId}] Relay mode: handshake complete, ready`);
          settleResolve();
          if (this.hubClaimed) {
            // A new hub: forget any retry meant for the previous one.
            this._cancelHubClaimRetry();
            this.hubClaimRetryDelayMs = this.hubClaimRetryMs;
            this._requestHubHandoff(hubSocket);
          }
          return;
        }

        if (parsed.type === 'relay:state') {
          this._applyRelayState(parsed as unknown as RelayState);
          return;
        }

        if (typeof parsed.type === 'string' && parsed.type.startsWith('relay:')) {
          this._handleHubControlFrame(hubSocket, parsed);
          return;
        }

        if (typeof parsed.type === 'string' && parsed.type.startsWith('ext:')) {
          const frame = parseExtFrame(parsed);
          if (frame?.type === 'ext:request') {
            this._handleRelayedExtRequest(frame, hubSocket);
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
        if (this.retiredHubSockets.has(hubSocket)) {
          if (this.retiredHubConnection === hubSocket) this._forgetRetiredHubConnection();
          return;
        }
        const handedOff = this.handoffNoticeSocket === hubSocket;
        if (handedOff) this.handoffNoticeSocket = null;
        if (this.hubConnection === hubSocket) this.hubConnection = null;
        // A socket left behind once this process became hub, or once it opened
        // a newer connection, says nothing about the current topology.
        if (this.mode === 'hub' || this.hubConnection !== null) return;
        this.hubConnected = false;
        this.activeHubInstanceId = null;
        this.relayExtensionConnected = false;
        this.relayCount = 0;
        this.connected = false;
        this.lastDisconnectReason = 'hub_disconnected';
        console.error(`[FSB Bridge ${this.instanceId}] Relay mode: disconnected from hub`);

        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timeout);
          pending.reject(new Error('Lost connection to hub'));
          this.pendingRequests.delete(id);
        }
        this.progressListeners.clear();

        if (this.intentionalClose) return;
        if (handedOff) {
          // The hub said which process takes over, and that process was
          // already listening before this socket closed, so join it rather
          // than race for the port.
          this._scheduleRelayReconnect(HUB_HANDOFF_RECONNECT_MS);
        } else if (welcomed || promoteIfUnreachable) {
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

  private _handleRelayedExtRequest(request: ExtRequest, hubSocket: WebSocket): void {
    if (hubSocket.readyState !== WebSocket.OPEN) return;
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
    // another attempt. A takeover already binding the port counts as one.
    if (this.intentionalClose || this.promotionInFlight || this.takeoverInFlight) return;
    this.promotionInFlight = true;

    try {
      // Random jitter to avoid thundering herd. The local service skips it:
      // it should be the one that ends up holding the port.
      const jitter = this.isDaemon ? 0 : Math.floor(Math.random() * this.promotionJitterMs);
      console.error(`[FSB Bridge ${this.instanceId}] Attempting promotion in ${jitter}ms`);

      await new Promise(r => setTimeout(r, jitter));

      if (this.intentionalClose) return;

      if (await this._shouldLeavePortToDaemon()) {
        console.error(`[FSB Bridge ${this.instanceId}] Local FSB service is running; leaving port ${this.port} to it`);
        this._scheduleRelayReconnect(DAEMON_DEFERRAL_RECONNECT_MS);
        return;
      }
      if (this.intentionalClose) return;

      try {
        await this._startAsHub();
        this.hubConnected = true;
        this.activeHubInstanceId = this.instanceId;
        this.relayExtensionConnected = false;
        this.relayCount = 0;
        this.daemonDeferrals = 0;
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

  /**
   * Reconnect as a relay after a delay. Without an explicit delay the wait
   * backs off from 2s; an explicit one is used as given and leaves that
   * backoff alone.
   */
  private _scheduleRelayReconnect(delayMs?: number): void {
    if (this.intentionalClose) return;
    if (this.reconnectTimer) return;

    let delay: number;
    if (delayMs !== undefined) {
      delay = delayMs;
    } else {
      if (this.reconnectDelay === 0) {
        this.reconnectDelay = Math.min(2_000, this.maxReconnectDelayMs);
      } else {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelayMs);
      }
      delay = this.reconnectDelay;
    }

    console.error(`[FSB Bridge ${this.instanceId}] Relay reconnect in ${delay}ms`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.intentionalClose) return;
      try {
        await this._startAsRelay();
      } catch {
        // Failed to connect as relay, maybe try promotion again
        this._attemptPromotion();
      }
    }, delay);
  }

  // --------------------------------------------------------------------------
  // Handing the hub port to the long-lived local service
  // --------------------------------------------------------------------------

  /** True when this bridge gives way to the local service and it reports ready. */
  private async _daemonIsReady(): Promise<boolean> {
    if (this.isDaemon || this.daemonHealthPort === null) return false;
    const health = await probeDaemonHealth(this.daemonHealthPort, this.daemonProbeTimeoutMs);
    return health?.serveReady === true;
  }

  /**
   * Whether a promotion should leave the port to the local service, which
   * binds without jitter. Bounded by DAEMON_DEFERRAL_LIMIT so that a service
   * which is up but never takes the port cannot leave the bridge without a hub.
   */
  private async _shouldLeavePortToDaemon(): Promise<boolean> {
    if (this.daemonDeferrals >= DAEMON_DEFERRAL_LIMIT) return false;
    if (!(await this._daemonIsReady())) return false;
    this.daemonDeferrals += 1;
    return true;
  }

  /**
   * Relay side: ask the hub for the port. The frame deliberately has no id. A
   * hub from before this request passes frames it does not know on to the
   * extension, which drops anything without an id, or answers with an id-less
   * error when no extension is attached, which a relay ignores. Either way an
   * old hub keeps the port and nothing else changes.
   */
  private _requestHubHandoff(hubSocket: WebSocket): void {
    if (!this.isDaemon || hubSocket.readyState !== WebSocket.OPEN) return;
    const hubInstanceId = this.activeHubInstanceId;
    if (!hubInstanceId) return;
    const state = readBridgeAuthState();
    if (!state) {
      console.error(`[FSB Bridge ${this.instanceId}] No bridge pairing secret; staying a relay of hub ${hubInstanceId}`);
      return;
    }
    const nonce = randomBytes(16).toString('base64url');
    hubSocket.send(JSON.stringify({
      type: 'relay:yield-to-daemon',
      nonce,
      proof: hubHandoffProof(state.sessionSecret, hubInstanceId, this.instanceId, nonce),
    }));
    console.error(`[FSB Bridge ${this.instanceId}] Asked hub ${hubInstanceId} to hand the port over`);
  }

  /**
   * Relay side, local service only: ask the same hub again later after a
   * refusal that may pass, such as a /health check that timed out while this
   * process was busy starting, backing off up to a few minutes. Without it a
   * long-lived stdio hub would keep the port for its whole life.
   */
  private _scheduleHubClaimRetry(hubSocket: WebSocket): void {
    if (!this.isDaemon || !this.hubClaimed || this.hubClaimRetryTimer) return;
    const delay = this.hubClaimRetryDelayMs;
    this.hubClaimRetryDelayMs = Math.min(HUB_CLAIM_RETRY_MAX_MS, delay * 2);
    const timer = setTimeout(() => {
      this.hubClaimRetryTimer = null;
      if (
        this.hubConnection === hubSocket
        && this.mode === 'relay'
        && this.hubClaimed
        && !this.retiredHubSockets.has(hubSocket)
      ) {
        this._requestHubHandoff(hubSocket);
      }
    }, delay);
    timer.unref?.();
    this.hubClaimRetryTimer = timer;
  }

  private _cancelHubClaimRetry(): void {
    if (this.hubClaimRetryTimer) clearTimeout(this.hubClaimRetryTimer);
    this.hubClaimRetryTimer = null;
  }

  /** Relay side: control frames from the hub. Unknown ones are ignored. */
  private _handleHubControlFrame(hubSocket: WebSocket, frame: Record<string, unknown>): void {
    if (this.hubConnection !== hubSocket) return;
    switch (frame.type) {
      case 'relay:yield-accepted':
        console.error(`[FSB Bridge ${this.instanceId}] Hub agreed to hand the port over once idle`);
        return;
      case 'relay:yield-refused': {
        const reason = typeof frame.reason === 'string' && /^[a-z_]{1,64}$/.test(frame.reason)
          ? frame.reason
          : 'unspecified';
        console.error(`[FSB Bridge ${this.instanceId}] Hub kept the port (${reason})`);
        if (TRANSIENT_HUB_REFUSALS.has(reason)) this._scheduleHubClaimRetry(hubSocket);
        return;
      }
      case 'relay:hub-released':
        if (this.isDaemon && this.hubClaimed) void this._takeOverHub(hubSocket);
        return;
      case 'relay:handoff':
        if (frame.successorInstanceId !== this.instanceId) this.handoffNoticeSocket = hubSocket;
        return;
      default:
        return;
    }
  }

  /**
   * Relay side, local service only: the hub has closed its listening socket
   * for this process. Bind the port, then tell the old hub, which keeps the
   * extension and the other relays until it is idle and then sends them here.
   * The old socket stays open meanwhile so that anything already sent through
   * it -- in either direction -- still completes.
   */
  private async _takeOverHub(hubSocket: WebSocket): Promise<void> {
    if (this.takeoverInFlight || this.mode !== 'relay' || this.hubConnection !== hubSocket) return;
    this.takeoverInFlight = true;
    let bound = false;
    try {
      await this._startAsHub();
      bound = true;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code ?? 'unknown';
      console.error(`[FSB Bridge ${this.instanceId}] Could not take the hub port over (${code})`);
    } finally {
      this.takeoverInFlight = false;
    }

    if (!bound) {
      if (hubSocket.readyState === WebSocket.OPEN && this.hubConnection === hubSocket) {
        // _startAsHub clears this on a failed bind; the old hub is still here.
        this.hubConnected = true;
        hubSocket.send(JSON.stringify({ type: 'relay:hub-bind-failed' }));
        this._scheduleHubClaimRetry(hubSocket);
      } else if (this.hubConnection === null && this.mode === 'relay') {
        // The old hub went away while the bind was failing.
        void this._attemptPromotion();
      }
      return;
    }

    if (this.intentionalClose) {
      this._closeHubServers();
      this.mode = 'disconnected';
      return;
    }

    this.retiredHubSockets.add(hubSocket);
    this.retiredHubConnection = hubSocket;
    this.retiredRequestIds = new Set(this.pendingRequests.keys());
    if (this.hubConnection === hubSocket) this.hubConnection = null;
    // No extension is attached to this hub yet; it moves here once the old
    // hub closes its socket.
    this.connected = false;
    this.lastExtensionHeartbeatAt = null;
    this.extensionAttachment = null;
    this.extensionHeartbeatCount = 0;
    this.reconnectDelay = 0;
    this.daemonDeferrals = 0;
    this._cancelHubClaimRetry();
    this.hubClaimRetryDelayMs = this.hubClaimRetryMs;
    logBridgeEvent({ event: 'hub_taken_over', instanceId: this.instanceId });
    console.error(`[FSB Bridge ${this.instanceId}] Took the hub port over`);
    if (hubSocket.readyState === WebSocket.OPEN) {
      hubSocket.send(JSON.stringify({ type: 'relay:hub-bound', hubInstanceId: this.instanceId }));
    } else {
      this._forgetRetiredHubConnection();
    }
  }

  /** Relay side: a frame on the old hub's socket after this process took over. */
  private _handleRetiredHubMessage(hubSocket: WebSocket, parsed: Record<string, unknown>): void {
    if (typeof parsed.type === 'string' && parsed.type.startsWith('ext:')) {
      const frame = parseExtFrame(parsed);
      if (frame?.type === 'ext:request') {
        this._handleRelayedExtRequest(frame, hubSocket);
      } else if (frame?.type === 'ext:response' && frame.error?.code === 'bridge_topology_changed') {
        this._abortRelayedExtRequest(frame.id, hubSocket);
      }
      return;
    }
    if (typeof parsed.type === 'string' && parsed.type.startsWith('relay:')) return;
    const response = parsed as unknown as MCPResponse;
    if (typeof response.id !== 'string' || !this.retiredRequestIds.has(response.id)) return;
    if (response.type !== 'mcp:progress') this.retiredRequestIds.delete(response.id);
    this._handleRelayResponse(response);
  }

  /** The old hub's socket is gone; whatever was still waiting on it has failed. */
  private _forgetRetiredHubConnection(): void {
    this.retiredHubConnection = null;
    for (const id of this.retiredRequestIds) {
      const pending = this.pendingRequests.get(id);
      if (!pending) continue;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
      this.progressListeners.delete(id);
      pending.reject(new Error('Lost connection to hub'));
    }
    this.retiredRequestIds.clear();
  }

  /** Hub side: control frames from a relay. */
  private _handleRelayControlFrame(clientId: string, frame: Record<string, unknown>): void {
    const ws = this.relayClients.get(clientId);
    if (!ws) return;
    const handoff = this.hubHandoff;
    switch (frame.type) {
      case 'relay:yield-to-daemon':
        this._handleHubYieldRequest(clientId, ws, frame);
        return;
      case 'relay:hub-bound':
        if (handoff?.socket === ws && handoff.phase === 'released') {
          if (handoff.timer) clearTimeout(handoff.timer);
          handoff.timer = null;
          handoff.phase = 'draining';
          handoff.drainDeadline = Date.now() + this.hubHandoffDrainMs;
          this._advanceHubHandoff(handoff);
        }
        return;
      case 'relay:hub-bind-failed':
        if (handoff?.socket === ws && handoff.phase === 'released') {
          this._abortHubHandoff(handoff, 'bind_failed');
        }
        return;
      default:
        console.error(`[FSB Bridge ${this.instanceId}] Dropped unknown relay control frame from ${clientId}`);
    }
  }

  /**
   * Hub side: the local service asks for the port. It is handed over only
   * when this hub was set up to give way, the proof matches the bridge pairing
   * secret, and the service's own /health names the asking relay as its
   * bridge, attached to this hub.
   */
  private _handleHubYieldRequest(
    clientId: string,
    ws: WsWebSocket,
    frame: Record<string, unknown>,
  ): void {
    const refuse = (reason: string): void => {
      logBridgeEvent({ event: 'hub_yield_refused', instanceId: this.instanceId, reason });
      console.error(`[FSB Bridge ${this.instanceId}] Keeping the hub port; request from ${clientId} refused (${reason})`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'relay:yield-refused', reason }));
      }
    };

    if (this.mode !== 'hub' || this.isDaemon || this.daemonHealthPort === null) {
      refuse('not_offered');
      return;
    }
    if (this.hubHandoff) {
      if (this.hubHandoff.socket !== ws) refuse('handoff_in_progress');
      return;
    }
    const keys = Object.keys(frame).sort();
    const { nonce, proof } = frame;
    if (
      keys.length !== 3
      || keys[0] !== 'nonce'
      || keys[1] !== 'proof'
      || keys[2] !== 'type'
      || typeof nonce !== 'string'
      || !HUB_HANDOFF_NONCE_PATTERN.test(nonce)
      || typeof proof !== 'string'
      || !HUB_HANDOFF_PROOF_PATTERN.test(proof)
    ) {
      refuse('invalid_request');
      return;
    }
    const state = readBridgeAuthState();
    if (!state) {
      refuse('pairing_unavailable');
      return;
    }
    const expected = Buffer.from(hubHandoffProof(state.sessionSecret, this.instanceId, clientId, nonce), 'utf8');
    const candidate = Buffer.from(proof, 'utf8');
    if (expected.length !== candidate.length || !timingSafeEqual(expected, candidate)) {
      refuse('proof_mismatch');
      return;
    }

    const handoff: HubHandoff = {
      successorId: clientId,
      socket: ws,
      phase: 'verifying',
      timer: null,
      drainDeadline: null,
    };
    this.hubHandoff = handoff;
    void this._confirmDaemonRelay(clientId).then((confirmed) => {
      if (this.hubHandoff !== handoff) return;
      if (!confirmed) {
        this.hubHandoff = null;
        refuse('daemon_unconfirmed');
        return;
      }
      handoff.phase = 'waiting';
      logBridgeEvent({ event: 'hub_yield_accepted', instanceId: this.instanceId });
      console.error(`[FSB Bridge ${this.instanceId}] Local FSB service ${clientId} asked for the hub port; handing over once idle`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'relay:yield-accepted', hubInstanceId: this.instanceId }));
      }
      this._advanceHubHandoff(handoff);
    });
  }

  private async _confirmDaemonRelay(clientId: string): Promise<boolean> {
    if (this.daemonHealthPort === null) return false;
    const health = await probeDaemonHealth(this.daemonHealthPort, this.daemonProbeTimeoutMs);
    return health !== null
      && health.serveReady
      && health.bridgeInstanceId === clientId
      && health.bridgeMode === 'relay'
      && health.activeHubInstanceId === this.instanceId;
  }

  /**
   * Hub side: move the handover on once nothing is in flight. A drain also
   * ends without the extension, since nothing still tracked here can then
   * complete, and at its deadline, cutting off whatever is left.
   */
  private _advanceHubHandoff(handoff: HubHandoff): void {
    if (this.hubHandoff !== handoff || this.mode !== 'hub') return;
    if (
      handoff.phase === 'draining'
      && (
        this.extensionClient === null
        || (handoff.drainDeadline !== null && Date.now() >= handoff.drainDeadline)
      )
    ) {
      this._finishHubHandoff(handoff);
      return;
    }
    if (!this.isIdle()) {
      const timer = setTimeout(() => {
        handoff.timer = null;
        this._advanceHubHandoff(handoff);
      }, this.hubHandoffPollMs);
      timer.unref?.();
      handoff.timer = timer;
      return;
    }
    if (handoff.phase === 'waiting') this._releaseHubPort(handoff);
    else if (handoff.phase === 'draining') this._finishHubHandoff(handoff);
  }

  /**
   * Hub side: free the port for the local service. Only the listening socket
   * closes. The extension and every relay stay connected and served here, so
   * nothing is cut short, and no other relay can take the port first: their
   * sockets close only after the service is already listening.
   */
  private _releaseHubPort(handoff: HubHandoff): void {
    if (handoff.socket.readyState !== WebSocket.OPEN) {
      this._clearHubHandoff();
      return;
    }
    handoff.phase = 'released';
    try {
      this.httpServer?.close();
    } catch {
      // Already closed.
    }
    handoff.socket.send(JSON.stringify({ type: 'relay:hub-released', hubInstanceId: this.instanceId }));
    const timer = setTimeout(() => {
      handoff.timer = null;
      this._abortHubHandoff(handoff, 'bind_timeout');
    }, this.hubHandoffTimeoutMs);
    timer.unref?.();
    handoff.timer = timer;
  }

  /**
   * Hub side: the service never bound the port. Listen again; if something
   * else took the port meanwhile, the listener's error handler drops every
   * socket and competes for it the usual way.
   */
  private _abortHubHandoff(handoff: HubHandoff, reason: string): void {
    if (this.hubHandoff !== handoff) return;
    this._clearHubHandoff();
    logBridgeEvent({ event: 'hub_yield_failed', instanceId: this.instanceId, reason });
    // Tells a service that is still connected that it may ask again later.
    if (handoff.socket.readyState === WebSocket.OPEN) {
      handoff.socket.send(JSON.stringify({ type: 'relay:yield-refused', reason }));
    }
    console.error(`[FSB Bridge ${this.instanceId}] Hub handover to ${handoff.successorId} failed (${reason}); keeping the port`);
    const server = this.httpServer;
    if (this.mode !== 'hub' || !server || server.listening) return;
    try {
      server.listen(this.port, this.host);
    } catch {
      this._abandonHub('hub_server_error');
      void this._attemptPromotion();
    }
  }

  /** Hub side: the service holds the port and this hub is idle; send everyone there. */
  private _finishHubHandoff(handoff: HubHandoff): void {
    this._clearHubHandoff();
    const notice = JSON.stringify({
      type: 'relay:handoff',
      hubInstanceId: this.instanceId,
      successorInstanceId: handoff.successorId,
    });
    for (const [, ws] of this.relayClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(notice);
    }
    logBridgeEvent({ event: 'hub_yielded', instanceId: this.instanceId });
    console.error(`[FSB Bridge ${this.instanceId}] Handed the hub over to ${handoff.successorId}; rejoining as a relay`);
    this._abandonHub('hub_handed_off');
    // The new hub is already listening. If it cannot be reached after all,
    // the failed connection's close handler competes for the port as usual.
    void this._startAsRelay().catch(() => undefined);
  }

  /**
   * Hub side: the relay that asked for the port disconnected. Once the port
   * was released, that most likely means the service is gone and nothing
   * listens, so this hub listens again; if the service does still hold the
   * port, the listener's error handler competes for it the usual way.
   */
  private _onHandoffSuccessorClosed(handoff: HubHandoff): void {
    if (this.hubHandoff !== handoff) return;
    if (handoff.phase === 'released' || handoff.phase === 'draining') {
      this._abortHubHandoff(handoff, 'successor_lost');
    } else {
      // Still verifying or waiting: nothing has changed yet.
      this._clearHubHandoff();
    }
  }

  private _clearHubHandoff(): void {
    const handoff = this.hubHandoff;
    if (!handoff) return;
    this.hubHandoff = null;
    if (handoff.timer) clearTimeout(handoff.timer);
    handoff.timer = null;
  }
}
