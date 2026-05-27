# Phase 6: FSB engine consumes Lattice provider abstraction - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning
**Mode:** Smart discuss (scope locked by ROADMAP; 3 grey areas resolved with planner)

<domain>
## Phase Boundary

Wire FSB's autopilot engine (`extension/ai/agent-loop.js`) and the settings test-connection path (`extension/ui/options.js`) to consume Lattice's 7 provider adapters (shipped Phase 4) through the offscreen Lattice host bus (extended over Phase 5 FINT-04), replacing FSB's own `extension/ai/universal-provider.js` as the runtime path. This phase promotes the FINT-KK..L work that v0.10.0 originally deferred as TBD. The migration closes the `xai-key-rejected-400` P1 (missing trim) + P2 (stale storage read) defects as side effects because the bridge takes the input field's current value, the Lattice adapter trims internally, and the test-connection path never re-reads chrome.storage. Additionally closes audit gap G3 (SW now opens the offscreen host at startup).

In scope: bridge handler in `extension/offscreen/lattice-host.js`, SW startup wiring in `extension/background.js`, new shim `extension/ai/lattice-provider-bridge.js`, agent-loop + options.js rewire under feature flag `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` default-on, defense-in-depth trim on saveSettings(), smoke test `tests/lattice-provider-bridge-smoke.test.js` (>= 20 PASS across all 7 providers), LATTICE-PIN.md bump, REQUIREMENTS.md FINT-07/08 fill + FINT-KK..L flip.

Out of scope: hard delete of `universal-provider.js` (Phase 7), feature flag removal (Phase 7), background.js classic-to-module migration (INV-04 carryforward), replacing the setTimeout iterator (INV-04), MCP wire / tool-definition changes (INV-01/02), Lattice-side code (Phase 4 already shipped adapters), streaming-aware responses (OOS-06), re-implementing the SW <-> offscreen bus (Phase 5 shipped it).

</domain>

<decisions>
## Implementation Decisions

### Bridge reply pattern (Q1)
- The offscreen `lattice-provider-execute` handler returns `true` from `chrome.runtime.onMessage` to keep the channel open, then invokes `sendResponse(envelope)` when the Lattice adapter resolves (success) or rejects (structured error envelope).
- Bridge shim `executeViaBridge()` awaits `chrome.runtime.sendMessage(...)` directly and unwraps the envelope. No correlation-ID bookkeeping needed for the primary request path.
- Diverges intentionally from Phase 5's fire-and-forget receipt-mint pattern (which has no caller waiting on a response). Phase 6 has request-response semantics, so the standard Chrome MV3 idiom (`return true` + `sendResponse`) is the correct match.

### AbortSignal propagation (Q2)
- Bridge generates a per-call `requestId` (UUID or counter), sends primary `{type: 'lattice-provider-execute', requestId, ...}`.
- When the caller-supplied `AbortSignal` fires, the bridge sends a companion `{type: 'lattice-provider-abort', requestId}` to the offscreen host.
- Offscreen handler maintains a `Map<requestId, AbortController>` for in-flight executions; on receiving the abort message, it calls `controller.abort()`, which Lattice's adapter consumes via the `{signal}` option to `adapter.execute(request, {signal})`.
- The original `sendResponse` resolves with an aborted envelope (`{ok: false, error: {kind: 'aborted', message: 'aborted by caller'}}`).
- Preserves Lattice's adapter-internal abort contract. Adds one small extra message handler in the offscreen host.

### Adapter lifecycle (Q3)
- Per-call instantiation: each `lattice-provider-execute` message builds a fresh adapter via the matching `createXAIProvider(config)` / `createAnthropicProvider(config)` / etc. factory, calls `execute(request, {signal})`, discards.
- No caching, no cache invalidation, no risk of stale config when the user changes a key or baseUrl in the UI.
- Matches Lattice's adapter design (configs are immutable per instance). Network round-trip dominates so the marginal CPU cost of factory invocation is negligible.

### Feature flag default (locked by ROADMAP)
- `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` defaults to `true`.
- Legacy `universal-provider.js` remains on disk as the flag-false fallback path for runtime rollback safety. Phase 7 strips the flag and archives `universal-provider.js`.

