---
phase: 17-refresh-poll-watch-tab-owning-background-reload
reviewed: 2026-06-16T18:43:44Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - extension/background.js
  - extension/content/messaging.js
  - extension/utils/trigger-lifecycle.js
  - extension/utils/trigger-manager.js
  - package.json
  - tests/trigger-observe.test.js
  - tests/trigger-refresh-poll.test.js
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-06-16T18:43:44Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the listed Phase 17 refresh-poll files. The core path uses explicit tab IDs, avoids active-tab lookup/focus activation, avoids `sendMessageWithRetry`, blocks missing elements and blocked pages before evaluation, and delegates fired/no-fire decisions to `FsbTriggerLifecycle.handleTriggerAlarm`.

Two correctness gaps remain: refresh-poll ownership-token validation is effectively bypassed for newly armed snapshots, and some handled failure paths can consume the one-shot alarm while leaving the snapshot armed with no replacement alarm. The targeted tests and syntax checks pass, but the refresh-poll tests are mostly source-order guards and miss these runtime edge cases.

## Warnings

### WR-01: Refresh-poll snapshots do not persist ownership tokens

**File:** `extension/utils/trigger-manager.js:657`
**Issue:** `armTrigger` builds refresh-poll snapshots with `agent_id` and `target_tab_id`, but it never copies `ownership_token` / `ownershipToken` from the arm spec. The refresh-poll validator later calls `registry.isOwnedBy(tabId, agentId, snap && snap.ownership_token)`, so new snapshots pass `undefined` and hit the registry's backwards-compatible pair-only path instead of token validation. A stale same-agent snapshot can therefore survive a tab rebind/token rotation and still reload the tab.
**Fix:**
```javascript
const ownershipToken = safeSpec.ownership_token || safeSpec.ownershipToken;
const snapshot = {
  trigger_id: safeSpec.trigger_id,
  status: 'armed',
  condition: safeSpec.condition,
  baseline: (safeSpec.baseline === undefined) ? null : safeSpec.baseline,
  last_value: (safeSpec.baseline === undefined) ? null : safeSpec.baseline,
  was_satisfied: false,
  selector: safeSpec.selector,
  target_tab_id: safeSpec.target_tab_id,
  agent_id: safeSpec.agent_id,
  ownership_token: (typeof ownershipToken === 'string' && ownershipToken) ? ownershipToken : undefined,
  armed_at: now,
  deadline_at: now + ttl
};
```
Also reject missing tokens in `fsbTriggerValidateRefreshPollOwnership` when registry metadata for the tab has an `ownershipToken`.

### WR-02: Failed handled refresh-poll ticks can strand armed snapshots without an alarm

**File:** `extension/background.js:3680-3681`
**Issue:** When ownership validation fails, `fsbTriggerRunRefreshPollTick` returns the typed error without persisting attention state or scheduling another wake. The alarm handler then wraps that as `{ handled: true }`, so the fallback lifecycle path is skipped after the one-shot alarm has already fired. The same stranding risk exists for thrown reload/read failures because `fsbTriggerHandleRefreshPollAlarm` catches them and returns `handled: true` without re-arming or marking the snapshot. The result is an `armed` refresh-poll snapshot that no longer has an alarm until a later service-worker restore happens to reconcile it.
**Fix:**
```javascript
const ownership = fsbTriggerValidateRefreshPollOwnership(snap);
if (!ownership || ownership.ok !== true) {
  return fsbTriggerMarkRefreshPollAttention(
    triggerId,
    snap,
    'ownership_failed',
    ownership || { code: 'OWNERSHIP_VALIDATION_FAILED' }
  );
}

let readResult;
try {
  await chrome.tabs.reload(tabId);
  await fsbTriggerWaitForRefreshPollReady(tabId);
  readResult = await fsbTriggerSendRefreshPollRead(tabId, snap);
} catch (err) {
  return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'read_failed', {
    selector: snap.selector,
    error: err && err.message ? err.message : String(err)
  });
}
```
Every `{ handled: true }` refresh-poll outcome should either persist a non-armed attention/blocked/terminal state or explicitly schedule the next refresh-poll alarm.

## Info

### IN-01: Refresh-poll tests rely on source-order checks for critical runtime behavior

**File:** `tests/trigger-refresh-poll.test.js:389`
**Issue:** The tests prove helper names and ordering by slicing `extension/background.js`, but they do not execute `fsbTriggerRunRefreshPollTick` through ownership failure, sendMessage rejection, or token-rotation scenarios. The current tests pass while WR-01 and WR-02 remain possible.
**Fix:** Add a small runtime harness for the exported `fsbTriggerHandleRefreshPollForTest` path, or extract the refresh-poll helpers into a module, then assert storage/alarm outcomes for `TAB_NOT_OWNED`, missing ownership token, rejected `chrome.tabs.sendMessage`, and successful non-fire rescheduling.

---

_Reviewed: 2026-06-16T18:43:44Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
