# Phase 55 Drift Gate Back-Test (CI-03)

**Date:** 2026-07-09  
**Script:** `showcase/angular/scripts/verify-translation-drift.mjs`

| Snapshot | Expected | Actual exit | Notes |
|----------|----------|-------------|-------|
| HEAD (post Phase 53–54) | pass | **0** | 942×5, zero source drift; 54 orphans/locale warning-only |
| `6d3ad363` (known drift) | fail | **1** | Reports source-drift for the 5 known ids × 5 locales |
| `e83cacad` (linenumber churn) | pass | **0** | Silent on pure context-group churn |
| `652f02ab` (linenumber churn) | pass | **0** | Silent on pure context-group churn |

Method: checked out historical `messages*.xlf` into a temp tree with HEAD script + locale-constants; ran the gate with cwd = temp tree.

Conclusion: gate stays silent on clean churn and fires on `6d3ad363`-shaped drift — safe to wire hard-fail into CI.
