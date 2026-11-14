---
phase: 57
slug: folder-reading-hud
status: approved
shadcn_initialized: false
preset: none
created: 2026-08-06
reviewed_at: 2026-08-11T19:32:07Z
---

# Phase 57 — UI Design Contract

> Visual and interaction contract for trusted vendor-folder and agreement-reading projections inside the explicitly invoked Skopeo HUD.

---

## Contract Intent and Boundary

Phase 57 turns current permission-scoped corpus, graph, and governing-truth outputs into two sparse Drive/Docs overlays:

1. a bounded vendor-folder overview with next material dates, urgent gaps, and one complete status card per projected vendor; and
2. an agreement-reading view with an unmistakable governing, historical, superseded, partially governing, or non-definitive state, exact cited facts, and a freshly authorized route to governing evidence.

The host remains the work surface. Phase 57 extends the existing Skopeo `rail` inside the one Shadow DOM shell; it does not build a dashboard, decorate virtualized Drive rows, alter document text, or create another runtime. Folder and reading views enter at Anchored attention only after explicit invocation and exact semantic-context admission. They do not use a ghost layer, halo, Focused card, or Interstitial gate.

Presentation never adjudicates truth. Background projection supplies closed semantic states, typed civil dates, consequences, bounded display text, citation labels, and opaque one-shot action identities. Content maps those closed values to literal copy and closed atoms. It never infers status from a filename, folder order, page label, visible text, URL, color, or apparent recency.

The only new evidence action is `citation-open`, presented as `Open governing clause`, `Open governing document`, or a fact-specific `Open source for {fact}`. Ask, search, draft, send, approve, Document 10 decisions, memo-obligation decisions, and notification delivery controls are absent until Phases 58–59.

## Sources and Decision Status

| Source | Decisions carried into this contract |
|--------|--------------------------------------|
| `57-CONTEXT.md` | Background-owned projection; exact display/citation authority; one composite right-side folder HUD; vendor fields; unmistakable reading states; typed dates; evidence-only gaps; neutral later-phase slots; no row badges or later-phase controls |
| `57-RESEARCH.md` | Existing shell/composer seams; 280px region is too narrow; closed folder/reading models; explicit exact-set overflow; current evaluation blockers; opaque citation navigation; accessibility and teardown test needs |
| `.planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md` | VIEW-01 through VIEW-05 and the adjacent Phase 58–59 ownership boundaries |
| Phase 52 approved UI contract | One shell, six primitives, four attention levels, tokens, 16px safe inset, 8px host-control clearance, focus, motion, contrast, collision, and zero-residue teardown |
| Phase 53 and 53.1 approved UI contracts | Exact semantic binding, withdraw-first behavior, closed atoms, app-native copy, one adaptive composer, and no guessed identity/action/readiness |
| Canvas 4 local reference | Approved subset only: right-side overview, `Next material dates`, `Urgent gaps`, prominent superseded state, exact-fact rail, and direct governing-source route |
| Researcher defaults | Exact rail geometry, pagination, density, state copy, ordering, fact limits, and responsive composition where upstream artifacts granted discretion |

The canvas reference's per-row badges, timeline strip, ask box, draft action, owner-notification claim, policy decision, memo requirement, inline document highlight, and host-brand styling are explicitly not adopted.

---

## Design System

