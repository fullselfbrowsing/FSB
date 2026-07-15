---
phase: 61-delegation-ux-sw-eviction-persistence
reviewed: 2026-07-15T16:46:09Z
depth: deep
files_reviewed: 48
files_reviewed_list:
  - extension/ai/engine-config.js
  - extension/background.js
  - extension/config/config.js
  - extension/manifest.json
  - extension/ui/delegation-feed.js
  - extension/ui/options.js
  - extension/ui/sidepanel.css
  - extension/ui/sidepanel.html
  - extension/ui/sidepanel.js
  - extension/utils/agent-registry.js
  - extension/utils/delegation-consent.js
  - extension/utils/delegation-controller.js
  - extension/utils/delegation-event-store.js
  - extension/utils/delegation-preflight.js
  - extension/ws/mcp-bridge-client.js
  - extension/ws/mcp-tool-dispatcher.js
  - mcp/src/agent-providers/runtime-files.ts
  - mcp/src/agent-providers/spawn-supervisor.ts
  - mcp/src/agent-scope.ts
  - mcp/src/bridge.ts
  - package.json
  - scripts/run-phase60-full-tests.mjs
  - tests/agent-bridge-routes.test.js
  - tests/agent-grace.test.js
  - tests/agent-registry.test.js
  - tests/agent-scope.test.js
  - tests/delegation-consent.test.js
  - tests/delegation-controller.test.js
  - tests/delegation-event-store.test.js
  - tests/delegation-phase-contract.test.js
  - tests/delegation-routing.test.js
  - tests/delegation-sidepanel-ui.test.js
  - tests/fixtures/delegation-events.js
  - tests/lattice-provider-bridge-smoke.test.js
  - tests/mcp-agent-orphan-recovery.test.js
  - tests/mcp-bridge-background-dispatch.test.js
  - tests/mcp-bridge-client-lifecycle.test.js
  - tests/mcp-client-identity-integration.test.js
  - tests/mcp-client-merged-view.test.js
  - tests/mcp-reverse-channel-contract.test.js
  - tests/mcp-spawn-supervisor.test.js
  - tests/mcp-version-parity.test.js
  - tests/open-tab-background-default.test.js
  - tests/owner-chip.test.js
  - tests/phase60-full-tests-harness.test.js
  - tests/provider-parity.test.js
  - tests/providers-panel-logic.test.js
  - tests/sidepanel-tab-aware-smoke.test.js
findings:
  critical: 2
  warning: 7
  info: 1
  total: 10
status: issues_found
---

# Phase 61: Code Review Report

**Reviewed:** 2026-07-15T16:46:09Z  
**Depth:** deep  
**Files Reviewed:** 48  
**Status:** issues_found

## Summary

Phase 61 has two critical lifecycle-authority failures: the long-running start request is still governed by a 30-second transport timeout that does not cancel the daemon run, and a streamed result releases browser ownership before the supervisor's final cleanup has confirmed process-tree settlement. Seven additional warnings affect eviction-safe watchdogs, heartbeat enforcement, release failure handling, ledger recovery, start-event persistence, POSIX state confirmation, and side-panel binding durability. One metadata inconsistency leaves the declared Chrome floor split between 116 and 88.

The focused automated tests and TypeScript typecheck pass, but the current tests do not exercise these delayed/failure paths. Live browser, CLI, endurance, process, and restart UAT remains intentionally deferred to the milestone-end gate and is not counted as a review defect.

## Critical Findings

### CR-01 — A normal delegation outlives the client request timeout, then releases ownership without cancelling the still-running daemon process

**Evidence:** `extension/ws/mcp-bridge-client.js:17-19` sets the generic request default to 30 seconds and caps every override at 120 seconds. `extension/ws/mcp-bridge-client.js:615-623` deletes the local pending request and rejects on timeout, but sends no cancel/abort frame; later events and the response are silently ignored because no pending entry exists (`extension/ws/mcp-bridge-client.js:646-665`). The background starts `delegate.start` without any timeout override (`extension/background.js:1551-1566`). On the daemon side, `delegate.start` awaits the run's terminal promise (`mcp/src/agent-providers/spawn-supervisor.ts:747-808`), and the bridge does not send `ext:response` until that handler resolves (`mcp/src/bridge.ts:1003-1015`). The background then collapses `ext_request_timeout` and `bridge_topology_changed` to `agent_failed` (`extension/background.js:1435-1455`) and asserts `treeSettled: true` for every code except the literal `tree_unsettled` (`extension/background.js:1463-1474`). That terminal path skips cancellation and releases ownership (`extension/utils/delegation-controller.js:612-636`).

