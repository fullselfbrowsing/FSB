---
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
plan: 01
subsystem: api
tags: [jev, gateway, contract, scrubber, validator, redaction, showcase-server]

# Dependency graph
requires:
  - phase: 66-baseline-and-session-timing
    provides: "Usage/cost source labels and the null-never-0 rule that CONTRACT.USAGE_SOURCES/COST_SOURCES carry"
provides:
  - "Frozen D-16 CONTRACT (showcase/server/src/jev/contract.js) plus isApprovalLikeKey"
  - "Server secret scrubber + injection-phrase mirror (showcase/server/src/jev/scrubber.js)"
  - "Exact-key deny-by-default request validator (showcase/server/src/jev/validator.js)"
  - "Shared scrubber corpus tests/fixtures/jev-scrubber-corpus.json (41 cases)"
  - "Shared request cases tests/fixtures/jev-request-cases.js (18 valid, 86 invalid)"
  - "tests/jev-gateway-contract.test.js (329 checks; not yet registered, 67-13 registers it)"
affects: [67-03, 67-05, 67-06, 67-08, 67-09, 67-10, 67-12, 67-13, 68, 70]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deep-frozen plain-data contract object (no Set/RegExp) that a parity test can deepStrictEqual"
    - "Regex literals built inside a factory on every call and applied with String.prototype.replace (no shared lastIndex)"
    - "Exact-key validation at every nesting level; reject, never repair; reason-only rejections"

key-files:
  created:
    - showcase/server/src/jev/contract.js
    - showcase/server/src/jev/scrubber.js
    - showcase/server/src/jev/validator.js
    - tests/fixtures/jev-scrubber-corpus.json
    - tests/fixtures/jev-request-cases.js
    - tests/jev-gateway-contract.test.js
  modified: []

key-decisions:
  - "Bearer pattern carries a leading \\b and is case-insensitive; its placeholder is the literal 'Bearer [REDACTED_TOKEN]', so 'bearer x...' normalizes to 'Bearer'"
  - "highEntropy redacts the whole 32+ character candidate (separators included), so a path holding a token becomes one [REDACTED_TOKEN]"
  - "Element role must be non-empty (length > 0, not trimmed); goal must be trimmed non-empty; label may be empty"
  - "recentActions targetId is only shape-checked (null or e-id), never required to reference a present element; proposedAction targetId must be null or a present element id"
  - "The validator has no try/catch: totality is proven by the 200-input seeded fuzz rather than masked"

patterns-established:
  - "Mirror-check by source text: the suite reads redactForLog.js and ai-integration.js as text and compares the fsb-auth and INJECTION_PATTERNS sources/flags, so a drift in either breaks this suite"
  - "Injection phrases are assembled from separate words in tests so no source file holds them verbatim"

requirements-completed: [JEV-03, JEV-06, JEV-07]

# Metrics
duration: 20min
completed: 2026-10-16
---

# Phase 67 Plan 01: Jev Wire Contract, Scrubber and Request Validator Summary

**Frozen 19-reason Jev CONTRACT with a 17-entry status map, a seven-pattern mirrored secret scrubber (Luhn cards, JWT, Bearer, key prefixes, PEM, fsb-auth, mixed high-entropy) and an exact-key validator that rejects client instrument keys, value slots, query strings and secret goals.**

## Performance

- **Duration:** about 20 min
- **Started:** 2026-10-17T03:07:00Z
- **Completed:** 2026-10-17T03:28:00Z
- **Tasks:** 2 (TDD, 4 commits)
- **Files created:** 6 (no existing file modified)

## Accomplishments

