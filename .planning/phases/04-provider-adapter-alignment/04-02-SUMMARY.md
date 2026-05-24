---
phase: 04-provider-adapter-alignment
plan: 02
subsystem: lattice-providers
tags: [gemini, provider-adapter, lattice, typescript, vitest, fetch, generative-language-api, safetysettings]

# Dependency graph
requires:
  - phase: 01-lattice-gap-survey-scaffold
    provides: "Lattice file: dep + audit doc identifying Gemini adapter as Blocker row"
  - phase: 03-observability-step-markers-extension
    provides: "Lattice pinned SHA 7afd62fc + Phase 2 createOpenAICompatibleProvider/normalization helpers in adapters.ts"
  - phase: 04-provider-adapter-alignment
    provides: "Plan 04-01 Anthropic full-custom adapter at cf31d82 (sibling pattern + 356-test post-04-01 baseline extended to 366 in this plan)"
provides:
  - "createGeminiProvider factory at lattice/packages/lattice/src/providers/gemini.ts"
  - "GeminiProviderOptions interface (model, apiKey, baseUrl?, fetch?, pricing?)"
  - "Full custom adapter for Google Generative Language API (/v1beta/models/{model}:generateContent; contents[].parts[].text; role user/model; 4 BLOCK_NONE safetySettings; ?key= query auth)"
  - "10 vitest cases covering D-09 7-case contract + 3 Gemini-specific extras (missing-candidates empty-array throw, query-string key wiring, D-07 role mapping preserved)"
  - "Lattice commit 7a32b00 on fsb-integration-experiments (not pushed per D-19)"
affects:
  - "04-03-thin-wrappers (xAI/OpenRouter/LM-Studio thin wrappers; sibling-pattern continues)"
  - "04-04-parity-smoke-and-public-surface (parity.test.ts will iterate the 7-provider table including gemini)"
  - "04-05-audit-doc-row-flip (Gemini row Blocker -> Covered cites 7a32b00)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Full custom provider adapter pattern (mirrors createAnthropicProvider sibling-file ergonomics; replaces shape-divergent OpenAI flow with /v1beta:generateContent shape)"
    - "Private per-adapter usage normalization helpers (normalizeGeminiUsage + normalizeGeminiUsageToRunUsage map promptTokenCount/candidatesTokenCount -> Usage shape)"
    - "Top-level frozen-tuple constant SAFETY_SETTINGS for 4 HARM_CATEGORY BLOCK_NONE entries (compile-time as const, runtime immutability)"
    - "URL-component encoding via encodeURIComponent on BOTH model (URL path) and apiKey (?key= query string) -- mitigates T-04-02-01 + T-04-02-02"
    - "AbortSignal threading via spread (...(request.signal !== undefined ? { signal: request.signal } : {})) reused verbatim from adapters.ts:108"
    - "Explicit missing-candidates throw mirrors universal-provider.js:552-554 -- empty candidates array on 200 OK is treated as failure"

key-files:
  created:
    - "lattice/packages/lattice/src/providers/gemini.ts (176 lines; createGeminiProvider factory + GeminiProviderOptions + SAFETY_SETTINGS const + 2 private usage helpers + numberField helper)"
    - "lattice/packages/lattice/src/providers/gemini.test.ts (251 lines; 10 vitest cases + makeFakeFetch with capture)"
    - ".planning/phases/04-provider-adapter-alignment/04-02-LATTICE-SHA.txt (Lattice commit SHA reference)"
  modified: []

key-decisions:
  - "Single Lattice commit groups gemini.ts + gemini.test.ts (one logical surface per D-18 + Plan 04-01 carryforward; mirrors cf31d82 cadence)"
  - "encodeURIComponent on apiKey (and model name) hardens against future model-ID changes including URL-unsafe characters and prevents query-string injection (T-04-02-01/02 mitigations)"
  - "Private normalizeGeminiUsage + normalizeGeminiUsageToRunUsage helpers rather than extending OpenAI or Anthropic normalizers (Gemini uses promptTokenCount/candidatesTokenCount -- D-07 quirk preservation > DRY)"
  - "10 vitest cases (D-09 mandates 7+); 3 extras codify Gemini-specific shape: Test 8 missing-candidates throw, Test 9 ?key= + :generateContent URL wiring, Test 10 D-07 role 'user'/'model' preserved (NOT 'assistant'/'system')"
  - "SAFETY_SETTINGS as a top-level `as const` tuple ensures both compile-time literal typing and runtime stability across multiple execute() calls (FSB mirrors universal-provider.js:255-272 verbatim)"

