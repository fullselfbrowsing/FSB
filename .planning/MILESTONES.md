# Project Milestones: FSB (Full Self-Browsing)

## v1.1.0 T1 App Execution Expansion (Shipped: 2026-06-30)

**Phases completed:** 8 phases (44-51), 29 plans, 17/17 requirements satisfied.

**Archive:** `.planning/milestones/v1.1.0-ROADMAP.md`, `.planning/milestones/v1.1.0-REQUIREMENTS.md`, and `.planning/milestones/v1.1.0-MILESTONE-AUDIT.md`.

**Audit status:** `passed` -- all v1.1.0 requirements satisfied, all phases verified, no critical blockers. Non-blocking debt is explicitly accounted for as bridge-needed, UAT-needed, blocked-policy, or degraded/discovery-pending terminal states.

**Key accomplishments:**

- Built the authoritative T1 readiness inventory and search status surface over all 2,314 descriptors so catalog support is not confused with direct API-ready execution.
- Added reusable T1 porting scaffolds, handler contract gates, and write activation evidence gates for safe same-origin reads, guarded writes, and future bridge candidates.
- Expanded proven T1/guarded coverage from 26 baseline descriptors to 1,267 executable T1-ready descriptors plus 556 guarded fail-closed rows as of the 2026-07-01 artifact refresh.
- Added verified same-origin read coverage for Netlify, Bitbucket, CircleCI, Vercel, Retool, Asana, and generated low-risk same-origin recipes.
- Kept Pattern-D/GAPI candidates, write/destructive tail rows, and denied origins non-invocable until their required proof exists.
- Closed Phase 51 with descriptor-level terminal-state accounting: 5 bridge-needed, 141 UAT-needed, 123 blocked, and 222 degraded/discovery-pending rows, with focused readiness/evidence gates passing after the 2026-07-01 refresh.

**Accepted closeout caveats:**

- v1.1.0 does not claim the whole catalog is T1-ready. It claims every descriptor is either proven T1/guarded or explicitly accounted for with the proof required before direct execution.
- The backlog side phase `999.1 MCP tool gaps -- click heuristics` remains outside the v1.1.0 milestone scope.
- The local GSD `audit-open` preflight failed with `ReferenceError: output is not defined`; the milestone audit records this as a tooling issue, not a product blocker.

---

## v1.0.0 Full App Catalog (OpenTabs Parity) (Shipped: 2026-06-29)

**Phases completed:** 10 phases (35-43, including inserted 39.5), 46 plans, 17/17 requirements satisfied.

**Archive:** `.planning/milestones/v1.0.0-ROADMAP.md`, `.planning/milestones/v1.0.0-REQUIREMENTS.md`, `.planning/milestones/v1.0.0-MILESTONE-AUDIT.md`, and `.planning/milestones/v1.0.0-phases/`.

**Audit status:** `passed` -- automated milestone gate met. Non-blocking debt carried forward: live guarded-write UAT, live discovery first-visit UAT, Pattern-D cross-origin execution, and T1 expansion for the DOM/discovery tail.

**Key accomplishments:**

- Imported the full allowed OpenTabs-derived catalog surface into FSB's existing capability tiers: 2,314 descriptors across 128 app stems / 129 services, all searchable with side-effect class and backing-status signals.
- Expanded the denylist/sensitive-origin classification gates before broad reach landed, preserving denylist as the hard block while sensitive origins are flagged/audited and discovery-sensitive confirmation remains scoped to network capture.
- Built and verified the no-dead-entry resolution path so every searchable descriptor resolves to a tier rather than a dead `RECIPE_NOT_FOUND` result.
- Added selected T1/T1b direct execution heads across GitHub, GitLab, Notion, Reddit, and Slack, including live-verified Notion write execution after the app.notion.com/saveTransactions runtime patch.
- Seeded the remaining tail into discovery/learn flows and extended redaction coverage across the OpenTabs auth-field universe.
- Closed the scale gate: full-corpus index stayed within budget, precision regression pins passed, recipe-rot self-heal was wired, and `npm test` / `validate:extension` passed in the milestone gate.

**Accepted closeout caveats:**

- The milestone did not make all 2,288 remaining T3 descriptors direct T1. That is now the explicit v1.1.0 T1 App Execution Expansion milestone.
- Live UAT remains recorded rather than fabricated for guarded writes and first-visit discovery learning.

---

## v0.12.0 PhantomStream Package Migration (Shipped: 2026-06-17)

**Phases completed:** 5 phases (21-25), 19 plans, 24/24 requirements satisfied.

**Archive:** `.planning/milestones/v0.12.0-ROADMAP.md`, `.planning/milestones/v0.12.0-REQUIREMENTS.md`, `.planning/milestones/v0.12.0-MILESTONE-AUDIT.md`, and `.planning/milestones/v0.12.0-phases/`.

**Audit status:** `tech_debt` -- automated gates passed, with live Chrome-extension dashboard preview and remote-control UAT explicitly recorded as `human_needed` in Phase 25.

**Key accomplishments:**

- Pinned the published npm package `@full-self-browsing/phantom-stream@0.1.0`, rejected the stale unhyphenated package source, and documented package provenance, tarball integrity, verified export surface, and FSB-to-PhantomStream contract mapping.
- Replaced content-side generic capture ownership with a thin `extension/content/dom-stream.js` adapter around the bundled PhantomStream capture bridge while preserving FSB-specific actions, readiness pings, overlay/dialog/scroll side channels, stale-flush diagnostics, and resume-as-fresh-snapshot behavior.
- Moved static and Angular dashboard preview rendering to the shared `window.FSBPhantomStreamViewer` wrapper so snapshot assembly, mutation application, viewport mapping, and renderer sanitizer behavior are package-backed rather than duplicated across dashboards.
- Aligned stream transport, compression envelopes, relay classification/frame limits, recovery watchdogs, and remote-control frame handling with PhantomStream-compatible helpers while preserving FSB hash-key rooms, task/status traffic, debugger ownership reporting, and legacy dashboard frame compatibility.
- Removed the legacy `data-fsb-nid` stamping bridge, added deterministic differential parity coverage, and wired PhantomStream package/protocol/capture/renderer/relay/security/dashboard/recovery tests into the root `npm test` gate.
- Completed final automated gates: `npm run validate:extension`, `npm test`, `npm run showcase:build`, and `git diff --check`.

**Accepted closeout caveats:**

- Live Chrome-extension UAT remains user-gated and is not marked passed. Required scenarios are recorded in `.planning/milestones/v0.12.0-phases/25-parity-removal-docs-browser-uat/25-HUMAN-UAT.md`: live preview, mutation fidelity, side channels, dialogs, remote click/type/scroll, navigation/retargeting, reconnect/reinject recovery, restricted/no-tab states, large pages, masking, and external debugger contention.
- The milestone audit status is `tech_debt` rather than clean `passed` solely because of the recorded human-needed UAT. No critical requirement, integration, or automated gate blocker remains.

---

## v0.10.0 Autopilot via Lattice SDK (Shipped: 2026-06-15)

**Phases completed:** 13 phases, 52 plans, 123 tasks

**Archive:** `.planning/milestones/v0.10.0-ROADMAP.md`, `.planning/milestones/v0.10.0-REQUIREMENTS.md`, `.planning/milestones/v0.10.0-MILESTONE-AUDIT.md`, and `.planning/milestones/v0.10.0-phases/`.

**Audit status:** acknowledged closeout debt -- implementation and automated verification completed; 11 human-gated Chrome MV3/UAT evidence items were deferred at close. Known deferred items at close: 11 (see STATE.md `## Deferred Items`).

**Key accomplishments:**

