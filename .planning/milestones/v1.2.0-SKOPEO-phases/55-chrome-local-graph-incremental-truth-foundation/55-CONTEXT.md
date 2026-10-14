# Phase 55: Chrome-Local Graph & Incremental Truth Foundation - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 55 delivers the trusted Chrome-local graph substrate for the Drive corpus: closed source-owned graph/provenance schemas, partitioned durable fragments and indexes, model-assisted extraction through the existing FSB provider path, atomic source replacement, bounded deterministic query primitives, and a background-only consumer facade. It establishes stable identities for agreements, amendments, clauses, facts, events, owners, policy documents, and memos without deciding governing precedence, exact contract facts, deadlines, presentation, policy clearance, or notification eligibility; those remain Phases 56-59.

</domain>

<decisions>
## Implementation Decisions

### Graph truth and identity contract
- **D-01:** The atomic graph unit is an immutable, source-owned fragment versioned by the exact account/corpus partition, stable source file ID, and content fingerprint. A fragment is staged and published or replaced as one unit; graph records are never updated in place across source generations.
- **D-02:** Graph identities are deterministic namespaces over partition, source, closed record kind, and a stable source locator/local key. Names, labels, similarity, model-created IDs, and normalized text never create global identity. Cross-document equivalence is represented as an explicit provenance-bearing candidate relation rather than ID fusion.
- **D-03:** Phase 55 uses a closed vocabulary for agreements, amendments, clauses, facts, events, owners, policy documents, and memos plus an allowlisted typed-relation vocabulary. Governing precedence, partial-amendment resolution, fact adjudication, and deadlines are not inferred in this phase.
- **D-04:** Only closed-schema records tied to an exact accessible source revision and validated locator may enter a published fragment. Model output is untrusted candidate data; an assertion without deterministic schema, provenance, and referential validation is rejected or remains absent rather than becoming truth.

### Storage, indexing, and atomic replacement
- **D-05:** Persist graph state inside the existing trusted, background-only `chrome.storage.local` boundary using versioned per-partition and per-source records. Do not add IndexedDB, an external database, a server store, or a content-readable persistence path. MV3 wake reconstructs bounded hot caches from durable records.
- **D-06:** Persist source-owned lexical-posting and adjacency shards rather than one mutable corpus-wide index. Assemble bounded partition-specific MiniSearch and traversal caches in memory; every posting and edge remains attributable to and removable with its exact source generation.
- **D-07:** Replacement order is withdraw old truth first, purge and prove absence, stage the fully validated replacement invisibly, then publish its fragment and derived indexes pointer-last. Phase 55 replaces the relevant Phase 54 no-op purge participants with real fragment/index/relationship/result-cache ownership while preserving fail-closed empty proofs for participant categories owned by later phases.
- **D-08:** Quota exhaustion, corruption, cancellation, or interrupted replacement fails closed for the affected source. Discard incomplete staging, withhold truth whose source fingerprint changed, recover through bounded journals/manifests, and rebuild derivable indexes from validated fragments. Never silently retain stale changed-source truth or evict another source's records to make room.

### Model-assisted extraction boundary
- **D-09:** One freshly certified source is processed per extraction operation. Deterministic locator-preserving segmentation supplies only size-capped excerpts needed for that operation; unrelated sources and the corpus as a whole are never batched into a provider request.
- **D-10:** Extraction uses only the user's existing configured FSB provider adapter and model settings. Skopeo introduces no provider, API key, model host, LM Studio requirement, or automatic provider fallback. If the configured path is unavailable, the source remains non-published/pending with no partial graph.
- **D-11:** Source text is inert, delimited input to a closed JSON extraction contract. Extraction cannot grant model-selected tools, URLs, code, prompts, callbacks, storage access, or graph operations. Unknown fields, prototypes, accessors, oversized values, hostile instructions, and malformed output are rejected before any durable effect.
- **D-12:** Source authority is checked before and after every provider call. Each returned locator must resolve within the supplied excerpt; all caps, enums, references, ownership, and evidence coverage must validate. Model confidence alone never establishes truth, and one invalid response publishes no partial fragment.

### Query, inspection, MCP, and upstream reuse
- **D-13:** Consumers use one closed background-only engine facade authorized through Phase 54's exact-source or bounded exact-set operation boundary. Content contexts receive only minimized, operation-certified projections; they cannot read raw graph records, index shards, provider payloads, or storage.
- **D-14:** Phase 55 query primitives are exact identity lookup, bounded neighbor traversal, partition-scoped lexical search, and provenance inspection. There is no arbitrary graph query language, dynamic evaluation, embeddings/vector retrieval, cross-partition fallback, or unbounded recursive traversal.
- **D-15:** The local engine works without MCP. Phase 55 adds no Skopeo server, daemon, duplicated engine, or tool family; it exposes a bounded adapter seam that a later phase may route through existing FSB MCP surfaces without making MCP an authority or runtime dependency.
- **D-16:** Adopt Graphify concepts by default rather than taking its runtime. Any upstream code reuse requires prior source/license review and the smallest exact local snapshot with commit pin, license, attribution, and no runtime/network dependency. If no code is needed, document conceptual influence without vendoring code.

