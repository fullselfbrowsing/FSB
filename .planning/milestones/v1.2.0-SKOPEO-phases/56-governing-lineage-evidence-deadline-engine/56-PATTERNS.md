# Phase 56 Pattern Map

**Phase:** Governing Lineage, Evidence, and Deadline Engine  
**Mapped:** 2026-07-23  
**Scope:** Backend-only deterministic truth derivation over a Phase 54-authorized Phase 55 exact-set graph snapshot  
**Primary analogs:** Phase 55 graph schema/query/store/engine, Phase 54 corpus authority/purge boundary, and their focused/runtime/evaluation tests

## 1. Non-negotiable architecture boundary

Phase 56 is a new backend truth domain. It consumes an exact Phase 55 graph snapshot under fresh Phase 54 authority and emits immutable, citation-bound family conclusions. It does not extend graph search into governance inference and does not expose source text or model output to a UI.

Keep these boundaries explicit in every new or modified file:

- Governance may derive only from exact executed/effective evidence plus explicit admissible lineage.
- Filename, URL, recency, similarity, result order, confidence, source count, and majority agreement are never authority signals.
- Partial amendments are clause overlays. Untouched clauses inherit from the base; unclear targets become `review-required`.
- Execution status, temporal status, lineage role, and governance conclusion remain separate axes.
- Model work is source-local candidate extraction only. A deterministic pure adjudicator makes the family decision. There is no second model pass.
- Assertions are typed and immutable: signed, effective, expiration, termination, renewal, notice-window, notice-deadline, delivery-method, and written-address.
- Claim trust is exactly `extracted`, `inferred`, `ambiguous`, `unreadable`, or `review-required`. Access and currentness are separate.
- Conflicting evidence is retained. Only accepted lineage determines applicability.
- Deadline arithmetic is pure civil-date arithmetic. No `Date.parse`, browser locale, implicit UTC, arbitrary JavaScript expressions, or model arithmetic.
- Business-day evaluation requires an explicit immutable governing calendar. Its absence is a blocker, not permission to guess.
- A result keeps anchor date, window start, deadline, boundary, timezone, consequence, eligibility, and blockers distinct.
- Every active family is bound to the complete authorized source set and all relevant source fingerprints, fragment generations, record/relation versions, extractor versions, rule versions, and calendar versions.
- Any graph change first withdraws every affected family synchronously. Recalculation may follow, but stale conclusions must not remain visible.
- The real `citations` purge participant owns all Phase 56 influence. `counts` and `alerts` stay empty.
- The background truth facade is frozen and minimized. It becomes visible only after corpus, graph, and truth recovery finish.
- No Phase 56 module enters content-script injection, HUD/rendering, ask/policy, alerting, scheduling, notification, or MCP paths.

## 2. File classification

