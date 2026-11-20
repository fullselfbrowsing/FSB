---
phase: 54
reviewed: 2026-07-20T20:48:04Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - extension/background.js
  - extension/content/actions.js
  - extension/content/dom-state.js
  - extension/content/skopeo-adaptive-composer.js
  - extension/content/skopeo-runtime.js
  - extension/content/skopeo-shell.js
  - extension/utils/automation-logger.js
  - extension/utils/capability-fetch.js
  - extension/utils/diagnostics-ring-buffer.js
  - extension/utils/skopeo-corpus-controller.js
  - extension/utils/skopeo-corpus-schema.js
  - extension/utils/skopeo-corpus-store.js
  - extension/utils/skopeo-drive-authority.js
  - extension/utils/skopeo-drive-corpus-transport.js
  - extension/utils/skopeo-drive-reconciler.js
  - extension/utils/trusted-local-feature-store.js
  - scripts/verify-skopeo-storage-boundary.mjs
  - tests/lattice-provider-bridge-smoke.test.js
  - tests/skopeo-browser-contract.test.js
  - tests/skopeo-corpus-runtime.test.js
  - tests/skopeo-corpus-schema.test.js
  - tests/skopeo-corpus-store.test.js
  - tests/skopeo-drive-authority.test.js
  - tests/skopeo-drive-corpus-transport.test.js
  - tests/skopeo-drive-reconciler.test.js
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 54: Code Re-Review Report

**Reviewed:** 2026-07-20T20:48:04Z
**Depth:** standard
**Files reviewed:** 25
**Status:** issues_found

## Summary

Three of the four iteration-2 defects are fully resolved: asynchronous active-manifest publication stays closed until post-write authority validation succeeds, hash-stable rename/move reconciliation preserves source-owned derivatives, and child enumeration carries the already-verified exact-parent resource key. Public authority, controller, page-read, and reconciler calls also now settle at their deadline when a dependency never settles.

The cancellation portion of that bounded-work fix is still incomplete. `skopeo-corpus-controller` detaches a timed-out promise under the assumption that every later store effect is fenced by the operation signal or an opaque epoch, but the store ignores the extra signal on all mutating methods except `commitInventory()`. A real-store probe reproduced a late durable withdrawal after `enroll()` had already returned `fail-quiet`. This leaves one blocker-class reliability finding. The seven findings closed before iteration 2 remain closed.

## Iteration-2 Defect Verification

| Defect | Result | Verification |
|---|---|---|
| Bounded completion when dependencies do not settle | Incomplete — see CR-01 | Authority/controller deadline helpers detach non-cooperative promises, page reads race both Chrome awaits against abort, and reconciler runs have a deadline/epoch. Public calls settle, but detached non-commit store mutations can still apply durable effects after that settlement because their signal argument is ignored. |
| Closed state during asynchronous active-manifest persistence | Resolved | `commitInventory()` closes the in-memory visibility gate before the pointer write, post-validates the exact guard and fresh authority, and supersedes a stale write with a later closed epoch. Reads validate both the publication fence and committed operation/checkpoint epoch. Abort and revision-drift storage-race fixtures pass across live and reconstructed stores. |
| Preserve derived data when rename/move bytes are unchanged | Resolved | Fresh fallback-byte reads now compute `contentChanged` from canonical fingerprint inequality. Equal byte hashes fall through to metadata/membership classification, and `shouldPurge()` no longer purges those classifications. Rename and move fixtures cover null checksum/revision identities and retain participants. |
| Pass a verified parent access key during child enumeration | Resolved | Authority ancestry and reconciler inventory pass the exact parent shape's opaque resource-key handle. Transport binds it to the parent ID and pagination scope, unwraps it only for the private page request, and the page action emits `X-Goog-Drive-Resource-Keys`. Forged, raw, and cross-parent keys fail before a page call. |

## Earlier-Finding Regression Check

| Prior finding | Result | Verification |
|---|---|---|
| Durable wake/enrollment preserves the exact enrolled root | Remains resolved | Unproven startup hides without severing the dormant committed tuple; fresh same-account proof revives only that tuple. Wake recovery accepts folder, Drive-file, and Docs routes and never infers enrollment from the visible route. |
| Fresh authority rejects stale processed records | Remains resolved | Non-ingestion proof recomputes metadata, membership, and content evidence against the persisted record, invalidates drifted ready sources, purges their influence, and schedules reconciliation. |
| Non-display partial results cannot retain revoked influence | Remains resolved | Query, ingestion, citation-open, and alert-delivery require the complete final certified set; any stale member discards the prepared aggregate. |
| Session mutations require explicit acknowledgement | Remains resolved | Save, delete, and clear require `{ ok: true }`; missing, thrown, runtime, undefined-response, and storage failures retain memory and return failure. |
| Hidden source-state projection is exact and minimized | Remains resolved | Tuple-gated exact-source reads expose only `pending`, `inaccessible`, or `missing`, with no stale source metadata. |
| Folder status distinguishes the active root without enrollment inference | Remains resolved | The exact root-status request performs fresh proof and returns active only for the persisted root; other folders remain unconfigured. |
| Legacy session-index responses are sanitized and bounded | Remains resolved | Strict allowlisting/redaction, reserved-ID rejection, count limits, and final response-byte limits remain in place. |

## Validation

```text
node tests/skopeo-corpus-schema.test.js                  PASS
node tests/skopeo-corpus-store.test.js                   PASS (68 assertions)
node tests/skopeo-drive-corpus-transport.test.js         PASS
node tests/skopeo-drive-authority.test.js                PASS
node tests/skopeo-drive-reconciler.test.js               PASS
node tests/skopeo-corpus-runtime.test.js                 PASS
node tests/lattice-provider-bridge-smoke.test.js         PASS (111/111)
node tests/skopeo-browser-contract.test.js               PASS (real Chrome)
node tests/capability-fetch.test.js                      PASS (68/68)
node tests/automation-logger-trusted-bridge.test.js      PASS
node scripts/verify-skopeo-storage-boundary.mjs          PASS (32 files)
node --check on all reviewed production JS/MJS          PASS
git diff --check                                         PASS
```

Adversarial validation used the real schema, store, and controller. With corpus root A active, enrollment of root B was paused inside the store's first withdrawal read and given a 20 ms operation deadline. `enroll()` settled as `{ ok: false, status: "fail-quiet" }` while A remained visible. Releasing the paused read after that terminal result allowed the detached `withdrawPartition()` to finish and made A no longer visible.

## Critical Issues

### CR-01: A timed-out controller operation can still apply a detached durable store mutation

**Classification:** BLOCKER
**Files:** `extension/utils/skopeo-corpus-controller.js:179`, `extension/utils/skopeo-corpus-controller.js:262`, `extension/utils/skopeo-corpus-store.js:650`, `extension/utils/skopeo-corpus-store.js:1027`, `extension/utils/skopeo-corpus-store.js:1171`, `extension/utils/skopeo-corpus-store.js:1258`, `extension/utils/skopeo-corpus-store.js:1299`, `extension/utils/skopeo-drive-reconciler.js:1083`

**Issue:** `bounded()` passes an operation signal to its thunk, but on timeout it detaches the still-running promise and releases the controller mutation lane. The controller supplies that signal as an extra argument to `recover()`, `beginReplacement()`, `withdrawPartition()`, and `purgePartition()`. Those store methods do not accept or validate it. The reconciler likewise detaches a bounded run while `beginReplacement()`, `purgeSource()`, or `stageSource()` may still be awaiting non-cooperative storage or participant dependencies without a run guard.

**Evidence:**

- `skopeo-corpus-controller.js:194-223` invokes the thunk with `operationSignal` and intentionally detaches its promise on cancellation.
- `skopeo-corpus-controller.js:262-269` passes the signal to withdrawal and purge, but `skopeo-corpus-store.js:1027-1051` declares `withdrawPartition(claim, reason)` and performs its reads/writes without any cancellation or operation-token check.
- The same gap exists at `beginReplacement()` (`:650`), `purgeSource()` (`:1171`), `purgePartition()` (`:1258`), and `recover()` (`:1299`). Only the final `commitInventory()` path has an opaque guard and post-write repair.
- `skopeo-drive-reconciler.js:1083-1132` awaits unguarded begin/purge/stage mutations; closing its run epoch prevents subsequent publication but cannot undo a late participant purge or store write already in progress.
- In the real-store probe, replacement enrollment returned `fail-quiet` at its 20 ms bound. The original corpus remained visible at that terminal return, then became invisible after the paused store read was released and the detached withdrawal continued.

**Impact:** A caller receives a terminal failure and may retry or proceed under the assumption that no replacement occurred, while the prior active corpus is closed later. On recovery, the committed operation can be treated as unpublished/orphaned and its partition can be purged, removing all source-owned derivatives. Detached reconciliation purges can similarly delete participant data after the public run has already failed.

**Fix:** Give every mutating store entry point a validated abort signal plus an opaque operation token/epoch, and recheck that guard before and after every asynchronous storage or participant boundary. A timed-out controller/reconciler run must receive an acknowledged terminal cancellation from the store before its lane is released; if an underlying write can apply after abort, use a later durable epoch to supersede it before any read or recovery can observe it. Add real-store races for `recover`, `beginReplacement`, `withdrawPartition`, `purgeSource`, `purgePartition`, and participant callbacks, asserting bounded public completion and zero late durable or participant mutation.

## Warnings

None.

## Informational Findings

None.

---

_Re-reviewed: 2026-07-20T20:48:04Z_
_Iteration: 3_
