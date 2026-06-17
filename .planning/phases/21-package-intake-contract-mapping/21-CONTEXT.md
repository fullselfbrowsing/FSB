# Phase 21: Package Intake & Contract Mapping - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 21 approves the immutable PhantomStream package source, proves the exported package surface through executable smoke tests, and records the FSB-to-PhantomStream contract map that later phases must preserve. It does not replace production capture, renderer, relay, or remote-control code yet.

</domain>

<decisions>
## Implementation Decisions

### Package Source And Pinning
- Use the published package `@full-self-browsing/phantom-stream@0.1.0` as the approved source. The prior unhyphenated name `@fullselfbrowsing/phantom-stream` remains a 404 and should be treated as a stale planning reference.
- Pin the dependency exactly, with lockfile integrity recorded as `sha512-Hf6K0bjAT5M9dUs7Xw1NB2Cb8hkmiMz7KDO0rq5mRkDKmQnLY1sTqTXwIX2r5gjLKVkl3TCemr3hSucVc1k69g==`.
- Do not use a GitHub or tarball fallback unless the npm package becomes unavailable or smoke tests prove the registry package unusable.
- Record package provenance in a planning artifact and, if production dependency installation is performed, in `package-lock.json`.

### Export And Runtime Verification
- Verify imports in code/tests from `.`, `./protocol`, `./capture`, `./renderer`, `./relay`, `./transport/websocket`, `./adapters/extension`, and `./adapters/playwright` before any production migration phase depends on them.
- Treat README examples as guidance only; package exports and callable runtime symbols must be checked from the installed package.
- Include an ESM/MV3 feasibility check for extension-consumable surfaces before Phase 22 changes `extension/content/dom-stream.js`.
- If a required export or runtime shape is missing, Phase 21 must block later phases and document the missing surface instead of allowing speculative migration.

### Contract Map Scope
- Map all current FSB stream behaviors that must survive: snapshot, mutation diffs, scroll, overlays, dialogs, stale-session rejection, compression, relay, recovery, and remote control.
- Separate generic DOM-streaming mechanics owned by PhantomStream from FSB-owned product behavior: pairing, dashboard task/status traffic, overlay identity, diagnostics, room routing, and debugger ownership.
- Preserve both static and Angular dashboard contracts until Phase 23 proves a shared wrapper or equivalent parity layer.
- Preserve existing public MCP schemas exactly; DOM-stream internals are not an MCP contract change.

### the agent's Discretion
The agent may choose artifact names, smoke-test placement, and contract-map structure as long as the package source, export list, and migration invariants are explicit and machine-verifiable.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/content/dom-stream.js` contains the current capture/session/side-channel implementation that Phase 22 will adapt.
- `showcase/js/dashboard.js` and `showcase/angular/src/app/pages/dashboard/dashboard-page.component.*` are the two viewer surfaces that Phase 23 must keep aligned.
- `extension/ws/ws-client.js`, `extension/background.js`, and `showcase/server/src/ws/handler.js` own stream transport, relay, recovery, and role routing behavior that Phase 24 must preserve.
- Existing test suites around DOM stream, dashboard state, server relay/backpressure, and remote-control handlers are the first places to add Phase 21 smoke and contract coverage.

### Established Patterns
- Planning artifacts keep provenance and migration decisions in `.planning/` before production replacement.
- Package pinning should be proven through `package-lock.json`, exact versions, and direct smoke tests rather than README assumptions.
- FSB keeps user-gated browser UAT explicit; this phase should not fabricate live-browser evidence.

### Integration Points
- Production package dependency belongs in the repository root package metadata.
- Contract-map artifacts belong in the Phase 21 planning directory and should be referenced by later phase plans.
- Smoke tests should run under the existing Node test infrastructure and avoid browser-only assumptions unless explicitly marked as UAT.

</code_context>

<specifics>
## Specific Ideas

- Correct package name: `@full-self-browsing/phantom-stream`.
- Old package name still 404s: `@fullselfbrowsing/phantom-stream`.
- Registry tarball: `https://registry.npmjs.org/@full-self-browsing/phantom-stream/-/phantom-stream-0.1.0.tgz`.
- Registry integrity: `sha512-Hf6K0bjAT5M9dUs7Xw1NB2Cb8hkmiMz7KDO0rq5mRkDKmQnLY1sTqTXwIX2r5gjLKVkl3TCemr3hSucVc1k69g==`.

</specifics>

<deferred>
## Deferred Ideas

No production stream replacement in Phase 21. Capture, renderer, relay, and remote-control migration remain scoped to Phases 22-24.

</deferred>
