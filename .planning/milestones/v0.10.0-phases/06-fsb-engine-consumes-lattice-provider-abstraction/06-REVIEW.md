---
phase: 06-fsb-engine-consumes-lattice-provider-abstraction
reviewed: 2026-05-27T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - extension/offscreen/lattice-host.js
  - extension/background.js
  - extension/ai/lattice-provider-bridge.js
  - extension/ai/agent-loop.js
  - extension/ui/options.js
  - tests/lattice-provider-bridge-smoke.test.js
  - package.json
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 6: Code Review Report (Iteration 2 / re-review after WR-01..WR-04 fixes)

**Reviewed:** 2026-05-27T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** clean

## Summary

Re-review of Phase 6 after the four iteration-1 fix commits:

- f6d49b0c -- WR-01 reject empty requestId in offscreen execute handler
- fe603fab -- WR-02 validate envelope.response present in ok:true branch
- c0966eee -- WR-03 remove no-op openai baseUrl pass + document asymmetry
- e60a25ba -- WR-04 propagate err.status through bridge for terminal classification

All four warnings from `06-REVIEW.iter2.md` are correctly addressed:

1. **WR-01 (`extension/offscreen/lattice-host.js:438-452`)** -- the empty-requestId
   guard sits exactly where iter-1 recommended (before `_inflightAborts.set` and
   before the synchronous unknown-provider envelope), returning
   `{ ok:false, error:{ kind:'invalid_provider', message:'Missing requestId' } }`
   so the bridge's typed-error path stays a closed enum. The Phase 5
   step-transition listener (registered first; lines 289-371) is byte-frozen.

2. **WR-02 (`extension/ai/lattice-provider-bridge.js:111-134`)** -- the
   `envelope.response` null/undefined check throws `adapter_error` before
   collapsing to the falsy value. The autopilot path
   `(r && r.rawResponse) ? r.rawResponse : r` is unchanged, so Part 2's
   per-provider round-trip assertions (`envelope.response.rawResponse` shape)
   still hold; the smoke confirms all 7 providers round-trip cleanly.

3. **WR-03 (`extension/ai/agent-loop.js:1049-1066` +
   `extension/offscreen/lattice-host.js:177-189`)** -- the agent-loop's
   `baseUrl` ternary no longer sends the no-op `'https://api.openai.com/v1'`
   for openai (only `custom` / `lmstudio` get a baseUrl). The host-side
   `computeUrl()` has an inline comment on the openai branch marking it
   `baseUrl ignored`, plus a block comment listing the 5 first-party
   providers whose endpoints are hardcoded. The asymmetry is now self-
   documenting: any reader who edits `computeUrl` will see the cross-
   reference to the agent-loop call site in the same comment block.

4. **WR-04 (`extension/offscreen/lattice-host.js:506-537` +
   `extension/ai/lattice-provider-bridge.js:138-150`)** -- the autopilot
   fetch path assigns `err.status = status` after non-2xx, then the catch
   block surfaces it via
   `status: (err && typeof err.status === "number") ? err.status : undefined`.
   The bridge propagates `errObj.status` onto the thrown Error so the
   agent-loop's `error.status === 401|403|400|429` branches (lines 2502-2531)
   classify immediately on iteration 1 -- restoring the pre-Phase-6 UX of
   `'API key invalid or expired'` on auth failure rather than the
   two-iteration `'API call failed: ...'` regression.

Smoke baseline holds: `node tests/lattice-provider-bridge-smoke.test.js` -->
**85 PASS / 0 FAIL**, unchanged from iter-1 baseline. INV-01..06 byte-freeze
assertions in Part 6 all green (setTimeout count = 8, iterator pattern x4
discovered + each calls `runAgentIteration(sessionId, options)`, LATTICE-PIN
SHA pinned to Phase 5 value, tool-definitions parity preserved).

No new issues introduced by the four fix commits. The iter-1 Info-level
findings (IN-01..06) were all explicitly deferred or "no immediate action
needed"; none were promoted by the fix patches. Defense-in-depth checks
performed during re-review:

- **WR-01 fix does not break the abort branch:** abort path at lines 421-427
  reads `message.requestId` raw (no String coercion), but the unknown-
  requestId case is already handled by the `if (ctl)` guard
  (`Map.get(undefined)` -> `undefined` -> no-op). With WR-01 closing the
  empty-string clobber window on the execute path, the abort path is
  trivially safe.

- **WR-02 fix preserves the autopilot rawResponse contract:** the
  `(r && r.rawResponse) ? r.rawResponse : r` collapse is unchanged for the
  happy path; the new guard only adds an explicit throw for the
  `r === undefined || r === null` case. Test-connection callers that
  inspect truthiness of the returned `ProviderRunResponse` are unaffected.

- **WR-03 fix does NOT change `checkApiConnection`'s openai branch in
  `extension/ui/options.js:1122`** -- that call site still sends
  `baseUrl: 'https://api.openai.com/v1'` for openai in test-connection
  mode. That is acceptable here because test-connection mode runs
  `adapter.execute()` natively in the offscreen handler (not the
  autopilot `fetch` path); Lattice's `createOpenAIProvider({apiKey, model,
  baseUrl})` honors `baseUrl` by design. WR-03 was specifically about the
  autopilot path where `computeUrl` ignores baseUrl for openai; the
  test-connection path remains consistent with Lattice's documented
  factory contract.

- **WR-04 fix correctly handles abort errors:** the new
  `status: (err && typeof err.status === "number") ? err.status : undefined`
  pattern only sets status when present, so AbortError (no `.status`)
  produces `status: undefined` in the envelope, and the bridge sets
  `err.status = undefined` on the thrown Error -- the agent-loop's
  `errStatus === 401|403|400|429` checks all fail cleanly and the abort
  falls through to the network-error branch (which is correct behavior;
  the caller's controller already cancelled, and the 2s retry-once is
  bounded by the caller's signal).

- **No new debug artifacts**: zero `console.log` additions, zero TODO/
  FIXME/XXX/HACK markers introduced. The new block comments are documentation,
  not commented-out code.

- **No new hardcoded secrets**: keys still read via `_trim(config.apiKey)`
  in lattice-host and via `.trim()` getters in options/agent-loop. The
  bridge SECURITY note (lines 33-35) and inline reminder (lines 47-50)
  are preserved.

- **No new dangerous functions**: zero `eval`, `innerHTML`,
  `dangerouslySetInnerHTML`, `exec`, `system`, `shell_exec`. The new
  `JSON.stringify(requestBody)` on the autopilot fetch path is the same
  call that existed pre-fix; it operates on FSB-controlled request bodies
  only.

- **package.json unchanged** by the four fix commits (verified via
  `git diff f1aa4734~1..HEAD -- package.json` -- no diff). Version stays
  at 0.9.67; smoke entry still chained at the end of `scripts.test`.

- **Test harness reflects the fix surface**: `Part 3` test (c) at
  `tests/lattice-provider-bridge-smoke.test.js:419-430` exercises the
  non-2xx fetch path (WR-04 surface) and asserts the envelope's error
  message surfaces the status code. The smoke does NOT (yet) explicitly
  assert `envelope.error.status === 400` or that `err.status` is
  populated on the bridge-thrown Error -- a follow-on Wave to extend
  Part 3 with a positive status-propagation assertion would tighten the
  contract, but absence is not a defect (the iter-2 review scope is the
  fix patches' correctness, not new test coverage).

All reviewed files meet quality standards. No issues found.

---

_Reviewed: 2026-05-27T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
