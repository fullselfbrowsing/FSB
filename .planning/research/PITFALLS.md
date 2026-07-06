# Pitfalls Research

**Domain:** Bulk-importing the full ~119-app OpenTabs surface (2,523 ops) into FSB's existing capability catalog, UNDER the just-shipped opt-out "Auto" consent default (v0.9.99 Phase 30)
**Researched:** 2026-06-23
**Confidence:** HIGH (grounded in live `gh` inspection of `opentabs-dev/opentabs` @ HEAD — 119 plugins confirmed, real auth/op shapes read — cross-checked against FSB's shipped `service-denylist.json`, `docs/LEGAL.md`, and the v0.9.99 STATE.md risk register / Architectural Walls)

> **Scope note.** These are the mistakes SPECIFIC to *this* bulk import under *this* consent posture. The v0.9.99 risk register (STATE.md "Top Risks") already covers the single-app failure modes (interpreter-as-code, wrong-context fetch, recipe rot, search recall). Everything below is what changes when those failure modes are multiplied by 119 apps and run under an **opt-out** gate whose only hard floor is a **4-origin** denylist.

---

## THE HEADLINE PITFALL (read this first)

### Pitfall 1: The security-ordering trap — opt-out Auto makes finance/health/social apps WRITABLE the moment their descriptor lands, BEFORE the denylist covers them

**What goes wrong:**
Consent flipped to **opt-out Auto** in v0.9.99 Phase 30 (`docs/LEGAL.md`: *"read-Auto implies write-Auto … side-effecting invocations (POST/PUT/PATCH/DELETE) run without a separate elevated opt-in"*). The **only** hard block is `extension/config/service-denylist.json`, which today denies exactly **four** origins: `chase.com`, `bankofamerica.com`, `wellsfargo.com`, `irs.gov`.

The OpenTabs set being imported contains **six finance/crypto/brokerage apps** — `stripe`, `coinbase`, `robinhood`, `fidelity`, `carta`, `ynab` — and **none** of them is on the denylist. The instant a Stripe descriptor is registered and resolvable through `search_capabilities` → `invoke_capability`, the gate's order of operations (`docs/LEGAL.md`: *"The denylist is consulted first, before the consent mode"*) finds Stripe **not denied**, mode **Auto**, and runs it with **no prompt** — including the destructive mutations that ship in the OpenTabs Stripe plugin, confirmed by source: `void_invoice` (`POST /v1/invoices/{id}/void`), `delete_customer`, `finalize_invoice`, `create_invoice`, `create_price`. The same applies to `coinbase`/`robinhood` (trades, transfers) and `fidelity` (brokerage). **Importing the descriptor IS the act of arming a credential-replay weapon against the user's real money, with no per-call consent.**

If descriptor import (Breadth) lands in a phase **before** denylist expansion, there is a window — even a single merged commit, even a single dev build loaded — where the catalog can move money via the logged-in session silently. This is the inverse of the "safe brand" the v0.9.99 register already flagged ("Credential-replay weapon / safe-brand inversion"), now triggered structurally by import ordering rather than by a missing per-origin default.

**Why it happens:**
Three forces line up: (1) the natural roadmap instinct is "import the catalog first, harden later" (Breadth is the headline feature); (2) the denylist looks "done" because it shipped in Phase 30 — but it was sized for a **4-service head**, not a 119-app surface; (3) the opt-out default means "absence from the denylist" silently equals "fully writable," so a *gap* in a config file is indistinguishable from an *allow* decision. Nobody writes code that says "allow Stripe writes" — they just fail to add Stripe to a JSON array, and the opt-out posture does the rest.

**How to avoid:**
- **Denylist expansion MUST be phase-sequenced FIRST** — before any finance/health/social descriptor is *reachable*. PROJECT.md already states the intent (*"Denylist expansion (lands FIRST) … before any finance/health/social app is reachable under the shipped opt-out Auto default"*); the roadmap must make this a **hard phase dependency**, not a parallel track. The very first v1.0.0 phase (Phase 35) is denylist expansion + the enforcement that makes it un-bypassable.
- **Add an import-time gate, not just a runtime gate.** The build-time descriptor generator (`scripts/package-extension.mjs` → `recipe-index.generated.js`) should **refuse to emit** a descriptor whose origin/category is on a "must-be-classified" list unless that origin already appears in `service-denylist.json` (denied or sensitive) OR is explicitly marked `domOnly`/`readOnly`. This makes the ordering a **CI failure**, not a review-time hope: you physically cannot ship a Stripe descriptor before Stripe is classified.
- **Classify by category, not by enumerating origins one-by-one.** The current denylist is host-pattern based and hand-curated. For 119 apps, derive a category map (finance, health, payments, brokerage, crypto) from the OpenTabs manifest set and expand `deniedOrigins`/`sensitiveOrigins` from it, so a *new* finance app added later inherits the floor. Cover at minimum: `dashboard.stripe.com`, `*.coinbase.com`, `robinhood.com`, `*.fidelity.com`, `*.carta.com`, `*.ynab` — plus health/insurance categories absent from the OpenTabs set today but likely in any catalog growth.
- **Re-decide the write-Auto default for sensitive categories.** `docs/LEGAL.md` currently says sensitive-origin friction was *removed* from the invoke gate under Auto ("Sensitive-origin friction remains on discovery only"). At 119-app scale with real brokerages in the set, the roadmap should re-evaluate whether **mutating** invokes against `sensitiveOrigins` should re-acquire the elevated opt-in that the per-origin mutating flag already models in storage (it exists, it's just not enforced at the gate under Auto). This is a posture decision the roadmapper must surface, not silently inherit.

**Warning signs:**
- A descriptor for any of {stripe, coinbase, robinhood, fidelity, carta, ynab} is resolvable via `search_capabilities` while the same origin is absent from `service-denylist.json`.
- The roadmap has "import all 119 descriptors" and "expand denylist" in the same phase, or import earlier.
- A new `deniedOrigins` entry is added by hand-editing JSON with no test asserting "every imported finance-category origin is denied-or-sensitive."
- `git log` shows the descriptor-index regenerated in a commit that does not also touch `service-denylist.json`.

**Phase to address:**
**Phase 35 — Denylist Expansion + Import-Time Classification Gate (LANDS FIRST, hard dependency for every later import phase).** No descriptor-import phase may merge until this phase's CI gate (descriptor generator refuses unclassified sensitive origins) is green.

---

## Critical Pitfalls

### Pitfall 2: Cloning the imperative model — the bundled head grows into per-app handler sprawl and trips MV3 "code fetched as data" / Web-Store ban at scale

**What goes wrong:**
Each of the 119 OpenTabs plugins is a **full npm package of imperative TypeScript** — confirmed by source: `plugins/stripe/src/tools/` alone holds **31 hand-written `.ts` handlers** (`void-invoice.ts`, `create-customer.ts`, …), each with a `handle: async params => { … fetch … }` body. That is the exact `npm-per-plugin` model FSB's v0.9.99 strategy explicitly rejects (PROJECT.md: *"port + learn, do NOT clone OpenTabs' npm-per-plugin model"*). The bulk-import temptation is to "just port the handlers" for breadth. Two failure modes follow at scale:
1. **Web-Store-ban risk (Wall 1).** If breadth is achieved by *bundling thousands of imperative handlers*, the extension balloons and — more dangerously — pressure mounts to *stream* new handlers from FSB's server as the catalog grows (the long tail is the whole point). The moment a server-delivered blob carries control flow, FSB is shipping **remotely-hosted code as data** → MV3 violation → review rejection / store ban. The v0.9.99 CI guard (`verify-recipe-path-guard.mjs`) fails on `eval`/`new Function`/`import(` in the recipe path, but it only guards the **six-file recipe-path allowlist** — it does NOT stop someone adding a 120th `capability-<app>.js` imperative handler module to the *bundled head* and quietly normalizing per-app handlers as the growth pattern.
2. **The head stops being curated.** v0.9.99's design is breadth = closed-vocab **descriptors** + tiered backing; depth = a **small curated head** (~15–30 hand-ported apps); tail = **learned** discovery. If "hand-port" creep turns the head into "port everything OpenTabs hand-wrote," the head becomes the 2,523-op imperative surface by another name.

**Why it happens:**
The OpenTabs source is *right there* as MIT TypeScript, and copying a working `handle()` is faster than authoring a closed-vocab descriptor + recipe + (for the head) a careful `executeBoundSpec` handler. "Breadth" reads as "make all 2,523 ops work," when the milestone actually defines breadth as "make all 119 apps **discoverable** (descriptors return from search)," with invocation tiered.

**How to avoid:**
- **Hold the v0.9.99 architecture verbatim:** breadth = **descriptor import only** (slug, intent synonyms, action verb, side-effect class, params JSON-Schema) — *data*, generated build-time, NOT handlers. PROJECT.md is explicit: *"Breadth = descriptor import + tiered backing (NOT 2,523 hand-written code handlers)."* The roadmapper must keep the descriptor-import phase strictly free of new imperative modules.
- **Cap and gate the head.** Depth is ~15–30 apps (PROJECT.md). Add a CI assertion on `HEAD_HANDLER_MODULES` count / an explicit allow-list of head apps so the head cannot silently grow past the curated set. Each head handler stays `executeBoundSpec`-only (Phase 29 D-12), targeting its **own first-party origin**, exactly like the existing github/slack/notion handlers.
- **Extend the recipe-path CI guard's drift check to the head.** The Phase 26 guard already has an "allowlist-drift check [that] forces new `capability-*.js` modules onto the list." Make adding a head handler a **deliberate, reviewed** allowlist edit (it already is for the recipe path) AND assert no head handler contains server-fetched control flow — so growth is friction-ful and visible.
- **The tail is learned, never streamed-as-code.** The long tail beyond the head is reached via Phase 31 network-capture discovery → **closed-vocab learned recipes** (data), never via server-delivered handlers. Keep that boundary; never let "we need the tail to work" become "stream a handler."

**Warning signs:**
- A new `extension/utils/capability-<appname>.js` imperative handler appears for a long-tail app that should have been descriptor-only.
- `HEAD_HANDLER_MODULES` grows beyond the curated ~15–30 without a milestone decision.
- Any proposal to "fetch the handler for app X from the server" / a recipe field that smells like control flow (`steps[].then`, `transform`, `script`).
- The generated descriptor index file starts carrying executable strings rather than pure descriptor metadata.

**Phase to address:**
**Phase 36 — Breadth: Descriptor Import (data-only, all 119)** keeps imperative code out of breadth; **Phase 37 — Depth: Curated Head Expansion** enforces the head cap + the recipe-path-guard drift gate. The Wall-1 CI guard from Phase 26 carries forward as the enforcement spine.

---

### Pitfall 3: One-size codegen vs. per-app auth diversity → descriptors that bind to the wrong shape and silently return wrong/empty results

**What goes wrong:**
FSB's `authStrategy` enum is **locked at four members** (Phase 26 D-08, frozen). The OpenTabs apps do **not** share four auth shapes — they each hand-roll a bespoke one. Confirmed by reading three plugins' API layers:
- **Stripe** (`stripe-api.ts`): scrapes **four** page-globals off `window` — `PRELOADED.session_api_key` (→ `Authorization: Bearer`), `PRELOADED.csrf_token` (→ custom `x-stripe-csrf-token` header), `PRELOADED.merchant.id` (→ `Stripe-Account` header), `STRIPE_VERSION` (→ `Stripe-Version` header) — then POSTs `application/x-www-form-urlencoded` to same-origin `/v1`.
- **Linear** (`linear-api.ts`): GraphQL against a **separate subdomain** `client-api.linear.app` (NOT the page origin), relying on `SameSite=Strict` HttpOnly cookies carried by `credentials:'include'`, plus a non-HttpOnly `loggedIn` indicator cookie and `linear-client-id` / `organization` headers read from cache.
- **Instagram** (`instagram-api.ts`): reads the **rotating** `csrftoken` cookie *fresh on every call* (→ `X-CSRFToken`), plus `X-IG-App-ID`, to same-origin `/api/v1`.
- (For contrast, the apps FSB already hand-ported show the same spread: GitHub = persisted-query `/_graphql` + `from:'response'` CSRF scrape; Slack = split-token `xoxc` in body + `xoxd` HttpOnly cookie.)

A descriptor codegen that maps every app to one of four generic auth strategies will produce a **bind that compiles and validates but is wrong**: missing the `Stripe-Account` header, sending to the wrong subdomain, using a stale CSRF token. The interpreter binds successfully, the fetch goes out, and the server returns **401/403, an empty list, or — worst — a 200 with a logged-out-shaped body**. Because there is no per-call prompt under Auto and the result is *shaped* like a valid response, the user/agent sees "0 results" or a confidently-wrong answer and never knows the bind was broken. At 119 apps this is not an edge case — it is the **default outcome** for every app whose real auth doesn't fit the enum.

**Why it happens:**
Codegen from manifests is a mechanical mapping; auth is the one part that is *irreducibly bespoke per app* and lives in the imperative `*-api.ts` body, not in the manifest metadata. The enum was sized (correctly) for the **curated head**, where each app's auth is hand-verified. Extending descriptor *breadth* to 119 apps does not extend the enum's coverage — but it's easy to assume "descriptor generated = capability works."

**How to avoid:**
- **Decouple "discoverable" from "invocable" in the descriptor itself.** Every imported descriptor carries a backing-tier marker. Only apps with a **verified** auth path (hand-ported head, or a learned recipe that *replayed clean*) are marked invocable; the rest are **descriptor-only / discovery-pending** (see Pitfall 9). Codegen must NOT mint an invocable declarative recipe for an app whose auth shape was never confirmed.
- **Do not auto-emit a declarative recipe from a guessed auth strategy.** A recipe is only minted for the tail via Phase 31 capture+synthesis, which **observes the real request** (real endpoint, real headers, real auth placement) and then *replays it to confirm* before promoting (Phase 31 `promoteAfterReplay` — *"promotes only on a clean injected replay"*). That observe-then-confirm loop is the only safe way to reach a bespoke auth shape declaratively. Guessing from a manifest is not.
- **Cap the synthesizer to declarative-executable auth** (already a Phase 31 decision: *"NEVER emits `csrf.from:'response'`"*). Response-minted CSRF (GitHub-style) and multi-part page-global scrapes (Stripe-style) are **head-only** — they require an imperative handler. The descriptor for such an app stays discovery-only until hand-ported. Make this explicit so codegen doesn't silently downgrade a Stripe-shaped auth into a generic same-origin-cookie strategy.
- **Add an "auth-shape coverage" report to the import.** For each imported app, classify its real auth (from the OpenTabs `*-api.ts`) into {fits-enum / head-only / learn-only / unsupported} and assert the descriptor's invocability marker matches. An app whose auth is "head-only" but marked invocable-declarative is a **build failure**.

**Warning signs:**
- An app returns HTTP 200 with an empty collection or a logged-out body shape on first invoke (the silent-wrong signature).
- A declarative recipe exists for stripe/linear/instagram (these are head-or-learn-only by auth shape; a hand-authored declarative recipe is almost certainly wrong).
- The codegen maps >4 distinct real auth shapes onto the 4-member enum without a "head-only/learn-only/unsupported" escape hatch.
- Invoke succeeds but the response fails the Phase 32 expected-shape assertion (this is rot-detection catching a never-worked bind, not a rotted one).

**Phase to address:**
**Phase 36 — Breadth (descriptor invocability markers, auth-shape coverage report)** sets the discoverable≠invocable contract; **Phase 38 — Discovery Seeding/Hardening** (extends Phase 31) is where the bespoke tail auth gets *observed and replayed-clean* rather than guessed. The Phase 32 expected-shape assertion is the runtime backstop.

---

### Pitfall 4: Descriptor-vs-recipe side-effect mismatch — a mis-authored side-effect class under-states a destructive op, at 2,523-op scale

**What goes wrong:**
Each descriptor carries a **side-effect class** (read / mutate / destructive) that the consent gate and search ranking depend on. v0.9.99 already guards the single-app case: Phase 28 D-02 cross-checks the *authored* `sideEffectClass` against the *recipe-method-derived* class and lets the **recipe win** so "a mis-authored descriptor cannot under-state a destructive search hit." But that guard derives the class from the **recipe's HTTP method** — which only exists for apps that have a recipe. For the **descriptor-only / discovery-pending** breadth tier (most of the 119), there is no recipe yet, so there is **nothing to cross-check against**, and the class is whatever the manifest-derived codegen guessed. The OpenTabs manifests do carry hints (Stripe's `void_invoice` description literally says "Void an open invoice"; the tool is named `void_invoice`), but a codegen that classifies by, say, HTTP verb or a keyword list will mis-class the long tail's GraphQL mutations (POST to `/graphql` looks like a "read" by method), persisted-query writes, and RPC-style endpoints (Notion's `/api/v3` is all POST). Under opt-out Auto, a destructive op **mis-labeled as read** is *fully writable with no friction* even on a sensitive origin (because the sensitive-origin friction also keys off classification).

