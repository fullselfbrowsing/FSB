# Phase 7: Archive FSB custom provider stack - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning
**Mode:** Smart discuss (scope locked by ROADMAP + investigation-driven Strategy B amendment for physical archive blocker)

<domain>
## Phase Boundary

Finalize the v0.10.0 Lattice-bridge migration by removing the legacy fallback path: strip the `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` feature flag so the bridge becomes unconditional, delete the fallback branch in `extension/ai/agent-loop.js callProviderWithTools`, strengthen the INV-03 wording in REQUIREMENTS.md to reflect that FSB now consumes Lattice provider adapters exclusively (via the offscreen bridge), populate FINT-09 + close FINT-KK..L in the traceability table, bump LATTICE-PIN.md with a Phase 7 row, flip v0.10.0-MILESTONE-AUDIT.md UAT-1 to executed, and run the consolidated UAT-1 single Chrome MV3 reload session (sub-assertions cover Phases 1+5+6+7) as the milestone-end gate.

Physical archive of `extension/ai/universal-provider.js` to `extension/_archive/` is **deferred to v0.11.0+** per Strategy B grey-area resolution (see Decisions). The runtime still requires the `UniversalProvider` class for the `providerInstance` metadata object at `agent-loop.js:1182` (constructs the object that holds `getEndpoint()`, `config`, `settings`) plus the 4 wrapper classes in `extension/ai/ai-providers.js` (AIProvider, XAIProvider, GeminiProvider, createAIProvider factory) plus the `<script src>` load in `extension/ui/control_panel.html:1486`. Lattice's adapter contract has no equivalent `getEndpoint()` shape; the migration to a Lattice-native providerInstance is a v0.11.0+ scope item.

In scope: feature flag removal (3 files: agent-loop.js + lattice-provider-bridge.js + smoke), INV-03 wording strengthening (REQUIREMENTS.md), FINT-09 + FINT-KK..L finalization (REQUIREMENTS.md), LATTICE-PIN.md Phase 7 row, v0.10.0-MILESTONE-AUDIT.md UAT-1 status flip, UAT-1 procedure generation into 07-VERIFICATION.md, UAT-1 execution capture (user runs in Chrome, reports results).

Out of scope: physical archive move (Strategy B defers to v0.11.0+), Lattice-native providerInstance migration (v0.11.0+), ai-providers.js wrapper cleanup (v0.11.0+ — wrappers are unused but harmless), control_panel.html script tag pruning (v0.11.0+), background.js classic-to-module migration (INV-04 carryforward), Lattice-side commits (INV-06).

</domain>

<decisions>
## Implementation Decisions

### Archive strategy: Strategy B (Q1 — locked post-investigation)
- **Strip the flag, keep the file in place.** Bridge becomes unconditional in `extension/ai/agent-loop.js callProviderWithTools` (line 1056 wrapper deleted; bridge call at line 1057-1066 becomes the only path; fallback `return providerInstance.sendRequest(requestBody)` at line 1067 deleted).
- Strip the flag from `extension/ai/lattice-provider-bridge.js` JSDoc (lines 17 + 167) and the bridge boot log.
- Strip the flag from `tests/lattice-provider-bridge-smoke.test.js` (4 references in Part 3 + 5 around lines 575-581 — the `alLinesWithFlag.length === 1` assertion and the `2 token occurrences` assertion both go to 0).
- `extension/ai/universal-provider.js` **stays at its current path**. Justification: `agent-loop.js:1182` still does `new UniversalProvider(...)` for the providerInstance metadata object that supplies `getEndpoint()` (line 1211 logging) + `config` + `settings` (lines 1057-1058 used inside the bridge branch). `extension/ai/ai-providers.js` exports 4 wrapper classes (AIProvider, XAIProvider, GeminiProvider) that extend UniversalProvider — these are backward-compat shims, currently unused by Phase 6's bridge path, but moving them is a separate cleanup. `extension/ui/control_panel.html:1486` has a `<script src="../ai/universal-provider.js">` load — popup uses the global; moving would break popup boot.
- Physical archive move + Lattice-native providerInstance migration is **deferred to v0.11.0+** as a clean carryforward (documented in 07-VERIFICATION.md + REQUIREMENTS.md + PROJECT.md). This trades the "visible archive directory" signal for runtime safety; semantic archive (flag removed + INV-03 wording + bridge unconditional) is preserved.

