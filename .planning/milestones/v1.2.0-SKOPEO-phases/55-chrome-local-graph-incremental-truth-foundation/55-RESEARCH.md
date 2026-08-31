# Phase 55: Chrome-Local Graph & Incremental Truth Foundation - Research

**Researched:** 2026-07-21
**Scope:** Planning evidence for LOCAL-01 through LOCAL-07, TRUTH-01, TRUTH-05, and TRUTH-10
**Overall confidence:** High for repository seams, storage/authority architecture, provider integration, closed validation, atomic replacement, and deterministic test design; medium for production provider extraction quality until the optional synthetic live-provider qualification is run

<user_constraints>
## User Constraints (from CONTEXT.md)

Source for every constraint in this section: [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-CONTEXT.md]

### Phase Boundary

Phase 55 delivers the trusted Chrome-local graph substrate for the Drive corpus: closed source-owned graph/provenance schemas, partitioned durable fragments and indexes, model-assisted extraction through the existing FSB provider path, atomic source replacement, bounded deterministic query primitives, and a background-only consumer facade. It establishes stable identities for agreements, amendments, clauses, facts, events, owners, policy documents, and memos without deciding governing precedence, exact contract facts, deadlines, presentation, policy clearance, or notification eligibility; those remain Phases 56-59.

### Locked Decisions

#### Graph truth and identity contract
- **D-01:** The atomic graph unit is an immutable, source-owned fragment versioned by the exact account/corpus partition, stable source file ID, and content fingerprint. A fragment is staged and published or replaced as one unit; graph records are never updated in place across source generations.
- **D-02:** Graph identities are deterministic namespaces over partition, source, closed record kind, and a stable source locator/local key. Names, labels, similarity, model-created IDs, and normalized text never create global identity. Cross-document equivalence is represented as an explicit provenance-bearing candidate relation rather than ID fusion.
- **D-03:** Phase 55 uses a closed vocabulary for agreements, amendments, clauses, facts, events, owners, policy documents, and memos plus an allowlisted typed-relation vocabulary. Governing precedence, partial-amendment resolution, fact adjudication, and deadlines are not inferred in this phase.
- **D-04:** Only closed-schema records tied to an exact accessible source revision and validated locator may enter a published fragment. Model output is untrusted candidate data; an assertion without deterministic schema, provenance, and referential validation is rejected or remains absent rather than becoming truth.

#### Storage, indexing, and atomic replacement
- **D-05:** Persist graph state inside the existing trusted, background-only `chrome.storage.local` boundary using versioned per-partition and per-source records. Do not add IndexedDB, an external database, a server store, or a content-readable persistence path. MV3 wake reconstructs bounded hot caches from durable records.
- **D-06:** Persist source-owned lexical-posting and adjacency shards rather than one mutable corpus-wide index. Assemble bounded partition-specific MiniSearch and traversal caches in memory; every posting and edge remains attributable to and removable with its exact source generation.
- **D-07:** Replacement order is withdraw old truth first, purge and prove absence, stage the fully validated replacement invisibly, then publish its fragment and derived indexes pointer-last. Phase 55 replaces the relevant Phase 54 no-op purge participants with real fragment/index/relationship/result-cache ownership while preserving fail-closed empty proofs for participant categories owned by later phases.
- **D-08:** Quota exhaustion, corruption, cancellation, or interrupted replacement fails closed for the affected source. Discard incomplete staging, withhold truth whose source fingerprint changed, recover through bounded journals/manifests, and rebuild derivable indexes from validated fragments. Never silently retain stale changed-source truth or evict another source's records to make room.

#### Model-assisted extraction boundary
- **D-09:** One freshly certified source is processed per extraction operation. Deterministic locator-preserving segmentation supplies only size-capped excerpts needed for that operation; unrelated sources and the corpus as a whole are never batched into a provider request.
- **D-10:** Extraction uses only the user's existing configured FSB provider adapter and model settings. Skopeo introduces no provider, API key, model host, LM Studio requirement, or automatic provider fallback. If the configured path is unavailable, the source remains non-published/pending with no partial graph.
- **D-11:** Source text is inert, delimited input to a closed JSON extraction contract. Extraction cannot grant model-selected tools, URLs, code, prompts, callbacks, storage access, or graph operations. Unknown fields, prototypes, accessors, oversized values, hostile instructions, and malformed output are rejected before any durable effect.
- **D-12:** Source authority is checked before and after every provider call. Each returned locator must resolve within the supplied excerpt; all caps, enums, references, ownership, and evidence coverage must validate. Model confidence alone never establishes truth, and one invalid response publishes no partial fragment.

#### Query, inspection, MCP, and upstream reuse
- **D-13:** Consumers use one closed background-only engine facade authorized through Phase 54's exact-source or bounded exact-set operation boundary. Content contexts receive only minimized, operation-certified projections; they cannot read raw graph records, index shards, provider payloads, or storage.
- **D-14:** Phase 55 query primitives are exact identity lookup, bounded neighbor traversal, partition-scoped lexical search, and provenance inspection. There is no arbitrary graph query language, dynamic evaluation, embeddings/vector retrieval, cross-partition fallback, or unbounded recursive traversal.
- **D-15:** The local engine works without MCP. Phase 55 adds no Skopeo server, daemon, duplicated engine, or tool family; it exposes a bounded adapter seam that a later phase may route through existing FSB MCP surfaces without making MCP an authority or runtime dependency.
- **D-16:** Adopt Graphify concepts by default rather than taking its runtime. Any upstream code reuse requires prior source/license review and the smallest exact local snapshot with commit pin, license, attribution, and no runtime/network dependency. If no code is needed, document conceptual influence without vendoring code.

### the agent's Discretion
- Exact closed schema field names, relation predicate names, canonical encoding, hash format, and stable locator representation, provided D-01 through D-04 remain exact.
- Exact excerpt/window, record, edge, traversal, cache, shard, journal, and per-partition caps, provided they are finite, tested at the boundary, and cannot produce partial publication or cross-source eviction.
- Exact module boundaries, cache implementation, storage key encoding, import order, failure reason codes, and recovery scheduling within the existing trusted-background and Phase 54 mutation-guard contracts.
- Whether conceptual Graphify influence is sufficient or a minimal code fragment is materially useful after license/source research; reuse is not required.

### Specific Ideas

- Treat each source fragment as a replaceable evidence capsule: deterministic identity and provenance stay source-owned even when later phases propose cross-document lineage.
- Keep indexes derivable and attributable. A search hit or traversal result must always be traceable back to the exact fragment generation that contributed it.
- Model extraction produces bounded candidates, not authority. The trusted engine owns validation, identity, publication, replacement, and query admission.
- “Inspect” means bounded provenance/status access for trusted consumers and later HUD projections, not an end-user graph explorer or arbitrary query console.

### Deferred Ideas (OUT OF SCOPE)

- Governing-versus-historical resolution, partial amendments, exact facts, confidence/ambiguity adjudication, and deterministic deadlines remain Phase 56.
- Folder/reading presentation remains Phase 57; cited ask and decision-policy behavior remains Phase 58; alert persistence/delivery remains Phase 59.
- Actual MCP exposure may be added later through an existing bounded FSB surface; Phase 55 provides only the authority-preserving adapter seam.
- Embeddings/vector retrieval remains future requirement `QUERY-01` and requires evaluation against lexical plus structured traversal first.
- An end-user graph explorer, arbitrary query language, external graph service, and additional deep-domain packs remain out of scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

