---
phase: 58
slug: cited-ask-decision-policy
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-27
last_validated: 2026-08-27
---

# Phase 58 — Validation Strategy

> Per-phase sampling contract for permission-scoped cited answers and deterministic Document 10 / complex-agreement memo safeguards. Automated structural and security evidence remains separate from legal-domain approval and authorized live Drive/Docs evidence.

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Node.js `node:assert` with repository fake-Chrome/VM harnesses and the existing local-Chrome browser contract |
| **Config file** | `package.json` scripts; no separate runner config |
| **Quick run command** | Current task's focused `node tests/skopeo-ask-*.test.js` / `node tests/skopeo-decision-policy.test.js` command plus `node --check` for changed classic scripts |
| **Full suite command** | `npm run test:skopeo-truth-evals && npm run test:skopeo-hud-evals && npm run test:skopeo-ask-evals && node scripts/verify-skopeo-storage-boundary.mjs && npm run validate:extension && npm test` |
| **Estimated runtime** | Focused target under 30 seconds; full suite measured during execution |

## Sampling Rate

- **After every task:** run its focused automated command and `node --check` for every changed JavaScript file.
- **After every wave:** run all Phase 58 focused commands whose artifacts exist plus the directly affected corpus, truth, HUD, lifecycle, and browser regressions.
- **After aggregate integration:** run `npm run test:skopeo-ask-evals`, HUD/truth regressions, storage-boundary verification, and extension validation after every gate repair.
- **Before phase verification:** the full suite command must pass. A focused pass does not override a repository-wide failure.
- **Maximum focused latency:** 30 seconds; split fixtures if a focused command exceeds it.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirements | Threat refs | Secure behavior | Test type | Automated command | File exists | Status |
|---|---:|---:|---|---|---|---|---|---|---|
| 58-01-01 | 01 | 1 | VIEW-06, VIEW-07, POLICY-01..03 | T58-01, T58-05, T58-06, T58-08, T58-09 | RED contracts fix exact question/candidate/projection shapes, stable partitioned policy identity, routine omission, and closed clearance inputs | unit/security | `SKOPEO_ASK_EXPECT_SCHEMA_RED=1 node tests/skopeo-ask-schema.test.js && SKOPEO_ASK_EXPECT_POLICY_RED=1 node tests/skopeo-decision-policy.test.js` | ✅ | ✅ |
| 58-01-02 | 01 | 1 | VIEW-06, VIEW-07 | T58-01, T58-02, T58-03, T58-05, T58-09 | Schema rejects accessors/prototypes/control text, numeric confidence, unissued citations, over-cap prefixes, and non-frozen output | unit/security | `node --check extension/utils/skopeo-ask-schema.js && node tests/skopeo-ask-schema.test.js` | ✅ | ✅ |
| 58-01-03 | 01 | 1 | POLICY-01, POLICY-02, POLICY-03 | T58-05, T58-06, T58-07, T58-08, T58-09 | Store/engine isolate partitions, accept only stable identities and explicit complex writes, require open-before-ack, invalidate drift, and never clear a blocked safeguard | unit/security | `node --check extension/utils/skopeo-decision-policy-store.js && node --check extension/utils/skopeo-decision-policy.js && node tests/skopeo-decision-policy.test.js` | ✅ | ✅ |
| 58-02-01 | 02 | 2 | VIEW-06, VIEW-07 | T58-01, T58-02, T58-03, T58-04, T58-05, T58-09 | RED ask-engine contract requires a complete current exact set, bounded inert excerpts, configured-provider binding, current citations, abort, and discard | unit/integration | `SKOPEO_ASK_EXPECT_ENGINE_RED=1 node tests/skopeo-ask-engine.test.js` | ✅ | ✅ |
| 58-02-02 | 02 | 2 | VIEW-06, VIEW-07 | T58-01..05, T58-09 | Provider candidates are parsed as inert claims; local code assigns governing/history, citations, trust, conflicts, gaps, and forced abstention | unit/integration | `node --check extension/utils/skopeo-ask-engine.js && node tests/skopeo-ask-engine.test.js` | ✅ | ✅ |
| 58-02-03 | 02 | 2 | VIEW-06, VIEW-07 | T58-01..05, T58-09 | Provider/model drift, hostile source instructions, fake handles, cross-vendor references, incomplete sets, caps, repair failure, late completion, and cancellation expose no material prefix | adversarial | `node tests/skopeo-ask-engine.test.js && node tests/skopeo-ask-schema.test.js` | ✅ | ✅ |
| 58-03-01 | 03 | 3 | VIEW-06, VIEW-07, POLICY-01..03 | T58-03..09 | RED controller contract fixes exact message keys, opaque scope/action tokens, current tuple, source-set authority, one-shot effects, and no content-readable IDs/stores | integration/security | `SKOPEO_ASK_EXPECT_CONTROLLER_RED=1 node tests/skopeo-hud-runtime.test.js` | ✅ | ✅ |
| 58-03-02 | 03 | 3 | VIEW-06, VIEW-07 | T58-01..04, T58-09 | Background resolves scope, runs exact-set query/provider/adjudication, joins closed HUD output, and revokes stale/aborted results before publication | integration/security | `node --check extension/background.js && node --check extension/utils/skopeo-hud-schema.js && node --check extension/utils/skopeo-hud-projector.js && node tests/skopeo-hud-runtime.test.js` | ✅ | ✅ |
| 58-03-03 | 03 | 3 | POLICY-01, POLICY-02, POLICY-03 | T58-03, T58-05..09 | Configuration, complex classification, review open, acknowledgement, removal, and source navigation rederive current stable identity and reject replay/cross-tab/revision/access drift | integration/security | `node tests/skopeo-hud-runtime.test.js && node tests/skopeo-decision-policy.test.js && node scripts/verify-skopeo-storage-boundary.mjs` | ✅ | ✅ |
| 58-04-01 | 04 | 4 | VIEW-06, VIEW-07, POLICY-01..03 | T58-01, T58-04, T58-05, T58-08, T58-09 | RED content contract fixes approved Focused ask/result models, enum-to-copy mapping, explicit scope, separate answer/clearance, and routine memo omission | unit/integration | `SKOPEO_ASK_EXPECT_CONTENT_RED=1 node tests/skopeo-adaptive-composer.test.js && SKOPEO_ASK_EXPECT_CONTENT_RED=1 node tests/skopeo-hud-runtime.test.js` | ✅ | ✅ |
| 58-04-02 | 04 | 4 | VIEW-07, POLICY-01..03 | T58-01, T58-05, T58-08, T58-09 | Composer admits only closed semantic models, keeps governing/history/policy sections distinct, maps categorical trust, and exposes no raw reason codes or IDs | unit | `node --check extension/content/skopeo-adaptive-composer.js && node tests/skopeo-adaptive-composer.test.js` | ✅ | ✅ |
| 58-04-03 | 04 | 4 | VIEW-06, VIEW-07, POLICY-01..03 | T58-03, T58-04, T58-07, T58-09, T58-10 | Runtime enters ask only explicitly, authorizes each request, cancels/withdraws before replacement, dispatches only current opaque actions, and leaves no provider/action/ack residue | integration | `node --check extension/content/skopeo-runtime.js && node tests/skopeo-hud-runtime.test.js && node tests/skopeo-session-lifecycle.test.js` | ✅ | ✅ |
| 58-05-01 | 05 | 5 | All Phase 58 IDs | T58-01, T58-04, T58-07, T58-10 | RED shell/browser/eval contracts fix UI-SPEC copy, native controls, focus, zoom/preferences, hostile text, host coexistence, requirement matrix, and exact teardown | browser/a11y/eval | `SKOPEO_ASK_EXPECT_SHELL_RED=1 node tests/skopeo-browser-contract.test.js && SKOPEO_ASK_EXPECT_EVAL_RED=1 node tests/skopeo-ask-evals.test.js` | ✅ | ✅ |
| 58-05-02 | 05 | 5 | All Phase 58 IDs | T58-01, T58-04, T58-07, T58-10 | Existing Shadow rail renders the approved ask/result/policy contract with native semantics, safe text, collision safety, current focus, live-region dedupe, and zero residue | browser/a11y/integration | `node --check extension/content/skopeo-shell.js && node tests/skopeo-hud-runtime.test.js && node tests/skopeo-browser-contract.test.js` | ✅ | ✅ |
| 58-05-03 | 05 | 5 | All Phase 58 IDs | T58-01..10 | Versioned fixtures and registered scripts cover complete/access-negative/stale/fake-citation/policy/memo/adversarial states while human evidence remains explicitly pending | eval/regression | `npm run test:skopeo-ask-evals && npm run test:skopeo-truth-evals && npm run test:skopeo-hud-evals && node scripts/verify-skopeo-storage-boundary.mjs && npm run validate:extension && npm test` | ✅ | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [x] `tests/skopeo-ask-schema.test.js` — exact question/candidate/projection keys, caps/max+1, Unicode/control safety, categorical trust, citation requirements, hostile shapes, and deep freeze.
- [x] `tests/skopeo-decision-policy.test.js` — versioned partitioned store, stable identity, deterministic applicability, explicit complex classification, routine omission, complete-set memo proof, open-before-ack, drift invalidation, and blocked clearance.
- [x] `tests/skopeo-ask-engine.test.js` — exact-set excerpts, provider/model binding, inert prompt evidence, candidate validation, governing/history assignment, current citations, conflicts/gaps, abstention, abort/discard, and no-prefix behavior.
- [x] Phase 58 additions to `tests/skopeo-hud-runtime.test.js` — exact background/content messages, opaque scope/action registry, current ask/policy operations, replay/cross-tab/revision/access rejection, cancellation, stale withdrawal, and no content authority.
- [x] Phase 58 additions to `tests/skopeo-adaptive-composer.test.js` — closed ask/result/policy models, exact UI-SPEC copy, routine memo omission, hostile text, and no raw authority fields.
- [x] Phase 58 additions to `tests/skopeo-browser-contract.test.js` — native composer controls, answer section order, policy flows, focus/live region, narrow/zoom/preferences, host coexistence, and zero residue.
- [x] `tests/skopeo-ask-evals.test.js` and `tests/fixtures/skopeo-ask-evals/` — deterministic requirement and adversarial matrix.
- [x] `package.json` — `test:skopeo-ask-evals` registered once in the aggregate suite.

