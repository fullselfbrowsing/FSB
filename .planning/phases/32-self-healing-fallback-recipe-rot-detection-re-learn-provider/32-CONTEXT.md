# Phase 32: Self-Healing Fallback + Recipe-Rot Detection + Re-Learn + Provider/Schema-Lock Tests + UAT - Context

**Gathered:** 2026-06-23 (smart discuss — autonomous mode; all 4 areas accepted as recommended)
**Status:** Ready for planning

<domain>
## Phase Boundary

The flagship differentiator + the milestone-closing gate. Tie recipe-break detection to the EXISTING DOM tools so a broken recipe still completes the task — the catch-all for Wall-2's un-replayable auth classes — and prove parity across all 7 providers + the schema-lock invariant. Stacks on the now-proven router/T3 (29), consent/audit (30), and learned-store/discovery (31).

**In scope (HEAL-01..05):**
- **Self-healing DOM fallback (HEAL-01):** a broken recipe (4xx/5xx, empty, shape-mismatch, RECIPE_EXPIRED) falls back to the existing DOM automation (DOM engine + site guides + run_task) and STILL completes the task.
- **Recipe-rot detection (HEAL-02):** recipes stamped with capturedAt + an expected-shape assertion; responses validated → typed RECIPE_EXPIRED.
- **Quarantine + re-learn (HEAL-03):** a broken recipe is quarantined/demoted, and re-learned where possible.
- **Failure taxonomy (HEAL-04):** distinguishes "recipe broken" from a legitimate "no results" so fallback NEVER masks a real outcome.
- **Provider/schema-lock parity (HEAL-05):** capability + fallback pass across all 7 providers (INV-03) + a schema-lock parity test (INV-01).

**Explicitly NOT in this phase / deferred refinements:**
- Deeper rot heuristics, fully-automatic silent re-learn, and persisted bundled-quarantine are future refinements (this phase ships the conservative, consent-respecting version).
- The live self-healing-on-a-real-broken-recipe is `human_needed` UAT (Phase 27-31 posture), NOT a CI gate.
- This is the LAST phase of milestone v0.9.99 — after it the milestone is gated by the full npm test (HEAL-05) and completed.
</domain>

<decisions>
## Implementation Decisions

### Self-Healing Fallback (HEAL-01, HEAL-04)
- **D-01:** A NEW `classifyRecipeBroken(result, recipe)` runs AFTER `executeBoundSpec` in the router's declarative path and produces the failure taxonomy (HEAL-04): **recipe-broken** (4xx/5xx, empty-when-`extract`-expects-data, `expectedShape`-mismatch, or `RECIPE_EXPIRED`) → fallback; **legitimate no-results** (200 + valid shape + empty set) → return the REAL empty outcome (never mask); **logged-out** (302 → login redirect) → surface as-is, do NOT fallback. Only recipe-broken triggers the DOM fallback.
- **D-02:** The DOM fallback completes the task at the **AUTOPILOT layer**, reusing the EXISTING DOM tools — NO parallel stack (INV-02). The existing pre-`executeTool` capability guard (`tool-executor.js`), on a recipe-broken / `RECIPE_DOM_FALLBACK_PENDING` signal, escalates the SAME task to `run_task` / `click` / `type_text` / `get_site_guide` via the existing agent-loop tool dispatch (the `agent-loop.js:731` capability→DOM precedent). The `agent-loop.js` `setTimeout` iterator stays BYTE-UNTOUCHED (INV-04). The MCP front door surfaces the typed `RECIPE_EXPIRED` / `RECIPE_DOM_FALLBACK_PENDING` reason so an MCP host completes via its own DOM tools.
- **D-03:** The DOM fallback is normal DOM automation on the ACTIVE tab — the two-point origin-pin holds and the Phase-30 consent gate that already gated the invoke is inherited. The fallback is NOT a consent or origin-pin bypass.
- **D-04:** When the fallback completes, the capability path returns the COMPLETED task result with a typed `fellBackToDom: true` marker (recorded in the Phase-30 audit log). A legitimate no-results returns the REAL empty result (NOT a fallback), so a real outcome is never masked (HEAL-04).

