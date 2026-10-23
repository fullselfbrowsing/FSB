---
phase: 63-native-messaging-host
plan: "07"
subsystem: native-host-diagnostics
tags: [native-messaging, doctor, diagnostics, projection, security, tdd]

requires:
  - phase: 63-native-messaging-host
    provides: Exact-owned native registration/runtime facts and explicit CLI boundaries from Plans 05-06
provides:
  - One immutable bounded nativeHost snapshot collected through one read-only injected inspector
  - Closed deterministic reason precedence and an exact five-enum browser-safe projector
  - Exact ordered Native messaging host doctor text without changing historical layer or exit semantics
affects: [63-08, 63-10, native-host-doctor, browser-safe-status]

tech-stack:
  added: []
  patterns:
    - Derive closed reasons from normalized facts instead of accepting caller-provided reason text
    - Reconstruct safe projections field-by-field without spreading source objects
    - Keep optional-component diagnostics observational and outside global health classification

key-files:
  created: []
  modified:
    - mcp/src/diagnostics.ts
    - mcp/src/index.ts
    - tests/mcp-diagnostics-status.test.js
    - tests/mcp-version-parity.test.js

key-decisions:
  - "The injected inspector returns bounded registration, shadow, allowlist, runtime, launcher, and daemon facts; diagnostics derives the final reason in the frozen precedence order and never accepts caller reason text."
  - "The browser projector reconstructs only installState, registration, allowlist, launcher, and daemon; expectedLocation and reason remain local-only."
  - "The unresolved production OS dependency composer remains explicit: without an injected read-only inspector, doctor reports inspection_unavailable rather than claiming live native-host operability."

requirements-completed: [NATIVE-04]

duration: 14 min
completed: 2026-07-17
---

# Phase 63 Plan 07: Bounded Native-Host Doctor Snapshot Summary

**Doctor now consumes one immutable native-host snapshot, renders its exact local seven-label section, and exposes only a reconstructive five-enum browser projection while preserving historical health semantics.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-17T06:43:23Z
- **Completed:** 2026-07-17T06:57:17Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added the closed `NativeHostDoctor` model with exactly seven ordered keys and all 15 approved reason outcomes.
- Added one injected `inspectNativeHost` call before bridge probing; ordinary own-data normalization bounds the local expected location, rejects prototype/accessor/malformed evidence, and derives reasons using the frozen platform-to-daemon precedence.
- Kept raw manifest, registry, launcher-path, exception, username, environment, secret, session, child-output, and task fields outside local JSON and text.
- Added `projectNativeHostBrowserStatus`, which returns one frozen object with exactly `installState`, `registration`, `allowlist`, `launcher`, and `daemon` and cannot carry location, reason, or registry detail.
- Added the exact `Native messaging host:` block after `Bridge auth:` and before `Install paths:`, with closed title-case mappings for all approved display enums.
- Preserved one `doctor` collection site, the existing JSON/text snapshot sharing, and the historical healthy/unhealthy exit decision; optional host absence never creates a probe note or changes `classifyDoctorLayer`.

## Task Commits

Each planned task preserves separate RED and GREEN evidence:

1. **Task 63-07-01 RED: Native snapshot/projector contract** — `948ee41e` (test)
2. **Task 63-07-01 GREEN: Bounded immutable native diagnostics** — `a99826a2` (feat)
3. **Task 63-07-02 RED: Ordered doctor projection contract** — `77c816d2` (test)
4. **Task 63-07-02 GREEN: Exact native doctor section** — `1d3dec3d` (feat)

## Files Created/Modified

- `mcp/src/diagnostics.ts` — Adds the closed local/browser types, one-call inspector seam, strict normalization, reason precedence, immutable snapshot, and explicit five-key browser projector.
- `mcp/src/index.ts` — Adds closed title-case maps and the exact ordered native-host doctor section.
- `tests/mcp-diagnostics-status.test.js` — Covers every reason and precedence boundary, exact keys/order, malformed facts, mutation spies, sentinel non-disclosure, label copy, and unchanged optional-component health semantics.
- `tests/mcp-version-parity.test.js` — Pins collection count/order, formatter section/labels, read-only doctor authority, safe projector source boundary, and classifier independence.

## Decisions Made

- Used one high-level injected read-only inspection record rather than importing installer or mutation dependencies into doctor. The record separates canonical registration, Windows shadow state, allowlist, runtime, launcher, and bounded daemon classification.
- Derived every stable reason inside diagnostics. Unknown enum values, overlong/control-bearing locations, prototype/accessor-bearing objects, contradictions, exceptions, and unavailable facts cannot inject caller text.
- Treated complete registration/runtime/launcher absence as `not_installed`; partial or malformed local state is `invalid`; daemon identity/protocol/offline facts remain observational and do not rewrite a valid local install state.
- Returned `inspection_unavailable` from the default non-composed production seam. This preserves Plan 06's explicit boundary instead of fabricating filesystem, registry, process, or persisted-receipt composition.
- Kept the browser surface reconstructive. It validates and emits five closed enums only, so even a source object with additional data cannot transfer local repair detail.

## TDD Evidence

