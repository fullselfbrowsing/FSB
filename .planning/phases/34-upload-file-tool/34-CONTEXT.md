---
phase: 34
name: Explicit File Upload Tool (upload_file via CDP)
milestone: v0.9.99
kind: milestone-extension
requirements: [UPLOAD-01, UPLOAD-02, UPLOAD-03, UPLOAD-04]
created: 2026-06-23
status: in-progress
---

# Phase 34 — Explicit File Upload Tool (`upload_file`)

## Why this phase exists

FSB has no way to upload a real file from a known disk path to a web form. The existing `drop_file` tool is **synthetic-content-only**: it builds `new File([fileContent], name, {type})` from an inline string in page JS and dispatches DragEvents (`extension/content/actions.js:5230`). It cannot reference a disk path and cannot carry a real binary (image/PDF/doc). FSB's own site-guide flags this: *"programmatic file input population is a potential tool gap for future development"* (`extension/site-guides/utilities/file-upload.js:181`). The JS-tool workaround hits the same wall: page JavaScript is forbidden from setting `<input type=file>.value` or reading the local filesystem.

## The mechanism (the only correct one)

CDP **`DOM.setFileInputFiles(files: [absolutePath], nodeId|objectId)`** — the browser process performs the disk read and fires `input`/`change` natively. It is exactly what Playwright/Puppeteer `setInputFiles` use. FSB is uniquely positioned because it already holds the `chrome.debugger` permission and runs the attach/`sendCommand`/detach seam for Input emulation (`extension/background.js` `handleCDPMouseClick` ~:14112, `cdpInsertText` ~:13985). The new tool reuses that exact seam.

## Decisions (locked)

- **D-01 CDP `DOM.setFileInputFiles`.** The only API that populates a file input from a real disk path. Reuse the existing `chrome.debugger.attach('1.3')` + stale-debugger-retry + detach seam.
- **D-02 Security posture A (user-chosen).** (a) Validate the path exists/readable (clean early error); (b) a small **sensitive-path denylist** (`~/.ssh`, `~/.aws`, `~/.gnupg`, credential stores, `.env`, browser-profile / FSB-vault dirs), extensible; (c) **audit-log every upload** (path + target origin + outcome) reusing the Phase 30 audit-log. Enforced at the **shared chokepoint** reached by both front doors (MCP bridge + autopilot), so neither bypasses it. No per-origin consent gate in v1 (deferred follow-up).
- **D-03 Keep `drop_file`.** It stays for true byte-level drag-drop-only zones / quick synthetic content. `upload_file` is preferred whenever a disk path is known; the file-upload site-guide is updated to say so.
- **D-04 v1 scope.** Real `<input type=file>`, including ones hidden behind a styled label/dropzone (resolve to the underlying input). Multi-file optional (CDP takes an array). Pure drag-only dropzones with no input are deferred (real byte-level drop is genuinely hard; `drop_file` remains the fallback).
- **D-05 A normal first-class tool.** Unlike the v0.9.99 capability tools (deliberately OUT of `TOOL_REGISTRY` to freeze INV-01's hash), `upload_file` is a sanctioned new registry tool. The tool count, the `tool-definitions-parity` baseline, and the MCP version bump are EXPECTED, conscious updates — not INV-01 violations.

## Invariants / guardrails

- Reuse the existing `chrome.debugger` attach/detach seam; mirror its stale-debugger retry + error-path detach + `automationLogger` instrumentation.
- **Two front doors, one chokepoint:** the MCP bridge path and the autopilot (`tool-executor.js`) path must both reach the same background CDP handler so the denylist + audit cover both (the INV-02 parity principle from the capability work).
- agent-loop iterator untouched (INV-04 style); no change to existing tool schemas (only an additive new tool).
- The new `extension/utils/*` module (path denylist) must be registered on the recipe-path CI guard allowlist if the guard scans it, and stay free of `eval`/`new Function`/`import(`.
