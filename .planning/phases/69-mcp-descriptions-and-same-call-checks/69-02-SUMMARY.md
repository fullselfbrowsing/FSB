---
phase: 69-mcp-descriptions-and-same-call-checks
plan: 02
subsystem: mcp
tags: [mcp, tools-list, descriptions, budget, must-keep, shape-freeze, change-report]

# Dependency graph
requires:
  - phase: 69-mcp-descriptions-and-same-call-checks
    provides: "69-01: frozen 8a058bdf fixture, tests/helpers/mcp-in-process.mjs (readBaselineFixture, projectShape, EXPECT_TOOL_NAMES_VERBATIM), shape freeze, report-only budget suite, 69-SWEEP-BASELINE.json"
  - phase: 66.1-mcp-settings-tool
    provides: "tests/mcp-settings-tool-contract.test.js with BASELINE_8A058BDF_TOOLS_DIGEST (migrated here per D-22)"
provides:
  - "mcp/src/tools/descriptions.ts: MCP_TOOL_DESCRIPTIONS (37 manual-site entries), MCP_PARAM_DESCRIPTIONS (35 overrides on 15 tools), MCP_COMMON_PARAM_DESCRIPTIONS (tab_id/visual_reason/client/is_final), MCP_CHANGE_REPORT_SENTENCE, MCP_EXPECT_DESCRIPTION, and the never-throwing lookups hasMcpToolDescription / mcpToolDescription / mcpParamDescriptions / mcpParamDescription"
  - "jsonSchemaToZod(inputSchema, paramDescriptions?): description-only override, byte-identical without the map"
  - "registerManualTools publishes module text for the 37 registry action tools, plus the one-sentence change-report suffix on the 32 _emitChangeReport tools"
  - "tests/mcp-description-budget.test.js: per-tool 2,048-character cap ON over every live tool; manual-site coverage, no-orphan, forbidden-substring, first-sentence search-term, client-label and MANUAL_SITE_CHAR_BUDGET checks; MUST_KEEP table (8 rows) and SEARCH_TERM_SYNONYMS"
  - "tests/mcp-settings-tool-contract.test.js: the 66.1 tools/list freeze migrated to name + description-free shape equality against the fixture; BASELINE_8A058BDF_TOOLS_DIGEST now asserted on the fixture"
