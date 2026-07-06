# Phase 44: T1 Readiness Inventory + Status Surface - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning
**Mode:** Orchestrator-gathered after v1.0.0 archive. This phase starts the v1.1.0 T1 App Execution Expansion milestone.

<domain>
## Phase Boundary

Phase 44 does not port new app handlers. It creates the truth surface for the rest of v1.1.0: every catalog descriptor must be classified by current execution readiness, and users/developers must not confuse "catalog/search supported" with "direct API executable through `invoke_capability`."

**In scope:**
1. Generate an authoritative T1 readiness matrix for all 2,314 descriptors.
2. Classify each descriptor by app/service, slug, side-effect class, current tier/backing, current invocability, origin classification, likely auth/API pattern, likely same-origin or separate-origin route, and next action.
3. Make `search_capabilities`, docs, and any relevant UI/status copy distinguish executable T1/T1b, fail-closed guarded writes, T2 learn-pending, and T3 DOM/discovery-pending.
4. Add a CI guard so future descriptors cannot be marked T1-ready without a real handler/recipe plus tests.

**Out of scope:**
- Porting new app handlers or recipes.
- Building Pattern-D, GAPI bridge, or cross-origin execution.
- Activating write/destructive handlers.
- Changing the two-tool MCP surface, storage keys, public API payload versions, consent store, or runtime security posture.
</domain>

<decisions>
## Implementation Decisions

### Canonical Current Baseline
- Total descriptors entering v1.1.0: 2,314.
- T1/T1b today: 26 descriptors across GitHub, GitLab, Notion, Reddit, and Slack.
- Actually executable/recipe-backed today: 21 descriptors.
- T1 fail-closed guarded writes today: 5 descriptors.
- Remaining T3 DOM/discovery-tail descriptors: 2,288.
- App stems with no direct T1 path: 123.

### Readiness Is a Proof State, Not Marketing Copy
- A descriptor is T1-ready only if `resolve(slug, origin)` reaches a bundled handler or declarative recipe path and the descriptor has required test coverage.
- A fail-closed guarded write may resolve T1a but is not executable until live mutation-body UAT proves the endpoint. It must appear as guarded/fail-closed, not ready.
- `backing:"dom"` and no backing are discovery-pending / DOM-tail, not direct API support.
- `backing:"learn"` is T2 learn-pending; a seed/hint never executes until a captured, consent-gated recipe is promoted.

### Status Terms
- **t1-ready:** direct handler/recipe can execute today.
- **t1-guarded-fail-closed:** routes through a T1 handler but intentionally returns `RECIPE_DOM_FALLBACK_PENDING` until UAT evidence exists.
- **learn-pending:** seeded or learned-on-visit candidate; inert until promoted.
- **discovery-pending:** catalog descriptor exists and may route to DOM/discovery fallback, but no direct API path exists.
- **blocked:** denylisted or otherwise disallowed.

### Consent Posture Carried Forward
- Capability invoke is open for non-denied origins under Auto.
- Denylisted origins remain blocked.
- Sensitive origins are flagged/audited rather than forced to Ask for ordinary invoke.
- Extra confirmation for sensitive origins remains scoped to network-capture discovery.

### Report Shape
- Prefer a checked-in generated markdown/JSON artifact under the phase directory for milestone evidence.
- Prefer a reusable script under `scripts/` for regeneration and CI.
- The report should be derived from committed catalog/runtime files, not a hand-maintained table.
</decisions>

<code_context>
## Existing Code Insights

- `extension/utils/capability-search.js` already normalizes `backing` and annotates search hits with `invocable` and `backingStatus`-style pending labels.
- `extension/utils/capability-catalog.js` owns `resolve()` tier routing. It seeds T1a handler modules, T1b recipes, T2 learned/seeded branches, and T3 DOM fallback.
- `scripts/coverage-report.mjs` is the closest predecessor for a full-corpus generated report. It plants `globalThis.FsbRecipeIndex`, seeds handlers, calls live `resolve()`, buckets by `backing`, and exits nonzero on dead slugs.
- `scripts/verify-catalog-crosscheck.mjs`, `scripts/verify-origin-classification.mjs`, and `scripts/verify-no-orphan-descriptor.mjs` are good CI-gate patterns: Node-builtins, dual export, CLI process exit.
- `package.json` wires structural guards through `npm run validate:extension`.
- `README.md` and `mcp/README.md` already mention the updated denylist/signature/audit posture, but Phase 44 should catch remaining wording that overclaims direct execution.

## Important Runtime Boundaries

- Do not change `FsbConsentPolicyStore`, `FsbConsentGate`, `network-capture` runtime semantics, or MCP schemas in this phase.
- Do not add new app-specific MCP tools.
- Do not weaken Wall 1 or Wall 2.
- Do not mark any descriptor T1-ready based on a descriptor field alone; readiness needs a resolvable executable path and tests.
</code_context>

<specifics>
## Specific Ideas

- Build `scripts/report-t1-readiness.mjs` as the authoritative matrix generator, modeled on `coverage-report.mjs`.
- Emit `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.md` and optionally `44-T1-READINESS.json`.
- Include app/service rollups: total descriptors, ready, guarded, learn-pending, discovery-pending, blocked, same-origin candidates, separate-origin candidates, unknown.
- Add tests for the classifier and report invariants before touching UI/docs text.
- Add a CI guard such as `scripts/verify-t1-readiness-gate.mjs` that fails on unproven T1-ready claims.
</specifics>

<deferred>
## Deferred Ideas

- Pattern-D separate-origin execution belongs to Phase 47.
- Google Workspace GAPI bridge belongs to Phase 47.
- Porting additional read descriptors belongs to Phases 46 and 48.
- Guarded-write activation belongs to Phase 49.
</deferred>

---

*Phase: 44-t1-readiness-inventory-status-surface*
*Context gathered: 2026-06-29*
