---
phase: 62-ci-drift-smoke-gate-doctor-extensions
verified: 2026-07-16T22:34:59Z
status: human_needed
score: 18/18 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Installed Claude, local doctor, and genuine stream corroboration"
    expected: "Doctor text/JSON agree on safe adapter and secret-age facts; installed-version classifications match the closed model; one genuine sanitized stream matches the required raw fields and provider-native/normalized sequences without relabeling fixture provenance."
    why_human: "Requires the user's installed authenticated CLI, local daemon/extension environment, and human review of sanitized live evidence."
  - test: "Rendered compatibility hierarchy, themes, and responsive layouts"
    expected: "Supported, Degraded, and Unsupported remain distinct and separate from other provider facts across themes and widths, with correct wrapping/dividers and no API-row compatibility UI or overflow."
    why_human: "Pixel hierarchy, real font/layout behavior, themes, and platform rendering require a live browser and human visual judgment."
  - test: "Keyboard, assistive feedback, focus, and live refresh behavior"
    expected: "Native radio navigation, descriptions, focus retention, one shared live-region announcement, forced colors, reduced motion, and fail-closed live refresh all work without mutating provider intent or form state."
    why_human: "Browser-native focus, screen-reader output, OS accessibility modes, and live daemon transitions cannot be established by source/VM assertions alone."
---

# Phase 62: CI Drift-Smoke Gate & Doctor Extensions Verification Report

**Phase Goal:** An `fsb-mcp-server doctor` operator and CI both catch adapter drift when an agent CLI changes flags or event shape, while one daemon-owned compatibility matrix drives safe `supported` / `degraded` / `unsupported` extension states without extension-side version policy.
**Verified:** 2026-07-16T22:34:59Z
**Status:** human_needed
**Re-verification:** No — initial goal-backward verification
**Implementation HEAD:** `4e59c5ac`

## Goal Achievement

### Observable Truths

