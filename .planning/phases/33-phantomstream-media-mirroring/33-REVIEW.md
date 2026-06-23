---
phase: 33-phantomstream-media-mirroring
reviewed: 2026-06-23T00:00:00Z
depth: deep
files_reviewed: 9
files_reviewed_list:
  - extension/content/dom-stream.js
  - extension/background.js
  - showcase/js/dashboard.js
  - showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts
  - extension/ws/phantom-stream-protocol-entry.js
  - showcase/js/phantom-stream-viewer-entry.js
  - tests/phantom-stream-media-sync.test.js
  - tests/phantom-stream-media-wiring.test.js
  - package.json
findings:
  critical: 0
  warning: 0
  info: 0
  blocker: 0
  high: 0
  medium: 0
  low: 2
  nit: 2
  total: 4
status: issues_found
---

# Phase 33: Code Review Report -- PhantomStream Media Mirroring

**Reviewed:** 2026-06-23
**Depth:** deep (cross-file + bundle trace)
**Files Reviewed:** 9 source/test files (bundles inspected as artifacts, not reviewed for minified content)
**Status:** issues_found (no must-fix; 2 LOW + 2 NIT)

## Summary

Phase 33 takes up PhantomStream 0.2.1's live `<video>`/`<audio>` media-mirroring feature. The
implementation is **correct, minimal, and consistent with the existing side-channel pattern**. The
whole media feature lives in the package; FSB only (a) bumped the pin 0.1.0 -> 0.2.1, (b) un-dropped
the `STREAM.MEDIA` / `STREAM.MEDIA_HINT` side channel at three glue seams (content forwarder,
background relay, dashboard dispatch x2), and (c) surfaced `classifyManifest` + the media viewer
config through the two esbuild entry shims.

I traced the full forwarding chain against the rebuilt bundles and it is **shape-correct end to end**:

- Capture core `sendMediaState` emits a flat MediaSyncPayload with fields at TOP LEVEL
  (`nid/event/currentTime/paused/playbackRate/duration|live/sentAt/streamSessionId/snapshotId`),
  verified in `extension/content/phantom-stream-capture.js`.
- `forwardCaptureMessage` (dom-stream.js:232) forwards it intact as `media: payload`.
- Background relay (background.js:8430) ships `request.media` verbatim as the `ext:dom-media` ws
  payload -- no re-wrapping.
- Dashboard `handleDOMMedia` -> `dispatchPreviewViewer('ext:dom-media', payload)` -> viewer
  `handleMedia(payload)` reads `payload.nid` and feeds the object straight to `reconcileMediaDrift`
  as `remote`, which reads `remote.currentTime` etc. at top level.

No wrapping/unwrapping mismatch exists anywhere on the path. The "payload IS the sync entry" design
note is accurate and matches the package's reconciler contract.

**Other checks (all PASS):**
- **Side-channel parity:** MEDIA/MEDIA_HINT use the same `shouldAcceptPreviewMessage` guard,
  `previewState === 'streaming'` gating, and `rememberIdentity` usage as scroll. The capture core
  emits `streamSessionId`/`snapshotId` on the media payload, so `rememberIdentity` and the stale
  guard are meaningful (not no-ops). `isCurrentStream` and `shouldAcceptPreviewMessage` are both
  lenient (reject only on a positive mismatch), so media is never falsely dropped when identity is
  absent.
- **Static vs Angular parity:** Equivalent. Same `mediaMode: 'reference'`, same degrade callbacks,
  same `handleDOMMedia`/`handleDOMMediaHint`, same inbound routes. Confirmed at TS:1076-1082,
  3524-3537, 3865-3866.
- **Degrade callbacks safe:** `onMediaBlocked(nid)` / `onMediaUnavailable(nid, reason)` signatures
  match the package. The package wraps BOTH in try/catch (`safeInvokeMediaHook` ->
  `logger.error(...)`), so a throw cannot escape the package. FSB's callbacks are synchronous
  diagnostics array-pushes (`recordDashboardTransportEvent` / `recordTransportEvent`) with no
  realistic throw path. Doubly safe.
- **No invariant breach:** Phase 33 touches NO capability/MCP/agent-loop/provider code. Verified the
  background.js diff is exactly the two additive relay cases; package.json diff is exactly the pin
  bump + the two new test files added to the `test` script.
- **No new permission:** `manifest.json` has NO `webRequest` (permissions or optional_permissions).
  The MEDIA_HINT adaptive-discovery path is correctly dormant; `mediaMode: 'reference'` needs no new
  permission (media bytes load via existing host access / page origin). Correct.
- **ws transport generic:** `fsbWebSocket.send(type, payload)` (ws-client.js:1351) is fully generic
  (envelope-encode + ship, no type allowlist). No server-side relay allowlist exists. `ext:dom-media`
  rides through untouched. The `FSB_PHANTOMSTREAM_STREAM_FALLBACK` in ws-client omits MEDIA/MEDIA_HINT
  but is never used to gate `send()`, so this is irrelevant to the outbound media path.
- **Test quality:** The reconciler test (`phantom-stream-media-sync.test.js`, 31 assertions) is
  **non-tautological and deterministic** -- distinct inputs produce genuinely distinct actions
  (`hold`/`seek`/`pause`/`rejoin-edge`/`nudge`) against the real package config
  (holdBand 0.25, hardSeek 1.0, nudgeFraction 0.05, liveRejoin 1.0), and it asserts specific output
  fields (`toTime`, `rate`, `revertRate`, `reason`), not just truthiness. The reconciler is pure
  (caller supplies `now`), so there is no timing flake. Both new tests pass (31/0 and 24/0) and are
  wired into the `npm test` script.

