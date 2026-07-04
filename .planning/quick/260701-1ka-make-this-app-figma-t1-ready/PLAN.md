---
quick_id: 260701-1ka
slug: make-this-app-figma-t1-ready
status: complete
---

# Make This App Figma T1-ready

## Scope

Promote the Figma catalog descriptors to a conservative T1 posture:

- Safe Figma reads resolve to same-origin `https://www.figma.com` T1a handlers using `executeBoundSpec` against the first-party `/api` path.
- Figma mutation descriptors resolve to guarded fail-closed handlers until live mutation-body UAT records endpoint, body shape, CSRF/auth carrier, consent, and redaction evidence.
- Search readiness, readiness reports, write-evidence validation, port-contract checks, origin/path guards, and focused tests recognize the Figma surface.

## Verification

- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `node tests/write-activation-evidence.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/coverage-report.mjs`
- `node scripts/verify-origin-classification.mjs` validates Figma as same-origin but currently exits nonzero because an existing Instacart head lacks an origin-map entry.
