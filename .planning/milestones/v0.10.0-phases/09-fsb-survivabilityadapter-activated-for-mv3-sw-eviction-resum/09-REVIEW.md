---
phase: 09-fsb-survivabilityadapter-activated-for-mv3-sw-eviction-resum
reviewed: 2026-05-31T13:21:20Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - extension/background.js
  - extension/ai/agent-loop.js
  - extension/ai/lattice-runtime-adapter.js
  - tests/lattice-survivability-smoke.test.js
  - tests/lattice-provider-bridge-smoke.test.js
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: clean
---

# Phase 9: Code Review Report

**Reviewed:** 2026-05-31T13:21:20Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** clean

## Summary

All 10 high-leverage Phase 9 invariants verified end-to-end against the source. No critical or warning findings; 3 advisory info notes recorded below.

Verification matrix:

- **INV-04 byte-freeze (deferred-iterator schedule):** Total `setTimeout` token count in `extension/ai/agent-loop.js` = 8 (4 pre-existing prose mentions at lines 5, 1292, 2590 + 1 sleep helper at 1450 + 4 iterator callsites at 1955, 2593, 2662, 2672). The 4 iterator-callsite lambda bodies are byte-identical: `function() { runAgentIteration(sessionId, options); }`. Zero `_currentStepName` writes or `session._latticeAdapter.serialize` calls inside any deferred-iterator schedule lambda body (regex `setTimeout\(function\s*\(\s*\)\s*\{[^}]*_currentStepName[^}]*\}` returns no match; same for `serialize`). Marker `BEFORE_NEXT_ITERATION_SCHEDULE` is written OUTSIDE the schedule lambda at line 2589, immediately before line 2593's iterator call.
- **SAFE_REPLAY guardrail (INV-06):** Zero `SAFE_REPLAY` literals in `agent-loop.js` AND `lattice-runtime-adapter.js`. The 4-policy Lattice ResumePolicy union (`SAFE` / `RECOVERY_AMBIGUOUS` / `ON_ERROR_SW_EVICTION_MID_REQUEST` / `ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH`) is frozen; adapter `resume()` (lines 281-307) returns only members of that union.
- **Sidecar count:** Exactly 2 invocations of `session._latticeAdapter.serialize(session)` at line 1912 (Site A: end_turn tail) and line 2561 (Site B: normal-iteration tail). The focus-area brief listed line numbers 1840 + 2474 which are stale; the structural sites (end_turn vs normal-iteration in-flight tails per 09-CONTEXT.md D-02) are correct. The other 14 terminal persist sites in `agent-loop.js` (auth/400/finalizeSession paths, etc.) were NOT touched.
- **Defensive guards on all 3 markers + 2 sidecars:** All 5 sites are wrapped in the uniform `typeof FSB_LATTICE_RUNTIME_ADAPTER_ENABLED !== 'undefined' && FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` check (CONTEXT.md D-20 pattern). The 2 serialize sidecars at lines 1907-1914 and 2556-2563 additionally check `session._latticeAdapter && typeof session._latticeAdapter.serialize === 'function'` and wrap in fire-and-forget try/catch. Marker writes are intentionally always-on per the Phase 9 commentary at lines 1757-1759 (cheap property assignment; the flag only gates the DOWNSTREAM serialize sidecar).
- **LRU cap correctness:** `enforceLruCap` (lattice-runtime-adapter.js:136-162) sorts keys lexicographically over `STORAGE_KEY_PREFIX + sessionId + '_' + ISO-8601`; since the prefix is fixed per sessionId and ISO-8601 sorts chronologically, oldest-first ordering is correct. Edge cases: `matches.length <= cap` returns early (handles single-snapshot, empty, and exact-cap boundaries). `storage.remove` failures surface via `chrome.runtime.lastError` which is logged-and-swallowed; the comment at lines 132-134 documents the idempotent re-attempt on next serialize. Verified by Part 6.5 (51 writes / 50 retained).
- **Adapter stash singleton:** `session._latticeAdapter = adapter` set once at runAgentLoop entry (line 1249) inside the flag-gated block. Both sidecars (lines 1909, 2558) consume the stash via property read with truthiness guard. No second-construction site.
- **4-policy mapping:** All 4 markers in adapter `resume()` map cleanly: `BEFORE_API_REQUEST` -> `ON_ERROR_SW_EVICTION_MID_REQUEST`, `BEFORE_TOOL_EXECUTION` -> `ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH`, `BEFORE_ITERATION` / `BEFORE_NEXT_ITERATION_SCHEDULE` / `undefined` -> `SAFE`. Phase 6.3 in the survivability smoke asserts this mapping for all 4 cases.
- **No emojis:** `grep` for the standard emoji glyph set across all 5 reviewed files: zero hits.
- **Comment hygiene:** New Phase 9 comments at agent-loop.js:1932 + 2586-2588 correctly use the "deferred-iterator schedule" synonym. The remaining `setTimeout` tokens in comments at lines 5, 1292, 2590 are PRE-EXISTING (file-level docstring, Phase 8 iteration-pattern doc, and the historical `// p. Schedule next iteration via setTimeout` lifecycle step label). No newly-introduced Phase 9 comment contains the literal `setTimeout` token.

