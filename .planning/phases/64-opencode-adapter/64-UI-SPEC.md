---
phase: 64
slug: opencode-adapter
status: approved
shadcn_initialized: false
preset: none
created: 2026-07-20
reviewed_at: 2026-07-20T13:57:57Z
---

# Phase 64 — UI Design Contract

> Visual and interaction contract for projecting OpenCode through the existing Providers panel and provider-neutral delegated-run UI. Generated from `64-CONTEXT.md` and the approved Phase 58, 61, and 62 UI contracts; must be verified by `gsd-ui-checker` before planning.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | Existing hand-authored Chrome MV3 HTML/CSS/JavaScript; no shadcn initialization |
| Preset | Not applicable |
| Component library | None; reuse the current provider row, status badge, compatibility pill, detail fact, refresh/live-region, consent, run-card, feed-card, and summary patterns |
| Icon library | Existing Font Awesome 6.6 only; every icon remains decorative beside visible text |
| Font | Existing system stack (`-apple-system`, BlinkMacSystemFont, `Segoe UI`, Roboto, `Helvetica Neue`, sans-serif); monospace only for existing machine identifiers and commands |
| Token source | `extension/shared/fsb-ui-core.css`, `extension/ui/options.css`, and `extension/ui/sidepanel.css` |
| Theme | Existing light/dark and forced-colors mappings; no OpenCode theme fork |

Phase 64 adds no page, modal, disclosure, provider row, layout, component dependency, remote asset, or OpenCode-specific presentation branch. The shipped OpenCode row and provider-neutral delegated UI are the complete surface.

---

## Visual Scope and Hierarchy

### Providers panel

- Preserve the fixed roster and DOM order: Claude Code, **OpenCode**, Codex, then the seven API providers in their existing order. OpenCode remains the second row under **Agent CLIs**.
- Reuse the existing OpenCode native-radio row unchanged. Its visible name remains **OpenCode**; its recommendation badge, evidence badge, `Compatibility` group, compatibility description, and trailing radio retain separate DOM identities.
- Phase 64 changes only the safe data projected into existing nodes. A validated shipped OpenCode profile may now render **Supported** or **Degraded** instead of the Phase 62 fail-closed **Unsupported** default.
- The selected-agent detail region retains its current fields and order: Installation, Connection, Compatibility, Account/Auth, Setup, Local bridge pairing, Usage, and Billing. Do not add server mode, cold/attach topology, port, model, session continuation, or OpenCode provider-selection fields.
- Installation, connection, compatibility, recommendation, selection, Account/Auth, and Billing remain visually and behaviorally independent. No OpenCode state may recolor the full row, move the recommendation badge, check the radio, or disable selection.

### Delegated side panel

- Reuse the Phase 61 consent card, current-run card, chronological feed, human-control bar, Stop controls, result card, offline/disconnected cards, and composer behavior without new markup or card types.
- Substitute the canonical provider label into the existing provider-neutral copy: **Let OpenCode control this browser?**, **Allow & start OpenCode**, **OpenCode is working in the background**, and **OpenCode running**.
- Cold `opencode run` and attachment to an FSB-owned `opencode serve` process are intentionally invisible. Do not show topology badges, server URLs, ports, Basic Auth state, connection spinners, or different feed treatments.
- The existing feed receives only normalized provider-neutral events. OpenCode-native event names and payloads never become headings, classes, HTML, style data, or executable markup.

---

## Spacing Scale

Phase 64 introduces no spacing token. Existing provider and delegation components retain this 4-point scale:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Compatibility icon/label gap and inline metadata |
| sm | 8px | Badge padding, helper offset, compact control gap |
| md | 16px | Provider-row and fact-card padding |
| lg | 24px | Card subsections and stacked-group separation |
| xl | 32px | Existing detail-section separation |
| 2xl | 48px | Existing desktop form-section and blocking-state breathing room |
| 3xl | 64px | Existing provider-row minimum height only |

Exceptions: retain the shipped `12px` provider-row internal gap and `44px` minimum interactive target. Both are existing multiples-of-four values; Phase 64 adds no exception.

---

## Typography

