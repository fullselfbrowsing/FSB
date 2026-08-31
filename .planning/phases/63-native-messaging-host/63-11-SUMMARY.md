---
phase: 63-native-messaging-host
plan: "11"
subsystem: native-host-review
tags: [native-messaging, code-review, security-review, ui-review, asvs, windows-registry]

requires:
  - phase: 63-native-messaging-host
    provides: Complete Plans 01-10 implementation, focused matrix, validation map, and pending human-UAT ledger
  - phase: 59-reverse-request-channel-security-foundation
    provides: CHAN authentication, redaction, and agent-authority invariants
  - phase: 61-delegation-ux-sw-eviction-persistence
    provides: Existing delegation-card semantics, accessibility contract, and offline fallback authority
provides:
  - Three independent source-only review artifacts bound to one canonical 56-file implementation identity
  - A deterministic per-kind and all-kinds verifier with output, identity, severity, and UAT-honesty negatives
  - Closed dispositions for six HIGH code findings, two HIGH security findings, and one MEDIUM compatibility finding
  - A packaged locale-independent Win32 registry helper with fixed API authority and provenance-bound execution
affects: [63-12, native-host-regression, native-host-release, milestone-end-uat]

tech-stack:
  added: []
  patterns:
    - Bind independent reviews to one canonical patch, manifest, index, and worktree fingerprint
    - Stop on fresh blocking findings, remediate in the owning implementation seam, then rerun the affected review with a fresh frozen identity
    - Keep source-only review evidence mechanically separate from genuine OS, browser, visual, focus, and assistive-technology evidence

key-files:
  created:
    - .planning/phases/63-native-messaging-host/63-REVIEW.md
    - .planning/phases/63-native-messaging-host/63-SECURITY.md
    - .planning/phases/63-native-messaging-host/63-UI-REVIEW.md
    - scripts/verify-phase63-review-artifacts.mjs
    - mcp/native-host/windows/fsb-native-host-registry.c
    - mcp/native-host/windows/fsb-native-host-registry-version.rc.in
    - mcp/src/native-host-registry-helper.ts
    - tests/mcp-native-host-registry-helper.test.js
  modified:
    - mcp/src/native-host-production.ts
    - mcp/src/native-host/daemon.ts
    - mcp/src/native-host-install/platform.ts
    - mcp/src/native-host-install/runtime.ts
    - tests/delegation-phase-contract.test.js
    - .github/workflows/ci.yml
    - .github/workflows/npm-publish.yml

key-decisions:
  - "A review pass is valid only against the exact final 887858-byte, 56-file implementation identity; review artifacts and the verifier are separate infrastructure."
  - "Windows registry authority uses a packaged fixed Win32 API helper, never reg.exe text parsing, inherited SystemRoot, or PATH executable selection."
  - "Resolved historical HIGH findings remain visible in the final artifacts, while any unresolved or fresh HIGH/CRITICAL finding remains a hard stop."
  - "Human UAT remains pending even when source, synthetic, compiled, DOM, and artifact review gates pass."

requirements-completed: [NATIVE-01, NATIVE-02, NATIVE-03, NATIVE-04]

duration: 5h 26m
completed: 2026-07-18
---

# Phase 63 Plan 11: Blocking Code, Security, and UI Review Summary

**Three independent source-only reviews now pass against one immutable implementation identity after every blocking code and security finding was remediated and re-reviewed.**

## Performance

- **Duration:** 5h 26m
- **Started:** 2026-07-18T14:59:25Z
- **Completed:** 2026-07-18T20:25:17Z
- **Tasks:** 3
- **Files modified:** 38

## Accomplishments

- Froze the final implementation at base `27bddf00517738c87fcc6ca4b27940e8121f2124`, end `6d868ee1348219f95fd0cc0e5f5f3f9cf9fc6887`, 56 ordered files, 887858 canonical patch bytes, patch SHA-256 `24072007a6af1754e496804471c3b21e9afd01f20bcdec9bcfaa9c694e5e46d6`, and manifest SHA-256 `5135dbf243f0f123f60217584cd2ae8ab6865c78c85fcdae20464a539b27dcc7`.
- Completed independent code, ASVS L1 security, and six-pillar UI reviews with zero unresolved CRITICAL/HIGH findings. The final artifacts retain six resolved HIGH code findings, one resolved MEDIUM code finding, two resolved HIGH security findings, and no UI finding.
- Replaced locale-sensitive `reg.exe` parsing and inherited executable authority with a separately built, versioned, exact-architecture Win32 registry helper whose key, operations, views, input/output bounds, and mutation authority are fixed.
- Added a deterministic review verifier that rejects stale identity, extra outputs, malformed schema, unknown severity, unresolved HIGH findings, and false live-UAT promotion; all three artifacts also share the exact final identity in all-kinds mode.
- Preserved the unrelated dirty worktree, protected `mcp/build/index.js`, staged state, and raw index through every focused and compiled review gate.