The four ROADMAP success criteria are fully represented by the merged PLAN truths below; equivalent wording was deduplicated rather than scored twice.

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | One daemon-owned, versioned, deeply frozen matrix is the sole shipped compatibility-policy authority. | ✓ VERIFIED | `mcp/src/agent-providers/compatibility.ts:307-335` defines and validates the only shipped matrix; detector/profile/doctor/serve consumers import it. The phase contract rejects extension version policy and duplicate shipped rows. |
| 2 | Inclusive fixture-tested versions are supported, newer same-major versions are degraded/start-eligible, and invalid or incompatible evidence fails closed. | ✓ VERIFIED | `classifyAdapterCompatibility` at `compatibility.ts:395-458` implements the closed result families; `claude-detect.ts:304-321` consumes that result. Boundary, hostile-input, and wrong-major coverage is present in `mcp-adapter-compatibility` and drift-smoke tests. |
| 3 | The generalized offline drift smoke uses the production registry/parser and is the exact CI gate, with no live CLI requirement or fixture relabeling. | ✓ VERIFIED | `tests/mcp-agent-drift-smoke.test.js:208-337` enumerates `registry.ids()`, calls each registered adapter's `parseEvents`, verifies raw fields/native and normalized sequences, and exercises negative drift cases. `.github/workflows/ci.yml:50-51` invokes the exact script; the manifest remains `schema-derived-contract` / `liveCapturePending: true`. |
| 4 | Doctor reports compatibility, adapter detection, and safe bridge-auth metadata from one local snapshot in both text and JSON. | ✓ VERIFIED | `mcp/src/diagnostics.ts:669-712` collects one snapshot containing the canonical matrix, adapter rows, and projected auth metadata; `mcp/src/index.ts:216-256,400-412` renders or serializes that same object. |
| 5 | Claude auth is always machine value `unknown` and visible text `Not reported`, with no config/environment inference. | ✓ VERIFIED | `diagnostics.ts:207-306` hard-bounds doctor rows and emits `authState: 'unknown'`; `index.ts:247` prints `Auth: Not reported`. Tests inject auth-looking canaries and assert non-leakage. |
| 6 | Doctor remains useful offline and preserves established diagnostic-layer and exit semantics. | ✓ VERIFIED | Adapter/auth collection happens before bridge attachment in `collectBridgeDiagnostics`; `runDoctor` retains the historical healthy/non-healthy exit mapping. Offline, detector-throw, auth-reader-throw, clock, path, and prototype cases are covered. |
| 7 | Compatibility uses one separately authenticated, exact-empty-payload read-only request and does not alter delegation/process authority. | ✓ VERIFIED | `serve-delegation.ts:237-248` routes `adapter.compatibility` after the established authenticated request boundary and validates `{}`; `mcp-bridge-client.js:687-696` requires paired state and sends the exact method/payload with a five-second timeout. |
| 8 | Background is the exact-shape validator, freshness authority, durable writer, and UI fan-out owner. | ✓ VERIFIED | `mcp-agent-providers.js:130-178,366-373,399-429` validates, serializes, and projects freshness; `background.js:244-274` validates the response, awaits `replaceCompatibility`, then reads merged clients. |
| 9 | Cached boot/manual refresh paths are bounded and fail closed without manufacturing support or mutating unrelated provider evidence. | ✓ VERIFIED | Background coalesces one in-flight refresh and returns only `refreshed`, `stale`, or `unavailable`; stale support becomes `degraded/evidence_stale`. Storage/background/UI regression tests cover rejected writes, malformed caches, concurrency generations, and preservation of selection/recommendation/forms. |
| 10 | Typed provider drift reaches the authoritative terminal with only safe `adapterId`, `expected`, and `observed` labels. | ✓ VERIFIED | `spawn-supervisor.ts:83-124,578-630` exhaustively maps typed parser reasons and emits the closed three-key detail before generic normalization. Sentinel tests exclude raw provider/parser/error/task/session/path/version/secret content. |
| 11 | Background recognizes a valid authoritative drift terminal at most once per delegation without affecting settlement. | ✓ VERIFIED | `background.js:1713-1753,1766-1808` validates the terminal, maintains a 512-entry FIFO seen set, reports once, and independently continues controller settlement even if reporting is missing or throws. |
| 12 | The drift reporter admits at most one event per adapter per ten seconds before calling `rateLimitedWarn`. | ✓ VERIFIED | `agent-protocol-drift-diagnostics.js:136-179` checks the 10,000 ms bucket before invoking the sink; focused tests pass at t=0, below-boundary, exact-boundary, repeat, rollback, hostile input, and missing/throwing sinks. |
| 13 | Every agent row, and no API row, renders exactly one separate three-state Compatibility group with approved copy/icons. | ✓ VERIFIED | `providers-panel.js:27-49,288-327` owns the closed display models. `control_panel.html:168-218` has exactly three agent compatibility groups/descriptions; the seven API rows have none. |
| 14 | Compatibility rendering and refresh are observational and cannot change selection, recommendation, preflight authority, forms, persistence, or focus. | ✓ VERIFIED | UI consumes only background-projected merged rows; text-only rendering and generation ordering live in `options.js`. Stock VM snapshots cover row order, checked/focused controls, provider fields, dirty state, writes, recommendation, auth/billing, and overlapping refresh schedules. |
| 15 | Descriptions, selected details, announcements, themes, forced colors, reduced motion, and responsive source contracts implement the approved UI specification without a fourth state. | ✓ VERIFIED | Stable `aria-describedby` nodes and selected Compatibility/Account facts are in `control_panel.html`; semantic/responsive rules are in `options.css:5931-6000,6247-6373`. Terminal UI source audit scored 24/24 with zero actionable findings. |
| 16 | The serial root suite invokes every new Phase 62 gate exactly once and uses the same direct drift harness as CI. | ✓ VERIFIED | `package.json` contains each new script once after the MCP build boundary; CI and root both use exactly `node tests/mcp-agent-drift-smoke.test.js`. The guarded full-suite runner is not nested in the root chain. |
| 17 | One executable phase contract pins all 17 task IDs, DRIFT-01..04, T62-01..08, schemas, source links, forbidden authorities, and preserved Phase 59-61 interfaces. | ✓ VERIFIED | `node tests/delegation-phase-contract.test.js` passes 763/0 and verifies the five adapter methods, five production transport errors, provider rosters, safe projections, root/CI wiring, and negative authority guards. |
| 18 | Genuine installed-CLI, rendered-browser, and accessibility evidence remains pending and is not promoted from synthetic tests. | ✓ VERIFIED | `62-HUMAN-UAT.md` contains exactly three unchecked `human_needed` / `pending` / empty-evidence scenarios. Its SHA-256 remained `b6895278f76c6c280e9bf727b7739cb3ad19dd5de91eef4c614d2c6d5acad00f` throughout verification. |

