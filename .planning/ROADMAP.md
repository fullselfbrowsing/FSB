# Roadmap: FSB (Full Self-Browsing)

## Milestones

- **v0.10.0 Autopilot via Lattice SDK** — Phases 01-13, shipped 2026-06-15.
- **v0.11.0 Trigger Tool (Reactive DOM Monitoring)** — Phases 14-20, completed 2026-06-17; release actions and browser UAT remain user-gated.
- **v0.12.0 PhantomStream Package Migration** — Phases 21-25, completed 2026-06-17; live Chrome-extension UAT remains user-gated.
- **v0.9.99 Native Capability Catalog (FSB API Execution)** — Phases 26-34, code-complete 2026-06-23 (full npm test EXIT 0); live-browser UAT debt carried forward. Phase 999.1 (click heuristics) retained in Backlog.
- 🚧 **v1.0.0 Full App Catalog (OpenTabs Parity)** — Phases 35-43, IN PROGRESS. Scales the v0.9.99 capability path from a 4-service head to the full ~119-app / ~2,523-op OpenTabs surface by feeding the existing tiers (breadth = descriptors as data; depth = hand-ported handlers; tail = seeded discovery + DOM fallback). Denylist-first, category-batched.

## Active Milestone

**v1.0.0 Full App Catalog (OpenTabs Parity)** — Phases 35-43.

**Milestone Goal:** Take FSB's capability catalog from the 4-service bundled head to the full ~119-app OpenTabs surface — every app discoverable via `search_capabilities` and invocable through the existing tiers — adding a hand-ported depth tier, an expanded service denylist, and seeded discovery, all WITHOUT violating MV3 Wall 1 (recipes stay closed-vocabulary data, never shipped code). The milestone is **NOT** a rebuild and **NOT** a port of OpenTabs' code: it is "feed the existing tiers, don't add tiers." Breadth = codegen closed-vocabulary **descriptors** (data) so every app returns from search; depth = hand-port ~15-30 top apps as T1a/T1b handlers exactly like the shipped `github.js`; the tail is reached by seeded network-capture discovery (T2) and the universal DOM fallback (T3). No new MCP tool, no new router branch, no new tier — INV-01..04 and Walls 1/2 are preserved by construction. The single new build-time stack is `zod@^4.4.3` + `tsx@^4.22.4` (devDeps only) to run OpenTabs' own `z.toJSONSchema()` extraction; nothing OpenTabs ships into the extension at runtime (Wall 1).

**Source:** `github.com/opentabs-dev/opentabs` (MIT, 119 plugins / 2,523 ops), pinned by commit SHA; attribution already in README Acknowledgements.

**Hard invariants (carried from v0.9.99 — every phase respects these):**
- **INV-01 MCP wire contracts UNTOUCHED.** The existing ~63 MCP tool schemas stay byte-identical; the 2 capability tools (`search_capabilities`, `invoke_capability`) stay OUTSIDE `TOOL_REGISTRY`. Breadth adds DATA + depth adds handlers behind the SAME 2 tools — no new MCP tool, no schema change; the frozen non-trigger registry hash stays unmoved.
- **INV-02 Tool-surface parity at the runtime layer.** Both front doors (MCP dispatcher + autopilot `tool-executor`) keep calling the SAME `FsbCapabilityRouter.invoke`; hand-ports register into the SAME catalog both doors read. No autopilot-only path.
- **INV-03 Provider parity.** Typed reasons (`RECIPE_DOM_FALLBACK_PENDING`, `RECIPE_LEARN_PENDING`, `RECIPE_CONSENT_BLOCKED`) stay byte-equal across all 7 `universal-provider.js` targets via the `/^RECIPE_.+$/` passthrough.
- **INV-04 MV3-survivability preserved.** The `agent-loop.js` `setTimeout`-chained iterator is load-bearing and untouched; invoke stays a single bounded async op. Codegen is build-time only.

**Architectural Walls (non-negotiable):**
- **Wall 1 (MV3 no remotely-hosted code):** descriptors are closed-vocabulary DATA; the importer NEVER emits a forbidden field name (`script`/`expr`/`transform`/`code`/`fn`/`js`); `verify-recipe-path-guard.mjs` stays green. OpenTabs is import-time metadata only — its `dist/`/`handle()` runtime is never shipped.
- **Wall 2 (execution context):** every credentialed call still goes through `capability-fetch.js executeBoundSpec` in the page MAIN world with the active-tab origin-pin; hand-ports are `executeBoundSpec`-only; CDP capture stays discovery-only.