**Why it happens:**
Side-effect class is semantically obvious to a human reading "void invoice" but is **not** reliably derivable from HTTP method (GraphQL/RPC tunnel mutations through POST) or from manifest metadata that may not exist for every op. At 2,523 ops, manual classification is infeasible and codegen will be applied uniformly — so a single bad heuristic mis-classes thousands of ops at once.

**How to avoid:**
- **Extend the Phase 28 cross-check to the descriptor-only tier.** Where there is no recipe to derive the method from, derive the class from the **OpenTabs tool metadata** that ships in the manifest — OpenTabs tools have stable signals (tool `name` verb: `create_`/`update_`/`delete_`/`void_`/`finalize_`/`get_`/`list_`/`search_`, and a `group`). Build a verb→class map and assert it; treat unknown verbs as `mutate` (fail-safe-high), never `read`.
- **Default unknown/ambiguous to the MORE destructive class.** The cross-check's "recipe wins" rule is a *downgrade-prevention* rule; preserve that bias for the descriptor tier: if authored-class and derived-class disagree, take the **more** side-effecting of the two. Never let a guess *lower* an op's class.
- **GraphQL/RPC/persisted-query endpoints cannot be classified by method.** For these (Linear, Notion, GitHub `_graphql`), the class must come from the operation name in the GraphQL document / tool name, not from "it's a POST." Flag any descriptor whose endpoint is a known GraphQL/RPC path so it can't be auto-classed `read` just because reads also POST there.
- **Audit a sample against ground truth.** Pull the destructive ops from a handful of high-risk OpenTabs plugins (stripe `void_invoice`/`delete_customer`, coinbase/robinhood trade ops) and assert the generated descriptor classes them `destructive`. This is the concrete acceptance test for the classifier.

