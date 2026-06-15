---
phase: 04-provider-adapter-alignment
reviewed: 2026-05-24T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - tests/lattice-providers-smoke.test.js
  - lattice/packages/lattice/src/providers/anthropic.ts
  - lattice/packages/lattice/src/providers/gemini.ts
  - lattice/packages/lattice/src/providers/xai.ts
  - lattice/packages/lattice/src/providers/openrouter.ts
  - lattice/packages/lattice/src/providers/lm-studio.ts
  - lattice/packages/lattice/src/providers/parity.test.ts
  - lattice/packages/lattice/src/index.ts
  - .planning/LATTICE-PIN.md
  - package.json
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-05-24
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found (1 Warning, 3 Info -- all minor; phase ships in good shape)

## Summary

Phase 4 lands the 5 net-new provider adapters (Anthropic + Gemini full-custom; xAI + OpenRouter + LM Studio thin-wrapper), the Lattice-side INV-03 parity smoke covering all 7 logical providers, the FSB-side surface-presence smoke, the public-surface re-exports, and the LATTICE-PIN row. Phase 4's hard requirements all check out:

- **No emojis** anywhere across the 10 reviewed files (greppable confirmation).
- **No hardcoded API keys.** All `apiKey` values are runtime parameters per the per-adapter SECURITY JSDoc. Stub values in the two smoke files (`sk-ant-fsb-smoke`, `AIza-fsb-smoke`, `xai-fsb-smoke`, etc.) are clearly test fixtures, not real credentials.
- **AbortSignal wired correctly** in each adapter via the `...(request.signal !== undefined ? { signal: request.signal } : {})` spread that mirrors `adapters.ts:108`. Anthropic line 80, Gemini line 92, and xAI/OpenRouter/LM-Studio inherit through `createOpenAICompatibleProvider`. `parity.test.ts:Test 5` verifies signal propagation across all 7 providers.
- **xAI reasoning_tokens preserved.** `xai.ts:60-71` recomputes `totalTokens = inputTokens + outputTokens + reasoning_tokens` exactly per D-07 + universal-provider.js:593.
- **Anthropic top-level `system` field** lives at the body root, NOT folded into messages (`anthropic.ts:71`). Matches D-07.
- **Gemini `role: "model"` preserved.** No translation to `"assistant"` happens; the adapter only sends a `role: "user"` user message, and the response parser reads `candidates[0].content.parts[0].text` without inspecting role (so the model's `role: "model"` round-trips through `rawResponse`). The Gemini fake body in both smokes (parity.test.ts line 70, lattice-providers-smoke.test.js line 72) explicitly uses `role: 'model'`.
- **LM Studio no-auth default.** `LmStudioProviderOptions` omits `apiKey` from the base `Omit<...>` and re-adds it as `apiKey?` (optional). `createOpenAICompatibleProvider` at `adapters.ts:53` writes `authorization: Bearer` only when `apiKey !== undefined` -- so omitting `apiKey` yields no Authorization header. The FSB smoke at line 188-198 exercises the no-apiKey path explicitly.
- **INV-04 not touched.** No `extension/ai/agent-loop.js` modification in scope.
- **INV-01 not touched.** No `mcp/*` or tool-definitions modification in scope.
- **Phase 1+2+3 smokes byte-frozen.** `lattice-smoke.test.js`, `lattice-tripwire-smoke.test.js`, `lattice-checkpoint-smoke.test.js` last touched on Phase 1/2/3 commits (`1545c14c` / `7c26685c` / `bbb8d573`); Phase 4 commits do not modify them. The new smoke (`lattice-providers-smoke.test.js`) is appended to `package.json` `scripts.test` immediately after `lattice-checkpoint-smoke.test.js` per D-14.

The 4 findings below are minor TS hygiene / a small edge case in the xAI usage-quirk handler. None block the phase; the Warning is a "Phase 7 vs legacy usage shape" gap worth documenting (not necessarily fixing in Phase 4).

## Warnings

### WR-01: xAI reasoning_tokens silently dropped when legacy `usage` record is undefined

**File:** `lattice/packages/lattice/src/providers/xai.ts:60-72`
**Issue:** The reasoning-tokens augmentation only fires when `response.usage !== undefined`. `response.usage` is the legacy `UsageRecord` produced by `adapters.ts:normalizeUsage(...)`, which returns `undefined` whenever `body.usage` is not an object. If a real xAI response ships `completion_tokens_details.reasoning_tokens` but the outer `usage` envelope is malformed or absent (network-edge / mock variants / partial response), reasoning_tokens are silently dropped on the floor with no fallback path. The `normalizedUsage` (Phase 7 `Usage` shape) is also left untouched even in the success path -- per the inline comment that's an intentional Phase 7 design call ("normalized usage represents billable tokens; reasoning_tokens is xAI-extra-counts that consumers access via rawResponse for now") -- but consumers who only inspect `normalizedUsage` (i.e. the canonical post-Phase-7 shape) cannot see reasoning_tokens at all. The `rawResponse` does carry them, so this is more of a "documentation/escape-hatch sufficiency" concern than a bug.

**Fix:** Two acceptable resolutions; either is fine:

(a) Document explicitly in the JSDoc + a NOTE comment that reasoning_tokens are only surfaced via legacy `UsageRecord.totalTokens` AND `rawResponse.usage.completion_tokens_details.reasoning_tokens` -- and that the Phase 7 normalized `Usage` shape intentionally does NOT include them. This is the minimal-change path consistent with the Phase 4 carryforward note on line 47-51.

(b) Synthesize a minimal `usage` envelope from reasoning_tokens when the upstream `body.usage` is malformed. For example:

```typescript
const reasoningTokens = raw?.usage?.completion_tokens_details?.reasoning_tokens;
if (typeof reasoningTokens === "number") {
  if (response.usage !== undefined) {
    const inputTokens = response.usage.inputTokens ?? 0;
    const outputTokens = response.usage.outputTokens ?? 0;
    return {
      ...response,
      usage: { ...response.usage, totalTokens: inputTokens + outputTokens + reasoningTokens },
    };
  }
  // NEW: surface reasoning_tokens even when legacy usage is missing.
  return {
    ...response,
    usage: { totalTokens: reasoningTokens },
  };
}
return response;
```

The phase-cohesion call leans toward (a) for Phase 4 (no new behavior; document the intent); follow-on Phase 7-aware work can revisit (b) if downstream consumers ever depend on reasoning_tokens through `normalizedUsage`.

## Info

### IN-01: Unused `ProviderRunResponse` import in Anthropic + Gemini adapters

**File:** `lattice/packages/lattice/src/providers/anthropic.ts:2`, `lattice/packages/lattice/src/providers/gemini.ts:2`
**Issue:** Both adapter files import the `ProviderRunResponse` type but never reference it -- the `execute` return type is inferred from the closure literal, and the helper functions return `Usage` / `UsageRecord | undefined`. TS will allow this (verbatim-module-syntax tolerated for type-only imports), but it's dead import noise that a future grep for "where do we use ProviderRunResponse?" will get confused by.

**Fix:** Drop `ProviderRunResponse` from both import lists:

```typescript
// anthropic.ts:2 + gemini.ts:2
import type { ProviderAdapter, Usage } from "./provider.js";
```

### IN-02: Anthropic adapter unconditionally sends `system: ""`

**File:** `lattice/packages/lattice/src/providers/anthropic.ts:71`
**Issue:** The request body always carries `system: ""` (literal empty string). The Anthropic Messages API accepts this and an empty string behaves equivalently to "no system prompt set," so it's functionally correct AND exactly matches FSB's `extension/ai/universal-provider.js:285` production behavior when no system message exists. The Phase 4 design (D-07 + the inline comment on lines 69-70) explicitly mirrors that production shape. So the `""` literal is on-spec for Phase 4. The only downside is that `ProviderRunRequest` exposes no `system` field, so the adapter has no path to supply a non-empty system prompt today -- which is fine for Phase 4 ("single-shot Promise per D-06; system prompts not part of the contract yet") but worth flagging as a known follow-on for whichever phase rewires FSB autopilot through Lattice.

**Fix:** No change required for Phase 4. Optionally add a one-line carryforward comment:

```typescript
// D-07: top-level `system` field PRESERVED (Anthropic Messages API
// contract; NOT folded into `messages`). NOTE: empty-string literal
// matches FSB universal-provider.js:285 when no system message exists.
// Carryforward: a future phase that extends ProviderRunRequest with a
// system-prompt field will wire it here.
system: "",
```

### IN-03: Gemini `apiKey` lands in the URL query string (logging surface)

**File:** `lattice/packages/lattice/src/providers/gemini.ts:95`
**Issue:** Google's Generative Language API authenticates via `?key=<apiKey>` in the URL, so the adapter `encodeURIComponent`s the key and appends it. URL strings tend to land in access logs, proxies, and `Error.stack`-style runtime errors more easily than headers -- so any consumer who logs `error.url` or wraps `fetchImpl` could surface a real key. The current adapter doesn't log the URL itself, and the JSDoc SECURITY warning is present (line 16), so this is on the consumer to handle. Flagging for awareness only; this is intrinsic to Google's API contract, not a Phase 4 design defect.

**Fix:** No code change required. The SECURITY warning at `gemini.ts:16` already covers this. If a future phase adds a tracing/logging hook around `fetchImpl`, that hook MUST redact the `?key=` query parameter (recommend pattern: `url.replace(/([?&]key=)[^&]+/i, "$1<redacted>")`).

---

_Reviewed: 2026-05-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
