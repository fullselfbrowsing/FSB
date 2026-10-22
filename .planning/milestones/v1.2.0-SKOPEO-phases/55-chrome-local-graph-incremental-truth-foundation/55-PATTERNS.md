# Phase 55: Chrome-Local Graph & Incremental Truth Foundation - Pattern Map

**Mapped:** 2026-07-21
**Proposed files classified:** 18
**Files with repository analog assignments:** 18 / 18
**Exact graph-domain analogs:** 0 — Phase 55 is the first graph substrate; the assignments below compose proven corpus, authority, provider, search, and runtime-boundary patterns.

## Scope Guardrails

- All graph implementation modules are private service-worker classic scripts. They must not enter `CONTENT_SCRIPT_FILES`, `SKOPEO_INJECTION_FILES`, manifest content scripts, a page bridge, or a generic storage/message proxy.
- Phase 55 adds no UI, graph explorer, arbitrary graph language, embeddings, external graph service, Python runtime, daemon, database, MCP server, or MCP tool family.
- Use Graphify as documented conceptual influence only. Research found no upstream code worth copying; the copied-code inventory should remain empty.
- Phase 56+ owns governing precedence, amendment adjudication, facts/deadlines, lineage conclusions, citations/counts/alerts, and presentation. Phase 55 may preserve empty purge proofs or adapter seams for those consumers but must not implement their semantics.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog(s) | Match Quality |
|---|---|---|---|---|
| `extension/utils/skopeo-graph-schema.js` | model / utility | transform, canonicalization | `extension/utils/skopeo-corpus-schema.js` | strong role + trust-boundary match |
| `extension/utils/skopeo-graph-store.js` | store / service | CRUD, batch, recovery, pub-sub purge | `extension/utils/skopeo-corpus-store.js`; `extension/utils/trusted-local-feature-store.js` | strong role + storage-flow match |
| `extension/utils/skopeo-graph-extractor.js` | service / provider coordinator | request-response, transform, batch | `extension/utils/skopeo-drive-corpus-transport.js`; `extension/utils/skopeo-drive-authority.js`; `extension/utils/skopeo-drive-reconciler.js` | composed role match |
| `extension/utils/skopeo-graph-query.js` | service / utility | bounded request-response reads | `extension/utils/capability-search.js`; Phase 54 corpus facade in `extension/background.js` | composed role match |
| `extension/utils/skopeo-graph-engine.js` | controller / facade | event-driven orchestration, request-response | `runSkopeoCorpusOperation` and `createSkopeoCorpusKernel` in `extension/background.js`; `skopeo-drive-reconciler.js` | strong orchestration match |
| `extension/ai/universal-provider.js` | provider | network request-response, retry/cancellation | its existing `fetchWithTimeout` / `sendRequest`; `guardedAwait` in `skopeo-drive-authority.js` | exact modification site + cancellation role match |
| `extension/background.js` | boot config / controller | ordered loading, recovery, event-driven facade | existing Phase 54 corpus boundary and facade blocks | exact modification site |
| `scripts/verify-skopeo-storage-boundary.mjs` | static gate | file-I/O, dependency-closure analysis | its existing literal-root/closure scanner | exact modification site |
| `README.md` | provenance documentation | file-I/O | existing `Acknowledgements` section | exact documentation seam |
| `tests/skopeo-graph-schema.test.js` | unit / hostile-data test | transform | `tests/skopeo-corpus-schema.test.js` | strong test-role match |
| `tests/universal-provider-cancellation.test.js` | unit / async-race test | request-response, cancellation | `tests/universal-provider-lmstudio.test.js`; cancellation cases in `tests/skopeo-drive-authority.test.js` | composed test match |
| `tests/skopeo-graph-store.test.js` | unit/integration / recovery test | CRUD, batch, injected failure | `tests/skopeo-corpus-store.test.js` | exact test-flow match |
| `tests/skopeo-graph-extractor.test.js` | unit/integration / hostile-provider test | request-response, transform | `tests/skopeo-drive-authority.test.js`; `tests/skopeo-drive-corpus-transport.test.js` | strong test-flow match |
| `tests/skopeo-graph-query.test.js` | unit / deterministic read test | bounded request-response | `tests/capability-search-eval.test.js`; corpus facade cases in `tests/skopeo-corpus-runtime.test.js` | strong test-flow match |
| `tests/skopeo-graph-runtime.test.js` | integration / static boundary test | boot, recovery, facade | `tests/skopeo-corpus-runtime.test.js` | exact test-role match |
| `tests/skopeo-graph-evals.test.js` | deterministic eval / regression gate | fixture batch | `tests/capability-search-eval.test.js`; failure matrix in `tests/skopeo-corpus-store.test.js` | role match |
| `tests/fixtures/skopeo-graph-evals/` (manifest + 37 immutable cases) | fixture/config data | batch | `catalog/descriptors/_fixtures/` consumed by `tests/capability-search-eval.test.js` | role match |
| `package.json` | config | batch test dispatch | existing `scripts.test` / `validate:extension` entries | exact modification site |

