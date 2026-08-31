---
phase: 56-governing-lineage-evidence-deadline-engine
verified: 2026-07-24T17:06:26Z
status: human_needed
score: "5/5 must-haves verified"
overrides_applied: 0
human_verification:
  - test: "Expert adjudication of all 24 truth fixtures"
    expected: "Commercial-contracts counsel, legal operations, the source-system steward, privacy/security, and the evaluation lead approve the applicable lineage, fact, citation, conflict, and deadline outcomes with matching gold/label versions and a valid review record; only then does domain_fidelity report approved."
    why_human: "Executed/effective meaning, amendment scope, clause applicability, and deadline semantics require genuine domain judgment; automation must not manufacture reviewer approval."
  - test: "Authorized live Drive/Docs citation and revocation smoke"
    expected: "Each projected citation opens the exact current authorized source location; changing or revoking a source immediately closes stale citation, governing, and deadline clearance."
    why_human: "Live signed-in Drive/Docs navigation and permission transitions require explicit operator authorization and cannot be reproduced by the synthetic CI authority harness."
  - test: "Chrome MV3 recompute/restart/invalidation smoke"
    expected: "A locally loaded unpacked extension recomputes an authorized synthetic exact set, survives service-worker suspension/restart through bounded recovery, exposes only minimized frozen projections, and retains no stale family or eligible deadline after dependency withdrawal."
    why_human: "Real extension packaging and Chrome service-worker lifecycle behavior require observation in the browser."
---

# Phase 56: Governing Lineage, Evidence & Deadline Engine Verification Report

**Phase Goal:** Turn validated graph fragments into explainable governing state, exact contract facts, and deterministic deadline eligibility.
**Verified:** 2026-07-24T17:06:26Z
**Status:** human_needed
**Re-verification:** No — initial goal verification
**Verified revision:** `66c64e3ac203a3910365961138236b54221ea562`

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Execution state, temporal state, lineage role, and governance conclusion remain separate, and drafts/replacements/partial amendments cannot gain precedence from filenames, labels, similarity, recency, majority, or input order. | ✓ VERIFIED | `skopeo-truth-schema.js` defines the independent axes; `skopeo-lineage-adjudicator.js` derives them only from current cited candidates. Base/draft/replacement/overlay, permutation, obsolete-partial, cycle, dangling-target, and same-day ambiguity tests pass. |
| 2 | The engine identifies the exact governing document and clause overlays, preserving untouched base inheritance and withholding ambiguous chronology or scope as review-required. | ✓ VERIFIED | Current relations bind exact endpoint versions/generations. Partial amendments require an issued clause belonging to the amendment document and an issued target clause belonging to the target document. Same-day base- and replacement-target partials are excluded from the accepted path; distinct-day chronology is admitted. |
| 3 | Signed/effective/expiration/termination/renewal/notice-window/notice-deadline/delivery-method/written-address facts stay distinct, citation-bound, and conflict-preserving. | ✓ VERIFIED | Nine closed assertion unions retain exact document/clause/citation identities, separate five-state claim trust from source access/currentness, and preserve every incompatible applicable value in immutable conflict sets. |
| 4 | Deadline eligibility is a deterministic civil-date proof over explicit rule, boundary, timezone, immutable calendar, consequence, and cited current inputs, with no scheduling side effect. | ✓ VERIFIED | `skopeo-deadline-engine.js` implements four literal operators over strict proleptic Gregorian dates without `Date.parse`, locale, implicit UTC, alarms, or notifications. Missing/stale/conflicting inputs produce sorted blockers and never an eligible result. |
| 5 | Complete exact-set truth publishes immutably and fail-closed; source/graph changes and recovery corruption cannot leave stale governing or deadline influence visible. | ✓ VERIFIED | Exact graph snapshots derive `sgx1:` from the complete current source/record/relation/evidence set. Store-created pages/manifests and complete `stp1:` partition generations publish pointer-last, reads require exact generation membership, graph invalidation withdraws first, and authenticated bounded recovery converges across fresh workers beyond 128 tasks. |

