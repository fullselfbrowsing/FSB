---
quick: 260701-2nu
plan: 01
status: complete
completed_at: 2026-07-01
commit: working-tree
---

# Quick 260701-2nu Summary: Jira T1 Readiness

## Result

Implemented Jira Cloud T1 readiness in the working tree.

- Added mirrored `FsbHandlerJira` heads for 12 safe Jira Cloud same-origin REST reads.
- Guarded 8 Jira mutation/destructive slugs as fail-closed T1a rows pending live write UAT.
- Wired Jira into the background loader, capability catalog, readiness reporting, origin classification, recipe path guard, T1 port contract, and write activation evidence.
- Added focused Jira regression coverage for tenant origin binding, REST URL construction, shape guards, guarded write inertness, and readiness classification.

## Verification

Passed:

- `node --check catalog/handlers/jira.js`
- `node --check extension/catalog/handlers/jira.js`
- `cmp -s catalog/handlers/jira.js extension/catalog/handlers/jira.js`
- `node --check scripts/verify-origin-classification.mjs`
- `node tests/jira-t1-handler.test.js`
- Jira-only readiness query: 12 reads reported `t1-ready` / `T1a`; 8 writes reported `t1-guarded-fail-closed` / `T1a`.

Blocked by unrelated concurrent app ports:

- `node scripts/verify-origin-classification.mjs` fails on 22 non-Jira separate/unmapped/unverifiable heads; `FsbHandlerJira` reports `SAME-ORIGIN`.
- `node scripts/verify-t1-port-contract.mjs` fails on 66 non-Jira issues, including PostHog verifier mappings/evidence, Tinder side-effect classes, AWS handler syntax, TikTok guarded read rows, and Tinder guarded read rows.
- `node scripts/verify-recipe-path-guard.mjs` fails on 17 non-Jira allowlist-drift handlers.
- `node scripts/verify-write-activation-evidence.mjs` fails on 112 non-Jira missing evidence records.

The failing shared gates include non-Jira apps currently being edited in parallel, including AWS, GCal, GCloud, GDocs, GDrive, Grubhub, Home Depot, NotebookLM, OpenTable, PostHog, Spotify, Telegram, Tinder, Uber Eats, Zendesk, and others.

## Files

- `catalog/handlers/jira.js`
- `extension/catalog/handlers/jira.js`
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `catalog/write-activation-evidence.json`
- `tests/jira-t1-handler.test.js`
- `.planning/quick/260701-2nu-make-this-app-jira-t1-ready/260701-2nu-PLAN.md`
- `.planning/quick/260701-2nu-make-this-app-jira-t1-ready/260701-2nu-SUMMARY.md`