The remaining items are LOW/NIT hardening of the dormant hint channel and one latent consistency
smell. None block shipping.

## Critical Issues

None.

## Warnings

None.

## Info / Low / Nit

### LOW-01: Wiring test does not lock the dashboard-side `ext:dom-media-hint` seam (silent re-drop risk on the dormant channel)

**File:** `tests/phantom-stream-media-wiring.test.js:50-62`
**Issue:** The wiring test exists specifically to stop a future bundle rebuild or refactor from
silently re-dropping the side channel (its own docstring says so). It locks the **MEDIA** seam on
both dashboards (`handleDOMMedia`, `dispatchPreviewViewer('ext:dom-media'`, inbound
`msg.type === 'ext:dom-media'`) but only locks the **MEDIA_HINT** seam at the *background relay*
(`fsbWebSocket.send('ext:dom-media-hint'`) and the protocol bundle constant. There is NO assertion
for `handleDOMMediaHint`, `dispatchPreviewViewer('ext:dom-media-hint'`, or the inbound
`msg.type === 'ext:dom-media-hint'` route on either dashboard. A refactor that drops the dashboard
hint handler/route would leave the test green. This is exactly the "silently re-drop on a future
refactor" risk the channel is meant to guard -- it just happens to be the dormant channel today.
**Fix:** Add four parity assertions mirroring the MEDIA ones:
```javascript
ok(dashboard.includes("dispatchPreviewViewer('ext:dom-media-hint'"), 'static dashboard dispatches ext:dom-media-hint');
ok(dashboard.includes("msg.type === 'ext:dom-media-hint'"), 'static dashboard routes inbound ext:dom-media-hint');
ok(angular.includes("this.dispatchPreviewViewer('ext:dom-media-hint'"), 'angular dashboard dispatches ext:dom-media-hint');
ok(angular.includes("msg.type === 'ext:dom-media-hint'"), 'angular dashboard routes inbound ext:dom-media-hint');
```

### LOW-02: Fallback `STREAM` literal in dom-stream.js omits MEDIA/MEDIA_HINT (latent misroute if `forwardCaptureMessage` ever becomes reachable under the fallback)

**File:** `extension/content/dom-stream.js:14-21`
**Issue:** When the capture bridge is missing, `STREAM` falls back to a literal that does NOT define
`MEDIA` or `MEDIA_HINT` (so `STREAM.MEDIA === undefined`). In `forwardCaptureMessage`, the media
branch becomes `if (type === undefined)`. This is currently **dead and harmless**: when the bridge is
missing, `createCaptureHandle()` throws `phantomstream-capture-bridge-missing`, no capture is
created, and `forwardCaptureMessage` is never invoked -- verified. The real
`bridge.protocol.STREAM` from the 0.2.1 capture bundle DOES define both constants, so the live path
routes correctly. However, the fallback is now further out of sync with the real protocol (it already
omitted SUBTREE_RESPONSE/REQUEST_SNAPSHOT/STATE; Phase 33 widens the gap). If a future refactor ever
introduced a stub/degraded capture that reached `forwardCaptureMessage` under the fallback, an
`undefined`-typed message would fall into the MEDIA branch and forward garbage.
**Fix:** Add the two keys to the fallback literal for defense-in-depth and self-documentation:
```javascript
var STREAM = protocol.STREAM || {
  SNAPSHOT: 'ext:dom-snapshot',
  MUTATIONS: 'ext:dom-mutations',
  SCROLL: 'ext:dom-scroll',
  OVERLAY: 'ext:dom-overlay',
  DIALOG: 'ext:dom-dialog',
  MEDIA: 'ext:dom-media',
  MEDIA_HINT: 'ext:dom-media-hint',
  READY: 'ext:dom-ready'
};
```

### NIT-01: Viewer-entry wiring test asserts `onMediaUnavailable` forwarding but not `onMediaBlocked`

**File:** `tests/phantom-stream-media-wiring.test.js:66-67`
**Issue:** The test verifies `mediaMode: cfg.mediaMode` and the presence of `onMediaUnavailable` in
`phantom-stream-viewer-entry.js`, but does not assert `onMediaBlocked: cfg.onMediaBlocked` is
forwarded into `createViewer`. Both callbacks are wired correctly today (viewer-entry.js:92-93), but
the lock is asymmetric.
**Fix:** Add `ok(viewerEntry.includes('onMediaBlocked: cfg.onMediaBlocked'), 'viewer entry forwards onMediaBlocked');`
(and tighten the `onMediaUnavailable` check to the assignment form `onMediaUnavailable: cfg.onMediaUnavailable`).

### NIT-02: `handleDOMMediaHint` gates on `previewState === 'streaming'` -- worth confirming against intended hint semantics

**File:** `showcase/js/dashboard.js:3520`, `showcase/angular/.../dashboard-page.component.ts:3536`
**Issue:** Both `handleDOMMediaHint` handlers early-return unless `previewState === 'streaming'`,
copied from `handleDOMMedia`. For live playback state this is right. For an adaptive-manifest
*discovery hint* (which the package may emit slightly before/around stream transitions once the
opt-in webRequest path is enabled) the stream-only gate is defensible but worth a deliberate decision
rather than a copy-paste default. Moot while the channel is dormant; flagging so it is revisited if
MEDIA_HINT discovery is ever turned on.
**Fix:** No change required now. When enabling the webRequest discovery path, re-evaluate whether
hints should be accepted in `frozen-*`/pre-streaming states (mirror the `handleDOMOverlay`
multi-state gate if so), and add a comment recording the chosen semantics.

---

_Reviewed: 2026-06-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
