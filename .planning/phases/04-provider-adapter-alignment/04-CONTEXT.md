# Phase 4: Provider adapter alignment - Context

**Milestone:** v0.10.0 Autopilot via Lattice SDK (attempt 2)
**Gathered:** 2026-05-24 (assumptions mode -- autonomous)
**Status:** Ready for planning

<domain>
## Phase Boundary

**This phase ships 5 net-new native provider adapters on Lattice's `fsb-integration-experiments` branch + one INV-03 parity smoke + one thin FSB-side surface-presence smoke:**

1. **Anthropic adapter** (`lattice/packages/lattice/src/providers/anthropic.ts`) -- FULL custom adapter (Anthropic Messages API has top-level `system` field and `content[0].text` response shape, not OpenAI-compatible).
2. **Gemini adapter** (`lattice/packages/lattice/src/providers/gemini.ts`) -- FULL custom adapter (`v1beta/models/{model}:generateContent` with `contents[].parts[].text` and `safetySettings` block).
3. **xAI adapter** (`lattice/packages/lattice/src/providers/xai.ts`) -- THIN WRAPPER around `createOpenAICompatibleProvider` with `baseUrl: "https://api.x.ai/v1"`; preserves xAI's `completion_tokens_details.reasoning_tokens` quirk in usage extraction.
4. **OpenRouter adapter** (`lattice/packages/lattice/src/providers/openrouter.ts`) -- THIN WRAPPER around `createOpenAICompatibleProvider` with `baseUrl: "https://openrouter.ai/api/v1"`. JSDoc explicitly notes that model-routing / fallback-array features are deferred.
5. **LM Studio adapter** (`lattice/packages/lattice/src/providers/lm-studio.ts`) -- THIN WRAPPER around `createOpenAICompatibleProvider` with user-supplied `baseUrl` defaulting to `http://localhost:1234/v1`; `noAuth: true` default.

Plus:
- 5 companion vitest test files (one per adapter; ~7 cases each using existing `makeFakeFetch` pattern from `adapters.test.ts`).
- 1 Lattice-side parity smoke `lattice/packages/lattice/src/providers/parity.test.ts` exercising all 7 logical providers (OpenAI, OpenAI-compat, Anthropic, Gemini, xAI, OpenRouter, LM Studio) end-to-end against fake fetch.
- 1 FSB-side thin surface-presence smoke `tests/lattice-providers-smoke.test.js` asserting all 7 factories are reachable via `await import('lattice')` and produce ProviderAdapter shapes -- ceremony parity with Phases 1-3 (one new FSB smoke per phase).

**Explicitly NOT in this phase** (deferred):
- FSB `extension/ai/universal-provider.js` modification. Option B reconciliation continues to hold. FSB autopilot still routes through `universal-provider.js`; Lattice adapters are validated standalone.
- Live API calls. Test strategy is fake HTTP via `makeFakeFetch` injection (no env vars, no network, no per-CI keys).
- Streaming per provider (deferred to a follow-on phase).
- Provider-specific extensions beyond parity: Anthropic prompt caching, Gemini multimodal, xAI tool-streaming, OpenRouter model-routing array. All deferred.
- MV3-survivability adapter contract (Phase 5).
- Delegation primitive (Phase 6).
- Mainline PR back into Lattice (v0.11.0+).
- ANY `extension/*` modifications.

**The scope anchor:** Phase 4 ships 5 single-shot Promise-based adapters with the exact same `ProviderAdapter.execute(request)` contract as the existing `createOpenAIProvider`. If a task starts demanding streaming, eviction-resume, or prompt-caching extensions, that's scope creep into a later phase.

</domain>

<decisions>
## Implementation Decisions

### Adapter Implementation Strategy

- **D-01 Five new adapter files under `lattice/packages/lattice/src/providers/`.** Sibling-file-per-provider pattern matches Phase 2/3 module hygiene (bands.ts next to tripwire.ts; checkpoint.ts next to bands.ts).

- **D-02 Anthropic + Gemini are FULL custom adapters.** Anthropic uses `/v1/messages` with top-level `system` field and `content[0].text` response. Gemini uses `/v1beta/models/{model}:generateContent` with `contents[].parts[].text`, `role: "model"` for assistant turns, `safetySettings` block (4 categories at `BLOCK_NONE`). Both diverge fundamentally from OpenAI shape; can't reuse `createOpenAICompatibleProvider`.

