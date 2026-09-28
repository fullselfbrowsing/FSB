---
phase: 65-codex-adapter
verified: 2026-07-22T18:38:20Z
status: human_needed
score: "4/4 roadmap success criteria verified; 44/44 plan truths and 24/24 key links accounted"
requirements:
  MULTI-04: verified
  MULTI-05: verified
  MULTI-06: verified
automated_gaps: 0
human_verification:
  - test: "UAT65-01 — genuine Codex auth-state and preflight matrix"
    expected: "ChatGPT, API-key, unauthenticated, and auth-change cases expose the exact accepted identity and billing/recovery copy, while stale consent is rejected before execution."
    why_human: "Requires genuine local Codex accounts and credential transitions; synthetic detector seams cannot establish real installed-CLI behavior."
  - test: "UAT65-02 — genuine Codex delegation lifecycle"
    expected: "A real Codex task starts, streams only the sanitized projection, cancels and cleans up correctly, and finishes with the accepted-identity billing caption and no fabricated dollar amount."
    why_human: "Requires an installed Codex CLI, a real model run, the live daemon/browser boundary, and observation of process cleanup."
  - test: "UAT65-03 — live browser accessibility and responsive rendering"
    expected: "Keyboard, screen-reader, focus, theme, reduced-motion, zoom, and narrow-layout behavior remains usable with all interactive targets at least 44px."
    why_human: "Source, VM, and DOM tests cannot establish assistive-technology announcements or final rendering in a real browser."
---

# Phase 65 Verification — Codex Adapter

## Outcome

Phase 65's automated contract is complete at `275d3e727ebaee995f05f94b69b767d9bc194490`. The implementation satisfies all four Roadmap success criteria, all 44 declared plan truths, all 30 artifact declarations, all 24 key links, and requirements MULTI-04, MULTI-05, and MULTI-06. The preservation harness and the authoritative Phase 65 runner both passed against this HEAD.

No automated implementation, security, validation, or wiring gap remains. Status is `human_needed` only because the accepted phase contract deliberately leaves exactly UAT65-01, UAT65-02, and UAT65-03 for genuine-account, live-runtime, and assistive-technology observation. No live-account or live-model claim is made here.

## Goal Achievement

**Phase goal:** extend task-mode delegation to OpenAI Codex, disclose whether a run uses ChatGPT, an API key, or no usable authentication before execution, show the corresponding non-dollar billing bucket, and keep every v0.9.91 adapter task-only with `chatMode: false`.

| Roadmap success criterion | Result | Evidence |
|---|---|---|
| 1. Codex implements the five-method adapter contract and invokes the verified hermetic `codex exec --json` profile without deprecated automation flags. | VERIFIED | `codex.ts` exposes the frozen five-method surface and task-only caps. `codex-profile.ts` builds the pinned 0.142.5 profile with `exec - --json --ephemeral --ignore-user-config --ignore-rules --strict-config --color never --sandbox read-only --skip-git-repo-check`, closed feature flags, empty inherited MCP configuration, and the sole run-scoped FSB loopback server. Source and contract gates exclude deprecated `--full-auto`/`--auto` behavior. |
| 2. Detection distinguishes ChatGPT, API-key, and unauthenticated states and exposes the correct billing bucket before a run. | VERIFIED | `codex-detect.ts` reduces native evidence to a four-state safe enum and exact five-field accepted identity. Compatibility, background preflight, consent, provider presentation, and feed tests cover ChatGPT, API-key, unauthenticated, unknown, and auth drift. The accepted security copy is “Included with your ChatGPT plan,” “Billed to the API key stored by Codex; dollar amount not reported,” or the closed sign-in/refresh recovery state. |
| 3. Codex's schema is pinned in CI and all adapters remain task-only. | VERIFIED | The sanitized `codex-0.142.5` schema-derived fixture, strict stream parser, negative corpus, drift gate, authoritative Phase 65 matrix, root `npm test`, and sole Linux root invocation all passed. The fixture honestly records `liveCapturePending: true`; genuine provenance remains UAT65-02. Codex and the milestone-wide capability contract report `chatMode: false`. |
| 4. Codex projects through the existing delegation UX with auth-appropriate, dollar-free summaries. | VERIFIED | The browser receives only accepted identity and the sanitized canonical event projection. Providers, consent, lifecycle, event-store, feed, and responsive/accessibility source tests cover the same provider-neutral path used by Claude Code and OpenCode. Agent summaries expose tokens, turns, duration, and the accepted billing caption with `usd: null`; no Profile or tool Arguments row is rendered. Live experiential confirmation is UAT65-02/03. |

