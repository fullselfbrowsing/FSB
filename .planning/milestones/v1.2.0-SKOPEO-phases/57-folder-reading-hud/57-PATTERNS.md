# Phase 57: Folder & Reading HUD - Pattern Map

**Mapped:** 2026-08-11
**Files analyzed:** 20 planned new/modified files
**Analogs found:** 20 / 20
**Analog families:** 5 — closed schemas/projection, trusted truth/corpus authority, content lifecycle, shell rendering, deterministic tests/evals

## Scope Interpretation

The file set below combines the explicit module shape in 57-RESEARCH.md with the required Wave 0 assets in 57-VALIDATION.md. Two implied edits are included:

- extension/config/config.js must add default-closed truth timezone/calendar keys because Config.loadFromStorage() reads only Object.keys(this.defaults).
- package.json must add test:skopeo-hud-evals and include that aggregate exactly once in the normal test chain.

Existing regression commands do not automatically make their files Phase 57 edit targets. In particular, tests/skopeo-session-lifecycle.test.js, tests/skopeo-shell-contract.test.js, tests/skopeo-corpus-runtime.test.js, scripts/verify-skopeo-storage-boundary.mjs, and extension/manifest.json should remain unchanged unless a focused RED contract demonstrates a necessary edit.

The Drive transport is also conditional. extension/utils/skopeo-drive-corpus-transport.js already exposes getFile() and keeps resource keys in WeakMap-backed handles. Modify it and its test only if implementation proves that fresh vendor metadata or link-shared source navigation cannot be resolved through the existing background-only interface.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| extension/utils/skopeo-hud-schema.js | model / utility | transform | extension/utils/skopeo-corpus-schema.js | role-match |
| extension/utils/skopeo-hud-projector.js | service / utility | batch transform | extension/utils/skopeo-capability-projector.js | role-match |
| extension/utils/skopeo-truth-store.js | store | CRUD / file-I/O | same file: active-generation and metadata reads | exact |
| extension/utils/skopeo-truth-engine.js | service | request-response / batch | same file: inspect methods | exact |
| extension/config/config.js | config | CRUD | same file: defaults-backed Chrome storage loading | exact |
| extension/background.js | controller / provider | request-response / event-driven | same file: corpus controller and projectActiveCorpus() | exact |
| extension/content/skopeo-adaptive-composer.js | component / utility | transform | same file: composeCorpus() | exact |
| extension/content/skopeo-runtime.js | controller | event-driven / request-response | same file: corpus refresh/currentness flow | exact |
| extension/content/skopeo-shell.js | component | event-driven | same file: corpus region lifecycle | exact |
| package.json | config | batch | same file: graph/truth aggregate scripts | exact |
| tests/skopeo-hud-schema.test.js | test | transform | tests/skopeo-corpus-schema.test.js | role-match |
| tests/skopeo-hud-projector.test.js | test | batch transform | tests/skopeo-capability-projection.test.js | role-match |
| tests/skopeo-hud-runtime.test.js | test | request-response / event-driven | tests/skopeo-corpus-runtime.test.js plus tests/skopeo-consequence-gate.test.js | role-match |
| tests/skopeo-truth-store.test.js | test | CRUD / file-I/O | same file: partition-generation tests | exact |
| tests/skopeo-truth-runtime.test.js | test | request-response / batch | same file: private facade/currentness tests | exact |
| tests/skopeo-adaptive-composer.test.js | test | transform | same file plus corpus-model tests in tests/skopeo-corpus-runtime.test.js | exact |
| tests/skopeo-browser-contract.test.js | test | event-driven | same file: runCorpusEnrollmentContract() | exact |
| tests/skopeo-hud-evals.test.js | test | batch | tests/skopeo-truth-evals.test.js | role-match |
| tests/fixtures/skopeo-hud-evals/manifest.json | config / fixture | batch | tests/fixtures/skopeo-truth-evals/manifest.json | role-match |
| tests/fixtures/skopeo-hud-evals/cases.json | config / fixture | batch | tests/fixtures/skopeo-truth-evals/cases.json | role-match |

## Pattern Assignments

### extension/utils/skopeo-hud-schema.js (model / utility, transform)

**Analog:** extension/utils/skopeo-corpus-schema.js

Use the same classic-script plus CommonJS wrapper, versioned vocabulary, exact-own-data parsing, null-prototype frozen records, and closed exported surface.

**Module and vocabulary pattern** (extension/utils/skopeo-corpus-schema.js lines 1-31):

