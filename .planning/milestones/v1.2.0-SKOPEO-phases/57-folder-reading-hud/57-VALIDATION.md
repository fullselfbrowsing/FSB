---
phase: 57
slug: folder-reading-hud
status: automated_green_human_needed
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-11
last_validated: 2026-08-12
---

# Phase 57 — Validation Strategy

> Per-phase validation contract for sampling the Folder & Reading HUD during execution. Deterministic structural and security evidence stays separate from legal-domain approval and authorized live Drive/Docs evidence.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:assert` with repository fake-Chrome/VM harnesses and the existing local-Chrome browser contract |
| **Config file** | `package.json` scripts; no separate test-runner config |
| **Quick run command** | The current task's focused `node tests/skopeo-hud-*.test.js` command plus `node --check` for changed classic scripts; after Plan 57-05 creates it, `npm run test:skopeo-hud-evals` |
| **Full suite command** | `npm run test:skopeo-truth-evals && npm run test:skopeo-hud-evals && node tests/skopeo-session-lifecycle.test.js && node tests/skopeo-browser-contract.test.js && node scripts/verify-skopeo-storage-boundary.mjs && npm run validate:extension && npm test` |
| **Estimated runtime** | Focused target <30 seconds; full-suite baseline measured during execution |

---

## Sampling Rate

- **After every task commit:** Run the task's directly owned focused command and `node --check` for every changed JavaScript file.
- **After every plan wave:** Run every Phase 57 focused command whose artifacts exist, plus affected Phase 52–56 lifecycle, semantic-anchor, corpus, graph, and truth regressions.
- **After the aggregate exists:** Run `npm run test:skopeo-hud-evals && node tests/skopeo-session-lifecycle.test.js && node tests/skopeo-browser-contract.test.js && node scripts/verify-skopeo-storage-boundary.mjs && npm run validate:extension` after every integration or phase-gate repair.
- **Before `$gsd-verify-work`:** The full suite command must be green. A focused isolated pass does not override a failed repository-wide gate.
- **Max feedback latency:** 30 seconds for a focused task command; split a focused fixture runner if measurement exceeds this bound.

---

## Per-Task Verification Map

The plan IDs below define the intended ownership sequence from `57-RESEARCH.md`. The planner may split a row only when every resulting task retains an automated command and the same security oracle.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 57-01-01 | 01 | 1 | VIEW-01, VIEW-02, VIEW-03 | T57-01, T57-02, T57-05, T57-08 | RED closed folder/reading schema fixes exact own keys, enums, typed civil dates, bounded text/cards/facts/gaps, explicit overflow, neutral later-phase slots, and deep-frozen output before production exists | unit | controlled RED run for `node tests/skopeo-hud-schema.test.js` with a unique contract marker | ✅ | ✅ green |
| 57-01-02 | 01 | 1 | VIEW-01, VIEW-02, VIEW-03 | T57-01, T57-02, T57-05, T57-08 | GREEN schema and pure projector reject hostile/accessor/prototype shapes, never infer absence from incomplete state, preserve separate notice/renewal/termination/expiration meanings, and remain permutation-invariant | unit | `node --check extension/utils/skopeo-hud-schema.js && node --check extension/utils/skopeo-hud-projector.js && node tests/skopeo-hud-schema.test.js && node tests/skopeo-hud-projector.test.js` | ✅ | ✅ green |
| 57-01-03 | 01 | 1 | VIEW-01, VIEW-02, VIEW-03 | T57-02, T57-05, T57-08 | Vendor aggregation exposes owner, index, governing, next-date, memo, and evidence-backed gap states while policy/memo obligations and notification delivery remain explicitly unevaluated rather than invented | unit/eval | `node tests/skopeo-hud-projector.test.js` | ✅ | ✅ green |
| 57-02-01 | 02 | 2 | VIEW-01, VIEW-02, VIEW-03, VIEW-05 | T57-02, T57-03, T57-05, T57-06 | RED truth-display/store/runtime contracts require a complete active generation and exact family/source/version/digest/evaluation-context equality, with no content or MCP authority | unit/integration | controlled RED runs for the Phase 57 additions to truth-store, truth-engine, and HUD runtime tests | ✅ | ✅ green |
| 57-02-02 | 02 | 2 | VIEW-01, VIEW-02, VIEW-03, VIEW-05 | T57-02, T57-03, T57-05, T57-06 | One private bounded display snapshot returns only current minimized projections; stale, incomplete, ambiguous, over-cap, or failed reads withdraw the whole result and publish no prefix | unit/integration | `node tests/skopeo-truth-store.test.js && node tests/skopeo-truth-runtime.test.js && node tests/skopeo-hud-runtime.test.js` | ✅ | ✅ green |
| 57-02-03 | 02 | 2 | VIEW-02, VIEW-03 | T57-02, T57-05 | Recompute is deduplicated by exact controller/context, aborts on teardown, rechecks current evaluation context before exposure, and never promotes deferred Phase 56 human evidence | integration | `npm run test:skopeo-truth-evals && node tests/skopeo-hud-runtime.test.js && node scripts/verify-skopeo-storage-boundary.mjs` | ✅ | ✅ green |
| 57-03-01 | 03 | 3 | VIEW-01, VIEW-04, VIEW-05 | T57-01, T57-03, T57-04, T57-06 | RED background controller contracts fix exact message keys, sender-tab/current-context authority, opaque one-shot citation actions, and zero raw source/graph/truth transfer to content | integration/security | controlled RED run for `node tests/skopeo-hud-runtime.test.js` with background/controller marker | ✅ | ✅ green |
| 57-03-02 | 03 | 3 | VIEW-01, VIEW-04, VIEW-05 | T57-03, T57-04, T57-05, T57-06 | Folder/reading projections are tied to the full current tuple; citation prepare/commit rejects replay, cross-tab use, source revision drift, access revocation, generation drift, and navigation drift | integration/security | `node --check extension/background.js && node tests/skopeo-hud-runtime.test.js && node tests/skopeo-corpus-runtime.test.js` | ✅ | ✅ green |
| 57-03-03 | 03 | 3 | VIEW-04 | T57-03, T57-04 | The only Phase 57 action opens a freshly authorized exact governing document or clause through the background; arbitrary URLs, page labels, and caller-supplied locators never authorize navigation | integration/security | `node tests/skopeo-hud-runtime.test.js` | ✅ | ✅ green |
| 57-04-01 | 04 | 4 | VIEW-01, VIEW-03, VIEW-04, VIEW-05 | T57-01, T57-03, T57-06, T57-08 | RED content contract fixes exact versioned folder/reading models, enum-to-copy mapping, withdrawal-first currentness, opaque action dispatch, and absence of Phase 58/59 controls | unit/integration | controlled RED runs for Phase 57 composer/runtime fixtures | ✅ | ✅ green |
| 57-04-02 | 04 | 4 | VIEW-01, VIEW-03, VIEW-04, VIEW-05 | T57-01, T57-03, T57-06, T57-08 | Composer and runtime consume only closed frozen atoms, ignore stale responses, withdraw before rebind, never read Drive/storage/tabs directly, and never infer truth from host text, URLs, colors, or file order | unit/integration | `node --check extension/content/skopeo-adaptive-composer.js && node --check extension/content/skopeo-runtime.js && node tests/skopeo-hud-runtime.test.js && node tests/skopeo-adaptive-composer.test.js` | ✅ | ✅ green |
| 57-05-01 | 05 | 5 | VIEW-01, VIEW-02, VIEW-03, VIEW-04, VIEW-05 | T57-01, T57-03, T57-07, T57-08 | RED shell/browser contract fixes one bounded rail, sticky reading-state banner, semantic headings/lists/buttons, exact copy, keyboard/focus/live-region behavior, responsive safety, and zero residue | browser/a11y | controlled RED runs for Phase 57 shell and browser-contract fixtures | ✅ | ✅ green |
| 57-05-02 | 05 | 5 | VIEW-01, VIEW-02, VIEW-03, VIEW-04, VIEW-05 | T57-01–T57-08 | The existing Shadow shell renders the approved UI-SPEC without host mutation or interception, keeps historical/superseded state unmistakable, opens only current cited evidence, and tears all resources down exactly | browser/a11y/integration | `node tests/skopeo-hud-runtime.test.js && node tests/skopeo-session-lifecycle.test.js && node tests/skopeo-browser-contract.test.js` | ✅ | ✅ green |
| 57-05-03 | 05 | 5 | All Phase 57 IDs | T57-01–T57-08 | Versioned fixtures cover the full requirement matrix and hostile/race/cap/access cases; automated, legal-domain, and live-host evidence statuses remain independent and human work remains `human_needed` | eval/regression | `npm run test:skopeo-hud-evals && node scripts/verify-skopeo-storage-boundary.mjs && npm run validate:extension && npm test` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/skopeo-hud-schema.test.js` — exact folder/reading projection keys, enums, typed dates, safe bounded text, caps/max+1, accessors/prototypes, deep freeze, explicit overflow, and neutral downstream slots.
- [x] `tests/skopeo-hud-projector.test.js` — deterministic vendor/family joins, owner/index/memo evidence, governing states, separate material-date meanings, absence proof, all eight VIEW-03 gap categories, ambiguity, and permutation invariance.
- [x] `tests/skopeo-hud-runtime.test.js` — private complete truth snapshot, exact background/content messages, current tuple, deduplicated recompute, withdrawal-first races, action registry, citation prepare/commit, replay/cross-tab/revision/access rejection, and no content authority.
- [x] Phase 57 additions to `tests/skopeo-adaptive-composer.test.js` — closed folder/reading atoms, Skopeo-owned copy, later-phase control absence, hostile text, stale response, and opaque action dispatch.
- [x] Phase 57 additions to `tests/skopeo-browser-contract.test.js` — Drive folder and Docs reading flows, semantic identity drift, historical/superseded banner, pagination, narrow/zoom/high-contrast/reduced-motion behavior, keyboard/VoiceOver semantics, and exact teardown.
- [x] `tests/skopeo-hud-evals.test.js` and `tests/fixtures/skopeo-hud-evals/` — 34 deterministic structural/security cases cover the approved adversarial inventory.
- [x] `package.json` — `test:skopeo-hud-evals` owns the focused Phase 57 tests and runs exactly once immediately after the truth aggregate.

