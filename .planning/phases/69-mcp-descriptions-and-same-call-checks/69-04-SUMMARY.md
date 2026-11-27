---
phase: 69-mcp-descriptions-and-same-call-checks
plan: 04
subsystem: mcp
tags: [mcp, tools-list, descriptions, budget, must-keep, coverage, per-tool-shortening, expect-reserve]

# Dependency graph
requires:
  - phase: 69-mcp-descriptions-and-same-call-checks
    provides: "69-01: frozen 8a058bdf fixture, tests/helpers/mcp-in-process.mjs (EXPECT_TOOL_NAMES_VERBATIM), report-only budget suite, 69-SWEEP-BASELINE.json; 69-02: mcp/src/tools/descriptions.ts lookups, jsonSchemaToZod override, 37 manual-site tools, MUST_KEEP (8 rows)"
  - phase: 66.1-mcp-settings-tool
    provides: "the settings tool and its pinned D-03 text (tests/mcp-settings-tool-contract.test.js)"
provides:
  - "mcp/src/tools/descriptions.ts: MCP text for all 73 live tools (MCP_TOOL_DESCRIPTIONS 73 keys) and every inline-tool parameter"
  - "Registry sites read-only.ts, triggers.ts and screenshots.ts publish mcpToolDescription(tool.name, tool.description) + jsonSchemaToZod(tool.inputSchema, mcpParamDescriptions(tool.name))"
  - "Inline sites agents, observability, vault, capabilities, autopilot, visual-session and settings publish mcpToolDescription('<name>') and mcpParamDescription('<name>', '<param>'); every zod chain is byte-identical"
  - "tests/mcp-description-budget.test.js: budgetFloors and fullCoverage gates ON, the expect reserve, per-tool shortening rules (a)-(d), coverage over every live tool, per-group subtotals, MUST_KEEP at 20 rows"
affects: [69-06, 69-07, 69-08, 71]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Expect reserve: until a D-12 tool publishes expect, the floors charge it EXPECT_SCHEMA_BYTE_CAP bytes and MCP_EXPECT_DESCRIPTION.length chars, so later plans cannot spend the savings"
    - "Per-tool shortening rules compare published text on both sides against the frozen fixture; the only way out is a named PER_TOOL_LENGTH_EXCEPTIONS entry with a reason"
    - "Inline registrations call the module lookups with no fallback, so missing module text publishes '' and the coverage gate catches it"

key-files:
  created: []
  modified:
    - mcp/src/tools/descriptions.ts
    - mcp/src/tools/read-only.ts
    - mcp/src/tools/triggers.ts
    - mcp/src/tools/screenshots.ts
    - mcp/src/tools/vault.ts
    - mcp/src/tools/capabilities.ts
    - mcp/src/tools/agents.ts
    - mcp/src/tools/observability.ts
    - mcp/src/tools/autopilot.ts
    - mcp/src/tools/visual-session.ts
    - mcp/src/tools/settings.ts
    - tests/mcp-description-budget.test.js

key-decisions:
  - "The trigger tools override the common tab_id text: their tab_id means the watched tab (trigger, an alias of target_tab_id), a scoped-cleanup hint (stop_trigger), scoped access (get_trigger_status) or a list filter (list_triggers), not the generic owned-tab target"
  - "complete_task, partial_task and fail_task override tab_id with 'Tab this outcome belongs to, ...', because there the tab associates the outcome with the right replay session"
  - "back's module text ends with MCP_CHANGE_REPORT_SENTENCE, concatenated inside descriptions.ts (back is not a registry tool, so no suffix is appended at registration)"
  - "settings.ts drops its SETTINGS_DESCRIPTION constant; the 66.1 text moved verbatim into descriptions.ts, and the 66.1 contract test still pins it byte for byte"
  - "search_memory is the one registry name registered inline (observability.ts); the suite names it in REGISTRY_NAMES_REGISTERED_INLINE so it follows the inline-parameter rule"
  - "The PROJECT.md 'more than half' line is reported twice, without and with the expect reserve; neither is gated (D-06)"

patterns-established:
  - "Plan 69-06 publishes expect with MCP_EXPECT_DESCRIPTION. The reserve then falls to 0 of 29, and the floors measure the real expect bytes and chars instead"
  - "A new MCP tool needs a MCP_TOOL_DESCRIPTIONS entry, and inline parameters need entries too, or the fullCoverage gate fails"

