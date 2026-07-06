---
phase: 34
doc: human-uat
status: partial
created: 2026-06-23
updated: 2026-06-29
result: "UAT-34-01 MCP visible-input smoke passed for a real text file; UAT-34-02 hidden-input container smoke passed. Remaining Phase 34 live checks are still human_needed."
---

# Phase 34 — Human UAT (live file upload)

The CI half is green (denylist incl. the Win32 bypass, registry/parity/visual-session/routing locks, full `npm test` EXIT 0). The scenarios below are irreducibly live: they need a real browser, a real file on disk, and a real upload form. Non-blocking deferred debt, consistent with the standing posture. `chrome.debugger` will briefly attach to the tab during the upload (expected).

## UAT-34-01 — Happy path (real binary to a file input)
**Status:** partial — MCP visible-input smoke passed 2026-06-29; binary image/PDF/docx repetition and submit-byte verification remain human_needed.

**Observed 2026-06-29:** With FSB extension loaded and the MCP bridge connected, navigated via `navigate` to a local smoke page at `http://127.0.0.1:17345/index.html`, then ran `upload_file(selector="#visibleFileInput", file_path="/Users/lakshman/conductor/workspaces/fsb/louisville/.context/upload-uat/sample-upload.txt")`. The tool returned `success:true`, `method:"cdp_set_file_input"`, `file:"sample-upload.txt"`, and the change report showed `visibleFileInput` changed to `C:\fakepath\sample-upload.txt`. A follow-up `execute_js` verified `visibleFileInput.files.length === 1`, name `sample-upload.txt`, size `108`, MIME `text/plain`, and status text `visible: sample-upload.txt|108|text/plain`. Chrome `149.0.7827.200`; extension commit `3ff5b2c2`; MCP package `0.10.0`.

1. Open a page with a plain `<input type="file">` (e.g. an avatar/document upload form).
2. Call `upload_file(selector="input[type=file]", file_path="/<absolute>/some-image.png")`.
3. **Expect:** the form shows the file name / preview; submitting sends the real bytes. Verify with `read_page` / `get_dom_snapshot`.
4. Repeat with a PDF and a `.docx` to confirm real binaries (not just text) work.

## UAT-34-02 — Hidden input behind a styled dropzone
**Status:** pass — MCP hidden-descendant input smoke passed 2026-06-29.

**Observed 2026-06-29:** On the same local smoke page, ran `upload_file(selector="#dropzone", file_path="/Users/lakshman/conductor/workspaces/fsb/louisville/.context/upload-uat/sample-upload.txt")`, where `#dropzone` is a visible container wrapping a hidden `<input id="hiddenFileInput" type="file">`. The tool returned `success:true`, `method:"cdp_set_file_input"`, `selector:"#dropzone"`, and `file:"sample-upload.txt"`. The change report showed `hiddenFileInput` changed to `C:\fakepath\sample-upload.txt`. A follow-up `execute_js` verified `hiddenFileInput.files.length === 1`, name `sample-upload.txt`, size `108`, MIME `text/plain`, and status text `hidden: sample-upload.txt|108|text/plain`. Chrome `149.0.7827.200`; extension commit `3ff5b2c2`; MCP package `0.10.0`.

1. On a dropzone UI (Dropzone.js / react-dropzone) where the visible element is a styled label/dropzone wrapping a hidden `input[type=file]`, pass the **dropzone/container** selector (not the input).
2. **Expect:** the helper's descendant `input[type=file]` resolution finds the hidden input and the file attaches.

## UAT-34-03 — Security posture A
**Status:** human_needed — not exercised in the 2026-06-29 smoke.

1. Try `upload_file(selector="input[type=file]", file_path="/<home>/.ssh/id_rsa")`.
2. **Expect:** blocked with a clear "sensitive-path denylist" error; NO debugger attach, NO upload; an audit entry recorded (origin + outcome `blocked` + reason, no path).
3. Try a relative / `~` path; **expect** a clear "absolute path required" error.
4. Try a non-existent absolute path; **expect** a clean failure (CDP surfaces it), not a crash.
5. Confirm an allowed upload writes an audit entry (origin + `success`) and that the **full path is not** in the persisted audit log (only in the live session/diagnostic log).

## UAT-34-04 — Both front doors + multi-agent
**Status:** human_needed — not exercised in the 2026-06-29 smoke.

1. Drive `upload_file` once via the MCP client and once via an autopilot `run_task` ("upload <file> to <form>"); **expect** identical behavior (same helper, same denylist/audit).
2. With two owned tabs, omit `tab_id` (expect auto-resolve or a clear ambiguity error) and pass `tab_id` explicitly; a cross-agent tab must reject with `TAB_NOT_OWNED`.

## Deferred (not in v1)
- Pure drag-only dropzones with no `<input type=file>` (real byte-level drop) — `drop_file` remains the fallback.
- `ref`-based targeting, multiple files per call, MCP-side `fs.stat` pre-flight, per-origin consent gate (posture B).
