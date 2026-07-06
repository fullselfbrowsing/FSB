---
phase: 34
doc: verification
status: human_needed
ci_half: green
requirements: [UPLOAD-01, UPLOAD-02, UPLOAD-03, UPLOAD-04]
verified: 2026-06-23
---

# Phase 34 — Verification (goal-backward)

**Goal:** an explicit tool uploads a real file from a known disk path to a web form.

**Status: human_needed** — every requirement's automated/CI half is green; the irreducibly-live half (a real file actually attaching to a real `<input type=file>` and the form accepting it) is recorded as deferred UAT debt (`34-HUMAN-UAT.md`), matching the standing posture. All four UPLOAD REQ-IDs are `Complete`.

## Requirement-by-requirement

| REQ | Claim | CI evidence | Verdict |
|-----|-------|-------------|---------|
| UPLOAD-01 | `upload_file` sets a real file by disk path via CDP `DOM.setFileInputFiles`, incl. hidden-behind-dropzone inputs | tool registered (parity 260/0), `executeUploadFile` resolves doc→querySelector→describeNode→descendant-fallback→setFileInputFiles, node --check clean | satisfied (CI half); live attach = UAT |
| UPLOAD-02 | Both front doors (MCP + autopilot) route through one shared helper; registry parity updated | `mcp-tool-routing-contract` 184/0 (route entry), autopilot `case` + dispatcher handler both call `executeUploadFile`, parity hash `6354d788...` consistent in 4 files, byte-identical `.cjs` | satisfied |
| UPLOAD-03 | Posture A: absolute-path-only + sensitive-path denylist (both front doors) + audit without leaking the path | `upload-path-denylist` 36/0 (incl. Win32 bypass), denylist checked before any side effect in the shared helper, audit record carries origin+outcome+decision only | satisfied |
| UPLOAD-04 | Headless tests + locks wired into npm test; live recorded human_needed | denylist test in `npm test`; parity/visual-session/routing locks green; full `npm test` EXIT 0 | satisfied |

## Invariants / non-regression
- INV-01: the frozen `tool-definitions-parity` registry hash moved intentionally (a sanctioned additive tool); old `ad6efb8c...` gone, new `6354d788...` consistent across `tool-definitions-parity`, `capability-mcp-surface`, `recipe-schema-lock`, `capability-autopilot-parity`. No existing tool schema changed.
- No agent-loop / provider / capability-engine change. `manifest.json` unchanged (no new permission — `chrome.debugger` was already granted).
- Independent review: 0 critical/high/medium; 3 WARNING all fixed (WR-01/02/03).
- Full `npm test` EXIT 0.

## Deferred (non-blocking)
- Live upload fidelity UAT — `34-HUMAN-UAT.md` (UAT-34-01..04).
- `ref`→selector resolution, multi-file, MCP-side `fs.stat` pre-flight, pure drag-only dropzones, per-origin consent gate (posture B) — all v1 deferrals.
- Denylist is a string backstop (no symlink/`..` canonicalization) — documented, acceptable for v1.
