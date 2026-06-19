---
slug: fsb-trigger-arm-masked
status: root_cause_found
trigger: |
  FSB MCP 0.10.0 trigger arm path consistently fails on this local build. Every
  call to the `mcp__fsb__trigger` tool — across all watch modes (live-observe,
  refresh-poll), both blocking and detached, valid and invalid selectors, valid
  and invalid condition kinds, owned and unowned tabs — returns the masked
  MCP-level error:
    Detected: Page navigation
    Why: The current page state did not allow the requested tool call to complete.
    Next action: Refresh page state with read_page or get_dom_snapshot, then retry.
  No "Raw error:" tail is appended. The real error code from the extension is
  silently swallowed by the MCP server's error mapper.
created: 2026-06-19
updated: 2026-06-19
goal: find_root_cause_only
---

# Debug: fsb-trigger-arm-masked

## Symptoms

**Expected behavior**
`mcp__fsb__trigger` should arm a watcher on the given selector and return one of: a
detached `{trigger_id, outcome:"detached"}`, a blocking `{outcome:"fired", event:...}`,
`{outcome:"timed_out"}`, or a clean validation error (e.g. ELEMENT_NOT_FOUND,
TRIGGER_TAB_WATCH_CONFLICT).

**Actual behavior**
Every `mcp__fsb__trigger` invocation returns the generic mapper-default error
"Detected: Page navigation / The current page state did not allow the requested tool
call to complete." with no detail. Same response for `get_trigger_status` on an unknown
trigger id. `list_triggers` and `stop_trigger` (unknown id) work cleanly.

**Error messages**
```
Detected: Page navigation
Why: The current page state did not allow the requested tool call to complete.
Next action: Refresh page state with read_page or get_dom_snapshot, then retry.
```
(no Raw error tail)

**Timeline**
First observed in this session, immediately after the user wired all three MCP clients
to the local 0.10.0 build at
`/Users/lakshmanturlapati/conductor/workspaces/fsb/rio-de-janeiro/mcp/build/index.js`.
Extension reloaded — same behavior. Reproducible across two distinct sessions and
multiple tab-open / read_page / trigger sequences.

**Reproduction**
1. `node …/mcp/build/index.js help` confirms `FSB MCP Server 0.10.0`.
2. Open a tab to a controlled localhost harness via `mcp__fsb__open_tab` (returns
   tabId + ownershipToken).
3. `mcp__fsb__read_page` on that tab returns expected DOM content (confirming the tab
   is owned and content scripts are live).
4. Call `mcp__fsb__trigger` with any combination of selector/condition/watch/tab_id.
5. Response is the generic "Page navigation" error every time, within milliseconds
   (not a timeout).

## Evidence gathered so far

- timestamp: 2026-06-19T19:44Z
  observation: Build confirmed 0.10.0; four trigger tools present in toolset
  (`mcp__fsb__trigger`, `stop_trigger`, `get_trigger_status`, `list_triggers`).

- timestamp: 2026-06-19T19:45Z
  observation: `trigger` on owned tab 696021019 with `tab_id: 696021019` returned
  `TAB_NOT_OWNED` (clean error). open_tab earlier returned ownershipToken
  "53f42f2b-…" — registry didn't recognize this session as owner of that tabId.

- timestamp: 2026-06-19T19:50Z
  observation: Opened fresh tab 696021022 — `mcp__fsb__close_tab` succeeded on
  ownership; `trigger` still returned "Page navigation" generic. Switched to active
  tab via `switch_tab` → trigger still fails. Tried invalid condition kind
  (`{kind:"totally-invalid-kind-zzz"}`) → SAME generic "Page navigation" error,
  not a validation error. Tried non-existent selector → same. Tried `detached:true`
  → same.

- timestamp: 2026-06-19T19:51Z
  observation: `node …/mcp/build/index.js doctor` reports: Ext yes, Heartbeat stale,
  Hub yes, 7 relays. Active page "https://www.amazon.com/hz/wishlist/ls". No config
  problems blocking action tools.

- timestamp: 2026-06-19T19:52Z
  observation: `list_triggers` returns `{success:true, triggers:[]}` — works cleanly.
  `stop_trigger` on unknown id returns `{success:true, stopped:false, idempotent:true,
  status:"not_found"}` — works cleanly. `get_trigger_status` on unknown id returns
  same masked "Page navigation" error as `trigger`.

