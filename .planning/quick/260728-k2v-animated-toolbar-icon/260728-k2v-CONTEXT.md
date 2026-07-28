# Quick Task 260728-k2v: Animated toolbar action icon - Context

**Gathered:** 2026-07-28
**Status:** Ready for planning

<domain>
## Task Boundary

Remove the green/red `chrome.action` badge connection dot. Replace it with a state-driven
toolbar action icon that is STATIC when idle and ANIMATES (orbit bead) while the agent works.

The icon must read as the same visual system as the on-page ViewportGlow overlay: same
periods, same palettes, same phase vocabulary, same retime behaviour.

Design source: `.context/fsb-icon-design/export/Motion Icons FSB/FSB Icon Animations.dc.html`
(four concepts: Orbit / Sweep / Breathe / Capability ring). Decision below collapses these
to Orbit-only for parity with ViewportGlow.

</domain>

<decisions>
## Implementation Decisions (LOCKED - do not revisit)

### Canonical source of truth
`extension/content/visual-feedback.js` ViewportGlow is canonical. The icon mirrors it.
The design file's own timings (1.2s sweep / 2.4s breathe / 1.6s ring) are SUPERSEDED.

| State | Period | Palette (glow-color-1 -> glow-color-2) |
|---|---|---|
| thinking | 6000ms | `#ff8c00` -> `#f59e0b` |
| acting | 4000ms | `#ff6600` -> `#ff8c00` |
| calling | 4000ms | `#8b5cf6` -> `#a78bfa` |
| watching | 5000ms | `#ff8c00` -> `#ffa500` |

Periods: `visual-feedback.js:1216-1221` (`_getDuration`).
Palettes: shadow-root CSS at `visual-feedback.js:1372-1403`.

### One animation form, not four
ViewportGlow uses a SINGLE bead (12% of perimeter, 2% end fades) varying only in period
and palette. The icon does the same. Sweep / Breathe / Capability-ring from the design file
are NOT implemented as separate forms - they survive only as palette values.

### Watching is STATIC, not animated
This is the one deliberate deviation from ViewportGlow. Trigger-watch is an always-armed
ambient state; a perpetual `setIcon` loop is the keepalive pattern Chrome restricts to
enterprise/education devices. Watching gets a static frame in the watching palette, set once
on arm and once on disarm. No loop.

### Connection state moves into the static icon
The removed green dot's information goes into the idle frame: full-strength when
`fsbWebSocket.connected` is true, dimmed/desaturated when false. No badge at all.

### Transparent background
Do NOT paint the design file's `#000000`. It becomes a black box on dark toolbars, and
there is no way to detect toolbar theme from a service worker (`matchMedia` is not exposed
in `ServiceWorkerGlobalScope`; Chrome does not support `theme_icons`).

### No text in the icon
The design file's `▽0.9.90` version tag is dropped. At 32px it is ~2px of text (illegible),
it is already stale (repo is 0.9.91), and worker font rendering is unreliable.

</decisions>

<specifics>
## Implementation Specifics

### Sizes
The toolbar action renders at 16 / 24 / 32 DIPs. 48 and 128 belong to manifest `icons`,
not `action.default_icon`. Render BOTH 16 and 32 per frame and always call:

```js
chrome.action.setIcon({ imageData: { 16: img16, 32: img32 } })
```

Never pass a bare `ImageData` - 32 is what Chrome picks on 2x displays.

### Rendering
- One reused `OffscreenCanvas` per size, `getContext('2d', { willReadFrequently: true })`.
  Without that flag every `getImageData()` forces a GPU->CPU readback.
- Base glyph: `fetch(chrome.runtime.getURL('assets/icon128.png'))` -> `blob()` ->
  `createImageBitmap()` -> `drawImage` scaled down. Call `.close()` on the bitmap when done.
- Do NOT attempt to rasterize SVG - `createImageBitmap` rejects SVG sources in a service
  worker (no DOM, no intrinsic sizing).
- Precompute all frames per state at startup. Never render inside the tick.

