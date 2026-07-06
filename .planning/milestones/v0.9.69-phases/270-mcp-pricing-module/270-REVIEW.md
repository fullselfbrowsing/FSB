---
phase: 270
status: findings_found
findings_count: 6
reviewed: 2026-05-14
depth: medium
files_reviewed: 7
files_reviewed_list:
  - mcp/data/mcp-pricing-data.json
  - mcp/src/tools/pricing.ts
  - extension/utils/mcp-pricing.js
  - extension/utils/mcp-pricing-data.json
  - tests/mcp-pricing.test.js
  - tests/mcp-pricing-data-parity.test.js
  - package.json
findings:
  blocker: 1
  warning: 4
  info: 1
  total: 6
---

# Phase 270: MCP Pricing Module — Code Review Report

**Status:** `findings_found`
**Depth:** medium (focused on data integrity, parity, fallback contract, NEVER-throws guarantee)

## Summary

Six findings against an otherwise solid, well-tested module (156/156 assertions green, byte-exact parity gate working, NEVER-throws contract holds under hostile inputs including BigInt, throwing getters, prototype-pollution strings).

The single BLOCKER is `mcp/package.json`'s `files` field omitting the `data/` directory — `mcp/src/tools/pricing.ts` is compiled to `mcp/build/tools/pricing.js` which retains a runtime `import` for `../../data/mcp-pricing-data.json`, but the published `fsb-mcp-server` npm package will not contain that JSON file. The TS module is currently NOT imported by any code in `mcp/src/`, so the breakage is latent until the first server-side consumer lands (e.g., a follow-on phase wiring costs into MCP error envelopes per the docstring's stated intent). Fix is a one-line `package.json` edit.

The four WARNINGS cover related sub-issues: Node-18 ESM-import-attribute syntax incompatibility, MV3-SW fetch error handling silently swallowing failures with no diagnostic, the parity test's brittle regex parser for the visual-session allowlist, and negative-token costing being arithmetically accepted (producing negative USD costs).

Spot-check of 5+ rate rows against STACK.md sections 1a-1e: all verbatim. Client allowlist parity with `visual-session.ts:9-12` byte-exact including the U+1F980 crab grapheme. Confidence stamps complete on every row.

## Blocker Issues

### CR-01: npm package will ship without the pricing data JSON (latent module-load failure for server-side consumers)

**File:** `mcp/package.json:32-37` (the `files` field) and `mcp/src/tools/pricing.ts:39` (the import statement)
**Issue:**
`pricing.ts` line 39 reads `import pricingData from '../../data/mcp-pricing-data.json' with { type: 'json' };`. The TypeScript compiler emits this verbatim to `mcp/build/tools/pricing.js` — the relative path is preserved in the output (verified by reading `mcp/build/tools/pricing.js`).

`mcp/package.json` `files` ships `["build/", "ai/", "README.md", "server.json"]` — NOT `data/`. Confirmed via `npm pack --dry-run`: only `build/tools/pricing.js`, `pricing.d.ts`, `pricing.js.map` are packed; `data/mcp-pricing-data.json` is excluded from the tarball.

In dev/CI this works because `mcp/build/tools/../../data/` resolves to `mcp/data/` which exists. After `npm publish`, that same relative path inside the consumer's `node_modules/fsb-mcp-server/build/tools/pricing.js` resolves to `node_modules/fsb-mcp-server/data/mcp-pricing-data.json` which does not exist → `ERR_MODULE_NOT_FOUND` at module load.

Currently NO code in `mcp/src/` imports `pricing.ts` (verified by grep), so this is latent. But the module's docstring (lines 7-9) and CONTEXT.md decision section both anticipate server-side consumers ("The MCP server may surface costs in error messages or analytics tools server-side without a second source of truth"). The moment any phase wires `estimateMcpCost` into `mcp/src/server.ts` or any tool handler, every consumer of `fsb-mcp-server@>=0.9.69` will fail to start.