patterns-established:
  - "Phase 4 full-custom adapter rhythm holds for 2nd time: types interface + DEFAULT_* constants + factory + private usage helpers + numberField helper (anthropic.ts -> gemini.ts congruent)"
  - "Co-located .test.ts file with makeFakeFetch returning {fetch, capture} pair (capture is the read-back surface for asserting request body + URL + signal -- enhanced from adapters.test.ts:10-16 single-return makeFakeFetch)"
  - "Empty-array-on-200 treatment: providers that surface 'no candidates' / 'no choices' should throw an adapter-side error rather than silently producing empty strings (mirrors universal-provider.js:552-554)"

requirements-completed:
  - LSDK-15

# Metrics
duration: 3min
completed: 2026-05-24
---

# Phase 4 Plan 02: Gemini provider adapter Summary

**Full custom Lattice adapter for Google's Generative Language API at `/v1beta/models/{model}:generateContent` (contents[].parts[].text request shape + candidates[0].content.parts[0].text response + 4 HARM_CATEGORY BLOCK_NONE safetySettings + ?key= query auth) with 10 vitest cases proving D-09 contract end-to-end via fake fetch.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-24T23:05:23Z
- **Completed:** 2026-05-24T23:08:09Z
- **Tasks:** 2
- **Files modified:** 0 (2 created in Lattice; 1 created in FSB)

## Accomplishments

- `createGeminiProvider` factory ships at `lattice/packages/lattice/src/providers/gemini.ts` (176 lines) -- full custom adapter (NOT a thin wrapper around `createOpenAICompatibleProvider`) because Gemini's `/v1beta/models/{model}:generateContent` schema diverges fundamentally from OpenAI's Chat Completions schema. `contents[].parts[].text` request shape per D-07; `candidates[0].content.parts[0].text` response parsing per universal-provider.js:555; `usageMetadata.promptTokenCount`/`candidatesTokenCount`/`totalTokenCount` usage extraction per universal-provider.js:559-562; explicit missing-candidates throw per universal-provider.js:552-554.
- `GeminiProviderOptions` interface accepts `{ id?, model, apiKey, baseUrl?, fetch?, pricing? }` with documented defaults: baseUrl `https://generativelanguage.googleapis.com`, temperature 0.7, topP 0.9, maxOutputTokens 2000. SAFETY_SETTINGS const-tuple ships 4 HARM_CATEGORY entries at BLOCK_NONE (FSB convention mirrored from universal-provider.js:255-272).
- 10 vitest cases at `lattice/packages/lattice/src/providers/gemini.test.ts` (251 lines) -- exceeds D-09 7-case minimum. All 10 PASS standalone; full Lattice suite advances 356 -> 366 PASS / 33 -> 34 test files with no regressions.
- One Lattice commit `7a32b00` on `fsb-integration-experiments` with `Ref: FSB v0.10.0-attempt-2 Phase 4` footer; D-19 NO-push contract holds (reflog grep count = 0).

## Task Commits

Each task lives in ONE Lattice commit (per plan action body in Task 2):

1. **Task 1 + Task 2 combined: Gemini adapter + 10 vitest cases** - `7a32b00` (Lattice repo, fsb-integration-experiments branch) -- `feat(providers): add Gemini provider adapter`

**Plan metadata:** to be committed in FSB final-commit step (SUMMARY + STATE + ROADMAP + REQUIREMENTS + LATTICE-SHA.txt)

_Note: This plan structures Task 1 (adapter file) + Task 2 (test file) as ONE Lattice commit per plan's Task 2 action body. The Lattice convention `D-18 + D-14` from Phase 3 carryforward is "one commit per logical surface" -- the adapter + its companion vitest IS that logical surface. Plan 04-01 ran the same cadence._

## Files Created/Modified

### Lattice (commit 7a32b00 on fsb-integration-experiments)
- `lattice/packages/lattice/src/providers/gemini.ts` (created, 176 lines) -- createGeminiProvider factory + GeminiProviderOptions + SAFETY_SETTINGS const-tuple + 2 private helpers (normalizeGeminiUsage + normalizeGeminiUsageToRunUsage) + numberField helper
- `lattice/packages/lattice/src/providers/gemini.test.ts` (created, 251 lines) -- 10 vitest cases + makeFakeFetch helper with FakeFetchCapture for request body + URL + signal assertions

### FSB (to be committed in final-commit step)
- `.planning/phases/04-provider-adapter-alignment/04-02-LATTICE-SHA.txt` (created) -- Lattice commit SHA reference (`7a32b00cf3ad9691bb42660a06335f5e9a3b5af3 feat(providers): add Gemini provider adapter`)
- `.planning/phases/04-provider-adapter-alignment/04-02-SUMMARY.md` (this file)

### Verification command outputs

