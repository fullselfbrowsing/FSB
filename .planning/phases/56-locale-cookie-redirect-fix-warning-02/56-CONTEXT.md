# Phase 56: Locale-Cookie Redirect Fix (WARNING-02) - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning
**Mode:** Autonomous

<domain>
## Phase Boundary
Fix picker-set `fsb-locale` cookie so bare `/` redirects to that locale's subpath for non-default locales; `en` still falls through. Independent of Phases 52-55.
</domain>

<decisions>
- Cookie non-default + supported → 302 `/{locale}/`
- Cookie `en` → next() (no `/en/`)
- Preserve path!=='/' loop guard
- Update test that encoded old short-circuit semantics
</decisions>
