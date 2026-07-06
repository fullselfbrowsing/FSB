---
phase: 04-provider-adapter-alignment
plan: 04
subsystem: lattice-providers-public-surface
tags: [public-surface, re-exports, parity-smoke, audit-doc, inv-03, lattice, typescript, vitest, tsdown, dist]

# Dependency graph
requires:
  - phase: 01-lattice-gap-survey-scaffold
    provides: "Lattice file: dep + audit doc identifying 5 Providers rows to close"
  - phase: 04-provider-adapter-alignment
    provides: "Wave 1+2: 5 native provider adapters (cf31d82/7a32b00/09a495e/1cfc13c/40457ff) + 24+19 vitest cases (390 PASS baseline)"
provides:
  - "Public surface re-exports for 5 new factories + 5 option type aliases at lattice/packages/lattice/src/index.ts"
  - "INV-03 parity smoke (7 vitest cases iterating 7 logical providers) at lattice/packages/lattice/src/providers/parity.test.ts"
  - "5 audit-doc Providers rows flipped to Covered with backlink SHAs at lattice/docs/fsb-integration-gaps.md"
  - "Rebuilt dist/index.js + index.d.ts containing all 5 new factories (bare-specifier reachable from FSB)"
  - "Three Lattice commits on fsb-integration-experiments (e5659a8 api / f9c7ef4 parity / f1c943b docs); none pushed per D-19"
affects:
  - "Phase 4 completion: 8 Phase 4 Lattice commits total (5 adapter + 1 api + 1 parity + 1 docs)"
  - "Phase 5 (MV3-survivability adapter contract): can begin without provider-surface blockers"
  - "FSB-side autopilot integration (Phase 5+): all 7 logical providers reachable via bare-specifier import('lattice')"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Alphabetical within-block ordering preserved in public-surface re-export grouping (createAISdkProvider / createAnthropicProvider / createFakeProvider / createGeminiProvider / createLmStudioProvider / createOpenAICompatibleProvider / createOpenAIProvider / createOpenRouterProvider / createXaiProvider)"
    - "Parity-smoke per-provider iteration table (ProviderRow): logical name + expected id + fake body shape + error pattern regex + factory builder closure"
    - "Provider-shape-specific fake body fixtures (OPENAI_COMPAT_BODY / ANTHROPIC_BODY / GEMINI_BODY) -- 3 fixtures cover 7 providers because thin wrappers reuse OpenAI-compat shape"
    - "tsdown clean:true rebuild populates dist/index.js (124.79 kB) + dist/index.d.ts (67.13 kB) with all 5 new factories"
    - "Audit-doc backlink-SHA convention: each row's Notes cell cites 3 commits -- adapter feat SHA + api re-export SHA + parity smoke SHA"

key-files:
  created:
    - "lattice/packages/lattice/src/providers/parity.test.ts (268 lines; INV-03 7-provider parity smoke with 7 vitest cases)"
    - ".planning/phases/04-provider-adapter-alignment/04-04-LATTICE-SHA.txt (3 commit SHA records)"
    - ".planning/phases/04-provider-adapter-alignment/04-04-SUMMARY.md (this file)"
  modified:
    - "lattice/packages/lattice/src/index.ts (+10 lines: 5 factory re-exports + 5 type-only re-exports; alphabetical within block preserved)"
    - "lattice/packages/lattice/dist/index.js (rebuilt via tsdown; contains all 5 new factories grep-confirmed)"
    - "lattice/packages/lattice/dist/index.d.ts (rebuilt; contains 5 new option types)"
    - "lattice/docs/fsb-integration-gaps.md (5 Providers rows lines 46-50 flipped to Covered with backlink SHAs; other rows byte-frozen)"

