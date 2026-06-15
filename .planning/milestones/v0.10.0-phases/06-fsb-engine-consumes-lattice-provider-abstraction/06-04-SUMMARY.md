---
phase: 06-fsb-engine-consumes-lattice-provider-abstraction
plan: 04
subsystem: extension-options-ui
tags: [lattice, mv3, options-ui, save-settings, test-connection, bridge-shim, fint-08, wave-4, xai-key-rejected-400, defense-in-depth]

# Dependency graph
requires:
  - phase: 06-fsb-engine-consumes-lattice-provider-abstraction
    plan: 00
    provides: "tests/lattice-provider-bridge-smoke.test.js scaffold + passAssert/passAssertEqual counters + Plan 06-04 placeholder line at Part 5"
  - phase: 06-fsb-engine-consumes-lattice-provider-abstraction
    plan: 01
    provides: "extension/offscreen/lattice-host.js lattice-provider-execute handler -- Strategy A test-connection branch routes mode='test-connection' to adapter.execute({task:'Test connection.', artifacts:[], outputs:['text']}, {signal})"
  - phase: 06-fsb-engine-consumes-lattice-provider-abstraction
    plan: 02
    provides: "extension/background.js importScripts('ai/lattice-provider-bridge.js') line 12 + ensureLatticeOffscreen() startup wiring so the bridge has a registered listener when checkApiConnection messages it"
  - phase: 06-fsb-engine-consumes-lattice-provider-abstraction
    plan: 03
    provides: "extension/ai/lattice-provider-bridge.js executeViaBridge(providerKey, config, requestBody, opts) -- SW-side bridge shim that options.js's rewritten checkApiConnection invokes with mode:'test-connection'"
provides:
  - "extension/ui/options.js saveSettings() defense-in-depth: 9 .trim() calls on all 9 input-derived string fields (8 LLM-side API key / endpoint URL + 1 CAPTCHA key); closes xai-key-rejected-400 P1 (missing trim) at the save site; old un-trimmed stored values auto-heal on next user save"
  - "extension/ui/options.js checkApiConnection() rewritten: reads from input fields via per-provider getter map (NOT from chrome.storage); delegates to executeViaBridge(provider, config, {__testConnection:true}, {mode:'test-connection'}); closes xai-key-rejected-400 P2 (stale storage read) defect"
  - "tests/lattice-provider-bridge-smoke.test.js Part 5 final fill: 10 new PASSes (9 plan-required + 2 brace-walker function-found probes) -- 61 PASS baseline -> 71 PASS / 0 FAIL (delta +10 vs >=8 plan minimum); Plan 06-04 placeholder removed"
affects: [06-05-inv-byte-freeze-verification, 06-06-phase-ceremony]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Defense-in-depth trim idiom at write site: `(value || default).trim()` -- wrap the entire `||`-fallback expression in parens then `.trim()`; covers all 9 input-derived string fields (8 LLM-side + 1 CAPTCHA) uniformly so future fields follow the same pattern"
    - "Per-provider getter map for input-field-direct reads: `const PROVIDER_KEY_GETTERS = { xai: function() { return (elements.apiKey?.value || '').trim(); }, ... };` -- each getter returns the trimmed current input value, NOT a chrome.storage snapshot; eliminates the stale-storage trap class for any future test-connection-style flow"
    - "Brace-depth function-body extractor in smoke tests: scan from `function name() {` line forward, tracking { and } depth, stop when depth returns to 0; robust to small line drifts vs hard-coding line numbers; reused in Part 5 for both saveSettings and checkApiConnection bodies"

key-files:
  created:
    - ".planning/phases/06-fsb-engine-consumes-lattice-provider-abstraction/06-04-SUMMARY.md (this file)"
  modified:
    - "extension/ui/options.js (+57 / -40 net): saveSettings() 9 .trim() calls (8 LLM-side + 1 CAPTCHA); checkApiConnection() rewritten from chrome.storage path to input-field-direct path delegating to executeViaBridge"
    - "tests/lattice-provider-bridge-smoke.test.js (+51 / -2 net): Part 5 Plan 06-04 placeholder replaced with 10 real assertions covering saveSettings trim count + checkApiConnection rewrite verification + getStoredSettings preservation"

