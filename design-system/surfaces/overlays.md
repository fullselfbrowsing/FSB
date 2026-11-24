# In-page overlays

Status: shipped on main (status pill pending, PR #173)

## What it is

The overlays are what FSB draws on web pages it does not own. One content script, [`visual-feedback.js`](../../extension/content/visual-feedback.js), defines eight classes, each used as one singleton on `window.FSB`. [`messaging.js`](../../extension/content/messaging.js) drives them from service-worker messages.

| Overlay | Class in `visual-feedback.js` | Driven by (`messaging.js` unless named) |
|---|---|---|
| Element highlight | `HighlightManager` | the `highlightElement` message; nothing on main sends it |
| Progress card | `ProgressOverlay` | `sessionStatus`, carrying `buildOverlayState` from [`overlay-state.js`](../../extension/utils/overlay-state.js) |
| Replay player | `ReplayPlayerOverlay` | `sessionStatus` with `overlayState.replay` |
| Viewport glow | `ViewportGlow` | `sessionStatus`, `executeAction`, `triggerPulseStart` |
| Trigger badge | `TriggerBadge` | `triggerPulseStart`, `triggerPulseStop` |
| Action glow | `ActionGlowOverlay` | `executeAction` (box or text), `triggerPulseStart` (pulse) |
| Element inspector | `ElementInspector` | Ctrl+Shift+E, or `toggleInspectionMode` |
| Crawl card | `CrawlProgressOverlay` | `showCrawlOverlay` from `SiteExplorer.collectPageData` in [`site-explorer.js`](../../extension/utils/site-explorer.js) |

- **Hosting.** Every host but the highlight resets with `all: initial`. `promoteToTopLayer` sets `popover="manual"` and calls `showPopover()`. Without the Popover API, or if it throws, the host is appended to `<html>` at `z-index: 2147483647`. See [decision 0006](../decisions/0006-overlays-in-shadow-dom-top-layer.md).
- **Re-stacking.** `show()` on the card, the replay player and the glow runs `hidePopover()` then `showPopover()`, so they land above popovers the page opened since.
- **What raises them.** Action tools carry `visual_reason` and `client` (`VISUAL_SESSION_FIELDS` in [`tool-definitions.js`](../../extension/ai/tool-definitions.js)). The first such call starts an implicit visual session, and `is_final: true` ends it. Read-only tools such as `read_page` carry neither field, so they never raise or extend one (`_recordVisualSessionTickIfPresent` in [`mcp-bridge-client.js`](../../extension/ws/mcp-bridge-client.js)).
- **Cleanup.** The `beforeunload` listener destroys every overlay but the trigger badge. A `pagehide` that is not entering the back-forward cache destroys the action glow and the replay player.

## Palette and tokens

The overlay accent is `#ff8c00`, deliberately not the panel and site orange `#ff6b35` ([decision 0003](../decisions/0003-overlay-accent-ff8c00.md)). The product palette `--fsb-*` ([`product-surface.css`](../tokens/product-surface.css)) never appears on a page.

The colours are literals inside the shadow-root stylesheets of `visual-feedback.js`. [`overlay.css`](../tokens/overlay.css) catalogues them as `--fsb-ov-*` tokens; each names its source selector and property, and `checkOverlayTokens` in [`verify-design-system.mjs`](../../scripts/verify-design-system.mjs) fails when one drifts. Nothing in the extension reads these variables. Specimen: [overlay palette](../guidelines/color-overlay.card.html).

| Overlay | Tokens | Values |
|---|---|---|
| Viewport glow | `--fsb-ov-thinking-*`, `--fsb-ov-acting-*`, `--fsb-ov-watching-*`, `--fsb-ov-calling-*` | `#ff8c00` to `#f59e0b`; `#ff6600` to `#ff8c00`; `#ff8c00` to `#ffa500`; `#8b5cf6` to `#a78bfa` |
| Progress card | `--fsb-ov-card-*`, `--fsb-ov-accent`, `--fsb-ov-progress-fill`, `--fsb-ov-done`, `--fsb-ov-guarded*`, `--fsb-ov-calling-text` | `#000000` card, `#ffffff` text, ring orange at 30%, fill `#ff8c00` to `#ff6600`, done `#34d399`, guarded `#f5a524` |
| Replay player | `--fsb-ov-replay-*` | `rgba(8, 8, 8, 0.94)`, `#ff9f2e`, hover `#ffb45c`, fill `#ff8c00` |
| Trigger badge | `--fsb-ov-badge-*` | `rgba(20, 16, 12, 0.88)`, text `#fff5e6`, orange dot |
| Action glow | `--fsb-ov-target-border`, `--fsb-ov-target-fill` | `2.5px solid rgba(255, 140, 0, 0.8)`, orange at 4% |
| Crawl card | `--fsb-ov-crawl*` | `#38bdf8`, fill `#0ea5e9` to `#38bdf8`, slate `rgba(15, 23, 42, 0.92)`: blue because crawling does not act on the page |

- **Untokened.** The highlight (`HighlightManager.show`: `#FF8C00` outline, `rgba(255, 140, 0, 0.8)` glow) and the inspector (`#FF8C00` pill and header, white `#fff` panel, `#333` text) have no tokens. State rings are literals too: capability `rgba(139, 92, 246, 0.38)`, guarded `rgba(245, 165, 36, 0.45)`, success `rgba(52, 211, 153, 0.3)`, crawl `rgba(56, 189, 248, 0.3)`.
- **Type.** The system stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) everywhere; the capability chip uses `'SFMono-Regular', Consolas, Menlo, monospace`. No web fonts: `@font-face` inside a shadow root is ignored.