## Task Commits

Each final review gate was committed atomically:

1. **Task 63-11-01: Blocking code and regression review** — initial gate `e1b9631f`, final refreshed gate `5f67a46a`; compatibility correction `6d868ee1`
2. **Task 63-11-02: ASVS L1 native-channel security review** — `7488c392`
3. **Task 63-11-03: Six-pillar UI and accessibility review** — `ff0727eb`

Review-triggered remediation was committed as RED/GREEN pairs:

- `F63-CODE-01`: `fecc98d3` → `c52f8a21` — concrete production install/uninstall composition.
- `F63-CODE-02`: `3b65834c` → `7fb88f42` — concrete read-only production diagnostics composition.
- `F63-CODE-03`: `be068375` → `531b8b4d` — metadata-before-publication wake ownership and exact cleanup.
- `F63-CODE-04`: `512b5e03` → `3d9cdd70` — trusted npm candidate provenance and npm-independent uninstall.
- `F63-CODE-05`: `688846ea` → `566887c7` — explicit user/64 shadow absence at every Windows mutation boundary.
- `F63-CODE-06`: `e91a2d76` → `cf02002a` — OS loopback lease and identity-bound stale-lock recovery.
- `F63-SECURITY-01/02`: `a91f3e29` → `409e638d` — fixed structured registry API and provenance-bound helper execution.

## Files Created/Modified

- `.planning/phases/63-native-messaging-host/63-REVIEW.md` — Final pass-4 code review covering NATIVE-01..04, D63-01..25, implementation seams, and every resolved code finding.
- `.planning/phases/63-native-messaging-host/63-SECURITY.md` — Twelve-threat ASVS L1 audit with all T63-01..12 rows closed and both historical security HIGHs resolved.
- `.planning/phases/63-native-messaging-host/63-UI-REVIEW.md` — Six-pillar, UIAC-01..07, and locked-source-check review with live visual/accessibility evidence still pending.
- `scripts/verify-phase63-review-artifacts.mjs` — Exact input/output/schema/severity/UAT verifier with fixture negatives and canonical implementation identity checks.
- `mcp/native-host/windows/fsb-native-host-registry.c` — Fixed-key, fixed-operation, bounded Win32 Registry API helper.
- `mcp/src/native-host-registry-helper.ts` — Provenance validation, empty-environment `shell:false` execution, and closed structured-response adapter.
- `mcp/src/native-host-production.ts` — Concrete install, uninstall, diagnostics, trusted npm, and packaged registry-helper composition.
- `mcp/src/native-host/daemon.ts` and `mcp/src/native-host/platform.ts` — Staged ownership, OS-backed one-flight lease, identity-bound stale claims, and exact release.
- `mcp/src/native-host-install/platform.ts` and `mcp/src/native-host-install/index.ts` — Explicit user/64 absence proof and repeated Windows publication/removal checks.
- `.github/workflows/ci.yml` and `.github/workflows/npm-publish.yml` — Registry-helper MSVC build, harness, artifact, and publication coverage.
- `tests/delegation-phase-contract.test.js` — Six-root-gate compatibility roster including the registry-helper suite.

## Decisions Made

- Kept review infrastructure outside the implementation manifest. Review text or verifier changes therefore cannot silently change the code identity being approved.
- Required exactly one dedicated reviewer per kind. Metadata/schema corrections went back to the same reviewer and never created a second opinion that could bypass a blocking result.
- Preserved resolved HIGH findings in the final finding tables instead of erasing their history. The verifier accepts only `resolved` HIGH/CRITICAL rows and still rejects `open` or `accepted` blocking rows.
- Removed all `reg.exe`, inherited `SystemRoot`, and `PATH` executable authority rather than attempting to sanitize localized text output. The helper exposes only user/64 read and exact user/32 read/write/delete/empty-key cleanup for the one Chrome host key.
- Kept local MSVC execution unclaimed. Windows compilation and the safe registry harness remain required CI evidence; genuine registry and Chrome behavior remain milestone-end human evidence.

## Security and Evidence Boundary