### UAT-1 execution mode: User runs + reports (Q2 — locked)
- Phase 7 generates a step-by-step UAT-1 procedure into `.planning/phases/07-archive-fsb-custom-provider-stack/07-VERIFICATION.md` (6 sub-assertions per v0.10.0-MILESTONE-AUDIT.md UAT-1: SW clean reload, no new Lattice import errors, popup opens, sidepanel opens, one autopilot iteration completes, offscreen page loads with lattice-host.js boot log clean).
- User runs the steps in Chrome (Load unpacked at `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/`, paste fresh xAI API key, click Test Connection, start one autopilot session, observe boot logs in DevTools).
- User reports results back; verification report updated with status passed/failed + evidence.
- Matches the `human_needed` pattern from Phase 6 verification — but this time the UAT-1 is the explicit milestone-end gate, not a deferred carryforward.

### INV-03 wording (locked by ROADMAP scope + commit c17e262a draft)
- Replace REQUIREMENTS.md INV-03 wording from "Every improvement works equally across all 7 universal-provider.js targets" to: "Through Phase 5: every improvement worked equally across all 7 `extension/ai/universal-provider.js` targets... From Phase 6 onward: FSB consumes Lattice's 7 provider adapters exclusively for the runtime path via the offscreen Lattice host bus... From Phase 7 end onward: feature flag removed; bridge unconditional. Physical archive of `extension/ai/universal-provider.js` to `extension/_archive/` deferred to v0.11.0+ pending Lattice-native providerInstance metadata migration (see Phase 7 CONTEXT.md Strategy B)."

### Traceability updates (locked by ROADMAP scope)
- REQUIREMENTS.md FINT-09 (archive + flag removal): status "Pending (Phase 07)" → "Complete (Phase 07 — flag removal complete; physical archive deferred to v0.11.0+)"
- FINT-KK..L: stays [x] PROMOTED (already done in commit c17e262a); no change.
- LATTICE-PIN.md: append Phase 7 row with FSB-side commits; Lattice SHA unchanged at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (Phase 7 is FSB-side only per INV-06).

### v0.10.0-MILESTONE-AUDIT.md update (locked by ROADMAP scope)
- UAT-1 status: pending → executed (after user reports green) or pending_with_evidence (after Phase 7 generates the procedure but user has not yet reported).
- Milestone status: in_progress → passed (only after UAT-1 user-confirmed green).

### Test updates (Claude's Discretion)
- `tests/lattice-provider-bridge-smoke.test.js` Part 3 + 5 assertions about the flag pattern need updating (flag is gone, so `alLinesWithFlag.length === 1` becomes `=== 0`; `2 token occurrences` becomes `=== 0`). Planner picks exact assertion wording.
- INV-04 content-based discovery assertions in Part 6 stay as-is (iterator lines will shift again because the flag wrapper deletion removes ~5 lines from agent-loop.js around line 1056).
- Smoke must stay green; PASS count delta will be small (likely -2 to +0).

</decisions>

<code_context>
## Existing Code Insights

### Flag references discovered
- `extension/ai/agent-loop.js:1056` — `if (typeof FSB_LATTICE_PROVIDER_BRIDGE_ENABLED === 'undefined' || FSB_LATTICE_PROVIDER_BRIDGE_ENABLED) { ... bridge ... } return providerInstance.sendRequest(requestBody);` — strip the `if` wrapper, delete the trailing `return providerInstance.sendRequest(requestBody);` fallback, hoist the bridge body to be the function's tail.
- `extension/ai/lattice-provider-bridge.js:17,167` — JSDoc + boot-log mention of the flag. Strip both.
- `tests/lattice-provider-bridge-smoke.test.js:575-581` — Part 3 + 5 assertions about flag line count + token count. Update to 0.
- **NOT in `extension/ui/options.js`** — checkApiConnection delegates to bridge directly without consulting the flag; nothing to strip in options.js.

