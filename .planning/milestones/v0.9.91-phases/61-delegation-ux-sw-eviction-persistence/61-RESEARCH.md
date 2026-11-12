# Phase 61 Research: Delegation UX & SW-Eviction Persistence

**Researched:** 2026-07-14
**Scope:** Extension-side delegated routing, consent, event persistence, side-panel UX, heartbeat, tab ownership handoff, daemon lifecycle evidence, and exact cleanup
**Live boundary:** Real CLI streaming, Chrome focus behavior, forced live worker eviction, 45-minute endurance, real process suspension, daemon restart, and human visual/accessibility checks remain pending for the single milestone-end UAT gate

## User Constraints

### Locked Decisions

- `extension/background.js` is the authoritative provider-kind branch. It must read and validate the saved `providerKind` and `agentProviderId`; only a supported `agent` provider enters delegated mode. The seven-provider API/BYOK path remains compatible.
- `EXECUTION_MODES.delegated` is a fifth mode with `uiFeedbackChannel: 'popup-sidepanel'`, `animatedHighlights: true`, wall-clock and event-silence watchdogs, and no iteration limit. Delegated sends branch before internal-session allocation and never enter `runAgentLoop`.
- Delegated start is preflight-first: bridge readiness, pairing, provider support, and consent all settle before the message is appended, the composer is cleared, running state is created, a tab is opened, or `delegate.start` is sent.
- Consent is rendered in the side panel but enforced by the background. Durable per-provider trust defaults false in `chrome.storage.local`; otherwise a one-use challenge in `chrome.storage.session` is consumed atomically. A caller-supplied boolean is not spawn authority.
- A background-owned delegation controller is the only lifecycle authority. The side panel hydrates, subscribes, renders, and sends explicit commands; it does not infer or independently settle a run.
- Every normalized supervisor event becomes exactly one bounded, redacted, monotonically sequenced ledger entry. Its `chrome.storage.session` write completes before UI fanout. Storage, quota, serialization, or observer failure cancels/fails the run closed rather than dropping an entry.
- Rehydration renders the canonical ledger in order and then subscribes after its last exact `(delegationId, sequence)` identity. It neither reconstructs rows from chat history nor replays announcements.
- The daemon-minted `FSB_DELEGATION_ID` is carried through `agent:register`, validated/stamped on the extension-minted agent record, and used for an exact delegation-to-agent mapping. A client may not choose that identifier.
- Delegated work opens a background tab through the existing MCP `open_tab` default. It must not bind or navigate the submitting active tab merely because the side panel originated the task.
- Take Control is explicit. It appears only when the active tab is owned by the active delegation. The supervisor holds the identity-verified process group on supported POSIX platforms; the registry converts active ownership into a sealed delegation-scoped lease. Unsupported platforms fail closed.
- Resume restores only the same live delegation and unchanged held tabs, then resumes the process. Conflict, expiry, missing mapping, or restoration failure cancels the delegation and leaves unrelated ownership untouched.
- Stop is idempotent: cancel the exact daemon-minted delegation, wait for confirmed process-tree settlement, release only tabs belonging to the exact delegation/agent mapping, and report `Agent stopped, N tab(s) released` after both operations settle.
- The bridge uses one ref-counted 20-second acknowledged keepalive while any delegation is active. A matching pong resets misses; three consecutive misses persist `daemon:disconnected`, block new delegated sends, and surface the honest fallback.
- Chrome 116 is the manifest minimum. `chrome.storage.session` recovery is promised only across worker eviction, not extension reload/update/disable or browser restart.
- Disconnect alone is not daemon-restart evidence. The daemon exposes a non-secret generation plus bounded recovery disposition. Only matching evidence produces `daemon_restart_lost_run`; ordinary route loss remains a separate truthful outcome.
- Offline and disconnected UI shows the exact local doctor command and an extension-local setup action. It never executes a shell, reads terminal output, restarts the daemon, uses a custom URL scheme, or adds `nativeMessaging`.
- Agent cost copy is `Included in your subscription`; it never fabricates USD. API provider cost behavior remains unchanged.
- Existing MCP frames, exact Phase 59 transport errors, Phase 60 five-method adapter interface, seven API providers, and legacy side-panel automation stay compatible. Lifecycle/status additions are strict, additive contracts.
- Automated/source verification and clean code/security review remain blocking. Every genuine live/browser/CLI/OS/human UAT item is preserved without a fabricated pass and deferred to one milestone-end gate.

