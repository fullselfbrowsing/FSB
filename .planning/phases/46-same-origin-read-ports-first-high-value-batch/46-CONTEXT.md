# Phase 46: Same-Origin Read Ports - First High-Value Batch

**Gathered:** 2026-06-29
**Status:** Ready for implementation

<domain>
## Phase Boundary

Convert a first batch of high-value read descriptors from T3/discovery-pending to executable T1a only when the authenticated web runtime uses same-origin APIs that preserve Wall 2.

The batch is deliberately narrow:

- Netlify reads use `https://app.netlify.com/access-control/bb-api/api/v1`.
- Bitbucket reads use `https://bitbucket.org/!api/2.0`.
- CircleCI reads use `https://app.circleci.com/api/v2`.

All three vendored runtimes declare relative API bases in `<app>-api.ts`, so the execution path is first-party, cookie-backed, and suitable for `ctx.executeBoundSpec`.
</domain>

<decisions>
## Implementation Decisions

- Port 10 read descriptors across 3 apps: Netlify x4, Bitbucket x3, CircleCI x3.
- Keep every new handler read-only and same-origin pinned.
- Do not add MCP tools, descriptor schema changes, storage keys, public APIs, or package version changes.
- Extend the origin classifier only for relative vendored API bases joined to the reviewed handler origin.
- Defer apps that require page-local tokens, CSRF reads, workspace bridges, or separate-origin execution to later phases.
</decisions>

<code_context>
## Existing Code Insights

- T1a heads live in `catalog/handlers/*.js` and are mirrored into `extension/catalog/handlers/*.js`.
- The service worker imports handler files after `capability-catalog.js`, then calls `seedHeadHandlers()`.
- Search readiness uses `T1_READY_SLUGS` in `extension/utils/capability-search.js`.
- The Phase 45 port contract gate loads handler mappings from `scripts/verify-t1-port-contract.mjs`.
- The origin classifier previously handled absolute vendored bases, Slack dynamic workspace, and the Notion app-origin override; relative API bases needed an explicit same-origin join path.
</code_context>

<specifics>
## Selected Slugs

- `netlify.list_sites`
- `netlify.get_site`
- `netlify.list_deploys`
- `netlify.list_forms`
- `bitbucket.list_workspaces`
- `bitbucket.list_repositories`
- `bitbucket.get_repository`
- `circleci.get_current_user`
- `circleci.list_pipelines`
- `circleci.get_project`
</specifics>

<deferred>
## Deferred Candidates

- Todoist and LeetCode need page-local tokens/CSRF handling and were not ported in this same-origin read batch.
- Airbnb, Amplitude, Cloudflare, Shortcut, and similar candidates need more runtime-specific proof and are better handled after Pattern-D/GAPI architecture work.
- Live credential smoke for Netlify/Bitbucket/CircleCI remains optional evidence; no credentials were available in this headless run.
</deferred>
