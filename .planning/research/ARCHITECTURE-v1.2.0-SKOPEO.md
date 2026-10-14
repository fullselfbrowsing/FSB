# Architecture Research

**Domain:** On-demand semantic HUD plus Drive contract truth layer inside an existing MV3 extension
**Researched:** 2026-07-14
**Confidence:** HIGH for FSB integration seams; MEDIUM for document-format coverage and notification delivery until fixture/live UAT

## Standard Architecture

### System Overview

```text
User invokes Skopeo on Drive/Docs
        |
        v
Background lifecycle coordinator (storage is truth; service worker is disposable)
        |                       |
        |                       +--> deadline reconciler --> delivery adapter + alert ledger
        v
On-demand content runtime in isolated world
  context router --> semantic anchor registry --> six primitive renderer
        ^                    |                    |
        |                    +---- host DOM observations / re-anchor
        |
Capability/data boundary
  current Drive identity/access --> source adapters --> extractor/validator
        |                                              |
        +--> permission partition                      v
                                                native truth graph
                                     source -> doc -> clause/fact/event/policy
                                                |              |
                                                +--> MiniSearch candidate index
                                                +--> bounded lineage/query engine
                                                              |
                                                              v
                                                cited view model (never raw graph UI)
```

### Component Responsibilities

| Component | Status | Responsibility | Integration |
|-----------|--------|----------------|-------------|
| Skopeo lifecycle coordinator | New | Explicit on/off state per tab, kill-all, context handoff, cleanup, replay after reinjection | Follow current overlay-state/message patterns in `background.js`; store active state in `chrome.storage.session` and make teardown idempotent. |
| Context/genre router | New | Recognize supported Drive folder, vendor folder, agreement document, focused ask, or unsupported page | Consume URL + stable DOM/page signals; return confidence and reason rather than directly rendering. |
| Anchor registry | New | Convert semantic targets into live host elements/ranges; detect row recycling/removal; re-anchor or fail quiet | Reuse DOM-state fingerprints/MutationObserver techniques, but keep selectors pack-owned and semantic. |
| Six-primitive renderer | New over existing overlay foundation | Render anchor mark, chip, halo, rail, ghost layer, and gate through shared contracts | Isolated Shadow DOM; FSB tokens; accessibility, reduced motion, collision management, and one teardown path. |
| Contract capability pack | New | Translate folder/document/ask view models into allowed primitives and attention budgets | No custom chrome; no direct storage/API access. |
| Drive/Docs source adapters | Extend existing | List accessible files, read metadata/permissions/content, fingerprint sources, report unreadable/blocked state | Extend `gdrive.js`, `gdocs.js`, and bounded request actions with negative controls. |
| Extraction pipeline | New | Deterministic metadata/date candidates plus schema-constrained AI extraction; emit nodes/edges/facts with citations/confidence | Shared provider layer + `@cfworker/json-schema`; source text remains untrusted data. |
| Native truth graph | New | Stable identities, source replacement, lineage, active-state resolution, conflicts, policies, owners, memos, event facts | Plain records/adjoining indexes in per-account storage; no general graph DB. |
| Query/evidence engine | New | Retrieve candidates, traverse only allowed relations/depth, resolve governing/historical evidence, abstain on gaps | MiniSearch + bounded adjacency traversal; every material claim requires accessible provenance. |
| Deadline reconciler | New over alarms | Derive notice deadline from governing facts, produce event state, re-arm/dedupe alerts, reconcile missed alarms | Existing alarm listener conventions; never schedule from ambiguous/unreviewed facts. |
| Delivery adapter | New, decision-gated | Deliver current-user Chrome notifications or future authorized team channel; record attempt/outcome | Interface first; do not conflate scheduled with delivered. |

## Recommended Project Structure

