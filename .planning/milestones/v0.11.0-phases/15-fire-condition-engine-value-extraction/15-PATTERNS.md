# Phase 15: Fire-Condition Engine & Value Extraction - Pattern Map

**Mapped:** 2026-06-16
**Files analyzed:** 7 (2 CREATE source, 2 MODIFY source, 2-3 CREATE test, 1 MODIFY config)
**Analogs found:** 7 / 7 (every file has at least a role-match; the locale parser and ReDoS guard are net-new ALGORITHMS but reuse a proven MODULE SHELL)

> All file paths below are repo-relative to `/Users/lakshmanturlapati/conductor/workspaces/fsb/rio-de-janeiro`.
> Source files this phase touches are READ-ONLY references here; the planner copies the cited excerpts into PLAN action steps. The only seam EDIT is the one-line `evaluated_noop` swap in `trigger-lifecycle.js` and 2 additive lines in `background.js`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `extension/utils/value-extractor.js` (CREATE) | utility (pure) | transform | `extension/utils/trigger-store.js` (module SHELL only) | shell-match (algorithm net-new) |
| `extension/utils/trigger-manager.js` (CREATE) | service (pure evaluate + stateful cap) | transform + CRUD-gate | `extension/utils/agent-registry.js` (cap) + `extension/utils/trigger-lifecycle.js` (shell + `_getStore`) | role-match (composite) |
| `extension/utils/trigger-lifecycle.js` (MODIFY) | middleware (SW alarm handler / SEAM owner) | event-driven | itself — replace `evaluated_noop` (`:282-290`) in-place | exact (in-file edit) |
| `extension/background.js` (MODIFY) | config (SW bootstrap `importScripts`) | request-response | itself — Phase-14 glue region (`:35-42`) | exact (in-file edit) |
| `tests/value-extractor.test.js` (CREATE) | test (pure, no chrome) | batch/assert | `tests/trigger-store.test.js` (fresh-require) + the locale matrix in RESEARCH `:640-657` | role-match |
| `tests/trigger-manager.test.js` (CREATE) | test | batch/assert | `tests/trigger-lifecycle.test.js` (inline chrome+alarms mock, Case F) | role-match |
| `tests/trigger-cap.test.js` (CREATE, recommended split) | test (cap) | batch/assert | `tests/agent-cap.test.js` (cap rejection + clamping) | exact (clone) |
| `package.json` (MODIFY) | config (test script) | n/a | itself — `scripts.test` tail (`:16`) | exact (append) |

