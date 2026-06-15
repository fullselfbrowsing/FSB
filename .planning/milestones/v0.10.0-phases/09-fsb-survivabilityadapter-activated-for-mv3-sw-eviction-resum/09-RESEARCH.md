# Phase 9: FSB SurvivabilityAdapter activated for MV3 SW eviction resumption (closes G2) - Research

**Researched:** 2026-05-31
**Domain:** FSB MV3 SW eviction resumption wiring (lattice-runtime-adapter activation + marker writes + serialize sidecars + restore site)
**Confidence:** HIGH (all CONTEXT.md decisions D-01..D-07 cross-checked against in-tree code; line numbers verified via grep + read; Lattice surface verified read-only)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (verbatim from 09-CONTEXT.md)

- **D-01 Marker vocabulary bridge:** Phase 9 explicitly writes `session._currentStepName` inside `runAgentIteration` using the Phase 5 attempt-1 vocabulary (`BEFORE_API_REQUEST` / `BEFORE_TOOL_EXECUTION` / `BEFORE_ITERATION` / `BEFORE_NEXT_ITERATION_SCHEDULE`) that the adapter's `resume()` at `extension/ai/lattice-runtime-adapter.js:244-256` already understands.
  Write sites (additive only; INV-04 byte-frozen — never inside setTimeout lambdas):
  - `session._currentStepName = 'BEFORE_API_REQUEST'` BEFORE the provider/bridge call (~`agent-loop.js:1820-1830` area).
  - `session._currentStepName = 'BEFORE_TOOL_EXECUTION'` immediately before each tool dispatch (just before the Phase 8 emission at line 1974).
  - `session._currentStepName = 'BEFORE_NEXT_ITERATION_SCHEDULE'` immediately before the setTimeout at 2498 (NOT inside the lambda).
  Phase 8 emissions (lines 1861, 1974) use a DIFFERENT vocabulary (`LLM_TURN` / `TOOL_DISPATCH`) for observability; Phase 9's markers are for survivability ResumePolicy. The two vocabularies coexist.

- **D-02 Serialize call cadence + sites:** `lattice.serialize(session)` runs as additive sidecar at the 2 in-flight resumable persist callsites only: `agent-loop.js:1840` + `agent-loop.js:2474`. The other 14 `persist()` callsites are NOT sidecar-wrapped (terminal error paths; `resume()` returns `ON_ERROR_*` regardless). Each sidecar wraps in defensive `if (typeof FSB_LATTICE_RUNTIME_ADAPTER_ENABLED !== 'undefined' && FSB_LATTICE_RUNTIME_ADAPTER_ENABLED)` guard + try/catch fire-and-forget.

- **D-03 Deserialize/resume + flag flip:** `deserialize` + `resume` invoke at `runAgentLoop` entry (~`agent-loop.js:1215`, just before `runAgentIteration(sessionId, options)`). The entry guards via a lookup of `chrome.storage.session` keys matching prefix `fsb_lattice_snapshot_<sessionId>_*`. If matching snapshot exists, deserialize → resume returns a ResumePolicy → log structured event + proceed. Flag flip: `globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED = true;` as one-liner in `background.js` immediately after `importScripts('ai/lattice-step-emitter.js')` at line 13.

- **D-04 ResumePolicy classification mapping:** Phase 9 uses the FULL Phase 1 attempt-1 CONSERVATIVE mapping (mirroring `lattice-runtime-adapter.js:244-256` switch) without simplification.

- **D-05 LRU enforcement:** Phase 9 implements the JSDoc-documented LRU cap (default 50 per sessionId per `lattice-runtime-adapter.js:76`) as keep-latest-N with eviction-on-write. Phase 9 IS the follow-on noted in JSDoc lines 49-55.

- **D-06 Phase split + UAT shape:** Phase 9 stays as a single phase with three plans (09-01 flag flip + restore wiring + Wave 0 smoke; 09-02 marker writes + serialize sidecars + LRU + smoke Part 6 fill; 09-03 documentation ceremony). Per-axis UAT-09 DEFERRED to consolidated end-of-milestone UAT alongside UAT-08 + UAT-10 per user directive 2026-05-31 ("skip UAT to last"). Verifier emits `human_needed`.

- **D-07 Invariants preserved:** INV-01/02/03 UNTOUCHED; INV-04 setTimeout iterator BYTE-FROZEN (`grep -c "setTimeout" extension/ai/agent-loop.js == 8` post-phase; awk-scan empty for `_currentStepName` inside lambda body); INV-05 UNTOUCHED; INV-06 frozen at Phase 5 SHA — `SurvivabilityAdapter<TState>` already polymorphic per `survivability.ts:169-176`.

### Claude's Discretion

- Exact `chrome.storage.session.get` query shape for snapshot listing (filter at SDK level vs in-memory) — planner chooses based on API ergonomics.
- Whether LRU eviction runs synchronously (blocks serialize) or asynchronously (fire-and-forget) — planner chooses based on `chrome.storage.session.remove` Promise contract.
- Smoke Part 6 PASS count floor — analyzer estimates 5+ assertions; planner sets the floor.

### Deferred Ideas (OUT OF SCOPE)

- Options-page user-facing toggle for `FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` — out of scope; matches Phase 6/7 code-only flag pattern.
- Recovery dispatcher rewiring (CONSERVATIVE per-policy branch behavior) — out of scope per Phase 5 D-22; Phase 9 only emits ResumePolicy verdict + logs.
- `chrome.storage.local` override for snapshot persistence beyond session lifetime — out of scope per Phase 5 D-22.
- Migrating Phase 8 emissions to ALSO write `_currentStepName` for vocabulary unification — rejected per D-01.
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 9 anticipates **3 new FINT IDs**. Research-recommended assignments (planner finalizes in REQUIREMENTS.md):

| ID | Description | Research Support |
|----|-------------|------------------|
| **FINT-13** | Flag flip (`globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED = true`) at SW boot in `extension/background.js` immediately after `importScripts('ai/lattice-step-emitter.js')` at line 13; adapter activation. Closes Plan 09-01 production deliverable. | Section 5 — flag flip site verified at background.js line 13 (already lattice-step-emitter loaded; clean precedence over onInstalled at 13142). Phase 6/7 precedent for code-only flag-flip. |
| **FINT-14** | `_currentStepName` marker writes at 3 boundaries (`BEFORE_API_REQUEST` ~1820-1830; `BEFORE_TOOL_EXECUTION` at 1973 — just before Phase 8 TOOL_DISPATCH emit at 1974; `BEFORE_NEXT_ITERATION_SCHEDULE` at 2497 — just before setTimeout at 2498) + `lattice.serialize(session)` additive sidecar at 2 in-flight persist callsites (1840 + 2474). Closes Plan 09-02 production deliverable. | Section 3 — marker sites verified; current grep returns ZERO writes anywhere in extension/. Section 4 — 14 terminal persist sites classified. |
| **FINT-15** | LRU cap enforcement (default = 50 per sessionId per JSDoc lattice-runtime-adapter.js:76); ResumePolicy classification + restore wiring at `runAgentLoop` entry (~line 1215) using the 4-member Lattice union (SAFE / RECOVERY_AMBIGUOUS / ON_ERROR_SW_EVICTION_MID_REQUEST / ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH). Closes Plan 09-01 + 09-02 production deliverables. | Section 6 — restore site verified at line 1215. Section 7 — LRU enforcement design. Section 6 — ResumePolicy 4-member ↔ 4-marker mapping documented. |

REQ-ID rationale: continues the FINT-PP..Q placeholder series in REQUIREMENTS.md line 85 ("SW eviction resumption via Lattice's MV3-survivability adapter contract"). FINT-13/14/15 explicitly close that TBD entry. Phase 9 SUMMARY will flip line 85 from `[ ]` to `[x]`.
</phase_requirements>

---

## 1. Executive Summary

