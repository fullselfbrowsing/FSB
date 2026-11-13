---
phase: 52
slug: on-demand-hud-lifecycle-primitive-shell
status: approved
shadcn_initialized: false
preset: none
created: 2026-07-14
reviewed_at: 2026-07-14
---

# Phase 52 — UI Design Contract

> Approved visual and interaction contract for the explicitly invoked Skopeo lifecycle and shared primitive shell.

---

## Contract Intent and Boundary

Phase 52 delivers one quiet, current-tab HUD shell that is absent until explicitly invoked and absent without residue after dismissal. The existing FSB side panel remains the extension entry surface; the extension toolbar continues to open that side panel. Normal Skopeo invocation renders only the compact ambient lens and edge rail.

This contract defines all six primitives—anchor mark, entity chip, halo, rail, ghost layer, and gate—and all four attention levels—ambient, anchored, focused, and interstitial—so later capability packs cannot invent new chrome. In Phase 52, anchored, focused, and interstitial states are shown only in a controlled shell-owned demonstration fixture. The fixture must not attach to, interpret, or act on host content.

Drive/Docs recognition and semantic anchoring begin in Phase 53. Graphify, contract intelligence, AI, corpus management, citations, alerts, drafting, sending, and every other illustrative workflow in the HUD board are out of scope. Iron Man is conceptual inspiration only; it is not a visual reference.

## Design System

| Property | Contract |
|----------|----------|
| Tool | Existing FSB CSS tokens and direct JavaScript only |
| Preset | Not applicable |
| Component library | None |
| Icon library | Existing Font Awesome may be used in the side panel; page HUD controls use CSS geometry or text glyphs so no page-level third-party asset is introduced |
| Body font | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif` |
| Instrument font | `"Space Mono", "SF Mono", Monaco, Consolas, monospace`; use the bundled `space-mono-400.ttf` and `space-mono-700.ttf` assets |
| Styling boundary | One dynamically injected Shadow DOM shell; all page-HUD styles live inside it |
| Runtime | Manifest V3 Chrome extension, classic/direct JavaScript; no React, Next.js, Vite, JSX, Tailwind, or component framework |

The HUD starts from the existing FSB values in `extension/shared/fsb-ui-core.css`, the side-panel patterns in `extension/ui/sidepanel.*`, and the top-layer/pointer-isolation precedents in `extension/content/visual-feedback.js`. It does not copy the design-board HTML or its unapproved actions.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | None | Not applicable; this is not a React stack |
| Third-party registries | None | No registry, package, or block may be added |

No new component library, icon package, remote font, CDN dependency, or third-party registry is approved for Phase 52.

## Spacing Scale

These are the only spacing tokens Phase 52 may introduce or consume inside new Skopeo UI. Existing unrelated FSB rules are not retrofitted.

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Icon-to-label gaps, rail-to-lens gap, compact internal padding |
| `space-2` | 8px | Control gaps, chip padding, compact row padding |
| `space-4` | 16px | Default panel padding, viewport inset, card gap |
| `space-6` | 24px | Section separation and large text-to-action separation |
| `space-8` | 32px | Major internal separation and compact control target |
| `space-12` | 48px | Large fixture separation only |
| `space-16` | 64px | Rail top/bottom reserve and page-level separation |

Exceptions: none. Do not add 2px, 6px, 10px, 12px, 14px, 20px, or 28px as spacing tokens or component gaps. One- and two-pixel strokes, focus outlines, and component widths/heights are geometry, not spacing tokens.

Target-size dimensions are deliberately grid-aligned: 32px compact controls, 40px standard controls, and a 44px-wide switch target. Every pointer target must be at least 24×24 CSS px; the Phase 52 components exceed that floor without introducing a non-grid spacing value.

## Typography

Use exactly these four sizes and two weights. No Phase 52 component may introduce another font size or weight.

| Role | Family | Size | Weight | Exact line height | Usage |
|------|--------|------|--------|-------------------|-------|
| Micro label | `"Space Mono", "SF Mono", Monaco, Consolas, monospace` | 11px | 700 | 16px | Uppercase instrument labels, state labels, shortcut tokens |
| Metadata | `"Space Mono", "SF Mono", Monaco, Consolas, monospace` | 12px | 400 | 16px | Hints, counts, rail metadata, secondary status |
| Body/control | System sans stack above | 14px | 400 | 20px | Descriptions, status copy, button labels |
| Title/emphasis | System sans stack above | 16px | 700 | 24px | Skopeo title, focused/gate title, emphasized consequence |

Micro labels may use `letter-spacing: 0.08em` and uppercase. Body text must not use uppercase. Truncation is allowed only for non-action metadata; the full string remains in the accessible name or description. Do not use type smaller than 11px.

## Color

### On-page HUD 60/30/10 contract

| Share | Existing FSB value | Usage |
|-------|--------------------|-------|
| Dominant 60% | `#0d0a09` (`--fsb-surface-ink`) | Ambient lens base, focused/gate base, rail backing |
| Secondary 30% | `#1a1513` (`--fsb-surface-elevated`, dark) | Elevated control wells, chips, focused sections; `#26201d` (`--fsb-surface-muted-2`, dark) may separate nested neutral areas |
| Accent 10% maximum | `#ff6b35` (`--fsb-primary`) | Named active/current signals only, listed below |