### Approved UI Contract

- Reuse `extension/shared/fsb-ui-core.css`, the current side-panel layout, typography, status patterns, and responsive width. Add no UI framework or dependency.
- Use one canonical feed renderer for hydrated and live entries; suppress live-region announcements during hydration.
- Provide visible-text actions for consent, trust, Stop, Take Control, Resume, doctor copy, setup, retry/new task, and tool breakdown. Color or icons may not carry meaning alone.
- Use the exact headings, bodies, CTAs, focus behavior, and state matrix in `61-UI-SPEC.md`, including unpaired, unsupported, generic failure, and resume-restoration failure copy.
- The side panel has one polite progress live region; offline/disconnected use `role="alert"`; Stop shares one busy state; reduced motion removes nonessential transitions.

### Explicitly Deferred or Out of Scope

- No sixth adapter method, embedded agent SDK, native-messaging host/wake path, new port, remote/mobile delegation, provider compatibility matrix, expanded Phase 62 doctor, OpenCode/Codex adapter, chat continuation, disk-durable event log, or silent process re-adoption.
- The event ledger is provider-neutral and presentation-bounded; it is not a raw Claude transcript, prompt archive, full page-content log, or diagnostic secret store.
- Worker wake restores exact delivered feed and reconciles current lifecycle evidence. It does not replay the task or promise the process survived daemon/browser restart.

## Research Summary

Phase 61 is safest as three closed layers joined by explicit contracts:

1. The daemon supervisor gains strict lifecycle/status operations and generation/recovery evidence while retaining ownership of OS process policy.
2. A classic-script extension controller owns preflight, consent authority, event projection/persistence, heartbeat state, delegation-to-agent correlation, ownership leases, and terminal settlement.
3. The side panel consumes controller snapshots/events and renders the approved state machine without optimistic mutation.

The existing Phase 59 long-lived reverse request is deliberately held open until the Phase 60 run settles. That makes `sendExtRequest(..., { onEvent })` the correct event seam, but its observer is currently synchronous and exceptions are ignored. The bridge must serialize observer promises per correlation and delay the final response behind them. This is the critical write-before-fanout link: controller persistence rejects -> observer rejects -> correlated start rejects/cancels -> no unpersisted UI event can masquerade as delivered history.

The existing `AgentRegistry` already persists to `chrome.storage.session`, mints ownership tokens, reverse-maps tabs, and stages bridge-connection release. Take Control must not call ordinary `releaseTab`, because that deletes the agent when its last active tab drains. It needs a separate sealed hold lease that removes active automation authority while retaining an unclaimable reservation for exact resume/cancel cleanup.

No new runtime dependency is needed. Tests can use the repository's dependency-free Node assertions, VM-loaded classic scripts, injected Chrome storage/tabs/runtime fakes, built TypeScript MCP modules, fake clocks, and fake child/process primitives.

## Current Integration Seams

### Provider routing and engine mode

- `extension/ai/engine-config.js` defines four modes and applies generic `maxIterations`, cost, and time overrides. The delegated entry must contain only `wallClockMs` and `eventSilenceMs` safety limits and must not inherit an iteration cap into delegated execution.
- `extension/config/config.js` defaults omit `providerKind` and `agentProviderId`, while `extension/ui/options.js` persists both. Background routing must explicitly load/validate them or extend the central loader with those exact fields.
- `extension/background.js::handleStartAutomation` currently performs active-tab lookup, legacy agent/session allocation, and eventually `runAgentLoop`. The delegated branch belongs before those mutations while preserving the side-panel-open user gesture ordering.
- `extension/ui/sidepanel.js::handleSendMessage` currently appends the user message and clears `chatInput` before the background response. The delegated path must first request a preflight/consent disposition and mutate chat only after accepted start authority.

### Reverse bridge and service-worker lifetime