The descriptions below are the exact Phase 55 requirements; the support column identifies the planning contracts that make each requirement testable. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:38]

| ID | Description | Research Support |
|----|-------------|------------------|
| LOCAL-01 | User can build, update, query, and inspect Skopeo contract intelligence without installing or starting a Graphify runtime, Python process, graph server, database, daemon, or separate application. | A bundled classic-JavaScript graph engine, trusted-local persistence, deterministic offline tests, and no Graphify runtime or new process. [VERIFIED: package.json; extension/background.js; .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-CONTEXT.md] |
| LOCAL-02 | Skopeo runs graph construction, provenance tracking, indexing, lineage traversal, and bounded query execution as bundled JavaScript inside the Chrome extension. | Closed schema/store/extractor/query modules loaded privately by the MV3 service worker, source-owned shards, in-memory MiniSearch, and bounded adjacency traversal. [VERIFIED: extension/background.js:231; extension/background.js:267; extension/lib/minisearch.min.js] |
| LOCAL-03 | Skopeo stores compact graph records, source fingerprints, indexes, review state, and alert state in browser-native storage partitioned by Drive account and enrolled corpus. | Exact Phase 54 partition/source keys, trusted `chrome.storage.local`, immutable source generations, participant ownership, and future-compatible empty category proofs. [VERIFIED: extension/utils/skopeo-corpus-schema.js; extension/utils/skopeo-corpus-store.js:20; extension/manifest.json:7] |
| LOCAL-04 | Model-assisted extraction and synthesis use only the user's already-configured FSB provider path; Skopeo introduces no required AI vendor, model host, or LM Studio setup. | Direct low-level `UniversalProvider` construction from existing settings, no fallback, and provider-unavailable as a closed pending/withheld outcome. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-AI-SPEC.md:102; extension/ai/universal-provider.js:133] |
| LOCAL-05 | Only bounded, permission-scoped source excerpts needed for a specific extraction or answer may be sent to the configured model provider; the corpus is not uploaded wholesale by default. | Fresh one-source authority per call, deterministic locator-preserving segmentation, exact excerpt/call/generation budgets, and no prompt/output persistence. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-AI-SPEC.md:247] |
| LOCAL-06 | Existing FSB MCP surfaces may optionally invoke or inspect Skopeo, but the local graph engine does not require a new MCP server, daemon, or tool-per-feature surface. | One closed internal facade and a future bounded adapter seam; Phase 55 adds no MCP registration or runtime dependency. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-CONTEXT.md:36] |
| LOCAL-07 | Any upstream Graphify code selectively reused in Skopeo is locally bundled, pinned, and attributed under its license; upstream Graphify remains a design/code source rather than a runtime dependency. | Conceptual-only adoption is recommended after source/license review; record exact upstream commit and MIT provenance without copying code. [CITED: https://github.com/Graphify-Labs/graphify/blob/abff1b1ca4052fcf9d955c5f6a034088723f4536/LICENSE] |
| TRUTH-01 | Skopeo represents agreements, amendments, clauses, facts, events, owners, policy documents, and memos with stable source-owned identities and provenance. | Closed kind enum, engine-derived locator-based IDs, exact generation/fingerprint ownership, evidence registry, typed relations, and provenance inspection. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-AI-SPEC.md:278] |
| TRUTH-05 | Reprocessing a source atomically removes its previous facts, relationships, search entries, and alert consequences before installing the validated replacement and recomputing affected truth. | Withdrawal-first Phase 54 mutation lane, real four-category participant adapters, later-category empty proofs, invisible staging, complete validation, and pointer-last publication. [VERIFIED: extension/utils/skopeo-corpus-store.js:816; extension/utils/skopeo-corpus-store.js:836; extension/utils/skopeo-corpus-store.js:986] |
| TRUTH-10 | Contract text, filenames, comments, and host-page content are handled as untrusted data through closed extraction schemas and a trusted citation registry rather than as model or tool instructions. | Static system policy, JSON data envelope, bare JSON parse, Draft 2020-12 schema, descriptor-safe semantic checks, exact locator resolution, and no model-selected capabilities. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-AI-SPEC.md:240] |
</phase_requirements>

## Summary

Plan Phase 55 as a private background-owned evidence engine, not as a general graph platform. Its durable unit is one immutable, source-owned fragment generation; its only truth admission path is fresh Drive authority plus closed schema and exact evidence validation; its only read path is a bounded facade guarded by Phase 54 exact-source or exact-set operations. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-CONTEXT.md:16; extension/background.js:3146]

The critical integration task is replacing Phase 54's graph-related no-op purge participants. The current background registers all seven reserved categories with the same empty adapter, while the corpus store refuses to operate until all seven names are registered and runs purge/absence checks through those adapters. Phase 55 should register real adapters for `fragments`, `indexes`, `relationships`, and `result-cache`; `citations`, `counts`, and `alerts` should retain explicit fail-closed empty proofs until their owning phases implement them. [VERIFIED: extension/background.js:278; extension/background.js:328; extension/utils/skopeo-corpus-store.js:26; extension/utils/skopeo-corpus-store.js:812]

Do not vendor Graphify code. Graphify v8 is a Python/NetworkX pipeline whose useful ideas—multi-pass extraction, schema validation before build, provenance-bearing nodes/edges, content fingerprints, and traversal—map cleanly to existing FSB browser primitives, while its label-derived IDs, Python validation, filesystem cache, NetworkX graph, and optional MCP server conflict with locked Phase 55 contracts. Record conceptual provenance at the exact reviewed commit `abff1b1ca4052fcf9d955c5f6a034088723f4536`; do not depend on the moving `v8` branch name. [CITED: https://github.com/Graphify-Labs/graphify/blob/abff1b1ca4052fcf9d955c5f6a034088723f4536/docs/how-it-works.md] [CITED: https://github.com/Graphify-Labs/graphify/blob/abff1b1ca4052fcf9d955c5f6a034088723f4536/ARCHITECTURE.md] [VERIFIED: `git ls-remote` and shallow source review, 2026-07-21]

No new package is needed. Reuse the bundled Draft 2020-12 validator, MiniSearch, native Web Crypto, `chrome.storage.local`, Phase 54 authority/store contracts, and `UniversalProvider`; extend only the provider's cancellation path so the caller's operation signal aborts fetch, rate-limit waits, and retries. [VERIFIED: package.json; extension/utils/capability-interpreter.js:78; extension/ai/universal-provider.js:352; .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-AI-SPEC.md:215]

Phase 55 has no UI deliverable. “Inspect” is a bounded provenance/status engine operation for trusted consumers, so no `UI-SPEC.md`, graph explorer, content-script graph store, or new visual surface belongs in this phase. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-CONTEXT.md:71; .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-CONTEXT.md:80]

## Knowledge and Environment Availability

