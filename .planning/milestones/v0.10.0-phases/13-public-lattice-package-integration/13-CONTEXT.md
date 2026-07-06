---
phase: 13-public-lattice-package-integration
gathered: 2026-06-15
status: implemented
source: retrospective-gsd-backfill
---

# Phase 13: Public Lattice Package Integration - Context

## Domain

Phase 13 replaces FSB's local development dependency on the gitignored Lattice checkout with the public Lattice package available on npm as of 2026-06-15.

The previous integration model used:

- `package.json` dependency: `"lattice": "file:./lattice/packages/lattice"`
- a local clone under `./lattice/`
- source pinning through `.planning/LATTICE-PIN.md`
- local-clone receipt schema expectations in the FSB smoke tests

The new integration model uses:

- package alias: `"lattice": "npm:@full-self-browsing/lattice@1.3.0"`
- dev CLI: `"@full-self-browsing/lattice-cli": "1.3.0"`
- root Node engine: `>=24.0.0`
- package-lock integrity pin:
  `sha512-w7cm8b+FFLcN9e1kRWDL0LaDZunAdMhlBFOrsIrryYV5cQifBKfjd0mlStYqwaHYhgm1TQvyw8BIac0lN4JszA==`
- source audit pin: tag `v1.3.0`, commit `069c9aea4b5875393c96ad7e6ffeec4afbe70f34`

## Decisions

- Keep the existing runtime import specifier `from "lattice"`. The alias prevents extension/offscreen import churn while moving the actual package source to npm.
- Do not use the unscoped npm package named `lattice`; it is unrelated to the FSB/Lattice project.
- Treat `@full-self-browsing/lattice@1.3.0` as the active package boundary. FSB integration code should validate the public package exports instead of reaching into a local checkout.
- Add `@full-self-browsing/lattice-cli@1.3.0` for receipt verification workflows and CLI surface checks.
- Update FSB receipt-version expectations to the public package schema `lattice-receipt/v1.2`.
- Replace local-clone byte-freeze assertions with package-pin coherence assertions where the assertion is about the active dependency source.
- Preserve existing behavior checks for DSSE signature verification, routes, optional step markers, checkpoint events, provider factories, survivability, provider bridge, and step emitter wiring.

## Scope In

- `package.json` and `package-lock.json` dependency replug.
- Root Node engine alignment to the public package engine.
- `extension/offscreen/lattice-host.js` comment update and regenerated offscreen bundle.
- New public package pin helper and smoke test.
- Existing Lattice smoke tests updated for public package receipt schema.
- Planning docs updated to record Phase 13 and the new package pin model.

## Scope Out

- Rewriting FSB's provider bridge to call Lattice's higher-level agent or crew runtime APIs.
- Reworking prompt construction, tool-call validation, or model negotiation around public `1.3.0` helpers.
- Removing historical Phase 1-12 local-clone audit history from `.planning/LATTICE-PIN.md`.
- Closing older non-Lattice dependency audit findings.

## Verification Expectations

- `npm run test:lattice` exits 0.
- `npm run build` exits 0.
- full `npm test` exits 0.
- `npm audit --omit=dev` exits 0 at the root.
- `npm ls lattice @full-self-browsing/lattice-cli --depth=0` shows the public runtime alias and CLI at `1.3.0`.
- GSD can find `.planning/phases/13-public-lattice-package-integration/` and its verification record.

## GSD Note

The code implementation and automated tests completed before this phase directory existed. This artifact set backfills the missing GSD phase record so the milestone is auditable through the normal `.planning/phases/NN-*` structure.
