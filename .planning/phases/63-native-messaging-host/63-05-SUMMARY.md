---
phase: 63-native-messaging-host
plan: "05"
subsystem: native-host-installer
tags: [native-messaging, chrome, registry, offline, atomic, ownership, tdd]

requires:
  - phase: 63-native-messaging-host
    provides: Stable owned runtime layout, bundled production closure, and workspace-preserving build guard from Plan 01
  - phase: 63-native-messaging-host
    provides: One-shot native protocol and production wake-only executable from Plans 03-04
provides:
  - Pure exact manifest, marker, filesystem, and Windows registry registration facts
  - Exact-package offline runtime publication with tokened atomic staging and restrictive ownership
  - Serialized exact-owned install and uninstall transactions across macOS, Linux, and Windows
affects: [63-06, 63-07, native-host-cli, doctor]

tech-stack:
  added: []
  patterns:
    - Exact-owned state classification before every persistent mutation
    - Tokened runtime stage with registration-last publication
    - Registration-first exact-enumerated uninstall

key-files:
  created:
    - mcp/src/native-host-registration.ts
    - mcp/src/native-host-install/types.ts
    - mcp/src/native-host-install/platform.ts
    - mcp/src/native-host-install/runtime.ts
    - mcp/src/native-host-install/index.ts
    - tests/mcp-native-host-install.test.js
  modified: []

key-decisions:
  - "Windows treats HKCU user/32 as the sole canonical mutation view and any user/64 value as a non-mutable shadow mismatch."
  - "Runtime publication accepts only the exact current package, lock-bound bundled production closure, verified tarball, empty-cache offline install, and platform artifact; it has no online or source-tree fallback."
  - "Only both-absent and both-exact-current states are installable/idempotent; split, older, foreign, symlinked, invalid, unavailable, or shadowed state refuses without mutation."
  - "Uninstall removes registration first and only then an internally exact marker-proved runtime, including an intact older owned version."

patterns-established:
  - "Publication barrier: exact package -> tokened stage -> offline materialization -> complete revalidation -> fsync/rename -> boundary recheck -> registration last."
  - "Removal barrier: full exact registration/runtime proof -> canonical registration first -> exact enumerated runtime only."
  - "Rollback barrier: reread registration and remove it only if it is still the full canonical fact this transaction published."

requirements-completed: [NATIVE-01, NATIVE-04]

duration: 36 min
completed: 2026-07-17
---

# Phase 63 Plan 05: Exact-Owned Native Runtime Install and Uninstall Summary

**The native-host core can now materialize a verified package-owned runtime entirely offline, publish only the requirement-defined Chrome user registration after that runtime is durable, and uninstall only an exact marker-proved FSB installation without touching foreign or adjacent state.**

## Performance

- **Duration:** 36 min
- **Started:** 2026-07-17T05:27:21Z
- **Completed:** 2026-07-17T06:03:53Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added pure ordinary-own-data validators for the exact five-key Chrome native-messaging manifest, the closed owner marker, bounded absolute launch paths, one validated Chrome extension origin, and content-free registration facts.
- Defined injectable macOS, Linux, and Windows platform seams. macOS and Linux use only the required Chrome user-scope manifest, while Windows reads HKCU user/32 then user/64, mutates user/32 only, and fails closed on any user/64 shadow.
- Implemented exact-package runtime materialization through absolute Node and validated npm CLI commands with `shell:false`, bounded non-forwarded output, a new empty offline cache, poisoned registry/proxy routes, zero network requests, no lifecycle scripts, and no online fallback.
- Bound publication to package metadata, exact direct pins, canonical bundle roster, lock-derived runtime-integrity receipt, complete production closure, tarball SHA-512, installed build entry, platform launcher/config, and PE/artifact checksums before fsync and atomic rename.
- Added serialized install/uninstall transactions: both-absent publishes runtime then registration, both-exact-current is zero-write idempotent, all split/foreign/invalid/shadowed states refuse, and exact uninstall removes registration first before the enumerated owned runtime.
- Preserved safe removal of internally consistent older owned runtimes while refusing implicit repair or upgrade, broad Chrome-directory/registry deletion, adjacent host deletion, symlinks, extra Windows values/subkeys, and changed registration during rollback.

## Task Commits

All three TDD tasks preserved separate RED and GREEN evidence:

1. **Task 63-05-01 RED: Registration ownership matrix** — `d0f2d5d0` (test)
2. **Task 63-05-01 GREEN: Exact registration facts and platform contracts** — `3429932c` (feat)
3. **Task 63-05-02 RED: Runtime publication matrix** — `726a2a9c` (test)
4. **Task 63-05-02 GREEN: Exact offline runtime publication** — `676f4b04` (feat)
5. **Task 63-05-03 RED: Install ownership transactions** — `91bc3216` (test)
6. **Task 63-05-03 GREEN: Closed install and uninstall transactions** — `4461d5e8` (feat)