| Item | Finding | Planning consequence |
|------|---------|----------------------|
| Project knowledge graph | No `.planning/graphs/` artifact is present in this worktree. [VERIFIED: repository filesystem inspection, 2026-07-21] | Plans should cite Phase 54 artifacts and current source directly; graph queries cannot add evidence for this phase. [VERIFIED: repository filesystem inspection, 2026-07-21] |
| Node | `v24.14.1` is available and satisfies the repository's `>=24.0.0` engine. [VERIFIED: `node --version`; package.json] | Deterministic Node harnesses can run locally without setup. [VERIFIED: tests/skopeo-corpus-store.test.js] |
| npm | `11.11.0` is available. [VERIFIED: `npm --version`, 2026-07-21] | Existing scripts can be extended without package installation. [VERIFIED: package.json] |
| Chrome | `/Applications/Google Chrome.app` is installed. [VERIFIED: local application inspection, 2026-07-21] | A final real-extension trusted-boundary smoke is locally feasible when platform behavior must be verified. [VERIFIED: tests/skopeo-browser-contract.test.js] |
| Configured AI provider | Provider/model availability is user-controlled and must be treated as optional runtime state. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-AI-SPEC.md:187] | CI remains network-free; missing configuration is a tested pending/withheld result, not a setup blocker. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-AI-SPEC.md:414] |

## Architectural Responsibility Map

| Capability | Primary owner | Secondary dependency | Boundary |
|------------|---------------|----------------------|----------|
| Graph/provenance schema and IDs | Private service-worker JavaScript | Native SHA-256 | Exact plain-data records; no model/page-provided published identity. [VERIFIED: extension/utils/skopeo-corpus-schema.js; 55-CONTEXT.md D-02] |
| Durable fragment generations and journals | Private graph store in trusted `chrome.storage.local` | Phase 54 corpus store mutation guards | Per partition/source/fingerprint; no content-readable or corpus-global mutable state. [VERIFIED: extension/background.js:12; extension/utils/skopeo-corpus-store.js:836] |
| Extraction | Private graph extractor | Existing configured `UniversalProvider` and certified Drive content transport | One certified source per call, bounded excerpts, no automation parser or provider fallback. [VERIFIED: 55-AI-SPEC.md:102; extension/ai/universal-provider.js:133] |
| Closed candidate validation | Graph schema/extractor | Bundled `CfworkerJsonSchema.Validator` | Bare JSON, Draft 2020-12, exact keys and caps, then semantic/evidence checks. [VERIFIED: extension/utils/capability-interpreter.js:78; 55-AI-SPEC.md:278] |
| Lexical and traversal indexes | Private graph store/query cache | Bundled MiniSearch | Source-owned durable shards; bounded partition cache rebuilt after wake; no serialized global index authority. [VERIFIED: package.json; 55-CONTEXT.md D-06] |
| Replacement and withdrawal | Phase 54 corpus store plus graph participant adapters | Graph store journals/manifests | Withdraw, purge/prove absence, stage invisible replacement, publish pointer last. [VERIFIED: extension/utils/skopeo-corpus-store.js:1283; 55-CONTEXT.md D-07] |
| Query and inspection | One private graph facade | Phase 54 `query`/`display` certified operations | Exact lookup, bounded neighbors, partition lexical search, provenance only. [VERIFIED: extension/background.js:1575; 55-CONTEXT.md D-14] |
| Content/MCP projection | Later bounded consumer adapters | Existing Skopeo/MCP surfaces | Phase 55 exposes no raw records, new message family, MCP tool family, server, or daemon. [VERIFIED: 55-CONTEXT.md D-13; 55-CONTEXT.md D-15] |

## Standard Stack