Text uses `#f6efe9` primary, `#d2c1b4` secondary, and `#a99283` muted. Default keylines use `rgba(255, 241, 232, 0.18)`; subtle separators use `rgba(255, 241, 232, 0.10)`. Shadows use `rgba(0, 0, 0, 0.38)` and must never carry meaning.

The side-panel control inherits the active FSB side-panel theme rather than painting a dark island: light surfaces use `#fffdfb`/`#ffffff`; dark surfaces use the side panel's existing `#050505` plus `#1a1513`. Orange remains the same `#ff6b35` in both themes.

Accent is reserved for:

1. the active side-panel switch track;
2. the current ambient rail fill/tick and one 8px active glyph;
3. the visible `:focus-visible` outline;
4. a deliberately requested anchor mark;
5. at most one validated anomaly halo in the viewport;
6. the consequence gate's signal keyline when the gate is not destructive.

Orange is not used for ordinary body text, every button, decorative borders, loading decoration, or all interactive elements. A halo is not an error, selection, focus indicator, or confidence score.

`#dc2626` (`--fsb-danger`) is the destructive/error base. On a dark surface, readable destructive text is `#fca5a5`; use the base as a 2px keyline or a maximum 12% tint, not as a small text color. Destructive semantics are allowed only for a true universal-kill consequence or a true consequential gate. Ordinary close/back actions stay neutral. Errors may use the same palette but must be labelled as errors, not destructive actions.

All text and meaningful icons must meet WCAG 2.2 AA contrast: 4.5:1 for text, 3:1 for large text and non-text controls. Never place light body text directly on the orange fill; an orange-filled control uses `#0d0a09` text.

## Focal Point and Visual Hierarchy

### Side-panel states

The Skopeo control is a single 64px-minimum row immediately below `.sidepanel-header` and before `.chat-messages-area`. It is visually subordinate to the FSB header and visually separate from chat input. The row has 16px inline padding, 8px block padding, a 1px existing-token border, and a 12px radius.

| State | Focal point | Hierarchy and treatment |
|-------|-------------|-------------------------|
| Off | The switch and `Off for this tab` state | `Skopeo` title first, neutral state second, shortcut hint third; switch is neutral and no orange appears |
| Starting | `Starting on this tab…` | Switch remains enabled and retains focus so the user can turn Skopeo off while injection is pending; one static/animated status glyph precedes copy; no page shell exists until ready |
| Active | Orange switch track plus `On · Ambient` | Title remains first; state and the `Esc Esc` hint are secondary; no success-green treatment because active is not completion |
| Unsupported | `Skopeo can’t run on this page.` | Neutral unavailable icon, explanation, and no active switch; do not use an alarming full-panel error |
| Error | `Skopeo didn’t start.` and `Try again` | Error keyline/text is the focal signal; shortcut hint recedes; page state is guaranteed empty |

