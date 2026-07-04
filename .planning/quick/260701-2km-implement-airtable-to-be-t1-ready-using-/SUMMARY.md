---
quick_id: 260701-2km
slug: implement-airtable-to-be-t1-ready-using-
status: complete
completed_at: "2026-07-01"
commit: working-tree
---

# Summary

Airtable is T1-ready in the current working tree. Six read descriptors resolve to `T1a`/`t1-ready` with handler proof, and two write descriptors resolve to `T1a`/`t1-guarded-fail-closed` with guarded write evidence.

## Implemented

- Added `catalog/handlers/airtable.js` and mirrored it to `extension/catalog/handlers/airtable.js`.
- Wired `FsbHandlerAirtable` into background import, capability catalog/search, readiness tooling, coverage/port/origin/path verifiers, and targeted tests.
- Updated Airtable descriptor backing from `dom` to `handler` in descriptor JSON, seed fixtures, and generated recipe index.
- Added guarded evidence records for `airtable.create_comment` and `airtable.update_cell`.

## Validation

- PASS: `node --check catalog/handlers/airtable.js`
- PASS: `node --check extension/catalog/handlers/airtable.js`
- PASS: `node --check tests/capability-head-handlers.test.js`
- PASS: Airtable readiness/evidence assertion: all eight Airtable rows are handler-backed T1a, with two guarded writes and no Airtable evidence failures.
- PASS: Airtable direct handler smoke for `list_records`, `list_workspaces`, and guarded `update_cell`.
- PASS: Airtable-only origin classification for `https://airtable.com/v0.3`.
- PASS: `node scripts/verify-t1-readiness-gate.mjs`
- PASS: `node tests/head-handler-cap.test.js`

## External Blockers Observed

These are outside Airtable ownership and were not modified:

- `catalog/handlers/aws.js` currently has a syntax error that blocks broad handler require-based tests.
- `tests/capability-head-handlers.test.js` also reports a Shopify direct-network assertion failure.
- Shared write evidence/terminal-state gates currently fail for non-Airtable missing evidence and search override rows.
- Full origin/path/port contract gates currently fail on non-Airtable unmapped or incomplete head ports.
