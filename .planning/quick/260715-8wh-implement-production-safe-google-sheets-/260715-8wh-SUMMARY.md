---
quick_id: 260715-8wh
slug: implement-production-safe-google-sheets
status: complete
completed: 2026-07-15
commits:
  - 8e46173a
  - 23badd3a
  - a83d21b8
---

# Quick Task 260715-8wh Summary: Production-safe Google Sheets API MVP

## Outcome

FSB now has a bounded Google Sheets v4 integration with an explicit Chrome Identity connection surface, five strict typed capabilities, and shape-only spreadsheet session recording.

- OAuth uses only `https://www.googleapis.com/auth/spreadsheets`, starts interactively only from the control-panel Connect click, and remains fail-closed while the checked-in client ID is the unmistakable placeholder.
- The API facade accepts only five fixed operations, validates spreadsheet IDs/A1 ranges, caps request and response sizes, times out, retries exactly once after HTTP 401, and never exposes, logs, returns, or persists an access token.
- `gsheets.get_spreadsheet` and `gsheets.get_values` are executable after valid OAuth setup.
- `gsheets.update_values`, `gsheets.append_values`, and `gsheets.clear_values` are implemented, typed, discoverable, and classified correctly, but their handlers return `RECIPE_DOM_FALLBACK_PENDING` without calling Google until live mutation UAT and activation evidence exist. OAuth configuration alone cannot activate writes.
- Google Sheets uses the exact, source-verified `docs.google.com` to `sheets.googleapis.com/v4` Chrome Identity transport accommodation and remains a sensitive origin.
- Both MCP recording ingress points reduce Sheets API calls and legacy `fill_sheet`/`read_sheet` calls to operation/shape/status facts before the session recorder receives them. Spreadsheet IDs, ranges, sheet names, values, formulas, response bodies, and raw errors are discarded.
- Existing `fill_sheet` and `read_sheet` browser-automation fallbacks remain available.

## Commits

- `8e46173a` — `feat(sheets): add bounded OAuth API client`
- `23badd3a` — `feat(sheets): add typed Sheets capabilities`
- `a83d21b8` — `fix(privacy): redact spreadsheet session data`

## Verification

- `node --test tests/google-sheets-api.test.js tests/gsheets-handler.test.js tests/google-sheets-wiring.test.js tests/spreadsheet-record-redaction.test.js` — PASS, 26/26.
- `node tests/mcp-session-recorder.test.js` — PASS, 194/194.
- `node tests/verify-origin-classification.test.js` — PASS, 202/202.
- `npm run validate:extension` — PASS end-to-end, including manifest/JS parsing, recipe guard, classification, catalog, origin, readiness, terminal-state, T1 port-contract, and write-activation evidence gates.
- `node scripts/package-extension.mjs` — PASS; generated 6 recipes and 2319 descriptors, copied 124 handler modules, and wrote `dist/fsb-extension-v0.9.91.zip`.

## External setup required

1. Enable the Google Sheets API in a Google Cloud project.
2. Configure the OAuth consent screen.
3. Create a Chrome Extension OAuth client tied to the stable packaged FSB extension ID.
4. Replace `REPLACE_WITH_FSB_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com` in `extension/manifest.json` with that client ID.
5. Reload the extension and connect from the FSB control panel.
6. Separately complete the repository's live mutation-UAT and activation-evidence process before enabling update, append, or clear handlers.

No live OAuth prompt or external Google read/write was performed during implementation. Substantial unrelated pre-existing worktree changes were preserved; each commit staged only task-owned files or task-owned hunks.
