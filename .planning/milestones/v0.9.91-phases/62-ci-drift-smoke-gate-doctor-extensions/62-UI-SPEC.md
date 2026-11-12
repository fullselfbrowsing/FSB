---
phase: 62
slug: ci-drift-smoke-gate-doctor-extensions
status: approved
reviewed_at: 2026-07-15T20:51:08Z
shadcn_initialized: false
preset: none
created: 2026-07-15
---

# Phase 62 — UI Design Contract

> Visual and interaction contract for daemon-classified adapter compatibility in the existing Providers panel. Generated from `62-CONTEXT.md`, the Phase 58/61 UI contracts, and the shipped vanilla extension UI; must be verified by `gsd-ui-checker` before planning.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | Existing hand-authored Chrome MV3 HTML/CSS/JavaScript; no shadcn initialization |
| Preset | Not applicable |
| Component library | None; extend the current provider row, badge, fact-card, refresh, and live-region patterns |
| Icon library | Existing Font Awesome 6.6 only; every compatibility icon is decorative beside visible text |
| Font | Existing system stack; no new font or remote asset |
| Token source | `extension/shared/fsb-ui-core.css` and `extension/ui/options.css` |
| Theme | Existing light/dark mappings; no compatibility-specific theme fork |

The surface remains inside `extension/ui/control_panel.html` and the current Providers section. Phase 62 adds no page, modal, disclosure, framework, dependency, or compatibility action.

---

## Dimension 1 — Copywriting

### Exact visible labels

| Element | Exact copy |
|---------|------------|
| Compatibility field label | `Compatibility` |
| Closed badge: supported | `Supported` |
| Closed badge: degraded | `Degraded` |
| Closed badge: unsupported | `Unsupported` |
| Claude Code auth value | `Not reported` |
| Existing refresh action | `Refresh status` |
| Existing pending action | `Refreshing…` |
| Existing global persistence action | `Save Settings` |

Capitalization is normative. Never render lowercase status tokens, synonyms such as “Compatible,” “Unknown,” or “Unverified,” or a fourth loading/stale badge. Loading and refresh feedback belongs in the existing status region; the compatibility badge always shows exactly one of the three closed labels.

### Detail and recovery copy

| State | Exact detail copy |
|-------|-------------------|
| Supported | `This CLI is within FSB's fixture-tested compatibility range.` |
| Degraded — newer version | `This CLI is newer than FSB's fixture-tested range. You can keep it selected; existing start checks still apply.` |
| Degraded — stale evidence | `Compatibility evidence is stale. Refresh status to check again.` |
| Unsupported | `FSB cannot verify compatibility for this CLI. Refresh status or review setup before starting a task.` |
| Claude Code auth help | `Claude Code does not report an auth state that FSB can safely read.` |
| Manual refresh failure with cached support | `Compatibility data could not be refreshed. Cached support is now Degraded.` |
| Manual refresh failure without valid evidence | `Compatibility data is unavailable. Showing Unsupported.` |

- When `checkedAt` is present in a background-validated view, selected-agent details may add `Checked {localized absolute date and time}`. Relative freshness language and tooltip-only timestamps are prohibited.
- Compatibility has no CTA and no destructive action. `Refresh status`, `Open setup guide`, and `Save Settings` retain their existing meanings.
- Do not claim that FSB ran `doctor`, inspected a binary, signed the user in, restarted the daemon, or changed the provider.

---

## Dimension 2 — Visuals and Interaction

### Hierarchy and placement

1. Preserve the fixed provider order: Claude Code, OpenCode, Codex, then the seven API providers in their existing order. Compatibility never reorders a row.
2. Keep recommendation, connection/install evidence, compatibility, and the trailing native radio as distinct row elements.
3. In each agent row, add a dedicated `.provider-row__compatibility` sibling after the existing recommendation/evidence cluster and before the radio. It contains the visible label `Compatibility`, one semantic icon, and one status pill. It is not placed inside `[data-provider-evidence]` or `[data-provider-recommendation]`.
4. Separate that group visually with spacing plus a one-pixel tokenized inline divider at normal widths. At narrow widths it becomes a full-width line with a tokenized top divider. Do not combine copy such as `Installed · Supported`.
5. Add a separate `Compatibility` fact to selected agent details. Installation, Connection, Account/Auth, Billing, selected state, and recommendation retain their own existing fields and DOM identities.
6. API rows receive no compatibility badge. In Phase 62, unshipped OpenCode and Codex adapter evidence resolves visibly to `Unsupported`, not to an invented neutral state.