- timestamp: 2026-06-19T20:04Z
  observation: After extension reload by user — same outcome. Trigger arm still
  returns "Page navigation". list_triggers still works.

- timestamp: 2026-06-19T20:09Z
  observation: General FSB smoke test on example.com → open_tab, navigate, get_text
  ("Example Domain"), click (followed cross-origin redirect to iana.org), close_tab
  — all succeeded. Action tools healthy; trigger arm is the lone broken surface.

## Source-code reading (already done)

- MCP error mapper at `mcp/src/errors.ts`:
  - `resolveErrorKey(fsbResult, errorMsg)` (line 100) returns the fsbResult.errorCode
    only when it appears in `FSB_ERROR_MESSAGES` or `CODE_ONLY_ERROR_KEYS`. Otherwise
    falls through substring matching on `errorMsg` and ultimately to `action_rejected`.
  - The `default` case of the switch (line 357) produces the generic "Page navigation"
    text we keep seeing.
  - `appendRawError(text, errorMsg, errorKey)` (line 365) does NOT append the raw
    error when `errorMsg === errorKey` OR `errorMsg` is empty.
  - None of the trigger-specific codes (TRIGGER_PAGE_BLOCKED, TRIGGER_READ_FAILED,
    TRIGGER_ARM_FAILED, TRIGGER_WATCH_INVALID, TRIGGER_TAB_WATCH_CONFLICT,
    TRIGGER_ACCESS_DENIED, TRIGGER_SELECTOR_INVALID, TRIGGER_MANAGER_UNAVAILABLE,
    INVALID_TAB_ID) appear in FSB_ERROR_MESSAGES or CODE_ONLY_ERROR_KEYS.

- Extension trigger handler at `extension/background.js` `fsbTriggerHandleToolArm`
  (line 4910). Returns failure objects with shape
  `{ success:false, errorCode: "TRIGGER_<NAME>", reason: ... }` — no `error` field
  is set, which combined with the mapper's `appendRawError` guard means the real
  reason never surfaces. createMcpOwnershipError DOES set
  `error: code, errorCode: code, code: code` (which is why TAB_NOT_OWNED renders
  correctly), but the trigger-arm-specific failure path does not.

## Current Focus

hypothesis: |
  Two independent bugs are stacked. (A) The trigger arm path in the extension
  ALWAYS returns a failure shape that the MCP error mapper cannot decode,
  producing the generic "Page navigation" wrapper with no detail. (B) The
  underlying arm is genuinely broken for some reason we cannot see — most likely
  candidate is TRIGGER_READ_FAILED because the initial baseline-read through
  `fsbTriggerSendRefreshPollRead` → content script `triggerRead` handler is
  failing, OR TRIGGER_ARM_FAILED from FsbTriggerManager.armTrigger (e.g.
  TRIGGER_CAP_REACHED, LIFECYCLE_UNAVAILABLE, store_unavailable). The lone
  working trigger tools (list_triggers, stop_trigger on unknown id) bypass
  this whole arm path.

test: |
  Add the trigger-specific errorCodes to mcp/src/errors.ts
  CODE_ONLY_ERROR_KEYS, rebuild mcp/build/index.js, then re-invoke
  `mcp__fsb__trigger` to see the actual code. Alternatively, instrument
  `fsbTriggerHandleToolArm` to mirror `errorCode` into `error` so the raw
  field surfaces through `appendRawError`.

expecting: |
  The post-patch mapper should surface a concrete code like
  TRIGGER_READ_FAILED, TRIGGER_ARM_FAILED, or TRIGGER_ACCESS_DENIED, pointing
  at the specific failure site inside the extension.

next_action: |
  Read mcp/src/errors.ts and mcp/src/tools/triggers.ts in full. Read
  extension/background.js fsbTriggerHandleToolArm, fsbTriggerOwnerContext,
  fsbTriggerSendRefreshPollRead, FsbTriggerManager.armTrigger. Walk the
  cross-component flow: MCP server (triggers.ts) → bridge → extension
  (mcp-tool-dispatcher.js handleTriggerToolMessageRoute → checkOwnershipGate
  → fsbTriggerDispatchToolRequest → fsbTriggerHandleToolArm) → content
  script (messaging.js triggerRead). Identify every failure return that
  lacks an `error` field. Then either (a) instrument errors.ts to log the
  raw fsbResult JSON to stderr so subsequent runs print the unmapped code,
  or (b) extend CODE_ONLY_ERROR_KEYS to cover every trigger code. Rebuild,
  re-run the trigger smoke from this session's transcript, capture the
  surfaced code, and trace it back to its specific return site to identify
  the real arm-time failure.

