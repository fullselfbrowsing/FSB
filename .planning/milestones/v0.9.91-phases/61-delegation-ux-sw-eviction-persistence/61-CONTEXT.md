# Phase 61: Delegation UX & SW-Eviction Persistence - Context

**Gathered:** 2026-07-14
**Status:** Ready for UI specification and planning

<domain>
## Phase Boundary

Turn Phase 60's authenticated, daemon-owned Claude delegation into a first-class side-panel experience. Phase 61 adds the `delegated` execution mode; authoritative provider routing; explicit first-use/per-run consent; a provider-neutral streaming feed and honest usage summary; a background-tab, take-control, resume, and stop lifecycle tied to exact v0.9.60 ownership; write-before-fanout `chrome.storage.session` persistence; an acknowledged 20-second heartbeat; an honest offline/doctor surface; and restart-is-clean loss reporting.

The phase consumes the existing five-method adapter and normalized `AgentEvent` contract. It does **not** add another adapter, change Claude's task-only profile, embed an SDK, add `nativeMessaging`, wake the daemon, build Phase 62's compatibility matrix/expanded doctor, or make live execution survive a browser or daemon restart. Service-worker eviction restores the exact delivered feed; it never silently re-adopts a process whose authenticated reverse route was lost.

</domain>

<decisions>
## Implementation Decisions

### Delegated Routing and Consent
- **D-01:** `extension/background.js` is the authoritative provider-kind branch. It reads and validates the persisted `providerKind` and `agentProviderId` keys explicitly (or extends the central config loader with those exact fields), selects `delegated` only for a supported agent-kind provider, and preserves the existing API-kind path byte-for-byte.
- **D-02:** `EXECUTION_MODES.delegated` is the fifth mode, with `uiFeedbackChannel: 'popup-sidepanel'`, `animatedHighlights: true`, wall-clock and event-silence watchdogs, and no iteration limit. A delegated request branches before legacy internal-session allocation and can never enter `runAgentLoop`.
- **D-03:** Delegated send is a preflight-first transaction: readiness and pairing are checked, consent is resolved, and only then may `delegate.start` run. An offline, unpaired, unsupported, or unconfirmed attempt does not append the user message, clear the composer, create a running session, create a tab, or enqueue work.
- **D-04:** The side panel renders consent, but the background enforces it. Per-provider trust is an explicit durable `chrome.storage.local` setting, default false. Otherwise every run requires a one-use confirmation challenge stored in `chrome.storage.session`; a caller-supplied boolean is never sufficient spawn authority. The challenge names the selected CLI and is consumed atomically by one start.
- **D-05:** Consent copy states that the CLI may drive FSB MCP tools on the live browser and may not edit files, run shell commands, or fetch arbitrary URLs. It never calls delegation a faster mode and never describes subscription use as free or unlimited.

### Delegation State, Event Ledger, and Feed
- **D-06:** A background-owned delegation controller is the single state machine for start, event ingestion, hold/resume, stop, heartbeat loss, route loss, and terminal settlement. The side panel is a subscriber and renderer, not an alternative lifecycle authority.
- **D-07:** Each supervisor event becomes one provider-neutral, bounded, redacted ledger entry with a monotonic sequence under one per-delegation `chrome.storage.session` key. Writes are serialized per delegation and complete before runtime-message fanout. No event is reordered, deduplicated by guesswork, reconstructed from chat history, or persisted as raw Claude JSON.
- **D-08:** The ledger stores a compact one-to-one projection of received events so a 45-minute run stays within `storage.session`'s 10 MB extension quota. Each entry retains source type, sequence, session/delegation identity, timestamp, and bounded presentation fields. If an event or ledger cannot be stored within the declared limits, the controller fails the run closed and cancels it rather than dropping history or broadcasting an unpersisted row.
- **D-09:** `mcpBridgeClient.sendExtRequest` gains ordered async event-observer semantics. A final response cannot settle ahead of earlier event writes, and an observer failure cannot be hidden by a later successful result. Existing synchronous observers remain compatible.
- **D-10:** Feed cards derive only from normalized events: `delegation.started`/`init` for client, profile/model, session, and allowed tools; `tool_use`/`tool_result` for a redacted name/argument summary, reported tab id, status, and duration; `retry` for the typed retry class; and `result`/terminal diagnostics for usage and outcome. Missing metadata is labeled unavailable, never invented.
- **D-11:** Reopening the side panel hydrates the canonical session ledger first, renders entries in sequence, then subscribes from the last rendered sequence. Duplicate UI delivery is suppressed only by exact delegation-id/sequence identity. Ordinary chat history in `chrome.storage.local` remains separate.

