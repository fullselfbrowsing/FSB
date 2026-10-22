---
phase: 53
slug: drive-context-router-semantic-anchors
status: approved
shadcn_initialized: false
preset: none
created: 2026-07-15
reviewed_at: 2026-07-15
---

# Phase 53 — UI Design Contract

> Visual and interaction contract for verified Drive/Docs context projection, semantic-anchor placement, and fail-quiet withdrawal.

---

## Contract Intent and Boundary

Phase 53 extends the approved Phase 52 Skopeo shell; it does not introduce a second shell, visual language, or page application. The visible contract is deliberately narrow:

1. project a recognized context through the existing ambient lens using closed, locally owned copy;
2. place at most one Phase 53 proof annotation—a shared anchor mark—only beside a target whose stable semantic identity and geometry are both current;
3. withdraw that annotation synchronously whenever its identity or geometry certificate is lost; and
4. retain only a concise ambient fail-quiet explanation while the explicitly invoked session remains valid.

Stable file, folder, document, or opaque downstream keys are authoritative. A host node or `Range` is a revocable binding, never identity. No visible name, filename, folder label, clause text, page text, or host attribute is copied into the shell in this phase.

Corpus enrollment, account and permission authority, agreement content, contract facts, citations, chips containing contract intelligence, focused reading views, ask results, evidence workflows, gates, and alerts remain out of scope for Phases 54–59. A recognized context is not a claim that a source is accessible, enrolled, governing, or trustworthy.

## Design System

| Property | Contract |
|----------|----------|
| Tool | Existing FSB CSS tokens and direct classic JavaScript only |
| Preset | Not applicable |
| Component library | None |
| Icon library | No new icon dependency; the page HUD uses the existing CSS geometry |
| Body font | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif` |
| Instrument font | `"Space Mono", "SF Mono", Monaco, Consolas, monospace` using the already bundled Space Mono assets |
| Styling boundary | The single dynamically injected Phase 52 Shadow DOM shell |
| Runtime | Manifest V3 Chrome extension; no React, Next.js, Vite, JSX, Tailwind, remote asset, or component framework |

Phase 52's approved shell geometry, collision detection, focus handling, live region, forced-colors behavior, reduced-motion behavior, and exact teardown remain authoritative unless this document explicitly narrows behavior for semantic anchors.

## Spacing Scale

Phase 53 reuses the Phase 52 scale without adding a token.

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Glyph-to-label and compact internal gaps |
| `space-2` | 8px | Anchor-to-target clearance and control gaps |
| `space-4` | 16px | Viewport inset and standard surface padding |
| `space-6` | 24px | Large content separation only |
| `space-8` | 32px | Existing compact-control geometry |
| `space-12` | 48px | Fixture-level separation only |
| `space-16` | 64px | Existing rail top/bottom reserve |

Exceptions: none. One- and two-pixel strokes are geometry, not spacing tokens. Phase 53 must not add 2px, 6px, 10px, 12px, 14px, 20px, or 28px component gaps.

## Typography

Use exactly the four inherited sizes and two inherited weights.

| Role | Family | Size | Weight | Exact line height | Usage |
|------|--------|------|--------|-------------------|-------|
| Micro label | Instrument stack | 11px | 700 | 16px | Closed status/context label when required |
| Metadata | Instrument stack | 12px | 400 | 16px | Secondary ambient status and diagnostic reason in test/dev surfaces only |
| Body/control | System sans | 14px | 400 | 20px | Fail-quiet explanation and control labels |
| Title/emphasis | System sans | 16px | 700 | Existing Skopeo title only; Phase 53 creates no page heading |

Body copy stays sentence case. Micro labels may use uppercase and `letter-spacing: 0.08em`. No type is smaller than 11px, and no page-derived text is truncated into a plausible entity label.

## Color

### On-page 60/30/10 contract

| Share | Value | Usage |
|-------|-------|-------|
| Dominant 60% | `#0d0a09` (`--fsb-surface-ink`) | Existing ambient lens and rail backing |
| Secondary 30% | `#1a1513` (`--fsb-surface-elevated`, dark) | Existing neutral control well; `#26201d` may separate nested neutral areas |
| Accent 10% maximum | `#ff6b35` (`--fsb-primary`) | Existing active glyph/rail tick and one currently validated anchor mark |
| Destructive | `#dc2626` (`--fsb-danger`) | Not used by Phase 53; retained only as the inherited destructive token |