## Analog Family 1 — Closed Plain-Data Schema, Stable Keys, and Frozen APIs

**Primary analog:** `extension/utils/skopeo-corpus-schema.js`
**Applies to:** `skopeo-graph-schema.js`, schema-facing portions of store/extractor/query, and `skopeo-graph-schema.test.js`.

### Module shell and dual export

Use the same classic-script IIFE and expose one frozen API to both the service worker and Node tests (`skopeo-corpus-schema.js:1-4`, `608-629`):

```js
(function(global) {
  'use strict';

  var VERSION = 'skopeo-corpus-schema/v1';
  // ... private implementation ...
  var api = Object.freeze({
    VERSION: VERSION,
    // exact closed surface
  });
  global.FsbSkopeoCorpusSchema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

For Phase 55, mirror this as one `FsbSkopeoGraphSchema` object. Do not export validator internals, mutable vocabularies, storage helpers, or raw model schemas as mutable objects.

### Descriptor-safe exact records

Copy the *structure* of `isPlainRecord`, `dataValues`, `dataArrayValues`, and `frozenRecord` (`skopeo-corpus-schema.js:104-177`):

```js
function dataValues(value, expectedKeys) {
  if (!isPlainRecord(value)) return null;
  var actualKeys = Reflect.ownKeys(value);
  if (actualKeys.length !== expectedKeys.length || actualKeys.some(function(key) {
    return typeof key !== 'string';
  })) return null;
  // compare the exact key set, then read only enumerable own data descriptors
  var descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) return null;
}

function frozenRecord(entries) {
  var record = Object.create(null);
  // copy admitted fields only
  return Object.freeze(record);
}
```

Apply this twice: first to graph/durable inputs, then after Draft 2020-12 validation to model candidate semantics. JSON Schema is not a replacement for own-key, prototype, accessor, ownership, reference, endpoint, or locator checks.

### Collision-safe tuple namespaces and canonical hashes

Copy the length-prefixed tuple approach, not delimiter joins (`skopeo-corpus-schema.js:195-265`):

```js
function encodeTuple(prefix, values) {
  var output = prefix;
  for (var index = 0; index < values.length; index += 1) {
    output += String(values[index].length) + ':' + values[index];
  }
  return output;
}
```

The graph namespace should derive:

- fragment generation identity from schema version + exact partition + source + content fingerprint;
- stable record identity from identity version + exact partition + source + closed kind + stable locator/local key;
- record-version identity from stable record ID + fragment generation ID.

Follow D-02 precisely: do not place content fingerprint in the stable record ID, and never use a model ID, label, normalized name, or similarity score as identity. Retain full ownership tuples beside every digest and reparse/compare them on read.

For hashes, copy bounded canonicalization followed by native Web Crypto (`skopeo-corpus-schema.js:267-360`). Invalid depth, count, type, accessor, cycle, or missing crypto returns `null`; there is no weak-hash fallback.

### Vocabulary and provenance parsing

Follow the source-record parser shape (`skopeo-corpus-schema.js:533-605`): parse every nested record through its own closed parser, compare the partition/source tuple to the enclosing record, enforce state/visibility invariants, then construct a new frozen null-prototype record.

The Phase 55 parser must additionally enforce:

- exactly eight kinds and seven initial predicates from `55-AI-SPEC.md`;
- the predicate endpoint matrix;
- candidate-reference uniqueness and no dangling/cross-batch unresolved reference;
- one-to-four evidence locators, exact excerpt ownership, `start < end`, exact byte resolution, and exact current fingerprint;
- no confidence, governing/clearance, executable, URL/tool/callback, prototype, or unknown field.

### Test analog

Copy `tests/skopeo-corpus-schema.test.js:31-60` and `147-177` for global/CommonJS parity, frozen exact surface, VM classic-script evaluation, and getter non-execution:

```js
delete globalThis.FsbSkopeoCorpusSchema;
const schema = require(SCHEMA_PATH);