- `extension/ws/mcp-bridge-client.js` already exposes `sendExtRequest`, typed Phase 59 offline/topology errors, pairing status, and a pending correlation record with `onEvent`.
- `_handleExtFrame` invokes `onEvent` synchronously and swallows exceptions. Replace this with a per-pending promise tail; each event appends to the tail, and final response resolution/rejection awaits the tail. An observer rejection settles the correlation as a typed domain failure and invokes cancellation once a delegation id is known.
- The existing `MCP_PING_INTERVAL_MS` is 25 seconds and `_handleMessage` discards `mcp:pong`. Active delegation needs a separate ref-counted 20-second acknowledged policy, bounded nonce/timestamp matching, a consecutive-miss counter, and state notifications. Preserve ordinary non-delegated connection behavior.
- Chrome's official guidance requires `minimum_chrome_version: "116"` and uses a message every 20 seconds to keep a WebSocket-backed extension service worker active.

### Registration, ownership, and exact cleanup

- Phase 60 already injects `FSB_DELEGATION_ID` into the spawned child's environment. `mcp/src/agent-scope.ts` constructs the first `agent:register` payload and is the narrow consumer seam: read the daemon-owned environment value once, validate it, and add an optional `delegationId` sidecar.
- `extension/ws/mcp-tool-dispatcher.js::handleAgentRegisterRoute` mints the authoritative agent id and stamps connection/client metadata. It should accept only a closed delegation-id shape on the registration sidecar, stamp it on the record, and notify the controller of the exact mapping.
- `extension/utils/agent-registry.js` exposes `getAgentTabs`, `findAgentByTabId`, `releaseTab`, and `releaseAgent`, plus storage hydration. Add delegation metadata and sealed hold-lease operations under the same registry lock/persistence envelope rather than keeping a second ownership truth elsewhere.
- `mcp-tool-dispatcher.js` already defaults `open_tab` to `active: false`; tests should pin this and prove delegated start never binds the submitter's active tab.

### Supervisor lifecycle and restart evidence

- `mcp/src/agent-providers/spawn-supervisor.ts` strictly accepts `delegate.start` and `delegate.cancel`. Add closed supervisor-policy methods such as `delegate.hold`, `delegate.resume`, and `delegate.status`; do not expand `AgentProviderAdapter`.
- A hold signals the verified POSIX process group, records a bounded deadline, and acknowledges only after the process is known held. Resume applies only to that same active run. Hold expiry invokes normal cancellation and exact-once settlement.
- The supervisor's startup recovery already classifies/kills journaled orphans. Add a non-secret daemon generation and bounded lost-delegation disposition store. Generation is minted per serve authority; recovery lists only server-minted delegation ids and terminal classifications, never prompt/output/secrets.
- A status response should be exact-shape validated and sufficient for worker-wake reconciliation: current generation, active delegation ids/states, and bounded restart-loss dispositions. It must not expose PID, argv, environment, bridge credential, task, or raw provider output.

### Side-panel rendering

- `extension/ui/sidepanel.html` has a single chat surface, runner, status, composer, and icon-only Stop. Add a delegation run region and live announcer without duplicating lifecycle state.
- `extension/ui/sidepanel.js` already has tab-aware running state, runtime listeners, settings navigation, and message helpers. Add a provider-neutral view-model renderer in a small sibling module where practical; keep DOM rendering and background authority separated.
- `chrome.tabs.onActivated` belongs in the background/controller for authoritative exact-owned-tab state. The panel may also refresh its view on activation, but it may not infer ownership from displayed tab id alone.

## Recommended Architecture

### Extension modules

| Proposed file | Responsibility | Existing analog/pattern |
|---|---|---|
| `extension/utils/delegation-event-store.js` | Closed storage envelope, bounded redaction/projection, monotonic append queue, quota accounting, hydration, terminal compaction policy | `extension/utils/mcp-task-store.js`, `extension/utils/agent-registry.js` mutex/persistence |
| `extension/utils/delegation-consent.js` | Provider trust records, one-use session challenges, exact provider binding, atomic consume, no caller boolean authority | `extension/utils/consent-policy-store.js`, `extension/utils/consent-gate.js` |
| `extension/utils/delegation-controller.js` | Sole run state machine; preflight/start/event/hold/resume/stop/disconnect/wake reconciliation; runtime snapshots and notifications | `extension/utils/mcp-visual-session-lifecycle.js`, `extension/utils/trigger-lifecycle.js` |
| `extension/ui/delegation-feed.js` | Pure provider-neutral entry-to-view-model and DOM renderer; hydration announcement suppression | `extension/ui/sidepanel-message-log.js`, `extension/ui/owner-chip.js` |

