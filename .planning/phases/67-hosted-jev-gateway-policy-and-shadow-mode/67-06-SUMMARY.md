---
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
plan: 06
subsystem: extension
tags: [jev, extension, contract-mirror, scrubber, sanitizer, request-builder, byte-budget, response-validator, parity]

# Dependency graph
requires:
  - phase: 67-01
    provides: "Server CONTRACT, scrubber, validator, the shared scrubber corpus and the shared request cases that the mirror is held to"
provides:
  - "extension/ai/jev-state.js: FsbJevState with CONTRACT (deep-frozen mirror), isApprovalLikeKey, scrubText, matchesSecret, filterInjection, luhnValid, PATTERN_SOURCES, INJECTION_PATTERN_SOURCES, PLACEHOLDERS, validateRequest, validateGatewayResponse, buildRequest, toOriginPath, utf8ByteLength, codePointLength"
  - "tests/jev-contract-parity.test.js (379 checks; not yet registered, 67-13 registers it)"
  - "tests/jev-state.test.js (232 checks; not yet registered, 67-13 registers it)"
affects: [67-08, 67-09, 67-10, 67-11, 67-12, 67-13, 68, 70]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Classic service-worker IIFE with var/function declarations, a single root.FsbJevState global and a module.exports guard; no load-time browser, network, timer or storage access (proven in a bare vm context)"
    - "Hand-mirrored contract held by a parity suite that prints the first drifting key path and a 'same commit' fix hint"
    - "Scrub and filter the whole field before cutting it, then re-clean the cut (bounded) so a secret is never half-kept and a cut never completes an injection phrase"
    - "Budget enforcement by binary search per shrink stage (text prefix, then element count, then newest-action count) over the real JSON.stringify + TextEncoder byte length"

key-files:
  created:
    - extension/ai/jev-state.js
    - tests/jev-contract-parity.test.js
    - tests/jev-state.test.js
  modified: []

key-decisions:
  - "validateGatewayResponse restricts Choice probability keys to the request's own offered vocabulary (offeredOps or the sent element ids, plus none_of_the_above), not just the global OPERATIONS / ELEMENT_ID_PATTERN; the server instrument builds options exactly that way, so producer and validator stay in parity"
  - "A proposedAction target beyond the 254-element cap is still kept (the first 253 plus the target), mirroring the shrink rule that never drops the target"
  - "A recent action whose op is outside OPERATIONS is dropped (it cannot be expressed); a wrong-typed action is invalid_request"
  - "A proposedAction is emitted only when risk is requested (data minimisation); risk without one is invalid_request"
  - "A path segment that only reveals a secret after percent-decoding (for example a card with %20 separators) becomes [REDACTED_TOKEN] as a whole"
  - "buildRequest passes the final validateRequest reason through (invalid_request or sensitive_goal) instead of always reporting invalid_request"
  - "validateGatewayResponse is wrapped in try/catch so it is total for the client; the mirrored validateRequest stays try/catch-free like the server"

patterns-established:
  - "Every request the builder produces in tests is re-checked by the server validator (bothAccept), so the client can never build what the gateway rejects"
  - "Byte-exact budget proofs: an ASCII text-only shrink lands exactly on the budget, and the irreducible floor is tested at budget and budget - 1"

requirements-completed: [JEV-03, JEV-06, JEV-07]

# Metrics
duration: 16min
completed: 2026-10-16
---

# Phase 67 Plan 06: FsbJevState Contract Mirror, Sanitizer and Budgeted Request Builder Summary

**FsbJevState is now a proven mirror of the server Jev contract. It has the same constants, scrubber, injection filter and request validator. On top of that it adds an exact-key gateway-response validator and a D-18 request builder. The builder drops every sensitive element, sends only the origin and a per-segment-scrubbed path, and fits the 20,000-byte budget. The worst case, every field at its cap in CJK, comes to 19,947 bytes.**

## Performance

