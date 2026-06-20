# Phase 15: Fire-Condition Engine & Value Extraction - Research

**Researched:** 2026-06-16
**Domain:** Pure SW-side comparison engine (locale numeric parsing, edge-trigger semantics, regex safety, concurrency cap) for a Chrome MV3 extension, zero new runtime deps, no build step.
**Confidence:** HIGH

## Summary

This phase is a confirmation-and-grounding pass, not an exploration. The CONTEXT.md (D-01..D-09) and DISCUSSION-LOG already locked every material decision, and the two genuinely-open questions (regex ReDoS guard, locale parse) were resolved to Confident via external research. This RESEARCH.md does what was asked: it verifies those decisions against the live codebase, turns them into concrete `file:line`-grounded implementation patterns, and produces the Validation Architecture that the orchestrator converts into VALIDATION.md.

Phase 15 builds **exactly two** net-new SW modules -- `extension/utils/value-extractor.js` (locale numeric parse + text/number/attribute extraction) and `extension/utils/trigger-manager.js` (the six condition kinds + compound AND/OR + edge semantics + the concurrency cap inline). Both follow the dual-export IIFE + lazy `_getChrome()` idiom already proven by `trigger-store.js` and `trigger-lifecycle.js`, which is exactly what makes them browser-free unit-testable. The `evaluate()` function is **pure and DOM-free**: it receives the persisted snapshot plus the raw value the (future, Phase 16/17) watch layer reports, and returns a typed outcome plus a `next_state` patch. It does NOT touch `chrome.storage`, resolve selectors, or scrape a DOM. The Phase-14 SEAM in `trigger-lifecycle.js` (`return { ok:true, action:'evaluated_noop' }`, line 290) owns the storage re-read and the atomic `fired` write-back around it -- this division is load-bearing for the "exactly one fire across SW eviction" guarantee.

I verified the three structural facts the plan depends on. (1) `Intl.NumberFormat().formatToParts()` works natively and correctly in this runtime (Node v25.9.0): de-DE yields group `.` / decimal `,`; fr-FR yields group U+202F (narrow no-break space); en-IN yields Indian multi-group -- exactly the separator-discovery recipe STACK.md:146-160 prescribes. (2) There is zero `Intl.NumberFormat`/`formatToParts` usage anywhere in `extension/`, and zero precedent for `percent_change`/`was_satisfied`/`hysteresis`/`fsbTriggerCap`/`TRIGGER_CAP_REACHED` -- all net-new, as CONTEXT claims. (3) The agent-registry cap pattern (constants, `_clampCap`, typed reject, `getCap`/`setCap`, grandfather-on-lower, read-path clamp) is fully present at `agent-registry.js:52-78,72-78,787-831` and the cap-rejection test pattern is established in `tests/agent-cap.test.js` (20-concurrent under cap=8 -> 8 successes + 12 typed rejections).

**Primary recommendation:** Decompose into three plans -- (P1) `value-extractor.js` + its large locale/extract test matrix; (P2) `trigger-manager.js` condition engine + compound AND/OR + edge/fire-once/hysteresis + the inline cap; (P3) wire `manager.evaluate(...)` + atomic `fired` write-back into the `trigger-lifecycle.js` SEAM, plus the `background.js` `importScripts` glue. Build P1 before P2 (the manager consumes the extractor), and gate P3 on both. The `evaluate()` contract and the cap's `listArmedSnapshots()` active-count are the two highest-risk interface decisions -- both are pinned concretely below.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (Module Decomposition):** Exactly two new SW-side modules, both dual-export IIFE + lazy `_getChrome()`:
  - `extension/utils/trigger-manager.js` -- arm / evaluate / fire + compound AND/OR + the concurrency cap, mirroring `agent-registry.js`.
  - `extension/utils/value-extractor.js` -- locale numeric parse + text/number/attribute extraction (kept separate so its DE/FR/NBSP/parens/% test matrix does not bloat the manager).
  The concurrency cap lives **inline in `trigger-manager.js`** (copied constants / `_clampCap` / `getCap` / `setCap` / typed-reject), NOT a separate cap module.