## Files Created/Modified

- `mcp/src/native-host-registration.ts` — Parses and classifies exact manifests, markers, filesystem registration, and typed Windows view facts without mutation authority.
- `mcp/src/native-host-install/types.ts` — Defines closed state/result, runtime, platform, filesystem, process, and registry contracts used by the transaction.
- `mcp/src/native-host-install/platform.ts` — Resolves the three supported user-scope layouts and enforces typed HKCU user/32 canonical versus user/64 shadow behavior.
- `mcp/src/native-host-install/runtime.ts` — Verifies the exact package/receipt/closure, runs bounded offline pack/install recipes, selects the fixed platform launcher, and atomically publishes or rolls back a tokened stage.
- `mcp/src/native-host-install/index.ts` — Serializes each stable-root transaction and composes exact classification, registration-last install, safe rollback, and registration-first uninstall.
- `tests/mcp-native-host-install.test.js` — Exercises 577 assertions across platform paths/views, schema rejection, offline publication, ownership, fault injection, rollback, idempotence, older-version removal, and adjacent preservation.

## Decisions Made

- Restricted discovery and mutation to the Chrome user location named by the requirement. Chrome profiles, other browsers, HKLM, system scope, parent registration roots, and arbitrary paths are outside authority.
- Modeled Windows registry access as explicit structured `user/32` and `user/64` operations instead of localized shell parsing. The 32-bit default `REG_SZ` is canonical; any 64-bit value is a shadow mismatch and is never deleted.
- Required the invoking package to match the exact FSB name/version, direct dependency pins, canonical bundles, lock-derived receipt, and complete production closure both before and after offline installation.
- Kept runtime publication independent from registration. It can return only after the stage is fully validated and renamed; the installer then rechecks boundaries immediately before its final registration write.
- Made current exact installation idempotent but rejected implicit upgrades and split repairs. An exact older installation is deliberately removable because ownership consistency, not the currently invoking version, determines uninstall authority.
- On registration-write failure, reread and delete the registration only when it still validates as the full canonical fact published by this transaction; preserve changed or foreign state and bound runtime cleanup to the exact new runtime.

## TDD Evidence

- **Task 1 RED:** the guarded `platform-and-registration` section failed with `ERR_MODULE_NOT_FOUND` because the registration implementation did not exist.
- **Task 1 GREEN:** 122 registration/platform assertions passed with exact three-platform paths, view order, own-data schema, bounded path, and read-only classification coverage.
- **Task 2 RED:** the guarded `runtime-transaction` section failed because the runtime publisher module did not exist.
- **Task 2 GREEN:** 262 runtime assertions passed with exact package/closure/receipt, empty-cache offline command, zero-network, platform artifact, atomic mode, and failure cleanup coverage.
- **Task 3 RED:** the complete suite failed because the install transaction module did not exist.
- **Task 3 GREEN:** 193 transaction assertions passed; the final combined suite passed all 577 assertions plus the real clean-cache offline packaging proof.

## Security and Privacy

- T63-06 is mitigated by an exact absolute package cwd, constant dot pack target, bounded JSON receipt, verified tarball SHA-512, complete bundle/lock production closure, fresh empty cache, offline-only install, poisoned network routes, disabled scripts, and complete post-install revalidation.
- T63-07 is avoided by selecting only the version/checksum-bound x64 or arm64 Windows PE and bounded sibling config. No batch file, command shell, PowerShell, SEA, registry-selected command, or historical relay exists.
- T63-08 is mitigated by exact own-data schemas, `lstat`/realpath and symlink refusal, tokened restrictive staging, fsync/atomic rename, registration-last install, registration-first uninstall, typed HKCU views, shadow refusal, boundary rechecks, and exact enumeration only.
- Process output, raw errors, local paths, registry contents, package-manager diagnostics, environment, tokens, and marker data never enter public result reasons; outcomes use stable content-free facts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Correctness] Corrected trace parsing for typed registry view assertions.**
- **Found during:** Task 1 GREEN.
- **Issue:** The harness combined colon-delimited registry fields incorrectly for traces such as `registry:read:user/32:key`, so the test read the operation rather than the explicit view.
- **Fix:** Parsed the view from the exact third field.
- **Files modified:** `tests/mcp-native-host-install.test.js`.
- **Verification:** The guarded platform/registration section passed all 122 assertions.
- **Committed in:** `3429932c`.

