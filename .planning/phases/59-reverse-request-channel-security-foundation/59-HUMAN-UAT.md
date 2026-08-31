---
phase: 59
status: pending
deferred_until: milestone-end
deferred_by: user
automated_verification: required-before-advance
---

# Phase 59 Live UAT

## 1. Pair a live unpacked extension with `serve`

Prerequisites: A locally built `fsb-mcp-server`, Chrome with the unpacked extension loaded, and access to the extension Providers panel.

Steps:

1. Start `fsb-mcp-server serve` on its default loopback bridge address.
2. Run `fsb-mcp-server pair` and copy the newly printed pairing code.
3. Open Providers, select an Agent CLI, and paste the code into Local bridge pairing.
4. Activate Pair bridge and observe the status and daemon connection.
5. Inspect visible UI, daemon output, extension logs, and bridge status for credential disclosure.

Expected result: The extension reconnects and reports `Local bridge paired for this browser session.` only after authenticated authorization; the credential is not exposed outside the explicit `pair` output and password entry.

Result: pending — deferred to milestone-end

## 2. Daemon restart invalidates the old code

Prerequisites: Check 1 has established a live paired extension and daemon.

Steps:

1. Stop the paired `fsb-mcp-server serve` process.
2. Restart `fsb-mcp-server serve` so it creates a new daemon session.
3. Let the extension reconnect using the previously stored browser-session code.
4. Attempt the pairing flow again without generating a new code.
5. Run `fsb-mcp-server pair`, enter the new code, and pair again.

Expected result: The old code is rejected and the extension reports an expired or unpaired state; only a newly generated code restores authenticated pairing.

Result: pending — deferred to milestone-end

## 3. Chrome restart clears the session code

Prerequisites: A live pairing has been established in Chrome and the daemon remains available.

Steps:

1. Confirm the Local bridge pairing status is paired.
2. Fully quit Chrome so the browser session ends.
3. Reopen Chrome and reload the unpacked extension if needed.
4. Return to the selected Agent CLI details in Providers.
5. Observe the pairing input and status without entering a new code.

Expected result: The password input is empty and the prior pairing credential is unavailable after the browser restart; the UI does not claim that the local bridge is paired.

Result: pending — deferred to milestone-end

## 4. Pairing control accessibility and theme smoke

Prerequisites: Chrome with the unpacked extension loaded, a screen reader available, and both light and dark themes enabled for testing.

Steps:

1. Open an Agent CLI detail panel and navigate to Local bridge pairing using only the keyboard.
2. Tab through Pairing code, Pair bridge, and Remove pairing; activate each button from the keyboard.
3. Enter a malformed code and confirm the assertive validation announcement, then exercise configured, paired, expired, and removed status announcements.
4. Repeat the control and status review in light theme and dark theme.
5. Inspect compact-width wrapping and visible focus indication for the input and both actions.

Expected result: Labels, focus order, focus rings, actions, and announcements are understandable to keyboard and screen-reader users; text and controls remain readable without horizontal overflow in both themes.

Result: pending — deferred to milestone-end
