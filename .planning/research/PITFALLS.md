# Pitfalls Research

**Domain:** Authenticated-API replay + declarative recipe interpreter + capability search added to an MV3 Chrome extension (FSB) that markets itself as supervised/safe
**Researched:** 2026-06-19
**Confidence:** HIGH (Chrome policy, MV3 lifecycle, fetch-origin semantics, auth mechanics all verified against official docs + primary sources; OpenTabs `github-api.ts` not on disk — its patterns reconstructed from GraphQL/Slack/persisted-query primary sources, MEDIUM on the specific file)

> **Phase numbering note:** the v0.9.99 roadmap "continues integer phases from v0.12.0's Phase 25"
> (PROJECT.md). Phase numbers below are written as **relative slots P-A … P-H** because the exact
> integers are assigned by the roadmapper. Each slot names the capability area it owns so the
> roadmapper can bind it. Ordering between slots is the load-bearing output, not the integers.

---

## The two boundaries the roadmapper MUST treat as hard constraints

Everything else in this document is mitigation. These two are **architectural walls** — building past
them produces either a Web Store ban or silent unfixable breakage.

### WALL 1 — The MV3 code-vs-data compliance line (actionable)

| Side | What it is | Verdict |
|------|-----------|---------|
| **CODE (prohibited remotely)** | Anything "executed by the browser that is loaded from someplace other than the extension's own files. Things like JavaScript and WASM." A server-delivered JS string run via `eval`/`new Function`/`import()`; a CDN-hosted lib; **an interpreter whose "recipe" is actually a serialized expression tree / mini-language that is Turing-expressive enough to be "code fetched as data."** | Ban risk |
| **DATA (allowed remotely)** | "It _does not_ include data or things like JSON or CSS." A declarative recipe = a JSON document of **named, bundled-and-fixed operations with parameters** (endpoint template, method, header map, body template, JSONPath extractors, a closed enum of transforms) that **bundled interpreter code** reads and dispatches. | Compliant |

**The line, stated operationally:** the recipe may say *which* of the interpreter's pre-existing,
shipped capabilities to run and *with what parameters/data*. It may **not** introduce new control
flow, new operators, arbitrary JS expressions, or anything the bundled interpreter would have to
`eval` to honor. If you ever feel tempted to write `new Function(recipe.transform)` — stop, that is
WALL 1. The "even fetched as data, building an interpreter to run complex commands" anti-pattern is
explicitly called out by Google. Keep the recipe schema a **closed vocabulary** with a versioned
JSON Schema; reject unknown opcodes loudly.

### WALL 2 — The auth-heterogeneity capture/replay boundary (explicit)

Generic "observe the call, store it, replay it later" works for a *minority* of real auth schemes.
The roadmapper must size the head/tail split around what is actually replayable:

| Auth artifact | Capturable? | Replayable generically? | Why / boundary |
|---------------|-------------|-------------------------|----------------|
| **First-party cookies incl. HttpOnly** (session cookie, Slack `xoxd`) | NOT readable from JS; readable via CDP `Network.getAllCookies` | **Yes, but only implicitly** — issue the request from the **page origin** (content script / `execute_js`) with `credentials:'include'`, OR via the CDP/`debugger` network stack, so the browser attaches them. Never copy the value. | HttpOnly is unreadable by design; you replay the *session*, not the *token*. A **SW `fetch` uses the extension origin and will NOT send the user's first-party cookies** — this is the #1 silent failure. |
| **Bearer / JS-readable session token** (Slack `xoxc`, `Authorization: Bearer` minted in page JS) | Yes (network capture / read from page memory) | Yes — re-send as a header | These live in page JS, so capture works. But they **rotate when the session is invalidated** and are explicitly outside the vendor's compat guarantees. |
| **Per-session CSRF token** (stable for the tab's lifetime) | Yes (from a prior response / meta tag / cookie-mirrored) | Usually yes within the session | Must be re-read fresh each session; do not persist across sessions. |
| **Per-request / single-use CSRF nonce** (server invalidates after one use) | Yes, once | **NO** | The captured nonce is already burned; the next request needs a freshly server-issued one you can only get by replaying the page's flow. **Hard boundary.** |
| **Persisted-query hash** (GraphQL APQ — send `sha256` instead of query body) | Yes | **Conditionally** — works until the client bundle ships a new query and the hash 404s (`PersistedQueryNotFound`). Recoverable only if you *also* shipped the full query text to fall back to, or you re-scan the JS bundle for the new hash. | This is exactly the OpenTabs "query expired" failure. A bare stored hash rots on the vendor's deploy cadence. |
| **Signed / HMAC'd / nonce'd / timestamped params** (request signature over path+body+ts+secret; PKCE-style; client-side-computed `x-signature`) | The *output* is visible per request | **NO — fundamentally** | The signing **secret + algorithm live in the page's JS at runtime**; the signature is per-request and time-bound. You cannot reproduce it without re-executing the page's signer. **This is the wall.** Anything requiring a fresh client-side cryptographic computation per call is NOT genericaly replayable. |
| **Ephemeral / short-TTL tokens** (expire in seconds/minutes) | Yes, briefly | **NO across time** | Captured value is dead by replay time; needs live re-mint. |
| **No-UI-path actions** (endpoint exists but no page ever calls it for this user, or only an internal admin SPA does) | No (nothing to observe) | N/A | Network-capture discovery can only learn calls the user's browser actually makes. If there's no UI path, there's no recipe to learn and **no DOM fallback either**. Out of scope by construction. |

**The one-sentence boundary for the roadmapper:** *FSB can replay the user's authenticated **session**
(cookies + stable/JS-readable tokens) for endpoints the page actually exercises; it CANNOT generically
reproduce anything the page computes fresh per-request (signatures, single-use nonces, expiring
hashes/tokens) — those require re-running the page's own JS, i.e. the DOM-automation fallback.*

---

## Critical Pitfalls

### Pitfall 1: Shipping a recipe interpreter that is "code fetched as data" → Chrome Web Store ban

**What goes wrong:**
The declarative-recipe ambition drifts. To handle the "long tail" cheaply, the recipe format grows an
`if`, then a `map(expr)`, then an inline JS transform string, then `eval`. The extension now executes
server-delivered logic. Reviewers (or an automated scan) classify it as remotely-hosted code. Because
FSB already holds `debugger` + `<all_urls>` (maximum-scrutiny permissions), this is not a warning — it
is a takedown of an extension with an existing install base.

**Why it happens:**
The data/code line is genuinely subtle and Google's own RHC page "does not explicitly address
JSON-based interpreters." Engineers reason "it's JSON, JSON is data, therefore compliant" — but Google
separately and explicitly prohibits "building an interpreter to run complex commands fetched from a
remote source, even if those commands are fetched as data."

**How to avoid:**
- Freeze the recipe schema as a **closed opcode vocabulary** (fixed enum of operations the *bundled*
  interpreter already implements) with a versioned JSON Schema. No arbitrary expressions, no
  remote-supplied control flow, no string-eval transform field — ever.
- Add a **CI guard** that fails the build if the interpreter source contains `eval`/`new Function`/
  `import(` reachable from the recipe-execution path, and a schema-conformance test that rejects any
  recipe op outside the enum.
- Document the compliance posture on the extension's homepage/privacy page (FSB already maintains
  Limited-Use disclosure from v0.9.69 — extend it).
- Treat the *hardest/most-popular* services as **bundled imperative handlers** (head), not recipes, so
  the recipe vocabulary never needs to grow to cover them.

**Warning signs:**
A recipe field named `script`, `expr`, `transform`, `code`, `fn`, or `js`; a PR that adds a new
recipe-driven branch by interpreting a server string; "we'll just `eval` the small bits."

**Phase to address:** **P-A (Recipe schema + bundled interpreter)** — the schema's closedness is a
day-one invariant; the CI guard ships with the interpreter.

---

### Pitfall 2: Issuing the replay fetch from the wrong execution context (extension origin) → auth silently absent

**What goes wrong:**
The natural place to put a "fetch primitive" in an MV3 extension is the service worker. A SW
`fetch(url, {credentials:'include'})` runs as the **extension origin**, so it sends *the extension's*
cookie jar — **not** the user's first-party logged-in session. The call returns 401/403 (or worse, a
logged-out 200 with public data), and the recipe is blamed for "rot" when the real bug is the context.
Conversely, a content-script fetch *does* carry the page's first-party cookies, but is bound by SOP/CORS
and fails on cross-subdomain API hosts.

**Why it happens:**
"Background script can bypass CORS with host_permissions" is the most-repeated MV3 advice, so engineers
put network there. The cookie-origin consequence is undocumented on Chrome's network-requests page (a
verified gap) and only bites at runtime against real authenticated sites.

**How to avoid:**
Pick the context deliberately **per the boundary in WALL 2**:
- **Same-origin authenticated GET/POST that needs the user's session:** issue from the **page origin**
  — `execute_js`/content-script `fetch(..., {credentials:'same-origin'})`, OR drive it through the
  **CDP `Fetch`/`Network` domain** (FSB already attaches `chrome.debugger`), which uses the real
  browser network stack and full cookie jar including HttpOnly.
- **SW fetch** is appropriate only for *un*authenticated cross-origin calls or calls whose auth is an
  explicit header you legitimately hold — never for "ride the user's cookie session."
- Write an explicit decision table into the capability runtime and a smoke test that asserts a known
  logged-in endpoint returns authenticated data (not the logged-out shape) from the chosen context.

**Warning signs:**
Replays that 401 only in production-against-real-sites but pass against a same-origin test fixture;
auth working for some origins (same-origin SW edge cases) but not others; "works when I'm on the tab,
fails from background."

