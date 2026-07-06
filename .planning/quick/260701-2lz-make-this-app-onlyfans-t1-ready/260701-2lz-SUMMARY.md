---
quick_id: 260701-2lz
slug: make-this-app-onlyfans-t1-ready
status: complete
completed: 2026-07-01
commit: working-tree
---

# Make OnlyFans T1-ready - Summary

## Outcome

OnlyFans is now explicitly covered as a T1 terminal-state app under the current denylist policy. Because `*.onlyfans.com` is a denied origin, its correct terminal state is `blocked-policy`, not executable `t1-ready` handler or recipe activation.

The readiness and terminal-state tests now assert all 21 OnlyFans descriptors remain blocked, denied, non-invocable, and without handler/recipe proof. The write UAT ledger assertion covers the 3 OnlyFans write rows as `blocked-policy` with activation disabled.

A dedicated app-level regression test now verifies the OnlyFans contract directly: denylist classification, no app handler, exact 21-descriptor surface, only 3 write-like descriptors, blocked readiness rows, and blocked-policy tail rows.

## Files Changed

- `scripts/report-t1-readiness.mjs`
- `tests/t1-readiness-report.test.js`
- `tests/t1-terminal-states.test.js`
- `tests/onlyfans-t1-ready.test.js`
- `.planning/quick/260701-2lz-make-this-app-onlyfans-t1-ready/260701-2lz-PLAN.md`
- `.planning/quick/260701-2lz-make-this-app-onlyfans-t1-ready/260701-2lz-SUMMARY.md`
- `.planning/STATE.md`

## Verification

- `node --check tests/t1-readiness-report.test.js` - passed
- `node --check tests/t1-terminal-states.test.js` - passed
- `node --check scripts/report-t1-readiness.mjs` - passed
- `node --check scripts/report-t1-terminal-states.mjs` - passed
- `node --check tests/onlyfans-t1-ready.test.js` - passed
- `node tests/onlyfans-t1-ready.test.js` - passed, 10 passed / 0 failed
- `node tests/t1-readiness-report.test.js` - passed, 32 passed / 0 failed
- `node tests/t1-terminal-states.test.js` - passed, 15 passed / 0 failed
- Focused OnlyFans readiness probe - passed, 21 blocked-policy rows
- Focused OnlyFans terminal-state probe - passed, 21 blocked rows and 3 blocked-policy ledger rows

## Notes

- No git commit was created because the workspace contains extensive concurrent changes. This quick task follows the existing `working-tree` convention used by adjacent T1 quick tasks.
