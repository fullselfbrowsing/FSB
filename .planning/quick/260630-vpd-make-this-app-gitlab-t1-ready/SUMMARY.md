---
status: complete
---

# Make This App GitLab T1-ready

## Outcome

GitLab now has complete T1 accounting across all 22 catalog descriptors:

- 16 read-only descriptors resolve through T1a handlers pinned to `https://gitlab.com`
- 6 write descriptors are registered as guarded fail-closed and never call the bound execution primitive
- source and extension handler mirrors match byte-for-byte
- the generated readiness report shows `gitlab`: 22 total, 16 `t1-ready`, 6 `t1-guarded-fail-closed`, 0 discovery, 0 blocked

## Key Files

- `catalog/handlers/gitlab.js`
- `extension/catalog/handlers/gitlab.js`
- `scripts/report-t1-readiness.mjs`
- `extension/utils/capability-search.js`
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/guarded-write-failclosed.test.js`
- `tests/t1-readiness-report.test.js`
- `catalog/write-activation-evidence.json`
- `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.json`
- `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.md`

## Verification

Passed:

- `node -c catalog/handlers/gitlab.js`
- GitLab handler load check: 22 `gitlab.*` handlers
- GitLab handler token/origin scan: no `api.gitlab.com`, `chrome.scripting`, `chrome.tabs`, token, cookie, or CSRF logging matches
- source/extension handler mirror check
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/backing-status-annotation.test.js`
- `node scripts/report-t1-readiness.mjs`
- `node tests/t1-readiness-report.test.js`

Repository-wide gates with unrelated pre-existing failures:

- `node scripts/verify-recipe-path-guard.mjs` fails on an unrelated Facebook allowlist omission.
- `node scripts/verify-write-activation-evidence.mjs` fails on unrelated CircleCI, Coinbase, and New Relic evidence gaps.
- `node scripts/verify-t1-port-contract.mjs` fails on unrelated CircleCI, Coinbase, and New Relic evidence/classification gaps.
- `node scripts/verify-origin-classification.mjs` confirms GitLab as same-origin but fails on unrelated Booking and New Relic unmapped heads.

