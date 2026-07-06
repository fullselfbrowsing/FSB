# Phase 27: Authenticated Fetch Primitive (MAIN-world) + Origin-Pin + Resume-Sidecar - Context

**Gathered:** 2026-06-20 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the riskiest unknown of the v0.9.99 Native Capability Catalog: a **same-origin authenticated `fetch` (cookies / CORS / CSRF / SameSite) issued in the page MAIN world** against **ONE hardcoded recipe**, with **origin-pinning** and **MV3 SW-eviction survival** built into the primitive from day one. This is research Phase **P1 / P-B** (de-risk Decision B first; everything downstream depends on this working).

**In scope (FETCH-01..05):**
- The fixed, bundled page-MAIN-world fetch function injected via the existing `chrome.scripting.executeScript({world:'MAIN', func, args})` seam, carrying first-party HttpOnly/SameSite cookies (FETCH-01).
- Live CSRF scrape in the page from the recipe's `csrfSource` descriptor + threading the declared auth headers (FETCH-02).
- Origin-pin enforcement (recipe bound to origin X may only hit origin X; cross-origin rejected before any side effect) (FETCH-03).
- In-flight survival across SW eviction via the existing `run_task` resume-sidecar; mid-mutation ambiguity is `RECOVERY_AMBIGUOUS`, never blind-retried (FETCH-04).
- A smoke test proving the **logged-in** (not logged-out) data shape returns from the chosen execution context against a real HttpOnly-cookie site (FETCH-05).

**Explicitly NOT in this phase:** the `search_capabilities`/`invoke_capability` MCP tools and dispatcher routing (**Phase 28**); the catalog registry, tiered router, bundled-head handlers, declarative tail, and autopilot parity branch (**Phase 29**); consent governance / origin Off-Ask-Auto / recipe signature verification / audit (**Phase 30**); CDP Network discovery + recipe synthesis + learned recipes (**Phase 31**); self-healing DOM fallback + recipe-rot + re-learn + the 7-provider/schema-lock parity gate (**Phase 32**). Phase 27 runs against ONE hardcoded recipe with no MCP surface, no router, and no consent gate yet.
</domain>

<decisions>
## Implementation Decisions

### Fetch Primitive Location & Module Shape (FETCH-01)
- **D-01:** A NEW `extension/utils/capability-fetch.js` (dual-export IIFE shell mirroring `capability-interpreter.js` / `value-extractor.js`) is the home for the authenticated fetch. It exports (a) `capabilityFetchInPage` — a fully self-contained, dependency-free function passed as the `func` to `chrome.scripting.executeScript({ target:{tabId}, world:'MAIN', func, args:[spec] })`; and (b) an SW-side wrapper `executeBoundSpec(spec, tabId)` that calls `executeScript`, awaits the single `InjectionResult`, and normalizes `{ success, status, data | error, code? }`. The recipe contributes ONLY the bound spec (data) via `args` — never executable code (Wall 1).
- **D-02 (HARD CONSTRAINT):** `capability-fetch.js` MUST be added to `RECIPE_PATH_ALLOWLIST` in `scripts/verify-recipe-path-guard.mjs:84-87` **and** contain ZERO `eval` / `new Function` / `import(`. Check 4 (`verify-recipe-path-guard.mjs:248-281`) enumerates `extension/utils/capability-*.js` from disk and **fails CI closed** (bypass-by-omission) if any such module is absent from the allowlist. The in-page `func` therefore CANNOT use `new Function` even though the legacy `execute_js` seams do — those run user/model-supplied code (a different trust class), not recipe-derived data.
- **D-03:** The in-page `func` is serialization-safe. `chrome.scripting.executeScript` **stringifies the `func` and re-parses it in the page**, so it references NO closure symbols, NO `importScripts` globals (including the vendored `jmespath`), and NO sibling helpers. Everything it needs arrives in `args[0]` (the spec) or is defined inline. (Verified seam: `tool-executor.js:382-394`.)
- **D-04:** The SW injection uses the existing ownership-gated `tabId` the dispatcher / `executeTool` already resolves (`tool-executor.js:665-695`; ownership gate `mcp-tool-dispatcher.js:406-407`), reusing the `execute_js` MAIN-world pattern with a FIXED `func` instead of `eval`. Phase 27 drives ONE hardcoded recipe directly — no MCP tool, no router (Phase 28/29).