key-decisions:
  - "Comment block above checkApiConnection drops identifier mentions (`executeViaBridge`, `getStoredSettings`) to keep plan-text grep counts exact (executeViaBridge = 1 invocation only, getStoredSettings = 2 = line 1211 call site + line 1463 declaration). Comment retains the Phase 6 rationale without polluting grep semantics."
  - "Per-provider getter map covers all 7 Lattice provider keys including openrouter + lmstudio (which the legacy apiKeyMap omitted -- it only listed xai/gemini/openai/anthropic/custom). lmstudio's getter returns '' (no key required); the `!apiKey && provider !== 'lmstudio'` guard preserves the No-API-Key UX for the 6 key-required providers while letting lmstudio through to the bridge call."
  - "config.baseUrl derivation inlined in checkApiConnection: ternary chain (custom -> input value trimmed; lmstudio -> input value trimmed + trailing-slash strip + '/v1' suffix; openai -> hardcoded 'https://api.openai.com/v1'; else -> undefined). Mirrors the offscreen handler's per-provider URL logic so the bridge's adapter factory dispatch receives consistent baseUrl shapes."
  - "AIIntegration class declaration NOT touched in this plan -- it's imported via background.js importScripts from extension/ai/ai-integration.js (NOT defined in options.js; `grep -c 'class AIIntegration' extension/ui/options.js` returns 0). Only the `new AIIntegration(settings)` call at line 1110 was removed; the other usage at line 1229 (model-discovery flow) stays. Phase 7 may archive AIIntegration entirely once all call sites migrate to the bridge."
  - "getStoredSettings function declaration NOT touched -- still called at line 1211 (model-discovery flow) and declared at line 1463. The Phase 6 scope-lock per CONTEXT.md decisions section confirms 'getStoredSettings stays BYTE-FROZEN -- used elsewhere by load flows.' Only the line 1082 call site inside checkApiConnection was removed."
  - "Smoke Part 5 brace-walker uses `for (const ch of line)` with depth tracking rather than regex line-end matching. Reason: function bodies contain nested objects (PROVIDER_KEY_GETTERS map literal, PROVIDER_NAMES map literal, config object literal) whose closing `}` braces would false-trigger a regex-based 'end of function' detector. The depth walker correctly identifies the OUTER `}` that closes the function body."

patterns-established:
  - "Pattern 1 (Defense-in-depth trim at write site): for any new persisted text field where leading/trailing whitespace would be semantically invalid (API keys, URLs, hostnames, paths, model IDs), use `(value || default).trim()` at the save site BEFORE chrome.storage.local.set. Auto-heals legacy unsanitized stored values on the next user save without requiring a migration."
  - "Pattern 2 (Per-provider getter map for current-input-value reads): when a test-connection-style flow needs the CURRENT input value (not the persisted snapshot), declare a per-provider getter map inline: `const KEY_GETTERS = { xai: function() { return (input?.value || '').trim(); }, ... };`. Each getter is a closure over the DOM. Avoids the stale-storage trap and naturally handles providers that require no key (lmstudio's getter returns '')."
  - "Pattern 3 (Brace-depth function-body extractor for smoke tests): when asserting on a specific function's body content via grep-like greps (and the function contains nested `{}` literals), walk braces character-by-character from the signature line tracking depth; the outer `}` is the function-body close. More robust than line-range slicing because absolute line numbers shift across plans."
  - "Pattern 4 (Plan-text exact grep count via comment-mention discipline): when the plan acceptance criterion specifies `grep -c 'identifier' file returns N`, audit any new comment blocks added to the modified function for incidental mentions of the identifier. Drop the mentions or rephrase to keep the count exact. Trade-off: lose some inline documentation richness, gain test-determinism."

requirements-completed:
  - FINT-08

# Metrics
duration: 12min
completed: 2026-05-27
---

# Phase 6 Plan 06-04: options.js test-connection rewrite + saveSettings trim defense Summary

**`extension/ui/options.js` saveSettings() gains 9 `.trim()` calls on all 9 input-derived string fields (8 LLM-side API key / endpoint URL + 1 CAPTCHA key) closing the xai-key-rejected-400 P1 missing-trim defect at the save site; `checkApiConnection()` (lines 1077-1131 baseline) is rewritten from chrome.storage path to input-field-direct path via per-provider getter map and delegates to `executeViaBridge(provider, config, {__testConnection:true}, {mode:'test-connection'})` (Plan 06-03 shim) closing the xai-key-rejected-400 P2 stale-storage-read defect; AIIntegration class declaration NOT touched (imported via importScripts; line 1229 model-discovery usage preserved); getStoredSettings declaration NOT touched (line 1211 model-discovery call site preserved); Wave 1+2 files BYTE-FROZEN (zero diff in extension/offscreen/lattice-host.js, extension/background.js, extension/ai/{lattice-provider-bridge,agent-loop,universal-provider,tool-use-adapter}.js); INV-04 setTimeout count in agent-loop.js still = 8; smoke 61 PASS -> 71 PASS / 0 FAIL (+10 delta vs >=8 plan minimum); npm test exits 0 (full chain green).**

