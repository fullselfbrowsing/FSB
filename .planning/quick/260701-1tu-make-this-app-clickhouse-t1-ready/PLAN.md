---
quick_id: 260701-1tu
slug: make-this-app-clickhouse-t1-ready
status: complete
---

# Make This App ClickHouse T1-ready

## Scope

Promote ClickHouse Cloud read capabilities from discovery-pending catalog rows to conservative T1a execution:

- Add a ClickHouse bundled head for safe read-only actions on `https://console.clickhouse.cloud`.
- Register the head in extension loading, catalog construction, search readiness, readiness reporting, and T1 port-contract verification.
- Implement the page-context read primitive for cached console data, authenticated control-plane reads, and public status reads without exposing tokens to extension-space code.
- Add focused tests that prove the handler is read-only, fails closed without the page-read primitive, and maps representative ClickHouse page reads correctly.

## Verification

- `node tests/capability-head-handlers.test.js`
- `node tests/capability-fetch.test.js`
- `node tests/t1-readiness-report.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `node tests/verify-origin-classification.test.js`
- `node tests/t1-terminal-states.test.js`