Classic-script globals should be closed, non-enumerable where the repository expects that pattern, and loaded in dependency order: store/consent after redaction utilities and registry, controller after bridge/dispatcher availability, feed before `sidepanel.js`.

### Controller state machine

Use one explicit state rather than unrelated flags:

`idle -> preflighting -> awaiting_consent -> starting -> running -> holding -> held -> resuming -> stopping -> terminal`

Terminal codes include completed, failed, stopped, offline-before-start, unpaired, unsupported, consent-declined/expired, event-persistence-failed, daemon-disconnected, route-lost, hold-expired, resume-conflict, cleanup-mapping-missing, and `daemon_restart_lost_run`.

Each transition owns:

- exact allowed predecessor states;
- persisted state/ledger mutation;
- permitted outbound bridge operation;
- whether composer/running/feed UI may change;
- exact terminal cleanup path;
- one idempotency key/promise for racing Stop/result/disconnect/panel close.

Wall-clock and event-silence watchdogs live in the controller, not `runAgentLoop`. A received, durably persisted event advances the event-silence clock. Either expiry invokes the same exact cancel/settle path as Stop with a typed diagnostic.

### Ledger envelope and bounds

Use one versioned key per delegation, for example `fsbDelegation:v1:<delegationId>`, plus a small versioned index of current/recent ids. A ledger contains exact keys for version, delegation id, provider id, state, next sequence, generation, mapping metadata, bounded entries, and timestamps.

Recommended bounds for planning:

- at most 2,000 entries per delegation;
- at most 4 KiB serialized per entry;
- at most 6 MiB for all delegation ledgers, leaving margin inside Chrome's 10 MB session quota;
- tool names/error codes/session identifiers capped at 128-256 characters;
- argument summaries from a fixed allowlist, capped near 1 KiB, with full URLs stripped of query/fragment;
- no prompt, page text, credentials, raw tool results, raw Claude event, PID, argv, environment, pairing credential, or bridge secret.

The exact constants may be adjusted during planning, but tests must exercise boundary-1, boundary, boundary+1, cyclic/non-serializable input, storage rejection, and aggregate-quota rejection. Never evict an earlier delivered event from a nonterminal run to make room. Fail/cancel before fanout.

### Preflight and consent transaction

1. Side panel sends the unchanged draft to a read-only preflight action.
2. Background validates saved provider kind/id and asks bridge pairing/readiness/status without spawning or opening tabs.
3. Offline/unpaired/unsupported returns a closed UI disposition; the panel preserves the composer and shows exact approved copy.
4. Trusted provider proceeds; otherwise background mints a random one-use challenge bound to provider id, CLI label, draft digest, and short expiry in session storage.
5. Side panel renders consent. Allow sends the challenge id, not a boolean.
6. Background atomically validates and consumes the challenge, then calls controller start. Replay, mismatch, expiry, or concurrent consume fails.
7. Only an accepted `delegation.started`/server-minted id permits the panel to append the user message, clear the composer, and enter running UI.

Trust is a separate explicit durable action. It changes only the selected provider's trust record and must not auto-start a task or trust other providers.

### Event write-before-fanout sequence

1. Bridge receives validated `ext:event` for a live correlation.
2. `sendExtRequest` appends the observer call to its pending promise tail.
3. Controller validates delegation/session identity and projects exactly one provider-neutral entry.
4. Store serializes with the delegation append queue, assigns the next sequence, and awaits `chrome.storage.session.set`.
5. Controller updates its in-memory state/watchdog only after the write resolves.
6. Controller emits one runtime notification containing the persisted entry and sequence.
7. Bridge may process the next event. A final response waits for all prior observer operations.

This ordering must be proven with deferred storage promises, final-response races, rejected writes, and worker module reload/hydration fixtures.

### Hold, resume, and stop ordering

Take Control:

1. Revalidate active tab -> registry owner -> delegation mapping.
2. Request supervisor hold for the daemon-minted delegation.
3. After hold acknowledgement, atomically move all exact mapped tabs from active owner maps into a sealed hold lease.
4. Persist/emit held state and show Resume.

