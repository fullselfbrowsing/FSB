---
phase: 03-observability-step-markers-extension
plan: 02
subsystem: lattice-observability

tags: [lattice, public-surface, re-export, tsdown, dist-rebuild, audit-doc, fsb-integration-gaps, observability-band, file-dep]

requires:
  - phase: 03-observability-step-markers-extension
    provides: "Lattice clone at fsb-integration-experiments HEAD a67f476 (Plan 03-01 final); createCheckpointHook factory + STEP_TRANSITION_EVENT_NAME + DEFAULT_CHECKPOINT_BAND + CheckpointHookContext + CheckpointHookOptions exports inside ./contract/checkpoint.ts; tracing.ts RunEventKind includes step.transition literal"
provides:
  - "Lattice public bare-specifier surface (`src/index.ts`) re-exports createCheckpointHook + STEP_TRANSITION_EVENT_NAME + DEFAULT_CHECKPOINT_BAND + type CheckpointHookContext + type CheckpointHookOptions"
  - "dist/index.js + dist/index.d.ts rebuilt via tsdown clean:true; FSB-side `file:` dep sees the new surface without dep refresh"
  - "lattice/docs/fsb-integration-gaps.md Observability/step-markers Blocker rows (2) flipped from Needs addition -> Covered with backlink SHAs to Plan 03-01's tracing commit (fd254c4) + Plan 03-01's checkpoint factory commit (a67f476) + Plan 03-02's re-export commit (acdbb8a)"
  - "Two Lattice commits on fsb-integration-experiments (not pushed -- D-15/D-17): acdbb8a (re-export) + 7afd62f (audit-doc flip)"
  - ".planning/phases/03-observability-step-markers-extension/03-02-LATTICE-SHA.txt capturing the new Lattice HEAD 7afd62f"
affects: [03-03, phase-04-provider-adapters, phase-05-mv3-survivability, sidepanel-ui-inspector-future-phase]

tech-stack:
  added: []
  patterns:
    - "Flat public re-export at src/index.ts (Phase 1 + Phase 2 + Phase 3 convention): one export line per sibling-module; alphabetical by source-path; type-only exports tagged with `type` keyword"
    - "Audit-doc row-flip with backlink SHAs (Phase 2 precedent): Status `Needs addition` -> `Covered`, Severity `Blocker` -> `n/a`, Notes append backlink commit SHA(s) so the cross-repo audit trail stays mechanically navigable"
    - "Local-only dist rebuild for `file:` dep: dist/ is gitignored in Lattice but the FSB symlink resolves through it; commit-time staging excludes dist/"

key-files:
  created:
    - ".planning/phases/03-observability-step-markers-extension/03-02-LATTICE-SHA.txt (Lattice HEAD 7afd62fc595bedc5ad9d4576d2d679cf50c68fd8 post-Plan-03-02)"
  modified:
    - "lattice/packages/lattice/src/index.ts (one new export block: 6 lines added immediately after the ./contract/bands.js re-export; preserves alphabetical-by-source-path ordering)"
    - "lattice/docs/fsb-integration-gaps.md (2 Observability Blocker table rows flipped to Covered with backlink SHAs)"

key-decisions:
  - "D-01 / D-16 from Plan 03-01 carried forward: two Lattice commits on fsb-integration-experiments, no push, both with `Ref: FSB v0.10.0-attempt-2 Phase 3` footer"
  - "Re-export block placement: immediately after ./contract/bands.js (line 2) and before ./contract/contract.js (line 10), preserving alphabetical-by-source-path ordering"
  - "Re-export style: `type CheckpointHookContext` + `type CheckpointHookOptions` tagged as type-only (honors verbatimModuleSyntax / mirrors Phase 2's HookPipeline + HookLifecycleEvent precedent); `createCheckpointHook` re-exported as value (function); `DEFAULT_CHECKPOINT_BAND` + `STEP_TRANSITION_EVENT_NAME` re-exported as values (constants)"
  - "dist/ NOT committed (Lattice's .gitignore excludes dist/; FSB-side file: dep resolves through the locally-rebuilt symlink). Phase 2's 00fcfac re-export commit set this precedent: only src/index.ts in the commit"
  - "Audit-doc row count flipped: exactly 2 Blocker rows (lines 81-82 pre-edit), not 3. The `<canonical_refs>` note in CONTEXT.md `<domain>` mentioning '3 audit-doc Blocker rows' was inclusive of the recovery/eviction-resume Important row, but that row is Phase 5 territory (MV3-survivability adapter). Plan 03-02 closes only the 2 Phase-3-relevant Blocker rows; recovery/eviction-resume + OpenTelemetry deferred per CONTEXT.md `<deferred>`. Plan PLAN.md `<interfaces>` block explicitly anticipated this resolution"
  - "Plan instruction `git add packages/lattice/dist/` adjusted: dist/ is gitignored in Lattice, so only src/index.ts staged. Phase 2's 00fcfac precedent confirms (1 file changed, 1 insertion)"