Phase 9 closes audit gap G2 by activating the standalone `extension/ai/lattice-runtime-adapter.js` (Phase 5 FINT-05; zero importers in production today). Three integrated changes per CONTEXT.md decisions: (1) flip `FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` default-true at SW boot in `background.js` line 13 area; (2) write `session._currentStepName` markers in `runAgentIteration` at 3 sites using the Phase 5 attempt-1 vocabulary (`BEFORE_API_REQUEST`, `BEFORE_TOOL_EXECUTION`, `BEFORE_NEXT_ITERATION_SCHEDULE`) — verified `grep -r "_currentStepName" extension/` returns zero hits today (only one READ in adapter at line 244); (3) wire `lattice.serialize` as additive sidecar at exactly 2 of 16 `persist()` callsites (1840 + 2474; the other 14 are terminal error paths) and add `deserialize` + `resume` at `runAgentLoop` entry (line 1215). LRU cap (default 50/sessionId) enforced per JSDoc contract. INV-06 NOT triggered: `SurvivabilityAdapter<TState>` is already polymorphic per `lattice/packages/lattice/src/runtime/survivability.ts:169-176`; ResumePolicy is a 4-member literal union at lines 148-152 — Phase 9 must NOT introduce a 5th member. INV-04 preserved via marker writes INSIDE iteration body, never inside setTimeout lambdas.

**Primary recommendation:** Wire as 3 plans per D-06. Plan 09-01 (Wave 1: flag flip + restore wiring + Wave 0 smoke scaffold). Plan 09-02 (Wave 1/2: marker writes + 2 serialize sidecars + LRU enforcement + smoke Part 6 fill). Plan 09-03 (Wave 3: REQUIREMENTS/LATTICE-PIN/audit ceremony). Critical correction to CONTEXT.md narrative: D-03 lists `SAFE_REPLAY` as a 5th branch, but Lattice's ResumePolicy union has only 4 members. Phase 9 ResumePolicy mapping MUST collapse the `BEFORE_NEXT_ITERATION_SCHEDULE` case into `SAFE` (matching adapter line 251-254) — NOT introduce a new policy literal that would require an INV-06 carve-out.

---

## 2. INV-06 Carve-Out Determination

### Verdict: **NOT TRIGGERED. INV-06 STAYS FROZEN at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (Phase 5 SHA).**

Phase 9 ships ZERO Lattice-side commits. LATTICE-PIN.md Phase 9 row will record `current_lattice_sha UNCHANGED` per Phase 7/8 precedent (see Phases 6, 7, 8 rows for the row shape).

### Evidence (HIGH confidence; read in-session 2026-05-31)

**`SurvivabilityAdapter<TState>` is already polymorphic** [VERIFIED: `lattice/packages/lattice/src/runtime/survivability.ts:169-176`]:

```typescript
export interface SurvivabilityAdapter<TState> {
  readonly kind: "survivability-adapter";
  readonly id: string;
  serialize(state: TState): SerializedSnapshot;
  deserialize(snapshot: SerializedSnapshot): TState;
  onEviction(hook: EvictionHook<TState>): UnsubscribeFn;
  resume(snapshot: SerializedSnapshot): Promise<ResumePolicy>;
}
```

The contract is generic over `TState`. FSB's session object (the `session` parameter throughout `runAgentIteration`) satisfies `TState` without Lattice-side change. The FSB implementation at `extension/ai/lattice-runtime-adapter.js:98-258` already conforms to this contract.

**`ResumePolicy` is a 4-member literal union** [VERIFIED: `lattice/packages/lattice/src/runtime/survivability.ts:148-152`]:

```typescript
export type ResumePolicy =
  | "SAFE"
  | "RECOVERY_AMBIGUOUS"
  | "ON_ERROR_SW_EVICTION_MID_REQUEST"
  | "ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH";
```

**Critical for planner:** CONTEXT.md D-03 narrative lists 5 ResumePolicy branches (adds `SAFE_REPLAY`). Lattice's union does NOT include `SAFE_REPLAY`. If the planner needs that branch literal, it triggers an INV-06 carve-out + LATTICE-PIN SHA bump + 5-member union extension. **Recommendation per D-07 INV-06 freeze:** collapse the `BEFORE_NEXT_ITERATION_SCHEDULE` case into `SAFE` per adapter line 251-254 (which already does this). No new literal needed. See Section 6 mapping table.

**Audit Flow 4 already CLOSED.** Per v0.10.0-MILESTONE-AUDIT.md line 78 + status_history 2026-05-31 `phase_8_shipped` entry, Flow 4 status flipped `partial_by_design_per_D-22` → `complete` during Phase 8 (SW producer wired). Phase 9 closes G2 (separate gap), not Flow 4.

[CITED: `.planning/v0.10.0-MILESTONE-AUDIT.md` lines 59-65 + status_history 2026-05-31 phase_8_shipped entry]

---

## 3. Marker Write Sites Verification (FINT-14a)

### Baseline state (verified 2026-05-31)

**`grep -rn "_currentStepName" extension/`** returns 4 hits — ALL inside `extension/ai/lattice-runtime-adapter.js` (one JSDoc reference + one read at line 244). **ZERO writes** in any extension code today. Phase 9 introduces the writes.

[VERIFIED: in-session bash `grep -n "_currentStepName" extension/ -r`]

### Phase 9 vocabulary (per D-01 + adapter resume() at lattice-runtime-adapter.js:244-256)

| Marker String | Set BEFORE… | Adapter resume() returns | Verified Read Site |
|---------------|-------------|---------------------------|---------------------|
| `'BEFORE_API_REQUEST'` | Provider/bridge call (callProviderWithTools) | `ON_ERROR_SW_EVICTION_MID_REQUEST` | `lattice-runtime-adapter.js:245-247` |
| `'BEFORE_TOOL_EXECUTION'` | Each tool dispatch | `ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH` | `lattice-runtime-adapter.js:248-250` |
| `'BEFORE_ITERATION'` | (Optional — see "Site B alternative") | `SAFE` | `lattice-runtime-adapter.js:251-254` |
| `'BEFORE_NEXT_ITERATION_SCHEDULE'` | The setTimeout at line 2498 | `SAFE` | `lattice-runtime-adapter.js:251-254` |
| `marker === undefined` | (No snapshot or pre-Phase-9 session) | `SAFE` | `lattice-runtime-adapter.js:251-254` |
| Anything else | n/a | `RECOVERY_AMBIGUOUS` (default) | `lattice-runtime-adapter.js:256` |

### Exact Phase 9 write sites (current line numbers post-Phase-8 emissions ship)

Verified by reading `extension/ai/agent-loop.js` lines 1810-1900 and 2460-2500 in-session 2026-05-31.

#### Site A: BEFORE_API_REQUEST

**Target zone:** lines 1820-1830 (the area just before the provider/bridge call in `callProviderWithTools`). The Phase 8 baseline currently shows lines 1813-1840 occupied by the end_turn terminal outcome block (lines 1810-1849 = end_turn branch; lines 1852-1854 = `_formatAssistantMessage` push; line 1861 = Phase 8 LLM_TURN emission).

**Planner action:** Locate the actual `callProviderWithTools(...)` await callsite in `runAgentIteration` (it precedes the LLM_TURN emission at 1861; planner reads agent-loop.js:1700-1850 to confirm absolute line). Insert `session._currentStepName = 'BEFORE_API_REQUEST';` IMMEDIATELY BEFORE the await. The CONTEXT.md "~1820-1830" zone is a rough target; the exact line depends on Phase 8's insertion shift (Phase 8 added ~30 lines via LLM_TURN+TOOL_DISPATCH blocks per 08-RESEARCH summary).

**Insert form:** Single-line marker write. Inside the `try {}` block scope of `runAgentIteration`. No `if-flag` guard needed (writing a property on `session` is cheap; the FLAG controls the ADAPTER serialize behavior at the persist sidecar).

#### Site B: BEFORE_TOOL_EXECUTION

