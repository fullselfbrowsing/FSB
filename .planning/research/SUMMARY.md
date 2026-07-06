# Project Research Summary

**Project:** FSB (Full Self-Browsing)
**Milestone:** v1.0.0 Full App Catalog (OpenTabs Parity)
**Domain:** Build-time codegen of a ~119-app / ~2,523-op authenticated-API capability catalog (from OpenTabs MIT plugins) INTO FSB's fixed v0.9.99 tiered substrate — under the just-shipped opt-out "Auto" consent default
**Researched:** 2026-06-23
**Confidence:** HIGH

## Executive Summary

This milestone takes FSB's capability catalog from a 4-service bundled head to the full ~119-app OpenTabs surface. All four researchers — working independently against the live `opentabs-dev/opentabs@main` repo and FSB's on-disk `automation` branch — **converged on the same spine**: the milestone is **NOT** a rebuild and **NOT** a port of OpenTabs' code. It is "**feed the existing tiers, don't add tiers.**" Breadth = codegen closed-vocabulary *descriptors* (data) so every app returns from `search_capabilities`; depth = hand-port ~15-30 top apps as T1a/T1b handlers exactly like the shipped `github.js`; the tail is reached by seeded network-capture discovery (T2) and the universal DOM fallback (T3). No new MCP tool, no new router branch, no new tier — INV-01..04 and Walls 1/2 are preserved *by construction*. The single new build-time stack is `zod@^4.4.3` + `tsx@^4.22.4` (devDeps only) to run OpenTabs' own `z.toJSONSchema()` extraction; nothing OpenTabs ships into the extension at runtime (Wall 1).

The recommended approach is a **9-phase, denylist-first, category-batched build (Phases 35-43)**. Two findings are load-bearing and non-negotiable. First, **denylist expansion is a HARD phase dependency that must land FIRST (Phase 35)**: six finance apps in OpenTabs (`stripe`, `coinbase`, `robinhood`, `fidelity`, `carta`, `ynab`) are NONE of them in FSB's current 4-origin denylist, and the shipped opt-out Auto default makes their destructive operations (`void_invoice`, `delete_customer`, trades, transfers) *writable the moment the descriptor is reachable, with no per-call prompt*. The fix is denylist expansion **plus an import-time CI gate** that refuses to emit an unclassified sensitive/ToS descriptor — making the ordering a build failure, not a review-time hope. Second, **the load-bearing code change is the "no dead descriptor" path**: today `capability-catalog.js resolve()` returns `null` for any slug not in `REGISTRY`, but search indexes ALL descriptors, so ~2,523 imported slugs would be *searchable-but-uninvocable* without a single `resolve()` fallback branch mapping descriptor-only slugs → T3 (DOM) or T2 (learn-pending when seeded).

The key risks are all "scale multiplies a v0.9.99 single-app failure mode by 119," and each has a mitigation already located in the existing machinery: side-effect mis-classification (mitigated by codegen static-scan + runtime recipe-wins cross-check, escalate-to-write on disagreement), token leakage across 119 bespoke auth shapes (mitigated by *structural* capture-time redaction that never reads a value + a no-leak test extended to the full 119-app field universe), search precision collapse at thousands of near-neighbor docs (mitigated by rich `intentSynonyms` + owned-origin bias + a full-scale eval-harness re-run), SW cold-start parse cost (mitigated by index searchable-text-only + schema-on-hit + deferred hydration), and recipe-rot thundering-herd (mitigated by per-origin re-learn coalescing + back-off + app-level degraded surfacing). One milestone-level posture decision is **explicitly unresolved and carried forward to requirements** (see Gaps): whether to re-enforce a mutating opt-in for sensitive/finance origins under Auto.

## Key Findings

### Recommended Stack

