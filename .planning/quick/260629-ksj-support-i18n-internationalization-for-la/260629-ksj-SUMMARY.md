---
quick_id: 260629-ksj
slug: support-i18n-internationalization-for-la
description: Support i18n internationalization for latest updated showcase content
status: complete
completed: 2026-06-29
commit: working-tree
---

# Quick Task 260629-ksj Summary

## Completed

- Added `$localize` coverage for updated Agents schema metadata, Support FAQ JSON-LD mirror strings, Stats runtime view/metric/error/date labels, and the Stats document title.
- Switched Stats numeric formatting from hardcoded `en-US` to the active Angular locale via `LOCALE_ID`.
- Audit fix: localized Stats chart-facing labels/tooltips that appear in Chart.js legends and hover text.
- Second audit fix: repaired stale localized `about.actions.subtitle` targets so they now match the updated 60-action / 66-tool source copy and preserve the protected `MCP` placeholder.
- Refreshed `messages.xlf` and seeded missing targets in `messages.es.xlf`, `messages.de.xlf`, `messages.ja.xlf`, `messages.zh-CN.xlf`, and `messages.zh-TW.xlf` from source text.
- Added recent brand/technical terms to `DO-NOT-TRANSLATE.md`: `AI`, `CID`, `DSSE`, `Hermes`, and `SDK`.
- Restored build-date-only crawler artifact churn after the production build.

## Verification

- PASS: `npm --prefix showcase/angular run ng -- extract-i18n --output-path src/locale --out-file messages.xlf`
- PASS: all locale catalogs report `0 missing targets`.
- PASS: `npm --prefix showcase/angular run lint:i18n`
- PASS: `npm --prefix showcase/angular run build`

## Notes

- No git commit was created because the workspace already contains broad uncommitted page-conversion work; committing this quick task as a normal GSD commit would risk bundling unrelated prior changes.
- Angular build still reports the existing locale-data fallback warnings for `zh-CN` and `zh-TW`; the build exits successfully.
