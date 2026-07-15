# Google Sheets signed-in session integration

FSB exposes five bounded Google Sheets capabilities without adding another authentication flow. The user signs in to Google Sheets normally; FSB reuses only the page session in the already-open, agent-owned spreadsheet tab. The extension does not request Google consent, configure a Cloud client, manage access tokens, inspect cookies, or store Google credentials.

Private spreadsheet data still requires a Google-authenticated browser session. “No auth” here means no additional extension or API authorization beyond the user's existing Google Sheets login.

## Preconditions

Before invoking a Sheets capability:

1. Sign in to Google Sheets in the same browser profile as FSB.
2. Open the target spreadsheet at `https://docs.google.com/spreadsheets/d/<id>/...`.
3. Make that tab the agent-owned target and ensure the signed-in user has the required read or edit access.

FSB never logs in, creates a spreadsheet, opens a consent screen, or navigates to a caller-supplied spreadsheet. If `spreadsheetId` is supplied, it must match the ID in the owned tab's current URL.

## Capability contract

The existing generic MCP capability flow discovers and invokes exactly these typed slugs:

- `gsheets.get_spreadsheet`
- `gsheets.get_values`
- `gsheets.update_values`
- `gsheets.append_values`
- `gsheets.clear_values`

No Sheets-specific MCP server method or package update is required. `search_capabilities` returns the dynamic descriptors and `invoke_capability` routes the selected slug to the extension.

For each operation, the extension re-reads the owned tab URL and pins the request to that tab. It first tries an already-initialized, page-owned `gapi.client.request` with a fixed Sheets v4 method and path. It does not initialize gapi or authentication. If that page client is unavailable, the extension may use a fixed Google Sheets UI operation; callers cannot supply a URL, HTTP method, headers, or credentials.

For a sheet-qualified A1 range, UI fallback also verifies the selected worksheet tab after Name Box navigation. Matching cell coordinates on a different worksheet are treated as a session failure.

Successful responses identify the transport as `page-client` or `ui`. UI reads also return `renderSemantics: "formula-bar"` because they read the bounded range cell by cell from the Sheets formula bar rather than reproducing every Sheets API render option.

## UI fallback limits

- UI reads are limited to 50 rows by 26 columns.
- UI writes accept only non-empty rectangular matrices that can be represented unambiguously as tab-separated paste data. Ragged rows, null values, tabs, newlines, unsupported objects, non-finite numbers, and oversized payloads fail closed.
- `RAW` treats every non-empty string as literal text, including formula-like, numeric-looking, boolean-looking, date-like, and apostrophe-prefixed strings. `USER_ENTERED` permits Google Sheets to interpret formulas and other entered values.
- Large bounded writes are split only on row boundaries. The extension may temporarily replace the clipboard while pasting.
- UI append scans a bounded rectangular table (at most 25 existing rows by 10 columns, with at most 25 appended rows) and proceeds only when it can prove a contiguous table boundary and every remaining scanned row is empty. Gaps, orphaned sibling cells, or any ambiguous boundary are rejected without writing. UI fallback supports `OVERWRITE`; `INSERT_ROWS` uses the page client and fails closed if that transport is unavailable because a swallowed row-insert shortcut cannot be proven safe before paste.
- UI clear is limited to 100 cells, selects the exact range, deletes it, and verifies an empty formula-bar readback.

The legacy `fill_sheet` and `read_sheet` tools reuse the same range, value, paste, and formula-bar helpers so Sheets automation has one primary implementation path.

## Recovery and errors

The normalized failure codes are:

- `GOOGLE_SHEETS_ACTIVE_TAB_REQUIRED`: the owned tab is not an open spreadsheet.
- `GOOGLE_SHEETS_TARGET_MISMATCH`: an explicit ID does not match that tab.
- `GOOGLE_SHEETS_SESSION_UNAVAILABLE`: the signed-in page or required UI controls are unavailable.
- `RECIPE_DOM_FALLBACK_PENDING`: the requested operation cannot be represented safely by the bounded fallback.
- `RECOVERY_AMBIGUOUS`: a mutation may have taken effect, so FSB does not retry it.

UI mutation fallback occurs only when the page request was never sent or was explicitly rejected with no effect. A timeout, network failure, 5xx response, or otherwise unknown mutation outcome returns `RECOVERY_AMBIGUOUS` and is never replayed automatically. Typed mutations are serialized per tab, and every UI operation—including reads and legacy aliases—shares the tab's UI lock.

UI navigation and paste/delete keystrokes require the trusted debugger-backed input path. A caller cannot downgrade them to synthetic DOM key events.

Google Sheets remains a sensitive origin. Consent gates, mutation serialization, origin pinning, and shape-only spreadsheet record redaction remain active. Spreadsheet IDs, ranges, sheet names, values, formulas, response bodies, and raw errors are excluded from session records.

## Write activation and UAT

The three mutation slugs remain runtime-guarded until a real disposable-sheet UAT passes. Static and unit tests do not count as activation evidence.

For live UAT:

1. Rebuild the extension with `npm run package:extension` and reload the unpacked `extension/` directory.
2. Open a disposable Sheet while signed in and assign that tab to the agent.
3. Reconnect the existing MCP bridge; do not install or update the MCP package.
4. Invoke all five slugs through `invoke_capability`, covering RAW and USER_ENTERED updates, `OVERWRITE` and `INSERT_ROWS` appends, clear/readback, target mismatch, and an ambiguous-recovery case with no duplicate write.
5. Record only redacted evidence. Activate the mutation handlers only after every readback passes; otherwise leave the guards in place and report the exact gap.