### Recipe-Rot Detection (HEAL-02)
- **D-05:** Recipes are stamped with `capturedAt` + an OPTIONAL `expectedShape` assertion (a JMESPath that must resolve non-empty, or a required-keys list, within the closed vocab); after the fetch, the response is validated against `expectedShape` → typed `RECIPE_EXPIRED` on mismatch (HEAL-02).
- **D-06:** `expectedShape` is CONSERVATIVE — assert only structural invariants (a key path resolves, the expected type), NEVER exact values. A too-strict assertion that false-positives is worse than a missed rot (the DOM fallback is the backstop); minimize false `RECIPE_EXPIRED`.
- **D-07:** `expectedShape` source: bundled recipes get a hand-authored conservative assertion (or none → time/status-based rot only); learned recipes (Phase 31) synthesize `expectedShape` from the captured response shape at synthesis time.
- **D-08:** Bump `FSB_RECIPE_SCHEMA_VERSION` 1 → 2, ADDITIVE — `capturedAt` + `expectedShape` are OPTIONAL so v1 recipes stay schema-valid; the `additionalProperties:false` closed-vocab posture is preserved. A NEW schema-lock test freezes the v2 `RECIPE_SCHEMA` hash (HEAL-05/INV-01).

### Quarantine + Re-Learn (HEAL-03)
- **D-09:** Learned-recipe rot reuses Phase-31's `learned-recipe-store.quarantine()` (flag-not-delete; `getLearned`/`getLearnedSync` return null for a quarantined entry, demoting it from routing). Bundled-recipe rot uses a NEW in-memory `quarantinedBundledSlugs` set in `capability-catalog.js` (do NOT mutate the bundled catalog data) so a rotted bundled recipe is skipped by `resolve` until re-reviewed.
- **D-10:** Re-learn is OPPORTUNISTIC + consent-respecting — after a DOM fallback SUCCEEDS for a rotted recipe, trigger Phase-31's discovery (`FsbDiscoverySession.runDiscovery`) for that origin to re-learn the new endpoint, preserving the user-initiated/consent-gated posture (NOT silent auto-capture). Bundled rot is flagged for the maintainer (not auto-re-learned).
- **D-11:** A quarantined/demoted recipe is SKIPPED by `catalog.resolve` (the router falls through to the next tier / the DOM fallback); it outranks nothing while quarantined; a successful re-learn replaces it with the new learned recipe.
- **D-12:** Quarantine persistence: learned quarantine persists in the store (survives SW restart); bundled quarantine is SESSION/in-memory (re-evaluated next session — a transient site blip must NOT permanently demote a first-party bundled recipe).

### Provider/Schema-Lock Parity Gate + UAT (HEAL-05, INV-01/INV-03)
- **D-13:** A NEW `tests/provider-parity.test.js` asserts the capability path AND the DOM-fallback path behave equivalently across ALL 7 `universal-provider.js` targets (`xai/openai/anthropic/gemini/lmstudio/openrouter/custom` — the existing `PROVIDER_KEYS`), reusing the existing provider test harness (INV-03).
- **D-14:** A NEW schema-lock test freezes the `RECIPE_SCHEMA` v2 hash AND re-asserts the frozen tool-definitions registry hash (the schema is the contract between bundled recipes, learned recipes, and the interpreter; fail the build on drift) (HEAL-05/INV-01).
- **D-15:** HEAL-05 is the v0.9.99 MILESTONE GATE — the full `npm test` (capability + fallback + 7-provider parity + schema-lock) green is the milestone completion criterion. The live self-healing on a real broken recipe is the `human_needed` UAT (Phase 27-31 posture).
- **D-16:** The self-healing code lives in a NEW eval-free, allowlisted `capability-rot-detector.js` (the `classifyRecipeBroken` classifier + the `RECIPE_EXPIRED` emission) + the T3 realization in `capability-router.js` (the T3 case delegates to the classifier; the autopilot guard handles the DOM escalation). `RECIPE_EXPIRED` (and any `RECIPE_LOGGED_OUT`) surface via the existing `/^RECIPE_.+$/` passthrough — NO `errors.ts` edit.

### Claude's Discretion
- The exact `classifyRecipeBroken` signature + the new `RECIPE_*` code names (`RECIPE_EXPIRED` + optionally `RECIPE_LOGGED_OUT`).
- The `expectedShape` representation (a JMESPath string vs a required-keys list) within the closed vocab.
- The schema-lock hash mechanism (SHA256 of the stably-serialized schema, mirroring `tool-definitions-parity`).
- Whether the rot detector is a separate `capability-rot-detector.js` module (recommended) or folded into the router; the precise autopilot-guard DOM-escalation point; the provider-parity test's stub strategy.

### Folded Todos
None — no pending todos matched Phase 32.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

