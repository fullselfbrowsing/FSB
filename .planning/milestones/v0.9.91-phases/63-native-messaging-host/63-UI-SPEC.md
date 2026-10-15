---
phase: 63
slug: native-messaging-host
status: approved
reviewed_at: 2026-07-16T22:57:58Z
shadcn_initialized: false
preset: none
created: 2026-07-16
---

# Phase 63 — UI Design Contract

> Visual and interaction contract for the optional native-host wake attempt in the existing delegated-task offline flow, plus the additive human-readable doctor section. Generated from `63-CONTEXT.md`, NATIVE-01..04, and the approved Phase 61/62 UI contracts; must be verified by `gsd-ui-checker` before planning.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | Existing hand-authored Chrome MV3 HTML/CSS/JavaScript and existing plain-text CLI output; no shadcn initialization |
| Preset | Not applicable |
| Component library | None; extend the current delegation state card, semantic heading, action row, and shared announcer patterns |
| Icon library | Existing Font Awesome 6.6 only; any pending icon is decorative beside visible text |
| Font | Existing system stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif` |
| Token source | `extension/shared/fsb-ui-core.css` and `extension/ui/sidepanel.css` |
| Theme | Existing light/dark token mapping; no native-host-specific theme fork |

The extension surface remains inside `extension/ui/sidepanel.html` and the existing full-width `#delegationRun` / `#delegationStateCard` region. Phase 63 adds no page, settings section, Providers badge, install wizard, modal, toast system, per-platform UI branch, or persistent host-status indicator. Native-host presence detection at service-worker boot is visually silent and never wakes the daemon.

The repository is not a React/Next/Vite UI for this surface and has no `components.json`; the shadcn initialization gate is not applicable. Existing vanilla components and tokens remain authoritative.

---

## Dimension 1 — Copywriting

### Side-panel copy

| Element | Exact copy |
|---------|------------|
| Transient heading | `Checking local agent service` |
| Transient body | `FSB is trying to make the local agent service available. Your message has not been sent.` |
| Transient polite announcement | `Checking local agent service. Your message has not been sent.` |
| Header status during the bounded attempt | `Checking agent service` |
| Existing offline heading | `Agent offline` |
| Existing offline body | `FSB cannot reach the local agent service. Run the doctor command, then try this message again.` |
| Existing doctor action | `Copy doctor command` |
| Existing setup action | `Open provider setup` |
| Existing copied feedback | `Doctor command copied` |
| Existing doctor command | `fsb-mcp-server doctor` |
| Existing unpaired heading pattern | `Pair this browser before starting {CLI}` |
| Existing unpaired body | `FSB can reach the local agent service, but this browser has not been paired with it. Open provider setup, pair this browser, then try this message again.` |

Capitalization and punctuation are normative. The transient copy deliberately says “trying” and “has not been sent”: the native host may be missing, may attach to an already-running daemon, or may fail after reporting a lifecycle fact. Do not render `Starting agent`, `Agent online`, `Daemon started`, `Native host connected`, or any success claim before authenticated bridge readiness and the rerun preflight establish the next authoritative state.

There is no new Retry, Install, Repair, Wake, or Restart action in the side panel. After fallback, the preserved composer and existing Send action remain the explicit retry path; each new Send is a new user intent. `Copy doctor command` and `Open provider setup` never trigger a wake attempt.

### Doctor text projection

Add one section to the existing `fsb-mcp-server doctor` human output, after `Bridge auth:` and before `Install paths:`:

```text
Native messaging host:
  Install state: {Installed|Not installed|Invalid|Unavailable}
  Expected location: {bounded platform path or HKCU registry location}
  Manifest/registry: {Valid|Missing|Invalid|Unavailable}
  Chrome allowlist: {Matches|Mismatch|Not reported}
  Launcher: {Reachable|Missing|Invalid|Unavailable}
  Daemon: {Reachable|Offline|Unavailable}
  Reason: {stable_reason_code}
```

- The section is factual and read-only. It never says that doctor installed, repaired, woke, started, paired, or uninstalled anything.
- `Expected location` may contain the local user-scope path or Windows HKCU location in CLI output because NATIVE-04 requires it. Browser-safe projections must omit that value and all registry details.
- Stable reason codes may appear in doctor output, but native protocol errors, exception text, manifest contents, raw registry values, child output, environment values, usernames, secrets, session/pairing values, and task text never do.
- Explicit `install --native-host` and `uninstall --native-host` commands may report their factual result and expected location. They do not add an interactive confirmation prompt, and a foreign/mismatched entry must say it was not changed and direct the user to `fsb-mcp-server doctor` for repair details.

### Template copy roles

