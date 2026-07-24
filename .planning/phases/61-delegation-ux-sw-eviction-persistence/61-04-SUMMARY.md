---
phase: 61-delegation-ux-sw-eviction-persistence
plan: "04"
subsystem: delegation-ownership
tags: [delegation, agent-registry, hold-lease, ownership-token, chrome-storage-session]

requires:
  - phase: 59
    provides: authenticated reverse-request registration and extension-minted agent identity
  - phase: 60
    provides: daemon-minted bounded delegation ids in the spawned MCP environment
  - phase: 61-02
    provides: sole id-keyed delegation controller and bindRegisteredAgent authorization gate
provides:
  - optional bounded registration-only delegation correlation sidecar
  - durable one-to-one server-delegation to extension-agent mapping
  - complete exact mapped-tab hold leases with atomic seal and restore
  - exact isolated delegation cleanup with distinct released-tab counts
affects: [61-05, 61-06, 61-07, 61-08, phase-62]

tech-stack:
  added: []
  patterns:
    - persist a cloned candidate registry envelope before atomically adopting authority changes in memory
    - keep human-held tabs in a sealed reservation after active ownership removal and after expiry
    - require the sole controller gate before a registration sidecar may bind extension identity

key-files:
  created: []
  modified:
    - mcp/src/agent-scope.ts
    - extension/ws/mcp-tool-dispatcher.js
    - extension/utils/agent-registry.js
    - tests/agent-scope.test.js
    - tests/agent-registry.test.js
    - tests/agent-bridge-routes.test.js
    - tests/open-tab-background-default.test.js

key-decisions:
  - "Capture FSB_DELEGATION_ID once per AgentScope process, validate the Phase 60 grammar, and carry it only in the initial agent:register payload."
  - "Let only DelegationController.bindRegisteredAgent authorize registry binding; every malformed, missing-gate, stale, terminal, replayed, or conflicting registration rolls back the fresh ordinary agent."
  - "Write candidate mapping/lease/restore/release state to session storage before adopting it in memory, so a rejected durable write never creates partial authority."
  - "Expiry returns hold_expired with cancel_required and keeps every held tab reserved; time alone never frees a potentially human-controlled tab."
  - "Generic agent/grace release refuses controller-mapped agents; only releaseDelegation with both exact identities may remove their active and held ownership."

patterns-established:
  - "Delegation ids are correlation sidecars, never agent ids, ownership tokens, or caller-supplied MCP tool arguments."
  - "Seal/restore/release validate complete forward, reverse, tab, token, and lease indexes under the module-scope registry lock before changing any authority."
  - "The registry consumes a controller-verified activeTabId but never queries or decides active-tab UI eligibility."

requirements-completed:
  - UX-04
  - UX-05

duration: 21min
completed: 2026-07-15
---

# Phase 61 Plan 04: Exact Delegation Mapping and Sealed Hold Lease Summary

**Daemon-minted delegation ids now bind once to extension-minted agents, and complete tab/token ownership can move through durable human-control leases, exact restore, and isolated counted cleanup without an unowned race window.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-07-15T09:57:40Z
- **Completed:** 2026-07-15T10:18:19Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added an injected, captured environment to `AgentScope` and carried a valid `FSB_DELEGATION_ID` only on the initial `agent:register` sidecar, preserving the exact empty legacy payload when absent and rejecting malformed values before transport.
- Made the dispatcher pass only the fresh extension-minted agent id and exact sidecar to the controller authorization gate; missing, malformed, unknown, not-yet-active, stale, terminal, case-varied, replayed, and conflicting registrations fail and roll back the ordinary agent record.
- Extended the additive v1 registry envelope with strictly hydrated one-to-one delegation mappings and versioned five-minute hold leases, including duplicate/ghost conflict pruning and durable-write-before-adopt behavior.
- Added complete set-for-set `{tabId, ownershipToken}` sealing that removes all active automation ownership only after validation and preserves an unclaimable reservation across worker reload, storage failure, concurrent claims/releases, and the exact expiry boundary.
- Added all-or-nothing complete restore and exact cleanup. Missing tabs, stale tokens, identity/index drift, persistence rejection, or expiry never partially restore; cleanup releases only the exact mapped agent's distinct active-plus-held union and reports the honest count.
- Preserved `open_tab` background-default behavior and pinned that the route never performs delegation lease transitions or focus changes beyond explicit `active:true`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Carry the optional server delegation id into one extension agent mapping** — `f4a33176`
2. **Task 2: Seal exact owned-tab state into an unclaimable hold lease** — `00efa0c2`
3. **Task 3: Restore or release only the exact unchanged delegation mapping** — `cd31b29f`

