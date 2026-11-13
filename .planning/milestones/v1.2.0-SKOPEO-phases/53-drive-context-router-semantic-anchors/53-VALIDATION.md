---
phase: 53
slug: drive-context-router-semantic-anchors
status: partial
nyquist_compliant: true
wave_0_complete: true
automated_status: pass
live_approved: false
created: 2026-07-15
last_validated: 2026-07-15
---

# Phase 53 — Validation Strategy

> Feedback-sampling contract for Drive/Docs context recognition, semantic identity, withdraw-first rebinding, fail-quiet projection, and stale-work safety. Source of truth: `53-CONTEXT.md`; technical evidence: `53-RESEARCH.md`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Standalone Node tests using `node:assert`, VM/fake Chrome sandboxes, repository DOM fixtures, and the existing real-Chrome Skopeo browser contract |
| **Config file** | `package.json` scripts plus direct `node tests/<name>.test.js` execution |
| **Closest harnesses** | `tests/skopeo-session-lifecycle.test.js`, `tests/skopeo-shell-contract.test.js`, `tests/skopeo-accessibility.test.js`, `tests/skopeo-sidepanel-command.test.js`, `tests/skopeo-browser-contract.test.js`, `tests/helpers/skopeo-resource-ledger.js` |
| **Quick run command** | `node tests/skopeo-context-router.test.js && node tests/skopeo-anchor-registry.test.js` |
| **Phase suite command** | `node tests/skopeo-context-router.test.js && node tests/skopeo-anchor-registry.test.js && node tests/skopeo-session-lifecycle.test.js && node tests/skopeo-shell-contract.test.js && node tests/skopeo-sidepanel-command.test.js && node tests/skopeo-accessibility.test.js && node tests/skopeo-browser-contract.test.js` |
| **Full suite command** | `npm run validate:extension && npm test` |
| **Estimated runtime** | Pure quick tests target <10 seconds; focused phase suite target <60 seconds; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** Run the new or existing test file that owns the changed contract; never leave three consecutive tasks without an automated sample.
- **After router/result changes:** Run `node tests/skopeo-context-router.test.js`.
- **After descriptor/registry changes:** Run `node tests/skopeo-anchor-registry.test.js`.
- **After runtime authority/navigation changes:** Run `node tests/skopeo-context-router.test.js && node tests/skopeo-anchor-registry.test.js && node tests/skopeo-session-lifecycle.test.js`.
- **After shell/accessibility changes:** Run `node tests/skopeo-shell-contract.test.js && node tests/skopeo-accessibility.test.js`.
- **After injection/background changes:** Run `node tests/skopeo-sidepanel-command.test.js && node tests/extension-content-script-files-completeness.test.js`.
- **After every plan wave:** Run the complete Phase 53 suite.
- **Before `$gsd-verify-work`:** Run `npm run validate:extension && npm test`, then complete live Drive/Docs anchor UAT or retain it explicitly as `human_needed` without claiming live approval.
- **Max automated feedback latency:** 60 seconds for the focused phase suite and 10 seconds for pure task-level contract tests.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 53-01-T1 | 53-01 | 1 | HUD-06 | T-53-03, T-53-04 | Pin closed results, exact origin, hostile data, and monotonic context epochs before production | unit/oracle | `node tests/skopeo-context-router.test.js --self-test` | ✅ | ✅ green |
| 53-01-T2 | 53-01 | 1 | HUD-06 | T-53-03, T-53-04 | Implement the exact-origin production router with frozen outputs and fail-quiet reasons | unit/contract | `node tests/skopeo-context-router.test.js` | ✅ | ✅ green |
| 53-02-T1 | 53-02 | 1 | HUD-09 | T-53-01, T-53-02, T-53-05 | Pin deterministic node reuse, ABA, reverse completion, and eleven-category ownership | unit/oracle | `node tests/skopeo-anchor-registry.test.js --self-test` | ✅ | ✅ green |
| 53-02-T2 | 53-02 | 1 | HUD-09 | T-53-01, T-53-02, T-53-05 | Implement immutable descriptors, withdraw-first bindings, final tuple checks, and exact cleanup | unit/VM | `node tests/skopeo-anchor-registry.test.js` | ✅ | ✅ green |
| 53-03-T1 | 53-03 | 2 | HUD-06, HUD-09 | T-53-03, T-53-06 | Pin exact quiet copy, 8×8 geometry, accessibility, host integrity, and teardown | unit/VM | `node tests/skopeo-shell-contract.test.js && node tests/skopeo-accessibility.test.js` | ✅ | ✅ green |
| 53-03-T2 | 53-03 | 2 | HUD-06, HUD-09 | T-53-01, T-53-03, T-53-06 | Implement closed projection plus one revocable semantic mark with no positional interpolation | unit/VM | `node tests/skopeo-shell-contract.test.js && node tests/skopeo-accessibility.test.js` | ✅ | ✅ green |
| 53-04-T1 | 53-04 | 3 | HUD-06, HUD-09 | T-53-02, T-53-05 | Extend lifecycle/controller tests over route epochs, forged tuples, navigation, and terminal state | integration | `node tests/skopeo-session-lifecycle.test.js` | ✅ | ✅ green |
| 53-04-T2 | 53-04 | 3 | HUD-06, HUD-09 | T-53-01, T-53-02, T-53-05 | Make runtime own router, registry, authority callbacks, and combined resources | integration | router + registry + lifecycle focused chain | ✅ | ✅ green |
| 53-04-T3 | 53-04 | 3 | HUD-06, HUD-09 | T-53-04, T-53-05 | Inject four scripts in exact dynamic order and split SPA handoff from terminal navigation | contract/smoke | side-panel + injection-completeness contracts | ✅ | ✅ green |
| 53-05-T1 | 53-05 | 4 | HUD-06, HUD-09 | T-53-01 through T-53-06 | Execute production-stack Chrome reuse/reorder/detach/ABA/route/scroll/resize/zoom and 100-cycle closure | browser/adversarial | `node tests/skopeo-browser-contract.test.js` | ✅ | ✅ green |
| 53-05-T2 | 53-05 | 4 | HUD-06, HUD-09 | T-53-05-01, T-53-05-03, T-53-05-06 | Record every required live scenario without inventing current Google selectors or retaining sensitive content | evidence ledger | file/schema/privacy grep gate | ✅ | ✅ ledger; ⚠️ live `human_needed` |
| 53-05-T3 | 53-05 | 4 | HUD-06, HUD-09 | T-53-05-05, T-53-05-06 | Register both tests exactly once, run focused/extension/full gates, and retain honest live status | full regression | package-order check + focused + extension + `npm test` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Requirement Evidence Matrix