```
$ cd lattice && pnpm --filter lattice exec tsc --noEmit; echo "exit=$?"
exit=0

$ cd lattice/packages/lattice && pnpm exec vitest run src/providers/gemini.test.ts
Test Files  1 passed (1)
     Tests  10 passed (10)
  Duration  153ms

$ cd lattice && pnpm --filter lattice test
Test Files  34 passed (34)
     Tests  366 passed (366)
  Duration  947ms

$ cd lattice && git log -1 fsb-integration-experiments --format="%H %s"
7a32b00cf3ad9691bb42660a06335f5e9a3b5af3 feat(providers): add Gemini provider adapter

$ cd lattice && git log -1 fsb-integration-experiments --format=%B | grep -c "Ref: FSB v0.10.0-attempt-2 Phase 4"
1

$ cd lattice && git reflog -10 | grep -c push
0

$ git diff --name-only 51bdbb36 HEAD -- "extension/*" "mcp/*"
(empty)

$ node tests/lattice-smoke.test.js | grep -E "passed:|failed:"
passed: 29
failed: 0

$ node tests/lattice-tripwire-smoke.test.js | grep -E "passed:|failed:"
passed: 39
failed: 0

$ node tests/lattice-checkpoint-smoke.test.js | grep -E "passed:|failed:"
passed: 72
failed: 0

$ node tests/tool-definitions-parity.test.js | tail -1
=== Results: 142 passed, 0 failed ===

$ grep -c "setTimeout" extension/ai/agent-loop.js
8
```

All gates green: TypeScript clean (exit 0), Lattice suite 366/366 PASS (was 356 + 10 new), single Lattice commit with Ref footer, zero pushes, zero extension/mcp modifications, all 3 phase smokes (29 + 39 + 72) byte-frozen, INV-01 (142/142) preserved, INV-04 (setTimeout = 8) preserved.

### Vitest case names + count

10 cases (D-09 mandates 7+ minimum):

1. `Test 1 (D-09.1): factory identity -- kind, id, capabilities populated`
2. `Test 2 (D-09.2): request shape -- contents[].parts[].text + safetySettings (FSB BLOCK_NONE convention)`
3. `Test 3 (D-09.3): response parsing -- extracts candidates[0].content.parts[0].text`
4. `Test 4 (D-09.4): usage extraction -- promptTokenCount/candidatesTokenCount (Gemini-specific shape)`
5. `Test 5 (D-09.5): error handling -- non-OK throws with provider name + status`
6. `Test 6 (D-09.6): pricing applied -> costUsd computed; absent -> null`
7. `Test 7 (D-09.7): AbortSignal wiring -- request.signal propagates to fetch`
8. `Test 8: missing candidates -> throws 'Gemini provider returned no candidates.'`
9. `Test 9: URL contains ?key=<apiKey> query string and :generateContent segment`
10. `Test 10 (D-07): role mapping preserved -- role 'user' (NOT 'system'; NOT 'assistant')`

## Decisions Made

- **Single Lattice commit groups adapter + tests.** Per plan Task 2 action body, both files land in one `feat(providers): add Gemini provider adapter` commit -- consistent with Plan 04-01 + Phase 3's "one commit per logical surface" pattern (D-18 + D-14 carryforward).
- **encodeURIComponent on both model name and apiKey.** Hardens against future model-ID changes that may include URL-unsafe characters and provides defense-in-depth against query-string injection at the apiKey position (T-04-02-01 + T-04-02-02 mitigations). Gemini's API contract uses query-string auth, so the key still appears in HTTP-layer URL logs -- consumers responsible for log redaction at the request-observer level.
- **SAFETY_SETTINGS as top-level `as const` tuple.** Ensures both compile-time literal typing AND runtime stability across multiple execute() calls. FSB-side reference at universal-provider.js:255-272 is the source of truth for the 4 categories at BLOCK_NONE. If Google restricts BLOCK_NONE in the future, that's a re-spec concern, not a Phase 4 design defect (T-04-02-05 disposition: accept).
- **Private Gemini usage normalizers (not shared with OpenAI or Anthropic normalizers).** `normalizeGeminiUsage` + `normalizeGeminiUsageToRunUsage` are file-local helpers because Gemini uses `promptTokenCount`/`candidatesTokenCount`/`totalTokenCount` (NOT `prompt_tokens`/`completion_tokens` or `input_tokens`/`output_tokens`). D-07 quirk-preservation > DRY -- Anthropic took the same stance in Plan 04-01.
- **10 vitest cases (exceeds D-09 7-case minimum).** Plan explicitly ships 10: 7 D-09 contract cases + 3 extras (Test 8 codifies missing-candidates throw mirroring universal-provider.js:552-554; Test 9 codifies ?key=<apiKey> + :generateContent URL wiring; Test 10 codifies D-07 role mapping with role 'user'/'model' preserved, NOT translated to 'assistant'/'system').

## Deviations from Plan