- **D-03 xAI + OpenRouter + LM Studio are THIN WRAPPERS around `createOpenAICompatibleProvider`.** Hard-coded base URLs (xAI `https://api.x.ai/v1`, OpenRouter `https://openrouter.ai/api/v1`, LM Studio defaulting to `http://localhost:1234/v1`); provider IDs set explicitly. The xAI thin wrapper INJECTS a custom usage extractor that handles `completion_tokens_details.reasoning_tokens` (xAI-specific quirk). OpenRouter + LM Studio reuse the OpenAI-compat usage extractor verbatim. JSDoc on `createOpenRouterProvider` explicitly notes deferred features (model routing array).

- **D-04 Factory signature mirrors `createOpenAIProvider` at `adapters.ts:200-206`.** Each factory accepts `{baseUrl?, apiKey, fetch?, pricing?}` (subset, with provider-specific quirks documented), returns `ProviderAdapter`. Each factory is a one-line wrapper for the 3 thin-wrapper providers (calls `createOpenAICompatibleProvider` with provider-specific defaults); a ~60-100 line full implementation for Anthropic + Gemini.

- **D-05 AbortSignal support wired via `request.signal` exactly as `createOpenAICompatibleProvider`** at `adapters.ts:108`: `...(request.signal !== undefined ? { signal: request.signal } : {})`. No more, no less. JSDoc on each new adapter points to "Phase 5 for resume-from-eviction" as a deferred concern.

- **D-06 Streaming explicitly deferred.** Each adapter's `execute()` is single-shot Promise -- no streaming response handling. If FSB's autopilot ever needs streaming, that's a separate phase.

- **D-07 Provider-specific quirks PRESERVED in adapters, not abstracted.** xAI's `completion_tokens_details.reasoning_tokens` flow: the xAI adapter custom-handles this in usage extraction (FSB at `extension/ai/universal-provider.js:585-594` does the same). Anthropic's `system` field stays top-level (NOT folded into `messages`). Gemini's `role: "model"` stays as-is (NOT translated to `"assistant"`).

### Test Strategy

- **D-08 Each new adapter ships a companion `.test.ts` file.** Naming convention: `anthropic.test.ts`, `gemini.test.ts`, `xai.test.ts`, `openrouter.test.ts`, `lm-studio.test.ts`. Each ~150-200 lines covering ~7 vitest cases.

- **D-09 Per-adapter test coverage (7 cases minimum):**
  1. Factory identity: returned adapter has `kind: "provider-adapter"`, expected `id`, expected `capabilities`.
  2. Request shape: POST body matches provider's expected schema (Anthropic has top-level `system`; Gemini has `contents[]`; OpenAI-compat has `messages[]`).
  3. Response parsing: extracts text content from provider's quirky shape (Anthropic `content[0].text`; Gemini `candidates[0].content.parts[0].text`; OpenAI `choices[0].message.content`).
  4. Usage extraction: normalizes to `Usage.promptTokens` / `completionTokens` / `costUsd` per `provider.ts:51-55`. xAI adapter SPECIFICALLY tests the `reasoning_tokens` extra-counts flow.
  5. Error handling: non-OK fetch status throws with provider ID in error message (mirrors `adapters.ts:112-114`).
  6. Pricing applied: when `pricing` option supplied, `costUsd` computed; when absent, `costUsd === null`.
  7. AbortSignal wiring: when `request.signal` provided, propagates to the fetch call.

- **D-10 No `createFakeProvider` in per-adapter tests.** Use the existing `makeFakeFetch` helper from `adapters.test.ts:10-16` (constructs a fetch-shaped function returning stub `Response`). `createFakeProvider` involvement happens at the INV-03 parity smoke level only.

- **D-11 No live API calls in any Phase 4 test.** Matches user pre-confirmation. Avoids env-var dependencies, network non-determinism, and cost leakage.

### INV-03 Parity Smoke

- **D-12 ONE Lattice-side parity smoke: `lattice/packages/lattice/src/providers/parity.test.ts`.** Iterates over a `[provider-id, factory, sampleResponse]` table covering all 7 logical providers. For each: asserts adapter shape, request execution returns ProviderRunResponse with rawOutputs populated, normalizedUsage has expected shape, 500-status throws with provider name. Net-new vitest cases: ~7 (one per provider).