**Fix:**
Add `"data/"` to the `files` field in `mcp/package.json`:

```json
"files": [
  "build/",
  "ai/",
  "data/",
  "README.md",
  "server.json"
],
```

Then re-publish. Optionally also `cp -r data build/data` in the build script so the path resolution remains stable if `rootDir` ever changes; current setup with `data/` at the package root works because `../../data/` from `build/tools/` lands at the package root.

Verification: after the fix, `npm pack --dry-run` should list `data/mcp-pricing-data.json` in the tarball contents, and `node -e "import('fsb-mcp-server/build/tools/pricing.js').then(m => console.log(m.PRICING_SOURCE_DATE))"` from a fresh install must print `2026-05-14`.

## Warnings

### WR-01: `engines.node: ">=18.0.0"` allows Node versions that syntax-error on the `with { type: 'json' }` import attribute

**File:** `mcp/package.json:38-40` and `mcp/src/tools/pricing.ts:39`
**Issue:**
The ESM import-attribute syntax `import x from '...' with { type: 'json' }` was added in Node 18.20 / 20.10. On Node 18.0–18.19 (allowed by the current `engines.node` constraint), this is a **syntax error** at module parse time — there is no graceful fallback because the file fails to compile.

The pre-existing module on Node 18 used the now-deprecated `assert { type: 'json' }`. The build emits `pricing.js` with the `with` form. Any consumer on Node 18.0–18.19 (which `engines.node: ">=18.0.0"` advertises as supported) cannot load this file.

Compounds with CR-01 — even after that fix, Node 18.0–18.19 remains broken.

**Fix:**
Bump `engines.node` to `>=18.20.0` (or `>=20.0.0` to be safer since Node 18 hits EOL April 2025 / less than a year from now):

```json
"engines": {
  "node": ">=18.20.0"
}
```

Test plan: verify CI matrix covers the new floor. The MCP server runs as a stdio child of MCP clients; in practice users are on Node 22 LTS, but the package-level claim should not advertise unsupported versions.

### WR-02: MV3 service-worker fetch path silently swallows HTTP / parse failures with no diagnostic signal

**File:** `extension/utils/mcp-pricing.js:117-121`
**Issue:**
```js
_dataPromise = fetch(chrome.runtime.getURL('utils/mcp-pricing-data.json'))
  .then(function (r) { return r.json(); })
  .then(function (d) { _data = d; return d; })
  .catch(function (_e) { return null; });
```

Three problems compound:
1. No `r.ok` check before `r.json()` — a 404 returning an HTML error body would throw inside `r.json()` and be silently swallowed by `.catch`.
2. The `.catch` discards the error (`_e`) with no `console.warn` — operators investigating "all telemetry rows are UNKNOWN" will have no signal that the JSON failed to load.
3. No retry. Once `_dataPromise` resolves to null, all subsequent calls in this SW session return UNKNOWN forever (the early-return `if (_dataPromise) return _dataPromise;` on line 100 latches the failure). A transient fetch hiccup at SW cold-start permanently degrades that session.

Mirror this against the precedent in `extension/utils/install-identity.js:96-103`, which gates a `console.warn` behind `_corruptWarningEmitted` to provide one signal per SW session without spamming.

**Fix:**
```js
_dataPromise = fetch(chrome.runtime.getURL('utils/mcp-pricing-data.json'))
  .then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(function (d) { _data = d; return d; })
  .catch(function (e) {
    if (!_loadWarningEmitted) {
      console.warn('[FSB MCP Pricing] Failed to load pricing data; cost estimation will return UNKNOWN:', e && e.message);
      _loadWarningEmitted = true;
    }
    _dataPromise = null;  // permit retry on next call
    return null;
  });
```

Add `var _loadWarningEmitted = false;` near the existing module-level state declarations.

The `_dataPromise = null;` reset is the important production hook: it lets a later wake (or test seam) re-attempt the load rather than latching null. This mirrors the `_pendingMintPromise = null;` reset in `install-identity.js:114-119`.