**Impact:** Any valid run lasting more than 30 seconds can be shown as failed and have its delegated tabs released while the Claude process and MCP tool authority continue running. This violates the 45-minute run contract and the requirement that release follow confirmed tree settlement.

**Required fix:** Give `delegate.start` a dedicated long-lived protocol rather than the generic request timer: either keep the route pending through the 45-minute ceiling plus cleanup, or split acceptance from completion and track completion by delegation id. A timeout/topology loss must issue exact-id cancellation and await a confirmed `cancelled`/`already_terminal` response (or remain `tree_unsettled`) before releasing ownership. Never translate an unconfirmed transport error into `treeSettled: true`. Add a fake-clock integration test that advances beyond 30 and 120 seconds, proves the run remains connected, then proves timeout/route loss cannot release tabs until cancellation settlement is confirmed.

### CR-02 — A streamed `result` terminalizes the controller before supervisor cleanup confirms the process tree is gone

**Evidence:** The supervisor publishes the normalized result as soon as parsing finishes (`mcp/src/agent-providers/spawn-supervisor.ts:1041-1049`), while successful execution performs `terminateAndCleanup` and only then resolves the final terminal result (`mcp/src/agent-providers/spawn-supervisor.ts:906-920`). The extension treats any canonical `result` as terminal and explicitly disables cancellation (`extension/utils/delegation-controller.js:839-857`); `_settle` immediately releases the delegation's tabs (`extension/utils/delegation-controller.js:633-636`). When the later final response arrives, the background returns early because the controller is already terminal (`extension/background.js:1447-1450`).

**Impact:** The ordinary successful-result path can release browser ownership during the interval in which the supervisor still owns or is cleaning the process tree. A cleanup failure arriving afterward cannot restore ownership or change the already-persisted success, so the UI can claim completion while executable authority remains unsettled.

**Required fix:** Persist and render the result payload as nonterminal summary data, but do not mark the run terminal or release ownership until the final `delegate.start` response proves cleanup completed. Alternatively, withhold the result event until cleanup has settled and publish it together with explicit tree-settled evidence. Add an integration test that delays `terminateAndCleanup` after result emission and asserts the controller remains active and retains ownership until the final response; add the cleanup-failure variant and assert `tree_unsettled` with no release.

## Warning Findings

### WR-01 — Service-worker eviction and reconnect reset the 45-minute and silence watchdog budgets

**Evidence:** Records carry `startedAt` and `lastEventAt` only in memory (`extension/utils/delegation-controller.js:267-300`). Hydration reconstructs entries and state but restores neither timestamp nor either timer (`extension/utils/delegation-controller.js:697-745`). `_armWallClock` and `_refreshSilence` always schedule a full new duration from the current moment (`extension/utils/delegation-controller.js:438-453`). Reconciliation clears both timers on disconnected/missing status (`extension/utils/delegation-controller.js:900-906`, `extension/utils/delegation-controller.js:925-949`) and later arms fresh full durations on reconnection (`extension/utils/delegation-controller.js:990-1006`).

**Impact:** Worker eviction or repeated bridge flapping extends a run beyond the promised wall-clock ceiling and can indefinitely postpone event-silence cancellation.

**Required fix:** Persist absolute `startedAt` and latest-event timestamps (or derive them from a guaranteed persisted start row and latest ledger row), then schedule only the remaining budget after hydration/reconnect. The wall-clock deadline must continue across disconnects; define and persist any intentional silence-pausing policy rather than resetting it. Add fake-clock eviction and repeated reconnect tests that prove the original absolute deadline wins.

### WR-02 — Three missed heartbeat acknowledgements neither transition the controller nor block new delegated starts

