# Phase 48: High-Value Read Ports - Second Batch - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 47 held Pattern-D and GAPI execution, so Phase 48 stays on same-origin read ports only. The goal is to make another measurable batch of descriptor slugs executable through reviewed T1a handlers without adding a cross-origin bridge, storage schema, MCP surface, or mutation path.

</domain>

<decisions>
## Implementation Decisions

- Use Vercel as the new app coverage win: its vendored runtime uses same-origin `/api${endpoint}` under `https://vercel.com`.
- Exclude `vercel.list_env_vars` because it can expose environment-variable metadata/values and needs separate review.
- Extend CircleCI reads that reuse the proven `https://app.circleci.com/api/v2` same-origin handler path.
- Keep all new operations GET-only with `same-origin-cookie` bound specs and typed DOM-fallback errors on logged-out or response-shape drift.
- Do not change Pattern-D, GAPI, MCP schemas, consent storage, public APIs, package versions, or write/destructive behavior.

</decisions>

<code_context>
## Existing Code Insights

- Handler modules self-register through `FsbCapabilityCatalog.registerHandler`.
- `HEAD_HANDLER_MODULES` is the authoritative service-worker seed list and is parsed by origin-classification tests.
- `capability-search.js` needs an explicit `T1_READY_SLUGS` override for descriptors still marked `backing:'dom'`.
- `scripts/report-t1-readiness.mjs`, `scripts/verify-origin-classification.mjs`, `scripts/verify-recipe-path-guard.mjs`, and `scripts/verify-t1-port-contract.mjs` all need handler-module awareness.
- The regenerated Phase 44 readiness matrix is the milestone coverage report.

</code_context>

<specifics>
## Target Batch

Vercel:

- `vercel.get_user`
- `vercel.list_teams`
- `vercel.list_projects`
- `vercel.get_project`
- `vercel.list_deployments`
- `vercel.get_deployment`
- `vercel.list_domains`

CircleCI:

- `circleci.get_pipeline`
- `circleci.get_pipeline_workflows`
- `circleci.get_workflow`
- `circleci.get_workflow_jobs`
- `circleci.get_job`
- `circleci.get_job_artifacts`
- `circleci.get_job_tests`

</specifics>

<deferred>
## Deferred Ideas

- Pattern-D and GAPI execution remain disabled by the Phase 47 gate.
- Vercel environment-variable reads remain deferred.
- Additional CircleCI reads such as contexts, schedules, metrics, flaky tests, and config are same-origin candidates but need separate endpoint/shape review.
- Writes/destructive operations remain DOM/discovery-only or guarded fail-closed until mutation-body UAT exists.

</deferred>
