# Phase 9: FSB SurvivabilityAdapter activated for MV3 SW eviction resumption (closes G2) - Context

**Gathered:** 2026-05-31 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

**In scope (Phase 9):** Activate the standalone `extension/ai/lattice-runtime-adapter.js` (created in Phase 5; zero importers in production today). Three integrated changes:
1. Flip `FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` default-true global at SW boot.
2. Write `session._currentStepName` markers in `runAgentIteration` alongside Phase 8 emissions — **this is the critical bridge the ROADMAP brief incorrectly assumed Phase 8 had already done.** Phase 8 emits envelopes via `chrome.runtime.sendMessage` to the offscreen host; those envelopes never mutated `session._currentStepName` (verified: `grep -r "_currentStepName" extension/` returns zero hits). Phase 9 owns this write.
3. Wire `lattice.serialize` as additive sidecar at 2 of 16 `persist()` callsites (1840 tail + 2474 normal-iteration tail); restore at `runAgentLoop` entry (~1215).

Close audit gap G2 (lattice-runtime-adapter has zero importers in extension/* outside its own file; flag never set in production).

**Out of scope for Phase 9:**
- Phase 8 step.transition / receipt mint path — independent layer; Phase 9 sidecars but does not mutate.
- Phase 10 MCP-philosophy parity — independent layer.
- Lattice-side changes — Phase 9 has zero Lattice dependencies (SurvivabilityAdapter<TState> is already polymorphic per `lattice/packages/lattice/src/runtime/survivability.ts:169-176`); INV-06 frozen at Phase 5 SHA.
- Sidecar at all 16 `persist()` callsites — only 2 in-flight resumable sites; the other 14 are error/terminal paths where snapshots add no recovery value.
- User-facing config flag in options page — Phase 9 ships as code-only flag (mirrors Phase 6 bridge flag pre-Phase-7).

**Phase boundary anchor (ROADMAP.md Phase 9 entry):** "FSB SurvivabilityAdapter activated for MV3 SW eviction resumption (closes G2)"; locked decisions D-01..D-07 below.
</domain>

<decisions>
## Implementation Decisions

### Marker vocabulary bridge — `_currentStepName` writes (THE critical insight)

- **D-01:** Phase 9 explicitly writes `session._currentStepName` inside `runAgentIteration` using the Phase 5 attempt-1 vocabulary (`BEFORE_API_REQUEST` / `BEFORE_TOOL_EXECUTION` / `BEFORE_ITERATION` / `BEFORE_NEXT_ITERATION_SCHEDULE`) that the adapter's `resume()` at `extension/ai/lattice-runtime-adapter.js:244-256` already understands.

  Write sites (additive only; INV-04 byte-frozen — never inside setTimeout lambdas):
  - `session._currentStepName = 'BEFORE_API_REQUEST'` BEFORE the provider/bridge call (~`extension/ai/agent-loop.js:1820-1830` area).
  - `session._currentStepName = 'BEFORE_TOOL_EXECUTION'` immediately before each tool dispatch (just before the Phase 8 emission at line 1974).
  - `session._currentStepName = 'BEFORE_NEXT_ITERATION_SCHEDULE'` immediately before the setTimeout at 2498 (NOT inside the lambda — INV-04).

  Phase 8 emissions (`sendLatticeStepTransition` at lines 1861, 1974) use a DIFFERENT vocabulary (`LLM_TURN` / `TOOL_DISPATCH`) for observability; Phase 9's markers are for survivability ResumePolicy. The two vocabularies coexist — Phase 8 emits to offscreen for receipts, Phase 9 mutates `session` for serialize/resume.

  **Why two vocabularies:** Repurposing the adapter `resume()` to switch on Phase 8's vocabulary would require editing `lattice-runtime-adapter.js:244-256` + `tests/lattice-survivability-smoke.test.js` — breaking the Phase 5 contract documented at adapter JSDoc lines 217-229. Higher blast radius for no benefit; Phase 5 vocabulary already shipped + tested.

### Serialize call cadence + sites

- **D-02:** `lattice.serialize(session)` runs as an additive sidecar at the 2 in-flight resumable persist callsites only:
  - `extension/ai/agent-loop.js:1840` (emit-iteration-tail persist).
  - `extension/ai/agent-loop.js:2474` (post-iteration normal tail persist).

  The other 14 `persist()` callsites (error/safety/auth-fail terminal paths at 1880, 2102, 2121, 2203, 2239, 2360, 2423, 2456, 2544, 2558, 2587, etc.) are NOT sidecar-wrapped — they represent terminal states where `resume()` should return `ON_ERROR_*` regardless, and adding snapshots inflates `chrome.storage.session` writes without recovery benefit.

  Cadence rationale: adapter LRU cap default = 50 per sessionId (JSDoc at `lattice-runtime-adapter.js:76`). Sidecaring all 16 sites would thrash the cap during long sessions and evict last-good snapshots. Sidecaring at observability boundaries (Phase 8 emission sites) would double write frequency vs persist baseline and mix survivability cadence with observability cadence (Phase 8 D-02 kept these separate).

  Each sidecar wraps the call in defensive `if (typeof FSB_LATTICE_RUNTIME_ADAPTER_ENABLED !== 'undefined' && FSB_LATTICE_RUNTIME_ADAPTER_ENABLED)` guard + try/catch fire-and-forget (mirrors Phase 8 emission pattern).

### Deserialize/resume invocation site + flag flip mechanism

- **D-03:** `deserialize` + `resume` invoke at `runAgentLoop` entry (~`extension/ai/agent-loop.js:1215`, just before `runAgentIteration(sessionId, options)`).

  The entry guards via a lookup of `chrome.storage.session` keys matching prefix `fsb_lattice_snapshot_<sessionId>_*`. If a matching snapshot exists, deserialize → resume returns a ResumePolicy → branch behavior:
  - `SAFE` → proceed normally (no recovery needed; marker absent).
  - `ON_ERROR_SW_EVICTION_MID_REQUEST` → log structured event + proceed (the iterator will retry).
  - `ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH` → log structured event + proceed (tool result may be missing; iterator handles re-dispatch idempotency).
  - `RECOVERY_AMBIGUOUS` → log structured event + proceed with caution (caller-visible warning).
  - `SAFE_REPLAY` → proceed with full state restored.

  Flag flip mechanism: `globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED = true;` as a one-liner in `extension/background.js` immediately after `importScripts('ai/lattice-step-emitter.js')` at line 13 (so the global is set BEFORE any `runAgentLoop` invocation can fire from `chrome.runtime.onInstalled` at line 13142+).

  NOT in `extension/utils/config.js` — Phase 6's bridge flag set the precedent of code-only globals during the activation milestone, with options-page exposure deferred (Phase 7 stripped that flag entirely once stable).

### ResumePolicy classification mapping

- **D-04:** Phase 9 uses the FULL Phase 1 attempt-1 CONSERVATIVE mapping (mirroring `lattice-runtime-adapter.js:244-256` switch) without simplification:
  - `_currentStepName === 'BEFORE_API_REQUEST'` → `ON_ERROR_SW_EVICTION_MID_REQUEST`
  - `_currentStepName === 'BEFORE_TOOL_EXECUTION'` → `ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH`
  - `_currentStepName === 'BEFORE_ITERATION'` → `RECOVERY_AMBIGUOUS`
  - `_currentStepName === 'BEFORE_NEXT_ITERATION_SCHEDULE'` → `SAFE_REPLAY`
  - `marker === undefined` → `SAFE` (no snapshot or pre-Phase-9 session)

  Coarser mapping (any restored state → `SAFE_REPLAY`) defeats the audit framing — G2 needs ResumePolicy to discriminate. Per-session flag-gating defeats the milestone goal (FSB agent brain runs on Lattice runtime in production).

### Snapshot retention policy + LRU enforcement

- **D-05:** Phase 9 implements the JSDoc-documented LRU cap (default 50 per sessionId per `lattice-runtime-adapter.js:76`) as keep-latest-N with eviction-on-write. Currently the adapter file documents LRU as "follow-on" at lines 49-55 — Phase 9 IS that follow-on for v0.10.0.

  Implementation: at each `serialize` call, after writing the new snapshot under prefix `fsb_lattice_snapshot_<sessionId>_<capturedAt>`, list all keys with the same `<sessionId>` prefix, sort by `<capturedAt>` descending, delete entries beyond index 49.

  Without LRU enforcement, long sessions blow `chrome.storage.session` 10MB quota; `chrome.storage.session.set` raises `QUOTA_BYTES_PER_ITEM` and the adapter at line 137 only catches synchronous throws (not `runtime.lastError`). Silent failure window grows unboundedly.

### Phase split + UAT shape

- **D-06:** Phase 9 stays as a single phase with three plans:
  - **Plan 09-01:** Flag flip in `background.js` + runAgentLoop entry restore wiring (deserialize/resume + ResumePolicy branch) + Wave 0 smoke scaffold extension.
  - **Plan 09-02:** `_currentStepName` marker writes in `runAgentIteration` + serialize sidecars at 2 persist callsites + LRU enforcement + smoke Part 6 fill (5 sub-assertions: flag-on, restore round-trip, ResumePolicy for `BEFORE_API_REQUEST`, INV-04 byte-freeze, LRU cap eviction).
  - **Plan 09-03:** Documentation ceremony — REQUIREMENTS.md FINT-13/14/15 + LATTICE-PIN.md Phase 9 row (SHA unchanged per Phase 8 D-04 precedent) + audit doc G2 closure.

- **D-07:** Per-axis UAT-09 (~3-5 min Chrome MV3 reload session) DEFERRED to consolidated end-of-milestone UAT alongside UAT-08 + UAT-10 per user directive 2026-05-31 ("skip UAT to last"). Verifier emits `human_needed`; user runs all three UATs in a single Chrome session after Phase 10 ships.

  UAT-09 sub-assertions (to embed in 09-VERIFICATION.md Human Verification section):
  1. SW boot console shows `globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED === true`.
  2. Start one autopilot session; SW evict via `chrome.runtime.reload()` mid-iteration (or wait for natural eviction).
  3. Resume the session; SW console shows `lattice-runtime-adapter resume → ResumePolicy = ON_ERROR_SW_EVICTION_MID_REQUEST` (or whichever policy applies given the eviction-point marker).
  4. Iteration completes successfully after recovery.
  5. No INV-04 regression (`grep -c "setTimeout" extension/ai/agent-loop.js === 8`).
  6. LRU cap holds (write 51 snapshots; oldest evicted).

### Invariants preserved + verification

- **D-07 (continued):** Hard invariants this phase explicitly preserves:
  - **INV-01 MCP wire UNTOUCHED.**
  - **INV-02 Tool surface parity UNTOUCHED.**
  - **INV-03 Provider parity** — UNTOUCHED.
  - **INV-04 setTimeout iterator BYTE-FROZEN** — Phase 9 marker writes go INSIDE iteration body, never inside setTimeout lambdas. Plan verification asserts `grep -c "setTimeout" extension/ai/agent-loop.js === 8` post-phase + 4 iterator pattern matches + awk-scan empty for `_currentStepName` inside lambda body.
  - **INV-05 No deprecated module resurrection** — UNTOUCHED.
  - **INV-06 Lattice SHA frozen** — Phase 9 has zero Lattice dependencies; `SurvivabilityAdapter<TState>` already polymorphic per `survivability.ts:169-176`. Verified by Phase 8 D-04 precedent.

### Claude's Discretion

- Exact `chrome.storage.session.get` query shape for snapshot listing (filter at SDK level vs in-memory). Planner chooses based on storage API ergonomics.
- Whether LRU eviction runs synchronously (block serialize until eviction completes) or asynchronously (fire-and-forget). Planner chooses based on `chrome.storage.session.remove` Promise contract.
- Smoke Part 6 PASS count target — analyzer estimates 5+ assertions; planner sets the floor.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

**Phase 9 source-of-truth files:**
- `.planning/ROADMAP.md` (Phase 9 entry; INV statements)
- `.planning/PROJECT.md` (Lattice integration model + hard invariants)
- `.planning/REQUIREMENTS.md` (FINT-13/14/15 anticipated; FINT-10/11/12 from Phase 8 at lines 78-81)
- `.planning/v0.10.0-MILESTONE-AUDIT.md` (G2 status `documented_carryforward_low` — Phase 9 closes; G3 already closed in Phase 6)
- `.planning/LATTICE-PIN.md` (Phase 9 row gets SHA UNCHANGED; zero Lattice commits)

**Prior phase CONTEXT.md files (locked decisions):**
- `.planning/phases/05-mv3-survivability-bundler/05-CONTEXT.md` (SurvivabilityAdapter contract origin; D-22 carryforward gaps; FSB_LATTICE_RUNTIME_ADAPTER_ENABLED flag named; lattice-runtime-adapter.js created)
- `.planning/phases/08-fsb-agent-loop-runs-on-lattice-runtime-emit-step-transition-/08-CONTEXT.md` (D-04 INV-06 verdict; D-07 invariants; emission site precedents at 1861, 1974)
- `.planning/phases/08-fsb-agent-loop-runs-on-lattice-runtime-emit-step-transition-/08-RESEARCH.md` (Sections 7, 14 = degradation + smoke design templates Phase 9 mirrors)

**FSB-side source files (Phase 9 implementation surface):**
- `extension/ai/lattice-runtime-adapter.js` (the standalone adapter awaiting activation; ResumePolicy switch at 244-256; storage prefix `fsb_lattice_snapshot_<sessionId>_<capturedAt>` at line 75; LRU JSDoc at 76; restored-mode branch comment at 41-46; JSDoc contract at 217-229)
- `extension/ai/agent-loop.js` (lines 1175-1230 for runAgentLoop entry restore site; 1820-1830 for BEFORE_API_REQUEST marker; 1840 for first persist sidecar; 1974 for BEFORE_TOOL_EXECUTION marker adjacent to Phase 8 TOOL_DISPATCH emission; 2474 for second persist sidecar; 2498 for BEFORE_NEXT_ITERATION_SCHEDULE marker; 4 setTimeout callsites at 1881/2498/2567/2577 for INV-04 byte-freeze regression)
- `extension/background.js` (line 13 importScripts of Phase 8 emitter — Phase 9 adds flag-flip one-liner immediately after)
- `extension/offscreen/lattice-host.js` (BYTE-FROZEN — Phase 9 has no offscreen-side changes)

**Lattice-side source files (read-only reference):**
- `lattice/packages/lattice/src/runtime/survivability.ts` (lines 60-68 ResumePolicy enum; lines 169-176 SurvivabilityAdapter<TState> polymorphic interface confirming no extension needed)

**Test files (Phase 9 will extend):**
- `tests/lattice-survivability-smoke.test.js` (existing standalone smoke; Phase 9 adds Part 6 covering activation + LRU + ResumePolicy classification — estimated 5+ new assertions)
- `tests/lattice-step-emitter-smoke.test.js` (Phase 8 baseline 38 PASS — Phase 9 must not regress)

**Lattice version pin:**
- Lattice branch: `fsb-integration-experiments` HEAD `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (FROZEN — zero Lattice-side commits).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`lattice-runtime-adapter.js`** entire module is shipped + tested (Phase 5 + standalone smoke 40 PASS). Phase 9 only ACTIVATES it — no code changes inside the adapter itself.
- **Phase 8 defensive guard pattern** at `agent-loop.js:1861, 1974` — `if (typeof X === 'function')` + try/catch + fire-and-forget. Phase 9 marker writes + serialize sidecars reuse this verbatim.
- **Phase 6 flag-flip-in-background.js pattern** — `globalThis.FSB_LATTICE_PROVIDER_BRIDGE_ENABLED = true` was the precedent. Phase 9 mirrors with `FSB_LATTICE_RUNTIME_ADAPTER_ENABLED`.
- **`lattice-survivability-smoke.test.js` Parts 1-5** — already cover surface + factory + serialize round-trip + flag-on persistence + carryforward freezes. Phase 9 only adds Part 6.

### Established Patterns

- **Phase 5 attempt-1 vocabulary** (BEFORE_API_REQUEST / BEFORE_TOOL_EXECUTION / BEFORE_ITERATION / BEFORE_NEXT_ITERATION_SCHEDULE) is what the adapter's `resume()` already understands. Phase 9 uses this verbatim — coexists with Phase 8's observability vocabulary (LLM_TURN / TOOL_DISPATCH).
- **persist() callsite distinction** — only 2 of 16 represent in-flight resumable state (lines 1840 + 2474); the other 14 are terminal error paths.
- **LRU cap = 50 per sessionId** — documented in JSDoc at adapter line 76; Phase 9 enforces it.
- **chrome.storage.session 10MB quota** — without LRU enforcement, long sessions silently drop writes.

### Integration Points

- **runAgentLoop entry (line 1215)** — the ONLY structural restore site. `runAgentIteration` calls inside setTimeout iterator are continuations, not cold-restart entries.
- **`chrome.runtime.onInstalled` (background.js line 13142+)** — fires before user-driven sessions; flag must be set at line 13 to precede this.
- **Phase 8 emission sites at 1861, 1974** — Phase 9 marker writes are SIBLING calls, not replacements. Both layers fire per iteration.

</code_context>

<specifics>
## Specific Ideas

- "ROADMAP brief at line 368 is aspirational; Phase 9 must own the `_currentStepName` write" (analyzer finding, 2026-05-31).
- Per-axis UAT-09 DEFERRED to consolidated end-of-milestone UAT per user 2026-05-31 ("skip UAT to last").
- LRU cap enforcement closes the silent-failure window the adapter file explicitly noted at lines 49-55 as "follow-on".

</specifics>

<deferred>
## Deferred Ideas

- **Options-page user-facing toggle** for `FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` — out of scope; matches Phase 6/7 flag pattern which kept activation flags code-only during activation milestones.
- **Recovery dispatcher rewiring** (the CONSERVATIVE recovery dispatcher with full per-policy branch behavior) — out of scope per Phase 5 05-CONTEXT.md D-22 ("CONSERVATIVE recovery dispatcher EXPLICITLY OUT OF SCOPE"). Phase 9 only emits the ResumePolicy verdict + logs; full recovery behavior is v0.11.0+.
- **`chrome.storage.local` override** for snapshot persistence beyond session lifetime — out of scope per Phase 5 D-22 ("chrome.storage.local override TODO").
- **Migrating Phase 8 emissions to ALSO write `_currentStepName`** for vocabulary unification — rejected per D-01; two-vocabulary separation preserves Phase 5 contract + lower blast radius.

### Reviewed Todos (not folded)

- None.

</deferred>
