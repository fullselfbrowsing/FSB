---
phase: 54-permission-scoped-drive-corpus-boundary
reviewed: 2026-07-20T17:59:47Z
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
  critical: 7
  warning: 4
  info: 0
  total: 11
status: issues_found
---

# Phase 54: Code Review Report

**Reviewed:** 2026-07-20T17:59:47Z  
**Depth:** standard  
**Files Reviewed:** 25  
**Status:** issues_found

## Summary

The reviewed implementation establishes a substantial closed-schema, trusted-storage, Drive-transport, and source-authority foundation, and all focused Phase 54 suites pass. The passing gate is not sufficient for shipment: cross-module tracing found seven blocker-class correctness or data-loss defects. The most serious paths can discard an explicitly enrolled corpus on every service-worker wake, certify already-stale processed records, publish content read outside the final-currentness boundary, return revoked multi-source influence, and purge every downstream derivative during an ordinary same-root reconciliation.

Validation executed during review:

```text
node tests/skopeo-corpus-schema.test.js                         PASS
node tests/skopeo-corpus-store.test.js                          PASS
node tests/skopeo-drive-corpus-transport.test.js                PASS
node tests/skopeo-drive-authority.test.js                       PASS
node tests/skopeo-drive-reconciler.test.js                      PASS
node tests/skopeo-corpus-runtime.test.js                        PASS
node tests/skopeo-browser-contract.test.js                      PASS
node tests/lattice-provider-bridge-smoke.test.js                PASS
node scripts/verify-skopeo-storage-boundary.mjs                 PASS
```

Those tests do not cover the wake sequence from an already-active durable corpus, live-versus-persisted fingerprint drift before an operation, non-display partial projection, same-partition participant retention, effectful callback timeout, or fixed-message transport failure.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Worker wake destroys durable enrollment and can silently enroll the current folder

**Classification:** BLOCKER  
**Files:** `extension/background.js:321`, `extension/background.js:1736`, `extension/utils/skopeo-corpus-store.js:1062`, `extension/utils/skopeo-corpus-store.js:1173`, `extension/utils/skopeo-corpus-controller.js:474`

**Issue:** Startup always calls `store.recover({})`, which replaces the active control manifest with an `unproven` manifest and drops its active partition pointer. When a fresh account proof later reaches `recover({ provenAccountPermissionId })`, the orphan scan sees no active pointer and purges the previously active partition even when the permission ID is unchanged. The controller then falls back to the folder currently shown in the tab, makes it `currentClaim`, and `recoverCorpusOnWake()` performs a full rescan. That folder was never selected through the explicit **Enroll this folder** action. Wake recovery is also restricted to `drive-folder`, so a worker that wakes while the active tab is a Drive file or Docs document cannot recover the prior claim at all.

**Evidence:**

- `background.js:321` invokes destructive unproven recovery on every boundary initialization.
- `skopeo-corpus-store.js:1062-1065` persists a new unproven manifest with no active key.
- `skopeo-corpus-store.js:1183-1193` subsequently treats every non-purged partition as orphaned because the current manifest is no longer active.
- `skopeo-corpus-controller.js:474-505` substitutes the current page folder when no in-memory claim exists and returns it as `validating` even if no visible persisted manifest matched it.
- `background.js:1737-1746` accepts only folder contexts and sends that inferred claim into reconciler resume.

**Impact:** A routine MV3 worker restart can remove the user's durable corpus and all source-owned derivatives. It can then replace that corpus with whichever Drive folder happens to be open, violating explicit enrollment and stable-ID persistence.

**Fix:** Keep a metadata-minimized dormant enrollment tuple while identity is unavailable; hide it without severing the durable pointer. After a fresh permission-ID proof, revive only the previously enrolled root for the same account. Never infer enrollment from `context.entityId`. Recovery from a file/Docs context must use the persisted root tuple, and a different account must tombstone/purge it before any replacement. Add an integration test that activates root A, reconstructs every in-memory module, boots unproven, proves the same account while viewing root B and while viewing a document, and verifies that only root A can recover and no participant purge runs.

### CR-02: Fresh authority certifies stale processed records after a Drive edit

**Classification:** BLOCKER  
**File:** `extension/utils/skopeo-drive-authority.js:728`

