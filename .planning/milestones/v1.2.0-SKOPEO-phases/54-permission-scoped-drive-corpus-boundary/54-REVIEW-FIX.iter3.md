---
phase: 54-permission-scoped-drive-corpus-boundary
fixed_at: "2026-07-20T20:30:47Z"
review_path: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-REVIEW.md
iteration: 2
findings: 4
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 54: Code Review Fix Report

**Fixed at:** 2026-07-20T20:30:47Z
**Source review:** `.planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-REVIEW.md`
**Iteration:** 2

**Summary:**

- Findings in scope: 4
- Fixed: 4
- Skipped: 0
- Atomic fix commits: 4

## Fixed Issues

### CR-01: Abort deadlines can still hang forever on a non-cooperative await

**Status:** fixed
**Commit:** `25194567`
**Files modified:** `extension/background.js`, `extension/utils/capability-fetch.js`, `extension/utils/skopeo-corpus-controller.js`, `extension/utils/skopeo-drive-authority.js`, `extension/utils/skopeo-drive-reconciler.js`, `tests/capability-fetch.test.js`, `tests/skopeo-drive-authority.test.js`, `tests/skopeo-drive-reconciler.test.js`
**Applied fix:** Authority and controller deadline helpers now detach non-cooperative downstream promises after timeout or abort. Page reads race `tabs.get` and `executeScript` against cancellation. Reconciler runs now have a bounded run-level deadline, opaque run token/epoch, propagated signals, and late-effect fences around publication and checkpoint mutation.
**Verification:** RED fixtures first reproduced never-settling authority, controller, page-read, and reconciler transport operations. GREEN fixtures prove every public call settles by its bound and that delayed completions cannot publish visibility or advance checkpoints.

### CR-02: The final active-pointer write can publish after its authority guard becomes stale

**Status:** fixed
**Commit:** `22b4efec`
**Files modified:** `extension/utils/skopeo-corpus-store.js`, `tests/skopeo-corpus-store.test.js`
**Applied fix:** The in-memory visibility gate remains closed throughout the active pointer write. The store revalidates the exact operation guard and fresh authority after the write, opens visibility only on success, and supersedes stale or aborted publication with a later closed manifest epoch. Visible and hidden reads require the same committed operation/epoch.
**Verification:** RED storage-race fixtures pause after active bytes are applied but before `storage.set()` resolves. Abort and Drive revision drift now return stale, expose no live manifest, persist a later closed epoch, and remain closed after store reconstruction.

### CR-03: A hash-fallback rename or move purges derivatives for unchanged bytes

**Status:** fixed
**Commit:** `c494dc3e`
**Files modified:** `extension/utils/skopeo-drive-reconciler.js`, `tests/skopeo-drive-reconciler.test.js`
**Applied fix:** Content replacement is derived only from canonical content-fingerprint inequality. A defensive re-read that reproduces the prior `export-byte-hash` or `download-byte-hash` falls through to membership or metadata handling, which preserves source-owned participants.
**Verification:** RED coverage exercises null checksum/revision identities across both rename and move. GREEN coverage confirms that the required byte read occurs, the fingerprint remains stable, and fragment/index/citation/count/relationship/cache/alert participants are not purged.

### WR-01: Child listing cannot carry the resource key of a keyed parent folder

**Status:** fixed
**Commit:** `c88c5496`
**Files modified:** `extension/utils/capability-fetch.js`, `extension/utils/skopeo-drive-authority.js`, `extension/utils/skopeo-drive-corpus-transport.js`, `extension/utils/skopeo-drive-reconciler.js`, `tests/skopeo-drive-authority.test.js`, `tests/skopeo-drive-corpus-transport.test.js`, `tests/skopeo-drive-reconciler.test.js`
**Applied fix:** `listChildren()` accepts an exact-parent opaque resource-key handle, binds it to the parent file ID and pagination scope, and emits `X-Goog-Drive-Resource-Keys: parentFileId/resourceKey` only inside the private page request. Authority ancestry and reconciler inventory pass only verified operation-local parent keys.
**Verification:** RED/GREEN fixtures cover keyed page requests, pagination, root and nested scans, and reject forged, raw, object-shaped, or cross-parent keys before any page call.

## Verification

- Exact Phase 54 focused chain passes: corpus schema, corpus store (68 assertions), Drive transport, Drive authority/controller, Drive reconciler, and corpus runtime.
- Provider/capability/storage gates pass: lattice provider bridge (111/111), capability fetch (68/68), automation trusted bridge, and the trusted-storage boundary over 32 injected/dependency files.
- Phase 54 integration gates pass: adaptive composer, shell contract, catalog runtime, and session lifecycle.
- Real-Chrome browser contract passes with node reuse, ABA, reorder, detach, reverse-route, scroll, zoom, and 420px resize observations.
- `npm run validate:extension` passes, including all storage, origin, readiness, activation, and 430-file JavaScript parse gates.
- `npm test` passes with exit code 0, including the once-registered focused chain and real-browser contract.
- Reviewed production JavaScript passes `node --check`; focused package registrations each appear exactly once; `git diff --check` passes.

---

_Fixed: 2026-07-20T20:30:47Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 2_