The extraction is **build-time only** and mirrors OpenTabs' own `opentabs-plugin build` exactly. Each OpenTabs op is a `defineTool({ name, description, input: z.object({...}), handle })` where `input`/`output` are **Zod 4 schemas** that import shared schemas from a sibling `schemas.ts` — so a single-file regex/AST scrape cannot resolve a complete param schema. The robust path is **load + evaluate the Zod**: a Node script (run under `tsx`) `import()`s each plugin module and calls `z.toJSONSchema(tool.input)` (Zod-4-only API), emitting standard JSON Schema (draft 2020-12) that drops straight into FSB's existing `@cfworker/json-schema` validator with no dialect translation. OpenTabs has **no side-effect annotation anywhere** — `sideEffectClass` must be *inferred* (the one genuinely new derived field). Pin OpenTabs by commit SHA (vendor a metadata-only snapshot under `vendor/opentabs-snapshot/` + `PIN.md`), and **commit the generated catalog** so CI/end-users build with zero new deps and the diff is reviewable.

**Core technologies (BUILD-TIME, devDependencies ONLY — never bundled, Wall 1):**
- **zod `^4.4.3`** — `z.toJSONSchema()` to convert each op's Zod `input` → JSON Schema; the *exact* API OpenTabs `build.ts:416` uses; pin the same major as the plugins for output parity.
- **tsx `^4.22.4`** — transpile-and-run OpenTabs TS plugin modules so the build script can `import()` them without a separate `tsc` emit; built on esbuild (already an FSB devDep). (`jiti@^2.7` is the OpenTabs-native equivalent if byte-for-byte loader parity is wanted.)
- **@opentabs-dev/plugin-sdk `^0.0.113` (devDep)** — resolve `defineTool`/`OpenTabsPlugin` when loading a plugin module; `defineTool` is an identity function so loading is inert. Hardening variant: vendor a ~30-line stub instead, keeping the build hermetic.

**Runtime (ALREADY FSB deps, REUSED unchanged — vendored in `extension/lib/`):** `minisearch ^7.2.0` (the catalog search index; same `INDEX_OPTIONS` + `loadJSON`), `@cfworker/json-schema ^4.1.1` (param validation), `jmespath ^0.16.0` (recipe extract). **No index-engine swap** (no FlexSearch/Orama/lunr) — scaling here is a data-layout problem, not an engine-capability problem, and a swap risks INV-01/SURF-04.

See [STACK.md](STACK.md) for the verified extraction contract and scaling budget.

### Expected Features

The whole 119-app catalog is "table stakes" **only as descriptors** — breadth means *findable*, not *invocable on day one*. Invocability splits by **auth strategy**, and the discriminator is brutally simple for FSB: *does the app call its OWN first-party origin, or a SEPARATE API origin?* FSB's Wall 2 (MAIN-world `fetch()` with `credentials:'include'`) is identical to OpenTabs' `fetchFromPage` — there is **no background-proxy escape hatch** — so FSB inherits OpenTabs' CORS reality exactly. The five observed auth patterns map mechanically to tiers (the deliverable taxonomy):

- **(A) Cookie-only GET** → **T1b recipe** (pure data, codegen-able): netlify reads, reddit, github-notifications, shortcut reads.
- **(B) Cookie + scraped CSRF** → **T1a handler**: github, gitlab, jira, confluence, datadog, sentry, cloudflare, airtable, asana, figma.
- **(C) Split / webpack / WS token** → **T1a if stable scrape** (slack, stripe, chatgpt); **T2/T3 only** if webpack-internals/WebSocket (discord, clickup — *defer, let the learner handle*).
- **(D) Separate API origin + bearer** → **FORBIDDEN unless CORS permits + origin-pinned**: linear is documented-safe (`access-control-allow-origin: https://linear.app`); supabase/cloud-consoles are UNVERIFIED → **per-app CORS gate mandatory before porting**.
- **(E) `gapi` trampoline** → **T1a gapi-bridge handler** (distinct shape): google-calendar/docs/drive.

**Must have (table stakes):** descriptor import for all ~117 real apps (exclude `e2e-test`/`prescript-test`) with `sideEffectClass` + MIT provenance; denylist landing FIRST; first-party origin-pin + never-logged tokens on every invocation; scaled search index performant at ~2,523 docs; seeded discovery for the tail; **the ~18 net-new T1a/T1b depth ports** from the shortlist.

**Should have / differentiators (what OpenTabs structurally CANNOT do):** **zero-install catalog** (one extension vs 119 npm installs — the headline); **self-healing T3 DOM fallback** on every app (brittle Pattern-C/D apps degrade instead of fail); **learned discovery auto-grows the catalog (T2)** without code releases; **unified Off/Ask/Auto consent + audit + denylist** across all apps.

