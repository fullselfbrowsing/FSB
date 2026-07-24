---
phase: 63-native-messaging-host
plan: "03"
subsystem: native-host-protocol-boundary
tags: [native-messaging, framing, origin, argv, one-shot, import-boundary, tdd]

requires:
  - phase: 63-native-messaging-host
    provides: Release-bound host constants and the workspace-preserving MCP build guard from Plan 01
  - phase: 63-native-messaging-host
    provides: Product-specific serve readiness and bind ownership from Plan 02
provides:
  - Exact native-endian one-frame wake protocol with a 4096-byte application-body cap
  - One-shot no-frame-safe native entry with protocol-only stdout and pre-side-effect invocation validation
  - Blocking source, compiled, build, publish, and package authority-boundary gates
affects: [63-04, native-host-runtime, native-host-installer, extension-wake]

tech-stack:
  added: []
  patterns:
    - Incremental native-endian frame decoding with a pre-allocation body cap and fatal UTF-8
    - Exact ordinary own-enumerable-data object schemas before any injected wake side effect
    - Positive three-leaf native-host import graph checked independently in source and compiled modes

key-files:
  created:
    - mcp/src/native-host/protocol.ts
    - mcp/src/native-host/entry.ts
    - tests/mcp-native-host-protocol.test.js
    - scripts/verify-native-host-boundary.mjs
  modified:
    - mcp/package.json
    - tests/mcp-native-host-packaging.test.js

key-decisions:
  - "A zero-byte EOF is resolved before invocation validation and remains a silent successful boot-presence probe with no handler call or stdout frame."
  - "Only `node:os` plus the exact entry/constants/protocol local leaf graph is permitted at this wave; source and compiled graphs are judged separately."
  - "Every response is reconstructed from the closed outcome/reason vocabulary and written once only after its native frame is fully encoded."

patterns-established:
  - "Native input barrier: complete one bounded frame -> exact request schema -> exact Chrome origin/argv -> one injected wake call."
  - "Native output barrier: closed handler fact -> exact outcome/reason compatibility -> one bounded framed write -> awaited settlement."
  - "Staged graph gate: source before TypeScript, compiled after TypeScript, source+compiled again before publish/review."

requirements-completed: [NATIVE-01, NATIVE-03]

duration: 16 min
completed: 2026-07-17
---

# Phase 63 Plan 03: Closed Native Protocol and Authority Boundary Summary

**The native host now accepts exactly one bounded Chrome wake frame, validates its complete schema and invocation before any wake authority runs, emits at most one closed response, and cannot import privileged FSB subsystems.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-07-17T04:29:29Z
- **Completed:** 2026-07-17T04:45:19Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Implemented incremental native-endian framing with a four-byte header, a 4096-byte body ceiling enforced before body allocation, fatal UTF-8, exact JSON consumption, and rejection of partial, zero, multiple, or trailing frames.
- Froze the exact v1 wake request, ordinary own-data object shape, correlation vocabulary, Chrome origin, optional Windows parent-window argv, response vocabulary, and outcome/reason compatibility table.
- Added an injectable one-shot entry that treats no-frame EOF as a silent no-op, validates the complete invocation before its sole handler call, writes at most one frame, awaits stdout completion, and emits only stable content-free failures.
- Added source and compiled transitive graph verification that permits only the three native leaf modules and `node:os`, rejects unresolved/dynamic/escaping imports and privileged/historical authority, and blocks MCP build and publish drift.
- Extended package coverage to prove the compiled native entry ships while historical native IPC artifacts and every forbidden authority fixture remain excluded.

## Task Commits

Each TDD task kept its RED and GREEN evidence atomic; the boundary task landed after its guarded source/compiled/package gate passed:

1. **Task 63-03-01 RED: Exact framing/schema contract** — `9493e2e0` (test)
2. **Task 63-03-01 GREEN: Closed native wake protocol** — `168753eb` (feat)
3. **Task 63-03-02 RED: One-shot entry lifetime contract** — `85730e68` (test)
4. **Task 63-03-02 GREEN: One-shot native host entry** — `d0236679` (feat)
5. **Task 63-03-03: Native authority and package boundary** — `380ddf8e` (chore)

## Files Created/Modified

- `mcp/src/native-host/protocol.ts` — Parses and validates one exact bounded wake frame/invocation and encodes only closed response facts.
- `mcp/src/native-host/entry.ts` — Orchestrates silent boot EOF, one validated handler call, one awaited stdout frame, and stable failures.
- `tests/mcp-native-host-protocol.test.js` — Exercises hostile fragmentation/schema/invocation cases, byte-exact round trips, stdout purity, and settlement races.
- `scripts/verify-native-host-boundary.mjs` — Resolves the exact source or compiled transitive graph and rejects authority expansion.
- `mcp/package.json` — Runs source verification before TypeScript, compiled verification after TypeScript, and both before publication.
- `tests/mcp-native-host-packaging.test.js` — Pins graph modes, malicious-import fixtures, package scripts, and packed native-host inclusion/exclusion.

## Decisions Made

