---
quick_id: 260617-eic
slug: fix-trigger-manager-to-persist-live-obse
status: complete
created: 2026-06-17
mode: quick
files_modified:
  - extension/utils/trigger-manager.js
  - tests/trigger-manager.test.js
autonomous: true
---

# Quick Task 260617-eic: Persist trigger watch and extraction metadata

Fix the review finding that `FsbTriggerManager.armTrigger()` builds a storage snapshot that drops caller-supplied live-observe metadata. The caller already passes `watch`, `extract`, `attrName`, baseline/report values, and copied attributes into `armTrigger`; the manager must preserve those fields when delegating to `FsbTriggerLifecycle.armTrigger()`.

## Source Audit

- GOAL: live-observe triggers remain identifiable after persistence so `background.js` starts `triggerObserveStart` after arm. Covered by Tasks 1 and 2.
- GOAL: attribute extraction survives the manager snapshot so observe/read/evaluate use the requested attribute instead of falling back to text. Covered by Tasks 1 and 2.
- GOAL: reporting/rearm fields already present on `safeSpec` survive into lifecycle evaluation and status projection. Covered by Tasks 1 and 2.
- STATE: preserve trigger survivability invariants: storage is truth, `evaluate()` remains pure, no `agent-loop.js` changes, no public tool schema changes. Covered by Task 2.
- CONTEXT: prior quick task fixed attribute alias normalization before manager arm; this task must not undo that caller-side behavior. Covered by Task 3.

## Tasks

### 1. Add a manager arm regression for delegated snapshot metadata

- Files: `tests/trigger-manager.test.js`
- Action: extend the focused manager test suite with an async `armTrigger()` regression that installs mock `globalThis.FsbTriggerStore` and `globalThis.FsbTriggerLifecycle`, captures the snapshot passed to `FsbTriggerLifecycle.armTrigger(snapshot)`, and asserts that a live-observe spec preserves:
  - `watch: "live-observe"` from `safeSpec.watch`
  - `extract: "attribute"` and `attrName: "data-price"` from top-level extraction fields
  - `reported_value`, `reported_attributes`, `reported_url`, and `last_reported_at`
  - `rearm_on_fire: true`
  - existing core fields: `trigger_id`, `condition`, `baseline`, `last_value`, `selector`, `target_tab_id`, `agent_id`, `ownership_token`, `armed_at`, `deadline_at`
- Action: keep the test local to manager behavior. Do not test `background.js` watcher startup here; this regression is specifically the manager-to-lifecycle snapshot contract.
- Verify: `node tests/trigger-manager.test.js` fails before the production fix because the captured snapshot lacks `watch: "live-observe"` and the extraction/reporting fields.

### 2. Preserve live-observe, extraction, reporting, and rearm fields in `armTrigger`

- Files: `extension/utils/trigger-manager.js`
- Action: update only the `armTrigger(spec)` snapshot construction path. Preserve the existing refresh-poll behavior exactly, including interval validation and `watch: "refresh-poll"` normalization.
- Action: when `safeSpec.watch` or `safeSpec.mode` is `live-observe` or `live_observe`, set `snapshot.watch = "live-observe"`. Do not set refresh-poll interval fields on live-observe snapshots.
- Action: copy only recognized persisted metadata from `safeSpec` onto `snapshot` when present:
  - extraction: `extract`, `attrName`, `attribute`, `attr_name`
  - reporting: `reported_value`, `reported_attributes`, `reported_url`, `last_reported_at`
  - fire/reporting control: `rearm_on_fire` when true, `detached` when true, finite `timeout_ms`, finite `safety_ceiling_ms`, and `detached_at` when finite
- Action: keep `evaluate()` structurally pure. Do not add storage access, DOM access, or chrome resolver calls to `evaluate()`. Do not touch `extension/background.js` unless the regression shows the manager cannot receive the fields, which current caller code shows it can.
- Verify: `node tests/trigger-manager.test.js` passes.

### 3. Run focused trigger regression checks

- Files: `extension/utils/trigger-manager.js`, `tests/trigger-manager.test.js`
- Action: run the focused checks that cover the affected path and adjacent caller/lifecycle contracts.
- Verify:
  - `node tests/trigger-manager.test.js`
  - `node tests/trigger-tool-dispatcher.test.js`
  - `node tests/trigger-refresh-poll.test.js`
  - `node tests/trigger-lifecycle.test.js`
  - `git diff --check`
- Done: all commands pass; diff is limited to `extension/utils/trigger-manager.js` and `tests/trigger-manager.test.js`; no public trigger schemas or background watcher startup logic changed.

## Success Criteria

- A live-observe trigger armed through `FsbTriggerManager.armTrigger()` persists `watch: "live-observe"` so `fsbTriggerIsLiveObserveSnapshot()` can detect it after `FsbTriggerStore.readSnapshot()`.
- Attribute-mode triggers preserve top-level extraction fields through manager persistence, so watcher startup and evaluation use the requested attribute.
- Initial reported values and attributes persist into the snapshot, so lifecycle evaluation receives `{ text, attributes }` rather than falling back to stale `last_value`.
- `rearm_on_fire` survives manager persistence, so lifecycle rearm behavior remains reachable for live-observe snapshots.
