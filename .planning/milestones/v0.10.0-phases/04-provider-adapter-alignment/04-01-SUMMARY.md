---
phase: 04-provider-adapter-alignment
plan: 01
subsystem: lattice-providers
tags: [anthropic, provider-adapter, lattice, typescript, vitest, fetch, messages-api]

# Dependency graph
requires:
  - phase: 01-lattice-gap-survey-scaffold
    provides: "Lattice file: dep + audit doc identifying Anthropic adapter as Blocker row"
  - phase: 03-observability-step-markers-extension
    provides: "Lattice pinned SHA 7afd62fc + 347-test baseline (extended to 356 in this plan)"
provides:
  - "createAnthropicProvider factory at lattice/packages/lattice/src/providers/anthropic.ts"
  - "AnthropicProviderOptions interface (model, apiKey, baseUrl?, anthropicVersion?, fetch?, pricing?)"
  - "Full custom adapter for Anthropic Messages API (top-level system field + content[0].text response)"
  - "9 vitest cases covering D-09 contract (factory identity, request shape, response parsing, usage extraction, error handling, pricing, AbortSignal, top-level system preservation, headers)"
  - "Lattice commit cf31d82 on fsb-integration-experiments (not pushed per D-19)"
affects:
  - "04-02-gemini-provider-adapter (sibling full-custom adapter; same pattern)"
  - "04-03-thin-wrappers (xAI/OpenRouter/LM-Studio thin wrappers; will mirror this commit style)"
  - "04-04-parity-smoke-and-public-surface (parity.test.ts will iterate the 7-provider table including anthropic)"
  - "04-05-audit-doc-row-flip (Anthropic row Blocker -> Covered cites cf31d82)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Full custom provider adapter pattern (mirrors createOpenAICompatibleProvider ergonomics; replaces shape-divergent OpenAI flow)"
    - "Private per-adapter usage normalization helpers (normalizeAnthropicUsage + normalizeAnthropicUsageToRunUsage map input_tokens/output_tokens -> Usage shape)"
    - "AbortSignal threading via spread (...(request.signal !== undefined ? { signal: request.signal } : {})) reused verbatim from adapters.ts:108"

key-files:
  created:
    - "lattice/packages/lattice/src/providers/anthropic.ts (161 lines; createAnthropicProvider factory + 2 private usage helpers)"
    - "lattice/packages/lattice/src/providers/anthropic.test.ts (216 lines; 9 vitest cases + makeFakeFetch with capture)"
    - ".planning/phases/04-provider-adapter-alignment/04-01-LATTICE-SHA.txt (Lattice commit SHA reference)"
  modified: []

key-decisions:
  - "Single Lattice commit groups anthropic.ts + anthropic.test.ts (one logical surface per D-18 + Phase 3 carryforward)"
  - "Top-level `system: \"\"` placeholder ships now; future multi-message contract phases will extract system from request shape (preserves D-07 wire correctness today)"
  - "Private normalizeAnthropicUsage + normalizeAnthropicUsageToRunUsage helpers rather than extending the OpenAI normalizers (Anthropic uses input_tokens/output_tokens; clean separation matches D-07 quirk-preservation)"
  - "9 vitest cases (D-09 mandates 7+); 2 extras cover D-07 system non-folding + headers (anthropic-version + x-api-key + no Bearer prefix)"

patterns-established:
  - "Per-provider full-custom adapter file: types interface + DEFAULT_* constants + factory + private usage helpers + numberField helper"
  - "Co-located .test.ts file with makeFakeFetch returning {fetch, capture} pair (capture is the read-back surface for asserting request body + headers + signal)"
  - "Conventional commit + Ref footer (`Ref: FSB v0.10.0-attempt-2 Phase 4`) on single-logical-surface Lattice commits"

requirements-completed:
  - LSDK-14

# Metrics
duration: 3min
completed: 2026-05-24
---

# Phase 4 Plan 01: Anthropic provider adapter Summary

**Full custom Lattice adapter for Anthropic's /v1/messages API (top-level `system` field + `content[0].text` response shape) with 9 vitest cases proving D-09 contract end-to-end via fake fetch.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-24T22:57:57Z
- **Completed:** 2026-05-24T23:00:34Z
- **Tasks:** 2
- **Files modified:** 0 (2 created in Lattice; 1 created in FSB)

## Accomplishments