### Page attention states

| State | Focal point | Allowed visual set | Prohibited visual set |
|-------|-------------|--------------------|-----------------------|
| Ambient | Compact lens status, then edge rail | Lens, rail, visible close | Anchors, chips, halo, ghosting, gate, focus movement |
| Anchored | The shell-owned demo target carrying one mark or chip | Anchor mark, entity chip, optional rail; one halo only with explicit anomaly semantics | Ghost layer, gate, automatic focus movement |
| Focused | Named focused card; host remains visible behind a temporary ghost layer | Focused card, ghost layer, relevant demo mark/chip, back control | Gate, repeated halo, host `inert`, host `aria-hidden`, host CSS mutation |
| Interstitial | The named consequence and safest return action | Exactly one gate and only the context needed to decide | Rail decoration, unrelated chips/marks, generic coaching, multiple gates |

Normal invocation stops at Ambient. No production control in Phase 52 advances the user through the demonstration ladder.

## Component Inventory and Geometry

| Component | Exact contract |
|-----------|----------------|
| Side-panel Skopeo row | Minimum height 64px; 16px inline and 8px block padding; 8px internal gap; 12px radius; full available width less the side panel's 16px inline gutters |
| Side-panel switch | Button with `role="switch"`; 44×40px hit target; visible track 40×24px; 16px thumb; 4px track inset; never implemented as a bare checkbox with an invisible label |
| Shadow host/envelope | One host only; `position: fixed; inset: 0`; top-layer-capable; `pointer-events: none`; no intrinsic paint when all primitives are absent |
| Ambient lens | 240×40px preferred; `max-width: calc(100vw - 32px)`; 8px inline/4px block internal padding; 12px radius; contains 8px active glyph, `Skopeo · Ambient`, shortcut metadata when space allows, and a 32×32 close control |
| Rail | 4px wide; preferred vertical span from 64px below the viewport top to 64px above the bottom; minimum 64px tall; 8px ticks; purely geometric and pointer-transparent |
| Anchor mark | 8×8px visible square with 2px keyline; interactive fixture wrapper is 32×32px; no leader line longer than 48px in the controlled fixture |
| Entity chip | 32px minimum height; maximum width 240px; 8px inline padding; 4px internal gap; 999px pill radius; one-line ellipsis only for metadata, not the entity label |
| Halo | 2px outline plus a 16px maximum glow extent around the semantic payload; maximum one visible per viewport; never animated continuously |
| Ghost layer | Fixed viewport geometry inside the one shell; `rgba(13, 10, 9, 0.16)` maximum veil; no blur/filter on host nodes; `pointer-events: none`; `aria-hidden="true"` on the visual layer only |
| Focused card | Preferred width 320px; `max-width: calc(100vw - 32px)`; maximum block size `calc(100dvh - 32px)`; 16px padding; 12px radius; internal overflow only when required |
| Gate | Preferred width 360px; `max-width: calc(100vw - 32px)`; maximum block size `calc(100dvh - 32px)`; 16px padding; 12px radius; action buttons minimum 40px high |
| Visible close/back | 32×32px icon control in ambient/anchored; focused/interstitial may use a 40px-high text control when the state name improves clarity |
| Live region | One visually hidden, atomic region inside the shell; no second live region per primitive |

The shell owns exactly these six primitive types. A capability pack may supply semantic payloads later, but may not supply new surface chrome, private tokens, or another Shadow host.

## Placement, Collision, and Responsive Behavior

### Ambient placement

Use this deterministic candidate order: top-right, top-left, bottom-right, bottom-left. Keep the lens 16px from viewport edges and 8px from a visible host control. Reject a candidate that intersects a visible host `button`, link, input, select, textarea, `[role="button"]`, `[role="menuitem"]`, the currently focused host element, or the viewport scrollbar zone. The rail follows the selected left/right edge.

