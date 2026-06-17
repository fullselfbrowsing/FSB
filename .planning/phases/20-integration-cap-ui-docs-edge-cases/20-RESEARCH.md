# Phase 20: Integration, Cap UI, Docs & Edge Cases - Research

**Researched:** 2026-06-17 [VERIFIED: codebase]
**Domain:** Chrome extension trigger runtime integration, options UI, MCP package/docs release readiness [VERIFIED: codebase]
**Confidence:** HIGH [VERIFIED: codebase]

<user_constraints>
## User Constraints (from CONTEXT.md)

All content in this section is copied from `.planning/phases/20-integration-cap-ui-docs-edge-cases/20-CONTEXT.md`; it is the locked phase context for planning. [VERIFIED: codebase]

### Locked Decisions

#### A. Trigger Cap UI

- **D-01:** Add a Trigger Concurrency card next to the existing Agent Concurrency card in `extension/ui/control_panel.html`. Clone the Agent Concurrency UI shape: number input, current value display, Reset to default button, range hint, validation hint, and live active counter. The storage key is already locked as `fsbTriggerCap` by `extension/utils/trigger-manager.js`.
- **D-02:** The UI cap range is the runtime range: default `8`, min `1`, max `64`. The control panel should clamp on input, re-clamp on load, and clamp on save, mirroring the existing `fsbAgentCap` defense-in-depth path in `extension/ui/options.js`.
- **D-03:** The active trigger counter reads `chrome.storage.session.fsbTriggerRegistry.records` and counts active trigger snapshots, primarily `status === 'armed'` plus active attention states already included by `list_triggers` defaults (`needs_attention`, `blocked`) if the UI copy says active watches. Terminal `fired`, `timed_out`, and `stopped` snapshots must not count as active cap usage.
- **D-04:** The control panel should subscribe to `chrome.storage.onChanged` for `session/fsbTriggerRegistry` and `local/fsbTriggerCap`, using the same debounce pattern as the agent cap counter. The counter is informational and best-effort; it must not throw into the options page.
- **D-05:** Add focused source-shape tests for the Trigger Concurrency card and `options.js` persistence, modeled on `tests/change-report-settings-ui.test.js` and the existing agent cap tests. Do not introduce a browser-driven UI test harness for this card.

#### B. Watch-Mode Conflict and Refresh-Poll Coalescing

- **D-06:** Enforce `TRIGGER_TAB_WATCH_CONFLICT` before arming a new trigger when the target tab already has an active trigger of the opposite watch mode (`live-observe` vs `refresh-poll`). This belongs in the background trigger arm path before `FsbTriggerManager.armTrigger(spec)` persists the new snapshot, because only background has target tab, owner, existing trigger registry, and watch-mode normalization in one place.
- **D-07:** Same-mode co-location remains allowed. Multiple `live-observe` triggers on one tab can keep their independent content observers; multiple `refresh-poll` triggers on one tab must coalesce reload work.
- **D-08:** Refresh-poll coalescing should happen in the refresh-poll alarm/tick layer, not in MCP. When several armed refresh-poll triggers on the same `target_tab_id` are due around the same cadence, the runtime should reload the tab once, then read/evaluate each due trigger from that single post-reload page state. The implementation may use a short per-tab in-flight promise/lock and due-trigger scan, as long as ownership validation still occurs per trigger before evaluation.
- **D-09:** The refresh-poll conflict/coalescing logic must preserve existing guarantees: reloads never activate or focus tabs, ownership is validated before reload/evaluation, blocked-page handling still writes attention state, and pulse reassertion only happens for snapshots that remain armed.
- **D-10:** Add tests in the existing trigger harness style: source/VM tests proving cross-mode conflict rejects before arm/persist/observer start, same-mode arms pass, co-located refresh-poll triggers share one `chrome.tabs.reload`, and other-tab refresh-poll triggers still reload separately.

#### C. Docs, Versioning, and Public MCP Surface

- **D-11:** Prepare the MCP package as `0.10.0` because the trigger family is an additive minor feature for the public MCP surface. Update `mcp/package.json`, `mcp/src/version.ts`, `mcp/server.json`, and version parity tests together. Do not change dependency versions in this phase.
- **D-12:** Update `mcp/CHANGELOG.md` with a `0.10.0` entry for the trigger family: `trigger`, `stop_trigger`, `get_trigger_status`, `list_triggers`, blocking default with 30s progress, detached mode, safety auto-detach, fire/timed_out outcomes, rearm_on_fire, owner/TTL cleanup, trigger cap UI, and anti-scope.
- **D-13:** Update `mcp/README.md` tool counts and add a Trigger Watchers section. It should explain when to choose `live-observe` vs `refresh-poll`, blocking vs detached behavior, rearm_on_fire and hysteresis, notify-only output, browser-must-be-open/session-only limits, restricted-tab/page-blocked behavior, and cancellation/status guidance.
- **D-14:** Update the root `README.md` only where it helps a new user understand the new MCP tool family and the local/browser-open limitation. Detailed tool semantics belong in `mcp/README.md`.
- **D-15:** Keep all tool schemas additive and shared-registry driven. Existing schema-lock/parity gates must stay green; docs must describe the already-implemented shared tool surface rather than inventing separate MCP-only semantics.

#### D. Live Browser UAT and Release Readiness