**Score:** 5/5 roadmap truths verified

### Plan Contract Audit

| Plan | Truths | Artifacts | Key links | Status |
| --- | ---: | ---: | ---: | --- |
| 56-01 — closed truth schema and deadline engine | 6/6 | 4/4 | 4/4 | ✓ VERIFIED |
| 56-02 — exact graph handoff and source-local extraction | 4/4 | 4/4 | 4/4 | ✓ VERIFIED |
| 56-03 — deterministic lineage/fact/deadline adjudication | 6/6 | 2/2 | 4/4 | ✓ VERIFIED |
| 56-04 — immutable truth storage and invalidation | 5/5 | 4/4 | 4/4 | ✓ VERIFIED |
| 56-05 — trusted runtime and release gate | 9/9 | 6/6 | 6/6 | ✓ VERIFIED |
| **Total** | **30/30** | **20/20** | **22/22** | **✓ VERIFIED** |

One non-functional planning-interface discrepancy remains: `56-02-PLAN.md` names extractor version `skopeo-truth-extractor/1` and a `reuseKey` instance method, while production, focused tests, and the pinned eval manifest consistently use `skopeo-truth-extractor/v1` and the six lifecycle methods `prepareSource`, `verifyProviderBinding`, `nextBatch`, `repairBatch`, `finalize`, and `discard`. No runtime consumer requires `reuseKey`, and this does not weaken a Phase 56 truth, artifact, key link, or requirement. The plan should be normalized before it is used as literal API documentation.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `extension/utils/skopeo-truth-schema.js` | Closed candidates, citations, facts, conflicts, contexts, rules, proofs, and manifests | ✓ VERIFIED | Descriptor-safe exact fields; issued document/clause/relation/calendar/evidence registries; locally recomputed IDs/versions; nine fact types; five trust states; shared 2,048-citation cap; page-free semantic proof separated from durable manifest. |
| `tests/skopeo-truth-schema.test.js` | Hostile-input, handle, identity, and cap oracle | ✓ VERIFIED | Focused aggregate passed, including forged evidence, unissued fact clause, wrong clause owner, issued calendar version, accessor/symbol/prototype, exact/+1, and citation mutation cases. |
| `extension/utils/skopeo-deadline-engine.js` | Pure deterministic civil-date evaluation | ✓ VERIFIED | Strict years 0001–9999, four literal operators, immutable calendars, explicit timezone/boundary/consequence, schema-first admission, no host date/locale/scheduling capability. |
| `tests/skopeo-deadline-engine.test.js` | Date/operator/calendar/environment oracle | ✓ VERIFIED | Focused aggregate passed across leap/year/boundary/TZ/calendar and fail-closed inputs. |
| `extension/utils/skopeo-graph-query.js` | Complete capped exact-set snapshot | ✓ VERIFIED | Enumerates current source bindings, records, relations, and all evidence; checks record/relation/evidence/byte caps and currentness; returns no prefix on failure. |
| `extension/utils/skopeo-graph-engine.js` | Fresh authorized graph snapshot facade | ✓ VERIFIED | Revalidates exact fragments/endpoints/evidence and derives `sgx1:` from complete source state/fingerprints/generations and consumed versions. |
| `extension/utils/skopeo-truth-extractor.js` | Bounded configured-provider candidate extraction | ✓ VERIFIED | One source at a time, static inert prompt, at most 8 excerpts/call and 8 normal calls/generation, one shape-only repair, exact issued handles and UTF-8 spans, raw-response disposal, no durable authority. |
| `tests/skopeo-truth-extractor.test.js` | Provider/handle/UTF-8/budget/privacy oracle | ✓ VERIFIED | Fresh run reported 180 assertions passed; CRLF, lone-CR, and multibyte offsets reproduce the fingerprinted UTF-8 byte stream. |
| `extension/utils/skopeo-lineage-adjudicator.js` | Pure family, lineage, fact, conflict, and deadline proof | ✓ VERIFIED | Independently recomputes the exact-set digest, validates all current versions, derives four axes, handles replacements/overlays/inheritance, preserves conflicts, and emits page-free semantic proofs. |
| `tests/skopeo-lineage-adjudicator.test.js` | Governance, chronology, conflict, permutation, and deadline oracle | ✓ VERIFIED | Fresh focused aggregate passed; same-day ambiguity, obsolete partials, exact amendment clauses, business calendars, incompatible assertions, and blocker propagation are covered. |
| `extension/utils/skopeo-truth-store.js` | Immutable generations, dependencies, withdrawal, and bounded recovery | ✓ VERIFIED | Store-owned canonical pages/hashes/`sts1:` manifests, symmetric dependencies, pointer-last family and partition generation publication, generation-gated reads, real citations participant, authenticated recovery cursor. |
| `tests/skopeo-truth-store.test.js` | Fault, generation, recovery, purge, and isolation oracle | ✓ VERIFIED | Fresh focused aggregate passed, including 127 active families, more than 128 tasks, fresh-worker cursor continuation, corrupt cursor reset, inventory mutation, generation pointer faults, and valid orphan convergence. |
| `extension/utils/skopeo-graph-store.js` | Withdrawal-before-graph-mutation seam | ✓ VERIFIED | Registers one frozen truth invalidator and awaits exact source/overlay withdrawal before replacement, clear, or publication control writes. |
| `extension/utils/skopeo-truth-engine.js` | Fresh-authority recompute/read facade | ✓ VERIFIED | Orders source-local extraction → pure adjudication → family staging/publication → complete partition generation; rechecks graph/provider/context before effects and reads; exposes seven bounded frozen projections. |
| `extension/background.js` | Trusted import/construction/recovery/private-facade wiring | ✓ VERIFIED | Imports six truth modules after the graph chain; orders corpus recovery → graph recovery → graph facade → truth recovery → local truth facade; citations bind to the real owner and the truth facade is not global/content/MCP/UI authority. |
| `scripts/verify-skopeo-storage-boundary.mjs` | Static runtime and private-surface gate | ✓ VERIFIED | Fresh extension validation reported PASS across 32 injected/dependency files. |
| `tests/skopeo-truth-runtime.test.js` | Boot, authority, phase-fence, stale-read, and privacy oracle | ✓ VERIFIED | Fresh focused aggregate passed, including missing/stale context, repeated currentness validation, mutation-terminal suppression, locale-independent ordering, minimized projections, and static mutation fixtures. |
| `tests/skopeo-truth-real-handoff.test.js` | Real schema → graph facade → adjudicator → store handoff | ✓ VERIFIED | Fresh run passed and proved the exact `sgx1:` produced by the real graph engine is consumed by the real truth schema/adjudicator/store and returns a governing active proof. |
| `tests/fixtures/skopeo-truth-evals/` | Ordered 24-case synthetic/redacted corpus | ✓ VERIFIED | Exactly 6 governing-lineage, 6 fact-evidence, 6 deadline, and 6 runtime-security cases; versions are pinned and provisional output digests are independent. |
| `tests/skopeo-truth-evals.test.js` and `package.json` | Deterministic/security, provisional, human gate, and normal-suite wiring | ✓ VERIFIED | Truth aggregate appears once after the graph aggregate in `npm test`; deterministic/security and provisional statuses pass while domain fidelity remains honestly human-needed. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| Drive/corpus authority | Graph exact-set facade | Nonserializable current certificates carrying exact source state and fingerprints | ✓ WIRED | Non-ready/currentness failure closes the whole snapshot instead of inferring access from graph absence. |
| Graph query | Graph engine | One complete `snapshotExactSet(scope)` inside the fresh authority/currentness sandwich | ✓ WIRED | No lexical search, traversal, top-N, max-prefix, or direct graph-store fallback can become truth input. |
| Graph engine | Truth engine | Frozen `snapshotExactSet` facade and complete `sgx1:` | ✓ WIRED | Runtime receives only the complete current graph projection and recomputes authority before publication/read. |
| Source bytes | Truth extractor | One-use `readContent` sink plus engine-issued document/clause/relation/calendar/evidence registry | ✓ WIRED | Provider-visible handles are opaque and only exact current UTF-8-backed locators can resolve. |
| Truth schema | Extractor/adjudicator/store | Closed candidate parsing, semantic proof parsing, and store-owned manifest parsing | ✓ WIRED | Model-shaped output cannot manufacture durable IDs, governance, confidence clearance, dates, pages, hashes, or manifests. |
| Extractor | Adjudicator | Frozen source-local candidate generations bound to provider/model/source/generation/`sgx1:` | ✓ WIRED | The adjudicator independently verifies every binding before forming families. |
| Deadline engine | Adjudicator | Injected `evaluateRule` over applicable exact assertions and explicit context | ✓ WIRED | Derived deadlines remain separate from direct facts and are ineligible on any unresolved input. |
| Adjudicator | Truth store | Page-free semantic family proofs | ✓ WIRED | The store reparses the proof, creates deterministic pages/hashes/manifest, and publishes no partial semantic object. |
| Truth store | Graph store/corpus store | Frozen graph invalidator and real `citations` purge participant | ✓ WIRED | Source, overlay, and corpus mutations synchronously withdraw affected family/generation visibility before newer authority. |
| Truth store | Truth engine | Opaque mutation guards, pointer-last publication, generation-gated active reads | ✓ WIRED | No raw storage key, dependency page, or partially published family crosses the engine facade. |
| Background | Truth runtime | Ordered recovery and one local frozen facade | ✓ WIRED | Private truth authority does not escape to generic messages, content, MCP, UI, alarms, or notifications. |
| `package.json` | Truth evaluation gate | `test:skopeo-truth-evals` after `test:skopeo-graph-evals` | ✓ WIRED | The complete focused Phase 56 gate also runs in the repository-wide regression chain. |