| Property | Contract |
|----------|----------|
| Tool | Existing Skopeo Shadow DOM shell, FSB CSS tokens, and classic/direct JavaScript |
| Preset | Not applicable |
| Component library | None |
| Icon library | Existing CSS geometry or text glyphs only; no page-level icon dependency |
| Body font | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif` |
| Instrument font | `"Space Mono", "SF Mono", Monaco, Consolas, monospace`, using the bundled Space Mono assets |
| Styling boundary | The existing single dynamically injected Skopeo Shadow DOM shell |
| Runtime | Manifest V3 Chrome extension, classic JavaScript; no React, Next.js, Vite, JSX, Tailwind, or component framework |

Phase 57 extends the existing corpus region through a versioned contract-view model with exactly three modes: `folder`, `reading`, and `contract-closed`. It reuses the closed `section-heading`, `status-row`, `fact-list`, `item-list`, `timeline`, and `notice` semantics. A dedicated vendor-card DOM structure is permitted inside the shell, but it consumes only the validated contract-view model and uses the tokens below.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | None | Not applicable; repository inspection on 2026-08-06 confirmed this is not a React stack and has no `components.json` |
| Third-party registries | None | No registry, package, block, remote font, icon set, CDN, or remote UI asset is permitted |

No shadcn initialization is required. Phase 57 adds no design-system dependency and imports no asset from the canvas reference.

---

## Spacing Scale

These inherited values are the only spacing tokens permitted in new Phase 57 UI.

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Label/value gaps, compact metadata gaps, card sub-row gaps |
| `space-2` | 8px | Row padding, control gaps, date/gap item spacing |
| `space-4` | 16px | Rail padding, viewport inset, section separation |
| `space-6` | 24px | Major content-to-action separation |
| `space-8` | 32px | Major internal separation and compact-control geometry |
| `space-12` | 48px | Maximum short leader/fixture separation only |
| `space-16` | 64px | Lens-to-rail reserve and viewport top/bottom reserve |

Exceptions: none. One- and two-pixel borders, outlines, and keylines plus component width/height measurements are geometry, not spacing tokens. The inherited lens close remains a 32px compact control; every Phase 57 rail, paging, and evidence action is at least 40px high.

---

## Typography

Use exactly these four sizes and two weights. Vendor labels, states, civil dates, consequences, facts, citations, and controls cannot introduce another size or weight.

| Role | Family | Size | Weight | Exact line height | Usage |
|------|--------|------|--------|-------------------|-------|
| Micro label | Instrument mono | 11px | 700 | 16px | Uppercase section eyebrows, date types, governing-state labels |
| Metadata | Instrument mono | 12px | 400 | 16px | Civil dates, counts, source/citation labels, trust and overflow states |
| Body/control | System sans | 14px | 400 | 20px | Vendor values, consequences, gaps, facts, explanations, buttons |
| Title/emphasis | System sans | 16px | 700 | 24px | Rail title, vendor name, reading-state summary |

Micro labels may use uppercase with `letter-spacing: 0.08em`. All other copy is sentence case. Dates are never shown only in 11px micro text. Secondary metadata may truncate visually only when the complete bounded value remains available in its accessible description; vendor names, date types, primary dates, gaps, and action labels wrap instead of truncating.

---

## Color

### Skopeo-owned 60/30/10 contract

| Share | Value | Usage |
|-------|-------|-------|
| Dominant 60% | `#0d0a09` | Contract rail and reading-banner base |
| Secondary 30% | `#1a1513`; nested neutral `#26201d` | Summary groups, vendor cards, fact rows, neutral control wells |
| Accent 10% maximum | `#ff6b35` | Current signals and the specifically reserved elements below |
| Destructive/error | `#dc2626`; readable dark-surface text `#fca5a5` | True technical errors or inherited destructive semantics only; Phase 57 defines no destructive action |

Primary text is `#f6efe9`, secondary text `#d2c1b4`, muted metadata `#a99283`, default keyline `rgba(255, 241, 232, 0.18)`, subtle separator `rgba(255, 241, 232, 0.10)`, and shadow `rgba(0, 0, 0, 0.38)`.

Accent is reserved for:

1. the active Skopeo glyph and current rail tick;
2. the visible `:focus-visible` outline;
3. the first accepted upcoming material date in the folder summary;
4. one reading-state keyline when the current document is historical, superseded, partially governing, or review-required;
5. the one primary `Open governing clause` or `Open governing document` action;
6. an existing verified semantic anchor mark, when retained by the Phase 53 binding contract.

Orange is not used for every date, gap, status, vendor, citation, neutral action, or decorative separator. Red is not used for missing evidence, review-required truth, historical state, unreadable scans, or ordinary gaps; those states use explicit text and neutral geometry. No green success color is introduced. Every semantic state remains understandable in monochrome and forced colors.

Orange-filled actions use `#0d0a09` text. All text and meaningful geometry meet WCAG 2.2 AA contrast. Under forced colors, surfaces use `Canvas`/`CanvasText`, controls use `ButtonFace`/`ButtonText`, and current/focus/keyline signals use `Highlight` while all state words remain visible.

---

## Attention and Visual Hierarchy