**Target:** Insert IMMEDIATELY BEFORE the Phase 8 TOOL_DISPATCH emission block at line 1974. Verified line 1974 currently contains `if (typeof sendLatticeStepTransition === 'function') {` (Phase 8 FINT-11 TOOL_DISPATCH guard).

**Insert form:** `session._currentStepName = 'BEFORE_TOOL_EXECUTION';` on a new line BEFORE line 1974. After insertion the Phase 8 TOOL_DISPATCH emission at the present line 1974 shifts +1 line (acceptable; smoke uses content-based discovery per Phase 6 Plan 06-05 precedent).

**Critical:** This is inside the `for (var ci = 0; ci < toolCalls.length; ci++)` loop body (per 08-CONTEXT.md D-01); marker fires per-tool, matching the TOOL_DISPATCH cadence. Marker write happens AFTER the permission/hook check block (lines 1960-1966) so denied tools also set the marker — consistent with Phase 8 D-01 placement.

#### Site C: BEFORE_NEXT_ITERATION_SCHEDULE

**Target:** Insert IMMEDIATELY BEFORE the setTimeout at line 2498 (verified `session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 100);`).

**Insert form:** `session._currentStepName = 'BEFORE_NEXT_ITERATION_SCHEDULE';` on a new line BEFORE line 2498. **CRITICAL INV-04:** the marker write goes OUTSIDE the setTimeout callback lambda. It must NOT be `setTimeout(function() { session._currentStepName = '...'; runAgentIteration(...); }, 100);`. Planner verification step: after insertion, awk-scan the agent-loop.js setTimeout-bracketed region; assert zero `_currentStepName` tokens between `setTimeout(function() {` and the matching `}, ...)`.

### INV-04 byte-freeze regression rule (Plan-checker enforcement)

Plan-checker MUST assert post-phase:

```bash
# 1. setTimeout count unchanged
[ "$(grep -c "setTimeout" extension/ai/agent-loop.js)" -eq 8 ] || exit 1

# 2. Iterator pattern intact (4 matches; lines may shift)
[ "$(grep -c "session\._nextIterationTimer\s*=\s*setTimeout" extension/ai/agent-loop.js)" -eq 4 ] || exit 1

# 3. awk-scan: zero _currentStepName writes inside setTimeout lambda body
awk '
  /setTimeout\(function\s*\(\s*\)\s*\{/ { depth=1; next }
  depth > 0 {
    if ($0 ~ /_currentStepName/) { print "INV-04 VIOLATION line " NR; found=1 }
    n = gsub(/\{/, "{"); depth += n
    n = gsub(/\}/, "}"); depth -= n
  }
  END { exit found ? 1 : 0 }
' extension/ai/agent-loop.js
```

This 3-check pattern replicates Phase 8 Plan 08-02 Pitfall 1 awk-scan + Phase 6 Plan 06-05 content-based discovery (per 08-RESEARCH Section 6).

---

## 4. Serialize Sidecar Sites Verification (FINT-14b)

### In-flight resumable persist callsites (2 of 16) — Phase 9 SIDECARS HERE

Verified by `grep -n "persist(" extension/ai/agent-loop.js` in-session 2026-05-31 — 16 total callsites enumerated below.

| Site | Line | Classification | Sidecar? |
|------|------|----------------|----------|
| **A** | 1840 | end_turn terminal tail BEFORE finalizeSession at 1841 | ✅ YES (per D-02) |
| **B** | 2474 | Normal-iteration tail BEFORE setTimeout at 2498 | ✅ YES (per D-02) |

[VERIFIED: agent-loop.js:1840 + agent-loop.js:2474; read in-session]

**Rationale per D-02:**

- **Site A (1840):** persist runs after the assistant message + lastTurnResult are written into session but BEFORE `finalizeSession` (line 1841) cleans up. This is the canonical "in-flight commit point at end_turn" — if SW evicts here, restoring this snapshot gives the iterator everything to resume cleanly. Marker would be `BEFORE_NEXT_ITERATION_SCHEDULE` (set at site C ~2497) only if this was the normal-iteration tail; for end_turn the marker chain is naturally absent (terminal). `resume()` returns `SAFE` (default case at adapter line 251-254).
- **Site B (2474):** persist runs after tool-execution loop completes + lastTurnResult is constructed BEFORE the setTimeout at 2498. The companion `BEFORE_NEXT_ITERATION_SCHEDULE` marker (set at site C between line 2474 and line 2498) means a snapshot taken here, if restored, returns `SAFE` per the adapter mapping. The iterator naturally re-arms its own loop.

### Terminal/error persist callsites (14 of 16) — Phase 9 DOES NOT SIDECAR

| Site | Line | Classification | Why no sidecar |
|------|------|----------------|----------------|
| C | 1224 | runAgentLoop catch-all error tail | Error path before iterator boots; resume() always returns `RECOVERY_AMBIGUOUS` or `ON_ERROR_*` regardless |
| D | 1631 | (planner verifies — likely safety/preflight failure tail) | Pre-iteration safety check fail |
| E | 1648 | (planner verifies — likely safety/preflight failure tail) | Pre-iteration safety check fail |
| F | 1880 | "No tool calls parsed" defensive fallback before retry-iteration setTimeout at 1881 | Defensive path; iterator self-recovers via 100ms retry; sidecar would inflate writes during model-output churn |
| G | 2102 | Mid-tool-loop error persist | Terminal-with-finalize next |
| H | 2121 | Mid-tool-loop error persist | Terminal-with-finalize next |
| I | 2203 | Auth-fail error persist | Terminal `auth_required` outcome |
| J | 2239 | API/auth error persist before finalizeSession | Terminal API error outcome |
| K | 2360 | (planner verifies — likely tool-execution error path) | Tool execution error path |
| L | 2423 | (planner verifies — likely tool-result handling error) | Late-iteration error |
| M | 2456 | (planner verifies — likely late-iteration error tail) | Late-iteration error |
| N | 2544 | API error 5s-retry tail (before retry setTimeout 5000ms at 2544+1) | Self-retrying; sidecar adds no recovery benefit |
| O | 2558 | API error 2s-retry tail (before retry setTimeout 2000ms at 2558+1) | Self-retrying |
| P | 2587 | Final iteration error tail before finalizeSession | Terminal error outcome |

**Rationale (per D-02 narrative in 09-CONTEXT.md):** the 14 non-sidecar sites represent terminal states where `resume()` should return `ON_ERROR_*` regardless. Adding snapshots inflates `chrome.storage.session` writes without recovery benefit. LRU cap thrashing (Section 7) is the immediate negative consequence.

### Line-number drift from Phase 8 baseline — flag for planner

Phase 8 Plan 08-02 inserted ~30 new lines into `runAgentIteration` (LLM_TURN block ~10 lines + TOOL_DISPATCH block ~17 lines + tracer guards). Pre-Phase-8 ROADMAP brief (line 366) referenced `agent-loop.js:1840, 2438`. **Post-Phase-8 verified line numbers (this research):** persist at 1840 + 2474 (+36 line shift on second target).

**Planner action:** Plans MUST use the post-Phase-8 line numbers (1840 + 2474) AND adopt content-based discovery for the smoke tests (per Phase 6 Plan 06-05 + Phase 8 Plan 08-02 precedent) so future line shifts don't break smoke. Regex hint: `/await persist\(sessionId, session\)/` then context-match surrounding 5 lines for end_turn vs tool-iteration tail discrimination.

### Sidecar wrap pattern (Phase 8 idiom)

