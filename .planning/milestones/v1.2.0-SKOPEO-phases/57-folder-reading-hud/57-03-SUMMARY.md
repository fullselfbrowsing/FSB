---
phase: 57-folder-reading-hud
plan: "03"
subsystem: ui-authority
tags: [skopeo, hud, drive, docs, truth, citations, capability-security]

requires:
  - phase: 57-01
    provides: Closed bounded HUD schema and deterministic folder/reading projector
  - phase: 57-02
    provides: Private current truth display snapshot with recompute and currentness fences
  - phase: 54-corpus
    provides: Exact-set corpus operations, certified sources, and authenticated Drive transport
provides:
  - Exact background-only HUD projection and citation-open message handlers
  - Current corpus/graph/truth join minimized through the Phase 57 HUD projector
  - Controller-scoped one-shot citation capabilities with fresh truth, access, and revision checks
  - Exact trusted import pins and executable authority-boundary regression coverage
affects: [57-04-content-model, 57-05-hud-shell, phase-58-cited-ask]

tech-stack:
  added: []
  patterns:
    - Background-local dependency-injected authority controller
    - Ready-to-pending one-shot effect capability with guarded commit
    - Opaque content identifiers backed by private raw authority bindings

key-files:
  created:
    - .planning/milestones/v1.2.0-SKOPEO-phases/57-folder-reading-hud/57-03-SUMMARY.md
  modified:
    - extension/background.js
    - tests/skopeo-hud-runtime.test.js
    - tests/lattice-provider-bridge-smoke.test.js

key-decisions:
  - "Keep the HUD authority registry inside a narrow frozen controller factory and inject only current-binding, projection, truth, corpus-operation, and tab-effect functions."
  - "Bind caller-minted opaque semantic/action tokens to the sender-derived current entity; never echo Drive or Docs entity IDs in the projection envelope."
  - "Resolve vendor labels and citation metadata through fresh authenticated getFile calls instead of introducing a retained folder catalog."
  - "Reach the graph exact-set snapshot only through a private boundary helper so the graph facade remains unavailable to generic message surfaces."

patterns-established:
  - "HUD authority sandwich: exact message -> current sender/controller binding -> certified operation -> post-await binding equality -> schema validation."
  - "Citation commit: atomically consume capability -> re-read truth/citation and metadata -> validate canonical target -> publish one tab effect."

requirements-completed: [VIEW-01, VIEW-04, VIEW-05]

duration: 29min
completed: 2026-08-12
---

# Phase 57 Plan 03: Trusted Folder/Reading Controller Summary

**Background-only folder/reading projections now join certified corpus, exact graph, and current truth state while one-shot citation capabilities revalidate source access and revision before opening a canonical Google target.**

## Performance

- **Duration:** 29 min
- **Started:** 2026-08-12T18:16:03Z
- **Completed:** 2026-08-12T18:44:45Z
- **Tasks:** 3
- **Files modified:** 3 implementation/test files

## Accomplishments

- Added exact `skopeo:hud-projection` and `skopeo:hud-citation-open` background handlers whose tab, mode, entity, source set, and profile authority come only from the current sender/controller state.
- Joined the current visible manifest, exact graph snapshot, private truth display snapshot, and fresh Drive metadata into the closed Phase 57 HUD projector without exposing raw IDs, URLs, locators, provider data, or private facades.
- Added controller-local replacement/teardown revocation and one-shot citation actions that revalidate truth generation/context, family/citation identity, source certification, content fingerprint, access, and revision before the guarded tab-opening commit.
- Pinned the two HUD imports at exactly 338 `importScripts` mentions and 332 call sites while preserving all 112 lattice provider-bridge assertions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin the trusted HUD controller and citation boundary in failing tests** - `f6f3b7d5` (test)
2. **Task 2: Implement exact background projection authority and bounded folder resolution** - `02f35062` (feat)
3. **Task 3: Implement fresh one-shot citation opening with revocation** - `fc1fb15f` (feat)

## Files Created/Modified

