---
phase: 53
slug: trans-unit-resync-stats-translation-transcreation-review
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-09
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node ESM diagnostic scripts (existing `audit-translation-completeness.mjs`) + shell/python asserts |
| **Config file** | none — Wave 0 not required |
| **Quick run command** | `cd showcase/angular && node scripts/audit-translation-completeness.mjs` |
| **Full suite command** | Same audit + `test ! -f` stats-274 JSON paths + placeholder id-set check for `support.faq.q.tools.a` |
| **Estimated runtime** | ~5–15 seconds |

---

## Sampling Rate

- **After every task commit:** Run audit script (or targeted id asserts if audit too heavy mid-edit)
- **After every plan wave:** Full audit + stats-274 absence checks
- **Before `/gsd-verify-work`:** Full suite must be green; `53-VISUAL-QA.md` present
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------------|-----------|-------------------|-------------|--------|
| 53-01-01 | 01 | 1 | RESYNC-01 | T-53-01 | Targets updated; no EN source rewrite | script | audit + id currency assert | ✅ | ⬜ pending |
| 53-01-02 | 01 | 1 | RESYNC-01 | T-53-02 | Placeholder `<x id>` set preserved on FAQ | script | python placeholder set diff | ✅ | ⬜ pending |
| 53-02-01 | 02 | 2 | RESYNC-02 | — | stats-274 JSON deleted; stats still 100% | script | `test ! -f` + audit | ✅ | ⬜ pending |
| 53-03-01 | 03 | 3 | RESYNC-03 | T-53-01 | Hero/CTA targets updated in 5 locales | diff/audit | git diff + spot assert | ✅ | ⬜ pending |
| 53-03-02 | 03 | 3 | VISUAL-01 | — | Visual QA doc written | artifact | `test -f 53-VISUAL-QA.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — no new test harness.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DE/CJK layout spot-check | VISUAL-01 | Layout/overflow needs human or browser eyes | Load de/zh-CN/zh-TW for privacy, phantom-stream, about, home; record pass/fail in `53-VISUAL-QA.md`. If browser unavailable, mark `human_needed` honestly. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-09 (autonomous)