**Score:** 18/18 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `mcp/src/agent-providers/compatibility.ts` | Canonical matrix/classifier/safe projection | ✓ EXISTS + SUBSTANTIVE + WIRED | Exact bounded validators, frozen Claude row, closed classifier, safe snapshot creator; imported by production consumers. |
| `tests/mcp-agent-drift-smoke.test.js` | Registry-driven production-parser drift gate | ✓ EXISTS + SUBSTANTIVE + WIRED | Positive fixture and deterministic negative cases; invoked directly by CI and root. |
| `.github/workflows/ci.yml` | Named Phase 62 CI step | ✓ EXISTS + WIRED | One exact named step and direct script invocation. |
| `mcp/src/diagnostics.ts` | Offline doctor snapshot | ✓ EXISTS + SUBSTANTIVE + WIRED | Production registry/detector, canonical classifier, immediate three-field auth projection. |
| `tests/mcp-diagnostics-status.test.js` | Doctor/offline/security coverage | ✓ EXISTS + SUBSTANTIVE + WIRED | Snapshot, text/JSON, failure, prototype, timestamp, and canary coverage; executed after MCP build in the guarded suite. |
| `mcp/src/index.ts` | Doctor text/JSON projections | ✓ EXISTS + SUBSTANTIVE + WIRED | `runDoctor` collects once and chooses formatter or JSON serialization. |
| `mcp/src/agent-providers/serve-delegation.ts` | Authenticated compatibility route | ✓ EXISTS + SUBSTANTIVE + WIRED | Exact empty payload, production detection, canonical safe response. |
| `extension/utils/mcp-agent-providers.js` | Durable validation/freshness/merge | ✓ EXISTS + SUBSTANTIVE + WIRED | Exact schema, serialized write, one-way stale downgrade, agent-only projection. |
| `extension/background.js` | Sole refresh/fan-out and drift-final owner | ✓ EXISTS + SUBSTANTIVE + WIRED | Calls the narrow bridge wrapper rather than duplicating the method literal; awaits durable replacement before merged rows. The PLAN's literal `contains: adapter.compatibility` check is therefore a metadata false negative, not missing behavior. |
| `mcp/src/agent-providers/spawn-supervisor.ts` | Sanitized drift terminal detail | ✓ EXISTS + SUBSTANTIVE + WIRED | Typed reason map, closed fallback, and existing settlement/cleanup integration. |
| `extension/utils/agent-protocol-drift-diagnostics.js` | Exact validator and pre-throttled reporter | ✓ EXISTS + SUBSTANTIVE + WIRED | Three-key validation, 10-second admission, fixed diagnostics sink call. |
| `extension/ui/providers-panel.js` | Pure fail-closed UI mapper | ✓ EXISTS + SUBSTANTIVE + WIRED | Three constant-owned models; no version comparison or caller-controlled copy/classes. |
| `extension/ui/control_panel.html` | Agent-only compatibility DOM/a11y | ✓ EXISTS + SUBSTANTIVE + WIRED | Three groups, stable descriptions, selected Compatibility and Account/Auth facts. |
| `extension/ui/options.css` | Semantic/responsive compatibility styling | ✓ EXISTS + SUBSTANTIVE + WIRED | Semantic tokens, wide/medium/narrow layout, forced colors, reduced motion. |
| `tests/providers-panel-ui.test.js` | UI/source/no-mutation contracts | ✓ EXISTS + SUBSTANTIVE + WIRED | DOM, source, announcement, concurrency, identity-snapshot, CSS/a11y contracts. |
| `package.json` | Exact-once serial Phase 62 gates | ✓ EXISTS + WIRED | Three new scripts exactly once; one MCP build boundary; direct CI-equivalent drift command. |
| `tests/delegation-phase-contract.test.js` | Complete phase/security/source contract | ✓ EXISTS + SUBSTANTIVE + WIRED | 763 passing assertions at verification time. |
| `62-HUMAN-UAT.md` | Honest milestone-end ledger | ✓ EXISTS + SUBSTANTIVE + WIRED | Exactly UAT62-01..03, all unchecked/pending/evidence-empty. |