- **Duration:** about 16 min
- **Started:** 2026-10-17T04:26:05Z
- **Completed:** 2026-10-17T04:42:00Z
- **Tasks:** 2 (TDD, 4 commits)
- **Files:** 3 created, none modified

## Accomplishments

- **`extension/ai/jev-state.js`.** This is one IIFE. No `const`/`let`/`class` sits at the top level. It holds:
  - the deep-frozen `CONTRACT`, which deep-equals the server's;
  - byte-identical scrub and injection patterns, with the same order and placeholders;
  - `validateRequest`, which runs the server's rules in the server's order.
- **Inert at load.** In a bare `vm` context the module reads no browser, network, timer or storage global, and it adds exactly one global, `FsbJevState`.
- **`validateGatewayResponse(body, request)`.** It accepts only the exact D-15 ok and fallback shapes. It rejects:
  - unknown or approval-like keys;
  - a decision set that differs from `request.kinds`;
  - probability keys outside the offered vocabulary;
  - values outside [0, 1] or non-finite values;
  - `meetsThreshold: true` without a threshold or without a calibrated profile;
  - a usage or cost that breaks the "null exactly when unavailable" rule;
  - the client-only fallbacks `network_error` and `aborted`;
  - an `httpStatus` outside 100..599.

  On success it returns a fresh deep copy. It never throws.
- **`buildRequest(input, {byteBudget})`.** It turns a typed element list into a request v1:
  - It drops password, hidden and file inputs, the `cc-*`, `one-time-code`, `current-password` and `new-password` autocomplete tokens (including multi-token values), `purpose.sensitive` elements, hidden elements and vault-filled ids (a Set or an array, matched by string).
  - It rebuilds each element as `{id, role, label, ops}` with synthetic ids `e0..eN` and a caller-side `idMap`. Caller ids, selectors and field contents are never copied.
  - It scrubs and injection-filters the title, the text, labels and roles before truncating them by code points. Lone surrogates become U+FFFD.
  - It maps recent actions (the newest 10) and the proposedAction through `idMap`.
  - It enforces the byte budget in the D-12 order.
- **`toOriginPath(url)`.**
  - Only http(s) URLs are accepted, and the query and fragment are dropped.
  - The path is scrubbed one segment at a time, so the leading `/` and every separator survive. `/document/d/<44-char id>/edit` becomes `/document/d/[REDACTED_TOKEN]/edit`, and a 26-character segment stays as it is.
- **The parity suite.** It deep-compares the contract, the pattern exports and the placeholders. Over the 41-case corpus it compares both scrubbers, `matchesSecret` and both filters, plus 10 injection samples assembled from separate words. It compares both against the 10 `INJECTION_PATTERNS` literals read from the `ai-integration.js` source text, without requiring that file. It checks all 104 shared request cases and 300 seeded mutations. The mutation tally covers accepted, `invalid_request` and `sensitive_goal` outcomes. A deliberate drift was confirmed to print `first mismatch at CONTRACT.CAPS.labelChars: server 80, extension 81; fix: update ... in the same commit`.

## Consumer API (Phases 68 and 70)

All of this is on `globalThis.FsbJevState` in the service worker, or `require('extension/ai/jev-state.js')` under Node. Nothing in the extension calls it in Phase 67. Plan 67-11 loads it inert.

### `FsbJevState.buildRequest(input, {byteBudget = CONTRACT.BUDGETS.requestByteBudget} = {})`

Input. Every type is checked, and a wrong type gives `invalid_request`:

```
{
  kinds: string[],                 // subset of CONTRACT.KINDS (validated at the end)
  goal: string,                    // a secret here -> sensitive_goal before anything else is built
  url: string,                     // http(s) only; anything else -> invalid_request
  title?: string,                  // undefined/null -> ''
  visibleText?: string,            // undefined/null -> ''
  elements: [{
    id: string|number,             // caller id; unique (as a string) or invalid_request; never sent
    role: string, label?: string, ops: string[],
    inputType?, autocomplete?, purpose?: {sensitive?}, hidden?   // D-18 drop signals
  }],
  vaultFilledIds?: Array|Set,      // caller ids the vault filled this session
  recentActions?: [{op, targetId: callerId|null, changed: boolean}],   // oldest first
  offeredOps: string[],            // filtered to unique OPERATIONS, order kept
  proposedAction?: {op, targetId: callerId|null}                       // sent only with 'risk'
}
```