| Requirement | Automated evidence required | Automated status | Live evidence required | Live status |
|-------------|-----------------------------|------------------|------------------------|-------------|
| HUD-06 | Router exposes only closed result kinds/reasons; all four recognized contexts require stable identity evidence; ambiguous/unsupported/near-neighbor/hostile inputs render one generic ambient reason, zero anchors, no focus write, and no gate | ✅ PASS | Representative configured corpus, vendor folder, agreement-reading, and focused-ask contexts plus unrelated Drive/Docs/web pages; uncertain state explains failure without guessing identity | ⚠️ `human_needed` |
| HUD-09 | File/document/opaque target descriptor is independent of node/range; reuse/reorder/detach/ABA/delayed promise/SPA epoch/scroll/zoom/resize fixtures require matching generation+context+identity and safe geometry; invalid targets withdraw synchronously; teardown returns exact eleven-category zero | ✅ PASS | Current Drive list/grid/density scrolling and row reuse, SPA/back/forward navigation, Docs document/tab/target views, zoom/resize, and evidence showing no wrong-target frame | ⚠️ `human_needed` |

---

## Wave 0 Requirements

- [x] `tests/skopeo-context-router.test.js` — exact-origin and near-neighbor routes, four recognized context classes, trusted/missing/conflicting stable identity hints, closed evidence/reason vocabularies, context epochs, hostile data, and fail-quiet mapping.
- [x] `tests/skopeo-anchor-registry.test.js` — immutable descriptor normalization, virtualized row node reuse, reorder, detach/reattach, ABA, out-of-order resolver completion, viewport bounds, batched signal handling, geometry/authority recheck, and synchronous withdrawal.
- [x] Virtualized-row/route fixture — changes one live node from `file-A` to `file-B`, reverses async completion order, changes geometry, and exposes deterministic mutation/scroll/resize scheduling without real sleeps.
- [x] Resource-ledger extension — anchor observers, validation frames, and pending resolver work produce non-vacuous owned-resource counts and return to exact zero.
- [x] Live-recon evidence template — records Chrome build, page kind, route, stable identity signal, locator candidate, paired negative control, and withdrawal/rebind observation without retaining private page content.

