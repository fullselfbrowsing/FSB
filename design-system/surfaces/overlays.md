# In-page overlays

Status: current. The status pill replaced the progress card in PR #173 ([decision 0008](../decisions/0008-status-pill-replaces-progress-card.md)).

## What it is

The overlays are what FSB draws on web pages it does not own. One content script, [`visual-feedback.js`](../../extension/content/visual-feedback.js), defines eight classes, each used as one singleton on `window.FSB`. [`messaging.js`](../../extension/content/messaging.js) drives them from service-worker messages.

| Overlay | Class in `visual-feedback.js` | Driven by (`messaging.js` unless named) |
|---|---|---|
| Element highlight | `HighlightManager` | the `highlightElement` message; nothing sends it |
| Status pill | `ProgressOverlay` | `sessionStatus`, carrying `buildOverlayState` from [`overlay-state.js`](../../extension/utils/overlay-state.js) |
| Replay player | `ReplayPlayerOverlay` | `sessionStatus` with `overlayState.replay` |
| Viewport glow | `ViewportGlow` | `sessionStatus`, `executeAction`, `triggerPulseStart` |
| Trigger badge | `TriggerBadge` | `triggerPulseStart`, `triggerPulseStop` |
| Action glow | `ActionGlowOverlay` | `executeAction` (box or text), `triggerPulseStart` (pulse) |
| Element inspector | `ElementInspector` | Ctrl+Shift+E, or `toggleInspectionMode` |
| Crawl card | `CrawlProgressOverlay` | `showCrawlOverlay` from `SiteExplorer.collectPageData` in [`site-explorer.js`](../../extension/utils/site-explorer.js) |

- **Hosting.** Every host but the highlight resets with `all: initial`. `promoteToTopLayer` sets `popover="manual"` and calls `showPopover()`. Without the Popover API, or if it throws, the host is appended to `<html>` at `z-index: 2147483647`. See [decision 0006](../decisions/0006-overlays-in-shadow-dom-top-layer.md).
- **Re-stacking.** `show()` on the pill, the replay player and the glow runs `hidePopover()` then `showPopover()`, so they land above popovers the page opened since.
- **What raises them.** Action tools carry `visual_reason` and `client` (`VISUAL_SESSION_FIELDS` in [`tool-definitions.js`](../../extension/ai/tool-definitions.js)). The first such call starts an implicit visual session, and `is_final: true` ends it. Read-only tools such as `read_page` carry neither field, so they never raise or extend one (`_recordVisualSessionTickIfPresent` in [`mcp-bridge-client.js`](../../extension/ws/mcp-bridge-client.js)).
- **Cleanup.** The `beforeunload` listener destroys every overlay but the trigger badge. A `pagehide` that is not entering the back-forward cache destroys the action glow and the replay player.

## Palette and tokens

The overlay accent is `#ff8c00`, deliberately not the panel and site orange `#ff6b35` ([decision 0003](../decisions/0003-overlay-accent-ff8c00.md)). The product palette `--fsb-*` ([`product-surface.css`](../tokens/product-surface.css)) never appears on a page.

The colours are literals inside the shadow-root stylesheets of `visual-feedback.js`. [`overlay.css`](../tokens/overlay.css) catalogues them as `--fsb-ov-*` tokens; each names its source selector and property, and `checkOverlayTokens` in [`verify-design-system.mjs`](../../scripts/verify-design-system.mjs) fails when one drifts. It reads every stylesheet assigned to a `textContent`, inline or through a named constant such as `PILL_CSS`. Nothing in the extension reads these variables. Specimen: [overlay palette](../guidelines/color-overlay.card.html).