- **D-16:** Phase 20 owns the deferred human/browser evidence, especially Phase 16 live-observe UAT: live ticker no-reload fire, BF-cache re-arm timing, busy ticker frame budget, and pulse/reduced-motion visual behavior. Capture results in a Phase 20 UAT artifact and update prior deferred references rather than fabricating automated proof.
- **D-17:** Include end-to-end UAT for the newly composed trigger system: blocking fire return, detached poll/status, timeout, rearm_on_fire still armed, refresh-poll background focus retention, cross-mode conflict, coalesced reload, and owner disconnect cleanup.
- **D-18:** Release readiness means running and recording full automated gates after implementation: focused trigger suites, MCP build, MCP smoke, version parity, tool-definition parity, schema-lock, docs/source-shape tests, and root `npm test`. Any showcase crawler timestamp churn from `npm test` should be reverted unless the docs intentionally changed those artifacts.
- **D-19:** Final publish/tag actions remain user-gated. This phase can prepare package metadata and docs for `fsb-mcp-server@0.10.0`, but it should not run `npm publish`, push tags, or publish ClawHub artifacts without explicit user instruction.

### Claude's Discretion

- Exact copy and icon choice for the Trigger Concurrency card, as long as it sits in Advanced Settings near Agent Concurrency and uses the existing settings-card design.
- Exact coalescing window/algorithm for refresh-poll, as long as one due batch per tab produces one reload and per-trigger ownership/status semantics remain intact.
- Exact README section placement, as long as the public MCP README has a clear trigger watcher section and the root README remains a concise overview.

### Deferred Ideas (OUT OF SCOPE)

- Desktop/browser push notifications on fire remain `NOTIFY-FUTURE-01`.
- Auto-act-on-fire workflows remain `NOTIFY-FUTURE-02`.
- Cross-browser-restart auto-resume remains `SURV-FUTURE-01`.
- Whole-page visual/screenshot diffing and multi-element compound trigger conditions remain out of v0.11.0 scope.
</user_constraints>

## Summary

Phase 20 should be planned as a composition and release-readiness phase, not as a new trigger-feature phase; Phases 14-19 already provide trigger store/lifecycle, condition evaluation, watch modes, shared tool definitions, and MCP blocking/detached reporting. [VERIFIED: codebase] The implementation work should stay concentrated in `extension/ui/control_panel.html`, `extension/ui/options.js`, `extension/ui/cap-counter-helpers.js`, `extension/background.js`, focused trigger/UI tests, MCP docs, and MCP version metadata. [VERIFIED: codebase]

The highest-risk runtime changes are the background-owned cross-watch-mode conflict check and same-tab refresh-poll reload coalescing, because both touch trigger ownership, per-tab reload behavior, and alarm/tick sequencing. [VERIFIED: codebase] The planner should require tests that prove conflict rejection happens before persistence and observer/pulse start, and that same-tab refresh-poll batches reload once while still validating and evaluating each trigger independently. [VERIFIED: tests]

**Primary recommendation:** implement UI first, then conflict detection, then refresh-poll batching, then docs/version/UAT artifacts, with focused tests after each runtime seam and full MCP/version gates at the end. [VERIFIED: codebase]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Trigger cap UI | Browser / Client | Chrome storage | The options page renders and persists `fsbTriggerCap` through `chrome.storage.local`; runtime enforcement already reads the same key. [VERIFIED: codebase] |
| Active trigger count display | Browser / Client | Chrome session storage | The options page should read `chrome.storage.session.fsbTriggerRegistry.records` and render an informational count without changing trigger state. [VERIFIED: codebase] |
| Cross-watch-mode conflict | Extension Background / API-like dispatcher | Chrome session storage | `fsbTriggerHandleToolArm` has normalized watch mode, target tab, owner context, and access to the trigger registry before calling `FsbTriggerManager.armTrigger(spec)`. [VERIFIED: codebase] |
| Refresh-poll coalescing | Extension Background / Alarm tick layer | Content script read bridge | `fsbTriggerHandleRefreshPollAlarm` and `fsbTriggerRunRefreshPollTick` own reload/read/evaluate sequencing, while content scripts only perform per-selector reads. [VERIFIED: codebase] |
| MCP trigger docs and version metadata | MCP package | Extension shared tool definitions | The public MCP surface is registered in `mcp/src/tools/triggers.ts` and shared schemas live in `extension/ai/tool-definitions.js` plus `mcp/ai/tool-definitions.cjs`. [VERIFIED: codebase] |
| Human/browser UAT capture | Planning docs | Browser extension runtime | Deferred Phase 16 evidence is documented as human-needed planning state, not as automated proof. [VERIFIED: codebase] |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| Integration/composition | Compose TRIG/WATCH/EXTRACT/REPORT/LIFE/SURV/VIS/REG behavior delivered in Phases 14-19 without net-new requirements. [VERIFIED: codebase] | Required files and tests are mapped to UI, background runtime, MCP docs/version, and UAT gates in this research. [VERIFIED: codebase] |
</phase_requirements>

## Standard Stack

### Core