**Phase to address:** **P-B (Authenticated fetch primitive + execution-context contract)** — this is
the spine of the feature; get it wrong and nothing authenticated works.

---

### Pitfall 3: Replaying user auth against private APIs becomes a credential-replay weapon (the "safe brand" inversion)

**What goes wrong:**
The whole feature is, definitionally, **automated replay of the user's credentials against private
endpoints**. If a recipe (server-delivered) or a learned recipe can specify an *arbitrary* origin +
endpoint + body, then a malicious/compromised recipe can drive the user's authenticated session to
exfiltrate or mutate data (read DMs, send messages, change settings, initiate transfers) on any site
where they're logged in — silently, with `<all_urls>`. FSB's entire differentiator is being
**supervised/safe**; this adds the exact capability a stealth credential-stealer would want.

**Why it happens:**
The fast-path framing ("just call the API") hides that "the API" is the user's bank/email/Slack with
their cookies attached. Recipes arrive from FSB's server; a server compromise or a poisoned learned
recipe is now an RCE-equivalent against every user's logged-in sessions.

**How to avoid:**
- **Default-OFF for authenticated API replay** per-origin (PROJECT.md already commits to this) with
  **Off/Ask/Auto** consent; "Auto" must be an explicit per-origin opt-in, never global-on by default.
- **Origin pinning:** a recipe for `slack.com` may only target `slack.com` endpoints. The interpreter
  must reject any recipe whose request origin ≠ the consented capability origin. No cross-origin
  redirection of credentials.
- **Sign/verify server-delivered recipes** (integrity, not just TLS) so a CDN/MITM cannot swap recipe
  bodies; pin to FSB's signing key. (FSB already consumes Lattice Capability Receipts / Ed25519+JCS —
  reuse that machinery for recipe integrity.)
- **Mutation gating:** treat state-changing methods (POST/PUT/PATCH/DELETE) as higher-consent than
  reads; surface the action in the audit log and (in Ask mode) in the approval prompt with the actual
  target + method.
- **Sensitive-origin denylist / heightened friction** for known-high-stakes categories (banking,
  email, gov) even in Auto.

**Warning signs:**
A recipe that targets an origin the user never consented to; Auto enabled globally; recipes able to
specify redirect-following to a third origin; learned recipes promoted without origin scoping.

**Phase to address:** **P-D (Consent governance + origin pinning + recipe integrity)** — and origin
pinning must also be enforced inside **P-B** so even an un-governed call path can't cross origins.

---

### Pitfall 4: Auth or recipe data routed through FSB's server → credential exfiltration + Limited-Use violation

**What goes wrong:**
The architecture streams recipes/data *from* FSB's server. The tempting symmetric move is to send
captured request templates (which embed auth headers, cookies, tokens, CSRF values) *back* to FSB's
server — for "learning," "sharing learned recipes," or "telemetry." That ships the user's
authentication material off-device. Chrome's policy classifies "logins, passwords, and authentication
cookies" as **sensitive user data**; transmitting them to a third party (even your own server) without
the right disclosure/consent is a Limited-Use violation **and** a real breach surface.

**Why it happens:**
The learned-recipe-sharing and telemetry pipelines (FSB already has anonymous telemetry from v0.9.69)
make "just POST the captured call" feel natural; the captured call *is* the auth.

**How to avoid:**
- **Hard rule: auth stays strictly local.** Captured headers/cookies/tokens **never leave the device**.
  Persist them only in `chrome.storage` (session/local) on the user's machine.
- When promoting a learned recipe to procedural memory, **store the recipe shape (endpoint template,
  param names, extractor paths) — never the secret values.** Redact auth fields at capture time before
  anything is persisted, and *never* include them in any server-bound payload.
- If learned recipes are ever shared to FSB's server (optional), they must be **scrubbed to the
  schema/shape only**, reviewed, and the scrubbing must be tested (a test that asserts no
  `cookie`/`authorization`/`token`/`x-csrf` substring survives into the server payload).
- Reuse FSB's existing `redactForLog` discipline (origin/length/status only) for any diagnostics on the
  capability path.

**Warning signs:**
Any network call from FSB to its own server whose body contains request headers/cookies; learned-recipe
objects that still carry `Authorization`/`Cookie`; telemetry events sized large enough to embed tokens.

**Phase to address:** **P-D (Consent/audit)** for the policy + **P-F (Network-capture discovery)** for
capture-time redaction (redact before persist, before promote, before any egress).

---

### Pitfall 5: Recipe rot — APIs change, stored hashes/endpoints break, no expiry detection → silent wrong/empty results

**What goes wrong:**
Vendors ship new client bundles weekly. A persisted-query hash 404s (`PersistedQueryNotFound`); an
endpoint path changes; a required header is added; a response shape moves. A naive replay either errors
or — worse — returns a **success-shaped but wrong/empty** payload (e.g. APQ servers sometimes return a
caching error the client must interpret; a changed filter param silently returns everything or nothing).
The user gets confidently-wrong answers. OpenTabs ships explicit "query expired" handling precisely
because this is the steady-state, not the edge case.

