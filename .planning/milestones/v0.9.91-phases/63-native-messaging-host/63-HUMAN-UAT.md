---
phase: 63
status: human_needed
deferred_until: milestone-end
deferred_by: user
automated_verification: required-before-advance
results_recorded: false
live_checks: 8
---

# Phase 63 Human UAT — v0.9.91 Milestone-End Ledger

All eight scenarios are deferred to the single v0.9.91 milestone-end sweep. None has been run during autonomous implementation. Source inspection, synthetic DOM tests, mocked native framing, platform-adapter tests, and packed-artifact checks are automated evidence only; none is live UAT and none may check off a heading or populate a result or evidence field.

## Milestone-end group: Genuine native-host, Chrome, and accessibility evidence

### [ ] UAT63-01 — macOS published-id install, wake, attach, doctor, and uninstall

status: human_needed
result: pending

prerequisites: A supported macOS user account; published FSB Chrome extension id and matching extension build; Google Chrome; packaged FSB MCP release; sanitized test profile with no unrelated native-host registration under the FSB host name.

steps:

1. Install the packaged release with the published id, then start Chrome with the daemon offline and observe the silent boot probe without starting a task or waking the daemon.
2. Initiate one authorized offline delegation and observe daemon wake, bridge readiness, and the established preflight before delegation authority is granted.
3. Repeat with the daemon already running and observe attach without an extra daemon process.
4. Compare text and JSON doctor output, then uninstall and confirm only the exact owned registration/runtime is removed.

expected: The macOS user-scope registration accepts only the published origin; boot remains probe-only; one authorized offline intent wakes or attaches; doctor reports bounded native state; uninstall preserves unrelated files and registrations.

evidence:

references: NATIVE-01, NATIVE-02, NATIVE-04; D63-02, D63-11, D63-17, D63-18, D63-19; T63-03, T63-05, T63-08, T63-10, T63-12.

### [ ] UAT63-02 — macOS unpacked explicit id and allowlist refusal

status: human_needed
result: pending

prerequisites: A supported macOS user account; an unpacked FSB extension with a known explicit extension id; Google Chrome; packaged FSB MCP release; a sanitized disposable Chrome profile.

steps:

1. Install the native host with the unpacked extension's explicit id and confirm Chrome can reach only that exact origin.
2. Change the unpacked id or registration allowlist so they do not match, then attempt the same benign lifecycle request.
3. Inspect doctor text and JSON without editing the mismatched registration through the doctor path.
4. Restore the owned registration and uninstall it through the supported command.

expected: The explicit unpacked id works only when it exactly matches; an allowlist mismatch is reported and refused without wildcarding, silent id discovery, repair, wake, or delegation.

evidence:

references: NATIVE-01, NATIVE-04; D63-02, D63-11, D63-17; T63-03, T63-08, T63-09.

### [ ] UAT63-03 — Linux Google Chrome install, wake, attach, doctor, and uninstall

status: human_needed
result: pending

prerequisites: A supported Linux user account; Google Chrome; matching FSB extension and packaged MCP release; sanitized test profile; daemon initially offline.

steps:

1. Install the user-scope native host and verify Google Chrome recognizes the exact FSB registration.
2. Initiate one authorized offline delegation, observe one wake and bridge readiness, then repeat while the daemon is already running to observe attach.
3. Compare the bounded native-host facts in text and JSON doctor output.
4. Uninstall and confirm exact-owned cleanup while adjacent user files and registrations remain intact.

expected: Linux registration, shell-free launcher execution, offline wake, already-running attach, doctor, and exact-owned uninstall behave as specified without system-scope mutation.

evidence:

references: NATIVE-01, NATIVE-02, NATIVE-04; D63-02, D63-11, D63-12, D63-17, D63-19; T63-05, T63-06, T63-08, T63-10.

### [ ] UAT63-04 — Windows x64 HKCU views and packaged executable lifecycle

status: human_needed
result: pending

prerequisites: A supported Windows x64 user account; Google Chrome; matching FSB extension; version-matched packaged x64 native-host executable; disposable user-scope FSB registrations in both HKCU registry views.

steps:

1. Exercise install with no registration, an exact canonical registration, and a controlled HKCU 64-bit-view shadow while the 32-bit view remains canonical.
2. Confirm install and doctor inspect both user views, mutate only the canonical HKCU 32-bit view, report the shadow as a mismatch, and never use HKLM.
3. With a clean exact-owned registration, initiate an authorized offline delegation through the packaged `.exe`, observe wake, then repeat against an already-running daemon to observe attach.
4. Compare doctor text and JSON, uninstall, and confirm exact-owned removal without deleting a foreign shadow or adjacent value.

expected: Windows x64 registration honors the canonical/view-shadow contract; the packaged executable forwards the native lifecycle safely; wake, attach, doctor, and uninstall preserve ownership boundaries.

evidence:

references: NATIVE-01, NATIVE-02, NATIVE-04; D63-01, D63-02, D63-11, D63-17, D63-19; T63-05, T63-07, T63-08, T63-10.