patterns-established:
  - "Phase 3 public-surface re-export pattern: one new `export { ... } from './contract/SIBLING.js'` block per new sibling-module; placement alphabetical by source-path; tsdown rebuild propagates to dist/ which the FSB symlink consumes"
  - "Cross-repo audit-doc cross-link: when a Lattice commit closes an audit-doc row, the Notes column gets the commit SHA appended. Multi-commit closures cite multiple SHAs (e.g., the Inspector envelope row cites both the factory commit and the re-export commit)"
  - "Plan deviation from `git add dist/`: documented as Rule 1 bug-fix (dist/ gitignored prevents adding). Single-line documentation in the commit body 'dist/ rebuilt via tsdown clean:true' + the SUMMARY decisions block; this preserves the audit trail while routing around the planning-time error"

requirements-completed: [LSDK-09, LSDK-10]

duration: ~3min 25sec
completed: 2026-05-24
---

# Phase 3 Plan 03-02: Lattice public-surface re-export + audit-doc closure Summary

**Extended Lattice's flat bare-specifier surface at `packages/lattice/src/index.ts` with the Phase 3 checkpoint primitives (createCheckpointHook + STEP_TRANSITION_EVENT_NAME + DEFAULT_CHECKPOINT_BAND + the two type exports), rebuilt dist/ via tsdown so the FSB `file:` dep sees the new symbols, and closed the two remaining Observability/step-markers Blocker rows in `lattice/docs/fsb-integration-gaps.md` with backlink SHAs to all three relevant Phase 3 Lattice commits -- two new Lattice commits not pushed, full Phase 2 byte-frozen baseline preserved, Lattice suite holding at 347 PASS / 0 FAIL.**

## Performance

- **Duration:** ~3min 25sec
- **Started:** 2026-05-24T20:24:24Z
- **Completed:** 2026-05-24T20:27:49Z
- **Tasks:** 2 (Task 1 index.ts re-export + dist rebuild; Task 2 audit-doc row flip)
- **Files modified (Lattice):** 2 (src/index.ts + 7 inserted lines, docs/fsb-integration-gaps.md + 2 changed table rows)
- **Files created (FSB):** 1 (.planning/.../03-02-LATTICE-SHA.txt, .planning gitignored)
- **Lattice commits:** 2 on fsb-integration-experiments (acdbb8a + 7afd62f; not pushed)
- **Vitest delta:** 347 PASS -> 347 PASS (no test additions; re-export is value-passthrough)

## Accomplishments

