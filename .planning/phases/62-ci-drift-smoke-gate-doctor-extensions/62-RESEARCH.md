# Phase 62: CI Drift-Smoke Gate & Doctor Extensions - Research

**Researched:** 2026-07-15
**Domain:** Adapter compatibility authority, offline protocol-drift replay, local diagnostics, authenticated read-only projection, and Chrome MV3 status rendering
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

**Source for every item in this section:** [VERIFIED: `.planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-CONTEXT.md`]

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)

- Native host install/wake/uninstall and `nativeMessaging` permission remain Phase 63.
- OpenCode server/attach behavior and its matrix/fixture row remain Phase 64.
- Codex OAuth/API/unauthenticated detection and its matrix/fixture row remain Phase 65.
- Genuine Claude JSONL provenance, live doctor/path/version corroboration, and rendered Providers badge/accessibility checks remain in the milestone-end UAT sweep.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DRIFT-01 | A CI job runs each shipped adapter against a canned prompt fixture, asserts a known event-type sequence and the presence of required fields on `system/init` and `result`, and fails the build on unknown event types, missing fields, or a `--version` outside the compatibility matrix. | The existing production parser, registry roster, committed manifest/JSONL pair, serial root test chain, and CI jobs provide the complete seam for a generalized offline replay gate. [VERIFIED: `.planning/REQUIREMENTS.md`; `mcp/src/agent-providers/registry.ts`; `mcp/src/agent-providers/claude-stream.ts`; `tests/fixtures/agent-streams/claude-code-2.1.177/manifest.json`; `package.json`; `.github/workflows/ci.yml`] |
| DRIFT-02 | `fsb-mcp-server doctor` gains a per-adapter section reporting: binary path, version, auth state (parseable where the CLI exposes it), shared-secret presence, and the current spawn-secret rotation age. | `collectBridgeDiagnostics` and `formatDoctor` already form a single snapshot/projection path, while `readBridgeAuthState()` and adapter `detect()` expose the necessary private inputs before projection. [VERIFIED: `.planning/REQUIREMENTS.md`; `mcp/src/diagnostics.ts:422-506`; `mcp/src/index.ts:201-224`; `mcp/src/bridge-auth.ts:35-41,132-156`; `mcp/src/agent-providers/adapter.ts:34-40`] |
| DRIFT-03 | The diagnostics ring buffer classifies drift events as `agent_protocol_drift` (with adapter id, expected vs observed) and rate-limits duplicate entries at the existing 1-per-10s bucket. | The terminal code already crosses the daemon/background boundary, and the extension already has a redacted 100-entry FIFO plus a 10-second prefix/category warning limiter; a drift-specific pre-throttle is required because the generic helper currently appends every invocation. [VERIFIED: `.planning/REQUIREMENTS.md`; `mcp/src/agent-providers/spawn-supervisor.ts:524-532,933-949`; `extension/background.js:1516-1566`; `extension/utils/redactForLog.js:77-118`; `extension/utils/diagnostics-ring-buffer.js:13-18,119-151`] |
| DRIFT-04 | The `doctor` output includes a machine-readable adapter compatibility matrix that both CI and the extension can read to render "supported / degraded / unsupported" states without hardcoding versions in extension code. | A daemon-owned module can feed doctor, fixture replay, detection, and the authenticated reverse-request handler; the existing provider envelope, background runtime router, and Providers pure/UI helpers provide the extension-side data path. [VERIFIED: `.planning/REQUIREMENTS.md`; `mcp/src/agent-providers/serve-delegation.ts:124-160`; `extension/ws/mcp-bridge-client.js:608-692`; `extension/utils/mcp-agent-providers.js:92-151,228-293`; `extension/ui/providers-panel.js:138-219`; `extension/ui/options.js:947-995`] |
</phase_requirements>

## Summary

Phase 62 should be implemented as one authority with four projections: a pure daemon compatibility module, an offline fixture gate, local doctor diagnostics, and a secret-free browser snapshot. The repository already has the difficult primitives: a closed adapter registry, a production JSONL parser that throws typed `agent_protocol_drift`, an honestly labeled schema-derived fixture, an authenticated reverse-request channel, background-owned storage, and pure Providers rendering helpers. No new dependency or live CLI is required for the automated implementation. [VERIFIED: `mcp/src/agent-providers/registry.ts`; `mcp/src/agent-providers/claude-stream.ts`; `tests/fixtures/agent-streams/claude-code-2.1.177/manifest.json`; `extension/ws/mcp-bridge-client.js`; `extension/utils/mcp-agent-providers.js`; `extension/ui/providers-panel.js`]

The main refactor is to remove version policy from `claude-detect.ts` and make the canonical matrix/classifier its only source. Today the detector hardcodes both `2.1.177` constants and accepts every later semantic version, including another major; that cannot express the locked supported/degraded/unsupported rules. The detector may still treat same-major newer versions as installed/degraded so the existing detector/supervisor gate remains authoritative, but wrong-major, below-minimum, missing, and malformed evidence must fail closed. [VERIFIED: `mcp/src/agent-providers/claude-detect.ts:11-12,145-179,306-324`; `.planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-CONTEXT.md`]

The most important integration pitfall is diagnostics throttling. `rateLimitedWarn` suppresses repeated console warnings but intentionally calls the ring buffer on every invocation, so calling it directly for every drift would violate the locked maximum of one ring entry per adapter per 10 seconds. Introduce a small injected-clock drift reporter that owns the adapter bucket and invokes `rateLimitedWarn` only for the first event in each window; keep the existing generic helper and FIFO semantics unchanged. [VERIFIED: `extension/utils/redactForLog.js:77-118`; `tests/redact-for-log.test.js:88-126`; `.planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-CONTEXT.md`]