| Template element | Phase 63 contract |
|------------------|-------------------|
| Primary CTA | No new CTA; retain the existing Send action and Phase 61 recovery actions |
| Empty state heading | Retain `Delegate a browser task` |
| Empty state body | Retain `Choose an agent provider, describe the outcome, and FSB will run it in a background tab.` |
| Error state | Exact `Agent offline` heading/body plus doctor and setup actions above |
| Destructive confirmation | No in-extension destructive action; `uninstall --native-host` is an explicit CLI command and reports only exact owned-artifact removal |

---

## Dimension 2 — Visuals and Interaction

### Hierarchy and placement

1. Reuse the existing full-width `.delegation-state-card` at the top of `.chat-messages`; never add a second card, banner, modal, or message bubble for native-host state.
2. During a background-authoritative bounded wake attempt, render the transient heading and body in that card, set the run region busy, and keep the feed empty. The unchanged composer remains visible below it.
3. Use the existing semantic-heading pattern with one `fa-spinner` icon beside the visible heading. The icon is decorative and may rotate under normal motion preferences; the text is the complete status cue.
4. The pending card contains no command, action row, success badge, countdown, platform name, native-host name, manifest path, binary path, reason code, or technical detail disclosure.
5. On failure, replace the pending presentation in place with the exact Phase 61 danger-tone offline card, doctor command, and two recovery actions. Do not stack pending and failure cards.
6. On authenticated bridge readiness, remove the pending presentation and continue through the existing rerun-preflight result: consent/ready behavior when ready, the exact unpaired card when reachable but unpaired, or the exact offline fallback when readiness/preflight still fails. Do not insert a native-host success toast between states.

### Closed state matrix

| Background-owned condition | Visible state | Interaction result |
|----------------------------|---------------|--------------------|
| Boot probe pending, host present, host absent, or probe unavailable | No visual change and no announcement | No daemon wake; normal side panel remains ready |
| Existing preflight is ready | Existing Phase 61 flow | No native-host UI appears |
| Authoritative preflight is offline and one wake attempt is in flight | `Checking local agent service` info-tone card | Original task remains unsent; duplicate Send activation is suppressed |
| Host reports `already running` or `started`, authenticated bridge readiness is still pending | Same checking card | Remain non-optimistic; no success wording or feed/session mutation |
| Bridge becomes ready and the one allowed rerun preflight is ready | Existing consent/trusted-start flow | Continue only from the still-current explicit Send intent |
| Bridge becomes ready but is unpaired | Existing `Pair this browser before starting {CLI}` state | No native secret transport or auto-pairing |
| Host missing, runtime error, malformed response, timeout, unavailable/failed response, readiness timeout, or rerun preflight still offline | Exact existing `Agent offline` card | Composer/task preserved; Send is re-enabled as the explicit retry path |
| Concurrent callers share one background wake | One checking card and one polite announcement per side-panel intent | No duplicate card, spinner, timer, alert, or retry loop |
| Composer text changes while the bounded attempt is unresolved | Never auto-start the captured or edited text | Clear pending when settled and require a fresh explicit Send for the new text |

### Composer, focus, and feedback

- Preserve composer text byte-for-byte. Do not create a user bubble, conversation row, delegation id, event-ledger entry, session/feed record, tab lease, consent challenge, or start request merely because wake was attempted.
- Disable duplicate Send activation while the current preflight/wake is pending, using the existing pending-preflight gate. Do not clear or replace the visible text. If current implementation permits editing during preflight, a text change invalidates continuation and requires a fresh Send.
- Entering the checking state does not programmatically move focus. It does not focus the card, spinner, or announcer and does not trap keyboard navigation.
- Announce the transient state once through the existing `#delegationAnnouncer` polite region. Boot probing and service-worker hydration are silent. Repeated background facts for the same in-flight attempt do not re-announce.
- Failure retains the existing Phase 61 `role="alert"` and heading-focus behavior. Success follows the existing consent/focus contract; it does not add a separate focus stop.
- The top header may show `Checking agent service` only while the background-authoritative attempt is in flight. It returns to the state produced by rerun preflight, never to a locally inferred success state.

---

## Dimension 3 — Color

The Phase 61 side-panel 60/30/10 distribution remains authoritative.

| Role | Token | Reserved usage |
|------|-------|----------------|
| Dominant (60%) | `var(--fsb-surface-base)` | Side-panel background and open feed space |
| Secondary (30%) | `var(--fsb-surface-elevated)`, `var(--fsb-surface-muted)`, `var(--fsb-border-subtle)` | Existing state card, command block, and secondary actions |
| Accent (10%) | `var(--fsb-primary)` and `var(--fsb-focus-ring)` | Existing Send/consent/resume actions, active-run marker, and keyboard focus only |
| Information | `var(--fsb-info)` | Checking-state left border and decorative spinner only |
| Destructive/error | `var(--fsb-danger)` | Existing offline card semantic marker only |