~~~javascript
(function(global) {
  'use strict';

  var VERSION = 'skopeo-corpus-schema/v1';
  var SOURCE_STATES = Object.freeze([
    'ready',
    'pending',
    'unreadable',
    'download-blocked',
    'inaccessible',
    'missing'
  ]);
  var SOURCE_STATE_SET = makeSet(SOURCE_STATES);
~~~

**Hostile-shape rejection pattern** (extension/utils/skopeo-corpus-schema.js lines 114-149):

~~~javascript
function dataValues(value, expectedKeys) {
  if (!isPlainRecord(value)) return null;
  try {
    var actualKeys = Reflect.ownKeys(value);
    if (actualKeys.length !== expectedKeys.length || actualKeys.some(function(key) {
      return typeof key !== 'string';
    })) {
      return null;
    }
    var expected = expectedKeys.slice().sort();
    var sorted = actualKeys.slice().sort();
    for (var index = 0; index < sorted.length; index += 1) {
      if (sorted[index] !== expected[index]) return null;
    }
    var output = Object.create(null);
    for (var keyIndex = 0; keyIndex < actualKeys.length; keyIndex += 1) {
      var key = actualKeys[keyIndex];
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) return null;
      output[key] = descriptor.value;
    }
    return output;
  } catch (_error) {
    return null;
  }
}
~~~

**Parser and export pattern** (extension/utils/skopeo-corpus-schema.js lines 533-605 and 608-629):

~~~javascript
function parseSourceRecord(value) {
  var fields = dataValues(value, SOURCE_RECORD_KEYS);
  if (!fields || fields.version !== VERSION || !SOURCE_STATE_SET[fields.state]) {
    return null;
  }
  // Parse nested fields, verify tuple equality, then construct a fresh record.
  return frozenRecord([
    ['version', VERSION],
    ['sourceKey', fields.sourceKey],
    ['state', fields.state]
  ]);
}

var api = Object.freeze({
  VERSION: VERSION,
  SOURCE_STATES: SOURCE_STATES,
  parseSourceRecord: parseSourceRecord
});

global.FsbSkopeoCorpusSchema = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
~~~

Phase 57 application:

- Define separate exact folder, reading, contract-closed, vendor, fact, citation-action, typed-date, gap, overflow, and downstream-neutral-slot shapes.
- Fix finite caps in this module and test exact maximum plus maximum-plus-one.
- Reject accessors, symbols, sparse arrays, prototypes other than Object.prototype/null, duplicate opaque IDs, hidden fields, URLs, raw source IDs, storage keys, provider data, and non-data properties.
- Return only fresh recursively frozen data. Do not freeze caller-owned input in place.

### extension/utils/skopeo-hud-projector.js (service / utility, batch transform)

**Analog:** extension/utils/skopeo-capability-projector.js

Keep this module pure: injected current corpus/graph/truth/vendor-label inputs in, one closed semantic projection out. It must not read storage, Drive, Chrome APIs, the clock, locale, DOM, or content state.

**Bounds, closed states, and deep freeze** (extension/utils/skopeo-capability-projector.js lines 4-45):

~~~javascript
var MAX_GROUPS = 12;
var MAX_CAPABILITIES = 256;
var MAX_LABEL_LENGTH = 80;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Reflect.ownKeys(value).forEach(function(key) { deepFreeze(value[key]); });
  return Object.freeze(value);
}

var STATUS = deepFreeze({
  RECOGNIZED: 'recognized',
  UNSUPPORTED: 'unsupported',
  INVALID: 'invalid'
});
~~~

**Validate before publish pattern** (extension/utils/skopeo-capability-projector.js lines 802-834 and 836-900):

~~~javascript
function validateProjection(value) {
  if (!hasExactKeys(value, PROJECTION_KEYS) ||
      !Array.isArray(value.capabilityGroups) ||
      value.capabilityGroups.length === 0 ||
      value.capabilityGroups.length > MAX_GROUPS) {
    return false;
  }
  // Validate every nested row, uniqueness constraint, and aggregate cap.
  return true;
}

function createProjection(input, suppliedIndex) {
  if (!hasExactKeys(input, ['tabId', 'generation', 'url'])) {
    return invalid('projection-invalid');
  }
  // Resolve and normalize injected data only.
  var projection = { /* closed semantic fields */ };
  if (!validateProjection(projection)) return invalid('projection-invalid');
  return deepFreeze(projection);
}
~~~

Phase 57 application:

- Group only by certified vendorScopeFileId and truth source bindings; never by label or filename.
- Require complete graph/truth authority before proving absence. Otherwise emit the precise pending, inaccessible, ambiguous, conflicting, or not-evaluated state.
- Select the next material date deterministically from civil dates while retaining its type. Use the UI-SPEC ordering for ties: notice deadline, termination, expiration, renewal.
- Sort vendor cards by projector-owned priority and opaque identity tie-breaker; content must not resort visible strings.
- Treat over-cap truth as no truth conclusion, not a usable prefix. Explicitly bounded manifest-only vendor status may remain with partial/overflow copy.

### extension/utils/skopeo-truth-store.js (store, CRUD / file-I/O)

**Analog:** the same file's active-generation reader and inspectMetadata() seam.

Prefer using or narrowly extending the existing complete-generation read. Do not add a generic listing bridge.

**Pointer plus generation plus family validation** (lines 988-1019):

~~~javascript
async function readActiveGeneration(partitionKey, context, validateFamilies) {
  var pointerEntry = await readOne(generationControlKey(partitionKey), context);
  if (!pointerEntry.present) return null;
  var pointer = await parseGenerationControl(pointerEntry.value, partitionKey, context);
  if (!pointer) return null;
  var generationEntry = await readOne(
    generationKey(partitionKey, pointer.activeOutputGenerationId), context);
  var generation = generationEntry.present
    ? await parseGeneration(generationEntry.value, partitionKey, context)
    : null;
  if (!generation ||
      generation.outputGenerationId !== pointer.activeOutputGenerationId) return null;
  if (!validateFamilies) return generation;
  // Every generation member must still name the published family snapshot.
}
~~~

**Current metadata projection** (lines 3146-3169):

~~~javascript
async function inspectMetadata(value) {
  var input = exactFields(value, ['partitionKey']);
  if (!input || !validPartition(corpusSchema, input.partitionKey)) return null;
  try {
    var generation = await readActiveGeneration(input.partitionKey, null, true);
    var families = generation
      ? generation.families.map(function(family) {
        return frozenRecord([
          ['familyId', family.familyId],
          ['state', 'published'],
          ['snapshotId', family.snapshotId]
        ]);
      })
      : [];
    return frozenRecord([
      ['version', VERSION],
      ['partitionKey', input.partitionKey],
      ['outputGenerationId', generation ? generation.outputGenerationId : null],
      ['authorizedSetDigest', generation ? generation.authorizedSetDigest : null],
      ['families', frozenArray(families)]
    ]);
  } catch (_error) {
    return null;
  }
}
~~~

Phase 57 application:

- First determine whether inspectMetadata() plus readActiveFamily() and engine-level before/after checks are sufficient.
- If an atomic overview is required, add one narrowly named store method that validates one active generation and all referenced snapshots, returning null on any missing/corrupt/changed member.
- Update the created-store exact surface at lines 3175-3190 and its exact-surface test. Do not expose raw storage records or a content-facing facade.

### extension/utils/skopeo-truth-engine.js (service, request-response / batch)