- FSB wires Lattice as an npm `file:` dependency, lands a real-runtime 29-assertion Capability Receipt mint+verify round-trip with an ephemeral Ed25519 keypair, and records the cross-repo audit trail at `.planning/LATTICE-PIN.md` -- closing D-12 #2 (Node smoke green) for Phase 1 with Task 4 (manual MV3 sanity reload) explicitly DEFERRED to milestone UAT per the user's autonomous-continuation directive.
- Extended Lattice's CapabilityReceiptBody schema with six optional step-marker fields and bumped the body's version literal to a v1 | v1.1 discriminated union -- with createReceipt applying an any-field-set version-bump heuristic and verify.ts accepting both literals at the asReceiptBody structural gate, all under exactOptionalPropertyTypes-clean conditional-spread idioms, JCS canonical bytes byte-stable, and redaction manifest byte-frozen.
- Added Lattice's tripwire band pipeline primitive (createHookPipeline factory) as a sibling module to the pure evaluateTripwires evaluator -- shipping priority bands (SAFETY > OBSERVABILITY > EXTENSION), per-handler regex matcher, no-abort race-with-log per-handler budget (default 100ms, HOOK_TIMEOUT via TracerLike), structuredClone+Object.freeze handler context, irreversible freeze() blocking late register(), and the HookLifecycleEvent literal-union (BEFORE_PROVIDER/AFTER_PROVIDER/BEFORE_TOOL/AFTER_TOOL) intentionally separate from RunEventKind -- all under exactOptionalPropertyTypes-clean conditional-spread idioms, with tripwire.ts and tracing.ts byte-frozen and 20 new vitest cases all green.
- Landed Phase 2's Lattice public-surface bump in one commit (`00fcfac`) -- one alphabetically-positioned line in `src/index.ts` re-exporting `createHookPipeline` + `type HookPipeline` + `type HookLifecycleEvent` from `./contract/bands.js`, dist/ rebuilt via tsdown clean:true so the new symbol reaches both the ESM bundle and TypeScript declaration aggregate -- then closed Phase 2's six audit-doc rows + added one new HookLifecycleEvent row in `lattice/docs/fsb-integration-gaps.md` in a sibling commit (`97836f2`), both with the `Ref: FSB v0.10.0-attempt-2 Phase 2` footer ceremony intact and D-15 (no push) preserved.
- Created the FSB-side real-runtime smoke `tests/lattice-tripwire-smoke.test.js` (222 lines, 39 PASS / 0 FAIL) exercising all six Phase 2 Lattice primitive groups end-to-end via dynamic `await import('lattice')` from CJS, mirroring Phase 1's smoke pattern exactly with ephemeral Ed25519 keypair per run and manual passed/failed counters. Extended `package.json` `scripts.test` chain with the new smoke appended immediately after the Phase 1 smoke entry. Phase 1's `tests/lattice-smoke.test.js` remains byte-frozen (git diff returns 0 lines across the commit). Landed as ONE FSB commit `7c26685c` on `automation` branch with `Ref: FSB v0.10.0-attempt-2 Phase 2` footer.
- Closed Phase 2 on the FSB audit-trail side with one commit `3b09f50f` on `automation`: `.planning/LATTICE-PIN.md` frontmatter `current_lattice_sha` advanced from Phase 1's `22bf98627ae86b1576db5d34cf447ab2b321b3e1` to the new Lattice HEAD `97836f2c7759470389294b0a03a122ec89780157`, the body `Current pinned SHA` bullet synced from `22bf986` to `97836f2`, and one new Phase 2 row appended to the Per-FSB-Phase Log table referencing all five Phase 2 Lattice commits (5c48134 receipts + 2110e19 public-surface cleanup + ba6172c bands + 00fcfac re-export + 97836f2 audit-doc flip). REQUIREMENTS.md LSDK-02..08 entries + traceability rows were already populated by Plans 02-01 and 02-02 via `gsd-tools requirements mark-complete`; this plan verified the final state (grep count = 14 = 7 entries + 7 traceability rows). D-15 holds end-to-end across all of Phase 2: zero pushes on Lattice's reflog.
- Extended Lattice's RunEventKind union with the step.transition observability literal and shipped a new contract/checkpoint.ts sibling module exposing createCheckpointHook(options) -- a factory that returns a HookHandler the caller registers on Phase 2's HookPipeline (OBSERVABILITY band by convention); the handler emits exactly one step.transition tracer event per invocation and (when a signer is configured) mints exactly one v1.1 Capability Receipt with step-marker fields populated, with signer failures absorbed via try/catch and surfaced as metadata.mintError -- all under TDD with 15/15 new vitest cases green and Lattice's full suite advancing from 332 to 347 PASS.
- Extended Lattice's flat bare-specifier surface at `packages/lattice/src/index.ts` with the Phase 3 checkpoint primitives (createCheckpointHook + STEP_TRANSITION_EVENT_NAME + DEFAULT_CHECKPOINT_BAND + the two type exports), rebuilt dist/ via tsdown so the FSB `file:` dep sees the new symbols, and closed the two remaining Observability/step-markers Blocker rows in `lattice/docs/fsb-integration-gaps.md` with backlink SHAs to all three relevant Phase 3 Lattice commits -- two new Lattice commits not pushed, full Phase 2 byte-frozen baseline preserved, Lattice suite holding at 347 PASS / 0 FAIL.
- Landed FSB's real-runtime end-to-end smoke for Phase 3's createCheckpointHook factory (72 PASS / 0 FAIL standalone, 3.6x the CONTEXT.md D-14 floor of 20), wired it into `npm test`'s chain after the Phase 2 smoke (Phase 1 + Phase 2 smokes byte-frozen), bumped `.planning/LATTICE-PIN.md` to Lattice's new HEAD `7afd62fc` with a Phase 3 row referencing all 4 Plan 03-01 + Plan 03-02 Lattice commits, and verified `.planning/REQUIREMENTS.md` already contained the 5 LSDK-09..LSDK-13 entries + traceability rows -- all closed in one atomic FSB commit on `automation` (`bbb8d573`) with the `Ref: FSB v0.10.0-attempt-2 Phase 3` footer. Hard invariants INV-01 / INV-04 / INV-06 + Option B reconciliation all hold; Lattice vitest suite green at 347 PASS / 0 FAIL; no push to Lattice's remote (D-15/D-17).
- Full custom Lattice adapter for Anthropic's /v1/messages API (top-level `system` field + `content[0].text` response shape) with 9 vitest cases proving D-09 contract end-to-end via fake fetch.
- Full custom Lattice adapter for Google's Generative Language API at `/v1beta/models/{model}:generateContent` (contents[].parts[].text request shape + candidates[0].content.parts[0].text response + 4 HARM_CATEGORY BLOCK_NONE safetySettings + ?key= query auth) with 10 vitest cases proving D-09 contract end-to-end via fake fetch.
- Three thin-wrapper Lattice provider adapters shipped: xAI (`api.x.ai/v1`, preserves `completion_tokens_details.reasoning_tokens` quirk per D-07), OpenRouter (`openrouter.ai/api/v1`, model-routing deferred per D-17), LM Studio (`localhost:1234/v1`, noAuth default per CD-03, latency-tail diagnostics deferred per D-16). Each composes `createOpenAICompatibleProvider` with provider-specific defaults; xAI additionally post-processes the response to augment legacy `UsageRecord.totalTokens` with reasoning_tokens. 24 vitest cases (9/7/8) verify D-09 contract + provider-specific quirks. Lattice suite 366 -> 390 PASS / 34 -> 37 test files with no regressions.
- Phase 4 integration plan that makes Wave 1+2's 5 adapters callable via the public surface (lattice.createAnthropicProvider(...) etc.), ships the substantive INV-03 parity proof (7 vitest cases iterating all 7 logical providers against per-provider fake fetch fixtures), and flips the 5 Providers audit-doc rows from Blocker/Important/Nice-to-have to Covered with backlink SHAs. Lattice suite advances 390 -> 397 PASS / 37 -> 38 test files with no regressions.
- Closes Phase 4 (Provider adapter alignment) with the FSB-side ceremony parity smoke (`tests/lattice-providers-smoke.test.js`, 47 PASS), package.json chain extension, LATTICE-PIN.md frontmatter SHA bump (7afd62fc -> f1c943bd) + Phase 4 row append (8 Lattice commits narrated), and REQUIREMENTS.md LSDK-14..18 cross-cutting SHA updates + traceability row refresh + total count bump (17 -> 21). ONE atomic FSB commit `b3e52282` with `Ref: FSB v0.10.0-attempt-2 Phase 4` footer covers all four files.
- None — plan executed exactly as written.
- Insertion 1: value re-export
- None substantive.
- Per-task verification harness `tests/lattice-provider-bridge-smoke.test.js` scaffolded with 6 Part placeholders, chrome.runtime + chrome.offscreen mock helpers exported for downstream reuse, and surface-presence assertions for all 7 Lattice provider factories; npm test chain extended as final entry.
- Extended `extension/offscreen/lattice-host.js` with the FINT-07 second onMessage listener (lattice-provider-execute + lattice-provider-abort branches) per Strategy A: autopilot mode does its own fetch with FSB's pre-built requestBody (preserving multi-turn messages + tools[] + provider-specific cache_control / systemInstruction / generationConfig); test-connection mode delegates to Lattice adapter.execute({task, artifacts, outputs}, {signal}) natively. Wave 0 smoke at `tests/lattice-provider-bridge-smoke.test.js` Parts 1+2+3+4 filled with 20 new real-assertion PASSes (12 Wave 0 baseline -> 32 PASS / 0 FAIL). Phase 5 step-transition handler byte-frozen.
- `extension/background.js` gains an `async function ensureLatticeOffscreen()` helper (idempotent via `chrome.offscreen.hasDocument()` guard; opens `offscreen/lattice-host.html` with `reasons: ['WORKERS']`) called fire-and-forget from BOTH the existing `chrome.runtime.onInstalled.addListener` AND `chrome.runtime.onStartup.addListener` callbacks after `initializeAnalytics()`, plus a BARE `importScripts('ai/lattice-provider-bridge.js')` insertion at line 12 between `ai/cli-parser.js` (line 11) and `ai/ai-integration.js` (line 13). 153-importScripts chain otherwise BYTE-FROZEN modulo +1 line drift; manifest.json BYTE-FROZEN (Phase 5 `offscreen` permission + WAR entry preserved); INV-04 agent-loop.js setTimeout count UNCHANGED at 8. `tests/lattice-provider-bridge-smoke.test.js` Part 5 placeholder replaced with 14 real assertions (importScripts adjacency proof + grep-based helper presence + dynamic chrome.offscreen idempotency exercise via the Plan 06-00 mock); 32 PASS (Plan 06-01 baseline) -> 46 PASS (+14 new assertions, well above the >= 10 plan minimum); FAIL count == 0; `npm test` exits 0.
- `extension/ai/lattice-provider-bridge.js` ships as a 146-line dual-export SW-side shim (executeViaBridge with crypto.randomUUID requestId, AbortSignal routing with listener cleanup, envelope unwrap, typed Error taxonomy); `extension/ai/agent-loop.js` callProviderWithTools gets a 16-line feature-flag-gated branch at its tail invoking executeViaBridge when `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` is undefined OR truthy (default-on per ROADMAP) while preserving the legacy `providerInstance.sendRequest(requestBody)` call as the flag-false fallback; switch + requestBody construction BYTE-FROZEN; INV-04 setTimeout count = 8 + 4 single-line iterator blocks calling runAgentIteration(sessionId, options) BYTE-FROZEN PATTERN (absolute positions shift +16 lines, expected); INV-05 universal-provider.js + tool-use-adapter.js BYTE-FROZEN (zero diff); smoke 46 PASS -> 61 PASS / 0 FAIL (+15 new Plan 06-03 PASSes covering bridge presence + host_unreachable + pre-abort + agent-loop grep + bridge-shape); npm test exits 0; agent-loop-empty-contents.test.js regression test patched to pin flag-false (Rule 3 auto-fix).
- `extension/ui/options.js` saveSettings() gains 9 `.trim()` calls on all 9 input-derived string fields (8 LLM-side API key / endpoint URL + 1 CAPTCHA key) closing the xai-key-rejected-400 P1 missing-trim defect at the save site; `checkApiConnection()` (lines 1077-1131 baseline) is rewritten from chrome.storage path to input-field-direct path via per-provider getter map and delegates to `executeViaBridge(provider, config, {__testConnection:true}, {mode:'test-connection'})` (Plan 06-03 shim) closing the xai-key-rejected-400 P2 stale-storage-read defect; AIIntegration class declaration NOT touched (imported via importScripts; line 1229 model-discovery usage preserved); getStoredSettings declaration NOT touched (line 1211 model-discovery call site preserved); Wave 1+2 files BYTE-FROZEN (zero diff in extension/offscreen/lattice-host.js, extension/background.js, extension/ai/{lattice-provider-bridge,agent-loop,universal-provider,tool-use-adapter}.js); INV-04 setTimeout count in agent-loop.js still = 8; smoke 61 PASS -> 71 PASS / 0 FAIL (+10 delta vs >=8 plan minimum); npm test exits 0 (full chain green).
- Part 6 of `tests/lattice-provider-bridge-smoke.test.js` populated with 14 concrete INV-01..06 byte-freeze regression assertions replacing the Plan 06-00 Wave 0 placeholder; INV-04 verification uses content-based iterator discovery (4 hits via /session._nextIterationTimer = setTimeout/ regex + 5-line window for runAgentIteration(sessionId, options)) which correctly handles the Plan 06-03 Task 2 ~16-line insertion that drifted iterators from 1841/2439/2508/2518 -> 1857/2455/2524/2534; INV-06 confirms LATTICE-PIN.md current_lattice_sha still equals Phase 5 SHA e95067bfa87ed1b75838fc3b3ef217a3b01acbd3 (Phase 6 ships zero Lattice-side commits); Phase 7 readiness + Phase 6 file-presence ceremony all green; smoke 71 PASS -> 85 PASS / 0 FAIL (+14 delta vs +12 plan minimum); ZERO production code touched.
- Phase 6 closure evidence was already present in the current LATTICE-PIN and REQUIREMENTS docs; this plan backfills the missing SUMMARY artifact without reverting later Phase 13 package-pin updates.
- Lattice provider bridge is now the unconditional provider call path in callProviderWithTools; the feature flag and legacy providerInstance.sendRequest fallback are deleted; npm test stays 85+8 green.
- REQUIREMENTS.md FINT-09 flipped Pending -> Complete with Strategy B rationale + Plan 07-01 SHA backfill; LATTICE-PIN.md Phase 7 row appended with current_lattice_sha UNCHANGED per INV-06; INV-03 third-era clause revised from "archived to extension/_archive/" to "physical archive deferred to v0.11.0+" form; zero production code touched; npm test exits 0.
- 07-VERIFICATION.md scaffold generated (139 lines) with consolidated UAT-1 procedure covering Phases 1+5+6+7 in a single Chrome MV3 reload session; verdict=human_needed pending user execution; xAI Test-Connection + autopilot iteration sub-tests included; zero production code touched; npm test exits 0 (smoke 85/0).
- Verdict:
- SW-side `sendLatticeStepTransition(payload)` producer module shipped via dual-export idiom + alphabetical importScripts wire + Wave 0 smoke scaffold (17 PASS / 0 FAIL); audit gap G1 producer half closed, agent-loop call sites deferred to Plan 08-02.
- `extension/ai/agent-loop.js` now emits `step.transition` envelopes at both LLM_TURN (after assistantMsg push) and TOOL_DISPATCH (inside the for(var ci...) tool dispatch loop, after the BEFORE_TOOL_EXECUTION permission check); INV-04 byte-frozen (setTimeout count 8; iterator pattern 4); INV-06 byte-frozen; smoke 38 PASS / 0 FAIL with Parts 3+4+5+6 populated; audit gap G1 production wiring complete end-to-end (Plan 08-03 records the audit doc flip).
- REQUIREMENTS.md + LATTICE-PIN.md + v0.10.0-MILESTONE-AUDIT.md updated to reflect Phase 8 production wiring: FINT-10/11/12 closed, FINT-04 partial -> complete, FINT-NN..M placeholder retired, G1 closed_in_phase_8, Flow 4 partial-by-design -> complete; ZERO production code touched; INV-04 / INV-06 byte-frozen; milestone status STAYS in_progress pending per-axis UAT-08.
- FSB SurvivabilityAdapter activated at SW boot via globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED = true; runAgentLoop entry now invokes deserialize + resume against the latest chrome.storage.session snapshot, logs the 4-member Lattice ResumePolicy verdict, and stashes the adapter on session._latticeAdapter for Plan 09-02 serialize sidecar reuse. Smoke Part 6 scaffold ships 9 PASS Wave 0 baseline. INV-04 byte-frozen; INV-06 SHA unchanged.
- Phase 9 production-side wiring complete. 3 _currentStepName marker writes in runAgentIteration feed adapter resume()'s Phase 5 vocabulary (BEFORE_API_REQUEST, BEFORE_TOOL_EXECUTION, BEFORE_NEXT_ITERATION_SCHEDULE); 2 serialize sidecars at the in-flight resumable persist callsites reuse session._latticeAdapter stashed by Plan 09-01; LRU cap enforced inside lattice-runtime-adapter.js persistInternal via keep-latest-N (default 50/sessionId per JSDoc contract). Smoke Part 6 fill brings total to 72 PASS / 0 FAIL. INV-04 byte-frozen (setTimeout=8, iterator=4, awk-scan empty); INV-06 SHA unchanged.
- Phase 9 documentation ceremony shipped: FINT-13/14/15 marked Complete with full narrative + 3 traceability rows in REQUIREMENTS.md (Total v1 35 -> 38); LATTICE-PIN.md Phase 9 row appended with current_lattice_sha UNCHANGED at e95067bfa87ed1b75838fc3b3ef217a3b01acbd3 per INV-06 binary verdict + Section 6 SAFE_REPLAY correction (4-policy union frozen, no 5th literal); v0.10.0-MILESTONE-AUDIT.md G2 row flipped documented_carryforward_low -> closed_in_phase_9 with closure_note narrative + status_history phase_9_shipped entry appended. ZERO production code touched. Milestone status STAYS in_progress per D-07 (UAT-09 deferred to consolidated end-of-milestone). Full npm test chain stays green (no regression; no test files modified).
- Autopilot driver discriminator + 'FSB Autopilot' allowlist entry + recordVisualSessionTick call site at the Phase 8 TOOL_DISPATCH boundary, with 20 PASS Wave 0 smoke harness (14 real + 6 placeholder) and INV-04 + INV-06 byte-freeze preserved.
- Recorder route allowlist extended to accept 'autopilot' + new top-level drivingModel pass-through row field + autopilot recordDispatch call site landed at agent-loop.js post-toolResults.push boundary with provider/model + xAI reasoning_tokens attribution, smoke at 30 PASS / 0 FAIL (16 new real assertions covering recorder schema + dispatcher_route + reasoning_tokens edge cases + MCP non-regression).
- REQUIREMENTS.md FINT-16/17/18 traceability + INV-02 wording promotion + LATTICE-PIN.md Phase 10 row (SHA UNCHANGED) + v0.10.0-MILESTONE-AUDIT.md phase_10_shipped entry + smoke Parts 9-10 INV byte-freeze regression and provider switch precedence; final smoke 37 PASS / 0 FAIL; ZERO production code touched; ZERO Lattice-side commits.
- Wave 0 scaffold lands the sidepanel-tab-conv-store sidecar (6 pure helpers + 4 constants), the .fsb-owner-chip baseline CSS rule (closes RESEARCH Section 6 missing-CSS gap), and the 7-Part smoke harness placeholder (7 PASS / 0 FAIL) with INV-04 + INV-06 byte-freeze preserved.
- Wave 2 ships FINT-20 -- foreign-owned input lockout. New `applyInputLockout(foreignOwned)` sync helper added to `extension/ui/sidepanel.js` toggles the disabled state on 4 input controls (chatInput contenteditable div + sendBtn + stopBtn + micBtn) with aria-disabled + aria-describedby + `.fsb-foreign-owned-disabled` class; new `_isActiveTabForeignOwned()` async helper provides defense-in-depth runtime gating at `handleSendMessage` entry. `refreshOwnerChip` is rewired to apply lockout when the chip renders foreign-owned and clear it when the chip is hidden. New `.fsb-foreign-owned-disabled` CSS rule (opacity 0.45 + pointer-events none + cursor not-allowed) plus `.sr-only` WAI-ARIA utility land in `extension/ui/sidepanel.css`. New hidden `fsb-lockout-aria-description` span lands in `extension/ui/sidepanel.html` adjacent to the chip. When the active tab is owned by a foreign agent (per the same Phase 243 `shouldShowOwnerChip` contract used in Plan 11-01), the side-panel surface goes read-only: visually dimmed, mouse-inert, keyboard-disabled, and screen-reader-explained.
- Wave 3 ships FINT-21 -- the per-tab conversation state model. The legacy single-key `fsbSidepanelConversationId` is replaced by a versioned envelope at `fsbSidepanelTabConversations` with a byTab map keyed by tabId and an LRU array enforcing a 50-tab cap. `initTabConversationStore` boot path one-shot migrates the legacy convId under the currently-active tab via the Plan 11-00 sidecar's `migrateLegacyConversationKey` helper; idempotent on second boot. `swapToTabConversation` peek-only swaps chat history on `chrome.tabs.onActivated`; `dropTabConversation` drops the entry on `chrome.tabs.onRemoved` (D-14); NO `onDiscarded` listener (D-15 preserve). `handleSendMessage` calls `ensureTabConversationForActiveTab(false)` lazy mint after the Plan 11-02 foreign-owned gate; `startNewChat` calls `ensureTabConversationForActiveTab(true)` to force a fresh conversation in the current tab. Module-scope `_envelopeReadyPromise` provides race-free hydration so listeners do not race against the migration. Cumulative smoke ratchets from 28 PASS / 0 FAIL to 36 PASS / 0 FAIL (+8 real PASS across Parts 5+6). INV-04 + INV-06 byte-frozen.
- Wave 4 closes Phase 11 ceremony with 5 deliverables: REQUIREMENTS.md FINT-19/20/21 narrative + traceability + Total v1 footer bump 41 -> 44 + Last updated bumped to 2026-06-07; LATTICE-PIN.md Phase 11 row appended with `current_lattice_sha` UNCHANGED at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` + frontmatter last_updated 2026-06-07; v0.10.0-MILESTONE-AUDIT.md status_history phase_11_shipped entry + last_revised 2026-06-07 (status STAYS in_progress per CONTEXT D-22); new 11-VERIFICATION.md with Human Verification UAT-11 section (6 sub-assertions a-f) joining consolidated UAT-08+09+10+11 session; tests/sidepanel-tab-aware-smoke.test.js Part 7 filled with 4 real INV byte-freeze regression PASS. Cumulative smoke: 36 PASS (post-Plan-11-03) + 4 new Part 7 PASS - 1 placeholder replaced = 39 PASS / 0 FAIL final across 7 Parts (>= 37 target met). ZERO production code touched; ZERO Lattice-side commits. INV-04 + INV-06 byte-frozen.
- Pure-helper sidecar at extension/ui/sidepanel-message-log.js (envelope CRUD + LRU + clear-and-replace debouncer) + Wave 0 smoke harness with 8 Part placeholders + sidepanel.html script-chain wiring + package.json &&-chain extension; zero behavioral production change.
- hydrateChatFromConversationId restructured to 3-tier fallback (fsbConversationMessages -> fsbSessionLogs -> empty) with a new renderPersistedMessage DOM-only helper that defeats the Plan 12-02 write-through loopback (Pitfall 3); smoke Parts 1 + 2 filled with 16 real PASS asserting envelope read + chronological sort + Tier 1 short-circuit + idempotency + Tier 2 legacy fallback + Tier 3 empty + convId guard; cumulative smoke 22 PASS / 0 FAIL.
- Module-scope debouncer + in-memory buffer + _persistMessage / _flushMessageLog helpers + boot init + beforeunload force flush; addMessage / addCompletionMessage / addActionMessage chokepoint hooks (addActionMessage persists UNCONDITIONALLY per CONTEXT D-10 BEFORE the showSidepanelProgressEnabled guard); chrome.tabs.onRemoved EC-05 defense (resolve convId BEFORE drop -> cancel debouncer -> clear buffer -> drop envelope -> persist); smoke Parts 3 + 4 filled with 20 real PASS (debounce semantics + LRU + flushAll + cancel + EC-05 + error swallow); cumulative smoke 40 PASS / 0 FAIL (well above 28 cumulative target).
- Default flag flip (showSidepanelProgress false -> true) at 4 sites (options.js DEFAULT_SETTINGS + sidepanel.js module-scope + boot read + storage.onChanged listener) + unconditional _persistMessage write in case 'iteration_complete' (BEFORE the typing-dots gate); smoke Part 5 filled with 12 real PASS asserting all flag flips + per-event persistence wiring + tool_executed carryforward; cumulative smoke 51 PASS / 0 FAIL (well above >= 33 cumulative target). FINT-22 SHIPPED.
- chrome.sidePanel.setOptions + open inserted as FIRST 2 awaits in handleStartAutomation per RESEARCH Section 7.6 recipe (best-effort try/catch gated on targetTabId + typeof chrome.sidePanel) + ceremony closure (REQUIREMENTS.md FINT-22/23/24 narrative + traceability + Total v1 44 -> 47 + Last updated 2026-06-08; LATTICE-PIN.md Phase 12 row appended SHA UNCHANGED; v0.10.0-MILESTONE-AUDIT.md status_history phase_12_shipped + last_revised 2026-06-08 status STAYS in_progress; new 12-VERIFICATION.md status human_needed UAT-12 6-sub-assertion procedure deferred to consolidated UAT-08+09+10+11+12) + smoke Parts 6+7+8 filled with 13 real PASS (5 + 4 + 4) cumulative 61 PASS / 0 FAIL across 8 Parts (>= 45 target exceeded by +16). FINT-24 SHIPPED. Phase 12 closure complete.

---

## v0.9.69 Anonymous Telemetry Pipeline + Showcase Dashboard Streaming Fix (Shipped: 2026-05-14)

**Phases completed:** 8 phases (269-276), 9 plans, 84 commits.

**Archive:** `.planning/milestones/v0.9.69-ROADMAP.md` and `.planning/milestones/v0.9.69-REQUIREMENTS.md`.

**Audit status:** `tech_debt` — `.planning/milestones/v0.9.69-MILESTONE-AUDIT.md`. 67/68 REQs fully Complete; STREAM-03 marked Partial (human_needed) by design per locked decision D-16 (diagnostic-first, browser-repro reserved post-merge). All 3 release-gating BLOCKERs RESOLVED.

**Key accomplishments:**

- **Anonymous identity foundation** — `extension/utils/install-identity.js` mints UUIDv4 in `chrome.storage.local` per install; lazy mint via `onInstalled`+`onStartup`; opt-out kill-switch toggle in Control Panel Advanced Settings; 35/35 unit tests + user-validated in Chrome.
- **MCP pricing module** — `mcp/data/mcp-pricing-data.json` (single source-of-truth) + TS module + JS service-worker mirror with 30 model rows (Claude 4.x, GPT-5/5.x, Gemini 2.5, Grok 4.x, DeepSeek V4) + 13 client default-model assumptions (incl. `OpenClaw 🦀`); `cost: null` fallback for unknown models; `PRICING_SOURCE_DATE = "2026-05-14"`; 167/167 tests + 6 review fixes (npm-pack data/ BLOCKER).
- **Unified cost surfacing** — `MCPMetricsRecorder` chokepoint at both `dispatchMcpToolRoute` + `dispatchMcpMessageRoute`; rows write to shared `fsbUsageData` with `source: 'mcp' | 'ai-provider'` discriminator; Control Panel hero numbers unify both sources; PII grep gate (9 banned identifiers); double-record BLOCKER fix via `_mcpMetricsSuppressInner` flag for the 14 alias-routed tools.
- **TelemetryCollector + alarm + queue** — 5-min `chrome.alarms`-driven beat surviving MV3 SW eviction; aggregated-summary beat shape (grouped by client+model); watermark-driven read of `fsbUsageData`; `fsbTelemetryQueue` 200-cap FIFO; 24h stale drop; 5-attempt retry cap; opt-out live-read on every flush; 3-way privacy gate (in-code allowlist + static-grep + runtime allowlist test); 71+13 assertions.
- **Server schema + telemetry ingest** — BLOCKER #1 `app.set('trust proxy', 1)` immediately after `const app = express()` (showcase/server/server.js:33); BLOCKER #2 `express-rate-limit@^8.3.0` (resolved 8.5.2; CVE-2026-30827 IPv4-in-IPv6 collision fix via `ipKeyGenerator` wrapper); HMAC-SHA256 daily-rotated salt in SQLite (today + yesterday only, lazy rotation, transactional); 4 new SQLite tables + 5 WAL pragmas + 5 indexes; 3 public POST routes (`/events`, `/optout`, `/forget` for GDPR Article 17) with 8 layered abuse defenses (32KB body, 50 batch, 30/min rate, 9-field allowlist, 13-label client allowlist, UUIDv4 shape, ±5min/-7d timestamp tolerance, 1000/UUID/day, Sec-GPC silent drop); hourly housekeeper deletes >7d events + re-aggregates + recomputes globals with k≥5 anonymity floor; no-IP-leak CI grep gate (15 .js files clean); 121 server-telemetry assertions + 2 review fixes (k-anonymity install-count + ipKeyGenerator alignment).
- **Public aggregates + /stats expansion** — `GET /api/public-stats/global` + `/global/series` (no auth, 30s in-process memo + ETag + Cache-Control: max-age=60); `active-tracker.js` in-memory Map for "active right now" (5-min window) + active-agents bucketed `{0,1,2-4,5-8,9-16,17-32,33+}`; new `FSBTelemetryService` Angular mirror of `GitHubStatsService` (PLATFORM_ID, BehaviorSubject, afterNextRender, 5-min visibility-aware polling); 6 new chart toggles on `/stats` (fsb-active-now, fsb-tokens, fsb-agents-running, fsb-popular-agents, fsb-popular-mcp, fsb-avg-agents-per-user); headline row above chart; 24 new i18n trans-units AI-filled across 5 non-en locales (es/de/ja/zh-CN/zh-TW); `/stats` remains Easter-egg-invisible (no sitemap/llms.txt/prerender/hreflang); 294 assertions.
- **Privacy policy + CWS listing** — BLOCKER #3 `showcase/angular/src/app/pages/privacy/privacy-page.component.html` gains "Anonymous Usage Telemetry" section with stable `#telemetry-disclosure` anchor + 5 collected fields + 6 NOT-collected categories + retention policy + kill-switch path + GDPR Article 17 curl recipe + Limited Use affirmation (verbatim CWS phrasing); 25 new trans-units across 6 locales; `store-assets/chrome-web-store/listing-copy.md` Data Collection section; new `store-assets/chrome-web-store/privacy-practices-evidence.md` documenting CWS Privacy Practices tab decisions; `scripts/verify-store-listing.mjs` 5-assertion CI guard; `homepage_url` added to `extension/manifest.json`; 56 assertions.
- **Dashboard streaming defensive patches (Phase 276)** — DIAGNOSTIC.md scaffold with 7-hypothesis validation matrix; defensive patches for hypotheses #1 (hashKey room-state logs at handler.js:152-160), #2 (200ms readiness-ping polling replaces 300ms heuristic in ws-client.js:1029+1406; `pingDomStream` handler in dom-stream.js:971), #4 (`_pendingStreamStart` re-arm on `domStreamReady`); stream-state pill tooltip (last-frame-ago, mutations, apply failures, stale count) + Resync button (STREAM-04); watchdog auto-resnapshot when `_streamingActive` (STREAM-05); WS backpressure drop counter at `bufferedAmount > 16MB` (STREAM-06); STREAM-07 5-attempt cap honoured (this counts as attempt 1 of 5); 52 unit assertions; status: `human_needed` for browser-repro confirmation post-merge.

