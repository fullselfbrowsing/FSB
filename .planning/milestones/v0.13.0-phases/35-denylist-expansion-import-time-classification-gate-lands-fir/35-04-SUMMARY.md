---
phase: 35-denylist-expansion-import-time-classification-gate-lands-fir
plan: 04
subsystem: infra
tags: [provenance, opentabs, mit-license, pin, legal, categorization-axes, wall-1]

# Dependency graph
requires:
  - phase: 35 (plan 01)
    provides: "the expanded service-denylist.json roster (robinhood..onlyfans denied; stripe/ig/fb/tiktok/x sensitive) that the LEGAL Categorization Axes subsection documents and names"
  - phase: 30 (v0.9.99)
    provides: "the .planning/LATTICE-PIN.md PIN discipline (SHA + verbatim license + per-phase log table) mirrored by vendor/opentabs-snapshot/PIN.md, and the docs/LEGAL.md opt-out posture (commit 68ceea90) the axes subsection builds on"
provides:
  - "vendor/opentabs-snapshot/PIN.md: OpenTabs metadata provenance pin -- SHA 4b17021637d2cac12b8d84d21c40e765aa7b85e9 (main, 2026-06-21) + verbatim MIT license + Copyright (c) 2026-present OpenTabs Contributors + a Per-FSB-Phase log table, mirroring LATTICE-PIN.md"
  - "Two SHA-matched _provenance.json scaffolds ({source,repo,sha,license,pinnedAt,apps:[]}) for the Phase-36 importer to populate: vendor-side (vendor/opentabs-snapshot/_provenance.json) + catalog-side (catalog/descriptors/_fixtures/_provenance.json)"
  - "docs/LEGAL.md Categorization Axes subsection naming the three distinct criteria: (1) finance/government denial, (2) ToS-hostility denial (with the named roster), (3) sensitivity (Ask / mutating-gated)"
  - "tests/provenance-scaffold.test.js: asserts the pin + SHA-match + LEGAL axes + the Wall-1 no-runtime guarantee (vendor/opentabs-snapshot/ contains no .js); wired into the npm test chain"
affects: [phase-36-codegen-pipeline, phase-36-opentabs-metadata-vendoring, breadth-batches-37-39]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OpenTabs provenance pin mirrors the LATTICE-PIN.md discipline (YAML current_* frontmatter + verbatim license body + an append-only per-phase log table)"
    - "Provenance scaffold isolation: a non-descriptor .json that must NOT ship is placed under catalog/descriptors/_fixtures/ where the non-recursive readJsonDir (package-extension.mjs / validate-extension.mjs) never inlines it into recipe-index.generated.js"
    - "Wall-1 no-runtime guard as a test assertion: a recursive readdir filter asserts vendor/opentabs-snapshot/ contains zero .js so no OpenTabs dist/ or handle() runtime can slip into the vendored snapshot"
    - "Hermetic/offline pin: the OpenTabs SHA + MIT license text are embedded verbatim from the verified research facts (no live gh/network fetch at author time)"

key-files:
  created:
    - "vendor/opentabs-snapshot/PIN.md"
    - "vendor/opentabs-snapshot/_provenance.json"
    - "catalog/descriptors/_fixtures/_provenance.json"
    - "tests/provenance-scaffold.test.js"
  modified:
    - "docs/LEGAL.md"
    - "package.json"

key-decisions:
  - "Placed the catalog-side provenance scaffold at catalog/descriptors/_fixtures/_provenance.json (NOT the literal catalog/descriptors/_provenance.json the research named) — confirmed via reading both readJsonDir impls that a top-level catalog/descriptors/*.json WOULD be inlined into the shipped index; the _fixtures/ sibling is excluded by the non-recursive readdirSync, proven by regenerating the catalog (8 descriptors, SHA absent) + validate-extension passing"
  - "Embedded the canonical MIT license body verbatim with the exact OpenTabs copyright line (Copyright (c) 2026-present OpenTabs Contributors) from the verified research facts — offline/hermetic, no live network fetch (the pin is commit-pinned and auditable)"
  - "Authored a standalone tests/provenance-scaffold.test.js rather than folding the assertions into service-denylist.test.js (the research offered either) — keeps the criterion-5 provenance/legal scaffold assertions in one focused file with its own Wall-1 no-runtime guard"

patterns-established:
  - "Wall-1 no-runtime assertion: vendor/opentabs-snapshot/ is asserted to contain no .js, making the metadata-only boundary a CI failure rather than a hope"
  - "Provenance SHA cross-link: the vendor-side and catalog-side scaffolds pin the SAME OpenTabs SHA and the test asserts they match, so the two provenance records can never drift"

requirements-completed: [DENY-01]

# Metrics
duration: 9min
completed: 2026-06-24
---

# Phase 35 Plan 04: Provenance Scaffold + LEGAL Categorization Axes Summary

