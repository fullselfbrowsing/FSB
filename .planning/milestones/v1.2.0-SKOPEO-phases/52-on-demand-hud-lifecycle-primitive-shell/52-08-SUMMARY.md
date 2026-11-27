---
phase: 52-on-demand-hud-lifecycle-primitive-shell
plan: 08
subsystem: chrome-extension-hud
tags: [skopeo, tab-authority, teardown-certificate, resource-accounting, chrome]

requires:
  - phase: 52-03
    provides: Explicit-only document runtime, generation ownership, and abort-first teardown
  - phase: 52-04
    provides: Sender-bound MV3 controller, dynamic injection, and tab-scoped lifecycle persistence
  - phase: 52-05
    provides: Tab-aware side-panel controller and explicit current-tab switch
  - phase: 52-07
    provides: Browser-faithful shell mechanics and stable eleven-category shell resource plateaus
provides:
  - One monotonic authority epoch across boot hydration, explicit tab activation, and window-focus resolution
  - Combined runtime and shell resource accounting with cleanup-before-certificate terminal ordering
  - Exact sender/generation-bound eleven-key finite numeric zero validation in the service worker
  - Mandatory local-Chrome mechanics coverage in the default regression chain
affects: [phase-52-review, phase-52-verification, phase-53-drive-router, milestone-audit]

tech-stack:
  added: []
  patterns: [monotonic async authority token, exact cleanup certificate, post-cleanup one-shot acknowledgment]

key-files:
  created:
    - .planning/milestones/v1.2.0-SKOPEO-phases/52-on-demand-hud-lifecycle-primitive-shell/52-08-SUMMARY.md
  modified:
    - extension/ui/sidepanel.js
    - extension/content/skopeo-runtime.js
    - extension/background.js
    - tests/skopeo-sidepanel-command.test.js
    - tests/skopeo-session-lifecycle.test.js
    - tests/helpers/skopeo-resource-ledger.js
    - package.json

key-decisions:
  - "Explicit tab activation claims authority synchronously; slower boot and window-focus work may finish unrelated data work but cannot select, activate, or repaint Skopeo."
  - "A teardown acknowledgment is evidence only after the shell, fixture timer, page listeners, runtime listener, test hook/flag, and owned sentinel are gone."
  - "Malformed or nonzero cleanup remains a cached terminal diagnostic and emits no certificate; it is never coerced into success."
  - "The local Chrome mechanics runner is mandatory automation, but it does not satisfy deferred unpacked-extension, Drive/Docs, VoiceOver, shortcut, MV3 wake, or live resource UAT."

patterns-established:
  - "Authority epoch: claim before asynchronous identity work, then recheck after every await before selected-tab effects."
  - "Certificate boundary: combine exact shell inventory with owner-local runtime counters, remove all owned globals/listeners first, validate exact finite zeroes, then send at most once."

requirements-completed: [HUD-01, HUD-02, HUD-03]
verification-status: automated-pass-live-uat-deferred
live-approval: false

duration: 28 min
completed: 2026-07-15
---

# Phase 52 Plan 08: Tab Authority and Cleanup Certificate Summary

**Skopeo now rejects stale outer tab work and accepts terminal cleanup only as an exact post-cleanup eleven-resource certificate, with the real-Chrome mechanics gate in ordinary regression.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-07-15T10:53:50Z
- **Completed:** 2026-07-15T11:21:23Z
- **Tasks:** 3
- **Files modified:** 7 implementation/test/package files plus this summary and phase tracking

## Accomplishments

- Added one page-lifetime `_tabAuthorityEpoch` shared by boot, `tabs.onActivated`, and `windows.onFocusChanged`, closing the reversed-resolution wrong-tab race without adding another active-tab query to the bounded controller.
- Counted the runtime message listener, active key/pagehide listeners, and controlled-fixture timeout alongside the shell inventory, then moved the sole teardown acknowledgment behind their actual removal and owned-global deletion.
- Replaced partial/coercive worker validation with exact own-key equality and finite JavaScript numeric zero checks for all eleven categories while preserving sender-tab and generation authority.
- Registered `tests/skopeo-browser-contract.test.js` exactly once after the four Phase 52 suites in `npm test`; focused, local-Chrome, extension-validation, and full-default gates all passed.