Accent is reserved for the existing primary actions and focus ring; a wake attempt is not a primary action and does not use orange. Do not use success green for `already running` or `started`, because those native-host facts do not prove pairing, provider availability, or delegation start. Do not recolor the composer, Send control, provider identity, feed, or whole card background based on host presence.

Every state is conveyed by visible text plus border/icon shape, not color alone. Dark mode uses existing token remapping; new raw light/dark literals are prohibited.

---

## Dimension 4 — Typography

Phase 63 adds no type scale and uses the Phase 61 four sizes and two weights.

| Role | Size | Weight | Line height | Usage |
|------|------|--------|-------------|-------|
| Metadata | 11px | 400 | 1.4 | Existing bounded technical/session metadata only |
| Label | 12px | 600 | 1.4 | Existing header status and actions |
| Body | 14px | 400 | 1.5 | Checking and offline body copy |
| Heading | 16px | 600 | 1.25 | Checking, offline, and unpaired headings |

- Use sentence case. Do not add all-caps host state, abbreviated status, or icon-only status.
- Monospace remains limited to the literal doctor command in the side panel and machine/path values in terminal doctor output.
- The checking and fallback copy wraps naturally; it is never ellipsized or hidden behind a tooltip.

---

## Dimension 5 — Spacing and Responsive Behavior

All new Phase 63 spacing uses the Phase 61 4-point-compatible scale.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Inline icon-to-heading gap |
| sm | 8px | Heading/body and compact action gaps |
| md | 16px | Existing state-card padding and body stack |
| lg | 24px | Existing major card subsection separation |
| xl | 32px | Existing blocking-state separation |
| 2xl | 48px | Existing offline focal-state breathing room |
| 3xl | 64px | Reserved major surface separation; not newly consumed |

Exceptions: none. Phase 63 introduces no new interactive target.

- At `max-width: 350px`, the checking heading/body wrap within the existing card with no horizontal scroll. The existing offline actions continue to stack full-width.
- At `min-width: 500px`, keep the same readable side-panel text measure; do not stretch the transient state into a dashboard layout.
- The spinner stays inline with the heading and never receives its own column or focus target.
- Replacing checking with fallback/consent occurs in the same card region. Do not smooth-scroll, animate height, or move the composer.
- Under `prefers-reduced-motion: reduce`, stop spinner rotation and all new transitions/transforms. The static info icon and full text remain visible.
- In forced-colors/high-contrast mode, preserve a visible card border and semantic icon/text; do not rely on a tinted background.

---

## Dimension 6 — Registry Safety

| Registry | Blocks used | Safety gate |
|----------|-------------|-------------|
| shadcn official | None | Not applicable |
| Third-party | None | Not applicable |

Phase 63 adds no UI dependency, registry block, remote asset, runtime component package, font, or telemetry surface. Existing Font Awesome and shared FSB CSS are the only reused visual assets.

---

## Semantic and Accessibility Contract

- The pending card uses the existing semantic `<h2>` structure and sets the containing run region `aria-busy="true"`; it is not an alert. The decorative spinner has `aria-hidden="true"`.
- Use the one existing `role="status" aria-live="polite"` announcer for the exact transient announcement. Do not add a second live region or apply `role="status"` to the card or spinner.
- The pending state is announced once per explicit Send intent. Boot detection, cached host-presence hydration, service-worker restoration, native lifecycle substeps, and duplicate/coalesced callers are silent.
- The failure state keeps the existing one-shot assertive offline alert and visible doctor recovery. A missing host and a failed host intentionally share the same browser-safe fallback; detailed diagnosis belongs to CLI doctor.
- Focus remains where the user left it during checking. The pending card has no tabbable descendants. Existing fallback and consent focus rules resume only after the checking state settles.
- The disabled/busy Send state remains understandable through the checking card and polite announcement; do not communicate pending state with a spinner alone.
- Light/dark theme, narrow layout, zoom, forced colors, keyboard navigation, screen-reader output, and reduced-motion behavior must preserve the same information and action order.

---

## Implementation Boundary and Security Locks

### Ownership

- Background/service-worker code is the sole authority for host-presence probing, native messaging, in-flight coalescing, timeout/backoff, authenticated bridge readiness, and the one allowed rerun preflight.
- Side-panel code renders only a closed, background-owned presentation state and the existing bounded preflight result. It never calls `chrome.runtime.connectNative`, `chrome.runtime.sendNativeMessage`, process APIs, shell/native commands, install/uninstall, or doctor execution.
- The native host and local doctor own platform paths, manifest/registry inspection, launcher status, and stable reason codes. No platform-specific path, host name, registry key/value, launcher path, or raw native response reaches side-panel DOM or storage.
- The authenticated bridge and existing preflight remain the only authority for ready, offline, and unpaired presentation. Native `already running` / `started` is not UI authority by itself.

