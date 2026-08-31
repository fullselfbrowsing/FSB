---
phase: 61-delegation-ux-sw-eviction-persistence
plan: "07"
subsystem: delegation-sidepanel
tags: [delegation, sidepanel, accessibility, hydration, consent, human-control, recovery]

requires:
  - phase: 61-01
    provides: exact delegated routing, one-use consent challenges, and provider-local trust
  - phase: 61-02
    provides: bounded canonical event ledger and sole delegated lifecycle controller
  - phase: 61-06
    provides: background-owned start, control, Stop, snapshot, and wake-recovery composition
provides:
  - text-only provider-neutral delegated feed and honest semantic summary
  - exact consent, Take Control, Resume, Stop, connectivity, and recovery UI states
  - conversation-bound silent hydrate-before-subscribe with strict id and sequence filtering
affects: [61-08, phase-62, phase-63, phase-64, phase-65]

tech-stack:
  added: []
  patterns:
    - construct every event-derived node with createElement, textContent, and createTextNode only
    - bind one server delegation id to one selected conversation in bounded session storage
    - hydrate the exact canonical snapshot silently before opening the live-update subscription gate

key-files:
  created:
    - extension/ui/delegation-feed.js
    - tests/delegation-sidepanel-ui.test.js
  modified:
    - extension/background.js
    - extension/ui/sidepanel.html
    - extension/ui/sidepanel.js
    - extension/ui/sidepanel.css
    - extension/utils/delegation-controller.js
    - tests/delegation-controller.test.js
    - tests/mcp-bridge-background-dispatch.test.js
    - tests/sidepanel-tab-aware-smoke.test.js
    - tests/owner-chip.test.js

key-decisions:
  - "The side panel renders only closed canonical snapshot fields and never parses presentation strings or provider-native output as authority."
  - "Conversation-to-delegation bindings are session-scoped, bounded to 50 entries, and removed by explicit new-task/retry actions; no browser-restart persistence is claimed."
  - "Hydration is silent and completes before subscription; only a strictly newer matching sequence may use the one polite announcer."
  - "Doctor and setup actions copy one literal command or open the local Providers surface only; no UI recovery action executes, restarts, or invokes native code."

patterns-established:
  - "Canonical snapshots are the sole source of starting, running, held, stopping, terminal, disconnected, and restart-loss presentation."
  - "Unchanged alert states disable live announcement, while a newly entered connectivity alert uses role=alert once without duplicating the feed live region."

requirements-completed:
  - UX-02
  - UX-03
  - UX-04
  - UX-05
  - UX-06
  - LIFE-01
  - LIFE-02
  - LIFE-03
  - LIFE-04

duration: 1h 1m
completed: 2026-07-15
---

# Phase 61 Plan 07: Delegated Side-Panel Lifecycle Summary

**The side panel now presents one safe, exact-copy delegated lifecycle: canonical events render as inert text, consent and human control wait for authority, terminal/connectivity recovery stays honest, and selected conversations hydrate silently before live updates.**

## Performance

- **Duration:** 1h 1m
- **Started:** 2026-07-15T11:51:24Z
- **Completed:** 2026-07-15T12:52:46Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added a dual-export delegated-feed renderer that consumes only validated canonical init, tool, retry, result, terminal, and metrics fields; hostile HTML, URLs, handlers, and style payloads remain inert text.
- Added a semantic feed region, live announcer, status/control bar, `article` event rows, `dl` summary, native tool-breakdown details, honest subscription/API/unknown billing labels, responsive token-based styles, visible focus, dark-theme compatibility, and reduced-motion behavior.
- Implemented exact first-use consent and trust copy with challenge-bound background commands, Back/Escape focus restoration, no trust write on checkbox change, and no optimistic start.
- Scoped Take Control and Resume to canonical active-tab ownership, kept the control visible through pending transitions, deduplicated commands, and moved focus only after authoritative held/running snapshots.
- Added canonical Stop, exact released-tab grammar, offline, three-miss disconnect, daemon-restart loss, unpaired, unsupported, incomplete-run, and resume-failure presentations with the approved actions and no native/daemon/shell authority.
- Added a strict 50-entry session mapping from selected conversation to server delegation id. Panel open and tab swaps hydrate the exact id before subscribing, cleared session returns to ready, stale or interleaved ids are ignored, historical rows remain silent, and only strictly newer matching rows announce.
- Preserved ordinary side-panel history, owner-chip, active-tab, provider, background-dispatch, listener, and message-log contracts while adding delegated lifecycle state.