No test framework or external package installation is required.

## Actual Execution Results

Recorded 2026-08-12 from the Phase 57 Plan 05 isolated worktree:

| Gate | Result | Evidence |
|---|---|---|
| `npm run test:skopeo-truth-evals` | PASS | Truth schema, deadlines, extraction, adjudication, store, runtime, real handoff, and truth eval aggregate passed. |
| `npm run test:skopeo-hud-evals` | PASS | Schema, projector, actual content/runtime harness, and all 34 HUD cases passed. |
| HUD eval dimensions | PASS / pending | `deterministic_structural_security: pass (34/34)`; `provisional_regression: pass (34/34; synthetic_non_gold)`; `domain_fidelity: human_needed`; `authorized_live_drive_docs: human_needed`. |
| `node tests/skopeo-session-lifecycle.test.js` | PASS | Runtime integration and exact session lifecycle contracts passed. |
| `node tests/skopeo-browser-contract.test.js` | PASS | Real local Chrome passed geometry, accessibility, host-coexistence, lifecycle, and storage-boundary observations. The DevTools startup allowance was raised from 5s to 15s after two startup-only timeouts under concurrent load. |
| `node scripts/verify-skopeo-storage-boundary.mjs` | PASS | 33 injected/dependency files passed the storage boundary. |
| `npm run validate:extension` | PASS | Manifest, 443 classic scripts, profile/index, storage, origin, catalog, T1, and write-evidence gates passed. |
| `npm test` | PASS | Full repository suite passed after reusing already-installed local dependency trees; no install, dependency, or lockfile change occurred. |