- **D-02 (evaluate() contract):** `trigger-manager` exposes a **pure, DOM-free** `evaluate(snapshot, reportedValue, now?)`. Takes the persisted snapshot (carrying `condition`, `baseline`, `last_value`, and the edge-state flag) plus the raw value already read by the watch layer, and returns `{ outcome: 'fired' | 'no_fire' | 'parse_error' | 'pattern_error', matched_condition?, old_value, new_value, next_state }`. It does NOT resolve selectors, scrape a live DOM, or touch `chrome.storage` -- the Phase-14 SEAM owns the storage read + atomic `fired` write-back. `evaluate()` calls `value-extractor` internally per condition kind so the `parse_error` path (EXTRACT-04) lives in exactly one place.
- **D-03 (Locale parsing):** Net-new. Use the `Intl.NumberFormat(locale).formatToParts(11000.1)` separator-discovery recipe: discover `group` + `decimal` separators, then normalize -- (1) strip parentheses-negative + record sign, (2) detect explicit sign + `%` (record `isPercent`), (3) **literal `split/join`** to remove group separator, (4) replace decimal separator with `.`, (5) strip everything non-`[0-9.]`, (6) `parseFloat`. **`NaN` -> distinct `parse_error`** (never `0`, never a fire). Memoize discovered separators **per locale in a `Map`**. Use literal `split/join`, **never `new RegExp(separator)`**. **`%` kept raw** (record `isPercent`; do NOT auto-divide by 100). **Zero npm dependency.**
- **D-04 (Locale override mandatory now):** An explicit per-trigger **`locale`** (and optional **`decimal_separator`**) override is **MANDATORY in the condition schema NOW**. `decimal_separator` wins over `locale`. Default when neither is supplied: page `lang` / `navigator.language` as a documented best-effort, with the override always available to force determinism.
- **D-05 (Extraction source per condition):** **Raw trimmed text** for `changed` / `contains`; **locale-parsed number** for `threshold` / numeric `equals` / `percent_change`. The `extract: text | number | attribute` (+ attribute name) override reads a specific source (e.g. `data-price`, `aria-valuenow`). **Both sides parsed to `Number` before ANY numeric compare -- never string-vs-number.**
- **D-06 (Condition engine + compound):** `evaluate()` implements all six kinds: `changed` (any delta from arm-time baseline, raw text), `threshold` (`>=`/`<=`/`>`/`<` numeric), `equals` / `regex`, `contains` (case-insensitive default), `percent_change` (+/- N% from baseline). **Compound conditions (TRIG-07):** multiple conditions on one element combine with an explicit combinator -- recommended `{ combinator: 'AND' | 'OR', conditions: [...] }` (exact shape is the planner's to finalize).
- **D-07 (Edge semantics):** "Exactly one fire" = edge-trigger semantics in `evaluate()` (fire only on `was_satisfied: false -> true`, reading persisted `last_value` + an edge-state flag from the snapshot) + fire-once-by-default (snapshot -> terminal `status:'fired'`). The **atomic disarm + dedupe** live in the Phase-14 SEAM's storage write-back, guarded by the existing idempotent terminal check (`status === 'fired' || status === 'stopped' -> noop_terminal`). **Edge state MUST be persisted in the snapshot** (not the SW heap). Hysteresis applied at the threshold boundary.
- **D-08 (Regex guard):** Net-new. No sound synchronous way to time-box `RegExp.prototype.test()` in an MV3 SW; V8's linear `l`-flag engine is unreachable from extension JS. **Lock:** at compile time -- pattern-length cap (~1000 chars), reject known evil shapes via a small static heuristic (nested quantifier `(a+)+` / `(a*)*`, overlapping alternation under a quantifier `(a|a)*`, adjacent quantifiers `.*.*`), then compile-once-and-cache the `RegExp`; at match time -- cap candidate text length before `.test()` (element text ~10k, whole-page ~100k). A rejected or syntactically-invalid pattern yields a distinct `pattern_error`. **Length caps are the load-bearing CPU guarantee; the evil-shape heuristic is defense-in-depth** (static ReDoS detection is provably incomplete -- accepted).
- **D-09 (Concurrency cap):** Mirror `agent-registry.js` exactly: `FSB_TRIGGER_CAP_STORAGE_KEY = 'fsbTriggerCap'` in `chrome.storage.local` (NOT session), `DEFAULT = 8`, `MIN = 1`, `MAX = 64`, `_clampCap`, typed reject `{ error:'TRIGGER_CAP_REACHED', code:'TRIGGER_CAP_REACHED', cap, active }`, grandfather-active-on-lower, and clamp on the read path. **The active count is the number of `status:'armed'` snapshots from `trigger-store` via `listArmedSnapshots()`** -- NOT an in-heap `Set`. This diverges deliberately from `agent-registry.js` (which counts `this._agents.size`): triggers are storage-first and survive SW eviction; an in-heap counter resets to `0` on eviction and would silently stop enforcing the cap.

### Claude's Discretion

- Exact field name for the persisted edge state (`was_satisfied` vs a dedupe key on the snapshot) -- planner's call, as long as it is persisted in the snapshot, never SW heap.
- The exact compound-condition schema shape (D-06) -- recommend `{ combinator, conditions[] }`; planner finalizes.
- Whether `value-extractor.js` exposes a single `parseLocaleNumber` + `extractValue` or finer-grained helpers -- planner's call.
- Exact N/M cap values for the regex guard (pattern length ~1000, text length ~10k element / ~100k page) -- tune to the longest legitimately-expected pattern.
- Unit-test harness shape -- mirror the existing Node-mock storage tests for the store/lifecycle modules.

### Deferred Ideas (OUT OF SCOPE)

- **Live-observe (MutationObserver) watch mechanism** -- Phase 16 (the layer that scrapes the live DOM and reports the value `evaluate()` consumes).
- **Refresh-poll (tab-owning background reload) watch** -- Phase 17.
- **Shared tool registry + dispatcher wiring (the 4 MCP tools)** -- Phase 18.
- **MCP blocking/detached return + structured fire envelope** -- Phase 19; also finalizes detached-TTL / blocking-ceiling numbers (and may revisit the locale-override default).
- **Selector resolution + live-DOM value reading** -- not Phase 15; the value is a reported INPUT to the pure `evaluate()`.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRIG-02 | `changed` -- fires when value differs from arm-time baseline | `evaluate()` `changed` kind reads raw trimmed text (D-05), compares vs `snapshot.baseline`; edge-trigger so a single change = exactly one fire (Pattern 4). Test matrix below. |
| TRIG-03 | `threshold` (`>=`/`<=`/`>`/`<`) vs numeric target | `evaluate()` `threshold` kind: BOTH sides parsed via `value-extractor.parseLocaleNumber` to `Number` before compare (D-05); hysteresis at boundary (Pattern 4). NaN -> `parse_error`. |
| TRIG-04 | `equals` / `regex` (compiled once + ReDoS-guarded) | `value-extractor` (numeric/text equals) + the regex guard in `trigger-manager` (Pattern 3): pattern-length cap + evil-shape heuristic + compile-once cache + text-length cap; invalid/rejected -> `pattern_error`. |
| TRIG-05 | `contains` (case-insensitive default) | `evaluate()` `contains` kind on raw text (D-05); `.toLowerCase()` both sides by default; optional `case_sensitive` flag. |
| TRIG-06 | `percent_change` (+/- N% from baseline) | `evaluate()` `percent_change` kind: `(new - baseline) / baseline * 100`, compare abs to N; both parsed numbers; baseline 0 / NaN -> `parse_error` (no divide-by-zero fire). |
| TRIG-07 | Compound AND/OR on one element | `{ combinator, conditions[] }` schema (D-06); `evaluate()` folds per-condition booleans with AND/OR; ANY sub-condition `parse_error`/`pattern_error` short-circuits the compound to that error (never a silent partial fire). |
| EXTRACT-01 | Locale-aware numeric parse | `value-extractor.parseLocaleNumber(raw, {locale, decimal_separator})` -- the `formatToParts` recipe (D-03), verified working in this runtime. |
| EXTRACT-02 | Raw text for `changed` / `contains` | `value-extractor.extractValue(..., extract:'text')` returns trimmed `textContent`/`.value` verbatim, no parse (D-05). |
| EXTRACT-03 | `extract: text\|number\|attribute` (+ attr name) | `value-extractor.extractValue(rawSources, descriptor)` selects source; attribute reads the named attr value the watch layer reported. |
| EXTRACT-04 | Failed parse -> distinct `parse_error`, never fires | Single chokepoint: `parseLocaleNumber` returns a sentinel on NaN; `evaluate()` maps it to `{ outcome:'parse_error' }` and never to a fire. No NaN-as-0 anywhere. |
| LIFE-04 | Concurrency cap 1-64 default 8, typed `TRIGGER_CAP_REACHED` | Inline cap in `trigger-manager` (D-09): clone of `agent-registry.js:52-78,787-831`; active = `listArmedSnapshots().length` from `trigger-store`. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Locale numeric parse (`parseLocaleNumber`) | SW utils (`value-extractor.js`) | -- | Pure function; no chrome API; runs on a value the watch layer hands it. `Intl` is a JS built-in available in the SW global. |
| Value source selection (text/number/attribute) | SW utils (`value-extractor.js`) | -- | Operates on raw strings/attr values reported by the watch layer; does NOT read the DOM itself (that is Phase 16/17 content-script tier). |
| Condition evaluation (six kinds) | SW utils (`trigger-manager.js`) | -- | Pure comparison; consumes the persisted snapshot + reported value; no storage, no DOM. |
| Compound AND/OR fold (TRIG-07) | SW utils (`trigger-manager.js`) | -- | Pure boolean fold over per-condition results. |
| Edge-trigger / hysteresis decision | SW utils (`trigger-manager.js`) | -- | Computed from persisted `last_value` + edge flag passed in the snapshot; returns `next_state` patch (does NOT persist it). |
| Regex compile + ReDoS guard | SW utils (`trigger-manager.js`) | -- | Pure compile/validate + module-scope compile-once cache; CPU-bounded by length caps. |
| Concurrency cap read/clamp/reject | SW utils (`trigger-manager.js`) | `chrome.storage.local` (`fsbTriggerCap`) + `trigger-store` (`listArmedSnapshots`) | Cap value persists in `storage.local`; active count derives from storage-of-truth, not heap (D-09). |
| **Atomic `fired` write-back + dedupe** | **SW background (`trigger-lifecycle.js` SEAM)** | `chrome.storage.session` (`trigger-store`) | The SEAM (Phase 14) owns the storage re-read + atomic terminal write so eviction cannot drop/duplicate a fire. `evaluate()` is intentionally NOT this tier. |
| Selector resolution + live-DOM read | OUT (Phase 16/17 content-script tier) | -- | Phase 15 receives the value as an input; it never scrapes. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `Intl.NumberFormat` / `.formatToParts()` | JS built-in (ECMA-402) | Locale separator discovery for numeric parse | Zero-dep, ships in V8/the SW global; the canonical reverse-parse recipe (`group`/`decimal` part types). Verified working in this runtime (Node v25.9.0) [VERIFIED: local Bash run]. |
| `RegExp` (caller pattern, guarded) | JS built-in | `regex`/`equals` condition matching | Native; the guard is length-cap + static heuristic + compile-once cache (no library). [CITED: v8.dev/blog/non-backtracking-regexp via DISCUSSION-LOG] |
| `chrome.storage.local` | MV3 platform API | Persist the configurable cap (`fsbTriggerCap`) | Survives SW restart (unlike `.session`); exact pattern proven by `agent-registry.js:52,807-816` [VERIFIED: codebase read]. |
| `extension/utils/trigger-store.js` | in-repo (Phase 14) | `listArmedSnapshots()` active-count source; snapshot read/write the SEAM uses | Storage-of-truth; survives eviction (the cap's correctness depends on this, D-09) [VERIFIED: codebase read]. |
| `extension/utils/trigger-lifecycle.js` | in-repo (Phase 14) | The `evaluated_noop` SEAM (`:290`); `armTrigger`/`clearTrigger` (`:173-212`); idempotent `noop_terminal` guard (`:267-269`) | The exact integration site for evaluate-and-fire [VERIFIED: codebase read]. |
| `extension/utils/agent-registry.js` | in-repo (v0.9.60) | The cap clone target (constants, `_clampCap`, typed reject, grandfather) | Proven concurrency-cap precedent (`:52-78,72-78,787-831`) [VERIFIED: codebase read]. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node built-in `assert` | Node >=18 | Test assertions in `tests/*.test.js` | All new unit tests (trigger-store.test.js uses it; agent-cap.test.js uses it) [VERIFIED: codebase read]. |
| `tests/fixtures/run-task-harness.js` | in-repo | `installChromeMock({storage:{session,local}, tabs})` + `createStorageArea` | Reuse for the cap test (needs `storage.local`) and any test needing a shared mock [VERIFIED: codebase read -- `:133-148` install both session+local]. |
| Inline `createChromeMock()`/`setupHarness()` | in-repo pattern | Per-file chrome+alarms mock with `require.cache` reset | Mirror `tests/trigger-lifecycle.test.js:102-151` for extractor/manager tests that re-require modules against a fresh mock [VERIFIED: codebase read]. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Intl.NumberFormat().formatToParts()` recipe | `currency.js` / `numeral.js` / `dinero.js` | FORBIDDEN this milestone (STACK.md:99-101 "What NOT to Use"): violates zero-dep bias for a ~60-line problem; adds supply-chain weight to a 2-dep runtime; no in-repo precedent. |
| Static evil-shape heuristic + length caps | V8 linear (`l`-flag) non-backtracking engine | Unreachable: requires `--enable-experimental-regexp-engine` startup flag with no runtime JS API; an extension cannot set V8 flags (DISCUSSION-LOG external research). |
| `listArmedSnapshots().length` active count | In-heap `Set.size` (the agent-registry way) | The agent-registry heap counter resets to 0 on SW eviction; a storage-first trigger cap MUST count from storage or it silently stops enforcing across the eviction the milestone is built around (D-09). |
| Inline cap in `trigger-manager.js` | A separate `trigger-cap.js` module | CONTEXT D-01 locks inline, matching how `agent-registry.js` keeps its cap inline. |

**Installation:** None. Zero new runtime dependencies (no build step). New files are plain CommonJS/IIFE `.js` loaded via `importScripts` in the SW and `require()` in Node tests.

**Version verification:** No packages added, so no registry verification applies. The two built-ins were verified empirically in the target runtime:
- `Intl.NumberFormat('de-DE').formatToParts(11000.1)` -> group `.` (U+002E), decimal `,` [VERIFIED: local Bash run, Node v25.9.0].
- `Intl.NumberFormat('fr-FR')` group -> U+202F (narrow no-break space) [VERIFIED: local Bash run].
- `Intl.NumberFormat('en-IN')` -> Indian multi-group (group=U+002C twice, decimal=U+002E) [VERIFIED: local Bash run].

## Package Legitimacy Audit

**Not applicable.** Phase 15 installs **zero** external packages (explicit zero-dep decision, D-03; STACK.md:99). No npm/PyPI/crates package is added, so there is no slopcheck surface. The only "dependencies" are JS built-ins (`Intl`, `RegExp`) and in-repo modules (`trigger-store.js`, `trigger-lifecycle.js`, `agent-registry.js` as a clone reference). The existing `package-lock.json` and `LATTICE-PIN.md` are untouched (INV-06).

## Architecture Patterns

### System Architecture Diagram

```
                       Phase 16/17 watch layer (NOT this phase)
                       resolves selector, reads live DOM, debounces
                                       |
                                       | reports: raw value(s) + extract descriptor
                                       v
   chrome.alarms.onAlarm  ->  background.js fsbTrigger: branch (Phase 14 glue)
                                       |
                                       v
   trigger-lifecycle.js  handleTriggerAlarm(alarm)              [SEAM owner / Tier: SW background]
        |  re-read snapshot from chrome.storage.session (storage-is-truth)
        |  if status fired/stopped -> noop_terminal (idempotent dedupe backstop)
        |  if now >= deadline_at   -> reaped_ttl
        |  else  >>> PHASE 15 SEAM (line 290) <<<
        |          1. store.readSnapshot(triggerId)            (fresh read)
        |          2. outcome = TriggerManager.evaluate(snapshot, reportedValue, now)
        v
   trigger-manager.js  evaluate(snapshot, reportedValue, now?)  [PURE / Tier: SW utils]
        |
        |--- per condition kind, call value-extractor internally:
        |        value-extractor.extractValue(reportedValue, condition.extract)
        |        value-extractor.parseLocaleNumber(text, {locale, decimal_separator})
        |
        |--- compare (changed | threshold | equals | regex | contains | percent_change)
        |        regex path: guardAndCompile(pattern) -> cache -> bounded .test(text)
        |--- compound fold: AND/OR over per-condition booleans
        |--- edge decision: was_satisfied(false->true)? + hysteresis at boundary
        |
        v  returns { outcome, matched_condition?, old_value, new_value, next_state }
        |
        v   (back in the SEAM, Tier: SW background)
   trigger-lifecycle.js
        |  if outcome === 'fired':
        |        snapshot.status = 'fired'; snapshot.fired_at = now
        |        store.writeSnapshot(triggerId, snapshot)   <-- ATOMIC terminal write-back
        |        clearAlarm(...)                            (disarm)
        |  else (no_fire/parse_error/pattern_error):
        |        merge next_state (last_value, was_satisfied, last_evaluated_at)
        |        store.writeSnapshot(triggerId, snapshot)   (persist edge state, stay armed)
        v
   chrome.storage.session  (fsbTriggerRegistry envelope)

   Concurrency cap (arm path, separate from evaluate):
   TriggerManager.armTrigger(spec):
        active = (await trigger-store.listArmedSnapshots()).length   <-- NOT a heap Set
        if active >= getCap() -> { error:'TRIGGER_CAP_REACHED', code, cap, active }
        else build snapshot -> trigger-lifecycle.armTrigger(snapshot)
```

A reader can trace the primary use case (a watched price crosses a threshold) from the alarm wake, through the storage re-read, into the pure `evaluate()` (extract -> parse both sides -> compare -> edge check), back out to the atomic `fired` write-back and disarm. The diagram shows the deliberate tier split: `evaluate()` is pure; the SEAM owns all storage I/O.

### Recommended Project Structure

```
extension/utils/
├── value-extractor.js     # NEW (P1): parseLocaleNumber + extractValue; Intl memo Map
├── trigger-manager.js     # NEW (P2): evaluate() + 6 kinds + compound + edge + regex guard + inline cap
├── trigger-store.js       # Phase 14 (unchanged); listArmedSnapshots() consumed by the cap
├── trigger-lifecycle.js   # Phase 14; SEAM at :290 gets the evaluate+write-back (P3 edit)
└── agent-registry.js      # v0.9.60; cap clone reference (read-only)

extension/
└── background.js          # P3: add value-extractor.js + trigger-manager.js to the importScripts region
                           # (beside trigger-store.js/trigger-lifecycle.js, store-before-manager order)

tests/
├── value-extractor.test.js   # NEW (P1): locale matrix + extract override + parse_error
├── trigger-manager.test.js   # NEW (P2): 6 condition kinds + compound + edge/hysteresis + regex guard
└── trigger-cap.test.js       # NEW (P2): cap clone of agent-cap.test.js (20-concurrent, clamping, grandfather)
```

### Pattern 1: Dual-export IIFE + lazy `_getChrome()` (both new modules)

**What:** Module is an IIFE that assigns `global.X = exportsObj` for the SW `importScripts` consumer AND `module.exports = exportsObj` for the Node test consumer. All chrome access goes through a lazy `_getChrome()` resolved at call time, never at module-eval time.
**When to use:** Every new SW-side module in this codebase. It is the single thing that makes browser-free unit tests possible (the test installs `global.chrome`, then `delete require.cache[...]` and re-requires so the lazy resolver binds the fresh mock).
**Example:**
```javascript
// Source: extension/utils/trigger-lifecycle.js:1,88-90,444-449 [VERIFIED: codebase read]
(function(global) {
  'use strict';

  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }

  // ... pure logic + chrome access only via _getChrome() ...

  var exportsObj = { /* public surface */ };
  global.FsbTriggerManager = exportsObj;            // SW importScripts consumer
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                    // Node test consumer
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```
Note: `value-extractor.js` needs NO chrome access at all (pure `Intl`/string math) -- it still uses the dual-export shape for the test re-require pattern, but may omit `_getChrome()` entirely. `trigger-manager.js` DOES need `_getChrome()` for the cap's `storage.local` reads and a `_getStore()` resolver (mirror `trigger-lifecycle.js:98-107`) for `listArmedSnapshots()`.

### Pattern 2: The pure `evaluate()` contract (D-02) -- exact shapes

**What:** A pure function the SEAM calls. Reconciling the two signature notations: ARCHITECTURE.md:303 wrote the shorthand `evaluate(last, current, condition)`; CONTEXT D-02 refines it to `evaluate(snapshot, reportedValue, now?)` where the snapshot already carries `last` (`snapshot.last_value`), `condition` (`snapshot.condition`), `baseline` (`snapshot.baseline`), and the edge flag. Use the D-02 signature -- it is strictly richer and matches what the SEAM has in hand (it just read the snapshot).

**Inputs:**
```javascript
// snapshot: the flat-scalar trigger-store record (Phase 14 D-01 shape). evaluate() READS:
//   snapshot.condition   -- single condition OR { combinator, conditions[] } (D-06)
//   snapshot.baseline    -- arm-time initial value (raw string)
//   snapshot.last_value  -- prior tick's value (raw string) for edge/changed
//   snapshot.<edge_flag> -- persisted was_satisfied (planner names it; D-07 discretion)
// reportedValue: what the watch layer read this tick. Shape (recommend):
//   { text: '<raw textContent/.value>', attributes?: { 'data-price': '...', ... } }
//   (extract:'attribute' reads reportedValue.attributes[name]; text/number read reportedValue.text)
// now: Date.now() injected for testability (default Date.now()).
```

**Output (the outcome object):**
```javascript
{
  outcome: 'fired' | 'no_fire' | 'parse_error' | 'pattern_error',
  matched_condition: { kind, operator?, target?, ... } | undefined, // which sub-condition fired (compound)
  old_value: <baseline-or-last_value, raw>,
  new_value: <reportedValue text/parsed, as compared>,
  next_state: {                  // a PATCH the SEAM merges into the snapshot before write-back
    last_value: <raw new value>,
    was_satisfied: <boolean>,    // the edge flag to persist (NEVER kept in SW heap)
    last_evaluated_at: now
    // NOTE: evaluate() does NOT set status:'fired' -- the SEAM does that on outcome==='fired'.
  }
}
```

**Division of responsibility (load-bearing):** `evaluate()` returns `outcome:'fired'` and a `next_state` patch but performs **no** storage write. The SEAM (`trigger-lifecycle.js`, replacing the `evaluated_noop` return at `:290`) does: on `fired` it sets `status:'fired'` + `fired_at`, writes atomically, and clears the alarm; on any non-fire it merges `next_state` and writes (staying armed). This is why "exactly one fire across SW eviction" holds -- the terminal write + the existing `noop_terminal` guard (`:267-269`) are the dedupe, and they live on the storage-of-truth side, not in the pure function.

### Pattern 3: Regex guard (D-08) -- concrete shape

**What:** A compile-time validator + a module-scope compile-once cache + a match-time length cap. The length caps are the hard CPU guarantee; the heuristic is best-effort.
**When to use:** Only the `regex` condition kind. `equals` (text/number) and `contains` never compile a RegExp.
**Example:**
```javascript
// Source: synthesized from CONTEXT D-08 + DISCUSSION-LOG external research [CITED: OWASP ReDoS cheat sheet; eslint-plugin-regexp no-super-linear-backtracking]
var PATTERN_MAX_LEN = 1000;          // tune to longest legitimately-expected pattern (discretion)
var TEXT_MAX_LEN_ELEMENT = 10000;    // element-text cap
var TEXT_MAX_LEN_PAGE = 100000;      // whole-page cap (when extract spans more than one element)
var _regexCache = new Map();         // pattern string -> compiled RegExp (compile-once)

// Static evil-shape heuristic (defense-in-depth; provably incomplete -- accepted).
var EVIL_SHAPES = [
  /(\([^)]*[+*]\)[+*])/,             // nested quantifier: (a+)+ / (a*)*
  /\([^)]*\|[^)]*\)[+*]/,           // alternation under quantifier: (a|a)* / (a|b)+
  /[.][*+][.][*+]/                  // adjacent unbounded quantifiers: .*.* / .+.+
];