The Roadmap's older illustrative “ChatGPT Plus subscription” wording and “recorded” fixture wording are superseded by the accepted Phase 65 context and security decisions: plan-neutral copy avoids making an unverified subscription-tier claim, and the checked-in fixture is explicitly schema-derived until genuine capture is completed. This is an intentional honesty boundary, not an automated gap.

## Scope and Inventory

The phase contains exactly eight plans and sixteen unique executable tasks:

| Plan | Tasks | Declared truths | Verification |
|---|---:|---:|---|
| 65-01 — accepted identity and capability vocabulary | 2 | 4 | 4/4 verified |
| 65-02 — preflight, consent, and stale-identity rejection | 2 | 5 | 5/5 verified |
| 65-03 — supervisor re-attestation and start echo | 2 | 6 | 6/6 verified |
| 65-04 — generic authority probes and process settlement | 3 | 6 | 6/6 verified |
| 65-05 — atomic Codex exposure, profile, parser, and fixture | 1 | 8 | 8/8 verified |
| 65-06 — three-provider roster and auth presentation | 2 | 5 | 5/5 verified |
| 65-07 — browser lifecycle, feed, and accessibility | 2 | 5 | 5/5 verified |
| 65-08 — validation, CI, UAT ledger, and preservation | 2 | 5 | 5/5 verified |
| **Total** | **16** | **44** | **44/44 verified** |

Task identifiers form the complete, duplicate-free range `65-01-01` through `65-08-02` according to their plan ownership. The eight summaries account for those same sixteen tasks; no extra or missing implementation task was found.

## Plan-Level Must-Have Audit

### Plan 65-01 — identity before exposure

Verified all four truths:

- A canonical, frozen five-field provider identity is the only identity accepted across daemon and browser boundaries.
- Authentication reduces through a closed auth-to-billing mapping; arbitrary native strings do not reach presentation.
- Persistence and hydration preserve immutable accepted identity rather than recomputing display state from client input.
- The pre-exposure parent roster contains only Claude Code and OpenCode.

### Plan 65-02 — background-owned preflight and consent

Verified all five truths:

- The background owns preflight detection and accepted identity construction.
- Consent binds all five identity fields.
- Any auth or compatibility change burns the prior consent before delegation.
- Browser requests carry intent, not authority assertions.
- Existing providers and behavior remain intact before Codex exposure.

### Plan 65-03 — supervisor authority re-attestation

Verified all six truths:

- An authenticated start carries only the consumed accepted identity.
- The supervisor re-detects native identity before effects.
- The fresh identity must equal all consumed identity fields.
- The started echo must equal the accepted identity before controller/store visibility.
- A mismatch produces no spawn, activation, runtime event, or UI side effect.
- Client messages cannot manufacture authority, and the parent remains pre-exposure.

### Plan 65-04 — bounded generic probes

Verified all six truths:

- Probe environments share the source-pinned credential/noise sanitizer.
- The authority reference is generated and serve-owned, numeric loopback state rather than client-authored input.
- Probes are byte-bounded, time-bounded, zeroize copied source/aggregate buffers, and settle process trees on success and failure.
- Generic pre-spawn identity and effective-authority barriers remain provider-neutral; no sixth adapter method or Codex-only supervisor branch was added.
- Scratch data is cleaned directly and no durable credential-bearing artifact is introduced.
- Codex is still absent from the parent production roster before the atomic exposure commit.

