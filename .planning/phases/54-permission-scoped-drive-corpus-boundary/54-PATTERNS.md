# Phase 54: Permission-Scoped Drive Corpus Boundary — Pattern Map

**Mapped:** 2026-07-18
**Scope:** Existing repository patterns for CORPUS-01 through CORPUS-06
**Inputs:** `54-CONTEXT.md`, `54-RESEARCH.md`, production modules, validation scripts, and tests

## Implied File Set and Pattern Assignment

Exact filenames remain discretionary, but the responsibilities below should stay independently testable.

| File or seam | Role | Primary repository analogs |
|---|---|---|
| `extension/utils/skopeo-corpus-schema.js` (new) | Closed states/reasons, exact records, partition/source keys, canonical fingerprint inputs, minimal view models | `extension/content/skopeo-context-router.js`; `extension/utils/skopeo-session-state.js`; `extension/utils/skopeo-action-authority.js` |
| `extension/utils/skopeo-corpus-store.js` (new) | Corpus manifests, source generations, ownership ledger, tombstones, and purge recovery after the background-owned trusted-local boot gate | `extension/utils/consent-policy-store.js`; `extension/utils/trigger-store.js`; `extension/utils/install-identity.js`; `extension/utils/skopeo-session-state.js` |
| `extension/utils/skopeo-drive-corpus-transport.js` (new) | Private, fixed Drive `about`/`files`/`changes`/bounded-content bridge with typed results | `extension/utils/capability-fetch.js`; `extension/catalog/handlers/gdrive.js`; `extension/catalog/handlers/gdocs.js` |
| `extension/utils/skopeo-drive-authority.js` (new) | Fresh account/root/source/ancestry proof and operation-scoped certificates | `extension/utils/install-identity.js` for single-flight shape; `extension/background.js` for sender/currentness authority |
| `extension/utils/skopeo-drive-reconciler.js` (new) | Full inventory, change drain, membership/vendor assignment, fingerprints, checkpoints | `extension/utils/trigger-store.js` for wake hydration and serialized mutation; `extension/utils/skopeo-session-state.js` for monotonic reducers |
| `extension/utils/skopeo-corpus-controller.js` (new) | Enrollment/replacement/account-switch orchestration, current visibility gate, narrow future-consumer facade | The Skopeo controller block in `extension/background.js` |
| `extension/background.js` (modify) | Ordered SW loading, fixed message dispatch, worker-wake recovery, trusted projections | Its existing `SKOPEO_INJECTION_FILES`, controller map, sender binding, abort, and final-currentness checks |
| `extension/utils/capability-fetch.js` (modify only if the private transport delegates to it) | Fixed MAIN-world Drive primitives and additional allowlisted response fields | Its existing origin-pinned `executeBoundPageRead`; do not broaden the public capability vocabulary |
| `extension/utils/trusted-local-feature-store.js` (new) and `extension/background.js` (modify) | Own all diagnostics, automation, session, DOM-snapshot, element-cache, and CAPTCHA-setting direct `storage.local` persistence after trusted-only boot | Background-only frozen module/fixed handlers; absent from manifest content scripts, both injection lists, and injected dependency closure; no generic key/value surface |
| `extension/utils/diagnostics-ring-buffer.js`, `extension/utils/automation-logger.js`, `extension/content/dom-state.js`, `extension/content/actions.js` (modify) | Become storage-free validation/redaction/named-message clients on every branch | Preserve each bounded caller contract while removing direct calls, listeners, aliases/destructuring, and dead/context-conditional persistence code |
| `extension/content/skopeo-runtime.js`, `skopeo-shell.js`, and optionally `skopeo-adaptive-composer.js` (modify) | One exact enrollment claim and a bounded status/control projection inside the existing Skopeo lifecycle | Their existing configure/prepare/commit, route epoch, `_button`, and adaptive-model seams |
| Six focused `tests/skopeo-*.test.js` files plus deterministic fixtures (new) | Contract, crash/reload, transport, authority, reconciliation, and runtime oracles | `tests/skopeo-context-router.test.js`; `tests/install-identity.test.js`; `tests/skopeo-sidepanel-command.test.js`; `tests/skopeo-catalog-runtime.test.js` |
| A content-storage boundary verifier under `scripts/` (new) | Reject direct injected-context local storage and generic storage-proxy messages | `scripts/verify-pattern-d-gapi-gate.mjs`; `tests/extension-content-script-files-completeness.test.js` |
| `package.json` (modify) | Register the static gate and all focused tests in explicit order | Existing `validate:extension`, `test`, and `ci` chains |
| `54-HUMAN-UAT.md` (new) | Real Chrome/Drive evidence ledger | `tests/skopeo-browser-contract.test.js` supplies the closest browser-fixture structure, but not an exact storage-isolation probe |

