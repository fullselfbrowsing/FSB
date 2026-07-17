---
phase: 63-native-messaging-host
plan: "06"
subsystem: native-host-cli
tags: [native-messaging, cli, routing, validation, bounded-output, tdd]

requires:
  - phase: 63-native-messaging-host
    provides: Exact-owned injected native install/uninstall transactions from Plan 05
provides:
  - Closed explicit native-host install/uninstall CLI routing before every legacy client expansion
  - Stable bounded help, success, idempotence, refusal, and uninstall output contracts
  - Injected CLI operation seam with content-free unavailable fallback when production dependencies are unresolved
affects: [63-07, native-host-doctor, native-host-cli, installer-regression]

tech-stack:
  added: []
  patterns:
    - Presence-routed exact flag validation before broad legacy behavior
    - Ordinary-own-data reconstruction before terminal projection
    - Content-free unavailable fallback instead of top-level raw fatal serialization

key-files:
  created: []
  modified:
    - mcp/src/install.ts
    - mcp/src/index.ts
    - tests/mcp-install-platforms.test.js
    - tests/mcp-native-host-install.test.js

key-decisions:
  - "Native-host routing is selected by presence of the explicit target, then validates the complete flag record before any list/all/client/Claude behavior can run."
  - "CLI receipts are reconstructed from exact ordinary own-data fields; unknown reasons, malformed locations, prototype-backed values, and thrown adapter errors collapse to bounded unavailable output."
  - "Plan 06 exposes an injected transaction-operation seam but does not invent the missing production filesystem/process/registry composer or persistent receipt layer; unresolved production composition fails closed as unavailable."

requirements-completed: [NATIVE-01, NATIVE-04]

duration: 24 min
completed: 2026-07-17
---

# Phase 63 Plan 06: Explicit Native-Host CLI Routing and Output Summary

**The CLI now reserves two exact native-host targets, rejects every mixed or widened invocation before mutation, and projects only bounded factual receipts while leaving all 21 legacy MCP-client paths unchanged.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-07-17T06:12:48Z
- **Completed:** 2026-07-17T06:36:38Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added an early native branch at the top of both installer entrypoints, ahead of `--list`, `--all`, `PLATFORMS`, instruction-only targets, config writes, and Claude CLI delegation.
- Accepted only `install --native-host [--extension-id <id>]` and `uninstall --native-host`; malformed values, arrays, duplicate flags, extra positional values, unknown short/long flags, and every native/client combination now fail with stable usage and zero native calls.
- Kept the client platform registry at exactly 21 entries and preserved ordinary install/uninstall help, dry-run output, config round trips, client counts, and broad `--all` behavior.
- Added exact help lines for native install/uninstall without changing the existing client help lines.
- Added factual installed, already-installed, removed, and not-installed output with bounded expected location, the sole validated origin for install success, and explicit removal counts for uninstall.
- Added the required refusal copy and doctor guidance with exit code 1 while preventing raw errors, receipt extras, prototype data, manifest/registry fields, environment/user sentinels, child output, secrets, and task data from reaching stdout or stderr.
- Preserved `serve`, `doctor`, and no-argument stdio routing outside installer authority.

## Task Commits

Both planned tasks preserve separate RED and GREEN evidence; the receipt hardening found during self-review has its own RED/GREEN pair:

1. **Task 63-06-01 RED: Native routing and isolation matrix** — `94ded1ac` (test)
2. **Task 63-06-01 GREEN: Early exact native routing** — `9e8e4461` (feat)
3. **Task 63-06-02 RED: Help/output/refusal contracts** — `789b19d8` (test)
4. **Task 63-06-02 GREEN: Bounded help and receipts** — `38e90041` (feat)
5. **Self-review RED: Inherited receipt rejection** — `eeb07a52` (test)
6. **Self-review GREEN: Exact ordinary-own receipt reconstruction** — `04fb1713` (fix)

## Files Created/Modified