| Overlay | Tokens | Values |
|---|---|---|
| Viewport glow | `--fsb-ov-thinking-*`, `--fsb-ov-acting-*`, `--fsb-ov-watching-*`, `--fsb-ov-calling-*` | `#ff8c00` to `#f59e0b`; `#ff6600` to `#ff8c00`; `#ff8c00` to `#ffa500`; `#8b5cf6` to `#a78bfa` |
| Status pill | `--fsb-ov-pill-*`, `--fsb-ov-accent`, `--fsb-ov-progress-fill`, `--fsb-ov-done`, `--fsb-ov-error`, `--fsb-ov-guarded*` | `#000000` body, `#f1f5f9` status, `#94a3b8` name and timer, fill `#ff8c00` to `#ff6600`, done `#34d399`, error `#f87171`, blocked `#f5a524` with its note in `#f5cf8f` |
| Replay player | `--fsb-ov-replay-*` | `rgba(8, 8, 8, 0.94)`, `#ff9f2e`, hover `#ffb45c`, fill `#ff8c00` |
| Trigger badge | `--fsb-ov-badge-*` | `rgba(20, 16, 12, 0.88)`, text `#fff5e6`, orange dot |
| Action glow | `--fsb-ov-target-border`, `--fsb-ov-target-fill` | `2.5px solid rgba(255, 140, 0, 0.8)`, orange at 4% |
| Crawl card | `--fsb-ov-crawl*` | `#38bdf8`, fill `#0ea5e9` to `#38bdf8`, slate `rgba(15, 23, 42, 0.92)`: blue because crawling does not act on the page |

- **Untokened.** The highlight (`HighlightManager.show`: `#FF8C00` outline, `rgba(255, 140, 0, 0.8)` glow) and the inspector (`#FF8C00` pill and header, white `#fff` panel, `#333` text) have no tokens. Each pill state sets its own accent and ring on `.pl-host` (`--c1`, `--ring`; see States); only the thinking and blocked accents have tokens. The crawl ring `rgba(56, 189, 248, 0.3)` is a literal too.
- **Type.** The system stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) everywhere but the pill. The pill's status line is `500 12.5px system-ui` (`PILL_STATUS_FONT`); its agent name, timer, count and third row use `PILL_MONO`, `'fsb-pill-mono', 'Space Mono', 'SFMono-Regular', Consolas, Menlo, monospace`. `ensurePillFont()` registers `fsb-pill-mono` on the document from `assets/onboarding/fonts/space-mono-400.ttf`, which `manifest.json` lists as web-accessible, because `@font-face` inside a shadow root is ignored. The pill's wordmark is drawn as outlines for the same reason (`PILL_WORDMARK_SVG`).

## Anatomy

| Overlay | Host | Where and size | Shadow root | Pointer events |
|---|---|---|---|---|
| Highlight | none; inline `!important` styles on the element | 3px solid outline, three-layer glow, `z-index: 2147483646`, `position: relative` if static | none | the element's own |
| Status pill | `#fsb-progress-host` | fixed 16px from top and right; `.pl-host` grows from its top-right corner, at most 248px wide (`PILL_MAX_W`) | open | host and pill none; only `.pl-stop` takes clicks |
| Replay player | `#fsb-replay-player-host` | bottom centre at `max(16px, env(safe-area-inset-bottom))`, `min(560px, calc(100vw - 32px))` | open | `.fsb-replay-shell` takes clicks; none while collapsed or fading |
| Viewport glow | `#fsb-viewport-glow-host` | full viewport; four 6.5px edge bars over an inset ambient glow | closed | none |
| Trigger badge | `#fsb-trigger-badge-host` | `.badge-root` pill 14px from bottom and right | closed | none |
| Action glow | `#fsb-action-glow-host` | full-viewport host; `.box-overlay` or `.text-highlight` rects over the target | closed | none |
| Inspector | `#fsb-inspector-overlay`, `#fsb-inspector-panel`, `#fsb-inspector-indicator` | dashed hover box; panel 20px from bottom and right, 350px wide, up to 400px tall; pill 10px from the top, centred | panel only, open | hover box and pill none; the panel takes clicks |
| Crawl card | `#fsb-crawl-progress-host` | fixed 16px from bottom and right, 280px wide | open | `.fsb-crawl-overlay` takes clicks |

