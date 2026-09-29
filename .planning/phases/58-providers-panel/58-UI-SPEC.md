---
phase: 58
slug: providers-panel
status: approved
shadcn_initialized: false
preset: none
created: 2026-07-12
---

# Phase 58 — UI Design Contract

> Visual and interaction contract for the Providers panel. Generated from the Phase 58 context and existing FSB control-panel design system; verified by `gsd-ui-checker` before implementation.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — static Chrome MV3 HTML/CSS/JavaScript |
| Preset | not applicable |
| Component library | none; reuse FSB form-card, badge, button, help-text, save-bar, and model-combobox primitives |
| Icon library | Font Awesome 6.6 already loaded by `control_panel.html`; every icon remains decorative beside visible text |
| Font | Existing system stack (`-apple-system`, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, sans-serif); monospace only for commands or machine identifiers |

No shadcn initialization or third-party UI registry is permitted for this phase.

---

## Layout Contract

### Section shell

- The sidebar item uses the canonical target `data-section="providers"`, the visible label **Providers**, and a provider/connection icon. The content section uses `id="providers"`.
- `#api-config` is a routing alias only. Initial navigation normalizes it to `#providers`; all subsequent navigation and copied/bookmarked URLs use the canonical hash.
- Section title: **Providers**.
- Section description: **Choose how FSB runs AI tasks. API providers use keys stored locally; agent CLIs use their existing local sign-in.**
- Preserve the existing centered `.section-header`, `.form-card`, maximum content width, sidebar offset, and global unsaved-changes/Save bar.

### Provider chooser

- The first form card is titled **Choose a provider** and contains one semantic radio group spanning two visually named groups in this fixed order: **Agent CLIs**, then **API providers**.
- At widths `>= 900px`, the two groups form a two-column grid with a `24px` gutter. Below `900px`, they stack in document order with a `24px` gap.
- Agent rows are fixed: Claude Code, OpenCode, Codex. API rows preserve the existing order: xAI, Google Gemini, OpenAI, Anthropic, OpenRouter, LM Studio, Custom.
- Each row is a full-width native-radio label with a minimum height of `64px`, `16px` padding, `12px` internal gap, an optional `32px` icon box, a flexible name/status column, and a trailing radio indicator. Rows never move in response to evidence.
- Do not put links or buttons inside the radio label. Install, billing, and retry actions live in the details panel so every nested interaction remains valid and keyboard-reachable.

### Kind-specific details

- The second form card is a stable detail region directly below the chooser. Its top edge does not move when recommendation data refreshes.
- For `providerKind="api"`, show the existing model combobox and exactly one existing API-key/server/endpoint group. Keep the hidden `#modelProvider` select as the API-only compatibility source of truth; provider radios mirror its value and dispatch the existing API change path.
- For `providerKind="agent"`, hide the model combobox, model description, discovery status, refresh-model action, all key groups, endpoint/server groups, key URLs, and key-format hints. Show the selected agent's Evidence, Account, Setup, and Usage blocks.
- Unsupported/raw MCP identities, when present, appear after the selectable groups in a collapsed **Other MCP clients (N)** disclosure. They have no radio control, recommendation badge, or install CTA.

---

## Spacing Scale

All new Providers-panel rules use the shared FSB 4-point scale:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | badge icon gap, inline metadata gap |
| sm | 8px | badge padding rhythm, helper-text offset |
| md | 16px | provider-row padding, default control gap |
| lg | 24px | group/detail grid gaps, card subsection padding on compact screens |
| xl | 32px | major card-internal separation |
| 2xl | 48px | existing desktop `.form-section` padding and major section breaks |
| 3xl | 64px | provider-row minimum height only; not general whitespace |

Exceptions: the existing control-panel shell retains its legacy compact local spacing variables; this phase does not rewrite them. New icon boxes remain the existing `32px` token. Interactive rows and buttons must present at least a `44px` usable target even when visible content is shorter.

---

## Typography

New provider components use exactly two weights, `400` and `600`. The existing page-shell `h2` rule may retain its inherited `700` weight; it is not duplicated in provider-component CSS.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px | 400 | 1.6 |
| Label / provider name | 14px | 600 | 1.4 |
| Group heading | 16px | 600 | 1.3 |
| Card heading | 18px | 600 | 1.25 |

- Status badges use `12px`, weight `600`, line-height `1.2`, without forced all-caps for multiword status.
- Usage values may use the existing monospace stack at `14px`, weight `600`; labels stay in the system font.
- Do not reduce billing qualifications, errors, or auth status below `12px`.

---

## Color

All values come from existing light/dark-aware tokens. No new hard-coded light-only colors are allowed.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `var(--bg-secondary)` (`#fffdfb` family light / `#050505` dark) | page background and open space |
| Secondary (30%) | `var(--bg-primary)` plus `var(--bg-tertiary)` | cards, rows, detail blocks, hover surfaces |
| Accent (10%) | `var(--primary-color)` (`#ff6b35`) | selected-row border/radio, focus ring, Save action, text links only |
| Destructive | `var(--error-color)` | inventory load failure only; there is no destructive provider action |

