# Phase 26: Recipe Schema + Bundled Interpreter + MV3 CI Guard - Pattern Map

**Mapped:** 2026-06-19
**Files analyzed:** 16 (8 CREATE + 5 MODIFY + 3 fixture/data targets)
**Analogs found:** 16 / 16 (every file has a concrete in-repo analog)

> **Tree reality (trust this, not `.planning/codebase/*.md`):** real source lives under `extension/` (`extension/lib/`, `extension/utils/`, `extension/ws/`, `extension/ai/`, `extension/background.js`, `extension/manifest.json`). `esbuild.config.js`, `scripts/`, `tests/`, `mcp/`, `.github/workflows/` are at repo root. All file:line anchors below were read on disk on branch `automation-worktree` this session.

---

## Reality Divergences (READ FIRST — flag to planner)

1. **`package.json` already lists all three libs under `dependencies`, NOT `devDependencies`.** RESEARCH.md (lines 104-110) and D-19 say to `npm install --save-dev` them into `devDependencies`. On disk (`package.json:80-87`) they are already present under `dependencies`:
   ```json
   "dependencies": {
     "@cfworker/json-schema": "^4.1.1",   // package.json:81
     "@full-self-browsing/phantom-stream": "0.1.0",
     "axios": "^1.6.0",
     "jmespath": "^0.16.0",               // package.json:84
     "lattice": "npm:@full-self-browsing/lattice@1.4.0",
     "minisearch": "^7.2.0"               // package.json:86
   }
   ```
   `node_modules/@cfworker/json-schema`, `node_modules/minisearch`, `node_modules/jmespath` are all present (verified `ls`). **The "install the 3 libs" task is already done** (possibly by a prior wave/commit). Planner action: either (a) accept them under `dependencies` and DROP the `devDependencies` step (these are vendored-into-`lib/`, never Node-runtime-required, so `devDependencies` is the *correct* home — but moving them is optional churn), or (b) move them to `devDependencies` to match research intent. **Recommendation: leave as-is** (functionally identical for a vendored-only lib; avoid needless package.json churn). The `devDependencies` block currently holds only `@full-self-browsing/lattice-cli` and `esbuild` (`package.json:88-91`).

2. **`esbuild@^0.24.0` is present** (`package.json:90`) — the one-off cfworker IIFE build can use `node_modules/.bin/esbuild` immediately. No install needed.

3. **None of the three vendored `lib/*.min.js` exist yet** (verified `ls extension/lib/`): present are `chart.min.js`, `gpt-tokenizer.min.js`, `lz-string.min.js`, `marked.min.js`, `mermaid.min.js`, `purify.min.js` (+ `memory/`, `visualization/` subdirs). The three NEW files must be created. Correct.

4. **`catalog/` does not exist anywhere** (verified — neither `catalog/` nor `extension/catalog/`). RESEARCH.md's diagram (line 202) places it at `extension/catalog/recipes/` in one spot but CONTEXT.md D-link and the file-set both say repo-root `catalog/recipes/`. **Decision needed by planner:** `catalog/` at repo root (matches the CONTEXT file-set and keeps fixtures out of the shipped extension payload — note `validate-extension.mjs` only walks dirs UNDER `extension/`, so a repo-root `catalog/` is NOT `node --check`'d, which is fine for JSON) vs `extension/catalog/` (ships in the package but then JSON fixtures sit under a `node --check`'d-adjacent tree — still fine, JSON isn't walked since `walk()` only collects `.js`/`.mjs`). **Recommendation: repo-root `catalog/recipes/_fixtures/`** — fixtures are build/test data, not shipped runtime, and this matches the CONTEXT file-set verbatim.

5. **RESEARCH D-02 rationale correction (already noted in RESEARCH lines 64, 386-388):** "raw-ESM fails `node --check`" is true on CI Node 20 but PASSES on Node 25. The durable reason to IIFE-bundle `@cfworker/json-schema` is `importScripts` classic-script semantics (top-level `export` is a SyntaxError in a classic SW). Decision (bundle to IIFE) is unchanged; planner should cite the runtime reason.

