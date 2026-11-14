---
phase: 71-comparative-gate-and-release
plan: 10
subsystem: docs
tags: [docs, tool-count, settings, expect, onboarding, rel-02, d-27, d-28]

# Dependency graph
requires:
  - phase: 71-comparative-gate-and-release (71-09)
    provides: tests/fixtures/mcp-release-delta-0.12.0.json (release 0.12.0, addedTools ['settings'])
  - phase: 69 (69-01)
    provides: tests/helpers/mcp-in-process.mjs listCurrentTools() with the build-freshness guard
  - phase: 66.1 (66.1-03)
    provides: the settings tool, SETTING_UNSUPPORTED, masked secrets, origin-only endpoints, the operator write log
provides:
  - "tests/helpers/tool-count-docs.js: the pure outcome-aware rule checkToolCountDocs and the two TOOL_COUNT_MARKERS sentences"
  - "tests/mcp-version-parity.test.js: the documented count checked against listCurrentTools().length, and the 'tool count rule, both doc states' synthetic cases"
  - "README.md and mcp/README.md at 73 registered tools, with Task lifecycle (3) and Settings (1) in both, the Same-call checks (`expect`) section and the includes marker"
  - "skills/fsb/references/tool-decision-tree.md: settings and expect guidance"
  - "extension/ui/onboarding.js: count-free MCP copy at the four sites"