## Anatomy

| Overlay | Host | Where and size | Shadow root | Pointer events |
|---|---|---|---|---|
| Highlight | none; inline `!important` styles on the element | 3px solid outline, three-layer glow, `z-index: 2147483646`, `position: relative` if static | none | the element's own |
| Progress card | `#fsb-progress-host` | fixed 16px from top and right; `.fsb-overlay` is `min(320px, calc(100vw - 32px))` | open | host and card none; only `.fsb-stop` takes clicks |
| Replay player | `#fsb-replay-player-host` | bottom centre at `max(16px, env(safe-area-inset-bottom))`, `min(560px, calc(100vw - 32px))` | open | `.fsb-replay-shell` takes clicks; none while collapsed or fading |
| Viewport glow | `#fsb-viewport-glow-host` | full viewport; four 6.5px edge bars over an inset ambient glow | closed | none |
| Trigger badge | `#fsb-trigger-badge-host` | `.badge-root` pill 14px from bottom and right | closed | none |
| Action glow | `#fsb-action-glow-host` | full-viewport host; `.box-overlay` or `.text-highlight` rects over the target | closed | none |
| Inspector | `#fsb-inspector-overlay`, `#fsb-inspector-panel`, `#fsb-inspector-indicator` | dashed hover box; panel 20px from bottom and right, 350px wide, up to 400px tall; pill 10px from the top, centred | panel only, open | hover box and pill none; the panel takes clicks |
| Crawl card | `#fsb-crawl-progress-host` | fixed 16px from bottom and right, 280px wide | open | `.fsb-crawl-overlay` takes clicks |

`markOverlayElement` gives every host but the replay player `data-fsb-overlay="true"`, `aria-hidden="true"` and a `data-fsb-overlay-role`.