- **Task 1 RED:** 55 assertions failed on the absent inspector call, seven-key snapshot, reason precedence, and five-key projector while historical doctor-layer and zero-mutation assertions remained green.
- **Task 1 GREEN:** the guarded focused run passed 196 assertions, including one case for every approved reason, inspector-before-bridge order, one-call count, immutable outputs, malformed-input collapse, and sentinel omission.
- **Task 2 RED:** the diagnostics suite failed 32 exact-copy/order/mapping assertions and the parity suite failed seven source-contract assertions because the native section did not yet exist.
- **Task 2 GREEN:** the guarded combined run passed 229 diagnostics assertions and 79 version-parity assertions.

## Security and Privacy

- T63-03 remains closed at the diagnostic boundary: daemon identity/protocol mismatches project only `daemon: unavailable` plus the stable local reason and never become global readiness authority.
- T63-09 is mitigated through ordinary own-data normalization, byte/control bounds, closed enums, internally derived reasons, immutable output, and field-by-field browser reconstruction.
- Mutation-capable install, uninstall, wake, start, repair, pair, secret-rotation, and spawn spies all remained at zero during collection.
- Browser output cannot contain the expected local location, stable local reason, raw manifest/registry data, launcher path, exception, username, environment, secret, session, child output, or task content.

## Deviations from Plan

### Inherited Scope Boundary

**1. Preserved the unresolved production inspector-composition boundary.**
- **Context:** Plan 06 established that the repository has no safe production filesystem/process/registry composer or persisted runtime receipt layer.
- **Resolution:** Implemented the planned injected read-only inspection seam and deterministic projections, but left the default content-free as `inspection_unavailable` rather than inventing production OS composition in doctor.
- **Impact:** Snapshot, precedence, disclosure, formatting, and classification contracts are complete and tested; genuine standalone OS facts are not claimed until the missing production composer exists and live evidence is collected.

No other implementation deviations occurred.

## Issues Encountered

- The shared worktree began with 402 unrelated planning-file deletions, one unrelated config edit, and four protected generated/showcase modifications. Exact staging and the workspace-preserving MCP build wrapper kept all unrelated bytes and the index unchanged.
- No live CLI, browser, daemon, native host, registry, filesystem ownership, or human UAT was run.

## Known Pending Evidence

- Genuine macOS/Linux/Windows expected locations, POSIX ownership, Windows HKCU/WOW64 facts, launcher reachability, daemon identity/protocol state, Chrome discovery, and installed doctor output remain `human_needed` for the milestone-end sweep.
- Production read-only inspector composition remains unresolved alongside Plan 06's install/uninstall dependency-composition boundary; the default output truthfully reports `inspection_unavailable`.

## User Setup Required

None during autonomous implementation.

## Verification

- Task 63-07-01 guarded command — PASS: `tests/mcp-diagnostics-status.test.js --section native-host-snapshot` (196 assertions).
- Task 63-07-02 guarded command — PASS: complete diagnostics and version-parity suites (229 + 79 assertions).
- TypeScript build plus source/compiled native-host boundary gates passed inside every preserving wrapper run.
- `git diff --check c1938e26..HEAD` is clean.
- Protected MCP build, showcase artifacts, agent history, Git index, and unrelated dirty-file identities remained unchanged.

## Next Phase Readiness

- Plan 63-08 can add the manifest permission and background-owned native probe/wake controller while consuming only the five-key browser-safe diagnostic projection if needed.
- All genuine OS/browser/native evidence remains pending for the single milestone-end UAT sweep.

## Self-Check: PASSED

- Four RED/GREEN commits are present.
- All four planned source/test files exist and are committed.
- The summary explicitly distinguishes deterministic contract evidence from unresolved production composition and deferred live operability.

## Review Remediation Addendum — 2026-07-18

- Finding `F63-CODE-02` is closed by RED commit `3b65834c` and GREEN commit `7fb88f42`.
- Production doctor, status, and watch now compose the real read-only native-host inspector. It reuses the exact platform registration facts, persisted runtime/owner validation, launcher validation, and exported daemon health classifier, then passes only those raw facts through the existing closed diagnostics normalizer and five-key browser projector.
- Compiled production-composition coverage proves missing (`not_installed`), changed allowlist (`allowlist_mismatch`), corrupt launcher (`runtime_invalid`), daemon-offline, and exact ready-loopback behavior without injecting a synthetic diagnostics inspector. Mutation spies and before/after filesystem snapshots remain unchanged, and the historical doctor health layer is byte-for-byte stable.
- The GREEN gate passed all 96 platform assertions, all 229 diagnostics assertions, all 172 then-current daemon assertions, source and compiled native-boundary verification, and workspace identity restoration.
- The final `node scripts/run-phase63-focused-tests.mjs` matrix passed the 229-assertion diagnostics suite, expanded 209-assertion daemon suite, 96-assertion production platform suite, and 1,014-assertion Phase 61–63 contract gate with complete workspace identity preserved.
- This addendum supersedes the earlier unresolved production-inspector statements. Live installed-host/browser/platform evidence remains `human_needed` and unclaimed.
