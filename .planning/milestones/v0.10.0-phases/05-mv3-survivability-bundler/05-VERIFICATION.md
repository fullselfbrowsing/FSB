---
phase: 05-mv3-survivability-bundler
verified: 2026-05-24T21:00:00Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
deferred:
  - truth: "Manual MV3 sanity reload UAT (Phase 1 carryforward)"
    addressed_in: "Milestone-end UAT"
    evidence: "Per user directive: only Phase 1 MV3 UAT carries forward as deferred item; Phase 5 introduces zero new UAT items beyond what Phase 1 already deferred (Option B carryforward ends with Phase 5 shipping the offscreen Lattice host)"
human_verification:
  - test: "Load unpacked extension into Chrome MV3 + open offscreen lattice-host page"
    expected: "Offscreen iframe boots; console shows '[FSB lattice-host] boot: Plan 05-04 offscreen Lattice host loaded'; createNoopSurvivabilityAdapter pre-warm logs; ephemeral signer + hook pipeline ready log emitted; no errors. SW + sidepanel still function identically to Phase 4 baseline."
    why_human: "MV3 offscreen documents only load inside Chrome's extension runtime; cannot be validated via Node smoke. Deferred per user directive (Phase 1 MV3 UAT carryforward applies; Phase 5 introduces no new UAT)."
---

# Phase 5: MV3-Survivability Adapter + Bundler + Hybrid Offscreen Lattice Host Verification Report

**Phase Goal:** Hybrid offscreen Lattice host + esbuild bundler infra + Lattice SurvivabilityAdapter contract + FSB standalone runtime adapter. SW classic-to-module migration EXPLICITLY DEFERRED. CONSERVATIVE recovery wiring EXPLICITLY OUT OF SCOPE. background.js + agent-loop.js BYTE-FROZEN.

**Verified:** 2026-05-24T21:00:00Z
**Status:** human_needed (8/8 automated must-haves PASS; 1 deferred UAT item)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Lattice vitest 414 PASS (397 baseline + 17 new survivability) | VERIFIED | `Test Files 39 passed (39) / Tests 414 passed (414)` confirmed via `cd lattice && pnpm --filter lattice test` |
| 2 | FSB chain green; survivability smoke 40 PASS | VERIFIED | `passed: 40 / failed: 0` from `node tests/lattice-survivability-smoke.test.js`; Phase 1-4 smokes 29+39+72+47 all PASS |
| 3 | `extension/dist/` produced by `npm run build` | VERIFIED | `extension/dist/offscreen/lattice-host.js` + `.js.map` + `stt.js` + `stt.js.map` + `content/canvas-interceptor.js` all present |
| 4 | Offscreen lattice-host.html + lattice-host.js exist; manifest.json WAR entry | VERIFIED | `extension/offscreen/lattice-host.html` (37 lines), `extension/offscreen/lattice-host.js` (230 lines); `grep -c "offscreen/lattice-host.html" extension/manifest.json` = 1 |
| 5 | Feature flag default-off; agent-loop.js + background.js byte-frozen | VERIFIED | `FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` grep = 5 occurrences (JSDoc + uniform check + log); `setTimeout` count in agent-loop.js = 8 (INV-04); git diff HEAD~6..HEAD for background.js + agent-loop.js + tool-definitions.js = empty |
| 6 | audit-doc MV3-survivability rows flipped to Covered | VERIFIED | `grep -c "Phase 5 (FSB v0.10.0-attempt-2)" lattice/docs/fsb-integration-gaps.md` = 2 (matches the 2 MV3-survivability rows flipped per Plan 05-03 Task 2) |
| 7 | LATTICE-PIN bumped to `e95067bf...` with Phase 5 row | VERIFIED | `current_lattice_sha: e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` in LATTICE-PIN.md frontmatter; matches `cd lattice && git rev-parse fsb-integration-experiments`; per-phase log has 5 rows (Phase 1-5) |
| 8 | REQUIREMENTS.md LSDK-19..22 + FINT-03..06 populated | VERIFIED | All 8 REQ-IDs marked Complete in REQUIREMENTS.md with commit SHAs (a4609bc, 109d6ae, e95067b, fbbe02d5, 8ab0c6df, e1d9f491); total v1 count bumped 21 → 29 |