### Data-Flow Trace

| Stage | Exact input | Real output | Fail-closed fence | Status |
| --- | --- | --- | --- | --- |
| Authorized corpus → graph | Current source IDs, access state, content fingerprints, graph generations | Complete records, endpoint-current relations, evidence tuples, canonical `sgx1:` | Any missing/stale/foreign/duplicate/over-cap member returns no snapshot | ✓ VERIFIED |
| Graph/source → extraction | One certified source, exact source bytes, issued handles, evaluation context | Frozen normalized candidate generation | Unknown handle, incorrect UTF-8 range, provider/model drift, cancellation, semantic failure, or incomplete batches return no generation | ✓ VERIFIED |
| Candidates → adjudication | Complete exact graph plus every source-local generation with the same `sgx1:` | Storage-independent family proofs: four axes, governing path/overlays, assertions, conflicts, citations, rules, results | Draft/ambiguous/cyclic/dangling/same-day/conflicting/stale input becomes review-required or blocked, never silently selected | ✓ VERIFIED |
| Rule → deadline | Exact applicable anchor/window/consequence citations plus explicit timezone/calendar context | Deterministic deadline proof and eligible/ineligible data | Missing/stale/conflicting lineage, fact, calendar, timezone, boundary, consequence, or operator produces blockers and null deadline | ✓ VERIFIED |
| Semantic proof → durable truth | Parsed page-free proof and exact source/record/relation/candidate/rule/context bindings | Immutable pages, hashes, `sts1:` manifest, family control, complete `stp1:` partition generation | Reads require matching generation membership; pointer switch occurs after durable content and before retirement/GC | ✓ VERIFIED |
| MV3 restart/change → read | Durable inventory, authenticated recovery cursor, fresh graph/context authority | Current bounded frozen lineage/fact/conflict/citation/deadline/status projection | Recovery caps each invocation at 128 tasks, resumes on a fresh worker, resets on inventory drift, and hides corrupt or stale authority | ✓ VERIFIED |

