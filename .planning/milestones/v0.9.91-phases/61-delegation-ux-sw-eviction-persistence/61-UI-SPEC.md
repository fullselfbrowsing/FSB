---
phase: 61
slug: delegation-ux-sw-eviction-persistence
status: approved
shadcn_initialized: false
preset: none
created: 2026-07-14
reviewed_at: 2026-07-14T19:59:37Z
---

# Phase 61 — UI Design Contract

> Visual and interaction contract for delegated agent runs in the existing extension side panel. Generated from `61-CONTEXT.md`; must be verified by the UI checker before planning.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | Existing hand-authored extension UI; no shadcn initialization |
| Preset | Not applicable |
| Component library | None; extend existing semantic HTML/CSS/vanilla JS patterns |
| Icon library | Existing Font Awesome 6.6 only; no new icon dependency |
| Font | Existing system stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif` |
| Token source | `extension/shared/fsb-ui-core.css` plus existing side-panel aliases |
| Theme | Existing light/dark token mapping; no phase-specific hardcoded theme fork |

The Phase 61 surface stays inside the current `sidepanel.html` shell. It does not introduce React, Tailwind, shadcn, a third-party registry, a second router, or a separate full-page delegation UI.

---

## Visual Hierarchy and Layout

### Primary Focal Point

During an active delegation, the full-width current-run card at the top of the message stream is the visual anchor. Its hierarchy is:

1. Plain-language run state and provider name.
2. Contextual control (`Take control` or `Resume with agent`) when applicable.
3. Prominent destructive `Stop agent` control while the run is active or held.
4. Chronological event feed.
5. Composer, which remains visible but disabled only while an acknowledged run owns it.

Before launch, the consent card is the focal point. When offline, the offline card replaces it as the focal point while the unchanged task remains in the composer.

### Placement

- Add one full-width `delegation-run` region inside the existing `.chat-messages` scroll container; it is not constrained by the 88% ordinary message-bubble width.
- Keep the existing header, history view, runner, composer, and footer positions. Do not replace ordinary conversation messages with delegation cards.
- Pin the compact human-control bar immediately above `.chat-input-area` only while the active browser tab belongs to the active delegation. It must not obscure the last feed row.
- Put Stop in the existing input action cluster while running, with a visible text label in the run card as the redundant accessible control. Both invoke the same idempotent action.
- Render result metrics as a two-column grid at normal side-panel widths and one column at narrow widths.

### Responsive Contract

- At `max-width: 350px`, stack card actions vertically, make their text labels visible, wrap metadata, and render result metrics in one column.
- At `min-width: 500px`, keep feed text at the same measure; allow result metrics and consent permission lists to use two columns.
- Long tool names, model names, session ids, and argument summaries wrap without horizontal scrolling. Session ids use break-anywhere only within their value field.

---

## Component and State Inventory

| Component | Required content | Interaction contract |
|-----------|------------------|----------------------|
| Delegation preflight | Provider label, connection state, retained task | Invisible when ready; failures render an actionable state without mutating chat/composer |
| Consent card | CLI name, allowed list, forbidden list, per-run confirmation explanation | Focus lands on heading; `Allow & start {CLI}` consumes one challenge; `Back to message` returns focus to composer |
| Trust control | `Trust {CLI} for future runs` plus permanent-setting explanation | Separate explicit action; never an unchecked toggle that silently writes trust |
| Current-run card | Provider, state, elapsed time, background-tab statement | Updates from persisted ledger/state; no provider-specific raw fields |
| Init card | Client, model/profile, session id, allowed tools | Definition-list semantics; unknown values say `Not reported` |
| Tool-call card | Tool display name, bounded argument summary, tab id, state/duration | `<details>` exposes the persisted bounded breakdown; summary remains meaningful when collapsed |
| Retry card | `Retrying`, typed error class, next action if known | Semantic warning, polite announcement once; never red-only meaning |
| Human-control bar | Active tab label, `Take control` or `Resume with agent` | Appears only for exact owned active tab; stays visible throughout confirmed hold |
| Stop control | `Stop agent` | Destructive styling; disables to `Stopping agent…` after activation; no duplicate dialog because stop is the explicit kill switch |
| Result card | Outcome, tokens in/out/total, turns, wall time, cost bucket, tool breakdown | Summary visible by default; tool log expands on demand |
| Offline card | `Agent offline`, doctor command, setup action | Keeps task/composer intact; does not offer automatic retry or daemon restart |
| Disconnected card | `Agent connection lost`, missed-heartbeat explanation, doctor/setup actions | `role="alert"`; no claim that the agent is still running |
| Restart-lost card | `Agent run ended after daemon restart`, exact terminal code in details | Terminal, not resumable; starts no new process |

### Canonical UI State Matrix

| State | Header status | Primary control | Composer | Announcement |
|-------|---------------|-----------------|----------|--------------|
| Ready/API provider | Existing behavior | Existing Send | Enabled | Existing behavior |
| Agent ready, consent required | `Ready` | `Allow & start {CLI}` | Retained, blocked by consent card | Consent heading and permission scope |
| Agent trusted, preflight ready | `Ready` | Existing Send task action | Enabled until start acknowledgement | None before acknowledgement |
| Starting | `Starting agent` | `Stop agent` only after delegation id exists | Disabled | Polite once |
| Running in background | `{CLI} running` | `Stop agent` | Disabled | New persisted feed rows only |
| Driven tab active | `{CLI} running` | `Take control` + `Stop agent` | Disabled | Control availability once |
| Human control held | `Human control` | `Resume with agent` + `Stop agent` | Disabled | Assertive hold confirmation once |
| Stopping | `Stopping agent` | Disabled `Stopping agent…` | Disabled | Polite once |
| Completed/failed/stopped | `Ready` or typed terminal | Expand tool log | Enabled | Terminal row once |
| Offline before start | `Agent offline` | `Copy doctor command` | Enabled and task preserved | Assertive once |
| Three missed heartbeats | `Disconnected` | `Copy doctor command` | Enabled only for non-delegated/API path | Assertive once |
| Daemon restart lost run | `Run ended` | `Start a new task` | Enabled | Assertive terminal once |

Rehydration must not replay the live region. Persisted rows restored after service-worker wake render with announcements suppressed; only sequences received after subscription resumes are announced.

---

## Spacing Scale

All new Phase 61 spacing uses the existing 4-point-compatible scale below.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Inline metadata/icon gap |
| sm | 8px | Compact row and control gap |
| md | 16px | Card padding and body-stack gap |
| lg | 24px | Major card section padding |
| xl | 32px | Result-group and blocking-state separation |
| 2xl | 48px | Empty/offline focal-state breathing room |
| 3xl | 64px | Reserved major surface separation; rarely used in side panel |

Exceptions: none. Existing legacy values outside this phase are not expanded into new Phase 61 components.

---

## Typography

Phase 61 additions use exactly four sizes and two weights.

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Metadata | 11px | 400 | 1.4 | Sequence/time/tab/session labels |
| Label | 12px | 600 | 1.4 | Card type, status, metric labels, buttons |
| Body | 14px | 400 | 1.5 | Permission copy, summaries, errors, tool arguments |
| Heading | 16px | 600 | 1.25 | Consent, offline, current-run, result headings |

- Use sentence case. Do not add all-caps headings; existing compact status text may retain its legacy style.
- Monospace is limited to the exact doctor command and machine/session identifiers, at the inherited body/metadata size and weight.
- Truncate only visual previews; the persisted bounded value remains available through an accessible expanded detail when allowed by the data contract.

---

## Color

The 60/30/10 distribution uses existing semantic tokens in both themes.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `var(--fsb-surface-base)` (`#fffdfb` light / `#141110` dark) | Side-panel background and open feed space |
| Secondary (30%) | `var(--fsb-surface-elevated)` and `var(--fsb-surface-muted)` | Cards, held-state bar, expanded details, metadata groups |
| Accent (10%) | `var(--fsb-primary)` (`#ff6b35`) | Consent/start primary CTA, Resume CTA, active run marker, and focus ring only |
| Information | `var(--fsb-info)` (`#0891b2`) | Init/current-run semantic marker only |
| Success | `var(--fsb-success)` (`#10b981`) | Completed result marker only |
| Warning | `var(--fsb-warning)` (`#f59e0b`) | Retry and human-control-held marker only |
| Destructive | `var(--fsb-danger)` (`#dc2626`) | Stop action, failed/restart-lost/disconnected marker only |

