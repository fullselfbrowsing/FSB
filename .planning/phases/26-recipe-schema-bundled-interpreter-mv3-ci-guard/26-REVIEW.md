---
phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard
reviewed: 2026-06-20T05:11:27Z
depth: deep
advisory: true
files_reviewed: 7
files_reviewed_list:
  - extension/utils/capability-recipe-schema.js
  - extension/utils/capability-interpreter.js
  - extension/utils/capability-auth-strategies.js
  - scripts/verify-recipe-path-guard.mjs
  - extension/background.js
  - mcp/src/errors.ts
  - package.json
findings:
  blocker: 0
  high: 1
  medium: 3
  low: 3
  nit: 2
  total: 9
status: issues_found
---

# Phase 26: Code Review Report (ADVISORY)

**Reviewed:** 2026-06-20T05:11:27Z
**Depth:** deep (cross-file + live behavioral probes)
**Files Reviewed:** 7 FSB-authored production files (3 vendored minified libs excluded per scope)
**Status:** issues_found (advisory -- does not block the phase)

## Summary

The Wall-1 data spine is, on the whole, well-constructed and the security intent is sound. I verified the load-bearing claims behaviorally rather than by inspection:

- **WALL-1 integrity holds.** None of the three capability modules contains `eval` / `new Function` / `import(` or any run-string-as-code construct. `additionalProperties:false` is enforced at every *structural* object level (top, `request`, `csrf`); the forbidden-name pre-scan plus the closed schema reject all six script-like field names and unknown top-level fields. No recipe field is ever executed in Phase 26.
- **The no-network boundary holds.** `capability-interpreter.js` contains no `fetch`, no `chrome.scripting.executeScript`, no XHR. The interpreter stops at emitting a bound spec. (Confirmed by reading + by the Plan 02 test's 0-call recorders.)
- **INV-01 holds.** `mcp/src/errors.ts` changed ONLY the verbatim-passthrough regex (added `RECIPE_.+` to the existing alternation) plus a comment. No MCP tool schema touched.
- **The CI guard's regexes are ReDoS-free and avoid the named false-positives** (`retrieval`, `evaluate`, `important`, `import.meta`, static `import`), and it fails closed when an allowlisted file is unreadable.
- **The typed-error RETURN contract is byte-identical** across the schema, interpreter, and auth-strategy modules.

However, the adversarial probes surfaced **two genuine contract violations** where the "never throws" promise is broken on untrusted/edge input (HIGH + MEDIUM), plus several **latent gates that are too weak for what Phase 27 will consume** (`origin` accepts `javascript:` URIs; `endpoint` accepts protocol-relative `//evil.com` and `..` traversal; header/body values pass through with raw CRLF). None of these execute code in Phase 26, so none is a BLOCKER for *this* phase -- but they are seeds that become exploitable the moment Phase 27 turns the spec into a real request, and the schema is the only place they can be gated cheaply.

The phase-spine claims the prompt asked me to scrutinize all check out. The findings below are the residue.

## High

### HI-01: `interpretRecipe` breaks its "never throws" contract on an untrusted `recipe.params` sub-schema

**File:** `extension/utils/capability-interpreter.js:222-227`
**Issue:** `recipe.params` is, by design (D-06 comment in the schema), an *intentionally-open* JSON-Schema sub-document accepted verbatim from the untrusted recipe -- `validateRecipe` only asserts `params` is `{type:'object'}` and lets any shape through. The interpreter then feeds that attacker-controlled object straight into the cfworker `Validator` constructor:

```js
var paramValidator = getFSBRecipeValidator(recipe.params, '2020-12');
```

`new CfworkerJsonSchema.Validator(...)` **throws** (uncaught) when the supplied schema has an unresolvable `$ref`. A *schema-valid* recipe whose `params` is `{ "$ref": "https://evil.example/x.json" }` or `{ type:"object", properties:{ id:{ "$ref":"#/does/not/exist" } } }` passes `validateRecipe` and then crashes the public API:

```
Unresolved $ref "#/does/not/exist" ...   <-- thrown out of interpretRecipe, uncaught
```

The module header (D-15) explicitly states "The public API never throws." This is a reachable violation triggered by hostile recipe data -- exactly the threat model the milestone defends against. In Phase 26 it merely crashes the caller; once recipes are catalog-sourced it is a denial-of-service / unhandled-rejection vector.

**Fix:** Wrap both the param-validator construction *and* the `.validate()` call in try/catch and convert to the typed return (the schema module gets this right by only ever building a validator over the FIXED `RECIPE_SCHEMA`):

```js
if (recipe.params && typeof recipe.params === 'object') {
  var paramValidator, paramResult;
  try {
    paramValidator = getFSBRecipeValidator(recipe.params, '2020-12');
    if (!paramValidator) {
      return createRecipeError('RECIPE_SCHEMA_INVALID', { error: 'validator unavailable' });
    }
    paramResult = paramValidator.validate(safeArgs);
  } catch (e) {
    return createRecipeError('RECIPE_SCHEMA_INVALID', {
      reason: 'invoke-params-schema', error: e && e.message ? e.message : String(e)
    });
  }
  if (!paramResult || paramResult.valid !== true) {
    return createRecipeError('RECIPE_SCHEMA_INVALID', {
      reason: 'invoke-params',
      errors: (paramResult && paramResult.errors) ? paramResult.errors : []
    });
  }
}
```
Consider also tightening the schema so `params` cannot carry `$ref`/`$dynamicRef` at all (a recipe should not be able to pull a remote schema), but the try/catch is the minimum fix.

## Medium

### ME-01: `validateRecipe(undefined)` throws (no-throw contract violation on a falsy edge input)

**File:** `extension/utils/capability-recipe-schema.js:213-227`
**Issue:** `findForbiddenField(undefined)` returns `null` (guarded), then control reaches `validator.validate(undefined)`, and cfworker throws `Instances of "undefined" type are not supported.` -- propagating out of `validateRecipe`, which D-15 says "RETURNS (never throws)". `null`, `42`, `"str"`, `[]`, `{}` are all handled and return a typed `RECIPE_SCHEMA_INVALID`; only the literal `undefined` slips through. The test suite passes `null`-shaped and object-shaped recipes but never `undefined`, so this is uncovered.

**Fix:** Normalize non-object input up front, before the validator is touched:

```js
function validateRecipe(recipe) {
  if (recipe === null || recipe === undefined || typeof recipe !== 'object' || Array.isArray(recipe)) {
    return createRecipeError('RECIPE_SCHEMA_INVALID', { error: 'recipe is not an object' });
  }
  // ... existing body
}
```

### ME-02: `origin` accepts `javascript:` (and other non-origin) URIs -- the schema is the only origin gate before Phase 27

**File:** `extension/utils/capability-recipe-schema.js:87`
**Issue:** `origin: { type: 'string', format: 'uri' }`. The comment calls this "Full origin (e.g. https://example.com)", but `format:'uri'` does not constrain the scheme or enforce origin-ness. Behavioral check:

```
origin "javascript:alert(1)"          -> ACCEPT
origin "ftp://x"                       -> ACCEPT
origin "https://example.com/path?x=1" -> ACCEPT   (a URL with a path, not a bare origin)
```

Origin-pin enforcement is explicitly Phase 27, but `origin` flows verbatim into the bound spec (`spec.origin = recipe.origin`) and will become the trust anchor for the authenticated request and the same-origin-cookie / CSRF logic. A `javascript:` or non-https origin reaching that layer is a credential-leak / SSRF seed. The schema is the cheapest and most reliable place to constrain it.

**Fix:** Replace `format:'uri'` with a scheme-and-shape pattern (https/http origin, no path/query/fragment):

```js
origin: {
  type: 'string',
  pattern: '^https?://[^/?#\\s]+$'   // scheme + authority only; no path/query/fragment
},
```
(If non-https origins must be forbidden outright, drop the `?` so only `https://` matches.)

### ME-03: `endpoint` pattern `^/` allows protocol-relative `//host` and `..` traversal that defeats Phase 27 origin-pin

**File:** `extension/utils/capability-recipe-schema.js:90`
**Issue:** `endpoint: { type: 'string', pattern: '^/' }`. Behavioral check:

```
endpoint "//evil.com/x"  -> ACCEPT   (protocol-relative; new URL("//evil.com/x", origin) -> different origin)
endpoint "/a/../../b"    -> ACCEPT   (path traversal)
```

When Phase 27 builds the request URL as `new URL(endpoint, origin)`, a protocol-relative endpoint silently re-targets a *different host* while still riding the recipe's origin trust -- a classic origin-pin bypass. `..` segments similarly let a recipe escape its declared path prefix. The interpreter's `encodeURIComponent` only escapes the *substituted `{var}` values*; the literal `//` and `..` in the template author's string are untouched.

**Fix:** Tighten the pattern to a single leading slash that is not followed by another slash, and reject `..` segments:

```js
endpoint: {
  type: 'string',
  // one leading slash, not protocol-relative, no '..' path segment
  pattern: '^/(?!/)(?:[^\\s]*)$',
  not: { pattern: '(^|/)\\.\\.(/|$)' }
},
```
Even with this, Phase 27 must still re-assert `new URL(...).origin === recipe.origin` -- but the schema should not hand it an obviously hostile template.

## Low

### LO-01: errors.ts comment claims RECIPE_* results carry "no `error` string" -- but they do

**File:** `mcp/src/errors.ts:124-126`
**Issue:** The new comment states the RECIPE_* family is "returned by the SW-side recipe schema/interpreter with `code`+`errorCode` set but no `error` string". In fact `createRecipeError` in all three modules sets `error: code` (e.g. `error: 'RECIPE_SCHEMA_INVALID'`). The behavior is still correct -- `resolveErrorKey` matches on `errorCode`, and because `errorMsg === errorKey`, `appendRawError` happens to suppress the duplicate -- but the stated rationale is factually wrong and will mislead the next maintainer reasoning about the passthrough.

**Fix:** Correct the comment to "with `code`, `errorCode`, and `error` all set to the same RECIPE_* string", or (cleaner) stop setting `error: code` in `createRecipeError` so the wire shape matches the comment and the raw-error line is unambiguously suppressed by the `!errorMsg` guard rather than by string-equality coincidence.

### LO-02: CI guard misses indirect/computed eval and bare `Function(...)` (defense-in-depth gap)

**File:** `scripts/verify-recipe-path-guard.mjs:99-103`
**Issue:** The word-boundary regexes are correctly tuned against false-positives, but they are a substring backstop, not a parser, and several real dynamic-code forms slip past:

```
(0, eval)(code)              -> NOT flagged (indirect eval)
globalThis["ev"+"al"](code) -> NOT flagged (computed)
Function("a","return a")     -> NOT flagged (bare Function; only `new Function` is caught)
setTimeout("doEvil()", 0)    -> NOT flagged (string-arg timer)
```

The recipe-path files are FSB-authored and reviewed, so this is a regression guard rather than a sandbox, and the bar is "would an accidental reintroduction be caught" -- the common `eval(` / `new Function(` forms are. Still, `Function(...)` without `new` is exactly as dangerous as `new Function` and is a one-character gap from the existing rule.

**Fix:** Broaden the Function rule and add the cheap extras:

```js
const FORBIDDEN = [
  { re: /\beval\s*\(/, name: 'eval(' },
  { re: /\bnew\s+Function\b/, name: 'new Function' },
  { re: /\bFunction\s*\(/, name: 'Function(' },          // bare Function constructor
  { re: /\bimport\s*\(/, name: 'import(' },
  { re: /\b(?:set(?:Timeout|Interval))\s*\(\s*['"`]/, name: 'timer-string' }, // string-arg timer
];
```
(The `Function(` rule will need a vetted exception only if a recipe-path file legitimately references the identifier `Function`; none does today.)

### LO-03: Allowlist is a hardcoded 6-file list with nothing forcing new capability modules onto it (bypass-by-omission)

**File:** `scripts/verify-recipe-path-guard.mjs:78-85`
**Issue:** The prompt explicitly asks whether "a new recipe-path file not added to the allowlist" trivially bypasses the guard. It does. A future `extension/utils/capability-foo.js` that introduces `eval` will not be scanned unless someone remembers to append it to `RECIPE_PATH_ALLOWLIST`. The guard's correctness depends entirely on human discipline keeping the allowlist in sync with the actual capability surface. (This is a deliberate tradeoff -- a glob would false-positive on the three sanctioned MAIN-world sites -- so it is Low, not High, but it is the guard's structural weak point.)

**Fix:** Add a drift check that enumerates `extension/utils/capability-*.js` from disk and fails if any such file is absent from `RECIPE_PATH_ALLOWLIST` (the sanctioned sites are not under `utils/capability-*`, so they will not collide):

```js
import { readdirSync } from 'node:fs';
const onDisk = readdirSync(resolve(ROOT, 'extension/utils'))
  .filter((n) => /^capability-.*\.js$/.test(n))
  .map((n) => `extension/utils/${n}`);
for (const f of onDisk) {
  if (!RECIPE_PATH_ALLOWLIST.includes(f)) {
    failures.push(`allowlist drift: ${f} exists but is not on the recipe-path allowlist -- add it so the guard scans it.`);
  }
}
```

## Nit

### NI-01: Prototype-pollution-shaped keys silently vanish from placement maps

**File:** `extension/utils/capability-interpreter.js:154-167`
**Issue:** `fillPlacementMap` iterates `for (var key in map)` with a `hasOwnProperty` guard and writes `out[key] = ...`. A recipe with `request.query.__proto__ = "x"` does **not** pollute `Object.prototype` (verified -- the value is a string and the assignment is harmless), which is good. But the `__proto__` key silently disappears from the output (`{"__proto__":"x","constructor":"c"}` -> `{"constructor":"c"}`), because `out["__proto__"] = "x"` sets the prototype rather than an own key. No security impact in Phase 26, but it is a silent data-drop that could confuse debugging.

**Fix:** Build the output with a null-prototype object so such keys round-trip as plain data: `var out = Object.create(null);` (or use a `Map`). Defensive and free.

### NI-02: `interpretRecipe` returns the caller's spec object by reference for `authStrategy:'none'`

**File:** `extension/utils/capability-auth-strategies.js:60-64`, `extension/utils/capability-interpreter.js:266`
**Issue:** The `none` handler returns its input `spec` unchanged (same reference), whereas the other three return a fresh `Object.assign({}, spec, ...)`. So `interpretRecipe` returns the *same* `spec` object it built internally for `none` but a *copy* for the others. Harmless today (the interpreter owns that object), but the inconsistency means a future caller that mutates the returned `spec` would behave differently across strategies.

**Fix:** Have the `none` handler also return a shallow copy for uniformity: `shape: function(spec) { return Object.assign({}, spec); }`.

---

## Phase-spine verification checklist (all confirmed)

- WALL-1: no `eval`/`new Function`/`import(`/run-string-as-code in any of the three capability modules. CONFIRMED.
- `additionalProperties:false` at top level + `request` + `csrf`. CONFIRMED. (`params` intentionally open by design; forbidden-name pre-scan is top-level only -- nested `script` inside `params`/`request.query` is accepted as pure data and never executed, consistent with the documented threat model.)
- No-network boundary in `capability-interpreter.js` (no fetch / executeScript / XHR). CONFIRMED.
- INV-01: `errors.ts` change is ONLY the passthrough regex + comment; no tool schema touched. CONFIRMED.
- Typed-error RETURN shape `{success,code,errorCode,error}` identical across all three modules and surfaced verbatim by `mapFSBError`. CONFIRMED.
- CI guard: ReDoS-free; avoids `retrieval`/`evaluate`/`important`/`import.meta`/static-`import` false-positives; fails closed on unreadable allowlist files; negative self-assertion correctly keeps the three real sanctioned sites off the allowlist (all three verified to still contain dynamic code). CONFIRMED. (Coverage gaps -> LO-02; bypass-by-omission -> LO-03.)
- `{var}` templater: `encodeURIComponent` on substituted query/URL values; unfilled placeholder -> typed reject. CONFIRMED. (Raw header/body interpolation carries CRLF unescaped -> folded into ME-03 / forward-looking Phase 27 sink note.)
- background.js: additive `importScripts` only, correct load order (libs -> schema -> auth -> interpreter). CONFIRMED.

---

_Reviewed: 2026-06-20T05:11:27Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
_Advisory: this review does not block Phase 26._
