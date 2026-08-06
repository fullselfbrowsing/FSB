---
quick: 260728-k2v
plan: 01
subsystem: extension-ui
tags: [chrome-action, toolbar-icon, offscreen-canvas, overlay-parity, badge-removal]
requires:
  - extension/utils/overlay-state.js (buildOverlayState -> highlight.animated + phase)
  - extension/assets/icon128.png (base glyph)
  - chrome permissions already present: alarms, storage
provides:
  - globalThis.fsbActionIcon (init / applyOverlayState / setWatching / setConnected / dropTab / repair)
  - fsb-action-icon-watchdog alarm (30s, armed by the module only while a loop is owed)
  - chrome.storage.session key fsbActionIconIntent
  - chrome.storage.local key fsbActionIconRelaySeen
affects:
  - extension/background.js (single wiring surface)
  - extension/ws/ws-client.js (connection strength hook replaces badge)
  - extension/ui/options.js (dead badge bookkeeping removed)
  - extension/lib/memory/memory-extractor.js (stranded error badge removed)
tech-stack:
  added: []
  patterns:
    - OffscreenCanvas + ImageData frames built on demand in the MV3 service worker
    - conic-gradient arc stroke for the bead (single stroke, continuous profile)
    - wall-clock-derived frame index (self-correcting setInterval loop)
    - progress-fraction retime ported from ViewportGlow.setState
    - chrome.storage.session intent persistence for SW-eviction recovery
key-files:
  created:
    - extension/utils/action-icon.js
    - tests/action-icon-behavior.test.js
  modified:
    - extension/background.js
    - extension/ws/ws-client.js
    - extension/ui/options.js
    - extension/lib/memory/memory-extractor.js
    - tests/lattice-provider-bridge-smoke.test.js
    - package.json
decisions:
  - One distinct motion form per state, as drawn: Orbit / Sweep / Breathe / Capability ring.
  - The icon resolves what to show by RANKED CLAIMS keyed per tab, never by last-write-wins.
  - Animation is selected by TOOL CATEGORY, not session phase; phase cannot tell a read from a click.
  - Ranking is breathe > ring > orbit > sweep; a trigger watch outranks everything on every tab.
  - Orbit/Sweep derives from the registry's _readOnly flag rather than a hand-kept list.
  - Activity claims decay on a TTL and are never persisted; watch claims persist and never decay.
  - The animation clock starts with the loop, never before the frames it plays exist.
  - Watching breathes for a bounded hold and then settles; never a perpetual loop, because that is the keepalive pattern Chrome restricts.
  - Each state pins to its own canonical source; only acting still tracks ViewportGlow, and calling has no upstream source at all.
  - The capability ping travels inward, because an icon cannot paint outside its own box.
  - No text in the icon, which is what the design's own 32px checks do.
  - Transparent background; no opaque fill, because a worker cannot read the toolbar theme.
  - setIcon is always global and always carries both 16 and 32; never surface-scoped.
  - Four static frames (idle/watching x connected/disconnected) rather than dimming at emit time.
  - Dim means "a relay that had connected is now down", never "no relay was ever used".
  - The watchdog alarm belongs to the animation, not to the worker's lifetime.
metrics:
  tasks: 3 planned + 1 deviation + 5 audit fixes
  commits: 4
  completed: 2026-07-28
---

# Quick 260728-k2v: Animated toolbar action icon Summary

Replaced the green/red `chrome.action` badge dot with a state-driven toolbar icon rendered
from `assets/icon128.png` / `assets/icon16.png`, mirroring ViewportGlow's periods, palettes,
phase map and retime behaviour exactly.

## What shipped

`extension/utils/action-icon.js` owns 100% of the canvas, timer and persistence logic and
exposes a frozen five-method API on `globalThis.fsbActionIcon`. It renders 4 static frames
up front (idle and watching, each at connected and disconnected strength) and builds a
state's animated frames (thinking 91 / acting 61 / calling 61) on first use, keeping them
for the life of the worker. Every frame is rendered at both 16 and 32, and nothing is ever
rendered inside the tick.

`background.js` is the only wiring surface, exactly as the plan specified: one module load,
one `sendSessionStatus` tee, two trigger hooks, one bootstrap, one alarm-registration pair,
one alarm branch.