- `createAnthropicProvider` factory ships at `lattice/packages/lattice/src/providers/anthropic.ts` (161 lines) -- full custom adapter (NOT a thin wrapper around `createOpenAICompatibleProvider`) because Anthropic's Messages API diverges fundamentally from OpenAI's Chat Completions schema. Top-level `system` field per D-07; `content[0].text` response parsing per universal-provider.js:567; `input_tokens`/`output_tokens` usage extraction per universal-provider.js:569-571.
- `AnthropicProviderOptions` interface accepts `{ id?, model, apiKey, baseUrl?, anthropicVersion?, fetch?, pricing? }` with documented defaults: baseUrl `https://api.anthropic.com`, anthropicVersion `2023-06-01`, max_tokens 2000.
- 9 vitest cases at `lattice/packages/lattice/src/providers/anthropic.test.ts` (216 lines) -- exceeds D-09 7-case minimum. All 9 PASS standalone; full Lattice suite advances 347 -> 356 PASS with no regressions.
- One Lattice commit `cf31d82` on `fsb-integration-experiments` with `Ref: FSB v0.10.0-attempt-2 Phase 4` footer; D-19 NO-push contract holds (reflog grep count = 0).

## Task Commits

Each task lives in ONE Lattice commit (per plan action body in Task 2):

1. **Task 1 + Task 2 combined: Anthropic adapter + 9 vitest cases** - `cf31d82` (Lattice repo, fsb-integration-experiments branch) -- `feat(providers): add Anthropic provider adapter`

**Plan metadata:** to be committed in FSB final-commit step (SUMMARY + STATE + ROADMAP + REQUIREMENTS + LATTICE-PIN + LATTICE-SHA.txt)

_Note: This plan structures Task 1 (adapter file) + Task 2 (test file) as ONE Lattice commit per plan's Task 2 action body. The Lattice convention `D-18 + D-14` from Phase 3 carryforward is "one commit per logical surface" -- the adapter + its companion vitest IS that logical surface._

## Files Created/Modified

### Lattice (commit cf31d82 on fsb-integration-experiments)
- `lattice/packages/lattice/src/providers/anthropic.ts` (created, 161 lines) -- createAnthropicProvider factory + AnthropicProviderOptions + 2 private helpers (normalizeAnthropicUsage + normalizeAnthropicUsageToRunUsage)
- `lattice/packages/lattice/src/providers/anthropic.test.ts` (created, 216 lines) -- 9 vitest cases + makeFakeFetch helper with FakeFetchCapture for request shape + header assertions

### FSB (to be committed in final-commit step)
- `.planning/phases/04-provider-adapter-alignment/04-01-LATTICE-SHA.txt` (created) -- Lattice commit SHA reference (`cf31d82275bc7ee3bfabbcd740ec0a0a68ed1f49 feat(providers): add Anthropic provider adapter`)
- `.planning/phases/04-provider-adapter-alignment/04-01-SUMMARY.md` (this file)

### Verification command outputs

