# Requirements: FSB v0.10.0 Autopilot via Lattice SDK (attempt 2)

**Milestone:** v0.10.0 Autopilot via Lattice SDK (attempt 2)
**Branch:** `automation` (reset to merge-base with `main` on 2026-05-24)
**Customer:** FSB Chrome extension's autopilot loop (driven by Sidepanel UI and autopilot mode). The improvements are for the IN-EXTENSION agent loop; the same tool surface that MCP exposes is reused -- no parallel tool stacks.
**SDK direction:** [Lattice](https://github.com/LakshmanTurlapati/Lattice) -- in this attempt, FSB consumes Lattice as a path: dependency. Lattice is cloned at `./lattice/` (gitignored) on branch `fsb-integration-experiments`. SDK extensions land in Lattice's repo first; FSB integration glue lands in FSB's repo.
**Source-of-truth research:** TBD (to be regenerated for the Lattice-first approach via `/gsd-discuss-phase` + research synthesis)
**Phase numbering:** Reset to **Phase 1** for v0.10.0-attempt-2.
**Pivot context:** `.planning/milestones/v0.10.0-attempt-1-pre-pivot/PIVOT-v0.10.0-PLAN.md`

**Last updated:** 2026-05-24

---

## Goal

Improve FSB's task completion reliability by adopting [Lattice](https://github.com/LakshmanTurlapati/Lattice) as the autopilot engine's underlying SDK. Build the runtime primitives (state envelopes, tripwire safety contracts, observability primitives, delegation primitive, MV3-survivability adapters) inside Lattice on the `fsb-integration-experiments` branch, then have FSB's autopilot engine consume Lattice as a thin runtime adapter. The Lattice round-trip validates continuously during development rather than being deferred to an end-of-milestone smoke test.

The framing is still outcome-first: "whatever makes FSB do tasks better." Lattice is a means to that end. The pivot vs attempt-1 is that the primitives live in the SDK (Lattice) rather than in the consumer (FSB).

---

## Hard Invariants (NON-NEGOTIABLE -- gate every requirement)

- **INV-01 MCP wire contracts UNTOUCHED.** Every existing MCP-exposed tool's schema, semantics, and request/response shape stays byte-identical. Verified by `tests/tool-definitions-parity.test.js` between `extension/ai/tool-definitions.js` and `mcp/ai/tool-definitions.cjs`. Net-new tools (if any) must land byte-identically to BOTH registries in the SAME phase commit.
- **INV-02 Tool surface parity.** FSB's autopilot loop uses the SAME tool registry that MCP exposes (`TOOL_REGISTRY` in `extension/ai/tool-definitions.js`). No parallel "autopilot-only" tool stack. Any tool the autopilot uses, MCP clients can also use.
- **INV-03 Provider parity.** Every improvement must work equally across all 7 `universal-provider.js` targets (Anthropic, OpenAI, xAI, Gemini, LM Studio, OpenRouter, custom OpenAI-compatible). No improvement that regresses any single provider.
- **INV-04 MV3-survivability preserved.** The existing `setTimeout`-chained iterator pattern (`agent-loop.js:1824/2418/2487/2497`) is load-bearing for Chrome's 30s-silence + 5-min idle kill. No refactor that replaces this iterator pattern -- Lattice integration is additive runtime adaptation, not iterator replacement.
- **INV-05 No resurrection of deprecated modules.** `extension/agents/agent-executor.js` / `agent-manager.js` / `agent-scheduler.js` (DEPRECATED v0.9.45rc1, superseded by OpenClaw / Claude Routines) stay frozen. New code lands in fresh paths.
- **INV-06 (NEW) Lattice SDK primitives live in Lattice's repo, not in FSB's.** Any runtime primitive used by both FSB's autopilot and any potential future Lattice consumer goes into Lattice on `fsb-integration-experiments`. FSB-side code is integration glue (path: dependency wiring, MV3 runtime adapters, sidepanel UI) and never re-implements primitives that belong in Lattice.

---

## v1 Requirements (this milestone -- HIGH-LEVEL SCAFFOLD)

Detailed REQ-IDs are populated during phase planning (`/gsd-discuss-phase` + `/gsd-plan-phase`). The categories below sketch the scope.

### LSDK -- Lattice SDK Extensions (work in `./lattice` on `fsb-integration-experiments` branch)

Goal: extend Lattice's v1.1 Capability Receipts foundation with the primitives FSB's autopilot needs.

- [x] **LSDK-01..N (audit) -- DONE 2026-05-24 (Phase 01 Plan 01-01):** Lattice SDK gap survey landed at `lattice/docs/fsb-integration-gaps.md` (91 lines, 6 domain headers, 21 severity-tagged rows: Receipts=2, Tripwires/hooks=4, Providers=5, Delegation=1, MV3-survivability=2, Observability/step-markers=4). Severity tags drive Phase 2+ ordering (Blocker > Important > Nice-to-have). Lattice commit `195e5ae`. Concrete LSDK-NN REQ-IDs for each row are populated in Phase 2 setup (deferred per CONTEXT.md `<deferred>` block). Phase 01 Plan 01-01 also re-exported `createReceipt` + `CreateReceiptInput` from Lattice's bare specifier (commit `ab6c1f6`), and Plan 01-02 added a packaging fix (catalog: -> literals) so npm 11 can install via `file:` (Lattice commit `22bf986`, user-authorized D-13 expansion).
- [x] **LSDK-02 -- DONE 2026-05-24 (Phase 02 Plan 02-01):** CapabilityReceiptBody extended with 5 step-transition fields (`stepName`, `stepIndex`, `parentStepName`, `previousStepName`, `timestamp`) -- audit-doc Receipts row 2 covered. Fields are flat optional readonly top-level fields; v1 callers leave them undefined (backward compatible). Lattice commit `5c48134` on `fsb-integration-experiments` (NOT pushed -- D-15).
- [x] **LSDK-03 -- DONE 2026-05-24 (Phase 02 Plan 02-01):** CapabilityReceiptBody extended with `sessionId` field + schema version literal bumped to discriminated union `"lattice-receipt/v1" | "lattice-receipt/v1.1"` -- audit-doc Receipts row 3 covered. `createReceipt` applies a version-bump heuristic (any of the 6 step-marker fields set -> v1.1; otherwise v1). `verify.ts:asReceiptBody` accepts both literals; unknown literals still return `version-mismatch`. JCS canonical (canonical.ts) and redaction manifest (redact.ts) both BYTE-FROZEN. Lattice commit `5c48134`.
- [x] **LSDK-04 -- DONE 2026-05-24 (Phase 02 Plan 02-02):** Priority bands enum (`SAFETY=0` > `OBSERVABILITY=1` > `EXTENSION=2`) with lower-numbered-band-runs-first invariant + within-band registration-order preservation -- audit-doc Tripwires/hooks row 2 covered. New module `lattice/packages/lattice/src/contract/bands.ts` ships `createHookPipeline()` factory + `BAND` const + `BAND_ORDER`. The pure `evaluateTripwires` at `tripwire.ts:53-86` BYTE-FROZEN (D-06; bands.ts is a SIBLING primitive). Lattice commit `ba6172c` on `fsb-integration-experiments` (NOT pushed -- D-15).
- [x] **LSDK-05 -- DONE 2026-05-24 (Phase 02 Plan 02-02):** Per-handler matcher regex (opt-in via `RegisterOptions.matcher`) + race-with-log per-handler budget (default 100ms; configurable via `RegisterOptions.budgetMs`; HOOK_TIMEOUT emitted via `TracerLike.event?.()` on timeout with stable-identifier payload `{event, band, budgetMs, sessionId?, handlerIndex, elapsedMs}`) -- audit-doc Tripwires/hooks row 3 covered. No-abort `Promise.race` pattern (handler keeps running after timeout; pipeline continues to next handler). CD-01 RESOLVED. Lattice commit `ba6172c`.
- [x] **LSDK-06 -- DONE 2026-05-24 (Phase 02 Plan 02-02):** Frozen handler context -- each handler receives a `structuredClone` + `Object.freeze` view of the caller's context; mutations on the handler side do NOT leak back to the calling site -- audit-doc Tripwires/hooks row 4 covered. `freezeContext()` helper with try/catch fallback for unclonable inputs. Lattice commit `ba6172c`.
- [x] **LSDK-07 -- DONE 2026-05-24 (Phase 02 Plan 02-02):** Irreversible mid-session registration freeze -- `pipeline.freeze()` flips a boolean; subsequent `register()` throws `Error` with `name === "PIPELINE_FROZEN"` (constant `PIPELINE_FROZEN_ERROR_NAME`). `freeze()` is idempotent; `run()` still works after freeze -- audit-doc Tripwires/hooks row 5 covered. Lattice commit `ba6172c`.
- [x] **LSDK-08 -- DONE 2026-05-24 (Phase 02 Plan 02-02):** `HookLifecycleEvent` typed literal-union (`"BEFORE_PROVIDER" | "AFTER_PROVIDER" | "BEFORE_TOOL" | "AFTER_TOOL"`) shipping in `bands.ts` -- intentionally SEPARATE from `tracing.ts`'s `RunEventKind` (D-12). Run events describe Lattice runtime stages; lifecycle events describe pluggable hook attach-points. `tracing.ts` BYTE-FROZEN -- audit-doc additive-lifecycle row covered. Lattice commit `ba6172c`.
- [x] **LSDK-09 -- DONE 2026-05-24 (Phase 03 Plan 03-01 + Plan 03-02):** `"step.transition"` literal added as the 17th and final entry in Lattice's `RunEventKind` union at `lattice/packages/lattice/src/tracing/tracing.ts`. Dotted-namespace sibling of run.* / stage.* / provider.* / tool.* / replay.*. `RunEvent` interface BYTE-UNCHANGED (step fields ride in `metadata?: Record<string, unknown>` per D-03). Audit-doc Observability row 2 ("step.transition event kind + step.* sub-events") flipped Blocker -> Covered. Lattice commits `fd254c4` (tracing literal) + `acdbb8a` (public-surface re-export of `STEP_TRANSITION_EVENT_NAME` constant from `./contract/checkpoint.js`) + `7afd62f` (audit-doc closure).
- [x] **LSDK-10 -- DONE 2026-05-24 (Phase 03 Plan 03-01 + Plan 03-02):** `createCheckpointHook(options)` factory shipped at new sibling module `lattice/packages/lattice/src/contract/checkpoint.ts` (260 lines + 240-line test file with 15 vitest cases). Factory returns `HookHandler<CheckpointHookContext>`; caller registers on Phase 2's `HookPipeline` (typically `band: BAND.OBSERVABILITY`). Per invocation: emits exactly one `step.transition` tracer event AND (when signer provided) mints exactly one v1.1 Capability Receipt with step-marker fields populated -- the envelope IS the inspector record. Best-effort mint (D-07): signer failures absorbed via try/catch, surfaced as `metadata.mintError`, no upstream throw. Audit-doc Observability row 3 ("Inspector envelope shape that Lattice can sign as a Capability Receipt directly") flipped Blocker -> Covered. Lattice commits `a67f476` (factory + tests) + `acdbb8a` (public-surface re-export of `createCheckpointHook` + `DEFAULT_CHECKPOINT_BAND` + `CheckpointHookContext` + `CheckpointHookOptions`) + `7afd62f` (audit-doc closure).
- [x] **LSDK-11 -- DONE 2026-05-24 (Phase 03 Plan 03-01 + Plan 03-02):** `STEP_TRANSITION_EVENT_NAME = "step.transition"` constant + `DEFAULT_CHECKPOINT_BAND = BAND.OBSERVABILITY` constant exported from `./contract/checkpoint.ts` for caller clarity at the registration site (D-06 documented convention; factory does NOT auto-register). Re-exported via Lattice's flat public surface at `src/index.ts` so FSB consumes via `lattice.STEP_TRANSITION_EVENT_NAME` + `lattice.DEFAULT_CHECKPOINT_BAND`. Lattice commits `a67f476` + `acdbb8a`.
- [x] **LSDK-12 -- DONE 2026-05-24 (Phase 03 Plan 03-01 + Plan 03-02):** `CheckpointHookContext` interface (`stepName`, `stepIndex`, optional `parentStepName`, optional `previousStepName`, `timestamp` -- all readonly stable identifiers per D-04 carryforward) + `CheckpointHookOptions` interface (`runId` required; optional `tracer`, `signer`, `sessionId`, `model`, `route`, `contractVerdict`) exported from `./contract/checkpoint.ts` and re-exported from the public surface as type-only exports. Lattice commits `a67f476` + `acdbb8a`.
- [x] **LSDK-13 -- DONE 2026-05-24 (Phase 03 Plan 03-01):** TDD coverage for the checkpoint factory -- `checkpoint.test.ts` with 15 vitest cases across 7 describe blocks (factory identity, tracer-only mode, signer mode mint+verify round-trip, best-effort mint signer-throws, 3-call linked-list threading, HookPipeline integration, tracer-absent mint-still-works). Real signer (`createInMemorySigner` over `generateEd25519KeyPairJwk` ephemeral keypair) and real verifier (`verifyReceipt` + `createMemoryKeySet`) -- no static-text grep, no mock-only signatures. Lattice suite advanced 332 -> 347 PASS; baseline preserved through Plan 03-02 (re-export adds zero tests). Lattice commit `a67f476`.
- [x] **LSDK-14 -- DONE 2026-05-24 (Phase 04 Plan 04-01):** Anthropic provider adapter shipped at `lattice/packages/lattice/src/providers/anthropic.ts` (161 lines) -- FULL custom adapter for Anthropic's `/v1/messages` API with TOP-LEVEL `system` field (D-07 preserved; NOT folded into `messages` array) and `content[0].text` response parsing. Mirrors FSB universal-provider.js production shape at `extension/ai/universal-provider.js:280-297` (request) and `:566-573` (response/usage). Headers: `x-api-key: <runtime apiKey>` (no Bearer prefix), `anthropic-version: 2023-06-01` (default; override accepted), `content-type: application/json`. Usage extraction: `input_tokens` -> `promptTokens`, `output_tokens` -> `completionTokens` (NOT prompt_tokens/completion_tokens). AbortSignal wired via `...(request.signal !== undefined ? { signal: request.signal } : {})` (D-05 spread pattern). Non-OK status throws `Error("Anthropic provider failed with ${status}.")`. Pricing: when `pricing.inputPer1kTokens` and/or `pricing.outputPer1kTokens` supplied, `normalizedUsage.costUsd` computed; when omitted, `costUsd === null`. Companion vitest file `anthropic.test.ts` ships 9 cases (D-09 mandates 7+ minimum): factory identity, request shape, response parsing, usage extraction, error handling, pricing, AbortSignal wiring + 2 Anthropic-specific cases (top-level system non-merged into messages per D-07, header wiring with no Bearer prefix). All 9 cases PASS standalone; full Lattice suite 347 -> 356 PASS with no regressions. Lattice commit `cf31d82275bc7ee3bfabbcd740ec0a0a68ed1f49` on `fsb-integration-experiments` (NOT pushed -- D-19) with `Ref: FSB v0.10.0-attempt-2 Phase 4` footer.
- [x] **LSDK-15 -- DONE 2026-05-24 (Phase 04 Plan 04-02):** Gemini provider adapter shipped at `lattice/packages/lattice/src/providers/gemini.ts` (176 lines) -- FULL custom adapter for Google's Generative Language API at `/v1beta/models/{model}:generateContent`. Request shape: `contents[].parts[].text` (NOT OpenAI's `messages[]`); `role: "user"` for outbound turns and `role: "model"` for assistant turns preserved per D-07 (NOT `"assistant"`/`"system"`). `generationConfig` carries `temperature: 0.7`, `topP: 0.9`, `maxOutputTokens: 2000`. `safetySettings` ships 4 HARM_CATEGORY entries (HARASSMENT / HATE_SPEECH / SEXUALLY_EXPLICIT / DANGEROUS_CONTENT) at `BLOCK_NONE` thresholds (FSB convention mirrored from `extension/ai/universal-provider.js:255-272`). Authentication via `?key=<apiKey>` query string (NOT a header); both model name AND apiKey passed through `encodeURIComponent` to harden against URL-unsafe model IDs (T-04-02-02) and query-string injection (T-04-02-01). Response parsing: `text = String(body.candidates?.[0]?.content?.parts?.[0]?.text ?? "")` per `universal-provider.js:555`. Missing-candidates empty-array on 200 OK throws `Error("Gemini provider returned no candidates.")` mirroring `universal-provider.js:552-554`. Usage extraction: `usageMetadata.promptTokenCount` -> `promptTokens`, `usageMetadata.candidatesTokenCount` -> `completionTokens`, `usageMetadata.totalTokenCount` -> `totalTokens` (Gemini-specific naming, distinct from OpenAI and Anthropic). AbortSignal wired via spread pattern `...(request.signal !== undefined ? { signal: request.signal } : {})` per D-05. Non-OK throws `Error("Gemini provider failed with ${status}.")`. Pricing: when `pricing.inputPer1kTokens` and/or `pricing.outputPer1kTokens` supplied, `normalizedUsage.costUsd` computed; when omitted, `costUsd === null`. Companion vitest file `gemini.test.ts` ships 10 cases (D-09 mandates 7+ minimum): factory identity, request shape with safetySettings, response parsing, usage extraction, error handling, pricing, AbortSignal wiring + 3 Gemini-specific cases (missing-candidates empty-array throw, `?key=<apiKey>` + `:generateContent` URL wiring, D-07 role mapping `user`/`model` preserved -- NOT `assistant`/`system`). All 10 cases PASS standalone; full Lattice suite 356 -> 366 PASS / 33 -> 34 test files with no regressions. Lattice commit `7a32b00cf3ad9691bb42660a06335f5e9a3b5af3` on `fsb-integration-experiments` (NOT pushed -- D-19) with `Ref: FSB v0.10.0-attempt-2 Phase 4` footer.
- [ ] **LSDK-16..18 (TBD):** Remaining provider adapter extensions -- xAI / OpenRouter / LM Studio thin wrappers around `createOpenAICompatibleProvider` (Plan 04-03), public-surface re-exports + INV-03 parity smoke (Plan 04-04), FSB-side surface-presence smoke + ceremony closure (Plan 04-05).
- [ ] **LSDK-LL..P (TBD):** Task-delegation primitive shape (if Lattice opens multi-agent policy; otherwise design as a Lattice-adjacent FSB-side primitive that consumes Lattice's receipt + tripwire surface).
- [ ] **LSDK-PP..Q (TBD):** MV3-survivability adapter contract -- documented interface for runtimes whose execution context can be evicted mid-flow.

### FINT -- FSB Integration Layer (work in `automation` branch)

Goal: wire FSB's autopilot engine to Lattice as a path: dependency.

- [x] **FINT-01 (path:dep wiring + Node smoke) -- DONE 2026-05-24 (Phase 01 Plan 01-02):** `"lattice": "file:./lattice/packages/lattice"` landed in `package.json` (line 81); `node_modules/lattice` resolves as a working symlink; `tests/lattice-smoke.test.js` appended to `scripts.test` chain and exercises the FSB <-> Lattice round-trip via dynamic `await import('lattice')` from a CJS test file (29 PASS / 0 FAIL). Real-runtime invocation of `lattice.createReceipt` + `lattice.verifyReceipt` with an ephemeral Ed25519 keypair per run (no committed key material). MV3 SW + sidepanel in-extension load DEFERRED to a future bundler-aware phase per Option B reconciliation (no `extension/*` modifications in Phase 1). Manual MV3 sanity reload (D-12 #3 AMENDED) DEFERRED-PENDING-UAT per user directive. FSB commits: `658ed87e`, `1545c14c`, `be95d158`. Cross-repo audit trail at `.planning/LATTICE-PIN.md`.
- [ ] **FINT-NN..M (TBD):** Adapt FSB's `runAgentLoop` to emit step transitions through Lattice's receipt API (replacing the FSB-only `setStepMarker` helper from v0.10.0-attempt-1).
- [ ] **FINT-MM..K (TBD):** Adapt FSB's safety / observability / extension hooks to Lattice's tripwire band system (replacing the FSB-only HookPipeline from v0.10.0-attempt-1).
- [ ] **FINT-KK..L (TBD):** Adapt FSB's `universal-provider.js` to Lattice's provider abstraction OR keep FSB-side and align signatures.
- [ ] **FINT-LL..P (TBD):** Sidepanel Agent State Inspector view consuming Lattice's receipt timeline (single source of truth for both display + future signing).
- [ ] **FINT-PP..Q (TBD):** SW eviction resumption via Lattice's MV3-survivability adapter contract (replacing the FSB-only `_al_handleRestoredMode` from v0.10.0-attempt-1).

### MCP -- Wire-Contract Non-Regression (Phase N + cross-cutting)

Goal: prove INV-01 (MCP wire contracts UNTOUCHED) and INV-02 (tool surface parity) hold across every Lattice-integration change.

- [x] **MCP-01 -- HOLDING through Phase 01 (2026-05-24):** `tests/tool-definitions-parity.test.js` continues to pass byte-identically pre/post Phase 01 (142 PASS / 0 FAIL at SUMMARY-write time). Verified at every Plan 01-02 task gate. Re-verified at end of Phase 01 plans. Will be re-verified at every future v0.10.0-attempt-2 phase gate.
- [x] **MCP-02 -- HOLDING through Phase 01 (2026-05-24):** Lattice `file:` dependency introduction did NOT mutate `TOOL_REGISTRY`. `git status --porcelain extension/ai/tool-definitions.js mcp/ai/tool-definitions.cjs` empty across the entire plan. Tool registry surface is byte-identical to the pre-Phase-1 baseline.
- [ ] **MCP-03..N (TBD):** Additional MCP non-regression checks as Lattice integration phases land.

### PRV -- Provider Parity (Phase N + cross-cutting)

Goal: prove INV-03 holds across all 7 providers after Lattice-driven provider adapter alignment.

- [ ] **PRV-01..N (TBD):** Per-provider regression suite after each Lattice integration phase.

---

## Out of Scope (explicit exclusions)

- **OOS-01 FSB-side primitive re-implementation.** v0.10.0-attempt-1 built its own hook pipeline + checkpoint-hook + step-marker layer + session-resume dispatcher inside FSB. Attempt-2 does NOT re-build these; if FSB needs them, Lattice gets them first per INV-06.
- **OOS-02 Multi-agent crews / agent-team orchestration** (CrewAI / AutoGen style). Wrong domain for FSB. Lattice also currently excludes this; if Lattice opens its multi-agent policy mid-milestone, delegation primitive becomes in-scope.
- **OOS-03 Coding-agent patterns** (Aider / Cline / OpenCode diff-then-apply). Wrong domain.
- **OOS-04 Skills primitive (full domain-specific tool+prompt loading)** -- deferred to v0.11.0+.
- **OOS-05 Replacing the `setTimeout`-chained iterator pattern.** INV-04. Lattice integration is additive runtime adaptation.
- **OOS-06 Streaming-aware hook events / chunk-level events.** Provider-parity violation (INV-03) for Gemini single-shot path.
- **OOS-07 Auto-fetching skills from URLs.** Highest-risk skills anti-pattern.
- **OOS-08 Resurrection of `extension/agents/*`.** INV-05.
- **OOS-09 v0.9.70 Showcase Dashboard work** (streaming fix, Sync-tab restore, 16:10 viewport). Continues in parallel on `main`.
- **OOS-10 Telemetry surface follow-ups** (first-run banner, "View what we send", region-gated opt-in, etc.). Carry-forward from v0.9.69.
- **OOS-11 Showcase i18n carry-forwards.** Carry-forward from v0.9.63 / v0.9.65.

---

## Reference: v0.10.0-attempt-1 (archived)

The FSB-first attempt shipped Phase 1 hooks-foundation (priority bands, matcher, race-with-log, freeze, 5 new lifecycle events, lockBand, telemetry-hook, MCP-04 byte-identity passthrough, MCP-05 TOOL_REGISTRY freeze, PRV-02 hook-event-count parity) and Phase 2 state-inspectability-carve-out (LIFECYCLE_EVENTS.STEP_TRANSITION, checkpoint-hook.js with Lattice receipt-shape envelope, 12 step markers in runAgentIteration, additive persistSession schema, sidepanel Agent State Inspector view, full MV3 SW eviction resumption with CONSERVATIVE recovery for mid-API-request and mid-tool-dispatch). 617/617 test assertions green. The patterns themselves are intellectually correct; attempt-2 moves them into Lattice instead of duplicating them in FSB.

Archived under:
- Branch: `pre-pivot-archive/v0.10.0-fsb-first`
- On-disk: `.planning/milestones/v0.10.0-attempt-1-pre-pivot/` (full Phase 1 + Phase 2 artifact sets including 981-line RESEARCH.md, 694-line UI-SPEC.md, threat models, verification reports)

---

## Traceability

To be populated during phase planning. Each REQ-ID will map to exactly one phase. 100% coverage verified by `gsd-plan-checker` before execution.

| REQ-ID | Phase | Status |
|--------|-------|--------|
| LSDK-01 | 01 | Complete (Phase 01 Plan 01-01: gap survey + createReceipt re-export) |
| FINT-01 | 01 | Complete (Phase 01 Plan 01-02: file: dep wiring + 29 PASS smoke) |
| MCP-01 | cross-cutting (Phase 01..N) | Holding (Phase 01 verified) |
| MCP-02 | cross-cutting (Phase 01..N) | Holding (Phase 01 verified) |
| LSDK-02 | 02 | Complete (Phase 02 Plan 02-01: step-transition fields on CapabilityReceiptBody; Lattice commit 5c48134) |
| LSDK-03 | 02 | Complete (Phase 02 Plan 02-01: sessionId field + schema version bumped to v1.1 literal-union; Lattice commit 5c48134) |
| LSDK-04 | 02 | Complete (Phase 02 Plan 02-02: priority bands enum + lower-band-first + within-band registration-order; Lattice commit ba6172c) |
| LSDK-05 | 02 | Complete (Phase 02 Plan 02-02: per-handler matcher regex + no-abort race-with-log + HOOK_TIMEOUT via TracerLike; Lattice commit ba6172c) |
| LSDK-06 | 02 | Complete (Phase 02 Plan 02-02: structuredClone + Object.freeze handler context; Lattice commit ba6172c) |
| LSDK-07 | 02 | Complete (Phase 02 Plan 02-02: irreversible pipeline.freeze() + PIPELINE_FROZEN error name; Lattice commit ba6172c) |
| LSDK-08 | 02 | Complete (Phase 02 Plan 02-02: HookLifecycleEvent literal-union separate from RunEventKind; Lattice commit ba6172c) |
| LSDK-09 | 03 | Complete (Phase 03 Plan 03-01 + Plan 03-02: step.transition literal in RunEventKind union; Lattice commits fd254c4 + acdbb8a + 7afd62f) |
| LSDK-10 | 03 | Complete (Phase 03 Plan 03-01 + Plan 03-02: createCheckpointHook factory; Lattice commits a67f476 + acdbb8a + 7afd62f) |
| LSDK-11 | 03 | Complete (Phase 03 Plan 03-01 + Plan 03-02: STEP_TRANSITION_EVENT_NAME + DEFAULT_CHECKPOINT_BAND constants; Lattice commits a67f476 + acdbb8a) |
| LSDK-12 | 03 | Complete (Phase 03 Plan 03-01 + Plan 03-02: CheckpointHookContext + CheckpointHookOptions interfaces; Lattice commits a67f476 + acdbb8a) |
| LSDK-13 | 03 | Complete (Phase 03 Plan 03-01: checkpoint.test.ts 15 vitest cases; Lattice commit a67f476) |
| LSDK-14 | 04 | Complete (Phase 04 Plan 04-01: Anthropic full-custom adapter + 9 vitest cases; Lattice commit cf31d82) |
| LSDK-15 | 04 | Complete (Phase 04 Plan 04-02: Gemini full-custom adapter + 10 vitest cases; Lattice commit 7a32b00) |
| (more) | (TBD) | Pending |

**Total v1 requirements:** TBD (17 concrete so far; remaining LSDK/FINT/MCP/PRV IDs populated during downstream phase planning)
