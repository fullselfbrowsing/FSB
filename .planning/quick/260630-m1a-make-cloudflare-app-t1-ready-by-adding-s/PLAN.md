---
quick_id: 260630-m1a
type: quick
status: complete
created: 2026-06-30
---

# Make Cloudflare T1-ready

## Goal

Promote safe Cloudflare dashboard reads to T1a by adding a same-origin bundled head handler that uses the logged-in `dash.cloudflare.com` session through `executeBoundSpec`.

## Scope

- Add a Cloudflare handler under `catalog/handlers/` and the unpacked extension copy.
- Register only read-side Cloudflare slugs; leave write/destructive Cloudflare operations unregistered until live mutation-body UAT exists.
- Keep all execution pinned to `https://dash.cloudflare.com`; do not target `api.cloudflare.com`, browser storage, bearer tokens, or direct network calls.
- Wire the handler through background loading, the head manifest, T1 readiness/contract scripts, coverage, and origin classification.
- Add regression coverage for dashboard bootstrap, `x-atok` header scoping, REST envelope guards, GraphQL reads, account-id derivation, and missing-account fail-closed behavior.

## Verification

- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/verify-origin-classification.test.js`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node tests/lattice-provider-bridge-smoke.test.js`