### WR-03: Negative token counts are arithmetically accepted, producing negative USD costs

**File:** `mcp/src/tools/pricing.ts:243-254` and `extension/utils/mcp-pricing.js:211-220`
**Issue:**
Both modules check `typeof number && isFinite(...)` before multiplying. `Number.isFinite(-1000000) === true`, so negative tokens pass the guard and produce negative `cost` values:

```
estimateMcpCost({client:'Claude', model:'claude-haiku-4-5', tokensIn:-1e6, tokensOut:-1e6})
→ {"cost":-6, "source":"lookup", ...}
```

The contract is ambiguous on this — CONTEXT.md "Path 4" only enumerates `null/undefined/non-finite` as the unhappy path. But aggregating negative USD into telemetry rollups (Phase 272+) would silently distort `sum(cost_usd)` and `avg(cost_usd)` queries on the showcase dashboard. A malformed MCP-client envelope reporting negative tokens (or an integer-overflow wraparound to negative) would pollute the dataset with no signal.

The neighboring `extension/ai/cost-tracker.js` resolver (CONTEXT.md cites it as the pattern source) does not document its behavior on negative tokens either, but this is a v0.9.69 telemetry milestone where data quality is the primary deliverable.

**Fix:**
Reject negative tokens uniformly with non-finite:

```ts
// TS:
const tin = typeof tokensIn === 'number' && Number.isFinite(tokensIn) && tokensIn >= 0 ? tokensIn : null;
const tout = typeof tokensOut === 'number' && Number.isFinite(tokensOut) && tokensOut >= 0 ? tokensOut : null;
```

```js
// JS mirror:
var tin = (typeof tokensIn === 'number' && isFinite(tokensIn) && tokensIn >= 0) ? tokensIn : null;
var tout = (typeof tokensOut === 'number' && isFinite(tokensOut) && tokensOut >= 0) ? tokensOut : null;
```

Add a regression test in Section 4 of `tests/mcp-pricing.test.js`:

```js
const rNeg = m.estimateMcpCost({ client: 'Claude', model: 'claude-haiku-4-5', tokensIn: -1, tokensOut: 1 });
passAssertEqual(rNeg.cost, null, 'negative tokensIn -> cost=null');
passAssertEqual(rNeg.source, 'lookup', 'negative tokens preserves source=lookup');
```

Zero remains legitimate (`tokensIn >= 0`) — Section 4's existing zero-cost assertion still passes.

### WR-04: Parity test's regex parser of `MCP_VISUAL_CLIENT_LABELS` will silently mis-parse if the array literal ever grows a comment

**File:** `tests/mcp-pricing.test.js:431-441`
**Issue:**
The parity test extracts `MCP_VISUAL_CLIENT_LABELS` by regex:

```js
const m = vsSource.match(/MCP_VISUAL_CLIENT_LABELS:\s*string\[\]\s*=\s*\[([\s\S]*?)\];/);
const labels = m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '').trim()).filter(s => s.length > 0);
```

Reproducer:
```js
const src = "MCP_VISUAL_CLIENT_LABELS: string[] = ['Claude', 'Codex', /* 'OldLabel', */ 'Hermes'];";
// → labels: ['Claude', 'Codex', "/* 'OldLabel", "*/ 'Hermes"]
```

This works today because the actual `visual-session.ts:9-12` array literal contains no comments and uses single quotes throughout. The first time someone adds an inline `// deprecated` or `/* TODO */` to that array — or switches one entry to a double-quoted string — the parity test silently passes with corrupted label data, allowing typo drift to ship undetected (defeating the entire purpose of the test).

**Fix:**
Either (a) export a programmatic accessor from `visual-session.ts` and import it in the test (the file already has `getAllowedMcpVisualClientLabels(): string[]` at line 33 — exactly the right surface for this), or (b) use the TS Compiler API (`ts.createSourceFile`) for a proper AST parse.