### Animation loop
- `setInterval` at ~66ms (~15fps). `chrome.alarms` has a 30s floor - unusable for animation,
  usable only for the watchdog.
- GLOBAL scope only. Never pass `tabId` to `setIcon`: tab-specific icons permanently shadow
  global ones, so a global loop would silently stop updating any tab that ever got a
  per-tab icon.

### Drive point
Tee `sendSessionStatus()` at `extension/background.js:1120`, AFTER `buildOverlayState()`
has normalized (line 1124-1126). Single choke point - every phase passes through it.

- Gate: `overlayState.highlight.animated` (same gate the overlay uses at
  `content/messaging.js:1168`; computed at `utils/overlay-state.js:442-444` as
  `animatedHighlights !== false && lifecycle === 'running'`). False -> static.
- Phase -> state map, identical to `content/messaging.js:1169-1173`:
  - `calling` -> calling
  - `acting` | `writing` | `switching_tab` -> acting
  - everything else -> thinking

### Retime on state change
Port the progress-fraction preservation from `visual-feedback.js:1197-1205` so the bead does
not jump when the period changes mid-cycle:

```
elapsed  = (now - startTime) % oldDuration
progress = elapsed / oldDuration
startTime = now - progress * newDuration
```

### Watching arm/disarm hooks
`fsbTriggerCountsForTab(tabId)` at `background.js:5648` returns `{ watching, fired }`.
Arm path: `fsbTriggerStartObserveForSnapshot` `background.js:5681`.
Disarm path: `fsbTriggerStopObserveForSnapshot` `background.js:5703`.

### Eviction recovery (mirrors ViewportGlow's own model)
- Persist intent (`animating`, current state) to `chrome.storage.session`.
- On SW startup, re-derive and RESTART the cycle from 0. Do NOT resume mid-phase - this is
  the same as ViewportGlow being destroyed and recreated on a page reload.