Resume:

1. Validate same delegation, unexpired lease, unchanged tab identities, no competing owner, and live supervisor status.
2. Atomically restore exact ownership tokens/records.
3. Request supervisor resume; if resume fails, remove active automation ownership again and cancel rather than leave a running unowned agent.
4. Persist/emit running state.

Stop/terminal cleanup:

1. Coalesce all callers on one settlement promise.
2. Cancel and wait for supervisor tree settlement unless already terminal.
3. Resolve the exact delegation-to-agent mapping; release only the registry tabs in that mapping, including held leases.
4. Persist the terminal entry and released count before UI fanout.
5. Decrement active heartbeat refcount and report the exact count.

Missing or inconsistent mapping records a typed failure and releases nothing outside the proven set.

## Architectural Responsibility Map

| Capability | Owning tier | Why / trust boundary |
|---|---|---|
| Provider-kind selection and validation | Extension background | Saved settings are extension state; UI input is untrusted |
| Consent challenge mint/consume and provider trust enforcement | Extension background/controller | Spawn authority cannot reside in DOM/UI booleans |
| CLI spawn, PID/process-group hold/resume/kill | MCP serve-owned supervisor | Only daemon owns OS process authority and journal identity |
| Adapter event parsing/normalization | MCP adapter/supervisor | Provider raw protocol must not reach extension/UI |
| Async reverse-correlation ordering | Extension bridge client | This is where event/final frames are serialized |
| Ledger projection, redaction, quota, sequence, persistence | Extension controller/store | Worker-survival state and fanout ordering share one authority |
| Delegation-to-agent correlation | AgentScope sidecar -> dispatcher -> registry/controller | Daemon id and extension agent id cross exactly one authenticated seam |
| Active tab ownership and sealed human-hold lease | Extension AgentRegistry | Existing token/agent/tab authority must remain singular |
| Take Control eligibility | Extension controller using tabs + registry | UI may display but cannot infer ownership |
| Feed/state rendering and focus/live-region behavior | Side panel | Presentation-only consumer of canonical snapshots/events |
| Heartbeat ping/pong tracking | Extension bridge client, activated by controller refcount | Socket owns frames; controller owns active-delegation policy |
| Daemon generation and orphan-recovery disposition | MCP serve-owned supervisor | Disconnect is insufficient evidence; daemon owns recovery facts |
| Worker-wake reconciliation | Extension controller against store + bridge status | Restores view/state without replay or process adoption |
| API/BYOK automation and USD cost | Existing background/runAgentLoop/cost tracker | Must remain outside delegated controller behavior |

Security-sensitive validation stays in the more trusted owner above. The side panel must not consume a challenge, choose an agent id/delegation id, decide a restart occurred, release ownership, or settle a run.

## Security Threat Model

| Threat | Severity | Required mitigation and automated evidence |
|---|---|---|
| T61-01 forged/replayed consent | Critical | Random provider/draft-bound one-use session challenge, atomic consume, expiry, trust default false; replay/mismatch/concurrency tests |
| T61-02 provider confusion/BYOK leakage | Critical | Exact saved kind/id validation, supported-agent allowlist, early branch, API parity/source pins; routing matrix proves no agent id reaches API builder |
| T61-03 unpersisted or reordered feed | High | Per-delegation append queue plus async observer tail and final barrier; deferred/rejected storage race tests |
| T61-04 ledger secret or quota leak | High | Allowlisted projection, deterministic redaction, per-entry/aggregate limits, no raw provider objects; canary and boundary tests |
| T61-05 delegation-id confused deputy | Critical | Server-minted id only, environment-to-registration sidecar, exact-shape validation, immutable mapping; forgery/mismatch tests |
| T61-06 cross-agent tab release | Critical | Exact delegation->agent->tab proof under registry lock; missing mapping releases zero; adversarial two-agent tests |
| T61-07 unsafe hold/resume race | Critical | Identity-verified supervisor hold, sealed lease, conflict/expiry cancellation, restoration ordering; fake-clock/race matrix |
| T61-08 process orphan on Stop/disconnect | Critical | Idempotent settlement joins kill then cleanup; no UI success before tree settlement; result/stop/route-loss race tests |
| T61-09 false daemon-restart claim | High | Generation plus recovery disposition required; disconnect/topology change alone uses separate code; generation matrix |
| T61-10 heartbeat spoof/timer multiplication | High | Matching bounded nonce, one timer per active refcount, three consecutive misses, stale pong ignored; fake-timer tests |
| T61-11 optimistic side-panel mutation | High | Preflight/consent acceptance before chat/composer/running mutation; offline/unpaired/denied DOM harness |
| T61-12 native/shell authority creep | Critical | Manifest/source gate forbids `nativeMessaging`, custom schemes, child process/UI execution claims; exact copy/source tests |
| T61-13 worker-wake ghost state | High | Hydrate nonterminal ledgers before subscribe, exact sequence dedupe, status reconciliation, no task replay; forced module-reload fixture |
| T61-14 XSS through event metadata | High | DOM text nodes/attributes only, bounded strings, no raw HTML for event fields; hostile metadata renderer tests |

