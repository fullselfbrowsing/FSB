# Phase 45: T1 Porting Scaffold + Handler Contract Hardening - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning and execution
**Mode:** Autonomous, using Phase 44 readiness output as the input surface

<domain>
## Phase Boundary

Phase 45 builds infrastructure for future T1 ports. It does not port a new app, activate new writes, change the MCP schema, weaken origin pinning, or change consent semantics.

The phase must make future ports repeatable:

- Same-origin reads need origin pinning, `executeBoundSpec` execution, closed params, logged-out/body-shape fallback, no secret logging, router parity, and byte-stable fallback reasons.
- Same-origin writes need the same proof set, plus either redacted live mutation-body UAT before activation or an inert fail-closed handler.
- Separate-origin candidates need explicit non-executable status and negative controls until Pattern-D/GAPI is approved in a later phase.

</domain>

<decisions>
## Implementation Decisions

### Contract as Testable Data

The reusable scaffold should be a small library and CLI, not a runtime feature. Future port work can generate a checklist for a slug, fill in proof fields, and feed those proof fields to shared validator tests.

### Current Catalog Gate

The verifier should use the generated Phase 44 readiness model as the source of truth. It should validate current handler rows for origin/handler/source safety and dynamically prove every guarded fail-closed write keeps the `executeBoundSpec` recorder empty.

### No Runtime Expansion

The phase may add tests/scripts/docs only. It must not add OpenTabs runtime code, per-app MCP tools, new storage, new public API, or Pattern-D execution.

</decisions>

<code_context>
## Existing Code Insights

- `scripts/report-t1-readiness.mjs` already classifies rows as `t1-ready`, `t1-guarded-fail-closed`, `learn-pending`, `discovery-pending`, or `blocked`.
- Current guarded writes are GitHub, GitLab, and Slack rows; Notion writes are active only because live UAT verified `app.notion.com` `saveTransactions`.
- `tests/guarded-write-failclosed.test.js` proves the current hard-coded fail-closed set, but Phase 45 needs a generalized guard sourced from readiness rows.
- `tests/capability-head-handlers.test.js` already contains source scans for existing handlers; Phase 45 should extract the reusable checks for future ports instead of only relying on per-app tests.
- `validate:extension` is the right lightweight CI hook for this contract gate.

</code_context>

<specifics>
## Specific Ideas

- Add `scripts/lib/t1-port-contract.mjs` with reusable port contract validation, handler-source checks, guarded-write recorder helpers, and checklist rendering.
- Add `scripts/scaffold-t1-port.mjs` so a future engineer can generate a checklist for a slug/type before writing the handler.
- Add `scripts/verify-t1-port-contract.mjs` and wire it into `npm run validate:extension`.
- Add focused zero-framework tests for the contract library and verifier negative controls.
- Add a Phase 45 porting contract document with usage examples.

</specifics>

<deferred>
## Deferred Ideas

- New app ports start in Phase 46.
- Pattern-D/GAPI cross-origin mechanics start in Phase 47.
- Live write activation workflow is Phase 49.
- The old GitHub/Slack/Notion/GitLab handler comments are not rewritten wholesale here; comment hygiene is outside this phase unless a test would fail without it.

</deferred>
