---
phase: 35-denylist-expansion-import-time-classification-gate-lands-fir
plan: 02
subsystem: testing
tags: [classification-gate, service-denylist, fail-closed, ci-gate, esm, deny-03]

# Dependency graph
requires:
  - phase: 35-01
    provides: expanded service-denylist.json (deniedOrigins + sensitiveOrigins roster) that classify() reads
  - phase: 26 (v0.9.99)
    provides: verify-recipe-path-guard.mjs CI-gate shape + validate:extension chain point
  - phase: 30 (v0.9.99)
    provides: service-denylist.js classify()/load() dual-export single source of truth
provides:
  - scripts/verify-classification-gate.mjs (fail-closed import-time/CI classification gate; classifyGate() export + CLI)
  - sensitivityHeuristic() per-axis vocabulary (finance/health/social/media/adult/government + named-brand tokens)
  - catalog/descriptors/_fixtures/unclassified-sensitive.fixture.json (DENY-03 fail-closed proof fixture)
  - tests/classification-gate.test.js (gate behavior: rejection, override, no-false-positive, classified-never-fails)
  - the gate chained into validate:extension (-> ci) and npm test
affects: [Phase 36 codegen pipeline (importer consumes classifyGate before emitting descriptor JSON), Phases 37-39 breadth batches (each gated on its origins being classified)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-export CI gate: export { classifyGate } + CLI-on-direct-invocation (import.meta.url === pathToFileURL(process.argv[1]).href), both paths reuse one logic body"
    - "Fail-closed sensitivity heuristic: one case-insensitive RegExp per axis over host+slug+description; benign false-positive fixed by SAFE_ALLOWLIST, never by weakening the heuristic"
    - "Proof fixture under catalog/descriptors/_fixtures/ (non-recursive readJsonDir excludes it from the shipped catalog)"

key-files:
  created:
    - scripts/verify-classification-gate.mjs
    - catalog/descriptors/_fixtures/unclassified-sensitive.fixture.json
    - tests/classification-gate.test.js
  modified:
    - package.json

key-decisions:
  - "Heuristic vocabulary uses brand + category tokens from 35-RESEARCH Q3 verbatim; deliberately omits over-generic words (a bare 'message'/'inbox'/'notification') so the benign already-shipped descriptors (reddit.inbox, github.notifications, slack/notion reads) are never false-failed."
  - "The override path the test exercises is opts.safeAllowlist (a classifyGate parameter), not a module-level constant -- so a Phase-36 caller can pass a curated benign allowlist programmatically without editing the gate."
  - "classifyGate fails closed when classify() is unloaded (empty denylist => everything unclassified => fail), which is the safe direction for the Phase-36 importer if it forgets to await load()."

patterns-established:
  - "CI gate dual-export idiom: a single .mjs is both a chained CLI (validate:extension) and an importable function (Phase-36 importer)."
  - "Per-axis RegExp sensitivity heuristic with a host-suffix .gov special case."

requirements-completed: [DENY-03]

# Metrics
duration: 5min
completed: 2026-06-24
---

# Phase 35 Plan 02: Fail-Closed Import-Time Classification Gate (DENY-03) Summary

**A `classify()`-backed fail-closed CI gate (`verify-classification-gate.mjs`) that turns an unclassified sensitivity-suspect origin into a build failure naming the offender, exported as `classifyGate()` for the Phase-36 importer and chained into `validate:extension`, proven by a deliberately-unclassified finance fixture.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-24T15:18:00Z
- **Completed:** 2026-06-24T15:22:49Z
- **Tasks:** 3
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- Authored the fail-closed classification gate: for every origin a descriptor corpus would emit, it consults `service-denylist.js classify(origin)`; if the origin trips a sensitivity heuristic (finance/health/social/media/adult/government) but is NOT classified denied/sensitive, it exits non-zero naming the origin + the matched axis.
- Dual-export (`classifyGate()` + CLI) so the Phase-36 importer can call the same logic before emitting any descriptor JSON, with the CLI as the CI backstop.
- Proof fixture (`pay.unclassified-fixture.test`) placed under `_fixtures/` so the non-recursive `readJsonDir` excludes it from the shipped catalog; the CLI rejects it when exposed to the corpus.
- Gate chained into `validate:extension` (-> `ci`) and into the `npm test` chain (next to `service-denylist.test.js`); the real roster (8 corpus + 23 roster origins) passes with zero false-positives.

## Task Commits

Each task was committed atomically:

1. **Task 1: unclassified-sensitive proof fixture** - `cd9bbc7b` (feat)
2. **Task 2: verify-classification-gate.mjs (classifyGate export + CLI, fail-closed)** - `99194d4f` (feat)
3. **Task 3: classification-gate.test.js + chain into validate:extension/test** - `ceb753a2` (test)

**Plan metadata:** (this commit)

_TDD note (Task 3, tdd="true"): the test was authored and run BEFORE the package.json chain wiring -- it went RED on exactly the two chain-wiring assertions (8 PASS / 2 FAIL) while the four behavior assertions (a-d) already passed against the Task-2 `classifyGate`; wiring package.json turned it GREEN (10 PASS / 0 FAIL). The behavior-under-test (`classifyGate`) is authored in Task 2 by plan design, so the RED/GREEN gate here is on the CI wiring + locked behavior, committed as a single `test(...)` commit._

## Files Created/Modified
- `scripts/verify-classification-gate.mjs` - Fail-closed classification gate; `classifyGate(items, opts)` + `sensitivityHeuristic(host, slug, description)` exports + CLI sweep of `catalog/descriptors/*.json` (top-level only) ∪ named roster. Node-builtins-only; Wall-1 clean.
- `catalog/descriptors/_fixtures/unclassified-sensitive.fixture.json` - DENY-03 proof: a fabricated finance origin (`pay.unclassified-fixture.test`) intentionally absent from `service-denylist.json`.
- `tests/classification-gate.test.js` - Zero-framework node test; `await import()` of the ESM gate; asserts fail-closed rejection (naming the origin), the `safeAllowlist` override, benign no-false-positive (airtable/asana/wikipedia/hackernews), and classified-sensitive-never-fails (dashboard.stripe.com).
- `package.json` - `validate:extension` gains `&& node scripts/verify-classification-gate.mjs`; `test` chain gains `&& node tests/classification-gate.test.js` after `service-denylist.test.js`. (Only these two chain additions; no reorder/removal.)

## Decisions Made
- **Heuristic omits over-generic tokens.** The social/messaging axis uses brand/app tokens (`slack`, `discord`, `whatsapp`, ...) + `direct-message`, NOT a bare `message`/`inbox`. This was load-bearing: `reddit.inbox` ("...unread Reddit inbox messages..."), `github.notifications`, and the slack/notion read descriptors all contain `messages`/`message`/`inbox`/`notification` and would have false-failed under a generic vocabulary. Verified clean over the real corpus.
- **Override via parameter, not constant.** `classifyGate(items, { safeAllowlist })` exposes the curated-benign override as a parameter so Phase 36 can pass it programmatically; the test exercises exactly this path.
- **Fail-closed on unloaded `classify()`.** If `Denylist.load()` was not awaited, classify() returns everything-unclassified and the gate fails closed (the safe direction for the importer).

## Deviations from Plan

None - plan executed exactly as written.

The plan's Task-2 action invited either a `SAFE_ALLOWLIST` module constant or a `classifyGate` allowlist parameter for the override path; I chose the parameter (`opts.safeAllowlist`) and documented it in the test, as the plan's Task-3 action explicitly permits ("pick whichever override path Task 2 actually exposes and document it in a comment"). This is a sanctioned discretion choice, not a deviation.

## Issues Encountered
- **Potential heuristic false-positive on the shipped corpus (caught at design time).** The `reddit.inbox`, `github.notifications`, and slack/notion read descriptors carry the words `messages`/`message`/`inbox`/`notification`. Resolved by keeping the social/messaging axis to brand/app tokens only (per 35-RESEARCH Q3) and verifying the CLI sweep over the real corpus reports zero failures. No code change beyond vocabulary discipline.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- **DENY-03 satisfied:** the import-time classification gate is fail-closed, runs in `validate:extension`/`ci`, and exports `classifyGate` for Phase 36.
- **Phase 36 (codegen pipeline):** the importer (`scripts/import-opentabs-catalog.mjs`, not yet created) must `import { classifyGate }` from `scripts/verify-classification-gate.mjs` and call it on the full extracted descriptor set BEFORE emitting any descriptor JSON. The gate's item shape is `{ origin, service?, slug?, description? }`.
- **Phases 37-39 (breadth batches):** each batch's origins must be classified (denied/sensitive) or the gate fails the build -- the deferred full 119-app classification is the gating work for those batches.
- No blockers. DENY-01/02 (Plan 01) data + DENY-04 (posture-B re-gate, separate plan) remain the other Phase-35 requirements.

## Self-Check: PASSED

- FOUND: scripts/verify-classification-gate.mjs
- FOUND: catalog/descriptors/_fixtures/unclassified-sensitive.fixture.json
- FOUND: tests/classification-gate.test.js
- FOUND: .planning/phases/35-.../35-02-SUMMARY.md
- FOUND commits: cd9bbc7b (Task 1), 99194d4f (Task 2), ceb753a2 (Task 3)

---
*Phase: 35-denylist-expansion-import-time-classification-gate-lands-fir*
*Completed: 2026-06-24*