- `showcase/server/src/jev/contract.js`: one deep-frozen, JSON-comparable CONTRACT that deep-equals the 67-01 interfaces block. `isApprovalLikeKey` finds no approval-like key in any request, response, decision or option key set (D-29).
- `showcase/server/src/jev/scrubber.js`: seven patterns applied in a fixed order with typed placeholders. The scrubber is idempotent across the corpus and stable across repeated calls. `fsbBridge` is byte-identical to `redactForLog.js`, and the 10 injection patterns are byte-identical to `sanitizePageContent` (the suite checks both against the source text). It stays linear on adversarial 48 KB inputs (2 ms or less each).
- `showcase/server/src/jev/validator.js`: exact-key and deny-by-default at the top level, `page`, each element, each recent action and `proposedAction`. Every length is counted in code points. Shape is checked first; `sensitive_goal` is checked only after the whole shape passes. A rejection returns only the reason, and an accepted request comes back as the same, unmodified object.
- Two shared fixtures that the 67-06 extension mirror is held to, plus a 329-check plain-script suite. The suite passes on Node 24 and on the official Node 20 binary.

## Final CONTRACT listing (source of truth for the 67-06 mirror)

```
SCHEMA_VERSION: 1
KINDS: ["operation","target","completion","stuck","risk"]
CHOICE_KINDS: ["operation","target"]
NOUL_KINDS: ["completion","stuck","risk"]
OPERATIONS: ["click","type_text","select_option","check_box","press_enter","hover","scroll","go_back"]
RESERVED_OPTION_KEY: "none_of_the_above"
ELEMENT_ID_PATTERN: "^e(0|[1-9][0-9]{0,2})$"
FALLBACK_REASONS: ["disabled","not_configured","invalid_request","payload_too_large","sensitive_goal","busy","spend_cap_reached","timeout","rate_limited","upstream_overloaded","auth_error","upstream_billing","unavailable_model","upstream_rejected","upstream_error","invalid_response","network_error","aborted","server_error"]
GATEWAY_FALLBACK_REASONS: ["disabled","not_configured","invalid_request","payload_too_large","sensitive_goal","busy","spend_cap_reached","timeout","rate_limited","upstream_overloaded","auth_error","upstream_billing","unavailable_model","upstream_rejected","upstream_error","invalid_response","server_error"]
CLIENT_ONLY_FALLBACK_REASONS: ["network_error","aborted"]
NON_TRANSIENT_REASONS: ["disabled","not_configured","spend_cap_reached","auth_error","upstream_billing","unavailable_model"]
HTTP_STATUS_BY_REASON:
  invalid_request: 400
  sensitive_goal: 400
  payload_too_large: 413
  disabled: 503
  not_configured: 503
  busy: 503
  spend_cap_reached: 503
  timeout: 504
  rate_limited: 502
  upstream_overloaded: 502
  auth_error: 502
  upstream_billing: 502
  unavailable_model: 502
  upstream_rejected: 502
  upstream_error: 502
  invalid_response: 502
  server_error: 500
CALIBRATION_STATUSES: ["calibrated","uncalibrated","snapshot_changed"]
USAGE_SOURCES: ["provider","unavailable"]
COST_SOURCES: ["provider","estimate","unavailable"]
NOUL_DIRECTION:
  completion: "veto_when_low"
  stuck: "flag_when_high"
  risk: "flag_when_high"
CAPS:
  goalChars: 1000
  originChars: 256
  pathChars: 512
  titleChars: 200
  textChars: 6000
  labelChars: 80
  roleChars: 32
  opsPerElement: 8
  elements: 254
  recentActions: 10
BUDGETS:
  bodyLimitBytes: 49152
  requestByteBudget: 20000
  upstreamByteBudget: 28000
KEYS:
  request: ["v","kinds","goal","page","elements","recentActions","offeredOps","proposedAction"]
  requestRequired: ["v","kinds","goal","page","elements","recentActions","offeredOps"]
  page: ["origin","path","title","text"]
  element: ["id","role","label","ops"]
  recentAction: ["op","targetId","changed"]
  proposedAction: ["op","targetId"]
  okResponse: ["ok","decisionId","instrumentVersion","servedModel","calibration","decisions","usage","cost","latencyMs"]
  fallbackResponse: ["ok","fallback","servedModel","httpStatus","latencyMs"]
  calibration: ["status","profileId"]
  choiceDecision: ["choice","confidence","probabilities","threshold","meetsThreshold"]
  noulDecision: ["p","threshold","meetsThreshold"]
  usage: ["inputTokens","source"]
  cost: ["usd","source"]
APPROVAL_KEY_DENYLIST: ["approv","authori[sz]","allow","skip","bypass","consent","confirm","permit","grant","override"]
```

