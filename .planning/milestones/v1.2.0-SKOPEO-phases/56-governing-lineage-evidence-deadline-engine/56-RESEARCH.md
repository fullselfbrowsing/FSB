# Phase 56: Governing Lineage, Evidence & Deadline Engine - Research

**Researched:** 2026-07-23  
**Domain:** Trusted background contract-truth adjudication, immutable evidence, and civil-date derivation  
**Confidence:** High for repository integration, authority, persistence, and validation architecture; medium for domain-label fidelity until the required legal/legal-operations review exists

## User Constraints (from CONTEXT.md)

### Phase Boundary

Phase 56 turns the permission-certified Phase 55 graph into closed governing-lineage conclusions, separately cited exact facts and conflicts, deterministic deadline derivations, and alert-eligibility decisions. It does not build the Phase 57 folder/reading HUD, Phase 58 free-form ask or policy behavior, or Phase 59 alert scheduling and delivery. [VERIFIED: `56-CONTEXT.md`]

Phase 56 is backend-only. The word `review` in `review-required` is a truth state, not a UI signal. No `UI-SPEC.md`, content renderer, Drive rail, Docs annotation, ask surface, alarm, notification, or recipient workflow belongs in this phase. [VERIFIED: `56-CONTEXT.md`; `.planning/milestones/v1.2.0-SKOPEO-ROADMAP.md` Phases 57-59]

### Locked Decisions

- Governing precedence requires exact executed/effective evidence and explicit admissible lineage language over the current authorized source set. Filename, recency, similarity, folder order, and list position are never precedence evidence.
- Partial amendments are clause-scoped overlays. Untouched clauses inherit from the base. An unclear, dangling, or conflicting target makes the affected family review-required.
- Execution state, temporal state, lineage role, and governance conclusion remain separate closed axes.
- Model output is candidate-only. One deterministic adjudicator either emits a cited conclusion or abstains; no model pass may rank documents or promote precedence.
- Signed, effective, expiration, termination, renewal, notice-window, notice-deadline, delivery-method, and written-address facts are separate immutable typed assertions.
- Every material citation binds the partition, source revision/fragment generation, record version, locator ID, and byte range. A URL or filename is never durable citation authority.
- Source access/currency is separate from claim trust state. Claim trust uses only `extracted`, `inferred`, `ambiguous`, `unreadable`, and `review-required`; numeric confidence cannot clear a claim.
- Competing assertions remain an explicit conflict set. Only accepted governing lineage may select applicability.
- Deadline rules are closed data, use allowlisted operations, and carry explicit cited inputs. Arbitrary JavaScript, model arithmetic, browser locale, and implicit UTC are forbidden.
- Calendar-day rules may be supported directly. Business-day rules require an explicit governing calendar; otherwise the result is review-required.
- Notice-window start, notice deadline, boundary inclusivity, timezone, and consequence are distinct from renewal, termination, and expiration.
- Alert eligibility is a deterministic data result only. Phase 56 does not schedule or deliver alerts.
- The truth engine receives one bounded exact-set graph snapshot through Phase 54 authority. It cannot read graph storage or infer completeness from search.
- Truth snapshots are immutable, input-version-bound, and published pointer-last. Source reverse dependencies withdraw every affected snapshot synchronously before recomputation.
- Phase 56 replaces the reserved `citations` empty purge participant with a real owner. `counts` and `alerts` remain explicit empty participants.
- A separate frozen background truth facade returns only minimized lineage, fact, conflict, citation, and deadline projections under fresh authority. Content and MCP receive no raw graph, truth store, or storage access.

## Executive Summary

Plan Phase 56 as a second trusted evidence layer above the Phase 55 graph, not as a mutation of graph truth and not as a general legal rules engine.

The existing graph is the right identity, provenance, and source-currentness substrate, but its durable record shape is intentionally too small to carry Phase 56 semantics: records contain only `kind`, `label`, evidence, stable identity, and version; relations contain one of seven graph predicates plus evidence. There is no closed fact subtype/value, execution state, amendment scope/effect, deadline operator, boundary rule, timezone, or address shape. Parsing `label` strings as legal facts would make free-form model text authoritative and violate TRUTH-09/TRUTH-10. [VERIFIED: `extension/utils/skopeo-graph-schema.js`; `extension/utils/skopeo-graph-extractor.js`]

The recommended design therefore has five responsibilities:

1. Extend the graph query/engine boundary with one complete, bounded, exact-set snapshot operation. The truth engine consumes this operation only; it never reads `skopeo-graph-store.js`.
2. Add a closed Phase 56 source-local candidate contract for execution, lineage language, typed facts, and deadline rules. Reuse the configured provider and Phase 54 certified source path, but keep all model output candidate-only and all cross-document adjudication local.
3. Run a pure deterministic adjudicator over the current exact set. It separates four lineage axes, builds clause overlays, preserves conflicts, and emits a proof or a closed abstention.
4. Persist immutable per-document-family truth snapshots, citations, reverse dependencies, and journals under one pointer-last truth store. The `citations` participant owns all Phase 56 derived influence for purge purposes.
5. Expose a frozen background-only facade whose reads repeat Phase 54 authority, compare the current graph-set/input digest, and return only minimized proof projections. Phase 57-59 can consume it later without receiving storage or graph capabilities.

A dedicated Phase 56 AI contract is advisable because a new source-local candidate schema/prompt is required. It may reuse Phase 55's provider, cancellation, excerpt, and no-storage patterns, but it must not reuse Phase 55's free-form `label` as a typed fact or add a model precedence pass.

## Existing Foundation and Exact Integration Seams

### Phase 54 authority

`runSkopeoCorpusOperation` is the sole current background authority seam. It accepts exactly `ingestion`, `query`, `display`, `citation-open`, or `alert-delivery`, checks one exact source or a deduplicated exact set capped at 32, creates a fresh Phase 54 operation, rechecks the live Skopeo tuple before and after callbacks, and delegates to `runWithCertifiedSource(s)`. [VERIFIED: `extension/background.js`]

Important consequences:

