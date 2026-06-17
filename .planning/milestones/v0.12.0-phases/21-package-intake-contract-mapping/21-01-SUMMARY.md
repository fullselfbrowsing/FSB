---
phase: 21-package-intake-contract-mapping
plan: "01"
subsystem: package-intake
tags: [phantomstream, package-pin, provenance, npm]

requires:
  - phase: 21-package-intake-contract-mapping
    provides: context and approved package source decision
provides:
  - exact npm dependency pin for @full-self-browsing/phantom-stream@0.1.0
  - PhantomStream provenance record with registry tarball and integrity
  - reusable package pin validator and smoke test
affects: [package-json, package-lock, phase-21, phantomstream]

tech-stack:
  added:
    - "@full-self-browsing/phantom-stream@0.1.0"
  patterns: [package-pin-validation, provenance-record, source-name-correction]

key-files:
  created:
    - .planning/PHANTOMSTREAM-PIN.md
    - tests/helpers/phantom-stream-public-pin.js
    - tests/phantom-stream-public-package.test.js
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "FSB consumes `@full-self-browsing/phantom-stream@0.1.0` from npm; the old `@fullselfbrowsing/phantom-stream` name is recorded only as a stale E404 source."
  - "No GitHub/tarball fallback is authorized while the npm package remains installable and the smoke tests pass."
  - "Package provenance is locked by package.json, package-lock integrity, `.planning/PHANTOMSTREAM-PIN.md`, and a focused Node smoke test."

patterns-established:
  - "Use a helper under `tests/helpers/` to cross-check package metadata, lockfile metadata, pin frontmatter, and installed package metadata."

requirements-completed: ["PKG-01", "PKG-03"]

duration: 8 min
completed: 2026-06-17
---

# Phase 21 Plan 01: Package Source And Provenance Summary

**PhantomStream is pinned from npm with exact registry provenance and a focused smoke test.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-17T17:24:00Z
- **Completed:** 2026-06-17T17:31:42Z
- **Tasks:** 3
- **Files modified:** 5 task files plus this summary

## Accomplishments

- Installed `@full-self-browsing/phantom-stream@0.1.0` exactly in `package.json` and `package-lock.json`.
- Confirmed the package-lock entry uses registry tarball `https://registry.npmjs.org/@full-self-browsing/phantom-stream/-/phantom-stream-0.1.0.tgz` and integrity `sha512-Hf6K0bjAT5M9dUs7Xw1NB2Cb8hkmiMz7KDO0rq5mRkDKmQnLY1sTqTXwIX2r5gjLKVkl3TCemr3hSucVc1k69g==`.
- Created `.planning/PHANTOMSTREAM-PIN.md` with source, version, tarball, integrity, shasum, publish timestamp, and stale-name rejection.
- Added `tests/helpers/phantom-stream-public-pin.js` and `tests/phantom-stream-public-package.test.js`.
- Verified installed metadata name, version, ESM type, license, export paths, and absence of the stale package name.

## Task Commits

1. **Task 1: Install the exact PhantomStream package** - `94750f0f` (`chore`)
2. **Task 2: Record package provenance** - `e6607d54` (`docs`)
3. **Task 3: Add pin validator and smoke test** - `7727f361` (`test`)

## Files Created/Modified

- `package.json` - exact dependency `@full-self-browsing/phantom-stream: 0.1.0`.
- `package-lock.json` - registry tarball, integrity, and transitive `ws@8.21.0`.
- `.planning/PHANTOMSTREAM-PIN.md` - Phase 21 package source record.
- `tests/helpers/phantom-stream-public-pin.js` - validator for package.json, lockfile, pin file, and installed metadata.
- `tests/phantom-stream-public-package.test.js` - focused public package smoke.

## Decisions Made

- Corrected the active package source to `@full-self-browsing/phantom-stream@0.1.0`.
- Treated `@fullselfbrowsing/phantom-stream` as a rejected stale source because npm returns `E404`.
- Kept this plan limited to package intake; no production stream code imports PhantomStream yet.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- `npm install` reported 2 audit findings (1 moderate, 1 high). They were not auto-fixed because `npm audit fix` could change unrelated dependency versions outside the Phase 21 package-intake scope.

## User Setup Required

None.

## Gate Evidence

Executed successfully:

```bash
node -e "const p=require('./package.json'); if (p.dependencies['@full-self-browsing/phantom-stream'] !== '0.1.0') process.exit(1)"
grep -n "@full-self-browsing/phantom-stream\\|sha512-Hf6K0bj" .planning/PHANTOMSTREAM-PIN.md
node --check tests/helpers/phantom-stream-public-pin.js
node --check tests/phantom-stream-public-package.test.js
node tests/phantom-stream-public-package.test.js
git diff --check
```

`node tests/phantom-stream-public-package.test.js` passed 15 assertions.

## Next Phase Readiness

Ready for `21-02-PLAN.md`: package export/API smoke tests and ESM/MV3 feasibility check.

## Self-Check: PASSED

- Package source is exact and locked.
- Provenance is recorded in planning docs.
- Focused pin smoke passes.
- No production migration was attempted in Plan 21-01.

---
*Phase: 21-package-intake-contract-mapping*
*Completed: 2026-06-17*