`markOverlayElement` gives every host but the replay player `data-fsb-overlay="true"`, `aria-hidden="true"` and a `data-fsb-overlay-role`.

- **Status pill** (`.pl-body`): black, radius 18 at every size, and a 1px ring in the state colour drawn by its shadow, `0 8px 32px` black at 40%. Widths and heights are set in px so they ease.
  - **Top row,** 36px: the wordmark (Poppins F at 200 and S at 900 at 17px, white, the B a drawn path, 32px wide and 12 from the left); a 1×14 divider in white at 16% with 10px each side; the agent name (9.6px mono, 0.16em, capitals, `#94a3b8`, never cut); a check mark when done; the timer (10.5px mono, `M:SS`, 14 from the right); and a 36px round Stop. The divider and the name are left out for FSB's own autopilot (`.anon`).
  - **Status line:** system UI 500 at 12.5px on 17px in `#f1f5f9`, two lines at most, then an ellipsis. A count (10.5px mono, `#ffb45c`) sits at the right when the progress label carries a number.
  - **Third row** (`.pl-meta`, 26px): the agent id on hover (`.k-who`), or for a capability call a 24px tick in the state colour, the capability slug in `#cbd5e1` and its readiness tag in `#34d399`, amber when blocked (`.k-cap`). A blocked site shows the note instead (`.pl-note`, 44px, 11.5px on 17px in `#f5cf8f`, `.k-guard`).
  - **Track:** 2px, white at 10%, inset 12px and 14px, 4px from the bottom; a 38% fill sweeps, or `scaleX` shows a known percent.
  - **Shapes** (`_render`): the seed is 56×36. The top line alone is 36px tall and 68px plus the timer wide, plus 21 and the name when a name shows, 20 for the check and 26 for Stop. The full pill takes the status line's width, or 248 for a capability call or a blocked site; its height is 41 plus 17 per status line, plus 20 for a third row or 38 for the note.
- **Replay player.** `.fsb-replay-controls` is a `32px auto minmax(80px, 1fr) 54px` grid, at least 44px tall, 12px radius, 10px backdrop blur: a 30px round play/pause, the time, a 3px track under a range input, and a 54×28 speed pill. At 430px wide or less the time hides. Collapsed, a 3px `.fsb-replay-minimal-track` inset 8px remains.
- **Action glow geometry** (`_buildHighlightSpec`):
  - Target: `_findHighlightTarget` keeps interactive tags and roles. Otherwise it climbs up to 5 ancestors to an interactive one or one at least 32×32, stopping when the next parent is more than 3× wider.
  - Text mode: links up to 72px tall and `min(80vw, 560px)` wide, and inline text up to 56px tall and `min(75vw, 520px)` wide. Each line rect is padded 4px left and right and 2px top and bottom, radius 6px.
  - Box mode otherwise. Padding is 4 for `INPUT`, `TEXTAREA` and `SELECT`, 6×4 for elements 40px tall or less, 6 otherwise. The radius is the element's top-left radius plus 4, kept between 6 and 18 (8 or 10 when it cannot be read).
- **Inspector panel.** An orange header with the tag and id, then "Selectors FSB Would Try" (`FSB.generateSelectors`), "Attributes", "Interactability" (OK or FAIL for visible, enabled, in viewport, pointer events), "Position" and "Text Content".
- **Crawl card.** An 18px logo and "FSB Crawling" in `#38bdf8`, the domain, "N / M pages" with a percent tag, a 4px bar, the current path in 10px type.

## States

**Status pill** (`ProgressOverlay.update`). The first state that applies wins, top to bottom.