## Phases

**Phase Numbering:**
- Integer phases continue from v0.9.99's Phase 34 — this milestone runs Phases 35-43. Numbering never restarts at 1. Phases 26-34 (v0.9.99) and 999.1 are untouched.
- Decimal phases (35.1, 35.2) remain reserved for urgent insertions (marked INSERTED) and execute between their surrounding integers.

**Ordering principle (all four researchers converged — do not reorder):** denylist before reach → pipeline before content → breadth before depth within a category (least-sensitive → most-sensitive) → discovery seeding after breadth + depth → scale gate last.

- [ ] **Phase 35: Denylist Expansion + Import-Time Classification Gate (LANDS FIRST)** - Expand `service-denylist.json` denied+sensitive to cover ALL banking/payments/brokerage/crypto/health + ToS-hostile categories across the 119 BEFORE anything imports; a fail-closed import-time CI gate; the posture-B sensitive-origin write re-gate; vendored MIT snapshot + provenance scaffold.
- [ ] **Phase 36: Codegen Pipeline + No-Dead-Entry Resolution** - The tsx/zod descriptor importer + side-effect cross-check guard + the load-bearing `resolve()` descriptor-only → T3/T2 fallback (no searchable-but-uninvocable dead entries), proven on one non-sensitive smoke category at full-scale eval + SW cold-start budget.
- [ ] **Phase 37: Breadth A — Dev / Productivity (least-sensitive)** - Import descriptors for the non-sensitive dev/PM/cloud/observability apps so they return from `search_capabilities` with intent synonyms, side-effect class, and a backing-status signal; establishes the category-batch-gated-on-denylist contract.
- [ ] **Phase 38: Breadth B — Comms / Social / Content (sensitivity-screened)** - Extend the breadth import to comms/social/content apps, each included only after Phase 35 covers its origin (denylist-coverage assertion per batch); ToS-hostile apps routed DOM-only/denied.
- [ ] **Phase 39: Breadth C — Commerce / Travel / Misc (most-sensitive)** - Extend the breadth import to commerce/travel/misc apps; payment-bearing flows fail-closed (T3 DOM) or denied; completes descriptor coverage of all real OpenTabs apps.
- [ ] **Phase 40: Depth 1 — Top READ Hand-Ports** - Hand-port the highest-value READ heads (~8-12) as T1a/T1b handlers via the `github.js` contract (own first-party origin, `executeBoundSpec`-only, tokens never logged) so the hot subset upgrades from descriptor-T3 to the API fast path.
- [ ] **Phase 41: Depth 2 — Remaining Hand-Ports + Guarded Writes** - Hand-port the remaining heads incl. WRITE ops that fail-closed to DOM fallback until live-captured; a per-app CORS / first-party-origin gate precedes any separate-API-origin (Pattern-D) port; sensitive-origin writes honor the DENY-04 mutating opt-in.
- [ ] **Phase 42: Discovery Seeding + Tail Learn** - Seed all non-hand-ported origins (+ endpoint hints harvested from OpenTabs `*-api.ts`) so the tail is learned on first authenticated visit (consent-gated, promote-after-replay); the structural redactor verified against the full 119-app auth-field universe.
- [ ] **Phase 43: Catalog-Scale + Milestone Gate** - Prove the search index + catalog stay within budget at ~2,523 descriptors; harden recipe-rot self-heal for 119-app scale; 7-provider parity byte-equal; full `npm test` EXIT 0 (the milestone gate).

## Phase Details

