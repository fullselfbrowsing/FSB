---
phase: 36-codegen-pipeline-no-dead-entry-resolution
reviewed: 2026-06-24T17:42:41Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - scripts/import-opentabs-catalog.mjs
  - scripts/verify-catalog-crosscheck.mjs
  - extension/utils/capability-catalog.js
  - package.json
  - vendor/opentabs-snapshot/plugins/todoist/package.json
  - vendor/opentabs-snapshot/plugins/todoist/src/index.ts
  - vendor/opentabs-snapshot/plugins/todoist/src/sdk-stub.ts
  - vendor/opentabs-snapshot/plugins/todoist/src/todoist-api.ts
  - vendor/opentabs-snapshot/plugins/todoist/src/tools/schemas.ts
  - vendor/opentabs-snapshot/plugins/todoist/src/tools/create-task.ts
  - vendor/opentabs-snapshot/plugins/todoist/src/tools/update-task.ts
  - vendor/opentabs-snapshot/plugins/todoist/src/tools/delete-task.ts
  - vendor/opentabs-snapshot/plugins/todoist/src/tools/close-task.ts
  - vendor/opentabs-snapshot/plugins/todoist/src/tools/reopen-task.ts
  - vendor/opentabs-snapshot/plugins/todoist/src/tools/list-tasks.ts
  - vendor/opentabs-snapshot/plugins/todoist/src/tools/get-task.ts
  - catalog/descriptors/opentabs__todoist__*.json
  - extension/catalog/recipe-index.generated.js
findings:
  blocker: 0
  high: 2
  medium: 3
  low: 4
  total: 9
status: issues_found
fix_status:
  fixed_at: 2026-06-24T20:30:00Z
  high: { HI-01: resolved, HI-02: resolved }
  medium: { MED-01: resolved, MED-02: resolved, MED-03: skipped }
  low: { LO-01: open, LO-02: resolved-incidentally, LO-03: out-of-scope, LO-04: open }
  commits:
    - 3cf40e50  # fix(36): HI-02/HI-01 unify side-effect derivation into one shared module
    - 499a329f  # test(36): HI-01/HI-02 adversarial assertions for the strengthened gate
---

# Phase 36: Codegen Pipeline + No-Dead-Entry Resolution -- Code Review Report