**Issue:** `certifySourceDetailed()` proves the live source and separately snapshots the stored source, but it never compares the live metadata/content identity to the stored record's `metadataFingerprint`, `membershipFingerprint`, or `contentFingerprint`. The only store comparison is `beforeSource.canonical === afterSource.canonical`, which proves that storage did not change during the check, not that storage matches Drive. `finalCurrentness()` repeats the same incomplete proof and compares the second live signature only to the first live signature.

**Evidence:** `sourceSignature()` includes live name, version, revision, checksums, size, modified time, and ancestry at `skopeo-drive-authority.js:267-287`. The stored record is read at `:743-748`, but the function returns a certificate at `:772-777` without cross-comparing those identities. `finalCurrentness()` at `:943-958` only compares two same-operation live snapshots plus an unchanged stale store snapshot.

**Impact:** If a source is edited after reconciliation but before a query, display, citation, or alert operation, the edited Drive metadata can remain stable for the entire operation and the old ready record is certified. Stale fragments, counts, results, or citations may influence output until a separate reconciliation happens to run.

**Fix:** For every non-ingestion operation, derive the same canonical metadata, membership, and trustworthy content identity used by reconciliation and compare it to the persisted ready record before minting a certificate. On any mismatch, atomically transition the source to metadata-minimized `pending`/withheld, purge its owned influence, and schedule reconciliation. If a Google-native source lacks trustworthy revision identity, it cannot certify a cached ready record without a bounded current export hash. Add pre-operation edit tests for every operation kind, not only mutation during the callback.

### CR-03: Reconciliation reads and commits content outside the final-currentness capability

**Classification:** BLOCKER  
**File:** `extension/utils/skopeo-drive-reconciler.js:772`

**Issue:** Reconciliation calls the low-level `authority.certifySource()`, then performs independent `transport.getFile()` and `transport.readContent()` calls. It never uses `runWithCertifiedSource()` to bind content processing to final currentness. The later `finalAuthorityGate()` checks only ancestry fields and closes its operation before `commitInventory()` publishes the records.

**Evidence:**

- `skopeo-drive-reconciler.js:775-811` certifies once and then reads fresh metadata/content outside an authority wrapper.
- `:931-960` re-certifies but compares only physical parent chain and vendor scope; it does not compare the record's metadata/content fingerprint to current Drive evidence.
- The final-gate operation is stopped at `:961-963`, while publication occurs later at `:1160-1168` and `:1204-1206`.

**Impact:** A file can change, move, or lose access during its byte read, between the read and the final gate, or between the gate and storage commit. The reconciler can still publish a `ready` record whose processed hash is no longer current, directly violating the ready-state contract.

**Fix:** Run source reading and record construction inside an ingestion-specific certified callback, bind the resulting record to the certificate's exact live identity, and keep a store-owned operation/authority epoch through the pointer-last commit. Immediately before publication, compare all record fingerprints to fresh proof; the store must reject the commit if the operation token or authority epoch no longer owns the tuple. Add races at each read/gate/commit await, including a content revision change with unchanged ancestry.

### CR-04: Non-display partial results return revoked-source influence unchanged

**Classification:** BLOCKER  
**File:** `extension/utils/skopeo-drive-authority.js:1074`

**Issue:** After a multi-source callback, the authority computes which sources remain current. The display branch projects source-keyed rows and filters revoked IDs. Every non-display operation instead returns the callback's original aggregate value whenever at least one source remains, merely changing `decision` to `partial`.

**Evidence:** `finalIds` is correctly built at `skopeo-drive-authority.js:1065-1071`, but `:1074-1087` returns `callbackRead.value` unmodified. Only the display-specific branch at `:1090-1109` removes revoked rows and aggregate influence.

**Impact:** A query, ingestion, citation-open, or alert callback can combine sources A and B; if B is revoked during the callback, a `partial` response still contains B's text, count, citation, or delivery evidence. The decision label does not remove the unauthorized influence.

**Fix:** Do not return an unstructured callback value when the certified set becomes partial. Either require complete final proof for non-display operations or define a strict source-keyed projection for each operation and filter it using `finalIds`, dropping all aggregates unless the complete requested set remains current. Add the same revoke-during-callback test used for display to every non-display operation kind and assert that the revoked sentinel is absent.

### CR-05: Effectful callbacks run before final proof and continue after timeout/abort

**Classification:** BLOCKER  
**Files:** `extension/utils/skopeo-drive-authority.js:340`, `extension/utils/skopeo-drive-authority.js:980`, `extension/utils/skopeo-corpus-controller.js:179`

