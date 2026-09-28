# Phase 61: Delegation UX & SW-Eviction Persistence - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `61-CONTEXT.md`; this log preserves the alternatives considered.

**Date:** 2026-07-14
**Phase:** 61-delegation-ux-sw-eviction-persistence
**Mode:** Assumptions (`--auto`); recommended defaults selected under the user's instruction to continue autonomously and defer live UAT
**Areas discussed:** delegated routing and consent, event persistence/feed, exact ownership and control transfer, heartbeat/offline behavior, restart classification, verification

---

## Delegated Routing and Consent

| Option | Description | Selected |
|--------|-------------|----------|
| Background-authoritative branch | Read validated saved provider kind, preflight/consent, and enter a separate delegated controller before any legacy session or reasoning-loop work. | ✓ |
| Side-panel-only branch | Let UI selection decide and pass a trusted boolean to the background. | |
| Adapt the legacy loop | Start `runAgentLoop` and invoke the external CLI as a nested provider. | |

**User's choice:** Auto-selected recommended option: background-authoritative branch.
**Notes:** The current config loader omits the saved agent-provider keys, and a UI-only consent flag would be replayable. API-kind behavior remains unchanged.

---

## Offline and Consent Ordering

| Option | Description | Selected |
|--------|-------------|----------|
| Preflight first, mutate after acknowledgement | Keep composer/user history untouched until readiness and consent pass and delegation start is acknowledged. | ✓ |
| Optimistic chat row | Append and clear immediately, then decorate the row if the daemon is offline. | |
| Queue for reconnect | Save the task and spawn automatically when the daemon returns. | |

**User's choice:** Auto-selected recommended option: preflight first.
**Notes:** LIFE-03 explicitly prohibits enqueueing and optimistic display. Automatic later spawn would also violate fresh per-run consent.

---

## Event Persistence and Feed Model

| Option | Description | Selected |
|--------|-------------|----------|
| Serialized provider-neutral ledger | Persist one bounded sequence entry per normalized event before fanout; hydrate by exact sequence after worker wake. | ✓ |
| Persist rendered HTML | Store side-panel card markup and replay it after wake. | |
| Rebuild from chat/local logs | Keep only messages and infer tool progress after restart. | |

**User's choice:** Auto-selected recommended option: serialized provider-neutral ledger.
**Notes:** Raw Claude JSON and rendered DOM would couple storage to one provider/UI version. A compact projection is required to stay inside the 10 MB session quota without dropping events.

---

## Delegation-to-Agent Binding, Take Control, and Stop

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit binding plus bounded supervisor hold | Thread the daemon delegation id through MCP registration, pause the verified supported process group, escrow exact ownership during human control, and resume or cancel deterministically. | ✓ |
| Extension gate only | Release ownership and reject/retry incoming MCP tools while the CLI keeps running. | |
| Cancel on Take Control | Treat human takeover as Stop and offer a new independent run later. | |

**User's choice:** Auto-selected recommended option: explicit binding plus bounded supervisor hold.
**Notes:** Phase 60 already injects `FSB_DELEGATION_ID`, but it is not consumed. Existing `releaseTab` deletes an empty agent record, and an extension-only rejection is not a real pause. POSIX hold is limited to the platforms Phase 60 currently permits for production spawn; unsupported platforms fail closed.

---

## Daemon Restart Classification

| Option | Description | Selected |
|--------|-------------|----------|
| Generation plus recovery disposition | Persist a non-secret daemon generation and retain bounded startup orphan-recovery outcomes keyed by delegation id. | ✓ |
| Every reconnect means restart | Mark every persisted active run as `daemon_restart_lost_run` when a new socket appears. | |
| Generic disconnect only | Never distinguish a restarted daemon from transient topology loss. | |

**User's choice:** Auto-selected recommended option: generation plus recovery disposition.
**Notes:** Socket closure is ambiguous; restart-specific wording requires affirmative evidence. Execution is never re-adopted.

---

## Heartbeat and Worker-Eviction Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Active 20-second acknowledged loop | One ref-counted timer, matching pongs, three consecutive misses, persisted disconnect state, and exact feed hydration after forced worker eviction. | ✓ |
| Keep current 25-second fire-and-forget ping | Change no bridge state and rely on socket close detection. | |
| Always-on high-frequency timer | Keep the worker alive even when no delegation is active. | |

**User's choice:** Auto-selected recommended option: active 20-second acknowledged loop.
**Notes:** The current client ignores pongs. Feed recovery does not mean process re-adoption; Phase 60 route-loss cancellation remains authoritative.

---

## External Research Applied

- **Chrome WebSocket worker lifetime:** Official Chrome extension documentation says Chrome 116+ counts WebSocket send/receive activity inside the 30-second worker activity window and demonstrates a 20-second keepalive. This raised the heartbeat assumption to Confident and supports `minimum_chrome_version: 116`. Source: `https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets`.
- **Session storage:** Official Chrome documentation says `chrome.storage.session` is asynchronous, memory-only, available to the service worker, trusted-context-only by default, capped at 10 MB, and cleared on extension disable/reload/update and browser restart. This confirms SW-eviction suitability but requires compact bounded entries and an explicit no-disk-durability promise. Source: `https://developer.chrome.com/docs/extensions/reference/api/storage`.
- **Background tabs and activation:** Official Tabs API documentation confirms `tabs.create({ active: false })` creates without activation and `tabs.onActivated` supplies exact tab/window identity. Source: `https://developer.chrome.com/docs/extensions/reference/api/tabs`.
- **Process hold portability:** Official Node documentation confirms POSIX signal delivery and that Windows lacks POSIX signal semantics; current production spawning is already limited to Linux/macOS. This rules out pretending one portable hold primitive exists. Sources: `https://nodejs.org/api/process.html` and `https://nodejs.org/api/child_process.html`.

## the agent's Discretion

- Exact module/storage names, bounded ledger sizes, watchdogs, and hold grace duration.
- Card microcopy and compact rendering of non-card assistant/delta events.
- Exact additive generation/status transport, subject to affirmative restart evidence and frozen-wire compatibility.

## Deferred Ideas

- Compatibility/doctor expansion remains Phase 62; native wake remains Phase 63.
- OpenCode/Codex remain Phases 64/65 and must reuse the provider-neutral contract.
- Disk-backed history, browser-restart continuation, chat-mode resume, and remote delegation remain out of scope.
- Every live browser/CLI/OS/endurance/human check remains queued for the milestone-end UAT gate.