Option (a) is cleanest. Pre-compile `visual-session.ts` to `mcp/build/tools/visual-session.js` (already done by `npm --prefix mcp run build` in the test chain) and import it:

```js
// Compile mcp first so the .js exists for the test.
const visualSession = require('../mcp/build/tools/visual-session.js');
const labels = visualSession.getAllowedMcpVisualClientLabels();
```

If pulling in the compiled TS module is too heavy, at minimum strip comments before the split:

```js
const arrayBody = m[1].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const labels = arrayBody.split(',').map(...);
```

The strict fix (option a) is preferred — the regex form is brittle by design.

## Info

### IN-01: Test counter `chaosThrows` conflates thrown exceptions with shape-divergence misses; the final assertion message is misleading

**File:** `tests/mcp-pricing.test.js:194-213`
**Issue:**
Lines 194-213: `chaosThrows` is incremented both on caught exceptions (line 209) AND on shape divergence (line 203). The final assertion (line 213) reads `'chaos sweep: zero throws across 10 garbage inputs'` — but if a future regression caused the resolver to return `{cost: null}` with missing keys (shape divergence, no throw), the message would still say "throws". The check is still correct (any failure mode increments the counter), but a debugger reading the FAIL line would chase the wrong root cause.

**Fix:** Use two counters with distinct assertion messages:

```js
let chaosShapeMisses = 0;
let chaosThrows = 0;
// ... in the loop, set the respective counter on its specific failure mode
passAssertEqual(chaosThrows, 0, 'chaos sweep: zero throws across 10 garbage inputs');
passAssertEqual(chaosShapeMisses, 0, 'chaos sweep: zero shape-divergent results across 10 garbage inputs');
```

Low-impact tidiness — won't affect runtime correctness. Flagged because the BLOCKER and WR-* fixes will involve touching this section anyway and the conflation is worth resolving in the same touch.

---

## Strengths (worth preserving on fix)

- **Resolver NEVER-throws contract is genuinely robust.** Verified hostile inputs: BigInt tokens (rejected via typeof number), throwing getter on input.client (caught by outer try/catch), prototype-pollution strings `__proto__`/`constructor`/`toString`/`hasOwnProperty` (all correctly rejected by `Object.prototype.hasOwnProperty.call` guard), corrupted `_data` lacking `model_pricing` (caught, returns UNKNOWN envelope).
- **STACK.md spot-check 5+ rows verbatim:** claude-opus-4-7 ($5/$25), claude-sonnet-4-6 ($3/$15), gpt-5 ($1.25/$10), grok-4.3 ($1.25/$2.50), deepseek-v4-pro ($0.435/$0.87 promo), claude-opus-4-1 ($15/$75) — all exact match to STACK §1a-1e tables.
- **Crab grapheme byte-exact parity** (`'OpenClaw 🦀'` = `'OpenClaw \u{1F980}'`) in JSON, in `visual-session.ts:11`, in tests Section 2 and Section 8. No mojibake.
- **Module-load invariant at `mcp/src/tools/pricing.ts:133-141`** correctly fails fast if a `client_default_model.<X>.model` ever points to a non-existent `model_pricing` row — the docstring at lines 28-30 explicitly notes "the ONLY throw path" is module-load, and this is exactly the right place.
- **Test seam `_loadPricingData(data)`** at `mcp-pricing.js:271` is a clean, well-bounded inject for fault-injection tests. Test Section 3's `_data=null` race-case (currently latent, see WR-02 fix) is one trivial addition away from full coverage.
- **JS module pattern matches Phase 269's install-identity.js** as required by CONTEXT.md: `globalThis.fsbMcpPricing = {...}` + Node CommonJS fallback. Idiomatic and consistent.
- **Byte-exact parity test (`tests/mcp-pricing-data-parity.test.js`)** correctly raw-bytes compare via `fs.readFileSync(... 'utf-8')` strict-equal — no JSON.parse round-trip that could mask formatting drift. Helpful diff output on failure.

---

_Reviewed: 2026-05-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: medium_
