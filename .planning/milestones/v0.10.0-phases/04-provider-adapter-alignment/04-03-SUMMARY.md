---
phase: 04-provider-adapter-alignment
plan: 03
subsystem: lattice-providers
tags: [xai, openrouter, lm-studio, provider-adapter, lattice, typescript, vitest, fetch, openai-compatible, thin-wrapper, reasoning-tokens, noauth]

# Dependency graph
requires:
  - phase: 01-lattice-gap-survey-scaffold
    provides: "Lattice file: dep + audit doc identifying xAI / OpenRouter / LM Studio as Blocker / Important rows"
  - phase: 02-lattice-tripwire-receipt-extension
    provides: "Lattice Phase 2 createOpenAICompatibleProvider helpers (normalizeUsage/normalizeUsageToRunUsage/numberField) reused by thin wrappers via composition"
  - phase: 04-provider-adapter-alignment
    provides: "Plan 04-01 Anthropic + Plan 04-02 Gemini full-custom adapters at HEAD 7a32b00 (sibling pattern + 366 post-Plan-04-02 baseline extended in this plan)"
provides:
  - "createXaiProvider factory at lattice/packages/lattice/src/providers/xai.ts (thin wrapper preserving reasoning_tokens quirk per D-07)"
  - "createOpenRouterProvider factory at lattice/packages/lattice/src/providers/openrouter.ts (thin wrapper; model-routing array deferred per D-17)"
  - "createLmStudioProvider factory at lattice/packages/lattice/src/providers/lm-studio.ts (thin wrapper; default localhost:1234/v1; noAuth default per CD-03; latency-tail diagnostics deferred per D-16)"
  - "XaiProviderOptions / OpenRouterProviderOptions / LmStudioProviderOptions interfaces (Omit-based composition over OpenAICompatibleProviderOptions)"
  - "24 vitest cases across 3 files (xAI 9 incl. D-07 reasoning_tokens quirk verification; OpenRouter 7; LM Studio 8 incl. CD-03 noAuth verification)"
  - "Three Lattice commits on fsb-integration-experiments: 09a495e (xAI), 1cfc13c (OpenRouter), 40457ff (LM Studio); none pushed per D-19"
affects:
  - "04-04-parity-smoke-and-public-surface (parity.test.ts will iterate the 7-provider table including xai/openrouter/lm-studio)"
  - "04-04 audit-doc row flips (xAI Blocker, OpenRouter Important, LM Studio Important rows -> Covered citing 09a495e/1cfc13c/40457ff)"
  - "04-05-fsb-side-smoke-and-ceremony (tests/lattice-providers-smoke.test.js asserts createXaiProvider/createOpenRouterProvider/createLmStudioProvider reachable + adapter shape)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thin-wrapper provider adapter pattern: factory returns createOpenAICompatibleProvider({...userOptions, id: defaulted, baseUrl: defaulted}) -- composition over inheritance; option-merging uses spread"
    - "TypeScript Omit-based option-type composition: XaiProviderOptions extends Omit<OpenAICompatibleProviderOptions, 'id' | 'baseUrl'> (overriding id/baseUrl with relaxed-optional variants); LmStudioProviderOptions Omits 'apiKey' too and re-declares it as optional (CD-03 no-auth default)"
    - "Post-processing wrap pattern for provider quirks (xAI): unwrap inner.execute, await it, inspect rawResponse for provider-specific extra-counts (reasoning_tokens), augment legacy UsageRecord.totalTokens to match FSB production behavior. Normalized Usage (billable tokens) unchanged by design"
    - "Defensive innerExecute === undefined fallback in xai.ts: if upstream OpenAI-compat factory ever evolves to not provide execute, xai.ts returns the inner adapter unchanged (no double-wrap of undefined)"
    - "OpenAI-compat conditional-header pass-through for noAuth: adapters.ts:53 already spreads {authorization: 'Bearer ...'} ONLY when apiKey defined; LM Studio CD-03 default exploits this via Omit + optional re-declare (no factory code needed)"
    - "FakeFetchCapture pattern from Plans 04-01/04-02 continues: makeFakeFetch returns {fetch, capture}; capture.url + capture.init read-back surface for asserting POST body / URL / signal threading"