- `mcp/src/install.ts` — Adds the exact native target branch, injected core-operation seam, closed flag validation, unavailable fallback, and bounded receipt projection.
- `mcp/src/index.ts` — Preserves duplicate/positional/unknown-short evidence only for native syntax, fixes full inline-value parsing, and adds the two native help lines.
- `tests/mcp-install-platforms.test.js` — Pins legacy 21-platform compatibility, help parity, native exclusion from `--all`, subprocess rejection, unavailable fallback, and zero filesystem mutation.
- `tests/mcp-native-host-install.test.js` — Adds `cli-routing` and `cli-output` sections with call counters, complete client/mixed matrices, exact output snapshots, sentinel leakage checks, and router source contracts.

## Decisions Made

- Selected the native branch by own-key presence rather than truthiness. Values such as `false`, strings, arrays, or a duplicate-overwritten target therefore cannot fall back into legacy behavior.
- Validated the complete ordinary own-data flag record. Only the exact target plus one optional validated 32-character lowercase `a`-through-`p` extension id reaches the injected install operation.
- Kept native host outside `PLATFORMS`, so list/all expansion, totals, detection, instructions-only output, and Claude Code delegation remain byte/behavior compatible.
- Reconstructed terminal receipts from exactly five own data properties (`status`, `reason`, `location`, `origin`, `packageVersion`) instead of spreading or serializing operation results.
- Allowed only a closed refusal-reason vocabulary. Any unknown reason or operation exception becomes `unavailable`; locations are byte-bounded and reject all terminal control characters; install origins must be one exact validated Chrome-extension origin.
- Retained the one existing doctor command as the only repair guidance surface. Native failures do not prompt, repair, wake, pair, or invoke the top-level raw fatal formatter.

## TDD Evidence

- **Task 1 RED:** the platform subprocess suite reported four native-isolation failures because legacy logic treated `--native-host` as an unknown client flag; no native call seam existed.
- **Task 1 GREEN:** the guarded platform suite passed 49 assertions and the new `cli-routing` section passed 152 assertions across exact calls, invalid values, all 21 client flags, mixed combinations, list/all/ordinary behavior, and platform-count parity.
- **Task 2 RED:** the platform suite reported 15 failures covering missing help, silent exit-0 unavailable behavior, duplicate flags, extra positionals, and unknown short flags.
- **Task 2 GREEN:** the platform suite passed 69 assertions and `cli-output` passed 51 assertions for exact success/idempotence/removal/refusal output, exit codes, sentinel suppression, exception collapse, and non-installer router ownership.
- **Receipt hardening RED/GREEN:** an inherited prototype receipt initially produced optimistic success; the dedicated RED failed at that assertion, then exact own-data normalization brought the output section to 54 passing assertions.
- **Final combined regression:** guarded platform tests passed 69 assertions and the full native installer suite passed all 783 assertions.

## Security and Privacy

- T63-08 is mitigated by routing on explicit target presence and validating the entire record before any injected operation, legacy expansion, client config write, or CLI delegation.
- T63-09 is mitigated by reconstructing exact receipt fields, allowlisting reasons, validating origins, bounding locations, rejecting terminal controls, catching operation exceptions, and never forwarding arbitrary objects or raw errors.
- T63-06/T63-07 are not widened by CLI input: callers cannot choose a launcher, runtime path, platform, registry view, process command, cache, or artifact architecture through these commands.
- Successful output names only host state, expected location, exact origin, or removal count. It makes no pairing, provider, agent-start, or delegation claim.

## Deviations from Plan

### Scope Boundary

