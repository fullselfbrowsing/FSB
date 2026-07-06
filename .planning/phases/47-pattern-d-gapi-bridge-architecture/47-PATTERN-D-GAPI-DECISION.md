# Phase 47 Pattern-D / GAPI Decision

## Decision

Do not ship Pattern-D or GAPI execution in this phase.

## Pattern-D

Status: `rejected-pending-explicit-bridge`

Pattern-D apps use separate-origin APIs, per-org subdomains, page globals, or auth carriers that are not expressible through the current same-origin `executeBoundSpec` model. Examples include Linear, Datadog/Jira, Supabase, Salesforce, and cloud consoles.

A future Pattern-D design must define:

- How credentials are scoped without replaying active-tab cookies to a different origin.
- How page-local tokens are contained and redacted.
- How consent distinguishes ordinary capability invoke from page-mediated bridge execution.
- How negative controls prove a wrong-origin bridge cannot execute.
- How writes/destructive calls remain fail-closed until live request evidence exists.

## GAPI

Status: `rejected-pending-gapi-consent-bridge`

Google Workspace API access through `window.gapi.client.request` is page-mediated and OAuth/token-state dependent. It does not fit the current closed bound-spec interpreter without a bridge that executes in the page runtime and governs token access explicitly.

A future GAPI design must define:

- The page bridge boundary for `window.gapi`.
- OAuth/token containment and no-secret logging proof.
- Consent UX for Google Workspace bridge execution.
- Per-app scopes and side-effect classification.
- Negative controls for unavailable `gapi`, wrong account, and denied/sensitive origins.

## Current Enforcement

`scripts/verify-pattern-d-gapi-gate.mjs` enforces the hold:

- Pattern-D/GAPI rows must remain `discovery-pending`.
- They must not carry handler/recipe proof.
- Separate-origin negative controls must classify fail-closed.

This keeps the milestone honest: Phase 48 can port more same-origin reads, but Pattern-D/GAPI activation remains a separate architecture story.
