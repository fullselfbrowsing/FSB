# Phase 26: Recipe Schema + Bundled Interpreter + MV3 CI Guard - Context

**Gathered:** 2026-06-19 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the **closed-vocabulary recipe-as-data format** and the **fixed, eval-free bundled interpreter**, plus a **CI guard** that makes the Wall-1 "no code fetched as data" line unbreakable *before any recipe is ever interpreted*. This is the foundational Wall-1 day-one invariant of the v0.9.99 Native Capability Catalog milestone.

**In scope (CAP-01..05):** versioned recipe JSON Schema; the bundled interpreter that validates + binds recipe data to a closed enum of auth-strategy handlers (producing a ready-to-execute request spec); eval-free in-SW validation via `@cfworker/json-schema`; the CI guard; vendoring the three new libs into the extension package with no manifest/permission change.

**Explicitly NOT in this phase:** the authenticated MAIN-world `fetch`, live CSRF scrape, origin-pin enforcement against a live request, and SW-eviction resume — those are **Phase 27 (FETCH-01..05)**. The `search_capabilities`/`invoke_capability` MCP tools are **Phase 28**. Tiering/router/bundled-head/autopilot are **Phase 29**. Consent/signing/audit are **Phase 30**.
</domain>

<decisions>
## Implementation Decisions

### Library Integration & Packaging
- **D-01:** Use **PATH A** — vendor `minisearch`, `jmespath`, and `@cfworker/json-schema` into `extension/lib/` as global UMD/IIFE files loaded via `importScripts(...)` in the service worker, mirroring `extension/lib/lz-string.min.js`. Access them in the SW via `typeof <Global> !== 'undefined'` checks (the `getFSBLZStringCodec()` / `ws-client.js:98-99` pattern).
- **D-02:** `minisearch` (ships UMD `dist/umd`) and `jmespath` (single UMD `jmespath.js`) vendor **as-is**. `@cfworker/json-schema` is ESM/CJS-only and **must** be converted by a one-off build-time `esbuild --bundle --format=iife --global-name=...` of the local `node_modules` copy into `extension/lib/cfworker-json-schema.min.js`. (Decisive reason: a raw-ESM file dropped in `lib/` fails the existing `scripts/validate-extension.mjs` `node --check` gate — empirically confirmed — and would break CI.)
- **D-03:** All **three** libraries ship in Phase 26 to satisfy CAP-05 ("interpreter + the three new libraries ship inside the extension package"), even though only `@cfworker/json-schema` (validation) and `jmespath` (extract) are *exercised* here. `minisearch` is vendored now but not wired until Phase 28 (search).
- **D-04:** `url-template` is **OUT for v1** — endpoint templating uses a hand-rolled `{var}` replacer.
- **D-05:** **No manifest/permission change.** The only edit to the service worker entry is additive `importScripts('lib/...')` line(s) — consistent with the `lz-string` precedent and with the esbuild SW byte-freeze invariant (`esbuild.config.js`; `background.js` is not an esbuild input).

### Recipe Schema (Closed Vocabulary)
- **D-06:** A recipe is a **versioned JSON object** with a **closed** top-level vocabulary: `schemaVersion`, `id`/`slug`, `origin`, `endpoint` (URI template), `method` (enum: GET/POST/PUT/PATCH/DELETE), `authStrategy` (closed enum, see D-08), `params` (nested JSON-Schema validated against invoke args), `request` (static param→placement map: query/header/body), and `extract` (a single read-only JMESPath string).
- **D-07:** **No executable/script fields, ever.** Forbidden field names that must be actively rejected and CI-guarded: `script`, `expr`, `transform`, `code`, `fn`, `js`. Any field outside the closed vocabulary → typed rejection (D-15).
- **D-08:** `authStrategy` v1 enum members: `same-origin-cookie`, `csrf-header-scrape`, `bearer-from-storage`, `none`. **(OPEN — resolve in the plan-time schema spike:** whether `persisted-query-hash` and/or a Slack-style split-token strategy join v1 now, or defer to the bundled-handler head in Phase 29. Default = defer.)
- **D-09:** **Pagination is OUT of the v1 schema** (no requirement behind it; adding cursor loops edges toward the Wall-1 "interpreter" line).
- **D-10:** Schema versioning via the `schemaVersion` envelope field, mirroring the existing `FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION` idiom in `extension/utils/trigger-store.js`.

### Interpreter Scope (Phase 26 ↔ Phase 27 boundary)
- **D-11:** The Phase 26 interpreter **validates** (recipe + invocation params, in the SW, via `@cfworker/json-schema`) and **binds** recipe data to the selected auth-strategy handler, producing a **bound, ready-to-execute request spec** `{ url, method, headers, body, authStrategy, csrfSource? }`. It **does NOT perform the network call.**
- **D-12:** Auth-strategy handlers in Phase 26 are **header/spec-shaping stubs** — they declare what header/CSRF source each strategy needs and shape the spec. The actual cookie-carrying MAIN-world fetch + live CSRF scrape are **Phase 27 (FETCH-01/02)**.
- **D-13:** Validation is **eval-free**: `@cfworker/json-schema` only — never Ajv default codegen (`new Function` under MV3 CSP), never `eval`/`new Function`/`import()` on a recipe field.
- **D-14:** The `extract` (JMESPath) field is **defined and schema-validated** in Phase 26; the `jmespath` lib is vendored and the extract helper may be unit-tested against a **static JSON fixture**. Extraction against a *live* response runs in Phase 27 (after the fetch exists).

