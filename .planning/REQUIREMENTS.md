# Requirements: FSB (Full Self-Browsing)

**Defined:** 2026-07-07
**Core Value:** Reliable single-attempt execution -- the AI decides correctly, the mechanics execute precisely.
**Milestone:** v1.2.0 Showcase i18n Completeness

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Translation Audit

- [x] **AUDIT-01**: A full-page audit produces a per-page, per-locale, per-trans-unit verdict distinguishing "coverage" (i18n-marked + translated target exists) from "currency" (target still matches the current English source) across every current showcase route.
- [x] **AUDIT-02**: The audit traces the orphaned `translations.stats-274.*.json` artifacts end-to-end into (or explicitly out of) the live `messages.<locale>.xlf` files the build consumes.

### Translation Resync

- [x] **RESYNC-01**: Every trans-unit the audit identifies as drifted (English source changed without a matching translation update) is resynced across all 5 translated locales (es, de, ja, zh-CN, zh-TW), preserving `DO-NOT-TRANSLATE.md` brand/term rules and `<x id=.../>` placeholder alignment.
- [x] **RESYNC-02**: The stats page reaches full translation coverage across all 5 locales.
- [x] **RESYNC-03**: Hero headlines and primary CTAs (~10-20 strings) receive a transcreation-lens review rather than literal translation.

### CI Enforcement

- [x] **CI-01**: The `lint:i18n` ignore-pattern for `src/app/pages/stats/**` is removed only after RESYNC-02 is verified complete.
- [x] **CI-02**: A new `verify-translation-drift.mjs` CI gate fails the build when any trans-unit's English `<source>` text changes without a matching update in one of the 5 translated locale files, diffing per trans-unit `id` (not whole-file/line-count).
- [x] **CI-03**: The new drift gate is back-tested against this repo's own git history (known-clean churn commits plus commit `6d3ad363`) before being wired hard-fail into CI, so it doesn't chronically false-positive on routine `ng extract-i18n` re-extraction churn.
- [x] **CI-04**: The drift gate's target-locale list is derived dynamically from the existing locale registry, not hardcoded.
- [x] **CI-05**: The dashboard page's `lint:i18n` exclusion is documented as a permanent, intentional architectural boundary (authenticated app surface, not marketing content) rather than left as open deferred debt.

### Locale Routing

- [ ] **ROUTE-01**: A picker-set `fsb-locale` cookie naming a valid, non-default supported locale redirects the bare-`/` request to that locale's subpath instead of short-circuiting to the EN prerender (closes WARNING-02).
- [ ] **ROUTE-02**: The default-locale case (cookie value = `en`) still falls through correctly without redirecting to a 404ing `/en/` path.

### Visual QA

- [ ] **VISUAL-01**: German and zh-CN/zh-TW copy on the highest-copy-density routes receives a targeted manual visual spot-check for text-expansion/line-wrap issues.

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Translation Quality

- **QA-01**: Native-speaker/bilingual-fluent QA pass across all resynced trans-units and the stats page (this milestone accepts AI-translation quality; a full re-review is a future quality bar, not reapplication of an existing one).

### Tooling

- **I18N-FUTURE-01**: Migrate the stats page off its ad hoc `translations.stats-274.*.json` mechanism into the main XLIFF pipeline.
- **I18N-FUTURE-02**: Full automated per-locale visual regression/screenshot-diffing pipeline.
- **I18N-FUTURE-03**: Translation-freshness / "last synced" reporting surface.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Dashboard page translation | Authenticated app surface, not marketing content -- explicit permanent boundary (see CI-05), not deferred debt |
| Commercial TMS adoption (Lokalise, Crowdin, Smartling, Phrase, doloc.io) | Site scale (6 locales, ~942 trans-units, ~7 routes) doesn't warrant one; milestone brief requires a no-paid-SaaS solution |
| `ng-extract-i18n-merge` adoption | Legitimate but separate future decision; rewrites `angular.json`'s `extract-i18n` builder, not required to satisfy this milestone's CI-gate requirement |
| Re-deriving or changing the supported-locale list | Fixed at en/es/de/ja/zh-CN/zh-TW per v0.9.63's `LocaleService` + locale-constants module -- not up for debate |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUDIT-01 | Phase 52 | Complete |
| AUDIT-02 | Phase 52 | Complete |
| RESYNC-01 | Phase 53 | Complete |
| RESYNC-02 | Phase 53 | Complete |
| RESYNC-03 | Phase 53 | Complete |
| CI-01 | Phase 54 | Complete |
| CI-02 | Phase 55 | Complete |
| CI-03 | Phase 55 | Complete |
| CI-04 | Phase 55 | Complete |
| CI-05 | Phase 54 | Complete |
| ROUTE-01 | Phase 56 | Pending |
| ROUTE-02 | Phase 56 | Pending |
| VISUAL-01 | Phase 53 | human_needed |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-07*
*Last updated: 2026-07-07 after roadmap creation (Phases 52-56)*
