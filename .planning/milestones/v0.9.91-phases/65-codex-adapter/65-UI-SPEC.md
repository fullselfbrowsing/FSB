---
phase: 65
slug: codex-adapter
status: approved
shadcn_initialized: false
preset: none
created: 2026-07-22
reviewed_at: 2026-07-22T08:57:36Z
---

# Phase 65 — UI Design Contract

> Visual and interaction contract for promoting Codex through the existing Providers panel and provider-neutral delegated-run UI, while closing the two Phase 64 UI advisories. Generated from `65-CONTEXT.md`, `65-RESEARCH.md`, and the approved Phase 64 UI contract; must be verified by `gsd-ui-checker` before planning.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | Existing hand-authored Chrome MV3 HTML/CSS/JavaScript; no shadcn initialization |
| Preset | Not applicable |
| Component library | None; reuse the current provider row, status badge, compatibility pill, selected-agent fact/detail sections, refresh/live-region, consent card, run card, feed entry, action bar, and summary patterns |
| Icon library | Existing Font Awesome 6.6 only; icons remain decorative beside visible text |
| Font | Existing system stack (`-apple-system`, BlinkMacSystemFont, `Segoe UI`, Roboto, `Helvetica Neue`, sans-serif); monospace remains limited to existing machine identifiers and commands |
| Token source | `extension/shared/fsb-ui-core.css`, `extension/ui/options.css`, and `extension/ui/sidepanel.css` |
| Theme | Existing light, dark, and forced-colors mappings; no Codex theme or brand-color fork |

This repository is not a React, Next.js, or Vite UI and has no `components.json`; the shadcn initialization gate is not applicable. Phase 65 adds no UI package, registry block, remote asset, page, modal, disclosure, provider row, renderer, or Codex-specific component.

The complete visual surface is the existing third **Codex** row plus the shared selected-agent details, consent, lifecycle, feed, controls, and summary. Existing HTML structure and provider-row order are fixed.

---

## Visual Scope and Hierarchy

### Providers panel

- Preserve the exact roster and DOM order: Claude Code, OpenCode, **Codex**, then all seven API providers in their existing order. Codex remains the third row under **Agent CLIs**.
- Reuse the current Codex native-radio row unchanged. Its visible name, recommendation badge, evidence badge, `Compatibility` group, compatibility description, and trailing radio retain separate DOM identities.
- A valid shipped Codex projection may change the existing compatibility pill from fail-closed **Unsupported** to **Supported** or **Degraded**. No state may recolor the whole row, move its radio, alter recommendation, or save/select the provider.
- Reuse the current selected-agent detail region and its existing sections: Installation, Connection, Compatibility, Account/Auth, Setup, Local bridge pairing, Usage, and Billing. Add no auth card, plan badge, key field, model picker, profile/version fact, price estimator, or Codex-specific setup block.
- The selected Codex row/radio is the Providers surface's primary focal point. The existing detail region is secondary, with Compatibility, Account/Auth, Usage, and Billing kept visually distinct so compatibility cannot be mistaken for login or billing authority.
- The dormant row becomes functional through safe data only. Do not add a Codex logo treatment, OpenAI brand color, profile badge, version string, or alternate row layout.

### Delegated side panel

- Reuse the established consent card, current-run card, chronological feed, human-control bar, fixed composer Stop control, in-card Stop control, result card, summary, and recovery cards without new markup or card kinds.
- Substitute only the canonical provider label in shared copy: **Let Codex control this browser?**, **Allow & start Codex**, **Codex is working in the background**, and **Codex running**.
- Before a run, the consent heading and existing primary action are the focal point. During a run, authoritative lifecycle state and Stop are the focal point. After completion, the existing Run summary is the focal point.
- Codex command construction, auth probe, scratch directory, MCP attestation, thread id, native event names, and compatibility profile are intentionally invisible.
- Remove the generic visible **Profile** definition from every adapter's init feed entry. `profileVersion` remains required internal routing, compatibility, drift, persistence, and hydration data but never produces visible text or an empty definition row.
- Reasoning, plan updates, command/file/web events, raw MCP arguments/results, and native Codex error text never appear in normal UI or accessibility output.

---

## Spacing Scale

