# Phase 53 Research: Trans-Unit Resync, Stats Translation & Transcreation Review

**Researched:** 2026-07-09  
**Domain:** Showcase Angular i18n XLIFF target updates, stats-274 artifact retirement, marketing transcreation, DE/CJK visual spot-check  
**Confidence:** HIGH (live XLIFF/template/script inspection + Phase 52 audit artifacts)

## Summary

Phase 53 is a content + artifact-cleanup phase on a well-understood surface. The Phase 52 audit already fixed the scope: **exactly 5 currency-FAIL trans-units** across 5 locales, **stats live-XLIFF coverage already 100%/100%**, and **6 “missing” stats-274 keys that are dead template ids** (safe to retire with the JSON sidecars). The established `extract-targets-json.mjs` → edit map → `assemble-xliff-target.mjs` round-trip is the safest mechanical path for both resync and transcreation. Visual QA is manual (de/zh-CN/zh-TW on privacy, phantom-stream, about, home) after copy lands; no new harness.

## Drifted Units (RESYNC-01) — Live EN Sources

| Id | EN `<source>` (abbrev) | Stale pattern |
|----|------------------------|---------------|
| `agents.meta.description` | Drive your real Chrome from OpenClaw, **Hermes**, Claude, Codex, Cursor… skill plus **66 MCP tools**… | ES still omits Hermes / older “polished OpenClaw skill” wording |
| `agents.schema.software.description` | Canonical OpenClaw **and Hermes** onboarding… Doctor, stdio, consent-gated installer, **66 MCP browser tools**… | ES omits Hermes + 66-tools clause |
| `home.meta.description` | Local-first Chrome automation and MCP browser layer… trigger watchers, real uploads, guarded first-party API… | ES still old “open-source Chrome extension / natural language” blurb |
| `support.faq.q.tools.a` | Long HTML with many `<x id=…/>` placeholders (FSB/MCP/code spans); mentions upload_file, triggers, search_capabilities, invoke_capability | Targets still older tool list (spreadsheets/vault wording) |
| `support.schema.faq.tools.a` | Plain-text twin of FAQ answer (668 chars), same semantic update | Same stale tool list |

**Placeholder rule:** For `support.faq.q.tools.a`, copy every `<x id="…"/>` token byte-identical from the current EN `<source>` into each locale `<target>`; only human-readable text between placeholders is translated. Brands in `DO-NOT-TRANSLATE.md` stay verbatim (FSB, MCP, OpenClaw, Hermes, Claude, Codex, Cursor, tool ids, etc.).

## Stats Coverage (RESYNC-02) — Reconciliation

- Audit route table: stats **coverage 100% / currency 100%** for all 5 locales (52 marked ids).
- Live EN `SHOWCASE_STATS_FSB_*` set is 12 ids (all present with targets in locale XLIFFs).
- Six JSON keys absent from EN XLIFF **and** from current stats templates → obsolete (hardening commits `da356602` / `931bc5af`).
- `translations.stats-274.*.json` referenced only by `merge-and-assemble-274.mjs` (one-shot historical merge helper) and the Phase 52 audit script’s read-only trace — **not** by Angular build/runtime.
- **Action:** Delete the five JSON files; leave `merge-and-assemble-274.mjs` as historical (or add a one-line comment that inputs were retired). Document `idDriftFromTemplate=13` as JSON-scoped (includes dead ids), not 13 live strings to translate.
- Do **not** touch the 54 orphaned XLIFF ids (Phase 55).

## Transcreation Surface (RESYNC-03)

Candidate @@ids (narrow to ~10–20 primary marketing strings):

