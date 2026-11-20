# Phase 53: Drive Context Router & Semantic Anchors - Pattern Map

**Mapped:** 2026-07-15
**Files analyzed:** 15 new or modified files
**Analogs found:** 15 / 15 (some are intentionally composite; there is no existing semantic-DOM anchor registry)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `extension/content/skopeo-context-router.js` | utility/reducer | transform + event-driven | `extension/catalog/handlers/gdocs.js`; `extension/utils/skopeo-session-state.js` | composite role-match |
| `extension/content/skopeo-anchor-registry.js` | service/registry | event-driven + async request-response | `extension/content/skopeo-runtime.js`; scoped ownership in `extension/content/skopeo-shell.js` | composite role-match |
| `extension/content/skopeo-runtime.js` | controller | event-driven | its existing generation owner and terminal reducer | exact extension |
| `extension/content/skopeo-shell.js` | component/provider | event-driven render transform | its existing scoped surface transaction and geometry certificate | exact extension |
| `extension/background.js` | controller/config | event-driven request-response | existing dedicated Skopeo injection/controller region | exact extension |
| `tests/skopeo-context-router.test.js` | contract test | transform | reducer tests in `tests/skopeo-session-lifecycle.test.js` plus exact-origin handler tests | role-match |
| `tests/skopeo-anchor-registry.test.js` | VM/DOM contract test | event-driven + async | runtime VM harness in `tests/skopeo-session-lifecycle.test.js`; DOM harness in `tests/skopeo-shell-contract.test.js` | composite role-match |
| `tests/skopeo-session-lifecycle.test.js` | integration test | event-driven | its production-runtime VM harness | exact extension |
| `tests/skopeo-shell-contract.test.js` | DOM contract test | event-driven render | its injected DOM/clock/resource harness | exact extension |
| `tests/skopeo-accessibility.test.js` | accessibility test | event-driven render | its shared shell harness and removal/focus assertions | exact extension |
| `tests/skopeo-sidepanel-command.test.js` | worker/injection contract test | request-response | its static bundle and executeScript assertions | exact extension |
| `tests/extension-content-script-files-completeness.test.js` | static config test | file-I/O transform | its array parser and extension-relative path guard | exact extension |
| `tests/skopeo-browser-contract.test.js` | real-browser contract test | file-I/O + event-driven | its local Chrome fixture, computed rectangles, and exact-zero assertions | exact extension |
| `tests/helpers/skopeo-resource-ledger.js` | test utility | event-driven accounting | its canonical eleven-category ledger | exact extension |
| `package.json` | config | batch | existing ordered `scripts.test` Skopeo segment | exact extension |

## Pattern Assignments

### `extension/content/skopeo-context-router.js` (utility/reducer, transform)

**Analogs:** `extension/catalog/handlers/gdocs.js:177-210`, `extension/utils/skopeo-session-state.js:213-257`, and the exact-envelope guard in `extension/content/skopeo-runtime.js:24-40`.

**Exact-origin parsing pattern** (`gdocs.js:186-210`):

```js
function currentDocumentContext(ctx) {
  var url = activeUrl(ctx);
  try {
    var parsed = new URL(url);
    if (parsed.origin !== ORIGIN) { return null; }
    var match = parsed.pathname.match(/\/document\/d\/([^/]+)/);
    if (!match || !match[1]) { return null; }
    return { documentId: decodeURIComponent(match[1]), tabId: parsed.searchParams.get('tab') || '', url: url };
  } catch (err) {
    return null;
  }
}
```

**Closed reducer/export pattern** (`skopeo-session-state.js:213-257`):

```js
function reduceSession(current, event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return record;
  if (typeof event.type !== 'string') return record;
  switch (event.type) {
    case 'BEGIN': return beginGeneration(record, event.tabId, event.now);
    default: return record;
  }
}
var api = Object.freeze({ STATUS: STATUS, reduceSession: reduceSession });
globalThis.FSBSkopeoSessionState = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
```