## Analog 1: Closed Classic-Script Contracts

### Copy from `skopeo-context-router.js` and `skopeo-session-state.js`

`extension/content/skopeo-context-router.js:52-62` is the clearest exact-object validator:

```js
function hasExactOwnKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  var actualKeys = Reflect.ownKeys(value);
  if (actualKeys.length !== expectedKeys.length) return false;
  if (actualKeys.some(function (key) { return typeof key !== 'string'; })) return false;
  var sorted = actualKeys.slice().sort();
  var expected = expectedKeys.slice().sort();
  return sorted.every(function (key, index) {
    return key === expected[index];
  });
}
```

Its export at `extension/content/skopeo-context-router.js:239-249` is also the expected runtime/test shape:

```js
var api = Object.freeze({
  STATUS: STATUS,
  CONTEXT_KIND: CONTEXT_KIND,
  IDENTITY_KIND: IDENTITY_KIND,
  REASON: REASON,
  SIGNAL: SIGNAL,
  createRouter: createRouter
});

globalThis.FSBSkopeoContextRouter = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
```

Apply that pattern to corpus states, record parsers, partition/source identifiers, operation kinds, reason codes, and view models. Accept only plain exact records, bounded safe values, closed enum members, and validated nested records; return frozen normalized copies rather than caller objects.

`extension/utils/skopeo-session-state.js:165-203` is the closest state-transition analog. `beginTermination` first enters a terminal-owned state and `finishTermination` preserves the terminal generation and reason. Map that monotonic shape to visible/tombstoned/purging/purged corpus and source generations: stale generations return the current record, and no reducer transition may reopen older authority.

Use the canonical JSON and native SHA-256 pattern at `extension/utils/skopeo-action-authority.js:173-225` for fingerprints:

```js
var bytes = new TextEncoder().encode(canonical);
var digest = await cryptoObject.subtle.digest('SHA-256', bytes);
var hex = digestHex(digest);
return /^[0-9a-f]{64}$/.test(hex) ? 'sha256:' + hex : null;
```

Adapt it by domain-separating each fingerprint version and purpose. Stable source identity, membership/metadata fingerprint, and exact content fingerprint are separate contracts. Hash complete bounded bytes; a truncated export must not produce an authoritative content fingerprint.

### Do not copy

- Do not accept loose extra keys, unbounded strings, inherited fields, arbitrary status text, or raw Drive response objects.
- Do not combine stable file identity with metadata or content revision. Rename/move must be distinguishable from changed content.
- Do not expose mutable enum sets or internal manifest records through the exported API.

## Analog 2: Serialized Durable Stores and Terminal Recovery

### Copy the lane shape, not the fail-open policy

`extension/utils/consent-policy-store.js:64-75` and `extension/utils/trigger-store.js:128-144` serialize full-envelope read/modify/write operations with a promise chain:

```js
var _envelopeChain = Promise.resolve();
function _withEnvelopeLock(fn) {
  var run = _envelopeChain.then(fn, fn);
  _envelopeChain = run.catch(function() { /* keep later work unpoisoned */ });
  return run;
}
```

Use one deterministic lane for any key set whose invariant spans multiple writes: account/root replacement, per-partition manifest publication, source-generation promotion, tombstone publication, purge completion, and checkpoint advancement. Reads that affect visibility must validate the current manifest/epoch rather than trusting an earlier in-memory object.