key-files:
  created:
    - "lattice/packages/lattice/src/providers/xai.ts (76 lines; XaiProviderOptions + DEFAULT_XAI_BASE_URL + createXaiProvider with post-processing reasoning_tokens augmentation)"
    - "lattice/packages/lattice/src/providers/xai.test.ts (203 lines; 9 vitest cases incl. Test 4b D-07 reasoning_tokens quirk verification)"
    - "lattice/packages/lattice/src/providers/openrouter.ts (41 lines; OpenRouterProviderOptions + DEFAULT_OPENROUTER_BASE_URL + createOpenRouterProvider single-line composition; D-17 deferred note in JSDoc)"
    - "lattice/packages/lattice/src/providers/openrouter.test.ts (155 lines; 7 vitest cases covering D-09 contract)"
    - "lattice/packages/lattice/src/providers/lm-studio.ts (47 lines; LmStudioProviderOptions + DEFAULT_LM_STUDIO_BASE_URL + createLmStudioProvider; D-16 deferred note in JSDoc; CD-03 apiKey re-declared optional)"
    - "lattice/packages/lattice/src/providers/lm-studio.test.ts (181 lines; 8 vitest cases incl. Test 8 CD-03 noAuth verification)"
    - ".planning/phases/04-provider-adapter-alignment/04-03-LATTICE-SHA.txt (3 Lattice commit SHA references)"
  modified: []

key-decisions:
  - "Three Lattice commits (one per adapter) -- mirrors D-18 + Plan 04-01/04-02 single-surface-per-commit cadence; each carries Ref: FSB v0.10.0-attempt-2 Phase 4 footer (D-18)"
  - "xAI quirk preservation via post-processing wrap (CD-01 default RESOLVED: no override option). The thin-wrapper composes createOpenAICompatibleProvider, then wraps its execute() function: inspect rawResponse.usage.completion_tokens_details.reasoning_tokens; if present, recompute legacy UsageRecord.totalTokens = inputTokens + outputTokens + reasoningTokens (matches universal-provider.js:593). Phase 7 normalized Usage (promptTokens/completionTokens/costUsd) deliberately UNCHANGED -- normalized usage represents billable tokens; reasoning_tokens is xAI-extra-counts accessible via response.rawResponse"
  - "LM Studio noAuth default via Omit + re-declare apiKey?: string (CD-03 RESOLVED: no opt-out flag). Underlying adapters.ts:53 conditional handles the empty-apiKey case verbatim -- no factory code needed; Test 8 verifies no Authorization header sent when apiKey omitted"
  - "OpenRouter pure thin wrapper -- no post-processing (D-17 carryforward: model-routing array / fallback-array / per-message routing all DEFERRED; JSDoc explicitly notes this so future readers do not interpret single-id model field as a feature gap)"
  - "Co-located .test.ts pattern continues (CD-04 default RESOLVED). xai.ts <-> xai.test.ts; openrouter.ts <-> openrouter.test.ts; lm-studio.ts <-> lm-studio.test.ts; mirrors adapters.ts + adapters.test.ts precedent and Plans 04-01/04-02 sibling layout"
  - "FakeFetchCapture interface re-declared per-file (4 declarations total: adapters.test.ts existing + 3 new). Trades a small duplication cost for zero cross-file imports between tests; each test file remains self-contained and copyable"

patterns-established:
  - "Phase 4 thin-wrapper rhythm: import createOpenAICompatibleProvider + OpenAICompatibleProviderOptions; declare ProviderXxxOptions extends Omit<...> with provider-specific overrides; declare DEFAULT_XXX_BASE_URL const; factory returns createOpenAICompatibleProvider({...options, id: defaulted, baseUrl: defaulted})"
  - "Post-processing wrap pattern for provider quirks: when an OpenAI-compat provider has extra counts not captured by the default normalizer (xAI reasoning_tokens), wrap inner.execute with a typed cast on rawResponse; augment legacy UsageRecord (not normalized Usage). Future providers with similar quirks (Anthropic prompt-caching token surfaces, etc.) can reuse this pattern"
  - "TypeScript Omit + re-declare pattern for option relaxation: when wrapping a factory, Omit the fields you want to override (id/baseUrl/apiKey) and re-declare them with the new optionality. Preserves the underlying factory's type-safety guarantees while providing wrapper-specific defaults"