**2. [Rule 1 - Correctness] Preserved injected registry map identity in the fake Windows platform.**
- **Found during:** Task 3 GREEN.
- **Issue:** The harness copied caller-owned maps, so canonical runtime cleanup was not visible to subsequent platform reads and repeat uninstall incorrectly classified an exact absent state as mismatched.
- **Fix:** Reused injected `Map` instances while retaining ordinary input normalization for non-Map fixtures.
- **Files modified:** `tests/mcp-native-host-install.test.js`.
- **Verification:** Current/older exact removal, repeat uninstall, and Windows empty/nonempty subkey traces pass in the 577-assertion suite.
- **Committed in:** `4461d5e8`.

**3. [Rule 1 - Security] Revalidated registration before failed-publication rollback.**
- **Found during:** Task 3 self-review.
- **Issue:** A registration could change or become foreign between publication failure and cleanup; blindly deleting the canonical location would exceed exact ownership.
- **Fix:** Reread and validate the full exact registration before canonical cleanup, otherwise preserve it; runtime rollback remains bounded to the exact new runtime.
- **Files modified:** `mcp/src/native-host-install/index.ts`, `tests/mcp-native-host-install.test.js`.
- **Verification:** Registration-change and rollback fault-injection cases pass with adjacent/foreign state preserved.
- **Committed in:** `4461d5e8`.

---

**Total deviations:** 3 auto-fixed (2 correctness, 1 security).
**Impact on plan:** The fixes corrected deterministic evidence and tightened exact-owned rollback; no CLI, doctor, extension, or live-UAT scope was added.

## Issues Encountered

- The only implementation-cycle failures beyond intentional RED states were harness-model issues described above; neither required widening production authority.
- The existing `.planning/codebase/STRUCTURE.md` predates the MCP/native-host architecture and describes a different repository layout, so it was not partially amended with a misleading isolated directory entry.

## Known Pending Evidence

- Real POSIX ownership/modes and actual installed launcher behavior after invoking source/cache deletion remain `human_needed`.
- Genuine Windows HKCU/WOW64 view behavior, PE/bootstrap execution, and Chrome lookup order remain `human_needed`.
- Chrome discovery plus installed CLI/native-host execution remain `human_needed`.
- Per user direction, all of these join the single milestone-end UAT sweep; no browser, native host, platform installer, CLI, or human UAT was invoked or marked passed.

## User Setup Required

None during autonomous implementation.

## Verification

- Final guarded command: `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-native-host-install.test.js"],["node","tests/mcp-native-host-packaging.test.js","--section","runtime-layout"]]'` — PASS; install suite reports 577 assertions and packaging proves real clean-cache offline materialization.
- MCP TypeScript build and compiled checks ran only through `scripts/run-mcp-build-preserving-workspace.mjs`, including the workspace-identity restoration check.
- `git diff --check c1b9e4f5..HEAD` and the scoped authority scan are clean.
- Protected SHA-256 values remain exact: `mcp/build/index.js` `6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4`; showcase `664347e0e6a30c276bdbdfea8bb2bfdf1242bd7d61fb6493de870fccd4ddd38e`, `c69ed23d415f8f9f097ec386e789372a3a8a71b011b4d4420bf09ee949587e76`, `826aa8f8b2bc828c423572a6b9697d0666a94a830b7aebbdf1812501e88c3bea`; Phase 62 UAT `b6895278f76c6c280e9bf727b7739cb3ad19dd5de91eef4c614d2c6d5acad00f`; agent history `93904eeba230e6542812f69892c02e7963317f7a6921fbaad76ab041589e0a58` and clean.

## Next Phase Readiness

- Plan 63-06 can expose explicit CLI install/uninstall routes over the closed typed API without giving the existing general installer implicit native-host authority.
- Plan 63-07 can reuse the pure registration facts for bounded read-only diagnostics and report manifest path, exactness, origin mismatch, runtime reachability, and Windows shadow state without mutation.
- No autonomous blocker remains; all genuine platform/browser evidence stays deferred to the milestone-end UAT sweep.

## Self-Check: PASSED

- All six Plan 05 implementation/test artifacts exist.
- Commits `d0f2d5d0`, `3429932c`, `726a2a9c`, `676f4b04`, `91bc3216`, and `4461d5e8` exist in RED/GREEN order.
- The final guarded 577-assertion transaction suite, real offline package proof, TypeScript build, and workspace-preservation matrix pass.
- Protected build, showcase, Phase 62 UAT, config/archive dirt, and agent-history state remain untouched.

---
*Phase: 63-native-messaging-host*
*Completed: 2026-07-17*