`ws-client.js` lost both badge methods and all five `chrome.action` references and gained
exactly three guarded one-liners. It references no timer, canvas or fetch API, so it still
executes cleanly in the bare VM sandbox that `stream-candidate-resolution.test.js` uses.

## Must-have truths — verified

| Truth | Evidence |
|---|---|
| Badge gone; nothing calls `setBadgeText` / `setBadgeBackgroundColor` | repo-wide grep over `extension/` returns zero hits |
| Animated orbit bead matches ViewportGlow period + palette | periods and hex values read directly from `visual-feedback.js:1216-1221` and `:1372-1403` |
| Session end / clear / disabled snaps to static and stops the loop | stubbed-worker smoke: emit count frozen across 250ms after disarm |
| Arming a watch paints one static frame; no loop ever runs | stubbed-worker smoke: exactly 1 emit on arm, 0 further emits across 250ms |
| Idle frame full-strength connected, dimmed disconnected | four static frames keyed `idle:on` / `idle:off` / `watching:on` / `watching:off` |
| SW restart mid-session re-derives and restarts from frame 0 | stubbed-worker smoke: persisted `animating` intent + live probe restarts the loop; probe false snaps to static and corrects the record |

The runtime behaviour above was exercised against a stubbed `OffscreenCanvas` /
`createImageBitmap` / `chrome.storage.session` worker sandbox, including the
degraded-environment path (missing `OffscreenCanvas` or `chrome.action` makes every method a
silent no-op) and both eviction-recovery branches.

## Tripwires handled

- `tests/lattice-provider-bridge-smoke.test.js` count pins refreshed 323 -> **324** and
  319 -> **320** in the same commit as the module load, with a ledger comment appended to
  each block. The token `importScripts` appears in no new comment in `background.js`, so the
  count moved by exactly one.
- `chrome.action.onClicked` listener body untouched — the bootstrap sits after its closing
  `});`. Confirmed safe by reading `extractAfterAnchor`, which is brace-matched and therefore
  stops before the insertion.
- `ws.onopen` block shape preserved: each replacement is a single 6-space-indented line and
  introduces no earlier 4-space-indented `};`.
- No manifest edit, no new permission, `minimum_chrome_version` untouched.
- `source: 'contentScriptReady'` and the surrounding `replayMcpVisualSessionForTab` call left
  byte-identical.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed the stranded memory-extractor error badge**
- **Found during:** Task 3 final verification sweep
- **Issue:** `extension/lib/memory/memory-extractor.js` had a fourth badge site
  (`_setBadgeError()`, 3 call sites) that was not in the plan's or CONTEXT.md's removal
  tables. Task 3 deleted every badge-*clear* path in the product, so a memory-extraction
  failure would have painted a red `!` on the toolbar that nothing could ever clear —
  permanently, and now as the only badge in the product. It also directly violated the
  plan's must-have truth that no code path calls the badge API anymore.
- **Fix:** Deleted `_setBadgeError()` and its three call sites. All three already
  `console.error` the failure, so no diagnostic signal was lost.
- **Files modified:** `extension/lib/memory/memory-extractor.js`
- **Commit:** `45aa40e1`

## Post-ship audit (2026-07-28)

The shipped icon was audited against the original design export
(`FSB Icon Animations.dc.html`). The four-concepts-to-one collapse recorded in CONTEXT.md
holds and is still the right call — ViewportGlow parity was verified exact — but the audit
found five defects, all since fixed.

