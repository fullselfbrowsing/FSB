# Skopeo v1.2.0 Research Summary

**Domain:** On-demand, page-native HUD with permission-scoped Google Drive vendor-contract intelligence
**Researched:** 2026-07-14
**Overall confidence:** HIGH for product shape, MV3 integration boundaries, and safety ordering; MEDIUM for representative-file coverage, Drive content-access durability, and notification delivery semantics

## Executive Decision

Build Skopeo as a native FSB capability, not a separate contract application and not an embedded Graphify runtime. Its first capability pack should turn the accessible `vendor agreements` Drive hierarchy into three on-demand states:

1. **Folder intelligence:** active agreement, owner, next material date, gaps, and index quality.
2. **Reading awareness:** whether the open document governs today, what supersedes it, and the exact cited facts that matter.
3. **Focused ask:** a permission-scoped answer that distinguishes governing evidence from historical language and exposes conflicts, gaps, and confidence.

The defensible platform is the combination of semantic anchoring, a strict attention budget, and a permission-partitioned truth layer. Generic chat or a detached sidebar is not the product proof.

## Recommended Approach

- Keep the HUD explicitly invoked. When off, no rail, marks, observers, ghosting, focus hooks, or host-page mutations may remain.
- Reuse FSB's MV3 service worker, overlay lifecycle, provider layer, schema validator, MiniSearch, alarms, and bounded Drive/Docs handlers.
- Inject a small Skopeo runtime only when requested; do not add an always-loaded content script or a second application shell.
- Keep Drive/Docs as the work surface. Render only the shared primitives needed for the current state: anchor mark, entity chip, halo, rail, ghost layer, and gate.
- Treat storage as truth and every runtime as disposable. Persist source fingerprints, graph revision, review state, and alert ledger before an event handler returns.
- Build a compact native node-link store in plain JavaScript. Use lexical retrieval to select evidence, then bounded graph traversal to resolve lineage and governing state.
- Require a typed evidence bundle before UI or answer synthesis: claim, governing state, accessible source/revision, source location, confidence state, and conflicts.
- Derive legal dates deterministically from validated governing facts. The model may extract candidates; it must not silently calculate or choose the controlling deadline.
- Prefer the existing page-owned, same-origin Drive/Docs session for the first implementation. A new `chrome.identity` OAuth flow is a fallback only if signed-PDF/content access cannot meet the requirements and the product accepts restricted-scope verification obligations.
- Add no new runtime package for the foundation. PDF parsing, OCR, IndexedDB, and external delivery infrastructure are evidence-gated additions, not default dependencies.

## Selectively Adapted Graphify Concepts

Skopeo should adapt Graphify's data-contract ideas without its Python/runtime/database stack:

| Concept to adapt | Skopeo form |
|------------------|-------------|
| Stable identity | Account/corpus-partitioned document IDs plus file revision/content fingerprint; clause and fact IDs remain source-owned. |
| Provenance | Every node, edge, fact, event, answer claim, and alert resolves to an accessible file revision and exact location. |
| Confidence | Explicit states such as extracted, inferred, ambiguous, unreadable, and review-required, with reasons—not an unexplained percentage. |
| Incremental replacement | Validate a new source fragment, atomically remove the prior source-owned fragment, install the new one, then recompute affected lineage, facts, search entries, and alerts. |
| Bounded query | MiniSearch candidate selection followed by allow-listed relations and limited traversal depth; never expose arbitrary graph execution. |
| Explainability | Render governing path, historical contrast, evidence gaps, and citations rather than an end-user graph explorer. |

Do not add Graphify itself, Python, NetworkX, Neo4j/FalkorDB, a graph visualizer, or generic GraphRAG infrastructure.

## Architecture and Build Order

```text
explicit invoke
  -> lifecycle/context router
  -> semantic anchor registry
  -> permission-scoped view-model request
  -> evidence bundle
  -> attention policy + shared primitives

Drive/Docs source
  -> identity/access partition
  -> fingerprint + readability state
  -> deterministic/schema-constrained extraction
  -> atomic source replacement
  -> lineage/facts/deadlines/index
  -> folder, reading, ask, and notification projections
```

Build in this dependency order:

1. **Lifecycle and HUD safety:** invoke, dismiss, universal kill, cancellation, Shadow DOM shell, accessibility, and zero-residue tests.
2. **Context and anchoring:** Drive folder/document recognition, semantic identity validation, SPA/virtualized-row recovery, and fail-quiet behavior.
3. **Permission and source boundary:** current account, enrolled corpus, readable/blocked states, fingerprints, revocation/account-switch behavior, and live Drive UAT.
4. **Truth graph and lineage:** closed schemas, source ownership, atomic replacement, amendments, supersession, conflicts, citations, and confidence states.
5. **Facts and deadlines:** distinct signed/effective/term/renewal/notice facts, written-notice destination, deterministic calculations, and alert eligibility.
6. **Folder and reading projections:** sparse badges/rail/timeline and governing-document awareness, driven only by typed evidence.
7. **Cited ask and policy:** bounded retrieval/traversal, governing-versus-history synthesis, Document 10 gate, and rare human-memo status.
8. **Notification and hardening:** recipient adapter, reconciliation, deduplication, failure ledger, live permission UAT, and anchor-regression testing.

