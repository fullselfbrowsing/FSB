---
phase: 63-native-messaging-host
plan: "01"
subsystem: native-host-packaging
tags: [native-messaging, windows-pe, npm-bundles, offline-install, github-actions]

requires:
  - phase: 59-reverse-request-channel-security-foundation
    provides: Authenticated reverse-channel gates and closed native authority boundary
  - phase: 60-adapter-contract-claude-code-mvp
    provides: Workspace-preserving generated-build discipline adapted by this plan
provides:
  - Byte-, mode-, type-, symlink-, and raw-index-preserving MCP build wrapper
  - Reviewable C17 Windows x64/arm64 bootstrap source, version resource, build metadata, and executable harness
  - Pure three-platform stable runtime layout, closed ownership marker, fixed protocol constants, and POSIX launcher template
  - Exact-pinned complete bundled production closure with deterministic lock-derived integrity receipt
  - Required Windows PE and macOS/Linux offline-payload CI plus artifact-dependent npm publication
affects: [63-02, 63-03, 63-04, 63-05, 63-06, 63-07, native-host-install, npm-release]

tech-stack:
  added: []
  patterns:
    - Invoke npm through the absolute current Node executable and resolved npm-cli.js, never a shell or command shim
    - Repack from the exact package-owned cwd and install the resulting absolute tarball offline from a new empty cache
    - Bind package lock, runtime receipt, tarball, and both PE artifacts in version-keyed release metadata

key-files:
  created:
    - scripts/run-mcp-build-preserving-workspace.mjs
    - scripts/build-native-host-windows.mjs
    - mcp/native-host/windows/fsb-native-host-bootstrap.c
    - mcp/native-host/windows/fsb-native-host-bootstrap-version.rc.in
    - mcp/native-host/posix/fsb-native-host-launcher.mjs.in
    - mcp/native-host/runtime-integrity.json
    - mcp/src/native-host/constants.ts
    - mcp/src/native-host/runtime-layout.ts
    - tests/mcp-native-host-packaging.test.js
  modified:
    - mcp/package.json
    - mcp/package-lock.json
    - .github/workflows/ci.yml
    - .github/workflows/npm-publish.yml

key-decisions:
  - "Windows registration may target only the version-bound fsb-native-host.exe; batch, command-shell, PowerShell, SEA, and historical relay fallbacks are forbidden."
  - "The stable runtime lives below ~/.fsb/native-host on POSIX and %LOCALAPPDATA%\\FSB\\NativeMessagingHost on Windows, separate from the invoking npm cache or checkout."
  - "All six production dependencies are exact-pinned, declared in canonical bundleDependencies order, and verified against the full 95-package lock-reachable production closure."
  - "npm pack runs as `npm pack .` with the exact absolute invoking package as cwd because npm omits bundled dependencies when the same relocated package is supplied as a directory spec."
  - "Publication packs once, verifies that exact tarball offline, and publishes only that tarball after downloaded PE, receipt, closure, and checksum gates pass."

patterns-established:
  - "Generated-build guard: snapshot before build, run a closed argv sequence while fresh output exists, restore all generated/index/unrelated bytes, then restore the raw index again after final Git reads."
  - "Closed runtime evidence: missing npm-cli, receipt, bundle, launcher, package manifest, version, checksum, or PE architecture is a stable refusal rather than an online or shell fallback."
  - "Release dependency graph: Windows produces version-keyed artifacts; the Linux publish job downloads, verifies, packs, hashes, and publishes them."

requirements-completed: [NATIVE-01, NATIVE-03]

duration: 58 min
completed: 2026-07-17
---

# Phase 63 Plan 01: Native Host Packaging Foundation Summary

**A release-built Windows bootstrap, stable package-owned runtime contract, complete offline npm payload, and artifact-dependent CI/publish graph now form the native-host distribution boundary.**

## Performance

