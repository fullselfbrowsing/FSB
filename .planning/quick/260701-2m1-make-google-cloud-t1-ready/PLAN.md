---
quick_id: 260701-2m1
slug: make-google-cloud-t1-ready
description: Make Google Cloud T1-ready
date: 2026-07-01
status: planned
---

# Quick Task Plan: Make Google Cloud T1-ready

## Goal

Promote Google Cloud (`gcloud.*`) from catalog-tail discovery rows to the existing T1 readiness model without enabling unverified mutations.

## Existing Convention

- T1-ready means the resolver reaches a current `T1a` handler or `T1b` recipe proof.
- Same-origin or page-owned read handlers can execute through bounded primitives only.
- Write/destructive rows without live mutation-body UAT must be registered as guarded fail-closed and surfaced as `t1-guarded-fail-closed`.
- Search readiness overrides must include every current handler-backed T1 row, and guarded rows must be marked non-invocable.

## Scope

1. Add a `catalog/handlers/gcloud.js` handler and matching extension copy.
2. Add a `gcloud` namespace to `executeBoundPageRead` that runs only whitelisted Google Cloud read actions through the console page's `gapi.client.request` path.
3. Register Google Cloud in the handler manifest, background startup, T1 port verifier, readiness handler module list, and search readiness overrides.
4. Keep `gcloud.disable_service`, `gcloud.enable_service`, `gcloud.get_iam_policy`, `gcloud.list_log_entries`, `gcloud.start_instance`, and `gcloud.stop_instance` guarded fail-closed pending live UAT/classifier work.
5. Add focused handler tests and run the narrowest relevant verification.

## Verification

- `node tests/capability-head-handlers.test.js`
- `node tests/t1-terminal-states.test.js`
- `node tests/pattern-d-gapi-gate.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-pattern-d-gapi-gate.mjs`