- Phase 56 should reuse `query` for exact graph/truth reads, `ingestion` for any source-local candidate extraction or truth publication, `display` for later minimized projection assembly, and `citation-open` for any future navigation resolution.
- A query/extraction session cannot retain a certificate across calls. Every awaited effect needs a fresh operation.
- The existing exact-set limit is 32. Phase 56 must reject the whole set or return a closed over-cap blocker; it must never process the first 32 and call that complete.
- `display` can represent partial source states, but governing/deadline clearance requires an exact complete ready set. A partial authority result can produce a blocker, never a governing snapshot.

The Phase 54 certificate already carries the exact partition tuple, source ID, operation kind/identity, source/partition epochs, vendor scope, physical ancestry, and metadata/membership/content fingerprints. It is nonserializable and destroyed at operation end. [VERIFIED: `extension/utils/skopeo-drive-authority.js`]

The certificate does not expose a durable filename or URL, which is desirable. Citation navigation must be freshly resolved from the certified source ID in background rather than persisted as a link. If Phase 56 needs to distinguish `unreadable` from another non-ready state inside the truth facade, add one minimized source-state projection through the authority seam; do not infer it from a missing graph fragment or a null fingerprint.

### Phase 54 purge protocol

The corpus store owns exactly seven participant names in fixed order:

`fragments`, `indexes`, `citations`, `counts`, `relationships`, `result-cache`, `alerts`.

Every participant is registered once. An authorized participant receives a one-call, exact-request, exact-mode, exact-signal, exact-epoch capability. Purge succeeds only after all participants return exact success and all absence proofs return `owned:false`. [VERIFIED: `extension/utils/skopeo-corpus-store.js`]

Phase 56 should replace only the current empty `citations` binder. The binder must purge the whole Phase 56 truth influence—active truth pointers, assertions, conflicts, deadline proofs, citation records, journals, and reverse-dependency entries—not merely a list of citation locators. Otherwise a revoked source could leave a governing or alert-eligible conclusion behind while the participant reports absence.

### Phase 55 graph schema

Phase 55 provides:

- Eight source-owned record kinds: `agreement`, `amendment`, `clause`, `fact`, `event`, `owner`, `policy-document`, `memo`.
- Seven typed predicates: `contains`, `amends-candidate`, `states-fact`, `records-event`, `assigned-owner`, `references-policy`, `references-memo`.
- Source-owned stable record/relation IDs and generation-bound record/relation versions.
- Evidence locators containing the exact partition, source, content fingerprint, fragment generation, excerpt ID/range, source byte range, and locator ID.
- Candidate-only cross-document relations bound to both endpoint record versions and fragment generations.

[VERIFIED: `extension/utils/skopeo-graph-schema.js`; `55-01-SUMMARY.md`]

These are identity and evidence primitives, not governing semantics. In particular:

- `amends-candidate` cannot prove execution, effectiveness, scope, supersession, or precedence.
- A `fact` record's `label` is bounded text, not a typed date/address/window value.
- An `event` label is not an execution or termination state.
- Relation order, record order, labels, and lexical scores have no legal meaning.

### Phase 55 graph store and query

The graph store publishes immutable source generations pointer-last and keeps proposer-owned cross-document candidate overlays current against both endpoints. It exposes current fragments and active shards only to trusted injected dependencies. [VERIFIED: `extension/utils/skopeo-graph-store.js`; `55-02-SUMMARY.md`]

The graph query layer creates opaque scopes over a sorted exact `(sourceFileId, fragmentGenerationId)` set, lazily reconstructs bounded caches, and rechecks every current generation before and after reads. Its public operations are exact lookup, lexical search, bounded traversal, and provenance. [VERIFIED: `extension/utils/skopeo-graph-query.js`; `55-04-SUMMARY.md`]

Lexical search and bounded traversal cannot establish exact-set completeness:

- lexical search can omit a relevant record because of wording, top-N, or indexing;
- traversal starts from a selected node and is capped by depth/node/edge limits;
- `getById` requires the caller to know every ID;
- provenance returns only one selected object's evidence.

The new truth snapshot seam must enumerate the entire already-authorized scope in deterministic order and reject the whole result at any cap or currentness failure.

### Current background boot

Current trusted boot:

1. loads the Phase 54 chain;
2. loads five Phase 55 graph modules;
3. constructs corpus store, graph store, graph query, and graph extractor;
4. registers four real graph participants and three empty participants;
5. runs corpus recovery;
6. runs graph recovery;
7. creates one frozen graph facade.

[VERIFIED: `extension/background.js`; `scripts/verify-skopeo-storage-boundary.mjs`]

Phase 56 must extend, not bypass, this chain. The recommended order is:

1. load truth modules after all five graph modules;
2. construct the truth store before participant registration;
3. register graph participants, the real truth `citations` binder, and empty `counts`/`alerts`;
4. run corpus recovery;
5. run graph recovery;
6. create the graph facade;
7. run bounded truth durable recovery;
8. create the frozen truth facade;
9. expose the overall boundary only after every required dependency is ready.

Truth recovery should validate truth-owned controls/pages/journals and leave uncertain pointers withdrawn. It must not hydrate graph/query caches or claim fresh Drive authority at worker boot.

## Critical Schema Gap and Recommended Candidate Stage

### Why Phase 55 labels cannot be parsed as truth

The Phase 55 extraction prompt asks the model for exactly:

- record: `candidateRef`, `kind`, `label`, `evidence`;
- relation: `fromCandidateRef`, `predicate`, `toCandidateRef`, `evidence`.

[VERIFIED: `extension/utils/skopeo-graph-extractor.js`]

That shape cannot distinguish:

- signed date versus effective date;
- stated termination date versus derived notice deadline;
- a delivery method from an address;
- a full replacement from a clause-only amendment;
- “effective on execution” from a calendar date;
- calendar days from business days;
- inclusive from exclusive boundaries;
- a governing timezone from browser locale;
- direct extraction from deterministic inference.

Treating conventions such as `"Effective Date: 2027-01-01"` inside `label` as a hidden protocol would be a permissive free-form key/value bag and would turn model wording into authority.

### Recommended source-local truth candidate extraction

Add a versioned, closed Phase 56 candidate schema. One source-local extraction generation may use multiple bounded chunk calls, but it must never ask the model to compare documents or decide which one governs.

The candidate schema should contain only closed records similar to:

- document execution/effect candidates;
- lineage-language candidates (`amends`, `replaces`, `supersedes`) with explicit scope;
- typed fact candidates;
- deadline-rule candidates;
- engine-issued graph/document/clause handles;
- exact engine-issued evidence locators.

The model must not supply:

- source IDs, partition keys, graph IDs, truth IDs, snapshot IDs, or URLs;
- JavaScript, expressions, callbacks, tools, code, SQL, JMESPath, or arbitrary operators;
- a `governing` boolean, precedence rank, confidence threshold, or alert eligibility;
- a target selected only from a filename, label similarity, date, or list order;
- an uncited value.

The engine maps response-local handles to the current exact graph snapshot, derives every durable ID locally, validates every locator against the exact source generation, and rejects the whole candidate generation on structural, evidence, ownership, cap, provider-binding, or currentness failure.

Reuse the existing configured `UniversalProvider`, caller cancellation, settings recheck, inert JSON envelope, raw-response lifetime, and no-storage acknowledgement patterns. Do not create a generic prompt execution API or expose a second provider selector. [VERIFIED: `extension/ai/universal-provider.js`; `extension/utils/skopeo-graph-extractor.js`]

One model extraction stage is compatible with the locked “no second model precedence pass” decision: the model proposes source-local structured evidence, while all cross-source resolution, applicability, conflict handling, and deadline arithmetic are deterministic local code.

### Alternative rejected approaches

| Approach | Why not |
|----------|---------|
| Parse Phase 55 `label` strings | Free-form model wording becomes a hidden schema and cannot prove exact fact type/value or rule semantics. |
| Ask a second model which document wins | Violates the deterministic adjudicator and current-authority proof requirements. |
| Extend lexical search until enough results appear | Search is relevance-bounded, not an absence/completeness proof. |
| Read `skopeo-graph-store.js` from the truth engine | Bypasses Phase 54 exact-set authority and graph facade currentness. |
| Persist source text beside assertions | Violates the bounded ephemeral-source retention boundary. |
| Infer dates with browser `Date.parse` | Locale/timezone-dependent and silently normalizes invalid civil dates. |

## Recommended Module Architecture

Exact filenames are discretionary, but keep these responsibilities independently testable.

| Module | Sole responsibility | Must not do |
|--------|---------------------|-------------|
| `utils/skopeo-truth-schema.js` | Closed candidate, citation, assertion, conflict, lineage-proof, deadline-rule/result, snapshot, and ID parsers | Chrome/storage/provider calls; legal precedence; date arithmetic; UI |
| `utils/skopeo-truth-extractor.js` | Bounded source-local candidate extraction through the configured provider and exact evidence handles | Cross-document ranking; durable writes; provider fallback; arbitrary tools/expressions |
| `utils/skopeo-lineage-adjudicator.js` | Pure deterministic document-family grouping, four-axis state, partial overlay, conflict, and abstention logic | Storage; graph reads; model calls; filenames/recency/similarity |
| `utils/skopeo-deadline-engine.js` | Pure civil-date validation and allowlisted data-only rule evaluation | `eval`, `Function`, dynamic dispatch, browser locale, implicit UTC, alarms |
| `utils/skopeo-truth-store.js` | Immutable snapshot pages, active controls, reverse dependencies, journals, real `citations` binder, absence proof, recovery | Graph reads; source navigation; model calls; UI |
| `utils/skopeo-truth-engine.js` | Fresh-operation orchestration, exact-set snapshot consumption, source-local candidate steps, withdrawal/recompute, minimized facade | Raw store exposure; content/MCP messages; alarms/notifications; free-form ask |

If implementation pressure favors fewer files, the extractor may live inside the truth engine and the two pure adjudicators may share one module. Do not merge schema, durable store, and background facade: those are separate trust boundaries and need separate hostile-input and recovery tests.

## Exact-Set Graph Snapshot Contract

### Required operation

Extend the graph query/engine facade with one private method conceptually equivalent to:

`snapshotExactSet(exactTuple, { sourceFileIds })`

It should:

1. normalize and sort one nonempty unique set, bounded by the existing 32-source authority cap;
2. enter one fresh Phase 54 `query` operation for that exact set;
3. require `proof.complete === true` and a certificate for every requested source;
4. derive and verify each current fragment generation from its certified content fingerprint;
5. read every current fragment and candidate overlay through the graph layer;
6. reparse all records, relations, evidence, endpoint versions, and ownership;
7. enforce whole-snapshot caps for sources, records, relations, evidence, and serialized bytes;
8. sort every collection by stable/version ID;
9. recheck all source generations and exact-set authority after assembly;
10. return a recursively frozen snapshot or no snapshot.

The result should include:

- partition key;
- sorted exact source-generation pairs;
- complete source-local records;
- complete local relations;
- only endpoint-current cross-document candidates;
- exact record/relation versions and evidence locators;
- an engine-derived `authorizedSetDigest` or equivalent complete-input digest.

It should not include:

- raw source text;
- lexical scores, cache internals, shard keys, provider response, diagnostics, URL, or filename;
- storage handles, query scopes, certificates, or mutation capabilities;
- a partial result when any selected source is unavailable, non-current, corrupt, or over cap.

### Source access/currency alongside the snapshot

Source access and graph currency are not claim trust. Preserve a separate internal projection such as:

- corpus source state (`ready`, `unreadable`, `download-blocked`, `pending`, `inaccessible`, `missing`);
- certification status;
- graph generation currentness;
- truth snapshot currentness.

Only a complete all-ready/current exact set may produce a cleared governing conclusion or alert-eligible deadline. A non-ready source may produce a closed generic blocker; it must not be silently omitted from the set.

### Snapshot discovery

The caller must obtain the exact current source set from the background-owned visible corpus manifest, not from graph keys or search. The manifest set is itself bounded and must be reread through the Phase 54 boundary before publication. If the set exceeds the supported cap, return a deterministic `exact-set-over-cap` blocker and publish no partial truth.

## Truth Data Contracts

### Separate four-axis lineage state

Recommended closed axes:

| Axis | Example values | Rule |
|------|----------------|------|
| Execution | `executed`, `unsigned`, `unknown` | Only exact cited execution/signature evidence can establish `executed`; absence is `unknown`, not unsigned. |
| Temporal | `future`, `effective`, `expired`, `terminated`, `unknown` | Derived from exact cited facts under explicit civil-date/timezone semantics. |
| Lineage role | `base`, `partial-amendment`, `full-replacement`, `historical`, `unclassified` | Requires explicit cited lineage language and exact target identity. |
| Governance conclusion | `governing`, `partially-governing`, `superseded`, `non-governing`, `review-required` | Deterministic result over the other axes, conflicts, access, and current exact set. |

Exact enum spelling is discretionary. Preserve the semantic separation. Do not use one status string such as `active-amended-governing` that makes unsigned, historical, temporal, and precedence states inseparable.

Each axis result should include:

- value;
- closed reason code;
- citation IDs;
- source/record/relation versions used;
- trust state;
- whether the value is direct or deterministically derived.

### Citation record

A material citation should bind at least:

```text
version
partitionKey
sourceFileId
contentFingerprint
fragmentGenerationId
recordVersionId
relationVersionId | null
locatorId
sourceByteStart
sourceByteEnd
citationId
```

Derive `citationId` locally over the complete canonical tuple. Reparse the graph evidence and verify:

- the source/partition/generation matches the owning record/relation;
- `start < end`;
- the locator ID recomputes;
- the range is within the exact source;
- no duplicate citation ID carries different bytes or ownership.

Never persist a filename, `webViewLink`, generated Docs URL, folder position, or host DOM selector as citation authority. A later source-open operation takes only the citation ID, enters fresh `citation-open` authority, resolves the current source ID in background, and aborts if the citation generation is stale.

### Typed assertion record

Use one immutable assertion per semantic claim, not one lifecycle summary:

- signed date;
- effective date;
- expiration date;
- termination date;
- renewal fact;
- notice window;
- notice deadline;
- delivery method;
- written-notice address.

Recommended common fields:

```text
assertionId
assertionVersionId
familyId
subjectDocumentRecordVersionId
subjectClauseRecordVersionId | null
assertionType
typedValue
trustState
citationIds[]
candidateSchemaVersion
derivationRuleVersion | null
```

`typedValue` should be an exact closed union per assertion type:

- dates: validated civil `YYYY-MM-DD`, never a JavaScript timestamp;
- renewal: closed mode plus exact duration/date components when stated;
- notice window: integer amount, closed unit, relation to an exact anchor, boundary;
- delivery method: closed method code plus a bounded exact-stated qualifier only when needed;
- address: bounded exact line array and optional closed recipient/city/region/postal/country fields, without a generic arbitrary-property bag.

The model may propose a typed value, but the trusted parser normalizes and validates it. A normalized value is not governing until lineage adjudication selects its source/clause.

### Claim trust and access

Claim trust is exactly one of:

- `extracted`: direct exact evidence supports the typed assertion;
- `inferred`: a deterministic versioned rule derives it from cited extracted inputs;
- `ambiguous`: current applicable evidence yields more than one incompatible value;
- `unreadable`: the required source location cannot be reliably read;
- `review-required`: deterministic rules cannot establish applicability or meaning.

Keep a separate source/access structure. Do not convert `inaccessible` into a low-confidence extracted assertion and do not let `confidence >= threshold` become `extracted`.

### Conflict set

Define a semantic slot using exact identities, for example:

`(familyId, governing clause/document target, assertionType, applicability context)`.

For every slot:

1. retain every structurally valid assertion;
2. use accepted governing lineage only to determine which assertions are applicable;
3. group byte-equivalent canonical values without deleting their separate citations;
4. if more than one incompatible applicable value remains, emit an immutable conflict set;
5. set the slot to `ambiguous`/`review-required`;
6. block every downstream deadline that depends on the slot.

Never choose by model confidence, source recency, filename, record order, majority vote, or “more specific-looking” text.

## Deterministic Governing-Lineage Algorithm

### Inputs

The adjudicator receives only:

- one validated exact-set graph snapshot;
- closed source-local truth candidates;
- explicit evaluation/as-of input;
- fixed schema, prompt, adjudication, and rule versions.

It receives no filename, folder/list order, lexical score, raw source, provider object, current browser locale, or arbitrary callback.

### Family formation

Build document families from exact source-owned document records and explicit endpoint-current candidate relations. A document with no explicit admissible connection cannot be merged into a family because its name or text looks similar.

Recommended family identity:

- derive a deterministic component ID from the sorted stable document record IDs and accepted candidate relation IDs;
- retain each source-owned identity unchanged;
- never fuse two records into one global agreement identity.

If the relation graph is cyclic, dangling, cross-partition, endpoint-stale, or over cap, mark the component review-required.

### Candidate admission

An amendment/replacement candidate is admissible only when all are true:

- proposer and target are in the exact current set;
- endpoint record versions and fragment generations match;
- the source contains explicit cited lineage language;
- the amendment/replacement has exact executed evidence;
- its temporal/effective evidence is exact enough for the supplied as-of context;
- scope is closed and exact;
- every cited locator is current.

An `amends-candidate` edge by itself is insufficient.

### Base and replacement

- An executed/effective agreement may be a base only through exact evidence, not because it is oldest or named “Master”.
- A full replacement requires explicit cited whole-agreement replacement/supersession language.
- An unsigned or execution-unknown newer document cannot supersede an executed base.
- Multiple eligible bases or replacements without an explicit ordering relationship are a conflict, not a tie-break opportunity.

### Partial amendments

Represent partial amendments as immutable overlay entries:

```text
baseClauseRecordVersionId
amendmentDocumentRecordVersionId
amendmentClauseRecordVersionId
effect
effectiveContext
citationIds[]
```

The algorithm:

1. begins with the accepted base clause map;
2. applies only exact clause-targeted, executed/effective overlays;
3. leaves every untouched clause inherited from the base;
4. records inheritance explicitly rather than copying/relabeling the base assertion;
5. requires explicit lineage to order multiple overlays on the same clause;
6. emits review-required on unclear scope, conflicting targets, cycles, or overlapping unorderable overlays.

The proof must show both the governing amendment clause and the inherited base clauses.

### Temporal “today” handling

“Governs today” must be reproducible. Inject an explicit as-of instant or civil date and bind it to the proof. Convert it only with an explicit cited/configured governing IANA timezone. Do not call `new Date("YYYY-MM-DD")`, use browser locale, or silently choose UTC.