- Treated zero-byte EOF as the service-worker boot-presence probe before origin/argv validation so Chrome can test installation without manufacturing a wake request or causing daemon work.
- Required ordinary `Object.prototype` roots with exact own enumerable data keys. Arrays, null/custom prototypes, inherited/accessor/symbol properties, missing/unknown keys, and polluted shapes fail before the injected handler.
- Kept the Plan 03 production graph intentionally limited to `entry`, `protocol`, and `constants`; Plan 04 must explicitly extend the same verifier when its frozen runtime-layout and serve composition leaves exist.
- Reconstructed handler output through the closed outcome/reason table and mapped invalid handler facts to `failed/internal_failure` rather than serializing errors or accepting wider objects.

## TDD Evidence

- **Task 1 RED:** the guarded framing/schema command failed with `ERR_MODULE_NOT_FOUND` for the absent compiled protocol leaf.
- **Task 1 GREEN:** the same guarded section passed the fragmentation, cap, fatal decoding, exact own-object, origin/argv, compatibility, and byte-exact framing matrix.
- **Task 2 RED:** the guarded entry-lifetime command failed with `ERR_MODULE_NOT_FOUND` for the absent compiled entry leaf.
- **Task 2 GREEN:** the same guarded section passed silent EOF, zero-side-effect hostile input, one-call/one-write, handler fallback, stdout failure, and multiple-settlement cases.
- **Task 3:** source, compiled, no-argument/all modes, malicious authority fixtures, staged package hooks, tarball inclusion, and historical exclusion all passed through the preserving build wrapper.

## Security and Privacy

- T63-01 is mitigated by pre-allocation length rejection, fatal UTF-8, exact ordinary own-data schemas, exact origin/argv, delayed trailing-byte settlement, and zero handler calls for every hostile case.
- T63-02 is mitigated by the positive three-leaf graph, one allowed core import, explicit forbidden authority categories, no production process/shell edge, one-shot lifetime, and protocol-only stdout.
- T63-12 remains closed: the response exposes only protocol version, correlation, outcome, and content-free reason; no task, prompt, provider, browser, secret, path, environment, or raw error can enter the schema.

## Deviations from Plan

- **[Rule 1 - Correctness] Kept the stdout error listener alive through Node's post-callback error turn.** The initial implementation removed it when the write callback fired, allowing a later stream `error` event to escape; the corrected one-shot settlement landed in `d0236679` with the regression.
- **[Rule 1 - Correctness] Excluded property-method `.exec()` calls from the process-helper token check.** The first boundary GREEN classified `RegExp.exec()` as shell authority; the gate now still rejects unqualified process helpers and `node:child_process` without false-positive blocking the protocol parser. This landed in `380ddf8e`.
- No scope, architecture, dependency, or live-UAT deviation occurred.

## Issues Encountered

- The first Task 3 guarded run exposed the intended fail-closed token scan being too broad for `RegExp.exec()`; the scoped matcher correction passed both real graphs and the malicious `node:child_process` fixture.
- The package dry-run is invoked through Node's resolved npm CLI so the test remains independent of executable-bit and shell resolution differences.

## Known Pending Evidence

- Real Chrome pipe chunking and launch argv across macOS, Linux, and Windows remain `human_needed` for the milestone-end UAT sweep.
- No installed native host, browser, live daemon, platform installer, or human UAT was run or marked passed.

## User Setup Required

None during autonomous implementation.

## Verification

- Task 1 guarded command: `mcp-native-host-protocol` `framing-and-schema` — PASS through `run-mcp-build-preserving-workspace.mjs`.
- Task 2 guarded command: `mcp-native-host-protocol` `entry-lifetime` — PASS through `run-mcp-build-preserving-workspace.mjs`.
- Task 3 guarded command: native boundary `source+compiled` plus packaging `import-boundary` — PASS through `run-mcp-build-preserving-workspace.mjs`.
- Combined guarded plan gate: both protocol sections, source+compiled boundary, packaging boundary, and workspace identity preservation — PASS.
- `git diff --check` and scoped stub scan — clean for all Plan 03 source, test, script, and package changes.
- Protected SHA-256 values remain exact: `mcp/build/index.js` `6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4`; showcase `664347e0...`, `c69ed23...`, `826aa8f8...`; Phase 62 UAT `b6895278...`; agent history `93904eeb...`.

## Next Phase Readiness

- Plan 63-04 can add the already-frozen data-only runtime-layout leaf and exact serve wake composition by extending the same staged boundary gate; it cannot inherit agent, task, shell, auth, installer, doctor, browser, or router authority.
- The parser and one-shot entry provide the validation barrier Plan 04 needs before health, lock, filesystem, or the single exact serve-process action.
- No autonomous implementation blocker remains; live Chrome/platform transport evidence stays deferred to the single milestone-end UAT sweep.

## Self-Check: PASSED

- All six Plan 03 artifacts exist, and the exact source/compiled native leaf graphs pass.
- Commits `9493e2e0`, `168753eb`, `85730e68`, `d0236679`, and `380ddf8e` exist in order.
- All three task commands and the combined plan gate pass through the Plan 01 workspace-preserving wrapper.
- Protected generated, showcase, Phase 62 UAT, and agent-history hashes remain unchanged.

---
*Phase: 63-native-messaging-host*
*Completed: 2026-07-17*