- **Progress card** (`.fsb-overlay`: 14px 18px padding, 10px radius, 13px on 1.4). Header over a hairline: a 20px `assets/icon48.png`, "FSB Automating", `.fsb-client-badge` (`<client> / <agent id>`, joined by `FSBBadgeCombine` in [`badge-combine.js`](../../extension/content/badge-combine.js)), a 20px round Stop. Then the task, an italic summary hidden when empty, `.fsb-chip` (lock, monospace capability name, readiness tag), `.fsb-note`, the step row (`.fsb-step-number` pill and `.fsb-step-text`), two `.fsb-log-line`s of earlier steps, `.fsb-meta` (elapsed `M:SS` and the action count) and a 4px bar.
- **Replay player.** `.fsb-replay-controls` is a `32px auto minmax(80px, 1fr) 54px` grid, at least 44px tall, 12px radius, 10px backdrop blur: a 30px round play/pause, the time, a 3px track under a range input, and a 54×28 speed pill. At 430px wide or less the time hides. Collapsed, a 3px `.fsb-replay-minimal-track` inset 8px remains.
- **Action glow geometry** (`_buildHighlightSpec`):
  - Target: `_findHighlightTarget` keeps interactive tags and roles. Otherwise it climbs up to 5 ancestors to an interactive one or one at least 32×32, stopping when the next parent is more than 3× wider.
  - Text mode: links up to 72px tall and `min(80vw, 560px)` wide, and inline text up to 56px tall and `min(75vw, 520px)` wide. Each line rect is padded 4px left and right and 2px top and bottom, radius 6px.
  - Box mode otherwise. Padding is 4 for `INPUT`, `TEXTAREA` and `SELECT`, 6×4 for elements 40px tall or less, 6 otherwise. The radius is the element's top-left radius plus 4, kept between 6 and 18 (8 or 10 when it cannot be read).
- **Inspector panel.** An orange header with the tag and id, then "Selectors FSB Would Try" (`FSB.generateSelectors`), "Attributes", "Interactability" (OK or FAIL for visible, enabled, in viewport, pointer events), "Position" and "Text Content".
- **Crawl card.** An 18px logo and "FSB Crawling" in `#38bdf8`, the domain, "N / M pages" with a percent tag, a 4px bar, the current path in 10px type.

## States

**Progress card** (`ProgressOverlay.update`)

| State | Set by | Look |
|---|---|---|
| Running | `lifecycle: 'running'` | the pill shows the phase ("Acting…"); a determinate bar or the sweep |
| Capability call | `phase: 'calling'` | `.capability` violet ring; `.fsb-step-number.calling` `#b79dfb`; the chip with a readiness tag ("T1 ready") |
| Guarded | `overlayState.guarded` | `.guarded` amber ring; pill `#f5b942`; fill `#f5a524`; `.fsb-note` in `#f5cf8f` |
| Trigger watch | `phase` or `mode` `trigger-watch` | title "FSB Trigger", detail "Watching DOM for change", bar hidden. Only if a card is already open: `update()` never creates one |
| Stoppable | `overlayState.stoppable` | Stop shown |
| Done | `final` with `result: 'success'` | timer frozen, `.fsb-progress-fill.complete` green, green ring, pill "Done" |
| Partial, error | `final` with `partial` or `error` | bar hidden; pill "Partial" or "Error" |
| Waiting | no `sessionStatus` for 60s | detail "Waiting for next automation update" ("Reconnecting to the active page" if already reconnecting); glow back to thinking; action glow hidden |
| Cleared | `lifecycle: 'cleared'` | card, glows and replay player destroyed |

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
| Card text | a change waits at least 400ms (`PROGRESS_TEXT_DEBOUNCE_MS`) and every line stays at least 1200ms (`MIN_DISPLAY_DURATION_MS`). The first write and `final` skip both. A generic thinking label is held back for the first 1000ms |
| Card bar | determinate `scaleX` over 0.3s ease-out, never moving back; indeterminate 38% fill sweeping `-120%` to `320%` in 1.2s ease-in-out (`fsbProgressSweep`) |
| Card end | done holds 3000ms, fades 0.2s, and is destroyed 200ms later, the 3200ms of `MCP_VISUAL_SESSION_FINAL_CLEAR_DELAY_MS`. On `final` both glows are cut at once |
| Viewport glow | one requestAnimationFrame bead, 12% of the perimeter with a 2% fade at each end, at even speed on every edge; a state change keeps the bead in place; ambient and filter ease over 0.5s |
| Action glow | `fsbActionGlow` 1.5s pulse with `fsbGlowAppear` 0.3s (scale 1 to 1.03 and back); `fsbTextGlow` 1.3s; `fsb-trigger-pulse` 2.4s (opacity 0.55 to 0.92, scale 1.025); fades 0.25s box, 0.18s text; `hide()` removes it after 250ms |
| Replay | controls hide after 3000ms (`REPLAY_PLAYER_HIDE_DELAY_MS`), sliding 6px over 0.18s; a finished replay holds 3000ms and fades 200ms (`REPLAY_PLAYER_FADE_MS`) before `destroy()` |
| Trigger badge | 220ms fade with a 4px rise; the dot breathes over 2.4s; removed 250ms after both counts reach 0 |
| Crawl, highlight | crawl bar width 0.3s, fade 0.2s; highlight box-shadow 0.15s, held 500ms by default and 2000ms through the handler |