If governing timezone or date-boundary semantics are required but unavailable, keep the temporal axis `unknown` and the governance conclusion `review-required`. Store structural facts independently so a later review/configuration can recompute without rewriting evidence.

### Proof or abstention

A governing proof object should carry:

- exact-set/input digest;
- every source generation and record/relation version actually used;
- four axis results;
- accepted base/replacement path;
- clause overlay/inheritance map;
- applicable fact assertion IDs;
- conflicts;
- citations;
- explicit as-of/rule versions;
- conclusion or closed abstention/blocker codes.

The adjudicator should be a pure function. Given byte-identical sorted inputs and versions, it must emit byte-identical canonical output regardless of insertion order.

## Deterministic Deadline Engine

### Closed rule schema

Start with the smallest useful allowlist. A recommended initial rule family is:

- exact anchor date;
- add/subtract a positive integer count of calendar days;
- explicit inclusive/exclusive boundary;
- explicit notice-window start/end;
- explicit timezone metadata;
- explicit consequence reference.

Support business-day arithmetic only when the rule names an exact immutable governing calendar record/version containing weekend definition and holiday dates. Without it, emit `business-calendar-missing` or `unsupported-business-day-rule`.

Do not implement:

- arbitrary expressions;
- dynamic operator names;
- JavaScript source or callbacks;
- locale date parsing;
- fuzzy phrases such as “reasonable time”;
- silent month-end clamping;
- hidden holiday calendars;
- model-calculated output dates.

If month/year offsets are added, specify end-of-month behavior in the rule version and reject any clause whose semantics do not match it.

### Civil-date implementation

Use a small pure proleptic-Gregorian civil-date implementation:

- exact `YYYY-MM-DD` parser;
- leap-year and days-in-month validation;
- conversion to/from an integer day ordinal;
- checked integer add/subtract;
- closed bounds;
- no `Date.parse`;
- no host timezone.

This makes leap-day, year-boundary, and locale tests deterministic in Node and Chrome.

### Separate outputs

Keep these independent:

- renewal/expiration/termination anchor fact;
- notice-window start;
- notice deadline;
- boundary inclusivity;
- governing timezone and its evidence/state;
- consequence of inaction and its citation;
- derivation rule and exact input assertions.

A derived deadline assertion should normally have trust `inferred`, with its direct input facts retaining `extracted`.

### Alert eligibility

Recommended result:

```text
eligibility: eligible | ineligible
blockerCodes: sorted closed array
```

Eligibility is `eligible` only when:

- the lineage snapshot is current and governing;
- the exact source set remains certified;
- all input assertions are exact, applicable, and current;
- every citation resolves to the same source/fragment/record version;
- no relevant conflict exists;
- the rule/operator is supported;
- boundary and timezone semantics are explicit enough;
- any required business calendar exists and is current.

Recommended blocker vocabulary includes:

- `exact-set-incomplete`;
- `lineage-review-required`;
- `lineage-not-current`;
- `source-unavailable`;
- `source-unreadable`;
- `citation-stale`;
- `fact-missing`;
- `fact-conflict`;
- `input-not-exact`;
- `unsupported-rule`;
- `business-calendar-missing`;
- `timezone-missing`;
- `boundary-ambiguous`;
- `consequence-missing`;
- `rule-version-stale`;
- `snapshot-stale`;
- `exact-set-over-cap`.

Phase 56 must not create `chrome.alarms`, notifications, recipients, a 90-day notification schedule, delivery attempts, or an alert ledger. `alerts` remains an empty participant until Phase 59.

## Persistence, Reverse Dependencies, and Recovery

### Truth snapshot identity

Each immutable document-family snapshot should bind:

- partition key;
- document-family ID;
- sorted source/content/fragment generations;
- sorted record and relation versions consumed;
- candidate extraction generation/version;
- truth schema and prompt versions;
- adjudication rule version;
- deadline/calendar rule versions;
- explicit as-of input;
- assertion, conflict, citation, lineage, and deadline page hashes.

Derive a snapshot ID from the complete canonical binding. Store the full ownership tuple alongside hashes so a digest alone is never authority.

### Pointer-last publication

Recommended state machine:

1. withdraw the current family pointer;
2. prove old active influence absent from read paths;
3. write a journal;
4. stage immutable candidate/snapshot pages invisibly;
5. validate every page, count, hash, reverse dependency, citation, and input version;
6. write reverse dependencies;
7. publish one family control pointer last;
8. clear the journal.

No reader scans for the “newest” page. Only the validated active pointer confers visibility.

### Reverse dependencies

Maintain source-to-family reverse dependencies for every source whose fragment, record, relation, candidate, fact, citation, or rule influences a snapshot.

When source A is withdrawn:

1. read only A's bounded reverse-dependency pages;
2. synchronously clear every affected family pointer before returning from purge;
3. remove the affected snapshot's entries from every sibling source dependency;
4. delete or orphan-mark immutable pages for bounded recovery cleanup;
5. prove no active snapshot, citation, conflict, or deadline still names A;
6. return exact purge success.

This is essential for multi-source families. Removing only A's own pages while leaving a family pointer reachable through source B would preserve stale governing truth.

### Invalidation beyond corpus purge

The `citations` participant covers deletion, revocation, account/root changes, and corpus-source replacement. It does not automatically run when Phase 55 replaces a graph generation for an otherwise still-ready source or changes a candidate overlay.

The plan must add an explicit truth invalidation hook at the graph mutation boundary:

- before graph source replacement publishes a new generation, withdraw truth snapshots depending on that source;
- before candidate overlay replacement publishes, withdraw snapshots depending on the proposer and every target;
- only after withdrawal may graph publication proceed;
- recomputation may occur afterward under a fresh exact-set operation;
- until recomputation completes, the facade returns pending/review-required, never old truth.

Implement this as a narrow injected invalidator capability or a background orchestration wrapper. Do not let the truth engine poll graph storage for changes.

### Recovery

Truth recovery runs after graph recovery and should be sorted and capped. It should:

- leave `staging`, `withheld`, `purging`, or corrupt controls invisible;
- replay or finish bounded pointer withdrawal/cleanup;
- validate immutable page hashes and reverse-dependency symmetry;
- discard orphan staging;
- never infer current Drive access;
- never hydrate a graph cache;
- never select a snapshot by timestamp or filename;
- leave work above the cap closed for a later bounded pass.