### CI Guard & Typed Errors
- **D-15:** Typed-error shape for schema/opcode rejection: the interpreter **returns** (does not throw) `{ success: false, code: 'RECIPE_SCHEMA_INVALID' | 'RECIPE_UNKNOWN_FIELD' | 'RECIPE_OPCODE_INVALID', ...context }`, surfaced by adding the `RECIPE_*` family to `mcp/src/errors.ts` (the `CODE_ONLY_ERROR_KEYS` set / verbatim-passthrough regex, mirroring the `TRIGGER_*` extension point).
- **D-16:** A **new Node static-analysis guard** (e.g. `scripts/verify-recipe-path-guard.mjs`) that (1) grep/regex-scans a **recipe-path file allowlist** for the literal patterns `eval`, `new Function`, `import(` and fails non-zero on any hit; and (2) runs the recipe JSON Schema against **accept/reject fixtures** to prove unknown fields/opcodes are rejected.
- **D-17:** "The recipe path" is delimited by an **explicit hardcoded file allowlist** (interpreter, schema module, auth-strategy handler module, vendored runtime libs) — **NOT** a whole-`extension/` grep — to avoid false-positives on FSB's **sanctioned** `execute_js` primitive (`extension/ai/tool-executor.js:382`, `extension/ws/mcp-bridge-client.js:915` intentionally use `new Function` in MAIN world; different trust class).
- **D-18:** The guard hooks into the existing gate: added to / chained after `npm run validate:extension`, which runs in `.github/workflows/ci.yml`'s `extension` job **before** `npm test` and feeds the `ci / all-green` status check.

### Tests
- **D-19:** Plain CommonJS `node tests/*.test.js` files appended to the root `package.json` `scripts.test` `&&`-chain — **no test framework** — mirroring `tests/trigger-store.test.js` (absolute-path module load + `chrome.*`/global shims). Three suites: (a) schema accept/reject fixtures (valid passes; `script`/unknown-field recipes rejected with the typed `RECIPE_*` code), (b) interpreter binding (valid recipe → expected bound spec, asserting it **stops before the network**), (c) eval-free guard self-test (a planted-`eval` fixture is flagged).

### Claude's Discretion
- The standalone-script vs extend-`validate-extension.mjs`-in-place sub-choice for the CI guard (D-16/D-18) — either is acceptable; planner picks the lower-friction option.
- Exact new-file names/locations within established conventions (interpreter/schema/handlers expected under `extension/utils/`, alongside `trigger-store.js`; declarative recipe data under a `catalog/recipes/*.json`-style path if any sample recipes are shipped for fixtures).
- esbuild flags for the one-off `@cfworker` IIFE bundle (`platform: browser`, `target: chrome120`, matching existing entries).

### Folded Todos
None — no pending todos matched Phase 26.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

Research (authoritative, dated 2026-06-19; NB: research uses pre-final phase numbers — "Phase 25" in research == final **Phase 26**):
- `.planning/research/STACK.md` — library decisions, PATH A vs PATH B, the five-question answers, Integration Points table (file:line anchors), What-NOT-to-Use (Ajv codegen, JSONata-in-recipes, zod@4, SW `fetch`).
- `.planning/research/PITFALLS.md` — Wall-1 code-vs-data table, Pitfall 1 (recipe-as-code ban + CI-guard guidance + forbidden field names), the "looks done but isn't" checklist.
- `.planning/research/ARCHITECTURE.md` — component layout (`utils/capability-*.js`, `catalog/recipes/*.json`), Decision B (interpreter-in-SW / fetch-in-MAIN split), Anti-Pattern 3 (the `eval` trust-class distinction the CI guard must respect).
- `.planning/research/SUMMARY.md` — decision-ready synthesis; Research Flags (schema-design + RHC-line spike); Gaps to Address (PATH A vs B left to this phase).

Roadmap / requirements:
- `.planning/ROADMAP.md` — Phase 26 + Phase 27 details (the scope boundary), INV-01..04, the two architectural Walls.
- `.planning/REQUIREMENTS.md` — CAP-01..05 (Phase 26), FETCH-01..05 (Phase 27, for the boundary).

