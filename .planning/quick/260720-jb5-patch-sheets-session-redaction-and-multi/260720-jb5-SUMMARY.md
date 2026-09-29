---
quick_id: 260720-jb5
slug: patch-sheets-session-redaction-and-multi
status: complete
verification: passed
completed: 2026-07-20
commits:
  - 15ddf9ff
  - 2f8359b2
---

# Quick Task 260720-jb5 Summary: Session Privacy and Lifecycle Ownership

## Outcome

- `list_tabs` records containing an exact `docs.google.com` tab are now routed through the existing shape-only spreadsheet sanitizer, preventing nested tab titles from reaching session storage.
- Safe domains and lookalike hosts continue to pass through unchanged.
- Token-only visual-session lifecycle calls now translate a current token from another same-agent tab to the authoritative session tab before the ownership gate.
- Unknown, stale, foreign-agent, explicit wrong-token, and session/tab mismatch cases remain fail-closed.
- The behavior applies to `report_progress`, `complete_task`, `partial_task`, and `fail_task` without changing public tool or record schemas.

## Commits

- `15ddf9ff` — `fix(sheets): redact nested tab titles from sessions`
- `2f8359b2` — `fix(mcp): resolve token-only lifecycle ownership`

## Verification

- `node --test tests/spreadsheet-record-redaction.test.js` — 18 passed, 0 failed.
- `node tests/mcp-tool-routing-contract.test.js` — 220 passed, 0 failed.
- `npm test` — complete repository suite passed.
- `git diff --check` — passed.