Text remains `#f6efe9` primary, `#d2c1b4` secondary, and `#a99283` muted. Default keylines remain `rgba(255, 241, 232, 0.18)`.

Accent is reserved for the active ambient glyph, current rail tick, visible `:focus-visible` outline on inherited controls, and one anchor mark with a current identity/geometry certificate. Uncertain, unsupported, withdrawn, resolving, or stale targets never retain a faded orange mark. Fail-quiet is neutral, not red or amber: inability to verify is not a host-page error or a danger claim.

All text and meaningful controls meet WCAG 2.2 AA contrast. Forced-colors mode uses `Canvas`, `CanvasText`, and `Highlight` under the inherited Phase 52 contract; the verified anchor becomes a solid 2px `Highlight` keyline with no glow.

## Visual State Contract

| Router/binding state | Visible projection | Prohibited projection |
|----------------------|--------------------|-----------------------|
| Recognized context, no requested target | Existing ambient lens and rail with a closed context-kind label | Anchor, chip, halo, ghost layer, focused card, gate, entity/page name |
| Recognized context, target resolving | Keep the recognized ambient projection; show no loading mark or placeholder | Skeleton, spinner over the host, guessed chip, retained prior annotation |
| Validated anchor bound | Ambient lens and rail plus exactly one shared 8×8px anchor mark beside the validated target | Entity chip, halo, ghost layer, focused card, gate, leader line, host-node decoration |
| Binding invalid or identity uncertain | Remove the mark synchronously; use the neutral fail-quiet target copy if resolution does not restore a valid binding in the same validation turn | Fade-out residue, mark at old coordinates, animation from old target to new target |
| Context uncertain | Ambient fail-quiet lens and optional inherited rail only | Every anchor-dependent primitive, context/entity label, focused state, gate |
| Context unsupported but session remains safe | Ambient fail-quiet lens and optional inherited rail only | Every anchor-dependent primitive, alarming error chrome, retry modal, gate |
| Restricted/unsafe page, hard navigation, toggle-off, or kill | Phase 52 terminal teardown to no in-page UI | Any fail-quiet shell retained past terminal authority |

### Closed recognized-context labels

Only the runtime-owned mapping below may reach visible copy:

| Context kind | Exact visible lens status | Polite announcement |
|--------------|---------------------------|---------------------|
| `configured-corpus` | `Skopeo · Corpus context` | `Skopeo verified the corpus context.` |
| `vendor-folder` | `Skopeo · Vendor folder` | `Skopeo verified the vendor folder context.` |
| `agreement-reading` | `Skopeo · Agreement view` | `Skopeo verified the agreement reading context.` |
| `focused-ask` | `Skopeo · Focused ask` | `Skopeo verified the focused ask context.` |

These labels state only the recognized context class. They do not state source access, enrollment, governing status, or agreement truth.

## Semantic Anchor Geometry

### Mark

- Reuse the shared Phase 52 anchor mark: an 8×8px visible square with a 2px keyline.
- The Phase 53 mark is pointer-transparent, non-focusable, and `aria-hidden="true"`; this phase has no anchor action to expose as a fake button.
- The ambient region and live region carry the equivalent screen-reader state. Later phases may pair the mark with an accessible entity chip only under a separate content contract.
- Maximum visible anchors in Phase 53: one per viewport and one per active semantic identity.
- Do not draw a leader line, outline the host node, change host classes/styles/attributes, or clone/reparent host content.

### Placement candidates

Given a freshly validated target rectangle, try these positions in order, each with 8px clearance: outside top-right, outside top-left, outside bottom-right, outside bottom-left. A candidate is valid only when its full 8×8px mark rectangle:

1. remains inside the viewport's 16px safe inset;
2. does not overlap the target, a required visible host control, the focused host element, or the scrollbar zone;
3. is derived from the same connected node or live `Range` that passed the semantic validator; and
4. still matches `{session generation, context epoch, semantic identity, binding epoch}` immediately before commit.

If no candidate is safe, withdraw and project `Skopeo can’t verify this target.` Do not cover a control or place the mark at a generic viewport edge.

### Movement and rebinding