No Critical or High automated evidence may be moved to live UAT. Live tests corroborate real environments; they do not replace deterministic enforcement tests.

## Requirement Implementation and Evidence

| Requirement | Implementation outcome | Primary automated evidence |
|---|---|---|
| UX-01 | Fifth delegated mode; validated agent routing before session allocation; no `runAgentLoop` | engine-config/routing source and VM tests; API parity |
| UX-02 | Canonical normalized init/tool/retry/result feed with exact sequence hydration | event store/controller tests and side-panel renderer DOM/source tests |
| UX-03 | Explicit exact-copy consent plus provider trust and one-use challenge enforcement | consent unit/concurrency tests and side-panel accessibility/copy pins |
| UX-04 | Stop -> confirmed supervisor settlement -> exact mapped tab release -> exact count row | controller/supervisor/registry two-agent race tests |
| UX-05 | Background tab, exact Take Control eligibility, POSIX hold, sealed lease, safe resume/expiry | open-tab pin, supervisor lifecycle tests, registry hold tests, activation harness |
| UX-06 | Honest agent subscription bucket and complete token/turn/duration/tool breakdown | ledger projection and summary renderer tests; API cost parity |
| LIFE-01 | Per-event awaited session write before fanout and exact eviction hydration | async observer ordering, storage rejection, forced module reload |
| LIFE-02 | Chrome 116; one 20-second acknowledged loop; three misses -> persisted disconnected fallback | manifest/source pin and fake-clock/pong lifecycle tests |
| LIFE-03 | Read-only offline/doctor/setup disposition with composer intact and zero start/message mutation | preflight harness, bridge offline tests, DOM/source assertions |
| LIFE-04 | Generation/recovery evidence kills/no re-adopt and renders typed restart-loss terminal | supervisor recovery status plus background reconciliation matrix |

## Validation Architecture

### Test infrastructure

- **Framework:** dependency-free Node `assert`, VM classic-script harnesses, fake `chrome` APIs, built TypeScript MCP modules, injected child/process/clock/storage dependencies.
- **Quick build:** `npm --prefix mcp run build` only for plans touching TypeScript.
- **Focused target:** each task's named test(s) should complete in under 30 seconds.
- **Wave gate:** all Phase 61 focused tests accumulated through that wave.
- **Phase gate:** the root full-suite harness used by Phase 60, including its temporary Phase 39 compatibility link and fail-safe cleanup; never stage that link.
- **Rules:** no watch mode, retry-to-green, live CLI/model/network dependency, snapshot refresh over a failure, or inferred live pass.

### Wave-0 test gaps

Create or extend these deterministic tests before/defer-in-the-same-task as their implementation:

