# Phase 6: FSB engine consumes Lattice provider abstraction - Research

**Researched:** 2026-05-27
**Domain:** Chrome MV3 offscreen messaging bus + Lattice provider adapter consumption + bridge shim normalization
**Confidence:** HIGH (all evidence drawn directly from the live source tree under `/Users/lakshmanturlapati/Desktop/FSB/automation`; chrome.offscreen API surface verified against official docs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Bridge reply pattern (Q1)** [VERIFIED: 06-CONTEXT.md:21-25]
- The offscreen `lattice-provider-execute` handler returns `true` from `chrome.runtime.onMessage` to keep the channel open, then invokes `sendResponse(envelope)` when the Lattice adapter resolves (success) or rejects (structured error envelope).
- Bridge shim `executeViaBridge()` awaits `chrome.runtime.sendMessage(...)` directly and unwraps the envelope. No correlation-ID bookkeeping needed for the primary request path.
- Diverges intentionally from Phase 5's fire-and-forget receipt-mint pattern (which has no caller waiting on a response). Phase 6 has request-response semantics, so the standard Chrome MV3 idiom (`return true` + `sendResponse`) is the correct match.

**AbortSignal propagation (Q2)** [VERIFIED: 06-CONTEXT.md:26-31]
- Bridge generates a per-call `requestId` (UUID or counter), sends primary `{type: 'lattice-provider-execute', requestId, ...}`.
- When the caller-supplied `AbortSignal` fires, the bridge sends a companion `{type: 'lattice-provider-abort', requestId}` to the offscreen host.
- Offscreen handler maintains a `Map<requestId, AbortController>` for in-flight executions; on receiving the abort message, it calls `controller.abort()`, which Lattice's adapter consumes via the `{signal}` option to `adapter.execute(request, {signal})`.
- The original `sendResponse` resolves with an aborted envelope (`{ok: false, error: {kind: 'aborted', message: 'aborted by caller'}}`).
- Preserves Lattice's adapter-internal abort contract. Adds one small extra message handler in the offscreen host.

**Adapter lifecycle (Q3)** [VERIFIED: 06-CONTEXT.md:32-36]
- Per-call instantiation: each `lattice-provider-execute` message builds a fresh adapter via the matching `createXAIProvider(config)` / `createAnthropicProvider(config)` / etc. factory, calls `execute(request, {signal})`, discards.
- No caching, no cache invalidation, no risk of stale config when the user changes a key or baseUrl in the UI.
- Matches Lattice's adapter design (configs are immutable per instance). Network round-trip dominates so the marginal CPU cost of factory invocation is negligible.

**Feature flag default (locked by ROADMAP)** [VERIFIED: ROADMAP.md:259]
- `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` defaults to `true`.
- Legacy `universal-provider.js` remains on disk as the flag-false fallback path for runtime rollback safety. Phase 7 strips the flag and archives `universal-provider.js`.

**Error envelope shape (Claude's Discretion)** [VERIFIED: 06-CONTEXT.md:42-44]
- Bridge returns either `{ok: true, response: ProviderRunResponse}` or `{ok: false, error: {kind: 'aborted' | 'adapter_error' | 'host_unreachable' | 'invalid_provider', message: string, providerError?: any}}`.
- Bridge shim normalizes `ok: true` to the legacy raw-HTTP-body shape that `agent-loop.js` callers expect so call-site diffs stay minimal.

**Test-connection rewrite (locked by ROADMAP)** [VERIFIED: 06-CONTEXT.md:46-48 + ROADMAP.md:260-261]
- `checkApiConnection()` in `options.js` reads from `elements.apiKey?.value?.trim()` (NOT from chrome.storage), delegates to `executeViaBridge('xai' | 'anthropic' | ...)`, displays the bridge result.
- `saveSettings()` defense-in-depth: trim() applied uniformly to all 7 API key fields on save. Old un-trimmed stored values auto-heal on next user save.

### Claude's Discretion
- Bridge shim file location (`extension/ai/lattice-provider-bridge.js` per ROADMAP; verified no naming conflict — no existing file with that name).
- Error envelope wording per failure kind (finalized in this research; see Section 6 below).
- Adapter factory dispatch map shape (recommended: object literal — see Section 4).
- `chrome.offscreen.hasDocument` polyfill / safety for older Chrome (FSB targets Chrome >= 116 per manifest; offscreen.hasDocument shipped in Chrome 116 — no polyfill needed).
- Request-ID generation: `crypto.randomUUID()` (verified available in MV3 SW since Chrome 92, well below our floor).

### Deferred Ideas (OUT OF SCOPE)
- Hard delete of `extension/ai/universal-provider.js` — Phase 7.
- Feature flag removal — Phase 7.
- Strengthening INV-03 wording in REQUIREMENTS.md from "every improvement worked across all 7 universal-provider targets" to "FSB consumes Lattice's 7 provider adapters exclusively" — Phase 7 (already drafted in scope-extension commit `c17e262a`).
- Mainline PR back into Lattice repo — v0.11.0+.
- Streaming-aware provider responses (Gemini single-shot parity issue) — OOS-06.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FINT-07 | Bridge handler in `extension/offscreen/lattice-host.js` + `chrome.offscreen.createDocument` startup wiring in `extension/background.js`. Closes audit gap G3 (SW does not open offscreen host at startup). | Section 5 (offscreen API), Section 11 (handler design), Section 12 (background.js wiring) |
| FINT-08 | New shim `extension/ai/lattice-provider-bridge.js`; rewire `extension/ai/agent-loop.js` provider call sites under `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` feature flag (default-on); rewrite `extension/ui/options.js` `checkApiConnection()` (lines 1077-1131); defense-in-depth trim on save in `saveSettings()` (lines 977-1029); smoke `tests/lattice-provider-bridge-smoke.test.js` >= 20 PASS. Closes `xai-key-rejected-400` P1 (missing trim) + P2 (stale storage read). | Section 1 (call sites), Section 2 (return shape), Section 10 (feature flag), Section 14 (options rewire), Section 15 (smoke) |
</phase_requirements>

## Summary

Phase 6 wires FSB's autopilot loop and settings test-connection path to consume Lattice's 7 provider adapters through the offscreen Lattice host bus shipped in Phase 5 (FINT-04). The bridge is a thin SW-side function (`executeViaBridge`) that wraps `chrome.runtime.sendMessage` to a new `lattice-provider-execute` handler added to `extension/offscreen/lattice-host.js`. Background.js gets ONE startup line — `chrome.offscreen.createDocument({url, reasons: ['WORKERS'], justification})` guarded by `hasDocument()` — closing audit gap G3.

**Primary recommendation:** Build the bridge so it returns the **raw HTTP response body** (Lattice's `ProviderRunResponse.rawResponse` field) to `agent-loop.js` call sites. Agent-loop's downstream functions (`_parseToolCalls`, `_isToolCallResponse`, `_formatAssistantMessage`, `_extractUsage` all in `extension/ai/tool-use-adapter.js`) operate directly on the raw provider HTTP body — NOT on Lattice's normalized envelope. This preserves the call-site diff to a single function-name substitution and keeps the INV-04 setTimeout iterator byte-frozen.

**CRITICAL ARCHITECTURAL FINDING (read this first):** Lattice's provider adapters do NOT accept a pre-built `requestBody` parameter. Every adapter's `execute(request)` method internally constructs a single-user-message HTTP body from `request.task: string` + `request.outputs: string[]`. They CANNOT carry FSB's `tools: [...]`, `messages: [...multi-turn...]`, `cache_control`, or `systemInstruction` payloads. This means **the bridge handler in the offscreen host CANNOT use Lattice's `createXaiProvider().execute()` for the autopilot path** — only for the test-connection path. For the autopilot path, the handler must reach down one level and call Lattice's HTTP fetch primitives (or, simpler and equivalent, do its own `fetch()` with the same endpoint/auth/key logic Lattice's adapters use internally — see Section 16 for the recommended split).

This finding is grounded in `lattice/packages/lattice/src/providers/adapters.ts:48-107` (request body is hardcoded), the test files in `lattice/packages/lattice/src/providers/*.test.ts` (every test passes `{task: 't', artifacts: [], outputs: ['text']}` only), and `extension/ai/agent-loop.js:944-1044` `callProviderWithTools()` which builds provider-specific multi-turn + tool-use bodies. The planner must choose between two strategies:

- **Strategy A (Recommended)**: Bridge handler accepts a `pre-built requestBody` and does the fetch directly inside the offscreen page, using Lattice's adapter only as the trim/auth-header reference. The "consumption of Lattice's adapters" is satisfied by colocation (offscreen host imports the Lattice factories AND keeps the `'consumed via the bus'` contract), but the runtime path bypasses Lattice's body builder. This is the only path that honors INV-04 (no agent-loop refactor of `callProviderWithTools`) AND INV-03 (7-provider parity preserved via FSB's existing provider-shape adapter at `tool-use-adapter.js`).
- **Strategy B (Risky)**: Refactor FSB's `callProviderWithTools` to fit Lattice's `ProviderRunRequest` shape. This would touch the agent-loop iteration body and risk INV-04 violation. Not recommended.

The planner must surface this decision to the user during plan-check. The CONTEXT.md locked decisions assume Lattice adapter `.execute(request, {signal})` is invocable per call — which it is, but only for single-shot tasks. The autopilot's iterative tool-use path is not single-shot.

**Confidence assessment:** HIGH for everything except the architectural-fit question (which is HIGH-evidence but requires user resolution before planning). The bridge handler design, message-bus contract, AbortController plumbing, options.js rewire, and smoke test pattern are all directly derivable from the existing Phase 5 code and the Chrome MV3 documentation.

## Project Constraints (from CLAUDE.md)

Only the global `~/.claude/CLAUDE.md` was found (no project-local `./CLAUDE.md`). Directives:
- Never run applications automatically; only when explicitly asked.
- Never use emojis in terminal logs, READMEs, markdowns, or any output unless explicitly asked.
- Never use emojis in any markdown including this RESEARCH.md.

Adhered to: this file contains zero emojis.

## Standard Stack

### Core (already shipped — Phase 6 consumes, does not introduce)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lattice (file: dep) | `file:./lattice/packages/lattice` HEAD `22bf986` + Phase 2-5 commits | Provider factories + receipt primitives | Phase 4 shipped 7 adapters; this phase wires the runtime call sites |
| esbuild | ^0.24.0 (Phase 5 baseline) | Per-entrypoint bundler for the offscreen ESM bundle | Already wired in `esbuild.config.js`; no version bump for Phase 6 |
| chrome.runtime + chrome.offscreen | Chrome native (Chrome 116 baseline per FSB manifest) | SW ↔ offscreen message bus + offscreen page creation | The standard MV3 idiom for off-loading work that classic SWs cannot do |

### Supporting (already on disk; reused verbatim)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `extension/ai/tool-use-adapter.js` | Project-local | Raw-HTTP-body parser for tool calls + usage + assistant message per-provider | Phase 6 keeps this byte-frozen; bridge shim returns raw HTTP body so this module works unchanged |
| `extension/ai/universal-provider.js` | Project-local | Legacy fetch wrapper | Stays byte-frozen as the flag-false fallback path (Phase 7 archives it) |
| `extension/offscreen/lattice-host.js` | Project-local (Phase 5) | Existing offscreen handler for `lattice-step-transition` | Phase 6 ADDS a sibling handler branch for `lattice-provider-execute`; existing branch untouched |
| `extension/ai/lattice-runtime-adapter.js` | Project-local (Phase 5) | Standalone MV3-survivability adapter | NOT used by Phase 6; cited only as a template for the file-pattern + JSDoc convention |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `crypto.randomUUID()` for requestId | Monotonic counter (`let next = 0; () => ++next`) | UUID is shorter (16 bytes vs string concatenation) but counter is simpler. UUID wins on cross-tab uniqueness if a future phase ever opens multiple offscreen documents. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID Chrome 92+; FSB floor is Chrome 116] Recommend UUID. |
| Offscreen `reasons: ['WORKERS']` | `IFRAME_SCRIPTING` (Phase 5 docstring suggests this) | WORKERS more accurately describes hosting a fetch+parse JS worker context. IFRAME_SCRIPTING is for modifying iframe DOM. Neither perfectly fits but WORKERS is the closer match per Chrome docs. [CITED: https://developer.chrome.com/docs/extensions/reference/api/offscreen] |
| Single `lattice-provider-execute` message type | Per-provider message types (`lattice-anthropic-execute`, etc.) | Single type with `provider` discriminator is simpler and matches Phase 5's `lattice-step-transition` convention. Discriminator-on-payload preferred. |

**Installation:** Nothing to install. All dependencies are already pinned (Phase 1: lattice `file:` dep; Phase 5: esbuild ^0.24.0).

**Version verification:**
- `node -e "console.log(require('./package.json').dependencies.lattice)"` → `file:./lattice/packages/lattice` [VERIFIED via Read package.json line 81]
- `node -e "console.log(require('./package.json').devDependencies.esbuild)"` → `^0.24.0` [VERIFIED via Read package.json]
- Lattice dist build state: `lattice/packages/lattice/dist/index.{js,d.ts,js.map,d.ts.map}` all present [VERIFIED via Bash ls]
- Existing offscreen bundle: `extension/dist/offscreen/lattice-host.js` (64870 bytes, 2026-05-24 mtime) [VERIFIED via Bash ls -la]

## Architecture Patterns

### Recommended Project Structure (delta only — files added/modified)

```
extension/
├── background.js                          # MODIFY: ONE startup block adding chrome.offscreen.createDocument
├── offscreen/
│   ├── lattice-host.html                  # UNCHANGED (already references lattice-host.js)
│   └── lattice-host.js                    # MODIFY: add second onMessage handler branch for lattice-provider-execute + lattice-provider-abort
├── ai/
│   ├── universal-provider.js              # BYTE-FROZEN (flag-false fallback)
│   ├── agent-loop.js                      # MODIFY: 2 call sites swap universalProvider→bridge under feature flag
│   ├── tool-use-adapter.js                # BYTE-FROZEN (consumes raw HTTP body which bridge returns)
│   └── lattice-provider-bridge.js         # NEW: executeViaBridge() wrapper over chrome.runtime.sendMessage
└── ui/
    └── options.js                         # MODIFY: saveSettings() trim defense-in-depth + checkApiConnection() rewrite

tests/
└── lattice-provider-bridge-smoke.test.js  # NEW: >=20 PASS exercising all 7 providers through the bridge

package.json                               # MODIFY: scripts.test chain appends the new smoke as the LAST entry
```

### Pattern 1: Phase 5 SW ↔ offscreen handler pattern
**What:** Offscreen `chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {...})` with sender-origin check and message-type discriminator.
**When to use:** Every new message handler added to `lattice-host.js`.
**Example (verbatim from Phase 5 `extension/offscreen/lattice-host.js:142-225`):**
```js
// Source: extension/offscreen/lattice-host.js:142-225 (Phase 5 Plan 05-04)
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") return false;
    if (sender && sender.id && sender.id !== chrome.runtime.id) {
      console.warn(HOST_TAG, "rejecting cross-extension message from", sender.id);
      return false;
    }
    if (message.type !== "lattice-step-transition") return false;
    // ... processing ...
    return false; // Phase 5 uses sendMessage (not sendResponse) for replies
  });
}
```

**Phase 6 divergence:** The new handler returns `true` (NOT `false`) from the listener because we need the channel to stay open for the async `sendResponse(envelope)`. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/messaging]

### Pattern 2: Adapter factory dispatch (object literal)
**What:** Object-literal map from FSB provider key string to Lattice factory function.
**When to use:** Inside the offscreen `lattice-provider-execute` handler, before calling `.execute()`.

```js
// Pattern recommendation. Source: distilled from lattice/packages/lattice/src/index.ts:28-42
const PROVIDER_FACTORIES = {
  xai:        lattice.createXaiProvider,         // factory id "xai"; baseUrl default https://api.x.ai/v1
  openai:     lattice.createOpenAIProvider,      // factory id "openai"; caller supplies baseUrl
  anthropic:  lattice.createAnthropicProvider,   // factory id "anthropic"; baseUrl default https://api.anthropic.com
  gemini:     lattice.createGeminiProvider,      // factory id "gemini"; baseUrl default https://generativelanguage.googleapis.com
  openrouter: lattice.createOpenRouterProvider,  // factory id "openrouter"; baseUrl default https://openrouter.ai/api/v1
  lmstudio:   lattice.createLmStudioProvider,    // factory id "lm-studio"; baseUrl default http://localhost:1234/v1
  custom:     lattice.createOpenAICompatibleProvider, // factory id "openai-compatible"; caller supplies baseUrl
};
```

**Note the FSB key vs Lattice id discrepancies (CRITICAL for the planner):**
- FSB `lmstudio` (no hyphen) ↔ Lattice adapter id `lm-studio` (with hyphen) [VERIFIED: `extension/ai/universal-provider.js:40` vs `lattice/packages/lattice/src/providers/lm-studio.ts:44`]
- FSB `custom` ↔ Lattice factory `createOpenAICompatibleProvider` (id "openai-compatible") [VERIFIED: `extension/ai/universal-provider.js:33` vs `lattice/packages/lattice/src/providers/adapters.ts:35`]
- FSB `xai` (lowercase) ↔ Lattice factory `createXaiProvider` (camelCase Xai, not XAI; id is "xai") [VERIFIED: `lattice/packages/lattice/src/providers/xai.ts:31,34` — function is `createXaiProvider`, adapter id is `'xai'`]
- All other 4 keys (openai, anthropic, gemini, openrouter) are 1:1 between FSB and Lattice.

### Anti-Patterns to Avoid

- **Returning Promise from onMessage listener** [CITED: https://bobbyhadz.com/blog/a-listener-indicated-asynchronous-response-by-returning-true]: Chrome MV3 (pre-148) does NOT auto-await a Promise return from `onMessage`. Either (a) return `true` literal AND call `sendResponse(...)` inside a `.then()`/inside the awaited async block, or (b) for fire-and-forget, return `false`. Mixing the two patterns leads to "message port closed before response was received."
- **Using `async` keyword on the listener function** [CITED: same source]: Same issue — every async listener returns a Promise, which Chrome treats as truthy but does NOT keep the channel open. Recommended pattern: synchronous listener that returns `true`, then immediately invokes an inner async IIFE that calls `sendResponse(...)`.
- **Caching adapter instances across calls**: VIOLATES the locked Q3 decision. CONTEXT.md mandates per-call instantiation.
- **Calling the bridge from inside a `setTimeout` callback that itself is awaited**: Don't change the agent-loop scheduling. The current pattern is `setTimeout(cb, ms) → cb() → cb is sync → awaits inside an async function called from cb`. The bridge call is async; it slots into the same awaited-call slot that `providerInstance.sendRequest(...)` occupied. INV-04 is satisfied as long as the setTimeout call sites at lines 1841, 2439, 2508, 2518 are byte-frozen.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation in MV3 SW | Custom counter (loses uniqueness across SW reloads) or `Math.random()` (collision risk) | `crypto.randomUUID()` | Available since Chrome 92, well below FSB's 116 floor. Cryptographically random per spec. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID] |
| Offscreen page existence check | Polling `chrome.offscreen.getContexts()` (slower; doesn't avoid race) | `chrome.offscreen.hasDocument()` (returns Promise<boolean>) | Native API, single round-trip. Available Chrome 116+ matches FSB floor. [CITED: https://developer.chrome.com/docs/extensions/reference/api/offscreen] |
| AbortController in offscreen | Custom abort flag passed through onMessage | `new AbortController()` + `signal` passed to `adapter.execute(request, {signal})` | Standard Web API. Lattice adapters already wire `signal` per their TypeScript contract. [VERIFIED: `lattice/packages/lattice/src/providers/anthropic.ts:80`, `gemini.ts:92`, `adapters.ts:108`] |
| API key trim/sanitization | New regex in the bridge | Trim at TWO sites: (a) the bridge shim before sending the message (defensive), (b) `saveSettings()` defense-in-depth per locked decision | Per debug session `.planning/debug/xai-key-rejected-400.md` the original bug was missing trim on save. Two-site trim is belt-and-suspenders. |
| Custom error code taxonomy | Free-form `error.message` strings | The locked envelope shape: `kind: 'aborted' | 'adapter_error' | 'host_unreachable' | 'invalid_provider'` | Already specified in CONTEXT.md decisions; planner just locks the exact wording. |

**Key insight:** Phase 6 builds NO new primitives — every primitive (offscreen API, message bus, Lattice adapters, AbortController, crypto.randomUUID) is native or already shipped. The bridge is glue. The "Don't hand-roll" rule should be enforced ruthlessly during plan-check.

## Runtime State Inventory

> NOT APPLICABLE — Phase 6 is a code+config change with no rename, refactor, or migration of stored data. No chrome.storage schema changes (settings keys preserved byte-identical), no datastore renames, no OS-registered state changes.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `chrome.storage.local` settings keys (apiKey, geminiApiKey, etc.) read identically by the new code | None |
| Live service config | None — no external service has anything named `universal-provider` or similar | None |
| OS-registered state | None — no Windows tasks / launchd / cron / systemd / pm2 process registrations involved | None |
| Secrets/env vars | None — API keys remain in chrome.storage.local under the same key names | None |
| Build artifacts | `extension/dist/offscreen/lattice-host.js` exists from Phase 5 (64870 bytes, 2026-05-24) and will be regenerated by `npm run build` after Phase 6 modifies the source | Run `npm run build` after Phase 6 lands to refresh the bundle |

**Nothing found in any category requiring data migration.** Phase 6 is purely additive at the storage/runtime-state level.

## Common Pitfalls

### Pitfall 1: Async listener returning Promise instead of `return true`
**What goes wrong:** `chrome.runtime.sendMessage()` from the SW resolves with `undefined`, never the actual envelope. Console shows "The message port closed before a response was received."
**Why it happens:** [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/messaging] Chrome MV3 (pre-version 148) does NOT auto-await a Promise return value from `chrome.runtime.onMessage` listeners. The listener must return the literal `true` value to keep the channel open. Async function declarations implicitly return Promise.
**How to avoid:** Use the pattern below. Synchronous outer listener, inner async IIFE, `return true` at the END of the outer listener body.

```js
// CORRECT pattern. Source: distilled from MDN + Chrome docs.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'lattice-provider-execute') return false;
  // Origin check
  if (sender?.id !== chrome.runtime.id) return false;
  // Synchronous body returns true; inner async work calls sendResponse
  (async () => {
    try {
      const envelope = await runAdapter(message); // builds adapter + executes
      sendResponse({ ok: true, response: envelope });
    } catch (err) {
      sendResponse({ ok: false, error: { kind: 'adapter_error', message: String(err?.message ?? err) } });
    }
  })();
  return true; // <-- CRITICAL: keeps the channel open
});
```

**Warning signs:** `chrome.runtime.lastError` set to "message port closed" on the SW side; bridge promise resolves to `undefined`.

### Pitfall 2: Offscreen document not yet alive when the SW calls sendMessage
**What goes wrong:** `chrome.runtime.sendMessage()` resolves immediately (no listener), bridge shim sees `undefined` envelope, treats it as `host_unreachable`.
**Why it happens:** `chrome.offscreen.createDocument(...)` returns a Promise that must be awaited before the host's `onMessage` listener registers. If the SW boots and immediately fires an `executeViaBridge()` call (e.g., test-connection on first paint), the document may not yet have evaluated `lattice-host.js`.
**How to avoid:** Make the bridge's first call defensive — `await chrome.offscreen.hasDocument()` before the first send, and if `false`, `await chrome.offscreen.createDocument(...)` first. Cache a module-level "ready" Promise so subsequent calls don't double-create. (Background.js startup wiring SHOULD do this proactively; the bridge does it defensively.)

```js
// Recommended bridge-side helper.
let _hostReady = null;
async function ensureHostReady() {
  if (_hostReady) return _hostReady;
  _hostReady = (async () => {
    if (typeof chrome?.offscreen?.hasDocument !== 'function') return; // tests / non-MV3
    const has = await chrome.offscreen.hasDocument();
    if (!has) {
      await chrome.offscreen.createDocument({
        url: 'offscreen/lattice-host.html',
        reasons: ['WORKERS'],
        justification: 'Hosts Lattice provider bus; executes fetch() to external AI APIs on behalf of the service worker.'
      });
    }
  })();
  return _hostReady;
}
```

**Warning signs:** First bridge call after a fresh SW boot returns `host_unreachable`; subsequent calls succeed.

### Pitfall 3: AbortSignal listener leak (long-running session, never aborted)
**What goes wrong:** Bridge adds an `signal.addEventListener('abort', ...)` listener for every call. If the signal is never fired AND the adapter never resolves (e.g., a stuck fetch), the listener accumulates references.
**Why it happens:** Bridge subscribes to abort but does not unsubscribe on settle.
**How to avoid:** Use `{once: true}` on the addEventListener call OR explicitly removeEventListener in a `finally` block.

```js
const onAbort = () => chrome.runtime.sendMessage({ type: 'lattice-provider-abort', requestId });
signal?.addEventListener('abort', onAbort, { once: true });
try {
  return await sendPrimary();
} finally {
  signal?.removeEventListener('abort', onAbort);
}
```

**Warning signs:** Long-running autopilot sessions show growing AbortController count via DevTools heap snapshot.

### Pitfall 4: Lattice adapter does NOT accept `messages: [...]` or `tools: [...]`
**What goes wrong:** Bridge handler calls `adapter.execute({task: 't', artifacts: [], outputs: ['text']})`. The adapter builds a single-user-message body. FSB's autopilot tool-use payload is silently dropped — model never sees the tools, never emits tool_calls, agent loop terminates after one iteration.
**Why it happens:** Lattice adapters are designed for single-shot text generation per Lattice's `ProviderRunRequest` shape [VERIFIED: `lattice/packages/lattice/src/providers/provider.ts:85-96`]. They wrap the request body construction internally [VERIFIED: `lattice/packages/lattice/src/providers/adapters.ts:55-107`].
**How to avoid:** See Section 16 below. The bridge handler in the offscreen page must take a pre-built FSB `requestBody` and `provider` key, and either (a) call `fetch()` directly inside the offscreen page using the same endpoint/auth/header derivation that Lattice's adapter uses internally, or (b) extend Lattice with a pre-built-body passthrough adapter. Option (a) is simpler and Phase 6-scoped; option (b) would require Phase 6 to commit to Lattice's repo, violating INV-06.

**Warning signs:** Autopilot iteration completes 1 step then exits with `end_turn` (no tools used). xAI logs show single-user-message bodies in the bridge path but multi-message bodies in the legacy path.

### Pitfall 5: Per-call adapter instantiation across 7 providers — wrong factory invoked silently
**What goes wrong:** Bridge dispatch map has a typo or stale entry; `provider='gemini'` falls through to `custom`, which uses Gemini's API key as a Bearer token against the wrong endpoint.
**Why it happens:** JavaScript object dispatch doesn't throw on `undefined` lookup.
**How to avoid:** Explicit null check after lookup; throw `invalid_provider` envelope before calling the factory.

```js
const factory = PROVIDER_FACTORIES[providerKey];
if (typeof factory !== 'function') {
  sendResponse({ ok: false, error: { kind: 'invalid_provider', message: `Unknown provider: ${providerKey}` } });
  return;
}
```

**Warning signs:** 400 from the wrong endpoint; bridge logs show the call routed to the wrong provider id.

### Pitfall 6: `chrome.runtime.sendMessage` race when the SW evicts mid-request
**What goes wrong:** SW evicts during a 30s+ fetch. Bridge's awaited sendMessage never resolves. The setTimeout iterator's `await` hangs indefinitely.
**Why it happens:** MV3 SW eviction is opaque; pending Promises don't reject automatically.
**How to avoid:** Already handled by the autopilot's per-iteration setTimeout(...,100ms) loop — each iteration is a fresh event. The bridge call within a single iteration is no longer-lived than the pre-Phase-6 `providerInstance.sendRequest()`. The risk is the same as today; no NEW risk introduced. Mitigation: rely on Phase 5's SurvivabilityAdapter (deferred) or the existing fetch timeout in the underlying universal-provider's `fetchWithTimeout()` pattern. Phase 6 does NOT introduce new timeout handling — the per-call AbortController is for user-cancellation only.

**Warning signs:** Autopilot sessions silently freeze; DevTools shows the SW idle but no fresh iterations.

## Code Examples

Verified patterns from project sources + Chrome docs.

### Example 1: Bridge shim — executeViaBridge() function shape (NEW file, recommended)
```js
// File: extension/ai/lattice-provider-bridge.js
// NEW file. Pattern: thin async wrapper over chrome.runtime.sendMessage.
// Pattern source: distilled from extension/ai/lattice-runtime-adapter.js
// (Phase 5 Plan 05-05) factory-function-with-JSDoc convention.

'use strict';

(function (globalScope) {
  const BRIDGE_TAG = '[FSB lattice-provider-bridge]';

  // Per-call abort routing. Cleaned up in finally{}.
  // No long-lived state; per-call only.

  /**
   * Send a provider-execute envelope to the offscreen Lattice host and await
   * the raw HTTP response body. This is the SW-side counterpart to the
   * offscreen handler's `lattice-provider-execute` branch.
   *
   * @param {string} providerKey - FSB provider key: xai|openai|anthropic|gemini|openrouter|lmstudio|custom
   * @param {Object} config - { apiKey, baseUrl, model, headers }
   * @param {Object} requestBody - Pre-built provider HTTP body (for autopilot path) OR { task: string } (for test-connection)
   * @param {Object} opts - { signal?: AbortSignal, mode?: 'autopilot' | 'test-connection' }
   * @returns {Promise<Object>} Raw HTTP response body (matches what universalProvider.sendRequest returns today)
   * @throws Error with code-tagged message on host_unreachable / adapter_error / aborted / invalid_provider
   */
  async function executeViaBridge(providerKey, config, requestBody, opts) {
    opts = opts || {};
    const signal = opts.signal;
    const mode = opts.mode || 'autopilot';

    if (signal && signal.aborted) {
      const err = new Error('aborted by caller');
      err.code = 'aborted';
      throw err;
    }

    const requestId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : ('req-' + Date.now() + '-' + Math.random().toString(36).slice(2));

    let onAbort = null;
    if (signal) {
      onAbort = () => {
        try {
          chrome.runtime.sendMessage({ type: 'lattice-provider-abort', requestId });
        } catch (_e) { /* swallow — offscreen may have evicted */ }
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      const envelope = await chrome.runtime.sendMessage({
        type: 'lattice-provider-execute',
        requestId,
        provider: providerKey,
        config: config,
        requestBody: requestBody,
        mode: mode
      });

      if (!envelope || typeof envelope !== 'object') {
        const err = new Error('Offscreen Lattice host unreachable (no envelope returned)');
        err.code = 'host_unreachable';
        throw err;
      }

      if (envelope.ok === true) {
        // Normalize to legacy shape: caller expects the raw HTTP response body.
        // Lattice adapters preserve it on `response.rawResponse`.
        return envelope.response && envelope.response.rawResponse
          ? envelope.response.rawResponse
          : envelope.response;
      }

      const err = new Error((envelope.error && envelope.error.message) || 'bridge call failed');
      err.code = (envelope.error && envelope.error.kind) || 'adapter_error';
      err.providerError = envelope.error && envelope.error.providerError;
      throw err;
    } finally {
      if (onAbort && signal) signal.removeEventListener('abort', onAbort);
    }
  }

  // Export for both classic SW global + Node test CJS
  globalScope.executeViaBridge = executeViaBridge;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { executeViaBridge };
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
```

### Example 2: Offscreen handler branch (MODIFY existing lattice-host.js — ADD this block)
```js
// File: extension/offscreen/lattice-host.js
// ADD AFTER the existing `lattice-step-transition` handler block (after line 230).
// Existing handler stays byte-frozen. This is a SIBLING handler.

// Per-call AbortController registry. Key: requestId; Value: AbortController.
// Cleaned up on settle (both success and error paths).
const _inflightAborts = new Map();

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") return false;
    if (sender && sender.id && sender.id !== chrome.runtime.id) return false;

    // Abort branch — synchronous; no sendResponse needed.
    if (message.type === "lattice-provider-abort") {
      const ctl = _inflightAborts.get(message.requestId);
      if (ctl) ctl.abort();
      return false;
    }

    // Execute branch — async; MUST return true to keep channel open.
    if (message.type !== "lattice-provider-execute") return false;

    const requestId = String(message.requestId || '');
    const providerKey = String(message.provider || '');
    const config = message.config || {};
    const requestBody = message.requestBody || {};
    const mode = message.mode || 'autopilot';

    const factory = PROVIDER_FACTORIES[providerKey];
    if (typeof factory !== 'function') {
      sendResponse({ ok: false, error: { kind: 'invalid_provider', message: 'Unknown provider: ' + providerKey } });
      return false;
    }

    const controller = new AbortController();
    _inflightAborts.set(requestId, controller);

    (async () => {
      try {
        // SEE SECTION 16 BELOW for the architectural decision on how to actually
        // execute the request. The simplified pattern is shown here as a placeholder.
        const adapter = factory({
          apiKey: (config.apiKey || '').trim(),
          model: config.model,
          baseUrl: config.baseUrl,
          // ... other config fields per provider ...
        });

        // FOR test-connection mode: this works as-is (single task string).
        // FOR autopilot mode: see Section 16 — adapter.execute does NOT accept
        // pre-built requestBody. The handler must instead do a direct fetch().
        const response = await adapter.execute({
          task: requestBody.__taskForLattice || JSON.stringify(requestBody),
          artifacts: [],
          outputs: ['text'],
          signal: controller.signal,
        });

        sendResponse({ ok: true, response: response });
      } catch (err) {
        const isAbort = err && (err.name === 'AbortError' || /abort/i.test(String(err.message)));
        sendResponse({
          ok: false,
          error: {
            kind: isAbort ? 'aborted' : 'adapter_error',
            message: String(err && err.message ? err.message : err),
            providerError: err && err.providerError ? err.providerError : undefined,
          }
        });
      } finally {
        _inflightAborts.delete(requestId);
      }
    })();

    return true; // CRITICAL: keep channel open
  });
}
```

### Example 3: Background.js startup wiring (MODIFY existing background.js — ADD this single block)
```js
// File: extension/background.js
// ADD INSIDE the existing chrome.runtime.onInstalled.addListener (at line 13113)
// AND the existing chrome.runtime.onStartup.addListener (at line 13189) so the
// offscreen page is created idempotently on every SW wake (matches the
// Phase 269 telemetry-alarm idempotent-on-both-events pattern at line 13136).
// Recommendation: extract into a single helper ensureLatticeOffscreen() called
// from BOTH listeners.

async function ensureLatticeOffscreen() {
  try {
    if (typeof chrome === 'undefined' || !chrome.offscreen || typeof chrome.offscreen.hasDocument !== 'function') {
      console.warn('[FSB Lattice] chrome.offscreen unavailable; bridge will be inert');
      return;
    }
    const has = await chrome.offscreen.hasDocument();
    if (has) return;
    await chrome.offscreen.createDocument({
      url: 'offscreen/lattice-host.html',
      reasons: ['WORKERS'],
      justification: 'Hosts the Lattice provider bus; calls fetch() to external AI APIs on behalf of the service worker.'
    });
    console.log('[FSB Lattice] offscreen lattice-host opened');
  } catch (err) {
    console.error('[FSB Lattice] offscreen createDocument failed:', err && err.message ? err.message : err);
  }
}

// Inside onInstalled.addListener (add NEAR the top, after analytics init):
ensureLatticeOffscreen();

// Inside onStartup.addListener (add NEAR the top, after analytics init):
ensureLatticeOffscreen();
```

### Example 4: Agent-loop call-site swap (the only 2 line ranges to modify)
```js
// File: extension/ai/agent-loop.js
// MODIFY line 1044 (inside callProviderWithTools()):
// OLD:
//   return providerInstance.sendRequest(requestBody);
// NEW (feature-flag gated):
   if (typeof FSB_LATTICE_PROVIDER_BRIDGE_ENABLED !== 'undefined' && FSB_LATTICE_PROVIDER_BRIDGE_ENABLED) {
     return executeViaBridge(
       providerKey,
       { apiKey: providerInstance.settings[providerInstance.config.keyField] || '',
         model: providerInstance.model,
         baseUrl: providerInstance.settings.customEndpoint || providerInstance.settings.lmstudioBaseUrl },
       requestBody,
       { mode: 'autopilot' }
     );
   }
   return providerInstance.sendRequest(requestBody);

// File: extension/ui/options.js (checkApiConnection rewrite, see Section 14 below for full diff)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FSB custom `UniversalProvider` class with per-provider format methods (`formatGeminiRequest`, `formatAnthropicRequest`, etc.) | Lattice provider adapter factories with internal body construction | Phase 4 shipped the Lattice adapters; Phase 6 wires the consumption | FSB's custom stack stays on disk as flag-false fallback; bridge becomes the primary path |
| Test-connection reads from chrome.storage via `getStoredSettings()` (stale data trap) | Test-connection reads from `elements.apiKey?.value?.trim()` directly + bridges to Lattice adapter | Phase 6 (this phase) | Closes `xai-key-rejected-400` debug P2 (stale storage read) |
| Save-API-key writes raw input value to chrome.storage (no trim, no normalization) | Save trims all 7 API key fields uniformly + bridge also trims defensively | Phase 6 (this phase) | Closes `xai-key-rejected-400` debug P1 (missing trim); old un-trimmed stored values auto-heal on next save |
| SW makes provider API calls directly via the classic SW global `UniversalProvider` | SW delegates to offscreen page via `chrome.runtime.sendMessage`; offscreen page does the fetch | Phase 6 | Adds round-trip latency (typically <1ms for in-process Chrome IPC) but isolates fetch from the SW eviction lifecycle |

**Deprecated/outdated:**
- `extension/ai/universal-provider.js` is NOT yet deprecated — Phase 6 keeps it as the flag-false fallback. Phase 7 archives it.
- The CONTEXT.md mention of `chrome.offscreen.createDocument({reasons: ['IFRAME_SCRIPTING']})` (in deferred-ideas / scope-extension) is technically allowable but `WORKERS` is the more accurate reason for FSB's use case. Both work; the planner should pick `WORKERS` for clarity per Chrome docs.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Lattice's adapter `.execute(request, {signal})` propagates the signal to the inner `fetch()` call across all 7 providers | Section 5, Section 8 | Abort message would not actually cancel in-flight HTTP requests; user-cancellation appears to succeed but the network call continues. Verified for anthropic.ts:80, gemini.ts:92, adapters.ts:108 (xai/openrouter/lmstudio/openai wrap adapters.ts). 5/5 verified — risk is LOW. |
| A2 | The offscreen page from Phase 5 (`extension/offscreen/lattice-host.html`) still loads cleanly and the `lattice` bare specifier still resolves under the bundler config in Phase 6 | Section 11 | If the existing offscreen bundle is broken, Phase 6 inherits the failure. esbuild config + Phase 5 commit `8ab0c6df` + the 64870-byte dist bundle on disk all suggest it works. Risk: LOW. The plan must include a verification step `npm run build && ls extension/dist/offscreen/lattice-host.js` to confirm. |
| A3 | `chrome.offscreen.hasDocument()` exists at Chrome 116 | Section 5 | If the API requires a higher floor than FSB's manifest target, the startup wiring will throw. Chrome docs list `hasDocument()` as available with the original offscreen API in Chrome 109+ [CITED: https://developer.chrome.com/docs/extensions/reference/api/offscreen]. Risk: LOW. |
| A4 | The agent-loop call site at line 1044 is the ONLY place that invokes `providerInstance.sendRequest()` for autopilot iteration | Section 1 | If there are other callers (e.g., retry paths), they will silently use the legacy provider while iterations use the bridge — provider-parity drift. Grep result: `providerInstance.sendRequest` appears at line 1044 only in agent-loop.js. The wider `sendRequest` term appears at line 944 in a comment + line 1044 only. Risk: LOW. |
| A5 | The FSB→Lattice provider-key mapping is exactly 7 keys (xai, openai, anthropic, gemini, openrouter, lmstudio, custom) with no aliases or hidden 8th provider | Section 4 | If a key is missing from the dispatch map, that provider's calls return `invalid_provider`. The 7 keys are derived from `PROVIDER_CONFIGS` in universal-provider.js lines 6-52. No other keys observed. Risk: LOW. |
| A6 | `agent-loop.js` line 1044's bridge call does not need `AbortSignal` plumbing because the autopilot has its own session-level abort orthogonal to the per-call signal | Section 8 | If the autopilot stop button currently relies on the in-flight fetch being abortable, Phase 6 might lose that capability. Verified: the legacy `UniversalProvider.fetchWithTimeout` uses its own internal AbortController; the agent-loop does NOT pass an outer AbortSignal to `sendRequest()`. So the autopilot's stop behavior is no-different post-Phase-6. Risk: LOW. |
| A7 | The Lattice adapter `.execute()` autopilot-path architectural mismatch (single-task vs multi-turn-tool-use) requires Strategy A in Section 16 | Summary, Section 16 | If the planner picks Strategy B (refactor agent-loop), INV-04 is at risk. If the planner picks neither, the autopilot path silently degrades to non-tool single-shot. Risk: HIGH if not resolved at plan-time. The user/planner MUST be alerted. |

**If A7 is wrong:** The bridge becomes a 5-line wrapper and Phase 6 is trivial. The evidence (Lattice adapter source code) is unambiguous, so A7 is HIGH-confidence — but the user has not explicitly addressed this in CONTEXT.md. Plan-check should require user sign-off.

## Open Questions

1. **Strategy A vs Strategy B for autopilot path** (CRITICAL — see Section 16)
   - What we know: Lattice adapters do not accept pre-built request bodies; FSB autopilot needs tool-use multi-turn.
   - What's unclear: User intent for Phase 6 — is the goal to literally call Lattice's adapter `.execute()` (which silently degrades autopilot to non-tool-use), or to merely route the call through the offscreen page and Lattice's auth/header derivation?
   - Recommendation: Plan-check surfaces this to the user. Recommend Strategy A: bridge handler does its own fetch() inside the offscreen page, using the Lattice adapter only as the test-connection-path executor. The phrase "consume Lattice's 7 provider adapters" is satisfied by the test-connection path (which IS Lattice-adapter-native) and by colocation in the offscreen host. INV-03/INV-04/INV-06 all preserved.

2. **Reasons string for chrome.offscreen.createDocument: `WORKERS` vs `IFRAME_SCRIPTING`**
   - What we know: CONTEXT.md and the scope-extension ROADMAP entry both reference `IFRAME_SCRIPTING` as the placeholder. Both are valid (Chrome 109+).
   - What's unclear: Which is the better fit semantically.
   - Recommendation: Use `WORKERS` per Chrome docs (the offscreen page runs JS that performs fetch + parsing, conceptually a worker context). Document the choice in the SUMMARY.

3. **Where to put the `executeViaBridge` import in `extension/ai/agent-loop.js`**
   - What we know: agent-loop.js loads via importScripts() from background.js's classic SW chain. The bridge file (`extension/ai/lattice-provider-bridge.js`) must also be loaded via importScripts() AHEAD of agent-loop.js, so `executeViaBridge` is available as a global at the time of the call-site swap.
   - What's unclear: At which line in background.js to insert the new `importScripts('ai/lattice-provider-bridge.js');` line.
   - Recommendation: Insert it BEFORE `importScripts('ai/agent-loop.js')` (which loads as part of `importScripts('ai/ai-integration.js')` at background.js line 12). Easiest insertion point: immediately after line 11 (`importScripts('ai/cli-parser.js');`) and BEFORE line 12 (`importScripts('ai/ai-integration.js');`). This counts as a `background.js` modification, but it is the BYTE-MINIMAL change (one new line of importScripts; otherwise the 153-line chain is preserved). Verify against the INV-04 byte-frozen requirement during plan-check — `background.js` only diff should be the new importScripts line + the `ensureLatticeOffscreen` helper + the 2 call sites in onInstalled / onStartup.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All smokes | ✓ | (verify before plan-check via `node --version`) | — |
| npm | Build + smoke chain | ✓ | (verify via `npm --version`) | — |
| Chrome >= 116 | MV3 offscreen + `chrome.offscreen.hasDocument` | ✓ (FSB manifest target; user runs Chrome canary) | 116+ | — |
| esbuild ^0.24.0 | Bundling offscreen + content + sidepanel | ✓ (Phase 5 baseline) | 0.24.2 (per Phase 5 SUMMARY) | — |
| Lattice (file: dep) | The 7 provider factories + `lattice` bare specifier | ✓ (Phase 1-5 baseline) | HEAD `22bf986` + Phase 2-5 commits in `lattice/packages/lattice/dist/` | — |
| `extension/dist/offscreen/lattice-host.js` | Production runtime path | ✓ (Phase 5 generated, 64870 bytes, 2026-05-24) | — | Re-generated by `npm run build` |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

**Note on test environment:** Node test smokes run in Node (no Chrome). The new smoke must mock `chrome.runtime` + `chrome.offscreen` + `fetch`. Pattern verified in `tests/lattice-survivability-smoke.test.js:127-139` (chrome stub) — Phase 6 smoke can reuse the same stub shape with `chrome.runtime.sendMessage` and `chrome.runtime.onMessage` added.

## Validation Architecture

`workflow.nyquist_validation` is NOT set in `.planning/config.json` (absent → enabled per default). Section follows.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in test runner (CommonJS, no vitest/jest); pattern is in-test `passAssert()`/`passAssertEqual()` counters with `process.exit(failed > 0 ? 1 : 0)` |
| Config file | None — each test file is self-contained; `package.json scripts.test` chains them with `&&` |
| Quick run command | `node tests/lattice-provider-bridge-smoke.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FINT-07a | Offscreen `lattice-provider-execute` handler returns `true` and calls `sendResponse(envelope)` for all 7 providers | unit (Node smoke with mock chrome.runtime + mock fetch) | `node tests/lattice-provider-bridge-smoke.test.js` | ❌ Wave 0 |
| FINT-07b | Background.js startup wiring creates offscreen document idempotently (hasDocument guards) | unit (Node smoke with mock chrome.offscreen) | `node tests/lattice-provider-bridge-smoke.test.js` (Part 5) | ❌ Wave 0 |
| FINT-08a | `executeViaBridge(provider, config, body, opts)` exists in `extension/ai/lattice-provider-bridge.js` and exports for both classic SW global + Node CJS | unit | `node tests/lattice-provider-bridge-smoke.test.js` (Part 1) | ❌ Wave 0 |
| FINT-08b | `agent-loop.js` line 1044 call site swaps to `executeViaBridge()` when `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED=true`; falls back to `universalProvider.sendRequest()` when `=false` | unit (static-text grep of the diff + flag-on/flag-off behavior assertions in smoke) | `node tests/lattice-provider-bridge-smoke.test.js` (Part 3) | ❌ Wave 0 |
| FINT-08c | `options.js saveSettings()` trims all 7 API key fields | unit (static-text grep with `.trim()` count assertions) | `node tests/lattice-provider-bridge-smoke.test.js` (Part 4) | ❌ Wave 0 |
| FINT-08d | `options.js checkApiConnection()` reads `elements.apiKey?.value?.trim()` (not chrome.storage) and delegates to the bridge | unit (static-text grep + behavior assertion in smoke) | `node tests/lattice-provider-bridge-smoke.test.js` (Part 4) | ❌ Wave 0 |
| FINT-08e | Per-call AbortController works: `lattice-provider-abort` message aborts the in-flight call | unit (simulate abort within the smoke) | `node tests/lattice-provider-bridge-smoke.test.js` (Part 2) | ❌ Wave 0 |
| INV-04 | `extension/ai/agent-loop.js` setTimeout iterator at lines 1841/2439/2508/2518 byte-frozen | static-text (grep + line-number assertion in smoke) | `node tests/lattice-provider-bridge-smoke.test.js` (Part 6) | ❌ Wave 0 |
| INV-01/02 | `tests/tool-definitions-parity.test.js` still 142 PASS | unit (existing test reused) | `node tests/tool-definitions-parity.test.js` | ✅ exists |
| INV-03 | All 7 logical providers exercised through the bridge with mock fetch | unit (per-provider loop in smoke) | `node tests/lattice-provider-bridge-smoke.test.js` (Part 2) | ❌ Wave 0 |
| Manual UAT | Real xAI test-connection from settings UI → success | manual-only | (deferred to Phase 7 UAT-1; reason: requires Chrome MV3 reload + real network) | — |

### Sampling Rate
- **Per task commit:** `node tests/lattice-provider-bridge-smoke.test.js && node tests/tool-definitions-parity.test.js` (~3s)
- **Per wave merge:** `npm test` (~3-5 min; full chain)
- **Phase gate:** Full suite green + `npm run build` regenerates `extension/dist/offscreen/lattice-host.js` cleanly before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/lattice-provider-bridge-smoke.test.js` — covers FINT-07a/b, FINT-08a/b/c/d/e, INV-03, INV-04 line-freeze. Must exist before any task that depends on the bridge.
- [ ] No new fixtures needed — smoke is self-contained with inline mocks (matches Phase 5 pattern).
- [ ] No new framework install — Node-only.

## Security Domain

`security_enforcement` is NOT set in `.planning/config.json` (absent → enabled per default). Section follows.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | API keys (Bearer / x-api-key / ?key=) flow caller→bridge→offscreen→Lattice adapter→fetch. Key NEVER persisted in the bridge; passed by reference per call. CONTEXT.md decision Q3 (per-call adapter instantiation) prevents key leakage across calls. |
| V3 Session Management | no | No sessions — each bridge call is independent. RequestId is per-call only and discarded on settle. |
| V4 Access Control | yes | Cross-extension messages rejected via `sender.id !== chrome.runtime.id` check (Phase 5 idiom reused verbatim). |
| V5 Input Validation | yes | Provider key validated against dispatch map (Pitfall 5 mitigation). Message type checked. requestId is string-coerced. |
| V6 Cryptography | yes (read-only) | `crypto.randomUUID()` for requestId; standard Web Crypto. No new key material. |
| V7 Error Handling | yes | Error envelope shape (`kind: 'aborted' | 'adapter_error' | 'host_unreachable' | 'invalid_provider'`) prevents stack-trace leakage to the caller; `providerError` field is opt-in for diagnostic detail. |
| V9 Communications | yes | All API calls are HTTPS (except LM Studio localhost which is by design). Fetch defaults preserved. |
| V14 Configuration | yes | Feature flag `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` default-on; flag-off restores byte-frozen legacy path for rollback. |

### Known Threat Patterns for FSB Chrome MV3 + offscreen + provider bus

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leakage via logging | Information Disclosure | NEVER log the full key. Existing `extension/utils/redactForLog.js` provides redaction. Bridge JSDoc must document: do NOT log `config.apiKey` in any catch block. |
| Cross-extension message injection | Spoofing | `sender.id !== chrome.runtime.id` check (Phase 5 idiom; reused verbatim in Phase 6 handler). |
| Replay of abort messages | Tampering | Per-call `requestId` uniqueness via `crypto.randomUUID()`; aborts for unknown requestIds are silently dropped (no error). |
| MITM on fetch | Tampering | Lattice adapters use HTTPS by default (api.anthropic.com, api.openai.com, etc.). LM Studio is `localhost` and the threat is local. No new attack surface. |
| Misrouting to wrong provider endpoint | Spoofing | Pitfall 5 mitigation: explicit factory lookup with `invalid_provider` error envelope on miss. |
| DoS via abort spam | DoS | AbortController.abort() is idempotent; spam aborts on the same requestId have no additive effect. New requestIds are bounded by the caller's max-concurrent-call rate (autopilot is single-flight per session). |
| SW eviction during in-flight call | Lifetime mismatch (LOW risk per A6) | The legacy path has the same risk; Phase 6 introduces no NEW exposure. Mitigation deferred to a future SurvivabilityAdapter wiring phase. |

## Section 1: EXACT call sites in agent-loop.js

The planner asked for EXACT line numbers + surrounding context for `universalProvider.execute(...)` / `providerInstance.sendRequest(...)` invocations. Findings:

### Primary call site: `extension/ai/agent-loop.js:1044`
```js
// agent-loop.js:957-1045 (function callProviderWithTools)
async function callProviderWithTools(providerInstance, model, apiKey, messages, tools, providerKey) {
  const formattedTools = _formatToolsForProvider(tools, providerKey);
  let requestBody;
  switch (providerKey) {
    case 'anthropic': { /* builds requestBody with system, messages, tools, cache_control */ break; }
    case 'gemini':    { /* builds requestBody with contents, tools, systemInstruction */ break; }
    default:          { /* OpenAI/xAI/OpenRouter/Custom: messages + tools + temperature + max_tokens */ break; }
  }
  return providerInstance.sendRequest(requestBody);  // <-- LINE 1044: THE ONLY CALL SITE
}
```

This is the **only** location in agent-loop.js where the provider's HTTP-call method is invoked. The function `callProviderWithTools` is itself called from one site: line 1676-1678 (inside `runAgentIteration()`'s `try` block).

### Secondary call site to consider: `runAgentIteration` line 1676-1678
```js
// agent-loop.js:1666-1696 (inside runAgentIteration)
var apiCallStartTime = Date.now();
// ... debug log ...
var response;
try {
  response = await callProviderWithTools(
    providerInstance, model, null, turnMessages, session.tools, providerKey
  );
  // ... usage extraction below operates on `response` which is the raw HTTP body ...
}
```

This is **not** a direct provider call — it's a call to `callProviderWithTools`. The bridge swap can happen entirely inside `callProviderWithTools` at line 1044 without touching `runAgentIteration` at all.

### Iterator-preservation INV-04 line numbers (per CONTEXT.md hard invariant)
| Line | Pattern | Verified byte-frozen |
|------|---------|----------------------|
| 1841 | `session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 100);` (defensive fallback path) | YES — Phase 6 does not touch this line |
| 2439 | `session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 100);` (main schedule) | YES — Phase 6 does not touch this line |
| 2508 | `session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 5000);` (rate-limit retry) | YES — Phase 6 does not touch this line |
| 2518 | `session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 2000);` (network-error retry) | YES — Phase 6 does not touch this line |

**Note:** CONTEXT.md mentions lines 1824/2418/2487/2497 from an older count; the current line numbers are 1841/2439/2508/2518 (a few lines drifted, likely due to comment-line edits in subsequent phases). The setTimeout calls are PRESENT and structurally identical to the documented INV-04 contract. The 4 calls at these line numbers must remain byte-frozen.

### Provider instantiation site: `extension/ai/agent-loop.js:1159-1164` (where `new (_UniversalProvider)({...})` is called)
```js
// agent-loop.js:1155-1173
let providerInstance = session.providerConfig?.providerInstance || null;
if (!providerInstance || ...) {
  providerInstance = new (_UniversalProvider)({
    modelProvider: providerKey,
    modelName: modelName,
    ...settings
  });
}
session.providerConfig = { providerKey, model: modelName, apiKey: ..., providerInstance };
```

Phase 6 does NOT remove this instantiation — `providerInstance` is used by `callProviderWithTools` to get headers/endpoint when the flag is OFF. When flag is ON, the bridge ignores providerInstance and uses the config map directly. The `providerInstance` cache stays in place.

## Section 2: EXACT return shape contract — what `universal-provider.js` produces today

The planner asked for a field-by-field mapping. Findings:

### What `UniversalProvider.sendRequest(requestBody)` returns
From `extension/ai/universal-provider.js:462` — `return result;` where `const result = await response.json();`. That is: **the raw HTTP response body JSON, parsed**. No wrapping, no normalization. Exactly what `fetch().then(r => r.json())` produces.

### What the agent-loop consumes from that response (verified via grep of tool-use-adapter.js)
| Consumer | Provider | Reads | Source file:line |
|----------|----------|-------|------------------|
| `_parseToolCalls` | anthropic | `response.content[]` where `b.type === 'tool_use'`; reads `b.id`, `b.name`, `b.input` | tool-use-adapter.js:108-113 |
| `_parseToolCalls` | gemini | `response.candidates[0].content.parts[]` where `p.functionCall`; reads `p.functionCall.id/.name/.args` | tool-use-adapter.js:120-125 |
| `_parseToolCalls` | default (openai/xai/openrouter/custom) | `response.choices[0].message.tool_calls[]`; reads `c.id`, `c.function.name`, `JSON.parse(c.function.arguments)` | tool-use-adapter.js:132-138 |
| `_isToolCallResponse` | anthropic | `response.stop_reason === 'tool_use'` | tool-use-adapter.js:219 |
| `_isToolCallResponse` | gemini | `response.candidates[0].content.parts[].functionCall` presence | tool-use-adapter.js:224-225 |
| `_isToolCallResponse` | default | `response.choices[0].finish_reason === 'tool_calls'` OR tool_calls array length > 0 | tool-use-adapter.js:235-238 |
| `_formatAssistantMessage` | anthropic | `response.content` (full array) | tool-use-adapter.js:262 |
| `_formatAssistantMessage` | gemini | `response.candidates[0].content.parts` | tool-use-adapter.js:269 |
| `_formatAssistantMessage` | default | `response.choices[0].message` (full object) | tool-use-adapter.js:274 |
| `_extractUsage` | anthropic | `response.usage.input_tokens` + `output_tokens` | tool-use-adapter.js:303-305 |
| `_extractUsage` | gemini | `response.usageMetadata.promptTokenCount` + `candidatesTokenCount` | tool-use-adapter.js:309-310 |
| `_extractUsage` | default | `response.usage.prompt_tokens` + `completion_tokens` | tool-use-adapter.js:316-317 |

### Implication for the bridge shim
**The bridge MUST return the raw HTTP response body.** It must NOT return Lattice's normalized envelope `{rawOutputs: {...}, normalizedUsage: {...}}`. The Lattice adapter's `response.rawResponse` field IS the raw HTTP body and is preserved across all 7 providers (anthropic.ts:102, gemini.ts:121, adapters.ts:128 — verified in Section 16 below).

**Normalization mapping (field-by-field):**

For the success path:
```js
// Bridge shim does:
const envelope = await chrome.runtime.sendMessage({type: 'lattice-provider-execute', ...});
if (envelope.ok) {
  return envelope.response.rawResponse;  // <-- THIS IS THE RAW HTTP BODY
}
```

This is exactly what `universalProvider.sendRequest()` returns today, byte-for-byte (same JSON parsed by the same `response.json()` call in the offscreen page).

## Section 3: Lattice provider factory signatures for all 7

From `lattice/packages/lattice/src/providers/*.ts` (verified via direct Read of each file):

### createOpenAIProvider(options)
```ts
// adapters.ts:200-206
options: { id?, model: string, baseUrl: string, apiKey?, fetch?, pricing? }
returns: ProviderAdapter { id: "openai", kind: "provider-adapter", capabilities: [...], execute(request) }
```
**Notes:** Caller MUST supply `baseUrl`. `apiKey` optional (omitting sends no auth header). Internally calls `createOpenAICompatibleProvider` with `id="openai"`.

### createOpenAICompatibleProvider(options) — used as `custom` in FSB
```ts
// adapters.ts:32-132
options: { id?, model: string, baseUrl: string, apiKey?, fetch?, pricing? }
returns: ProviderAdapter { id: id ?? "openai-compatible", ... }
```
**Notes:** `baseUrl` is concatenated with `/chat/completions` (line 110). Auth: `Authorization: Bearer ${apiKey}` when provided (line 53).

### createAnthropicProvider(options)
```ts
// anthropic.ts:24-37,43-106
options: { id?, model: string, apiKey: string, baseUrl?, anthropicVersion?, fetch?, pricing? }
returns: ProviderAdapter { id: "anthropic", ... }
```
**Notes:** `baseUrl` default `https://api.anthropic.com`. `apiKey` REQUIRED. Headers: `x-api-key`, `anthropic-version: 2023-06-01`. POSTs to `/v1/messages`. **Internal body** (line 67-79): hard-coded `{model, system: "", messages: [{role: "user", content: request.task}], max_tokens: 2000}`. Response parser reads `body.content[0].text`.

### createGeminiProvider(options)
```ts
// gemini.ts:26-37,57-125
options: { id?, model: string, apiKey: string, baseUrl?, fetch?, pricing? }
returns: ProviderAdapter { id: "gemini", ... }
```
**Notes:** `baseUrl` default `https://generativelanguage.googleapis.com`. Auth via `?key=${apiKey}` query string. POSTs to `/v1beta/models/${model}:generateContent`. Body hard-coded: `{contents: [{role: "user", parts: [{text: request.task}]}], generationConfig: {temperature: 0.7, topP: 0.9, maxOutputTokens: 2000}, safetySettings: [BLOCK_NONE x4]}`. Response: `body.candidates[0].content.parts[0].text`.

### createXaiProvider(options) — note: function is `createXaiProvider` not `createXAIProvider`
```ts
// xai.ts:23-27,31-76
options: extends OpenAICompatibleProviderOptions (Omit id, baseUrl) + { id?, baseUrl? }
returns: ProviderAdapter { id: "xai", ... }
```
**Notes:** Thin wrapper around `createOpenAICompatibleProvider` with `baseUrl` default `https://api.x.ai/v1` and `id="xai"`. Preserves xAI's `completion_tokens_details.reasoning_tokens` quirk in `response.usage.totalTokens` (line 60-72).

### createOpenRouterProvider(options)
```ts
// openrouter.ts:26-31,35-41
options: extends OpenAICompatibleProviderOptions (Omit id, baseUrl) + { id?, baseUrl? }
returns: ProviderAdapter { id: "openrouter", ... }
```
**Notes:** Thin wrapper. `baseUrl` default `https://openrouter.ai/api/v1`.

### createLmStudioProvider(options) — note: function is `createLmStudioProvider` not `createLMStudioProvider`
```ts
// lm-studio.ts:25-37,41-47
options: extends OpenAICompatibleProviderOptions (Omit id, baseUrl, apiKey) + { id?, baseUrl?, apiKey? }
returns: ProviderAdapter { id: "lm-studio", ... }
```
**Notes:** Thin wrapper. `baseUrl` default `http://localhost:1234/v1`. `apiKey` OPTIONAL (no auth header if omitted, per CD-03).

### Common return shape (all 7)
```ts
// provider.ts:98-116 (ProviderRunResponse)
{
  rawOutputs: Record<string, unknown>,    // e.g. {text: "extracted content"}
  artifactRefs?: ArtifactInput[],          // unused by FSB
  usage?: UsageRecord,                     // legacy {inputTokens, outputTokens, totalTokens}
  normalizedUsage?: Usage,                 // Phase 7 {promptTokens, completionTokens, costUsd}
  rawResponse?: unknown,                   // <-- THE FULL HTTP BODY JSON (THIS IS WHAT THE BRIDGE EXTRACTS)
}
```

### Per-provider quirks for the shim
| Provider | Quirk | Where surfaced |
|----------|-------|----------------|
| xAI | `completion_tokens_details.reasoning_tokens` | `response.rawResponse.usage.completion_tokens_details.reasoning_tokens` (preserved verbatim; agent-loop's `_extractUsage` doesn't read it but tool-use-adapter.js line 316-317 only reads `prompt_tokens` + `completion_tokens` which IS what reasoning tokens are billed under) |
| Anthropic | Top-level `system` field separate from `messages` | Adapter hard-codes `system: ""` (Phase 4 deferred prompt-caching). For autopilot path the bridge bypasses adapter body construction (Section 16). For test-connection the empty system is fine. |
| Gemini | `contents[].parts[].text` + `?key=` query auth | Same — bridge bypass for autopilot; test-connection uses Lattice's default body. |
| LM Studio | No auth header by default | Lattice handles this conditionally (adapters.ts:53). |
| OpenRouter | No quirks beyond OpenAI-compat | None. |
| Custom (FSB key) | Maps to `createOpenAICompatibleProvider` | Caller supplies `baseUrl` from `settings.customEndpoint`. |
| OpenAI | Caller supplies baseUrl (Lattice doesn't hard-code) | FSB's `extension/ai/universal-provider.js:15` hard-codes `https://api.openai.com/v1/chat/completions`; bridge config must pass `baseUrl: 'https://api.openai.com/v1'` (Lattice will append `/chat/completions`). |

## Section 4: Provider name discrimination — FSB key → Lattice factory inventory

See Pattern 2 above (object literal dispatch). 1:1 mapping with three name normalizations:

| FSB provider key | Lattice factory function | Lattice adapter `.id` |
|------------------|--------------------------|----------------------|
| `xai`            | `createXaiProvider`      | `"xai"` |
| `openai`         | `createOpenAIProvider`   | `"openai"` |
| `anthropic`      | `createAnthropicProvider`| `"anthropic"` |
| `gemini`         | `createGeminiProvider`   | `"gemini"` |
| `openrouter`     | `createOpenRouterProvider` | `"openrouter"` |
| `lmstudio`       | `createLmStudioProvider` | `"lm-studio"` (hyphenated id) |
| `custom`         | `createOpenAICompatibleProvider` | `"openai-compatible"` |

**Recommended dispatch shape:** Object literal, exported from the offscreen module's top-level for testability:
```js
const PROVIDER_FACTORIES = {
  xai: lattice.createXaiProvider,
  openai: lattice.createOpenAIProvider,
  anthropic: lattice.createAnthropicProvider,
  gemini: lattice.createGeminiProvider,
  openrouter: lattice.createOpenRouterProvider,
  lmstudio: lattice.createLmStudioProvider,
  custom: lattice.createOpenAICompatibleProvider,
};
```

**1:1 confirmation:** 7 FSB keys ↔ 7 Lattice factories. No aliases, no FSB-only providers, no Lattice-only factories without an FSB consumer. (Lattice also exports `createAISdkProvider` and `createFakeProvider` — neither needed by FSB Phase 6.)

## Section 5: chrome.offscreen API — minimum Chrome version + reasons selection

**Minimum Chrome:** `chrome.offscreen` API itself shipped in Chrome 109. `hasDocument()` available from the same version. [CITED: https://developer.chrome.com/docs/extensions/reference/api/offscreen — full method table]

**FSB target:** Manifest declares no `minimum_chrome_version` field, but the project documentation (REQUIREMENTS.md + ROADMAP.md) and the bundler config (`target: ['chrome120']` in esbuild.config.js) imply Chrome 116+ floor. WELL above the offscreen API floor (109). No polyfill needed.

**Reasons selection:** 15 valid values exist [CITED: https://developer.chrome.com/docs/extensions/reference/api/offscreen]. None of them perfectly describe "host a fetch+parse JS context." The two viable candidates:

| Reason | Spec | Fit |
|--------|------|-----|
| `WORKERS` | "Specifies that the offscreen document needs to spawn workers." | Closest match — the offscreen page hosts a JS context that acts as a worker for the SW |
| `IFRAME_SCRIPTING` | "Specifies that the offscreen document needs to embed and script an iframe in order to modify the iframe's content." | Mismatch — FSB doesn't embed iframes |

**Recommendation: `WORKERS`** (the CONTEXT.md scope-extension's `IFRAME_SCRIPTING` is a placeholder; the planner should pick `WORKERS` for accuracy). Documented decision should be captured in the plan SUMMARY.

**Phase 5 existing offscreen handler:** The existing `extension/offscreen/lattice-host.js` is set up via Phase 5 Plan 05-04 but `chrome.offscreen.createDocument` was never called from background.js (D-22 deferral, audit gap G3). Phase 6 makes the SW open this document at startup. There is no risk of doubling — `hasDocument()` returns true if the document is already open (e.g., from a manual reload in DevTools), preventing duplicate creation.

## Section 6: chrome.runtime.sendMessage + sendResponse + return true — gotchas

[CITED: https://developer.chrome.com/docs/extensions/develop/concepts/messaging, https://bobbyhadz.com/blog/a-listener-indicated-asynchronous-response-by-returning-true]

### Three documented gotchas
1. **`sendResponse` callback expires if listener returns synchronously without `return true`.** If the listener finishes (returns `undefined` or `false`) before `sendResponse` is called, Chrome closes the channel and the caller resolves with `undefined`. ALWAYS return `true` for async work.
2. **Promise rejection inside async handler does NOT auto-fire sendResponse.** Awaited rejections must be caught with try/catch and turned into explicit `sendResponse({ok: false, error: {...}})` calls. Unhandled rejection → channel times out → caller gets `chrome.runtime.lastError` = "message port closed before response was received."
3. **Multiple listeners + `return true` = only one wins.** If two listeners both return true for the same message, only the FIRST `sendResponse` call wins; the second is silently dropped. Mitigation: dispatch on `message.type` early and `return false` for unknown types so only the relevant listener owns the channel.

### Safe handler pattern (Phase 6 recommendation)
Already documented in Pitfall 1 above + Example 2. Reproduced for the planner's reference:
```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'lattice-provider-execute') return false;
  if (sender?.id !== chrome.runtime.id) return false;
  (async () => {
    try {
      const envelope = await runAdapter(message);
      sendResponse({ ok: true, response: envelope });
    } catch (err) {
      sendResponse({ ok: false, error: { kind: 'adapter_error', message: String(err?.message ?? err) } });
    }
  })();
  return true;
});
```

### Caller side (bridge shim)
- `chrome.runtime.sendMessage(msg)` returns a Promise — `await` it directly.
- If no listener exists OR the channel closes, the Promise REJECTS (not resolves to undefined) in Chrome 105+. Catch the rejection and convert to `host_unreachable` error.
- Pre-Chrome-105 behavior was to resolve with `undefined`; FSB's Chrome 116 floor means we can rely on the rejection behavior. Defensive: check both `await` rejection AND `envelope === undefined` (matches the bridge code in Example 1).

## Section 7: AbortController in offscreen context — availability

[CITED: https://developer.mozilla.org/en-US/docs/Web/API/AbortController — supported in all browsers since Chrome 66 / Firefox 57 / Safari 12.1, baseline web standard]

**Confirmation:** `new AbortController()` is available in any Chrome >= 66, which is far below FSB's 116 floor. No polyfill. Available in MV3 SW, offscreen pages, content scripts, sidepanel, options page — every JS execution context Chrome offers.

### Per-request abort flow (locked decision Q2)
```
[SW]  bridge.executeViaBridge(provider, config, body, {signal})
        |
        +-- generate requestId = crypto.randomUUID()
        |
        +-- if (signal) signal.addEventListener('abort', () => chrome.runtime.sendMessage({type: 'lattice-provider-abort', requestId}), {once: true})
        |
        +-- await chrome.runtime.sendMessage({type: 'lattice-provider-execute', requestId, ...})  [returns when handler calls sendResponse]
        |
        v  (parallel)
[Offscreen] handler receives {type: 'lattice-provider-execute', requestId, ...}
        |
        +-- ctl = new AbortController(); _inflightAborts.set(requestId, ctl)
        |
        +-- adapter.execute(latticeRequest, {signal: ctl.signal})
        |     |
        |     +-- internally: fetch(url, {signal: ctl.signal, ...})  [Lattice forwards signal]
        |
        +-- (if abort fires): handler receives {type: 'lattice-provider-abort', requestId}
        |                     -> _inflightAborts.get(requestId).abort()
        |                     -> the fetch throws AbortError -> adapter.execute throws
        |                     -> handler catches in try/catch -> sendResponse({ok:false, error:{kind:'aborted', ...}})
        |
        +-- on settle (success OR error OR abort): _inflightAborts.delete(requestId)
```

**Race condition note:** The abort message can arrive BEFORE the primary execute message in pathological cases (e.g., SW reorders sends). Mitigation: handler treats abort-for-unknown-requestId as a silent no-op (Map.get returns undefined; if (ctl) check prevents throw). Per-execute message is processed in arrival order by Chrome's message queue, so the realistic race is the abort arriving AFTER the adapter has already resolved → again a no-op.

## Section 8: Existing tests/lattice-*-smoke.test.js patterns

Verified against `tests/lattice-survivability-smoke.test.js` (the most recent and comprehensive smoke):

### Convention (reused by Phase 6 smoke)
- CJS (`'use strict';`), no transpilation, runnable via `node tests/<file>`.
- Local `let passed = 0; let failed = 0;` counters + `passAssert(cond, msg)` + `passAssertEqual(actual, expected, msg)` helpers (lines 41-56).
- 5-Part structure (Part 1: surface presence; Part 2: factory behavior; Part 3: integration with real signer; Part 4: feature-flag default-off proof; Part 5: byte-frozen carryforward).
- Real Lattice imports via `await import('lattice')` (dynamic ESM from CJS).
- Real Ed25519 + real signer + real verifyReceipt — NO mocks for Lattice itself.
- Mocks only for chrome.* APIs that don't exist in Node (lines 63-93: `createChromeStorageSessionMock()`; lines 132-139: chrome.runtime stub).
- Single `process.exit(failed > 0 ? 1 : 0)` at the end.
- Appended to `package.json scripts.test` chain as the LAST entry — Phase 1+2+3+4+5 smokes BYTE-FROZEN order (per Phase 5 Plan 05-05 SUMMARY).

### New smoke file: `tests/lattice-provider-bridge-smoke.test.js` (NEW — Wave 0 dependency)

**Recommended 6-Part structure (>=20 PASS total):**

- **Part 1: Surface presence (5 PASS)**
  - `executeViaBridge` is a function reachable from `extension/ai/lattice-provider-bridge.js`.
  - 7 PROVIDER_FACTORIES keys map to functions when `lattice` is imported (xai, openai, anthropic, gemini, openrouter, lmstudio, custom).

- **Part 2: Per-provider message bus round-trip (7 PASS, one per provider)**
  - Mock `chrome.runtime.sendMessage` to dispatch to the handler in `extension/offscreen/lattice-host.js` (load it via dynamic import or require).
  - Mock `fetch` to return per-provider happy bodies (reuse the fake bodies from Phase 4's smoke: `ANTHROPIC_FAKE_BODY`, `GEMINI_FAKE_BODY`, `OPENAI_COMPAT_FAKE_BODY`).
  - For each provider, call `executeViaBridge('${provider}', {apiKey, model, baseUrl}, {task: 't'}, {mode: 'test-connection'})` and assert the return is the raw HTTP body.

- **Part 3: Error envelope shape on adapter rejection (3 PASS)**
  - Mock fetch to throw — bridge should reject with `code === 'adapter_error'`.
  - Mock sendMessage to return undefined — bridge should reject with `code === 'host_unreachable'`.
  - Call bridge with `provider: 'unknown'` — bridge should receive envelope with `kind: 'invalid_provider'`.

- **Part 4: AbortController propagation (2 PASS)**
  - Create AbortController; call bridge; abort before fetch resolves; assert bridge rejects with `code === 'aborted'`.
  - Pre-aborted signal: assert bridge throws synchronously with code 'aborted'.

- **Part 5: Feature flag + options.js trim defense (3 PASS)**
  - Static-text grep: `extension/ui/options.js` lines 977-1029 contain `.trim()` calls for all 7 API key fields.
  - Static-text grep: `extension/ai/agent-loop.js` line ~1044 contains `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` check OR `executeViaBridge` invocation.
  - Static-text grep: `extension/ui/options.js` `checkApiConnection` reads `elements.apiKey?.value?.trim()` (not from chrome.storage).

- **Part 6: INV-04 byte-freeze + INV-01/02/05/06 (>= 4 PASS)**
  - `grep -c setTimeout extension/ai/agent-loop.js` returns 8 (current baseline, verified via Bash above).
  - The 4 setTimeout iterator lines (1841, 2439, 2508, 2518) contain `runAgentIteration(sessionId, options)` calls.
  - `tests/tool-definitions-parity.test.js` still passes 142/142 (existing test, just chain it).
  - `extension/_archive/` does NOT exist or is empty (Phase 6 does NOT archive universal-provider.js; Phase 7 does).

Total: 5 + 7 + 3 + 2 + 3 + 4 = **24 PASS minimum**, exceeding the >=20 requirement.

### Chrome runtime mock for the new smoke
```js
// Recommended pattern. Reuse lines 132-139 of lattice-survivability-smoke.test.js + ADD sendMessage/onMessage.
function createChromeRuntimeMock(handler) {
  const listeners = handler ? [handler] : [];
  const runtime = {
    id: 'fsb-test-extension-id',
    onMessage: {
      addListener(fn) { listeners.push(fn); }
    },
    sendMessage(message) {
      return new Promise((resolve, reject) => {
        if (listeners.length === 0) {
          // Chrome 105+ behavior: rejects when no listener
          reject(new Error('Could not establish connection. Receiving end does not exist.'));
          return;
        }
        const sender = { id: runtime.id };
        let responded = false;
        const sendResponse = (envelope) => {
          if (!responded) { responded = true; resolve(envelope); }
        };
        let kept = false;
        for (const l of listeners) {
          const ret = l(message, sender, sendResponse);
          if (ret === true) { kept = true; break; }
        }
        if (!kept && !responded) resolve(undefined);
      });
    }
  };
  return runtime;
}
```

## Section 9: chrome.offscreen mock for tests

```js
function createChromeOffscreenMock() {
  let docOpen = false;
  return {
    async hasDocument() { return docOpen; },
    async createDocument(opts) {
      if (docOpen) throw new Error('Only a single offscreen document may be created.');
      docOpen = true;
      return undefined;
    },
    async closeDocument() { docOpen = false; }
  };
}
```

Test the idempotency: call `ensureLatticeOffscreen()` twice; assert `createDocument` was called exactly once (use a spy counter).

## Section 10: Feature flag plumbing — `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED`

Locked by ROADMAP: default-on. Implementation pattern derives from Phase 5 Plan 05-05's `FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` (default-off). Same global-flag uniform-check idiom:

```js
// Recommended pattern. Source: extension/ai/lattice-runtime-adapter.js Plan 05-05 idiom + D-20.
// Place this in agent-loop.js callProviderWithTools at line 1044 swap:
if (typeof FSB_LATTICE_PROVIDER_BRIDGE_ENABLED === 'undefined' || FSB_LATTICE_PROVIDER_BRIDGE_ENABLED) {
  // default-on: use bridge
  return executeViaBridge(providerKey, /* config */, requestBody, {});
}
// flag explicitly false: legacy fallback
return providerInstance.sendRequest(requestBody);
```

**Default-on encoding:** Note the differs-from-Phase-5 logic — Phase 5 was "if undefined OR false → legacy"; Phase 6 is "if undefined OR true → bridge." The check `typeof X === 'undefined' || X` evaluates to `true` for both undefined AND explicit-true, which is the desired default-on behavior.

**Where to set the flag to false:** The flag is set on `globalThis` from DevTools console (e.g., `globalThis.FSB_LATTICE_PROVIDER_BRIDGE_ENABLED = false;`). No UI surface per CONTEXT.md specifics (line 86: "No UI surfaces the flag — only `globalThis` / a dev-tools toggle"). The plan must ensure NO importScripts file pre-sets the flag — it should be undefined by default, and the uniform check treats undefined === true (default-on).

**No import cycles:** The bridge file `extension/ai/lattice-provider-bridge.js` is a top-level utility. It imports nothing from agent-loop.js. agent-loop.js calls into the bridge (one-way). universal-provider.js is unchanged. No cycles.

**No duplicate import declarations:** Both bridge AND universal-provider can coexist — they have no overlapping export names (`executeViaBridge` vs `UniversalProvider`).

## Section 11: Offscreen handler design (FINT-07 detail)

Already detailed in Example 2 above. Additional planner-facing notes:

### File location confirmation
- Target: APPEND to `extension/offscreen/lattice-host.js` (do NOT create a new file; the offscreen-page entry point is fixed by `extension/offscreen/lattice-host.html` which references `lattice-host.js` directly via `<script type="module" src="lattice-host.js">`).
- Phase 5 onMessage handler at lines 142-225 stays byte-frozen.
- New code: ~80-120 lines for the new handler branch + abort registry + PROVIDER_FACTORIES dispatch + (per Section 16) the autopilot-path fetch logic.

### Bundle implication
- `npm run build` regenerates `extension/dist/offscreen/lattice-host.js` from the source. After Phase 6 source edits, the bundle MUST be rebuilt before MV3 reload. The plan must include a build step.

### Per-provider config derivation (planner detail)
The bridge sends a `config` object; the handler must derive per-provider Lattice factory options. Inventory:

| Provider | Lattice factory option | FSB config field | Notes |
|----------|----------------------|------------------|-------|
| xai | `{model, apiKey, baseUrl?, fetch?}` | `model = settings.modelName`, `apiKey = settings.apiKey` | baseUrl default fine (xAI hard-coded) |
| openai | `{model, apiKey, baseUrl}` | `model = settings.modelName`, `apiKey = settings.openaiApiKey`, `baseUrl = 'https://api.openai.com/v1'` | Lattice doesn't hard-code OpenAI base; must supply |
| anthropic | `{model, apiKey, baseUrl?}` | `model = settings.modelName`, `apiKey = settings.anthropicApiKey` | baseUrl default fine |
| gemini | `{model, apiKey, baseUrl?}` | `model = settings.modelName`, `apiKey = settings.geminiApiKey` | baseUrl default fine |
| openrouter | `{model, apiKey, baseUrl?}` | `model = settings.modelName`, `apiKey = settings.openrouterApiKey` | baseUrl default fine |
| lmstudio | `{model, baseUrl}` | `model = settings.modelName`, `baseUrl = settings.lmstudioBaseUrl + '/v1'` (note the existing `normalizeProviderBaseUrl` strips `/v1` then re-adds; Phase 6 handler must build the correct base URL) | apiKey omitted |
| custom | `{model, apiKey, baseUrl}` | `model = settings.modelName`, `apiKey = settings.customApiKey`, `baseUrl = settings.customEndpoint` (caller-supplied) | Use `createOpenAICompatibleProvider` |

The SW-side bridge constructs the `config` object once per call based on `providerInstance.settings`; the offscreen handler trusts it and passes to the factory.

## Section 12: Background.js startup wiring (FINT-07 detail)

Already detailed in Example 3 above. Additional planner-facing notes:

### Insertion point analysis
- `onInstalled.addListener` starts at line 13113. Add the `ensureLatticeOffscreen()` call near the top (after `initializeAnalytics()` at line 13117).
- `onStartup.addListener` starts at line 13189. Add the same call near the top (after `initializeAnalytics()` at line 13191).
- The helper function `ensureLatticeOffscreen` can be declared anywhere; recommend right above the onInstalled listener (around line 13110) so the listener reads inline.
- The new `importScripts('ai/lattice-provider-bridge.js');` line must be inserted at the top of the importScripts chain so the bridge global is available when agent-loop.js evaluates. Recommended position: after line 11 (`importScripts('ai/cli-parser.js');`) so that ai-integration.js (line 12) and tool-definitions.js (line 13) inherit the global if they ever need it.

### "background.js BYTE-FROZEN except the offscreen wiring" interpretation
CONTEXT.md says background.js's "only diff is the chrome.offscreen.createDocument startup wiring + hasDocument guard. 153 importScripts chain unchanged." This is interpreted as:
- The 153 importScripts call sites STAY in identical line positions (with any new ones APPENDED, not inserted into the chain mid-stream).
- The new importScripts('ai/lattice-provider-bridge.js') is a NEW LINE that does not disturb existing chain order.

**Plan-check verification step:** `grep -c "importScripts" extension/background.js` should change from current count by +1 only. The relative ORDER of all existing importScripts() calls should be byte-preserved.

## Section 13: Test-connection rewrite specifics (FINT-08 detail — options.js)

### `elements.apiKey` interpretation
`elements.apiKey` is the xAI key input field (`document.getElementById('apiKey')` at options.js:139). FSB's UI has a per-provider field convention:

| Provider | Input element ID | `elements.*` registration |
|----------|------------------|---------------------------|
| xai | `apiKey` | `elements.apiKey` (line 139) |
| gemini | `geminiApiKey` | `elements.geminiApiKey` (line 140) |
| openai | `openaiApiKey` | NOT in elements map (read inline via getElementById at line 983) |
| anthropic | `anthropicApiKey` | NOT in elements map (line 984) |
| custom | `customApiKey` + `customEndpoint` | NOT in elements map (lines 985-986) |
| openrouter | `openrouterApiKey` | NOT in elements map (line 987) |
| lmstudio | `lmstudioBaseUrl` (no apiKey) | NOT in elements map (line 988) |

### How to determine which provider is selected
`elements.modelProvider?.value` returns 'xai' | 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'lmstudio' | 'custom'. The select element exists at line 137 (`elements.modelProvider = document.getElementById('modelProvider');`).

### Recommended `checkApiConnection()` rewrite
```js
// REPLACE extension/ui/options.js lines 1077-1131 with:
async function checkApiConnection() {
  dashboardState.connectionStatus = 'checking';
  updateConnectionStatus('checking', 'Checking connection...');
  try {
    const provider = elements.modelProvider?.value || 'xai';
    const modelName = elements.modelName?.value || 'grok-4-1-fast';
    // Per-provider key selector. Maps directly to the input fields the user sees.
    const PROVIDER_KEY_GETTERS = {
      xai:        () => (elements.apiKey?.value || '').trim(),
      gemini:     () => (elements.geminiApiKey?.value || '').trim(),
      openai:     () => (document.getElementById('openaiApiKey')?.value || '').trim(),
      anthropic:  () => (document.getElementById('anthropicApiKey')?.value || '').trim(),
      custom:     () => (document.getElementById('customApiKey')?.value || '').trim(),
      openrouter: () => (document.getElementById('openrouterApiKey')?.value || '').trim(),
      lmstudio:   () => '', // LM Studio has no API key
    };
    const PROVIDER_NAMES = { xai: 'xAI', gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Anthropic', custom: 'Custom', openrouter: 'OpenRouter', lmstudio: 'LM Studio' };
    const apiKey = (PROVIDER_KEY_GETTERS[provider] || (() => ''))();
    if (!apiKey && provider !== 'lmstudio') {
      updateConnectionStatus('disconnected', 'No API key configured');
      updateApiStatusCard('disconnected', 'No API Key', `Configure your ${PROVIDER_NAMES[provider] || provider} API key to get started`);
      return;
    }
    // Build config from current input values (NOT from chrome.storage — closes the xai-key-rejected-400 P2 defect)
    const config = {
      apiKey,
      model: modelName,
      baseUrl: provider === 'custom' ? (document.getElementById('customEndpoint')?.value || '').trim()
             : provider === 'lmstudio' ? ((document.getElementById('lmstudioBaseUrl')?.value || 'http://localhost:1234').trim() + '/v1')
             : provider === 'openai' ? 'https://api.openai.com/v1'
             : undefined, // others use Lattice defaults
    };
    // The bridge supports a `mode: 'test-connection'` shortcut that builds the Lattice request with task: "Test connection."
    const startTime = Date.now();
    try {
      const response = await executeViaBridge(provider, config, { __testConnection: true }, { mode: 'test-connection' });
      const responseTime = Date.now() - startTime;
      updateConnectionStatus('connected', 'Connected');
      if (elements.apiStatusCard) elements.apiStatusCard.style.display = 'none';
      addLog('info', `API connection successful (${responseTime}ms) with model: ${modelName}`);
    } catch (err) {
      const responseTime = Date.now() - startTime;
      updateConnectionStatus('disconnected', 'Connection failed');
      updateApiStatusCard('disconnected', 'Connection Failed', err.message || 'Unknown error');
      addLog('error', `API connection failed (${responseTime}ms): ${err.message}`);
    }
  } catch (error) {
    updateConnectionStatus('disconnected', 'Connection error');
    updateApiStatusCard('disconnected', 'Connection Error', error.message);
    addLog('error', `API connection error: ${error.message}`);
  }
}
```

**Lines changed:** Replace 977-1131 with the above (~55 lines old → ~50 lines new). The `aiIntegration = new AIIntegration(settings)` + `aiIntegration.testConnection()` calls (current lines 1110-1112) are REMOVED — bridge is the new path. AIIntegration class stays on disk (used elsewhere?) — grep confirms it's used by background.js for other paths; do NOT delete the class, just stop using it from `checkApiConnection`.

### Defense-in-depth trim on `saveSettings()` (lines 977-1029)
```js
// REPLACE lines 981-987 + 1000 with trimmed versions:
apiKey: (elements.apiKey?.value || '').trim(),
geminiApiKey: (elements.geminiApiKey?.value || '').trim(),
openaiApiKey: (document.getElementById('openaiApiKey')?.value || '').trim(),
anthropicApiKey: (document.getElementById('anthropicApiKey')?.value || '').trim(),
customApiKey: (document.getElementById('customApiKey')?.value || '').trim(),
customEndpoint: (document.getElementById('customEndpoint')?.value || '').trim(),
openrouterApiKey: (document.getElementById('openrouterApiKey')?.value || '').trim(),
lmstudioBaseUrl: (document.getElementById('lmstudioBaseUrl')?.value || 'http://localhost:1234').trim(),
// ... (line 989 onward unchanged)
// Line 1000:
captchaApiKey: (elements.captchaApiKey?.value || '').trim(),
```

This is the defense-in-depth pattern (the bridge already trims, but storing trimmed values prevents stale-unsanitized data from re-leaking if any other code path reads from storage).

## Section 14: Bridge call-site swap in agent-loop.js (FINT-08 detail)

### Single line modification at line 1044
```js
// extension/ai/agent-loop.js BEFORE:
//   return providerInstance.sendRequest(requestBody);
// AFTER (only the return statement changes; switch + body construction unchanged):
   if (typeof FSB_LATTICE_PROVIDER_BRIDGE_ENABLED === 'undefined' || FSB_LATTICE_PROVIDER_BRIDGE_ENABLED) {
     const cfg = providerInstance.config || {};
     const settings = providerInstance.settings || {};
     return executeViaBridge(providerKey, {
       apiKey: settings[cfg.keyField] || '',
       model: providerInstance.model,
       baseUrl: providerKey === 'custom' ? settings.customEndpoint
              : providerKey === 'lmstudio' ? (settings.lmstudioBaseUrl ? settings.lmstudioBaseUrl + '/v1' : 'http://localhost:1234/v1')
              : providerKey === 'openai' ? 'https://api.openai.com/v1'
              : undefined,
     }, requestBody, { mode: 'autopilot' });
   }
   return providerInstance.sendRequest(requestBody);
```

**Bytes added:** ~10 lines (the new branch). Bytes removed: 0 (the legacy fallback stays).

**INV-04 preservation:** This change is inside `callProviderWithTools` (an async function), NOT inside the setTimeout iterator at lines 1841/2439/2508/2518. The iterator's `setTimeout(cb, ms) → cb() → cb invokes runAgentIteration → runAgentIteration awaits callProviderWithTools` pattern is byte-frozen. The change is below the iterator boundary.

## Section 15: Test smoke (FINT-08 detail) — file structure

Already detailed in Section 8 above. Recommended file skeleton: ~280-350 lines following Phase 5 Plan 05-05 smoke conventions. Place at `tests/lattice-provider-bridge-smoke.test.js`. Append to `package.json scripts.test` chain as the FINAL entry (after `tests/lattice-survivability-smoke.test.js`).

## Section 16: ARCHITECTURAL DECISION — autopilot path vs Lattice adapter contract

This section addresses Open Question 1 (Strategy A vs B) and Pitfall 4. **Read this before planning.**

### The mismatch
- `agent-loop.js:957-1044` `callProviderWithTools()` builds a provider-specific `requestBody` with **full multi-turn messages + tools + provider-specific cache_control / systemInstruction / generationConfig**.
- Lattice adapter `.execute(request)` accepts only `{task: string, artifacts, outputs, signal?}` and builds a single-user-message body internally [VERIFIED: anthropic.ts:67-79, gemini.ts:78-93, adapters.ts:55-107].
- Result: passing FSB's `requestBody` to `adapter.execute()` would silently drop the entire payload structure.

### Strategy A (RECOMMENDED): Bridge handler does its own fetch() inside the offscreen page
The offscreen handler receives `requestBody` (already provider-formatted by `callProviderWithTools`) and `config` (apiKey, model, baseUrl). It directly performs:
```js
const url = computeUrl(provider, config, model);          // mirrors universal-provider.js getEndpoint()
const headers = computeHeaders(provider, config);          // mirrors universal-provider.js getHeaders()
const response = await fetch(url, {
  method: 'POST',
  headers,
  body: JSON.stringify(requestBody),
  signal: ctl.signal
});
const json = await response.json();
sendResponse({ ok: true, response: { rawResponse: json } });
```

This is functionally equivalent to `universalProvider.sendRequest()` — just relocated to the offscreen page.

**Lattice adapter consumption is satisfied by:**
1. The **test-connection path** uses `adapter.execute({task: "Test connection.", ...})` natively — single-shot fits Lattice's contract.
2. The **autopilot path** instantiates the same Lattice adapter (per Q3 locked decision) to extract its endpoint/auth derivation — OR simply colocates: imports the Lattice factories from the `'lattice'` bare specifier at the top of the offscreen module, demonstrating the consumption pathway is wired even if the autopilot path uses its own fetch.

**Why this is acceptable for "FSB consumes Lattice's 7 provider adapters":**
- INV-03 holds: each provider key dispatches through a Lattice factory at minimum.
- INV-06 holds: no Lattice-side commits needed.
- INV-04 holds: agent-loop.js iterator byte-frozen.
- The user's stated goal ("Lattice-first runtime") is preserved at the architectural level: the SW no longer makes the fetch directly; the offscreen page (which IS Lattice-bundled) does.

### Strategy B (NOT RECOMMENDED): Refactor agent-loop to Lattice's ProviderRunRequest shape
- Would require `callProviderWithTools` to build `{task, artifacts, outputs}` instead of provider-specific `requestBody`.
- Would require Lattice adapters to accept tool definitions + multi-turn — a Lattice-side change (violates INV-06 for this milestone).
- Would change the agent-loop iteration body extensively (risks INV-04).

### Strategy C (THEORETICAL, OUT OF SCOPE): Extend Lattice with a pre-built-body passthrough adapter
- Would add a new `createPassthroughProvider({fetch, url, headers, body})` factory to Lattice.
- Would deliver a clean "consume Lattice's adapter" semantic for the autopilot path.
- Would be a Lattice-side commit — violates this phase's "Lattice already shipped; Phase 6 is FSB-side only" constraint.
- Recommend deferring this to v0.11.0+ if cleaner consumption is desired.

### Plan-check action required
The planner MUST surface this decision to the user before drafting plans. Recommended question:

> "Phase 6's autopilot path has an architectural mismatch with Lattice's adapter contract. The Lattice adapter `.execute({task, artifacts, outputs})` cannot carry FSB's multi-turn tool-use payload. Three options:
> (A) Bridge handler does its own fetch inside the offscreen page; Lattice adapters used only for test-connection. (Recommended.)
> (B) Refactor agent-loop to Lattice's shape (touches INV-04 / requires Lattice changes).
> (C) Defer the autopilot path to a Lattice-side passthrough adapter in v0.11.0+.
> Which?"

If user picks A: planner proceeds with the bridge design in this RESEARCH.md.
If user picks B or C: scope changes significantly; re-discussion required.

## Sources

### Primary (HIGH confidence — verified via direct file Read)
- `/Users/lakshmanturlapati/Desktop/FSB/automation/.planning/phases/06-fsb-engine-consumes-lattice-provider-abstraction/06-CONTEXT.md` — Locked decisions, scope, deferred ideas
- `/Users/lakshmanturlapati/Desktop/FSB/automation/.planning/REQUIREMENTS.md` — INV-01..06, FINT-07/08/09, traceability table
- `/Users/lakshmanturlapati/Desktop/FSB/automation/.planning/ROADMAP.md` — Phase 6 scope, pass criteria, deferred items
- `/Users/lakshmanturlapati/Desktop/FSB/automation/.planning/STATE.md` — Pre-Phase-6 state
- `/Users/lakshmanturlapati/Desktop/FSB/automation/.planning/debug/xai-key-rejected-400.md` — P1+P2 defect root causes the bridge closes as side-effect
- `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/offscreen/lattice-host.js` — Phase 5 offscreen handler (extended by Phase 6)
- `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/offscreen/lattice-host.html` — Loads the bundled module
- `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/ai/universal-provider.js` — Legacy runtime path (stays byte-frozen Phase 6)
- `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/ai/agent-loop.js` lines 1044, 1159-1164, 1676, 1841, 2439, 2508, 2518 — Provider call site + iterator
- `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/ai/tool-use-adapter.js` lines 99-320 — Raw HTTP body consumer logic
- `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/ui/options.js` lines 977-1131 — saveSettings + checkApiConnection (rewrite targets)
- `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/background.js` lines 13113, 13189 — onInstalled/onStartup insertion points
- `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/manifest.json` — `offscreen` permission already present; WAR entry for lattice-host.html present
- `/Users/lakshmanturlapati/Desktop/FSB/automation/lattice/packages/lattice/src/providers/{provider,adapters,anthropic,gemini,xai,openrouter,lm-studio}.ts` — All 7 adapter factories + base contract
- `/Users/lakshmanturlapati/Desktop/FSB/automation/lattice/packages/lattice/src/index.ts` — Public surface re-exports
- `/Users/lakshmanturlapati/Desktop/FSB/automation/tests/lattice-providers-smoke.test.js` — Phase 4 smoke pattern (Phase 6 smoke skeleton)
- `/Users/lakshmanturlapati/Desktop/FSB/automation/tests/lattice-survivability-smoke.test.js` — Phase 5 smoke pattern (Phase 6 chrome.* mock pattern)
- `/Users/lakshmanturlapati/Desktop/FSB/automation/tests/lattice-smoke.test.js` — Phase 1 smoke pattern (CJS dynamic-import)
- `/Users/lakshmanturlapati/Desktop/FSB/automation/esbuild.config.js` — Offscreen lattice-host bundle entry
- `/Users/lakshmanturlapati/Desktop/FSB/automation/package.json` — `lattice` file: dep + esbuild ^0.24.0 + scripts.test chain
- `/Users/lakshmanturlapati/Desktop/FSB/automation/.planning/config.json` — `commit_docs: true`, `granularity: fine`, no opt-out for nyquist_validation or security_enforcement

### Secondary (MEDIUM confidence — official Chrome docs)
- https://developer.chrome.com/docs/extensions/reference/api/offscreen — `chrome.offscreen.createDocument`, `hasDocument`, reasons taxonomy
- https://developer.chrome.com/docs/extensions/develop/concepts/messaging — `chrome.runtime.sendMessage`, `onMessage`, `return true` async pattern
- https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID — Chrome 92+ availability
- https://developer.mozilla.org/en-US/docs/Web/API/AbortController — Chrome 66+ availability

### Tertiary (verified across multiple credible sources)
- https://bobbyhadz.com/blog/a-listener-indicated-asynchronous-response-by-returning-true — Pitfall 1 community references
- https://chromestatus.com/feature/5689159362543616 — `crypto.randomUUID()` Chrome feature page

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already on disk and verified
- Architecture (offscreen + bridge): HIGH — Phase 5 patterns directly reusable; chrome.offscreen + chrome.runtime APIs documented
- Pitfalls: HIGH — derived from Chrome docs + community references + verified against existing project test patterns
- Provider factory signatures: HIGH — all 7 source files read directly
- Section 16 architectural decision: HIGH on the evidence (Lattice source code is unambiguous); MEDIUM on user resolution (requires plan-check confirmation)

**Research date:** 2026-05-27
**Valid until:** 2026-06-26 (30 days — chrome.offscreen API is stable; Lattice surface frozen for Phase 6 per INV-06)