### Phase 35: Denylist Expansion + Import-Time Classification Gate (LANDS FIRST)
**Goal**: Make the service-denylist cover every categorically-prohibited and allowed-but-sensitive origin across the 119-app set, and make that coverage un-bypassable, BEFORE any descriptor that could reach a finance/health/ToS-hostile app is ever emitted — under the shipped opt-out Auto default the denylist is the ONE hard floor, so this is a hard dependency for every later phase, not a parallel track.
**Depends on**: Nothing within v1.0.0 (extends the v0.9.99 substrate; `service-denylist.js` loader unchanged). Strictly first.
**Requirements**: DENY-01, DENY-02, DENY-03, DENY-04
**Success Criteria** (what must be TRUE):
  1. `service-denylist.json` `deniedOrigins` hard-blocks the categorically-prohibited OpenTabs apps (brokerage/trading: robinhood, fidelity, carta; ToS-hostile media/social: netflix, spotify, twitch, steam, youtube-music, tinder, onlyfans; and the write-paths of instagram/facebook/tiktok/x) — confirmed by a test asserting each prohibited origin classifies `denied`.
  2. `service-denylist.json` `sensitiveOrigins` classifies the allowed-but-sensitive tier (payments: stripe, coinbase, twilio; budgeting: ynab; messaging-app writes; finance reads) as sensitive (Ask / mutating-gated), not denied — confirmed by a test over the sensitive roster.
  3. A build-time classification gate (in the importer and CI) refuses to emit a descriptor whose origin is not explicitly classified denied / sensitive / safe; an unclassified sensitive-or-ToS origin fails the build (fail-closed) — proven by a fixture that fails the build when a sensitive origin is left unclassified.
  4. Sensitive-classified origins re-enforce the per-origin mutating opt-in at the invoke gate (posture B): a WRITE to a sensitive origin requires the per-origin mutating flag; reads run under Auto everywhere; non-sensitive origins remain fully-open under Auto — the friction removed in v0.9.99 Phase 30 is re-scoped to sensitive origins only.
  5. The vendored MIT snapshot (`vendor/opentabs-snapshot/` + `PIN.md` = commit SHA + license) and the `_provenance.json` scaffold are in place, and `docs/LEGAL.md` names the ToS-hostility axis as a distinct categorization criterion.
**Plans**: 4 plans (2 waves)
  - [x] 35-01-PLAN.md — Denylist roster expansion: deniedOrigins + sensitiveOrigins for the named DENY-01/02 roster (exact-host forms) + per-origin classify() assertions [wave 1]
  - [x] 35-04-PLAN.md — OpenTabs provenance scaffold (PIN.md SHA + verbatim MIT, _provenance.json) + docs/LEGAL.md Categorization Axes [wave 1]
  - [x] 35-02-PLAN.md — Fail-closed classification gate (verify-classification-gate.mjs, classifyGate export + CLI) + proof fixture, chained into validate:extension [wave 2]
  - [x] 35-03-PLAN.md — Posture-B sensitive-write re-gate in _evaluateConsent (RECIPE_CONSENT_MUTATING_REQUIRED, scoped to classify().sensitive) [wave 2]

### Phase 36: Codegen Pipeline + No-Dead-Entry Resolution
**Goal**: Build the descriptor import pipeline and the load-bearing "no dead descriptor" resolution so that the moment 2,523 descriptors land they are both safe (side-effect class cross-checked, escalate-to-write on disagreement) and invocable (every searchable slug resolves to a non-null tier) — the pipeline and the quality gate must exist before any real content import.
**Depends on**: Phase 35 (denylist + classification gate must be green before the importer emits anything).
**Requirements**: CGEN-01, CGEN-02, CGEN-03, CGEN-04
**Success Criteria** (what must be TRUE):
  1. A build-time `scripts/import-opentabs-catalog.mjs` (run under tsx) extracts each OpenTabs op's metadata (slug, params via `z.toJSONSchema`, service/origin, action verb, description) into provenance-stamped descriptor JSON under `catalog/descriptors/opentabs/`, pinned to the OpenTabs commit SHA, with NO runtime OpenTabs/plugin-sdk dependency shipped (Wall 1).
  2. Each op's side-effect class is inferred from its transport verb (apiGet → read; apiPost/apiPut/apiDelete → write/destructive) plus an override table, and a descriptor-vs-derived cross-check (`verify-catalog-crosscheck.mjs`, chained into `validate:extension`) fails the build when a descriptor under-states a destructive op — proven by a destructive-op sample test (`void_invoice`, `delete_customer` class `destructive`; GraphQL/RPC POSTs never class `read`).
  3. `capability-catalog.js resolve()` gains a single fallback branch so a descriptor-only slug (no bundled handler or recipe) resolves to T3 (DOM) or T2 (learn-pending when seeded) — a harness assertion proves every slug `search_capabilities` can return resolves to a non-null tier, so `invoke` never returns `RECIPE_NOT_FOUND` for a searchable slug.
  4. The generated catalog is committed and inlined by `scripts/package-extension.mjs` via the existing `readJsonDir` path with a stable `catalogVersion`; the IIFE shape and djb2 hashing are unchanged; on one non-sensitive smoke category the full-scale eval harness re-passes (recall@k, wrong-invoke=0) and the SW cold-start parse stays within budget.