**Analog:** the same file's inspect pipeline.

Add inspectDisplaySnapshot beside the six existing inspection methods. It should use requestContext(..., false), obtain fresh visible and graph authority, read the complete active generation, validate every family against the same digest/context/versions, recheck authority/context, and only then return one bounded frozen result.

**Closed dependency injection** (lines 680-730):

~~~javascript
function create(options) {
  var fields = exactFields(options, [
    'truthSchema',
    'truthStore',
    'truthExtractor',
    'lineageAdjudicator',
    'deadlineEngine',
    'graphFacade',
    'corpusTransport',
    'runCorpusOperation',
    'readVisibleSourceSet',
    'validateEvaluationContext',
    'readSettings',
    'providerFactory',
    'byteLength'
  ]);
  if (!fields || typeof fields.graphFacade.snapshotExactSet !== 'function' ||
      typeof fields.runCorpusOperation !== 'function') {
    return null;
  }
~~~

**Fresh authority and bounded projection** (lines 1464-1531):

~~~javascript
function boundedProjection(value) {
  var copy = safeClone(value);
  if (!copy) return blocked(['input-not-exact']);
  var encoded = JSON.stringify(copy);
  var length = byteLength(encoded);
  if (!Number.isSafeInteger(length) ||
      length > truthSchema.LIMITS.MAX_MINIMIZED_RESULT_BYTES) {
    return blocked(['exact-set-over-cap']);
  }
  return deepFreeze(copy);
}

async function inspect(kind, exactTuple, request) {
  var contextState = await requestContext(request, true);
  if (contextState.blockerCodes) return blocked(contextState.blockerCodes);
  var authority = await freshAuthority(exactTuple);
  if (authority.blockerCodes) return blocked(authority.blockerCodes);
  // Validate context, read proof, compare exact dependencies.
  var finalAuthority = await freshAuthority(exactTuple);
  if (finalAuthority.blockerCodes ||
      !sameSourceSet(authority.visible, finalAuthority.visible) ||
      !sameGraphSnapshot(authority.snapshot, finalAuthority.snapshot)) {
    await withdrawStale(exactTuple, authority, proof);
    return blocked(['snapshot-stale']);
  }
  return boundedProjection(projectionFor(kind, proof));
}
~~~

**Private frozen facade** (lines 1534-1555):

~~~javascript
var facade = {
  recompute: recompute,
  inspectLineage: function(exactTuple, request) {
    return inspect('inspectLineage', exactTuple, request);
  },
  inspectStatus: function(exactTuple, request) {
    return inspect('inspectStatus', exactTuple, request);
  }
};
return Object.freeze(facade);
~~~

Do not publish the instantiated truth facade on globalThis, content messaging, MCP, or the corpus boundary state. The module factory global is the repository's classic-script loading contract; the created private facade stays closure-held in background.

### extension/config/config.js (config, CRUD)

**Analog:** the same file's defaults-backed loading.

**Defaults determine readable storage keys** (lines 14-58 and 127-139):

~~~javascript
constructor() {
  this.defaults = {
    modelProvider: 'xai',
    modelName: 'grok-4-1-fast',
    maxIterations: 100,
    debugMode: false
  };
}

async loadFromStorage() {
  const config = { ...this.defaults };
  const stored = await chrome.storage.local.get(Object.keys(this.defaults));
  Object.assign(config, stored);
  return config;
}
~~~

Add nullable/default-closed skopeoTruthTimezoneBinding and an empty skopeoTruthCalendars collection. Do not invent UTC/browser-timezone defaults and do not add a Phase 57 settings UI. Parsing and freshness remain trusted-background responsibilities.

### extension/background.js (controller / provider, request-response / event-driven)

**Analogs:** the same file's corpus controller plus extension/utils/skopeo-consequence-gate.js for one-shot token lifecycle.

**Classic import order** (extension/background.js lines 267-283):

~~~javascript
try { importScripts('utils/skopeo-corpus-schema.js'); } catch (e) { /* closed boot error */ }
try { importScripts('utils/skopeo-graph-engine.js'); } catch (e) { /* closed boot error */ }
try { importScripts('utils/skopeo-truth-schema.js'); } catch (e) { /* closed boot error */ }
try { importScripts('utils/skopeo-truth-engine.js'); } catch (e) { /* closed boot error */ }
~~~

Load HUD schema/projector once, after their corpus/graph/truth dependencies and before the trusted boundary constructs them. Add them to the boundary dependency gate; do not add manifest permissions.

**Exact message and operation vocabularies** (extension/background.js lines 1295-1354):

~~~javascript
const CONTENT_ACTIONS = new Set([
  'skopeo:corpus-root-status',
  'skopeo:corpus-status'
]);
const CORPUS_OPERATION_KINDS = new Set([
  'ingestion', 'query', 'display', 'citation-open', 'alert-delivery'
]);
const CORPUS_EFFECT_OPERATION_KINDS = new Set([
  'ingestion', 'citation-open', 'alert-delivery'
]);
const CORPUS_STATUS_KEYS = Object.freeze([
  'action', 'generation', 'exactOrigin', 'profileVersion', 'contextEpoch',
  'semanticEntityToken', 'currentSourceFileId', 'actionToken'
]);
~~~

Add a narrow projection request and a narrow citation action with separate exact key lists. Derive folder versus reading mode from the current semantic entity; never accept a caller-supplied mode, source ID, URL, locator, account ID, or tab ID.

**Authorization sandwich** (extension/background.js lines 2006-2053):

~~~javascript
async function runSkopeoCorpusOperation(
  kind, exactTuple, sourceSelection, callback, commitCallback
) {
  const effectful = CORPUS_EFFECT_OPERATION_KINDS.has(kind);
  const selection = exactCorpusSourceSelection(sourceSelection);
  const current = selection ? await currentCorpusFacadeEntry(exactTuple) : null;
  if (!selection || !current) return corpusDecision('closed');
  const operation = await kernel.authority.beginOperation(kind, context);
  if (!operation || operation.decision) return operation || corpusDecision('closed');
  const guardedCallback = async function() {
    if (!await currentCorpusFacadeEntry(exactTuple)) throw new Error('stale-corpus-tuple');
    const value = await callback.apply(null, arguments);
    if (!await currentCorpusFacadeEntry(exactTuple)) throw new Error('stale-corpus-tuple');
    return value;
  };
  // Effectful kinds receive the equivalent guarded commit callback.
  return await currentCorpusFacadeEntry(exactTuple) ? result : corpusDecision('closed');
}
~~~

**Closest display projector** (extension/background.js lines 2103-2161):

~~~javascript
async function projectActiveCorpus(current, actionToken) {
  const manifest = await boundary.store.getVisibleManifest(boundary.currentClaim);
  if (!manifest || !Array.isArray(manifest.sources) ||
      manifest.sources.length > MAX_CORPUS_OPERATION_SOURCES) {
    return corpusClosedProjection(actionToken);
  }
  const result = await runSkopeoCorpusOperation(
    'display', tuple, { sourceFileIds: sourceFileIds },
    async function(certificates, proof) {
      const freshManifest = await boundary.store.getVisibleManifest(boundary.currentClaim);
      // Build bounded minimized rows under fresh authority.
      return { rows: rows, aggregate: complete ? aggregate : null };
    }
  );
  if (!result || !Array.isArray(result.rows) || result.rows.length === 0) {
    return corpusClosedProjection(actionToken);
  }
  return deepFreezeSkopeo({ mode: 'active-corpus', rows: rows, actionToken: actionToken });
}
~~~

**One-shot opaque token pattern** (extension/utils/skopeo-consequence-gate.js lines 602-627, 700-705, 731-789, and 849-863):

~~~javascript
function mintActionToken() {
  var bytes = new Uint8Array(32);
  global.crypto.getRandomValues(bytes);
  return 'sg1_' + Array.from(bytes, function(value) {
    return value.toString(16).padStart(2, '0');
  }).join('');
}

function setTerminal(status, reason) {
  lifecycleEpoch += 1;
  state = { status: status, reason: reason, actionToken: null };
  binding = null;
  pendingAttempt = null;
  return gateFailure(status, reason);
}

// On confirmation, validate exact caller/tuple/token and consume before awaiting.
state = { status: STATUS.PENDING, reason: null, actionToken: null };
binding = null;
pendingAttempt = activeBinding;
~~~

Phase 57 application:

- Registry entries bind controller, tab, full context tuple/entity/projection, truth generation/context digest, family/citation, source revision, and one action kind.
- Revoke on projection replacement, abort, context drift, access/source drift, and committed use.
- Re-read current truth/citation and source metadata under citation-open; construct only an allowlisted Google Drive/Docs HTTPS target inside the guarded commit.
- Open a new foreground tab only after fresh authorization. Return a closed acknowledgement without URL/source/locator details.
- Build the civil date from an injected clock plus configured IANA timezone using Intl.DateTimeFormat(...).formatToParts(). There is no existing date-builder analog in this repository; follow 57-RESEARCH.md lines 146-154 exactly and test missing/malformed configuration closed.

### extension/content/skopeo-adaptive-composer.js (component / utility, transform)

**Analog:** the same file's versioned corpus model.

**Closed input-to-model composition** (lines 975-988 and 1052-1158):

~~~javascript
function corpusInput(value) {
  return hasExactKeys(value, ['authority', 'semanticEntity', 'actionToken', 'projection']) &&
    validateAuthority(value.authority) &&
    validCorpusEntity(value.semanticEntity, value.authority) &&
    corpusToken(value.actionToken, 160);
}

function corpusActive(input, projection) {
  if (input.semanticEntity.kind !== 'drive-folder' ||
      projection.mode !== 'active-corpus' ||
      projection.actionToken !== input.actionToken ||
      !isDenseDataArray(projection.rows, MAX_CORPUS_ROWS)) return null;
  // Normalize every row and validate aggregate membership.
  return model;
}

function composeCorpus(input) {
  try {
    if (!corpusInput(input) || !isPlainObject(input.projection)) return null;
    // Dispatch only closed modes.
    if (!model) return null;
    deepFreeze(model);
    return validateCorpusModel(model) ? model : null;
  } catch (_error) {
    return null;
  }
}
~~~

Create a separate contract-view model version with exactly folder, reading, and contract-closed modes. Map closed enums/reasons to the exact UI-SPEC copy here. Background-supplied labels/values remain bounded literal text; background text never supplies headings, instructions, action labels, HTML, or layout.

### extension/content/skopeo-runtime.js (controller, event-driven / request-response)

**Analog:** the same file's corpus refresh/currentness flow.

**Withdraw-first token lifecycle** (lines 628-643):

~~~javascript
function nextCorpusActionToken() {
  state.corpusActionEpoch += 1;
  return 'sc1_' + String(state.generation) + '_' +
    String(state.contextEpoch) + '_' + String(state.corpusActionEpoch);
}

function withdrawCorpusProjection() {
  state.corpusActionEpoch += 1;
  state.corpusModelToken = null;
  state.pendingCorpusToken = null;
  state.consumedCorpusToken = null;
  if (state.shell && typeof state.shell.withdrawCorpus === 'function') {
    try { state.shell.withdrawCorpus(); } catch (_error) {}
  }
  return true;
}
~~~

**Request, recheck, compose, recheck, render** (lines 689-732):

~~~javascript
async function requestCorpusProjection(action, tuple, actionToken) {
  const request = corpusClaim(action, tuple, actionToken);
  if (!request || state.pendingCorpusToken !== actionToken ||
      !sameCurrentCorpusTuple(tuple)) return false;
  let response;
  try {
    response = await chrome.runtime.sendMessage(request);
  } catch (_error) {
    response = null;
  }
  if (!isLive(tuple.generation) || state.pendingCorpusToken !== actionToken ||
      !sameCurrentCorpusTuple(tuple)) return false;
  const model = composeCorpusModel(tuple, actionToken, response);
  if (!model || !sameCurrentCorpusTuple(tuple) ||
      state.pendingCorpusToken !== actionToken) return false;
  return state.shell.renderCorpus(model) === true;
}

function refreshCorpusForCurrentContext() {
  withdrawCorpusProjection();
  const tuple = currentCorpusTuple();
  // Route verified folder versus Drive/Docs document only.
}
~~~

Extend this one flow instead of creating a second runtime. The content action request carries only the opaque action ID and exact current authority envelope. Do not put source IDs, URLs, locators, truth IDs, or storage authority in state.

**Terminal cleanup ordering** (lines 1335-1355):

~~~javascript
function terminateOwner(reason) {
  state.terminal = true;
  state.disposed = true;
  state.phase = 'terminal';
  state.controller.abort(state.teardownReason);
  state.actionEpoch += 1;
  state.pendingActionToken = null;
  withdrawCorpusProjection();
  // Dispose shell, listeners, registries, and publish exact-zero certificate.
}
~~~

### extension/content/skopeo-shell.js (component, event-driven)

**Analog:** the same file's corpus region and surface-scope lifecycle.

**Existing region/token/responsive conventions** (lines 518-590):

~~~javascript
'.skopeo-corpus-region {',
'  position: fixed;',
'  width: 280px;',
'  max-width: calc(100vw - 32px);',
'  border: 1px solid rgba(255, 241, 232, 0.18);',
'  border-radius: 12px;',
'  background: #0d0a09;',
'  overflow: auto;',
'}',
'@media (max-width: 480px) {',
'  .skopeo-corpus-region { left: 16px !important; right: 16px !important; width: auto; }',
'}',
'@media (prefers-reduced-motion: reduce) {',
'  *, *::before, *::after { transition-duration: 0ms !important; }',
'}',
'@media (forced-colors: active) {',
'  .skopeo-corpus-region { background: Canvas; color: CanvasText; }',
'}',
~~~

Replace the 280px/half-height corpus geometry with the approved 384px contract rail, 16px right inset, 64px top/bottom reserve, calc(100dvh - 128px), and below-480px single-column rule. Retain forced-colors and reduced-motion semantics.

**Authority, build, and atomic commit** (lines 2554-2585 and 2623-2727):

~~~javascript
_corpusAuthorityCanCommit(candidate) {
  if (!candidate || candidate.generation !== this.generation) return false;
  const current = this._corpusAuthority;
  if (!current) return true;
  if (candidate.contextEpoch < current.contextEpoch) return false;
  if (candidate.contextEpoch === current.contextEpoch &&
      candidate.semanticEntityToken !== current.semanticEntityToken) return false;
  return true;
}

withdrawCorpus() {
  const withdrawn = this._disposeCorpusScope();
  this._corpusAuthority = null;
  this._corpusModel = null;
  this._cancelAnnouncement();
  if (this._liveRegion) text(this._liveRegion, '');
  return withdrawn;
}

renderCorpus(model) {
  if (!composer.validateCorpusModel(model)) return false;
  const candidate = corpusAuthoritySnapshot(model);
  if (!this._corpusAuthorityCanCommit(candidate)) return false;
  const scope = this._buildCorpusScope(model);
  if (!scope || !this._corpusAuthorityCanCommit(candidate)) {
    if (scope) this._disposeSurfaceScope(scope);
    return false;
  }
  this._disposeCorpusScope();
  this._surface.appendChild(scope.node);
  this._corpusScope = scope;
  this._corpusAuthority = candidate;
  return true;
}
~~~

Build semantic h2/h3, ul/li, dl, time, status, and native button nodes with createElement/textContent only. Local eight-vendor paging belongs to the shell scope, resets on projection replacement, and performs no background request. The reading banner is first and sticky. Dispose paging handlers, busy citation controls, focus hooks, announcements, and action state with the same surface scope and destroy path.

### package.json (config, batch)

**Analog:** existing graph/truth aggregate ownership at lines 17-19.

~~~json
"test:skopeo-graph-evals": "node tests/skopeo-graph-schema.test.js && ...",
"test:skopeo-truth-evals": "node tests/skopeo-truth-schema.test.js && ... && node tests/skopeo-truth-evals.test.js"
~~~

Add test:skopeo-hud-evals with stable focused ordering and place npm run test:skopeo-hud-evals exactly once in scripts.test, after truth evaluation ownership. Do not install a framework or eval dependency.

### tests/skopeo-hud-schema.test.js (test, transform)

**Analog:** tests/skopeo-corpus-schema.test.js

**Harness and hostile accessor oracle** (lines 1-60):

~~~javascript
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function assertRejectedWithoutGetter(parser, fixture, key, label) {
  let reads = 0;
  const hostile = Object.assign({}, fixture);
  Object.defineProperty(hostile, key, {
    enumerable: true,
    get() {
      reads += 1;
      throw new Error('getter must not execute');
    }
  });
  assert.equal(parser(hostile), null, label + ' accessor is rejected');
  assert.equal(reads, 0, label + ' accessor is never executed');
}
~~~

**Classic/global surface oracle** (lines 147-178):

~~~javascript
assert.strictEqual(globalThis.FsbSkopeoCorpusSchema, schema);
assert.equal(Object.isFrozen(schema), true);
assert.deepEqual(Object.keys(schema).sort(), EXPECTED_SURFACE);
const source = fs.readFileSync(SCHEMA_PATH, 'utf8');
vm.runInContext(source, vm.createContext(sandbox), { filename: SCHEMA_PATH });
assert.strictEqual(sandbox.FsbSkopeoCorpusSchema, sandbox.module.exports);
~~~

Cover exact keys, prototypes, symbols, accessors, sparse arrays, safe bounded text, every enum, deep freeze, caps/max+1, explicit overflow, typed civil dates, and neutral Phase 58/59 slots.

### tests/skopeo-hud-projector.test.js (test, batch transform)

**Analog:** tests/skopeo-capability-projection.test.js

**Frozen-output and bounded failure pattern** (lines 37-76):

~~~javascript
function assertDeepFrozen(value, path = 'projection') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, path + ' is frozen');
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, path + '.' + key);
  }
}

