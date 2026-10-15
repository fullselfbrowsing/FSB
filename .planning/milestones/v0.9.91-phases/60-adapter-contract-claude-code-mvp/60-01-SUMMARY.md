---
phase: 60-adapter-contract-claude-code-mvp
plan: "01"
subsystem: agent-runtime
tags: [adapter-contract, claude-code, process-security, static-policy, npm-package]

requires:
  - phase: 59-reverse-request-channel-security-foundation
    provides: Authenticated reverse-channel seam and permanent forbidden agent-provider flag gate
provides:
  - Exact five-method provider-neutral adapter contract and closed canonical registry
  - Retained-path Claude Code 2.1.177 detection with fail-closed Windows shim handling
  - Immutable MCP-only Claude argv profile and shipped static FSB browser-control policy
  - Built-output security, package-content, and policy-contract tests without a live CLI
affects: [60-02, 60-03, 60-04, 61-delegation-ux-sw-eviction-persistence]

tech-stack:
  added: []
  patterns:
    - Declarative deeply frozen spawn data with no task-bearing field
    - One retained executable identity from shell-free version probe through spawn metadata
    - Static reviewed agent metadata transformed into the closed Claude agents-map schema

key-files:
  created:
    - mcp/src/agent-providers/adapter.ts
    - mcp/src/agent-providers/registry.ts
    - mcp/src/agent-providers/claude-detect.ts
    - mcp/src/agent-providers/claude-profile.ts
    - mcp/ai/agents/fsb.json
    - tests/mcp-agent-provider-contract.test.js
    - tests/mcp-claude-code-adapter.test.js
  modified: []

key-decisions:
  - "Represent a verified Windows shim only as a retained native command plus fixed argv prefix; the production default rejects command and batch shims rather than invoking a shell."
  - "Keep product metadata in the shipped fsb.json asset, then serialize only the supported Claude agent-definition fields beneath the canonical fsb key."
  - "Report Claude authentication as unknown in detection because Phase 60 never infers subscription state from files, environment, or a live authenticated run."

patterns-established:
  - "Registry closure: construction requires one exact lowercase claude-code entry and rejects missing, duplicate, case-varied, or unknown ids with typed errors."
  - "Profile closure: version-selected fixed argv includes two literal empty arguments, one private MCP config, one static agent, MCP-only tools, forty turns, and no persistence."
  - "Policy packaging: npm dry-run listing from the mcp package directory must include ai/agents/fsb.json and leave no archive in the workspace."

requirements-completed: [ADAPT-01, ADAPT-02, CLAUDE-01, CLAUDE-02, CLAUDE-04]

duration: 13 min
completed: 2026-07-14
---

# Phase 60 Plan 01: Adapter Contract and Claude Code Profile Summary

**An exact five-method adapter boundary now binds Claude Code to one retained native executable, one immutable MCP-only 2.1.177 profile, and one packaged static FSB browser policy without exposing task text or process authority.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-07-14T16:30:29Z
- **Completed:** 2026-07-14T16:43:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added the exact `detect`, `buildSpawn`, `parseEvents`, `kill`, and `caps` provider contract with immutable normalized event, retained binary, task/context, spawn-spec, child, and capability types.
- Added a closed injected registry that accepts only one canonical `claude-code` adapter and fails without normalization or fallback for every invalid registration or lookup.
- Added shell-free detection that resolves one exact executable, probes that retained command with bounded `--version` output, gates the 2.1.177 profile, detects path replacement, and rejects unsafe Windows shims unless a deterministic native target is verified.
- Added the complete ordered Claude profile with isolated settings, disabled built-ins, strict private MCP, the static `fsb` agent, explicit deny rules, forty turns, no persistence, and task-canary absence across all declarative metadata.
- Shipped and package-verified a static browser agent policy covering server-minted identity, owned tabs, vault references, and human handoff for irreversible or consent-required actions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define the exact adapter contract and closed registry** - `7ee3b7e4` (feat)
2. **Task 2: Implement retained-path detection, static FSB policy, and closed Claude profile** - `78c83b3e` (feat)
3. **Task 3: Validate the shipped delegated-agent and package contract** - `3fa0d4d1` (test)

## Files Created/Modified