**Plans**: 4 plans (Wave 1: 36-01; Wave 2: 36-02, 36-03, 36-04)
- [x] 36-01-PLAN.md — CGEN-01: build-time tsx importer (z.toJSONSchema extraction + recursive Wall-1 forbidden-field pre-scan + classifyGate-before-emit + flat provenance-stamped descriptors); deps hardened to devDeps; phase-wide test/gate registration
- [x] 36-02-PLAN.md — CGEN-03: the load-bearing resolve() descriptor-only fallback (T3 default / T2 when backing:learn) + no-dead-entry harness + router invoke proof (never RECIPE_NOT_FOUND for a searchable slug)
- [x] 36-03-PLAN.md — CGEN-02: verify-catalog-crosscheck.mjs (verb-map + GraphQL/RPC carve-out + override table, MAX-merge fail-safe-high) fails the build on an under-stated destructive op; void_invoice/delete_customer sample test
- [x] 36-04-PLAN.md — CGEN-04: catalog inlining via the unchanged readJsonDir/IIFE/djb2 path (INV-01) + smoke-category eval re-pass (recall@5>=0.9, wrong-invoke=0) + cold-start size/time asserts + HEAD_HANDLER_MODULES cap

### Phase 37: Breadth A — Dev / Productivity (least-sensitive)
**Goal**: Import descriptors for the least-sensitive dev/PM/cloud/observability apps and, in doing so, establish the breadth contract every later batch reuses: all real apps return from search with rich intent synonyms + side-effect class + a backing-status signal, and every batch is gated on its origins being denylist-classified before merge. This phase OWNS the BRDTH-01/02/03 requirements; Phases 38-39 extend the same contract to more categories.
**Depends on**: Phase 36 (the importer + no-dead-entry resolution + cross-check + full-scale search proof must exist first).
**Requirements**: BRDTH-01, BRDTH-02, BRDTH-03
**Success Criteria** (what must be TRUE):
  1. Descriptors for the dev/productivity OpenTabs apps (linear, jira, confluence, clickup, asana, airtable, vercel, circleci, cloudflare, datadog-read, …; excluding the e2e-test/prescript-test fixtures and the DENY-01 denied set) are imported and returned by `search_capabilities` with intent synonyms and side-effect class per op.
  2. The apps are imported as a category batch and the merge carries a denylist-coverage assertion (DENY-03) — establishing the "import in category batches ordered least-sensitive → most-sensitive, each gated on its origins being classified" rule that Phases 38-39 inherit.
  3. Each imported descriptor carries an invocability/backing-status signal (recipe / handler / learn-pending / DOM) so a user or agent can distinguish day-one-invocable apps from discovery-pending ones, and `search_capabilities` annotates by it (no confident invocable hit for a pending-only descriptor).
  4. The crosscheck CI gate and the eval harness stay green on the growing corpus; the descriptor-only → T3/T2 fallback is verified for this batch.
**Plans**: 4 plans (4 waves -- sequential; each sub-batch regenerates the shared catalog snapshot)
  - [x] 37-01-PLAN.md — Breadth contract machinery (importer batch-enumeration + MED-03 synonym fix + backing-status enum + search annotation + merge-time classifyGate batch gate) + vendor linear/asana + Wave-0 proof tests [wave 1] (BRDTH-01/02/03)
  - [x] 37-02-PLAN.md — Vendor clickup/jira/confluence/airtable (data-only, reuses the contract) + regen snapshot + extend eval [wave 2] (BRDTH-01)
  - [x] 37-03-PLAN.md — Vendor gitlab/bitbucket/vercel/netlify (data-only) + regen snapshot + extend eval [wave 3] (BRDTH-01)
  - [x] 37-04-PLAN.md — Vendor cloudflare/circleci/datadog/sentry/posthog (data-only) + regen snapshot + re-assert crosscheck/no-dead-entry/eval/cold-start over the complete batch [wave 4] (BRDTH-01)

### Phase 38: Breadth B — Comms / Social / Content (sensitivity-screened)
**Goal**: Extend the Phase-37 breadth contract to the comms / social / content apps — the first batch where ToS-hostility and write-sensitivity bite — importing each app's descriptors only after Phase 35 covers its origin, and routing ToS-hostile apps to DOM-only/denied rather than API-invocable.
**Depends on**: Phase 37 (reuses the breadth pipeline + the backing-status + the batch-gating contract). Continuation of BRDTH-01/02/03 to additional categories (no new v1.0.0 REQ-ID owned).
**Success Criteria** (what must be TRUE):
  1. Descriptors for the screened comms/social/content apps (discord, bluesky, reddit-extra, chatgpt, claude, …) are imported and returned by `search_capabilities`, each included only after a per-app sensitivity check.
  2. A denylist-coverage assertion for this batch passes before merge (every sensitive social/messaging origin in the batch is classified denied-or-sensitive); ToS-hostile apps carry a DOM-only routing marker (T3) and are never fully-API-invocable-by-default.
  3. The crosscheck CI gate and the eval harness stay green as the corpus grows; descriptor-only slugs in this batch resolve to a non-null tier.