Source anchors (real tree under `extension/`; the `.planning/codebase/*.md` maps are stale, dated 2026-02-03):
- `extension/background.js:97` (`importScripts('lib/lz-string.min.js')` precedent) + the importScripts block.
- `extension/ws/ws-client.js:98-99` (global-access pattern `typeof LZString !== 'undefined'`).
- `scripts/validate-extension.mjs` (static CI gate; `EXT_DIRS` ~line 79 — `lib/` included, `dist/` excluded; per-file `node --check`).
- `.github/workflows/ci.yml` (`extension` job runs `validate:extension` → `npm test`; `all-green` gate `needs:[extension, mcp-smoke, website]`).
- `mcp/src/errors.ts:54-68` (`CODE_ONLY_ERROR_KEYS`) and `:104-124` (`resolveErrorKey` verbatim passthrough + `TRIGGER_*` regex extension point).
- `extension/ws/mcp-tool-dispatcher.js:1063` (typed `{ code:'TAB_NOT_OWNED', ... }` return shape) + `tests/ownership-error-codes.test.js`.
- `tests/trigger-store.test.js` (the `node tests/*.test.js` convention to clone) + root `package.json` `scripts.test`/`scripts.ci`.
- `esbuild.config.js` (D-17 SW byte-freeze header; per-entry `platform:browser`/`target:chrome120`/`format:iife` precedent for the PATH-A one-off `@cfworker` bundle).
- `extension/manifest.json` (no explicit `content_security_policy` → MV3 default `script-src 'self'` → the eval ban that mandates `@cfworker/json-schema` over Ajv).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Vendored-lib precedent:** `extension/lib/{lz-string,chart,marked,purify,mermaid,gpt-tokenizer}.min.js` loaded via `importScripts` and read as globals — the exact pattern for the three new libs.
- **Static CI gate:** `scripts/validate-extension.mjs` already greps + `node --check`s `lib/` and source dirs and exits non-zero on first failure — the model (and likely host) for the new recipe-path guard.
- **Typed-error convention:** dispatcher handlers return `{ success:false, code, ...context }`; `mcp/src/errors.ts` surfaces `code`/`errorCode` verbatim (the `TRIGGER_*` regex at errors.ts:122 is the copy-target for `RECIPE_*`).
- **Test harness:** `tests/trigger-store.test.js` / `tests/ownership-error-codes.test.js` show the zero-framework `node tests/*.test.js` + global-shim + typed-`{code}` convention.
- **esbuild per-entry browser IIFE** config exists for the one-off `@cfworker` bundle.
- **`jsonSchemaToZod` bridge** (`mcp/src/tools/schema-bridge.ts`) — awareness only; used when the MCP tools land in Phase 28, not Phase 26.

### Established Patterns
- The SW loads vendored libs **only from `lib/`** (and source dirs) via `importScripts` — it imports **nothing from `extension/dist/`** today (dist is content/offscreen/sidepanel bundles consumed via `<script>`). This is why PATH A (lib/) wins over PATH B (dist/).
- `extension/background.js` is **not an esbuild input** (byte-freeze); changes to it are limited to additive `importScripts` lines.
- Envelope-version idiom (`FSB_*_PAYLOAD_VERSION`) for versioned persisted data → mirrored by recipe `schemaVersion`.
- `validate-extension.mjs` runs `node --check` over `lib/` → any non-CJS/non-global file there breaks CI (forces the `@cfworker` IIFE bundle).

### Integration Points
- `extension/background.js` — additive `importScripts('lib/...')` line(s) for the three libs + the interpreter/handler/schema SW modules.
- `extension/lib/` — new vendored `.min.js` (incl. the built `cfworker-json-schema.min.js`).
- `extension/utils/` — new `capability-interpreter.js`, recipe-schema module, auth-strategy handler module (alongside `trigger-store.js`).
- `esbuild.config.js` — one-off `@cfworker` → IIFE bundle (PATH A).
- `scripts/verify-recipe-path-guard.mjs` (new) + `package.json` `scripts` + `.github/workflows/ci.yml` — CI guard wiring.
- `mcp/src/errors.ts` — new `RECIPE_*` typed codes.
- `package.json` `scripts.test` — new `node tests/*.test.js` entries.
</code_context>

<specifics>
## Specific Ideas

- **Decisive empirical finding (drives D-02):** a raw-ESM file dropped into `extension/lib/` **fails** `scripts/validate-extension.mjs`'s `node --check` walk, whereas global-var UMD/IIFE libs pass — so `@cfworker/json-schema` must be IIFE-bundled before vendoring, not dropped in raw.
- **Forbidden recipe field names (CI-guarded + schema-rejected):** `script`, `expr`, `transform`, `code`, `fn`, `js`.
- **CI-guard scope must be an allowlist, not whole-tree** — FSB's `execute_js` legitimately uses `new Function`/`eval` in MAIN world; a broad grep would break the build on sanctioned code.
</specifics>

<deferred>
## Deferred Ideas

- **`url-template` (RFC 6570 query/explode)** — only if the long tail later needs `{?state,labels}`-style templating; v1 uses a hand-rolled `{var}` replacer.
- **Pagination in the recipe schema** — deferred from v1.
- **`persisted-query-hash` / Slack-style split-token auth strategies** — likely deferred to the bundled imperative-handler head (Phase 29); revisit in the Phase 26 schema-design spike before locking the v1 `authStrategy` enum.

### Reviewed Todos (not folded)
None — no pending todos matched Phase 26.
</deferred>