These fixtures must land before or with the first production counterpart. No selector or identity signal may be accepted solely because a happy-path fixture matched it once.

---

## Automated Adversarial Matrix

| Case | Requirement | Expected secure outcome |
|------|-------------|-------------------------|
| One recycled row changes from `file-A` to `file-B` before old resolution returns | HUD-09 | Old surface is removed synchronously; delayed `file-A` result cannot commit; `file-B` binds only after fresh proof |
| Same node returns to `file-A` after representing `file-B` (ABA) | HUD-09 | Old binding epoch remains invalid; fresh resolution and final tuple proof are mandatory |
| Vendor label matches but stable ID is missing/conflicting | HUD-06, HUD-09 | `uncertain`; generic ambient reason; no vendor name or anchor rendered |
| Near-neighbor origin such as `docs.google.com.evil.example` | HUD-06 | `unsupported`; no document ID parsing or Skopeo anchor |
| Attribute/text contains selector, HTML, event, or code-like payload | HUD-06 | Data is bounded/rejected and rendered only as trusted generic copy; no dynamic selector/code/HTML execution |
| Two same-document route changes resolve in reverse order | HUD-09 | Only the newest context epoch may commit |
| Scroll/resize/zoom detaches or makes the target unsafe | HUD-09 | Dependent projection withdraws before replacement; host controls remain unobscured |
| Kill/replacement during observer/rAF/resolver work | HUD-06, HUD-09 | Terminal generation wins; no later ready/render; all owned resource categories return to zero |

---

## Threat Verification

| Threat | Blocking severity | Automated proof | Automated status | Live status |
|--------|-------------------|-----------------|------------------|-------------|
| T-53-01 wrong-row projection | High | Node-reuse/reorder/ABA fixtures plus real-browser row geometry prove semantic validation and withdraw-first behavior | ✅ green | ⚠️ `human_needed` |
| T-53-02 stale async/context work | High | Delayed resolver after generation/context/identity change cannot commit under any completion order | ✅ green | ⚠️ `human_needed` |
| T-53-03 hostile page-data injection | High | Closed vocabularies, bounded evidence, text-only generic copy, and hostile attribute/text negatives | ✅ green | ⚠️ `human_needed` |
| T-53-04 cross-origin/spoof route | High | Exact origin allowlist and near-neighbor/restricted/opaque-origin negatives | ✅ green | ⚠️ `human_needed` |
| T-53-05 observer/resource leak | Medium | Non-vacuous ledger acquisition and exact zero after off, replacement, hard navigation, and repeated teardown | ✅ green | ⚠️ `human_needed` |
| T-53-06 host interception/obstruction | Medium | Collision/scroll/zoom/resize contract plus live Drive/Docs control pass-through | ✅ green | ⚠️ `human_needed` |
| T-53-07 diagnostic content leakage | Medium | Logs contain only closed reason/identity metadata and never retain private page content | ✅ green | ⚠️ `human_needed` |