| Admitted condition | Attention | Focal point | Prohibited |
|--------------------|-----------|-------------|------------|
| Verified enrolled Drive root/folder with current projection | Anchored | Next material date or the first explicit blocker, then vendor overview | Row badges, halo, ghost, focused card, gate, host layout change |
| Verified Drive file/Docs document with current projection | Anchored | Sticky reading-state banner, then governing facts | Host-text highlight, detached reader, ghost, gate, automatic focus |
| Verified semantic context while truth is loading/recomputing | Anchored neutral status | `Checking current vendor state…` or `Checking governing evidence…` | Retained old facts, spinner promise, inferred interim state |
| Exact context but closed/incomplete projection | Anchored neutral blocker | Specific blocker and recovery path | Partial truth presented as complete, disabled fake actions |
| Context/identity no longer exact | Ambient fail-quiet or terminal teardown | Existing Phase 53 fail-quiet state | Any folder/reading data, stale banner, stale action |

The folder view's first focal point is the earliest accepted material date only when the exact truth set is current. If truth is over cap, stale, incomplete, or lacks an evaluation context, the explicit blocker becomes the focal point and all governing/date values read `Not evaluated`.

The reading banner is always the first item in reading mode and remains visible at the top of the rail while its fact body scrolls. Color never determines whether a document governs; the state label and full explanatory sentence do.

---

## Shared Contract Rail Geometry

| Property | Exact contract |
|----------|----------------|
| Desktop width | 384px |
| Viewport inset | 16px from the right edge |
| Vertical reserve | 64px from the top and bottom, yielding an 8px gap from a 40px lens placed at a 16px edge inset |
| Maximum height | `calc(100dvh - 128px)` |
| Internal padding | 16px |
| Surface radius | 12px |
| Card radius | 12px |
| Surface/card keyline | 1px neutral keyline; reading-state emphasis may add one 2px left keyline |
| Overflow | Vertical scrolling inside the visible rail; `overscroll-behavior: contain`; no horizontal scrolling |
| Pointer behavior | Shell/envelope remains pointer-transparent; the visible rail accepts pointer input only within its painted bounds so wheel/touch scroll and controls work |
| Host clearance | Entire composite rectangle must remain 8px clear of required visible host controls, focused host element, and scrollbar zone |

The composite rail receives its own geometry certificate immediately before commit and after resize/zoom. It does not merely inherit a safe lens rectangle. At CSS widths of 480px or more, it stays on the right; Phase 57 does not mirror it to the left. If the right-side rail cannot be placed safely, no partial contract rail renders and the trusted side-panel state says `Skopeo can’t open the contract view safely on this layout.`

At widths below 480px, the rail uses `left: 16px; right: 16px; width: auto`, retains the 64px top/bottom reserve, and converts every multi-column row to a single-column label/value stack. At 200% zoom the effective CSS-width rule applies. Font sizes remain unchanged and browser zoom performs enlargement.

The rail never reserves host layout space, moves the Drive file list or Docs canvas, covers the viewport scrollbar, or creates a second side panel. No detached bottom timeline is introduced.

---

## Folder HUD Contract

### Anatomy and order

The folder rail uses this fixed order:

1. sticky header: `Vendor agreements`, completeness metadata, and `Hide contract view`;
2. blocker notice when exact governance/date evaluation is unavailable;
3. `Next material dates` summary;
4. `Urgent gaps` summary;
5. `Vendors` list;
6. local vendor-page controls when more than eight projected vendors exist;
7. explicit projection/overflow note.

No section is reordered by host content. `Next material dates` and `Urgent gaps` may collapse to one exact empty/not-evaluated row, but their headings remain present so absence, uncertainty, and later-owned statuses are not conflated.

### Bounded density

| Item | Display cap | Overflow treatment |
|------|-------------|--------------------|
| Projected vendor summaries | 32 | State `Showing 32 of {N} accessible vendors. {N-32} additional vendors are outside this bounded view.`; governance/date coverage is `Not evaluated` when exact truth is over cap |
| Vendors per local page | 8 | `Previous vendors`, `Page {X} of {Y}`, `Next vendors`; paging is local, ephemeral, and never calls background authority |
| Next material dates summary | 3 | `+{N} more material dates appear in vendor rows` |
| Urgent gaps summary | 4 | `+{N} more gaps appear in vendor rows` |
| Gaps in one vendor card | 3 | `+{N} more gaps` inside that card |

Projection replacement resets local paging to page 1. Page controls are native 40px-high buttons, use neutral styling, preserve focus on activation, and update the existing polite live region once. At the first/last page, the unavailable direction is omitted rather than rendered as an action-like disabled button.

### Vendor card

Each vendor is a non-interactive list item with this fixed content:

| Order | Label | Required value behavior |
|-------|-------|-------------------------|
| 1 | Vendor | Bounded current folder label plus full-word governing status |
| 2 | Owner | Current accepted owner label, `Owner not assigned` only when complete evidence proves absence, otherwise `Not evaluated` |
| 3 | Documents and index | Exact authorized source counts and index state; unreadable, pending, download-blocked, inaccessible, and incomplete remain distinct |
| 4 | Governing status | `Governing`, `Partially governing`, `Review required`, or `Not evaluated`; never derive from filenames or row order |
| 5 | Next material date | Explicit type plus exact civil date; `Not evaluated` when comparison is not authorized |
| 6 | Consequence if no action | Separate truth-backed sentence or `Consequence not evaluated`; never merge it into the date label |
| 7 | Memo evidence | `Memo on file` only when current relation evidence proves presence; otherwise `Memo evidence not evaluated` |
| 8 | Policy document | `Policy document on file`, authoritatively proven `Policy document missing`, or `Policy document not evaluated` |
| 9 | Memo requirement | `Not evaluated`; Phase 57 never claims a memo is required or missing-required |
| 10 | Notification delivery | `Not available`; Phase 57 never claims scheduled, delivered, or failed |
| 11 | Urgent gaps | Up to three exact closed labels plus explicit overflow; if complete and none, `No urgent gaps proven`; if incomplete, `Urgent gaps not evaluated` |

Vendor cards use a 16px title line, then a compact definition-list grid with 14px values, 12px metadata, 4px row gaps, 8px internal row padding where a keyline is needed, and 16px between cards. Card height is content-driven; no value is hidden to force a uniform height.

Vendor order is deterministic and projector-owned:

1. current `Review required` or at least one confirmed urgent gap;
2. remaining vendors with an accepted future material date, earliest date first;
3. remaining vendors by normalized display label;
4. stable opaque identity as a non-visible tie-breaker.

The renderer does not resort from visible strings.

### Next material dates

Each timeline row contains, in order:

1. date type in 11px instrument text;
2. exact civil date as `<time datetime="YYYY-MM-DD">{MMM D, YYYY}</time>` in 12px instrument text;
3. vendor label in 14px text;
4. a separate `If no action` line with the evidence-backed consequence;
5. trust/currentness text when not fully accepted.

The projector supplies civil components and formatted display text; content does not call `Date.parse`, apply browser locale/timezone, or derive relative days. Relative copy such as `20 days` may appear only as secondary trusted metadata beside the exact date. Sorting is civil date ascending, then `Notice deadline`, `Termination`, `Expiration`, `Renewal`, then vendor identity. The type is never replaced by a generic `Deadline` label.

### Urgent gaps

Only an upstream authoritative priority may place a gap in `Urgent gaps`. Missing data is not automatically urgent. The summary uses full labels and vendor names, no symbol-only warnings. When the relevant set is complete and no urgent gap is proven, show `No urgent gaps proven.` When the set is incomplete, show `Urgent gaps not evaluated.` Never show `All clear`.

---

## Reading HUD Contract

### Sticky state banner

The reading rail begins with a sticky banner that contains:

1. one closed 11px state label;
2. a 16px document/state title;
3. one complete 14px explanation naming what the current document does or does not govern;
4. the primary governing-source action only when a current action token exists;
5. current-source/access metadata in 12px instrument text.

The banner uses neutral surface colors. Historical, superseded, partially governing, and review-required states receive one orange 2px left keyline; governing and not-evaluated states use the neutral keyline. No state uses a green check, red warning fill, opacity-only distinction, or icon-only meaning.

### Reading-state copy

| Semantic state | Visible label | Exact explanation template |
|----------------|---------------|----------------------------|
| `governing` | `Governing` | `This document governs the facts shown below.` |
| `partially-governing` | `Partially governing` | `This document governs only the cited clauses. Other terms come from the governing sources named below.` |
| `historical` | `Historical` | `This document is relevant history. It does not govern the facts shown below.` |
| `superseded` | `Superseded` | `This document has been superseded. It does not govern the facts shown below.` |
| `review-required` | `Review required` | `Skopeo can’t determine what governs. Review the cited conflict before acting.` |
| `not-evaluated` | `Not evaluated` | `Governing status isn’t available from the current complete evidence.` |
| `access-unavailable` | `Access unavailable` | `Skopeo can’t confirm this document under the current Drive access.` |

For historical and superseded states, the banner must show `Open governing clause` or `Open governing document` whenever a current accepted governing route exists. If no route is authorized, it shows the explicit status `Governing source not available` as text, not a disabled button.

### Reading body

Use this fixed order after the banner:

1. `Governing facts`;
2. `Relevant history`, only when at least one current cited historical fact exists;
3. `Conflicts and gaps`;
4. `Policy and delivery status` with the three reserved later-phase slots;
5. explicit fact/gap overflow note.

The reading projection displays at most 10 exact facts and 6 conflicts/gaps. Overflow is explicit as `+{N} cited facts not shown` or `+{N} conflicts or gaps not shown`; no truncated prefix may be described as complete.

Each fact row contains:

- a closed fact label such as `Signed`, `Effective`, `Notice window`, `Notice deadline`, `Renewal`, `Termination`, `Expiration`, `Delivery method`, or `Written notice address`;
- the exact bounded display value;
- `Governing evidence` or `Relevant history` in text;
- a full-word trust state: `Accepted`, `Extracted`, `Inferred`, `Ambiguous`, `Unreadable`, or `Review required`;
- a bounded source/citation label, including page/section or UTF-8 byte range when that is the only exact locator;
- a neutral native button `Open source for {fact label}` only when its current opaque `citation-open` action exists.

Facts are ordered by the closed sequence above, not by source filename or DOM position. A fact sourced from another governing document is labelled with that document's bounded source label. The currently open historical document never becomes the apparent source of governing facts.

Citation controls use neutral styling; only the banner's primary governing-source action may use orange fill. A UTF-8 byte range is displayed literally as citation location metadata and never converted into a fabricated Docs heading/bookmark.

### Source-opening behavior

`Open governing clause`, `Open governing document`, and `Open source for {fact}` are the same closed action kind. On activation:

1. disable only the activated control and set its local status to `Opening governing source…`;
2. revalidate the exact current controller/entity/projection/action authority in background;
3. resolve current access, source revision, and a Google Drive/Docs allowlisted destination;
4. open the exact source in a new foreground tab; do not replace or mutate the current host document;
5. do not activate Skopeo automatically in the new tab;
6. consume the one-shot token only after the current effect commits;
7. re-enable an equivalent control only after a fresh current projection issues a new token.

The content model never receives a URL, Drive file ID, source ID, resource key, storage key, account ID, raw citation registry entry, or tab authority. Modifier-click, context-menu URL copying, drag, and link previews are unavailable because these are native buttons backed by opaque actions, not page-provided anchors.

If fresh authorization fails, keep the current document unchanged and show `Skopeo couldn’t open the governing source. Reopen this contract view and try again.` Raw exception, source identity, and access detail are never shown.

---

## Date and Gap Language

### Date types

| Closed type | Exact visible label | Never substitute |
|-------------|---------------------|------------------|
| `notice-deadline` | `Notice deadline` | Renewal or expiration |
| `renewal` | `Renewal` | Notice deadline |
| `termination` | `Termination` | Expiration |
| `expiration` | `Expiration` | Termination or renewal |

`If no action` is always a separate labelled line. Auto-renewal may be stated only when current accepted evidence supplies that consequence. A missing notice deadline never causes renewal or expiration to be promoted as a notice deadline.

### Gap/result mapping

| Closed result | Exact visible copy | Admission rule |
|---------------|--------------------|----------------|
| `missing-final` | `Final agreement missing` | Complete authoritative proof only |
| `unreadable-scan` | `Scan unreadable` | Current source state only |
| `incomplete-indexing` | `Index incomplete` | Current source/graph blocker only |
| `owner-gap` | `Owner not assigned` | Complete owner relation set only |
| `version-conflict` | `Agreement version conflict — review required` | Current truth conflict/review state only |
| `policy-document-missing` | `Policy document missing` | Exact configured identity plus complete evidence only |
| memo evidence present | `Memo on file` | Current graph relation proves presence; does not prove requirement |
| memo requirement unavailable | `Memo requirement — Not evaluated` | Mandatory neutral Phase 57 slot |
| notification result unavailable | `Notification delivery — Not available` | Mandatory neutral Phase 57 slot |
| `pending` | `Pending` | Current upstream state |
| `download-blocked` | `Download blocked` | Current source state |
| `inaccessible` | `Access unavailable` | Current authorization state; do not leak hidden identity |
| `ambiguous` | `Evidence ambiguous` | Current truth state |
| `not-evaluated` | `Not evaluated` | Missing complete/current authority or later-phase owner |

Visible copy never exposes raw enum/reason codes. `Missing`, `Not evaluated`, `Not available`, `Pending`, `Access unavailable`, `Unreadable`, and `Review required` remain distinct and are never collapsed into `Unknown` or a generic warning icon.

