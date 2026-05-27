---
phase: 06-fsb-engine-consumes-lattice-provider-abstraction
reviewed: 2026-05-27T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - extension/offscreen/lattice-host.js
  - extension/background.js
  - extension/ai/lattice-provider-bridge.js
  - extension/ai/agent-loop.js
  - extension/ui/options.js
  - tests/lattice-provider-bridge-smoke.test.js
  - package.json
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-05-27T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 6 lands the Lattice provider bridge via Strategy A (offscreen page does its own
`fetch()` for autopilot; `adapter.execute()` for test-connection only). The
implementation is methodical, well commented, and the smoke suite (85 PASS / 0 FAIL
across 6 Parts) gives meaningful runtime coverage rather than static-text checks.

Strengths:
- Hard invariants INV-01..06 visibly enforced by the smoke (setTimeout count = 8,
  iterator pattern discovery, LATTICE-PIN SHA pinned, tool-definitions parity).
- `executeViaBridge` correctly cleans up the `'abort'` listener in `finally{}` and
  treats pre-aborted signals synchronously (Pitfall 3 mitigation).
- `ensureLatticeOffscreen()` guards with `chrome.offscreen.hasDocument()` and is
  idempotent across `onInstalled` + `onStartup`.
- Cross-extension origin check (`sender.id !== chrome.runtime.id`) is re-applied
  verbatim in the new Phase 6 listener.
- API keys are NEVER logged. Trim normalization is uniformly applied in saveSettings
  (9 fields) and in the per-provider getters of `checkApiConnection`.

The concerns below are mostly defense-in-depth gaps and small correctness
tightenings. None of them are exploitable today, but four warrant fixes before
Phase 7 flag-strip.

## Warnings

### WR-01: AbortController race -- `_inflightAborts.set` happens AFTER the synchronous unknown-provider envelope, but ALSO after `requestId` defaults to "" for missing field

**File:** `extension/offscreen/lattice-host.js:422,439-440`
**Issue:** `requestId = String(message.requestId || "")` falls back to `""` when the
caller omits the field. `controller` is then registered as `_inflightAborts.set("",
controller)`. If TWO concurrent execute calls both arrive without a `requestId`
(programmer bug, not user input), the second `set("", controller)` clobbers the
first controller reference -- the first call is now unaddressable by abort, and the
second call's abort would still cancel only the most recently registered
controller. The `finally{} _inflightAborts.delete(requestId)` on either call also
deletes the OTHER call's entry under the same `""` key.

The bridge shim always synthesizes a UUID via `crypto.randomUUID()` so production
traffic is unaffected, but the offscreen handler is the trust boundary and should
reject empty requestIds explicitly the same way it rejects unknown providers.

**Fix:**
```javascript
const requestId = String(message.requestId || "");
if (!requestId) {
  sendResponse({
    ok: false,
    error: { kind: "invalid_provider", message: "Missing requestId" },
  });
  return false;
}
```
(Or add a new `error.kind: "invalid_request"`; reusing `invalid_provider` keeps
the enum closed and matches the existing synchronous-envelope pattern.)

### WR-02: Bridge `chrome.runtime.sendMessage` resolves to `undefined` -> bridge throws `host_unreachable`, but successful test-connection adapter that returns falsy `response` ALSO collapses to `envelope.response` (which may be `undefined`)

**File:** `extension/ai/lattice-provider-bridge.js:117-119`
**Issue:** The `ok === true` branch returns
`(envelope.response && envelope.response.rawResponse) ? ... : envelope.response`.
If `envelope.response` is `undefined`/`null`/`0`/`""` (e.g. a future Lattice
adapter that legitimately returns a falsy `ProviderRunResponse`, or a malformed
success envelope), the bridge silently returns `undefined`. The caller in
`options.js:1128` then `await`s `undefined`, the `try{}` succeeds, and the UI
shows "Connected" even though no provider response was observed.

For autopilot mode, the caller (agent-loop) feeds `undefined` into
`tool-use-adapter` which would crash deeper in the iteration with a less
diagnosable error.

The offscreen host today always sends `{ rawResponse: json }` for autopilot and
the Lattice adapter for test-connection, so this is forward-defensive (not
currently exploitable), but the asymmetry between "missing envelope" (throws
host_unreachable) and "envelope ok but response missing" (silent
undefined return) is a footgun for future contributors.

**Fix:**
```javascript
if (envelope.ok === true) {
  const r = envelope.response;
  if (r === undefined || r === null) {
    const err = new Error('Offscreen Lattice host returned empty response in success envelope');
    err.code = 'adapter_error';
    throw err;
  }
  return (r && r.rawResponse) ? r.rawResponse : r;
}
```

### WR-03: `agent-loop.js:1054-1057` baseUrl ternary for `openai` always sends `'https://api.openai.com/v1'` but the offscreen `computeUrl` IGNORES it for openai (hardcoded full URL) -- silent contract mismatch

