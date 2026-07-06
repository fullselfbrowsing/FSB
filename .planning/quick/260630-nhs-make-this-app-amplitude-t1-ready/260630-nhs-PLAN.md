# Quick Task 260630-nhs: Make this app amplitude T1-ready

## Scope

Promote the safe, read-classified Amplitude descriptors to bundled T1a handler execution using the existing same-origin handler pattern. Keep `amplitude.check_permissions` unregistered because its descriptor is currently write-classified and would require write-activation evidence or reclassification work outside this quick task.

## Tasks

1. Add an Amplitude same-origin GraphQL read handler.
   - Files: `catalog/handlers/amplitude.js`, `extension/catalog/handlers/amplitude.js`
   - Action: Implement a T1a handler pinned to `https://app.amplitude.com`, bootstrap org id from a same-origin page read, then POST read-only GraphQL operations to `/t/graphql/org/{orgId}` through `executeBoundSpec`.
   - Verify: Handler exports all read-classified Amplitude slugs and returns typed DOM fallback on missing auth/shape mismatch.

2. Register Amplitude in T1 manifests and readiness surfaces.
   - Files: `extension/background.js`, `extension/utils/capability-catalog.js`, `extension/utils/capability-search.js`, `scripts/report-t1-readiness.mjs`, `scripts/coverage-report.mjs`, `scripts/verify-t1-port-contract.mjs`, `scripts/verify-origin-classification.mjs`, `tests/head-handler-cap.test.js`, `tests/t1-terminal-states.test.js`
   - Action: Add the handler module/global to the same places used by the recent app-specific T1 ports and extend the origin-classification proof for Amplitude's relative GraphQL runtime.
   - Verify: Handler-backed Amplitude rows resolve as T1-ready and search readiness overrides cover them.

3. Add focused tests and run gates.
   - Files: `tests/capability-head-handlers.test.js`
   - Action: Add unit coverage for Amplitude handler registration, origin pinning, bootstrap behavior, GraphQL variables, shape guards, and absence of direct credential/network access.
   - Verify: Run focused T1 handler/readiness/origin/port gates.
