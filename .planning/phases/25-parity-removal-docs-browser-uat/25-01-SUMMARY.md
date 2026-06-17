---
phase: 25-parity-removal-docs-browser-uat
plan: "01"
subsystem: stream-adapter-boundary
tags: [phantomstream, cleanup, adapter-boundary, duplicate-removal]

provides:
  - Removal of legacy adapter-side nid stamping
  - Tests asserting sidecar node identity instead of stamped mirrored HTML
  - Phase 25 context and plan set
affects:
  - extension/content/dom-stream.js
  - tests/phantom-stream-capture-adapter.test.js
  - tests/dom-stream-perf.test.js
  - .planning/phases/25-parity-removal-docs-browser-uat/
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/STATE.md

requirements_completed: [PARITY-03]
requirements_remaining: [PARITY-01, PARITY-02, PARITY-04, PARITY-05]

completed: 2026-06-17
---

# Phase 25 Plan 01: Stream Engine Removal Summary

Plan 25-01 is complete. The capture adapter no longer rewrites PhantomStream snapshot or mutation HTML to add legacy `data-fsb-nid` attributes.

## Accomplishments

- Created Phase 25 context and plan files for parity removal, differential tests, docs/provenance, and final browser UAT.
- Removed `stampLegacyNodeIds`, `adaptMutationOp`, and the `_stampLegacyNodeIdsForTest` hook from `extension/content/dom-stream.js`.
- Preserved FSB-specific adapter behavior:
  - background action names;
  - stream session/snapshot identity tracking;
  - stale flush diagnostics;
  - overlay/dialog/scroll forwarding;
  - overlay exclusion;
  - resume-as-fresh-snapshot behavior.
- Updated capture tests to assert PhantomStream `nodeIds` sidecars are preserved and mirrored HTML is not legacy-stamped.

## Verification

Executed successfully:

```bash
node --check extension/content/dom-stream.js
node tests/phantom-stream-capture-adapter.test.js
node tests/dom-stream-perf.test.js
node tests/phantom-stream-sidechannels.test.js
node tests/phantom-stream-dashboard-parity.test.js
node tests/server-ws-phantomstream-relay-compat.test.js
npm run validate:extension
git diff --check
```

Focused results:

- `tests/phantom-stream-capture-adapter.test.js`: 23 PASS / 0 FAIL.
- `tests/dom-stream-perf.test.js`: all assertions passed.
- `tests/phantom-stream-sidechannels.test.js`: 29 PASS / 0 FAIL.
- `tests/phantom-stream-dashboard-parity.test.js`: 70 PASS / 0 FAIL.
- `tests/server-ws-phantomstream-relay-compat.test.js`: 22 PASS / 0 FAIL.
- `npm run validate:extension`: manifest valid, 260 JS files parsed clean.
- `git diff --check`: clean.

## Boundary

PARITY-03 is complete for the production stream adapter boundary. Generated PhantomStream bundles and FSB-specific adapters remain intentionally present. Broader test rewrites/differential coverage remain 25-02.