function assertBoundedFailure(result, expectedStatus) {
  assert.equal(result && result.status, expectedStatus);
  assert.deepEqual(Object.keys(result).sort(), ['reason', 'status']);
  assertDeepFrozen(result, 'failure');
}
~~~

**Max-plus-one and authority-leak mutation pattern** (lines 476-520):

~~~javascript
const tooManyGroups = mutatedProjection(url, function(index) {
  index.groups = Array.from({ length: 13 }, function(_, offset) {
    return { id: 'group-' + offset };
  });
});
assertBoundedFailure(tooManyGroups, 'invalid');

const authorityLeakProjection = clone(validProjection);
authorityLeakProjection.rows[0].executionAuthority = {};
deepFreeze(authorityLeakProjection);
assert.equal(projector.validateProjection(authorityLeakProjection), false);
~~~

Add deterministic input-permutation tests and the full vendor/date/gap matrix. Explicitly compare complete owner absence against incomplete graph state, all four date types, over-32 truth closure, root-level policy evidence, and neutral memo/notification slots.

### tests/skopeo-truth-store.test.js (test, CRUD / file-I/O)

**Analog:** the same test file's generation tests.

**Pointer-last publication pattern** (lines 358-397):

~~~javascript
const handle = await mutate(store,
  (guard) => store.beginFamilyReplacement(replacementInput(proof), guard));