The module exports `Object.assign({ CONTRACT, isApprovalLikeKey }, CONTRACT)`. `isApprovalLikeKey(key)` builds a fresh case-insensitive RegExp for each deny-list source on every call and returns false for any non-string.

### Scrubber sources (PATTERN_SOURCES, in application order; the mirror must copy these byte-for-byte)

| name | source | flags | placeholder |
| --- | --- | --- | --- |
| pem | `-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----` | g | `[REDACTED_PRIVATE_KEY]` |
| jwt | `\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}` | g | `[REDACTED_JWT]` |
| bearer | `\bBearer\s+[A-Za-z0-9._~+/=-]{8,}` | gi | `Bearer [REDACTED_TOKEN]` |
| keyPrefix | `\b(?:sk-ant-[A-Za-z0-9_-]{16,}\|sk-[A-Za-z0-9_-]{16,}\|gh[po]_[A-Za-z0-9]{20,}\|github_pat_[A-Za-z0-9_]{20,}\|xox[bpas]-[A-Za-z0-9-]{10,}\|AKIA[0-9A-Z]{16}\|AIza[0-9A-Za-z_-]{35})` | g | `[REDACTED_API_KEY]` |
| fsbBridge | `fsb-auth\.[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])` | g | `[REDACTED_FSB_BRIDGE_SECRET]` |
| card | `\b[0-9](?:[ -]?[0-9]){12,18}\b` + replacer: strip `[ -]`, redact only when 13-19 digits and `luhnValid` | g | `[REDACTED_CARD]` |
| highEntropy | `[A-Za-z0-9+/=_-]{32,}` + replacer: redact only when it has an uppercase letter, a lowercase letter and a digit AND some `split(/[-_/+=]/)` segment of 16 or more characters holds both a letter and a digit | g | `[REDACTED_TOKEN]` |

(The `\|` above escapes the Markdown table separator; the real source uses a bare `|`.)

`INJECTION_PATTERN_SOURCES` lists the 10 `sanitizePageContent` literals as `{source, flags}`, all with flags `gi`. `filterInjection` replaces each match with `[FILTERED]` and never truncates.

### Validator rule order (the 67-06 mirror must keep this order)

1. The body is a plain object.
2. Unknown top-level keys.
3. Missing required keys.
4. `v === 1`.
5. `kinds`: a non-empty array of unique members of KINDS.
6. `goal`: a string whose trimmed form is non-empty and at most 1000 code points.
7. `page`: exact keys, and:
   - `origin` is at most 256 code points and matches `^https?://(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(:[0-9]{1,5})?$`;
   - `path` starts with `/`, is at most 512, and contains no `?` or `#`;
   - `title` is at most 200 and `text` at most 6000.
8. `elements`: an array of at most 254, each with exact keys, and:
   - `id` matches the pattern and is unique;
   - `role` has length greater than 0 and at most 32;
   - `label` is a string of at most 80;
   - `ops` is non-empty, unique, at most 8, and drawn from OPERATIONS.
9. `recentActions`: an array of at most 10, each with exact keys; `op` is in OPERATIONS; `targetId` is null or an e-id; `changed` is a boolean.
10. `offeredOps`: unique members of OPERATIONS (may be empty).
11. Cross-field rules:
    - `operation` requires at least one offered op;
    - `target` requires at least one element;
    - `proposedAction` is present if and only if `risk` is requested;
    - `proposedAction` has exact keys, `op` in OPERATIONS, and `targetId` null or a present element id.