| # | Defect | Fix |
|---|---|---|
| 1 | `connected` started false and only flipped on `ws.onopen`, and the relay has no enable gate, so every extension/MCP-only user rested on the 50%-alpha desaturated frame permanently | Dim now requires a relay to have connected at least once, recorded install-wide in `chrome.storage.local` under `fsbActionIconRelaySeen`. Dim means "your relay dropped", never "you never had one" |
| 2 | `fsb-action-icon-watchdog` was registered unconditionally at install and startup, waking the worker every 30s for the life of the browser — the same keepalive shape that kept `watching` static | The module owns the alarm: armed in `startAnimation`, cleared in `stopAnimation`, and `repair()` retires a stranded one. Guarded on `watchdogArmed`, because `create()` on an existing name restarts the period and phase churn would otherwise defer the watchdog forever |
| 3 | No test exercised the module; the only pins were two `importScripts` counts | `tests/action-icon-behavior.test.js`, 81 assertions, in the `npm test` chain. ICON-01/02 read `visual-feedback.js` and `messaging.js` directly, so palette/period/phase-map drift now fails the suite |
| 4 | `strokeBead` drew 24 arc segments with `lineCap: 'round'`; at 32px each segment was ~0.4px of arc while the caps projected 1.6px past each end, stretching the bead to ~16% of the circumference against a 12% spec and piling alpha where caps overlapped | The bead is a single arc stroked with a `createConicGradient` — the construct the design itself uses, and the only way to run a colour ramp along an arc. Exact 12% span, continuous profile, no overdraw. A butt-capped segment path remains as fallback for a context without conic gradients |
| 5 | This summary claimed 217 precomputed frames and "never renders again"; `3f868169` had already moved to on-demand builds and `4066660e` changed the glyph scale | Corrected above |

Verified by running the new suite against the pre-fix module: 30 assertions fail there and
all 81 pass after.

## Four forms, one per state (2026-07-29)

The LOCKED collapse to Orbit-only in CONTEXT.md was **reversed**. All four design concepts
are now implemented as distinct renderers. The audit's finding stands: the collapse left
3 of 4 concepts unbuilt.

| State | Form | Period | Canonical source |
|---|---|---|---|
| `acting` | Orbit bead (unchanged) | 4000ms | `ViewportGlow._getDuration()` + `.state-acting` |
| `thinking` | Sweep bar, no bead | 1200ms ease-in-out | `fsbProgressSweep`, `visual-feedback.js:708` |
| `calling` | Inset ring + inward ping, no bead | 1600ms ease-out | **none — design-only** |
| `watching` | Breathe, bounded | 2400ms ease-in-out | `fsb-trigger-badge-dot`, `visual-feedback.js:1547` |

### What the design got wrong, and what we followed instead

The export claims each concept "reuses an existing FSB signal — same colors, same timing."
Only one of the three new forms actually does:

- **Sweep is a genuine reuse**, but the export's `translateX(-160% → 330%)` does not match
  the component it quotes. Canonical `fsbProgressSweep` is `-120% → 320%`. We follow the
  canonical values, and ICON-01 now pins them to the source so they cannot drift again.
- **Breathe half-reuses.** The 2.4s ease-in-out cadence is real (`.badge-dot`), but that
  keyframe animates opacity **and `transform: scale(1 → 1.15)`**, not a drop-shadow. We take
  the design's opacity+glow and skip the scale — rescaling the mark at 16px aliases it. The
  glow colour is grounded: it is the dot's own static `box-shadow` orange.
- **The Capability ring is invented.** There is no ring pulse, no ping keyframe and no 1.6s
  cadence anywhere in `extension/`; canonical `calling` is 4000ms. ICON-01 asserts that
  absence, so the day someone adds a real upstream ring the test fails and tells us to track
  it. This is the one place the icon knowingly diverges from ViewportGlow.

### Three structural limits of the design at toolbar size

- **The outward ping is unrenderable.** `fsbCapRing`'s second shadow spreads 14px *outside*
  the element; an icon has no canvas outside its 16/32px box, and the design's own 32px
  preview clips it. The ping travels **inward** instead.
- **No text, confirmed by the design itself.** The 128px demos show `▽0.9.90` and an `API`
  label, but the export's own 32px checks omit every text element while keeping the bar and
  the ring. At 32px the label would be ~2px tall.
- **Breathe is bounded, not looped.** Trigger-watch is always-armed, so a perpetual `setIcon`
  loop would hold the service worker awake indefinitely. It breathes for 6s on arm and on
  disarm, then settles. The settle frame is not invented — it is the badge dot's own
  reduced-motion appearance (`animation: none; opacity: 0.85`) plus its static glow.

### Cost

139 animated frames (sweep 18 / orbit 61 / ring 24 / breathe 36) ≈ **0.68 MB**, down from
213 frames ≈ 1.04 MB, because three of the four periods are shorter than the ViewportGlow
ones they replaced.