const staged = await mutate(store,
  (guard) => store.stageFamilySnapshot(handle, proof, guard));
await mutate(store,
  (guard) => store.publishFamilySnapshot(handle, staged.manifest, guard));
assert.equal(await store.readActiveFamily({
  partitionKey: proof.partitionKey,
  familyId: proof.familyId
}), null, 'snapshot is unreadable until complete generation commit');
const generation = await mutate(store,
  (guard) => store.publishPartitionGeneration({
    partitionKey: proof.partitionKey,
    authorizedSetDigest: proof.authorizedSetDigest,
    familyIds
  }, guard));
~~~

**Current membership oracle** (lines 688-730):

~~~javascript
const metadata = await harness.store.inspectMetadata({ partitionKey: PARTITION });
assert.equal(metadata.outputGenerationId, replacement.outputGenerationId);
assert.deepEqual(metadata.families.map((family) => family.familyId), [next.familyId],
  'partition metadata projects only complete current-generation membership');
~~~

Extend the exact created-store surface assertion and prove missing/corrupt/member-changed/max+1 reads return no prefix.

### tests/skopeo-truth-runtime.test.js (test, request-response / batch)

**Analog:** the same test file's facade/currentness harness.

**Injected production-shaped facade harness** (lines 346-402):

~~~javascript
const validateEvaluationContext = async ({ evaluationContext }) => {
  if (overrides.contextStale) {
    return Object.freeze({
      ok: false,
      blockerCodes: Object.freeze(['evaluation-context-stale'])
    });
  }
  const digest = await TruthSchema.sha256Hex(evaluationContext);
  return Object.freeze({ ok: true, contextDigest: digest.slice('sha256:'.length) });
};