If no 240×40px candidate is safe, switch to an 88×40px compact lens that keeps the glyph and close control visible and keeps the full status as its accessible name. Re-run the same candidate order. If no compact candidate is safe, do not render a partial shell: return to off and expose `Skopeo can’t open safely on this layout.` in the side panel. Do not cover a host control merely to honor invocation.

Re-evaluate placement on viewport resize and browser zoom. Movement uses the motion timing below; it never modifies or reparents host nodes. Phase 52 may read rectangles for collision avoidance, but it must not infer semantic anchor identity or attach marks to host content.

### 200% zoom and narrow viewports

- At 200% browser zoom, all required controls remain visible without horizontal page scrolling caused by Skopeo.
- At a CSS viewport below 480px, use the compact ambient lens; metadata may be visually hidden but remains accessible.
- Focused and gate surfaces use available viewport width and scroll internally. At a CSS viewport below 480px, gate actions stack vertically in source order with the safe return action first.
- Do not use `transform: scale()` to simulate responsiveness. Font sizes remain the four declared sizes and browser zoom performs the enlargement.
- The rail may shorten to its 64px minimum but may not become a full-height decorative glow.
- If a focused or gate surface cannot fit without covering the currently focused host control, return to the prior attention level and announce `Skopeo can’t open this view without covering the current page control.`

## Interaction and State Transitions

### State ladder

```text
OFF → STARTING → AMBIENT → ANCHORED → FOCUSED → INTERSTITIAL
                         ← single Escape / visible back ←
ANY ACTIVE → toggle off or Escape Escape → OFF
```

- Invocation is current-tab only and comes from the dedicated side-panel switch or the Chrome command named `Toggle Skopeo in current tab`.
- Preferred command hint is `⌥ Space` on macOS. The documented fallback hint is `Ctrl Shift Space`; the user may remap either in Chrome.
- `STARTING` is side-panel-only. Do not insert an empty host, loader, rail, or launcher before the shell is ready. The switch is already checked and remains operable; switching it off or invoking the same Chrome command again cancels startup.
- A repeated invoke of an active tab does not create another host. It resolves to the current Ambient state.
- A visible close or one `Escape` removes the topmost Skopeo state and returns to the preceding level. Closing Ambient returns the tab to Off.
- A second non-repeated `Escape` within 600ms of the first is the universal current-tab kill. The first Escape may already have moved back one level; the second ends the complete session generation.
- Ignore `Escape` while `event.isComposing` is true or `event.repeat` is true. Consume only the Skopeo Escape/Tab behavior that actually applies; do not suppress unrelated host keyboard events.
- Toggling off is immediate and equivalent to universal kill. It cancels pending work and cannot affect another tab or unrelated FSB automation.
- A later explicit invocation starts a visually fresh generation in Ambient; no prior primitive is restored.

### Motion timing

| Transition | Timing |
|------------|--------|
| Side-panel state text change | Immediate; no crossfade |
| Ambient/anchored/focused entry | 120ms ease-out opacity plus at most 4px translation |
| Collision-driven reposition | 120ms ease-out; no spring or overshoot |
| Ghost layer entry/removal | 120ms linear opacity |
| Halo | One 240ms ease-out bloom to a static outline; no pulse loop |
| Interstitial gate entry | 120ms ease-out opacity; no scale bounce |
| Close, kill, navigation teardown | No exit animation; restore focus if applicable and remove owned UI synchronously |
| Live-region updates | At most one meaningful update per 500ms; terminal/error updates bypass coalescing |

Under `prefers-reduced-motion: reduce`, every transition is 0ms, the starting indicator is static, the halo is a 2px static outline with no glow animation, and ghosting changes instantly.

## Pointer and Host-Integrity Policy