**File:** `extension/ai/agent-loop.js:1054-1057`, `extension/offscreen/lattice-host.js:178-179`
**Issue:** The agent-loop bridge call passes
`baseUrl: provider === 'openai' ? 'https://api.openai.com/v1' : undefined`,
but the offscreen handler's `computeUrl()` returns the FULL
`'https://api.openai.com/v1/chat/completions'` string for `openai` and never
reads `config.baseUrl` for that branch. Today the values agree by coincidence
(the host happens to hardcode the same prefix), but:

1. A custom-deployment user who wants to point `openai` at an internal proxy
   (Azure OpenAI shim, llm-proxy, etc.) cannot do it through this path. The
   universal-provider's `PROVIDER_CONFIGS.openai.endpoint` is also hardcoded,
   so this is a pre-existing limitation; Phase 6 should at minimum document
   that `baseUrl: 'https://api.openai.com/v1'` is a no-op cargo passenger
   instead of leaving the reader to grep two files to discover the asymmetry.
2. The `custom` and `lmstudio` branches DO read `config.baseUrl` -- the
   inconsistency means anyone editing `computeUrl` later may add `openai`
   `baseUrl` support without updating the agent-loop call site, or vice versa.

**Fix:** Either remove the no-op openai baseUrl pass:
```javascript
baseUrl: providerKey === 'custom' ? _settings.customEndpoint
       : providerKey === 'lmstudio' ? ((_settings.lmstudioBaseUrl || 'http://localhost:1234').replace(/\/+$/, '') + '/v1')
       : undefined,
```
or have `computeUrl` honor `config.baseUrl` for openai when present (preferred
long term; opens the proxy door without a Lattice-side change). At minimum,
add a comment on the openai branch of `computeUrl` noting the agent-loop
sends a baseUrl that is intentionally ignored here.

### WR-04: Agent-loop catch-block treats `host_unreachable` / `fetch_error` / `adapter_error` errors WITHOUT `.status` as transient network errors -- second-iteration terminal classification is unreachable for these bridge codes

**File:** `extension/ai/agent-loop.js:2457-2536`
**Issue:** The Phase 6 bridge sets `err.code` (string) but NOT `err.status`
(number). The catch block at line 2457 branches on `err.status === 401|403|400|429`
to choose terminal vs. retry-once vs. wait-and-retry. Because the bridge never
populates `err.status`, every bridge error falls through to the
"Network error / timeout: retry once after 2s" branch at line 2528.

This is mostly desirable for `host_unreachable` (offscreen evict + recover) and
`aborted` (caller already canceled, retry is silent waste) but is INCORRECT for
the case where the underlying provider returned 401/403/400 and the offscreen
handler wrapped it as `kind: 'fetch_error'` with a message like
`'xai provider failed with 401: ...'`. The user sees:

1. First iteration: silent 2s retry.
2. Second iteration: terminal `'API call failed: xai provider failed with 401: ...'`.

vs. the desired pre-Phase-6 UX where the 401 was caught immediately and the user
got `'API key invalid or expired'` after iteration 1.

**Fix:** In `extension/offscreen/lattice-host.js` lines 491-500 (the catch
block of the autopilot fetch path), surface `err.status` into the error envelope
and have the bridge propagate it onto the thrown error:

In `lattice-host.js`:
```javascript
sendResponse({
  ok: false,
  error: {
    kind: isAbort ? "aborted" : (mode === "autopilot" ? "fetch_error" : "adapter_error"),
    message: String(err && err.message ? err.message : err),
    status: err && err.status ? err.status : undefined,
    providerError: err && err.providerError ? err.providerError : undefined,
  },
});
```

In `lattice-provider-bridge.js`:
```javascript
const errObj = envelope.error || {};
const err = new Error(errObj.message || 'bridge call failed');
err.code = errObj.kind || 'adapter_error';
err.status = errObj.status;          // <-- ADD
err.providerError = errObj.providerError;
throw err;
```

The catch block in agent-loop.js already reads `error.status` -- no change
needed there. Without this fix, every provider-returned 401 silently retries
once before terminating; the closes-as-side-effect P1 (missing trim) is
correctly addressed but users hitting any other auth failure get a worse error
surface than pre-Phase-6.

## Info

### IN-01: `_trim` helper is module-private but `computeUrl` / `computeHeaders` re-trim apiKey twice in the autopilot path (once at compute, once when constructing factory args)

**File:** `extension/offscreen/lattice-host.js:466-467,471-472`
**Issue:** The autopilot branch instantiates the factory with `_trim(config.apiKey)`
(line 467), but immediately calls `computeUrl` / `computeHeaders` which also
`_trim` the same `config.apiKey` internally. The factory's result is never used
in the autopilot path (the comment says "INV-03 holds at the dispatch level")
so the trim there is also dead work. Not incorrect, just redundant. Consider
documenting that the factory call is purely for INV-03 dispatch and the
work-product is discarded.

**Fix:** Either remove the factory call in autopilot mode (and update INV-03
comment to say "factory IMPORT honored at module load") OR keep it and add a
single-line comment: `factory({...}); // discarded; instantiated only to honor INV-03 dispatch`.