**Depth shortlist ≈ 22 apps (~18 net-new)**, biased dev/PM/cloud/observability: linear (60 ops, flagship, documented CORS), datadog (72), jira (21), gitlab (23), sentry (22), vercel (9), netlify (41), cloudflare (31), confluence (22), figma (15), asana (25), todoist (34), shortcut (28), circleci (34), supabase (27, CORS-conditional), stripe (31, reads only — writes Ask-gated), google-calendar (19, gapi-bridge), linkedin (read-only, ToS-caution). github/gitlab/notion/slack are already done/trivial.

**Defer (v1.x / v2+):** stretch ports (grafana, posthog, newrelic, npm, docker-hub, mongodb-atlas) after the head pattern proves; gapi-bridge family after one bridge validates end-to-end; cloud-console ports after per-app CORS verification; Pattern-C-hard (discord webpack, clickup WS) only if T2-learned proves insufficient; deep per-op wiring beyond the head, driven by telemetry.

**Anti-features (deny, don't ship invocable):** media/DRM (netflix, spotify, youtube-music, twitch, steam), dating (tinder), adult (onlyfans), aggressive anti-automation social (instagram, facebook, tiktok, x — *mechanically portable but should be denied to avoid bans*), finance-write (robinhood, fidelity, coinbase, carta, ynab), messaging mass-DM (whatsapp, telegram, discord DMs → sensitive/Ask at minimum). The "use the public REST API" instinct is **FORBIDDEN** (cookie doesn't cross, CORS blocks it — cloudflare source says so explicitly).

See [FEATURES.md](FEATURES.md) for the full taxonomy, shortlist, and prioritization matrix.

### Architecture Approach

The v0.9.99 capability architecture is a **FIXED substrate**; the milestone attaches four streams to it. The single most important architectural fact: `capability-catalog.js resolve()` returns `null` for any slug not in `REGISTRY` (`:303-304`) → router returns `RECIPE_NOT_FOUND` (`:688-691`), but `capability-search.js` indexes ALL `cat.descriptors` (`:135-178`). So without a `resolve()` fallback every imported descriptor is a **discoverable-but-uninvocable dead entry**. The load-bearing deliverable is a single descriptor-only fallback branch mapping such a slug to a **non-null seam tier** (T3 DOM by default; T2 learn-pending when a discovery seed exists) — the router already maps both to actionable typed reasons (`RECIPE_DOM_FALLBACK_PENDING` / `RECIPE_LEARN_PENDING`) with **zero router changes**.

**Major components (NEW / MOD against verified seams):**
1. **Codegen `scripts/codegen-opentabs.mjs` (NEW)** — reads the pinned snapshot; emits committed `catalog/descriptors/*.json` + `discovery-seeds.json` (zod→JSON-Schema; side-effect static-scan; provenance). `package-extension.mjs` re-reads them via the existing `readJsonDir` (MOD: one added call; IIFE shape + `catalogVersion` hashing unchanged).
2. **Catalog `resolve()` (MOD)** — the descriptor-only → T3/T2 no-dead-entry branch + `HEAD_HANDLER_MODULES += ports`. **The quality gate.** `capability-search.js` adds a `getDescriptorBySlug` export (otherwise unchanged).
3. **Hand-port handlers `catalog/handlers/<app>.js` (NEW x15-30)** — dual-export IIFE, own first-party origin, `executeBoundSpec`-only, tokens never logged, self-register via `registerHandler` at load. Three wiring edits per port (self-register, `HEAD_HANDLER_MODULES` entry, `background.js` importScripts). Writes **fail-closed to DOM fallback** until live-captured.
4. **Denylist data `service-denylist.json` (MOD, FIRST)** + **discovery seeds `discovery-seeds.json` (NEW)** + **cross-check guard `verify-catalog-crosscheck.mjs` (NEW CI)** — the denylist code is untouched; `network-capture.js` gets a small MOD to read endpoint hints (no manifest/permission change).

Codegen emits **descriptors only, never recipes** — an unreplayed synthesized recipe is confidently-wrong from birth; recipes enter `catalog/recipes/` only by hand-authoring + `validateRecipe`, or the learned-store via promote-after-replay.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the integration map, anti-patterns, and the 9-phase build order.