`extension/utils/trigger-store.js:190-203` supplies the worker-wake enumeration pattern:

```js
async function listArmedSnapshots() {
  var envelope = await _readEnvelope();
  return Object.keys(envelope.records)
    .map(function(k) { return envelope.records[k]; })
    .filter(function(s) { return s && s.status === 'armed'; });
}

async function hydrate() {
  return await _readEnvelope();
}
```

The corpus equivalent should enumerate incomplete/tombstoned/purging records on every service-worker wake and resume idempotently. Durable manifest state is authoritative; module memory is only a cache.

`extension/utils/install-identity.js:53-65` is the closest coalescing precedent: memoize the in-flight promise and clear it in `finally` so transient failure does not latch forever. In Phase 54, scope that map by the exact operation identifier and proof tuple. Coalescing may share proof only inside one bounded operation; it must never become a cross-operation certificate cache.

### Required adaptation

The existing consent store deliberately degrades malformed/missing data to defaults and swallows write failures (`extension/utils/consent-policy-store.js:107-168`). That behavior is not a corpus-store pattern. Corpus boot, access-level setup, manifest publication, tombstone publication, and checkpoint writes must return a closed typed failure. A failed write cannot be reported as success, and a malformed authority record cannot be silently replaced with a visible empty default.

Before any trusted feature or corpus read/write, the background boot sequence owns and awaits the area-wide `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` gate. Because the setting is area-wide, all direct diagnostics/automation/session/DOM-snapshot/element-cache persistence must first move into the background-only trusted feature store/background. Dual-loaded/injected utilities remain storage-free on every branch. No new API should proxy arbitrary `get(keys)`, `set(values)`, or `remove(keys)` operations.

### Tombstone-first ordering to preserve

Follow the existing Skopeo termination philosophy in `extension/utils/skopeo-session-state.js` and `extension/background.js:1528-1557`: publish the terminal authority record before cleanup is considered complete. For corpus removal, replacement, account change, revocation, and confirmed missing membership, the newer manifest/tombstone closes visibility first; source-owned participants are purged afterward; only then may a terminal purge marker/checkpoint advance. Crash recovery resumes from that closed record.

## Analog 3: Origin-Pinned, Fixed-Function Drive Transport

### Copy from `capability-fetch.js`, `gdrive.js`, and `gdocs.js`

`extension/utils/capability-fetch.js:5622-5643` re-reads the tab and rejects an origin mismatch before page execution:

```js
tab = await c.tabs.get(tabId);
tabOrigin = (tab && tab.url) ? new URL(tab.url).origin : null;
if (!tabOrigin || tabOrigin !== (spec && spec.origin)) {
  return _typedError('RECIPE_ORIGIN_MISMATCH', {
    origin: spec && spec.origin,
    tabOrigin: tabOrigin
  });
}
```

`extension/utils/capability-fetch.js:5761-5781` then injects a fixed function, in the MAIN world, with a fixed request object:

```js
results = await c.scripting.executeScript({
  target: { tabId: tabId },
  world: 'MAIN',
  func: capabilityPageReadInPage,
  args: [request]
});
```

Use that exact boundary for a private corpus transport. The background selects from a closed action vocabulary; the page function constructs known Drive paths and query parameters; the response crosses back through per-action shape, type, status, pagination, redirect, and byte limits. Re-read the exact Drive/Docs tab origin before every page-world call.

`extension/catalog/handlers/gdrive.js:144-166` already normalizes Drive `about.user.permissionId`, and its file mapper preserves stable file IDs, parents, MIME type, and permission/capability metadata. `extension/catalog/handlers/gdocs.js:212-267` is the current precedent for Drive metadata plus Google-native text export. Extend the requested field allowlists to the authority/reconciliation evidence identified in research; do not trust page copy, email, display name, URL `authuser`, or folder names as identity.

### Keep this transport private

