---
phase: 68-autopilot-fast-mode
plan: 10
subsystem: showcase privacy page (all seven catalogs) + privacy-page suite
tags: [jev, fast-mode, privacy, limited-use, chrome-web-store, i18n, showcase, auto-01, d-06, d-07, m-68-09, m-68-10, m-68-11, t-68-13, t-68-20, t-68-21, t-68-22]

# Dependency graph
requires:
  - phase: 68-12
    provides: "tests/fixtures/jev-fast-disclosure-facts.js (SHARED_PHRASES, PAGE_ONLY_PHRASES, FORBIDDEN_PATTERNS, textOf) and the #fsbJevFastModeCard block in extension/ui/control_panel.html"
  - phase: 67
    provides: "67 D-24 retention facts (body-free 7-day decision records, 365-day daily totals) and the External Research 2 TypeSafe/OpenRouter terms"
provides:
  - "privacy.archive.september29.{summary,body}: the September 29, 2026 policy archived as the first Policy History entry in all six locales, its body assembled from each locale's existing page translations"
  - "The #jev-fast-mode section (24 units), privacy.section.external.li.6, the qualified TLDR and six other qualified units, a separate fast-mode Limited Use statement, and Last updated: October 17, 2026"
  - "tests/showcase-privacy-page.test.js sections 7 and 8: archive checks plus fast-mode disclosure, copy-accuracy and fact-list alignment for both the page section and the control_panel.html card (98 checks, was 61)"
