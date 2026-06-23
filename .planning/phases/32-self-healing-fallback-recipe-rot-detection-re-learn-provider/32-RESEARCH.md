# Phase 32: Self-Healing Fallback + Recipe-Rot Detection + Re-Learn + Provider/Schema-Lock Tests + UAT - Research

**Researched:** 2026-06-23
**Domain:** MV3 Chrome-extension capability runtime — recipe-break taxonomy, autopilot-layer DOM fallback, recipe-rot detection, quarantine/re-learn, provider + schema-lock parity gates (all internal JS; no external packages)
**Confidence:** HIGH (every claim is a direct read of the codebase on `automation-worktree`; no external library research was required)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Self-Healing Fallback (HEAL-01, HEAL-04)**
- **D-01:** A NEW `classifyRecipeBroken(result, recipe)` runs AFTER `executeBoundSpec` in the router's declarative path and produces the failure taxonomy (HEAL-04): **recipe-broken** (4xx/5xx, empty-when-`extract`-expects-data, `expectedShape`-mismatch, or `RECIPE_EXPIRED`) → fallback; **legitimate no-results** (200 + valid shape + empty set) → return the REAL empty outcome (never mask); **logged-out** (302 → login redirect) → surface as-is, do NOT fallback. Only recipe-broken triggers the DOM fallback.
- **D-02:** The DOM fallback completes the task at the **AUTOPILOT layer**, reusing the EXISTING DOM tools — NO parallel stack (INV-02). The existing pre-`executeTool` capability guard (`tool-executor.js`), on a recipe-broken / `RECIPE_DOM_FALLBACK_PENDING` signal, escalates the SAME task to `run_task` / `click` / `type_text` / `get_site_guide` via the existing agent-loop tool dispatch (the `agent-loop.js:731` capability→DOM precedent). The `agent-loop.js` `setTimeout` iterator stays BYTE-UNTOUCHED (INV-04). The MCP front door surfaces the typed `RECIPE_EXPIRED` / `RECIPE_DOM_FALLBACK_PENDING` reason so an MCP host completes via its own DOM tools.
- **D-03:** The DOM fallback is normal DOM automation on the ACTIVE tab — the two-point origin-pin holds and the Phase-30 consent gate that already gated the invoke is inherited. The fallback is NOT a consent or origin-pin bypass.
- **D-04:** When the fallback completes, the capability path returns the COMPLETED task result with a typed `fellBackToDom: true` marker (recorded in the Phase-30 audit log). A legitimate no-results returns the REAL empty result (NOT a fallback), so a real outcome is never masked (HEAL-04).

**Recipe-Rot Detection (HEAL-02)**
- **D-05:** Recipes are stamped with `capturedAt` + an OPTIONAL `expectedShape` assertion (a JMESPath that must resolve non-empty, or a required-keys list, within the closed vocab); after the fetch, the response is validated against `expectedShape` → typed `RECIPE_EXPIRED` on mismatch (HEAL-02).
- **D-06:** `expectedShape` is CONSERVATIVE — assert only structural invariants (a key path resolves, the expected type), NEVER exact values. A too-strict assertion that false-positives is worse than a missed rot (the DOM fallback is the backstop); minimize false `RECIPE_EXPIRED`.
- **D-07:** `expectedShape` source: bundled recipes get a hand-authored conservative assertion (or none → time/status-based rot only); learned recipes (Phase 31) synthesize `expectedShape` from the captured response shape at synthesis time.
- **D-08:** Bump `FSB_RECIPE_SCHEMA_VERSION` 1 → 2, ADDITIVE — `capturedAt` + `expectedShape` are OPTIONAL so v1 recipes stay schema-valid; the `additionalProperties:false` closed-vocab posture is preserved. A NEW schema-lock test freezes the v2 `RECIPE_SCHEMA` hash (HEAL-05/INV-01).

**Quarantine + Re-Learn (HEAL-03)**
- **D-09:** Learned-recipe rot reuses Phase-31's `learned-recipe-store.quarantine()` (flag-not-delete; `getLearned`/`getLearnedSync` return null for a quarantined entry, demoting it from routing). Bundled-recipe rot uses a NEW in-memory `quarantinedBundledSlugs` set in `capability-catalog.js` (do NOT mutate the bundled catalog data) so a rotted bundled recipe is skipped by `resolve` until re-reviewed.
- **D-10:** Re-learn is OPPORTUNISTIC + consent-respecting — after a DOM fallback SUCCEEDS for a rotted recipe, trigger Phase-31's discovery (`FsbDiscoverySession.runDiscovery`) for that origin to re-learn the new endpoint, preserving the user-initiated/consent-gated posture (NOT silent auto-capture). Bundled rot is flagged for the maintainer (not auto-re-learned).
- **D-11:** A quarantined/demoted recipe is SKIPPED by `catalog.resolve` (the router falls through to the next tier / the DOM fallback); it outranks nothing while quarantined; a successful re-learn replaces it with the new learned recipe.
- **D-12:** Quarantine persistence: learned quarantine persists in the store (survives SW restart); bundled quarantine is SESSION/in-memory (re-evaluated next session — a transient site blip must NOT permanently demote a first-party bundled recipe).

**Provider/Schema-Lock Parity Gate + UAT (HEAL-05, INV-01/INV-03)**
- **D-13:** A NEW `tests/provider-parity.test.js` asserts the capability path AND the DOM-fallback path behave equivalently across ALL 7 `universal-provider.js` targets (`xai/openai/anthropic/gemini/lmstudio/openrouter/custom` — the existing `PROVIDER_KEYS`), reusing the existing provider test harness (INV-03).
- **D-14:** A NEW schema-lock test freezes the `RECIPE_SCHEMA` v2 hash AND re-asserts the frozen tool-definitions registry hash (the schema is the contract between bundled recipes, learned recipes, and the interpreter; fail the build on drift) (HEAL-05/INV-01).
- **D-15:** HEAL-05 is the v0.9.99 MILESTONE GATE — the full `npm test` (capability + fallback + 7-provider parity + schema-lock) green is the milestone completion criterion. The live self-healing on a real broken recipe is the `human_needed` UAT (Phase 27-31 posture).
- **D-16:** The self-healing code lives in a NEW eval-free, allowlisted `capability-rot-detector.js` (the `classifyRecipeBroken` classifier + the `RECIPE_EXPIRED` emission) + the T3 realization in `capability-router.js` (the T3 case delegates to the classifier; the autopilot guard handles the DOM escalation). `RECIPE_EXPIRED` (and any `RECIPE_LOGGED_OUT`) surface via the existing `/^RECIPE_.+$/` passthrough — NO `errors.ts` edit.

### Claude's Discretion
- The exact `classifyRecipeBroken` signature + the new `RECIPE_*` code names (`RECIPE_EXPIRED` + optionally `RECIPE_LOGGED_OUT`).
- The `expectedShape` representation (a JMESPath string vs a required-keys list) within the closed vocab.
- The schema-lock hash mechanism (SHA256 of the stably-serialized schema, mirroring `tool-definitions-parity`).
- Whether the rot detector is a separate `capability-rot-detector.js` module (recommended) or folded into the router; the precise autopilot-guard DOM-escalation point; the provider-parity test's stub strategy.

### Deferred Ideas (OUT OF SCOPE)
- Deeper rot heuristics (per-field drift scoring, partial-shape tolerance) beyond the conservative structural assertion.
- Fully-automatic silent re-learn on every `RECIPE_EXPIRED` (vs the opportunistic, consent-gated, post-fallback trigger).
- Persisted bundled-recipe quarantine (vs the session/in-memory demotion that re-evaluates next session).
- The live self-healing-on-a-real-broken-recipe end-to-end — `human_needed` UAT.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HEAL-01 | When a recipe breaks (4xx/5xx, empty, shape-mismatch, `RECIPE_EXPIRED`), FSB falls back to DOM automation and still completes the task. | The fallback is a **model-driven tool-selection decision**, not an inline iterator escalation. The router T3 case + a post-`executeBoundSpec` reclassification emit `RECIPE_DOM_FALLBACK_PENDING`; the autopilot front door (`executeCapabilityToolForAutopilot`, tool-executor.js:672) surfaces that typed reason in `makeResult.result`; the system-prompt hint (agent-loop.js:731) already instructs the model to fall back to DOM tools when a capability path does not complete. See **DOM-Fallback Completion Mechanism** below. Iterator stays byte-untouched (the iterator is the `setTimeout`-chained `runAgentIteration` at agent-loop.js:2027/2726/2795/2805, NOT line 731). |
| HEAL-02 | Recipes stamped with captured-at + an expected-shape assertion; responses validated → typed `RECIPE_EXPIRED`. | `expectedShape` reuses the SAME `jmespath.search()` engine the `extract` field already runs SW-side (`executeBoundSpec` capability-fetch.js:362-375 via `FsbCapabilityInterpreter.getFSBJmespath()`). Validation runs in the rot detector on the normalized success result `{success, status, data, ...}`. Schema bump v1→v2 adds optional `capturedAt` + `expectedShape` keys. See **expectedShape Representation + Validation**. |
| HEAL-03 | A broken recipe is quarantined/demoted, and re-learned where possible. | Learned: reuse `FsbLearnedRecipeStore.quarantine(slug, origin)` (learned-recipe-store.js:455 — persists + flips the sync mirror so `getLearnedSync` returns null → demoted from `resolve`). Bundled: NEW in-memory `quarantinedBundledSlugs` Set in capability-catalog.js consulted by `resolve`. Re-learn: `FsbDiscoverySession.runDiscovery(origin, {tabId})` (discovery-session.js:128) post-fallback. See **Quarantine + Re-Learn Wiring**. |
| HEAL-04 | A failure-detection taxonomy distinguishes "recipe broken" from a legitimate "no results" so fallback never masks a real outcome. | The `classifyRecipeBroken` decision table keys off the `executeBoundSpec` result shape: 4xx/5xx via `status`; logged-out via `redirected:true`/302 (capability-fetch.js:189 `redirect:'manual'` keeps it observable); empty-vs-no-results via `extract`-expected-data + `expectedShape`. See **classifyRecipeBroken Taxonomy**. |
| HEAL-05 | Capability + fallback paths pass across all 7 providers (INV-03) and a schema-lock parity test (INV-01). | `provider-parity.test.js` reuses `PROVIDER_KEYS` (7) + `formatToolsForProvider`/`getPublicTools`/`formattedToolNames` from tool-definitions-parity.test.js. `recipe-schema-lock.test.js` clones the `registryHash` SHA256-over-`stable()` idiom (tool-definitions-parity.test.js:54-69) to freeze the v2 `RECIPE_SCHEMA` hash AND re-assert the frozen tool registry hash. This is the milestone gate (full `npm test`). See **Provider Parity + Schema-Lock**. |
</phase_requirements>