### [ ] UAT63-05 — Windows arm64 packaged artifact and bootstrap behavior

status: human_needed
result: pending

prerequisites: A supported Windows arm64 user account; Google Chrome; matching FSB extension; version-matched packaged arm64 native-host executable and owned sibling runtime configuration.

steps:

1. Install from the release package and confirm registration targets the arm64 packaged artifact rather than a batch, command, shell, or single-executable-application fallback.
2. Initiate one benign native lifecycle request and observe origin/parent-window handling, inherited native streams, child completion, and exit propagation.
3. Exercise a controlled invalid owned-config or argument case and confirm refusal without launching arbitrary commands.
4. Uninstall and confirm only the exact owned arm64 runtime and registration are removed.

expected: The version-matched arm64 PE bootstrap launches only its owned Node host tuple, forwards bounded Chrome arguments and native streams, propagates exit status, and fails closed for invalid state.

evidence:

references: NATIVE-01, NATIVE-03, NATIVE-04; D63-01, D63-03, D63-11; T63-02, T63-07, T63-08.

### [ ] UAT63-06 — Published and unpacked Chrome outcome and no-replay matrix

status: human_needed
result: pending

prerequisites: Published and unpacked FSB Chrome profiles; controllable genuine host/daemon states; a harmless delegation intent whose effects are easy to recognize; sanitized observation notes.

steps:

1. Exercise genuine host missing, malformed reply, timeout, wrong-product health, ready, and unpaired outcomes in both published and unpacked Chrome where applicable.
2. For an offline authorized intent, observe checking, one wake attempt, and one continuation only after authenticated bridge readiness plus the established preflight.
3. Exercise a late reply, concurrent request, edited intent, cancellation, and panel close/reopen while the attempt is unresolved.
4. Confirm fallback and consent remain available and that no native reply, timeout, reload, or readiness transition replays a stale intent.

expected: Each outcome converges on the specified fallback, ready, or unpaired state; one current intent may continue once, while stale, edited, canceled, or superseded attempts never replay or mutate delegation optimistically.

evidence:

references: NATIVE-02, NATIVE-03; D63-04, D63-05, D63-07, D63-08, D63-18, D63-20, D63-21, D63-22; T63-01, T63-03, T63-05, T63-10, T63-11, T63-12.

### [ ] UAT63-07 — Rendered themes, narrow layout, zoom, contrast, and motion

status: human_needed
result: pending

prerequisites: Paired unpacked extension in Chrome; genuine controllable lifecycle outcomes; light and dark themes; side-panel resizing; browser zoom; forced-colors and reduced-motion settings.

steps:

1. Observe checking through fallback, consent, ready, and unpaired transitions in light and dark themes at normal width and at `<=350px`.
2. Repeat at increased browser zoom and confirm copy wraps without horizontal overflow, overlap, clipping, or a second lifecycle surface.
3. Inspect forced-colors treatment and confirm state remains legible through text, semantic structure, and system-visible borders rather than color alone.
4. Enable reduced motion and confirm the bounded checking treatment does not introduce prohibited transforms, pulsing, or decorative animation.

expected: The single inline lifecycle row remains readable and semantically stable across themes, narrow layouts, zoom, forced colors, and reduced motion, with no second page, CTA, or competing status surface.

evidence:

references: D63-06, D63-08, D63-09, D63-10, D63-20, D63-21, D63-22; T63-09, T63-11; Phase 63 UI Design Contract.

### [ ] UAT63-08 — Keyboard focus and screen-reader announcement order

status: human_needed
result: pending

prerequisites: Paired unpacked extension in Chrome; keyboard-only input; a screen reader; genuine controllable missing, ready, unpaired, timeout, and failure states.

steps:

1. Navigate to the existing delegation action and initiate the lifecycle flow by keyboard; observe focus throughout checking, fallback or consent, and terminal state.
2. Confirm focus remains on a meaningful existing control or returns to the initiating action without landing on decorative status content.
3. Listen for the shared live region during checking, ready, unpaired, timeout, and failure transitions; confirm announcements occur once and in causal order while cold hydration remains silent.
4. Retry one current intent, then edit or cancel another, and confirm announcement order does not imply that a stale intent ran or that native readiness itself authorized delegation.

expected: Keyboard operation and focus retention remain coherent; one shared live region announces user-triggered lifecycle changes once, in order, without duplicate, stale, or authority-misleading output.

evidence:

references: D63-08, D63-09, D63-10, D63-20, D63-21, D63-22; T63-09, T63-11, T63-12; Phase 63 UI Design Contract.

## Gate policy

- Every scenario remains human-needed with a pending result and empty evidence until the user-authorized single v0.9.91 milestone-end sweep.
- Automated source, protocol, platform-adapter, DOM, package, artifact, security, and accessibility-contract checks remain blocking and do not replace genuine operating-system, browser, or assistive-technology evidence.
- Any future evidence must be sanitized and linked only after the corresponding scenario is performed and reviewed by a person.