No plan may pass while T-53-01 through T-53-04 lack automated negative proof.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Current Drive row/folder identity signals | HUD-06, HUD-09 | Google does not publish a stable Drive DOM contract and layouts recycle rows | Record Chrome build; test list/grid and density variants; capture stable signal plus paired negative; rapidly scroll/reorder and confirm withdrawal before reuse; do not approve class-name-only signals |
| Docs document/tab/opaque target binding | HUD-06, HUD-09 | URL proves document ID but not arbitrary target identity or live range validity | Test document URL ID, tab/view changes, target/range mutation, same-document navigation, and opaque trusted-key handoff; invalidate the target and confirm immediate withdrawal |
| No wrong-target paint frame | HUD-09 | Node fixtures cannot prove current Chrome paint ordering on live Drive | Capture screenshot/video or timestamped observer trace during fast scrolling, row reuse, SPA navigation, zoom, and resize; no annotation may appear on the wrong file/document/target |
| Host control coexistence and accessibility tree | HUD-06, HUD-09 | Current Google hit testing and Shadow DOM accessibility require a real browser/AT | Exercise Drive rows/menus/scrollbar and Docs editing/selection; keyboard and VoiceOver; generic failure copy announced once; no hidden anchor surface or focus theft |

Live rows may remain `human_needed` if the user defers them, but neither phase verification nor release notes may claim live Drive/Docs approval without evidence.

---

## Executed Evidence — 2026-07-15

| ID | Command / evidence | Result | Notes |
|----|--------------------|--------|-------|
| A1 | package once-only/order assertion | **PASS (exit 0)** | `skopeo-context-router.test.js` and `skopeo-anchor-registry.test.js` each occur once and precede the existing session/shell/side-panel/accessibility/browser segment. |
| A2 | Focused Phase 53 seven-test chain | **PASS (exit 0)** | Router, registry, runtime/lifecycle, shell, side-panel, accessibility, and discovered-local-Chrome browser contracts passed. Browser output included `node-reuse,ABA,reorder,detach,reverse-route,scroll,zoom,resize-420`. |
| A3 | `npm run validate:extension` | **PASS (exit 0)** | Manifest valid; 413 extension JavaScript files parsed cleanly; recipe, classification, catalog, origin, readiness, port, and write-activation gates passed. |
| A4 | `npm test` | **PASS (exit 0)** | The final 246-command default chain included both new Phase 53 contracts and completed through the no-orphan-descriptor gate with no failure. |
| A5 | `53-LIVE-RECON.md` schema/scenario/privacy grep gate | **PASS (exit 0)** | Twelve required scenario rows exist. Every row remains `human_needed`; `live_approved: false`. No fixture result was promoted to a current-Google claim. |
| A6 | Generated-artifact and diff hygiene | **PASS** | Full regression changed only generated date stamps in `llms-full.txt` and `sitemap.xml`; those mechanical diffs were inspected and restored with `apply_patch`. `git diff --check` passed. |

Automated Nyquist evidence is complete for HUD-06, HUD-09, and high-severity T-53-01 through T-53-04. This does not change the live-evidence disposition.

---

## Validation Sign-Off

- [x] Every concrete plan task is mapped back into the Per-Task Verification Map.
- [x] Every task has an automated verify command or an explicit live-evidence disposition.
- [x] Sampling continuity: no three consecutive tasks without automated verification.
- [x] Wave 0 covers both new test files, deterministic virtualized-row scheduling, resource accounting, and live evidence format.
- [x] Phase suite uses no watch-mode flags and exits nonzero on failure.
- [x] Pure quick feedback is below 10 seconds and the focused phase suite below 60 seconds.
- [x] Full `npm run validate:extension && npm test` exits 0.
- [x] All HUD-06/HUD-09 automated evidence rows and T-53-01 through T-53-04 high-severity automated threat proofs are green.
- [x] Live Drive/Docs results are recorded honestly as `human_needed`.
- [x] `nyquist_compliant: true` and `wave_0_complete: true` reflect executed automated evidence only.

**Approval:** automated Phase 53 evidence PASS; live Drive/Docs/VoiceOver evidence remains `human_needed`, so this validation is partial and **not live-approved**.