function guardAndCompile(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    return { error: 'pattern_error', reason: 'empty_or_nonstring' };
  }
  if (pattern.length > PATTERN_MAX_LEN) {
    return { error: 'pattern_error', reason: 'pattern_too_long' };
  }
  for (var i = 0; i < EVIL_SHAPES.length; i++) {
    if (EVIL_SHAPES[i].test(pattern)) {
      return { error: 'pattern_error', reason: 'evil_shape' };
    }
  }
  if (_regexCache.has(pattern)) return { re: _regexCache.get(pattern) };
  var re;
  try {
    re = new RegExp(pattern);       // caller flags are NOT honored (no /g state footgun); default flags only
  } catch (_e) {
    return { error: 'pattern_error', reason: 'invalid_syntax' };
  }
  _regexCache.set(pattern, re);
  return { re: re };
}

function regexMatches(pattern, text, maxLen) {
  var g = guardAndCompile(pattern);
  if (g.error) return g;                              // -> evaluate() maps to outcome:'pattern_error'
  var bounded = (typeof text === 'string') ? text.slice(0, maxLen || TEXT_MAX_LEN_ELEMENT) : '';
  return { matched: g.re.test(bounded) };
}
```
**Anti-pattern reminder:** Do NOT attempt `setTimeout`/`AbortController` time-boxing of `.test()` -- a synchronous regex blocks the single SW thread, so the timer can never fire during the freeze (DISCUSSION-LOG). The cache key is the raw pattern string; cache lives at module scope so it survives across `evaluate()` calls within one SW lifetime (and is naturally empty after eviction, which is fine -- recompile is cheap relative to a watch).

### Pattern 4: Edge-trigger + fire-once + hysteresis (D-07) -- "exactly one fire"

**What:** Fire only on the boolean transition `was_satisfied: false -> true`, where `was_satisfied` is read from the persisted snapshot and the new value is written back by the SEAM. For threshold/percent, apply a hysteresis margin so a value oscillating at the boundary does not re-satisfy.
**When to use:** All condition kinds compute a per-tick `satisfied` boolean; the edge logic wraps them uniformly.
**Example:**
```javascript
// Source: synthesized from CONTEXT D-07 + PITFALLS.md:213-229 (Pitfall 10) [CITED: Datadog recovery-threshold / Prometheus keep_firing_for]
// Inside evaluate(), after computing `satisfiedNow` (boolean) for the (compound) condition:
var wasSatisfied = snapshot.was_satisfied === true;   // persisted edge state (NEVER SW heap)
var isEdge = (!wasSatisfied && satisfiedNow);          // false -> true transition only