On the first facade read after wake, compare the persisted snapshot's complete input binding to a freshly authorized graph snapshot. Mismatch withdraws the snapshot before returning.

## Frozen Background Truth Facade

Recommended private surface:

- recompute one exact document family/current exact set;
- inspect governing lineage;
- inspect typed facts;
- inspect conflicts;
- inspect citation metadata;
- inspect deadline derivation/eligibility;
- inspect metadata-only truth status.

Every method should:

- accept an exact live Skopeo tuple and exact source selection;
- enter a fresh Phase 54 operation;
- verify current graph/truth input binding;
- return a new recursively frozen minimized projection;
- enforce whole-result byte caps;
- return a closed decision on stale authority;
- expose no raw store, raw graph snapshot, raw source text, model output, prompt, provider usage, mutation guard, certificate, URL, filename, or cache.

Do not add a content action, public catalog capability, MCP tool, server route, daemon, or generic background query language in Phase 56. Later phases should call explicit background methods that wrap this facade.

## Requirement-to-Architecture Map

| Requirement | Required implementation evidence |
|-------------|----------------------------------|
| TRUTH-02 | Four separate closed lineage axes; explicit executed/effective and historical/superseded distinctions; permutation-invariant adjudicator |
| TRUTH-03 | Exact-set proof, explicit lineage candidate admission, clause overlay/inheritance map, cited governing proof |
| TRUTH-04 | Closed abstention/blocker states for unsigned, conflicting, missing, unreadable, inaccessible, stale, dangling, cyclic, or unsupported evidence |
| TRUTH-06 | Separate signed/effective/expiration/termination/renewal assertion types and exact citation registry |
| TRUTH-07 | Separate notice-window/deadline/delivery-method/address assertion types and governing citations |
| TRUTH-08 | Closed rule schema, pure civil-date engine, explicit inputs/rule/boundary/timezone/consequence proof |
| TRUTH-09 | Citation binding to partition/revision/generation/record/locator/range plus separate source currency and five-state claim trust |
| TRUTH-11 | Conflict-preserving adjudication and deterministic alert eligibility whose blockers prevent clearance |

All eight requirement IDs should appear in plan frontmatter. Do not mark Phase 57-59 requirements complete through backend test fixtures.

## Security Domain

### Trust boundaries

| Boundary | Trust rule | Required control |
|----------|------------|------------------|
| Source/graph text to truth candidate parser | Model/page/source text is inert candidate data | Exact-key closed schema, engine-issued handles/locators, no executable fields, reject whole generation |
| Exact graph set to adjudicator | Only current authority-certified complete sets may influence truth | Exact-set operation, complete proof, before/after generation checks, whole-result caps |
| Candidate relation to legal conclusion | Candidate links are not precedence | Explicit executed/effective/lineage evidence plus deterministic rules or abstention |
| Citation to source | Stored link/name is not authority | Exact source/version/locator binding and fresh `citation-open` revalidation |
| Deadline rule to arithmetic | Contract/model expression is untrusted | Closed operator dispatch, pure civil dates, explicit timezone/calendar, no dynamic execution |
| Truth store to readers | Durable pages are not visible by presence or timestamp | Validated active pointer only, exact input digest, pointer-last publication |
| Source mutation to multi-source truth | Any dependency may stale the whole proof | Synchronous reverse-dependency withdrawal and exact absence proof |
| Truth facade to later consumers | Background remains sole authority | Minimized frozen projections; no content/MCP/storage/raw graph exposure |

### Threat and negative-test matrix

| Threat | Mandatory negative oracle |
|--------|---------------------------|
| Filename/list/recency/similarity precedence spoof | Rename, reorder, alter timestamps, and inject matching labels; governing result remains byte-identical or abstains |
| Model emits `governing:true`, confidence, code, expression, or hidden fields | Closed candidate parser rejects the whole generation with zero durable effect |
| Candidate relation points to stale/foreign endpoint | Exact record/fragment versions reject it; no family merge or truth output |
| Unsigned newer draft displaces executed agreement | Draft remains non-governing/review-required; recency never breaks the tie |
| Partial amendment targets an unclear or conflicting clause | No guessed overlay; affected family/slot is review-required |
| Citation range/source/version is forged or clipped | Citation ID fails recomputation; assertion and deadline remain absent |
| Revocation or graph replacement races computation | Pointer withdrawn first; late computation cannot republish under stale operation |
| Purging one source leaves a multi-source family reachable | Reverse-dependency/absence proof fails until all family pointers and sibling deps are removed |
| Business-day clause uses host calendar | Engine abstains without an explicit immutable governing calendar |
| Date calculation changes with `TZ`, locale, or DST | Pure civil-date outputs remain identical; missing timezone blocks eligibility |
| Conflicting applicable facts are silently collapsed | Conflict set retains both assertion IDs/citations and deadline is ineligible |
| Snapshot or rule version changes after wake | Fresh read withdraws old pointer and returns stale/review-required |
| More than 32 sources or any record/relation/result cap | Whole operation rejects; no prefix/subset truth is published |
| Content/MCP probes truth globals or storage keys | Static/runtime boundary gate fails; no generic surface exists |

### Diagnostics and privacy

Diagnostics may retain only fixed operation, outcome, reason, version, count, duration, and recovery fields. They must not contain:

- source IDs in user-visible output;
- vendor/document/party names;
- fact values, dates, addresses, delivery methods, or consequence text;
- citation byte content;
- graph labels;
- filenames/URLs;
- provider prompts/responses;
- raw errors.

## Validation Architecture

Phase 56 needs fast pure-module feedback, storage fault matrices, runtime authority tests, a dedicated deterministic truth corpus, and separate human domain approval. Do not run tests during research; these are plan inputs for `56-VALIDATION.md`.

### Existing infrastructure

| Property | Value |
|----------|-------|
| Framework | Standalone Node `assert`/VM/fake-Chrome harnesses |
| Existing focused aggregate | `npm run test:skopeo-graph-evals` |
| Static boundary | `node scripts/verify-skopeo-storage-boundary.mjs` |
| Extension gate | `npm run validate:extension` |
| Full repository gate | `npm test` |
| Browser gate | `node tests/skopeo-browser-contract.test.js` |