- Do not register corpus `about`, `files`, `changes`, ancestry, or bounded-content operations in the public catalog in `gdrive.js`/`gdocs.js`.
- Do not accept arbitrary URLs, HTTP methods, headers, Drive fields, query strings, extraction expressions, or fetch bodies from content.
- Do not reuse the current generic success/error collapse at `capability-fetch.js:5700-5729`. The corpus transport needs a closed status/reason taxonomy that preserves the evidence required to distinguish pending, unreadable, download-blocked, inaccessible, and authoritatively missing.
- Do not log raw response bodies, filenames, API messages, full text, or credentials. Full source bytes/text live only for one bounded operation.
- An opaque metadata 404 is not proof of deletion. `missing` requires reconciliation evidence such as trash/deletion/removal from proven ancestry.

## Analog 4: Background-Owned Sender and Currentness Authority

### Copy the Skopeo controller chokepoint

`extension/background.js:1809-1819` derives the tab from `sender` and rejects content-supplied `tabId`:

```js
function contentTabId(sender) {
  return sender && sender.tab && positiveInteger(sender.tab.id) ? sender.tab.id : null;
}

if (!tabId || !exactKeys(message, ['action', 'generation', 'placement']) ||
    own(message, 'tabId') || !positiveGeneration(generation)) {
  return staleResponse(tabId, generation, 'Prepared acknowledgment is not authoritative.');
}
```

The enrollment handler should be another fixed controller action, not a separate message listener or Skopeo lifecycle. Content may claim the current stable Drive folder ID and generation/context tuple. Background derives the tab, verifies `sender.id`, checks the installed controller projection, re-reads the exact tab/origin, re-fetches the claimed file by ID, proves folder MIME and current `permissionId`, then admits enrollment.

`extension/background.js:1999-2059` is the strongest operation pattern:

1. exact request keys and no `tabId` claim;
2. current sender tab/generation/projection lookup;
3. installed capability/authority validation;
4. revalidation immediately before dispatch;
5. one-time token consumption before the awaited external call;
6. another currentness lookup after the await;
7. a narrow frozen result.

Apply the same before/after checks to corpus enrollment, reconciliation publication, fresh access certification, and every future consumer call. An aborted controller, changed account permission ID, changed corpus epoch, changed source generation, moved-out source, or stale operation ID closes the output.

The existing controller also provides the correct lifecycle tools:

- serialized `routeCommitLane` (`extension/background.js:1348-1415`);
- replaceable `AbortController` ownership (`extension/background.js:1417-1438`);
- exact origin/profile/catalog projections (`extension/background.js:1441-1486`);
- repeated tab/currentness checks around injection and configuration (`extension/background.js:1581-1683`);
- wake reconciliation of interrupted session states (`extension/background.js:2237-2282`).

Corpus code should use its own partition/source mutation lanes and abort ownership while sharing this one controller/message chokepoint.

### Storage-consumer migrations use the same trust rule

The storage prerequisite should expose only feature-specific operations:

| Current direct path | Existing seam to preserve | Pattern adaptation |
|---|---|---|
| `extension/utils/diagnostics-ring-buffer.js:13-95` | Whitelisted, redacted, FIFO diagnostic entries | Utility becomes storage-free on every branch; content submits one bounded redacted entry and the background-only trusted store owns append/read/clear persistence. |
| `extension/utils/automation-logger.js:414-415,658-684,703-934,978` | Bounded automation logs, sessions, and DOM snapshots | Utility becomes storage-free on every branch; route exact append/save/load/list/delete/clear verbs to the background-only trusted store, never a context-selected persistence branch or raw local-storage key. |
| `extension/content/dom-state.js:577-603` | `elementCacheSize` clamped to 10..1000 and live updates | Remove direct reads/listeners; obtain one bounded config projection from the background-only trusted store and use a dedicated update event/message. |
| `extension/content/actions.js:3441-3452,3476-3525` plus `extension/background.js:10554-10604` | CAPTCHA type/site-key detection and background network call | Content sends no API key. Background reads trusted enable/key settings and binds any page URL to `sender.tab.url`. |