**Artifacts:** 18/18 verified

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| Claude detector/profile | Canonical compatibility module | Imported classifier and profile row | ✓ WIRED | No detector/profile-owned shipped range remains. |
| Production registry + fixtures | Production `parseEvents` | Generalized drift-smoke loop | ✓ WIRED | Registry/matrix/manifest bijection precedes replay and negative controls. |
| CI and root suite | One drift script | Exact direct command | ✓ WIRED | No wrapper, alternate parser, or live CLI path. |
| Doctor collection | Compatibility + bridge-auth authorities | Canonical imports and immediate allowlist projection | ✓ WIRED | Local path/version remains doctor-only; private state does not cross. |
| `runDoctor` | One collected snapshot | Formatter or JSON serialization | ✓ WIRED | No recollection or formatter-side classification. |
| Serve daemon | Extension bridge wrapper | Authenticated `adapter.compatibility` / `{}` | ✓ WIRED | Read-only safe response, paired-only request, bounded timeout. |
| Background | Provider storage helper | Validate → durable replace → merge/fan-out | ✓ WIRED | Rejected writes cannot expose new support. |
| Production parser error | Supervisor terminal | Typed `AgentProtocolDriftError` mapping | ✓ WIRED | Closed labels only; no success after drift. |
| Authoritative final | Reporter → existing diagnostics sink | Exact-once FIFO and pre-throttle | ✓ WIRED | Duplicate finals and sub-10-second events do not add ring entries. |
| Background merged rows | Pure UI mapper → DOM/CSS | Existing runtime message and render path | ✓ WIRED | UI has no direct daemon, doctor, binary, process, or version authority. |
| Phase contract | Source, CI/root, and UAT ledger | Executable source assertions | ✓ WIRED | All 17 task IDs, four requirements, eight threats, and pending-evidence rules pinned. |

**Wiring:** 19/19 PLAN key links verified (grouped above)

### Data-Flow Trace (Level 4)

| Flow | Source | Boundary chain | Produces real bounded data | Status |
|---|---|---|---|---|
| Offline drift gate | Committed manifest + sanitized JSONL | Registry → registered production parser → exact CI/root command | Yes; raw required fields, native sequence, normalized sequence, terminal count, and negative failures are asserted | ✓ FLOWING |
| Local doctor | Production detector + private bridge-auth reader | Canonical classifier → one doctor snapshot → text or JSON | Yes; path/version remain local and auth is immediately reduced to presence/rotation metadata | ✓ FLOWING |
| Browser compatibility | Production detector/classifier | Safe snapshot → authenticated bridge → background validator → durable envelope → merged agent row → pure mapper/DOM | Yes; only schema/time/id/label/status/reason crosses, with stale support downgraded | ✓ FLOWING |
| Runtime drift diagnostics | Typed production-parser failure | Supervisor safe terminal → authoritative final dedupe → exact validator → 10-second pre-throttle → existing redacted ring sink | Yes; only the three closed labels reach the sink | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command / evidence | Result | Status |
|---|---|---|---|
| Production-parser offline drift gate | `node tests/mcp-agent-drift-smoke.test.js` | PASS; provenance remained pending | ✓ PASS |
| Exact drift detail and true pre-throttle | `node tests/agent-protocol-drift-diagnostics.test.js` | All assertions passed | ✓ PASS |
| Pure fail-closed Providers mapping | `node tests/providers-panel-logic.test.js` | PASS | ✓ PASS |
| Phase ownership/security/interface contract | `node tests/delegation-phase-contract.test.js` | 763 passed / 0 failed | ✓ PASS |
| Current TypeScript source | `./mcp/node_modules/.bin/tsc -p mcp/tsconfig.json --noEmit` | Exit 0 | ✓ PASS |
| Complete serial repository integration | Guarded `node scripts/run-phase60-full-tests.mjs` at current source boundary | Exit 0; `[phase60-full-tests] PASS`; protected hashes/worktree preserved | ✓ PASS |

**Generated-artifact note:** A direct `node tests/mcp-diagnostics-status.test.js` invocation without its mandatory preceding MCP build loaded the intentionally restored, user-owned `mcp/build/index.js` and exited 1 with 26 formatter mismatches. That invocation is not the PLAN gate. The required build-plus-test path ran inside the guarded full suite and passed before the wrapper restored the protected generated bundle; current TypeScript source also passes `--noEmit`. No protected generated file was modified by this verification.

## Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|---|---|---|---|
| DRIFT-01 | 62-01, 62-06 | ✓ SATISFIED | Registry/matrix/fixture bijection, production-parser replay, raw init/result fields, native/normalized sequences, deterministic drift negatives, version bounds, exact CI/root wiring. |
| DRIFT-02 | 62-02, 62-06 | ✓ SATISFIED | Existing doctor emits bounded per-adapter path/version/status/reason/profile/auth plus exactly three safe shared-secret rotation metadata fields from one offline-capable snapshot. |
| DRIFT-03 | 62-04, 62-06 | ✓ SATISFIED | Safe `agent_protocol_drift` detail, exact-once final reporting, bounded 512-ID dedupe, and pre-sink 10-second per-adapter admission. |
| DRIFT-04 | 62-01, 62-02, 62-03, 62-05, 62-06 | ✓ SATISFIED | Canonical machine-readable matrix feeds CI and doctor; authenticated safe projection is validated/durable/freshness-aware and renders the exact three states without extension version policy. |