- **src/index.ts re-export:** New 6-line export block inserted at line 3-9 (between the ./contract/bands.js line and the ./contract/contract.js line), preserving alphabetical-by-source-path ordering. Block exposes `createCheckpointHook` (function), `DEFAULT_CHECKPOINT_BAND` (constant, value `1` = BAND.OBSERVABILITY), `STEP_TRANSITION_EVENT_NAME` (constant, value `"step.transition"`), `CheckpointHookContext` (type-only re-export), `CheckpointHookOptions` (type-only re-export). FSB-side bare-specifier probe `import('lattice').then(l => ...)` resolves all three runtime symbols correctly (createCheckpointHook=function, STEP_TRANSITION_EVENT_NAME="step.transition", DEFAULT_CHECKPOINT_BAND=1).
- **dist/ rebuild:** `pnpm --filter lattice build` ran `tsdown` with `clean: true`, regenerated dist/index.js (115.63 kB) + dist/index.d.ts (59.32 kB) + sourcemaps. Build duration 564 ms. `grep -c "createCheckpointHook" dist/index.js` = 2, `grep -c "CheckpointHookOptions" dist/index.d.ts` = 3. dist/ is gitignored so the rebuild is not committed; the FSB symlink at node_modules/lattice resolves through the freshly-rebuilt dist/ on the next import.
- **Audit-doc row 1 flip (line 81):** "step.transition event kind + step.* sub-events (start/complete)" -- Status `Needs addition` -> `Covered`, Severity `Blocker` -> `n/a`, Notes column rewritten to cite the `"step.transition"` literal addition in tracing.ts (Lattice commit `fd254c4`).
- **Audit-doc row 2 flip (line 82):** "Inspector envelope shape that Lattice can sign as a Capability Receipt directly" -- Status `Needs addition` -> `Covered`, Severity `Blocker` -> `n/a`, Notes column rewritten to cite the `createCheckpointHook` factory in checkpoint.ts (Lattice commit `a67f476`) AND the public-surface re-export (Lattice commit `acdbb8a`).
- **Recovery/eviction-resume row preserved (line 83):** still `Needs addition` / `Important` -- this is Phase 5 territory (MV3-survivability adapter), correctly NOT flipped.
- **OpenTelemetry row preserved (line 84):** still `Nice-to-have` / `n/a` -- deferred indefinitely.
- **Phase 2 audit-doc baseline preserved:** `grep -c "Phase 2"` returns 10 (>= 7 required), confirming the 6 Phase 2 Covered rows in Receipts + Tripwires/hooks + the lifecycle-event row are all untouched. Only Observability rows mutated.
- **Phase 2 byte-frozen surface fully preserved:** `git diff 97836f2..HEAD` against bands.ts, tripwire.ts, canonical.ts, redact.ts, receipts/{types,sign,keyset,envelope}.ts, runtime/create-ai.ts returns empty (zero modifications across all 9 byte-frozen files). The only Phase 3 modifications across both Plan 03-01 and Plan 03-02 are: tracing.ts (+1 literal), contract/checkpoint.ts (new), contract/checkpoint.test.ts (new), src/index.ts (+7 lines), docs/fsb-integration-gaps.md (2 rows changed).
- **D-16 / D-17 / D-15 ceremony observed:** Both new Phase 3 commits carry the `Ref: FSB v0.10.0-attempt-2 Phase 3` footer; cumulative Phase 3 footer count = 4 (Plan 03-01's two + Plan 03-02's two). `git reflog -10 | grep -c push` = 0 -- no push to Lattice's remote.
- **FSB side untouched:** `git status --porcelain` filtered to `extension/`, `mcp/`, `tests/`, `package.json` returns zero matches. INV-01 142 PASS, INV-04 setTimeout count = 8. Phase 1 smoke 29 PASS, Phase 2 smoke 39 PASS -- all baselines preserved end-to-end.

## Task Commits

Lattice-side, on `fsb-integration-experiments` branch (not pushed; D-15/D-17):

1. **Task 1: Re-export createCheckpointHook from Lattice public surface (LSDK-09 / LSDK-10)** -- `acdbb8a` (feat)
   - Subject: `feat(api): re-export createCheckpointHook + checkpoint types from public surface`
   - Files: `packages/lattice/src/index.ts` (1 file changed, 7 insertions)
   - dist/ rebuilt locally via tsdown clean:true (not committed -- dist/ gitignored)
2. **Task 2: Flip Observability/step-markers audit-doc rows to Covered (LSDK-09 / LSDK-10)** -- `7afd62f` (docs)
   - Subject: `docs(fsb-integration): close Phase 3 audit rows (observability/step-markers)`
   - Files: `lattice/docs/fsb-integration-gaps.md` (1 file changed, 2 insertions, 2 deletions)

FSB-side: no per-task commits during execution. The SUMMARY metadata commit (this file + STATE.md + ROADMAP.md updates + 03-02-LATTICE-SHA.txt) lands after self-check.

## Cumulative Phase 3 Lattice Commits (Plan 03-01 + Plan 03-02)

Four Lattice commits between Phase 2 final (`97836f2`) and Phase 3 Plan 03-02 final (`7afd62f`), all on `fsb-integration-experiments`, all with `Ref: FSB v0.10.0-attempt-2 Phase 3` footer, none pushed:

