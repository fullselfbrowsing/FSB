---
phase: 58
slug: providers-panel
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-12
---

# Phase 58 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Direct Node `assert` scripts plus existing handcrafted DOM/VM harnesses |
| **Config file** | `package.json` test script; no separate runner config |
| **Quick run command** | `node tests/providers-panel-logic.test.js && node tests/providers-panel-ui.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | focused tests <15 seconds; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** Run the new focused test for that task plus directly touched contract tests.
- **After every plan wave:** Run `node tests/providers-panel-logic.test.js && node tests/providers-panel-ui.test.js && node tests/model-discovery-ui.test.js && node tests/model-combobox-ui.test.js && node tests/lattice-provider-bridge-smoke.test.js && node tests/mcp-client-merged-view.test.js && node tests/agent-sunset-control-panel.test.js`.
- **Before `$gsd-verify-work`:** `npm test` must pass from a clean worktree at the committed phase source HEAD.
- **Max feedback latency:** 15 seconds for task-level sampling.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 58-01-01 | 01 | 1 | PROV-02, PROV-04, PROV-05 | T-58-01, T-58-02, T-58-03 | Closed allowlists; recommendation cannot mutate selection; agent ids cannot become API ids | unit | `node tests/providers-panel-logic.test.js` | ❌ W0 | ⬜ pending |
| 58-01-02 | 01 | 1 | PROV-05 | T-58-01, T-58-02 | Helper loads before options code and source pins retain existing provider bridge invariants | contract | `node tests/providers-panel-logic.test.js && node tests/lattice-provider-bridge-smoke.test.js` | ❌ W0 | ⬜ pending |
| 58-02-01 | 02 | 2 | PROV-01, PROV-02, PROV-03 | — | Canonical hash, native radio semantics, and inactive controls removed from keyboard flow | DOM/source | `node tests/providers-panel-ui.test.js && node tests/agent-sunset-control-panel.test.js` | ❌ W0 | ⬜ pending |
| 58-02-02 | 02 | 2 | PROV-03, PROV-04 | T-58-02, T-58-03 | Load/save round-trip preserves both kinds; model discovery sees API ids only | VM/contract | `node tests/providers-panel-ui.test.js && node tests/model-discovery-ui.test.js && node tests/model-combobox-ui.test.js && node tests/lattice-provider-bridge-smoke.test.js` | ❌ W0 | ⬜ pending |
| 58-03-01 | 03 | 3 | PROV-05, PROV-06 | T-58-02, T-58-04, T-58-05, T-58-06 | Evidence is defensive and advisory; billing/status copy is non-fabricated and links are fixed HTTPS destinations | VM/DOM | `node tests/providers-panel-logic.test.js && node tests/providers-panel-ui.test.js && node tests/mcp-client-merged-view.test.js` | ❌ W0 | ⬜ pending |
| 58-03-02 | 03 | 3 | PROV-01..PROV-06 | T-58-01..T-58-06 | All focused and legacy contracts pass from committed source | regression | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/providers-panel-logic.test.js` — pure settings normalization, recommendation tier/tie, status, non-mutation, and billing-definition contracts.
- [ ] `tests/providers-panel-ui.test.js` — static markup/CSS plus options-page hash, selection, load/save, visibility, refresh, usage, and copy contracts.
- [ ] Add both tests to `package.json` in a stable position beside Phase 57 MCP-client/provider tests.

Existing Node assertions, VM helpers, and Chrome-storage/runtime mocks cover the framework and fixture needs; no dependency install is required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Light/dark visual hierarchy and selected-vs-Recommended distinction | PROV-01, PROV-05 | Pixel hierarchy and theme contrast are presentation judgments | Load unpacked extension, open Providers in light and dark themes, verify selection and recommendation are independently obvious and exactly one badge appears |
| Compact responsive layout | PROV-01, PROV-03 | Real extension sidebar/content sizing differs from a source harness | Resize to <=640px and desktop widths; verify stacked groups, full-width actions, wrapped badges, and no horizontal overflow |
| Keyboard and refresh focus behavior | PROV-02, PROV-05 | Browser-native radio/focus announcement needs live interaction | Navigate radios with Tab/arrows/Space, trigger Refresh, confirm focus stays put and selection never changes |
| Reduced-motion status refresh | PROV-05 | OS media preference is a live-browser rendering property | Enable reduced motion, refresh status, confirm no spin/shimmer/transform while status text still updates |

---

## Validation Sign-Off

- [x] All tasks have an automated verify or Wave 0 dependency.
- [x] Sampling continuity: no three consecutive tasks lack automated verification.
- [x] Wave 0 covers every missing test reference.
- [x] No watch-mode flags are used.
- [x] Focused feedback latency target is below 15 seconds.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** approved 2026-07-12
