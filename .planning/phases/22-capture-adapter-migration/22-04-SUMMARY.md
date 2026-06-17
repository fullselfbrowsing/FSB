---
phase: 22-capture-adapter-migration
plan: "04"
subsystem: phantomstream-capture-security
tags: [phantomstream, capture, security, masking, sanitization, tests]

provides:
  - Explicit capture-side masking and sanitization guard
  - Aggregate npm test wiring for PhantomStream package/capture guards
  - Phase 22 closeout evidence
affects:
  - package.json
  - tests/phantom-stream-security-masking.test.js
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/STATE.md
  - .planning/phases/22-capture-adapter-migration/22-VALIDATION.md

requirements_completed: [CAP-04]
requirements_remaining: []

completed: 2026-06-17
---

# Phase 22 Plan 04: Security And Capture Test Rewrite Summary

Plan 22-04 is complete. Capture-side sensitive-content handling is now covered through an FSB-facing guard that verifies adapter configuration and the bundled PhantomStream sanitizer paths for masking, dangerous URL/script stripping, event-handler removal, `srcdoc` stripping, object/embed blocking, CSS scrubbing, mutation sanitization, and overlay exclusion.

## Accomplishments

- Added `tests/phantom-stream-security-masking.test.js`.
- Verified `dom-stream.js` passes `maskInputs: true` and `skipElement: isFsbOverlay` to `createCapture(...)`.
- Exercised the adapter `skipElement` callback in a VM for direct overlays, overlay descendants, FSB shadow overlays, and normal elements.
- Verified the bundled PhantomStream capture runtime masks password inputs unconditionally and extends masking to inputs, textarea, select, option values, text mutations, and input-value payloads when configured.
- Verified custom mask hooks fail closed to the package default mask if they throw.
- Verified the capture sanitizer strips or blocks event handlers, `srcdoc`, dangerous URL schemes, `srcset` candidates, unsafe CSS, scripts, noscript, object, and embed content across snapshot, added-subtree, attribute mutation, and text/value mutation paths.
- Wired the Phase 21/22 PhantomStream guards into the aggregate `npm test` stream-test cluster:
  - `tests/phantom-stream-public-package.test.js`
  - `tests/phantom-stream-exports.test.js`
  - `tests/phantom-stream-content-bundle.test.js`
  - `tests/phantom-stream-capture-adapter.test.js`
  - `tests/phantom-stream-sidechannels.test.js`
  - `tests/phantom-stream-security-masking.test.js`

## Verification

Executed successfully:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
node tests/phantom-stream-public-package.test.js
node tests/phantom-stream-exports.test.js
node tests/phantom-stream-content-bundle.test.js
node tests/phantom-stream-capture-adapter.test.js
node tests/phantom-stream-sidechannels.test.js
node tests/phantom-stream-security-masking.test.js
node tests/dom-stream-perf.test.js
node tests/dashboard-stream-readiness-ping.test.js
node tests/dashboard-stream-pending-intent.test.js
node tests/dashboard-runtime-state.test.js
npm run validate:extension
git diff --check
```

Focused results:

- `tests/phantom-stream-security-masking.test.js`: 44 PASS / 0 FAIL.
- `tests/phantom-stream-public-package.test.js`: 15 PASS / 0 FAIL.
- `tests/phantom-stream-exports.test.js`: 121 PASS / 0 FAIL.
- `tests/phantom-stream-content-bundle.test.js`: 11 PASS / 0 FAIL.
- `tests/phantom-stream-capture-adapter.test.js`: 23 PASS / 0 FAIL.
- `tests/phantom-stream-sidechannels.test.js`: 29 PASS / 0 FAIL.
- `tests/dom-stream-perf.test.js`: all assertions passed.
- `tests/dashboard-stream-readiness-ping.test.js`: 16 PASS / 0 FAIL.
- `tests/dashboard-stream-pending-intent.test.js`: 14 PASS / 0 FAIL.
- `tests/dashboard-runtime-state.test.js`: 57 PASS / 0 FAIL.
- `npm run validate:extension`: manifest valid, 258 JS files parsed clean.
- `git diff --check`: clean.

## Boundary

Phase 22 capture migration is complete. This does not claim dashboard renderer migration, relay/protocol migration, or remote-control reverse mapping; those remain owned by Phases 23 and 24.
