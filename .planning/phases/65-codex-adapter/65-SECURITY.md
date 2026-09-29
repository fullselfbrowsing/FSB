---
phase: 65
slug: codex-adapter
status: verified
threats_total: 12
threats_closed: 12
threats_open: 0
asvs_level: 2
register_authored_at_plan_time: true
block_on: [HIGH, CRITICAL]
created: 2026-07-22
audited: 2026-07-22
verified: 2026-07-22
---

# Phase 65 — Security

> ASVS Level 2 per-phase security contract for the Codex adapter, accepted account identity, native process authority, normalized event path, durable browser state, and atomic production exposure.

---

## Audit Result

**Verified:** 12 of 12 registered threats are closed. The register contains six CRITICAL and six HIGH threats. The enforced HIGH/CRITICAL release gate has no open item.

The audit read all eight Phase 65 plans and summaries, context, research, validation, review, review-fix, human-UAT, and UI-spec artifacts, then inspected the implementation and focused tests. The complete guarded Phase 65 runner passed on 2026-07-22, including the focused adapter/security matrix, extension validation, root `npm test`, atomic-exposure sentinel, CI/root occurrence checks, and workspace-preservation checks. Runner success is corroborating evidence only; every threat below also has direct implementation and test evidence.

---

## Trust Boundaries

| Boundary | Description | Data crossing |
|----------|-------------|---------------|
| Side panel to background | User task intent crosses from an untrusted UI request into saved provider selection, preflight, and one-time consent authority | Task text and a challenge id; no client-supplied provider, auth, billing, compatibility, or accepted identity |
| Background to daemon | The background consumes the challenge and sends the daemon only the exact accepted identity plus task | Five-field account identity and task text |
| Daemon to Codex probes | The supervisor invokes retained Codex binaries for version/auth detection and effective-authority attestation | Sanitized environment, bounded stdin, native stdout/stderr bytes, and a serve-owned loopback reference |
| Daemon to Codex task child | A verified identity and effective MCP configuration permit one direct task process | Task on stdin, closed argv/config/features, empty direct scratch, and the exact FSB MCP endpoint |
| Native stream to normalized events | Untrusted Codex JSONL enters the strict parser and generic supervisor | Bounded native bytes in; normalized init/message/FSB-tool/result candidates out |
| Daemon to browser persistence | Only daemon-confirmed identity and normalized lifecycle events cross the reverse channel | Canonical identity, safe events, terminal truth, tokens, turns, duration, and null USD |
| Persistence to UI | Exact durable records become Providers and shared delegation-feed presentation | Safe auth enum, canonical billing kind/copy, provider-neutral lifecycle, and authoritative summaries |
| Source to production/CI | The adapter becomes shipped only when registry, matrix, fixtures, parser, drift gate, tests, root runner, and CI agree | One 32-file atomic exposure boundary plus later reviewed hardening fixes |

---

## Threat Register

| Threat ID | Severity | Category | Preserved component obligations | Disposition | Status |
|-----------|----------|----------|---------------------------------|-------------|--------|
| T65-01 | CRITICAL | Information Disclosure | Ambient Codex/OpenAI credentials, detection/attestation/spawn environment, fixed-env restoration, closure logs and canaries | mitigate | closed |
| T65-02 | CRITICAL | Information Disclosure | Login/authority probes, byte ownership and zeroization, evidence artifacts, daemon/browser projection, persistent state and DOM | mitigate | closed |
| T65-03 | CRITICAL | Spoofing | Exact five-field identity, consent/task binding, immediate re-probe, daemon echo, mismatch side effects and replay | mitigate | closed |
| T65-04 | CRITICAL | Elevation of Privilege | Serve-owned loopback reference, exact complete enabled MCP roster, endpoint/tools/approval/local authority and pre-spawn ordering | mitigate | closed |
| T65-05 | CRITICAL | Elevation of Privilege | Inherited config/rules/tools/environment, closed flags/features, provider-neutral supervisor and exact five-method adapter | mitigate | closed |
| T65-06 | HIGH | Information Disclosure | Strict native lifecycle parsing, reasoning/todo discard, closed error reasons, normalized state/UI and raw-content exclusion | mitigate | closed |
| T65-07 | HIGH | Tampering | Exact MCP item id/server/tool/order, adjacent sanitized use/result pair, duplicate/mismatch/failure/open-terminal rejection | mitigate | closed |
| T65-08 | CRITICAL | Tampering | Private result candidate, exit-zero/no-signal, complete tree settlement, journal/scratch cleanup and authoritative UI terminal | mitigate | closed |
| T65-09 | HIGH | Tampering | Immutable accepted identity in store/controller/feed, auth/billing pair stability, hydration, event/current-settings drift and null USD | mitigate | closed |
| T65-10 | HIGH | Elevation of Privilege | Observational metadata/compatibility, saved-background selection, provider-free requests, shared DOM and explicit 44px human Stop | mitigate | closed |
| T65-11 | HIGH | Tampering | Pinned 0.142.5 schema-derived provenance, `liveCapturePending`, 0.144.6 degradation and no visible version rebasing | mitigate | closed |
| T65-12 | HIGH | Elevation of Privilege | Indivisible production exposure, exact roster/matrix/fixture/parser/drift alignment, partial-exposure sentinel and root/CI gates | mitigate | closed |