None - plan executed exactly as written. The action body in Task 1 + Task 2 specified the FULL file contents verbatim; both files were created with exact content match, the single commit was created with the exact message body specified, no improvisation occurred. The typecheck verify command in Task 1's `<automated>` snippet uses a `--project packages/lattice/tsconfig.json` argument that does not work when run from inside the `lattice/` directory (the relative path resolves wrong); used `pnpm --filter lattice exec tsc --noEmit` instead (exit 0 -- same intent as Plan 04-01 which documented the same vitest filter typo).

## Issues Encountered

- **Typecheck verify command path typo.** Plan 04-02's Task 1 `<automated>` snippet was `cd lattice && pnpm --filter lattice exec tsc --noEmit --project packages/lattice/tsconfig.json` -- but with `--filter lattice`, the working directory becomes `packages/lattice`, so the prefixed `packages/lattice/tsconfig.json` path doesn't exist (TS5058). Resolved by using `cd lattice && pnpm --filter lattice exec tsc --noEmit` (no `--project` flag); pnpm `--filter` resolves the package tsconfig automatically. Documented here so future provider-plan executors can use the simpler invocation. Not a deviation -- same class of typo as Plan 04-01's vitest filter path documented in its SUMMARY.
- **Pre-existing untracked Lattice .planning/STATE.md modification.** `cd lattice && git status --short` showed ` M .planning/STATE.md` from a Plan 01-02-era unstaged edit inside Lattice's own .planning/. NOT staged in this plan's commit (per CLAUDE.md rule: stage task-related files individually, never `git add .` / `git add -A`). The two new Gemini files were the only items staged.

## User Setup Required

None - no external service configuration required. The adapter is a Lattice library function; it accepts `apiKey` as a runtime parameter from the caller; Phase 4 does not wire Gemini into FSB autopilot (Option B carryforward; that's a later phase after Phase 5 MV3-survivability adapter contract).

## Next Phase Readiness

Plan 04-03 (thin wrappers for xAI / OpenRouter / LM Studio) can immediately proceed -- the pattern established by 04-01 (Anthropic full custom) and 04-02 (Gemini full custom) is the template, but thin wrappers will compose around `createOpenAICompatibleProvider` (single-file each ~30-50 lines) rather than reimplementing the full request/response flow. The per-adapter .test.ts pattern + single conventional commit per provider + Ref footer continue.

Plan 04-04 (parity smoke + public surface re-exports) will iterate a 7-provider table including the now-shipped Anthropic + Gemini factories; that plan adds `createGeminiProvider` to the re-export block in `lattice/packages/lattice/src/index.ts` (Phase 4 ceremony groups the re-export commit separately).

## Carryforward Notes for Plan 04-04

When Plan 04-04 flips the Gemini audit-doc row from Blocker to Covered in `lattice/docs/fsb-integration-gaps.md`, the citation SHA is `7a32b00cf3ad9691bb42660a06335f5e9a3b5af3` (or short form `7a32b00`). The audit-doc Notes column should reference: "Lattice commit 7a32b00 ships full custom adapter at packages/lattice/src/providers/gemini.ts (176 lines, contents[].parts[].text + 4 BLOCK_NONE safetySettings + ?key= query auth + role:'model' preservation per D-07, 10 vitest cases per D-09)."

The running Lattice vitest tally entering Plan 04-03 is 366 PASS / 34 test files (was 347 PASS / 31 baseline after Phase 3 + 9 from 04-01 + 10 from 04-02). Plan 04-04's parity smoke will add ~7 cases (one per logical provider in the iteration table); Plan 04-03 will add ~3 thin-wrapper test files (~7 cases each, ~21 total). Final Phase 4 tally expected: 366 + ~21 (04-03) + ~7 (04-04) = ~394 PASS / ~38 test files.

## Self-Check: PASSED

- File `lattice/packages/lattice/src/providers/gemini.ts` exists (176 lines, createGeminiProvider exported)
- File `lattice/packages/lattice/src/providers/gemini.test.ts` exists (251 lines, 10 it() cases)
- File `.planning/phases/04-provider-adapter-alignment/04-02-LATTICE-SHA.txt` exists (contains 7a32b00 SHA)
- Lattice commit `7a32b00cf3ad9691bb42660a06335f5e9a3b5af3` exists on `fsb-integration-experiments` branch
- `Ref: FSB v0.10.0-attempt-2 Phase 4` footer present (grep count = 1)
- `cd lattice && git reflog | grep -c push` returns 0 (D-19 holds)
- All FSB Phase 1+2+3 smokes still PASS (29 + 39 + 72)
- INV-01 = 142/142, INV-04 = 8
- Zero extension/* or mcp/* modifications
- Full Lattice vitest suite 34 files / 366 tests PASS

---
*Phase: 04-provider-adapter-alignment*
*Completed: 2026-05-24*