Phase 64 introduces no type style. Providers uses exactly four inherited sizes and two weights, `400` and `600`:

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Metadata / help | 12px | 400 | 1.5 |
| Badge / fact label | 12px | 600 | 1.2 |
| Body / provider name | 14px | 400 or 600 | 1.4–1.6 |
| Group heading | 16px | 600 | 1.3 |
| Card heading | 18px | 600 | 1.25 |

- Use sentence case. Do not create an OpenCode wordmark treatment, all-caps label, logo font, or version badge.
- The delegated side panel retains its already-approved feed typography unchanged; Phase 64 adds no provider-specific type rule.
- Long safe text wraps. Compatibility labels and provider names never truncate into ambiguous text or cause horizontal scrolling.

---

## Color

The existing 60/30/10 distribution remains authoritative in light and dark themes:

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `var(--bg-secondary)` / `var(--fsb-surface-base)` (`#fffdfb` light, `#141110` dark) | Page/side-panel background and open space |
| Secondary (30%) | `var(--bg-primary)`, `var(--bg-tertiary)`, `var(--fsb-surface-elevated)`, `var(--border-color)` | Existing rows, cards, details, feed surfaces, and dividers |
| Accent (10%) | `var(--primary-color)` / `var(--fsb-primary)` (`#ff6b35`) | Checked provider row/radio, keyboard focus, existing links, Save, consent/start, and Resume actions only |
| Supported | `var(--success-color)` / `var(--fsb-success)` (`#10b981`) | **Supported** pill and check icon; completed result marker |
| Degraded | `var(--warning-color)` / `var(--fsb-warning)` (`#f59e0b`) | **Degraded** pill and warning icon; existing retry/held markers |
| Unsupported | `var(--error-color)` / `var(--fsb-danger)` (`#dc2626`) | **Unsupported** pill and x icon; failed/disconnected marker |
| Destructive | `var(--fsb-danger)` (`#dc2626`) | Existing **Stop agent** controls only |

Accent is reserved for the checked provider state, keyboard focus, existing links and persistence actions, consent/start, Resume, and the active-run marker. It is not used for OpenCode branding, recommendation, availability, compatibility, auth, or billing.

Every semantic state includes exact visible text plus the existing icon/border treatment. Compatibility color never recolors the provider name, entire row, radio, recommendation, installation evidence, Account/Auth, Billing, or setup action.

---

## Copywriting Contract

### Existing actions and baseline states

| Element | Exact copy |
|---------|------------|
| Primary CTA in Providers | **Save Settings** (existing global action; Phase 64 adds no CTA) |
| OpenCode row | **OpenCode** |
| Existing refresh action | **Refresh status** / pending **Refreshing…** |
| Empty state heading | **No agent CLI detected** |
| Empty state body | **You can select an agent now and follow its setup guide, or continue with an API provider.** |
| Setup CTA | **Open setup guide** in Providers; **Open provider setup** in delegated recovery |
| Account/Auth | **Not reported** |
| Account/Auth help | **The CLI has not reported its account type.** |
| Billing label | **Billing not reported** |
| Usage empty state | **No delegated runs yet** |
| No-credential caption | **FSB uses this CLI's existing sign-in and does not need its credential. Billing and limits follow the account or provider configured in the CLI.** |
| OpenCode billing body | **Uses the provider configured in OpenCode. FSB does not need that provider credential. Charges may come from OpenCode Zen or the configured provider.** |
| Billing link | **Review OpenCode providers and billing** → `https://opencode.ai/docs/providers/` |
| Optional secondary link | **Review OpenCode Zen** → `https://opencode.ai/docs/zen/` |

OpenCode auth remains machine value `unknown` and visible **Not reported** throughout Phase 64. The Providers Billing field and delegated run summary must therefore show **Billing not reported**. They must not show **Included in your subscription**, a dollar amount, “free,” “unlimited,” or an inferred provider/account classification.

### Compatibility and refresh copy

