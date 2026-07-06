# Phase 15: Fire-Condition Engine & Value Extraction - Context

**Gathered:** 2026-06-16 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a pure, SW-side trigger manager that evaluates every fire condition against a persisted baseline with locale-correct value extraction, edge-fire semantics, and a configurable concurrency cap -- the genuinely-new comparison logic, unit-testable in isolation. This is the layer Phase 14's survivable scaffold left a SEAM for (`trigger-lifecycle.js` `evaluated_noop`).

**In scope (11 requirements):**
- **Condition engine** -- TRIG-02 (`changed`), TRIG-03 (`threshold` `>=`/`<=`/`>`/`<`), TRIG-04 (`equals`/`regex`, compiled once + ReDoS-guarded), TRIG-05 (`contains`, case-insensitive default), TRIG-06 (`percent_change` +/- N%), TRIG-07 (compound AND/OR on one element).
- **Value extraction** -- EXTRACT-01 (locale-aware numeric parse), EXTRACT-02 (raw text for `changed`/`contains`), EXTRACT-03 (`extract: text|number|attribute` override + attr name), EXTRACT-04 (failed parse -> distinct `parse_error`, NEVER fires).
- **Concurrency cap** -- LIFE-04 (1-64, default 8, typed `TRIGGER_CAP_REACHED`).

**Explicitly NOT in this phase:** the watch mechanisms that scrape the live DOM and report a value (live-observe MutationObserver = Phase 16; refresh-poll = Phase 17); shared tool registry + dispatcher wiring of the 4 MCP tools (Phase 18); MCP blocking/detached return + structured fire envelope (Phase 19, also finalizes detached-TTL / blocking-ceiling numbers). Phase 15's `evaluate()` is pure: the element value is an INPUT reported by the later watch layer, not something this phase scrapes. INV-01 (MCP schemas byte-identical) and INV-04 (`agent-loop.js` byte-frozen) hold.
</domain>

<decisions>
## Implementation Decisions

### Module Decomposition

- **D-01:** Phase 15 creates **exactly two** new SW-side modules, both following the dual-export IIFE + lazy `_getChrome()` pattern:
  - `extension/utils/trigger-manager.js` -- arm / evaluate / fire + compound AND/OR + the concurrency cap, mirroring `agent-registry.js`.
  - `extension/utils/value-extractor.js` -- locale numeric parse + text/number/attribute extraction (kept separate so its large DE/FR/NBSP/parens/% test matrix doesn't bloat the manager).
  The concurrency cap lives **inline in `trigger-manager.js`** (copied constants / `_clampCap` / `getCap` / `setCap` / typed-reject), NOT a separate cap module -- matching how `agent-registry.js` keeps its cap inline in the registry. (Research: `.planning/research/ARCHITECTURE.md:48,78,99`, `STACK.md:52,101`, `SUMMARY.md:97`.)

### The evaluate() Contract

- **D-02:** `trigger-manager` exposes a **pure, DOM-free** `evaluate(snapshot, reportedValue, now?)`. It takes the persisted snapshot (carrying `condition`, `baseline`, `last_value`, and the edge-state flag) plus the **raw value already read by the watch layer** (the raw string for text/contains, or the raw element value + the `extract` descriptor) and returns a typed outcome:
  `{ outcome: 'fired' | 'no_fire' | 'parse_error' | 'pattern_error', matched_condition?, old_value, new_value, next_state }`.
  It does **NOT** resolve selectors, scrape a live DOM, or touch `chrome.storage` -- the Phase-14 SEAM (`trigger-lifecycle.js` `evaluated_noop`, the `return { ok:true, action:'evaluated_noop' }` site) owns the storage read + atomic `fired` write-back around it. `evaluate()` calls `value-extractor` **internally** per condition kind, so the `parse_error` path (EXTRACT-04) lives in exactly one place and is unit-testable with no browser.

### Value Extraction & Locale Parsing

- **D-03:** Numeric extraction is **net-new** (confirmed: no `Intl.NumberFormat`/`formatToParts` anywhere in `extension/`). `value-extractor.js` uses the **`Intl.NumberFormat(locale).formatToParts(11000.1)` separator-discovery recipe** (research-confirmed sound): discover the locale's `group` + `decimal` separators, then normalize in this order -- (1) strip parentheses-negative + record sign, (2) detect explicit sign + `%` (record `isPercent`), (3) **literal `split/join`** to remove the group separator (handles `,` `.` NBSP U+00A0 / narrow-NBSP U+202F / Indian multi-group), (4) replace the decimal separator with `.`, (5) strip everything non-`[0-9.]` (kills currency symbols incl. letter currencies CHF/kr/zl and crypto glyphs that aren't ISO-4217), (6) `parseFloat`. **`NaN` -> distinct `parse_error`** (never `0`, never a fire). Memoize the discovered separators **per locale in a `Map`** (constructing `NumberFormat` is expensive; this runs per mutation). Use literal `split/join`, **never `new RegExp(separator)`** (separators like `.` are regex metacharacters -- an escaping footgun). **`%` kept raw** (record `isPercent`; do NOT auto-divide by 100 -- the comparison layer decides). **Zero npm dependency** (currency.js / numeral / dinero forbidden).
- **D-04:** An explicit per-trigger **`locale`** (and optional **`decimal_separator`**) override is **MANDATORY in the condition schema NOW** (not deferred to Phase 19). This is forced by math, not preference: bare inputs like `1.234` (1234 DE vs 1.234 US) and `1,5` are **provably unresolvable from the string alone**, and for a threshold/percent feature a silent 1000x misparse is unacceptable. `decimal_separator` wins over `locale`. Default when neither is supplied: page `lang` / `navigator.language` as a **documented best-effort**, with the override always available to force determinism. (Research: `PITFALLS.md:192-209` Pitfall 9; `STACK.md:146-160`.)
- **D-05:** Extraction source per condition (EXTRACT-01/02/03): **raw trimmed text** for `changed` / `contains`; **locale-parsed number** for `threshold` / numeric `equals` / `percent_change`. The `extract: text | number | attribute` (+ attribute name) override reads a specific source (e.g. `data-price`, `aria-valuenow`). **Both sides are parsed to `Number` before ANY numeric compare -- never a string-vs-number compare.**

