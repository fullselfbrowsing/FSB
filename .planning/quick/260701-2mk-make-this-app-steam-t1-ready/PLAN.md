---
quick_id: 260701-2mk
slug: make-this-app-steam-t1-ready
status: in_progress
---

# Make This App Steam T1-ready

## Scope

Promote the already-imported Steam descriptors to a conservative bundled T1 surface:

- Safe Steam store reads resolve to same-origin `https://store.steampowered.com` T1a handlers.
- Steam wishlist/follow/ignore/discovery-queue mutation-like descriptors resolve to guarded fail-closed handlers until live mutation-body UAT records endpoint, body, auth carrier, consent, and redaction proof.
- Search readiness, readiness reporting, guarded-write evidence, origin classification, port-contract checks, and focused tests recognize the Steam surface.

## Tasks

1. Add Steam handler modules in `catalog/handlers/steam.js` and `extension/catalog/handlers/steam.js`.
2. Wire Steam into the T1 resolver, readiness/reporting/verifier allowlists, and guarded-write evidence.
3. Extend focused tests for handler behavior, dom->T1a upgrades, guarded fail-closed writes, readiness, origin classification, and extension validation.

## Verification

- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-write-activation-evidence.mjs`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/coverage-report.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `npm run validate:extension`