| Library / Runtime | Version | Purpose | Why Standard |
|-------------------|---------|---------|--------------|
| Chrome Extension MV3 APIs | Chrome `>=88.0.0` engine declared in root package metadata. [VERIFIED: package.json] | Storage, alarms, tabs reload, content-script messaging, and options UI integration. [VERIFIED: codebase] | The existing extension is built around Chrome extension APIs and the phase changes plug into those APIs. [VERIFIED: codebase] |
| Node.js | `>=24.0.0` declared in root package metadata; installed runtime is `v24.14.1`. [VERIFIED: package.json] | Runs source-shape tests, MCP build, MCP smoke, and root test gates. [VERIFIED: tests] | The repo test scripts and MCP build scripts are Node-based. [VERIFIED: package.json] |
| Plain Node test scripts | No Jest/Mocha dependency is used for the focused phase tests. [VERIFIED: package.json] | Source-shape, VM-slice, parity, and smoke checks. [VERIFIED: tests] | Existing trigger and UI tests are executable Node files under `tests/`. [VERIFIED: tests] |
| TypeScript | `5.9.3` installed under `mcp/node_modules`. [VERIFIED: package.json] | Builds the MCP package from `mcp/src` into `mcp/build`. [VERIFIED: package.json] | `mcp/package.json` defines `build: tsc`. [VERIFIED: package.json] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@modelcontextprotocol/sdk` | `^1.29.0` in `mcp/package.json`. [VERIFIED: package.json] | MCP server registration and runtime surface. [VERIFIED: package.json] | Keep as-is; Phase 20 must not change dependency versions. [VERIFIED: codebase] |
| `ws` | `^8.19.0` in `mcp/package.json`. [VERIFIED: package.json] | WebSocket bridge between MCP process and browser extension. [VERIFIED: package.json] | Keep as-is for trigger bridge behavior. [VERIFIED: codebase] |
| `zod` | `^3.24.0` in `mcp/package.json`. [VERIFIED: package.json] | Tool input schema validation in MCP package. [VERIFIED: package.json] | Keep as-is; schemas should remain shared-registry driven. [VERIFIED: codebase] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing options-page source-shape tests | Browser-driven UI automation | Not needed for this card because existing settings UI tests use source-shape assertions and the locked context forbids adding a browser UI harness for the cap card. [VERIFIED: tests] |
| Background-layer conflict check | MCP-layer conflict check | MCP lacks the normalized watch, tab, owner, and registry context available in `fsbTriggerHandleToolArm`. [VERIFIED: codebase] |
| Refresh-poll alarm-layer coalescing | MCP request coalescing | MCP is only a reporting/transport layer for trigger calls; reload sequencing is implemented in extension background tick handlers. [VERIFIED: codebase] |

**Installation:** no package install is required for Phase 20; use existing dependencies and do not change dependency versions. [VERIFIED: package.json]

**Version verification:** `mcp/package.json` is currently `0.9.2`, `mcp/src/version.ts` is currently `0.9.2`, `mcp/server.json` is currently `0.9.2`, and the target is locked to `0.10.0`. [VERIFIED: codebase] `mcp/package-lock.json` currently reports package/root version `0.8.0`, so the plan must either update the lockfile to `0.10.0` with a no-dependency-change lockfile refresh or explicitly document why the stale lockfile is left untouched. [VERIFIED: package.json]

## Architecture Patterns

### System Architecture Diagram

```text
MCP client / agent request
        |
        v
mcp/src/tools/triggers.ts
        |  blocking/detached bridge options, progress, safety ceiling
        v
extension/ws/mcp-bridge-client.js
        |
        v
extension/background.js::fsbTriggerHandleToolArm
        |  normalize owner, tab, selector, condition, watch
        |  conflict check: same tab + opposite active watch => TRIGGER_TAB_WATCH_CONFLICT
        v
FsbTriggerManager.armTrigger(spec)
        |
        v
FsbTriggerStore / chrome.storage.session.fsbTriggerRegistry
        |
        +--> live-observe path: content observer + pulse + lifecycle alarm
        |
        +--> refresh-poll path: alarm tick -> per-tab due batch -> one reload -> per-trigger read/evaluate -> lifecycle schedule
```

This diagram reflects the existing MCP-to-extension call flow and the planned conflict/coalescing insertion points. [VERIFIED: codebase]

### Recommended Project Structure

```text
extension/
├── ui/
│   ├── control_panel.html       # add Trigger Concurrency card beside Agent Concurrency [VERIFIED: codebase]
│   ├── options.js               # add cap load/save/listener/counter wiring [VERIFIED: codebase]
│   └── cap-counter-helpers.js   # add active trigger counter helper [VERIFIED: codebase]
├── background.js                # add conflict helper and refresh-poll coalescing [VERIFIED: codebase]
└── utils/
    ├── trigger-manager.js       # existing cap constants/storage enforcement [VERIFIED: codebase]
    ├── trigger-store.js         # existing session registry envelope [VERIFIED: codebase]
    └── trigger-lifecycle.js     # existing alarm/evaluate/schedule behavior [VERIFIED: codebase]
mcp/
├── src/version.ts               # update FSB_MCP_VERSION to 0.10.0 [VERIFIED: codebase]
├── package.json                 # update version only [VERIFIED: package.json]
├── package-lock.json            # refresh version metadata if planner accepts lockfile update [VERIFIED: package.json]
├── server.json                  # update server/package version metadata [VERIFIED: codebase]
├── README.md                    # update counts and Trigger Watchers docs [VERIFIED: codebase]
└── CHANGELOG.md                 # add 0.10.0 entry [VERIFIED: codebase]
tests/
├── trigger-cap-settings-ui.test.js       # recommended focused UI source-shape test [ASSUMED]
├── trigger-tool-dispatcher.test.js       # extend conflict tests [VERIFIED: tests]
├── trigger-refresh-poll.test.js          # extend coalescing tests [VERIFIED: tests]
└── mcp-version-parity.test.js            # update canonical 0.10.0 checks [VERIFIED: tests]
```

### Pattern 1: Clone Agent Cap Wiring for Trigger Cap UI

**What:** Add a `settings-card` after Agent Concurrency with IDs `fsbTriggerCapDisplay`, `fsbTriggerCap`, `fsbTriggerCapReset`, `fsbTriggerCapValidation`, and `fsbTriggerCapCurrentActive`. [VERIFIED: codebase]

**When to use:** Use this pattern for the cap card because Agent Concurrency already has numeric cap display, reset, validation, helper copy, active counter, load/save, and debounced storage refresh wiring. [VERIFIED: codebase]

**Example:**

```javascript
// Source: extension/ui/options.js and extension/ui/cap-counter-helpers.js [VERIFIED: codebase]
const FSB_TRIGGER_CAP_DEFAULT = 8;
const FSB_TRIGGER_CAP_MIN = 1;
const FSB_TRIGGER_CAP_MAX = 64;