- **D-13 ONE FSB-side surface-presence smoke: `tests/lattice-providers-smoke.test.js`.** Mirrors Phase 1/2/3 smoke ceremony. Dynamic `await import('lattice')`; asserts each new factory is a function (`createAnthropicProvider`, `createGeminiProvider`, `createXaiProvider`, `createOpenRouterProvider`, `createLmStudioProvider`); calls each with stub options and asserts returned adapter has expected `kind` / `id` fields. NO live API calls -- the FSB-side smoke proves the SURFACE is reachable, not provider runtime correctness (that's the Lattice-side parity test). ~10 PASS assertions.

- **D-14 Appended to `package.json` `scripts.test` chain** immediately after `tests/lattice-checkpoint-smoke.test.js` (Phase 3 entry). Phase 1+2+3 smokes BYTE-FROZEN.

### Audit-Doc Row Mapping

- **D-15 Phase 4 flips 5 Providers rows to `Covered` in `lattice/docs/fsb-integration-gaps.md`:**
  - Anthropic adapter (currently Blocker)
  - Gemini adapter (currently Blocker)
  - xAI adapter (currently Blocker)
  - LM Studio adapter (currently Important)
  - OpenRouter adapter (currently Important)
  - Each gets backlink SHAs from the corresponding feat commit(s) in the Notes column.

- **D-16 LM Studio's "latency-tail recognition" sub-clause explicitly deferred.** Phase 4 ships the named LM Studio adapter (parity); latency-tail diagnostics is an observability concern, deferred to a future phase. The audit-doc row's note explicitly states this carryforward.

- **D-17 OpenRouter's "model routing" sub-clause explicitly deferred.** Phase 4 ships the named OpenRouter adapter as a first-class wrapper; model-routing array / fallback features deferred. The adapter's JSDoc + audit-doc row note documents the carryforward.

### Ceremony (Phase 2/3 carryforward)

- **D-18 Lattice commit ceremony continues.** Conventional commits + body footer `Ref: FSB v0.10.0-attempt-2 Phase 4`. Suggested commit grouping (planner refines):
  - `feat(providers): add Anthropic provider adapter`
  - `feat(providers): add Gemini provider adapter`
  - `feat(providers): add xAI provider adapter`
  - `feat(providers): add OpenRouter provider adapter`
  - `feat(providers): add LM Studio provider adapter`
  - `test(providers): add INV-03 parity smoke covering 7 logical providers`
  - `feat(api): re-export 5 new provider factories from public surface`
  - `docs(fsb-integration): close Phase 4 audit rows (providers)`
  - ~8 Lattice commits.

- **D-19 D-15/D-17 carryforward: NO `git push` to Lattice's remote.**

- **D-20 LATTICE-PIN.md bumped ONCE at phase end.** Phase 4 row references all Phase 4 Lattice commits.

- **D-21 REQ-ID population: LSDK-14..LSDK-18 at audit-doc row granularity** (one REQ per provider; 5 IDs total). The INV-03 parity smoke serves as the cross-cutting verification proof. Planner picks final count + numbering.

### Claude's Discretion

- **CD-01 Whether xAI/OpenRouter/LM-Studio's thin-wrapper factories accept a `usage` extractor override option** (e.g., to externalize xAI's reasoning-tokens handling). Default: keep the xAI extractor in `xai.ts` as a private helper; expose no override option in Phase 4. Planner may revise if test ergonomics demand.
- **CD-02 Whether to add a Lattice-side test file for `provider-id` consistency** (e.g., that no two adapters claim the same `id`). Default: cover by the parity smoke's iteration table. Planner may add a separate test if cleaner.
- **CD-03 Whether `createLmStudioProvider` allows a `noAuth` opt-out** (in case some user runs LM Studio with auth proxy). Default: NO opt-out -- LM Studio is no-auth by convention. Planner may revise if research surfaces deployment variants needing auth.
- **CD-04 Whether each per-adapter `.test.ts` file is co-located with the adapter** (e.g., `anthropic.test.ts` next to `anthropic.ts`) **or aggregated into one file**. Default: co-located (mirrors `adapters.ts` + `adapters.test.ts` precedent). One file is acceptable if planner prefers tighter isolation.
- **CD-05 Whether to validate API spec drift via WebSearch during plan-phase research.** Default: trust FSB's `extension/ai/universal-provider.js` shape as the authoritative reference (FSB has been running these providers in production). External research items flagged by the analyzer (Anthropic version header, Gemini BLOCK_NONE thresholds, xAI reasoning_tokens, LM Studio compat, OpenRouter routing) are noted in the planner researcher's prompt as confirm-or-fix items if research-time gates require.

</decisions>

<canonical_refs>
## Canonical References

### FSB-side milestone scope
- `.planning/ROADMAP.md` -- Phase 4 detail
- `.planning/REQUIREMENTS.md` -- LSDK category; Phase 4 populates LSDK-14..N
- `.planning/PROJECT.md` -- Current Milestone block + INV-03 (provider parity is the hard gate)
- `.planning/STATE.md`
- `.planning/LATTICE-PIN.md` -- Lattice HEAD `7afd62fc` pre-Phase-4

