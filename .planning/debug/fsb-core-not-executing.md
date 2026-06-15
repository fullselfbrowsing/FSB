---
status: resolved
trigger: "FSB core functionality is broken -- tasks don't execute after recent changes"
created: 2026-02-04T00:00:00Z
updated: 2026-06-15
---

## Current Focus

hypothesis: CONFIRMED - Content script availability is not validated before starting automation loop, causing 90-second death spiral
test: Fixes applied to background.js
expecting: Fast fail with actionable error when content script unavailable; correct health check logging; UI status updates
next_action: User verification needed

## Symptoms

expected: When user gives a task via popup/sidepanel, FSB should execute browser automation actions (click, type, navigate, etc.)
actual: Tasks don't execute -- session starts, spends 90 seconds on health checks, then fails with 0 actions executed
errors: "Could not establish connection. Receiving end does not exist." (content script not responding)
reproduction: Give any task to FSB
started: After recent code changes

## Eliminated

- hypothesis: Recent getStorageWithTimeout change breaks DOM fetch
  evidence: The code never reaches DOM fetch -- fails at health check stage
  timestamp: 2026-02-04

- hypothesis: Debug mode logging causes side effects
  evidence: Debug logging is additive only (console.log calls), no behavioral changes
  timestamp: 2026-02-04

- hypothesis: Content script has syntax error preventing load
  evidence: node --check content.js passes without errors
  timestamp: 2026-02-04

- hypothesis: Manifest content script declaration is wrong
  evidence: manifest.json has correct matches: ["<all_urls>"] with document_idle
  timestamp: 2026-02-04

## Evidence

- timestamp: 2026-02-04T00:05:00Z
  checked: Log file Logs/fsb-session-2026-02-05-1770257601566.txt
  found: |
    Session ran for 90 seconds, 1 iteration, 0 total actions.
    Status: FAILED. All health check "OK" entries are misleading pre-check logs.
    Content script not responding to any health checks.
    waitForContentScriptReady took 29 seconds (expected max 10s).
    resetDOMState failed with "Could not establish connection".
  implication: Content script is not loaded/responding on the target page

- timestamp: 2026-02-04T00:15:00Z
  checked: background.js line 2404 - waitForContentScriptReady return value
  found: |
    isReady result is captured but NEVER checked.
    Code proceeds to startAutomationLoop regardless of readiness.
    Line 2404: const isReady = await waitForContentScriptReady(targetTabId, 5000);
    Line 2416: startAutomationLoop(sessionId); // No isReady check!
  implication: Automation loop starts even when content script is known to be unavailable

- timestamp: 2026-02-04T00:20:00Z
  checked: background.js lines 3330-3353 - health check loop in automation
  found: |
    Line 3332 logs success:true BEFORE the actual health check runs.
    This makes the COMMUNICATION LOG show "OK" for every attempt.
    Actual health check results are not reflected in pre-check log.
    All 5 retries fail, with re-injection attempts at attempts 3 and 4.
    ensureContentScriptInjected takes ~25s per call (3 retry loop).
  implication: Health check logging is misleading; 60s wasted on retries after content script unavailable

- timestamp: 2026-02-04T00:25:00Z
  checked: background.js lines 3372-3395 - health check failure handler
  found: |
    When all health checks fail, error is sent via chrome.runtime.sendMessage
    to popup. But popup is likely already closed after 90 seconds.
    The .catch(() => {}) silently swallows the failed message send.
  implication: User never sees the error message if popup closes before session fails

- timestamp: 2026-02-04T00:30:00Z
  checked: Recent git commits (6 most recent)
  found: |
    Recent changes to background.js: getStorageWithTimeout, debugLog, loadDebugMode.
    None of these touch content script communication or health check logic.
    Content.js unchanged since commit 575ad26 (click verification migration).
  implication: Recent commits did not introduce the root cause, but issue may have been masked before

## Resolution

root_cause: |
  Three compounding bugs cause the 90-second death spiral when content script is unavailable:

  1. **waitForContentScriptReady result ignored** (background.js:2404)
     - isReady = false is captured but never checked
     - Automation loop starts regardless, wasting 60s on health checks that will inevitably fail

  2. **Health check pre-log misleading** (background.js:3332)
     - logComm called with success:true BEFORE actual health check
     - Makes communication log show "OK" when checks actually fail
     - Makes debugging harder -- logs show 5 "OK" entries when all checks actually failed

  3. **No status updates during long wait** (background.js:2401-2416)
     - 29s waitForContentScriptReady + 60s health check retries = 90s
     - No UI feedback during this entire period
     - User sees "Starting automation..." then nothing for 90 seconds

  Additionally found: API key validation only covers xAI and Gemini providers,
  missing OpenAI and Anthropic. Users with those providers could hit silent failures.

fix: |
  Applied 4 fixes to background.js:

  ### Fix 1: Fast-fail when content script unavailable (lines 2415-2446)
  - After waitForContentScriptReady returns false, do one final health check
  - If still not responding, immediately fail the session with actionable error message
  - Error tells user to refresh the page or reload extension
  - Prevents 60-second health check death spiral in automation loop

  ### Fix 2: UI status updates during connection phase (lines 2405-2453)
  - Send "Connecting to page..." status before waiting for content script
  - Send "Connected. Analyzing page..." after successful connection
  - User gets immediate feedback about what's happening

  ### Fix 3: Accurate health check logging (lines 3381-3387)
  - Pre-check log now uses type 'healthCheck_attempt' instead of 'healthCheck'
  - Post-check log now reflects the ACTUAL result (healthOk true/false)
  - Communication log will correctly show FAIL for failed health checks

  ### Fix 4: Complete API key validation (lines 2541-2556, 4662-4672)
  - Added OpenAI and Anthropic to API key validation
  - Both callAIAPI and handleTestAPI now check all 4 providers
  - Prevents silent API failures when using OpenAI/Anthropic models

verification: PENDING USER TESTING -- reload extension and try a task on any webpage

files_changed:
  - background.js
    - Lines 2401-2460: Content script readiness check with fast-fail and UI status updates
    - Lines 3379-3391: Health check logging fix (accurate success/fail reporting)
    - Lines 2541-2556: handleTestAPI API key validation for all providers
    - Lines 4662-4672: callAIAPI API key validation for all providers

## Closeout

Closed as historical. The current tree preserves the documented content-script
readiness fixes and has since moved provider execution through the Lattice
provider bridge.