**Plans**: 3 plans (sensitivity-ascending; the screening lands first and gates the import)
- [x] 38-01-PLAN.md — Per-app sensitivity screening: classify every comms/social/content batch origin (denied/sensitive/safe) in service-denylist.json + extend the docs/LEGAL.md Categorization Axes; prove the fail-closed merge gate (unclassified social origin aborts), the posture-B sensitive-write re-gate (discord), and the conservative DOM-only default (frozen backing:'dom', no machinery edit)
- [x] 38-02-PLAN.md — Import the AI-chat + microblog/fediverse sub-batch (chatgpt, claude, bluesky, mastodon, threads) as DOM-only data via the frozen importer (gated on 38-01); regen snapshot; per-wave crosscheck + no-dead-entry + eval + cold-start green
- [x] 38-03-PLAN.md — Import the messaging + content-read sub-batch (discord writes, reddit reads) completing the category; prove the sensitive-write gating END-TO-END on the REAL emitted opentabs__discord__send_message descriptor through the live consent gate; regen snapshot; full-category gates green

### Phase 39: Breadth C — Commerce / Travel / Misc (most-sensitive)
**Goal**: Complete descriptor coverage of all real OpenTabs apps by importing the commerce / travel / misc batch (the most-sensitive end of the ascending order), screening out or denying payment-bearing flows so no descriptor arms a money-moving operation under Auto.
**Depends on**: Phase 38 (final, most-sensitive breadth batch on the same gated pipeline). Continuation of BRDTH-01/02/03 (no new v1.0.0 REQ-ID owned).
**Success Criteria** (what must be TRUE):
  1. Descriptors for the commerce/travel/misc apps (booking, airbnb, bestbuy, costco, craigslist, dominos, chipotle, calendly, …) are imported and returned by `search_capabilities`, completing coverage of all real apps (excluding fixtures + the denied set).
  2. A denylist-coverage assertion passes for this batch; payment-flow ops fail-closed (T3 DOM) or are denied — no payment-bearing op is API-invocable under Auto.
  3. After this batch the discoverable-AND-invocable coverage breakdown (head / learn-on-visit / DOM-only / dead) is reportable across the full ~117-app real set, and the crosscheck + eval harness stay green at the now-near-full corpus.
**Plans**: TBD

### Phase 40: Depth 1 — Top READ Hand-Ports
**Goal**: Upgrade the hot subset already discoverable from breadth by hand-porting the highest-value READ heads as first-class T1a/T1b handlers exactly like the shipped `github.js` — own first-party origin, `executeBoundSpec`-only, scraped tokens never logged — so the most-used reads run on the API fast path instead of DOM. This phase OWNS DEPTH-01 (the hand-port contract + the read heads); Phase 41 owns the guarded-write requirement.
**Depends on**: Phase 39 (depth upgrades apps that are already discoverable from the completed breadth corpus). Per-app CORS/first-party-origin verification gates any separate-API-origin head (linear is documented-safe).
**Requirements**: DEPTH-01
**Success Criteria** (what must be TRUE):
  1. ~8-12 highest-value READ heads (linear.issues.list, jira.search, datadog.query, vercel.deployments, …) ship as T1a/T1b handlers via the `github.js` contract: each targets its app's OWN first-party origin (the separate-origin public API is forbidden — the session cookie does not cross), self-registers via `registerHandler`, is listed in `HEAD_HANDLER_MODULES`, and is loaded via `background.js importScripts`.
  2. Each hand-port calls `ctx.executeBoundSpec` ONLY (never a browser scripting/tabs API) so the active-tab origin-pin holds, and scraped CSRF/tokens live only inside the bound spec — a test asserts no api-subdomain appears and no token reaches a log line.
  3. Both front doors hit the registered handlers through the SAME `FsbCapabilityRouter.invoke` (INV-02), and the head-handler tests (origin-separation, no-token-logging) plus router parity stay green; the head cap (~15-30) is enforced by a CI assertion on `HEAD_HANDLER_MODULES`.