**Landed the OpenTabs metadata provenance/legal scaffold — a PIN.md pinning SHA 4b17021637... with the verbatim MIT license, two SHA-matched _provenance.json scaffolds (vendor + catalog-side, isolated under _fixtures/), and a docs/LEGAL.md Categorization Axes subsection naming the three distinct denial/sensitivity criteria — all without vendoring any OpenTabs runtime (Wall 1), proven by a 16-assertion scaffold test.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-24T07:05:00Z (approx)
- **Completed:** 2026-06-24T07:14:00Z (approx)
- **Tasks:** 3
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments
- OpenTabs provenance pin (`vendor/opentabs-snapshot/PIN.md`) mirroring the LATTICE-PIN.md discipline: SHA + ref + pinned-at frontmatter, verbatim MIT license body, exact copyright line, an explicit Wall-1 metadata-only statement, and a Per-FSB-Phase log table.
- Two SHA-matched `_provenance.json` scaffolds (`{source,repo,sha,license,pinnedAt,apps:[]}`) for the Phase-36 importer — one vendor-side, one catalog-side under `_fixtures/` — proven NOT to leak into the shipped `recipe-index.generated.js`.
- `docs/LEGAL.md` Categorization Axes subsection naming the three distinct criteria (finance/government denial; ToS-hostility denial with the brokerage + media/social roster; sensitivity with IG/FB/TikTok/X as sensitive-not-denied), built on the existing opt-out posture without reverting it.
- `tests/provenance-scaffold.test.js` (16 assertions, PASS=16 FAIL=0) asserting PIN/SHA/MIT/copyright, vendor-vs-catalog SHA match, the LEGAL axes + named roster, and the Wall-1 no-`.js` guarantee; wired into the `npm test` chain.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create vendor/opentabs-snapshot/PIN.md + _provenance.json** - `2210b01c` (feat)
2. **Task 2: Add catalog-side provenance scaffold under _fixtures/** - `156f8905` (feat)
3. **Task 3: Categorization Axes subsection in LEGAL + scaffold test** - `619e744a` (feat)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP) committed separately as `docs(35-04)`.

## Files Created/Modified
- `vendor/opentabs-snapshot/PIN.md` - OpenTabs metadata provenance pin: SHA + verbatim MIT license + Wall-1 statement + per-phase log table.
- `vendor/opentabs-snapshot/_provenance.json` - vendor-side provenance scaffold (apps:[] for Phase 36).
- `catalog/descriptors/_fixtures/_provenance.json` - catalog-side provenance scaffold, isolated from the shipped descriptor corpus.
- `docs/LEGAL.md` - added the `### Categorization Axes` subsection under `## Service Denylist`.
- `tests/provenance-scaffold.test.js` - scaffold + Wall-1 no-runtime assertions.
- `package.json` - chained `node tests/provenance-scaffold.test.js` into the `test` script next to `service-denylist.test.js`.

## Decisions Made
- **Catalog scaffold location:** placed at `catalog/descriptors/_fixtures/_provenance.json`, not the literal `catalog/descriptors/_provenance.json` the research named. I read both `readJsonDir` implementations (`package-extension.mjs:51-64`, `validate-extension.mjs:80-86`) and confirmed they read every top-level `catalog/descriptors/*.json` — a top-level `_provenance.json` WOULD be inlined into the shipped index and break the snapshot cross-check. The `_fixtures/` sibling is excluded by the non-recursive `readdirSync`. Proven by regenerating the catalog (reports 8 descriptors, SHA absent from `recipe-index.generated.js`, tracked file byte-unchanged) and `validate-extension` passing. (This is the Task-2-sanctioned `_fixtures/` location, not a deviation.)
- **MIT license source:** embedded the canonical MIT body verbatim with the exact OpenTabs copyright line from the verified research facts — hermetic/offline, no live `gh`/network fetch (the critical-notes constraint).
- **Standalone test file:** authored `tests/provenance-scaffold.test.js` as its own file (the research permitted either folding into `service-denylist.test.js` or a standalone test) to keep the criterion-5 provenance/legal assertions + the Wall-1 guard focused and independent.

## Deviations from Plan

None - plan executed exactly as written. (Task 2 explicitly recommended the `_fixtures/` location; I followed that recommendation after reading the `readJsonDir` impls to confirm a top-level placement would leak, so no deviation occurred.)

## Issues Encountered
None. All three tasks verified on the first attempt; the full plan `<verification>` block (provenance test, service-denylist test, validate-extension, vendor-dir contents) passed exit 0.

## Authentication Gates
None - this plan touches no authenticated flow (the OpenTabs SHA + MIT license were embedded offline from verified research facts; no live network fetch).

## Known Stubs
The two `_provenance.json` files ship with `apps: []` — this is an **intentional scaffold**, not an unwired stub. The plan's whole purpose is to land the pin + scaffold; the `apps` array is populated by the **Phase 36** OpenTabs metadata importer (CGEN-01). Documented in PIN.md and in both files' surrounding plan/SUMMARY context.

## Next Phase Readiness
- Phase 36 (codegen pipeline + OpenTabs metadata vendoring) can now import against an auditable, commit-pinned, hermetic provenance anchor: the PIN.md SHA + the two `_provenance.json` scaffolds to populate `apps`.
- Wall 1 is enforced by a CI assertion (`vendor/opentabs-snapshot/` has no `.js`), so the Phase-36 metadata vendoring cannot accidentally introduce OpenTabs runtime.
- The LEGAL Categorization Axes subsection gives the denied roster (Plan 01) a documented legal basis (the ToS-hostility axis distinct from finance sensitivity).
- Remaining Phase 35 work: Plan 02 (classification gate) and Plan 03 (posture-B re-gate) are the other plans in this phase; this plan (04) is independent of them (`depends_on: []`).

## Self-Check: PASSED
- Files: FOUND vendor/opentabs-snapshot/PIN.md, vendor/opentabs-snapshot/_provenance.json, catalog/descriptors/_fixtures/_provenance.json, tests/provenance-scaffold.test.js, docs/LEGAL.md, package.json
- Commits: FOUND 2210b01c, 156f8905, 619e744a

---
*Phase: 35-denylist-expansion-import-time-classification-gate-lands-fir*
*Completed: 2026-06-24*