key-decisions:
  - "Three Lattice commits (one per logical surface) -- mirrors D-18 + Phase 4 Wave 1+2 cadence; each carries Ref: FSB v0.10.0-attempt-2 Phase 4 footer"
  - "5 type-only re-exports (export type { ... }) sibling each factory re-export -- consumer TypeScript code can name the option interface without runtime import overhead (matches existing createCheckpointHook / CheckpointHookOptions pattern at src/index.ts lines 3-9)"
  - "Parity-smoke iteration table covers BOTH new and pre-existing providers (7 total: OpenAI + OpenAI-compat + Anthropic + Gemini + xAI + OpenRouter + LM Studio) -- INV-03 mandates parity across ALL 7 logical providers, not just the 5 net-new ones"
  - "Test 7 (distinct-ids assertion) explicitly resolves CD-02 in the affirmative: parity-smoke iteration is the proof of id-uniqueness; no separate provider-id-consistency test file shipped"
  - "Audit-doc row notes cite 3 backlink SHAs per row (adapter + api + parity) -- maximum traceability without bloat; readers can cd lattice && git log <sha> to verify each citation"
  - "dist/ is gitignored (per Lattice .gitignore convention); rebuild step is local-only -- npm consumers (FSB via file: dep) get the rebuilt artifacts via the symlink at node_modules/lattice/dist/"

patterns-established:
  - "Phase 4 'public-surface integration plan' cadence: insert re-exports in alphabetical-within-group order, run tsdown clean:true to rebuild dist/, run typecheck + bare-specifier probe + per-test vitest + full suite to verify reachability + parity, commit as feat(api): ... with Ref footer"
  - "INV-N parity-smoke pattern: per-provider iteration table + per-fixture body shape + per-provider error pattern + 7 cross-cutting cases covering ProviderAdapter shape + rawOutputs + normalizedUsage + error handling + AbortSignal + rawResponse + distinct-ids"
  - "Audit-doc closure pattern: when N gaps close in one phase, flip N rows from Status=Needs-X to Covered with Notes that cite the relevant phase ID + the N+M backlink SHAs (N adapter commits + M cross-cutting commits)"

requirements-completed:
  - LSDK-14
  - LSDK-15
  - LSDK-16
  - LSDK-17
  - LSDK-18

# Metrics
duration: 4min
completed: 2026-05-24
---

# Phase 4 Plan 04: Public-surface re-exports + INV-03 parity smoke + audit-doc closure Summary

