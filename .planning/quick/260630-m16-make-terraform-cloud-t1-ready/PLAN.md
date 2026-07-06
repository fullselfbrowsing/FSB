---
quick_id: 260630-m16
slug: make-terraform-cloud-t1-ready
status: completed
---

# Make Terraform Cloud T1-ready

## Scope

Promote the Terraform Cloud catalog stem from DOM/discovery-only into the current T1 model:

- Read-only Terraform Cloud descriptors resolve to bundled T1a handlers pinned to `https://app.terraform.io`.
- Terraform write/destructive descriptors are explicit guarded fail-closed rows until live mutation-body UAT exists.
- Existing T1 readiness, origin-classification, recipe-path, import, and write-evidence gates recognize the Terraform head.

## Implementation

1. Add `catalog/handlers/terraform.js` and the unpacked extension copy with closed schemas, same-origin `/api/v2` GET specs, JSON:API shape guards, and inert guarded write handlers.
2. Register Terraform in the head module lists, background import list, verifier handler map, readiness loader, coverage loader, origin-classification map, and recipe-path guard allowlist.
3. Add guarded write evidence entries for Terraform write/destructive slugs.
4. Extend focused tests/count tripwires where they intentionally lock the current head set.

## Verification

- `node tests/head-handler-cap.test.js`
- `node tests/verify-origin-classification.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-port-contract-gate.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-write-activation-evidence.mjs`

See `SUMMARY.md` for the completed verification results and unrelated dirty-tree failures.