**Warning signs:**
- A `void_`/`delete_`/`cancel_`/`finalize_`/`transfer_`/`trade_` op anywhere in the catalog has `sideEffectClass: read`.
- The classifier's only input is HTTP method, with no GraphQL/RPC carve-out.
- A POST-to-`/graphql` descriptor is classed `read`.
- Sensitive-origin friction (or future mutating opt-in) never triggers for an app you know has writes — a sign its writes are mis-classed read.

**Phase to address:**
**Phase 36 — Breadth (descriptor side-effect classification + cross-check extension)**, with the verb→class map and the destructive-op sample test as the milestone gate. Feeds directly into Pitfall 1's import-time gate (sensitive + destructive = must-be-classified-before-shippable).

---

### Pitfall 5: Token/secret leakage in logs and the audit trail, multiplied across 119 apps' bespoke auth material

**What goes wrong:**
The v0.9.99 invariant is absolute: tokens/CSRF/cookies **never** hit logs or the audit trail; head handlers scrape tokens *only* into the bound spec (Phase 29 T-29-08, T-29-09), and the audit schema is secret-free by construction (`docs/LEGAL.md`: *"never stores … cookies, tokens, CSRF values, bearer credentials"*; a test asserts no auth substring survives). That invariant was **verified against ~5 head apps with known auth field names**. Bulk import introduces **119 apps' worth of new, differently-named secret material** the redactor has never seen: Stripe's `session_api_key` / `csrf_token` / `merchant.id` page-globals, Instagram's `csrftoken`/`ds_user_id` cookies, Linear's `linear-client-id`, plus per-app bearer/nonce shapes. The leak risks specifically introduced by scale:
1. **Discovery capture (Phase 31) sees raw requests for all 119 apps.** Network-capture observes real endpoints, headers, and payloads to learn recipes. Every new app is a new chance for a token to ride through into a persisted learned-recipe envelope or a diagnostic ring buffer if the redactor's *structural* exclusion misses an app-specific field.
2. **The redactor is a denylist of known shapes, not a guarantee.** The audit "no auth substring survives" test asserts against *seeded* auth strings. New apps bring new substrings the test doesn't know to look for, so the test can stay green while a novel token leaks.
3. **Error messages.** A failed Stripe invoke whose error echoes a header value, a rate-limit `Retry-After` path, or a 403 body could carry merchant/account identifiers into the secret-free-by-construction audit `error?` field.

**Why it happens:**
A redactor/audit schema validated against a small known set is implicitly an **allowlist of what we remembered to scrub**. Scale changes the threat from "scrub the 5 fields we know" to "guarantee no field we've never seen leaks." The discovery path (Phase 31) is the highest-risk surface because it deliberately reads raw traffic.