Accent is reserved for: `Allow & start {CLI}`, `Resume with agent`, the active-run leading marker, and keyboard focus rings. It is not applied to every link, feed row, icon, or secondary control.

Every semantic color is paired with an icon and explicit text. Use tinted surfaces and borders derived from the token; body copy keeps the existing text tokens for contrast. Dark mode must use the existing theme variables rather than duplicating literal light colors.

---

## Copywriting Contract

### Required Actions and States

| Element | Exact copy pattern |
|---------|--------------------|
| Consent heading | `Let {CLI} control this browser?` |
| Consent allowed lead | `{CLI} may drive FSB browser tools for this task.` |
| Consent forbidden lead | `It cannot edit files, run shell commands, or fetch arbitrary URLs.` |
| Primary consent CTA | `Allow & start {CLI}` |
| Consent secondary CTA | `Back to message` |
| Trust action | `Trust {CLI} for future runs` |
| Trust explanation | `This turns off confirmation for future {CLI} runs on this browser. You can restore confirmation in Providers.` |
| Ready empty-state heading | `Delegate a browser task` |
| Ready empty-state body | `Choose an agent provider, describe the outcome, and FSB will run it in a background tab.` |
| Current run | `{CLI} is working in the background` |
| Take control | `Take control` |
| Held heading | `You have control of this tab` |
| Resume | `Resume with agent` |
| Stop | `Stop agent` |
| Stop pending | `Stopping agent…` |
| Stop result | `Agent stopped, {N} tab(s) released` with singular grammar for 1 |
| Offline heading | `Agent offline` |
| Offline body | `FSB cannot reach the local agent service. Run the doctor command, then try this message again.` |
| Doctor CTA | `Copy doctor command` |
| Setup CTA | `Open provider setup` |
| Disconnected heading | `Agent connection lost` |
| Disconnected body | `FSB missed three replies from the local agent service. The run cannot continue safely.` |
| Restart-lost heading | `Agent run ended after daemon restart` |
| Restart-lost body | `The previous agent process was stopped and was not reattached. Start a new task when the local service is ready.` |
| New-run CTA | `Start a new task` |
| Result cost bucket | `Included in your subscription` |
| Breakdown disclosure | `Show tool-call breakdown` / `Hide tool-call breakdown` |
| Unknown metadata | `Not reported` |

