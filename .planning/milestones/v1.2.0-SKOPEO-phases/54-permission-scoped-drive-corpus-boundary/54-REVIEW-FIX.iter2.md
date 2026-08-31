---
phase: 54-permission-scoped-drive-corpus-boundary
fixed_at: "2026-07-20T19:40:31Z"
review_path: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 54: Code Review Fix Report

**Fixed at:** 2026-07-20T19:40:31Z
**Source review:** `.planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-REVIEW.md`
**Iteration:** 1

**Summary:**

- Findings in scope: 11
- Fixed: 11
- Skipped: 0
- Atomic fix commits: 11

## Fixed Issues

### CR-01: Worker wake destroys durable enrollment and can silently enroll the current folder

**Status:** fixed
**Commit:** `4a21f1b9`
**Files modified:** `extension/background.js`, `extension/utils/skopeo-corpus-controller.js`, `extension/utils/skopeo-corpus-store.js`, `tests/skopeo-corpus-runtime.test.js`, `tests/skopeo-corpus-store.test.js`, `tests/skopeo-drive-authority.test.js`
**Applied fix:** Wake recovery now reconstructs exact durable enrollment through the store/controller boundary and never treats the current route as enrollment authority.
**Verification:** Corpus runtime, store, and Drive authority recovery tests pass for restart, absent enrollment, and exact-root reuse.

### CR-02: Fresh authority certifies stale processed records after a Drive edit

**Status:** fixed
**Commit:** `ccd3b6f6`
**Files modified:** `extension/background.js`, `extension/utils/skopeo-corpus-store.js`, `extension/utils/skopeo-drive-authority.js`, `tests/skopeo-corpus-store.test.js`, `tests/skopeo-drive-authority.test.js`
**Applied fix:** Non-ingestion certification now recomputes canonical metadata, membership, and trustworthy content fingerprints; stale processed sources are atomically withheld, purged, and scheduled for reconciliation.
**Verification:** Drive authority and real-store tests cover pre-operation metadata, ancestry, revision, checksum, and bounded byte-hash drift.

### CR-03: Reconciliation reads and commits content outside the final-currentness capability

**Status:** fixed
**Commit:** `eed7faca`
**Files modified:** `extension/utils/skopeo-corpus-store.js`, `extension/utils/skopeo-drive-authority.js`, `extension/utils/skopeo-drive-reconciler.js`, `tests/skopeo-corpus-store.test.js`, `tests/skopeo-drive-authority.test.js`, `tests/skopeo-drive-reconciler.test.js`
**Applied fix:** Source reads and record construction now run inside ingestion-certified preparation callbacks. Exact active records bind metadata, membership, and content fingerprints to a one-shot authority publisher; complete-set and empty-inventory publication retain an opaque authority token/epoch through the store's final pointer write, where fresh validation runs immediately before visibility changes.
**Verification:** RED failed on the absent certified reconciliation callbacks. GREEN covers revision changes with unchanged ancestry after the content-read await, at the final complete-set gate, and immediately before commit; forged store tokens/epochs, stale bound byte hashes, and empty-inventory root authority are also covered.

### CR-04: Non-display partial results return revoked-source influence unchanged

**Status:** fixed
**Commit:** `d18e648a`
**Files modified:** `extension/utils/skopeo-drive-authority.js`, `tests/skopeo-drive-authority.test.js`
**Applied fix:** Non-display operations require complete final proof and discard the prepared value when any requested source becomes stale, inaccessible, or revoked.
**Verification:** Ingestion, query, citation-open, and alert-delivery tests mutate one member during preparation and prove that no partial value or revoked sentinel escapes.

### CR-05: Effectful callbacks run before final proof and continue after timeout/abort

**Status:** fixed
**Commit:** `1a93105d`
**Files modified:** `extension/background.js`, `extension/utils/capability-fetch.js`, `extension/utils/skopeo-corpus-controller.js`, `extension/utils/skopeo-corpus-store.js`, `extension/utils/skopeo-drive-authority.js`, `extension/utils/skopeo-drive-corpus-transport.js`, `extension/utils/skopeo-drive-reconciler.js`, `tests/skopeo-corpus-runtime.test.js`, `tests/skopeo-corpus-store.test.js`, `tests/skopeo-drive-authority.test.js`, `tests/skopeo-drive-corpus-transport.test.js`
**Applied fix:** Effectful work is split into pure preparation and a one-shot acknowledged publisher. Per-operation abort signals reach transport/store awaits, timeouts abort and await terminal cleanup, and stale/forged publisher acknowledgements cannot commit.
**Verification:** Authority, controller, transport, runtime, reconciler, capability-fetch, and store tests cover hung preparation/commit, parent abort, late mutation, forged token, and signal propagation.