- If stored intent says animating but no live session exists, snap to the correct static
  frame (equivalent to ViewportGlow's `destroy()` on `cleared`).
- 30s `chrome.alarms` watchdog repairs a frozen icon. `alarms` permission already exists.
- If the SW is killed mid-animation the icon FREEZES on the last frame (action state lives
  in the browser process); it does not revert to the manifest default.

</specifics>

<removals>
## Badge code to remove

| File | Lines | What |
|---|---|---|
| `extension/ws/ws-client.js` | 2306-2314 | `_updateBadge(connected)` |
| `extension/ws/ws-client.js` | 2318-2321 | `_clearBadge()` |
| `extension/ws/ws-client.js` | ~1395 | `this._updateBadge(true)` in `ws.onopen` |
| `extension/ws/ws-client.js` | ~1414 | `this._updateBadge(false)` in `ws.onclose` |
| `extension/ws/ws-client.js` | ~1447 | `this._clearBadge()` in `disconnect()` |
| `extension/background.js` | 9760-9764 | `contentScriptReady` badge-clear + its `fsbWebSocket.connected` guard (the guard exists ONLY to protect the green dot) |
| `extension/background.js` | 9834-9835 | red `!` badge on `contentScriptError` |
| `extension/ui/options.js` | 2755-2763 | transition-guarded badge clear in `updatePendingCount()` |

Nothing in the test suite asserts badge text or colors. Verified: zero hits for `22c55e`,
`ef4444`, `FF0000` across `tests/` and `scripts/`.

</removals>

<tripwires>
## Hard constraints - these WILL break the suite

This repo pins exact substrings AND token counts in extension source. Even comment wording
has broken the suite before. Be conservative with comment text in `background.js` and
`ws-client.js`.

1. **No animation code in `extension/ws/ws-client.js`.**
   `tests/stream-candidate-resolution.test.js` executes that entire file in a bare VM
   sandbox with NO `setInterval`, NO `OffscreenCanvas`, NO `ImageData`, NO `fetch`, and a
   `chrome.action` mock exposing only `setBadgeText`/`setBadgeBackgroundColor`. Any new
   top-level or constructor-time reference to those throws.
   (Note: this file is NOT in the `npm test` chain, but honor the constraint anyway - it is
   the right architecture regardless.)

2. **Keep the `ws.onopen` block shape parseable.**
   `tests/metrics-wireup.test.js:46-64` regex-extracts that block and asserts the
   `ext:metrics` send is inside it. IN CI CHAIN.

3. **Do NOT touch the `chrome.action.onClicked` listener body at `background.js:17712`.**
   `tests/sidepanel-tab-scoping-fix-redo-smoke.test.js:111` pins the exact literal signature
   `chrome.action.onClicked.addListener(async (tab) => {` and re-evaluates the extracted body
   via `new Function` with a FIXED param list - a new call inside it throws ReferenceError.
   IN CI CHAIN.

4. **Do NOT add manifest permissions.**
   `tests/mcp-version-parity.test.js:573` byte-pins the ordered permissions array; `:546`
   pins `minimum_chrome_version: "116"`. No new permissions are needed - `alarms`,
   `storage`, and `offscreen` already exist. IN CI CHAIN.

5. **`tests/mcp-bridge-client-lifecycle.test.js:699`** pins `"source: 'contentScriptReady'"`
   inside the same `background.js` handler that holds the badge clear. Remove the badge line
   without disturbing that string. IN CI CHAIN.

6. **importScripts order pin.** `tests/phantom-stream-protocol-envelope.test.js:56-61` pins
   the relative order `'lib/lz-string.min.js'` < `'ws/phantom-stream-protocol.js'` <
   `'ws/ws-client.js'`. `tests/mcp-bridge-background-dispatch.test.js:1399` pins the literal
   `importScripts('ws/ws-client.js')`. Adding a new `importScripts` for the icon module is
   fine as long as that relative order is undisturbed. IN CI CHAIN.

7. **`tests/runtime-contracts.test.js:31,63`** asserts `ws-client.js` does NOT contain the
   string `sessionStateEvent` - a negative pin. IN CI CHAIN.

8. **New module must live under a syntax-checked dir.** `scripts/validate-extension.mjs:123`
   syntax-checks only `content, ui, agents, ws, offscreen, ai, utils, site-guides, shared,
   config, lib, catalog` plus root files `background.js, canvas-interceptor.js`.
   `extension/utils/` is covered - put the module there.

9. **`scripts/validate-extension.mjs:57`** requires every `manifest.icons[*]` path to exist
   on disk. Do not break those paths.

</tripwires>

<verification>
## Verification

Targeted tripwire tests (run these first, they are fast):

```
node tests/test-overlay-state.js
node tests/runtime-contracts.test.js
node tests/metrics-wireup.test.js
node tests/mcp-version-parity.test.js
node tests/mcp-bridge-client-lifecycle.test.js
node tests/sidepanel-tab-scoping-fix-redo-smoke.test.js
node tests/phantom-stream-protocol-envelope.test.js
node tests/mcp-bridge-background-dispatch.test.js
node tests/extension-content-script-files-completeness.test.js
node tests/overlay-content-audit.test.js
node tests/overlay-stability-cadence.test.js
node tests/trigger-observe.test.js
node tests/trigger-observe-pulse.test.js
node tests/stream-candidate-resolution.test.js
```

Then the gates:

```
npm run validate:extension
npm test
```

`npm test` is a very long serial chain. Run it once at the end, not per-task.

</verification>

<canonical_refs>
## Canonical References

- Design export: `.context/fsb-icon-design/export/Motion Icons FSB/FSB Icon Animations.dc.html`
- ViewportGlow: `extension/content/visual-feedback.js:1162-1479`
- Phase vocabulary / normalizer: `extension/utils/overlay-state.js`
- Chrome: `action.setIcon()` is documented as static-image only; animation must be
  frame-swapping. `OffscreenCanvas` + `ImageData` in a service worker is the supported path.
- Chrome 110+ : extension API calls reset the SW 30s idle timer, so the loop self-sustains
  while running. The unconditional 5-minute cap was removed in Chrome 110.

</canonical_refs>
</content>
</invoke>