## Summary

Phase 32 is the milestone-closing self-healing layer. The deepest finding — and the one that resolves the riskiest unknown (HEAL-01) — is that **the DOM fallback is already architecturally present; this phase only makes it fire on the right signal.** The "capability→DOM precedence" at `agent-loop.js:731` is **not** code — it is a line inside `buildSystemPrompt()` that instructs the model: *"Prefer [capability tools] over DOM tools for first-party authenticated actions … fall back to the DOM tools (click, type_text, read_page, etc.) when no capability matches."* The agent loop's iterator (the load-bearing `setTimeout`-chained `runAgentIteration` at lines 2027/2726/2795/2805) is a completely separate construct. Therefore the fallback completion is a **model-driven tool-selection decision** that happens on the NEXT iteration after the model sees a typed `RECIPE_DOM_FALLBACK_PENDING` / `RECIPE_EXPIRED` result returned by `invoke_capability`. No inline escalation, no parallel stack, no iterator edit — INV-02 and INV-04 hold by construction. The work is: (1) make the router emit that typed reason on a recipe-broken outcome (today the T3 case already returns `RECIPE_DOM_FALLBACK_PENDING`; this phase ALSO emits it after a T1a/T1b/T2 `executeBoundSpec` that `classifyRecipeBroken` deems broken), and (2) strengthen the system-prompt hint so the model reliably escalates the SAME task to DOM on that reason.

The rot-detection half (HEAL-02/04) is a pure classifier reading the already-normalized `executeBoundSpec` result. The fetch primitive already preserves every signal the taxonomy needs: HTTP `status`, `redirected` (302→login is kept observable because `capabilityFetchInPage` uses `redirect:'manual'`, capability-fetch.js:177/189), and `data` (post-`extract`). `expectedShape` reuses the identical `jmespath.search()` engine that the `extract` field already executes SW-side. The schema bump is additive (optional `capturedAt` + `expectedShape`), preserving `additionalProperties:false`. Quarantine reuses Phase-31's learned-store `quarantine()` verbatim and adds a session-only in-memory Set for bundled recipes. Re-learn is the existing `runDiscovery`. The two parity tests are direct clones of existing harnesses. **The phase introduces zero external packages** — it reuses already-vendored `jmespath`, `@cfworker/json-schema`, and Node's built-in `crypto`.

**Primary recommendation:** Build a NEW eval-free `extension/utils/capability-rot-detector.js` exporting `classifyRecipeBroken(result, recipe)` → `{ broken, code, reason }` and `validateExpectedShape(data, expectedShape)`; hook it into `capability-router.js` `_runDeclarativeTier` immediately after `executeBoundSpec` returns (~:401) and into `_runHandlerTier` (~:433); on a broken verdict, return the dual-field `RECIPE_DOM_FALLBACK_PENDING` (carrying the underlying `code`, e.g. `RECIPE_EXPIRED`) so both front doors surface it verbatim; add optional `capturedAt`+`expectedShape` to `RECIPE_SCHEMA` and bump to v2; add `quarantinedBundledSlugs` to the catalog; clone the two parity tests.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Recipe-break classification (taxonomy) | API/Backend (SW: `capability-rot-detector.js`) | — | Pure data classification over the `executeBoundSpec` result; no DOM, no network — belongs in the eval-free recipe-path layer (D-16). |
| `expectedShape` validation | API/Backend (SW: rot detector reusing `jmespath`) | — | Reuses the SW-side JMESPath engine that already runs `extract`; must NOT run in page scope (the engine is not in page realm — capability-fetch.js:130/362). |
| Emit `RECIPE_DOM_FALLBACK_PENDING` / `RECIPE_EXPIRED` | API/Backend (SW: `capability-router.js`) | — | The router is the single engine both front doors share (INV-02); the typed reason is its return contract (CAT-05). |
| Surface the typed reason to the model | Frontend Server (SW: `tool-executor.js` autopilot door) + MCP front door | — | `executeCapabilityToolForAutopilot` wraps the router result in `makeResult`; the MCP `handleCapabilitiesInvokeMessageRoute` returns it verbatim through the `/^RECIPE_.+$/` passthrough. |
| Decide + execute the DOM fallback (complete the SAME task) | **Model (the LLM)**, via the existing agent-loop tool dispatch | DOM tools (content-routed: `click`/`type_text`/`read_page`/`get_page_snapshot`/`get_site_guide`) | HEAL-01's core: completion is a model tool-selection decision on the next iteration, driven by the system-prompt hint (agent-loop.js:731) + the typed reason. NOT an inline code escalation (that would touch the iterator / build a parallel stack). |
| Quarantine a rotted recipe | API/Backend (SW: learned-store `quarantine()` + catalog `quarantinedBundledSlugs`) | chrome.storage.local (learned, persisted) | Learned reuses the Phase-31 persisted quarantine; bundled is session-only in-memory (D-12). |
| Opportunistic re-learn | API/Backend (SW: `FsbDiscoverySession.runDiscovery`) | CDP Network capture (consent-gated) | The existing consent-gated discovery session is the re-learn path (D-10); it self-enforces the Phase-30 consent gate inside `startSession`. |
| Provider + schema-lock parity gates | Test harness (Node, zero-framework) | — | INV-01/INV-03 are CI invariants; the tests clone existing frozen-hash + provider-format harnesses. |

## Standard Stack

### Core (all already in the tree — nothing new to install)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `jmespath` | (vendored at `extension/lib/jmespath.min.js`; npm dep present) [VERIFIED: package.json deps] | Evaluate `expectedShape` JMESPath against the response `data`, reusing `FsbCapabilityInterpreter.getFSBJmespath()` | The `extract` field already uses this exact engine SW-side (capability-fetch.js:362-375). `expectedShape` is the same kind of read-only path query — zero new dependency. |
| `@cfworker/json-schema` | (vendored at `extension/lib/cfworker-json-schema.min.js`; npm dep present) [VERIFIED: package.json deps] | Validate the v2 `RECIPE_SCHEMA` (now with optional `capturedAt`/`expectedShape`) | The schema is already validated by this validator (`getFSBRecipeValidator`, capability-recipe-schema.js:157). Additive fields = no validator change. |
| `crypto` (Node built-in) | Node stdlib [VERIFIED: tests/tool-definitions-parity.test.js:20] | `crypto.createHash('sha256')` for the schema-lock + tool-registry frozen hashes | The exact mechanism `registryHash()` uses (tool-definitions-parity.test.js:65-69). The schema-lock test clones it. |

