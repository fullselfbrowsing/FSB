// Messages FROM MCP server TO extension (via WebSocket bridge)
export interface MCPMessage {
  id: string;          // Unique message ID for request/response correlation
  type: MCPMessageType;
  payload: Record<string, unknown>;
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
  | 'mcp:execute-action'      // Manual: execute a single browser action
  | 'mcp:go-back'             // Phase 242 D-01: ownership-gated single-step browser-history back
  | 'mcp:get-dom'             // Read DOM snapshot
  | 'mcp:get-tabs'            // List open tabs
  | 'mcp:get-site-guides'     // Read site guide data
  | 'mcp:get-page-snapshot'   // Markdown snapshot of current page DOM
  | 'mcp:get-memory'          // Read memory system
  | 'mcp:get-config'          // Read extension config (keys redacted)
  | 'mcp:read-page'           // Read page text content
  | 'mcp:list-sessions'       // List all past session summaries
  | 'mcp:get-session'         // Get full session detail by ID
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
  promotionJitterMs?: number;
  maxReconnectDelayMs?: number;
  allowedBrowserOrigins?: string[];
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
}

// Relay protocol: MCP instance -> hub handshake
export interface RelayHello {
  type: 'relay:hello';
  instanceId: string;
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
}

export interface RelayState {
  type: 'relay:state';
  hubInstanceId: string;
  extensionConnected: boolean;
  relayCount: number;
  lastExtensionHeartbeatAt: number | null;
  lastDisconnectReason: string | null;
}

export type RelayMessage = RelayHello | RelayWelcome | RelayState;

// Tool result wrapper
export interface ToolResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}