*All registered threats are mitigated. No threat is accepted or transferred.*

---

## Mitigation Verification

### T65-01 — Ambient credentials and closure leakage

- **Implementation:** `mcp/src/agent-providers/spawn-environment.ts:88-155` validates one closed environment policy and constructs the child environment in the order inherit, strip, reject fixed restoration, add fixed values, then force final values. The complete Codex/OpenAI/noise deny entries are at `:199-320`; detection, authority, and task spawn share this policy. Closure execution uses bounded output and does not log the environment or credential values.
- **Tests:** `tests/mcp-codex-adapter.test.js:1018-1079` proves ambient canaries are stripped and the detector receives the same closed environment. `tests/mcp-spawn-supervisor.test.js:3135-3213` rejects fixed-env reinjection without invoking hostile accessors. `tests/agent-provider-forbidden-flags.test.js:380-425` pins the source vocabulary and forbidden restoration paths.
- **Result:** closed; no ambient or fixed credential can reach a Codex probe, child, state, artifact, or audit output.

### T65-02 — Probe bytes and safe projection

- **Implementation:** `mcp/src/agent-providers/process-probe.ts:15-64,178-237,249-518` bounds argv/stdin/channels/time, uses `shell: false` and a detached process group, owns bytes as Buffers, erases source buffers, settles the complete process tree on success and failure, and returns an idempotent zeroizer. `mcp/src/agent-providers/codex-detect.ts:225-267,287-305,361-371` classifies only the exact safe auth enum and zeroizes in `finally`. `mcp/src/agent-providers/serve-delegation.ts:231-325` emits only canonical status/reason/auth rows; paths, versions, diagnostics, config, native bodies, endpoints, and secrets are absent.
- **Tests:** `tests/mcp-codex-adapter.test.js:247-611,1428-1471` covers success, error, timeout, abort, overflow, descendant settlement, source erasure, auth classification, and caller zeroization. `tests/mcp-adapter-compatibility.test.js:480-585` injects daemon path/version/auth/billing/model/config/native/endpoint/secret sentinels and proves none survive. `tests/delegation-sidepanel-ui.test.js:270-510` validates hostile identity/native canaries and the shared safe DOM.
- **Result:** closed; raw status and credential-bearing bytes never cross into logs, errors, evidence, durable state, or presentation.

### T65-03 — Accepted-identity spoofing and TOCTOU

- **Implementation:** `mcp/src/agent-providers/accepted-identity.ts:8-190` exact-validates and freezes provider id, label, profile version, auth state, and billing kind with canonical cross-field mapping. `extension/utils/delegation-consent.js:290-477` binds that identity and task to a one-time challenge, burns mismatches, and prevents replay. `extension/background.js:2175-2304` performs the second preflight, consumes the challenge, sends only `{ acceptedIdentity, task }`, and compares the daemon echo before controller creation. `mcp/src/agent-providers/spawn-supervisor.ts:721-742,1140-1355,2178-2241,2401-2417` re-detects and compares all five fields before runtime preparation, child creation, event emission, or stdin, then returns the exact echo.
- **Tests:** `tests/delegation-consent.test.js:149-228,304-402` covers ChatGPT/API-key swaps, single-field drift, expiry, trust, hostile shapes, task mismatch, and replay. `tests/delegation-routing.test.js:97-263` proves client requests are authority-free and daemon/controller ordering is exact. `tests/mcp-spawn-supervisor.test.js:945-1162` proves mismatch has zero runtime/spawn/stdin/journal effects. `tests/mcp-bridge-background-dispatch.test.js:2504-2690` proves no visible or persisted state exists before an exact echo.
- **Result:** closed; stale or spoofed account identity cannot authorize or relabel a run.