Requirements / roadmap / prior context:
- `.planning/REQUIREMENTS.md` — HEAL-01..05 (lines 56-60); the INV preamble.
- `.planning/ROADMAP.md` — Phase 32 details; INV-01..04 (lines 17-20). This is the LAST milestone phase.
- `.planning/phases/29-...autopilo/29-CONTEXT.md` — the router T3 seam (RECIPE_DOM_FALLBACK_PENDING), the catalog resolve, the autopilot pre-executeTool guard (CAT-04), `_runDeclarativeTier`.
- `.planning/phases/31-...learned-recipes/31-CONTEXT.md` — the learned-recipe-store quarantine API + FsbDiscoverySession.runDiscovery (the re-learn path).
- `.planning/phases/30-...legal/30-CONTEXT.md` — the consent gate + the audit log (the fallback marker is audit-logged).
- `.planning/phases/27-...resume-s/27-CONTEXT.md` — executeBoundSpec result shape + the two-point origin-pin (the fallback inherits the pin).
- `.planning/phases/26-...ci-guard/26-CONTEXT.md` — the closed-vocab recipe schema + the eval-free CI guard the new module must satisfy.

Source anchors (verified by the Phase-32 codebase scout, `automation-worktree`, 2026-06-23):
- `extension/utils/capability-router.js:517-520` — the T3 `RECIPE_DOM_FALLBACK_PENDING` seam (made real, D-01/D-16); `_runDeclarativeTier:352-409` — where `classifyRecipeBroken` hooks after `executeBoundSpec` returns (~:401).
- `extension/utils/capability-fetch.js:377-384` (the normalized success result the classifier inspects) + `:336-360` (the failure result) — HEAL-02/HEAL-04.
- `extension/ai/tool-executor.js:29-52` (`executeTool`/`makeResult`) + `:95-169` (`executeContentTool` DOM dispatch) + the pre-`executeTool` capability guard (Phase 29-05) — the DOM-fallback escalation point (D-02).
- `extension/ai/agent-loop.js:731` (the capability→DOM precedence) — the iterator stays byte-untouched (INV-04, D-02).
- `extension/ai/tool-definitions.js:1067` (`get_site_guide`) + the DOM tools — the fallback toolset.
- `extension/utils/capability-recipe-schema.js:59` (`FSB_RECIPE_SCHEMA_VERSION`) + `:79-148` (closed `RECIPE_SCHEMA`, additionalProperties:false) — add optional `capturedAt`+`expectedShape`, bump to v2 (D-05/D-08).
- `extension/utils/learned-recipe-store.js` (`quarantine(slug, origin)`, getLearned/getLearnedSync respect quarantined) — D-09; `extension/utils/discovery-session.js` (`runDiscovery`) — the re-learn trigger (D-10).
- `extension/utils/capability-catalog.js` — add the in-memory `quarantinedBundledSlugs` set; `resolve` skips quarantined (D-09/D-11).
- `extension/ai/universal-provider.js:7-51` (`PROVIDER_CONFIGS` — the 7 providers) + `tests/tool-definitions-parity.test.js:37` (`PROVIDER_KEYS`) + `:52,65-69` (the frozen registry hash + `registryHash()`) — the provider-parity + schema-lock tests (D-13/D-14).
- `mcp/src/errors.ts:126-139` (the `/^RECIPE_.+$/` passthrough) — `RECIPE_EXPIRED`/`RECIPE_LOGGED_OUT` surface verbatim, NO edit (D-16).
- `extension/ws/mcp-tool-dispatcher.js:2217-2243` (`handleCapabilitiesInvokeMessageRoute` → `FsbCapabilityRouter.invoke`) — the MCP front door that surfaces the typed reason (D-02).
- `scripts/verify-recipe-path-guard.mjs` (`RECIPE_PATH_ALLOWLIST`) — `capability-rot-detector.js` is `capability-*` so auto-globbed by Check 4 (must be eval-free).
- Greenfield (net-new): `extension/utils/capability-rot-detector.js`, `tests/provider-parity.test.js`, `tests/recipe-schema-lock.test.js`.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **The router T3 seam + `_runDeclarativeTier`** (`capability-router.js:517`, `:352-409`) — the post-fetch classify hook + the T3 realization point.
- **`executeBoundSpec` normalized result** (`capability-fetch.js:377-384`) — what the rot-classifier inspects.
- **The existing DOM tools + agent loop + tool-executor** (`tool-executor.js`, `agent-loop.js:731`, `tool-definitions.js:1067` get_site_guide) — the fallback toolset; reused, NOT re-built (INV-02/04).
- **The closed recipe schema** (`capability-recipe-schema.js`) — extended additively to v2.
- **Phase-31 learned-store quarantine + discovery.runDiscovery** — the re-learn path (D-09/D-10).
- **Phase-30 consent gate + audit log** — inherited by the fallback (D-03/D-04).
- **`universal-provider.js` PROVIDER_KEYS + the tool-definitions-parity hash harness** — the HEAL-05 tests.