Verified by running the suite against both prior revisions: **58** assertions fail against
the original orbit-only build, **30** against the audit-fixed one, and all **154** pass now.

## Ranked claims (2026-07-29, after live testing)

Driving the four animations against the loaded extension showed the state model was wrong,
not just the timings: only Orbit was distinguishable, the Ring was imperceptible, and the
Breathe fired at an unpredictable moment rather than on arm.

Root cause: the icon resolved "what do I show" by **last write wins** — one global
`currentState`, plus a `watching` boolean that was *discarded* whenever a session animated.
That cannot express "two tabs and three agents are doing different things at once", which is
the real runtime situation.

`extension/utils/action-icon.js` now keeps a **claim registry**. Each source registers under
its own key (`session:<tabId>` / `watch:<tabId>`) and the icon renders the highest-ranked
claim: `acting` (4) > `calling` (3) > `thinking` (2) > `watching` (1). Only a change in the
*winner* repaints, so the per-trigger rearm loop cannot restart the animation.

### The five defects this round fixed

| # | Defect | Fix |
|---|---|---|
| 1 | `setWatching` **dropped** the breathe while a session animated (`if (animating) return`). MCP visual sessions stay `running` for **60s** after the last tool call, so any arm/disarm inside that window drew nothing at all | Watching is a claim, not a flag. It waits its turn and breathes when the session claim clears |
| 2 | `startTime` was set **before** the async frame build, so a state's first showing began mid-cycle and a bounded hold was short by the build duration | The clock starts *with* the loop, inside the `.then()` |
| 3 | Ring was a 1px hairline at 32px — the design's 3/128 scales to 0.75px | 2px at 32 / 1px at 16, ping travel 4.78px (was 3.5px) |
| 4 | `ensureAnimatedFrames` re-fetched and re-decoded both PNGs per state — up to 4× | Glyph bitmaps decoded once per worker and cached |
| 5 | `watching` was a global boolean fed **per-tab** counts, so with triggers on 2+ tabs it flipped true→false→true — and each trigger's own 1-minute watchdog drove one, costing a full breathe about every minute forever | Claims are keyed per tab; tab B ending no longer clears tab A |

Defects 1 and 5 fell out of the claim model rather than needing separate patches.

### Deliberate behaviour changes

- **Disarming no longer breathes.** The breathe *means* "a watch is armed"; dropping the last
  claim leaves nothing to say, so the icon goes straight to idle.
- **No retime across states.** Every state owns a distinct form now, so there is no visual
  position worth carrying across a change — each starts at its own frame 0.
- **Claims that race `init()` are honoured.** `init` runs at service-worker top level, so
  status updates can land mid-boot; those used to be dropped by an `!ready` guard.

### API

`applyOverlayState(overlayState, tabId)` and `setWatching(isWatching, tabId)` now take a tab
id (both call sites already had one in scope); `dropTab(tabId)` was added and is wired to the
existing `chrome.tabs.onRemoved` listener. A missing tab id falls back to a `global` key.

Test suite grew 157 → **194** assertions; **61** fail against the pre-change module.

## Driven by tool CATEGORY, not phase (2026-07-29)

Phase turned out to be a near-useless selector. The implicit MCP visual session
**hardcodes `phase: 'planning'`** (`mcp-visual-session-lifecycle.js:226`), so `read_page`,
`click` and `navigate` all produced the identical animation. Only `invoke_capability`
differed, because it sends `phase: 'calling'` directly. Two live demos were narrated as
"Orbit" when what actually rendered was the Sweep.

The icon now animates by **what kind of tool is running**:

| Rank | Form | Meaning | Selector |
|---|---|---|---|
| 4 | Breathe | a trigger watch is armed | `setWatching` |
| 3 | Ring | default — everything else | fallthrough |
| 2 | Orbit | reading | tool is read-only |
| 1 | Sweep | driving the browser | nav / tabs / interaction / scroll |

### The split is derived, not hand-maintained

`resolveIconActivity()` in `extension/ai/tool-definitions.js` reuses the registry's existing
`_readOnly` flag, so Orbit/Sweep tracks the real read/write boundary automatically. Only the
"driving" subset is an explicit set. Two tests derive their expectations from `TOOL_REGISTRY`
rather than restating it, so a newly added tool cannot silently land in the wrong animation.

