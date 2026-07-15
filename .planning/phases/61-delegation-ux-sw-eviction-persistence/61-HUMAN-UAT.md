---
phase: 61
status: human_needed
deferred_until: milestone-end
deferred_by: user
automated_verification: required-before-advance
results_recorded: false
live_checks: 8
---

# Phase 61 Live UAT

These checks require an unpacked Chrome extension, an authenticated local agent CLI, real service-worker or operating-system behavior, or human visual/accessibility judgment. They form one milestone-end group. None has been run during autonomous implementation, and every result and evidence field remains pending.

## Milestone-end group: Delegation UX and lifecycle

### [ ] UAT61-01 — Consent, trust restoration, keyboard, and focus

Status: `human_needed` — pending

Prerequisites: Unpacked extension loaded in Chrome 116 or later; `fsb-mcp-server serve` running and paired; Claude Code 2.1.177 authenticated; Claude Code selected in Providers with confirmation enabled.

Safe benign fixture: `Open https://example.com in a background tab and report the page title using read-only FSB tools.`

Steps:

1. Enter the fixture in the side-panel composer and submit it using only the keyboard.
2. Confirm focus moves to `Let Claude Code control this browser?`, that the allowed/forbidden scope and `Allow & start Claude Code` / `Back to message` actions are fully keyboard reachable, and that Back returns focus to the unchanged composer without creating a message or run.
3. Submit again, choose `Trust Claude Code for future runs`, then explicitly activate `Allow & start Claude Code`; verify trust alone does not start the task.
4. Let the benign run settle, open Providers, use the restore-confirmation control, and submit the same fixture again.
5. Confirm the next run requires a new consent action and that no stale or previously consumed challenge can start it.

Expected result: Exact approved consent copy is visible; focus order is coherent; decline preserves the draft; trust is provider-local and separately confirmed; Providers restores per-run confirmation; only a fresh accepted challenge starts work.

Evidence location: `.context/uat/v0.9.91/phase61/UAT61-01/`

Evidence:

References: UX-03, LIFE-03; D-03, D-04, D-05, D-19; T61-01, T61-11, T61-12.

### [ ] UAT61-02 — Light/dark, narrow/wide, and reduced-motion presentation

Status: `human_needed` — pending

Prerequisites: Same unpacked-extension setup as UAT61-01; Chrome DevTools able to resize the side panel; operating-system or Chrome reduced-motion emulation available.

Safe benign fixture: Use the pending consent card from UAT61-01 and a completed read-only example.com run so consent, feed, and result surfaces can all be inspected without mutations.

Steps:

1. Inspect consent, current-run, tool, retry fixture if safely inducible, result, offline/disconnected fixture state, and human-control surfaces in the extension's light theme at widths below 350 px and at or above 500 px.
2. Repeat in the extension's dark theme.
3. Enable `prefers-reduced-motion: reduce`, then repeat a consent-to-running transition and reveal the tool-call breakdown.
4. Inspect long tool/model/session labels for wrapping, result metrics for the required one/two-column behavior, visible text labels, focus rings, contrast, and absence of horizontal scrolling or obscured feed rows.

Expected result: Existing theme tokens render legibly in both themes; actions stack at narrow width; metrics and permission lists use available wide space; long values wrap; semantic state never relies on color alone; reduced motion removes pulses, transforms, smooth scrolling, and nonessential transitions.

Evidence location: `.context/uat/v0.9.91/phase61/UAT61-02/`

Evidence:

References: UX-02, UX-03, UX-06; D-10, D-18, D-19; T61-11, T61-14.

### [ ] UAT61-03 — Active-owned Take Control visibility and focus handoff

Status: `human_needed` — pending

Prerequisites: Unpacked extension and authenticated daemon/CLI setup; one benign delegated run that owns a background example.com tab; at least one unrelated tab not owned by that delegation.

Safe benign fixture: A read-only multi-step task on example.com that remains active long enough to switch tabs and request human control without changing remote data.

Steps:

1. Start the fixture and confirm its browser tab opens in the background without stealing focus.
2. Activate an unrelated tab and verify `Take control` is absent.
3. Activate the exact tab owned by the live delegation and verify `Take control` appears persistently without pausing the run or stealing focus.
4. Activate `Take control`; keep focus on the busy control until hold is confirmed, then confirm focus moves to `Resume with agent` and the page accepts human interaction.
5. Activate `Resume with agent`; confirm the control remains visible until ownership restoration and process continuation are both acknowledged.
6. Repeat the visibility check after returning to the unrelated tab and after the delegated run settles.

