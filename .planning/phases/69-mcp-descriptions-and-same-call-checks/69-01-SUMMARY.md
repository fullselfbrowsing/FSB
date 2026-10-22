---
phase: 69-mcp-descriptions-and-same-call-checks
plan: 01
subsystem: testing
tags: [mcp, tools-list, fixture, canonical-json, sdk-inmemory-transport, budget, shape-freeze]

# Dependency graph
requires:
  - phase: 66-baseline-and-session-timing
    provides: "pin 8a058bdf and scripts/bench/lib/identity.mjs (canonicalJson, sha256Hex, toolsListDigest)"
  - phase: 66.1-mcp-settings-tool
    provides: "the settings tool (mcp/src/tools/settings.ts) and BASELINE_8A058BDF_TOOLS_DIGEST in tests/mcp-settings-tool-contract.test.js"
provides:
  - "tests/fixtures/mcp-tools-list-8a058bdf.json: frozen, self-verifying 8a058bdf tools/list (72 tools) with meta {sourceCommit, sdkVersion, zodVersion, command, count, sha256, toolsListDigest}"
  - "scripts/mcp/lib/tools-list.mjs: git-free in-process listing (createRuntime + SDK Client over InMemoryTransport), mock AgentScope, stub bridge, canonical metrics, projectShape, fixture/version readers"
  - "scripts/mcp/tools-list-baseline.mjs: --write / --check generator (git archive + tsc of the pin in a temp dir); exports buildPinTools()"
  - "tests/helpers/mcp-in-process.mjs: re-exports plus assertBuildFresh, listCurrentTools and EXPECT_TOOL_NAMES_VERBATIM (29 D-12 names)"
  - "three chained suites: mcp-tools-list-baseline (MCP-01-a), mcp-tools-list-shape-freeze (MCP-04-a, EXPECT_REQUIRED=false), mcp-description-budget (MCP-01-c, all GATES off)"
  - "69-SWEEP-BASELINE.json: regression-sweep baseline; its head is $P69_START"