6. **`engines.node` is `>=24.0.0`** (`package.json:71-74`) but CI pins `node-version: '20'` (`.github/workflows/ci.yml:22,42,59`). Pre-existing mismatch; neutralized for this phase by the IIFE-bundle decision. Flag only.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| **CREATE** | | | | |
| `extension/lib/cfworker-json-schema.min.js` | vendored-lib (built IIFE) | transform (validate) | `extension/lib/lz-string.min.js` (+ `esbuild.config.js` ENTRIES) | exact (vendoring) / role-match (build) |
| `extension/lib/minisearch.min.js` | vendored-lib (UMD as-is) | transform (search; Phase 28) | `extension/lib/lz-string.min.js` | exact |
| `extension/lib/jmespath.min.js` | vendored-lib (UMD as-is) | transform (extract) | `extension/lib/lz-string.min.js` | exact |
| `extension/utils/capability-recipe-schema.js` | config/schema module (SW) | transform (data def) | `extension/utils/trigger-store.js` (dual-export IIFE + version const) | role-match |
| `extension/utils/capability-interpreter.js` | service/interpreter (SW) | transform (validate→bind→emit) | `extension/utils/value-extractor.js` (pure dual-export IIFE) | exact (shell) / role-match (logic) |
| `extension/utils/capability-auth-strategies.js` | service/registry (SW) | event-driven (enum→handler dispatch) | `extension/utils/value-extractor.js` (pure module) | role-match |
| `scripts/verify-recipe-path-guard.mjs` | CI guard (Node script) | batch (static scan + fixture run) | `scripts/verify-store-listing.mjs` | exact |
| `tests/capability-recipe-schema.test.js` | test (zero-framework) | request-response (assert) | `tests/trigger-store.test.js` | exact |
| `tests/capability-interpreter.test.js` | test (zero-framework) | request-response (assert) | `tests/trigger-store.test.js` + `tests/ownership-error-codes.test.js` | exact |
| `tests/recipe-path-guard.test.js` | test (spawn a guard) | request-response (spawn) | `tests/verify-store-listing.test.js` | exact |
| `catalog/recipes/_fixtures/*.json` | test data (JSON fixtures) | file-I/O (read) | (no JSON-fixture-dir analog; pattern below) | role-match (synthesized) |
| **MODIFY** | | | | |
| `extension/background.js` | SW entry (importScripts chain) | event-driven (boot load order) | `background.js:97-104` (`importScripts('lib/lz-string.min.js')` block) | exact |
| `esbuild.config.js` | build config | batch (one-off bundle) | `esbuild.config.js` `ENTRIES[]` (`offscreen-stt`) | exact |
| `mcp/src/errors.ts` | error-mapping module | transform (code passthrough) | `errors.ts:122` (`TRIGGER_*` regex) | exact |
| `package.json` | manifest/config | n/a | `package.json:16` `scripts.test` chain | exact |
| `.github/workflows/ci.yml` | CI config | n/a | `ci.yml:31-32` (`validate:extension` step) | exact |

---

## Pattern Assignments

### `extension/lib/{minisearch,jmespath}.min.js` (vendored-lib, UMD as-is)

**Analog:** `extension/lib/lz-string.min.js`

**Verified UMD shape** (`extension/lib/lz-string.min.js:1`, first bytes):
```js
var LZString=function(){var r=String.fromCharCode, ... }();
```
A self-contained IIFE assigned to a global `var`. The two new libs follow the same shape (verified globals from package headers per RESEARCH line 246):
- `minisearch` → vendor `node_modules/minisearch/dist/umd/index.js` → global `MiniSearch`
- `jmespath` → vendor `node_modules/jmespath/jmespath.js` → global **lowercase** `jmespath`

**Why this passes the gate:** `validate-extension.mjs` `node --check`s every `.js` under `lib/` (see below). A `var X=...` IIFE/UMD parses clean as a classic script; a top-level ESM `export` would NOT. These two ship as-is because they are already UMD.

**Loaded via:** `importScripts('lib/...')` in `background.js` (see MODIFY section).
**Accessed via:** the `typeof <Global> !== 'undefined'` guard (Pattern below).

---

### `extension/lib/cfworker-json-schema.min.js` (vendored-lib, BUILT IIFE)

**Analog (output shape):** `extension/lib/lz-string.min.js` — must end up as `var CfworkerJsonSchema=(()=>{...})();`
**Analog (how to build it):** `esbuild.config.js` `ENTRIES[0]` (`offscreen-stt`), which is the per-entry browser-IIFE precedent.

**Per-entry browser-IIFE flags to mirror** (`esbuild.config.js:67-78`):
```js
{
  name: 'offscreen-stt',
  entryPoints: [path.join(SRC_ROOT, 'offscreen', 'stt.js')],
  outfile: path.join(OUT_ROOT, 'offscreen', 'stt.js'),
  format: 'iife',            // <- the IIFE format the cfworker bundle needs
  sourcemap: 'external',     // <- cfworker bundle should use sourcemap:false (lib/, lean)
  platform: 'browser',       // <- mirror
  target: ['chrome120'],     // <- mirror
  bundle: true,              // <- mirror
  legalComments: 'none',     // <- mirror
  allowOverwrite: true,
},
```