**Reuse guidance:** use a classic-script IIFE with frozen vocabularies and a CommonJS test export. Parse with `new URL` and exact `origin` equality before paths. Validate exact own-key sets as `isExactEnvelope` does; return one frozen `recognized`, `uncertain`, or `unsupported` object instead of throwing. Increment the epoch in a pure reducer. Unlike `resolveDocumentId`, URL or an explicit string alone must not authorize configured-corpus/vendor/target meaning: require a normalized trusted identity hint plus closed evidence. Do not read DOM, render, fetch, log page strings, or inherit Phase 54 permission authority.

### `extension/content/skopeo-anchor-registry.js` (service/registry, event-driven)

**Analogs:** lifecycle authority in `skopeo-runtime.js:62-126`, scoped ownership in `skopeo-shell.js:800-842`, and geometry rejection in `skopeo-shell.js:1037-1047`.

```js
function isLive(generation) {
  return !state.disposed && !state.terminal && state.generation === generation &&
    state.controller && !state.controller.signal.aborted;
}

_disposeSurfaceScope(scope) {
  if (!scope || scope.disposed) return false;
  scope.disposed = true;
  const handles = scope.handles.slice().reverse();
  for (const handle of handles) this._releaseSurfaceHandle(handle, true);
  for (const node of scope.nodes.slice()) {
    if (node && node.parentNode === this._surface) this._surface.removeChild(node);
  }
  return true;
}
```

**Reuse guidance:** make descriptors immutable normalized data; keep node/`Range`, binding epoch, geometry, and resolver state in a disposable live record. Inject `window`, `document`, `AbortSignal`, resource ledger, authority predicate, and shell-withdraw/commit callbacks for deterministic tests. On every relevant signal, synchronously validate and withdraw before scheduling bounded re-resolution. Coalesce work into one owned validation frame; register observers/listeners/frames/pending work in the existing eleven categories. After every await and immediately before commit, require matching generation, context epoch, semantic identity, binding epoch, connection, validator result, and safe geometry. A reused node and ABA return require fresh binding authority. Export with the same frozen global/CommonJS pattern. Do not copy `lifecycle.js:380-443` full-document subtree observer or its permanent history monkey-patch at `453-517`.

### `extension/content/skopeo-runtime.js` (controller, event-driven)

**Analog:** existing prepare/commit/terminate owner, especially `skopeo-runtime.js:170-248` and `283-367`.

```js
state.terminal = true;
state.disposed = true;
state.phase = 'terminal';
if (state.controller && !state.controller.signal.aborted) state.controller.abort(state.teardownReason);
// destroy owned visual resources, remove listeners, then delete sentinel
```

**Reuse guidance:** add context epoch, route result, and registry to this one owner; do not add a parallel lifecycle. Initialize router/registry during prepare/commit under the current controller. Same-document route changes must increment epoch, withdraw anchors, and reroute without a new generation. Keep `pagehide`, kill, replacement, unsafe page, and hard navigation terminal and abort-first. Route results become typed shell models; the registry never renders directly. Extend snapshots only with closed metadata and preserve exact-zero teardown.

### `extension/content/skopeo-shell.js` (component/provider, render transform)

**Analog:** text-only creation at `373-390`, transactional build/commit at `973-1023` and `1105-1129`, announcements at `1271-1307`, teardown at `1432-1473`.

```js
function text(node, value) {
  node.textContent = value == null ? '' : String(value);
  return node;
}

_commitSurfaceScope(scope) {
  if (!scope || scope.disposed || !this._surface || !this._host) return false;
  // attach staged nodes, remove staging/aria-hidden, then publish scope identity
  this._activeSurfaceScope = scope;
  return true;
}
```

**Reuse guidance:** add a narrow ambient projection API and an anchor-only disposable scope; keep visual ownership here. Copy only runtime-owned closed labels/reasons through `textContent`. Reuse stage/validate/commit and `_disposeSurfaceScope` so invalid anchors are removed from DOM and accessibility tree, never opacity-hidden. The mark is one pointer-transparent, non-focusable, `aria-hidden` 8x8 node; do not reuse the current interactive demo button semantics. Revalidate target/candidate geometry at commit. Preserve one polite atomic live region, latest-wins cadence, no focus write for ambient/anchor transitions, and existing destroy order/resource snapshot.

### `extension/background.js` (controller/config, event-driven)

**Analog:** `background.js:565-596` and start ordering at `903-923`.