- Home: `home.hero.title`, `home.hero.subtitle`, `home.hero.cta.getStarted`, `home.hero.cta.seeAction`, `home.cta.openSource.title`, `home.cta.openSource.desc`, `home.cta.openSource.github`
- About: `about.hero.title`, `about.hero.subtitle`
- Agents: `agents.hero.title`, `agents.hero.subtitle`, `agents.hero.cta.install`, `agents.hero.cta.github`, `agents.cta.title`, `agents.cta.install`
- Lattice / Phantom Stream heroes if needed to reach ~10–20: `lattice.hero.title`, `lattice.hero.tagline`, `phantomStream.hero.title`, `phantomStream.hero.tagline`

Skip scroll-cue / eyebrow chrome unless needed for count. AI transcreation OK this milestone (QA-01 deferred).

## Edit Path (Recommended)

1. For each locale `L` in `es,de,ja,zh-CN,zh-TW`:
   - `node scripts/extract-targets-json.mjs src/locale/messages.$L.xlf > /tmp/$L.json`
   - Update keys for the 5 drifted ids (+ transcreation set) in the JSON map
   - `node scripts/assemble-xliff-target.mjs $L /tmp/$L.json > src/locale/messages.$L.xlf`
2. Re-run `node scripts/audit-translation-completeness.mjs` — expect **zero** currency FAILs for the 5 ids; stats still 100%/100%.
3. Note: assemble rebuilds from EN `messages.xlf` + full target map → preserves structure; orphans currently in locale files that are **absent from EN** will be dropped on reassemble. **CRITICAL:** Phase 52 reported 996 units/locale vs 942 EN — the 54 orphans live only in locale files. Reassemble from EN would **delete** those 54 orphans.

**Safer alternative for this phase:** **In-place `<target>` replacement** inside each existing `messages.$L.xlf` for only the ids being updated (regex replace within the matching `<trans-unit id="…">` block). This preserves the 54 orphans for Phase 55 and avoids a 996→942 collapse.

**Locked recommendation:** Use **in-place target edits** for RESYNC-01 and RESYNC-03. Do not run full assemble-from-EN unless orphan preservation is explicitly handled (merge orphans back) — out of scope / Phase 55 territory.

## Visual QA (VISUAL-01)

- Locales: `de`, `zh-CN`, `zh-TW`
- Routes: `/privacy`, `/phantom-stream`, `/about`, `/` (home) under each locale subpath
- Build: `angular.json` has `localize: true` on production; serve via `ng serve` / production localize build as available
- Deliverable: `53-VISUAL-QA.md` with pass/fail per route×locale; note truncation/overflow/broken CTAs
- If browser UAT unavailable in agent environment: document attempted build + string-length expansion notes + mark remaining items `human_needed` without inventing passes

## Don't Do

- Do not re-add the 6 dead stats-274 ids to XLIFF
- Do not remove stats `lint:i18n` ignore (Phase 54)
- Do not delete 54 orphaned XLIFF units
- Do not wire CI drift gate (Phase 55)
- Do not full-reassemble from EN without orphan preservation

## Validation Architecture

### Test Framework
- Primary proof: `node showcase/angular/scripts/audit-translation-completeness.mjs` (exit 0; report shows 0 currency FAIL for the 5 ids)
- Secondary: `rg`/python asserts that each of 5 ids’ locale `<source>` matches EN `<source>` (currency) and `<target>` non-empty; placeholder `<x id=` sets match EN for `support.faq.q.tools.a`
- Stats-274: `test ! -f` for the five JSON paths
- No new unit-test framework required

### Quick feedback
```bash
cd showcase/angular && node scripts/audit-translation-completeness.mjs
```

### Per-requirement checks
| Req | Automated signal |
|-----|------------------|
| RESYNC-01 | Audit currency FAIL list empty for the 5 ids in all 5 locales |
| RESYNC-02 | Stats 100%/100% in audit; stats-274 JSON files gone; reconciliation note in SUMMARY |
| RESYNC-03 | Listed hero/CTA ids updated (git diff touches those `<target>`s); optional spot read |
| VISUAL-01 | `53-VISUAL-QA.md` exists with de/zh-CN/zh-TW × 4 routes |

## RESEARCH COMPLETE