| Concern | Use | Planning note |
|---------|-----|---------------|
| Runtime modules | Classic JavaScript IIFEs with frozen `globalThis.Fsb*` APIs and CommonJS test exports | Match Phase 54 modules and keep graph code out of `SKOPEO_INJECTION_FILES`. [VERIFIED: extension/utils/skopeo-corpus-schema.js; extension/background.js:823] |
| Durable state | Existing `chrome.storage.local` after `TRUSTED_CONTEXTS` succeeds | The extension manifest has `storage` and `unlimitedStorage`, but writes can still fail and must remain fail closed. [VERIFIED: extension/manifest.json:7; extension/background.js:12] [CITED: https://developer.chrome.com/docs/extensions/reference/api/storage] |
| Schema validation | Bundled `@cfworker/json-schema@^4.1.1`, Draft 2020-12, followed by exact descriptor-safe semantic parsing | JSON Schema alone does not establish ownership, source evidence, endpoint validity, plain prototypes, or current authority. [VERIFIED: package.json; extension/utils/capability-interpreter.js:78; 55-AI-SPEC.md:251] |
| Search | Bundled `minisearch@^7.2.0` for bounded in-memory partition caches | Persist source-owned input/posting shards and rebuild; do not make a mutable serialized corpus-wide MiniSearch snapshot the source of truth. [VERIFIED: package.json; extension/utils/capability-search.js:36; 55-CONTEXT.md D-06] |
| Graph traversal | Bounded adjacency lists and iterative breadth-first traversal in local JavaScript | A graph database and general query language are unnecessary for exact lookup and capped neighbors. [VERIFIED: 55-CONTEXT.md D-14] |
| Identity/hash | Existing canonical encoding style plus native `crypto.subtle.digest('SHA-256', ...)` | Keep full exact ownership tuples in validated records so a digest collision or misplaced record is detectable. [VERIFIED: extension/utils/skopeo-corpus-schema.js] |
| Provider | Existing configured `UniversalProvider` request/response normalization | Add optional caller-signal composition; avoid `AIIntegration.getAutomationActions()` and its automation history/cache/parser behavior. [VERIFIED: extension/ai/universal-provider.js:133; 55-AI-SPEC.md:127] |
| Tests | Standalone Node `assert`/VM/fake-Chrome harnesses plus targeted local-Chrome contract coverage | This is the repository's established test pattern; Jest is absent and should not be added. [VERIFIED: tests/skopeo-corpus-store.test.js; package.json] |

No package installation or package-legitimacy audit is required. All required primitives are already bundled or browser-native, so adding a graph framework, database client, schema library, vector store, MCP package, or Python bridge would increase the trusted surface without satisfying a missing capability. [VERIFIED: package.json; .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-CONTEXT.md]

## Upstream Graphify Source and License Decision

### Reviewed upstream state

The reviewed upstream ref is Graphify Labs' `v8` branch at commit `abff1b1ca4052fcf9d955c5f6a034088723f4536`; `v8` is a branch rather than an immutable tag, so any provenance record must use the full commit SHA. [VERIFIED: `git ls-remote https://github.com/Graphify-Labs/graphify refs/heads/v8 refs/tags/v8`, 2026-07-21]

That commit is MIT-licensed with copyright 2026 Safi Shamsi. [CITED: https://github.com/Graphify-Labs/graphify/blob/abff1b1ca4052fcf9d955c5f6a034088723f4536/LICENSE]

Graphify documents a detect/extract/build/analyze/export pipeline, JSON fragments with nodes/edges/source locations, validation before graph build, SHA-256-based content caching, NetworkX storage/export, and optional MCP exposure. [CITED: https://github.com/Graphify-Labs/graphify/blob/abff1b1ca4052fcf9d955c5f6a034088723f4536/docs/how-it-works.md] [CITED: https://github.com/Graphify-Labs/graphify/blob/abff1b1ca4052fcf9d955c5f6a034088723f4536/ARCHITECTURE.md]

Its `ids.py` derives canonical IDs from normalized labels, `validate.py` performs a Python-level structural/endpoint check, and `cache.py` uses Python/filesystem-specific content caching. Those implementations do not meet Phase 55's source-owned ID, browser-only runtime, exact hostile-data validation, or trusted-local storage contracts. [CITED: https://github.com/Graphify-Labs/graphify/blob/abff1b1ca4052fcf9d955c5f6a034088723f4536/graphify/ids.py] [CITED: https://github.com/Graphify-Labs/graphify/blob/abff1b1ca4052fcf9d955c5f6a034088723f4536/graphify/validate.py] [CITED: https://github.com/Graphify-Labs/graphify/blob/abff1b1ca4052fcf9d955c5f6a034088723f4536/graphify/cache.py]

### Decision

Use conceptual influence only: multi-pass bounded extraction, validate-before-build, evidence-bearing records/relations, source fingerprints, and bounded traversal. Do not copy or vendor upstream code in Phase 55. [VERIFIED: reviewed upstream sources above; 55-CONTEXT.md D-16]

Add a small provenance entry to the repository's existing legal/attribution documentation, or a focused Graphify provenance document if no suitable section exists, recording project URL, exact commit, reviewed files, MIT license, conceptual influence, and “no copied code.” Because no upstream code is copied, no vendored snapshot or embedded license file is required by this recommendation; the provenance entry still proves LOCAL-07's source review. [VERIFIED: 55-CONTEXT.md D-16; reviewed upstream LICENSE]

If implementation later discovers a materially useful fragment, stop that plan task before copying it and document the exact file/line range, commit, license, reason native implementation is insufficient, local modifications, and static no-network/runtime proof. The present research found no such fragment. [VERIFIED: reviewed upstream sources above]

## Recommended Module and Boot Architecture

Exact filenames remain discretionary, but the planner should preserve these independently testable responsibilities. [VERIFIED: 55-CONTEXT.md, the agent's Discretion]

| Recommended module | Sole responsibility | Must not do |
|--------------------|---------------------|-------------|
| `utils/skopeo-graph-schema.js` | Closed graph/extraction/durable schemas, kind/predicate matrices, canonical IDs, locator and provenance validation, finite caps | Chrome calls, provider calls, mutable cache ownership, precedence/fact/deadline adjudication. [VERIFIED: 55-CONTEXT.md D-01–D-04; 55-AI-SPEC.md:278] |
| `utils/skopeo-graph-store.js` | Versioned keys, immutable staged/published fragments, journals, source-owned lexical/adjacency shards, participant adapters, absence proofs, bounded diagnostics, recovery | Model parsing, Drive calls, global mutable index authority, cross-source eviction. [VERIFIED: 55-CONTEXT.md D-05–D-08; extension/utils/skopeo-corpus-store.js] |
| `utils/skopeo-graph-extractor.js` | Deterministic segmentation, static request envelopes, provider budget/cancellation, strict parse/schema/semantic validation, fully validated staging batches | Automation parser/history, provider selection/fallback, tools, partial publication, persistence of prompt/raw output. [VERIFIED: 55-AI-SPEC.md:215; 55-AI-SPEC.md:247] |
| `utils/skopeo-graph-query.js` | Exact lookup, bounded lexical search, bounded adjacency traversal, provenance projection, cache reconstruction/invalidation | Arbitrary JMESPath/graph language, dynamic evaluation, embeddings, cross-partition fallback, unbounded recursion. [VERIFIED: 55-CONTEXT.md D-14] |
| `utils/skopeo-graph-engine.js` | One closed facade coordinating Phase 54 operations, extraction/replacement, query currentness, and future adapter seam | Raw content-script exposure, storage/provider handles, new MCP server/tools, UI rendering. [VERIFIED: 55-CONTEXT.md D-13–D-15; extension/background.js:3146] |

Recommended boot order is: establish `TRUSTED_CONTEXTS`; create the Phase 54 corpus store; create a dormant graph store/participant adapter; register all seven exact purge participants with four real graph adapters and three explicit later-phase empty adapters; run Phase 54 recovery; run graph journal/orphan recovery and rebuild bounded caches; then expose the engine facade. A recovery failure must leave the engine unavailable and all affected source truth withheld. [VERIFIED: extension/background.js:12; extension/background.js:328; extension/utils/skopeo-corpus-store.js:812; 55-CONTEXT.md D-07–D-08]

Load graph private modules after the existing Phase 54 schema/store/transport/authority/controller/reconciler chain and after bundled validator/MiniSearch globals, but never append them to `SKOPEO_INJECTION_FILES`. Add static import-order and dependency-closure tests. [VERIFIED: extension/background.js:231; extension/background.js:267; extension/background.js:823]

## Durable Record, Identity, and Provenance Contracts

### Immutable generation hierarchy

Use three distinct identifiers: a fragment generation ID over `(schemaVersion, partitionKey, sourceFileId, contentFingerprint)`; a stable record ID over `(identityVersion, partitionKey, sourceFileId, closedKind, stableLocatorKey, engineLocalKey)`; and an immutable record-version ID over `(recordId, fragmentGenerationId)`. The content fingerprint versions the fragment but must not replace the stable source-owned record namespace required by D-02. [VERIFIED: 55-CONTEXT.md D-01–D-02; extension/utils/skopeo-corpus-schema.js]

The engine, not the model, derives every published ID. Treat `candidateRef` only as a response-local reference; reject duplicates/dangling references, collapse or reject ambiguous same-kind/same-locator duplicates by a deterministic schema rule, and never persist a model ID as identity authority. [VERIFIED: 55-AI-SPEC.md:280; 55-CONTEXT.md D-02]

Persist the exact ownership tuple, kind, stable locator/local key, fingerprint, and canonical version alongside every digest. On read, parse and compare those fields against the storage key and active manifest; a digest match alone is insufficient authority. [VERIFIED: extension/utils/skopeo-corpus-schema.js; 55-CONTEXT.md D-01]

### Closed vocabulary and relation ownership

Adopt the AI specification's eight record kinds exactly: `agreement`, `amendment`, `clause`, `fact`, `event`, `owner`, `policy-document`, and `memo`. Adopt the seven initial predicates exactly: `contains`, `amends-candidate`, `states-fact`, `records-event`, `assigned-owner`, `references-policy`, and `references-memo`. [VERIFIED: 55-AI-SPEC.md:280]

Enforce the documented endpoint matrix after JSON Schema: `contains` is document-to-clause; `amends-candidate` is amendment-to-agreement/clause and never means governing; `states-fact`, `records-event`, and `assigned-owner` target their named kinds; policy/memo references target their named document kinds. A relation is owned by the source fragment whose evidence proposes it, carries exact evidence, and never fuses endpoint IDs. [VERIFIED: 55-AI-SPEC.md:371; 55-CONTEXT.md D-02–D-03]

Cross-document equivalence must remain an explicit candidate relation with proposing-source provenance and exact current endpoint identities. The single-source model call cannot receive another source's text; any later local endpoint match must operate on already validated records through a freshly authorized exact-set operation and remain a candidate, not adjudication. [VERIFIED: 55-CONTEXT.md D-02; 55-CONTEXT.md D-09; 55-CONTEXT.md D-13]

### Trusted evidence registry

Segmentation should normalize line endings deterministically and create an in-memory registry from engine-issued `excerptId` to exact source-relative locator, authorized bytes, and fragment fingerprint. The model receives only excerpt IDs plus capped text; it cannot choose source IDs, fingerprints, storage keys, or authority fields. [VERIFIED: 55-AI-SPEC.md:247; 55-AI-SPEC.md:280]

For every record and relation, require one to four evidence locators with `start < end`; resolve each range byte-for-byte inside the exact supplied excerpt, map it back to the certified source locator, and reject clipped material qualifiers in labeled fixtures. Do not repair a locator by fuzzy search or consult another source. [VERIFIED: 55-AI-SPEC.md:280; 55-AI-SPEC.md:475]

Persist only the bounded locator/span and the minimum cited excerpt required by later evidence use, never the whole source, request envelope, rejected response, or provider transcript. Citation presentation and semantic adjudication remain later phases, but Phase 55 owns the trusted source/evidence registry they will consume. [VERIFIED: 55-CONTEXT.md D-04; 55-CONTEXT.md Deferred Ideas; 55-AI-SPEC.md:254]

## Storage, Indexing, and Atomic Replacement

### Storage layout

Use one versioned graph namespace with exact per-partition/per-source keys for source control, staged fragment batches, published fragment payload, lexical shard, adjacency shard, result-cache ownership, journal, and bounded diagnostics. Avoid a partition-wide value whose rewrite grows with every source; bound each value and page large source generations deterministically. [VERIFIED: 55-CONTEXT.md D-05–D-08; extension/utils/skopeo-corpus-store.js:20]

Persist source-owned lexical shard inputs/postings and source-owned adjacency lists keyed by fragment generation. Rebuild a capped per-partition MiniSearch instance and traversal maps from only active, freshly admitted sources after MV3 wake; treat those in-memory caches as disposable accelerators, never authority. [VERIFIED: 55-CONTEXT.md D-06; package.json; extension/utils/capability-search.js:1499]

Do not persist one mutable serialized MiniSearch snapshot as corpus truth. The existing capability search demonstrates that `MiniSearch.loadJSON` is option-sensitive and catalog-global, while Phase 55 requires every search contribution to be independently attributable and purgeable by source generation. [VERIFIED: extension/utils/capability-search.js:36; 55-CONTEXT.md D-06]

Use `chrome.storage.local.getBytesInUse()` only as an advisory preflight for the affected source and enforce explicit per-source/per-partition caps; the actual `set` result remains authoritative. `unlimitedStorage` removes the normal `storage.local` quota limit but does not justify unbounded retention or treating writes as infallible. [CITED: https://developer.chrome.com/docs/extensions/reference/api/storage] [VERIFIED: extension/manifest.json:7; 55-CONTEXT.md D-08]

### Replacement state machine

The source-level graph state machine should be `absent|withheld|staging|published|purging|repairing`, separate from Phase 54's six source-access states. A Phase 54 source may be accessible while graph extraction is pending or unavailable; no graph state may invent a seventh corpus source state. [VERIFIED: extension/utils/skopeo-corpus-schema.js:19; 55-CONTEXT.md D-08; 55-AI-SPEC.md:187]

For a changed source: close the active graph pointer first; invoke `fragments`, `indexes`, `relationships`, and `result-cache` purge adapters under the Phase 54 mutation guard; prove no owned key/in-memory contribution remains; create a fingerprint-bound staging manifest; write only fully validated bounded batches; derive/verify shards; then publish the complete fragment/index pointer last under final authority and mutation guards. [VERIFIED: 55-AI-SPEC.md:247; extension/utils/skopeo-corpus-store.js:1283]

For deletion, revocation, account switch, or corpus replacement, Phase 54's existing purge lane invokes all seven participant categories. Phase 55's later-owned categories must return true only after proving they own no data; this preserves the future alert/citation/count removal contract without fabricating those stores now. [VERIFIED: extension/utils/skopeo-corpus-store.js:26; extension/utils/skopeo-corpus-store.js:1283; 55-CONTEXT.md D-07]

On cancellation, quota rejection, corrupt staging, or worker interruption, never restore an old changed-fingerprint pointer. Discard orphan or invalid staging, keep the source withheld, resume only a bounded journal, and rebuild derivable shards from the validated fragment rather than trusting mismatched indexes. Never evict another source to finish the write. [VERIFIED: 55-CONTEXT.md D-08; 55-AI-SPEC.md:476]

## Extraction and Provider Boundary

Use `UniversalProvider` directly from current configured settings. Do not call the automation-oriented `AIIntegration.getAutomationActions()` path, carry prior messages, use its CLI/JSON cleaners, reuse its general response cache, select a different model, or fall back to LM Studio/custom/another provider. [VERIFIED: 55-AI-SPEC.md:127; extension/ai/universal-provider.js:133]

Extend `UniversalProvider.sendRequest(requestBody, options)` and `fetchWithTimeout(...)` with an optional caller `signal` while preserving existing callers. Compose caller cancellation with the internal timeout, check before and after 429/503 waits and before recursive retry, remove listeners on settlement, and retain the absolute Phase 54 operation deadline. Add focused regressions for abort-before-fetch, abort-during-fetch, abort-during-backoff, timeout, and existing unsupported-parameter/provider behavior. [VERIFIED: extension/ai/universal-provider.js:352; extension/ai/universal-provider.js:418; 55-AI-SPEC.md:242]

After `buildRequest()`, set temperature to `0.1` and output to 2,048 tokens in the provider-specific shape: Gemini `generationConfig.maxOutputTokens`, other current shapes `max_tokens`. Request no tools or executable fields. [VERIFIED: extension/ai/universal-provider.js:150; extension/ai/universal-provider.js:251; 55-AI-SPEC.md:240]

Initial hard limits should match the AI specification: at most 8 excerpts and 24,000 excerpt characters per call; at most 8 normal calls and 192,000 excerpt characters per source generation; at most one repair call; at most 128 records and 256 relations per response; at most 2,048 requested output tokens and 128 KiB raw response. Exact-max and max-plus-one behavior must be explicit tests. [VERIFIED: 55-AI-SPEC.md:249; 55-AI-SPEC.md:513]

Parse one bare response string with a size check and a single `JSON.parse`. Reject markdown fences, prose, trailing material, unknown keys, malformed/prototype/accessor values, and oversize data; validate Draft 2020-12 closed schemas, then descriptor-safe semantics, endpoint/reference rules, exact evidence, caps, ownership, operation signal, and current authority. One invalid response withholds the whole generation. [VERIFIED: 55-AI-SPEC.md:217; 55-AI-SPEC.md:251]

Permit one repair only for syntax or schema failure, under a new freshly certified source operation, using the same authorized excerpts plus bounded error categories/JSON-pointer paths and never echoing rejected output. Locator, semantic, authority, cancellation, quota, configuration, and permission failures are not repairable. [VERIFIED: 55-AI-SPEC.md:267]

Exact extraction reuse is permitted only for the full `(partition, source, content fingerprint, schema version, prompt version, provider, model)` tuple and only after fresh authority. Similarity, matching labels, another source, or another partition cannot reuse output. [VERIFIED: 55-AI-SPEC.md:270]

## Closed Query and Inspection Facade

Expose four logical operations through one background engine: `getById`, `searchLexical`, `neighbors`, and `inspectProvenance`. Exact method names are discretionary, but every input must be an exact-key closed record with finite limits and every result must be a minimized defensive copy. [VERIFIED: 55-CONTEXT.md D-13–D-14]

`getById` must require the current partition plus the expected record ID and return only a currently published record whose ownership tuple and generation pointer validate. `inspectProvenance` returns the bounded source/fingerprint/locator lineage needed by trusted later consumers, not raw storage or source text. [VERIFIED: 55-CONTEXT.md D-01; 55-CONTEXT.md Specific Ideas]

`searchLexical` must be partition-scoped, source-attributable, capped, and computed from current in-memory MiniSearch entries or rebuilt active shards. Before a hit influences output, recertify its exact contributing source through the Phase 54 bounded exact-set query operation and recompute without any source that fails. [VERIFIED: extension/utils/skopeo-drive-authority.js:1551; 55-CONTEXT.md D-06; 55-CONTEXT.md D-13]

`neighbors` must use an allowlisted predicate/direction, finite depth and node/edge/result budgets, an iterative visited set, and current endpoint ownership checks. Recommend initial ceilings of depth 2, 64 nodes, and 128 edges unless fixture scale demonstrates a smaller safe value; max-plus-one must fail before traversal influence. [VERIFIED: 55-CONTEXT.md the agent's Discretion; 55-CONTEXT.md D-14] [ASSUMED: initial traversal ceilings are a planning recommendation requiring boundary fixtures]

Do not reuse bundled JMESPath for graph queries, add dynamic expressions, expose arbitrary storage scans, or add embeddings/vector retrieval. A future MCP adapter may call the same closed facade but cannot bypass its authority, caps, or projections. [VERIFIED: package.json; 55-CONTEXT.md D-14–D-15]

## Security Domain

### Security posture and ASVS-style coverage

Phase 55 is a confidential-data, hostile-input, authorization-sensitive background subsystem: Drive/page/source/model bytes are untrusted, storage is private, and stale or cross-partition influence is a security failure even when no UI is rendered. [VERIFIED: 55-AI-SPEC.md:32; 55-AI-SPEC.md:71]

| ASVS area | Phase 55 control |
|-----------|------------------|
| V4 Access Control | Fresh exact-source/exact-set Phase 54 certificates guard every extraction/query/display effect; no content or MCP bypass exists. [VERIFIED: extension/utils/skopeo-drive-authority.js:1473; 55-CONTEXT.md D-13] |
| V5 Validation, Sanitization and Encoding | Bare JSON, closed Draft 2020-12 schemas, exact plain descriptors, caps, allowlists, endpoint/reference checks, and byte-exact locators reject hostile model/source input. [VERIFIED: 55-AI-SPEC.md:251] |
| V6 Stored Cryptography | Native SHA-256 provides deterministic fingerprints/identifiers, while exact ownership tuples—not hash secrecy—provide authorization. [VERIFIED: extension/utils/skopeo-corpus-schema.js; 55-CONTEXT.md D-02] |
| V7 Error Handling and Logging | Fixed reason enums and bounded path/category diagnostics exclude source text, filenames, raw output, credentials, and citations. [VERIFIED: 55-AI-SPEC.md:497] |
| V8 Data Protection | Only minimized excerpts leave the browser; raw source/request/rejected output is not persisted; trusted storage stays content-inaccessible and partitioned. [VERIFIED: extension/background.js:12; 55-AI-SPEC.md:75] |
| V13 API and Web Service | Provider requests have fixed host/config ownership, signal/deadline/budget limits, no tools/callbacks, strict response admission, and no automatic fallback. [VERIFIED: 55-AI-SPEC.md:240; 55-AI-SPEC.md:470] |

The area names above follow OWASP ASVS; the concrete controls are product-specific and must be tested as repository contracts rather than claimed as certification. [CITED: https://github.com/OWASP/ASVS]

### STRIDE threat analysis

| Threat | Example | Required mitigation and test |
|--------|---------|------------------------------|
| Spoofing | A record/storage key claims another partition, source, fingerprint, or active generation. | Parse exact tuples from key and value, compare to active manifests, require fresh authority, and reject cross-partition fixtures. [VERIFIED: 55-CONTEXT.md D-01–D-02; 55-AI-SPEC.md I04] |
| Tampering | Model JSON includes unknown/prototype-shaped fields, forged locators, dangling references, or disallowed endpoint pairs. | Schema plus descriptor-safe semantic validation, exact evidence registry, no durable effect on one failure. [VERIFIED: 55-AI-SPEC.md A03; 55-AI-SPEC.md L01–L03] |
| Repudiation | A published candidate cannot be traced to the exact source generation/evidence or a purge cannot prove removal. | Immutable provenance fields, pointer/journal records, bounded reason ledger, and participant absence proofs. [VERIFIED: 55-CONTEXT.md D-01; extension/utils/skopeo-corpus-store.js:1283] |
| Information disclosure | Corpus text, filename, raw response, existence, or another matter leaks through prompts, logs, cache, content messages, or query fallback. | One-source excerpt envelope, redacted metadata-only diagnostics, private module closure, exact partition cache keys, and forbidden-marker snapshots. [VERIFIED: 55-AI-SPEC.md I01–I05; 55-AI-SPEC.md:497] |
| Denial of service | Oversized source/output, relation explosion, deep traversal, quota exhaustion, or retry storm blocks the worker. | Per-call/source/storage/traversal caps, abort-aware retries, paged shards/journals, bounded recovery, and withheld state on exhaustion. [VERIFIED: 55-AI-SPEC.md:249; 55-CONTEXT.md D-08] |
| Elevation of privilege | Source instructions ask the model to invoke tools, URLs, code, storage, graph operations, or a new provider. | Static no-tool request, inert JSON data envelope, no callback handles, configured-provider equality, and zero-effect injection fixtures. [VERIFIED: 55-CONTEXT.md D-10–D-11; 55-AI-SPEC.md I01–I02] |
| Stale-authority race | A response arrives after cancellation, source change, revocation, or account switch and writes old truth. | Compose operation abort into fetch/backoff, recheck after every await, retain mutation guard through pointer-last commit, and assert zero late writes. [VERIFIED: 55-AI-SPEC.md R01–R07; extension/utils/skopeo-drive-authority.js:1473] |

### Security acceptance gates

- No graph module or storage/provider handle appears in the content injection dependency closure, and `chrome.storage.local` remains `TRUSTED_CONTEXTS` before graph boot. [VERIFIED: extension/background.js:12; extension/background.js:823]
- Every max-plus-one, injection, cross-source, cross-partition, forged-locator, cancellation, and stale-generation fixture causes zero partial publication and zero forbidden marker bytes in storage/log projections. [VERIFIED: 55-AI-SPEC.md:431–440]
- Changed/deleted/revoked sources reach complete participant absence before any replacement or later result is visible; absence-proof failure keeps reads fenced. [VERIFIED: 55-AI-SPEC.md:476; extension/utils/skopeo-corpus-store.js:1283]
- No new remote host, provider, MCP server, daemon, database, dynamic evaluator, or runtime-loaded code is introduced. [VERIFIED: 55-CONTEXT.md D-10–D-16]

## Validation Architecture

### Test framework and commands

Use the repository's standalone Node `node:assert`/VM/fake-Chrome style, deterministic recorded provider responses, synthetic/redacted fixtures, and production modules. Do not introduce Jest or require network credentials. [VERIFIED: tests/skopeo-corpus-store.test.js; 55-AI-SPEC.md:414]

Create a focused `test:skopeo-graph-evals` package script and include it in the normal `npm test` chain. The script should run the graph schema, store/recovery, extractor/provider, query/facade, runtime-boundary, and 37-case evaluation harnesses; package wiring is a Wave 0 gap because the script does not exist today. [VERIFIED: package.json; 55-AI-SPEC.md:414]

Recommended fast feedback commands are each individual `node tests/skopeo-graph-*.test.js` file and `npm run test:skopeo-graph-evals`; final phase verification should run `npm run test:skopeo-graph-evals`, `node scripts/verify-skopeo-storage-boundary.mjs`, `npm run validate:extension`, and `npm test`. [VERIFIED: package.json; scripts/verify-skopeo-storage-boundary.mjs]

### Suggested test ownership

| Test artifact | Primary contract |
|---------------|------------------|
| `tests/skopeo-graph-schema.test.js` | Exact keys/prototypes/caps, ID determinism and namespace isolation, kind/predicate endpoint matrix, evidence locators, canonical round trips. [VERIFIED: 55-CONTEXT.md D-01–D-04] |
| `tests/skopeo-graph-store.test.js` | Per-source generations/shards, four real participant adapters, later empty proofs, quota/corruption/crash journals, pointer-last replacement, complete absence. [VERIFIED: 55-CONTEXT.md D-05–D-08] |
| `tests/skopeo-graph-extractor.test.js` | Segmentation/envelope minimization, provider shape/caps, bare parse/schema/semantic gates, repair policy, exact reuse key, no raw persistence. [VERIFIED: 55-AI-SPEC.md:240–270] |
| `tests/universal-provider-cancellation.test.js` | Caller signal composed with timeout, abort during fetch/backoff, no retry after abort, existing provider parity. [VERIFIED: extension/ai/universal-provider.js:352; 55-AI-SPEC.md:242] |
| `tests/skopeo-graph-query.test.js` | Exact lookup, partition lexical search, bounded neighbors, provenance, stale/cross-source exclusion, cache rebuild/invalidation. [VERIFIED: 55-CONTEXT.md D-13–D-14] |
| `tests/skopeo-graph-runtime.test.js` | Import/boot/recovery order, Phase 54 operation fencing, no-op replacement, content closure, no MCP/runtime dependency, unavailable provider pending state. [VERIFIED: extension/background.js:267; extension/background.js:3146] |
| `tests/skopeo-graph-evals.test.js` plus `tests/fixtures/skopeo-graph-evals/` | Complete deterministic 37-case extraction, security, replacement, budget, and query contract. [VERIFIED: 55-AI-SPEC.md:444] |

### Mandatory fixture inventory

Implement all 37 AI-spec fixtures without collapsing categories: `P01–P06` positive complete fragments; `Q01–Q06` qualifiers/negation/abstention; `A01–A07` syntax/schema/cap failures; `I01–I05` injection/isolation/fallback; `L01–L03` locator failures; `R01–R07` cancellation/quota/crash/change/delete recovery; and `B01–B03` exact/max-plus-one budgets and reuse isolation. [VERIFIED: 55-AI-SPEC.md:448–454]

All critical deterministic thresholds are exact gates: 100% evidence precision and expected-set match on labeled deterministic fixtures, 100% rejection of invalid/max-plus-one inputs before effect, zero unsupported/partial publications, zero cross-source/partition acceptances, zero late writes, and complete participant absence. Optional live-provider quality uses synthetic fixtures only and cannot weaken deterministic admission. [VERIFIED: 55-AI-SPEC.md:431–440]

### Requirement-to-validation matrix

| Requirement | Minimum automated proof | Final acceptance evidence |
|-------------|-------------------------|---------------------------|
| LOCAL-01 | Static dependency scan plus boot/build/query tests with no Graphify/Python/server/database process. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:38] | Extension validation and local-Chrome smoke operate with only bundled files. [VERIFIED: package.json; tests/skopeo-browser-contract.test.js] |
| LOCAL-02 | Production modules build fragments, source shards, traversal, search, and inspection entirely in JavaScript. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:39] | Runtime test verifies ordered private imports and query outputs after worker-style reinitialization. [VERIFIED: extension/background.js:267] |
| LOCAL-03 | Storage harness proves exact partition/source keys, compact bounded records, source fingerprints, category ownership, and cross-partition absence. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:40] | Boundary verifier proves no content access; quota/recovery fixtures converge fail closed. [VERIFIED: scripts/verify-skopeo-storage-boundary.mjs] |
| LOCAL-04 | Provider spy proves only current configured provider/model is called; missing/unavailable/fallback attempts publish nothing. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:41] | Deterministic I05 and unavailable-provider runtime fixtures pass; optional live run is non-blocking. [VERIFIED: 55-AI-SPEC.md I05] |
| LOCAL-05 | Envelope spy proves one source, exact excerpts, per-call/source budgets, no corpus/raw payload persistence. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:42] | B01/B02 and forbidden-marker storage/log snapshots pass exactly. [VERIFIED: 55-AI-SPEC.md B01–B02] |
| LOCAL-06 | Static/runtime test proves no new MCP registration/process and calls the same facade without MCP. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:43] | Extension boot/query succeeds when MCP is absent. [VERIFIED: 55-CONTEXT.md D-15] |
| LOCAL-07 | Static provenance test records exact Graphify commit/license/conceptual-only status and finds no Graphify runtime imports. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:44] | Reviewed commit and MIT source are documented; copied-code inventory is empty. [CITED: https://github.com/Graphify-Labs/graphify/blob/abff1b1ca4052fcf9d955c5f6a034088723f4536/LICENSE] |
| TRUTH-01 | Schema/ID/provenance tests cover all eight kinds, relations, stable source namespace, exact locators, and generation replacement. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:57] | P01–P06 exact published records/relations/query/provenance match gold. [VERIFIED: 55-AI-SPEC.md P01–P06] |
| TRUTH-05 | Failure-injected store/runtime tests prove withdraw/purge/absence/stage/publish order for change/delete/revoke/quota/crash. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:61] | R04–R07 show no stale facts, edges, search entries, caches, or later-category influence. [VERIFIED: 55-AI-SPEC.md R04–R07] |
| TRUTH-10 | Hostile source/filename/comment/model fixtures prove inert data, closed schemas, no tools, exact evidence registry, and no durable effect. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:66] | A01–A07, I01–I05, and L01–L03 all pass with zero boundary escape. [VERIFIED: 55-AI-SPEC.md:450–452] |