- `tests/delegation-consent.test.js` — trust/challenge exactness, replay, mismatch, expiry, concurrency, offline no-mutation.
- `tests/delegation-event-store.test.js` — projection/redaction/bounds/quota, monotonic writes, write rejection, hydration, exact dedupe.
- `tests/delegation-controller.test.js` — state transitions, watchdogs, start/Stop/terminal races, mapping, worker wake reconciliation.
- `tests/delegation-routing.test.js` — API-vs-agent matrix, fifth mode, branch before legacy session and `runAgentLoop`, unsupported provider.
- `tests/delegation-sidepanel-ui.test.js` — approved copy/state matrix, visible controls, focus/live regions, hydration announcement suppression, no optimism.
- Extend `tests/mcp-bridge-client-lifecycle.test.js` — ordered async observer, final barrier, observer rejection, 20-second pong/miss/refcount lifecycle.
- Extend `tests/mcp-spawn-supervisor.test.js` — hold/resume/status strict schemas, POSIX signal ordering, expiry cancellation, exact-once races.
- Extend `tests/mcp-agent-orphan-recovery.test.js` or add `tests/mcp-delegation-recovery-status.test.js` — generation and bounded recovery disposition, no re-adoption, no disconnect inference.
- Extend `tests/agent-registry.test.js` — delegation stamp, sealed hold lease, restoration/conflict/expiry, exact cleanup and two-agent isolation.
- Extend `tests/agent-scope.test.js` and dispatcher contract tests — `FSB_DELEGATION_ID` optional sidecar, invalid/forged input rejection, minted-agent mapping.
- Extend manifest/source/parity gates for `minimum_chrome_version: "116"`, no `nativeMessaging`, additive message shapes, API provider parity, and paired source tripwires.

### Per-task validation candidates

| Candidate task | Fast automated command | Threat refs |
|---|---|---|
| Mode/routing/preflight/consent | `node tests/delegation-routing.test.js && node tests/delegation-consent.test.js && node tests/provider-parity.test.js` | T61-01, T61-02, T61-11 |
| Ledger projection and controller | `node tests/delegation-event-store.test.js && node tests/delegation-controller.test.js` | T61-03, T61-04, T61-13 |
| Bridge async observer/heartbeat | `node tests/mcp-bridge-client-lifecycle.test.js` | T61-03, T61-10 |
| Registration mapping/hold registry | `npm --prefix mcp run build && node tests/agent-scope.test.js && node tests/agent-registry.test.js` | T61-05, T61-06, T61-07 |
| Supervisor hold/resume/recovery status | `npm --prefix mcp run build && node tests/mcp-spawn-supervisor.test.js && node tests/mcp-agent-orphan-recovery.test.js` | T61-07, T61-08, T61-09 |
| Side-panel feed and no-optimism states | `node tests/delegation-sidepanel-ui.test.js && node tests/sidepanel-tab-aware-smoke.test.js` | T61-11, T61-14 |
| Manifest/parity/system integration | `node tests/mcp-version-parity.test.js && node tests/provider-parity.test.js && node tests/agent-provider-forbidden-flags.test.js` plus full root suite | T61-02, T61-12 |

The final `61-VALIDATION.md` should replace candidate task labels with exact plan/task ids after planning and mark existing versus Wave-0 test files truthfully.

### Manual-only verification preserved for milestone end

- Real Chrome side-panel consent/focus/keyboard/theme/responsive/reduced-motion and active-tab Take Control visibility.
- Genuine Claude Code stream through the local daemon into the side panel.
- Forced live MV3 service-worker eviction plus exact visible feed comparison.
- A 45-minute run under the 10 MB session quota.
- Real POSIX process hold/resume/expiry and unsupported-platform behavior.
- Real daemon crash/restart orphan kill plus visible restart-loss classification.
- Real Stop process-tree settlement and browser tab ownership release.

All remain `human_needed`; none may be recorded as passed from deterministic fixtures.

## Suggested Plan Decomposition

1. **Delegated routing and consent authority** — fifth mode, saved provider validation, preflight contract, one-use challenges/trust, early background branch, no optimistic panel mutation.
2. **Durable event ledger and controller core** — normalized projection, redaction/bounds, write-before-fanout state machine, watchdogs, hydration/subscription, storage failure closure.
3. **Async bridge and active heartbeat** — ordered observer promise tail/final barrier, 20-second acknowledged refcount loop, three-miss persisted disconnect, manifest minimum.
4. **Delegation-agent correlation and held ownership** — AgentScope sidecar, dispatcher stamping/mapping, registry sealed lease, exact cleanup primitives.
5. **Supervisor lifecycle and restart evidence** — strict hold/resume/status, POSIX policy, hold expiry, generation/recovery dispositions, no re-adoption.
6. **Background lifecycle integration** — controller start/event/hold/resume/stop/wake reconciliation, exact watchdog/cleanup ordering, provider compatibility.
7. **Side-panel delegation surface** — approved consent/feed/summary/offline/disconnected/restart states, actions, focus, live regions, responsive/reduced-motion styling.
8. **System regression and deferred-UAT ledger** — all focused slices, full root suite, source/security review, exact live checks recorded pending.