### Plan 65-05 — one atomic exposure

Verified all eight truths:

- One implementation task and one atomic commit expose Codex across the complete 32-path surface.
- Version 0.142.5 is Supported; newer same-major 0.144.6 is Degraded rather than silently accepted as exact.
- The spawn profile is exact, task-only, ephemeral, read-only, strict, and isolated from user rules/config and inherited MCP state.
- Authentication is a four-state safe enum with exact-byte fixture evidence and zeroized native output.
- The parser is fatal on invalid UTF-8, bounds, lifecycle, or forbidden native events.
- A candidate terminal result remains private until parser completion, stream completion, process exit, termination, and cleanup all succeed.
- Codex reports `chatMode: false` and joins the roster completely.
- The parent contains no partial production exposure.

### Plan 65-06 — safe three-provider presentation

Verified all five truths:

- The roster is exactly Claude Code, OpenCode, and Codex.
- ChatGPT and API-key identities are runnable and map to distinct safe billing buckets.
- Unauthenticated and unknown identities remain blocked with exact recovery actions.
- Stale or malformed state degrades to unknown rather than inheriting old authority.
- Background selection is authoritative while the client stays authority-free, and the existing third-row markup remains provider-neutral.

### Plan 65-07 — lifecycle, summaries, and UI

Verified all five truths:

- Real profiles stay internal; no visible Profile row is introduced.
- Accepted identity survives lifecycle and hydration exactly.
- Agent cost summaries remain dollar-free and show the exact accepted billing caption.
- Interactive targets covered by the phase are at least 44px with theme, focus, reduced-motion, zoom, and narrow-layout protections.
- Presentation and accessibility code remains provider-neutral.

### Plan 65-08 — executable closure

Verified all five truths:

- The ownership map names exactly eight plans and sixteen tasks.
- The human ledger contains exactly three pending scenarios and no synthetic claim that they ran.
- The authoritative runner is preservation-safe on success, command failure, spawn failure, SIGINT, and SIGTERM.
- Root `npm test` and Linux CI contain the exact protected Phase 65 slots with no recursive runner invocation.
- Decision, UI, threat, task, fixture, drift, and full-suite validation mappings are complete.

## Artifact and Key-Link Audit

The plans declare 30 artifact entries covering 28 unique paths. `gsd-sdk query verify.artifacts` passed all 30 declarations. Direct source inspection confirmed substantive implementation rather than path-only existence, including:

- the Codex adapter, detector, spawn profile, and strict stream parser;
- the generic adapter registry, compatibility model, preflight/consent contracts, supervisor, authority probe, environment sanitizer, and process-tree settlement;
- extension accepted-identity mapping, providers presentation, lifecycle/controller store, event store, feed rendering, and styling;
- schema-derived fixtures, parser negatives, drift and diagnostic tests, preservation harness, authoritative runner, package script, and Linux CI workflow.

All 24 declared key links are wired. The mechanical link check resolved 21 directly. Three regex-shape misses were manually disconfirmed as false negatives:

1. **`codex.ts` → `codex-profile.ts`:** the adapter imports and calls `buildCodexSpawnSpec`; the profile imports `CODEX_PROFILE_VERSION`, which is pinned by `codex-detect.ts` to 0.142.5.
2. **compatibility producer → extension consumer:** the daemon emits schema version 2 and the closed auth snapshot; the extension validates schema v2 and `authState` before constructing accepted identity.
3. **event store → feed:** the store accepts accepted identity, derives `billingKind`, and forces `usd: null`; the feed validates that identity/billing/null-dollar invariant and renders the exact caption.

Result: **30/30 artifact declarations and 24/24 key links accounted.**

## End-to-End Authority and Data Trace

The verified sequence is:

1. Native detector output is byte-bounded and reduced to a safe four-state auth enum.
2. Compatibility creates the exact five-field accepted identity.
3. The background performs preflight and binds consent to all five fields.
4. An immediate second preflight must match before consent is consumed.
5. The delegate request carries the consumed identity but no client authority claims.
6. The supervisor re-detects identity and checks exact equality before building or spawning.
7. The supervisor builds a source-pinned sanitized environment and verifies the exact effective authority through Codex app-server `config/read`.
8. Only after both barriers pass does it prepare runtime state, spawn the detached process, activate, emit the started echo, and write task input.
9. The strict parser exposes only initialization, assistant text, sanitized FSB tool use/result, and the eventual result candidate. Reasoning, todo state, arbitrary native events, credentials, tool arguments, and raw results are discarded or fail closed.
10. The result remains private until stream/exit/tree-settlement/cleanup success, then flows with accepted identity to the controller and event store.
11. The event store derives the billing bucket from accepted identity, fixes `usd` to null, and the feed renders the provider-neutral summary.

Failure inversions were explicitly exercised for auth drift, foreign inherited MCP configuration, response-before-EOF authority probing, early EOF, invalid/oversized/misordered streams, process descendants after failed and successful probes, result-before-cleanup, raw tool payloads, stale hydration, and unknown auth. These cases fail closed without partial UI or execution exposure.

## Requirement Coverage

| Requirement | Result | Verification basis |
|---|---|---|
| MULTI-04 | VERIFIED | The five-method `AgentProviderAdapter` implementation invokes the exact task-only hermetic `codex exec --json` profile, uses direct task stdin, blocks deprecated automation flags, validates effective authority, and participates in the generic supervisor lifecycle. |
| MULTI-05 | VERIFIED | Detection distinguishes ChatGPT, API key, unauthenticated, and unknown; accepted identity is re-attested across preflight/consent/supervisor/echo; the Providers panel and feed show the safe billing or recovery copy before/after execution without exposing raw native evidence. |
| MULTI-06 | VERIFIED | The 0.142.5 schema-derived fixture, strict parser corpus, drift gate, diagnostics, authoritative runner, root test, and CI slot passed. The fixture is explicitly provenance-honest pending live capture, and all adapters retain `chatMode: false`. |

`.planning/REQUIREMENTS.md` marks all three requirements complete and maps them only to Phase 65. No Phase 65 requirement is orphaned or mapped elsewhere.

## Decision, UI, and Threat Ownership

The validation contract accounts for every named obligation:

| Contract | Declared | Accounted | Result |
|---|---:|---:|---|
| D65 decisions | 24 | 24 | VERIFIED |
| UI65 locks | 10 | 10 | VERIFIED |
| T65 threats | 12 | 12 | VERIFIED |

`65-VALIDATION.md` maps D65-01 through D65-24 to explicit task owners and executable evidence. `65-UI-SPEC.md` maps UI65-01 through UI65-10. `65-SECURITY.md` closes T65-01 through T65-12—six CRITICAL and six HIGH—with `threats_open: 0` and no accepted risk. The Phase 65 contract suite rejects missing or mutated ownership rows, so these are executable mappings rather than prose-only claims.

## Atomic Exposure and History Audit

Codex first appears in production at commit `a9258cf1` with parent `4aac3c8e`:

- the commit's 32 changed paths exactly equal the corrected Plan 65-05 `files_modified` inventory;
- the parent has no Codex adapter, registry entry, compatibility row, browser roster entry, or fixture exposure;
- branch-range pickaxe history for `CODEX_ADAPTER_ID`, `createCodexAdapter`, and `codex-0.142.5` starts at `a9258cf1` only;
- the exposure commit includes the adapter/profile/detector/parser, daemon and extension wiring, four fixture files, drift/provider/version/diagnostic/inventory/supervisor/orphan tests, and sentinels together.

Therefore no intermediate production commit exposes a selectable or partially wired Codex provider.