requirements-completed: [MCP-01]

# Metrics
duration: 20min
completed: 2026-10-15
---

# Phase 69 Plan 04: Complete the description diet and switch the budget gates on Summary

**All 73 live tools now publish short MCP-only text from `mcp/src/tools/descriptions.ts`. The D-06 floors gate every `npm test` run, with a reserve for the `expect` property that plan 69-06 will publish. Over the 72 baseline names, characters fell 55.1% with the reserve (60.1% without), and canonical bytes fell 29.5% with the reserve (43.8% without). No baseline tool grew, and all 67 tools that were over 200 characters at 8a058bdf are strictly shorter. The safety guidance is held by a 20-row must-keep table. The registry, the prompt table and `fsb://config` are byte-identical to the pin.**

## Performance

- **Duration:** about 20 min
- **Started:** 2026-10-15T13:46Z
- **Completed:** 2026-10-15T14:06Z
- **Tasks:** 3 of 3
- **Files modified:** 12

## Final budget report

This is the output of `node tests/mcp-description-budget.test.js` on the current build after Task 3. Token figures are `ceil(chars/4)` and `ceil(bytes/4)` estimates, not tokenizer counts; exact counts are V4.

```
--- budget report (token figures are estimates, not tokenizer counts) ---
  measure                            baseline 8a058bdf     current    change
  tools (baseline names)                            72          72      0.0%
  description chars                              54024       15703    -70.9%
  parameter-description chars                    34217       19495    -43.0%
  total chars                                    88241       35198    -60.1%
  estimate: tokens, ceil(chars/4)                22061        8800    -60.1%
  canonical bytes of {tools}                    121379       68164    -43.8%
  estimate: tokens, ceil(bytes/4)                30345       17041    -43.8%
  settings (Phase 66.1, reported on its own line, not in the 72): description 151 chars; parameter-description 63 chars; canonical bytes 514; estimate 54 tokens (chars/4)
  5 longest current descriptions:
    execute_js                     612 chars
    partial_task                   452 chars
    run_task                       413 chars
    upload_file                    377 chars
    select_option                  367 chars
  PROJECT.md target (>50% tool-list token estimate cut): NOT MET (43.8%)
  manual site (registerManualTools, 37 of 37 tools published): description 8112 + parameter-description 14429 = 22541 chars (budget 26000); estimate 5636 tokens (chars/4)
  per-group subtotals over the 72 baseline names:
    manual site (37 tools): description 8112 + parameter-description 14429 = 22541 chars; canonical bytes 42730
    rest (35 tools): description 7591 + parameter-description 5066 = 12657 chars; canonical bytes 25445
  expect: not published yet

--- gates (CONTEXT D-06) ---
  PASS: perToolDescriptionCap: 0 of 73 live tools exceed 2048 description chars
  PASS: all 29 D-12 expect tools are baseline names
  expect reserve applied to 29 of 29 tools: +4379 chars (29 x 151), +17400 bytes (29 x 600)
  PASS: budgetFloors (chars): ... expect reserve included, 88241 -> 39577: cut by 55.1% (floor 50.0%; 60.1% without the reserve)
  PASS: budgetFloors (bytes): ... expect reserve included, 121379 -> 85564: cut by 29.5% (floor 20.0%; 43.8% without the reserve)
  PROJECT.md target with the expect reserve: NOT MET (29.5%; reported, not gated)

--- per-tool shortening (SC1) ---
  per-tool check over 72 names; PER_TOOL_LENGTH_EXCEPTIONS entries: 0
  already short (baseline description <= 200 chars; rules (a) and (b) only): 5 (get_logs, get_memory_stats, list_credentials, list_payment_methods, list_triggers)
  PASS: (a) no baseline tool's description is longer than at 8a058bdf
  PASS: (b) no baseline tool's description + parameter-description chars (expect excluded) exceed 8a058bdf
  PASS: (c) every baseline description over 200 chars is strictly shorter (67 tools)

=== Results: 55 passed, 0 failed ===
```