No test framework or external package installation is required.

## Manual-Only Verifications

| Behavior | Requirements | Why manual | Evidence needed |
|---|---|---|---|
| Legal/domain correctness of answer conclusions, governing/history roles, decision applicability, and memo qualification | VIEW-07, POLICY-01..03 | Synthetic fixtures cannot establish legal interpretation or business policy | Counsel/legal-operations review with reviewer, fixture/source revision, disposition, and date |
| Stable identity and exact current citation navigation in representative live Drive/Docs | VIEW-06, VIEW-07, POLICY-01..03 | Real Google identity, permissions, revision and access behavior require an explicitly authorized signed-in session | Configure/rename/reorder/replace Document 10; ask across vendor/corpus scopes; open citations; change/revoke access; record exact outcomes |
| Answer usefulness, density, VoiceOver, zoom, and host coexistence | VIEW-06, VIEW-07 | Human observation is required for comprehension and actual assistive/browser behavior | Exercise all answer states and policy flows at normal/narrow/200% zoom, keyboard, VoiceOver, forced colors, reduced motion, and Drive/Docs interaction |

Human approval remains required for legal/domain fidelity and authorized live Drive/Docs evidence; both remain `human_needed`. Automated or synthetic evidence must never convert them into approval.

## Threat References

| Ref | Threat |
|---|---|
| T58-01 | Hostile question/source/prompt injection changes instructions or crosses scope. |
| T58-02 | Incomplete/inaccessible evidence produces a material conclusion. |
| T58-03 | Fake/stale citation supports a claim or navigation. |
| T58-04 | Stale authority or late provider completion repaints. |
| T58-05 | Model output controls policy, complexity, applicability, review, or clearance. |
| T58-06 | Filename/order/label impersonates stable policy/agreement identity. |
| T58-07 | Review/policy action replays after authority or revision drift. |
| T58-08 | Memo absence/obligation is inferred for routine or incomplete agreements. |
| T58-09 | Raw evidence/provider/identity/policy authority leaks to content, MCP, storage, or logs. |
| T58-10 | Focused UI harms accessibility, Drive/Docs interaction, or teardown. |

## Validation Sign-Off

- [x] Every intended implementation task has a focused automated command or creates the exact controlled-RED test it then runs.
- [x] Sampling continuity permits no three-task gap without automated verification.
- [x] Wave 0 enumerates every new focused test, fixture, and package script.
- [x] Commands contain no watch-mode flags.
- [x] Focused feedback target is below 30 seconds.
- [x] Exact-set completeness, citation authority, policy identity, acknowledgement, memo proof, content minimization, accessibility, and teardown each have a deterministic oracle.
- [x] Human legal/domain and authorized live-host evidence remains separate and `human_needed`.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** deterministic validation complete on 2026-08-27; legal/domain, authorized live Drive/Docs, and human usability/a11y observations remain `human_needed`