affects: [69-02, 69-03, 69-04, 69-05, 69-06, 69-07, 69-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Frozen-fixture gate: chained tests read a committed, self-hashing artifact; only a separate local script touches git history"
    - "In-process tools/list via createRuntime + InMemoryTransport with a setter-less AgentScope mock (no execFile probes) and a recording stub bridge"
    - "Shape projection = canonical clone with every schema `description` keyword stripped, property-map keys kept"
    - "Report-only gate switches (GATES object) so a measurement suite lands green before the work it gates"

key-files:
  created:
    - scripts/mcp/lib/tools-list.mjs
    - scripts/mcp/tools-list-baseline.mjs
    - tests/fixtures/mcp-tools-list-8a058bdf.json
    - tests/helpers/mcp-in-process.mjs
    - tests/mcp-tools-list-baseline.test.js
    - tests/mcp-tools-list-shape-freeze.test.js
    - tests/mcp-description-budget.test.js
    - .planning/phases/69-mcp-descriptions-and-same-call-checks/69-SWEEP-BASELINE.json
  modified:
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "The fixture stores tools in canonical form (sorted keys, undefined dropped) sorted by name; meta.sha256 = sha256(canonicalJson(tools)); meta.toolsListDigest equals the 66.1 BASELINE_8A058BDF_TOOLS_DIGEST, so the two freezes cannot drift apart"
  - "Fixture integrity is byte-strict: besides the hash, the suite checks the exact meta key set and every meta value, and that the file bytes equal the generator's JSON.stringify(…, null, 2) + newline, so any byte edit (including whitespace or meta.command) fails"
  - "projectShape walks every JSON Schema sub-schema position (properties, patternProperties, $defs/definitions, items/prefixItems, object additionalProperties, not, anyOf/oneOf/allOf); no-op beyond the plan's list for today's schemas"
  - "The generator compiles the pin with the current node running <tmp>/mcp/node_modules/.bin/tsc, requires exactly one of --write/--check (no flag or an unknown flag exits 2), and --check also compares the whole meta, so an SDK or zod bump is reported as meta drift"
  - "Budget figures for the current list are always taken over the 72 fixture names; settings is measured on its own line as canonicalBytes({tools:[settings]}); the five longest descriptions are taken over every live tool, because the per-tool cap applies to all of them"

patterns-established:
  - "New Phase 69 suites load tests/helpers/mcp-in-process.mjs by dynamic import(pathToFileURL(...)) from CJS plain-node harnesses and call listCurrentTools(), which fails loudly on a stale mcp/build"
  - "Later plans flip constants in place: GATES.perToolDescriptionCap (69-02), GATES.budgetFloors and GATES.fullCoverage (69-04), EXPECT_REQUIRED (69-06); the coverage and must-keep blocks are delimited by `// --- coverage (D-08) ---` and `// --- must-keep (D-10) ---`"

requirements-completed: [MCP-01, MCP-04]

# Metrics
duration: 13min
completed: 2026-10-15
---

# Phase 69 Plan 01: Baseline fixture, shape freeze and report-only budget Summary

**The 8a058bdf tools/list (72 tools; 54,024 / 34,217 / 121,379) is now a committed, self-hashing fixture. A local git-archive-plus-tsc generator re-derives it byte for byte. Three chained, git-free, Node 20-safe suites are built on it: fixture integrity, a description-free shape freeze, and a report-only description budget.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-15T12:50:24Z
- **Completed:** 2026-10-15T13:03:00Z
- **Tasks:** 3 of 3
- **Files modified:** 10 (8 created, 2 modified)

## Recorded values (Wave 0)

| Item | Value |
|------|-------|
| `$P69_START` (sweep `head`) | `f978e989ce00bd6fccabb762368463e5fa5ebccc` |
| 66.1 freeze test (found with `grep -rln BASELINE_8A058BDF_TOOLS_DIGEST tests/`) | `tests/mcp-settings-tool-contract.test.js`: constant at line 69, asserted at lines 389-391 over `toolsListDigest(tools minus settings)`. Plan 69-02 migrates it. |
| Preconditions | `mcp/src/tools/settings.ts` exists; the pin `8a058bdf0d17c1e3e79ec3104cc1996326b4c402` is present locally |
| `resolveAgentTabOrError` offset after `async _handleExecuteAction` (extension/ws/mcp-bridge-client.js) | **4,190**, under the 4,500 window (310 characters of headroom; unchanged by 66.1) |
| Fixture `meta.sha256` | `b0e67bb7974cf1cf0d649113162b438559585aa02ba28666f17df5d14a8274b8` |
| Fixture `meta.toolsListDigest` | `8321cc7234a7e1d817b5a3e818e75e243d76e60d1911d88b410d38147c8c4a05` (equals the 66.1 `BASELINE_8A058BDF_TOOLS_DIGEST`) |
| SDK / zod at generation | 1.29.0 / 3.25.76 |

### Measured figures (in-process, current build at `$P69_START`)

| Measure | 8a058bdf fixture | Current build, 72 baseline names |
|---------|-----------------:|---------------------------------:|
| Tools | 72 | 72 (73 live, including `settings`) |
| Description chars | 54,024 | 54,024 |
| Parameter-description chars | 34,217 | 34,217 |
| Total chars (estimate: ceil(chars/4)) | 88,241 (22,061 tokens) | 88,241 (22,061 tokens) |
| Canonical bytes of `{tools}` (estimate: ceil(bytes/4)) | 121,379 (30,345 tokens) | 121,379 (30,345 tokens) |

- The current build's 72 baseline tools are canonically identical to the fixture.
- `settings` (Phase 66.1) has a 151-character description and 63 parameter-description characters. It is 502 canonical bytes alone, or 514 measured as `{tools:[settings]}`.
- The longest current descriptions are `execute_js` (2,187, the only one over the 2,048 cap), `back` (1,934), `upload_file` (1,681), `click` (1,639) and `select_option` (1,435).
- PROJECT.md target (>50% tool-list token estimate cut): **NOT MET (0.0%)**. This is expected, because no text has been cut yet.

### Regression-sweep baseline (`69-SWEEP-BASELINE.json`)

- Command: the 18-file `--files` list from the plan. The sweep ran in the background on Node v24.14.1 from 12:50:24Z to 12:53:22Z with 7225 held.
- **211 tests selected** (the plan measured 207 before 66.1 landed; 66.1's new suites mention these basenames). **208 passed, 3 failed.** The sweep exits 1 by design because it is the baseline run.
- Pre-existing failures recorded and **not fixed** (none of them is in any npm script):
  - `tests/agent-manager-start-mode.test.js`: harness `ReferenceError: agentManager is not defined`.
  - `tests/back-tool.test.js`: the known 1/30, "optional tabId threads into payload (got undefined)".
  - `tests/trigger-cap-settings-ui.test.js`: 2/39, `fsbTriggerCapDisplay` badge and `fsbTriggerCap` min/max/step/default.
- `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}` were restored after the sweep, and `git status --short showcase/angular/public` printed nothing before every commit.

## Accomplishments

- **The fixture and its generator.**
  - `node scripts/mcp/tools-list-baseline.mjs --write` produced the fixture, which was never hand-edited.
  - `--check` re-derives it byte for byte in about 1.6 s, on both Node 24 and Node 20. `--bogus` exits 2.
  - A missing pin fails fast with "8a058bdf not in this clone (CI clones are shallow); run locally".
- **`tests/mcp-tools-list-baseline.test.js`** (16 checks) proves the fixture's integrity:
  - the hash, the exact meta, and byte-exact serialization;
  - the installed SDK/zod versions, with the hint "regenerate with node scripts/mcp/tools-list-baseline.mjs --write at the pin";
  - 72 unique names, no `settings`, and the 66.1 digest.
- **`tests/mcp-tools-list-shape-freeze.test.js`** compares projections:
  - It compares the description-free projection of every baseline tool against the fixture.
  - `settings` is excluded by name, and the suite prints "settings present (Phase 66.1), excluded by name".
  - The `expect` allowance is limited to the 29 verbatim names. Every published `expect` schema must be byte-identical, at most 600 bytes, `type: object` with `additionalProperties: false`, with no `$ref`/`$defs`/`anyOf`/`oneOf` and no sub-property descriptions, and never in `required`.
  - `EXPECT_REQUIRED = false` for now.
- **`tests/mcp-description-budget.test.js`** reports the budget and gates nothing yet:
  - It prints the full report: bytes, characters, both estimates, percent change, the `settings` line, the five longest descriptions and the PROJECT.md target line.
  - Gates `perToolDescriptionCap`, `budgetFloors` and `fullCoverage` all print "gate off (report-only)".
  - The baseline constants are always checked.
- **Registration.** All three suites appear exactly once at the end of `package.json` `scripts.test`, after `npm --prefix mcp run build` (the chain grew from 308 to 311 commands), and in `REFINEMENT_ROOT_TEST_COMMANDS`. The `PRE_PHASE6x` hashes are untouched.

## Task Commits

1. **Task 1: Preconditions, sweep baseline, listing library, generator and fixture**: `a6637821` (test)
2. **Task 2: In-process helper, fixture-integrity suite and shape freeze**: `1d6ff93b` (test)
3. **Task 3: Report-only description budget suite**: `2d739542` (test)

**Plan metadata:** see the docs commit that adds this SUMMARY.

## Files Created/Modified

- `scripts/mcp/lib/tools-list.mjs`: the git-free listing library. It has no `child_process` import, and it re-exports `canonicalJson`, `sha256Hex` and `toolsListDigest` from `scripts/bench/lib/identity.mjs`.
- `scripts/mcp/tools-list-baseline.mjs`: the `--write`/`--check` CLI (not chained). It exports `buildPinTools`, `buildMeta`, `serializeFixture`, `parseArgs` and `main`.
- `tests/fixtures/mcp-tools-list-8a058bdf.json`: the frozen `{meta, tools}` (150,341 bytes pretty-printed, all ASCII).
- `tests/helpers/mcp-in-process.mjs`: the test-side helper. It adds `EXPECT_TOOL_NAMES_VERBATIM`, `assertBuildFresh` and `listCurrentTools`.
- `tests/mcp-tools-list-baseline.test.js`, `tests/mcp-tools-list-shape-freeze.test.js`, `tests/mcp-description-budget.test.js`: the three new chained suites.
- `.planning/phases/69-mcp-descriptions-and-same-call-checks/69-SWEEP-BASELINE.json`: the sweep baseline (`$P69_START`).
- `package.json`, `tests/delegation-phase-contract.test.js`: registration, exactly once each.

## Verification

- Task `<verify>` chains: all exit 0.
- **RED proofs**, run and reverted, never committed. `git diff --quiet tests/fixtures` exits 0 afterwards.
  - Changing one character of `click`'s `inputSchema.type` in the fixture makes the baseline suite exit 1 (hash and digest) and the shape freeze exit 1 (it names `click`).
  - Changing `back.tab_id.exclusiveMinimum` in the fixture makes the shape freeze exit 1, naming `back` and printing both projections truncated to 400 characters.
  - A description-only edit leaves the shape freeze green but makes the baseline suite exit 1.
  - With all `GATES` on, the budget suite exits 1 on today's build (`execute_js` is 2,187 characters, both floors are at 0.0%, and coverage is 72 of 72 unchanged).
  - Touching `mcp/src/tools/vault.ts` makes the budget suite exit 1 with "mcp/build/tools/vault.js is older than mcp/src/tools/vault.ts -- run `npm --prefix mcp run build`".
- `projectShape` keeps a parameter named `description` and walks `items`, `additionalProperties` and `anyOf`; an inline check passed.
- **Node 20 parity.** All three suites exit 0 under `npx --offline -y node@20` (v20.20.2) and under the official binary `/tmp/fsb-node20/node-v20.20.2-darwin-arm64/bin/node`. The generator's `--check` also passes on Node 20.
- **Wave gate.** These suites pass unmodified: `tool-definitions-parity`, `capability-mcp-surface`, `capability-autopilot-parity`, `recipe-schema-lock`, `mcp-settings-tool-contract`, `delegation-phase-contract` and `mcp-version-parity`. So do all 11 suites that read `scripts.test`: `mcp-client-identity-integration`, `capability-fetch`, `capability-interpreter`, `classification-gate`, `lattice-provider-bridge-smoke`, `lattice-step-emitter-smoke`, `qr-pairing`, `settings-panel-sync`, `trigger-tool-dispatcher` and the two above.
- **Full chain (tolerant runner, `node /tmp/fsb-tolerant-runner.mjs /tmp/p6901-full`).** 327 commands: 16 pretest plus 311 test. 326 exit 0. The only failure is the known environmental `node tests/mcp-install-platforms.test.js`: 2 cases, "expected daemon_offline, got ok" and EADDRINUSE, because the user's native-host daemon holds 7225/7226. This is identical to the baseline. The three new suites ran as T309-T311 and exited 0. The crawler files were restored afterwards.
- `git status --short scripts/bench/tasks` prints nothing; `core.lock.json` and the bench fixtures are untouched.

## Decisions Made

See `key-decisions` in the frontmatter. In short:
- The fixture-integrity and `--check` comparisons are stricter than the plan's minimum, so any byte edit fails.
- `projectShape` covers every JSON Schema sub-schema position.
- Budget figures are always measured over the 72 fixture names, and `settings` is reported separately.

## Deviations from Plan

None. The plan was executed as written. These observations do not change any behaviour:
- **The sweep selected 211 tests, not 207.** 66.1 landed after the plan's measurement, and its new suites reference these basenames. The command and the outputs are exactly as planned.
- **The chain had 308 commands at start, not 304.** The plan's figure predates 66.1's four registrations. The new commands were appended at the end, after `npm --prefix mcp run build` (index 12).

## TDD Gate Compliance

Tasks 2 and 3 are `tdd="true"`, but the plan specifies one `test(69-01): …` commit per task. These are contract suites that must be green on the unchanged build from their first commit (D-24, RESEARCH Pitfall 4). RED was therefore proven by the uncommitted sanity runs listed under Verification, and not by a failing commit. The plan is `type: execute`, so the plan-level RED/GREEN commit sequence does not apply.

## Known Stubs

These are intentional report-only placeholders, owned by later plans; none blocks this plan's goal:
- `tests/mcp-description-budget.test.js` `// --- must-keep (D-10) ---`: prints "no rows yet". Plan 69-02 adds `MUST_KEEP`, and 69-04 completes it.
- `tests/mcp-description-budget.test.js` `// --- coverage (D-08) ---`: report-only `fullCoverage` (it counts tools that still publish their 8a058bdf description). Plan 69-04 turns it on with the module coverage checks.

## Deferred to Validation Block

- **V1:** cross-check that the live bench identity recorded at `8a058bdf` has `toolsList.sha256 = 8321cc7234a7e1d817b5a3e818e75e243d76e60d1911d88b410d38147c8c4a05`, the same digest this fixture carries (`meta.toolsListDigest`).
- **V6 (inherited):** the real CI run on Node 20 with a shallow clone. Nothing is pushed before V6. Locally, the chained suites never touch git, and `--check` stays a local-only script.

## Issues Encountered

None. The baseline sweep's 3 failures are pre-existing and unscripted, and are recorded above.

## User Setup Required

None.

## Next Phase Readiness

- Plan 69-02 can import `readBaselineFixture`, `projectShape` and `EXPECT_TOOL_NAMES_VERBATIM` from `tests/helpers/mcp-in-process.mjs`.
- It can then flip `GATES.perToolDescriptionCap` and migrate `tests/mcp-settings-tool-contract.test.js` lines 389-391, the description-bearing `BASELINE_8A058BDF_TOOLS_DIGEST` assertion, in the same commit as its first description edit.
- Plans 69-06 and 69-07 can use `createInProcessClient({ bridge })` and `makeStubBridge({ onSend })`, which records `calls`.
- Later sweeps compare against `69-SWEEP-BASELINE.json` with `--baseline`.

---
*Phase: 69-mcp-descriptions-and-same-call-checks*
*Completed: 2026-10-15*

## Self-Check: PASSED

All 9 created files exist, and task commits a6637821, 1d6ff93b and 2d739542 are in the log with no AI attribution.
