---
phase: 65-codex-adapter
plan: "01"
subsystem: durable-delegation-identity
tags: [accepted-identity, auth, billing, persistence, hydration]

requires:
  - phase: 61-delegation-ux-sw-eviction-persistence
    provides: Append-before-fanout delegation ledgers, silent hydration, and exact-once terminal settlement
  - phase: 64-opencode-adapter
    provides: Canonical Claude Code and OpenCode provider metadata and provider-neutral delegated lifecycle
provides:
  - Closed provider-neutral auth-state, billing-kind, and exact accepted-identity validation
  - Immutable five-field identity authority across controller snapshots, events, terminal settlement, and hydration
  - Durable ledger envelopes that reject identity drift, legacy reconstruction, hostile shapes, and USD injection
affects: [65-02, 65-03, 65-06, 65-07, codex-adapter, delegated-agent-ui]

tech-stack:
  added: []
  patterns:
    - Validate and freeze accepted provider, label, profile, auth, and billing together before the first asynchronous boundary
    - Persist accepted identity once at the ledger-envelope level and project compatibility fields from that authority
    - Reject legacy identity fragments and caller-provided USD rather than reconstructing mutable run truth

key-files:
  created: []
  modified:
    - extension/utils/delegation-providers.js
    - extension/utils/delegation-controller.js
    - extension/utils/delegation-event-store.js
    - tests/provider-parity.test.js
    - tests/delegation-controller.test.js
    - tests/delegation-event-store.test.js

key-decisions:
  - "Make the exact five-field accepted identity the sole durable run authority; retain the two-field provider snapshot only as a compatibility projection."
  - "Derive init client/profile and result billing only from the accepted identity, never from streamed events or current provider selection."
  - "Reject pre-identity ledger envelopes during hydration instead of reconstructing billing or profile authority from legacy entries."

patterns-established:
  - "Accepted identity boundary: exact own enumerable data fields are cloned and frozen synchronously before persistence or fanout."
  - "Envelope authority: every append must match the ledger's accepted identity; cleanup and terminal transitions preserve the same record byte-for-byte."

requirements-completed: [MULTI-05]

duration: 22 min
completed: 2026-07-22
---

# Phase 65 Plan 01: Accepted Auth and Billing Identity Foundation Summary

**Delegated runs now carry one exact immutable provider/profile/auth/billing identity through acceptance, persistence, terminal settlement, and hydration without exposing Codex.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-22T10:00:22Z
- **Completed:** 2026-07-22T10:22:36Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added frozen provider-neutral auth and billing vocabularies, metadata-owned allowed mappings, and an exact hostile-record-safe five-field identity validator while preserving the byte shape of Claude Code and OpenCode public metadata.
- Made accepted identity mandatory at controller start, immutable in snapshots and event reduction, and authoritative for provider/profile/billing across cleanup, terminal settlement, and service-worker hydration.
- Added exact accepted identity to durable ledger envelopes, rejected identity drift and legacy envelopes, forced persisted USD to remain null, and retained sequence, quota, terminal, stale-run, and recovery behavior.
- Added focused section gates plus broader regression coverage using real non-null Claude Code 2.1.177 and OpenCode 1.14.25 profiles.

## Task Commits

Each task was committed atomically:

1. **Define the closed provider-neutral auth, billing, and accepted-identity contract** — `6cf12e5c` (feat)
2. **Persist and hydrate the exact five-field identity through controller and event store** — `8fb813a5` (feat)

## Files Created/Modified

- `extension/utils/delegation-providers.js` — Exposes the closed auth/billing vocabularies, metadata-owned mapping, resolver, and exact accepted-identity validator.
- `extension/utils/delegation-controller.js` — Requires accepted identity at start and preserves it through snapshots, streamed entries, cleanup, terminal settlement, and hydration.
- `extension/utils/delegation-event-store.js` — Stores accepted identity in every envelope and rejects drift, legacy records, hostile shapes, and non-null USD.
- `tests/provider-parity.test.js` — Pins exact vocabularies, current-provider mappings, metadata byte parity, hostile records, and absence of Codex production exposure.
- `tests/delegation-controller.test.js` — Covers immutable acceptance, mutation isolation, drift rejection, real profiles, hydration, terminal behavior, and the existing 41-case lifecycle suite.
- `tests/delegation-event-store.test.js` — Covers durable round trips, hostile/legacy records, identity mismatch, USD rejection, sequence/terminal invariants, and the existing 34-case store suite.

## Decisions Made

- Kept `snapshot.provider` as a derived two-field compatibility view so existing consumers retain their shape while `snapshot.acceptedIdentity` becomes the only complete authority.
- Stored accepted identity once on the ledger envelope. Init client/profile and result billing are checked against it, so later events cannot relabel, reprofile, or rebucket a run.
- Failed closed on old envelopes without accepted identity. Hydration does not infer missing auth or billing from current metadata or previously projected entries.
- Allowed events to omit identity because the controller owns it; an event may repeat only the exact accepted identity. Legacy `client`, `profileVersion`, `authState`, `billingKind`, and `usd` context fields are rejected.

## Verification

- `node tests/provider-parity.test.js --section accepted-identity-foundation` — **27 passed, 0 failed**.
- `node tests/delegation-controller.test.js --section accepted-identity-foundation` — **2 passed, 0 failed**.
- `node tests/delegation-event-store.test.js --section accepted-identity-foundation` — **3 passed, 0 failed**.
- `node tests/delegation-controller.test.js` — **41 passed, 0 failed**.
- Preservation-wrapped `node tests/delegation-event-store.test.js` — **34 passed, 0 failed** with `[mcp-build-preserver] PASS`.
- Production-source scan found no Codex symbol in the controller or event store; JavaScript syntax and scoped whitespace checks passed.
- The preservation wrapper restored the pre-existing `mcp/build/index.js` modification byte-for-byte (`6a492a2e...` before and after).

## Deviations from Plan

None - the plan was executed within its six declared production/test paths. Existing broad controller/store fixtures were migrated to the new mandatory identity contract so their sequence, terminal, quota, and recovery regressions remained green.

## Issues Encountered

- The direct full event-store suite initially lacked its generated OpenCode parser module. Running it through the repository's required MCP build-preservation wrapper supplied the module, passed all 34 cases, and restored the user's dirty generated output exactly.

## User Setup Required

None - no dependency, credential, external service, or local configuration was added.

## Next Phase Readiness

- Plans 65-02 and 65-03 can bind the same exact identity through preflight, consent, background dispatch, daemon detection, and immediate pre-spawn revalidation.
- Later Codex promotion can add legitimate ChatGPT/API-key mappings without changing controller or ledger authority semantics.
- No Plan 01 blocker remains; Codex is still absent from the production roster.

## Self-Check: PASSED

- Both task commits exist and include only their declared files.
- All task acceptance commands and broad controller/store regressions pass.
- Accepted identities use real non-null profiles for both currently shipped adapters and remain frozen after caller mutation and hydration.
- The original planning deletions, shared `STATE.md` edit, MCP build edit, and showcase artifacts remain untouched and unstaged.

---
*Phase: 65-codex-adapter*
*Completed: 2026-07-22*