**Evidence:** The heartbeat stores its status only in the nested `delegationConnection` snapshot (`extension/ws/mcp-bridge-client.js:96-113`). On the third miss it mutates `_delegationConnectionState` and persists bridge state, but emits no controller callback or runtime update (`extension/ws/mcp-bridge-client.js:882-919`). Delegation preflight checks only top-level `bridgeState.connected` and `bridgeState.status` plus pairing (`extension/utils/delegation-preflight.js:88-94`), ignoring `bridgeState.delegationConnection.state`. The background passes that unmodified state into preflight (`extension/background.js:1286-1303`), while reconciliation is invoked only by explicit boot/start/snapshot flows (`extension/background.js:1244-1273`, `extension/background.js:1586-1589`, `extension/background.js:1660-1665`, `extension/background.js:1787-1795`).

**Impact:** With the WebSocket still open, three missing nonce acknowledgements leave top-level connection state `connected`; the UI can stay live and a new `delegate.start` can pass preflight despite the required delegation channel being disconnected.

**Required fix:** Expose a delegation-connection observer from the bridge client. On the third miss, persist and reconcile every active controller record to `disconnected`, fan out the committed state, and make preflight require `delegationConnection.state === 'connected'` for agent starts. Add a fake-timer test with an open socket and three missing pongs that proves the fourth send is blocked and the active snapshot/UI is disconnected.

### WR-03 — Registry release failures are converted into successful terminal settlement

**Evidence:** `releaseDelegation` returns structured failures for mapping mismatch, ownership mismatch, and persistence failure (`extension/utils/agent-registry.js:865-874`, `extension/utils/agent-registry.js:914-916`, `extension/utils/agent-registry.js:939-949`). `_releaseOnce` ignores `result.ok` and normalizes every such return to a zero-count release (`extension/utils/delegation-controller.js:568-584`). `_settle` catches only thrown errors, persists the requested terminal code, and returns `ok: true` even when release returned `{ok:false}` (`extension/utils/delegation-controller.js:633-691`).

**Impact:** Stop or completion can report success with zero released tabs while the delegation-to-agent mapping and ownership are still live, contradicting both the exact cleanup and typed fail-closed requirements.

**Required fix:** Require `release.result.ok === true` before terminal success. Preserve ownership on any structured failure, persist a distinct typed cleanup diagnostic such as mapping mismatch or release-persistence failure, and retry/reconcile without claiming completion. Add controller tests for all three `{ok:false}` branches and assert no successful Stop/completed response is emitted.

### WR-04 — Persistence-failure cancellation leaves a nonterminal ledger that service-worker wake can resurrect

**Evidence:** `_failPersistence` cancels, releases, and sets only an in-memory terminal object (`extension/utils/delegation-controller.js:589-609`); it never calls `eventStore.markTerminal` and never emits a persisted terminal update. `hydrateNonterminal` restores every stored envelope whose `terminal` flag is still false (`extension/utils/delegation-event-store.js:686-703`). The existing failure test explicitly expects no subscriber delivery and covers a first-write rejection only (`tests/delegation-controller.test.js:349-387`), not failure after a previously persisted row followed by module reload.

**Impact:** If a later append exceeds quota or fails after one or more rows were committed, the daemon is cancelled in memory but the stored ledger remains nonterminal. The next worker wake restores it as an active/disconnected delegation and retains a heartbeat owner for a run that was already cancelled; the live panel also receives no terminal transition before eviction.

**Required fix:** Reserve terminal-marker headroom in the ledger budget. After confirmed cancellation, persist a compact terminal marker (or an explicit quarantined tombstone) before releasing heartbeat/generation state, and fan out the typed failure only after that marker commits. If session storage itself is unavailable, keep cleanup fail-closed and retry/quarantine rather than leaving a ledger eligible for normal hydration. Add a regression with one persisted entry, forced append failure, module reload, and assertions that hydration does not restore the run.

### WR-05 — `delegation.started` is broadcast without a write-before-fanout ledger commit

**Evidence:** The event store explicitly supports mapping `delegation.started` to an `init` row (`extension/utils/delegation-event-store.js:282-287`). The bridge observer handles that event by calling only `controller.start` (`extension/background.js:1711-1725`). `controller.start` creates the record, arms timers, and calls `_emit` without any `appendBeforeFanout` operation (`extension/utils/delegation-controller.js:767-805`).

**Impact:** The first supervisor event violates the one-event/one-row and write-before-fanout invariants. Eviction after the accepted start update but before the first normalized provider event loses the delivered start state entirely, and a run with no later init event has no canonical start row.

