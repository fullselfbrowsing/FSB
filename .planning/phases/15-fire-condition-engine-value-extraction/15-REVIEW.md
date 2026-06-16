---
phase: 15-fire-condition-engine-value-extraction
reviewed: 2026-06-16T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - extension/utils/value-extractor.js
  - extension/utils/trigger-manager.js
  - extension/utils/trigger-lifecycle.js
  - extension/background.js
  - tests/value-extractor.test.js
  - tests/trigger-manager.test.js
  - tests/trigger-cap.test.js
  - tests/trigger-lifecycle.test.js
  - package.json
  - tests/lattice-provider-bridge-smoke.test.js
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-06-16
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the Phase 15 fire-condition engine: the two new pure modules
`value-extractor.js` (locale numeric parse + value-source select) and
`trigger-manager.js` (the `evaluate()` engine + inline concurrency cap + ReDoS
guard), the modified SEAM in `trigger-lifecycle.js`, plus the trivial
`background.js` / `package.json` / smoke-test deltas.

The engineering is, on the whole, careful and well-tested (98 passing assertions
across the three new suites + 87 in the lifecycle suite). The load-bearing
guarantees that I tried hardest to break held up:

- **EXTRACT-04 (a bad parse never returns 0 / never fires)** is solid. No garbage
  input I threw at `parseLocaleNumber` leaked `value:0`; a `threshold <= 0`
  against garbage correctly returns `parse_error` and does not fire.
- **The concurrency cap counts persisted `listArmedSnapshots()`** (storage,
  `status==='armed'`), not a heap Set, and **`_withArmLock` genuinely serializes
  the check-then-arm**: under a 5ms async-delayed store read (which sinks a naive
  implementation), exactly 8 arms succeed and exactly 8 land in storage. TOCTOU
  is closed.
- **The atomic `fired` write-back is correct.** `parse_error`/`pattern_error`
  can never reach `status:'fired'` (the fire branch is gated on
  `outcome==='fired'`, which `evaluate()` only returns on a true edge), the
  `noop_terminal` dedupe is preserved, and `setCap`'s async grandfather emission
  swallows store rejections without leaking an unhandled rejection.