### CR-06: Ordinary same-root reconciliation purges the entire partition and all unchanged derivatives

**Status:** fixed
**Commit:** `ff51cc6f`
**Files modified:** `extension/utils/skopeo-corpus-store.js`, `extension/utils/skopeo-drive-reconciler.js`, `tests/skopeo-drive-reconciler.test.js`
**Applied fix:** Same-tuple refreshes now create a new staging generation without partition-wide purge, preserve unchanged participant ownership, and reconstruct trustworthy persisted content identity after restart.
**Verification:** Real-store/reconciler integration proves zero partition purge and zero unchanged content reads before and after module reconstruction.

### CR-07: Fixed-message failure is reported as successful session persistence/deletion

**Status:** fixed
**Commit:** `faf670d7`
**Files modified:** `extension/utils/automation-logger.js`, `tests/automation-logger-trusted-bridge.test.js`
**Applied fix:** Session save, delete, and clear now require an explicit `{ ok: true }` acknowledgement and preserve in-memory snapshots on every missing, thrown, runtime, or storage failure.
**Verification:** Trusted-bridge tests cover no listener, `runtime.lastError`, undefined response, thrown send, and storage rejection.

### WR-01: Persisted pending/inaccessible/missing states cannot be projected

**Status:** fixed
**Commit:** `d03dcfd1`
**Files modified:** `extension/background.js`, `extension/utils/skopeo-corpus-store.js`, `extension/utils/skopeo-drive-authority.js`, `tests/skopeo-corpus-runtime.test.js`, `tests/skopeo-corpus-store.test.js`, `tests/skopeo-drive-authority.test.js`
**Applied fix:** A fresh account/root-gated exact-source lookup projects only a metadata-minimized hidden state token for persisted pending, inaccessible, and authoritative missing records.
**Verification:** Runtime, store, and authority tests cover each hidden state separately and prove no stale filename or source metadata is exposed.

### WR-02: Folder refresh always renders Enroll this folder, even for the active root

**Status:** fixed
**Commit:** `339cea38`
**Files modified:** `extension/background.js`, `extension/content/skopeo-adaptive-composer.js`, `extension/content/skopeo-runtime.js`, `extension/utils/skopeo-corpus-controller.js`, `tests/skopeo-browser-contract.test.js`, `tests/skopeo-corpus-runtime.test.js`, `tests/skopeo-drive-authority.test.js`
**Applied fix:** Folder status now asks background authority whether the exact current folder is the active corpus root and composes active-root or enrollment UI accordingly.
**Verification:** Controller, runtime, authority, and real Chrome browser-contract tests pass for active root, other folder, wake, and route changes.

### WR-03: Resource keys are not attached to the Drive requests that need them

**Status:** fixed
**Commit:** `feb18fd0`
**Files modified:** `extension/utils/capability-fetch.js`, `extension/utils/skopeo-drive-authority.js`, `extension/utils/skopeo-drive-corpus-transport.js`, `tests/skopeo-drive-authority.test.js`, `tests/skopeo-drive-corpus-transport.test.js`
**Applied fix:** Operation-local verified resource keys now produce `X-Goog-Drive-Resource-Keys` headers for exact metadata, export, and media requests without persistence or projection.
**Verification:** Capability-fetch, Drive transport, and authority fixtures assert the header on every keyed request and its absence elsewhere.

### WR-04: Session-list bridge returns raw legacy/corrupt index records without a byte cap

**Status:** fixed
**Commit:** `77a95687`
**Files modified:** `extension/utils/trusted-local-feature-store.js`, `tests/skopeo-corpus-store.test.js`
**Applied fix:** Legacy session-index entries are parsed into a strict allowlisted projection, reserved IDs and hostile fields are rejected, sensitive strings are redacted, and count/response-byte limits apply after sanitization.
**Verification:** Trusted-store tests cover corrupt legacy entries, prototype-reserved IDs, injected fields, secrets, oversized commands/outcomes, and the final response cap.

## Verification

- Focused RED/GREEN suites: automation trusted bridge, corpus store, Drive authority, Drive transport, Drive reconciler, corpus runtime, capability fetch, and browser contract all pass.
- Broad Skopeo suite: every `tests/skopeo-*.test.js` file passes.
- Capability/provider gates: `tests/capability-fetch.test.js` passes 66/66 and `tests/provider-parity.test.js` passes 34/34.
- Static trusted-storage gate: `scripts/verify-skopeo-storage-boundary.mjs` passes for 32 injected/dependency files.
- Browser gate: `tests/skopeo-browser-contract.test.js` passes against Google Chrome with node reuse, ABA, reorder, detach, reverse-route, scroll, zoom, and resize observations.
- Syntax/diff gates: all changed JavaScript passes `node --check`; `git diff --check` passes.

---

_Fixed: 2026-07-20T19:40:31Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
