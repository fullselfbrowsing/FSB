---
phase: 36-codegen-pipeline-no-dead-entry-resolution
plan: 03
subsystem: testing
tags: [side-effect-classification, fail-safe-high, graphql-carve-out, verb-map, override-table, crosscheck-gate, CGEN-02, validate-extension]

# Dependency graph
requires:
  - phase: 36-01
    provides: "the emitted opentabs__todoist__*.json descriptors carrying provenance.signals {transportHelper, httpMethod, opNameVerb} + the declared sideEffectClass; verify-catalog-crosscheck.mjs + catalog-crosscheck.test.js stubs already registered in validate:extension / npm test"
  - phase: 35-02
    provides: "the dual-export gate idiom (export {fn} + a CLI guarded by import.meta.url === pathToFileURL(process.argv[1]).href) mirrored from verify-classification-gate.mjs; the chained-into-validate:extension CI-backstop pattern"
provides:
  - "verify-catalog-crosscheck.mjs: the REAL derived-vs-declared fail-safe-high cross-check gate (replaces the Plan-01 stub) -- re-derives each descriptor's side-effect class from provenance.signals and FAILS the build when declared < derived (an under-stated destructive/mutating op)"
  - "deriveClass(signals, slug): MAX-merge over the GraphQL/RPC carve-out (FIRST) + named-verb helper + generic api({method}) literal + op-name verb + an UPGRADE-only override-table FLOOR"
  - "crossCheck(descriptors) -> {failures}: dual-exported so the importer can call it inline before writing AND the CLI backstops in validate:extension"
  - "tests/catalog-crosscheck.test.js: the Mechanic-2 acceptance test via the REAL crossCheck export (void_invoice/archiveIssue under-stated -> FAIL; delete_customer/linear.issues correctly-stated -> PASS)"