function clampTriggerCap(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return FSB_TRIGGER_CAP_DEFAULT;
  return Math.min(FSB_TRIGGER_CAP_MAX, Math.max(FSB_TRIGGER_CAP_MIN, parsed));
}
```

### Pattern 2: Background-Scoped Conflict Check

**What:** Add a helper in `extension/background.js` that scans `FsbTriggerStore.hydrate().records` for an active snapshot on the same `target_tab_id` with the opposite normalized watch mode. [VERIFIED: codebase]

**When to use:** Run the helper inside `fsbTriggerHandleToolArm` after watch normalization and before baseline read, persistence, live observer start, or refresh-poll pulse start. [VERIFIED: codebase]

**Example:**

```javascript
// Source: extension/background.js trigger arm path [VERIFIED: codebase]
const FSB_TRIGGER_ACTIVE_STATUSES = new Set(['armed', 'needs_attention', 'blocked']);

async function fsbTriggerFindTabWatchConflict(targetTabId, requestedWatch) {
  const envelope = await FsbTriggerStore.hydrate();
  const records = envelope && envelope.records && typeof envelope.records === 'object'
    ? envelope.records
    : {};
  for (const snapshot of Object.values(records)) {
    if (!snapshot || snapshot.target_tab_id !== targetTabId) continue;
    if (!FSB_TRIGGER_ACTIVE_STATUSES.has(snapshot.status)) continue;
    if (fsbTriggerNormalizeWatch(snapshot.watch) === requestedWatch) continue;
    return snapshot;
  }
  return null;
}
```

### Pattern 3: Per-Tab Refresh-Poll Batch Lock

**What:** Replace one-trigger reload sequencing with a per-tab in-flight promise/lock that collects due armed refresh-poll snapshots for the tab, reloads once, then reads/evaluates each due trigger independently. [VERIFIED: codebase]

**When to use:** Use this in `fsbTriggerHandleRefreshPollAlarm` / `fsbTriggerRunRefreshPollTick` so alarm storms for co-located refresh-poll triggers converge into one tab reload without moving responsibility into MCP. [VERIFIED: codebase]

**Example:**

```javascript
// Source: extension/background.js refresh-poll alarm/tick layer [VERIFIED: codebase]
const fsbTriggerRefreshPollTabLocks = new Map();