The four authorized/manual checks remain 0 of 4, `human_needed`, and `live_approved: false` in `57-HUMAN-UAT.md`. Automated or synthetic evidence does not satisfy those checks.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Legal/domain accuracy of governing, historical, date, consequence, and gap labels | VIEW-01, VIEW-02, VIEW-03, VIEW-04 | Agreement status, clause applicability, absence proof, and deadline meaning require commercial-contract counsel and legal-operations judgment | Keep synthetic/redacted fixture outcomes provisional and `domain_fidelity: human_needed` until approved reviewers adjudicate representative governing, superseded, partial, conflict, notice, renewal, termination, expiration, missing-final, and memo/policy cases with reviewer/version evidence. |
| Authorized live Drive folder inventory and Docs binding | VIEW-01, VIEW-04, VIEW-05 | Current Google host identity, virtualization, real permissions, and source routing require an explicitly authorized signed-in session | Invoke Skopeo on representative Drive vendor/root folders and current/historical Docs, verify the projected vendor set and reading state against accessible sources, then reorder/navigate/revoke access and confirm immediate withdrawal without wrong-target paint. |
| Exact governing-source navigation | VIEW-04, VIEW-05 | CI cannot prove that a live opaque Drive/Docs locator opens the correct current document and useful clause location | Open each Phase 57 citation action in an authorized session, confirm the exact governing source and cited location, then test replay, tab change, source revision, and access revocation; every stale attempt must fail closed. |
| Density, accessibility, and host coexistence on representative folders/documents | VIEW-01, VIEW-03, VIEW-04, VIEW-05 | Useful information density, VoiceOver output, host-control coexistence, and real platform preferences require human observation | Exercise vendor pagination, keyboard order, Escape, focus restoration, 200% zoom, narrow viewport, reduced motion, forced colors/high contrast, and VoiceOver while confirming Drive/Docs selection, editing, menus, scrolling, and teardown remain intact. |