Phase 65 introduces no new spacing token. Existing provider and delegated surfaces use the repository's 4-point rhythm:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps and compact inline spacing |
| sm | 8px | Badge padding, action gaps, and compact section offsets |
| md | 16px | Default row/card padding and section spacing |
| lg | 24px | Stacked group and subsection separation |
| xl | 32px | Existing detail and layout gaps |
| 2xl | 48px | Major section breathing room |
| 3xl | 64px | Existing provider-row minimum height only |

### Locked legacy dimensions

- The unchanged provider row retains its existing `12px` internal gap/padding, and existing native controls retain their established `20px` dimensions where already source-pinned.
- Phase 65 cannot retune these dimensions without widening its no-new-layout scope and risking provider-row, focus, and source-pin regressions across the shared roster.
- `12px` and `20px` are compatibility-only legacy dimensions. They are not reusable spacing tokens and must not be applied to new or changed Phase 65 layout.

Interactive-target contract:

- Every `.delegation-action` button is at least `44px` high in normal and narrow layouts: consent Allow/Back, recovery actions, Take control, Resume with agent, and in-card Stop.
- The fixed circular `.stop-btn[data-delegation-action="stop"]` is at least `44px × 44px` while it represents delegated Stop. Its legacy non-delegated behavior is outside this phase.
- At `<=350px`, shared delegated actions remain full width and at least `44px` high. Stacking may not reduce the hit area or overlap neighboring controls.
- Padding, gap, border radius, and visual density otherwise remain unchanged. The target-size correction must not reorder focus or change labels.

---

## Typography

Phase 65 adds no type style. The surfaces retain exactly four sizes and two weights (`400` and `600`):

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Metadata, help, action | 12px | 400 or 600 | 1.4–1.5 |
| Body, provider name | 14px | 400 or 600 | 1.4–1.6 |
| Group/feed heading | 16px | 600 | 1.3 |
| Card/roster heading | 18px | 600 | 1.25 |

- Use sentence case. **Codex** keeps the same type treatment as Claude Code and OpenCode.
- Do not create a wordmark, all-caps treatment, plan-tier emphasis, key-shaped icon label, profile/version label, or price typography.
- Auth and billing copy wraps normally. It must not truncate, ellipsize into an ambiguous billing claim, or cause horizontal scrolling.

---

## Color

The existing 60/30/10 distribution remains authoritative in light and dark themes:

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `var(--bg-secondary)` / `var(--fsb-surface-base)` (`#fffdfb` light, `#141110` dark) | Page and side-panel background/open space |
| Secondary (30%) | `var(--bg-primary)`, `var(--bg-tertiary)`, `var(--fsb-surface-elevated)`, `var(--border-color)` | Existing rows, details, cards, feed surfaces, and dividers |
| Accent (10%) | `var(--primary-color)` / `var(--fsb-primary)` (`#ff6b35`) | Checked provider/radio, keyboard focus, existing links, Save, consent/start, Resume, and active-run marker only |
| Supported | `var(--success-color)` / `var(--fsb-success)` (`#10b981`) | Existing **Supported** compatibility pill and completed marker |
| Degraded | `var(--warning-color)` / `var(--fsb-warning)` (`#f59e0b`) | Existing **Degraded** compatibility pill and held/retry markers |
| Unsupported | `var(--error-color)` / `var(--fsb-danger)` (`#dc2626`) | Existing **Unsupported** compatibility pill and failed/disconnected marker |
| Destructive | `var(--fsb-danger)` (`#dc2626`) | Existing delegated **Stop agent** controls only |

Accent is reserved for checked selection, focus, existing links/persistence actions, consent/start, Resume, and active-run emphasis. It is not used for Codex branding, recommendation, installation, auth mode, billing bucket, compatibility detail text, or a plan tier.

Auth and billing remain neutral text/fact presentation. Unauthenticated or unknown state becomes blocking only in the existing preflight failure card; do not invent a new colored auth badge. Every semantic state retains visible text plus existing icon/border redundancy in forced colors.

---

## Copywriting Contract

### Existing actions and baseline states

| Element | Exact copy |
|---------|------------|
| Primary CTA in Providers | **Save Settings** (existing global action; Phase 65 adds no CTA) |
| Codex row | **Codex** |
| Existing refresh action | **Refresh status** / pending **Refreshing…** |
| Empty state heading | **No agent CLI detected** |
| Empty state body | **You can select an agent now and follow its setup guide, or continue with an API provider.** |
| Setup CTA | **Open setup guide** in Providers; **Open provider setup** in delegated recovery |
| Usage before a completed run | Tokens **—**, Turns **—**, Duration **—**, and **No delegated runs yet** |
| Billing link | **Review current Codex billing**; retain the repository-owned fixed OpenAI URL, `target="_blank"`, and `rel="noopener noreferrer"` |

