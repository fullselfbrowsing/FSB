---
phase: 59-current-user-alerts-release-hardening
plan: "01"
subsystem: alert-foundation
tags: [alerts, owner-mapping, civil-date, storage, purge]
completed: 2026-08-27
requirements-completed: [ALERT-01, ALERT-02, ALERT-04, ALERT-05]
---

# Phase 59 Plan 01 — Alert Foundation Summary

**The extension now has a closed notice-only alert contract, exact civil-date minus-90 derivation, explicit stable owner mapping, durable lifecycle storage, and real corpus-owned alert withdrawal.**

## Delivered

- Added exact private/public alert schemas with bounded hostile-data rejection, distinct authority surfaces, finite caps, and recursively frozen outputs.
- Added a pure engine that admits only a complete, current, exact, eligible governing notice deadline; renewal, expiration, termination, ambiguous, inaccessible, mismatched-recipient, and uncited states do not schedule.
- Computes the alert civil date through the existing strict ordinal engine; the contract fixture proves `2027-05-31 - 90 = 2027-03-02`.
- Owner mapping binds exact stable owner/relation/source revision to the fresh account/corpus partition; identical labels with another stable identity are not locally deliverable.
- Added a versioned trusted-local store with strict read-before-mutate, serialized lifecycle transitions, source ownership, recovery, and a one-use corpus-authorized `alerts` purge participant.
- Trusted boot now constructs and recovers the alert store and engine before corpus recovery. `counts` is the sole remaining empty reserved participant.

## Commits

1. `29b0259f` — failing alert foundation contracts
2. `361e303a` — closed schema and eligibility engine
3. `ceb07bf2` — durable alert store, boot, and purge ownership

## Verification

```text
node tests/skopeo-alert-schema.test.js       PASS
node tests/skopeo-alert-engine.test.js       PASS
node tests/skopeo-alert-store.test.js        PASS
node tests/skopeo-corpus-runtime.test.js     PASS
node tests/skopeo-truth-runtime.test.js      PASS
node scripts/verify-skopeo-storage-boundary.mjs PASS
npm run validate:extension                   PASS (450 JS files)
```

No Chrome alarm, notification, HUD, content, MCP, telemetry, provider, dependency, lockfile, or manifest change was introduced by this plan.

## Next

Plan 59-02 can add injected Chrome alarm/notification effects on top of this durable state machine, with attempt-before-effect and fresh revalidation.