Plans should contain 2-3 tasks, avoid same-wave file overlap, and use concrete automated commands. Plans 1-3 can establish independent primitives, but background integration must depend on controller/bridge/mapping/supervisor contracts; UI integration must depend on the stable controller snapshot/event shape.

## Planning Traps

1. Returning an immediate start acknowledgement would close the Phase 59 event route; keep the start correlation pending through terminal settlement.
2. Treating panel `confirmed: true` as consent defeats the authority boundary; require a consumed challenge or durable provider trust.
3. Updating in-memory feed before storage resolves creates ghost rows after eviction.
4. Ordinary `releaseTab` cannot model human hold because it may delete the last-tab agent.
5. Resuming the OS process before ownership restoration can run an unowned browser driver; restoration must precede resume, with rollback/cancel on failure.
6. Releasing all current-agent tabs without a delegation mapping can affect unrelated MCP activity.
7. A socket close is not daemon restart proof; require generation and recovery disposition.
8. One ping timer per panel/delegation creates timer multiplication; keep one ref-counted bridge timer.
9. `unlimitedStorage` does not remove the `storage.session` 10 MB limit.
10. Rehydrating chat history as a feed invents events and can replay announcements; hydrate only the canonical ledger.
11. UI copy such as “restart daemon” or a custom command URL would overclaim extension authority before Phase 63.
12. Adding Phase 62/63 compatibility-matrix or native wake behavior is scope creep.

## Official References

- Chrome WebSocket service-worker lifetime and 20-second example: https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets
- Chrome storage areas, asynchronous semantics, session lifecycle, and 10 MB quota: https://developer.chrome.com/docs/extensions/reference/api/storage
- Chrome tabs creation/activation API: https://developer.chrome.com/docs/extensions/reference/api/tabs
- Node process signal semantics: https://nodejs.org/api/process.html
- Node child-process signal/platform semantics: https://nodejs.org/api/child_process.html

## Open Questions (RESOLVED)

1. **Where does delegated routing live?** RESOLVED: `extension/background.js`, before any legacy session allocation, using exact persisted provider fields.
2. **Does the side panel enforce consent?** RESOLVED: no; it renders a background-minted challenge. Background atomically consumes authority.
3. **Can final response overtake storage writes?** RESOLVED: no; `sendExtRequest` maintains an async observer tail and awaits it before final settlement.
4. **What survives worker eviction?** RESOLVED: the exact bounded session ledger and controller state. No task replay or process adoption occurs.
5. **How is a spawned run connected to extension ownership?** RESOLVED: daemon `FSB_DELEGATION_ID` -> optional `agent:register` sidecar -> extension-minted agent record -> controller mapping.
6. **How does Take Control preserve resumability?** RESOLVED: confirmed supervisor hold plus a registry-sealed delegation lease, not ordinary tab release.
7. **Is hold cross-platform in Phase 61?** RESOLVED: supported POSIX production platforms only; unsupported platforms fail closed and do not show a false successful hold.
8. **What proves daemon restart?** RESOLVED: non-secret generation plus a matching bounded recovery disposition. Disconnect alone never does.
9. **Who owns heartbeat timers?** RESOLVED: the bridge client owns one acknowledged timer, enabled through the controller's active-delegation refcount.
10. **Can offline UI launch doctor or restart serve?** RESOLVED: no. It copies the exact command and opens extension-local provider setup only.
11. **What are ledger limits?** RESOLVED for planning: fixed per-entry, per-run, and aggregate session bounds with fail-closed cancellation; exact constants are executor discretion within the tested 10 MB margin.
12. **When is live UAT run?** RESOLVED: once at the milestone end; every Phase 61 live check remains pending until then.

## Research Complete

The phase has a closed architecture, deterministic test seams for every Critical/High threat, and no unresolved planning question. Planning can proceed without an AI framework spec because Phase 61 extends an existing deterministic adapter/transport system rather than selecting or evaluating a new model framework.