**Score:** 8/8 truths verified

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Manual MV3 sanity reload (load unpacked extension; verify offscreen host boots) | Milestone-end UAT | Per user directive: "only Phase 1 MV3 UAT carries forward as deferred item"; Phase 1 already deferred this manual reload to milestone-end UAT; Phase 5 introduces zero new UAT items |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `esbuild.config.js` | Per-entrypoint bundler config; min 80 lines; emits extension/dist/ | VERIFIED | 147 lines; ENTRIES array w/ 3 entries (offscreen-stt, offscreen-lattice-host, content-canvas-interceptor); OUT_ROOT = extension/dist; node:* externals added (Deviation Rule 3) |
| `lattice/packages/lattice/src/runtime/survivability.ts` | SurvivabilityAdapter interface + 4 supporting types + createNoopSurvivabilityAdapter; min 150 lines | VERIFIED | 244 lines; all 7 exports present; ResumePolicy 4-member literal-union; CD-E taxonomy honored |
| `lattice/packages/lattice/src/runtime/survivability.test.ts` | 12-15 vitest cases | VERIFIED | 265 lines; 17 cases (5 over min); real Lattice primitives (no mocks); Test 11+12 DSSE+JCS round-trip with ephemeral Ed25519 |
| `lattice/packages/lattice/src/index.ts` | Re-export createNoopSurvivabilityAdapter + 5 types from ./runtime/survivability.js | VERIFIED | grep matches present; bare-specifier reachability confirmed via dist/index.js (createNoopSurvivabilityAdapter count = 2 in dist) |
| `lattice/docs/fsb-integration-gaps.md` | 2 MV3-survivability rows flipped Blocker → Covered | VERIFIED | 2 "Phase 5 (FSB v0.10.0-attempt-2)" markers; Phase 1-4 row counts preserved |
| `extension/offscreen/lattice-host.html` | <script type="module"> declaring lattice-host.js; min 10 lines | VERIFIED | 37 lines; module script tag + src reference + WAR-bound documentation comment |
| `extension/offscreen/lattice-host.js` | ESM module importing from 'lattice'; createCheckpointHook; min 110 lines | VERIFIED | 230 lines; 7 imports from 'lattice' bare specifier; sender.id origin check; pipeline + checkpoint composition |
| `extension/dist/offscreen/lattice-host.js` | Bundled ESM with bare specifier rewritten | VERIFIED | 0 `from "lattice"` references (esbuild rewrote); createCheckpointHook inlined |
| `extension/manifest.json` | WAR entry for offscreen/lattice-host.html | VERIFIED | 1 occurrence in WAR resources array; manifest_version=3 + offscreen permission + bg sw all preserved |
| `extension/ai/lattice-runtime-adapter.js` | Standalone SurvivabilityAdapter over chrome.storage.session; feature-flag gated; min 150 lines | VERIFIED | 272 lines; 4 contract methods + fireEvictionHooks; FSB_LATTICE_RUNTIME_ADAPTER_ENABLED count = 5; ResumePolicy 4-member dispatch |
| `tests/lattice-survivability-smoke.test.js` | Real-runtime ≥25 PASS; min 200 lines | VERIFIED | 292 lines; 40 PASS / 0 FAIL; real createReceipt + verifyReceipt + ephemeral Ed25519; chrome.storage.session mock in-memory |
| `package.json` | scripts.test extended with lattice-survivability-smoke as final entry | VERIFIED | Chain order Phase 1-5 preserved; survivability-smoke is final entry; esbuild ^0.24.0 in devDependencies |
| `.gitignore` | extension/dist/ rule added | VERIFIED | grep -c "extension/dist/" = 1 |
| `.planning/LATTICE-PIN.md` | Phase 5 SHA bump + Phase 5 row | VERIFIED | current_lattice_sha = e95067bfa87ed1b75838fc3b3ef217a3b01acbd3; 5 phase rows |
| `.planning/REQUIREMENTS.md` | LSDK-19..22 + FINT-03..06 entries + 8 traceability rows; total = 29 | VERIFIED | All 8 REQ-IDs present (2 occurrences each: 1 section + 1 traceability); count line reads "29 concrete so far" |

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `package.json scripts.build` | `esbuild.config.js` | `node esbuild.config.js` invocation | WIRED |
| `esbuild.config.js` ENTRIES | `extension/dist/offscreen/lattice-host.js` | bundler emit | WIRED (bundle exists; bare specifier rewritten) |
| `extension/offscreen/lattice-host.html` | `extension/offscreen/lattice-host.js` | `<script type="module" src="lattice-host.js">` | WIRED |
| `extension/offscreen/lattice-host.js` | `'lattice'` bare specifier | import statement | WIRED (esbuild rewrites at build time; dist verified) |
| `extension/manifest.json` web_accessible_resources | `extension/offscreen/lattice-host.html` | resources array entry | WIRED |
| `extension/ai/lattice-runtime-adapter.js` | `globalThis.chrome.storage.session` | persist() helper | WIRED (smoke Part 4 exercises chrome.storage.session writes) |
| `extension/ai/lattice-runtime-adapter.js` | `globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` | uniform feature-flag check | WIRED (smoke Part 4 verifies default-off + flag-on transitions) |
| `tests/lattice-survivability-smoke.test.js` | `'lattice'` bare specifier | `await import('lattice')` | WIRED (40 PASS smoke exercises end-to-end) |
| `tests/lattice-survivability-smoke.test.js` | `extension/ai/lattice-runtime-adapter.js` | `require('../extension/ai/lattice-runtime-adapter.js')` | WIRED |
| `lattice/packages/lattice/src/index.ts` | `lattice/packages/lattice/src/runtime/survivability.ts` | `export { createNoopSurvivabilityAdapter } from "./runtime/survivability.js"` | WIRED |
| `lattice/packages/lattice/dist/index.js` | `lattice/packages/lattice/src/index.ts` | tsdown build | WIRED (grep createNoopSurvivabilityAdapter in dist = 2 occurrences) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `extension/dist/offscreen/lattice-host.js` | `signer`, `pipeline`, message-bus handlers | Real createInMemorySigner + createHookPipeline + Lattice modules inlined via esbuild | Yes (real Ed25519 keypair generated at boot; real hook pipeline; real createCheckpointHook invoked per message) | FLOWING |
| `extension/ai/lattice-runtime-adapter.js` | `chrome.storage.session` writes | Real storage backend gated by feature flag | Yes when flag on (smoke Part 4 verified); zero writes when default-off (intentional) | FLOWING (flag-aware) |
| `tests/lattice-survivability-smoke.test.js` | `verifyResult.ok === true` | Real verifyReceipt over real DSSE-signed ReceiptEnvelope after JSON round-trip through adapter | Yes — verifyReceipt returns ok=true post-serialize/deserialize (Part 3) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Lattice survivability adapter contract reachable | `node tests/lattice-survivability-smoke.test.js` | passed: 40 / failed: 0 | PASS |
| MCP wire parity preserved (INV-01) | `node tests/tool-definitions-parity.test.js` | 142 passed, 0 failed | PASS |
| Phase 1 smoke byte-frozen | `node tests/lattice-smoke.test.js` | passed: 29 / failed: 0 | PASS |
| Phase 2 smoke byte-frozen | `node tests/lattice-tripwire-smoke.test.js` | passed: 39 / failed: 0 | PASS |
| Phase 3 smoke byte-frozen | `node tests/lattice-checkpoint-smoke.test.js` | passed: 72 / failed: 0 | PASS |
| Phase 4 smoke byte-frozen | `node tests/lattice-providers-smoke.test.js` | passed: 47 / failed: 0 | PASS |
| Lattice vitest 414 PASS | `cd lattice && pnpm --filter lattice test` | Test Files 39 passed (39) / Tests 414 passed (414) | PASS |
| INV-04 setTimeout count = 8 | `grep -c "setTimeout" extension/ai/agent-loop.js` | 8 | PASS |
| Lattice HEAD matches LATTICE-PIN | `cd lattice && git rev-parse fsb-integration-experiments` vs frontmatter | Both = e95067bfa87ed1b75838fc3b3ef217a3b01acbd3 | PASS |
| Bare specifier rewritten in dist bundle | `grep -c 'from "lattice"' extension/dist/offscreen/lattice-host.js` | 0 (esbuild successfully rewrote) | PASS |
| Byte-frozen extension files | `git diff HEAD~6 HEAD -- extension/background.js extension/ai/agent-loop.js extension/ai/tool-definitions.js` | empty | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LSDK-19 | 05-02 + 05-03 | SurvivabilityAdapter interface + ResumePolicy + 4 supporting types | SATISFIED | survivability.ts ships interface; Lattice commits a4609bc + 109d6ae + e95067b |
| LSDK-20 | 05-02 | createNoopSurvivabilityAdapter reference impl + 17 vitest cases | SATISFIED | survivability.ts + .test.ts; Lattice vitest 414 PASS |
| LSDK-21 | 05-03 | Public-surface re-export at src/index.ts | SATISFIED | createNoopSurvivabilityAdapter + 5 types re-exported; dist/ contains export |
| LSDK-22 | 05-03 | 2 MV3-survivability audit-doc rows flipped to Covered | SATISFIED | grep count = 2 Phase 5 markers in fsb-integration-gaps.md |
| FINT-03 | 05-01 | esbuild bundler infrastructure | SATISFIED | esbuild.config.js + scripts.build + extension/dist/ + .gitignore |
| FINT-04 | 05-04 | Hybrid offscreen Lattice host | SATISFIED | lattice-host.html + .js + manifest WAR entry + dist bundle 64870 bytes |
| FINT-05 | 05-05 | FSB standalone MV3-survivability adapter | SATISFIED | lattice-runtime-adapter.js 272 lines; feature-flag gated; 4 contract methods |
| FINT-06 | 05-05 | Node-side survivability smoke + ceremony | SATISFIED | lattice-survivability-smoke.test.js 40 PASS; scripts.test chain extended |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | No blocker or warning anti-patterns. Documented stub: `offscreen-lattice-host` was `optional: true` in Plan 05-01 (intentional placeholder; Plan 05-04 removed flag after source landed). All TODOs in lattice-host.js + lattice-runtime-adapter.js are deferred-by-design per D-22 (CONSERVATIVE recovery wiring; LRU enforcement; chrome.storage.local override). |