**Issue:** `runWithCertifiedSource()` invokes the caller callback before its final currentness check. That is safe only for pure in-memory preparation; the advertised ingestion, citation-open, and alert-delivery kinds are effectful. In addition, both `guardedAwait()` and controller `bounded()` race a timer/abort against the underlying promise without cancelling it. The operation can return `pending`/`closed` and revoke its certificate while the callback or store mutation continues running.

**Evidence:** The callback executes at `skopeo-drive-authority.js:993`, while final proof occurs at `:995-997`. `guardedAwait()` resolves its race on timeout at `:367-380` but retains no cancellation handle for the `promise` created at `:354-356`. The controller has the same pattern at `skopeo-corpus-controller.js:191-210`; for example, a timed-out `store.commitInventory()` started at `:382-384` can still publish after the controller returns fail-quiet and skips its final folder proof.

**Impact:** A revoked source can still cause a notification, citation navigation, or durable ingestion write even though the facade reports that the operation was withheld. A timed-out enrollment commit can also become visible after the caller has discarded its claim.

**Fix:** Split pure preparation from effect commit. Pass a per-operation `AbortSignal` through every transport, callback, and store mutation; require store publication and durable side effects to validate an opaque operation token/epoch immediately before commit. On timeout, cancel and await terminal cleanup before returning. Alert delivery should use an epoch-bound outbox intent that is revalidated immediately before dispatch. Add hung-callback and hung-commit tests proving zero late mutation after timeout/abort.

### CR-06: Ordinary same-root reconciliation purges the entire partition and all unchanged derivatives

**Classification:** BLOCKER  
**Files:** `extension/utils/skopeo-corpus-store.js:555`, `extension/utils/skopeo-drive-reconciler.js:980`

**Issue:** `beginReplacement()` always records the active partition as `priorPartitionKey`, even when the candidate tuple is the exact same account/root. Because the same key is then rewritten as `staging`, `commitInventory()` necessarily returns `prior-partition-not-purged`. The reconciler handles that by purging the current partition, invoking all seven participant purges, then restaging the records. Unchanged records may still be marked ready with reused fingerprints even though their fragments/indexes/citations/counts/relationships/result cache/alert evidence were just deleted.

**Evidence:**

- `skopeo-corpus-store.js:562-618` records the same active key as both prior and candidate.
- `:695-699` refuses commit while that same candidate partition is not `purged`.
- `skopeo-drive-reconciler.js:1000-1028` responds by calling partition-wide `purgePartition(..., 'root-replaced')`, restarting, and restaging.
- `skopeo-corpus-store.js:984-999` purges every source and participant category.
- Reuse identity is also only in the reconciler's in-memory `Map` (`skopeo-drive-reconciler.js:294`, `:722-743`); the persisted fingerprints produced at `:539-545` use evidence kinds that the fallback at `:727-734` never accepts, so worker restart re-reads otherwise unchanged bytes.

**Impact:** Every targeted change or full rescan of an active corpus is partition-destructive. Later Phase 55-59 data disappears even for unchanged sources, while the manifest can falsely say those sources are processed/current. Across a worker restart the same workflow also re-extracts all supported content instead of remaining idempotent.

**Fix:** Treat an exact same-tuple refresh as a new staging generation within the partition, not a root replacement: set `priorPartitionKey` only when the tuple changes, purge only changed/missing sources tombstone-first, preserve unchanged participant ownership, and atomically publish the new generation. Persist or reconstruct trustworthy content identity so unchanged revisions survive worker restart. Add a real store/reconciler integration test with nonempty fake participants and assert zero partition purge plus zero content read for an unchanged same-root reconciliation before and after module reconstruction.

### CR-07: Fixed-message failure is reported as successful session persistence/deletion

**Classification:** BLOCKER  
**File:** `extension/utils/automation-logger.js:952`

**Issue:** The fixed-message bridge intentionally resolves `null` on missing runtime support, `runtime.lastError`, or a thrown send. Session save, delete, and clear interpret that null response as success. Save then deletes the only in-memory DOM snapshot accumulator.

**Evidence:** `sendTrustedFeatureMessage()` resolves `null` at `automation-logger.js:29-45`. `saveSession()` rejects only explicit `{ ok: false }` at `:952-957`; `deleteSession()` returns true for null at `:994-1000`; and `clearAllSessions()` clears memory for null at `:1037-1044`.

