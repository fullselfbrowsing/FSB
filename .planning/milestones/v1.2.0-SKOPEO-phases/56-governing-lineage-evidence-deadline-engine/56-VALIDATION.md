---
phase: 56
slug: governing-lineage-evidence-deadline-engine
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-23
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Automated contract examples must use synthetic or irreversibly redacted source material; legal/domain fidelity remains human evidence.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:assert` with repository fake-Chrome/VM harnesses and npm scripts |
| **Config file** | `package.json` scripts; no separate test-runner config |
| **Quick run command** | The current task's focused `node tests/skopeo-*.test.js` command; after Plan 56-05 creates it, `npm run test:skopeo-truth-evals` |
| **Full suite command** | `npm run test:skopeo-graph-evals && npm run test:skopeo-truth-evals && node scripts/verify-skopeo-storage-boundary.mjs && npm run validate:extension && npm test` |
| **Estimated runtime** | Focused target <30 seconds; full-suite baseline measured during execution |

---

## Sampling Rate

- **After every task commit:** Run the task's directly owned focused command and `node --check` for every changed JavaScript file.
- **After every plan wave:** Run all focused Phase 56 commands whose artifacts exist, plus affected corpus/graph regressions. Do not invoke `test:skopeo-truth-evals` before Plan 56-05 creates and package-wires it.
- **Wave cadence:** Wave 1 is Plan 56-01; Wave 2 is Plan 56-02 alone; Wave 3 starts only after Wave 2 and contains disjoint Plans 56-03 and 56-04 (both depend on Plan 56-02, while 56-04 also depends on 56-01); Wave 4 is Plan 56-05 after Plans 56-02/03/04. Re-run the settled graph query/store regressions before both Wave 3 plans are accepted.
- **After Plan 56-05 creates the aggregate:** Run `npm run test:skopeo-truth-evals && node scripts/verify-skopeo-storage-boundary.mjs && npm run validate:extension` after every subsequent repair or phase-gate change.
- **Before `$gsd-verify-work`:** The full suite command must be green. Report the known intermittent Chrome DevTools startup timeout separately if it recurs; an isolated pass does not make a failed repository-wide gate green.
- **Max feedback latency:** 30 seconds for a focused task command; split a focused fixture runner if measurement exceeds this bound.

---

## Per-Task Verification Map

The plan IDs below define the intended ownership sequence. A planner may split a row only when each resulting task retains an automated command and the same security oracle.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 56-01-01 | 01 | 1 | TRUTH-06, TRUTH-07, TRUTH-09 | T56-01, T56-03 | RED closed candidate/assertion/citation/conflict/evaluation-context/semantic-proof/manifest contracts reject hidden or executable fields; forge-resistant IDs bind exact evidence and the shared family citation cap is fixed at 2,048 | unit | `bash -lc 'set +e; out=$(node tests/skopeo-truth-schema.test.js 2>&1); code=$?; set -e; test "$code" -ne 0; rg -F -q "skopeo truth schema contract" <<<"$out"'` | ❌ W0 | ⬜ pending |
| 56-01-02 | 01 | 1 | TRUTH-06, TRUTH-07, TRUTH-09 | T56-01, T56-03 | Canonical typed assertions, five-state trust, separate access state, immutable citations, explicit evaluation context, page-free semantic proofs, store-shaped manifests, exact 2,048/2,049 citation boundaries, and locally derived IDs | unit | `node tests/skopeo-truth-schema.test.js` | ❌ W0 | ⬜ pending |
| 56-01-03 | 01 | 1 | TRUTH-08, TRUTH-11 | T56-04 | RED civil-date/deadline contract fixes strict ordinals, four operators, explicit timezone/boundary/consequence/calendar semantics, blockers, and TZ/locale invariance before production exists | unit | `bash -lc 'set +e; out=$(node tests/skopeo-deadline-engine.test.js 2>&1); code=$?; set -e; test "$code" -ne 0; rg -F -q "skopeo deadline engine contract" <<<"$out"'` | ❌ W0 | ⬜ pending |
| 56-01-04 | 01 | 1 | TRUTH-08, TRUTH-11 | T56-04 | GREEN pure civil dates and closed data-only rules are invariant to locale/TZ and abstain on unsupported operators, missing timezone, or missing business calendar | unit | `node --check extension/utils/skopeo-deadline-engine.js && node tests/skopeo-truth-schema.test.js && node tests/skopeo-deadline-engine.test.js` | ❌ W0 | ⬜ pending |
| 56-02-01 | 02 | 2 | TRUTH-03, TRUTH-04, TRUTH-09 | T56-02, T56-05 | RED exact-set authority/query/runtime contracts each independently reject subsets, stale generations, incomplete authority, foreign endpoints, max-plus-one inputs, and partial results with their own marker | unit/integration | independent controlled RED runs for `skopeo-drive-authority`, `skopeo-graph-query`, and `skopeo-graph-runtime` | mixed/W0 | ⬜ pending |
| 56-02-02 | 02 | 2 | TRUTH-03, TRUTH-04, TRUTH-09 | T56-02, T56-05 | One complete deterministic exact-set snapshot returns only current records, relations, endpoint-current candidates, and bounded source-state metadata | unit/integration | `node tests/skopeo-graph-query.test.js` | mixed/W0 | ⬜ pending |
| 56-02-03 | 02 | 2 | TRUTH-02, TRUTH-03, TRUTH-06, TRUTH-07 | T56-01, T56-02, T56-03, T56-08 | RED configured-provider source-local extraction contract fixes engine handles/current locators, candidate-only output, budgets, cancellation, repair, and raw-output disposal before production exists | unit/integration | `bash -lc 'set +e; out=$(node tests/skopeo-truth-extractor.test.js 2>&1); code=$?; set -e; test "$code" -ne 0; rg -F -q "skopeo truth extractor contract" <<<"$out"'` | ❌ W0 | ⬜ pending |
| 56-02-04 | 02 | 2 | TRUTH-02, TRUTH-03, TRUTH-06, TRUTH-07 | T56-01, T56-02, T56-03, T56-08 | GREEN configured-provider source-local extraction accepts only engine handles/current locators, never ranks documents, parses labels as facts, or persists raw output | unit/integration | `node --check extension/utils/skopeo-truth-extractor.js && node tests/skopeo-truth-schema.test.js && node tests/skopeo-truth-extractor.test.js` | ❌ W0 | ⬜ pending |
| 56-03-01 | 03 | 3 | TRUTH-02, TRUTH-03, TRUTH-04 | T56-02, T56-06 | RED deterministic adjudicator requires cited executed/effective lineage, separates four axes, preserves base inheritance, and abstains on cycles/dangling/conflicting scope | unit | `bash -lc 'set +e; out=$(node tests/skopeo-lineage-adjudicator.test.js 2>&1); code=$?; set -e; test "$code" -ne 0; rg -F -q "skopeo lineage adjudicator contract" <<<"$out"'` | ❌ W0 | ⬜ pending |
| 56-03-02 | 03 | 3 | TRUTH-02, TRUTH-03, TRUTH-04, TRUTH-11 | T56-02, T56-06 | Base, replacement, and clause overlays are permutation-invariant; output is a page-free semantic family proof, and filename, recency, similarity, order, and model confidence never break ties | unit | `node tests/skopeo-lineage-adjudicator.test.js` | ❌ W0 | ⬜ pending |
| 56-03-03 | 03 | 3 | TRUTH-06, TRUTH-07, TRUTH-08, TRUTH-11 | T56-03, T56-04, T56-06 | Applicable facts retain conflict sets; derivations expose exact inputs/rule/boundary/cited-or-configured timezone/context/calendar/consequence; the shared 2,048 citation cap and every unresolved input yield fail-closed output | unit/integration | `node tests/skopeo-lineage-adjudicator.test.js && node tests/skopeo-deadline-engine.test.js` | ❌ W0 | ⬜ pending |
| 56-04-01 | 04 | 3 | TRUTH-03, TRUTH-04, TRUTH-09, TRUTH-11 | T56-05, T56-07 | Independent RED truth-store and settled graph-store contracts fix semantic-proof admission, store-owned page/hash/manifest construction, pointer-last controls, reverse dependencies, real citations purge, and absence proof | unit/integration | independent controlled RED runs for `skopeo-truth-store` and `skopeo-graph-store` | mixed/W0 | ⬜ pending |
| 56-04-02 | 04 | 3 | TRUTH-03, TRUTH-04, TRUTH-09, TRUTH-11 | T56-05, T56-07 | Store accepts exactly 2,048 unique citations, rejects 2,049, creates/reparses the durable manifest, and source/graph invalidation withdraws every affected family before publication/recompute | unit/integration | `node tests/skopeo-truth-store.test.js && node tests/skopeo-graph-store.test.js` | mixed/W0 | ⬜ pending |
| 56-04-03 | 04 | 3 | TRUTH-04, TRUTH-09, TRUTH-11 | T56-05, T56-07 | Bounded recovery leaves uncertain/corrupt manifest pointers invisible, repairs dependency symmetry without Drive reads, and never selects by timestamp or filename | unit/integration | `node tests/skopeo-truth-store.test.js` | ❌ W0 | ⬜ pending |
| 56-05-01 | 05 | 4 | All Phase 56 IDs | T56-01–T56-08 | Independent RED truth/graph/corpus runtime contracts fix import/recovery order, real citations binder, explicit authoritative evaluation-context seam, minimized facade, and content/MCP closure | integration/static | independent controlled RED runs for `skopeo-truth-runtime`, `skopeo-graph-runtime`, and `skopeo-corpus-runtime` | mixed/W0 | ⬜ pending |
| 56-05-02 | 05 | 4 | All Phase 56 IDs | T56-01–T56-08 | Trusted runtime requires caller-supplied civil date/timezone/calendar context, revalidates it before commit/read, lets the store construct manifests, withdraws stale snapshots, and exposes only bounded projections | integration/static | `node tests/skopeo-truth-runtime.test.js && node tests/skopeo-graph-runtime.test.js && node tests/skopeo-corpus-runtime.test.js && node scripts/verify-skopeo-storage-boundary.mjs` | mixed/W0 | ⬜ pending |
| 56-05-03 | 05 | 4 | All Phase 56 IDs | T56-01–T56-08 | Deterministic corpus covers active/draft/amendment/replacement/conflict/access/date/calendar/race/recovery/cap/isolation cases while domain approval remains `human_needed` | eval/regression | `npm run test:skopeo-truth-evals && node scripts/verify-skopeo-storage-boundary.mjs && npm run validate:extension` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/skopeo-truth-schema.test.js` — closed candidate, citation, assertion, conflict, evaluation-context, rule, result, storage-independent semantic proof, durable manifest, canonical ID, hostile-descriptor, shared 2,048 family-citation, and exact-cap contracts.
- [ ] `tests/skopeo-deadline-engine.test.js` — strict civil dates, leap/year boundaries, allowlisted calendar-day rules, boundary/timezone proof, business-calendar support/abstention, and locale/TZ invariance.
- [ ] `tests/skopeo-graph-query.test.js` additions — complete exact-set snapshot ordering, current candidate overlays, access/currency metadata, and stale/subset/over-cap rejection.
- [ ] `tests/skopeo-truth-extractor.test.js` — configured-provider parity, bounded source-local excerpts, exact handles/locators, closed response admission, cancellation/raw-result disposal, and no precedence pass.
- [ ] `tests/skopeo-lineage-adjudicator.test.js` — four axes, executed/effective gates, base/replacement/partial overlays, inherited clauses, conflicts, cycles, abstention, applicability, page-free semantic proofs, 2,048/2,049 citation bounds, permutation invariance, and eligibility blockers.
- [ ] `tests/skopeo-truth-store.test.js` — semantic-proof admission, store-owned deterministic pages/hashes/manifest/`sts1:`, immutable journals/controls, source/family reverse dependencies, real citations binder, source/partition purge, graph invalidation, absence proof, exact shared citation cap, fault injection, and bounded recovery.
- [ ] `tests/skopeo-truth-runtime.test.js` — imports, boot/recovery order, real `citations` plus empty `counts`/`alerts`, fresh Phase 54 authority, explicit caller-supplied evaluation context and currentness recheck, stale withdrawal, frozen facade, content/MCP closure, and diagnostic privacy.
- [ ] `tests/skopeo-truth-evals.test.js` and `tests/fixtures/skopeo-truth-evals/` — at least the 20 deterministic structural/security cases enumerated in `56-RESEARCH.md`.
- [ ] `package.json` — add `test:skopeo-truth-evals` and include all focused Phase 56 tests in the normal `npm test` chain.