requirements-completed:
  - LSDK-16
  - LSDK-17
  - LSDK-18

# Metrics
duration: 4min
completed: 2026-05-24
---

# Phase 4 Plan 03: xAI / OpenRouter / LM Studio thin wrappers Summary

**Three thin-wrapper Lattice provider adapters shipped: xAI (`api.x.ai/v1`, preserves `completion_tokens_details.reasoning_tokens` quirk per D-07), OpenRouter (`openrouter.ai/api/v1`, model-routing deferred per D-17), LM Studio (`localhost:1234/v1`, noAuth default per CD-03, latency-tail diagnostics deferred per D-16). Each composes `createOpenAICompatibleProvider` with provider-specific defaults; xAI additionally post-processes the response to augment legacy `UsageRecord.totalTokens` with reasoning_tokens. 24 vitest cases (9/7/8) verify D-09 contract + provider-specific quirks. Lattice suite 366 -> 390 PASS / 34 -> 37 test files with no regressions.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-24T18:13Z (post Plan 04-02 auto-advance)
- **Completed:** 2026-05-24T18:17Z
- **Tasks:** 3
- **Files modified:** 0 (6 created in Lattice; 1 created in FSB)

## Accomplishments

- `createXaiProvider` factory ships at `lattice/packages/lattice/src/providers/xai.ts` (76 lines) -- thin wrapper around `createOpenAICompatibleProvider` pinned to `https://api.x.ai/v1`. PRESERVES xAI's `completion_tokens_details.reasoning_tokens` quirk (D-07): after the inner adapter's `execute()` returns, inspect `rawResponse.usage?.completion_tokens_details?.reasoning_tokens`; when present (`typeof === "number"`), recompute legacy `UsageRecord.totalTokens = inputTokens + outputTokens + reasoningTokens`. Matches FSB universal-provider.js:585-594 production behavior verbatim. Phase 7 normalized `Usage` (promptTokens/completionTokens/costUsd) deliberately unchanged -- normalized usage represents billable tokens; reasoning_tokens is xAI-extra-counts accessible via `response.rawResponse.usage.completion_tokens_details.reasoning_tokens`. Defensive fallback when `inner.execute === undefined` returns the inner adapter unchanged (no double-wrap).

- `createOpenRouterProvider` factory ships at `lattice/packages/lattice/src/providers/openrouter.ts` (41 lines) -- pure thin wrapper around `createOpenAICompatibleProvider` pinned to `https://openrouter.ai/api/v1`. Wire shape is identical to OpenAI Chat Completions; no post-processing needed (D-17 carryforward: model-routing array / fallback-array / per-message routing all DEFERRED, JSDoc-noted). Caller supplies single model id (`{ model: "openai/gpt-4o" }` etc.); multi-model fallback arrays are a follow-on phase.

- `createLmStudioProvider` factory ships at `lattice/packages/lattice/src/providers/lm-studio.ts` (47 lines) -- thin wrapper around `createOpenAICompatibleProvider` defaulting to `http://localhost:1234/v1`. apiKey is OPTIONAL via TypeScript `Omit<..., "apiKey">` + re-declare as `apiKey?: string` (CD-03 RESOLVED: no opt-out flag; LM Studio is no-auth by convention). When apiKey omitted, the underlying factory's conditional at `adapters.ts:53` sends no `Authorization` header -- no factory-code change needed; the type system enforces the optional contract. D-16 carryforward JSDoc-noted (latency-tail diagnostics is an observability concern; deferred to a follow-on phase).

- `XaiProviderOptions` / `OpenRouterProviderOptions` / `LmStudioProviderOptions` interfaces use TypeScript `Omit` pattern to relax `id` / `baseUrl` (all three) and `apiKey` (LM Studio) on the underlying `OpenAICompatibleProviderOptions`. Optional fields with documented defaults (`https://api.x.ai/v1`, `https://openrouter.ai/api/v1`, `http://localhost:1234/v1`); `baseUrl` override accepted for proxy deployments (Test 8 in xai.test.ts; documented in OpenRouter + LM Studio JSDoc).