**Phase 4 integration plan that makes Wave 1+2's 5 adapters callable via the public surface (lattice.createAnthropicProvider(...) etc.), ships the substantive INV-03 parity proof (7 vitest cases iterating all 7 logical providers against per-provider fake fetch fixtures), and flips the 5 Providers audit-doc rows from Blocker/Important/Nice-to-have to Covered with backlink SHAs. Lattice suite advances 390 -> 397 PASS / 37 -> 38 test files with no regressions.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-24T23:24:38Z
- **Completed:** 2026-05-24T23:28:34Z
- **Tasks:** 3
- **Files modified:** 3 (Lattice src/index.ts + Lattice dist/* + Lattice docs/fsb-integration-gaps.md)
- **Files created:** 3 (Lattice parity.test.ts + FSB 04-04-LATTICE-SHA.txt + FSB 04-04-SUMMARY.md)

## Accomplishments

- **Task 1 (e5659a8): Public-surface re-exports + dist rebuild.** Modified `lattice/packages/lattice/src/index.ts` to insert 10 new lines (5 factory + 5 option-type re-exports) interleaved with the existing `createFakeProvider` re-export, preserving alphabetical ordering within the providers-grouping block (createAISdkProvider / createAnthropicProvider / createFakeProvider / createGeminiProvider / createLmStudioProvider / createOpenAICompatibleProvider / createOpenAIProvider / createOpenRouterProvider / createXaiProvider). Type-only re-exports follow each factory: AnthropicProviderOptions, GeminiProviderOptions, LmStudioProviderOptions, OpenRouterProviderOptions, XaiProviderOptions. Rebuilt dist/ via `pnpm --filter lattice build` (tsdown clean:true): dist/index.js 124.79 kB, dist/index.d.ts 67.13 kB, all 5 new factories grep-confirmed in the built ESM surface.

- **Task 2 (f9c7ef4): INV-03 parity smoke.** Created `lattice/packages/lattice/src/providers/parity.test.ts` (268 lines, 7 vitest cases). Iterates a 7-row PROVIDERS table covering all 7 logical providers (OpenAI + OpenAI-compat + Anthropic + Gemini + xAI + OpenRouter + LM Studio). Per-provider fake body fixtures use provider-appropriate shapes (OPENAI_COMPAT_BODY for OpenAI/OpenAI-compat/xAI/OpenRouter/LM-Studio; ANTHROPIC_BODY for Anthropic; GEMINI_BODY for Gemini) so each adapter's parser extracts content correctly. 7 cases assert: Test 1 ProviderAdapter shape (kind/id/capabilities/execute typeof), Test 2 rawOutputs.text populated as non-empty string, Test 3 normalizedUsage Phase 7 shape (promptTokens/completionTokens numbers + costUsd null when pricing absent), Test 4 non-OK fetch throws with provider-identifying error pattern, Test 5 AbortSignal propagation via capture.init.signal (D-05 parity), Test 6 rawResponse object preserved, Test 7 distinct provider ids (CD-02 resolved in affirmative). All 7 PASS standalone; full Lattice suite advances 390 -> 397 PASS / 37 -> 38 test files.

- **Task 3 (f1c943b): Audit-doc 5-row flip.** Modified `lattice/docs/fsb-integration-gaps.md` lines 46-50 -- flipped 5 Providers rows from Needs addition/Needs extension/Nice-to-have to Covered. Each row's Notes cell cites 3 backlink SHAs: adapter feat commit + api re-export commit + parity smoke commit. Anthropic row cites cf31d82 + e5659a8 + f9c7ef4; Gemini row cites 7a32b00 + e5659a8 + f9c7ef4; xAI row cites 09a495e + e5659a8 + f9c7ef4; LM Studio row cites 40457ff + e5659a8 + f9c7ef4 with D-16 latency-tail deferral inline; OpenRouter row cites 1cfc13c + e5659a8 + f9c7ef4 with D-17 model-routing deferral inline. Receipts / Tripwires/hooks / Delegation / MV3-survivability / Observability domain rows BYTE-FROZEN; OpenAI-compatible + Custom OpenAI-compatible Providers rows BYTE-FROZEN.

## Task Commits

Three Lattice commits on `fsb-integration-experiments` (NOT pushed; D-19):

| Order | Full SHA | Subject |
|-------|----------|---------|
| 1 | `e5659a8034a6b8a6b3c0e36c43e2894e2a1231b4` | `feat(api): re-export 5 new provider factories from public surface` |
| 2 | `f9c7ef4186667c00835aec11ea798bb5a589c29b` | `test(providers): add INV-03 parity smoke covering 7 logical providers` |
| 3 | `f1c943bd9398daeda2ccf92a3d0c2bc004a0379f` | `docs(fsb-integration): close Phase 4 audit rows (providers)` |

All three carry `Ref: FSB v0.10.0-attempt-2 Phase 4` footer (D-18). Cumulative Phase 4 Ref-footer count = 8 (5 adapter + 1 api + 1 parity + 1 docs).

**Lattice HEAD post Plan 04-04:** `f1c943bd9398daeda2ccf92a3d0c2bc004a0379f` (recorded in `.planning/phases/04-provider-adapter-alignment/04-04-LATTICE-SHA.txt`).

**Plan metadata:** to be committed in FSB final-commit step (SUMMARY + STATE + ROADMAP + REQUIREMENTS + LATTICE-SHA.txt).

## Files Created/Modified

### Lattice (3 commits on fsb-integration-experiments)
- `lattice/packages/lattice/src/index.ts` (modified, +10 lines: 5 factory + 5 type-only re-exports inserted alphabetically into the providers-grouping block)
- `lattice/packages/lattice/dist/index.js` (rebuilt via tsdown clean:true; 124.79 kB; contains all 5 new factories grep-confirmed count = 6 mentions because createOpenRouterProvider appears once in body + once in export statement)
- `lattice/packages/lattice/dist/index.d.ts` (rebuilt; 67.13 kB; contains all 5 new option-type aliases)
- `lattice/packages/lattice/src/providers/parity.test.ts` (created, 268 lines, 7 vitest cases iterating all 7 logical providers; INV-03 parity proof)
- `lattice/docs/fsb-integration-gaps.md` (modified, 5 row flips lines 46-50; 10 lines changed -- 5 deleted + 5 inserted; other 25 rows byte-frozen)

### FSB (to be committed in final-commit step)
- `.planning/phases/04-provider-adapter-alignment/04-04-LATTICE-SHA.txt` (created, 3 lines: 3 Phase 4 Plan 04-04 Lattice commit SHA records)
- `.planning/phases/04-provider-adapter-alignment/04-04-SUMMARY.md` (this file)

### Verification command outputs

```
=== 1. Lattice HEAD verified ===
$ cd lattice && git rev-parse fsb-integration-experiments
f1c943bd9398daeda2ccf92a3d0c2bc004a0379f

$ cd lattice && git log fsb-integration-experiments --oneline 7afd62fc..HEAD --format="%h %s"
f1c943b docs(fsb-integration): close Phase 4 audit rows (providers)
f9c7ef4 test(providers): add INV-03 parity smoke covering 7 logical providers
e5659a8 feat(api): re-export 5 new provider factories from public surface
40457ff feat(providers): add LM Studio provider adapter
1cfc13c feat(providers): add OpenRouter provider adapter
09a495e feat(providers): add xAI provider adapter
7a32b00 feat(providers): add Gemini provider adapter
cf31d82 feat(providers): add Anthropic provider adapter

=== 2. src/index.ts has all 5 new factory + 5 type re-exports ===
$ grep -cE "createAnthropicProvider|createGeminiProvider|createXaiProvider|createOpenRouterProvider|createLmStudioProvider" lattice/packages/lattice/src/index.ts
5

$ grep -cE "AnthropicProviderOptions|GeminiProviderOptions|XaiProviderOptions|OpenRouterProviderOptions|LmStudioProviderOptions" lattice/packages/lattice/src/index.ts
5

=== 3. dist/ contains all 5 new factories (built surface reachable) ===
$ grep -cE "createAnthropicProvider|createGeminiProvider|createXaiProvider|createOpenRouterProvider|createLmStudioProvider" lattice/packages/lattice/dist/index.js
6 (5 unique factories; one appears twice due to body + export ref)

=== 4. Bare-specifier probe from FSB root ===
$ node -e "import('lattice').then(l => console.log(JSON.stringify({ anthropic: typeof l.createAnthropicProvider, gemini: typeof l.createGeminiProvider, xai: typeof l.createXaiProvider, openrouter: typeof l.createOpenRouterProvider, lmStudio: typeof l.createLmStudioProvider }, null, 2)))"
{
  "anthropic": "function",
  "gemini": "function",
  "xai": "function",
  "openrouter": "function",
  "lmStudio": "function"
}

=== 5. Parity smoke standalone ===
$ cd lattice/packages/lattice && pnpm exec vitest run src/providers/parity.test.ts
Test Files  1 passed (1)
     Tests  7 passed (7)
  Duration  167ms

=== 6. Full Lattice suite green ===
$ cd lattice && pnpm --filter lattice test
Test Files  38 passed (38)
     Tests  397 passed (397)
[347 Phase 3 baseline + 9 Anthropic + 10 Gemini + 9 xAI + 7 OpenRouter + 8 LM Studio + 7 parity = 397 PASS]

=== 7. TypeScript clean ===
$ cd lattice && pnpm --filter lattice exec tsc --noEmit
(exit 0, no output)

=== 8. Audit-doc 5 row flips ===
$ grep -c "Phase 4 (FSB v0.10.0-attempt-2) added" lattice/docs/fsb-integration-gaps.md
5

$ grep -cE "Lattice commits \`[a-f0-9]{7}" lattice/docs/fsb-integration-gaps.md
6 (5 Phase 4 row flips + 1 pre-existing Phase 3 row at line 82)

$ grep -c "Covered" lattice/docs/fsb-integration-gaps.md
25 (15 prior + 5 new Phase 4 flips + 5 already-covered table cells)

=== 9. 8 Phase 4 Lattice commits with Ref footer ===
$ cd lattice && git log fsb-integration-experiments --format=%B 7afd62fc..HEAD | grep -c "Ref: FSB v0.10.0-attempt-2 Phase 4"
8

=== 10. No push (D-19) ===
$ cd lattice && git reflog -10 | grep -c push
0

=== 11. No FSB-side modifications since pivot baseline 51bdbb36 ===
$ git diff --name-only 51bdbb36 HEAD -- "extension/*" "mcp/*"
(empty)

=== 12. INV-01, INV-04, Phase 1+2+3 smokes byte-frozen ===
$ node tests/tool-definitions-parity.test.js | tail -1
=== Results: 142 passed, 0 failed ===

$ grep -c "setTimeout" extension/ai/agent-loop.js
8

$ node tests/lattice-smoke.test.js | grep -E "passed:|failed:"
passed: 29
failed: 0

$ node tests/lattice-tripwire-smoke.test.js | grep -E "passed:|failed:"
passed: 39
failed: 0

$ node tests/lattice-checkpoint-smoke.test.js | grep -E "passed:|failed:"
passed: 72
failed: 0

=== 13. Phase 1+2+3 Lattice source files byte-frozen ===
$ cd lattice && git log fsb-integration-experiments --format="%H" -- packages/lattice/src/contract/bands.ts | head -1
ba6172c2792e13b413971847e34cd25623bae0f7 (Phase 2 commit; unchanged in Phase 4)

$ cd lattice && git log fsb-integration-experiments --format="%H" -- packages/lattice/src/contract/checkpoint.ts | head -1
a67f476b433704eabd75eb657af25b89dc79afda (Phase 3 commit; unchanged in Phase 4)

$ cd lattice && git log fsb-integration-experiments --format="%H" -- packages/lattice/src/tracing/tracing.ts | head -1
fd254c42c25df882333cc4ee2ffcdccbc0f61413 (Phase 3 commit; unchanged in Phase 4)
```

All gates green: TypeScript clean, Lattice suite 397/397 PASS, three Lattice commits with Ref footer (8 total Phase 4), zero pushes, zero extension/mcp modifications, all 3 phase smokes (29 + 39 + 72) byte-frozen, INV-01 (142/142) preserved, INV-04 (setTimeout = 8) preserved, all Phase 1+2+3 source files byte-frozen.

### Vitest case names + count (parity.test.ts)

7 cases (CONTEXT.md D-12 mandates per-provider iteration; ships 7 cross-cutting cases):

1. `Test 1 (INV-03): all 7 logical providers expose ProviderAdapter shape`
2. `Test 2 (INV-03): each provider populates rawOutputs[name] as string content`
3. `Test 3 (INV-03): each provider produces normalizedUsage with Phase 7 shape`
4. `Test 4 (INV-03): each provider throws on non-OK fetch with provider-identifying message`
5. `Test 5 (INV-03 + D-05): each provider wires request.signal into fetch`
6. `Test 6 (INV-03): each provider returns rawResponse (the original parsed body)`
7. `Test 7 (CD-02 covered): all 7 adapters claim distinct ids`

Each case iterates the full PROVIDERS table (7 rows) -- effective per-case assertion count is 7 x 5 = 35 individual assertions for cases that check 5 sub-fields, etc. vitest reports 7 it() cases passing; the iteration-table pattern keeps the parity proof DRY without sacrificing per-provider failure attribution (assertion messages embed `${row.logicalName}`).

## Decisions Made

- **Three Lattice commits structured per-logical-surface.** Each commit groups one cohesive change: Task 1 = re-exports; Task 2 = parity smoke; Task 3 = audit-doc closure. Mirrors D-18 + Phase 4 Wave 1+2 pattern (one commit per logical surface).
- **Alphabetical-within-block ordering for new re-exports.** Inserted 5 factory + 5 type-only re-exports into the existing providers-grouping block (lines 27-32 of pre-Plan-04-04 src/index.ts). New entries: createAnthropicProvider, createGeminiProvider, createLmStudioProvider, createOpenRouterProvider, createXaiProvider. After insertion the block reads alphabetically: createAISdkProvider / createOpenAICompatibleProvider / createOpenAIProvider (existing) interleaved with createAnthropicProvider / createFakeProvider (existing) / createGeminiProvider / createLmStudioProvider / createOpenRouterProvider / createXaiProvider. Matches existing checkpoint hook pattern at src/index.ts:3-9 where factory + type-only co-locate.
- **Parity-smoke iteration table covers BOTH new and pre-existing providers.** INV-03 mandates parity across all 7 logical providers, not just the 5 net-new ones. Iteration table includes OpenAI + OpenAI-compat alongside the 5 Wave 1+2 adapters; future regressions in either pre-existing factory would be caught by this smoke.
- **Test 7 distinct-ids assertion resolves CD-02 in the affirmative.** CD-02 from CONTEXT.md asked "Whether to add a Lattice-side test file for provider-id consistency." Resolved by including Test 7 inside parity.test.ts; no separate provider-id-consistency test file shipped.
- **Audit-doc row notes cite 3 backlink SHAs per row.** Pattern: adapter SHA + api re-export SHA (e5659a8) + parity smoke SHA (f9c7ef4). The api + parity SHAs are identical across all 5 rows (shared infrastructure); only the adapter SHA varies row-by-row. Readers can `cd lattice && git log <sha>` for each citation.

## Threat Model Mitigations Applied

- **T-04-04-01 (Tampering: Audit-doc row drift):** Mitigated -- each Notes cell pins 3 short SHAs cross-verifiable via `cd lattice && git log <sha>`. Grep count of `Lattice commits \`[a-f0-9]{7}` returned 6 (5 Phase 4 + 1 pre-existing Phase 3 row). All 5 Phase 4 row flips include the backlink SHAs verbatim.
- **T-04-04-02 (Spoofing: Public surface re-export collision):** Mitigated -- TypeScript strict mode (exactOptionalPropertyTypes per Lattice tsconfig) prevents duplicate-export compile errors. `pnpm --filter lattice exec tsc --noEmit` exits 0. CD-02 parity smoke Test 7 asserts distinct ids at runtime (7 ids in a Set; size === 7).
- **T-04-04-03 (Information disclosure: dist/ rebuild includes private comments):** Disposition = accept. dist/ is built output of public source; tsdown does not strip JSDoc but Lattice JSDoc contains no secrets (apiKey is a runtime parameter, not a hardcoded value). Source-side documentation that DOES leak to the consumer build is by design.
- **T-04-04-04 (Repudiation: Lattice commit Ref footer forgotten):** Mitigated -- `git log fsb-integration-experiments --format=%B 7afd62fc..HEAD | grep -c "Ref: FSB v0.10.0-attempt-2 Phase 4"` returns 8 (5 adapter + 1 api + 1 parity + 1 docs); cumulative Phase 4 cover.
- **T-04-04-05 (Tampering: Frozen baseline drift):** Mitigated -- Phase 1+2+3 source files in receipts/, contract/, tracing/ verified unchanged via git log lookup (bands.ts last touched at ba6172c, checkpoint.ts at a67f476, tracing.ts at fd254c4 -- all Phase 2/3 commits). Audit-doc rows in other domains (Receipts, Tripwires/hooks, Delegation, MV3-survivability, Observability) preserved byte-for-byte; only Providers rows 46-50 modified.
- **T-04-04-06 (Tampering: Accidental FSB extension/* edit):** Mitigated -- `git diff --name-only 51bdbb36 HEAD -- "extension/*" "mcp/*"` returns empty.
- **T-04-04-07 (DoS: INV-03 parity smoke iteration timeout):** Disposition = accept. 7-provider iteration uses fake fetch (no network); vitest reports 167ms for the parity.test.ts file alone -- well under vitest's default 5s timeout.

## Deviations from Plan

None - plan executed exactly as written. The action body in Task 1 specified the exact 10-line insertion into src/index.ts; the action body in Task 2 specified the full 268-line parity.test.ts content verbatim; the action body in Task 3 specified the exact text for each of the 5 row replacements. All three commits used the exact commit message bodies specified in the plan.

The plan's Task 3 expected `cd lattice && pnpm --filter lattice test 2>&1 | grep -E "Tests +[0-9]+ passed"` to show ">= 396 passed" (347 baseline + 42 Wave 1+2 + 7 parity). Actual count is 397 PASS -- one over the expected 396 because Plan 04-03's xai.test.ts ships 9 vitest cases instead of the planner-predicted 8 (Plan 04-03 SUMMARY deviation #3 documents this). Additive only, no regressions.

## Issues Encountered

None. All three tasks executed cleanly. Pre-existing untracked `.planning/STATE.md` modification inside the Lattice clone (from Plan 01-02-era unstaged edit) carried over from prior plans; not staged in any Plan 04-04 commit (per CLAUDE.md rule: stage task-related files individually, never `git add .` / `git add -A`).

## User Setup Required

None - Phase 4 ships Lattice-side library functions only; FSB autopilot continues to route through `extension/ai/universal-provider.js` (Option B carryforward; D-01 from Phase 1 CONTEXT). The 5 new Lattice factories are reachable via bare-specifier import('lattice') from any Node consumer that depends on `lattice@file:./lattice/packages/lattice`.

## Next Phase Readiness

Plan 04-05 (FSB-side surface-presence smoke + ceremony) can immediately proceed -- the 5 new factories + their types are reachable via the public surface (bare-specifier probe confirmed function-type for all 5). Plan 04-05 will:

1. **Create `tests/lattice-providers-smoke.test.js`** -- thin FSB-side smoke (~10 PASS) asserting each new factory is callable with stub options and returns an adapter with expected kind/id (CONTEXT.md D-13).
2. **Append to `package.json` `scripts.test`** -- new smoke entry immediately after `tests/lattice-checkpoint-smoke.test.js` (CONTEXT.md D-14; Phase 1+2+3 smokes byte-frozen).
3. **Bump `.planning/LATTICE-PIN.md`** -- record new HEAD SHA `f1c943bd9398daeda2ccf92a3d0c2bc004a0379f` + add Phase 4 row referencing all 8 Phase 4 Lattice commits (CONTEXT.md D-20).
4. **Populate `.planning/REQUIREMENTS.md` LSDK-14..18** -- 5 requirement rows with backlinks to the 5 adapter SHAs + 1 api re-export SHA + 1 parity smoke SHA (CONTEXT.md D-21).

## Carryforward Notes for Plan 04-05

When Plan 04-05 writes the FSB-side surface-presence smoke at `tests/lattice-providers-smoke.test.js`:
- **5 factories to assert reachable:** createAnthropicProvider, createGeminiProvider, createXaiProvider, createOpenRouterProvider, createLmStudioProvider
- **Expected adapter ids per factory:** anthropic, gemini, xai, openrouter, lm-studio (verified via parity.test.ts Test 1)
- **Stub options pattern:** the 5 factories require `{ model, apiKey, fetch? }`; the FSB-side smoke can pass stub strings since the smoke does NOT execute() -- it only verifies the factory returns an adapter with expected kind + id
- **LM Studio is no-auth by convention:** `createLmStudioProvider` accepts options WITHOUT apiKey (CD-03 + Plan 04-03 SUMMARY)
- **Lattice HEAD to pin in LATTICE-PIN.md:** `f1c943bd9398daeda2ccf92a3d0c2bc004a0379f`
- **LSDK-14..18 requirement backlinks:**
  - LSDK-14 Anthropic -> commits `cf31d82` (adapter) + `e5659a8` (api) + `f9c7ef4` (parity)
  - LSDK-15 Gemini -> commits `7a32b00` (adapter) + `e5659a8` (api) + `f9c7ef4` (parity)
  - LSDK-16 xAI -> commits `09a495e` (adapter) + `e5659a8` (api) + `f9c7ef4` (parity)
  - LSDK-17 OpenRouter -> commits `1cfc13c` (adapter) + `e5659a8` (api) + `f9c7ef4` (parity)
  - LSDK-18 LM Studio -> commits `40457ff` (adapter) + `e5659a8` (api) + `f9c7ef4` (parity)

## Threat Flags

None. Plan 04-04 introduces no new trust boundaries beyond those inherited from Phase 4 Wave 1+2 (file-level boundaries on adapter source -> dist build step; audit-doc row authentication via cross-verifiable short SHAs; parity smoke fake fetch fixtures static). The re-exports add only new names to the public surface; the parity smoke iterates existing factories; the audit-doc updates pin existing commit SHAs.

## Self-Check: PASSED

- File `lattice/packages/lattice/src/providers/parity.test.ts` exists (268 lines, 7 it() cases iterating PROVIDERS table)
- File `lattice/packages/lattice/src/index.ts` modified (+10 lines: 5 factory + 5 type-only re-exports)
- File `lattice/packages/lattice/dist/index.js` rebuilt (124.79 kB; grep count = 6 for the 5 new factories)
- File `lattice/packages/lattice/dist/index.d.ts` rebuilt (67.13 kB; all 5 option types present)
- File `lattice/docs/fsb-integration-gaps.md` modified (5 row flips lines 46-50; other rows byte-frozen)
- File `.planning/phases/04-provider-adapter-alignment/04-04-LATTICE-SHA.txt` exists (3 commit SHA records)
- Lattice commit `e5659a8034a6b8a6b3c0e36c43e2894e2a1231b4` FOUND on fsb-integration-experiments
- Lattice commit `f9c7ef4186667c00835aec11ea798bb5a589c29b` FOUND on fsb-integration-experiments
- Lattice commit `f1c943bd9398daeda2ccf92a3d0c2bc004a0379f` FOUND on fsb-integration-experiments
- All 3 Plan 04-04 commits carry `Ref: FSB v0.10.0-attempt-2 Phase 4` footer
- Cumulative Phase 4 Ref-footer count = 8 (5 adapter + 1 api + 1 parity + 1 docs)
- `cd lattice && git reflog | grep -c push` returns 0 (D-19 holds)
- All FSB Phase 1+2+3 smokes still PASS (29 + 39 + 72)
- INV-01 = 142/142, INV-04 = setTimeout count = 8
- Zero extension/* or mcp/* modifications since pivot baseline 51bdbb36
- Full Lattice vitest suite 38 files / 397 tests PASS (was 37/390 + 1 file/7 cases = 38/397)
- Bare-specifier probe from FSB root returns function-type for all 5 new factories

---
*Phase: 04-provider-adapter-alignment*
*Completed: 2026-05-24*