**Silence.** In the page, 60s without `sessionStatus` degrades the card to waiting (`FSB._overlayWatchdogTimer` in `messaging.js`), and 120s after that every overlay is removed (`FSB._overlayOrphanTimer`): 180s after the last status. In the worker, `planMcpVisualSessionReplay` in [`mcp-visual-session.js`](../../extension/utils/mcp-visual-session.js) replays a stored session as "Waiting for MCP client" once it is idle over 60s (`MCP_VISUAL_SESSION_DEGRADE_AFTER_MS`) and clears it after 120s (`MCP_VISUAL_SESSION_ORPHAN_CLEAR_AFTER_MS`). An MCP visual session also ends 60s after its last action (`MCP_VISUAL_LIFECYCLE_DEATH_MS` in [`mcp-visual-session-lifecycle.js`](../../extension/utils/mcp-visual-session-lifecycle.js)).

**Reduced motion** (`@media (prefers-reduced-motion: reduce)` in each stylesheet; see the [motion foundation](../foundations/motion.md)):
- **Card:** no transitions; the sweep stops and the fill holds still (the rule asks for 45%, but the inline `width: 38%` from `update()` wins); text surfaces never animate; both log lines stay shown; the green done fill is the one cue left.
- **Replay:** no transitions; `_scheduleTerminalRemoval` destroys a finished player with no fade.
- **Badge:** an 80ms opacity change only; the dot rests at 0.85.
- **Action glow:** no transitions or loops; the trigger pulse holds a still border.
- **Not handled:** the viewport glow, the crawl card and the highlight (Known issues).

## Copy and i18n

- **Helper.** Every string goes through `ov(key, english, subs)`, which asks `fsbUiLocale.text` and falls back to the English with `$NAME$` substitution. Keys live in the eight catalogs under `extension/_locales/` ([English](../../extension/_locales/en/messages.json)).
- **Labels from the worker.** `OVERLAY_LABELS` translates only exact English labels ("Acting…" keeps its ellipsis). Task titles, model summaries and AI status text show as sent.
- **Language change.** `writeLabel` and `writeKeyed` remember each source string; `refreshOwnedChrome` redraws them on `fsbUiLocale.onChange` and sets `lang` on the root.

| Where | English | Keys |
|---|---|---|
| Card | "FSB Automating", "Stop", "Planning", "Initializing...", "Actions: $COUNT$", "Done" | `entry_automating`, `entry_stop`, `entry_planning`, `entry_initializing`, `entry_actions`, `entry_done_pill` |
| Badge | "$COUNT$ watching", "$COUNT$ fired" | `entry_watching`, `entry_fired` |
| Replay | "Replay controls", "Pause replay", "Play replay", "Replay position, forward seek only", "Replay speed $SPEED$. Activate to change to $NEXT$" | `entry_replay_*`, `entry_pause_replay`, `entry_play_replay` |
| Inspector | "FSB Inspector Mode (Ctrl+Shift+E to exit)", "Click an element to inspect", "Selectors FSB Would Try" | `entry_inspector`, `entry_inspect`, `entry_selectors` |
| Crawl | "FSB Crawling", "Crawling $DOMAIN$", "$COLLECTED$ / $MAX$ pages" | `entry_crawl_title`, `entry_crawling`, `entry_pages` |

- **The gate.** [`verify-extension-copy.mjs`](../../scripts/verify-extension-copy.mjs) lists this file in `SCOPE`. A quoted string that starts with a capital or a `$PLACEHOLDER$` and has three or more words must be an English catalog message (`isProse`). Text in markup built in JS must go through `ov()`. Identifiers must not read as sentences: name fonts and keyframes in kebab-case (`fsb-trigger-badge-dot`). See the [voice and copy foundation](../foundations/voice-and-copy.md).

