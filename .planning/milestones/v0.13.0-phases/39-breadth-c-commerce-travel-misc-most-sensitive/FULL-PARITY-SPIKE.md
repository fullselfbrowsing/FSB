# Full OpenTabs Parity -- De-Risking Spike (Feasibility Report)

**Date:** 2026-06-25
**Scope:** Prove the existing importer (`scripts/import-opentabs-catalog.mjs`) can process the REAL OpenTabs plugins (which `import '@opentabs-dev/plugin-sdk'` + a sibling `schemas.ts`, unlike the hand-authored stubs), find every blocker, and produce a concrete full-import plan. NO full import performed; NO repo files changed (verified `git status` clean). All scratch work lived in `/tmp/opentabs-spike/` (deleted at end).
**Pinned SHA:** `4b17021637d2cac12b8d84d21c40e765aa7b85e9` (MIT).

---

## VERDICT: **GO**

The existing pipeline imports the REAL OpenTabs plugins **with no code change to the importer's core path**. A full **dry-run over ALL 117 real plugins (2,374 emittable ops)** produced:

| Metric | Result |
|--------|--------|
| Plugins that `import()` cleanly under tsx (real SDK + `schemas.ts` + `<app>-api.ts`) | **117 / 117** |
| `z.toJSONSchema(tool.input)` schema THROWS (`.transform`/`.pipe`/`.preprocess`/cycle) | **0** |
| Recursive `$ref`/`$defs` (lazy) reaching an INPUT schema | **0** |
| Wall-1 forbidden-field hits in an INPUT schema | **1** (`target.apply_promo_code`, field `code`) |
| Apps with empty `urlPatterns` (no derivable origin) | **2** (`grafana`, `sqlpad`) |
| Emittable ops (read / write / destructive) | **2,374** (1,669 / 534 / 171) |
| Extra non-SDK / non-zod runtime deps anywhere in the import graph | **0** |

Every blocker found is **small, enumerable, and has a mechanical mitigation** (below). None require touching the importer's load/transpile/extract path; the work is data-map extensions (`STEM_OVERRIDES`), 1 forbidden-field carve, 2 origin classifications, and a policy for 2 self-hosted apps.

---

## 1. The key SDK-resolution proof (the spike's central unknown)

The hand-authored slices import `defineTool`/`OpenTabsPlugin` from a local `sdk-stub.ts` + transport helpers from a local `<app>-api.ts` stub, explicitly to keep the real SDK's DOM/fetch surface out of the build importer. The real plugins import directly:

```ts
// real plugins/airtable/src/index.ts
import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import { listRecords } from './tools/list-records.js';
// real plugins/airtable/src/tools/list-records.ts
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { apiGet } from '../airtable-api.js';
import { mapRecord, recordSchema } from './schemas.js';   // sibling shared zod
// real plugins/airtable/src/airtable-api.ts
import { ToolError, getPageGlobal, parseRetryAfterMs, waitUntil } from '@opentabs-dev/plugin-sdk';
```

