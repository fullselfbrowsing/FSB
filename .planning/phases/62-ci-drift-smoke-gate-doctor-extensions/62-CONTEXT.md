# Phase 62: CI Drift-Smoke Gate & Doctor Extensions - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning
**Mode:** Recommended defaults selected under the standing autonomous instruction

<domain>
## Phase Boundary

Phase 62 makes the already-shipped adapter contract observable and drift-resistant. It introduces one daemon-owned machine-readable compatibility matrix, an offline fixture replay gate for every shipped adapter, per-adapter `doctor` diagnostics, a sanitized rate-limited `agent_protocol_drift` sink, and data-only `supported` / `degraded` / `unsupported` badges in Providers.

This phase does not add a sixth adapter method, implement OpenCode or Codex, capture a live CLI stream, add native messaging or daemon wake, change provider selection/recommendation, broaden spawn authority, or hardcode CLI versions in extension source. OpenCode/Codex extend the same matrix and drift harness in Phases 64/65; the optional wake host remains Phase 63.

</domain>

<decisions>
## Implementation Decisions

### Compatibility Matrix Authority and Status Semantics

- Maintain one versioned, exact-shape compatibility matrix in daemon/MCP source as the canonical authority. CI, `doctor`, the serve-side compatibility request, and tests import the same module; generated copies and extension-local version tables are prohibited.
- The matrix has one row per shipped adapter and includes only bounded product metadata needed for compatibility: canonical adapter id, display label, profile/schema version, minimum version, tested-through version, supported major, fixture manifest reference, required provider-native init/result fields, and the expected normalized sequence. Phase 62 ships only the Claude Code row; future adapters add rows without changing the schema.
- Classify a detected version as `supported` only inside the explicitly fixture-tested inclusive range. A parseable version newer than `testedThrough`, on the same supported major and not below `minimum`, is `degraded` (unverified, not claimed supported). Missing/unparseable versions, versions below minimum, wrong-major versions, unshipped adapters, and invalid/missing matrix evidence are `unsupported`.
- Compatibility status is observational and cannot elevate authority. It never auto-selects a provider, changes the existing recommendation cascade, bypasses detector/supervisor checks, or converts connected/installed/clicked evidence into spawn permission.
- The extension receives the daemon-classified status and bounded safe matrix projection; it does not parse semver or know a CLI version constant. A valid cached snapshot may render at boot with `checkedAt`; once stale it is visibly downgraded to `degraded`, and absent/corrupt evidence fails to `unsupported` rather than inventing support.

### Offline Drift-Smoke and CI Gate

- Build a provider-neutral fixture harness that enumerates `registry.ids()` / matrix rows and replays each row's committed JSONL fixture through the production adapter parser. No live CLI, network, account, or browser is required in CI.
- The fixture manifest is authoritative for its honest provenance and expected sequence. Phase 60's `schema-derived-contract` / `liveCapturePending: true` labels remain unchanged until milestone-end live UAT; the drift gate must not relabel that fixture as a genuine capture.
- For every shipped adapter, assert the known provider-native event sequence, required fields on the raw `system/init` and `result` shapes, the expected normalized sequence, exactly one terminal result, and the matrix/profile/fixture version agreement.
- Include deterministic negative controls for an unknown top-level event, unknown required subtype, missing init/result fields, duplicate/missing result, malformed/oversized input, and versions below/above matrix bounds. Every negative case must fail with typed `agent_protocol_drift` or the closed compatibility classification, never silent drop, retry, replay, or fabricated success.
- Add one named CI step and one serial root-suite entry that invoke the same fail-closed harness. The CI job expands automatically as rows are added in Phases 64/65; a shipped registry id without a complete matrix/fixture row fails the build.

### Doctor Diagnostics and Secret Metadata