Never use **Included in your subscription** for Codex, infer ChatGPT Plus/Pro/Team/Enterprise, say “free” or “unlimited,” render `$0`, or consult a local price table.

### Codex auth and billing matrix

Only safe daemon-projected evidence may drive these values:

| Auth state | Account/Auth value | Account/Auth help | Billing value/caption | Start effect |
|------------|--------------------|-------------------|-----------------------|--------------|
| `chatgpt` | **ChatGPT** | **Codex is signed in with ChatGPT.** | **Included with your ChatGPT plan** | Runnable when all other preflight checks pass |
| `api_key` | **API key** | **Codex is signed in with an API key stored by Codex.** | **Billed to the API key stored by Codex; dollar amount not reported.** | Runnable when all other preflight checks pass |
| `unauthenticated` | **Not signed in** | **Sign in to Codex first.** | **Sign in to Codex first.** | Block before consent/start |
| `unknown` | **Status unavailable** | **Codex sign-in status is unavailable. Refresh status before starting a task.** | **Billing not reported** | Block before consent/start |

- Stale, malformed, missing, or failed auth evidence displays as `unknown`; it never preserves a previously runnable billing claim.
- Compatibility, installed, connected, recommended, and selected states cannot alter the auth/billing copy.
- The Providers detail region must disclose the accepted auth/billing class before a task can start. The shared consent flow binds that same class internally without adding a Codex-only billing element.
- If the daemon's immediate pre-spawn auth result differs from the consent-bound state, reuse the existing preflight-failure presentation with: **Codex sign-in changed before this run. Refresh provider status and review the billing method before trying again.** No task/feed row is created.

### Compatibility and refresh copy

| State | Badge | Exact detail copy |
|-------|-------|-------------------|
| Exact fixture-tested 0.142.5 profile | **Supported** | **This CLI is within FSB's fixture-tested compatibility range.** |
| Newer-than-tested Codex, including locally observed 0.144.6 | **Degraded** | **This CLI is newer than FSB's fixture-tested range. You can keep it selected; existing start checks still apply.** |
| Stale prior support | **Degraded** | **Compatibility evidence is stale. Refresh status to check again.** |
| Missing, invalid, unshipped, or unsupported evidence | **Unsupported** | **FSB cannot verify compatibility for this CLI. Refresh status or review setup before starting a task.** |
| Manual refresh success with changed selected status | — | **Provider status refreshed. Compatibility is now {Supported\|Degraded\|Unsupported}.** |
| Refresh failure with cached support | — | **Compatibility data could not be refreshed. Cached support is now Degraded.** |
| Refresh failure without valid evidence | — | **Compatibility data is unavailable. Showing Unsupported.** |

The UI never prints `0.142.5`, `0.144.6`, a compatible range, a binary path, or a profile version. Those values in this contract describe expected test inputs, not visible copy.

### Delegation and failure copy

| Element/state | Exact copy pattern |
|---------------|--------------------|
| Consent heading | **Let Codex control this browser?** |
| Allowed scope | **Codex may drive FSB browser tools for this task.** |
| Forbidden scope | **It cannot edit files, run shell commands, or fetch arbitrary URLs.** |
| Start CTA | **Allow & start Codex** |
| Active run | **Codex is working in the background** |
| Control actions | **Take control** / **Resume with agent** |
| Stop | **Stop agent** / pending **Stopping agent…** |
| Stop result | **Agent stopped, {N} tab(s) released** with singular grammar for 1 |
| Unauthenticated heading | **Codex cannot start this task** |
| Unauthenticated body | **Sign in to Codex first. Open provider setup, refresh status, then try this message again.** |
| Unknown-auth heading | **Codex cannot start this task** |
| Unknown-auth body | **Codex sign-in status could not be verified. Open provider setup, refresh status, then try this message again.** |
| Generic terminal failure heading | **Agent could not finish this task** |
| Generic terminal failure body | **Codex stopped before the task was complete. Review the error details, then try the same message again.** |
| Generic failure CTA | **Try message again** |
| ChatGPT run-summary billing | **Included with your ChatGPT plan** |
| API-key run-summary billing | **Billed to the API key stored by Codex; dollar amount not reported.** |