---

## Copywriting Contract

### Required exact copy

| Element | Exact copy or closed template |
|---------|-------------------------------|
| Folder title | `Vendor agreements` |
| Reading title | `Agreement reading` |
| Primary CTA with stable clause locator | `Open governing clause` |
| Primary CTA without stable clause locator | `Open governing document` |
| Fact citation action | `Open source for {fact label}` |
| Folder empty heading | `No vendor agreements to show` |
| Folder empty body | `Skopeo found no accessible vendor folders in the complete enrolled corpus. Check the Drive folder or turn off Skopeo.` |
| Reading empty heading | `No cited facts available` |
| Reading empty body | `Skopeo found no exact facts it can support from the current accessible evidence.` |
| Folder loading | `Checking current vendor state…` |
| Reading loading | `Checking governing evidence…` |
| General closed error | `Skopeo can’t verify this contract view. Reopen the folder or document and invoke Skopeo again.` |
| Exact-set overflow heading | `Some sources aren’t evaluated` |
| Exact-set overflow body | `The exact source set exceeds this view’s limit. Vendor source status may be partial; governing and date conclusions are not evaluated.` |
| Missing evaluation context heading | `Dates aren’t evaluated` |
| Missing evaluation context body | `Skopeo needs the configured governing date context before it can compare material dates.` |
| Hide rail | `Hide contract view` |
| Reopen rail | `Open contract view` |
| Turn off | `Turn off Skopeo in this tab` |
| Destructive confirmation | None; Phase 57 has no destructive action |

The folder empty state is legal only after a complete authoritative zero-vendor result. If current access, manifest completeness, truth, or evaluation context is unavailable, show the typed blocker instead of empty copy.

Action labels always use a specific verb and noun. `Open`, `OK`, `Continue`, `Go`, `Submit`, `Run`, `View`, bare `Retry`, and `Click here` are prohibited as standalone labels. No copy claims that owners were pinged, notifications were delivered, a memo is required, or a policy decision is cleared.

---

## Interaction and State Transitions

```text
OFF
  └─ explicit current-tab invoke → STARTING
       ├─ verified enrolled folder + current projection → ANCHORED FOLDER
       ├─ verified agreement + current projection → ANCHORED READING
       ├─ verified context + unavailable truth → ANCHORED CLOSED/BLOCKER
       └─ uncertain/unsupported/unsafe → inherited AMBIENT fail-quiet or OFF

ANCHORED FOLDER
  ├─ local Previous/Next vendors → same projection, same authority
  ├─ Hide contract view / Escape → AMBIENT lens
  └─ context/projection drift → withdraw first → neutral pending/new state

ANCHORED READING
  ├─ citation-open → fresh background authorization → new foreground source tab / typed failure
  ├─ Hide contract view / Escape → AMBIENT lens
  └─ context/projection drift → withdraw first → neutral pending/new state

ANY ACTIVE
  └─ Turn off or inherited Escape Escape → OFF with exact teardown
```

- Folder/reading projection is requested only inside the current explicitly invoked generation. Navigation never starts Skopeo.
- Recompute/loading withdraws all previous contract facts, dates, gaps, actions, and announcements before showing neutral pending copy.
- Same-document navigation may retain the shell only after a new context epoch commits. It never retains the old rail data as a placeholder.
- Folder paging changes presentation only. It cannot recompute truth, open a source, change authority, or persist across projection replacement.
- No action fires on mount, focus, hover, scroll, vendor-page change, navigation, or source-state update.
- Phase 57 never enters Focused or Interstitial and never opens a consequence gate.

---

## Motion and Feedback

| Transition | Timing |
|------------|--------|
| Fresh folder/reading rail entry | 120ms ease-out opacity plus at most 4px translation |
| Local vendor-page change | Immediate content replacement; no slide/carousel motion |
| Reading-banner/state replacement | Immediate after withdraw-first commit; one polite announcement |
| Collision reposition after certified resize | 120ms ease-out |
| Close, kill, navigation, permission withdrawal, stale replacement | Synchronous removal; no exit animation |
| Loading | Static text; no indefinite spinner, shimmer, pulse, or time promise |
| Live announcements | One meaningful update per 500ms except terminal/error events |

Under `prefers-reduced-motion: reduce`, all durations are 0ms. Motion never expresses trust, urgency, governing status, date type, completeness, or success.

---

## Keyboard, Focus, and Accessibility

