---
quick_id: 260630-mjd
slug: make-this-app-priceline-t1-ready
status: completed
---

# Make Priceline T1-ready

## Scope

Promote the source-proven Priceline public read subset from DOM/discovery-only into the current T1 model:

- Public Priceline autocomplete/search descriptors resolve to bundled T1a handlers pinned to `https://www.priceline.com`.
- Auth-token GraphQL reads and browser-navigation descriptors remain in the discovery tail until a reviewed token or navigation execution path exists.
- Existing T1 readiness, origin-classification, recipe-path, and head-handler gates recognize the Priceline head.

## Implementation

1. Add `catalog/handlers/priceline.js` and the unpacked extension copy with closed schemas, same-origin GET specs, output shape guards, and no direct network or browser APIs.
2. Register Priceline in the head module list, service-worker import list, readiness loader, origin-classification map, T1 port verifier map, and recipe-path allowlist.
3. Extend focused head-handler, upgrade, cap, and origin-classification tests for the new Priceline rows.

## Verification

- `node tests/head-handler-cap.test.js`
- `node tests/verify-origin-classification.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/capability-head-handlers.test.js`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/report-t1-readiness.mjs`