## Task Commits

Each task was committed atomically, with red controls preceding both TDD fixes:

1. **Task 1: Serialize boot, activation, and window-focus tab authority**
   - `744da6bd` — `test(52-08): pin outer tab authority races`
   - `3e905634` — `fix(52-08): serialize sidepanel tab authority`
2. **Task 2: Make the eleven-key teardown certificate exact and post-cleanup**
   - `4aab9384` — `test(52-08): reject weak teardown certificates`
   - `9198a4a0` — `fix(52-08): certify teardown after local cleanup`
   - `af14a83e` — `refactor(52-08): align resource certificate helpers`
   - `b07e947a` — `test(52-08): keep lifecycle self-test executable`
3. **Task 3: Register the browser mechanics gate and run complete automated closure**
   - `8ae91aab` — `test(52-08): register local Chrome mechanics gate`

**Plan metadata:** recorded in the final documentation commit.

## Authority Race Outcomes

The VM harness executes the actual production boot/listener bodies and the bounded side-panel controller. Every winner below was also used by a real controller refresh and next toggle payload.

| Sequence | Resolution order | Final authority |
|---|---|---|
| Focus Window A, then Window B | B resolves, then stale A | Tab B only |
| Boot query for Tab A, then explicit activation B | B commits, then boot A resolves | Tab B only |
| Focus query A, then explicit activation B | B commits, then focus A resolves | Tab B only |
| Focus Window A, then Window B | A resolves first, then B | Tab B only |
| `WINDOW_ID_NONE` | no query | Epoch, snapshot, activation, row, messages, and focus unchanged |

Late A/boot work produced no Skopeo text write or focus move after B became authoritative. The next `skopeo:get-status` and `skopeo:toggle-tab` envelopes carried only Tab B's positive ID.

## Combined Resource Evidence

The runtime integration harness deliberately gives its shell only root/top-layer resources so runtime-owned counts remain independently visible. Plan 52-07 retains the production shell's richer per-attention resource plateaus.

| Runtime point | roots | listeners | timeouts | popoverTopLayer | Other categories |
|---|---:|---:|---:|---:|---:|
| Script installed, no prepare | 0 | 1 | 0 | 0 | 0 |
| Prepared, root-free | 0 | 1 | 0 | 0 | 0 |
| Committed Ambient | 1 | 3 | 0 | 1 | 0 |
| Controlled fixture pending | 1 | 3 | 1 | 1 | 0 |
| Fixture callback entry | 1 | 3 | 0 | 1 | 0 |
| Terminal certificate | 0 | 0 | 0 | 0 | 0 |

The exact terminal sequence is:

```text
terminal -> abort -> clear-fixture-timeout -> destroy-shell
-> unregister-key/pagehide-listeners -> unregister-runtime-listener
-> delete-fixture-hook/flag -> delete-sentinel -> teardown-complete
```

The acknowledgment operation occurs after both active listener removals and the runtime-listener removal. The cached final snapshot and its resource/order objects are frozen; a second terminate, saved listener, cleared timer callback, Promise continuation, and replacement work send no second acknowledgment and recreate no resource.

## Certificate Rejection Matrix

| Input class | Result |
|---|---|
| Exact eleven own keys, each finite numeric `0`, current sender tab and generation | Accepted as cleanup evidence; failed-start case then closes the record as Off with its expected start-failure response |
| Any one of the eleven keys missing | Rejected |
| Extra resource key | Rejected |
| `null`, `false`, empty string, numeric non-object, or array | Rejected |
| String `"0"`, `NaN`, `Infinity`, or `-Infinity` category value | Rejected |
| Inherited rather than own category | Rejected |
| Payload `tabId`, wrong sender tab, or stale generation | Rejected |
| Missing/extra malformed outer envelope key | Rejected |
| Runtime destroy result missing/extra/coercible/nonfinite/nonzero/non-object | Owner remains terminal; no certificate is emitted |

The first red worker control reproduced the former defect: a certificate missing `observers` was accepted and moved the live record Off. Production now rejects that and every adjacent negative above.