### Critical Pitfalls

1. **Security-ordering trap (THE HEADLINE).** Opt-out Auto makes finance/health/social apps writable the moment their descriptor lands; six finance apps are absent from the 4-origin denylist; a *gap* in a JSON array is indistinguishable from an *allow* decision. **Avoid:** denylist expansion + import-time classification gate (CI refuses an unclassified sensitive/ToS origin) **lands FIRST as a hard dependency** (Phase 35). No descriptor-import phase merges until that gate is green.
2. **Cloning the imperative model → head sprawl → MV3 "code as data" ban.** Each OpenTabs plugin is full imperative TS; "just port the handlers" balloons the head and pressures toward *streaming* handlers from the server (Wall 1 violation). **Avoid:** breadth = descriptors-only (data); cap the head at ~15-30 with a CI assertion on `HEAD_HANDLER_MODULES`; extend the recipe-path-guard drift check; the tail is learned, never streamed-as-code.
3. **One-size codegen vs per-app auth diversity → silent wrong/empty results.** Mapping bespoke auth onto the 4-member enum produces a bind that compiles and validates but is wrong (missing header, wrong subdomain, stale CSRF) — returning 200-with-logged-out-body that *looks* like success, unprompted under Auto. **Avoid:** decouple discoverable from invocable; never auto-mint a declarative recipe from guessed auth; bespoke auth (Stripe/Linear/Instagram-shaped) is head-only or learn-only (observe-then-replay-clean before promotion).
4. **Side-effect mis-classification at scale.** GraphQL/RPC mutations tunnel through POST (Notion `/api/v3`, Linear, GitHub `_graphql`) → "class by HTTP method" mis-labels destructive ops as `read` → fully writable with no friction. **Avoid:** verb-map (`void_`/`delete_`/`create_` → write) + GraphQL/RPC carve-out + **fail-safe-high** (disagreement → write); recipe-wins runtime cross-check; sample-test the known destructive ops (`void_invoice`, `delete_customer`).
5. **Search precision + SW cold-start at ~2,523 docs.** Recall@5=1.000 at 10 docs says nothing about precision at 2,523 docs where dozens of apps share verbs ("send message", "list invoices"); a synchronous full-index rehydrate stalls every capability call after MV3 eviction. **Avoid:** rich `intentSynonyms` (>=3-4 phrases/op) + owned-origin bias; **re-run the eval harness at full scale** (wrong-invoke=0 gate); index searchable-text-only + schema-on-hit; **deferred hydration** off the bootstrap critical path + a CI cold-start benchmark.

Additional pitfalls fully analyzed in [PITFALLS.md](PITFALLS.md): token/secret leakage across 119 bespoke auth shapes (structural redaction + full-field no-leak test); recipe-rot thundering-herd (per-origin re-learn coalescing + back-off + app-level surfacing); ToS/legal exposure (a ToS-hostility axis distinct from finance sensitivity → DOM-only or denylist); discoverable-but-uninvocable dead descriptors (backing-status field + honest "learn-on-visit" affordance + a discoverable-AND-invocable coverage gate).

## Implications for Roadmap

Based on research, the **convergent 9-phase, denylist-first, category-batched structure (Phases 35-43)** — phases continue from v0.9.99's Phase 34. Ordering principle: **denylist before reach** → **pipeline before content** → **breadth before depth within a category** → **discovery seeding alongside breadth** → **scale gate last**. Every phase keeps INV-01..04 + Walls 1/2 green.

### Phase 35: Denylist Expansion + Import-Time Classification Gate (LANDS FIRST)
**Rationale:** Opt-out Auto makes the denylist the ONE hard floor; six finance apps are uncovered. This is a hard dependency for every later import phase, not a parallel track.
**Delivers:** expanded `service-denylist.json` (`deniedOrigins` + `sensitiveOrigins`) covering banking/payments/brokerage/crypto/health AND the ToS-hostility axis (social/adult/messaging → DOM-only/denied); an **import-time CI gate** that refuses to emit a descriptor for an unclassified sensitive/ToS origin; `vendor/opentabs-snapshot/` + `PIN.md` (MIT); `_provenance.json` scaffold; `docs/LEGAL.md` update naming the ToS axis.
**Addresses:** denylist-first table stake; ToS-hostility classification.
**Avoids:** Pitfall 1 (security-ordering), Pitfall 8 (ToS/legal exposure).