No test framework or package installation is needed.

### Recommended focused tests

| Test | Primary coverage |
|------|------------------|
| `tests/skopeo-truth-schema.test.js` | Closed candidate/assertion/citation/conflict/snapshot shapes, IDs, hostile descriptors, exact caps |
| `tests/skopeo-truth-extractor.test.js` | Configured-provider parity, bounded source-local excerpts, exact handles/locators, no ranking pass, cancellation/raw-output disposal |
| `tests/skopeo-graph-query.test.js` additions | Complete exact-set snapshot, deterministic order, candidate overlay inclusion, stale/subset/over-cap rejection |
| `tests/skopeo-lineage-adjudicator.test.js` | Four axes, executed/effective gate, partial overlays, inheritance, replacement, conflicts, cycles, permutation invariance |
| `tests/skopeo-deadline-engine.test.js` | Civil dates, leap/year boundaries, allowlisted rules, inclusivity, timezone, business-calendar abstention |
| `tests/skopeo-truth-store.test.js` | Pointer-last pages, reverse dependencies, source/partition purge, absence proof, fault injection, recovery |
| `tests/skopeo-truth-runtime.test.js` | Boot/import/recovery order, real citations binder, graph invalidator, frozen facade, Phase 54 freshness, content/MCP closure |
| `tests/skopeo-truth-evals.test.js` | End-to-end deterministic structural/security corpus and separate expert status |

### Recommended deterministic fixture inventory

Create a dedicated `tests/fixtures/skopeo-truth-evals/` corpus with at least:

1. executed/effective active base agreement;
2. newer unsigned draft that cannot govern;
3. partial amendment changing one clause while another inherits from base;
4. explicit full replacement;
5. two conflicting amendments to the same clause;
6. missing or conflicting execution evidence;
7. unreadable/inaccessible source blocking clearance;
8. all nine exact fact/assertion types;
9. conflicting effective/expiration/notice facts;
10. calendar-day notice deadline across leap day/year boundary;
11. business-day rule without a calendar;
12. business-day rule with an explicit immutable calendar;
13. missing/conflicting timezone or boundary semantics;
14. filename/label/prompt-injection precedence spoof;
15. source revocation during computation;
16. target record/generation or candidate-overlay drift;
17. pointer-last/reverse-dependency crash recovery;
18. unsupported rule/operator abstention;
19. exact-limit and max-plus-one source/record/relation/citation/result cases;
20. cross-account/corpus/family isolation.

Synthetic fixtures can prove deterministic behavior and security. They do not prove real contract-domain completeness.

### Requirement-to-test map

| Requirement | Automated proof | Human proof |
|-------------|-----------------|-------------|
| TRUTH-02 | Four-axis schema and executed/draft/historical/replacement fixtures | Counsel/legal operations confirm axis interpretation on representative contracts |
| TRUTH-03 | Partial overlay, inheritance, full replacement, rename/order invariance | Expert verifies governing clause paths and amendment scope |
| TRUTH-04 | Conflict, missing, unreadable, inaccessible, cycle, stale, and over-cap abstention | Expert confirms ambiguous cases are not over-cleared |
| TRUTH-06 | Typed lifecycle assertions and citation round trips | Exact dates checked against approved source corpus |
| TRUTH-07 | Notice window/deadline/method/address typed assertions | Exact notice clauses and addresses checked by legal operations |
| TRUTH-08 | Pure rule/date tests with exact inputs, boundary, timezone, and output | Expert confirms encoded rule matches clause semantics |
| TRUTH-09 | Citation forgery/currentness/access and trust-state tests | Live source navigation and exact location verification |
| TRUTH-11 | Conflict/access/rule blockers force ineligible output | Expert confirms no low-quality case appears cleared |

### Nyquist sampling cadence

- After every pure schema/adjudicator/deadline task: run the directly owned Node test and `node --check` on changed JavaScript.
- After every store task: run `skopeo-truth-store`, `skopeo-corpus-store`, and the affected graph-store/query regression.
- After every runtime task: run `skopeo-truth-runtime`, `skopeo-graph-runtime`, `skopeo-corpus-runtime`, and the storage-boundary verifier.
- Create `npm run test:skopeo-truth-evals` only in the final integration plan; from then on it is mandatory for every repair and phase gate.
- Final Phase 56 focused gate:

  `npm run test:skopeo-graph-evals && npm run test:skopeo-truth-evals && node scripts/verify-skopeo-storage-boundary.mjs && npm run validate:extension`

- Final repository gate: `npm test`.
- Keep focused task latency below 30 seconds; split a fixture runner if it exceeds that bound.

Phase 55 verification records an intermittent Chrome DevTools startup timeout in full-suite order even though isolated browser runs passed. If it recurs, report it separately and retain the focused Phase 56 results; do not weaken or remove `skopeo-browser-contract`, and do not call the repository-wide gate green until the startup discrepancy is reconciled. [VERIFIED: `55-VERIFICATION.md`; `55-HUMAN-UAT.md`]

### Wave 0 assets

The first owning plan should create the RED contracts for:

- truth schema/citation/assertion/rule IDs;
- exact-set graph snapshot;
- pure lineage adjudicator;
- pure civil-date/deadline engine;
- truth store and real citations binder;
- runtime/facade integration;
- truth fixture manifest/cases and aggregate command.

Each implementation plan must own its core oracle. Do not defer all semantic checks to the final eval plan.

### Human-only evidence

Keep three evidence classes separate:

1. deterministic structural/security: automated;
2. provisional regression labels: automated against synthetic/redacted expected data, explicitly not gold;
3. legal/domain fidelity: `human_needed` until real counsel/legal-operations/evaluation approval is recorded.

The Phase 55 fixture expert adjudication and live Chrome/Drive UAT remain unresolved human evidence. Phase 56 tests must not convert those pending labels into approved truth. [VERIFIED: `55-VERIFICATION.md`; `55-HUMAN-UAT.md`]

## Recommended Plan Sequence

### Plan 56-01 — Closed truth and deadline language

Deliver:

- truth candidate/assertion/citation/conflict/snapshot schema;
- locally derived IDs and canonical encodings;
- closed deadline-rule schema;
- pure civil-date arithmetic;
- RED/GREEN schema and deadline tests.