affects: [71-11, 71-12, V1 (M-71-00 item 2), V6 (M-71-10, M-71-11, M-71-11b)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Outcome-aware doc pin: a marker sentence in the docs declares which of two tested states holds, so a release fallback is a docs-only edit that the unchanged test accepts"
    - "Count pins read the built artifact (tools/list length), never a literal"

key-files:
  created:
    - tests/helpers/tool-count-docs.js
  modified:
    - README.md
    - mcp/README.md
    - skills/fsb/references/tool-decision-tree.md
    - tests/mcp-version-parity.test.js
    - tests/skill-fsb-spec.test.js
    - extension/ui/onboarding.js

key-decisions:
  - "The count rule checks every 'N registered (MCP) tools' phrase in both READMEs, not only the root sentence, so README.md:280 cannot drift on its own"
  - "In the includes state each manifest addedTools name must appear under a counted mcp/README.md heading; in the excludes state it must appear in no counted root row or counted MCP section"
  - "The marker must sit on its own line inside the Tool Count Contract section and appear nowhere else in mcp/README.md"
  - "settings stays out of the skill's tool-by-tool table (that table lists manual-mode registry tools only); it is documented in narrative prose like run_task"
  - "Onboarding copy is count-free at :205, :227, :275 and :882, a deviation from D-27's site list recorded for M-71-00 item 2"

patterns-established:
  - "Tool-count rule errors are rule ids with numbers only (for example root_table_sum (expected 73, found 72)), never file text"

requirements-completed: [REL-02]

# Metrics
duration: 7min
completed: 2026-10-19
---

# Phase 71 Plan 10: Gate-Independent Docs Summary

**Both READMEs now document the real 73-tool MCP surface. They add the three task-lifecycle tools and `settings`, with category tables that sum to the built `tools/list` length, plus a `settings` reference and a same-call `expect` reference that stay true in either gate outcome. The documented count is no longer a literal: an outcome-aware rule reads a marker sentence in mcp/README.md. That lets the M-71-11b fallback, where MCP 0.12.0 is withheld, be a docs-only edit. The onboarding copy names no tool count.**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-10-19T03:36:56Z
- **Completed:** 2026-10-19T03:43:39Z
- **Tasks:** 2/2
- **Files:** 1 created, 6 modified, plus this SUMMARY

## Accomplishments

- **N = 73.** After `npm --prefix mcp run build`, `listCurrentTools()` returns 73 tools: the 72 at the pin plus `settings`. The parity test passes with `state: includes, expected: 73, built: 73, errors: none`, and `git status --short mcp/build` was empty after every build.
- **The count follows the built list (D-27).** `tests/mcp-version-parity.test.js` imports `tests/helpers/mcp-in-process.mjs` inside `run()`. It passes the real README texts, the built tool names, the 71-09 manifest (read with `JSON.parse`) and the `mcp/package.json` version to `checkToolCountDocs`, and asserts `.ok`. The frozen "FSB Tool Reference (49 tools)" assertion and the 66-tool ban are unchanged.
- **Both doc states are exercised now.** The "tool count rule, both doc states" section builds minimal README shapes and covers 12 cases: three that pass (includes at 0.11.2, includes at 0.12.0, and the M-71-11b excludes state at 0.11.2) and nine that are refused, each by its named rule.
- **The settings and expect references** went into mcp/README.md, the root README and the skill decision tree. Each says the feature arrives in fsb-mcp-server 0.12.0 and needs FSB extension 1.0.0, and that older extensions answer `SETTING_UNSUPPORTED` or `uncertain` / `extension_unsupported`.
- **Onboarding is count-free.** Four lines changed and the file still has 1,134 lines. No test pinned the old text, and `onboarding-agent-provider-clicks` hashes only the HTML and CSS.

## Task Commits

1. **Task 1: READMEs at 73, settings, expect, the skill tree and the outcome-aware pin.** `88323b737`, `docs(71-10): document 73 MCP tools, the settings tool and same-call expect`.
2. **Task 2: Count-free onboarding MCP copy.** `e2f1d1e7e`, `docs(71-10): make the onboarding MCP copy independent of the tool count`.

**TDD (Task 1).** The helper and the parity-test change were written first, and the test was run on the old docs: `node tests/mcp-version-parity.test.js` gave 215 passed and 1 failed. The failure was the real-file assertion (`state: null, expected: null, built: 73, errors: marker_missing`), and all 12 synthetic cases already passed. The docs edits then made it 216 passed and 0 failed. Following the plan's commit instruction and the earlier 71 plans, the task landed as one commit.

## The edited sites

| File | Site | Before | After |
| --- | --- | --- | --- |
| README.md | :82 | `69 registered MCP tools` | `73 registered MCP tools` |
| README.md | :280 | `exposes 69 registered tools across ... vault, and observability.` | `exposes 73 registered tools across ... vault, observability, task lifecycle signals, and settings.` |
| README.md | category table | 9 rows, sum 69 | 11 rows, sum 73: `\| Task lifecycle \| 3 \| ... \|` and `\| Settings \| 1 \| \`settings\` \|` |
| README.md | after the task-lifecycle paragraph | (none) | one paragraph on `settings` and `expect`, with the 0.12.0 / 1.0.0 / `SETTING_UNSUPPORTED` wording and a link to mcp/README.md |
| mcp/README.md | :20 | `[Tools](#tools-69-total)` | `[Tools](#tools-73-total)` |
| mcp/README.md | tools heading | `## Tools (69 Total)` | `## Tools (73 Total)` |
| mcp/README.md | new | (none) | `### Task Lifecycle (3)`: the purposes come from the built descriptions; the section notes the `mcp:task-status` route and its 0.9.92 minimum |
| mcp/README.md | new | (none) | `### Settings (1)`: read all, read one, or write one by key; masked secrets; origin-only endpoints refused on write; operator log; no delegated writes; 0.12.0 / 1.0.0 / `SETTING_UNSUPPORTED` |
| mcp/README.md | new | (none) | `### Same-call checks (\`expect\`)`: the 29 tools, a check table built from the published zod shape (timeout default 2000, at most 5000), the meaning of verified / unmet / uncertain, "without `expect` ... exactly as before", and the older extension's `uncertain` / `extension_unsupported` |
| mcp/README.md | `### Tool Count Contract` | "based on registered MCP handlers, not every internal helper ..." | the count is the registered `tools/list` length, including the three lifecycle tools and `settings`, checked by tests/mcp-version-parity.test.js; plus the includes marker on its own line |
| skills/fsb/references/tool-decision-tree.md | new sections | (none) | "Reading or changing an FSB setting" and "Same-call checks with expect" (narrative prose, ASCII only), plus a See also line |
| tests/skill-fsb-spec.test.js | nonToolAllowlist | (none) | `'expect_result', 'extension_unsupported'` under a "Phase 71" comment |
| extension/ui/onboarding.js | :205 | `<b>68 MCP tools</b>` | `<b>Full MCP toolset</b>` |
| extension/ui/onboarding.js | :227 | `... OpenClaw and more. 68 tools, no API key, nothing to configure in the browser.` | `... OpenClaw and more. No API key, nothing to configure in the browser.` |
| extension/ui/onboarding.js | :275 | `<b>68 tools</b>, zero manual JSON.` | `<b>Every FSB tool</b>, zero manual JSON.` |
| extension/ui/onboarding.js | :882 | `{ k: 'Tools', v: '68 available' }` | `{ k: 'Tools', v: 'Full toolset' }` |

Every fact in the new wording was read from code, not from memory:
- the settings tool registration and handler (`mcp/src/tools/settings.ts`);
- the schema classes and `originOnly` (`extension/config/config.js:386-465`, `:716-721`);
- the D-18 write log fields (`extension/ws/mcp-tool-dispatcher.js:4039-4048`);
- the `SETTING_DELEGATED_WRITE_REFUSED` code;
- the published `expect` shape from `listCurrentTools()`, and `clampExpectTimeoutMs` (`mcp/src/tools/manual.ts:46-48`, `:65-80`);
- the value-check redaction (`extension/utils/action-verification.js:1265-1275`).

## The marker sentences

`TOOL_COUNT_MARKERS(release)` returns these two sentences, with a space before the version and never `@`:

- **includes:** `The documented count includes the tools added in fsb-mcp-server ${release}.`
- **excludes:** `The documented count excludes the tools added in fsb-mcp-server ${release}, which is not published yet.`

mcp/README.md now holds the includes sentence for 0.12.0 on its own line in the Tool Count Contract.

## The rule (`checkToolCountDocs`)

`checkToolCountDocs` returns `{ok, state, expected, errors}`. It checks, in order:

1. **The marker.**
   - The `### Tool Count Contract` section must hold exactly one marker sentence. With none the error is `marker_missing`; with both it is `marker_ambiguous`. The rule stops at either error.
   - The marker must be on its own line (`marker_not_own_line`) and must appear nowhere else in mcp/README.md (`marker_outside_contract`).
2. **The expected count.**
   - In the includes state it is the built length.
   - In the excludes state it is the built length minus `addedTools`. Each added tool must be in the built list (`excluded_tool_not_built`), and `mcp/package.json` must be semver-below the manifest's release (`excludes_after_release`; an invalid version gives `mcp_version_invalid`).
3. **The count sentences.**
   - The root README must contain `${expected} registered MCP tools` (`root_count_sentence`).
   - Every `N registered (MCP )?tools` phrase in either README must use the expected count (`root_count_phrase_mismatch` / `mcp_count_phrase_mismatch`).
4. **The MCP heading and links.**
   - mcp/README.md must have exactly one `## Tools (N Total)` heading, with N = expected (`mcp_tools_heading`).
   - Its `(#tools-N-total)` links must exist and all use the expected count (`contents_link`).
   - The root README must have no `#tools-N-total` anchor with another N (`root_tools_anchor`).
5. **The root category table.** The table under `| Surface | Count | Examples |` must exist (`root_table_missing`), have at least 9 rows (`root_table_rows`), hold integer counts (`root_table_count_not_integer`) and sum to the expected count (`root_table_sum`).
6. **The counted MCP sections.** The `### <Name> (<k>)` headings under the tools heading must exist (`mcp_sections_missing`) and sum to the expected count (`mcp_sections_sum`).
7. **Where the added tools appear.**
   - In the excludes state, no added tool may appear in backticks in a counted root row or under a counted MCP heading (`excluded_tool_counted`).
   - In the includes state, each added tool must appear under a counted MCP heading (`included_tool_not_listed`).

## The withheld-state dry run (M-71-11b; never committed)

```
DRY=$(mktemp -d /tmp/71-10-m71-11b.XXXXXX) && cp README.md "$DRY/README.md" && cp mcp/README.md "$DRY/mcp-README.md"
node -e '<edits>' "$DRY"   # on the copies only:
  README.md:     "73 registered MCP tools" -> "72 registered MCP tools"; "It exposes 73 registered tools" -> "It exposes 72 registered tools";
                 the "| Settings | 1 | `settings` |" row removed
  mcp-README.md: "[Tools](#tools-73-total)" -> "[Tools](#tools-72-total)"; "## Tools (73 Total)" -> "## Tools (72 Total)";
                 "### Settings (1)" -> "### Settings (arrives in a later MCP release)" (uncounted);
                 the includes marker -> the excludes marker
node --input-type=module -e '<checkToolCountDocs on the copies with the built names and the real manifest>' "$DRY"
```

Result:

```
0.11.2: {"ok":true,"state":"excludes","expected":72,"errors":[]}
0.12.0: {"ok":false,"state":"excludes","expected":72,"errors":["excludes_after_release"]}
```

So the unchanged test accepts the M-71-11b docs at 0.11.2 and refuses the excludes state once 0.12.0 is the package version. The temp directory is outside the repository, and `git status` showed no change from the dry run.

## Verification

- **Task 1 step 3 and the verify command (exit 0):**
  - `npm --prefix mcp run build` exit 0
  - `mcp-version-parity` 216/0
  - `skill-fsb-spec` 53/0
  - `mcp-setup-guidance` 43/0
  - `mcp-visual-session-contract` 147/0
  - `version-sync` PASS
  - `npm run version:check` exit 0
  - `git status --short mcp/build` empty

  Also green: `release-version-rehearsal` PASS, `mcp-release-compat` 52/0, `delegation-phase-contract` 1254/0 and `node --test tests/release-diff.test.mjs`. On Node 20 (v20.20.2), `mcp-version-parity` gave 216/0 and `skill-fsb-spec` 53/0.
- **Task 1 acceptance greps:**
  - `(#tools-73-total)` 1; `#tools-6[89]-total` 0;
  - `73 registered MCP tools` 1; `## Tools (73 Total)` 1; `69 registered|Tools (69 Total)` 0 in both files;
  - `listCurrentTools` 2; `FSB Tool Reference (49 tools)` 1;
  - includes marker 1; `The documented count excludes` 0; "both doc states" 1;
  - `fsb-mcp-server@0.12.0|FSB MCP Server 0.12.0` 0 in both files;
  - `git diff --quiet $P71_START -- CHANGELOG.md mcp/CHANGELOG.md mcp/src` exit 0 (`$P71_START` = `3493c34ad99efec9df7d340811a58e019c0f55d1`).
- **Task 2 step 3 and the verify command (exit 0):**
  - `mcp-version-parity`, `onboarding-agent-provider-clicks`, `onboarding-lmstudio`, `mcp-client-identity-integration` and `version-sync` all pass;
  - `version:check` exit 0;
  - `validate:extension` exit 0;
  - `grep -cE '\b6[89]\b' extension/ui/onboarding.js` 0; `68 available` 0.
- **The onboarding-first-run suite** (unregistered) passed before the edit (exit 0, `PASS onboarding-first-run.test.js`). After the edit it passed with byte-identical output. It has no new failure.
- **The sweep:** `node scripts/bench/sweep-tests.mjs --files extension/ui/onboarding.js --baseline .planning/phases/71-comparative-gate-and-release/71-SWEEP-BASELINE.json` passed 11/11 with "NEW failures vs baseline: none" and exit 0. Port 7225 was held by the user's process (pid 7109, left alone); no selected suite binds it. The crawler files were not touched (`git status --short` showed only onboarding.js before the commit).
- **The extension footprint:** `git diff --stat $P71_START -- extension | tail -1` prints `1 file changed, 4 insertions(+), 4 deletions(-)`.
- **Out of scope and untouched:**
  - `CHANGELOG.md`, `mcp/CHANGELOG.md`, `mcp/src/**`, `mcp/build/**` and `mcp/src/prompts/index.ts`;
  - every What's New, Releasing, Compatibility and release-prep line;
  - the showcase, llms and locale files (71-11).

## Decisions Made

See `key-decisions` in the frontmatter. These three go beyond the plan's literal rule list:
- **The per-phrase count check.** It catches the README.md:280 sentence.
- **The includes-side listing check.** In the includes state, `settings` must actually be documented under a counted heading.
- **The marker placement checks.** The marker must be on its own line and must appear only inside the contract section.

Each one only adds refusals. None of them changes the expected count.

## Deviations from Plan

**1. [D-27 deviation, planned; recorded for owner acknowledgement M-71-00 item 2] Count-free onboarding copy instead of 73**
- **Found during:** planning (RESEARCH Open Question 2, RESOLVED; the D-27 amendment dated 2026-10-16).
- **What:** D-27 lists `extension/ui/onboarding.js:205,227,275` among the sites that become 73. Instead, all three and the MCP summary row `:882` (which D-27 did not list) now name no count.
- **Why:** onboarding.js is an extension-setter target outside the D-24 docs allowlist. If MCP 0.12.0 is withheld, a number there would force a post-V4 extension edit and a re-measure. If the owner rejects the deviation, onboarding says 73, and a withheld 0.12.0 leaves stale extension copy.
- **Commit:** `e2f1d1e7e`.

**2. [Rule 1 - accuracy] Corrected one draft table row in the `expect` section before committing.** The first draft said a value check's value is "never echoed back". The extension echoes a matching value from a non-sensitive field (`action-verification.js:1271-1274`), so the row now reads "sensitive or non-matching values are redacted in the result". This was fixed before the Task 1 commit.

**3. [Note for 71-12 / M-71-11b] The stricter count rule also covers README.md:280.** M-71-11b step 2 names only `72 registered MCP tools` for the root README. The rule also requires the :280 sentence, "It exposes N registered tools", to say 72; the dry run changed both. If a V6 operator misses :280, the parity test fails with `root_count_phrase_mismatch (expected 72, found 73)`, and the fix is docs-only. This plan does not modify 71-VALIDATION.md. 71-12 should add ":280 (`It exposes 72 registered tools`, dropping `and settings`)" to M-71-11b step 2.

Otherwise the plan executed as written.

## Known Stubs

None. No placeholder copy; every new sentence describes shipped code.

## Deferred to Validation Block

These rows are restated from 71-VALIDATION.md, which is authoritative.

- **M-71-00 item 2 (V1).** The owner acknowledges or rejects the count-free onboarding deviation from D-27 (`extension/ui/onboarding.js` :205, :227, :275 and :882 name no count), before V4.
- **M-71-10 (V6, step A, extension 1.0.0, MCP stays 0.11.2).** This step writes the gate-dependent copy that 71-10 deliberately left alone (D-28):
  - the CHANGELOG v1.0.0 body and the header line "The extension version is `1.0.0`";
  - fast-mode status wording beyond Phase 68's card;
  - the showcase release-notes section;
  - the Chrome Web Store listing and privacy form (M-68-11).

  Then commit, run `check-release-diff.mjs --measured <V4 sha> --step A` on the committed HEAD, re-check after merging `origin/main`, and merge only when CI is green.
- **M-71-11 (V6, step B, MCP 0.12.0; skipped if the non-Jev MCP path did not pass).**
  - Write the `mcp/CHANGELOG.md` 0.12.0 entry, the mcp/README.md "What's New In v0.12.0" section above v0.11.2 (moving the single Compatibility bullet into it) and the root CHANGELOG "MCP-only update" paragraph.
  - Run `npm run version:set:mcp -- 0.12.0 && npm --prefix mcp run build && npm run version:check && npm test`.
  - Commit with the six force-tracked `mcp/build` files and `mcp/native-host/runtime-integrity.json`.
  - Run `check-release-diff.mjs --step B`, merge when CI is green, and confirm `npm view fsb-mcp-server dist-tags.latest` prints `0.12.0`.

  The includes marker and the 73 counts stay as committed here.
- **M-71-11b (V6, only if the decision file withholds 0.12.0, as part of M-71-10 before its step 5).**
  1. In the mcp/README.md Tool Count Contract, replace the includes marker line with `The documented count excludes the tools added in fsb-mcp-server 0.12.0, which is not published yet.`
  2. Set the documented count to 72:
     - README.md: `72 registered MCP tools`, and also :280 `It exposes 72 registered tools` (see Deviation 3); remove the Settings row.
     - mcp/README.md: `## Tools (72 Total)` and the contents link `#tools-72-total`; move the `settings` row out of the counted `### Settings (1)` section into an uncounted heading with no `(k)`.
     - Mark `settings` and `expect` as arriving with a later MCP release there and in `skills/fsb/references/tool-decision-tree.md`.
  3. Set 72 in the showcase copy, locales and llms files (71-11's sites).
  4. Rerun the DOCS-a and DOCS-b commands. `tests/mcp-version-parity.test.js` accepts this state unchanged, as the dry run above shows, and no `tests/**` file changes. Every changed path is docs class, so `check-release-diff.mjs --step A` still passes. onboarding.js needs no change.

## Self-Check: PASSED

- FOUND: tests/helpers/tool-count-docs.js
- FOUND: README.md, mcp/README.md, skills/fsb/references/tool-decision-tree.md, tests/mcp-version-parity.test.js, tests/skill-fsb-spec.test.js, extension/ui/onboarding.js (modified)
- FOUND: commit 88323b737 (Task 1)
- FOUND: commit e2f1d1e7e (Task 2)