affects: [36-01-importer-inline-gate, 37-breadth-a, 38-breadth-b, 39-breadth-c, 40-depth-1, 41-depth-2, 42-discovery-seeding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-safe-high side-effect derivation: order read<write<destructive; combine the GraphQL/RPC carve-out (method uninformative -> op-name verb; ambiguous -> write; never auto-read) + named-verb helper + method literal + op-name verb + override floor; take the MAX so disagreement escalates"
    - "Override table as an UPGRADE-only FLOOR (max-merge, never a downgrade), keyed by op-name and slug-suffix so feeding either the bare op-name or the dotted slug resolves it -- a known-destructive op with NO transport signals is still caught"
    - "Re-derive from persisted provenance.signals (not by re-parsing TS): the importer stamps the raw signals; the gate recomputes the class so the CI backstop is independent of the codegen run"
    - "Dual-export gate idiom reused from Phase 35: export the comparator for inline use + a CLI guarded to run only on direct invocation (side-effect-free import), chained into validate:extension after verify-classification-gate.mjs"

key-files:
  created: []
  modified:
    - scripts/verify-catalog-crosscheck.mjs
    - tests/catalog-crosscheck.test.js

key-decisions:
  - "Implemented the FULL Mechanic-2 derivation (carve-out FIRST, verb-map, generic method literal, override floor, MAX-merge) -- not a method-only heuristic -- so a GraphQL POST mutation declared read FAILS and a GraphQL read query declared read PASSES"
  - "Override table membership exactly as RESEARCH lists (void_invoice, delete_customer, cancel_subscription, refund_charge, delete_record, archive_project -> destructive; merge_pull_request -> write); applied LAST as an upgrade-only floor; keyed by op-name OR slug-suffix"
  - "The CLI only cross-checks descriptors that carry provenance.signals AND a string sideEffectClass (hand-authored recipes without OpenTabs signals are governed elsewhere); the slug-keyed override floor still applies to any with a known-destructive op-name"
  - "WRITE_VERBS deliberately includes the todoist smoke ops' non-canonical verbs (close, reopen) so they derive write (matching their declared write) rather than falling through to a read floor that would have under-derived and masked a real signal -- but the method POST already floors them to write regardless, so this is belt-and-suspenders, not the sole guard"

patterns-established:
  - "Descriptor-vs-derived cross-check: for every emitted descriptor, declared sideEffectClass MUST be >= the fail-safe-high derived class; under-stating fails the build (CI), over-stating is the safe direction (no failure)"
  - "The acceptance test imports the SHIPPED crossCheck export (not a re-implemented copy) so it validates the real gate, and feeds synthetic descriptors in the importer's exact persisted provenance.signals shape"

requirements-completed: [CGEN-02]

# Metrics
duration: 4min
completed: 2026-06-24
---

# Phase 36 Plan 03: Descriptor-vs-Derived Side-Effect Cross-Check Gate Summary

**The real `verify-catalog-crosscheck.mjs` (CGEN-02): re-derives each descriptor's side-effect class from its persisted `provenance.signals` via the GraphQL/RPC carve-out + verb-map + override-table FLOOR, MAX-merged fail-safe-high (read<write<destructive), and FAILS the build when a descriptor's declared class UNDER-states the derived class -- so a GraphQL/RPC POST mutation can never be silently classed `read` (writable under opt-out Auto with no friction). Dual-exported `crossCheck` + CLI chained into `validate:extension`; proven by a sample test (void_invoice/archiveIssue under-stated -> FAIL; delete_customer/linear.issues correctly-stated -> PASS).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-24T17:16Z
- **Completed:** 2026-06-24T17:20Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced the Plan-01 no-op stub of `verify-catalog-crosscheck.mjs` with the real fail-safe-high gate: `deriveClass(signals, slug)` MAX-merges the GraphQL/RPC carve-out (applied FIRST; method discarded, op-name verb decides, ambiguous -> write, never auto-read), the named-verb helper (apiGet/apiPost/apiPut/apiPatch/apiDelete), the generic `api({method})` literal, the op-name verb, and an UPGRADE-only override-table FLOOR.
- `crossCheck(descriptors)` flags any descriptor whose declared `sideEffectClass` is LOWER than the derived class (under-states a destructive/mutating op); over-stating is the safe direction and never fails. Dual-exported (`crossCheck` + `deriveClass`) so the importer can call it inline before writing AND the CLI backstops in `validate:extension`.
- The CLI sweeps the real `catalog/descriptors/*.json` corpus (top-level only, mirroring `readJsonDir`'s non-recursion so `_fixtures/` is excluded) and `process.exit(1)` on any under-stated op; it exits 0 on the clean 7-descriptor todoist smoke catalog (all correctly classed by 36-01).
- `tests/catalog-crosscheck.test.js` proves the four Mechanic-2 cases via the REAL `crossCheck` export: void_invoice (declared read) FAILS, delete_customer (declared destructive) PASSES, linear.issues (graphql POST, list verb, declared read) PASSES, linear.archiveIssue (graphql POST, archive verb, declared read) FAILS -- plus a mixed-batch sanity that exactly the two under-stated ops flag.
- `npm run validate:extension` is green end-to-end with the real gate now active in the chain (validate-extension -> recipe-path-guard -> classification-gate -> **catalog-crosscheck**).

## Task Commits

Each task was committed atomically (TDD: the acceptance test was authored first as the RED gate, then the script made it GREEN; the test is committed under Task 2):

1. **Task 1: Author verify-catalog-crosscheck.mjs (derived-vs-declared, fail-safe-high)** - `8d488e64` (feat)
2. **Task 2: Cross-check sample test (void_invoice/delete_customer destructive; GraphQL POST never read; under-stated FAILS)** - `c5671150` (test)

_Note: this plan's Task 1 is `tdd="true"`. The RED step wrote the acceptance assertions and confirmed they failed against the Plan-01 stub (6 failing assertions on the under-stated cases); the GREEN step implemented the real gate making all 10 assertions pass. The test file lands in the Task-2 commit per the plan's task/file split; no separate refactor commit was needed._

## Files Created/Modified
- `scripts/verify-catalog-crosscheck.mjs` - the real fail-safe-high derived-vs-declared cross-check gate (replaces the Plan-01 stub): `ORDER`/`maxClass` lattice, `verbClass`, the GraphQL/RPC carve-out, `helperClass`, `methodClass`, `SIDE_EFFECT_OVERRIDES` floor, `deriveClass`, `crossCheck`, and the CLI guarded to run only on direct invocation. Dual-exports `crossCheck` + `deriveClass` (+ `verbClass`).
- `tests/catalog-crosscheck.test.js` - the Mechanic-2 acceptance test importing the real `crossCheck`; the four classification cases + a mixed-batch sanity (10 assertions).

## Decisions Made
- **Full Mechanic-2 derivation, not method-only:** the carve-out is applied FIRST (a GraphQL/RPC transport makes the HTTP method uninformative; the op-name verb decides, an ambiguous GraphQL op fails-safe to write, and a GraphQL op is never auto-classed read merely because no apiPost appears). This is what makes case (c)/(d) split correctly: a graphql `list` query stays read, a graphql `archive`/`delete` mutation escalates to write/destructive.
- **Override table = upgrade-only FLOOR, keyed by op-name OR slug-suffix:** membership exactly as RESEARCH lists; matching the slug-suffix (`stripe.void_invoice` ends with `void_invoice`) means the floor applies even when `deriveClass` is fed the dotted slug, and a known-destructive op with NO transport signals is still caught (verified: `deriveClass({}, 'stripe.delete_customer') === 'destructive'`).
- **CLI scope:** only descriptors carrying `provenance.signals` + a string `sideEffectClass` participate in the comparison (hand-authored recipes without OpenTabs signals are governed by other gates); the slug-keyed override floor still applies to any descriptor whose op-name is a known-destructive override.

## Deviations from Plan

None - plan executed exactly as written. Both tasks delivered their specified artifacts; no Rule 1/2/3 auto-fixes were needed (the real corpus was already correctly classified by 36-01, so no descriptor required re-classification, and no missing critical functionality or blocking issue surfaced). package.json was NOT touched (the stub registrations from Plan 01 already chain the gate into validate:extension and the test into npm test, exactly as the plan required).

## Issues Encountered
- During authoring, the first draft of `helperClass` had three overlapping/dead delete-detection branches (a copy-merge artifact). Simplified to three clear regex checks (delete-first ordering so `apiDelete` is not shadowed by the post/put/patch check) before running -- a pre-run cleanup, not a behavioral fix. The real corpus's `transportHelper: "apivoid"`/`"api"` values (Plan 01 stamped a normalized helper token) correctly resolve to `null` from `helperClass`, leaving the method + op-name-verb signals to classify -- which they do correctly (e.g. delete_task: DELETE method + delete verb -> destructive == declared).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CGEN-02 is satisfied: the import-time side-effect cross-check is real, fail-safe-high, and fails the build on an under-stated destructive op; it is chained into `validate:extension` (-> ci -> npm test).
- `crossCheck` is dual-exported and ready for the Phase-36 importer (36-01) to call inline before emit if desired (the CLI already backstops the committed corpus; the inline call is an optional belt-and-suspenders the importer may adopt).
- The gate is in place BEFORE breadth (Phases 37-39) lands hundreds of descriptors: every new descriptor's declared `sideEffectClass` will be cross-checked against its derived fail-safe-high class at CI time, so a GraphQL/RPC mutation can never ship silently classed `read`.
- No blockers. The real todoist corpus passes the gate (no 36-01 mis-class found).

## Self-Check: PASSED

- FOUND: scripts/verify-catalog-crosscheck.mjs
- FOUND: tests/catalog-crosscheck.test.js
- FOUND: .planning/phases/36-codegen-pipeline-no-dead-entry-resolution/36-03-SUMMARY.md
- FOUND commit: 8d488e64 (Task 1, feat)
- FOUND commit: c5671150 (Task 2, test)

---
*Phase: 36-codegen-pipeline-no-dead-entry-resolution*
*Completed: 2026-06-24*