## Eliminated

- hypothesis: Wrong MCP build / npm 0.9.2 served instead of local 0.10.0.
  evidence: `node …/mcp/build/index.js help` prints "FSB MCP Server 0.10.0",
  and all four trigger tools (`trigger`, `stop_trigger`, `get_trigger_status`,
  `list_triggers`) are exposed in the toolset.

- hypothesis: Tab is not owned by this MCP session.
  evidence: On owned tab 696021022 we got "Page navigation" generic, NOT
  TAB_NOT_OWNED (which renders cleanly when triggered — confirmed on tab
  696021019). Plus `close_tab` and `read_page` succeed on the same tab id,
  proving ownership.

- hypothesis: Content script not injected on the harness page.
  evidence: extension logs show `port_connected`, `port_ready`,
  `contentScriptReady`, `contentScriptConfirmation`, `confirmation` for
  the harness tab. `read_page` and `get_dom_snapshot` succeed.

- hypothesis: Bridge / extension fundamentally down.
  evidence: open_tab, navigate, read_page, get_dom_snapshot, get_text,
  click, switch_tab, close_tab, list_tabs, list_triggers, stop_trigger
  all work. Only `trigger` arm and `get_trigger_status` (the two arm-side
  trigger tools) fail.

- hypothesis: Page blocked classifier flagging the localhost harness.
  evidence: extension/content/messaging.js `fsbClassifyTriggerReadBlockedPage`
  regex (login|signin|auth|challenge|captcha|verify) does not match the
  harness URL or title. Even if it did, the response code TRIGGER_PAGE_BLOCKED
  would also hit the mapper default — so we cannot rule it in OR out without
  patch (a).

## Notes / Constraints

- This is a QA / verification session, not application code under
  /Users/lakshmanturlapati/Desktop. The MCP server source is at
  /Users/lakshmanturlapati/conductor/workspaces/fsb/rio-de-janeiro/mcp/src/
  and the extension source is at
  /Users/lakshmanturlapati/conductor/workspaces/fsb/rio-de-janeiro/extension/.
- We cannot self-reconnect MCP mid-session; any fix that requires the user
  to rebuild + relaunch must be flagged as a CHECKPOINT for the user.
- Diagnose-only goal: do NOT apply fixes. Produce a Root Cause Report.

---

## Root Cause Report (diagnose-only)

### Summary

Two independent defects stacked. **Bug A (masking) is fully identified and reproducible from source inspection alone.** **Bug B (underlying arm failure) cannot be identified without first fixing A** — it requires the masked errorCode to be surfaced so it can be matched to a specific return site. Both blockers and the action plan below are designed so the user can land Bug A's fix, re-run the suite, then promote Bug B from "unknown failure on arm path" to a specific root cause.

### Bug A — masking defect in `mcp/src/errors.ts` (confirmed)

**Mechanism:** of ~25 error-return sites in `extension/background.js` for the four trigger tools, **only one** (line 4954, TRIGGER_TAB_WATCH_CONFLICT) sets the `error:` field on the response object. The remaining 24+ sites — including every error-return inside `fsbTriggerHandleToolArm` and `fsbTriggerHandleToolStatus` — set `errorCode:` but omit `error:`. The MCP error mapper at `mcp/src/errors.ts` swallows these for two compounding reasons:

1. `resolveErrorKey()` (errors.ts:100-138) only honours an explicit `errorCode` when it appears in `FSB_ERROR_MESSAGES` (errors.ts:3-36) or `CODE_ONLY_ERROR_KEYS` (errors.ts:54-68). **None of the trigger codes** — `TRIGGER_ACCESS_DENIED`, `TRIGGER_SELECTOR_INVALID`, `INVALID_TAB_ID`, `TRIGGER_CONDITION_INVALID`, `TRIGGER_WATCH_INVALID`, `TRIGGER_PAGE_BLOCKED`, `TRIGGER_READ_FAILED`, `TRIGGER_MANAGER_UNAVAILABLE`, `TRIGGER_ARM_FAILED`, `TRIGGER_STORE_UNAVAILABLE`, `TRIGGER_NOT_FOUND`, `INVALID_TRIGGER_ID`, `TRIGGER_CAP_REACHED`, `LIFECYCLE_UNAVAILABLE`, `REFRESH_POLL_INTERVAL_TOO_LOW` — are in either list. With `errorCode` not whitelisted and `errorMsg` empty (because `error:` is unset), the resolver falls all the way through to the `'action_rejected'` default.

