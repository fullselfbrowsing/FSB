# Google Sheets API integration

FSB includes a bounded Google Sheets v4 integration for reading spreadsheet metadata and values, updating or appending values, and clearing a range. It uses Chrome Identity for OAuth and never exposes a generic HTTP request surface.

## One-time Google Cloud setup

The repository intentionally ships with a nonfunctional OAuth client placeholder. A release owner must:

1. Enable the Google Sheets API in a Google Cloud project.
2. Configure the OAuth consent screen for that project.
3. Create an OAuth client of type **Chrome Extension**, tied to the stable ID of the packaged FSB extension.
4. Replace `REPLACE_WITH_FSB_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com` in `extension/manifest.json` with that client ID.
5. Reload the extension, open the FSB control panel, and click **Connect Google Sheets**.

Until step 4 is complete, the runtime fails closed with `GOOGLE_SHEETS_OAUTH_NOT_CONFIGURED` and does not open a Google authorization prompt.

## Access and behavior

The extension requests only `https://www.googleapis.com/auth/spreadsheets`. Capability calls obtain cached authorization non-interactively; only the control-panel Connect button may start an interactive OAuth flow. Access tokens remain in Chrome Identity's cache and are never stored, logged, returned to callers, or placed in errors.

The API facade permits only these operations:

- `gsheets.get_spreadsheet`
- `gsheets.get_values`
- `gsheets.update_values`
- `gsheets.append_values`
- `gsheets.clear_values`

Requests are restricted to `https://sheets.googleapis.com/v4`, validate spreadsheet IDs and ranges, cap request and response sizes, time out, and retry once only after an HTTP 401. Google Sheets is classified as a sensitive origin, so write and destructive operations remain behind FSB's consent policy.

The existing `fill_sheet` and `read_sheet` browser-automation tools remain available as a fallback. Spreadsheet API and fallback-tool session records are reduced to shape-only diagnostics before recording; spreadsheet IDs, ranges, sheet names, values, formulas, and response bodies are discarded.
