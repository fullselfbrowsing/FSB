# Technology Stack — v0.9.99 Native Capability Catalog (FSB API Execution)

**Project:** FSB (Full Self-Browsing)
**Milestone:** v0.9.99 — Native Capability Catalog (authenticated-API execution as a fast path alongside DOM automation)
**Domain:** MV3 Chrome-extension capability runtime — call a service's real web API through the user's authenticated browser session (the OpenTabs idea), with zero plugin installs and no MCP tool bloat.
**Researched:** 2026-06-19
**Confidence:** HIGH

> **Note:** This file supersedes the prior v0.11.0 STACK research (Trigger Tool). The earlier
> v0.11.0 notes are recoverable from git history / the v0.11.0 milestone archive.

---

## Executive Summary

> **TL;DR for the roadmapper.** This milestone needs **almost no new heavyweight stack.** FSB already
> has the authenticated-fetch primitive (`chrome.scripting.executeScript({world:'MAIN'})` running
> `new Function`), the CDP attach (`chrome.debugger` @ proto `1.3`), a JSON-Schema→Zod bridge, and a
> `chrome.storage.local` memory store with inverted indices. The additions are **three small,
> eval-free, zero-dependency libraries** vendored into the service worker exactly the way
> `lib/lz-string.min.js` already is, plus use of the **`Network` CDP domain** (a permission you
> already hold — **no manifest change**). Reach for `minisearch` (capability search), `jmespath`
> (response extraction), and `@cfworker/json-schema` (in-SW recipe validation). **Do NOT add
> embeddings/ML runtimes, Ajv in its default mode, or JSONata.** Recipes are **declarative data
> interpreted by a fixed bundled interpreter — never `eval`'d** — to stay inside the Chrome Web Store
> "no remotely hosted code" line.

**Net package.json delta:** three new browser-targeted runtime deps (`minisearch`, `jmespath`,
`@cfworker/json-schema`), all zero-dependency; one optional (`url-template`). **Nothing new on the
MCP-server side** — `@modelcontextprotocol/sdk@^1.29.0` + `zod@^3.24.0` already cover the two new
dispatcher tools. The interpreter and auth-strategy handlers are **FSB-authored code**, by design, so
they ship inside the package (RHC-safe).

---

## The one hard constraint that shapes every choice: MV3 eval-CSP × "no remotely hosted code"

Two *different* rules collide here and **both** must be satisfied. This section is load-bearing for
the recipe-schema and interpreter phases.