**Accepted closeout caveats:**

- **Phase 276 streaming fix verification deferred:** Phase 276 lands DEFENSIVE patches that are safe regardless of which of the 7 hypotheses is the actual root cause. The actual fix-confirmation requires browser repro (8-step manual checklist in `.planning/phases/276-…/276-VERIFICATION.md` `<human_verification>`). STREAM-07 5-attempt cap protects future cycles — if defensive patches don't resolve the issue, hypotheses #3 / #5 / #6 / #7 are attempts 2-5 in subsequent sessions.
- **Phase 274 chart-render visual smoke deferred:** chart.js lazy chunk loads in browser; 6 new chart views render via existing GitHubStatsService pattern (already validated for the GitHub views in quick task 260514-1nv). Visual confirmation = 1-minute browser smoke at milestone close.
- **CWS Developer Dashboard click-through user-gated:** `store-assets/chrome-web-store/privacy-practices-evidence.md` documents the 8-step publish-time checklist (tick Personally Identifiable Information, set privacy policy URL `https://full-selfbrowsing.com/privacy#telemetry-disclosure`, tick Limited Use certification, capture screenshots). CI guard `verify-store-listing.mjs` enforces in-repo invariants; the dashboard click-through itself is per D-15 outside automation scope.
- **Carry-forward from prior milestones:** `npm publish fsb-mcp-server@0.9.0` (v0.9.62), branch + tag pushes for v0.9.62 / v0.9.63 / v0.9.69, `clawhub publish "skills/FSB Skill"` (v0.9.61), 4 live-OpenClaw runtime UAT items (v0.9.61).
- **14 deferred items captured under TELEMETRY-FUTURE-* + DASHBOARD-FUTURE-*** in REQUIREMENTS.md (first-run banner, "View what we send" preview, "Reset anonymous ID" button, "Wipe my data" UI, region-gated EU opt-in, public versioned `/api/public-stats` documentation, per-day sparklines, geo heatmap, 1Hz real-time ticker, full dashboard streaming rewrite, dashboard i18n carry-forward, etc.). Triage via v0.9.70 scoping.

---

## v0.9.63 Showcase i18n (Shipped: 2026-05-13)

**Phases completed:** 7 phases (261, 262, 264, 265, 266, 267, 268), 15 plans, 14/14 requirements satisfied.

**Archive:** `.planning/milestones/v0.9.63-ROADMAP.md` and `.planning/milestones/v0.9.63-REQUIREMENTS.md`

**Audit status:** `passed` -- `.planning/milestones/v0.9.63-MILESTONE-AUDIT.md` (post-Phase-268 re-audit: WARNING-01 and WARNING-03 resolved; WARNING-02 deferred).

**Key accomplishments:**

- Translated the FSB marketing site (`showcase/angular`) into es / de / ja / zh-CN / zh-TW. English remains source-of-truth; 420 trans-units across 7 namespaces in `messages.xlf`, AI-filled target XLIFFs for all 5 non-en locales, `i18nMissingTranslation: error` enforced at build.
- Established the i18n scaffold: `LocaleService` + locale-constants registry mirrored across Angular ESM and Express CJS with `verify-locale-sync.mjs` CI parity invariant; standalone `LanguagePickerComponent` mounted in header + mobile nav + footer; CJK `:lang()` system-font stacks.
- Promoted `lint:i18n` and `extract-i18n-clean` to hard-fail CI gates (website job); marketing site CI chain runs install -> verify-locale-sync -> lint:i18n -> extract-i18n-clean -> ng build -> verify:hreflang -> verify-bundle-budgets, all green.
- Per-locale prerendered HTML emits 30 `index.html` files (6 marketing routes x 5 locale subpaths + en root) with correct `<link rel="alternate" hreflang>` + canonical fan-out and `<html lang>` reflecting the served locale; `verify:hreflang` post-build assertion gates the count.
- Server-side Accept-Language auto-detection middleware (Phase 267) on `/` parses BCP-47 q-values, 302-redirects first-visit users to the best supported locale subpath, respects existing `fsb-locale` cookie, and is bot-safe (no header -> no redirect).
- Post-audit Phase 268 closed two non-blocking warnings: server.js now derives the supported-locale list from the CJS registry (no more hardcoded literal, inherits CI parity guard) and six per-phase `VERIFICATION.md` artifacts were backfilled for 261/262/264/265/266/267.

**Accepted closeout caveats:**

