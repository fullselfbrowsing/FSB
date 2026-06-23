---
phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard
verified: 2026-06-20T05:20:00Z
status: passed
score: 4/4 success criteria verified (5/5 requirements CAP-01..05; all must_haves verified)
overrides_applied: 0
re_verification:
  previous_status: null
  note: "Initial verification — no prior VERIFICATION.md existed"
---

# Phase 26: Recipe Schema + Bundled Interpreter + MV3 CI Guard — Verification Report

**Phase Goal:** Establish the closed-vocabulary recipe-as-data format and the fixed bundled interpreter, with a CI guard that makes the Wall-1 "no code fetched as data" line unbreakable BEFORE any recipe is ever interpreted.

**Verified:** 2026-06-20T05:20:00Z
**Status:** passed
**Re-verification:** No — initial verification
**Method:** Goal-backward. Each ROADMAP success criterion was confirmed TRUE in the actual codebase by reading the source modules and executing the test suites / CI guard in this verifier's own process — not by trusting SUMMARY.md claims.

## Goal Achievement

### ROADMAP Success Criteria

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | A versioned JSON Schema defines a recipe as pure data (no executable/script fields); any out-of-vocabulary field rejected with a typed error | VERIFIED | `extension/utils/capability-recipe-schema.js`: `additionalProperties:false` at top level (L78), `request` (L101) and `csrf` (L115); `schemaVersion` is a `const` (L82) = `FSB_RECIPE_SCHEMA_VERSION=1`; closed `method`/`authStrategy` enums (L92/L94); forbidden-name pre-scan over `['script','expr','transform','code','fn','js']` (L66, L168) → typed `RECIPE_UNKNOWN_FIELD`; `format:'uri'` only on `origin`, `endpoint` uses `pattern:'^/'` (Pitfall 4). `node tests/capability-recipe-schema.test.js` → **25/25 passed, 0 failed** (valid accepted; all 6 forbidden names + unknown field → RECIPE_UNKNOWN_FIELD; bad method/authStrategy → RECIPE_OPCODE_INVALID; bad schemaVersion → RECIPE_SCHEMA_INVALID; both `code` and `errorCode` set). |
| 2 | Bundled interpreter binds a valid recipe to a closed enum of bundled auth-strategy handlers, validates via `@cfworker/json-schema` in the SW, never eval/new Function/import(), and STOPS before any network call | VERIFIED | `extension/utils/capability-interpreter.js` `interpretRecipe` delegates to `validateRecipe` (L213), validates invoke args via a fresh `CfworkerJsonSchema.Validator` (L223/L227), templates `{var}` with `encodeURIComponent` (L107/L111), binds via `capability-auth-strategies.js` frozen 4-member registry (L261), carries `extract` unevaluated (L257). cfworker bundle exercised directly = a REAL validator (`{a:1}`→valid, `{a:2}`/`{b:9}`→invalid). Static scan: 0 `eval(`/`new Function`/`import(` AND 0 `fetch(`/`chrome.scripting` in all 3 capability modules. `node tests/capability-interpreter.test.js` → **26/26 passed, 0 failed**, including the load-bearing no-network proof: `chrome.scripting.executeScript` recorder = 0 calls and `globalThis.fetch` recorder = 0 calls across the whole suite (test L74-86, L187-190). All 4 auth strategies shape the spec correctly (none unchanged / credentials:'include' / _authNeed / csrfSource). |
| 3 | Build fails (CI guard) on any eval/new Function/import( reachable from the recipe path AND on out-of-vocabulary recipes; chained into validate:extension | VERIFIED | `scripts/verify-recipe-path-guard.mjs`: hardcoded 6-file `RECIPE_PATH_ALLOWLIST` (L78), 3 word-boundary forbidden patterns (L99-103), fixture run asserting accept/reject (L142-228), negative self-assertion that the 3 sanctioned `execute_js` sites are NOT on the allowlist (L90, L231). `node scripts/verify-recipe-path-guard.mjs` → exit 0, PASS line. `node tests/recipe-path-guard.test.js` → **5/5 passed**: clean tree → exit 0; planted-eval file via the `FSB_RECIPE_GUARD_EXTRA_ALLOWLIST` seam → exit non-zero, names the planted file + the forbidden construct. `npm run validate:extension` → exit 0 and runs BOTH `validate-extension.mjs` (266 JS files clean) AND the guard. `package.json scripts.validate:extension` = `"...validate-extension.mjs && node scripts/verify-recipe-path-guard.mjs"`. `git diff .github/workflows/ci.yml` empty across Phase 26 (D-18: chained via the existing validate:extension step). |
| 4 | Interpreter + three libs ship inside the extension package; no remotely-hosted code, no manifest/permission change | VERIFIED | `extension/lib/{cfworker-json-schema,minisearch,jmespath}.min.js` all exist and pass `node --check` as classic scripts; cfworker is an IIFE (`var CfworkerJsonSchema`, eval-free). `extension/background.js` L119-122, L133-134 = 6 additive `importScripts` lines (3 libs + 3 modules), each try/catch-wrapped, libs-before-modules. All code is vendored (bundled) — no runtime code fetch. `git diff extension/manifest.json` = **0 lines (UNCHANGED)**. `package.json scripts.build:cfworker` documents the esbuild one-off regeneration. |

**Score: 4/4 ROADMAP success criteria VERIFIED.**

### Requirements Coverage (CAP-01..05)

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CAP-01 | 26-01 | Versioned recipe-as-data JSON Schema, no executable/script fields | SATISFIED | SC#1; `capability-recipe-schema.js` + 25/25 schema suite |
| CAP-02 | 26-02 | Bundled interpreter binds to closed auth-strategy enum, never eval/new Function/import() | SATISFIED | SC#2; `capability-interpreter.js` + `capability-auth-strategies.js` (frozen 4-key registry) + 26/26 interpreter suite no-network proof |
| CAP-03 | 26-02 | Recipes + invoke params validated in SW by eval-free validator; invalid/unknown-opcode → typed error | SATISFIED | SC#2; `interpretRecipe` step-2 args validation → RECIPE_SCHEMA_INVALID; `bindAuthStrategy` unknown → RECIPE_OPCODE_INVALID; RECIPE_* surfaces verbatim via `mcp/src/errors.ts` (proven in-suite, not collapsed to action_rejected) |
| CAP-04 | 26-03 | CI guard fails build on eval/new Function/import( on recipe path AND out-of-vocabulary recipes | SATISFIED | SC#3; `verify-recipe-path-guard.mjs` + 5/5 spawn test (planted-eval flips red) + chained into validate:extension |
| CAP-05 | 26-01 | Interpreter + 3 libs ship in extension package; no remotely-hosted code, no manifest/permission change | SATISFIED | SC#4; 3 vendored libs node --check clean + additive importScripts + manifest 0-diff |

All 5 plan-declared requirement IDs map to delivered, verified implementation. No ORPHANED requirements (REQUIREMENTS.md maps exactly CAP-01..05 to Phase 26; all 3 plans' frontmatter cover them: 26-01=[CAP-01,CAP-05], 26-02=[CAP-02,CAP-03], 26-03=[CAP-04]). REQUIREMENTS.md traceability already marks all five `Complete`.

### Invariants & Phase Boundary

| Check | Status | Evidence |
|-------|--------|----------|
| INV-01: no existing MCP tool schema changed (only RECIPE_* passthrough added) | VERIFIED | `git diff e577cf0d^..HEAD -- mcp/` lists ONLY `mcp/src/errors.ts`; the change is the single `RECIPE_.+` token added to the verbatim-passthrough regex (errors.ts:129) + explanatory comment. No `TOOL_REGISTRY` / tool schema touched. |
| INV-04: `extension/ai/agent-loop.js` untouched | VERIFIED | `git diff HEAD -- extension/ai/agent-loop.js` = 0 lines. |
| Phase 26/27 boundary: NO authenticated fetch / live CSRF scrape implemented | VERIFIED | `credentials:'include'`, `_authNeed`, and the csrf default in `capability-auth-strategies.js` are spec-shaping DECLARATIONS in stubs (D-12) — no I/O; interpreter test proves fetch + executeScript = 0 calls. The cookie-carrying fetch, live scrape, origin-pin, and extract RUN remain Phase 27 (FETCH-01..05). |
| D-18: `.github/workflows/ci.yml` unchanged | VERIFIED | `git diff e577cf0d^..HEAD -- .github/workflows/ci.yml` empty — guard runs via the existing `validate:extension` step. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `extension/lib/cfworker-json-schema.min.js` | Eval-free validator IIFE (global CfworkerJsonSchema) | VERIFIED | 46 KB; `var CfworkerJsonSchema`; node --check clean; exercised as a real validator (const + additionalProperties enforced) |
| `extension/lib/minisearch.min.js` | Vendored UMD (CAP-05; wired Phase 28) | VERIFIED | 86 KB; node --check clean; on the guard allowlist; intentional vendor-now/wire-later (not a data stub) |
| `extension/lib/jmespath.min.js` | Vendored UMD (lowercase global) for read-only extract | VERIFIED | 58 KB; node --check clean |
| `extension/utils/capability-recipe-schema.js` | RECIPE_SCHEMA + version + validateRecipe (typed RECIPE_*) | VERIFIED | Dual-export IIFE; exports RECIPE_SCHEMA, FSB_RECIPE_SCHEMA_VERSION, validateRecipe; correct error-mapping order |
| `extension/utils/capability-auth-strategies.js` | Frozen 4-member AUTH_HANDLERS + bindAuthStrategy | VERIFIED | `Object.freeze` keyed by exactly the 4 enum members; spec-shaping stubs; typed unknown-strategy rejection |
| `extension/utils/capability-interpreter.js` | validate-bind-emit-spec, stops before network | VERIFIED | Exports interpretRecipe; reuses validateRecipe + bindAuthStrategy; emits bound spec; no fetch/chrome.scripting |
| `scripts/verify-recipe-path-guard.mjs` | Allowlist grep + fixture run + negative self-assertion | VERIFIED | 6-file hardcoded allowlist; 3 forbidden patterns; fixture accept/reject proof; sanctioned-site exclusion; test seam |
| `catalog/recipes/_fixtures/*.json` | 10 accept/reject fixtures shared by suite + guard | VERIFIED | valid-recipe + 6 forbidden-name + unknown-field + bad-method + bad-authstrategy; all valid JSON; substantive |
| `tests/capability-recipe-schema.test.js` | CAP-01 accept/reject suite | VERIFIED | 25 assertions, all green |
| `tests/capability-interpreter.test.js` | CAP-02/03 binding + no-network proof | VERIFIED | 26 assertions, all green; real fetch/executeScript recorders at 0 |
| `tests/recipe-path-guard.test.js` | CAP-04 clean-PASS + planted-eval-FAIL spawn test | VERIFIED | 5 assertions, all green |
| `mcp/src/errors.ts` | RECIPE_.+ in verbatim-passthrough regex | VERIFIED | Line 129 regex includes `RECIPE_.+`; single one-line change + comment |
| `extension/background.js` | Additive importScripts for 3 libs + 3 modules | VERIFIED | 6 try/catch importScripts lines; manifest untouched |
| `extension/manifest.json` | UNCHANGED | VERIFIED | 0 diff lines |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| background.js | lib/cfworker-json-schema.min.js | importScripts | WIRED | L121 present |
| capability-recipe-schema.js | CfworkerJsonSchema.Validator | typeof-guarded global accessor | WIRED | getFSBRecipeValidator L139-144 |
| capability-interpreter.js | capability-recipe-schema.js | validateRecipe reuse | WIRED | L213 delegation; no re-implementation |
| capability-interpreter.js | capability-auth-strategies.js | bindAuthStrategy dispatch | WIRED | L261 |
| mcp/src/errors.ts | RECIPE_ family | verbatim-passthrough regex | WIRED | L129; proven by in-suite mapFSBError assertions (RECIPE_SCHEMA_INVALID / RECIPE_OPCODE_INVALID surfaced verbatim) |
| package.json validate:extension | verify-recipe-path-guard.mjs | &&-chained | WIRED | Confirmed; npm run validate:extension exit 0 runs both |
| verify-recipe-path-guard.mjs | catalog/recipes/_fixtures | accept/reject validation | WIRED | Check 2 runs validateRecipe over all fixtures |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Schema accept/reject closed-vocabulary enforcement | `node tests/capability-recipe-schema.test.js` | 25 passed, 0 failed | PASS |
| Interpreter binding + no-network boundary | `node tests/capability-interpreter.test.js` | 26 passed, 0 failed; fetch=0, executeScript=0 | PASS |
| CI guard clean PASS + planted-eval FAIL | `node tests/recipe-path-guard.test.js` | 5 passed, 0 failed | PASS |
| CI guard on the live clean tree | `node scripts/verify-recipe-path-guard.mjs` | exit 0, PASS line | PASS |
| Full extension gate (now includes the guard) | `npm run validate:extension` | exit 0; 266 JS clean + guard PASS | PASS |
| cfworker is a real (non-stub) validator | inline vm-load + validate | const + additionalProperties enforced | PASS |
| node --check all 6 recipe-path files | `node --check` each | all OK (classic-script parse) | PASS |

### Probe Execution

Not applicable — Phase 26 uses zero-framework `node tests/*.test.js` suites and a `scripts/verify-recipe-path-guard.mjs` static gate (all executed above), not `scripts/*/tests/probe-*.sh` probes. The functional equivalents (the guard + the three suites) were run in this verifier's own process and recorded.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | No TODO/FIXME/XXX/HACK/PLACEHOLDER debt markers and no hollow stubs found in the recipe-path files. The 4 auth-strategy "stubs" are intentional Phase-26/27 spec-shaping declarations (D-12), not data stubs — they shape a real spec consumed downstream and no consumer receives placeholder data. `minisearch` is a deliberate vendor-now/wire-later CAP-05 artifact (wired Phase 28), covered by the guard allowlist now. |

### Human Verification Required

None. All Phase 26 behavior is automatable: the network (authenticated fetch / live CSRF scrape against a real site) is explicitly Phase 27 (FETCH-01..05). Every success criterion was confirmed by executable tests / the CI guard / static diffs in this verifier's process. No visual, real-time, or external-service behavior is in scope for this phase.

### Gaps Summary

No gaps. All 4 ROADMAP success criteria are observably TRUE in the codebase; all 5 requirements (CAP-01..05) are delivered and verified; all PLAN must_haves (truths, artifacts, key_links) across the 3 plans hold; INV-01 and INV-04 are honored; the Phase 26/27 boundary is intact (interpreter emits a spec and stops — fetch and executeScript proven at 0 calls); the CI guard is genuinely chained into `npm run validate:extension` and flips red on a planted-eval. The Wall-1 "no code fetched as data" line is mechanically enforced at schema-time, interpret-time, and build-time before any recipe is ever interpreted.

One cosmetic note (not a defect): the interpreter test prints `valid recipe + valid args -> { success:true } (got undefined)` — the assertion itself checks `okResult.success === true` (test L115) and PASSES; the log string prints `okResult.code`, which is correctly `undefined` on a success result. No behavior bug.

---

_Verified: 2026-06-20T05:20:00Z_
_Verifier: Claude (gsd-verifier)_