### Focus policy

- Folder and reading entry never move host-page focus.
- The scrollable contract region uses `role="region"` and `tabindex="0"` with a visible 2px focus outline; its accessible name identifies the current mode.
- Within the folder rail, source order is the region entry, `Hide contract view`, then local page controls when present. Existing lens controls retain their inherited shell order.
- Within the reading rail, source order is the region entry, `Hide contract view`, the primary governing-source action when present, then fact citation controls in fact order. Existing lens controls retain their inherited shell order.
- Activating local paging keeps focus on the same-direction paging control when it remains present and announces `Vendor page {X} of {Y}.` once.
- Activating a citation button marks only that control busy/disabled until commit or typed failure. It never traps focus.
- Hiding the rail restores focus to the current lens control with `focus({preventScroll: true})` when still current. Terminal teardown uses the inherited safe restoration contract and never forces focus to `body` or a guessed host node.
- A projection withdrawal while the rail has focus moves focus to the current ambient lens only after the old rail is removed; if terminal authority is gone, teardown follows the inherited restoration path.

### Roles and names

| Surface | Semantic contract |
|---------|-------------------|
| Folder rail | `role="region"`, name `Skopeo vendor agreements`; one `h2`, labelled `h3` sections, vendor `ul`, vendor `li`, and definition lists for field/value pairs |
| Reading rail | `role="region"`, name `Skopeo agreement reading`; one `h2`, sticky state `status`, labelled fact/gap sections |
| Material date | `<time datetime="YYYY-MM-DD">` plus an adjacent full date-type label |
| State banner | `role="status"`, polite; not `alert` or `alertdialog` |
| Gap/status rows | Static text; not focusable and never implemented as disabled buttons |
| Primary/source action | Native button with its exact specific label; no raw URL anchor |
| Vendor paging | Native buttons plus text `Page {X} of {Y}` |
| Live region | Existing single atomic polite shell live region; no per-card/per-fact live regions |

Status is never conveyed by hue, glyph, placement, or punctuation alone. Screen-reader output includes the date type before the date, `If no action` before the consequence, and `Governing evidence`/`Relevant history` before the citation source.

Under forced colors, sticky/keyline distinctions remain 1px/2px system borders and all states retain their full text. At 200% zoom and below 480px, every label/value stack, action, and overflow statement remains reachable with no Skopeo-caused horizontal page scroll.

---

## Host Integrity, Trust, and Failure States

1. Render inside the existing one Shadow root. Do not add a host node per vendor or source.
2. Do not decorate Drive rows, modify Docs text, highlight a clause, add a bottom timeline, mutate host selection, or attach to recycled row position.
3. Render all vendor, owner, source, fact, consequence, and citation labels through `textContent`; no `innerHTML`, Markdown execution, SVG string, remote image, iframe, or page node.
4. The visible model contains no tab ID, account/corpus/root/file/source/graph/truth/storage ID, URL, resource key, provider data, source excerpt beyond bounded accepted display text, or background facade.
5. Every render rechecks generation, exact origin, profile version, context epoch, semantic entity token, projection token, and currentness immediately before DOM commit.
6. Every citation-open rechecks the same authority plus current source access/revision immediately before the tab effect.
7. Over-cap truth never yields a partial governing/date conclusion. Manifest-certified vendor/source rows may remain only with explicit partial/overflow language and `Not evaluated` truth fields.
8. Inaccessible identities not currently authorized are omitted without names or counts that disclose their existence.
9. Host controls under the proposed rail rectangle make that placement invalid. The rail never covers a control to satisfy the right-side preference.
10. Close, kill, hard navigation, identity drift, source withdrawal, projection replacement, and shell disposal synchronously remove the rail, actions, listeners, focus hooks, and announcements through the existing eleven-category resource certificate.

### Failure-state hierarchy

| Failure | Visible result | Required guarantee |
|---------|----------------|--------------------|
| Truth recompute/current generation absent | Neutral mode-specific loading, then typed blocker | No old governing/date/fact state remains |
| Evaluation context missing | `Dates aren’t evaluated` notice; date/consequence fields `Not evaluated` | No browser-timezone fallback |
| Exact set over cap | Explicit partial/overflow notice | No truth prefix presented as complete |
| Current source unreadable/download-blocked | Exact first-class gap/status | No inferred text/fact/status |
| Conflicting/ambiguous lineage | Prominent `Review required` reading state | No governing label or source action without accepted path |
| Current access fails | `Access unavailable` or complete rail withdrawal according to disclosure boundary | No hidden identity/source leak |
| Stale response/context drift | Immediate rail withdrawal | No stale repaint or announcement |
| Citation action stale/replayed/revoked | Exact source-open failure copy | No tab effect and no URL/ID returned to content |
| Unsafe composite geometry | Trusted side-panel unsafe-layout copy; no rail | No host-control obstruction or partial shell |

