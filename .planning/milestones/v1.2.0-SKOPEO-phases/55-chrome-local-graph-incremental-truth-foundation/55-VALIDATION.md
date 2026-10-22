---
phase: 55
slug: chrome-local-graph-incremental-truth-foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-21
---

# Phase 55 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. All source text and provider responses in automated evaluation are synthetic or irreversibly redacted.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:assert` with repository fake-Chrome/VM harnesses and npm scripts |
| **Config file** | `package.json` scripts; no separate test-runner config |
| **Quick run command** | Waves 1–3: the current task's focused `<automated>` command; after 55-05 Task 3: `npm run test:skopeo-graph-evals` |
| **Full suite command** | `npm run test:skopeo-graph-evals && node scripts/verify-skopeo-storage-boundary.mjs && npm run validate:extension && npm test` |
| **Estimated runtime** | Focused target <30 seconds; full-suite baseline measured during execution |

---

## Sampling Rate

- **Waves 1–3, after every task commit:** The task's directly owned focused command is authoritative. Do not invoke `npm run test:skopeo-graph-evals`; it does not exist until 55-05 Task 3 creates and package-wires it.
- **Waves 1–3, after each wave:** Run every focused command whose production/test artifacts now exist. The Wave 1 gate is schema plus provider-cancellation/provider-parity; Wave 2 adds corpus-store and graph-store; Wave 3 adds extractor and query. Run the existing storage verifier/extension validation only when an owning task changes their inputs.
- **Wave 4 Tasks 1–2:** Use the runtime task's focused command (and storage verifier/corpus-runtime regression where listed). The aggregate is still unavailable and is not a prerequisite.
- **Immediately after 55-05 Task 3:** `npm run test:skopeo-graph-evals` becomes mandatory. Run it plus `node scripts/verify-skopeo-storage-boundary.mjs && npm run validate:extension` for the Task 3 commit and for every subsequent task, repair, plan gate, or phase gate.
- **Before `$gsd-verify-work`:** `npm run test:skopeo-graph-evals && node scripts/verify-skopeo-storage-boundary.mjs && npm run validate:extension && npm test` must be green.
- **Max feedback latency:** 30 seconds for a focused task command; split the focused script if measurement exceeds this bound.

---

## Per-Task Verification Map