### Background Tabs, Ownership, Take Control, and Stop
- **D-12:** Delegated work never steals focus at launch. It uses the existing MCP `open_tab` contract, whose default is `active: false`, and must not silently bind or navigate the user's current active tab merely because the task was submitted from the side panel.
- **D-13:** Phase 61 makes the existing daemon-minted `FSB_DELEGATION_ID` useful end to end: the spawned MCP process includes it in the additive `agent:register` sidecar, the extension validates/stamps it on the minted `AgentRecord`, and the controller maintains an exact delegation-to-agent mapping. Delegation ids remain server-minted and are never accepted as client-selected authority.
- **D-14:** Take Control appears persistently only when the currently active tab is owned by the active delegation. Activating the tab alone does not pause it; the user must click the affordance. A closed supervisor hold/resume operation pauses the identity-verified process group on the currently supported POSIX production platforms, with a bounded grace deadline. This is supervisor policy, not a sixth adapter method. Unsupported platforms remain fail-closed rather than pretending to pause.
- **D-15:** Once hold is confirmed, the registry removes the affected tabs from active automation ownership and stores a sealed, delegation-scoped hold lease. Other agents cannot claim a human-held tab. Resume succeeds only for the same live delegation and unchanged tab identities, restores the held ownership lease, then resumes the process; any conflict or expired hold cancels the delegation instead of guessing. A bounded hold expiry also cancels so a suspended process cannot become an orphan.
- **D-16:** `stopDelegatedTask` sends cancellation using the server-minted delegation id, waits for confirmed supervisor tree settlement, then releases only the tabs mapped to that delegation/agent. It is idempotent across racing Stop, result, disconnect, and panel-close paths and reports exactly `Agent stopped, N tab(s) released` only after both kill and release settle.
- **D-17:** Terminal cleanup never releases another agent's tabs. If the exact delegation-to-agent mapping is unavailable or inconsistent, cleanup fails closed, records a typed diagnostic, and leaves unrelated ownership untouched.

### Usage Summary and Presentation
- **D-18:** The post-run card reports input/output/total tokens, turns, wall-clock duration, terminal state, and a collapsed per-tool breakdown expandable to the persisted tool log. Agent-kind cost copy is exactly honest subscription-bucket language (`included in your subscription`) with no fabricated dollar amount; API-kind summaries continue to use the existing real cost tracker.
- **D-19:** Side-panel components reuse existing typography, color tokens, message surfaces, status/live-region conventions, and responsive width. New feed semantics get accessible text labels in addition to icons/color; consent, offline, disconnected, held, stopped, failed, and completed are visibly distinct states.

### Heartbeat, Offline, Eviction, and Restart Loss
- **D-20:** While at least one delegation is active, the bridge runs one ref-counted 20-second keepalive loop. Each ping carries a bounded nonce/timestamp and requires a matching pong; success resets the consecutive-miss counter. Three consecutive missed acknowledgements transition the controller to persisted `daemon:disconnected`, stop new delegated sends, and surface the fallback. Opening multiple panels or delegations never creates multiple timers.
- **D-21:** The manifest declares Chrome 116 as the minimum version for this WebSocket service-worker lifetime guarantee. Existing non-delegated connection behavior remains compatible, but active delegation uses the normative 20-second cadence rather than the current unacknowledged 25-second timer.
- **D-22:** The offline/disconnected card shows the exact local doctor command and an extension-local action to the Providers/local-bridge setup surface. It does not claim to execute the command, read terminal output, restart the daemon, or use native messaging. Phase 63 may later add wake behavior without replacing this fallback.
- **D-23:** A normal socket close or hub/relay topology change is not enough to label a daemon restart. The agent-spawn authority exposes an additive non-secret daemon generation/recovery signal, and startup orphan recovery retains a bounded disposition for killed delegation ids. Only matching evidence produces `daemon_restart_lost_run`; ordinary route loss gets its own truthful terminal classification.
- **D-24:** On service-worker wake, the controller hydrates all nonterminal ledgers before reconnecting and reconciles them against current bridge/generation state. Feed history resumes exactly from persisted sequence; Phase 60's route-loss cancellation remains authoritative, so execution is not replayed or re-adopted.
- **D-25:** `chrome.storage.session` is used intentionally: it survives MV3 worker eviction but is cleared on extension disable/reload/update and browser restart. The UI promises eviction-safe feed recovery only; it does not promise disk durability across those lifecycle boundaries.