**Finding: the real `@opentabs-dev/plugin-sdk` (0.0.113, installed) imports cleanly in bare Node / under tsx.** Its `dist/index.js` re-exports `dom.js` / `fetch.js` / `storage.js` / `page-state.js` (the DOM/fetch surface), BUT every `document.*` / `window.*` / `localStorage` reference is **inside a function body**, never at module-eval time. Verified:
- `import('@opentabs-dev/plugin-sdk')` in bare node -> OK; `defineTool`, `OpenTabsPlugin`, `fetchJSON`, `getLocalStorage` all resolve.
- Since the importer reads `.input/.name/...` and NEVER executes `handle()`, the DOM/fetch code never runs.
- `@opentabs-dev/shared` (the SDK's one dependency) is also installed (`node_modules/@opentabs-dev/shared`).

**Consequence: NO sdk-stub is required for the real plugins.** The importer's `await import(index.ts)` resolves `@opentabs-dev/plugin-sdk` from `node_modules` directly. The `sdk-stub.ts` / `<app>-api.ts` stub files in the hand-authored slices are an artifact of the hand-authored approach, not a requirement of the real source.

The sibling `schemas.ts` resolves too: real tools import `{ recordSchema, mapRecord } from './schemas.js'` and tsx maps the `.js` specifier to the on-disk `schemas.ts`. `z.toJSONSchema` resolves the cross-file shared zod refs exactly as the milestone research predicted (this is why an AST-scraper was rejected).

### Proof descriptors captured (emitted by the real pipeline)

`airtable.update_cell` -- the union+record+null edge case, emitted as a clean closed-params schema:
```json
"value": { "anyOf": [
  {"type":"string"},{"type":"number"},{"type":"boolean"},{"type":"null"},
  {"type":"object","propertyNames":{"type":"string"},"additionalProperties":{}},
  {"type":"array","items":{}} ] }
```
(top-level `"additionalProperties": false`, all 5 sibling fields in `required` -- the closed `params` contract verbatim.)

Side-effect classification on real ops (via the shared `deriveClass`): `linear.archive_issue` -> **destructive** (graphql + `archive` verb -> the archive override floor fires); `github.merge_pull_request` -> write (PUT); `github.create_issue` -> write (graphql carve-out + create verb); `discord.send_message` -> write (POST literal). All correct.

**Representative sample imported (11 apps, 246 ops, 0 failures):** airtable, stripe, github, linear, doordash, booking, discord, **aws-console**, google-calendar, notion, webflow. `aws-console` (flagged UNVERIFIED in 36-RESEARCH) imported cleanly with 16 ops. The full 117-app dry-run then confirmed the result corpus-wide.

---

## 2. ALL blockers + edge-cases (full-119 corpus) with mitigations

### BLOCKER A -- Stem collisions / wrong stems: 40 of 117 apps (HARD blocker without mitigation)
The frozen host-stem derivation `service.replace(/^app\./,'').split('.')[0]` produces a WRONG or COLLIDING stem for **40 apps**. Six collision groups would emit **duplicate `opentabs__<stem>__*.json` filenames that overwrite each other**:

| Colliding stem | Apps that collide |
|----------------|-------------------|
| `console` | aws-console, clickhouse, google-cloud, twilio (4-way) |
| `www` | google-maps, npm, reddit, yelp |
| `atlassian` | confluence, jira |
| `cloud` | mongodb-atlas, temporal-cloud |
| `slack` | slack, slack-enterprise |
| `web` | telegram, whatsapp |

Plus ~28 single (non-colliding) wrong stems: azure->`portal`, bluesky->`bsky`, cloudflare->`dash`, cockroachdb->`cockroachlabs`, datadog->`datadoghq`, docker-hub->`hub`, excel-online->`excel`, fidelity->`digital`, google-* -> `analytics/calendar/docs/drive`, hackernews->`news`, microsoft-word->`word`, minimax-agent->`agent`, newrelic->`one`, panda-express->`pandaexpress`, posthog->`us`, spotify->`open`, steam->`store`, stripe->`dashboard`, terraform-cloud->`terraform`, youtube-music->`music`, etc.

**Mitigation (mechanical, no logic change):** extend the existing `STEM_OVERRIDES` map (importer line ~227) -- the exact per-app extension point 37-01 built and 38/39 already use -- with a canonical stem for all ~40 apps (and disambiguate the collision groups: `aws-console:'aws'`, `clickhouse:'clickhouse'`, `google-cloud:'gcloud'`, `twilio:'twilio'`; `slack-enterprise:'slackent'`; etc.). This is a pure data-map addition; `extractDescriptors`/`displayServiceStem` are untouched. **A full-import build MUST ship the complete override map or the collisions silently clobber descriptors** -- recommend a CI assertion that no two emitted apps produce the same stem.

### BLOCKER B -- `target.apply_promo_code` trips the Wall-1 forbidden-field pre-scan (1 op)
`target/src/tools/apply-promo-code.ts` has `input: z.object({ code: z.string()... })`. `code` is in the FORBIDDEN set (`script/expr/transform/code/fn/js`), so `assertCleanParams` **THROWS, aborting the entire `target` app import** (and, in `runImport`, the whole batch). This is the ONLY input-schema forbidden hit in all 2,374 ops.

(Note: `code`/`script` also appear in chipotle/dominos/leetcode/starbucks/ynab `schemas.ts` and `cloudflare/list-worker-routes` -- but ONLY in OUTPUT or shared/output schemas. The importer emits `tool.input` only, so those NEVER reach the pre-scan. Verified by importing all 8 suspects: 202 ops, only `target.apply_promo_code` trips.)

**Mitigation options (pick one at plan time):**
- (i) **Field-name remap (recommended):** the forbidden set targets *eval-able* names. A business "promo code" field is a false-positive of the same class as a 2FA/country `code`. Add a narrow, audited per-op input-field rename in the importer (`code` -> `promo_code` for this op) OR a small allowlist of business-`code` ops that bypass ONLY the literal `code` token (never `script/fn/js/eval`). Keep `script/expr/transform/fn/js` always-fatal.
- (ii) **Skip the op:** drop `target.apply_promo_code` (1 op) from the corpus. Cheapest; loses one op.
The Wall-1 guard is working as designed (fail-loud) -- this is a known-good surfacing, not a bug.

### BLOCKER C -- `grafana` + `sqlpad` have empty `urlPatterns` (2 apps)
Both are self-hosted apps: `package.json.opentabs.urlPatterns: []` with a runtime `configSchema.instanceUrl`. `readPluginMeta` derives `service = ''`, and `extractDescriptors` throws `"... has no opentabs.urlPatterns host"`. (The hand-authored corpus has a `grafana` slice synthesized with `grafana.com`; the REAL grafana has no static origin.)

**Mitigation:** either (a) **skip both** (self-hosted apps don't fit the origin-keyed denylist/search model cleanly), or (b) synthesize a placeholder origin (`grafana.com`/`sqlpad`-vendor host) + a `STEM_OVERRIDE`, matching what the hand-authored grafana slice already did. Recommend **skip for the first full pass** (2 apps, ~40+50 ops) and revisit self-hosted handling separately -- they need a different consent/origin story than a fixed-host app.

### EDGE-CASE D -- `z.lazy` (retool) + `.superRefine` (ynab): NON-blocking
- `retool/src/tools/json-value-schema.ts` uses `z.lazy(...)` -- but retool imported cleanly (50 ops) and **NO `$ref`/`$defs` reached any input** (the lazy schema is in a helper/output, not a `tool.input`). 0 cycles.
- `ynab/src/tools/schemas.ts` uses `.superRefine(...)` -- ynab imported cleanly (22 ops), 0 throws. Unlike `.transform()`, `.superRefine` is a validation effect that `z.toJSONSchema` ignores during serialization, so it does NOT throw.
- `.transform` / `.pipe` / `.preprocess` / `.brand` / `z.intersection` / `.and()`: **0 occurrences** in any input schema across all 117 plugins. (Upstream `build.ts` rejects transforms, so the corpus is clean by construction -- 36-RESEARCH A5 confirmed.)

`anyOf` (from `z.union`/`z.nullable`) appears in only **3 ops** corpus-wide; `z.record` (-> `propertyNames`+schema `additionalProperties`) is common but emits cleanly.

### EDGE-CASE E -- Multi-pattern + apex/www origins (handle, not block)
**11 apps declare multiple `urlPatterns`** (the importer keys off `urlPatterns[0]`): outlook (4: cloud.microsoft/live/office/office365), teams (3), reddit (3: www/old/new), snowflake (2 incl `*.snowflakecomputing.com`), excel-online/microsoft-word/powerpoint (each + a `*.sharepoint.com/:x:/` form), amplitude (2), minimax-agent (2), posthog (us/eu), temporal-cloud (2). The importer emits ONE descriptor service (pattern[0]); the denylist must classify that host. For multi-tenant wildcards (`*.snowflakecomputing.com`, `*.sharepoint.com`, `*.web.tmprl.cloud`) confirm `service-denylist.js` matching covers the apex form. **4 apps derive stem `www`** (google-maps/npm/reddit/yelp) -- folded into Blocker A's override map.

---

## 3. Origin-screening scope (re-screening sizing)

**114 distinct origins** across the 117 apps (115 origin-items incl. the atlassian.net dup shared by jira+confluence). Ran the REAL `classifyGate` over every origin (with each app's plugin description as the heuristic haystack) against the **currently-committed** `service-denylist.json`:

| Bucket | Count | Examples |
|--------|------:|----------|
| Already classified **DENIED** | 10 | carta, fidelity, robinhood, netflix, spotify, steam, twitch, tinder, onlyfans, youtube-music |
| Already classified **SENSITIVE** | 19 | stripe, coinbase, ynab, slack, discord, x, instagram, facebook, tiktok, whatsapp, telegram, twilio, teams, uber, craigslist, chatgpt, claude, bsky |
| Default **SAFE** | 86 | airtable, github, linear, notion, asana, todoist, datadog, vercel, booking, doordash, walmart, target, etc. |
| **classifyGate FAILURES** (unclassified but trips a heuristic axis) | **2** | `linkedin.com` (social axis), `youtube.com` (media axis) |

**Re-screening is small:** the fail-closed gate surfaces exactly **2 origins** that need an explicit decision (`linkedin.com`, `youtube.com` -- both should be classified denied/sensitive or safe-allowlisted before the import lands). Every other sensitive origin already has a classification OR is genuinely benign.

**Important policy gap (NOT a gate failure, but a screening decision):** many money-movement commerce/travel apps currently bucket **SAFE** because the heuristic only trips on a `place-order`/`checkout`/`charge` token and these apps' `urlPatterns[0]` host + description don't carry one (e.g. `doordash.com`, `walmart.com`, `target.com`, `bestbuy.com`, `costco.com`, `instacart.com`, `expedia.com`, `booking.com`, `airbnb.com`, `homedepot.com`, `priceline.com`, `redfin.com`, `ebay.com`, `dominos.com`, `chipotle.com`, `starbucks.com`, `pandaexpress.com`). The REAL plugins for these apps are largely **read-only** at this SHA (e.g. real doordash = list/get orders + addresses + profile, NO place_order; real booking = search/list trips, NO paid booking), so SAFE may be CORRECT for the real op sets -- but this MUST be confirmed per-app against the actual emitted ops (the importer's per-op side-effect class + the `place_order`-token heuristic), because the hand-authored corpus (phases 38/39) classified the www-forms of these brands SENSITIVE on the assumption they place paid orders. **Reconcile the real op sets against the existing sensitive classifications before importing** -- this is the single largest screening task, and it is a CLASSIFICATION review, not a gate failure (the gate passes because the read-only real ops don't trip the payment axis).

---

## 4. Scale implications (SCALE-01 cold-start budget)

Measured against the committed corpus + a faithful minisearch build:

| Quantity | Measured | Projected @ 2,374 ops |
|----------|----------|----------------------|
| Serialized minisearch index | 579.9 bytes/entry (240-entry seed -> 139 KB) | **~1.31 MB** |
| Inlined params JSON (parsed once at SW wake) | 288 bytes/op avg (real corpus) | **~683 KB** |
| Full inlined descriptor JSON (params + searchable + provenance) | ~1,358 bytes/descriptor (committed) | **~2.0 MB** raw catalog data |

**The binding constraint is the serialized search index at ~1.31 MB.** The SCALE-01 cold-start budget is ~1-2 MB serialized index + ~50-100 ms `loadJSON`+first-search. At 2,374 ops the index lands **inside the budget but in its upper half (~66-100% of the 1-2 MB band)**. FLAG: this is the headline scale risk. Mitigations available if it overshoots in practice: (a) the existing `synthSynonyms` cap (already 6/op) keeps the dominant `intentSynonyms` field bounded; (b) trim `description` from `storeFields` if needed; (c) shard/lazy-load the index. **Recommend measuring the real serialized index on the full corpus during the import and asserting `< 2 MB` + `loadJSON+first-search < 100 ms` in the eval harness (the machinery already exists; 36-RESEARCH Mechanic 4).** The 558-byte/descriptor figure in the brief is confirmed (579.9 measured).

---

## 5. Concrete full-import PLAN

### 5.1 Fetch + vendor mechanism
**Use the repo tarball at the pinned SHA, not per-file `gh api`** (per-file is ~2,400+ blob fetches; the tarball is one 49 MB download, fully hermetic):
```
gh api repos/opentabs-dev/opentabs/tarball/<SHA> > repo.tar.gz
tar -xzf repo.tar.gz            # -> opentabs-dev-opentabs-<short>/plugins/*
# For each non-fixture plugin dir, copy ONLY: package.json + src/** (index.ts,
# <app>-api.ts, tools/*.ts incl schemas.ts). Drop everything else (dist/, tests, icons
# beyond what's needed). This is the metadata slice vendor/opentabs-snapshot/plugins/<app>/
# already expects -- but vendoring the REAL src (no sdk-stub.ts / <app>-api stub).
```
Exclude the 2 CI fixtures via the existing `FIXTURE_DIR_RE` (`e2e-test`, `prescript-test`). Net: **117 plugin dirs**. (This is proven: the spike fetched + imported all 117 from exactly this tarball.)

### 5.2 SDK / schemas dependency
**No stub needed.** Keep `@opentabs-dev/plugin-sdk@0.0.113` + `@opentabs-dev/shared` + `zod@4.4.3` + `tsx@4.22.4` as devDependencies (already installed). The real `index.ts`/`tools/*.ts`/`<app>-api.ts` import the SDK directly and resolve from `node_modules` under tsx; `schemas.ts` resolves as a sibling. Wall-1 holds: the importer is build-time only, executes no `handle()`, ships pure-data descriptors. (If extra hardening is wanted, the SDK could still be import-mapped to the existing stub, but the spike shows it is unnecessary -- the real SDK has no module-eval-time DOM access.)

### 5.3 Batching
**Reuse the existing `enumerateBatchApps()` screen-then-import contract; run category batches, not all-at-once.** Rationale: the merge-time `classifyGate` coverage gate already aborts a batch naming an unclassified origin, so batching by category (dev/productivity, commerce, travel, social, cloud-infra, google/microsoft suites) lets each batch's origins be screened + reconciled before it lands, exactly as phases 37-39 did. The importer needs NO new batching logic -- it enumerates the vendored dir; the only change is the vendored set grows from 53 to 117 and the `STEM_OVERRIDES`/denylist data grows with it. (All-at-once also works mechanically -- the dry-run imported all 117 in one pass -- but category batches keep each screening decision reviewable.)

### 5.4 Re-screening approach
1. Add the **2 surfaced origins** (`linkedin.com`, `youtube.com`) to `service-denylist.json` (denied/sensitive) or the safe-allowlist.
2. **Reconcile the commerce/travel SAFE bucket** (Section 3 policy gap) against each app's REAL emitted op set: if the real ops are read-only, SAFE is correct and the existing sensitive www-form entries (from the hand-authored corpus) become dead/duplicative; if any real op places a paid order, classify the real origin sensitive. The `classifyGate` fail-closed posture + the per-op `sideEffectClass` (already computed by the importer) drive this; the gate surfaces any gap as a build failure.
3. Let `classifyGate` run merge-time per batch (the importer already does this) -- it is the authoritative coverage check; every batch origin must classify denied/sensitive/safe before any write.

### 5.5 Replace-vs-augment: **AUGMENT (do NOT replace wholesale)**
Critical finding: **13 hand-authored apps have NO equivalent at the pinned SHA** and would be LOST by a wholesale replace: `amazon, etsy, eventbrite, grubhub, kayak, lyft, mastodon, opentable, shopify, stubhub, threads, ticketmaster, ubereats`. These include 12 payment/commerce apps + mastodon (social) that phases 38/39 deliberately screened sensitive. Meanwhile **77 real apps are net-new** breadth gain, and ~40 apps overlap-by-name but the REAL op sets DIFFER from the hand-authored ones (real airtable = 8 different ops vs hand-authored 5; real doordash is read-only vs the hand-authored payment slice).

**Recommended approach:**
- **Import the 117 real apps** (minus grafana/sqlpad, minus or remapping target.apply_promo_code) -> ~2,372 ops, replacing the 40 overlapping hand-authored slices' descriptors with the REAL op sets (the real sets are the source of truth and richer/more-accurate).
- **PRESERVE the 13 hand-authored-only apps** as-is (they have no real upstream at this SHA). They keep their existing descriptors + classifications. Document them as "hand-authored, no upstream@SHA" in provenance.
- Net corpus: ~117 real + 13 hand-only = ~130 apps, ~2,400+ descriptors -- true OpenTabs parity PLUS the curated payment-app coverage the hand corpus added.
- The `EXISTING_HEAD_SERVICES` skip (github.com/app.slack.com/www.notion.so) still applies -- those head descriptors are not clobbered (real github/slack/notion are enumerated but skipped by service).

### 5.6 Importer changes required (all small/mechanical)
1. `STEM_OVERRIDES`: add ~40 entries (Blocker A) + a CI no-collision assertion.
2. Forbidden-field carve for `target.apply_promo_code` OR skip it (Blocker B).
3. Skip `grafana`/`sqlpad` (Blocker C) or synthesize origins.
4. `service-denylist.json`: classify `linkedin.com` + `youtube.com`; reconcile commerce SAFE bucket (Section 3/5.4).
5. Vendor the 117 real plugin dirs (Section 5.1); update `vendor/opentabs-snapshot/_provenance.json` + PIN.
6. (Scale) add the `< 2 MB index` / `< 100 ms` cold-start assertions to the eval harness (Section 4).
NO change to the load/transpile/extract/`z.toJSONSchema`/pre-scan/side-effect path -- those work on the real source unchanged.

---

## TOP RISKS (ranked)

1. **Stem collisions (Blocker A) silently clobber descriptors** if the `STEM_OVERRIDES` map isn't fully extended -- 6 collision groups (notably 4-way `console`) overwrite each other's `opentabs__console__*.json`. Mitigation: complete the override map + a CI no-duplicate-stem gate. *(HIGH -- data-correctness; mechanical fix.)*
2. **Commerce/travel sensitivity reconciliation** -- the REAL doordash/booking/walmart/etc. ops are largely read-only at this SHA, so they bucket SAFE, but the hand-authored corpus classified these brands SENSITIVE. Mis-reconciling could either over-restrict (friction on benign reads) or, if a real op DOES move money and is missed, ship a payment op writable-under-Auto. Mitigation: per-app op-set review driven by the per-op `sideEffectClass` + fail-closed gate. *(HIGH -- security/UX; review-heavy, not mechanical.)*
3. **Index scale ~1.31 MB approaches the 1-2 MB cold-start ceiling** at 2,374 ops. Mitigation: measure real serialized index on the full corpus + assert `< 2 MB`/`< 100 ms`; trim `storeFields`/synonyms or shard if it overshoots. *(MEDIUM -- perf; measurable, has levers.)*
4. **Replace-vs-augment dropping 13 hand-only apps** (amazon/shopify/lyft/ubereats/threads/mastodon/etc.) if someone does a wholesale vendor swap. Mitigation: AUGMENT -- preserve the 13 hand-only slices; only the 40 overlapping apps get their descriptors regenerated from real source. *(MEDIUM -- coverage regression; avoided by the documented augment plan.)*
5. **`target.apply_promo_code` forbidden-field abort + grafana/sqlpad empty-origin throw** halt their app/batch import if unhandled. Mitigation: the 1 forbidden carve/skip + skip the 2 self-hosted apps (3 ops/2 apps total). *(LOW -- enumerated; trivial fix.)*

---

## Appendix -- Evidence

- Full 117-app dry-run result: 117/117 import OK, 0 schema throws, 0 $ref/$defs in inputs, 1 forbidden-in-input (`target.apply_promo_code`), 2 empty-urlPatterns (grafana, sqlpad), 2,374 ops (1,669 read / 534 write / 171 destructive), 0 extra deps.
- Origin screen: 114 distinct origins; 10 denied + 19 sensitive + 86 safe already classified; 2 gate failures (linkedin.com, youtube.com).
- Stem analysis: 40/117 apps derive wrong/colliding stems; 6 collision groups.
- Scale: 579.9 B/entry serialized index -> ~1.31 MB @ 2,374; 288 B/op params -> ~683 KB.
- Set diff: 13 hand-authored apps absent at SHA; 77 real apps net-new; 117 real total (119 dirs - 2 CI fixtures).
- Sample proof descriptors captured for airtable.update_cell / github.create_issue / github.merge_pull_request / linear.archive_issue / discord.send_message (all clean closed-params, correct side-effect class).
- `git status` clean after spike; all scratch in `/tmp/opentabs-spike/` (removed).
