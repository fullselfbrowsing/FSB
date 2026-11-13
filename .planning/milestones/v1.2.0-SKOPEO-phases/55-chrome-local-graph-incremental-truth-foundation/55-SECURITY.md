---
phase: 55
slug: chrome-local-graph-incremental-truth-foundation
status: verified
threats_open: 0
asvs_level: 1
asvs_version: "5.0"
register_authored_at_plan_time: true
created: 2026-07-21
verified: 2026-07-21
---

# Phase 55 — Security

> Per-phase security contract: plan-authored threat register, verified mitigations, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Certified Drive source → provider session | One exact source is segmented and sent only to the configured provider under a fresh certified operation. | Confidential source excerpts, invariant provider/model binding |
| Raw provider response → closed graph schema | Model output remains candidate data until strict parsing, semantic, evidence, ownership, and cap checks pass. | Untrusted JSON/text, derived labels, evidence locators |
| Graph records → `chrome.storage.local` | Source-owned immutable pages stage invisibly and become readable only through one final active pointer. | Validated records, relations, shards, generation metadata |
| Corpus mutation authority → graph purge participants | Corpus-owned one-call capabilities authorize exact source/partition purge and absence checks without exposing the corpus guard. | Nonserializable capability, exact request, signal, epoch |
| Fresh certificate → graph read/query scope | Certificate fingerprint/generation must match the current fragment before cache hydration, candidate work, status, or query output. | Exact partition/source/generation set, minimized results |
| Durable storage → fresh MV3 worker | Corrupt, partial, or stale generations must converge through bounded recovery without resurrecting authority. | Controls, journals, immutable pages, derivable shards |
| Graph facade → extension consumer | Only four bounded query methods and minimized status projections may leave the trusted background boundary. | Authorized record/relation projections, provenance |
| Concepts-only upstream provenance → repository | Graphify concepts are documented without copied/runtime code or dependency expansion. | Commit/license inventory and empty copied-code inventory |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Verified Mitigation | Status |
|-----------|----------|-----------|-------------|---------------------|--------|
| T55-01 | Tampering / Elevation of privilege | Schema and extraction admission | mitigate | Closed descriptors, key/kind/predicate allowlists, no executable fields/tools, data-only prompts, and zero-effect invalid-input coverage (`extension/utils/skopeo-graph-schema.js`, `extension/utils/skopeo-graph-extractor.js`, `tests/skopeo-graph-schema.test.js`). | closed |
| T55-02 | Spoofing / Information disclosure | Identity, ownership, candidate overlays, query scopes | mitigate | Length-prefixed ownership tuples, SHA-256 identities, exact fingerprint/generation binding, current endpoint overlays, exact partition/source scopes, and target-blind clear (`skopeo-graph-schema.js`, `skopeo-graph-store.js`, `skopeo-graph-query.js`). | closed |
| T55-03 | Information disclosure | Provider/session binding and raw output | mitigate | Fixed excerpt/call/source budgets; provider/model rechecks; raw response projected away before staging; labels retained only by authoritative, lexical, and fresh exact-scope owners (`skopeo-graph-extractor.js`, `skopeo-graph-engine.js`). | closed |
| T55-04 | Tampering / Denial of service | Cancellation and certificate lifecycle | mitigate | Caller abort and timeout remain active through fetch, response-body consumption, and backoff; fresh one-use certificates reject replay, expiry, and late completion (`universal-provider.js`, `universal-provider-cancellation.test.js`, `skopeo-graph-extractor.test.js`). | closed |
| T55-05 | Tampering / Repudiation | Replacement, stale cleanup, purge bridge | mitigate | Pointer-last publication, four corpus-owned one-call participant capabilities, cache absence proofs, and generation/fingerprint-conditional stale withdrawal inside the serialized mutation lane (`skopeo-corpus-store.js`, `skopeo-graph-store.js`, `skopeo-graph-runtime.test.js`). | closed |
| T55-06 | Denial of service / Tampering | Quota, corruption, recovery | mitigate | Bounded values/pages, injected quota handling, corrupt-pointer closure, sibling isolation, and sorted 128-item recovery that leaves uncertain truth withheld or repairing (`skopeo-graph-store.js`, `skopeo-graph-store.test.js`). | closed |
| T55-07 | Tampering | Evidence and relation semantics | mitigate | Exact UTF-8 excerpt registry, qualifier coverage, endpoint matrix, and collision/dangling/forward/cross-source rejection with abstention (`skopeo-graph-schema.js`, `skopeo-graph-schema.test.js`). | closed |
| T55-08 | Information disclosure / Denial of service | Query, cache, diagnostics, status | mitigate | Exact schemas and query/depth/node/edge/result/byte caps; minimized projections; current-scope cache ownership; metadata-only diagnostics; location-aware privacy tests (`skopeo-graph-query.js`, `skopeo-graph-query.test.js`, `verify-skopeo-storage-boundary.mjs`). | closed |
| T55-09 | Tampering / Elevation of privilege | Provenance, runtime, review surface | mitigate | Static rejection of Graphify/runtime/MCP/dynamic-eval/process/database expansion; pinned concepts-only provenance; empty copied-code inventory; all 37 expert labels remain pending (`README.md`, `verify-skopeo-storage-boundary.mjs`, `skopeo-graph-evals.test.js`). | closed |
| T55-SC | Supply-chain tampering | Package/install surface | mitigate | No dependency or lockfile expansion; `package.json` adds only the exact Phase 55 test commands; aggregate and static boundary checks pass. | closed |

*Status: open · closed*  
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Verification Evidence

- `npm run test:skopeo-graph-evals` — PASS: schema 572/572, provider cancellation 75/75, extractor 135 assertions, graph store/query/runtime PASS, and 37/37 executable fixtures.
- `node tests/skopeo-corpus-store.test.js` — PASS: 71 assertions.
- `node tests/lattice-provider-bridge-smoke.test.js` — PASS: 111/111.
- `node scripts/verify-skopeo-storage-boundary.mjs` — PASS across 32 dependency/injection files.
- `npm run validate:extension` — PASS with 435 JavaScript files parsed and all chained gates green.
- Final `npm test` — PASS.
- Final standard-depth code review — clean across 22 files with 0 Critical, 0 Warning, and 0 Info findings.
- Independent exact-boundary probes admit an actual 16,384-byte prior projection and 65,536-byte query result; paired max-plus-one probes reject 16,385 and 65,537 bytes plus every declared query/source/record/relation/evidence/call/reuse boundary.

The 37 fixture labels remain `review_status: pending`, all gold label versions remain null, and `domain_fidelity: human_needed` remains a separate expert-release gate. Security closure does not represent or fabricate expert semantic approval.

---

## Accepted Risks Log

No accepted risks. All registered threats are mitigated and verified closed.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-21 | 10 | 10 | 0 | GSD security auditor + orchestrator |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-21
