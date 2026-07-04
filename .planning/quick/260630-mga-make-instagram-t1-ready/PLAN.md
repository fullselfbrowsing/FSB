---
quick_id: 260630-mga
slug: make-instagram-t1-ready
status: complete
---

# Make Instagram T1-ready

## Scope

Promote the Instagram catalog stem into the current T1 model:

- Read-only Instagram descriptors resolve to a bundled T1a handler pinned to `https://www.instagram.com`.
- Instagram write-like descriptors remain guarded fail-closed until live mutation-body UAT exists.
- Existing T1 readiness, origin-classification, recipe-path, port-contract, and write-evidence gates recognize the Instagram head.

## Implementation

1. Add `catalog/handlers/instagram.js` and the unpacked extension copy with closed schemas, same-origin `/api/v1` specs, cookie CSRF binding, and JSON shape guards.
2. Register Instagram in the head module lists, background import list, readiness loader, coverage loader, verifier handler map, origin-classification map, and recipe-path guard allowlist.
3. Add guarded write evidence entries for Instagram write-like slugs.
4. Extend focused tests and count tripwires that intentionally lock the current head set.

## Result

- Instagram now has 28 T1a handler-backed rows: 18 same-origin read rows and 10 guarded fail-closed write/POST rows.
- Read rows use bound `/api/v1` specs on `https://www.instagram.com` with cookie CSRF injection and Instagram web headers.
- Write-like rows remain fail-closed pending live mutation-body UAT and are recorded in the write-activation evidence ledger.
- The shared readiness/origin/port/evidence gates classify Instagram as sensitive, not denied, with handler proof.

## Verification

- Passed: Terraform-style readiness filter for `instagram.*` (`28` Instagram rows, `18` read + `10` write, `0` readiness validation failures).
- Passed: `node tests/head-handler-cap.test.js`
- Passed: `node tests/verify-origin-classification.test.js`
- Passed: `node tests/head-handler-upgrade.test.js`
- Passed: `node tests/guarded-write-failclosed.test.js`
- Passed: `node tests/t1-readiness-report.test.js`
- Passed: `node scripts/verify-write-activation-evidence.mjs`
- Passed: `node scripts/verify-t1-port-contract.mjs`
- Passed: `node tests/t1-port-contract-gate.test.js`
- Passed: `node scripts/verify-recipe-path-guard.mjs`
- Passed: `node tests/capability-head-handlers.test.js`
- Passed: `node tests/lattice-provider-bridge-smoke.test.js`
- Passed: `node tests/service-denylist.test.js`