### Closed state matrix

| Background-owned evidence | Visible badge | Detail | Selection/preflight effect |
|---------------------------|---------------|--------|----------------------------|
| Fresh validated `supported` | `Supported` | Supported copy | None |
| Valid `degraded` because installed CLI is newer than tested range | `Degraded` | Newer-version copy | Remains selectable; none |
| Previously supported evidence is stale | `Degraded` | Stale-evidence copy | Remains selectable; none |
| Missing, corrupt, invalid, unparseable, below-minimum, wrong-major, matrix-mismatched, or unshipped evidence | `Unsupported` | Unsupported copy | Remains selectable; existing preflight remains authoritative |
| Refresh pending with valid cache | Retain background-projected status; downgrade if background reports staleness | Existing detail | None |
| Refresh pending with no valid cache | `Unsupported` | Unsupported copy | None |
| Refresh failure after cached support expires | `Degraded` | Stale-evidence copy | None |
| Refresh failure with no valid snapshot | `Unsupported` | Unsupported copy | None |

Compatibility is observational data. No state may check/uncheck/disable a radio, call provider selection, change the recommendation cascade, reorder DOM rows, alter API model/key fields, change auth or billing, mark the form dirty, persist settings, or bypass the detector/preflight/start gate.

### Refresh, focus, and feedback

- Cold-boot cached rendering is silent. Background/storage hydration must not replay a live-region announcement.
- Reuse `#refreshProviderStatusBtn` and `#providerEvidenceAnnouncement`; do not add a second refresh button or per-row live region.
- A user-triggered success announces once, politely. If the selected agent changed status, append `Compatibility is now {Supported|Degraded|Unsupported}.`
- A user-triggered failure uses the existing one-shot alert behavior and the exact recovery copy above. Background refresh failures remain polite.
- Refresh keeps focus on the refresh button. Background updates and badge changes never move focus from a radio or control.
- The focused/checked row, all unsaved inputs, the dirty flag, provider kind/id, API model, API keys/endpoints, auth, billing, and recommendation are byte-for-byte unchanged by compatibility refresh.

---

## Dimension 3 — Color

The existing 60/30/10 distribution remains authoritative.

| Role | Token | Reserved usage |
|------|-------|----------------|
| Dominant (60%) | `var(--bg-secondary)` | Page background and open space |
| Secondary (30%) | `var(--bg-primary)`, `var(--bg-tertiary)`, `var(--border-color)` | Cards, rows, compatibility group/fact surfaces and dividers |
| Accent (10%) | `var(--primary-color)` and `var(--fsb-focus-ring)` | Checked provider row/radio, keyboard focus, existing links and Save action only |
| Supported | `var(--success-color)`, `var(--success-light)` | `Supported` pill and `fa-circle-check` only |
| Degraded | `var(--warning-color)`, `var(--warning-light)` | `Degraded` pill and `fa-triangle-exclamation` only |
| Unsupported | `var(--error-color)`, `var(--error-light)` | `Unsupported` pill and `fa-circle-xmark` only |

- Compatibility tone must not recolor the provider row, radio, provider name, recommendation badge, install/connection badge, Account/Auth, Billing, or setup action.
- Text and icon are mandatory non-color cues. Icons use `aria-hidden="true"`; status text remains visible.
- Dark mode uses the existing semantic token remapping. New raw white/black/light-only literals are prohibited.
- There is no destructive compatibility action; error color communicates unsupported evidence only.

---

## Dimension 4 — Typography

Phase 62 uses the Phase 58 provider scale and exactly two weights.

| Role | Size | Weight | Line height | Usage |
|------|------|--------|-------------|-------|
| Metadata | 12px | 400 | 1.5 | Visible `Compatibility` micro-label and checked-at help |
| Badge/label | 12px | 600 | 1.2 | Three compatibility pills and fact labels |
| Body/provider name | 14px | 400 or 600 | 1.4–1.6 | Explanation copy and existing provider names |
| Group/card heading | 16px or 18px | 600 | 1.25–1.3 | Existing headings only; no new compatibility heading level |