**Test-file count decision (planner's call):** RESEARCH `:190-194,670-674` recommends a **3-file split** — `value-extractor.test.js` (P1), `trigger-manager.test.js` (P2 condition engine), `trigger-cap.test.js` (P2 cap clone). The Phase-15 prompt file-list folds the cap into `trigger-manager.test.js` (2 test files). Either works; the 3-file split is cleaner because the cap test's analog (`tests/agent-cap.test.js`) needs `storage.local` + a mock store while the pure-`evaluate()` tests need neither. Whichever is chosen, **all new test files are appended to `package.json` `scripts.test`** (one append).

---

## Pattern Assignments

### `extension/utils/value-extractor.js` (utility, pure transform)

**Analog (module SHELL):** `extension/utils/trigger-store.js`
**Algorithm:** NET-NEW — confirmed zero `Intl.NumberFormat`/`formatToParts` anywhere in `extension/` (D-03, RESEARCH `:13`). The CODE-BODY recipe lives in RESEARCH `:438-501` (verified empirically in Node v25.9.0); copy it, not a codebase file.

**Dual-export IIFE shell to mirror** (`trigger-store.js:1-2,185-200`) — `value-extractor.js` needs NO `_getChrome()` (pure `Intl`/string math; D-03), so OMIT the chrome resolver but keep the dual-export wrapper:
```javascript
// extension/utils/trigger-store.js:1-2 (open) and :185-200 (close)
(function(global) {
  'use strict';
  // ... pure logic ...
  var exportsObj = {
    /* parseLocaleNumber, extractValue, ... */
  };
  global.FsbValueExtractor = exportsObj;            // SW importScripts consumer
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                    // Node test consumer
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

**Core parse recipe to copy** (RESEARCH `:438-501`, NOT a codebase file — the recipe is the source of truth):
```javascript
var _sepCache = new Map();   // locale -> { group, decimal }  (NumberFormat ctor is expensive; memoize per locale)
function _discoverSeparators(locale) { /* Intl.NumberFormat(locale).formatToParts(11000.1) -> group/decimal */ }
function parseLocaleNumber(raw, opts) {
  // (1) parens-negative + sign  (2) detect %, record isPercent  (3) LITERAL split/join remove group sep
  // (4) swap decimal sep -> '.'  (5) strip non-[0-9.]  (6) parseFloat; NaN -> { error:'parse_error' }
}
function extractValue(reportedValue, descriptor) { /* 'text'|'number'|'attribute' source select */ }
```

**LANDMINES (must be in the plan as explicit test cases):**
- **`new RegExp(separator)` is FORBIDDEN** (D-03; RESEARCH anti-pattern `:370`). Group/decimal separators include `.` which is a regex metacharacter. Use `String.prototype.split(sep).join('')` LITERALLY. This is the #1 footgun in this file.
- **NaN -> `parse_error`, NEVER `0`, NEVER a fire** (EXTRACT-04; RESEARCH `:369,479-482`). No `parseFloat(...) || 0`.
- **`%` kept RAW + `isPercent` flag — do NOT auto-divide by 100** (D-03; RESEARCH `:371`). The comparison layer decides meaning.
- **Memoize separators per locale in a `Map`** (RESEARCH `:441`) — `Intl.NumberFormat` construction runs per mutation tick; un-memoized it is a hot-path cost.
- **`decimal_separator` override WINS over `locale`** (D-04; RESEARCH `:472`).
- The exhaustive locale matrix (US/DE/FR-NBSP-U+00A0/FR-narrow-NBSP-U+202F/IN-multigroup/parens/CHF-apostrophe/crypto-glyph/`abc`/`null`) is in RESEARCH `:640-657` — **every row is a required test case** (EXTRACT-01).

---

### `extension/utils/trigger-manager.js` (service: pure `evaluate()` + stateful cap)

This module has TWO distinct analogs because it does two things: a PURE comparison engine (no analog — net-new composition) and a STATEFUL concurrency cap (exact clone of agent-registry).

**Analog A — module SHELL + `_getStore()` resolver:** `extension/utils/trigger-lifecycle.js`

Copy the dual-export wrapper, the lazy `_getChrome()` (`:88-90`, needed for the cap's `storage.local`), and the `_getStore()` resolver (`:98-107`, needed for `listArmedSnapshots()`):
```javascript
// extension/utils/trigger-lifecycle.js:88-107  [VERIFIED]
function _getChrome() {
  return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
}
function _getStore() {
  if (global && global.FsbTriggerStore && typeof global.FsbTriggerStore === 'object') {
    return global.FsbTriggerStore;
  }
  if (typeof globalThis !== 'undefined' && globalThis.FsbTriggerStore
      && typeof globalThis.FsbTriggerStore === 'object') {
    return globalThis.FsbTriggerStore;
  }
  return null;
}
```
Export global name: `global.FsbTriggerManager` (matches RESEARCH `:213`).

**Analog B — the concurrency cap (LIFE-04 / D-09):** `extension/utils/agent-registry.js`

Constants to clone verbatim, renamed `Agent`->`Trigger` (`agent-registry.js:52-78`):
```javascript
// extension/utils/agent-registry.js:52-78  [VERIFIED] -> rename to FSB_TRIGGER_CAP_*
var FSB_TRIGGER_CAP_STORAGE_KEY = 'fsbTriggerCap';   // chrome.storage.LOCAL (survives restart), NOT session
var FSB_TRIGGER_CAP_DEFAULT = 8;
var FSB_TRIGGER_CAP_MIN = 1;
var FSB_TRIGGER_CAP_MAX = 64;
function _clampCap(v) {                                // COPY EXACTLY (agent-registry.js:72-78)
  if (typeof v !== 'number' || !Number.isFinite(v)) return FSB_TRIGGER_CAP_DEFAULT;
  var i = Math.floor(v);
  if (i < FSB_TRIGGER_CAP_MIN) return FSB_TRIGGER_CAP_MIN;
  if (i > FSB_TRIGGER_CAP_MAX) return FSB_TRIGGER_CAP_MAX;
  return i;
}
```

Typed reject shape to clone (`agent-registry.js:308`):
```javascript
// extension/utils/agent-registry.js:294-308  [VERIFIED] -> rename AGENT->TRIGGER
var cap = getCap();
var active = (await store.listArmedSnapshots()).length;   // <-- DIVERGENCE (see landmine), NOT a heap .size
if (active >= cap) {
  return { error: 'TRIGGER_CAP_REACHED', code: 'TRIGGER_CAP_REACHED', cap: cap, active: active };
}
```

`getCap`/`setCap` + grandfather-on-lower (`agent-registry.js:787-831`) — clone the read-path `_clampCap` (defense-in-depth) and the `clamped < activeAtChange` grandfather branch:
```javascript
// extension/utils/agent-registry.js:787-831  [VERIFIED]
// getCap():  return _clampCap(<cachedCap>);          // clamp on READ path (poisoned-cache guard)
// setCap(v): clamp -> write storage.local best-effort (ret.catch) -> if clamped < activeAtChange emit grandfather log
```
Optional read-path hydrate (`agent-registry.js:848-858`, `_loadCapFromStorage`) and the `storage.onChanged` cap subscriber (`agent-registry.js:876-898`) are good-to-have parity but lower priority — flag, do not block.

**Analog C — the pure `evaluate()` + 6 condition kinds + compound + edge:** NO codebase analog. The full shapes are in RESEARCH:
- `evaluate(snapshot, reportedValue, now?)` contract + output object: RESEARCH `:221-254` (Pattern 2).
- The 6-kind `evaluateOne` dispatch skeleton (changed/contains/threshold/percent_change/equals/regex): RESEARCH `:504-554` (Code Examples).
- Edge-trigger / fire-once / hysteresis (`was_satisfied false->true`): RESEARCH `:307-327` (Pattern 4).
- Regex ReDoS guard (`guardAndCompile` + `regexMatches` + `EVIL_SHAPES` + length caps + compile-once cache): RESEARCH `:256-305` (Pattern 3).

**LANDMINES (the load-bearing correctness rules):**
- **Cap active-count = `(await store.listArmedSnapshots()).length`, NOT a heap `Set.size`** (D-09; RESEARCH `:364,373`). This is the ONE deliberate divergence from `agent-registry.js:293` (`self._agents.size`). A heap counter resets to `0` on SW eviction and silently stops enforcing the cap across the very eviction the milestone is built around. The active-count source is `trigger-store.js:168-173` (`listArmedSnapshots()`, filters `status==='armed'`).
- **`this`-instance -> module-scope translation.** `agent-registry.js` is an INSTANCE pattern (`AgentRegistry.prototype`, `this._cachedCap`, `this._agents.size`). `trigger-manager.js` is a module-singleton IIFE (like `trigger-store.js`/`trigger-lifecycle.js`). Translate `this._cachedCap` -> a module-scope `var _cachedCap = FSB_TRIGGER_CAP_DEFAULT;` and `this._agents.size` -> the `listArmedSnapshots()` await. Do NOT introduce a class.
- **`evaluate()` MUST stay PURE — zero `chrome.storage`** (D-02; RESEARCH `:375`). It returns `{ outcome, matched_condition?, old_value, new_value, next_state }`; the storage write-back lives in the `trigger-lifecycle.js` SEAM, not here. `evaluate()` does NOT set `status:'fired'` — the SEAM does (RESEARCH `:249,254`).
- **Both sides of every numeric compare parsed to `Number` first — never string-vs-number** (D-05; RESEARCH `:368`). `"1,050" < 1000` is `true` by JS coercion = a false fire.
- **Edge state read from the PERSISTED snapshot, never SW heap** (D-07; RESEARCH `:327,372`). An oscillating value across eviction would re-fire if `was_satisfied` lived in the heap.
- **Regex: length caps are the HARD CPU bound; the evil-shape heuristic is best-effort** (D-08; RESEARCH `:305,374`). Do NOT attempt `setTimeout`/`AbortController` to time-box a synchronous `.test()` — impossible on a single SW thread. Invalid/rejected pattern -> `pattern_error`, never a silent pass/NaN-fire.
- **Compound (TRIG-07): ANY sub-condition `parse_error`/`pattern_error` short-circuits the WHOLE compound to that error** (Pitfall 5; RESEARCH `:431-434,576`). Never fold an error into `false` and let an `OR` fire on partial data.
- **`percent_change`: baseline `0` or NaN -> `parse_error` before division** (TRIG-06; RESEARCH `:533`). No divide-by-zero fire.

---

### `extension/utils/trigger-lifecycle.js` (MODIFY — the Phase-15 SEAM)

**Analog:** itself. This is an in-file edit, not a clone. The exact swap site is comment-marked.

**The SEAM to replace** (`trigger-lifecycle.js:282-290`) — the current placeholder return:
```javascript
// extension/utils/trigger-lifecycle.js:282-290  [VERIFIED] -- REPLACE this return
    // ----------------------------------------------------------------------
    // Phase 15 SEAM: plug the evaluate-and-fire step in HERE.
    //   - resolve the selector, extract the value, compare against the
    //     condition/baseline, and on a match write status:'fired' + fired_at
    //     back to storage ATOMICALLY before any delivery.
    // ----------------------------------------------------------------------
    return { ok: true, action: 'evaluated_noop' };
```

**The replacement shape** (RESEARCH `:156-164` system diagram is the spec):
1. `var outcome = FsbTriggerManager.evaluate(snap, reportedValue, now);` (guard `typeof FsbTriggerManager !== 'undefined'`, mirroring the `typeof FsbTriggerLifecycle` guards already in `background.js`).
2. If `outcome.outcome === 'fired'`: set `snap.status = 'fired'; snap.fired_at = now;` then `await store.writeSnapshot(triggerId, snap)` (ATOMIC terminal write-back) + `await clearAlarm(alarm.name)` (disarm).
3. Else (`no_fire`/`parse_error`/`pattern_error`): merge `outcome.next_state` (`last_value`, `was_satisfied`, `last_evaluated_at`) into `snap`, then `await store.writeSnapshot(triggerId, snap)` (persist edge state, stay armed).

**Existing dedupe to PRESERVE (do not remove):**
```javascript
// extension/utils/trigger-lifecycle.js:264-269  [VERIFIED] -- the idempotent terminal guard
if (snap.status === 'fired' || snap.status === 'stopped') {
  return { ok: true, action: 'noop_terminal' };
}
```
This guard (`:267-269`) is the storage-backed dedupe backstop: a duplicate alarm tick after the `fired` write sees `status:'fired'` and no-ops (D-07; RESEARCH `:325,422`). It sits ABOVE the SEAM, so it already protects the new write-back.

**Helpers already present in-module to reuse (no re-import):** `clearAlarm(name)` (`:120-129`), `_getStore()` (`:98-107`) already gives `store` at the SEAM (`store` is in scope at `:259` from the re-read). The TTL reap path above the SEAM (`:276-279`) is untouched.

**LANDMINE:** The SEAM is the SOLE owner of storage I/O for the fire path (D-02). Keep `evaluate()` pure — do not let any `chrome.storage` call leak into `trigger-manager.js`. The "exactly one fire across SW eviction" guarantee depends on the terminal write + `noop_terminal` guard both living HERE on the storage-of-truth side.

---

### `extension/background.js` (MODIFY — `importScripts` glue)

**Analog:** the Phase-14 trigger glue region in the SAME file. Two additive `importScripts` lines, mirroring `:41-42`.

**The exact region to mirror** (`background.js:34-42`) — load order matters:
```javascript
// extension/background.js:34-42  [VERIFIED]
try { importScripts('utils/mcp-task-store.js'); } catch (e) { console.error('[FSB] Failed to load mcp-task-store.js:', e.message); }
// Phase 14 Plan 03 (v0.11.0): trigger survivability modules. ... store MUST be
// imported BEFORE the lifecycle ...
try { importScripts('utils/trigger-store.js'); } catch (e) { console.error('[FSB] Failed to load trigger-store.js:', e.message); }
try { importScripts('utils/trigger-lifecycle.js'); } catch (e) { console.error('[FSB] Failed to load trigger-lifecycle.js:', e.message); }
```

**The two additive lines** (place beside the above, following the same `try/catch + console.error` pattern):
```javascript
try { importScripts('utils/value-extractor.js'); } catch (e) { console.error('[FSB] Failed to load value-extractor.js:', e.message); }
try { importScripts('utils/trigger-manager.js'); } catch (e) { console.error('[FSB] Failed to load trigger-manager.js:', e.message); }
```

**LOAD-ORDER LANDMINE (load-bearing):** `trigger-manager.js` resolves `FsbTriggerStore` (cap) and is CALLED BY `trigger-lifecycle.js` (SEAM). Load order must be: `value-extractor.js` (pure, no deps) -> `trigger-store.js` -> `trigger-manager.js` (needs store + extractor on the global) -> `trigger-lifecycle.js` (the SEAM calls `FsbTriggerManager`). Concretely: insert `value-extractor.js` BEFORE `trigger-store.js`, and `trigger-manager.js` AFTER `trigger-store.js` and BEFORE `trigger-lifecycle.js`. Because all access is via lazy `_getStore()`/`typeof` guards at CALL time (not eval time), a mis-order only risks a transient no-op at boot, not a throw — but the correct order removes even that.

**No other `background.js` edit.** The alarm fan-out branch at `:13348-13357` already calls `FsbTriggerLifecycle.handleTriggerAlarm(alarm)` — the SEAM edit lives inside that helper, so the listener needs no change. `agent-loop.js` is byte-frozen (INV-04); no MCP schema change (INV-01).

---

### `tests/value-extractor.test.js` (CREATE, pure — no chrome)

**Analog:** `tests/trigger-store.test.js` (fresh-require harness) — but SIMPLER, because the extractor is pure and needs no chrome mock.

**Fresh-require pattern to copy** (`trigger-store.test.js:41-46`) — a plain `require()` + `delete require.cache` suffices (no `installChromeMock`):
```javascript
// tests/trigger-store.test.js:41-46  [VERIFIED] -- adapt: drop the harness/chrome, keep the cache-bust
const EXTRACTOR_PATH = require.resolve('../extension/utils/value-extractor.js');
function freshRequire() { delete require.cache[EXTRACTOR_PATH]; return require(EXTRACTOR_PATH); }
```
Pass/fail counter + `process.exit(failed>0?1:0)` (the store/lifecycle convention): `trigger-store.test.js:28-39,213-220`.

**Coverage (RESEARCH `:631-657`):** the full locale matrix (every row required) + `extract: text|number|attribute` source selection (EXTRACT-03) + `parse_error` on `abc`/`""`/`null` (EXTRACT-04). Use `assert` (`trigger-store.test.js:22`).

---

### `tests/trigger-manager.test.js` (CREATE)

**Analog:** `tests/trigger-lifecycle.test.js` — for the inline chrome+alarms mock and the eviction/edge proof. The PURE `evaluate()` cases inject `snapshot` + `reportedValue` directly (no chrome); only the cap path (if folded here instead of `trigger-cap.test.js`) needs the mock.

**Inline mock + re-require harness to copy** (`trigger-lifecycle.test.js:66-151`): `createStorageArea()` (`:66-100`), `createChromeMock()` (`:102-128`), `setupHarness()` (`:141-151`, installs `global.chrome` then re-requires store + module with cache-bust so lazy `_getChrome()`/`_getStore()` rebind).

**Edge/dedupe proof to mirror** — `trigger-lifecycle.test.js` Case F (`:271-286`) is the template for "oscillation post-eviction does not re-fire": evaluate with `was_satisfied:false` + satisfied value -> `outcome:'fired'`, `next_state.was_satisfied:true`; re-evaluate the SAME satisfied value with `was_satisfied:true` -> `no_fire` (RESEARCH `:660`).

**Coverage (RESEARCH `:625-630,658-662`):** for EACH of the 6 kinds — (a) fires, (b) no-fire, (c) edge exactly-once, (d) numeric `parse_error`; compound AND/OR + error short-circuit; regex guard (valid match; `(a+)+`/`(a|a)*`/`.*.*`/>1000-char/invalid-syntax all -> `pattern_error`; compile-once cache identity; over-cap text truncated before `.test()` returns without hanging).

---

### `tests/trigger-cap.test.js` (CREATE — recommended split; or fold into trigger-manager.test.js)

**Analog:** `tests/agent-cap.test.js` — a near-verbatim clone, RENAMED and with the storage-first divergence test added.

**Clone target — the structure** (`agent-cap.test.js:18-24`):
```javascript
// tests/agent-cap.test.js:18-24  [VERIFIED]
const assert = require('assert');
const REGISTRY_MODULE_PATH = require.resolve('../extension/utils/agent-registry.js');
function freshRequireRegistry() { delete require.cache[REGISTRY_MODULE_PATH]; return require(REGISTRY_MODULE_PATH); }
```
For triggers this also needs `installChromeMock({ storage: { local: {...} } })` (for `fsbTriggerCap`) AND a mock/real `FsbTriggerStore` so `listArmedSnapshots()` returns a controllable count — use `tests/fixtures/run-task-harness.js installChromeMock` which backs BOTH `storage.session` and `storage.local`:
```javascript
// tests/fixtures/run-task-harness.js:131-148  [VERIFIED]
function installChromeMock(opts) {
  const session = createStorageArea(opts.storage && opts.storage.session ? opts.storage.session : {});
  const local = createStorageArea(opts.storage && opts.storage.local ? opts.storage.local : {});
  // ... chromeMock.storage = { session, local };  globalThis.chrome = chromeMock;  return { chrome, restore() }
}
```

**Clamping cases to clone** (`agent-cap.test.js:81-103`): `setCap(0)->1`, `setCap(100)->64`, `setCap(NaN)->8`, `setCap(3.7)->3`, `setCap('str')->8`, `setCap(-5)->1`; default cap `8` after init (`:73-78`).

**Typed-reject shape to assert** (`agent-cap.test.js:57-62`): `{ code:'TRIGGER_CAP_REACHED', error:'TRIGGER_CAP_REACHED', cap, active }`.

**THE DIVERGENCE TEST (net-new, the whole point of D-09)** — RESEARCH `:664`: seed N `status:'armed'` snapshots into the mock store, leave the SW heap empty, call `armTrigger` and assert it STILL rejects at the cap. This proves the count comes from `listArmedSnapshots()` (storage), not a heap `Set`. There is no agent-cap analog for this case (agent-registry uses a heap Set on purpose) — it is the test that locks the deliberate divergence.

**LANDMINE:** agent-cap's 20-concurrent test relies on `withRegistryLock` serializing the cap-check (`agent-registry.js:287-294`). `trigger-manager.armTrigger` is storage-async; the planner must decide whether concurrent arms need equivalent serialization or whether the `listArmedSnapshots()` read-then-write race is acceptable for the arm path (arm is not the hot path; evaluate is). Flag for the plan — the cap correctness under concurrent arm is a design question, not a copy.

---

### `package.json` (MODIFY — append test invocations)

**Analog:** itself. The `scripts.test` value (`package.json:16`) is a long ` && `-joined serial chain; the Phase-14 pair was appended at the tail:
```
... && node tests/trigger-store.test.js && node tests/trigger-lifecycle.test.js
```
**Append** the new test files at the END, after `trigger-lifecycle.test.js`, same ` && node tests/<name>.test.js` form (matching exactly how Phase 14 appended). No reordering of the existing chain.

---

## Shared Patterns

### Dual-export IIFE + lazy resolvers
**Source:** `extension/utils/trigger-store.js:1-2,66-68,185-200` and `extension/utils/trigger-lifecycle.js:88-107`
**Apply to:** BOTH new source modules (`value-extractor.js`, `trigger-manager.js`)
```javascript
(function(global) {
  'use strict';
  function _getChrome() {   // OMIT in value-extractor.js (pure); KEEP in trigger-manager.js (cap storage.local)
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }
  // ... pure logic; chrome only via _getChrome(); store only via _getStore() ...
  var exportsObj = { /* public surface */ };
  global.FsbValueExtractor = exportsObj;        // or FsbTriggerManager
  if (typeof module !== 'undefined' && module.exports) { module.exports = exportsObj; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```
This dual-export is the SINGLE thing that makes the browser-free Node unit tests possible (the test installs `global.chrome`/seeds the store, then `delete require.cache[...]` and re-requires so the lazy resolvers bind the fresh mock). It is non-negotiable for every new SW module in this codebase.

### Best-effort no-throw posture
**Source:** `extension/utils/trigger-store.js:76-97,103-126` (every storage call try/catch) and `extension/utils/trigger-lifecycle.js:120-146` (every alarm call try/catch returns a typed `{ok,...}`)
**Apply to:** the cap's `storage.local` reads/writes in `trigger-manager.js` (mirror `agent-registry.js:807-815` — `ret.catch(...)` on the `storage.local.set`, swallow on failure; the in-memory `_cachedCap` still updates). A storage hiccup must never crash the SW or block an arm/evaluate.

### Fresh-require test harness (cache-bust + lazy rebind)
**Source:** `tests/trigger-store.test.js:41-46` (plain require) and `tests/trigger-lifecycle.test.js:141-151` (chrome mock + multi-module re-require) and `tests/agent-cap.test.js:21-24` (registry re-require)
**Apply to:** all 2-3 new test files. Pure extractor -> plain `delete require.cache` + `require`. Manager/cap -> `installChromeMock`/inline mock FIRST, then re-require store + manager so `_getStore()`/`_getChrome()` bind the mock. Pass/fail counter + `process.exit(failed>0?1:0)` per `trigger-store.test.js:213-220`. Framework: Node built-in `assert` only — no Jest/Mocha (RESEARCH `:617`).

---

## No Analog Found

No file is entirely analog-less, but two ALGORITHMS inside otherwise-analogous shells are net-new (planner uses the RESEARCH recipe, not a codebase file):

| File / Concern | Role | Data Flow | Reason | Source to use instead |
|----------------|------|-----------|--------|-----------------------|
| `value-extractor.js` locale parse body | utility | transform | Zero `Intl.NumberFormat`/`formatToParts` in `extension/` (D-03) | RESEARCH `:438-501` (verified Node v25.9.0) |
| `trigger-manager.js` `evaluate()` + 6 kinds + compound + edge + ReDoS guard | service | transform | No comparison-engine / no ReDoS-guard precedent in repo (D-08) | RESEARCH `:221-327` (Patterns 2-4) + `:256-305` (Pattern 3 regex) + `:504-554` (dispatch skeleton) |

The MODULE SHELL, the cap, the SEAM, the glue, and all three test harnesses DO have exact codebase analogs (cited above) — only the comparison math and the locale normalize-then-parse are genuinely new composition.

## Metadata

**Analog search scope:** `extension/utils/` (trigger-store, trigger-lifecycle, agent-registry), `extension/` (background.js), `tests/` (agent-cap, trigger-store, trigger-lifecycle, fixtures/run-task-harness), `package.json`.
**Files scanned:** 11 (4 source + 4 test + 1 fixture + 1 config + 2 planning docs).
**Net-new-confirmed (grep, RESEARCH `:13,719`):** `Intl.NumberFormat`/`formatToParts`/`percent_change`/`was_satisfied`/`hysteresis`/`fsbTriggerCap`/`TRIGGER_CAP_REACHED` — zero occurrences in `extension/`.
**Pattern extraction date:** 2026-06-16
