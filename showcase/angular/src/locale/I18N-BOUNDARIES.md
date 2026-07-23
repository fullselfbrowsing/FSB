# Showcase i18n boundaries

Policy for Angular templates covered by `npm run lint:i18n`.

> **Current-policy note (2026-07-15):** This document supersedes the completed
> v1.2.0 CI-05 decision that excluded the dashboard from localization. The
> v1.2.0 planning artifacts retain that original scope as historical record.

## In scope (must pass `lint:i18n`)

All showcase HTML under `src/app/**`, including:

- Home, about, agents, privacy, support, legal, sitemaps
- Product pages: lattice, phantom-stream, prometheus
- Dashboard (authenticated application surface)
- **Stats** (`src/app/pages/stats/**`) — included as of Phase 54 (CI-01), after Phase 53 verified live XLIFF coverage at 100%/100% across es/de/ja/zh-CN/zh-TW (see `.planning/phases/53-trans-unit-resync-stats-translation-transcreation-review/53-STATS-RECONCILIATION.md`)

The npm script is:

```text
eslint "src/**/*.html"
```

The former dashboard exemption was removed after it allowed an English-only route to
sit behind a localized shell. Static dashboard copy now follows the same marker and
catalog requirements as every other route; runtime-generated copy uses `$localize`.

The same requirement applies to user-facing TypeScript strings, metadata, JSON-LD,
and labels supplied to JavaScript-rendered UI. Those strings use `$localize` even
when they do not appear directly in an Angular template.

`npm run verify:translation-quality` rejects missing targets, stale/orphan units,
placeholder changes, protected-literal changes, copied-English targets, retained
English prose, over-broad non-code `translate=no` prose, translator annotations,
unbalanced parentheses, invariant technical-term corruption, and targets shared
across every locale. Only genuine
invariants (brands, commands, code identifiers, versions, and similar tokens) may
remain source-equal. Exact-copy exceptions in `same-source-allowlist.json` are
bound to the current source hash; locale-specific punctuation equivalents are
bound to both the source and target hashes. A wording change therefore requires a
fresh review instead of silently inheriting an old exception.

Captured web-page DOM and arbitrary text supplied by users, web pages, extensions,
or AI providers remain producer-owned and are not rewritten. Package-owned viewer
chrome and known runtime status values are localized before presentation. This
boundary prevents localization from corrupting mirrored pages or changing the raw
dashboard/extension protocol payload.

## Related docs

- `DO-NOT-TRANSLATE.md` — brand/term rules for XLIFF targets
- `same-source-allowlist.json` — hash-bound invariant and punctuation-equivalent exceptions
- `.planning/REQUIREMENTS.md` — historical v1.2.0 requirements; CI-05 is
  superseded for the current dashboard policy