Output: `{ok:true, request, idMap, stats}` or `{ok:false, reason:'invalid_request'|'sensitive_goal'}`.

- `request` passes both `FsbJevState.validateRequest` and the server's `validateRequest`.
- `idMap` is `{e0: callerId, ...}` and covers only the ids that were emitted. Translate gateway target choices back with it, and never send it.
- `stats` is:
  - `dropped: {sensitive, overCap}`;
  - `shrink: {textChars, elementsDropped, actionsDropped}`;
  - `bytes`, the UTF-8 length of `JSON.stringify(request)`.
- **Shrink order.**
  1. The longest text prefix that fits.
  2. Elements dropped from the end. The proposedAction target is never dropped, and a requested `target` keeps at least one element. Recent actions that pointed at a dropped element get `targetId: null`.
  3. The oldest recent actions.

  If even the irreducible request is over the budget, the result is `invalid_request`.
- **Rules worth knowing.**
  - A proposedAction whose target was dropped (sensitive, unknown, or left with no ops) gives `invalid_request`.
  - A recent action on a dropped or unknown target gets `targetId: null`.
  - A recent action whose op is not in `OPERATIONS` is skipped.

### `FsbJevState.validateRequest(request)`

Returns `{ok:true}` or `{ok:false, reason:'invalid_request'|'sensitive_goal'}`. It gives the same verdict as the server validator, and `sensitive_goal` is reported only after the whole shape passes.

### `FsbJevState.validateGatewayResponse(body, request)`

Returns `{ok:true, value}`, where `value` is a fresh deep copy, or `{ok:false}`.

- **An ok body** needs exact `okResponse` keys and:
  - `decisionId` and `instrumentVersion`: 1..64 code points; `servedModel`: 1..128;
  - `calibration`: exactly `{status in CALIBRATION_STATUSES, profileId 1..64}`;
  - `decisions`: a key set equal to `request.kinds`. Each Choice has exact keys, its choice is among its probability keys, and those keys are within the request's offered ops or sent element ids plus `none_of_the_above`. Every value is finite and in [0, 1]. Each Noul has exact keys and `p` in [0, 1];
  - `threshold`: null or in [0, 1]. `meetsThreshold` is a boolean that is true only with a threshold under `calibration.status === 'calibrated'`;
  - `usage` and `cost`: null exactly when the source is `unavailable`;
  - `latencyMs`: finite and >= 0.
- **A fallback body** needs exact `fallbackResponse` keys and:
  - `fallback` in `GATEWAY_FALLBACK_REASONS`;
  - `servedModel` null or 1..128;
  - `httpStatus` null or an integer in 100..599;
  - `latencyMs` finite and >= 0.

  It does not need `request`.

### `CONTRACT.FALLBACK_REASONS` and `CONTRACT.NON_TRANSIENT_REASONS`

- `FALLBACK_REASONS` is the 19-reason closed enum, in contract order. `GATEWAY_FALLBACK_REASONS` holds the 17 a gateway body may carry, and `CLIENT_ONLY_FALLBACK_REASONS` holds `network_error` and `aborted`.
- `NON_TRANSIENT_REASONS` holds `disabled`, `not_configured`, `spend_cap_reached`, `auth_error`, `upstream_billing` and `unavailable_model`. These are the reasons a client may cool down on in memory, never in storage.
- `HTTP_STATUS_BY_REASON` is the status-only mapping for a missing or malformed body.

### Helpers

