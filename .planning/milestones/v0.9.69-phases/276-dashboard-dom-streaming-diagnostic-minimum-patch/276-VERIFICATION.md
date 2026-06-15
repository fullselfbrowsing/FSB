---
phase: 276
plan: implicit-from-context
verified: 2026-05-14
status: human_needed
human_needed: true
human_action_kind: Browser-based dashboard streaming repro + hypothesis-matrix walk (DIAGNOSTIC.md, 8-step)
---

# Phase 276 Verification

## Status: human_needed (4/4 automated gates green; the actual fix-confirmation step is reserved for the user)

Phase 276 is a **diagnostic-first phase**. Per STREAM-01..02, the actual root cause cannot be confirmed without a real-browser repro of the dashboard-streaming bug, which an autonomous orchestrator running inside Claude Code cannot perform.

The orchestrator has landed:
- the **diagnostic scaffold** (`276-DIAGNOSTIC.md` with reproduction steps, log capture commands, and the 7-hypothesis validation matrix) for the user to fill during the manual repro pass, AND
- **defensive code patches** for the 3 highest-probability hypotheses (#1 hashKey room-state, #2 stream-tab readiness ping, #4 domStreamReady pending-intent re-arm) PLUS the 2 STREAM-05/06 bonuses (watchdog auto-resnapshot + WS backpressure drop counter) AND the STREAM-04 tooltip + Resync button UI.

These defensive patches are **SAFE TO LAND regardless of which hypothesis is the actual root cause** -- they harden the system in 3 separate failure modes (room mismatch, readiness race, pending-intent loss) without changing happy-path behaviour.

## Automated verifications (all green)

| # | Command                                                              | Status | Notes |
| - | -------------------------------------------------------------------- | ------ | ----- |
| 1 | `node tests/dashboard-stream-readiness-ping.test.js`                 | exit 0 | 16/16 PASS -- static invariants on pingDomStream + _waitForContentScriptReady + 3 behavioural simulations (ready on 3rd poll, never-ready timeout, immediate ready). |
| 2 | `node tests/dashboard-stream-pending-intent.test.js`                 | exit 0 | 14/14 PASS -- static invariants on _pendingStreamStart + _onDomStreamReady + park/re-arm/idempotency simulation. |
| 3 | `node tests/server-ws-backpressure.test.js`                          | exit 0 | 22/22 PASS -- single-wedged-drop + happy path + CLOSING-state not double-counted + counter accumulation + ring-buffer event recorded. |
| 4 | `node tests/showcase-build-smoke.test.js` (full build, ~14s)         | exit 0 | 134/134 PASS -- Angular production build green, prerender-routes.txt + sitemap.xml + llms.txt + llms-full.txt invariants honoured (still no /stats). |
| extra | `node tests/dom-stream-perf.test.js`                              | exit 0 | All assertions passed -- existing STREAM-03 / STREAM-04 invariants intact. |
| extra | Representative regression sweep: test-overlay-state, cost-tracker-ordering, qr-pairing, ws-client-decompress, telemetry-collector, server-no-ip-leak, server-trust-proxy, secure-config-credential-vault, dashboard-runtime-state, dashboard-metrics-render | all exit 0 | No regressions in any sampled test. |

## Self-Check (from SUMMARY.md)

PASSED -- all 6 created and 8 modified file paths exist; all 5 task commits (647df1c, 7005823, 4b9d992, 634c0e7, plus this metadata commit) confirmed in `git log`; all 3 new tests exit 0 (52 PASS, 0 FAIL).

## Constraint compliance

- [x] Atomic commits per task: 5 commits, one per task (`feat(276-01)`, `feat(276-02)`, `feat(276-03)`, `feat(276-04)`, `test(276-05)`).
- [x] DID NOT touch sitemap.xml, llms.txt, llms-full.txt, prerender-routes.txt, verify-hreflang.mjs, locale-seo.ts (verified post-build).
- [x] DID NOT modify the existing dom-stream-perf.test.js -- only added 3 NEW test files.
- [x] 5-attempt cap (STREAM-07) honoured: this counts as **1 of 5** attempts (combined hypotheses #1 + #2 + #4 hardening).
- [x] Status routes correctly to `human_needed` -- the autonomous orchestrator cannot drive a real browser for fix-confirmation.

<human_verification>
## Human-gated step: dashboard streaming end-to-end repro + 7-hypothesis walk

The actual confirmation that the defensive patches landed in this phase fix the dashboard-streaming bug (or, if not, identification of which subsequent hypothesis to patch next) requires the user to run the 8-step repro from `276-DIAGNOSTIC.md` on a real Chrome browser.

### 8-step manual repro

The complete procedure lives in `.planning/phases/276-dashboard-dom-streaming-diagnostic-minimum-patch/276-DIAGNOSTIC.md`. Summary:

1. **Start the showcase server.** `cd showcase/server && node server.js > /tmp/fsb-server.log 2>&1 &`
2. **Load-unpacked the extension in Chrome** via `chrome://extensions` -> Developer mode -> Load unpacked -> select `extension/`.
3. **Open the dashboard tab** in a non-extension tab. Pair the dashboard with the extension via the QR-pair flow if not already paired.
4. **Open a non-restricted target tab** in the same Chrome window (e.g. https://example.com -- NOT a `chrome://`, `chrome-extension://`, or CWS page).
5. **Press the "wake" button on the dashboard preview pane.** Note the timestamp.
6. **Wait 3 seconds** -- confirm whether streaming begins in the preview pane within the 3s threshold. (Happy path = green; bug repro = streaming does NOT begin.)
7. **Capture all three logs** per the next subsection.
8. **Walk the hypothesis matrix in `276-DIAGNOSTIC.md` in rank order**, marking each row PASS / FAIL / UNKNOWN. The first PASS row identifies the root cause.

### Hypothesis-walk instructions (the heart of this verification)

The 7-hypothesis chain is locked by STREAM-02. Walk the matrix in `276-DIAGNOSTIC.md` **top-to-bottom**. The first row whose verification command returns a non-empty result is the most-likely root cause.

| # | Hypothesis                              | Defensive patch already landed?                                                          | What to do if it fires                                                                                                                |
| - | --------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | hashKey room mismatch                   | YES -- `showcase/server/src/ws/handler.js` now logs `[WS] room-state` per connect       | Confirm BOTH `roles=ext` and `roles=dash` appear against the SAME `hashKey=<prefix>` in `/tmp/fsb-server.log`. If hashKey differs between extension and dashboard, server-side `validateHashKey` is at fault. |
| 2 | stream-tab not ready                   | YES -- `_waitForContentScriptReady` in ws-client.js replaces the `setTimeout(300)`     | Look for `dom-forward-failed` with `readyState=sendMessage-rejected` OR `ping-timeout-after-inject` in `fsb_diagnostics_ring`. If the ping-timeout fires, the page is taking > 5s to load -- bump `FSB_CONTENT_READY_TIMEOUT_MS`. |
| 3 | no-tab forward                          | NO -- defensive patch deferred to a follow-up attempt                                   | Look for `dom-forward-failed` with `readyState=no-tab`. Fix surface: arm `_streamingTabId` earlier (on `dash:dom-stream-start` payload `tabId`). |
| 4 | domStreamReady pending-intent           | YES -- `_pendingStreamStart` flag re-arms via `_onDomStreamReady` in background.js     | Look at timestamps in `fsb_diagnostics_ring`: `domStreamReady` should arrive BEFORE `dash:dom-stream-start` was processed. If reversed, the parked intent re-arm path now covers it. |
| 5 | ext:status race                         | NO -- defensive patch deferred                                                          | Look at the dashboard's `transportEventHistory()`: `dash:dom-stream-start` sent BEFORE `ext:status` `online=true` received? Gate the "wake" button until status received. |
| 6 | LZ decompression failure                | NO -- defensive patch deferred                                                          | Dashboard console shows `Failed to decompress dashboard WS message`? Confirm `LZString` global is bundled. |
| 7 | stale-mutation loop                     | NO -- defensive patch deferred                                                          | Dashboard transport events show repeated `mutation-resync-requested` with `reason=stale-mutation-*` within seconds? Snapshot every Nth mutation as guard. |

**Note: defensive patches are SAFE regardless of which hypothesis is the actual root cause.** If the streaming bug is NOT in #1/#2/#4, the defensive patches landed here remain useful hardening -- they will not regress the happy path, and they will help future debugging by surfacing more diagnostic information.

### 5-attempt cap (STREAM-07)

This phase counts as **1 of 5** total attempts. The combined hypotheses #1 + #2 + #4 defensive hardening is ONE attempt. If browser repro shows streaming is still broken after this patch lands, attempts 2-5 land in subsequent phases (one per remaining hypothesis: #3 no-tab forward, #5 ext:status race, #6 LZ decompression, #7 stale-mutation loop). If after 5 attempts streaming is still broken, the unresolved tail re-scopes to v0.9.70 with a deferred-items.md entry. Hard limit.

### Recording the outcome

After the user has run the repro:

1. **If streaming works (happy path):** edit this VERIFICATION.md frontmatter `status: human_needed` -> `status: passed`. Edit `276-DIAGNOSTIC.md` "Root cause identified" + "Fix applied + commit hash" sections to record which of hypotheses #1/#2/#4 fixed it (or "happy-path, none of the 7 hypotheses fired").
2. **If streaming still broken:** edit `276-DIAGNOSTIC.md` to record which row of the 7-hypothesis matrix fired, paste the 3 captured logs, and either (a) file a follow-up phase for the targeted minimum patch on the confirmed root cause, or (b) if all 5 attempts have been spent, re-scope the unresolved tail to v0.9.70.

### Notes for the publisher

- The `[WS] room-state` log line is now emitted on EVERY WS connect in the server -- regardless of which hypothesis is the root cause. Future debugging benefits from this even if hypothesis #1 is not the bug.
- The Resync button at `#dash-preview-resync-btn` is a user-facing recovery surface that lets a stuck preview be manually re-armed without reloading the dashboard. The same code path can be invoked programmatically via `requestPreviewResync('any-string-reason')`.
- The 4 new tooltip lines (`last-frame: Ns ago | mutations: N | apply failures: N | stale: N`) display the live state of the streaming pipeline -- hover the dash-preview-status-wrap to see them. If the tooltip shows `last-frame: 30s ago | mutations: 0` and the dashboard claims to be streaming, that's a smoking gun for a wedged stream.
- The watchdog auto-resnapshot is silent on the happy path; it fires only when the SW alarm rolls forward AND `_streamingActive` is true. Look for `ext:request-snapshot` with `reason=sw-watchdog-tick` in the dashboard's transport-event-history if you want to confirm it fired.
- The WS backpressure drop counter (`backpressureDroppedCount` in `showcase/server/src/ws/handler.js`) is currently a server-internal module-level counter. A future phase could expose it via a `/api/admin/relay-stats` endpoint for live observability.
</human_verification>

## Cross-references

- CONTEXT: `.planning/phases/276-.../276-CONTEXT.md` (commit `0a032e4`)
- DIAGNOSTIC: `.planning/phases/276-.../276-DIAGNOSTIC.md` (commit `647df1c`)
- SUMMARY: `.planning/phases/276-.../276-SUMMARY.md` (this commit)
- Prior phase close-out: `.planning/phases/275-.../275-SUMMARY.md` (commit `340d6a8`)
- Milestone audit: v0.9.69 -- to be created post-merge
