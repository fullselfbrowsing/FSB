---
phase: "56"
slug: governing-lineage-evidence-deadline-engine
status: verified
threats_total: 28
threats_closed: 28
threats_open: 0
asvs_level: 2
block_on: high
register_authored_at_plan_time: true
created: 2026-07-24
updated: 2026-07-24
---

# Phase 56 — Security

> Per-phase security contract for governing lineage, exact evidence, deadline evaluation, immutable truth publication, revocation, and the private background facade.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Source/model-shaped input → truth schema | Hostile objects, forged handles, unknown fields, executable shapes, and over-cap collections must fail before normalization. | Contract excerpts, issued handles, typed candidates |
| Exact corpus authority → graph snapshot | Only the complete current authorized source set may become adjudication input. | Source state, fingerprints, generations, graph records/relations |
| Source excerpts → configured provider | Provider access is source-local, bounded, cancellable, and incapable of durable writes or tool use. | Bounded source text and opaque issued handles |
| Provider response → deterministic adjudication | Model output is candidate-only and cannot choose governance, confidence clearance, arithmetic, or durable IDs. | Strict candidate JSON |
| Lineage and overlays → applicable facts | Only cited, current, chronologically admissible relationships and exact amendment clauses may affect applicability. | Family proofs, overlays, assertions, conflicts |
| Rules → civil-date arithmetic | No locale, clock, implicit UTC, dynamic dispatch, or unissued calendar may influence a deadline. | Civil dates, explicit timezone/calendar versions, closed rules |
| Semantic proof → durable truth | Complete immutable pages and partition generations publish pointer-last; partial state is never visible. | Proof pages, manifests, reverse dependencies, generation controls |
| Source/graph mutation → withdrawal | Multi-source influence must withdraw before graph or source authority changes. | Invalidation acknowledgements and dependency indexes |
| MV3 restart/corruption → recovery | Recovery is bounded, durable across worker restarts, fail-closed, and convergent beyond one 128-task pass. | Authenticated recovery cursor and stored truth authority |
| Durable truth → background consumers | Only bounded frozen projections escape; content, MCP, UI, scheduling, and raw store/provider access remain absent. | Minimal metadata, citation IDs, blocker codes |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| 56-01:T56-01 | Tampering / Elevation of privilege | Candidate truth schema | mitigate | Closed descriptors, issued document/clause/calendar handles, local IDs, and max+1 rejection in `skopeo-truth-schema.js` and its hostile-input tests. | closed |
| 56-01:T56-03 | Spoofing / Tampering | Citation and assertion identity | mitigate | Identity binds partition, source fingerprint/generation, record or relation, locator, and exact UTF-8 range; one-field mutation tests alter the derived ID. | closed |
| 56-01:T56-04 | Tampering | Deadline engine | mitigate | Strict civil dates, four literal operators, explicit boundaries/timezone/calendar/consequence, schema-first result parsing, and cross-TZ tests. | closed |
| 56-01:T56-06 | Tampering | Trust, conflicts, eligibility | mitigate | Separate trust/access states, complete conflict membership, sorted blockers, and no eligibility with any blocker. | closed |
| 56-01:T56-SC | Tampering | Supply chain | avoid | No dependency or lockfile change; package changes register only deterministic test wiring. | closed |
| 56-02:T56-05 | Spoofing / Tampering | Exact-set graph snapshot | mitigate | Canonical complete enumeration, source-state/currentness fences, whole-result caps, deterministic `sgx1:` digest, and real end-to-end handoff test. | closed |
| 56-02:T56-02 | Tampering | Graph label/candidate interpretation | mitigate | Labels, confidence, order, and support counts remain non-authoritative; only current explicit endpoints enter adjudication. | closed |
| 56-02:T56-01 | Elevation of privilege / Tampering | Truth extractor | mitigate | Static prompt, configured provider, issued registries, no-storage acknowledgement, strict whole-batch admission, and no semantic repair pass. | closed |
| 56-02:T56-03 | Spoofing | Evidence admission | mitigate | Exact current source bytes, UTF-8 offsets, locator ownership, fingerprints, and generations reject forged, clipped, stale, or foreign evidence. | closed |
| 56-02:T56-08 | Information disclosure | Provider/raw lifetime | mitigate | Source-local bounded input, raw-response clearing, category-only diagnostics, and no durable write capability. | closed |
| 56-03:T56-02 | Spoofing / Tampering | Family and lineage adjudication | mitigate | Complete evidence/version admission, independent axes, cycle/dangling rejection, permutation invariance, and no recency/label tie-break. | closed |
| 56-03:T56-06 | Tampering / Repudiation | Overlay chronology and conflicts | mitigate | Issued amendment source clauses, exact inheritance, obsolete-partial exclusion, same-day ambiguity abstention, and complete conflicts. | closed |
| 56-03:T56-03 | Spoofing | Applicable fact citations | mitigate | Assertions and citations are reparsed against the exact governing document or current overlay before applicability. | closed |
| 56-03:T56-04 | Tampering | Deadline proof | mitigate | Only the pure closed deadline engine receives cited applicable facts plus explicit immutable evaluation context. | closed |
| 56-03:T56-08 | Elevation of privilege | Pure adjudicator boundary | avoid | Static/runtime spies confirm no storage, provider, Chrome, network, UI, MCP, clock, or scheduling capability. | closed |
| 56-04:T56-07 | Tampering / Repudiation | Truth publication/dependencies | mitigate | Journaled immutable pages, symmetric dependencies, pointer-first withdrawal, pointer-last family and partition generation publication, and fault tests. | closed |
| 56-04:T56-05 | Spoofing | Complete input binding | mitigate | Store reparses semantic proofs and rebinds exact source/fragment/record/relation/candidate/rule versions and `sgx1:` before visibility. | closed |
| 56-04:T56-03 | Tampering | Citations purge participant | mitigate | Real truth owner authenticates exact one-call corpus capability before and after awaits and reports ownership on uncertainty. | closed |
| 56-04:T56-06 | Tampering | Invalidation reachability | mitigate | Frozen truth invalidator withdraws source/overlay influence before graph control mutations; malformed acknowledgement blocks mutation. | closed |
| 56-04:T56-08 | Information disclosure | Storage and diagnostics | mitigate | Fixed structural diagnostic allowlists with count/byte caps exclude content, identifiers, values, provider output, and raw errors. | closed |
| 56-05:T56-01 | Tampering / Elevation of privilege | Runtime extraction admission | mitigate | Runtime constructs real issued registries under fresh authority and publishes only a finalized complete candidate generation. | closed |
| 56-05:T56-02 | Spoofing | Runtime lineage input | mitigate | Runtime consumes only the certified exact-set graph facade and recomputed `sgx1:`, never search results or graph labels. | closed |
| 56-05:T56-03 | Spoofing / Tampering | Citation projection/currentness | mitigate | Exact source/graph/context bindings are checked before recompute, publication, and read; stale state withdraws before projection. | closed |
| 56-05:T56-04 | Tampering | Runtime deadline context | mitigate | Caller context, timezone, calendar ID/version, citations, and digest are validated before effects and before return. | closed |
| 56-05:T56-05 | Spoofing / Denial of service | Exact-set caps and truth generations | mitigate | Max+1 rejects without prefixes; complete immutable partition generations retire families absent from the current set. | closed |
| 56-05:T56-06 | Tampering | Clearance and conflicts | mitigate | Conflicting lineage, facts, deadlines, or stale authority withhold governance and deadline eligibility. | closed |
| 56-05:T56-07 | Tampering / Repudiation | Boot, mutation, recovery | mitigate | Ordered boot, real invalidation, terminal mutation failure, authenticated generation recovery, and durable bounded cursor across MV3 restarts. | closed |
| 56-05:T56-08 | Information disclosure / Elevation of privilege | Private facade/static boundary | mitigate | Seven bounded frozen background methods only; mutation probes reject storage/provider/graph-internal/dynamic-code/clock/content/MCP/global escape. | closed |

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-24 | 28 | 28 | 0 | GSD security auditor (ASVS 2, block-on high) |

### Verification Evidence

- `npm run test:skopeo-truth-evals` passed all Phase 56 truth suites.
- `npm run test:skopeo-graph-evals` passed all graph suites.
- Drive authority and corpus runtime/wake-recovery contracts passed.
- `node scripts/verify-skopeo-storage-boundary.mjs` passed across 32 injected/dependency files.
- The autonomous review/fix loop resolved 6 original criticals, 4 original warnings, and the three follow-up recovery/chronology findings.
- Deterministic structural/security and provisional regression passed. `domain_fidelity: human_needed` remains a separate legal/domain validation gate and is not an accepted security risk.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-24