### T65-04 — Effective MCP authority elevation

- **Implementation:** `mcp/src/agent-providers/effective-authority.ts:502-567` accepts only a generation-bound `http://127.0.0.1:<port>/mcp` reference minted after serve ownership. `mcp/src/agent-providers/codex-profile.ts:287-426` constructs the closed task configuration and the read-only initialize/initialized/`config/read` authority probe. `mcp/src/agent-providers/effective-authority.ts:590-835,871-1059` validates the three-message native protocol and the complete enabled `mcp_servers` roster: the only enabled server is `fsb`, with the exact endpoint, `required`, `enabled`, ordered tools, local approval, empty headers/environment, no bearer token, local environment, and no timeout. `mcp/src/agent-providers/spawn-supervisor.ts:2178-2289` requires identity and authority before runtime or task spawn.
- **Tests:** `tests/mcp-codex-adapter.test.js:749-882,1103-1402` covers forged/cross-generation/foreign endpoints, faithful pinned protocol, missing/reordered/extra messages, enabled foreign or ambiguous rosters, headers/environment/bearer/approval/tool/timeout drift, and proves no hard-coded success. `tests/mcp-spawn-supervisor.test.js:2939-3109` proves config-read evidence gates every downstream side effect. Post-review commits `1528190c` and `42420ba0` are independently described and verified in `65-REVIEW.md:80-105,131-140` and `65-REVIEW-FIX.md:22-59`.
- **Result:** closed; Codex cannot inherit or assert broader MCP authority than the serve-owned FSB surface.

### T65-05 — Inherited native configuration and tool authority

- **Implementation:** `mcp/src/agent-providers/codex-profile.ts:35-127,194-323,429-456` pins the exact task-only argv, ignores user config/rules, disables web and every tool-bearing feature, starts from `mcp_servers={}`, adds only FSB, supplies no execution environment, and exposes declarative identity/authority descriptors. `mcp/src/agent-providers/codex.ts:31-69` is an immutable adapter with exactly `detect`, `buildSpawn`, `parseEvents`, `kill`, and `caps`. `mcp/src/agent-providers/registry.ts:154-254` validates that five-method shape and the exact canonical roster/order.
- **Tests:** `tests/agent-provider-forbidden-flags.test.js:380-425` pins exact flags/features and denies inherited authority. `tests/mcp-codex-adapter.test.js:1114-1195` asserts exact argv, overrides, disabled features, and absent fixed environment. `tests/runtime-contracts.test.js` verifies the generic supervisor authority barrier has no provider-id branch and that the adapter interface remains five methods.
- **Result:** closed; no user/project configuration, rules, web, shell, or additional native tool surface is adopted.

### T65-06 — Native lifecycle disclosure and drift

- **Implementation:** `mcp/src/agent-providers/codex-stream.ts:22-101,107-205,249-376,389-451` applies strict schemas, UTF-8/line/stream/event/structure bounds, lifecycle ordering, safe usage arithmetic, and a closed event vocabulary. Reasoning and todo items are validated then discarded; command, file, web, collaboration, native error, unknown, and authority-bearing items fail with a closed reason. Only safe message text and sanitized FSB tool lifecycle data are emitted.
- **Tests:** `tests/fixtures/agent-streams/codex-0.142.5/native-negative-corpus.json:6-48` enumerates lifecycle, unknown/native item, size, UTF-8, shape, usage, and authority failures. `tests/mcp-codex-adapter.test.js:1559-1615` verifies the exact safe event sequence and that raw fragments never appear in drift errors. `tests/mcp-agent-drift-smoke.test.js:267-359,600-706` binds the Codex parser, fixture, negative corpus, normalized sequence, and production roster.
- **Result:** closed; provider-native reasoning, plans, errors, commands, and unbounded data cannot reach browser state or UI.