- **Duration:** 58 min
- **Started:** 2026-07-17T03:01:29Z
- **Completed:** 2026-07-17T03:59:15Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Added a shell-free build wrapper that preserves the complete pre-existing `mcp/build` graph, raw Git index bytes/mode, and unrelated dirty/untracked bytes across success, failure, spawn error, SIGINT, and SIGTERM fixtures.
- Added a bounded C17 Windows bootstrap with exact sibling config parsing, direct `CreateProcessW`, inherited native stdio, exact origin/argv forwarding, child exit propagation, content-free error identifiers, x64/arm64 MSVC builds, PE inspection, version binding, and SHA-256 metadata.
- Froze protocol/health/ownership constants, all three stable runtime roots, restrictive modes, a closed owner marker, explicit offline pack/install recipe, and a two-line absolute-Node POSIX launcher template.
- Exact-pinned all six production dependencies, bundled the complete 95-package transitive production closure, and added a deterministic receipt binding every package path/name/version/integrity to the committed lock SHA-256.
- Added required Windows and macOS/Linux CI gates plus a publish dependency graph that verifies the final tarball, clean-cache offline installation, removed/altered bundle negatives, PE artifacts, lock/receipt hashes, and version-keyed release metadata before npm publication.

## Task Commits

Each task was committed atomically, with separate RED/GREEN commits for the two TDD tasks:

1. **Task 63-01-01 RED: Native packaging and workspace-preservation gate** — `e21828d0` (test)
2. **Task 63-01-01 GREEN: Release-bound Windows bootstrap** — `a2022949` (feat)
3. **Task 63-01-02 RED: Runtime layout, closure, and offline-install gate** — `ad9cd137` (test)
4. **Task 63-01-01 correction: Restore raw index after final Git reads** — `9d5d5ea3` (fix)
5. **Task 63-01-02 GREEN: Durable native-host runtime and receipt** — `339b09ca` (feat)
6. **Task 63-01-03: Required CI and npm release artifacts** — `62efa91e` (ci)

## Files Created/Modified

- `scripts/run-mcp-build-preserving-workspace.mjs` — Closed argv MCP build wrapper with exact build/index/dirty-state settlement and absolute Node plus npm-cli invocation.
- `mcp/native-host/windows/fsb-native-host-bootstrap.c` — Minimal Win32 stdio-inheriting bootstrap with bounded config/origin/argv validation and direct child execution.
- `mcp/native-host/windows/fsb-native-host-bootstrap-version.rc.in` — Package-version resource template for both PE architectures.
- `scripts/build-native-host-windows.mjs` — Explicit MSVC x64/arm64 build, PE machine/version inspection, and checksum metadata.
- `mcp/native-host/posix/fsb-native-host-launcher.mjs.in` — Shell-free absolute-Node launcher template with one fixed native-entry import.
- `mcp/native-host/runtime-integrity.json` — Deterministic lock SHA-256, direct/bundle roster, and 95-package production receipt.
- `mcp/src/native-host/constants.ts` — Frozen host, origin, protocol, health, size, time, schema, mode, and artifact identities.
- `mcp/src/native-host/runtime-layout.ts` — Pure stable-root, recipe, launcher, evidence, and closed-marker validation contract.
- `mcp/package.json` / `mcp/package-lock.json` — Exact production pins, canonical bundled dependency roster, Node `>=18.20.0`, and packaged `native-host/` payload.
- `.github/workflows/ci.yml` — Required Windows PE job, macOS/Linux runtime-payload matrix, and expanded `all-green` dependency set.
- `.github/workflows/npm-publish.yml` — Windows artifact producer plus final-tarball verifier, integrity metadata binder, and tarball-only publisher.
- `tests/mcp-native-host-packaging.test.js` — Wrapper settlement, Windows executable, layout/marker, receipt/closure, offline install, negative bundle, workflow, and packed-artifact gates.

## Decisions Made

- Used a small C executable instead of any script, shell wrapper, or SEA so Chromium can launch a direct `.exe` with a reviewable, constant-owned command boundary.
- Kept `runtime-layout.ts` data-only: it may validate and return paths/recipes/marker data but imports no filesystem mutation, registry, installer, network, or process authority.
- Required an absolute real Node path; POSIX additionally rejects whitespace, newline, non-real, relative, or overlong shebang paths.
- Treated npm's own install result as insufficient closure proof. The package is validated against the lock-derived receipt before materialization and again after installation.
- Kept generated Windows binaries out of source commits; required CI produces both architectures, packages them under their exact final paths, and makes publication depend on the version-keyed artifact.