The Plan 65-05 summary records one contained historical deviation before the detector seam became mandatory: installed Codex 0.144.6 may have received one read-only `--version` probe and one read-only `login status` probe. It did not run a model task, mutate login, read a credential file directly, browse, or create a genuine fixture; output was bounded, reduced to the safe enum, and zeroized. Subsequent verification is synthetic-only. This does not create a present implementation gap or satisfy any human UAT item.

## Review and Remediation Closure

The initial code review identified three real concerns, all fixed and regression-covered:

| Finding | Fix | Closure evidence |
|---|---|---|
| CR-01: the initial authority check queried only `codex mcp get fsb` and could miss a foreign enabled server. | Full app-server `config/read` attestation now enumerates the enabled roster and requires the sole exact FSB authority. | Native authority tests and final clean review. |
| W-01: some failed probes could leave descendant processes unsettled. | Failure paths now settle detached process trees. | POSIX/Windows and failure-path tests. |
| W-02: copied source chunks were not all zeroized. | Source and aggregate buffers are zeroized on all paths. | Buffer-zeroization tests and final clean review. |

Two follow-up adversarial findings were also closed: app-server stdin now closes only after the expected response prefix rather than before `config/read` completes, and successful probes settle descendants as well as failed probes. The final code re-review reports zero critical, warning, or informational findings across 53 files.

The initial UI review found two warnings, both fixed:

- auth-specific recovery is now derived from the safe enum and shared consistently across preflight, provider panel, and feed;
- canonical tool presentation drops arguments/results, legacy `argsSummary` is sanitized without inspecting raw payloads, and the renderer has no Arguments row.

The final UI re-audit reports zero warnings and zero blockers. Its 22/24 score is capped only by the two live experiential UI scenarios represented within UAT65-02 and UAT65-03, not by a source defect.

All twelve CRITICAL/HIGH threat rows are closed; no accepted security risk remains.

## Automated Verification Run

The following was run against the verified HEAD without a bare MCP build:

| Command/gate | Result |
|---|---|
| `node tests/phase65-full-tests-harness.test.js` | PASS — preservation assertions passed. |
| `node scripts/run-phase65-full-tests.mjs` | PASS — focused, extension, and root matrices passed with workspace identity preserved. |
| MCP preservation wrapper inside the authoritative runner | PASS — MCP build and commands completed with workspace identity preserved. |
| Phase 65 validation contract | PASS — 41/41 executable validation assertions and 10/10 UAT-ledger shape assertions. |
| Root suite reached through the authoritative runner | PASS — 1204/1204 broader contract assertions reported green. |
| `git diff --check 4aac3c8e..HEAD` over implementation/workflow/test scope | PASS. |

The runner is argv-only, non-recursive, and invokes the preservation wrapper. Root `npm test` contains the protected Phase 60 → Phase 64 → Phase 65 harness order, followed by one preserved MCP build and the Codex/full matrices. Linux CI contains exactly one step named `Phase 65 Codex contract (sole Linux root invocation)` running `npm test`, with the generalized Phase 62 drift smoke present exactly once and its dependencies green.

### Workspace preservation receipt

Before and after the authoritative run:

- status snapshot SHA-256 remained `466161ab4b11bb1ac87bd1c07d7dcbc35b7423d95dfbeb77044523b2a9590c90`;
- all 402 unrelated deletions remained present;
- the index remained empty of staged changes;
- the same four pre-existing dirty generated artifacts remained byte-identical:
  - `mcp/build/index.js` — `6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4`;
  - `showcase/angular/public/llms-full.txt` — `664347e0e6a30c276bdbdfea8bb2bfdf1242bd7d61fb6493de870fccd4ddd38e`;
  - `showcase/angular/public/llms.txt` — `c69ed23d415f8f9f097ec386e789372a3a8a71b011b4d4420bf09ee949587e76`;
  - `showcase/angular/public/sitemap.xml` — `826aa8f8b2bc828c423572a6b9697d0666a94a830b7aebbdf1812501e88c3bea`.

