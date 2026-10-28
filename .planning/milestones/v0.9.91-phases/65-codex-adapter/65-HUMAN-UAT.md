---
phase: 65
status: human_needed
deferred_until: milestone-end
deferred_by: user
automated_verification: required-before-advance
results_recorded: false
live_checks: 3
---

# Phase 65 Human UAT — v0.9.91 Milestone-End Ledger

All three scenarios are deferred to the single user-directed v0.9.91 milestone-end sweep. None has been run during autonomous implementation. No schema-derived fixture, fake process, injected account state, source inspection, DOM harness, screenshot, or automated result is live provenance; none may check or promote a scenario.

Sanitization policy: Observers must not retain task text, credentials, masked API-key fragments, raw login-status bytes, raw Codex events, reasoning or plan text, tool arguments or results, local paths, binary or profile versions, an MCP endpoint or roster, process identifiers, account metadata, or browser content. Record only the scenario id, reviewed outcome, and a short redacted note after a person performs the scenario.

External side-effect caution: A genuine delegated browser task may change remote state. The person running this sweep must choose a benign reversible action, confirm the intended scope before consent, and stop immediately if the selected site or account could cause an unintended external effect.

## Milestone-end group: Genuine Codex account, browser, process, and accessibility evidence

### [ ] UAT65-01 — Genuine ChatGPT, API-key, and unauthenticated auth matrix

status: human_needed
result: pending

prerequisites: A reviewed Codex installation and three genuine testable states: signed in with ChatGPT, signed in with an API key stored by Codex, and not signed in; the paired FSB daemon and extension; no unrelated provider changes in progress.

steps:

1. In the genuine ChatGPT state, refresh Providers and confirm Account/Auth says `ChatGPT`, the help says `Codex is signed in with ChatGPT.`, Billing says `Included with your ChatGPT plan`, and no plan tier, status bytes, credential material, version, or path appears.
2. In the genuine stored API-key state, refresh Providers and confirm Account/Auth says `API key`, the help says `Codex is signed in with an API key stored by Codex.`, and Billing says `Billed to the API key stored by Codex; dollar amount not reported.` without revealing a key fragment or dollar estimate.
3. In the genuine unauthenticated state, refresh Providers and confirm Account/Auth says `Not signed in`, both recovery and Billing say `Sign in to Codex first.`, and start is blocked before consent or optimistic run state.
4. Change auth state after reviewing consent for one harmless attempt and confirm the immediate re-probe rejects the stale identity before task input, requires a fresh status/consent cycle, and never relabels an accepted run.

expected: The three real states map only to the approved safe auth and billing copy; ChatGPT and stored API-key states use their distinct billing buckets, unauthenticated cannot start, changed auth invalidates consent, USD is never claimed, and no credential or native status data crosses the presentation boundary.

evidence:

references: MULTI-05; D65-06 through D65-11, D65-19, D65-20; T65-01, T65-02, T65-03, T65-09, T65-10.

### [ ] UAT65-02 — Genuine Codex-to-browser delegation, cancellation, cleanup, and summary

status: human_needed
result: pending

prerequisites: A genuine supported Codex account state; the paired FSB daemon and unpacked extension in a disposable browser profile; a benign reversible browser task; permission to review only sanitized visible outcomes and process cleanup.

steps:

1. Select Codex in Providers, initiate one benign task, review the shared Codex consent copy, authorize it once, and observe one genuine Codex-to-browser run through only FSB browser tools.
2. During a second harmless attempt, use `Stop agent` and confirm it changes to `Stopping agent…`, browser control returns only after authoritative child-tree and scratch cleanup, released tabs are reported once, and the stopped task never replays.
3. Let a fresh harmless attempt finish and confirm success and Run summary appear only after the completed terminal, clean process exit, settled tree, and cleanup rather than on the native result candidate alone.
4. Review the sanitized visible feed and summary for canonical init, assistant, FSB tool-use/result ordering, tokens, turns, duration, and the exact accepted auth-specific billing caption with no USD, Profile row, reasoning, plan text, native payload, or error text.
5. If a genuine sanitized 0.142.5 stream can be reviewed safely, compare only its required event shapes with the checked-in schema-derived contract; do not retain the task, browser content, native payloads, credentials, or local process data.

expected: A real Codex task drives the browser only through the allowed FSB MCP surface; cancellation and success each settle exactly once after complete process/runtime cleanup; a fresh run does not replay stopped work; the summary is honest, provider-neutral, dollar-free, and contains only normalized safe evidence.

evidence:

references: MULTI-04, MULTI-05, MULTI-06; D65-01 through D65-05, D65-12 through D65-18, D65-20, D65-23; T65-01 through T65-12.

### [ ] UAT65-03 — Keyboard, screen-reader, theme, motion, zoom, and narrow-layout behavior

status: human_needed
result: pending

prerequisites: A paired unpacked extension; keyboard-only input; a screen reader; light and dark themes; forced-colors and reduced-motion settings; browser zoom controls; viewport widths covering Providers and the narrow delegated side panel.

steps:

1. Navigate the Providers radio group and existing third Codex row using only the keyboard; confirm the accessible name is `Codex`, focus remains visible, Account/Auth and Billing stay separate, and refresh announces one ordered result without moving focus.
2. Review Providers and a delegated run with the screen reader in light, dark, and forced-colors modes; confirm names, descriptions, compatibility, auth, billing, lifecycle, controls, feed articles, details, and summary are understandable without color alone.
3. Enable reduced motion and confirm action transforms, entry tint, pulses, smooth scrolling, and Stop animation are suppressed while text, icon, border, focus, and lifecycle changes remain immediate and understandable.
4. Test zoom and narrow layouts, including the Providers wrap and the delegated side panel at or below 350px; confirm no horizontal overflow or overlap, every rectangular delegated action is at least 44px high, and fixed delegated Stop is at least 44px square.
5. Confirm real internal compatibility profiles produce no visible or announced `Profile` term or value, hydration is silent, only newer matching sequences announce, and Codex uses the same DOM/focus order as the other agent providers.

expected: Keyboard and screen-reader operation remains coherent across themes, forced colors, reduced motion, zoom, and narrow layouts; the shared controls meet the 44px target contract; focus and announcements remain ordered; no Profile row or Codex-specific presentation branch is visible.

evidence:

references: MULTI-04, MULTI-05, MULTI-06; D65-18 through D65-24; UI65-01 through UI65-10; T65-02, T65-08, T65-09, T65-10.

## Gate policy

- Every scenario remains `human_needed`, `pending`, and evidence-empty until a person performs and reviews the single milestone-end sweep.
- Automated parser, fixture, fake process, source, storage, DOM, CSS, UI, target-size, theme, motion, and accessibility-contract checks remain blocking but cannot replace genuine external evidence.
- Any later evidence must follow the sanitization policy above and must not include provider-native payloads or values from the user's task, account, authentication material, process, filesystem, network, browser content, or assistive-technology transcript.