```js
const SKOPEO_INJECTION_FILES = Object.freeze([
  'content/skopeo-shell.js',
  'content/skopeo-runtime.js'
]);
await chrome.scripting.executeScript({
  target: { tabId: tabId, frameIds: [0] },
  files: SKOPEO_INJECTION_FILES
});
```

**Reuse guidance:** insert router and registry ahead of shell/runtime in dependency order and nowhere in `CONTENT_SCRIPT_FILES` or the ws fallback bundle. Preserve record-write/broadcast before injection and generation checks after each await. Keep `tabs.onUpdated` hard-document handling terminal; same-document rerouting belongs to the already-active content runtime and must not create a second invocation path.

### `tests/skopeo-context-router.test.js` (contract test, transform)

**Analogs:** table/reducer assertions in `skopeo-session-lifecycle.test.js:204-488` and production-module loading in `skopeo-accessibility.test.js:23-28`.

**Reuse guidance:** require the production CommonJS export, use table-driven exact deep equality, and assert frozen result shapes/closed keys. Pair every positive with missing/conflicting trusted ID, malformed URL, opaque URL, restricted scheme, and near-neighbor origins such as `docs.google.com.evil.example`. Cover all four recognized kinds, all fail-quiet reason classes, epoch changes when identity changes, bounded hostile strings, and prove no page-derived label enters output. Avoid duplicating production logic as an oracle.

### `tests/skopeo-anchor-registry.test.js` (VM/DOM contract test, event-driven + async)

**Analogs:** production classic-script VM harness in `skopeo-session-lifecycle.test.js:1087-1176`, injected DOM/clock/ledger in `skopeo-shell-contract.test.js:650-699`, and non-vacuous ledger negatives in `tests/helpers/skopeo-resource-ledger.js:149-197`.

```js
const context = vm.createContext(sandbox);
const source = fs.readFileSync(modulePath, 'utf8');
vm.runInContext(source, context, { filename: modulePath });

const ledger = new SkopeoResourceLedger('anchor-harness');
// inject deterministic window/document/scheduler and inspect exact resource snapshots
```

**Reuse guidance:** build one deterministic virtualized-row fixture whose same node changes `file-A -> file-B -> file-A`, can reorder/detach/reattach/change rects, and whose resolver promises complete in controlled reverse order. Expose mutation/scroll/resize/zoom/navigation dispatch and a manual frame queue; use no real sleeps. Assert synchronous withdrawal before draining promises, final tuple rejection, viewport-bounded queries, one coalesced frame, non-zero observer/frame/pending counts while live, and exact eleven-key zero after repeated disposal.

### Existing Node/VM contract tests

- **`tests/skopeo-session-lifecycle.test.js`:** extend its VM harness (`1087-1203`) with router/registry globals and route dispatch. Assert same-document changes advance only context epoch, reverse completions are inert, while `pagehide` still emits navigation kill (`1399-1455`) and terminal callbacks remain inert.
- **`tests/skopeo-shell-contract.test.js`:** reuse `createHarness` (`650-699`), hostile-text assertions (`1009-1028`), and geometry invalidation (`1287-1310`). Assert exact closed copy, generic text sinks, one mark only, synchronous scope disposal, no host mutation/focus write, and exact-zero destroy.
- **`tests/skopeo-accessibility.test.js`:** reuse the production shared harness (`23-73`) and `assertAbsent`. Assert anchored/ambient region names, mark `aria-hidden`/non-focusable/pointer-transparent, one polite atomic live region, one announcement per semantic transition, no alert/gate, and removed rather than visually hidden surfaces.
- **`tests/skopeo-sidepanel-command.test.js`:** update both exact arrays at `876-884` and executeScript expectation at `1911-1920`; assert every dedicated module appears once and remains absent from both always-loaded bundles.
- **`tests/extension-content-script-files-completeness.test.js`:** preserve its safe relative-path parser (`11-27`) and add a dedicated-bundle check only if needed; never add Skopeo files to its required always-loaded list.

### `tests/skopeo-browser-contract.test.js` (real-browser contract, file-I/O + events)

**Analog:** local fixture/Chrome runner at `62-115` and `659-695`, computed rectangle helpers at `218-239`, resize rollback assertions at `763-785`.