### the agent's Discretion
- Exact closed schema field names, relation predicate names, canonical encoding, hash format, and stable locator representation, provided D-01 through D-04 remain exact.
- Exact excerpt/window, record, edge, traversal, cache, shard, journal, and per-partition caps, provided they are finite, tested at the boundary, and cannot produce partial publication or cross-source eviction.
- Exact module boundaries, cache implementation, storage key encoding, import order, failure reason codes, and recovery scheduling within the existing trusted-background and Phase 54 mutation-guard contracts.
- Whether conceptual Graphify influence is sufficient or a minimal code fragment is materially useful after license/source research; reuse is not required.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/utils/skopeo-corpus-schema.js` already supplies closed plain-data parsing, versioned collision-safe partition/source keys, independent metadata/membership/content fingerprints, and exact source-state evidence.
- `extension/utils/skopeo-corpus-store.js` already supplies trusted `chrome.storage.local` persistence, mutation guards, per-partition serialization, manifests/journals, tombstone-first purge, participant absence proofs, recovery, and pointer-last publication.
- `extension/utils/skopeo-drive-authority.js`, `skopeo-corpus-controller.js`, `skopeo-drive-reconciler.js`, and the background five-kind consumer facade already provide fresh exact-source/set authority and final-currentness checks.
- MiniSearch, JMESPath, a bundled JSON-schema implementation, `UniversalProvider`/`AIIntegration`, and the configured provider settings path already exist in the extension; no new runtime is needed.
- Phase 54 reserves the closed purge participant names `fragments`, `indexes`, `citations`, `counts`, `relationships`, `result-cache`, and `alerts`, giving later stores one existing withdrawal/absence protocol.

### Established Patterns
- Trusted private modules are classic-script/IIFE globals with CommonJS test exports, loaded through ordered `importScripts` and absent from injected content dependency closure.
- Remote/page/model data is parsed as exact-key plain records with finite depth/count/byte caps; prototypes, accessors, unknown fields, raw errors, HTML, and secrets fail closed.
- Durable mutation follows withdraw/tombstone first, participant purge and absence proof second, staging third, active pointer last, with opaque abort-aware mutation guards retained through terminal repair.
- Production claims require final tuple/access/generation revalidation after awaited work. Brief absence is accepted; stale or partially certified projection is not.
- Tests use deterministic production-module harnesses, hostile fixtures, injected await failures, restart/cancellation races, static trusted-boundary checks, package-order gates, and real Chrome where platform semantics matter.

### Integration Points
- New private graph schema/store/extractor/query modules load after the Phase 54 corpus chain and initialize only after `TRUSTED_CONTEXTS`, corpus recovery, and real purge-participant registration succeed.
- The graph store replaces the relevant no-op Phase 54 participant adapters and must use the same exact partition/source keys, mutation guards, withdrawal ordering, and absence contract.
- Extraction enters through the Phase 54 `ingestion` operation kind; queries and inspection enter through exact `query`/`display` operations. Phases 56-59 consume the same facade for lineage, cited projections, policy decisions, and alerts.
- Provider work must reuse the configured background provider path and preserve existing provider parity, logging redaction, cancellation, and MV3 wake behavior.
- Static storage-boundary verification and background import-order/provider smoke tests must expand to cover every new private module without exposing them to content scripts or a generic bridge.

</code_context>

<specifics>
## Specific Ideas

- Treat each source fragment as a replaceable evidence capsule: deterministic identity and provenance stay source-owned even when later phases propose cross-document lineage.
- Keep indexes derivable and attributable. A search hit or traversal result must always be traceable back to the exact fragment generation that contributed it.
- Model extraction produces bounded candidates, not authority. The trusted engine owns validation, identity, publication, replacement, and query admission.
- “Inspect” means bounded provenance/status access for trusted consumers and later HUD projections, not an end-user graph explorer or arbitrary query console.

</specifics>

<deferred>
## Deferred Ideas

- Governing-versus-historical resolution, partial amendments, exact facts, confidence/ambiguity adjudication, and deterministic deadlines remain Phase 56.
- Folder/reading presentation remains Phase 57; cited ask and decision-policy behavior remains Phase 58; alert persistence/delivery remains Phase 59.
- Actual MCP exposure may be added later through an existing bounded FSB surface; Phase 55 provides only the authority-preserving adapter seam.
- Embeddings/vector retrieval remains future requirement `QUERY-01` and requires evaluation against lexical plus structured traversal first.
- An end-user graph explorer, arbitrary query language, external graph service, and additional deep-domain packs remain out of scope.

</deferred>