**Primary recommendation:** Build and validate one deeply frozen `adapter-compatibility` module first, then make detection, offline replay, doctor, serve projection, extension persistence, and UI consume its closed outputs in that order. [VERIFIED: repository seams cited throughout this research; locked authority in `62-CONTEXT.md`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Matrix shape, version comparison, compatibility reasons | MCP daemon / backend | — | Version authority must remain in daemon source and be imported by every trusted consumer. [VERIFIED: `62-CONTEXT.md`] |
| Registry-to-fixture completeness and parser replay | CI/test process | MCP production parser | The test process reads committed artifacts but delegates normalization to the shipped parser. [VERIFIED: `registry.ts`; `claude-stream.ts`; current fixture test] |
| Binary/version/auth collection and secret-age projection | MCP daemon / backend | Local filesystem auth state | `doctor` already owns local diagnostics; browser attachment is not required for these inputs. [VERIFIED: `diagnostics.ts`; `bridge-auth.ts`; `62-CONTEXT.md`] |
| Compatibility reverse request | Serve daemon | Authenticated WebSocket bridge | The request is additive/read-only and travels the existing authenticated `ext:*` channel. [VERIFIED: `serve-delegation.ts:133-160`; `mcp-bridge-client.js:608-692`] |
| Snapshot validation, freshness downgrade, persistence, fanout | Extension background service worker | `chrome.storage.local` | Background is the existing composition/storage authority; UI must not infer daemon truth. [VERIFIED: `background.js:8536-8554`; `mcp-agent-providers.js:92-151`; `62-CONTEXT.md`] |
| Compatibility presentation | Providers UI / client | Pure Providers helper | UI renders daemon-classified data separately from availability, billing, auth, selection, and recommendation. [VERIFIED: `providers-panel.js:150-219`; `options.js:590-794`; `62-CONTEXT.md`] |
| Runtime drift sink | Extension background service worker | Existing diagnostics FIFO | Terminal classification reaches background; the sink already provides bounded, independently scrubbed storage. [VERIFIED: `background.js:1516-1566`; `diagnostics-ring-buffer.js:91-151`] |

## Standard Stack

### Core

| Component | Version / contract | Purpose | Why Standard Here |
|-----------|--------------------|---------|-------------------|
| TypeScript | `5.9.3` declared in MCP dev dependencies | Canonical matrix, classifier, doctor snapshot, serve projection | The MCP daemon is already strict TypeScript targeting ES2022. [VERIFIED: `mcp/package.json`; `mcp/tsconfig.json`] |
| Zod | `^3.24.0` already installed in MCP | Validate provider-native event shapes; optionally validate new closed snapshot inputs | The production parser already uses strict Zod schemas and typed issue paths. Do not add a second schema package. [VERIFIED: `mcp/package.json`; `claude-stream.ts:1,20-94,127-137`] |
| Node assertion-script tests | serial CommonJS/ESM scripts | Compatibility boundaries, fixture replay, doctor, bridge, storage, and UI DOM/source contracts | Root `npm test` is an explicit serial chain and already builds MCP before adapter tests. [VERIFIED: `package.json` test script] |
| Chrome MV3 classic scripts | Chrome `>=116` project contract | Background authority, local persistence, Providers rendering | The current extension utilities/UI are classic global scripts and existing tests execute them in VM/DOM harnesses. [VERIFIED: `package.json`; `mcp-agent-providers.js`; `providers-panel-ui.test.js`] |

### Supporting

| Component | Version / contract | Purpose | When to Use |
|-----------|--------------------|---------|-------------|
| Existing `AdapterRegistry` | one canonical `claude-code` row in Phase 62 | Enumerate shipped adapters and require completeness | Use in doctor and the generalized fixture gate; future phases extend `CANONICAL_IDS`. [VERIFIED: `registry.ts:35-105`; `62-CONTEXT.md`] |
| Existing `rateLimitedWarn` + diagnostics FIFO | 10-second console bucket; 100 stored entries | Sanitized drift reporting | Invoke only through a drift-specific per-adapter pre-throttle because the generic helper stores every call. [VERIFIED: `redactForLog.js:77-118`; `diagnostics-ring-buffer.js:13-18,119-151`] |
| Existing full-suite guard | `node scripts/run-phase60-full-tests.mjs` | Preserve dirty user files/generated artifacts while running the repository suite | Use for the phase gate after focused tests pass. [VERIFIED: `scripts/run-phase60-full-tests.mjs`; Phase 61 execution history in `.planning/STATE.md`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Small pure daemon comparator | Add a semver package | A package is unnecessary for the locked three-integer range policy and would create another dependency surface; the comparator must be exhaustively boundary-tested. [VERIFIED: `62-CONTEXT.md` explicitly permits a small pure comparator; current detector already parses three components in `claude-detect.ts:145-179`] |
| Canonical matrix import | Generated JSON copied into extension | Prohibited because copies drift; the browser should receive a daemon-classified safe projection over the authenticated route. [VERIFIED: `62-CONTEXT.md`] |
| Existing doctor command | New adapter-doctor command | Prohibited; the stable human and JSON projections must extend the existing snapshot. [VERIFIED: `62-CONTEXT.md`; `index.ts:360-374`] |

**Installation:** None. Phase 62 should add no dependency. [VERIFIED: all required libraries/runtimes are already declared in `package.json` and `mcp/package.json`]

## Architecture Patterns

### System Architecture Diagram

```text
                         committed manifest + JSONL
                                      |
registry.ids() ---> canonical matrix -+--> completeness/version checks
      |                               |              |
      +--> production adapter parser <+------ offline replay
                                                     |
                                               named CI/root gate

local adapter detect() ---> daemon classifier ---> validated doctor snapshot
         |                         |                  |        |
         |                         |                  |        +--> human text
bridge-auth private state ---------+                  +----------> doctor --json
  (project only present/age; never secret/session id)

daemon classifier ---> secret-free safe projection ---> authenticated adapter.compatibility
                                                            |
                                               extension background validator
                                                            |
                                            chrome.storage.local cached snapshot
                                                            |
                                             merged provider compatibility row
                                                            |
                                     Supported / Degraded / Unsupported badge

production parser drift ---> exact-once supervisor terminal ---> background drift reporter
                                                                     |
                                                        per-adapter 10s pre-throttle
                                                                     |
                                                            rateLimitedWarn
                                                                     |
                                                        existing redacted FIFO (100)
```

The data flow keeps local paths and secret metadata on the daemon side, sends only a closed compatibility projection to background, and gives UI no classification or spawn authority. [VERIFIED: `62-CONTEXT.md`; current bridge/background/UI boundaries]

### Recommended Project Structure

```text
mcp/src/agent-providers/
├── compatibility.ts          # matrix, exact validator, pure comparator/classifier, safe projection
├── claude-detect.ts          # detection mechanics; imports matrix policy instead of constants
├── registry.ts               # shipped roster used by doctor and drift gate
└── serve-delegation.ts       # exact empty-payload read-only compatibility method
mcp/src/
├── diagnostics.ts            # one validated doctor snapshot, injected local collectors
└── index.ts                  # text/JSON projections only
extension/
├── background.js             # sole request/validation/persistence authority and drift reporting
├── utils/mcp-agent-providers.js # exact cached compatibility envelope + merge
├── ui/providers-panel.js     # pure compatibility presentation model
└── ui/options.js             # DOM projection and existing manual refresh path
tests/
├── mcp-adapter-compatibility.test.js
├── mcp-agent-drift-smoke.test.js
├── mcp-diagnostics-status.test.js
├── adapter-compatibility-storage.test.js (or extend the existing provider-storage test)
└── provider/bridge/UI tests already in the root serial chain
```

This mapping follows existing ownership rather than introducing another daemon, port, command, UI store, or ring. [VERIFIED: `diagnostics.ts`; `index.ts`; `serve-delegation.ts`; `mcp-agent-providers.js`; `options.js`; `62-CONTEXT.md`]

### Pattern 1: One Validated Matrix, Multiple Projections

**What:** Export a deeply frozen exact matrix plus pure functions that validate it, locate one canonical row, parse/classify a daemon-side detected version, and create a safe browser projection. Keep raw matrix paths/required-field contracts available to CI and doctor; omit binary/secret/fixture-path data from the browser projection. [VERIFIED: locked matrix and browser-projection decisions in `62-CONTEXT.md`]

**When to use:** Detection, doctor collection, fixture replay, serve request, and boundary tests must all import this module. [VERIFIED: `62-CONTEXT.md`]

```typescript
// Pattern derived from the repository's frozen exact contracts in adapter.ts/registry.ts.
export type CompatibilityStatus = 'supported' | 'degraded' | 'unsupported';

export function classifyAdapterVersion(
  adapterId: string,
  detectedVersion: string | null,
  matrix: unknown = ADAPTER_COMPATIBILITY_MATRIX,
): AdapterCompatibilityResult {
  // 1. exact-validate matrix and canonical row
  // 2. parse bounded x.y.z in daemon code only
  // 3. return one closed status/reason; never throw raw input into output
}
```

The current detector's `CLAUDE_MINIMUM_VERSION`, `CLAUDE_PROFILE_VERSION`, and numeric minimum tuple should be replaced by imports/derived policy from this module so there is no second authority. [VERIFIED: `claude-detect.ts:11-12,171-179`]

### Pattern 2: Registry/Matrix/Fixture Bijection

**What:** The fixture gate must compare sorted canonical IDs from all three sources before replaying: registry IDs, matrix row IDs, and fixture-manifest references. Any missing, duplicate, extra, malformed, or version-disagreeing row fails before parser assertions. [VERIFIED: `registry.ts:49-57,87-91`; locked completeness rules in `62-CONTEXT.md`]

**When to use:** Every invocation of the named Phase 62 drift-smoke test. Future OpenCode/Codex phases should need only a registry row, a matrix row, an adapter parser, and one committed fixture directory. [VERIFIED: `62-CONTEXT.md`]

### Pattern 3: One Doctor Snapshot, Two Renderers

**What:** Extend `BridgeDiagnostics` (or rename it compatibly) with one closed adapter diagnostics section and projected secret-age metadata. Collect local adapter/auth data before attempting bridge attachment; keep `formatDoctor()` a pure formatter and keep `--json` as `JSON.stringify` of the same snapshot. [VERIFIED: `diagnostics.ts:52-76,422-506`; `index.ts:201-224,360-374`]

**When to use:** `doctor`, including when the extension/bridge is offline. Preserve `diagnosticLayer` ordering and its existing exit-code mapping. [VERIFIED: `diagnostics.ts:354-399`; `index.ts:373`; `62-CONTEXT.md`]

### Pattern 4: Background-Owned Refresh with Monotonic Fail-Closed Persistence

**What:** One background function issues the exact empty-payload compatibility request, exact-validates the response, persists only the safe snapshot, and returns merged clients. Cold boot/reconnect and `getMcpClients` manual refresh call the same deduplicated function. A failed/malformed refresh must not write support; a prior valid cache may remain but becomes degraded when stale. [VERIFIED: existing deduplicated UI refresh in `options.js:947-995`; storage mutation chain in `mcp-agent-providers.js:125-151`; locked background authority in `62-CONTEXT.md`]

**When to use:** Bridge cold boot/reconnect and Providers manual refresh. Do not call the CLI, doctor command, shell, or native messaging from extension code. [VERIFIED: `62-CONTEXT.md`]

### Pattern 5: Drift-Specific Pre-Throttle

**What:** A small reporter accepts only `{adapterId, expected, observed}`, validates/bounds all three values, uses an injected clock and one `Map` entry per canonical adapter, and calls `rateLimitedWarn('BG', 'agent-protocol-drift:' + adapterId, ...)` only once per window. [VERIFIED: generic helper behavior in `redactForLog.js:77-118`; locked drift fields/rate in `62-CONTEXT.md`]

**When to use:** When background receives the first authoritative `agent_protocol_drift` terminal for an exact delegation. Duplicate terminal delivery, UI reopen, and reconnect must not invoke it again. [VERIFIED: controller terminal guard in `background.js:1528-1536`; `62-CONTEXT.md`]

### Anti-Patterns to Avoid

- **Using `rateLimitedWarn` as the only ring throttle:** it always appends even while console warnings are suppressed. Add the drift-specific pre-throttle. [VERIFIED: `redactForLog.js:90-118`]
- **Letting UI parse versions or reason from version text:** it creates a second policy authority and makes stale/corrupt data optimistic. UI consumes only daemon status/reason plus freshness. [VERIFIED: `62-CONTEXT.md`]
- **Overloading `delegate.status`:** that method is strict lifecycle authority and currently has an exact empty payload/closed result contract. Add a separate request. [VERIFIED: `spawn-supervisor.ts:513-521,695-717`; `62-CONTEXT.md`]
- **Returning `BridgeAuthState` from doctor:** it contains `sessionSecret` and `sessionId`; project only the three approved metadata fields. [VERIFIED: `bridge-auth.ts:35-41`; `62-CONTEXT.md`]
- **Assuming `installed=false` means no retained binary exists:** unsupported or unparseable versions may still have a safely retained path useful to doctor. The type permits this, and supervisor already requires all positive fields before spawn. [VERIFIED: `adapter.ts:34-40`; `spawn-supervisor.ts:550-561`]
- **Changing global doctor exit semantics for one unsupported adapter:** preserve the established diagnostic layer/exit behavior and report adapter status inside the new row. [VERIFIED: `index.ts:373`; `62-CONTEXT.md`]
- **Relabeling the fixture:** `schema-derived-contract`, `liveCapturePending: true`, and `human_needed` remain exact until milestone-end live UAT. [VERIFIED: fixture `manifest.json:5-8`; `62-CONTEXT.md`]
- **Touching native messaging or future adapters:** those are Phase 63-65 work. [VERIFIED: `62-CONTEXT.md` deferred items]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Compatibility authority | Extension version table or generated copy | Daemon matrix + classified safe projection | One authority prevents policy drift and keeps UI observational. [VERIFIED: `62-CONTEXT.md`] |
| Fixture parsing | A test-only event normalizer | `adapter.parseEvents()` from the production registry | The gate must fail when production behavior drifts, not when a parallel test parser agrees with itself. [VERIFIED: `registry.ts`; `claude-code.ts:50-64`; `62-CONTEXT.md`] |
| Doctor command | Separate adapter diagnostics CLI | Existing `collectBridgeDiagnostics` / `formatDoctor` / `runDoctor` path | Text and JSON remain projections of one snapshot and existing CLI semantics remain stable. [VERIFIED: `diagnostics.ts`; `index.ts:201-224,360-374`] |
| Diagnostics persistence | Second ring or unbounded log | Existing 100-entry FIFO and independent scrubber | The current sink already bounds depth, keys, arrays, entries, and bridge-secret strings. [VERIFIED: `diagnostics-ring-buffer.js:13-19,37-109,119-151`] |
| Compatibility refresh UI | New polling or shell execution | Existing manual refresh + background bridge request | Preserves focus, announcements, saved settings, and browser authority boundaries. [VERIFIED: `options.js:938-1017`; `62-CONTEXT.md`] |
| Auth inference | Config/env/account-file inspection | Literal `unknown` / `Not reported` for Claude | No approved parseable auth signal exists in the locked scope. [VERIFIED: `62-CONTEXT.md`; current detector returns `authState: 'unknown'` at `claude-detect.ts:318-324`] |

**Key insight:** Phase 62 is primarily an authority-convergence phase. Reusing the existing registry, parser, doctor, bridge, storage, and UI seams is safer than adding parallel machinery because each parallel copy would itself become a drift source. [VERIFIED: codebase seams and `62-CONTEXT.md`]

## Common Pitfalls

### Pitfall 1: Global warning throttling does not throttle storage

**What goes wrong:** Repeated drift fills the 100-entry ring while console output appears correctly rate-limited. [VERIFIED: `redactForLog.js:90-118`; `diagnostics-ring-buffer.js:123-126`]

**Why it happens:** `rateLimitedWarn` performs its ring append after the console throttle branch on every call. [VERIFIED: `redactForLog.js:90-118`]

**How to avoid:** Pre-throttle by canonical adapter before invoking the helper; test at `t=0`, duplicate at `t<10s`, boundary at `t=10s`, different adapter, reconnect, and duplicate terminal. [VERIFIED: locked fake-clock/duplicate-suppression requirement in `62-CONTEXT.md`]

**Warning signs:** Ring count increases for suppressed console calls or category keys are derived from unbounded observed values. [VERIFIED: existing helper keys by prefix/category at `redactForLog.js:81-88`]

### Pitfall 2: Current detector policy is broader than the locked matrix

**What goes wrong:** A newer wrong-major CLI is accepted as installed because current logic compares only against a minimum tuple. [VERIFIED: `claude-detect.ts:171-179,310-324`]

**Why it happens:** Detection predates a tested-through bound and supported-major policy. [VERIFIED: hardcoded minimum/profile constants in `claude-detect.ts:11-12`]

**How to avoid:** Make detector classification consume the canonical matrix; supported and same-major degraded may retain start eligibility, while unsupported classifications set `installed=false`. Preserve retained path/version for doctor where safely known. [VERIFIED: locked semantics in `62-CONTEXT.md`; spawn guard in `spawn-supervisor.ts:550-561`]

**Warning signs:** Numeric CLI versions appear anywhere in extension source or more than one daemon module owns min/tested-through values. [VERIFIED: `62-CONTEXT.md`]

### Pitfall 3: Matrix row, registry row, and fixture silently diverge

**What goes wrong:** A future adapter registers without a fixture, or a fixture profile changes without the matrix, while tests still exercise only Claude. [VERIFIED: current registry and fixture are separate assets at `registry.ts` and `tests/fixtures/agent-streams/...`]

**How to avoid:** Assert a bijection before replay and derive the loop from `registry.ids()`, not a test-local adapter list. [VERIFIED: `62-CONTEXT.md`]

**Warning signs:** Adapter IDs or fixture directories are repeated in the test body outside matrix references. [VERIFIED: locked single-authority rule in `62-CONTEXT.md`]

### Pitfall 4: Doctor leaks private bridge state

**What goes wrong:** Reusing `readBridgeAuthState()` directly in the JSON snapshot exposes the session secret/id. [VERIFIED: `bridge-auth.ts:35-41,132-140`]

**How to avoid:** Project immediately to exactly `sharedSecretPresent`, `secretRotatedAt`, and nonnegative `secretRotationAgeMs`; inject the reader/clock and assert serialized outputs omit known sentinel secret/id values. [VERIFIED: `62-CONTEXT.md`]

**Warning signs:** Snapshot types import `BridgeAuthState`, accept spread syntax from auth state, or contain `session*`, `token`, `fingerprint`, or raw path fields in the safe browser response. [VERIFIED: private state keys in `bridge-auth.ts:27-41`; forbidden fields in `62-CONTEXT.md`]

### Pitfall 5: Browser cache turns stale support into current support

**What goes wrong:** A formerly supported snapshot renders `Supported` indefinitely after daemon disconnect, matrix change, or storage corruption. [VERIFIED: current provider evidence deliberately preserves last success as stale at `options.js:967-980`; locked compatibility freshness rules in `62-CONTEXT.md`]

**How to avoid:** Validate at ingress and hydration, store `schemaVersion` + `checkedAt`, apply a one-way freshness downgrade (`supported` -> `degraded`; never upgrade), and treat absent/corrupt rows as `Unsupported`. [VERIFIED: `62-CONTEXT.md`]

**Warning signs:** Default status is supported, UI calculates semver, or a storage rejection updates in-memory support before durable write succeeds. [VERIFIED: storage mutation chain writes before returning at `mcp-agent-providers.js:135-151`; `62-CONTEXT.md`]

### Pitfall 6: Compatibility accidentally affects recommendation/selection

**What goes wrong:** A supported row becomes recommended or selected, or refresh resets unsaved form state. [VERIFIED: current recommendation is derived only from live/installed/clicked at `providers-panel.js:150-180`; selection lives separately at `options.js:121-136,1019-1090`]

**How to avoid:** Add a separate compatibility field/helper and badge; do not touch `getRecommendation`, `normalizeSettings`, API IDs, saved provider fields, or row ordering. [VERIFIED: `62-CONTEXT.md`]

### Pitfall 7: Drift details disappear at the supervisor terminal boundary

**What goes wrong:** Background receives only `agent_protocol_drift` and cannot populate bounded expected/observed labels. [VERIFIED: `diagnosticTerminal()` currently returns only type/code/profileVersion at `spawn-supervisor.ts:524-532`]

**How to avoid:** Sanitize the typed parser error inside the daemon into closed shape labels before terminal projection; never send `message`, raw line, payload, or unrestricted issue content. Update exact terminal validators/tests without changing the Phase 59 transport error union. [VERIFIED: typed `reason`/`issuePaths` at `claude-stream.ts:96-124`; `62-CONTEXT.md`]

## Code Examples

### Closed compatibility classification result

```typescript
// Repository pattern: frozen exact records in adapter.ts, registry.ts, and spawn-supervisor.ts.
return Object.freeze({
  adapterId: row.adapterId,
  status: 'unsupported',
  reason: 'wrong_major',
  detectedVersion: parsed.raw,
  profileVersion: row.profileVersion,
});
```

Only closed reason codes and bounded values should cross module/transport boundaries. [VERIFIED: exact/frozen project patterns in `adapter.ts:91-120`; `registry.ts:66-96`; `spawn-supervisor.ts:524-540`]

### Provider-neutral replay loop

```javascript
// Repository pattern: current fixture test imports the compiled production parser.
for (const adapterId of registry.ids()) {
  const row = requireMatrixRow(matrix, adapterId);
  const manifest = readAndValidateManifest(row.fixtureManifest);
  assertFixtureAgreement(row, manifest);
  const adapter = registry.require(adapterId);
  const events = await collect(adapter.parseEvents(Readable.from([fixtureBytes])));
  assert.deepStrictEqual(events.map((event) => event.type), row.expectedNormalizedSequence);
  assert.strictEqual(events.filter((event) => event.type === 'result').length, 1);
}
```

The exact filenames/functions may vary, but the roster must be registry-driven and parsing must be production-driven. [VERIFIED: current imports/collection in `mcp-agent-stream-fixture.test.js:9-25,53-68,144-167`; `62-CONTEXT.md`]

### Secret metadata projection

```typescript
// Project only approved metadata; never spread private auth state.
const auth = readBridgeAuthState();
const secretRotatedAt = auth?.rotatedAt ?? null;
const secretRotationAgeMs = secretRotatedAt === null
  ? null
  : Math.max(0, nowMs - secretRotatedAt);
return Object.freeze({
  sharedSecretPresent: auth !== null,
  secretRotatedAt,
  secretRotationAgeMs,
});
```

The serialized human/JSON snapshot must be tested with sentinel secret and session-id inputs to prove they never survive projection. [VERIFIED: `bridge-auth.ts:35-41,132-156`; `62-CONTEXT.md`]

### One-way stale downgrade

```javascript
function effectiveCompatibility(row, checkedAt, now, maxAgeMs) {
  if (!validClosedRow(row) || !validTimestamp(checkedAt, now)) return unsupported('invalid_evidence');
  if (now - checkedAt > maxAgeMs && row.status === 'supported') return degraded('stale_snapshot');
  return row; // degraded stays degraded; unsupported stays unsupported
}
```

The browser never parses `detectedVersion`, `minimum`, or `testedThrough` to reach this result. [VERIFIED: `62-CONTEXT.md`]

## State of the Art in This Repository

| Current Approach | Phase 62 Approach | Impact |
|------------------|-------------------|--------|
| Claude detector owns hardcoded minimum/profile and accepts all later semver | Canonical matrix owns min/tested-through/major/profile and detector imports classifier | One policy source and correct degraded/wrong-major behavior. [VERIFIED: `claude-detect.ts:11-12,171-179`; `62-CONTEXT.md`] |
| One Claude-specific fixture test with strong parser negatives | Registry/matrix-driven replay gate plus per-row raw field/sequence/version contracts | Future adapters join by data + fixture rather than bespoke CI architecture. [VERIFIED: `mcp-agent-stream-fixture.test.js`; `62-CONTEXT.md`] |
| Doctor reports bridge/config/content-script layers | Same snapshot additionally reports local adapter rows, compatibility matrix, and projected secret age | Adapter diagnosis works even without extension attachment while historical layer/exit behavior remains. [VERIFIED: `diagnostics.ts`; `index.ts`; `62-CONTEXT.md`] |
| Provider envelope has clicked/connected/installed and preserves unknown keys | Add one validated compatibility snapshot while preserving existing maps/unknown keys | Backward-compatible storage and merged row projection. [VERIFIED: `mcp-agent-providers.js:92-151`; `62-CONTEXT.md`] |
| Providers shows recommendation and availability evidence badges | Add an independent compatibility badge with exact three labels | No selection, recommendation, auth, billing, or availability conflation. [VERIFIED: `providers-panel.js`; `options.js`; `62-CONTEXT.md`] |
| Drift terminal loses typed reason at daemon boundary | Project bounded reason/shape labels into diagnostic terminal, then rate-limit the extension sink | Useful diagnostics without raw provider data or transport-union expansion. [VERIFIED: `claude-stream.ts:96-124`; `spawn-supervisor.ts:524-532`; `62-CONTEXT.md`] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | None. Recommendations are derived from locked Phase 62 decisions and inspected repository code/tests. | All | No user confirmation is needed before planning. [VERIFIED: sources listed inline] |

## Open Questions

No blocking product or architecture questions remain. The locked discretion items (module names, exact freshness duration, reason-code spellings, request method name, and badge placement) can be selected by the planner while preserving the contracts above. [VERIFIED: `62-CONTEXT.md`]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | MCP build and all deterministic tests | Yes | `v24.14.1` locally; CI pins Node 20; MCP declares `>=18.20.0` | Author Phase 62 code to CI's Node 20/ES2022 compatibility, not local-only Node 24 APIs. [VERIFIED: local `node --version`; `.github/workflows/ci.yml`; `mcp/package.json`; `mcp/tsconfig.json`] |
| npm | build/test orchestration | Yes | `11.11.0` locally | Existing lockfiles/install commands in CI. [VERIFIED: local `npm --version`; `.github/workflows/ci.yml`] |
| Claude Code CLI | Genuine path/version corroboration only | Not required for automated phase work | Deliberately not probed during this research | Production detector dependencies and committed fixture cover automation; live corroboration remains `human_needed` at milestone end. [VERIFIED: `62-CONTEXT.md`] |
| Browser / account / network | Rendered/live UAT only | Not required for automated phase work | — | VM/DOM/source tests cover deterministic contracts; live checks remain deferred. [VERIFIED: `62-CONTEXT.md`; existing test harnesses] |

**Missing dependencies with no fallback:** None for automated Phase 62 implementation. [VERIFIED: repository build/test stack and locked offline gate]

**Missing dependencies with fallback:** Live Claude/browser evidence is intentionally replaced by deterministic fixtures for phase automation, not counted as passed, and retained for milestone-end UAT. [VERIFIED: `62-CONTEXT.md`; fixture manifest]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Serial Node.js assertion scripts plus strict TypeScript build; VM/DOM harnesses for extension classic scripts. [VERIFIED: `package.json`; existing Phase 57-61 tests] |
| Config file | `mcp/tsconfig.json`; no centralized JS test runner config. [VERIFIED: repository files] |
| Quick run command | `npm --prefix mcp run build && node tests/mcp-adapter-compatibility.test.js && node tests/mcp-agent-drift-smoke.test.js && node tests/mcp-diagnostics-status.test.js` [VERIFIED: existing build/test invocation pattern in `package.json`] |
| Full suite command | `node scripts/run-phase60-full-tests.mjs` [VERIFIED: existing guarded full-suite script] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DRIFT-01 | Registry/matrix/fixture bijection; raw init/result fields; production parser sequence; exactly one terminal; all mandated negative controls; fixture version supported | integration/contract | `npm --prefix mcp run build && node tests/mcp-agent-drift-smoke.test.js` | Wave 0: new generalized test; current Claude-specific coverage exists in `tests/mcp-agent-stream-fixture.test.js`. [VERIFIED: current test file] |
| DRIFT-01 / DRIFT-04 | Supported inclusive bounds, same-major newer degraded, below/wrong-major/missing/malformed/unshipped/matrix-invalid unsupported | unit | `npm --prefix mcp run build && node tests/mcp-adapter-compatibility.test.js` | Wave 0: new. [VERIFIED: no current compatibility module/test found] |
| DRIFT-02 | Closed adapter diagnostic rows, offline collection, human/JSON parity, secret metadata projection, sentinel non-leak, historical layer/exit semantics | unit/integration | `npm --prefix mcp run build && node tests/mcp-diagnostics-status.test.js` | Existing file requires extension. [VERIFIED: `tests/mcp-diagnostics-status.test.js`] |
| DRIFT-03 | Typed drift detail projection, child exact-once settlement, adapter-scoped 10-second ring throttle, bounded fields, sink redaction, duplicate suppression | unit/integration | `node tests/agent-protocol-drift-diagnostics.test.js && node tests/redact-for-log.test.js && node tests/diagnostics-ring-buffer.test.js && npm --prefix mcp run build && node tests/mcp-spawn-supervisor.test.js` | Wave 0: new focused reporter test; supporting tests exist. [VERIFIED: listed existing tests] |
| DRIFT-04 | Authenticated exact compatibility request; malformed response rejected; durable snapshot/unknown-key preservation; cold/manual refresh; stale/absent/corrupt states | integration | `node tests/mcp-agent-providers-storage.test.js && node tests/mcp-bridge-client-lifecycle.test.js && node tests/mcp-bridge-background-dispatch.test.js` | Existing files require extension. [VERIFIED: listed tests] |
| DRIFT-04 | Compatibility badge exact labels/tone/text; separate recommendation/availability/auth/billing/selection; no reordering/auto-selection/form mutation | pure DOM/source | `node tests/providers-panel-logic.test.js && node tests/providers-panel-ui.test.js` | Existing files require extension. [VERIFIED: listed tests] |
| All | Frozen five-method adapter, five transport errors, MCP byte/tool schemas, seven API providers, no native/shell/wake/version constants in extension, source pins | contract/source | `node tests/mcp-agent-provider-contract.test.js && node tests/mcp-reverse-channel-contract.test.js && node tests/delegation-phase-contract.test.js && node tests/providers-panel-logic.test.js` | Existing files require Phase 62 assertions/source-pin updates. [VERIFIED: listed tests; `62-CONTEXT.md`] |

### Sampling Rate

- **Per task commit:** Run the smallest mapped command above plus `npm --prefix mcp run build` for every MCP TypeScript edit. [VERIFIED: MCP prebuild/tsc path in `mcp/package.json`]
- **Per wave merge:** Run the complete Phase 62 focused set, including bridge/storage/UI tests for any extension touch. [VERIFIED: source-pin discipline in `.planning/STATE.md` and `62-CONTEXT.md`]
- **Phase gate:** Run `node scripts/run-phase60-full-tests.mjs`, verify protected workspace hashes/state, and require clean code/security/UI review before verification. [VERIFIED: `62-CONTEXT.md`; guarded script]
- **Human gate:** Record live installed-version doctor corroboration and rendered browser/accessibility checks as pending `human_needed`; perform them only in the single milestone-end UAT sweep. [VERIFIED: user instruction; `62-CONTEXT.md`; `.planning/STATE.md`]

### Wave 0 Gaps

- [ ] `tests/mcp-adapter-compatibility.test.js` — matrix exactness, deep freeze, version/reason boundaries, safe projection.
- [ ] `tests/mcp-agent-drift-smoke.test.js` — registry-driven generalized replay and all locked negative controls; this exact file is invoked by both root serial suite and named CI step.
- [ ] `tests/agent-protocol-drift-diagnostics.test.js` — bounded terminal detail plus injected-clock per-adapter pre-throttle and duplicate suppression.
- [ ] Extend `tests/mcp-diagnostics-status.test.js` — injected registry/auth/clock, offline rows, text/JSON parity, sentinel secret/id/path boundaries, unchanged diagnostic layer semantics.
- [ ] Extend provider storage/bridge/UI tests — exact safe projection, persistence failure, stale downgrade, malformed/prototype cases, separate badge behavior, no authority mutation.
- [ ] Add one Phase 62 source/requirement contract test or extend the existing phase contract so every DRIFT requirement, forbidden capability, schema link, CI/root entry, and deferred UAT row is mechanically pinned.

Every Wave 0 item is derived from a locked requirement not fully covered by current tests. [VERIFIED: requirement map above; repository test audit]

## Security Domain

Security enforcement is enabled because `.planning/config.json` does not disable it. [VERIFIED: `.planning/config.json`]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control in This Phase |
|---------------|---------|--------------------------------|
| V2 Authentication | Yes | Compatibility reads reuse the authenticated `ext:*` bridge and do not add an unauthenticated route. [VERIFIED: `bridge.ts`; `mcp-bridge-client.js:608-692`; `62-CONTEXT.md`] |
| V3 Session Management | Yes | Project only presence/rotation-age metadata from private session auth; never expose secret/session id, and preserve daemon rotation behavior. [VERIFIED: `bridge-auth.ts`; `62-CONTEXT.md`] |
| V4 Access Control | Yes | Serve remains the only daemon owner; background remains the only browser transport/storage authority; compatibility grants no spawn/selection authority. [VERIFIED: `serve-delegation.ts`; `background.js`; `62-CONTEXT.md`] |
| V5 Validation, Sanitization, Encoding | Yes | Every matrix, doctor row, bridge projection, storage snapshot, and diagnostic context is exact-shape, bounded, prototype-safe, and fail-closed. [VERIFIED: `62-CONTEXT.md`; existing exact validators cited above] |
| V6 Cryptography | Yes, unchanged | Reuse existing `randomBytes` session secret and `timingSafeEqual`; Phase 62 adds no cryptographic primitive. [VERIFIED: `bridge-auth.ts:1,143-156,195-213`] |
| V7 Error Handling and Logging | Yes | Typed drift reasons become bounded shape labels only; existing sink independently scrubs bridge-secret patterns and bounds stored data. [VERIFIED: `claude-stream.ts:96-124`; `diagnostics-ring-buffer.js`; `62-CONTEXT.md`] |
| V14 Configuration | Yes | CI enforces registry/matrix/fixture agreement and extension source remains free of version constants/native/shell/wake capability. [VERIFIED: `62-CONTEXT.md`; `.github/workflows/ci.yml`] |

This table is a project threat-model mapping, not a claim of formal ASVS certification. [VERIFIED: scope of this research artifact]

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged compatibility response asserts support | Spoofing / Elevation of Privilege | Existing authenticated bridge, exact response validation, background-only persistence, and compatibility kept observational. [VERIFIED: `62-CONTEXT.md`; bridge auth source] |
| Matrix/fixture mismatch hides parser drift | Tampering | Registry/matrix/fixture bijection and production-parser replay in both named CI step and root suite. [VERIFIED: `62-CONTEXT.md`] |
| Prototype-key or unknown-field injection corrupts browser state | Tampering | Own-property/exact-key validation, bounded strings/arrays, safe cloning, and fail-closed unsupported status. [VERIFIED: `62-CONTEXT.md`; current safe-own patterns in `providers-panel.js:95-109`] |
| Doctor JSON leaks spawn-channel credential or private path into browser | Information Disclosure | Immediate metadata-only auth projection; safe browser projection explicitly omits secret metadata and binary paths; sentinel leak tests. [VERIFIED: `bridge-auth.ts`; `62-CONTEXT.md`] |
| Provider-native payload leaks through drift diagnostics | Information Disclosure | Represent only canonical adapterId and bounded expected/observed shape labels; prohibit raw line/message/payload/path/task fields; retain independent sink scrubber. [VERIFIED: `62-CONTEXT.md`; `diagnostics-ring-buffer.js`] |
| Chatty drift exhausts diagnostics storage | Denial of Service | Per-adapter pre-throttle before `rateLimitedWarn`, stable 10-second window, existing 100-entry FIFO. [VERIFIED: helper/sink behavior; `62-CONTEXT.md`] |
| Compatibility refresh mutates provider intent | Elevation of Privilege | Keep recommendation/selection functions untouched and assert refresh does not reorder/select/save or touch API data. [VERIFIED: current separation in `providers-panel.js` / `options.js`; `62-CONTEXT.md`] |
| Extension gains shell/native wake capability early | Elevation of Privilege | Source gates forbid native messaging/process/shell/execute/restart/wake through Phase 62; request is data-only. [VERIFIED: `62-CONTEXT.md`; Phase boundary] |

### Threat-Model Inputs Required in Plans

Every plan touching a trust boundary should explicitly cover: authority owner, accepted exact keys, size/time bounds, malformed/prototype behavior, secret/path fields forbidden from projection, failure classification, idempotence/duplicate behavior, and focused negative tests. [VERIFIED: recurring exact/fail-closed project patterns and `62-CONTEXT.md`]

## Sources

### Primary (HIGH confidence)

- `.planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-CONTEXT.md` — locked phase boundary, decisions, discretion, deferrals, integration seams.
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — DRIFT requirements, success criteria, hard invariants, and deferred UAT posture.
- `mcp/src/agent-providers/{adapter,registry,claude-code,claude-detect,claude-profile,claude-stream,spawn-supervisor,serve-delegation}.ts` — production adapter/detection/parser/supervisor/serve behavior.
- `mcp/src/{diagnostics,index,bridge-auth,bridge}.ts` — doctor snapshot, formatter/CLI, private auth state, authenticated request routing.
- `extension/utils/{redactForLog,diagnostics-ring-buffer,mcp-agent-providers}.js`, `extension/ws/mcp-bridge-client.js`, `extension/background.js`, `extension/ui/{providers-panel,options}.js`, `extension/ui/control_panel.html`, `extension/ui/options.css` — browser transport, persistence, diagnostics, and Providers seams.
- `tests/fixtures/agent-streams/claude-code-2.1.177/{manifest.json,contract-stream.jsonl}` and current MCP/provider/diagnostic/UI tests — fixture provenance, normalized sequence, negative patterns, and harness conventions.
- `package.json`, `mcp/package.json`, `mcp/tsconfig.json`, `.github/workflows/ci.yml`, `scripts/run-phase60-full-tests.mjs` — versions, build/test orchestration, CI, and guarded phase gate.

All source bullets above were inspected directly in this research session. [VERIFIED: repository reads performed 2026-07-15]

### Secondary (MEDIUM confidence)

None. External documentation was unnecessary because locked decisions and current repository contracts fully determine the plan. [VERIFIED: research scope and inspected code]

### Tertiary (LOW confidence)

None. [VERIFIED: Assumptions Log]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependency; versions and runtime contracts come directly from manifests/config. [VERIFIED: `package.json`; `mcp/package.json`; `mcp/tsconfig.json`; CI]
- Architecture: HIGH — all integration boundaries are present and locked decisions specify authority/transport/persistence semantics. [VERIFIED: `62-CONTEXT.md`; cited source seams]
- Pitfalls: HIGH — each pitfall is demonstrated by current source behavior or an explicit locked requirement. [VERIFIED: inline citations]
- Validation: HIGH — existing tests expose exact harness patterns and gaps map directly to DRIFT-01..04. [VERIFIED: test audit]
- Security: HIGH — trust boundaries and forbidden data/capabilities are explicit in context and current auth/diagnostics source. [VERIFIED: `62-CONTEXT.md`; `bridge-auth.ts`; diagnostics source]

**Research date:** 2026-07-15
**Valid until:** The matrix/schema, bridge request contract, provider envelope, or Phase 62 locked context changes; otherwise re-check after 30 days. [VERIFIED: research is repository-version-specific]