- Use sentence case. Do not use all caps, monospace versions, abbreviated status text, or status conveyed by icon alone.
- Long background-provided display text wraps; the badge label itself never truncates.

---

## Dimension 5 — Spacing and Responsive Behavior

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon-to-label and inline badge gaps |
| sm | 8px | Compatibility label/pill gap and narrow-stack separation |
| md | 16px | Row padding, detail fact padding, desktop separator offset |
| lg | 24px | Card subsection and stacked-group separation |
| xl | 32px | Existing details section separation |
| 2xl | 48px | Existing desktop form-section padding |
| 3xl | 64px | Existing row minimum height only; content may grow naturally |

Existing shell spacing remains inherited, out-of-scope shell behavior. New Phase 62 compatibility CSS must use only the scale above and must not introduce, copy, alias, or depend on any nonstandard shell spacing value. Every interactive target remains at least 44px; the data-only compatibility group does not become focusable.

- At `>= 900px`, preserve the current two provider-group columns. Compatibility may wrap within its row but never moves a row.
- From `641px–899px`, retain one provider-group column and the inline compatibility divider where space permits.
- At `<= 640px`, preserve the compact shell and its inherited, out-of-scope gutter behavior; stack name/evidence/compatibility, give compatibility a full-width top divider, left-align badges, and allow no horizontal scroll.
- Long provider names and help copy wrap without overlapping the radio. The native radio stays trailing at normal widths and remains reachable in DOM order.
- Under `prefers-reduced-motion: reduce`, remove compatibility transitions, transforms, pulses, and icon animation. Status changes remain immediate through text, icon, border, and live-region copy.

---

## Dimension 6 — Registry Safety

| Registry | Blocks used | Safety gate |
|----------|-------------|-------------|
| shadcn official | None | Not applicable |
| Third-party | None | Not applicable |

Phase 62 adds no UI dependency, registry block, remote asset, runtime script, or component package. Existing Font Awesome and shared FSB CSS are the only reused assets.

---

## Semantic and Accessibility Contract

- Provider selection remains one named native radio group. Compatibility is descriptive data, never a radio value, disabled reason, or nested interactive control.
- Each agent radio retains its provider name as the accessible name. Add a separate stable description node containing `Compatibility: {label}. {detail}` and reference it alongside—not instead of—the existing recommendation/evidence description.
- The visible row compatibility group has an explicit semantic label `Compatibility`; its icon is decorative. Do not apply `role="status"` to each badge.
- Selected-agent details use `<dl>` semantics with a distinct `<dt>Compatibility</dt>` and `<dd>` status/help. Claude Code retains a distinct Account/Auth fact whose visible value is exactly `Not reported`.
- A stale supported snapshot must be visibly and accessibly `Degraded`; a title attribute or color change alone does not satisfy the contract.
- `Supported`, `Degraded`, and `Unsupported` remain distinguishable in forced-colors/high-contrast conditions through text and border/icon shape.
- Hidden API/agent details preserve the existing `hidden` behavior and tab-order removal. Compatibility updates never steal focus.

---

## Implementation Boundary and Security Locks

### Ownership

- Daemon/MCP source owns the canonical matrix, adapter detection, version comparison, and authoritative compatibility classification.
- Background is the sole compatibility transport, exact-shape validator, freshness authority, and storage writer. It exposes a bounded, secret-free view to UI and fans out refresh results.
- `providers-panel.js` may only map the closed lowercase status/reason projection to display labels, icons, classes, and copy. Unknown/malformed UI input maps defensively to `Unsupported` but is never persisted by UI.
- `options.js` renders the background-provided projection. It does not read raw compatibility storage, inspect a binary, invoke `doctor`, or contact the daemon compatibility method directly.

### Prohibited extension behavior