The plan IDs below are the required ownership sequence; the planner may split a row into additional tasks only if every resulting task retains an automated command and the same security gate.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 55-01-01 | 01 | 1 | LOCAL-01, LOCAL-02, LOCAL-07, TRUTH-01, TRUTH-10 | T55-01, T55-02 | Closed IDs, endpoint/evidence-bound relation versions, canonical overlay generations, target-only replacement, name-bearing labels excluded from identity | unit/static | `node tests/skopeo-graph-schema.test.js` | ❌ W0 | ⬜ pending |
| 55-01-02 | 01 | 1 | LOCAL-04, LOCAL-05, TRUTH-10 | T55-03, T55-04 | Caller cancellation reaches fetch/backoff/retry with provider parity | unit | `node tests/universal-provider-cancellation.test.js && node tests/universal-provider-lmstudio.test.js` | ❌ W0 | ⬜ pending |
| 55-02-01 | 02 | 2 | LOCAL-03, TRUTH-01, TRUTH-05 | T55-02, T55-05 | RED bridge/store oracle: participant capability, endpoint-bound overlay identity, target-only invalidation, proposer-only clear, pointer-last visibility | unit/integration | `node tests/skopeo-corpus-store.test.js; node tests/skopeo-graph-store.test.js` (controlled RED contract) | mixed/W0 | ⬜ pending |
| 55-02-02 | 02 | 2 | LOCAL-02, LOCAL-03, TRUTH-01, TRUTH-05 | T55-02, T55-05, T55-06 | Authorized participant bridge, immutable provider-bound generations, canonical candidate overlays, no-target-read empty replacement | unit/integration | `node tests/skopeo-corpus-store.test.js && node tests/skopeo-graph-store.test.js` | mixed/W0 | ⬜ pending |
| 55-02-03 | 02 | 2 | LOCAL-03, TRUTH-05, TRUTH-10 | T55-05, T55-06, T55-08 | Durable-only recovery, source-owned purge/cache absence, and location-aware privacy allowing name labels only in authoritative record/lexical paths | unit/integration | `node tests/skopeo-graph-store.test.js` | ❌ W0 | ⬜ pending |
| 55-03-01 | 03 | 3 | LOCAL-04, LOCAL-05, TRUTH-01, TRUTH-10 | T55-01, T55-03, T55-04, T55-07 | RED invariant-only session, distinct fresh certificate, provider no-storage acknowledgement, budget/prior-handle contract | unit/integration | `node tests/skopeo-graph-extractor.test.js` (controlled RED contract) | ❌ W0 | ⬜ pending |
| 55-03-02 | 03 | 3 | LOCAL-04, LOCAL-05, TRUTH-10 | T55-03, T55-04 | Segmentation, configured provider, one-use certificates, exact no-storage raw-result lifetime, binding/drift and cancellation | unit/integration | `node tests/skopeo-graph-extractor.test.js` | ❌ W0 | ⬜ pending |
| 55-03-03 | 03 | 3 | TRUTH-01, TRUTH-10 | T55-01, T55-07 | Strict evidence, generation-handle resolution, repair/reuse, complete fragment | unit/integration | `node tests/skopeo-graph-extractor.test.js` | ❌ W0 | ⬜ pending |
| 55-04-01 | 04 | 3 | LOCAL-02, LOCAL-03, LOCAL-06, TRUTH-01 | T55-02, T55-05, T55-08 | RED exact scopes, zero boot hydration, authorized name-label search/projection, target-drift candidate suppression, and four bounded reads | unit | `node tests/skopeo-graph-query.test.js` (controlled RED contract) | ❌ W0 | ⬜ pending |
| 55-04-02 | 04 | 3 | LOCAL-02, LOCAL-03, LOCAL-06, TRUTH-01 | T55-02, T55-05, T55-08 | Authorized lazy cache plus location-aware exact/lexical/traversal/provenance projections | unit | `node tests/skopeo-graph-query.test.js` | ❌ W0 | ⬜ pending |
| 55-05-01 | 05 | 4 | All Phase 55 IDs | T55-01–T55-09 | RED boot/participant/fresh-certificate/no-storage-provider/candidate-clear/label-query/MCP-independent runtime contract | integration/static | `node tests/skopeo-graph-runtime.test.js` (controlled RED contract) | ❌ W0 | ⬜ pending |
| 55-05-02 | 05 | 4 | All Phase 55 IDs | T55-01–T55-09 | Trusted recovery, corpus-authorized participants, exact Phase 54 acknowledgement choreography, proposer-only clear, lazy exact scopes, static closure | integration/static | `node tests/skopeo-graph-runtime.test.js && node tests/skopeo-corpus-runtime.test.js && node scripts/verify-skopeo-storage-boundary.mjs` | mixed/W0 | ⬜ pending |
| 55-05-03 | 05 | 4 | All Phase 55 IDs | T55-01–T55-09 | Complete 37-case gate covering endpoint identities, no-leak clear, label privacy, certificate reuse, no-storage provider effect, expert status, and provenance closure | eval/regression | `npm run test:skopeo-graph-evals && node scripts/verify-skopeo-storage-boundary.mjs && npm run validate:extension` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/skopeo-graph-schema.test.js` — schema, ID, provenance, vocabulary, response-local/generation-handle references, exact endpoint/evidence-bound relation-version and canonical overlay-generation IDs, target-only replacement, name-label/identity separation, and locator contracts.
- [ ] `tests/universal-provider-cancellation.test.js` — caller-signal composition, abortable fetch/backoff, retry suppression, and existing-provider parity.
- [ ] `tests/skopeo-corpus-store.test.js` additions — binder/capability/verifier authorization, exact source-versus-partition request shapes, revocation, and replay rejection.
- [ ] `tests/skopeo-graph-store.test.js` — provider-bound source generations, authorized participant adapters, endpoint-bound candidate overlays, target-only generation replacement, proposer-only empty clear without target existence leakage, location-aware label storage, journals, recovery, pointer-last publication, and complete absence.
- [ ] `tests/skopeo-graph-extractor.test.js` — segmentation, invariant-only sessions, distinct fresh certificates/reuse-expiry rejection, exact Phase 54 provider no-storage acknowledgement, bounded raw-result lifetime, provider binding/drift, name-bearing validated labels, prior handles, caps, strict admission, repair, and reuse.
- [ ] `tests/skopeo-graph-query.test.js` — exact lookup, authorized name-label lexical search/projection, candidate-only traversal with target-drift suppression, provenance, zero boot hydration, lazy authorized reconstruction, and stale/cross-partition/cache-outside-ownership exclusion.
- [ ] `tests/skopeo-graph-runtime.test.js` — imports, durable recovery order, participant authorization, invariant-only/fresh-certificate provider choreography, mandatory publisher acknowledgement with zero durable provider effect, candidate relation/overlay identity and proposer-only clear, label privacy, lazy query cache, Phase 54 fencing, content closure, MCP independence, and unavailable-provider state.
- [ ] `tests/skopeo-graph-evals.test.js` plus `tests/fixtures/skopeo-graph-evals/` — the complete `P01–P06`, `Q01–Q06`, `A01–A07`, `I01–I05`, `L01–L03`, `R01–R07`, and `B01–B03` corpus, including P01 name-label privacy/search, P06 relation/overlay identity, I05 no-storage provider handoff, R03/B03 certificate freshness, R06 target advance, and R07 proposer-only clear.
- [ ] `package.json` — add `test:skopeo-graph-evals` and include all focused Phase 55 tests in the normal `npm test` chain.

No test framework or external package installation is required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Expert domain-label adjudication gate | TRUTH-01, TRUTH-10 | Contract-kind/relation/evidence fidelity requires real commercial-contracts counsel/legal-operations judgment; code cannot manufacture or infer reviewer approval | Keep each fixture at `review_status: pending`, `gold_label_version: null`, empty approved roles, and null review record until the required real roles adjudicate its provisional records/relations/spans. Require counsel plus legal operations for P/Q/amendment/locator cases, privacy/security for I cases, and evaluation engineering for encoding. The harness reports `domain_fidelity: human_needed` while any approval/evidence/version is missing and must not report a Critical domain-fidelity PASS. |
| Optional configured-provider quality qualification | LOCAL-04, LOCAL-05 | Network credentials, model availability, pricing, and non-deterministic output are operator-controlled and cannot be required by CI | On explicit authorization only, run the synthetic/redacted fixtures through the already configured provider. Score domain thresholds only against genuinely `approved` labels; with pending labels report `human_needed`, not PASS. This cannot override deterministic publication gates or expert adjudication. |
| Chrome MV3 smoke after automated closure | LOCAL-01, LOCAL-02, LOCAL-03 | Final browser packaging/service-worker lifecycle is best observed in Chrome; it is not evidence for model correctness | Load the unpacked extension, verify background boot without Graphify/Python/server/MCP, run a synthetic authorized source build/query/restart cycle, and inspect only bounded provenance/diagnostic projections. Record as human UAT, not automated PASS. |

---

## Threat References

| Ref | Threat | Required automated proof |
|-----|--------|--------------------------|
| T55-01 | Prompt/source injection or executable model output | `I01–I02`, closed schema, no-tool request scan, and zero durable effect |
| T55-02 | Cross-source/account/corpus disclosure, candidate-link spoofing, or graph traversal | `P06`, `I03–I04`, `R06–R07`; exact proposer/target record versions/generations and evidence in relation/overlay IDs; target-only advance suppression; proposer-only empty clear with zero target read/existence signal |
| T55-03 | Provider/model fallback, mid-generation drift, raw-response leakage, or over-broad upload | `I05`, `B01–B03`; invariant-only session/staging/batch binding; exact configured-provider spy; no-storage operation-result lifetime; envelope caps; location-aware validated-label markers |
| T55-04 | Late provider response, reused/expired certificate, or cancellation/deadline | `R01–R03`, `B03`; distinct fresh-operation certificate acceptance, identity replay/expiry rejection, abort during fetch/backoff, exact publisher acknowledgement, zero durable provider effect/retry/late write |
| T55-05 | Partial publication, stale dual truth, forged participant purge, or uncleared candidate influence | `R04–R07`, corpus-owned one-call capability/replay tests, target advance/revoke, proposer-only clear, pointer-last visibility, and complete participant/cache absence |
| T55-06 | Quota, corruption, MV3 crash, or unauthenticated cache hydration exposes inconsistent state | Fault injection at every storage boundary, durable-only boot recovery, zero boot fingerprint/cache reads, and bounded lazy reconstruction |
| T55-07 | Forged/clipped evidence or invalid relation semantics | `A01–A07`, `L01–L03`, qualifier fixtures, endpoint matrix and exact byte resolution |
| T55-08 | Unbounded traversal/result, raw-storage exposure, or name-label leakage | Exact depth/node/edge/byte caps plus location-aware assertions: schema-valid party/person/vendor labels only in authoritative record/lexical, exact-owned cache, and fresh bounded projections; zero in diagnostics/errors/unrelated/unauthorized/closed/cache-outside-ownership paths |
| T55-09 | Unreviewed upstream code/runtime or fabricated review evidence enters closure | Exact repository/commit/MIT/copyright/six-file inventory, copied-code inventory empty, explicit fixture review status, static dependency scan |

---

## Validation Sign-Off

- [x] Every planned capability family has a focused automated command or explicit Wave 0 dependency.
- [x] Sampling continuity requires automated verification after every task; no three-task gap is permitted.
- [x] Wave 0 enumerates every currently missing focused test and fixture artifact.
- [x] Focused task commands are authoritative until 55-05 Task 3 creates/package-wires the aggregate; the aggregate is mandatory only from that point forward.
- [x] Deterministic structural/security status and expert domain-fidelity `human_needed|approved` status are reported separately; pending labels cannot become a Critical PASS.
- [x] Candidate clear, endpoint-bound relation/overlay replacement, one-use fresh certificates, exact provider no-storage acknowledgement, and location-aware name-label privacy each have focused plus 37-fixture coverage.
- [x] Commands contain no watch-mode flags.
- [x] Focused feedback target is <30 seconds, with a required split if measurement exceeds it.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** strategy approved 2026-07-21; execution evidence pending
