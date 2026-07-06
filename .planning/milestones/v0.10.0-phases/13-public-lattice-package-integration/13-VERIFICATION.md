---
phase: 13-public-lattice-package-integration
verified: 2026-06-15
verdict: passed
status: passed
automated_status: passed
score: 10 of 10 automated gates verified
human_verification: not_required
source: retrospective-gsd-backfill
---

# Phase 13 Verification

## Verdict

Phase 13 passes automated verification. The public package integration is wired, pinned, built, and covered by focused plus full test runs. No human UAT is required because this phase changes the package boundary and test guardrails, not a new Chrome UI workflow.

## Automated Gates

| Gate | Expected | Status |
|------|----------|--------|
| Public runtime package | `lattice` alias resolves to `@full-self-browsing/lattice@1.3.0` | PASS |
| Public CLI package | `@full-self-browsing/lattice-cli@1.3.0` installed | PASS |
| Lockfile integrity | package-lock integrity matches `.planning/LATTICE-PIN.md` | PASS |
| Node engine | root engine is `>=24.0.0` | PASS |
| Receipt schema | public runtime emits/verifies `lattice-receipt/v1.2` | PASS |
| Runtime exports | package smoke verifies core receipt, provider, checkpoint, survivability, agent, crew, sanitizer, and rate-limit exports | PASS |
| CLI surface | `lattice --help` exposes `repro`, `verify`, and `eval` command surface | PASS |
| Focused Lattice tests | `npm run test:lattice` exits 0 | PASS |
| Extension build | `npm run build` exits 0 | PASS |
| Full repo test chain | `npm test` exits 0 | PASS |

## Commands Run

- `node tests/lattice-public-package.test.js`
- `npm run test:lattice`
- `npm run build`
- `npm test`
- `npm audit --omit=dev`
- `npm ls lattice @full-self-browsing/lattice-cli --depth=0`
- `node "$HOME/.codex/get-shit-done/bin/gsd-tools.cjs" init verify-work 13`

## Evidence

- `package.json` uses `"lattice": "npm:@full-self-browsing/lattice@1.3.0"`.
- `package-lock.json` resolves `node_modules/lattice` to package name `@full-self-browsing/lattice`, version `1.3.0`.
- `.planning/LATTICE-PIN.md` frontmatter records package source `npm`, package version `1.3.0`, source tag `v1.3.0`, source commit `069c9aea4b5875393c96ad7e6ffeec4afbe70f34`, and registry integrity.
- `tests/lattice-public-package.test.js` validates the installed package boundary and CLI.
- Existing Lattice smoke tests validate behavior against the public package and receipt schema `lattice-receipt/v1.2`.

## Remaining Non-Blocking Items

- Existing root dev audit issue in `esbuild@0.24.2` remains outside Phase 13.
- Existing nested package audit issues reported during full verification setup remain outside Phase 13.
- Consolidated Chrome MV3 UAT for earlier UI phases remains separate from Phase 13.