- Companion vitest files:
  - `xai.test.ts` (203 lines, 9 cases): factory identity (D-09.1), request shape with default base URL `api.x.ai/v1` (D-09.2), response parsing (D-09.3), usage extraction without reasoning_tokens (D-09.4), **Test 4b: D-07 + D-09.4 reasoning_tokens quirk -- totalTokens INCLUDES reasoning_tokens** (asserts 100+50+200=350; raw response preserves the path), error handling (D-09.5), pricing applied vs null (D-09.6), AbortSignal wiring (D-09.7), baseUrl override accepted (proxy support).
  - `openrouter.test.ts` (155 lines, 7 cases): D-09 contract end-to-end -- factory identity, request shape with default base URL `openrouter.ai/api/v1`, response parsing, usage extraction (standard OpenAI-compat prompt_tokens/completion_tokens), error handling, pricing (`(1000 * 0.0015 + 500 * 0.006) / 1000 = 0.0045`), AbortSignal wiring.
  - `lm-studio.test.ts` (181 lines, 8 cases): D-09 contract -- factory identity, request shape with default base URL `localhost:1234/v1`, response parsing, usage extraction, error handling, pricing (`{0, 0}` -> costUsd=0 free vs no-pricing -> costUsd=null unmeasured per Phase 7 contract), AbortSignal wiring, **Test 8: CD-03 no Authorization header when apiKey omitted** (asserts neither `authorization` nor `Authorization` present on the request headers).

- All 24 new cases PASS standalone. Full Lattice suite advances **366 -> 390 PASS / 34 -> 37 test files** with no regressions (Phase 1+2+3 + Plan 04-01 + Plan 04-02 byte-frozen baselines all preserved).

## Threat Model Mitigations Applied