**Impact:** If trusted initialization/listener routing is unavailable or the extension context is invalidated mid-call, callers are told persistence/deletion succeeded. Session snapshot data is discarded without ever reaching storage, and UI state can diverge from durable state.

**Fix:** Require an explicit `{ ok: true }` response for all mutating fixed-message operations. Preserve in-memory snapshots on any other result and surface `false` so the caller can retry. Add tests for no listener, `runtime.lastError`, undefined response, thrown send, and storage rejection; each must retain memory and report failure.

## Warnings

### WR-01: Persisted pending/inaccessible/missing states cannot be projected

**Classification:** WARNING  
**Files:** `extension/utils/skopeo-corpus-store.js:738`, `extension/background.js:1684`

**Issue:** `getVisibleManifest()` filters the source list to `visibility === 'active'`. Schema-valid `pending`, `inaccessible`, and `missing` records are staged/withheld/purging/purged, so the status callback's six-state switch can never read those persisted records. For display operations, source certification fails before the callback when the source is absent from the visible manifest. In practice these durable states collapse to a transport-derived pending/inaccessible or a closed projection; authoritative `missing` is never shown.

**Fix:** Add an exact-source, metadata-minimized state lookup that is gated by fresh account/root proof plus the trusted current semantic source ID. Return only the closed state token for hidden states, never a filename or other stale metadata. Cover persisted pending, inaccessible, and authoritative missing separately.

### WR-02: Folder refresh always renders **Enroll this folder**, even for the active root

**Classification:** WARNING  
**Files:** `extension/content/skopeo-runtime.js:664`, `extension/content/skopeo-runtime.js:714`, `extension/background.js:1684`

**Issue:** Folder contexts may send only `skopeo:corpus-enroll`; `corpus-status` accepts only file/document entities. `refreshCorpusForCurrentContext()` therefore composes a null-projection enrollment model for every folder without asking background authority whether it is the active root. The background status handler also rejects folders.

**Impact:** A reload or route refresh on an already enrolled root presents a misleading enrollment action. Activating it can trigger the destructive same-root replacement path in CR-06.

**Fix:** Add a narrow exact-root status claim/handler. Freshly verify account/root, then project either `active-corpus`, validating/fail-quiet, or enrollment. Do not infer active status in content.

### WR-03: Resource keys are not attached to the Drive requests that need them

**Classification:** WARNING  
**Files:** `extension/utils/capability-fetch.js:3170`, `extension/utils/capability-fetch.js:3301`, `extension/utils/skopeo-drive-authority.js:577`

**Issue:** The metadata helper puts a resource key in `params.resourceKey`, although Drive's documented mechanism is the `X-Goog-Drive-Resource-Keys` request header. The subsequent `files.export` and `files.get?alt=media` requests omit the key entirely. Authority ancestry also re-fetches every source using only `{ fileId }`, so a trusted resource-key handle discovered by inventory is not used for the access proof.

**Impact:** Link-shared descendants that require a resource key can appear in inventory but fail fresh certification or content reading, contrary to the shared-item boundary. Existing tests lock only fake request shapes and cannot detect this authenticated behavior.

**Fix:** Carry the opaque exact-source key only within the bounded operation and attach `X-Goog-Drive-Resource-Keys: fileId/resourceKey` to every metadata, export, and media request referencing that file. Reorder ancestry proof as needed to reacquire the key from the verified parent listing; never persist or project it. Update the transport fixtures to assert the header. See Google's [resource-key request contract](https://developers.google.com/workspace/drive/api/guides/resource-keys#set_the_resource_key_on_the_request).

### WR-04: Session-list bridge returns raw legacy/corrupt index records without a byte cap

**Classification:** WARNING  
**File:** `extension/utils/trusted-local-feature-store.js:449`

**Issue:** Every other trusted read normalizes/redacts storage before returning it, but `listAutomationSessions()` returns `fsbSessionIndex.slice(...)` verbatim. The handler then marks that payload `{ ok: true }`. Legacy content-written records or corrupted storage can therefore send arbitrary fields and arbitrarily large strings through the new trusted bridge; `SESSION_RESPONSE_BYTES` is not enforced.

**Fix:** Re-parse every index entry through `safeSession()` and `safeIndexEntry()` (or rebuild the index from sanitized session records), reject reserved IDs such as `__proto__`, and trim entries until the serialized response fits a fixed byte cap. Add malicious legacy-index and oversized-response fixtures.