```
$ cd lattice && pnpm --filter lattice exec tsc --noEmit
(exit 0, no output)

$ cd lattice/packages/lattice && pnpm exec vitest run src/providers/anthropic.test.ts
Test Files  1 passed (1)
     Tests  9 passed (9)
  Duration  165ms

$ cd lattice && pnpm --filter lattice test
Test Files  33 passed (33)
     Tests  356 passed (356)

$ cd lattice && git log -1 fsb-integration-experiments --format=%B | grep -c "Ref: FSB v0.10.0-attempt-2 Phase 4"
1

$ cd lattice && git reflog | grep -c push
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

All gates green: TypeScript clean, Lattice suite 356/356 PASS (was 347 + 9 new), single Lattice commit with Ref footer, zero pushes, zero extension/mcp modifications, all 3 phase smokes (29 + 39 + 72) byte-frozen, INV-01 (142/142) preserved, INV-04 (setTimeout = 8) preserved.

### Vitest case names + count

9 cases (D-09 mandates 7+ minimum):

1. `Test 1 (D-09.1): factory identity -- kind, id, capabilities populated`
2. `Test 2 (D-09.2): request shape -- top-level system + messages array (D-07 preserved)`
3. `Test 3 (D-09.3): response parsing -- extracts content[0].text`
4. `Test 4 (D-09.4): usage extraction -- input_tokens / output_tokens (NOT prompt_tokens)`
5. `Test 5 (D-09.5): error handling -- non-OK throws with provider name + status`
6. `Test 6 (D-09.6): pricing applied -- supplied -> costUsd computed; absent -> null`
7. `Test 7 (D-09.7): AbortSignal wiring -- request.signal propagates to fetch`
8. `Test 8 (D-07): top-level system field is present on request body`
9. `Test 9: anthropic-version + x-api-key headers wired correctly`

## Decisions Made

- **Single Lattice commit groups adapter + tests.** Per plan Task 2 action body, both files land in one `feat(providers): add Anthropic provider adapter` commit -- consistent with Phase 3's "one commit per logical surface" pattern (D-18 + D-14 carryforward).
- **Top-level `system: ""` placeholder shipped today.** Future multi-message contract phases will extract system from request shape; current single-shot contract reserves the field at the top level on the wire (D-07 preservation), even though it's empty. This decision is documented inline in the adapter file's NOTE comment.
- **Private Anthropic usage normalizers (not shared with OpenAI normalizers).** `normalizeAnthropicUsage` + `normalizeAnthropicUsageToRunUsage` are file-local helpers because Anthropic uses `input_tokens`/`output_tokens` and OpenAI uses `prompt_tokens`/`completion_tokens`. D-07 quirk-preservation > DRY.
- **9 vitest cases (exceeds D-09 7-case minimum).** Plan explicitly ships 9: 7 D-09 contract cases + 2 extras (Test 8 codifies D-07 system non-folding into messages; Test 9 codifies header wiring including the "no Bearer prefix on x-api-key" rule).

## Deviations from Plan

None - plan executed exactly as written. The action body in Task 1 + Task 2 specified the FULL file contents verbatim; both files were created with exact content match, the single commit was created with the exact message body specified, no improvisation occurred.

## Issues Encountered

- **vitest filter path interpretation.** First attempt used `pnpm --filter lattice exec vitest run packages/lattice/src/providers/anthropic.test.ts` which exited with `No test files found` because the filter resolves the working directory to `packages/lattice`, making the prefixed path miss. Resolved by running `cd lattice/packages/lattice && pnpm exec vitest run src/providers/anthropic.test.ts` -- which is the correct invocation from inside the package. Documented in this summary so Plan 04-02 + 04-03 + 04-04 use the correct path. Not a deviation -- the plan's `<automated>` snippet was a slight typo in the per-test invocation (using `pnpm --filter lattice exec vitest run packages/lattice/src/...`); the full-suite invocation `pnpm --filter lattice test` works as documented.

## User Setup Required

None - no external service configuration required. The adapter is a Lattice library function; it accepts `apiKey` as a runtime parameter from the caller; Phase 4 does not wire Anthropic into FSB autopilot (Option B carryforward; that's a later phase after Phase 5 MV3-survivability adapter contract).

## Next Phase Readiness

Plan 04-02 (Gemini full-custom adapter) can immediately proceed -- the pattern established here (full-custom adapter file + co-located .test.ts + private per-adapter usage helpers + single conventional commit with Ref footer) is the template for Gemini's sibling implementation. Gemini's wire shape differs (`v1beta/models/{model}:generateContent` with `contents[].parts[].text` and `safetySettings`), but the file structure + test scaffolding + commit ceremony are identical.

Plan 04-03 (thin wrappers for xAI / OpenRouter / LM Studio) will instead compose around `createOpenAICompatibleProvider` (single-file each ~30-50 lines), but the per-adapter .test.ts pattern + single conventional commit per provider remain.

Plan 04-04 (parity smoke + public surface re-exports) will iterate a 7-provider table including the now-shipped Anthropic factory; that plan adds `createAnthropicProvider` to the re-export block in `lattice/packages/lattice/src/index.ts` (Phase 4 ceremony groups the re-export commit separately).

## Carryforward Notes for Plan 04-04

When Plan 04-04 flips the Anthropic audit-doc row from Blocker to Covered in `lattice/docs/fsb-integration-gaps.md`, the citation SHA is `cf31d82275bc7ee3bfabbcd740ec0a0a68ed1f49` (or short form `cf31d82`). The audit-doc Notes column should reference: "Lattice commit cf31d82 ships full custom adapter at packages/lattice/src/providers/anthropic.ts (161 lines, top-level system field per D-07, 9 vitest cases per D-09)."

## Self-Check: PASSED

- File `lattice/packages/lattice/src/providers/anthropic.ts` exists (161 lines, createAnthropicProvider exported)
- File `lattice/packages/lattice/src/providers/anthropic.test.ts` exists (216 lines, 9 it() cases)
- File `.planning/phases/04-provider-adapter-alignment/04-01-LATTICE-SHA.txt` exists (contains cf31d82 SHA)
- Lattice commit `cf31d82275bc7ee3bfabbcd740ec0a0a68ed1f49` exists on `fsb-integration-experiments` branch
- `Ref: FSB v0.10.0-attempt-2 Phase 4` footer present (grep count = 1)
- `git reflog | grep -c push` returns 0 (D-19 holds)
- All FSB Phase 1+2+3 smokes still PASS (29 + 39 + 72)
- INV-01 = 142/142, INV-04 = 8
- Zero extension/* or mcp/* modifications
- Full Lattice vitest suite 33 files / 356 tests PASS

---
*Phase: 04-provider-adapter-alignment*
*Completed: 2026-05-24*