function assertRejectedWithoutGetter(parser, fixture, key, label) {
  let reads = 0;
  Object.defineProperty(hostile, key, { enumerable: true, get() { reads += 1; } });
  assert.equal(parser(hostile), null);
  assert.equal(reads, 0);
}
```

Also mirror the collision/confusable/max-plus-one corpus at `skopeo-corpus-schema.test.js:180-257` and the bounded canonicalization cases at `528-585`. Add exact determinism/isolation checks for all graph ID dimensions, all kinds/predicates, endpoint pairs, evidence spans, and stable-ID-versus-generation-ID behavior.

## Analog Family 2 — Source-Owned Durable State, Mutation Guards, Journals, and Pointer-Last Publication

**Primary analog:** `extension/utils/skopeo-corpus-store.js`
**Auxiliary diagnostic analog:** `extension/utils/trusted-local-feature-store.js`
**Applies to:** `skopeo-graph-store.js`, its real purge adapters, diagnostics, recovery, and `skopeo-graph-store.test.js`.

### Partition lanes and opaque mutation guards

Copy the issued-guard identity pattern (`skopeo-corpus-store.js:470-549`) rather than accepting signal-shaped objects:

```js
function issueMutation(operationSignal) {
  if (!validAbortSignal(operationSignal) || operationSignal.aborted) return null;
  var token = Object.freeze({});
  var guard = Object.freeze({
    signal: operationSignal,
    operationToken: token,
    operationEpoch: ++mutationSequence
  });
  issuedMutations.set(token, privateRecord);
  return guard;
}
```

Serialize global control changes and source/partition mutations exactly as `withGlobal` / `withPartition` do at `607-622`. Every storage await must pass through a post-await guard check (`633-637`):

```js
async function mutationAwait(record, promise) {
  startMutation(record);
  var value = await promise;
  if (!mutationOpen(record)) throw CANCELLED_MUTATION;
  return value;
}
```

Do not return cancellation until rollback or terminal repair has finished. Preserve the undo/fence behavior in `rollbackMutation` and `runMutation` (`649-715`): cancellation closes visibility first, restores or removes every touched key, and falls back to a durable closed pointer if rollback itself fails.

### Storage wrappers and ownership

Use `readOne`, `writeOne`, and `removeOne` (`718-749`) as the wrapper shape for every durable effect. A graph write should never call `chrome.storage.local` ad hoc outside the graph store. Every key and value must redundantly bind exact partition/source/generation ownership and be reparsed on read.

Use source-owned keys/pages for:

- source control / active pointer;
- staging manifest and bounded batches;
- immutable published fragment payload pages;
- lexical shard;
- adjacency/relationship shard;
- result-cache ownership;
- purge/recovery journal;
- bounded diagnostic ledger/counters.

Do not copy `capability-search.js`'s corpus-wide serialized MiniSearch snapshot as graph truth. It is an accelerator analog only; D-06 requires independently removable source-owned shards.

### Real purge participants and absence proof

Copy the exact participant surface (`skopeo-corpus-store.js:816-833`) and the purge-then-verify loop (`1281-1304`):

```js
Object.freeze({
  purgeSource: adapter.purgeSource,
  purgePartition: adapter.purgePartition,
  hasOwnedInfluence: adapter.hasOwnedInfluence
});