Expected result: Launch remains background-only; eligibility follows exact active-tab ownership; tab activation alone never pauses; held/running state changes only after authoritative acknowledgements; unrelated tabs never receive delegation controls.

Evidence location: `.context/uat/v0.9.91/phase61/UAT61-03/`

Evidence:

References: UX-05; D-12, D-13, D-14, D-15, D-19; T61-05, T61-06, T61-07, T61-11.

### [ ] UAT61-04 — Authenticated Claude stream, feed, and honest summary

Status: `human_needed` — pending

Prerequisites: Claude Code 2.1.177 installed and authenticated through the user's normal account flow; paired unpacked extension; no provider API-key fallback; a harmless browser tab.

Safe benign fixture: `Open https://example.com in a background tab, read its heading and page title, then report both without modifying the page.`

Steps:

1. Start the fixture through the real side-panel consent flow.
2. Observe the genuine normalized init, tool-use/tool-result, retry if naturally emitted, and terminal events without recording task text, credentials, page bodies, full URLs with query strings, or provider-native payloads.
3. Compare visible feed order with the daemon's sanitized event sequence and confirm each visible row has one stable sequence identity.
4. Close and reopen the side panel during the run and confirm restored rows are not re-announced.
5. Inspect the terminal summary for input/output/total tokens, turns, wall-clock duration, terminal state, `Included in your subscription`, and an expandable per-tool-call breakdown.

Expected result: Genuine events appear once and in order through the provider-neutral text-only renderer; unavailable metadata says `Not reported`; no raw Claude payload or secret is rendered; the summary uses real reported metrics and never fabricates USD.

Evidence location: `.context/uat/v0.9.91/phase61/UAT61-04/`

Evidence:

References: UX-02, UX-06, LIFE-01; D-07, D-08, D-10, D-11, D-18; T61-03, T61-04, T61-14.

### [ ] UAT61-05 — Real service-worker eviction and exact feed recovery

Status: `human_needed` — pending

Prerequisites: Same live setup as UAT61-04; Chrome extension service-worker inspection tools; a benign delegated run with multiple persisted feed entries.

Safe benign fixture: A bounded read-only task across two example.org/example.com pages that emits several tool rows without account or personal data.

Steps:

1. Record the visible delegation id, ordered sequence numbers, state, and redacted row labels before eviction.
2. Force the extension service worker to stop while the live run is active, without disabling/reloading/updating the extension or restarting Chrome.
3. Reopen the side panel and allow Chrome to wake the worker.
4. Compare every restored row and sequence to the pre-eviction list, then observe at least one newly delivered event.
5. Confirm hydration is silent, only the new sequence is announced, the controller reconciles without replaying the task or adopting a different process, and one acknowledged heartbeat loop remains active.

Expected result: The exact persisted feed and lifecycle state return after worker eviction; no row is missing, duplicated, invented, or reordered; execution is neither replayed nor silently re-adopted; new delivery continues strictly after the last restored sequence.

Evidence location: `.context/uat/v0.9.91/phase61/UAT61-05/`

Evidence:

References: LIFE-01, LIFE-02, LIFE-04; D-07, D-09, D-11, D-20, D-21, D-24, D-25; T61-03, T61-10, T61-13.

### [ ] UAT61-06 — Forty-five-minute endurance and session-storage inspection

Status: `human_needed` — pending

Prerequisites: Chrome 116 or later; paired live daemon and authenticated Claude Code; Chrome storage/service-worker inspection tools; a safe task that can remain active for at least 45 minutes without external side effects.

Safe benign fixture: Repeated bounded reads of a locally controlled static test page, paced so the run emits representative init/tool/result activity without account data or writes.

Steps:

1. Start the fixture and record initial delegation-ledger byte use and heartbeat-owner count.
2. Keep the run active for 45 minutes, periodically inspecting service-worker wake/liveness, exact heartbeat acknowledgements, sequence continuity, and ledger size without modifying runtime state.
3. Close and reopen the side panel at several points and compare the visible last sequence with session storage.
4. At completion, inspect the ledger against the declared 2,000-entry, 4 KiB-entry, 6 MiB aggregate limits and Chrome's 10 MB session quota.
5. Confirm no event was dropped or evicted to make room and no second heartbeat timer appeared.

