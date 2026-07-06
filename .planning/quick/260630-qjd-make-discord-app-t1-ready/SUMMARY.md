---
quick_id: 260630-qjd
slug: make-discord-app-t1-ready
status: complete
completed_at: "2026-07-01T00:25:36Z"
commit: working-tree
---

# Make Discord App T1-Ready

## Result

Discord now has a bundled T1a read-handler surface and guarded fail-closed mutation surface:

- 13 Discord read descriptors resolve as `t1-ready` with handler proof.
- 13 Discord write/destructive descriptors resolve as guarded fail-closed until live mutation-body UAT evidence exists.
- Discord same-origin API reads are pinned to `https://discord.com/api/v9`.
- Discord auth is sourced in-page from the Discord webpack module cache and injected only into the request `Authorization` header; the token is not returned or logged.
- The canonical handler and unpacked extension handler copy match byte-for-byte.

## Key Files

- `catalog/handlers/discord.js`
- `extension/catalog/handlers/discord.js`
- `extension/utils/capability-fetch.js`
- `extension/utils/capability-search.js`
- `extension/background.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `catalog/write-activation-evidence.json`
- `tests/capability-fetch.test.js`
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/guarded-write-failclosed.test.js`
- `tests/t1-readiness-report.test.js`
- `tests/t1-terminal-states.test.js`

## Verification

Passed:

- Discord readiness filter: 13 `t1-ready`, 13 guarded fail-closed, 0 discovery/blocked rows.
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
- `node tests/t1-terminal-states.test.js`
- `node tests/t1-tail-worklist.test.js`
