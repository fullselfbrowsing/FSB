---
phase: 15-fire-condition-engine-value-extraction
plan: 01
subsystem: api
tags: [intl-numberformat, locale-parsing, value-extraction, chrome-mv3, zero-dependency, tdd]

# Dependency graph
requires:
  - phase: 14-trigger-survivability-foundation
    provides: the dual-export IIFE module shell + Node-mock test convention (trigger-store.js) and the npm test serial chain this plan extends
provides:
  - "extension/utils/value-extractor.js: pure DOM-free parseLocaleNumber(raw, opts) + extractValue(reportedValue, descriptor) (FsbValueExtractor)"
  - "Locale-aware numeric parse via Intl.NumberFormat.formatToParts separator discovery, memoized per locale, with a distinct parse_error sentinel that never fires (EXTRACT-01/04)"
  - "extract: text | number | attribute source selection over the reported { text, attributes? } payload (EXTRACT-03)"
  - "decimal_separator/locale override precedence proof (D-04) locked by the test matrix"
affects: [15-02-trigger-manager, 15-03-trigger-lifecycle-seam, 16-live-observe-watch, 17-refresh-poll-watch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure dual-export IIFE (no _getChrome): the trigger-store.js shell minus the chrome resolver, for a browser-free leaf module"
    - "Intl.NumberFormat(locale).formatToParts(11000.1) separator discovery memoized in a per-locale Map"
    - "Literal String.split(sep).join(...) separator removal (never a separator-built RegExp)"
    - "NaN -> distinct parse_error sentinel object, never 0, never a falsy-coalesce"

key-files:
  created:
    - extension/utils/value-extractor.js
    - tests/value-extractor.test.js
  modified:
    - package.json

key-decisions:
  - "value-extractor.js exposes exactly two public functions (parseLocaleNumber + extractValue), not finer-grained helpers (D-01 discretion resolved toward the smallest surface Plan 02 consumes)"
  - "extractValue reportedValue input shape is { text: string, attributes?: { [name]: string } } -- the consumer contract the Phase 16/17 watch layer must conform to (Plan 03 documents it)"
  - "Test NBSP/crypto inputs are built via String.fromCodePoint(0xNNNN) so the test source stays strictly ASCII while still exercising U+00A0 / U+202F / U+20BF at runtime"

patterns-established:
  - "Pure-leaf dual-export IIFE: omit the lazy browser-API resolver entirely when a module touches no chrome/DOM, keep only the global + module.exports dual assignment so the Node test can fresh-require it"
  - "parse_error never coerces: a non-finite parseFloat returns { error: 'parse_error', isPercent } and the caller maps it to a non-firing outcome"

requirements-completed: [EXTRACT-01, EXTRACT-02, EXTRACT-03, EXTRACT-04]

# Metrics
duration: 7min
completed: 2026-06-16
---

# Phase 15 Plan 01: Value Extractor (Locale Parse + Source Selection) Summary

**Pure, zero-dependency `value-extractor.js`: locale-aware numeric parsing via `Intl.NumberFormat.formatToParts` separator discovery (US/DE/FR-NBSP/IN-multigroup/parens-neg/percent/CHF-apostrophe/crypto) with a distinct `parse_error` that never fires, plus `text|number|attribute` source selection — all 22 assertions green.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-16T06:17:24Z
- **Completed:** 2026-06-16T06:24:52Z
- **Tasks:** 2 (both TDD-typed: RED then GREEN)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `parseLocaleNumber(raw, opts)` implements the verified `Intl.NumberFormat(locale).formatToParts(11000.1)` separator-discovery recipe (D-03), memoized per locale in a `Map`, normalizing in order: parentheses-negative -> percent/sign detection -> literal `split/join` group strip -> decimal swap to `.` -> generic non-`[0-9.]` strip -> `parseFloat`. A non-finite result returns `{ error: 'parse_error', isPercent }` — **never 0, never NaN, never a fire** (EXTRACT-04).
- The full locale matrix passes (EXTRACT-01): `$1,234.56` (en-US), `1.234,56` (de-DE), NBSP-grouped `1[U+00A0]234,56` and narrow-NBSP `1[U+202F]234,56` (fr-FR), Indian multi-group `12,34,567.89` (en-IN), accounting `($1,234.56)` -> `-1234.56`, German percent `12,5[U+00A0]%` -> `12.5` with `isPercent:true` (NOT `0.125`), CHF apostrophe group, and the `U+20BF` bitcoin-sign crypto glyph.
- The three D-04 override cases prove the override is mathematically necessary: the SAME string `1.234` parses to `1234` under de-DE (group `.`) but `1.234` under en-US (decimal `.`), and an explicit `decimal_separator: '.'` forces `1.234` regardless of locale (override wins over locale).
- `extractValue(reportedValue, descriptor)` selects `text | number | attribute` (EXTRACT-03 / D-05): `attribute` reads `reportedValue.attributes[name]` trimmed (or `''` if absent, never a throw); `text` and `number` return `reportedValue.text` trimmed (numeric parse deferred to the compare site).
- Wired into the npm `test` chain after the Phase-14 tests with no reorder; Phase-14 tests still green (no regression).

## Task Commits

Each task was committed atomically (TDD: test -> feat):

1. **Task 1: value-extractor test (locale matrix + extract + parse_error), RED + package.json wiring** — `1b64e4de` (test)
2. **Task 2: implement value-extractor.js (locale parse recipe + extractValue), GREEN** — `a640f746` (feat)

**Plan metadata:** _(this docs commit)_

_TDD note: REFACTOR was not needed — the implementation directly transcribes the verified recipe and passed all assertions on first GREEN. The only post-GREEN edit was rewording in-code comments so the documentation prose did not contain the verbatim anti-pattern tokens (`new RegExp`, `|| 0`, `_getChrome`, `chrome`) the acceptance greps assert as zero; the executable code was unchanged._

## Files Created/Modified

- `extension/utils/value-extractor.js` (created) — Pure dual-export IIFE (`FsbValueExtractor` + `module.exports`); `parseLocaleNumber` + `extractValue`; `_sepCache` memoization; omits the lazy browser-API resolver because it is pure `Intl`/string math.
- `tests/value-extractor.test.js` (created) — 22-assertion Node script (built-in `assert` + local `check()` counter + `process.exit(failed>0?1:0)`); fresh-require pattern (no chrome mock); NBSP/crypto inputs via `String.fromCodePoint`; ASCII-clean source.
- `package.json` (modified) — appended ` && node tests/value-extractor.test.js` to `scripts.test` after `trigger-lifecycle.test.js` (no existing entry reordered).

## Consumer Contract (for Plan 02 / Plan 03)

`extractValue(reportedValue, descriptor)` input shape implemented:

- `reportedValue`: `{ text?: string, attributes?: { [name: string]: string } }` — the payload the (Phase 16/17) watch layer reports. `extract: 'text'` and `'number'` read `reportedValue.text`; `extract: 'attribute'` reads `reportedValue.attributes[descriptor.attribute]`.
- `descriptor`: `{ extract?: 'text' | 'number' | 'attribute', attribute?: string }` (default mode `'text'`; unknown modes fall back to `'text'`).

`parseLocaleNumber(raw, opts)` contract:

- `opts`: `{ locale?: string (default 'en-US'), decimal_separator?: string }` — `decimal_separator` wins over the locale-discovered decimal (D-04); the group separator always comes from the locale.
- Returns `{ value: number, isPercent: boolean }` on success, or `{ error: 'parse_error', isPercent: boolean }` on failure. `%` is kept raw (the value is the unscaled number, e.g. `12.5` not `0.125`); the comparison layer decides what the percent means.

Plan 03 should document this `{ text, attributes? }` shape as the report contract the Phase 16/17 watch layer must conform to.

## Decisions Made

- Exposed exactly `parseLocaleNumber` + `extractValue` (the D-01 "single vs finer-grained helpers" discretion), keeping the public surface to what Plan 02's `trigger-manager` consumes.
- Built non-ASCII test inputs with `String.fromCodePoint(0xNNNN)` rather than `\uNNNN` string literals, because the file-write path folds `\uNNNN` escapes into literal multibyte characters; the numeric form guarantees an ASCII-clean source while still constructing the exact U+00A0 / U+202F / U+20BF code points at runtime (the `\uNNNN` escape forms remain referenced in the assertion messages and comments for readability).

## Deviations from Plan

None — plan executed exactly as written. No deviation rules (1-4) were triggered: no bugs, no missing critical functionality, no blocking issues, no architectural changes. Zero packages installed (zero-dep mandate D-03 / T-15-SC honored).

## Issues Encountered

- The Write tool repeatedly rendered typed `\uNNNN` escape sequences (in both string literals and comments) as literal multibyte characters, which failed the ASCII-clean acceptance guard (`LC_ALL=C grep -P '[\x80-\xFF]'`). Resolved by (a) constructing the runtime characters via `String.fromCodePoint(0xNNNN)` and (b) stripping residual non-ASCII bytes from comments with an in-place `perl` pass. Confirmed CLEAN afterward; the runtime characters and the required `u202F` token are both present.
- Several Task-2 acceptance greps (`new RegExp`==0, `|| 0`==0, `_getChrome`==0, `chrome`==0) initially tripped on the module's own LANDMINE documentation comments, which named the forbidden tokens verbatim. Resolved by rewording the comments to describe the patterns without the literal tokens; the executable code was already correct and was not changed.

## Known Stubs

None — `value-extractor.js` is fully implemented and exercised by 22 passing assertions. No placeholder values, no empty-data paths, no TODO/FIXME markers. (The Phase 16/17 watch layer that produces the `reportedValue` payload is out of scope by design — `evaluate()` and the extractor consume a reported INPUT, per CONTEXT D-02.)

## Self-Check: PASSED

- `extension/utils/value-extractor.js` — FOUND
- `tests/value-extractor.test.js` — FOUND
- Commit `1b64e4de` (test RED) — FOUND
- Commit `a640f746` (feat GREEN) — FOUND
- `node tests/value-extractor.test.js` exits 0 (22/22 pass)
- Acceptance guards: `new RegExp`=0, `|| 0`=0, `_getChrome`=0, source ASCII-CLEAN, `FsbValueExtractor` present, `_sepCache` present

## Next Phase Readiness

- The leaf extractor Plan 02's `trigger-manager.evaluate()` consumes for every numeric condition is built, tested, and on the global as `FsbValueExtractor` (plus `module.exports` for the Node tests).
- Plan 02 (`trigger-manager.js`) can now import the extractor for the six condition kinds, the compound fold, and the parse_error short-circuit. Plan 03 wires both into the `background.js` importScripts region (value-extractor before trigger-store before trigger-manager before trigger-lifecycle) and the `trigger-lifecycle.js` SEAM.
- No blockers.

---
*Phase: 15-fire-condition-engine-value-extraction*
*Completed: 2026-06-16*