### Error envelope shape (Claude's Discretion)
- The bridge returns either `{ok: true, response: ProviderRunResponse}` (Lattice adapter's success shape passes through verbatim) or `{ok: false, error: {kind: 'aborted' | 'adapter_error' | 'host_unreachable' | 'invalid_provider', message: string, providerError?: any}}`. Planner finalizes per-case wording during plan-phase research.
- Bridge shim normalizes `ok: true` to the legacy `{rawOutput, normalizedUsage, ...}` shape that `agent-loop.js` callers expect so call-site diffs stay minimal (INV-04 setTimeout iterator stays byte-frozen). Planner verifies the normalization mapping against Lattice's `ProviderRunResponse` type during research.

### Test-connection rewrite (locked by ROADMAP)
- `checkApiConnection()` in `options.js` reads from `elements.apiKey?.value?.trim()` (NOT from chrome.storage), delegates to `executeViaBridge('xai' | 'anthropic' | ...)`, displays the bridge result.
- `saveSettings()` defense-in-depth: trim() applied uniformly to all 7 API key fields on save. Old un-trimmed stored values auto-heal on next user save.

### Post-research amendments (locked 2026-05-27 after RESEARCH.md Section 16)
- **Bridge strategy = A**: Offscreen handler does its own `fetch()` for the autopilot path, using FSB's pre-built `requestBody` (preserves multi-turn messages + tools + provider-specific cache_control / systemInstruction / generationConfig). Lattice provider factories are still imported + instantiated at the top of the offscreen module so the consumption pathway is wired and INV-03 holds at factory-dispatch level. Lattice `adapter.execute({task, artifacts, outputs})` is used for the **test-connection path only** (single-shot fits natively). Strategy B (refactor agent-loop + Lattice changes) rejected — violates INV-04 + INV-06. Strategy C (defer autopilot to v0.11.0+ passthrough adapter) rejected — defeats the xai-key-rejected-400 fix's reach.
- **chrome.offscreen.createDocument({reasons: ['WORKERS']})**: per Chrome docs, WORKERS accurately describes the offscreen page's purpose (fetch + JS execution outside the SW); IFRAME_SCRIPTING placeholder in earlier draft is superseded.
- **Request-ID generation = `crypto.randomUUID()`**: available since Chrome 92, FSB floor 116 — no polyfill needed.
- **importScripts insertion point**: `extension/background.js` after line 11 (`importScripts('ai/cli-parser.js');`), before line 12 (`importScripts('ai/ai-integration.js');`) — keeps the alphabetical-by-category ordering Phase 5 established.

### Claude's Discretion (post-research)
- Bridge shim file location (`extension/ai/lattice-provider-bridge.js` per ROADMAP).
- Error envelope wording per failure kind (`kind: 'aborted' | 'adapter_error' | 'host_unreachable' | 'invalid_provider' | 'fetch_error'`).
- Adapter factory dispatch map shape (planner picks: switch statement vs object literal).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 5)
- `extension/offscreen/lattice-host.html` + `extension/offscreen/lattice-host.js` already exist. The host registers `chrome.runtime.onMessage` for `lattice-step-transition` and replies via fresh `sendMessage` calls. Phase 6 extends this same file with a NEW message-type branch for `lattice-provider-execute` (and `lattice-provider-abort`) without disturbing the existing step-transition handler.
- `extension/ai/lattice-runtime-adapter.js` exists from Phase 5 FINT-04 — out of scope for Phase 6, but its pattern (factory function, options validation, JSDoc contract) is the template for `lattice-provider-bridge.js`.
- Lattice's 7 native provider adapters shipped via Phase 4: `createOpenAIProvider`, `createAnthropicProvider`, `createGeminiProvider`, `createXAIProvider`, `createOpenRouterProvider`, `createLMStudioProvider`, `createOpenAICompatibleProvider`. Each implements `ProviderAdapter.execute(request, {signal})` returning a `ProviderRunResponse`.

### Established Patterns (Phase 5)
- SW <-> offscreen origin check: `if (sender && sender.id && sender.id !== chrome.runtime.id) return false;` — Phase 6 reuses verbatim.
- Lattice bare-specifier import inside offscreen: `import { ... } from "lattice";` — esbuild rewrites at build time per Phase 5 Plan 05-01.
- Feature-flag uniform check: `if (typeof FSB_FLAG !== "undefined" && FSB_FLAG) { ... }` — Phase 5 Plan 05-05 idiom; Phase 6 follows for `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED`.

### Integration Points
- `extension/background.js`: insert ONE call to `chrome.offscreen.createDocument(...)` at startup, guarded by `chrome.offscreen.hasDocument()`. 153 importScripts chain BYTE-UNCHANGED.
- `extension/ai/agent-loop.js`: replace `universalProvider.execute(...)` call sites with `executeViaBridge(...)`. Surrounding setTimeout iterator at lines ~1841/2439/2508/2518 BYTE-FROZEN — INV-04.
- `extension/ui/options.js`: rewrite `checkApiConnection()` (lines 1077-1131) and `saveSettings()` trim defense-in-depth (lines 977-1029).

### Tests
- Existing smokes: `tests/lattice-smoke.test.js`, `tests/lattice-tripwire-smoke.test.js`, `tests/lattice-checkpoint-smoke.test.js`, `tests/lattice-providers-smoke.test.js`, `tests/lattice-survivability-smoke.test.js`. Phase 6 adds `tests/lattice-provider-bridge-smoke.test.js` following the same harness pattern (mock fetch + mock chrome.runtime + mock chrome.offscreen).

</code_context>

<specifics>
## Specific Ideas

- The `xai-key-rejected-400` debug session (`.planning/debug/xai-key-rejected-400.md`) confirmed via direct curl that the user's pasted key is valid server-side. The defects are FSB-side: missing trim + stale storage read. Phase 6's migration closes both by side effect. UAT-1 (consolidated single Chrome MV3 reload session, documented in `.planning/v0.10.0-MILESTONE-AUDIT.md`) executes at the END of Phase 7 and validates the full Phase 1 + 5 + 6 + 7 chain in one reload.
- `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` default-true is intentional: users get the bridge silently on upgrade. The flag is the rollback escape hatch, not a beta gate. No UI surfaces the flag — only `globalThis` / a dev-tools toggle.

</specifics>

<deferred>
## Deferred Ideas

- Hard delete of `extension/ai/universal-provider.js` — Phase 7.
- Feature flag removal — Phase 7.
- Strengthening INV-03 wording in REQUIREMENTS.md from "every improvement worked across all 7 universal-provider targets" to "FSB consumes Lattice's 7 provider adapters exclusively" — Phase 7 (already drafted in the scope-extension commit `c17e262a`).
- Mainline PR back into Lattice repo — v0.11.0+.
- Streaming-aware provider responses (Gemini single-shot parity issue) — OOS-06.

</deferred>