Chat, alerts, and polished folder decoration must not precede permission partitioning, source replacement, lineage, and evidence contracts.

## MVP Scope

Ship v1.2.0 with:

- Complete on-demand lifecycle and immediate kill with no visible or interactive residue.
- Shared six-primitive grammar, constrained attention states, and semantic anchors for the three contract contexts.
- Permission-scoped corpus recognition, per-account derived state, readable/pending/unreadable/missing status, and revocation-safe behavior.
- Active/amended/historical/superseded lineage with a direct route to the governing source.
- Exact cited dates, notice rule/deadline, consequence, delivery method/address, owner, confidence, and evidence gaps.
- Folder prioritization for upcoming deadlines, renewal consequences, missing final copies, owner gaps, and index quality.
- Permission-scoped vendor/corpus questions with governing/historical distinction, citation navigation, abstention, and conflict visibility.
- Document 10 as a configured policy identity, never a file-list position.
- Memo required/on-file/missing only for explicitly flagged complex agreements; memos remain human-authored.
- Incremental updates that remove stale facts, paths, search hits, and alerts.
- A 90-day notification flow only after the recipient meaning below is decided and testable.

## Deferred or Conditional Scope

- OCR: initially expose low-OCR/unreadable scans as evidence gaps. Add a local OCR stack only after representative volume and accuracy justify bundle, CPU, and false-exactness costs.
- PDF parser: add a locally bundled parser only if bounded Drive download/export or rendered text cannot cover representative signed PDFs.
- IndexedDB: begin with compact per-account records in trusted `chrome.storage.local`; move larger graphs/indexes only after measured storage/write pressure.
- New Google OAuth: use only if the page-owned Drive/Docs route fails content coverage and restricted-scope consent, verification, and retention obligations are accepted.
- Browser-independent sync, webhooks, and team delivery: a separate authorized backend milestone with tenant isolation and audit.
- Notice drafting/sending, source mutation, escalation workflows, more capability packs, graph explorer, standalone CLM dashboard, and AI-authored contract memos.
- Vector databases and embeddings unless evaluation proves lexical retrieval plus structured relations cannot recover governing evidence.

## Critical Risks and Required Gates

1. **Permission leakage:** cached snippets, counts, graph paths, memo existence, or citations can survive revocation. Partition by account/corpus, attach source ownership everywhere, revalidate at display/query/send time, and tombstone atomically.
2. **Wrong governing state:** similarity cannot resolve amendments. Lineage and execution/effective evidence must gate facts, answers, and alerts; unresolved precedence must abstain.
3. **Ghost truth:** merge-only updates leave stale clauses and duplicate reminders. Per-source replacement and idempotency/delete/revoke fixtures are release gates.
4. **Prompt injection:** contracts, filenames, and host DOM are untrusted. Provider calls get quoted evidence, closed schemas, and no browser-tool authority; rendered citations resolve through a trusted registry.
5. **False precision:** low-OCR or ambiguous dates/addresses must never schedule an alert. Keep raw clause, source location, derivation trace, confidence/review state, and boundary-date tests.
6. **Drive anchor drift:** virtualized rows and SPA navigation recycle elements. Validate semantic identity continuously, rebind or withdraw, and pass repeated on/off, reorder, scroll, zoom, and navigation tests.
7. **Brittle content access:** the page-owned Drive/Docs path avoids a second OAuth identity but depends on host behavior. Representative Google Docs, text PDFs, blocked downloads, shared access, and revocation require live UAT before scope claims.
8. **MV3 timing limits:** service workers disappear and alarms can be late. Reconcile persisted due state on wake/start; never label an alarm creation as delivered.
9. **Legal/compliance overclaim:** no “approved” or “cleared” state without governing evidence and required policy documents. Confidence must explain limitations, not decorate them.

## Unresolved Product Decision: Who Is the Notification Recipient?

The requirement says the mapped contract owner is notified 90 days before the **notice deadline**, but a browser-only extension has two materially different meanings:

### Option A — Current browser user

Use `chrome.notifications` plus persisted alarm reconciliation and a delivery ledger. This is native, local, and achievable in v1.2, but only reaches the person using that Chrome profile. If another employee is listed as owner, Skopeo must show that the owner is not locally deliverable rather than claim success.

### Option B — Another mapped owner/team member

This requires an explicitly authorized delivery adapter such as email, chat, calendar, or a backend service. It introduces account mapping, additional permissions, delivery/audit state, retry semantics, and likely browser-independent infrastructure. It should be scoped as a separate integration unless one channel is explicitly approved now.

**Decision required before notification planning:** Is v1.2 success “notify the current FSB user,” or “deliver to whichever person is mapped as owner”? Scheduling, delivery, and UI acceptance criteria cannot be finalized until this is answered.

## Research Inputs

- [Stack research](./STACK.md)
- [Feature research](./FEATURES.md)
- [Architecture research](./ARCHITECTURE.md)
- [Pitfalls research](./PITFALLS.md)

---
*Research synthesis for: FSB v1.2.0 Skopeo*
*Synthesized: 2026-07-14*
