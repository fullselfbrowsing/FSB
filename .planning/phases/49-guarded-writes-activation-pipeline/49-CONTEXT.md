# Phase 49: Guarded Writes Activation Pipeline - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 49 is about activation discipline for write/destructive capabilities. It must not promote a guarded write unless there is live mutation-body evidence, consent/audit proof, and a redacted loaded-extension smoke. If no guarded write meets that bar, the phase should explicitly preserve fail-closed behavior and add reusable evidence tooling.

</domain>

<decisions>
## Implementation Decisions

- Do not activate GitHub, GitLab, or Slack breadth guarded writes in this phase.
- Treat the four Notion writes as active because they already have 2026-06-29 loaded-extension UAT in Phase 41.
- Treat `slack.chat.postMessage` as a legacy active hand-head, not precedent for activating `slack.send_message`.
- Add a machine-checked write activation evidence ledger under `catalog/`.
- Wire a verifier into `npm run validate:extension` so unrecorded write activations fail CI.
- Add a reusable live-UAT template that records method/path/body shape and token/CSRF location without storing secrets.

</decisions>

<code_context>
## Existing Code Insights

- `scripts/verify-t1-port-contract.mjs` already fails if an active write is not listed in `ACTIVE_WRITE_UAT_SLUGS`.
- `tests/guarded-write-failclosed.test.js` proves guarded write handlers do not call `executeBoundSpec`.
- `catalog/handlers/github.js`, `catalog/handlers/gitlab.js`, and `catalog/handlers/slack.js` expose fail-closed guarded writes with explicit reasons.
- The Phase 44 readiness report identifies five active write rows and five guarded fail-closed rows.

</code_context>

<specifics>
## Current Write State

Active write rows:

- `notion.create_page`
- `notion.update_page`
- `notion.create_database`
- `notion.create_database_item`
- `slack.chat.postMessage`

Guarded fail-closed rows:

- `github.issues.create`
- `gitlab.create_issue`
- `gitlab.create_merge_request`
- `gitlab.create_note`
- `slack.send_message`

</specifics>

<deferred>
## Deferred Ideas

- Future activation of any guarded write requires filling `49-LIVE-UAT-TEMPLATE.md`, updating `catalog/write-activation-evidence.json`, implementing the handler flip, and passing the write evidence gate.
- No new write/destructive runtime behavior is shipped by this phase.

</deferred>