affects: [69-04, 69-06, 69-07, 69-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MCP-only text applied at registration: registry text is the fallback argument, module text wins, so autopilot prompts and the four registry hash pins never move"
    - "Common parameter text merged per tool (common record, then per-tool overrides) and passed as jsonSchemaToZod's override map"
    - "Must-keep rows address their text by `where` (tool:/param:/common:/const:) so later plans append rows without new plumbing"

key-files:
  created:
    - mcp/src/tools/descriptions.ts
  modified:
    - mcp/src/tools/schema-bridge.ts
    - mcp/src/tools/manual.ts
    - tests/mcp-description-budget.test.js
    - tests/mcp-settings-tool-contract.test.js

key-decisions:
  - "The lookups never throw (plan decision, overriding PATTERNS' throwing accessor): a missing module entry falls back to the registry text so the server still starts; coverage is enforced by the budget suite"
  - "close_tab overrides the common tab_id text ('Tab to close; ...') because its tab_id names the tab to close; open_tab has no tab_id and switch_tab uses tabId, so the common text reaches 34 of the 37 tools"
  - "The forbidden-substring check is ON for the 37 manual-site tools and for every module string; on the other live tools it is report-only (14 hits today) until plan 69-04 rewrites them"
  - "The client text names Claude, Codex, Cursor, ChatGPT, Gemini, VS Code, Copilot and Windsurf (125 characters, over the ~100 target, because all eight labels are required); the suite also proves the server really folds case, spaces, _ and -"
  - "The change-report suffix drops the truncated/read_page sentence: the response itself carries change_report_hint when truncated, and 32 copies of that sentence cost about 3 K characters"

patterns-established:
  - "Plan 69-04 extends MCP_TOOL_DESCRIPTIONS / MCP_PARAM_DESCRIPTIONS for the remaining 35 tools, appends MUST_KEEP rows, widens the forbidden-substring check to every live tool, and flips GATES.budgetFloors / GATES.fullCoverage"
  - "Plan 69-06 imports MCP_EXPECT_DESCRIPTION (151 characters, at most 160) for the published `expect` property"

requirements-completed: [MCP-01, MCP-04]

# Metrics
duration: 12min
completed: 2026-10-15
---

# Phase 69 Plan 02: MCP description module and the manual action tools Summary

**The 37 registry action tools now publish short MCP-only text from `mcp/src/tools/descriptions.ts`. Their subtotal fell from 63,227 to 22,541 characters, against a 26,000 budget. The safety guidance survives, proven by an 8-row must-keep table. The per-tool 2,048-character cap is on. The registry and its four hash pins are untouched, and the Phase 66.1 freeze moved from description equality to name and shape equality in the same commit.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-15T13:04:38Z
- **Completed:** 2026-10-15T13:16:32Z
- **Tasks:** 3 of 3
- **Files modified:** 5 (1 created, 4 modified)

## Budget report (in-process, current build after Task 3)

Token figures are `ceil(chars/4)` and `ceil(bytes/4)` estimates, not tokenizer counts (V4).

| Measure (72 baseline names) | Baseline 8a058bdf | Current | Change |
|---|---:|---:|---:|
| Description chars | 54,024 | 25,159 | -53.4% |
| Parameter-description chars | 34,217 | 22,396 | -34.5% |
| Total chars | 88,241 | 47,555 | -46.1% |
| Estimate: tokens (chars/4) | 22,061 | 11,889 | -46.1% |
| Canonical bytes of `{tools}` | 121,379 | 80,545 | -33.6% |
| Estimate: tokens (bytes/4) | 30,345 | 20,137 | -33.6% |

- **Manual-site subtotal (the 37 `registerManualTools` tools):**
  - It is **22,541 characters**: 8,112 description characters (including the 32 copies of the change-report sentence) plus 14,429 parameter-description characters.
  - The budget is 26,000, which leaves 3,459 characters of headroom.
  - It was 63,227 (36,977 + 26,250), so it fell by 64.3%.
  - Canonical bytes for these 37 tools fell from 83,564 to 42,730.
- **Per-tool cap:** 0 of 73 live tools exceed 2,048 characters. `execute_js` fell from 2,187 to 612. The longest descriptions now are `back` (1,934), `partial_task` (1,135), `run_task` (946), `capture_screenshot` (783) and `complete_task` (677); all of them belong to plan 69-04.
- **Settings line:** unchanged at 151 description characters and 63 parameter-description characters (514 bytes).
- **Report-only gates**, which plan 69-04 turns on:
  - `budgetFloors` shows a 46.1% character cut (floor 50%) and a 33.6% byte cut (floor 20%).
  - `fullCoverage` shows that 35 of 72 baseline tools still publish their 8a058bdf text.
  - Today there are 14 forbidden-substring hits on the other live tools.
- **PROJECT.md target** (more than a 50% tool-list token-estimate cut): **NOT MET (33.6%)**. This is reported and not gated, as D-06 directs.
- **Common text lengths:** `tab_id` 102, `visual_reason` 34, `client` 125 and `is_final` 40 characters. `MCP_CHANGE_REPORT_SENTENCE` is 98 characters, down from the 433-character suffix. `MCP_EXPECT_DESCRIPTION` is 151 characters (cap 160).

## Accomplishments

- **`mcp/src/tools/descriptions.ts`:**
  - It holds one MCP-only text module, written to D-07 and D-09:
    - The first sentence of each tool description carries its search terms.
    - The multi-agent and `TAB_NOT_OWNED` rule is written once, in the common `tab_id` text.
    - No "Multi-agent:" sentence, cap boilerplate or source-file pointer remains.
    - Typed error codes appear only where a caller must branch on them.
  - The must-keep guidance survives:
    - `close_tab`: the active-tab refusal and `allow_active`;
    - `select_option`: native `<select>` only, with the two-click pattern for custom dropdowns;
    - `execute_js`: when to fall back to `click`, `type_text`, `drag_drop`/`drag` and a native submit click;
    - `upload_file`: the secret-path denylist and the audit log.
  - It has 35 parameter overrides on 15 tools, which shorten long text such as `click.text`, `open_tab.active`, `upload_file.file_path` and the `drag_variable_speed` coordinates. Short registry parameter text falls through unchanged.
- **`jsonSchemaToZod`** takes an optional `paramDescriptions` map. It changes only the `.describe()` argument and keeps the `.describe` → `.default` → `.optional` order and every type branch.
- **`registerManualTools`:**
  - It passes `mcpParamDescriptions(tool.name)` and `mcpToolDescription(tool.name, tool.description)`.
  - `CHANGE_REPORT_DESCRIPTION_SUFFIX` is now `` ` ${MCP_CHANGE_REPORT_SENTENCE}` ``, and its Phase 245 comment is trimmed to two lines.
  - The `TRIGGER_MANUAL_EXCLUSIONS` pins, the handler body and its `(params) => …` signature are unchanged, and the file contains no `delegationId`.
- **The budget suite** checks these items on every run:
  - every manual-site tool's published description equals its module text, plus the sentence when `_emitChangeReport` is set;
  - no manual-site tool keeps its long text;
  - every parameter publishes its per-tool text, else the common text, else the registry text;
  - the common parameters are the common text unless overridden;
  - none of `Multi-agent:`, `mcp/src/` or `MCP_VISUAL_CLIENT_LABELS` appears on the manual site or in any module string;
  - the first sentence carries a search term;
  - every label the client text names is on the allowlist, and the server accepts case, space, `_` and `-` variants;
  - there are no orphan module keys;
  - the manual-site subtotal is within budget;
  - the 8-row `MUST_KEEP` table passes;
  - the change-report sentence never says "then retry.".
- **The 66.1 freeze**, which D-22 migrates in the same commit as the first published description change:
  - The current-build digest comparison is gone. In its place:
    - the sorted names minus `settings` equal the fixture names;
    - each tool's `projectShape` equals the fixture's, with `expect` allowed only on the 29 D-12 names.
  - `BASELINE_8A058BDF_TOOLS_DIGEST` is kept and is now asserted on `toolsListDigest(readBaselineFixture().tools)`.
  - The `TOOL_REGISTRY`, prompt-table, `fsb://config` and settings-tool assertions are unchanged. The suite reports 281 passed.

## Task Commits

1. **Task 1: Description module skeleton, common text, and the `jsonSchemaToZod` override (wire unchanged)**: `f3883eb8` (feat)
2. **Task 2: Short text for the 37 manual-site tools (written, not yet wired)**: `d2aab1a4` (feat)
3. **Task 3: Wire `manual.ts`, cap on, coverage and must-keep checks, and the 66.1 freeze migration (one commit)**: `5b32b4d8` (feat)

**Plan metadata:** see the docs commit that adds this SUMMARY.

## Files Created/Modified

- `mcp/src/tools/descriptions.ts` (new): the MCP-only text tables and lookups. It is all ASCII, contains no `z.number(` (A11 guard) and imports nothing from the extension.
- `mcp/src/tools/schema-bridge.ts`: the optional `paramDescriptions` argument. `PARAM_TRANSFORMS` and `TOOL_REGISTRY` are untouched.
- `mcp/src/tools/manual.ts`: the registration wiring and the one-sentence suffix.
- `tests/mcp-description-budget.test.js`: cap on, the manual-site checks, `MUST_KEEP`, `SEARCH_TERM_SYNONYMS` and `MANUAL_SITE_CHAR_BUDGET = 26000`. `budgetFloors` and `fullCoverage` stay false.
- `tests/mcp-settings-tool-contract.test.js`: the migrated tools/list freeze.

No force-tracked `mcp/build` file is produced by these sources, so no build file was committed.

## Verification

- **Task 1 and Task 2 `<verify>` chains:** all exit 0, and the wire was byte-identical after each. The unmodified 66.1 digest assertion still passed at `f3883eb8` and at `d2aab1a4`.
- **Task 2 acceptance:**
  - all 37 names have module text, and the module contains no forbidden substring;
  - `git diff --quiet -- mcp/src/tools/manual.ts tests/mcp-settings-tool-contract.test.js` exited 0 before Task 3.
- **Task 3 `<verify>`:** all 8 suites exit 0. They are `mcp-description-budget` (30 passed), `mcp-tools-list-shape-freeze`, `mcp-settings-tool-contract` (281 passed), `trigger-tool-dispatcher`, `agent-scope`, `visual-session-schema-lock`, `mcp-numeric-param-coercion` and `tool-definitions-parity`.
- **Acceptance greps:**
  - `perToolDescriptionCap: true` 1, `budgetFloors: false` 1, `MANUAL_SITE_CHAR_BUDGET = 26000` 1;
  - old suffix text in `manual.ts` 0, `mcpParamDescriptions(tool.name)` 1, `delegationId` 0;
  - the freeze file keeps `BASELINE_8A058BDF_TOOLS_DIGEST`, and its only `toolsListDigest(` call is on the fixture.
- **The registry is untouched:** `git diff --quiet 8a058bdf -- extension/ai/tool-definitions.js mcp/ai/tool-definitions.cjs` exits 0 after every task. All four registry hash-pin suites pass unmodified: `tool-definitions-parity`, `capability-mcp-surface`, `capability-autopilot-parity` and `recipe-schema-lock`.
- **RED proofs** (run, not committed):
  - **Budget suite.** The extended suite failed 9 checks on the unwired build: the cap (`execute_js` 2,187), description equality, long text kept, parameter text, common parameters, forbidden substrings, first-sentence terms (`hover`, `right_click` on registry text), the 63,227 subtotal, and the `upload_file` row.
  - **Migrated 66.1 freeze.** I changed `hover.selector.type` in a copy-backed fixture. The freeze failed, naming `hover` in both the fixture-digest and the shape check. The fixture was restored byte for byte (`git diff --quiet -- tests/fixtures` exits 0).
- **Node 20** (`/tmp/fsb-node20/node-v20.20.2-darwin-arm64/bin/node`): `mcp-description-budget`, `mcp-tools-list-shape-freeze`, `mcp-settings-tool-contract`, `visual-session-schema-lock` and `trigger-tool-dispatcher` all exit 0.
- **Regression sweep:** `node scripts/bench/sweep-tests.mjs --files mcp/src/tools/manual.ts mcp/src/tools/schema-bridge.ts --baseline .../69-SWEEP-BASELINE.json` was run in the background with 7225 held.
  - It selected **33** tests, not the planned 31, because the two edited suites now mention these basenames.
  - **33 of 33 passed**, there were **no new failures** against the baseline, and it exited 0.
  - None of the baseline's 3 pre-existing failures was selected.
- **Wave gate** (once, after Task 3). Every command exits 0:

  | Command | Exit |
  |---|---:|
  | `npm run test:screenshot` | 0 |
  | `npm run test:mcp-smoke:tools` | 0 |
  | `node tests/mcp-visual-session-contract.test.js` | 0 |
  | `node tests/mcp-dispatcher-client-label.test.js` | 0 |
  | `node tests/agent-id-threading.test.js` | 0 |
  | `node --test tests/hung-page-recovery.test.js` | 0 |
  | `node tests/capability-mcp-surface.test.js` | 0 |
  | `node tests/capability-autopilot-parity.test.js` | 0 |
  | `node tests/recipe-schema-lock.test.js` | 0 |

- **Full chain (tolerant runner):** `node /tmp/fsb-tolerant-runner.mjs /tmp/p6902-full`, run after Task 3, took 4.1 minutes on Node 24 with 7225/7226 held.
  - It ran 327 commands (16 pretest plus 311 test), and **326 exited 0**.
  - The only failure is the known environmental `node tests/mcp-install-platforms.test.js`, with the same 2 cases as the baseline: "expected daemon_offline, got ok" and EADDRINUSE. The user's native-host daemon holds the ports.
  - The result is identical to the 69-01 baseline. The three Phase 69 suites (T309-T311) exited 0.
  - Afterwards I restored the crawler files `llms.txt`, `llms-full.txt` and `sitemap.xml` with `git checkout --`.
- `git status --short showcase/angular/public` printed nothing before every commit.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Extra `MUST_KEEP` row for `upload_file`'s security text**
- **Found during:** Task 3.
- **Issue:** The `upload_file` description carries the sensitive-path denylist (`~/.ssh`, `~/.aws`, `.env`, private keys, the FSB vault) and the audit-log note. This safety guidance falls under T-69-08, but no row in the plan protected it.
- **Fix:** I added the row `tool:upload_file` with `/~\/\.ssh/i`, `/vault/i`, `/block/i` and `/audit/i`. The table has 8 rows, and the plan's 7 rows are unchanged.
- **Files modified:** `tests/mcp-description-budget.test.js`.
- **Commit:** `5b32b4d8`.

**2. [Rule 2 - Missing critical functionality] The client-text claim is checked against the server**
- **Found during:** Task 3.
- **Issue:** The client text tells callers that case, spaces, `_` and `-` are ignored. If the server's folding ever changed, that text would mislead callers.
- **Fix:** The suite now asserts that `isAllowedMcpVisualClientLabel` accepts `claude`, `CODEX`, `vs-code`, `VS_CODE` and ` vscode `.
- **Files modified:** `tests/mcp-description-budget.test.js`.
- **Commit:** `5b32b4d8`.

### Scoping notes (no behaviour change)

- **Forbidden substrings.** The plan says no published description contains `Multi-agent:`, `mcp/src/` or `MCP_VISUAL_CLIENT_LABELS`. The check is ON for the 37 manual-site tools and for every module string. The other 35 baseline tools still publish registry text until plan 69-04, so for them it prints a report-only count (14 hits). Gating them now would turn the suite red before 69-04's cuts.
- **Common text lengths.** `client` is 125 characters against a ~100 target, and `tab_id` is 102 against ~95. Both are targets, not caps. The client text must name eight labels and the matching rule.
- **Sweep size.** The sweep selected 33 tests, not 31. See Verification.

## TDD Gate Compliance

Task 3 is `tdd="true"`, but D-22 requires the 66.1 freeze migration in the same commit as the first published description change, and D-24 requires the chain to stay green at every commit. The plan therefore specifies one `feat(69-02): …` commit, and RED was proven by an uncommitted run: 9 failures on the unwired build, listed under Verification. The plan is `type: execute`, so the plan-level `test(...)` → `feat(...)` sequence does not apply.

## Known Stubs

These are intentional and owned by later plans. None blocks this plan's goal:
- `MCP_EXPECT_DESCRIPTION` is exported but not yet published. Plan 69-06 attaches it to the `expect` property.
- `GATES.budgetFloors` and `GATES.fullCoverage` stay off, and the forbidden-substring check is report-only outside the manual site. Plan 69-04 completes the cuts and switches them on.

## Deferred to Validation Block

- **V5:** a human read-through of the 37 shortened manual-site descriptions, plus their parameter text and the common text, against the must-keep table. It checks that each one still tells a caller how to use the tool safely; for example, the `execute_js` fallback list and the `close_tab`, `select_option` and `upload_file` guidance.
- **V4:** exact `count_tokens` figures for the baseline list and the new list, and whether the shorter descriptions change caller error rate, turns and wall time. These are collected at the end of plan 69-04.
- **V6 (inherited):** the real CI run on Node 20 with a shallow clone, and the MCP publish. Nothing is pushed before V6.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- **Plan 69-04:**
  - adds the remaining 35 tools to `MCP_TOOL_DESCRIPTIONS` and `MCP_PARAM_DESCRIPTIONS`, within about 10,500 characters;
  - appends `MUST_KEEP` rows;
  - widens the forbidden-substring check to every live tool;
  - flips `budgetFloors` and `fullCoverage`.

  Today, without `expect`, the character cut is 46.1% and the byte cut is 33.6%.
- **Plan 69-06** imports `MCP_EXPECT_DESCRIPTION` from `./descriptions.js`. Both the migrated 66.1 freeze and the shape freeze already ignore `expect` on the 29 D-12 names.

---
*Phase: 69-mcp-descriptions-and-same-call-checks*
*Completed: 2026-10-15*

## Self-Check: PASSED

- **Files:** all 6 exist: `mcp/src/tools/descriptions.ts`, `mcp/src/tools/schema-bridge.ts`, `mcp/src/tools/manual.ts`, `tests/mcp-description-budget.test.js`, `tests/mcp-settings-tool-contract.test.js` and this SUMMARY.
- **Commits:** `f3883eb8`, `d2aab1a4` and `5b32b4d8` are in the log, none carries AI attribution, and none deletes a file.
- **Untouched:** the registry (`git diff --quiet 8a058bdf` on both copies) and the fixture (`git diff --quiet -- tests/fixtures`). `git status --short showcase/angular/public` is empty.