Expected result: The run remains within declared bounds; the feed is exact across panel reopen and any natural worker churn; one ref-counted 20-second heartbeat continues; no quota or timer multiplication symptom occurs.

Evidence location: `.context/uat/v0.9.91/phase61/UAT61-06/`

Evidence:

References: LIFE-01, LIFE-02; D-07, D-08, D-20, D-21, D-25; T61-03, T61-04, T61-10, T61-13.

### [ ] UAT61-07 — Real POSIX hold, resume, expiry, and Stop settlement

Status: `human_needed` — pending

Prerequisites: macOS or Linux host; authenticated live delegation; controlled benign child process tree whose leader/descendants can be inspected without touching unrelated processes; two mapped harmless tabs plus one tab owned by a different agent.

Safe benign fixture: A controlled read-only delegation that owns two local static-page tabs and remains active while its verified process group is suspended and resumed.

Steps:

1. Record the server-minted delegation id, extension-minted agent id, exact mapped tab ids/tokens, verified process-group identity, and descendant list.
2. Request Take Control and observe confirmed process-group hold before all mapped tabs enter one sealed lease; verify neither another agent nor the user flow can claim them as automation-owned.
3. Resume and verify the complete unchanged lease restores before the process group continues.
4. Hold again and allow the five-minute lease deadline to expire; verify the run cancels rather than resuming or releasing ownership by guesswork.
5. Start a fresh fixture, activate `Stop agent`, and confirm the UI remains `Stopping agent…` until process-tree settlement and exact mapped-tab release complete.
6. Verify zero matching descendants remain, the unrelated agent/tab remains untouched, and the terminal row reports the exact singular/plural released-tab count.
7. On a platform where verified POSIX hold is unavailable, confirm the action fails closed and never claims human-control success.

Expected result: Hold/resume ordering follows verified process and registry authority; expiry cancels safely; Stop settles exactly once after zero descendants and exact release; no unrelated ownership or process is affected.

Evidence location: `.context/uat/v0.9.91/phase61/UAT61-07/`

Evidence:

References: UX-04, UX-05; D-13, D-14, D-15, D-16, D-17; T61-05, T61-06, T61-07, T61-08.

### [ ] UAT61-08 — Daemon crash/restart versus ordinary disconnect classification

Status: `human_needed` — pending

Prerequisites: Controlled live delegation; access to stop/crash and restart `fsb-mcp-server serve`; ability to create a temporary ordinary network/socket interruption separately; unrelated Claude process running as a collateral-safety sentinel.

Safe benign fixture: A long-enough read-only task against a local static page, with no credentials or remote mutations.

Steps:

1. During the first run, interrupt only the bridge route/socket without changing daemon generation; allow the heartbeat policy to observe three missed exact acknowledgements.
2. Confirm the UI reports `Agent connection lost` / disconnected handling and does not claim a daemon restart, replay, adoption, or in-extension restart.
3. Restore connectivity, start a fresh run, then forcefully terminate the serve daemon while its controlled child remains alive.
4. Restart serve and observe orphan recovery before spawn capability advertisement.
5. Confirm matching prior-generation recovery disposition kills the exact surviving tree, never adopts it, and produces `Agent run ended after daemon restart` with technical code `daemon_restart_lost_run`.
6. Confirm the unrelated Claude process survives and no prompt, output, credentials, PID, argv, or environment appears in extension-visible status.

Expected result: Ordinary disconnect remains truthfully distinct from restart; restart loss requires generation plus matching recovery disposition; the surviving delegated process is stopped and not reattached; unrelated processes remain untouched.

Evidence location: `.context/uat/v0.9.91/phase61/UAT61-08/`

Evidence:

References: LIFE-02, LIFE-03, LIFE-04; D-20, D-22, D-23, D-24; T61-08, T61-09, T61-10, T61-12, T61-13.

## Gate policy

- Every case above remains `human_needed` and pending until the single v0.9.91 milestone-end execution.
- Automated/source/security/compatibility failures remain blocking and are not deferred by this ledger.
- Live evidence must be sanitized, stored only at the stated location, and linked here after the user-authorized milestone-end gate.
- Deterministic tests corroborate contracts but do not replace these real-environment checks.
