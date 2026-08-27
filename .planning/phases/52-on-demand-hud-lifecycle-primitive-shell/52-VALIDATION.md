---
phase: 52
slug: on-demand-hud-lifecycle-primitive-shell
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-14
---

# Phase 52 — Validation Strategy

> Feedback-sampling contract for the explicitly invoked Skopeo lifecycle, shared primitive shell, host integrity, cancellation, and accessibility. Source of truth: `52-CONTEXT.md`; technical evidence: `52-RESEARCH.md`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Standalone Node tests using `assert`, VM sandboxes, and repository DOM/Chrome mocks |
| **Config file** | `package.json` scripts plus direct `node tests/<name>.test.js` execution |
| **Closest harnesses** | `tests/test-overlay-state.js`, `tests/overlay-content-audit.test.js`, `tests/overlay-stability-cadence.test.js`, `tests/sidepanel-tab-aware-smoke.test.js` |
| **Quick run command** | `node tests/skopeo-session-lifecycle.test.js && node tests/skopeo-shell-contract.test.js` |
| **Phase suite command** | `node tests/skopeo-session-lifecycle.test.js && node tests/skopeo-shell-contract.test.js && node tests/skopeo-sidepanel-command.test.js && node tests/skopeo-accessibility.test.js && node tests/test-overlay-state.js && node tests/overlay-content-audit.test.js` |
| **Full suite command** | `npm run validate:extension && npm test` |
| **Estimated runtime** | Quick target <10 seconds and hard ceiling <30 seconds; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** Run the new test file that owns the changed contract; never leave three consecutive tasks without an automated sample.
- **After session/controller changes:** Run `node tests/skopeo-session-lifecycle.test.js`.
- **After shell/primitive/accessibility changes:** Run `node tests/skopeo-shell-contract.test.js && node tests/skopeo-accessibility.test.js`.
- **After manifest/background/side-panel changes:** Run `node tests/skopeo-sidepanel-command.test.js && node tests/sidepanel-tab-aware-smoke.test.js`.
- **After every plan wave:** Run the complete Phase 52 suite.
- **Before `$gsd-verify-work`:** Run `npm run validate:extension && npm test`, then complete the live Chrome UAT matrix.
- **Max automated feedback latency:** 30 seconds between implementation tasks.

---

## Per-Task Verification Map