- Extend the existing local `fsb-mcp-server doctor` snapshot rather than creating another command. Human output gets one stable per-adapter section; `doctor --json` adds the same closed machine-readable adapter diagnostics and compatibility matrix.
- Collect each adapter through the production registry and `detect()` path. Report canonical id, retained binary real path (or `not found`), detected version, compatibility status/reason, auth state, and profile version. Claude Code auth remains `unknown` / `Not reported` because its CLI exposes no approved parseable auth probe; do not infer auth from installation, config files, environment, or account data.
- Report only `sharedSecretPresent`, `secretRotatedAt`, and `secretRotationAgeMs` from the existing private bridge/session-auth state. Never return or log the secret, session id, fingerprint, protocol token, task data, environment, or private runtime contents. The human label may call this the daemon spawn-channel secret so the operator understands the relationship without exposing it.
- Adapter collection is local and independent of extension attachment, so useful binary/version/auth/secret diagnostics remain available when the bridge or extension is offline. Preserve the current overall doctor exit-code/layer behavior for compatibility; per-adapter rows carry their own status instead of silently changing historical command semantics.
- Text and JSON are two projections of one validated snapshot. Unknown fields, prototype keys, overlong strings, invalid paths, invalid timestamps, and matrix/schema mismatch fail closed to a bounded diagnostic row.

### Drift Diagnostics Ring

- Runtime adapter drift remains a delegation-domain terminal (`agent_protocol_drift`) and does not expand Phase 59's exact transport error union. The affected child is stopped exactly once and no success/result is fabricated.
- Route each runtime drift into the existing extension diagnostics path through `rateLimitedWarn`, using one stable 10-second bucket per canonical adapter. A chatty adapter therefore contributes at most one ring entry per 10 seconds; reconnect, panel reopen, and duplicate terminal delivery do not multiply entries.
- Store only the closed fields `adapterId`, `expected`, and `observed`, where expected/observed are bounded field/type names or shape labels. Raw JSONL lines, prompt text, browser content, tool arguments/results, filesystem paths, credentials, secrets, and provider-native payload fragments are never representable in the diagnostic context.
- Reuse the existing 100-entry FIFO and independent sink redaction. Missing diagnostics helpers remain best-effort and cannot crash cancellation/settlement; tests inject the reporter and fake clock to prove classification, redaction, and duplicate suppression.

### Extension Transport, Persistence, and Providers Badges

- Add a separate authenticated additive compatibility/status request (for example `adapter.compatibility`) rather than overloading Phase 61's strict lifecycle-authoritative `delegate.status`. The bridge may request it at cold boot and on the existing Providers manual refresh path; the extension never executes the `doctor` CLI or a shell command.
- Background is the sole transport/storage authority. It exact-shape validates the bounded safe projection, stores one snapshot with schema version and `checkedAt`, and fans out a data-only refresh result. Binary paths and secret metadata stay in local doctor output and never cross into extension storage or UI.
- Extend the Phase 57 `fsbAgentProviders` envelope compatibly with a dedicated compatibility snapshot while preserving clicked/connected/installed submaps and unknown keys. Storage rejection or malformed daemon data retains no newly asserted support and surfaces a stale/unsupported state without altering saved provider settings.
- Providers renders a visible text badge plus semantic icon/tone for exactly `Supported`, `Degraded`, or `Unsupported`. Compatibility is separate from the existing `Connected now` / `Installed` / `Seen before` / `Not installed`, auth, billing, selected, and single `Recommended` labels.
- `Degraded` remains selectable but warns that the installed CLI is newer than the fixture-tested range or the snapshot is stale. `Unsupported` does not fabricate setup success; existing preflight/detector authority remains the final start gate. Badge refresh never auto-selects, reorders rows, changes unsaved form state, or touches API provider data.
- Reuse existing Providers row structure, theme tokens, live-region/status patterns, focus behavior, and manual refresh affordance. Status meaning uses text as well as color; compact/narrow/dark/reduced-motion behavior receives a Phase 62 UI contract and deterministic source/DOM tests.

### Compatibility, Security, and Verification

- Preserve the five-method `AgentProviderAdapter`, exact five Phase 59 transport errors, frozen MCP tool schemas/messages, Phase 61 delegation status authority, seven API providers, and all existing provider selection/recommendation semantics.
- Keep the extension free of `nativeMessaging`, process, shell, execute, restart, and daemon-wake capability through Phase 62. The compatibility request is read-only data and grants no spawn authority.
- Every new object is closed, versioned, bounded, prototype-safe, and secret-free. Matrix or fixture disagreement fails CI and doctor status; extension parsing failure cannot default to supported.
- Automated/source verification, full repository tests, artifact/key-link checks, and clean code/security/UI reviews remain blocking. Any live installed-version doctor corroboration and rendered browser/accessibility checks are recorded as `human_needed` and deferred to the single milestone-end UAT sweep without fabricated passes.