1. The host and every geometry-only layer use `pointer-events: none`.
2. Only visible lens controls, demo anchor/chip controls, focused-card controls, and gate controls opt into `pointer-events: auto`.
3. Rail, halo, leader geometry, ghost layer, hidden primitives, and empty shell space never accept pointer input.
4. Event listeners inspect the composed path and act only on Skopeo controls. Do not broadly call `preventDefault`, `stopPropagation`, or `stopImmediatePropagation` on host events.
5. Do not change host `body`/`html` overflow, padding, position, transform, filter, classes, inline styles, `inert`, `aria-hidden`, selection, or scroll position.
6. Do not wrap, reparent, clone, or decorate host nodes. All marks in the Phase 52 controlled fixture target shell-owned fixture nodes.
7. A consequence gate suspends only the Skopeo-owned pending action. It does not disable the host document or mutate host accessibility state.
8. Drive/Docs scrollbars, menus, rows, editing, selection, and native controls remain operable at every attention level.

## Keyboard, Focus, and Accessibility

### Focus policy

- Side-panel activation keeps focus on the side-panel switch.
- Ambient and Anchored never move page focus on entry. Their interactive demo controls participate in normal source order only when the controlled fixture is active.
- Before entering Focused, record the actual origin control. Focus the named focused-card title with `tabindex="-1"`, then expose controls in this order: visible back, fixture action, turn-off control.
- Before entering Interstitial, record its focused trigger. Use `role="alertdialog"` and `aria-modal="true"`; initial focus goes to the safest return action. Tab order is: `Return to focused demo`, `Continue demo`, visible close/back. Trap Tab only while the gate is visible.
- On close/back, restore focus with `focus({preventScroll: true})` to the recorded origin when it is connected, visible, enabled, and focusable. Otherwise restore to the preceding Skopeo surface's back/trigger control. If no safe origin remains, do not force focus to `body` or scroll the host.
- On kill from Focused/Interstitial, attempt the same host-origin restoration before removing the root. On kill from the side panel, focus remains on the side-panel switch.
- Focus outlines are 2px `#ff6b35` with a 2px offset and must not be clipped. Hover never substitutes for focus.

### Roles, names, and live behavior

| Surface/primitive | Semantic contract and exact accessible name |
|-------------------|---------------------------------------------|
| Side-panel switch | `role="switch"`, `aria-checked`; name `Skopeo for this tab`; state text is referenced with `aria-describedby` |
| Ambient container | `role="region"`, name `Skopeo ambient HUD` |
| Rail | Named status group `Skopeo ambient rail`; decorative line/ticks inside are `aria-hidden="true"` |
| Anchor mark demo | Native button, name `Open anchor mark demo` |
| Entity chip demo | Native button, name `Open entity chip demo` |
| Halo demo | Visual halo is `aria-hidden="true"`; semantic payload group is named `Anomaly signal demo` and includes visible text stating the anomaly |
| Ghost layer demo | Visual veil is `aria-hidden="true"`; the focused surface is named `Skopeo focused demo` and announces `Focused view on. Press Escape to restore the page.` |
| Gate demo | `role="alertdialog"`, title `Consequence preview`, description from the exact demo copy below |
| Close Ambient | Native button, name `Turn off Skopeo` |
| Back from Anchored | Native button, name `Back to ambient Skopeo` |
| Back from Focused | Native button, name `Back to anchored view` |
| Back from Interstitial | Native button, name `Back to focused view` |

One `aria-live="polite"`, `aria-atomic="true"` node announces meaningful state changes such as `Skopeo on. Ambient view.` and the focused-view message. Injection failure and unsupported-page copy live in the side panel's atomic status region. Do not announce rail motion, hover, halo animation, collision repositioning, or every tick. Hidden primitives are removed from both DOM rendering and the accessibility tree; opacity alone is not hidden state.

### Forced colors and contrast preferences

Under `forced-colors: active`:

- set surfaces to `Canvas`, text to `CanvasText`, controls to `ButtonFace`/`ButtonText`, and focus/current indicators to `Highlight`;
- remove gradients, translucent glows, box-shadow meaning, and ghost opacity effects;
- preserve each primitive with a 1px or 2px system-color border and visible text/shape, not color alone;
- show the halo as a 2px `Highlight` outline plus the visible anomaly label;
- show the rail as `CanvasText` with the current tick in `Highlight`;
- leave `forced-color-adjust: auto` unless a tested CSS glyph requires `currentColor`.