| State | Badge | Exact detail copy |
|-------|-------|-------------------|
| Fresh fixture-tested profile | **Supported** | **This CLI is within FSB's fixture-tested compatibility range.** |
| Newer-than-tested compatible evidence | **Degraded** | **This CLI is newer than FSB's fixture-tested range. You can keep it selected; existing start checks still apply.** |
| Stale evidence | **Degraded** | **Compatibility evidence is stale. Refresh status to check again.** |
| Missing, invalid, unshipped, or unsupported evidence | **Unsupported** | **FSB cannot verify compatibility for this CLI. Refresh status or review setup before starting a task.** |
| Manual refresh success with a changed selected status | — | **Provider status refreshed. Compatibility is now {Supported\|Degraded\|Unsupported}.** |
| Refresh failure with cached support | — | **Compatibility data could not be refreshed. Cached support is now Degraded.** |
| Refresh failure without valid evidence | — | **Compatibility data is unavailable. Showing Unsupported.** |

Do not add **Unknown**, **Unverified**, a version badge, or a fourth compatibility state.

### Delegation and failure copy

| Element/state | Exact copy pattern |
|---------------|--------------------|
| Consent heading | **Let OpenCode control this browser?** |
| Allowed scope | **OpenCode may drive FSB browser tools for this task.** |
| Forbidden scope | **It cannot edit files, run shell commands, or fetch arbitrary URLs.** |
| Start CTA | **Allow & start OpenCode** |
| Active run | **OpenCode is working in the background** |
| Control actions | **Take control** / **Resume with agent** |
| Stop | **Stop agent** / pending **Stopping agent…** |
| Stop result | **Agent stopped, {N} tab(s) released** with singular grammar for 1 |
| Not-ready heading | **OpenCode cannot start this task** |
| Not-ready body | **OpenCode could not use a signed-in account and model. Open provider setup, confirm OpenCode can run non-interactively, then try this message again.** |
| Generic terminal failure heading | **Agent could not finish this task** |
| Generic terminal failure body | **OpenCode stopped before the task was complete. Review the error details, then try the same message again.** |
| Generic failure CTA | **Try message again** |
| Run-summary billing | **Billing not reported** |

The not-ready copy is supplied through the existing provider-neutral preflight model with the canonical CLI label; it does not justify an OpenCode-only card or renderer branch. `agent_protocol_drift` may appear only in expandable technical details, never as the sole user-facing explanation.

### Destructive confirmation

Phase 64 adds no destructive action. Existing **Stop agent** remains the explicit kill switch and does not add a second confirmation dialog. It changes immediately to disabled **Stopping agent…**, and completion is shown only after authoritative supervisor settlement and exact tab release.

---

## State and Interaction Contract

### Providers state matrix

| Safe projected state | OpenCode row/detail result | Interaction effect |
|----------------------|----------------------------|--------------------|
| No installed evidence | **Not installed** plus fail-closed **Unsupported**; setup guidance remains available | Selectable; no recommendation or start authority is invented |
| Installed OpenCode 1.14.25 with fresh validated matrix evidence | **Installed** and **Supported** | Selectable; existing preflight remains authoritative |
| Installed newer-than-tested profile classified by the daemon | **Installed** and **Degraded** | Selectable; no automatic provider change |
| Stale prior support | Availability is preserved; compatibility becomes **Degraded** | Selectable; refresh remains the only compatibility action |
| Missing/corrupt/invalid/wrong-profile evidence | Availability remains independent; compatibility is **Unsupported** | Selectable; existing preflight fails closed as needed |
| Auth absent | Account/Auth **Not reported** and Billing **Billing not reported** | No effect on selection or recommendation |
| Refresh pending | Retain the last projected compatibility; disable only **Refresh status** | Preserve focus, checked radio, unsaved values, and dirty state |
| Refresh failure | Use the exact Degraded/Unsupported recovery copy above | Preserve selection and prior evidence where valid |

- Selecting the OpenCode radio updates only the in-form `{ providerKind: "agent", providerId: "opencode" }`, renders the existing details region, and follows the existing unsaved-changes path. It does not detect, spawn, attach, or mutate a CLI.
- **Save Settings** remains the sole Providers persistence action. Recommendation and compatibility refresh never save or select OpenCode.
- Only the daemon classifies versions. Extension UI may accept the closed, background-validated OpenCode compatibility projection, but it must not contain `1.14.25`, a semantic-version parser/comparator, a tested range, a binary path, or a provider-native version rule.
- Codex remains visibly fail-closed **Unsupported** until Phase 65; making OpenCode shippable must not widen all dormant agent rows.