- **Settings line:** 151 description characters, 63 parameter-description characters and 514 canonical bytes. This is unchanged, because the 66.1 text moved into the module verbatim.
- **PROJECT.md target** (a cut of more than half in the tool-list token estimate): **NOT MET**. It is 43.8% without the reserve and 29.5% with it. As D-06 directs, this is reported honestly and not gated. About 33 KB of the list is schema scaffolding, which MCP-04 freezes.
- **Margin over the floors:** with the reserve, the character total is 39,577 against a 44,120 ceiling, so 4,543 characters are left. The byte total is 85,564 against a 97,103 ceiling, so 11,539 bytes are left.
- **Biggest per-tool cuts:**
  - `back`: 1,934 to 343 characters, including the change-report sentence;
  - `partial_task`: 1,135 to 452;
  - `run_task`: 946 to 413;
  - `capture_screenshot`: 783 to 358 for the description, and 1,820 to 1,024 including parameter text;
  - `trigger`: 1,889 to 1,087 including parameter text.

### Running totals (budget suite while the floors were still report-only)

| After | Baseline tools on module text | Chars (72 names) | Bytes (72 names) |
|---|---:|---:|---:|
| 69-02 | 37 of 72 | 47,555 (-46.1%) | 80,545 (-33.6%) |
| Task 1 (`12661652`) | 59 of 72 | 39,893 (-54.8%) | 72,863 (-40.0%) |
| Task 2 (`2da8c5dc`) | 72 of 72 (all 73 live tools) | 35,198 (-60.1%) | 68,164 (-43.8%) |

The 35 tools in this plan fell from 25,014 to 12,657 characters. That is 7,591 description characters plus 5,066 parameter characters, a 49.4% cut. The planner aimed for at most 10,500; see the scoping notes.

## Accomplishments

- **Task 1. The 16 registry tools and 6 inline vault and capability tools now publish module text.**
  - `read-only.ts` covers 11 tools. Its loop still skips `wait_for_element`, `wait_for_stable`, `report_progress` and `search_memory` through `if (!messageBuilder) continue;`.
  - `triggers.ts` covers 4 tools and `screenshots.ts` covers 1. Each passes `mcpToolDescription(tool.name, tool.description)` and `jsonSchemaToZod(tool.inputSchema, mcpParamDescriptions(tool.name))`.
  - `vault.ts` and `capabilities.ts` replace each literal in place, and every inline parameter has a module entry. `tab_id` uses the common text.
  - The kept guidance:
    - `use_payment_method` shows a confirmation prompt before any fill;
    - card data and the password are resolved inside the extension and are never returned;
    - the list tools never return passwords, full card numbers or CVV;
    - `invoke_capability` performs real side effects, so the caller checks the side-effect class first, and it keeps the three `RECIPE_*` codes that callers branch on.
- **Task 2. `back`, the seven observability tools, the three autopilot tools, the two visual-session tools and `settings`.**
  - `back` keeps its single-step semantics, its statuses (`ok`, `no_history`, `cross_origin`, `bf_cache` and `fragment_only`, with `resultingUrl` and `historyDepth`) and the no-focus-steal note. Its text ends with `MCP_CHANGE_REPORT_SENTENCE`.
  - `replay_session` keeps the exact phrase "never ask the user to open target pages manually". The same phrase also sits in a one-line comment above its registration, for the lattice-replay source pin.
  - `run_task` keeps its call contract in short form:
    - use it only when the user asks for autopilot;
    - it waits and returns a completion summary with the success status and action log;
    - progress comes as notifications, otherwise poll `get_task_status`;
    - cancel with `stop_task`.
  - The removed visual-session tools say "REMOVED in v0.9.0, returns TOOL_REMOVED" and give the implicit-session replacement.
  - `settings` publishes the 66.1 text verbatim.
  - The same commit includes a light tightening pass on text written in Task 1: the `trigger` parameters, `search_capabilities.origin`, the outcome `tab_id`, and the `trigger`, `capture_screenshot` and `partial_task` descriptions. It saved 291 characters.