## TDD Evidence

- **Task 1 RED:** the focused gate failed on the absent Windows bootstrap after the wrapper fixture matrix existed; **GREEN:** wrapper success/failure/spawn/index/dirty/signal settlement and Windows source contracts passed, with the real executable harness gated to Windows.
- **Task 2 RED:** the guarded build succeeded and the test failed on the absent runtime receipt; **GREEN:** exact pins, lock receipt, pure layouts, marker/launcher contracts, 95 bundled manifests, source/cache removal, empty-cache offline install, and zero sentinel connections passed.
- The raw-index regression failed against the original finalization order and passed after restoration moved after the wrapper's last Git reads.
- Final accumulated focused gates pass from the committed state.

## Security and Privacy

- The Windows bootstrap selects no command, environment, path, or output from native-message data. It reads only its bounded owned sibling config, accepts one exact origin plus an optional numeric parent-window argument, and reserves stdout for inherited framed protocol bytes.
- Stable registration targets cannot resolve inside npm cache, `_npx`, `.cache`, `node_modules`, a worktree, or the invoking package root.
- The owner marker is a closed nine-field record containing no secret, username, arbitrary absolute path, environment value, timestamp authority, or raw registry data.
- Offline tests poison all registry/proxy variables, disable lifecycle scripts/audit/fund/update checks, start from empty caches, and assert zero sentinel connections.
- The final npm tarball is bound to the committed lock, integrity receipt, both PE checksums, package version, and a release SHA-512 before publishing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Correctness] Restored the raw index after final Git comparison**

- **Found during:** Task 63-01-02 RED verification.
- **Issue:** The wrapper restored the raw index and then ran its final Git status/diff reads; those reads could refresh index stat data after restoration in the dirty workspace.
- **Fix:** Snapshot the index before workspace Git reads, restore after initial reads, and perform the final raw-byte restore/verification after every final Git read.
- **Files modified:** `scripts/run-mcp-build-preserving-workspace.mjs`, `tests/mcp-native-host-packaging.test.js`.
- **Verification:** A real guarded MCP build reported identical pre/post raw index SHA-256; the stale-index fixture and all settlement paths pass.
- **Committed in:** `9d5d5ea3`.

**2. [Rule 1 — Correctness] Packed from the exact absolute cwd instead of an absolute directory spec**

- **Found during:** Task 63-01-02 offline tarball verification.
- **Issue:** npm 11 omitted every bundled dependency when a relocated exact package was passed as an absolute directory spec, while packing `.` from that same package root included all 95 packages.
- **Fix:** Freeze the package root as the command's absolute cwd and use the constant argument `npm pack .`; the tarball destination and all other arguments remain absolute/closed.
- **Files modified:** `mcp/src/native-host/runtime-layout.ts`, `tests/mcp-native-host-packaging.test.js`.
- **Verification:** Pack receipt and every bundled manifest exactly match the 95-package lock closure; clean-cache offline install succeeds after source/cache deletion.
- **Committed in:** `339b09ca`.

**3. [Rule 1 — Cross-platform correctness] Removed the Windows npm command-shim dependency**

- **Found during:** Task 63-01-03 Windows workflow review.
- **Issue:** Selecting `npm.cmd` with `shell:false` is not a reliable Windows process boundary and contradicted the wrapper's explicit shell-free argv contract.
- **Fix:** Resolve the real `npm-cli.js` from bounded local Node/PATH candidates and launch it through `process.execPath`; fixture tests inject an absolute fake npm-cli file.
- **Files modified:** `scripts/run-mcp-build-preserving-workspace.mjs`, `tests/mcp-native-host-packaging.test.js`.
- **Verification:** Wrapper fixture matrix passes, source excludes `npm.cmd`, and a real guarded build preserves raw index/build identity.
- **Committed in:** `62efa91e`.

---

**Total deviations:** 3 auto-fixed correctness issues.
**Impact on plan:** Each fix strengthens the required shell-free, complete-bundle, and byte-exact preservation contracts; no feature scope was added.

## Issues Encountered