---

## Verification and Visual QA Contract

### Canonical automated/snapshot states

Record Skopeo-owned output at normal width, below 480 CSS px, 200% zoom, reduced motion, high contrast, and forced colors for:

1. complete folder view with two vendors, all required fields, one notice deadline, and one proven urgent gap;
2. 14-vendor folder view with two local pages and deterministic order;
3. exact 32-vendor cap and 33-vendor overflow;
4. exact source-set over-cap view where manifest status remains but every governance/date conclusion is `Not evaluated`;
5. complete-zero folder empty state versus incomplete folder blocker;
6. governing document reading view with exact facts and citations;
7. historical and superseded reading views with prominent state and governing-document action;
8. partially governing and review-required views with no false definitive copy;
9. missing timezone, unreadable, download-blocked, inaccessible, pending, owner-gap, missing-final, and version-conflict states;
10. policy present/not-evaluated, memo on-file/requirement-not-evaluated, and notification-not-available slots;
11. UTF-8 byte-range citation with document-only navigation;
12. source-open success, stale token, replay, source revision drift, and access revocation;
13. hostile labels and prompt-like source text rendered literally;
14. resize/collision rejection, same-tab navigation, context drift, Escape, kill, and exact zero-residue teardown.

### Acceptance checklist

- [ ] Every vendor card shows owner, document/index state, governing status, next typed material date, separate consequence, memo evidence, policy/memo-requirement/notification slots, and urgent gaps.
- [ ] Notice deadline, renewal, termination, and expiration remain visibly distinct in folder summaries, cards, reading facts, and accessibility output.
- [ ] Confirmed absence is used only with complete authoritative evidence; all other missing-authority cases say `Not evaluated`, `Not available`, `Pending`, `Access unavailable`, or the exact blocker.
- [ ] Historical/superseded state is the first reading content, remains visible while scrolling, and includes a fresh governing-source route only when authorized.
- [ ] Facts identify governing evidence versus relevant history and expose exact citation location without a fabricated anchor.
- [ ] Folder paging is local, deterministic, keyboard operable, and cannot trigger truth or effects.
- [ ] No row badges, ask field, draft/send action, policy decision, notification claim, host highlight, or detached timeline appears.
- [ ] No old date/fact/action survives recompute, access change, identity drift, or projection replacement.
- [ ] The one right rail remains collision-safe at normal width, 200% zoom, and narrow viewports or does not render.
- [ ] VoiceOver announces final semantic state changes once, not scrolling, paging layout work, or geometry churn.
- [ ] Forced colors and reduced motion preserve all meaning; no semantic distinction relies on orange, red, glow, or animation.
- [ ] Turning Skopeo off restores exact zero visual, DOM, listener, focus, observer, timer, and action-token residue.

Human approval remains required for counsel/legal-operations semantics, representative authorized Drive/Docs density, and real governing-source navigation. Synthetic fixtures may pass the visual contract but cannot promote those rows beyond `human_needed`.

---

## Traceability

| Source | UI contract coverage |
|--------|----------------------|
| VIEW-01 | Folder anatomy, vendor card, bounded density, ordering, empty/partial states |
| VIEW-02 | Next material dates, explicit date-type table, separate consequence language |
| VIEW-03 | Gap/result mapping and mandatory policy/memo-requirement/notification slots |
| VIEW-04 | Sticky historical/superseded banner and freshly authorized governing-source action |
| VIEW-05 | Reading fact/citation rail, governing-versus-history labels, one-shell/host-integrity boundary |
| D-01–D-05 | Closed trusted model, minimized fields, exact authority, withdraw-first states |
| D-06–D-09 | One right-side composite rail, no Drive-row badges, local paging, zero host mutation |
| D-10–D-13 | Closed reading states, truth-only facts, citation-open-only action, no Phase 58 controls |
| D-14–D-17 | Typed dates, separate consequences, evidence-only gaps, neutral later-phase slots |
| Phase 52/53/53.1 UI contracts | Reused tokens, type, color, shell, attention, collision, focus, accessibility, and teardown |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