async function fsbTriggerWithRefreshPollTabLock(tabId, task) {
  const key = String(tabId);
  const existing = fsbTriggerRefreshPollTabLocks.get(key);
  if (existing) return existing;
  const promise = Promise.resolve()
    .then(task)
    .finally(() => {
      if (fsbTriggerRefreshPollTabLocks.get(key) === promise) {
        fsbTriggerRefreshPollTabLocks.delete(key);
      }
    });
  fsbTriggerRefreshPollTabLocks.set(key, promise);
  return promise;
}
```

### Anti-Patterns to Avoid

- **MCP-owned conflict logic:** MCP does not own tab/session state, so placing conflict detection in `mcp/src/tools/triggers.ts` would duplicate or miss background-only ownership checks. [VERIFIED: codebase]
- **Counting terminal snapshots as active:** `fired`, `timed_out`, and `stopped` are terminal trigger statuses and must not inflate the UI active counter. [VERIFIED: codebase]
- **Using only `listArmedSnapshots()` for UI active count:** `listArmedSnapshots()` filters only `status === 'armed'`, while the locked UI counter must include `needs_attention` and `blocked` as active attention states. [VERIFIED: codebase]
- **Reloading once per same-tab due trigger:** Current refresh-poll tick code reloads per trigger, so the plan must add batching to avoid same-tab reload storms. [VERIFIED: codebase]
- **Calling `tabs.update({ active: true })`:** Existing refresh-poll code reloads by tab id and must preserve the background/no-focus contract. [VERIFIED: codebase]
- **Changing shared tool schemas for documentation:** Tool schema parity and visual schema locks already exist, and Phase 20 docs should describe the shared surface rather than modify it. [VERIFIED: tests]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Numeric cap UI behavior | A new settings framework | Clone Agent Concurrency markup and `options.js` clamp/reset/save/listener patterns. [VERIFIED: codebase] | Existing agent cap code already handles range validation, display, reset, save, and storage refresh. [VERIFIED: codebase] |
| Trigger active counter parsing | Ad hoc DOM-only state | A helper that reads `fsbTriggerRegistry.records` and counts active statuses. [VERIFIED: codebase] | The registry envelope is the source of truth for trigger snapshots. [VERIFIED: codebase] |
| Cross-agent authorization | UI checks or MCP-side checks | Existing background owner context, agent registry, and trigger store checks. [VERIFIED: codebase] | Background runtime already validates tab ownership and agent ownership for trigger operations. [VERIFIED: codebase] |
| Refresh-poll scheduling | A separate scheduler service | Existing `chrome.alarms`, trigger lifecycle scheduling, and per-tab batching in background. [VERIFIED: codebase] | Trigger lifecycle already owns terminal handling, TTL, and next-poll scheduling. [VERIFIED: codebase] |
| Public MCP docs from memory | Handwritten semantics detached from code | `mcp/src/tools/triggers.ts` plus shared tool definitions as docs source of truth. [VERIFIED: codebase] | The MCP trigger implementation defines blocking defaults, progress heartbeat, safety ceiling, detached behavior, and companion routes. [VERIFIED: codebase] |

**Key insight:** Phase 20 should compose existing storage, lifecycle, ownership, and MCP registry primitives; custom frameworks or parallel dispatch paths would increase divergence from the already-tested trigger system. [VERIFIED: codebase]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `chrome.storage.session.fsbTriggerRegistry` stores trigger snapshots, and `chrome.storage.local.fsbTriggerCap` stores the trigger cap. [VERIFIED: codebase] | No schema migration is required; new UI/count/conflict/coalescing code must tolerate existing malformed or terminal snapshots. [VERIFIED: codebase] |
| Live service config | No publish/tag action is part of Phase 20, and MCP host config is not updated by docs/version edits. [VERIFIED: codebase] | Do not run `npm publish`, create tags, or publish ClawHub artifacts. [VERIFIED: codebase] |
| OS-registered state | No OS-level registrations were found in the required phase files. [VERIFIED: codebase] | No OS registration task is required for the plan. [VERIFIED: codebase] |
| Secrets/env vars | The required phase files do not introduce secret or environment variable name changes. [VERIFIED: codebase] | No secret migration is required. [VERIFIED: codebase] |
| Build artifacts | `mcp/build/version.js` embeds the old MCP version until `npm --prefix mcp run build` regenerates it. [VERIFIED: codebase] | Run the MCP build after metadata edits and before version parity tests. [VERIFIED: tests] |
| Package metadata artifacts | `mcp/package-lock.json` currently reports `0.8.0` while `mcp/package.json` reports `0.9.2`. [VERIFIED: package.json] | Include a deliberate lockfile step or an explicit no-change rationale; preferred plan is a package-lock-only refresh to `0.10.0` without dependency upgrades. [ASSUMED] |

## Common Pitfalls

### Pitfall 1: Conflict Check After Persistence

**What goes wrong:** A cross-mode trigger can be written to `fsbTriggerRegistry` or start observer/pulse work before the runtime reports `TRIGGER_TAB_WATCH_CONFLICT`. [VERIFIED: codebase]

**Why it happens:** `fsbTriggerHandleToolArm` currently performs baseline read, spec construction, `FsbTriggerManager.armTrigger(spec)`, and watch startup in one path. [VERIFIED: codebase]

**How to avoid:** Insert conflict detection after watch normalization and before baseline read, `FsbTriggerManager.armTrigger(spec)`, `fsbTriggerStartObserveForSnapshot`, and pulse startup. [VERIFIED: codebase]

**Warning signs:** Tests show `sendMessageToTab`, `armTrigger`, observer start, or pulse start running for a conflicting arm request. [VERIFIED: tests]

### Pitfall 2: Refresh-Poll Batch Loses Per-Trigger Semantics

**What goes wrong:** A coalesced reload can accidentally evaluate stale snapshots, skip ownership validation for one trigger, or reschedule terminal triggers. [VERIFIED: codebase]

**Why it happens:** The current tick function is one-trigger oriented and mixes ownership, reload, read, lifecycle, pulse restart, and next scheduling. [VERIFIED: codebase]

**How to avoid:** Stage eligible due triggers per tab, validate ownership for each trigger before reload/evaluation, re-read each snapshot before per-trigger evaluation, and let lifecycle/pulse scheduling remain per trigger. [VERIFIED: codebase]

**Warning signs:** Tests show one failed trigger blocking unrelated due triggers on the same tab, fired triggers being rescheduled, or `chrome.tabs.reload` called more than once for a same-tab batch. [VERIFIED: tests]

### Pitfall 3: Active Counter Uses Runtime Cap Count Semantics

**What goes wrong:** The UI can undercount active watches if it reuses `listArmedSnapshots()` and excludes `needs_attention` or `blocked`. [VERIFIED: codebase]

**Why it happens:** Runtime cap enforcement currently counts armed snapshots, while the UI copy and locked context treat attention states as active watches. [VERIFIED: codebase]

**How to avoid:** Add a UI-specific helper that counts `armed`, `needs_attention`, and `blocked`, and excludes terminal statuses. [VERIFIED: codebase]

**Warning signs:** A source-shape test with `armed`, `blocked`, `needs_attention`, `fired`, `timed_out`, and malformed records fails to produce the expected active count. [VERIFIED: tests]

### Pitfall 4: Version Parity Fails After Metadata Edits

**What goes wrong:** `tests/mcp-version-parity.test.js` fails because CLI help/install output still reads from stale build output or README examples still mention the old version. [VERIFIED: tests]

**Why it happens:** `mcp/src/version.ts` is built into `mcp/build/version.js`, and the parity test checks docs plus CLI output. [VERIFIED: tests]

**How to avoid:** Update metadata, refresh any package lock metadata intentionally, run `npm --prefix mcp run build`, and then run version parity. [VERIFIED: package.json]

**Warning signs:** `node tests/mcp-version-parity.test.js` reports a mismatch between package metadata, build output, server JSON, or README version references. [VERIFIED: tests]

## Code Examples

### Active Trigger Counter Helper

```javascript
// Source: recommended addition to extension/ui/cap-counter-helpers.js [VERIFIED: codebase]
const ACTIVE_TRIGGER_STATUSES = new Set(['armed', 'needs_attention', 'blocked']);

