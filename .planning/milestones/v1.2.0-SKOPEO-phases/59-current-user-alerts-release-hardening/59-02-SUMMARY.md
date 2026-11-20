---
phase: 59-current-user-alerts-release-hardening
plan: "02"
subsystem: alert-runtime
tags: [alarms, notifications, revalidation, evidence, service-worker]
completed: 2026-08-27
requirements-completed: [ALERT-01, ALERT-02, ALERT-03, ALERT-04, ALERT-05]
---

# Phase 59 Plan 02 — Wake-Safe Alert Runtime Summary

**The extension now schedules exact local alert alarms, reconciles durable state across worker wakes, revalidates current corpus/graph/truth/recipient/evidence authority before every notification and click, and records attempted delivery before the Chrome notification effect.**

## Delivered

- Added an injected alert runtime with exact opaque alarm/notification names, timezone-aware 09:00 scheduling, same-civil-date delayed delivery, cross-day missed state, orphan cleanup, concurrent reconcile deduplication, and interrupted-attempt recovery.
- Added the sole new permission, `notifications`, and no new host, content-script, provider, server, telemetry, MCP, or external delivery channel.
- Persists `attempted` before `chrome.notifications.create`, records `delivered` only after confirmed API success, and records closed failure states for permission/API/authority failures.
- Trusted boot recovers the alert store and reconciles durable schedules. The existing single alarm listener routes the alert prefix first; install/startup reconciliation is idempotent and does not reset correct alarms.
- Synchronous notification click/button listeners route only exact private notification IDs. Opening evidence repeats the full current-authority derivation and uses the existing certified citation-open publication boundary before creating a current Google tab.
- Current HUD truth publication joins the exact visible account/corpus partition, current source certificates, graph owner relation, accepted lineage path, one eligible notice deadline, consequence assertion, owner mapping, source revision, and governing notice citation into a closed candidate.
- Private candidate contexts are bounded and controller-scoped. Worker restart or HUD teardown removes in-memory effect authority but preserves durable schedules; unavailable current authority fails closed instead of claiming delivery.

## Commits

1. `68300a4a` — failing wake-safe runtime contract
2. `ad2f23bc` — injected alert runtime and Chrome effect boundary
3. `e81bb6c3` — failing production-wiring contract
4. `11cbe2cb` — current candidate, lifecycle routing, full revalidation, and evidence navigation

## Verification

```text
node tests/skopeo-alert-runtime.test.js          PASS
node tests/skopeo-alert-engine.test.js           PASS
node tests/skopeo-alert-store.test.js            PASS
node tests/skopeo-hud-runtime.test.js            PASS
node tests/skopeo-gap-closure.test.js            PASS
node scripts/verify-skopeo-storage-boundary.mjs  PASS (33 files)
npm run validate:extension                       PASS (451 JS files)
node --check extension/background.js             PASS
git diff --check                                 PASS
```

## Honest Boundary

Native notification display, permission behavior, delayed wake behavior, and governing-evidence navigation still require authorized live Chrome/Drive observation. Automated contracts prove the production control flow and fail-closed mechanics but do not mark those live rows approved.

## Next

Plan 59-03 can project minimized current alert status and add explicit owner mapping/removal confirmation through the existing HUD action lifecycle.