### universal-provider.js importers (stays in place per Strategy B)
- `extension/ai/agent-loop.js:29` — `importScripts('ai/universal-provider.js')` SW loader (keeps; needed for line 1182)
- `extension/ai/agent-loop.js:58` — `require('./universal-provider.js')` Node fallback (keeps; needed for line 1182)
- `extension/ai/agent-loop.js:102` — `var _UniversalProvider = ...` (keeps)
- `extension/ai/agent-loop.js:1182` — `new (_UniversalProvider)({...})` providerInstance constructor (keeps; metadata object)
- `extension/ai/agent-loop.js:1211` — `providerInstance.getEndpoint()` logging (keeps; metadata)
- `extension/ai/agent-loop.js:1057-1058` — `providerInstance.config` + `providerInstance.settings` inside the (now-unconditional) bridge branch (keeps; metadata read)
- `extension/ai/ai-providers.js` — 4 wrapper classes + factory (keeps; unused but harmless; v0.11.0+ cleanup)
- `extension/ui/control_panel.html:1486` — `<script src>` popup load (keeps; v0.11.0+ cleanup)
- `extension/offscreen/lattice-host.js:168,183,211` — JSDoc reference comments (keeps; documentation)

### Prior wave outputs (Phase 6 SUMMARYs)
- 06-00 through 06-06 SUMMARY files document the bridge wiring: offscreen handler + SW startup + bridge shim + agent-loop swap + options.js rewrite + 85-PASS smoke + INV regression + ceremony.
- `tests/lattice-provider-bridge-smoke.test.js` 85 PASS / 0 FAIL baseline. Phase 7 updates 3-4 Part-3 + Part-5 assertions; expect final 83-85 PASS / 0 FAIL.

### Documentation patterns (Phase 5 + 6 LATTICE-PIN entries)
- LATTICE-PIN.md uses one row per phase with: phase number, FSB-side commits SHAs, Lattice-side commits SHAs (0 for Phase 7), Lattice HEAD SHA (unchanged for Phase 7), audit notes.

</code_context>

<specifics>
## Specific Ideas

- UAT-1 procedure (per v0.10.0-MILESTONE-AUDIT.md UAT-1 sub-assertions):
  1. Load unpacked extension at `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/`
  2. Open chrome://extensions DevTools background page console; verify no error logs, verify "[FSB lattice-host]" boot log appears in offscreen page console (open chrome://extensions → extension's offscreen page)
  3. Open extension popup; verify renders without errors
  4. Open sidepanel; verify renders without errors
  5. Paste fresh xAI API key in settings (Provider: xAI, Model: grok-4-1-fast); click Test Connection; verify success response
  6. Start one autopilot session on a simple page; verify >= 1 iteration step completes
- The UAT-1 procedure goes into `07-VERIFICATION.md` as the `human_verification` section, NOT as a separate UAT.md file (since this IS the milestone UAT, not a deferred carryforward).

</specifics>

<deferred>
## Deferred Ideas (v0.11.0+)

- Physical archive move: `extension/ai/universal-provider.js` → `extension/_archive/universal-provider.js`. Requires Lattice-native providerInstance migration (substitute for `new UniversalProvider(config)` at agent-loop.js:1182 that exposes `getEndpoint()` shape).
- `extension/ai/ai-providers.js` wrapper cleanup: 4 unused wrapper classes + factory. Probably ai-providers.js gets deleted entirely once Lattice-native providerInstance lands.
- `extension/ui/control_panel.html:1486` script tag pruning: popup currently loads universal-provider.js as a global script. Audit popup usage; remove tag if no popup code uses the global.
- Mainline PR back into Lattice repo (any v0.10.0 Lattice-side additions).
- Background.js classic-to-module migration (INV-04 carryforward).

</deferred>
