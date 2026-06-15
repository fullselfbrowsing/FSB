---
status: resolved
trigger: "FSB automation is unreliable - actions fail silently, API timeouts, massive DOM payloads"
created: 2026-01-28T10:00:00Z
updated: 2026-06-15
---

## Current Focus

hypothesis: CONFIRMED - Four root causes identified and fixed
test: Code changes applied
expecting: Reduced payload size, correct failure reporting, no false completions
next_action: User verification needed

## Symptoms

expected: Automation should complete tasks reliably and quickly
actual:
  1. API calls timeout frequently (30s timeout hit often)
  2. Actions marked "SUCCESS" but actually fail (e.g., click reports success but "Element not visible")
  3. Massive DOM payloads (135k-191k chars) causing slow responses
  4. Tasks marked "COMPLETED" via fallback even when they fail
  5. Selectors often don't match actual DOM elements

errors:
  - "API request timed out after 30000ms" - happens frequently across all sessions
  - Actions show success but result contains "error":"Element not visible"
  - "repeated_failures -> fallback_response -> created" marks failed tasks as complete

reproduction:
  - Any automation task has ~50% chance of hitting these issues
  - Longer tasks accumulate more failures

started: Current behavior, analyzed from 4 recent log files

## Eliminated

(none)

## Evidence

- timestamp: 2026-01-28T10:00:00Z
  checked: Log analysis summary from user
  found:
    - Session 2: 5 iterations, 509s LLM time, many timeouts
    - Session 3: 2 iterations, all 3 retries timed out, marked complete via fallback
    - Session 4: Click succeeded but result shows "Element not visible"
    - Prompt sizes reaching 191,683 chars (~55k tokens)
  implication: Four distinct but related issues need fixing

- timestamp: 2026-01-28T10:20:00Z
  checked: ai-integration.js:1909-1919 (createFallbackResponse function)
  found: createFallbackResponse() sets taskComplete: true on all errors
  implication: Failed tasks are incorrectly marked as complete

- timestamp: 2026-01-28T10:22:00Z
  checked: content.js:5079-5339 (getStructuredDOM function)
  found: DOM extraction has excessive defaults (2000 elements, all attributes)
  implication: Prompts exceed reasonable size, causing timeouts

- timestamp: 2026-01-28T10:25:00Z
  checked: content.js:5540-5545 (executeAction response)
  found: |
    Response wraps result: {success: true, result: {success: false, error: "..."}}
    The outer success=true masks the inner success=false
    Logger checks outer success, reports "succeeded" when action actually failed
  implication: Action failures logged as successes

- timestamp: 2026-01-28T10:28:00Z
  checked: universal-provider.js:49 (timeout setting)
  found: DEFAULT_REQUEST_TIMEOUT = 30000 (insufficient for large prompts)
  implication: Either reduce prompt size OR increase timeout

## Resolution

root_cause: Four confirmed root causes:

1. **FALLBACK MARKS FAILURES AS COMPLETE** - Fixed
2. **DOM PAYLOAD TOO LARGE** - Fixed
3. **30s TIMEOUT INSUFFICIENT** - Fixed (increased to 45s)
4. **ACTION RESULT MASKED BY WRAPPER** - Fixed

fix: Applied the following changes:

### Fix 1: Fallback should NOT mark tasks as complete
- ai-integration.js: createFallbackResponse() now sets taskComplete: false, adds failedDueToError: true
- background.js: Same fix for error handler, plus added handling for failedDueToError to stop session properly

### Fix 2: Reduce DOM payload size
- content.js getStructuredDOM():
  - maxElements: 2000 -> 300
  - includeAllAttributes: true -> false
  - includeComputedStyles: true -> false
- content.js extractRelevantHTML():
  - HTML per element: 4000 chars -> 500 chars
  - Text per element: 200 chars -> 100 chars
  - maxElementsToSend: 500 -> 100

### Fix 3: Increase timeout
- universal-provider.js: DEFAULT_REQUEST_TIMEOUT: 30000 -> 45000

### Fix 4: Fix action result reporting
- content.js executeAction handler: Changed from {success: true, result: result} to {...result}
- This passes through the action's actual success status instead of masking it

verification: PENDING USER TESTING

files_changed:
  - ai-integration.js (lines 1908-1920)
  - background.js (lines 2821-2855, 3427-3440)
  - content.js (lines 5079-5086, 4518-4535, 4618-4622, 5530-5546)
  - universal-provider.js (line 49)

## Expected Improvements

1. **Payload size**: Should drop from 135k-191k chars to ~30k-50k chars
2. **API timeouts**: Should be rare with smaller payloads
3. **Failure reporting**: Failed tasks will be reported as failed, not complete
4. **Action logging**: Logs will correctly show "failed" when actions fail
5. **Session termination**: Sessions will stop on error instead of marking complete

## Closeout

Closed as historical. The current tree preserves the documented reliability
fixes: fallback responses do not mark failures complete, failedDueToError is
handled explicitly, and the old provider path has since been superseded by
the Lattice provider bridge.