This plan fixes every durable shape and cap before storage/provider/runtime work.

### Plan 56-02 — Complete exact-set graph snapshot and source-local candidates

Deliver:

- graph query/engine exact-set snapshot;
- source access/currency projection;
- source-local configured-provider truth candidate extraction;
- endpoint/evidence/version validation;
- no-model-ranking and no-label-parsing tests.

If a separate AI specification is produced, it should govern this plan.

### Plan 56-03 — Deterministic lineage, facts, conflicts, and eligibility

Deliver:

- document-family formation;
- four-axis state;
- base/full-replacement/partial-overlay algorithm;
- typed fact applicability and conflict sets;
- deadline proof and alert-eligibility blockers;
- permutation, hostile, ambiguous, and boundary tests.

This plan should be pure and storage-free.

### Plan 56-04 — Immutable truth store and real citations purge ownership

Deliver:

- immutable pages, journals, active controls;
- source/family reverse dependencies;
- pointer-last publication;
- source/partition purge plus absence proof;
- graph-change invalidator;
- bounded MV3 recovery;
- storage fault/restart tests.

### Plan 56-05 — Trusted runtime facade and evaluation closure

Deliver:

- background import/construction/recovery order;
- real `citations` binder with empty `counts`/`alerts`;
- one frozen minimized truth facade;
- static private-boundary extensions;
- truth eval fixtures/aggregate/package registration;
- regression and honest human-evidence ledger.

Plans 56-02 and 56-04 can share Wave 2 only after 56-01 fixes the schemas. Plan 56-03 depends on the exact snapshot/candidate contract. Runtime integration is last.

## Common Pitfalls

### Treating graph candidates as governing facts

`amends-candidate` and `fact` records establish only validated candidates. Require the Phase 56 typed/evidence contract and deterministic adjudicator.

### Using absence as proof of unsigned or superseded

Missing execution evidence is `unknown`/review-required. A later date or missing signature label cannot prove a draft or displacement.

### Calling an authorized subset complete

If any selected source is non-ready, missing from certification, stale, or over cap, the whole governing computation closes. Never recompute a base as governing merely because its amendment was revoked and silently omitted.

### Invalidating only on corpus purge

Graph generation replacement and candidate-overlay changes can stale truth without a Phase 54 source purge. Add the explicit graph mutation invalidator.

### Deleting only one side of a reverse dependency

A multi-source snapshot remains reachable if sibling indexes or the family control survive. Clear the active pointer first and prove all dependency paths absent.

### Conflating fact trust with source access

An extracted claim can become inaccessible; that does not turn it into a low-confidence extracted fact. Remove/withhold its influence and report access separately.

### Letting a model calculate dates

The model may identify a cited rule and typed inputs. Only the local allowlisted rule engine calculates output dates.

### Hidden date defaults

`Date.parse`, local-midnight constructors, `toISOString`, browser locale, and implicit UTC can shift dates. Use civil dates and explicit timezone evidence.

### Overclaiming deterministic fixtures

Automated exactness proves implementation behavior against approved fixtures only. Until real experts approve labels and clause interpretations, report domain fidelity as `human_needed`.

### Accidentally building later phases

Do not add HUD rendering, free-form ask, Document 10/memo policy, alarm scheduling, notification delivery, recipients, or notification ledgers.

## Planning Resolutions and Remaining Judgment

The locked context leaves enum spelling, prefixes, caps, key layout, operator names, and calendar subset to implementation. The planner should resolve them in Plan 56-01 and keep them versioned.

One substantive architecture decision should be explicit in the plan:

- Phase 56 needs a new closed source-local candidate contract because the current graph record shape cannot encode exact typed facts or lineage/deadline semantics.

This research recommends a dedicated truth extractor using the existing provider/authority patterns. If the planner instead extends the Phase 55 graph extraction envelope, it must:

- bump graph schema/prompt versions;
- force exact source-generation replacement;
- preserve the old closed graph API or migrate every consumer/test;
- keep typed assertions in the truth store rather than turning graph labels into authority;
- still use deterministic adjudication.

The dedicated Phase 56 extractor has the smaller compatibility and migration surface.

## Codebase Evidence

Primary local sources reviewed:

- `.planning/milestones/v1.2.0-SKOPEO-phases/56-governing-lineage-evidence-deadline-engine/56-CONTEXT.md`
- `.planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md`
- `.planning/milestones/v1.2.0-SKOPEO-ROADMAP.md`
- `.planning/milestones/v1.2.0-SKOPEO-STATE-SNAPSHOT.md`
- Phase 54 context, research, plans/summaries, patterns, validation, verification, and UAT artifacts
- Phase 55 context, research, plans/summaries, patterns, AI specification, validation, security, review, verification, and UAT artifacts
- `extension/utils/skopeo-corpus-schema.js`
- `extension/utils/skopeo-corpus-store.js`
- `extension/utils/skopeo-drive-authority.js`
- `extension/utils/skopeo-corpus-controller.js`
- `extension/utils/skopeo-graph-schema.js`
- `extension/utils/skopeo-graph-store.js`
- `extension/utils/skopeo-graph-extractor.js`
- `extension/utils/skopeo-graph-query.js`
- `extension/utils/skopeo-graph-engine.js`
- `extension/background.js`
- `scripts/verify-skopeo-storage-boundary.mjs`
- Phase 54/55 corpus, graph, runtime, evaluation, storage, authority, and browser tests
- `package.json`

No repository `AGENTS.md`, project-local `.codex/skills/**/SKILL.md`, or project-local `.agents/skills/**/SKILL.md` was present.

## Ready for Planning

Phase 56 has a clear implementation path and no repository-level architecture blocker:

- authority and exact-set certification already exist;
- graph identities, versions, candidate relations, and byte-range evidence already exist;
- provider cancellation and configured-provider boundaries already exist;
- immutable pointer-last storage and authorized purge patterns already exist;
- the missing work is a closed typed truth candidate contract, deterministic adjudication/date logic, truth persistence/invalidation, and private runtime integration.

The highest-risk planning items are the exact-set completeness contract, source-local typed candidate schema, graph-change invalidation hook, multi-source reverse-dependency purge, and strict separation of deterministic structural proof from expert legal/domain approval. They should be explicit must-haves, not left to final integration.
