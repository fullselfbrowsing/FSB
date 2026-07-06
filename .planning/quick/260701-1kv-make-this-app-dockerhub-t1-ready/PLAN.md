---
quick_id: 260701-1kv
slug: make-this-app-dockerhub-t1-ready
status: complete
---

# Make This App DockerHub T1-ready

## Scope

Promote Docker Hub descriptors to a conservative bundled T1 surface:

- Safe Docker Hub reads resolve to same-origin `https://hub.docker.com` T1a handlers.
- Repository create/update/delete descriptors resolve to guarded fail-closed handlers until live mutation-body UAT records endpoint, body, auth carrier, consent, and redaction proof.
- Search readiness, readiness reporting, guarded-write evidence, origin classification, port-contract checks, and focused tests recognize the Docker Hub surface.

## Verification

- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-readiness-gate.test.js`
- `node tests/t1-terminal-states.test.js`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-write-activation-evidence.mjs`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/coverage-report.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `npm run validate:extension`