| State | Set by | Accent, ring | Look |
|---|---|---|---|
| Done, error, partial, stopped | `lifecycle: 'final'` with that `result`; any other result reads as done | `#34d399` at 55%; `#f87171` at 55%; `#f5a524` at 65%; `#94a3b8` with white at 22% | the timer freezes and the track fills in the accent; done adds a check mark and "Done". The pill holds 3s (`PILL_FINAL_HOLD_MS`), then leaves |
| Blocked | `overlayState.guarded` | `#f5a524`, amber at 65% | the note row with the capability's note text; it stays open until the next call |
| Waiting | `overlayState.reconnecting`, which the page watchdog sets after 60s without a `sessionStatus` | `#94a3b8`, white at 22% | the wordmark at 50%; "Waiting for next automation update", or "Reconnecting to the active page" |
| Capability call | phase `calling` | `#a78bfa`, violet at 45% | the third row: tick, capability slug and readiness tag ("T1 ready") |
| Trigger watch | phase or mode `trigger-watch` | `#ffa500`, orange at 30% | the caption, or "Watching DOM for change"; it folds after 4s (`PILL_WATCH_FOLD_MS`) |
| Acting | phase `acting`, `writing` or `switching_tab` | `#ff7a00`, orange at 42% | |
| Thinking | any other phase | `#ff8c00`, orange at 30% | |

- **Who is acting.** The top row names the MCP client (`clientLabel`), left out for FSB's own autopilot. The short agent id (`agentIdShort`) shows in the third row on hover.
- **Stop** shows while `overlayState.stoppable` is true and the session is not final.
- **Fold.** 2.6s after the status last changed, the pill folds to its top line (`PILL_FOLD_AFTER_MS`); a new status opens it again.
- **Trigger pulses** only relabel a pill that is up. `update()` returns before a pill exists, so a pulse never creates one, and a pill that is leaving keeps leaving.
- **Clearing.** `update()` with `lifecycle: 'cleared'` only drops a trigger watch back to thinking. Every other clear goes through `dismiss()`, which runs the exit. A frozen pill ignores updates until `reset()`.

**Viewport glow** (`ViewportGlow.setState`). It shows only while `overlayState.highlight.animated` is true: a running session whose `animatedHighlights` is on. The control panel's "Animated Action Highlights" toggle (`#animatedActionHighlights` in [`control_panel.html`](../../extension/ui/control_panel.html)) sets that for autopilot. MCP manual actions (`source: 'mcp-manual'`) light `acting` for the action and destroy the glow after it.

| State | When | Lap (`_getDuration`) | Colours | Opacity, brightness |
|---|---|---|---|---|
| thinking | every other phase, and between actions | 6s | `#ff8c00` to `#f59e0b` | 1, 1.625 |
| acting | phase `acting`, `writing` or `switching_tab`; during an action | 4s | `#ff6600` to `#ff8c00` | 1, 1.95 |
| watching | a trigger is armed, unless acting | 5s | `#ff8c00` to `#ffa500` | 0.85, 1.4 |
| calling | phase `calling` | 4s | `#8b5cf6` to `#a78bfa` | 1, 1.5 |

- **Action glow:** `box`, `text`, or `trigger-pulse` (a box with `.trigger-pulse`). `clearPulse` removes only a pulse, never an action highlight. The glow goes when its target leaves the DOM.
- **Replay player:** `playing` (controls collapse after 3s idle; hover, focus and scrubbing hold them), `paused` (play shown, controls stay), `decision` (play, scrub and speed disabled), then terminal `completed`, `stopped` or `failed` (disabled, hold, fade, destroy). Speeds cycle through `REPLAY_PLAYER_SPEEDS`, ½× to 8×, default 2×. Seeking is forward only: a backward drag snaps back.
- **Trigger badge:** "N watching · M fired" while either count is above 0; the fired part hides at 0.
- **Inspector:** on, the hover box follows `elementFromPoint` and page clicks are captured and cancelled; a click opens the panel; close hides it.
- **Crawl card:** rebuilt by `showCrawlOverlay` after each page load. `updateCrawlOverlay` updates only a card that exists; `hideCrawlOverlay` removes it.