const facade = TruthEngine.create({
  truthSchema,
  truthStore,
  graphFacade: Object.freeze({
    async snapshotExactSet() {
      return Object.freeze({ decision: 'admitted', value: snapshot() });
    }
  }),
  validateEvaluationContext,
  byteLength(value) { return Buffer.byteLength(value, 'utf8'); }
});
~~~

**Exact private surface and stale withdrawal** (lines 405-474):

~~~javascript
exactKeys(harness.facade, [
  'recompute', 'inspectLineage', 'inspectFacts', 'inspectConflicts',
  'inspectCitations', 'inspectDeadline', 'inspectStatus'
], 'truth facade exposes exactly seven methods');

const staleResult = await stale.facade.inspectStatus(tuple, request);
assert.deepStrictEqual(staleResult.blockerCodes, ['snapshot-stale']);
assert.ok(stale.trace.includes('withdraw'),
  'changed authority withdraws stale truth before returning');
~~~

Update the expected facade to include only inspectDisplaySnapshot, then test full-generation equality, no content/global/MCP exposure, 64 KiB cap, source/version/digest/context drift, no prefix, and fresh before/after authority checks.

### tests/skopeo-hud-runtime.test.js (test, request-response / event-driven)

**Analogs:** tests/skopeo-corpus-runtime.test.js and tests/skopeo-consequence-gate.test.js

**Background-controller extraction harness** (tests/skopeo-corpus-runtime.test.js lines 1093-1165):

~~~javascript
const controllerSource = markedSource(
  BACKGROUND_SOURCE,
  '/* FSB_SKOPEO_CONTROLLER_START */',
  '/* FSB_SKOPEO_CONTROLLER_END */'
);
const exportAnchor = '  global.FSBSkopeoController = controller;';
const instrumented = controllerSource.replace(exportAnchor, [
  '  controller.__testInstallCorpusEntry = function(config) {',
  '    installController(config.tabId, config.generation, projection);',
  '    return corpusFacadeTuple(config.tabId, controllers.get(config.tabId));',
  '  };',
  exportAnchor
].join('\n'));
~~~

**Minimization assertions** (tests/skopeo-corpus-runtime.test.js lines 1412-1424):

~~~javascript
const projection = await harness.controller.handleContentMessage(message, harness.sender);
assert.strictEqual(projection.mode, 'active-corpus');
assert.strictEqual(JSON.stringify(projection).includes('drive-file-A'), false,
  'content projection contains no source ID');
assert.strictEqual(JSON.stringify(projection).includes('permission-A'), false,
  'content projection contains no account permission ID');
~~~

**Replay/parallel/late matrix** (tests/skopeo-consequence-gate.test.js lines 933-995):

