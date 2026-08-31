---
phase: 57-agent-identity-capture
verified: 2026-07-12T14:28:38Z
status: passed
score: 14/14 must-haves verified
overrides_applied: 0
---

# Phase 57: Agent Identity Capture Verification Report

**Phase Goal:** FSB knows which MCP-capable agent CLIs the user has installed on disk, has expressed intent to install via onboarding copy clicks, and has actually connected via MCP `initialize`, surfaced as one ground-truth view for downstream provider selection.
**Verified:** 2026-07-12T14:28:38Z
**Status:** passed
**Re-verification:** No — initial verification after the Phase 57 review/fix loop

## Goal Achievement

### Observable Truths

The five ROADMAP success criteria are the non-negotiable contract. The nine additional PLAN truths were checked separately so plan detail could not reduce roadmap scope.

| # | Truth | Status | Evidence |
|---|---|---|---|
| R1 | Every onboarding MCP copy action records durable, aggregated click evidence without changing clipboard feedback. | ✓ VERIFIED | `copyCommand()` resolves base/fan/all attribution and starts caught, non-awaited persistence before preserving the 1600 ms copied timer, toast, and immediate render (`extension/ui/onboarding.js:795-807`). `persistCopyClick()` updates a durable map in `chrome.storage.local`, preserves sibling/unknown envelope data, and expands `all` to the exact seven flag-backed clients (`:810-858`). The onboarding contract test passed. |
| R2 | MCP initialize identity crosses every supported runtime through additive registration, stamps the live registry, and rolls up durably without duplicate reconnect rows. | ✓ VERIFIED | `createRuntime()` lazily injects SDK `getClientVersion()` into `AgentScope` (`mcp/src/runtime.ts:32-43`); `ensure()` allowlists identity fields and sends one additive registration (`mcp/src/agent-scope.ts:72-105`). The dispatcher caps both fields at 200 characters, stamps the live record, and records durable evidence (`extension/ws/mcp-tool-dispatcher.js:1935-1940,1996-2004`). Canonical alias reconnects overwrite one map entry (`extension/utils/mcp-agent-providers.js:50-89,160-173`), including the same-millisecond regression fixed by `ca01fd34`. Identity, storage, and integration tests passed. |
| R3 | The daemon enumerates all known MCP clients and reports detected state, config path, timestamp, and parseable Claude Code version. | ✓ VERIFIED | The detector enumerates every injected `PLATFORMS` key, reuses `resolvePlatformTarget`, and uses a shared sweep timestamp (`mcp/src/client-inventory.ts:97-115`). Claude candidates, argv, timeout, buffer cap, no-shell invocation, version parsing, error fallthrough, and memoization are implemented at `:57-94,118-123`. Inventory tests passed. |
| R4 | One guarded `getMcpClients` action returns a fresh, eviction-safe clicked/installed/connected/live union. | ✓ VERIFIED | `getMergedClients()` re-reads durable storage on every call and emits exact seven-field rows with null placeholders (`extension/utils/mcp-agent-providers.js:206-280`). The own-extension runtime route reads only cloned live records from `listAgents()` and returns a bounded success/error envelope (`extension/background.js:7681-7698`); same-context dispatch uses the established direct wrapper (`:8753-8788`). Merge and cross-stack integration tests passed, including fresh-harness rehydration. |
| R5 | Phase 57 is additive: legacy MCP message values, tool schemas, register response, and empty register payload remain compatible. | ✓ VERIFIED | A bare `AgentScope` still sends exactly `{ type: 'agent:register', payload: {} }`; `system:client-inventory` is the only new message type; the established MCP response union and both tool-definition hashes are unchanged; the exact register response is pinned. `mcp-version-parity.test.js` passed 16/16, visual schema and tool-definition parity tests passed, and the clean-worktree root suite exited 0. |
| P1 | Stdio and streamable-HTTP clients contribute initialized `clientInfo` lazily without changing the bare-scope legacy path. | ✓ VERIFIED | Both transport paths construct the shared runtime; executable supplier tests cover name+version, name-only, version-only, null/empty, lazy reads, and one registration per scope. |
| P2 | Every `PLATFORMS` entry appears as detected/not detected, with bounded shell-free Claude probing. | ✓ VERIFIED | The inventory contract checks the exact registry key set, POSIX/Windows candidate order, fixed options, parseable/unparseable output, errors, and one memoized sweep. |
| P3 | Inventory is delivered through both the tolerant system frame and registration piggyback. | ✓ VERIFIED | Both stdio and HTTP bridge-ready paths fire the tolerant push (`mcp/src/index.ts:244-276`); `AgentScope` includes a non-empty platforms map (`mcp/src/agent-scope.ts:93-101`). Both paths converge on `replaceInstalled`; offline/unknown-frame failure is redacted and non-fatal. |
| P4 | Copy persistence does not delay or alter clipboard, checkmark, render, or toast behavior. | ✓ VERIFIED | The persistence promise is neither awaited nor allowed to reject into the UI path; focused timing assertions verify exactly one immediate render, the unchanged 1600/2600 ms timers, and failure isolation. |
| P5 | Sanitized MCP identity is descriptive evidence only, not authorization or ownership. | ✓ VERIFIED | Only `name`/`version` survive sanitization and registry persistence. The storage/dispatcher harness installs throwing ownership spies and proves identity never enters them; the merged rows contain no authority, permission, recommendation, tier, or selection fields. |
| P6 | System-frame and registration-piggyback inventory replace only `installed`, preserving clicked/connected evidence. | ✓ VERIFIED | Both ingestion routes call `FsbMcpAgentProviders.replaceInstalled`; `mutateSubmap()` serializes same-realm writes and rewrites the complete sibling-preserving envelope (`extension/utils/mcp-agent-providers.js:92-152,176-203`). Focused tests passed. |
| P7 | `getMcpClients` returns a stable evidence union without recommending or selecting a provider. | ✓ VERIFIED | Every merged row contains exactly `id`, `raw`, `displayName`, `clicked`, `installed`, `connected`, and `live`; no derived status priority or provider selection field exists. Runtime success is exactly `{ success: true, clients }`. |
| P8 | Known identity drift joins only through a closed explicit alias table; unknown names stay raw and visible. | ✓ VERIFIED | `mcp-client-aliases.js` contains a frozen exact map and separator/case normalization only. Fuzzy lookalikes and Gemini resolve to null; unknown identities become `raw:*` rows with no clicked/installed inheritance. Alias and special-key regressions passed. |
| P9 | New fields/types/action preserve legacy types, schemas, register responses, and the sunset `listAgents` action. | ✓ VERIFIED | Parity hashes and ordered type pins pass; `listAgents` remains commented out; `getMcpClients` occurs once and never self-dispatches with `chrome.runtime.sendMessage`; root `package.json` runs all six Phase 57 contracts exactly once. |