### Phase 36: Codegen Pipeline + No-Dead-Entry Resolution
**Rationale:** The no-dead-entry resolution + the side-effect cross-check + the full-scale search proof must exist *before* 2,523 descriptors land, or the first batch ships dead/unsafe entries.
**Delivers:** `codegen-opentabs.mjs` (metadata→descriptor; zod→JSON-Schema via `z.toJSONSchema`; side-effect static-scan + escalate-to-write); `verify-catalog-crosscheck.mjs` (CI); the `resolve()` descriptor-only→T3/T2 branch + `getDescriptorBySlug`; backing-status + auth-shape coverage markers; a **single non-sensitive category smoke** (productivity: airtable/asana/clickup).
**Uses:** zod + tsx (STACK); the existing `readJsonDir`/`INDEX_OPTIONS`/`@cfworker/json-schema`.
**Implements:** the codegen + catalog-resolve + cross-check components (ARCHITECTURE Decisions A/B/C).
**Avoids:** Pitfall 9 (dead descriptors), Pitfall 3 (auth diversity), Pitfall 4 (side-effect), Pitfall 6 (search/startup — full-scale eval harness re-run + SW cold-start benchmark are Phase-36 gates).

### Phases 37-39: Breadth Batches (least-sensitive → most-sensitive)
**Rationale:** Importing descriptors in sensitivity-ascending batches proves denylist coverage incrementally; each batch carries a denylist-coverage assertion.
**Delivers:** **37 — Dev/Productivity** (linear, jira, confluence, clickup, asana, airtable, vercel, circleci, cloudflare, datadog-read, …) + seeds; **38 — Comms/Social/Content** (sensitivity-screened, only after Phase 35 covers the origins); **39 — Commerce/Travel/Misc** (payment-flow ops fail-closed or denied).
**Addresses:** descriptor import for all ~117 real apps; seeded discovery.
**Avoids:** Pitfall 1 (each batch gated on coverage), Pitfall 2 (descriptors stay data-only).

### Phases 40-41: Depth Batches (hand-ports; guarded writes)
**Rationale:** Hand-ports upgrade the hot subset already discoverable from breadth; reads ship first, writes fail-closed until live-verified.
**Delivers:** **40 — top READ heads** (~8-12: linear.issues.list, jira.search, datadog.query, vercel.deployments, …) as T1a/T1b; **41 — remaining heads + guarded writes** (~7-18, write ops fail-closed to DOM fallback per the `github.issues.create` pattern, each `[ASSUMED-ENDPOINT]` → human_needed live-UAT).
**Uses:** the `github.js` handler contract (executeBoundSpec-only, own-origin, no token logging).
**Implements:** the hand-port component (ARCHITECTURE Decision D).
**Avoids:** Pitfall 2 (head cap enforced), Pitfall 3 (only verified auth is invocable), Pitfall 5 (no token logging).

### Phase 42: Discovery Seeding Hardening + Tail Learn
**Rationale:** Seeds the tail that neither breadth-T3 nor depth-T1a covers with the API fast path, via learning.
**Delivers:** finalized `discovery-seeds.json` (all non-hand-ported origins + endpoint hints harvested from OpenTabs `*-api.ts`); `network-capture.js` reads hints; verify a seeded origin learns a T2 recipe via promote-after-replay (consent-gated); the structural-redactor + no-leak test extended to the full 119-app auth-field universe.
**Implements:** the discovery-seeding component (ARCHITECTURE Decision E).
**Avoids:** Pitfall 5 (token leakage at scale), Pitfall 9 (learn-on-visit affordance).

### Phase 43: Catalog-Scale + Milestone Gate
**Rationale:** Full-corpus performance + parity + provenance close the milestone (mirrors the v0.9.99 Phase-32 milestone-gate posture).
**Delivers:** measure index build/restore + generated-file parse at ~2,523 descriptors (split into `descriptor-index.generated.js` if the single IIFE is too large); final eval harness; recipe-rot self-heal hardening (per-origin re-learn coalescing/back-off, app-level degraded surfacing); 7-provider parity; full `npm test` EXIT 0; complete MIT provenance.
**Avoids:** Pitfall 6 (scale), Pitfall 7 (rot thundering-herd).