In increased-contrast modes, subtle borders promote from the 10% to the 18% existing FSB border token. Meaning must remain intact with every shadow and glow removed.

## Visual Effects Are Not Semantics

- **Halo:** a scarce visual amplifier around a payload that already states its anomaly in text. It cannot create or upgrade anomaly semantics. Maximum one per viewport and never in normal Ambient invocation.
- **Ghost layer:** a temporary, 16%-maximum shell-owned visual filter for Focused state. It never applies CSS to host nodes, never hides host content from assistive technology, never sets `inert`, and never blocks pointer input.
- **Gate:** the only modal semantic. Production gates require a concrete, explicitly consequential pending action and must name both the action and consequence. Informational messages, empty states, onboarding, and generic acknowledgements are not gates.
- **Orange glow:** decoration only. Active state, focus, warning, and anomaly remain distinguishable through label, geometry, role, and keyline without the glow.

## Copywriting Contract

Use sentence case. Prefer current-tab language. Do not use generic `Submit`, `OK`, `Cancel`, `Save`, `Proceed`, or unexplained `Close` labels.

### Side-panel and invocation copy

| Element/state | Exact copy |
|---------------|------------|
| Row title | `Skopeo` |
| Switch label/name | `Skopeo for this tab` |
| Off state | `Off for this tab` |
| Starting state | `Starting on this tab…` |
| Active state | `On · Ambient` |
| Primary CTA | `Turn on Skopeo` |
| Active toggle action | `Turn off Skopeo` |
| Retry action | `Try again` |
| Assigned macOS shortcut hint | `Shortcut: ⌥ Space · Change shortcut` |
| Assigned fallback hint | `Shortcut: Ctrl Shift Space · Change shortcut` |
| Unassigned shortcut hint | `Shortcut not assigned · Set in Chrome shortcuts` |
| Active kill hint | `Esc Esc: turn off Skopeo in this tab` |
| Unsupported heading | `Skopeo can’t run on this page.` |
| Unsupported body | `Open a standard web page, then try again.` |
| Start error heading | `Skopeo didn’t start.` |
| Start error body | `Nothing was added to the page. Try again.` |
| Unsafe-layout error | `Skopeo can’t open safely on this layout.` |
| Unsafe-layout body | `Zoom out or resize the page, then try again.` |

### Page and primitive copy

| Element/state | Exact visible copy |
|---------------|--------------------|
| Ambient lens | `Skopeo · Ambient` |
| Ambient close tooltip | `Turn off Skopeo` |
| Anchored fixture label | `Anchor demo` |
| Entity fixture label | `Example entity · 1 note` |
| Halo fixture label | `Anomaly demo · unusual change` |
| Focused fixture title | `Focused Skopeo demo` |
| Focused fixture body | `This controlled preview demonstrates temporary ghosting. It does not read or change the page.` |
| Empty/context heading | `No page context available` |
| Empty/context body | `Skopeo will stay in ambient mode and leave the page unchanged.` |
| Context-unavailable announcement | `Skopeo can’t open this view without covering the current page control.` |
| Back from Anchored | `Back to ambient Skopeo` |
| Back from Focused | `Back to anchored view` |
| Back from Interstitial | `Back to focused view` |
| Universal kill action | `Turn off Skopeo in this tab` |

### Controlled consequence-gate fixture

| Element | Exact copy |
|---------|------------|
| Eyebrow | `Demo only` |
| Title | `Consequence preview` |
| Body | `Continuing closes this preview. Skopeo will not act on the page.` |
| Safe action | `Return to focused demo` |
| Continue action | `Continue demo` |

This copy is allowed only in the controlled Phase 52 fixture. It is not a reusable production gate message. A future production gate must replace it with specific action-and-consequence copy and must not use generic confirmation verbs.

Destructive confirmation: none. Universal kill is immediate by D-08 and must not add a confirmation dialog. The controlled gate executes no host action.