- Safe geometry updates for the same live identity apply on the next owned validation frame with **0ms positional interpolation**. The mark tracks the newly certified rectangle; it never travels visibly across host content.
- A detached, recycled, semantically changed, or geometrically unsafe binding loses the mark immediately with no exit animation.
- A fresh binding may use the inherited 120ms opacity-only entry after final validation. It must not translate from the old coordinates.
- If a Drive row node changes from file A to file B, file A's mark disappears before any asynchronous lookup for file B begins.
- If the same node later returns to file A, that is a fresh binding with a fresh epoch; the old mark is never restored from node identity.
- Reorder, scroll, resize, zoom, and same-document navigation do not announce movement. They either produce a newly certified position or no mark.
- Under `prefers-reduced-motion: reduce`, fresh entry is also 0ms.

## Fail-Quiet Projection

Fail-quiet reuses the ambient lens and its existing close control. Preferred width is 320px and height remains 40px; use the inherited corner collision order and 16px viewport inset. At narrow widths, keep the exact status visible before optional shortcut metadata. If even the compact inherited lens cannot be placed safely, follow Phase 52's unsafe-layout behavior rather than covering a host control.

| State | Exact visible status | Exact polite announcement |
|-------|----------------------|---------------------------|
| Context evidence conflicts or is incomplete | `Skopeo can’t verify this context.` | `Skopeo can’t verify this context. The page was left unchanged.` |
| Context is outside the closed Drive/Docs set | `Skopeo doesn’t support this context.` | `Skopeo doesn’t support this context. The page was left unchanged.` |
| Target identity or geometry cannot be certified | `Skopeo can’t verify this target.` | `Skopeo removed the annotation because it could not verify the target.` |
| Recognized context has no requested annotation | `No verified target requested` | `Skopeo is staying ambient because no verified target was requested.` |

The machine-readable reason code remains a closed runtime/model field. It may be mirrored to a shell-owned test hook, but it is never expanded from page data and is not shown as raw technical copy to the user. The UI must not interpolate a Drive name, document title, clause text, URL fragment, selector, attribute value, or semantic ID into these messages.

Fail-quiet has no retry button, focus move, alert dialog, countdown, spinner, halo, warning color, or gate. A later validated route change may replace it automatically inside the already active generation; the user may also dismiss or explicitly reinvoke Skopeo through the inherited controls.

## Copywriting Contract

Use sentence case and contractions. Do not use `Unknown`, `Error`, `Not found`, `Loading`, `Trust me`, `Continue`, `OK`, or copy that asks the user to verify an entity Skopeo has already guessed.

| Element | Exact copy |
|---------|------------|
| Inherited primary CTA | `Turn on Skopeo` |
| Recognized context, no target | `No verified target requested` |
| Empty-state explanation | `Skopeo is staying ambient because no verified target was requested.` |
| Uncertain-context state | `Skopeo can’t verify this context.` |
| Unsupported-context state | `Skopeo doesn’t support this context.` |
| Withdrawn-target state | `Skopeo can’t verify this target.` |
| Inherited close action | `Turn off Skopeo` |
| Destructive confirmation | None; Phase 53 has no destructive action, and universal kill remains immediate |

## Interaction, Focus, and Accessibility

1. Recognized, resolving, anchored, withdrawn, uncertain, and unsupported transitions never move page focus.
2. The Phase 53 mark is not a pointer target and adds no Tab stop. The host row, document editor, menus, selection, scrolling, and native keyboard behavior remain unchanged.
3. The single inherited ambient close control remains named `Turn off Skopeo` and is the only page-HUD control Phase 53 needs.
4. The existing ambient container remains `role="region"`; use `Skopeo ambient HUD` when no mark is bound and `Skopeo anchored HUD` while the mark is currently certified.
5. Use the one inherited `aria-live="polite"`, `aria-atomic="true"` node. Announce at most one final semantic state per context epoch or binding-state transition, never mutation batches, scroll, resize, zoom, locator attempts, or successful same-identity repositioning.
6. Visual withdrawal is synchronous even when an announcement is coalesced. If a mark is invalidated and rebound successfully within the same owned validation turn, announce neither the transient absence nor the rebind.
7. Hidden or withdrawn anchor nodes are removed from rendering and the accessibility tree; opacity alone is not withdrawal.
8. Fail-quiet copy is a status, not an alert. Do not use `role="alert"`, `alertdialog`, `aria-modal`, focus trapping, or assertive announcements.
9. Forced colors preserves the mark through the declared `Highlight` keyline. Color is not the only signal: the ambient status text and region name state whether the context is anchored.
10. At 200% zoom and below 480 CSS px, the inherited compact-lens rules apply. The mark is either fully within the safe inset beside a validated target or absent.