- No semantic-version parser/comparator, CLI version range, tested-version constant, adapter profile constant, binary path, shell/process execution, native messaging, daemon wake/restart, or raw CLI parsing in extension source.
- No `nativeMessaging` manifest permission in Phase 62.
- No secret, shared-secret metadata, session id, fingerprint, protocol token, binary path, raw JSONL, prompt, task, environment, or provider-native payload may reach extension storage or DOM.
- The additive compatibility request remains separate from lifecycle-authoritative `delegate.status` and grants no spawn authority.
- Merging compatibility into `fsbAgentProviders` preserves clicked/connected/installed maps, saved settings, and unknown envelope keys. Rejection retains no newly asserted support.

---

## Deterministic Verification Contract

Automated/source verification is blocking for Phase 62.

1. Extend `tests/providers-panel-logic.test.js` with a pure compatibility display-model table covering all three tokens, every closed reason, hostile/prototype-like rows, absent/corrupt data, and the fail-closed `Unsupported` default. Arbitrary version strings must not influence UI mapping.
2. Extend `tests/providers-panel-ui.test.js` DOM harness to prove exactly one compatibility group on each agent row, none on API rows, fixed row order, exact visible labels/copy, distinct evidence/recommendation/compatibility nodes, separate `Compatibility` and Account/Auth facts, and Claude Code `Not reported` auth.
3. Prove fresh supported → `Supported`, newer → `Degraded`, stale supported → `Degraded`, and absent/corrupt/unshipped → `Unsupported`; no transient fourth label is allowed.
4. Snapshot the selected radio, focused element, recommendation, row order, provider kind/id, model/key/endpoint values, dirty state, and storage writes before refresh; assert identity after success, failure, timeout, storage fan-out, and status transition.
5. Extract the compatibility renderer/refresh functions and source-pin that they do not call selection setters, `markUnsavedChanges`, recommendation mutation, storage writes, `doctor`, shell/process APIs, native messaging, or version parsing/comparison.
6. Source-pin semantic icons plus exact status text, distinct `aria-describedby` nodes, a single shared live region, user-triggered alert-once behavior, silent hydration, token-only dark styling, `<=640px` wrapping, focus ring preservation, and reduced-motion rules.
7. Add an extension-wide guard proving there are no compatibility/version constants or semver parsing in extension code and `manifest.json` still lacks `nativeMessaging`; retain existing provider parity and forbidden-flag gates.
8. Run the provider UI/logic tests, extension contract tests, and full serial repository suite. Source-pin counts must be updated with the same implementation change.

### Testable acceptance criteria

- [ ] Every agent row visibly and accessibly reports exactly one of `Supported`, `Degraded`, or `Unsupported`; API rows report none.
- [ ] Compatibility remains visibly, semantically, and behaviorally separate from installed/connected/auth/billing/selection/recommendation.
- [ ] Stale supported evidence is `Degraded`; absent, corrupt, invalid, or unshipped evidence is `Unsupported`.
- [ ] Claude Code auth remains exactly `Not reported` regardless of install, connection, compatibility, selection, or billing evidence.
- [ ] Degraded and Unsupported rows remain selectable; compatibility never alters recommendation, preflight authority, order, form state, focus, or persistence.
- [ ] UI consumes only the background-validated safe projection and contains no CLI parsing/version constants, shell/process/native-messaging/doctor execution, wake behavior, binary paths, or secrets.
- [ ] Light/dark, compact/narrow, keyboard/focus, live-region, forced-color, and reduced-motion source/DOM contracts pass deterministically.

---

## Deferred Human Evidence

| Evidence | Status | Deferred gate |
|----------|--------|---------------|
| Rendered visual comparison of all three badges in light, dark, desktop, compact, and `<=640px` layouts | `human_needed` | Single milestone-end UAT sweep |
| Keyboard, screen-reader, focus-retention, forced-colors, and live-region behavior in Chrome | `human_needed` | Single milestone-end UAT sweep |
| Live daemon/installed-CLI corroboration of supported, newer/degraded, stale, corrupt/absent, and refresh-failure projections | `human_needed` | Single milestone-end UAT sweep |

These checks must not be marked passed from source inspection or synthetic DOM tests. Record them as deferred `human_needed`; do not fabricate screenshots, accessibility results, or live compatibility evidence.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-07-15 after independent checker PASS (revision 1)