var outcome = isEdge ? 'fired' : 'no_fire';
var next_state = {
  last_value: rawNewValue,
  was_satisfied: satisfiedNow,        // persist so an oscillation post-eviction does not re-fire
  last_evaluated_at: now
};
```
**Hysteresis at the boundary (threshold/percent only):** when re-arm-on-fire is opted in (Phase 19 owns the re-arm tool surface, but the hysteresis math belongs here), require the value to *clear* before `was_satisfied` resets to false: for `>= X`, only set `was_satisfied=false` once value `< X - margin`; for `changed`, only after a stable read. For the Phase-15 fire-once default, the SEAM transitions the snapshot to terminal `status:'fired'` on the first edge, so the existing `noop_terminal` guard (`trigger-lifecycle.js:267-269`) is the second, storage-backed line of dedupe -- a duplicate alarm tick after the write sees `status:'fired'` and no-ops.

**Why edge state must be persisted, not heaped:** the milestone is built around SW eviction. If `was_satisfied` lived in the SW heap it would reset to `undefined`/`false` on every wake; a value sitting at `satisfied=true` across an eviction would then read as a fresh `false -> true` edge and fire a second time. Persisting it in the snapshot (Phase-14 envelope) closes that hole.

### Pattern 5: The concurrency cap (D-09) -- storage-first active count

**What:** A clone of the agent-registry cap surface, with ONE deliberate divergence: the active count comes from `trigger-store.listArmedSnapshots().length`, not an in-heap `Set`.
**Example:**
```javascript
// Source: clone of extension/utils/agent-registry.js:52-78,72-78,787-831 [VERIFIED: codebase read]
var FSB_TRIGGER_CAP_STORAGE_KEY = 'fsbTriggerCap';   // chrome.storage.LOCAL (survives restart), NOT session
var FSB_TRIGGER_CAP_DEFAULT = 8;
var FSB_TRIGGER_CAP_MIN = 1;
var FSB_TRIGGER_CAP_MAX = 64;

function _clampCap(v) {                                // identical to agent-registry.js:72-78
  if (typeof v !== 'number' || !Number.isFinite(v)) return FSB_TRIGGER_CAP_DEFAULT;
  var i = Math.floor(v);
  if (i < FSB_TRIGGER_CAP_MIN) return FSB_TRIGGER_CAP_MIN;
  if (i > FSB_TRIGGER_CAP_MAX) return FSB_TRIGGER_CAP_MAX;
  return i;
}
// getCap() clamps on the read path (defense-in-depth vs poisoned cache) -- agent-registry.js:787-789.
// setCap(v) clamps, writes storage.local best-effort, grandfathers when clamped < activeAtChange.

