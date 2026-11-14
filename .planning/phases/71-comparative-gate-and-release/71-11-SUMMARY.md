---
phase: 71-comparative-gate-and-release
plan: 11
subsystem: docs
tags: [docs, showcase, i18n, xliff, llms, tool-count, rel-02, d-27]

# Dependency graph
requires:
  - phase: 71-comparative-gate-and-release (71-10)
    provides: README/mcp README at 73 and the outcome-aware count rule; the built tools/list length of 73 (mcp/build fresh)
  - phase: 71-comparative-gate-and-release (71-01)
    provides: 71-SYNC-RECHECK S11 docs inventory (11 tool-count units per catalog) and $P71_START
provides:
  - "Showcase home, agents, support and about copy at 73 MCP tools (11 sites, digit-only, no line moved)"
  - "llms.source.md, llms-full.source.md and the generated public/llms.txt and llms-full.txt at 73, matching their generator except the date line"
  - "All seven xlf catalogs at 73 for the 11 S11 units (source and target, state kept), the CI extraction diff empty"
  - "same-source-allowlist.json: recomputed de equivalent hashes for agents.power.card.tools.stat and home.engine.mcp.fact.tools"
  - "tests/mcp-version-parity.test.js: stale 66/68/69 tool-count ban over every liveToolCountSources entry, which now includes the showcase home page"