- **WARNING-02 (deferred):** picker-set `fsb-locale` cookie short-circuits the bare-`/` Accept-Language redirect on returning fresh-tab / shared-link visits (currently surfaces EN prerender at root). Locked per 267-CONTEXT D-02 / T-267-03; UX revisit candidate for v0.9.64+.
- **Dashboard surface deferred to v0.9.65:** `--ignore-pattern src/app/pages/dashboard/**` in `package.json:lint:i18n` carries forward; not translated.
- **Branch merge user-gated:** `feat/showcase-i18n` not yet merged to `main`; final merge and `v0.9.63` tag push remain user-gated.
- **Carry-forward from prior milestones:** `npm publish fsb-mcp-server@0.9.0` (v0.9.62), `git push origin refinements` + `v0.9.62` tag, `clawhub publish "skills/FSB Skill"` (v0.9.61), 4 live-OpenClaw runtime UAT items (v0.9.61).
- **Known deferred artifacts at close: 11** (10 debug sessions + 1 quick task) -- see STATE.md `## Deferred Items`. All predate v0.9.63.

---

## v0.9.62 v0.9.62 (Shipped: 2026-05-11)

**Phases completed:** 7 phases, 15 plans, 15 tasks

**Key accomplishments:**

- COMPLETE -- hard gate cleared.
- Action-tool dispatch chokepoint in mcp/src/tools/manual.ts now rejects calls missing visual_reason / client (VISUAL_FIELDS_REQUIRED) or carrying a non-allowlisted client (BADGE_NOT_ALLOWED) BEFORE any bridge / queue / extension side effect; allowlist helpers exported from mcp/src/tools/visual-session.ts as the shared v0.9.36 source-of-truth.
- 1. [Rule 3 - Blocking] Updated tests/agent-id-threading.test.js navigate call to pass the v0.9.62 field bundle
- Per-tab sliding-window lifecycle helpers landed as a pure module wired into the SW import chain. No caller-facing behaviour yet -- Plan 03 turns them on.
- The Phase 255 validate-then-strip chokepoint now also forwards the validated field bundle to the extension as a top-level `visualSession` sidecar on every mcp:execute-action bridge payload, preserving the strip pattern verbatim.
- Implicit v0.9.62 visual-session lifecycle is now live -- action-tool calls implicitly start a session, repeats re-arm the sliding 60s window, prolonged silence auto-clears, MV3 SW eviction is survived, and v0.9.60 ownership gating still wins.
- Helper-layer CI lock for every TIMEOUT REQ-ID (01-05) is live: 62 assertions across 9 cases cover implicit start, sliding re-arm, auto-clear, SW-eviction replay, ownership-gate defense-in-depth, allowlist defense-in-depth, tab-close cleanup, and module surface shape -- all running on every PR via the root npm test chain.
- Exactly 2 files modified.
- Discovered during:
- 1. [Rule 3 - Blocking] Test allowlist needed v0.9.62 field-bundle keys

---

## v0.9.61 FSB Skill (OpenClaw) (Shipped: 2026-05-08)

**Phases completed:** 6 phases (248-253), 14 plans

**Archive:** `.planning/milestones/v0.9.61-ROADMAP.md` and `.planning/milestones/v0.9.61-REQUIREMENTS.md`

**Audit status:** `passed` -- `.planning/v0.9.61-MILESTONE-AUDIT.md` (29/29 requirements satisfied; 47/47 must-haves verified across phases)

**Key accomplishments:**

- Shipped a complete OpenClaw skill at `skills/FSB Skill/`: SKILL.md frontmatter (`name: FSB`, `version: 0.9.61`, single-line `metadata.openclaw` JSON, `requires.bins: [node, npx]`, `requires.env: []`); ~600-token body with progressive-disclosure pointers; three Node `.mjs` scripts (six-layer doctor dispatcher, canonical stdio printer, consent-gated multi-host installer); seven reference files (tool decision tree, multi-agent contract, restricted-tab recovery, default-to-FSB rule, vault boundary, visual-session lifecycle, README index).
- Recorded the OpenClaw spec verification gate (Phase 248) and ClawHub publish QA pass (Phase 253) under `.planning/`. ClawHub `clawhub inspect fsb` returned "Skill not found"; `name: FSB` is locked with `fsb-browser` + `displayName: FSB` documented as fallback.
- Wired `tests/skill-fsb-spec.test.js` into the root `npm test` chain so the existing `ci / all-green` PR gate covers SKILL.md frontmatter, stdio block parity with `mcp/src/install.ts`, references completeness + multi-agent typed errors, USAGE.md links, and ASCII-only enforcement across all skill artifacts (48/48 PASS at audit time).
- Made the skill discoverable from every existing entry point: root `README.md` Quick Start TL;DR + Repository Layout row, `mcp/README.md` `### OpenClaw` paragraph, the `OpenClaw` block in `mcp/src/install.ts:412-425` `getSetupSections()`, and the showcase `llms.txt` + `llms-full.txt` files.
- Shipped the reproducible build script `scripts/package-skill.mjs` + `npm run package:skill` wiring (writes `dist/skill/FSB-Skill-<version>.zip`, version stamped from SKILL.md frontmatter). Documented the user-gated publish sequence (`clawhub login` -> `clawhub publish "skills/FSB Skill"`) in `mcp/README.md` and the QA doc.
- Zero new MCP tools, zero extension diffs, zero `mcp/src/server.ts` or `mcp/src/tools/*.ts` edits. Single test file added; no new dev dependencies.

**Accepted closeout caveats:**

- Live OpenClaw runtime validation is user-gated: 4 items recorded in `249-HUMAN-UAT.md` (load skill into fresh OpenClaw, exercise the six-layer doctor matrix end-to-end, paste canonical stdio JSON into a real OpenClaw MCP config, install-host happy path against real Claude Desktop / Cursor / etc.).
- ClawHub `clawhub publish "skills/FSB Skill"` is user-gated (mirrors v0.9.60 `npm publish fsb-mcp-server@0.8.0` posture). Server-side VirusTotal + ClawScan + GitHub-account-age (>= 7 days) checks fire on the user's command.
- Carry-forward from v0.9.60: `npm publish fsb-mcp-server@0.8.0` remains user-gated; live unowned-`switch_tab` UAT and 5-run long `run_task` soak still deferred (automated coverage green).

## v0.9.60 Multi-Agent Tab Concurrency (MCP 0.8.0) (Shipped: 2026-05-08)

**Phases completed:** 11 phases, 30 plans

**Archive:** `.planning/milestones/v0.9.60-ROADMAP.md` and `.planning/milestones/v0.9.60-REQUIREMENTS.md`

**Audit status:** `passed` with documented caveats -- `.planning/v0.9.60-MILESTONE-AUDIT.md`

**Key accomplishments:**

- Shipped MCP agent identity and tab ownership: each MCP session receives an FSB-minted `agent_id`, owned tabs bind with ownership tokens, and cross-agent access rejects with typed `TAB_NOT_OWNED`.
- Added concurrency lifecycle controls: configurable cap 1-64, fail-loud `AGENT_CAP_REACHED`, forced-new-tab pooling, reconnect grace by `connection_id`, pool-shrink release, and no idle reaping.
- Repaired deferred Phase 236 behavior: `run_task` resolves on lifecycle completion, emits 30s progress heartbeats, persists task state across service-worker wake, and keeps a 600s safety net.
- Added the ownership-gated `back` MCP tool with structured status results and background-tab operation.
- Audited foreground side effects and added ownership UI signals: trusted-client badge includes agent suffix, popup/sidepanel show owner chips, and Advanced Settings exposes the cap with active-agent context.
- Prepared `fsb-mcp-server@0.8.0` with SDK `^1.29.0`, version metadata, README, CHANGELOG, and documented multi-agent tool descriptions.
- Added post-action `change_report` responses so action tools report compact mutation consequences while read tools stay clean.
- Closed the late protocol bug where active `chrome://newtab/` blocked recovery tools: `open_tab`, zero-owned `navigate`, and truthful restricted-page guidance now work from restricted active tabs.

**Accepted closeout caveats:**

- `fsb-mcp-server@0.8.0` is tag-ready; actual npm publish remains user-gated.
- Live unowned-target `switch_tab` recovery could not be reproduced in this browser profile because candidate tabs were auto-owned by `legacy:sidepanel`; the dispatcher branch is covered by automated tests.
- Five long real `run_task` soak runs remain deferred; automated lifecycle coverage is green.

---

## v0.9.50 Autopilot Refinement (MCP-Parity) (Shipped: 2026-05-03)

**Phases completed:** 7 GSD-tracked (224-230) + 3 opportunistic (231-233 untracked); 54 commits, 91 files changed (+7607 / −362)

**Archive:** `.planning/milestones/v0.9.50-ROADMAP.md` and `.planning/milestones/v0.9.50-REQUIREMENTS.md`

**Audit status:** `tech_debt` accepted — `.planning/v0.9.50-MILESTONE-AUDIT.md`

**Key accomplishments:**

- Established autopilot baseline (Phase 224) — side-by-side autopilot-vs-MCP tool surface inventory, baseline `run_task` log run with failure categorization, reproducible operator verification recipe. Surfaced two unexpected findings: element targeting was already clean; real failure modes were tool-choice escapes and stuck-no-detection long loops.
- Tool layer aligned with MCP (Phase 225) — verified annotation parity is structural via shared TOOL_REGISTRY (no-op fix); shipped MCP autopilot reliability fixes (in-flight session lookup, stop_task on active session); confirmed CDP routing parity. MCP server-side `run_task` return-on-completion subscribe deferred to Phase 236.
- Prompt rules added with baseline-evidence (Phase 226) — 5 new system prompt rules + dropdown two-click pattern. Mid-milestone reversal: original "no-shortcut-escapes" rule replaced with "JS-first" policy after Amazon Add-to-cart loops showed native click failing repeatedly while JS click succeeded in one shot.
- Stuck-detection enhanced (Phase 227 + meta-cognitive Phase 233) — strict consecutive-action-repetition detector (warn@3, force-stop@5) plus windowed goal-progress heuristic, both with attributed reason codes. Phase 233 added per-target attempt counter (warn@4, force-stop@6, 12-iteration window) that pools mixed click+execute_js attempts and operates independently of the lossy `actionHistory` pipeline.
- Dynamic model discovery shipped (Phase 228) — replaced hardcoded model lists with live `/v1/models` API calls per provider (xAI, OpenAI, Anthropic, Gemini, OpenRouter); FALLBACK_MODELS preserved as constants; per-provider response shape handled in single discovery module.
- Visual overlay stabilization (Phases 229 + 230) — 400ms debounce, glow position memoization, monotonic progress clamp, reduced-motion CSS, then 1200ms minimum-display-duration floor on top; replaced percent in pill with phase wording ("Acting…", "Thinking…", "Writing…").
- Cost-limit removed (Phase 231 untracked) — $2/session cost circuit breaker disabled per operator request; iteration limit + time limit gate sessions now.
- Model-discovery cache + sticky selection (Phase 232 untracked) — discovered model list now persists to `chrome.storage.local` with 24h TTL (survives MV3 service-worker restarts); user's saved model preserved as `(saved)` synthetic entry rather than silently reassigned.
- Version bumped 0.9.31 → 0.9.50 across extension manifest, package.json, runtime headers, README, showcase APP_VERSION.

**Accepted debt (tech_debt audit):**

- MCP `run_task` 300s ceiling — extension-side completion broadcaster ships, MCP server-side subscriber not yet published (Phase 236).
- Phase 230 documentation gap — single atomic commit, no per-plan SUMMARYs (work itself sound; Phase 234 formalizes).
- PROMPT-08 fallback escape — drag still falls back to `execute_js` JS-swap when CDP returns observable no-op; partially mitigated by Phase 233 meta-cognitive force-stop.
- Three opportunistic phases (231/232/233) bypassed GSD lifecycle — 231 committed clean, 232+233 uncommitted at archive time. Phase 235 retroactive coverage planned.
- REQUIREMENTS.md grew from declared 13 to actual 36 REQ-IDs over the milestone; mid-milestone REQ families (DISCOVERY-*, OVERLAY-*, DWELL-*) backfilled at completion time.
- Stray `mcp/ai/tool-definitions.cjs` drift from another phase mixed into Phase 232's working tree.
- `actionHistory` recording bug — primary mutation tools (click) and most execute_js calls don't reach `session.actionHistory.push`. Worked around in Phase 233 with defensive `session.toolCallLog`. Root-cause fix not in scope.

**Gap-closure phases planned (carry to next milestone):** 234 (REQUIREMENTS backfill formalization), 235 (retro PLAN/SUMMARY/VERIFICATION for 231/232/233 + commit cleanup), 236 (MCP `run_task` return-on-completion publish + lifecycle bus subscriber).

---

## v0.9.49 Remote Control Rebrand & Showcase Metrics Wire-up (Shipped: 2026-05-02)

**Phases completed:** 1 phases, 4 plans, 6 tasks

**Key accomplishments:**

- Full local CI matrix green (validate:extension OK, npm test all suites pass, showcase:build OK, showcase:smoke 46/0); autonomous UAT AUTO-PASS recorded against all four ROADMAP success criteria with live-extension visual confirmation deferred as carry-over validation debt.

---

## v0.9.48 Angular 20 Migration (Shipped: 2026-05-02)

**Delivered:** Migrated `showcase/angular/` from Angular 19 to Angular 20 ahead of the 2026-05-19 Angular 19 EOL (shipped 17 days early). All v0.9.46 SEO/GEO surfaces preserved; production smoke crawler against `https://full-selfbrowsing.com/` passed 46/46 assertions post-deploy.

**Archive:** `.planning/milestones/v0.9.48-ROADMAP.md` and `.planning/milestones/v0.9.48-REQUIREMENTS.md`

**Phases completed:** 2 phases (221 mechanical upgrade, 222 production verification), 1 plan, 3 commits, 12 files (+2815 / −2368 — mostly lockfile churn)

**Key accomplishments:**

- `ng update @angular/cli@20 @angular/core@20 @angular/build@20 @angular/ssr@20 --allow-dirty` ran the v19 → v20 schematic suite to completion. Schematic auto-rewrote `provideServerRouting` → `provideServerRendering(withRoutes(...))` in `app.config.server.ts`; moved `DOCUMENT` imports from `@angular/common` to `@angular/core` across 4 page components.
- All `@angular/*` packages now `^20.3.x`; TypeScript bumped 5.6 → 5.9.3.
- `zone.js` retained at v20-compatible version (zoneless deferred to future milestone).
- One manual cleanup: removed unused `withRoutes` import from `app.routes.server.ts` (schematic added it speculatively).
- Lockfile-drift fix: PR #15 regenerated `showcase/angular/package-lock.json` cleanly after the Phase 221 commit failed `npm ci` in the Docker build.
- All v0.9.46 SEO/GEO surfaces preserved: per-route prerender of `/`, `/about`, `/privacy`, `/support`; route-specific titles + canonicals + OG/Twitter; Organization + SoftwareApplication JSON-LD; runtime `noindex` on `/dashboard`; `robots.txt`/`sitemap.xml`/`llms.txt`/`llms-full.txt` at apex.
- Production smoke 46/46 post-deploy.

**Accepted debt:**