| File | Action | Pattern owner / responsibility |
|---|---|---|
| `extension/utils/skopeo-truth-schema.js` | Create | Descriptor-safe parsing, closed enums, canonical IDs, evidence citations, immutable records |
| `extension/utils/skopeo-truth-extractor.js` | Create | Source-local candidate extraction using the existing provider/session discipline |
| `extension/utils/skopeo-lineage-adjudicator.js` | Create | Pure, deterministic lineage and clause-overlay adjudication |
| `extension/utils/skopeo-deadline-engine.js` | Create | Pure civil-date parsing and closed deadline-rule evaluation |
| `extension/utils/skopeo-truth-store.js` | Create | Immutable family snapshots, pointer-last publication, reverse dependencies, recovery, `citations` participant |
| `extension/utils/skopeo-truth-engine.js` | Create | Fresh authorized-set orchestration, cancellation/currentness fences, minimized facade projections |
| `extension/utils/skopeo-graph-query.js` | Modify | Add a complete, capped, deterministic exact-set snapshot operation |
| `extension/utils/skopeo-graph-engine.js` | Modify | Expose the snapshot through the fresh Phase 54 authority path and invoke truth invalidation before graph publication |
| `extension/utils/skopeo-graph-store.js` | Modify narrowly | Carry the graph mutation invalidation seam without teaching truth code to read graph storage |
| `extension/background.js` | Modify | Import, construct, register, recover, and expose the private truth runtime in locked order |
| `scripts/verify-skopeo-storage-boundary.mjs` | Modify | Extend the existing literal-closure and private-boundary verifier for truth modules |
| `tests/skopeo-truth-schema.test.js` | Create | Hostile-input, canonicalization, API parity, citation-binding tests |
| `tests/skopeo-deadline-engine.test.js` | Create | Civil-date, rule, timezone/boundary, calendar, and environment-invariance tests |
| `tests/skopeo-truth-extractor.test.js` | Create | Provider choreography, candidate-only output, repair/cancel/currentness tests |
| `tests/skopeo-lineage-adjudicator.test.js` | Create | Lineage, overlay, conflict, abstention, and permutation-invariance tests |
| `tests/skopeo-truth-store.test.js` | Create | Pointer-last, reverse-dependency, purge, crash, and recovery tests |
| `tests/skopeo-truth-runtime.test.js` | Create | Background order, authority, invalidation, facade, and static negative-mutation tests |
| `tests/skopeo-truth-evals.test.js` | Create | Fixture-driven deterministic/provisional/domain-fidelity reporting |
| `tests/skopeo-graph-query.test.js` | Modify | Exact-set snapshot completeness, caps, drift, sorting, and byte-limit coverage |
| `tests/skopeo-graph-store.test.js` | Modify | Invalidation-before-publication and failure/recovery coverage |
| `tests/skopeo-graph-runtime.test.js` | Modify | New graph facade method and truth invalidator orchestration |
| `tests/lattice-provider-bridge-smoke.test.js` | Modify if observed count changes | Refresh only the exact background import-token/call-site pin affected by new imports |
| `tests/fixtures/skopeo-truth-evals/manifest.json` and cases | Create | Synthetic/redacted corpus with at least 20 locked scenarios |
| `package.json` | Modify | Add one focused truth aggregate and invoke it once from normal test execution |

Do not add a second storage abstraction, provider selector, static verifier, test runner, or background authority mechanism.

## 3. Truth schema and citation pattern

### Closest repository analog

`extension/utils/skopeo-graph-schema.js` is the exact structural model:

- classic-script IIFE plus CommonJS export;
- a frozen, versioned API;
- null-prototype frozen output records;
- `Reflect.ownKeys` and own data-descriptor validation;
- exact key sets, dense arrays, strict caps, and no getter execution;
- length-prefixed tuple encoding followed by native WebCrypto hashing;
- stable IDs separated from version IDs;
- byte-exact evidence locators bound to partition, source, fingerprint, and fragment generation.

Retain that shell rather than introducing classes, mutable schema instances, `JSON.stringify`-as-canonicalization, or permissive object spreading.