**Plans**: TBD

### Phase 41: Depth 2 — Remaining Hand-Ports + Guarded Writes
**Goal**: Complete the depth head with the remaining hand-ports including WRITE ops, holding writes fail-closed to DOM fallback until a live-captured mutation body confirms them, re-enforcing the DENY-04 mutating opt-in on sensitive origins, and gating any separate-API-origin (Pattern-D) port behind a per-app CORS verification so an unverified port can never silently fail.
**Depends on**: Phase 40 (continues the `github.js`-shape hand-port mechanism; adds the write + CORS-gate dimension).
**Requirements**: DEPTH-02
**Success Criteria** (what must be TRUE):
  1. The remaining heads (~7-18) ship, and every WRITE op fails closed to `RECIPE_DOM_FALLBACK_PENDING` (the `github.issues.create` pattern) until a live-captured mutation body is confirmed — a guarded write never stamps success for an unverified mutation, and each `[ASSUMED-ENDPOINT]` carries a `human_needed` live-UAT (recorded, not fabricated).
  2. A WRITE to a sensitive origin honors the DENY-04 per-origin mutating opt-in at the invoke gate (posture B); reads remain fully-open under Auto.
  3. A per-app CORS / first-party-origin verification gate precedes any separate-API-origin (Pattern-D) port: linear is documented-safe and may port; supabase / cloud-consoles / other UNVERIFIED origins must pass the CORS check or be demoted to T2-learned / T3-DOM.
  4. The head cap holds, INV-03 typed reasons stay byte-stable across all 7 providers, and the depth tests stay green.
**Plans**: TBD

### Phase 42: Discovery Seeding + Tail Learn
**Goal**: Make the non-hand-ported tail invocable predictably by seeding all its origins (+ endpoint hints harvested from OpenTabs `*-api.ts`) so the existing Phase-31 network-capture path learns each origin on the first authenticated visit (consent-gated, promote-after-replay), and prove the capture-time structural redactor leaks no auth substring across the full 119-app field universe.
**Depends on**: Phase 41 (seeds the residual tail that neither breadth-T3 nor depth-T1a covers with the API fast path). Reuses the Phase-31 discovery machinery unchanged except for reading endpoint hints.
**Requirements**: DSEED-01, DSEED-02
**Success Criteria** (what must be TRUE):
  1. The OpenTabs origins (+ known endpoint hints) seed the Phase-31 network-capture discovery via a `discovery-seeds.json`; `network-capture.js` reads the hints (no manifest/permission change), and a seeded origin is verified to learn a T2 recipe via promote-after-replay (consent-gated) — a hint only biases recognition, never executes, until a real captured + replayed call promotes it.
  2. A descriptor whose origin has a seed resolves to T2 (learn-pending) and a learned T2 recipe outranks the descriptor-T3 on the next visit, so the hot tail upgrades to the API fast path from the user's own traffic; `RECIPE_LEARN_PENDING` surfaces as an actionable "open the site while logged in to learn it" affordance, not a silent no-op.
  3. The capture-time structural redactor is extended and verified against the 119-app field universe so no auth substring (Stripe `session_api_key`, Instagram `csrftoken`, Linear `linear-client-id`, token-shape patterns, …) is persisted into any learned-recipe envelope, audit entry, or diagnostic ring at scale — capture reads structure only, never a header value/body/query.
**Plans**: TBD

### Phase 43: Catalog-Scale + Milestone Gate
**Goal**: Close the milestone by proving full-corpus performance, hardening self-heal for the now-119-app rot surface, and gating on the full test suite — mirroring the v0.9.99 Phase-32 milestone-gate posture.
**Depends on**: Phase 42 (full-corpus scale, parity, and provenance close after breadth + depth + discovery are all in).
**Requirements**: SCALE-01, SCALE-02
**Success Criteria** (what must be TRUE):
  1. The search index and catalog stay within budget at ~2,523 descriptors (searchable-text indexed; params schema-on-hit / out-of-band; sharded by service / split into `descriptor-index.generated.js` if the single IIFE parse is too costly), proven by the extended SURF-06 eval harness with size/load-time assertions (serialized index < ~1-2 MB; `loadJSON` + first search < ~50-100 ms on SW wake) and wrong-invoke=0 at full scale.
  2. Recipe-rot self-heal is hardened for 119-app scale: per-origin re-learn coalescing / back-off (no thundering-herd of CDP attaches when one vendor changes site-wide), recurrence-based systemic-vs-transient classification, and an app-level degraded/needs-re-port surfacing.
  3. The typed fallback reason stays byte-equal across all 7 providers (INV-03), per-app MIT provenance/attribution is complete, and full `npm test` exits 0 — the milestone gate; INV-01..04 + Walls 1/2 guards all green.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 35 → 36 → 37 → 38 → 39 → 40 → 41 → 42 → 43 (decimal insertions, if any, run between their surrounding integers). Denylist-first (35) and pipeline-before-content (36) are hard ordering constraints — no breadth batch merges before its origins are denylist-classified.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 35. Denylist Expansion + Import-Time Classification Gate | 4/4 | Complete    | 2026-06-24 |