**Exact build command (verified working this session, RESEARCH lines 121-133):**
```bash
node_modules/.bin/esbuild node_modules/@cfworker/json-schema/dist/esm/index.js \
  --bundle --format=iife --global-name=CfworkerJsonSchema \
  --platform=browser --target=chrome120 --legal-comments=none \
  --outfile=extension/lib/cfworker-json-schema.min.js
```
Output: 45.3 kB; header `var CfworkerJsonSchema = (() => { ... })();`; **0** `eval(`/`new Function`/`import(`/`node:` refs; `node --check` clean. Exposes `CfworkerJsonSchema.Validator`.

**Integration choice (RESEARCH lines 135-137, recommends (a)):** commit the built file to `extension/lib/` (matches every existing `lib/*.min.js` which are committed prebuilt) and optionally add a `package.json` `scripts.build:cfworker` documenting regeneration. **Do NOT** add it to the `esbuild.config.js` `ENTRIES[]` auto-build loop unless reproducibility-from-source is a hard requirement — the existing ENTRIES all emit to `extension/dist/`, not `extension/lib/`, and `background.js` imports nothing from `dist/`.

> **CRITICAL — the cfworker bundle does NOT go through the `ENTRIES[]` array.** It is a *one-off* build whose output lives in `lib/` (loaded via `importScripts`), unlike every current ENTRY whose output lives in `extension/dist/` (loaded via `<script>`). If a `scripts.build:cfworker` is added, it is a standalone `node_modules/.bin/esbuild ...` invocation, not an `ENTRIES` push.

---

### `extension/utils/capability-recipe-schema.js` (config/schema module, SW)

**Analog:** `extension/utils/trigger-store.js`