```js
const run = childProcess.spawnSync(resolution.executable, [
  '--headless=new', '--force-device-scale-factor=1',
  '--window-size=' + width + ',' + height,
  '--dump-dom', url.pathToFileURL(fixturePath).href
], { timeout: 5000, killSignal: 'SIGKILL' });
```

**Reuse guidance:** extend this same generated fixture rather than introduce Puppeteer. Create real rows with stable test attributes and rectangles, reuse one node across identities, reorder/scroll, resize to 420 CSS px, and apply zoom/device-scale scenarios. Serialize observations through the result node. Assert no wrong-identity mark at any sampled state, candidate clearance/inset, zero positional interpolation, no host interception, and exact-zero destroy. Keep live Google reconnaissance separate and honestly `human_needed`; synthetic Chrome does not prove Google selectors.

### `tests/helpers/skopeo-resource-ledger.js` and `package.json`

**Analog:** ledger acquisition/release at `skopeo-resource-ledger.js:41-99` and reverse cleanup at `115-145`; test registration is the existing Skopeo tail in `package.json:17`.

**Reuse guidance:** prefer existing categories (`observers`, `animationFrames`, `pendingRenders`, `listeners`) over inventing a twelfth. Ensure tests see non-vacuous 0->1->0 transitions and reverse cleanup. Register the two new tests adjacent to the Phase 52 Skopeo tests, with router before registry before integration/browser tests; keep direct focused commands usable as specified in `53-VALIDATION.md`.

## Shared Patterns

### Authority and stale-work rejection

**Source:** `extension/content/skopeo-runtime.js:123-126`, `338-367`; `extension/utils/skopeo-session-state.js:206-210`.

Apply to router, registry, runtime, and every async test: admission checks are insufficient. Recheck the complete `{generation, contextEpoch, semanticIdentity, bindingEpoch}` tuple at the final side effect after every await.

### Fail-closed parsing and output

**Source:** `extension/catalog/handlers/gdocs.js:186-210`; `extension/content/skopeo-runtime.js:28-40`; `extension/content/skopeo-shell.js:373-390`.

Use exact origins, closed own-key vocabularies, bounded normalized IDs/evidence, and literal `textContent`. Invalid or unknown input returns a typed failure and zero anchor projection; it never expands selectors, reason codes, HTML, or visible labels.

### Resource ownership and teardown

**Source:** `extension/content/skopeo-shell.js:523-545`, `830-842`, `1432-1473`; `tests/helpers/skopeo-resource-ledger.js:41-145`.

Every listener, observer, frame, timeout, and pending resolver belongs to the active generation and releases once in reverse order. Terminal is set before abort; withdrawal is synchronous; destroy is idempotent and returns exactly the canonical eleven zero keys.

### Observation boundary (anti-pattern guard)

`extension/content/lifecycle.js:380-443` demonstrates batching and `453-517` demonstrates Google SPA signals, but Phase 53 must not copy its full `document.body` subtree observer, broad class/label evidence, hostname substring test, or unrestored history monkey-patches. Narrow the root to relevant bounded candidates, pin exact origins, own every signal through the registry ledger, and restore anything patched.

## No Exact Analog Found

| File | Missing exact precedent | Planner direction |
|---|---|---|
| `extension/content/skopeo-anchor-registry.js` | No existing service separates semantic identity from a revocable DOM/Range binding with ABA protection | Compose runtime authority, shell ledger/scope disposal, and browser geometry patterns; use `53-RESEARCH.md` for the descriptor/binding contract |
| Live Drive/Docs reconnaissance evidence | Synthetic fixtures exist, but no committed current-Google selector/identity evidence contract exists | Treat live signals as an explicit evidence task; never turn class names, text, DOM position, or one happy fixture into authority |

## Metadata

**Analog search scope:** `extension/content`, Skopeo worker/session modules, Drive/Docs catalog handlers, Skopeo Node/VM/Chrome tests, test helpers, and package scripts
**Primary source files read:** 16
**Knowledge-graph cross-check:** existing graph was queried but returned stale/unrelated nodes, so all assignments above are grounded in direct source reads
**Pattern extraction date:** 2026-07-15
