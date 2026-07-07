---
phase: 52
slug: full-page-translation-completeness-audit
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-07
---

# Phase 52 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None dedicated to i18n scripts today; repo-wide test runner is Node's built-in `node:test` (`tests/*.test.js`, e.g. `tests/server-accept-language.test.js`) |
| **Config file** | none — Wave 0 not required (see Wave 0 Gaps below) |
| **Quick run command** | `node showcase/angular/scripts/audit-translation-completeness.mjs` then inspect `52-AUDIT-REPORT.md` |
| **Full suite command** | N/A — one-shot diagnostic script, not a persisted CI-gated suite (that investment belongs to Phase 55's `verify-translation-drift.mjs` instead) |
| **Estimated runtime** | ~1-2 seconds (single-pass regex parse over 6 XLIFF files + route/template scan) |

---

## Sampling Rate

- **After every task commit:** Run the script manually against the real repo files; spot-check output against this phase's confirmed ground-truth numbers (5 drifted ids, 54 orphans/locale, 21/21 stats-274 merge, 9-per-locale stats-274 id-drift-from-template).
- **After every plan wave:** Same manual smoke check, plus confirm `52-AUDIT-REPORT.md` was written to the exact path CONTEXT.md specifies and covers all 12 confirmed routes.
- **Before `/gsd-verify-work`:** Report exists, lists all 12 routes (or 11 + 1 explicitly-excluded row), and numeric findings are internally consistent (coverage% + failure-list counts add up).
- **Max feedback latency:** ~2 seconds (script execution time) — no watch mode, no long-running process.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD (assigned during planning) | TBD | TBD | AUDIT-01 | — | N/A (read-only script, no attack surface) | manual | `node showcase/angular/scripts/audit-translation-completeness.mjs && grep -A2 "agents.meta.description" 52-AUDIT-REPORT.md` | ❌ W0 (script doesn't exist yet) | ⬜ pending |
| TBD (assigned during planning) | TBD | TBD | AUDIT-01 | — | N/A | manual | Compare report's orphan-count section against confirmed `54` per locale | ❌ W0 | ⬜ pending |
| TBD (assigned during planning) | TBD | TBD | AUDIT-02 | — | N/A | manual | Compare report's stats-274 section against confirmed 21/21 merge + 9-per-locale drift findings | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test-framework scaffolding needed — this phase's deliverable is a one-shot diagnostic script classified manual-only (see Manual-Only Verifications below), not application behavior requiring `node:test` unit coverage.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Script flags the 5 known-drifted ids (`agents.meta.description`, `agents.schema.software.description`, `home.meta.description`, `support.faq.q.tools.a`, `support.schema.faq.tools.a`) as currency FAILs in all 5 locales | AUDIT-01 | One-shot diagnostic script, not CI-gated application behavior; a persisted unit-test suite for a temporary/diagnostic tool is disproportionate per ARCHITECTURE.md's Anti-Pattern 2 guidance | Run the script, grep the report for each of the 5 ids, confirm currency=FAIL in all 5 locale columns |
| Script reports 54 orphaned ids per locale | AUDIT-01 | Same as above | Run the script, compare orphan-count section to this phase's confirmed baseline (54/locale) |
| Script reports stats-274 as 21/21 merged per locale with a 9-per-locale id-drift-from-template subset | AUDIT-02 | Same as above | Run the script, compare stats-274 section to confirmed baseline (21/21 merged, 9/locale drifted-from-template) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — manual-only classification explicitly justified above (diagnostic/read-only phase, no conventional test surface)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — N/A, single-script phase, all 3 checks are manual smoke tests against a pre-established answer key
- [x] Wave 0 covers all MISSING references — none missing, no scaffolding required
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-07