No test framework or external package installation is required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Governing-lineage and contract-fact domain adjudication | TRUTH-02, TRUTH-03, TRUTH-04, TRUTH-06, TRUTH-07, TRUTH-08, TRUTH-11 | Executed/effective meaning, amendment scope, clause applicability, and encoded deadline semantics require real commercial-contract counsel/legal-operations judgment | Keep synthetic/redacted fixture labels provisional and `domain_fidelity: human_needed` until counsel plus legal operations approve representative base, amendment, replacement, conflict, lifecycle, notice, address, and deadline cases with reviewer/version evidence. |
| Live citation navigation and source-currentness smoke | TRUTH-03, TRUTH-06, TRUTH-07, TRUTH-09 | Exact navigation requires a live signed-in Drive/Docs source and fresh Chrome authority; CI cannot manufacture operator access | On explicit authorization, open each projected citation through the background `citation-open` path, verify the exact current source and byte-backed location, then mutate/revoke one source and confirm stale navigation and governing/deadline clearance close immediately. |
| Chrome MV3 lifecycle smoke | TRUTH-04, TRUTH-09, TRUTH-11 | Service-worker suspension/restart and real extension packaging are best observed in Chrome | Load the unpacked extension, run a synthetic authorized exact-set recompute, suspend/restart the worker, inspect minimized frozen projections, revoke one dependency, and confirm no stale family or alert-eligible result survives. Record as human UAT, not automated domain approval. |

