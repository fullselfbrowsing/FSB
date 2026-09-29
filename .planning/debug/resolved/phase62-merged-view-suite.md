---
status: resolved
trigger: "Phase 62 guarded full suite fails in tests/mcp-client-merged-view.test.js at line 443"
created: 2026-07-16T22:07:00Z
updated: 2026-07-16T22:27:41Z
---

## Current Focus

hypothesis: Resolved. Two Phase 57 VM harnesses and one legacy service-worker import-count pin had drifted from intentional Phase 62 contracts; production behavior was correct.
test: The guarded `node scripts/run-phase60-full-tests.mjs` wrapper completed with exit 0 after both test-only alignments.
expecting: No further action. The serial suite preserves all protected workspace artifacts and human UAT remains deferred.
next_action: Archive this session and continue Phase 62 closeout.

reasoning_checkpoint:
  hypothesis: "The extracted handler fails because its VM contexts omit the exact `fsbReadCachedMcpClients` global it invokes; the catch converts that ReferenceError into `mcp_client_inventory_unavailable`."
  confirming_evidence:
    - "An in-memory probe exposed `ReferenceError: fsbReadCachedMcpClients is not defined` at the handler."
    - "Both merged-view and immediately following identity-integration fail through that extracted route while production-focused cache/contract suites pass."
  falsification_test: "If injecting only `fsbReadCachedMcpClients` with the current envelope does not make both focused suites pass, or production-focused suites fail afterward, this diagnosis is wrong."
  fix_rationale: "Aligning the two test VMs with the production cache-only dependency and response field removes the stale seam while preserving the implementation under test and its fail-closed behavior."
  blind_spots: "The guarded full suite is intentionally reserved for the root agent; this investigation verifies only deterministic focused and adjacent production suites."

## Symptoms

expected: The guarded root suite should pass; the own-extension cross-context request in `mcp-client-merged-view.test.js` should receive `{ success: true, refreshOutcome: 'unavailable', clients: { cursor: ... } }`.
actual: The request receives `{ success: false, error: 'mcp_client_inventory_unavailable' }`.
errors: "AssertionError [ERR_ASSERTION]: own-extension cross-context request receives the exact successful envelope at tests/mcp-client-merged-view.test.js:443:10"
reproduction: Run `node scripts/run-phase60-full-tests.mjs`; the suite reaches `node tests/mcp-client-merged-view.test.js` and fails at line 443. First isolate with `node tests/mcp-client-merged-view.test.js`.
started: First observed in the single post-`ba572f94` guarded Phase 62 full-suite run on 2026-07-16; the preceding focused Phase 62 suites were green.

## Eliminated

- hypothesis: The Phase 62 production cache-only inventory route regressed.
  evidence: Production-focused background dispatch passes its cache-only/no-live-refresh assertions, and the Phase 62 contract suite passes 763/0; only VMs omitting the current reader fail.
  timestamp: 2026-07-16T22:16:58Z

## Evidence

- timestamp: 2026-07-16T22:27:41Z
  checked: Final guarded full-suite retry and protected workspace hashes
  found: The wrapper exited 0 with `[phase60-full-tests] PASS: full suite passed and workspace state was preserved`; MCP build and all three showcase artifacts retain their exact protected SHA-256 values.
  implication: Both stale test seams are closed, the entire serial suite is green, and the user-owned dirty workspace remains byte-for-byte preserved.

- timestamp: 2026-07-16T22:25:42Z
  checked: Legacy `lattice-provider-bridge-smoke.test.js` failure after the first harness correction
  found: Production intentionally added the Phase 62 drift-diagnostics `importScripts()` call, but the legacy Phase 6 byte-count assertions still expected Phase 61 totals 315/311 instead of 316/312. Updating only the two expectations produced 110 passed/0 failed, and the Phase 61–62 contract remained 763/0.
  implication: The second guarded-suite stop was another stale test pin, not a production regression.

- timestamp: 2026-07-16T22:19:32Z
  checked: Final identity rerun, diff check, and protected hashes after assertion-label cleanup
  found: Identity-integration exits 0; `git diff --check` exits 0; MCP build and showcase SHA-256 values still match the recorded baseline exactly.
  implication: The finalized patch is deterministic, formatting-clean, and preserves every protected artifact byte-for-byte.

- timestamp: 2026-07-16T22:18:41Z
  checked: Post-fix production regressions, focused diff, and protected artifacts
  found: Background dispatch exits 0 with 293 passed/0 failed; Phase 62 contract exits 0 with 763 passed/0 failed; diff check is clean. MCP build and all three showcase SHA-256 hashes exactly match the pre-fix baseline.
  implication: The test-only fix leaves production contracts and protected user artifacts byte-exactly unchanged.

