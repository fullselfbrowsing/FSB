// Messages FROM MCP server TO extension (via WebSocket bridge)
export interface MCPMessage {
  id: string;          // Unique message ID for request/response correlation
  type: MCPMessageType;
  payload: Record<string, unknown>;
  // Which connected browser the hub should hand this to. Hub routing only:
  // the hub removes it before the frame reaches an extension.
  browser?: string;
}

export type MCPMessageType =
  | 'mcp:start-automation'    // Autopilot: run a task
  | 'mcp:stop-automation'     // Cancel running task
  | 'mcp:get-status'          // Query task status
  | 'mcp:get-task-snapshot'   // Phase 239 plan 03: D-05 SW-wake snapshot lookup (server-side sw_evicted catch)
  | 'mcp:trigger'             // Arm a background-owned DOM trigger
  | 'mcp:stop-trigger'        // Cancel a background-owned DOM trigger
  | 'mcp:get-trigger-status'  // Query one persisted trigger status
  | 'mcp:list-triggers'       // List persisted trigger snapshots
  | 'mcp:start-visual-session' // MCP-owned visible lifecycle start
  | 'mcp:end-visual-session'   // MCP-owned visible lifecycle end
  | 'mcp:task-status'          // Client-authored complete/partial/fail summary
  | 'mcp:execute-action'      // Manual: execute a single browser action
  | 'mcp:go-back'             // Phase 242 D-01: ownership-gated single-step browser-history back
  | 'mcp:get-dom'             // Read DOM snapshot
  | 'mcp:get-tabs'            // List open tabs
  | 'mcp:get-site-guides'     // Read site guide data
  | 'mcp:get-page-snapshot'   // Markdown snapshot of current page DOM
  | 'mcp:get-memory'          // Read memory system
  | 'mcp:get-config'          // Read extension config (keys redacted)
  | 'mcp:read-page'           // Read page text content
  | 'mcp:capture-screenshot'  // Developer/UAT: native composited page PNG
  | 'mcp:list-sessions'       // List all past session summaries
  | 'mcp:get-session'         // Get full session detail by ID
  | 'mcp:get-session-replay'  // Get the verified structured replay preview by ID
  | 'mcp:replay-session'      // Request UI consent for a verified replay
  | 'mcp:get-logs'            // Get recent logs or session-specific logs
  | 'mcp:search-memory'       // Search memories with query and filters
  | 'mcp:create-agent'        // Create a new background agent
  | 'mcp:list-agents'         // List all background agents
  | 'mcp:run-agent'           // Trigger immediate agent execution
  | 'mcp:stop-agent'          // Stop a running agent
  | 'mcp:delete-agent'        // Delete an agent permanently
  | 'mcp:toggle-agent'        // Enable/disable an agent
  | 'mcp:get-agent-stats'     // Get aggregate agent statistics
  | 'mcp:get-agent-history'   // Get run history for an agent
  | 'mcp:list-credentials'   // Vault: list saved credentials (domain+username only)
  | 'mcp:fill-credential'    // Vault: autofill login form (password stays in extension)
  | 'mcp:list-payments'      // Vault: list payment methods (last4+brand only)
  | 'mcp:use-payment-method' // Vault: fill checkout with confirmation gate
  | 'mcp:capabilities-search' // Phase 28: read-only capability search (queue-bypass, search_capabilities)
  | 'mcp:capabilities-invoke' // Phase 28: queued capability invoke (serialized, invoke_capability)
  | 'agent:register'         // Phase 238: lazy-mint per-process agent_id
  | 'agent:release'          // Phase 238: handler only; server caller in Phase 241
  | 'agent:status'           // Phase 238: caller-self introspection
  | 'system:client-inventory'; // Phase 57: additive installed MCP-client inventory

// Messages FROM extension TO MCP server (responses)
export interface MCPResponse {
  id: string;          // Matches the request MCPMessage.id
  type: 'mcp:result' | 'mcp:progress' | 'mcp:error';
  payload: Record<string, unknown>;
}

// Progress notification during autopilot tasks
export interface MCPProgress {
  id: string;
  type: 'mcp:progress';
  payload: {
    taskId: string;
    progress: number;    // 0-100
    phase: string;
    eta?: string;
    action?: string;     // Current action summary
  };
}

export type BridgeMode = 'hub' | 'relay' | 'disconnected';

export interface BridgeOptions {
  port?: number;
  host?: string;
  instanceId?: string;
  handshakeTimeoutMs?: number;
  relayHandshakeTimeoutMs?: number;
  extensionPingIntervalMs?: number;
  extensionHeartbeatTimeoutMs?: number;
  promotionJitterMs?: number;
  maxReconnectDelayMs?: number;
  // How long a relay that names no browser keeps the one it was given after
  // that browser goes away. Tests shorten it.
  legacyRelayBindingGraceMs?: number;
  // How long an extension socket may take to say which install it is before
  // it is attached as a build that never does. 0 attaches every socket at once
  // under that name, which is how the hub behaved before it kept one browser
  // per install.
  extensionIdentifyTimeoutMs?: number;
  // How long a browser that was turned away for any reason but the pin stays
  // listed after its last try. Tests shorten it.
  browserRefusalTtlMs?: number;
  allowedBrowserOrigins?: string[];
  capabilities?: BridgeCapability[];
  handleExtRequest?: ExtRequestHandler;
}