## Accessibility

- **Click-through.** The card and its host ignore pointer events, so a click the agent sends to that corner still reaches the page; Stop is the only target. The glows and the badge never take pointer events. The replay shell, the inspector panel and the crawl card do.
- **Hidden from assistive tech.** Every host but the replay player is `aria-hidden="true"` (`markOverlayElement`).
- **Replay player.** `role="group"` named "Replay controls", native buttons, a named range input, a speed button whose name gives the next speed. Toggle and speed show a focus-visible border, the scrubber thumb appears on focus, and focus holds the controls open.
- **Keyboard.** Ctrl+Shift+E toggles the inspector (the `keydown` listener checks `e.key === 'E'`). The replay controls work by keyboard.
- **Not colour alone.** Every state also changes text or shape: the step pill's label, "Done", the hidden bar of a trigger watch.
- **Contrast.** Overlay text sits on its own dark card, never on page content. Gaps are below; rules in the [accessibility foundation](../foundations/accessibility.md).

## Tests that pin it

Several pins match exact source text, comments included.

- [`overlay-stability-cadence.test.js`](../../tests/overlay-stability-cadence.test.js): the 400ms debounce, coalescing to the latest text, the `final` flush, the monotonic bar, action-count batching, and action-glow geometry recomputed only after resize, scroll or a new target.
- [`overlay-content-audit.test.js`](../../tests/overlay-content-audit.test.js): the 1000ms thinking hold, the first-sentence guard, two or more reduced-motion blocks, `.fsb-progress-fill.complete` keeping `background: #34D399` (upper case), and the badge text.
- [`replay-player-overlay.test.js`](../../tests/replay-player-overlay.test.js) (run by `pretest`): host id and role, no `aria-hidden`, the 2× default and its name, `left: 50%`, `bottom: max(16px`, the 3px rail, the 999px speed pill, the 3000ms hide, the terminal fade, the reduced-motion skip, the backward-seek snap.
- [`lattice-replay-background-contract.test.js`](../../tests/lattice-replay-background-contract.test.js) and [`lattice-replay-playback.test.js`](../../tests/lattice-replay-playback.test.js): exact markup and constants such as `const REPLAY_PLAYER_SPEEDS = Object.freeze([0.5, 1, 2, 4, 8])`. The comment `// Singleton instance for progress overlay` bounds a source slice.
- [`trigger-observe-pulse.test.js`](../../tests/trigger-observe-pulse.test.js): the pulse lifecycle, `animation: fsb-trigger-pulse 2.4s`, keyframes free of `box-shadow`, `top`, `left` and `width`, and the reduced-motion stop.
- [`action-icon-behavior.test.js`](../../tests/action-icon-behavior.test.js): the toolbar icon in [`action-icon.js`](../../extension/utils/action-icon.js) must match `_getDuration()`'s acting 4000, the `.state-acting` colours, `fsbProgressSweep` (1.2s ease-in-out, `-120%` to `320%`, 38% wide), the `.fsb-progress-fill` gradient and `fsb-trigger-badge-dot` (2.4s ease-in-out). `visual-feedback.js` must contain no `1.6s` at all.
- [`test-overlay-state.js`](../../tests/test-overlay-state.js): `buildOverlayState` and stale-message handling. [`badge-agent-id.test.js`](../../tests/badge-agent-id.test.js), in no npm script: `agentIdShort` joined with ` / `.
- [`extension-ui-locale.test.js`](../../tests/extension-ui-locale.test.js): `ui-locale.js` loads right before `visual-feedback.js`; `overlayLabel` and the redraw. [`trigger-lifecycle.test.js`](../../tests/trigger-lifecycle.test.js) (case U.2) and [`extension-content-script-files-completeness.test.js`](../../tests/extension-content-script-files-completeness.test.js): load order and injection lists.
- [`mcp-visual-session-contract.test.js`](../../tests/mcp-visual-session-contract.test.js), [`mcp-visual-tick-lifecycle.test.js`](../../tests/mcp-visual-tick-lifecycle.test.js): the 60s session death.
- Gates: `checkOverlayTokens`; [`check-style-literals.mjs`](../../scripts/check-style-literals.mjs) `SCRIPT_FILES`, which holds the file's colour, z-index and font-stack counts to the baseline; the copy gate.