## Automated Verification

All prescribed gates passed against the final code:

- Focused closure chain: ledger, lifecycle, shell, side-panel/command, accessibility, browser contract, overlay state, content audit, overlay cadence, both adjacent tab smokes, and injection completeness — **PASS**.
- Local Chrome mechanics: **PASS** using `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; no skip path was taken.
- `npm run validate:extension`: **PASS**, manifest valid and 411 JavaScript files parsed clean.
- `npm test`: **PASS**, including the newly registered local-Chrome mechanics gate exactly once.
- `git diff --check`: **PASS**.

The full test chain regenerated only `showcase/angular/public/llms-full.txt` and `showcase/angular/public/sitemap.xml` date stamps (`2026-07-05` to `2026-07-15`). Their date-only diffs were inspected and restored with `apply_patch` after each full run.

## Files Created/Modified

- `extension/ui/sidepanel.js` — Adds the shared tab-authority epoch and stale checks across boot, activation, focus, and DOM hydration.
- `extension/content/skopeo-runtime.js` — Adds owner-local counters, combined inventory, exact-zero validation, cleanup-before-ack ordering, and a frozen terminal diagnostic.
- `extension/background.js` — Requires the exact immutable eleven-key finite numeric zero certificate.
- `tests/skopeo-sidepanel-command.test.js` — Executes real outer authority races and the worker's malformed/coercive/wrong-authority rejection matrix.
- `tests/skopeo-session-lifecycle.test.js` — Verifies combined active counts, timeout release, cleanup ordering, one-shot acknowledgment, malformed terminal diagnostics, and stale-work inertness.
- `tests/helpers/skopeo-resource-ledger.js` — Exports the independent exact-zero oracle and exhaustive shape/value negative controls.
- `package.json` — Runs the local-Chrome browser mechanics contract once in the default test chain.

## Deviations from Plan

The final helper-name refactor aligned production with the plan's declared `bumpRuntimeResource`, `combinedResourceSnapshot`, and `resourcesAreExactZero` interfaces without changing behavior or scope.

### Auto-fixed Issue

- **Found during:** final test audit.
- **Issue:** the documented lifecycle `--self-test` path still executed its historical mirrored runtime, so the new combined-resource assertions correctly failed against that stale mirror even though production/default gates were green.
- **Fix:** retained the reducer oracle in self-test mode but ran the runtime integration portion against the production runtime, which is the behavior the expanded integration assertions govern.
- **Verification:** both `node tests/skopeo-session-lifecycle.test.js --self-test` and production mode pass.
- **Committed in:** `b07e947a`.

## Issues Encountered

- The full regression chain deterministically updates crawler-file dates. Only those inspected date stamps changed; they were restored after verification.

## User Setup Required

None. No dependency, package, server, daemon, model, Graphify runtime, AI provider, or MCP surface was added.

## Next Phase Readiness

- Phase 52 plan execution is exactly **8/8**, with eight v1.2.0 milestone phases total (52-59); Phase 999.1 remains outside the milestone.
- The phase is ready for fresh code review and goal verification. It is not marked complete or live-approved.
- `52-UAT.md` is byte-for-byte unchanged at blob `a9fa6926c909d322fe45d8d959d37a24f4cafd80`: L01-L15 remain DEFERRED, zero live rows passed, and unpacked-extension, Drive/Docs, VoiceOver, shortcut, MV3 sleep/wake, OS-preference, and live resource evidence remain unclaimed.

## Self-Check: PASSED — Automated Gap Closure Only

- All seven Task 1-3 implementation/test commits above exist in history.
- Required artifact names, helper interfaces, exact category order, and minimum substance thresholds are present.
- Focused, local-Chrome, validation, full regression, and whitespace gates passed on final code.
- Roadmap/state accounting is 8/8 plans, 0/8 milestone phases verified complete, and ready for review/verification.
- No live Drive/Docs/VoiceOver or full extension-runtime observation was inferred from deterministic local Chrome mechanics.

---
*Phase: 52-on-demand-hud-lifecycle-primitive-shell*
*Completed: 2026-07-15 with live UAT deferred*