## Automated Evidence

| Behavior | Command | Fresh result | Status |
| --- | --- | --- | --- |
| Complete Phase 56 truth gate | `npm run test:skopeo-truth-evals` | Schema PASS; deadline PASS; extractor 180 assertions; adjudicator PASS; store PASS; runtime PASS; real graph-to-store handoff PASS | ✓ PASS |
| Evaluation status separation | Same aggregate | `deterministic_structural_security: pass`; `provisional_regression: pass (not gold)`; `domain_fidelity: human_needed` | ✓ PASS (human gate preserved) |
| Phase 55 graph regression/exact-set provider | `npm run test:skopeo-graph-evals` | Schema 572/0, provider cancellation 75/0, store/query/runtime PASS, all 37 fixtures PASS | ✓ PASS |
| Trusted extension/storage boundary | `npm run validate:extension` | Storage boundary PASS across 32 files; manifest valid; 441 JavaScript files parsed; all remaining extension gates passed | ✓ PASS |
| Repository-wide regression | `npm test` | Exit 0; Phase 56 gate and real handoff passed in suite order; browser contract and all downstream tests passed | ✓ PASS |
| Phase diff hygiene | `git diff --check 1f40117c^..HEAD -- extension tests scripts package.json` | Exit 0 | ✓ PASS |
| Review remediation | `56-REVIEW-FIX.md` plus fresh truth gate | WR-06 high-cardinality recovery fix reverified; prior CR-01–CR-07 and WR-01–WR-05 regressions remain green | ✓ PASS |
| Security register | `56-SECURITY.md` plus fresh deterministic gates | 28/28 threats closed, 0 open, no accepted risks | ✓ PASS |