## Known issues

1. **No tokens for the highlight and the inspector.** Their colours sit in inline styles, or in a quoted stylesheet string that `extractOverlayCss` does not read.
2. **Every overlay colour is a literal.** `overlay.css` only catalogues them, and the style-literal ratchet holds their count.
3. **The highlight has no caller.** Nothing on main sends `highlightElement`; only `hide()` calls remain. When used, it rewrites the element's inline `outline`, `box-shadow`, `z-index` and `position`.
4. **Reduced motion is ignored** by the viewport glow (the bead loop and 0.5s transitions keep running), the crawl card and the highlight. The only off switch is Animated Action Highlights, and MCP manual actions light the glow regardless.
5. **Focusable but hidden.** Stop can take keyboard focus inside an `aria-hidden` host. The inspector's close button, "x", has no name.
6. **Dead hover.** `.fsb-log:hover` (14px to 52px) never fires, because the card inherits `pointer-events: none`; only reduced motion shows both lines.
7. **Low contrast.** `.fsb-log-line` is white at 34% on black, about 2.9:1, under AA.
8. **Empty counter.** `buildOverlayState` always sends `actionCount: null`, so "Actions: $COUNT$" stays blank on the `sessionStatus` path.
9. **8× reads as 1×.** The player and `FSB_REPLAY_SPEEDS` in `background.js` allow 8×, but `buildReplayControl` in `overlay-state.js` accepts 0.5, 1, 2 and 4 and falls back to 1, so the next status redraws 8× as 1×.
10. **Two pause glyphs.** `create()` writes `&#10074;&#10074;`; `update()` writes U+2161.
11. **Emoji in chrome.** `.fsb-chip-lock` is `&#128274;` and `.fsb-note-icon` is `&#9888;`, against the no-emoji rule.
12. **English left over.** "FSB Trigger", "Watching", "Reconnecting", "Waiting for next automation update" and "Reconnecting to the active page" come from `messaging.js`, outside the gate and `OVERLAY_LABELS`. The inspector's "OK", "FAIL", "[unique]" and "x" have no keys.
13. **Silence differs by layer.** The page removes the card 180s after the last status, while the worker's replay plan clears a stored session after 120s. The pill boards say 120s. No test pins the page watchdog.

## Pending: status pill (PR #173)