affects: [68-11, 70, V5, V6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Archive bodies are built by substitution: each page unit's source is remapped onto the archive unit's placeholders (by equiv-text, in-page #anchors unwrapped) and located in the archive source, then replaced by that locale's target. The algorithm reproduces the committed privacy.archive.september.body target byte for byte in all six locales when rerun against 52f281ca^"
    - "Rendered-text matching for templates: inline translate=\"no\" spans are unwrapped without a gap before the shared textOf(), so \"<span>FSB</span>'s server\" reads as \"FSB's server\""

key-files:
  created:
    - .planning/phases/68-autopilot-fast-mode/68-10-SUMMARY.md
  modified:
    - showcase/angular/src/app/pages/privacy/privacy-history-archive.component.html
    - showcase/angular/src/app/pages/privacy/privacy-page.component.html
    - showcase/angular/src/locale/messages.xlf
    - showcase/angular/src/locale/messages.de.xlf
    - showcase/angular/src/locale/messages.es.xlf
    - showcase/angular/src/locale/messages.ja.xlf
    - showcase/angular/src/locale/messages.ko.xlf
    - showcase/angular/src/locale/messages.zh-CN.xlf
    - showcase/angular/src/locale/messages.zh-TW.xlf
    - tests/showcase-privacy-page.test.js

key-decisions:
  - "The new archive id is september29 (the september id already archives the September 28 text). Its summary reads \"September 29, 2026 / v0.9.91: Region (city-level) metric, level-by-level anonymity floor and globe place labels (full archived text)\". That is what the September 29 update (52f281ca) introduced; the plan's example wording named August features"
  - "The archive is the page exactly as it stood before this plan, including fe59ed99's Oct 14 copy edits (made without a date move). Its note says \"as it stood from September 29, 2026, before the fast-mode update\""
  - "Execution date and new Last updated: October 17, 2026"
  - "The fact-list alignment test unwraps inline <span [attr.translate]=\"'no'\"> wrappers before textOf(). The shared textOf() turns every tag into a space, which would read \"FSB 's server\" and could never match the SHARED phrase \"FSB's server\" while the page wraps FSB as the i18n rules require. The fixture itself is unchanged, so the card suite behaves exactly as 68-12 left it"
  - "\"Chrome Web Store\" is wrapped alone, not the whole \"Chrome Web Store User Data Policy\". The quality gate rejects a translate=no span holding five or more words, and the policy's name is translated in every locale"
  - "Locale terminology follows each catalog's existing terms: de Schnellmodus / Erweiterte Einstellungen / Bedienfeld (Sie, except the TLDR, which keeps its existing du); es modo rápido / Ajustes avanzados; ja 高速モード / 詳細設定; ko 빠른 모드 / 고급 설정 / 오토파일럿; zh-CN 快速模式 / 高级设置 / 自动驾驶; zh-TW 快速模式 / 進階設定 / 自動駕駛"

patterns-established:
  - "When a template edit adds a policy section, every sent and never-sent sentence is scoped to the recipient (\"never sent to FSB's server\"), and the test cross-checks the page section and the extension card against the same fact list"

requirements-completed: [AUTO-01]

# Metrics
duration: 22min
completed: 2026-10-17
---

# Phase 68 Plan 10: Disclose Jev fast mode on the public privacy page, in all six locales Summary

**The privacy page now has a "Jev fast mode (optional, off by default)" section, in English and the six translated locales.** The section covers:
- what fast mode sends to FSB's server and what it never sends there;
- the recipients: full-selfbrowsing.com, then TypeSafe AI directly or through OpenRouter;
- what FSB keeps: body-free decision records for 7 days and daily totals for 365 days;
- TypeSafe's terms as TypeSafe states them;
- the controls and the calibration status;
- a separate fast-mode Limited Use statement whose first sentence affirms compliance.

Before the page changed, the September 29, 2026 text was archived as the first Policy History entry in every locale. The TLDR and six other absolute statements are qualified for fast mode, External Services has a new fast-mode bullet, and the date is October 17, 2026. The page section and the Advanced Settings card are both tested against the 68-12 fact list.

## Performance

- **Duration:** about 22 min
- **Started:** 2026-10-17T11:54Z
- **Completed:** 2026-10-17T12:16Z
- **Tasks:** 2 of 2
- **Files modified:** 10 (2 templates, 7 catalogs, 1 suite), plus this SUMMARY

## Accomplishments

- **Archive first (T-68-22, D-07, F7).** `privacy-history-archive.component.html` now opens with a new `<details class="policy-version">` entry (`@@privacy.archive.september29.summary` on line 2, `.body` on line 6), above the September 28 entry (`september`, now line 242). The body is the page from the TLDR through Contact, changed the same way the September entry was:
  - h2 becomes h3;
  - ids and nested i18n attributes are dropped;
  - the TLDR callout wrapper is dropped;
  - in-page `#anchor` links are unwrapped;
  - the curl `<pre>` is unindented;
  - Policy History is left out.

  No existing entry changed.
- **Six locale archive targets from the existing page translations.** A one-off script under /tmp builds each target. It maps every page unit's placeholders onto the archive unit's placeholders by equiv-text, drops the `#local-service`, `#relay-non-persistence` and `#telemetry-region` link placeholders, finds each unit in the archive source in order, and substitutes that locale's target for it. It also checks that only placeholders sit between units.

  Rerun against `52f281ca^`, the same script reproduced the committed `privacy.archive.september.body` target byte for byte in de, es, ja, ko, zh-CN and zh-TW. Only the summary and the archive note are new translations.
- **The disclosure (AUTO-01, D-07).** Every sent and never-sent claim is scoped to FSB's server. The scope paragraph says that fast mode does not change what goes to the AI provider the user chose, and that the provider's page descriptions can include form-field contents. No unit says that FSB never reads typed text. No unit says that TypeSafe retains nothing: its terms are given as "TypeSafe AI states..." plus "keeps data as long as reasonably necessary". Both routes are named.
- **Limited Use (sync issue 3, External Research 1).** `@@privacy.section.jevFastMode.limitedUse.body` opens with "FSB's use of information received through fast mode complies with the Chrome Web Store User Data Policy, including the Limited Use requirements." It then states the single purpose, that the transfer to TypeSafe AI (directly or through OpenRouter) happens only to provide the feature, that the information is never sold, never used for advertising or creditworthiness, and that people do not read it except as the policy allows. The telemetry Limited Use paragraph and every `@@PRIVACY_TELEMETRY_*` unit are byte-identical in the template.
- **Translations (D-07, T-68-21).** All 33 new and changed units were translated into de, es, ja, ko, zh-CN and zh-TW, with no English-as-translation. In every unit, every locale keeps the source's placeholder sequence and the order of its translate="no" literals; ja and ko sentences were restructured where needed to keep that order. The units went through extract, then sync (33 needs-translation per locale), then extract-targets-json, then assemble into /tmp, then `mv` into place. A final sync was a no-op (2458 preserved, 0 seeded or changed).

## Unit ids

**New (Task 1, 2):** `privacy.archive.september29.summary`, `privacy.archive.september29.body`.

**New (Task 2, 25):**
- `privacy.section.external.li.6`
- `privacy.section.jevFastMode.` followed by: `title`, `intro`, `control`, `calibration`, `scope`, `sent.title`, `sent.li.1` to `sent.li.6`, `notSent.title`, `notSent.li.1` to `notSent.li.4`, `secrets`, `recipients`, `retention`, `typesafe`, `openrouter`, `limitedUse.title`, `limitedUse.body`

**Changed (Task 2, 8):** `privacy.header.updated`, `privacy.tldr.body`, `privacy.section.dataCollection.body`, `privacy.section.dataCollection.li.1`, `privacy.section.dataCollection.li.2`, `privacy.section.external.li.1`, `privacy.section.noTracking.body`, `privacy.section.speechToText.li.4`.

## Qualified sentences

| Unit | Before | After |
|------|--------|-------|
| header.updated | Last updated: September 29, 2026 | Last updated: October 17, 2026 |
| tldr.body | "...no browsing data is collected by FSB servers. AI calls go directly from your browser to the provider you choose." | "...FSB servers collect no browsing data unless you turn on the optional fast mode described below. Calls to the AI provider you choose go directly from your browser to that provider." |
| tldr.body | "The only data that ever leaves your machine for FSB is opt-out anonymous usage telemetry..." | "Apart from fast mode, the only data that ever leaves your machine for FSB is opt-out anonymous usage telemetry... Fast mode is off by default; when you turn it on, FSB's autopilot sends short step descriptions to FSB's server, which asks TypeSafe AI to pick simple clicks." |
| dataCollection.body | "FSB operates entirely within your browser." | "Apart from the optional fast mode described below, FSB operates entirely within your browser." |
| dataCollection.li.1 | "No browsing history is collected or stored beyond the current session" | adds "The one exception is the optional fast mode, which sends the origin, path and title of the page it is working on to FSB's server, where they are not kept" |
| dataCollection.li.2 | "...analyzed locally and discarded after each automation step..." | adds "With the optional fast mode on, a short step description also goes to FSB's server, which keeps no page content" |
| external.li.1 | "Hosted API calls are made only to the provider you select (...)" | "Apart from the optional fast mode below, hosted API calls are made only to the provider you select (...)" |
| noTracking.body | "The one piece of first-party data FSB sends home is the opt-out Anonymous Usage Telemetry..." | "Apart from the optional fast mode described above, the one piece of first-party data FSB sends home is..." |
| speechToText.li.4 | "...never logged, persisted, or transmitted outside the active AI request you choose to send" | "...never logged or persisted. They leave your device only as part of the task you choose to send: to your AI provider and, if fast mode is on, as task text to FSB's server" |

**Reviewed and left unchanged:**
- **Scoped to another feature:** siteApi (cookies are never sent), relay li.4 (fast mode persists no page content), delegatedAgents.body (fast mode is autopilot only), memory li.2, apiKeys.body, the autoPasswords and paymentMethods "never in any AI prompt" lines, and localService.li.6.
- **permissions.body ("nothing is sent off-device on the strength of any of them"):** this is about what the permissions cause by themselves, and it applies equally to the AI-provider path.
- **Telemetry units:** they are pinned and untouched. Instead, the fast-mode retention paragraph says that its records are kept apart from the telemetry and that the telemetry lists cover telemetry only.

## Task Commits

1. **Task 1: Archive the September 29, 2026 policy as the first Policy History entry in all locales:** `989d94fe` (docs)
2. **Task 2: Add the Jev fast mode disclosure, qualify absolute claims, add the Limited Use statement and translate everything:** `207d3df1` (docs)

**Plan metadata:** the `docs(68-10)` SUMMARY commit that follows.

## Files Created/Modified

- `showcase/angular/src/app/pages/privacy/privacy-history-archive.component.html`: the new first archive entry (+240 lines)
- `showcase/angular/src/app/pages/privacy/privacy-page.component.html`: the date, the qualified units, the External Services bullet, the `#jev-fast-mode` section and the Limited Use statement
- `showcase/angular/src/locale/messages.xlf`: copied from a fresh `ng extract-i18n` after each task
- `showcase/angular/src/locale/messages.{de,es,ja,ko,zh-CN,zh-TW}.xlf`: synced and assembled; 2458 targets, all `state="translated"`
- `tests/showcase-privacy-page.test.js`: section 7 (archive, 6 checks) and section 8 (fast mode, 31 checks); every pre-existing check unchanged

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

No Rule 1-3 auto-fix fired and nothing needed a Rule 4 decision. Three choices were made within the plan's discretion:

1. **How the alignment test reads the page section.** The plan says to apply `textOf` to the section. `textOf` turns every tag into a space, so a template that wraps FSB in a translate="no" span (an i18n rule of this plan) reads "FSB 's server" and can never contain the SHARED phrase "FSB's server". The test therefore unwraps only the inline `<span [attr.translate]="'no'">X</span>` wrappers before calling the shared `textOf`, which gives the text a reader sees. The fixture is unchanged, and the card is checked with plain `textOf`, exactly as 68-12 does.
2. **Archive summary wording.** It names what the September 29 update actually introduced (city-level region, level-by-level floor, globe place labels). The plan's example named August-era features.
3. **Extra checks beyond the plan's list.** Three were added:
   - the section sits between External Services and Local Agent Service;
   - the Limited Use statement's first sentence is the exact D-07 sentence;
   - the archive body carries no nested i18n attribute.

## TDD Gate Compliance

Neither task is `tdd="true"`, so no RED/GREEN commit pair was required. Task 2 still wrote its checks first: before the page edit, 27 of the 98 checks failed (71 passed, including the 2 card checks that 68-12 already satisfies). The plan asks for one commit per task, so the tests and the page landed together in `207d3df1`.

## Verification

- `node tests/showcase-privacy-page.test.js`: 98 passed, 0 failed (Node 24 and the official Node 20.20.2 binary). 67 after Task 1.
- `npm --prefix showcase/angular run lint:i18n`: clean after each task.
- `verify:translation-drift`: 2458 EN trans-units × 6 locales, zero source drift.
- `verify:translation-quality`: 2458 active units × 6 locales, passed.
- CI extraction diff (`ng extract-i18n --output-path /tmp/extract-check` + `diff -u`): empty after each task.
- `test:translation-tools` 18/18; `tests/showcase-angular-foundation.test.js` 54/54.
- An extra check beyond the plan: `npm --prefix showcase/angular run build` (prerender + SSR, all locales) exited 0. On the prerendered HTML:
  - `verify:hreflang`: 848 pass;
  - `verify:marketing-i18n-seo`: passed for 28 pages;
  - `verify-bundle-budgets.mjs`: every main bundle is about 4.9 KB gzipped, against the 1 MB limit;
  - every locale's `/privacy` page renders `#jev-fast-mode` and the archive entry.
- The build rewrote `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}` (date churn). They were restored with `git checkout --`, and `git status --short showcase/angular/public` is empty.
- Acceptance greps:
  - `privacy.archive.september29` appears 2 times, and its summary is on line 2, before `september` on line 242;
  - `trans-unit id="privacy.archive.september29.body"` appears once in each locale;
  - `git diff --quiet 989d94fe~1 989d94fe -- privacy-page.component.html` exits 0;
  - `id="jev-fast-mode"` appears 1 time and `privacy.section.jevFastMode.limitedUse.body` 1 time;
  - the template diff has no `PRIVACY_TELEMETRY_` line;
  - the TypeSafe no-retention grep and the "FSB never reads" grep both print nothing.

## Known Stubs

None. Every sentence is final copy taken from the plan's copy facts.

## Threat Flags

None. The change is copy and catalogs only, with no new endpoint, script or storage. T-68-13, T-68-20, T-68-21 and T-68-22 are mitigated as planned. The human legal review of the translations is still deferred (M-68-09).

## Deferred to Validation Block

- **M-68-09 (V5):** human review of the translated privacy text in de, es, ja, ko, zh-CN and zh-TW. Priority units are `limitedUse.body`, `typesafe`, `retention`, `scope`, `notSent.*` and the qualified TLDR.
- **M-68-10 (V6):** the deployed page carries the section, the Limited Use statement, the September 29 archive entry and the October 17, 2026 date, and the route sentence ("either directly or through OpenRouter"), the External Services bullet and the OpenRouter logging sentence match V2's route.
- **M-68-11 (V6):** the Chrome Web Store privacy-practices form, certifications and listing text agree with this page and the card (check against `SHARED_PHRASES`).
- **M-68-12 (V6):** consent review for turning the switch on through MCP. The control paragraph now discloses that an MCP client connected to FSB can change the setting.

Deferred: M-68-09 (V5), M-68-10, M-68-11, M-68-12 (V6).

## User Setup Required

None.

## Next Phase Readiness

- 68-11's pin audit should record the 98-check privacy suite. The suite now reads `extension/ui/control_panel.html` (the card block) and `tests/fixtures/jev-fast-disclosure-facts.js`.
- Phase 70 must re-verify this copy once fast mode also covers `run_task`. Today the intro, scope and Limited Use text say "autopilot".

## Self-Check: PASSED

- FOUND: showcase/angular/src/app/pages/privacy/privacy-history-archive.component.html (september29 at lines 2 and 6)
- FOUND: showcase/angular/src/app/pages/privacy/privacy-page.component.html (id="jev-fast-mode", limitedUse.body)
- FOUND: tests/showcase-privacy-page.test.js (98 checks)
- FOUND: commit 989d94fe (docs(68-10) archive)
- FOUND: commit 207d3df1 (docs(68-10) disclosure)
