# Phase 14 - Deferred Items (out-of-scope discoveries during execution)

> Logged per the executor SCOPE BOUNDARY rule: issues NOT directly caused by this
> plan's changes are recorded here and left unfixed.

## Pre-existing `npm test` chain failure (NOT caused by Plan 14-01)

- **Discovered during:** Plan 14-01, Task 2 (`npm test` full-chain verification).
- **Failing test:** `tests/mcp-philosophy-parity-smoke.test.js` -- `Part 9.6 -- REQUIREMENTS.md INV-02 wording extension landed (Phase 10 ceremony Plan 10-03 Task 1)` (`36 PASS / 1 FAIL`).
- **Chain position:** index 122 of 131; the `&&` chain short-circuits here, BEFORE the newly-appended `tests/trigger-store.test.js` at index 130.
- **Evidence it is pre-existing / out-of-scope:**
  - The test asserts `.planning/REQUIREMENTS.md` INV-02 wording from a **v0.10.0 Phase 10** Lattice ceremony -- unrelated to the Phase 14 trigger family.
  - Neither `tests/mcp-philosophy-parity-smoke.test.js` nor `.planning/REQUIREMENTS.md` were modified by Plan 14-01 (clean `git status`).
  - The test fails identically in isolation (`node tests/mcp-philosophy-parity-smoke.test.js` -> exit 1, same Part 9.6 FAIL) with NONE of this plan's changes in play.
  - It is the **only** FAIL in the entire chain log.
- **Proof Plan 14-01's wiring is correct despite the short-circuit:** running every chain entry from index 122 to the end (continuing past the pre-existing failure) shows all of them PASS, including `tests/trigger-store.test.js` (10/10, exit 0). No prior test regressed.
- **Disposition:** NOT fixed (out of scope -- belongs to the v0.10.0 / Phase 10 REQUIREMENTS.md surface, a different milestone). Flag for the milestone owner / a future Phase 10 follow-up. It does not affect the correctness, survivability, or wiring of the trigger-store substrate delivered by Plan 14-01.