// ARM path (NOT evaluate): the cap check counts storage, not heap.
async function armTrigger(spec) {
  var store = _getStore();
  var armed = store ? await store.listArmedSnapshots() : [];
  var active = armed.length;                           // <-- storage-of-truth (D-09 divergence)
  var cap = getCap();
  if (active >= cap) {
    return { error: 'TRIGGER_CAP_REACHED', code: 'TRIGGER_CAP_REACHED', cap: cap, active: active };
  }
  // build the flat-scalar snapshot (status:'armed', baseline, deadline_at, alarm_name, ...)
  // then delegate the alarm+persist to the Phase-14 seam:
  return FsbTriggerLifecycle.armTrigger(snapshot);     // trigger-lifecycle.js:173 (pure plumbing)
}
```
**Why storage-first:** `agent-registry.js:294` counts `self._agents.size` (a heap Map). For triggers that is wrong: after SW eviction the heap is empty, so a heap counter would read `active=0` and let the cap be exceeded across the very eviction the milestone targets. `listArmedSnapshots()` (`trigger-store.js:168-173`) reads the persisted envelope, so the cap keeps enforcing.

### Anti-Patterns to Avoid

- **Comparing string vs number** (`"1,050" < 1000` is `true` by JS coercion -> false fire). ALWAYS parse both sides to `Number` first (D-05; Pitfall 9). Enforce the `number`-vs-raw-`text` split in code, per condition kind.
- **NaN-as-0** on a failed parse. NaN MUST surface as `parse_error` and never fire (EXTRACT-04; Pitfall 9).
- **`new RegExp(separator)`** to strip group/decimal separators -- `.` is a regex metacharacter (escaping footgun). Use literal `String.prototype.split(sep).join('')` (D-03).
- **Auto-dividing `%` by 100** in the extractor. Keep `%` raw + an `isPercent` flag; the comparison layer decides meaning (D-03).
- **Edge state in the SW heap** -- guarantees a double-fire after eviction (D-07). Persist in the snapshot.
- **In-heap `Set` for the cap active count** -- silently stops enforcing across eviction (D-09). Count `listArmedSnapshots()`.
- **`setTimeout`/`AbortController` to time-box a synchronous regex** -- impossible in a single-threaded SW (D-08). Length caps are the only hard guarantee.
- **Touching `chrome.storage` inside `evaluate()`** -- breaks purity and the atomic-write-back contract; the SEAM owns all storage I/O (D-02).
- **Editing `agent-loop.js` or any existing MCP tool schema** -- INV-04 (agent-loop byte-frozen) and INV-01 (schemas byte-identical). Phase 15 touches only `background.js` `importScripts` + the `trigger-lifecycle.js` SEAM.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Locale separator detection | A hand-coded "last `.` or `,` with <=2 trailing digits is decimal" heuristic | `Intl.NumberFormat(locale).formatToParts(11000.1)` | The built-in is authoritative across de/fr/in/etc.; the heuristic mis-handles `1.234` (ambiguous), Indian multi-group, and NBSP. The override (D-04) covers the residual ambiguity the built-in cannot resolve from the string alone. |
| Currency-symbol stripping | A maintained list of every currency symbol/crypto glyph | Generic strip of all non-`[0-9.]` AFTER separator normalization (D-03 step 5) | Letter currencies (CHF, kr, zl) and crypto glyphs (not ISO-4217) all fall to the generic strip; no list to maintain. |
| Number parsing | An npm currency lib (`currency.js`/`numeral`/`dinero`) | The ~60-line `parseLocaleNumber` recipe | FORBIDDEN this milestone (STACK.md:99-101); zero-dep; no precedent to extend. |
| ReDoS-safe matching | A safe-regex npm lib or a custom backtracking engine | Length caps + static heuristic + native `RegExp` | `safe-regex` star-height analysis is unsound (DISCUSSION-LOG); the length cap is the real CPU bound. |
| Concurrency cap + typed reject + grandfather | A fresh cap design | Clone `agent-registry.js:52-78,787-831` verbatim (rename + storage-first count) | Proven, test-covered pattern; matches LIFE-04's "mirrors the agent cap" requirement. |
| chrome.storage mock for tests | A new fake | `tests/fixtures/run-task-harness.js installChromeMock` (session+local) OR the inline `createChromeMock()` from `trigger-lifecycle.test.js` | Both proven; the harness already backs `storage.local` (needed for the cap test). |

**Key insight:** Every "deceptively simple" sub-problem in this phase (locale parsing, ReDoS, the cap) has a documented in-repo or built-in answer. The genuinely-new work is the *composition* -- the six condition kinds, the compound fold, the edge/hysteresis decision, and the precise `evaluate()`/SEAM division -- not any individual primitive.

## Runtime State Inventory

> Phase 15 is **net-new code only** (two new modules + one SEAM edit + one `importScripts` glue). It is not a rename/refactor/migration. No existing stored data, live-service config, OS-registered state, secrets, or build artifacts carry a string this phase renames. Confirmed below for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None -- the trigger-store envelope (`fsbTriggerRegistry`) already exists (Phase 14); Phase 15 only *populates* reserved fields (`condition`/`baseline`/`last_value`/edge flag) that Phase 14 already persists verbatim. No key/schema rename. | None -- verified by reading `trigger-store.js:22-49` (fields reserved for Phase 15). |
| Live service config | None -- no external service, no UI-stored config. | None. |
| OS-registered state | None -- no Task Scheduler / launchd / pm2 surface; the only timer is `chrome.alarms` owned by Phase 14. | None. |
| Secrets/env vars | None -- no new secret keys or env var names. | None. |
| Build artifacts | None -- no build step (the extension ships raw `.js`); the `mcp/` package build is untouched (no MCP changes, INV-01). | None -- verified by config (`mode: yolo`, no extension build) and INV-01. |

**Nothing found in any category** -- verified by the net-new scope (D-01) and by reading the Phase-14 store/lifecycle modules, which already reserve every field Phase 15 writes.

## Common Pitfalls

### Pitfall 1: Locale numeric mis-parse (the 1000x silent error)
**What goes wrong:** `parseFloat("1,234.56")` -> `1`; German `"1.234,56"` mis-parses; French `"1 234,56"` (NBSP) breaks; `"(123.45)"` (accounting negative) and `"12,5 %"` mis-parse. A `>= 1000` threshold then fires on garbage, or a string-vs-number compare (`"1,050" < 1000`) coerces to a false fire.
**Why it happens:** JS `parseFloat`/`Number` are locale-blind; test data is US-formatted so the bug hides until a EUR/INR/JPY page.
**How to avoid:** The D-03 normalize-then-parse recipe with `formatToParts` separator discovery; parse BOTH sides to `Number`; NaN -> `parse_error`; the mandatory `locale`/`decimal_separator` override (D-04) for the residual `1.234`/`1,5` ambiguity that is provably unresolvable from the string alone.
**Warning signs:** Threshold fires immediately on a large-looking string; never fires on a EUR/JPY page; `last_value` is NaN/0 while the text shows a number; off-by-1000 errors. (Source: PITFALLS.md:192-209.)

### Pitfall 2: Flapping / oscillation near a threshold (fire storm)
**What goes wrong:** A price bounces 99.98 <-> 100.02 at a `>= 100` threshold; a naive "fire whenever true" emits a fire every crossing. A `changed` value toggling between two states fires endlessly.
**Why it happens:** Level-trigger evaluation with no memory of prior state.
**How to avoid:** Edge-trigger (fire on the not-satisfied -> satisfied transition using persisted `was_satisfied`), fire-once default (terminal `status:'fired'`), and hysteresis margin at the boundary on re-arm (Pattern 4). Critically, persist the edge state in the snapshot, not the heap, so an oscillation across SW eviction does not re-fire.
**Warning signs:** Dozens of fires within a minute for one trigger; tight bursts whenever the value sits near threshold; a `changed` trigger that never stops. (Source: PITFALLS.md:213-229.)

### Pitfall 3: Duplicate fire across SW eviction
**What goes wrong:** The condition is met, the SW is evicted before the `fired` write completes (or a duplicate alarm tick arrives), and the trigger fires twice -- two deliveries for one crossing.
**Why it happens:** The fire decision and the durable terminal write are not atomic, or dedupe lives in the heap.
**How to avoid:** Keep the terminal write in the SEAM (storage-of-truth) where the existing `noop_terminal` guard (`trigger-lifecycle.js:267-269`) already no-ops a tick that sees `status:'fired'`. `evaluate()` is pure and never writes; the SEAM writes once, atomically, then disarms. Phase 14 already has deterministic Node-mock coverage of the eviction-between-read-and-decision case (`trigger-lifecycle.test.js` Case F) -- mirror that for the fire path.
**Warning signs:** Two fire events with the same `trigger_id`; a fire after a tick that should have been `noop_terminal`. (Source: PITFALLS.md Pitfall 16; CONTEXT D-07.)

### Pitfall 4: ReDoS on attacker-controlled DOM text
**What goes wrong:** A caller-supplied `regex` with a catastrophic-backtracking shape (`(a+)+$`) matched against attacker-controlled page text freezes the single SW thread indefinitely.
**Why it happens:** Native `RegExp` backtracks; there is no synchronous time-box in an MV3 SW and the linear engine is unreachable.
**How to avoid:** Pattern-length cap (~1000) + text-length cap (~10k element / ~100k page) as the hard CPU bound; static evil-shape heuristic as defense-in-depth; compile-once cache; invalid/rejected -> `pattern_error` (Pattern 3). Treat page text as untrusted input.
**Warning signs:** A trigger's alarm tick that never returns; SW unresponsive after arming a `regex` trigger on a large page. (Source: PITFALLS.md:408 Security/Safety table; FEATURES.md:33; CONTEXT D-08.)

### Pitfall 5: Compound condition silent partial fire
**What goes wrong:** In an `AND`/`OR` compound, one sub-condition hits `parse_error` (or `pattern_error`) but the fold treats it as `false` and the other sub-condition still satisfies an `OR`, producing a fire on partially-invalid data.
**Why it happens:** Folding error states into booleans.
**How to avoid:** ANY sub-condition `parse_error`/`pattern_error` short-circuits the WHOLE compound to that error outcome (never a partial fire). The compound returns `{ outcome:'parse_error'|'pattern_error' }`, not `no_fire`/`fired`. (Source: CONTEXT D-06 + EXTRACT-04 "never fires"; synthesized.)

## Code Examples

### Locale numeric parse (the verified recipe)
```javascript
// Source: STACK.md:146-160 + verified empirically in this runtime [VERIFIED: local Bash run, Node v25.9.0]
var _sepCache = new Map();   // locale -> { group, decimal }  (NumberFormat construction is expensive; memoize)