**The wire carries FSB verbs, not MCP tool names** — `manual.ts:220` sends
`tool._contentVerb || tool._cdpVerb || tool.name`, so `type_text` arrives as `type`,
`check_box` as `toggleCheckbox`, `click_at` as `cdpClickAt`. Roughly half the interaction
tools would have classified as the default under a name-keyed map. The resolver builds a
reverse verb map once and ICON-15 asserts exhaustively that every verb classifies like its
tool name.

### A separate signal, not a new field on the visual session

Read-only tools never open a visual session (`manual.ts:216` filters `isManualTool`), so
Orbit was unreachable by construction. Rather than give them sessions — which would also put
the **on-page overlay up on every `read_page`** — the icon gets its own signal,
`noteActivity(tabId, activity)`, hooked at the bridge's single message chokepoint plus the
autopilot's tool-dispatch site. The icon no longer rides `sendSessionStatus` at all, and the
three whitelists between the visual session and the overlay state stay untouched.

Activity claims **decay on a 60s TTL** refreshed by each call, because a tool call is
instantaneous and nothing sends an "I stopped reading" signal. They are deliberately **not
persisted**: a timer does not survive worker eviction, so a restored activity claim would
never expire.

### Deliberate consequences

- **The icon and the on-page overlay formally diverge.** The overlay keeps its phase map;
  ICON-02 now asserts the icon reads no phase at all.
- **Sweep is the lowest rank**, so a page mutation on one tab is visually suppressed by a
  passive read on another. That follows from the requested order.
- **Breathe is unbounded** — it loops while any watch is armed, which keeps the service
  worker awake indefinitely. `BREATHE_HOLD_MS = null` is the single line that decides this;
  setting it back to `6000` restores the bounded hold.
- **STATES keys renamed to the form names.** `acting`/`thinking` would misname the
  animations outright once Orbit means *reading*.

Test suite 194 → **261** assertions.

## Commit hygiene note (important for whoever lands this)

This workspace was **already carrying 68 modified tracked files plus 5 untracked files** of
unrelated in-flight work (a native-host bootstrap / agent-bridge-readiness /
`testAgentProviderConnection` feature) when execution started. Three of those files —
`extension/background.js`, `extension/ui/options.js` and
`tests/lattice-provider-bridge-smoke.test.js` — overlap with this task.

Rather than sweep that work into these commits, each commit stages **only this task's own
hunks**, verified by marker-filtered patch splitting and by grepping the staged diff for
foreign identifiers (zero hits). The pre-existing WIP was left unstaged and byte-intact.

One consequence to be aware of: the `importScripts` pin value of **324/320 is correct for the
working tree**, which is what every gate actually reads and what passes. It is *not* correct
for `HEAD` in isolation, because HEAD lacks the pre-existing (still-uncommitted)
`utils/native-host-install-command.js` load that accounts for 323/319. These commits are
therefore meant to land together with the surrounding WIP, not to be checked out standalone.
Isolated-commit greenness was already unattainable in this workspace before this task began.

## Verification

| Gate | Result |
|---|---|
| `node --check` + structural gate on `action-icon.js` | PASS |
| Stubbed-worker runtime smoke (24 assertions, 2 scripts) | PASS |
| 15 targeted tripwire tests | PASS |
| `npm run validate:extension` | exit 0 (426 JS files parsed clean) |
| `npm test` (full serial chain) | exit 0, zero failures |
| `git diff --check` | clean |
| `extension/manifest.json` | unmodified |

`npm test` was run twice — once after Task 3 and again after the deviation fix — both exit 0.

## Commits

| Commit | Scope |
|---|---|
| `9e272003` | Task 1 — action-icon module |
| `f9d923bb` | Task 2 — background wiring + paired count pins |
| `aad427af` | Task 3 — badge removal + connection hook |
| `45aa40e1` | Deviation — stranded memory-extractor badge |

## Known Stubs

None. Every surface the plan describes is wired to real data: the icon reads the same
normalized `overlayState` the in-page overlay consumes, the watching frame reads the existing
trigger `counts`, and connection strength reads the real WebSocket transitions.

## Self-Check: PASSED

All 5 touched files present on disk; all 4 commit hashes resolve in `git log`.