**Score:** 14/14 truths verified

## Required Artifacts

| Plan | Artifact | Expected | Status | Details |
|---|---|---|---|---|
| 57-01 | `mcp/src/agent-scope.ts` | Lazy identity/inventory suppliers and additive registration | ✓ VERIFIED | Exists (236 lines), substantive, used by the shared runtime and all MCP tool registrations. |
| 57-01 | `mcp/src/client-inventory.ts` | Memoized registry sweep and safe Claude probe | ✓ VERIFIED | Exists (135 lines), exports both required production functions, imported by runtime/index. |
| 57-01 | `tests/mcp-client-identity.test.js` | Identity and transport factory contracts | ✓ VERIFIED | Exists (157 lines) and passed. |
| 57-01 | `tests/mcp-client-inventory.test.js` | Inventory/probe/delivery contracts | ✓ VERIFIED | Exists (287 lines) and passed. |
| 57-02 | `extension/utils/mcp-agent-providers.js` | Durable sibling-preserving evidence storage | ✓ VERIFIED | Exists (294 lines), loaded at SW boot, called by dispatcher, bridge, and runtime query. |
| 57-02 | `extension/utils/agent-registry.js` | Live `clientInfo` stamp/persist/hydrate | ✓ VERIFIED | `stampClientInfo` is substantive and clientInfo is carried through clone, persist, and hydrate paths. |
| 57-02 | `extension/ui/onboarding.js` | Invisible copy-click persistence | ✓ VERIFIED | `persistCopyClick` is wired once from `copyCommand`; no HTML/CSS/manifest change belongs to Phase 57. |
| 57-02 | `tests/mcp-agent-providers-storage.test.js` | Storage, sanitation, ingestion, and authority isolation | ✓ VERIFIED | Exists (563 lines) and passed after all review fixes. |
| 57-02 | `tests/onboarding-agent-provider-clicks.test.js` | Attribution/timing/eviction source contracts | ✓ VERIFIED | Exists (320 lines) and passed. |
| 57-03 | `extension/utils/mcp-client-aliases.js` | Closed canonical identity vocabulary | ✓ VERIFIED | Exists (36 lines), source-frozen, loaded before the provider helper. |
| 57-03 | `extension/utils/mcp-agent-providers.js` | Fresh deterministic merged view | ✓ VERIFIED | `getMergedClients` is directly callable and intentionally non-enumerable to preserve the prior enumerable API lock. |
| 57-03 | `extension/background.js` | Guarded own-extension runtime action | ✓ VERIFIED | Exactly one asynchronous `getMcpClients` route plus same-context wrapper. |
| 57-03 | `tests/mcp-client-merged-view.test.js` | Alias, union, raw, eviction, and dispatch coverage | ✓ VERIFIED | Exists (511 lines) and passed. |