Not on main. The compact pill that replaces the progress card is built only on branch `while-we-were-here` (PR #173, commit `c51e39486`) and on `Jev` ([decision 0008](../decisions/0008-status-pill-replaces-progress-card.md)). This summarises the "Redesign A" boards PillSpec, PillMotion and PillRules; names in parentheses are constants in that branch's `visual-feedback.js`. The "Redesign B" (Horizon) board is superseded.

- **Body.** Black, radius 18 at every size, a 1px ring in the state colour, shadow `0 8px 32px` black at 40%. Widths and heights are set in px so they ease; never wider than 248 (`PILL_MAX_W`).
- **Anatomy at 1×.** Wordmark: Poppins at 17px, white, F at 200 and S at 900, B a drawn path 0.68em tall, 32 wide and 12 from the left. Divider: 1×14, white at 16%, 10 each side, left out with no agent name. Agent name: Space Mono 9.6px, 0.16em, capitals, `#94A3B8`, never cut, left out for FSB's own autopilot. Timer: Space Mono 10.5px, `M:SS`, 14 from the right. Status: system UI 500 at 12.5px on 17px, `#F1F5F9`, wrapping once at 248, then an ellipsis. Track: 2px, white at 10%, a 38% sweeping fill.
- **Six shapes:** seed 56×36; top line only, 161×36 (89 plus name and timer); two lines 168×58 (status plus 26); wrapped 248×75 (17 per extra line); third row 248×78 (a 20px row); blocked 248×96 (the note adds 38).
- **State colours, accent then ring:** thinking `#FF8C00` (orange 30%); acting `#FF7A00` (orange 42%); watching `#FFA500` (orange 30%); calling `#A78BFA` (`#8B5CF6` 45%); blocked `#F5A524` (65%, note `#F5CF8F`); done `#34D399` (55%); error `#F87171` (55%); waiting `#94A3B8` (white 22%, wordmark dimmed). `PILL_TONES` adds `partial` (amber) and `stopped` (grey).
- **Motion.** Spawn beats at 0, 240 and 560ms (`PILL_SPAWN_BEATS`). The exit runs it backwards, with beats at 300 and 760ms and removal at 1080 (`PILL_EXIT_BEATS`). Grow is 520ms `cubic-bezier(0.5, 0, 0.15, 1.22)`; shrink is 420ms after 80ms, `cubic-bezier(0.5, 0, 0.2, 1)`. A new status scales from 1.1 and unblurs from 4px over 420ms. The status folds 2.6s after an action ends (`PILL_FOLD_AFTER_MS`; `PILL_WATCH_FOLD_MS` is 4000 for a trigger watch). The glow fades in over 600ms and out over 500ms (`VIEWPORT_GLOW_FADE_OUT_MS`). The toolbar icon's motions play on one clock (`PILL_FORMS`): sweep 1.2s, orbit 4s, ring 1.6s, breathe 2.4s, ranked breathe, ring, orbit, sweep. Reduced motion drops transitions; shapes and colours still change.
- **Rules.** Read-only calls never raise it. A third row opens only for a capability call, a blocked site or hover (the agent id). Blocked stays open until the next call. Done fills the track green, freezes the timer, holds 3s (`PILL_FINAL_HOLD_MS`) and exits; error fills it red. The board puts waiting at 60s and removal at 120s; the branch's page watchdog still removes it 120s after waiting. A new call during the exit morphs it back. Unchanged from main: text pacing, the client labels and agent id, the 60s and 120s timers, the 3s hold, state colours, both glows, the icon's four motions, "T1 ready" and "Waiting for next automation update". One copy change: "Blocked. This site needs your approval before FSB can act here." (main has a dash in `CAPABILITY_GUARDED_NOTE_TEXT`).
- **Build notes.** The host stays click-through: hover compares the pointer with the pill's rectangle (`_trackPointer`), and Stop is the only target. Fonts in a shadow root are ignored, so the wordmark is outlines (`PILL_WORDMARK_SVG`) and Space Mono is registered on the document as `fsb-pill-mono`. Under [0012](../decisions/0012-platform-mono-for-technical-text.md) the pill should use the platform stack instead before it merges. The top-layer hosting is unchanged.

## Sources

- Main: [`visual-feedback.js`](../../extension/content/visual-feedback.js), [`messaging.js`](../../extension/content/messaging.js), [`overlay-state.js`](../../extension/utils/overlay-state.js), [`mcp-visual-session.js`](../../extension/utils/mcp-visual-session.js), [`mcp-visual-session-lifecycle.js`](../../extension/utils/mcp-visual-session-lifecycle.js), [`site-explorer.js`](../../extension/utils/site-explorer.js), [`tool-definitions.js`](../../extension/ai/tool-definitions.js), [`mcp-bridge-client.js`](../../extension/ws/mcp-bridge-client.js).
- Tokens and gates: [`overlay.css`](../tokens/overlay.css), [`verify-design-system.mjs`](../../scripts/verify-design-system.mjs), [`check-style-literals.mjs`](../../scripts/check-style-literals.mjs), [`verify-extension-copy.mjs`](../../scripts/verify-extension-copy.mjs).
- PR #173, read only: `git show while-we-were-here:extension/content/visual-feedback.js` (the `PILL_*` constants), commits `c51e39486` and `20b65e0d4`.
- The "FSB overlays" design canvas ([sources.md](../sources.md)): Lifecycle, Progress, Glow, Target, Replay, Trigger, Inspector and Crawl, 1:1 with the extension, and the Redesign A boards. Its live board's 1.5s actions and 2.4s capability calls are illustrative.
- Decisions: [0003](../decisions/0003-overlay-accent-ff8c00.md), [0006](../decisions/0006-overlays-in-shadow-dom-top-layer.md), [0008](../decisions/0008-status-pill-replaces-progress-card.md).