2. `buildLayeredDetail('action_rejected', ...)` hits the `default` arm of the switch (errors.ts:357) and emits the generic `Detected: Page navigation / The current page state did not allow the requested tool call to complete.` text.

3. `appendRawError(text, '', errorKey)` (errors.ts:365) short-circuits and returns `text` unchanged because `errorMsg` is falsy. So the user never sees the unrecognised `errorCode`.

**Why two trigger tools work and two don't:**
- `list_triggers` succeeds whenever the store is reachable — no per-failure error code surfaces.
- `stop_trigger` on a non-existent id returns `{success:true, stopped:false, status:"not_found"}` — a success response, no mapping needed.
- `trigger` arm and `get_trigger_status` on a non-existent id BOTH go through error-returning code paths where `errorCode` is set without `error:`. Both therefore mask identically. This pattern is the diagnostic fingerprint of Bug A.

**Reproduction by inspection:** check `grep -n "errorCode:" extension/background.js | grep -i trigger` — every line except 4954 will be missing a sibling `error:` field.

### Bug B — actual arm failure (identity unknown, pending Bug A's fix)

What we know with certainty:
- `fsbAgentRegistryInstance.checkOwnershipGate` is NOT the source: gate-level errors (`AGENT_NOT_REGISTERED`, `TAB_NOT_OWNED`, `TAB_INCOGNITO_NOT_SUPPORTED`, `TAB_OUT_OF_SCOPE`) ARE in `CODE_ONLY_ERROR_KEYS` and would render cleanly. We have seen `TAB_NOT_OWNED` render correctly in this session (on tab 696021019 from a stale ownership token) — proving the gate-level path is wired and the masking is specific to the trigger-handler-internal codes.
- The bridge round-trip itself works: `list_triggers`, `stop_trigger`, and the action-tool surface (open_tab, navigate, read_page, click, get_text, switch_tab, close_tab) all succeed. The masked response returns within milliseconds, which rules out a bridge timeout.
- The handler IS being called: invalid condition kind, invalid selector, valid selector with valid condition, and `detached:true` all produce the same masked response — which means at least the route, gate, and dispatcher are all reached.

What we cannot determine without surfacing the code:
Which of the eight arm-side return sites is firing for valid inputs:

| Line | Code | Plausibility for valid inputs |
| --- | --- | --- |
| 4928 | TRIGGER_ACCESS_DENIED | Low — source='mcp' branch of `fsbTriggerOwnerContext` returns clean context |
| 4933 | TRIGGER_SELECTOR_INVALID | Excluded for our `#status`/`#price-num` tests |
| 4936 | INVALID_TAB_ID | Excluded — we pass numeric tab_id 696021022 |
| 4942 | TRIGGER_CONDITION_INVALID | Excluded for our valid conditions |
| 4947 | TRIGGER_WATCH_INVALID | Excluded — `live-observe` / `refresh-poll` |
| 4954 | TRIGGER_TAB_WATCH_CONFLICT | Excluded — `list_triggers` returns [] |
| 4973 | TRIGGER_PAGE_BLOCKED | Excluded by inspection of `fsbClassifyTriggerReadBlockedPage` (regex does not match harness URL/title) |
| 4982 | TRIGGER_READ_FAILED | **Most likely** — `fsbTriggerSendRefreshPollRead`'s content-script `triggerRead` handler may return `success:false` if `FSB.triggerObserve` is not loaded in the content world for the harness page |
| 5010 | TRIGGER_MANAGER_UNAVAILABLE | Possible — `FsbTriggerManager` lazy-load could be undefined on the SW heap after eviction |
| 5017 | TRIGGER_ARM_FAILED | Catch-all from `FsbTriggerManager.armTrigger`; merges `armResult.code` (TRIGGER_CAP_REACHED, LIFECYCLE_UNAVAILABLE, REFRESH_POLL_INTERVAL_TOO_LOW, etc.) |

The top suspect is **TRIGGER_READ_FAILED** — the baseline read step is the only arm-path operation that depends on content-script state, and the doctor output noted `Heartbeat: stale` despite content-script handshake logs being present. The runner-up is **TRIGGER_ARM_FAILED with a forwarded `LIFECYCLE_UNAVAILABLE`** from a stale SW heap.