## Motion

| Overlay | Timing |
|---|---|
| Pill text | a change waits at least 400ms (`PROGRESS_TEXT_DEBOUNCE_MS`) and every line stays at least 1200ms (`MIN_DISPLAY_DURATION_MS`). The first write and `final` skip both. A generic thinking label is held back for the first 1000ms. A new line scales in from 110% and unblurs from 4px over 0.42s, `cubic-bezier(0.16, 1, 0.3, 1)` (`plInA`, `plInB`); the old one shrinks to 90% and blurs out over 0.3s (`plOutA`, `plOutB`) |
| Pill shape | the host pops in over 0.4s, `cubic-bezier(0.3, 1.5, 0.5, 1)`, from 30% scale, 16px up and a 6px blur (`plPop`), as the seed. The top line opens at 240ms and the status at 560ms (`PILL_SPAWN_BEATS`). Growing eases width and height over 0.52s, `cubic-bezier(0.5, 0, 0.15, 1.22)`; shrinking takes 0.42s after 0.08s, `cubic-bezier(0.5, 0, 0.2, 1)`. Content leaves before a shape shrinks and arrives after it starts to grow |
| Pill end | done holds 3000ms (`PILL_FINAL_HOLD_MS`). The exit runs the spawn backwards: the status folds, the pill draws back to the seed at 300ms, lifts away at 760ms and is removed at 1080ms (`PILL_EXIT_BEATS`). A new call during the exit morphs it back |
| Pill and icon | the toolbar icon's four motions play on one clock (`PILL_FORMS`): sweep 1.2s, orbit 4s, ring 1.6s, breathe 2.4s. The service worker picks one: breathe, then ring, then orbit or sweep |
| Viewport glow | fades in over 0.6s (`vgIn`) and out over 0.5s (`VIEWPORT_GLOW_FADE_OUT_MS`). One requestAnimationFrame bead, 12% of the perimeter with a 2% fade at each end, at even speed on every edge; a state change keeps the bead in place; ambient and filter ease over 0.5s |
| Action glow | `fsbActionGlow` 1.5s pulse with `fsbGlowAppear` 0.3s (scale 1 to 1.03 and back); `fsbTextGlow` 1.3s; `fsb-trigger-pulse` 2.4s (opacity 0.55 to 0.92, scale 1.025); fades 0.25s box, 0.18s text; `hide()` removes it after 250ms |
| Replay | controls hide after 3000ms (`REPLAY_PLAYER_HIDE_DELAY_MS`), sliding 6px over 0.18s; a finished replay holds 3000ms and fades 200ms (`REPLAY_PLAYER_FADE_MS`) before `destroy()` |
| Trigger badge | 220ms fade with a 4px rise; the dot breathes over 2.4s; removed 250ms after both counts reach 0 |
| Crawl, highlight | crawl bar width 0.3s, fade 0.2s; highlight box-shadow 0.15s, held 500ms by default and 2000ms through the handler |

**Silence.** In the page, 60s without `sessionStatus` turns the pill to waiting (`FSB._overlayWatchdogTimer` in `messaging.js`), and 120s after that every overlay is removed (`FSB._overlayOrphanTimer`): 180s after the last status. In the worker, `planMcpVisualSessionReplay` in [`mcp-visual-session.js`](../../extension/utils/mcp-visual-session.js) replays a stored session as "Waiting for MCP client" once it is idle over 60s (`MCP_VISUAL_SESSION_DEGRADE_AFTER_MS`) and clears it after 120s (`MCP_VISUAL_SESSION_ORPHAN_CLEAR_AFTER_MS`). An MCP visual session also ends 60s after its last action (`MCP_VISUAL_LIFECYCLE_DEATH_MS` in [`mcp-visual-session-lifecycle.js`](../../extension/utils/mcp-visual-session-lifecycle.js)).