function computeActiveTriggerCount(envelope) {
  const records = envelope && envelope.records && typeof envelope.records === 'object'
    ? envelope.records
    : {};
  return Object.values(records).filter((record) => (
    record && ACTIVE_TRIGGER_STATUSES.has(record.status)
  )).length;
}
```

### Conflict Error Shape

```javascript
// Source: recommended return from extension/background.js arm path [VERIFIED: codebase]
return {
  success: false,
  error: 'TRIGGER_TAB_WATCH_CONFLICT',
  code: 'TRIGGER_TAB_WATCH_CONFLICT',
  errorCode: 'TRIGGER_TAB_WATCH_CONFLICT',
  target_tab_id: tabId,
  existing_trigger_id: conflict.trigger_id || conflict.id || null,
  existing_watch: conflict.watch,
  requested_watch: watch,
};
```

### Refresh-Poll Due Batch Shape

```javascript
// Source: recommended extraction inside extension/background.js [VERIFIED: codebase]
function fsbTriggerCollectDueRefreshPollSnapshots(records, tabId, nowMs, requiredTriggerId) {
  return Object.values(records).filter((snapshot) => {
    if (!fsbTriggerIsRefreshPollSnapshot(snapshot)) return false;
    if (snapshot.target_tab_id !== tabId) return false;
    if (snapshot.trigger_id === requiredTriggerId) return true;
    return Number(snapshot.next_poll_at || 0) <= nowMs;
  });
}
```

## State of the Art

| Old Approach | Current Phase Approach | When Changed | Impact |
|--------------|------------------------|--------------|--------|
| Trigger cap runtime exists without options-page UI. [VERIFIED: codebase] | Add Trigger Concurrency card that writes `fsbTriggerCap` and displays active trigger count. [VERIFIED: codebase] | Phase 20 target. [VERIFIED: codebase] | Users can inspect and tune trigger watch concurrency from the control panel. [VERIFIED: codebase] |
| Same-tab opposite watch modes can be requested independently. [VERIFIED: codebase] | Reject active opposite-mode same-tab ownership with `TRIGGER_TAB_WATCH_CONFLICT`. [VERIFIED: codebase] | Phase 20 target. [VERIFIED: codebase] | Avoids overlapping live-observe and refresh-poll ownership semantics on the same tab. [VERIFIED: codebase] |
| Refresh-poll alarm tick reloads per due trigger. [VERIFIED: codebase] | Same-tab due refresh-poll triggers share one reload and retain per-trigger evaluation. [VERIFIED: codebase] | Phase 20 target. [VERIFIED: codebase] | Reduces reload storms while preserving ownership and lifecycle semantics. [VERIFIED: codebase] |
| MCP package metadata is `0.9.2`, with package-lock drift at `0.8.0`. [VERIFIED: package.json] | Prepare MCP metadata/docs/build/parity for `0.10.0`. [VERIFIED: codebase] | Phase 20 target. [VERIFIED: codebase] | Release artifacts are ready without publishing or tagging. [VERIFIED: codebase] |

**Deprecated/outdated:** `mcp/README.md` still needs its public tool count and trigger watcher docs reconciled with the shared tool registry, which currently exposes 55 tools including `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers`. [VERIFIED: codebase]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The preferred package-lock handling is a package-lock-only refresh to `0.10.0` without dependency upgrades. [ASSUMED] | Runtime State Inventory | Planner may choose to omit lockfile changes, leaving visible metadata drift. |
| A2 | A new focused `tests/trigger-cap-settings-ui.test.js` is preferable to expanding an existing unrelated settings test. [ASSUMED] | Recommended Project Structure | Planner may instead extend `tests/change-report-settings-ui.test.js`; either approach is acceptable if coverage is equivalent. |
| A3 | The exact human UAT artifact name can be `.planning/phases/20-integration-cap-ui-docs-edge-cases/20-HUMAN-UAT.md`. [ASSUMED] | Validation Architecture | Planner may choose a different artifact name while preserving required evidence. |

## Open Questions

1. **Should `mcp/package-lock.json` be updated in Phase 20?** [VERIFIED: package.json]
   - What we know: the lockfile currently reports `0.8.0`, while MCP package metadata reports `0.9.2` and the target is `0.10.0`. [VERIFIED: package.json]
   - What's unclear: the locked context names package metadata files but does not explicitly name `mcp/package-lock.json`. [VERIFIED: codebase]
   - Recommendation: include a package-lock-only refresh if it does not change dependency versions, because otherwise release metadata remains visibly inconsistent. [ASSUMED]

2. **Who performs live-browser UAT?** [VERIFIED: codebase]
   - What we know: Phase 16 verification marked live-observe checks as human-needed and Phase 20 owns capturing the deferred evidence. [VERIFIED: codebase]
   - What's unclear: this research task cannot execute human/browser UAT. [ASSUMED]
   - Recommendation: planner should create a Phase 20 UAT artifact with pending checkboxes and require humans to record results before verification is closed. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Test scripts and MCP build. [VERIFIED: tests] | yes [VERIFIED: package.json] | `v24.14.1` installed; root requires `>=24.0.0`. [VERIFIED: package.json] | None needed. [VERIFIED: package.json] |
| npm | Root and MCP scripts. [VERIFIED: package.json] | yes [VERIFIED: package.json] | `11.11.0` installed. [VERIFIED: package.json] | None needed. [VERIFIED: package.json] |
| TypeScript compiler | `npm --prefix mcp run build`. [VERIFIED: package.json] | yes [VERIFIED: package.json] | `5.9.3` under `mcp/node_modules`. [VERIFIED: package.json] | None needed. [VERIFIED: package.json] |
| Chrome browser/manual extension session | Human UAT. [VERIFIED: codebase] | not probed by research. [ASSUMED] | unknown. [ASSUMED] | Manual UAT remains pending until browser availability is confirmed. [ASSUMED] |

**Missing dependencies with no fallback:** none for automated planning and source validation. [VERIFIED: package.json]

**Missing dependencies with fallback:** live-browser UAT can remain documented as human-needed until a browser session is available. [ASSUMED]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Plain Node scripts plus MCP TypeScript build. [VERIFIED: package.json] |
| Config file | No central test framework config is required for the focused Node tests. [VERIFIED: package.json] |
| Quick run command | `node tests/trigger-tool-dispatcher.test.js && node tests/trigger-refresh-poll.test.js && node tests/trigger-cap-settings-ui.test.js` [ASSUMED] |
| Full suite command | `npm test && npm run test:mcp-smoke:tools && npm run ci` [VERIFIED: package.json] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| Integration/composition | Trigger cap UI renders beside Agent Concurrency, persists `fsbTriggerCap`, clamps `1..64`, resets to `8`, and subscribes to registry/cap changes. [VERIFIED: codebase] | source-shape/unit | `node tests/trigger-cap-settings-ui.test.js` [ASSUMED] | No, Wave 0 gap. [ASSUMED] |
| Integration/composition | Active trigger counter counts `armed`, `needs_attention`, and `blocked`, and excludes terminal/malformed records. [VERIFIED: codebase] | unit/source-shape | `node tests/trigger-cap-settings-ui.test.js` [ASSUMED] | No, Wave 0 gap. [ASSUMED] |
| Integration/composition | Opposite watch mode on same target tab returns `TRIGGER_TAB_WATCH_CONFLICT` before read, persist, observer, or pulse work. [VERIFIED: codebase] | VM/unit | `node tests/trigger-tool-dispatcher.test.js` [VERIFIED: tests] | Yes, extend existing file. [VERIFIED: tests] |
| Integration/composition | Same watch mode co-location remains allowed. [VERIFIED: codebase] | VM/unit | `node tests/trigger-tool-dispatcher.test.js` [VERIFIED: tests] | Yes, extend existing file. [VERIFIED: tests] |
| Integration/composition | Same-tab due refresh-poll triggers share one `chrome.tabs.reload`, while other-tab triggers reload separately. [VERIFIED: codebase] | VM/unit | `node tests/trigger-refresh-poll.test.js` [VERIFIED: tests] | Yes, extend existing file. [VERIFIED: tests] |
| Integration/composition | Existing blocking/detached reporting, lifecycle, manager, and cap behavior still passes. [VERIFIED: tests] | unit/smoke | `node tests/trigger-lifecycle.test.js && node tests/trigger-manager.test.js && node tests/trigger-blocking-reporting.test.js && node tests/trigger-cap.test.js` [VERIFIED: tests] | Yes. [VERIFIED: tests] |
| Integration/composition | MCP version/docs parity reaches `0.10.0` and CLI output is rebuilt. [VERIFIED: tests] | build/parity | `npm --prefix mcp run build && node tests/mcp-version-parity.test.js` [VERIFIED: tests] | Yes. [VERIFIED: tests] |
| Integration/composition | MCP trigger tool surface remains shared-registry compatible. [VERIFIED: tests] | smoke/parity | `node tests/mcp-tool-smoke.test.js && node tests/tool-definitions-parity.test.js && node tests/visual-session-schema-lock.test.js` [VERIFIED: tests] | Yes. [VERIFIED: tests] |
| Integration/composition | Deferred live-browser UAT is recorded without fabricated proof. [VERIFIED: codebase] | manual/UAT artifact | Manual runbook in `20-HUMAN-UAT.md`. [ASSUMED] | No, Wave 0 gap. [ASSUMED] |

### Sampling Rate

- **Per task commit:** run the focused test touching that task plus `node tests/trigger-blocking-reporting.test.js` when background trigger behavior changes. [VERIFIED: tests]
- **Per wave merge:** run `node tests/trigger-tool-dispatcher.test.js && node tests/trigger-refresh-poll.test.js && node tests/trigger-lifecycle.test.js && node tests/trigger-manager.test.js && node tests/trigger-blocking-reporting.test.js`. [VERIFIED: tests]
- **Phase gate:** run `npm --prefix mcp run build`, `node tests/mcp-version-parity.test.js`, `node tests/mcp-tool-smoke.test.js`, `node tests/tool-definitions-parity.test.js`, `node tests/visual-session-schema-lock.test.js`, `npm test`, and `npm run ci`. [VERIFIED: package.json]

### Wave 0 Gaps

- [ ] `tests/trigger-cap-settings-ui.test.js` covers Trigger Concurrency markup, `options.js` defaults/cache/listener/load/save/reset, and active counter helper behavior. [ASSUMED]
- [ ] `.planning/phases/20-integration-cap-ui-docs-edge-cases/20-HUMAN-UAT.md` captures Phase 16 deferred UAT plus Phase 20 end-to-end trigger scenarios. [ASSUMED]
- [ ] Decide whether `mcp/package-lock.json` is an explicit version metadata update file for Phase 20. [ASSUMED]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no new auth. [VERIFIED: codebase] | Reuse existing agent/owner context; do not add auth logic. [VERIFIED: codebase] |
| V3 Session Management | yes for trigger session registry and owner lifecycle. [VERIFIED: codebase] | Continue using `chrome.storage.session` trigger registry, owner cleanup, TTL, and terminal status handling. [VERIFIED: codebase] |
| V4 Access Control | yes for tab ownership and cross-agent isolation. [VERIFIED: codebase] | Keep background ownership validation before refresh-poll reload/evaluation and before exposed status/list/stop effects. [VERIFIED: codebase] |
| V5 Input Validation | yes for cap input, trigger snapshots, watch mode, tab id, and docs examples. [VERIFIED: codebase] | Clamp cap values; normalize watch; ignore malformed registry records; keep shared zod schemas. [VERIFIED: codebase] |
| V6 Cryptography | no new crypto. [VERIFIED: codebase] | Do not introduce cryptographic code. [VERIFIED: codebase] |

### Known Threat Patterns for Phase 20

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Storage tampering with `fsbTriggerCap` or malformed `fsbTriggerRegistry` records. [VERIFIED: codebase] | Tampering | Clamp cap on input/load/save and in runtime manager; UI counter and conflict scan should ignore malformed records and never throw into the options page. [VERIFIED: codebase] |
| Cross-agent trigger leaks through conflict/status/list data. [VERIFIED: codebase] | Information Disclosure | Keep status/list owner filtering and return only minimal conflict metadata needed for the caller to understand rejection. [VERIFIED: codebase] |
| Background reload storms from co-located refresh-poll triggers. [VERIFIED: codebase] | Denial of Service | Use a per-tab lock/due batch so one same-tab batch performs one reload while other tabs remain independent. [VERIFIED: codebase] |
| Notification overclaims in docs. [VERIFIED: codebase] | Spoofing / Repudiation | Document trigger output as notify-only and local browser/session-bound; do not promise push, email, Slack, server-side monitoring, or auto-act workflows. [VERIFIED: codebase] |
| Version/package drift between metadata, build output, docs, and tests. [VERIFIED: package.json] | Tampering / Repudiation | Update metadata together, rebuild MCP output, and run version parity plus smoke/parity tests. [VERIFIED: tests] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/20-integration-cap-ui-docs-edge-cases/20-CONTEXT.md` - locked phase scope, implementation decisions, docs/version/UAT gates. [VERIFIED: codebase]
- `.planning/phases/20-integration-cap-ui-docs-edge-cases/20-UI-SPEC.md` - exact Trigger Concurrency card IDs, storage key, copy, placement, and source-shape test expectations. [VERIFIED: codebase]
- `extension/ui/control_panel.html`, `extension/ui/options.js`, `extension/ui/cap-counter-helpers.js` - current options UI and agent cap patterns. [VERIFIED: codebase]
- `extension/background.js`, `extension/utils/trigger-manager.js`, `extension/utils/trigger-store.js`, `extension/utils/trigger-lifecycle.js` - trigger arm, cap, registry, lifecycle, ownership, alarm, refresh-poll, and watch behavior. [VERIFIED: codebase]
- `mcp/src/tools/triggers.ts`, `extension/ws/mcp-bridge-client.js`, `extension/ai/tool-definitions.js`, `mcp/ai/tool-definitions.cjs` - public trigger tools, bridge behavior, and shared schemas. [VERIFIED: codebase]
- `tests/trigger-tool-dispatcher.test.js`, `tests/trigger-refresh-poll.test.js`, `tests/trigger-lifecycle.test.js`, `tests/trigger-manager.test.js`, `tests/trigger-blocking-reporting.test.js`, `tests/mcp-version-parity.test.js`, `tests/mcp-tool-smoke.test.js` - current validation harnesses. [VERIFIED: tests]
- `package.json`, `mcp/package.json`, `mcp/package-lock.json`, `mcp/server.json`, `mcp/src/version.ts` - script, dependency, engine, and version metadata. [VERIFIED: package.json]

### Secondary (MEDIUM confidence)

- None; this was a codebase-first research task and no external sources were required. [VERIFIED: codebase]

### Tertiary (LOW confidence)

- Assumptions in the Assumptions Log are marked `[ASSUMED]` and should be confirmed by the planner or user before becoming locked execution decisions. [ASSUMED]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - package metadata and installed MCP dependencies were inspected locally. [VERIFIED: package.json]
- Architecture: HIGH - insertion points are directly visible in `extension/background.js`, UI files, and MCP trigger registrar code. [VERIFIED: codebase]
- Pitfalls: HIGH - risks map to current one-trigger refresh-poll flow, current UI absence, current version drift, and existing tests. [VERIFIED: codebase]
- Validation: HIGH for automated gates and MEDIUM for live-browser UAT because manual browser availability was not probed. [VERIFIED: tests]

**Research date:** 2026-06-17 [VERIFIED: codebase]
**Valid until:** 2026-07-17 for local codebase planning unless trigger runtime or MCP package structure changes first. [ASSUMED]
