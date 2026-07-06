---
quick_id: 260701-e6c
slug: implement-this-supabase-to-be-t1-ready-u
status: complete
completed_at: "2026-07-01T10:30:15-05:00"
code_commit: 2619d949
---

# Supabase T1 Readiness Summary

## Outcome

Supabase is T1-ready in this repo as a bundled `T1a` head:

- 19 read-only Supabase Management API descriptors resolve as `t1-ready` with handler proof.
- Reads delegate through the bounded `executeBoundPageRead` primitive pinned to `https://supabase.com`.
- The page-read primitive reads `supabase.dashboard.auth.token` only inside the Supabase page context and calls `https://api.supabase.com/v1` with `Authorization: Bearer ...`, `credentials: 'omit'`, and `redirect: 'manual'`.
- 7 mutation/query descriptors remain `t1-guarded-fail-closed` with inert handlers returning `RECIPE_DOM_FALLBACK_PENDING` until live mutation-body UAT exists.

## Changed Files

- `catalog/handlers/supabase.js`
- `extension/catalog/handlers/supabase.js`
- `extension/utils/capability-fetch.js`
- `extension/utils/capability-catalog.js`
- `extension/background.js`
- `extension/utils/capability-search.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/coverage-report.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `scripts/verify-origin-classification.mjs`
- `tests/supabase-t1-ready.test.js`
- `tests/head-handler-cap.test.js`
- `tests/pattern-d-gapi-gate.test.js`
- `tests/verify-origin-classification.test.js`
- `catalog/write-activation-evidence.json`

## Verification

Passed:

- `node --check catalog/handlers/supabase.js`
- `node --check extension/catalog/handlers/supabase.js`
- `node --check extension/utils/capability-fetch.js`
- `node --check extension/utils/capability-catalog.js`
- `node --check extension/utils/capability-search.js`
- `node --check scripts/verify-origin-classification.mjs`
- `node --check tests/supabase-t1-ready.test.js`
- `node --check tests/verify-origin-classification.test.js`
- `node tests/supabase-t1-ready.test.js` -> 39 passed, 0 failed
- `node tests/head-handler-cap.test.js` -> 5 passed, 0 failed
- `node scripts/verify-write-activation-evidence.mjs` -> PASS
- `node scripts/verify-t1-readiness-gate.mjs` -> PASS

Known unrelated failures in the concurrent working tree:

- `node tests/pattern-d-gapi-gate.test.js` -> fails because the current catalog has no GAPI bridge candidates; Supabase rows pass the new assertion.
- `node scripts/verify-t1-port-contract.mjs` -> fails on gmaps/posthog/teams verifier mappings and guarded entries, not Supabase.
- `node scripts/verify-recipe-path-guard.mjs` -> fails on allowlist drift for other handler files, not Supabase.
- `node scripts/verify-origin-classification.mjs` and `node tests/verify-origin-classification.test.js` -> Supabase classifies as `PAGE-BEARER-READ`; remaining failures are unrelated unmapped heads.

## Notes

Supabase endpoint/auth shape was checked against the official Supabase Management API reference, which documents authenticated HTTPS calls to `https://api.supabase.com/v1` and the relevant project, organization, storage, function, secrets, analytics log, advisors, and database endpoints.