### Phase Ordering Rationale
- **35 strictly first** — opt-out Auto makes the denylist the only floor; the import-time gate makes the ordering a CI failure, not a hope. No category with a sensitive app imports before its origins are classified.
- **36 before any real import** — the no-dead-entry branch + cross-check guard + full-scale search proof are prerequisites for shipping descriptors safely and discoverably.
- **37-39 ascending sensitivity** — proves denylist coverage incrementally with a per-batch assertion.
- **40-41 after breadth** — depth upgrades the already-discoverable hot subset; writes fail-closed until live-captured.
- **42 after breadth + depth** — seeds the residual tail for the learner.
- **43 last** — full-corpus scale, parity, and provenance close, with self-heal hardening for the now-119-app rot surface.

### Research Flags

Phases likely needing deeper research during planning (`/gsd-plan-phase --research-phase <N>`):
- **Phase 36:** the zod→closed-`params` flattening edge cases (`z.union`→permissive `anyOf`, `z.record`/`z.enum`) and the forbidden-field-name pre-scan interaction need a fixture-backed pass; the side-effect verb-map + GraphQL/RPC carve-out needs the destructive-op sample as an acceptance test; the full-scale eval-harness fixture (cross-app near neighbors) + SW cold-start budget need concrete numbers.
- **Phases 40-41 (per-app):** each Pattern-D/E port needs a **per-app CORS / first-party-origin verification** before commitment — linear is documented-safe; **supabase, mongodb-atlas, circleci, and any cloud-console are UNVERIFIED**; the gapi-bridge (google-calendar) is a distinct handler shape needing its own design + end-to-end validation. Live-capture UAT for guarded writes is human_needed.
- **Phase 42:** structural-redaction completeness against 119 unknown auth field shapes; promote-after-replay behavior with seeded hints.

Phases with standard / already-proven patterns (lighter research):
- **Phase 35:** denylist is existing data + the `service-denylist.js` loader is untouched; the work is classification judgement + the CI gate, not new mechanism.
- **Phases 37-39:** descriptor emission reuses the Phase-36 pipeline; per-batch work is classification + coverage assertions.
- **Phase 43:** the scaling levers (schema-on-hit, deferred hydration, incremental index, file split) are known FSB patterns; the work is measurement + gating.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Extraction shape verified directly against the real OpenTabs repo (`defineTool`, `z.toJSONSchema` in `build.ts`, no side-effect field, `dist/` gitignored); versions verified via npm + Context7 on 2026-06-23. |
| Features | HIGH (auth taxonomy/tiers), MEDIUM (per-app value ranking) | Auth taxonomy grounded in 20 OpenTabs `*-api.ts` files read in full + 10 grepped; op counts verified. "Where FSB users live" is product judgement. ToS/sensitivity classification is categorical (HIGH). |
| Architecture | HIGH | Every integration seam read live from on-disk FSB source on branch `automation` (resolve/REGISTRY/HEAD_HANDLER_MODULES, router consent + tier dispatch, search buildIndex, package-extension, github.js); OpenTabs op metadata read live via `gh api`. |
| Pitfalls | HIGH | Grounded in live `gh` inspection of `opentabs-dev/opentabs@HEAD` cross-checked against FSB's shipped `service-denylist.json` (the 4-origin gap is verified), `docs/LEGAL.md` (opt-out Auto posture), and the v0.9.99 STATE.md risk register. |

**Overall confidence:** HIGH. Four independent researchers converged on the same spine (feed-the-tiers, denylist-first, no-dead-descriptor, build-time-only codegen), which is the strongest available signal that the synthesis is correct.

### Gaps to Address