### Delegation lifecycle

1. Preflight, native wake when applicable, pairing, and consent retain the established order. No task bubble or run card appears before authoritative start acknowledgement.
2. Cold execution is the default. Attach is used only for a verified FSB-owned server. Before a provider session or task exists, an attach failure may fall back to cold without creating a duplicate user message, feed, announcement, or consent prompt.
3. Once a task is accepted or any event is observed, failure settles exactly once. The UI must not offer or perform automatic replay, attach-to-cold fallback, session continuation, or optimistic retry.
4. `step_finish` is not visible terminal truth by itself. Render a successful result/summary only after the normalized stream has exactly one valid terminal candidate and the child exits cleanly.
5. Provider error, protocol drift, missing/duplicate terminal, nonzero exit, signal exit, or data after terminal renders one existing failed terminal state. Never show a transient or persisted successful summary first.
6. The init card accepts canonical `{ id: "opencode", label: "OpenCode" }` through the same closed client identity model as Claude Code. Rendering logic remains provider-neutral; no `if (opencode)` display branch is permitted.
7. Task mode remains the only mode. Do not show **Continue**, **Resume session**, conversation history, an OpenCode model/provider picker, or a server-persistence control.

---

## Responsive, Theme, and Motion Contract

- No new CSS is expected. Preserve the existing two provider-group columns at `>=900px`, one column below `900px`, and the full-width stacked compatibility line at `<=640px`.
- At `<=640px`, OpenCode name, evidence, compatibility, and details wrap without overlapping the trailing radio or introducing horizontal scroll. Existing buttons remain full-width with at least `44px` targets.
- The delegated side panel retains its existing `<=350px` stacked actions and one-column summary behavior. OpenCode does not receive a wider card or special breakpoint.
- Use existing light/dark semantic token mappings and forced-colors border styles. Do not add raw light-only colors or an OpenCode brand color.
- Under `prefers-reduced-motion: reduce`, retain the existing removal of icon animation, pulses, transforms, smooth scrolling, and status transitions. Data changes remain visible through immediate text, icon, and border updates.

---

## Accessibility Contract

- The existing OpenCode native radio retains accessible name **OpenCode**. Its `aria-describedby` references separate evidence and compatibility descriptions; neither becomes part of the radio value or replaces its name.
- Compatibility remains visible text plus a decorative icon. Do not put `role="status"` on the badge. Reuse the single Providers live region for explicit refresh feedback.
- Background hydration is silent. A user-triggered refresh announces one polite success or one assertive failure without moving focus from the refresh button or selected radio.
- **Supported**, **Degraded**, and **Unsupported** remain distinguishable in forced colors through text, icon shape, and the existing solid/dashed/double border styles.
- Selected-agent details retain `<dl>` semantics with distinct Installation, Connection, Compatibility, and Account/Auth terms. Account/Auth is visibly **Not reported** and is never merged with Billing.
- Consent and delegated controls retain their existing focus order and visible labels. Feed entries remain semantic articles; metadata remains definition lists; technical detail remains native `<details>/<summary>`.
- Rehydrated persisted rows do not replay announcements. Only strictly newer matching sequences are announced.

---

## Security and Data-Presentation Locks

- UI consumes only closed, bounded, background-validated provider and delegation view models. OpenCode-native JSON ends at the adapter parser.
- Task text, raw prompts, Basic Auth secret, server URL/port, binary path, environment, private config path, provider credential, plugin/agent data, raw model metadata, and lifecycle receipts never enter DOM copy, attributes, CSS classes, extension storage, or normal logs.
- Compatibility remains observational. It cannot select a provider, alter recommendation, grant spawn authority, bypass preflight, change auth/billing, or mark settings dirty.
- Cold/attach topology remains supervisor-owned. UI cannot discover, attach to, mutate, stop, or imply ownership of a user's existing OpenCode process.
- All dynamic content is assigned through the existing text-only DOM construction. No `innerHTML`, provider-supplied URL, provider-supplied style metadata, or event-name-derived class is added for OpenCode.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | None | Not applicable |
| Third-party | None | Not applicable |