Plan/task identifiers are assigned during planning; Wave 0 rows below are mandatory inputs that the planner must map to concrete tasks.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 52-W0-01 | TBD | 0 | HUD-01, HUD-02 | T-52-01, T-52-06, T-52-07 | Explicit current-tab lifecycle; terminal generation rejects late work; restricted tabs roll back | unit | `node tests/skopeo-session-lifecycle.test.js` | ❌ W0 | ⬜ pending |
| 52-W0-02 | TBD | 0 | HUD-03, HUD-04, HUD-07, HUD-08 | T-52-02, T-52-03, T-52-05 | One root; legal primitive combinations only; pointer pass-through; hostile text inert; teardown has zero owned resources | unit/VM | `node tests/skopeo-shell-contract.test.js` | ❌ W0 | ⬜ pending |
| 52-W0-03 | TBD | 0 | HUD-01, HUD-04 | T-52-06, T-52-07 | Standard command and explicit tab id; toolbar path unchanged; no always-loaded Skopeo runtime | contract/smoke | `node tests/skopeo-sidepanel-command.test.js` | ❌ W0 | ⬜ pending |
| 52-W0-04 | TBD | 0 | HUD-05 | T-52-02, T-52-04 | Names/roles/focus policy/reduced motion/target size/contrast tokens remain operable | unit/VM | `node tests/skopeo-accessibility.test.js` | ❌ W0 | ⬜ pending |
| 52-REG-01 | TBD | every wave | HUD-02, HUD-03 | T-52-01, T-52-05 | Existing overlay ordering and cleanup remain intact | regression | `node tests/test-overlay-state.js && node tests/overlay-content-audit.test.js` | ✅ | ⬜ pending |
| 52-REG-02 | TBD | integration wave | HUD-01, HUD-04 | T-52-07 | Existing tab-aware side panel and action behavior do not regress | regression | `node tests/sidepanel-tab-aware-smoke.test.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Requirement Evidence Matrix

| Requirement | Automated evidence required | Live evidence required |
|-------------|-----------------------------|------------------------|
| HUD-01 | Manifest has one standard Skopeo command; command/side-panel messages carry explicit tab id; action handler stays side-panel-only; no static/automation-list Skopeo entry; duplicate invoke retains one runtime | Shortcut registration/remapping and collision behavior; no visual/runtime activation before explicit invoke |
| HUD-02 | Close/back state matrix; `Escape Escape` kill; abort; monotonic generation; late result rejection; clean reinvoke; tab isolation | Kill a delayed fixture, wait through completion and service-worker suspension/wake, confirm no resurrection |
| HUD-03 | Root/listener/observer/timer/animation/focus-hook counts return to baseline; teardown twice is harmless; host attribute/style snapshot is unchanged | DevTools inspection after close, kill, reload, and navigation in Drive and Docs |
| HUD-04 | Pointer envelope is transparent; only visible controls opt in; no host layout properties mutate; unrelated synthetic events remain unprevented | Drive and Docs editing, row, menu, selection, scroll, and native Escape flows remain usable at each attention level |
| HUD-05 | Accessible names/roles, legal tab order, focus capture/restore, hidden-state exclusion, `:focus-visible`, reduced-motion rule, contrast calculation, target dimensions | Keyboard-only, VoiceOver, 200% zoom/reflow, increased/forced contrast, reduced motion, focus not obscured |
| HUD-07 | Exactly six primitive types under one shell/registry; duplicate host count remains one | Controlled visual demonstration checked against the UI-SPEC/design reference |
| HUD-08 | Policy accepts legal and rejects illegal ambient/anchored/focused/interstitial primitive sets; halo/ghost/gate scarcity tests | Visual and keyboard state ladder walkthrough from off through interstitial and back |

---

## Wave 0 Requirements

- [ ] `tests/skopeo-session-lifecycle.test.js` — pure per-tab generation reducer, command/side-panel activation, cancellation ordering, stale async rejection, tab isolation, navigation teardown, and restricted-tab rollback.
- [ ] `tests/skopeo-shell-contract.test.js` — one-root invariant, exactly six primitives, attention allowlist, pointer-transparent envelope, hostile text, idempotent teardown, no host mutation, and non-vacuous resource-ledger assertions.
- [ ] `tests/skopeo-sidepanel-command.test.js` — manifest command, unchanged toolbar action, explicit-tab routing, side-panel toggle/status contract, and negative assertion that Skopeo is absent from static/automation injection lists.
- [ ] `tests/skopeo-accessibility.test.js` — roles/names, ambient/anchored no-focus-steal, focused/interstitial focus management, focus restoration fallback, hidden-node exclusion, focus-visible styles, target sizing, contrast tokens, and reduced-motion behavior.
- [ ] Shared resource-ledger fixture — records added listeners, observers, timeouts, intervals, animation frames, roots, top-layer/popover state, and focus hooks; a deliberately leaked fixture must make the zero-residue assertion fail.

These tests and the resource ledger must land before or with their first production counterparts, not in a final hardening-only plan.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chrome command registration, collision, and remapping | HUD-01 | Shortcut ownership depends on Chrome, macOS, and installed extensions | Reload unpacked extension; inspect `chrome://extensions/shortcuts`; verify `Option+Space` when available and a remapped fallback; ensure toolbar still opens the side panel |
| Drive/Docs control pass-through and stacking | HUD-03, HUD-04 | Current Google surfaces are virtualized/canvas-heavy and not faithfully reproduced in Node | In representative Drive and Docs pages, exercise row open/select, menus, editing, native Escape, scroll, zoom, and page navigation at each attention level; verify no control is shifted, hidden, or intercepted |
| VoiceOver and accessibility tree | HUD-05 | VM mocks cannot prove assistive-technology traversal/announcement across Shadow DOM | With VoiceOver, invoke Skopeo, traverse named controls, enter/leave focused and gate states, close/kill, verify origin focus returns and hidden primitives disappear |
| 200% zoom, contrast modes, and reduced motion | HUD-04, HUD-05 | Requires real layout/computed style and OS preferences | Test 200% browser zoom and narrow viewport; macOS increased contrast/forced-colors equivalent where available; reduced motion; confirm no clipped required control or motion-only meaning |
| Real late-completion resurrection test | HUD-02, HUD-03 | Requires actual MV3 service-worker scheduling | Start a delayed fixture, kill immediately, allow completion, let the service worker suspend/wake, and confirm there is no root, listener, status flip, or delayed render |

Manual UAT is a release gate for Phase 52 claims; automated success alone cannot mark these behaviors verified.

---

## Threat Verification

| Threat | Blocking severity | Required proof before phase completion |
|--------|-------------------|----------------------------------------|
| T-52-01 stale resurrection | High | Late completion after kill and after reinvoke cannot render into either old or new generation |
| T-52-02 host interception/obstruction | High | Automated pointer/layout contract plus live Drive/Docs pass-through UAT |
| T-52-03 host text injection | High | Hostile strings remain text and cannot create markup, event handlers, or privileged actions |
| T-52-04 focus loss/trap | Medium | Focus policy unit tests plus keyboard/VoiceOver restoration UAT |
| T-52-05 duplicate injection | Medium | Repeated invoke yields one host and baseline resource counts after teardown |
| T-52-06 partial restricted-tab state | Medium | Failed injection leaves controller off and no tab/session residue beyond a terminal generation record |
| T-52-07 wrong-tab routing | Medium | Tab-switch race fixture proves command event tab and side-panel explicit tab id are respected |

No plan may pass while T-52-01, T-52-02, or T-52-03 evidence is missing.

---

## Validation Sign-Off

- [ ] Every concrete plan task is mapped back into the Per-Task Verification Map.
- [ ] All tasks have an automated verify command or an explicit Wave 0 dependency.
- [ ] Sampling continuity: no three consecutive tasks without automated verification.
- [ ] Wave 0 covers all four missing test files and the non-vacuous resource ledger.
- [ ] Phase suite uses no watch-mode flags and exits nonzero on failure.
- [ ] Quick feedback latency is below 30 seconds.
- [ ] Full `npm run validate:extension && npm test` exits 0.
- [ ] All five live Chrome UAT rows are completed with recorded evidence.
- [ ] High-severity threat proofs are green.
- [ ] `nyquist_compliant: true` and `wave_0_complete: true` are set only after the corresponding evidence exists.

**Approval:** pending UI-SPEC, executable plans, implementation, and UAT