**How to avoid:**
- **Keep capture-time redaction STRUCTURAL, not value-matching.** Phase 31 already does this right: *"capture-time redaction uses structural exclusion (never reads header values/bodies/query); redactResponse keeps only {status, mimeType}."* The rule to enforce at scale: the capture/synthesis path must **never read a header value, body, or query string** — it keeps only structure (which headers exist, status, mime). A structural redactor is app-agnostic and therefore scales to 119 unknown apps for free. Any code that reads a *value* during capture is the bug.
- **Learned recipes store SHAPE ONLY** (already a Phase 31 decision — the synthesizer caps `from:'response'` and stores descriptor shape, not captured secrets). Assert that a learned-recipe envelope can be serialized and contains no field sourced from a captured value.
- **Strengthen the audit no-leak test from "known substrings" to "high-entropy / known-key-name" detection.** Add (a) a property-style check that no audit field matches common token patterns (long base64/hex, `Bearer `, `xox[a-z]-`, `eyJ`-JWT prefix, cookie-pair shapes), and (b) a generated list of *every* auth field name from the 119 OpenTabs `*-api.ts` files, asserting none appear in any persisted log/audit/ring-buffer entry. This converts "we scrubbed what we remembered" into "we scrubbed the known universe + anything token-shaped."
- **Errors get name+message only** (already the LEGAL posture: *"errors to name and message only"*) — verify this holds for the *new* per-app `ToolError` shapes that bulk import introduces, since OpenTabs errors (e.g. `httpStatusToToolError`) may embed response detail.

**Warning signs:**
- Any capture/synthesis code path reads `request.headers[x]` *value*, `request.postData`, or query string content (vs. just key presence/status/mime).
- The audit no-leak test still asserts only against the original ~5 head apps' field names after 119 apps are imported.
- A diagnostic ring-buffer entry or learned-recipe envelope contains a high-entropy string.
- An invoke error surfaced to the user/audit contains a header value, account ID, or cookie fragment.