- `toOriginPath(url)` returns `{origin, path}` or null.
- `utf8ByteLength(s)` uses TextEncoder and returns 0 for non-strings.
- `codePointLength(s)`.
- `isApprovalLikeKey(key)`.

## Task Commits

1. **Task 1: mirrored contract, scrubber, injection filter and request validator, plus the parity suite**
   - `923d9112` (test, RED)
   - `31cdf961` (feat, GREEN)
2. **Task 2: gateway-response validator, sanitizer, origin+path reducer and budgeted request builder**
   - `84eaa498` (test, RED)
   - `6bbbcfcc` (feat, GREEN)

No refactor commits were needed.

## Files Created/Modified

- `extension/ai/jev-state.js`: the FsbJevState module, 958 lines including the mirrored contract.
- `tests/jev-contract-parity.test.js`: the server/extension parity suite.
- `tests/jev-state.test.js`: tests for the sanitizer, request builder, budget and response validator, and the inert-load check.

## Decisions Made

- **Probability keys are checked against the offered vocabulary, not only the global vocabulary.** The plan's interfaces block allows any `OPERATIONS` key or any e-id. The plan's truth and T-67-08 say "outside the offered vocabulary". The 67-03 instrument builds operation options from `offeredOps` and target options from the sent element ids, always plus `none_of_the_above`. So the stricter check cannot reject a real gateway answer, and it closes a channel for a hostile or broken gateway to name an element the request never sent. A Choice may omit the catch-all key.
- **Late proposedAction target.** When more than 254 elements remain and the target is past the cap, the builder keeps the first 253 elements plus the target. Without this, a valid risk question would fail as `invalid_request`.
- **Percent-encoded secrets in a path.** A segment such as `4111%201111%201111%201111` does not match the scrubber raw, because `%` breaks the card pattern. Decoding it reveals the card, so the whole segment becomes `[REDACTED_TOKEN]`. Segments with no `%` are scrubbed exactly as the plan specifies.
- **Roles are cleaned like labels.** A page can set its own `role` attribute, so roles are scrubbed and filtered too. They are still capped at 32 code points.
- **Unknown recent-action ops are skipped and wrong types are rejected.** An action outside the Jev vocabulary carries no usable information. A non-object or a non-boolean `changed` points to a caller bug, so it is surfaced as `invalid_request`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Percent-decoded path secrets**
- **Found during:** Task 2
- **Issue:** Scrubbing each raw path segment misses secrets whose separators are percent-encoded. For example, a card written as `4111%201111%201111%201111` would leave the machine.
- **Fix:** `scrubPathSegment` also decodes any segment that contains `%`. If the decoded form holds a secret, the whole segment becomes `[REDACTED_TOKEN]`.
- **Files modified:** `extension/ai/jev-state.js`
- **Commit:** `6bbbcfcc`

**2. [Rule 2 - Correctness] Keep a proposedAction target that lies past the element cap**
- **Found during:** Task 2
- **Issue:** "Keep the first 254" alone would drop a later proposedAction target and turn a valid risk request into `invalid_request`.
- **Fix:** Keep the first 253 elements plus the target, as the shrink stage already does.
- **Files modified:** `extension/ai/jev-state.js`
- **Commit:** `6bbbcfcc`

**3. [Rule 1 - Bug, test only] The parity mutation generator crashed on stacked corruptions**
- **Found during:** Task 1 GREEN
- **Issue:** The generator crashed when a later mutation wrote into a container that an earlier one had replaced with a scalar. Secret goals were also too rare to exercise `sensitive_goal`.
- **Fix:** Each mutation step is now guarded. A quarter of the mutations also carry one of four secret goals.
- **Files modified:** `tests/jev-contract-parity.test.js`
- **Commit:** `31cdf961`

**4. [Minor, explicit] buildRequest passes the final validator reason through**
- The plan says to return `invalid_request` when the final `validateRequest` fails. The builder returns the validator's own reason instead, which is `invalid_request` or `sensitive_goal`. Both are in the documented result type.
- `sensitive_goal` can only appear here when cutting a goal of more than 1000 code points leaves a Luhn-valid prefix. In that case the gateway would answer `sensitive_goal` too.