These rows remain `human_needed`; deterministic fixtures must not convert them into automated approval.

---

## Threat References

| Ref | Threat | Required automated proof |
|-----|--------|--------------------------|
| T57-01 | Hostile source, vendor, owner, contract, or prompt-like text becomes markup, executable content, hidden structure, or UI authority | Exact-own-key parsing, accessor/prototype rejection, bounded text-only sinks, local enum-to-copy maps, and hostile-string fixtures |
| T57-02 | Missing or incomplete corpus/graph/truth data is treated as proof of absence, governing state, a deadline, or an operational failure | Complete-set/evaluation-context requirements, explicit unknown/not-evaluated/blocker states, absence-proof fixtures, and no prefix publication |
| T57-03 | Stale generation, context epoch, semantic identity, binding epoch, tab, document, or folder receives or retains another context's projection | Full-tuple admission/recheck, withdraw-first races, ABA/navigation fixtures, and exact teardown |
| T57-04 | Citation tokens or caller-supplied URLs/locators are replayed, crossed between tabs, or used after source/access drift | Controller-owned one-shot opaque tokens, prepare/commit reauthorization, source/version/access checks, replay and cross-tab rejection |
| T57-05 | Over-cap, partial, ambiguous, stale, or faulted projections publish a misleading usable prefix | Exact caps/max+1 tests, explicit overflow only where authorized, whole-result fail-closed behavior, deterministic ordering, and abort tests |
| T57-06 | Content, page scripts, MCP, or another surface obtains raw corpus/graph/truth/provider/storage authority | Static/runtime boundary checks, private minimized facade, exact messages, no direct storage/Drive/tabs reads in content, and no raw diagnostic leakage |
| T57-07 | New rail/banner UI intercepts host controls, steals focus, becomes inaccessible, resurrects after dismissal, or leaves resources behind | Browser-computed geometry, keyboard/VoiceOver/zoom/preferences tests, resource certificate, cancellation/race tests, and exact zero-residue assertions |
| T57-08 | Phase 57 invents ask, policy/memo obligation, approval, notification-delivery, or other Phase 58–59 capability/state | Closed model/control allowlists, neutral unevaluated slots, absent-control source assertions, and requirement-level eval fixtures |

---

## Validation Sign-Off

- [x] Every intended plan family has a focused automated command or an explicit Wave 0 dependency.
- [x] Sampling continuity requires automated verification after every task; no three-task gap is permitted.
- [x] Wave 0 enumerates every missing focused test, fixture, and package-script artifact.
- [x] Commands contain no watch-mode flags.
- [x] Focused feedback target is <30 seconds, with a required split if measurement exceeds it.
- [x] Exact-set completeness, absence proof, current-context binding, citation authorization, phase-boundary closure, accessibility, and teardown each have a focused oracle.
- [x] Deterministic structural/security status remains separate from legal/domain and authorized live-host evidence; pending human evidence remains `human_needed`.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** strategy approved 2026-08-11; automated execution passed 2026-08-12; domain, authorized live Drive/Docs, and manual accessibility evidence remain `human_needed`