All diagnostics, automation, session, DOM-snapshot, and element-cache direct `storage.local` persistence belongs to `background.js` or `trusted-local-feature-store.js`. Dual-loaded/injected utilities are validation, redaction, and named-message clients only, with zero direct calls, listeners, aliases/destructuring, or dead/context-conditional storage code. The migration must not create a general storage service. Static tests should reject generic key/value message shapes, injected import of the trusted feature store, and direct/aliased local-storage use across manifest scripts, both dynamic injection lists, dependency closure, and the pinned dual-loaded utility files.

## Analog 5: One Skopeo Runtime and Explicit Contract Tests

### Content integration

`extension/background.js:603-615` defines the Skopeo injection dependency order separately from the general content bundle. Keep all store, transport, authority, reconciler, and controller modules service-worker-only. Load their globals after `capability-fetch.js` and before the inline Skopeo controller consumes them. Do not add them to `CONTENT_SCRIPT_FILES`, manifest content scripts, or web-accessible resources.

`extension/content/skopeo-runtime.js` already owns configure/prepare/commit, the current generation, route epoch, entity resolution, exact outbound messages, and final-currentness checks. Extend its fixed action vocabulary for enrollment and accept only a minimal corpus view model. Do not create a second runtime, router, shell, global store mirror, or content-side authority object.

Use `extension/content/skopeo-shell.js:1914-1934,1962-2018,2048-2079` for the in-context control: the existing adaptive action callback, local `_button` helper, text nodes, FSB tokens, and shell cleanup. `extension/content/skopeo-adaptive-composer.js:770-917` is the model seam if enrollment/status belongs in the adaptive composition. Names and page copy remain display-only.

### Test structure

`tests/skopeo-context-router.test.js:1-24,604-628` is the contract-test model:

```js
const assert = require('node:assert/strict');
// ... locate production classic script ...
const api = require(ROUTER_PATH);
assert.strictEqual(globalThis.FSBSkopeoContextRouter, api,
  'classic-script global matches the CommonJS production export');
runContract(api);
```

Use this for the schema/reducer and pure authority contracts: positive fixtures, exact-key failures, hostile inherited/symbol values, closed vocabularies, immutable normalized outputs, stale generation/epoch cases, and negative controls proving the oracle itself fails.

`tests/install-identity.test.js:58-113,382-418` supplies the fake-storage and concurrent single-flight baseline. Expand the phase fixture with:

- `setAccessLevel` calls and injected failures;
- multiple durable keys and deterministic write-step crash injection;
- worker reload/fresh-require behavior;
- call tracing for ordering (tombstone before participant purge; apply before checkpoint);
- exact-operation coalescing and cross-operation non-coalescing.

`tests/skopeo-sidepanel-command.test.js:943-1190,3233-3412` is the closest background controller harness: mocked events, tabs, runtime messages, storage, script injection, and VM extraction of the controller block. Use it for sender-derived tab authority, forged fields, navigation/account races, worker wakes, and minimal projections.

`tests/skopeo-catalog-runtime.test.js:38-84,90-148,281-345` is the order/static-boundary model. Assert the new SW dependency order, absence from both injected bundles, a fixed private action set, and final-currentness checks around every awaited Drive operation.

`tests/extension-content-script-files-completeness.test.js:7-28,72-86` shows how to parse injection arrays and inspect manifest exposure. A companion static verifier should enumerate every injected file and reject direct local-storage access or generic storage proxy contracts. Follow `scripts/verify-pattern-d-gapi-gate.mjs:188-210`: return deterministic failures/counts, print every failure in CLI mode, exit nonzero, and include a negative control.

Register the six focused tests explicitly in `package.json`'s `test` chain and the boundary verifier in `validate:extension`; the existing `ci` command will then compose both. No new test dependency is needed.

### Fixture ownership map