- **`evaluate()` is genuinely pure** (no `chrome.storage` / `_getChrome(` in its
  body; the cap's storage access is confined to the cap functions).

The one BLOCKER is the **ReDoS guard**: it is bypassable AND the text-length cap
does not actually bound the bypass, so a caller-supplied regex against untrusted
page text can hang the single SW thread. The four WARNINGs are real but narrow
correctness/robustness issues (degraded-extractor spurious fire, `$`-anchor
truncation false positive, `decimal_separator`-collides-with-group defeat, and
multi-decimal silent truncation).

## Critical Issues

### CR-01: Regex ReDoS guard is bypassable and the text-length cap does NOT bound the bypass (SW thread freeze / DoS)

**File:** `extension/utils/trigger-manager.js:98-152` (EVIL_SHAPES + guardAndCompile + regexMatches)
**Issue:**
The `regex` condition compiles a **caller-supplied** pattern (`new RegExp(pattern)`)
and runs `.test()` against **untrusted page text** — exactly the threat model
called out in the scope. The guard has three layers; all three fail to stop a
catastrophic-backtracking pattern:

1. **The evil-shape heuristic is trivially bypassable.** `EVIL_SHAPES[0] =
   /\([^)]*[+*]\)[+*]/` uses `[^)]*`, which cannot cross a closing paren. Any
   nested-quantifier pattern with a `)` between the inner and outer quantifier
   slips through. Confirmed bypasses that compile cleanly (no `pattern_error`):
   - `((a+))+` and `((a+))+$`  -> not matched by any EVIL_SHAPE
   - `(a{1,}){1,}` -> the heuristic only looks for `[+*]`, not `{n,}` quantifiers
   The module's own comment concedes the heuristic is "provably incomplete," and
   leans on the length caps as "THE hard CPU guarantee."

2. **The length cap is NOT the guarantee it claims to be.** Catastrophic
   backtracking is *exponential in input length*, so a tiny input that is far
   under `TEXT_MAX_LEN_ELEMENT` (10000) is enough. Measured: `((a+))+$` against a
   **34-character** string (`"a".repeat(33) + "X"`) — well under the 10000 cap —
   runs `g.re.test(bounded)` for >8 seconds with no return (effectively never;
   I verified `/((a+))+$/` on escalating lengths and V8 does NOT self-limit it —
   it backtracks unboundedly and hangs the thread). The comment at :85-91 ("the
   length caps ARE the guarantee") is factually wrong for exponential patterns.

3. **Reachable end-to-end.** This path is hit through the public surface:
   `evaluate({condition:{kind:'regex', pattern:'((a+))+$'}}, {text:<page text>})`
   -> `evaluateOne` -> `regexMatches(condition.pattern, raw, TEXT_MAX_LEN_ELEMENT)`
   -> `guardAndCompile` (no rejection) -> `g.re.test(bounded)` (hang). The
   single MV3 service-worker thread is then frozen, blocking every other agent,
   alarm, and message handler in the extension.

Because the SW is single-threaded and the match is synchronous, a frozen
`.test()` is a hard denial of service. The pattern can come from a saved trigger
spec, and the text is adversary-controlled page content.

**Fix:**
A static heuristic over regex syntax cannot be made sound, and a synchronous
`.test()` cannot be time-boxed. The only robust options:

- **Preferred:** run the match on a non-blocking surface that CAN be killed — a
  dedicated Worker / offscreen document with a watchdog timer that terminates the
  match after e.g. 50ms and surfaces `pattern_error` (the module already has a
  `pattern_error` outcome to slot into). This mirrors the offscreen pattern the
  codebase already uses for Lattice.
- **Or:** drop user-supplied free-form `RegExp` entirely and restrict the `regex`
  kind to a backtracking-free engine (e.g. RE2-style / a linear matcher), or to a
  whitelisted non-catastrophic subset, rejecting anything with nested quantifiers
  detected by an actual parse (counting quantifier nesting via paren-depth)
  rather than the current paren-blind regex heuristic.
- **Minimum stop-gap (does NOT fully fix it):** make the evil-shape detector
  paren-aware (walk the pattern tracking group depth and flag a quantifier
  applied to a group that itself contains a quantifier, and flag `{n,}`/`{n,m}`
  unbounded forms), and lower `TEXT_MAX_LEN_ELEMENT` dramatically. This shrinks
  the attack surface but cannot close it, since backtracking blows up on ~30
  chars; do not represent this as a complete fix.

```js
// Illustrative paren-aware nested-quantifier check (stop-gap, not a full fix):
function hasNestedQuantifier(pattern) {
  var depthQuant = [];       // per-group: did this group contain a quantifier?
  for (var i = 0; i < pattern.length; i++) {
    var ch = pattern[i];
    if (ch === '\\') { i++; continue; }            // skip escaped char
    if (ch === '(') { depthQuant.push(false); continue; }
    if (ch === ')') {
      var inner = depthQuant.pop();
      // a quantifier immediately after this group, when the group already had one
      var next = pattern[i + 1];
      if (inner && (next === '+' || next === '*' || next === '{')) return true;
      continue;
    }
    if (ch === '+' || ch === '*' || ch === '{') {
      if (depthQuant.length) depthQuant[depthQuant.length - 1] = true;
    }
  }
  return false;
}
// ...still must be paired with an off-thread, killable match for real safety.
```

## Warnings

### WR-01: Degraded extractor (failed `importScripts`) causes a SPURIOUS fire on `changed`/`equals`-text/`contains`

**File:** `extension/utils/trigger-manager.js:163-227` (evaluateOne)
**Issue:**
`background.js:47` loads the extractor with `try { importScripts('utils/value-extractor.js'); } catch (...) { console.error(...) }` — a load failure is explicitly tolerated and the worker continues. In that state `_getExtractor()` returns `null`, and `evaluateOne` sets `raw = ''` (line 165). The numeric kinds correctly guard this (`if (!extractor) return { error:'parse_error' }` for `threshold`/`percent_change`/`equals`-numeric), but the string-comparison kinds do not:

- `changed`: `raw('') !== String(baseline).trim()` is `true` for any non-empty baseline -> **fires** even though the page value never changed. Verified: `evaluate({condition:{kind:'changed'}, baseline:'old-price-99'}, {text:'old-price-99'})` returns `fired` when the extractor is absent.
- `contains`/`equals`-text degrade to `no_fire` (empty haystack) — wrong but safe.

The fire-once edge limits it to a single spurious fire per trigger, but a false fire still hands the agent an incorrect signal (e.g. "price changed" when it did not).

**Fix:** Make the extractor-absent state fail closed for the string kinds too — guard at the top of `evaluateOne` so a missing extractor is a non-firing error for every kind, not just the numeric ones:

```js
function evaluateOne(condition, snapshot, reportedValue, opts) {
  var extractor = _getExtractor();
  if (!extractor) return { error: 'parse_error' }; // fail closed for ALL kinds
  var raw = extractor.extractValue(reportedValue, condition);
  // ... rest unchanged; the per-kind `if (!extractor)` checks become redundant
}
```

### WR-02: Regex `$`-anchor false positive from text truncation

**File:** `extension/utils/trigger-manager.js:146-152` (regexMatches)
**Issue:**
When candidate text exceeds the cap, `regexMatches` does `text.slice(0, limit)` before `.test()`. A pattern anchored with `$` then matches the *artificial truncation boundary*, not the real end of the page text. Verified: `/X$/` against `'Y'*9999 + 'X' + 'Z'*100` (X sits at index 9999, real string ends in `Z`) returns `{matched:true}`, while `/X$/.test(fullText)` is `false`. A `regex` condition ending in `$` can therefore **spuriously fire** on oversized text whose true ending would not match. Requires text > 10000 (element) / 100000 (page) chars, so it is narrow, but large DOM nodes and whole-page candidates can reach it.

**Fix:** Document this as a known truncation tradeoff and, at minimum, do not let `$` bind the cut point. Options: (a) reject patterns containing an un-escaped end anchor against truncated input and surface `pattern_error`; or (b) only truncate when `text.length <= limit` is false AND the pattern is unanchored, else evaluate against the full text under the off-thread watchdog proposed in CR-01. Whatever the choice, the current silent boundary match is a correctness defect.

### WR-03: `decimal_separator` override is silently defeated when it equals the locale group separator

**File:** `extension/utils/value-extractor.js:144-154` (parseLocaleNumber steps 3-4)
**Issue:**
Step 3 strips the **group** separator with `s.split(groupSep).join('')` *before* step 4 swaps the **decimal** separator. If a caller sets `decimal_separator` to a character that is also the locale's group separator, step 3 removes every instance first and step 4 finds nothing to swap. Verified: `parseLocaleNumber('1,5', { locale:'en-US', decimal_separator:',' })` returns `15`, not `1.5` — the override loses to the group strip. The result is a valid-but-wrong number (the EXTRACT-04 no-zero-leak invariant still holds, so this is not a BLOCKER), but a wrong value can fire or suppress a trigger.

**Fix:** When the override decimal separator collides with the discovered group separator, the override must win — skip or invert the group strip for that character. For example, resolve separators first and short-circuit the collision:

```js
var decimalSep = (opts && opts.decimal_separator) ? opts.decimal_separator : seps.decimal;
var groupSep = seps.group;
// If the caller's decimal override collides with the group sep, the override wins:
if (decimalSep && decimalSep === groupSep) groupSep = '';   // do not strip it as a group sep
if (groupSep) s = s.split(groupSep).join('');
if (decimalSep && decimalSep !== '.') s = s.split(decimalSep).join('.');
```

### WR-04: Malformed multi-decimal input silently truncates instead of erroring

**File:** `extension/utils/value-extractor.js:158-167` (strip + parseFloat)
**Issue:**
After the generic `[^0-9.]` strip, a string with two decimal points reaches `parseFloat`, which stops at the second point. Verified: `parseLocaleNumber('1.2.3', { locale:'en-US' })` returns `1.2` (not `parse_error`). This is consistent with `parseFloat` semantics, but a genuinely malformed/ambiguous scraped value (`"1.2.3"`, `"3.14.15"`) silently yields a partial number that can drive a comparison, rather than surfacing the ambiguity as `parse_error`. Lower severity than WR-03 because such inputs are rare and the result is still a finite number, but it weakens the "ambiguous parse never silently succeeds" intent.

**Fix:** After the strip, reject a residual with more than one `.` before `parseFloat`:

```js
if ((s.match(/\./g) || []).length > 1) {
  return { error: 'parse_error', isPercent: isPercent };
}
var n = parseFloat(s);
```

## Info

### IN-01: `_regexCache` and `_sepCache` grow without bound

**File:** `extension/utils/trigger-manager.js:96` and `extension/utils/value-extractor.js:51`
**Issue:** Both module-singleton `Map`s are keyed by caller-supplied strings (raw regex pattern / locale tag) and are never evicted. In practice the keyspace is bounded by distinct trigger configs (cap 8) and the pattern length is capped at 1000, so live growth is small and resets on SW eviction. Pure memory growth is out of v1 scope; noted only because the keys originate from caller config and accumulate across re-arms over a long-lived worker. Not a correctness issue.
**Fix:** None required for v1. If revisited, bound each cache (LRU or a simple size cap with clear-on-overflow).

### IN-02: `armTrigger` / `setCap` / `loadCapFromStorage` are exported but not yet wired into `background.js`

**File:** `extension/background.js:47-49`, `extension/utils/trigger-manager.js:441-451,491-532`
**Issue:** The phase adds the two `importScripts` lines, but only `FsbTriggerLifecycle.restoreTriggersFromStorage()` is invoked from `background.js` (line ~2525). `loadCapFromStorage()` is never called at SW wake, so after a restart `getCap()` serves the static default `8` rather than the operator-configured value persisted under `fsbTriggerCap` until something calls `setCap` again; and `armTrigger` (the cap-gated arm path) has no live caller. This is consistent with the stated scope (Phase 15 ships the engine; Phase 19 owns the re-arm/tool surface), so it is informational, not a defect — but the cap-hydration gap is worth tracking so a future phase does not assume the persisted cap is live on wake.
**Fix:** When the tool surface lands, call `FsbTriggerManager.loadCapFromStorage()` once during SW bootstrap (alongside `restoreTriggersFromStorage()`) so the configured cap is hydrated before the first `armTrigger`.

---

_Reviewed: 2026-06-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