### the agent's Discretion

- Exact module filenames, schema-version spelling, the bounded freshness interval, diagnostic reason codes, and the additive compatibility request name may follow existing MCP/extension conventions.
- The matrix may use exact semantic-version tuples or a small pure comparator, provided the extension never receives comparator logic or hardcoded CLI versions and all boundary cases are tested.
- The Providers badge may sit beside the provider name or in the existing status cluster, provided selection, recommendation, availability, auth, billing, and compatibility remain distinguishable and accessible.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `mcp/src/agent-providers/registry.ts` already exposes the closed shipped-adapter roster; `adapter.ts` supplies detection/auth/diagnostic types; `claude-detect.ts` supplies shell-free retained-path and version detection.
- `tests/fixtures/agent-streams/claude-code-2.1.177/manifest.json` already records expected normalized sequence, fixture/profile version, sanitization, and honest provenance; `mcp-agent-stream-fixture.test.js` and `claude-stream.ts` already exercise production parsing and typed drift.
- `mcp/src/diagnostics.ts` and `mcp/src/index.ts` already build and format text/JSON `doctor` snapshots. `mcp/src/bridge-auth.ts` owns private auth state and `rotatedAt` metadata.
- `extension/utils/redactForLog.js` already supplies the one-per-prefix/category/10-second `rateLimitedWarn` path into `extension/utils/diagnostics-ring-buffer.js`, whose sink is bounded, FIFO, and independently secret-scrubbed.
- `extension/utils/mcp-agent-providers.js`, `extension/ui/providers-panel.js`, and `extension/ui/options.js` already own merged evidence, exact provider status, recommendation, and manual refresh behavior.

### Established Patterns

- Provider and adapter vocabularies are closed and exact; unknown identities remain visible but non-authoritative.
- Background/daemon sources own authority and persistence; UI modules consume bounded projections and never infer lifecycle, auth, billing, or selection truth.
- Additive bridge contracts use exact-shape validation, bounded strings/arrays, current authenticated routes, and no replay on topology changes.
- Generated or cached evidence retains freshness/provenance labels; absence and corruption fail closed rather than becoming optimistic success.
- Root tests are serial, source-pin heavy, and guarded by a workspace-preserving full-suite wrapper because generated artifacts and unrelated user changes may already be dirty.

### Integration Points

- Extend daemon doctor collection/formatting in `mcp/src/diagnostics.ts` and `mcp/src/index.ts` from the production adapter registry and bridge-auth metadata.
- Add the canonical matrix and generalized fixture gate beside `mcp/src/agent-providers/`, then wire it into root tests and `.github/workflows/ci.yml`.
- Carry the safe matrix projection over one authenticated read-only reverse method through `mcp/src/agent-providers/serve-delegation.ts`, `mcp/src/bridge.ts`, `extension/ws/mcp-bridge-client.js`, and `extension/background.js` without weakening Phase 61 gates.
- Persist and merge compatibility evidence in `extension/utils/mcp-agent-providers.js`; render it through `providers-panel.js` / `options.js` / existing Providers markup and CSS.
- Report sanitized runtime drift from the existing background terminal-event path near `agent_protocol_drift`, using `rateLimitedWarn` rather than a second ring implementation.

</code_context>

<specifics>
## Specific Ideas

- Keep one canonical matrix row for Claude Code 2.1.177 and make adding OpenCode/Codex rows in Phases 64/65 a data-plus-fixture operation, not a new CI architecture.
- Use exact user-facing compatibility labels: `Supported`, `Degraded`, and `Unsupported`; retain `Not reported` for Claude auth until an approved parseable signal exists.
- Keep local doctor rich enough for an operator, but send only the safe compatibility projection to the browser.

</specifics>

<deferred>
## Deferred Ideas

- Native host install/wake/uninstall and `nativeMessaging` permission remain Phase 63.
- OpenCode server/attach behavior and its matrix/fixture row remain Phase 64.
- Codex OAuth/API/unauthenticated detection and its matrix/fixture row remain Phase 65.
- Genuine Claude JSONL provenance, live doctor/path/version corroboration, and rendered Providers badge/accessibility checks remain in the milestone-end UAT sweep.

</deferred>