### Supporting (existing SW modules reused, some modified)
| Module | Purpose | Phase-32 action |
|--------|---------|-----------------|
| `extension/utils/capability-router.js` | The single engine; T3 seam + `_runDeclarativeTier`/`_runHandlerTier` | MODIFIED: post-`executeBoundSpec` classify hook; realize T3; emit typed reason; skip quarantined |
| `extension/utils/capability-fetch.js` | `executeBoundSpec` normalized result the classifier inspects | UNMODIFIED (read-only consumer; the result shape already carries `status`/`redirected`/`data`) |
| `extension/utils/capability-recipe-schema.js` | `RECIPE_SCHEMA` + `FSB_RECIPE_SCHEMA_VERSION` | MODIFIED: add optional `capturedAt`+`expectedShape`; bump version 1→2 |
| `extension/utils/capability-interpreter.js` | Carries `extract`; exposes `getFSBJmespath()` | MODIFIED (minimal): carry `expectedShape`+`capturedAt` into the bound spec so the rot detector sees them post-fetch (mirror the `extract` carry at :480) |
| `extension/utils/learned-recipe-store.js` | `quarantine(slug, origin)` | REUSED (no change; the API already exists at :455) |
| `extension/utils/capability-catalog.js` | `resolve(slug, origin)` | MODIFIED: add `quarantinedBundledSlugs` Set + skip-in-`resolve` |
| `extension/utils/discovery-session.js` | `runDiscovery(origin, opts)` re-learn | REUSED (no change; called by the post-fallback re-learn trigger) |
| `extension/utils/recipe-synthesizer.js` | Synthesizes learned recipes | MODIFIED (D-07): emit a conservative `expectedShape` (likely `'@'`/`extract`-derived) + `capturedAt` on synthesis |
| `extension/ai/tool-executor.js` | `executeCapabilityToolForAutopilot` autopilot door | MODIFIED (light): ensure the typed reason + any `fellBackToDom` marker is surfaced in `makeResult` |
| `extension/ai/agent-loop.js` | `buildSystemPrompt` capability→DOM hint (:731) | MODIFIED (prompt text ONLY): strengthen the fall-back-to-DOM instruction for the recipe-broken reason. **Iterator UNTOUCHED (INV-04).** |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Model-driven DOM fallback (the typed-reason approach) | Inline code escalation that calls `executeTool('run_task', ...)` from inside the router/guard | REJECTED by D-02/INV-02/INV-04: an inline call from the SW router into `executeTool` would (a) build a parallel autopilot stack and (b) risk coupling to the iterator. The model-driven approach is what the existing `agent-loop.js:731` hint + the existing `RECIPE_DOM_FALLBACK_PENDING` T3 seam were designed for. |
| `expectedShape` as a JMESPath string | `expectedShape` as a required-keys list | Both are within the closed vocab. **Recommend JMESPath string** — it reuses the exact `extract` engine with zero new validation code, and a JMESPath like `data \|\| items \|\| @` that must resolve to a non-empty value is the most conservative "the response still has the shape we read from" assertion (D-06). A required-keys list needs a new walker. (Claude's discretion, D-05.) |
| Folding the classifier into the router | A separate `capability-rot-detector.js` | **Recommend the separate module** (D-16 recommended): it is auto-globbed onto the recipe-path CI guard (Check 4) and keeps the router's dispatch charter clean. |

**Installation:** None. No `npm install`. All dependencies are already vendored/declared.

**Version verification:** `package.json` deps confirmed via `node -e`: `@cfworker/json-schema, axios, jmespath, lattice, minisearch, @full-self-browsing/phantom-stream`. devDeps: `@full-self-browsing/lattice-cli, esbuild`. No new package is introduced by Phase 32.

## Package Legitimacy Audit

> Phase 32 installs **no external packages**. It reuses already-vendored `jmespath` + `@cfworker/json-schema` and Node's built-in `crypto`. The Package Legitimacy Gate is therefore N/A — there is nothing to slopcheck.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | No external packages introduced |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    invoke_capability(slug, args)
                         │
          ┌──────────────┴───────────────┐
          │   TWO FRONT DOORS (INV-02)    │
          │                               │
   MCP front door                  Autopilot front door
   handleCapabilitiesInvoke         executeCapabilityToolForAutopilot
   MessageRoute (dispatcher)         (tool-executor.js:672)
          │                               │
          └──────────────┬───────────────┘
                         ▼
              FsbCapabilityRouter.invoke(slug, args, ctx)   ← THE ONE ENGINE
                         │
              [Phase-30 consent gate — INHERITED, no bypass]
                         │
                catalog.resolve(slug, origin)
                  │  (skips quarantined: learned via getLearnedSync==null;
                  │   bundled via NEW quarantinedBundledSlugs Set)   ← HEAL-03
                  ▼
         ┌────────tier switch────────┐
         │ T1a handler │ T0/T1b/T2 declarative │ T3 seam
         │      │      │          │             │
         │ _runHandlerTier   _runDeclarativeTier   returns
         │      │                  │            RECIPE_DOM_FALLBACK_PENDING
         │      ▼                  ▼               (already real)
         │  handler.handle    interpretRecipe
         │  → executeBoundSpec → executeBoundSpec  ← MAIN-world credentialed
         │      │                  │                 fetch; ORIGIN-PINNED
         │      ▼                  ▼                 (two-point pin held)
         │  ┌────────────────────────────┐
         │  │  result {success, status,  │
         │  │   redirected, data, text}  │
         │  └────────────┬───────────────┘
         │               ▼
         │  ★ NEW: classifyRecipeBroken(result, recipe)   ← HEAL-02 / HEAL-04
         │     (capability-rot-detector.js)
         │     │
         │     ├─ broken (4xx/5xx │ empty-when-extract-expects │
         │     │         expectedShape-mismatch │ RECIPE_EXPIRED)
         │     │     → quarantine (learned or bundled)         ← HEAL-03
         │     │     → return RECIPE_DOM_FALLBACK_PENDING       ← HEAL-01 (signal)
         │     │        (carries underlying code, e.g. RECIPE_EXPIRED)
         │     │
         │     ├─ logged-out (302 → /login) → surface verbatim, NO fallback
         │     │
         │     └─ legitimate no-results (200 + valid shape + empty)
         │           → return the REAL empty result (NEVER mask)  ← HEAL-04
         └───────────────┬───────────────┘
                         ▼
              router returns typed result to the front door
                         │
          ┌──────────────┴───────────────┐
          ▼                               ▼
   MCP host sees the              Autopilot: makeResult.result carries
   typed RECIPE_* reason          the typed reason → MODEL sees it next iteration
   (via /^RECIPE_.+$/             → system-prompt hint (agent-loop.js:731)
    passthrough, no edit)          → model selects DOM tools (click/type_text/
          │                          read_page/get_site_guide) on the SAME task
          ▼                               │
   MCP host completes via                 ▼  ← HEAL-01 (completion; live = UAT)
   its OWN DOM tools             post-success → runDiscovery(origin) re-learn (D-10)
                                  → result marked fellBackToDom:true (audit-logged)

   ─────────────────────────────────────────────────────────────────
   agent-loop.js setTimeout iterator (lines 2027/2726/2795/2805):
   BYTE-UNTOUCHED (INV-04). The fallback is a tool-SELECTION decision
   in the existing dispatch, never an iterator change.
```

### Recommended Project Structure
```
extension/utils/
├── capability-rot-detector.js   # NEW: classifyRecipeBroken + validateExpectedShape (eval-free, allowlisted)
├── capability-router.js         # MOD: classify hook after executeBoundSpec; T3 realized; skip quarantined
├── capability-recipe-schema.js  # MOD: optional capturedAt+expectedShape; FSB_RECIPE_SCHEMA_VERSION 1→2
├── capability-interpreter.js    # MOD: carry expectedShape+capturedAt into the bound spec
├── capability-catalog.js        # MOD: quarantinedBundledSlugs Set + skip-in-resolve
├── recipe-synthesizer.js        # MOD: emit conservative expectedShape + capturedAt (D-07)
├── learned-recipe-store.js      # REUSED: quarantine() (no change)
└── discovery-session.js         # REUSED: runDiscovery() (no change)

extension/ai/
├── tool-executor.js             # MOD: surface typed reason + fellBackToDom in makeResult
└── agent-loop.js                # MOD: buildSystemPrompt hint ONLY (iterator UNTOUCHED)

tests/
├── capability-rot-detector.test.js  # NEW: the taxonomy + expectedShape assertions (HEAL-02/04)
├── provider-parity.test.js          # NEW: capability + fallback equivalent across 7 PROVIDER_KEYS (HEAL-05/INV-03)
└── recipe-schema-lock.test.js       # NEW: frozen v2 RECIPE_SCHEMA hash + frozen tool hash (HEAL-05/INV-01)

scripts/verify-recipe-path-guard.mjs # MOD: add capability-rot-detector.js to RECIPE_PATH_ALLOWLIST
package.json                          # MOD: append the 3 new test files to the npm test chain
```

### Pattern 1: The DOM-Fallback Completion Mechanism (HEAL-01 — the riskiest unknown, RESOLVED)

**What:** A recipe-broken signal escalates to the existing DOM tools to complete the SAME task at the autopilot layer, without a parallel stack (INV-02) and without touching the iterator (INV-04).

**The concrete answer:** The fallback is a **two-step, model-mediated handoff**, not an inline escalation:

1. **The router emits a typed "use DOM" reason.** When `classifyRecipeBroken` deems the `executeBoundSpec` result broken, the router returns the dual-field `RECIPE_DOM_FALLBACK_PENDING` (carrying the underlying `code`, e.g. `RECIPE_EXPIRED`, in an extra field). This is the SAME typed-reason contract the T3 seam already uses (capability-router.js:517-521) — the phase extends it to fire after a broken T1a/T1b/T2 fetch, not only on the pre-declared T3 tier.

2. **The model acts on the reason.** The autopilot front door (`executeCapabilityToolForAutopilot`, tool-executor.js:672-716) returns `makeResult({ success:false, error: response.error \|\| response.errorCode, result: response })`. The model sees this `invoke_capability` result on its next iteration. The system prompt (agent-loop.js:731) already says: *"Prefer them over DOM tools for first-party authenticated actions … fall back to the DOM tools (click, type_text, read_page, etc.) when no capability matches."* Phase 32 strengthens this so a `RECIPE_DOM_FALLBACK_PENDING` / `RECIPE_EXPIRED` reason explicitly tells the model to complete the SAME task via DOM tools.

**Why this honors the invariants:**
- **INV-04 (iterator untouched):** The model's next tool call is dispatched by the EXISTING `runAgentIteration` `setTimeout` chain (lines 2027/2726/2795/2805). Nothing in the iterator changes — the fallback is purely a different *tool the model selects*. The existing `tests/agent-loop-iterator-guard.test.js` (byte-string presence check on the 4 canonical `setTimeout` lines + a regex count of exactly 4) stays green.
- **INV-02 (one engine, no parallel stack):** The DOM tools (`click`, `type_text`, `read_page`, `get_page_snapshot`, `get_site_guide`) are the SAME tools `executeTool` already dispatches via the content/background routes. No new healer stack.
- **Origin-pin + consent (D-03):** The DOM fallback runs on the ACTIVE tab through normal DOM automation; the two-point origin-pin and the Phase-30 consent that gated the original invoke are inherited (the model is acting in the same owned-tab session).

**The MCP front-door half:** `handleCapabilitiesInvokeMessageRoute` (mcp-tool-dispatcher.js:2243) returns the router result verbatim. The typed `RECIPE_DOM_FALLBACK_PENDING` / `RECIPE_EXPIRED` surfaces to the MCP host through the existing `/^RECIPE_.+$/` passthrough (errors.ts:137). An MCP host (e.g. Claude Desktop) then completes the task via ITS OWN DOM tools. No `errors.ts` edit (D-16).

**Example (the typed-reason return the model/host acts on):**
```javascript
// Source: capability-router.js _err helper (:61-69) + the T3 case (:517-521)
// In _runDeclarativeTier / _runHandlerTier, AFTER executeBoundSpec returns:
var verdict = FsbCapabilityRotDetector.classifyRecipeBroken(out, recipe);
if (verdict && verdict.broken === true) {
  // Quarantine + emit the typed "fall back to DOM" reason carrying the underlying code.
  // (quarantine call elided here; see Pattern 3.)
  return _err('RECIPE_DOM_FALLBACK_PENDING', {
    slug: slug,
    reason: verdict.code,         // e.g. 'RECIPE_EXPIRED', 'RECIPE_HTTP_4XX'
    recipeBrokenReason: verdict.reason
  });
}
// otherwise: legitimate no-results or success → return `out` verbatim (NEVER mask).
```

**The headless test half vs the live half:** The HEADLESS test asserts the router/guard emits the fallback decision + typed reason and that `executeCapabilityToolForAutopilot` returns `fellBackToDom`/the typed reason (HEAL-01 CI half). The LIVE half — a real broken recipe on a real site, the model actually completing via DOM — is `human_needed` UAT (D-15). Flag accordingly.

### Pattern 2: classifyRecipeBroken Taxonomy (HEAL-04)

**What:** Distinguish recipe-broken from legitimate-no-results from logged-out, keyed off the `executeBoundSpec` result shape.

**The `executeBoundSpec` result shapes the classifier reads** (capability-fetch.js):
- Success (:377-384): `{ success:true, status, finalUrl, redirected, data, text }`
- `executeScript` failed (:336-339): `{ success:false, error:'executeScript failed: …' }`
- No page result (:356): `{ success:false, error:'no result from page fetch' }`
- Page-level error (:359): `{ success:false, error:<message> }` (e.g. a thrown fetch)
- Origin-pin mismatch (:293): dual-field `RECIPE_ORIGIN_MISMATCH` (typed; surfaced verbatim — NOT a rot)

**The 302/redirect representation** (the load-bearing logged-out signal): `capabilityFetchInPage` uses `redirect:'manual'` (capability-fetch.js:177), so a 302→/login is NOT silently followed. The result carries `redirected:true` when `resp.type === 'opaqueredirect'` OR `status` is 300-399 (capability-fetch.js:189). So a logged-out outcome is observable as `success:true, redirected:true` (an opaque redirect still parses as a "successful" fetch with no usable body).

**Decision table (recommended — Claude's discretion on exact code names, D-05/D-16):**

| Input condition | Verdict | Returned reason | Action |
|---|---|---|---|
| `success:true, status` in 400-599 | **broken** | `RECIPE_HTTP_4XX` / `RECIPE_HTTP_5XX` (or generic `RECIPE_EXPIRED`) | fallback |
| `success:true, redirected:true` (302→login) | **logged-out** | `RECIPE_LOGGED_OUT` | surface verbatim, NO fallback |
| `success:true, status:200`, `recipe.extract` present, `data` empty/null AND `expectedShape` fails | **broken** | `RECIPE_EXPIRED` | fallback |
| `success:true, status:200`, valid shape, `expectedShape` passes, `data` is an empty set | **legitimate no-results** | (none — return the REAL result) | return `out` verbatim (NEVER mask) |
| `success:true, status:200`, no `expectedShape`, `extract` did NOT expect data | **success** | (none) | return `out` verbatim |
| `success:false, error:'executeScript failed: …'` / `'no result …'` / page-thrown | **broken** | `RECIPE_EXPIRED` (or `RECIPE_FETCH_FAILED`) | fallback |
| `success:false, code:'RECIPE_ORIGIN_MISMATCH'` | NOT broken (security) | surface verbatim | NO fallback (a pin failure is not a rot) |

**Where the hook sits:** in `_runDeclarativeTier` immediately after `var out = await primitive.executeBoundSpec(...)` returns and before the `out.tier = tierLabel` stamp (capability-router.js ~:401-408), and the analogous point in `_runHandlerTier` (~:433-439). The classifier is called on `out`; on a non-broken verdict the existing stamp+return is preserved byte-for-byte.

**Critical HEAL-04 guard:** "empty data" alone is NOT "broken." A 200 with a valid shape and an empty set is a REAL empty outcome (e.g. "you have 0 notifications") and MUST be returned, not healed. The discriminator is `expectedShape`: it asserts the *container shape still resolves* (e.g. the response is still a JSON array/object with the read path present), NOT that the set is non-empty in a value sense — so "0 notifications" passes `expectedShape` and returns as a real empty result, while "the endpoint now returns an HTML login page / a 404 body" fails `expectedShape` and is healed. This is precisely the conservative D-06 stance.

### Pattern 3: expectedShape Representation + Validation (HEAL-02)

**What:** A conservative structural assertion stamped on the recipe, validated post-fetch.

**Representation (recommended: a JMESPath string; Claude's discretion D-05):** Within the closed `additionalProperties:false` vocab, add an OPTIONAL `expectedShape: { type:'string' }` field — a JMESPath that must resolve to a non-null, non-empty result. This reuses the SAME query language the `extract` field already uses (capability-recipe-schema.js:127 `extract: { type:'string' }`). The most conservative assertion is the read path itself resolving: e.g. for a notifications recipe with `extract:'@'`, `expectedShape:'@'` means "the response parsed to a non-empty JSON value at all." For a recipe with `extract:'items'`, `expectedShape:'items'` means "the `items` key still exists." This asserts *structure*, never *values* (D-06).

**Validation (reuse the exact `extract` engine):**
```javascript
// Source: capability-fetch.js:362-375 (the extract run) — the SAME engine path
// In capability-rot-detector.js validateExpectedShape(data, expectedShape):
//   const jp = FsbCapabilityInterpreter.getFSBJmespath();  // the vendored jmespath global
//   const resolved = jp.search(data, expectedShape);
//   const present = resolved !== null && resolved !== undefined
//                   && !(Array.isArray(resolved) && resolved.length === 0)
//                   && !(typeof resolved === 'object' && Object.keys(resolved).length === 0);
//   return present;   // false => expectedShape-mismatch => RECIPE_EXPIRED
```
Note: validation runs SW-side on the NORMALIZED `out.data` (post-`extract`), not on the raw body. The rot detector reaches the JMESPath engine the same typeof-guarded way the interpreter does (`getFSBJmespath()`), so it degrades to "shape passes" (conservative — never a false `RECIPE_EXPIRED`) if the engine is somehow absent.

**Carrying it through:** The interpreter must thread `expectedShape` + `capturedAt` from the recipe into the bound spec, mirroring how `extract` is carried (capability-interpreter.js:480: `extract: (typeof recipe.extract === 'string') ? recipe.extract : null`). Add: `expectedShape: (typeof recipe.expectedShape === 'string') ? recipe.expectedShape : null` and `capturedAt: recipe.capturedAt || null`. The router's classifier then reads `recipe.expectedShape` (it already has the `recipe` in `_runDeclarativeTier`) OR the spec — either works; reading the recipe directly is simplest.

**How Phase-31 synthesizes it (D-07):** The recipe-synthesizer (recipe-synthesizer.js:263) builds the recipe core from a REDACTED `ObservedCall` that carries **request shape only — no response body** (LEARN-02; the redactor strips bodies). Therefore the synthesizer CANNOT derive `expectedShape` from real response values (that would be PII). The conservative synthesized `expectedShape` is the `extract` path itself — i.e. `expectedShape: '@'` to match the synthesizer's `extract:'@'` (recipe-synthesizer.js:292). This asserts "the learned endpoint still returns a non-empty JSON response," the strongest assertion derivable from shape-only capture without reading the body. The synthesizer also stamps `capturedAt: Date.now()` (the store already records `capturedAt` bookkeeping at learned-recipe-store.js:393 — but D-05 wants it ON the recipe for time-based rot; add it to the synthesized recipe core). **This is the one place the additive schema field interacts with Phase-31 code.**

**Bundled recipes (D-07):** Hand-author a conservative `expectedShape` on the shipped JSON recipes where the maintainer knows the shape (e.g. `github.notifications` → `'@'`), or omit it → time/status-based rot only (4xx/5xx + redirect still classify; just no shape check). The catalog inline seeds (capability-catalog.js:96-118) would get the optional field too if authored.

### Pattern 4: Quarantine + Re-Learn Wiring (HEAL-03)

**What:** Demote a rotted recipe from routing; re-learn opportunistically.

**Learned quarantine (D-09, reuse verbatim):** `FsbLearnedRecipeStore.quarantine(slug, origin)` (learned-recipe-store.js:455) flips `quarantined:true` in BOTH the persisted envelope (`_write`) AND the synchronous in-memory mirror (`_mirrorQuarantine`). After that, `getLearnedSync(slug, origin)` returns null (learned-recipe-store.js:324) → `catalog.resolve` no longer surfaces the learned recipe as a T2 hit (catalog.js:259) → it falls through to the next tier. Persists across SW restart (D-12). The router calls `FsbLearnedRecipeStore.quarantine(slug, origin)` (fire-and-forget, best-effort) when `classifyRecipeBroken` deems a T2 result broken.

**Bundled quarantine (D-09, NEW session-only Set):** Add `var quarantinedBundledSlugs = Object.create(null)` (or a `Set`) to capability-catalog.js. `resolve(slug, origin)` consults it AFTER the learned check and BEFORE returning the REGISTRY entry: if the slug is quarantined, return null (skip it) so the router falls through. A new exported `quarantineBundled(slug)` / `clearBundledQuarantine(slug)` lets the router flag it. **Session-only** (in-memory, re-evaluated next SW session) so a transient site blip never permanently demotes a first-party bundled recipe (D-12). Do NOT mutate the `REGISTRY` data itself (D-09).

**Re-learn (D-10, reuse verbatim):** After a DOM fallback SUCCEEDS for a rotted recipe, call `FsbDiscoverySession.runDiscovery(origin, { tabId })` (discovery-session.js:128). This is the existing consent-gated, user-initiated discovery — it self-enforces the Phase-30 consent gate INSIDE `FsbNetworkCapture.startSession` BEFORE any debugger attach (discovery-session.js:137-154), so a default-OFF / denied / sensitive-unconfirmed origin re-learns NOTHING. This preserves the consent posture (NOT silent auto-capture). On a clean re-discovery, the new learned recipe replaces the quarantined one (a fresh `promote` writes a non-quarantined entry under the same or a new slug — D-11). **Trigger point caveat:** because the DOM completion is model-driven (live/UAT), the *automatic* post-fallback `runDiscovery` trigger is best modeled as a hook the autopilot door fires when it observes a `fellBackToDom` success, OR surfaced as a suggestion — the headless test asserts the trigger is *wired* (runDiscovery is callable on the rot path); the live re-learn-after-real-fallback is part of the `human_needed` UAT. Bundled rot is FLAGGED for the maintainer (logged via `rateLimitedWarn`), not auto-re-learned (D-10).

### Pattern 5: Provider Parity + Schema-Lock (HEAL-05 — the milestone gate)

**Provider parity (`tests/provider-parity.test.js`, D-13/INV-03):** Reuse the existing harness pieces from tool-definitions-parity.test.js:
- `PROVIDER_KEYS = ['xai', 'openai', 'anthropic', 'gemini', 'openrouter', 'lmstudio', 'custom']` (the 7; tool-definitions-parity.test.js:37, confirmed against `universal-provider.js` `PROVIDER_CONFIGS`).
- `formatToolsForProvider(publicTools, provider)` + `agentLoop.getPublicTools()` + `formattedToolNames(formatted, provider)` (handles the gemini `functionDeclarations` / anthropic flat / OpenAI `function.name` shape differences — tool-definitions-parity.test.js:75-84,183-191).

The new test asserts, for each of the 7 providers, that **the capability + fallback decision is equivalent**: the capability tools are exposed/formatted identically, and the router's `classifyRecipeBroken` verdict + the `RECIPE_DOM_FALLBACK_PENDING` emission are provider-independent (the router is below the provider layer — it never branches on provider, so the assertion is that a stubbed broken result yields the SAME typed reason regardless of which provider's formatted tools are in play). Stub strategy: a spy on `globalThis.FsbCapabilityRouter.invoke` (the `capability-autopilot-parity.test.js` pattern) returning a broken result, asserted equal across providers.

**Schema-lock (`tests/recipe-schema-lock.test.js`, D-14/INV-01):** Clone the `registryHash` mechanism:
```javascript
// Source: tests/tool-definitions-parity.test.js:54-69 (stable + registryHash)
function stable(value) { /* sort object keys recursively */ }
function schemaHash(schema) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(schema))).digest('hex');
}
// Freeze the v2 RECIPE_SCHEMA hash:
const FROZEN_RECIPE_SCHEMA_V2_HASH = '<computed once at first green>';
check(schemaHash(FsbCapabilityRecipeSchema.RECIPE_SCHEMA) === FROZEN_RECIPE_SCHEMA_V2_HASH, '...');
check(FsbCapabilityRecipeSchema.FSB_RECIPE_SCHEMA_VERSION === 2, 'schema version is 2');
// AND re-assert the frozen tool-definitions registry hash (the existing INV-01 lock):
check(registryHash(nonTriggerTools) === 'ad6efb8cc3275d964488b67222129b1c0278c5c3b69c64888d926beb89a3926b', '...');
```
The existing `tests/visual-session-schema-lock.test.js` is a second clone template for the structural-lock idiom. The schema-lock test fails the build on any drift to the recipe schema's closed vocab (the contract between bundled recipes, learned recipes, and the interpreter).

**Wiring:** Append all 3 new test files to the `npm test` chain (package.json `test` script, after the existing `learned-*.test.js` entries). The `recipe-schema-lock` + the additive-field change ALSO must keep `node tests/capability-recipe-schema.test.js` green (v1 recipes still validate). HEAL-05 = full `npm test` green = milestone gate (D-15).

### Anti-Patterns to Avoid
- **Inline DOM escalation from the SW router/guard.** Calling `executeTool('run_task', ...)` from inside the router builds a parallel autopilot stack (INV-02 violation) and risks iterator coupling (INV-04). The fallback is a model-driven tool-selection decision driven by the typed reason. (D-02)
- **Editing the agent-loop iterator.** The 4 canonical `setTimeout(function(){ runAgentIteration(...) }, ms)` lines are byte-locked by `agent-loop-iterator-guard.test.js`. Only `buildSystemPrompt` text changes. (INV-04)
- **Masking a real empty outcome.** A 200 + valid shape + empty set is a REAL result, returned verbatim — never healed. The `expectedShape` discriminator asserts structure, not value-non-emptiness. (HEAL-04)
- **A strict `expectedShape`.** Asserting exact values / non-empty sets produces false `RECIPE_EXPIRED`. Assert only that the read path resolves to a present container. (D-06)
- **Deleting a rotted recipe.** Quarantine/demote only (learned persists; bundled session-only). (D-09/D-12)
- **Editing `mcp/src/errors.ts`.** `RECIPE_EXPIRED`/`RECIPE_LOGGED_OUT`/`RECIPE_DOM_FALLBACK_PENDING` all match `/^RECIPE_.+$/` (errors.ts:137) and surface verbatim. (D-16)
- **Moving the frozen tool registry hash** (`ad6efb8c…`) or breaking the schema closed-vocab (re-locked by the schema-lock test). (INV-01)
- **A `capability-rot-detector.js` with any `eval`/`new Function`/`import(` even in comments.** It is auto-globbed by the recipe-path CI guard Check 4. (Wall-1)
- **Bypassing consent/origin-pin in the fallback.** The DOM fallback is normal active-tab automation; the pin + consent are inherited. (D-03)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Evaluate `expectedShape` against the response | A custom JSON path walker / required-keys matcher | `FsbCapabilityInterpreter.getFSBJmespath().search(data, expectedShape)` | The `extract` field already runs this exact engine SW-side (capability-fetch.js:362-375). Reuse = zero new validation code, identical semantics, conservative degradation. |
| Quarantine a learned recipe | A new flag/store | `FsbLearnedRecipeStore.quarantine(slug, origin)` | Already exists (learned-recipe-store.js:455); persists + flips the sync mirror so `resolve` demotes it. |
| Re-learn a rotted endpoint | A new capture/synthesis loop | `FsbDiscoverySession.runDiscovery(origin, {tabId})` | The existing consent-gated discovery (discovery-session.js:128) self-enforces the Phase-30 consent gate; reusing it preserves the posture (D-10). |
| The frozen schema/tool hash | A custom serializer/hasher | `crypto.createHash('sha256').update(JSON.stringify(stable(x))).digest('hex')` | The exact `registryHash` mechanism (tool-definitions-parity.test.js:65-69); deterministic via `stable()` key-sort. |
| Surface a typed fall-through reason to MCP | A new error mapping | The existing `/^RECIPE_.+$/` passthrough (errors.ts:137) | `RECIPE_*` codes already surface verbatim; no `errors.ts` edit (D-16). |
| The DOM fallback toolset | A new healer/automation stack | The existing content/background DOM tools via `executeTool` (`click`/`type_text`/`read_page`/`get_page_snapshot`/`get_site_guide`) | INV-02: one engine, no parallel stack. The model selects them on the next iteration. |
| Keep the iterator MV3-survivable through the change | Any iterator edit | Leave it byte-untouched; the fallback is a tool-selection decision | INV-04; `agent-loop-iterator-guard.test.js` enforces it. |

**Key insight:** Almost everything Phase 32 needs already exists — the typed-reason seam (`RECIPE_DOM_FALLBACK_PENDING` at T3), the JMESPath engine (`extract`), the quarantine API, the re-learn session, the frozen-hash test idiom, and the system-prompt fall-back hint. The phase is overwhelmingly *wiring + one new pure classifier + an additive schema field*, not new machinery. The single genuinely-new module is the eval-free `capability-rot-detector.js`.

## Runtime State Inventory

> This is primarily a code/logic phase, but it touches stored state (the learned-recipe store) and a session-scoped in-memory set. Inventory below.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The Phase-31 learned-recipe store (`chrome.storage.local` key `fsbLearnedRecipes`, learned-recipe-store.js:57) gains: (a) a `quarantined:true` flag set on rot (the field already exists in the stored shape, learned-recipe-store.js:23-25 — no migration needed), and (b) optionally `expectedShape`+`capturedAt` ON the synthesized recipe core for NEW learned recipes (existing learned recipes lack these → time/status rot only, which is the conservative default). | **Code edit only** (quarantine already supported; new fields are optional/additive). NO data migration — existing learned recipes stay valid (the v1→v2 schema bump is additive; v1 recipes pass `validateRecipe`). |
| Live service config | None — no external service config embeds Phase-32 state. The bundled quarantine is in-memory only (D-12), so nothing in n8n/Datadog/Tailscale/etc. is touched. | None — verified: the only new persisted state is the additive learned-store fields. |
| OS-registered state | None — no Task Scheduler / pm2 / launchd / systemd registration involves recipe rot. | None — verified by scope (pure extension-internal logic + tests). |
| Secrets/env vars | None — the rot detector reads only the already-redacted/normalized `executeBoundSpec` result (no auth material); the re-learn re-capture stays consent-gated and capture-time-redacted (Phase-31 posture). No new secret keys or env vars. | None — verified. The fallback inherits consent; no new credential surface. |
| Build artifacts / installed packages | `mcp/ai/tool-definitions.cjs` must stay byte-identical to `extension/ai/tool-definitions.js` IF that file changes (tool-definitions-parity.test.js). Phase 32 does NOT change tool-definitions (the capability tools are out-of-registry; the system-prompt hint is in agent-loop.js, not tool-definitions). So the frozen tool hash + the byte-identity check stay green. `mcp/build/errors.js` is consumed by the router test via dynamic import (already built by `npm --prefix mcp run build` early in the test chain). | **Verify** the frozen tool registry hash (`ad6efb8c…`) is unmoved (re-asserted by the new schema-lock test). NO `errors.ts`/`tool-definitions` edit. |

**Nothing found in category:** Live service config, OS-registered state, and secrets/env vars — all explicitly None (verified by phase scope: extension-internal classifier + additive schema field + tests; no external/OS/secret surface).

## Common Pitfalls

### Pitfall 1: Confusing the system-prompt hint (agent-loop.js:731) with the iterator
**What goes wrong:** Treating "the `agent-loop.js:731` capability→DOM precedence" as a code branch to edit, then accidentally touching the iterator and reddening the INV-04 guard.
**Why it happens:** The CONTEXT phrasing "the `agent-loop.js:731` capability→DOM precedent" reads like a control-flow precedence, but line 731 is a STRING inside `buildSystemPrompt()`. The iterator is elsewhere (lines 2027/2726/2795/2805).
**How to avoid:** Edit ONLY the prompt text in `buildSystemPrompt`. Confirm `tests/agent-loop-iterator-guard.test.js` stays green (it byte-checks the 4 `setTimeout` lines + asserts exactly 4 schedule matches).
**Warning signs:** Any diff to agent-loop.js outside `buildSystemPrompt`; the iterator guard test failing.

### Pitfall 2: `expectedShape` false-positives masking real empty results
**What goes wrong:** A strict `expectedShape` (e.g. "the array has ≥1 element") fires `RECIPE_EXPIRED` on a legitimate "0 results," then the fallback masks the real empty outcome — violating HEAL-04.
**Why it happens:** Conflating "the response shape is intact" with "the result set is non-empty."
**How to avoid:** `expectedShape` asserts the read PATH resolves to a present CONTAINER (a JSON array/object exists at the path), never that values are non-empty. For an empty notification list, `expectedShape:'@'` resolves to `[]` which, by D-06's conservative intent, should be treated as **shape-intact** (the response is still valid JSON of the expected kind) → return the REAL empty result. Carefully define the "present" predicate: a present-but-empty array/object that matches the EXPECTED kind is NOT a rot; only a missing path / wrong kind (HTML login page, 404 body, null where an object was expected) is. (This is the subtle line; document the predicate in the classifier and assert both cases in the test.)
**Warning signs:** A test where "0 notifications" triggers a fallback; user reports of "it redid work when there was genuinely nothing."

### Pitfall 3: Treating `RECIPE_ORIGIN_MISMATCH` (or a consent rejection) as a rot
**What goes wrong:** The classifier sees `success:false` from `executeBoundSpec` and blindly classifies it broken → falls back, bypassing the security signal.
**Why it happens:** `executeBoundSpec` returns several `success:false` shapes; the pin mismatch (capability-fetch.js:293) is a SECURITY rejection, not a rot.
**How to avoid:** The classifier MUST pass through any dual-field `RECIPE_*` typed code (especially `RECIPE_ORIGIN_MISMATCH` and the consent `RECIPE_CONSENT_*` codes) verbatim — those are NOT broken-recipe and must NOT trigger a DOM fallback. Only genuine API-shape failures (4xx/5xx, executeScript-failed, page-thrown, shape-mismatch) are broken.
**Warning signs:** A pin mismatch leading to a fallback; consent gate being effectively bypassed by the fallback path.

### Pitfall 4: The bundled quarantine accidentally persisting or mutating the catalog
**What goes wrong:** Quarantining a bundled recipe by mutating `REGISTRY` data, or persisting the bundled quarantine — permanently demoting a first-party recipe over a transient site blip.
**Why it happens:** Reaching for the easiest demotion (delete/flag the REGISTRY entry).
**How to avoid:** Use a SEPARATE in-memory `quarantinedBundledSlugs` Set consulted by `resolve`; never touch the REGISTRY object; never persist it (D-12 — session-only, re-evaluated next SW session).
**Warning signs:** A bundled recipe never recovering after a one-off 500; the REGISTRY object being mutated.

### Pitfall 5: The new `capability-rot-detector.js` failing the recipe-path CI guard
**What goes wrong:** The new module contains `eval`/`new Function`/`import(` (even in a comment/string), OR is not added to `RECIPE_PATH_ALLOWLIST` → Check 4's `extension/utils/capability-*.js` disk glob fails CLOSED.
**Why it happens:** The guard auto-globs every `capability-*.js`; a new one not on the allowlist reds CI.
**How to avoid:** Add `'extension/utils/capability-rot-detector.js'` to `RECIPE_PATH_ALLOWLIST` in scripts/verify-recipe-path-guard.mjs IN THE SAME PLAN that creates the file; keep the module free of dynamic-code constructs even in comments (the guard scans comments). (Note: the allowlist header comment still says "EXACTLY the six recipe-path files" — that comment is stale; the array has grown across phases. Follow the array, not the comment.)
**Warning signs:** `node scripts/verify-recipe-path-guard.mjs` failing on a disk-drift or eval-pattern check.

### Pitfall 6: Schema bump breaking v1 recipe validity or the closed-vocab posture
**What goes wrong:** Adding `capturedAt`/`expectedShape` as REQUIRED, or in a way that lets an unknown field through → v1 recipes fail OR the closed vocab opens.
**Why it happens:** Forgetting that v1 recipes carry neither field and that `additionalProperties:false` is the Wall-1 invariant.
**How to avoid:** Add both as OPTIONAL `properties` (not in `required`); keep `additionalProperties:false`; the `schemaVersion` const becomes `2` but `validateRecipe` must still accept v1-shaped recipes that omit the new fields. Keep `node tests/capability-recipe-schema.test.js` green. Re-freeze the v2 hash in the schema-lock test.
**Warning signs:** `capability-recipe-schema.test.js` failing; a recipe with an extra unknown field now passing.

## Code Examples

### Classify hook insertion (capability-router.js `_runDeclarativeTier`, after executeBoundSpec)
```javascript
// Source: capability-router.js:401-408 (the existing post-executeBoundSpec return)
var out = await primitive.executeBoundSpec(interpreted.spec, ctx && ctx.tabId);

// ★ Phase 32: classify BEFORE the success stamp. A NON-broken result (success or
// legitimate no-results) is returned verbatim (NEVER masked). A typed RECIPE_*
// security failure (e.g. RECIPE_ORIGIN_MISMATCH) is passed through by the detector.
var detector = (typeof FsbCapabilityRotDetector !== 'undefined') ? FsbCapabilityRotDetector : null;
if (detector && typeof detector.classifyRecipeBroken === 'function') {
  var verdict = detector.classifyRecipeBroken(out, recipe);
  if (verdict && verdict.broken === true) {
    // (quarantine the rotted recipe here — learned via store.quarantine, bundled
    //  via catalog.quarantineBundled — best-effort, fire-and-forget.)
    return _err('RECIPE_DOM_FALLBACK_PENDING', {
      slug: slug, reason: verdict.code, recipeBrokenReason: verdict.reason
    });
  }
}

if (out && out.success === true) { out.tier = tierLabel; return out; }
return out;
```

### classifyRecipeBroken skeleton (capability-rot-detector.js — NEW, eval-free)
```javascript
// NO EMOJIS, ASCII-only, dynamic-code-FREE (recipe-path allowlisted).
function classifyRecipeBroken(result, recipe) {
  if (!result || typeof result !== 'object') {
    return { broken: true, code: 'RECIPE_EXPIRED', reason: 'no-result' };
  }
  // Pass through typed security failures — NOT a rot, NEVER fall back.
  if (result.success === false && typeof result.code === 'string' && /^RECIPE_/.test(result.code)) {
    return { broken: false, code: null, reason: 'typed-passthrough' };
  }
  if (result.success === false) {
    return { broken: true, code: 'RECIPE_EXPIRED', reason: 'fetch-failed' };
  }
  // success === true from here.
  if (result.redirected === true) {
    return { broken: false, code: 'RECIPE_LOGGED_OUT', reason: 'redirect-to-login' };
    // (logged-out: surface verbatim; the router returns RECIPE_LOGGED_OUT, NO fallback)
  }
  var status = result.status;
  if (typeof status === 'number' && status >= 400) {
    return { broken: true, code: (status >= 500 ? 'RECIPE_HTTP_5XX' : 'RECIPE_HTTP_4XX'), reason: 'http-' + status };
  }
  // expectedShape gate (conservative): only a MISSING path / wrong-kind is a rot;
  // a present-but-empty container of the expected kind is a REAL empty result.
  if (recipe && typeof recipe.expectedShape === 'string' && recipe.expectedShape) {
    if (!validateExpectedShape(result.data, recipe.expectedShape)) {
      return { broken: true, code: 'RECIPE_EXPIRED', reason: 'expectedShape-mismatch' };
    }
  }
  return { broken: false, code: null, reason: 'ok' };   // success or legitimate no-results
}
```

### Additive schema fields (capability-recipe-schema.js — v1→v2)
```javascript
// Source: capability-recipe-schema.js:59 (version) + :79-148 (RECIPE_SCHEMA)
var FSB_RECIPE_SCHEMA_VERSION = 2;   // was 1 (D-08, additive)
// ... within RECIPE_SCHEMA.properties (additionalProperties:false preserved):
//   schemaVersion: { const: FSB_RECIPE_SCHEMA_VERSION },   // now 2
//   capturedAt:    { type: 'string' },    // OPTIONAL ISO timestamp (rot age)
//   expectedShape: { type: 'string' },    // OPTIONAL conservative JMESPath assertion
// NEITHER is added to `required` — v1 recipes that omit them still validate.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| T3 DOM-fallback returns `RECIPE_DOM_FALLBACK_PENDING` as a STUB seam (no real fallback) | The same typed reason is now emitted after a broken T1a/T1b/T2 fetch too, and the model completes via DOM on the next iteration | Phase 32 (this phase) | HEAL-01 realized; the seam becomes live without a parallel stack. |
| Recipes have no rot signal | Recipes stamped `capturedAt` + optional `expectedShape`; `classifyRecipeBroken` emits `RECIPE_EXPIRED` | Phase 32 | HEAL-02/04; schema v1→v2 additive. |
| `RECIPE_SCHEMA_VERSION = 1` | `= 2` (additive optional fields, closed vocab preserved, re-locked by hash) | Phase 32 | INV-01 schema-lock extended to the recipe schema. |

**Deprecated/outdated:** Nothing is deprecated. All Phase-32 changes are additive/realizing. The stale allowlist header comment ("EXACTLY the six recipe-path files") in verify-recipe-path-guard.mjs predates the per-phase allowlist growth — informational only; the array is authoritative.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The DOM-fallback completion is model-driven (the model selects DOM tools on the next iteration after seeing the typed reason), NOT an inline code escalation. | DOM-Fallback Completion Mechanism | LOW — directly supported by D-02 (the typed-reason seam + the existing system-prompt hint) and INV-02/INV-04. If the planner wants a more deterministic completion, that would require new machinery the invariants forbid; the live half is UAT regardless. |
| A2 | `expectedShape` as a JMESPath string (reusing the `extract` engine) is preferable to a required-keys list. | expectedShape Representation | LOW — explicitly Claude's discretion (D-05); both are valid. The JMESPath choice is the zero-new-code path. Planner/user may pick the list. |
| A3 | A present-but-empty container matching the expected kind is treated as a REAL empty result (passes `expectedShape`), not a rot. | Pitfall 2 / classifyRecipeBroken | MEDIUM — this is the load-bearing HEAL-04 line. The exact "present" predicate (empty `[]` of the right kind = ok; missing path / wrong kind = rot) should be confirmed and tested both ways. If drawn wrong, the fallback could mask a real empty outcome OR miss a real rot. The DOM-fallback backstop makes a missed rot recoverable; a masked empty outcome is the worse error, so bias conservative (treat empty-but-present as a real result). |
| A4 | The synthesized learned `expectedShape` is the `extract` path (`'@'`), since the synthesizer only has shape-only redacted capture (no response body). | expectedShape synthesis (D-07) | LOW — follows directly from LEARN-02 (no response body is ever captured). The synthesizer literally cannot derive a value-based shape. |
| A5 | The automatic post-fallback `runDiscovery` re-learn trigger is asserted as *wired* in CI; the actual re-learn-after-real-fallback is part of the `human_needed` UAT (because the DOM completion is live). | Quarantine + Re-Learn Wiring | LOW — consistent with D-10 + D-15's UAT posture. The planner decides the exact trigger placement (autopilot door observing `fellBackToDom`, vs a suggestion). |
| A6 | Phase 32 does NOT modify `tool-definitions.js`/`.cjs` (so the frozen tool hash + byte-identity stay green); the system-prompt hint lives in agent-loop.js `buildSystemPrompt`. | Runtime State Inventory / Provider Parity | LOW — the capability tools are out-of-registry (INV-01) and the hint is already in agent-loop.js:731. Confirmed no `RECIPE_EXPIRED`/`fellBackToDom` references exist in tool-definitions today. |

## Open Questions

1. **The exact "present container" predicate for `expectedShape` (HEAL-04 line).**
   - What we know: `expectedShape` must assert structure, not value-non-emptiness; an empty-but-present set is a real result (A3).
   - What's unclear: whether an empty array/object at the `expectedShape` path counts as "present" (recommended: yes, if the kind matches) or whether the kind-check needs to be explicit (e.g. distinguish `[]` from `null` from `"<html>…"`).
   - Recommendation: Define `validateExpectedShape` so a non-null/undefined resolved value of the EXPECTED kind passes (including empty containers); a missing path, `null`, or a non-JSON/HTML body fails. Assert BOTH the "0 results passes" and the "login-HTML fails" cases in `capability-rot-detector.test.js`.

2. **Where the automatic re-learn trigger fires given the model-driven completion.**
   - What we know: `runDiscovery(origin, {tabId})` is the re-learn path; it must fire AFTER a successful fallback (D-10).
   - What's unclear: the success of the DOM fallback is observed by the model/host (live), so the SW does not deterministically "know" the fallback completed in CI.
   - Recommendation: In CI, assert the trigger is *callable on the rot path* (a unit test that the quarantine + a `runDiscovery` invocation are wired). In production, the autopilot door can fire `runDiscovery` when it next observes the model operating successfully on the origin post-fallback (or surface it as a suggestion). Treat the end-to-end real re-learn as part of the UAT.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `jmespath` (vendored) | `expectedShape` validation | ✓ | `extension/lib/jmespath.min.js` + npm dep | If the engine global is absent, the rot detector treats shape as passing (conservative — no false `RECIPE_EXPIRED`) |
| `@cfworker/json-schema` (vendored) | v2 `RECIPE_SCHEMA` validation | ✓ | `extension/lib/cfworker-json-schema.min.js` + npm dep | `validateRecipe` already degrades to `RECIPE_SCHEMA_INVALID` if absent |
| `crypto` (Node built-in) | schema-lock + tool-registry frozen hashes | ✓ | Node stdlib | — (no fallback needed; it is stdlib) |
| `npm --prefix mcp run build` | the router/schema-lock tests dynamic-import `mcp/build/errors.js` | ✓ | already in the `npm test` chain before the capability tests | — |

**Missing dependencies with no fallback:** None — every dependency is already in the tree.
**Missing dependencies with fallback:** None blocking.

## Validation Architecture

> `workflow.nyquist_validation` is absent in `.planning/config.json` → treated as ENABLED. Section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Zero-framework FSB convention (module-level `passed`/`failed` counters, synchronous `check(cond,msg)`, `process.exit(failed>0?1:0)`) — confirmed across capability-router.test.js, capability-fetch.test.js, tool-definitions-parity.test.js |
| Config file | none — plain `node tests/<file>.js`; chained in `package.json` `test` script |
| Quick run command | `node tests/capability-rot-detector.test.js` (the new taxonomy suite) |
| Full suite command | `npm test` (the milestone gate, D-15) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HEAL-04 | `classifyRecipeBroken` distinguishes broken vs no-results vs logged-out — each case asserted | unit | `node tests/capability-rot-detector.test.js` | ❌ Wave 0 |
| HEAL-02 | `RECIPE_EXPIRED` on a stamped recipe whose response fails `expectedShape`, vs a fresh response passing | unit | `node tests/capability-rot-detector.test.js` | ❌ Wave 0 |
| HEAL-01 (CI half) | the router/guard routes a broken recipe to a DOM-fallback signal + returns the typed reason / `fellBackToDom` (the autopilot door surfaces it) | unit | `node tests/capability-router.test.js` (extend) + `node tests/capability-autopilot-parity.test.js` (extend) | ⚠️ exists; extend |
| HEAL-03 | quarantine-on-rot demotes the recipe from `resolve` (learned via `getLearnedSync==null`; bundled via the Set) + the post-fallback `runDiscovery` re-learn trigger is wired | unit | `node tests/capability-router.test.js` (extend) + `node tests/learned-recipe-store.test.js` (quarantine already covered) | ⚠️ exists; extend |
| HEAL-05 / INV-03 | the 7-provider parity (capability + fallback decision equivalent across all 7 `PROVIDER_KEYS`) | unit | `node tests/provider-parity.test.js` | ❌ Wave 0 |
| HEAL-05 / INV-01 | the schema-lock test (frozen v2 `RECIPE_SCHEMA` hash + frozen tool hash) | unit | `node tests/recipe-schema-lock.test.js` | ❌ Wave 0 |
| INV-04 | the agent-loop iterator stays byte-untouched | guard | `node tests/agent-loop-iterator-guard.test.js` (already green; must STAY green) | ✓ exists |
| HEAL-02 (additive schema) | v1 recipes still validate after the v1→v2 bump | regression | `node tests/capability-recipe-schema.test.js` (must stay green) | ✓ exists |

### Sampling Rate
- **Per task commit:** `node tests/capability-rot-detector.test.js` (the focused taxonomy suite) + `node tests/agent-loop-iterator-guard.test.js` (the INV-04 guard, cheap)
- **Per wave merge:** the capability + consent + learned cluster: `capability-router`, `capability-autopilot-parity`, `capability-recipe-schema`, `recipe-schema-lock`, `provider-parity`, `learned-recipe-store`, plus `verify-recipe-path-guard.mjs`
- **Phase gate:** full `npm test` green (HEAL-05 = the v0.9.99 milestone completion criterion, D-15)

### Wave 0 Gaps
- [ ] `tests/capability-rot-detector.test.js` — the taxonomy (broken/no-results/logged-out each asserted) + `expectedShape` pass/fail + the `RECIPE_ORIGIN_MISMATCH` passthrough (HEAL-02/04). Uses the chrome-stub recorder idiom (`harness.installChromeMock({tabs})` + `chrome.scripting.executeScript` recorder) to drive `executeBoundSpec` result shapes, OR calls `classifyRecipeBroken` directly with synthetic result objects (simpler, recommended for the pure classifier).
- [ ] `tests/provider-parity.test.js` — capability + fallback decision equivalent across the 7 `PROVIDER_KEYS` (HEAL-05/INV-03). Reuse `formatToolsForProvider`/`getPublicTools`/`formattedToolNames` + a `globalThis.FsbCapabilityRouter.invoke` spy returning a broken result.
- [ ] `tests/recipe-schema-lock.test.js` — frozen v2 `RECIPE_SCHEMA` hash (clone `registryHash`/`stable`) + re-assert the frozen tool registry hash `ad6efb8c…` (HEAL-05/INV-01).
- [ ] Extend `tests/capability-router.test.js` — the T3-realization routes a broken recipe to `RECIPE_DOM_FALLBACK_PENDING`; quarantine fires on the rot path; the `runDiscovery` re-learn trigger is wired.
- [ ] Extend `tests/capability-autopilot-parity.test.js` — the autopilot door surfaces the typed reason / `fellBackToDom` in `makeResult`.
- [ ] `package.json` test-chain wiring: append the 3 new test files after the existing `learned-*.test.js` entries.
- [ ] `scripts/verify-recipe-path-guard.mjs`: add `'extension/utils/capability-rot-detector.js'` to `RECIPE_PATH_ALLOWLIST` (Check 4 auto-globs it).
- [ ] Framework install: none — zero-framework convention.

## Security Domain

> `security_enforcement` absent in config → ENABLED. Section required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth logic changes; the fallback inherits the existing first-party-session model. |
| V3 Session Management | no | No session changes; the DOM fallback runs in the same owned-tab session. |
| **V4 Access Control** | **yes** | The fallback MUST inherit the Phase-30 consent gate (default-OFF/Ask/Auto, the single chokepoint) and the two-point origin-pin — NO bypass. The router's consent gate runs ABOVE the tier dispatch (capability-router.js:460-475) and is unchanged; the DOM fallback is normal active-tab automation already inside the consented session. The catalog `resolve` skip-quarantined logic must not weaken the gate. |
| V5 Input Validation | yes (additive) | The v2 `RECIPE_SCHEMA` keeps `additionalProperties:false` (closed vocab, Wall-1); `expectedShape` is a `type:'string'` JMESPath validated by the same read-only engine — no executable field, no value injection. `validateRecipe` still rejects out-of-vocab fields. |
| V6 Cryptography | yes (test-only) | The schema-lock hash uses `crypto.createHash('sha256')` (Node stdlib) — never hand-rolled. No new crypto in the runtime path. |
| **V7 Errors & Logging** | **yes** | A rotted recipe's response (possibly error/auth-bearing HTML or a 4xx/5xx body) must NOT leak into logs. Reuse `redactForLog` (extension/utils/redactForLog.js — collapses URLs to origin, strings to `{kind,length}`, responses to `{kind:'response',statusCode}`). The audit log already redacts (audit-log.js uses `redactForLog`). The `fellBackToDom` marker + the typed reason are audit-logged as field-whitelisted entries (the router `_audit` at :173-192 already whitelists fields — extend with the typed reason CODE only, never a body). The classifier itself must never log `result.data`/`result.text`. |

### Known Threat Patterns for {MV3 capability runtime + DOM fallback}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| The fallback masks a REAL outcome (a legitimate empty result is "healed," hiding the truth from the user) | **Tampering / Repudiation** | The `classifyRecipeBroken` taxonomy returns a real empty/200 result verbatim and NEVER falls back on it (HEAL-04); `expectedShape` asserts structure, not value-non-emptiness (D-06). Assert both "0 results passes" and "login-HTML fails" in the test. |
| A rotted-recipe response body (error page, auth-bearing redirect, 4xx JSON with tokens) leaks into logs/audit | **Information Disclosure** | Reuse `redactForLog` for any diagnostic; the audit log records only field-whitelisted entries (origin→origin, the typed CODE, never the body). The classifier reads `result.data`/`status`/`redirected` but logs none of them raw. |
| The DOM fallback bypasses the origin-pin (completes the task against a different/cross-origin target) | **Elevation of Privilege / Spoofing** | The fallback is normal DOM automation on the ACTIVE owned tab — the two-point origin-pin (interpreter origin-pin at capability-interpreter.js:517 + the active-tab pin at capability-fetch.js:291) governs the capability path, and the DOM tools act only on the owned tab. The fallback is NOT a credentialed cross-origin re-target (D-03). |
| The fallback bypasses the consent gate (runs against a default-OFF / sensitive origin) | **Elevation of Privilege** | The consent gate already passed for the original invoke (the router gate at :460-475); the DOM fallback runs in that consented session. The re-learn `runDiscovery` independently re-enforces the consent gate inside `startSession` before any capture (discovery-session.js:137-154). |
| A rotted bundled recipe is permanently demoted by a transient blip (availability harm) | **Denial of Service** | Bundled quarantine is SESSION-only in-memory (D-12), re-evaluated next SW session; never persisted, never deletes the catalog data. |
| The `expectedShape` field smuggles executable logic | **Tampering (Wall-1)** | `expectedShape` is `type:'string'` (a JMESPath data string), evaluated by the read-only `jmespath` engine — never `eval`'d; the closed-vocab `additionalProperties:false` schema + the recipe-path CI guard (eval-free, comment-scanned) hold. |

## Sources

### Primary (HIGH confidence — direct codebase reads on `automation-worktree`, 2026-06-23)
- `extension/utils/capability-router.js` — the T3 seam (:517-521), `_runDeclarativeTier` (:352-409, classify hook ~:401), `_runHandlerTier` (~:420-440), the consent gate (:460-475), the `_err` dual-field helper (:61-69)
- `extension/utils/capability-fetch.js` — `executeBoundSpec` result shapes (success :377-384; failures :336-339/:356/:359; pin mismatch :293), `redirect:'manual'` + `redirected` (:177/:189), the SW-side `extract` run via `getFSBJmespath` (:362-375)
- `extension/ai/tool-executor.js` — `executeCapabilityToolForAutopilot` (:672-716), `executeTool` capability guard (:738-743), `makeResult` (:45-53), the DOM tool dispatch (content :95-169 / background :222-625)
- `extension/ai/agent-loop.js` — the capability→DOM system-prompt hint (:731, inside `buildSystemPrompt`), the iterator `setTimeout` chain (:2027/:2726/:2795/:2805)
- `extension/utils/capability-recipe-schema.js` — `FSB_RECIPE_SCHEMA_VERSION` (:59), `RECIPE_SCHEMA` closed vocab (:79-148), `extract` field (:127), `validateRecipe` (:231-299)
- `extension/utils/capability-interpreter.js` — `getFSBJmespath` (:87-89), the `extract` carry into the spec (:480), `bindRecipeCore` (:416-535)
- `extension/utils/learned-recipe-store.js` — `quarantine(slug, origin)` (:455-476), `getLearnedSync` quarantine-null (:311-330), the stored `quarantined` field (:23-25)
- `extension/utils/capability-catalog.js` — `resolve` learned-first (:250-310), the REGISTRY (:131-142), the inline seed recipes (:96-118)
- `extension/utils/discovery-session.js` — `runDiscovery(origin, opts)` (:128-261), the consent gate inside `startSession` (:137-154)
- `extension/utils/recipe-synthesizer.js` — `synthesize` (:263-325), `extract:'@'` (:292), the closed-vocab core build (:285-296), `flaggedForPhase32` on the descriptor (:317)
- `extension/ai/universal-provider.js` — `PROVIDER_CONFIGS` the 7 providers (:7-52)
- `extension/utils/redactForLog.js` — the redaction rules (:29-63)
- `mcp/src/errors.ts` — the `/^RECIPE_.+$/` passthrough (:137)
- `extension/ws/mcp-tool-dispatcher.js` — `handleCapabilitiesInvokeMessageRoute` returns the router result verbatim (:2216-2244)
- `tests/tool-definitions-parity.test.js` — `PROVIDER_KEYS` (:37), `registryHash`/`stable` (:54-69), the frozen hash (:52), `formatToolsForProvider`/`formattedToolNames` (:75-84,183-191)
- `tests/capability-router.test.js` / `tests/capability-fetch.test.js` / `tests/capability-autopilot-parity.test.js` — the zero-framework + chrome-stub recorder + router-spy idioms
- `tests/agent-loop-iterator-guard.test.js` — the INV-04 byte-string presence + count guard (:47-67)
- `tests/visual-session-schema-lock.test.js` — the second schema-lock clone template
- `scripts/verify-recipe-path-guard.mjs` — `RECIPE_PATH_ALLOWLIST` + Check 4 auto-glob of `capability-*.js` (:34, :83-160)
- `package.json` — the `test` chain + `validate:extension` (`verify-recipe-path-guard.mjs`); deps confirm no new package

### Secondary (MEDIUM confidence)
- None — every claim is a primary codebase read.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; all dependencies verified present in package.json and vendored.
- Architecture (DOM-fallback mechanism, taxonomy, expectedShape, quarantine, parity): HIGH — every integration point traced to a file:line in the actual source on the working branch.
- Pitfalls: HIGH — derived from the actual invariant guards (iterator byte-check, recipe-path CI guard, additive-schema) and the documented HEAL-04 masking risk.
- The one MEDIUM-risk open item (A3 — the exact "present container" predicate for `expectedShape`) is flagged in the Assumptions Log + Open Questions and is recoverable (the DOM fallback is the backstop; bias conservative).

**Research date:** 2026-06-23
**Valid until:** 2026-07-23 (stable — internal codebase, no fast-moving external dependency; re-verify only if the router/fetch/schema files change before planning)

## RESEARCH COMPLETE
