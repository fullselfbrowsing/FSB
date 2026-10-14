# Architecture Research

**Domain:** Decision-model acceleration (Jev, TypeSafe's System One model) inside FSB's existing Chrome MV3 autopilot loop and `fsb-mcp-server` bridge, milestone v1.0.0 Jev Fast Mode
**Researched:** 2026-09-28
**Confidence:** HIGH for integration points (every file:line below was read at `HEAD 3cc18052` on branch `Jev`); MEDIUM for the fast-path control-flow shape (a design, not yet prototyped); MEDIUM for provider-transcript constraints (official Gemini docs plus a forum report)

> **Staleness warning.** `.planning/codebase/ARCHITECTURE.md` and `STRUCTURE.md` (2026-02-03) describe root-level files (`background.js`, `content.js`, `ai-integration.js`) that now live under `extension/` and have been heavily refactored; `graphify-out/graph.json` was built from commit `931bc5af`, 734 commits behind HEAD. Neither was used for line numbers. All line references below are from direct reads at HEAD and will drift as phases land; re-grep the quoted symbol before editing.

## Integration Decisions at a Glance

1. **Jev is a separate decision client, not a ninth chat provider.** A new `extension/ai/jev-client.js` posts to `/v1/systemone` from the service worker. It must stay out of `PROVIDER_CONFIGS` (`extension/ai/universal-provider.js:7-50`) and out of `API_PROVIDER_IDS` (`extension/ui/providers-panel.js:4-12`), both of which are pinned at the seven INV-03 providers.
2. **Autopilot fast mode is a decision source inside `runAgentIteration`, not a new executor and not only hooks.** One call site placed before the LLM request either returns a Jev-chosen tool call, which runs through the *existing* tool loop, hooks, recorders, stuck detection, persistence and the existing 100 ms schedule, or declines so the LLM runs as today. Hooks cannot skip the LLM call, and a separate executor would need its own iterator, which the INV-04 pins forbid.
3. **Jev-decided steps never enter the provider transcript as synthetic assistant tool calls.** They are logged on the session and flushed to the LLM as one user-role summary on its next turn. This keeps all seven providers working: Gemini 3 rejects injected `functionCall` parts that lack a thought signature, and an unpaired `role:'tool'` message is a guaranteed provider 400 (the loop already notes this at `agent-loop.js:2224-2226`).
4. **Safety uses hooks and can only tighten.** Done-veto, stuck and risk checks register on the existing `beforeToolExecution` and `afterIteration` events in `createSessionHooks` (`background.js:4554-4585`). The only loop change is adding `args` and a real `origin` to the `beforeToolExecution` context (`agent-loop.js:2260-2265`).
5. **Per-call timing is stamped at three boundaries and stored in the stores that already exist:** the MCP server tool entry, the extension's single MCP ingress (`mcp-bridge-client.js:1144`), and the dispatch completion. MCP timing lands in journal-v2 `tool.call` metadata; autopilot timing lands on the session object and in `automationLogger.saveSession`.
6. **`get_session_detail` fails because it never consults the journal.** `list_sessions` reads `fsbSessionIndex`, which the journal writes (`mcp-lattice-journal.js:900-946`), but `handleGetSessionMessageRoute` (`mcp-tool-dispatcher.js:2904-2957`) reads only `fsbSessionLogs` and the in-flight map. The fix is a journal branch that mirrors the UI's existing lookup (`background.js:12513-12531`).
7. **`expect` is a registry-level optional parameter evaluated inside `wrapWithChangeReport`** (`mcp-tool-dispatcher.js:3825-3924`), after the stability wait it already performs. Predicates are code-evaluated only, and the result is an additive `expect_result` field.
8. **`run_task` fast mode is the same autopilot fast path behind additive MCP parameters.** They are threaded explicitly through five hops: `autopilot.ts` → bridge → `handleStartAutomationRoute` → `handleStartAutomation` → `sessionData.fastMode`. MCP escalation returns typed outcomes to the caller instead of consulting the extension's LLM.
9. **Descriptions are edited only in `extension/ai/tool-definitions.js`, `mcp/src/tools/manual.ts` and the non-registry tool files.** `mcp/ai/tool-definitions.cjs` is a build copy. Any registry edit moves the full-definition hash pinned in three tests, so re-baseline it deliberately in the same commit (better: split it into a shape hash plus a description budget gate).
10. **The version bump is the last step.** `scripts/sync-product-version.mjs` rewrites `extension/ui/options.js` and `sidepanel.js`, which the UI phases also edit.

## Standard Architecture

### System Overview

```
 MCP host (Claude Code / Cursor / Codex)                 Side panel / popup (autopilot)
        │ tools/call                                            │ startAutomation
        ▼                                                       ▼
┌──────────────────────── fsb-mcp-server (Node, mcp/) ─────────────────────────────┐
│ server.ts createServer ──► runtime.ts register*Tools                             │
│   manual.ts / read-only.ts (registry-derived)   autopilot.ts / observability.ts  │
│   schema-bridge.ts jsonSchemaToZod   queue.ts TaskQueue   agent-bridge.ts sidecars│
│   [NEW] call-timing context (serverReceivedAt)  [NEW] server instructions        │
└──────────────┬───────────────────────────────────────────────────────────────────┘
               │ WS ws://localhost:7225  mcp:* JSON   (+ recording* sidecars)
┌──────────────▼──────────── Extension MV3 service worker (extension/) ────────────┐
│ ws/mcp-bridge-client.js _handleMessage ─► _routeMessage                          │
│   ├─ mcp:execute-action ─► _handleExecuteAction ─► wrapWithChangeReport          │
│   │                         [NEW] expect evaluation ─► utils/expect-evaluator.js │
│   ├─ other mcp:* ─► ws/mcp-tool-dispatcher.js dispatchMcpMessageRoute            │
│   │                   └─ mcp:get-session ─► [FIX] journal branch                 │
│   └─ mcp:start-automation ─► background.js handleStartAutomation (fastMode)      │
│                                                                                  │
│ ai/agent-loop.js runAgentIteration                                               │
│   beforeIteration hooks ─► [NEW] fast-path decision ─┬─► Jev tool call ──┐       │
│                                                      └─► LLM (UniversalProvider) │
│   tool loop (_executeTool) ◄──────────────────────────────────────────────┘      │
│   beforeToolExecution: permission + [NEW] Jev risk/done-veto hooks (tighten-only) │
│   afterIteration: stuck + [NEW] Jev stuck + [NEW] timing hook ─► persist ─► 100ms │
│                                                                                  │
│ [NEW] ai/jev-client.js ──HTTPS──► openrouter.ai/api/v1/systemone | api.typesafe.ai│
│ [NEW] ai/jev-fast-path.js (state builder, instrument, thresholds, escalation)    │
└──────────────┬───────────────────────────────────────────┬───────────────────────┘
               │ chrome.tabs.sendMessage / scripting        │ storage
┌──────────────▼──────── Content scripts ────────┐  ┌───────▼────────────────────────────┐
│ dom-analysis.js buildMarkdownSnapshot          │  │ IndexedDB fsb-mcp-lattice-journal   │
│   + [NEW] includeRefTable (refs for Jev)       │  │   (journal-v2 runs/events, timing)  │
│ dom-state.js RefMap (e1..eN)                   │  │ storage.local fsbSessionIndex        │
│ messaging.js executeAction (ref resolution,    │  │   fsbSessionLogs (autopilot+timing)  │
│   refStale), actions.js STABILITY_PROFILES     │  │   provider keys, [NEW] jev* settings │
└────────────────────────────────────────────────┘  └─────────────────────────────────────┘
```

### Component Responsibilities

**New components**

| Component | Responsibility | Implementation note |
|-----------|----------------|---------------------|
| `extension/ai/jev-client.js` | Binds route, base URL, key and pinned model; runs `fetch` with an `AbortController` timeout; validates answers (every offered key, choice in the offered set, probabilities sum within 0.02, choice equals argmax); normalizes OpenRouter `{error:{code,message}}` and TypeSafe 401/422/429/529 errors; applies a circuit breaker, a global in-flight cap and a request-rate limiter; returns `servedModel`, `usage.cost` and latency | Classic `importScripts` script with a `module.exports` guard, like `cost-tracker.js`. Every `setTimeout` lives here, never in `agent-loop.js` |
| `extension/ai/jev-fast-path.js` | Autopilot and `run_task` fast-mode policy: builds redacted state from the snapshot ref table, visible text, recent actions and the goal; defines the versioned question set; decides with thresholds keyed by backend and pinned model; exposes `nextStep`, `recordStepResult` and `flushSummary`; writes the shadow-mode decision log | Resolved lazily through `globalThis.FsbJevFastPath` at call time, so `importScripts` order relative to `agent-loop.js` does not matter |
| `extension/ai/hooks/jev-hooks.js` | `createJevCompletionVetoHook` (`beforeToolExecution` on `complete_task`), `createJevRiskHook` (`beforeToolExecution` on mutations, tighten-only), `createJevStuckHook` (`afterIteration`, returns a hint) | Registered after the permission hook in `createSessionHooks`. Each handler bounds its own wait, because `HookPipeline.emit` has no timeout (`hook-pipeline.js:132-159`) |
| `extension/ai/hooks/timing-hook.js` | Autopilot per-iteration timing: LLM ms, each tool's ms (the gap between its before and after hooks), Jev ms, decision source, served model, cost | Writes a capped `session.timing` array; no network |
| `extension/utils/expect-evaluator.js` | Shared code predicates for MCP `expect`, `run_task` `verify`, and fast-mode "done" checks; polls until met or timed out | The page-side check runs through `chrome.scripting.executeScript` in the default ISOLATED world, so no new content-script file (and none of the pins on that list) is needed |
| `extension/ui/jev-settings.js` plus a card in `control_panel.html` | Decision-provider card: enable toggle, key source (OpenRouter by default, TypeSafe direct as an option), TypeSafe key field, pinned-model display, autopilot fast-mode opt-in, shadow toggle, Test Jev button, data-retention disclosure | Separate file, like `voice-input-settings.js`; loaded before `options.js` (`control_panel.html:2067-2070`) |
| `mcp/src/call-timing.ts` (optional) | Stamps `serverReceivedAt` when a tool callback starts, using `AsyncLocalStorage` installed once where tools are registered; `buildAgentPayload` reads it | Touches no tool files. It is inactive in the smoke harness, so those payloads stay byte-identical |
| `scripts/bench/` (runner, `mcp-timing-report.mjs`, `tasks/*.json`, fixtures) and `scripts/check-mcp-tool-budget.mjs` | Repeatable before/after benchmark plus a `tools/list` size gate | Plain Node scripts, as `STACK.md` recommends; the runner reads results back through `list_sessions` and the fixed `get_session_detail` |

**Modified components**

| Component (file:line at HEAD) | Change |
|-------------------------------|--------|
| `extension/ai/agent-loop.js` | Fast-path decision site between `:1910` and `:1911`; LLM-only block `:1911-2214` bypassed for Jev steps; `source` carried on `toolResults.push` (`:2756`); Jev results diverted at `:2831-2840`; additive hook context (`args`/`origin` at `:2260-2265`, `llmMs` at `:2055-2062`); LLM-turn versus fast-step accounting in `checkSafetyBreakers` (`:250-287`) |
| `extension/background.js` | `importScripts` for the new modules in the agent-engine block (`:801-817`); hook registration in `createSessionHooks` (`:4554-4585`); `fastMode` threaded into `sessionData` (`:13882-13921`); new `onMessage` cases (`testJevConnection`, `getJevStatus`) beside `getSessionDetail` (`:12513`); confirmation-card relay |
| `extension/ws/mcp-bridge-client.js` | Timing stamp at ingress (`:1164-1190`); timing on action records (`_recordMcpSessionAction` `:1689-1743`); `expect` separated from params in `_handleExecuteAction` (`:1745-1944`); fast summary passed through `settle` (`:2580-2586`) |
| `extension/ws/mcp-tool-dispatcher.js` | Journal branch in `handleGetSessionMessageRoute` (`:2904-2957`); `durationMs` added to the `sanitizeActionHistoryEntry` allowlist (`:2072-2086`); timing on the message-route recorder entry (`:829-851`); `expect` evaluation in `wrapWithChangeReport` (`:3825-3924`); `fastMode` threaded in `handleStartAutomationRoute` (`:2668-2679`) |
| `extension/utils/mcp-session-recorder.js` | `_snapshotJournalEntry` (`:918-960`) passes `timing`; `durationMs` on legacy `actionHistory.push` (`:2146-2152`); `recordAction` (`:2336-2352`) forwards timing |
| `extension/utils/mcp-lattice-journal.js` | New internal sidecar keys added to `INTERNAL_PAYLOAD_KEYS` (`:44-48`); `timing` in the `recordDispatchNow` metadata (`:1210-1229`); per-run `fsbMs` accumulator exposed as `timingSummary` in `buildIndexEntry` (`:836-872`) |
| `extension/utils/automation-logger.js` | `saveSession` projections (`:904-916` for existing rows, `:963-973` for new ones) keep `durationMs`, `decisionSource` and `timing`; index entry (`:982-1011`) gains a timing summary |
| `extension/content/dom-analysis.js`, `extension/content/messaging.js` | `buildMarkdownSnapshot` (`:2537-2726`) accepts an opt-in `includeRefTable` and returns `refs` with sensitive elements removed; the `getMarkdownSnapshot` handler (`messaging.js:786-804`) passes the option through |
| `extension/ai/tool-definitions.js` (and its build copy `mcp/ai/tool-definitions.cjs`) | Shorter descriptions; shorter `VISUAL_SESSION_FIELDS` (`:36-49`) and inline `tab_id` descriptions; a `withExpectField()` helper beside `withVisualSessionFields` (`:64-76`) |
| `extension/ai/cost-tracker.js` | Jev entries in `MODEL_PRICING` (`:23+`, per-million format) or a method that records OpenRouter's `usage.cost` directly |
| `extension/config/config.js` (`:16-60`), `init-config.js` (`:14`), `extension/ui/options.js` (load `:1862`, save `:2320-2378`), `control_panel.html` (Providers section `:144-421`) | New `jev*` settings keys and the settings card |
| `mcp/src/tools/manual.ts` | Shorter `CHANGE_REPORT_DESCRIPTION_SUFFIX` (`:27-28`); `expect` flows through params unchanged (`:283-294`) |
| `mcp/src/tools/autopilot.ts` | Additive `run_task` parameters (`:33-35`); `fastMode` added to `startPayload` (`:121`) only when requested; shorter description |
| `mcp/src/tools/observability.ts` | Optional `afterSequence`/`limit` on `get_session_detail` (`:47-49`); updated description |
| `mcp/src/tools/{agents,vault,capabilities,visual-session,read-only}.ts` | Shorter descriptions (`back` at `agents.ts:34` is 1,934 characters and inlines its own `change_report` paragraph) |
| `mcp/src/server.ts` (`:9-21`) | Server `instructions`, at most 2 KB; `ServerOptions.instructions` exists in the pinned SDK 1.29.0 |
| `mcp/src/agent-bridge.ts` | `buildAgentPayload` (`:71-104`) adds a timing sidecar beside `recordingCallId` |
| `mcp/src/tools/schema-bridge.ts` (`:78-132`) | An `object` branch, needed only if `expect` or `verify` is structured (non-primitives currently fall to `z.any()` at `:112-113`) |

## Recommended Project Structure

```
extension/
├── ai/
│   ├── jev-client.js            # NEW  thin /v1/systemone client (timeouts, validation, breaker, limiter)
│   ├── jev-fast-path.js         # NEW  state builder, instrument, thresholds, nextStep/flush, shadow log
│   ├── hooks/
│   │   ├── jev-hooks.js         # NEW  done-veto, risk (tighten-only), stuck
│   │   └── timing-hook.js       # NEW  autopilot per-iteration timing
│   ├── agent-loop.js            # MOD  one decision site + budget accounting + additive hook context
│   ├── tool-definitions.js      # MOD  shorter text, withExpectField()
│   └── cost-tracker.js          # MOD  Jev pricing
├── utils/
│   ├── expect-evaluator.js      # NEW  code predicates shared by expect / verify / done
│   ├── mcp-lattice-journal.js   # MOD  timing metadata, internal keys, timingSummary
│   ├── mcp-session-recorder.js  # MOD  timing pass-through
│   └── automation-logger.js     # MOD  timing in saveSession projections
├── ws/
│   ├── mcp-bridge-client.js     # MOD  ingress timing, expect split, fast summary settle
│   └── mcp-tool-dispatcher.js   # MOD  journal lookup, expect in wrapWithChangeReport, fastMode thread
├── content/
│   ├── dom-analysis.js          # MOD  buildMarkdownSnapshot includeRefTable
│   └── messaging.js             # MOD  pass-through option
└── ui/
    ├── jev-settings.js          # NEW  Decision provider card logic
    ├── control_panel.html       # MOD  card markup + script tag
    ├── options.js               # MOD  load/save jev* keys
    └── sidepanel.js/.html       # MOD  risk confirmation card (paymentFillConfirmation pattern)
mcp/src/
├── call-timing.ts               # NEW (optional)  AsyncLocalStorage serverReceivedAt
├── server.ts                    # MOD  instructions
├── agent-bridge.ts              # MOD  timing sidecar
└── tools/*.ts                   # MOD  descriptions, run_task params, get_session_detail paging
scripts/
├── bench/                       # NEW  runner, timing report, tasks/, fixtures/
└── check-mcp-tool-budget.mjs    # NEW  in-process tools/list budget gate
tests/                           # NEW  jev-client, jev-fast-path, jev-hooks, expect-evaluator,
                                 #      mcp-session-detail-journal, timing, run-task-fast, tool-budget
```

### Structure Rationale

- **The Jev modules sit in `extension/ai/`** next to `universal-provider.js` and `cost-tracker.js`: they are service-worker decision infrastructure and share that directory's `importScripts` plus `module.exports` idiom, so Node tests can load them.
- **Hooks go in `extension/ai/hooks/`** because that is where `createSessionHooks` already takes its safety, permission and progress factories from (`background.js:4558-4582`).
- **`expect-evaluator.js` goes in `extension/utils/`** because the MCP dispatcher, the fast path and `run_task` `verify` all use it, and it has no LLM dependency.
- **Nothing Jev-related goes in `mcp/`.** The MCP server never holds a Jev key (a `STACK.md` decision this research confirms): keys already live in `chrome.storage.local`, and the server is a bridge.

## Feature Integration Map

### 1. Jev decision client, settings, key storage and provider UI

| Concern | Integration point | Notes |
|---------|------------------|-------|
| Why Jev is not a `UniversalProvider` | `PROVIDER_CONFIGS` (`universal-provider.js:7-50`) holds only chat endpoints (for example `openrouter` → `https://openrouter.ai/api/v1/chat/completions`, key field `openrouterApiKey`) | `/v1/systemone` takes `{model, state, questions}` and returns `answers`; it is not a chat completion. `tests/provider-parity.test.js` pins seven `PROVIDER_KEYS`, and `providers-panel.js:4-12` freezes seven `API_PROVIDER_IDS` |
| Routes | OpenRouter (default): `POST https://openrouter.ai/api/v1/systemone`, model `typesafe/jev-1.13`; the response adds `id`, a dated `model` (`typesafe/jev-1.13-20260917`), `provider` and `usage.cost`. TypeSafe direct: `POST https://api.typesafe.ai/v1/systemone`, model `jev-1.13.0` | Verified against OpenRouter's System One reference on 2026-09-28. Treat any change in the served snapshot as "thresholds unvalidated" and drop to shadow or LLM-only |
| Key reuse | The loop reads `openrouterApiKey` from `chrome.storage.local` (`agent-loop.js:1303-1313`); `saveSettings` persists every key field whether or not OpenRouter is the selected chat provider (`options.js:2334-2340`) | The Jev client reads the key at call time in the service worker. It never goes to content scripts, the MCP server or logs. Keys are unencrypted today (`openrouterApiKey` is not on `SecureConfig.sensitiveKeys`, `secure-config.js:7-14`), so a new `typesafeApiKey` matches the existing posture |
| Settings defaults | `config.js:16-60` (`this.defaults`), `init-config.js:14` | Add `jevEnabled:false`, `jevKeySource:'openrouter'`, `typesafeApiKey:''`, `jevAutopilotFastMode:false`, `jevShadowMode`, and an optional thresholds override. The pinned model is derived from the route and never typed by the user |
| UI | Providers section `control_panel.html:144-421` (still `id="api-config"`; PROV-01 kept that id for source pins); the script list at `:2053-2084`; `options.js` load (`:1862`) and save (`:2320-2378`) | Add a separate "Decision provider (Jev)" form card after the provider card. Sixteen tests read `control_panel.html`, so add markup and pair each edit with its test update. Do not touch the `openrouterApiKeyGroup` visibility logic (`options.js:1787`) |
| Service-worker loading | `background.js:801-817` agent-engine `importScripts` block | Each new module adds 1 to the `importScripts` token count (333) and to the call-site count (329) pinned at `tests/lattice-provider-bridge-smoke.test.js:634-635` and `:682-683` |
| Status and testing | New `onMessage` cases beside `getSessionDetail` (`background.js:12513`) | `testJevConnection` sends one tiny Noul request; `getJevStatus` reports ready, no key, rate-limited, breaker open, or snapshot changed |
| Cost | `CostTracker.record(model, in, out)` (`cost-tracker.js:128`), per-million pricing table (`:23`) | Prefer OpenRouter's `usage.cost`; add `'typesafe/jev-1.13'` and `'jev-1.13.0'` at $0.042 per million input tokens as a fallback. `tests/cost-tracker.test.js` checks only for the presence of specific keys, so these entries are additive |

### 2. Per-call timing: capture, persistence and exposure

**Why `get_session_detail` returns "not found" for journal sessions:** the journal stores journal-v2 runs in IndexedDB (`mcp-lattice-journal.js:11-20`) and projects index rows into `chrome.storage.local.fsbSessionIndex` (`writeJournalIndex` `:900-920`, `upsertIndex` `:931-946`), but it never writes `fsbSessionLogs`. `list_sessions` → `handleListSessionsMessageRoute` (`mcp-tool-dispatcher.js:2870-2881`) → `automationLogger.listSessions()` reads the index (`automation-logger.js:1209-1220`), so those ids appear. `get_session_detail` → `handleGetSessionMessageRoute` (`:2904-2957`) → `automationLogger.loadSession()` reads only `fsbSessionLogs` (`automation-logger.js:1194-1207`), then falls back to `activeSessions`, which holds autopilot sessions rather than MCP recording runs (`:2933-2947`), and returns `session_not_found` (`:2949-2956`). The journal already exposes `hasSession` (`:2008-2011`), `getSessionDetail` (`:1631-1648`, paged, at most 500 events) and `exportHumanReadable` (`:2019`). The control panel already consults them first (`background.js:12513-12531`); only the MCP route never did.

**The fix:** in `handleGetSessionMessageRoute`, guard on `globalThis.FsbMcpLatticeJournal`. `tests/mcp-in-flight-session-lookup.test.js` runs the dispatcher in a `vm` without the journal, so the guard keeps it green. Try the journal first, as the UI does, then legacy, then in-flight. Return `{success, storageBackend:'journal-v2', session, events, nextSequence, hasMore}` with events projected to `{sequence, kind, timestamp, tool, success, route, timing}`; artifacts and request/result bodies stay out unless paged explicitly. For `format:'text'`, return `exportHumanReadable`. Optional additive `afterSequence`/`limit` parameters go at `observability.ts:47-49`.

**Where each timing stamp is captured:**

| Boundary | Integration point | Stamp |
|----------|------------------|-------|
| MCP server tool entry | Wrap tool callbacks once at registration (`runtime.ts:46-57`) with an `AsyncLocalStorage` context (`mcp/src/call-timing.ts`) | `serverReceivedAt`. `TaskQueue.enqueue` (`queue.ts:64-77`) sits between entry and send, so queue wait ≈ `bridgeSentAt − serverReceivedAt` |
| Server → bridge | `buildAgentPayload` (`agent-bridge.ts:71-104`), beside `recordingCallId` and `recordingLeaseMs` | Adds `recordingServerReceivedAt` (and optionally `recordingBridgeSentAt`) to the payload. Add the names to `INTERNAL_PAYLOAD_KEYS` (`mcp-lattice-journal.js:44-48`) so they are stripped from persisted payloads and replay, and to `RECORDING_SIDECAR_FIELDS` (`tests/mcp-tool-smoke.test.js:58`) |
| Extension ingress | `_handleMessage` (`mcp-bridge-client.js:1144-1199`), which already brackets every call with `recorder.beginCall`/`endCall` (`:1182-1197`) | `extReceivedAt` stored under a non-enumerable `Symbol` on the payload, following the `MCP_REPLAY_RECORD_CONTEXT` pattern (`mcp-tool-dispatcher.js:160`), so it is never serialized. Do not add timing to the `beginCall` identity: `tests/mcp-session-recorder-journal.test.js:92` deep-equals it |
| Action completion | `_handleExecuteAction` after `wrapWithChangeReport` resolves (`:1919-1933`), just before `_recordMcpSessionAction` | `completedAt`, `fsbMs`, plus `settleMs` from the change report and `expectMs` |
| Read/message completion | The `dispatchMcpMessageRoute` finally-block recorder entry (`mcp-tool-dispatcher.js:823-871`) | Same fields |
| Persistence (journal-v2) | `_snapshotJournalEntry` (`mcp-session-recorder.js:918-960`) → `journal.recordDispatch` → `recordDispatchNow` metadata (`mcp-lattice-journal.js:1210-1229`) | `metadata.timing = {serverReceivedAt, extReceivedAt, completedAt, fsbMs, settleMs, expectMs}`. `recordDispatchNow` stamps its own `at` after a write queue, so the call site must supply `completedAt`. Accumulate `run.fsbMs` for `timingSummary` in `buildIndexEntry` (`:836-872`) |
| Persistence (legacy recorder) | `session.actionHistory.push` (`mcp-session-recorder.js:2146-2152`) → `automationLogger.saveSession` | Add `durationMs`; the `saveSession` projection drops unknown fields (`automation-logger.js:964-973`), so extend the projection too |
| Autopilot LLM | `apiCallStartTime` already exists (`agent-loop.js:1936`) and `durationMs` is logged only at debug level (`:1986-1991`) | Add `llmMs` to the `AFTER_API_RESPONSE` context (`:2055-2062`); the new `timing-hook.js` records it |
| Autopilot tools | The `BEFORE_TOOL_EXECUTION` (`:2260`) and `AFTER_TOOL_EXECUTION` (`:2816`) emits already bracket each tool | The timing hook measures the gap. Denied tools skip the after-hook, so the next before-stamp must overwrite the open one. Register the before-stamp last so any confirmation wait is not counted as tool time |
| Autopilot persistence | `saveToLogger` (`agent-loop.js:1457-1465`) → `saveSession` projections (`automation-logger.js:904-916`, `:963-973`) | Add a capped `timing` array and `durationMs`/`decisionSource` on action rows; add a summary to the index row (`:982-1011`) |
| Exposure | `sanitizeSessionDetail` (`mcp-tool-dispatcher.js:2088-2116`) passes unknown fields through `sanitizeValue` (arrays capped at 100); `sanitizeActionHistoryEntry` (`:2072-2086`) is an allowlist | Add `durationMs` and `decisionSource` to that allowlist |

Server and extension share one wall clock (loopback), so cross-process subtraction is valid. Do not add `timing` to ordinary MCP tool responses: it adds tokens to every call and works against the milestone. Expose it through `get_session_detail`; only the `run_task` fast result carries a compact timing block.

### 3. Autopilot fast path

**Decision: an in-iteration decision source**, not a new executor and not hooks alone.

| Option | Verdict | Reason |
|--------|---------|--------|
| Hooks only | Rejected for the fast path; used for vetoes and safety | `HookPipeline` handlers can only stop or deny (`hook-pipeline.js:132-159`, denial consumed at `agent-loop.js:2267-2292`). No event can replace the LLM call (`:1954`), so hooks alone cannot make anything faster |
| Separate executor (jev-ultrafast style) | Rejected | It needs its own iterator or duplicate persistence, stuck detection, recording, overlay and ownership logic. A fifth `session._nextIterationTimer = setTimeout(...)` line breaks `tests/agent-loop-iterator-guard.test.js:49-69` (exactly four schedule lines), and any added `setTimeout` token breaks `tests/mcp-philosophy-parity-smoke.test.js:372-378` and `tests/lattice-survivability-smoke.test.js:371-372` (exactly eight). The escalation hand-off between two loops would also race on shared session state |
| **In-iteration decision source** | **Recommended** | One decision per iteration. A Jev-chosen call flows through the existing tool loop (`:2216-2822`): permission and Jev hooks, `_executeTool` (`:2671`), `actionHistory` (`:2798-2812`), the metrics recorder (`:2780`), the visual tick (`:2326-2340`), stuck detection (`:2899-2976`), persistence (`:2990`) and the existing 100 ms schedule (`:3031`) |

**Exact placement and control flow:**

1. **Decision site** between `agent-loop.js:1910` (screenshot-orphan expiry, after the `TranscriptStore` compaction at `:1898-1907`) and `:1911` (`buildTurnMessages`). If the fast path declines, it first flushes its pending step summary into `session.messages`, so the `turnMessages` built at `:1911` include it.
2. **Handled step:** set `toolCalls = [jevCall]` (with `source:'jev'`), `response = null` and zero usage, then skip the LLM-only block `:1911-2214` (turn build, screenshot attachment, overlay "thinking", API call, usage, `afterApiResponse`, end_turn branch, assistant push, `LLM_TURN` emission, parse, `toolCallLog`). The least-risk shape wraps that block in `if (!jevCall) { … }`. It contains one pinned schedule line (`:2177`), but the pin is a substring match, so re-indentation keeps it green. Code after the block reads `response` only behind `typeof response !== 'undefined' && response` (`:2776`), and `inputTokens`/`outputTokens`/`iterationCost` default to 0.
3. **Tool results:** carry `source` on `toolResults.push` (`:2756`). At `:2831-2840`, Jev-sourced results go to `JevFastPath.recordStepResult(session, tr)` instead of a `role:'tool'` message. The next LLM turn receives one user-role summary ("FSB fast mode took 3 steps: clicked 'Search' (e12) → URL changed; …") plus the latest snapshot, which also saves the LLM a `get_page_snapshot` call. This is the provider-neutral pattern the loop already uses for stuck hints (`:2910`) and the attempt log (`:2888-2889`).
4. **Element menu:** the fast path requests the same snapshot the LLM gets: `chrome.tabs.sendMessage(tabId, {action:'getMarkdownSnapshot', options:{charBudget:12000, maxElements:80, includeRefTable:true}}, {frameId:0})`, mirroring `:2358-2362`. `buildMarkdownSnapshot` registers each element in `FSB.refMap` (`dom-analysis.js:2563-2573`; `RefMap` at `dom-state.js:614-654`), so the LLM and Jev share one ref generation. Build the ref table from `refMap` entries (role, accessible name, selector) plus `inferElementPurpose` flags (`dom-analysis.js:263+`: `sensitive` for password and card fields at `:369-394`, `danger` for destructive or logout controls at `:336-337` and `:490-491`). Drop `sensitive` elements and any input value before building state.
5. **Actions and freshness:** the chosen call uses the existing tools with a ref selector (`click` `{selector:'e12'}`; the schema already accepts refs). The content script resolves refs and rejects stale ones with `refStale:true` (`messaging.js:930-955`), which the fast path treats as an automatic escalation. Stability waits stay as they are (`actions.js:1427-1434`; click waits up to 3 s for 300 ms DOM-stable plus 200 ms network-quiet).
6. **Escalation back to the LLM loop:** declining means "run this iteration on the LLM". Triggers include low confidence, `none_of_the_above`, an operation needing text (`TYPE_TEXT` without a caller-supplied value), extraction, `goal_reached` above its cut (the LLM or `verify` must confirm), `stuck` above its cut, any risk flag, a stale ref, cross-origin navigation, frames, and N consecutive fast steps without an LLM re-plan. Never re-ask Jev to clear a threshold.
7. **Budgets versus `checkSafetyBreakers` (`:250-287`):** `iterationCount++` (`:1780`) counts every iteration, so a Jev step would consume the LLM iteration cap (user default 100, `background.js:13852`; 15 for multi-site at `:13953`). Track `agentState.fastStepCount` and apply `session.maxIterations` to `iterationCount − fastStepCount` (LLM turns). Enforce a separate fast-step cap and Jev-call cap in the fast-path module: in autopilot, exhausting them only switches the session to LLM-only; in MCP bounded mode they end the run with a typed `budget_exhausted`. Keep the 10-minute time limit (`:275-284`) and, for `run_task` fast, also take the minimum with `max_seconds`. Keep the existing reason strings; `mapSafetyReasonToConstant` and `tests/run-task-cleanup-paths.test.js` depend on them.
8. **Survivability:** background `persistSession` stores only a handful of fields (`background.js:4958-4991`), and restored sessions are stop-only (`:5005-5022`). Fast-mode state can therefore live on the in-memory session like the rest of the loop state; nothing new must survive eviction.

**Hooks used alongside the fast path (tighten-only):**

| Hook | Event | Behavior |
|------|-------|----------|
| Done-veto | `beforeToolExecution` when `toolName === 'complete_task'` (the `complete_task` branch is at `:2437`) | Asks a `goal_reached` Noul against current page text. A confident "no" returns `denied` once per session with "Completion withheld: verify with read_page …"; the existing denial branch (`:2267-2292`) gives the LLM an error result. Run shadow-only first |
| Stuck | `afterIteration` | Returns `{isStuck:true, hint}`; the loop already pushes hints (`:2908-2911`). It never force-stops on Jev alone |
| Risk | `beforeToolExecution` on mutation tools | Code rules first (`danger`/`sensitive` flags, purchase/post/send/delete keywords, vault tools), Jev Nouls second, then a policy combine. If flagged: autopilot shows a confirmation card (pattern: `paymentFillConfirmation`, `mcp-bridge-client.js:2979-3020`, two-minute cap) and denies on decline or timeout; MCP bounded mode ends with `needs_confirmation`. Jev failure contributes nothing, so behavior falls back to today's |

Autopilot has no generic confirmation gate today: `PermissionContext.isAllowed` is a stub that always returns true (`permission-context.js:56-62`), and `buildSystemPrompt` says "Execute autonomously" (`agent-loop.js:760`). The risk hook therefore adds a new confirmation surface, and code rules must decide on their own for it to be "never the sole gate". The only live confirmation flow today is the vault's payment fill.

### 4. MCP `expect` parameter, end to end

```
mcp/src/tools/manual.ts:251 jsonSchemaToZod(tool.inputSchema)   ← registry schema now includes `expect`
  → handler :266-295 (visual-field gate, strip, transform) → execAction :162-231
  → sendAgentScopedBridgeMessage('mcp:execute-action', {tool, params:{…, expect}})     (agent-bridge.ts:136)
  → WS → mcp-bridge-client.js _handleMessage :1144 → _routeMessage :1283 → _handleExecuteAction :1745
      split `expect` out of params (:1754) so it never reaches content tools (:1886-1891)
  → wrapWithChangeReport({toolName, tabId, params, expect, execute})     (mcp-tool-dispatcher.js:3825)
      execute() → stability race (:3861-3868, 500 ms cap) → change_report (:3899-3913)
      [NEW] expect-evaluator: poll ISOLATED-world predicate check until met or timeout_ms
      response.expect_result = {met, checks:[{kind, expected, observed, met}], waited_ms}
  → _recordMcpSessionAction (timing incl. expectMs) → _sendResult → server
  → mapFSBError(result) serializes success JSON verbatim (errors.ts:425-427) → caller
```

| Decision | Recommendation |
|----------|----------------|
| Schema location | In the registry, via `withExpectField()` applied to the 32 `_emitChangeReport` tools (execute_js, navigate, go_back, go_forward, refresh, click, type_text, press_enter, press_key, select_option, check_box, right_click, double_click, select_text_range, drag_drop, drop_file, clear_input, scroll_to_top, scroll_to_bottom, scroll_to_element, open_tab, switch_tab, close_tab, fill_sheet, click_at, click_and_hold, drag, drag_variable_speed, insert_text, double_click_at, set_attribute, upload_file), plus inline on `back` (`agents.ts`). This follows the visual-session precedent and preserves INV-02: an MCP-only parameter would make the MCP schema diverge from what autopilot sees through `getPublicTools()` (`agent-loop.js:701-707`) |
| Gating | Refactor the early return at `:3840`, which skips everything when the tool flag or the global change-report toggle is off, so `expect` still runs when change reports are disabled. Keep the "toggle off and no `expect` → zero injections" behavior that `tests/change-report-toggle.test.js` and `tests/change-report-dispatcher.test.js` exercise |
| Page-side check | `chrome.scripting.executeScript` with a `func` in the default ISOLATED world. `_injectFn` (`:3785-3800`) uses the MAIN world for mutation harvesting; predicates should not be spoofable by page scripts. No manifest change and no `CONTENT_SCRIPT_FILES` (`background.js:839`) change |
| Type | Code predicates only (`FEATURES.md` lists `url_includes`, `title_includes`, `text_visible`, `text_gone`, `selector_visible`, `selector_gone`, `value_equals`, `dialog_opened`, `timeout_ms`). A structured object requires a closed `object` branch in `jsonSchemaToZod` (`schema-bridge.ts:86-114`), because `default: z.any()` would publish an untyped schema. A single string grammar avoids that work. This is a planning decision; either way it is one parameter, never flat `expect_*` fields |
| Synthetic change-report tools | `open_tab` and `close_tab` bypass the wrapper (`MCP_DISPATCHER_SYNTHETIC_CHANGE_REPORT_TOOLS`, `mcp-bridge-client.js:44`), so evaluate `expect` on their dispatch path explicitly or leave them out |
| Autopilot parity | The autopilot LLM will see `expect`. At minimum, strip it in `executeTool` (`tool-executor.js:840-876`); preferably evaluate it with the same evaluator in the tool branch (`agent-loop.js:2636-2684`) |

### 5. Bounded fast `run_task`, end to end

```
autopilot.ts:33-35  server.tool('run_task', desc, { task, + mode?, max_steps?, max_seconds?, verify?, values? })
  :121  startPayload = { task } + (mode === 'fast' ? { fastMode: {...} } : {})   ← omit entirely when absent
  :124  sendAgentScopedBridgeMessage('mcp:start-automation', …, { timeout: 600_000, onProgress })
→ mcp-bridge-client.js:1286 _handleStartAutomation :2349 → dispatchMcpMessageRoute
→ mcp-tool-dispatcher.js handleStartAutomationRoute :2636-2680
      callCallbackHandler('handleStartAutomation', {action, task, tabId, source:'mcp', agentId,
                                                    ownershipToken, + fastMode})      ← :2670-2677 rebuilds fields
→ background.js handleStartAutomation :13624
      provider-kind 'agent' early return :13639-13647  (decide: fast+caller-escalation may not need an LLM)
      validate/clamp fastMode; sessionData.fastMode (:13882-13921); runAgentLoop (:14144)
→ agent-loop.js runAgentIteration → fast path with escalation:'caller'
      done → verify predicates (expect-evaluator) → createTerminalOutcome(...)
      uncertain / needs text / risky / budget → terminal typed outcome (no LLM call)
→ notifySidepanel → fsbAutomationLifecycleBus (agent-loop.js:1540-1549) carries a `fast` summary
→ _handleStartAutomation handleComplete :2580-2586 → settle({sessionId, status, result, + fast})
→ autopilot.ts:205 mapFSBError(result) → caller gets the typed outcome + compact step trace + timing
```

- **Byte stability:** `tests/mcp-tool-smoke.test.js:327-332` deep-equals the `mcp:start-automation` payload for a plain `run_task` call (`{task, agentId, ownershipToken}`), so `fastMode` must be absent unless requested. New number parameters must use `z.coerce.number()`: `tests/mcp-numeric-param-coercion.test.js:257-287` fails on any bare `z.number(` in `mcp/src/tools/`.
- **Escalation target:** MCP fast mode escalates to the caller by default: no in-extension LLM, typed `ambiguous`, `needs_input`, `needs_confirmation`, `blocked` or `budget_exhausted` with enough state for the caller to finish in one more call. That matches the finding that MCP time is caller time. Autopilot fast mode escalates to the LLM. Both share one executor, parameterized by `session.fastMode.escalation`.
- **Bounds:** `max_steps` and `max_seconds` are enforced in the fast-path module; the 600 s safety net (`mcp-bridge-client.js:2499-2541`) stays as the backstop. Heartbeats already report `step` and `elapsed_ms` (`:2392-2409`).
- **Unavailable Jev:** return a fast typed error such as `FAST_MODE_UNAVAILABLE` (no key, breaker open, unvalidated snapshot) rather than silently running slow autopilot. New typed codes need a pass-through entry in `mcp/src/errors.ts` (`CODE_ONLY_ERROR_KEYS` `:54-78`).

### 6. Tool descriptions: where they live and how to cut them

Live measurement (in-process `createRuntime()` against `mcp/build`, 2026-09-28): **72 tools registered** (PROJECT.md says 73 and the READMEs say 69). The 54 registry tools and 18 inline tools together carry 54,482 description characters and 33,961 parameter-description characters. Three registry tools (`wait_for_element`, `wait_for_stable`, `report_progress`) are never registered because `read-only.ts:118-121` skips tools without a `MESSAGE_TYPE_MAP` entry.

| Source | Where | Size | How to shorten |
|--------|-------|------|----------------|
| Registry descriptions (57 tools) | `extension/ai/tool-definitions.js` from `:95` | 34,555 characters; `execute_js` 1,753, `upload_file` 1,247, `click` 1,205 | Rewrite each tool to state purpose plus its one or two unique rules; remove the 184-character multi-agent boilerplate repeated 43 times (7.9k) |
| `change_report` suffix | `mcp/src/tools/manual.ts:27-28`, appended at `:258-260` | 434 × 32 = 13.9k, plus the inline paragraph in `back` (`agents.ts:34`) | Reduce to one short clause and move the contract into server `instructions`. MCP-only, so autopilot is unaffected |
| Visual-session parameter blurbs | `VISUAL_SESSION_FIELDS` (`tool-definitions.js:36-49`), merged into 37 action tools | 13,431 characters | Shrink each to about 60 characters; the allowlist rule moves to `instructions` |
| `tab_id` parameter blurbs | Inline per tool | 10,033 characters | Hoist to a shared constant with a short text |
| 18 inline tools | `autopilot.ts`, `observability.ts`, `vault.ts`, `capabilities.ts`, `agents.ts`, `visual-session.ts` | ~9.6k | Shorten in place; the two `TOOL_REMOVED` stubs (462 and 507 characters) can be one line each |
| Cross-cutting rules | `mcp/src/server.ts:9-21` → `ServerOptions.instructions` | new | At most 2 KB (Claude Code truncates longer instructions, per `STACK.md`) |

**Parity and tests:**
- Edit only `extension/ai/tool-definitions.js`. `npm --prefix mcp run build` copies it to `mcp/ai/tool-definitions.cjs` (`mcp/package.json` build script), and `tests/tool-definitions-parity.test.js:95-101` requires the two files to be byte-identical. `npm test` runs the MCP build inside the chain, but commit both files together.
- `EXPECTED_NON_TRIGGER_REGISTRY_HASH` (`b9c30a5a…`) hashes whole registry entries, descriptions included, and is pinned in three places: `tests/tool-definitions-parity.test.js:52`, `tests/capability-mcp-surface.test.js:58` and `tests/capability-autopilot-parity.test.js:42`. Re-baseline all three in the same commit with a written rationale. Recommended: replace it with a *shape hash* (names, parameter names, types, required, enums) plus a description budget gate, so later additive parameters such as `expect` update the shape hash through an allowlist of additive optional parameters.
- No test asserts description substrings (a grep for the suffix, boilerplate and `run_task` guidance found none). `tests/visual-session-schema-lock.test.js` checks field *presence* and counts (37 action and 19 read-only tools, `:68-69` and `:151`), and those stay unchanged.
- The descriptions are also autopilot prompt text: `getPublicTools()` (`agent-loop.js:701-707`) sends them to the autopilot LLM. Capture the autopilot baseline *before* this phase and benchmark both sides after it.
- Documentation counts stay as they are because no tools are added (`tests/mcp-version-parity.test.js:322-339` pins "69 registered MCP tools" and "Tools (69 Total)"). The budget gate should count from the live runtime rather than the docs.
- Annotations (`readOnlyHint` and others) and `_meta` are optional add-ons: the SDK's `server.tool(name, desc, schema, annotations, cb)` overload takes annotations without migrating, but `_meta` (`anthropic/alwaysLoad`) needs `registerTool`, which touches `manual.ts`, `read-only.ts`, `triggers.ts` and `tests/mcp-smoke-harness.js`.

### 7. Release: the version bump

`scripts/sync-product-version.mjs` refuses to run until the changelog is authored (`:201-228`). The extension domain requires `## v1.0.0` at the top of `CHANGELOG.md`; the MCP domain requires `<a id="v0.12.0"></a>` and `## 0.12.0 (` at the top of `mcp/CHANGELOG.md`. `tests/mcp-version-parity.test.js:307-313` also requires the root v1.0.0 section to contain "align at \`1.0.0\`" and "advances to \`0.12.0\`".

| Domain | Files written (`sync-product-version.mjs:16-59`) |
|--------|-----------------------------------------------|
| Extension (`npm run version:set:extension -- 1.0.0`) | `extension/manifest.json` (version, and name `FSB v1.0.0`), `package.json` (version and badge), `package-lock.json`, `showcase/angular/package.json` and lock, `showcase/angular/src/app/core/seo/version.ts`, `showcase/server/package.json` and lock, `skills/fsb/SKILL.md` |
| MCP (`npm run version:set:mcp -- 0.12.0`) | `mcp/package.json` and lock, `mcp/server.json`, `mcp/build/version.{js,d.ts}`, `mcp/src/version.ts` (`FSB_MCP_VERSION`), `mcp/native-host/runtime-integrity.json` |
| Current-surface text (both) | `README.md`, `CHANGELOG.md`, `extension/README.md`, `extension/ui/onboarding.js`, `extension/ui/options.js`, `extension/ui/sidepanel.js`, `mcp/README.md` ("MCP 0.12.0 requires extension 1.0.0 or newer"), `mcp/CHANGELOG.md`, `mcp/src/index.ts`, `mcp/src/install.ts`, `mcp/src/platforms.ts`, `showcase/about.html`, the four `llms*` sources and public files, `skills/fsb/references/multi-agent-contract.md`, `store-assets/chrome-web-store/listing-copy.md`, `.github/workflows/npm-publish.yml`, `.github/workflows/chrome-extension.yml` |

Both setters call `setMcpReadmeSurfaces` with the other domain's current version, so running both in either order converges. `npm test` begins with `tests/version-sync.test.js` (the `pretest` script), and `npm run version:check` verifies both domains.

## Architectural Patterns

### Pattern 1: Decision source inside the existing iteration

**What:** A per-iteration branch chooses who decides this step (Jev or the LLM). The step then continues on the existing rails.
**When to use:** Any accelerator that replaces a model turn without changing what happens after the decision.
**Trade-offs:** Minimal duplication and every safety, recording and survivability path reused. The cost is a conditional around roughly 300 lines of `agent-loop.js` and careful handling of transcript pairing.

```js
// agent-loop.js, between :1910 and :1911 (sketch; names are proposals)
var jev = (typeof globalThis !== 'undefined') ? globalThis.FsbJevFastPath : null;
var jevStep = (jev && session.fastMode && session.fastMode.enabled)
  ? await jev.nextStep(session, { sessionId: sessionId, iteration: iterNum })
  : null;                                   // declines flush the step summary first
if (jevStep && jevStep.terminal) {          // MCP bounded mode: typed outcome, no LLM
  var fastTerminal = createTerminalOutcome(jevStep.terminal.outcome, jevStep.terminal);
  applyTerminalOutcome(session, fastTerminal);
  await persist(sessionId, session);
  await finalizeSession(sessionId, session, fastTerminal);
  return;
}
var jevCall = jevStep && jevStep.toolCall;   // { id, name, args, source: 'jev' }
if (!jevCall) {
  // existing :1911-:2214 unchanged (turn build, API call, usage, end_turn, parse)
} else {
  toolCalls = [jevCall];
}
// existing tool loop :2216 onward; results with source 'jev' skip the role:'tool' push
```

The Jev timeout lives in `jev-client.js`: a `setTimeout` token added anywhere in `agent-loop.js` breaks the count-of-eight pin.

### Pattern 2: Tighten-only lifecycle hooks

**What:** Jev contributes additional denials or confirmation requirements through `beforeToolExecution` and hints through `afterIteration`; it never grants.
**When to use:** Completion vetoes, risk signals and stuck second opinions.
**Trade-offs:** No loop surgery beyond passing `args` and `origin`. Hooks run sequentially with no timeout, so each must bound its own wait and fail to "no contribution".

```js
function createJevRiskHook(client, policy) {
  return async function (ctx) {                      // ctx: toolName, args, origin, session
    if (!policy.isMutation(ctx.toolName)) return { shouldStop: false, denied: false };
    var codeRisk = policy.codeRisk(ctx);             // decides on its own; Jev never cancels it
    var jevRisk = await client.decide(policy.riskQuestions(ctx), { timeoutMs: 800 }).catch(function () { return null; });
    if (!policy.needsConfirmation(codeRisk, jevRisk)) return { shouldStop: false, denied: false };
    var approved = await policy.confirm(ctx);        // sidepanel card; decline or timeout → deny
    return approved ? { shouldStop: false, denied: false }
                    : { shouldStop: false, denied: true, denial: { reason: 'User confirmation required' } };
  };
}
```

### Pattern 3: Journal-first session lookup

**What:** Resolve a session id against the durable journal before the legacy log store, mirroring the control-panel path.
**When to use:** Any MCP observability route that accepts ids from `list_sessions`.

```js
var journal = (typeof globalThis !== 'undefined') ? globalThis.FsbMcpLatticeJournal : null;
if (journal && typeof journal.hasSession === 'function' && await journal.hasSession(payload.sessionId)) {
  if (payload.format === 'text') {
    return { success: true, format: 'text', text: await journal.exportHumanReadable(payload.sessionId) };
  }
  var detail = await journal.getSessionDetail({ sessionId: payload.sessionId,
    afterSequence: payload.afterSequence, limit: payload.limit });
  return { success: true, storageBackend: 'journal-v2', session: sanitizeSessionMetadata(detail.session),
    events: detail.events.map(projectJournalEventForMcp), nextSequence: detail.nextSequence, hasMore: detail.hasMore };
}
// then the existing automationLogger.loadSession and in-flight fallbacks
```

### Pattern 4: Internal sidecars for cross-process timing

**What:** Timing crosses the bridge beside `recordingCallId` as internal top-level payload fields (server stamps) or as non-enumerable `Symbol` properties (extension stamps), and is stripped before persistence or replay.
**When to use:** Metadata that must not alter tool semantics, replay manifests or caller-visible responses.
**Trade-offs:** Two allowlists must learn the new names (`INTERNAL_PAYLOAD_KEYS`; the smoke test's `RECORDING_SIDECAR_FIELDS`).

### Pattern 5: Code-evaluated outcomes in the existing settle window

**What:** `expect`, `verify` and fast-mode "done" share one predicate evaluator. It runs right after the stability race `wrapWithChangeReport` already performs, in the ISOLATED world, and polls only until met.
**Trade-offs:** Adds up to `timeout_ms` per call when a check is unmet, but it replaces a whole caller turn (4.6–9.5 s median) when met.

## Data Flow

### Autopilot fast step

```
runAgentIteration (iteration N)
  beforeIteration hooks (safety breakers, LLM-turn cap)
  JevFastPath.nextStep
    → content getMarkdownSnapshot{includeRefTable} → refs (sensitive removed) + visible text
    → JevClient.decide(one request: operation Choice + target Choice per op + goal_reached + stuck Nouls)
    → validate → thresholds (backend + pinned version) → toolCall | decline(flush summary) | terminal
  tool loop: beforeToolExecution (permission → Jev risk → timing) → _executeTool → content action
  afterToolExecution → actionHistory {decisionSource:'jev'} → recordStepResult (no role:'tool')
  afterIteration (stuck + Jev stuck + timing) → persist → existing 100 ms schedule
iteration N+1: LLM runs only if the fast path declines; it first receives the summary and snapshot
```

### MCP call timing

```
host tools/call ─► [serverReceivedAt] queue.enqueue ─► buildAgentPayload(+recordingServerReceivedAt)
  ─► WS ─► _handleMessage [extReceivedAt: Symbol] ─► route ─► execute ─► change_report/expect
  ─► [completedAt] recorder entry.timing ─► journal tool.call.metadata.timing ─► run.fsbMs
  ─► _sendResult ─► server ─► host
analyzer: caller gap = serverReceivedAt[n] − completedAt[n−1];  FSB time = completedAt − extReceivedAt
```

### Key Data Flows

1. **Settings:** control panel card → `chrome.storage.local` (`jev*`, `typesafeApiKey`, the existing `openrouterApiKey`) → the Jev client reads them at call time (no cache that survives key edits; `Config` already invalidates on `storage.onChanged`, `config.js:68-75`).
2. **Shadow calibration:** each LLM iteration optionally runs a parallel Jev decision (started before the LLM call and awaited after parsing), logs {Jev pick, confidence, LLM call, code-verified outcome} on the session, and persists it with timing, so the benchmark can set thresholds per pinned version before any live fast step.
3. **`run_task` fast result:** fast summary on `session` → lifecycle bus message → `settle` value → `mapFSBError` JSON → caller.

## Source-Pin Tripwire Register

| Test (file:line) | What it pins | Change that trips it | Paired update |
|------------------|--------------|----------------------|---------------|
| `tests/agent-loop-iterator-guard.test.js:49-69` | Four exact `session._nextIterationTimer = setTimeout(...)` lines | A new schedule site | Do not add one; route fast steps through the existing tail |
| `tests/mcp-philosophy-parity-smoke.test.js:372-378`, `tests/lattice-survivability-smoke.test.js:371-372` | Exactly eight `setTimeout` tokens in `agent-loop.js` (comments count) | Any Jev timeout or comment mentioning the token | Keep timers in `jev-client.js`; avoid the word in comments |
| `tests/lattice-step-emitter-smoke.test.js:156-161` | Exactly one `stepName: 'LLM_TURN'` and one `TOOL_DISPATCH` | Emitting a step for Jev decisions | Reuse the existing `TOOL_DISPATCH`; no new `LLM_TURN` literal |
| `tests/lattice-provider-bridge-smoke.test.js:634-635`, `:682-683` | 333 `importScripts` tokens and 329 call sites in `background.js`; adjacency of `cli-parser`/`lattice-provider-bridge` | Each new service-worker module | Bump both counts and extend the comment ledger; import in the agent-engine block (`:801-817`), away from the pinned cluster |
| `tests/tool-definitions-parity.test.js:52, 95-101`; `tests/capability-mcp-surface.test.js:58`; `tests/capability-autopilot-parity.test.js:42` | Byte identity of `.js`/`.cjs` and the full-definition registry hash | Any description or schema edit, including `expect` | Rebuild the copy; re-baseline or split the hash in all three tests in one commit |
| `tests/mcp-tool-smoke.test.js:58, 290-332` | Exact bridge payloads (recording sidecars stripped by name) | Timing sidecars; `fastMode` always present | Add names to `RECORDING_SIDECAR_FIELDS`; omit `fastMode` when absent |
| `tests/mcp-session-recorder-journal.test.js:92` | `beginCall` identity deep-equal | Timing on the call identity | Put timing on dispatch entries only |
| `tests/mcp-in-flight-session-lookup.test.js` | Legacy and in-flight lookup in a `vm` without the journal | Unguarded journal access | Guard on `globalThis.FsbMcpLatticeJournal`; add a journal case |
| `tests/delegation-routing.test.js:353-359` | Exact `EXECUTION_MODES` keys and objects | A `fast` execution mode | Model fast mode as `session.fastMode`, not a mode |
| `tests/provider-parity.test.js` (seven `PROVIDER_KEYS`), `tests/providers-panel-logic.test.js`, `tests/providers-panel-ui.test.js` | Seven API providers | Jev added as a provider | Keep Jev in its own card and module |
| `tests/visual-session-schema-lock.test.js:68-69, 151` | 37 action and 19 read-only tools; presence of visual fields | Reclassifying tools; adding visual fields to read tools | `expect` only on action tools |
| `tests/mcp-numeric-param-coercion.test.js:257-287` | No bare `z.number(` in `mcp/src/tools` | New `run_task` numbers | Use `z.coerce.number()` |
| `tests/change-report-toggle.test.js`, `tests/change-report-dispatcher.test.js` | Toggle-off wrapper does zero injection | The `expect` refactor of the `:3840` gate | Keep zero injection when the toggle is off and `expect` is absent |
| `tests/cost-tracker-ordering.test.js:37-60`, `tests/meta-cognitive-tracker.test.js:35-48`, `tests/ownership-leakage-regression.test.js:20-44`, `tests/run-task-cleanup-paths.test.js:165-185` | Exact substrings, helper extraction markers and function-body anchors inside `agent-loop.js` | Renaming or moving those anchors while restructuring `runAgentIteration` | Keep the anchored lines verbatim; re-run these four tests after every loop edit |
| `tests/mcp-version-parity.test.js:292-339` | Changelog, README and LLM-file release text; the 69-tool documentation claims | The release phase | Author changelogs before `version:set`; keep tool counts unchanged |
| Archived planning reads (`.planning/v0.9.62-CONTRACT.md`, `.planning/LATTICE-PIN.md`, `.planning/milestones/v0.9.91-*`, `.planning/phases/*`) | Tests read these files | Moving or renaming them | Add new phase directories only; never move archived ones |

New test files must be appended to the `&&` chain in the root `package.json` `test` script; there is no glob runner.

## Suggested Build Order

Phases continue from 66. The order puts measurement first so a true "before" exists, then Jev-free MCP wins, then Jev infrastructure in shadow mode, then the live fast paths, then the release.

| Phase | Scope | Depends on | Tripwires to move in the same commits |
|-------|-------|------------|---------------------------------------|
| **66 Measurement floor** | Journal branch in `get_session_detail`; per-call timing (server sidecar, ingress `Symbol`, recorder, journal metadata, autopilot timing hook, logger projections); benchmark runner skeleton, timing report, `tools/list` budget script. **Capture the MCP and autopilot baselines before Phase 67** (no autopilot sessions exist today, and the description cut changes autopilot prompts) | nothing | `importScripts` counts (+1), `RECORDING_SIDECAR_FIELDS`, `INTERNAL_PAYLOAD_KEYS`, the in-flight lookup test, journal tests |
| **67 MCP surface diet** | Shorter registry, parameter, suffix and inline descriptions; server `instructions`; optional annotations; budget gate test | 66 (baseline captured) | The three registry-hash tests (re-baseline or split), `.cjs` parity; re-run autopilot benchmarks |
| **68 `expect` on action tools** | `withExpectField`, `expect-evaluator.js`, the `wrapWithChangeReport` refactor, the `_handleExecuteAction` split, the schema-bridge object branch if structured, autopilot strip or evaluate | 66 (timing includes `expectMs`); schedule after 67 so the hash moves once more, or fold into 67 if using the shape-hash split | Registry hash (or shape hash), change-report toggle tests, `importScripts` (+1) |
| **69 Jev client and Decision provider UI** | `jev-client.js`, settings keys and card, status/test messages, cost pricing, rate limiter and breaker; no behavior change | nothing (can run in parallel with 67–68) | `importScripts` (+1), `control_panel.html`/`options.js` UI pins, providers-panel tests untouched |
| **70 Shadow mode and calibration** | `jev-fast-path.js` state builder and instrument; `includeRefTable` snapshot; decision log; done-veto and stuck hooks in shadow; threshold constants per pinned model; calibration report | 66, 69 | `importScripts` (+1 or +2), `agent-loop.js` additive hook context (`args`, `origin`, `llmMs`), the agent-loop anchor tests |
| **71 Autopilot fast mode (opt-in)** | Decision site, LLM-turn versus fast-step accounting, transcript summary, escalation policy, risk hook with sidepanel confirmation, overlay "Fast" state | 70 (thresholds); 68 (shared evaluator for done checks) | Every `agent-loop.js` pin (8 `setTimeout`, 4 schedules, one `LLM_TURN`/`TOOL_DISPATCH`, anchors), sidepanel tests |
| **72 `run_task` bounded fast mode** | Additive MCP parameters; five-hop threading; caller escalation; typed outcomes with `verify`; `FAST_MODE_UNAVAILABLE`; updated `run_task` description | 71 (same executor), 68 (`verify`) | `mcp-tool-smoke` payload deep-equal, numeric coercion guard, `errors.ts` pass-through list |
| **73 After-benchmarks and release** | After-runs on every arm; CHANGELOG `v1.0.0` and MCP `0.12.0` entries; `version:set:mcp` then `version:set:extension`; docs | all | `mcp-version-parity`, `version-sync`, READMEs, native-host `runtime-integrity.json` |

**Ordering rationale:**
- The benchmark depends on the session-detail fix and timing. Both baselines must be captured before Phase 67, because shorter descriptions alter autopilot prompts as well as MCP.
- The description diet and `expect` need no Jev, deliver most of the MCP targets (tool-list tokens and fewer verification turns) and de-risk the milestone if Jev access degrades. Signups are closed and there is no SLA.
- The Jev client can proceed in parallel with 67–68 because it changes no behavior.
- Fast modes need calibrated thresholds, which need the shadow log running on FSB's own tasks against the pinned version.
- `run_task` fast mode reuses the autopilot executor, so it follows Phase 71.
- The version bump comes last because the sync script rewrites `options.js` and `sidepanel.js`, which Phases 69 and 71 edit.

**Research flags:** Phase 71 needs deeper phase research: the exact `runAgentIteration` restructure against the anchor tests, summary-message wording per provider, and confirmation UX. Phase 68 needs a decision between a structured object and a string. Phase 66 is standard patterns. Phase 72 needs a decision on the delegated-provider early return (`background.js:13639-13647`).

## Scaling Considerations

| Scale | Architecture adjustments |
|-------|--------------------------|
| One user, one autopilot session | Everything is in-memory on the session; each fast step makes one Jev request carrying all questions for that step, never parallel requests |
| Eight concurrent agents (the default cap) | At about 2.4 requests per second per agent (jev-ultrafast's published pace), eight agents reach about 1,150 requests per minute, at the edge of TypeSafe's documented 1,200 (OpenRouter's limits are undocumented). Use one shared `JevClient` per service worker with a global token bucket and an in-flight cap; a breaker on 429/529 drops sessions to the LLM path |
| Storage growth | Journal timing adds about 100 bytes per event against a 512 MiB budget (`MAX_ENCODED_BYTES`) and a 50-run history cap; the autopilot `timing` array must be capped (about 200 entries) because `saveSession` rewrites the whole `fsbSessionLogs` map each save |

### Scaling Priorities

1. **First bottleneck:** Jev rate limits and cold-connection latency (about 1.2 s on a fresh TLS connection, per community measurements). Fix with a warm-up request at fast-mode session start and the shared limiter.
2. **Second bottleneck:** Remaining LLM steps dominate wall time in autopilot. Fix with the step-summary-plus-snapshot hand-off (one fewer `get_page_snapshot` per escalation) and, later, a smaller model for typed text.

## Anti-Patterns

### Anti-Pattern 1: Jev as another chat provider

**What people do:** Add `typesafe` to `PROVIDER_CONFIGS` or `API_PROVIDER_IDS` and route it through `UniversalProvider`.
**Why it's wrong:** `/v1/systemone` is not a chat API. It breaks seven-provider parity pins and makes Jev selectable as the planner.
**Do this instead:** A separate `JevClient` and its own settings card.

### Anti-Pattern 2: A second autopilot loop

**What people do:** Build a jev-ultrafast-style executor with its own `setTimeout` chain and hand off to the LLM loop.
**Why it's wrong:** It breaks the INV-04 pins, duplicates the safety, recording and ownership logic, and races on session state during hand-off.
**Do this instead:** One decision site inside `runAgentIteration`.

### Anti-Pattern 3: Synthetic assistant tool calls in the transcript

**What people do:** Fabricate provider-format assistant messages so Jev steps look like LLM steps.
**Why it's wrong:** Gemini 3 validates thought signatures on every `functionCall` in the current turn and returns 400 without one. The documented dummy signature is a last resort that degrades reasoning and reportedly fails through OpenRouter. Pairing rules differ per provider.
**Do this instead:** Log Jev steps on the session and flush one user-role summary.

### Anti-Pattern 4: Letting Jev loosen a gate

**What people do:** Skip confirmations when Jev's risk probability is low, or let a Jev "yes" auto-approve.
**Why it's wrong:** Jev is susceptible to injected page text, and community gate tests needed a 0.8 floor that escalated 58% of normal traffic to catch every attack.
**Do this instead:** Code rules decide first; Jev can only add a confirmation or a denial; a Jev failure contributes nothing.

### Anti-Pattern 5: New tools or per-field parameters for speed features

**What people do:** Add `browser_goal`, `verify_page`, or flat `expect_url`/`expect_text` parameters.
**Why it's wrong:** It violates INV-01's additive-only rule and re-bloats the surface the milestone is trimming.
**Do this instead:** One `expect` parameter on action tools and optional parameters on `run_task`.

### Anti-Pattern 6: Editing the build copy or dodging pins

**What people do:** Hand-edit `mcp/ai/tool-definitions.cjs`, or lazy-load modules from `agent-loop.js` to keep the `importScripts` count flat.
**Why it's wrong:** Byte parity breaks, or the service-worker load graph stops being explicit.
**Do this instead:** Edit the `.js` source, rebuild, and bump the pinned counts honestly in the same commit.

### Anti-Pattern 7: Timing in every MCP response

**What people do:** Append a `timing` object to all tool results.
**Why it's wrong:** It adds tokens to every caller turn, the opposite of the goal.
**Do this instead:** Persist timing in the journal and logger and expose it through `get_session_detail`; only `run_task` fast returns a compact trace.

## Integration Points

### External Services

| Service | Integration pattern | Notes |
|---------|---------------------|-------|
| OpenRouter System One | `POST https://openrouter.ai/api/v1/systemone`, `Authorization: Bearer <openrouterApiKey>`, `model: typesafe/jev-1.13` | Returns `id`, dated `model`, `provider` and `usage.cost`; errors are `{error:{code,message}}`; 32k context; limits undocumented. The alpha Decisions API (`/api/alpha/decisions`) has a different schema; do not use it |
| TypeSafe direct | `POST https://api.typesafe.ai/v1/systemone`, `model: jev-1.13.0` | Documented 401, 422, 429 and 529 (testers also saw 400 and 403); signups closed since 2026-09-22; no SLA |
| LLM providers (seven) | Unchanged (`universal-provider.js`) | Fast mode reduces how often they are called; the transcript strategy keeps all seven compatible |
| Host permissions | `<all_urls>` in `extension/manifest.json` | Service-worker `fetch` to both Jev routes needs no manifest change |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| MCP server ↔ extension | WebSocket `mcp:*` JSON with internal `recording*` sidecars | Additive only. Sidecars are stripped by `INTERNAL_PAYLOAD_KEYS` before journal persistence and replay |
| `mcp-bridge-client` ↔ `mcp-tool-dispatcher` | In-service-worker calls; `Symbol`-keyed per-call context | Nothing serialized; recorder calls stay fire-and-forget |
| `agent-loop` ↔ `jev-fast-path` | `globalThis.FsbJevFastPath.nextStep` / `recordStepResult` / `flushSummary`; state on `session.fastMode`, `session.fastStepLog` | Lazy lookup at call time; the module owns every Jev timer |
| `jev-fast-path` ↔ content scripts | `chrome.tabs.sendMessage(getMarkdownSnapshot, includeRefTable)` in frame 0; actions through `_executeTool` | Shares one `RefMap` generation with the LLM path; stale refs escalate |
| Jev hooks ↔ side panel | Runtime-message confirmation card (payment-confirmation pattern) | Two-minute cap; closed side panel means denial |
| Dispatcher ↔ journal and logger | `hasSession`, `getSessionDetail`, `exportHumanReadable`; `loadSession`, `listSessions` | Journal first, legacy second, in-flight third |

## Open Questions and Gaps

- **Structured or string `expect`/`verify`:** structured needs schema-bridge object support and a check that nested schemas survive all seven autopilot formatters (`tool-use-adapter.js` passes schemas through). Decide in Phase 68 planning.
- **Delegated-provider early return:** `handleStartAutomation` hands agent-kind providers to delegation consent before creating a session (`background.js:13639-13647`). Decide whether `run_task` fast with caller escalation, which needs no LLM, should bypass that check.
- **Where the plan comes from in autopilot fast mode:** the task text plus `session.lastAiReasoning` (from `report_progress`) is the cheapest goal source. Whether to add a fast-mode instruction line (`buildSystemPrompt` at `agent-loop.js:724-761` has content tests) needs Phase 71 research.
- **Lattice step semantics:** Jev steps emit `TOOL_DISPATCH` with a hard-coded `previousStepName: 'LLM_TURN'` (`:2312`). Changing that literal may trip the step-emitter pins; accept the inaccuracy or verify the pin first.
- **Annotations, `instructions` and `alwaysLoad` behavior per client** come from `STACK.md`/`FEATURES.md` sources and were not re-verified here (MEDIUM). Measure them in the benchmark rather than assuming.
- **Tool count:** 72 in the stdio runtime versus "73" in PROJECT.md and "69" in the READMEs. Settle the canonical number with the budget gate before writing requirements that cite it.

## Sources

- Direct code reads at `HEAD 3cc18052` (branch `Jev`), 2026-09-28: `extension/ai/agent-loop.js`, `hook-pipeline.js`, `engine-config.js`, `permission-context.js`, `tool-definitions.js`, `tool-executor.js`, `tool-use-adapter.js`, `universal-provider.js`, `cost-tracker.js`; `extension/background.js`; `extension/ws/mcp-bridge-client.js`, `mcp-tool-dispatcher.js`; `extension/utils/automation-logger.js`, `mcp-lattice-journal.js`, `mcp-session-recorder.js`, `mcp-metrics-recorder.js`; `extension/content/dom-analysis.js`, `dom-state.js`, `messaging.js`, `actions.js`; `extension/ui/providers-panel.js`, `options.js`, `control_panel.html`; `extension/config/config.js`, `secure-config.js`; `mcp/src/server.ts`, `runtime.ts`, `agent-bridge.ts`, `bridge.ts`, `queue.ts`, `errors.ts`, `types.ts`, `tools/*.ts`; `scripts/sync-product-version.mjs`; the tests cited in the tripwire register. HIGH
- Live probe: in-process `createRuntime()` against `mcp/build` (built 2026-09-28 02:06): 72 tools, 54,482 description and 33,961 parameter-description characters; registry breakdown computed from `mcp/ai/tool-definitions.cjs`. HIGH
- `mcp/node_modules/@modelcontextprotocol/sdk` 1.29.0 type definitions: `ServerOptions.instructions` and the `server.tool` annotations overloads. HIGH
- [OpenRouter: Submit a System One request](https://openrouter.ai/docs/api/api-reference/systemone/submit-a-system-one-request) and [TypeSafe SDK integration](https://openrouter.ai/docs/guides/community/typesafe-sdk): endpoint, `typesafe/jev-1.13`, response `id`/`model`/`provider`/`usage.cost`, error envelope. HIGH
- [Gemini API: Thought signatures](https://ai.google.dev/gemini-api/docs/thought-signatures) and [Google Cloud: Thought signatures](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking/thought-signatures): current-turn validation, 400 on missing signatures, dummy signatures as a last resort. HIGH. [Google AI Developers Forum thread](https://discuss.ai.google.dev/t/gemini-3-thought-signature-is-not-valid-cant-do-multi-turn-tool-calling/119360/2): the workaround reportedly fails through OpenRouter. LOW
- `.planning/research/JEV-REFERENCE.md` (Jev limits, pricing, rate limits, failure modes, browser-agent evidence), `.planning/research/STACK.md` and `.planning/research/FEATURES.md` (sibling decisions this document aligns with). MEDIUM, inherited from their own sourcing

---
*Architecture research for: Jev Fast Mode integration into FSB's MV3 autopilot loop and MCP bridge*
*Researched: 2026-09-28*