### T65-07 — MCP tool-call identity and ordering tampering

- **Implementation:** `mcp/src/agent-providers/codex-stream.ts:249-337` accepts only `mcp_tool_call` items for server `fsb` and the exact allowed tool vocabulary, tracks the native item id/server/tool, requires one adjacent sanitized `tool_use`/`tool_result` pair, and rejects duplicate, mismatched, failed, missing-start, repeated-completion, or terminal-with-open-call sequences.
- **Tests:** `tests/fixtures/agent-streams/codex-0.142.5/native-negative-corpus.json:15-23` covers completion-without-start, id/server/tool mismatch, repeated completion, open terminal, foreign server, invalid tool, and failed MCP. `tests/mcp-codex-adapter.test.js:1559-1615` runs the complete corpus and verifies only sanitized call id/name/status cross the parser.
- **Result:** closed; native event reordering or identity substitution cannot fabricate an FSB tool result.

### T65-08 — Premature or unclean terminal success

- **Implementation:** `mcp/src/agent-providers/spawn-supervisor.ts:1390-1454,2318-2344,3438-3455` holds exactly one result candidate privately and publishes it only after parser EOF, exit 0, no signal, complete tree settlement, journal removal, and scratch cleanup; all failure paths settle exactly once with no result. `mcp/src/agent-providers/process-probe.ts:323-349,417-483` now proves complete tree settlement on failure and success. `mcp/src/agent-providers/runtime-files.ts:1400-1483` removes direct scratch only when it is the exact secure empty directory.
- **Tests:** `tests/mcp-spawn-supervisor.test.js:1905-2019` covers valid private candidate settlement and every nonzero/signal/stderr/tree/cleanup failure. `tests/mcp-agent-orphan-recovery.test.js:300-335` proves the 0700 direct scratch contains no config/artifact and non-empty cleanup fails closed with the journal retained. `tests/delegation-sidepanel-ui.test.js:450-510` and `extension/ui/delegation-feed.js:579-610` require an authoritative completed terminal before result or summary. Post-review commits `a35b4ddc`, `067464a3`, and the tree/zeroization companions are verified in `65-REVIEW.md:106-123,131-140` and `65-REVIEW-FIX.md:61-81`.
- **Result:** closed; a native result candidate, root-only exit, or incomplete cleanup cannot become success.

### T65-09 — Persisted identity and billing tampering

- **Implementation:** `extension/utils/delegation-event-store.js:492-567,743-791,877-924,1048-1105` derives init and metrics only from the accepted identity, snapshots it before asynchronous storage, rejects changes, forces USD to null, and retains the same identity through exact-once terminalization. `extension/utils/delegation-controller.js:431-483,646-708` forbids event-supplied identity/billing/USD and cross-checks every canonical entry. `extension/ui/delegation-feed.js:331-375,517-552,579-610` validates identity/profile/billing equality and renders accepted auth-specific billing only for an authoritative completed terminal.
- **Tests:** `tests/delegation-event-store.test.js:272-344,395-508` covers hostile/accessor/prototype/extra-key identity, both Codex auth modes, profile/auth/billing drift, hydration, event USD, and immutable terminal identity. `tests/delegation-controller.test.js` exercises start/hydration/event/terminal identity equality and rejects event-provided authority. `tests/delegation-sidepanel-ui.test.js:455-500` verifies ChatGPT/API-key billing copy, null USD, no Profile row, and no premature summary.
- **Result:** closed; current settings or event data cannot rewrite an accepted run's provider, account, billing bucket, profile, or dollar claim.

### T65-10 — Selection authority and provider-specific UI elevation