1. `fd254c4` feat(tracing): add step.transition event kind to RunEventKind
2. `a67f476` feat(contract): add createCheckpointHook factory + per-step receipt mint
3. `acdbb8a` feat(api): re-export createCheckpointHook + checkpoint types from public surface
4. `7afd62f` docs(fsb-integration): close Phase 3 audit rows (observability/step-markers)

## Audit-Doc Observability Section (Post-Flip)

```
## Observability/step-markers

Surface inventory: lattice/packages/lattice/src/tracing/tracing.ts. RunEventKind union: ... NO `step.start` / `step.transition` / `step.complete`. NO `stepName` / `stepIndex` / `parentStepName` fields. ...

| Domain | Gap | Status | Severity | Notes |
|--------|-----|--------|----------|-------|
| Observability | TracerLike interface + createRunEvent factory | Covered | n/a | v1.1 ships this. |
| Observability | step.transition event kind + step.* sub-events (start/complete) | Covered | n/a | Phase 3 ... Lattice commit `fd254c4`. |
| Observability | Inspector envelope shape that Lattice can sign as a Capability Receipt directly | Covered | n/a | Phase 3 ... Lattice commits `a67f476` (factory + tests) + `acdbb8a` (public surface re-export). |
| Observability | recovery / eviction-resume markers in the tracing union | Needs addition | Important | Paired with the MV3-survivability adapter. |
| Observability | OpenTelemetry exporter | Nice-to-have | n/a | Not on FSB's autopilot critical path; defer to a later phase. |
```

(Surface-inventory paragraph above the table is byte-unchanged. Only the 2 Blocker table rows changed Status + Severity + Notes columns; row labels preserved.)

## Files Created/Modified

### Lattice (committed as acdbb8a + 7afd62f on fsb-integration-experiments)

- `lattice/packages/lattice/src/index.ts` -- new 6-line export block inserted at lines 3-9 (between `./contract/bands.js` and `./contract/contract.js`), exposing `DEFAULT_CHECKPOINT_BAND`, `STEP_TRANSITION_EVENT_NAME`, `createCheckpointHook`, `type CheckpointHookContext`, `type CheckpointHookOptions`. All other lines unchanged.
- `lattice/docs/fsb-integration-gaps.md` -- 2 Observability table rows mutated:
  - Line 81 ("step.transition event kind" row): Status / Severity / Notes columns rewritten.
  - Line 82 ("Inspector envelope shape" row): Status / Severity / Notes columns rewritten.
  - Lines 80, 83, 84 + all other rows in the file unchanged.

### Lattice (NOT committed -- dist/ gitignored, rebuilt locally only)

- `lattice/packages/lattice/dist/index.js` -- regenerated by tsdown (115.63 kB; contains createCheckpointHook references).
- `lattice/packages/lattice/dist/index.d.ts` -- regenerated by tsdown (59.32 kB; contains CheckpointHookOptions + CheckpointHookContext type exports).
- `lattice/packages/lattice/dist/index.js.map` + `dist/index.d.ts.map` -- sourcemaps regenerated.

### FSB (.planning gitignored; metadata commit lands separately)

- `.planning/phases/03-observability-step-markers-extension/03-02-LATTICE-SHA.txt` -- contains `7afd62fc595bedc5ad9d4576d2d679cf50c68fd8` (the new Lattice HEAD for Plan 03-03 / LATTICE-PIN.md bump reference).

## Decisions Made

All decisions match the plan's `<decisions>` block verbatim. Notable execution-time choices:

