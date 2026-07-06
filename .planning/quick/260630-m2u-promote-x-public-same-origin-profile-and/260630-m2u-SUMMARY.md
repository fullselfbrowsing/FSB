---
quick_id: 260630-m2u
description: Promote X public same-origin profile and tweet reads to T1-ready
status: complete
date: 2026-06-30
commit: working-tree
---

# Quick Task 260630-m2u Summary

## Result

Promoted the safe public X read surface to T1a:

- `x.get_tweet`
- `x.get_user_profile`

Both rows now resolve as handler-backed `t1-ready` in the generated readiness report:

- `resolvedTier: T1a`
- `runtimeOrigin: https://x.com`
- `authPattern: bound-handler`
- `routeFeasibility: same-origin-proven`
- `proof: handler`

Authenticated timelines, search, bookmarks, engagement lists, list management, and mutation-like X rows remain unregistered in the handler and stay in the catalog tail.

## Implementation

- Added `catalog/handlers/x.js` and synced `extension/catalog/handlers/x.js`.
- Wired `FsbHandlerX` into the extension background import path and head-handler manifest.
- Added X to the readiness report, T1 port-contract verifier, coverage report, path guard, origin-classification proof, search readiness override, upgrade test, terminal-state check, and head-handler behavior test.
- Kept the X origin proof pinned to public first-party HTML pages, explicitly ignoring the vendored authenticated GraphQL base for this quick head.

## Verification

Passed:

- `node scripts/report-t1-readiness.mjs` -> `descriptors=2314 apps=128 ready=256 guarded=33 learn=0 discovery=1831 blocked=194`
- `node scripts/verify-t1-readiness-gate.mjs` -> pass
- `node scripts/verify-t1-port-contract.mjs` -> pass
- `node scripts/verify-origin-classification.mjs` -> pass, with `FsbHandlerX` same-origin at `https://x.com/`
- `node tests/verify-origin-classification.test.js` -> 77 passed, 0 failed
- `node tests/head-handler-cap.test.js` -> 5 passed, 0 failed
- `node tests/head-handler-upgrade.test.js` -> 1029 passed, 0 failed
- `node scripts/verify-recipe-path-guard.mjs` -> pass
- `node tests/lattice-provider-bridge-smoke.test.js` -> 101 passed, 0 failed

Residual workspace-wide failures not caused by the X quick task:

- `node tests/capability-head-handlers.test.js` has one failing non-X Stripe assertion: `stripe.search_payment_intents maps Stripe search syntax into a /v1 search query`. The X section in that file passed.
- `node tests/t1-terminal-states.test.js` fails on non-X Bsky, Cloudflare, Terraform, and Twilio readiness/evidence coverage. Its explicit X terminal-state assertion passed.

No commit was created because this Conductor workspace already contains many unrelated in-flight changes.