### Phase 1-3 outputs (BINDING)
- `.planning/phases/01-lattice-gap-survey-scaffold/01-CONTEXT.md` -- D-14/D-15/INV-06/Option-B carryforward
- `.planning/phases/02-lattice-tripwire-receipt-extension/02-CONTEXT.md` -- D-12 vocabulary separation
- `.planning/phases/03-observability-step-markers-extension/03-CONTEXT.md` -- D-04 sibling-module pattern
- `.planning/phases/03-observability-step-markers-extension/03-VERIFICATION.md` -- Phase 3 baseline

### Phase 1 audit doc (rows being closed)
- `lattice/docs/fsb-integration-gaps.md` -- Providers domain rows (lines 43-51 per inventory)

### Lattice surfaces being extended
- `lattice/AGENTS.md`
- `lattice/packages/lattice/src/providers/provider.ts` -- `ProviderAdapter` interface (Phase 4's 5 adapters implement this)
- `lattice/packages/lattice/src/providers/adapters.ts` -- `createOpenAIProvider` + `createOpenAICompatibleProvider` + helpers (`normalizeUsage`, `normalizeUsageToRunUsage`, `numberField`) -- Phase 4 thin wrappers reuse `createOpenAICompatibleProvider`; Anthropic + Gemini may import helpers
- `lattice/packages/lattice/src/providers/adapters.test.ts` -- `makeFakeFetch` helper (Phase 4 tests reuse)
- `lattice/packages/lattice/src/providers/fake.ts` -- `createFakeProvider` (NOT reused in per-adapter tests; only parity smoke contextually)
- `lattice/packages/lattice/src/providers/packaging.ts`
- `lattice/packages/lattice/src/index.ts` -- Phase 4 adds 5 re-exports
- `lattice/packages/lattice/test/public-surface.test.ts` -- Phase 4 may add factory presence assertions

### FSB-side reference for provider shapes (DO NOT MODIFY)
- `extension/ai/universal-provider.js` -- Current 7-provider implementation; authoritative source for request/response shapes Phase 4 mirrors:
  - Anthropic at lines 280-297, 566-573
  - Gemini at lines 210-274
  - xAI at lines 585-594
  - LM Studio at lines 40-45, 716-721
  - OpenRouter at PROVIDER_CONFIGS

### Hard invariants (every Phase 4 task gates against these)
- INV-01 MCP wire UNTOUCHED (`node tests/tool-definitions-parity.test.js` 142/142 PASS)
- INV-03 Provider parity across all 7 providers (Phase 4's substantive deliverable; INV-03 was previously "no improvement that regresses any single provider"; Phase 4 SHIPS the 5 missing providers + proves parity via the Lattice-side smoke)
- INV-04 setTimeout iterator preserved (`grep -c "setTimeout" extension/ai/agent-loop.js` returns 8)
- INV-06 Lattice primitives in Lattice (Phase 4 ships adapters in Lattice; FSB consumes via existing bare-specifier import; no FSB-side adapter implementations)
- Phase 1+2+3 byte-frozen baseline: existing tests/lattice-smoke.test.js (29 PASS) + lattice-tripwire-smoke.test.js (39 PASS) + lattice-checkpoint-smoke.test.js (72 PASS) all unchanged
- Phase 1+2+3 Lattice files byte-frozen except `src/index.ts` (re-export additions only) + `lattice/docs/fsb-integration-gaps.md` (Providers row flips). All Phase 1+2+3 source files in receipts/, contract/, tracing/ UNCHANGED.
- Phase 1 Option B reconciliation: NO `extension/*` modifications

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`createOpenAICompatibleProvider`** at `lattice/packages/lattice/src/providers/adapters.ts:9-131` -- xAI/OpenRouter/LM-Studio thin wrappers compose with this.
- **`makeFakeFetch` helper** at `lattice/packages/lattice/src/providers/adapters.test.ts:10-16` -- all 5 per-adapter test files reuse this pattern.
- **`createFakeProvider`** at `lattice/packages/lattice/src/providers/fake.ts` -- the parity smoke at `parity.test.ts` may reference for composite scenarios.
- **`normalizeUsage` + `normalizeUsageToRunUsage` + `numberField`** at `adapters.ts:21-46` -- Phase 4 adapters reuse for usage extraction normalization.
- **`ProviderAdapter` interface** at `provider.ts:118-123` -- contract Phase 4 implements.
- **`ProviderRunRequest.signal`** at `provider.ts:91` -- AbortSignal wiring point (Phase 4 mirrors `adapters.ts:108`).

### Established Patterns
- **One commit per logical surface (D-18 + D-14 from Phases 1-3).**
- **NO `git push` on Lattice (D-19 + D-15 from Phase 1).**
- **Sibling-module separation.** Each provider gets its own file.
- **Best-effort error handling.** Provider adapters throw on bad HTTP status (matches `adapters.ts:112-114`).
- **AbortSignal threaded via spread.** Mirrors `adapters.ts:108`.

### Integration Points
- **`lattice/packages/lattice/src/providers/anthropic.ts`** -- NEW (full custom)
- **`lattice/packages/lattice/src/providers/gemini.ts`** -- NEW (full custom)
- **`lattice/packages/lattice/src/providers/xai.ts`** -- NEW (thin wrapper + usage quirk)
- **`lattice/packages/lattice/src/providers/openrouter.ts`** -- NEW (thin wrapper)
- **`lattice/packages/lattice/src/providers/lm-studio.ts`** -- NEW (thin wrapper)
- **`lattice/packages/lattice/src/providers/{anthropic,gemini,xai,openrouter,lm-studio}.test.ts`** -- 5 NEW per-adapter tests (~7 cases each)
- **`lattice/packages/lattice/src/providers/parity.test.ts`** -- NEW (INV-03 parity smoke; 7-provider iteration)
- **`lattice/packages/lattice/src/index.ts`** -- modified (5 new re-exports)
- **`lattice/packages/lattice/dist/`** -- rebuilt
- **`lattice/docs/fsb-integration-gaps.md`** -- 5 row flips
- **`tests/lattice-providers-smoke.test.js`** -- NEW (FSB-side thin surface-presence smoke)
- **`package.json`** -- modified (scripts.test chain extended)
- **`.planning/LATTICE-PIN.md`** -- frontmatter SHA bump + Phase 4 row
- **`.planning/REQUIREMENTS.md`** -- LSDK-14..18 entries + traceability rows

</code_context>

<specifics>
## Specific Ideas

- **Anthropic + Gemini are FULL custom adapters** (their wire shapes diverge); xAI/OpenRouter/LM-Studio are THIN WRAPPERS around `createOpenAICompatibleProvider`. This split is empirically derivable from FSB's `PROVIDER_CONFIGS` -- the 2 with `customFormat: true` are the 2 full customs.
- **FSB `universal-provider.js` is the authoritative source for current API shapes.** FSB has been running these providers in production -- if shapes drift, FSB notices first.
- **xAI reasoning_tokens** is a real quirk (`extension/ai/universal-provider.js:585-594`); Phase 4 PRESERVES it in xAI's usage extractor.
- **Gemini's BLOCK_NONE safety thresholds** are FSB's current convention. Phase 4 mirrors this default; if Google restricts BLOCK_NONE in the future, that's a re-spec concern, not a Phase 4 design defect.
- **LM Studio defaults to localhost** (`http://localhost:1234/v1`); Phase 4 accepts a `baseUrl` override for non-localhost deployments.
- **The Lattice-side parity smoke is the INV-03 proof.** FSB-side smoke is ceremony parity (Phases 1-3 each shipped one).
- **Phase 4 introduces ~10-13 new test files in Lattice** (5 per-adapter + 1 parity smoke + adapters.test.ts may need additions for cross-cutting cases). Lattice vitest count expected: 347 + ~50 new cases = ~397 PASS.

</specifics>

<deferred>
## Deferred Ideas

These came up during scoping but belong outside Phase 4:

- **Anthropic prompt caching** -- deferred to follow-on phase.
- **Anthropic streaming** -- deferred.
- **Gemini multimodal (vision)** -- deferred.
- **Gemini streaming** -- deferred.
- **xAI tool-streaming** -- deferred.
- **OpenRouter model routing array / fallback** -- deferred.
- **LM Studio latency-tail diagnostics** -- observability concern; deferred (referenced in audit-doc row note).
- **FSB `universal-provider.js` rewiring to delegate to Lattice adapters** -- separate later phase (after Phase 5 MV3-survivability adapter contract).
- **Live API integration tests** -- separate CI-keyed phase if ever needed.
- **MV3-survivability adapter contract** -- Phase 5.
- **Delegation primitive** -- Phase 6.
- **Mainline PR back into Lattice** -- v0.11.0+.

</deferred>

---

*Phase: 04-provider-adapter-alignment*
*Context gathered: 2026-05-24 via assumptions mode (autonomous; UAT deferred per user directive)*