**Why it happens:**
Replay assumes the captured contract is durable; it is the opposite — internal APIs have **no
compatibility guarantee** (Slack states this explicitly for `xoxc`). The head (bundled handlers) rots on
*FSB's* release cadence; the tail (recipes) rots on the *vendor's* cadence, which FSB can't see.

**How to avoid:**
- **Treat every recipe as expirable.** Stamp recipes with a captured-at + a schema/version hash; carry
  an explicit **freshness/health signal**.
- **Detect expiry, don't assume success:** validate each response against an expected-shape assertion
  baked into the recipe (required JSONPath present, status in expected set, non-empty when the op
  implies results). Map known signals (`PersistedQueryNotFound`, 400 on changed params, auth-shape vs
  data-shape) to a typed `RECIPE_EXPIRED` outcome.
- **For persisted queries specifically:** keep the full query text alongside the hash so a 404 falls
  back to sending the body (the documented APQ recovery), or trigger a JS-bundle re-scan to discover the
  new hash. A bare hash with no fallback is guaranteed rot.
- **Self-heal to DOM automation on `RECIPE_EXPIRED`** and still complete the task (FSB's universal
  fallback — PROJECT.md keeps the DOM engine as the floor). On successful DOM completion, **re-learn**
  the corrected recipe via capture.
- **Demote/quarantine** repeatedly-failing recipes so the catalog doesn't keep routing to a dead path.

**Warning signs:**
Rising `RECIPE_EXPIRED` / fallback-rate per origin; tasks "succeeding" with empty result sets; a recipe
that hasn't been re-validated in N vendor-weeks; user reports of stale/wrong data on a previously-working
capability.

**Phase to address:** **P-G (Recipe-rot detection + self-healing DOM fallback + re-learn loop)** —
depends on P-B (fetch), P-F (capture/re-learn), and the existing DOM engine.

---

### Pitfall 6: Capability-search recall/precision failure → model never finds the tool, or invokes the wrong one

**What goes wrong:**
Progressive disclosure (`search_capabilities` → `invoke_capability`) means the catalog is only as good
as search. Two failure modes:
- **Low recall:** the model searches "message my team" but the Slack capability is indexed as
  "post chat.postMessage"; the search misses, the model falls back to slow DOM automation or gives up —
  the entire fast-path investment yields nothing because it's undiscoverable.