export interface BridgeTopologyState {
  instanceId: string;
  mode: BridgeMode;
  hubConnected: boolean;
  extensionConnected: boolean;
  relayCount: number;
  pendingRequestCount: number;
  activeHubInstanceId: string | null;
  lastExtensionHeartbeatAt: number | null;
  lastDisconnectReason: string | null;
  extensionAttachment: ExtensionAttachmentState | null;
  // Every attached browser. Null when this process is a relay of a hub that
  // predates the roster, which serves one browser and cannot be told which.
  browsers: BrowserRosterEntry[] | null;
  refusedBrowsers: BrowserRefusal[];
  hubVersion: string | null;
}

export interface ExtensionAttachmentState {
  extensionId: string;
  extensionVersion: string;
  installInstanceId: string;
  normalWindowCount: number;
  connectedAt: string | null;
}

// The family a browser belongs to, known by the scheme of the Origin its
// extension connects with. Every Chromium browser (Chrome, Edge, Brave, Arc)
// is 'chrome': they share a scheme, and nothing on the wire tells them apart.
export type BrowserKind = 'chrome' | 'safari';

/**
 * One browser attached to the hub: one extension in one profile. `key` is what
 * a caller names to reach it.
 */
export interface BrowserRosterEntry {
  key: string;
  kind: BrowserKind;
  // The extension's own id: for Chrome the host of its Origin, for Safari the
  // bundle id its state frame reports.
  extensionId: string | null;
  extensionVersion: string | null;
  // Made once per profile by the extension. Null from a build that never says.
  installInstanceId: string | null;
  // Ordinary windows open in this profile. Null until the extension reports.
  windows: number | null;
  authorized: boolean;
  // When a window of this browser last took focus, as its extension reported
  // it. Null from an extension that does not report focus.
  focusedAt: number | null;
  connectedAt: number;
  // When this browser was first attached. Unlike connectedAt it is kept across
  // a worker restart. Absent from a hub that predates it.
  since?: number;
}

/** Why a browser that tried to attach is not in the roster. */
export interface BrowserRefusal {
  kind: BrowserKind;
  reason: string;
  at: number;
  // Which extension was turned away, when its Origin names one.
  extensionId?: string | null;
}

// Relay protocol: MCP instance -> hub handshake
export interface RelayHello {
  type: 'relay:hello';
  instanceId: string;
  capabilities?: BridgeCapability[];
}

// Relay protocol: hub -> MCP instance handshake ack
export interface RelayWelcome {
  type: 'relay:welcome';
  instanceId: string;
  hubInstanceId: string;
  extensionConnected: boolean;
  relayCount: number;
  lastExtensionHeartbeatAt: number | null;
  lastDisconnectReason: string | null;
  extensionAttachment?: ExtensionAttachmentState | null;
  capabilities?: BridgeCapability[];
  browsers?: BrowserRosterEntry[];
  refusedBrowsers?: BrowserRefusal[];
  hubVersion?: string;
}

export interface RelayState {
  type: 'relay:state';
  hubInstanceId: string;
  extensionConnected: boolean;
  relayCount: number;
  lastExtensionHeartbeatAt: number | null;
  lastDisconnectReason: string | null;
  extensionAttachment?: ExtensionAttachmentState | null;
  capabilities?: BridgeCapability[];
  browsers?: BrowserRosterEntry[];
  refusedBrowsers?: BrowserRefusal[];
  hubVersion?: string;
}

// Hub -> relay, sent just before an ext:request the hub forwards: which browser
// the request came from. It is a frame of its own because ext:request has an
// exact key list, and a relay from before this would refuse one more key.
export interface RelayExtRoute {
  type: 'relay:ext-route';
  requestId: string;
  browser: string;
}

export type RelayMessage = RelayHello | RelayWelcome | RelayState | RelayExtRoute;

export type BridgeCapability = 'agent-spawn';

export interface ExtRequest {
  id: string;
  type: 'ext:request';
  method: string;
  payload: Record<string, unknown>;
}

export interface ExtError {
  code: 'agent_provider_offline' | 'bridge_topology_changed' |
    'ext_unauthorized' | 'invalid_ext_request' | 'ext_request_timeout';
  message: string;
  retryable: boolean;
}

export type ExtResponse =
  | { id: string; type: 'ext:response'; payload: Record<string, unknown>; error?: never }
  | { id: string; type: 'ext:response'; error: ExtError; payload?: never };

export interface ExtEvent {
  id: string;
  type: 'ext:event';
  event: string;
  payload: Record<string, unknown>;
}

export type ExtMessage = ExtRequest | ExtResponse | ExtEvent;

export interface ExtRequestContext {
  readonly signal: AbortSignal;
  // The browser whose extension sent the request. A delegated run belongs to
  // the profile that started it, so its agent is sent back there. Null when
  // the hub could not name it, and absent from a hub that predates the roster.
  readonly browser?: string | null;
}

export type ExtRequestHandler = (
  request: ExtRequest,
  emit: (event: ExtEvent) => void,
  context?: ExtRequestContext,
) => Promise<Record<string, unknown>>;

// Tool result wrapper
export interface ToolResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}
