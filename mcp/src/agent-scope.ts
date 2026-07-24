// Phase 238: per-process agent_id minted via lazy agent:register round-trip.
// See .planning/phases/238-agentscope-bridge-wiring/238-CONTEXT.md D-01..D-04, D-12.
//
// Decisions honored:
//   D-01 per-process singleton lifetime (one AgentScope per MCP server process)
//   D-03 cached-promise race control (concurrent first callers share ONE in-flight register)
//   D-04 throw-on-failure, NO caching (rejected register allows next ensure() to retry cleanly)
//   D-12 caller does not supply agentId; the extension registry mints fresh
//
// Logging convention: ASCII only, no emojis (CLAUDE.md). Prefix [FSB AgentScope] follows
// the FSB family ([FSB AGT], [FSB DLG], [FSB BG], ...).

import type { WebSocketBridge } from './bridge.js';
import type { McpClientInventory } from './client-inventory.js';

const SCOPE_LOG_PREFIX = '[FSB AgentScope]';
const DELEGATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export type ClientInfo = {
  name?: string;
  version?: string;
};

export type ClientInfoSupplier = () => ClientInfo | null;
export type ClientInventorySupplier = () => McpClientInventory | Promise<McpClientInventory>;

export type AgentScopeEnvironment = Readonly<Record<string, string | undefined>>;

export type AgentScopeOptions = {
  environment?: AgentScopeEnvironment;
};

export class AgentScope {
  private agentId: string | null = null;
  private pending: Promise<string> | null = null;
  private clientInfoSupplier: ClientInfoSupplier | null = null;
  private clientInventorySupplier: ClientInventorySupplier | null = null;
  // Phase 240 Open Q1 resolution: ownership tokens are minted per-bindTab on
  // the extension side. Each bindTab-firing handler returns the freshly
  // minted token in its response under `ownershipToken`. AgentScope captures
  // them keyed by tabId via captureOwnershipToken() so subsequent dispatches
  // for that tab can thread the matching token. The map is also seeded from
  // agent:register's response.ownershipTokens (empty at register time but
  // shape-preserved for forward compatibility).
  private ownershipTokens: Map<number, string> = new Map();
  // Most recently minted token, regardless of tabId. Phase 240 plan 02 only
  // wires the smoke-test path which carries a deterministic token; this
  // single-slot fallback lets manual / visual-session / autopilot include
  // an ownershipToken in the bridge payload without needing an explicit
  // tabId. Explicit-tab tool sites prefer ownershipTokenFor(tabId) and fall
  // back to this slot only for implicit selected-tab calls.
  private lastOwnershipToken: string | null = null;
  // Phase 241 D-08: per-bridge-connect connection_id captured from the
  // agent:register response. The extension mints a fresh UUID at every
  // _ws.onopen, threads it via the dispatcher's handleAgentRegisterRoute
  // response, and the registry stamps it on the new agent record. Outbound
  // tool payloads thread this back to the extension so the registry knows
  // which agents to stage for grace-window release on _ws.onclose.
  // Single-slot model (one bridge per process for v0.9.60) -- mirrors the
  // lastOwnershipToken pattern.
  private connectionId: string | null = null;
  private readonly environment: AgentScopeEnvironment;

  constructor(options: AgentScopeOptions = {}) {
    // Capture the process environment once. A delegated child receives the
    // daemon-minted id at spawn time; later ambient mutations must not change
    // the identity carried by this process's one registration handshake.
    this.environment = { ...(options.environment ?? process.env) };
  }

  setClientInfoSupplier(supplier: ClientInfoSupplier): void {
    this.clientInfoSupplier = supplier;
  }

  setClientInventorySupplier(supplier: ClientInventorySupplier): void {
    this.clientInventorySupplier = supplier;
  }