- **UNRESOLVED milestone-level posture decision — re-enforce a mutating opt-in for sensitive/finance origins under Auto?** v0.9.99 Phase 30 (just shipped) *removed* the per-origin mutating opt-in at the invoke gate under Auto ("read-Auto implies write-Auto"; sensitive-origin friction kept on discovery only). The flag still exists in storage — it simply isn't gated at invoke. With real brokerages/payments now in scope, **the roadmap must decide whether mutating invokes against `sensitiveOrigins` re-acquire the elevated opt-in.** This is a posture decision the requirements step must surface and resolve explicitly, NOT silently inherit. (Denylist covers the catastrophic worst; this decides the friction tier *above* the hard floor.)
- **Per-app CORS / first-party-origin verification is a gating dependency for Pattern-D/E ports.** linear documents its CORS in-source (feasible); **supabase, mongodb-atlas, circleci, cloud-consoles (azure/gcloud/aws/terraform) are UNVERIFIED** — porting any of them without a per-app CORS check yields silent runtime failures. Handle: each such port carries a CORS-verification acceptance gate before it is marked invocable; demote to T2-learned/T3-DOM if CORS is not permissive.
- **Pattern-C-hard apps (discord webpack-registry token, clickup WebSocket-captured JWT) are intentionally NOT hand-ported.** Handle: leave to T2-learned / T3-DOM; revisit only if the learner proves insufficient.
- **Guarded-write live-capture is human_needed UAT.** Each `[ASSUMED-ENDPOINT]` write op must not stamp success until a live-captured mutation body is confirmed; this debt is recorded, not fabricated (v0.9.99 carries the same posture forward and v1.0.0 does not block on it).
- **Scale thresholds are budgets, not yet measured.** Target serialized index < ~1-2 MB; `loadJSON` + first `search` < ~50-100 ms on SW wake; wrong-invoke=0 at 2,523 docs. Handle: Phase 36 establishes the benchmarks; Phase 43 closes them at full corpus (split the generated descriptor file if the single IIFE parse cost is too high).

## Sources

### Primary (HIGH confidence)
- **`opentabs-dev/opentabs@main` / @HEAD** (live authenticated `gh api`, 2026-06-23) — 119 plugins confirmed; op shape `defineTool({name,description,input:zod,output,handle})`; `z.toJSONSchema` conversion in `platform/plugin-tools/src/commands/build.ts:414-439`; `ManifestTool` shape with **no side-effect field**; `dist/` gitignored; 20 `*-api.ts` auth/transport files read in detail (linear, github, gitlab, stripe, datadog, jira, notion, supabase, sentry, cloudflare, netlify, instagram, …); op counts via `--jq length`; in-source CORS quotes (linear permissive, cloudflare blocked); MIT `LICENSE`; `DISCLAIMER.md`.
- **FSB repo, branch `automation`** (read live, 2026-06-23) — `extension/utils/capability-catalog.js` (resolve/REGISTRY/HEAD_HANDLER_MODULES :215-219,294-360), `capability-router.js` (invoke/_evaluateConsent/tier dispatch :654,688-727), `capability-search.js` (buildIndex/deriveSideEffect/catalogVersion :89-199), `scripts/package-extension.mjs` (readJsonDir/IIFE/handler copy :41-115), `catalog/handlers/github.js` (T1a shape), `catalog/descriptors/*.json`, `extension/config/service-denylist.json` (the verified 4-origin gap), `docs/LEGAL.md` (opt-out Auto), `.planning/PROJECT.md` (v1.0.0 framing, INV-01..04, Walls 1/2), `.planning/STATE.md` (v0.9.99 risk register + Phase 26-32 decision log), `package.json` / `extension/lib/*.min.js` (vendored runtime libs).
- **npm registry** (2026-06-23) — `zod 4.4.3`, `tsx 4.22.4`, `jiti 2.7.0`, `esbuild 0.28.1`, `typescript 6.0.3`.
- **Context7 `/websites/zod_dev_v4`** — `z.toJSONSchema()` is a documented top-level Zod 4 API; preserves `.describe()` into JSON Schema `description`.
- **Chrome Web Store program policy (MV3 remotely-hosted code)** — the basis for Wall 1 and the streamed-handler ban risk.

### Secondary (MEDIUM confidence)
- Per-app value/audience ranking in the depth shortlist — op counts are verified; "where FSB users live" is product judgement.
- supabase / mongodb-atlas / circleci / cloud-console portability — MEDIUM-to-LOW pending the per-app CORS verification flagged as a gating dependency.

---
*Research completed: 2026-06-23*
*Ready for roadmap: yes*