- npm may return exit 0 when a tarball declares a bundled dependency that is absent. The explicit lock/receipt/manifest verifier therefore rejects the tarball before install and revalidates the materialized package afterward; tests prove both refusal points without registry fallback.
- The local macOS run cannot compile or execute the genuine MSVC artifacts. Source/build/workflow contracts and synthetic PE packing are blocking locally; the required `windows-latest` job owns genuine x64 execution and arm64 inspection, while real Chrome/registry behavior remains human evidence.

## Known Pending Evidence

- Actual Chrome invocation, Windows HKCU lookup/view behavior, code-signing behavior, installed POSIX permissions on user machines, and genuine x64/arm64 user-machine behavior remain `human_needed` for the deferred milestone-end UAT sweep.
- No browser, native registration, live daemon, platform CLI, or human UAT was run or marked passed.

## User Setup Required

None during autonomous implementation. CI supplies MSVC and produces release artifacts; genuine Chrome/platform UAT remains deferred.

## Verification

- `node tests/mcp-native-host-packaging.test.js --section windows-bootstrap` — PASS.
- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-native-host-packaging.test.js","--section","runtime-layout"]]'` — PASS, including build restoration and zero-network offline materialization.
- `node tests/mcp-native-host-packaging.test.js --section workflow-and-pack` — PASS, including complete packed closure, altered receipt, removed bundle, registry-needed plain tarball, source/cache removal, and release-workflow source contracts.
- Both GitHub workflow files parse as YAML; JavaScript syntax and `git diff --check` pass for all changed implementation/test/workflow files.
- Protected SHA-256 values remain exact: `mcp/build/index.js` `6a492a2e…`, showcase `llms-full.txt` `664347e0…`, `llms.txt` `c69ed23d…`, `sitemap.xml` `826aa8f8…`, and Phase 62 UAT `b6895278…`.
- `.planning/agent-history.json` remains unchanged at `93904eeb…`; no human/live UAT was invoked.

## Next Phase Readiness

- Plans 63-02 through 63-07 can consume frozen host/protocol constants, stable runtime paths, marker fields, launcher selection, exact package receipt, and the workspace-safe build wrapper.
- Plan 63-03 may add the compiled native entry without weakening the staged Plan 01 package proof; Plan 63-05 can implement the already-frozen offline materialization and atomic publication recipe.
- No autonomous implementation blocker remains. Genuine Windows CI and milestone-end platform/Chrome UAT remain external evidence boundaries rather than code blockers.

## Self-Check: PASSED

- All 13 implementation/test/workflow artifacts and this summary exist.
- Commits `e21828d0`, `a2022949`, `ad9cd137`, `9d5d5ea3`, `339b09ca`, and `62efa91e` are present.
- All three plan verification commands, YAML parsing, syntax checks, diff checks, clean staging checks, and protected-hash checks pass.

---
*Phase: 63-native-messaging-host*
*Completed: 2026-07-17*

## Security Remediation Addendum — 2026-07-18 (`F63-SECURITY-02`)

- Finding `F63-SECURITY-02` is closed by RED commit `a91f3e29` and GREEN commit `409e638d`.
- The Windows artifact set now contains a distinct version-bound registry-helper PE for each supported architecture. Schema-2 artifact metadata records an ordered role roster, role marker, package version, byte length, SHA-256 digest, and PE machine for both the bootstrap and helper; runtime selection, copying, receipts, and installed-state inspection preserve and revalidate that provenance.
- Every helper launch validates the selected packaged file's real path, regular-file/no-symlink status, size, digest, PE machine, embedded helper role, and package version immediately before an absolute-path `shell:false` spawn. The child receives an empty environment, so inherited `PATH`, `SystemRoot`, and `SYSTEMROOT` cannot select registry tooling or influence executable loading through the adapter.
- Windows builds use `/MT`, Control Flow Guard, high-entropy ASLR, and non-incremental linking. Release workflows build and publish both bootstrap and registry-helper PEs, and the Windows CI harness is limited to read-only user/32 and user/64 queries plus a deliberately malformed write request that must fail before mutation.
- The bootstrap C source and its closed argv protocol are unchanged. Local source, synthetic-PE, packaging, metadata-tamper, workflow, and boundary tests pass; genuine MSVC compilation and the safe harness remain owned by required `windows-latest` CI and are not claimed as locally executed.