Accent is reserved for selected state, keyboard focus, the existing Save action, and links. It is not used for the advisory recommendation badge.

### State colors and non-color cues

- **Selected:** `2px solid var(--primary-color)`, `var(--primary-light)` background, checked native radio, and `aria-checked=true`/native checked state.
- **Recommended:** visible text badge **Recommended** using `var(--info-light)` background and `var(--info-color)` foreground/border. It never supplies selected styling.
- **Connected:** text badge **Connected now** with `var(--success-light)` / `var(--success-color)` and a filled-circle icon.
- **Installed:** text badge **Installed** using info tokens.
- **Seen before:** text badge **Seen before** using warning tokens; never green.
- **Setup copied:** neutral text badge **Setup copied** using `var(--bg-tertiary)` and `var(--text-secondary)`.
- **Not installed / Not reported:** neutral outlined badges using `var(--border-color)` and `var(--text-muted)`.
- **Load error:** problem text plus retry control using error tokens; selection and saved settings retain their prior visual state.

Every state includes text. Color and icons are supplementary only.

---

## Interaction Contract

### Selection and saving

- Use native radios with one shared name and visible labels. Tab enters the group, arrow keys move among radios according to browser-native behavior, Space selects, and focus uses `var(--fsb-focus-ring)`.
- Clicking or keyboard-selecting a row updates only the in-form `{ providerKind, providerId }`, updates the kind-specific detail panel, and calls the existing `markUnsavedChanges()` path.
- Recommendation recomputation, inventory refresh, and storage-change events must not change the checked radio, `providerKind`, `agentProviderId`, `modelProvider`, model, or key values.
- The existing **Save Settings** action is the only persistence action. Saving an agent writes `providerKind="agent"` and `agentProviderId` while preserving API settings; saving an API writes `providerKind="api"` and the API-only `modelProvider` while preserving `agentProviderId`.

### Refresh and external actions

- The chooser header includes a secondary button labeled **Refresh status** with a decorative sync icon. While pending it reads **Refreshing…**, is disabled, and has `aria-busy="true"`; it does not spin when reduced motion is requested.
- Agent setup actions use **Open setup guide** or the existing onboarding copy action; do not create a new unverified install command in this panel.
- Billing links open a new tab, include an external-link icon plus visible vendor-specific text, and use `rel="noopener noreferrer"`.
- A failed inventory refresh leaves the prior roster evidence visible, announces the failure in the details/status region, and offers **Retry status**. It never clears selection.

### Recommendation computation

- Render exactly one **Recommended** badge after every successful or fallback render.
- Eligible agent order within a tier is Claude Code, OpenCode, Codex. Tier order is non-null `live`, then `installed.detected === true`, then non-null `clicked`, then xAI.
- Durable `connected` without `live` renders **Seen before** but never affects recommendation.
- Raw/unsupported clients, saved selection, timestamps, object-key order, and current row position never affect the result.

---

## State Matrix

| Input state | Row status | Detail copy/action | Recommendation eligibility |
|-------------|------------|--------------------|----------------------------|
| `live` present | **Connected now** | “Connected through FSB MCP.” | live tier |
| `installed.detected === true`, no `live` | **Installed** | Show checked time when available; auth remains independently reported | installed tier |
| durable `connected`, no `live` or install evidence | **Seen before** | “This CLI connected previously but is not connected now.” | none from historical record |
| `clicked` present only | **Setup copied** | “Setup was copied during onboarding. Installation is not confirmed.” | clicked tier |
| no evidence | **Not installed** | **Open setup guide** | none |
| auth absent | **Not reported** | “The CLI has not reported its account type.” | no effect |
| inventory request pending | Preserve rows; status region says **Loading provider status…** | Disable only refresh | retain deterministic fallback badge |
| inventory request fails with no prior evidence | All three agents remain visible as **Status unavailable** | “Agent status is unavailable. Your selection is unchanged.” + **Retry status** | xAI fallback |
| inventory request fails with prior evidence | Preserve last evidence and mark **Status may be stale** | Show last checked time + **Retry status** | compute from preserved evidence, one badge |
| unsupported/raw identity | Informational name and **Observed MCP client** | No selection or setup action | never |

### Usage empty state

