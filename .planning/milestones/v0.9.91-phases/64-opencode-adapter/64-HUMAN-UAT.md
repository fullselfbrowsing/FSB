---
phase: 64
status: human_needed
deferred_until: milestone-end
deferred_by: user
automated_verification: required-before-advance
results_recorded: false
live_checks: 3
---

# Phase 64 Human UAT — v0.9.91 Milestone-End Ledger

All three scenarios are deferred to the single user-directed v0.9.91 milestone-end sweep. None has been run during autonomous implementation. No fixture, fake process or HTTP server, source inspection, DOM harness, screenshot, or automated result is live provenance; none may check or promote a scenario.

Sanitization policy: Observers must not retain task text, credentials, model metadata, raw events, local paths, a port or endpoint, or the Basic secret. Record only the scenario id, reviewed outcome, and a short redacted note after a person performs the scenario.

External side-effect caution: A genuine delegated browser task may change remote state. The person running this sweep must choose a benign reversible action, confirm the intended scope before consent, and stop immediately if the selected site or account could cause an unintended external effect.

## Milestone-end group: Genuine OpenCode, browser, process, and accessibility evidence

### [ ] UAT64-01 — Genuine authenticated OpenCode-to-browser delegation

status: human_needed
result: pending

prerequisites: An installed OpenCode 1.14.25 CLI signed into a real account with an existing default model that is safe for a benign reversible task; the matching FSB MCP daemon and unpacked extension; a disposable browser profile; a site where external effects are controlled.

steps:

1. Start from a clean browser/daemon state, select OpenCode in Providers, and confirm preflight reports the installed provider without exposing native details.
2. Initiate one benign delegation, review the provider-bound consent copy, authorize it once, and observe the genuine authenticated OpenCode-to-browser delegation without copying native output into the evidence record.
3. Observe the provider-neutral feed through tool activity, then use the kill switch during a second harmless attempt and confirm browser control is reclaimed without replay.
4. Let a fresh harmless attempt finish and observe that success appears only after the completed terminal; inspect the final summary and the exact copy `Billing: Not reported`.

expected: OpenCode uses its real account and existing default model, consent remains provider-bound, the kill switch reclaims control exactly once, no stopped task replays, and the feed/summary expose only canonical OpenCode identity plus the approved unknown-billing copy.

evidence:

references: MULTI-01, MULTI-02, MULTI-03; D64-06, D64-08, D64-12, D64-14, D64-15; T64-02, T64-04, T64-08, T64-10.

### [ ] UAT64-02 — Installed 1.14.25 Providers, keyboard, and screen-reader behavior

status: human_needed
result: pending

prerequisites: Installed OpenCode 1.14.25; a paired unpacked extension in a disposable Chrome profile; keyboard-only input; a screen reader; light, dark, and forced-colors settings; no unrelated provider changes in progress.

steps:

1. Open Providers and confirm the existing second agent row identifies OpenCode, shows installed evidence and Supported compatibility, and keeps authentication and billing at `Not reported` without displaying a version, executable location, or server detail.
2. Navigate the native provider radio group and OpenCode setup/trust actions using only the keyboard; confirm focus remains visible and returns to the initiating control after each bounded action.
3. Trigger a genuine supported-to-stale refresh and one controlled failure, then listen for one shared live region to announce user-triggered changes once and in causal order while cold hydration remains silent.
4. Repeat the row inspection with the screen reader in light, dark, and forced-colors modes and confirm names, descriptions, status text, and order remain understandable without color alone.

expected: The unchanged Providers structure presents OpenCode in the exact existing row order with Supported and `Not reported` semantics; keyboard focus is coherent; the screen reader receives one shared live-region announcement per user-triggered transition; no UI exposes native authority or hidden process data.

evidence:

references: MULTI-01, MULTI-02, MULTI-03; D64-09, D64-13, D64-14; T64-05, T64-09, T64-10; Phase 64 UI Design Contract.

### [ ] UAT64-03 — Live cold and FSB-owned attach feed/summary equivalence

status: human_needed
result: pending

prerequisites: Installed and authenticated OpenCode 1.14.25; paired disposable Chrome profile; FSB daemon with no reusable owned lease for the first run and a verified FSB-owned lease for the second; two equivalent benign reversible tasks.

steps:

1. With no reusable lease, start one live cold delegation and observe one fresh task, provider-neutral feed ordering, terminal settlement, kill-switch availability, and final summary.
2. After FSB creates and verifies its owned server lease, start the equivalent live FSB-owned attach delegation and observe a new fresh task rather than continuation of the cold session.
3. Compare only the sanitized visible UI: confirm both paths produce the same provider-neutral feed, same terminal summary, canonical OpenCode label, `Billing: Not reported`, and completed state.
4. Exercise the kill switch on an attached attempt, then invalidate the lease before another attempt and confirm any fallback occurs before task-child spawn with no replay, duplicate feed, or duplicate terminal.

expected: Cold is the default without a verified lease; attach targets only an FSB-owned verified lease; every delegation is a fresh task; cold and attach have the same provider-neutral feed and same terminal summary; kill-switch settlement and pre-spawn fallback remain exact-once with no replay.

evidence:

references: MULTI-01, MULTI-02, MULTI-03; D64-01, D64-02, D64-04, D64-10, D64-12, D64-15; T64-03, T64-04, T64-07, T64-08, T64-10.

## Gate policy

- Every scenario remains `human_needed`, `pending`, and evidence-empty until a person performs and reviews the single milestone-end sweep.
- Automated parser, fixture, fake process/HTTP, source, storage, DOM, UI, and accessibility-contract checks remain blocking but cannot replace genuine external evidence.
- Any later evidence must follow the sanitization policy above and must not include native/provider payloads or values from the user's task, account, model, process, filesystem, network, or authentication material.
