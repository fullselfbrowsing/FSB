---
phase: 25-parity-removal-docs-browser-uat
plan: "03"
subsystem: docs-provenance
tags: [phantomstream, docs, provenance, release-notes]

provides:
  - Active documentation naming PhantomStream as the stream implementation
  - Package source/provenance and adapter-boundary record
  - Milestone release-note language and browser UAT expectations
affects:
  - README.md
  - extension/README.md
  - showcase/README.md
  - .planning/PROJECT.md
  - .planning/PHANTOMSTREAM-PIN.md
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/STATE.md

requirements_completed: [PARITY-04]
requirements_remaining: [PARITY-05]

completed: 2026-06-17
---

# Phase 25 Plan 03: Docs And Provenance Summary

Plan 25-03 is complete. Active docs now identify the published PhantomStream package as FSB's dashboard DOM live-preview implementation and distinguish package-owned behavior from FSB-specific adapters.

## Accomplishments

- Updated the root README to name PhantomStream-backed DOM live preview and the PhantomStream-compatible showcase relay.
- Updated `extension/README.md` with a DOM streaming boundary section:
  - `content/dom-stream.js` is the capture adapter;
  - `ws/ws-client.js` uses the protocol bridge for stream/control envelopes;
  - FSB task/status traffic and remote-control ownership diagnostics remain FSB-owned.
- Updated `showcase/README.md` to document the shared PhantomStream viewer wrapper and relay compatibility boundary.
- Updated `.planning/PROJECT.md` so the active milestone references the approved `@full-self-browsing/phantom-stream@0.1.0` package instead of implying the rejected unhyphenated package is current.
- Expanded `.planning/PHANTOMSTREAM-PIN.md` with:
  - implementation ownership boundaries;
  - remaining FSB-specific adapters;
  - generated bundle classification as package artifacts;
  - v0.12.0 release-note language;
  - browser UAT expectations for the final plan.

## Verification

Executed successfully:

```bash
node tests/phantom-stream-public-package.test.js
node tests/phantom-stream-exports.test.js
node tests/skill-fsb-spec.test.js
npm run validate:extension
git diff --check
```

Focused results:

- `tests/phantom-stream-public-package.test.js`: 15 PASS / 0 FAIL.
- `tests/phantom-stream-exports.test.js`: 121 PASS / 0 FAIL.
- `tests/skill-fsb-spec.test.js`: 48 PASS / 0 FAIL.
- `npm run validate:extension`: manifest valid, 260 JS files parsed clean.
- `git diff --check`: clean.

## Boundary

PARITY-04 is complete for documentation and provenance. PARITY-05 remains open for final automated gates plus live-browser UAT evidence.