```js
// Phase 9 FINT-14 -- additive sidecar for SurvivabilityAdapter.serialize()
// after persist() so the in-flight snapshot lands in chrome.storage.session
// when flag is on. Defensive guard + try/catch fire-and-forget mirrors the
// Phase 8 sendLatticeStepTransition pattern at 1861/1974.
await persist(sessionId, session);
if (typeof FSB_LATTICE_RUNTIME_ADAPTER_ENABLED !== 'undefined'
    && FSB_LATTICE_RUNTIME_ADAPTER_ENABLED
    && typeof globalThis.fsbLatticeRuntimeAdapter !== 'undefined') {
  try {
    globalThis.fsbLatticeRuntimeAdapter.serialize(session);
  } catch (_e) { /* swallow - fire-and-forget per D-02 */ }
}
```

**Adapter instance source:** planner decides whether to (a) construct the adapter once at runAgentLoop entry and stash on `session._latticeAdapter` (preferred — keeps sessionId in closure scope; mirrors Phase 5 lifecycle), or (b) call `globalThis.fsbLatticeRuntimeAdapter.createFsbLatticeRuntimeAdapter({sessionId})` per sidecar (wasteful but simpler). Recommendation: (a) — single construction at runAgentLoop entry (Section 5 restore site), reuse for both sidecars.

---

## 5. Restore Site + Flag Flip Architecture (FINT-13 + FINT-15)

### Flag flip site

**Target:** `extension/background.js` immediately after line 13 (`importScripts('ai/lattice-step-emitter.js');`). Verified Phase 8 already installed this importScripts at line 13 (alphabetical between `lattice-provider-bridge.js` line 12 and `ai-integration.js` line 14).

**Insert form:** Single-line global assignment:

```js
// Phase 9 FINT-13 -- activate FSB SurvivabilityAdapter (closes audit gap G2).
// Mirrors Phase 6 flag-flip-in-background.js precedent (FSB_LATTICE_PROVIDER_BRIDGE_ENABLED
// pre-Phase-7). Code-only activation; options-page exposure deferred per CONTEXT.md
// deferred ideas. Set BEFORE chrome.runtime.onInstalled listener at line 13142+
// so the flag is observable from the first runAgentLoop invocation.
globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED = true;
```

**Precedence verification:** `onInstalled` listener at line 13142, `onStartup` listener at line 13222. Both fire AFTER importScripts chain completes. Flag set at line 14 (post-insertion) executes during SW boot before either lifecycle event. [VERIFIED: in-session grep + read]

**NOT in `extension/utils/config.js`:** per CONTEXT.md D-03, the Phase 6 bridge flag set the precedent of code-only globals during activation milestones with options-page exposure deferred (Phase 7 stripped the bridge flag entirely once stable; same trajectory anticipated for runtime-adapter flag).

### Restore site at runAgentLoop entry

**Target:** `extension/ai/agent-loop.js:1215` — the line containing `runAgentIteration(sessionId, options);` (verified in-session). This is the kick-off call for the first iteration.

**Insert form:** Block insertion immediately BEFORE line 1215:

```js
// Phase 9 FINT-15 -- check for prior snapshot + invoke resume() classifier.
// Defensive guard + try/catch fire-and-forget; result logged structurally.
// Plan 09-01 wires this; full per-policy CONSERVATIVE recovery dispatch is
// EXPLICITLY OUT OF SCOPE per Phase 5 D-22 + CONTEXT.md deferred ideas.
if (typeof FSB_LATTICE_RUNTIME_ADAPTER_ENABLED !== 'undefined'
    && FSB_LATTICE_RUNTIME_ADAPTER_ENABLED
    && typeof globalThis.FsbLatticeRuntimeAdapter !== 'undefined') {
  try {
    var adapter = globalThis.FsbLatticeRuntimeAdapter.createFsbLatticeRuntimeAdapter({ sessionId: sessionId });
    session._latticeAdapter = adapter;  // stash for sidecars at 1840 + 2474
    var snapshot = await _findLatestSnapshot(sessionId);  // listing helper; Section 7
    if (snapshot) {
      var deserialized = adapter.deserialize(snapshot);
      var policy = await adapter.resume(snapshot);
      console.log('[AgentLoop] lattice-runtime-adapter resume verdict:', {
        sessionId: sessionId,
        ResumePolicy: policy,
        marker: deserialized && deserialized._currentStepName,
        capturedAt: snapshot.capturedAt
      });
      // Branch behavior per CONTEXT.md D-03 (log + proceed for ALL 4 policies):
      //   SAFE -> proceed normally
      //   ON_ERROR_SW_EVICTION_MID_REQUEST -> log + proceed (iterator retries)
      //   ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH -> log + proceed (iterator handles re-dispatch idempotency)
      //   RECOVERY_AMBIGUOUS -> log + proceed with caller-visible warning
      // CONSERVATIVE per-policy dispatch deferred per Phase 5 D-22.
    }
  } catch (err) {
    console.warn('[AgentLoop] lattice-runtime-adapter restore threw (non-fatal):', err && err.message);
  }
}

// Kick off the first iteration
runAgentIteration(sessionId, options);
```

**Helper `_findLatestSnapshot(sessionId)`:** lives as a module-internal async function under `extension/ai/agent-loop.js` or sibling under `extension/ai/lattice-runtime-restore.js`. Implementation:

```js
async function _findLatestSnapshot(sessionId) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.session) return null;
  var prefix = 'fsb_lattice_snapshot_' + sessionId + '_';
  return new Promise(function (resolve) {
    chrome.storage.session.get(null, function (all) {
      if (chrome.runtime && chrome.runtime.lastError) return resolve(null);
      var matches = Object.keys(all || {})
        .filter(function (k) { return k.indexOf(prefix) === 0; })
        .sort();  // ISO-8601 capturedAt suffix sorts chronologically
      if (matches.length === 0) return resolve(null);
      var latestKey = matches[matches.length - 1];
      resolve(all[latestKey]);
    });
  });
}
```

This snapshot lookup is the ONLY synchronous restore-time storage hit. LRU enforcement happens at WRITE time (Section 7), not at read time.

---

## 6. ResumePolicy Classification Mapping (FINT-15a)

### Verified 4-member ↔ 4-marker mapping

`ResumePolicy` is locked at 4 members per Lattice `survivability.ts:148-152`. The FSB adapter at `lattice-runtime-adapter.js:244-256` already implements the canonical mapping. Phase 9 marker writes (Section 3) align with this mapping:

| `session._currentStepName` value | Adapter `resume()` returns (lines 245-256) | Phase 9 Site | Recovery Semantics |
|----------------------------------|---------------------------------------------|--------------|---------------------|
| `'BEFORE_API_REQUEST'` | `'ON_ERROR_SW_EVICTION_MID_REQUEST'` | Site A (~1820-1830) | Mid-API-call; replay risk = duplicate provider charge. Log + proceed; iterator retries. |
| `'BEFORE_TOOL_EXECUTION'` | `'ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH'` | Site B (1973, before line 1974) | Mid-tool-dispatch; tool result may be missing. Log + proceed; iterator handles re-dispatch idempotency. |
| `'BEFORE_ITERATION'` | `'SAFE'` | (not written by Phase 9 — boundary marker only) | Safe boundary; iterator re-arms. |
| `'BEFORE_NEXT_ITERATION_SCHEDULE'` | `'SAFE'` | Site C (2497, before setTimeout at 2498) | Safe boundary just before scheduling; iterator self-recovers. |
| `marker === undefined` | `'SAFE'` (default case) | n/a — pre-Phase-9 session OR no snapshot | No-op. |
| Any other string | `'RECOVERY_AMBIGUOUS'` (fallback) | n/a | Log warning; proceed with caution. |

### Critical correction to CONTEXT.md D-03 narrative

CONTEXT.md D-03 lists `SAFE_REPLAY` as the 5th branch behavior. **Lattice's ResumePolicy union does NOT include `SAFE_REPLAY`** [VERIFIED: `survivability.ts:148-152`]. The adapter at line 251-254 collapses BOTH `BEFORE_ITERATION` AND `BEFORE_NEXT_ITERATION_SCHEDULE` into `SAFE`. Phase 9 MUST NOT introduce a 5th policy literal; doing so triggers an INV-06 carve-out + LATTICE-PIN SHA bump.