- **Task 3. The gates are on, in a commit of their own.**
  - `GATES.budgetFloors` and `GATES.fullCoverage` are true, with the expect reserve.
  - Full coverage is checked over all 73 live tools, as five gated lines:
    - no 8a058bdf text remains;
    - every live tool has a module entry;
    - each publishes exactly its module text, plus the sentence on manual-site `_emitChangeReport` tools;
    - each parameter publishes its module text, else on registry tools the registry text;
    - every parameter of the 20 inline-registered tools has module text.
  - The forbidden-substring check and the search-terms-first check now cover every live tool.
  - The per-tool rules (a)-(c) use `PER_TOOL_SHORTEN_THRESHOLD = 200` and an empty, frozen `PER_TOOL_LENGTH_EXCEPTIONS`. The exception entries themselves are validated (d).
  - The report prints per-group subtotals and the PROJECT.md line with the reserve.
  - `MUST_KEEP` has 20 rows: the 8 from 69-02 plus 12 new ones.
  - `SEARCH_TERM_SYNONYMS` needed no new entry.

## Task Commits

1. **Task 1: Registry-driven sites plus vault and capability text**: `12661652` (feat)
2. **Task 2: back, observability, autopilot, visual-session and settings text**: `2da8c5dc` (feat)
3. **Task 3: Gate-only commit (budget floors, full coverage, per-tool rules, must-keep complete)**: `5907d98f` (feat)

**Plan metadata:** see the docs commit that adds this SUMMARY.

## Files Created/Modified

- `mcp/src/tools/descriptions.ts`: now covers 73 tools. It has 24 per-tool parameter-override tables beyond 69-02's 15, so 39 in total, and it is all ASCII.
- `mcp/src/tools/read-only.ts`, `triggers.ts`, `screenshots.ts`: one import line plus the two-argument substitutions.
- `mcp/src/tools/vault.ts`, `capabilities.ts`, `agents.ts`, `observability.ts`, `autopilot.ts`, `visual-session.ts`, `settings.ts`: one import line, with literals replaced by lookups in place. The zod chains, tool-name literals, handlers, `MCP_VISUAL_CLIENT_LABELS` and `getAllowedMcpVisualClientLabels` are unchanged.
- `tests/mcp-description-budget.test.js`: the gates, coverage, per-tool rules, reserve and must-keep rows.

None of the six force-tracked `mcp/build` files changes. `git status --short` on them printed nothing after each build.

## Verification

- **Task 1 `<verify>`:** all 11 commands exit 0. They are the build, `mcp-tools-list-shape-freeze`, `mcp-description-budget`, `agent-id-threading`, `trigger-tool-dispatcher`, `capability-search-agent-scope`, `capability-mcp-surface`, `mcp-numeric-param-coercion`, `node --test hung-page-recovery`, `npm run test:screenshot` and `npm run test:mcp-smoke:tools`.
  - Acceptance:
    - `mcpParamDescriptions(tool.name)` appears once in each of the three registry files;
    - `Multi-agent:` appears 0 times in vault and capabilities;
    - the capabilities slice check exits 0.
- **Task 2 `<verify>`:** all 13 commands exit 0. They are the build, the shape freeze, the budget suite, `agent-sunset-back-end`, `lattice-replay-background-contract`, `mcp-numeric-param-coercion`, `run-task-resolve-discipline`, `mcp-pricing`, `mcp-settings-tool-contract` (281 passed), `mcp-visual-session-contract`, `mcp-dispatcher-client-label`, `visual-session-schema-lock` and `test:mcp-smoke:tools`.
  - Acceptance:
    - `agents.ts` has 1 `server.tool(` line;
    - `observability.ts` contains the replay phrase once, and so does `MCP_TOOL_DESCRIPTIONS.replay_session` in the build;
    - `Multi-agent:` appears 0 times in agents, observability and autopilot;
    - the every-live-tool-has-an-entry one-liner exits 0.
- **Task 3 `<verify>`:** all 15 commands exit 0. They are the build, the budget suite (55 passed), the shape freeze, `mcp-tools-list-baseline`, `mcp-settings-tool-contract`, `mcp-visual-session-contract`, `mcp-dispatcher-client-label`, `visual-session-schema-lock`, `mcp-numeric-param-coercion`, `tool-definitions-parity`, `capability-mcp-surface`, `capability-autopilot-parity`, `recipe-schema-lock`, `mcp-version-parity` and `test:mcp-smoke:tools`.
  - Acceptance:
    - `budgetFloors: true`, `fullCoverage: true` and `PER_TOOL_SHORTEN_THRESHOLD = 200` each appear once;
    - `git diff --quiet 8a058bdf -- extension/ai/tool-definitions.js mcp/ai/tool-definitions.cjs mcp/src/prompts/index.ts mcp/src/resources/index.ts` exits 0;
    - none of the force-tracked build files shows in `git status`;
    - `Multi-agent:` appears 0 times in `descriptions.ts`;
    - before the commit, `git status --short` listed only the budget test.