| 36. Codegen Pipeline + No-Dead-Entry Resolution | 4/4 | Complete    | 2026-06-24 |
| 37. Breadth A — Dev / Productivity | 4/4 | Complete    | 2026-06-25 |
| 38. Breadth B — Comms / Social / Content | 3/3 | Complete    | 2026-06-25 |
| 39. Breadth C — Commerce / Travel / Misc | 0/TBD | Not started | - |
| 40. Depth 1 — Top READ Hand-Ports | 0/TBD | Not started | - |
| 41. Depth 2 — Remaining Hand-Ports + Guarded Writes | 0/TBD | Not started | - |
| 42. Discovery Seeding + Tail Learn | 0/TBD | Not started | - |
| 43. Catalog-Scale + Milestone Gate | 0/TBD | Not started | - |

## Completed Milestones

<details>
<summary>v0.9.99 Native Capability Catalog (FSB API Execution) — Phases 26-34, CODE-COMPLETE 2026-06-23</summary>

Gave FSB first-class authenticated-API execution as a fast path alongside DOM automation, between Wall 1 (closed-vocabulary recipe DATA bound by a fixed interpreter) and Wall 2 (MAIN-world authenticated fetch). Full `npm test` EXIT 0; live-browser UAT debt (UAT-27/29/30/31/32-01) carried forward. The v1.0.0 milestone extends this substrate verbatim.

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 26 | Recipe Schema + Bundled Interpreter + MV3 CI Guard | 3/3 | Complete |
| 27 | Authenticated Fetch Primitive (MAIN-world) + Origin-Pin + Resume-Sidecar | 3/3 | Complete; live FETCH-05 UAT human_needed |
| 28 | Lean MCP Surface + Capability Search + Eval Harness | 4/4 | Complete |
| 29 | Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity | 5/5 | Complete; live-capture UAT human_needed |
| 30 | Consent Governance + Recipe Signature Verification + Audit + Legal Posture | 4/4 | Complete; live smoke human_needed |
| 31 | Network-Capture Discovery + Recipe Synthesis + Learned Recipes | 6/6 | Complete; live UAT human_needed |
| 32 | Self-Healing Fallback + Recipe-Rot + Re-Learn + Provider/Schema-Lock Tests + UAT | 5/5 | Complete; live self-heal UAT human_needed |
| 33 | PhantomStream Media Mirroring (0.2.1 Uptake) — milestone extension | 1/1 | Complete; live media UAT human_needed |
| 34 | Explicit File Upload Tool (upload_file) — milestone extension | 1/1 | Complete; live upload UAT human_needed |

Substrate carried into v1.0.0 (FIXED — do not redesign): tiers T0/T1a/T1b/T2-learned/T3-DOM; the closed-vocab interpreter; the consent gate (opt-out Auto default, denylist = the ONE hard floor); the 2 out-of-`TOOL_REGISTRY` MCP tools; `capability-catalog.js resolve()` / `capability-router.js invoke()` / `capability-search.js buildIndex()`; `scripts/package-extension.mjs readJsonDir` + the generated `recipe-index.generated.js` IIFE; the `github.js` T1a hand-port contract; `service-denylist.js` loader; `network-capture.js` discovery path; `verify-recipe-path-guard.mjs` Wall-1 guard.

</details>

<details>
<summary>v0.12.0 PhantomStream Package Migration — Phases 21-25, COMPLETED 2026-06-17</summary>

Archive files:

- `.planning/milestones/v0.12.0-ROADMAP.md`
- `.planning/milestones/v0.12.0-REQUIREMENTS.md`
- `.planning/milestones/v0.12.0-MILESTONE-AUDIT.md`
- `.planning/milestones/v0.12.0-phases/`

