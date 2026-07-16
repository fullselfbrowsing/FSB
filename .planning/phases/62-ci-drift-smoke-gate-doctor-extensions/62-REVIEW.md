---
phase: 62-ci-drift-smoke-gate-doctor-extensions
reviewed: 2026-07-16T20:37:08Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - .github/workflows/ci.yml
  - extension/background.js
  - extension/ui/control_panel.html
  - extension/ui/options.css
  - extension/ui/options.js
  - extension/ui/providers-panel.js
  - extension/utils/agent-protocol-drift-diagnostics.js
  - extension/utils/mcp-agent-providers.js
  - extension/ws/mcp-bridge-client.js
  - mcp/src/agent-providers/claude-detect.ts
  - mcp/src/agent-providers/claude-profile.ts
  - mcp/src/agent-providers/compatibility.ts
  - mcp/src/agent-providers/serve-delegation.ts
  - mcp/src/agent-providers/spawn-supervisor.ts
  - mcp/src/diagnostics.ts
  - mcp/src/index.ts
  - package.json
  - tests/agent-protocol-drift-diagnostics.test.js
  - tests/delegation-phase-contract.test.js
  - tests/mcp-adapter-compatibility.test.js
  - tests/mcp-agent-drift-smoke.test.js
  - tests/mcp-agent-providers-storage.test.js
  - tests/mcp-bridge-background-dispatch.test.js
  - tests/mcp-bridge-client-lifecycle.test.js
  - tests/mcp-bridge-topology.test.js
  - tests/mcp-claude-code-adapter.test.js
  - tests/mcp-client-identity-integration.test.js
  - tests/mcp-client-merged-view.test.js
  - tests/mcp-diagnostics-status.test.js
  - tests/mcp-reverse-channel-contract.test.js
  - tests/mcp-spawn-supervisor.test.js
  - tests/mcp-version-parity.test.js
  - tests/providers-panel-logic.test.js
  - tests/providers-panel-ui.test.js
findings:
  critical: 0
  warning: 4
  info: 0
  total: 4
status: issues_found
---

# Phase 62 Code Review — Fix Re-review

## Summary

The original CR-01 and WR-01 through WR-04 defects are semantically resolved at `98727bf35f01bf0b713ddf3f930c6a0a5fc8054f`: cache reads and live refreshes no longer form an unbounded daemon/write loop, stale failure projections agree with their badges and copy, an open panel ages supported evidence at the exact boundary, doctor clocks are bounded to the ECMAScript Date domain, and compatibility has one shared live-region owner.

The fix series introduces or leaves three narrower composition defects, and its executable security contract still encodes the pre-fix source shape. A successful manual refresh is immediately overwritten by its own queued cache hydration; the expiry timer re-enters the full provider-inventory/recommendation path; and compatibility snapshots are projected only when some unrelated provider-evidence map has already created the agent row. These are correctness and robustness warnings, so the phase is not code-review clean yet.

The review covered the original 34-file Phase 62 scope plus fix commits `3154bda4`, `de67907b`, `7b28ab5b`, `d77bf2ce`, `c7dee1c6`, and report commit `98727bf3`. Live UAT remains deferred to the milestone-end sweep as requested.

## Original Finding Disposition

| Original finding | Disposition at HEAD |
|---|---|
| CR-01 — recursive compatibility refresh | **Resolved as originally reported.** `getMcpClients` is cache-only, `refreshMcpCompatibility` is the exact explicit live route, and storage fan-out cannot start another daemon request or durable compatibility write. WR-01 below is a bounded post-refresh state/announcement regression, not the original unbounded feedback loop. |
| WR-01 — stale outcome contradicts badge/copy | **Resolved.** Failed live refreshes project retained fresh support to `degraded/evidence_stale`; already degraded and unsupported states retain truthful closed projections and announcements. |
| WR-02 — open panel never ages Supported | **Resolved as originally reported.** Fresh supported evidence schedules one cache-only boundary re-projection, and the freshness comparison now downgrades at `>= 15 minutes`. WR-02 below concerns the timer's unrelated side effects, not failure to age the badge. |
| WR-03 — out-of-Date-domain clock crashes doctor | **Resolved.** `readNowMs()` accepts only `0..8_640_000_000_000_000`, so ISO formatting remains in range. |
| WR-04 — duplicate compatibility live-region owner | **Resolved.** `#agentProviderDetails` is no longer live; compatibility feedback remains owned by `#providerEvidenceAnnouncement`, with the separate pairing status retaining its independent role. |

## Critical Findings

None.

## Warning Findings

### WR-01 — A successful manual refresh is erased by its own storage fan-out

**Severity:** Warning

**Files:** `extension/background.js:133-142`, `extension/background.js:244-260`, `extension/ui/options.js:1131-1195`, `extension/ui/options.js:1201-1208`, `extension/ui/options.js:1534-1545`, `tests/providers-panel-ui.test.js:2359-2401`

**Issue:** The live route awaits `replaceCompatibility()` and returns `refreshOutcome: 'refreshed'`. That durable write emits a local `fsbAgentProviders` change while the manual `refreshProviderEvidence({ announce: true })` promise is active, so `scheduleProviderEvidenceRefresh()` sets `providerEvidenceRefreshQueued`. The live call then writes the success announcement, but its `finally` block immediately starts a non-announcing cache hydration. Every valid cache read is labeled `stale`; the second call clears the shared live region at entry, replaces the ready state with stale, and rerenders all provider evidence. The new causal test proves one live request, one write, and one cache read, but it never asserts the final announcement, evidence status, or rendered stale markers after the queued call.