Human validation is intentionally deferred for now; these rows remain pending and must not be converted into automated PASS evidence.

---

## Threat References

| Ref | Threat | Required automated proof |
|-----|--------|--------------------------|
| T56-01 | Source/model injection smuggles executable fields, hidden keys, forged IDs, ranking, or confidence clearance | Closed exact-key parsers, engine-derived identities/handles, no executable operator fields, configured-provider spy, and zero durable effect on rejection |
| T56-02 | Filename, recency, similarity, list order, stale endpoints, or model judgment establishes governing precedence | Rename/reorder/timestamp/label permutations, endpoint-version checks, explicit executed/effective/lineage admission, and byte-identical result or abstention |
| T56-03 | Forged/clipped/stale citation or untyped label becomes a trusted fact | Citation tuple/locator recomputation, exact byte bounds, separate typed assertion unions, five-state trust, and stale-generation rejection |
| T56-04 | Locale, implicit UTC, arbitrary code, hidden/stale calendars, stale timezone binding, or model arithmetic changes a deadline | Pure civil-date ordinal arithmetic, closed dispatch, TZ/locale matrix, explicit caller-supplied evaluation context, cited/configured timezone and immutable calendar currentness rechecks before commit/read, and unsupported/context blockers |
| T56-05 | An authorized subset, stale graph generation, or max-plus-one prefix is treated as the complete source set | Fresh exact-set authority before/after assembly, complete-proof requirement, whole-result caps, sorted digest, and zero partial publication |
| T56-06 | Conflicting or ambiguous applicable evidence is silently collapsed or an unsigned draft displaces executed evidence | Explicit conflict sets, four separate lineage axes, no confidence/majority/recency tie-breaks, and sorted eligibility blockers |
| T56-07 | Source purge, graph replacement, crash, or corrupt reverse dependency leaves multi-source truth reachable | Pointer-first withdrawal, symmetric source/family dependencies, real citations absence proof, mutation invalidator, fault matrix, and bounded recovery |
| T56-08 | Content/MCP/later phases obtain raw graph, truth storage, source text, provider output, or scheduling capability | Static/runtime boundary checks, frozen minimized facade, diagnostics privacy, no content action/MCP route/alarm/notification/alert ledger |

---

## Validation Sign-Off

- [x] Every planned capability family has a focused automated command or an explicit Wave 0 dependency.
- [x] Sampling continuity requires automated verification after every task; no three-task gap is permitted.
- [x] Wave 0 enumerates every currently missing focused test, fixture, and package-script artifact.
- [x] Focused commands remain authoritative until Plan 56-05 creates/package-wires the truth aggregate.
- [x] Deterministic structural/security status and expert legal/domain status are reported separately; pending expert evidence remains `human_needed`.
- [x] Exact-set completeness, candidate-only model output, citation currentness, conflict preservation, civil-date determinism, reverse-dependency withdrawal, and private-facade closure each have a focused oracle.
- [x] Commands contain no watch-mode flags.
- [x] Focused feedback target is <30 seconds, with a required split if measurement exceeds it.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** strategy approved 2026-07-23; execution and human evidence pending
