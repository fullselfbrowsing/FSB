---
phase: 58-cited-ask-decision-policy
status: passed
threats_found: 10
threats_closed: 10
threats_accepted: 0
threats_open: 0
asvs_level: 1
audited_head: de53f00d9067fb1c82efa22eb5d36e51165d45b3
created: 2026-08-27
updated: 2026-08-27
---

# Phase 58 — Security Audit

## Result

**PASSED** — all ten plan-time threat families are closed in implementation and tests. No security risk was accepted and no open mitigation remains.

## Trust Boundaries

| Boundary | Enforced property |
|---|---|
| Question/source/provider → ask schema and engine | Exact own-data shapes, bounded inert text/excerpts, no tools, closed candidate grammar, and local-only adjudication. |
| Corpus/access state → ask result | Fresh complete exact-set proof; inaccessible, partial, stale, cancelled, or over-cap evidence exposes no material prefix. |
| Citation claim → navigation | Locally assigned citation IDs plus current source/revision/access/controller proof and a one-shot opaque action. |
| Policy persistence → mutation | Trusted local partitioning, strict read-before-mutate, stable identities, explicit human actions, and no content-readable storage authority. |
| Model answer → policy clearance | Complete separation: model output cannot set applicability, identity, complexity, review, memo state, or clearance. |
| Configured Document 10 → current source | Independent exact query authorization derives current/missing/inaccessible/stale without adding it to answer evidence. |
| Agreement graph → memo safeguard | Exact current agreement record relation to one scoped memo; routine omission and incomplete/ambiguous failure closure. |
| Background → content | Minimized frozen projection and opaque tokens only; no source IDs, URLs, revisions, provider handles, stores, proofs, or policy identities. |
| Content → Shadow shell | Closed enum-to-copy composition, literal `textContent`, current authority recheck, native controls, bounded rail, and exact teardown. |

## Threat Disposition

| Threat | Status | Principal mitigation/evidence |
|---|---|---|
| T58-01 hostile question/source/prompt changes scope or instructions | CLOSED | Bounded inert excerpts, closed candidate parser, local scope assignment, hostile fixture matrix. |
| T58-02 incomplete/inaccessible evidence produces a conclusion | CLOSED | Complete exact-set proof, all-or-nothing material publication, abstention/closed outcomes. |
| T58-03 fake or stale citation supports claim/navigation | CLOSED | Citation IDs assigned locally; source, revision, access, tuple, and action revalidated on use. |
| T58-04 stale authority or late provider completion repaints | CLOSED | Ask/controller epochs, abort-first replacement, pre-publish currentness checks, teardown tests. |
| T58-05 model output controls decision policy | CLOSED | Deterministic local policy engine accepts no provider fields; policy tests cover injection attempts. |
| T58-06 filename/order/label impersonates identity | CLOSED | Stable file/agreement keys and partition authority; labels never select Document 10 or complexity. |
| T58-07 policy/review action replays after drift | CLOSED | One-shot status, confirmation token, open-before-ack, and account/corpus/source/revision rechecks. |
| T58-08 memo absence/obligation inferred incorrectly | CLOSED | Explicit complex classification, complete absence proof, exact agreement relation, routine omission. |
| T58-09 raw authority leaks to content/MCP/storage/logs | CLOSED | Minimized facade, private stores/actions, static storage-boundary gate over 33 files. |
| T58-10 Focused UI harms host/accessibility/teardown | CLOSED | One existing Shadow scope, certified collision behavior, native semantics, preferences, zero residue. |

## Review Repairs Included in Audit

- `09fbdb76` — storage mutation now fails closed on unavailable or malformed reads.
- `018953dc` — configured Document 10 receives its own exact current authorization.
- `de53f00d` — memo qualification is bound to the current agreement relation.

## Supply Chain

No dependency, lockfile, remote asset, extension permission, manifest capability, server, daemon, or new provider was added. The package change is test registration only. Extension validation, storage-boundary verification, focused security fixtures, the real local Chrome contract, and the full repository suite passed.

## Approval

`threats_open: 0`; security audit approved at `de53f00d9067`.