```js
(function(global) {
  'use strict';

  var VERSION = 'skopeo-truth-schema/1';

  function dataValues(value, expectedKeys) {
    if (!isPlainRecord(value)) return null;
    var actualKeys = Reflect.ownKeys(value);
    // Require the exact string-key set and enumerable own data descriptors.
    // Never access unvalidated properties through ordinary reads.
  }

  function frozenRecord(entries) {
    var output = Object.create(null);
    // Define validated values, then freeze.
    return Object.freeze(output);
  }

  var api = Object.freeze({ /* versions, limits, parsers, ID derivation */ });
  global.FsbSkopeoTruthSchema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

### Phase 56 schema split

The schema should parse and canonicalize separate record families rather than one overloaded “truth” object:

1. Source-local candidate records:
   - execution/effect candidates;
   - explicit lineage assertions and target scope;
   - the nine fact kinds;
   - closed deadline-rule candidates;
   - evidence handles only.
2. Deterministic adjudication records:
   - family membership;
   - accepted/rejected lineage edges with reasons;
   - clause overlay/inheritance map;
   - preserved conflicts;
   - four independent status axes;
   - abstention/review blockers.
3. Deadline evaluations:
   - rule and immutable calendar versions;
   - anchor, window start, deadline, boundary, timezone, consequence;
   - eligibility and sorted blockers.
4. Durable family snapshot metadata:
   - complete authorized-set digest;
   - every source fingerprint and fragment generation;
   - record and relevant relation versions;
   - candidate/extractor/prompt/provider/model bindings;
   - adjudicator, deadline, and calendar versions;
   - page hashes and active control version.

Closed enums and exact shapes belong in the schema module. Algorithms and storage do not silently extend them.

### Stable IDs versus version IDs

Follow the Phase 55 distinction:

- A stable family/assertion identity excludes mutable source fingerprint, mutable label text, and timestamps.
- A version identity includes every input whose change can alter the conclusion.
- An active snapshot ID includes the exact authorized-set digest and all algorithm/rule/calendar versions.
- Length-prefix every tuple field before hashing to prevent concatenation ambiguity.
- Use native WebCrypto only; fail closed when unavailable.

### Citation contract

The graph evidence locator is the closest exact analog, but a truth citation must bind more:

```text
partition key
source file identity
source fingerprint/revision
fragment generation
record version
optional relation version
locator kind and canonical locator fields
exact source byte start/end
```

The citation may also carry display metadata, but filename and URL must never participate in authority or applicability. Byte ranges require `start < end` and must point to the exact UTF-8 evidence bytes. Navigation later revalidates the citation against fresh authority; a durable citation is not itself an access grant.

Keep source access/currentness outside the claim-trust enum. A perfectly extracted claim can be inaccessible or stale, and an accessible claim can remain ambiguous.

## 4. Source-local truth extractor pattern

### Closest repository analog

`extension/utils/skopeo-graph-extractor.js` supplies the production choreography:

- exact dependency injection;
- `WeakMap` session state and one-use certificates;
- fresh settings/provider binding on every operation;
- content delivered through a one-use sink;
- bytes and fingerprint checked before segmentation;
- raw source text dropped after deterministic preparation;
- one provider request at a time with fixed timeout and output caps;
- bare JSON parsing followed by schema and semantic validation;
- at most one repair for JSON/schema failure;
- cancellation/currentness checks after every await;
- final output acknowledged as provider-no-storage.

Use that lifecycle for `skopeo-truth-extractor.js`. Do not reuse the graph prompt or graph output schema.

### Candidate-only output

The truth prompt and semantic validator must reject outputs that:

- choose the governing document or clause;
- compare/rank sources;
- use filenames, URLs, recency, similarity, confidence, or majority;
- perform deadline arithmetic;
- manufacture source, record, relation, citation, family, or snapshot IDs;
- return raw source text, source URLs, executable code, or arbitrary expressions;
- collapse ambiguity or conflicting facts into one answer.

Permitted outputs are only source-local candidates grounded in engine-issued evidence handles:

- execution/effect observations;
- explicit lineage language and target scope;
- one of the nine typed facts;
- a closed deadline-rule candidate;
- the exact engine-issued evidence handles supporting each candidate.

The trusted parser/adjudicator—not the model—assigns claim-trust states and blocker
codes. Source access/currentness determines `unreadable` or unavailable states; a
model may not promote its own confidence or ambiguity label into those outcomes.

The extractor does not read graph labels as facts. It receives source bytes under a fresh authority certificate and may receive engine-issued locator handles that it can only echo in validated positions.

### Session lifecycle

Mirror the graph extractor’s state machine conceptually:

```text
prepare source under fresh authority
→ issue opaque extraction session
→ request capped source-local batches
→ optionally repair one malformed batch
→ finalize immutable normalized candidates
→ consume session/certificate
→ discard raw provider response and prepared text
```

No candidate becomes durable until the pure adjudicator accepts it into a version-bound family snapshot.

## 5. Exact-set graph snapshot pattern

### Closest repository analog

There is no existing complete graph snapshot API. The closest path is:

```text
graph-engine queryOperation
→ runCorpusOperation with one/set authority
→ currentFragments(certificates)
→ graph-query createScope({ partitionKey, exactSourceGenerations })
→ ensureScopeCache(scope)
→ query method
→ fresh currentness fence
→ releaseScope(scope)
```

`skopeo-graph-query.js` already rebuilds its cache exclusively from `readCurrentFragment` and `readActiveShards`, rejects capped totals, admits only endpoint-current cross-document relations, and rechecks currentness before returning. Extend this mechanism with a complete exact-set snapshot; do not assemble truth inputs by calling search repeatedly.

### Required snapshot behavior

The new operation should:

- accept only the existing opaque exact-source-generation scope;
- enumerate all current records, endpoint-current relations, evidence locators, and source-state bindings for the set;
- sort every collection by canonical ID;
- retain complete version/evidence tuples rather than minimized search projections;
- compute a canonical authorized-set digest;
- enforce independent source, record, relation, evidence, and whole-result byte caps;
- return no partial result when any cap, parse, hash, or currentness check fails;
- perform the same currentness sandwich used by live graph queries;
- return a deeply frozen projection.

It must not include lexical scores, inferred ranking, “best” records, filename-derived metadata, or data from sources outside the exact certified set.

### Fresh authority exposure

Add the graph facade method through `skopeo-graph-engine.js`, not through a truth-store graph dependency. The engine must continue to use `runCorpusOperation`, require complete proof for a set, verify the certificate count and exact members, compare current fragment generations before and after the snapshot, and always release the query scope.

The truth engine receives this frozen snapshot from the background-owned graph facade. It never receives the graph store, query cache, or raw corpus storage.

## 6. Pure lineage adjudication pattern

### No exact domain analog

The repository has no governing-document or amendment adjudicator. The closest reusable patterns are the closed, versioned schema conventions and deterministic sorted outputs in graph query. The Phase 56 implementation must therefore keep the new domain logic especially small and pure.

`skopeo-lineage-adjudicator.js` should be a classic/CommonJS frozen module with no storage, Chrome API, provider, clock, graph read, network, or source-access dependency. Its conceptual operation is:

```text
adjudicate(exact-set snapshot, normalized source-local candidates,
           explicit as-of civil date, fixed algorithm versions)