`agent_protocol_drift` may appear only as a bounded code in existing expandable technical details, never as the sole user-facing explanation. Raw Codex error/status text is not copy.

### Destructive confirmation

Phase 65 adds no destructive action. Existing **Stop agent** remains the explicit kill switch and adds no second confirmation dialog. It changes immediately to disabled **Stopping agent…**; completion appears only after authoritative process-tree settlement and exact tab release.

---

## State and Interaction Contract

### Providers state matrix

| Safe projected state | Codex row/detail result | Interaction effect |
|----------------------|-------------------------|--------------------|
| No installed evidence | **Not installed**, fail-closed **Unsupported**, Account/Auth **Status unavailable**, Billing **Billing not reported** | Row remains selectable for setup; no start/recommendation authority is invented |
| Installed 0.142.5 + fresh matrix + `chatgpt` | **Installed**, **Supported**, exact ChatGPT auth/billing copy | Selectable and runnable only through ordinary preflight/consent |
| Installed 0.142.5 + fresh matrix + `api_key` | **Installed**, **Supported**, exact API-key auth/billing copy | Selectable and runnable only through ordinary preflight/consent |
| Installed supported Codex + `unauthenticated` | Compatibility remains independent; auth says **Not signed in** | Select/save allowed; task start blocks with sign-in guidance |
| Installed supported Codex + `unknown` | Compatibility remains independent; auth says **Status unavailable** | Select/save allowed; task start blocks until a fresh known state exists |
| Installed newer-than-tested Codex | **Installed**, **Degraded**; auth still follows fresh safe evidence | Selectable; never auto-selected or silently promoted to Supported |
| Stale compatibility/auth evidence | Prior availability may remain; compatibility becomes **Degraded** and auth becomes **Status unavailable** | Start blocks; refresh is the recovery action |
| Missing/corrupt/wrong-profile evidence | Compatibility **Unsupported** and auth **Status unavailable** | Selection is preserved; start remains fail-closed |
| Refresh pending | Retain last safe visible projection; disable only **Refresh status** | Preserve focus, checked radio, unsaved values, API keys, and dirty state |
| Refresh failure | Apply exact Degraded/Unsupported recovery copy and `unknown` auth | Preserve selection and prior non-auth evidence where valid |

- Selecting Codex updates only the in-form `{ providerKind: "agent", providerId: "codex" }` and current details. It does not probe, sign in, spawn, calculate price, mutate recommendation, or save.
- **Save Settings** is the sole persistence action. All seven API provider ids, inputs, saved values, request-builder behavior, and BYOK billing remain unchanged.
- Extension code consumes only the background-validated projection. It contains no version parser/comparator and cannot derive auth or billing from installed/connected evidence.
- Recommendation remains advisory and never changes selection or start authority.

### Consent, accepted identity, and lifecycle

1. Background-owned saved settings remain the provider authority. Side-panel send and consent requests contain no client-selected provider id, auth state, or billing kind.
2. Preflight must establish one exact safe `{providerId, label, profileVersion, authState, billingKind}` identity before consent. `unauthenticated` and `unknown` render the existing blocking card and never create an optimistic task bubble, run card, feed, or announcement.
3. Consent uses the shared Codex label/copy and binds the established auth/billing identity internally. Trust state cannot bypass a changed/unknown auth result.
4. Immediate daemon pre-spawn re-probe must match the bound identity. A mismatch fails before task stdin and routes to the shared preflight failure state once.
5. Once accepted, streaming, terminal settlement, persisted hydration, and summary use the immutable accepted identity. Current settings or later events cannot relabel the run or change its billing bucket.
6. A valid Codex JSON terminal remains a candidate only. Result and Run summary render only after clean child exit and completed tree/runtime cleanup.
7. Parser drift, foreign authority, nonzero/signal exit, missing candidate, cleanup failure, or unsettled tree renders one existing failed terminal state. No success summary appears first and no automatic replay occurs.
8. Task mode is the only mode. Do not show **Continue**, **Resume session**, a model/profile picker, output-file action, workspace-write affordance, shell/file/web approval, or dollar estimate.

### Feed and summary

