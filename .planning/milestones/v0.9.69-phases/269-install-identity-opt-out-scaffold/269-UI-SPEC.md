# Phase 269: UI Design Contract

**Surface:** Extension Control Panel > Advanced Settings > "Privacy & Telemetry" card (NEW)
**Mode:** Inline UI-SPEC — single card addition in an existing settings grid; full design already locked in 269-CONTEXT.md decisions.

## Contract

A new card mounts inside `extension/ui/control_panel.html` `#advanced > .advanced-settings-grid` (line 341) as the LAST child of the grid. The card follows the existing card visual treatment (same border, padding, font, spacing as sibling Advanced Settings cards).

## Anatomy

```
┌─────────────────────────────────────────────────────────────────────┐
│ Privacy & Telemetry                                                  │
│                                                                       │
│ ┌─────────────────────────────────────────────────┐    ┌──────┐    │
│ │ Send anonymous usage data                       │    │  ON  │    │
│ │ Tokens used, MCP client name, active agent      │    │ ━━●  │    │
│ │ count. No URLs, prompts, or DOM.                │    └──────┘    │
│ │ Read full policy →                              │                 │
│ └─────────────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Elements

| Element | Type | Text / Value | Notes |
|---------|------|--------------|-------|
| Card title | `<h3>` (or matching sibling pattern) | "Privacy & Telemetry" | Matches existing card title styling |
| Toggle label | `<label>` | "Send anonymous usage data" | Mid-weight, direct (no marketing) |
| Subtitle | `<p>` (small/muted) | "Tokens used, MCP client name, active agent count. No URLs, prompts, or DOM." | One line; comma-separated factual list |
| Policy link | `<a>` | "Read full policy →" | `href="/privacy#telemetry-disclosure"` -- anchor target lands in Phase 275; fallback to `/privacy` page top is acceptable for Phase 269 |
| Toggle control | switch input | bound to `chrome.storage.local.fsbTelemetryOptOut` (inverse: toggle ON = `false`/null) | Default visual state: ON |

## Behavior

- **Initial render:** Read `fsbTelemetryOptOut`. If `true` → toggle OFF. If `false` or missing → toggle ON.
- **On user click:** Write `fsbTelemetryOptOut = !currentValue` to `chrome.storage.local`. Update visual within 100ms (CONS-02). No "Apply" button. No nag screen.
- **No first-run banner / modal / nag** -- locked by D-02.
- **No "Reset ID" / "Wipe data" buttons in this phase** -- deferred (TELEMETRY-FUTURE-03/04).

## States

| State | Toggle position | Tooltip / aria-label |
|-------|----------------|-----------------------|
| Telemetry ON (default) | Right (ON) | "Anonymous usage data is being sent. Click to stop." |
| Telemetry OFF (user opted out) | Left (OFF) | "Anonymous usage data is NOT being sent. Click to re-enable." |

## Accessibility

- Toggle must be keyboard-reachable (tab order: card title -> toggle).
- `aria-checked` mirrors the toggle state.
- Subtitle text must NOT be the only label -- the `<label>` element on top is the accessible label.
- Policy link uses standard `<a>` with visible focus ring.

## i18n

- All strings stay English-only for v0.9.69 (control panel surface is OUTSIDE the Angular i18n pipeline per v0.9.63 closeout note).
- Deferred to v0.9.70+ when a Chrome `_locales/` mini-system is introduced for extension UI translation.

## Design constraints

- Reuse existing FSB card visual tokens (border, background, padding, typography). DO NOT introduce new tokens, classes, or stylesheets unless absolutely necessary.
- Match the right-aligned-toggle pattern used elsewhere in Advanced Settings if a precedent exists; otherwise use the simplest accessible toggle (HTML `<input type="checkbox" role="switch">` styled with existing FSB CSS).

## Non-goals (verify these are NOT added)

- No modal, drawer, or popover.
- No telemetry data preview ("View what we send" deferred -> TELEMETRY-FUTURE-02).
- No "Reset anonymous ID" or "Wipe my data" buttons (deferred -> TELEMETRY-FUTURE-03/04).
- No region-detection or geographic gating UI (deferred -> TELEMETRY-FUTURE-05).
- No new icon assets (avoid asset churn).