### Compatibility, Verification, and UAT Deferral
- **D-26:** Existing MCP message types, tool schemas, Phase 59 transport errors, Phase 60 five-method adapter surface, seven BYOK providers, and legacy side-panel automation remain compatible. New supervisor lifecycle methods and registration sidecars are closed/additive and exact-shape validated.
- **D-27:** Every extension-touching commit updates paired source-shape tripwires and runs its focused tests; the complete root suite is green from the first implementation commit. Required automated fixtures cover API-vs-agent routing, consent replay/forgery, no-optimism offline behavior, event ordering/write failure, forced SW eviction hydration, 20-second/three-miss heartbeat, hold/resume/expiry, stop cleanup, generation-based restart loss, quota bounds, accessibility/source pins, and the no-`nativeMessaging` invariant.
- **D-28:** Automated/source verification, artifact/key-link checks, and a clean code/security review remain blocking. Live browser focus behavior, real CLI streaming, forced Chrome worker eviction, 45-minute endurance, real process hold/resume, daemon restart, and human visual/accessibility checks are documented without fabricated passes and join the single milestone-end UAT gate.

### the agent's Discretion
- Exact module filenames, storage key spelling/version, bounded ledger-entry/event-count limits, watchdog durations, hold grace duration, and card microcopy may be chosen during UI specification/planning, provided the fail-closed and truthfulness rules above hold.
- The additive daemon generation/recovery transport may be a closed status request or capability/status sidecar; it must not modify frozen legacy envelopes, expose secrets, or infer restart from disconnect alone.
- Assistant/user/delta events may render as compact activity rows rather than top-level cards, but every received normalized event still receives one persisted ledger sequence entry.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing. Current roadmap, requirements, and this context override older research wherever they conflict.**

### Milestone Contract and State
- `.planning/PROJECT.md` — v0.9.91 goal, invariants, anti-features, and milestone-end UAT policy.
- `.planning/ROADMAP.md` § Phase 61 — phase boundary, dependencies, goal, and six observable success criteria.
- `.planning/REQUIREMENTS.md` §§ UX and LIFE — UX-01..06 and LIFE-01..04 normative contracts.
- `.planning/STATE.md` — current progress, deferred-UAT ledger, and Phase 61 handoff.

### Upstream Decisions and Evidence
- `.planning/phases/58-providers-panel/58-CONTEXT.md` — provider-kind separation, saved agent selection, subscription wording, and BYOK isolation.
- `.planning/phases/59-reverse-request-channel-security-foundation/59-CONTEXT.md` — authenticated `ext:*` transport, exact errors, capability routing, and secret boundary.
- `.planning/phases/59-reverse-request-channel-security-foundation/59-REVIEW.md` — final topology/exact-once security findings.
- `.planning/phases/60-adapter-contract-claude-code-mvp/60-CONTEXT.md` — five-method adapter, long-lived start correlation, cancel semantics, normalized events, and explicit Phase 61 boundary.
- `.planning/phases/60-adapter-contract-claude-code-mvp/60-VERIFICATION.md` — automated evidence and deferred live integration checks.
- `.planning/phases/60-adapter-contract-claude-code-mvp/60-REVIEW.md` — final clean review, route-loss cancellation, and terminal settlement guarantees.

### Existing Runtime and UI Contracts
- `extension/ai/engine-config.js` — four existing execution modes and safety-limit shape.
- `extension/background.js` — authoritative `startAutomation`/`stopAutomation` routing and worker wake path.
- `extension/ws/mcp-bridge-client.js` — authenticated reverse requests, pending correlations, reconnect state, and current 25-second unacknowledged ping.
- `extension/ws/mcp-tool-dispatcher.js` — ownership chokepoint and background-default `open_tab` behavior.
- `extension/utils/agent-registry.js` — tab ownership, token minting, release, session persistence, and connection grace.
- `extension/ui/sidepanel.js`, `extension/ui/sidepanel.html`, and `extension/ui/sidepanel.css` — existing composer, message/feed, running/stop, live-region, and layout patterns.
- `mcp/src/agent-providers/adapter.ts` and `mcp/src/agent-providers/spawn-supervisor.ts` — normalized events, exact start/cancel contract, runtime fingerprint, route abort, and settlement.
- `mcp/src/agent-scope.ts` — agent registration and per-tab ownership-token capture.