## Side-Panel State Behavior

| State | Switch | Status/live behavior | Page guarantee |
|-------|--------|----------------------|----------------|
| Off | Enabled, `aria-checked="false"` | `Off for this tab`; no live announcement on initial load | No Skopeo host/runtime residue |
| Starting | Enabled, `aria-checked="true"`, retains focus; row has `aria-busy="true"` | Polite `Starting on this tab…`; switching off cancels startup | No page shell until ready acknowledgement |
| Active | Enabled, `aria-checked="true"` | Polite `On · Ambient`; show kill/shortcut hint | Exactly one shell, ambient lens, and rail |
| Unsupported | Disabled or unchecked based on retryability | Polite unsupported heading/body | No shell and no active session record presented to the user |
| Error | Enabled retry action, unchecked | Polite error heading/body; do not spam repeated failures | No partial shell; owned resources returned to baseline |

Switching tabs refreshes this row against the newly active tab. It must never display Tab A's active state while Tab B is selected. Starting/active/error UI uses the explicit tab id, not a second late active-tab query.

## Off, Dismissal, Kill, and Teardown Visuals

- Off has no in-page visual, hidden launcher, empty custom element, style tag, rail, mark, ghosting, gate, live region, or accessibility node. The side-panel row is the only Off affordance.
- Single Escape or visible back removes the topmost state without a lingering fade. Returning from Ambient to Off performs complete teardown, not `display: none`.
- Universal kill first makes the ended generation terminal, then restores eligible focus, removes the top-layer/popover state, and removes the sole host. Side-panel copy returns to `Off for this tab` after acknowledgement.
- There is no success toast, completion glow, or `Skopeo off` page badge after teardown; any such artifact is residue.
- Unsupported/restricted pages and failed injection never flash a page shell.
- Navigation/reload ends the current generation and does not silently re-invoke on the next document.
- Late async output, timer callbacks, observers, queued messages, or stale focus hooks may not repaint any UI from the ended generation.
- Teardown is idempotent. A second close/kill produces no visual change, error toast, focus jump, or host mutation.

## Controlled Demonstration Contract

The demonstration fixture exists only to verify the shared grammar. It uses shell-owned sample content and an explicit test/dev entry point unavailable during ordinary invocation.

1. Start in Ambient with only lens and rail.
2. Enter Anchored to show one anchor mark and one entity chip on a shell-owned sample row. The page receives no mark.
3. Add the halo only to the visible `Anomaly demo · unusual change` payload.
4. Enter Focused from the anchor demo; show the focused card and temporary ghost layer, move focus deliberately, and expose the exact back control.
5. Enter Interstitial only from a control labelled for the consequence preview; show one gate with the exact demo copy.
6. Walk back one level per Escape, then prove `Escape Escape` kills the full current-tab fixture.

Do not show the six primitives simultaneously in a grammar gallery during normal invocation. Do not ship the board's drafting, sending, searching, contract, AI, citation, or router controls as Phase 52 functionality.

## Acceptance and Visual QA Checkpoints

These are observable acceptance checkpoints aligned with `52-VALIDATION.md`; they do not prescribe implementation tasks.

### Lifecycle and side panel

- [ ] A fresh arbitrary page and each post-kill page screenshot are pixel-identical in Skopeo-owned regions; no root is present before explicit invocation.
- [ ] The toolbar still opens the FSB side panel. The dedicated row and configured command target only the selected/current tab.
- [ ] Off, Starting, Active, Unsupported, and Error side-panel states match the hierarchy and exact copy above at narrow and wide side-panel widths.
- [ ] Starting never flashes an empty page host. Unsupported/error never leaves a rail or active switch.
- [ ] Repeated invoke produces one host and one Ambient surface. Kill during a delayed fixture never allows a later surface to reappear.

### Primitive and attention grammar