The human-UAT ledger hash also remained unchanged at `f7f1532d13e684dec290697800e9e131667d0ad6bc35dc6ddd3a2c6d6a2669ac`; verification did not mark any live step complete.

## Disconfirmation and Limits

The audit attempted to falsify the completion claim rather than treating green summaries as sufficient:

- **Partial exposure:** parent-tree inspection, exact changed-path comparison, and pickaxe history found no earlier production exposure.
- **Client-authored authority:** browser messages were traced through preflight, consent, supervisor re-detection, effective-authority attestation, and start echo; no client boolean or native evidence controls execution.
- **Foreign MCP inheritance:** full enabled-roster attestation replaces the earlier narrow lookup and rejects extra authority.
- **Premature success:** the terminal result remains private until parser, stream, process, tree, and cleanup completion.
- **Process leakage:** descendant settlement is covered on timeout, failure, interruption, spawn error, and successful response.
- **Credential leakage:** probe environments remove provider credentials/noise, output is byte-bounded and zeroized, and the browser sees only closed enums and sanitized events.
- **Misleading billing:** subscription/API buckets derive from accepted identity, `usd` is always null, and no raw profile or tool argument/result is rendered.
- **Test-only completion:** synthetic/VM/DOM tests establish deterministic contracts but not a genuine installed CLI, account transition, model run, browser rendering, or assistive-technology announcement. Those boundaries are exactly the three pending UAT scenarios below.

No unowned automated failure path, placeholder implementation, TODO-based completion claim, or unresolved CRITICAL/HIGH threat was found in phase scope.

## Tracking-Only Inconsistencies

These do not affect runtime behavior, tests, requirement satisfaction, or the no-gap conclusion:

1. `ROADMAP.md` reports Phase 65 as `8/8 | Complete` in the progress table, but its phase heading remains unchecked and its detail block still says `Plans: TBD`.
2. `65-UI-SPEC.md` frontmatter says `status: approved`, while its older checker-sign-off boxes remain unchecked and its approval line still says pending. The later final UI review is the authoritative audit result: zero warnings, zero blockers, with only live UAT outstanding.
3. `REQUIREMENTS.md` retains older baseline prose mentioning v0.9.91 and a “recorded” fixture. The accepted Phase 65 context narrows the executable contract to the schema-derived 0.142.5 fixture with `liveCapturePending: true`, while preserving the core requirement: schema pinning in CI and task-only `chatMode: false`.

These should be reconciled in normal project tracking, but changing them is outside this verification-only task and is not required to make Phase 65 functionally complete.

## Human Verification Required

Exactly the following three scenarios remain pending in `65-HUMAN-UAT.md`:

### UAT65-01 — genuine Codex auth-state and preflight matrix

With genuine ChatGPT, API-key, and signed-out Codex states, confirm the exact accepted identity, provider-panel billing/recovery copy, and auth-change invalidation immediately before execution. This requires real credential/account transitions and must not be inferred from detector fixtures.

### UAT65-02 — genuine Codex-to-browser task lifecycle

Run a real delegated Codex task through the daemon and browser. Observe sanitized streaming, cancellation, process cleanup, result publication only after completion, and the final tokens/turns/duration plus accepted billing caption with no fabricated dollar value. This is also where a genuine fixture may be captured and provenance updated under the approved process.

### UAT65-03 — live accessibility and responsive rendering

Exercise provider selection, consent, active run, cancellation, and completed feed states with keyboard and screen reader in light/dark themes, reduced motion, 200% zoom, and narrow layout. Confirm focus order/restoration, announcements, contrast, wrapping, and 44px targets in the actual browser.

## Gaps Summary

**Automated gaps: 0.**

The phase is implementation-complete and machine-verified. It remains `human_needed` solely for UAT65-01 through UAT65-03. The tracking-only inconsistencies above do not change that status.

---

*Verified 2026-07-22T18:38:20Z at `275d3e727ebaee995f05f94b69b767d9bc194490`.*