12. `matchesSecret(goal)` then returns `sensitive_goal`.

## Corpus case count by class (tests/fixtures/jev-scrubber-corpus.json, 41 cases)

| Class | Count | Cases |
| --- | --- | --- |
| Luhn card (positive) | 5 | Visa with spaces, Mastercard with hyphens, 13-digit, Amex grouped 4-6-5, card inside CJK text |
| JWT (positive) | 1 | bare JWT (plus the Bearer-carrying JWT below) |
| Known key prefix (positive) | 8 | `sk-`, `sk-ant-`, `ghp_`, `gho_`, `github_pat_`, `xoxb-`, `AKIA`, `AIza` |
| Bearer (positive) | 3 | header, lowercase normalized, Bearer carrying a JWT (pins JWT-before-Bearer order) |
| PEM private key (positive) | 2 | multi-line RSA block, OpenSSH block |
| fsb-auth bridge secret (positive) | 1 | exactly 43 trailing characters |
| High-entropy token (positive) | 2 | 40-char mixed token, a whole-candidate path holding a token |
| Two secrets in one string (positive) | 1 | card plus `sk-` key |
| Negatives (secret false, expected === input) | 18 | `REC-3`, `INV-2024-0042`, 8-digit order number, non-Luhn `4111111111111112`, lowercase UUID, lowercase 64-hex, uppercase 64-hex, file path, hyphenated product name, CJK order number, phone `+1 415-555-0100`, `sk-1`, `fsb-auth.` with 42 chars, "Bearer token" prose, 32-char lowercase run, long mixed-case word with no digit, plain goal sentence, text already holding placeholders |

Total: 23 positive and 18 negative. Every value is a synthetic fixture shaped so it does not match the real provider token formats (no real checksums, no `T3BlbkFJ` marker, no full 36-char `ghp_` body).

## Task Commits

1. **Task 1: frozen contract constants, the mirrored scrubber and the shared corpus**
   - `d4d49e44` (test, RED)
   - `15ba9da6` (feat, GREEN)
2. **Task 2: exact-key request validator and the shared request-case fixture**
   - `bb6f3e0f` (test, RED)
   - `8bf3f8ed` (feat, GREEN)

No refactor commits were needed.

## Files Created/Modified

- `showcase/server/src/jev/contract.js`: the frozen CONTRACT, `deepFreeze` and `isApprovalLikeKey`.
- `showcase/server/src/jev/scrubber.js`:
  - `scrubText`, `matchesSecret`, `filterInjection`, `luhnValid`;
  - the frozen `PATTERN_SOURCES`, `INJECTION_PATTERN_SOURCES` and `PLACEHOLDERS`.
- `showcase/server/src/jev/validator.js`: `validateRequest` and `codePointLength`.
- `tests/fixtures/jev-scrubber-corpus.json`: `{schemaVersion:1, note, cases[41]}`.
- `tests/fixtures/jev-request-cases.js`: `baseRequest()`, `VALID_CASES` (18) and `INVALID_CASES` (86). The invalid cases include an own `__proto__` key from `JSON.parse`, an own `constructor` key, an approval-like key, and an empty `value` key.
- `tests/jev-gateway-contract.test.js`: a plain Node script with seven sections:
  - the CONTRACT values;
  - the status map;
  - the deny-list;
  - the corpus;
  - the pattern exports and mirrored sources;
  - `filterInjection`;
  - the validator, plus a 200-input seeded mulberry32 fuzz.

## Decisions Made