**Coverage:** 4/4 requirements satisfied; no orphaned Phase 62 requirements

## Anti-Patterns Found

No blocking or warning anti-pattern was found in the 34-file Phase 62 review scope. The terminal code review is clean (0 critical / 0 warning / 0 info), the security register has 8/8 threats closed, and the source-only UI audit is 24/24. A targeted debt-marker scan found no `TBD`, `FIXME`, or `XXX`; `placeholder` matches were ordinary form attributes or established non-Phase-62 UI states, not stubs.

## Disconfirmation Pass and Verification Limits

- **Partially human-verifiable requirement surface:** DRIFT-02/04 implementation is complete in source and automation, but the installed CLI/path/version and live daemon/browser corroboration requires UAT62-01.
- **Test limitation:** the DOM/VM/source suites prove structure, exact copy, no explicit focus mutation, state invariants, and CSS contracts; they cannot prove real Chrome layout, native radio behavior, spoken screen-reader output, forced-color rendering, or perceived hierarchy. Those remain UAT62-02/03 rather than being mislabeled automated passes.
- **External/live error path:** genuine Claude event-shape compatibility and online/offline refresh behavior depend on the user's installed CLI and paired runtime. Automation uses an honestly labeled schema-derived fixture and fail-closed synthetic cases; UAT62-01 keeps genuine-stream comparison pending.

These are expected human-evidence boundaries, not implementation gaps.

## Human Verification Required

### 1. Installed Claude, local doctor, and genuine stream corroboration

**Test:** Perform UAT62-01 at the milestone-end sweep using the installed authenticated Claude CLI, doctor text/JSON, paired extension as applicable, and one sanitized benign live stream.
**Expected:** Doctor views agree without private-data leakage; classifications match the closed model; required raw fields and provider-native/normalized sequences match the contract fixture while fixture provenance stays pending until reviewed.
**Why human:** Requires a real installed CLI/environment and judgment over sanitized evidence.

### 2. Rendered compatibility hierarchy, themes, and responsive layouts

**Test:** Perform UAT62-02 in live Chrome across light/dark, desktop/compact, 641-899 px, and at-most-640 px layouts with all three states.
**Expected:** State hierarchy, wrapping, dividers, selected details, icon/text cues, API-row absence, and no-overflow behavior match the UI contract.
**Why human:** Real rendering and visual hierarchy cannot be established from source/VM checks alone.

### 3. Keyboard, assistive feedback, focus, and live refresh behavior

**Test:** Perform UAT62-03 with keyboard, screen reader, forced colors, reduced motion, and controlled live fresh/stale/corrupt/absent/failure transitions.
**Expected:** Native navigation/descriptions, focus retention, single announcements, fail-closed status, and all provider/form/recommendation invariants hold.
**Why human:** Requires browser-native interaction, assistive technology, OS modes, and live runtime transitions.

All three checks are explicitly deferred by the user to the milestone-end sweep. They remain unchecked, `human_needed`, `pending`, and evidence-empty.

## Gaps Summary

**No automated or source gaps found.** The Phase 62 goal is implemented, all 18 merged must-haves and all four DRIFT requirements are verified, all planned key links are wired, the guarded repository suite is green, and terminal code/security/UI reviews contain no actionable finding.

Overall status remains **human_needed** because the three authorized milestone-end UAT scenarios have not been performed. This status preserves evidence honesty; it does not identify a code blocker or require a gap-closure plan.

## Verification Metadata

**Verification approach:** Goal-backward, initial verification against ROADMAP success criteria plus all six PLAN frontmatter contracts
**Must-haves source:** ROADMAP success criteria merged and deduplicated with 62-01 through 62-06 PLAN truths
**Artifact checks:** 18/18 behaviorally verified; all 19 planned key links verified
**Requirements:** 4/4 satisfied; 0 orphaned
**Automated/source gates:** Current source type-check, focused spot checks, 763-assertion phase contract, and guarded full repository suite passed
**Reviews:** Code review clean; security 8/8 threats closed; UI source audit 24/24
**Human checks required:** 3, all deferred to milestone end
**UAT mutation:** None; ledger hash unchanged

---

_Verified: 2026-07-16T22:34:59Z_
_Verifier: the agent (gsd-verifier)_
