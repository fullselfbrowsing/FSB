---
phase: 62
status: human_needed
deferred_until: milestone-end
deferred_by: user
automated_verification: required-before-advance
results_recorded: false
live_checks: 3
---

# Phase 62 Human UAT — Milestone-End Ledger

All three scenarios are deferred to one milestone-end sweep. None has been run during autonomous implementation. Automated, source, and DOM evidence cannot check off any heading or populate its result or evidence field.

## Milestone-end group: Adapter drift, doctor, and Providers compatibility

### [ ] UAT62-01 — Installed Claude, local doctor, and genuine stream corroboration

status: human_needed
result: pending

prerequisites: An installed Claude Code CLI authenticated through the user's normal local flow; the local FSB daemon and paired unpacked extension available for the authorized milestone-end environment; a harmless read-only browser fixture.

steps:

1. Exercise the installed Claude Code and local doctor text and JSON paths with the bridge and browser offline and online as applicable. Compare both doctor views from one collection point and corroborate fresh Supported, same-major newer Degraded, other degraded evidence, and Unsupported behavior without changing provider selection or starting a task.
2. Inspect the human doctor, JSON doctor, authenticated browser projection, extension storage, and recorded material. Confirm they contain no secret, private auth, provider-native payload, prompt, or task data; Claude account/auth remains `Not reported`, and no private path or session metadata reaches the browser.
3. Capture one genuine sanitized Claude JSONL stream from a benign read-only run. Preserve only the minimum structure needed for review and remove user text, credentials, private URLs, paths, identifiers, and provider output.
4. Compare the genuine stream's required raw `system/init` fields (`type`, `subtype`, `session_id`, `tools`, `mcp_servers`) and raw `result` fields (`type`, `subtype`, `session_id`, `is_error`) with the committed contract fixture.
5. Compare the genuine provider-native sequence and normalized sequence with the committed fixture and manifest. Keep fixture provenance `schema-derived-contract` and `liveCapturePending: true` unchanged; the comparison remains pending until a human reviews the comparison during the milestone-end sweep.

expected: Text/JSON doctor output agrees without exposing private material; installed-version classifications match the closed compatibility model; the genuine sanitized stream is reviewed against the exact raw-field and sequence contracts without relabeling the committed fixture's provenance.

evidence:

references: DRIFT-01, DRIFT-02, DRIFT-04; T62-01, T62-02, T62-03, T62-04, T62-05, T62-07.

### [ ] UAT62-02 — Rendered compatibility hierarchy, themes, and responsive layouts

status: human_needed
result: pending

prerequisites: The paired unpacked extension with safe background-projected examples of all three closed compatibility states; Chrome theme and responsive inspection controls.

steps:

1. Compare Supported, Degraded, and Unsupported badges plus selected-agent details in light and dark themes.
2. Inspect desktop and compact layouts, the 641–899 px range, and layouts at most 640 px wide.
3. Verify long labels and details use readable wrapping, inline and stacked dividers remain visible, badges do not overlap trailing native radios, and the page has no horizontal overflow.
4. Confirm text and semantic icons distinguish all states without relying on color, installation/recommendation/auth facts remain separate, and API rows contain no compatibility group or selected-detail fact.

expected: The three closed states remain visually distinct and token-based in every required theme and layout; selected-agent facts remain separate; rows wrap without clipping, overlap, reordering, or overflow; API rows remain unchanged.

evidence:

references: DRIFT-04; T62-06; Phase 62 UI Design Contract dimensions 1–5.

### [ ] UAT62-03 — Keyboard, assistive feedback, focus, and live refresh behavior

status: human_needed
result: pending

prerequisites: The paired unpacked extension; keyboard-only input; a screen reader; forced-colors and reduced-motion settings; controlled fresh, stale, corrupt, absent, and failed evidence cases.

steps:

1. Navigate the Providers native radio group by keyboard. Verify each agent radio keeps its provider accessible name and receives separate screen reader names and descriptions for compatibility without turning the badge into a control.
2. Trigger manual refresh success and failure while focus is on the refresh action and while a provider radio is focused. Verify focus retention and exactly one shared live region announces each user-triggered success and failure while cold hydration remains silent.
3. Inspect all states under forced-colors and reduced-motion. Confirm status remains available through text, icon, and border, and that compatibility transitions, transforms, pulses, and icon animation are absent.
4. Exercise live refresh projections for fresh, stale, corrupt, absent, and failed evidence. Confirm fail-closed labels and recovery copy without mutating selection, form, or recommendation state, radio order, provider values, auth/billing facts, dirty state, or saved settings.

expected: Native keyboard and screen-reader behavior remains coherent; refresh retains focus and uses one shared live region; forced-colors and reduced-motion preserve meaning; every evidence condition updates observational compatibility only.

evidence:

references: DRIFT-04; T62-05, T62-06; Phase 62 UI Design Contract semantic/accessibility and refresh contracts.

## Gate policy

- Every scenario remains human-needed with a pending result and empty evidence until the user-authorized milestone-end sweep.
- Automated, source, DOM, security, and compatibility checks remain blocking and do not replace genuine environment or human judgment.
- Any future evidence must be sanitized and linked only after the corresponding scenario is performed and reviewed by a person.