1. **MV3 runtime CSP (technical).** The default extension-pages / service-worker CSP is
   `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. **No `'unsafe-eval'`** → `eval()` and
   `new Function()` **throw in the service-worker / extension-page context.** (Verified against Chrome
   "Manifest – Content Security Policy" docs; reproduced in the wild by
   [MCP-SuperAssistant #171](https://github.com/srbhptl39/MCP-SuperAssistant/issues/171), where Ajv's
   `new Function` schema-compile breaks "Available Tools" on MV3.)
   - **Why FSB's existing `execute_js` is fine anyway:** it runs `new Function(userCode)` *inside*
     `chrome.scripting.executeScript({world:'MAIN'})`, which executes in the **page's** JS realm under
     the **page's** CSP, not the extension SW realm. That is the authenticated-fetch primitive and it
     stays exactly as-is. **The lesson for this milestone: the fetch executes in MAIN world; the
     recipe interpreter executes in the SW.** Everything that runs in the SW (search index, schema
     validation, JSONPath/JMESPath extraction, the recipe interpreter itself) **must be eval-free.**

2. **Chrome Web Store program policy (legal/review).** RHC = "anything executed by the browser loaded
   from outside the extension's own files… It *does not* include data or things like JSON or CSS."
   The policy *explicitly* prohibits: *"Building an interpreter to run **complex commands** fetched
   from a remote source, **even if those commands are fetched as data**."* (Verified:
   developer.chrome.com remote-hosted-code + program-policies/mv3-requirements.)
   - **The line you must not cross:** a recipe must be **declarative configuration the interpreter
     *binds*** (this endpoint, this auth-strategy id, this param→field map, this read-only extraction),
     **not a mini-language of imperative commands.** A fixed interpreter that selects among a
     **closed, bundled set of behaviors keyed by enum** and substitutes data into templates is
     "config-driven" and allowed. An interpreter that executes arbitrary server-authored expressions
     (arithmetic, conditionals, loops, string ops) is the exact pattern the policy names. This is why
     **JSONata is rejected** and **JMESPath is constrained to response *read* extraction only**.

Everything below is chosen to sit on the safe side of *both* rules.

---

## Recommended Stack

### Core Technologies (already in the repo — reused, not added)

| Technology | Version (in repo) | Purpose for this milestone | Why it's the right base |
|------------|-------------------|----------------------------|--------------------------|
| Chrome MV3 + classic service worker | manifest_version 3; `extension/background.js` byte-frozen, 160× `importScripts` | Hosts the capability runtime, recipe interpreter, search index, consent gate | Already the platform. The SW-survivability pattern (`setTimeout`-chained iterator, INV-04) is load-bearing and must wrap any long capability run. |
| `chrome.scripting.executeScript({world:'MAIN'})` + `new Function` | existing (`extension/ws/mcp-bridge-client.js` `_handleExecuteJS`; `extension/ai/tool-executor.js`) | **The authenticated same-origin fetch primitive.** Recipe execution issues `fetch()` / CSRF-scrape *in the page realm* → carries the user's cookies/session, exactly like OpenTabs `fetchFromPage` | Runs under the *page* CSP, the one place dynamic code is legal in MV3. No new primitive needed; the capability runtime composes this. |
| `chrome.debugger` @ protocol `1.3` | existing (`debugger` perm + `<all_urls>`; used today only for the `Input` domain) | **Discovery:** enable the `Network` domain on a tab to observe real API calls (endpoint, method, headers, postData, response body) | Permission already granted; **manifest unchanged**. Only the *domain* used expands (`Input` → `Input`+`Network`). |
| `@modelcontextprotocol/sdk` | `^1.29.0` (mcp/) | Register the **small** new dispatcher tools (`search_capabilities`, `invoke_capability`) without touching the 55-tool byte-stable registry (INV-01/02) | Progressive disclosure (search → schema → invoke) is the documented way to expose a large catalog behind 2 tools. |
| `zod` + existing `jsonSchemaToZod()` bridge | zod `^3.24.0`; `mcp/src/tools/schema-bridge.ts` | Validate the **two new MCP tool** input schemas (server side, Node — `eval` is fine here) | The converter already exists and already coerces Claude-Code's stringified numbers. Reuse verbatim; do **not** add a second MCP-side validation stack. **Stay on zod 3** (4.x exists; mixing risks coercion drift → INV-01). |
| `chrome.storage.local` + inverted-index memory store | existing `extension/lib/memory/memory-storage.js` (`getAll`, `MEMORY_INDEX_KEY`, 10s-TTL cache) | Persist **learned recipes** as a new procedural-memory record type; persist the serialized search-index snapshot | Already the FSB persistence + keyword-index idiom. "Learned recipe" is just another memory `type`, matching the milestone's "promote successful calls into procedural memory." `unlimitedStorage` is already granted. |
| esbuild | `^0.24.0` (root) | Bundle any **MCP-side** TS and (optionally) one new content/offscreen bundle, per-entrypoint | Already the bundler; integration is "add an entry," not a toolchain change. **NB: it does NOT bundle `background.js`** (D-17 byte-freeze), so SW-side libs are vendored, not esbuilt — see Integration Points. |

### Supporting Libraries (the actual *new* dependencies — three small, eval-free, zero-dep libs)

| Library | Version (verified 2026-06-19) | Purpose | Where it runs | Why this one |
|---------|-------------------------------|---------|---------------|--------------|
| **`minisearch`** | **7.2.0** (MIT) | **(a) Capability search/index** for `search_capabilities` — BM25-ranked keyword/prefix/fuzzy over capability `{title, description, service, tags, host}` | **Service worker** (in-memory inverted index; `toJSON`/`loadJSON` snapshot persisted to `chrome.storage.local`) | ~**7 kB gzipped, zero deps, pure JS, no DOM** → SW-safe; explicitly documents SW/PWA use and `loadJSON` restore. Real BM25 + prefix + fuzzy + **field boosting** (the clean lever for **tab-origin biasing** — boost docs whose `host` matches the active tab). Far better recall than `String.includes()`, far lighter than embeddings. ESM (`dist/es`) bundles clean; UMD (`dist/umd`) is `importScripts`-able. |
| **`jmespath`** | **0.16.0** (Apache-2.0; canonical `jmespath.js`) | **(e) Response extraction** — declarative path/projection from a JSON API response to the fields a recipe returns. Recipe stores a JMESPath *string*; the interpreter runs it **read-only** over the parsed response | **Service worker** | **Pure tree-walking interpreter — verified: no `eval`, no `Function`, no deps, no DOM** (read source). **Formally specified, side-effect-free read query language** → stays on the safe side of the RHC "no complex-command interpreter" rule because it can only *project/filter* an existing JSON value (no I/O, no behavior authoring). Tiny runtime; mature/frozen spec. |
| **`@cfworker/json-schema`** | **4.1.1** (MIT) | **(b/e) In-SW recipe & param validation** — validate a server-delivered recipe against the bundled recipe JSON Schema *before* interpreting it, and validate user-supplied `invoke_capability` args against the recipe's declared param schema | **Service worker** | Purpose-built for **strict-CSP runtimes with no `eval`/`new Function`** (README literally cites "Cloudflare workers do not have… `eval` or `new Function`"). **Interpreted validator** (drafts 4/7/2019-09/2020-12), **zero deps**. This is the MV3-safe replacement for Ajv. ESM + CJS exports → bundles clean / `importScripts`-able. |

> Combined added weight ≈ **7 kB (minisearch, gz) + a few kB jmespath runtime + ~10–20 kB cfworker
> (gz)**. All three are **zero-dependency** → no transitive-tree surprises and no `node:*` shims
> (unlike the Lattice offscreen bundle, which needed node-builtin stubs in `esbuild.config.js`). This
> is well within "no heavy deps."

### The interpreter itself: hand-rolled, NOT a library (by design)

The "fixed bundled interpreter" that turns a declarative recipe into an authenticated call is
**FSB-authored code compiled into the extension** — there is no dependency for it, deliberately. It is
a small dispatcher that:

1. **Validates** the recipe + user params (`@cfworker/json-schema`).
2. **Resolves the endpoint** by substituting validated params into a URI template (`url-template`
   *optional*, or a 10-line hand-rolled replacer).
3. **Resolves the auth strategy** by **enum** → one of a *closed, bundled* set of handlers
   (`same-origin-cookie`, `csrf-header-scrape`, `bearer-from-storage`, …). The strategy id selects
   bundled code; **the recipe never ships auth code.**
4. **Builds the request** (method/headers/body from validated data) and executes it through the
   **existing MAIN-world fetch primitive**.
5. **Extracts the result** with the recipe's **JMESPath** string (`jmespath`, read-only).

Keeping step (3) a **finite bundled set keyed by enum** is what makes the whole thing "config-driven,"
not "an interpreter for remote commands." Document this explicitly in the recipe-schema phase.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `tsc` (`mcp/`) | Build the new `mcp/src/tools/capabilities.ts` (two new tools) | No change; `cp ../extension/ai/tool-definitions.js ai/tool-definitions.cjs` step already wires the shared registry into the MCP build. |
| esbuild (`^0.24.0`) | (PATH B) emit a single `capability-runtime.js` IIFE (libs + interpreter) into `extension/dist/`, or one-off bundle `@cfworker/json-schema` to UMD for vendoring (PATH A) | `platform: browser`, `target: chrome120`, like existing content bundles. Does **not** touch `background.js`. |
| Node test harness (`node tests/*.test.js`) | Recipe-schema validation, interpreter unit tests, search-ranking tests, CDP-capture parsing, dispatch parity | Slots into the existing `npm test` chain; mirror `tests/tool-definitions-parity.test.js` + `tests/mcp-tool-routing-contract.test.js`. |

## Installation

```bash
# --- New runtime libs for the capability runtime ---
# Consumed INSIDE THE EXTENSION (service worker), which is NOT an esbuild input
# (background.js is byte-frozen, D-17). Two valid integration paths:
#
#   PATH A (recommended; matches existing precedent in extension/lib/):
#     vendor a UMD/min build into extension/lib/ and load via importScripts(),
#     exactly like lib/lz-string.min.js.
#       - minisearch ships a UMD build (dist/umd/index.js)
#       - jmespath's jmespath.js is already a single browser-friendly UMD file
#       - @cfworker/json-schema is ESM/CJS -> produce a self-contained IIFE via a
#         one-off:  esbuild node_modules/@cfworker/json-schema --bundle \
#                     --format=iife --global-name=CfworkerJsonSchema \
#                     --outfile=extension/lib/cfworker-json-schema.min.js
#         (build-time bundling of a LOCAL file = NOT remotely hosted code.)
#
#   PATH B: add one new esbuild entry that emits a single "capability-runtime"
#     IIFE bundle (minisearch + jmespath + cfworker + interpreter) to
#     extension/dist/, then importScripts() that one file. Cleaner dependency
#     management; one new importScripts line in background.js.
npm install minisearch@7.2.0 jmespath@0.16.0 @cfworker/json-schema@4.1.1

# Optional endpoint templating (RFC 6570). Add only if the long tail needs
# query-param/explode semantics; otherwise hand-roll trivial {var} substitution.
npm install url-template@3.1.1

# NOTHING new on the MCP-server side:
#   @modelcontextprotocol/sdk@^1.29.0 + zod@^3.24.0 already cover the two new tools.
#   Do not add a second validator. fsb-mcp-server still bumps for the new tool
#   surface, but its dependencies block is unchanged.
```

> Either path keeps the **"no remotely hosted code"** invariant: every byte of executable code (libs
> + interpreter) ships *inside* the extension package. Recipes streaming from FSB's server are
> **JSON data** validated and *bound* by that bundled code — never fetched-and-executed.

## Answers to the five specific questions

**(a) Capability search inside an MV3 SW.** Use **`minisearch` (BM25 + prefix + fuzzy)** — *not*
embeddings, *not* hand-rolled. The catalog is tiny structured text (a few thousand
`{title, description, tags, service, host}` rows at most), so the win is *ranking + recall*, not
semantic ML. MiniSearch is ~7 kB gz, zero-dep, pure-JS/no-DOM (SW-safe), and provides **field
boosting** — the clean lever for **tab-origin biasing** (boost rows whose `host` == active tab's host;
this matches OpenTabs' "tools available on this tab"). Persist the index via `toJSON`/`loadJSON` into
`chrome.storage.local` so cold SW starts don't re-index. *Reject embeddings:* an in-extension
embedding model (transformers.js / ONNX-WASM) is tens of MB, needs `wasm-unsafe-eval`, and burns
SW CPU/RAM for zero benefit at this corpus size. *Reject pure Fuse.js:* no inverted index, scans every
doc per query (fine for hundreds, poor as the learned-recipe tail grows); MiniSearch's fuzzy/prefix
already covers Fuse's typo tolerance.

**(b) Declarative recipe schema/DSL.** **JSON, validated by a bundled JSON Schema (draft 2020-12),
interpreted by a fixed bundled interpreter — expressly NOT Turing-complete.** A recipe encodes, as
*data*: `endpoint` (URI-template string), `method`, `authStrategy` (an **enum** selecting one bundled
handler — the auth *code* is never in the recipe), `params` (a JSON-Schema object the interpreter
validates user input against), `request` mapping (which params → query/header/body, as a static map),
and `extract` (a **JMESPath read-only** string). Keep every "behavior" choice an **enum into a closed
bundled set**; keep every "value" choice **data substituted into a template**. That combination is
expressive enough for the long-tail REST/GraphQL services OpenTabs targets while staying firmly inside
the RHC line (no server-authored arithmetic/conditionals/loops). Validate with
`@cfworker/json-schema` in the SW.

**(c) MV3-compliant delivery of server recipes as DATA.** Stream recipes from FSB's server as **JSON
over `fetch`** into `chrome.storage.local`; the **fixed bundled interpreter** (shipped in the
extension) consumes them. Allowed because RHC "does not include data or things like JSON," and the
interpreter is **not** a general command runner — it binds config and dispatches to bundled
enum-selected handlers. **The bright line to hold:** never `eval`/`new Function` a recipe field in the
SW; never let a recipe carry JS/auth code; never let the "interpreter" grow server-authored control
flow. (Fallback narrative if review ever pushes back: "config-driven feature data," the standard
accepted pattern.) Persist learned recipes the same way (procedural memory) so discovery and
server-delivery share one storage + interpreter path.

**(d) CDP Network capture for discovery.** With the debugger already attached at `1.3`:
`Network.enable` (set `maxPostDataSize` so POST bodies are retained), listen on
`Network.requestWillBeSent` (URL, method, headers, **postData**, initiator, resourceType),
`Network.responseReceived` (status, headers, mimeType), then `Network.getResponseBody({requestId})`
**after** `Network.loadingFinished` to read the body. Use the experimental
`requestWillBeSentExtraInfo` / `responseReceivedExtraInfo` for *raw* headers + cookie info when needed.
**Caveats to design around:** `getResponseBody` returns `null` for bodies > ~1 MB and only while the
response is still buffered; the MV3 SW can be evicted mid-capture, so **register
`chrome.debugger.onEvent` listeners synchronously at SW top-level** (the discipline FSB already uses)
and stash partial captures in storage. You already share the debugger with the `Input` domain —
enabling `Network` on the same attachment is fine; be deliberate about detach/restore so
input-emulation flows aren't disrupted (and note Chrome shows the "started debugging this browser"
banner — already true for FSB).

**(e) Small SW-safe libs vs hand-rolled.** **Mixed, and the split is deliberate:**
- **JSON Schema validation → library (`@cfworker/json-schema`); do NOT hand-roll, do NOT use Ajv.**
  Ajv compiles validators with `new Function` → **blocked by MV3 SW CSP** (confirmed real-world
  breakage). cfworker is the eval-free, zero-dep, spec-compliant validator built for exactly this.
- **Response extraction → library (`jmespath`), read-only.** Verified eval-free pure interpreter;
  gives non-trivial projection/filtering as *data* without you maintaining a path engine. (Avoid
  `jsonpath-plus` — it historically exposes script-expression evaluation; unnecessary code-exec
  surface inside an extension handling authenticated sessions.)
- **HAR-style request modeling → hand-rolled.** Don't add a HAR library. The CDP
  `requestWillBeSent`/`responseReceived` params *are* the model; capture the handful of fields you
  need (method, url, headers, postData, status, body) into a small plain object.
- **Endpoint templating → hand-rolled OR tiny `url-template`.** Trivial `{var}` = 10 lines; full
  RFC 6570 (query explosion) = the 8 kB `url-template`. Pick per long-tail need.
- **The interpreter → hand-rolled** (see "The interpreter itself").

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `minisearch` 7.2.0 | `flexsearch` 0.8.x | If the catalog grew to *hundreds of thousands* of rows and raw query throughput dominated. FlexSearch is faster at huge scale but ~2.3 MB unpacked, has had ESM/build friction, and is overkill for a few-thousand-row catalog. |
| `minisearch` 7.2.0 | `fuse.js` 7.4.2 | If you wanted *only* small-N fuzzy matching with zero index management and the corpus stayed in the low hundreds. MiniSearch already provides fuzzy+prefix, scales better, and supports field boosting for tab-origin bias — so it dominates here. |
| `minisearch` 7.2.0 | local embeddings (transformers.js / ONNX) | Only if discovery needed *semantic* matching of free-form intent against descriptions AND the corpus were large/ambiguous. Cost (tens of MB, `wasm-unsafe-eval`, SW CPU) is unjustified at this corpus size; revisit only if keyword recall measurably fails. |
| `jmespath` (read-only extract) | `jsonata` 2.2.1 | **Do not.** JSONata is a full expression language (arithmetic, string ops, conditionals, user functions). Even though it's a JS interpreter (no `eval`), shipping *server-authored JSONata in recipes* is the textbook "interpreter for complex commands fetched as data" the Chrome policy prohibits. JMESPath's read-only projection stays on the safe side. |
| `@cfworker/json-schema` | `ajv` 8.x **standalone/precompiled** | Only viable if every recipe schema were known at *build time* and precompiled with `ajv-cli` (BETA, limited `$ref`/keyword support). Recipes are server-delivered/learned at *runtime*, so runtime compilation is required → cfworker's interpreted validator is the correct fit. |
| `@cfworker/json-schema` | `jsonschema` 1.5.0 (`node-jsonschema`) | If you needed an even smaller validator and could accept draft-4-era coverage. cfworker's modern-draft support + explicit CSP-safe positioning make it the safer pick; keep `jsonschema` as a backup if bundle size ever becomes critical. |
| Reuse `chrome.storage.local` + MiniSearch snapshot | IndexedDB (raw) | If recipe + capture volume outgrew `chrome.storage.local` practical limits. FSB has `unlimitedStorage` and the memory layer standardizes on `chrome.storage.local`; stay consistent unless volume forces IndexedDB. |
| `url-template` 3.1.1 (optional) | hand-rolled `{var}` replacer | Use `url-template` only if you need RFC 6570 query-param/explode (`{?state,labels}`); otherwise a 10-line replacer avoids the dep. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`ajv` (default codegen mode) in the service worker** | Compiles validators with `new Function` → **throws under MV3 SW CSP** (`script-src 'self' 'wasm-unsafe-eval'`, no `unsafe-eval`). Confirmed real-world failure ([MCP-SuperAssistant #171](https://github.com/srbhptl39/MCP-SuperAssistant/issues/171)). | `@cfworker/json-schema` (interpreted, eval-free). Ajv only if precompiled at build time. |
| **JSONata in recipes** | Full server-authorable expression language → matches the Chrome policy's prohibited "interpreter to run complex commands fetched as data." Review/RHC risk, not just size. | `jmespath` for read-only response extraction; bundled enum-selected handlers for any actual logic. |
| **`eval`/`new Function` on any recipe field in the SW** | (1) Throws under MV3 SW CSP; (2) turns "data" into "remotely hosted code" → store rejection. | A fixed bundled interpreter that *binds* declarative data and dispatches to bundled handlers. (Page-realm `execute_js` is the *only* place dynamic code is legal, and only for FSB's own fetch primitive.) |
| **Local embedding/ML runtime (transformers.js, onnxruntime-web, tfjs)** for capability search | Tens of MB, needs `wasm-unsafe-eval`, heavy SW CPU/RAM, slow cold start — for a few-thousand-row text corpus where BM25 is already excellent. | `minisearch` keyword/BM25 + field boosting. |
| **`jsonpath-plus`** for extraction | Historically supports script-expression evaluation in paths → unnecessary code-exec surface + audit burden inside an extension handling authenticated sessions. | `jmespath` (no expression-eval, formally specified). |
| **A HAR library** for request modeling | Pure overhead; CDP event params already give you the request/response shape. | Hand-rolled plain-object capture of the few fields you need. |
| **A second MCP-side validation/schema stack** | Duplicates the working `jsonSchemaToZod()` bridge; risks INV-01 wire-contract drift. | Reuse `mcp/src/tools/schema-bridge.ts` + zod for the two new tool schemas. |
| **`zod@4.x`** for the new tools | `schema-bridge.ts` + every existing tool registration are zod-3 (`z.preprocess`, `z.coerce.number().finite()`, `z.enum`); mixing zod 4 risks coercion drift → INV-01. | Stay on `^3.24.0`. |
| **Routing the authenticated fetch through the SW `fetch()` directly** | SW `fetch` does **not** automatically carry the page's first-party cookie/session context the way a page-realm `fetch` does, and loses the CSRF-token-on-page trick OpenTabs relies on. | Keep executing recipe HTTP calls in **MAIN world** via the existing `execute_js` primitive (FSB's `fetchFromPage` equivalent). |
| **Cloning OpenTabs' npm-per-plugin model** (already ruled out in PROJECT.md; restated for stack hygiene) | 100+ npm packages of imperative TS per service = exactly the tool-bloat + install-friction this milestone avoids; each is remotely-installed *code*. | Bundled imperative handlers for the head + server-delivered **declarative data** recipes for the tail, one interpreter. |

## Stack Patterns by Variant

**If the capability is in the popular/hard HEAD (e.g. GitHub GraphQL with persisted-query-hash
discovery, like OpenTabs' `github-api.ts`):**
- Ship a **bundled imperative handler** (FSB-authored JS compiled into the extension). It may do CSRF
  scraping, JS-bundle hash extraction, multi-step transport — all *inside the extension package*, so
  it's not RHC and not size-constrained by the recipe schema.
- Register it behind `invoke_capability` via the enum/`authStrategy` dispatch, **not** as a new MCP
  tool (INV-01/02).

**If the capability is in the easy long TAIL (a plain authenticated REST endpoint):**
- Encode it as a **declarative JSON recipe** (endpoint template + method + auth-strategy enum + param
  schema + request map + JMESPath extract).
- Deliver from FSB's server as data; validate with `@cfworker/json-schema`; interpret with the fixed
  bundled interpreter. Zero new code ships per service.

**If discovering a brand-new service at runtime:**
- Use **CDP `Network` capture** to record the real call, synthesize a draft recipe, validate it, run
  it once to confirm, then **promote into procedural memory** (`chrome.storage.local`) so it
  auto-grows the catalog and feeds the MiniSearch index.

**If a recipe breaks (endpoint moved, schema drift):**
- Self-healing fallback to FSB's existing **DOM automation** (unchanged) — the recipe path is a *fast
  path*, never the only path (per milestone goal + invariants).

## Version Compatibility

| Package | Verified version (2026-06-19) | Compatible with | Notes |
|---------|-------------------------------|------------------|-------|
| `minisearch` | 7.2.0 (MIT) | esbuild `^0.24.0`; SW via UMD `importScripts` or ESM bundle; `target: chrome120` | Zero deps. CJS/UMD/ESM exports → bundles or vendors cleanly. SW/PWA use documented. |
| `jmespath` | 0.16.0 (Apache-2.0) | SW directly (single UMD `jmespath.js`) | Zero deps, no DOM, verified eval-free tree-walking interpreter. Low churn is fine — it's a frozen spec. |
| `@cfworker/json-schema` | 4.1.1 (MIT) | esbuild `^0.24.0`; SW via bundled IIFE/UMD | Zero deps; ESM+CJS exports. Built for no-`eval` runtimes. Drafts 4/7/2019-09/2020-12. |
| `url-template` (optional) | 3.1.1 (BSD-3) | SW via bundle | Zero deps, `type:module`, ~8 kB unpacked. RFC 6570. |
| `@modelcontextprotocol/sdk` | `^1.29.0` (existing) | `zod@^3.24.0`, Node `>=18.20` (mcp engines) | No change; new tools register through existing `server.tool()` + `jsonSchemaToZod()`. |
| Chrome `debugger`/CDP | protocol `1.3` (existing attach) | `Network` + `Input` domains on one attachment | `getResponseBody` ≤ ~1 MB; register `onEvent` synchronously (MV3 SW eviction). |

**Engine note:** root `engines.node` is `>=24.0.0`; mcp `engines.node` is `>=18.20.0`. The three new
libs are browser-targeted runtime deps consumed by the *extension*, not the Node CLIs, so they move
neither Node floor. If vendoring via PATH B, they pass through esbuild (`platform: browser`,
`target: chrome120`) like the existing content bundles.

## Integration Points (exact, for the roadmapper)

| Need | Existing FSB asset to reuse / extend | File(s) |
|------|--------------------------------------|---------|
| Two new MCP tools, nothing else on the wire (INV-01/02) | New `mcp/src/tools/capabilities.ts` registering `search_capabilities` + `invoke_capability` via `server.tool(...)` in `index.ts`; schemas built with existing `jsonSchemaToZod()`. The 55 existing `TOOL_REGISTRY` entries stay byte-stable. | `mcp/src/tools/*.ts`, `mcp/src/index.ts`, `mcp/src/tools/schema-bridge.ts`, `extension/ai/tool-definitions.js` |
| Enforce ownership/agent-scoping on the new tools | Route both through the **existing dispatch chokepoint** (`MCP_PHASE199_TOOL_ROUTES` map) so the gate runs in the same microtask as every other tool. | `extension/ws/mcp-tool-dispatcher.js` |
| Capability runtime in the SW, vendored like `lz-string` | The SW is **byte-frozen, NOT an esbuild input** (D-17) and loads vendored libs via `importScripts('lib/lz-string.min.js')`. Drop `minisearch`/`jmespath`/`@cfworker/json-schema` (UMD/IIFE) into `extension/lib/` (PATH A) **or** emit one `capability-runtime.js` IIFE via a new esbuild entry into `extension/dist/` (PATH B), then add the corresponding `importScripts(...)` line(s). Interpreter + auth-strategy handlers are new FSB SW modules loaded the same way. | `extension/background.js`, `extension/lib/*.min.js`, `esbuild.config.js` |
| Authenticated fetch = reuse the MAIN-world primitive | Recipe HTTP execution composes the existing `chrome.scripting.executeScript({world:'MAIN'})` path. Do **not** build a parallel fetch path. This is the page-realm, cookie-carrying, CSRF-scrape-capable equivalent of OpenTabs' `fetchFromPage`. | `extension/ws/mcp-bridge-client.js` (`_handleExecuteJS`), `extension/ai/tool-executor.js` |
| Discovery = new `Network` CDP usage on the existing attachment | Extend FSB's `chrome.debugger` usage (today only `Input.*`) with `Network.enable` + `requestWillBeSent`/`responseReceived`/`getResponseBody`. No manifest/permission change. Register `chrome.debugger.onEvent` synchronously at SW top-level for MV3 survivability. | `extension/background.js` (CDP attach @ `1.3`) |
| Persistence = new procedural-memory record type | Store learned/server-delivered recipes and the serialized MiniSearch snapshot in `chrome.storage.local` via the existing memory layer (inverted-index + 10s-TTL cache). "Learned recipe" is a new memory `type`. | `extension/lib/memory/memory-storage.js` |
| Consent gate (per-origin Off/Ask/Auto + audit log + default-off) | FSB-authored SW/UI code; **no new dependency**. Wraps `invoke_capability` *before* the MAIN-world fetch fires. | new SW/UI modules |

## Sources

- This repo (read directly, HIGH): `.planning/PROJECT.md` (milestone + INV-01..04), `extension/manifest.json` (perms: `debugger`, `<all_urls>`, `unlimitedStorage`), `extension/background.js` (160× `importScripts`; `chrome.debugger.attach(...,'1.3')` Input-only; `importScripts('lib/lz-string.min.js')`), `esbuild.config.js` (D-17 SW byte-freeze; per-entry browser bundles; node-builtin-stub plugin precedent), `mcp/src/tools/schema-bridge.ts` (`jsonSchemaToZod`, zod coercion), `mcp/src/tools/*.ts` + `mcp/src/index.ts` (`server.tool` registration), `extension/ws/mcp-tool-dispatcher.js` (dispatch chokepoint), `extension/ws/mcp-bridge-client.js` + `extension/ai/tool-executor.js` (`world:'MAIN'` + `new Function`/`eval` fetch primitive), `extension/lib/memory/memory-storage.js` (inverted-index storage), `extension/lib/*.min.js` (vendored-lib precedent), `package.json` / `mcp/package.json` (current deps + Node engines).
- npm registry (versions verified 2026-06-19, HIGH): `minisearch@7.2.0`, `jmespath@0.16.0`, `@cfworker/json-schema@4.1.1`, `url-template@3.1.1`, `fuse.js@7.4.2`, `flexsearch@0.8.212`, `jsonata@2.2.1`, `ajv@8.20.0`.
- Chrome for Developers — Manifest Content Security Policy + remote-hosted-code + program-policies/mv3-requirements (HIGH): default SW/extension-pages CSP `script-src 'self' 'wasm-unsafe-eval'`; RHC excludes data/JSON/CSS; explicit prohibition on "an interpreter to run complex commands fetched… as data." https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy , https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code , https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- Ajv-in-MV3 breakage (MEDIUM→HIGH; corroborates the eval-CSP constraint with a real bug): MCP-SuperAssistant #171; ajv #2527. https://github.com/srbhptl39/MCP-SuperAssistant/issues/171 , https://github.com/ajv-validator/ajv/issues/2527
- `@cfworker/json-schema` README — explicitly built for runtimes without `eval`/`new Function`; drafts 4/7/2019-09/2020-12; zero deps (HIGH). https://github.com/cfworker/cfworker/tree/main/packages/json-schema
- `jmespath.js` source — verified eval-free pure lexer/parser/tree-interpreter, zero deps, SW-safe (HIGH). https://github.com/jmespath/jmespath.js/
- MiniSearch — ~7 kB gz, zero deps, pure JS/no-DOM, documents SW/PWA use + `loadJSON`/`toJSON` snapshots, field boosting (HIGH for capabilities; size figure MEDIUM from author blog). https://github.com/lucaong/minisearch , https://lucaongaro.eu/blog/2019/01/30/minisearch-client-side-fulltext-search-engine.html
- Chrome DevTools Protocol — Network domain (HIGH): `Network.enable`/`requestWillBeSent`/`responseReceived`/`getResponseBody`/`loadingFinished` + extraInfo events; `maxPostDataSize`; `getResponseBody` ~1 MB cap; call after `loadingFinished`. https://chromedevtools.github.io/devtools-protocol/tot/Network/ , https://chromedevtools.github.io/devtools-protocol/1-3/Network/
- OpenTabs reference (MEDIUM, for the auth/transport pattern being matched): repo README + `plugins/github/src/github-api.ts` — same-origin `fetchFromPage`, `<input name="authenticity_token">` CSRF scrape, persisted-query-hash extraction from JS bundles; imperative TS, no declarative schema (so FSB's declarative-tail approach is a deliberate divergence). https://github.com/opentabs-dev/opentabs

---
*Stack research for: MV3 capability-runtime / authenticated-API execution layered on FSB.*
*Researched: 2026-06-19*