### Prohibited behavior

- No wake at extension load, service-worker boot, provider refresh, card hydration, tab activation, Providers selection, doctor-copy, or setup navigation.
- No automatic install, repair, uninstall, pairing, secret transport, delegation start replay, chat/message replay, or repeated wake loop.
- No optimistic user bubble, feed row, run card, success badge, timer, provider status, tab ownership, composer clearing, or local “ready” inference.
- No native manifest contents, username, environment variable, secret, pairing/session value, task/prompt, child output, raw registry value, local path, or exception string in browser-safe projections, DOM, storage, announcements, or logs.
- The additive `nativeMessaging` permission does not alter any other extension or host permission and grants no UI-side native authority.

---

## Deterministic Verification Contract

Automated/source verification is blocking for Phase 63; genuine OS/browser/native behavior remains deferred.

1. Extend the side-panel DOM/source harness to pin the exact checking copy, info-tone semantic heading, one decorative spinner, one existing polite announcer, busy state, no action row during checking, and exact Phase 61 offline/unpaired fallback copy.
2. Prove boot host detection renders nothing, announces nothing, moves no focus, and does not start the daemon. Host present/absent/unavailable at boot must be visually identical.
3. Table-test checking → ready/consent, checking → unpaired, and every missing/error/malformed/timeout/readiness/rerun-offline case → exact offline fallback. No native success toast or fourth terminal browser state is allowed.
4. Snapshot composer text, selected conversation, message/feed rows, session/ledger writes, delegation id, tab leases, focused element, provider state, and storage writes before wake; assert no optimistic mutation through pending and failure.
5. Prove one in-flight attempt produces one checking card and one polite announcement, concurrent callers do not duplicate UI, and a composer edit prevents stale captured text from continuing without a fresh Send.
6. Source-pin that side-panel/UI modules contain no native API call, platform branch, host/manifest/registry/binary path, install/uninstall execution, native reason parser, daemon-start command, or secret/prompt field.
7. Source-pin token-only light/dark styling, `max-width: 350px` wrapping, forced-color non-color cues, focus preservation, and reduced-motion suppression of spinner/transition animation.
8. Extend doctor text/JSON tests to prove the closed native-host section derives from one bounded snapshot, the CLI-only expected location is ordered after Bridge auth, browser-safe projections omit it, and forbidden raw values never serialize.
9. Preserve the exact manifest permission delta: add only `nativeMessaging`, with all other permissions/host permissions byte-stable. Retain Phase 59–62 authority, source-pin, and full-suite gates.

### Testable acceptance criteria

- [ ] Service-worker boot detection has no visible state, announcement, focus change, or wake side effect.
- [ ] An offline-triggered wake displays one truthful checking card without claiming start, pairing, provider availability, or message submission.
- [ ] The original task is preserved; no user bubble, run/session/feed/tab state, consent, or delegation start is created before authoritative preflight continuation.
- [ ] Missing, failed, malformed, timed-out, or still-offline wake paths converge on the exact existing Agent offline card and actions.
- [ ] Reachable-but-unpaired converges on the exact existing pairing state; native messaging never transports or repairs pairing state.
- [ ] Side-panel code has no direct native/process/platform authority and receives no local path, registry, launcher, secret, task, or raw diagnostic detail.
- [ ] Light/dark, narrow, keyboard/focus, live-region, forced-color, and reduced-motion source/DOM contracts pass deterministically.

---

## Deferred Human Evidence

| Evidence | Status | Deferred gate |
|----------|--------|---------------|
| Rendered checking → fallback/consent/unpaired transitions in light, dark, normal, and `<=350px` side-panel layouts | `human_needed` | Single v0.9.91 milestone-end UAT sweep |
| Keyboard, focus retention, screen-reader announcement order, forced-colors, zoom, and reduced-motion behavior in Chrome | `human_needed` | Single v0.9.91 milestone-end UAT sweep |
| Published and unpacked Chrome integration with host present, missing, malformed, timed out, already-running, started, bridge-ready, and unpaired outcomes | `human_needed` | Single v0.9.91 milestone-end UAT sweep |
| Genuine macOS, Linux, and Windows user-scope install/doctor/wake/attach/uninstall behavior | `human_needed` | Single v0.9.91 milestone-end UAT sweep |

These checks must not be marked passed from source inspection, synthetic DOM tests, mocked native framing, or platform-adapter unit tests. Keep their evidence fields pending and empty until the user-directed milestone-end sweep; do not fabricate screenshots, accessibility results, native-host installation, or live wake evidence.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-07-16 after independent checker PASS
