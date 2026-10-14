---
phase: 56-governing-lineage-evidence-deadline-engine
plan: "01"
subsystem: truth-schema-deadline-kernel
tags: [chrome-extension, truth-schema, civil-date, provenance, deterministic-evaluation]

requires:
  - phase: 55-chrome-local-graph-incremental-truth-foundation
    provides: Source-owned graph identities, exact evidence locators, immutable versions, and native-Web-Crypto schema patterns
provides:
  - One frozen descriptor-safe truth language for candidates, citations, typed assertions, conflicts, four-axis lineage, deadline rules/results, semantic proofs, and durable manifests
  - Nine locally derived truth identity namespaces with exact version/input bindings and finite caps
  - One pure proleptic-Gregorian civil-date kernel with four closed calendar/business-day operators and explicit fail-closed blockers
  - Controlled RED/GREEN contracts covering hostile descriptors, exact maxima, storage separation, and TZ/locale invariance
affects: [56-02-extraction, 56-03-adjudication, 56-04-truth-store, 56-05-runtime, phase-57, phase-58, phase-59]

tech-stack:
  added: []
  patterns: [classic-commonjs-frozen-api, descriptor-safe-closed-data, length-prefixed-native-sha256, ordinal-civil-date-arithmetic]

key-files:
  created:
    - extension/utils/skopeo-truth-schema.js
    - extension/utils/skopeo-deadline-engine.js
    - tests/skopeo-truth-schema.test.js
    - tests/skopeo-deadline-engine.test.js
  modified: []

key-decisions:
  - "Semantic proofs validate one canonical family citation registry once, then cross-check every assertion and downstream record by immutable ID; this preserves exact evidence admission without quadratic rehashing."
  - "Deadline arithmetic uses a zero-based proleptic-Gregorian ordinal over 0001-01-01 through 9999-12-31; boundary and timezone remain explicit proof data and never become host defaults."
  - "Business-day calculation requires an exact immutable calendar ID/version and full parsed calendar data; missing, stale, malformed, or unsupported semantics return sorted blockers and no derived date."

patterns-established:
  - "Semantic/store split: storage-independent family proofs never carry page hashes or snapshot IDs; only store-constructed manifests bind canonical proof bytes to deterministic page hashes and an sts1 identity."
  - "Pure deadline kernel: one literal four-operator switch performs checked ordinal arithmetic with no host date, locale, timezone, clock, callback, or model-calculated path."
  - "Fail-closed typed truth: exact descriptors, local identity recomputation, recursively frozen null-prototype outputs, and shared finite caps precede all adjudication or durable use."

requirements-completed: [TRUTH-02, TRUTH-03, TRUTH-04, TRUTH-06, TRUTH-07, TRUTH-08, TRUTH-09, TRUTH-11]

duration: 46 min
completed: 2026-07-23
---

# Phase 56 Plan 01: Closed Truth Schema and Civil-Date Deadline Kernel Summary

**A frozen evidence-bound truth language and host-independent Gregorian deadline kernel now fix every Phase 56 semantic shape, identity, cap, rule operator, blocker, and storage boundary before extraction or adjudication can depend on them**

## Performance

- **Duration:** 46 min
- **Started:** 2026-07-23T22:49:43Z
- **Completed:** 2026-07-23T23:36:01Z
- **Tasks:** 4 TDD tasks
- **Files modified:** 4

## Accomplishments

- Added the exact `FsbSkopeoTruthSchema` classic/CommonJS surface for closed candidate admission, exact graph-bound citations, nine typed assertion families, immutable conflicts, independent lineage axes, explicit evaluation context, deadline rules/results, semantic proofs, and store-owned manifests.
- Added all nine local truth identity namespaces using length-prefixed canonical tuples and native Web Crypto only, including stable-versus-version assertion identity, a shared 2,048-citation proof cap, and deterministic `sts1:` manifest identity.
- Added the pure `FsbSkopeoDeadlineEngine` with strict civil dates, checked zero-based ordinals over years 0001–9999, all four allowlisted calendar/business-day operators, exact immutable calendar use, and sorted fail-closed blockers.
- Added controlled RED/GREEN tests for hostile descriptors and unknown/model-authority fields, every exact maximum/max-plus-one boundary, semantic-proof/manifest separation, leap/overflow behavior, weekend/holiday arithmetic, and byte-identical output across six TZ/locale environments.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Specify the closed truth-schema contract** - `1f40117c` (test)
2. **Task 2 GREEN: Implement the closed truth and manifest schemas** - `334caf78` (feat)
3. **Task 3 RED: Specify the civil-date and deadline contract** - `751b8515` (test)
4. **Task 4 GREEN: Implement the pure deadline engine** - `cc0c10af` (feat)

## Files Created/Modified

