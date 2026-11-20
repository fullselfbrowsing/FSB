---
quick: 260930-f7j
plan: 01
quick_id: 260930-f7j
slug: make-fsb-content-click-activate-its-targ
subsystem: extension-content
tags: [click, verification, double-activation, cdp-fallback, regression-test]
status: complete
verification: passed
completed: 2026-09-30
commits:
  - da7e484f
requires:
  - extension/content/actions.js (captureActionState, detectChanges, verifyActionEffect, click tool, clickAtCoordinates)
provides:
  - Single-activation content click (click tool and clickAtCoordinates)
  - Toggle-aware click verification (controlState, innerTextChanged, widened EXPECTED_EFFECTS.click)
affects:
  - Every DOM click issued by autopilot and by the MCP `click` tool
  - check/uncheck and the pressEnter submit fallback, which also verify with 'click' (now more lenient)
tech-stack:
  added: []
key-files:
  created:
    - tests/content-click-single-activation.test.js
  modified:
    - extension/content/actions.js
    - package.json
    - tests/delegation-phase-contract.test.js
---

# Quick 260930-f7j: Make FSB content click activate its target once

**Result:** FSB's content click now activates its target exactly once. A correct single toggle is recognised as an effect, so the trusted CDP fallback no longer flips it back.

## What changed

### `extension/content/actions.js`

- **New helpers:**
  - `TOGGLE_STATE_ATTRIBUTES`.
  - `getAssociatedStateElement`, which finds where a click's state lands when it is not on the clicked element: a label's control, a summary's details, or the nearest toggle-like ancestor of a clicked child.
  - `describeToggleState`.
- **`captureActionState`** records `controlState`.
- **`detectChanges`** adds `innerTextChanged` and `controlStateChanged`.
- **`EXPECTED_EFFECTS.click.anyOf`** now also counts `checkedChanged`, `controlStateChanged`, `ariaCheckedChanged`, `ariaPressedChanged`, `ariaSelectedChanged`, `dataStateChanged`, `openChanged` and `innerTextChanged`. All other action expectations are unchanged, and the test pins them.
- **`verifyActionEffect`** reports pressed, selected, checked and control-state changes in `localChanges`, so a successful toggle is not described as "No observable changes".
- **`click` tool:**
  - the synthetic sequence is `composed`;
  - the trailing `element.click()` is removed;
  - the link branch of `hadEffect` also accepts toggle-state changes.
- **`clickAtCoordinates`:**
  - one composed synthetic click, then verification;
  - the CDP click only `if (!verification.verified)`;
  - it now returns `hadEffect`.

### Tests

- **`tests/content-click-single-activation.test.js`** (new, 18 tests):
  - vm behaviour tests over the verification utilities;
  - a source contract for one activation per click path, with a negative control.
- **Chain registration:** added just before the benchmark command in `package.json` `scripts.test` (the benchmark command stays last), and to `REFINEMENT_ROOT_TEST_COMMANDS`. The historical hashes are unchanged.

## Verification

### Headless harness (uncommitted, `/tmp/fsb-click-harness`)

The harness:
- loads the real `CONTENT_SCRIPT_FILES` into an isolated world of chrome-headless-shell 146, with a `chrome` stub whose CDP answers `{success:false}`;
- calls `FSB.tools.click` on each target;
- counts activations on the page.

| Target | Before (HEAD `cab60fd7`) | After |
|---|---|---|
| Counter button | 2 activations, "no effect", CDP requested | 1, verified, no CDP |
| Native checkbox | unchanged (flipped twice), CDP requested | checked, verified, no CDP |
| Label-wrapped checkbox, by text | 2 activations, unchecked, reported success | 1, checked, verified, no CDP |
| Switch, by selector | 2 activations, aria-checked unchanged, CDP requested | 1, aria-checked flipped, verified |
| Switch, by text (inner span) | 2 activations, unchanged, CDP requested | 1, flipped, verified via the switch state |
| Form submit | 2 submits | 1 submit |
| Shadow host (listener on host) | 2 activations, CDP requested | 1 activation, then CDP requested (no visible signal) |
| SVG target | threw `element.click is not a function` | 1 activation, then CDP requested (no visible signal) |
| Target with no visible signal | 2 activations, CDP requested | 1 activation, exactly 1 CDP request |

### Tests and checks

- **New test:** 18/18 on Node 24.14.1 and on Node 20.20.2 (the official tarball at `/tmp/fsb-66-09-node20`).
- **Teeth:** against the pre-fix source, 17 of 18 fail. The negative-control test passes either way by design.
- **`node tests/delegation-phase-contract.test.js`:** 1206 passed, 0 failed.
- **Sweep of every test that references `actions.js`:** 30/30 before, 31/31 after (the new test is included), no new failures.
- **`npm run validate:extension`:** exit 0.
- **Full chain in tolerant per-command mode:** 313/313 commands exit 0 (13 pretest, 300 test).
  - Port 7225 is held by the user's hub, which was left running.
  - The chain rewrites the dates in three `showcase/angular/public` files; they were reverted and not committed.

## Benchmark impact (Phase 66)

`scripts/bench/fixtures/_shared/bench.js` cancels a same-turn repeat click on the same target. With one activation per click it never triggers.
- Neither it nor `scripts/bench/tasks/core.lock.json` was touched, so the frozen corpus hashes are unchanged.
- This fix lands before the Phase 66 live baseline (66-10/66-11), so the baseline measures the single-activation click.

## Remaining risk

A toggle whose change shows no visible signal still gets one DOM activation, then the CDP fallback. In a real browser, where CDP succeeds, that means two activations: better than today's three, but still wrong for that rare markup. The harness's "no visible signal" row demonstrates exactly this path.

## Follow-ups (out of scope)

- **Conditional re-activation when verification misses a real effect:**
  - the `form.submit()` fallback in the click tool;
  - the `pressEnter` submit-button fallback;
  - `siteSearch`'s submit/`form.submit()`;
  - the Notion `togglecheck` strategy;
  - the `type` tool's click-first focus loop.
- **Verification gaps:**
  - the loading-indicator check `[class*="load"]` is a presence test, so any matching class makes every click look successful;
  - the stability wait only sees the content script's own fetch/XHR, not the page's;
  - `elementLost` is not a click effect, and a removed target's zero rect sends the CDP click to (0,0).
- **Other:**
  - `toggleCheckbox` (MCP `check_box`) sets `.checked` directly, which does not reach React-controlled checkboxes;
  - shadow-root targets: `document.contains` should become `isConnected`, and the obscured-element fallback reports success without verifying;
  - no pointer events are dispatched, so menus that open on `pointerdown` rely on the CDP fallback.