- **Bearer.** The pattern has a leading `\b` and is case-insensitive. A match is replaced with the literal `Bearer [REDACTED_TOKEN]`, so the case is normalized. A corpus case pins this.
- **highEntropy.** The rule replaces the whole candidate run, separators included. A path such as `/download/<token>/file` therefore becomes a single `[REDACTED_TOKEN]`. A corpus case pins this. The extension sanitizer in 67-06 scrubs path segments one at a time, so this only affects free text.
- **Card candidates.** Candidates use `[0-9]` and are bounded by `\b` on both sides. A digit run longer than 19 digits is never cut down to find a valid card inside it, which keeps both copies predictable.
- **Field rules.**
  - `role` must be non-empty but is not trimmed. `goal` must be trimmed non-empty, as the plan wording says. `label` may be empty, for icon buttons.
  - `recentActions[].targetId` is only shape-checked, because older steps may point at elements that are gone. `proposedAction.targetId` must be null or a present id.
- **No try/catch in the validator.** It is total by construction, and the seeded fuzz proves that instead of masking a bug.
- **Origin regex.** The regex stays private to `validator.js` and is not part of CONTRACT, so CONTRACT still deep-equals the interfaces block exactly. The 67-06 mirror copies it from the rule list above.
- **Extra mirror checks.** The suite reads `redactForLog.js` and `ai-integration.js` as text and compares the `fsb-auth` and `INJECTION_PATTERNS` sources and flags. This is the same check 67-06's parity test will make, done here as well so drift is caught on the server side.

## Deviations from Plan

None. The plan was executed as written. The additional checks (extra invalid and valid cases beyond the minimums, the source-text mirror checks and the ReDoS timing spot-check) are within the plan's scope and change no interface.

## Issues Encountered

None. Every corpus `expected` value worked out by hand matched the implementation on the first run.

## Verification

- `node tests/jev-gateway-contract.test.js`: 329 passed, 0 failed, on Node 24.14.1 and on the official Node 20.20.2 binary.
- `node tests/server-no-ip-leak.test.js` exits 0; it now scans the three new `src/jev/` files.
- All the acceptance one-liners in the plan exit 0:
  - FALLBACK_REASONS has 19 entries, the status map 17, OPERATIONS 8;
  - the corpus has at least 32 cases, with both classes present;
  - there are at least 36 invalid and 6 valid request cases;
  - `baseRequest()` is accepted;
  - the element key set has no `value` slot.
- The `err.message|err.stack|console.` grep finds nothing in `contract.js`, `scrubber.js` or `validator.js`.
- The grep for Node 22+ globals finds nothing in the new files.
- Regression spot-check: `node tests/delegation-phase-contract.test.js` gives 1224 passed, 0 failed.
- This plan changes no file under `mcp/`, `extension/` or `scripts/bench/tasks/`, and does not touch `package.json` (67-13 registers the suite).
- No full-chain sweep was run. The plan adds only new files, nothing requires them yet, and the only suites that walk `showcase/server/src` (`server-no-ip-leak`) or the repo (`delegation-phase-contract`) were run and are green.

## Deferred to Validation Block

Deferred: none beyond M-67-12 (V6 release). The contract ships with the server image at V6, and nothing in this plan needs a human, a live account, production or spend.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- **67-03 (instrument)** can `require('./contract')` and `require('./scrubber')`, and can use `baseRequest()`.
- **67-06 (extension mirror)** copies the CONTRACT listing, the PATTERN_SOURCES table and the validator rule order above. It must pass the same corpus and request cases.
- **67-09 (router)** can call `validateRequest(req.body)` and map `reason` through `HTTP_STATUS_BY_REASON`.
- **67-13** must register `node tests/jev-gateway-contract.test.js` in `package.json` and in `REFINEMENT_ROOT_TEST_COMMANDS`.

---
*Phase: 67-hosted-jev-gateway-policy-and-shadow-mode*
*Completed: 2026-10-16*

## Self-Check: PASSED

All six created files exist. All four task commits (d4d49e44, 15ba9da6, bb6f3e0f, 8bf3f8ed) are in history, and none carries an attribution line.
