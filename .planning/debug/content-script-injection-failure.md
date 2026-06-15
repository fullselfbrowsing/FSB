---
status: resolved
trigger: "FSB content script fails to inject/respond on LinkedIn, causing automation sessions to fail with 0 actions executed"
created: 2026-02-04T00:00:00Z
updated: 2026-06-15
---

## Current Focus

hypothesis: CONFIRMED - Double-injection protection at line 8 crashes due to TDZ access of backgroundPort variable
test: Verified with node test that accessing `let` variable before declaration throws ReferenceError even with typeof check on prior operand
expecting: Fix applied - added typeof check for backgroundPort to prevent TDZ crash
next_action: User to test by reloading extension and running automation on Google.com

## Symptoms

expected: Content script should inject into LinkedIn pages and respond to health checks within a few seconds, allowing automation to proceed.
actual: Content script readiness check takes ~29 seconds and then reports not ready. Session aborts with 0 actions. Log shows: "Waiting for content script readiness" -> 29s delay -> "Content script readiness check complete" -> "Content script not ready after waiting, aborting session"
errors: "Content script not ready after waiting, aborting session" in background.js
reproduction: Start any automation task on a LinkedIn page (especially after extension reload/update without page refresh). The content script never responds to readiness checks.
started: Current behavior observed in log file Logs/fsb-session-2026-02-05-1770260098497.txt from Feb 4, 2026.

## Eliminated

- hypothesis: LinkedIn CSP blocks content script injection
  evidence: Chrome extension content scripts run in isolated world, unaffected by page CSP. Manifest declares all_urls which includes LinkedIn.
  timestamp: 2026-02-04T00:30:00Z

- hypothesis: waitForContentScriptReady timeout too short
  evidence: Function has 5s polling + ensureContentScriptInjected fallback with 3 retries. Total time matches log (29s). The timeout is adequate, the underlying injection is what fails.
  timestamp: 2026-02-04T00:35:00Z

- hypothesis: healthCheck handler in content.js throws an error
  evidence: The healthCheck handler is well-protected and calls checkDocumentReady() which has try/catch for each selector query. But more importantly, the error "Receiving end does not exist" from the prior session proves the onMessage listener was never registered - the issue is before the handler, not in it.
  timestamp: 2026-02-04T00:40:00Z

- hypothesis: chrome.tabs.sendMessage with frameId:0 doesn't work with manifest-injected scripts
  evidence: frameId: 0 is standard Chrome API for targeting main frame, works regardless of injection method. This is not the issue.
  timestamp: 2026-02-04T00:42:00Z

## Evidence

- timestamp: 2026-02-04T00:20:00Z
  checked: Log file timing analysis
  found: 29.28 second gap between "Waiting for content script readiness" (20:54:58.498) and "Content script readiness check complete" (20:55:27.778). No intermediate logs visible because ensureContentScriptInjected passes null for sessionId in its logComm calls, so they don't appear in session-filtered reports.
  implication: The full 5s poll + 24s ensureContentScriptInjected(3 retries) executed and ALL attempts failed.

- timestamp: 2026-02-04T00:25:00Z
  checked: manifest.json content_scripts declaration
  found: Declares content_scripts with matches: ["<all_urls>"], js: ["automation-logger.js", "content.js"], run_at: "document_idle", all_frames: true. Both files are listed.
  implication: Manifest injection works for new page loads. But only applies to navigations AFTER extension is loaded.

- timestamp: 2026-02-04T00:30:00Z
  checked: ensureContentScriptInjected programmatic injection (background.js line 1021-1024)
  found: Only injects content.js: `chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['content.js'] })`. Does NOT inject automation-logger.js.
  implication: CRITICAL BUG. content.js depends on automationLogger (defined in automation-logger.js). Without it, content.js crashes at line 1261 with ReferenceError: automationLogger is not defined.

- timestamp: 2026-02-04T00:35:00Z
  checked: content.js initialization flow
  found: Content script is 9968 lines. The onMessage listener is at line 9519. The first use of automationLogger at top-level (not inside a function/class) is at line 1253/1259/1261 (iframe/main frame logging). The port connection (establishBackgroundConnection) is at line 9888. Both are AFTER the crash point.
  implication: When programmatically injected without automation-logger.js, content.js crashes at line 1261, never registers the onMessage listener, never establishes a port. All health checks and pings fail.

