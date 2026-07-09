# Phase 54: Stats Lint Gate Flip & Dashboard Boundary Documentation - Context

**Gathered:** 2026-07-09  
**Status:** Ready for planning  
**Mode:** Autonomous (yolo + assumptions)

<domain>
## Phase Boundary

Remove the stats-page `lint:i18n` ignore-pattern now that RESYNC-02 is verified, ensure `npm run lint:i18n` passes including stats templates, and document the dashboard exclusion as a permanent architectural boundary (CI-05). Does not build the drift CI gate (Phase 55) or fix WARNING-02 (Phase 56).

</domain>

<decisions>
## Implementation Decisions

### Stats lint flip (CI-01)
- Remove `--ignore-pattern "src/app/pages/stats/**"` from `package.json` `lint:i18n` only.
- Keep dashboard ignore-pattern.
- Fix the three known `@angular-eslint/template/i18n` failures on stats (`aria-live` on lines 18/23/45) by adding `aria-live` (and `aria-busy` if needed) to the existing `ignoreAttributes` list in `eslint.config.js` — same class as already-ignored `aria-hidden` / `aria-controls` (structural ARIA, not user-facing copy). Do **not** invent fake `i18n-aria-live` markers for the literal token `polite`.

### Dashboard documentation (CI-05)
- Document in-repo next to the ignore: expand the `lint:i18n` script comment and/or add a short `showcase/angular/src/locale/I18N-BOUNDARIES.md` (or section in DO-NOT-TRANSLATE.md / adjacent) stating dashboard is permanently excluded as authenticated app surface, not deferred marketing debt.
- Prefer a dedicated small markdown file under `showcase/angular/src/locale/` so the rationale lives with other i18n policy docs.

### Claude's Discretion
- Exact wording of the boundary doc; whether to also add a one-line comment above the eslint ignoreAttributes ARIA group.

</decisions>

<code_context>
## Existing Code Insights
- `package.json` lint:i18n currently ignores dashboard + stats.
- `eslint.config.js` already documents ARIA structural ignoreAttributes.
- Phase 53 `53-STATS-RECONCILIATION.md` confirms stats live coverage 100%/100%.

</code_context>

<specifics>
No additional specifics — Phase 54 is a small gate-flip + docs phase.

</specifics>

<deferred>
- Drift CI gate — Phase 55
- WARNING-02 — Phase 56
- Translating dashboard — permanently out of scope

</deferred>