- Render canonical Codex init, assistant, FSB tool-use/result, and authoritative result through the same classes and semantics as Claude Code/OpenCode. No `if (codex)` renderer branch is permitted.
- The init definition list may show Client, Model when safely present, Session, and Allowed tools. It never shows **Profile**, even when a real controller-produced snapshot carries non-null `profileVersion`.
- Only normalized completed agent messages appear. Reasoning and plan/todo content are silent and absent from DOM, live regions, persistence-derived copy, and tool breakdown.
- Completed result and summary show input/output/total tokens, turns, and duration. The existing tool-call breakdown remains expandable.
- Codex always carries `usd: null`. ChatGPT and API-key summaries use the exact auth-specific billing copy above. No dollar row, `$0`, placeholder dollar amount, estimate, or generic API price formatter is rendered.
- Rehydration is silent. It recreates the same auth/billing copy and feed without replaying live announcements.

---

## Responsive, Theme, and Motion Contract

- Preserve the existing two provider-group columns at `>=900px`, one column below `900px`, and full-width stacked compatibility line at `<=640px`.
- At `<=640px`, Codex name, evidence, compatibility, auth/billing details, and radio wrap without overlap or horizontal scrolling. No row order or semantic order changes.
- Preserve the delegated side panel's `<=350px` stacked action and one-column summary behavior. Every shared delegated action remains full width and at least `44px` high; the fixed delegated Stop remains at least `44px × 44px`.
- Use existing light/dark semantic tokens and forced-colors border styles. Add no raw light-only color or Codex/OpenAI brand color.
- Under `prefers-reduced-motion: reduce`, preserve immediate text/icon/border state changes while removing action transforms, entry tint, pulses, smooth scrolling, and Stop animation as the existing contract requires.

---

## Accessibility Contract

- The existing Codex native radio retains accessible name **Codex**. Its `aria-describedby` continues to reference separate evidence and compatibility descriptions; neither changes its value or name.
- Compatibility remains visible text plus decorative icon. Reuse the single Providers live region for explicit refresh feedback; do not make the badge itself a live region.
- Installation, Connection, Compatibility, Account/Auth, Usage, and Billing retain their current semantic headings/definition structure. Account/Auth and Billing remain separate so assistive technology does not merge login state with pricing.
- Background hydration is silent. A user-triggered refresh announces one polite success or one assertive failure without moving focus from the refresh button or selected radio.
- Consent and recovery headings keep the existing managed-focus behavior. Consent, recovery, Take control, Resume, in-card Stop, and fixed delegated Stop retain visible labels, visible focus rings, logical DOM focus order, disabled semantics, and minimum 44px targets.
- Feed entries remain semantic articles; metadata remains definition lists; technical detail remains native `<details>/<summary>`. Removing **Profile** removes both its term and value, leaving no orphaned or empty row.
- **Supported**, **Degraded**, **Unsupported**, active, stopped, and failure states remain distinguishable in forced colors by visible text, icon shape, and border treatment rather than color alone.
- Rehydrated rows do not replay announcements. Only strictly newer matching sequences announce once.

---

## Security and Data-Presentation Locks

- UI consumes only closed, bounded, background-validated provider and delegation view models. Raw Codex JSONL ends at the adapter parser.
- Login-status bytes, masked API-key prefix/suffix, `auth.json`, credential-store paths, environment variables, MCP roster/config, endpoint, binary path, profile/version, scratch path, task stdin, raw reasoning/plan text, tool arguments/results, and provider-native errors never enter DOM copy, attributes, CSS classes, extension state, fixtures presented as live, or normal logs.
- Auth/billing evidence is presentation plus consent-bound authority; compatibility remains observational. Neither may auto-select a provider, alter recommendation, mutate BYOK state, bypass preflight, or make settings dirty.
- All dynamic content uses existing text-only DOM construction. No `innerHTML`, provider-supplied URL, provider-supplied style, event-name-derived class, or Codex-specific renderer is added.
- A persisted run can render only its validated immutable five-field provider identity. Hostile extra keys, accessors, prototypes, stale state, or provider/auth/billing/profile changes fail closed rather than changing visible copy.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | None | Not applicable |
| Third-party | None | Not applicable |

Phase 65 adds no UI registry, block, dependency, remote script, or runtime visual asset. Existing Font Awesome and repository-owned FSB CSS remain the only visual assets.

---

## Deterministic Verification Contract