Phase summary:

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 21 | Package Intake & Contract Mapping | 3/3 | Complete |
| 22 | Capture Adapter Migration | 4/4 | Complete |
| 23 | Dashboard Renderer Migration | 4/4 | Complete |
| 24 | Transport, Relay & Remote Control Integration | 4/4 | Complete |
| 25 | Parity Removal, Docs & Browser UAT | 4/4 | Complete; human UAT debt recorded |

Known deferred closeout evidence: live Chrome-extension dashboard preview and remote-control UAT remains `human_needed`; see `.planning/milestones/v0.12.0-phases/25-parity-removal-docs-browser-uat/25-HUMAN-UAT.md`.

</details>

<details>
<summary>v0.11.0 Trigger Tool (Reactive DOM Monitoring) — Phases 14-20, COMPLETED 2026-06-17</summary>

Phase summary:

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 14 | Trigger Survivability Foundation | 3/3 | Complete |
| 15 | Fire-Condition Engine & Value Extraction | 3/3 | Complete |
| 16 | Live-Observe Watch & Analyzing Pulse | 4/4 | Complete |
| 17 | Refresh-Poll Watch (Tab-Owning Background Reload) | 4/4 | Complete |
| 18 | Shared Tool Registry & Dispatcher Wiring | 4/4 | Complete |
| 19 | MCP Tools & Blocking/Detached Reporting | 3/3 | Complete |
| 20 | Integration, Cap UI, Docs & Edge Cases | 5/5 | Complete; human UAT debt recorded |

Known deferred closeout evidence: live-browser/composed trigger UAT remains `human_needed`; publish/tag/release actions remain user-gated.

</details>

<details>
<summary>v0.10.0 Autopilot via Lattice SDK (Phases 01-13) — SHIPPED 2026-06-15</summary>

Archive files:

- `.planning/milestones/v0.10.0-ROADMAP.md`
- `.planning/milestones/v0.10.0-REQUIREMENTS.md`
- `.planning/milestones/v0.10.0-MILESTONE-AUDIT.md`
- `.planning/milestones/v0.10.0-phases/`

Phase summary:

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 01 | Lattice SDK gap survey + integration scaffolding | 2/2 | Complete |
| 02 | Lattice tripwire + receipt primitives extension | 5/5 | Complete |
| 03 | Observability + step-markers extension | 3/3 | Complete |
| 04 | Provider adapter alignment | 5/5 | Complete |
| 05 | MV3-survivability adapter contract + bundler infra + hybrid offscreen Lattice host | 6/6 | Complete |
| 06 | FSB engine consumes Lattice provider abstraction | 7/7 | Complete |
| 07 | Archive FSB custom provider stack | 4/4 | Complete |
| 08 | FSB agent brain on Lattice runtime | 3/3 | Complete |
| 09 | FSB SurvivabilityAdapter activated for MV3 SW eviction resumption | 3/3 | Complete |
| 10 | MCP-philosophy parity for autopilot driver | 3/3 | Complete |
| 11 | Tab-aware side panel surface | 5/5 | Complete |
| 12 | Side panel follows automation | 5/5 | Complete |
| 13 | Public Lattice package integration | 1/1 | Complete |

Known deferred closeout evidence: 11 human-gated Chrome MV3/UAT verification items were acknowledged at close. See `.planning/STATE.md` `## Deferred Items`.

</details>

## Carry-Forward Candidates

- **Consolidated Chrome MV3 UAT debt:** Run and capture archived v0.10/v0.11/v0.12 + v0.9.99 (UAT-27/29/30/31/32-01) browser evidence if release policy requires post-close proof. v1.0.0 does NOT block on it.
- **v2 deferred capability families (acknowledged, out of v1.0.0):** GAPI-01 (gapi-bridge handler family for Google Workspace via the `window.gapi.client.request` trampoline); CLOUD-01 (cloud-console Pattern-D ports — aws-console/azure/google-cloud/terraform-cloud — pending per-app CORS verification); UATX-01 (per-app live guarded-write UAT closeout across the hand-ported depth tier).
- **Delegation primitive:** Parked from v0.10.0; re-scope as either a Lattice-owned primitive or an FSB-only consumer of Lattice receipt + tripwire surfaces.

## Backlog

### Phase 999.1: MCP tool gaps — click heuristics

**Status:** Completed historical backlog work retained outside milestone archival.

- `999.1-01`: Route-aware MCP bridge dispatch + `execute_js` background handler.
- `999.1-02`: Text-based click targeting with TreeWalker visible-text matching.

Artifacts remain in `.planning/phases/999.1-mcp-tool-gaps-click-heuristics/`.
