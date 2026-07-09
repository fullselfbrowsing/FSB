# Showcase i18n boundaries

Policy for which Angular templates must pass `npm run lint:i18n` and which are permanently excluded.

## In scope (must pass `lint:i18n`)

All marketing and public showcase HTML under `src/app/**`, including:

- Home, about, agents, privacy, support, legal, sitemaps
- Product pages: lattice, phantom-stream, prometheus
- **Stats** (`src/app/pages/stats/**`) — included as of Phase 54 (CI-01), after Phase 53 verified live XLIFF coverage at 100%/100% across es/de/ja/zh-CN/zh-TW (see `.planning/phases/53-trans-unit-resync-stats-translation-transcreation-review/53-STATS-RECONCILIATION.md`)

The npm script is:

```text
eslint "src/**/*.html" --ignore-pattern "src/app/pages/dashboard/**"
```

## Permanently out of scope: dashboard

**Path:** `src/app/pages/dashboard/**`  
**Requirement:** CI-05 (v1.2.0 Showcase i18n Completeness)

The dashboard is an **authenticated app surface**, not marketing content. It stays on the `lint:i18n` ignore-pattern **by design**, not as deferred translation debt.

Rationale:

- Copy and UX track the logged-in product experience, not the public locale marketing site.
- Translating it would imply the same six-locale marketing bar without a product decision to ship a localized app shell.
- REQUIREMENTS.md lists “Dashboard page translation” under Out of Scope as an explicit permanent boundary.

Do **not** remove the dashboard ignore-pattern without a new milestone that deliberately scopes dashboard localization.

## Related docs

- `DO-NOT-TRANSLATE.md` — brand/term rules for XLIFF targets
- `.planning/REQUIREMENTS.md` — CI-01, CI-05