## Recommended Planning Sequence

1. Establish provenance/static gates, the 37-case fixture manifest, graph schema contracts, and abort-compatible `UniversalProvider` behavior first so later storage/extraction work has executable boundaries. [VERIFIED: 55-AI-SPEC.md:414; extension/ai/universal-provider.js:352]
2. Implement immutable IDs/provenance/closed relations and the graph store with source-owned shards, real Phase 54 participant adapters, journals, absence proofs, and fault-injected recovery before adding model calls. [VERIFIED: 55-CONTEXT.md D-01–D-08]
3. Implement deterministic segmentation and the strict provider extraction pipeline against recorded responses, including exact budgets, one-repair policy, evidence registry, and complete-generation staging. [VERIFIED: 55-CONTEXT.md D-09–D-12; 55-AI-SPEC.md:247]
4. Implement bounded query/cache reconstruction and the single background engine facade, then wire boot/import order and Phase 54 exact-source/set operations. [VERIFIED: 55-CONTEXT.md D-13–D-15; extension/background.js:3146]
5. Close with the full 37-case gate, storage/content dependency scan, recovery/absence matrix, extension validation, full test suite, and optional synthetic live-provider qualification only if explicitly configured. [VERIFIED: 55-AI-SPEC.md:414–440]

The planner should minimize file overlap across plans: schema/provider compatibility can precede store work; store/participants must precede extraction publication; query/facade must consume the finalized store contract; background/package integration should be last. [VERIFIED: dependencies described above]