### Specialist hint

`mcp-server` — the masking layer lives in the MCP TypeScript boundary; the cleanest patch is there.

### Recommended fix (Bug A — surface the code)

**Option 1 (preferred, single point of change in compiled code):** widen `CODE_ONLY_ERROR_KEYS` in `mcp/src/errors.ts` to include the trigger code surface. Add a `TRIGGER_*` umbrella entry to the resolver (regex match) so future codes auto-surface:

```ts
// in resolveErrorKey, BEFORE the substring fallthrough
if (/^(TRIGGER_|INVALID_TRIGGER_ID|INVALID_TAB_ID|LIFECYCLE_UNAVAILABLE)/.test(explicitCode)) {
  return explicitCode;
}
```

This makes every trigger code render as `Detected: <ErrorCode>` with the explicit code visible.

**Option 2 (orthogonal but smaller blast radius):** in `appendRawError`, always append a `Diagnostic code: <errorCode>` line when `errorCode` is set and was not the matched key. One-line patch, no allowlist maintenance.

**Option 3 (extension-side, much larger blast radius):** add `error: <code>` to all 24 trigger-tool return shapes in `extension/background.js`. Correct, but invasive and easy to drift.

Either Option 1 or Option 2 will unmask Bug B on the next arm call. Option 1 is preferred because it makes the failure mode explicit per code; Option 2 is the minimum-keystrokes path.

### CHECKPOINT 1 (user action required)

The MCP server is a stdio relay attached to this live session — it cannot self-reload. Apply Option 1 or Option 2 above, then:

```bash
cd /Users/lakshmanturlapati/conductor/workspaces/fsb/rio-de-janeiro/mcp
npm run build
# then relaunch this Claude Code session so the new MCP build attaches
```

### After Bug A is surfaced — what to do next

The QA harness is intentionally torn down. The minimum-cost repro for Bug B is:

```bash
mkdir -p /tmp/fsb-trigger-test
# (write the harness file from the saved system prompt)
python3 -m http.server 8099 --directory /tmp/fsb-trigger-test &
```

Then in the relaunched Claude session: `open_tab` to the harness, `read_page` to confirm, single `trigger` call with `{selector:"#status", condition:{kind:"changed"}, watch:"live-observe", detached:true}`. The response will now carry the real `errorCode`. Map it to the table above to identify the exact return site, and continue this debug session via `/gsd:debug continue fsb-trigger-arm-masked`.

### Files implicated (read-only — no edits applied)

- `mcp/src/errors.ts` lines 3-68, 100-138, 357-403 — masking
- `extension/background.js` lines 4910-5020 — `fsbTriggerHandleToolArm` return shapes
- `extension/background.js` lines 4522-4720 — `fsbTriggerHandleToolStatus` / `Stop` / `List` return shapes
- `extension/ws/mcp-tool-dispatcher.js` lines 1570-1606 — `handleTriggerToolMessageRoute`
- `extension/utils/trigger-manager.js` line 712-769 — `armTrigger` and TRIGGER_CAP / LIFECYCLE returns
- `extension/utils/trigger-lifecycle.js` line 266-292 — alarm-arm wrapper
- `extension/content/messaging.js` lines 1303-1341 — `triggerRead` content-script handler

### Resolution status

root_cause: |
  Bug A: 24 of 25 trigger error returns in extension/background.js set errorCode
  without error, and zero trigger codes appear in mcp/src/errors.ts FSB_ERROR_MESSAGES
  or CODE_ONLY_ERROR_KEYS. The mapper's `resolveErrorKey` falls to 'action_rejected'
  default, `buildLayeredDetail` emits the generic "Page navigation" text, and
  `appendRawError` is short-circuited by empty errorMsg. Net effect: every
  arm-path failure is collapsed into one indistinguishable response.

  Bug B: Actual identity unknown until Bug A is fixed. Highest prior:
  TRIGGER_READ_FAILED from the content-script baseline read.

fix: |
  not applied (diagnose-only). See "Recommended fix" above for two equivalent
  one-file patches to mcp/src/errors.ts.

verification: |
  Post-Option-1 patch: any `mcp__fsb__trigger` call should return a response
  whose `Detected:` line shows the specific TRIGGER_* code, with the
  `nextAction` template-substituted from the code's switch case (or the
  default for codes still lacking a layered-detail entry). The smoke test
  in "After Bug A is surfaced" then disambiguates Bug B.

files_changed: none (diagnose-only)