### CSRF Live-Scrape & Read-Only Extract (FETCH-02)
- **D-05:** The `csrfSource` descriptor `{ from:'meta'|'cookie'|'response', selector?, header }` (schema at `capability-recipe-schema.js:131-142`; stub default `meta[name=csrf-token]` -> `X-CSRF-Token` at `capability-auth-strategies.js:75-82`) is consumed INSIDE `capabilityFetchInPage`, in the page, BEFORE the request: `meta` -> `document.querySelector(selector).content`; `cookie` -> parse `document.cookie`. The scraped value is threaded into `headers[csrfSource.header]`, then `fetch(url, { method, headers, body, credentials:'include' })`.
- **D-06:** `from:'response'` (a prior in-page GET to source the token) is OUT for the v1 single-recipe proof — it doubles the in-page request surface and the prior GET would itself need origin-pinning. Deferred to **Phase 29**. v1 covers `from:'meta'` (and `from:'cookie'` only if trivially needed).
- **D-07 (auto-resolved — was Unclear):** The read-only `extract` (a JMESPath string the interpreter carries UNEVALUATED per 26-D-14; `capability-interpreter.js:36-38,314`) runs **SW-side, not in-page**: `capabilityFetchInPage` returns the full parsed JSON body (size-capped) to the SW, and the SW runs the already-vendored full `jmespath` global via `getFSBJmespath()` (`capability-interpreter.js:76-78`). Rationale: keeps the in-page func tiny and serialization-safe (D-03) and reuses the real JMESPath engine instead of a hand-rolled subset. The response body crossing the `executeScript` return boundary is the non-secret data the user is fetching (auth material never crosses — it stays in the browser's cookie jar).

### Origin-Pin Enforcement (FETCH-03)
- **D-08:** Origin-pin is enforced at TWO points; three things must agree. (1) Inside `interpretRecipe`, filling the deferred check the schema author pre-flagged (`capability-recipe-schema.js:99-102`; `capability-interpreter.js:128-129`): after templating, re-assert `new URL(spec.url, recipe.origin).origin === recipe.origin` and reject cross-origin / protocol-relative (`//evil.com`) targets with a typed `RECIPE_*` error. (2) Inside the fetch wrapper, immediately before `executeScript`: assert the **active/owned TAB's origin === `spec.origin`** — this is what makes FETCH-01 actually authenticated, because cookies attach only when the page is on `spec.origin`. Both fire BEFORE any side effect.
- **D-09:** The interpreter must FOLD `spec.query` into the final URL BEFORE the pin re-assertion. Today it builds the `query` placement map but does NOT append it to the URL (`capability-interpreter.js:300-312`); the pin must guard the TRUE effective request target so a `{var}`-injected query param cannot re-target the request after validation.

### SW-Eviction Survival & Mid-Mutation Ambiguity (FETCH-04)
- **D-10:** The invoke is wrapped in the existing `run_task` resume-sidecar (`extension/utils/mcp-task-store.js`, `chrome.storage.session` key `fsbRunTaskRegistry`, versioned envelope, `'partial'` status): write an `in_progress` snapshot with `current_step:'BEFORE_API_REQUEST'` (+ `method`, `origin`) BEFORE `executeScript`; on success write a terminal snapshot then delete. REUSE the existing surface (`writeSnapshot` / `readSnapshot` / `deleteSnapshot`) and the `mcp-bridge-client.js` write cadence (subscribe-time + 30s heartbeat + terminal) — do NOT reinvent (PITFALLS Pitfall 7).
- **D-11:** On SW-wake reconciliation, classify by method: a MUTATING method (POST/PUT/PATCH/DELETE) with an in-flight snapshot -> `RECOVERY_AMBIGUOUS`, SURFACED to the caller and NEVER blind-retried; an idempotent GET may be re-issued. This reuses the Lattice ResumePolicy marker taxonomy (`lattice-runtime-adapter.js:263-295`: `BEFORE_API_REQUEST` -> `ON_ERROR_SW_EVICTION_MID_REQUEST`; non-safe marker -> `RECOVERY_AMBIGUOUS`).
- **D-12:** Add `RECOVERY_AMBIGUOUS` to `mcp/src/errors.ts` via the SAME verbatim-passthrough extension point the `RECIPE_*` / `TRIGGER_*` families use (`CODE_ONLY_ERROR_KEYS` `errors.ts:54`; `resolveErrorKey` `errors.ts:100-125`), and RETURN it from the fetch wrapper with BOTH `code` and `errorCode` set (the `createRecipeError` dual-field shape, `capability-interpreter.js:85-93`) so the MCP host can distinguish "ambiguous — ask the user" from a generic rejection. INV-01-safe (no existing tool schema touched).

### Hardcoded Proof Recipe & Smoke Test (FETCH-05)
- **D-13:** The single hardcoded Phase-27 recipe targets `github.com` -> `GET /notifications`, `authStrategy: same-origin-cookie`, stored as a real recipe under the existing `catalog/recipes/` directory (alongside the Phase 26 `_fixtures/`). It is a read-only, idempotent GET on the developer's OWN authenticated session with NO CSRF coupling, so it isolates the cookie-attach mechanic (FETCH-01) from the CSRF-scrape mechanic (FETCH-02). It mirrors the cited OpenTabs `github-api.ts fetchFromPage` archetype.
- **D-14:** The logged-in-vs-logged-out assertion is the DURABLE HTML-level signal, not a brittle JSON field: assert the response is a **200** (not a **302** to `/login?return_to=...`) AND/OR that `<meta name="user-login" content="...">` is **NON-EMPTY** (empty = logged out, username = logged in). GitHub's session rides HttpOnly cookies (`_gh_sess`, `logged_in`; both `HttpOnly; secure; SameSite=Lax`) that JS cannot read — so a logged-in shape is obtainable ONLY via the page-context `credentials:'include'` fetch, which is exactly the property being proven. (Caveat to carry: GitHub's web routes are picky about `Accept: application/json` and increasingly serve embedded-React/Turbo HTML — do NOT over-index on a clean JSON body; the status-flip + `user-login` meta are the version-stable assertions.)
- **D-15:** Test split given no-live-browser CI: a zero-framework `node tests/*.test.js` suite (mirroring `tests/capability-interpreter.test.js` — mocked `chrome.*`, a STUBBED `executeScript` recorder) is the CI gate, asserting the wrapper threads CSRF, pins origin (rejects cross-origin before side effect), wraps the sidecar (writes `BEFORE_API_REQUEST` snapshot), and runs `extract` SW-side against a fixture. The actual logged-in-shape assertion against live `github.com` is a HUMAN-GATED browser UAT recorded as `human_needed` (FSB's established live-browser UAT posture).
- **D-16:** Hold a `github.com` -> `POST /_graphql` `csrf-header-scrape` recipe IN RESERVE as the FETCH-02 exemplar (scrape `input[name="authenticity_token"]` -> `X-CSRF-Token`, add `GitHub-Verified-Fetch: true`), exercised only AFTER the `same-origin-cookie` GET proof (FETCH-01) is green. Anonymous `/_graphql` returns 422 vs authenticated 200 (distinguishable). Do NOT use it for the first proof (it couples CSRF onto the cookie mechanic).

### Claude's Discretion
- Exact internal split between `capabilityFetchInPage` and the SW `executeBoundSpec` wrapper (one file recommended; the no-network charter of the interpreter (26-D-11) must be preserved — the `executeScript` call must NOT live in `capability-interpreter.js`).
- Whether `from:'cookie'` CSRF is wired in v1 or only `from:'meta'` (the hardcoded GET needs neither; planner decides if a minimal cookie path ships now for FETCH-02 readiness).
- The mid-mutation ambiguity code name if the planner prefers `FETCH_RECOVERY_AMBIGUOUS` over the generic `RECOVERY_AMBIGUOUS` (recommended: align with the Lattice marker string `RECOVERY_AMBIGUOUS`).
- The size cap for the response body returned across the `executeScript` boundary for SW-side extract.
- Standalone helper vs inlined logic for the in-page CSRF read (must stay serialization-safe per D-03).

### Folded Todos
None — no pending todos matched Phase 27.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

Research (authoritative, dated 2026-06-19; NB: research uses pre-final slot labels — research "P1 / P-B" == final **Phase 27**):
- `.planning/research/ARCHITECTURE.md` — Section 0 (the load-bearing discovery: FSB already issues authenticated MAIN-world fetch via three `executeScript({world:'MAIN'})` seams); **Decision B** (WHERE the interpreter + fetch run: fetch in page MAIN world, interpreter in SW, CDP discovery-only) at :130-150; **Pattern 1** (structured re-use of the seam; the `capabilityFetchInPage` shape) at :229-247; component table naming `capability-fetch.js` at :198.
- `.planning/research/PITFALLS.md` — **WALL 2** auth capture/replay table (:34-53); **Pitfall 2** (wrong execution context = auth silently absent, :95-127); **Pitfall 3** (credential-replay weapon + origin-pin must also live in the fetch phase, :131-166); **Pitfall 7** (SW eviction mid-call -> reuse `run_task` sidecar + `RECOVERY_AMBIGUOUS`, no blind retry, :286-318); the "Looks Done But Isn't" checklist (:375-399).
- `.planning/research/STACK.md` — `mcp-task-store.js` resume-sidecar, `chrome.storage.session` hot-state discipline, `redactForLog`, zero-dep bias, What-NOT-to-Use.
- `.planning/research/SUMMARY.md` — decision-ready synthesis; risk-first ordering (this phase is the de-risk spine).

Roadmap / requirements / prior context:
- `.planning/ROADMAP.md` — Phase 27 details + Phase 28 boundary; INV-01..04; the two architectural Walls.
- `.planning/REQUIREMENTS.md` — FETCH-01..05 (this phase); SURF-01..06 (Phase 28, for the boundary).
- `.planning/phases/26-recipe-schema-bundled-interpreter-mv3-ci-guard/26-CONTEXT.md` — the LOCKED Phase 26 decisions this phase builds on (D-11 interpreter validate+bind+stop; D-12 auth stubs declare-not-execute; D-14 extract carried unevaluated; D-08 authStrategy enum; D-15 typed RECIPE_* return shape; D-16/17 CI-guard allowlist).

Source anchors (verified on `automation-worktree`, 2026-06-20):
- `extension/utils/capability-interpreter.js` — `interpretRecipe` (validate+bind+emit spec, NO network); deferred origin-pin comment (:128-129); `query` built-but-unappended (:300-312); spec assembly (:305-323); `getFSBJmespath()` (:76-78); `createRecipeError` dual-field (:85-93).
- `extension/utils/capability-auth-strategies.js` — frozen enum registry; `same-origin-cookie` -> `credentials:'include'` (:65-69); `csrf-header-scrape` -> `csrfSource` default (:75-82); `bearer-from-storage` -> `_authNeed` (:70-74).
- `extension/utils/capability-recipe-schema.js` — `origin` pattern + Phase-27 re-assert flag (:95-102); `authStrategy` enum (:112); `csrf` object with `from: enum[meta,cookie,response]` (:131-142).
- `extension/ai/tool-executor.js:374-400` — the `execute_js` MAIN-world `executeScript` seam to re-use (fixed func, not eval); `executeTool` `_route` / tabId resolution (:665-695).
- `extension/ws/mcp-bridge-client.js:908-962` — `_handleExecuteJS` MAIN-world seam; `run_task` / `partial_state` / `sw_evicted` / sidecar cadence plumbing (grep `partial_state`, `sw_evicted`, `sidecar`; :1319-1433 cadence).
- `extension/utils/mcp-task-store.js` — the FETCH-04 resume-sidecar surface (envelope shape at :20-31; `writeSnapshot`/`readSnapshot`/`deleteSnapshot` at :128-167).
- `extension/ai/lattice-runtime-adapter.js:263-295` — ResumePolicy taxonomy (`SAFE` / `ON_ERROR_SW_EVICTION_MID_REQUEST` via `BEFORE_API_REQUEST` marker / `RECOVERY_AMBIGUOUS`).
- `scripts/verify-recipe-path-guard.mjs` — `RECIPE_PATH_ALLOWLIST` (:84-87); Check 4 allowlist-drift fail-closed (:248-281). `capability-fetch.js` MUST be added.
- `mcp/src/errors.ts` — `CODE_ONLY_ERROR_KEYS` (:54); `resolveErrorKey` verbatim passthrough + `RECIPE_*`/`TRIGGER_*` extension point (:100-125). Add `RECOVERY_AMBIGUOUS` here.
- `tests/capability-interpreter.test.js`, `tests/capability-recipe-schema.test.js`, `tests/recipe-path-guard.test.js` — the zero-framework `node tests/*.test.js` convention to clone for FETCH-05's CI-side suite.
- `catalog/recipes/_fixtures/valid-recipe.json` — the existing Phase 26 fixture dir where the hardcoded `github.com` recipe lands.

External research (FETCH-05 target, dated 2026-06-20):
- OpenTabs archetype (read directly): `plugins/github/src/github-api.ts` (`pageJson()` pure-cookie GET; `user-login` meta auth gate; `/_graphql` CSRF), `platform/plugin-sdk/src/fetch.ts` (`fetchFromPage` hardcodes `credentials:'include'`). https://github.com/opentabs-dev/opentabs
- GitHub cookie flags (`_gh_sess`, `logged_in` HttpOnly) + `/notifications` 200-vs-302 — live probes 2026-06-20.
- GitHub Acceptable Use Policy (personal supervised read-only self-access is defensible) — https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **The MAIN-world injection seam** (`tool-executor.js:382-394`, `mcp-bridge-client.js:908-962`): `chrome.scripting.executeScript({target:{tabId}, world:'MAIN', func, args})` — Phase 27 reuses it with a FIXED bundled `func` (not `eval`/`new Function`).
- **Phase 26 interpreter** (`capability-interpreter.js`): emits the bound spec `{ url, method, headers, body, query, authStrategy, csrfSource?, _authNeed?, credentials?, origin, extract }` and stops. Phase 27 consumes that spec; the origin-pin re-assert and `query`-fold slots are pre-marked.
- **Phase 26 auth stubs** (`capability-auth-strategies.js`): the enum -> spec-shaping declarations Phase 27's fetch layer reads (`credentials:'include'`, `csrfSource`, `_authNeed`).
- **`run_task` resume-sidecar** (`mcp-task-store.js` + `mcp-bridge-client.js` cadence): the proven `chrome.storage.session` SW-eviction survival machinery — reuse, do not reinvent (FETCH-04).
- **Lattice ResumePolicy taxonomy** (`lattice-runtime-adapter.js:263-295`): `RECOVERY_AMBIGUOUS` / `BEFORE_API_REQUEST` marker classification for mid-mutation states.
- **Typed-error passthrough** (`mcp/src/errors.ts`): the `RECIPE_*`/`TRIGGER_*` verbatim-surface pattern to extend for `RECOVERY_AMBIGUOUS`.
- **Vendored `jmespath` global** (loaded via `importScripts`, reached by `getFSBJmespath()`): runs the read-only `extract` SW-side (D-07).
- **Zero-framework test convention** (`tests/capability-*.test.js`): stubbed `executeScript` recorder + mocked `chrome.*` for the CI-side smoke suite.

### Established Patterns
- **Dual-export IIFE module shell** (interpreter/auth-strategies/value-extractor): the shape for the new `capability-fetch.js` — global for the SW `importScripts`, `module.exports` for Node tests.
- **`executeScript` func serialization:** the `func` is stringified + re-parsed in the page; it must be fully self-contained (D-03) — no closure/global/helper references.
- **Page-context = authenticated, SW-context = anti-pattern:** a background-SW `fetch()` is extension-origin (cross-origin -> CORS + SameSite withheld); the page MAIN world rides first-party HttpOnly cookies (Wall 2 / Pitfall 2).
- **CI-guard allowlist is fail-closed:** any new `extension/utils/capability-*.js` absent from `RECIPE_PATH_ALLOWLIST` reds CI (Check 4) — additive registration is mandatory.
- **Auth material stays in the browser:** FSB never reads the cookie; only the response data (non-secret) crosses the `executeScript` boundary back to the SW.

### Integration Points
- `extension/utils/capability-fetch.js` (NEW) — the in-page `func` + SW `executeBoundSpec` wrapper.
- `extension/utils/capability-interpreter.js` (MODIFIED) — fold `query` into URL + enforce origin-pin re-assertion (the pre-marked Phase-27 slots).
- `extension/background.js` (MODIFIED) — additive `importScripts('utils/capability-fetch.js')`.
- `scripts/verify-recipe-path-guard.mjs` (MODIFIED) — add `capability-fetch.js` to `RECIPE_PATH_ALLOWLIST`.
- `mcp/src/errors.ts` (MODIFIED) — add `RECOVERY_AMBIGUOUS` to the typed-passthrough set.
- `extension/utils/mcp-task-store.js` (REUSE) — write/read `BEFORE_API_REQUEST` snapshots around the invoke.
- `catalog/recipes/*.json` (NEW) — the hardcoded `github.com` GET proof recipe (+ reserved `/_graphql` CSRF exemplar).
- `tests/*.test.js` + root `package.json` `scripts.test` (MODIFIED) — the FETCH-05 CI-side suite.
</code_context>

<specifics>
## Specific Ideas

- **FETCH-05 target locked:** `github.com` -> `GET /notifications`, `authStrategy: same-origin-cookie`, assert `<meta name="user-login">` NON-EMPTY (or 200-not-302). Session rides HttpOnly `_gh_sess`/`logged_in` cookies unreadable by JS — proving the page-context `credentials:'include'` value. NO CSRF on this GET (isolates the cookie mechanic).
- **FETCH-02 exemplar reserved:** `github.com` -> `POST /_graphql`, `csrf-header-scrape` (scrape `input[name=authenticity_token]` -> `X-CSRF-Token`), exercised only after FETCH-01 is green.
- **Serialization trap (drives D-03):** the `executeScript` `func` is stringified into the page — a closure/global reference (e.g. the `jmespath` global) throws `ReferenceError` against real sites only, passing unit tests that stub `executeScript`. This is why `extract` runs SW-side (D-07), not in-page.
- **CI fail-closed trap (drives D-02):** a new `capability-*.js` not added to the allowlist reds CI by omission; the wrong "fix" is routing the fetch through the legacy `eval`-based `execute_js` seam — which silently violates Wall 1. The right fix is allowlist registration + a dynamic-code-free file.
- **Origin-pin is two checks, not one:** interpreter self-consistency (`endpoint`-origin == `recipe.origin`) AND fetch-wrapper session-correctness (active-tab origin == `spec.origin`). The first alone permits "right URL, wrong tab/session."
- **Mutation safety:** never blind-retry a POST/PUT/PATCH/DELETE after an ambiguous eviction — surface `RECOVERY_AMBIGUOUS`. The first proof recipe is a GET precisely to keep the happy path idempotent.
</specifics>

<deferred>
## Deferred Ideas

- **`from:'response'` CSRF sourcing** (a prior in-page GET to mint the token) — OUT of v1; doubles the in-page request surface + needs its own pin. Revisit in **Phase 29**.
- **`POST /_graphql` CSRF exemplar wiring** — reserved as the FETCH-02 proof but only after the `same-origin-cookie` GET is green (still within Phase 27 if time allows; otherwise an early Phase 29 item).
- **Consent gate / per-origin Off-Ask-Auto** around the invoke — **Phase 30** (Phase 27's hardcoded recipe runs ungated, which is why origin-pin must hold even on an un-governed path).
- **MCP `invoke_capability` surface + router + autopilot parity** — **Phase 28 / 29**; Phase 27 calls the primitive directly against the one recipe.
- **CDP Network discovery / learned recipes** — **Phase 31**.
- **Recipe-rot detection + self-healing DOM fallback + 7-provider parity gate** — **Phase 32**.

### Reviewed Todos (not folded)
None — no pending todos matched Phase 27.
</deferred>