> **FIX STATUS (2026-06-24):** The two HIGH findings and two of the three MEDIUMs
> are RESOLVED. The side-effect derivation (verb-map + GraphQL/RPC carve-out +
> override table + fail-safe-high floor) is now a SINGLE shared module
> `scripts/lib/side-effect-class.mjs` imported by BOTH the importer and the
> cross-check gate, so they can never diverge. Per-finding detail in each section
> heading below; commits `3cf40e50` (impl) + `499a329f` (tests).
>
> - **HI-01 RESOLVED** -- the fail-safe-high floor in the shared `deriveClass` now
>   derives at least `write` for a generic mutating-capable api/apiVoid transport
>   with no usable signal; the 3 adversarial under-stated mutations are caught
>   (was 0 of 3, now 3 of 3 -- asserted as cases (f) in catalog-crosscheck.test).
> - **HI-02 RESOLVED** -- verb sets aligned (void/cancel/archive -> destructive
>   consistently on both sides); `verbPrefix` is camelCase-aware (voidInvoice ->
>   void), so the GraphQL camelCase verb signal is live and a camelCase destructive
>   op outside the override table (purgeRepository/dropDatabase) classes destructive
>   (case (g)). The two implementations are now one module -> no divergence.
> - **MED-01 RESOLVED** -- `deriveClass` feeds the REAL op-name (via `opNameFromSlug`)
>   to `overrideFloor`, so the first-argument override path is live.
> - **MED-02 RESOLVED** -- `helperClass` recognizes `apiVoid` as a mutating transport
>   (upstream default POST); the helper name alone now floors it to write.
> - **MED-03 SKIPPED** -- synonym-generator collision/grammar hardening is explicitly
>   a pre-Phase-37 item in the finding itself (the smoke eval passes today); fixing
>   it expands scope into the synonym generator + new asana/linear fixtures + an eval
>   re-tune. Deferred to Phase 37 breadth prep as the finding recommends.
> - **LO-02** is incidentally resolved (the dead `query`/`mutate` `GRAPHQL_HELPERS`
>   Set no longer exists -- the importer uses the shared regex-based carve-out).
>   LO-01/LO-04 left open (cosmetic; out of this fix's scope); LO-03 is out of
>   Phase-36 scope (package metadata reconciliation).
>
> Verification (all green): `verify-catalog-crosscheck.mjs` exit 0 on the real
> 7-descriptor todoist corpus + non-zero on under-stated fixtures;
> catalog-crosscheck.test 18/18; import-extraction 12/12; import-classify-gate-call
> 6/6; no-dead-entry 9/9; capability-search-eval 15/15; recipe-path-guard 20 clean;
> `npm run validate:extension` exit 0. The real corpus re-derives byte-identical
> (importer rerun under tsx produced no descriptor diff) -- the gate was strengthened
> without weakening, and no real todoist descriptor was mis-stamped.

**Reviewed:** 2026-06-24T17:42:41Z
**Depth:** deep (cross-file + empirical: ran the importer under tsx, ran all gates, exercised the derivation surface with adversarial fixtures)
**Files Reviewed:** 18
**Status:** issues_found

## Summary

The Phase 36 load-bearing machinery is **substantially correct and the four headline guarantees hold for the shipped Phase-36 corpus**:

- **Wall 1 holds at the shipped boundary.** No `zod`/`@opentabs-dev/plugin-sdk`/`opentabs` runtime leaks into `extension/` (verified by grep; the only "zod" hits are tokenizer-vocabulary substrings in `gpt-tokenizer.min.js` and a `.map` artifact). `zod`/`tsx`/`@opentabs-dev/plugin-sdk` are all in `devDependencies` (NOT `dependencies`); `jiti` (the slopcheck `[SUS]` typosquat) is absent. The importer and cross-check gate are `scripts/*.mjs`, never `importScripts`'d. `verify-recipe-path-guard.mjs` stays **green** (20 files clean). The vendored todoist snapshot imports `defineTool`/`OpenTabsPlugin` and `api`/`apiVoid` from local inert stubs, so `await import()` never drags the real SDK's DOM/fetch surface into node, and the stub transport helpers throw if ever executed.
- **The forbidden-field pre-scan genuinely recurses ALL depths.** Empirically confirmed it catches `code`/`fn`/`js`/`script`/`expr` nested in `z.record` value-schemas, in `additionalProperties` schemas, in `$defs`, in array `items`, and under a property literally named `properties` -- while correctly NOT flagging forbidden strings that appear only as enum *values* (data, not field names).
- **The `resolve()` fallback is EXACTLY the single branch** returning `{tier: desc.backing==='learn'?'T2':'T3', descriptor}`, with zero router edits. The literals match the router's `case 'T2'`/`case 'T3'`; the genuinely-unknown path still returns `null` -> correct `RECIPE_NOT_FOUND`. Ordering vs the session-quarantine and learned-store checks is sound. `z.toJSONSchema` correctly throws (fail-loud) on `.transform()`.
- **The side-effect cross-check FAILS the build on under-statement** (exit 1) and is chained into `validate:extension`. For the actual todoist corpus the importer-stamped class and the gate-re-derived class agree on all 7 ops; the destructive-op acceptance tests pass.
- **classifyGate runs before any write** (no partial emit on failure); an unclassified finance-sensitive origin trips the heuristic and aborts.

Two HIGH findings concern the **robustness of the side-effect derivation as a general gate** (the gate is weaker than its own stated guarantee for a specific signal combination, and the importer/gate are two divergent implementations that can disagree). These do **not** manifest in the Phase-36 todoist smoke corpus, but the gate's entire reason to exist is to catch *drift and hand-edits* in Phases 37-39, and that is exactly where the gaps bite. Neither is a live exploit today; both are latent correctness/security-robustness defects that should be closed before breadth import lands.

No structural-findings substrate was provided with this review; all findings below are narrative (direct code review).

## Narrative Findings (AI reviewer)

### HIGH

#### HI-01: Cross-check gate derives `read` for an `api`-helper / no-method / unknown-verb op -- an under-stated mutation slips the gate (the headline false-negative)

> **[RESOLVED -- 3cf40e50 + 499a329f]** The shared `deriveClass`
> (`scripts/lib/side-effect-class.mjs`) now applies a fail-safe-high FLOOR: when the
> transport is a generic mutating-capable api/apiVoid helper and NO usable signal
> fired (no helper class, no method class, no recognized verb), the class is floored
> to `write`. The 3 adversarial under-stated mutations (process/submit/execute) now
> FAIL the gate (was 0 of 3, now 3 of 3 -- catalog-crosscheck.test cases (f)). The
> GraphQL/RPC carve-out composes ahead of the floor (POST never auto-read).

**File:** `scripts/verify-catalog-crosscheck.mjs:206-242` (`deriveClass`), `:84-110` (`verbClass`)

**Issue:** The gate's stated contract (its own header, lines 8-20) is to be the import-time catch that "FAILS THE BUILD when a descriptor's DECLARED class is LOWER than the derived class." But when the persisted signals are `{transportHelper:'api', httpMethod:null, opNameVerb:<unrecognized>}`, every signal returns null/floor and `deriveClass` returns the **`read` floor**. A descriptor declaring `read` for such an op therefore **PASSES**. Proven adversarially:

```
crossCheck([
  {slug:'evil.process_payment', sideEffectClass:'read', provenance:{signals:{transportHelper:'api', httpMethod:null, opNameVerb:'process'}}},
  {slug:'evil.submit_order',    sideEffectClass:'read', provenance:{signals:{transportHelper:'api', httpMethod:null, opNameVerb:'submit'}}},
  {slug:'evil.execute_trade',   sideEffectClass:'read', provenance:{signals:{transportHelper:'api', httpMethod:null, opNameVerb:'execute'}}},
])
=> failures: []   // gate caught 0 of 3 under-stated mutations
```

`verbClass` returns `null` (not a fail-safe `write`) for any verb outside its fixed sets (`process`, `submit`, `execute`, `confirm`, `trigger`, `run`, `sync`, ...), and `helperClass('api')` returns `null` (generic `api` carries no verb), and `methodClass(null)` returns `null`. With all three null, the `read` floor survives. This is the *exact dangerous direction* the gate exists to stop (a writable op classed `read` runs ungated under the shipped opt-out Auto default).

**Mitigations that make this latent, not live, TODAY:** (a) the *importer* never emits this shape -- for a recognized helper it always persists a non-null method (`extractTransportSignals` lines 255-268 default `api`->GET, `apiVoid`->POST, etc.), and for an *unrecognized* helper it sets `transportHelper:null` and falls to `classFromVerb`, which fails-safe to **`write`** for unknown verbs; (b) the runtime backstop `_deriveSideEffectClass` (capability-router.js:303) promotes POST->mutating at invoke. So the gate's hole is only reachable by a **hand-edited or differently-generated** descriptor -- which is precisely the drift class the gate advertises it catches.

**Fix:** Make the gate's unknown-verb path fail-safe-high to match the importer, OR (better) make the *absence of any usable signal* itself a derivation of `write` when the helper is a generic `api`/`apiVoid` (a mutating-capable transport) rather than `read`:

```js
// in deriveClass, after computing hCls/mCls/nameVerbCls for the non-graphql branch:
if (!hCls && !mCls && !nameVerbCls) {
  // No usable signal. A generic mutating-capable transport (api/apiVoid) with an
  // unrecognized verb MUST NOT float at the read floor -- fail-safe-high to write.
  const h = String(transportHelper || '').toLowerCase();
  if (/^api/.test(h)) derived = maxClass(derived, 'write');
}
```

Also add an acceptance row to `tests/catalog-crosscheck.test.js`: a `{transportHelper:'api', httpMethod:null, opNameVerb:'process'}` declared `read` MUST fail.

---

#### HI-02: Side-effect inference is implemented TWICE with divergent verb sets (`void`/`cancel` and camelCase) -- the gate cannot independently catch what the importer mis-stamps

> **[RESOLVED -- 3cf40e50 + 499a329f]** The verb sets, lattice MAX, helper/method/verb
> classifiers, GraphQL/RPC carve-out, override table, AND fail-safe-high floor are
> hoisted into ONE module `scripts/lib/side-effect-class.mjs` imported by BOTH the
> importer and the gate -- divergence is now impossible. Verb policy aligned:
> void/cancel/archive are destructive CONSISTENTLY on both sides (the importer's
> DESTRUCTIVE_VERBS and the gate's WRITE_VERBS no longer disagree). `verbPrefix` is
> camelCase-aware (`voidInvoice` -> `void`, `archiveIssue` -> `archive`,
> `getCurrentUser` -> `get`) via `^[A-Za-z][a-z]*`, so the GraphQL camelCase verb
> signal is live and a camelCase destructive op NOT in the override table
> (`purgeRepository`, `dropDatabase`) classes destructive (catalog-crosscheck.test
> case (g)). The verb is also recovered from the slug when the persisted token is
> absent. The real todoist corpus re-derives byte-identical.

**File:** `scripts/import-opentabs-catalog.mjs:150-169` (importer verb sets) vs `scripts/verify-catalog-crosscheck.mjs:84-110` (gate verb sets); `scripts/import-opentabs-catalog.mjs:157-161` (`verbPrefix`)

**Issue:** The importer and the cross-check gate each carry their **own** copy of the verb-map, and the two copies disagree:

| verb | importer `classFromVerb` | gate `verbClass` |
|------|--------------------------|------------------|
| `void` | **destructive** (DESTRUCTIVE_VERBS) | **write** (WRITE_VERBS) |
| `cancel` | **destructive** | **write** |

Proven:
```
importer cancel_order (graphql) -> destructive ;  gate cancel_order (graphql) -> write
importer void_payment (graphql) -> destructive ;  gate void_payment (graphql) -> write
```

Because the gate re-derives from the **same persisted signals** the importer stamped, the gate is a *check-against-itself*, not an independent oracle: if the importer stamps a class, the gate re-derives from identical inputs. The two only function as a genuine cross-check when a descriptor is hand-authored or generated differently. In that scenario the gate's *weaker* `void`/`cancel`->write map means a hand-authored `void_*`/`cancel_*` op declared `write` (not destructive) **passes** the gate, even though FSB's own importer considers that family destructive. The override table (`void_invoice`, `cancel_subscription`, ...) only floors the *specific listed* op-names, not the general `void`/`cancel` family.

Secondarily, `verbPrefix` (importer line 157-161, regex `^([a-zA-Z]+)`) does **not** split camelCase: `verbPrefix('archiveIssue')` returns `'archiveissue'`, `verbPrefix('getCurrentUser')` returns `'getcurrentuser'`. The research explicitly names linear/github GraphQL ops (camelCase) as the motivating case for Phases 37-39. Today every camelCase op falls through every verb set to the importer's `write` default (safe over-statement of GraphQL *reads* as write; the gate also can't parse them so they agree) -- but it means the verb signal is silently dead for the entire GraphQL camelCase surface, leaving only the (always-POST, uninformative) method + the override table. A camelCase destructive op not in the override table (e.g. `purgeRepository`, `dropDatabase`) would be classed merely `write`, not `destructive`.

**Fix:** (1) Hoist the verb sets, `maxClass`, `classFromMethod`/`methodClass`, and the override table into ONE shared module that BOTH the importer and the gate import, so divergence is impossible. Align `void`/`cancel`: pick one policy (the research treats the override table as the destructive floor for POSTs and `void`/`cancel` as write verbs -- so the *importer* is the one diverging from the plan; reconcile the importer's `DESTRUCTIVE_VERBS` to drop `void`/`cancel` and rely on the override table, OR add `void`/`cancel` to the gate's destructive set). (2) Make `verbPrefix` camelCase-aware so GraphQL ops yield a real verb:
```js
export function verbPrefix(opName) {
  const s = String(opName || '');
  // snake_case OR camelCase: take the leading token before '_' or the first inner capital.
  const m = s.match(/^([a-z]+)(?=[_A-Z]|$)/i);
  return m ? m[1].toLowerCase() : '';
}
```

---

### MEDIUM

#### MED-01: Gate override lookup passes the verb prefix where an op-name is expected -- the first-argument override path is dead code

> **[RESOLVED -- 3cf40e50]** The shared `deriveClass` derives the REAL op-name from
> the slug (`opNameFromSlug`) and passes THAT (not the bare verb prefix) as arg 1 to
> `overrideFloor`, so the first-argument override path is now live:
> `overrideFloor('void_invoice', undefined)` -> destructive.

**File:** `scripts/verify-catalog-crosscheck.mjs:238` (call) and `:174-189` (`overrideFloor`)

**Issue:** `deriveClass` calls `overrideFloor(opNameVerb, slug)`. `overrideFloor`'s first parameter is named `opName` and is matched against `SIDE_EFFECT_OVERRIDES` keys like `void_invoice`, `delete_customer` (full op-names). But the caller passes `opNameVerb` -- the **verb prefix only** (`void`, `delete`). No override key is a bare verb, so the first-argument (`name`) branch (lines 175-178) can never match for any real override entry. Proven:
```
deriveClass({...opNameVerb:'void'}, 'stripe.void_invoice') -> destructive   // works, but ONLY via the slug-suffix branch (arg 2)
deriveClass({...opNameVerb:'void'}, undefined)            -> write          // arg-1 override path does NOT fire -> floor not applied
```
The override only works because the slug-suffix branch (lines 179-188) saves it. When a descriptor lacks a slug (or the slug doesn't end in the override key), the override is silently skipped. The CLI always supplies a slug, so the committed corpus is unaffected -- but the function has a permanently-dead branch and a latent gap when called with signals-only.

**Fix:** Either pass the real op-name (derive it from the slug: `slug.split('.').pop()` / `slug.split('__').pop()`) as arg 1, or delete the dead first-argument branch and document that override resolution is slug-keyed. Add a test that `deriveClass(signalsOnly, undefined)` for a `void`-verb still floors via... (it can't, by design -- which is the bug to surface).

---

#### MED-02: `apiVoid` helper is invisible to the gate's `helperClass` -- defense-in-depth relies entirely on the persisted method literal

> **[RESOLVED -- 3cf40e50]** The shared `helperClass` now matches `apiVoid`
> (`if (/api[_-]?void/.test(h)) return 'write';`, placed BEFORE the get check) and
> treats it as a mutating transport (its upstream default is POST). The helper name
> alone now floors `apiVoid` to write even when the persisted httpMethod is absent --
> restoring defense-in-depth and compounding the HI-01 floor.

**File:** `scripts/verify-catalog-crosscheck.mjs:130-139` (`helperClass`)

**Issue:** `helperClass` matches `/api[_-]?delete/`, `/api[_-]?(post|put|patch)/`, `/api[_-]?get/`. The string `apivoid` (the importer's lowercased persisted form for todoist's `apiVoid` helper) matches **none** of them, so `helperClass('apivoid')` returns `null`. For `close_task`/`reopen_task`/`delete_task` the gate therefore leans solely on the persisted `httpMethod` (POST/DELETE) + the verb. This works today only because `extractTransportSignals` always persists `apiVoid`->POST (default) or the DELETE literal. If a future descriptor persisted `transportHelper:'apiVoid'` with `httpMethod:null`, the helper signal would be lost and a `close`-family op (verb in WRITE_VERBS -> write, OK) would survive, but an *unrecognized*-verb apiVoid op would fall to the `read` floor (compounding HI-01). The importer's own `apiVoid` default-POST mapping (lines 261-267) is not mirrored as a *helper-class* signal in the gate.

**Fix:** Teach `helperClass` that `apiVoid` is a mutating transport (its upstream default is POST, never GET): `if (/api[_-]?void/.test(h)) return 'write';` placed before the get check. This restores defense-in-depth so the helper alone floors apiVoid to write even with a missing method.

---

#### MED-03: `synthSynonyms` cross-app collision pressure + grammatically-broken phrases may erode recall@5 / wrong-invoke at breadth

> **[SKIPPED -- deferred to Phase 37 breadth prep]** The finding itself states this is
> "Not blocking for Phase 36 (the smoke eval passes)" and prescribes the fix "Before
> breadth (Phase 37)". Applying it would expand scope beyond the side-effect gate
> hardening this fix targets: it touches the `synthSynonyms` generator, requires
> adding asana/linear near-neighbors to `_fixtures/seed-descriptors.json`, and an
> eval re-tune to keep `wrong-invoke == 0` honest as the corpus grows. The smoke
> eval (capability-search-eval) remains 15/15 green. Tracked for Phase 37.

**File:** `scripts/import-opentabs-catalog.mjs:280-304`

**Issue:** The synonym synthesis is heuristic and produces phrases like `"list a tasks"` (from `list_tasks` via the `${parts[0]} a ${noun}` rule -- see `catalog/descriptors/opentabs__todoist__list_tasks.json:8`). More consequentially, the verb+noun phrases (`"create a task"`, `"create task in <service>"`) are **identical across apps** -- todoist `create_task`, asana `create_task`, linear `create_issue` will generate near-identical synonym sets. The research's own SURF eval flags `wrong-invoke === 0` as the gate and names cross-app `create_task` as the pressure test. At the 7-op todoist smoke scale the eval passes (recall@5 >= 0.9, wrong-invoke == 0 verified), but the generator has no app-disambiguating token weighting; this is the exact mechanism that will degrade as Phases 37-39 add asana/clickup/linear siblings.

**Fix:** Not blocking for Phase 36 (the smoke eval passes). Before breadth (Phase 37): (a) drop the `${parts[0]} a ${noun}` form when `noun` is plural (`tasks` -> "list a tasks" is wrong); (b) ensure every synthesized phrase carries the service stem so the index can disambiguate; (c) add an asana/linear near-neighbor to `_fixtures/seed-descriptors.json` now to keep the wrong-invoke pressure test honest as the corpus grows.

---

### LOW

#### LO-01: `runImport` double-loads the denylist and bypasses the `gateItems` wrapper

**File:** `scripts/import-opentabs-catalog.mjs:391` and `:415` (and `:327-330` `gateItems`)

**Issue:** `runImport` calls `await Denylist.load()` at line 391, then `extractDescriptors` does not gate, then line 415 calls `classifyGate(gateItemsList)` directly -- duplicating the load/gate logic that the exported `gateItems(items)` helper (lines 327-330) already encapsulates. Two code paths now express "load then gate," so a future change to the gating contract must be made in two places. Harmless today (both load first), but it is the same divergence-risk as HI-02 in miniature.

**Fix:** Have `runImport` call the exported `gateItems(gateItemsList)` so there is a single gate-before-emit implementation.

---

#### LO-02: Importer's `inferSideEffect` GraphQL set carries dead members (`query`, `mutate`) that `extractTransportSignals` can never produce

> **[RESOLVED INCIDENTALLY -- 3cf40e50]** The importer's `GRAPHQL_HELPERS` Set no
> longer exists: `inferSideEffect` now derives via the shared `deriveClass`, whose
> GraphQL/RPC detection is the single regex-based `isGraphqlTransport` (the HI-02
> consolidation). The two divergent carve-out detectors are now one. (`mutate` is
> covered by the shared `GRAPHQL_TRANSPORT_RE`; `query` is a READ verb and needs no
> transport-level carve-out.)

**File:** `scripts/import-opentabs-catalog.mjs:194` (`GRAPHQL_HELPERS`) vs `:248` (the extraction regex)

**Issue:** `GRAPHQL_HELPERS = {graphql, gql, gqlrequest, query, mutate}`, but `extractTransportSignals`'s helper regex only captures `(apiGet|apiPost|apiPut|apiPatch|apiDelete|apiVoid|graphql|gql|gqlRequest|api)`. `query` and `mutate` can never appear as a `transportHelper`, so those set members are unreachable in the importer pipeline. (The gate's `GRAPHQL_TRANSPORT_RE` is regex-based and broader, so the two carve-out detectors also differ -- another facet of HI-02.) Cosmetic dead code; flagged for accuracy.

**Fix:** Either extend the extraction regex to capture `query`/`mutate` call sites or trim the set to the helpers extraction can actually emit. Prefer consolidating with the gate's detector (HI-02 fix).

---

#### LO-03: `package.json` version/license/badge metadata is internally inconsistent (pre-existing, surfaced by this phase's audit)

**File:** `package.json:3` (`"version": "0.9.90"`), `:71` (`"license": "BUSL-1.1"`), `:133` (badge `license-MIT`), `:24` (`package` script hardcodes `fsb-v0.9.90.zip`)

**Issue:** The package declares `version: 0.9.90` while the milestone/requirements target v1.0.0; the SPDX `license` is `BUSL-1.1` but the README badge advertises `license-MIT`; the `package` zip name is hardcoded to the version string (drifts silently on bump). None is a Phase-36 regression, but the OpenTabs descriptors this phase vendors are stamped `license: 'MIT'` in-descriptor while the package is BUSL-1.1, so the license story now spans two values and deserves a deliberate note. Not a code defect.

**Fix:** Out of Phase-36 scope; recommend a metadata-reconciliation pass (align the SPDX license with the badge, parameterize the zip name) tracked separately.

---

#### LO-04: Comment in `capability-catalog.js` resolve() asserts a Phase-42 contract that the code does not yet enforce

**File:** `extension/utils/capability-catalog.js:344-346`

**Issue:** The comment states "Phase-36 smoke descriptors are all backing:'dom' -> T3; a backing:'learn' descriptor exercises the T2 leg." This is accurate for the committed corpus, but the branch `(desc.backing === 'learn') ? 'T2' : 'T3'` treats *any* non-`'learn'` value (including a typo like `'learned'`, `'Learn'`, or a malformed non-string) as T3. There is no validation that `backing` is one of the known enum values, so a future mis-stamped `backing:'leaen'` silently becomes a T3 (DOM) seam rather than the intended T2 (learn-pending). Behaviorally safe (defaults to the more-conservative DOM seam, never executes), but the comment implies an enum contract the code does not assert.

**Fix:** Optional hardening -- normalize/validate the backing value at import time (the importer already only ever writes `'dom'`), and/or make the resolve branch explicit: `desc.backing === 'learn' ? 'T2' : 'T3'  // any non-'learn' (incl. malformed) -> DOM seam, the safe default`.

---

## Verification Evidence (what was run)

- `node scripts/verify-catalog-crosscheck.mjs` -> PASS, exit 0 (7 descriptors with signals).
- `node scripts/verify-recipe-path-guard.mjs` -> PASS, exit 0 (20 recipe-path files clean; capability-catalog.js on the allowlist and green after the resolve edit).
- `node tests/no-dead-entry.test.js` -> 9 passed (every smoke slug -> non-null seam tier; out-of-corpus -> null).
- `node tests/catalog-crosscheck.test.js` -> 10 passed (void_invoice/archiveIssue under-statement FAILS; GraphQL read PASSES; delete_customer PASSES).
- `node tests/import-extraction.test.js` (12), `import-forbidden-prescan.test.js` (12), `import-classify-gate-call.test.js` (6), `catalog-inline-shape.test.js` (14), `head-handler-cap.test.js` (5), `capability-search-eval.test.js` (15) -> all PASS.
- Ran the importer end-to-end under `tsx`: all 7 todoist ops -- importer-stamped class == gate-re-derived class; crossCheck failures == 0.
- Forbidden-field pre-scan stress-tested against `z.record` value-schemas, `additionalProperties` schemas, `$defs`, array items, and a property literally named `properties` -> all caught; enum *values* correctly NOT flagged.
- Wall-1 boundary: `grep -rln "zod|plugin-sdk|opentabs-snapshot|defineTool" extension/` -> only benign tokenizer substrings + a `.map`; devDeps confirmed NOT in `dependencies`; `jiti` absent; importer never `importScripts`'d; `_fixtures/` excluded from the shipped snapshot.

---

_Reviewed: 2026-06-24T17:42:41Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