**Dual-export IIFE shell** (`trigger-store.js:1-2` open, `:183-200` close) — clone verbatim:
```js
// Open (trigger-store.js:1-2):
(function(global) {
  'use strict';
  // ... module body ...

// Close (trigger-store.js:183-200):
  var exportsObj = {
    // public API: RECIPE_SCHEMA, FSB_RECIPE_SCHEMA_VERSION, validateRecipe?, ...
  };
  global.FsbCapabilityRecipeSchema = exportsObj;        // SW importScripts consumer reads this global
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                          // node tests/*.test.js require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

**Version-const idiom** (`trigger-store.js:58-59`) — mirror for `schemaVersion` (D-10):
```js
var FSB_TRIGGER_REGISTRY_STORAGE_KEY = 'fsbTriggerRegistry';
var FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION = 1;
// Phase 26 analog:
//   var FSB_RECIPE_SCHEMA_VERSION = 1;   // becomes the schemaVersion `const` in the JSON Schema
```

**Schema content (from RESEARCH, not from an analog — FSB-authored):** closed top-level vocab with `additionalProperties:false` at EVERY level (D-06/D-07); `schemaVersion` as a JSON-Schema `const`; `format:'uri'` only on `origin`, a `pattern` (must start with `/`) on `endpoint` (Pitfall 4); `authStrategy` enum locked to the four D-08 members; optional `csrf` object (RESEARCH Open-Q 2 resolution); plus a defense-in-depth forbidden-name guard (`not`/`propertyNames`) listing `script`,`expr`,`transform`,`code`,`fn`,`js` (Pitfall 2).

---

### `extension/utils/capability-interpreter.js` (service/interpreter, SW)

**Analog (module shell):** `extension/utils/value-extractor.js` — a PURE, DOM-free, zero-dependency dual-export IIFE that deliberately OMITS the lazy `_getChrome()` resolver because it touches no browser API. The interpreter is identical in posture (validate→bind→emit, no I/O, stops before the network — D-11).

**Pure dual-export shell** (`value-extractor.js:1-2` open, tail close):
```js
// value-extractor.js tail (VERIFIED) — clone this exact export footer:
  var exportsObj = {
    parseLocaleNumber: parseLocaleNumber,
    extractValue: extractValue
  };
  global.FsbValueExtractor = exportsObj;            // SW importScripts consumer
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                    // Node test consumer
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
// Phase 26 global name: global.FsbCapabilityInterpreter = exportsObj;
```
> `value-extractor.js:30-31` doc-comment explicitly notes it "OMITS the lazy browser-API resolver entirely -- there is no browser API to resolve." The interpreter follows the same rule (no `chrome.*` in Phase 26 — the fetch is Phase 27).

**Vendored-lib access guard** (`extension/ws/ws-client.js:98-99`, VERIFIED) — the pattern the interpreter uses to reach the validator + jmespath globals:
```js
function getFSBLZStringCodec() {
  return (typeof LZString !== 'undefined' && LZString) ? LZString : null;
}
// Phase 26 analogs (RESEARCH lines 247-251):
function getFSBRecipeValidator(schema, draft) {
  if (typeof CfworkerJsonSchema === 'undefined' || !CfworkerJsonSchema.Validator) return null;
  return new CfworkerJsonSchema.Validator(schema, draft || '2020-12', false /* emit all errors */);
}
function getFSBJmespath() {
  return (typeof jmespath !== 'undefined' && jmespath) ? jmespath : null;  // LOWERCASE global
}
```

**Typed-error RETURN shape (does not throw — D-15):** mirror `createMcpOwnershipError` (`extension/ws/mcp-tool-dispatcher.js:190-198`, VERIFIED):
```js
function createMcpOwnershipError(code, extra = {}) {
  return {
    success: false,
    code,
    errorCode: code,   // <- both `code` and `errorCode` set so errors.ts resolveErrorKey picks it up either way
    error: code,
    ...extra
  };
}
```
Phase 26 interpreter returns the same shape with `code` ∈ `{RECIPE_SCHEMA_INVALID, RECIPE_UNKNOWN_FIELD, RECIPE_OPCODE_INVALID}` plus `...context` (e.g. `instanceLocation`, `field`, `value`, `errors`). The CfworkerJsonSchema error→typed-code mapping is given in RESEARCH lines 336-348.

**Hand-rolled `{var}` templater (D-04, FSB-authored — RESEARCH lines 353-363):** ~10-line `String.prototype.replace(/\{([a-zA-Z0-9_]+)\}/g, ...)` that `encodeURIComponent`s each substituted param and rejects unfilled placeholders. No `url-template`, no `eval`.

---

### `extension/utils/capability-auth-strategies.js` (service/registry, SW)

**Analog:** `extension/utils/value-extractor.js` (same pure dual-export IIFE shell as the interpreter).

**Closed frozen registry shape (Wall-1 "enum→bundled behavior" — RESEARCH lines 257-266):**
```js
var AUTH_HANDLERS = Object.freeze({
  'none':               { shape: function(spec) { return spec; } },
  'same-origin-cookie': { shape: function(spec) { return Object.assign({}, spec, { credentials: 'include' }); } },
  'bearer-from-storage':{ shape: function(spec, ctx) { return Object.assign({}, spec, { _authNeed: { kind:'bearer', source:'storage' } }); } },
  'csrf-header-scrape': { shape: function(spec, recipe) { /* declares csrfSource from recipe.csrf */ } },
});
// bindAuthStrategy: var h = AUTH_HANDLERS[recipe.authStrategy];
//   if (!h) return createRecipeError('RECIPE_OPCODE_INVALID', { field:'authStrategy', value:recipe.authStrategy });
//   return h.shape(spec, recipe);
```
**Export footer:** `global.FsbCapabilityAuthStrategies = exportsObj;` + the `module.exports` mirror (same footer as `value-extractor.js`). Handlers in Phase 26 are SPEC-SHAPING STUBS only — they declare needs (`credentials`, `_authNeed`, `csrfSource`), perform NO I/O (D-12).

---

### `scripts/verify-recipe-path-guard.mjs` (CI guard, Node script)

**Analog:** `scripts/verify-store-listing.mjs` — a Node-builtins-only static-analysis gate with a `failures[]` accumulator, `safeRead`, and `process.exit(1)`-on-fail. Near-perfect structural match.

**Header + Node-builtins imports** (`verify-store-listing.mjs:24-38`, VERIFIED):
```js
#!/usr/bin/env node
'use strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const failures = [];
```

**Safe-read + fail-accumulate** (`verify-store-listing.mjs:40-47`):
```js
function safeRead(path, label) {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    failures.push(`${label}: cannot read ${path} (${err.code || err.message})`);
    return null;
  }
}
```

**Exit convention** (`verify-store-listing.mjs:122-131`):
```js
if (failures.length > 0) {
  console.error('verify-store-listing: FAIL');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('verify-store-listing: PASS (5 checks green)');
process.exit(0);
```

**Phase-26-specific logic (D-16/D-17, FSB-authored):**
1. **Hardcoded recipe-path file allowlist** (NOT a glob, NOT a whole-`extension/` walk):
   ```js
   const RECIPE_PATH_ALLOWLIST = [
     'extension/utils/capability-recipe-schema.js',
     'extension/utils/capability-interpreter.js',
     'extension/utils/capability-auth-strategies.js',
     'extension/lib/cfworker-json-schema.min.js',
     'extension/lib/jmespath.min.js',
     'extension/lib/minisearch.min.js',
   ];
   const FORBIDDEN = [/\beval\s*\(/, /\bnew\s+Function\b/, /\bimport\s*\(/];
   ```
   Scan each allowlisted file's text; push a failure on any forbidden-pattern hit.
2. **Run the recipe JSON Schema against accept/reject fixtures** (`catalog/recipes/_fixtures/`): load the cfworker IIFE (see test-load note below), assert accept fixtures `valid:true` and each reject fixture `valid:false`.
3. **Negative self-assertion:** assert the three sanctioned sites are NOT on the allowlist (defends against allowlist drift). The whole-tree grep (verified this session) hits exactly: `extension/ai/lattice-runtime-adapter.js:66` (comment), `extension/ai/tool-executor.js:387` (`eval(jsCode)`), `extension/ws/mcp-bridge-client.js:922` (`new Function(userCode)`).

---

### `tests/capability-recipe-schema.test.js` + `tests/capability-interpreter.test.js` (zero-framework tests)

**Analog:** `tests/trigger-store.test.js` (+ `tests/ownership-error-codes.test.js` for the typed-`{code}` assertion style).

**Module-load + fresh-require pattern** (`trigger-store.test.js:22-46`, VERIFIED):
```js
const assert = require('assert');
const path = require('path');
const harness = require('./fixtures/run-task-harness');   // installChromeMock etc.

const STORE_MODULE_PATH = path.join(__dirname, '..', 'extension', 'utils', 'trigger-store.js');
// Phase 26: path.join(__dirname,'..','extension','utils','capability-interpreter.js')

function freshRequireStore() {
  try { delete require.cache[require.resolve(STORE_MODULE_PATH)]; } catch (_e) {}
  return require(STORE_MODULE_PATH);
}
```

**Pass/fail counter + runner** (`trigger-store.test.js:28-39`):
```js
let passed = 0;
let failed = 0;
function runTest(name, fn) {
  return Promise.resolve().then(() => fn())
    .then(() => { passed++; console.log('  PASS:', name); })
    .catch((err) => { failed++; console.error('  FAIL:', name, '--', err && err.message ? err.message : err); });
}
```

**Exit convention** (`trigger-store.test.js` tail, VERIFIED):
```js
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => { console.error('FATAL:', err); process.exit(2); });
```

**Synchronous `check(cond, msg)` variant** (for the interpreter binding asserts; `ownership-error-codes.test.js:31-39`, VERIFIED):
```js
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
```

**Chrome mock (only the interpreter test needs it — to PROVE no fetch/executeScript):** `tests/fixtures/run-task-harness.js` `installChromeMock(opts)` (lines 131-165, VERIFIED) installs `globalThis.chrome` with `runtime.sendMessage` recording into `_sendMessageCalls`. For CAP-02's "asserts STOPS before network", the interpreter test should install a chrome mock whose `scripting.executeScript` is a recorder and assert it is **never called**. NB: the stock harness mock (lines 139-150) provides `runtime`, `storage`, `tabs` but NOT `scripting` — extend it inline in the test, or add a `scripting` recorder to the mock (test-only; allowed — the CI guard scans the recipe path, not tests).

**cfworker IIFE test-load (RESEARCH lines 457):** the bundle assigns `var CfworkerJsonSchema=...` (script-scope global), so a plain `require()` will NOT populate `module.exports`. Use `vm.runInThisContext(readFileSync(...))` (or `eval`) in the test harness to evaluate the IIFE, then read `globalThis.CfworkerJsonSchema`. This is test-only (mirrors how content-bundle globals are tested) and is NOT on the recipe-path allowlist, so it does not trip the guard.

---

### `tests/recipe-path-guard.test.js` (spawn-a-guard test)

**Analog:** `tests/verify-store-listing.test.js` — spawns the `.mjs` guard via `spawnSync('node', [...])` and asserts exit code + stdout/stderr. Near-perfect match.

**Spawn + assert pattern** (`verify-store-listing.test.js:13-49`, VERIFIED):
```js
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const result = spawnSync('node', ['scripts/verify-recipe-path-guard.mjs'], {
  cwd: ROOT, stdio: 'pipe', env: process.env,
});
const stdout = result.stdout ? result.stdout.toString() : '';
const stderr = result.stderr ? result.stderr.toString() : '';

check('guard exits 0 on clean recipe path', result.status === 0, `exit ${result.status}; ${stderr.slice(-500)}`);
// ... then a SECOND spawn pointed at a planted-eval fixture asserting result.status !== 0 (CAP-04)
```
For the planted-`eval` self-test (D-19c), the guard needs a way to be pointed at a temp fixture (e.g. an env var or arg the guard honors), OR the test writes a planted-`eval` file into a temp dir on the allowlist and asserts non-zero. Plan the guard's "fixture dir is overridable" seam so this test can flip it red.

---

### `catalog/recipes/_fixtures/*.json` (JSON test fixtures)

**Analog:** none exact — the repo has no committed JSON-fixture *directory* (test data is generated inline in `tests/*.js`, e.g. `makeSnapshot()` in `trigger-store.test.js:48-68`). **Synthesized pattern:** plain `.json` files, one valid accept fixture + one reject fixture per forbidden name (`script`,`expr`,`transform`,`code`,`fn`,`js`) + unknown-field + bad-`method` + bad-`authStrategy` (Pitfall 2 requires per-forbidden-name fixtures). Shared by BOTH `tests/capability-recipe-schema.test.js` AND `scripts/verify-recipe-path-guard.mjs` (single source of truth). A repo-root `catalog/` is NOT walked by `validate-extension.mjs` (it only walks dirs under `extension/`), and JSON is not `node --check`'d anyway, so location is unconstrained by the gate.

---

## MODIFY Targets — exact current code to extend

### `extension/background.js` — additive `importScripts('lib/...')` lines (D-05)

**Exact current region** (`background.js:96-104`, VERIFIED) — the `lib/lz-string.min.js` precedent and the block to extend:
```js
// Dashboard relay WebSocket client (auto-connects to full-selfbrowsing.com)
try { importScripts('lib/lz-string.min.js'); } catch (e) { console.error('[FSB] Failed to load lz-string.min.js:', e.message); }
try { importScripts('ws/phantom-stream-protocol.js'); } catch (e) { console.error('[FSB] Failed to load phantom-stream-protocol.js:', e.message); }
// Phase 211-03 diagnostic logging: load the ring buffer BEFORE redactForLog so
// that rateLimitedWarn sees globalThis.fsbDiagnostics on first call. Both load
// BEFORE ws-client.js so the WebSocket layer can use the helpers.
try { importScripts('utils/diagnostics-ring-buffer.js'); } catch (e) { console.error('[FSB] Failed to load diagnostics-ring-buffer.js:', e.message); }
try { importScripts('utils/redactForLog.js'); } catch (e) { console.error('[FSB] Failed to load redactForLog.js:', e.message); }
try { importScripts('ws/ws-client.js'); } catch (e) { console.error('[FSB] Failed to load ws-client.js:', e.message); }
```

**Load-order template for the trigger family** (`background.js:47-50`, VERIFIED — the exact `try/catch importScripts` idiom + dependency-ordering comments to mirror):
```js
try { importScripts('utils/value-extractor.js'); } catch (e) { console.error('[FSB] Failed to load value-extractor.js:', e.message); }
try { importScripts('utils/trigger-store.js'); } catch (e) { console.error('[FSB] Failed to load trigger-store.js:', e.message); }
try { importScripts('utils/trigger-manager.js'); } catch (e) { console.error('[FSB] Failed to load trigger-manager.js:', e.message); }
try { importScripts('utils/trigger-lifecycle.js'); } catch (e) { console.error('[FSB] Failed to load trigger-lifecycle.js:', e.message); }
```

**Phase 26 additive lines (load-order matters):** the three vendored libs FIRST (so their globals exist), then the schema, then the auth-strategies, then the interpreter (which reads all three). Insert as a contiguous, commented block (mirror the `value-extractor → trigger-store → ...` comment style). Each line wrapped in `try { importScripts(...) } catch (e) { console.error(...) }`. Because `background.js` is byte-frozen as an esbuild input (D-05; `esbuild.config.js:17-19,43-49`), edits are limited to these additive lines.

---

### `esbuild.config.js` — the cfworker one-off (PATH A)

**Per-entry IIFE precedent to mirror** (`esbuild.config.js:67-78`, the `offscreen-stt` ENTRY — quoted in full in the cfworker CREATE section above). **Decision (per RESEARCH recommendation):** do NOT add the cfworker bundle to the `ENTRIES[]` array (all ENTRIES emit to `extension/dist/`; cfworker emits to `extension/lib/`). Instead either (a) commit the prebuilt file + add an optional documented `package.json` `scripts.build:cfworker` standalone command, OR (b) if a build step is mandated, add a separate `node_modules/.bin/esbuild` invocation — NOT an `ENTRIES` push. The byte-freeze comments (`esbuild.config.js:17-19`) confirm `background.js` is never an esbuild input; this is the invariant the additive-importScripts-only edit respects.

> Likely outcome: `esbuild.config.js` is **NOT modified at all** if option (a) is chosen and the build command is documented in a `package.json` script instead. Planner should confirm which file actually changes.

---

### `mcp/src/errors.ts` — add `RECIPE_*` to the verbatim passthrough (D-15)

**Exact current region** (`mcp/src/errors.ts:122`, VERIFIED) — the `TRIGGER_*` regex, the one-line copy-target:
```ts
if (explicitCode && /^(TRIGGER_.+|INVALID_TRIGGER_ID|INVALID_TAB_ID|LIFECYCLE_UNAVAILABLE|REFRESH_POLL_INTERVAL_TOO_LOW)$/.test(explicitCode)) {
  return explicitCode;
}
```
**Phase 26 edit:** add `RECIPE_.+` to the alternation →
```ts
if (explicitCode && /^(TRIGGER_.+|RECIPE_.+|INVALID_TRIGGER_ID|INVALID_TAB_ID|LIFECYCLE_UNAVAILABLE|REFRESH_POLL_INTERVAL_TOO_LOW)$/.test(explicitCode)) {
```
**How the code is read** (`errors.ts:104-107`, VERIFIED) — `resolveErrorKey` reads `errorCode` then falls back to `code`; the interpreter sets BOTH (matching `createMcpOwnershipError`), so either field carries it:
```ts
const explicitCode = typeof fsbResult?.errorCode === 'string'
  ? fsbResult.errorCode
  : (typeof fsbResult?.code === 'string' ? fsbResult.code : '');
if (FSB_ERROR_MESSAGES[explicitCode] || CODE_ONLY_ERROR_KEYS.has(explicitCode)) {
  return explicitCode;
}
```
**Alternative (also acceptable, RESEARCH line 375):** add the three exact codes to `CODE_ONLY_ERROR_KEYS` (`errors.ts:54-68`). The regex is lower-friction (one prefix match covers the whole family). Use the regex.

> Note: this is the ONLY `errors.ts` change in Phase 26. The `RECIPE_*` codes fall through to `buildLayeredDetail`'s `default` arm (`errors.ts:371-381`), which surfaces `Tool returned error code: RECIPE_*` — acceptable for Phase 26 (the dispatcher route carrying it is Phase 28). No new `FSB_ERROR_MESSAGES` entry or `LAYER_LABELS` case is required this phase.

---

### `package.json` — `scripts.test` chain additions (D-19)

**Exact current chain tail** (`package.json:16`, VERIFIED — the trigger family appended at the end of the `&&`-chain):
```
... && node tests/trigger-store.test.js && node tests/trigger-lifecycle.test.js && node tests/value-extractor.test.js && node tests/trigger-manager.test.js && node tests/trigger-cap.test.js && node tests/trigger-observe.test.js && node tests/trigger-observe-pulse.test.js && node tests/trigger-refresh-poll.test.js && node tests/trigger-tool-dispatcher.test.js && node tests/trigger-blocking-reporting.test.js
```
**Phase 26 edit:** append three `&& node tests/capability-recipe-schema.test.js && node tests/capability-interpreter.test.js && node tests/recipe-path-guard.test.js` to the end of the chain. (The chain already runs `npm --prefix mcp run build` mid-chain, so the `errors.ts` TS change is type-checked by `npm test`.)

**`devDependencies`:** already satisfied — the three libs are present (under `dependencies`; see Divergence 1). No `package.json` dependency edit is strictly required.

**Optional:** a `scripts.build:cfworker` standalone command (Divergence 2 / cfworker CREATE section) documenting the IIFE regeneration.

---

### `.github/workflows/ci.yml` — wire the guard into the `extension` job (D-18)

**Exact current step** (`.github/workflows/ci.yml:31-34`, VERIFIED — the `validate:extension` → `npm test` sequence in the `extension` job that feeds `all-green`):
```yaml
      - name: Validate extension (manifest + JS syntax)
        run: npm run validate:extension
      - name: Run extension + bridge contract tests
        run: npm test
```
**`all-green` gate** (`ci.yml:81-86`, VERIFIED): `needs: [extension, mcp-smoke, website]`.

**Phase 26 edit (Claude's-discretion sub-choice, D-18):** the lower-friction path is to **chain the new guard into the existing `validate:extension` script** (so `ci.yml` may need NO edit). Option 1 — `package.json` `scripts.validate:extension` becomes `"node scripts/validate-extension.mjs && node scripts/verify-recipe-path-guard.mjs"` (current value is just `"node scripts/validate-extension.mjs"`, `package.json:30`). Option 2 — add a standalone CI step after line 32:
```yaml
      - name: Verify recipe-path guard (no eval/Function/import on the recipe path)
        run: node scripts/verify-recipe-path-guard.mjs
```
**Recommendation: Option 1** (chain into `validate:extension`) — it keeps the gate in one place, runs locally via `npm run validate:extension`, and requires zero `ci.yml` change (the guard then runs inside the existing `validate:extension` step before `npm test`, exactly as D-18 specifies).

---

## Shared Patterns

### Dual-export IIFE module shell (ALL three new `extension/utils/capability-*.js`)
**Source:** `extension/utils/value-extractor.js` (pure variant) and `extension/utils/trigger-store.js` (version-const variant)
**Apply to:** `capability-recipe-schema.js`, `capability-interpreter.js`, `capability-auth-strategies.js`
```js
(function(global) {
  'use strict';
  // module body
  var exportsObj = { /* public API */ };
  global.FsbCapability<Name> = exportsObj;        // SW importScripts consumer
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                    // node tests require()
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

### Vendored-lib global access guard
**Source:** `extension/ws/ws-client.js:98-99` (`getFSBLZStringCodec`)
**Apply to:** `capability-interpreter.js` (reaching `CfworkerJsonSchema`, `jmespath`)
```js
function get<Name>() { return (typeof <Global> !== 'undefined' && <Global>) ? <Global> : null; }
```

### Typed-error RETURN (never throw)
**Source:** `extension/ws/mcp-tool-dispatcher.js:190-198` (`createMcpOwnershipError`)
**Apply to:** `capability-interpreter.js` (every `RECIPE_*` rejection) + consumed by `mcp/src/errors.ts:104-124`
```js
return { success: false, code, errorCode: code, error: code, ...context };
```

### Zero-framework Node test
**Source:** `tests/trigger-store.test.js` (async runner) / `tests/ownership-error-codes.test.js` (sync `check`) / `tests/verify-store-listing.test.js` (spawn-a-script)
**Apply to:** all three new `tests/capability-*.test.js` + `tests/recipe-path-guard.test.js`
- `passed`/`failed` counters, `process.exit(failed>0?1:0)`, fresh-require via `delete require.cache[...]`, `installChromeMock` from `tests/fixtures/run-task-harness.js` only where a chrome global is touched.

### Node-builtins-only static gate
**Source:** `scripts/verify-store-listing.mjs` (`failures[]`, `safeRead`, `process.exit(1)`-on-fail)
**Apply to:** `scripts/verify-recipe-path-guard.mjs`

### errors.ts verbatim-code passthrough test
**Source:** `tests/mcp-recovery-messaging.test.js:28-31` — `import(mcp/build/errors.js)` then `mapFSBError({success:false, errorCode/code})`, asserting the code is surfaced (lines 99-142 use `code: 'TAB_NOT_OWNED'` etc.)
**Apply to:** an assertion (in `tests/capability-interpreter.test.js` or a small new errors-style suite) that `{success:false, code:'RECIPE_SCHEMA_INVALID'}` is NOT collapsed to `action_rejected`.

---

## No Analog Found

| File | Role | Data Flow | Reason / Mitigation |
|------|------|-----------|---------------------|
| `catalog/recipes/_fixtures/*.json` | JSON test fixtures | file-I/O | No committed JSON-fixture *directory* exists (test data is inline in `tests/*.js`). Synthesize per the pattern above (one accept + one reject per forbidden name + unknown-field + bad-enum). Schema content comes from RESEARCH (the draft schema), not a code analog. |
| The recipe JSON Schema *content* | schema data | — | FSB-authored from RESEARCH (D-06/D-07 closed vocab, `additionalProperties:false`, `format:'uri'` on `origin` only, `pattern` on `endpoint`, four-member `authStrategy` enum, optional `csrf`). No in-repo JSON-Schema analog exists. |
| The `{var}` templater + auth-strategy stub *bodies* | interpreter logic | transform / event-driven | Hand-rolled by design (RHC-safe; RESEARCH "Hand-roll ONLY" line 285). Shells have analogs (`value-extractor.js`); the dispatch/templating logic is from RESEARCH code examples (lines 257-266, 353-363). |

---

## Metadata

**Analog search scope:** `extension/lib/`, `extension/utils/`, `extension/ws/`, `extension/ai/`, `extension/background.js`, `esbuild.config.js`, `scripts/`, `tests/`, `tests/fixtures/`, `mcp/src/`, `.github/workflows/`, `package.json`
**Files read on disk this session:** `extension/utils/trigger-store.js`, `extension/utils/value-extractor.js`, `extension/ws/ws-client.js`, `extension/ws/mcp-tool-dispatcher.js`, `extension/background.js` (1-130), `scripts/validate-extension.mjs`, `scripts/verify-store-listing.mjs`, `esbuild.config.js`, `mcp/src/errors.ts`, `tests/trigger-store.test.js`, `tests/ownership-error-codes.test.js`, `tests/verify-store-listing.test.js`, `tests/mcp-recovery-messaging.test.js`, `tests/fixtures/run-task-harness.js`, `package.json`, `.github/workflows/ci.yml` + `extension/lib/lz-string.min.js` header
**Verified via Bash:** `extension/lib/` listing (3 new libs absent), `catalog/` absent, `node_modules/{@cfworker/json-schema,minisearch,jmespath}` present, whole-tree grep = exactly 3 sanctioned `eval`/`Function`/`import(` hits.
**Pattern extraction date:** 2026-06-19