→ frozen family proof or frozen abstention
```

This is a shape, not a license to weaken the exact schema around the eventual method name.

### Deterministic decision sequence

1. Validate that candidates bind exactly to records/evidence in the snapshot.
2. Build family components only from explicit, endpoint-current lineage evidence.
3. Preserve source identity and relation direction.
4. Determine execution axis independently.
5. Determine temporal axis independently from typed facts and the explicit as-of date.
6. Determine lineage role independently: base, full replacement, partial amendment, or unresolved.
7. Reject cycles, dangling targets, conflicting target scope, and unsupported lineage semantics into blockers.
8. Apply full replacements only when their explicit prerequisites pass.
9. Apply partial amendments as clause-level overlays.
10. Inherit untouched base clauses without rewriting the base record.
11. Preserve conflicting assertions and identify why no single governing conclusion is admissible.
12. Emit governance applicability only after the previous independent proofs pass.

Canonical sorting must make the output byte-identical under input permutation. Never break ties with source order, timestamps, labels, confidence, number of supporting sources, or lexical similarity.

The overlay map should name the chosen source record/version for each clause scope and retain its inheritance path. A target that cannot be mapped exactly yields `review-required`; it does not become a broad replacement.

## 7. Pure deadline engine pattern

### No exact domain analog

There is no repository implementation suitable for civil deadline arithmetic. Existing platform dates, alarm usage, and minified schema date validation are not analogs and must not be reused.

`skopeo-deadline-engine.js` should:

- parse strict Gregorian `YYYY-MM-DD` values;
- validate month/day and leap-year rules;
- convert through an integer civil-date/ordinal representation;
- implement a closed dispatch table of supported rule operators;
- add/subtract calendar days without `Date`, locale, or timezone coercion;
- evaluate business days only against an explicit immutable calendar object and version;
- sort blockers and result fields canonically;
- expose a frozen classic/CommonJS API.

Forbidden mechanisms include `Date.parse`, implicit `new Date(string)`, locale formatting/parsing, environment timezone defaults, `eval`, `Function`, dynamic method names, arbitrary formula strings, and model-computed dates.

### Output separation

Do not compress a deadline into one date. The schema keeps at least:

```text
anchor civil date
notice/window start
deadline civil date
boundary convention
explicit timezone, if supplied by admissible evidence/rule
consequence
eligibility
blockers
rule version
calendar version, when used
```

Missing timezone or boundary information remains visible when it affects eligibility. Missing business calendar yields an explicit blocker. Unsupported operators yield abstention/review rather than approximate calculation.

## 8. Immutable truth store pattern

### Closest repository analog

`extension/utils/skopeo-graph-store.js` provides the durable-state template:

- private injected storage;
- opaque mutation guards held in a `WeakMap`;
- serialized mutation lane and checks before/after every await;
- explicit absent/withheld/staging/published/purging/repairing states;
- immutable pages plus hashes;
- journaled mutations;
- active control pointer written last;
- withdrawal that proves payload/cache absence;
- sorted, capped recovery;
- no query-cache hydration during recovery.

The truth store should copy these invariants, not graph-specific key shapes.

### Family publication order

For one family mutation:

```text
1. withdraw the current active family pointer
2. prove no old active read can return family influence
3. write a bounded mutation journal
4. stage immutable assertion/conflict/deadline/citation pages
5. verify hashes, counts, exact input bindings, and dependency symmetry
6. write source→family and family→source reverse-dependency pages
7. write the active family control pointer last
8. clear the journal
```

There is no newest-timestamp scan and no fallback to an older active-looking page. Only the active control names visible immutable pages.

### Reverse dependencies

Phase 55 has no exact source-to-derived-family reverse-dependency structure. Relation overlays store target generations, but that is only a currentness check. Phase 56 requires a true symmetric index:

```text
source identity/version → all family snapshot identities it influences
family snapshot identity → exact sorted source identity/version set
```

Every assertion, conflict, deadline, citation, and governing conclusion from a source counts as influence. Dependency updates are part of the same guarded journaled mutation. Recovery verifies both directions; uncertainty leaves the family hidden.

### Withdrawal and recovery

For a source/graph change, enumerate affected families from the reverse dependency pages and clear every active family control before removing pages or beginning recomputation. Remove sibling dependency entries, clean orphaned pages, and prove that no active family still names the changed source/version.

Recovery runs after graph recovery, uses sorted bounded durable metadata only, and performs no Drive reads, provider calls, graph-query hydration, or timestamp selection. Staging, purging, repairing, malformed, hash-mismatched, or dependency-asymmetric families remain invisible.

## 9. Real `citations` purge participant

### Closest repository analog

`extension/utils/skopeo-corpus-store.js` owns the exact participant protocol:

- seven fixed participant names;
- `registerAuthorizedPurgeParticipant(name, bindParticipant)`;
- a private verifier given to a one-use binder;
- nonserializable capability bound to participant, mode, exact request object, signal, epoch, and mutation;
- fail-closed adapter methods;
- purge callbacks followed by absence proofs before the journal advances.

The truth store supplies the real binder for `citations`. It must not first register an empty participant and later replace it.

The participant owns all Phase 56 influence, not only rows called “citations.” Its source and partition purge methods must withdraw and remove:

- active/staging family controls;
- assertion, conflict, overlay, deadline, and citation pages;
- family journals;
- source→family and family→source dependency pages;
- any derivable truth cache or projection.

`hasOwnedInfluence` returns `owned: true` on error or uncertainty. An absence proof succeeds only when no active or durable Phase 56 object can still be influenced by the purged source/partition.

The established participant ownership remains:

| Participant | Phase 56 binding |
|---|---|
| `fragments` | Phase 55 graph store |
| `indexes` | Phase 55 graph store |
| `citations` | **Phase 56 truth store, real participant** |
| `counts` | authorized empty participant |
| `relationships` | Phase 55 graph store |
| `result-cache` | Phase 55 graph store |
| `alerts` | authorized empty participant |

## 10. Graph-change invalidator

### No exact repository analog

The closest graph mutation patterns are:

- `replaceSource` withdrawing source-owned graph state before provider work;
- `replaceCandidateRelations` requiring complete proof and publishing inside the guarded mutation;
- pointer-last graph-store replacement.

Phase 56 adds a narrow invalidation dependency at this boundary. Before a graph source replacement publishes a new fragment generation, and before a relation-overlay replacement publishes, the graph mutation path must ask the truth store to withdraw all families dependent on the affected source/relation versions.

Conceptual sequencing:

```text
fresh corpus/graph authority
→ begin guarded graph mutation
→ truth invalidator withdraws affected family controls and proves absence
→ graph store publishes source or overlay replacement
→ operation commits
→ a later truth operation may recompute from a new fresh exact-set snapshot
```

Failure, cancellation, stale authority, incomplete dependency enumeration, or an uncertain absence proof prevents graph publication. Do not publish first and enqueue cleanup. Do not make the truth engine poll graph storage. Do not couple invalidation to UI requests.

Keep the dependency narrow and injected. The graph layer should know only a frozen invalidator contract, while the truth store remains the owner of reverse-dependency data and withdrawal mechanics.

## 11. Truth engine and minimized facade

### Closest repository analog

`extension/utils/skopeo-graph-engine.js` supplies the orchestration pattern:

- exact dependency validation;
- one/set source normalization with caps and duplicate rejection;
- `runCorpusOperation` as the authority boundary;
- complete-set proof checks;
- current-fragment comparison;
- opaque graph query scopes released in `finally`;
- stale fences around every await;
- acknowledged effects and provider-no-storage;
- a frozen minimal facade.

`skopeo-truth-engine.js` should compose, not bypass, those layers:

```text
fresh exact authorized source selection
→ fresh graph exact-set snapshot
→ source-local extraction under the same current authority
→ pure lineage adjudication
→ pure deadline evaluation
→ currentness/authorized-set recheck
→ guarded immutable family publication
→ frozen minimized result projection
```

The engine never accepts arbitrary graph records supplied by a caller and never reads graph-store keys directly. It must abort if the authorized set, source fingerprint, fragment generation, relation overlay, extractor settings, rule/calendar version, or operation epoch changes.

The public/background facade should expose only the smallest operations needed to compute/read minimized truth results. It must not expose:

- graph store/query objects or opaque scope internals;
- source bytes or provider request/response payloads;
- raw candidate batches or prompts;
- storage keys, journals, dependency pages, or mutation guards;
- filename/URL authority;
- generic message dispatch;
- content-script or MCP routes.

Returned objects are deeply frozen, capped, and version/citation bound.

## 12. Background construction and recovery order

### Existing anchor

`extension/background.js` already has the marked `FSB_SKOPEO_CORPUS_BOUNDARY_START` block, exact graph-module import chain, private graph facade, seven-participant registration, and corpus→graph recovery order.

Import the six truth modules once, after the Phase 55 graph chain, in dependency order:

```text
skopeo-truth-schema.js
skopeo-truth-extractor.js
skopeo-lineage-adjudicator.js
skopeo-deadline-engine.js
skopeo-truth-store.js
skopeo-truth-engine.js
```

Use the final dependency requirements in the actual constructors; the import order is about classic-script global availability.

### Locked boot sequence

Inside the private marked boundary:

```text
validate dependencies
→ construct corpus store
→ construct graph store/query/extractor
→ construct truth store
→ register all seven purge participants exactly once
   (graph owns four, truth owns citations, counts/alerts are empty)