```text
extension/
├── skopeo/
│   ├── lifecycle.js          # on/off/kill state machine and message contract
│   ├── context-router.js     # page genre + pack selection
│   ├── anchors.js            # semantic target registry and re-anchor policy
│   ├── primitives.js         # shared render contracts
│   ├── renderer.js           # Shadow DOM host, focus/a11y, teardown
│   └── contract-pack/
│       ├── drive-context.js  # folder/document identity adapters
│       ├── view-models.js    # folder, reading, ask projection
│       └── policies.js       # Document 10 + explicit complex-memo policy
├── intelligence/contracts/
│   ├── schema.js             # closed node/edge/fact/extraction schemas
│   ├── source-store.js       # fingerprints, revision/access state
│   ├── extractor.js          # deterministic + provider extraction orchestration
│   ├── graph-store.js        # atomic per-source replace and adjacency indexes
│   ├── governing-state.js    # amendment/supersession/effective resolution
│   ├── query.js              # permission-scoped candidate + bounded traversal
│   └── deadlines.js          # date rules and event derivation
└── notifications/
    └── contract-reminders.js # reconcile, ledger, adapter boundary
```

Exact filenames should be reconciled during phase planning; the important rule is that rendering, source access, truth maintenance, and delivery remain separate boundaries.

## Architectural Patterns

### 1. Stored Truth, Disposable Runtime

The MV3 service worker can disappear at any time. Persist source fingerprints, graph revision, alert ledger, and active-tab session envelope before returning. On wake, reconcile storage to current tabs/Drive access; never depend on timers or in-memory graph objects as authority.

### 2. Atomic Per-Source Replacement

Each file/revision owns an extraction fragment. Validate the new fragment, then atomically remove the previous fragment's owned facts/edges and install the new one. Cross-document relationships are re-resolved afterward. This prevents ghost clauses and stale deadlines after an amendment or revoked source.

### 3. Evidence Before Projection

The graph/query layer emits a typed evidence bundle:

```text
claim + governing state + source file/revision + location + confidence + access check + conflicts
```

Only then does the contract pack choose a primitive. UI code must not infer legal state from labels or raw search rank.

### 4. Permission as a Partition Key

Partition storage/index keys by Drive account identity and corpus enrollment. Revalidate source access at ingestion and query/display time. Losing access tombstones/removes owned derived records before a subsequent query can expose snippets, counts, relationships, or citations.

### 5. Semantic Anchor Contract

An anchor descriptor names what it means (`vendor-folder:fileId`, `document:revision`, `clause:citation`) plus candidate locators and validation signals. The registry observes the host DOM, confirms identity, tracks bounding geometry, and either rebinds or withdraws. It never retains a stale element reference after virtualization.

## Key Data Flows

### Invocation and Render

```text
toolbar/shortcut --> lifecycle ON --> inject runtime --> context classification
    --> pack view-model request --> permission-scoped evidence bundle
    --> anchor registry resolves targets --> attention policy selects primitives
    --> render

kill/dismiss/navigation unsupported --> cancel pending work --> disconnect observers
    --> remove Shadow root/ghosting/focus hooks --> lifecycle OFF
```

### Ingestion and Incremental Update

```text
enroll accessible vendor folder
  --> list children + file metadata/capabilities
  --> compare fileId/revision-or-modified fingerprint
  --> read supported content OR record blocked/unreadable gap
  --> deterministic candidates + structured provider extraction
  --> schema/citation validation
  --> atomic per-source graph replacement
  --> recompute affected lineage/facts/deadlines/index
  --> reconcile alert ledger
```

### Cited Ask

```text
question + selected scope + current account
  --> current access filter
  --> MiniSearch candidates
  --> bounded graph traversal / governing-state resolution
  --> evidence sufficiency + Document 10/memo policy
  --> provider synthesis constrained to evidence bundle
  --> validate cited claims
  --> render conclusion, governing/history contrast, gaps, and source links
```

### Deadline Alert

```text
governing exact facts --> deterministic notice-deadline calculation
  --> reviewed/eligible event --> due-at = notice deadline - 90 days
  --> reconcile alarm --> delivery adapter
  --> ledger {scheduled, attempted, delivered|failed|missed, evidence revision}
```