**Impact:** The user-triggered success is not announced once and retained. Assistive technology can miss it entirely, and the panel can show “Status may be stale” immediately after a successful authenticated refresh even though the compatibility snapshot was just durably written.

**Fix:** Tag or coalesce the storage notification produced by the in-flight compatibility replacement so it cannot start a second whole-view hydration, or make that queued hydration preserve the manual result/announcement and avoid downgrading a just-refreshed generation to the generic cache outcome. Extend the composed causal test through final settlement and assert exactly one retained polite announcement, `evidenceStatus === 'ready'`, no stale install/connection markers, one daemon request, and one durable write.

### WR-02 — The compatibility-expiry timer can mutate recommendation and unrelated evidence

**Severity:** Warning

**Files:** `extension/background.js:113-118`, `extension/ui/options.js:1113-1128`, `extension/ui/options.js:1131-1151`, `tests/providers-panel-ui.test.js:2244-2304`

**Issue:** The expiry callback correctly avoids the live daemon route, but it calls the generic `refreshProviderEvidence()`. That path rereads the complete durable provider envelope plus current live registry, replaces the entire client map, sets the global evidence state to loading/stale, and recomputes `providerPanelState.recommendation`. A timer whose sole purpose is to age compatibility can therefore change install/connection evidence and recommendation if those unrelated inputs differ from the previous projection. This violates the observational compatibility contract. The expiry test returns identical non-compatibility clients on both cache reads, so its identity snapshot cannot expose the defect.

**Impact:** A compatibility status transition may alter recommendation or unrelated provider details without a corresponding provider-evidence interaction, despite the Phase 62 requirement that compatibility refresh/status changes leave recommendation and other evidence byte-for-byte unchanged.

**Fix:** Make the expiry path compatibility-only: reproject or merge only each agent row's validated `.compatibility` field while preserving the current client rows, recommendation, evidence status, and form state. Add a fake-clock case whose second cache response deliberately changes clicked/installed/connected/live evidence and prove that only Supported becomes Degraded while recommendation and all non-compatibility state remain identical.

### WR-03 — A compatibility snapshot is invisible until another evidence map creates the agent row

**Severity:** Warning

**Files:** `extension/utils/mcp-agent-providers.js:450-514`, `extension/background.js:175-189`, `tests/mcp-agent-providers-storage.test.js:499-527`

**Issue:** `getMergedClients()` first creates rows only from `clicked`, `installed`, `connected`, or live registry records, then loops over `Object.keys(merged)` to attach compatibility. A valid compatibility snapshot does not itself create the canonical Claude Code, OpenCode, or Codex rows. With empty provider-evidence maps and no live records, a valid fresh supported Claude snapshot deterministically returns `{}`. The freshness deadline is also lost because `fsbReadMcpCompatibilityExpiryAt()` cannot find `clients['claude-code']`. Existing compatibility storage tests seed clicked rows for all three agents before asserting projection, so the snapshot-only case is absent.

**Impact:** During startup ordering races, partial inventory delivery, or recovery from a compatibility cache without the older evidence maps, a successful daemon snapshot can be persisted yet shown as the UI's default Unsupported state and never receive its open-panel expiry timer.

**Fix:** Ensure the three canonical compatibility-agent rows exist before compatibility projection (without treating compatibility as recommendation, installation, connection, auth, or start evidence), then attach the closed projection only to those agent rows. Add a storage test with empty clicked/installed/connected/live inputs and a valid snapshot; assert Claude is Supported, OpenCode/Codex are Unsupported, API rows receive no compatibility object, recommendation remains unaffected, and the Claude expiry deadline is available.

### WR-04 — The executable Phase 62 security contract still pins pre-fix compatibility source shapes

**Severity:** Warning

**File:** `tests/delegation-phase-contract.test.js:1083`

**Issue:** The production freshness and cache/live split are correct, but the authoritative Phase 62 contract exits 1 with 760 passing and 3 failing assertions. It still expects `>` instead of the fixed exact-boundary `>=`, scans a broad compatibility section that now includes the cache-only reader before durable write/fan-out, and expects the obsolete pre-CR-01 response/fallback source shape without `compatibilityExpiresAt`. Since T62-05 names this executable contract as a mitigation, the security gate remains 7/8 even though focused production behavior is correct.

**Fix:** Update only the stale contract assertions to pin the new exact-boundary comparison, the explicit live request → durable replacement → fan-out slice, and the separated cache/live response schema including `compatibilityExpiresAt`. Preserve all 17 task IDs, DRIFT-01..04, T62-01..08, and negative authority/leakage assertions, then require the full contract to pass.

## Informational Findings

None.

## Verification Context

- Focused syntax checks passed for `extension/background.js`, `extension/ui/options.js`, and `extension/utils/mcp-agent-providers.js`.
- Focused checks passed: `mcp-agent-providers-storage`, `mcp-bridge-background-dispatch` (293 assertions), and `providers-panel-ui`.
- A read-only snapshot-only probe returned `{}` from `getMergedClients([], 100)` with empty clicked/installed/connected maps and a valid fresh supported Claude compatibility snapshot, confirming WR-03 independently of the existing seeded tests.
- Source tracing confirmed the separated cache/live routes close the original CR-01 daemon/write recursion and that the retained stale projection, Date bound, exact expiry boundary, and single compatibility live-region fixes are present.
- No full suite, live browser, installed CLI/native integration, network call, or human UAT was run. No MCP build/generated artifact was regenerated.
- No implementation or test file was modified and no commit was created by this re-review. Existing unrelated workspace changes were preserved.

---

**Review status:** Issues found — three warnings remain before Phase 62 is code-review clean.
