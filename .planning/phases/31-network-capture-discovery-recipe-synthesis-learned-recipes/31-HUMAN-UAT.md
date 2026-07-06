---
phase: 31-network-capture-discovery-recipe-synthesis-learned-recipes
plan: 06
status: partial
result: pending
created: 2026-06-22
---

# Phase 31 Plan 06 Human UAT: Live Capture -> Synthesize -> Promote -> Outrank Smoke

This is the irreducibly-live half of the Phase-31 discovery loop (31-06, Task 3). It was NOT executed in the autonomous, no-live-browser run and must not be treated as passed until a human records the observed result. It is recorded here as `human_needed` / `result: pending` live-UAT, matching the Phase 27/28/29/30 posture (the live half is documented debt, not a fabricated pass; it does NOT block the headless CI gate).

## Why this is human_needed (not CI-provable)

The discovery loop's live confirmation needs a real Chrome extension load, a real authenticated first-party session, and the real `chrome.debugger` Network-domain attach -- none of which can run in the headless CI gate. The CI suite proves every FSB-owned property of this loop headlessly:

- `tests/network-capture.test.js`, `network-capture-consent.test.js`, `network-capture-redaction.test.js` prove the consent gate runs BEFORE any debugger attach, the same-origin XHR/Fetch filter, the capture-time shape-only redaction (no body / no header values / no query / no PII), and that no response body is ever fetched.
- `tests/recipe-synthesizer.test.js` proves the closed-vocab synthesis + `validateRecipe` gate (a non-conforming synthesis yields no recipe), and the `authStrategy` cap to declaratively-executable strategies.
- `tests/learned-promote-after-replay.test.js` proves promote-after-replay (D-10): a CLEAN replay through the injected interpret/execute path stores the recipe; a failed interpret OR a failed execute discards it; the replay threads `{trustedProvenance:'local'}`.
- `tests/learned-recipe-store.test.js` proves the per-origin versioned store + LRU + quarantine (and, after 31-06, the synchronous `getLearnedSync` mirror with hard origin-scope + quarantine-awareness + SW-restart hydration).
- `tests/learned-search-add.test.js` proves `addLearnedRecipe` feeds the one MiniSearch index + the slug->recipe map with a bumped snapshot (findable on the next visit).
- `tests/learned-t2-outranking.test.js` proves the catalog resolves a learned T2 recipe FIRST (outranking a generic T1b) and the router dispatches it through the declarative tier with the `'local'` vouch. After 31-06's `getLearnedSync` mirror, an inline harness confirms `capability-catalog.resolve` returns T2 via the REAL store at runtime (the 31-05 production stub is closed).
- `tests/tool-definitions-parity.test.js` + `tests/capability-mcp-surface.test.js` prove the `mcp:capabilities-discover` route stayed OUT of TOOL_REGISTRY (INV-01 hash unmoved); `capability-autopilot-parity` (INV-02) and `agent-loop-iterator-guard` (INV-04) are unregressed; `git diff --quiet manifest.json` holds (no manifest change, DISC-02).

The ONE class of property the CI suite CANNOT prove is the live end-to-end loop: that on a real authenticated origin a real first-party XHR/Fetch is observed by the live `chrome.debugger` Network attach, redacted, synthesized, replayed through the live MAIN-world credentialed fetch, promoted, and then OUTRANKS the generic recipe on the next visit -- and that the "FSB started debugging this browser" banner appears and clears at session end, while nothing secret is persisted.

## Setup

1. Load `extension/` as an unpacked Chrome extension (per the project FSB browser-automation policy, drive these via the FSB MCP browser tools).
2. Sign in to a supported origin (e.g. `https://github.com`) so first-party HttpOnly cookies are present.
3. Trigger a discovery session on that origin via the internal `mcp:capabilities-discover` route / control surface.
4. NEVER record or paste a real token / cookie / credential value into this file -- record only the observed shape, redacted.

## Required Scenarios

| ID | Procedure | Expected Outcome | Status |
|----|-----------|------------------|--------|
| UAT-31-01 | (a) Trigger a discovery session on the signed-in origin. Confirm the "FSB started debugging this browser" banner appears (expected, per RESEARCH Pitfall 2) and CLEARS promptly at session end (no lingering banner, no broken Input emulation). (b) Within the session bound, perform an action on the page that fires a SAME-ORIGIN XHR/Fetch API call. (c) Confirm a learned recipe is synthesized + promoted with NO errors (the discovery summary reports a non-empty `promoted` list). (d) On the NEXT visit to that origin, confirm the learned recipe is FINDABLE via `search_capabilities` and OUTRANKS the generic recipe during routing (it dispatches as the T2 tier). (e) Inspect the `fsbLearnedRecipes` chrome.storage.local key and confirm the stored shape carries request SHAPE ONLY -- method, path-template, header NAMES, origin, extract -- and NO secret / body / query / header-value (redacted to shape, never a literal). | The banner appears and clears cleanly without disrupting Input emulation; a same-origin API call is captured, redacted, synthesized, replayed through the live credentialed fetch, and promoted; the learned recipe is findable and outranks the generic on the next visit; the stored envelope is shape-only with zero persisted secrets. | human_needed |

## Recording Results

When executed, replace the `human_needed` status (and the frontmatter `status: partial` / `result: pending`) with `pass`, `fail`, or `partial` / a recorded result, and add the date, Chrome version, extension commit, and a short observed-outcome note (whether the banner appeared and cleared, whether a learned recipe was promoted, whether it outranked the generic on the next visit, and that the stored envelope carried no secret field -- redacted to shape, never a literal token / cookie / credential). Before recording, re-verify the loop at run time. Do NOT mark the 31-06 live smoke complete until UAT-31-01 has a recorded outcome (or a documented deferral). The headless CI gate (the nine Phase-31 suites + the INV-01/02/04 proofs + the recipe-path guard) does NOT depend on this step.