→ recover corpus durable state
→ recover graph durable state
→ create frozen graph facade
→ recover truth durable state
→ create frozen truth facade
→ publish ready boot state/facades
```

Truth recovery may consume only its durable metadata. It must not hydrate graph queries or fetch sources. Nothing outside the marked boundary references the private truth facade. Neither `CONTENT_SCRIPT_FILES` nor `SKOPEO_INJECTION_FILES` may include a truth module.

## 13. Static verifier extension

Extend `scripts/verify-skopeo-storage-boundary.mjs`; do not create a parallel verifier.

### Reuse the existing checks

Add `TRUTH_MODULE_PATHS` alongside `GRAPH_MODULE_PATHS` and pass truth files through the same checks for:

- direct `chrome.storage`/`browser.storage`;
- dynamic import, `eval`, or `Function`;
- fetch, sockets, databases, or process execution;
- generic graph languages/expression engines;
- embedding/vector/semantic-search infrastructure;
- MCP/tool/server/daemon surfaces;
- Graphify/Python artifacts;
- literal-closure inclusion through manifest/content/injection roots.

### Truth-specific checks

Require the verifier to fail closed when it sees or cannot resolve:

- `Date.parse`, implicit date construction, locale date parsing, alarm/notification scheduling;
- content-script, HUD, ask/policy, or MCP inclusion;
- truth-engine injection of graph store/query/storage rather than the minimized graph facade;
- provider/raw-source access outside the extractor boundary;
- truth imports missing, duplicated, reordered, or placed in an injection root;
- truth store constructed after participant registration;
- an empty `citations` participant;
- nonempty `counts` or `alerts` ownership;
- recovery order other than corpus → graph → graph facade → truth → truth facade;
- truth/graph hydration during boot recovery;
- private truth facade references outside the marked background boundary.

Keep literal parsing strict. An unresolved dynamic root is a verification failure, not a reason to skip closure inspection.

## 14. Focused test patterns

### Schema

Follow `tests/skopeo-graph-schema.test.js`:

- load production source as a classic script in a VM and through CommonJS;
- assert API/global parity and frozen exact exports;
- use null-prototype/frozen outputs;
- ensure hostile getters are never invoked;
- reject sparse arrays, symbols, prototypes, cycles, unknown keys, oversize bytes, malformed dates/ranges, and noncanonical ordering;
- prove stable-ID/version-ID distinctions and length-prefix collision resistance;
- prove citations change when any bound fingerprint/generation/record/relation/byte range changes.

### Exact-set graph snapshot

Extend `tests/skopeo-graph-query.test.js` using the real schema/store/query modules and in-memory storage:

- exact set only; missing or extra source fails;
- complete records/relations/evidence, canonical sorting, frozen output;
- endpoint-current relation filtering;
- source-generation and overlay drift before return;
- source, record, relation, evidence, and result-byte exact-cap/max+1 cases;
- no lexical score or search truncation;
- permutation-identical snapshot digest.

Extend graph runtime/store tests for facade exposure and invalidation-before-publication, including failure at every awaited storage boundary.

### Extractor

Follow `tests/skopeo-graph-extractor.test.js`:

- real production module and schema;
- fake provider/settings/nonce/clock;
- one-use sessions and certificates;
- exact prompt/request caps;
- bare JSON only and one schema repair;
- cancellation/currentness after each await;
- source-local candidate-only output;
- semantic rejection of governing choices, computed dates, IDs, URLs, code, confidence, rankings, and cross-source comparisons;
- raw response/source bytes absent from finalized result and durable store.

### Pure lineage/deadline

Run production pure modules over frozen inputs:

- shuffled object/array/candidate order yields byte-identical results;
- base, full replacement, partial overlay inheritance, conflicting amendments, cycles, dangling targets, and ambiguous scope;
- all four axes remain independent;
- conflicting facts remain present;
- forbidden tie-break signals cannot alter output;
- leap years, month/year boundaries, inclusive/exclusive boundaries, calendar-day rules;
- business day with and without an immutable calendar;
- unsupported operator, missing timezone/boundary, malformed civil date;
- child-process or VM runs under different `TZ`/locale settings produce identical bytes.

### Store, purge, and recovery

Follow graph-store and corpus-store tests:

- real production module with instrumented in-memory storage;
- mutation guard validity before/after every await;
- pointer written last and withdrawn first;
- failure injection at every write/remove/read boundary followed by a fresh-store recovery;
- no staging/repairing family visible;
- symmetric source↔family dependencies;
- a source change withdraws every affected family before graph publication;
- `citations` purge removes all truth influence and proves absence;
- errors/uncertainty return owned influence;
- partition/account/corpus isolation;
- no recovery graph hydration, provider call, or source fetch.

### Runtime/static

Follow `tests/skopeo-graph-runtime.test.js`:

- exact import and construction/recovery traces;
- exact seven participant bindings;
- frozen minimal truth facade;
- fresh one/set authority and complete-set proof;
- revocation during extraction, adjudication, deadline evaluation, and publication;
- graph generation/overlay/authorized-set drift;
- no content/MCP/private-facade exposure;
- static verifier `sourceOverrides` negative mutations for each new forbidden boundary.

## 15. Evaluation fixtures

Create a synthetic/redacted, versioned fixture manifest with at least these 20 cases:

1. Executed/effective base is governing.
2. Newer unsigned document is not authority.
3. Partial amendment overlays one clause and inherits untouched clauses.
4. Explicit full replacement.
5. Conflicting amendments.
6. Missing or conflicting execution evidence.
7. Unreadable or inaccessible source.
8. Coverage of all nine assertion kinds.
9. Conflicting lifecycle/notice facts.
10. Calendar-day deadline across leap/month/year boundaries.
11. Business-day rule with missing calendar.
12. Business-day rule with explicit immutable calendar.
13. Missing timezone or boundary convention.
14. Filename, label, prompt, and recency spoof attempts.
15. Authority revocation during computation.
16. Authorized-set, fragment-generation, or relation-overlay drift.
17. Pointer/reverse-dependency crash recovery.
18. Unsupported deadline operator.
19. Exact-limit and max+1 rejection cases.
20. Cross-account, corpus, partition, and family isolation.

The manifest should be ordered by stable case ID and bind fixture, schema, extractor/prompt, adjudicator, deadline, and calendar versions. Cases contain only synthetic/redacted text and recorded candidate responses. Network access and LLM judging remain disabled.

Report the three review dimensions separately:

```text
deterministic_structural_security: pass|fail
provisional_regression: pass|fail (not gold)
domain_fidelity: human_needed|approved|rejected
```

Automated fixtures never promote provisional expectations to domain truth. Representative approval records must name genuine reviewer roles and bind the exact fixture and algorithm versions, including commercial-contract counsel, legal operations, source-system stewardship, privacy/security, and evaluation ownership as applicable.

## 16. Package wiring

Follow the existing direct Node-chain style in `package.json`.

- Add `test:skopeo-truth-evals`.
- Run every focused Phase 56 test exactly once in a stable order.
- Invoke that aggregate exactly once from the normal `test` chain, after the graph aggregate.
- Keep `validate:extension` as the static-verifier owner instead of duplicating it inside several tests.
- Add no runner or dependency.
- If new background imports change the exact pin in `tests/lattice-provider-bridge-smoke.test.js`, update the pin from observed source counts only.

Recommended aggregate order:

```text
truth schema
→ deadline engine
→ graph exact-set snapshot coverage
→ truth extractor
→ lineage adjudicator
→ truth store
→ truth runtime
→ truth fixtures/evaluation report
```

## 17. Assignment and sequencing map

The implementation dependencies are:

```text
truth schema
├── truth extractor
├── lineage adjudicator
├── deadline engine
└── truth store

graph query exact-set snapshot
└── graph engine fresh facade method

truth schema + extractor + adjudicator + deadline
+ graph exact-set facade + truth store
└── truth engine

truth store reverse dependencies
+ graph mutation boundary
└── graph-change invalidator

all production modules
└── background recovery/facade
    ├── static verifier extension
    ├── runtime tests
    └── fixture aggregate/package wiring
```

Safe implementation waves:

1. Truth schema and pure deadline engine, with focused tests.
2. Graph exact-set snapshot and source-local extractor, with focused tests.
3. Pure lineage adjudicator and deadline integration, with permutation and abstention coverage.
4. Truth store, real `citations` participant, reverse dependencies, graph invalidation, and crash recovery.
5. Truth engine, background facade/recovery, static verifier, runtime/evaluation fixtures, and package aggregate.

This sequencing preserves the locked backend boundary: deterministic pure modules and exact-set evidence exist before durable publication or runtime exposure is added.
