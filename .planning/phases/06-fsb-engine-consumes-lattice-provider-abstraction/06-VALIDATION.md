---
phase: 6
slug: fsb-engine-consumes-lattice-provider-abstraction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-27
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from 06-RESEARCH.md Validation Architecture section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in test runner (CommonJS, no vitest/jest); pattern is in-test `passAssert()`/`passAssertEqual()` counters with `process.exit(failed > 0 ? 1 : 0)` |
| **Config file** | None — each test file is self-contained; `package.json scripts.test` chains them with `&&` |
| **Quick run command** | `node tests/lattice-provider-bridge-smoke.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~3 seconds (smoke) / ~3-5 min (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `node tests/lattice-provider-bridge-smoke.test.js && node tests/tool-definitions-parity.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green + `npm run build` regenerates `extension/dist/offscreen/lattice-host.js` cleanly
- **Max feedback latency:** ~3 seconds per-task; ~5 min per-wave

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-W0-01 | 00 | 0 | FINT-07/08 | — | Smoke harness scaffolded with chrome.runtime + chrome.offscreen mocks | unit harness | `node tests/lattice-provider-bridge-smoke.test.js` (Part 0 placeholder) | ❌ W0 | ⬜ pending |
| 6-01-01 | 01 | 1 | FINT-07a | T-spoofing-cross-ext | Cross-extension sender rejected via `sender.id !== chrome.runtime.id` check | unit | `node tests/lattice-provider-bridge-smoke.test.js` (Part 1) | ❌ W0 | ⬜ pending |
| 6-01-02 | 01 | 1 | FINT-07a | T-id-key-log | Offscreen handler returns true + sendResponse for 7 providers; key NOT logged on error | unit | `node tests/lattice-provider-bridge-smoke.test.js` (Part 1 + 2) | ❌ W0 | ⬜ pending |
| 6-01-03 | 01 | 1 | FINT-07a + INV-03 | — | 7-provider mapping covers anthropic/openai/gemini/xai/openrouter/lmstudio/custom via dispatch map | unit | `node tests/lattice-provider-bridge-smoke.test.js` (Part 2) | ❌ W0 | ⬜ pending |
| 6-01-04 | 01 | 1 | FINT-07a | T-id-error-shape | Error envelope `{ok:false, error:{kind, message, providerError?}}` shape per failure class | unit | `node tests/lattice-provider-bridge-smoke.test.js` (Part 3) | ❌ W0 | ⬜ pending |
| 6-01-05 | 01 | 1 | FINT-07a + FINT-08e | T-tampering-abort-replay | Per-call `Map<requestId, AbortController>`; lattice-provider-abort routes via crypto.randomUUID | unit | `node tests/lattice-provider-bridge-smoke.test.js` (Part 2) | ❌ W0 | ⬜ pending |
| 6-02-01 | 02 | 2 | FINT-07b | T-misrouting | Background.js `ensureLatticeOffscreen()` helper inserted after importScripts line 11; hasDocument guard idempotent | unit (static grep + chrome.offscreen mock test) | `node tests/lattice-provider-bridge-smoke.test.js` (Part 5) | ❌ W0 | ⬜ pending |
| 6-02-02 | 02 | 2 | FINT-07b | — | ensureLatticeOffscreen called from onInstalled + onStartup hooks (line 13113 + 13189) | unit (static grep) | grep + Part 5 | ❌ W0 | ⬜ pending |
| 6-03-01 | 03 | 2 | FINT-08a | — | `extension/ai/lattice-provider-bridge.js` exports `executeViaBridge()` (CJS + globalThis) | unit | `node tests/lattice-provider-bridge-smoke.test.js` (Part 1) | ❌ W0 | ⬜ pending |
| 6-03-02 | 03 | 2 | FINT-08b | T-id-flag-on-off | agent-loop.js:1044 call site swap; FSB_LATTICE_PROVIDER_BRIDGE_ENABLED=true→bridge, =false→universalProvider.sendRequest fallback | unit (static grep + behavior assertion) | `node tests/lattice-provider-bridge-smoke.test.js` (Part 3) | ❌ W0 | ⬜ pending |
| 6-04-01 | 04 | 3 | FINT-08c | T-id-key-trim | options.js saveSettings() applies .trim() uniformly to all 7+ API key fields | unit (static grep `.trim()` count >= 7) | `node tests/lattice-provider-bridge-smoke.test.js` (Part 4) | ❌ W0 | ⬜ pending |
| 6-04-02 | 04 | 3 | FINT-08d | T-id-stale-storage | options.js checkApiConnection() reads `elements.apiKey?.value?.trim()` (not chrome.storage) and delegates to bridge | unit (static grep + behavior assertion) | `node tests/lattice-provider-bridge-smoke.test.js` (Part 4) | ❌ W0 | ⬜ pending |
| 6-05-01 | 05 | 3 | INV-04 | — | agent-loop.js setTimeout iterator lines 1841/2439/2508/2518 byte-frozen | static-text (grep + line-number assertion) | `node tests/lattice-provider-bridge-smoke.test.js` (Part 6) | ❌ W0 | ⬜ pending |
| 6-05-02 | 05 | 3 | INV-01/02 | — | tool-definitions parity unchanged (142 PASS) | unit (existing test reused) | `node tests/tool-definitions-parity.test.js` | ✅ exists | ⬜ pending |
| 6-06-01 | 06 | 4 | LATTICE-PIN | — | LATTICE-PIN.md bumped with FSB-side audit row (no Lattice SHA change) | doc (grep for new row) | grep `.planning/LATTICE-PIN.md` | ✅ exists | ⬜ pending |
| 6-06-02 | 06 | 4 | FINT-07/08 | — | REQUIREMENTS.md FINT-07/08 status flipped Pending → Complete; traceability rows fully populated | doc (grep for "Complete" on FINT-07/08 rows) | grep `.planning/REQUIREMENTS.md` | ✅ exists | ⬜ pending |
| Manual UAT | — | end | Phase 7 UAT-1 | — | Real xAI test-connection from settings UI in MV3 reloaded extension | manual-only | (deferred to Phase 7 end UAT-1; reason: requires Chrome MV3 reload + real network) | — | ⏭ deferred |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ⏭ deferred*

---

## Wave 0 Requirements

- [ ] `tests/lattice-provider-bridge-smoke.test.js` — covers FINT-07a/b, FINT-08a/b/c/d/e, INV-03, INV-04 line-freeze. Must exist before any task that depends on the bridge. Pattern: 6 Parts × ≥ 20 PASS assertions total (per RESEARCH.md Section 15).
- No new fixtures needed — smoke is self-contained with inline mocks (matches Phase 5 lattice-survivability-smoke.test.js pattern).
- No new framework install — Node-only built-in runner.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real xAI key paste → click Test Connection → success in UI | FINT-08 (P1+P2 closure) | Requires Chrome MV3 reload + real xAI API + UI render | Defer to Phase 7 UAT-1 consolidated procedure (v0.10.0-MILESTONE-AUDIT.md UAT-1 sub-assertion 4) |
| One autopilot iteration completes ≥ 1 step via xAI bridge | FINT-08 (bridge runtime parity) | Requires Chrome MV3 reload + real LLM round-trip + visible page navigation | Defer to Phase 7 UAT-1 consolidated procedure (sub-assertion 5) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (bridge smoke is the only new file)
- [ ] No watch-mode flags
- [ ] Feedback latency < 5 seconds per-task
- [ ] `nyquist_compliant: true` set in frontmatter (set after Wave 0 smoke lands)

**Approval:** pending
