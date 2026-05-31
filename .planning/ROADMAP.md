# Roadmap

**Status:** v0.10.0 (attempt 2) -- In progress. Phases 1-5 complete; Phases 6-7 inserted 2026-05-27 to close the FINT-KK..L Lattice-provider-consumption gap after the `xai-key-rejected-400` debug surfaced that FSB's custom `universal-provider.js` runtime path has defects (missing trim + stale storage read) that Lattice's adapters do not. Phase 8 (delegation primitive) remains deferred to v0.11.0+. UAT-1 (consolidated single Chrome MV3 reload) deferred to Phase 7 end. Pivot from v0.10.0-attempt-1 (FSB-first) committed 2026-05-24; see `.planning/milestones/v0.10.0-attempt-1-pre-pivot/PIVOT-v0.10.0-PLAN.md` for the rationale.

**Branch posture:** `automation` branch reset to `51bdbb36` (merge-base with `main`). Pre-pivot work preserved on `pre-pivot-archive/v0.10.0-fsb-first`. Lattice cloned into `./lattice/` (gitignored) on branch `fsb-integration-experiments`. FSB will consume Lattice via `npm install ./lattice` (path: dependency) or `npm link`.

**Phase numbering:** v0.10.0-attempt-2 resets phase numbering to start at **1**. v0.9.69 ended at phase 276; v0.10.0-attempt-1 used phases 1-2 (now archived). v0.10.0-attempt-2 uses phases 1-N (TBD).

---

## Active Milestone: v0.10.0 Autopilot via Lattice SDK (attempt 2)

**Goal:** Improve FSB's task completion reliability by treating Lattice as the underlying SDK. Build the SDK primitives (state envelopes, tripwire safety contracts, provider adapters, delegation primitive) inside the Lattice repo on the `fsb-integration-experiments` branch, then consume Lattice from FSB as a path: dependency. FSB's autopilot engine becomes a thin browser-runtime layer over Lattice's primitives.

**Why this matters:** v0.10.0-attempt-1 invented the same patterns inside FSB and planned to port them to Lattice later via separate PRs. That created duplication risk (FSB's checkpoint-hook + Lattice's signed-receipt are conceptually the same shape but live in two repos) and deferred the Lattice round-trip validation. Attempt-2 inverts: Lattice owns the primitives, FSB consumes; the Lattice round-trip happens continuously during development.

**Lattice integration model:**
- Lattice repo cloned at `./lattice/` (developer-side experimental sandbox; not tracked by FSB git)
- Lattice's `fsb-integration-experiments` branch carries the SDK extensions FSB needs
- FSB depends on `./lattice` via `package.json` `path:` dependency or `npm link` during development
- Lattice's existing v1.1 Capability Receipts (451 tests) is the starting baseline
- SDK additions land as commits on Lattice's `fsb-integration-experiments` branch first; once validated by FSB integration, open PRs to Lattice mainline as separate work