**Phase to address:**
**Phase 38 — Discovery Seeding/Hardening** (extends Phase 31's structural redactor + completeness test to the full 119-app field universe) is the primary owner; the audit no-leak test extension is a milestone gate spanning Phases 36–38.

---

### Pitfall 6: Catalog/search performance and SW startup degradation at thousands of descriptors

**What goes wrong:**
v0.9.99's catalog is a `minisearch` index over a *separate capability-descriptor doc*, snapshotted to `chrome.storage.local` under `fsbCapabilityIndex` with a `catalogVersion`, loaded at SW startup via `loadJSON` with a shared `INDEX_OPTIONS`. That was built and eval-gated (recall@5 = 1.000) at **~10 descriptors**. Scaling to **119 apps × up to ~30 ops each ≈ up to ~2,523 descriptors** (PROJECT.md: *"scale the build-time generator … from ~10 to thousands of descriptors"*) stresses three things the small index never tested:
1. **SW cold-start latency.** MV3 service workers are **evicted aggressively and cold-start constantly**. If the full index is deserialized from `chrome.storage.local` and rehydrated synchronously on every SW wake, a thousands-descriptor `loadJSON` adds latency to the critical path of *every* capability call (and competes with the rest of FSB's documented ordered bootstrap). A 30 ms parse at 10 docs can become a multi-hundred-ms parse + index rebuild at 2,500 docs, on *every* wake.
2. **Search recall/precision erosion.** Recall@5 = 1.000 on a ~10-doc near-neighbor fixture says nothing about precision at 2,500 docs where dozens of apps share verbs ("list invoices" exists for stripe AND quickbooks-likes; "send message" exists for slack/discord/telegram/whatsapp/teams). Near-neighbor collisions explode; a query can return 5 plausible-but-wrong-app hits, and under Auto a wrong-app *mutating* invoke is unprompted.
3. **`catalogVersion` churn + storage size.** The `catalogVersion` is a content hash; a thousands-descriptor index plus per-app provenance/attribution may approach `chrome.storage.local` practical limits and makes every rebuild a large write.

**Why it happens:**
The index design is correct but was **validated at toy scale**. The eval harness fixture is near-neighbor but small; the SW-startup cost is invisible until the index is large and the SW is evicted under real memory pressure. "It indexes fine at 10" silently assumes linear, cheap scaling.

**How to avoid:**
- **Measure SW cold-start with the FULL index before shipping it.** Add a build/CI benchmark: rehydrate the thousands-descriptor `fsbCapabilityIndex` on a cold SW and assert load time stays under a budget. This is the analog of the Phase 211 DOM-stream perf gate ("1.67 ms < 200 ms on a 5 MB fixture") — a hard numeric ceiling, measured, not assumed.
- **Lazy / deferred index hydration.** FSB already has an "ordered service-worker startup with deferred non-essential initialization" (Phase 160). The capability index is **non-essential to bootstrap** — defer its hydration off the critical path; first `search_capabilities` triggers load, subsequent calls reuse. Never block SW startup on a thousands-doc parse.
- **Re-run the eval harness at FULL scale with cross-app near neighbors.** Regenerate the recall@k / wrong-invoke fixture to include the real cross-app collisions (every "send message" app, every "list X" app). The milestone gate must be wrong-invoke = 0 **at 2,523 descriptors**, not at 10. Bias ranking by owned-tab origin (already designed — `biasByOwnedOrigin`) is the main precision lever and must be load-bearing at scale.
- **Snapshot, don't rebuild, on learned-recipe growth.** Phase 31 already does the right thing (*"mutates the ONE INDEX_OPTIONS index + re-snapshots with a bumped catalogVersion, never a fresh index"*). Keep that — a full rebuild at 2,500 docs on every learned recipe would be pathological.
- **Watch `chrome.storage.local` budget.** Keep per-descriptor payload lean (intent synonyms + service + verb + class + provenance ref, not full schemas inline); store schema-on-hit, not schema-in-index (the design already does schema-on-hit).

**Warning signs:**
- First capability call after an SW wake has a visible multi-hundred-ms stall.
- The eval harness fixture still has ~10–50 docs after the full import.
- `search_capabilities` returns hits from the wrong app for a generic verb query.
- `fsbCapabilityIndex` write size grows unbounded with learned recipes / provenance.

**Phase to address:**
**Phase 36 — Breadth** must include the full-scale eval-harness re-run + the SW cold-start benchmark as gates (you cannot import thousands of descriptors without proving search precision and startup cost at that scale). Deferred hydration is a Phase 36 implementation requirement.

---

### Pitfall 7: Recipe rot across 119 apps overwhelms self-heal — the designed steady state becomes a thundering herd

**What goes wrong:**
Recipe rot is FSB's **designed steady state** (STATE.md: *"the designed steady state"*) — internal endpoints, CSRF shapes, and persisted-query hashes drift, and Phase 32 self-heals (detect `RECIPE_EXPIRED` → DOM fallback → quarantine → consent-gated re-learn). That machinery was built and gated for a handful of recipes. At **119 apps**, rot is no longer occasional — it is **continuous**: across 2,523 ops on third-party internal APIs that the vendors change without notice, *something is always rotting*. The scale failure modes:
1. **Re-learn thundering herd.** Phase 32's rot hook fires a *"fire-and-forget consent-gated `runDiscovery` re-learn"* on each broken verdict. If a vendor ships a site-wide change (e.g. Stripe rotates its dashboard API), **every Stripe op rots at once** and fires N concurrent discovery sessions, each attaching `chrome.debugger`, each consent-gated. Across multiple apps rotting simultaneously this is a CDP-attach storm that can disrupt the user's actual browsing and the Input-emulation the same debugger serves.
2. **Quarantine cascade hides whole apps.** Quarantine is correct for one bad recipe, but a vendor change that rots every op of an app silently quarantines the *entire app's* fast path. Without app-level visibility, the catalog appears intact (descriptors still return from search) while every invoke falls back to slow DOM — "discoverable but effectively dead" (see Pitfall 9), with no signal that an app needs re-porting.
3. **Self-heal masks systemic breakage as transient.** Phase 32's "transient blip never permanently demotes a bundled recipe; re-evaluated next SW session" is right for a blip but wrong for a *permanent* vendor change — the recipe is re-tried, re-rots, re-falls-back forever, burning a discovery session each time.

**Why it happens:**
Self-heal was designed and tested per-recipe; the *aggregate* behavior when many recipes rot together (correlated failures from one vendor change) was never load-tested. Each individual heal is cheap; N simultaneous heals × M apps is not.

**How to avoid:**
- **Rate-limit and coalesce re-learn.** A single discovery-session budget (global, and per-origin) so that "every Stripe op rotted" triggers **one** discovery pass for the origin, not 30. FSB already has coalescing precedent (Phase 211 mutation/reload coalescing; Phase 240 reconnect grace) — apply the same discipline to re-learn. Back off exponentially on repeated failure for the same origin (don't re-discover a permanently-changed API every session).
- **Promote app-level rot to a visible signal.** When >K ops of one app rot inside a window, surface an **app-level "needs re-port / degraded" state** in the control panel (not just per-recipe quarantine), so the maintainer knows app X needs head re-porting and the user knows X is on the slow path. This is the difference between "self-heal absorbed it" and "self-heal is silently papering over a dead app."
- **Distinguish transient from systemic.** Track quarantine *recurrence*: a recipe that quarantines, re-learns, and re-quarantines within N sessions is **systemically broken**, not blipping — stop auto-re-learning it and escalate to the app-level degraded state. The Phase 32 detector already has a taxonomy; extend it with a recurrence counter.
- **The DOM-fallback floor must actually exist for the imported tail.** Self-heal's safety net is "drop to DOM automation and still complete the task." That floor only holds for apps FSB's DOM engine + site guides actually handle. For 119 apps, verify the high-value ones have a working DOM path (or a site guide) so fallback isn't a dead end. Phase 29's note already flags this: *"the DOM-fallback floor (Phase 32, T3) is the rot backstop"* — at 119 apps that backstop needs coverage, not just existence.

**Warning signs:**
- A burst of `chrome.debugger` attaches / discovery sessions correlated with one vendor's change.
- An app's every op silently on DOM fallback with no surfaced "degraded" state.
- The same recipe slug appears in quarantine logs every SW session (re-rot loop).
- User reports "app X got slow/flaky" with no corresponding catalog alarm.

**Phase to address:**
**Phase 39 — Catalog-Scale Self-Heal Hardening** (extends Phase 32): re-learn rate-limit/coalescing/back-off, app-level rot surfacing, recurrence-based systemic-vs-transient classification, and DOM-fallback coverage verification for high-value imported apps.

---

### Pitfall 8: ToS / legal exposure — importing ToS-hostile app categories as invocable API capabilities

**What goes wrong:**
The OpenTabs set includes apps whose Terms of Service are **actively hostile to automated/programmatic access**, confirmed present in the source: `netflix`, `tinder`, `instagram`, `onlyfans`, `whatsapp`, `tiktok`, `facebook`, `x`, `linkedin`, `spotify`, `discord`, `telegram`. Under opt-out Auto, importing an *invocable* descriptor for these means FSB ships a capability that drives the user's authenticated session against the vendor's private API — exactly the access pattern these vendors' ToS prohibit and actively detect/ban (Instagram/Meta and LinkedIn are notoriously aggressive about private-API automation; OnlyFans/WhatsApp carry additional content/abuse and account-safety exposure). FSB's posture is "operator is responsible for ToS" (`docs/LEGAL.md`), and OpenTabs disclaims the same (`DISCLAIMER.md`: *"You are responsible for complying with the terms of service of any third-party service"*) — but FSB *shipping the capability invocable-by-default* is a materially stronger stance than OpenTabs' "install a plugin per app." The risks: (a) account bans for users (reputational), (b) Chrome Web Store policy exposure (facilitating ToS-violating automation of named services can draw takedowns), (c) legal/abuse exposure for adult-content and messaging apps specifically.

**Why it happens:**
The MIT source makes all 119 apps equally easy to import, and the descriptor pipeline treats them uniformly. "We have a manifest for it" reads as "we should ship it." The denylist today is sized for *financial/government* harm (money/identity) and does **not** encode the *ToS-hostility* axis at all — so social/adult/messaging apps fall straight through into Auto-invocable.

**How to avoid:**
- **Add a ToS-hostility classification axis, distinct from the finance/health sensitivity axis.** Categorize the 119 apps into: (1) **denylist** (do not ship invocable at all — adult content + apps with the most aggressive anti-automation ToS where even a per-origin enable is a liability); (2) **DOM-only** (discoverable + invocable *only* via the DOM engine / site guides, never the authenticated-API fast path — keeps FSB's "general-purpose browser automation" framing rather than "we built a private-API client for Instagram"); (3) **descriptor-only/discovery-pending**; (4) **fully invocable**. Most social/messaging apps belong in DOM-only or denylist.
- **Default ToS-hostile apps to DOM-only, not API-invocable.** FSB's legitimate framing is "a human clicking, automated" (DOM). Driving a *private API* is the part that most directly contradicts these vendors' ToS. Routing ToS-hostile apps to T3-DOM (which already exists as the fallback floor) keeps the capability available *as browser automation* without FSB shipping a bespoke private-API client for them.
- **Update `docs/LEGAL.md` and the denylist rationale to name the ToS axis.** Today LEGAL says the denylist is *financial/government*. Extend it to document the ToS-hostility category and which apps are denied/DOM-only on those grounds, so the posture is defensible and explicit (and so a reviewer sees a deliberate policy, not an oversight).
- **Carry the OpenTabs disclaimer pattern forward** (not affiliated, operator-responsible) but recognize it does not neutralize the *shipping-invocable-by-default* delta — the mitigation is category routing, not just a disclaimer.

**Warning signs:**
- A fully-invocable authenticated-API descriptor exists for instagram/tiktok/linkedin/onlyfans/whatsapp.
- The denylist still encodes only the finance/gov axis after import.
- `docs/LEGAL.md` makes no mention of ToS-hostility as a categorization criterion.
- No "DOM-only" tier marker on descriptors for social/adult/messaging apps.

**Phase to address:**
**Phase 35 — Denylist Expansion** owns the ToS-hostility classification (it's the same "classify before reachable" gate as Pitfall 1, second axis). The DOM-only routing marker is consumed by **Phase 36 — Breadth** (descriptor tiering) and enforced by the catalog/router (T3-DOM). `docs/LEGAL.md` update is part of Phase 35's deliverable.

---

### Pitfall 9: "Discoverable-but-uninvocable" dead descriptors — search returns an app that no tier can actually run

**What goes wrong:**
Breadth imports **all 119 apps as descriptors** so they return from `search_capabilities`. But invocability requires a **backing tier**: T1a/T1b (hand-ported head), T2 (a learned recipe that replayed clean), or T3 (DOM fallback that actually works for that app). For the majority of imported apps — not in the curated ~15–30 head, not yet learned (Phase 31 needs a real authenticated visit to learn), and whose auth shape may be head-only (Pitfall 3) — there is **no working backing path on day one**. The result: `search_capabilities` confidently returns "stripe: void invoice", the agent picks it, `invoke_capability` runs, and it returns `RECIPE_LEARN_PENDING` / `RECIPE_DOM_FALLBACK_PENDING` / an empty result. The catalog *looks* like it has 2,523 capabilities; in practice a large fraction are **discoverable façades** with nothing behind them. This is corrosive to FSB's core value ("reliable single-attempt execution"): the agent is told a capability exists, commits to it, and it no-ops.

**Why it happens:**
The milestone's breadth metric is "every app returns from search" — which is satisfied by descriptors alone, *decoupled* from whether invoke works. The tier router already has the right stubs (`RECIPE_LEARN_PENDING`, `RECIPE_DOM_FALLBACK_PENDING` from Phase 29), but stubs are not *capabilities*. The gap between "descriptor exists" and "invoke works" is invisible in a search-only acceptance test.

**How to avoid:**
- **Make invocability a first-class, queryable descriptor field, and reflect it in search.** Each descriptor carries a backing-status: `head` / `learned` / `dom-only` / `discovery-pending` / `unsupported`. `search_capabilities` should either (a) rank/annotate by backing-status so the agent knows "discoverable but not yet runnable — visit the site to learn it," or (b) for a *mutating* op with no working backing, decline rather than promise. Never return a confident invocable hit for a descriptor whose only backing is a pending stub.
- **Return an honest, actionable result on the pending path — not a silent no-op.** `RECIPE_LEARN_PENDING` should surface as *"this capability isn't learned yet; open <origin> while logged in and FSB will learn it"* (the consent-gated discovery flow), not as an empty success. This converts a dead descriptor into a **discovery affordance**.
- **Seed discovery so the tail becomes invocable predictably** (PROJECT.md: *"Seed the 119 origins + known endpoint hints so the Phase 31 network-capture discovery path reliably learns the tail that is not hand-ported"*). The endpoint hints harvested from the OpenTabs `*-api.ts` sources (real paths like Stripe `/v1/...`, Instagram `/api/v1/...`, Linear `client-api.linear.app/graphql`) seed the discovery synthesizer so the *first* authenticated visit learns the recipe, instead of leaving the descriptor dead until the user happens to trigger capture.
- **Track and gate a "discoverable AND invocable" coverage number, separate from "discoverable."** The milestone acceptance must report: of 119 apps, how many are invocable on day one (head), how many become invocable on first authenticated visit (seeded discovery), how many are DOM-only, how many are dead. A large "dead" bucket is a milestone failure, not a deferred nicety.

**Warning signs:**
- `search_capabilities` returns an app whose invoke returns `*_PENDING` with no user-facing guidance.
- Milestone acceptance measures only "all 119 return from search" with no invocability breakdown.
- The agent selects a capability and gets an empty/no-op result with no "learn me" path.
- Discovery seeding ships without the real endpoint hints from the OpenTabs sources (so the tail can't self-learn).

**Phase to address:**
**Phase 36 — Breadth** introduces the backing-status field + honest search annotation; **Phase 38 — Discovery Seeding/Hardening** harvests the OpenTabs endpoint hints and wires the "learn-on-first-visit" affordance so discovery-pending descriptors become invocable predictably; the invocability-coverage report is a milestone gate.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Import all 119 descriptors first, expand denylist after | Fast "breadth done" demo; the headline feature lands | Opens a window where finance/brokerage apps are Auto-writable with no consent (Pitfall 1) — a credential-replay weapon shipped by ordering | **Never.** Denylist + import-time classification gate must precede reachability. |
| Hand-port OpenTabs `handle()` bodies to get the tail working | Reuses working MIT code; fast invocability | Recreates the imperative npm-per-plugin model FSB rejects; pressures toward streamed-handlers → MV3 ban (Pitfall 2) | Only for the curated head (~15–30), as `executeBoundSpec` handlers, behind the recipe-path-guard drift gate. |
| Map every app's auth onto the 4-member enum | Codegen "just works"; every descriptor gets a recipe | Silent wrong/empty invokes for every app whose real auth is bespoke (Pitfall 3); confidently-wrong under Auto | Only when the auth shape genuinely fits the enum *and* was verified by replay. Otherwise mark head-only/learn-only. |
| Classify side-effect by HTTP method | Simple, mechanical | GraphQL/RPC mutations (POST to /graphql) mis-class as read → destructive ops Auto-writable with no friction (Pitfall 4) | Never as the sole signal; combine with tool-name verb map + GraphQL/RPC carve-out, fail-safe-high. |
| Reuse the 10-doc eval fixture for the 2,523-doc index | Tests stay green; no fixture rework | Recall/precision claims are meaningless at scale; wrong-app mutating invokes (Pitfall 6) | Never. Re-generate the fixture at full scale with cross-app near neighbors. |
| Fire a re-learn on every rotted op | Each heal is locally correct; reuses Phase 32 | Thundering herd of CDP attaches when a vendor changes site-wide (Pitfall 7) | Never unbounded; rate-limit + coalesce per-origin + back-off. |
| Ship social/messaging apps as fully-invocable API capabilities | Uniform pipeline; bigger catalog number | Account bans, Web-Store policy exposure, abuse/legal exposure (Pitfall 8) | Route ToS-hostile apps to DOM-only or denylist; never API-invocable-by-default. |
| Count "returns from search" as the breadth metric | Easy green; 2,523 capabilities "shipped" | A large fraction are dead descriptors that no-op on invoke (Pitfall 9), corroding core value | Never as the *sole* metric; gate on discoverable-AND-invocable coverage. |

## Integration Gotchas

Common mistakes when connecting to external services (grounded in the real OpenTabs source).

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Stripe** (`dashboard.stripe.com`) | Treat as generic bearer-token same-origin; ship a declarative recipe | 4-part page-global scrape (`PRELOADED.session_api_key`/`csrf_token`/`merchant.id` + `STRIPE_VERSION`) → Bearer + `x-stripe-csrf-token` + `Stripe-Account` + `Stripe-Version` headers. **Head-only** (page-global scrape isn't declarative). And: **deny/sensitive before reachable** (Pitfall 1); destructive ops present (`void_invoice`, `delete_customer`). |
| **Linear** (`client-api.linear.app`) | Pin the recipe to the page origin (`linear.app`) | API is on a **separate subdomain**; relies on `SameSite=Strict` HttpOnly cookies via `credentials:'include'` + `linear-client-id`/`organization` headers. The origin-pin must allow the real API host, not the tab origin — verify the cookie actually crosses (it does here; do NOT assume it does generally — Phase 29 D-09 forbids the public separate-origin API for github/reddit because the cookie does *not* cross there). |
| **Instagram** (`/api/v1`) | Cache the CSRF token | `csrftoken` **rotates** — read fresh from cookie on every call (→ `X-CSRFToken`), plus `X-IG-App-ID`. Also a ToS-hostile app → DOM-only/denylist candidate (Pitfall 8), not API-invocable-by-default. |
| **GraphQL/RPC apps** (Linear, Notion `/api/v3`, GitHub `_graphql`) | Class side-effect by HTTP method | All mutations tunnel through POST; class by the GraphQL operation / tool name, not the verb (Pitfall 4). |
| **Any imported app, generally** | Assume "descriptor generated" = "capability works" | Decouple discoverable from invocable; only head + replayed-clean-learned are invocable (Pitfalls 3, 9). |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Synchronous full-index rehydrate on every SW wake | Multi-hundred-ms stall on first capability call after eviction | Deferred/lazy hydration off the bootstrap critical path (Phase 160 precedent); CI cold-start benchmark with the full index | Becomes visible in the hundreds-to-low-thousands of descriptors, on every MV3 SW eviction |
| Eval harness fixture left at toy scale | Green tests, but `search_capabilities` returns wrong-app hits in the field | Regenerate fixture at 2,523 docs with cross-app near neighbors; gate wrong-invoke = 0 at full scale | At thousands of descriptors with shared verbs ("send message", "list invoices") |
| Per-op re-learn on rot | CDP-attach storm when a vendor ships a site-wide change | Per-origin re-learn coalescing + global discovery-session budget + exponential back-off | When any one vendor changes an API used by an app with many ops (e.g. Stripe's ~30 ops) |
| Full index rebuild on each learned recipe | Large `chrome.storage.local` write per learned capability | Incremental add to the ONE index + re-snapshot (Phase 31 already does this) | As learned recipes accumulate across 119 origins |
| Inline schemas in the index | Index size + parse cost balloon | Schema-on-hit (already designed); keep per-descriptor payload lean | At thousands of descriptors with full JSON-Schemas inline |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Ship a finance/brokerage descriptor before its origin is on the denylist (opt-out Auto = writable) | Unprompted credential-replay against the user's real money (void invoices, trades, transfers) — **the headline risk** | Denylist + import-time classification gate lands FIRST as a hard dependency (Pitfall 1) |
| Mis-class a destructive op as `read` (GraphQL/RPC) | Destructive op runs with no friction, even on a sensitive origin | Verb-map + GraphQL/RPC carve-out + fail-safe-high; sample-test destructive ops (Pitfall 4) |
| Redactor/audit validated only against the original ~5 head apps' auth field names | A novel per-app token (Stripe `session_api_key`, etc.) leaks into a learned recipe / audit / ring buffer while the no-leak test stays green | Structural capture-time redaction (never read values) + token-shape + full-119-field-name no-leak test (Pitfall 5) |
| Trust manifest-guessed auth and mint an invocable declarative recipe | Wrong/empty invoke that is *shaped* like success → confidently-wrong under Auto, no prompt to catch it | Observe-then-replay-clean (Phase 31) before invocable; head-only for bespoke auth (Pitfall 3) |
| Origin-pin assumes session cookie never crosses subdomains | Either over-blocks (Linear's real cross-subdomain API) or, if loosened wrong, allows an off-origin send | Pin to the *verified* API host per app; default-forbid separate origins (Phase 29 D-09) and only allow where the cookie provably crosses (Linear) |
| Ship ToS-hostile apps as API-invocable-by-default | User account bans + Web-Store policy takedown + abuse/legal exposure | ToS-hostility classification → DOM-only or denylist (Pitfall 8) |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Search returns a capability that no-ops on invoke | Agent commits to a capability that silently does nothing → erodes "reliable single-attempt execution" core value | Backing-status on descriptors; honest "not learned yet — visit to learn" affordance instead of empty success (Pitfall 9) |
| Whole app silently on slow DOM fallback after rot | "App X got flaky" with no explanation | App-level degraded/needs-re-port surfacing in the control panel (Pitfall 7) |
| Finance app runs a write with no prompt under Auto | User is shocked their session moved money without confirmation | Re-evaluate mutating-write friction for sensitive categories; denylist covers the worst (Pitfall 1) |
| 2,523 capabilities returned with no quality signal | Agent/user can't tell head (reliable) from discovery-pending (maybe) from DOM-only (slow) | Rank/annotate by backing-status + side-effect class (Pitfalls 4, 9) |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Denylist expansion:** Often "done" = a few origins added by hand — verify **every** imported finance/health/payments origin (stripe, coinbase, robinhood, fidelity, carta, ynab + categories) is denied-or-sensitive AND that the descriptor generator *refuses to emit* an unclassified sensitive descriptor (import-time gate, not just runtime).
- [ ] **Descriptor import:** Often "done" = all 119 return from `search_capabilities` — verify the **discoverable-AND-invocable** coverage breakdown (head / learn-on-visit / DOM-only / dead), not just the search count.
- [ ] **Side-effect classification:** Often "done" = a verb heuristic ran — verify the destructive-op sample (`void_invoice`, `delete_customer`, trade/transfer ops) is classed `destructive`, and GraphQL/RPC POSTs are not classed `read`.
- [ ] **Auth coverage:** Often "done" = codegen emitted recipes — verify each app's real auth shape is classified {fits-enum / head-only / learn-only / unsupported} and the invocability marker matches (no declarative recipe for Stripe/Linear/Instagram-shaped auth).
- [ ] **Secret redaction:** Often "done" = the old no-leak test is green — verify it asserts against the **full 119-app auth field-name universe** + token-shape patterns, and that capture reads structure only (no values).
- [ ] **Search at scale:** Often "done" = recall@5 green — verify the eval fixture is **2,523 docs with cross-app near neighbors** and wrong-invoke = 0 at that scale, plus an SW cold-start benchmark with the full index.
- [ ] **Self-heal at scale:** Often "done" = Phase 32 machinery exists — verify per-origin re-learn coalescing/back-off and app-level rot surfacing under a *correlated* (whole-app) rot scenario.
- [ ] **ToS posture:** Often "done" = finance denylisted — verify the ToS-hostility axis is encoded (social/adult/messaging → DOM-only/denylist) and `docs/LEGAL.md` documents it.
- [ ] **Provenance/attribution:** Often "done" = README acknowledgement — verify per-app MIT attribution/provenance ships with each imported descriptor (PROJECT.md requires it).

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Finance descriptor shipped Auto-writable before denylist (Pitfall 1) | **HIGH** | Hot-add the origin to `deniedOrigins` (renders non-enableable immediately, consulted before mode); audit the append-only log for any invoke against it; ship the import-time gate to prevent recurrence. The audit trail is the only forensic record (it's secret-free, so it shows *that* it ran, not the payload). |
| Imperative-handler sprawl in the head (Pitfall 2) | MEDIUM | Demote non-head apps back to descriptor-only; restore the head cap + recipe-path-guard drift gate; the Wall-1 CI guard prevents the worst (streamed code) by construction. |
| Wrong-auth declarative recipes shipped (Pitfall 3) | MEDIUM | Quarantine the bad recipes (Phase 32 mechanism); flip the apps to head-only/discovery-pending; the expected-shape assertion (Phase 32) flags them as broken so they fall back rather than confidently-wrong. |
| Destructive op mis-classed read (Pitfall 4) | MEDIUM | Regenerate descriptors with the corrected classifier; the recipe-method-derived cross-check (Phase 28) auto-corrects any op that *has* a recipe; descriptor-only ops need the verb-map fix re-run. |
| Token leak into audit/learned recipe (Pitfall 5) | HIGH | Clear the audit ring + learned-recipe store (export/clear control exists); patch the structural redactor; rotate any exposed credential is the *user's* action (FSB can't). Prevention >> recovery here. |
| Search wrong-app hit at scale (Pitfall 6) | LOW–MEDIUM | Re-tune `INDEX_OPTIONS` + owned-origin bias; re-run the full-scale eval gate; no data migration needed (index regenerates from descriptors). |
| Re-learn thundering herd (Pitfall 7) | LOW | Add per-origin coalescing + back-off; the herd is transient — once back-off lands the storm subsides. App-level surfacing turns the silent degradation visible. |
| Dead descriptors corroding trust (Pitfall 9) | MEDIUM | Add backing-status + honest pending affordance; seed discovery with OpenTabs endpoint hints so the tail self-learns on first visit. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls. (Phases continue from v0.9.99's Phase 34 → start at 35, batched by category; denylist lands first per PROJECT.md. Phase numbers below are the researcher's recommended structure, not yet roadmapped.)

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| **1. Security-ordering / denylist-first (HEADLINE)** | **Phase 35 — Denylist Expansion + Import-Time Classification Gate (LANDS FIRST)** | CI: descriptor generator fails on any unclassified finance/health/sensitive origin; test asserts every imported finance-category origin ∈ denied-or-sensitive; no descriptor-import phase merges until this is green |
| 2. MV3 code-as-data / head sprawl | Phase 36 (descriptor-only breadth) + Phase 37 (head cap) | Recipe-path CI guard (Phase 26) green; `HEAD_HANDLER_MODULES` ≤ curated cap; no new long-tail imperative module; no streamed-handler field in recipes |
| 3. Auth diversity → wrong/empty invoke | Phase 36 (invocability markers, auth-shape report) + Phase 38 (observe-then-replay) | Auth-shape coverage report; no declarative recipe for head-only-auth apps; Phase 31 `promoteAfterReplay` clean-replay gate |
| 4. Side-effect mis-classification | Phase 36 (verb-map + cross-check extension) | Destructive-op sample test (`void_invoice` etc. = destructive); no `void_/delete_/trade_` op classed read; GraphQL/RPC POST not classed read |
| 5. Token/secret leakage at scale | Phase 38 (structural redactor + full-field no-leak test) | Capture reads structure only; no-leak test covers all 119 apps' auth field names + token-shape patterns; learned envelope has no high-entropy field |
| 6. Search perf + SW startup at scale | Phase 36 (full-scale eval + cold-start benchmark) | Eval fixture = 2,523 docs cross-app, wrong-invoke = 0; SW cold-start under budget with full index; deferred hydration off bootstrap path |
| 7. Recipe rot overwhelms self-heal | Phase 39 — Catalog-Scale Self-Heal Hardening (extends Phase 32) | Per-origin re-learn coalescing/back-off under a whole-app rot scenario; app-level degraded surfacing; recurrence-based systemic-vs-transient split |
| 8. ToS / legal exposure | Phase 35 (ToS-hostility axis) + Phase 36 (DOM-only routing) | ToS-hostile apps ∈ DOM-only/denied; no API-invocable descriptor for social/adult/messaging; `docs/LEGAL.md` documents the ToS axis |
| 9. Discoverable-but-uninvocable dead descriptors | Phase 36 (backing-status + honest search) + Phase 38 (discovery seeding) | Discoverable-AND-invocable coverage report; pending invoke returns a "learn-on-visit" affordance, not empty success; discovery seeded with real OpenTabs endpoint hints |

## Sources

- **`opentabs-dev/opentabs` @ HEAD (live `gh` inspection, 2026-06-23)** — confirmed 119 plugins under `plugins/`; read real auth/op shapes: `plugins/stripe/src/stripe-api.ts` (4-part page-global scrape, destructive `void_invoice`/`delete_customer` ops in `plugins/stripe/src/tools/`), `plugins/linear/src/linear-api.ts` (cross-subdomain GraphQL + `credentials:'include'`), `plugins/instagram/src/instagram-api.ts` (rotating `csrftoken`). Confirmed the finance roster {stripe, coinbase, robinhood, fidelity, carta, ynab} and the ToS-hostile roster {netflix, tinder, instagram, onlyfans, whatsapp, tiktok, facebook, x, linkedin, spotify, discord, telegram}. `DISCLAIMER.md` (operator-responsible ToS posture). [HIGH]
- **FSB `extension/config/service-denylist.json`** — current denylist = 4 deniedOrigins (chase, bankofamerica, wellsfargo, irs.gov); confirms NONE of the 6 imported finance apps are covered (the Pitfall-1 gap). [HIGH]
- **FSB `docs/LEGAL.md`** — opt-out Auto posture; "read-Auto implies write-Auto"; denylist consulted first; sensitive-origin friction removed from the invoke gate under Auto (kept only on discovery). [HIGH]
- **FSB `.planning/STATE.md`** — v0.9.99 "Top Risks" (interpreter-as-code, wrong-context fetch, credential-replay/safe-brand inversion, exfiltration/Limited-Use, recipe rot as designed steady state, search recall, SW-eviction mid-call) + "Architectural Walls" (Wall 1 closed-vocab data + CI guard; Wall 2 MAIN-world fetch) + Phase 26–32 decision log (authStrategy 4-member enum lock D-08; Phase 28 D-02 side-effect cross-check; Phase 29 D-09 separate-origin-forbidden, D-12 executeBoundSpec-only, T-29-08 no-token-logging; Phase 31 structural redaction + `promoteAfterReplay`; Phase 32 rot taxonomy + quarantine + fire-and-forget re-learn). [HIGH]
- **FSB `.planning/PROJECT.md` (v1.0.0 framing)** — breadth = descriptor import (NOT 2,523 handlers); depth = curated ~15–30 head; denylist lands first; discovery seeding of 119 origins + endpoint hints; per-app MIT provenance; "port + learn, do NOT clone OpenTabs' npm-per-plugin model." [HIGH]
- **MV3 remotely-hosted-code policy (Chrome Web Store program policy)** — the basis for Wall 1; the ban risk if server-delivered recipes carry control flow. [HIGH — established platform policy, also the documented basis of FSB's existing Wall 1]

---
*Pitfalls research for: bulk OpenTabs (~119-app / 2,523-op) import into FSB under the opt-out Auto consent default*
*Researched: 2026-06-23*