## Issues Encountered

None beyond the test-generator fix above. The Task 2 implementation passed all 232 checks on its first GREEN run. The numbers were then printed to make sure no check passed vacuously:
- worst case: 19,947 bytes, `textChars` 6000, `elementsDropped` 204, `actionsDropped` 0, built in 5 ms;
- the ASCII text-only shrink lands exactly on its budget.

## Verification

- `node tests/jev-contract-parity.test.js`: 379 passed, 0 failed.
- `node tests/jev-state.test.js`: 232 passed, 0 failed.
- `node tests/jev-gateway-contract.test.js`: 329 passed, 0 failed.
- All three pass on Node 24.14.1 and on the official Node 20.20.2 binary.
- `node --check extension/ai/jev-state.js` passes.
- Every acceptance grep is empty:
  - `^(const|let|class) `;
  - `systemone|api\.typesafe\.ai|chrome\.storage|importScripts|JEV_`;
  - `(^|[^A-Za-z_])value *:`;
  - `chrome\.|fetch\(|setTimeout|setInterval`.
- The `module.exports` API one-liner exits 0.
- `git diff --quiet -- extension/ai/ai-integration.js extension/ai/agent-loop.js extension/background.js` exits 0.
- **Neighbouring suites.** These walk the extension tree or pin extension sources, and all pass:
  - `tests/lattice-provider-bridge-smoke.test.js`: 112 passed, 0 failed;
  - `tests/agent-provider-forbidden-flags.test.js`;
  - `tests/version-sync.test.js`;
  - `tests/mcp-bridge-topology.test.js`: 399 passed;
  - `tests/screenshot-uat.test.js`;
  - `tests/delegation-phase-contract.test.js`: 1224 passed.
- **No full tolerant-chain sweep was run.** The plan only adds files, nothing in the `npm test` chain loads them, and `package.json` is untouched (67-13 registers both suites). 67-01 followed the same precedent.

## Known Stubs

None. Nothing in the extension calls FsbJevState yet, which is intentional (D-17). Phase 68 wires the content-script snapshot into `buildRequest`.

## Deferred to Validation Block

Deferred: M-67-11 (V5), M-67-12 (V6).
- **M-67-11 (V5).** No Phase 67 UI exists, so V5 has nothing to check for this plan.
- **M-67-12 (V6).** FsbJevState ships with the 1.0.0 extension release.

Nothing in this plan needs a human, a live account, production or spend.

## User Setup Required

None.

## Next Phase Readiness

- **67-08 (client).** It can resolve `FsbJevState` lazily and use `validateRequest`, `matchesSecret`, `validateGatewayResponse(body, request)` and `CONTRACT.FALLBACK_REASONS`, `NON_TRANSIENT_REASONS` and `HTTP_STATUS_BY_REASON`. A test fixture's ok body must use the request's own offered ops and element ids as probability keys.
- **67-09 (router).** It can assert that every response body passes `validateGatewayResponse(body, request)` and that the worst case from `buildRequest` is accepted, not `payload_too_large`.
- **67-10 and 67-12** can load the module through `createRequire`.
- **67-11** loads it inert. No `importScripts` pin moves in this plan.
- **67-13** must register `node tests/jev-state.test.js` and `node tests/jev-contract-parity.test.js`.

---
*Phase: 67-hosted-jev-gateway-policy-and-shadow-mode*
*Completed: 2026-10-16*

## Self-Check: PASSED

All three created files and the SUMMARY exist. All four task commits (923d9112, 31cdf961, 84eaa498, 6bbbcfcc) are in history, and none carries an attribution line. No TODO, FIXME or stub marker is in the module. STATE.md, ROADMAP.md and REQUIREMENTS.md were left to the orchestrator.