**Lattice SDK extension candidates (to be scoped during phase discussion):**
- Receipt-shaped state envelopes for any agent-loop runtime (not just Lattice's own server-side runtime); MV3-survivable encoding
- Tripwire safety contracts with priority bands (SAFETY > OBSERVABILITY > EXTENSION) + matcher regex + race-with-log budget + frozen contexts
- Universal-provider adapters for the 7 FSB providers (Anthropic, OpenAI, xAI, Gemini, LM Studio, OpenRouter, custom OpenAI-compatible) -- Lattice currently has its own provider abstraction; needs gap analysis
- Task-delegation primitive (parent-child loops with summary-return + cache-prefix sharing + rate-limit-group coordination) -- Lattice's "Out of Scope" excludes multi-agent; may require Lattice-policy discussion
- Step-marker / observability primitive -- inspector envelope shape Lattice can sign as a Capability Receipt directly

**Hard invariants (non-negotiable, carried over from v0.10.0-attempt-1):**
- **INV-01 MCP wire contracts UNTOUCHED.** Tool schemas, semantics, request/response shapes of every existing MCP-exposed tool stay byte-identical. Net-new tools (if any) land byte-identically to `extension/ai/tool-definitions.js` AND `mcp/ai/tool-definitions.cjs` in the SAME commit.
- **INV-02 Tool surface parity.** FSB's autopilot loop uses the SAME tool registry that MCP exposes (`TOOL_REGISTRY` in `extension/ai/tool-definitions.js`). No parallel "autopilot-only" tool stack.
- **INV-03 Provider parity.** Every improvement works equally across all 7 `universal-provider.js` targets. No single-provider regression. LM Studio is the canary for latency tail regressions.
- **INV-04 MV3-survivability preserved.** The existing `setTimeout`-chained iterator pattern at `agent-loop.js:1824/2418/2487/2497` is load-bearing for Chrome's 30s-silence + 5-min idle kill. Lattice integration must NOT replace this iterator pattern.
- **INV-05 No resurrection of deprecated modules.** `extension/agents/agent-executor.js` / `agent-manager.js` / `agent-scheduler.js` (DEPRECATED v0.9.45rc1) stay frozen.
- **INV-06 (NEW) Lattice SDK changes happen in the Lattice repo first.** No primitive lives in FSB-only; if FSB needs a primitive, the primitive goes into Lattice on `fsb-integration-experiments`. FSB-side code is integration glue and runtime adapters, not the primitive itself.

## Phases

(To be detailed via `/gsd-discuss-phase` / `/gsd-plan-phase` workflow.)

- [x] **Phase 1: Lattice SDK gap survey + integration scaffolding** -- Plans: 2/2 COMPLETE 2026-05-24. Audit Lattice v1.1 across 6 surfaces (receipts, tripwires/hooks, providers, delegation, MV3-survivability, observability/step-markers); land the audit doc on Lattice's `fsb-integration-experiments` branch; wire FSB to consume Lattice via `file:` npm dependency; prove round-trip via real-runtime Node smoke that mints + verifies one Capability Receipt. Per Option B reconciliation: no in-extension Lattice import in Phase 1 (deferred to a future bundler-aware phase). Phase verifier + milestone UAT pending. Plans:
  - [x] `01-01-PLAN.md` -- Lattice-side: verify branch, build dist/, add single-line `createReceipt` re-export to `src/index.ts`, author 6-surface audit doc, conventional-commit with `Ref: FSB v0.10.0-attempt-2 Phase 1` footer (D-14), no push (D-15). **COMPLETE 2026-05-24 -- Lattice commits ab6c1f6 + 195e5ae; SUMMARY at .planning/phases/01-lattice-gap-survey-scaffold/01-01-SUMMARY.md.**
  - [x] `01-02-PLAN.md` -- FSB-side: add `"lattice": "file:./lattice/packages/lattice"` dep + append smoke to `scripts.test`, run `npm install`, create `tests/lattice-smoke.test.js` (real-runtime mint + verify round-trip with ephemeral Ed25519 keypair), create `.planning/LATTICE-PIN.md` audit-trail, manual MV3 sanity reload checkpoint, single `feat(phase-1):` commit. **COMPLETE 2026-05-24 -- FSB commits 658ed87e + 1545c14c + be95d158 + e3cd7fb5 (pause record); Lattice catalog-fix commit 22bf986 (user-authorized D-13 expansion); SUMMARY at .planning/phases/01-lattice-gap-survey-scaffold/01-02-SUMMARY.md; Task 4 (manual MV3 reload) DEFERRED-PENDING-UAT per user directive "continue all phases with GSD autonomous; UAT will be at the end".**
- [x] **Phase 2: Lattice tripwire + receipt primitives extension** -- Plans: 5/5 COMPLETE 2026-05-24. Receipt v1.1 schema (6 optional step-marker fields + literal-union version + verifier accepts both); bands.ts pipeline (priority bands SAFETY/OBSERVABILITY/EXTENSION + matcher regex + race-with-log per-handler budget + frozen-context + irreversible freeze + HookLifecycleEvent union); 6 audit-doc rows closed + 1 new lifecycle row; FSB smoke `tests/lattice-tripwire-smoke.test.js` 39 PASS. Lattice HEAD `97836f2c` (5 commits: 5c48134 receipts + 2110e19 public-surface test fix + ba6172c bands.ts + 00fcfac re-export + 97836f2 audit-doc). LSDK-02..08 populated.
  Plans:
  - [x] `02-01-PLAN.md` (W1) -- Lattice-side receipts extension: CapabilityReceiptBody.version literal-union to v1.1; six new optional step-marker fields; verify.ts accepts both literals; vitest cases for mint + verify backward-compat; one Lattice commit `feat(receipts):`. Closes LSDK-02, LSDK-03.
  - [x] `02-02-PLAN.md` (W2) -- Lattice-side bands.ts + bands.test.ts: createHookPipeline factory (priority bands, matcher regex, race-with-log budget, frozen context, irreversible freeze, HookLifecycleEvent union). One Lattice commit `feat(contract):`. Closes LSDK-04 through LSDK-08.
  - [x] `02-03-PLAN.md` (W3) -- Lattice-side public-surface re-export bump + audit-doc row flips: src/index.ts re-exports createHookPipeline + types; dist/ rebuilt; lattice/docs/fsb-integration-gaps.md 6 closed rows + 1 new lifecycle row. Two Lattice commits.
  - [x] `02-04-PLAN.md` (W4) -- FSB-side real-runtime smoke: tests/lattice-tripwire-smoke.test.js (>= 20 PASS assertions exercising all Phase 2 primitives end-to-end); package.json scripts.test chain extended; Phase 1 smoke byte-frozen.
  - [x] `02-05-PLAN.md` (W5) -- FSB-side audit-trail closure: .planning/LATTICE-PIN.md current_lattice_sha bumped + Phase 2 row appended; .planning/REQUIREMENTS.md LSDK-02 through LSDK-08 populated.
- [x] **Phase 3: Observability + step-markers extension** -- Plans: 3 plans across 3 waves. STEP_TRANSITION typed event, checkpoint-hook factory, per-step receipt mint. Builds on Phase 2 receipt-shape extensions.
  Plans:
  - [x] `03-01-PLAN.md` (W1) -- Lattice-side tracing + checkpoint factory: one-line addition of `"step.transition"` to RunEventKind in tracing.ts; new sibling module checkpoint.ts shipping createCheckpointHook factory + checkpoint.test.ts (~12 vitest cases). Two Lattice commits. Closes LSDK-09, LSDK-10, LSDK-11, LSDK-12, LSDK-13 (Lattice-side). **COMPLETE 2026-05-24 -- Lattice commits fd254c4 (tracing.ts) + a67f476 (checkpoint.ts+test.ts) on fsb-integration-experiments (not pushed); Lattice 332->347 PASS; SUMMARY at .planning/phases/03-observability-step-markers-extension/03-01-SUMMARY.md.**
  - [x] `03-02-PLAN.md` (W2) -- Lattice-side public-surface re-export + audit-doc flips: src/index.ts re-exports createCheckpointHook + CheckpointHookOptions + CheckpointHookContext + STEP_TRANSITION_EVENT_NAME + DEFAULT_CHECKPOINT_BAND; dist/ rebuilt; 2 Observability/step-markers Blocker rows flipped to Covered with backlink SHAs. Two Lattice commits. Depends on Plan 03-01. **COMPLETE 2026-05-24 -- Lattice commits acdbb8a (src/index.ts re-export) + 7afd62f (audit-doc closure) on fsb-integration-experiments (not pushed; Lattice HEAD 7afd62f); Lattice 347 PASS preserved; SUMMARY at .planning/phases/03-observability-step-markers-extension/03-02-SUMMARY.md.**
  - [x] `03-03-PLAN.md` (W3) -- FSB-side real-runtime smoke + ceremony: tests/lattice-checkpoint-smoke.test.js (>=20 PASS exercising 3-step fake sequence with linear + nested-child threading); package.json scripts.test chain extended; LATTICE-PIN.md frontmatter SHA bumped + Phase 3 row appended; REQUIREMENTS.md LSDK-09..LSDK-13 populated. One atomic FSB commit. Depends on Plan 03-02.
- [x] **Phase 4: Provider adapter alignment** -- Plans: 5 plans across 3 waves. 5 native Lattice provider adapters (Anthropic + Gemini full custom; xAI + OpenRouter + LM Studio thin wrappers around createOpenAICompatibleProvider); INV-03 provider-parity proof via Lattice-side parity.test.ts iterating all 7 logical providers; FSB-side surface-presence smoke for ceremony parity. Closes 5 Providers audit-doc rows; populates LSDK-14..18.
  Plans:
  - [x] `04-01-PLAN.md` (W1) -- Lattice-side Anthropic adapter + tests: anthropic.ts (full custom; /v1/messages with top-level system field + content[0].text response shape; x-api-key + anthropic-version headers) + anthropic.test.ts (9 vitest cases covering D-09 7-case contract + 2 Anthropic-specific cases). One Lattice commit `feat(providers): add Anthropic provider adapter`. Closes LSDK-14 (Lattice-side). **COMPLETE 2026-05-24 -- Lattice commit cf31d82; SUMMARY at .planning/phases/04-provider-adapter-alignment/04-01-SUMMARY.md.**
  - [x] `04-02-PLAN.md` (W1) -- Lattice-side Gemini adapter + tests: gemini.ts (full custom; /v1beta/models/{model}:generateContent with contents[].parts[].text request shape + candidates[0].content.parts[0].text response + 4 HARM_CATEGORY safetySettings at BLOCK_NONE + ?key= query-string auth + role user/model preserved per D-07) + gemini.test.ts (10 vitest cases). One Lattice commit `feat(providers): add Gemini provider adapter`. Closes LSDK-15 (Lattice-side). **COMPLETE 2026-05-24 -- Lattice commit 7a32b00; SUMMARY at .planning/phases/04-provider-adapter-alignment/04-02-SUMMARY.md.**
  - [x] `04-03-PLAN.md` (W1) -- Lattice-side xAI + OpenRouter + LM Studio thin wrappers + tests: 3 new .ts + 3 .test.ts files. xAI preserves completion_tokens_details.reasoning_tokens quirk per D-07; OpenRouter model-routing array DEFERRED per D-17; LM Studio noAuth default per CD-03 + latency-tail diagnostics DEFERRED per D-16. Three Lattice commits (one per adapter). Closes LSDK-16/17/18 (Lattice-side). **COMPLETE 2026-05-24 -- Lattice commits 09a495e (xAI) + 1cfc13c (OpenRouter) + 40457ff (LM Studio); 24 vitest cases (9/7/8); Lattice 366 -> 390 PASS / 37 test files; SUMMARY at .planning/phases/04-provider-adapter-alignment/04-03-SUMMARY.md.**
  - [x] `04-04-PLAN.md` (W2) -- Lattice-side public-surface re-exports + INV-03 parity smoke + audit-doc closure: src/index.ts re-exports 5 new factories + option types; parity.test.ts iterating 7 logical providers (7 vitest cases); 5 Providers audit-doc rows flipped to Covered with backlink SHAs; dist/ rebuilt. Three Lattice commits (api re-export + parity test + docs). Depends on Plans 04-01 + 04-02 + 04-03.
  - [x] `04-05-PLAN.md` (W3) -- FSB-side real-runtime smoke + ceremony: tests/lattice-providers-smoke.test.js (>=20 PASS; ~38 actual; 5 factories invoked with stub options + fake fetch); package.json scripts.test chain extended; LATTICE-PIN.md frontmatter SHA bumped to post-Plan-04-04 Lattice HEAD + Phase 4 row appended referencing all 8 Phase 4 Lattice commits; REQUIREMENTS.md LSDK-14..18 populated + 5 traceability rows. One atomic FSB commit `feat(04): ship Phase 4 provider-adapter alignment (surface-presence smoke + audit-trail closure)`. Depends on Plan 04-04.
- [x] **Phase 5: MV3-survivability adapter contract + bundler infra + hybrid offscreen Lattice host** -- Plans: 6 plans across 4 waves. Lattice-side SurvivabilityAdapter<TState> contract + createNoopSurvivabilityAdapter ref impl + 12+ vitest cases; FSB-side esbuild bundler infra (behavior-free per D-06); hybrid offscreen Lattice host (first in-extension Lattice consumption surface; background.js BYTE-FROZEN per D-17); FSB standalone runtime adapter over chrome.storage.session (feature-flag gated default-off per D-20; CONSERVATIVE recovery wiring OUT OF SCOPE per D-22); Node-side survivability smoke (>= 25 PASS); LATTICE-PIN bump + REQUIREMENTS.md LSDK-19..22 + FINT-03..06 traceability. Closes 2 MV3-survivability audit-doc Blocker rows.
  Plans:
  - [x] `05-01-PLAN.md` (W1) -- FSB-side esbuild bundler infrastructure (behavior-free per D-06): package.json devDeps + scripts.build; new esbuild.config.js (per-entrypoint bundles per D-02; extension/dist/ output per D-03 + CD-A; sourcemap strategy per D-04); .gitignore extension/dist/. ZERO manifest.json change; ZERO behavior diff. ONE FSB commit. Closes FINT-03.
  - [x] `05-02-PLAN.md` (W1) -- Lattice-side SurvivabilityAdapter contract: lattice/packages/lattice/src/runtime/survivability.ts (interface + 4 supporting types + createNoopSurvivabilityAdapter ref impl per D-07..D-11) + survivability.test.ts (12+ vitest cases per D-12; real createReceipt + verifyReceipt integration in Tests 11-12). ResumePolicy literal-union per CD-E: SAFE | RECOVERY_AMBIGUOUS | ON_ERROR_SW_EVICTION_MID_REQUEST | ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH (carries forward attempt-1 02-04-PLAN.md taxonomy). ONE Lattice commit on fsb-integration-experiments with Ref footer; no push. Closes LSDK-19 + LSDK-20.
  - [x] `05-03-PLAN.md` (W2) -- Lattice public-surface re-export + audit-doc closure: src/index.ts re-exports createNoopSurvivabilityAdapter + 5 types per D-13; dist/ rebuilt via tsdown; lattice/docs/fsb-integration-gaps.md 2 MV3-survivability Blocker rows flipped to Covered with backlink SHAs per D-14. TWO Lattice commits with Ref footers; no push. Depends on Plan 05-02. Closes LSDK-21 + LSDK-22.
  - [x] `05-04-PLAN.md` (W3) -- FSB hybrid offscreen Lattice host: new extension/offscreen/lattice-host.html (script type="module") + lattice-host.js (ESM bundle-input importing from 'lattice' bare specifier) per D-15; SW <-> offscreen message bus documented per D-16 (handler registered; SW-side wiring deferred per D-22); extension/manifest.json minimal WAR entry per D-18 + CD-C; esbuild config emits the offscreen bundle with bare specifier rewritten. background.js BYTE-FROZEN per D-17. ONE FSB commit. Depends on Plan 05-01 + Plan 05-03. Closes FINT-04.
  - [x] `05-05-PLAN.md` (W3) -- FSB standalone MV3-survivability adapter + Node smoke: new extension/ai/lattice-runtime-adapter.js (standalone per D-19; SurvivabilityAdapter implementation over chrome.storage.session; feature-flag FSB_LATTICE_RUNTIME_ADAPTER_ENABLED default-off per D-20 + CD-D; ResumePolicy dispatch over attempt-1 marker vocabulary); new tests/lattice-survivability-smoke.test.js (>= 25 PASS real-runtime per D-21; chrome.storage.session mocked; real Ed25519 + createReceipt + verifyReceipt); package.json scripts.test chain extended. Phase 1+2+3+4 smokes BYTE-FROZEN. ONE FSB commit. Depends on Plan 05-03. Closes FINT-05 + FINT-06.
  - [x] `05-06-PLAN.md` (W4) -- Final ceremony: .planning/LATTICE-PIN.md frontmatter SHA bumped to Phase 5 Lattice HEAD + Phase 5 row appended referencing all 3 Phase 5 Lattice commits; .planning/REQUIREMENTS.md LSDK-19..22 + FINT-03..06 entries populated + 8 traceability rows; total v1 count 21 -> 29. ONE atomic FSB commit `docs(05): bump LATTICE-PIN + finalize LSDK + FINT traceability` with Ref footer + plan-ID. Depends on Plans 05-03 + 05-04 + 05-05.
- [x] **Phase 6: FSB engine consumes Lattice provider abstraction** -- Plans: 7 plans across 7 waves (Wave 0 smoke scaffold + Waves 1-5 implementation + Wave 6 ceremony; sequential due to shared smoke file modification across plans). Wire FSB's autopilot engine + settings test-connection path to consume Lattice's 7 provider adapters (shipped in Phase 4) via the offscreen Lattice host bus (shipped in Phase 5 FINT-04). Replaces FSB's `universal-provider.js` call sites with message-bus delegation to `lattice.create{Anthropic,Gemini,Xai,OpenRouter,LmStudio,OpenAI,OpenAICompatible}Provider().execute()`. Map FSB chrome.storage provider config → Lattice factory args (apiKey, baseUrl, headers). Keep `universal-provider.js` intact as feature-flag-gated fallback (`FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` default-on). Side-effect closes the `xai-key-rejected-400` bug (Lattice adapters trim internally; bridge bypasses the missing-trim defect in options.js save path). Closes integration gap G3 from v0.10.0 audit (SW opens offscreen host at startup). INV-04 preserved (setTimeout iterator still wraps an async call — just now to chrome.runtime.sendMessage instead of universal-provider). Populates FINT-07, FINT-08. Plans: (completed 2026-05-27)
  - [ ] `06-00-PLAN.md` (W0) -- Wave 0 smoke scaffold: `tests/lattice-provider-bridge-smoke.test.js` with 6 Part placeholders + chrome.runtime mock + chrome.offscreen mock + real `await import('lattice')`. Empty placeholders that PASS-when-empty so downstream plans incrementally fill without flipping the &&-chain red. Closes Nyquist validation gap (RESEARCH Section 8 + VALIDATION Wave 0).
  - [ ] `06-01-PLAN.md` (W1) -- FINT-07 offscreen handler: extend `extension/offscreen/lattice-host.js` with `lattice-provider-execute` + `lattice-provider-abort` handlers per Strategy A (CONTEXT.md post-research amendment). Autopilot path does its own fetch() with FSB's pre-built requestBody (preserves multi-turn + tools + cache_control); test-connection path uses `adapter.execute({task, artifacts, outputs}, {signal})` natively. PROVIDER_FACTORIES dispatch for 7 providers (lmstudio->createLmStudioProvider; custom->createOpenAICompatibleProvider; xai->createXaiProvider). Per-call AbortController registry. Fills smoke Parts 1+2+3+4. Phase 5 lattice-step-transition handler BYTE-FROZEN.
  - [ ] `06-02-PLAN.md` (W2) -- FINT-07 SW startup wiring: `extension/background.js` gains ONE new importScripts('ai/lattice-provider-bridge.js') after line 11 + ensureLatticeOffscreen() helper with hasDocument guard + WORKERS reason + called from onInstalled + onStartup. Closes audit gap G3. 153 importScripts -> 154 (relative order byte-frozen). Fills smoke Part 5 (grep + dynamic idempotency).
  - [ ] `06-03-PLAN.md` (W3) -- FINT-08 bridge shim + agent-loop swap: new `extension/ai/lattice-provider-bridge.js` exports executeViaBridge (dual classic-SW global + Node CJS); crypto.randomUUID requestId; AbortSignal -> companion lattice-provider-abort with finally cleanup; envelope unwrap returns raw HTTP body (legacy contract preserved). agent-loop.js line 1044 swapped to feature-flag-gated branch (`FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` default-on; legacy providerInstance.sendRequest preserved as fallback). INV-04 setTimeout iterator BYTE-FROZEN at lines 1841/2439/2508/2518. Fills smoke Part 1 + 3 (host_unreachable) + 5 (agent-loop grep).
  - [ ] `06-04-PLAN.md` (W4) -- FINT-08 options.js rewire: `checkApiConnection()` rewritten to read from input fields directly via per-provider getter map (NOT chrome.storage) and delegate to `executeViaBridge('test-connection')`. `saveSettings()` .trim() on all 9 input-derived fields (8 API key + endpoint + captcha). Closes xai-key-rejected-400 P1 (missing trim) + P2 (stale storage read) by side effect. Fills smoke Part 5 (options.js grep). AIIntegration class + getStoredSettings preserved (used elsewhere).
  - [ ] `06-05-PLAN.md` (W5) -- INV byte-freeze regression smoke: populate smoke Part 6 with INV-01 (parity test 142 PASS) + INV-02 (same) + INV-04 (agent-loop.js setTimeout count = 8 at lines 1841/2439/2508/2518) + INV-05 (deprecated agent modules absent/banner-preserved) + INV-06 (LATTICE-PIN current_lattice_sha == Phase 5 SHA). Verification-only; ZERO production code touched.
  - [ ] `06-06-PLAN.md` (W6) -- Ceremony closure: `.planning/LATTICE-PIN.md` Phase 6 audit row (SHA UNCHANGED -- Phase 6 ships zero Lattice-side commits per INV-06); `.planning/REQUIREMENTS.md` FINT-07 + FINT-08 status flipped Pending -> Complete in narrative + traceability table; FINT-KK..L Promoted row verified. ZERO production code touched.
- [x] **Phase 7: Archive FSB custom provider stack** -- **Plans:** 4 plans across 4 waves (Strategy B per CONTEXT.md decisions: flag removal only; physical archive of `extension/ai/universal-provider.js` deferred to v0.11.0+ pending Lattice-native providerInstance metadata migration). Strip feature flag `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` from `extension/ai/agent-loop.js` callProviderWithTools tail (delete `if (...)` wrapper + legacy `providerInstance.sendRequest(requestBody)` fallback; bridge becomes unconditional) + `extension/ai/lattice-provider-bridge.js` JSDoc + boot log + `tests/lattice-provider-bridge-smoke.test.js` Part 3 + 5 assertions + `tests/agent-loop-empty-contents.test.js` (regression test rewritten to intercept bridge envelope instead of legacy provider stub). Verify INV-03 wording in REQUIREMENTS.md matches Strategy B (revise 3rd era clause if needed: `universal-provider.js` STAYS on disk; physical archive deferred). Flip FINT-09 narrative + traceability Pending -> Complete (Strategy B form). Append Phase 7 row to LATTICE-PIN.md (current_lattice_sha UNCHANGED at `e95067bf...` per INV-06). Generate consolidated UAT-1 6-sub-assertion procedure into 07-VERIFICATION.md. Run UAT-1 user-execution checkpoint. Record verdict + flip v0.10.0-MILESTONE-AUDIT.md status from `in_progress` to `passed` on UAT-1 PASS. Populates FINT-09. Plans: (completed 2026-05-28)
  - [ ] `07-01-PLAN.md` (W1) -- Strip FSB_LATTICE_PROVIDER_BRIDGE_ENABLED feature flag from 4 files: extension/ai/agent-loop.js (delete `if (typeof X === undefined || X) {` wrapper at line 1056 + `return providerInstance.sendRequest(requestBody);` fallback at line 1067; callProviderWithTools tail becomes unconditional `return executeViaBridge(...)`), extension/ai/lattice-provider-bridge.js (JSDoc lines 17-18 + boot log line 167 rewritten to Phase 7-aware text; zero flag identifier remains), tests/lattice-provider-bridge-smoke.test.js (Part 3 + 5 flag assertions updated to expect zero references), tests/agent-loop-empty-contents.test.js (rewritten to mock chrome.runtime.sendMessage + capture the lattice-provider-execute envelope's requestBody — legacy provider stub path no longer reachable). INV-04 setTimeout count = 8 preserved; universal-provider.js BYTE-FROZEN on disk per Strategy B (still needed at agent-loop.js:1182 for providerInstance metadata). `npm test` exits 0. Closes FINT-09 production code.
  - [ ] `07-02-PLAN.md` (W2) -- Documentation ceremony: .planning/REQUIREMENTS.md INV-03 third era clause revised to Strategy B form + FINT-09 narrative + traceability flipped Pending -> Complete with FSB commit SHA + 5-consumer rationale paragraph + Total v1 footer updated to 32/32 Complete + Last updated footer bumped; .planning/LATTICE-PIN.md Phase 7 row appended (current_lattice_sha UNCHANGED at e95067bf... per INV-06; last_updated bumped). ONE FSB commit. ZERO production code touched.
  - [ ] `07-03-PLAN.md` (W3) -- Generate consolidated UAT-1 6-sub-assertion procedure into .planning/phases/07-archive-fsb-custom-provider-stack/07-VERIFICATION.md `Human Verification` section. Procedure covers Phase 1 (MV3 SW boot) + Phase 5 (offscreen host loads) + Phase 6 (provider bridge resolves xAI test request) + Phase 7 (no regressions after legacy path removed) in a single Chrome MV3 reload session. Includes preparation step + Chrome MV3 reload steps + 6 sub-assertions table (a-f) + xAI Test-Connection sub-test + autopilot iteration sub-test + boot log expectations + 3-verdict reporting protocol. ZERO production code touched.
  - [ ] `07-04-PLAN.md` (W4) -- Post-UAT ceremony (autonomous: false; gated on user UAT-1 verdict via checkpoint:human-verify Task 1). On UAT-1 PASS: flip v0.10.0-MILESTONE-AUDIT.md status frontmatter from `in_progress` to `passed` + append status_history entry + update scores.uat_consolidated to `executed (passed)` + scores.requirements_in_scope_phases_6_7 to 3/3 + scores.phases to 7/7; on UAT-1 PARTIAL/FAIL: leave status `in_progress` + append status_history with verdict + record gaps. Update 07-VERIFICATION.md frontmatter verdict + append UAT-1 Execution Record body section. Backfill LATTICE-PIN.md Phase 7 row Notes cell SHA placeholders (<07-02-sha>, <07-03-sha>, <07-04-sha>) with actual short SHAs from git log. ZERO production code touched. ZERO Lattice-side commits (INV-06 holds; current_lattice_sha UNCHANGED).

## Deferred from this milestone

- **Phase 8: Delegation primitive (DEFERRED, was CONTINGENT)** -- Carried forward to v0.11.0+ per autonomous-mode decision 2026-05-25 (originally numbered "Phase 6", renumbered 2026-05-27 after Phases 6 + 7 were inserted to close the FINT-KK..L Lattice-provider-consumption gap). Lattice's "Out of Scope" policy on multi-agent did not change during this milestone; this phase is parked until either (a) Lattice unblocks multi-agent and the delegation primitive lands Lattice-side, OR (b) the work re-scopes as an FSB-only consumer of Lattice receipt + tripwire surface. See "Future Phase 8 sketch" section below for the original contingent goal text retained for re-scoping.

## Phase Details

### Phase 1: Lattice SDK gap survey + integration scaffolding

**Goal:** Produce two outputs end-to-end. (1) A documented gap audit of Lattice v1.1 against FSB's runtime needs across all 6 surfaces (Capability Receipts, tripwires/hooks, providers, delegation, MV3-survivability, observability/step-markers), landing as `lattice/docs/fsb-integration-gaps.md` on the `fsb-integration-experiments` branch with gaps tagged by FSB-blocking severity (Blocker / Important / Nice-to-have). (2) A working FSB -> Lattice `path:` dependency wiring proven by a smoke test that mints exactly one Capability Receipt via Lattice's existing v1.1 surface, plus a manual MV3 SW reload check that confirms Lattice ES modules load inside the service worker. No FSB runtime behaviour changes, no Lattice primitive extensions yet -- only the audit + scaffold + receipt round-trip.

**Why:** v0.10.0-attempt-1 invented primitives inside FSB and planned to port them later (LAT-05 anti-pattern -- identified but not executed). Attempt-2 inverts the order: audit Lattice first, then build extensions inside Lattice on `fsb-integration-experiments`, then consume from FSB. Phase 1 establishes the FSB <-> Lattice loop and the queue of gap-closing work for Phase 2+. The smoke test proves the integration model works before any SDK extensions land.

**Scope (in):**
- Audit Lattice v1.1 across all 6 surfaces (receipts, tripwires/hooks, providers, delegation, MV3-survivability, observability/step-markers); document each gap with FSB-blocking severity.
- Write `lattice/docs/fsb-integration-gaps.md` on `fsb-integration-experiments` (single source of truth -- INV-06).
- Set up FSB <-> Lattice integration via `path:` dependency from `./lattice/packages/lattice`.
- Build Lattice locally (`pnpm install && pnpm build` inside `lattice/`) so `dist/` exists for FSB to consume.
- Add bridge module on the FSB side (e.g., `extension/lattice-bridge.js`) that imports from the built Lattice ESM surface; wire MV3 SW to load it via native ES module imports.
- Write `tests/lattice-smoke.test.js` exercising one Capability Receipt mint via Lattice's existing v1.1 API. Smoke must run under FSB's existing Node test harness (`npm test`).
- Manual MV3 SW reload check: extension reloads in Chrome, bridge module imports successfully, browser console shows no module-load errors. Result captured in PLAN's verification notes / phase SUMMARY.
- Create `.planning/LATTICE-PIN.md` recording the Lattice commit SHA used for this phase + per-phase log.

**Scope (out):**
- Any Lattice SDK extension or primitive addition beyond the audit doc + at most one `tsconfig` / `exports` packaging tweak if the smoke surfaces one (receipt-shape extensions, tripwire band system, provider matrix, delegation primitive, MV3-survivability adapter are all deferred to subsequent dedicated phases).
- Any change to FSB runtime behaviour (no `runAgentLoop` modification, no replacement of the `setTimeout`-chained iterator pattern -- INV-04).
- Sidepanel-side Lattice consumption (own phase later).
- Mainline PR back into Lattice (deferred to v0.11.0+ per CONTEXT.md D-15).
- Populating LSDK / FINT / MCP / PRV REQ-IDs in REQUIREMENTS.md (deferred to Phase 2 setup work).

**Pass criteria (explicit, from CONTEXT.md D-12):**
1. `lattice/docs/fsb-integration-gaps.md` exists on `fsb-integration-experiments` covering all 6 surfaces, with gaps severity-tagged.
2. FSB's `npm test` includes the new `tests/lattice-smoke.test.js` and the smoke passes (one receipt minted via Lattice).
3. Manual MV3 SW reload check passes: extension loads cleanly with Lattice bridge module imported; no console errors related to module loading.

**Lattice-side ceremony (CONTEXT.md D-14):** Conventional commits + `Ref: FSB v0.10.0-attempt-2 Phase 1` in commit body.

### Phase 2: Lattice tripwire + receipt primitives extension

**Goal:** Close the highest-severity gaps identified by Phase 1's audit doc (`lattice/docs/fsb-integration-gaps.md`) by extending Lattice's tripwire/hook + Capability Receipt primitives. The work lands on Lattice's `fsb-integration-experiments` branch FIRST (per INV-06), validated by Lattice's existing 451-test vitest suite (additive, no regressions), then consumed from FSB via the existing `file:./lattice/packages/lattice` path: dependency. FSB-side integration adds new smoke tests that exercise the newly-shipped primitives end-to-end.

**Why:** Phase 1's audit identified 13 Blocker gaps across receipts (5), tripwires/hooks (6 -- priority bands, matcher regex, race-with-log, lifecycle events, freeze, mid-session-registration), and observability/step-markers (3 -- STEP_TRANSITION + checkpoint hook + per-step mint). Phase 2 picks the tripwire + receipt subset (excluding observability/step-markers, which goes to its own dedicated phase) because those two surfaces tightly couple: receipt extensions (stepName/stepIndex/parentStepName fields, schema versioning, MV3-survivable encoding) are the data shape; tripwires/hooks are the runtime that emits into that shape. Shipping them together avoids design oscillation between phases.

**Scope (in):**
- Extend Lattice's Capability Receipt `CapabilityReceiptBody` with the step-marker fields FSB's autopilot emits: `stepName`, `stepIndex`, `parentStepName`, `previousStepName`, `sessionId`, `timestamp`. Schema versioned via either receipt-version bump (`lattice-receipt/v1.1`) OR an `extensions` field -- decision in discuss-phase.
- Extend Lattice's tripwire / policy primitives with: priority bands (SAFETY > OBSERVABILITY > EXTENSION), matcher regex (selective per-event firing), race-with-log per-handler budget (kill slow hooks), frozen-context evaluation, and mid-session registration freeze. Lifecycle events as a typed union (BEFORE_PROVIDER, AFTER_PROVIDER, BEFORE_TOOL, AFTER_TOOL, plus a STEP_TRANSITION carve-out).
- Add tests on Lattice's side for the new primitives (vitest, additive); Lattice's existing 451 tests must remain green.
- Update `lattice/docs/fsb-integration-gaps.md`: mark the closed rows as `Covered` (with the new Lattice commit SHAs referenced), leave other rows untouched.
- Update FSB's `.planning/LATTICE-PIN.md`: bump `current_lattice_sha` to the new Lattice HEAD; add Phase 2 row referencing the new Lattice commits.
- Add a Node-side FSB smoke (`tests/lattice-tripwire-smoke.test.js` or extend `tests/lattice-smoke.test.js`) that exercises the new tripwire band + receipt-shape extension end-to-end (mint a receipt with stepName populated; install a tripwire with a matcher + priority; assert the band ordering).
- Populate the corresponding LSDK REQ-IDs in `.planning/REQUIREMENTS.md` based on what landed.

**Scope (out):**
- Observability / step-markers surface (deferred to its own phase: STEP_TRANSITION event, checkpoint hook, per-step receipt mint).
- Provider adapter alignment (FSB's 7-provider matrix) -- deferred to its own phase.
- Delegation primitive -- deferred (Lattice's multi-agent policy still excludes it; surface in Phase 1 audit as Out-of-scope).
- MV3-survivability adapter contract -- deferred to its own phase.
- Any FSB extension/* file modification (per the Phase 1 Option B reconciliation legacy: FSB still does NOT import Lattice from any extension context).
- Mainline PR back into Lattice (deferred to v0.11.0+).

**Pass criteria (to be locked during discuss-phase):**
1. Lattice's vitest suite still passes (existing 451 tests + new tests covering the priority-band / matcher / race-with-log / freeze / lifecycle events / receipt-shape extensions). No regressions.
2. FSB's `npm test` chain (including a new or extended smoke test) exits 0 and exercises the newly-shipped primitives end-to-end.
3. `lattice/docs/fsb-integration-gaps.md` rows that Phase 2 closed are updated from `Needs extension`/`Needs addition` to `Covered` (with commit SHAs in the Notes column).
4. `.planning/LATTICE-PIN.md` reflects the new Lattice HEAD with a Phase 2 entry referencing the new commits.
5. `.planning/REQUIREMENTS.md` LSDK category lines for tripwire-extensions and receipt-extensions are populated with concrete REQ-IDs.

**Lattice-side ceremony (D-14 carryover):** Conventional commits + `Ref: FSB v0.10.0-attempt-2 Phase 2` in commit body. No `git push` to Lattice's remote (D-15 carryover).

### Phase 3: Observability + step-markers extension

**Goal:** Close the remaining 3 Blocker rows in the audit doc's Observability/step-markers domain. Add `"step.transition"` typed event to Lattice's `RunEventKind` union (`lattice/packages/lattice/src/tracing/tracing.ts`). Add a new `createCheckpointHook` factory at `lattice/packages/lattice/src/contract/checkpoint.ts` (sibling to bands.ts) that produces a hook handler the caller registers via Phase 2's `HookPipeline.register('AFTER_TOOL'/'BEFORE_TOOL', handler, { band: BAND.OBSERVABILITY })`. Per step transition, the handler emits a `step.transition` tracer event via `tracer.event?.()` AND (when a signer is provided) mints a v1.1 Capability Receipt via `createReceipt(...)` with step-marker fields populated. Best-effort mint -- signer failures degrade gracefully. Receipts thread via Phase 2's `previousStepName` + `parentStepName` linked-list fields. FSB-side: new `tests/lattice-checkpoint-smoke.test.js` exercising a 3-step fake sequence with both linear and parent-child threading.

**Why:** Phase 2 shipped the v1.1 receipt SHAPE (stepName, stepIndex, parentStepName, previousStepName, sessionId, timestamp). Phase 3 ships the RUNTIME that emits per-step receipts AND a typed tracer event that subscribers (sidepanel UI, future audit tools) can consume. This is the inspector-envelope vision from the audit doc ("envelope IS the receipt"). Phases 2 + 3 together close the receipts + tripwires + observability gap surface from the Phase 1 audit.

**Scope (in):**
- Add `"step.transition"` to `RunEventKind` literal union (one-line edit to `tracing.ts`).
- Create `lattice/packages/lattice/src/contract/checkpoint.ts` (factory + types).
- Create `lattice/packages/lattice/src/contract/checkpoint.test.ts` (vitest cases).
- Re-export `createCheckpointHook` + `CheckpointHookOptions` from `lattice/packages/lattice/src/index.ts`.
- Flip Phase 3 audit-doc rows to `Covered` with backlink SHAs.
- Create FSB `tests/lattice-checkpoint-smoke.test.js`; append to `scripts.test`.
- Bump `.planning/LATTICE-PIN.md` to new Lattice HEAD; add Phase 3 row.
- Populate LSDK REQ-IDs (LSDK-09..N at audit-doc row granularity).

**Scope (out):**
- Sidepanel UI consumption (Inspector view) -- separate UI-consumption phase later.
- `runtime/create-ai.ts` auto-wiring -- Phase 3 keeps the hook caller-controlled.
- MV3-survivable encoding of the per-step receipt stream -- Phase 5.
- Provider adapter alignment -- Phase 4.
- Delegation primitive -- Phase 6.
- ANY FSB `extension/*` modification (Option B reconciliation).
- Mainline PR back into Lattice -- v0.11.0+.

**Pass criteria (to be locked during planning):**
1. Lattice's vitest suite still passes (existing 332 baseline + new checkpoint tests; no regressions).
2. FSB's `npm test` chain (with new checkpoint smoke) exits 0; smoke asserts 3-step sequence with monotonically increasing stepIndex, 3 verified v1.1 receipts, and correct previousStepName + parentStepName threading.
3. `lattice/docs/fsb-integration-gaps.md` Observability/step-markers Blocker rows flipped to `Covered` with backlink SHAs.
4. `.planning/LATTICE-PIN.md` reflects new Lattice HEAD with a Phase 3 row referencing the new commits.
5. `.planning/REQUIREMENTS.md` LSDK-09..N populated with concrete REQ-IDs.

**Lattice-side ceremony (D-14 carryforward):** Conventional commits + `Ref: FSB v0.10.0-attempt-2 Phase 3` in commit body. No `git push` to Lattice's remote (D-15 carryforward).

### Phase 4: Provider adapter alignment

**Goal:** Ship 5 net-new native provider adapters in Lattice (`fsb-integration-experiments` branch) to close the FSB 7-provider matrix: Anthropic, Gemini (FULL custom), and xAI, OpenRouter, LM Studio (THIN WRAPPERS around `createOpenAICompatibleProvider`). Each adapter implements `ProviderAdapter.execute()` as a single-shot Promise, mirrors `createOpenAIProvider`'s factory signature, preserves provider-specific quirks (xAI reasoning_tokens, Anthropic top-level system, Gemini contents[].parts[].text). Companion vitest tests per adapter (~7 cases) using `makeFakeFetch`. One Lattice-side INV-03 parity smoke (`parity.test.ts`) iterating all 7 logical providers. One FSB-side thin surface-presence smoke (`tests/lattice-providers-smoke.test.js`) for ceremony parity. FSB `extension/ai/universal-provider.js` UNTOUCHED.

**Why:** Phase 1's audit doc flagged 5 missing provider adapters as Blocker (Anthropic, Gemini, xAI) + Important (LM Studio, OpenRouter). INV-03 ("every improvement works equally across all 7 universal-provider.js targets") is the hard gate. Phase 4 ships the SDK-side primitives in Lattice (per INV-06); FSB's autopilot continues using `universal-provider.js` as the runtime. A future phase (after Phase 5's MV3-survivability adapter contract) may rewire FSB autopilot to delegate to Lattice adapters; Phase 4 establishes the surface, validates parity.

**Scope (in):**
- 5 new Lattice adapter files (`anthropic.ts`, `gemini.ts`, `xai.ts`, `openrouter.ts`, `lm-studio.ts`).
- 5 companion vitest test files.
- 1 Lattice-side parity smoke + 1 FSB-side surface-presence smoke.
- `lattice/packages/lattice/src/index.ts` re-exports for all 5 new factories.
- `dist/` rebuild.
- Audit-doc row flips for 5 Providers rows + JSDoc carryforward notes (LM Studio latency-tail, OpenRouter model-routing deferrals).
- LATTICE-PIN.md bump + REQUIREMENTS.md LSDK-14..18 entries.

**Scope (out):**
- FSB `extension/ai/universal-provider.js` modifications (Option B carryforward).
- Live API calls / env-var-keyed integration tests.
- Streaming per provider.
- Provider-specific extensions (Anthropic prompt caching, Gemini multimodal, xAI tool-streaming, OpenRouter model routing).
- MV3-survivability adapter contract (Phase 5).
- FSB autopilot rewiring to delegate to Lattice adapters (separate later phase).
- Mainline PR back into Lattice (v0.11.0+).

**Pass criteria (to be locked during planning):**
1. Lattice's vitest suite passes (347 baseline + Phase 4 additive cases; no regressions).
2. FSB's `npm test` exits 0; surface-presence smoke asserts all 5 new factories reachable + produce ProviderAdapter shapes.
3. Lattice-side parity smoke exercises all 7 logical providers + proves INV-03 (each returns ProviderRunResponse with `rawOutputs[name]` populated, `normalizedUsage` shape, error handling).
4. `lattice/docs/fsb-integration-gaps.md` Providers rows flipped to `Covered` with backlink SHAs.
5. `.planning/LATTICE-PIN.md` reflects new Lattice HEAD with Phase 4 row referencing all Phase 4 commits.
6. `.planning/REQUIREMENTS.md` LSDK-14..18 populated.

**Lattice-side ceremony (D-14 carryforward):** Conventional commits + `Ref: FSB v0.10.0-attempt-2 Phase 4` in commit body. No `git push` to Lattice's remote (D-15 carryforward).

### Phase 5: MV3-survivability adapter contract + bundler infra + hybrid offscreen Lattice host

**Goal:** Ship 4 deliverables: (1) Lattice-side `SurvivabilityAdapter<TState>` interface + thin `createNoopSurvivabilityAdapter()` reference impl at `lattice/packages/lattice/src/runtime/survivability.ts` with companion vitest cases + audit-doc MV3-survivability rows flipped to Covered. (2) Bundler infrastructure for FSB extension build via esbuild + per-entrypoint bundles + `extension/dist/` output (behavior-free in this phase). (3) Hybrid offscreen Lattice host -- `background.js` STAYS CLASSIC (153 importScripts untouched), new offscreen page `extension/offscreen/lattice-host.html` + `.js` declares `<script type="module">`, bundler emits the offscreen bundle with Lattice bare-specifier rewritten, SW <-> offscreen message bus carries step-transition events to the offscreen Lattice host. (4) FSB-side standalone MV3-survivability adapter (`extension/ai/lattice-runtime-adapter.js`) implementing the Lattice contract over `chrome.storage.session`; feature flag `FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` defaults `false`; Node-side smoke validates round-trip.

**Why (user-confirmed Hybrid Offscreen path):** Phase 1's audit doc flagged MV3-survivability as a Blocker domain. INV-06 mandates the contract lives in Lattice. The deferred Phase 1 D-06 "in-extension Lattice consumption" intent is achieved here via offscreen-page hosting (not via SW classic-to-module migration, which carries 153 load-order-sensitive importScripts risks). Hybrid offscreen path preserves INV-04 (background.js + agent-loop.js byte-frozen) while delivering bundler infra + the contract + first real in-extension Lattice load.

**Scope (in):**
- Lattice `SurvivabilityAdapter` interface + noop ref impl + vitest cases (~12-15 cases) + public-surface re-exports + audit-doc closure.
- esbuild config + `scripts.build` invocation + `extension/dist/` output + bundler-emits-expected-files smoke; behavior-free (zero existing consumers migrate).
- Offscreen Lattice host (HTML + ESM JS bundle); minimal `manifest.json` offscreen page registration; SW <-> offscreen message bus.
- FSB standalone `lattice-runtime-adapter.js` implementing Lattice's contract over `chrome.storage.session`; feature flag default-off.
- Node smoke `tests/lattice-survivability-smoke.test.js` (~25 PASS).
- LATTICE-PIN.md bump + Phase 5 row; REQUIREMENTS.md LSDK-19..N + FINT-NN entries.

**Scope (out):**
- SW classic-to-module migration (153 importScripts → ES imports). Deferred indefinitely; can revisit in v0.11.0+.
- `agent-loop.js` modifications. INV-04 setTimeout iterator stays byte-frozen.
- CONSERVATIVE recovery wiring (`_al_handleRestoredMode` pattern from attempt-1) into `runAgentLoop`. Deferred to follow-on milestone.
- Feature flag default-on flip. Deferred to post-UAT.
- In-SW Lattice import.
- Delegation primitive (Phase 6 / CONTINGENT).
- Mainline PR back into Lattice (v0.11.0+).

**Pass criteria (to be locked during planning):**
1. Lattice vitest 397 + new survivability cases PASS (no regressions).
2. FSB `npm test` exits 0 with survivability smoke ~25 PASS appended.
3. `extension/dist/` produced by `scripts.build`; all 5+ entrypoint bundles emitted.
4. Offscreen `lattice-host.html` exists with module script tag; manifest.json declares the offscreen page.
5. Feature flag default-off; agent-loop.js + background.js byte-frozen.
6. `lattice/docs/fsb-integration-gaps.md` MV3-survivability rows flipped to Covered.
7. `.planning/LATTICE-PIN.md` reflects new Lattice HEAD with Phase 5 row.
8. `.planning/REQUIREMENTS.md` LSDK-19..N + FINT-NN populated.

**Lattice-side ceremony (D-14 carryforward):** Conventional commits + `Ref: FSB v0.10.0-attempt-2 Phase 5` in commit body. No `git push` to Lattice's remote (D-15 carryforward).

### Phase 6: FSB engine consumes Lattice provider abstraction

**Goal:** Wire FSB's autopilot engine (`extension/ai/agent-loop.js`) and settings test-connection path (`extension/ui/options.js`) to consume Lattice's 7 provider adapters (shipped Phase 4) through the offscreen Lattice host bus (shipped Phase 5 FINT-04), replacing FSB's own `extension/ai/universal-provider.js` runtime path. This is the FINT-KK..L work that v0.10.0 originally deferred as TBD — promoted here in scope after the `xai-key-rejected-400` debug session (debug file: `.planning/debug/xai-key-rejected-400.md`) identified that the FSB-side custom provider stack has a missing-trim + stale-storage-read defect that Lattice adapters do not have, making the consumption migration the highest-leverage fix.

**Why:** Phase 4 shipped 7 Lattice provider adapters but FSB's runtime never consumed them — `universal-provider.js` stayed byte-frozen as the sole runtime path (audit-doc tagged this as integration gap; REQUIREMENTS.md FINT-KK..L was an explicit `[ ]` TBD row scoped to follow-on milestones). The `xai-key-rejected-400` debug session proved this carryforward has shipped costs in production: Lattice's adapter trims keys internally and reads from caller-supplied input; FSB's `options.js:981` writes ungtrimmed keys to chrome.storage AND `checkApiConnection()` at `options.js:1077-1131` reads from chrome.storage instead of the input field. Migrating to the Lattice bridge closes BOTH defects as a side effect (the bridge takes the input field's current value, calls trim() in the Lattice adapter, and never touches the stale chrome.storage path for test-connection). Additionally closes integration gap G3 from v0.10.0 audit (SW now opens the offscreen host at startup, which the audit flagged as missing).

**Scope (in):**
- Extend `extension/offscreen/lattice-host.js` with a `lattice-provider-execute` message handler that takes `{provider, config: {apiKey, baseUrl, model, headers}, request: {messages, ...}}`, builds the appropriate Lattice ProviderAdapter via the right `create*Provider(config)` factory, calls `.execute(request, {signal})`, and returns the ProviderRunResponse (or a structured error envelope on failure).
- `extension/background.js` startup wiring: call `chrome.offscreen.createDocument({url: 'offscreen/lattice-host.html', reasons: ['IFRAME_SCRIPTING'], justification: 'Lattice provider host'})` once on extension boot. Guard with `chrome.offscreen.hasDocument` check to avoid duplicate creation. (Closes audit gap G3.)
- New thin shim `extension/ai/lattice-provider-bridge.js`: a single async function `executeViaBridge(providerName, config, request, {signal})` that wraps `chrome.runtime.sendMessage` to the offscreen host and unwraps the response/error envelope. Preserves the exact return-shape contract that `universal-provider.js` callers expect (`{rawOutput, normalizedUsage, ...}`) so call sites change minimally.
- `extension/ai/agent-loop.js`: replace direct `universalProvider.execute(...)` call sites with `executeViaBridge(...)`. Feature flag `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` defaults to `true`; flag=false falls back to the legacy `universal-provider.js` path so users can roll back at runtime if the bridge surfaces a regression. INV-04 setTimeout iterator BYTE-FROZEN (the bridge call is still an async function call; the iterator's setTimeout(callback, ms) → callback() → await provider pattern is structurally identical).
- `extension/ui/options.js` `checkApiConnection()` (lines 1077-1131): rewrite to read the API key from the input field directly via `elements.apiKey?.value?.trim()` (NOT from chrome.storage), then delegate to the bridge. This closes the `xai-key-rejected-400` P1 (missing trim) and P2 (stale storage read) as side effects.
- `extension/ui/options.js` `saveSettings()` (lines 977-1029): defense-in-depth trim on save for all API key fields (apiKey, geminiApiKey, openaiApiKey, anthropicApiKey, customApiKey, openrouterApiKey, captchaApiKey), even though the bridge no longer reads from storage for test-connection. Old stored values auto-heal on next save.
- New smoke `tests/lattice-provider-bridge-smoke.test.js`: exercise the bridge end-to-end against all 7 logical providers with mock fetch + mock chrome.runtime / chrome.offscreen. >= 20 PASS assertions covering message-bus round-trip, error envelope shape, AbortSignal propagation, and per-provider response normalization.
- `.planning/LATTICE-PIN.md` bump (no Lattice-side commits in Phase 6; bump is FSB-side audit-trail row only).
- `.planning/REQUIREMENTS.md` populate FINT-07 (bridge handler + bg.js startup) + FINT-08 (agent-loop + options.js test-connection rewire); flip FINT-KK..L TBD row to point at FINT-07 / FINT-08.

**Scope (out):**
- Hard delete `universal-provider.js` (deferred to Phase 7; Phase 6 keeps it as feature-flag fallback for rollback safety).
- Removing the feature flag (Phase 7).
- Background.js classic-to-module migration (INV-04 / Phase 5 OOS carryforward).
- Replacing the setTimeout iterator (INV-04).
- Modifying `mcp/ai/tool-definitions.cjs` or `extension/ai/tool-definitions.js` (INV-01).
- Modifying any Lattice-side code (Lattice already shipped the adapters in Phase 4; Phase 6 is FSB-side consumption only).
- Streaming-aware provider responses (OOS-06; provider parity violation for Gemini single-shot).
- Re-implementing the offscreen-host SW-side message bus from scratch (Phase 5 FINT-04 already shipped it; Phase 6 extends it).
- Mainline PR back into Lattice (v0.11.0+).

**Pass criteria (to be locked during planning):**
1. Lattice vitest still passes (additive Phase 6 work is FSB-side only; no Lattice changes).
2. FSB `npm test` passes: new `tests/lattice-provider-bridge-smoke.test.js` (>= 20 PASS exercising all 7 providers through the bridge with mock fetch).
3. Manual: paste a fresh xAI API key, click Test → connection succeeds end-to-end (P1 + P2 from xai-key-rejected-400 debug closed by side-effect).
4. Manual: one autopilot iteration completes >= 1 step using xAI through the bridge.
5. `extension/ai/universal-provider.js` byte-frozen (still on disk; flag-gated fallback active when `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED=false`).
6. `extension/background.js`: only diff is the `chrome.offscreen.createDocument` startup wiring + `chrome.offscreen.hasDocument` guard; 153 importScripts chain BYTE-UNCHANGED.
7. INV-01 (MCP wire) + INV-02 (tool surface) + INV-03 (7-provider parity, now via Lattice) + INV-04 (setTimeout iterator) + INV-05 (no deprecated module resurrection) + INV-06 (Lattice-first) all HOLDING.
8. `.planning/LATTICE-PIN.md` + `.planning/REQUIREMENTS.md` updated per scope rows above.

**Lattice-side ceremony:** None. Phase 6 is FSB-side wiring; Lattice's Phase 4 adapter shipments are the inputs.

### Phase 7: Archive FSB custom provider stack

**Goal:** With the Lattice bridge proven in Phase 6, archive FSB's custom `extension/ai/universal-provider.js`. Verify zero in-extension importers remain, move file to `extension/_archive/`, strip the `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` feature flag (bridge becomes unconditional), strengthen INV-03 wording, then run the consolidated UAT-1 procedure (single Chrome MV3 reload session covering Phases 1 + 5 + 6 + 7 — see v0.10.0-MILESTONE-AUDIT.md UAT-1) as the milestone-end UAT gate.

**Why:** Once Phase 6 has been live for at least one full integration cycle (FSB smoke chain green, manual xAI test-connection green, one autopilot iteration green), the legacy `universal-provider.js` path is a maintenance liability — it duplicates Lattice's adapter contracts, has the missing-trim defect that the bridge sidesteps, and creates ambiguity ("which path are we actually on?"). Phase 7 finalizes the migration: archive (not delete) for git-blame archaeology, flip the bridge unconditional, and tighten the invariant. This is the natural milestone-end UAT gate — one single Chrome reload session validates Phase 1 (MV3 SW boot), Phase 5 (offscreen host loads), Phase 6 (provider bridge resolves an xAI test request), and Phase 7 (no regressions after the legacy path is removed).

**Scope (in):**
- Grep audit: confirm zero `require\('.*universal-provider'\)` / `import.*universal-provider` references in `extension/*` outside `_archive/`. Captured as audit-table row in `.planning/phases/07-*/07-VERIFICATION.md`.
- Move `extension/ai/universal-provider.js` → `extension/_archive/universal-provider.js`. Update any test fixtures that referenced the old path. The legacy file is preserved on disk (recoverable via git history regardless; the archive directory is for fast-grep archaeology).
- Strip the `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` feature flag from `extension/ai/agent-loop.js`, `extension/ui/options.js`, and `extension/ai/lattice-provider-bridge.js`. Bridge call sites become unconditional. The fallback branch is deleted.
- Update `.planning/REQUIREMENTS.md` INV-03 wording from "Every improvement works equally across all 7 universal-provider.js targets" → "FSB consumes Lattice provider adapters exclusively for the 7-provider matrix. Verified by `tests/lattice-provider-bridge-smoke.test.js` across all 7 logical providers. Legacy `universal-provider.js` archived to `extension/_archive/` for historical reference."
- Populate FINT-09 (archive + flag removal) in REQUIREMENTS.md; close out FINT-KK..L final cell in traceability table.
- `.planning/LATTICE-PIN.md` final Phase 7 row.
- Update `.planning/v0.10.0-MILESTONE-AUDIT.md` UAT section: mark UAT-1 as executed (or schedule UAT-1 execution here as the explicit milestone-end gate).
- Execute consolidated UAT-1 procedure (single Chrome MV3 reload + open offscreen host + xAI test-connection round-trip + 1 autopilot iteration). Capture evidence in 07-VERIFICATION.md.

**Scope (out):**
- Hard delete `universal-provider.js` (still recoverable via git, but `_archive/` is the on-disk home for now; future cleanup phase can delete if archive directory becomes liability).
- Any new Lattice primitive.
- Restructuring chrome.storage schema (settings UI shape stays byte-identical for user data continuity).
- Background.js classic-to-module migration (still OOS).
- Mainline PR back into Lattice (v0.11.0+).

**Pass criteria (to be locked during planning):**
1. Lattice vitest still passes (Phase 7 is FSB-side cleanup; no Lattice changes).
2. FSB `npm test` passes (all chained smokes from Phases 1-6 still green; no test fixture refers to the old `extension/ai/universal-provider.js` path).
3. Grep audit: zero `extension/*` references to `universal-provider.js` outside `_archive/`.
4. Code-search audit: zero references to `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` anywhere in the repo (flag fully removed).
5. UAT-1 (consolidated) executed: single Chrome MV3 reload session passes all 6 sub-assertions (SW clean reload, no new lattice import errors, popup opens, sidepanel opens, one autopilot iteration completes, offscreen page loads with lattice-host.js boot log clean).
6. `.planning/REQUIREMENTS.md` INV-03 wording strengthened; FINT-09 populated; FINT-KK..L closed.
7. `.planning/LATTICE-PIN.md` Phase 7 row appended.
8. `.planning/v0.10.0-MILESTONE-AUDIT.md` UAT-1 marked executed; milestone status flipped from `in_progress` → `passed`.

**Lattice-side ceremony:** None. Phase 7 is FSB-side cleanup.

### Future Phase 8 sketch (deferred to v0.11.0+ — delegation primitive)

**Status:** Originally numbered Phase 6 (deferred 2026-05-25 via /gsd-autonomous decision); renumbered to Phase 8 on 2026-05-27 when the new Phases 6 + 7 (FSB consumes Lattice providers + archive custom stack) were inserted to close the FINT-KK..L gap. The contingent gate (Lattice's "Out of Scope" multi-agent policy) was not resolved during this milestone. Carries forward to the next milestone where it will be re-scoped as either: (a) a Lattice-side task-delegation primitive (parent-child loops + summary-return + cache-prefix sharing + rate-limit-group coordination), pending a Lattice multi-agent policy change; OR (b) an FSB-only consumer of Lattice's receipt + tripwire surface. Original sketch retained for future scoping.

---

### Phase 8: FSB agent brain on Lattice runtime — step.transition emit + per-step receipt mint (closes G1, flips Flow 4 to complete)

**Goal:** Wire FSB's autopilot agent loop to emit `step.transition` events into Lattice's tracer and mint per-step Capability Receipts via `createCheckpointHook` in the production code path. Close audit gap G1 (SW-side `lattice-step-transition` sender missing); flip integration Flow 4 from partial-by-design to complete. Phase 8 is the first of three sibling phases (8 + 9 + 10) splitting the v0.10.0 half-step closure work per Phase 8 CONTEXT.md D-06.

**Scope (locked in 08-CONTEXT.md):**
- `step.transition` fires at TWO boundaries per `runAgentIteration`: `LLM_TURN` (after API round-trip at `agent-loop.js:~1853`) AND `TOOL_DISPATCH` (per tool call at `agent-loop.js:~1906`); distinguished via `metadata.stepName` not new `RunEventKind` literals (D-01).
- Receipt-mint cadence is per `step.transition`, gated by signer presence; uses ephemeral Ed25519 signer at offscreen boot (D-02).
- New SW-side `sendLatticeStepTransition` function in `extension/background.js` (or sibling module) posts `lattice-step-transition` to offscreen via existing `chrome.runtime.sendMessage` channel; offscreen listener at `lattice-host.js:~295-371` already exists (D-03).
- INV-04 setTimeout iterator pattern stays byte-frozen (additive tracer/hook calls only; never inside lambdas; `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8 post-phase) (D-07).
- INV-06 default frozen at `current_lattice_sha e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`; carve-out only if planner research reveals `CreateReceiptInput` extension is needed for FSB's tool-result envelope shape (D-04).

**Requirements:** [FINT-10, FINT-11, FINT-12] — promoted from the FINT-NN..M TBD placeholder at REQUIREMENTS.md line 78. FINT-10 = SW-side lattice-step-transition sender module; FINT-11 = agent-loop step.transition emission at LLM_TURN + TOOL_DISPATCH boundaries; FINT-12 = per-step Capability Receipt mint integration via Phase 5 offscreen pipeline.

**Depends on:** Phase 7 (provider bridge unconditional + flag stripped).
**Plans:** 3/3 plans complete

Plans:
- [x] 08-01-PLAN.md (W0) — SW-side extension/ai/lattice-step-emitter.js producer (~80 lines dual-export idiom) + extension/background.js importScripts wire at line 13 (alphabetical between lattice-provider-bridge.js and ai-integration.js) + tests/lattice-step-emitter-smoke.test.js Wave 0 scaffold (Parts 1+2 filled; >= 12 PASS) + package.json scripts.test chain append. Closes audit gap G1 producer side. FINT-10.
- [x] 08-02-PLAN.md (W1) — extension/ai/agent-loop.js step.transition emission at TWO boundaries per D-01 (LLM_TURN after session.messages.push(assistantMsg) at line ~1855; TOOL_DISPATCH inside for(var ci...) loop AFTER BEFORE_TOOL_EXECUTION permission check) + smoke Parts 3+4+5+6 filled to >= 25 total PASS with INV-04 byte-freeze regression (Pitfall 1 awk-scan + setTimeout count = 8 + 4 iterator patterns + content-based discovery). FINT-11 + FINT-12.
- [x] 08-03-PLAN.md (W1) — Ceremony closure: .planning/REQUIREMENTS.md FINT-10/11/12 narrative + traceability rows + FINT-04 partial -> complete + FINT-NN..M placeholder retired + Total v1 32 -> 35 + Last updated bumped + .planning/LATTICE-PIN.md Phase 8 row (SHA UNCHANGED per D-04 verdict) + .planning/v0.10.0-MILESTONE-AUDIT.md G1 documented_carryforward_low -> closed_in_phase_8 + Flow 4 partial_by_design_per_D-22 -> complete + status_history appended + last_revised bumped. ZERO production code touched. (completed 2026-05-31)

### Phase 9: FSB SurvivabilityAdapter activated for MV3 SW eviction resumption (closes G2)

**Goal:** Flip `FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` on at SW boot; wire `lattice-runtime-adapter.js` `serialize`/`deserialize`/`resume` into FSB's existing `persist()` callsites (`agent-loop.js:1840`, `2438`) as additive sidecars, plus a restore site at `runAgentLoop` entry (`agent-loop.js:1215`). Close audit gap G2 (lattice-runtime-adapter has zero importers in extension/* outside its own file; flag never set in production).

**Scope (anticipated; finalized in 09-CONTEXT.md after discuss):**
- Flag flip: `FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` default-true global at SW boot (mirroring Phase 6's bridge flag pattern before Phase 7 stripped it).
- `serialize(state)` runs as additive sidecar at the existing 3 persist callsites — `persist()` keeps current behavior; lattice.serialize is parallel.
- `deserialize`/`resume` invoked at `runAgentLoop` entry when SW cold-boot detects a pre-existing snapshot under storage prefix `fsb_lattice_snapshot_<sessionId>_<capturedAt>` (per `lattice-runtime-adapter.js:75`).
- ResumePolicy classification (per `lattice/packages/lattice/src/runtime/survivability.ts:60-68`) depends on `_currentStepName` marker set by Phase 8's step.transition emissions — hence Phase 9 depends on Phase 8.
- INV-04 strictly additive — no setTimeout iterator changes. Verified post-phase via grep.

**Requirements:** TBD — anticipated FINT-13 (flag flip), FINT-14 (serialize sidecar at persist), FINT-15 (deserialize/resume at runAgentLoop entry).

**Depends on:** Phase 8 (step.transition events are the survivability boundary markers; `_currentStepName` set by Phase 8 is read by Phase 9's ResumePolicy classifier).
**Plans:** 3/3 plans complete

Plans:
- [ ] TBD

### Phase 10: MCP-philosophy parity for autopilot driver — visual session + metrics + driving-model attribution

**Goal:** Extend the existing tool-parity (INV-02) from tool DEFINITIONS to tool LIFECYCLE + TELEMETRY + DRIVING-MODEL ATTRIBUTION. Make FSB autopilot behave as an "MCP client in spirit" so the visual session panel + metrics dashboard show autopilot activity the same way they show MCP activity today. Independent of Phases 8 + 9 — purely additive UI/telemetry sidecar.

**Scope (anticipated; finalized in 10-CONTEXT.md after discuss):**
- Autopilot calls `recordVisualSessionTick(tabId, agentId, { client: 'FSB Autopilot', visualReason, isFinal })` from the tool-dispatch loop in `agent-loop.js:~1906`, mirroring the MCP bridge pattern at `mcp-bridge-client.js:734, 759, 782`.
- Unified `fsbMcpVisualSessions` store with new `driver: 'autopilot' | 'mcp'` discriminator on per-tab lifecycle entry (one-field schema extension; existing UI dashboard reads without forking).
- Allowlist gets new client label `'FSB Autopilot'` at `mcp-visual-session.js:4-18` (FSB-internal UI state; not an INV-01 wire change).
- Autopilot tool calls populate `mcp-metrics-recorder.js` via caller-side `recordDispatch(...)` with `client: 'FSB Autopilot'` + `driver: 'autopilot'` + `driving_model: { provider, model_id, reasoning_tokens }`. Offscreen bridge stays neutral (no tool-name knowledge; D-05 in 08-CONTEXT.md).
- Phase 10 is lowest-risk of the three — purely additive sidecar; if it breaks, autopilot still works, dashboard rows just don't appear.

**Requirements:** TBD — anticipated FINT-16 (autopilot visual session driver), FINT-17 (autopilot metrics recorder integration), FINT-18 (driving-model attribution capture + storage).

**Depends on:** Phase 7 (Phase 10 is INDEPENDENT of Phases 8 + 9 — can run in parallel with Phase 9 after Phase 8 ships, OR start before Phase 8 if parallel-track desired).
**Plans:** 3/3 plans complete

Plans:
- [ ] TBD

---

## Previous Milestone: v0.10.0-attempt-1 (FSB-first, abandoned 2026-05-24)

**Status:** Pivoted before milestone completion. Phases 1-2 shipped FSB-side code (hooks-foundation + state-inspectability-carve-out, 617/617 tests green) before the team re-evaluated and chose to pivot to the Lattice-first approach. All work preserved.

**Why abandoned:** Pattern duplication risk between FSB and Lattice; deferred Lattice round-trip validation; LAT-05 only IDENTIFIED port candidates rather than executing them. See `.planning/milestones/v0.10.0-attempt-1-pre-pivot/PIVOT-v0.10.0-PLAN.md`.

**Preservation:**
- Branch: `pre-pivot-archive/v0.10.0-fsb-first` (30+ commits at HEAD `4d70facf`)
- On-disk: `.planning/milestones/v0.10.0-attempt-1-pre-pivot/` (Phase 1 + Phase 2 full artifact sets: CONTEXT, DISCUSSION-LOG, RESEARCH, UI-SPEC, VALIDATION, PLANs, SUMMARYs, VERIFICATION)
- Snapshots: `ROADMAP.v0.10.0-attempt-1.md`, `REQUIREMENTS.v0.10.0-attempt-1.md`, `PROJECT.v0.10.0-attempt-1-snapshot.md`

**Recoverable artifacts (from backup branch):** Phase 1 hook-pipeline extensions (priority bands, matcher, race-with-log, freeze, lockBand); Phase 2 LIFECYCLE_EVENTS.STEP_TRANSITION + checkpoint-hook.js + 12 step markers + sidepanel Agent State Inspector UI + full SW eviction resumption with CONSERVATIVE recovery. The patterns themselves are intellectually correct; in attempt-2 they live in Lattice instead.

---

## Previous Milestone: v0.9.69 Anonymous Telemetry Pipeline + Showcase Dashboard Streaming Fix (shipped 2026-05-14)

(Full v0.9.69 history preserved in `.planning/milestones/v0.9.69-ROADMAP.md`.)

8 phases (269-276), 9 plans, 67/68 v0.9.69 REQs Complete. Anonymous UUIDv4 install identity + opt-out kill-switch; MCP pricing module + cost-surfacing chokepoint; TelemetryCollector 5-min alarm beat surviving MV3 SW eviction; SQLite ingest with 8-layer abuse defenses + HMAC-SHA256 daily-rotated IP hashing + k>=2 anonymity floor; `/api/public-stats/*` aggregates rendered as 6 chart toggles on `/stats`; privacy disclosure section + CWS listing copy + `verify-store-listing.mjs` gate; server-side GitHub stats cache; MCP transport `z.coerce.number()` numeric-param fix. All 3 release-gating BLOCKERs RESOLVED. Released artifacts: extension v0.9.67 zip on GitHub, mcp-v0.9.2 auto-published to npm, Fly auto-deployed.

---

*Last updated: 2026-05-31 -- Milestone v0.10.0 re-opened (2nd time) after UAT-1 PASS. Phase 8 added to close the half-step: FSB's agent BRAIN (iterator + tool dispatch + visual-session UX + metrics + driving-model attribution) still runs on FSB-owned code paths bypassing both Lattice's runtime primitives (G1 + G2 + Flow 4) and the MCP-driven session lifecycle. Phase 8 brings autopilot into philosophical parity with MCP-driven sessions (same tools per INV-02 already; same lifecycle + telemetry + attribution as new scope) while consuming Lattice's tracer/checkpoint/survivability primitives. Discuss-phase to decide whether this is one phase or splits into 2-3. The original Phase 8 "delegation primitive" sketch from 2026-05-27 (see section above) remains separately deferred to v0.11.0+ as before. Phases 1-7 + UAT-1 stand individually passed.*