`gsd-tools verify artifacts` returned 4/4, 5/5, and 4/4 for Plans 01, 02, and 03 respectively.

## Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `mcp/src/runtime.ts` | `mcp/src/agent-scope.ts` | Feature-detected SDK identity supplier | ✓ WIRED | `setClientInfoSupplier(() => server.server.getClientVersion?.() ?? null)` at lines 38-40. |
| `mcp/src/agent-scope.ts` | extension registration route | `bridge.sendAndWait` optional payload | ✓ WIRED | Client identity and platforms are constructed immediately before the one registration round-trip. |
| `mcp/src/index.ts` | `mcp/src/client-inventory.ts` | Bridge-ready tolerant push | ✓ WIRED | Both stdio and HTTP paths call `pushMcpClientInventory` after successful bridge connect. |
| `extension/background.js` | `extension/utils/mcp-agent-providers.js` | SW import order | ✓ WIRED | Provider helper loads after the registry and before dispatcher/bridge consumers. |
| `extension/ws/mcp-tool-dispatcher.js` | `extension/utils/agent-registry.js` | `stampClientInfo` | ✓ WIRED | Sanitized identity is stamped after mint/connection binding. |
| `extension/ws/mcp-bridge-client.js` | provider storage helper | `system:client-inventory` route | ✓ WIRED | Valid map is awaited through the same `replaceInstalled` operation used by piggyback ingestion. |
| `extension/background.js` | `extension/utils/mcp-client-aliases.js` | Alias-before-provider import order | ✓ WIRED | Manual source inspection verifies adjacent lines 33-34. The automated regex check's single-line pattern could not span the newline, so its reported miss is a tooling false negative. |
| `extension/background.js` | live agent registry | `listAgents()` in `getMcpClients` | ✓ WIRED | Own-extension route reads only cloned live records, with empty-registry fallback. |
| `package.json` | all Phase 57 tests | Permanent serial root-suite cluster | ✓ WIRED | All six new contracts occur exactly once before the remainder of the established suite. |

`gsd-tools verify key-links` returned 3/3, 3/3, and 2/3 by regex; manual verification closes the one newline-sensitive false negative above, yielding 9/9 actual links wired.

## Data-Flow Trace (Level 4)

| Evidence | Producer | Durable/Live Flow | Query Consumer | Status |
|---|---|---|---|---|
| Clicked intent | Onboarding `copyCommand` | `persistCopyClick` → `chrome.storage.local.fsbAgentProviders.clicked` | fresh `read()` → `getMergedClients` → guarded runtime response | ✓ FLOWING |
| Connected identity | SDK `getClientVersion()` | `AgentScope` register → dispatcher sanitation → live `AgentRecord.clientInfo` + durable `connected` rollup | registry clone + durable read join through closed aliases | ✓ FLOWING |
| Installed inventory | `PLATFORMS` resolver + fixed Claude probe | memoized inventory → system frame and register piggyback → `replaceInstalled` | durable read joins detected/not-detected records into the runtime view | ✓ FLOWING |

No Phase 57 artifact renders dynamic UI data; therefore no component-render source trace is applicable. The complete data-layer paths above were exercised in the cross-stack integration test.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| TypeScript and daemon identity/inventory contracts | `cd mcp && npx tsc --noEmit && node ../tests/agent-scope.test.js && node ../tests/mcp-client-identity.test.js && node ../tests/mcp-client-inventory.test.js` | Exit 0; every suite printed PASS | ✓ PASS |
| Durable evidence and copy timing | `node tests/mcp-agent-providers-storage.test.js && node tests/onboarding-agent-provider-clicks.test.js` | Exit 0; both suites passed | ✓ PASS |
| Fresh merged query and end-to-end data flow | `node tests/mcp-client-merged-view.test.js && node tests/mcp-client-identity-integration.test.js` | Exit 0; both suites printed PASS | ✓ PASS |
| Same-context dispatch compatibility | `node tests/mcp-bridge-background-dispatch.test.js` | 53 passed, 0 failed | ✓ PASS |
| Additive message/schema/register freeze | `node tests/mcp-version-parity.test.js` | 16 passed, 0 failed | ✓ PASS |
| Broader schema/tool/source pins | `node tests/visual-session-schema-lock.test.js && node tests/tool-definitions-parity.test.js && node tests/lattice-provider-bridge-smoke.test.js` | Exit 0; 344, 260, and 110 assertions passed respectively | ✓ PASS |