- [ ] Normal invocation shows exactly the ambient lens and rail; no anchor, chip, halo, ghost, or gate is visible.
- [ ] The controlled fixture can show each of the exactly six registered primitive types with the dimensions, names, and legal attention combinations above.
- [ ] Halo is absent without the explicit anomaly payload and never appears more than once.
- [ ] Ghosting is temporary, pointer-transparent, and visually removed on leaving Focused.
- [ ] Gate appears only in the controlled consequence fixture, contains one named consequence, and has the safe return action first.

### Host coexistence and collision

- [ ] Drive row selection/open, menus, scrollbars, and Docs editing/selection/native Escape remain usable; the shell causes no layout shift or host style/attribute diff.
- [ ] Only visible Skopeo controls win pointer hit tests; clicking through rail, halo, ghost, and empty envelope reaches the host.
- [ ] At 200% zoom and below 480 CSS px, required controls remain visible, focused/gate content reflows, actions stack, and no Skopeo-created horizontal scroll appears.
- [ ] Collision fallback chooses another corner, then the compact lens, then fails safely; it never covers the currently focused host control.

### Accessibility and preferences

- [ ] Keyboard-only traversal follows the declared focus order; one Escape backs out, two within 600ms kill, and focus restoration never scrolls or targets a detached node.
- [ ] VoiceOver exposes the declared names/roles, receives meaningful state announcements only, and cannot reach hidden primitives after back/kill.
- [ ] The orange focus outline remains visible and unobscured on dark/light host content.
- [ ] Reduced motion contains no pulse, sweep, bloom, ghost fade, or transition-dependent meaning.
- [ ] Forced colors preserves every control and primitive through system-color borders/text with no gradient or glow dependency.

### Teardown

- [ ] After close, kill, reload, navigation, and a second idempotent teardown, root/listener/observer/timer/animation/focus-hook counts return to baseline.
- [ ] No host class, style, `inert`, `aria-hidden`, overflow, padding, transform, filter, scroll position, or focus state is left changed by Skopeo.
- [ ] Another tab's Skopeo session and unrelated FSB automation remain visually and behaviorally unchanged by current-tab kill.

## Traceability

| Source | UI contract coverage |
|--------|----------------------|
| HUD-01 | Contract Intent; Side-Panel State Behavior; Interaction and State Transitions; Lifecycle QA |
| HUD-02 | Interaction and State Transitions; Off/Dismissal/Kill/Teardown; Teardown QA |
| HUD-03 | Pointer and Host-Integrity Policy; Off/Dismissal/Kill/Teardown; Teardown QA |
| HUD-04 | Placement/Collision/Responsive Behavior; Pointer and Host-Integrity Policy; Host Coexistence QA |
| HUD-05 | Typography; Color; Keyboard/Focus/Accessibility; Accessibility QA |
| HUD-07 | Component Inventory; Roles/Names; Controlled Demonstration Contract |
| HUD-08 | Focal Point and Visual Hierarchy; Visual Effects Are Not Semantics; Controlled Demonstration Contract |
| D-01 | Contract Intent; Off/Dismissal/Kill/Teardown; no dormant page affordance |
| D-02 | Side-panel placement; Interaction and State Transitions; toolbar unchanged |
| D-03 | Shortcut copy; current-tab state behavior; `Toggle Skopeo in current tab` command |
| D-04 | Component Inventory; exactly six primitive types under one shell |
| D-05 | Page hierarchy; normal invocation stops at Ambient |
| D-06 | Attention-state table; Visual Effects Are Not Semantics |
| D-07 | Exact close/back names; one-Escape transition contract |
| D-08 | 600ms Escape-Escape kill; immediate toggle-off behavior |
| D-09 | Off/Dismissal/Kill/Teardown; no stale visual resurrection |
| D-10 | Design System; one Shadow host/envelope |
| D-11 | Placement/collision; pointer and host-integrity policy |
| D-12 | Focus policy; Ambient/Anchored no-steal and Focused/Interstitial restoration |
| D-13 | Roles/names/live behavior; hidden-node removal; zoom, reduced-motion, forced-colors contracts |
| D-14 | Off/Dismissal/Kill/Teardown; teardown acceptance inventory |

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-07-14