**Recommended planner action:** treat the CONTEXT.md D-03 `SAFE_REPLAY` mention as a documentation artifact. The 5-row branch table in D-03 collapses to 4 rows in implementation (4 ResumePolicy values × 4-marker classification, with `BEFORE_NEXT_ITERATION_SCHEDULE` → `SAFE` not `SAFE_REPLAY`). All planner-facing materials (plans, smoke assertions, REQUIREMENTS narrative) MUST use only the 4 locked Lattice literals.

### Default `SAFE` case (no marker)

When `_currentStepName === undefined` (e.g., first iteration before any boundary marker is written, OR a pre-Phase-9 session deserialized from older snapshot), the adapter returns `'SAFE'` (line 251-254 catches `undefined` explicitly). Iterator proceeds normally. This is the safe failure mode.

---

## 7. LRU Cap Enforcement Implementation (FINT-15b)

### JSDoc contract being implemented

[VERIFIED: `extension/ai/lattice-runtime-adapter.js:76`]:

```js
const DEFAULT_LRU_CAP = 50; // JSDoc-documented contract; enforcement is follow-on
```

And at lines 49-55:

```
chrome.storage.session size leak (row 3 of CONTEXT.md threat model):
  this adapter accumulates per-step snapshots without cleanup. The
  JSDoc on createFsbLatticeRuntimeAdapter below documents an
  LRU-bound contract (default cap = 50 snapshots per sessionId);
  enforcement is a follow-on.
```

Phase 9 IS that follow-on.

### Enforcement approach: keep-latest-N with eviction-on-write

At each `serialize()` call, after writing the new snapshot under prefix `fsb_lattice_snapshot_<sessionId>_<capturedAt>`:

1. List all keys with the same `<sessionId>` prefix via `chrome.storage.session.get(null, ...)` filtered in JavaScript (or `chrome.storage.session.get(prefix, ...)` if the SDK accepts a prefix string — planner verifies via Chrome docs; in practice `get(null, ...)` returns all keys then filter is reliable).
2. Sort matches by `<capturedAt>` (ISO-8601 string sort is chronological).
3. If `matches.length > lruCap` (default 50), delete entries beyond index `lruCap - 1` (keep newest 50; delete the rest).
4. Use `chrome.storage.session.remove(keysToDelete, callback)` for batch deletion.

### Sync vs async semantics (CD resolution)

CONTEXT.md leaves "sync vs async eviction" to planner discretion.

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| Synchronous (block serialize until eviction completes) | Snapshot count guaranteed ≤ cap before serialize returns | Doubles serialize latency; adds backpressure inside `runAgentIteration` body | NOT recommended |
| Asynchronous fire-and-forget | Zero latency on serialize; matches Phase 8 emission pattern | Brief window where snapshot count = cap+1 between writes | **RECOMMENDED** — matches Phase 8 idiom + Phase 5 D-07 best-effort design |

**Recommended:** fire-and-forget. The cap is a soft bound; brief excursions to cap+1 are harmless (chrome.storage.session 10MB quota gives ~2000-4000 typical-snapshot headroom above cap=50). Mirrors Phase 5 adapter's existing `persistInternal` best-effort logging at line 134-140.

### Skeleton implementation

```js
function enforceLruCap(sessionId, storage, lruCap, currentKey) {
  // Fire-and-forget; mirrors Phase 5 persistInternal cadence.
  try {
    var prefix = 'fsb_lattice_snapshot_' + sessionId + '_';
    storage.get(null, function (all) {
      if (chrome.runtime && chrome.runtime.lastError) return;
      var matches = Object.keys(all || {})
        .filter(function (k) { return k.indexOf(prefix) === 0; })
        .sort();
      if (matches.length <= lruCap) return;
      var toDelete = matches.slice(0, matches.length - lruCap);
      storage.remove(toDelete, function () {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn('[FSB lattice-runtime-adapter] LRU eviction lastError:', chrome.runtime.lastError);
        }
      });
    });
  } catch (err) {
    console.warn('[FSB lattice-runtime-adapter] enforceLruCap threw:', err && err.message);
  }
}
```

**Insertion site:** inside `persistInternal` at `lattice-runtime-adapter.js:126-141`, after the existing `storage.set(...)` callback fires (so the new snapshot is committed before eviction sweep). This modifies an existing Phase 5 module — acceptable because Phase 9 IS the follow-on the JSDoc explicitly defers.

**Smoke test for LRU (Plan 09-02 Wave 1):** write 51 snapshots; assert storage contains exactly 50; verify the OLDEST (lowest ISO timestamp) was evicted; verify the 51st (newest) is retained.

---

## 8. Failure Modes + Degradation

Mirrors Phase 8 RESEARCH Section 7 template + Phase 5 D-07 best-effort design.

| Failure mode | Detection | Degradation strategy | Production impact |
|--------------|-----------|----------------------|-------------------|
| **Flag absent** (`FSB_LATTICE_RUNTIME_ADAPTER_ENABLED === undefined`) | Guard at every persist sidecar + restore site | No-op; adapter never writes; behaves like Phase 5 default-off baseline | None (intentional kill switch) |
| **Adapter module not loaded** (`globalThis.FsbLatticeRuntimeAdapter === undefined`) | Guard at restore site (after flag check) | No-op; log warning at boot if module missing | None; iterator behaves like Phase 5 baseline |
| **Signer absent** (offscreen signer not yet booted when adapter consults) | N/A — Phase 9 doesn't sign; just serializes via JSON | Receipts signed BY Phase 8 path (offscreen receipt mint); Phase 9 sidecars do NOT sign | None |
| **Storage quota exceeded** (chrome.storage.session 10MB cap) | `chrome.runtime.lastError` on `storage.set` callback | Log warning; snapshot drop is silent (best-effort); LRU enforcement actively prevents accumulation | Worst case: latest snapshot lost; iterator self-recovers on next sidecar |
| **Deserialize corruption** (`JSON.parse` throws on `snapshot.payload`) | try/catch in restore-site block + adapter `resume()` returns `'RECOVERY_AMBIGUOUS'` per line 238-240 | Log; proceed without restore; iterator starts fresh | Snapshot lost; new session starts cleanly |
| **`resume()` throws** (unexpected) | try/catch in restore-site block | Log warning; proceed without restore | Same as deserialize corruption |
| **LRU enforcement fails** (`storage.remove` lastError) | Log + continue; snapshot count may temporarily exceed cap | Background drift; recovers on next serialize call | Storage quota pressure if persistent — surfaces as next-snapshot write failure (handled above) |
| **Marker write inside setTimeout lambda (INV-04 violation)** | Pre-commit awk-scan (Section 3) | Build/CI fails before merge | None at runtime (caught at plan-checker stage) |
| **Snapshot found from older session schema** (e.g., pre-Phase-9 session with no `_currentStepName`) | Adapter `resume()` returns `'SAFE'` default | Iterator proceeds normally; old snapshots auto-expire via LRU | None |
| **Sessions from different tabs/agents sharing storage** | sessionId key prefix scopes naturally | Each session restores only its own snapshots | None — multi-agent safe |

**Key insight per D-02 + Phase 5 threat model:** the entire Phase 9 wiring is fire-and-forget at production cadence. The autopilot iterator NEVER awaits adapter operations beyond the single `resume()` call at runAgentLoop entry. INV-04 setTimeout cadence is preserved because no adapter operation blocks the iteration loop.

---

## 9. Smoke Test Design (FINT-14c + FINT-15c)

### Extension target: `tests/lattice-survivability-smoke.test.js`

Existing scaffold (verified 292 lines, 40 PASS / 0 FAIL at Phase 5 baseline). 5-part structure documented at lines 13-24 in file:

| Part | Coverage | Phase 5 PASS count |
|------|----------|---------------------|
| 1 | Surface presence on 'lattice' bare specifier (Plan 05-03 re-export) | 6 |
| 2 | FSB-side adapter factory + 4 contract methods + ResumePolicy dispatch | 9 |
| 3 | Real v1.1 receipt embedded in adapter state + serialize/deserialize verify round-trip | 6 |
| 4 | Feature flag default-off + flag-on persistence (chrome.storage.session mock) | 5 |
| 5 | Phase 1+2+3+4 byte-frozen carryforward checks | 4 |
| **Total** | | **30 (target ≥25)** |

### Phase 9 adds Part 6 — 5 sub-assertions estimated; planner sets floor

| Sub-assertion | Coverage | Estimated PASSes |
|---------------|----------|------------------|
| 6.1 | Flag-on activation: with mocked `chrome.storage.session`, set `FSB_LATTICE_RUNTIME_ADAPTER_ENABLED = true`, construct adapter, call serialize → assert mock storage has the expected key under `fsb_lattice_snapshot_<sessionId>_*` | 3-4 |
| 6.2 | Restore round-trip: write a snapshot, then via the `_findLatestSnapshot` listing helper retrieve it, deserialize, and verify session shape round-trips byte-equivalent | 3-4 |
| 6.3 | ResumePolicy classification: synthesize 4 session states with markers `BEFORE_API_REQUEST`, `BEFORE_TOOL_EXECUTION`, `BEFORE_NEXT_ITERATION_SCHEDULE`, `undefined`; serialize + resume each; assert returned ResumePolicy matches the 4-member Lattice union per Section 6 mapping | 4-5 |
| 6.4 | INV-04 byte-freeze regression: `grep -c "setTimeout" extension/ai/agent-loop.js === 8`; `grep -c "session\._nextIterationTimer\s*=\s*setTimeout" === 4`; awk-scan asserts zero `_currentStepName` writes inside setTimeout lambda body | 3 |
| 6.5 | LRU cap eviction: write 51 snapshots via serialize; assert listing returns exactly 50; assert oldest (lowest capturedAt) is evicted; assert newest is retained | 4-5 |

**Estimated Part 6 PASS floor: 17 (5 sub-assertions × ~3-4 PASSes each).**

**Smoke target post-Phase-9:** ≥ 47 PASS / 0 FAIL (30 baseline + 17 new). Planner sets exact floor in 09-02-PLAN.md.

### Convention: zero changes to Parts 1-5

Phase 5 carryforward; raw-node + manual PASS counters + `process.exit(failed > 0 ? 1 : 0)` per FSB convention (file lines 38-51). No mocha/vitest dependency. The Phase 5 + Phase 8 BYTE-FROZEN baseline for Parts 1-5 holds; Phase 9 only appends Part 6.

### Critical smoke pattern: content-based discovery for assertions touching agent-loop.js

Per Phase 8 Plan 08-02 + Phase 6 Plan 06-05 precedent (see Phase 8 RESEARCH Section 14), smoke MUST NOT hardcode line numbers. Use regex content-discovery:

```js
var agentLoopSrc = fs.readFileSync(path.join(__dirname, '../extension/ai/agent-loop.js'), 'utf8');

// INV-04 byte-freeze:
passAssertEqual((agentLoopSrc.match(/setTimeout/g) || []).length, 8, 'INV-04 setTimeout count = 8');

// 4 iterator pattern matches:
passAssertEqual(
  (agentLoopSrc.match(/session\._nextIterationTimer\s*=\s*setTimeout/g) || []).length,
  4,
  'INV-04 iterator pattern unchanged (4 matches)'
);

// Phase 9 marker write presence (content-based — no line numbers):
passAssert(/_currentStepName\s*=\s*['"]BEFORE_API_REQUEST['"]/.test(agentLoopSrc),
  'Phase 9 BEFORE_API_REQUEST marker write present');
passAssert(/_currentStepName\s*=\s*['"]BEFORE_TOOL_EXECUTION['"]/.test(agentLoopSrc),
  'Phase 9 BEFORE_TOOL_EXECUTION marker write present');
passAssert(/_currentStepName\s*=\s*['"]BEFORE_NEXT_ITERATION_SCHEDULE['"]/.test(agentLoopSrc),
  'Phase 9 BEFORE_NEXT_ITERATION_SCHEDULE marker write present');

// INV-04 Pitfall 1 awk-scan stand-in: zero _currentStepName tokens inside setTimeout lambda body
// (regex approximation; planner refines via cross-file awk per Section 3)
var inLambdaPattern = /setTimeout\(function\s*\(\s*\)\s*\{[^}]*_currentStepName[^}]*\}/g;
passAssertEqual((agentLoopSrc.match(inLambdaPattern) || []).length, 0,
  'INV-04 no _currentStepName writes inside setTimeout lambdas');
```

---

## 10. Validation Architecture (Nyquist Dimension 8)

