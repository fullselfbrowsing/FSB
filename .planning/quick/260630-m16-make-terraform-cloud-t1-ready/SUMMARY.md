---
status: complete
---

# Make Terraform Cloud T1-ready

## Outcome

Terraform Cloud now has a bundled T1a handler surface:

- 21 read-only Terraform descriptors resolve through app-specific handlers pinned to `https://app.terraform.io` and `/api/v2` same-origin requests.
- 17 write/destructive Terraform descriptors are explicit guarded fail-closed rows with `RECIPE_DOM_FALLBACK_PENDING` evidence until live mutation UAT exists.
- The canonical handler and unpacked extension handler copy match byte-for-byte.

## Key Files

- `catalog/handlers/terraform.js`
- `extension/catalog/handlers/terraform.js`
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `catalog/write-activation-evidence.json`
- `tests/head-handler-cap.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/guarded-write-failclosed.test.js`
- `tests/verify-origin-classification.test.js`
- `tests/capability-head-handlers.test.js`
- `tests/lattice-provider-bridge-smoke.test.js`

## Verification

Passed:

- Terraform readiness filter: 21 `t1-ready`, 17 `t1-guarded-fail-closed`.
- `node tests/head-handler-cap.test.js`
- `node tests/verify-origin-classification.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/t1-readiness-report.test.js`
- `node scripts/verify-write-activation-evidence.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node tests/t1-port-contract-gate.test.js`
- `node scripts/verify-recipe-path-guard.mjs`
- `node tests/capability-head-handlers.test.js`
- `node tests/lattice-provider-bridge-smoke.test.js`