  /**
   * Returns the per-process agent_id, lazy-minting on first call via the
   * agent:register bridge message. Concurrent first callers share one
   * in-flight register; subsequent callers reuse the cached id.
   *
   * Throws if agent:register fails. Failure is NOT cached -- the next
   * ensure() call retries cleanly (D-04).
   */
  async ensure(bridge: WebSocketBridge): Promise<string> {
    if (this.agentId) return this.agentId;
    if (this.pending) return this.pending;

    this.pending = (async () => {
      try {
        const payload: {
          clientInfo?: ClientInfo;
          platforms?: McpClientInventory;
          delegationId?: string;
        } = {};
        const delegationId = this.environment.FSB_DELEGATION_ID;
        if (delegationId !== undefined) {
          if (!DELEGATION_ID_PATTERN.test(delegationId)) {
            throw new Error('Invalid FSB_DELEGATION_ID');
          }
          // Registration-only correlation sidecar. It is intentionally not
          // stored as agent identity and never participates in MCP tool args.
          payload.delegationId = delegationId;
        }
        const suppliedClientInfo = this.clientInfoSupplier?.();
        if (suppliedClientInfo) {
          const clientInfo: ClientInfo = {};
          if (typeof suppliedClientInfo.name === 'string') {
            clientInfo.name = suppliedClientInfo.name;
          }
          if (typeof suppliedClientInfo.version === 'string') {
            clientInfo.version = suppliedClientInfo.version;
          }
          if (Object.keys(clientInfo).length > 0) {
            payload.clientInfo = clientInfo;
          }
        }

        const suppliedPlatforms = await this.clientInventorySupplier?.();
        if (
          suppliedPlatforms &&
          typeof suppliedPlatforms === 'object' &&
          !Array.isArray(suppliedPlatforms) &&
          Object.keys(suppliedPlatforms).length > 0
        ) {
          payload.platforms = { ...suppliedPlatforms };
        }

        const result = await bridge.sendAndWait(
          { type: 'agent:register', payload },
          { timeout: 10_000 },
        );
        if (!result || result.success !== true || typeof result.agentId !== 'string') {
          const reason = result && typeof result.error === 'string' ? result.error : 'unknown';
          throw new Error('agent:register failed: ' + reason);
        }
        const minted = result.agentId;
        const shortLabel =
          typeof result.agentIdShort === 'string' && result.agentIdShort.length > 0
            ? result.agentIdShort
            : minted.slice(0, 12);
        this.agentId = minted;
        // Phase 240: agent:register response now carries an `ownershipTokens`
        // map (empty at register time but shape-preserved). Seed the local
        // cache so a stale phase-238 server still works (the field is
        // optional on the response).
        const tokens = (result as { ownershipTokens?: Record<string, unknown> }).ownershipTokens;
        if (tokens && typeof tokens === 'object') {
          for (const [tabKey, tokenValue] of Object.entries(tokens)) {
            const tabId = Number(tabKey);
            if (Number.isFinite(tabId) && typeof tokenValue === 'string' && tokenValue.length > 0) {
              this.ownershipTokens.set(tabId, tokenValue);
              this.lastOwnershipToken = tokenValue;
            }
          }
        }
        // Phase 240 smoke harness convention: the mock agent:register may
        // return a single deterministic ownershipToken alongside the
        // ownershipTokens map. Capture it for the lastOwnershipToken slot.
        const seedToken = (result as { ownershipToken?: unknown }).ownershipToken;
        if (typeof seedToken === 'string' && seedToken.length > 0) {
          this.lastOwnershipToken = seedToken;
        }
        // Phase 241 D-08: capture connection_id from the agent:register
        // response. Older Phase 240 dispatchers do not include this field
        // (additive contract); the captureConnectionId helper safely
        // tolerates null/undefined input.
        const seedConnectionId = (result as { connectionId?: unknown }).connectionId;
        if (typeof seedConnectionId === 'string' && seedConnectionId.length > 0) {
          this.captureConnectionId(seedConnectionId);
        }
        console.error(SCOPE_LOG_PREFIX + ' minted ' + shortLabel);
        return minted;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(SCOPE_LOG_PREFIX + ' mint failed: ' + message);
        throw err;
      } finally {
        // Clear the in-flight slot regardless of outcome:
        //   - success path: this.agentId is set, so the fast path covers all subsequent calls
        //   - failure path: clearing pending allows the next caller to retry (D-04 no-poison)
        this.pending = null;
      }
    })();

    return this.pending;
  }

  /** Sync read for diagnostics; null if not yet minted. */
  current(): string | null {
    return this.agentId;
  }

  /**
   * Phase 240: returns the most recently captured ownership token, or null
   * if no bindTab-firing handler has resolved yet. Plan 02 wires this slot
   * from agent:register and bindTab response shapes; Plan 03 will replace
   * the single-slot model with per-tabId routing.
   */
  currentOwnershipToken(): string | null {
    return this.lastOwnershipToken;
  }

  /**
   * Phase 240: capture an ownershipToken for a tab. Called by tool sites
   * after a bindTab-firing handler returns `ownershipToken` in its success
   * response. Idempotent on the same (tabId, token) pair.
   */
  captureOwnershipToken(tabId: number | null, token: string | null | undefined): void {
    if (!token || typeof token !== 'string') return;
    if (Number.isFinite(tabId) && tabId !== null) {
      this.ownershipTokens.set(tabId as number, token);
    }
    this.lastOwnershipToken = token;
  }

  /**
   * Phase 240/248: read the ownership token for a specific tab (null if
   * absent). Tool sites with explicit tab_id use this first, then fall back
   * to currentOwnershipToken() for implicit selected-tab calls.
   */
  ownershipTokenFor(tabId: number | null | undefined): string | null {
    if (!Number.isFinite(tabId as number) || tabId === null || tabId === undefined) return null;
    return this.ownershipTokens.get(tabId as number) || null;
  }

  /**
   * Phase 241 D-08: capture the per-bridge-connect connection_id surfaced by
   * the extension's handleAgentRegisterRoute response. Idempotent on the
   * same value; null/empty input is silently ignored so callers do not need
   * to type-narrow at the call site.
   */
  captureConnectionId(connectionId: string | null | undefined): void {
    if (typeof connectionId !== 'string' || connectionId.length === 0) return;
    this.connectionId = connectionId;
  }

  /**
   * Phase 241 D-08: returns the most recently captured connection_id, or
   * null if no agent:register response has yet supplied one. Tool sites
   * thread this into their bridge payloads alongside agentId / ownershipToken
   * so the extension's registry can stage release on bridge onclose.
   */
  currentConnectionId(): string | null {
    return this.connectionId;
  }

  /**
   * Test-only escape hatch; do NOT call from production code.
   * Clears both the cached id and any in-flight pending mint so a fresh
   * ensure() will round-trip a new agent:register.
   */
  reset(): void {
    this.agentId = null;
    this.pending = null;
    this.ownershipTokens.clear();
    this.lastOwnershipToken = null;
    // Phase 241 D-08: connection_id is per-bridge-connect; reset clears it
    // alongside the rest so a follow-up ensure() captures a fresh one.
    this.connectionId = null;
  }
}