1. Prove Codex remains the third Agent CLI row with one native radio, evidence cluster, compatibility group, and compatibility description; row/order/visible HTML structure and all seven API provider rows remain unchanged.
2. Drive the existing provider mapper with real safe Codex evidence and assert exact Supported/Degraded/Unsupported outcomes, installed/connection independence, stale-auth-to-unknown behavior, and no UI-side version logic.
3. Assert all four Account/Auth states and exact billing copy. ChatGPT must say **Included with your ChatGPT plan**; API key must say **Billed to the API key stored by Codex; dollar amount not reported.**; unauthenticated must say **Sign in to Codex first.**; unknown must block with no billing claim.
4. Snapshot selection, focus, row order, recommendation, provider kind/id, seven API values, dirty state, and storage writes before refresh; assert preservation across Codex success, stale, failure, timeout, and storage fan-out.
5. Exercise provider-free preflight and shared consent. Assert unknown/unauthenticated never create a run; auth mismatch rejects before task stdin; ChatGPT/API-key identities persist unchanged through start, events, terminal handling, and hydration.
6. Render real controller-produced Claude Code, OpenCode, and Codex snapshots carrying non-null `profileVersion`. Assert identical provider-neutral DOM shape and no visible **Profile** term/value for any adapter.
7. Render completed ChatGPT and API-key Codex runs. Assert tokens, turns, duration, and exact billing caption; `usd` is null and no dollar text, price estimate, `$0`, or generic API formatter output exists.
8. Assert every `.delegation-action` has a computed/source-pinned minimum height of at least 44px in normal and `<=350px` layouts, and fixed `.stop-btn[data-delegation-action="stop"]` has both dimensions at least 44px. Preserve disabled and focus-visible behavior.
9. Feed drift, forbidden event, nonzero/signal exit, missing terminal, cleanup failure, and post-terminal data. Assert one failed state, no prior success/summary, no replay, and only bounded technical detail.
10. Retain existing light/dark, forced-colors, reduced-motion, `<=640px`, `<=350px`, keyboard/focus, live-region, and hydration-silence source/DOM tests. Automated tests may prove contracts but not claim live rendering or assistive-technology evidence.

### Testable acceptance criteria

- [ ] Codex is promoted through the existing third row and shared delegated UI with no new markup, row reorder, component, or Codex-specific renderer.
- [ ] Fresh safe auth evidence produces exactly the accepted ChatGPT/API-key/unauthenticated/unknown presentation and start behavior.
- [ ] Tokens, turns, and duration remain visible; every Codex USD value is null and no dollar amount is rendered.
- [ ] Real controller-produced snapshots retain internal `profileVersion` but no adapter renders a visible **Profile** row.
- [ ] Every shared delegated action, including fixed delegated Stop and narrow full-width actions, has a minimum 44px target.
- [ ] Focus order, live regions, theme/forced-colors/reduced-motion behavior, narrow layout, and all seven API providers remain unchanged.
- [ ] No credential/status bytes, native Codex event/reasoning data, profile/version, task text, endpoint, or price estimate reaches the presentation boundary.

---

## Deferred Human Evidence

Exactly these three scenarios remain unchecked and `human_needed`; deterministic source/DOM tests must not promote them:

| ID | Evidence | Status | Deferred gate |
|----|----------|--------|---------------|
| UAT65-01 | Genuine ChatGPT/API-key/unauthenticated auth matrix with exact safe copy and no credential/status leakage | `human_needed` | Single v0.9.91 milestone-end UAT sweep |
| UAT65-02 | Genuine Codex-to-browser delegation with cancellation/tree cleanup, authoritative completion, visible tokens/turns/duration, honest auth-specific billing, and no USD | `human_needed` | Single v0.9.91 milestone-end UAT sweep |
| UAT65-03 | Providers/delegation keyboard, screen-reader, light/dark/forced-colors/reduced-motion, zoom, and narrow-layout behavior, including 44px targets and no visible Profile row | `human_needed` | Single v0.9.91 milestone-end UAT sweep |

Live Chrome rendering, contrast, wrapping, focus visibility/order, announcement timing, assistive-technology output, genuine auth/account states, and process/browser cleanup remain human-owned evidence.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS — source contract; live optical/render evidence remains UAT65-03
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS — source contract; computed typography and zoom evidence remain UAT65-03
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved for source implementation; live evidence remains UAT65-01 through UAT65-03