## Trust Boundaries

| Boundary | Rule |
|----------|------|
| Host page -> content runtime | Treat DOM text/attributes/events as attacker-controlled; never use HTML injection or page-supplied code. |
| MAIN-world request bridge -> service worker | Closed action vocabulary, pinned origin/method, bounded response, typed errors, negative controls. |
| Drive source -> AI provider | Source text is data, never instructions; use explicit delimiters/schema and no tool authority in extraction calls. |
| AI output -> graph | Closed schema, citation resolution, confidence class, source ownership, and deterministic validation before mutation. |
| Graph -> answer/UI | Recheck account/source access and governing state; no uncited material conclusion. |
| Scheduler -> delivery | A due calculation is not delivery; record attempt and failure, and never duplicate by re-indexing. |
| Skopeo -> host layout | Shadow DOM/overlay only; no persistent host mutations after off/kill. |

## Dependency-Respecting Build Order

1. **Safety and lifecycle contract:** on/off/kill, cancellation, Shadow DOM primitive shell, accessibility, anchor test harness.
2. **Context router and anchor engine:** Drive folder/document identities, SPA/virtualization recovery, quiet unsupported states.
3. **Drive source boundary:** account/enrollment/access/capabilities, content adapters, fingerprints, gaps, revocation tests.
4. **Truth graph and lineage:** schemas, source replacement, citations/confidence, active/superseded/conflict resolution.
5. **Facts and deadlines:** deterministic date/address facts, notice calculations, review eligibility, corpus-quality UAT.
6. **Folder and reading projections:** three approved HUD states built only from typed evidence bundles.
7. **Cited ask and decision policy:** bounded retrieval/traversal, governing/history contrast, Document 10, complex memo status.
8. **Notification delivery and hardening:** configured recipient semantics, reconciliation, dedupe/failure state, live UAT and anchor redesign regression.

The final roadmap may group these, but it should not place chat, alerts, or polished Drive badges before permission, lineage, and evidence contracts.

## Scaling Considerations

| Scale | Adjustment |
|-------|------------|
| One designated folder, tens/hundreds of documents | Compact local graph + MiniSearch; incremental per-source replacement; no server database. |
| Thousands of documents / multi-folder portfolio | Measure storage/startup; move source/index records to IndexedDB; chunk reconciliation; keep view models bounded. |
| Browser-independent team delivery or enterprise corpus | Introduce an explicitly authorized backend/event subscription as a separate milestone with tenant isolation, OAuth verification, retention, and audit. |

## Anti-Patterns

- **Selector pack:** hard-coded nth-child/class selectors tied to Drive rows. Use semantic identity + validation + re-anchor.
- **RAG decides what governs:** similarity ranking cannot establish amendment precedence. Resolve lineage first.
- **Global graph:** a shared index leaks access and account boundaries. Partition and revalidate.
- **UI owns truth:** badges must project typed evidence, not compute facts from filenames.
- **One giant content script:** keeps Skopeo effectively always on and makes teardown unverifiable. Inject active runtime on demand.
- **Alert equals alarm:** an alarm firing is not owner delivery. Keep a delivery ledger and surface failure.

## Sources

- [Graphify how it works](https://github.com/Graphify-Labs/graphify/blob/v8/docs/how-it-works.md)
- [Graphify architecture](https://github.com/Graphify-Labs/graphify/blob/v8/ARCHITECTURE.md)
- [Chrome Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- [Google Drive changes](https://developers.google.com/workspace/drive/api/guides/manage-changes)
- [Google Drive download/export](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
- Local integration evidence: `extension/catalog/handlers/gdrive.js`, `extension/catalog/handlers/gdocs.js`, `extension/utils/capability-fetch.js`, `extension/utils/capability-catalog.js`, `extension/utils/overlay-state.js`, `extension/background.js`, and `extension/manifest.json`.

---
*Architecture research for: FSB v1.2.0 Skopeo*
*Researched: 2026-07-14*
