---
status: complete
---

# Make This App Netlify T1-ready

## Outcome

Netlify now has complete T1 accounting across all 40 catalog descriptors:

- 20 read-only Netlify descriptors resolve through T1a handlers pinned to `https://app.netlify.com`.
- 1 read-only Netlify descriptor, `netlify.get_current_user`, remains on the existing generated T1b same-origin recipe path.
- 19 Netlify write/destructive descriptors are registered as guarded fail-closed rows and never call `executeBoundSpec`.
- The canonical handler and unpacked extension handler copy match byte-for-byte.
- The generated readiness report now shows `netlify`: 40 total, 21 ready, 19 guarded, 0 discovery, 0 blocked.

## Key Files

- `catalog/handlers/netlify.js`
- `extension/catalog/handlers/netlify.js`
- `extension/utils/capability-search.js`
- `scripts/report-t1-readiness.mjs`
- `catalog/write-activation-evidence.json`
- `tests/head-handler-upgrade.test.js`
- `tests/guarded-write-failclosed.test.js`
- `tests/t1-readiness-report.test.js`
- `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.md`
- `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.json`

## Verification

Passed:

- Netlify readiness rollup: 21 `t1-ready`, 19 `t1-guarded-fail-closed`.
- `node tests/head-handler-upgrade.test.js`
- `node tests/generated-same-origin-read-recipes.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node scripts/verify-recipe-path-guard.mjs`
- `node tests/backing-status-annotation.test.js`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/verify-write-activation-evidence.mjs`
- `node tests/t1-readiness-report.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `node tests/capability-head-handlers.test.js`