## Task Commits

Each task was committed atomically:

1. **Task 1: Render normalized live cards and an honest semantic summary** — `7ec3a643`
2. **Task 2: Implement exact consent and human-control states without optimism** — `1a4e5847`
3. **Task 3: Render Stop, connectivity, restart-loss, and hydrated recovery states** — `4e4cfe65`

## Files Created/Modified

- `extension/ui/delegation-feed.js` — Validates closed snapshots and renders safe provider-neutral rows and semantic summaries through text-only DOM construction.
- `extension/ui/sidepanel.html` — Adds one dedicated delegation region, alert/status surface, control bar, and polite announcer while preserving existing owner and composer structure.
- `extension/ui/sidepanel.js` — Owns exact consent/control/runtime commands, conversation binding, hydrate-before-subscribe, strict id/sequence filtering, recovery states, focus, and composer locking.
- `extension/ui/sidepanel.css` — Styles delegated cards, controls, alerts, technical details, narrow layouts, focus-visible states, dark tokens, and reduced motion.
- `extension/background.js` — Refreshes controller-owned active-tab eligibility before returning snapshot and lifecycle responses.
- `extension/utils/delegation-controller.js` — Derives exact active-owned or held-tab eligibility from registry authority and exposes it only through canonical snapshots.
- `tests/delegation-sidepanel-ui.test.js` — Exercises closed schemas, hostile metadata, exact copy/actions, focus, no optimism, tab counts, alert dedupe, session LRU, hydration order/silence, interleaved ids, and recovery DOM states.
- `tests/delegation-controller.test.js` — Pins exact mapped ownership, held-lease tab selection, caller-field rejection, and fail-closed incomplete authority.
- `tests/mcp-bridge-background-dispatch.test.js` — Pins controller-derived eligibility refresh on snapshots and lifecycle settlements.
- `tests/sidepanel-tab-aware-smoke.test.js` — Advances exact side-panel source and script/DOM wiring pins.
- `tests/owner-chip.test.js` — Preserves owner-chip ordering and uniqueness across the delegation mount additions.

## Decisions Made

- A selected conversation owns at most one exact canonical delegation id. Starts bind the daemon-accepted id to the origin conversation even if the user changes tabs before the response; late responses never render into a different selected conversation.
- A runtime listener may be installed eagerly, but its subscription gate remains closed until the exact snapshot request has rendered or the selected conversation has honestly resolved to ready.
- Stop failures retain the prior canonical snapshot and show a truthful inline failure. Only a canonical `stopping` snapshot may display `Stopping agent…`, and only a terminal snapshot unlocks the composer.
- Restart copy requires both restart-loss controller state and terminal code `daemon_restart_lost_run`. A transport disconnect alone always uses the distinct three-miss connection-lost state.
- The last ordinary user task is derived in memory from the existing conversation log for retry copy/actions. No new durable task store or extension-restart continuity claim was introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Missing critical authority seam] Added controller-derived active-tab eligibility**

- **Found during:** Task 2 (Take Control visibility)
- **Issue:** Plan 06 snapshots did not refresh whether the browser's active tab was exactly owned by the selected running delegation or belonged to its sealed held lease. Deriving that in the side panel would have required forbidden registry reads or caller-authored ownership fields.
- **Fix:** Added a closed `refreshActiveTab({delegationId})` controller operation that resolves the active tab and exact delegation mapping/owned-token set or held lease, fails closed on incomplete authority, and is invoked before background snapshot and lifecycle responses.
- **Files modified:** `extension/utils/delegation-controller.js`, `extension/background.js`, `tests/delegation-controller.test.js`, `tests/mcp-bridge-background-dispatch.test.js`
- **Verification:** Controller tests pass 23/23, background dispatch tests pass 157/157, and UI/tab-aware tests prove Take Control appears only from the canonical active-owned snapshot.
- **Committed in:** `1a4e5847`

---

**2. [Adjacent compatibility] Kept extracted legacy chat hydration self-contained**