~~~javascript
const reopenedResult = await gate.confirm(freshRequest, caller);
assert.equal(reopenedResult.success, true);
const oldReplay = await gate.confirm(oldRequest, caller);
assert.equal(oldReplay.status, 'stale');

const pending = gate.confirm(request, caller);
const parallel = await gate.confirm(request, caller);
assert.equal(parallel.status, 'stale');
gate.invalidate('kill');
const late = await pending;
assert.equal(late.reason, 'late-result');
~~~

Cover exact messages, sender tab, folder/reading derivation, recompute dedupe/abort, withdrawal-first races, controller replacement, one-shot citation prepare/commit, cross-tab/revision/access rejection, allowed destination construction, and zero raw authority in responses.

### tests/skopeo-adaptive-composer.test.js (test, transform)

**Analogs:** the same file's hostile-copy tests plus composeCorpus tests in tests/skopeo-corpus-runtime.test.js.

**Hostile model mutation pattern** (tests/skopeo-adaptive-composer.test.js lines 570-596):

~~~javascript
const value = mutableClone(source);
mutate(value);
deepFreeze(value);
assert.strictEqual(composer.validateRenderModel(value), false);

const hostileContext = mutableClone(contextFor('reader-knowledge'));
hostileContext.app.displayName = '<img src=x onerror=globalThis.__skopeoPwned=1>';
deepFreeze(hostileContext);
const hostileModel = composer.compose(inputFor(hostileContext));
assert.strictEqual(JSON.stringify(hostileModel).includes('<img'), false);
~~~

Add exact contract-view modes, semantic enum-to-copy mapping, no background-supplied instruction/action labels, no ask/draft/send/approval/notification controls, stale token rejection, and opaque citation dispatch.

### tests/skopeo-browser-contract.test.js (test, event-driven)

**Analog:** the same file's runCorpusEnrollmentContract().

**Real shell, 100-cycle, focus, and residue pattern** (lines 817-903):

~~~javascript
const shell = FSBSkopeoShell.createShell({
  document,
  window,
  generation: 18,
  fixtureToken,
  allowControlledFixture: true,
  onCorpusAction(payload) { actions.push(payload); return true; }
});
const prepared = shell.prepareAmbient();
assert.ok(prepared && shell.mountAmbient(prepared));

for (let cycle = 0; cycle < 100; cycle += 1) {
  const model = FSBSkopeoAdaptiveComposer.composeCorpus(fixtureFor(cycle));
  assert.equal(shell.renderCorpus(model), true);
  assert.equal(root.querySelectorAll('.skopeo-corpus-region').length, 1);
  assert.equal(shell.withdrawCorpus(), true);
  assert.equal(root.querySelector('.skopeo-corpus-region'), null);
}
const zero = shell.destroy('browser-corpus-enrollment');
~~~

Extend this contract with approved folder/reading models, sticky state banner, local paging, native button/focus order, 384px and below-480px geometry, 200% zoom, reduced motion, forced colors, same-document identity drift, citation busy/failure state, host-state equality, and exact zero residue.

### tests/skopeo-hud-evals.test.js (test, batch)

**Analog:** tests/skopeo-truth-evals.test.js

**Versioned fixture loading and exact shape** (lines 1-74 and 176-220):

~~~javascript
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'skopeo-truth-evals');
const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, 'manifest.json'), 'utf8'));
const cases = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, 'cases.json'), 'utf8'));

function verifyFixtureShape() {
  deepFreeze(manifest);
  deepFreeze(cases);
  assert.ok(frozenTree(manifest) && frozenTree(cases));
  assert.strictEqual(manifest.network_allowed, false);
  assert.strictEqual(manifest.llm_judge_allowed, false);
  assert.deepStrictEqual(cases.map((item) => item.id), manifest.ordered_case_ids);
  for (const item of cases) {
    exactKeys(item, CASE_KEYS, item.id + ' has exact case metadata');
  }
}
~~~

**Honest evidence reporting** (lines 1322-1346):

~~~javascript
let deterministicStatus = 'fail';
let provisionalStatus = 'fail';
let domainStatus = 'human_needed';
verifyFixtureShape();
domainStatus = domainReviewStatus(cases);
assert.strictEqual(domainStatus, 'human_needed');
await verifyProductionHarness();
deterministicStatus = 'pass';
console.log('deterministic_structural_security: ' + deterministicStatus);
console.log('provisional_regression: ' + provisionalStatus + ' (not gold)');
console.log('domain_fidelity: ' + domainStatus);
~~~

Use at least the 20 cases enumerated in 57-RESEARCH.md. Keep deterministic structural/security, provisional synthetic regression, legal/domain review, and authorized live Drive/Docs UAT as separate statuses.

### tests/fixtures/skopeo-hud-evals/manifest.json (config / fixture, batch)

**Analog:** tests/fixtures/skopeo-truth-evals/manifest.json lines 1-51.

~~~json
{
  "version": "skopeo-truth-evals/v1",
  "fixture_policy": "synthetic-or-irreversibly-redacted",
  "network_allowed": false,
  "llm_judge_allowed": false,
  "configured_provider_run_allowed": false,
  "domain_fidelity_policy": "human_needed_until_genuine_required_role_approval",
  "case_file": "cases.json",
  "ordered_case_ids": ["G01", "G02"],
  "production_versions": {},
  "required_reviewer_role_codes": [],
  "report_lines": [
    "deterministic_structural_security",
    "provisional_regression",
    "domain_fidelity"
  ]
}
~~~

Bind HUD schema/projector/runtime/content model versions explicitly and enumerate every case in stable order.

### tests/fixtures/skopeo-hud-evals/cases.json (config / fixture, batch)

**Analog:** tests/fixtures/skopeo-truth-evals/cases.json lines 1-19.