### Human Verification Required

#### 1. Manual MV3 sanity reload (Phase 1 carryforward, NOT new in Phase 5)

**Test:** Load unpacked extension at `extension/` into Chrome MV3. Open chrome://extensions, click "service worker" link to see SW console. Trigger the offscreen lattice-host page (manual chrome.offscreen.createDocument call or wait for SW to wire it post-feature-flag-flip). Inspect the offscreen page console.

**Expected:**
- `[FSB lattice-host] boot: Plan 05-04 offscreen Lattice host loaded` in console
- `[FSB lattice-host] survivability adapter id: fsb-offscreen-noop kind: survivability-adapter` log
- `[FSB lattice-host] ephemeral signer + hook pipeline ready` log
- `[FSB lattice-host] chrome.runtime.onMessage listener registered for 'lattice-step-transition'` log
- No errors in console
- SW + sidepanel function identically to Phase 4 baseline (no regression in agent loop behavior; default-off feature flag means zero new production path engagement)

**Why human:** MV3 offscreen documents only load inside Chrome's extension runtime; cannot be validated via Node smoke. Per user directive: deferred to milestone-end UAT (Phase 1 MV3 UAT carryforward applies; Phase 5 introduces no NEW UAT items beyond Phase 1's already-deferred reload).

### Gaps Summary