### Preflight and Failure Recovery Copy

| State | Exact heading | Exact body | Exact recovery CTA |
|-------|---------------|------------|--------------------|
| Unpaired preflight | `Pair this browser before starting {CLI}` | `FSB can reach the local agent service, but this browser has not been paired with it. Open provider setup, pair this browser, then try this message again.` | `Open provider setup` |
| Unsupported-provider preflight | `{provider} cannot run browser tasks` | `The selected provider does not support agents that control browser tabs. Choose a supported agent provider, then try this message again.` | `Choose another provider` |
| Generic run failure | `Agent could not finish this task` | `{CLI} stopped before the task was complete. Review the error details, then try the same message again.` | `Try message again` |
| Hold/resume ownership-restoration failure | `Agent could not resume control` | `FSB could not return this tab to {CLI}, so the run ended and the tab remains under your control. Start a new task when you are ready.` | `Start a new task` |

Do not use `faster mode`, `free`, `unlimited`, `Submit`, `OK`, `Click here`, generic `Save`, or claims that FSB restarted/read the daemon. Typed codes such as `daemon_restart_lost_run` belong in expandable technical details, not as the only user-facing explanation.

### Destructive Confirmation

`Stop agent` is itself the persistent, explicit kill switch and does not add a second confirmation dialog. The first activation immediately changes to disabled `Stopping agent…`; completion is reported only after supervisor settlement and tab release. Trust is not destructive but does require its own explicit confirmation action as described above.

---

## Interaction and Focus Contract

- Consent activation moves focus to the consent heading, then to `Allow & start {CLI}` in normal tab order. Declining returns focus to the unchanged composer.
- When Take Control becomes available, announce it once without stealing focus. Clicking it retains focus on the now-disabled control until hold confirmation, then moves focus to `Resume with agent`.
- Resume keeps the bar visible until ownership restoration and supervisor continuation are both confirmed. Failure changes the same region to a typed terminal state; it never hides optimistically.
- Stop is keyboard operable from both redundant locations and shares one busy state via `aria-busy="true"` on the run region.
- Offline/disconnected cards use `role="alert"`; routine progress uses one `role="status" aria-live="polite" aria-atomic="false"` feed announcer.
- Feed cards are semantic `<article>` elements with headings. Metadata uses `<dl>`. Expandable logs use native `<details>/<summary>`.
- Icon-only legacy header controls retain existing behavior; every new Phase 61 action has visible text. Icons use `aria-hidden="true"`.
- `Copy doctor command` changes temporarily to `Doctor command copied` in the live region while preserving its accessible name/next action.

---

## Motion and Feedback

- Reuse existing 200 ms control transitions. Do not animate feed layout height on hydration.
- `animatedHighlights: true` may pulse the active-run marker and briefly tint a newly persisted tool row; it must not flash the whole panel.
- Under `prefers-reduced-motion: reduce`, remove pulses, transforms, smooth scrolling, and highlight transitions. State changes remain fully conveyed by text/border/icon.
- Never show a result, stopped count, held state, or restored ownership before the corresponding persisted/controller acknowledgement.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| None | None | Not applicable — existing vanilla extension UI only |

No shadcn or third-party component registry is initialized. Existing Font Awesome and shared FSB CSS are already repository dependencies; Phase 61 adds no remote block or runtime UI dependency.

---

## Implementation Guardrails

- UI reads only the provider-neutral delegation view model/ledger; no raw Claude event parsing or provider-specific event branch belongs in `sidepanel.js`.
- Failed preflight and consent cancellation preserve composer text and create no user bubble.
- Rehydrated rows and newly delivered rows share one renderer; only announcement behavior differs.
- HTML/CSS/JS source-pin tests must lock visible copy, unique IDs, ARIA roles, action ordering, theme token reuse, reduced-motion behavior, and no `nativeMessaging` permission.
- Normal API-provider and ordinary conversation UI must remain pixel/behavior compatible except where the shared result-summary component intentionally reuses existing real-USD cost data.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-07-14