### Established Patterns
- **Typed `RECIPE_*` reasons via `/^RECIPE_.+$/` passthrough** — `RECIPE_EXPIRED` surfaces with no errors.ts edit.
- **One engine, two front doors (INV-02)** — the fallback reuses the existing DOM-tool stack; no parallel healer stack.
- **Eval-free `capability-*` modules on RECIPE_PATH_ALLOWLIST** — `capability-rot-detector.js` is auto-globbed by Check 4.
- **Frozen-hash parity tests** (`tool-definitions-parity`) — cloned for the schema-lock test.
- **Quarantine-flag-not-delete** (Phase 31) — extended to bundled via an in-memory catalog set.
- **Conservative-default + DOM-fallback-as-backstop** — false-positive rot is recoverable; missed rot is caught by the next break.

### Integration Points
- `extension/utils/capability-rot-detector.js` (NEW) — `classifyRecipeBroken(result, recipe)` → {broken, code, reason}; eval-free, allowlisted.
- `extension/utils/capability-router.js` (MODIFIED) — post-`executeBoundSpec` classify hook; T3 case realized (emit the typed reason / mark fellBackToDom); skip quarantined slugs.
- `extension/utils/capability-recipe-schema.js` (MODIFIED) — optional `capturedAt`+`expectedShape`, version → 2.
- `extension/utils/capability-catalog.js` (MODIFIED) — `quarantinedBundledSlugs` set; resolve skips quarantined.
- `extension/utils/learned-recipe-store.js` + `discovery-session.js` (REUSED, possibly MODIFIED) — quarantine on rot + the post-fallback re-learn trigger.
- `extension/ai/tool-executor.js` (MODIFIED) — the autopilot guard escalates a recipe-broken signal to the DOM tools (the fallback completion). `agent-loop.js` UNTOUCHED (INV-04).
- `tests/provider-parity.test.js` + `tests/recipe-schema-lock.test.js` (NEW) — HEAL-05; wired into `npm test`.
- `extension/utils/recipe-synthesizer.js` (Phase 31, possibly MODIFIED) — synthesize `expectedShape` for learned recipes (D-07).

### `agent-loop.js` is UNTOUCHED (INV-04)
- The fallback is a tool-SELECTION decision in the existing dispatch, not an iterator change.
</code_context>

<specifics>
## Specific Ideas

- **DOM fallback completes at the autopilot layer, reusing the existing DOM tools** — INV-02 (one engine) + INV-04 (iterator untouched). The router/MCP surfaces the typed reason; the agentic caller completes via DOM (D-02).
- **Broken vs no-results vs logged-out is the load-bearing taxonomy (HEAL-04)** — fallback NEVER masks a real (empty) outcome; a 302→login is surfaced, not healed (D-01/D-04).
- **expectedShape is conservative** — structural invariants only; false-positive rot is recoverable via the DOM backstop (D-06).
- **Schema v2 is additive** — optional fields; v1 recipes stay valid; the closed vocab is re-locked by the schema-lock test (D-08/D-14).
- **Re-learn is opportunistic + consent-gated** — re-discovery only after a successful fallback, never silent auto-capture (D-10).
- **HEAL-05 is the milestone gate** — full npm test green across capability + fallback + 7 providers + schema-lock closes v0.9.99 (D-15).

### Pitfalls to avoid
- Do NOT build a parallel fallback stack — reuse the existing DOM tools via the autopilot guard (INV-02).
- Do NOT touch the agent-loop iterator (INV-04) — the fallback is a tool-selection decision.
- Do NOT let fallback mask a legitimate no-results or a logged-out outcome (HEAL-04).
- Do NOT make expectedShape strict (false RECIPE_EXPIRED); conservative structural assertions only.
- Do NOT delete a rotted recipe — quarantine/demote (learned persists, bundled session-only) (D-09/D-12).
- Do NOT edit errors.ts (RECIPE_EXPIRED rides the passthrough) or move the frozen tool hash (INV-01) or break the schema closed-vocab (re-locked by the schema-lock test).
- Do NOT bypass consent or the origin-pin in the fallback (D-03).
</specifics>

<deferred>
## Deferred Ideas

- Deeper rot heuristics (per-field drift scoring, partial-shape tolerance) beyond the conservative structural assertion.
- Fully-automatic silent re-learn on every RECIPE_EXPIRED (vs the opportunistic, consent-gated, post-fallback trigger).
- Persisted bundled-recipe quarantine (vs the session/in-memory demotion that re-evaluates next session).
- The live self-healing-on-a-real-broken-recipe end-to-end — `human_needed` UAT (Phase 27-31 posture).

### Reviewed Todos (not folded)
None — no pending todos matched Phase 32.
</deferred>