The full suite regenerated only crawler dates in `showcase/angular/public/llms-full.txt` and `showcase/angular/public/sitemap.xml`; those test artifacts were restored with `apply_patch`. The worktree returned clean before this report was added.

### Requirements Coverage

| Requirement | Description | Status | Implementation/test evidence |
| --- | --- | --- | --- |
| TRUTH-02 | Separate execution/temporal/lineage/governance states, including drafts and replacements | ✓ VERIFIED | Closed four-axis schema and deterministic base/draft/replacement/partial tests. |
| TRUTH-03 | Exact governing document and clause overlays with inheritance | ✓ VERIFIED | Current endpoint bindings, issued target/amendment clauses, accepted path/overlay proof, real handoff. |
| TRUTH-04 | Unresolved lineage/scope/chronology remains review-required | ✓ VERIFIED | Cycle/dangling/overlap/duplicate/same-day tests with no ambiguous overlay application. |
| TRUTH-06 | Signed/effective/expiration/termination/renewal fact extraction | ✓ VERIFIED | Distinct typed assertion unions with exact document/clause/citation/version identities. |
| TRUTH-07 | Notice window/deadline/method/address fact extraction | ✓ VERIFIED | Separate assertion types, exact citation unions, conflict preservation, and projection tests. |
| TRUTH-08 | Deterministic deadline derivation from explicit rules and context | ✓ VERIFIED | Pure civil-date engine, four operators, immutable calendars, explicit timezone/boundary/consequence. |
| TRUTH-09 | Exact citations plus separate trust and source access/currentness | ✓ VERIFIED | Tuple-derived citation IDs, UTF-8 byte checks, five trust states, independent source-state projection, stale withdrawal. |
| TRUTH-11 | Conflict, stale, unreadable, or unresolved input blocks governance/eligibility | ✓ VERIFIED | Complete conflict sets and sorted blockers prevent eligible results or current reads; no alert scheduling exists in Phase 56. |