Test scaffolds (`lattice-survivability-smoke.test.js` Parts 6.1-6.6 + `lattice-provider-bridge-smoke.test.js` gap-check expansion from `2 -> 8` with broadened intervening-line acceptance) faithfully encode each of the invariants above as runtime assertions. The provider-bridge gap-check tolerance of `gap <= 8` is exactly at the actual measured gap (background.js bridge at line 12, ai-integration at line 20, gap = 8), so the bound has zero headroom for further additions without a test update; this is intentional given the byte-frozen ethos.

## Info

### IN-01: enforceLruCap and _findLatestSnapshot perform full-storage scans via storage.session.get(null, cb)

**File:** `extension/ai/lattice-runtime-adapter.js:139`, `extension/ai/agent-loop.js:1109`
**Issue:** Both helpers list ALL keys in `chrome.storage.session` then filter by the `fsb_lattice_snapshot_<sessionId>_` prefix in JS. With many concurrent sessions or unrelated session-scoped data, this is an O(N_total_keys) scan on each serialize (eviction sweep) and on each runAgentLoop entry (restore probe). Functionally correct, and the prefix filter keeps the working set small, but a per-sessionId index-key (e.g. `fsb_lattice_snapshot_index_<sessionId>` holding an array of capturedAt values) would avoid the full scan if Phase 10+ ever sees higher concurrency.
**Fix:** No action required for Phase 9. Consider as a Phase 10+ optimization if eviction sweep latency becomes observable. Document in CONTEXT.md `deferred_ideas` if not already captured.

### IN-02: adapter stash re-assigns session._latticeAdapter on every runAgentLoop entry

**File:** `extension/ai/agent-loop.js:1249`
**Issue:** `session._latticeAdapter = adapter;` is executed unconditionally inside the flag-gated block, so if `runAgentLoop(sessionId, options)` is invoked a second time for the same session (e.g. a future explicit "resume" entry point), a new adapter instance is constructed and the previous instance is dropped. The two instances share the same `sessionId` and storage prefix, so behavior is idempotent — but registered `onEviction` hooks on the previous instance would be silently orphaned. No current code path registers eviction hooks against the agent-loop-side stash, so this is latent-only.
**Fix:** No action required. If a future phase wires eviction hooks against `session._latticeAdapter`, guard with `if (!session._latticeAdapter) { ... = adapter; }` to preserve hook registrations across re-entries.

### IN-03: provider-bridge gap-check bound has zero headroom (gap == 8, bound `<= 8`)

**File:** `tests/lattice-provider-bridge-smoke.test.js:553`
**Issue:** The bridge -> ai-integration gap in `background.js` is now exactly 8 (bridge at line 12, ai-integration at line 20). The assertion bounds `gap >= 1 && gap <= 8` are at the upper boundary; any future Phase 10+ change adding a single additional comment line or importScripts entry between these two anchors will flip the smoke red. This is intentional per the Phase 5 D-17 byte-frozen ethos (every line in the gap is audited), but a follow-on phase should expect to update both the bound AND the intervening-line acceptance regex in lockstep.
**Fix:** No action required for Phase 9. Future phases editing this region must update `gap <= 8` together with the importScripts/comment-line classification block at lines 554-560.

---

_Reviewed: 2026-05-31T13:21:20Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
