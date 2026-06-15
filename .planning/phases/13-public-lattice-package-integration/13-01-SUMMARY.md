---
phase: 13-public-lattice-package-integration
plan: 01
type: summary
status: complete
completed: 2026-06-15
source: retrospective-gsd-backfill
requirements_completed:
  - FINT-25
  - FINT-26
  - FINT-27
  - FINT-28
---

# Phase 13 Plan 01 Summary: Public Lattice Package Replug

## Accomplishments

- Replaced the local Lattice dependency with the public npm alias:
  `"lattice": "npm:@full-self-browsing/lattice@1.3.0"`.
- Added `@full-self-browsing/lattice-cli@1.3.0` for CLI verification workflows.
- Raised the root Node engine floor to `>=24.0.0`, matching the public runtime and CLI.
- Updated `package-lock.json` so `node_modules/lattice` resolves to `@full-self-browsing/lattice@1.3.0` with registry integrity
  `sha512-w7cm8b+FFLcN9e1kRWDL0LaDZunAdMhlBFOrsIrryYV5cQifBKfjd0mlStYqwaHYhgm1TQvyw8BIac0lN4JszA==`.
- Added `tests/helpers/lattice-public-pin.js` to validate package/package-lock/LATTICE-PIN coherence and prevent drift back to `file:./lattice/packages/lattice`.
- Added `tests/lattice-public-package.test.js` to validate installed package metadata, Node engine, runtime exports, receipt schema `lattice-receipt/v1.2`, and CLI command surface.
- Updated existing Lattice smokes to validate the public package receipt schema while preserving behavior checks for signatures, routes, step markers, checkpoint hooks, provider factories, survivability, provider bridge, and step emitter wiring.
- Regenerated `extension/dist/offscreen/lattice-host.js` from the public dependency graph.
- Updated milestone docs to record Phase 13 and the public package pin model.

## Files Created

- `.planning/phases/13-public-lattice-package-integration/13-CONTEXT.md`
- `.planning/phases/13-public-lattice-package-integration/13-01-PLAN.md`
- `.planning/phases/13-public-lattice-package-integration/13-01-SUMMARY.md`
- `.planning/phases/13-public-lattice-package-integration/13-VERIFICATION.md`
- `tests/helpers/lattice-public-pin.js`
- `tests/lattice-public-package.test.js`

## Files Modified

- `package.json`
- `package-lock.json`
- `.planning/LATTICE-PIN.md`
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `extension/offscreen/lattice-host.js`
- `extension/dist/offscreen/lattice-host.js`
- existing Lattice smoke tests under `tests/`

## Verification Results

| Check | Result |
|-------|--------|
| `node tests/lattice-public-package.test.js` | PASS |
| `npm run test:lattice` | PASS |
| `npm run build` | PASS |
| `npm test` | PASS |
| `npm audit --omit=dev` | PASS |
| `npm ls lattice @full-self-browsing/lattice-cli --depth=0` | PASS |

## Residual Risk

- Root full dev audit still reports an existing direct `esbuild@0.24.2` advisory with a semver-major fix. This was not introduced or fixed by Phase 13.
- Nested dependency installs for `mcp`, `showcase/server`, and `showcase/angular` reported existing audit findings during full verification setup. Those are outside the Lattice package replug scope.
- `.planning/v0.10.0-MILESTONE-AUDIT.md` was already dirty before this work and was not changed by this phase.

## GSD Correction

The implementation initially landed with top-level planning doc updates but without a phase directory under `.planning/phases`. This summary and sibling artifacts backfill the missing GSD record. The underlying implementation and verification were already complete; this file makes the work discoverable by the GSD phase tools.