### Condition Engine & Edge Semantics

- **D-06:** `evaluate()` implements all six condition kinds: `changed` (any delta from arm-time baseline, raw text), `threshold` (`>=`/`<=`/`>`/`<` numeric), `equals` / `regex`, `contains` (case-insensitive default), `percent_change` (+/- N% from baseline). **Compound conditions** (TRIG-07): multiple conditions on one element combine with an **explicit combinator** -- recommended schema `{ combinator: 'AND' | 'OR', conditions: [...] }` (exact shape is the planner's to finalize).
- **D-07:** **"Exactly one fire" is guaranteed by edge-trigger semantics computed in `evaluate()`** (fire only on the `was_satisfied: false -> true` transition, reading the persisted `last_value` + an edge-state flag from the snapshot) **plus fire-once-by-default** (snapshot transitions to terminal `status:'fired'`). The **atomic disarm + dedupe** live in the Phase-14 SEAM's storage write-back, guarded by the existing idempotent terminal check (`trigger-lifecycle.js`: `status === 'fired' || status === 'stopped' -> noop_terminal`). **Edge state MUST be persisted in the snapshot** (not the SW heap) so an oscillating value does not re-fire after SW eviction. Hysteresis applied at the threshold boundary. (Research: `ROADMAP.md:52`, `PITFALLS.md:213-229` Pitfall 10 + Pitfall 16.)

### Regex Safety (TRIG-04)

- **D-08:** The regex guard is **net-new** (no in-repo ReDoS precedent -- only unguarded `new RegExp` usages exist). Two hard facts settle the approach: (a) there is **NO sound synchronous way to time-box `RegExp.prototype.test()`** in an MV3 SW (a sync regex blocks the single thread; `setTimeout`/`AbortController` can't fire during the freeze), and (b) **V8's linear `l`-flag engine is unreachable** from extension JS (it requires the `--enable-experimental-regexp-engine` startup flag; no runtime API; an extension can't set V8 flags). **Lock:** at **compile time** -- pattern-length cap (~1000 chars), reject known evil shapes via a small static heuristic (nested quantifier `(a+)+` / `(a*)*`, overlapping alternation under a quantifier `(a|a)*`, adjacent quantifiers `.*.*`), then **compile-once-and-cache** the `RegExp`; at **match time** -- cap the candidate text length before `.test()` (element text ~10k, whole-page ~100k). A rejected or syntactically-invalid pattern yields a **distinct `pattern_error`** outcome -- NEVER a silent pass, NEVER a NaN fire. **The length caps are the load-bearing CPU guarantee; the evil-shape heuristic is defense-in-depth** (static ReDoS detection is provably incomplete -- that's accepted). (Research: `FEATURES.md:33`, `PITFALLS.md:408`, `STACK.md:101`.)

### Concurrency Cap (LIFE-04)

- **D-09:** The cap mirrors `agent-registry.js` **exactly**: `FSB_TRIGGER_CAP_STORAGE_KEY = 'fsbTriggerCap'` in **`chrome.storage.local`** (NOT session), `DEFAULT = 8`, `MIN = 1`, `MAX = 64`, `_clampCap`, typed reject `{ error:'TRIGGER_CAP_REACHED', code:'TRIGGER_CAP_REACHED', cap, active }`, grandfather-active-on-lower, and clamp on the read path (defense-in-depth vs a poisoned cache). **The active count is the number of `status:'armed'` snapshots from `trigger-store`** via the existing `listArmedSnapshots()` (`trigger-store.js:168-173`) -- **NOT** an in-heap `Set`. This diverges deliberately from `agent-registry.js` (which counts `this._agents.size`): triggers are storage-first and survive SW eviction; an in-heap counter resets to `0` on eviction and would silently stop enforcing the cap across the very eviction the milestone is built around. (Research: `ARCHITECTURE.md:244`.)

### Claude's Discretion

- Exact field name for the persisted edge state (`was_satisfied` vs a dedupe key on the snapshot) -- planner's call, as long as it is persisted in the snapshot, never SW heap.
- The exact compound-condition schema shape (D-06) -- recommend `{ combinator, conditions[] }`; planner finalizes.
- Whether `value-extractor.js` exposes a single `parseLocaleNumber` + `extractValue` or finer-grained helpers -- planner's call.
- Exact N/M cap values for the regex guard (pattern length ~1000, text length ~10k element / ~100k page) -- tune to the longest legitimately-expected pattern.
- Unit-test harness shape -- mirror the existing Node-mock storage tests for the store/lifecycle modules (lazy `_getChrome()` enables browser-free tests).

### Folded Todos

None -- no pending todos matched this phase.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/ROADMAP.md` lines 41-51 -- Phase 15 goal + the 5 success criteria (condition kinds, locale parse, extract override, parse_error/edge-fire/dedupe, cap).
- `.planning/phases/14-trigger-survivability-foundation/14-CONTEXT.md` -- LOCKED prior decisions: snapshot shape (D-01: flat scalars incl. `baseline`/`last_value`), the Phase-15-deferral (D-06), and the SEAM contract Phase 15 plugs into.
- `.planning/research/ARCHITECTURE.md` -- file map naming `trigger-manager.js` (NEW) + `value-extractor.js` (NEW); the `evaluate(last, current, condition)` signature (`:207,303,382`); the cap shape `fsbTriggerCap` / typed `TRIGGER_CAP_REACHED` / grandfather (`:244`).
- `.planning/research/STACK.md` -- "FSB has NO existing currency helper" (`:101`); the `formatToParts` locale-parse recipe + `%`-kept-raw (`:146-160`); the no-dependency decision.
- `.planning/research/PITFALLS.md` -- Pitfall 9 locale numeric parse (`:192-209`); Pitfall 10 edge-trigger / fire-once / hysteresis (`:213-229`); Pitfall 16 duplicate fires; the regex/ReDoS guard direction (`:408`).
- `.planning/research/FEATURES.md` -- compile-once + guard catastrophic backtracking (`:33`).
- `.planning/research/SUMMARY.md` -- convergent build order; Phase-2 deliverables = `trigger-manager.js` + `value-extractor.js` (`:97`); no-dependency decision (`:13`).
- `extension/utils/trigger-lifecycle.js` -- the **Phase 15 SEAM**: the `evaluated_noop` return site (replace with `manager.evaluate(...)` + atomic `fired` write-back); the idempotent `noop_terminal` guard (`status==='fired'/'stopped'`); `armTrigger(snapshot)` / `clearTrigger(triggerId)` (the clean arm/clear seam, ~`:165-224`).
- `extension/utils/trigger-store.js` -- snapshot read/write surface + `listArmedSnapshots()` (`:168-173`, the cap's active-count source).
- `extension/utils/agent-registry.js` -- the LIFE-04 cap clone target: constants `fsbAgentCap`/`DEFAULT=8`/`MIN=1`/`MAX=64`/`_clampCap` (`:52-78`); typed `AGENT_CAP_REACHED` reject (`:302-308`); `getCap`/`setCap` + grandfather-on-lower (`:801-831`); lazy `_getChrome` idiom (`:87-129`).
- `extension/manifest.json` lines 9-19 -- `alarms` / `storage` / `unlimitedStorage` / `tabs` / `scripting` already granted (no manifest change in Phase 15).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/utils/agent-registry.js` -- the concurrency-cap + storage-area-split + typed-reject + grandfather precedent (the LIFE-04 clone target).
- `extension/utils/trigger-lifecycle.js` -- the Phase 15 SEAM (`evaluated_noop`) where evaluate-and-fire plugs in; `armTrigger`/`clearTrigger`; the idempotent `noop_terminal` guard that already protects against duplicate fire.
- `extension/utils/trigger-store.js` -- snapshot read/write + `listArmedSnapshots()` (the survivable active-count source).
- **NET-NEW (no precedent):** `value-extractor.js` (no `Intl.NumberFormat`/`formatToParts` exists anywhere in `extension/`); `trigger-manager.js`; the regex ReDoS guard.

### Established Patterns
- **Dual-export IIFE + lazy `_getChrome()`** -- both new modules must follow it (enables Node-mock unit tests without a browser; this is how the phase stays "unit-testable in isolation").
- **Storage-is-truth, pure evaluate:** `evaluate()` is a pure function; the `trigger-lifecycle.js` SEAM owns the `chrome.storage.session` re-read + atomic `fired` write-back around it (Phase 14's D-02/D-09 contract).
- **Cap pattern:** `chrome.storage.local` key + `_clampCap` + typed reject + grandfather-on-lower (agent-registry).
- **Idempotent terminal guard:** no-op on an already-`fired`/`stopped` snapshot (the dedupe backstop already in the lifecycle).

### Integration Points
- `trigger-lifecycle.js` `evaluated_noop` SEAM -- the one-line swap to `manager.evaluate(...)` + atomic `fired` write-back (the SEAM region is comment-marked).
- `trigger-store.js` `listArmedSnapshots()` -- the cap's active-count source.
- `extension/background.js` `importScripts` region -- load `value-extractor.js` + `trigger-manager.js` beside `trigger-store.js`/`trigger-lifecycle.js` (so the SEAM can call the manager in the SW).
- `extension/ai/agent-loop.js` -- **do not touch** (INV-04). No MCP tool-schema changes (INV-01) -- tool registration is Phase 18.
</code_context>

<specifics>
## Specific Ideas

- The `locale` / `decimal_separator` override is **mandatory in the schema now** (D-04) -- forced by the math of bare-input ambiguity; a silent 1000x misparse on a EUR/INR page is the failure to prevent.
- **`%` is kept raw** (record an `isPercent` flag); never auto-divide by 100 -- the comparison layer decides what the percent means.
- **Regex length caps are the load-bearing CPU guarantee**; the evil-shape heuristic is best-effort defense-in-depth (zero-dep static ReDoS detection is provably incomplete, and that is accepted).
- **Active-count comes from `listArmedSnapshots()` (`status:'armed'`), not an in-heap Set** -- so the cap keeps enforcing across SW eviction (the deliberate divergence from `agent-registry.js`).
- Both sides of every numeric compare are parsed to `Number` first; a failed parse is `parse_error` and never fires (no NaN-as-0).
</specifics>

<deferred>
## Deferred Ideas

- **Live-observe (MutationObserver) watch mechanism** -- Phase 16 (the layer that scrapes the live DOM and reports the value `evaluate()` consumes).
- **Refresh-poll (tab-owning background reload) watch** -- Phase 17.
- **Shared tool registry + dispatcher wiring (the 4 MCP tools)** -- Phase 18.
- **MCP blocking/detached return + structured fire envelope** -- Phase 19; also finalizes the concrete detached-TTL / blocking-ceiling numbers (and may revisit the locale-override default).
- **Selector resolution + live-DOM value reading** -- not Phase 15; the value is a reported INPUT to the pure `evaluate()` (the watch layer in Phases 16/17 owns scraping).

### Reviewed Todos (not folded)
None -- no pending todos matched this phase.
</deferred>