**No gaps found.** All 8 must-haves verified at the codebase level. All 13 behavioral spot-checks passed. All 11 key links wired. All 8 requirements satisfied with commit SHA evidence. INV-01/INV-04/INV-05 trivially preserved (agent-loop.js + background.js + tool-definitions.js BYTE-FROZEN through all 6 Phase 5 plans). Phase 1-4 smokes 29+39+72+47 PASS preserved. Lattice vitest 414/414 PASS (397 baseline + 17 new survivability cases). Bare specifier successfully rewritten in dist bundle (0 unresolved `'lattice'` references). LATTICE-PIN frontmatter SHA matches Lattice HEAD exactly.

**Phase 5 deliverables roster (cumulative):**
- 4 FSB commits on `automation`: fbbe02d5 (Plan 05-01) + 8ab0c6df (Plan 05-04) + e1d9f491 (Plan 05-05) + 3d439c72 (Plan 05-06)
- 3 Lattice commits on `fsb-integration-experiments` (none pushed per D-19): a4609bc (Plan 05-02) + 109d6ae (Plan 05-03 re-export) + e95067b (Plan 05-03 audit-doc)
- All 7 commits carry `Ref: FSB v0.10.0-attempt-2 Phase 5...` footer per D-25

**Single deferred item (per user directive):** Manual MV3 sanity reload (Phase 1 carryforward, not new). Phase 5 is otherwise COMPLETE; the offscreen lattice-host bundle + manifest WAR entry + feature-flag-default-off standalone adapter all sit in production code paths without engaging any production behavior (default-off feature flag + classic SW + 153 importScripts chain BYTE-UNCHANGED). The actual SW-side wiring of the lattice-step-transition bus + CONSERVATIVE recovery dispatcher are EXPLICITLY OUT OF SCOPE per CONTEXT.md D-22 (deferred to follow-on milestone).

---

_Verified: 2026-05-24T21:00:00Z_
_Verifier: Claude (gsd-verifier)_
