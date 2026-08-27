# Phase 56: Governing Lineage, Evidence & Deadline Engine - Context

**Gathered:** 2026-07-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 56 turns the current, permission-certified Phase 55 graph into closed and explainable governing-lineage conclusions, separately cited exact facts and conflicts, deterministic deadline derivations, and alert-eligibility decisions. It does not render the Drive/Docs HUD, answer free-form questions, enforce Document 10 or memo policy, schedule or deliver alerts, mutate source documents, or substitute model output for legal precedence; those responsibilities remain Phases 57-59.

</domain>

<decisions>
## Implementation Decisions

### Governing lineage adjudication
- Current governance requires exact executed/effective evidence plus explicit admissible lineage language over the current authorized source set. Filename, recency, similarity, folder order, and list position never establish precedence.
- Partial amendments are clause-scoped overlays targeting exact base clauses. Untouched clauses continue from the base agreement, while an unclear or conflicting target makes the affected document family review-required.
- Represent execution state, temporal state, lineage role, and governance conclusion as separate closed axes so states such as unsigned-but-recent, historical-but-relevant, superseded, and partially governing remain distinguishable.
- Model output remains validated candidate data only. A deterministic adjudicator either derives a cited governing conclusion from accepted evidence or abstains; no second model pass may promote precedence.

### Exact facts and evidence
- Store signed, effective, expiration, termination, renewal, notice-window, notice-deadline, delivery-method, and written-address facts as separate immutable assertions with closed type-specific values rather than one lifecycle summary or free-form key/value bag.
- Every material citation binds the exact partition, source revision/fragment generation, record version, locator ID, and byte range. Source navigation is resolved freshly by background authority rather than trusting a stored URL or filename.
- Keep source access/currency separate from the required claim trust states: `extracted`, `inferred`, `ambiguous`, `unreadable`, and `review-required`. Numeric model confidence is never clearance authority.
- Preserve competing assertions as an explicit conflict set. Only accepted governing lineage may select an applicable assertion; otherwise the semantic slot stays review-required and blocks downstream deadlines.

### Deterministic deadline derivation
- Encode deadline rules as a closed data-only schema with allowlisted date operations and explicit cited inputs. Arbitrary JavaScript, executable expressions, and model-generated arithmetic are prohibited.
- Never default to browser locale or silently assume UTC. Calendar-day rules are supported directly; business-day rules require an explicit governing calendar or remain review-required.
- Derive notice-window start, notice deadline, boundary inclusivity, governing timezone, and consequence separately from renewal, termination, and expiration.
- A deadline is alert-eligible only when governing lineage is current, every input is accessible and exact, the rule is supported, and no unresolved conflict exists. Otherwise return an ineligible result with closed blocker codes; Phase 56 does not schedule alerts.

### Authority, persistence, and invalidation
- Add one bounded background-only exact-set snapshot seam through the existing Phase 54 authority path so the truth engine can inspect complete current Phase 55 records and relations. It may not read graph storage directly or infer completeness from search results.
- Persist immutable document-family truth snapshots bound to every input fragment, record, relation, and rule version, publishing one complete active snapshot pointer-last rather than mutating partition-wide truth in place.
- Maintain source reverse dependencies and synchronously withdraw every affected truth snapshot before full recomputation. Phase 56 takes real ownership of the reserved `citations` purge participant; `counts` and `alerts` remain explicit empty participants for their later owning phases.
- Expose a separate frozen background truth facade that boots after graph recovery and returns only minimized lineage, fact, conflict, citation, and deadline projections under fresh authority. Content and MCP receive no raw graph, truth-store, or storage access.

### the agent's Discretion
- Exact closed enum names, canonical encodings, hash/version prefixes, rule operators, finite caps, and reason-code vocabulary within the accepted semantic boundaries.
- Exact module split, durable key layout, reverse-dependency representation, journal/recovery budgets, and test fixture organization, provided source withdrawal and pointer-last publication remain exact.
- Exact deterministic calendar implementation and supported initial rule subset, provided unsupported timezone, holiday, business-day, or boundary semantics visibly abstain rather than approximate.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/utils/skopeo-graph-schema.js` already provides closed source-owned record/relation identities, exact record versions, candidate-only cross-document relations, and byte-range evidence locators.
- `extension/utils/skopeo-graph-query.js` and `extension/utils/skopeo-graph-engine.js` already provide opaque exact-source scopes, fresh Phase 54 operations, bounded projections, currentness checks, and a private frozen background facade.
- `extension/utils/skopeo-corpus-store.js` reserves `citations`, `counts`, and `alerts` purge participants; `extension/background.js` currently registers explicit empty binders for those later-owned categories.
- `extension/utils/skopeo-graph-store.js`, native Web Crypto, `chrome.storage.local`, and the existing mutation/journal patterns provide deterministic IDs, immutable pages, pointer-last controls, bounded recovery, and exact absence proofs.

### Established Patterns
- Trusted modules are classic service-worker scripts with global/CommonJS parity, exact own-key parsing, recursively frozen outputs, finite caps, and no content-script or generic message/storage bridge exposure.
- Changed or revoked input is withdrawn before recomputation; durable source-owned data is staged invisibly and published only through one final pointer after complete validation.
- Authority is nonserializable and operation-local. Reads and effects recheck the exact partition, source generations, controller tuple, and abort boundary immediately before and after asynchronous work.
- Deterministic structural/security evaluation, provisional regression evidence, and real expert approval remain separate statuses; tests cannot manufacture domain adjudication.

### Integration Points
- Extend the graph query/engine boundary with a bounded exact-set snapshot operation rather than granting the truth engine direct store access.
- Load truth schema/store/engine modules after the five graph modules, replace only the `citations` empty purge binder, recover truth after graph recovery, and expose the truth facade only after all dependencies are current.
- Phases 57-59 consume minimized truth projections through fresh display/query/alert operations while retaining the existing Skopeo lifecycle, permission, and source-navigation authority.

</code_context>

<specifics>
## Specific Ideas

- Treat a governing result as a reproducible proof object: exact current inputs, accepted rule, conclusion or abstention, conflicts, and complete citations travel together.
- Treat partial amendment resolution as an overlay map, not destructive rewriting of the base agreement or identity fusion between documents.
- Keep a notice deadline visibly distinct from renewal, termination, and expiration even when one date is derived from another.
- Smart Discuss is the autonomous variant of discuss-phase; this file is the single Phase 56 decision authority and does not create a parallel design contract.

</specifics>

<deferred>
## Deferred Ideas

- Phase 57 owns folder/reading HUD composition and user-facing rendering of these projections.
- Phase 58 owns cited free-form ask behavior plus Document 10 and complex-memo decision policy.
- Phase 59 owns alert scheduling/delivery, current-user recipient reconciliation, notification ledger behavior, and milestone release hardening.
- Expert legal/domain approval and live Chrome validation remain real human evidence and must not be inferred from deterministic fixtures.

</deferred>