- timestamp: 2026-02-04T00:40:00Z
  checked: Prior debug session (.planning/debug/resolved/fsb-stuck-after-phase11.md)
  found: Previous session also showed "Could not establish connection. Receiving end does not exist." error - the exact error that occurs when no onMessage listener is registered.
  implication: This confirms the content script's listener was not registered, consistent with a crash during initialization.

- timestamp: 2026-02-04T00:45:00Z
  checked: Content script reconnection logic
  found: Content script has 5 reconnect attempts with exponential backoff (1s, 2s, 4s, 8s, 10s = 25s total). After exhaustion, backgroundPort stays null. But onMessage listener remains active if initially registered. The reconnection issue only affects port-based checks, not message-based health checks.
  implication: For manifest-injected scripts, even if port reconnection fails, health checks should still work. The failure must be from programmatic injection scenarios.

- timestamp: 2026-02-04T02:00:00Z
  checked: User testing after first fix
  found: Previous fix (inject both files + automationLogger fallback guard) did NOT resolve the issue. User logs show "inject success: true" but ready_signal shows "success: false" and health checks still fail with "Could not establish connection. Receiving end does not exist."
  implication: The injection EXECUTES (executeScript returns without error) but the onMessage listener (line 9549) is NEVER REGISTERED. This means content.js is crashing somewhere during initialization after the automationLogger guard but before line 9549.

- timestamp: 2026-02-04T02:15:00Z
  checked: Double-injection protection code at lines 5-13
  found: Line 8 checks `typeof establishBackgroundConnection === 'function' && !backgroundPort`. The function check works (function declarations are hoisted). BUT `backgroundPort` is declared with `let` at line 9862, putting it in the Temporal Dead Zone (TDZ). Accessing `!backgroundPort` THROWS ReferenceError.
  implication: When re-injection occurs on a page where manifest already injected (so __FSB_CONTENT_SCRIPT_LOADED__ is true), line 8 executes and crashes accessing backgroundPort in TDZ.

- timestamp: 2026-02-04T02:20:00Z
  checked: JavaScript TDZ behavior verification
  found: Tested with Node.js - confirmed that `typeof foo` works before let declaration (returns 'undefined'), but `!foo` THROWS ReferenceError "Cannot access 'foo' before initialization".
  implication: This is the SECOND root cause. The first fix addressed automationLogger, but the double-injection protection has its own TDZ crash on backgroundPort.

- timestamp: 2026-02-04T02:30:00Z
  checked: Deeper TDZ investigation
  found: Even `typeof backgroundPort` throws when backgroundPort is declared with `let` in the SAME scope (same script file), just not yet reached. This is JavaScript TDZ behavior - the variable is in TDZ from start of scope to declaration.
  implication: Initial fix using `typeof backgroundPort !== 'undefined'` is INSUFFICIENT. Need try-catch to fully protect against TDZ.

- timestamp: 2026-02-04T02:35:00Z
  checked: Try-catch fix verification
  found: Wrapping the reconnection attempt in try-catch properly catches the TDZ error and allows the script to continue to the throw statement. Tested with Node.js simulation.
  implication: Fix is correct. The TDZ error is caught, logged, and ignored. The throw FSB_ALREADY_LOADED then executes cleanly.

## Resolution

root_cause: TWO ISSUES IDENTIFIED:
  (1) FIXED - Programmatic injection was missing automation-logger.js dependency
  (2) NEW FINDING - Double-injection protection at line 8 accesses `backgroundPort` (declared with `let` at line 9862) which is in the Temporal Dead Zone. When content.js is re-injected into a page where it was already loaded by manifest, line 5 evaluates true, line 8 executes, and `!backgroundPort` throws ReferenceError, crashing the script before the onMessage listener can be registered.

fix: Applied changes:
  (1) DONE - background.js line 1027: Changed programmatic injection to inject both files
  (2) DONE - content.js lines 23-47: Added defensive automationLogger fallback guard
  (3) DONE - content.js lines 10-17: Wrapped reconnection attempt in try-catch to handle TDZ error. Even typeof throws for let variables in TDZ when declared in same scope, so try-catch is required.

verification: Reload extension, open Google.com tab, start automation task. Content script should connect within 5 seconds without TDZ errors.

files_changed: ['background.js', 'content.js']

## Closeout

Closed as historical. The recorded fixes are present in the current tree:
programmatic injection uses the content-script dependency chain, and
`extension/content/lifecycle.js` owns the background-port lifecycle without
the original TDZ-prone top-level guard shape.
