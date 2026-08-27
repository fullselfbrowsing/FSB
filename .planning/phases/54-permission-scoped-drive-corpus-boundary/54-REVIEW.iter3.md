---
phase: 54
reviewed: 2026-07-20T19:58:06Z
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
  critical: 3
  warning: 1
  info: 0
  total: 4
status: issues_found
---

# Phase 54: Code Re-Review Report

**Reviewed:** 2026-07-20T19:58:06Z
**Depth:** standard
**Files reviewed:** 25
**Status:** issues_found

## Summary

The iteration-1 fixes close seven of the eleven original findings. Four original findings remain incomplete: the code can still exceed its advertised operation deadline indefinitely, publish an active corpus after its authority guard becomes stale, purge unchanged hash-fallback sources on rename or move, and fail to enumerate children of a keyed link-shared folder. These residual paths produce three blocker-class findings and one warning.

All requested suites and additional focused regressions pass. Two adversarial in-memory probes nonetheless reproduce the deadline and pointer-publication failures against the current implementations, so the passing fixtures do not establish the required cancellation/currentness invariants.

## Prior-Finding Verification

| Prior finding | Result | Verification |
|---|---|---|
| CR-01 durable wake/enrollment | Closed | Recovery preserves the exact durable root, gates it only in memory until fresh account proof, and supports wake from folder, Drive-file, and Docs routes. |
| CR-02 stale processed certification | Closed | Non-ingestion authority recomputes persisted metadata, membership, and content evidence; drift withholds and purges the source before scheduling reconciliation. |
| CR-03 reconciliation outside final currentness | Incomplete — see CR-02 | Certified preparation and a publisher token were added, but the final active-pointer write has no post-write currentness check. |
| CR-04 non-display partial influence | Closed | Non-display operations now require a complete final certified set and discard prepared values after any member becomes stale. |
| CR-05 effects and cancellation | Incomplete — see CR-01 and CR-02 | Preparation/publish separation is present, but non-cooperative awaits defeat the deadline and the final pointer can publish after abort. |
| CR-06 same-root destructive replacement | Incomplete — see CR-03 | Same-partition generations preserve unchanged participants and persistent Drive identities, but hash-only unchanged content is still classified as replacement content after a move or rename. |
| CR-07 mutation acknowledgement | Closed | Session mutations require explicit `{ ok: true }` and retain memory on missing, thrown, runtime, and storage failures. |
| WR-01 hidden source states | Closed | Fresh tuple-gated exact-source lookup exposes only metadata-minimized hidden state. |
| WR-02 active-root status | Closed | Folder refresh uses an exact root-status request and does not infer or mutate enrollment. |
| WR-03 resource-key requests | Incomplete — see WR-01 | Exact metadata, export, and media requests carry verified keys; parent-folder child listings still cannot carry one. |
| WR-04 session-index sanitization | Closed | Legacy entries are allowlisted/redacted and both count and response-byte limits are applied. |

## Validation

```text
node tests/skopeo-corpus-schema.test.js                  PASS
node tests/skopeo-corpus-store.test.js                   PASS
node tests/skopeo-drive-corpus-transport.test.js         PASS
node tests/skopeo-drive-authority.test.js                PASS
node tests/skopeo-drive-reconciler.test.js               PASS
node tests/skopeo-corpus-runtime.test.js                 PASS
node tests/lattice-provider-bridge-smoke.test.js         PASS
node tests/skopeo-browser-contract.test.js               PASS
node tests/capability-fetch.test.js                      PASS (66/66)
node tests/automation-logger-trusted-bridge.test.js      PASS
node scripts/verify-skopeo-storage-boundary.mjs          PASS
node --check on all reviewed production JS/MJS          PASS
git diff --check                                         PASS
```

Adversarial validation:

- An actual `FsbSkopeoDriveAuthority` instance with `maxOperationMs: 20` and a transport `getFile()` returning a never-settling promise was still pending after 120 ms.
- An actual corpus store was paused after its final active control value had been applied but before `storage.set()` resolved. Aborting the authority guard during that pause still returned `{ ok: true, status: "active" }` and `getVisibleManifest()` returned the new manifest.

## Critical Issues

### CR-01: Abort deadlines can still hang forever on a non-cooperative await

**Classification:** BLOCKER
**Files:** `extension/utils/skopeo-drive-authority.js:381`, `extension/utils/skopeo-corpus-controller.js:179`, `extension/utils/skopeo-drive-reconciler.js:349`, `extension/utils/capability-fetch.js:6263`

**Issue:** The timeout races in both `guardedAwait()` and `bounded()` abort their controller, but then await the original promise before returning. If the callee ignores the signal or cannot be cancelled, the timeout path never completes. Production contains exactly such a boundary: `executeBoundPageRead()` checks the signal before and after `chrome.scripting.executeScript()`, but neither passes it into that call nor races the await. The reconciler also awaits root metadata, start tokens, inventory pages, and change pages directly without a run-level signal.

**Evidence:**

- `skopeo-drive-authority.js:403-428` resolves its timer race, then executes `await promise` on timeout/abort.
- `skopeo-corpus-controller.js:194-220` has the same terminal wait.
- `capability-fetch.js:6313-6331` can remain inside `executeScript()` indefinitely even after its operation signal aborts.
- `skopeo-drive-reconciler.js:349-412` and `:903-920` perform unbounded direct transport awaits.
- The 20 ms authority probe remained unresolved after 120 ms when `getFile()` never settled.

**Impact:** Worker recovery, reconciliation, enrollment, or a consumer operation can remain live indefinitely after cancellation or `maxOperationMs`, retaining stale operation state and preventing the caller from reaching its fail-quiet result. This violates the bounded-work/cancellation contract and makes shutdown dependent on every downstream promise voluntarily settling.