## Common Pitfalls

- Treating `chrome.storage.local` multi-key writes as a transaction exposes half-published truth; only the controlling pointer may make a complete validated generation visible. [VERIFIED: 55-CONTEXT.md D-07; extension/utils/skopeo-corpus-store.js:986]
- Registering Phase 54's no-op participant before the graph adapter prevents later replacement because participant names are unique; initialization must install the real adapter from the start. [VERIFIED: extension/utils/skopeo-corpus-store.js:816; extension/background.js:328]
- Including the content fingerprint directly in the stable record ID makes unchanged source-local facts appear as new identities on every generation; fingerprint belongs in fragment/record-version identity, while stable record identity follows D-02. [VERIFIED: 55-CONTEXT.md D-01–D-02]
- Trusting JSON Schema alone misses current authority, prototypes/accessors, endpoint matrices, duplicate/dangling references, exact evidence bytes, and ownership; semantic parsing is mandatory. [VERIFIED: 55-AI-SPEC.md:251]
- Racing a provider promise without passing the abort signal still spends tokens and permits delayed retry/results; cancellation must reach fetch and backoff. [VERIFIED: extension/ai/universal-provider.js:352; 55-AI-SPEC.md:384]
- Persisting raw prompts, rejected output, filenames, or validator values leaks confidential source data; diagnostics keep only fixed categories and bounded paths/counts. [VERIFIED: 55-AI-SPEC.md:497]
- Building a global MiniSearch snapshot or adjacency map makes per-source absence hard to prove and risks stale/cross-partition results after wake. [VERIFIED: 55-CONTEXT.md D-06]
- Using labels, normalized text, similarity, or model IDs for identity silently fuses unrelated records and violates source ownership. [VERIFIED: 55-CONTEXT.md D-02]
- Allowing “best effort” partial publication after a failed batch contaminates later facts/alerts; the whole fragment remains invisible until every batch and derived shard validates. [VERIFIED: 55-CONTEXT.md D-04; 55-AI-SPEC.md:249]
- Expanding “inspect” into a graph explorer, JMESPath endpoint, dynamic graph language, or content message exposes a larger authority surface and is out of scope. [VERIFIED: 55-CONTEXT.md D-14; 55-CONTEXT.md Specific Ideas]

