---
phase: 54-permission-scoped-drive-corpus-boundary
plan: "04"
subsystem: private-drive-corpus-transport
tags: [chrome-extension, mv3, google-drive, private-transport, exact-bytes, source-scoped-evidence]

requires:
  - phase: 54-permission-scoped-drive-corpus-boundary
    plan: "01"
    provides: Closed corpus schema, exact identity tuples, typed source states, and separate metadata/membership/content fingerprints
  - phase: 27-native-capability-catalog
    provides: Origin-pinned MAIN-world page-read executor and service-worker wrapper
provides:
  - Six-operation private Drive/Docs corpus namespace outside the public capability catalog
  - Typed permission, physical-parent, shared-drive, pagination, change, and download evidence
  - Frozen background wrapper with opaque source-scoped resource keys and one-shot scoped page tokens
  - Exact two-MIME content policy with whole-read 10 MiB enforcement, SHA-256 verification, and operation-local text sinks
affects: [54-05-drive-authority, 54-06-drive-reconciler, 54-08-runtime-integration, phase-55-local-graph]

tech-stack:
  added: []
  patterns: [private-fixed-action-namespace, opaque-source-evidence, one-shot-pagination, exact-byte-operation-sink, fixture-locked-provider-results]

key-files:
  created:
    - extension/utils/skopeo-drive-corpus-transport.js
    - tests/skopeo-drive-corpus-transport.test.js
  modified:
    - extension/utils/capability-fetch.js

key-decisions:
  - "The corpus seam is a literal private namespace dispatched before the unchanged public page-read allowlist; callers can select only six fixed operations and can never supply an endpoint, method, fields, query, export MIME, or request body."
  - "Drive permission ID is the only account authority fact returned by about(); physical parents, shared-drive fields, shortcut leaf metadata, removed status, and typed 403/opaque-404 outcomes remain distinct evidence."
  - "Provider resource keys and pagination tokens cross the trusted wrapper only as branded transport-instance handles scoped to one source or one operation/parent/drive chain; stale, foreign, repeated, raw, or forged claims make zero page calls."
  - "Content admits only Google Docs exported as exact text/plain or stored blobs whose MIME is exactly text/plain; byte 10,485,761 rejects the whole operation before decode or partial hash, while accepted bytes are rehashed before fatal UTF-8 decode and passed only to an awaited one-shot sink."

patterns-established:
  - "Private authenticated seam: keep special-purpose provider authority behind a literal internal namespace and construct every provider request from constants without public catalog registration."
  - "Branded transient evidence: hold raw provider keys/tokens only in WeakMap-backed transport state and expose frozen opaque handles whose source/scope/currentness is rechecked before use."
  - "Whole-body handoff: enforce declared and actual caps in page context, verify the complete byte hash again in trusted context, decode fatally, await one operation sink, and return only hash/length metadata."

requirements-completed: [CORPUS-01, CORPUS-03, CORPUS-06]

duration: 33 min
completed: 2026-07-20
---

# Phase 54 Plan 04: Private Drive Corpus Transport Summary

**Drive corpus authority now crosses one origin-pinned, six-action private seam with typed physical/shared-drive evidence, opaque transient keys, and exact-size content that never escapes its awaited operation sink**

## Performance

- **Duration:** 33 min
- **Started:** 2026-07-20T14:24:06Z
- **Completed:** 2026-07-20T14:57:40Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added an adversarial Fake-gapi/VM contract covering the exact six operations, Drive and Docs origins, sole `permissionId` authority, physical parents, shared-drive flags, shortcut leaf metadata, pagination/change evidence, typed provider failures, hostile variants, and zero-call arbitrary-request negatives.
- Added the private `skopeo-drive-corpus` page namespace without adding it to the public namespace allowlist or either generated catalog artifact. Its gapi calls are built only from literal Drive v3 paths, exact field sets, direct-parent queries, and fixed shared-drive parameters.
- Preserved fixture-locked `transient`, `denied`, `not-found`, `download-denied`, `unsupported`, `incomplete`, `too-large`, and `malformed` outcomes while stripping raw messages, bodies, stacks, HTML, and unallowlisted provider fields.
- Enforced the literal v1 read policy: Drive MIME `application/vnd.google-apps.document` exports only as `text/plain`; stored MIME exactly `text/plain` reads only through `alt=media`; every other MIME fails before an authenticated body call.
- Added the frozen classic-global/CommonJS background wrapper. It revalidates its live tab/origin context, parses only allowlisted values into frozen null-prototype records, brands current source keys and scoped one-shot page tokens, and rejects stale/cross-source/repeated/forged evidence before execution.
- Enforced exact 10,485,760-byte success and declared/streamed 10,485,761-byte whole-read rejection/cancellation. Complete bytes are SHA-256 hashed in page context, rehashed before fatal UTF-8 decode in the wrapper, delivered to one awaited operation sink, then omitted from the normal result.

## Task Commits

Each task was committed atomically:

1. **Task 1: Specify the private Drive transport and typed failure vocabulary in RED** - `a2bd5087` (test)
2. **Task 2: Add the private fixed-action gapi namespace without broadening the public catalog** - `00a84560` (feat)
3. **Task 3: Implement the background-only wrapper, normalization, and operation-local content sink** - `19a69112` (feat)

## Files Created/Modified

- `extension/utils/skopeo-drive-corpus-transport.js` - Exact six-operation transport factory, live context validation, typed normalization, opaque transient evidence, byte revalidation, and one-shot content consumption.
- `extension/utils/capability-fetch.js` - Private origin-pinned Drive/Docs gapi action executor with exact requests, allowlisted responses, typed status mapping, MIME closure, and streamed/declared size enforcement.
- `tests/skopeo-drive-corpus-transport.test.js` - Controlled RED plus page/wrapper provider fixtures, origin/action/catalog negatives, shared-drive/pagination evidence, stale/cross-source handles, exact-byte boundaries, cancellation, and output-retention checks.

## Verification

- Controlled Task 1 RED exited nonzero at the intended missing `skopeo-drive-corpus` private namespace assertion.
- `node --check extension/utils/capability-fetch.js` - passed.
- `node --check extension/utils/skopeo-drive-corpus-transport.js` - passed.
- `node tests/skopeo-drive-corpus-transport.test.js` - passed, including exact 10,485,760/10,485,761 boundaries and zero-call stale/cross-source/live-context negatives.
- `node tests/skopeo-corpus-schema.test.js` - passed.
- `node tests/capability-fetch.test.js` - passed 66/66.
- `node tests/lattice-provider-bridge-smoke.test.js` - passed 110/110.
- `git diff --check` - passed before every task commit and at final implementation verification.
- Public catalog snapshots remained byte-identical: recipe index `d7219f67d418648d6baa38100a77bb7618e9e03a203928bbc48d1cbf648cbff8`; Skopeo profile index `88d70ace6a6f75c57daa97a2b9031a76dee390cc4ef9b9d8de0d9d47b381d94d`.

## Decisions Made

- Kept the corpus transport separate from legacy public `gdrive` behavior and handled its private namespace before the unchanged public namespace gate.
- Required exact own data-property request shapes in both page and background contexts; extra caller controls fail before gapi or page execution.
- Treated provider tokens and resource keys as transient transport evidence rather than serializable authority or fingerprint inputs.
- Recomputed the complete content hash on the background side instead of trusting the page hash, and decoded only after both size and hash checks passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking path correction] Used the repository's actual generated catalog artifacts**
- **Found during:** Task 2 read-first gate
- **Issue:** The plan named `extension/catalog/capabilities.json` and `extension/catalog/catalog.generated.js`, but neither path exists in this checkout.
- **Fix:** Read and hash-locked the current generated equivalents, `extension/catalog/recipe-index.generated.js` and `extension/catalog/skopeo-profile-index.generated.js`, then proved both remained unchanged and excluded the private namespace.
- **Files modified:** None for this correction.
- **Verification:** Pre/post SHA-256 hashes are identical and the transport contract asserts the namespace is absent from both files.
- **Committed in:** No code change required; documented in this summary.

**2. [Rule 1 - Test harness bug] Installed getter-only Node globals through descriptors**
- **Found during:** Task 2 GREEN execution
- **Issue:** The current Node runtime exposes `globalThis.crypto` as a getter-only property, so the Fake-gapi harness could not assign WebCrypto directly.
- **Fix:** Changed the fixture to save, install, and restore global property descriptors; also corrected the encoded-path fixture so its returned file ID matched the requested source ID.
- **Files modified:** `tests/skopeo-drive-corpus-transport.test.js`
- **Verification:** The page contract, capability-fetch regression, and final transport suite all pass.
- **Committed in:** `00a84560`

---

**Total deviations:** 2 auto-fixed (1 blocking path correction, 1 test harness bug)
**Impact on plan:** Both corrections were necessary to run the specified contract in the current checkout; neither broadened production scope or public capability behavior.

## Issues Encountered

- The two plan-named generated catalog paths were stale relative to the current repository layout; the actual generated recipe/profile indexes were used and remained byte-frozen.
- Node's getter-only WebCrypto global required descriptor-based test installation. No production issue remained after the harness correction.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 05 can build fresh account/root/ancestry authority directly on the six typed operations while preserving opaque 404 as inaccessible and never missing.
- Plan 06 can consume bounded list/change tokens as hints and reprove physical membership before reconciliation or deletion authority.
- Plan 08 can import and instantiate the wrapper in the trusted background after the authority/reconciler layers exist; the public catalog remains untouched.

## Self-Check: PASSED

- All three task commits exist and the required schema, transport, capability-fetch, and provider-bridge gates are green.
- Exact-size success/failure, streamed cancellation, stale/cross-source keys, repeated/foreign tokens, unsupported MIME families, hostile provider shapes, and no-output-path checks are fixture-locked.
- Generated public artifacts are unchanged and contain no private namespace.
- The working tree was clean after Task 3 and before summary/tracking creation.

---
*Phase: 54-permission-scoped-drive-corpus-boundary*
*Completed: 2026-07-20*
