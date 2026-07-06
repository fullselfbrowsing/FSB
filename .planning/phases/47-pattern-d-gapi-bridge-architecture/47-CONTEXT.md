# Phase 47: Pattern-D + GAPI Bridge Architecture

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 47 decides whether separate-origin, per-org-subdomain, page-bridge, or GAPI-mediated apps can safely move toward T1 without breaking the active-tab credential boundary.

Current inventory:

- Pattern-D candidates: 337 discovery-pending rows.
- GAPI bridge candidates: 133 discovery-pending rows.

The current substrate is still same-origin bound-spec execution. `executeBoundSpec` pins the active tab origin before any page execution, while the build-time origin classifier rejects head modules whose vendored API base is separate-origin.
</domain>

<decisions>
## Implementation Decisions

- Do not implement generic Pattern-D execution in this phase.
- Do not implement a Google Workspace `window.gapi` bridge in this phase.
- Record both as explicit rejections pending a dedicated, user-approved page-bridge design.
- Add a CI gate proving Pattern-D/GAPI candidates remain discovery-pending and cannot silently gain handler/recipe proof.
- Reuse existing runtime negative controls for origin mismatch and consent no-side-effect behavior.
</decisions>

<code_context>
## Existing Code Insights

- `scripts/verify-origin-classification.mjs` rejects separate-origin heads at build time.
- `extension/utils/capability-interpreter.js` rejects effective cross-origin targets with `RECIPE_ORIGIN_MISMATCH`.
- `extension/utils/capability-fetch.js` rejects active-tab/spec-origin mismatch before `chrome.scripting.executeScript`.
- `extension/utils/capability-router.js` routes T3 rows to `RECIPE_DOM_FALLBACK_PENDING` without executing DOM tools.
- `scripts/lib/t1-port-contract.mjs` already treats separate-origin candidates as execution-disabled checklists.
</code_context>

<specifics>
## Architecture Outcome

Pattern-D and GAPI are held, not activated:

- Pattern-D status: `rejected-pending-explicit-bridge`.
- GAPI status: `rejected-pending-gapi-consent-bridge`.
- `executionEnabled:false` for both classes.

The next phase can still port same-origin reads. Pattern-D/GAPI rows require a future bridge design that defines token containment, consent UX, negative controls, and page-script boundaries.
</specifics>

<deferred>
## Deferred Work

- A dedicated Pattern-D bridge design for separate-origin APIs such as Linear, Datadog, Jira/Atlassian, Supabase, and cloud consoles.
- A dedicated GAPI bridge design for Docs, Drive, Calendar, Sheets, and Gmail.
- Any activation of write/destructive bridge paths.
</deferred>