## Assumptions and Open Questions

There are no blocking product questions. The locked context and AI specification determine the trust, provider, storage, extraction, query, and replacement boundaries. [VERIFIED: 55-CONTEXT.md; 55-AI-SPEC.md]

The planner may tune finite operational caps only where the context grants discretion, but should adopt the AI specification's extraction caps unchanged for the initial implementation because the mandatory fixtures and monitoring thresholds already bind them. [VERIFIED: 55-CONTEXT.md the agent's Discretion; 55-AI-SPEC.md:513]

The initial traversal recommendation of depth 2 / 64 nodes / 128 edges is the sole explicit implementation assumption in this research; it is non-blocking and should be confirmed or reduced with deterministic scale/boundary fixtures before the plan is finalized. [ASSUMED]

## Primary Sources

- Phase 55 context and constraints. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-CONTEXT.md]
- Phase 55 AI provider/evaluation contract. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/55-chrome-local-graph-incremental-truth-foundation/55-AI-SPEC.md]
- Phase 55 requirements and roadmap. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md; .planning/milestones/v1.2.0-SKOPEO-ROADMAP.md]
- Implemented Phase 54 schema/store/authority/reconciler/background contracts. [VERIFIED: extension/utils/skopeo-corpus-schema.js; extension/utils/skopeo-corpus-store.js; extension/utils/skopeo-drive-authority.js; extension/utils/skopeo-drive-reconciler.js; extension/background.js]
- Existing provider, validator, MiniSearch, manifest, and test configuration. [VERIFIED: extension/ai/universal-provider.js; extension/utils/capability-interpreter.js; extension/utils/capability-search.js; extension/manifest.json; package.json]
- Chrome Storage API and trusted access-level documentation. [CITED: https://developer.chrome.com/docs/extensions/reference/api/storage]
- Graphify pinned architecture, mechanics, implementation samples, and MIT license. [CITED: https://github.com/Graphify-Labs/graphify/tree/abff1b1ca4052fcf9d955c5f6a034088723f4536]
- OWASP ASVS project for security-area terminology. [CITED: https://github.com/OWASP/ASVS]

## Research Confidence

| Area | Confidence | Basis |
|------|------------|-------|
| Repository integration and Phase 54 seams | High | Current source and completed Phase 54 artifacts expose exact boot, authority, participant, mutation, and projection contracts. [VERIFIED: extension/background.js; extension/utils/skopeo-corpus-store.js; extension/utils/skopeo-drive-authority.js] |
| Graph schema, identity, storage, replacement, and query design | High | Locked Phase 55 decisions plus existing canonical/store patterns constrain the design tightly. [VERIFIED: 55-CONTEXT.md; extension/utils/skopeo-corpus-schema.js] |
| Provider and hostile-output boundary | High | Current provider code and the completed AI specification define exact compatibility gaps, caps, repair rules, and fixtures. [VERIFIED: extension/ai/universal-provider.js; 55-AI-SPEC.md] |
| Graphify reuse/license decision | High | Exact upstream commit, implementation files, architecture docs, and MIT license were reviewed. [CITED: https://github.com/Graphify-Labs/graphify/tree/abff1b1ca4052fcf9d955c5f6a034088723f4536] |
| Deterministic validation architecture | High | Repository test style and the mandatory 37-case contract are explicit and network-free. [VERIFIED: package.json; 55-AI-SPEC.md:414–454] |
| Live configured-provider extraction quality | Medium | It depends on the user's selected provider/model and remains unmeasured until optional synthetic qualification. [VERIFIED: 55-AI-SPEC.md:425–440] |

## Ready for Planning

Phase 55 is ready for planning. The plan should implement the private source-owned graph substrate, real purge ownership, abort-safe configured-provider extraction, strict evidence admission, bounded local queries, and full deterministic evaluation without adding UI, Graphify code, Python, a database, a daemon, MCP runtime, or a new package. [VERIFIED: all findings above]