**1. [Rule 4 - Architectural Boundary] Kept production adapter composition outside Plan 06.**
- **Found during:** Task 1 pre-implementation inspection.
- **Issue:** Plan 05 exposes dependency-injected transaction APIs, but the repository has no production filesystem/process/registry dependency composer and no persisted runtime receipt that a later CLI process could resolve safely.
- **Resolution:** Added the planned injected CLI operation seam and a bounded factual `unavailable` fallback. Did not invent a large cross-platform composer, registry implementation, or persistence design in this router plan.
- **Impact:** Deterministic route/output contracts are complete, but a standalone production invocation does not claim live install operability; without resolved dependencies it exits 1 with `unavailable` and doctor guidance.
- **Direction:** Parent/orchestrator explicitly confirmed this boundary; the limitation remains visible for later phase review and milestone-end evidence.

### Auto-fixed Issues

**2. [Rule 1 - Correctness] Preserved complete inline flag values.**
- **Found during:** Task 2 self-review.
- **Issue:** `split('=', 2)` discarded text after a second equals sign, so a valid extension-id prefix followed by `=extra` could be misread as the valid id.
- **Fix:** Split at the first separator index and retain the entire remaining value; the closed id validator now rejects the widened value.
- **Verification:** The subprocess matrix proves `--extension-id=<valid>=extra` exits 1 with stable usage.
- **Committed in:** `38e90041`.

**3. [Rule 1 - Security] Rejected prototype-backed and non-exact receipts.**
- **Found during:** Task 2 post-GREEN self-review.
- **Issue:** Direct property access could accept inherited receipt fields and print an attacker-controlled but syntactically valid location as optimistic success.
- **Fix:** Reconstruct only an exact five-key ordinary object whose enumerable fields are own data descriptors; all other shapes collapse to `unavailable` without reading inherited values.
- **Verification:** Dedicated RED `eeb07a52` failed on the inherited receipt, and GREEN `04fb1713` passes with the sensitive prototype value absent from output.

---

**Total deviations:** 1 explicit scope boundary, 2 auto-fixed correctness/security issues.
**Impact on plan:** Native CLI syntax, isolation, and bounded output are stronger; no legacy behavior or native mutation authority was widened. The missing production dependency composer remains deliberately unresolved and unclaimed.

## Issues Encountered

- Plan 05's closed transaction core has only injected low-level dependencies. Implementing real filesystem materialization, runtime receipt persistence/reconstruction, and Windows registry access would have been a materially different architecture task, so Plan 06 fails closed instead of presenting a partial unsafe implementation.
- No live CLI, native host, browser, registry, daemon, or human UAT was run. The subprocess tests use only the deterministic unavailable path or injected in-memory operations.

## Known Pending Evidence

- Genuine installed-host CLI behavior on macOS, Linux, and Windows remains `human_needed` and deferred to the milestone-end sweep.
- Real Windows HKCU/WOW64 registration, PE selection/launch, Chrome discovery, exact POSIX modes, cache/source deletion survival, daemon wake/attach, and browser integration remain pending.
- Production dependency composition and receipt persistence must be resolved before any later artifact claims standalone native install/uninstall operability; Plan 06 itself makes no such claim.

## User Setup Required

None during autonomous implementation.

## Verification

- Task 63-06-01 command — PASS: `tests/mcp-install-platforms.test.js` plus `cli-routing` through the workspace-preserving MCP build wrapper.
- Task 63-06-02 command — PASS: `tests/mcp-install-platforms.test.js` plus `cli-output` through the workspace-preserving MCP build wrapper.
- Final combined guarded run — PASS: 69 platform assertions and 783 complete native-installer assertions.
- Source and compiled native-host boundary checks passed inside every wrapper build.
- `git diff --check 44057f50..HEAD` and the scoped placeholder scan are clean.
- All live/native/browser/human UAT remains pending and unclaimed per user direction.

## Next Phase Readiness

- Plan 63-07 can consume the explicit CLI states and add its one read-only native-host diagnostic snapshot/doctor projection without giving doctor mutation authority.
- The production composition limitation is now an explicit review item rather than a hidden optimistic path.

## Self-Check: PASSED

- Six implementation/test commits are present.
- Four planned source/test files exist and are committed.
- Summary truthfully distinguishes deterministic contract evidence from deferred live operability.