## Performance

- **Duration:** 12 min (Tasks 1 + 2 + 3 sequential + SUMMARY)
- **Started:** 2026-05-27T16:20:00Z
- **Completed:** 2026-05-27T16:32:00Z
- **Tasks:** 3 (Task 1 saveSettings trim, Task 2 checkApiConnection rewrite, Task 3 smoke Part 5 fill)
- **Files modified:** 2 (extension/ui/options.js + tests/lattice-provider-bridge-smoke.test.js)

## Accomplishments

- `extension/ui/options.js` saveSettings() (lines 977-1029 baseline) gains 9 new `.trim()` calls covering all 9 input-derived string fields uniformly: apiKey, geminiApiKey, openaiApiKey, anthropicApiKey, customApiKey, customEndpoint, openrouterApiKey, lmstudioBaseUrl, captchaApiKey. Each rewrite uses `(value || default).trim()` idiom. Old un-trimmed stored values auto-heal on next user save. Closes xai-key-rejected-400 P1 (missing trim) at the save site.
- `extension/ui/options.js` checkApiConnection() (lines 1077-1131 baseline; now lines 1077-1149 after rewrite) REPLACED in full. The new body reads provider + modelName + apiKey directly from input fields via per-provider getter map (PROVIDER_KEY_GETTERS covering all 7 Lattice providers: xai, gemini, openai, anthropic, custom, openrouter, lmstudio); computes config.baseUrl per-provider (custom -> input trimmed; lmstudio -> input trimmed + trailing-slash strip + '/v1'; openai -> hardcoded api.openai.com/v1; else -> undefined); delegates to `executeViaBridge(provider, config, {__testConnection:true}, {mode:'test-connection'})` inside a try/catch with response-time tracking; preserves the existing UX (No-API-Key card, success-status, failure-status with err.message). Closes xai-key-rejected-400 P2 (stale storage read) defect.
- `tests/lattice-provider-bridge-smoke.test.js` Part 5 Plan 06-04 placeholder REMOVED; replaced with 10 real assertions covering: saveSettings function found + .trim() count >= 9; checkApiConnection function found + 0 getStoredSettings calls + 0 new AIIntegration instantiations + exactly 1 executeViaBridge call + mode:'test-connection' literal + __testConnection:true marker + reads elements.apiKey?.value + .value...trim() pattern; getStoredSettings declaration preserved elsewhere in options.js. All 9 plan-required PASS lines printed to stdout. Brace-depth function-body extractor used for both function bodies (robust to line drifts).
- Smoke PASS count: 61 (Plan 06-03 baseline) -> 71 (delta +10, above the >= 8 plan minimum). FAIL count == 0.
- `npm test` exits 0 (full chain green; bridge smoke runs as final entry; agent-loop-empty-contents.test.js regression test unaffected by Plan 06-04 since the bridge swap was Plan 06-03's work).
- Wave 1+2 files BYTE-FROZEN: `git status --porcelain` empty for extension/offscreen/lattice-host.js + extension/background.js + extension/ai/{lattice-provider-bridge,agent-loop,universal-provider,tool-use-adapter}.js. INV-04 PRESERVED: `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8 (Phase 5 baseline; Plan 06-03 +16-line iterator drift documented; Plan 06-04 touches neither agent-loop.js nor its iterator block).
- xai-key-rejected-400 P1 + P2 defects CLOSED by side effect of the Phase 6 migration. Validation via smoke Part 5 grep assertions (Task 3 deliverable) confirms both fixes are in place statically; full functional verification deferred to the consolidated MV3 reload UAT-1 procedure at the end of Phase 7 per `.planning/v0.10.0-MILESTONE-AUDIT.md`.

## Task Commits

Each task was committed atomically with the `Ref: FSB v0.10.0-attempt-2 Phase 6 Plan 06-04` footer:

1. **Task 1: Add .trim() to all 9 input-derived string fields in saveSettings() (8 LLM-side + 1 CAPTCHA; lines 977-1029)** - `0cc21c6a` (feat)
2. **Task 2: Rewrite checkApiConnection() (lines 1077-1131) to read from input fields directly and delegate to executeViaBridge('test-connection' mode)** - `f9007731` (feat)
3. **Task 3: Fill the remaining Part 5 placeholder in tests/lattice-provider-bridge-smoke.test.js with options.js grep assertions** - `f2f0a27d` (test)

**Plan metadata:** (to be assigned to this SUMMARY's docs commit by the orchestrator)

## Files Created/Modified

- `extension/ui/options.js` (MODIFIED, +57 / -40 net across two surgical edits in saveSettings + checkApiConnection)
  - saveSettings (lines 977-1030): 9 lines reformatted to wrap `(value || default)` in parens + append `.trim()`. Diff is exactly 9 insertions / 9 deletions for this region. The chrome.storage.local.set() callback body (lines 1019-1029) BYTE-FROZEN (auto-checkApiConnection-on-apiKey-change hook at lines 1025-1028 preserved).
  - checkApiConnection (lines 1077-1131 baseline; now lines 1077-1149): function body REPLACED in full while preserving the `async function checkApiConnection()` signature. New body: 7-line Phase-6 explanation comment (without `executeViaBridge` / `getStoredSettings` identifier mentions to keep grep counts exact); 2-line dashboardState + updateConnectionStatus opening; outer try block reads provider + modelName from input fields; declares PROVIDER_KEY_GETTERS map (7 providers including openrouter + lmstudio); declares PROVIDER_NAMES display map; computes apiKey via getter map invocation; early-return No-API-Key UX guarded by `!apiKey && provider !== 'lmstudio'`; computes config (apiKey + model + baseUrl ternary chain per provider); inner try/catch around executeViaBridge call with response-time logging on both branches; outer catch handles unexpected errors. All other functions in options.js BYTE-FROZEN (verified via `git diff` excluding the two known regions).
- `tests/lattice-provider-bridge-smoke.test.js` (MODIFIED, +51 / -2 net) -- Part 5 Plan 06-04 placeholder PASS line replaced with: optionsSrc + optionsLines read; saveStart findIndex + brace-depth walker computes saveEnd; saveBody extracted as joined slice; saveTrimCount assertion (>= 9); checkStart findIndex + brace-depth walker computes checkEnd; checkBody extracted; 7 checkBody assertions covering all 9 plan-required PASS lines (function found + 0 getStoredSettings + 0 new AIIntegration + exactly 1 executeViaBridge + mode literal + __testConnection marker + elements.apiKey?.value read + .value...trim() pattern); getStoredSettings declaration preservation assertion via optionsSrc regex.

## P1 + P2 Defect Closure (xai-key-rejected-400)

The phase-6 migration closes both defects diagnosed in `.planning/debug/xai-key-rejected-400.md` as side effects.

### P1 (missing trim at save site) -- closed by Task 1
- **Root cause** (per debug doc): `extension/ui/options.js` saveSettings() (line 981 baseline) wrote `elements.apiKey?.value || ''` to chrome.storage.local WITHOUT `.trim()`. Any leading/trailing whitespace, newline, or zero-width character pasted from a clipboard manager (1Password, Bitwarden, browser fill, terminal copy) was persisted verbatim. xAI then received `Bearer xai-...<garbage>` and rejected with 400 `Incorrect API key provided: xa***cy`.
- **Fix scope**: 9 fields trimmed at the save site (8 LLM-side API key / endpoint URL + 1 CAPTCHA key). URLs included because URLs can carry credentials in some configurations.
- **Auto-heal**: legacy un-trimmed stored values are overwritten on next user save (no migration required; the next time the user clicks Save, the trimmed value replaces the stored value).
- **Verification**: Task 3 smoke assertion `PASS: saveSettings body has >= 9 .trim() calls (got 9 for all 9 input-derived string fields: 8 LLM-side + 1 CAPTCHA)`.

### P2 (stale storage read in test-connection path) -- closed by Task 2
- **Root cause** (per debug doc): checkApiConnection() (line 1082 baseline) called `await getStoredSettings()` which loads from chrome.storage.local -- NOT from the current value of `#apiKey`. If the user pastes a new key and clicks Test Connection BEFORE clicking Save, the test ran against the OLD stored key. The new key sat unsaved in the input field until Save.
- **Fix scope**: checkApiConnection rewritten to read directly from input fields via per-provider getter map (PROVIDER_KEY_GETTERS). The path no longer touches chrome.storage at all for the test-connection flow.
- **Defense-in-depth**: each getter trims input values inline (`.trim()` inside the getter), so P1 is closed twice (once at save, once at test).
- **Verification**: Task 3 smoke assertions `PASS: checkApiConnection body does NOT call getStoredSettings (P2 stale-storage closed)` + `PASS: checkApiConnection reads xai apiKey from input field (not chrome.storage)` + `PASS: checkApiConnection trims input values (defense-in-depth + P1 closure)`.

### Functional verification (deferred to UAT-1 at end of Phase 7)
Static-text grep coverage by smoke Part 5 confirms both fixes are present in the codebase. Full runtime verification (paste key with trailing whitespace -> Save -> Test -> 200 OK) is deferred to the consolidated UAT-1 procedure documented at `.planning/v0.10.0-MILESTONE-AUDIT.md`. UAT-1 validates Phase 1 + 5 + 6 + 7 in one MV3 reload session per user directive.

## AIIntegration Class Preservation Rationale

- `class AIIntegration` is NOT declared in `extension/ui/options.js` (`grep -c 'class AIIntegration' extension/ui/options.js` returns 0). It is declared in `extension/ai/ai-integration.js` and imported into the SW via `extension/background.js` importScripts. Options.js receives the class via the same SW context (options.js is loaded in the extension's options page, which has access to the same global scope as the SW for the imported classes).
- Plan 06-04 removed the `new AIIntegration(settings)` USAGE at line 1110 (inside checkApiConnection). The OTHER usage at line 1229 (inside the model-discovery flow) stays untouched -- it is out of scope for Phase 6 per the CONTEXT.md scope-lock ("AIIntegration class stays on disk -- used by background.js (non-Phase-6 paths)").
- Phase 7 may archive AIIntegration entirely once all call sites (including the model-discovery flow at line 1229 and any background.js usages) migrate to the bridge or to a successor pattern.
- Smoke assertion confirms: `PASS: checkApiConnection body does NOT instantiate AIIntegration (expected: 0, got: 0)` -- the specific call site inside checkApiConnection is removed; the class declaration + other call sites unchanged.

## getStoredSettings Preservation Rationale

- `getStoredSettings()` is declared at line 1463 of options.js (`function getStoredSettings()` -- async). It is called from at least two sites: previously inside checkApiConnection (line 1082, removed by Plan 06-04) and inside the model-discovery flow (line 1211, preserved).
- CONTEXT.md scope-lock confirms: "getStoredSettings stays BYTE-FROZEN -- used elsewhere by load flows."
- Plan 06-04 removed only the checkApiConnection call site. The declaration is untouched. The other call site is untouched.
- Smoke assertion confirms: `PASS: getStoredSettings declaration preserved (used by other call sites; not removed by Phase 6)` AND `PASS: checkApiConnection body does NOT call getStoredSettings (P2 stale-storage closed)`.
- Final `grep -c "getStoredSettings" extension/ui/options.js` returns 2 (line 1211 call site + line 1463 declaration). The baseline was 3 (added the line 1082 checkApiConnection call removed by Plan 06-04). Delta = -1, exactly as planned.

## Wave 1 + Wave 2 BYTE-FROZEN Confirmation

```
$ git status --porcelain \
    extension/offscreen/lattice-host.js \
    extension/background.js \
    extension/ai/lattice-provider-bridge.js \
    extension/ai/agent-loop.js \
    extension/ai/universal-provider.js \
    extension/ai/tool-use-adapter.js
                        (empty -- all 6 files BYTE-FROZEN under Plan 06-04)
```

Plans 06-01/02/03 ship the offscreen handler + SW startup wiring + bridge shim + agent-loop call-site swap. Plan 06-04 is options.js-only by design (CONTEXT.md scope-lock). The byte-freeze across all 6 files is the structural invariant Plan 06-04 must preserve.

## INV-04 BYTE-FROZEN Confirmation

```
$ grep -c "setTimeout" extension/ai/agent-loop.js
8                       (Phase 5 baseline; PRESERVED under Plan 06-04 since agent-loop.js is BYTE-FROZEN in this plan)

$ grep -cE "session\._nextIterationTimer\s*=\s*setTimeout" extension/ai/agent-loop.js
4                       (4 chained iterators; INV-04 PATTERN preserved)
```

INV-04 invariant (count = 8 + 4 single-line iterator blocks calling runAgentIteration(sessionId, options)) PRESERVED. The +16-line iterator-position drift documented in Plan 06-03 SUMMARY remains; Plan 06-04 does not touch agent-loop.js so positions stay at the Plan 06-03 post-shift state (1857/2455/2524/2534).

## Smoke PASS Count Delta from Plan 06-03 Baseline

| Part                                              | Plan 06-03 (baseline)                                                  | After Plan 06-04                                                                                | Delta |
|---------------------------------------------------|------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|-------|
| Part 1 (surface presence)                         | 11                                                                     | 11                                                                                              | 0     |
| Part 2 (per-provider round-trip)                  | 14                                                                     | 14                                                                                              | 0     |
| Part 3 (error envelope shape)                     | 8                                                                      | 8                                                                                               | 0     |
| Part 4 (AbortController)                          | 2                                                                      | 2                                                                                               | 0     |
| Part 5 (flag/trim/options/wiring)                 | 25 (14 Plan-06-02 + 10 Plan-06-03 + 1 retained Plan-06-04 placeholder) | 35 (14 Plan-06-02 + 10 Plan-06-03 + 11 Plan-06-04: 9 plan-required + 2 brace-walker function-found probes; placeholder REMOVED) | +10   |
| Part 6 (INV byte-freeze)                          | 1 (Wave 0 placeholder)                                                 | 1 (unchanged; Plan 06-05 fills)                                                                 | 0     |
| **Total**                                         | **61**                                                                 | **71**                                                                                          | **+10** |

The 10 new Part 5 PASSes break down as:
1. saveSettings function found (brace-walker probe)
2. saveSettings body has >= 9 .trim() calls
3. checkApiConnection function found (brace-walker probe)
4. checkApiConnection body does NOT call getStoredSettings (P2 stale-storage closed)
5. checkApiConnection body does NOT instantiate AIIntegration
6. checkApiConnection body calls executeViaBridge exactly once
7. checkApiConnection passes {mode: 'test-connection'}
8. checkApiConnection passes {__testConnection: true} as requestBody marker
9. checkApiConnection reads xai apiKey from input field (not chrome.storage)
10. checkApiConnection trims input values (defense-in-depth + P1 closure)

Plus 1 reused PASS (getStoredSettings declaration preserved) consolidated into the same block. Total Part 5 delta = +10 vs baseline (above the >= 8 plan minimum and above the > 61 baseline threshold mentioned in the prompt's success criteria).

## Decisions Made

- **Defense-in-depth trim at save site (Task 1).** All 9 input-derived string fields trimmed uniformly using `(value || default).trim()` idiom. Closes P1 at the save site even though Phase 6 bridges no longer read from storage for test-connection -- the agent-loop path still reads from chrome.storage via providerInstance.settings, so the save-site trim provides defense-in-depth across both flows. URLs (customEndpoint + lmstudioBaseUrl) trimmed too because URLs can carry credentials in some configurations.
- **Per-provider getter map for current-input-value reads (Task 2).** Inline declaration of PROVIDER_KEY_GETTERS map covering all 7 Lattice providers (xai, gemini, openai, anthropic, custom, openrouter, lmstudio). Each getter returns the trimmed current input value via closure. The legacy apiKeyMap omitted openrouter + lmstudio -- the new map covers them. lmstudio's getter returns '' (no key required); the `!apiKey && provider !== 'lmstudio'` guard preserves the No-API-Key UX for the 6 key-required providers while letting lmstudio through to the bridge call.
- **Comment block discipline for plan-text grep exactness (Task 2 refinement).** Initial comment block in the rewritten checkApiConnection mentioned `executeViaBridge` and `getStoredSettings` explicitly. Plan 06-04 acceptance criteria require `grep -c "executeViaBridge" extension/ui/options.js` returns 1 -- the initial comment made it 2. Refactored the comment to drop identifier mentions while retaining the Phase 6 rationale. Trade-off: lose some inline documentation richness, gain test-determinism.
- **Brace-depth function-body extractor in smoke Part 5 (Task 3).** Per the plan's prescribed test code, walk braces character-by-character from the function signature line tracking depth. The outer `}` (depth returns to 0) is the function-body close. More robust than line-range slicing (`slice(977, 1030)`) because absolute line numbers shift across plans -- e.g., checkApiConnection's end shifted from 1131 to 1149 under Plan 06-04's 19-line growth.
- **AIIntegration class declaration preservation.** Class is declared in `extension/ai/ai-integration.js` and imported via background.js importScripts (NOT defined in options.js). Plan 06-04 removed only the `new AIIntegration(settings)` USAGE at line 1110 inside checkApiConnection. The other usage at line 1229 (model-discovery flow) stays untouched per CONTEXT.md scope-lock. Phase 7 may revisit.
- **getStoredSettings declaration preservation.** Declaration at line 1463 + other call site at line 1211 (model-discovery flow) preserved per CONTEXT.md scope-lock. Plan 06-04 removed only the line 1082 call site inside checkApiConnection. Final grep count = 2 (call site + declaration), delta = -1 from baseline of 3.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Initial comment block in rewritten checkApiConnection mentioned `executeViaBridge` and `getStoredSettings` identifiers, breaking plan-text grep counts**

- **Found during:** Task 2 verification (`grep -c "executeViaBridge" extension/ui/options.js` returned 2 instead of the plan-required 1).
- **Issue:** My initial 7-line Phase-6 explanation comment above the rewritten function body included literal mentions of `executeViaBridge` and `getStoredSettings`. The plan acceptance criterion specifies `grep -c "executeViaBridge" extension/ui/options.js returns 1 (the new invocation in checkApiConnection)`. Comment-level mentions inflated the count to 2, which would have failed the plan-text acceptance check (and the smoke assertion at Part 5 was line-anchored to the function body via brace walker, so it would have passed -- but the literal `grep -c` of the whole file would have failed).
- **Fix:** Refactored the comment to drop identifier mentions while retaining the Phase 6 rationale. New comment text: "rewritten to read from input fields directly (NOT from chrome.storage) and delegate to the Plan 06-03 bridge shim in test-connection mode. Closes the xai-key-rejected-400 P2 defect..." -- explains the change without naming the bridge function or the removed storage call by their exact identifiers.
- **Files modified:** `extension/ui/options.js` (comment block in checkApiConnection refactored).
- **Verification:** `grep -c "executeViaBridge" extension/ui/options.js` returns 1; `grep -c "getStoredSettings" extension/ui/options.js` returns 2 (other call site + declaration). Both match plan acceptance criteria exactly.
- **Commit:** `f9007731` (Task 2 commit; includes the comment refactor before commit creation).

---

**Total deviations:** 1 documented (1 auto-fix for plan-text grep determinism)
**Impact on plan:** Single inline comment-text refactor. Zero scope creep; zero production-code logic change; smoke fully green; all plan acceptance criteria met.

## Issues Encountered

None beyond the single Rule 1 deviation above. All caught during Task 2 verification; fixed inline before the Task 2 commit; documented above.

## User Setup Required

None - no external service configuration required. Plan 06-04 ships the options.js trim defense + checkApiConnection bridge delegation + smoke Part 5 fill. The bridge shim (Plan 06-03) and the offscreen handler (Plan 06-01) and the SW startup wiring (Plan 06-02) are already loaded into the SW from the importScripts slot at line 12 of background.js. Options.js consumes them via the SW-shared global `executeViaBridge` at the test-connection call site.

No MV3 reload needed for this plan's deliverables; verification is entirely via the smoke harness + grep + parse-only check. The full reload UAT-1 happens at the end of Phase 7 per `.planning/v0.10.0-MILESTONE-AUDIT.md`.

## Wave 4 -> Wave 5 Handoff

**Plan 06-05 (INV byte-freeze regression smoke) may now begin.** With Plan 06-04 complete:
- FINT-08 c (saveSettings trim defense) + d (checkApiConnection bridge delegation) both shipped; FINT-08 fully closed.
- The xai-key-rejected-400 P1 + P2 defects closed by side effect (static verification in smoke Part 5; functional verification deferred to Phase 7 UAT-1).
- All Wave 1 + Wave 2 + Wave 3 files BYTE-FROZEN (zero diff in extension/offscreen/lattice-host.js, extension/background.js, extension/ai/{lattice-provider-bridge,agent-loop,universal-provider,tool-use-adapter}.js).
- INV-04 setTimeout count in agent-loop.js still = 8.
- Smoke 71 PASS / 0 FAIL; npm test exits 0.

**Plan 06-05 deliverable scope:**
1. Fill Part 6 of the smoke (INV byte-freeze regression assertions):
   - (a) INV-04: `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8 (Phase 5 baseline; 4 chained iterator blocks).
   - (b) INV-01/02: `node tests/tool-definitions-parity.test.js` exits 0 with 142/142 PASS (chain-into-this-smoke OR cross-reference).
   - (c) INV-05: `extension/_archive/` does not exist or is empty (Phase 6 does NOT archive universal-provider.js; Phase 7 does).
   - (d) INV-06: `cd lattice && git rev-parse fsb-integration-experiments` matches `.planning/LATTICE-PIN.md` frontmatter SHA (no drift).
2. Expected delta: +4 to +6 PASSes (target total 75-77 / 0 FAIL).

**Subsequent plan:**
- Plan 06-06 (Phase ceremony: LATTICE-PIN bump + REQUIREMENTS.md FINT-07/08 flip + audit closure).

No blockers. Plan 06-04 deliverable is downstream-unblocking; Plan 06-05 may begin once spawned by the orchestrator.

## Self-Check: PASSED

- File exists: `extension/ui/options.js` (FOUND, modified -- Task 1 + Task 2).
- File exists: `tests/lattice-provider-bridge-smoke.test.js` (FOUND, modified -- Task 3).
- File exists: `.planning/phases/06-fsb-engine-consumes-lattice-provider-abstraction/06-04-SUMMARY.md` (FOUND, this file).
- Commit `0cc21c6a` exists in `git log` (FOUND, Task 1 commit).
- Commit `f9007731` exists in `git log` (FOUND, Task 2 commit).
- Commit `f2f0a27d` exists in `git log` (FOUND, Task 3 commit).
- `node tests/lattice-provider-bridge-smoke.test.js` exits 0 (71 PASS / 0 FAIL).
- `npm test` exits 0 (full chain green; bridge smoke runs as the final entry).
- `grep -c "executeViaBridge" extension/ui/options.js` returns 1 (the new invocation in checkApiConnection; the comment refactor dropped the literal mention).
- `grep -c "new AIIntegration" extension/ui/options.js` returns 1 (line 1229 model-discovery flow usage preserved; the line 1110 checkApiConnection usage removed by Task 2).
- `grep -c "getStoredSettings" extension/ui/options.js` returns 2 (line 1211 model-discovery call site + line 1463 declaration; the line 1082 checkApiConnection call removed by Task 2).
- `grep -c "PROVIDER_KEY_GETTERS" extension/ui/options.js` returns 2 (declaration + invocation).
- `grep -c "mode: 'test-connection'" extension/ui/options.js` returns 1 (the new bridge call).
- `grep -c "__testConnection: true" extension/ui/options.js` returns 1 (the new bridge call requestBody marker).
- `grep -c "async function checkApiConnection" extension/ui/options.js` returns 1 (function signature unchanged).
- `grep -c "elements.apiKey?.value" extension/ui/options.js` returns 2 (saveSettings reads + checkApiConnection PROVIDER_KEY_GETTERS.xai reads via the getter map).
- `grep -c "elements.modelProvider?.value" extension/ui/options.js` returns 4 (saveSettings + checkApiConnection + 2 other call sites including loadSettings flow).
- saveSettings region trim count: `node -e "const s = require('fs').readFileSync('extension/ui/options.js', 'utf8').split('\n').slice(976, 1030).join('\n'); console.log((s.match(/\.trim\(\)/g)||[]).length)"` returns 9 (all 9 input-derived string fields covered: 8 LLM-side + 1 CAPTCHA).
- File parses cleanly under Node: `node -e "require('vm').compileFunction(require('fs').readFileSync('extension/ui/options.js', 'utf8'), [])"` exits 0.
- Wave 1+2 byte-freeze: `git status --porcelain extension/offscreen/lattice-host.js extension/background.js extension/ai/lattice-provider-bridge.js extension/ai/agent-loop.js extension/ai/universal-provider.js extension/ai/tool-use-adapter.js` returns empty.
- INV-04 byte-freeze: `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8 (Phase 5 baseline; unchanged under Plan 06-04 which does not touch agent-loop.js).

---
*Phase: 06-fsb-engine-consumes-lattice-provider-abstraction*
*Completed: 2026-05-27*