**Reduced motion** (`@media (prefers-reduced-motion: reduce)` in each stylesheet; see the [motion foundation](../foundations/motion.md)):
- **Pill:** no transitions or animations. Shapes, text and colours still change, and the icon's motions hold their first frame: the orbit keeps its bead, standing still (`_reduced`).
- **Replay:** no transitions; `_scheduleTerminalRemoval` destroys a finished player with no fade.
- **Badge:** an 80ms opacity change only; the dot rests at 0.85.
- **Action glow:** no transitions or loops; the trigger pulse holds a still border.
- **Viewport glow:** its fade and transitions stop, but the bead keeps travelling (Known issues).
- **Not handled:** the crawl card and the highlight.

## Copy and i18n

- **Helper.** Every string goes through `ov(key, english, subs)`, which asks `fsbUiLocale.text` and falls back to the English with `$NAME$` substitution. Keys live in the eight catalogs under `extension/_locales/` ([English](../../extension/_locales/en/messages.json)).
- **Labels from the worker.** `OVERLAY_LABELS` translates only exact English labels ("Acting…" keeps its ellipsis). Task titles, model summaries and AI status text show as sent.
- **Language change.** `writeLabel` and `writeKeyed` remember each source string; `refreshOwnedChrome` redraws them on `fsbUiLocale.onChange` and sets `lang` on the root.

| Where | English | Keys |
|---|---|---|
| Pill | Stop's name "Stop", "Done", the phase and detail labels such as "Watching DOM for change" | `entry_stop`, `entry_done_pill`, `entry_phase_*`, `entry_detail_*` |
| Badge | "$COUNT$ watching", "$COUNT$ fired" | `entry_watching`, `entry_fired` |
| Replay | "Replay controls", "Pause replay", "Play replay", "Replay position, forward seek only", "Replay speed $SPEED$. Activate to change to $NEXT$" | `entry_replay_*`, `entry_pause_replay`, `entry_play_replay` |
| Inspector | "FSB Inspector Mode (Ctrl+Shift+E to exit)", "Click an element to inspect", "Selectors FSB Would Try" | `entry_inspector`, `entry_inspect`, `entry_selectors` |
| Crawl | "FSB Crawling", "Crawling $DOMAIN$", "$COLLECTED$ / $MAX$ pages" | `entry_crawl_title`, `entry_crawling`, `entry_pages` |

- **The gate.** [`verify-extension-copy.mjs`](../../scripts/verify-extension-copy.mjs) lists this file in `SCOPE`. A quoted string that starts with a capital or a `$PLACEHOLDER$` and has three or more words must be an English catalog message (`isProse`). Text in markup built in JS must go through `ov()`. Identifiers must not read as sentences: name fonts and keyframes in kebab-case (`fsb-trigger-badge-dot`). See the [voice and copy foundation](../foundations/voice-and-copy.md).

## Accessibility

- **Click-through.** The pill and its host ignore pointer events, so a click the agent sends to that corner still reaches the page; Stop is the only target. Hover is found by comparing the pointer with the pill's rectangle (`_trackPointer`). The glows and the badge never take pointer events. The replay shell, the inspector panel and the crawl card do.
- **Hidden from assistive tech.** Every host but the replay player is `aria-hidden="true"` (`markOverlayElement`).
- **Replay player.** `role="group"` named "Replay controls", native buttons, a named range input, a speed button whose name gives the next speed. Toggle and speed show a focus-visible border, the scrubber thumb appears on focus, and focus holds the controls open.
- **Keyboard.** Ctrl+Shift+E toggles the inspector (the `keydown` listener checks `e.key === 'E'`). The replay controls work by keyboard.
- **Not colour alone.** Every state also changes text or shape: the status line, "Done" and its check mark, the third row, the note.
- **Contrast.** Overlay text sits on its own dark surface, never on page content. Gaps are below; rules in the [accessibility foundation](../foundations/accessibility.md).