for (...) await participant.purgeSource(request, mutation.guard);
for (...) {
  var absence = await verifier.hasOwnedInfluence(request, mutation.guard);
  if (!validAbsenceResult(absence)) throw new Error('Corpus influence remains');
}
```

The graph store should provide real ownership adapters for `fragments`, `indexes`, `relationships`, and `result-cache`. The background should retain explicit empty/fail-closed adapters for later-owned `citations`, `counts`, and `alerts`. Never register a no-op first and attempt replacement later: participant names are unique.

Copy tombstone-first withdrawal ordering from `purgeSourceUnlocked` (`1308-1380`): write the journal and hidden/tombstone source state before invoking any participant, prove every category absent, then remove/replace the source control record and mark the journal complete.

### Invisible staging and active pointer last

The exact publication analog is `commitInventory` (`skopeo-corpus-store.js:986-1083`):

1. Validate the staging handle and complete inventory.
2. Write checkpoint/payload and mark candidate data complete.
3. Recheck authority.
4. Write the committed operation record.
5. Run the final authority callback.
6. Close the in-memory visibility gate.
7. Write the active control manifest last (`1051-1055`).
8. Revalidate after that asynchronous write; if stale, supersede it with a later closed epoch (`1059-1078`).

Use the same control-pointer principle per graph source generation. A multi-key `storage.local.set` is not the authority; only the final active source pointer makes a complete generation visible.

### Bounded metadata-only diagnostics

Use the bounded FIFO/byte-cap mechanics from `trusted-local-feature-store.js:24-40` and `327-340`, but make Phase 55 diagnostics stricter than its free-text legacy schema:

```js
entries.push(safe);
entries = entries.slice(-LIMITS.DIAGNOSTIC_ENTRIES);
while (entries.length && byteLength({ entries: entries }) > LIMITS.DIAGNOSTIC_RESPONSE_BYTES) {
  entries.shift();
}
await set(update);
```

Admit only the AI-SPEC's fixed enums, saturating counts, bounded JSON-pointer paths (no values), coarse timestamps, provider/model IDs, versions, and timing/usage. Do not reuse free-form `message` or `redactText` as the primary safety control. Source text, filename, source ID/fingerprint, locator text, prompt/output, credentials, party names, URLs, and citations must be structurally impossible to store.

### Test analog

Use the production module with an in-memory `storageArea`, not a reimplementation. Copy:

- `tests/skopeo-corpus-store.test.js:185-259` for before/after failure injection around every storage await;
- `339-423` for real per-category owned influence and exact guard observation;
- `456-552` for store construction, guard issuance, and terminal acknowledgement;
- `754-808` for old-pointer withdrawal before staging and pointer-last visibility;
- `1225-1292` for abort/revision drift after active bytes are applied but before acknowledgement;
- `1307-1437` for cancellation at each awaited boundary with byte-identical rollback and zero participant mutation;
- `1635-1767` for seeded quota/worker-loss matrices and fresh-worker convergence.

The graph test should additionally prove that withdrawing one source removes only that source's fragment, lexical postings, adjacency edges, cache entries, and diagnostics while preserving siblings; corruption or quota must never evict another source.

## Analog Family 3 — Fresh Authority, One-Source Extraction, Effect Publication, and Provider Cancellation

**Primary analogs:** `skopeo-drive-authority.js`, `skopeo-drive-corpus-transport.js`, `skopeo-drive-reconciler.js`, and `universal-provider.js`
**Applies to:** `skopeo-graph-extractor.js`, `skopeo-graph-engine.js`, the provider compatibility edit, and their tests.

### Certified callback before and after awaited work

Copy the public operation shape from `skopeo-drive-authority.js:1473-1514`:

```js
var certificate = await certifyOne(record, sourceFileId);
var before = await finalCurrentness(record, certificate);
var callbackRead = await guardedAwait(record, function(operationSignal) {
  return callback(certificate, operationSignal);
});
var after = await finalCurrentness(record, certificate);
if (after.decision !== 'certified') return after;
```

Each provider attempt—including the one permitted repair—must be inside a fresh `beginOperation('ingestion', context)` plus `runWithCertifiedSource`. Do not put several provider calls inside one stale certificate window, and never batch unrelated sources.

For durable publication, copy the authority-owned publisher seam (`skopeo-drive-authority.js:1333-1470`) and the reconciler use at `skopeo-drive-reconciler.js:1235-1282`: preparation returns plain intent; the separate commit callback calls `publisher.publish(effect, bindings)`; the effect receives the exact signal/token/epoch guard; final source currentness is checked before and after the effect.

### Certified content transport

Copy the operation-sink lifecycle from `skopeo-drive-corpus-transport.js:721-799`:

- exact-key input and one-use sink;
- bounded exact bytes and recomputed SHA-256;
- fatal UTF-8 decoding;
- signal check immediately before and after the awaited sink;
- nulling raw bytes/text/envelopes in `finally`;
- a minimized result containing hash/size but no source body.

The extractor should receive certified text through this path, normalize/segment locally, build an in-memory excerpt registry, then drop full text/request/raw response references after validation. The graph store sees only fully validated candidates and minimum provenance evidence.

### Fixed outcomes, budgets, and no partial extraction

Copy the fixed result-enum style from `skopeo-drive-corpus-transport.js:13-23` and `148-160`, plus the reconciler's bounded request counters at `496-501`. Return closed reason categories, never raw provider/storage exceptions. Check all exact limits before the next provider or durable effect.

The extractor must enforce the AI-SPEC limits as one generation contract: 8 excerpts / 24,000 characters per call; 8 normal calls / 192,000 characters per generation; 1 repair; 2,048 requested output tokens; 128 KiB raw text; 128 records; 256 relations. An invalid batch makes the entire generation invisible, not a partial best effort.

### `UniversalProvider` modification site

The current timeout owner is `universal-provider.js:352-370`:

```js
async fetchWithTimeout(endpoint, fetchOptions, timeout = DEFAULT_REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(endpoint, { ...fetchOptions, signal: controller.signal });
}
```

The current retry path is `418-495`; it calls `fetchWithTimeout`, awaits an uncancellable sleep at `441`, and recursively retries at `442-445`. Extend these existing signatures with optional `options.signal` while preserving all callers:

- validate/check caller signal before fetch;
- link caller abort to the internal timeout controller;
- distinguish caller cancellation from timeout for control flow without persisting raw error text;
- remove the listener on every settlement;
- make 429/503 backoff abortable and recheck before/after it and before recursion;
- pass the same caller signal through unsupported-parameter retry at `490`;
- suppress all retries after abort.

Use the listener-cleanup discipline in `skopeo-drive-authority.js:383-447` as the closest cancellation analog. Do not merely `Promise.race` an uncancellable fetch/sleep.

After `buildRequest`, set provider-specific caps using the existing shapes: Gemini `generationConfig.maxOutputTokens` (`universal-provider.js:248-254`), all other current shapes `max_tokens` (`290-296` or OpenAI-compatible request). Do not alter global provider defaults for unrelated FSB callers; the extractor owns temperature `0.1` and output cap on its request object.

### Test analog

- Require `UniversalProvider` directly as `tests/universal-provider-lmstudio.test.js:1-8` does, replace/spy `global.fetch`, and restore globals after each case.
- Copy the abort-aware fake promise at `tests/skopeo-drive-authority.test.js:108-113` for never-settling operations.
- Copy effect/cancellation assertions at `tests/skopeo-drive-authority.test.js:884-975`: the callback receives the exact signal, revoked authority produces zero commits, timeout reaches cleanup before return, and delayed work causes zero late mutation.
- Add abort-before-fetch, abort-during-fetch, abort-during-backoff, timeout, 429/503 retry suppression, unsupported-parameter retry parity, and all provider request-shape caps.
- Extractor tests should spy that one call contains one source only, no tools/URLs/callbacks/history, bounded excerpts, and the configured provider/model exactly; missing configuration returns pending/withheld with zero fallback.

## Analog Family 4 — Bounded Lexical/Traversal Queries and the Closed Background Facade

**Primary analogs:** `extension/utils/capability-search.js`, the Phase 54 corpus facade in `extension/background.js`, and `skopeo-drive-authority.js`
**Applies to:** `skopeo-graph-query.js`, query portions of `skopeo-graph-engine.js`, and `skopeo-graph-query.test.js`.

### MiniSearch construction, not storage authority

Copy the single-options construction pattern from `capability-search.js:47-54` and `1503-1525`: one private options object is reused for each partition cache build and contains only indexed/stored fields needed for results.

Copy the finite result clamp and deterministic projection shape from `capability-search.js:1629-1689`:

```js
if (!_ms) return [];
var hits = _ms.search(String(query || ''), fixedOptions);
var k = Math.max(1, Math.min(Number(topN) || DEFAULT_LIMIT, MAX_LIMIT));
return hits.slice(0, k).map(function(hit) {
  return /* minimized admitted projection */;
});
```

Adapt rather than copy these details:

- cache key is exact partition, not a catalog-global singleton;
- inputs come only from active source-owned lexical shards;
- every hit retains exact source/generation/record ownership;
- every contributing source is recertified through the bounded exact-set authority path before the hit influences output;
- results are newly allocated, recursively bounded/frozen defensive copies;
- cache loss triggers bounded rebuild from validated fragments/shards, never truth loss;
- do not serialize one mutable partition-wide MiniSearch object as authority.

### Exact source selection and operation facade

Copy `exactCorpusSourceSelection` (`background.js:1510-1534`): accept either one exact source or one bounded, nonempty, dense, duplicate-free exact set; reject implicit-all, mixed, sparse, accessor, or over-limit forms before opening an authority operation.

Copy `runSkopeoCorpusOperation` (`background.js:1554-1601`) as the facade guard shape:

```js
const current = selection ? await currentCorpusFacadeEntry(exactTuple) : null;
const operation = await kernel.authority.beginOperation(kind, context);
const guardedCallback = async function() {
  if (!await currentCorpusFacadeEntry(exactTuple)) throw new Error('stale-corpus-tuple');
  const value = await callback.apply(null, arguments);
  if (!await currentCorpusFacadeEntry(exactTuple)) throw new Error('stale-corpus-tuple');
  return value;
};
```

The Phase 55 engine should expose only closed methods equivalent to exact-ID lookup, partition lexical search, bounded neighbors, and provenance inspection. It should hold store/query/provider references privately and return no raw shard, raw graph record, storage key scan, provider payload, source text, or generic callback handle.

For neighbors, there is no exact repository graph analog: implement iterative breadth-first traversal with an allowlisted predicate/direction, visited set, depth <= 2, nodes <= 64, edges <= 128 (or smaller validated caps), and result/byte caps. Check max-plus-one before influence. Do not add recursion, JMESPath, dynamic expressions, or arbitrary graph queries.

### Query test analog

Use the same runtime code/options in tests. `tests/capability-search-eval.test.js:42-61` plants the checked-in MiniSearch UMD global before requiring the production module; `218-257` proves serialized/rebuilt ordering and result caps. For graph tests, rebuild from source shards rather than a global serialized index and assert byte-identical ordered results before/after a fresh-module/MV3-style recreation.

Use `tests/skopeo-corpus-runtime.test.js:1441-1473` for all five operation kinds and invalid-selection zero-operation checks. Extend with cross-partition/source markers, stale-generation exclusion, exact-set recertification, traversal cycles, endpoint/predicate filters, and max-plus-one depth/node/edge/result/byte cases.

## Analog Family 5 — Trusted Boot, Import/Recovery Order, Static Closure, and Package Wiring

**Primary analogs:** Phase 54 blocks in `extension/background.js`, `tests/skopeo-corpus-runtime.test.js`, and `scripts/verify-skopeo-storage-boundary.mjs`
**Applies to:** `background.js`, `skopeo-graph-runtime.test.js`, static verifier, `package.json`, and provenance docs.

### Trusted-local boot and import order

Preserve the exact access-level gate at `background.js:6-60`: `setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` must be thenable and awaited before store creation, and failure closes the boundary.

The relevant current load order is:

- bundled `MiniSearch` and `CfworkerJsonSchema` at `background.js:242-244`;
- Phase 54 schema/store/transport/authority/controller/reconciler at `267-272`.

Append graph modules after that chain in dependency order: graph schema -> graph store -> graph extractor -> graph query -> graph engine. Each load remains a literal `importScripts` path with fail-closed boot dependency checks. Do not put any graph path in `SKOPEO_INJECTION_FILES` (`823-835`).

### Boot and participant replacement

Adapt the existing corpus boundary at `background.js:274-360`:

1. Prove every Phase 54 and graph dependency exists.
2. Create the corpus store and dormant graph store.
3. Register the four real graph adapters and three explicit later-phase empty adapters under the seven exact names.
4. Run corpus recovery with an issued mutation guard and require terminal acknowledgement.
5. Run bounded graph journal/orphan recovery and rebuild disposable caches.
6. Only then construct/expose the private graph engine facade.

If any step fails, leave the graph engine unavailable and affected truth withheld. The existing `fsbCorpusPurgeParticipant` at `background.js:278-300` is the correct empty-proof shape only for `citations`, `counts`, and `alerts`; it must no longer own `fragments`, `indexes`, `relationships`, or `result-cache`.

### Runtime/static test pattern

Copy `tests/skopeo-corpus-runtime.test.js:963-1053`:

- assert each literal module occurs once and in dependency order;
- assert all private modules load before the controller/facade;
- inspect marked boot/controller blocks for recovery, guard, facade, and exact operation seams;
- prove every private module is absent from generic injection, Skopeo injection, manifest content scripts, and content-source references.

Use its VM background harness (`1056-1319`) to supply fake Chrome, trusted boundary, corpus authority, store, provider, MiniSearch, validator, and graph modules. Test boot failure at every dependency/recovery step, provider-unavailable pending state, one-source extraction/query/restart success, and MCP absence.

### Static storage-boundary gate

Extend the existing verifier rather than adding a second scanner. Its key patterns are:

- literal dependency discovery at `verify-skopeo-storage-boundary.mjs:100-165`;
- content/injection root closure traversal at `425-478`;
- scanning every reachable file for direct/aliased local storage and generic bridges at `480-510`;
- exact trusted boot/order checks at `356-423`.

Add all graph private modules to the background-only required set and fail if any is reachable from manifest/content/Skopeo injection roots. Add static checks for no Graphify runtime/import, Python/process/database/MCP registration, dynamic execution/query language, or new remote host. Keep diagnostics path-only: line-numbered fixed messages, never source/provider data.

### Package and fixture wiring

Follow `package.json:14-32`: standalone `node` tests are chained directly; no separate runner config exists. Add `test:skopeo-graph-evals` and include every focused Phase 55 test exactly once in the normal `test` chain. `validate:extension` already invokes the storage-boundary verifier; preserve that ownership.

For the 37-case corpus, follow `tests/capability-search-eval.test.js:42-61`: immutable fixture files are required from a stable directory, the checked-in production dependency is planted on the global before requiring the production module, and the runtime module's own options/helpers are the single source of truth. The manifest should enumerate `P01-P06`, `Q01-Q06`, `A01-A07`, `I01-I05`, `L01-L03`, `R01-R07`, and `B01-B03`, gold-label version, expected state/reason, exact records/relations/spans, budgets, authority script, durable keys, and query/absence proofs. No production text or live credentials enter fixtures.

### Graphify provenance documentation

Use the existing `README.md` `Acknowledgements` seam (`617-623`) rather than creating a runtime or vendored subtree. Add one concise Graphify entry with project URL, exact reviewed commit `abff1b1ca4052fcf9d955c5f6a034088723f4536`, reviewed MIT license/source, conceptual influences, and explicit `no copied code / no runtime dependency`. If implementation later proposes copying code, stop first; that is a new source/license review decision, not an automatic Phase 55 step.

## Per-File Assignment Summary

| File | Copy / Adapt | Do Not Copy |
|---|---|---|
| `skopeo-graph-schema.js` | Corpus schema IIFE, exact descriptors, frozen null-prototype outputs, tuple encoding, bounded canonical SHA-256 | Corpus source-state vocabulary or delimiter/model IDs |
| `skopeo-graph-store.js` | Corpus store guards, lanes, wrappers, journals, tombstone/purge/absence, pointer-last; trusted-store FIFO byte cap | Corpus-wide index values, best-effort writes, raw/free-text diagnostics |
| `skopeo-graph-extractor.js` | Certified-source callback, transport sink, fixed budgets/reasons, separate effect commit | Automation history/cache/parser, JSON cleaners, provider fallback, partial publication |
| `skopeo-graph-query.js` | MiniSearch construction/caps, exact-set recertification, minimized defensive projections | Mutable global snapshot authority, JMESPath, arbitrary expressions, vectors |
| `skopeo-graph-engine.js` | Closed corpus operation facade and reconciler orchestration | Content message bridge, raw handles/records, MCP tool/server registration |
| `universal-provider.js` | Existing request formats/retries plus authority-style signal composition/cleanup | Changing provider defaults or merely racing uncancellable work |
| `background.js` | Phase 54 literal imports, dependency checks, participant/recovery order, private facade | Adding graph modules to injection lists or registering graph no-ops first |
| `verify-skopeo-storage-boundary.mjs` | Existing literal closure and trusted-order static gate | Regex-only allow-by-default behavior when roots cannot resolve |
| focused tests | Production CommonJS exports, VM/fake Chrome, before/after failure injection, restart/race assertions | Network credentials, permissive mocks that bypass parsers/guards |
| eval fixtures | Stable IDs, exact expected sets and deterministic thresholds | Customer text, filenames/IDs, raw prompts/responses, LLM judge authority |
| `package.json` | Direct Node scripts and normal test-chain inclusion | New Jest/eval framework or external service |
| `README.md` | Existing acknowledgements format | Vendored Graphify code/license claims not backed by copied code |

## Shared Cross-Cutting Patterns

### Fail-closed error surface

- Public/store methods return frozen closed enums/statuses (`invalid-input`, `stale-operation`, `recovery-pending`, `closed`, `pending`, etc.) or `null`; they do not return raw `Error`, response text, source values, or existence outside current authority.
- Catch blocks convert failures to a fixed category and keep the affected source withheld. They never preserve stale truth, fall back across source/partition/provider, or evict a sibling.
- Tests seed unique forbidden markers into source text, filename, IDs, provider output/errors, credentials, and locators, then scan storage snapshots, logs, thrown/public errors, and facade projections for zero occurrences.

### Defensive-copy boundary

- Parsers allocate new null-prototype frozen records and frozen arrays; do not freeze and return caller/model/storage objects in place.
- Public query/facade methods return only allowlisted projections with finite fields/count/bytes.
- Opaque capabilities/guards belong in `WeakMap`/`WeakSet` registries and are nonserializable, following `skopeo-drive-authority.js:140-155`; signal-shaped or cloned tokens fail closed.

### Await and cancellation discipline

- Check the same operation signal before and after every content, provider, sleep, storage, validation, cache rebuild, authority, and publication await.
- Pass the signal into the underlying operation; a `Promise.race` alone is insufficient.
- Retain the mutation/effect guard through terminal rollback/repair and pointer-last publication.
- A late resolution may finish private cleanup but causes zero durable or query-visible effect.

### Deterministic bounded queries

- Exact partition/source/generation ownership is revalidated before influence.
- Sort all persisted key/page lists and public results by an explicit stable key after relevance/predicate rules; never depend on object/Map/storage enumeration order.
- Traversal is iterative with finite visited/node/edge/depth/result/byte caps.
- In-memory MiniSearch and adjacency caches are disposable and reconstructed only from active validated source shards.

### Test cadence ownership

- Each focused test runs directly with `node` after its owning implementation task.
- The focused aggregate is `npm run test:skopeo-graph-evals`.
- Wave/final gates add `node scripts/verify-skopeo-storage-boundary.mjs`, `npm run validate:extension`, and finally `npm test` as specified by `55-VALIDATION.md`.

## No Exact Analog Found

| New Concern | Closest Composition | Planner Instruction |
|---|---|---|
| Closed model-to-graph candidate schema and exact excerpt registry | corpus schema + transport sink + authority callback | Follow `55-AI-SPEC.md` verbatim for fields, caps, prompt boundary, repair rules, and 37 fixtures; do not borrow automation parsing. |
| Source-owned immutable graph fragment/shard layout | corpus store generation/journal pattern | Keep every fragment/posting/edge/cache contribution independently attributable and removable by exact source generation. |
| Bounded typed adjacency traversal | capability search result caps + corpus exact-set facade | Implement the smallest iterative BFS; no generic graph abstraction/query language. |
| Graph extraction eval corpus | capability search fixture harness + corpus failure matrix | Encode exact deterministic gold sets and state/absence proofs; optional live-provider quality remains separate and non-authoritative. |

## Metadata

**Analog search scope:** `extension/utils/`, `extension/ai/`, targeted `extension/background.js` regions, `tests/`, `scripts/`, `package.json`, and the existing README/legal documentation seam.
**Strong analog families:** 5.
**Primary source files inspected:** 14 implementation/config files and 7 focused tests/planning artifacts.
**Pattern extraction date:** 2026-07-21.