affects: [71-12, V6 (M-71-10, M-71-11b)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Digit-only catalog sync: re-extract messages.xlf, then edit the changed units' <source>/<target> by unit id; never sync-xliff-targets"
    - "Allowlist hashes recomputed with the verifier's own canonicalXml/sourceHash function text, after reproducing the old hashes from the HEAD catalogs as a sanity check"

key-files:
  created: []
  modified:
    - showcase/angular/src/app/pages/home/home-page.component.html
    - showcase/angular/src/app/pages/agents/agents-page.component.html
    - showcase/angular/src/app/pages/agents/agents-page.component.ts
    - showcase/angular/src/app/pages/support/support-page.component.ts
    - showcase/angular/src/app/pages/about/about-page.component.html
    - showcase/angular/scripts/llms.source.md
    - showcase/angular/scripts/llms-full.source.md
    - showcase/angular/public/llms.txt
    - showcase/angular/public/llms-full.txt
    - showcase/angular/src/locale/messages.xlf
    - showcase/angular/src/locale/messages.de.xlf
    - showcase/angular/src/locale/messages.es.xlf
    - showcase/angular/src/locale/messages.ja.xlf
    - showcase/angular/src/locale/messages.ko.xlf
    - showcase/angular/src/locale/messages.zh-CN.xlf
    - showcase/angular/src/locale/messages.zh-TW.xlf
    - showcase/angular/src/locale/same-source-allowlist.json
    - tests/mcp-version-parity.test.js

key-decisions:
  - "The llms-full 'MCP tool surface' section names tools by category but gives no per-category counts, so the plan's conditional (add lifecycle and settings so the parts sum to 73) was not triggered; the public llms files stay digit-only as the verify and the M-71-11b fallback require"
  - "The re-extraction was written to a temp directory with the CI command form, proven digit-only (17,342 lines, 11 changed, 0 non-digit) and then copied over messages.xlf"
  - "The ban regex is the planner's exact pattern; it guards every English source and every xlf <source>, and catches localized targets only where the count is followed by tools/Tools/MCP or a placeholder"

patterns-established:
  - "Locale digit edits assert one 68 per unit source and per unit target, and that each edited locale <source> equals the re-extracted English <source>"

requirements-completed: [REL-02]

# Metrics
duration: 8min
completed: 2026-10-19
---

# Phase 71 Plan 11: Showcase, llms and Locale Tool Counts Summary

**The public showcase, the llms sources and outputs, and all seven xlf catalogs now say 73 MCP tools. Every edit replaced the digits 68 with 73 and nothing else, so no line moved, the CI extraction diff is empty, and the drift, quality, lint and component-test gates pass. The parity test now refuses stale 66, 68 and 69 tool-count claims (including the `68 available` and `68 <span>MCP</span> tools` forms) in all 20 live sources, and the showcase home page is one of them for the first time.**

## Performance

- **Duration:** about 8 min
- **Started:** 2026-10-19T03:45Z
- **Completed:** 2026-10-19T03:53Z
- **Tasks:** 2/2
- **Files:** 18 modified, plus this SUMMARY

## Preconditions

- `git status --short showcase` printed nothing before Task 1.
- ListAgents is not available to this executor. The milestone runs one plan at a time in this tree. `git log -5 --format='%h %ad %s' -- showcase/angular/src/locale` before the edits:
  - `207d3df1b Sat Oct 17 07:16:01 2026 -0500 docs(68-10): disclose opt-in Jev fast mode and its Limited Use terms on the privacy page`
  - `989d94feb Sat Oct 17 07:02:13 2026 -0500 docs(68-10): archive the September 29 privacy policy before the fast-mode update`
  - `367316b8c Wed Oct 14 13:20:35 2026 -0500 Show full support answers when expanded and drop the personal footer credit.`
  - `fe59ed99e Wed Oct 14 13:12:28 2026 -0500 Publish localized marketing metadata that crawlers and search engines can trust.`
  - `13716bd8b Wed Oct 14 12:07:06 2026 -0500 Credit DB-IP for the place data shown on the stats globe.`
- Port 7225 was held by the user's process (pid 7109). It was left alone, and no suite in this plan binds it.
- `$P71_START` = `3493c34ad99efec9df7d340811a58e019c0f55d1`.

## Task Commits

1. **Task 1: Showcase copy and llms files at 73.** `21ce4d991`, `docs(71-11): show 73 MCP tools in the showcase copy and llms files` (9 files, 19 insertions, 19 deletions).
2. **Task 2: Locale catalogs, allowlist hashes, i18n gates and the stale-count ban.** `35c45dfb9`, `docs(71-11): sync the locale catalogs to 73 MCP tools and ban stale counts` (9 files).

## The English sites (Task 1)

The S11 inventory was authoritative. Every edit changed only `68` to `73`.

| File:line | Unit id | Before | After |
| --- | --- | --- | --- |
| home-page.component.html:68 | home.features.card.mcpIntegration.desc | `... MCP</span> client. 68 tools, with ...` | `... 73 tools, with ...` |
| home-page.component.html:276 | home.engine.mcp.meta | `68 tools · no API key` | `73 tools · no API key` |
| home-page.component.html:327 | home.engine.mcp.fact.tools | `68 <span ...>MCP</span> tools` | `73 <span ...>MCP</span> tools` |
| agents-page.component.html:15 | agents.hero.subtitle | `... signed into, 68 <span ...>MCP</span> tools, ...` | `... 73 <span ...>MCP</span> tools, ...` |
| agents-page.component.html:92 | agents.with.agent.foot | `via <span ...>MCP</span> · 68 tools` | `... · 73 tools` |
| agents-page.component.html:122 | agents.power.card.tools.stat | `68 tools` | `73 tools` |
| agents-page.component.ts:294 | agents.schema.software.description | `... and 68 MCP browser tools ...` | `... and 73 MCP browser tools ...` |
| agents-page.component.ts:296 | agents.schema.software.feature.tools | `68 MCP tools for browser action, ...` | `73 MCP tools for ...` |
| support-page.component.ts:41 | support.schema.faq.mcp.a | `FSB exposes 68 MCP tools (click, ...` | `FSB exposes 73 MCP tools (...` |
| support-page.component.ts:61 | support.schema.faq.tools.a | `... gives the calling agent 68 granular tools: ...` | `... 73 granular tools: ...` |
| about-page.component.html:102 | about.actions.subtitle | `... part of the 68-tool <span ...>MCP</span> catalog.` | `... the 73-tool ...` |
| llms.source.md:3 / public/llms.txt:4 | — | `a 68-tool MCP surface` | `a 73-tool MCP surface` |
| llms.source.md:32 / public/llms.txt:33 | — | `(68 MCP tools, multi-agent identity, ...` | `(73 MCP tools, ...` |
| llms-full.source.md:7 / public/llms-full.txt:8 | — | `a 68-tool MCP surface` | `a 73-tool MCP surface` |
| llms-full.source.md:43 / public/llms-full.txt:44 | — | `### MCP tool surface (68 tools)` | `### MCP tool surface (73 tools)` |

After the edits, `grep -nE "\b6[89]\b"` still finds only two kinds of hit in these files, and neither is a tool count: the SVG path at home :109 (`6.68 4.66`) and the version `v0.9.69` at llms-full.source.md:139 and public/llms-full.txt:140. `git diff --numstat $P71_START -- showcase/angular/src/app` shows equal insertions and deletions per file: about 1/1, agents html 3/3, agents ts 2/2, home 3/3, support ts 2/2.

**Generator proof.** I saved the edited public files and ran `node showcase/angular/scripts/build-crawler-files.mjs` (exit 0). The generated `llms.txt` and `llms-full.txt` differed from the hand edits only in line 1, `<!-- generated 2026-10-14 ...` versus `2026-10-19`, and sitemap.xml changed only `<lastmod>` lines. I then restored the hand-edited copies and ran `git checkout -- showcase/angular/public/sitemap.xml`. The committed llms files differ from `$P71_START` only in the count digits.

**The setter-owned sentences are untouched and single.** The "Current release: FSB v0.9.92 (extension) with fsb-mcp-server 0.11.2 (npm)" line and the skill version sentence did not change.

## Changed unit ids (Task 2)

These 11 ids are the same in all seven catalogs, and they are exactly the S11 list:

`about.actions.subtitle`, `agents.hero.subtitle`, `agents.with.agent.foot`, `agents.power.card.tools.stat`, `agents.schema.software.description`, `agents.schema.software.feature.tools`, `home.features.card.mcpIntegration.desc`, `home.engine.mcp.meta`, `home.engine.mcp.fact.tools`, `support.schema.faq.mcp.a`, `support.schema.faq.tools.a`.

- **messages.xlf.** I re-extracted with `npx --prefix showcase/angular ng extract-i18n --output-path /tmp/71-11/extract` (exit 0, 2,487 messages). Against the committed catalog, the result has the same 17,342 lines, 11 of them changed, and 0 changes other than digits. All 11 changed lines are `<source>` lines of the ids above. No context or line-number entry moved. I copied the result over `showcase/angular/src/locale/messages.xlf`.
- **The six locale files** (de, es, ja, ko, zh-CN, zh-TW). Each unit had exactly one `68` in its `<source>` and exactly one in its `<target>`. After the edit, each locale `<source>` equals the re-extracted English source. Each file keeps 19,812 lines, with 22 changed lines and 0 non-digit changes. `state` attributes are byte-identical. `sync-xliff-targets` was never run.
- `git diff --numstat $P71_START -- showcase/angular/src/locale` shows equal insertions and deletions: 11/11 for messages.xlf, 22/22 for each locale file and 4/4 for the allowlist.
- The changed-line filter (`grep -vcE 'trans-unit|source|target|73|6[89]'`) prints 0.

## The one-off scripts

All of them lived in `/tmp/71-11/`, outside the repository, and none was committed. Their logic, so that the M-71-11b fallback (73 to 72) can repeat it:

- **`edit-english.mjs` (Task 1).** It holds a list of `(file, line, needle)` triples, one per site in the table above. For each triple it asserts that the needle occurs exactly once on that line. It then replaces `\b68\b` with `73` inside the needle, asserts the replacement has the same length, and writes the file back.
- **`check-digit-only.mjs`.** It takes an old and a new file and checks that they have the same line count and that every differing line equals the old line with `\b68\b` replaced by `73`. I ran it on messages.xlf (old versus re-extracted) and on each locale file (HEAD versus edited).
- **`edit-locales.mjs` (Task 2).** For each locale file and each of the 11 ids, it finds the single `<trans-unit id="ID" ...>...</trans-unit>` block. Inside that block's `<source>` inner text and `<target ...>` inner text only, it replaces `\b68\b` with `73`. It asserts one hit in the source, one in the target, and that the new source equals the messages.xlf source. It ran once with `--dry` before it wrote anything.
- **`rehash-allowlist.mjs` (Task 2).** It reads the function text of `canonicalXml`, `sourceHash`, `extractUnits` and `failTool` from `showcase/angular/scripts/verify-translation-quality.mjs` and evaluates it with `node:crypto`'s `createHash`, so the hashing is the verifier's own code, not a retyped copy. As a sanity check it first reproduces the old allowlist hashes from the HEAD catalogs. It then computes `sourceHash(messages.xlf source)` and `sourceHash(messages.de.xlf target)` and swaps each old hash string, which must be unique in the JSON, for the new one. JSON formatting is unchanged.
- **`ban-dryrun.mjs`.** It runs the new ban regex over the 20 sources at `$P71_START` and in the working tree (results below).

## Allowlist entries recomputed

Both entries are under `equivalentByLocale.de`. They are the only allowlist entries among the 11 ids. Before the fix, `verify:translation-quality` reported 6 issues: two stale source hashes, two stale target hashes and two "target effectively copies English source".

| Unit id | Field | Old | New |
| --- | --- | --- | --- |
| agents.power.card.tools.stat | sourceSha256 | `d73e58b8…31bac7` | `840f9d69ab7743bf47c296b634e8f7875f915436dffa80f73fd44791cd815b3e` |
| agents.power.card.tools.stat | targetSha256 | `d6169d5f…2508f6` | `0a936b3ab6a86e4c45eb61d887f8ff666f3c9b9c13b18a70f1cb9337cbe2bac6` |
| home.engine.mcp.fact.tools | sourceSha256 | `be82197e…21de34` | `8be49af2bfa643a2ff19a6ae39df807f99481e0aa687cea14f0035ecd747cbe3` |
| home.engine.mcp.fact.tools | targetSha256 | `04d91474…afaa886f` | `5409df185994143906c0de0723d88f8f16ccf58aab0137b3b5a63a69a1c63cb2` |

`reason` strings are unchanged. Afterwards the gate reports: "Translation quality check passed: 2458 active units × 6 locales".

## The stale-count ban

- `liveToolCountSources` gains `['showcase home page', readText('showcase/angular/src/app/pages/home/home-page.component.html')]`, so it now has 20 entries: 13 English sources and 7 xlf catalogs.
- The assertion is now `!/\b6[689](?:-tool| MCP| granular| registered| tools| Tools| available)|\b6[689] <(?:span|x)\b[^>]*>MCP|\(6[689] tools\)|Tools \(6[689] Total\)/u`, with the message "`${name}` contains no stale 66/68/69-tool surface claim". It runs over the same loop.

Dry run at `$P71_START`, then after this plan (match counts):

| Source | At $P71_START | Now | Forms matched at $P71_START |
| --- | --- | --- | --- |
| README.md | 2 | 0 | `69 registered` |
| mcp/README.md | 1 | 0 | `Tools (69 Total)` |
| extension/ui/onboarding.js | 4 | 0 | `68 MCP`, `68 tools`, `68 available` |
| home-page.component.html | 3 | 0 | `68 tools`, `68 <span ...>MCP` |
| about-page.component.html | 1 | 0 | `68-tool` |
| agents-page.component.html | 3 | 0 | `68 <span ...>MCP`, `68 tools` |
| agents-page.component.ts | 2 | 0 | `68 MCP` |
| support-page.component.html | 0 | 0 | — |
| support-page.component.ts | 2 | 0 | `68 MCP`, `68 granular` |
| llms.source.md, public/llms.txt | 2 each | 0 | `68-tool`, `68 MCP` |
| llms-full.source.md, public/llms-full.txt | 2 each | 0 | `68-tool`, `(68 tools)` |
| messages.xlf and es, ja, ko, zh-CN, zh-TW | 11 each | 0 | the five English forms, including `68 <x id="START_TAG_SPAN" .../>MCP` |
| messages.de.xlf | 21 | 0 | as above, plus the German targets' `68 Tools` |

Every count site in the inventory is matched before the edit, and nothing is matched after it.

## Verification

- **Task 1 verify (exit 0).** `node tests/showcase-build-smoke.test.js` gave 253/0 and `node tests/remote-control-rebrand.test.js` gave 24/0. The llms diff filter printed 0, and `git status --short showcase/angular/public/sitemap.xml` was empty. The crawler files were restored after each smoke run.
- **tests/showcase-angular-foundation.test.js** (unregistered) gave 54/0 both before and after the edit, and its PASS lines were identical.
- **The step-5 gate chain** ran once in the background before the Task 2 commit, as one `&&` chain, and exited **0** (`CHAIN_EXIT=0`). The chain:
  - `node showcase/angular/scripts/verify-locale-sync.mjs`
  - `npm --prefix showcase/angular run lint:i18n`
  - `npm --prefix showcase/angular run verify:translation-drift`
  - `npm --prefix showcase/angular run test:translation-tools`
  - `npm --prefix showcase/angular run test:marketing-i18n-seo`
  - `npm --prefix showcase/angular run verify:translation-quality`
  - `mkdir -p /tmp/extract-check-71 && npx --prefix showcase/angular ng extract-i18n --output-path /tmp/extract-check-71 && diff -u showcase/angular/src/locale/messages.xlf /tmp/extract-check-71/messages.xlf`
  - `npm --prefix mcp run build`
  - `node tests/mcp-version-parity.test.js`
  - `node tests/showcase-build-smoke.test.js`

  The results:
  - locale registry parity verified;
  - lint:i18n clean;
  - drift "2458 EN trans-units × 6 locales ... zero source drift";
  - translation-tools 18/0;
  - marketing-i18n-seo 14/0;
  - quality passed;
  - extraction complete (2,487 messages), and **the extraction `diff -u` printed nothing**;
  - the MCP build passed;
  - mcp-version-parity 217/0 (216 before, plus the new home-page ban assertion; 20 "contains no stale 66/68/69-tool surface claim" assertions);
  - showcase-build-smoke 253/0.
- **Also green:**
  - `npm --prefix showcase/angular run test:video-sitemap` 11/0;
  - **`npm --prefix showcase/angular run test:ci` ran locally** in Chrome Headless 155 with TOTAL 93 SUCCESS, exit 0;
  - `node tests/delegation-phase-contract.test.js` 1254/0;
  - `node --test tests/release-diff.test.mjs` 27/0;
  - mcp-version-parity on Node 20 (v20.20.2) 217/0, exit 0.
- **Task 2 verify (exit 0).** It ran drift, quality and parity, and `git status --short showcase/angular/public mcp/build` was empty: the build left the six force-tracked files byte-identical, and the crawler date churn was restored before the commit.
- **Acceptance greps:**
  - `grep -c "6\[689\]" tests/mcp-version-parity.test.js` printed 1;
  - `grep -c "pages/home/home-page.component.html" tests/mcp-version-parity.test.js` printed 1.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

**1. [Plan conditional not triggered; recorded for the owner] The llms-full tool list still names 66 tools under "(73 tools)"**
- **Found during:** Task 1, step 2.
- **What:** The `### MCP tool surface` section in llms-full.source.md and public/llms-full.txt lists tools by category name with no per-category counts. Checked against the built `tools/list`, it names 66 of the 73 tools. The missing seven are `complete_task`, `partial_task`, `fail_task`, `settings`, `capture_screenshot`, `get_session_replay` and `replay_session`. The gap was already there at `$P71_START`: the list named the same 66 under "(68 tools)".
- **Why left as is:** The plan's step 2 adds rows only "if the section breaks the count down by category", which this section does not do numerically. Adding the seven names would also break three other requirements of the plan: the Task 1 verify (every changed public llms line must contain 73 or 68/69), the must-have that the public llms files are "updated by digit-only edits", and the digit-only M-71-11b revert.
- **Suggested follow-up:** completing the list is copy that does not depend on the gate, except for `settings`, which depends on the release. It fits the M-71-10 docs pass at V6 or a later docs plan.

**2. [Procedure, equivalent output] The re-extraction went to a temp directory first.** Step 1 names `--output-path showcase/angular/src/locale`. `npx --prefix` runs the Angular CLI in the workspace, so that path would resolve under showcase/angular twice. I used the CI command form with `--output-path /tmp/71-11/extract`, confirmed the result was digit-only, and copied it over messages.xlf. The bytes are the same as a direct extraction, as the empty CI-style diff in the gate chain confirms.

**3. [Note] Coverage of the ban.** The plan's regex guards every English source and every xlf `<source>`, so a stale English count fails. In localized targets it fires only where the number is followed by `tools`/`Tools`, ` MCP`, `-tool` or a placeholder (for example the German `68 Tools`). Targets like the Spanish `68 herramientas` are covered indirectly: verify-translation-drift forces their `<source>` to match English, and the ban checks that `<source>`.

Otherwise the plan executed as written.

## Known Stubs

None.

## Deferred to Validation Block

These rows are restated from 71-VALIDATION.md, which is authoritative.

- **M-71-11b (V6, only if the decision file withholds MCP 0.12.0, as part of M-71-10 before its step 5).**
  1. In the mcp/README.md Tool Count Contract, swap the includes marker for `The documented count excludes the tools added in fsb-mcp-server 0.12.0, which is not published yet.`
  2. Set the README and mcp/README counts to 72, including README.md:280 (71-10 Deviation 3), and move `settings` out of the counted section.
  3. **Set 72 in this plan's sites with the same digit-only procedure.** That covers the 11 English component sites and 4 llms source sites in the Task 1 table, the 4 public llms lines, and the 11 unit ids above in all seven catalogs (source and target, `state` kept, re-extract first, never sync-xliff-targets). Then recompute the two `equivalentByLocale.de` allowlist hashes with the verifier's own `sourceHash`.
  4. Rerun the DOCS-a and DOCS-b commands. The extended ban accepts 72 unchanged, since it bans only 66, 68 and 69, and no `tests/**` file changes.
- **V6 CI.** The showcase production build (`npm --prefix showcase/angular run build`, prerender plus SSR) and the hreflang/canonical checks run in CI on the V6 merge. `test:ci` already passed locally (93/93), and CI reruns it on the merge.
- **Owner review (optional, with M-71-10).** Deviation 1: the llms-full tool list names 66 of the 73 tools.

## Self-Check: PASSED

- FOUND: all 18 modified files listed in key-files (committed in 21ce4d991 and 35c45dfb9)
- FOUND: commit 21ce4d991 (Task 1)
- FOUND: commit 35c45dfb9 (Task 2)
- `git status --short` is clean apart from this SUMMARY before its commit; the crawler files and mcp/build are unchanged.