- **Implementation:** `extension/utils/delegation-providers.js:23-149` supplies only canonical metadata and allowed auth/billing mappings; it does not select or start. `extension/utils/delegation-preflight.js:90-166` requires fresh runnable compatibility and an exact accepted identity. `extension/background.js:2175-2304` obtains selection from background-owned state while client messages remain intent-only. `mcp/src/agent-providers/compatibility.ts:628-687` and `extension/ui/providers-panel.js:326-365` map observational status only. `extension/ui/delegation-feed.js:450-618` is one provider-neutral renderer, while `extension/ui/sidepanel.css:2024-2033,2132-2141` preserves 44px Stop/action targets.
- **Tests:** `tests/delegation-routing.test.js:97-263` proves compatibility and client fields cannot grant start. `tests/mcp-agent-providers-storage.test.js:770-940` proves compatibility cannot manufacture selection/recommendation/setup evidence and stale rows strip accepted authority. `tests/delegation-sidepanel-ui.test.js:455-500,650-740,897-900` proves no Codex branch/Profile row, identical shared DOM, provider-neutral billing, focus contracts, and 44px actions/Stop. Providers panel suites verify refresh is observational and preserves saved selection, form, recommendation, and API-provider behavior.
- **Result:** closed; presentation facts cannot become execution authority, and Codex adds no privileged UI path.

### T65-11 — Version and fixture provenance tampering

- **Implementation:** `mcp/src/agent-providers/compatibility.ts:395-504,564-625` pins Codex profile/minimum/tested-through to 0.142.5 and deterministically classifies newer same-major versions as `degraded/newer_than_tested_range`. `tests/fixtures/agent-streams/codex-0.142.5/manifest.json:1-32` records `schema-derived-contract`, `liveCapturePending: true`, `human_needed`, sanitization facts, and the genuine-capture milestone task. Browser-safe snapshots omit the numeric version.
- **Tests:** `tests/mcp-adapter-compatibility.test.js:279-314,405-428,439-490` verifies the exact row, 0.142.5 Supported, 0.144.6 Degraded, lower/wrong-major failures, and version absence from safe projection. `tests/mcp-agent-drift-smoke.test.js:267-321,480-499` binds the fixture/provenance and compatibility boundaries. `tests/delegation-phase-contract.test.js:2015-2058` rejects provenance promotion or a visible Profile/version rebase.
- **Result:** closed; schema-derived evidence cannot be mislabeled as a genuine capture or silently rebase compatibility.

### T65-12 — Partial exposure and CI omission

- **Implementation:** `tests/delegation-phase-contract.test.js:85-118,1506-1589` names the exact 32-file exposure set, requires one Plan 05 task/commit, checks registry/matrix/fixture/parser/drift alignment, and detects a literal missing-file mutation. Commit `a9258cf1` introduced all 32 files in one implementation commit. `scripts/run-phase65-full-tests.mjs:23-76,113-176` pins the focused matrix, root command occurrence/order, sole CI root invocation, and generalized drift job.
- **Tests:** `tests/delegation-phase-contract.test.js --section phase65-atomic-exposure` passed the complete and mutated sentinel. `tests/phase65-full-tests-harness.test.js` passed runner failure/signal/workspace-preservation behavior. The guarded `node scripts/run-phase65-full-tests.mjs` run completed with exit 0 and final markers `[mcp-build-preserver] PASS` and `[phase65-full-tests] PASS`. `package.json:17` and `.github/workflows/ci.yml:31-51` retain the exact root and drift invocations.
- **Result:** closed; neither partial adapter exposure nor silent root/CI omission is shippable.

---

## Post-Review Authority and Probe Fixes

The final clean code review records five inspected hardening commits: `a35b4ddc`, `a804277f`, `1528190c`, `067464a3`, and `42420ba0` (`65-REVIEW.md:124-140`). Their security obligations are registered rather than treated as new risks:

| Review closure | Registered threats | Verified effect |
|----------------|--------------------|-----------------|
| Failure-path detached-tree settlement (`a35b4ddc`) | T65-02, T65-08 | Probe rejection waits for complete-tree settlement and preserves zeroization |
| Exact emitted source-buffer erasure (`a804277f`) | T65-02 | The probe erases the actual emitted Buffer, not only retained copies |
| Complete enabled MCP roster attestation (`1528190c`) | T65-04 | Config-read evidence, not a hard-coded boolean, proves the sole enabled FSB authority |
| Success-path detached-tree settlement (`067464a3`) | T65-02, T65-08 | A successful root cannot resolve while descendants remain; failure becomes `tree_unsettled` |
| Response-driven config-read EOF (`42420ba0`) | T65-04 | The authority probe keeps stdin open through the exact id-2 response and rejects incomplete/reordered protocol |