Follow-up security/test hardening:

- **Fail closed on durable binding and forward/reverse index drift** — `4f9d695c`
- **Pin Phase 61 background-open parity explicitly** — `0e1bc547`

## Files Created/Modified

- `mcp/src/agent-scope.ts` — Captures an injected environment and builds the optional bounded registration-only delegation sidecar.
- `extension/ws/mcp-tool-dispatcher.js` — Gates delegated registrations through the sole controller callback and rolls back every denial.
- `extension/utils/agent-registry.js` — Persists exact delegation maps and sealed leases; implements binding, complete snapshot, seal, restore, and exact counted release under the registry lock.
- `tests/agent-scope.test.js` — Proves absent/present/malformed environment behavior and caller-tool-schema absence.
- `tests/agent-registry.test.js` — Covers one-to-one conflicts, hydration, two-agent isolation, complete sealing, expiry, reload, storage rejection, restore races/loss, index drift, and exact cleanup counts.
- `tests/agent-bridge-routes.test.js` — Covers controller-gate acceptance, denial classes, one-time consumption, case sensitivity, and rollback of fresh agent rows.
- `tests/open-tab-background-default.test.js` — Pins unchanged background-default/focus policy and separation from delegation lease transitions.

## Decisions Made

- The server id remains a registration-only correlation value. It cannot replace the extension-minted agent id, ownership token, or any MCP tool argument.
- Delegation binding is a durable authority change. The registry now persists a cloned candidate state strictly and adopts it only after the session write succeeds; the same commit-before-adopt rule protects seal, restore, and release.
- The lease stores exactly its version, delegation/agent identities, controller-verified active tab, complete tab/token set, issued time, and fixed five-minute expiry. Auxiliary active-tab UI state remains controller-owned.
- Lease expiry is a cancellation signal, not an ownership release. Held reservations survive expiry and worker reload until exact restore or exact delegation cleanup.
- Generic release paths refuse any controller-mapped agent, including grace expiry. This keeps cleanup routed through the exact delegation-plus-agent contract and prevents a bridge lifecycle event from bypassing isolated Stop semantics.

## Deviations from Plan

None — the declared sidecar, authorization, mapping, lease, restore, cleanup, persistence, adversarial tests, and background-open parity all landed without authority expansion.

## Issues Encountered

- The plan's Task 2 read-first list referenced `extension/utils/agent-tab-context.js`, which does not exist in this tree. Its current ownership-resolution successor, `extension/utils/agent-tab-resolver.js`, was located and read completely together with `extension/ui/owner-chip.js`; no implementation change or blocker resulted.
- Repeated MCP builds regenerated ignored/unstaged compiled outputs as expected. The user-owned `mcp/build/index.js` bytes remained exactly SHA-256 `6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4` and were never staged.
- No live active-tab handoff, physical human-control interaction, or browser service-worker eviction UAT was run. Per user instruction, all live/human UAT remains pending for the single milestone-end sweep.

## User Setup Required

None. Real browser/daemon corroboration remains deferred to the milestone-end UAT ledger.

## Next Phase Readiness

- Plan 61-05 can add supervisor hold/resume/status and generation evidence against the exact registry lease contract.
- Plan 61-06 can wire the sole background controller to `bindRegisteredAgent`, `sealHoldLease`, `restoreHoldLease`, and `releaseDelegation` without creating another identity or ownership registry.
- Plan 61-07 can render Take Control/Resume/Stop outcomes using honest sealed/restored/released states and exact released-tab counts.

## Verification

- `npm --prefix mcp run build` — PASS
- `node tests/agent-scope.test.js` — PASS
- `node tests/agent-registry.test.js` — PASS
- `node tests/agent-bridge-routes.test.js` — PASS (57 passed, 0 failed)
- `node tests/open-tab-background-default.test.js` — PASS (13 passed, 0 failed)
- `node tests/delegation-controller.test.js` — PASS (16 passed, 0 failed; additional consumer integration evidence)
- `shasum -a 256 mcp/build/index.js` — PASS (`6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4`)
- `git diff --check` on every declared implementation/test file — PASS
- Live UAT — not run; deferred to the milestone-end sweep by explicit user instruction

## Self-Check: PASSED

All seven declared artifacts exist, all three task commits plus focused hardening/parity commits are present, the fresh MCP build and complete automated plan gate pass, the controller consumer suite passes, the protected build hash is unchanged, no generated build output was staged, and no live/manual outcome was claimed.

---
*Phase: 61-delegation-ux-sw-eviction-persistence*
*Completed: 2026-07-15*