- **RED proofs** (run, not committed; the build was restored by rebuilding and the suite then passed 55 of 55):
  - **Mutated built module.** I lengthened `list_credentials`, removed the replay phrase and removed "confirmation prompt". This failed rules (a) and (b) (`list_credentials 157->198`) and the `use_payment_method` and `replay_session` must-keep rows.
  - **Suite copy with stricter floors** (chars 0.6, bytes 0.3). Both floor gates failed: 55.1% < 60% and 29.5% < 30%.
  - **Unwired build files.** I changed `observability.js` so `get_logs` publishes a literal, removed the `read-only.js` override map, and set `list_payment_methods` to its baseline length in a threshold-100 copy. This failed the published-text gate (`get_logs`), the parameter-text gate (the `complete_task`, `fail_task` and other read-only parameters, and `get_logs.count`) and rule (c) (`list_payment_methods 184->184`).
- **Regression sweep:** run in the background from 13:57:23Z to 13:58:45Z, with 7225 held, to completion.
  - It selected **184** tests, not the planned 176.
  - **181 of 184 passed.** The 3 failures are the pre-existing baseline entries and were not fixed:
    - `agent-manager-start-mode`;
    - the 1-of-30 `back-tool` case;
    - the 2-of-39 `trigger-cap-settings-ui` cases.
  - Its last line was `sweep: NEW failures vs baseline: none`, and it exited 0.
- **Full chain (tolerant runner):** `node /tmp/fsb-tolerant-runner.mjs /tmp/p6904-full`, run after the Task 3 commit from 13:59:07Z to 14:03:24Z.
  - It ran **329 commands, and 328 exited 0.**
  - The only failure is the known environmental `node tests/mcp-install-platforms.test.js`, with the same 2 cases as the baseline: "expected daemon_offline, got ok" and EADDRINUSE. The user's native-host daemon holds 7225 and 7226.
  - The Phase 69 suites T309-T313 all exited 0.
- **Node 20** (`/tmp/fsb-node20/node-v20.20.2-darwin-arm64/bin/node`): `mcp-description-budget`, `mcp-tools-list-shape-freeze`, `mcp-tools-list-baseline`, `mcp-settings-tool-contract`, `visual-session-schema-lock` and `trigger-tool-dispatcher` all exit 0.
- **Crawler files:** `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}` were restored with `git checkout --` after the sweep and after the full chain. `git status --short showcase/angular/public` printed nothing at commit time.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Seven extra MUST_KEEP rows beyond the plan's list**
- **Found during:** Task 3.
- **Issue:** The plan's rows cover the payment confirmation, secrets resolved inside the extension, real side effects and the replay phrase. Several other kinds of guidance were required by Tasks 1-2, or carry the same T-69-08 weight, but no gate protected them:
  - the list tools never return passwords, card numbers or CVV;
  - the `back` statuses and the no-focus-steal note;
  - the `run_task` call contract;
  - the "never include passwords" rule on `complete_task`, `partial_task` and `fail_task`.
- **Fix:** I appended 12 rows, 5 named by the plan and 7 extra. The plan's minimum rows are all present, and no 69-02 row changed.
- **Files modified:** `tests/mcp-description-budget.test.js`.
- **Commit:** `5907d98f`.

**2. [Rule 3 - Blocking] The unused `SETTINGS_DESCRIPTION` constant was removed from `settings.ts`**
- **Found during:** Task 2.
- **Issue:** The settings description was a module-level constant, not an inline literal. Replacing its single use with `mcpToolDescription('settings')` left the constant dead.
- **Fix:** I removed the constant. Its text moved verbatim into `MCP_TOOL_DESCRIPTIONS.settings`, which `mcp-tool-smoke` and `mcp-settings-tool-contract` still pin byte for byte.
- **Files modified:** `mcp/src/tools/settings.ts`, `mcp/src/tools/descriptions.ts`.
- **Commit:** `2da8c5dc`.