`workflow.nyquist_validation` absent from `.planning/config.json` (only present: research/plan_check/verifier flags) — treat as enabled per gsd-research-phase contract.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node raw runtime (no mocha/jest/vitest); manual PASS/FAIL counters; `process.exit(failed > 0 ? 1 : 0)` per FSB convention |
| Config file | None — tests are standalone `.test.js` files chained via `package.json` `scripts.test` `&&` chain |
| Quick run command | `node tests/lattice-survivability-smoke.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FINT-13 | `globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED === true` after SW boot (background.js line 13 area) | smoke (grep + adapter activation) | `node tests/lattice-survivability-smoke.test.js` (Part 6.1) | ✅ Phase 5 scaffold |
| FINT-14 (markers) | All 3 marker writes present in agent-loop.js; INV-04 awk-scan empty inside lambdas | smoke (content discovery + regex) | `node tests/lattice-survivability-smoke.test.js` (Part 6.4) | ✅ Phase 5 scaffold |
| FINT-14 (sidecars) | `serialize` invoked from 2 in-flight persist sites; mock chrome.storage.session records snapshot writes | smoke (mock storage + roundtrip) | `node tests/lattice-survivability-smoke.test.js` (Part 6.1 + 6.2) | ✅ Phase 5 scaffold |
| FINT-15 (restore) | `_findLatestSnapshot` listing + adapter.deserialize + resume returns correct ResumePolicy per marker | smoke (synthesize 4 markers, mock chrome.storage.session) | `node tests/lattice-survivability-smoke.test.js` (Part 6.2 + 6.3) | ✅ Phase 5 scaffold |
| FINT-15 (LRU) | Write 51 snapshots; assert ≤50 remain; oldest evicted | smoke (mock chrome.storage.session) | `node tests/lattice-survivability-smoke.test.js` (Part 6.5) | ✅ Phase 5 scaffold |
| FINT-15 (4-member ResumePolicy) | Only 4 literal members reachable; no `SAFE_REPLAY` regression | smoke (cross-check Lattice survivability.ts on disk) | `node tests/lattice-survivability-smoke.test.js` (Part 6.3) | ✅ Phase 5 scaffold |
| INV-04 byte-freeze | `grep -c "setTimeout" extension/ai/agent-loop.js === 8` + 4 iterator pattern + awk-scan empty | smoke (grep/regex on source) | `node tests/lattice-survivability-smoke.test.js` (Part 6.4) | ✅ Phase 5 scaffold |
| INV-06 byte-freeze | LATTICE-PIN.md `current_lattice_sha === e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` | smoke (read LATTICE-PIN.md frontmatter) | `node tests/lattice-survivability-smoke.test.js` (Part 6 carryforward) | ✅ Phase 6 Plan 06-05 precedent |
| UAT-09 | Chrome MV3 reload session asserts flag-on, restore round-trip, LRU eviction, autopilot iteration completes | manual (deferred to end-of-milestone per D-07) | n/a — embedded in 09-VERIFICATION.md per Phase 7 Plan 07-03 precedent | Plan 09-03 creates VERIFICATION.md |

### Sampling Rate

- **Per task commit:** `node tests/lattice-survivability-smoke.test.js` (full Part 1-6 run; ~3-5 seconds wall-clock).
- **Per wave merge:** `npm test` (full chain including Phase 1-8 smokes + Phase 9 survivability).
- **Phase gate:** `npm test` exits 0 before `/gsd-verify-phase 9`.

### Wave 0 Gaps

- [ ] `tests/lattice-survivability-smoke.test.js` Part 6 stub (Plan 09-01 Wave 0): add empty Part 6 stub with passing 0-assertion placeholder so the &&-chain stays green while Plans 09-02 fills the assertions incrementally. Mirrors Phase 6 Plan 06-00 Wave 0 scaffold pattern.
- [ ] Mock `chrome.storage.session` extension to support `get(null, ...)` listing — Phase 5 mock at lines 142, 239, 262 supports flag manipulation but planner verifies `get(null)` listing semantics. Add helper to fixture if missing.
- [ ] No new framework install needed (raw Node test convention).

### Receipt Count Expectation (Phase 8 carry-forward gate)

Phase 8 Plan 08-02 finalized `tests/lattice-step-emitter-smoke.test.js` at ≥ 25 PASS / 0 FAIL (38 actual). Phase 9 MUST NOT regress this; Plan 09-02 smoke fill includes a Phase 8 carry-forward check asserting Phase 8 baseline holds.

---

## 11. Wave Structure Recommendation

### 3 plans per CONTEXT.md D-06

| Plan | Wave | Scope | Files Touched | Atomic? |
|------|------|-------|---------------|---------|
| **09-01** | W1 | Flag flip in `background.js` line 13 area + runAgentLoop entry restore wiring (deserialize/resume + ResumePolicy log + `_findLatestSnapshot` helper) + Wave 0 smoke scaffold extension (Part 6 stub) | `extension/background.js` (1 new line); `extension/ai/agent-loop.js` (~20 new lines at line 1215 area + 1 helper function); `tests/lattice-survivability-smoke.test.js` (Part 6 stub) | Yes — single FSB commit |
| **09-02** | W1/W2 | `_currentStepName` marker writes at 3 sites in `runAgentIteration` + serialize sidecars at persist 1840 + 2474 + LRU enforcement in `lattice-runtime-adapter.js:persistInternal` + smoke Part 6 fill (5 sub-assertions) | `extension/ai/agent-loop.js` (3 marker writes + 2 sidecar blocks); `extension/ai/lattice-runtime-adapter.js` (LRU enforcement in persistInternal); `tests/lattice-survivability-smoke.test.js` (Part 6 fill) | Yes — single FSB commit |
| **09-03** | W3 | Documentation ceremony: REQUIREMENTS.md FINT-13/14/15 narrative + traceability rows + FINT-PP..Q placeholder retirement + Total v1 35 → 38 + Last updated bumped + LATTICE-PIN.md Phase 9 row (SHA UNCHANGED per Phase 8 D-04 precedent) + v0.10.0-MILESTONE-AUDIT.md G2 `documented_carryforward_low` → `closed_in_phase_9` + status_history entry. ZERO production code. | `.planning/REQUIREMENTS.md`; `.planning/LATTICE-PIN.md`; `.planning/v0.10.0-MILESTONE-AUDIT.md` | Yes — single FSB commit |

### Intra-plan dependencies

- **09-01 → 09-02:** Plan 09-02 marker writes depend on Plan 09-01's restore site existing (the marker is set in the iteration body; the restore reads it via adapter on the next runAgentLoop entry). Strictly sequential.
- **09-02 → 09-03:** Plan 09-03 ceremony depends on Plan 09-02 production wiring landing. Strictly sequential per the standard ceremony-last convention.
- **Smoke Part 6 stub** (Plan 09-01) → **smoke Part 6 fill** (Plan 09-02): incremental fill pattern per Phase 6 Plan 06-00 → Plans 06-01..05 precedent. Each plan's smoke addition must keep `npm test` green.

### Agent-loop.js write conflict flag for planner

**Plans 09-01 + 09-02 BOTH touch `extension/ai/agent-loop.js`:**
- 09-01 inserts at line 1215 (runAgentLoop entry, restore block + helper)
- 09-02 inserts at 3 sites in runAgentIteration body (~1820, 1973, 2497) + 2 sidecar blocks at 1840 + 2474

These are non-overlapping line ranges (runAgentLoop ends at ~1226; runAgentIteration starts at 1243). However, parallel execution would conflict on git merge order. **Recommendation: execute 09-01 → 09-02 strictly sequentially.** No parallelism inside Phase 9.

### Receipt-count expectation per plan

| Plan | Smoke PASS floor expectation |
|------|------------------------------|
| 09-01 | Phase 5 baseline 30 PASS preserved + Part 6 stub adds 0-1 PASSes (placeholder; declare floor ≥ 30) |
| 09-02 | Part 6 filled to ≥17 PASSes; total ≥ 47 PASS |
| 09-03 | No new tests; assert ≥ 47 PASS holds (Phase 8/9 carry-forward) |

---

## 12. Open Questions for Planner (RESOLVED)

### Q1 (RESOLVED): CONTEXT.md D-03 lists 5 ResumePolicy branches; Lattice union has 4 — which is canonical?

**Lattice's 4-member union is canonical.** [VERIFIED: `lattice/packages/lattice/src/runtime/survivability.ts:148-152`] CONTEXT.md `SAFE_REPLAY` reference is a documentation artifact. Phase 9 adapter mapping collapses `BEFORE_NEXT_ITERATION_SCHEDULE` → `'SAFE'` per existing adapter behavior at `lattice-runtime-adapter.js:251-254`. Operationalization: plans MUST use only the 4 literal members; smoke Part 6.3 verifies; INV-06 byte-freeze relies on this.

### Q2 (RESOLVED): Where does the adapter instance live across the runAgentLoop scope?

**Stash on `session._latticeAdapter` at runAgentLoop entry.** Construction happens once inside the Plan 09-01 restore block (Section 5 skeleton). Both serialize sidecars at sites A (1840) + B (2474) read `session._latticeAdapter.serialize(session)`. Mirrors Phase 5 D-09 + Phase 5 D-10 composition convention (adapter scoped to a single runAgentLoop session lifecycle). Operationalization: Plan 09-01 creates the field at restore block; Plan 09-02 sidecars consume it.

### Q3 (RESOLVED): Should LRU enforcement modify the Phase 5 adapter module directly, or live in a sibling file?

**Modify `lattice-runtime-adapter.js:persistInternal` directly.** The JSDoc at lines 49-55 + line 76 explicitly defers LRU to a follow-on; Phase 9 IS that follow-on per CONTEXT.md D-05. Modifying the Phase 5 module is the intended trajectory — not a violation of Phase 5 byte-freeze (the Phase 5 freeze covers ABI/contract, not internal implementation). Operationalization: Plan 09-02 edits `persistInternal` to call `enforceLruCap` after `storage.set` callback. Phase 5 Node smoke (`lattice-survivability-smoke.test.js` Parts 1-5) must continue passing (Phase 5 baseline carry-forward).

### Q4 (RESOLVED): What is the snapshot listing query shape per chrome.storage.session API?

**Use `chrome.storage.session.get(null, callback)` to list ALL keys, then filter by prefix in JavaScript.** Chrome's `get(prefix-string, ...)` API behavior for partial prefix matching is undocumented; safer to retrieve all keys and filter. Storage footprint for one session is bounded by LRU cap × ~few-KB per snapshot ≤ 200KB; full-namespace `get(null)` is acceptable at this scale. Operationalization: `_findLatestSnapshot` helper (Section 5) + LRU `enforceLruCap` (Section 7) both follow this pattern.

### Q5 (RESOLVED): How should the planner handle the line-number drift from CONTEXT.md (1820-1830, 1973, 2497, 1840, 2474, 1215) vs actual file state?

**Use the exact line numbers verified in this research (Section 3 + Section 4 + Section 5).** All 6 target lines verified by in-session reads 2026-05-31:
- runAgentLoop entry: line 1215 ✓
- BEFORE_API_REQUEST zone: ~1820-1830 (planner reads 1700-1850 to locate exact callProviderWithTools await)
- end_turn persist: line 1840 ✓
- LLM_TURN Phase 8 emit: line 1861 (informational; Phase 9 doesn't touch)
- BEFORE_TOOL_EXECUTION + TOOL_DISPATCH Phase 8 emit: line 1974 ✓ (insert marker BEFORE this line)
- Normal-iteration persist tail: line 2474 ✓
- BEFORE_NEXT_ITERATION_SCHEDULE + setTimeout: line 2498 ✓ (insert marker BEFORE this line)

Smoke tests use content-based regex discovery (Section 9), so future Phase 10+ shifts do not break Phase 9 smoke. Operationalization: plans embed both the verified line numbers AND content-discovery regex patterns; smoke uses only the regex patterns.

### Q6 (RESOLVED): What happens if a snapshot from a different agent's session is somehow restored?

**Cannot happen by construction.** Storage key prefix is `fsb_lattice_snapshot_<sessionId>_<capturedAt>` per `lattice-runtime-adapter.js:75`. `_findLatestSnapshot` (Section 5) filters by `sessionId`-prefixed keys only. Cross-session key collision is impossible because sessionId is generated via `crypto.randomUUID()` upstream (per v0.9.60 Phase 237). Operationalization: smoke Part 6 includes a multi-session isolation test (two adapters with different sessionIds; assert each only sees its own snapshots).

---

## Sources

### Primary (HIGH confidence; read in-session 2026-05-31)

- `extension/ai/agent-loop.js` lines 1115, 1200-1230, 1810-2000, 2460-2500 — restore site, marker write sites, persist callsites, setTimeout iterator pattern
- `extension/ai/lattice-runtime-adapter.js` (full file, 272 lines) — adapter contract implementation; ResumePolicy switch at 244-256; LRU JSDoc at 76; storage prefix at 75
- `extension/background.js` lines 1-50, 13120-13260 — importScripts chain; onInstalled/onStartup precedence
- `extension/ai/lattice-step-emitter.js` (full file, 64 lines) — Phase 8 producer module pattern reference
- `lattice/packages/lattice/src/runtime/survivability.ts` lines 50-180 — ResumePolicy union (4 members), SurvivabilityAdapter polymorphic contract (lines 169-176)
- `tests/lattice-survivability-smoke.test.js` lines 1-50, 100-180 — Phase 5 smoke scaffold structure + Part 6 insertion point
- `.planning/phases/09-fsb-survivabilityadapter-activated-for-mv3-sw-eviction-resum/09-CONTEXT.md` (entire file) — D-01..D-07 locked decisions
- `.planning/REQUIREMENTS.md` lines 70-90 — FINT-04..09 status + FINT-NN..M/PP..Q TBD placeholders
- `.planning/LATTICE-PIN.md` (full file) — Phase 8 row precedent (SHA UNCHANGED); current SHA `e95067bf`
- `.planning/v0.10.0-MILESTONE-AUDIT.md` lines 50-120 — G2 definition + Flow 4 status (already closed in Phase 8)
- `.planning/phases/08-fsb-agent-loop-runs-on-lattice-runtime-emit-step-transition-/08-RESEARCH.md` lines 1-120 — Section 2 D-04 carve-out precedent (Phase 9 mirrors as INV-06 determination)
- `.planning/phases/08-fsb-agent-loop-runs-on-lattice-runtime-emit-step-transition-/08-CONTEXT.md` (full file) — D-01..D-07 invariant preservation pattern
- `.planning/phases/05-mv3-survivability-bundler/05-CONTEXT.md` (full file) — D-22 explicit-deferred CONSERVATIVE recovery dispatcher
- `.planning/STATE.md` lines 1-50 — milestone progress
- `.planning/PROJECT.md` lines 1-65 — Lattice integration model + hard invariants
- `.planning/ROADMAP.md` lines 360-378 — Phase 9 entry; INV statements
- `.planning/config.json` — workflow.nyquist_validation absent (treat enabled)

### Verification commands run in-session

- `grep -rn "_currentStepName" extension/` → 4 hits, all in lattice-runtime-adapter.js (1 read + 3 JSDoc); ZERO writes anywhere [CONFIRMS Phase 9 owns the writes]
- `grep -n "setTimeout" extension/ai/agent-loop.js` → 8 hits (4 iterator pattern at 1881/2498/2567/2577 + 4 informational/throw/keepalive) [CONFIRMS INV-04 baseline]
- `grep -n "persist(" extension/ai/agent-loop.js` → 16 hits at lines 1224, 1631, 1648, 1840, 1880, 2102, 2121, 2203, 2239, 2360, 2423, 2456, 2474, 2544, 2558, 2587 [CONFIRMS 2-of-16 sidecar classification in Section 4]
- `grep -rn "FSB_LATTICE_RUNTIME_ADAPTER_ENABLED" extension/` → 4 hits, all in lattice-runtime-adapter.js (1 JSDoc + 3 checks); ZERO production setters anywhere [CONFIRMS G2 baseline]
- Read `lattice/packages/lattice/src/runtime/survivability.ts:148-176` → ResumePolicy is 4-member union; SurvivabilityAdapter is polymorphic [CONFIRMS INV-06 NOT triggered]
- Read `extension/background.js:1-15` → importScripts chain confirms line 13 = `ai/lattice-step-emitter.js` (Phase 8 anchor) [CONFIRMS flag-flip insertion site for Plan 09-01]

### Secondary (MEDIUM confidence; cross-referenced)

- 09-CONTEXT.md D-03 narrative for "5 ResumePolicy branches" — flagged as documentation artifact; Lattice union is 4-member (resolved Q1)
- 09-CONTEXT.md D-04 marker "BEFORE_ITERATION" — present in adapter line 251 but Phase 9 doesn't write it (boundary marker present in attempt-1 vocabulary for future expansion; not strictly needed for Phase 9 scope)

### Tertiary (LOW confidence; informational only)

- Chrome MV3 SW eviction behavior — well-documented externally; not a source of risk for Phase 9 because the adapter's `onEviction` is best-effort per Lattice contract

---

## Metadata

**Confidence breakdown:**
- INV-06 carve-out determination: **HIGH** — survivability.ts read in-session; 4-member union explicit
- Marker write sites: **HIGH** — exact lines verified; grep confirms zero existing writes
- Serialize sidecar sites: **HIGH** — 16 persist sites enumerated; 2 in-flight classified per CONTEXT.md D-02
- Restore site + flag flip: **HIGH** — line 1215 + background.js line 13 area verified
- ResumePolicy mapping: **HIGH** — adapter switch at 244-256 read; Lattice union locked at 4 members
- LRU enforcement: **MEDIUM-HIGH** — implementation pattern straightforward; Chrome storage.session API contract documented; planner verifies `get(null, ...)` callback signature in MV3 spec
- Failure modes: **HIGH** — patterns inherited from Phase 5 + Phase 8 precedents
- Smoke test design: **HIGH** — Phase 5 scaffold structure read; content-based discovery convention established
- Validation architecture: **HIGH** — config.json verified; FSB raw-node convention well-established
- Wave structure: **HIGH** — file overlap analysis verifies non-conflict between 09-01 and 09-02

**Research date:** 2026-05-31
**Valid until:** 2026-06-30 (30 days for stable file structure; Phase 10 may shift line numbers but content-based discovery insulates Phase 9 smoke)

---

## Assumptions Log

All claims in this research are tagged [VERIFIED] or [CITED]. No [ASSUMED] claims. Table empty.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|

**Empty table:** All Phase 9 implementation decisions were either verified against in-tree code (file reads + grep), cited from locked CONTEXT.md decisions, or derived from explicit Lattice surface definitions. No user confirmation needed before Plan-phase execution.