**Required fix:** Make start asynchronous and append the canonical `delegation.started`/`init` entry, including profile context, before publishing or acknowledging acceptance. If that commit fails, cancel the server-minted delegation before returning acceptance. Add a deferred-write test proving neither the runtime subscriber nor start response settles before the start row is durable, plus an eviction test in the start-to-first-provider-event gap.

### WR-06 — Hold and resume use a single immediate post-signal process-state read

**Evidence:** `confirmProcessState` performs one inspector read and one process-group status read (`mcp/src/agent-providers/spawn-supervisor.ts:1304-1327`). `signalAndConfirm` sends `SIGSTOP`/`SIGCONT` and immediately invokes that one-shot confirmation (`mcp/src/agent-providers/spawn-supervisor.ts:1329-1348`).

**Impact:** POSIX signal delivery and observable process state are asynchronous. A healthy process group can still appear running immediately after `SIGSTOP` (or stopped immediately after `SIGCONT`), causing false `tree_unsettled`, unnecessary cancellation, and loss of an otherwise valid run.

**Required fix:** Poll with the injected monotonic clock/wait dependency for a short bounded transition grace, revalidating pid/group identity on every attempt, and fail closed only when the deadline expires or identity changes. Add delayed-inspection tests for both hold and resume, plus a never-transitions timeout case.

### WR-07 — The side panel ignores failure to persist the conversation-to-delegation binding

**Evidence:** `_writeDelegationConversationBinding` converts every session-storage error to `false` (`extension/ui/sidepanel.js:716-743`). After the daemon accepts a run, `_beginDelegationStart` awaits but ignores that boolean (`extension/ui/sidepanel.js:1672-1687`) and proceeds to clear the composer and render the run (`extension/ui/sidepanel.js:1696-1707`). Reopen/hydration can locate a delegation only through that stored binding (`extension/ui/sidepanel.js:701-707`, `extension/ui/sidepanel.js:940-949`); a null id deliberately asks the background for no snapshot (`extension/background.js:1651-1661`).

**Impact:** A storage failure can leave a live accepted delegation with no route back from its conversation after panel reload, while the UI has already consumed the user's message and claimed that the run started.

**Required fix:** Treat the binding write as part of start commit. If it returns false or no valid conversation id can be obtained, issue exact-id Stop/cancellation, retain the composer/message, and show a blocking persistence error; render the accepted run only after the binding is durable. Add storage-rejection and reload tests proving there is no hidden active delegation.

## Info Finding

### IN-01 — Chrome minimum-version metadata disagrees with the Phase 61 manifest floor

**Evidence:** The extension manifest now requires Chrome 116 (`extension/manifest.json:1-5`), while package metadata still advertises Chrome 88 in both `engines.chrome` and `config.min_chrome_version` (`package.json:72-75`, `package.json:115-118`).

**Impact:** Tooling or documentation that reads package metadata can claim support for browsers that the installable extension rejects.

**Required fix:** Update both package fields to the Chrome 116 floor and extend the existing version-parity test to assert all three declarations agree.

## Focused Verification

- `./mcp/node_modules/.bin/tsc -p mcp/tsconfig.json --noEmit` — passed.
- Twenty-five focused Phase 61 Node test files passed, including delegation routing/consent/store/controller/UI, bridge lifecycle/reverse-channel/background dispatch, spawn supervision/orphan recovery, registry/scope/routes/grace, provider/version parity, client identity/merged view, ownership/open-tab, and harness smoke coverage.
- No live browser, authenticated CLI, 45-minute endurance, real POSIX, daemon-restart, or visual/accessibility UAT was run; those checks remain deferred to the milestone-end UAT gate by instruction.

## Recommended Fix Order

1. Separate long-lived delegation completion from the 30-second transport timeout and make every unconfirmed transport failure retain ownership.
2. Move terminal/release authority from streamed `result` to the supervisor's post-cleanup final response.
3. Repair release-result handling and persistence-failure tombstoning before addressing recovery/UI behavior.
4. Persist absolute watchdog/start state and wire heartbeat miss transitions into controller/preflight.
5. Make the start row and conversation binding durable commit points, then add bounded hold/resume confirmation polling.
6. Align Chrome metadata and rerun focused tests, the complete root suite, code review, and the deferred milestone-end UAT group.

---

_Reviewed: 2026-07-15T16:46:09Z_  
_Reviewer: Codex (`gsd-code-reviewer`)_  
_Depth: deep_