- timestamp: 2026-07-16T22:17:54Z
  checked: Exact post-fix reproductions for merged-view and identity-integration
  found: Both commands exit 0. Merged-view prints PASS after exercising its own-extension success, external rejection, same-context success, storage rejection, and registry rejection cases; identity-integration also prints PASS.
  implication: The minimal cache-reader/envelope alignment fixes both deterministic stale seams and preserves the bounded negative behavior.

- timestamp: 2026-07-16T22:16:58Z
  checked: Adjacent `node tests/mcp-client-identity-integration.test.js`
  found: It exits 1 at its first same-context `getMcpClients` success assertion and injects the same obsolete `fsbRefreshMcpCompatibility` symbol.
  implication: The guarded chain would immediately encounter the same stale seam after merged-view; the minimal justified fix covers both adjacent VM harnesses.

- timestamp: 2026-07-16T22:16:14Z
  checked: Exact in-memory diagnostic probe of the extracted runtime handler
  found: Revealing the swallowed exception produced `ReferenceError: fsbReadCachedMcpClients is not defined` at the `getMcpClients` handler.
  implication: The missing symbol—not provider data, storage, registry, timing, or merge logic—is the direct cause of the observed bounded error.

- timestamp: 2026-07-16T22:16:14Z
  checked: Production-focused `mcp-bridge-background-dispatch.test.js` and Phase 62 `delegation-phase-contract.test.js`
  found: Both exit 0; the background suite proves cache-only inventory, zero live refreshes, and the `compatibilityExpiresAt` envelope, while the Phase 62 contract reports 763 passed and 0 failed.
  implication: The production route and current contract are green independently of the stale merged-view VM, eliminating a production regression.

- timestamp: 2026-07-16T22:14:32Z
  checked: Complete merged-view harness and production compatibility/router path
  found: Production `case 'getMcpClients'` awaits `fsbReadCachedMcpClients()`; the VM never defines or extracts that function and instead defines unused `fsbRefreshMcpCompatibility`. The caught ReferenceError is therefore converted to the observed bounded error. Production success also emits `compatibilityExpiresAt`, absent from this test's expected envelope.
  implication: The exact failure mechanism is an obsolete test dependency and response contract. Production-focused tests must still pass before classifying it as fixture-only.

- timestamp: 2026-07-16T22:12:56Z
  checked: Isolated reproduction with `node tests/mcp-client-merged-view.test.js`
  found: The test exits 1 at line 443; actual is exactly `{ success: false, error: 'mcp_client_inventory_unavailable' }` instead of the expected successful cursor envelope.
  implication: The guarded-suite symptom is deterministic and isolated; execution reaches the production fail-closed inventory branch before the assertion.

- timestamp: 2026-07-16T22:12:14Z
  checked: Debug knowledge base and project skill discovery
  found: The knowledge base contains only the unrelated Phase 11 sidepanel hydration issue, and neither `.codex/skills/` nor `.agents/skills/` exists in this repository.
  implication: There is no prior matching diagnosis or project-local rule to shortcut or constrain this investigation.

- timestamp: 2026-07-16T22:07:00Z
  checked: Guarded full-suite output
  found: The suite passed Phase 62 compatibility, drift, doctor, storage, background, and contract gates before failing at merged-view line 443 with `mcp_client_inventory_unavailable`.
  implication: The failure is localized to the merged-view request fixture or a dependency unique to that dispatch path, not the final Providers UI ordering correction.

## Resolution

root_cause: The Phase 57 VM integration harnesses drifted from the Phase 62 cache-only runtime contract: both inject `fsbRefreshMcpCompatibility`, but extracted production `getMcpClients` calls `fsbReadCachedMcpClients`; merged-view also expects the pre-Phase-62 envelope without `compatibilityExpiresAt`. The missing global throws a ReferenceError that production correctly catches and bounds.
fix: Updated only the two extracted-handler VM harnesses to inject `fsbReadCachedMcpClients` instead of the obsolete live-refresh symbol, return `compatibilityExpiresAt: null`, and assert the current success envelope.
verification: `node tests/mcp-client-merged-view.test.js` PASS; `node tests/mcp-client-identity-integration.test.js` PASS; `node tests/mcp-bridge-background-dispatch.test.js` 293 passed/0 failed; `node tests/delegation-phase-contract.test.js` 763 passed/0 failed; `node tests/lattice-provider-bridge-smoke.test.js` 110 passed/0 failed; guarded `node scripts/run-phase60-full-tests.mjs` exited 0 and reported workspace preservation; protected artifact SHA-256 values unchanged.
files_changed: [tests/mcp-client-merged-view.test.js, tests/mcp-client-identity-integration.test.js, tests/lattice-provider-bridge-smoke.test.js, .planning/debug/resolved/phase62-merged-view-suite.md]
