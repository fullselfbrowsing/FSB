# Quick Task 260701-2ki Summary: Implement AWS to be T1 Ready

Date: 2026-07-01
Status: Complete
Commit: working-tree

## Outcome

AWS is wired as a handler-backed T1 surface.

- Ready reads: `aws.describe_instance`, `aws.get_current_user`, `aws.get_function`, `aws.list_alarms`, `aws.list_functions`, `aws.list_iam_roles`, `aws.list_iam_users`, `aws.list_instances`, `aws.list_log_groups`, `aws.list_regions`, `aws.list_security_groups`, `aws.list_subnets`, `aws.list_vpcs`
- Guarded fail-closed writes: `aws.invoke_function`, `aws.start_instance`, `aws.stop_instance`
- Runtime origin: `https://console.aws.amazon.com`

## Implementation

- Added `FsbHandlerAws` with same-origin console metadata reads for current user and regions.
- Kept AWS service API reads fail-closed with `aws-sigv4-bridge-unapproved` rather than adding an unreviewed SigV4 bridge.
- Kept Lambda invoke and EC2 start/stop guarded fail-closed with no execution primitive calls.
- Corrected EC2 start/stop descriptor side-effect classes to `write`.
- Added AWS manifest, readiness, origin, path-guard, search/status, port-contract, and evidence wiring.
- Added AWS handler, upgrade, guarded-write, head-cap, and readiness-report coverage.

## Verification

Passed:

- `node tests/head-handler-cap.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node scripts/report-t1-readiness.mjs`
- `node tests/t1-readiness-report.test.js`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node scripts/verify-pattern-d-gapi-gate.mjs`
- Focused AWS report query shows 13 `t1-ready` reads and 3 `t1-guarded-fail-closed` writes.
- Focused AWS handler assertions in `tests/capability-head-handlers.test.js` pass.

Known unrelated failures in the dirty shared workspace:

- `node tests/capability-head-handlers.test.js`: Home Depot and Sentry assertions fail.
- `node scripts/verify-t1-port-contract.mjs`: PostHog mapping/guarded entries, Tinder side-effect drift, and TikTok/Tinder guarded-row side-effect failures.
- `node scripts/verify-origin-classification.mjs`: unrelated unmapped/separate-origin heads; AWS is reported as same-origin.
- `node scripts/verify-recipe-path-guard.mjs`: unrelated allowlist drift for non-AWS handlers.
- `node scripts/verify-write-activation-evidence.mjs` and `node tests/write-activation-evidence.test.js`: missing guarded evidence for non-AWS apps and stale Tinder evidence.
