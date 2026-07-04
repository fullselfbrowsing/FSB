---
quick_id: 260630-qjd
slug: make-discord-app-t1-ready
status: complete
---

# Make Discord App T1-ready

## Scope

Promote the Discord catalog stem from discovery-only accounting to current T1 accounting:

- Discord read descriptors resolve to same-origin T1a handlers pinned to `https://discord.com`.
- Discord write/destructive descriptors are explicit guarded fail-closed rows until live mutation-body UAT records the request path, body shape, and auth carrier.
- Search readiness, T1 readiness reporting, write evidence, handler source parity, and focused T1 gates recognize the Discord surface.

## Implementation

1. Add `catalog/handlers/discord.js` and sync `extension/catalog/handlers/discord.js`.
2. Add a narrow `discord-webpack-token` auth source to the bound fetch primitive so Discord tokens are used only inside the page realm and never returned.
3. Register Discord with runtime imports, readiness reporting, search readiness labels, port-contract mapping, dynamic-code guard allowlist, and write activation evidence.
4. Extend focused tests for handler behavior, dom-to-T1a upgrades, guarded fail-closed writes, readiness rows, terminal-state search annotations, and fetch auth-source behavior.
5. Regenerate the Phase 44 T1 readiness report.

## Verification

Focused gates:

- `node tests/capability-fetch.test.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/t1-readiness-report.test.js`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-write-activation-evidence.mjs`