- `mcp/src/agent-providers/adapter.ts` - Exact five-method interface and immutable provider-neutral runtime contracts.
- `mcp/src/agent-providers/registry.ts` - Typed, injected, canonical-id-only adapter registry.
- `mcp/src/agent-providers/claude-detect.ts` - Bounded retained-path version detection and verified-native Windows policy.
- `mcp/src/agent-providers/claude-profile.ts` - Static-agent validation and exact frozen Claude spawn metadata.
- `mcp/ai/agents/fsb.json` - Reviewed MCP-only ownership, vault, and consent-handoff persona.
- `tests/mcp-agent-provider-contract.test.js` - Interface, registry, immutable-shape, policy-schema, and npm package assertions.
- `tests/mcp-claude-code-adapter.test.js` - Detection, path/version, Windows, exact-argv, task/key absence, and static serialization matrix.

## Decisions Made

- Used a retained `command` plus immutable `argvPrefix` so a future verified Windows shim resolver can preserve shell-free execution without changing the provider contract.
- Kept the shipped policy's canonical `name` as reviewed product metadata while excluding it from the inner Claude definition; the serializer produces exactly `{ fsb: { description, prompt, tools, disallowedTools, permissionMode, maxTurns } }`.
- Kept auth state explicitly `unknown`; subscription/keychain corroboration remains a milestone-end live UAT item and is not inferred or fabricated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rejected an unterminated UTF-16 high surrogate correctly**
- **Found during:** Task 2 focused profile tests
- **Issue:** The first well-formed-text check compared `NaN` from a missing low surrogate with numeric ranges, allowing one invalid task string through validation.
- **Fix:** Rewrote the condition as a positive low-surrogate range requirement, so missing or invalid pairs fail closed.
- **Files modified:** `mcp/src/agent-providers/claude-profile.ts`
- **Verification:** The explicit lone-surrogate test and complete Task 2 gate pass.
- **Committed in:** `78c83b3e`

**2. [Rule 3 - Blocking] Scoped npm dry-run packaging to the MCP package directory**
- **Found during:** Task 3 package-content verification
- **Issue:** With the installed npm version, `npm --prefix mcp pack` produced a dry-run listing for the workspace root package rather than `fsb-mcp-server`.
- **Fix:** The test invokes argv-only `npm pack --dry-run --json` with `cwd` set to `mcp/` and a temporary pack destination, then verifies no workspace archive appears.
- **Files modified:** `tests/mcp-agent-provider-contract.test.js`
- **Verification:** The dry-run listing contains `ai/agents/fsb.json`; both focused tests pass and no `.tgz` is created in `mcp/`.
- **Committed in:** `3fa0d4d1`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking issue)
**Impact on plan:** Both changes strengthened the required fail-closed validation and package evidence without expanding product scope.

## Issues Encountered

- The TypeScript compiler required the frozen single-tool array to retain tuple typing; adding a const tuple annotation preserved the exact schema with no runtime change.

## Known Stubs

None. `authState: unknown` is the locked non-inference contract, not a placeholder; live authentication corroboration remains explicitly deferred to the milestone-end UAT gate.

## User Setup Required

None - no external service configuration or authenticated CLI run is required for this plan.

## Verification

- `npm --prefix mcp run build` - passed
- `node tests/mcp-agent-provider-contract.test.js` - passed
- `node tests/mcp-claude-code-adapter.test.js` - passed
- `node tests/agent-provider-forbidden-flags.test.js` - passed
- No live/authenticated Claude invocation, model call, browser action, or OS process-tree UAT was run.

## Next Phase Readiness

- Plan 60-02 can compose the concrete adapter and strict JSONL parser against the frozen contract/profile.
- Plan 60-03 can bind the retained child abstraction to private runtime state and verified process-tree termination.
- Effective 2.1.177 setting/tool/MCP isolation remains honestly pending for the single milestone-end live UAT gate.

## Self-Check: PASSED

- All seven implementation/test artifacts and this summary exist.
- Task commits `7ee3b7e4`, `78c83b3e`, and `3fa0d4d1` are present.

---
*Phase: 60-adapter-contract-claude-code-mvp*
*Completed: 2026-07-14*