- `serve:ssr:showcase-angular` npm script is now dead — Angular 20 + `outputMode: static` no longer writes `dist/showcase-angular/server/`. Production unaffected; cleanup in a future docs/scripts pass.
- Lockfile-drift risk between dev (Node 25) and CI/Docker (Node 20) — caused the deploy retry. Future migrations should validate `npm ci` from a clean tree before pushing.

---

## v0.9.47 Workspace Reorganization (extension / mcp / showcase) (Shipped: 2026-05-02)

**Delivered:** Reorganized the repo into three clearly-bounded top-level packages — `extension/`, `mcp/`, `showcase/`. Each package owns its own assets and README. Cross-package boundaries are now explicit. Mechanical reorg only — no functional changes, no bundler/tooling changes, no Angular migration.

**Archive:** `.planning/milestones/v0.9.47-ROADMAP.md` and `.planning/milestones/v0.9.47-REQUIREMENTS.md`

**Phases completed:** 4 phases (217–220), 4 plans, 5 commits, 406 files (+513 / −164)

**Key accomplishments:**

- Phase 217: Moved 16 dirs/files (`background.js`, `manifest.json`, `content/`, `ui/`, `agents/`, `ws/`, `ai/`, `offscreen/`, `lib/`, `assets/`, `config/`, plus 5 supporting dirs) under `extension/` via `git mv`; updated `scripts/validate-extension.mjs` to walk `extension/`; patched ~35 test files; created `extension/README.md`.
- Phase 218: Renamed `mcp-server/` → `mcp/`; npm package `fsb-mcp-server@0.7.4` name unchanged; updated `npm-publish.yml` `working-directory`, `ci.yml` job, root `package.json` test scripts, 8 test files + harness.
- Phase 219: Moved `server/` (Express + SQLite + ws deploy backend) → `showcase/server/`; updated `Dockerfile` (3 `COPY` lines), `.dockerignore`, `.gitignore`. `fly.toml` and `deploy.yml` untouched (no internal path references).
- Phase 220: Added Repository Layout section to root README; created `showcase/README.md`; verified CI workflow paths post-reorg; full local + production validation passed (`curl https://full-selfbrowsing.com/` → 200 with SSR payload).
- CI gating preserved end-to-end: `extension` + `mcp` + `showcase` + `all-green` aggregator. Branch protection on `all-green` held through every reorg PR (#7, #8, #9, #10, #11).

**Accepted debt:**

- Angular 19 EOL: 2026-05-19 — A20 migration is the next milestone (v0.9.48).
- Cross-package import path: `mcp/package.json` build script does `cp ../extension/ai/tool-definitions.js`. Couples mcp build to extension layout.
- Root README still 948 lines of landing-page content; could be slimmed in a future docs pass.

---

## v0.9.46 Site Discoverability (SEO + GEO) (Shipped: 2026-05-02)

**Delivered:** Made `full-selfbrowsing.com` discoverable to traditional search engines and generative AI search by prerendering the four marketing routes (`/`, `/about`, `/privacy`, `/support`) and shipping LLM/crawler-aware root files. Pre-milestone the site returned only the literal string "FSB" to non-JS crawlers; post-milestone every route returns route-specific prerendered HTML with structured data (Organization + SoftwareApplication) and the site exposes `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/llms-full.txt`. Verified live via Google Rich Results Test.

**Archive:** `.planning/milestones/v0.9.46-ROADMAP.md` and `.planning/milestones/v0.9.46-REQUIREMENTS.md`

**Phases completed:** 2 phases (215, 216), 8 plans, 47 commits, 68 files (+8965 / −1533)

**Key accomplishments:**

- Static prerender pipeline (`@angular/ssr@^19` with `outputMode: "static"` + `provideServerRouting`) emitting per-route `index.html` for the four marketing routes; `/dashboard` stays SPA.
- Per-route metadata via Angular `Title` + `Meta` services + `Renderer2`-driven `<link rel="canonical">`; OpenGraph and Twitter Card tags on every route; runtime `noindex,nofollow` on `/dashboard`.
- Structured data: `Organization` JSON-LD baked into `src/index.html` (inherited by every prerendered route); `SoftwareApplication` JSON-LD on home with `publisher.@id` cross-reference; T-LD-01 mitigated via `\u003c` escape.
- Crawler root files: `robots.txt` allowlists 15 named LLM bots (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, etc.); `sitemap.xml` lists 4 routes; `llms.txt` (llmstxt.org-format) + `llms-full.txt` long-form GEO source.
- Single-file ESM Node prebuild (`build-crawler-files.mjs`) regenerates `sitemap.xml`, `llms-full.txt`, and `version.ts` from `manifest.json.version` via npm `prebuild` lifecycle hook; zero new dependencies.
- Express SPA-fallback patched: per-route prerendered HTML preferred over root `index.html`; `/dashboard` exact-match whitelisted; `*.txt` / `*.xml` pinned to `Cache-Control: public, max-age=3600`.
- Production crawler smoke (`smoke-crawler.mjs`, 46 assertions) usable against `BASE_URL`; 5-entry manual UAT scaffold in `216-HUMAN-UAT.md` for Rich Results Test + GSC Live URL.
- Live post-deploy verification: Google Rich Results Test detects 1 valid `SoftwareApplication` with 0 errors; direct GPTBot-UA crawls of all 4 routes return route-specific titles + canonicals.

**Accepted debt:**

- Angular 19 EOL is 2026-05-19 — Angular 20 migration tracked separately as a future milestone.
- `scripts/llms-full.source.md` hardcodes "50+ browser actions, 142+ site guides"; drift risk flagged for revisit if release counts diverge.
- `sitemap.xml` `lastmod` is build-day UTC and refreshes on every CI build (D-07; acceptable for low-frequency crawl audience).
- 215-HUMAN-UAT.md has 2 items pending operator session (dashboard runtime `noindex` DOM check, FOUC under cleared `localStorage`); functionally low-risk.

---

## v0.9.40 Session Lifecycle Reliability (Shipped: 2026-04-25)

**Delivered:** Fixed silent task abandonment where the agent loop exits without notifying the sidepanel. All exit paths now finalize properly, every termination records a structured reason, background.js lifecycle handles edge cases without silent loss, and the sidepanel self-heals as a last resort.

**Phases completed:** 3 phases, 4 plans, 12 commits

**Key accomplishments:**

- All 5 broken agent-loop exit paths (stuck force-stop, 3 safety breaker paths, guard clauses) now call `finalizeSession()` with structured termination reasons (`stuck_force_stop`, `cost_limit_exceeded`, `time_limit_exceeded`, `iteration_limit_exceeded`, `session_not_found`, `session_not_running`).
- Guard clauses send blind `automationComplete` broadcasts to the sidepanel even when the session object is missing, ensuring the sidepanel always resets to idle.
- Stale session cleanup now guards running sessions from periodic 30-minute deletion.
- Tab close handler sends full `automationComplete` with `reason: 'tab_closed'` and cleans up overlays before deleting the session.
- Service worker wake immediately notifies the sidepanel with `reason: 'service_worker_restart'` for non-resumable restored sessions.
- 15 silent `.catch(function(){})` on sendMessage calls replaced with diagnostic `console.warn` logging (3 in agent-loop.js, 12 in background.js).
- Sidepanel 10-second liveness poll with 2-failure grace period detects orphaned "working" state and self-heals to idle.

**Accepted debt:**

- UAT Tests 1 and 3 (SW kill orphan recovery, interval cleanup) skipped due to MCP bridge relay timeout preventing remote observation. Code-level verification passed 4/4 must-haves. Manual testing recommended during next interactive session.

---

## v0.9.36 MCP Visual Lifecycle & Client Identity (Shipped: 2026-04-24)

**Delivered:** Explicit MCP visual-session ownership, trusted client badges, persisted overlay replay, and lifecycle validation/docs for MCP-driven browser work outside the built-in autopilot loop.

**Archive:** `.planning/milestones/v0.9.36-ROADMAP.md` and `.planning/milestones/v0.9.36-REQUIREMENTS.md`

**Phases completed:** 3 phases, 6 plans, 12 tasks

**Key accomplishments:**

- Explicit MCP visual-session start/end tools with trusted client labels, separate tab ownership, and token-aware overlay metadata.
- Token-aware progress and final task-status updates for client-owned MCP visual sessions, with deterministic final-clear behavior and narration-safe regressions locked down.
- Trusted MCP client badges now render consistently on the live page overlay and the mirrored dashboard preview, including frozen overlay states.
- Client-owned visual sessions now survive reinjection and service-worker churn, replay with the same trusted owner, and degrade or clear safely instead of leaving the glow stuck.
- The MCP visual-session lifecycle is now backed by packaged smoke for start/end, explicit idempotent cleanup assertions, and tighter overlay/preview regressions for degraded and frozen client-owned states.
- The MCP package guide now explains how to own the glow with visual sessions, when `run_task` is still the better fit, and where trusted client labels and `session_token` threading matter.

**Accepted closeout notes:**

- No standalone `v0.9.36-MILESTONE-AUDIT.md` file was created before archive; closeout relies on the archived roadmap snapshot, requirements snapshot, and phase summaries.

---

## v0.9.35 MCP Plug-and-Play Reliability (Shipped: 2026-04-24)

**Delivered:** Plug-and-play MCP reliability across reconnect lifecycle, tool routing, diagnostics, install parity, and release-smoke validation.

**Phases completed:** 5 phases, 15 plans, 24 tasks

**Key accomplishments:**

- Bridge lifecycle now reconnects across browser-first, server-first, service-worker wake, and hub/relay handoff scenarios without requiring extension reload loops.
- MCP browser, autopilot, observability, and restricted-tab paths now route through explicit verified contracts instead of fragile background self-dispatch.
- `doctor`, `status --watch`, and recovery messaging now identify the failing layer and point operators at one concrete next action.
- Installer/config parity now covers Codex TOML preservation, Claude/Cursor/Windsurf guidance, and explicit manual fallback posture for unstable hosts like OpenCode/OpenClaw.
- Release smoke now includes automated lifecycle/tool suites plus dated host evidence and diagnostics-first troubleshooting docs.

**Accepted closeout debt:**

- No standalone `v0.9.35-MILESTONE-AUDIT.md` file was produced before archive.
- Phase 202 records residual live-UAT risk because paid-model host prompt sessions were not auto-triggered when local host preflight was already red or unconfigured.

---

## v0.9.34 Vault, Payments & Secure MCP Access (Shipped: 2026-04-22)

**Delivered:** Vault unlock repair, payment method management, autopilot/MCP vault fill surfaces, and security boundary fixes for sensitive credential/payment flows.

**Phases completed:** 8 phases, 11 plans, 14 tasks

**Key accomplishments:**

- Restored vault lifecycle messaging and eager session/payment-access rehydration across service worker restarts.
- Wired payment method CRUD, masked listing, separate payment unlock state, and options-page payment management UI.
- Added autopilot credential/payment fill paths with sidepanel confirmation before payment fills.
- Added MCP vault tools that return metadata only and keep raw secrets inside the extension/content-script boundary.
- Closed MCP security audit gaps for active-tab domain derivation, sidepanel payment confirmation, content-script param redaction, and the 125-second MCP payment confirmation timeout.
- Shipped backlog MCP tool hardening for route-aware dispatch and text-based click targeting.

**Accepted validation debt:**

- Archived milestone audit is `gaps_found` and predates the Phase 197 gap-closure commits; Phase 197 closed the listed MCP-04, SEC-01, and SEC-02 code gaps, but the milestone audit was not rerun.
- `REQUIREMENTS.md` still had 19 unchecked v1 requirement rows at archive time; those are preserved in `milestones/v0.9.34-REQUIREMENTS.md` as validation debt.
- Live UAT remains pending for Phase 191 vault behavior and Phase 197 MCP payment approve/deny/delayed-approval behavior.

---

## v0.9.30 MCP Platform Install Flags (Shipped: 2026-04-18)

**Phases completed:** 3 phases, 6 plans, 10 tasks

**Key accomplishments:**

- Platform registry module with 10 MCP platform configs, cross-OS path resolution, and config format parsing dependencies
- Format-aware config read-merge-write engine with JSON/JSONC/TOML/YAML support, backup, idempotency, and error handling
- Install/uninstall CLI orchestration for all 7 JSON-format platforms with version constants and end-to-end wiring
- Non-JSON platform support: Claude Code CLI delegation (execSync), TOML/YAML format gate removal, serializeByFormat export
- --dry-run preview with [DRY RUN] prefix and --all bulk install/uninstall across all 10 platforms with per-platform status

---

## v0.9.29 Showcase Angular Migration (Shipped: 2026-04-15)

**Phases completed:** 1 phases, 7 plans, 14 tasks

**Key accomplishments:**

- Standalone Angular migration foundation with deterministic showcase build output and compile-ready home/about/dashboard route component contracts.
- Canonical Angular shell routing plus `fsb-showcase-theme` pre-bootstrap/runtime parity contracts, protected by a source-contract regression test.
- Legacy home/about/dashboard route content now lives in Angular templates with preserved parity anchors, normalized home asset paths, and dashboard runtime DOM IDs intact.
- Global token/theme contracts now live in shared styles while each migrated route owns its legacy-equivalent visuals in component SCSS.
- Express now serves Angular shell routes on canonical showcase URLs with fixed legacy `.html` redirects, and one regression command enforces route/theme/content/server contracts together.
- Compile-ready Angular privacy and support standalone route component contracts with explicit placeholder headings for tranche-B D-02 coverage.
- Privacy and support routes are fully migrated into Angular templates, and a single five-route parity contract test now guards canonical anchors, dashboard IDs, and required asset paths.

**Accepted gaps at close:**

- Phase 174 (`DASH-08` to `DASH-10`) deferred.
- Phase 175 (`DASH-11` to `DASH-13`) deferred.
- Phase 176 (`DASH-14` to `DASH-17`) deferred.
- Phase 177 (`MIGR-01` to `MIGR-03`) deferred.

---

## v0.9.27 Usage Dashboard Fix (Shipped: 2026-04-14)

**Phases completed:** 2 phases, 3 plans, 6 tasks

**Key accomplishments:**

- Dashboard analytics refresh now waits for analytics initialization and reloads usage data from `chrome.storage.local` instead of relying on stale in-memory state.
- Off-screen analytics updates are deferred through `dashboardState.analyticsNeedsRefresh` and replayed when the operator returns to the dashboard.
- Missing dashboard label nodes are now null-safe, and the analytics refresh lifecycle is locked in place by `tests/dashboard-analytics-refresh.test.js` in the main `npm test` suite.
- Local unpacked-extension smoke verification confirmed that a real task completion updates request count, token totals, cost, and chart data on the options page.

**Accepted debt at close:**

- `Off-Screen Dashboard Refresh Smoke` remains explicitly deferred for a final local rerun before any push or release tagging.
- No standalone `v0.9.27` milestone-audit document was created; closure relies on the phase-level review, security, UAT, and verification artifacts for Phases 171-172.

**Stats:**

- 2 phases, 3 plans, 6 tasks
- Key files: `ui/options.js`, `utils/analytics.js`, `tests/dashboard-analytics-refresh.test.js`, `package.json`

---

## v0.9.26 Progress Overlay Refinement (Shipped: 2026-04-12)

**Phases completed:** 3 phases, 5 plans, 9 tasks

**Key accomplishments:**

- Status:
- GPU-composited scaleX progress bar, actionCount data pipeline from background through overlay-state, and tabular-nums on meta row digits
- rAF-driven elapsed timer in M:SS format, action count from overlayState.actionCount, success/failure completion presentation with 3s auto-hide, and frozen guard for post-completion safety

---

## v0.9.25 MCP & Dashboard Reliability Closure (Shipped: 2026-04-11)

**Phases completed:** 5 phases, 8 plans, 11 requirements (9 satisfied, 2 satisfied with debt)

**Key accomplishments:**

- Restricted-tab MCP parity: browser-safe navigation, tab, and run_task tools now operate from `chrome://newtab` and other restricted pages; smart-start routing is preserved and DOM/manual tools return actionable recovery guidance instead of raw injection errors.
- Dashboard reliability rebaseline: preview rejects stale DOM stream updates and resnapshots on divergence, remote control keeps bounded coordinates and recoverable debugger ownership through toggles and stream-tab changes, and dashboard task runs stay bound to one `taskRunId` across reconnect recovery.
- Runtime carryover hardening: `CostTracker` now hydrates after the final mode-aware safety config resolution so its cost limit matches the active mode, and the unused `emitter` passthrough option on `runAgentLoop` no longer advertises dead agent-loop plumbing.
- Auth outcome smoke verification: preserved partial/manual handoff and same-session auth resume are recorded as live-confirmed outcomes from a real extension session.
- Live dashboard verification pass: deterministic matrix executed against the real hosted dashboard, surfaced a duplicate legacy printable `char` echo defect, and shipped a defensive suppression fix in `background.js` covered by `tests/dashboard-runtime-state.test.js`.
- Shipped version bumped from 0.9.20 to 0.9.25 across `manifest.json`, `package.json`, UI surfaces, `README.md`, and project `CLAUDE.md` to realign with the closing milestone label.

**Accepted debt at close:**

- Phase 165 hosted-environment live reruns for DET-06/DET-07/DET-08/DET-13/DET-15/DET-16/DET-17/DET-18 and the 8 JS-heavy rows remain deferred. Requires a reloaded unpacked extension in the active Chrome session and a hosted dashboard build that exposes `window.__FSBDashboardTransportDiagnostics`. Code posture is stable; the remaining gap is live-environment observability only.

**Stats:**

- 5 phases, 8 plans, 11 requirements
- Key files: `background.js`, `tests/dashboard-runtime-state.test.js`, `ai/cost-tracker.js`, `ai/agent-loop.js`, `mcp-server/**`

---

## v0.9.24 Claude Code Architecture Adaptation (Shipped: 2026-04-05)

**Phases completed:** 10 phases, 20 plans, 33 requirements

**Key accomplishments:**

- Built the typed session-state foundation for the runtime with `createSession`, hot/warm persistence semantics, transcript storage, structured turn results, action history, and a state emitter.
- Extracted engine configuration seams for pricing, cost tracking, execution modes, session defaults, and permission gating so the runtime no longer relies on scattered inline constants.
- Introduced a reusable HookPipeline and refactored the agent loop to use lifecycle hooks, extracted modules, and resumable session behavior while preserving MV3-safe iteration flow.
- Structured service-worker bootstrap and migrated remaining consumers onto the new module contracts, including mode-aware session construction and session persistence.
- Wired runtime progress events into popup and sidepanel consumers, then added first-class partial outcomes and auth-wall handoff preservation so useful work survives blocked final steps.
- Made overlay/debugger feedback resilient across reconnects, navigation, long provider waits, and dashboard DOM-stream preview synchronization.

**Accepted debt at close:**

- `CostTracker` still needs a small ordering cleanup so its instantiated limit always matches the final per-mode session config.
- Auth-wall behavior shipped, but live browser smoke coverage is still recommended for no-sidepanel fallback, skip/timeout preservation, and same-session resume.

**Stats:**

- 10 phases, 20 plans, 33 requirements
- Key files: `ai/session-schema.js`, `ai/transcript-store.js`, `ai/hook-pipeline.js`, `ai/engine-config.js`, `ai/cost-tracker.js`, `background.js`, `ai/agent-loop.js`

---

## v0.9.21 UI Retouch & Cohesion (Shipped: 2026-04-02)

**Phases completed:** 5 phases, 9 plans

**Key accomplishments:**

- Established a shared `fsb-ui-core.css` baseline so popup, sidepanel, control panel, and dashboard surfaces all consume one FSB visual system
- Retouched the sidepanel into a cleaner persistent workspace with better hierarchy, history chrome, footer metadata, and composer behavior
- Retouched the popup into a cleaner quick-launch sibling with flatter chrome, aligned states, and tighter footer/composer treatment
- Flattened the control-panel/dashboard shell to a black-neutral dark mode, reduced oversized density, cleaned up pairing/docs surfaces, and normalized dashboard naming
- Replaced the oversized rectangular text highlight behavior with target-aware overlay feedback that uses text-style emphasis for inline targets and fitted boxes for controls, with DOM stream parity

**Stats:**

- 5 phases, 9 plans, 15 requirements
- Key files: `shared/fsb-ui-core.css`, `ui/sidepanel.css`, `ui/popup.css`, `ui/options.css`, `content/visual-feedback.js`

---

## v0.9.9.1 Phantom Stream (Shipped: 2026-03-31)

**Phases completed:** 9 phases (5 planned + 4 inserted fixes), 16 plans

**Key accomplishments:**

- Auto-connect DOM stream on WebSocket handshake with active tab tracking, recovery on disconnect, and 4-state health badge
- LZ-string compression for WS payloads (90%+ reduction on 100KB+ DOM snapshots) with envelope-based backward compat
- 4-mode layout system (inline, maximized, PiP with drag-to-reposition, fullscreen with mouse-tracked exit overlay)
- Full computed style capture (66 CSS properties) fixing broken layouts on complex sites like Google and YouTube
- Native alert/confirm/prompt dialog mirroring to dashboard with styled overlay cards
- Remote browser control (click/type/scroll) through preview with coordinate reverse-scaling and blue border active state
- Idempotent stop signals with promise resolution, eliminating hanging promises and duplicate task-complete messages
- Orange glow overlay broadcast during automation for visual element targeting in preview

**Stats:**

- 9 phases, 16 plans
- Key files: dashboard.js (2,718 lines), dom-stream.js (878 lines), ws-client.js (527 lines)

---

## v0.9.8.1 npm Publishing (Shipped: 2026-04-02)

**Phases completed:** 2 phases, 2 plans

**Key accomplishments:**

- npm-ready package with metadata, files whitelist, `.npmignore`, `prepublishOnly`, and tag-driven GitHub Actions publish workflow
- Public npm release means users can install and run the FSB MCP server via `npx -y fsb-mcp-server` without cloning the repo
- MCP docs now cover stdio usage, optional local HTTP mode, and setup/diagnostic commands without changing the extension bridge contract

**Stats:**

- 2 phases, 2 formal plans
- Key files: `mcp-server/package.json`, `mcp-server/README.md`, `.github/workflows/npm-publish.yml`, `mcp-server/server.json`

---

## v0.9.20 Autopilot Agent Architecture Rewrite (Shipped: 2026-04-02)

**Phases completed:** 8 phases (5 planned + 3 gap closures), 11 plans, 32 requirements

**Key accomplishments:**

- Replaced custom CLI text parsing autopilot with native tool_use agent loop -- the same pattern Claude Code, Computer Use API, and MCP clients all use. AI returns structured tool_use blocks, extension executes via unified tool-executor.js, feeds tool_result back, loops until AI emits end_turn.
- Canonical tool registry (tool-definitions.js, 47 tools in JSON Schema) shared between autopilot and MCP server via CJS-to-ESM schema-bridge.ts. MCP manual.ts reduced from 374 to 78 lines.
- Provider format adapter (tool-use-adapter.js) supporting all 6 providers (xAI, OpenAI, Anthropic, Gemini, OpenRouter, Custom) with native tool_use format translation. No more CLI text parsing or 5-strategy response fallbacks.
- Safety mechanisms: $2 cost circuit breaker, 10-minute time limit, 3-strike stuck detection with recovery hint injection, setTimeout-chained iterations for Chrome MV3 service worker compatibility, session persistence for SW resurrection.
- On-demand DOM snapshots and site guides (AI calls tools when needed instead of auto-injection every iteration), sliding window history compression at 80% token budget, Anthropic prompt caching.
- Net -11,184 lines removed (14,489 deleted, 3,305 added). background.js 14K->9.7K, ai-integration.js 5.2K->2.6K. cli-parser.js and cli-validator.js deleted entirely.

**Stats:**

- 33 files changed
- 3,305 lines added, 14,489 lines removed (net -11,184)
- 8 phases, 11 plans, 32 requirements (100% satisfied)
- 12 post-phase bug fix commits (importScripts scope, storage API, keyboard emulator, overlay cleanup, sidepanel notification)

---

## v0.9.11 MCP Tool Quality (Shipped: 2026-03-31)

**Phases completed:** 6 phases, 7 plans, 13 tasks

**Key accomplishments:**

- Main-content-first extraction with 8K MCP cap via findMainContentRoot selector cascade and fixed full flag passthrough
- Quick-extract-then-retry-if-sparse pattern in readPage handler: auto-waits up to 3s for DOM stability on JS-heavy SPA pages returning sparse content
- Content script auto-reconnects port on BF cache restore via pageshow listener, and MCP execute-action returns navigation info instead of cryptic port errors when clicks trigger page transitions
- Header-aware scroll pipeline with fixed/sticky detection, post-scroll compensation, obstruction recovery retries, and accurate fast-path viewport checks
- pressEnter handler now auto-discovers and clicks submit buttons when Enter key dispatch has no observable effect on form elements
- 3-tier cookie consent detection (6 CMPs + generic + text fallback) with reject-preferring dismiss, wired proactively into readPage and smartEnsureReady pipelines
- 5-tier DOM heuristic cascade detecting site search inputs (type=search, role=search, name=q, placeholder, form action) with visibility filtering and Google fallback

---

## v0.9.9 Excalidraw Mastery (Shipped: 2026-03-25)

**Phases completed:** 9 phases, 14 plans, 56 requirements

**Key accomplishments:**

- Fixed 2 gating engine bugs (isCanvasEditorUrl, isCanvasBasedEditor) preventing multi-step Excalidraw automation; added inserttext CLI command, dblclickat CDP tool, and batch CDP direct routing
- Expanded Excalidraw site guide from ~60 to ~893 lines covering all drawing primitives, text entry (3 modes), canvas operations, element editing, connectors/arrows, styling, alignment, export, and natural language diagram generation
- Built universal Canvas Vision system: canvas-interceptor.js wraps CanvasRenderingContext2D prototype at document_start in MAIN world, captures all draw calls (fillRect, fillText, lineTo, arc etc.), and injects structured CANVAS SCENE section into DOM snapshots
- Canvas Vision proven on 3 live apps (Excalidraw, TradingView, Photopea) with architectural coverage for 12/15 canvas apps; AI can now read canvas content without screenshots
- Added pixel-based fallback (color grid + edge detection) for when draw call interception is unavailable
- Fixed 9 systemic issues found during deep testing: debugger contention, guidance truncation (500->3000 for canvas), dynamic page fast-path threshold (3->6 iterations for editors), site guide CLI verb format, batch action CDP routing

---

## v0.9.8 Autopilot Refinement (Shipped: 2026-03-23)

**Phases completed:** 8 phases, 14 plans, 27 tasks

**Key accomplishments:**

- Procedural memory auto-extraction from successful sessions with RECOMMENDED APPROACH injection into autopilot prompts for proven action replay
- Auto-consolidation fires after every 10 sessions or at 80% per-type capacity via fire-and-forget pattern; all dead EPISODIC code removed from 5 files leaving 3 clean memory types
- Cross-domain procedural memory fallback with [from domain] attribution and mid-session domain-change memory refresh
- CDP tools reject out-of-viewport coordinates before execution; stuck recovery suggests opposite interaction paradigm (coordinate vs DOM) based on recent action history
- Progressive 3-stage prompt trimming at 200K char threshold and two-stage CLI parse failure recovery with simplified hint before full reformat
- Direct CDP tool dispatch in background automation loop, bypassing broken nested content-to-background message round-trip that caused 100% false failure reporting
- Dynamic page completion fast-path accepting AI done signals within 2 iterations for media/gaming/canvas tasks, plus 5-minute running session inactivity auto-expiry
- Registered 7 new CDP/interaction tools in CLI_COMMAND_TABLE prompt reference and isValidTool validator for autopilot tool parity with MCP
- 7 new COMMAND_REGISTRY verb entries for CDP/text/file tools plus enhanced dragdrop with MCP-parity optional parameters
- TOOL SELECTION GUIDE decision table and canvas task-type-aware PRIORITY TOOLS injection for autopilot system prompt
- 20 site guides enriched with distilled AUTOPILOT STRATEGY HINTS from v0.9.7 CANVAS and MICRO-INTERACTION diagnostic reports, prepended within 500-char continuation prompt window
- 20 site guides enriched with distilled autopilot strategy hints from SCROLL (phases 67-76) and CONTEXT (phases 77-86) diagnostic reports, prepended within the 500-char continuation prompt window
- 10 dark pattern site guides enriched with AUTOPILOT STRATEGY HINTS from diagnostic DARK-01 through DARK-10 reports -- countermeasure intelligence prepended at top of guidance strings for continuation prompt visibility

---

## v0.9.7 MCP Edge Case Validation (Shipped: 2026-03-22)

**Phases completed:** 50 phases, 100 plans, 183 tasks

**Key accomplishments:**

- CDP-based click_at and drag MCP tools for canvas interaction using Input.dispatchMouseEvent trusted events
- CANVAS-01 validated PASS: Fibonacci retracement drawn on TradingView via CDP click_at (click-click pattern, all 7 levels confirmed)
- CDP click_at and drag tools now accept shift/ctrl/alt modifiers, enabling shift+click multi-select and constrained drag in canvas apps
- Excalidraw site guide created and live MCP test confirms canvas drawing workflow (press_key + cdpDrag) works; multi-select/alignment blocked by MCP server restart needed for modifier params
- CDP mouseWheel tool for coordinate-targeted zoom on Google Maps and canvas apps, dispatching trusted Input.dispatchMouseEvent at specific viewport coordinates
- Google Maps site guide with 15 selectors, zoom/pan/search workflows, and CANVAS-03 diagnostic report (PARTIAL -- tooling ready, live test deferred to human checkpoint)
- Google Solitaire site guide with Klondike card game DOM selectors, click/drag card interaction workflows, and background.js registration
- Live MCP test of Google Solitaire revealing iframe-hosted game requires CDP coordinate tools (click_at/drag), not DOM selectors -- PARTIAL outcome with key architectural discovery
- Photopea site guide with magic wand background removal workflow, Photoshop keyboard shortcuts, and canvas/toolbar DOM split
- CANVAS-05 PARTIAL: Photopea editor launches and CDP clicks register, but entire UI is canvas-rendered with zero DOM elements -- all site guide selectors invalid
- Nike 3D viewer site guide with model-viewer/WebGL canvas selectors, Sketchfab fallback, and half-width horizontal drag rotation workflow for 180-degree shoe rotation
- Live MCP CDP drag on Sketchfab Nike Air Jordan 3D viewer -- rotation confirmed via horizontal drag, PARTIAL outcome human-approved
- Canvas browser game site guide with pixel-coordinate click_at workflows for fully canvas-rendered HTML5/WebGL game buttons
- CANVAS-07 live MCP test with PARTIAL outcome -- CDP click_at confirmed on Poki/Crossy Road game iframe, canvas button targeting blocked by game loading ads
- Online piano site guide for virtualpiano.net with press_key keyboard mapping (A=C4,S=D4,D=E4), DOM click, and click_at canvas fallback workflows for playing E-D-C-D (Mary Had a Little Lamb)
- CANVAS-08 PASS: all 4 notes of Mary Had a Little Lamb (E-D-C-D) played via press_key debuggerAPI on virtualpiano.net with corrected keyboard mapping (t=C4, y=D4, u=E4)
- Online PDF editor site guide with signature placement workflows for Smallpdf/Sejda/DocHub targeting click_at page placement and DOM click toolbar interaction
- CANVAS-09 PARTIAL outcome -- Smallpdf navigation confirmed via live MCP, DOM-based UI verified, signature placement blocked by WebSocket bridge disconnect
- Miro whiteboard site guide with sticky note creation, drag-to-cluster, and full 12-step clustering workflow using CDP canvas events
- CANVAS-10 diagnostic report with SKIP-AUTH outcome: Miro requires sign-in, 14-step test plan documented, 10 autopilot recommendations including Excalidraw fallback
- HTML5 video player site guide with click_at/drag volume slider workflows targeting 37% precision, supporting Vimeo, Dailymotion, JW Player, Plyr, and Video.js
- MICRO-01 diagnostic report with PARTIAL outcome -- click_at/drag tools confirmed capable for volume slider precision, live execution blocked by WebSocket bridge disconnect, 10 autopilot recommendations documented
- click_and_hold CDP tool wired through all three MCP layers (manual.ts, actions.js, background.js) with mousePressed -> holdMs delay -> mouseReleased, plus voice recorder site guide with dual record workflows
- MICRO-02 diagnostic report with PARTIAL outcome -- click_and_hold tool chain verified across all layers, live execution blocked by WebSocket bridge disconnect, 10 autopilot recommendations for hold/toggle recording
- drag_drop MCP tool exposing DOM-level 3-method fallback chain (HTML5 DragEvent, PointerEvent, MouseEvent) with Trello site guide 3-tier drag-and-drop reorder workflow
- MICRO-03 diagnostic report with PARTIAL outcome: drag_drop MCP tool chain verified complete with 3-method fallback, Trello 3-tier workflow ready, live Kanban card reorder blocked by WebSocket bridge disconnect
- select_text_range MCP tool with TreeWalker-based Range API substring selection, plus Wikipedia site guide with highlightSentence workflow for MICRO-04 sentence targeting
- MICRO-04 diagnostic report with PARTIAL outcome: select_text_range tool chain validated against live Albert Einstein article content, sentence boundary detection confirmed (offsets 113-345 for second sentence), live browser execution blocked by WebSocket bridge disconnect
- Color picker site guide with selectCustomHex workflow covering hue strip positioning, shade area reticle targeting, and hex value readout using click_at/drag CDP tools
- MICRO-05 diagnostic report generated with live DOM validation confirming all 6 colorpicker.me selectors, critical hue formula inversion bug found, 10 autopilot recommendations for coordinate-based color picker interaction
- Carousel site guide with scrollCarouselHorizontally workflow covering arrow buttons, scroll_at deltaX, and drag swipe methods with vertical scroll verification
- MICRO-06 carousel diagnostic with PARTIAL outcome -- Target.com carousel selectors validated against live DOM, 10 autopilot recommendations, WebSocket bridge persistent blocker
- Mega-menu site guide with two interaction strategies (DOM hover+click for JS menus, CDP drag+click_at for CSS :hover menus) covering Best Buy, Home Depot, and Lowes
- MICRO-07 PARTIAL: Lowes.com mega-menu DOM validated (click-to-open modal pattern with data-linkid selectors), physical hover/click blocked by WebSocket bridge disconnect
- drop_file MCP tool with synthetic File + DataTransfer + DragEvent dispatch, plus file-upload site guide with simulateFileUpload workflow covering Dropzone.js, react-dropzone, and native HTML5 patterns
- MICRO-08 diagnostic report with PARTIAL outcome: drop_file tool chain validated, DOM selectors tested against three live sites (dropzone.dev, file.io, gofile.io), WebSocket bridge disconnect blocked physical DragEvent dispatch
- drag_variable_speed MCP tool with quadratic ease-in-out timing curve and slider-captcha site guide with solveSliderCaptcha workflow for GEETEST/Tencent/generic slider CAPTCHAs
- MICRO-09 diagnostic report with PARTIAL outcome: drag_variable_speed tool chain validated at code level, GEETEST JS-rendered DOM structure documented, live MCP execution blocked by WebSocket bridge disconnect (persistent blocker Phases 55-65)
- Podcast audio timeline scrub site guide with click_at/drag workflows for seeking to 14:22 (862s), covering 12 podcast platforms with 5-second tolerance verification
- MICRO-10 diagnostic report with PARTIAL outcome -- Buzzsprout DOM validated (native range input, aria-valuemax=2144, 40.2% position calculation), Spreaker Alpine.js SPA confirmed, live CDP execution blocked by WebSocket bridge disconnect
- Twitter site guide updated with scrollAndCountPosts workflow, virtualized DOM recycling documentation, and permalink-based deduplication for extracting the 150th post from infinite scroll feed
- SCROLL-01 PARTIAL: X/Twitter SPA architecture confirmed (245KB React shell, zero server-rendered tweets), all 10 selectors UNTESTABLE without live browser, WebSocket bridge disconnect blocks MCP execution (Phases 55-67)
- Amazon site guide updated with 14-step scrapeAllSearchResults workflow using ASIN-based deduplication for paginated 500+ product name extraction
- SCROLL-02 diagnostic report with PARTIAL outcome -- Amazon paginated selectors validated via HTTP on amazon.in, ASIN deduplication confirmed with 3 cross-page overlaps, live MCP execution blocked by WebSocket bridge disconnect
- GitHub site guide updated with 12-step findLogEntryByDate workflow, 8 activity feed selectors, relative-time datetime parsing, and href-based event deduplication for SCROLL-03
- SCROLL-03 PARTIAL: GitHub activity timeline structure validated, target date (March 18) confirmed via contribution calendar and REST API (5 torvalds commits extracted), live MCP scroll-through-feed blocked by WebSocket bridge disconnect
- Reddit site guide updated with scrollToBottomAndReply workflow, 12 comment selectors for both new Reddit (Shreddit) and old Reddit, load-more-comments expansion pattern, and SKIP-AUTH reply documentation
- SCROLL-04 PARTIAL: old.reddit.com thread validated with 184/3342 server-rendered comments, 73 load-more buttons identified, last comment identified (kalaban101 at 09:36:59Z), reply auth-gated as SKIP-AUTH, live MCP scroll loop blocked by WebSocket bridge disconnect
- pdf.js virtualized viewer site guide with readVirtualizedDocument workflow (14 steps), textLayer text extraction, page virtualization detection, and 4 workflows for scroll-and-read automation
- SCROLL-05 diagnostic report with PARTIAL outcome -- pdf.js viewer validated via HTTP + viewer.mjs source analysis confirming textLayer/virtualization architecture, 4 selector corrections found, 10 autopilot recommendations, live MCP blocked by WebSocket bridge disconnect
- HN site guide with expandAllThreads workflow (12-step paginated expansion cycle), countComments workflow, 14 selectors, and full page navigation documentation for 1000+ comment threads
- SCROLL-06 HN thread expansion diagnostic with HTTP DOM validation across 3 threads (1115, 2530, 2507 comments), finding that HN loads all comments on a single page with no morelink pagination on comment threads
- Airbnb site guide updated with 11-step panMapForListings workflow, 9 map selectors, CDP drag panning strategy, and pin-count verification for SCROLL-07 edge case
- SCROLL-07 diagnostic report with PARTIAL outcome -- Airbnb map container validated via data-testid, listing pins confirmed client-rendered, live CDP drag panning blocked by WebSocket bridge disconnect
- TikTok site guide with scrollFeedForCatVideo workflow using data-e2e selectors, search-page-first auth avoidance, and cat keyword matching in video descriptions
- SCROLL-08 diagnostic report with PARTIAL outcome -- TikTok fully client-rendered SPA returns zero content in server HTML, all 11 data-e2e selectors untestable via HTTP, live MCP blocked by WebSocket bridge disconnect
- SaaS pricing table site guide with 15-step scroll-read-deduplicate extraction workflow, 18+ selectors, and Notion/Airtable targeting for SCROLL-09
- SCROLL-09 diagnostic report with PARTIAL outcome: Notion pricing page fully server-rendered (58 rows in 429KB HTML), generic table selectors 0/6 match, CSS Module prefix matching required, live scroll-read-deduplicate loop blocked by WebSocket bridge disconnect
- News feed site guide with 15-step scrollToYesterdaysArticles workflow, 21 selectors (generic + BBC/CNN/Reuters), and datetime-preferred date detection for SCROLL-10
- SCROLL-10 PARTIAL outcome: BBC News 47 articles validated via HTTP with 15 yesterday articles confirmed from __NEXT_DATA__ JSON, live scroll-stop loop blocked by WebSocket bridge disconnect
- ESPN scoreboard site guide with 17-step monitorLiveScores polling workflow, 20+ selectors (generic + ESPN/CBS/NBA-specific), and snapshot-based change detection for 30-minute sustained monitoring
- CONTEXT-01 diagnostic with PARTIAL outcome: ESPN NBA scoreboard HTTP polling confirmed 3 score changes across 5 polls (Thunder 69->73, Wizards 64->70), 13/27 selectors matched, 2-snapshot retention validated, 30-minute sustained polling blocked by WebSocket bridge disconnect
- Observable notebook editing site guide with forkAndEditCell workflow (15-step fork/tinker + cell edit sequence), verifyCellUnchanged workflow, 16 selectors, CodeMirror 6 interaction patterns, and background.js wiring
- CONTEXT-02 diagnostic with PARTIAL outcome: Observable notebook HTTP-validated (38 cells via __NEXT_DATA__ JSON), all 16 cell selectors client-rendered only, context bloat analysis showing breadth-based mitigation via targeted getText, live cell editing blocked by WebSocket bridge disconnect
- readPdfAndFillForm workflow and cross-site context retention guidance added to pdf-viewer.js for 50-page PDF to web form data transfer
- CONTEXT-03 PARTIAL diagnostic: pdf.js viewer toolbar (6/16 selectors match) and httpbin form (4 text-fillable fields) validated via HTTP, cross-site PDF-to-form chain blocked by WebSocket bridge disconnect
- compareFlightsMultiTab workflow and CONTEXT-04 guidance added to google-travel.js with 18-step multi-tab comparison sequence, tab lifecycle docs, and context bloat mitigation (under 2500 chars for 5 tabs)
- CONTEXT-04 diagnostic report with PARTIAL outcome: Google Flights HTTP-validated with 12+ server-rendered flight suggestions containing prices in aria-labels, 5-tab open_tab/switch_tab/list_tabs workflow documented but blocked by WebSocket bridge disconnect, Context Bloat Analysis showing 97-99% savings from targeted price-only extraction
- Demo-store.js site guide with 14-step multiStepCheckoutWithCorrection workflow targeting 5 auth-free e-commerce stores for CONTEXT-05 zip correction and tax verification
- CONTEXT-05 PARTIAL outcome: SauceDemo validated as best checkout correction target with data-test selectors for postalCode input and tax summary, but all 5 demo stores use flat tax (not zip-dependent), and live MCP execution blocked by persistent WebSocket bridge disconnect
- Support chatbot site guide with 13-step chatbot15TurnSummary workflow, CONTEXT-06 15-turn conversation strategy, iframe-aware widget detection, and context bloat mitigation for multi-turn exchanges
- CONTEXT-06 diagnostic report with PARTIAL outcome: 5 chatbot targets HTTP-validated (tidio.com, crisp.chat, drift.com, hubspot.com, intercom.com), context bloat analysis showing 92-97% savings via compact turn tracking, 10 chatbot-specific autopilot recommendations, zero conversation turns due to WebSocket bridge disconnect
- Two-factor-auth.js site guide with twoFactorMultiTab workflow documenting multi-tab 2FA authentication flow (login, email code fetch, tab switch, code entry) for CONTEXT-07
- CONTEXT-07 diagnostic report with PARTIAL outcome: 5 login targets and guerrillamail validated via HTTP, 9/14 selectors confirmed, 85-95% context savings from compact {authTabId, emailTabId, code} state tracking, live MCP blocked by WebSocket bridge disconnect
- manualWordReplace workflow with 5-phase Ctrl+F/double-click/type strategy for canvas-based Google Docs word replacement without Find/Replace dialog
- SKIP-AUTH diagnostic for Google Doc manual word replacement -- Ctrl+F search delegation saves 83-96% context, all 10 selectors untestable via HTTP due to auth gate
- crm-hr-cross-ref.js site guide with crossReferenceEmployees 12-step workflow, CONTEXT-09 batch processing guidance for 50-name CRM-to-HR cross-reference, selectors for DemoQA and herokuapp, 5 auth-free fallback targets
- CONTEXT-09 PARTIAL diagnostic: HR portal (herokuapp) fully validated with 7/12 selectors confirmed, CRM (DemoQA) client-rendered, DummyJSON fallback CRM with 208 users, 0 cross-reference matches (independent datasets), 84-96% context savings from batch-of-10 extraction with HR caching
- Session expiry site guide with 14-step handleSessionExpiry workflow, 4 detection patterns, and CONTEXT-10 context bloat mitigation via compact task state under 500 chars
- CONTEXT-10 diagnostic with PARTIAL outcome: herokuapp login selectors validated, session expiry via 302 redirect confirmed, 243-byte compact task state under 500-char budget, 10 autopilot recommendations for re-auth handling
- Freeware download site guide with 12-step downloadRealFile workflow, 8 ad detection heuristics, and elimination-based real link identification for DARK-01 dark pattern avoidance
- DARK-01 PARTIAL: SourceForge VLC real download button identified via 8-heuristic elimination (a.button.download.big-text.green), zero server-rendered fake download buttons found, 22 ad/promotional elements classified, live click blocked by WebSocket bridge disconnect
- Cookie consent dark pattern avoidance site guide with 5-CMP detection, 3-tier hidden reject strategy, and 10-step rejectAllCookies workflow for EU news sites
- DARK-02 diagnostic with PARTIAL outcome: 5 EU news sites validated via HTTP confirming Sourcepoint/iubenda/custom CMP detection, 100% JS-rendered consent UIs, 3 selector mismatches, and 10 cookie consent dark pattern autopilot recommendations
- Shuffled-cancel.js site guide with DARK-03 cancelSubscription workflow using text-based button identification for randomized Keep/Cancel positions
- DARK-03 diagnostic with PARTIAL outcome: userinyerface.com cancel modal validated via HTTP with trick-question "Cancel" = keep-intent pattern, Math.random/Shuffle randomization confirmed in app.js, text-based classification validated across 7 targets, and 10 shuffled button autopilot recommendations
- DARK-04 closePopupAd workflow with 3-tier DOM-based close button detection, decoy filtering, iframe handling, and 5 fallback dismissal strategies for camouflaged pop-up ad overlays
- DARK-04 PARTIAL: BusinessInsider aria-label="Close this ad" with SVG close-icon validated via Tier 1 attribute detection, delayed appearance (5s rollUpTimeout) confirmed from ad config JSON, live click blocked by WebSocket bridge disconnect
- DARK-05 adblocker modal bypass site guide with 8-step bypassAdblockerModal workflow, DOM removal and CSS override strategies, 4 detection library patterns, and MutationObserver re-detection handling
- DARK-05 diagnostic report with PARTIAL outcome: 5 live targets HTTP-validated (BlockAdBlock, Forbes, Wired, BusinessInsider, DetectAdBlock), adblocker detection infrastructure confirmed, all modals 100% JavaScript-rendered, DOM removal and CSS override bypass strategies validated against documented library patterns
- DARK-06 site guide with selectCheapestFlight 8-step workflow using numeric price comparison to defeat 7 misleading premium highlighting techniques across 5 airline sites
- PARTIAL outcome diagnostic for misleading premium highlighting: 12 Google Flights + 329 Kayak prices extracted via HTTP, cheapest identified ($56 ATL-TPA, $20 Kayak global), badge manipulation confirmed (Kayak "Best" is composite not cheapest), live click blocked by WebSocket bridge disconnect
- Newsletter-uncheck.js site guide with DARK-07 uncheckNewsletterBeforeSubmit workflow documenting 8 hiding techniques, checkbox classification strategy, and pre-checked newsletter detection using DOM-only analysis
- DARK-07 PARTIAL diagnostic: 2 of 4 targets HTTP-validated, 89% checkbox classification accuracy, 9/11 selectors matched, 10 autopilot recommendations for pre-checked newsletter detection and unchecking
- DARK-08 site guide with findBuriedLoginLink workflow using text-based login vs signup classification across header, footer, hamburger menu, and signup page fallback locations
- DARK-08 diagnostic report with HTTP validation across 5 SaaS homepages confirming login link identification via text/href classification on 4 sites, login:signup ratio 1:3 to 1:5, and CTA asymmetry on 3/4 sites
- DARK-09 skip-ad-countdown site guide with temporal gating workflow using wait_for_element to detect skip button appearance after pre-roll ad countdown, covering YouTube/Dailymotion/Twitch/JW Player/VAST/Vimeo
- DARK-09 diagnostic report with PARTIAL outcome -- HTTP validation confirms ad infrastructure on YouTube/Dailymotion/Twitch (adPlacements JSON, skip feature flags, client-side ad modules) with all skip button elements confirmed 100% client-rendered, wait_for_element validated as correct temporal gating counter-strategy, live execution blocked by WebSocket bridge disconnect
- DARK-10 site guide with extractProtectedText workflow documenting 8 anti-scrape protection types, 6 target sites, and DOM-level bypass strategies using get_dom_snapshot, read_page, and get_text
- DARK-10 PARTIAL diagnostic: Genius lyrics (1.18MB, styled-components sc-HASH) and NYTimes (1.34MB, Emotion css-HASH) both server-render text extractable via structural selectors despite class obfuscation; 3/5 sites blocked by HTTP-level bot detection; live MCP blocked by WebSocket bridge disconnect

---

## v0.9.5 Progress Overlay Intelligence (Shipped: 2026-03-17)

**Delivered:** Enhanced the automation progress overlay with AI-generated live action summaries, smart task-aware progress/ETA estimation, fixed debug feedback leaking to the overlay, and wired debug intelligence back into the AI continuation prompt for better recovery decisions.

**Phases completed:** 36-39 (8 plans across 4 phases)

**Key accomplishments:**

- sanitizeOverlayText strips markdown and clamps to 80 chars, expanded phase labels for sheets workflows
- AI debugger diagnosis and 8-point diagnostic suggestions wired into continuation prompt via slimActionResult + retroactive actionHistory patching
- detectTaskPhase classifies actions into navigation/extraction/writing with phase-weighted progress bands (0-30%, 30-70%, 70-100%)
- Complexity-aware ETA blending with decaying weight formula (70% estimate early, 10% late)
- Multi-site progress shows company completion, Sheets progress shows row completion
- generateActionSummary with 2.5s timeout and 50-entry FIFO cache, fire-and-forget per action
- Task summary line in overlay, recovery state display during debug fallback, 300ms debounce on phase transitions

**Stats:**

- 23 commits
- 37 files changed
- 2,224 lines added, 290 lines removed
- 4 phases, 8 plans, 17 requirements (100% satisfied)
- 1 day (2026-03-17)

**Git range:** `6453f92` -> `22cbf8c`

---

## v0.9.2-v0.9.4 Productivity, Memory & AI Quality (Shipped: 2026-03-17)

**Delivered:** Three milestones shipped in one burst: expanded site intelligence to 7 productivity apps, overhauled Memory tab with unified Task Memories and graph visualization, and added cross-cutting AI perception/action quality improvements (scroll-aware snapshots, 8-point diagnostics, stability detection, parallel debug fallback).

**Phases completed:** 30-35 (17 plans across 6 phases)

**Key accomplishments:**

- Generalized fsbElements pipeline + 7 productivity app site guides (Notion, Calendar, Trello, Keep, Todoist, Airtable, Jira) with keyword routing
- Unified Task Memory schema -- one consolidated recon report per automation session replacing 1-5 fragments
- Polished Memory tab with task cards, collapsible detail views, per-task graph visualization, knowledge graph integration
- Theme-aware rendering with zero hardcoded colors, JSON export/import with duplicate detection
- Scroll-aware DOM snapshots with viewport-complete element inclusion (no arbitrary cap)
- 8-point action diagnostics on every failure with natural language suggestions
- Observation-based stability detection (STABILITY_PROFILES) replacing all hardcoded setTimeout delays
- Hybrid continuation prompt preserving reasoning framework and site guide knowledge across iterations
- Context-aware selector re-resolution with unique match enforcement
- Parallel debug fallback -- heuristic engine and AI debugger fire concurrently on every failure

**Stats:**

- 72 commits
- 56 files changed
- 10,415 lines added, 872 lines removed
- 6 phases, 17 plans, 47 requirements (100% satisfied)
- 2 days (2026-03-16 to 2026-03-17)

**Git range:** `49784b9` -> `505db19`

---

## v10.0 CLI Architecture (Shipped: 2026-03-15)

**Delivered:** Replaced FSB's entire AI-to-extension communication protocol from JSON tool calls to line-based CLI commands, redesigned DOM snapshots as unified markdown with interleaved element refs, and hardened Google Sheets automation with multi-strategy selector resilience -- achieving ~40-60% token reduction and eliminating JSON parsing failures.

**Phases completed:** 15-29 (37 plans across 15 phases)

**Key accomplishments:**

- CLI command protocol: hand-written state-machine tokenizer with 75-command registry parses line-based AI output (click e5, type e12 "hello") into {tool, params} objects -- zero JSON fallback
- Unified markdown DOM snapshot: page text and backtick element refs interwoven (`` `e5: button "Submit"` ``), region headings, 12K char budget -- replacing verbose JSON/YAML with ~40-60% measured token reduction
- Full prompt architecture rewrite: system prompt, continuation, stuck recovery, and 43+ site guide files all speaking CLI grammar exclusively
- Multi-signal completion validator: media/extraction task types, URL pattern matching, DOM snapshot evidence, and consecutive-done escape hatch replacing unreliable AI self-report
- Google Sheets resilience: multi-strategy selector lookup (5 strategies per element), 24 toolbar/menu fsbElements, canvas-aware stuck recovery, keyboard-first interaction patterns, first-snapshot health check
- ~800 lines dead YAML/compact code removed, redundant HTML context eliminated from prompts when markdown present

**Stats:**

- 134 commits
- 237 files changed
- 26,343 lines added, 4,999 lines removed
- 15 phases, 37 plans, 67 requirements (100% satisfied)
- 16 days from start to ship (2026-02-27 to 2026-03-15)

**Git range:** `b5c737d` -> `f92f8b3`

**Tech debt (non-blocking):** 7 items -- stale JSDoc refs to deleted YAML functions (2), dead readPage message handler branch (2), fsbElements annotation format divergence (1), legacy viewport patterns (1), single-slash comment syntax (1)

---

## v9.3 Tech Debt Cleanup (Shipped: 2026-02-23)

**Delivered:** Modularized content.js into 10 logical modules, removed dead code, made ElementCache configurable, fixed AI memory extraction, overhauled memory intelligence with AI enrichment and cost tracking, and split site guides into 43 per-site files with a browsable viewer.

**Phases completed:** 4-8 (17 plans total)

**Key accomplishments:**

- Modularized 13K-line content.js into 10 modules with FSB._modules tracking and badge error indicator
- Removed waitForActionable dead code (158 lines), orphaned files, and unused UI helpers
- Made ElementCache configurable via Options page with preset dropdown and live storage updates (default 200)
- Fixed UniversalProvider constructor so AI memory extraction actually runs when configured
- AI enrichment pipeline for all memory types with cross-site pattern learning and expandable detail panels
- Split 9 site guide categories into 43 per-site files with browsable viewer in Memory tab

**Stats:**

- 100 files changed
- 21,950 lines added, 18,960 lines removed
- 5 phases, 17 plans, 9 requirements (100% satisfied)
- 3 days from start to ship (2026-02-21 to 2026-02-23)

**Git range:** `8249bf3` -> `ad5a4bd`

**Known issues:** Site Guides Viewer displays as custom accordion instead of memory-style list with mind maps (UAT blocker, deferred)

---

## v9.0.2 AI Situational Awareness (Shipped: 2026-02-18)

**Delivered:** Complete AI situational awareness -- the AI sees full page context, remembers what it did, detects changes accurately, and knows when the task is done. Plus session continuity, history, replay, career workflows, memory tab, and Google Docs formatted paste.

**Phases completed:** 1-10 (21 plans total)

**Key accomplishments:**

- 3x DOM context delivery (5K -> 15K prompt budget) with priority-aware truncation and task-adaptive content modes
- Multi-signal completion verification replacing unreliable AI self-report (task-type validators, weighted scoring, critical action registry)
- Structured change detection replacing coarse hash comparison (4-channel DOM signals, structural fingerprints, false stuck elimination)
- Resilient conversation memory with hard facts, compaction fallback, and long-term memory retrieval
- Session continuity, history UI, and action replay across conversations
- Career page search with Google Sheets data entry workflows
- Memory tab population with episodic/semantic/procedural memories

**Stats:**

- 194 files created/modified
- 28,148 lines added, 1,366 lines removed
- 32,578 LOC across core JavaScript files
- 10 phases, 21 plans, 22 requirements (100% satisfied)
- 4 days from start to ship (2026-02-14 to 2026-02-18)
- 10/10 systemic issues resolved

**Git range:** `fab9fe0` -> `e0ed6d5`

---

## v0.9 Reliability Improvements (Shipped: 2026-02-14)

**Delivered:** Transformed FSB from unreliable "hit or miss" automation into a precise single-attempt execution engine with visual feedback, smart debugging, and fast execution.

**Phases completed:** 1-11 (24 plans total, Phase 10 deferred)

**Key accomplishments:**

- Selector generation with uniqueness scoring and coordinate fallback when all selectors fail
- Element readiness checks (visibility, interactability, obscuration) before every action
- Orange glow visual highlighting and progress overlay using Shadow DOM isolation
- 3-stage element filtering pipeline reducing DOM from 300+ to ~50 relevant elements
- Action verification with state capture, expected-effects validation, and alternative selector retry
- Debugging infrastructure: action recording, element inspector, session replay, log export
- Execution speed optimization: element caching, outcome-based delays, parallel prefetch, batch execution
- Control panel cleanup: removed dead UI code, wired Debug Mode and Test API settings

**Stats:**

- 18 files created/modified
- 43,283 lines of JavaScript
- 11 phases, 24 plans
- 2 days from start to ship (2026-02-03 to 2026-02-04)

**Git range:** `feat(01-01)` to `fix(debug)`

**What's next:** Smart multi-tab management, advanced CAPTCHA integration, workflow templates

---

## v9.4 Career Search Automation (Shipped: 2026-02-28)

**Delivered:** Autonomous career search across 30+ company websites with formatted Google Sheets output. Parsed 38 crowd session logs into site intelligence (sitemaps + site guides), built single-site and multi-site career search workflows, and added Google Sheets data entry with professional formatting.

**Phases completed:** 9-14.3 (18 plans across 9 phases in v9.4 scope)

**Key accomplishments:**

- Session log parser converts 38 crowd logs into per-company site guides with confidence-scored selectors and direct career URLs
- 5 ATS base guides (Workday, Greenhouse, Lever, iCIMS, Taleo) covering 15+ companies with stability-classified selectors
- Single-company career search: navigate site, search, extract jobs (company, title, apply link, date, location, description)
- Multi-site orchestration: sequential 2-10 company search with chrome.storage persistence, deduplication, and progress reporting
- Google Sheets output via Name Box + Tab/Enter pattern with bold colored headers, frozen row, auto-sized columns, and context-aware sheet naming
- Batch action execution engine: AI returns multiple actions per turn with DOM-based completion detection between each, plus timezone/country locale injection

**Stats:**

- 20 commits
- 9 phases (6 main + 3 hotfix), 18 plans
- 21 requirements defined, 21 satisfied (100%)
- 4 days from start to ship (2026-02-23 to 2026-02-27)

**Git range:** `bd0b1ef` -> `19bad00`

**Known issues:** ACCEL-01, ACCEL-02, ACCEL-05 traceability table not updated to Complete (requirements checked off in body)

---