- `extension/background.js` - Imports the HUD modules, builds bounded projection inputs, owns lifecycle revocation and opaque action bindings, and performs guarded citation opens.
- `tests/skopeo-hud-runtime.test.js` - Covers controlled RED, exact messages, forbidden response authority, folder/reading projection, stale work, drift, replacement, replay, cross-tab use, and citation effects.
- `tests/lattice-provider-bridge-smoke.test.js` - Pins both intentional HUD imports, their exact order, and their measured import totals.
- `.planning/milestones/v1.2.0-SKOPEO-phases/57-folder-reading-hud/57-03-SUMMARY.md` - Records execution results and verification evidence.

## Decisions Made

- Kept raw corpus, graph, truth, and Drive identities in background-private bindings; the content envelope receives only cryptographically opaque projection/action/source/vendor tokens.
- Used the existing authenticated Drive corpus transport for every vendor label and citation metadata lookup, avoiding a second catalog and its reconciliation/purge surface.
- Routed exact graph snapshot access through a private helper next to the existing private truth helper, preserving the storage-boundary verifier's facade isolation contract.
- Constructed only allowlisted Docs document and Drive file HTTPS targets from freshly verified MIME/source state inside the effect path; content never supplies or receives a URL.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Preserved private graph-facade isolation**
- **Found during:** Task 3 coexistence verification
- **Issue:** Direct controller-region access to the lexical graph facade violated the established storage-boundary invariant even though the join remained background-only.
- **Fix:** Added `fsbRunPrivateHudGraphSnapshot` beside the private truth boundary and made the HUD builder consume only its closed result.
- **Files modified:** `extension/background.js`
- **Verification:** `node scripts/verify-skopeo-storage-boundary.mjs`
- **Committed in:** `fc1fb15f`

**2. [Rule 1 - Security Bug] Removed raw entity identity from HUD response tokens**
- **Found during:** Task 3 minimization review
- **Issue:** Reusing the existing corpus `kind:id` entity token would have embedded a raw Drive/Docs identifier in the HUD envelope.
- **Fix:** Bound caller-minted opaque semantic/action tokens to the sender-derived current entity in private controller state and revoked both on replacement or teardown.
- **Files modified:** `extension/background.js`
- **Verification:** HUD runtime forbidden-authority assertions and storage-boundary verifier pass.
- **Committed in:** `fc1fb15f`

---

**Total deviations:** 2 auto-fixed (1 missing critical boundary preservation, 1 security bug)
**Impact on plan:** Both changes enforce the plan's least-privilege and minimization requirements without expanding scope.

## Issues Encountered

- The plan's read-first list names `extension/utils/skopeo-drive-transport.js`; the repository's authoritative implementation is `extension/utils/skopeo-drive-corpus-transport.js`, which was used without creating an alias or duplicate transport.
- The isolated worktree had no `node_modules` directory. Verification temporarily linked the parent workspace's already-installed dependencies and removed the link after each run; no package or lockfile changed.

## Verification

- `node tests/skopeo-hud-runtime.test.js` - PASS
- `node tests/skopeo-corpus-runtime.test.js` - PASS
- `node tests/lattice-provider-bridge-smoke.test.js` - PASS (112 passed, 0 failed)
- `npm run test:skopeo-truth-evals` - PASS (`domain_fidelity` remains the suite's expected `human_needed` status)
- `node scripts/verify-skopeo-storage-boundary.mjs` - PASS (32 files checked)
- Controlled RED before implementation emitted exactly `skopeo hud controller contract: RED`; after implementation the same flag correctly exits nonzero because the named controller exists.

## Known Stubs

None. Phase 58/59 neutral projection fields remain intentionally owned by their later phases and do not block this plan's authority goal.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 57-04 can consume the exact opaque projection/citation message contract without receiving background authority.
- Plan 57-05 can render and dispatch the bounded schema envelope while relying on immediate replacement/teardown revocation.
- Live signed-in Drive/Docs validation of target usefulness and clause-level navigation remains part of Phase 57's documented human UAT, not a blocker for the mechanical controller contract.

## Self-Check: PASSED

- All three modified implementation/test files and this summary exist.
- Task commits `f6f3b7d5`, `02f35062`, and `fc1fb15f` are present in history.
- Requirements VIEW-01, VIEW-04, and VIEW-05 are marked complete.

---
*Phase: 57-folder-reading-hud*
*Completed: 2026-08-12*