### Scoping notes (no behaviour change)

- **Planner target for the 35 tools.** The plan aimed for at most 10,500 description and parameter characters; the result is 12,657.
  - About 1,330 characters are the 102-character common `tab_id` text on 13 tools. It is the deduplicated multi-agent/`TAB_NOT_OWNED` rule from 69-02, and this plan does not change it.
  - Most of the rest is guidance the plan requires: the `back` statuses, the `run_task` contract, the `partial_task` handoff rules and the payment and capability safety text.
  - The target is not a gate. Every gate passes with margin: the floors are 55.1% / 29.5% against 50% / 20% with the reserve.
  - Plan 69-02's manual site came in 3,459 characters under its 26,000 budget. The combined total, 35,198 characters, is below the planner's 36,500 (26,000 + 10,500).
- **Sweep size.** The sweep selected 184 tests, not 176. Suites added since the measurement (69-03's two suites, and the rewired files' imports) mention these basenames.
- **Cross-task text edit.** Task 2's commit also tightens some Task 1 text in `descriptions.ts`, the only file the two tasks share. Each commit stayed green.
- **Inline classification.** `search_memory` has a registry entry, but `observability.ts` registers it with its own schema. The suite names it in `REGISTRY_NAMES_REGISTERED_INLINE` rather than inferring this from source.

## TDD Gate Compliance

Task 3 is `tdd="true"`, but the plan makes it a single gate-only `feat(69-04): …` commit (RESEARCH Pitfall 4: every commit stays green). RED was therefore proven by the three uncommitted runs listed under Verification. The plan is `type: execute`, so the plan-level `test(...)` → `feat(...)` sequence does not apply.

## Known Stubs

These are intentional and owned by later plans. None blocks this plan's goal:
- `MCP_EXPECT_DESCRIPTION` is still not published. Plan 69-06 attaches it to `expect`. Until then the floors charge the expect reserve on all 29 D-12 tools.

## Deferred to Validation Block

- **V4:** exact Anthropic `count_tokens` figures for the fixture list and the new list on the pinned host model(s), recorded next to this suite's `ceil(chars/4)` estimate (8,800 tokens by characters and 17,041 by bytes now, against 22,061 and 30,345 at the baseline).
- **V4:** whether the shorter descriptions change caller error rate, turns and wall time in the MCP arm.
- **V5:** a human read-through of every shortened description (the 72 baseline tools plus `settings`) and its parameter text against the must-keep table. Most of all, check that the vault, capability, replay, `back`, `run_task` and task-outcome text still tells a caller how to use each tool safely.
- **V6 (inherited):** the real CI run on Node 20 with a shallow clone, and the MCP minor-version publish. Nothing is pushed before V6.

## Issues Encountered

- My first per-tool measurement ran while a background `npm --prefix mcp run build` was cleaning `mcp/build`, and it hit ERR_MODULE_NOT_FOUND. I re-ran it after the build finished. I made no code change.

## User Setup Required

None.

## Next Phase Readiness

- **Plan 69-06** imports `MCP_EXPECT_DESCRIPTION` from `./descriptions.js` and publishes `expect` on the 29 D-12 tools.
  - The reserve then shrinks to 0, and the floors measure the real schema.
  - Today's margin with the full reserve is 4,543 characters and 11,539 bytes, so an `expect` schema at the 600-byte cap still clears both floors.
- Any new MCP tool, or any new inline parameter, needs module text, or `fullCoverage` fails.

---
*Phase: 69-mcp-descriptions-and-same-call-checks*
*Completed: 2026-10-15*

## Self-Check: PASSED

- **Files:** all 13 exist: the 11 `mcp/src/tools` files, `tests/mcp-description-budget.test.js` and this SUMMARY.
- **Commits:** `12661652`, `2da8c5dc` and `5907d98f` are in the log. None carries AI attribution, and none deletes a file.
- **Untouched:**
  - `git diff --quiet 8a058bdf` on the registry, its copy, `mcp/src/prompts/index.ts` and `mcp/src/resources/index.ts` exits 0;
  - the six force-tracked `mcp/build` files are clean;
  - `git status --short showcase/angular/public` is empty;
  - `.planning/STATE.md`, `ROADMAP.md` and `REQUIREMENTS.md` are not modified, because the orchestrator owns them.