- **T-04-03-01 (Information disclosure: xAI/OpenRouter apiKey):** Mitigated via JSDoc explicit "do NOT hardcode or log it" on both `XaiProviderOptions.apiKey` and `OpenRouterProviderOptions.apiKey`. apiKey is a runtime parameter; the underlying `createOpenAICompatibleProvider` factory at `adapters.ts:53` handles it as the Authorization Bearer header without echoing it to traces.
- **T-04-03-02 (Information disclosure: LM Studio Authorization):** Mitigated via Omit + optional re-declare on `LmStudioProviderOptions.apiKey`. Default sends no Authorization header. Test 8 (`lm-studio.test.ts:155-167`) explicitly asserts absence of both `authorization` and `Authorization` keys on `capture.init.headers` when apiKey omitted.
- **T-04-03-03 (Spoofing: Hard-coded base URLs):** Mitigated by accepting `baseUrl?` on each ProviderOptions interface. JSDoc documents the default and the override (proxy support). Test 8 in `xai.test.ts` exercises proxy override (`https://proxy.example.com/xai/v1`); OpenRouter and LM Studio JSDoc document the same pattern.
- **T-04-03-04 (Tampering: xAI reasoning_tokens quirk drift):** Mitigated by Test 4b in `xai.test.ts` -- explicit assertions that `response.usage?.totalTokens === 350` (=100+50+200) and `response.rawResponse.usage.completion_tokens_details.reasoning_tokens === 200`. Inline code comment ties the behavior to FSB `universal-provider.js:593`. Future refactors of the wrap MUST keep Test 4b green.
- **T-04-03-07 (Repudiation: Lattice commit Ref footer forgotten):** Mitigated via `git log -3 fsb-integration-experiments --format=%B | grep -c "Ref: FSB v0.10.0-attempt-2 Phase 4"` returning 3 (verified post commit-3).
- **T-04-03-08 (Tampering: Accidental FSB extension/* edit):** Mitigated via `git diff --name-only 51bdbb36 HEAD -- "extension/*" "mcp/*"` returning empty (verified post commit-3).

## Deviations from Plan

### Auto-fixed Issues

None. Plan executed exactly as written (action bodies byte-identical to plan source).

### Planner-Artifact Discrepancies (no code fix)

**1. [Documentation only] openrouter.ts line count below frontmatter `min_lines`**
- **Found during:** Task 2 verification
- **Issue:** Plan 04-03 frontmatter declares `min_lines: 50` for `openrouter.ts`. Actual file written byte-identically to the planner's authoritative `<action>` body content is **41 lines**.
- **Resolution:** Plan preamble states the action body is authoritative ("AUTHORITATIVE -- 3 task action bodies with full file contents"). The action body specifies the exact 41-line content; the `min_lines: 50` frontmatter is a planner over-estimate. All substantive done-criteria pass (createOpenRouterProvider present, baseUrl default present, DEFERRED note in JSDoc, 7 vitest cases). No code fix applied -- padding with empty lines would violate code-hygiene principles.

**2. [Documentation only] lm-studio.ts line count below frontmatter `min_lines`**
- **Found during:** Task 3 verification
- **Issue:** Plan 04-03 frontmatter declares `min_lines: 50` for `lm-studio.ts`. Actual file written byte-identically to the planner's authoritative `<action>` body content is **47 lines**.
- **Resolution:** Same as deviation #1 -- action body is authoritative; the 47-line content matches the action body verbatim. All substantive done-criteria pass (createLmStudioProvider present, localhost:1234 default, D-16 DEFERRED note, 8 vitest cases incl. CD-03 noAuth verification).

**3. [Counting only] xai.test.ts ships 9 vitest `it()` calls, not 8**
- **Found during:** Task 1 verification
- **Issue:** Plan 04-03 frontmatter declares "8 vitest cases" for `xai.test.ts`. The plan labels the cases 1, 2, 3, 4, 4b, 5, 6, 7, 8 (9 logical `it()` blocks; Test 4b is the explicit D-07 reasoning_tokens quirk case authored as required by the plan's `<behavior>` clause).
- **Resolution:** No fix needed. D-09 contract mandates 7+ cases; 9 actual cases exceed both the contract and the "8 cases for thoroughness" intent. Vitest reports 9/9 PASS. Full Lattice suite reports 390 (not the planner-predicted 389) because of this 1-test overage -- additive only, no regressions.

## Lattice Commits

Three commits on `fsb-integration-experiments` (NOT pushed; D-19):

| Order | SHA (full) | Subject | Files | Vitest cases |
|-------|------------|---------|-------|--------------|
| 1 | `09a495eb7d6b927b1a31aaa9ed9d71fdcd255cb7` | `feat(providers): add xAI provider adapter` | `xai.ts` + `xai.test.ts` | 9 PASS |
| 2 | `1cfc13c519890aa0b6ad1c0db78fd02098e20739` | `feat(providers): add OpenRouter provider adapter` | `openrouter.ts` + `openrouter.test.ts` | 7 PASS |
| 3 | `40457ff2184589c8bc6525eb0b0668fe6ab8a0c3` | `feat(providers): add LM Studio provider adapter` | `lm-studio.ts` + `lm-studio.test.ts` | 8 PASS |

All three commits carry `Ref: FSB v0.10.0-attempt-2 Phase 4` footer (D-18). Verified:

```
cd lattice && git log -3 fsb-integration-experiments --format=%B | grep -c "Ref: FSB v0.10.0-attempt-2 Phase 4"
# 3
```

Lattice HEAD post Plan 04-03: `40457ff2184589c8bc6525eb0b0668fe6ab8a0c3` (recorded in `04-03-LATTICE-SHA.txt`).

## Verification Command Outputs

```
=== 1. All 6 files exist ===
lm-studio.test.ts (6354b), lm-studio.ts (2105b)
openrouter.test.ts (5185b), openrouter.ts (1799b)
xai.test.ts (6875b), xai.ts (3139b)

=== 2. TS compiles ===
tsc --noEmit exit=0 (no output)

=== 3. All 3 adapter vitests pass ===
Test Files: 3 passed (3)
Tests: 24 passed (24)

=== 4. Full Lattice suite ===
Test Files: 37 passed (37)
Tests: 390 passed (390)
[347 Phase 3 baseline + 9 Plan 04-01 xAI -- correction: + 9 Plan 04-01 Anthropic + 10 Plan 04-02 Gemini + 9 xAI + 7 OpenRouter + 8 LM Studio = 390 PASS]

=== 5. 3 Lattice commits with Ref footer ===
40457ff2184589c8bc6525eb0b0668fe6ab8a0c3 feat(providers): add LM Studio provider adapter
1cfc13c519890aa0b6ad1c0db78fd02098e20739 feat(providers): add OpenRouter provider adapter
09a495eb7d6b927b1a31aaa9ed9d71fdcd255cb7 feat(providers): add xAI provider adapter
Ref footer count: 3

=== 6. No push (D-19) ===
git reflog | grep -c push: 0

=== 7. No FSB-side extension/* or mcp/* modifications since pivot baseline 51bdbb36 ===
git diff --name-only 51bdbb36 HEAD -- "extension/*" "mcp/*": (empty)
Line count: 0

=== 8. Phase 1+2+3 byte-frozen baselines preserved ===
INV-01 MCP parity: 142 passed, 0 failed
INV-04 setTimeout iterator count: 8
Phase 1 lattice-smoke: 29 PASS / 0 FAIL
Phase 2 lattice-tripwire-smoke: 39 PASS / 0 FAIL
Phase 3 lattice-checkpoint-smoke: 72 PASS / 0 FAIL
```

## Carryforward for Plan 04-04

Plan 04-04 will:

1. **Re-export 5 new provider factories from Lattice public surface** -- `src/index.ts` adds 5 lines re-exporting `createAnthropicProvider`, `createGeminiProvider`, `createXaiProvider`, `createOpenRouterProvider`, `createLmStudioProvider` + their option types. Rebuild `dist/`.
2. **INV-03 parity smoke** at `lattice/packages/lattice/src/providers/parity.test.ts` -- iterate the 7 logical providers (openai, openai-compatible, anthropic, gemini, xai, openrouter, lm-studio); for each: assert adapter shape, request execution returns ProviderRunResponse with rawOutputs populated, normalizedUsage shape, 500-status throws with provider name. 7+ vitest cases (one per provider).
3. **Audit-doc 5 row flips** at `lattice/docs/fsb-integration-gaps.md`:
   - Anthropic (Blocker -> Covered) citing `cf31d82` (Plan 04-01)
   - Gemini (Blocker -> Covered) citing `7a32b00` (Plan 04-02)
   - xAI (Blocker -> Covered) citing `09a495e` (Plan 04-03 Task 1)
   - OpenRouter (Important -> Covered) citing `1cfc13c` (Plan 04-03 Task 2); row note PRESERVES "model-routing array deferred per D-17"
   - LM Studio (Important -> Covered) citing `40457ff` (Plan 04-03 Task 3); row note PRESERVES "latency-tail diagnostics deferred per D-16"

The two carryforward deferrals (D-16 LM Studio latency-tail + D-17 OpenRouter model-routing) are documented in BOTH the adapter JSDoc (already shipped in Plan 04-03) AND the audit-doc row notes (Plan 04-04 deliverable).

## Threat Flags

None. Plan 04-03 introduces no new trust boundaries beyond those already inherited from `createOpenAICompatibleProvider` (Plan 04-01/04-02 baseline). The 3 new factories are thin wrappers that route fetch + auth through the underlying factory; no new endpoints, file access, or schema changes at trust boundaries.

## Self-Check: PASSED

- xai.ts (76 lines) FOUND at lattice/packages/lattice/src/providers/xai.ts
- xai.test.ts (203 lines) FOUND at lattice/packages/lattice/src/providers/xai.test.ts
- openrouter.ts (41 lines) FOUND at lattice/packages/lattice/src/providers/openrouter.ts
- openrouter.test.ts (155 lines) FOUND at lattice/packages/lattice/src/providers/openrouter.test.ts
- lm-studio.ts (47 lines) FOUND at lattice/packages/lattice/src/providers/lm-studio.ts
- lm-studio.test.ts (181 lines) FOUND at lattice/packages/lattice/src/providers/lm-studio.test.ts
- 04-03-LATTICE-SHA.txt FOUND at .planning/phases/04-provider-adapter-alignment/04-03-LATTICE-SHA.txt
- Lattice commit 09a495eb7d6b927b1a31aaa9ed9d71fdcd255cb7 FOUND
- Lattice commit 1cfc13c519890aa0b6ad1c0db78fd02098e20739 FOUND
- Lattice commit 40457ff2184589c8bc6525eb0b0668fe6ab8a0c3 FOUND
