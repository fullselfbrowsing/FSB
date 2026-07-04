---
quick_id: 260701-1lj
slug: make-this-app-slack-t1-ready
status: complete
---

# Make This App Slack T1-ready

## Scope

Promote Slack from partial T1 coverage to a complete, conservative T1 surface:

- Safe Slack reads resolve to same-origin `https://app.slack.com` T1a handlers through the existing split-token bound-spec path.
- Slack mutation and destructive descriptors resolve to guarded fail-closed handlers until live mutation-body UAT records endpoint, body, auth carrier, consent, and redaction proof.
- Search readiness, readiness reporting, write-evidence validation, port-contract checks, and focused tests recognize the expanded Slack surface.

## Verification

- `node tests/capability-head-handlers.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/t1-readiness-report.test.js`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-write-activation-evidence.mjs`
- `node tests/t1-terminal-states.test.js`