- **Over-broad / low precision:** a fuzzy match surfaces a wrong-but-plausible capability (a *delete*
  when the user wanted *archive*; the wrong service's "send"), and because state-changing API calls
  execute with the user's real credentials, a mis-invocation is a **real destructive action**, not a
  recoverable click.

**Why it happens:**
Catalog grows to thousands of entries (the long tail) with terse, API-named descriptions; embeddings/
keyword indexes built from endpoint names don't match user/agent intent vocabulary; no disambiguation
step before a high-consequence invoke.

**How to avoid:**
- Index capabilities on **intent-phrased synonyms + service + action verb + side-effect class**, not
  just endpoint names. Curate aliases for head capabilities; auto-generate intent descriptions for
  learned recipes and keep them human-reviewable.
- Return **scored, ranked, origin-scoped** results with the side-effect class (read vs mutate vs
  destructive) visible to the model so it can disambiguate.
- For destructive/mutating capabilities, require an **explicit confirm/disambiguation** before invoke
  (ties into Ask consent) — never let a fuzzy top-1 auto-fire a delete.
- Build an **evaluation harness**: a fixed set of intent→expected-capability pairs measuring recall@k
  and wrong-invoke rate; gate the milestone on thresholds (FSB has precedent — the 50-prompt edge-case
  harness from v0.9.7).
- Constrain search to **consented origins** so an irrelevant high-stakes capability can't even surface.

**Warning signs:**
High DOM-fallback rate on tasks that *have* a capability (recall miss); any wrong-invoke in eval;
catalog entries with empty/auto-generated-only descriptions; top-1 invoked without disambiguation on
mutating ops.

**Phase to address:** **P-C (Capability search/index + dispatcher surface)** with the eval harness as a
gate; disambiguation-before-mutate also touches **P-D (consent)**.

---

### Pitfall 7: MV3 service worker eviction mid-API-call → lost in-flight request, ambiguous mutation state

**What goes wrong:**
Chrome terminates the SW after ~30s idle, and **an in-flight `fetch` awaiting a slow server counts as
idle** — the SW dies, the promise is abandoned, the response is lost. For a **mutating** API call
(POST a message, create an issue), this is the dangerous case: FSB doesn't know whether the server
applied the change. Naive retry = duplicate action (two issues, two messages). This is a documented MV3
failure (`fetch` terminated at 30s; worker killed if an event takes >5min).

**Why it happens:**
Engineers assume `await fetch()` keeps the SW alive; it does not past the idle window. The capability
runtime, if it lives in the SW (the wrong place per Pitfall 2 anyway), inherits this.

**How to avoid:**
- **Reuse FSB's proven survival machinery, do not reinvent it.** FSB already solved exactly this for
  `run_task` (Phase 239): persist a per-call state envelope to `chrome.storage.session`, return a
  `partial_state` / `sw_evicted` outcome, and recover on SW revival via the resume-sidecar
  (`mcp-task-store.js` pattern). The Lattice survivability adapter + ResumePolicy taxonomy
  (`SAFE` / `ON_ERROR` / `RECOVERY_AMBIGUOUS`) from v0.10.0 already classifies mid-request states.
- **Idempotency for mutations:** before re-issuing a mutating call after an ambiguous eviction, treat it
  as `RECOVERY_AMBIGUOUS` — do **not** blind-retry. Where the target API supports idempotency keys or a
  read-back ("did my issue get created?"), use it; otherwise surface the ambiguity to the user rather
  than risk a duplicate.
- Keep long calls off the bare SW timer: drive them through the CDP/page context (which is tab-scoped)
  and/or chunk with `chrome.alarms` re-arming, mirroring the trigger/`run_task` patterns.

**Warning signs:**
Duplicate mutations after flaky network; capability calls that "hang then vanish"; recovery code that
blind-retries POSTs; reliance on a single `await fetch` in the SW with no persisted checkpoint.

**Phase to address:** **P-B (fetch primitive)** must build on the resume-sidecar from the start;
mutation-ambiguity handling is part of **P-G (self-healing)** recovery policy.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Recipe format allows a small "transform expression" string | Covers more long-tail cases without a new bundled op | **WALL 1 ban risk** — it's now an interpreter for remote code | **Never** |
| Put the fetch primitive in the SW because "CORS is easy there" | Fast to wire, bypasses CORS | Sends extension-origin cookies → auth silently absent (Pitfall 2) | Only for genuinely unauthenticated cross-origin calls |
| Store the captured persisted-query **hash** only | Tiny recipe, fast | Rots on the vendor's next deploy with no recovery path (Pitfall 5) | Only if the full query body is *also* stored as fallback |
| Blind-retry a failed capability call | Simple recovery | Duplicate mutations after SW eviction (Pitfall 7) | Only for provably idempotent reads |
| Capability descriptions auto-generated from endpoint names | Zero curation cost | Recall collapse — model can't find tools (Pitfall 6) | MVP for *read-only* head capabilities only, with eval gating |
| Default authenticated replay to Auto to "make it feel fast" | Better demo | Inverts the safe brand; credential-replay-by-default (Pitfall 3) | **Never** — default Off, opt-in per origin |
| POST captured calls to FSB server for "learning" | Easy cross-device recipes | Exfiltrates auth; Limited-Use violation (Pitfall 4) | Only after scrub-to-shape with a tested redactor |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **HttpOnly session cookies** (generic) | Trying to read the cookie value to put in a header | You can't (by design). Replay the *session*: issue from page origin with `credentials` or via CDP network stack so the browser attaches it. |
| **Slack-style split tokens** (`xoxc` JS-token + `xoxd` HttpOnly cookie) | Capturing only the bearer `xoxc` and replaying from the SW | Need **both** the `xoxc` header *and* the `xoxd` cookie attached — and the cookie only rides via page-origin/CDP context. Both rotate on session invalidation; treat as session-scoped, never persisted long-term. |
| **GraphQL APQ (persisted queries)** | Storing the hash, sending it forever | Handle `PersistedQueryNotFound`: fall back to full query body (keep it) or re-scan the JS bundle for the new hash. |
| **GraphQL mutations via APQ/GET** | Assuming APQ endpoints are CSRF-safe | Mutations through GET-able APQ can bypass cookie/CSRF protections — exactly the surface that makes a poisoned recipe dangerous; gate mutations hard (Pitfall 3). |
| **Per-request CSRF nonce** | Capturing one nonce and replaying it | The nonce is single-use/burned; re-read a fresh one each session or fall back to DOM (WALL 2). |
| **Signed/HMAC request params** | Trying to capture-and-replay the signature | Impossible generically — secret+algo are in page JS, signature is per-request. DOM fallback only (WALL 2). |
| **`chrome.debugger` for network capture/replay** | Assuming it's invisible to the user | Attaching triggers an **un-suppressable yellow "started debugging this browser" banner** (only a launch flag/group-policy hides it — neither available to a Web Store install). Budget for the UX hit; don't attach more/longer than needed. FSB already attaches for CDP input, so the banner is a known quantity — but network capture may extend attach duration. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Always-on CDP `Network.enable` to "learn" every page | Battery drain, slow pages, banner anxiety, huge capture volume | Enable network capture **only during an explicit discovery/learn action** on a consented origin; detach promptly | Continuous background capture across `<all_urls>` |
| Linear scan of a thousands-entry catalog per search | Search latency grows with the long tail; MCP context bloat | Index once; rank top-k; never dump the full catalog into the model (the whole point of progressive disclosure) | Catalog > a few hundred entries |
| Re-scanning a vendor JS bundle (hash discovery) on every call | Slow, fragile, rate-limit risk | Cache the discovered hash with the recipe; re-scan only on `PersistedQueryNotFound` | Hot-path calls that re-derive the hash each time |
| Persisting hot per-call capability state to `chrome.storage.local` | Quota churn (shared 10MB), slow | Use `chrome.storage.session` for hot/in-flight state; `local` only for durable recipe definitions (mirrors trigger/`run_task`) | High call volume |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Recipe can target an arbitrary origin | Credential redirection / exfiltration against any logged-in site | **Origin-pin**: request origin must equal consented capability origin; reject mismatches in the interpreter |
| Server-delivered recipes trusted on TLS alone | CDN/MITM swaps a recipe body → drives user's session maliciously | **Sign recipes** (Ed25519/JCS via Lattice receipts); verify before execute |
| Captured auth persisted or sent off-device | Token/cookie theft; Limited-Use violation | Auth **strictly local**; redact-before-persist; scrub learned recipes to shape-only; tested redactor |
| Mutating capability auto-fires on fuzzy search match | Real destructive action with user's credentials | Side-effect class in search results; confirm/disambiguate before mutate; Ask-consent for state changes |
| Auto consent enabled globally / by default | Silent credential replay = the stealth-scraper behavior FSB explicitly rejects | Default **Off**; per-origin opt-in; sensitive-origin friction even in Auto |
| Audit log omits API replays (only logs DOM actions) | No forensic trail for the highest-risk action class | Audit log must record every authenticated invoke: origin, capability, method, side-effect class, consent state, outcome — **completeness is a requirement, not a nicety** |
| Learned recipe promoted without review/scoping | Poisoned/over-broad capability auto-grows the catalog | Scope learned recipes to origin + side-effect class; quarantine until validated; never auto-promote mutations to Auto |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Debugger banner appears whenever capture/replay runs | User alarmed; trust erosion on a "safe" product | Explain the banner up front; minimize attach windows; only capture on explicit learn |
| Ask-consent prompt shows only "call API?" | User can't judge risk; rubber-stamps a mutation | Show **origin + method + side-effect class + human-readable action** ("Send a message in #general on Slack") |
| Silent fast-path with no indication auth was replayed | User doesn't realize FSB acted with their credentials | Surface in the audit log / activity feed which actions used authenticated replay vs DOM |
| Wrong-tool invoke produces a destructive action | Irreversible data loss | Disambiguate before mutate; show what will happen before it happens |

## "Looks Done But Isn't" Checklist

- [ ] **Recipe interpreter:** compiles and runs head capabilities — but verify it has **no `eval`/`new
  Function`/`import()` path** and **rejects unknown opcodes** (WALL 1). A CI guard exists and fails on
  violation.
- [ ] **Authenticated fetch:** returns 200 against a same-origin fixture — but verify it returns the
  **logged-in data shape** (not logged-out) against a real authenticated site, from the **chosen
  context** (Pitfall 2). HttpOnly-cookie sites included in the test matrix.
- [ ] **Persisted-query capability:** works today — but verify it **handles `PersistedQueryNotFound`**
  with a body-fallback or re-scan (Pitfall 5), not just the happy hash path.
- [ ] **Mutation under SW eviction:** completes normally — but verify an eviction mid-POST yields
  `RECOVERY_AMBIGUOUS` and does **not** blind-retry (Pitfall 7).
- [ ] **Consent:** Off/Ask/Auto toggles exist — but verify default is **Off**, Auto is per-origin opt-in,
  and a recipe **cannot cross origins** even with consent (Pitfall 3).
- [ ] **Auth locality:** learning works — but verify **no auth field** (cookie/authorization/token/csrf)
  is persisted or sent to FSB's server (Pitfall 4); the redactor has a test.
- [ ] **Audit log:** logs tasks — but verify it logs **every authenticated API invoke** with origin/
  method/side-effect/consent/outcome (completeness).
- [ ] **Capability search:** returns results — but verify **recall@k and wrong-invoke rate** against a
  fixed eval set meet a gate (Pitfall 6); mutating ops require disambiguation.
- [ ] **INV-01:** new tools added — but verify the **existing ~63 MCP tool schemas are byte-identical**
  (additive-only; parity test green). New surface is just `search_capabilities` + `invoke_capability`.
- [ ] **DOM fallback:** fast path works — but verify a forced `RECIPE_EXPIRED` actually **drops to DOM
  automation and completes the task**, then re-learns (Pitfall 5).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Web Store ban for remote code (WALL 1) | **HIGH** | Strip the interpreter to closed-opcode-only, resubmit, appeal; meanwhile users on the banned version are stranded. Avoidance >> recovery. |
| Wrong execution context (Pitfall 2) | MEDIUM | Re-route the fetch to page-origin/CDP context; add the logged-in-shape smoke test; usually a contained fix if caught before launch |
| Recipe rot (Pitfall 5) | LOW–MEDIUM | `RECIPE_EXPIRED` → DOM fallback completes the task → capture re-learns the recipe; quarantine the dead one. This is the *designed* steady state. |
| Duplicate mutation from eviction retry (Pitfall 7) | MEDIUM–HIGH | Depends on the target API's undo; prevention (idempotency/ambiguity-surfacing) is the only reliable path |
| Auth exfiltration to server (Pitfall 4) | **HIGH** | Rotate/revoke any leaked credentials, purge server, disclose; treat as an incident. Prevent by never sending auth. |
| Capability mis-invoke destructive action (Pitfall 6) | **HIGH** | Often irreversible; rely on pre-mutate disambiguation + Ask consent, not post-hoc recovery |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase (slot) | Verification |
|---------|-------------------------|--------------|
| 1 — Recipe = remote code (WALL 1) | **P-A** Recipe schema + bundled interpreter | CI guard fails on `eval`/`new Function`/`import(`; schema rejects unknown opcodes; homepage Limited-Use/compliance note |
| 2 — Wrong fetch context (auth absent) | **P-B** Auth fetch primitive + context contract | Smoke test: logged-in data shape returned from chosen context against a real authenticated + HttpOnly site |
| 3 — Credential-replay weapon / safe-brand inversion | **P-D** Consent + origin pinning (+ enforce pin in **P-B**) | Default Off verified; cross-origin recipe rejected; recipe signature verified before execute; mutation gating |
| 4 — Auth exfiltration via server | **P-D** policy + **P-F** capture-time redaction | Redactor test: no cookie/authorization/token/csrf survives into any server-bound payload or persisted learned recipe |
| 5 — Recipe rot / expiry | **P-G** Rot detection + DOM self-heal + re-learn | Forced `PersistedQueryNotFound`/changed-param → typed `RECIPE_EXPIRED` → DOM fallback completes → re-learn |
| 6 — Capability-search recall/precision | **P-C** Search/index + dispatcher (+ disambiguate in **P-D**) | Eval harness: recall@k threshold + zero wrong-invoke; mutating ops require confirm |
| 7 — SW eviction mid-call / duplicate mutation | **P-B** (resume-sidecar from day one) + **P-G** (ambiguity policy) | Eviction mid-POST → `RECOVERY_AMBIGUOUS`, no blind retry; reuse `run_task`/Lattice survival |
| INV-01 wire-contract drift / tool-bloat creep | **P-C** dispatcher surface | Parity test: existing ~63 tool schemas byte-identical; only 2 tools added; progressive disclosure keeps catalog out of MCP context |
| ToS/legal of internal-API calls (see note below) | **P-D** consent/disclosure + **P-H** (legal posture doc) | User-initiated + authenticated + supervised posture documented; per-origin consent; honors robots/ToS denylist where applicable |

## ToS / Legal posture (h + i)

Calling a service's **internal/undocumented** API with the user's own authenticated session is legally
distinct from anonymous public scraping, but not risk-free:
- **CFAA (`hiQ v. LinkedIn`):** accessing **public** data is unlikely to be "unauthorized access," but
  **contractual ToS** can still make automated access a breach — and many ToS prohibit automating the
  service or using non-public/internal endpoints. The user is the one bound by that contract; FSB
  automating *on the user's behalf, with the user's credentials, under explicit supervision* is the
  defensible framing, but it does not immunize the user from a ToS claim.
- **Internal-API specifics:** vendors explicitly disclaim compatibility for browser-session tokens
  (Slack `xoxc`/`xoxd` are "outside any compatibility guarantees") and may treat reverse-engineered
  endpoints as a violation; expect breakage *and* possible account-level enforcement on aggressive use.
- **Posture for FSB (reinforces the brand, not undermines it):** keep it **user-initiated, supervised,
  default-off, per-origin-consented, auth-local**; do **not** create fake accounts or evade
  authentication (the `hiQ` exception that *does* trigger CFAA); honor an origin denylist for services
  that contractually forbid automation; document that FSB replays the *user's own* session for the
  *user's own* data — it is an assistant, not a stealth scraper. This is the explicit "supervised / not
  a stealth scraper" positioning from PROJECT.md / INV framing.

**Phase to address:** **P-D** (consent/disclosure surface) and a short **P-H** legal-posture +
denylist/ToS-respect doc (low-code, high-leverage — protects the brand and INV positioning).

## Sources

- [Deal with remote hosted code violations — Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code) — RHC = "executed by the browser … loaded from someplace other than the extension's own files … JavaScript and WASM"; "does _not_ include data or things like JSON or CSS." **HIGH**
- [Improve extension security — Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security) — explicitly prohibits "building an interpreter to run complex commands fetched from a remote source, even if those commands are fetched as data"; recommends remote JSON config feeding bundled logic. **HIGH**
- [Chrome Web Store review process](https://developer.chrome.com/docs/webstore/review-process) — sensitive/broad permissions (debugger intercepts HTTPS) and hard-to-review code lengthen/fail review. **HIGH**
- [Chrome Web Store Program Policies — Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use) + [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) — "logins, passwords, and authentication cookies" are sensitive user data; secure-transmission + disclosure requirements; no third-party transfer. **HIGH**
- [Cross-origin network requests — Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) — content scripts are bound to the **page origin** and subject to SOP; SW/extension fetches cross origins via `host_permissions`. (Cookie-origin consequence is a documented *gap* — verified, inferred from origin semantics.) **HIGH (origin) / MEDIUM (cookie inference)**
- [MV3 fetch terminated at 30s — chromium-extensions group](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/eBtJrgOgCTM) + [SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) — in-flight fetch counts as idle; SW killed at ~30s idle / >5min event. **HIGH**
- [chrome.debugger API reference](https://developer.chrome.com/docs/extensions/reference/api/debugger) + [hiding the debugging banner (Leapwork/UiPath)](https://support.leapwork.com/s/article/HowtohidetheLeapworkextensionstarteddebuggingthisbrowsermessagefromtheChromeandEdge633088216d6c2) — un-suppressable warning bar; only `--silent-debugger-extension-api` launch flag / group policy hides it. **HIGH**
- [GraphQL persisted queries / APQ — Apollo docs](https://www.apollographql.com/docs/apollo-server/performance/apq) + [Reverse-engineering persistedQuery — Crawlee](https://crawlee.dev/blog/graphql-persisted-query) + [GraphQL CSRF via APQ — Doyensec](https://blog.doyensec.com/2021/05/20/graphql-csrf.html) — `PersistedQueryNotFound` recovery by resending full body; hash rots on client bundle change; APQ-over-GET mutation CSRF bypass. **HIGH**
- [Slack token formats xoxc/xoxd — slack-token-extractor](https://github.com/maorfr/slack-token-extractor) + [papermtn: retrieving Slack cookies](https://www.papermtn.co.uk/retrieving-and-using-slack-cookies-for-authentication/) — `xoxc` JS bearer + `xoxd` HttpOnly cookie; both required; rotate on session invalidation; "outside any compatibility guarantees." **HIGH (auth mechanics) / MEDIUM (as proxy for OpenTabs github-api.ts, which was not on disk)**
- [HttpOnly cookies + fetch credentials — MDN Using Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) + [Zell Liew: fetch credentials](https://zellwk.com/blog/fetch-credentials/) — HttpOnly unreadable by JS; `credentials:'include'`/`'same-origin'` semantics. **HIGH**
- [SameSite cookies explained — web.dev](https://web.dev/articles/samesite-cookies-explained) + [Bypassing SameSite — PortSwigger](https://portswigger.net/web-security/csrf/bypassing-samesite-restrictions) — Lax/Strict block cross-site cookie sending; affects which context can carry the session. **HIGH**
- [CSRF Prevention Cheat Sheet — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) + [MDN CSRF](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF) — per-request (single-use) tokens cannot be replayed; per-session tokens can within session. **HIGH**
- [hiQ v. LinkedIn analysis — White & Case](https://www.whitecase.com/insight-our-thinking/web-scraping-website-terms-and-cfaa-hiqs-preliminary-injunction-affirmed-again) + [Loeb & Loeb](https://www.loeb.com/en/insights/publications/2022/05/ninth-circuit-provides-path-forward-for-web-scraping-of-public-data) — public data ≠ CFAA "unauthorized"; ToS breach still actionable; fake-account/auth-evasion is the CFAA-triggering exception. **HIGH**
- FSB codebase (primary, authoritative for integration): `extension/manifest.json` (`debugger` + `<all_urls>` already present; `unlimitedStorage`); `extension/background.js` (169 `chrome.debugger` refs — CDP `Input` only today, `Network.*` is NEW surface); `.planning/PROJECT.md` (INV-01..04, default-off API replay, supervised positioning, `run_task` Phase 239 SW-eviction `partial_state`, v0.9.69 telemetry + Limited-Use/privacy-policy work, Lattice receipts/ResumePolicy from v0.10.0); `.planning/research/STACK.md` (`mcp-task-store.js` resume-sidecar, `chrome.storage.session` hot-state discipline, `redactForLog`, zero-dep bias). **HIGH**

---
*Pitfalls research for: authenticated-API replay + declarative recipe interpreter + capability search on an MV3 Chrome extension (FSB v0.9.99 Native Capability Catalog)*
*Researched: 2026-06-19*