Phase 64 adds no UI registry, block, dependency, remote script, or runtime asset. Existing Font Awesome and repository-owned FSB CSS are the only reused visual assets.

---

## Deterministic Verification Contract

1. Prove the OpenCode row remains the second Agent CLI row with exactly one native radio, evidence cluster, compatibility group, and compatibility description; no new Phase 64 HTML or CSS structure is introduced.
2. Drive the existing mapper with safe projected OpenCode states and assert: fresh tested → **Supported**, newer → **Degraded**, stale support → **Degraded**, absent/corrupt/invalid → **Unsupported**. Codex must remain **Unsupported**.
3. Assert exact OpenCode Account/Auth and Billing output: **Not reported**, **The CLI has not reported its account type.**, **Billing not reported**, the approved provider/Zen copy, and fixed opener-isolated links. Assert no subscription or dollar claim.
4. Snapshot selected radio, focus, row order, recommendation, provider kind/id, API values, dirty state, and storage writes before refresh; assert identity after every OpenCode compatibility transition, success, failure, timeout, and storage fan-out.
5. Feed the renderer a canonical OpenCode init plus the same provider-neutral lifecycle shapes used by Claude Code. Assert identical DOM classes/semantics and one canonical label substitution, with no provider-specific render branch or new raw field.
6. Exercise cold success and verified-attach success through the same UI snapshot expectations. Exercise pre-task attach fallback and assert one start/consent/feed. Exercise post-accept failure and assert one failed terminal with no replay.
7. Prove a candidate result cannot render success before clean exit; protocol drift, missing/duplicate terminal, post-terminal data, and nonzero/signal exits remain failed and expose `agent_protocol_drift` only in technical details where applicable.
8. Source-pin that extension presentation contains no OpenCode version/range, semver logic, binary path, server URL/port, Basic Auth secret, raw JSONL, provider model picker, session-continuation control, topology label, or dynamic HTML path.
9. Retain existing light/dark, `<=640px`, `<=350px`, keyboard/focus, forced-colors, live-region, hydration-silence, and reduced-motion tests. Update source-pin counts in the same implementation change when required.

### Testable acceptance criteria

- [ ] OpenCode becomes visually **Supported** or **Degraded** only from valid background-projected compatibility evidence; all other input is **Unsupported**.
- [ ] Availability, compatibility, recommendation, selection, Account/Auth, and Billing stay visibly and behaviorally separate.
- [ ] OpenCode auth and run-summary billing remain **Not reported**; no subscription or dollar value is fabricated.
- [ ] OpenCode uses the existing radio/details/consent/feed/summary components with no new layout, card, CSS branch, or provider-specific renderer.
- [ ] Cold and attach execution are indistinguishable to the user and cannot create duplicate messages, consent, feed entries, or terminal results.
- [ ] Success appears only after one valid terminal candidate plus clean exit; every drift/exit error fails once without replay.
- [ ] No OpenCode secret, topology, version policy, raw provider event, user task, or provider credential reaches the presentation boundary.

---

## Deferred Human Evidence

| Evidence | Status | Deferred gate |
|----------|--------|---------------|
| Genuine authenticated OpenCode-to-browser delegation with real provider/model configuration | `human_needed` | Single v0.9.91 milestone-end UAT sweep |
| Live Providers transition for installed OpenCode 1.14.25 and keyboard/screen-reader announcement behavior | `human_needed` | Single v0.9.91 milestone-end UAT sweep |
| Live cold and FSB-owned attach paths producing the same provider-neutral feed and terminal summary | `human_needed` | Single v0.9.91 milestone-end UAT sweep |

Synthetic fixtures and source inspection must not promote these rows or fabricate live visual/accessibility evidence.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: FLAG — primary-surface focal points are implicit rather than explicitly named; non-blocking because Phase 64 adds no new surface or layout
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved
