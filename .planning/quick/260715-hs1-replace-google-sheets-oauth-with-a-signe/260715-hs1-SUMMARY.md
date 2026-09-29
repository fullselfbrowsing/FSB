---
quick_id: 260715-hs1
slug: replace-google-sheets-oauth-with-a-signe
status: complete
verification: human_needed
completed: 2026-07-15
commits:
  - 3d096b99
  - 7895fced
  - c1d9ed6c
  - 4c1d3887
  - d56e4942
  - 9ab3d40d
---

# Quick Task 260715-hs1 Summary: Zero-extra-auth Google Sheets

## Outcome

FSB now exposes the existing five `gsheets.*` capabilities through the user's already signed-in, agent-owned Google Sheets tab without any extension-managed Google authorization.

- Removed the Sheets-specific Chrome Identity permission, OAuth manifest block, OAuth client, connection messages, and connection UI. Unrelated install identity and telemetry remain intact.
- Added a five-method session facade that re-pins every call to the active `docs.google.com/spreadsheets/d/<id>` tab, rejects explicit-ID mismatches, and never navigates to a caller-selected spreadsheet.
- The facade first uses an already-initialized page-owned `gapi.client.request` with fixed Sheets v4 paths. It never initializes gapi/auth, reads cookies or tokens, accepts arbitrary request fields, or exposes a generic authenticated proxy.
- Added bounded trusted-UI fallback for metadata, formula-bar reads, lossless rectangular paste updates, provable `OVERWRITE` append, and clear with readback. Sheet-qualified ranges also require proof that the active worksheet switched.
- `INSERT_ROWS` remains available through the fixed page client. UI fallback refuses it with `RECIPE_DOM_FALLBACK_PENDING` because a swallowed row-insertion shortcut cannot be proven safe before paste.
- UI operations are serialized per tab across typed and legacy `fillsheet`/`readsheet` callers. Typed mutations are also serialized at the session layer. Unknown mutation outcomes return `RECOVERY_AMBIGUOUS` and are never automatically replayed.
- Legacy Sheets tools now use the same range/value/UI helpers; their old direct Name Box and cell-by-cell paths were removed.
- The source-verified Sheets origin contract rejects arbitrary fetch/gapi requests, dynamic property proxies, browser network sinks, dynamic imports, service-worker/worklet loaders, and generated code in the UI action.
- Spreadsheet recording remains shape-only and retains the exact recovery code while dropping IDs, ranges, sheet names, values, formulas, bodies, and raw errors.
- The generic MCP `search_capabilities` / `invoke_capability` flow is unchanged. No MCP server or package update is required.

## Commits

- `3d096b99` — `feat(sheets): replace OAuth with signed-in session`
- `7895fced` — `feat(sheets): add bounded signed-in UI fallback`
- `c1d9ed6c` — `fix(sheets): enforce fail-closed UI recovery`
- `4c1d3887` — `fix(sheets): close UI session edge cases`
- `d56e4942` — `docs(sheets): document signed-in session UAT`
- `9ab3d40d` — `fix(sheets): block dynamic UI network loaders`

## Verification

- Focused Sheets, handler, wiring, privacy, and origin suites pass.
- `tests/verify-origin-classification.test.js` passes 221/221, including adversarial network-proxy controls.
- The origin CLI passes all 124 shipped heads with exactly one signed-in page-gapi/UI Sheets accommodation.
- The complete `npm test` suite exits 0, including the showcase build, recorder/privacy tests, and catalog gates.
- `npm run package:extension` exits 0 and writes `dist/fsb-extension-v0.9.91.zip` with 6 recipes, 2319 descriptors, and 124 packaged handlers.
- Extension validation and write-activation gates retain all three mutation handlers in their guarded state.

## Live UAT still required

The connected MCP bridge was reachable, but its owned tabs contained no signed-in Google Sheet. FSB did not open or navigate to a spreadsheet automatically, so live calls could not truthfully be exercised.

To finish activation evidence, reload the unpacked extension, open a disposable signed-in Sheet as the agent-owned tab, reconnect the existing MCP bridge, and invoke all five slugs. Exercise RAW and USER_ENTERED writes, both append modes (with `INSERT_ROWS` through page client), clear/readback, target mismatch, and ambiguous recovery. Until that passes, `update_values`, `append_values`, and `clear_values` remain guarded and no activation evidence is recorded.

All unrelated pre-existing worktree changes were preserved; task commits contain only Sheets-owned files or Sheets-owned hunks.