**Fix:** Enforce one run-level cancellation/deadline primitive across every authority, controller, reconciler, transport, page-read, and store await. Do not wait forever for a non-cooperative promise after the deadline; instead, require an acknowledged cancellable adapter or detach the await while terminally fencing every possible late effect with the operation token/epoch. Add tests using promises that never resolve even after abort, including `executeScript()` and each direct reconciler scan call, and assert the public operation settles within a small bound with zero late publication.

### CR-02: The final active-pointer write can publish after its authority guard becomes stale

**Classification:** BLOCKER
**File:** `extension/utils/skopeo-corpus-store.js:817`

**Issue:** `commitInventory()` runs `authorityValidate()` and checks the opaque guard immediately before the final control write, then awaits `writeOne(CONTROL_KEY, activeManifest(...))` without checking either condition again. Abort, tuple drift, revision drift, or publisher invalidation during that asynchronous storage write therefore leaves the new active manifest published and returns success.

**Evidence:**

- `skopeo-corpus-store.js:817-823` performs the last authority/guard check.
- `:824-829` writes the visibility pointer, deletes the issued handle, and returns `active` with no post-write validation or rollback.
- `beginReplacement()` sets `visibleAccountPermissionId` at `:697`, so once the control value is applied, reads can expose it.
- In the storage-race probe, the guard was aborted while the final `storage.set()` was paused after applying its value. The commit still returned active and the new manifest was visible.

**Impact:** Content read under an old revision or authority tuple can become the durable active corpus even though the operation was cancelled before its storage await completed. This reopens the final-currentness and late-effect failures addressed by prior CR-03/CR-05 at the pointer-last boundary.

**Fix:** Keep the in-memory visibility gate closed through the final write, then revalidate the operation signal/token and fresh authority after the write before opening it. If validation changed during the await, synchronously supersede the pointer with a later closed/tombstone epoch before returning stale. Reads must require the same committed operation/epoch, not only the account gate. Add race tests that abort and change Drive revision after the active value is applied but before `storage.set()` resolves; both durable recovery and live reads must remain closed.

### CR-03: A hash-fallback rename or move purges derivatives for unchanged bytes

**Classification:** BLOCKER
**Files:** `extension/utils/skopeo-drive-reconciler.js:708`, `extension/utils/skopeo-drive-reconciler.js:770`, `extension/utils/skopeo-drive-reconciler.js:972`

**Issue:** Sources without a reusable Drive checksum or revision identity must be re-read after metadata or membership changes. Even when that read produces the exact same `export-byte-hash` or `download-byte-hash` as the persisted record, `decideCertifiedSource()` passes `read.state === "ready"` as `contentChanged`. `actionBetween()` therefore returns `content` before comparing the equal fingerprints, and `purgeChanged()` deletes the source's participants.

**Evidence:**

- `actionBetween()` at `:708-720` treats the Boolean `contentChanged` as sufficient for a content replacement.
- `decideCertifiedSource()` at `:770-793` passes true after every successful fresh byte read, not only when the new byte fingerprint differs.
- `purgeChanged()` at `:972-989` purges every previously present source classified as `content`.
- Existing rename/move fixtures exercise persistent checksum/revision reuse, so they bypass this hash-fallback branch.

**Impact:** Renaming or moving an otherwise unchanged Google-native or downloadable source can erase its fragments, index entries, citations, counts, relationships, cached results, and alert evidence. The replacement source record remains `ready` with the same byte hash, so the manifest can claim current processed content after its owned derivatives were removed.

**Fix:** Derive content replacement strictly from canonical content-fingerprint inequality. A required fresh read whose exact byte hash equals the prior fingerprint should fall through to `membership` or `metadata` classification. Add real participant integration coverage for sources with null SHA-256/revision identity: rename and move them with identical bytes, allow the defensive re-read, and assert zero participant purge.

## Warnings

### WR-01: Child listing cannot carry the resource key of a keyed parent folder

**Classification:** WARNING
**Files:** `extension/utils/skopeo-drive-corpus-transport.js:496`, `extension/utils/capability-fetch.js:3375`, `extension/utils/skopeo-drive-authority.js:680`, `extension/utils/skopeo-drive-reconciler.js:387`

**Issue:** `listChildren()` accepts only `parentFileId`, `pageToken`, and `driveId`. The page action mirrors that allowlist and sends the `files.list` request without `X-Goog-Drive-Resource-Keys`. Authority ancestry and physical inventory scans therefore discard the verified key already available on the parent shape before querying `'<parentId>' in parents`.

**Evidence:** Google documents that resource keys for any files referenced by Drive API requests belong in the `X-Goog-Drive-Resource-Keys` header ([Drive resource-key request contract](https://developers.google.com/workspace/drive/api/guides/resource-keys?hl=en#set_the_resource_key_on_the_request)). The current transport schema at `skopeo-drive-corpus-transport.js:496-519` cannot express that header, and the page request at `capability-fetch.js:3375-3393` emits none.

**Impact:** A link-shared nested folder that requires its resource key can be fetched as an exact file yet fail when its children are enumerated. Enrollment/reconciliation then reports pending or incomplete and silently excludes an otherwise authorized subtree.

**Fix:** Add an exact-parent opaque resource-key field to `listChildren()`, attach `parentFileId/resourceKey` to the request header, and propagate only the operation-local verified key from authority/reconciler parent shapes. Add keyed parent-list fixtures plus forged/cross-parent key rejection.

---

_Re-reviewed: 2026-07-20T19:58:06Z_
_Iteration: 2_