- Always render the three labels **Tokens**, **Turns**, and **Duration** for an agent selection.
- Before Phase 61 supplies a completed run, each value is an em dash (`—`) and the block reads **No delegated runs yet**. Do not show numeric zero or any currency field.
- When real run data later exists, render integer token and turn counts and a human duration; never derive or estimate a dollar value in this panel.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | **Save Settings** (existing global action; unchanged) |
| Section description | **Choose how FSB runs AI tasks. API providers use keys stored locally; agent CLIs use their existing local sign-in.** |
| Chooser heading | **Choose a provider** |
| Empty state heading | **No agent CLI detected** |
| Empty state body | **You can select an agent now and follow its setup guide, or continue with an API provider.** |
| Loading state | **Loading provider status…** |
| Error state | **Agent status is unavailable. Your selection is unchanged.** |
| Stale state | **Status may be stale. Refresh after the FSB server reconnects.** |
| Auth unknown | **Not reported** / **The CLI has not reported its account type.** |
| Usage empty state | **No delegated runs yet** |
| No-credential caption | **FSB uses this CLI's existing sign-in and does not need its credential. Billing and limits follow the account or provider configured in the CLI.** |
| Destructive confirmation | Not applicable — this phase has no destructive action |

Do not use wording that promises zero cost, unrestricted use, or a universal subscription entitlement.

### Provider-specific billing copy

| Agent | Required copy | Link label and destination |
|-------|---------------|----------------------------|
| Claude Code | **Uses the account signed into Claude Code. FSB does not need your Anthropic credential. Usage and charges follow that account's Claude plan or API configuration.** | **Review Claude plans and billing** → `https://claude.com/pricing` |
| OpenCode | **Uses the provider configured in OpenCode. FSB does not need that provider credential. Charges may come from OpenCode Zen or the configured provider.** | **Review OpenCode providers and billing** → `https://opencode.ai/docs/providers/`; optional Zen detail → `https://opencode.ai/docs/zen/` |
| Codex | **Uses the account signed into Codex. FSB does not need your OpenAI credential. Usage, credits, and charges follow that account's current OpenAI plan or API configuration.** | **Review current Codex billing** → `https://help.openai.com/en/articles/20001106-codex-rate-card-2` |

Billing-label rule:

- Show **Included in your subscription** only when adapter-supplied auth metadata positively identifies a subscription-backed run.
- Show **Billed by your CLI provider** for API-key, credit, Zen, or external-provider modes.
- Show **Billing not reported** in Phase 58's default unknown-auth state.
- The phrase “no API key needed” must always be scoped to FSB: **No API key needed in FSB**. It must not imply that OpenCode or another CLI has no provider credential of its own.

This conditional contract preserves PROV-06's subscription label for confirmed subscription-backed runs while enforcing its higher-order no-fabrication rule for OpenCode and credit/API-backed Codex or Claude configurations.

---

## Responsive, Theme, and Motion Contract

- At `>= 900px`, chooser groups use two columns; below `900px`, use one column.
- At `<= 640px`, retain the existing sidebar layout and `10px` content gutters; provider cards use `24px` section padding and all rows/actions remain full-width with at least `44px` targets.
- Long provider names, versions, and raw client names wrap; badges wrap to a second line without overlapping the radio indicator. No horizontal scrolling is allowed.
- The agent Usage block uses three equal columns above `640px` and one stacked list at or below `640px`.
- All backgrounds, borders, text, semantic badges, and selected states use existing theme variables. Do not introduce raw white/black values in new provider rules.
- Hover transitions may use the existing `150ms` fast transition. Under `prefers-reduced-motion: reduce`, remove transform/spin/shimmer effects and make state changes immediate. Status text and `aria-live` still announce updates.

---

## Accessibility Contract

- Provider selection is a named native radio group with a visible legend. Group headings do not split keyboard behavior into separate radio groups.
- Each radio's accessible name is its provider name; recommendation and evidence are additional descriptive text, not part of the value.
- The selected agent/API details region has `aria-live="polite"`; refresh errors use `role="status"` unless the user explicitly triggered Refresh and it failed, in which case use `role="alert"` once.
- Focus never jumps after recommendation or status refresh. If the focused row's badges change, focus remains on that radio.
- Selected, recommended, connected, and unavailable states are identifiable through text and control state without color.
- External links disclose their destination in visible copy and do not rely on an icon-only title.
- Hidden API/agent panels use the `hidden` attribute (or equivalent `display:none` plus `aria-hidden`) so inactive controls are removed from the tab order.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable |
| third-party | none | not applicable |

---

## Implementation Locks for the Planner

- Reuse `extension/shared/fsb-ui-core.css` and `extension/ui/options.css`; no new design dependency, remote component, inline style system, or frontend framework.
- Preserve all seven API provider values and the current model/key discovery path. Agent IDs never enter `#modelProvider` or `universal-provider.js`.
- Keep selected state and recommendation state in separate variables, DOM attributes, and tests.
- Test light, dark, `<=640px`, keyboard-only, reduced-motion, loading, empty, stale, error, each recommendation tier, same-tier tie, historical-only connection, and saved-selection-not-recommended cases.
- Source-pin tests must be updated in the same commit as any HTML/JS/CSS source-token changes.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-07-12