### IN-02: `var` in modern code -- `agent-loop.js:1049-1050` uses `var _cfg` / `var _settings` for new code while the surrounding file uses `let`/`const`

**File:** `extension/ai/agent-loop.js:1049-1050`
**Issue:** Surrounding code uses `const` / `let` (e.g. lines 958, 960, 987).
The Phase 6 insertion uses `var _cfg` and `var _settings`. Probably copied from
an older idiom; `var` hoists into the enclosing function scope which is fine
here, but the underscore prefix + `var` looks like a private hack rather than
a deliberate scoping choice.

**Fix:** Change to `const _cfg = ...; const _settings = ...;`. Pure style.

### IN-03: Magic string fallback `'http://localhost:1234'` duplicated between options.js / agent-loop.js / lattice-host.js without a shared constant

**File:** `extension/ai/agent-loop.js:1055`, `extension/ui/options.js:988,1121`, `extension/offscreen/lattice-host.js:188`
**Issue:** Four call sites all hardcode `'http://localhost:1234'` (or the `/v1`
variant) as the LM Studio default. A future LM Studio port change would
require touching four files; easy to miss one and ship an inconsistent
default. This pre-dates Phase 6 (universal-provider.js has the same constant),
but Phase 6 adds two more occurrences without consolidating.

**Fix:** Defer to a follow-on phase; tag with a TODO referencing the
consolidation. No immediate action needed because the smoke covers each call
site independently.

### IN-04: `chrome.runtime.sendMessage` from offscreen back to SW (line 314, 325) drops errors silently with `.catch((err) => console.warn(...))` -- if the SW is in the process of being evicted, the receipt is lost without a retry queue

**File:** `extension/offscreen/lattice-host.js:321,332`
**Issue:** Pre-existing Phase 5 behavior, not a Phase 6 regression. The
RESEARCH Section 8 Pitfall 1 mention applies; this is documented as an
accepted tradeoff. Flagging only because Phase 6 is the first reviewer
opportunity to surface it.

**Fix:** None for Phase 6. Phase 7's archival of universal-provider may be a
good time to add a small in-memory retry queue, but not in scope here.

### IN-05: Smoke test's `loadOffscreenHandlerSource` uses `_offscreenModulePromise` module-level cache -- if a future Part 7 needs a fresh load of the offscreen module, the cache silently returns the cross-mock module

**File:** `tests/lattice-provider-bridge-smoke.test.js:196,238-241`
**Issue:** The dynamic import is cached at module scope. The comment at line
192-196 acknowledges this. Today all Parts 1-4 share the same chrome mock
(`part1Chrome`), and Part 3's host_unreachable cases temporarily swap
`globalThis.chrome` to `noListenerChrome` / `undefinedChrome` / `part1Chrome`,
but they ONLY exercise `bridgeMod.executeViaBridge` -- not the captured
`handler`. So today's test is correct. Forward risk: anyone adding a new Part
that calls the offscreen module against a fresh mock will get listeners
attached to the OLD `part1Chrome` mock, not their new one. Add a comment
explicitly forbidding re-load, or document the workaround
(`delete require.cache[require.resolve(...)]` for CJS, no equivalent for ESM
dynamic import).

**Fix:** Add comment block above `_offscreenModulePromise` saying
"DO NOT re-load against a different mock; the module's IIFE has already run
against `part1Chrome`. Add helpers that re-register on the existing mock
instead."

### IN-06: `lattice-host.js:483-486` constructs an error with `.providerError = text` where `text` may be the entire HTTP body -- could include masked API key echoes (xAI `'xa***cy'` style); the bridge then forwards it to the agent-loop catch which logs it via `automationLogger.error`

**File:** `extension/offscreen/lattice-host.js:482-486`, `extension/ai/agent-loop.js:1703-1710`
**Issue:** Providers commonly echo the failing API key in a masked form
(`'xa***cy'`, `'sk-...AbCd'`). These are NOT secrets in themselves -- they're
already masked at the source -- but the `automationLogger.error` payload
includes the full `apiErr.message` truncated to 300 chars. If a provider
returns an UNMASKED key in an error body (rare, but happened historically with
some Custom OpenAI-Compatible deployments that echo `Authorization: Bearer
<key>` in their 401 body), Phase 6's path now logs it.

The CONTEXT.md SECURITY note in `lattice-provider-bridge.js:33-35` says "the
full key is never surfaced in logs" -- this is true for the bridge itself but
not for the downstream agent-loop catch handler that consumes the bridge's
errors. The risk is low (already a known issue pre-Phase 6 for any path that
logged universal-provider errors) and out of scope for v1 review (it is a
defense-in-depth gap, not a vulnerability), but worth a follow-on phase.

**Fix:** Defer. If addressed: add a redaction pass in `automationLogger.error`
that strips long base64-like tokens, OR have the offscreen handler strip
provider-error bodies to a regex-stripped subset before sending the envelope.

---

_Reviewed: 2026-05-27T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