| Focused test | Closest pattern | Distinct evidence it should own |
|---|---|---|
| `tests/skopeo-corpus-schema.test.js` | `skopeo-context-router.test.js` | Closed six-state reducer, exact records/keys, separate identities/fingerprints, hostile inputs |
| `tests/skopeo-corpus-store.test.js` | `install-identity.test.js`, `trigger-store.js` tests | Trusted-only boot, serialized multi-key writes, failure after each step, wake recovery, tombstone-first purge |
| `tests/skopeo-drive-corpus-transport.test.js` | catalog handler and capability-fetch tests | Private action allowlist, exact Drive shapes/statuses, pagination, origin pin, byte limits, no generic fetch |
| `tests/skopeo-drive-authority.test.js` | controller/currentness tests | Stable root admission, opaque account proof, physical ancestry, shortcut exclusion, per-operation certificates |
| `tests/skopeo-drive-reconciler.test.js` | trigger-store hydration plus reducer tests | Baseline/change race closure, cycles, shared descendants, moves, rename-only behavior, idempotent checkpoints |
| `tests/skopeo-corpus-runtime.test.js` | `skopeo-sidepanel-command.test.js`, `skopeo-catalog-runtime.test.js` | Sender binding, account replacement withdrawal, minimal content projection, zero stale influence/residue |

Deterministic Drive/Docs fixtures should include page tokens, start-page tokens, repeated change pages, invalid tokens, cycles, shortcuts, shared-drive items, opaque 404, metadata 403, content-only denial, unsupported MIME, exact-size and oversized bytes, revision/checksum changes, and rename/move-only changes. A fake purge participant should model every later source-owned influence category without implementing the Phase 55-59 graph/features.

## Shared Conventions to Carry Forward

1. Classic IIFE modules expose one frozen global for `importScripts` and the same object through CommonJS for Node tests.
2. Every durable or cross-context record has an explicit version, exact own keys, bounded values, a closed vocabulary, and a normalized frozen representation.
3. `permissionId`, corpus root file ID, and source file ID form authority only after trusted Drive re-fetch; DOM/page labels are claims or display text.
4. Content messages never supply authoritative `tabId`, account identity, raw storage keys, arbitrary Drive requests, credentials, or full corpus records.
5. Every awaited external step is bracketed by current operation/partition/source/generation checks. Late success is discarded.
6. Certificates are in-memory, operation-scoped, exact-purpose, and cleared at operation end; only identical checks inside that operation may coalesce.
7. Tombstone/new-manifest publication precedes purge. Checkpoints advance only after the complete idempotent apply is durable.
8. Names, snippets, counts, relationships, citations, and other stale metadata disappear when proof is unavailable; neutral `pending`/`inaccessible` projections stay minimized.
9. Full bytes/text never enter storage, diagnostics, messages to content, or fixtures derived from real user data.
10. Load order and exposure are part of the contract and receive static tests, not comments alone.

## No Exact Repository Analog

The following require new focused designs and negative oracles rather than copying an existing implementation:

- A crash-safe, tombstone-first manifest spanning multiple `chrome.storage.local` keys. Chrome storage provides no transaction; the new store must make every intermediate state closed and recoverable.
- Area-wide `storage.local.setAccessLevel('TRUSTED_CONTEXTS')` verified from a real loaded extension. `tests/skopeo-browser-contract.test.js` offers a Chrome-launch/fixture pattern, but the repository has no existing loaded-extension access-isolation probe.
- Account/corpus-scoped Drive change-token reconciliation whose change events are hints and whose physical parent ancestry is the only membership authority.
- A source-owned purge-participant registry/ledger spanning future fragment, index, citation, count, relationship, and alert influence. The Phase 54 fixture should prove the protocol without implementing those deferred consumers.
- Same-operation-only access certificates covering ingestion, query, display, citation opening, and alert delivery. `install-identity.js` supplies the promise-coalescing mechanism, but its service-worker-lifetime identity memoization is intentionally not the certificate lifetime.

These gaps should be treated as first-class test assets in the plan, not inferred from looser catalog/store conventions.

## Mapping Summary

The dominant repository pattern is a strict background authority kernel: classic frozen modules, exact sender-bound messages, origin-pinned fixed page functions, serialized durable transitions, tombstone-first visibility, and repeated currentness checks around every await. Phase 54 should extend that kernel while keeping Drive transport private, storage trusted-only, content projections minimal, and later graph/query/citation/alert behavior out of scope.
