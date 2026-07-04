---
status: in-progress
created: 2026-07-01
task: Implement Amazon to be T1 ready
---

# Quick Task: Implement Amazon to be T1 ready

## Scope

Make the Amazon catalog app T1-ready while keeping edits app-scoped:

- Add Amazon head handlers for existing `amazon.*` descriptors.
- Keep public and account reads same-origin and guarded by response shape checks.
- Keep purchase/cancel mutations fail-closed until live mutation-body UAT exists.
- Wire Amazon into the readiness/port-contract handler manifests.
- Add focused Amazon readiness and handler behavior tests.

## Validation

- `node tests/amazon-t1-ready.test.js`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node tests/t1-readiness-report.test.js`
- `node scripts/verify-t1-port-contract.mjs`