## Tests that pin it

Several pins match exact source text, comments included.

- [`overlay-stability-cadence.test.js`](../../tests/overlay-stability-cadence.test.js): the 400ms debounce and the 1200ms dwell, coalescing to the latest text, the `final` flush, a fill that never moves back and resets with each session, the action glow's cached rect and its removal when the target leaves, the pill's tone changing at once while its text waits, and the old status line falling back as the new one arrives.
- [`overlay-content-audit.test.js`](../../tests/overlay-content-audit.test.js): the 1000ms thinking hold, the first-sentence guard, the reduced-motion blocks, the done tone and "Done", the 3s hold, the exit beats at 300, 760 and 1080ms, a new call reviving a leaving pill, the bead held still under reduced motion, and the glow's 500ms fade after a final or cleared status.
- [`replay-player-overlay.test.js`](../../tests/replay-player-overlay.test.js) (run by `pretest`): host id and role, no `aria-hidden`, the 2× default and its name, `left: 50%`, `bottom: max(16px`, the 3px rail, the 999px speed pill, the 3000ms hide, the terminal fade, the reduced-motion skip, the backward-seek snap.
- [`lattice-replay-background-contract.test.js`](../../tests/lattice-replay-background-contract.test.js) and [`lattice-replay-playback.test.js`](../../tests/lattice-replay-playback.test.js): exact markup and constants such as `const REPLAY_PLAYER_SPEEDS = Object.freeze([0.5, 1, 2, 4, 8])`. The comment `// Singleton instance for progress overlay` bounds a source slice.
- [`trigger-observe-pulse.test.js`](../../tests/trigger-observe-pulse.test.js): the pulse lifecycle, `animation: fsb-trigger-pulse 2.4s`, keyframes free of `box-shadow`, `top`, `left` and `width`, and the reduced-motion stop.
- [`action-icon-behavior.test.js`](../../tests/action-icon-behavior.test.js): the toolbar icon in [`action-icon.js`](../../extension/utils/action-icon.js) must match `_getDuration()`'s acting 4000, the `.state-acting` colours, the `PILL_FORMS` periods, the 38% `.pl-fill` and `fsb-trigger-badge-dot`. The pill's ring is driven by the shared clock, so `visual-feedback.js` has no ring keyframe or 1.6s cadence.
- [`test-overlay-state.js`](../../tests/test-overlay-state.js): `buildOverlayState` and stale-message handling. [`badge-agent-id.test.js`](../../tests/badge-agent-id.test.js), in no npm script: the short agent id in `.pl-who`.
- [`extension-ui-locale.test.js`](../../tests/extension-ui-locale.test.js): `ui-locale.js` loads right before `visual-feedback.js`; `overlayLabel` and the redraw. [`trigger-lifecycle.test.js`](../../tests/trigger-lifecycle.test.js) (case U.2) and [`extension-content-script-files-completeness.test.js`](../../tests/extension-content-script-files-completeness.test.js): load order and injection lists.
- [`mcp-visual-session-contract.test.js`](../../tests/mcp-visual-session-contract.test.js), [`mcp-visual-tick-lifecycle.test.js`](../../tests/mcp-visual-tick-lifecycle.test.js): the 60s session death.
- Gates: `checkOverlayTokens`; [`check-style-literals.mjs`](../../scripts/check-style-literals.mjs) `SCRIPT_FILES`, which holds the file's colour, z-index and font-stack counts to the baseline; the copy gate.

## Known issues