The orchestrator additionally supplied a completed clean detached-worktree run at committed source HEAD `ca01fd34`: the complete root `npm test` chain exited 0 through `no-orphan-descriptor`. Commits after `ca01fd34` only update review artifacts, not source or tests.

## Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|---|---|---|---|
| IDENT-01 | 57-02, 57-03 | ✓ SATISFIED | Durable base/fan/all click aggregation, repeat counters/timestamps, sibling preservation, fresh-harness re-read, and unchanged UI timing are executable contracts. |
| IDENT-02 | 57-01, 57-03 | ✓ SATISFIED | Lazy SDK identity supplier, common stdio/HTTP runtime wiring, additive payload allowlist, and exact legacy empty payload all pass. |
| IDENT-03 | 57-02, 57-03 | ✓ SATISFIED | Bounded registry stamp, persist/hydrate, canonical reconnect overwrite, same-millisecond last-operation semantics, and no authority use all pass. |
| IDENT-04 | 57-01, 57-02, 57-03 | ✓ SATISFIED | Full platform sweep, fixed no-shell Claude probe, dual ingestion, durable validation, and not-detected records all pass. |
| IDENT-05 | 57-03 | ✓ SATISFIED | Guarded fresh-on-read clicked/installed/connected/live union, explicit aliases, raw unknowns, eviction rehydration, and bounded errors all pass. |

Every Phase 57 requirement in `REQUIREMENTS.md` appears in at least one PLAN frontmatter block. No orphaned requirement exists.

## Review, Regression, and Drift Evidence

- `57-REVIEW.md` is final and clean: 23 files reviewed, 0 critical, 0 warning, 0 info findings after fixes `5500a3c4`, `30452a80`, and `ca01fd34`.
- `57-REVIEW-FIX.md` records the final same-millisecond reconnect fix as applied and focused tests as passed. Earlier review fixes canonicalized alias evidence and preserved special evidence keys without prototype mutation.
- All 11 documented implementation/fix commits validate in git.
- `gsd-tools verify schema-drift 57` reports `drift_detected: false`, `blocking: false`.
- `git diff --check ea47c50d^..HEAD -- mcp/src extension package.json tests` passes.

## Anti-Patterns and Disconfirmation Pass

| Check | Finding | Severity | Impact |
|---|---|---|---|
| TODO/FIXME/placeholder and empty-implementation scan on Phase 57 production additions | No blocker pattern found. `return {}` / `return null` hits are defensive normalization or rejection paths that are subsequently populated/tested, not stubs. | None | None |
| Inversion: alias drift could misclassify authority | Closed exact alias map, raw unknown rows, no derived recommendation/authority fields, and fuzzy-lookalike tests disconfirm this failure mode. | None | None |
| Inversion: reconnects could duplicate/stale identity | Canonical map keys, migration arbitration, same-millisecond later-operation overwrite, and fresh-query tests disconfirm it. | None | None |
| Inversion: special client ids could mutate prototypes | Own enumerable property writes plus `__proto__` storage/merge regressions disconfirm it. | None | None |
| Closest partial-risk candidate | The context explicitly accepts that onboarding-page and service-worker Promise mutexes cannot serialize across realms; each realm preserves siblings and the next event self-heals a rare simultaneous RMW collision. This is a locked D-07 limitation, not a failed Phase 57 must-have. | ℹ️ Info | No status impact |
| Test-layer caveat | Transport tests prove shared runtime construction by source contract and execute the shared runtime behavior directly; they do not launch live stdio and HTTP sockets. The cross-stack integration and clean root regression independently cover the shared implementation. | ℹ️ Info | No status impact |
| Uncovered defensive path | No focused fake forces the already-established `resolvePlatformTarget()` dependency itself to throw. Normal resolver outputs, CLI failures, bridge failures, storage failures, malformed input, and unavailable helpers are covered. | ℹ️ Info | No requirement gap |

## Human Verification Required

None. Phase 57 is intentionally data-only, adds no rendered UI, and its unchanged onboarding behavior is fully covered by VM/source contracts.

## Gaps Summary

No blocking or deferred Phase 57 gaps were found. All roadmap criteria, PLAN truths, declared artifacts, key links, and requirement IDs are satisfied. Later UI rendering, recommendation ranking, provider selection, spawn behavior, and native wake-up are explicitly assigned to Phases 58-65 and are not missing Phase 57 work.

---

_Verified: 2026-07-12T14:28:38Z_
_Verifier: the agent (gsd-verifier)_