- `extension/utils/skopeo-truth-schema.js` - Frozen descriptor-safe truth schema, exact enums/caps, local identity derivation, semantic proof parsing, and durable manifest parsing.
- `tests/skopeo-truth-schema.test.js` - Controlled TDD contract for exact shapes, hostile inputs, identity binding, storage separation, and every finite boundary.
- `extension/utils/skopeo-deadline-engine.js` - Strict civil-date parser/ordinal conversion and closed calendar/business-day rule evaluation.
- `tests/skopeo-deadline-engine.test.js` - Controlled TDD contract for civil dates, operators, blockers, calendars, freezing, static purity, and environment invariance.

## Test Evidence

- Controlled truth RED exited nonzero with exactly one stable `skopeo truth schema contract` marker only while the production module was absent.
- Controlled deadline RED exited nonzero with exactly one stable `skopeo deadline engine contract` marker only while the production module was absent.
- `node tests/skopeo-truth-schema.test.js && node tests/skopeo-deadline-engine.test.js` passed in 1.61 seconds.
- `node --check extension/utils/skopeo-truth-schema.js && node --check extension/utils/skopeo-deadline-engine.js` passed.
- Adjacent regressions passed: graph schema **572 / 0** and corpus schema **PASS**.
- `git diff --check` passed; no package or lockfile changed.
- Deterministic structural/security validation is complete. Legal/domain confirmation that encoded clause semantics match real governing agreements remains explicitly human-needed in later Phase 56 validation.

## Decisions Made

- Used one prevalidated family citation registry for proof admission, then validated assertion and downstream references against it. This retains full identity recomputation while keeping the exact 2,048-assertion/2,048-citation boundary well under the 30-second focused target.
- Kept lifecycle dates as one exact civil-date value shape while preserving their five distinct assertion-type discriminators; cross-type rejection applies to incompatible value unions rather than pretending two valid civil-date values have different structural shapes.
- Treated inclusive/exclusive boundary as explicit proof metadata. The closed operator and amount alone control arithmetic, so no hidden off-by-one convention can alter the computed civil date.
- Required explicit exact calendar IDs, versions, weekend definitions, and holiday dates for business-day rules. No operating-system calendar, locale, timezone, or UTC fallback exists.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test fixture correctness] Corrected future-GREEN boundary fixtures**

- **Found during:** Task 2 (closed truth schema implementation)
- **Issue:** Several RED fixtures unintentionally exceeded a total cap with unrelated default candidates, removed evidence handles still referenced by other candidates, crossed structurally identical civil-date values as if their shapes differed, or formed conflict sets from mismatched assertion slots/ranges.
- **Fix:** Made the exact-cap fixtures truly exact, retained independently referenced handles, tested cross-union shape rejection while preserving the shared civil-date union, aligned conflict members to one semantic slot, and canonicalized registry ordering.
- **Files modified:** `tests/skopeo-truth-schema.test.js`
- **Verification:** The complete hostile-input and exact-max/max-plus-one truth contract passes.
- **Committed in:** `334caf78`

**2. [Rule 3 - Performance] Removed quadratic citation revalidation**

- **Found during:** Task 2 exact 2,048-item verification
- **Issue:** Parsing every assertion rebuilt and rehashed the complete family citation registry, making the high-cardinality proof boundary quadratic and exceeding the focused runtime target.
- **Fix:** Parse and validate the family citation registry once, then pass the immutable registry to internal assertion validation while retaining every public parser check.
- **Files modified:** `extension/utils/skopeo-truth-schema.js`
- **Verification:** The full truth contract, including all exact maxima, passes in about 1.2 seconds; both focused suites pass in 1.61 seconds.
- **Committed in:** `334caf78`

---

**Total deviations:** 2 auto-fixed (1 fixture correctness, 1 performance)
**Impact on plan:** Both corrections were required to make the locked contract accurate and bounded; no production scope, dependency, capability, or authority surface was added.

## Issues Encountered

- The first large schema patch was interrupted after writing the file. Recovery confirmed the complete 3,014-line API tail and valid syntax before contract iteration; no partial source or hung process remained.
- The initial exact-cap run exposed the quadratic registry path and was safely terminated after 90 seconds before the single-registry optimization reduced the suite below target.

## User Setup Required

None - no package, credential, host permission, service, database, daemon, MCP integration, or external configuration was added.

## Next Phase Readiness

- Plan 56-02 can admit bounded configured-provider candidate output only through the closed engine-issued-handle envelope and derive exact source-local candidate generation identities.
- Plans 56-03 and 56-04 can consume immutable assertion/conflict/lineage/rule/result records and preserve the explicit semantic-proof versus store-owned-manifest boundary.
- Clause-to-rule legal fidelity and real agreement interpretation remain human-needed evidence for later Phase 56 evaluation; this is an intentional validation classification, not an automated-code blocker.

## Self-Check: PASSED

---
*Phase: 56-governing-lineage-evidence-deadline-engine*
*Completed: 2026-07-23*