1. **No tokens for the highlight and the inspector.** Their colours sit in inline styles, or in a quoted stylesheet string that `extractOverlayCss` does not read.
2. **Every overlay colour is a literal.** `overlay.css` only catalogues them, and the style-literal ratchet holds their count.
3. **The highlight has no caller.** Nothing sends `highlightElement`; only `hide()` calls remain. When used, it rewrites the element's inline `outline`, `box-shadow`, `z-index` and `position`.
4. **Reduced motion is partly ignored.** The viewport glow's bead keeps travelling, though its fade and transitions stop; the crawl card and the highlight ignore the setting. The only off switch for the glow is Animated Action Highlights, and MCP manual actions light it regardless.
5. **The pill overshoots.** The spawn pop (`cubic-bezier(0.3, 1.5, 0.5, 1)` from 30% scale), the grow curve (`1.22`) and the status line's scale-in from 110% go against the no-bounce and no scale-in rules in the [motion foundation](../foundations/motion.md). They come from the PillMotion board, so they need a recorded exception or a change.
6. **The pill sets its labels in Space Mono,** loaded from onboarding's font file, against [0012](../decisions/0012-platform-mono-for-technical-text.md).
7. **Focusable but hidden.** The pill's Stop can take keyboard focus inside an `aria-hidden` host. The inspector's close button, "x", has no name.
8. **8× reads as 1×.** The player and `FSB_REPLAY_SPEEDS` in `background.js` allow 8×, but `buildReplayControl` in `overlay-state.js` accepts 0.5, 1, 2 and 4 and falls back to 1, so the next status redraws 8× as 1×.
9. **Two pause glyphs.** `create()` writes `&#10074;&#10074;`; `update()` writes U+2161.
10. **English left over.** "Waiting for next automation update" and "Reconnecting to the active page" come from `messaging.js`, outside the gate and `OVERLAY_LABELS`, and show in the pill's status line. The inspector's "OK", "FAIL", "[unique]" and "x" have no keys.
11. **Keys left from the card.** `entry_automating`, `entry_initializing` and `entry_actions` stay in the eight catalogs, but no script reads them.
12. **Silence differs by layer.** The page removes the pill 180s after the last status, while the worker's replay plan clears a stored session after 120s. The pill boards say 120s. No test pins the page watchdog.

## Sources

- Code: [`visual-feedback.js`](../../extension/content/visual-feedback.js) (`ProgressOverlay` and the `PILL_*` constants), [`messaging.js`](../../extension/content/messaging.js), [`overlay-state.js`](../../extension/utils/overlay-state.js), [`action-icon.js`](../../extension/utils/action-icon.js), [`mcp-visual-session.js`](../../extension/utils/mcp-visual-session.js), [`mcp-visual-session-lifecycle.js`](../../extension/utils/mcp-visual-session-lifecycle.js), [`site-explorer.js`](../../extension/utils/site-explorer.js), [`tool-definitions.js`](../../extension/ai/tool-definitions.js), [`mcp-bridge-client.js`](../../extension/ws/mcp-bridge-client.js).
- Tokens and gates: [`overlay.css`](../tokens/overlay.css), [`verify-design-system.mjs`](../../scripts/verify-design-system.mjs), [`check-style-literals.mjs`](../../scripts/check-style-literals.mjs), [`verify-extension-copy.mjs`](../../scripts/verify-extension-copy.mjs).
- The pill came in PR #173, commits `c51e39486` ("replace the progress card with the compact status pill") and `20b65e0d4`.
- The "FSB overlays" design canvas ([sources.md](../sources.md)): Lifecycle, Progress, Glow, Target, Replay, Trigger, Inspector and Crawl, and the Redesign A boards PillSpec, PillMotion and PillRules that the pill follows. The "Redesign B" (Horizon) board is superseded. The live board's 1.5s actions and 2.4s capability calls are illustrative.
- Decisions: [0003](../decisions/0003-overlay-accent-ff8c00.md), [0006](../decisions/0006-overlays-in-shadow-dom-top-layer.md), [0008](../decisions/0008-status-pill-replaces-progress-card.md).