~~~json
[
  {
    "id": "G01",
    "category": "G",
    "critical": true,
    "scenario": "cited executed and effective active base agreement is governing",
    "data_class": "synthetic",
    "versions": {},
    "authority_transitions": [
      "certify-complete-visible-set",
      "snapshot-exact-set",
      "publish-pointer-last",
      "inspect-current"
    ],
    "expected": {},
    "forbidden_marker_probes": ["G01_PRIVATE_SOURCE_TEXT"],
    "label_version": "truth-provisional-v1",
    "gold_label_version": null,
    "review_status": "pending",
    "required_reviewer_roles": [],
    "approved_reviewer_roles": [],
    "review_record_ref": null
  }
]
~~~

Keep cases synthetic/redacted, closed-keyed, version-bound, and explicit about forbidden leaks and human approval.

## Shared Patterns

### Authorization and Currentness

**Source:** extension/background.js lines 1944-2053
**Apply to:** background projection, truth inspection, recompute, citation open

The authorization equivalent in this extension is not HTTP auth middleware. It is the exact current controller/corpus tuple plus a fresh Phase 54 operation. Check it before and after callbacks; effectful citation-open additionally checks before and after the commit callback.

### Fail-Closed Error Handling

**Sources:** extension/utils/skopeo-truth-engine.js lines 1464-1531; extension/content/skopeo-runtime.js lines 689-713
**Apply to:** every background/service/content request path

- Catch collaborator/storage/message exceptions at the boundary.
- Return a typed blocked/contract-closed result or false/null; never leak raw exceptions.
- Publish no prefix on malformed, over-cap, stale, incomplete, or dependency-mismatched input.
- Withdraw the previous view before loading/recompute/rebind. A stale completion cannot repaint.

### Validation and Immutability

**Sources:** extension/utils/skopeo-corpus-schema.js lines 104-178; extension/utils/skopeo-capability-projector.js lines 802-900
**Apply to:** HUD schema, projector, truth display snapshot, content composer

- Reflect.ownKeys plus property descriptors for untrusted boundary input.
- Exact closed key sets at every level.
- Dense arrays, finite caps, uniqueness constraints, bounded control-free text.
- Fresh output objects, then recursive freeze, then validation before publication.

### Background-Only Authority and Minimized Content

**Sources:** extension/background.js lines 2103-2161; tests/skopeo-corpus-runtime.test.js lines 1412-1424
**Apply to:** background, composer, runtime, tests

Content receives semantic state, bounded display values, explicit overflow, and opaque action IDs only. It never receives account/root/source/graph/truth/storage IDs, URLs, resource keys, certificates, provider responses, raw records, or private facades.

### One-Shot Effects

**Sources:** extension/utils/skopeo-consequence-gate.js lines 602-627 and 700-863; tests/skopeo-consequence-gate.test.js lines 933-995
**Apply to:** citation-open registry and runtime tests

Mint unpredictable tokens, bind every authority dimension, consume before awaiting the effect, reject parallel/replay/cross-tab/stale use, and suppress late completion after invalidation.

### DOM, Accessibility, and Teardown

**Sources:** extension/content/skopeo-shell.js lines 518-590, 2554-2727, and 3373-3440
**Apply to:** composer/shell/browser contract

- One existing Shadow root and one contract region.
- createElement/textContent only; semantic headings/lists/definition lists/time/status/native buttons.
- Host focus stays put on mount; hide restores current lens focus when safe.
- Forced colors and reduced motion preserve meaning.
- One surface scope owns nodes/listeners/focus/action state; withdraw/destroy synchronously clears it and the eleven-category resource ledger returns exact zero.

### Test Organization

**Sources:** tests/skopeo-corpus-schema.test.js, tests/skopeo-corpus-runtime.test.js, tests/skopeo-truth-evals.test.js
**Apply to:** all Phase 57 tests

Tests are executable Node scripts using node:assert, direct CommonJS imports or marked-source VM harnesses, deterministic fake Chrome/DOM/storage collaborators, an async main/run wrapper, one PASS line, and process.exitCode on failure. No test runner or network dependency is introduced.

## No Analog Found

No planned file lacks a useful mechanical analog. However, there is intentionally no existing contract-truth HUD whose semantic copy or legal conclusions should be copied. The governing/historical/date/gap language, geometry, accessibility, and action labels must come from 57-UI-SPEC.md, while the files above supply implementation mechanics only.

The trusted civil-date builder using an injected clock and configured IANA timezone also has no suitable repository analog. Implement it directly from 57-RESEARCH.md; do not copy the unrelated locale/UTC fallback in catalog handlers.

## Regression-Only and Conditional Files

| File | Default Treatment | Escalation Condition |
|---|---|---|
| extension/utils/skopeo-drive-corpus-transport.js | regression-only | Existing getFile()/opaque resource-key seam cannot freshly resolve an authorized vendor/source target |
| tests/skopeo-drive-corpus-transport.test.js | regression-only | Transport must change |
| extension/content/skopeo-renderer-registry.js | regression-only | Approved contract model cannot be expressed by existing atoms plus shell-owned vendor-card DOM |
| extension/manifest.json | unchanged | No expected condition; Phase 57 adds no permission or content-script file |
| tests/skopeo-shell-contract.test.js | regression-only | Browser/HUD runtime tests cannot own a newly exposed shell unit seam |
| tests/skopeo-session-lifecycle.test.js | regression-only | Existing teardown oracle requires a Phase 57-specific fixture hook |
| tests/skopeo-corpus-runtime.test.js | regression-only | Existing Phase 54 contract must change rather than remain a stable regression |
| scripts/verify-skopeo-storage-boundary.mjs | regression-only | Static gate must recognize a new private module without weakening forbidden content access |

## Metadata

**Analog search scope:** extension/, extension/utils/, extension/content/, extension/config/, tests/, tests/fixtures/, scripts/, package.json
**Files scanned:** 932 repository files under extension, tests, and scripts; analog search stopped after five strong pattern families were established
**Concrete source files excerpted:** 21, including direct extension points and their existing tests
**Project instructions:** no repository AGENTS.md and no project-local .codex/skills or .agents/skills were present
**Pattern extraction date:** 2026-08-11