- **Found during:** Full-suite verification after Task 3
- **Issue:** The legacy message-log smoke extracts `hydrateChatFromConversationId` into an isolated VM. Direct writes to the new in-memory last-task map raised a `ReferenceError` in that extracted boundary, causing Tier 1 and Tier 2 hydration to fall through to zero rows.
- **Fix:** Guarded the optional map write by feature detection inside both hydration tiers. Full side-panel runtime still records retry task text, while the extracted legacy function retains its prior independent contract.
- **Files modified:** `extension/ui/sidepanel.js`
- **Verification:** `sidepanel-message-log-smoke` passes 61/61, focused delegation/owner/tab suites pass, and the complete guarded root suite passes.
- **Committed in:** `4e4cfe65`

---

**Total deviations:** 2 auto-fixed issues: one missing critical authority seam and one adjacent compatibility issue.
**Impact on plan:** The active-tab seam was necessary to honor the plan's canonical-snapshot-only UI boundary, and the hydration guard preserves both the new in-memory retry hint and the existing legacy contract. Neither change adds storage authority, provider-native state, or an alternate lifecycle.

## Issues Encountered

- The first guarded root-suite pass reached the new side-panel integration and exposed the isolated message-log hydration dependency above. After the feature guard, that 61-assertion suite and the complete root suite passed.
- Showcase crawler tests advanced only generated date bytes from 2026-07-14 to 2026-07-15. The exact pre-plan user-owned bytes were recovered from the Conductor checkpoint and restored with `apply_patch`; all three protected hashes match the Plan 06 baseline and the files remained unstaged.
- No genuine side-panel visual interaction, authenticated Claude stream, worker eviction, long-running heartbeat, POSIX process group, daemon restart, or browser handoff was exercised. Per user instruction, all live UAT remains pending for the milestone-end sweep.

## User Setup Required

None. Genuine browser/CLI/kernel and visual/accessibility corroboration remains deferred to the milestone-end UAT ledger.

## Next Phase Readiness

- Plan 61-08 can now pin the completed source/security/compatibility surface and assemble the single milestone-end UAT ledger without inventing live evidence.
- The side panel consumes only Plan 06's closed id-keyed snapshots and commands; no second lifecycle authority or provider-native UI branch remains to reconcile.
- No implementation blocker remains. Every genuine live browser/CLI/kernel/visual check stays explicitly pending.

## Verification

- `node --check extension/ui/sidepanel.js` — PASS
- `node tests/delegation-sidepanel-ui.test.js` — PASS
- `node tests/delegation-controller.test.js` — PASS (23 passed, 0 failed)
- `node tests/sidepanel-tab-aware-smoke.test.js` — PASS (49 passed, 0 failed)
- `node tests/sidepanel-message-log-smoke.test.js` — PASS (61 passed, 0 failed)
- `node tests/owner-chip.test.js` — PASS (54 passed, 0 failed)
- `node tests/sidepanel-mcpvisualsession-listener.test.js` — PASS (11 passed, 0 failed)
- `node tests/mcp-bridge-background-dispatch.test.js` — PASS (157 passed, 0 failed)
- `node tests/providers-panel-logic.test.js` — PASS
- `node scripts/run-phase60-full-tests.mjs` — PASS (complete root suite; workspace state preserved)
- Protected generated SHA-256 values after verification — PASS:
  - `mcp/build/index.js`: `6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4`
  - `showcase/angular/public/llms-full.txt`: `664347e0e6a30c276bdbdfea8bb2bfdf1242bd7d61fb6493de870fccd4ddd38e`
  - `showcase/angular/public/llms.txt`: `c69ed23d415f8f9f097ec386e789372a3a8a71b011b4d4420bf09ee949587e76`
  - `showcase/angular/public/sitemap.xml`: `826aa8f8b2bc828c423572a6b9697d0666a94a830b7aebbdf1812501e88c3bea`
- `git diff --check` on all Plan 07 implementation/test files — PASS
- Live UAT — not run; deferred to the milestone-end sweep by explicit user instruction

## Self-Check: PASSED

All three declared tasks and authority links are implemented, all atomic commits are present, focused and full automated suites pass, protected generated bytes match exactly, the temporary Phase 39 path is absent, unrelated/user-owned state was not staged, and no live/manual result was claimed.

---
*Phase: 61-delegation-ux-sw-eviction-persistence*
*Completed: 2026-07-15*