## Host Integrity and Teardown

- The one fixed Shadow envelope stays `pointer-events: none`; only the inherited visible close control opts into pointer input.
- Phase 53 may read bounded rectangles and validated identity signals. It may not alter host styles, classes, attributes, accessibility state, layout, focus, selection, scroll position, or event propagation.
- Observer, navigation, resize, zoom, scheduled-frame, and resolver ownership must join the active Phase 52 lifecycle/resource certificate. Toggle-off, kill, hard navigation, replacement generation, and unsafe-page transition remove the mark, live copy, observers, pending frames, and root under the existing abort-first contract.
- Same-document Drive/Docs route changes withdraw the current mark before projecting the new route. They do not create a new shell or automatically invoke Skopeo.
- Late results that do not match the current generation, context epoch, semantic identity, and binding epoch have no visual or accessibility side effect.
- There is no success toast, off badge, stale target ghost, last-known-position placeholder, or fail-quiet page UI after terminal teardown.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | None | Not applicable; this is not a React stack |
| Third-party registries | None | No registry, package, block, remote font, or page asset may be added |

## Acceptance and Visual QA Checkpoints

### Context and fail quiet

- [ ] Each recognized context kind shows only its exact closed label and never a host-derived name.
- [ ] Conflicting/absent evidence shows the exact uncertain copy, zero anchor-dependent primitives, no focus change, and no gate.
- [ ] Unsupported Drive/Docs routes and near-neighbor origins show the exact unsupported copy or terminally tear down according to page safety; they never flash an anchor.
- [ ] Reason codes are machine-readable for diagnostics/tests while page strings and stable IDs never leak into user copy or logs.

### Anchor correctness

- [ ] A certified target shows one 8×8px mark at an allowed 8px-clearance position and no chip, halo, ghost layer, focused card, leader line, or gate.
- [ ] Recycling a row from file A to file B removes A's mark before B resolution; reversed late work cannot restore it.
- [ ] Detach, reorder, ABA reuse, SPA navigation, scroll, zoom, and resize either yield a fresh matching certificate or immediate absence—never a mark on an unverified target.
- [ ] Rebinding never animates the mark across the page. Same-identity geometry updates and invalidation use no positional interpolation.

### Accessibility and coexistence

- [ ] Drive row selection/open, menus, scrollbars, and Docs editing/selection remain usable with no added Tab stop or broad event suppression.
- [ ] VoiceOver announces recognized/fail-quiet semantic changes once, not geometry churn; withdrawn marks disappear from both rendering and accessibility state.
- [ ] Reduced motion has no anchor entry animation; forced colors retains mark and status meaning without glow.
- [ ] At 200% zoom and narrow viewports, the lens remains safely placed and the mark is either fully certified and visible or absent.

### Teardown

- [ ] Close, kill, hard navigation, and replacement remove all Phase 53 UI and owned resources; repeated teardown is visually idempotent.
- [ ] A stale resolver, observer callback, or scheduled frame cannot repaint after the generation or context epoch changes.
- [ ] No host class, style, attribute, accessibility property, scroll position, selection, or focus state differs after teardown.

## Traceability

| Source | UI contract coverage |
|--------|----------------------|
| HUD-06 | Visual State Contract; Fail-Quiet Projection; Copywriting; Accessibility; context QA |
| HUD-09 | Semantic Anchor Geometry; Movement and Rebinding; Host Integrity; anchor QA |
| D-01–D-04 | Closed visible context mapping and explicit non-authority boundary |
| D-05–D-08 | Pointer-transparent semantic mark, fresh identity/geometry certificate, no text inference |
| D-09–D-13 | Commit tuple, withdraw-first transitions, same-document versus terminal behavior |
| D-14–D-16 | Zero dependent primitives, concise neutral ambient copy, no gate or focus theft |
| Phase 52 UI-SPEC | Reused shell, tokens, spacing, type, color, focus, collision, accessibility, and teardown |

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-07-15