function _discoverSeparators(locale) {
  if (_sepCache.has(locale)) return _sepCache.get(locale);
  var seps = { group: ',', decimal: '.' };  // safe default
  try {
    var parts = new Intl.NumberFormat(locale).formatToParts(11000.1);
    parts.forEach(function(p) {
      if (p.type === 'group') seps.group = p.value;       // de-DE '.', fr-FR U+202F, en-IN U+002C
      if (p.type === 'decimal') seps.decimal = p.value;   // de-DE ',', en-US '.'
    });
  } catch (_e) { /* keep defaults */ }
  _sepCache.set(locale, seps);
  return seps;
}

function parseLocaleNumber(raw, opts) {
  if (typeof raw !== 'string') return { error: 'parse_error', isPercent: false };
  var s = raw.trim();
  if (!s) return { error: 'parse_error', isPercent: false };

  var sign = 1;
  // (1) parentheses-negative
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
  // (2) explicit sign + percent
  var isPercent = /%/.test(s);
  if (/^-/.test(s)) { sign = -1; }
  // resolve separators: decimal_separator override wins over locale (D-04)
  var locale = (opts && opts.locale) || 'en-US';
  var seps = _discoverSeparators(locale);
  var groupSep = seps.group;
  var decimalSep = (opts && opts.decimal_separator) ? opts.decimal_separator : seps.decimal;
  // (3) remove group separator via LITERAL split/join (never new RegExp -- '.' is a metachar) (D-03)
  if (groupSep) s = s.split(groupSep).join('');
  // (4) swap decimal separator to '.'
  if (decimalSep && decimalSep !== '.') s = s.split(decimalSep).join('.');
  // (5) strip everything non-[0-9.] (kills $ € £ ¥ CHF kr zl ₿ Ξ % letters)
  s = s.replace(/[^0-9.]/g, '');
  // (6) parseFloat; NaN -> parse_error (NEVER 0, NEVER a fire) (EXTRACT-04)
  var n = parseFloat(s);
  if (!Number.isFinite(n)) return { error: 'parse_error', isPercent: isPercent };
  return { value: sign * n, isPercent: isPercent };
}
```

### Value source selection (extract override, EXTRACT-03)
```javascript
// Source: STACK.md:157-159 + CONTEXT D-05 [CITED: PROJECT.md read-precedence]
// reportedValue is what the (Phase 16/17) watch layer read; this fn only SELECTS a source.
function extractValue(reportedValue, descriptor) {
  var mode = (descriptor && descriptor.extract) || 'text';   // 'text' | 'number' | 'attribute'
  if (mode === 'attribute') {
    var name = descriptor.attribute;                          // e.g. 'data-price', 'aria-valuenow'
    var attrs = (reportedValue && reportedValue.attributes) || {};
    return (typeof attrs[name] === 'string') ? attrs[name].trim() : '';
  }
  // 'text' and 'number' both start from the reported raw text (trimmed);
  // 'number' additionally goes through parseLocaleNumber at the compare site.
  var text = (reportedValue && typeof reportedValue.text === 'string') ? reportedValue.text.trim() : '';
  return text;
}
```

### Condition dispatch skeleton (the six kinds, D-06)
```javascript
// Source: synthesized from CONTEXT D-05/D-06 [ASSUMED -- exact internal structure is the planner's]
// Returns a per-condition result: { satisfied, old_value, new_value } OR { error }.
function evaluateOne(condition, snapshot, reportedValue, opts) {
  var raw = extractValue(reportedValue, condition);  // honors extract override
  switch (condition.kind) {
    case 'changed':                                  // raw text vs baseline (EXTRACT-02)
      return { satisfied: raw !== String(snapshot.baseline).trim(),
               old_value: snapshot.baseline, new_value: raw };
    case 'contains': {                               // case-insensitive default (TRIG-05)
      var hay = condition.case_sensitive ? raw : raw.toLowerCase();
      var needle = condition.case_sensitive ? condition.value : String(condition.value).toLowerCase();
      return { satisfied: hay.indexOf(needle) !== -1, old_value: snapshot.last_value, new_value: raw };
    }
    case 'threshold': {                              // parse BOTH sides (D-05); NaN -> parse_error
      var cur = parseLocaleNumber(raw, opts);
      if (cur.error) return { error: 'parse_error' };
      var tgt = parseLocaleNumber(String(condition.target), opts);
      if (tgt.error) return { error: 'parse_error' };
      var ok = (condition.operator === '>=') ? cur.value >= tgt.value
             : (condition.operator === '<=') ? cur.value <= tgt.value
             : (condition.operator === '>')  ? cur.value >  tgt.value
             :                                  cur.value <  tgt.value;
      return { satisfied: ok, old_value: snapshot.last_value, new_value: cur.value };
    }
    case 'percent_change': {                         // (cur - baseline)/baseline*100 (TRIG-06)
      var c = parseLocaleNumber(raw, opts);
      var b = parseLocaleNumber(String(snapshot.baseline), opts);
      if (c.error || b.error || b.value === 0) return { error: 'parse_error' };  // no divide-by-zero fire
      var pct = Math.abs((c.value - b.value) / b.value * 100);
      return { satisfied: pct >= Math.abs(condition.percent), old_value: b.value, new_value: c.value };
    }
    case 'equals': {                                 // numeric equals OR text equals
      if (condition.numeric) {
        var cv = parseLocaleNumber(raw, opts), tv = parseLocaleNumber(String(condition.value), opts);
        if (cv.error || tv.error) return { error: 'parse_error' };
        var tol = condition.tolerance || 0;
        return { satisfied: Math.abs(cv.value - tv.value) <= tol, old_value: snapshot.last_value, new_value: cv.value };
      }
      return { satisfied: raw === String(condition.value), old_value: snapshot.last_value, new_value: raw };
    }
    case 'regex': {                                  // guarded compile + bounded test (TRIG-04, Pattern 3)
      var m = regexMatches(condition.pattern, raw, TEXT_MAX_LEN_ELEMENT);
      if (m.error) return { error: 'pattern_error' };
      return { satisfied: m.matched, old_value: snapshot.last_value, new_value: raw };
    }
    default:
      return { error: 'parse_error' };               // unknown kind treated as non-firing error
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Blind `parseFloat` after stripping `$`/`,` | `Intl.NumberFormat().formatToParts()` separator discovery + explicit override | ECMA-402 `formatToParts` (broad support since ~2018; native here) | Locale-correct parse for de/fr/in/jp; the override resolves residual string-only ambiguity. |
| Level-trigger ("fire when true each tick") | Edge-trigger + fire-once + hysteresis (Datadog recovery-threshold / Prometheus `keep_firing_for`) | Monitoring-industry standard | No fire storms; exactly one fire per crossing. |
| `safe-regex` star-height analysis | Length caps (hard bound) + static heuristic (best-effort) + native engine | OWASP/eslint-plugin-regexp guidance; V8 linear engine gated behind a startup flag | Deterministic CPU bound without a dependency; accepts that static ReDoS detection is incomplete. |

**Deprecated/outdated:**
- The ARCHITECTURE.md shorthand `evaluate(last, current, condition)` (`:303`) is superseded by CONTEXT D-02's `evaluate(snapshot, reportedValue, now?)` -- use the latter (the snapshot carries `last`/`condition`/`baseline`/edge flag).
- npm currency/number libs (`currency.js`/`numeral`/`dinero`/`accounting`) -- forbidden this milestone (STACK.md:99-101).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `reportedValue` is shaped `{ text, attributes? }` by the Phase 16/17 watch layer | Pattern 2, extractValue | LOW -- Phase 16/17 own this shape; if they choose differently, `extractValue`/`evaluate` signatures adapt. Flag the contract to Phase 16 planning. The shape choice does not affect the locale/edge/cap logic. |
| A2 | The internal `evaluateOne` dispatch structure (switch on `condition.kind`) | Code Examples | LOW -- internal structure is the planner's discretion (D-06 says planner finalizes); the per-kind *semantics* are locked, only the code organization is assumed. |
| A3 | Regex caller flags are NOT honored (default-flag compile only) | Pattern 3 | MEDIUM -- honoring a caller `/g` flag would introduce `lastIndex` state across `.test()` calls (a correctness footgun). Recommend default-flags-only; confirm in discuss/plan if callers need `i`/`m`. A safe middle ground: allow `i`/`m`/`s` but strip `g`/`y`. |
| A4 | Compound error short-circuits the whole compound to that error (never partial fire) | Pitfall 5, TRIG-07 | LOW -- this is the only safe reading of EXTRACT-04 ("never fires") combined with compounds; called out so the planner makes it an explicit test. |
| A5 | `PATTERN_MAX_LEN=1000`, `TEXT_MAX_LEN_ELEMENT=10000`, `TEXT_MAX_LEN_PAGE=100000` | Pattern 3 | LOW -- CONTEXT D-08 + discretion explicitly leave these as tuning values "to the longest legitimately-expected pattern." Defaults are sensible; planner may adjust. |

**Note:** All five are LOW/MEDIUM internal-structure or boundary-tuning assumptions explicitly delegated to the planner by CONTEXT's "Claude's Discretion" section. No *locked decision* is assumed -- the spine (D-01..D-09) is fully grounded in verified codebase reads and the verified `Intl` recipe.

## Open Questions (RESOLVED)

> All three are non-blocking and are carried into the plans as concrete, unit-tested decisions. None gated planning.

1. **`reportedValue` shape contract with Phase 16/17**
   - What we know: `evaluate()` consumes a reported value; Phase 15 does not scrape (D-02). The natural shape is `{ text, attributes? }` (A1).
   - What's unclear: whether Phase 16/17 will report a single string or a structured object, and how `attribute` values arrive.
   - Recommendation: Phase 15 defines the `extractValue(reportedValue, descriptor)` interface it needs (`{ text, attributes }`); Phase 16/17 conform to it. Document this as the consumer contract in the P3 plan so the later watch phases inherit it. It does not block Phase 15 (tests inject the shape directly).
   - RESOLVED: `{ text, attributes? }` adopted in plans 15-01 (`extractValue` producer) and 15-03 (SEAM constructs `{ text: snap.reported_value ?? snap.last_value }`); later watch phases conform.

2. **Regex flag policy (A3)**
   - What we know: default-flag compile is safest (no `lastIndex` state).
   - What's unclear: whether any real caller needs case-insensitive (`i`) regex (note: `contains` already provides case-insensitive substring, so `i`-regex demand may be near-zero).
   - Recommendation: default-flags-only for v0.11.0; if a flag is needed, allow `i`/`m`/`s` and explicitly strip `g`/`y`. Cheap to revisit in Phase 19.
   - RESOLVED: default-flags-only compile adopted in plan 15-02 Task 2 (acceptance asserts no `AbortController`; default-flag compile, no `/g` `lastIndex` footgun).

3. **Where the snapshot is first built at arm time**
   - What we know: `trigger-lifecycle.armTrigger(snapshot)` (`:173`) is pure plumbing that persists a *fully-formed* snapshot; the manager builds it (Pattern 5).
   - What's unclear: nothing blocking -- Phase 18 wires the actual `trigger()` tool; Phase 15's `armTrigger` is the internal cap-gated builder that Phase 18 calls.
   - Recommendation: implement `TriggerManager.armTrigger(spec)` to build the snapshot (baseline capture from the reported initial value, `deadline_at = now + FSB_TRIGGER_DEFAULT_TTL_MS`, `was_satisfied:false`) and delegate persistence to the Phase-14 seam. Phase 18 calls it; Phase 15 unit-tests it against the mock.
   - RESOLVED: `armTrigger(spec)` builder adopted in plan 15-02 Task 3 (cap-gated via `_withArmLock`, `deadline_at = now + TTL`, `was_satisfied:false`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `Intl.NumberFormat().formatToParts()` | EXTRACT-01 locale parse | Yes | ECMA-402, Node v25.9.0 verified | None needed -- universal in V8/SW global. |
| `RegExp` (native) | TRIG-04 regex | Yes | JS built-in | None needed. |
| `chrome.storage.local` | LIFE-04 cap persistence | Yes (granted) | MV3 | manifest grants `storage` (14-CONTEXT canonical_refs); agent-registry already uses `.local`. |
| `chrome.storage.session` | SEAM write-back (via trigger-store) | Yes (granted) | MV3 | Phase 14 already uses it. |
| Node (test runtime) | unit tests | Yes | v25.9.0 | None -- tests are `node tests/X.test.js`. |
| esbuild / mcp build | NOT required by Phase 15 | n/a | -- | Phase 15 adds no MCP/build surface (INV-01). |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Plain Node scripts (`node tests/<name>.test.js`), Node built-in `assert` + a local `check(cond,msg)` pass/fail counter; `process.exit(failed>0?1:0)`. No Jest/Mocha/Vitest. |
| Config file | none -- tests are listed serially in root `package.json` `scripts.test` [VERIFIED: codebase read]. |
| Quick run command | `node tests/value-extractor.test.js && node tests/trigger-manager.test.js && node tests/trigger-cap.test.js` |
| Full suite command | `npm test` (the long serial chain; new tests appended at the end, mirroring how `trigger-store.test.js`/`trigger-lifecycle.test.js` were appended) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRIG-02 | `changed` fires once on delta from baseline; no fire when equal | unit | `node tests/trigger-manager.test.js` | Wave 0 |
| TRIG-03 | `>=`/`<=`/`>`/`<` correct on parsed numbers; boundary + hysteresis | unit | `node tests/trigger-manager.test.js` | Wave 0 |
| TRIG-04 | `equals` exact; `regex` compile-once + length-cap + evil-shape reject -> `pattern_error`; valid match fires | unit | `node tests/trigger-manager.test.js` | Wave 0 |
| TRIG-05 | `contains` case-insensitive default; `case_sensitive` opt | unit | `node tests/trigger-manager.test.js` | Wave 0 |
| TRIG-06 | `percent_change` +/-N% from baseline; baseline 0/NaN -> `parse_error` | unit | `node tests/trigger-manager.test.js` | Wave 0 |
| TRIG-07 | compound AND/OR fold; sub-condition error short-circuits whole compound | unit | `node tests/trigger-manager.test.js` | Wave 0 |
| EXTRACT-01 | locale matrix parses US/DE/FR-NBSP/IN/parens/% correctly | unit | `node tests/value-extractor.test.js` | Wave 0 |
| EXTRACT-02 | `changed`/`contains` use raw trimmed text, no parse | unit | `node tests/value-extractor.test.js` + `node tests/trigger-manager.test.js` | Wave 0 |
| EXTRACT-03 | `extract: text\|number\|attribute(+name)` selects the right source | unit | `node tests/value-extractor.test.js` | Wave 0 |
| EXTRACT-04 | failed parse -> `parse_error`, NEVER a fire (no NaN-as-0) | unit | `node tests/value-extractor.test.js` + `node tests/trigger-manager.test.js` | Wave 0 |
| LIFE-04 | cap 1-64 default 8; over-cap arm -> typed `TRIGGER_CAP_REACHED`; clamp + grandfather; active counts `listArmedSnapshots()` | unit | `node tests/trigger-cap.test.js` | Wave 0 |

### Sampling Rate
The two matrices (locale-parse and condition-kind) are the coverage crux. Adequate coverage is **exhaustive-by-class**, not a single happy path:

- **Locale-parse matrix (EXTRACT-01) -- every row is a required case:**
  | Input | Locale/override | Expected |
  |-------|-----------------|----------|
  | `$1,234.56` | en-US | 1234.56, isPercent=false |
  | `1.234,56` | de-DE | 1234.56 |
  | `1 234,56` (U+00A0) | fr-FR | 1234.56 |
  | `1 234,56` (U+202F narrow NBSP) | fr-FR | 1234.56 |
  | `12,34,567.89` | en-IN (multi-group) | 1234567.89 |
  | `($1,234.56)` | en-US | -1234.56 |
  | `-1.234,56` | de-DE | -1234.56 |
  | `12,5 %` | de-DE | 12.5, isPercent=true (NOT 0.125) |
  | `45%` | en-US | 45, isPercent=true |
  | `CHF 1'234.50` | de-CH | 1234.50 (apostrophe group stripped by generic strip) |
  | `1.234` | de-DE (override) | 1234 |
  | `1.234` | en-US | 1.234 (override resolves the ambiguity) |
  | `abc` / `""` / `null` | any | `parse_error` (NaN never -> 0, never fires) |
  | `₿0.5` | en-US | 0.5 (crypto glyph generic-stripped) |

- **Condition-kind matrix (TRIG-02..07) -- for EACH of the six kinds:** (a) a positive case that fires, (b) a negative case that does not, (c) the edge case proving exactly-one-fire (was_satisfied true -> still satisfied -> `no_fire`), and where numeric (d) a `parse_error` case. Plus the compound (TRIG-07): `AND` both-true fires, `AND` one-false no-fire, `OR` one-true fires, and a compound where one leg errors -> whole compound `parse_error`/`pattern_error` (Pitfall 5).

- **Edge/dedupe (D-07) -- mirror `trigger-lifecycle.test.js` Case F:** evaluate with `was_satisfied:false` + satisfied value -> `outcome:'fired'`, `next_state.was_satisfied:true`; re-evaluate the SAME satisfied value with `was_satisfied:true` -> `no_fire` (no re-fire). This is the unit-level proof of "oscillation post-eviction does not re-fire."

- **Regex guard (D-08):** valid pattern matches; `(a+)+` rejected -> `pattern_error`; `(a|a)*` rejected; `.*.*` rejected; >1000-char pattern rejected; invalid syntax `(` rejected; over-cap text truncated before `.test()` (assert it returns without hanging -- a length-bounded input is the guarantee); compile-once cache hit (same pattern twice returns the cached `RegExp` -- assert identity).

- **Cap (LIFE-04) -- clone `tests/agent-cap.test.js` cases:** default cap 8 after construction; `setCap` clamping (0->1, 100->64, NaN->8, 3.7->3, -5->1, string->8); over-cap arm returns `{ code:'TRIGGER_CAP_REACHED', error:'TRIGGER_CAP_REACHED', cap, active }`; **the divergence test** -- with N armed snapshots in the mock store and an emptied SW heap, `armTrigger` still rejects at the cap (proves `listArmedSnapshots()` count, not a heap Set).

- **Per task commit:** `node tests/value-extractor.test.js && node tests/trigger-manager.test.js && node tests/trigger-cap.test.js` (each is fast, <1s).
- **Per wave merge:** the three above plus the unchanged Phase-14 pair (`node tests/trigger-store.test.js && node tests/trigger-lifecycle.test.js`) to confirm the SEAM edit did not regress Phase 14.
- **Phase gate:** full `npm test` green before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/value-extractor.test.js` -- covers EXTRACT-01/02/03/04 (the full locale matrix above). Mirror the inline `createChromeMock()`+`setupHarness()` re-require pattern from `trigger-lifecycle.test.js:102-151` (though the extractor needs no chrome -- a plain `require()` + `delete require.cache` suffices since it is pure).
- [ ] `tests/trigger-manager.test.js` -- covers TRIG-02..07 + the edge/dedupe + regex-guard cases. Inject snapshot + reportedValue directly (pure `evaluate()`); use `tests/fixtures/run-task-harness.js installChromeMock` only if the manager's `_getStore()`/cap path is exercised in the same file.
- [ ] `tests/trigger-cap.test.js` -- clone of `tests/agent-cap.test.js`; needs `installChromeMock({storage:{local:{...}}})` for `fsbTriggerCap` AND a mock `FsbTriggerStore` (or the real one over the session mock) so `listArmedSnapshots()` returns a controllable count.
- [ ] Append the three new test invocations to `package.json` `scripts.test` (at the end, after `trigger-lifecycle.test.js`, matching the Phase-14 append).
- [ ] Framework install: none -- `node` + built-in `assert` only.

*(No framework to install; the gap is purely the three new test files + the `package.json` append.)*

## Security Domain

> `security_enforcement` is not set in `.planning/config.json` (treated as enabled). Phase 15 is a pure comparison engine with no auth/session/network surface, so most ASVS categories are N/A. The one live security concern is input validation of caller-supplied patterns/values against untrusted page text.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface in this phase (Phase 18 wires ownership). |
| V3 Session Management | no | No sessions; `chrome.storage.session` is a storage area, not a web session. |
| V4 Access Control | no | Trigger ownership/`agent_id` enforcement is Phase 18; Phase 15 stores `agent_id` faithfully but does not gate on it. |
| V5 Input Validation | **yes** | Caller-supplied `pattern` (length cap + evil-shape reject + compile-guard, D-08); caller-supplied numeric `target`/`value` parsed via the same `parseLocaleNumber` chokepoint with NaN -> `parse_error`; unknown `condition.kind` -> non-firing error. Page text treated as untrusted (bounded before `.test()`). |
| V6 Cryptography | no | No crypto in this phase. |

### Known Threat Patterns for {Chrome MV3 SW, pure comparison engine}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| ReDoS via caller `regex` on attacker-controlled DOM text | Denial of Service | Pattern + text length caps (hard CPU bound) + static evil-shape heuristic + compile-once cache; invalid/rejected -> `pattern_error` (D-08, Pattern 3). |
| Firing on garbage from a mis-parsed number (1000x error) | Tampering (integrity of the fire decision) | Locale normalize-then-parse + parse both sides to Number + NaN -> `parse_error`, never NaN-as-0, never string-vs-number (D-05, Pitfall 1). |
| Divide-by-zero / NaN propagation in `percent_change` | Denial of Service / integrity | Baseline 0 or NaN -> `parse_error` before the division; never a fire (TRIG-06). |
| Compound condition partial-fire on a partially-invalid sub-condition | Tampering | Any sub-condition error short-circuits the whole compound to that error outcome (Pitfall 5). |
| Unbounded `_regexCache` / `_sepCache` growth | Denial of Service (memory) | Caches keyed by bounded inputs (pattern <=1000 chars; a small set of locales). Acceptable for a per-extension SW; if needed, cap cache size with a simple LRU eviction (low priority -- flag, do not block). |

## Sources

### Primary (HIGH confidence)
- `extension/utils/trigger-lifecycle.js` (full read) -- the SEAM at `:290` (`evaluated_noop`), `noop_terminal` guard `:267-269`, `armTrigger`/`clearTrigger` `:173-212`, dual-export + `_getChrome`/`_getStore` `:88-107`.
- `extension/utils/trigger-store.js` (full read) -- snapshot schema `:22-49`, `listArmedSnapshots()` `:168-173`, `readSnapshot`/`writeSnapshot`/`hydrate` `:134-181`, dual-export `:185-199`.
- `extension/utils/agent-registry.js` (read `:1-1204`) -- cap constants `:52-56`, `_clampCap` `:72-78`, typed `AGENT_CAP_REACHED` reject `:294-308`, `getCap`/`setCap`/grandfather `:787-831`, `_loadCapFromStorage` `:848-858`, onChanged subscriber `:876-898`.
- `tests/trigger-lifecycle.test.js` (full read) -- `createChromeMock()`/`createStorageArea()`/`setupHarness()` `:66-151`, eviction Case F `:271-286`, surface-shape Case N `:446-469`.
- `tests/trigger-store.test.js` (full read) -- `installChromeMock` usage, `makeSnapshot` flat-scalar factory `:48-68`.
- `tests/agent-cap.test.js` (grep) -- 20-concurrent-under-cap-8 pattern, clamping cases (0->1/100->64/NaN->8/3.7->3/-5->1).
- `tests/fixtures/run-task-harness.js` (read) -- `installChromeMock` backs both `storage.session` and `storage.local` `:133-148`.
- `.planning/research/STACK.md` (read `:90-179`) -- the `formatToParts` recipe `:146-160`, "What NOT to Use" zero-dep mandate `:99-110`, version compatibility, "FSB has NO existing currency helper" `:101`.
- `.planning/research/PITFALLS.md` (read) -- Pitfall 9 locale parse `:192-209`, Pitfall 10 flapping `:213-229`, regex/ReDoS in the Security table `:408`.
- `.planning/research/FEATURES.md` (read `:25-55`) -- compile-once + ReDoS guard direction `:33`.
- `.planning/phases/15-fire-condition-engine-value-extraction/15-CONTEXT.md` (full read) -- D-01..D-09.
- `.planning/phases/15-fire-condition-engine-value-extraction/15-DISCUSSION-LOG.md` (full read) -- the two resolved external-research findings (regex impossibility facts + locale recipe soundness).
- `.planning/REQUIREMENTS.md` (read) -- TRIG-02..07, EXTRACT-01..04, LIFE-04 acceptance criteria.
- Local empirical verification [VERIFIED: Bash, Node v25.9.0] -- `Intl.NumberFormat().formatToParts()` separators for de-DE/fr-FR/en-IN; confirmation that `percent_change`/`was_satisfied`/`hysteresis`/`fsbTriggerCap`/`TRIGGER_CAP_REACHED`/`Intl`/`formatToParts` have ZERO occurrences in `extension/`.

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` (grep) -- the `evaluate(last, current, condition)` shorthand `:303` (reconciled to D-02 `evaluate(snapshot, reportedValue, now?)`); cap shape ref `:244`.
- `.planning/STATE.md` + `.planning/phases/14-trigger-survivability-foundation/14-CONTEXT.md` -- invariants INV-01/INV-04, Phase-14 snapshot/SEAM decisions, the storage-is-truth contract.

### Tertiary (LOW confidence)
- DISCUSSION-LOG external-research citations carried as [CITED] (v8.dev/blog/non-backtracking-regexp; OWASP ReDoS / Input Validation cheat sheets; eslint-plugin-regexp `no-super-linear-backtracking`; MDN `Intl.NumberFormat`/`formatToParts`; Unicode CLDR). Not independently re-fetched this session (the DISCUSSION-LOG already resolved them to Confident; per the objective, not redone). The *recipe* they support was re-verified empirically in this runtime.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- every library/module verified by direct codebase read; `Intl` recipe verified empirically in the target runtime.
- Architecture (evaluate()/SEAM division, cap, edge): HIGH -- the SEAM, the cap pattern, and the storage-is-truth contract are all read directly from Phase-14/agent-registry source; the only assumptions are internal code organization explicitly delegated to the planner (Assumptions Log A1-A5).
- Pitfalls: HIGH -- sourced from the milestone PITFALLS.md (Pitfalls 9/10/16) and grounded in the verified codebase guards.
- Regex guard specifics: MEDIUM -- the impossibility facts (no sync time-box, linear engine unreachable) are settled (DISCUSSION-LOG); the exact heuristic regex set and N/M caps are tuning judgments (A3, A5), explicitly the planner's discretion per D-08.

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 (stable -- pure-JS built-ins + in-repo patterns; no fast-moving external dependency. The only currency-sensitive item is the regex heuristic tuning, which is internal.)