`65-REVIEW-FIX.md:22-81` provides the focused implementation and negative-matrix details; `65-REVIEW.md:60-65` reports zero remaining findings.

---

## Applicable ASVS Level 2 Coverage

| ASVS domain | Verified Phase 65 control |
|-------------|---------------------------|
| V1 Architecture, Design and Threat Modeling | Plan-time 12-threat register, explicit trust boundaries, generic five-method adapter, atomic exposure, and independent code/security review |
| V2 Authentication | Exact bounded Codex auth classification and canonical auth-to-billing identity mapping without credential exposure |
| V3 Session Management | One-time task/identity-bound consent challenge, expiry, burn-on-mismatch, and replay rejection |
| V4 Access Control | Serve-owned loopback reference, complete effective MCP roster, exact tool allowlist/approval, and pre-spawn identity/authority barriers |
| V5 Validation, Sanitization and Encoding | Exact own-data records, strict JSONL state machine, bounded bytes/structure/counters, closed enums, and text-only UI projection |
| V7 Error Handling and Logging | Closed reason codes, raw native/credential omission, bounded runner output, and canary scans across errors/state/DOM/evidence |
| V8 Data Protection | Shared credential-strip policy, Buffer ownership/zeroization, no retained status bytes, immutable account identity, and null USD |
| V9 Communications | Numeric loopback-only MCP URL with no auth/query/fragment and generation-bound direct reference |
| V11 Business Logic | Immediate account re-probe, exact terminal settlement, authoritative UI completion, and immutable accepted billing semantics |
| V12 Files and Resources | Secure 0700 empty direct scratch, atomic runtime writes, no-follow checks, exact cleanup contents, and fail-closed journal retention |
| V13 API and Web Service | Exact provider-free client requests, exact daemon payload/echo, closed compatibility snapshot, and complete native config-read schema |
| V14 Configuration | Ignore user config/rules, disable web/tool-bearing features, empty MCP baseline, pinned versions/fixtures, root/CI drift gates |

---

## Human Evidence Boundary

`65-HUMAN-UAT.md` intentionally retains exactly three unchecked, `human_needed`, `pending`, evidence-empty scenarios: genuine auth/account mapping, genuine Codex-to-browser execution/process cleanup, and genuine accessibility/layout behavior. Automated fixtures, fake processes, source inspection, DOM/CSS checks, screenshots, and runner success are explicitly forbidden from promoting those rows.

This external corroboration boundary does not leave a registered mitigation unverified: the implementation and deterministic negative/positive evidence for every T65 threat are recorded above. A future human failure must be triaged as new evidence and may reopen the mapped threat; this audit does not pre-accept it.

---

## Unregistered Threat Flags

No Phase 65 summary contains a `Threat Flags` section or unregistered threat entry. The code-review authority/probe observations map completely to T65-02, T65-04, and T65-08 and are closed by the fixes above. No additional implementation-time threat was discovered during this audit.

---

## Accepted Risks Log

No accepted risks. All registered HIGH and CRITICAL threats are mitigated.

The three pending human-UAT scenarios are an evidence boundary, not accepted security risk and not automated mitigation proof.

---

## Security Audit Trail

| Audit Date | ASVS Level | Threats Total | CRITICAL | HIGH | Closed | Open | Run By |
|------------|------------|---------------|----------|------|--------|------|--------|
| 2026-07-22 | 2 | 12 | 6 | 6 | 12 | 0 | Codex (`gsd-security-auditor`) |

### Verification record

- All eight PLAN threat models were deduplicated into T65-01 through T65-12 while retaining every component obligation.
- All eight SUMMARY artifacts were inspected; no unregistered summary threat flag exists.
- Direct implementation and test evidence was inspected for each registered threat.
- The final 53-file code review is clean with 0 Critical, 0 Warning, and 0 Info findings.
- The guarded Phase 65 matrix passed with exit 0, including extension validation, complete root tests, exact atomic exposure, CI/root gates, and workspace preservation.
- No implementation file was changed and no commit was created by this security audit.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Every threat has direct implementation evidence
- [x] Every threat has direct positive/negative test evidence
- [x] Post-review authority/probe fixes are included
- [x] Unregistered threat flags were checked
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-22