- **Two Lattice commits, one per logical surface** -- D-16 from Plan 03-01 + the Phase 2 precedent (00fcfac for re-export, 97836f2 for audit-doc flip) -- one commit each. The plan also enumerated this as the expected shape ("feat(api): ..." + "docs(fsb-integration): ...").
- **dist/ NOT staged** -- the plan instruction `git add packages/lattice/dist/` was based on an assumption that dist/ is tracked. Verification at execute time: `git check-ignore -v packages/lattice/dist/index.js` returns `.gitignore:2:dist/` -- dist/ is gitignored in Lattice. Phase 2's 00fcfac commit (the precedent Phase 2 re-export commit) also only includes `packages/lattice/src/index.ts` (1 file, 1 insertion). The FSB-side `file:` dep at node_modules/lattice resolves through the locally-rebuilt dist/ via symlink; no commit needed for FSB consumption.
- **2 Blocker rows flipped, not 3** -- the CONTEXT.md `<domain>` note mentioning "3 audit-doc Blocker rows" was over-counted by 1. The actual count of Observability Blocker rows in `lattice/docs/fsb-integration-gaps.md` at execute time is 2 (lines 81-82 pre-edit). The "recovery / eviction-resume markers" row at line 83 is `Needs addition` + `Important` (NOT a Blocker) and is Phase 5 territory; Plan 03-02 correctly leaves it untouched. Plan PLAN.md `<interfaces>` block explicitly anticipated this resolution.
- **type-only exports for CheckpointHookContext + CheckpointHookOptions** -- chose to tag them with the `type` keyword (matches Phase 2's `type HookPipeline, type HookLifecycleEvent` precedent at line 2 of index.ts). Honors `verbatimModuleSyntax` if Lattice's tsconfig enables it. typecheck (`pnpm --filter lattice typecheck`) exits 0 confirming the choice is type-safe.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adjusted `git add` to exclude gitignored dist/**
- **Found during:** Task 1 Step F (commit on Lattice side)
- **Issue:** Plan literal `git add packages/lattice/src/index.ts packages/lattice/dist/` would silently skip dist/ (gitignored at root level `.gitignore:2:dist/`). The plan's instruction reflected an assumption that the rebuilt dist/ would be committed alongside src changes.
- **Fix:** Verified Lattice's `.gitignore` via `git check-ignore -v`; confirmed Phase 2's 00fcfac commit (the precedent) also only contained src/index.ts (no dist/). Adjusted the staging command to `git add packages/lattice/src/index.ts` only.
- **Files modified:** none (this is a staging-command adjustment, not a code change)
- **Verification:** `git show --stat HEAD` post-commit shows `1 file changed, 7 insertions(+)`, matching the 00fcfac precedent (1 file, 1 insertion). FSB-side `import('lattice').then(l => ...)` resolves the new symbols correctly via the locally-rebuilt dist/ symlink.
- **Committed in:** `acdbb8a` (Task 1 commit -- the staging adjustment is the commit itself)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 - bug)
**Impact on plan:** No functional regression. The deviation was a planning-time error (asssuming dist/ tracked when it's gitignored). FSB-side bare-specifier resolution works because dist/ rebuild is a local-only side-effect of the `pnpm --filter lattice build` invocation in Step C; the symlink at node_modules/lattice already points at packages/lattice, which in turn points its `exports` at the freshly-rebuilt dist/. No scope creep.

## Issues Encountered

- **The first awk filter `awk '/^## Observability/,/^## /' docs/fsb-integration-gaps.md` returned empty output on Step A** -- this turned out to be because the section starts with `## Observability/step-markers` (with the `/step-markers` suffix), which the awk pattern `/^## /` matches as the section terminator. The fallback grep `grep -n "step.transition event kind\|Inspector envelope shape\|recovery\|OpenTelemetry"` located the 4 rows directly. Final acceptance verified with `awk '/^## Observability/,/^## /{ if (/^\| Observability/ && /Blocker/) print }'` returning 0 (zero remaining Observability Blocker table rows).
- **Lattice's `.planning/STATE.md` shows as modified in `git status`** -- this is Lattice's OWN internal .planning/STATE.md, modified out-of-band by something other than this plan (file references "v1.0 milestone" not v1.1 or anything Phase 3 touched). Verified NOT included in our Task 1 + Task 2 staging (status shows ` M` with leading space, never `M ` staged). No impact.

## User Setup Required

None - no external service configuration required. Plan 03-02 is purely Lattice-internal (re-export + dist rebuild + audit-doc text). No FSB-side files changed; no MV3 reload needed; no environment variables to add.

## Next Phase Readiness

**Ready for Plan 03-03.** Plan 03-03 will land the FSB-side smoke `tests/lattice-checkpoint-smoke.test.js` (3-step sequence, parent/previous linkage, real-runtime mint + verify) and bump `.planning/LATTICE-PIN.md` for all Phase 3 Lattice commits. Inputs Plan 03-03 needs:

- **Lattice HEAD to consume:** `7afd62fc595bedc5ad9d4576d2d679cf50c68fd8` (recorded in `03-02-LATTICE-SHA.txt`)
- **Bare-specifier surface available:** `createCheckpointHook`, `STEP_TRANSITION_EVENT_NAME`, `DEFAULT_CHECKPOINT_BAND`, `type CheckpointHookContext`, `type CheckpointHookOptions` all reachable via `await import('lattice')` from the FSB project root
- **Phase 2 surface preserved:** `createReceipt`, `createHookPipeline`, `verifyReceipt`, `createInMemorySigner`, `generateEd25519KeyPairJwk`, `createMemoryKeySet`, `BAND` exports all still reachable (verified via probe)
- **Lattice test baseline:** 347 PASS / 0 FAIL (must hold through Plan 03-03; FSB smoke doesn't touch Lattice tests)
- **Audit-doc closed rows referenced:** Plan 03-03's LATTICE-PIN.md bump can cite `lattice/docs/fsb-integration-gaps.md` lines 81-82 as the proof-of-coverage backlinks

## Self-Check: PASSED

Files verified present:
- FOUND: lattice/packages/lattice/src/index.ts (createCheckpointHook export, line 6)
- FOUND: lattice/packages/lattice/dist/index.js (createCheckpointHook reference; not committed but present locally)
- FOUND: lattice/packages/lattice/dist/index.d.ts (CheckpointHookOptions reference; not committed but present locally)
- FOUND: lattice/docs/fsb-integration-gaps.md (Observability rows 81-82 flipped)
- FOUND: .planning/phases/03-observability-step-markers-extension/03-02-LATTICE-SHA.txt (7afd62fc...)

Commits verified present (in Lattice repo, fsb-integration-experiments):
- FOUND: acdbb8a feat(api): re-export createCheckpointHook + checkpoint types from public surface
- FOUND: 7afd62f docs(fsb-integration): close Phase 3 audit rows (observability/step-markers)

Cumulative Phase 3 commits (all 4 verified):
- FOUND: fd254c4 feat(tracing): add step.transition event kind to RunEventKind
- FOUND: a67f476 feat(contract): add createCheckpointHook factory + per-step receipt mint
- FOUND: acdbb8a feat(api): re-export createCheckpointHook + checkpoint types from public surface
- FOUND: 7afd62f docs(fsb-integration): close Phase 3 audit rows (observability/step-markers)

Bare-specifier probes:
- FOUND: typeof l.createCheckpointHook === 'function' (probe from FSB root)
- FOUND: l.STEP_TRANSITION_EVENT_NAME === 'step.transition'
- FOUND: l.DEFAULT_CHECKPOINT_BAND === 1
- FOUND: typeof l.createReceipt === 'function' (Phase 2 preserved)
- FOUND: typeof l.createHookPipeline === 'function' (Phase 2 preserved)

Tests verified green:
- Lattice full suite: 347 PASS / 0 FAIL (matches Plan 03-01 baseline; re-export adds zero tests)
- INV-01 tool-definitions-parity: 142 PASS / 0 FAIL
- INV-04 setTimeout count: 8
- Phase 1 smoke (lattice-smoke.test.js): 29 PASS / 0 FAIL
- Phase 2 smoke (lattice-tripwire-smoke.test.js): 39 PASS / 0 FAIL

Byte-frozen surface verified:
- EMPTY DIFF (97836f2..HEAD): bands.ts, tripwire.ts, canonical.ts, redact.ts, receipts/{types,sign,keyset,envelope}.ts, runtime/create-ai.ts (9 files)

Audit-doc verified:
- 0 remaining Observability Blocker table rows (awk filter)
- Phase 2 backlink count: 10 (>= 7)
- "step.transition event kind" label preserved: 1 row
- "Inspector envelope shape" label preserved: 1 row

FSB-side verified clean:
- `git status --porcelain` filtered to extension/, mcp/, tests/, package.json: 0 matches

Ceremony verified:
- Cumulative Ref footer count (97836f2..HEAD): 4
- Reflog push count: 0

---
*Phase: 03-observability-step-markers-extension*
*Completed: 2026-05-24*
*Lattice HEAD after Plan 03-02: 7afd62fc595bedc5ad9d4576d2d679cf50c68fd8*
*Phase 2 baseline HEAD (byte-frozen reference): 97836f2c7759470389294b0a03a122ec89780157*
*Plan 03-01 final HEAD (predecessor): a67f476b433704eabd75eb657af25b89dc79afda*