All eight Phase 56 requirement IDs are present in plan frontmatter, marked complete in `.planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md`, and map to Phase 56 in `.planning/milestones/v1.2.0-SKOPEO-ROADMAP.md`.

### Anti-Patterns and Review State

| Scope | Finding | Severity | Impact |
| --- | --- | --- | --- |
| Phase implementation/test diff | No newly added TODO/FIXME/XXX/HACK/placeholder/not-implemented marker was found in the verified production path. | None | No implementation blocker. |
| `56-02-PLAN.md` interface block | Extractor version/method literals differ from the internally consistent production/test/eval contract. | Documentation | No runtime or requirement impact; normalize the plan before literal API reuse. |
| `56-REVIEW.md` | Preserves the iteration-3 pre-fix WR-06 `changes_requested` snapshot. | Historical | `56-REVIEW-FIX.md` is the superseding remediation record and fresh tests verify the fix; retain both as audit history. |

Independent source inspection corroborated the corrected `sgx1:` handoff, issued fact/amendment/calendar handles, schema-first deadline admission, code-unit ordering, exact UTF-8 ranges, terminal mutation suppression, complete partition generations, same-day abstention, and durable recovery cursor. No automated Phase 56 goal gap remains.

## Human Verification Required

### 1. Expert adjudication of all 24 truth fixtures

**Test:** Have the required commercial-contracts counsel, legal-operations, source-system-steward, privacy/security, and evaluation-lead roles adjudicate the representative base, amendment, replacement, lifecycle, conflict, notice, address, and deadline cases, then record genuine approval metadata.

**Expected:** Each approved fixture has matching `gold_label_version` and `label_version`, all required approved roles, and a valid `truth-review:v1:...` record; only then does `domain_fidelity` become `approved`.

**Why human:** All 24 fixtures deliberately remain `review_status: pending`, `gold_label_version: null`, empty approved roles, and null review records. Deterministic structure/security and provisional regression do not establish legal/domain fidelity.

### 2. Authorized live Drive/Docs citation and revocation smoke

**Test:** With explicit authorization in a signed-in Chrome profile, open projected citations through the live citation path, verify the exact current source/location, then mutate or revoke one dependency and repeat the governing/deadline read.

**Expected:** Current citations navigate correctly; stale/revoked evidence immediately loses citation, governance, and deadline clearance.

**Why human:** CI cannot manufacture the user's Drive/Docs account, permissions, real document navigation, or account-switch behavior.

### 3. Chrome MV3 recompute/restart/invalidation smoke

**Test:** Load the unpacked extension, recompute an authorized synthetic exact set, suspend/restart the service worker, inspect minimized projections, revoke one dependency, and verify restart/invalidation behavior.

**Expected:** Bounded recovery converges, only complete current generation members are readable, no raw source/provider/store data escapes, and no stale family or eligible deadline survives withdrawal.

**Why human:** Node harnesses exercise the service-worker contracts and fresh-instance recovery, but real packaging, eviction, and browser-visible behavior require Chrome observation.

Human validation was explicitly deferred by the user. `56-VALIDATION.md` therefore correctly remains a pending manual-evidence ledger; its rows must not be converted into automated PASS evidence.

## Gaps Summary

No automated Phase 56 implementation gap was found. All 5 roadmap truths, all 30 plan truths, all 20 required artifacts, all 22 declared key links, and all 8 assigned requirements verify against production code and freshly executed tests. The focused truth and graph gates, extension validation, storage boundary, real graph-to-truth-store handoff, high-cardinality fresh-worker recovery, and complete repository regression suite are green.

The status is `human_needed` solely because expert domain fidelity and the two authorized live Chrome/Drive UAT rows remain pending by design and by explicit user direction. The Plan 56-02 extractor literal mismatch is documentation drift, not a functional goal gap.

---

_Verified: 2026-07-24T17:06:26Z_
_Verifier: the agent (gsd-verifier)_