- Every T63-01..T63-12 threat is closed with exploit path, mitigation, source/test evidence, and residual risk. Applicable ASVS L1 themes V2, V3, V4, V5, V7, V12, V13, and V14 are explicitly covered.
- Native wake remains an availability hint. It cannot create pairing, consent, provider, task, tab, or agent-start authority, and Phase 59 CHAN framing/authentication remains unchanged.
- Registry-helper execution revalidates path, digest, role, PE machine, package version, regular-file status, and reparse provenance immediately before an absolute-path empty-environment spawn.
- The eight real OS, Chrome, visual, keyboard, and screen-reader scenarios in `63-HUMAN-UAT.md` remain unchecked, pending, and human-owned.

## Deviations from Plan

### Review-triggered remediation

The plan's blocking rule operated as designed: each fresh HIGH finding stopped later review gates and returned work to its owning implementation seam. Four remediation waves were necessary before the final serialized code → security → UI pass:

1. Production CLI/doctor composition and wake-lock publication were made concrete and closed.
2. Direct-bin npm provenance, explicit Windows shadow proof, and stale-lock ABA exclusion were hardened.
3. The security review replaced localized registry text parsing and inherited executable selection with the packaged fixed helper.
4. The final focused code gate added the helper suite to the historical Phase 63 root-command roster and corrected the ordered-slot label from five to six gates.

All affected code and security reviews were rerun against a new frozen implementation identity. No unrelated feature scope was added.

## Issues Encountered

- The first review-era clean-checkout contract expected compiled leaves to exist outside the guarded build lifecycle. Commit `fdbebf55` changed that assertion to prove the source-to-build mapping contract without depending on stale generated output.
- The first exact final code gate exposed two historical-root-chain failures because `tests/mcp-native-host-registry-helper.test.js` had been added to the root suite but not `PHASE63_NEW_TEST_COMMANDS`. Commit `6d868ee1` repaired the compatibility model; the direct contract then passed 1016/1016.
- Strict security artifact verification found four presentation/schema omissions (patch-byte token, compatibility-test identity path, `real OS` boundary marker, and case-sensitive authority-trace vocabulary). The same security auditor corrected only its artifact; the substantive verdict and findings never changed.
- The shared worktree retained extensive unrelated planning deletions and generated output. Exact-path staging and preservation wrappers kept those bytes outside every review and commit.

## User Setup Required

None - no external service configuration or live platform operation was performed.

## Verification

- `node scripts/run-phase63-focused-tests.mjs && node scripts/verify-phase63-review-artifacts.mjs --kind code` — PASS, including the 1016/1016 Phase 61-63 compatibility contract and final code artifact.
- `node scripts/verify-phase63-review-artifacts.mjs --kind security && node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/verify-native-host-boundary.mjs"],["node","tests/mcp-native-host-protocol.test.js"],["node","tests/mcp-native-host-install.test.js"]]'` — PASS; source+compiled boundary, protocol, and 854/854 install assertions green with workspace identity restored.
- `node tests/delegation-sidepanel-ui.test.js && node tests/native-host-background-wake.test.js && node scripts/verify-phase63-review-artifacts.mjs --kind ui` — PASS; side-panel contract and 111/111 wake assertions green.
- `node scripts/verify-phase63-review-artifacts.mjs` — PASS for code, security, UI, fixture negatives, shared identity, and the canonical 887858-byte patch.
- Post-gate unrelated worktree SHA-256 remained `b1ccbbcd93a1a121f8d6b77c2c3ca2dda0690e87816a5bae71610c2013426e91`; protected `mcp/build/index.js` remained `6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4`.

## Known Pending Evidence

- All eight scenarios in `63-HUMAN-UAT.md` remain pending for the single user-directed v0.9.91 milestone-end sweep.
- Genuine Windows MSVC helper/bootstrap compilation, safe registry-harness execution, HKCU/WOW64 behavior, and Chrome discovery remain CI or human evidence and are not claimed locally.
- The reviewed focused matrix plus workspace-preserving repository-wide regression remains Plan 63-12 work.

## Next Phase Readiness

- Plan 63-12 can consume the three passing review artifacts and exact final identity, rerun the reviewed focused matrix, then execute the guarded repository-wide regression gate.
- No automated review blocker remains. Plan 12 must still preserve the dirty worktree, generated build graph, raw index, and pending human ledger.

## Self-Check: PASSED

- Exactly one fresh final reviewer per kind produced only its scoped artifact.
- Code, security, and UI artifacts pass individually and together with zero unresolved CRITICAL/HIGH findings.
- Security and UI artifacts were committed alone; the refreshed code artifact and verifier were committed in their exact review-infrastructure scope.
- STATE and ROADMAP advance only to Plan 12; no Plan 12 command or evidence is claimed here.

---
*Phase: 63-native-messaging-host*
*Completed: 2026-07-18*