### Official Lifecycle References
- `https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets` — Chrome 116+ WebSocket worker-lifetime behavior and official 20-second keepalive example.
- `https://developer.chrome.com/docs/extensions/reference/api/storage` — `storage.session` lifecycle, trusted-context default, asynchronous writes, and 10 MB quota.
- `https://developer.chrome.com/docs/extensions/reference/api/tabs` — background-tab creation and `tabs.onActivated` semantics.
- `https://nodejs.org/api/process.html` and `https://nodejs.org/api/child_process.html` — POSIX signal behavior, process signal delivery, and Windows signal limitations.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `handleStartAutomation` already centralizes side-panel sends, tab lookup, legacy agent binding, and `runAgentLoop`; the delegated branch must occur before those legacy allocations while retaining the side-panel-open user-gesture ordering.
- `mcpBridgeClient.sendExtRequest` already provides authenticated long-lived request correlation and typed `agent_provider_offline`/`bridge_topology_changed` outcomes. Its pending record and frame handler are the natural async event-ordering seam.
- `AgentRegistry` already persists to `chrome.storage.session`, maps agents to tabs, rotates ownership tokens on bind, and provides exact `getAgentTabs`/release APIs. Phase 61 needs a delegation sidecar and a distinct human-hold lease rather than overloading ordinary release semantics.
- The Phase 60 child environment already carries `FSB_DELEGATION_ID`; no consumer currently threads it through `agent:register`. That is the narrowest safe delegation-to-agent correlation seam.
- `mcp-tool-dispatcher.js` already creates agent-opened tabs in the background unless `active: true` is explicit, so Phase 61 should preserve that behavior rather than creating a second tab policy.
- The side panel already has tab-aware running state, a Stop control, conversation persistence, message/status helpers, runtime listeners, and storage-session utilities that can be extended without replacing normal chat.

### Gaps to Close
- `Config.defaults` does not include `providerKind` or `agentProviderId`, even though `options.js` persists them; using `config.loadFromStorage()` alone would incorrectly route a selected agent through BYOK.
- The side panel currently appends the user message and clears the composer before `startAutomation` responds, which directly conflicts with LIFE-03 for delegated sends.
- The bridge currently pings every 25 seconds and ignores `mcp:pong`; it has no acknowledgment timestamp, miss counter, active-delegation refcount, or disconnected fanout.
- `sendExtRequest` calls `onEvent` synchronously and final responses can race asynchronous persistence.
- `releaseTab` deletes the agent when its last tab drains, so Take Control needs a separate bounded hold/escrow lifecycle if the same agent is to resume safely.
- The supervisor supports only `delegate.start` and `delegate.cancel`, and `delegation.started` does not expose the spawned MCP agent id. Closed hold/resume/status behavior and exact registration correlation are additive Phase 61 work.
- Startup recovery kills verified orphan process trees but does not expose a bounded lost-delegation disposition to the extension; disconnect alone cannot truthfully produce `daemon_restart_lost_run`.

### Test and Integration Seams
- Extend `tests/mcp-bridge-client-lifecycle.test.js`, `tests/mcp-bridge-background-dispatch.test.js`, `tests/mcp-spawn-supervisor.test.js`, `tests/agent-registry.test.js`, the side-panel smoke suites, provider routing tests, and the root serial `package.json` test chain.
- Add a focused delegation-store/controller suite with a fake `chrome.storage.session`, forced module reload, controlled write rejection, and monotonic fake clock/timers.
- Preserve Phase 60's full-suite workspace-integrity harness and the permanent forbidden-agent-flags/no-native-permission gates.

</code_context>

<specifics>
## Specific Ideas

- Feed rows should display stable human labels such as `Claude Code connected`, `Opened tab 42`, `Retrying after rate limit`, `Human control active`, and `Completed`, while retaining machine-readable event/error codes for tests and diagnostics.
- Tool argument summaries should use allowlisted fields plus existing redaction helpers; prompts, page text, credentials, raw result bodies, bridge secrets, and full URLs with query strings do not belong in the ledger.
- The composer keeps the unsent text intact in offline/unconfirmed states so the user can pair or run doctor and retry without reconstructing the task.
- The doctor fallback should show a copyable local command (for example the repository's existing `fsb-mcp-server doctor` invocation) and a button to open local bridge pairing; it must not use a custom URL scheme or imply that Chrome ran a terminal command.

</specifics>

<deferred>
## Deferred Ideas

- Adapter compatibility matrix, expanded machine-readable doctor output, and protocol-drift badges — Phase 62.
- Native-messaging wake/attach behavior and any automatic daemon launch — Phase 63.
- OpenCode and Codex feed-specific capabilities — Phases 64 and 65 through the same provider-neutral ledger; no Phase 61 UI may branch on raw provider JSON.
- Gemini, chat mode, CLI session resume, durable disk-backed feed history, cross-browser restart recovery, warm pools, remote/LAN delegation, and multiple simultaneous agent providers — outside this phase/milestone.
- All live CLI, browser, OS-process, endurance, and human visual/accessibility UAT — preserved for the user-directed milestone-end gate.

</deferred>

---

*Phase: 61-delegation-ux-sw-eviction-persistence*
*Context gathered: 2026-07-14 via autonomous assumptions mode with recommended defaults*
