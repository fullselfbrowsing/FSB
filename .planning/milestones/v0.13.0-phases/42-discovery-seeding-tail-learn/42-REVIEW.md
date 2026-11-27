---
phase: 42-discovery-seeding-tail-learn
reviewed: 2026-06-26T00:00:00Z
depth: deep
files_reviewed: 11
files_reviewed_list:
  - extension/utils/network-capture-redactor.js
  - scripts/harvest-discovery-seeds.mjs
  - extension/config/discovery-seeds.json
  - extension/utils/network-capture.js
  - extension/utils/recipe-synthesizer.js
  - extension/utils/capability-catalog.js
  - extension/utils/capability-router.js
  - tests/network-capture-redaction.test.js
  - tests/discovery-seeds-load.test.js
  - tests/seed-resolve-t2.test.js
  - tests/recipe-learn-pending-affordance.test.js
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: resolved
resolved_at: 2026-06-26
resolution:
  WR-01: db991d46
  WR-02: 997611b6
  IN-01: 022cc476
  IN-02: 65ee982b
  IN-03: 1481d316
---

# Phase 42: Code Review Report (Discovery Seeding + Tail Learn, DSEED-01/02)

**Reviewed:** 2026-06-26
**Depth:** deep (cross-file: redactor -> synthesizer -> learned-recipe envelope trace + core byte-stability diff)
**Files Reviewed:** 11
**Status:** issues_found (no CRITICAL/HIGH; the security keystones all hold)

## Summary

The Phase 42 implementation is **sound on every CRITICAL/HIGH keystone the brief flagged.** I traced the redactor end-to-end (redactor path -> `synthesize()` -> the learned-recipe envelope), diffed the capture/consent core against `dd789ec1`, regenerated the seeds from the harvester, and ran all seven gates. Verified affirmatively:

- **SC3 (the headline) holds.** `redactRequest`->`{method,path,origin,headerNames}` / `redactResponse`->`{status,mimeType}` still read field NAMES/structure ONLY; the `for..in` loop reads keys, never a header VALUE; no `postData`/`body`/`headers` field exists on either output by construction. The new `_shapePath` masks the 7 documented distinctive-prefix token shapes (JWT `eyJ.`, stripe `(sk|pk|rk)_(live|test)_`, github `gh[opsur]_`, slack `xox[bcpars]-`, AWS `(AKIA|ASIA)`, google `ya29.`, MS-Graph `u!`) to `:tok`, each anchored at segment start. The **documented `u!` share-id vector is masked** (verified: `/shares/u!aHR0...` -> `/shares/:tok/...`). Benign slugs survive LITERAL (`/orgs/my-long-organization-name`, `/pages/my-document-title-2024`, `/v1/charges` all verified untouched). The redactor is **dynamic-code-free** (no eval/`new Function`/RegExp-from-variable) and robust to every pathological input (null/garbage/prototype-shaped header map -> fails safe to `path:'/'`, never throws; own-key guard blocks inherited-name smuggling).
- **SC1 holds.** The seed loader (`network-capture.js`) + the synthesizer recognition bias (`_seedMatches`) are METADATA-only: a hint sets a top-level `seedMatch` flag (a sibling of `flaggedForPhase32`), NEVER inside the schema-validated recipe core, and there is NO `chrome.*`/`fetch` in the bias path. **No manifest/host_permissions change** in the diff (verified: manifest absent from the changed-file set; the load test pins `host_permissions === ["<all_urls>"]` byte-for-byte).
- **SC2 holds.** `resolve()` returns `{tier:'T2', descriptor}` with **NO `recipe` field** for a seeded would-be-T3 origin (never fabricates a credentialed call), `T3` for unseeded, and the LEARN-04 learned-first check + INV-01 catalog/djb2 shape are byte-unchanged (the seed branch is a resolve-time lookup reached ONLY in the no-entry/no-learned descriptor-only fallback).
- **The affordance is additive + INV-03 byte-stable.** `code===errorCode===error==='RECIPE_LEARN_PENDING'` stays byte-identical (via the unchanged `_err` dual-field helper); `{reason, actionable, message}` are merged additively. The message embeds ONLY the origin host (or a host-free generic fallback) -- no secret.
- **The harvester + seeds carry NO secrets.** A static text scan extracts only op/method/path hints; `discovery-seeds.json` (128 origins / 255 hints, matching the ~128/255 expectation) contains ZERO token-shaped substrings and ZERO secret key:value pairs. It is provenance-stamped + SHA-pinned (`vendorSha:4b17021637...`) and **deterministically reproducible** from the harvester (regen diff identical except the `generatedAt` timestamp).
- **Capture/consent core UNCHANGED.** `discovery-session.js` and `learned-recipe-store.js` show ZERO diff; `network-capture.js` is additive-only (`_runGate`/`startSession`/`_onCdpEvent`/`endSession` untouched; the loader is appended).

**Gate results: 7/7 GREEN.**

| Gate | Result |
|------|--------|
| `network-capture-redaction.test.js` | PASS=130 FAIL=0 |
| `discovery-seeds-load.test.js` | PASS=13 FAIL=0 |
| `seed-resolve-t2.test.js` | PASS=12 FAIL=0 |
| `recipe-learn-pending-affordance.test.js` | PASS=15 FAIL=0 |
| `audit-log-no-secret.test.js` | PASS=18 FAIL=0 |
| `learned-promote-after-replay.test.js` | PASS=15 FAIL=0 |
| `npm run validate:extension` | OK (286 JS parsed clean; all 7 sub-gates PASS) |

The no-leak battery is **genuinely non-vacuous**: it feeds a hostile request with 33 auth carriers in header NAME + distinct sentinel VALUEs + token-shaped values in benign-named headers + 8 token-shaped path segments, and asserts ZERO sentinel substring survives in `headerNames`/`red.path`/the serialized artifact, PLUS the `:tok` placeholder is present (proving the scrub fired, not that URL parsing silently dropped the segment). The benign-slug negatives are present and green.

The single material finding (WR-01) is a **documentation-vs-behavior over-claim about the defense layering**, not a regression of any documented vector. Details below.

## Warnings

### WR-01: Code comment over-claims the synthesizer's prefixless-token coverage; a base64url path token with `-`/`_` (and an AWS key with a same-segment suffix) is masked by NEITHER the path scrub NOR the synthesizer

> **RESOLVED (commit `db991d46`).** Applied a TWO-PART fix without introducing any false-positive:
> 1. **AWS anchor closed:** dropped the trailing `$` from the AWS path-segment pattern (`/^(AKIA|ASIA)[A-Z0-9]{16}$/` -> `/^(AKIA|ASIA)[A-Z0-9]{16}/`) so an AWS key id that PREFIXES a longer segment is now masked (`/k/AKIAIOSFODNN7EXAMPLE.json` -> `/k/:tok`, verified). `AKIA`/`ASIA` + 16 uppercase-alnum is distinctive and does not occur in benign slugs; the other distinctive prefixes stay segment-start-anchored.
> 2. **Comment corrected (NOT widened):** `_LONG_TOKEN_RE` was deliberately NOT broadened and no "high-entropy-with-separator" path rule was added -- that would false-positive on benign hyphenated slugs (`/orgs/my-long-organization-name`) and break legitimate recipe templates. Instead the rationale comment now states the true coverage honestly: the path scrub masks the distinctive token PREFIXES; the synthesizer parameterizes prefixless high-entropy segments over `[0-9A-Za-z]` WITHOUT separators; a prefixless high-entropy token WITH a `-`/`_` separator in a path segment is an accepted, uncommon RESIDUAL (not a documented vendored vector, gated behind the consent-gated capture->replay; the structure-only value-exclusion floor + the named auth-carrier header denylist remain fully intact).
> Benign-slug negatives (`/orgs/my-long-organization-name`, `/v1/charges`, `/pages/my-document-title-2024`) still survive LITERAL; the `u!` share-id still masks. `network-capture-redaction.test.js` PASS=130 FAIL=0.

**File:** `extension/utils/network-capture-redactor.js:120-129` (the `_TOKEN_SHAPES` rationale comment) + `extension/utils/recipe-synthesizer.js:156` (`_LONG_TOKEN_RE`)

**Issue:** The path-scrub comment justifies its INTENTIONALLY-NARROW prefix set by asserting the synthesizer is the safety net for prefixless tokens: *"the synthesizer's EXISTING prefixless-high-entropy parameterization already handles prefixless random path tokens (all-digit / UUID / hex>=16 / **alnum>=20** WITHOUT a separator)."* That claim is **factually wrong for the standard base64url alphabet.** The synthesizer's `_LONG_TOKEN_RE = /^[0-9A-Za-z]{20,}$/` matches `[0-9A-Za-z]` ONLY -- it excludes `-` and `_`, which are exactly the two extra characters of base64url (the alphabet real OAuth/session/share tokens use). So a prefixless base64url token containing a `-` or `_` in a path segment:
- is **not** masked by `_shapePath` (no distinctive prefix), and
- is **not** parameterized by `_toPathTemplate` (`_LONG_TOKEN_RE` rejects the `-`/`_`),

and therefore survives LITERAL into `recipe.endpoint` + `descriptor.description` -- the learned-recipe envelope, a persisted sink.

Verified empirically (redactor output):
```
/reset/dGhpc2lz_YXNl-Y3JldFRva2VuMTIzNA   -> path unchanged, token LEAKS (no prefix; has _ and -)
```
A second, related instance: the AWS rule `/^(AKIA|ASIA)[A-Z0-9]{16}$/` is `$`-anchored to the **whole segment**, so a real access key with any same-segment suffix slips both layers (`AKIAIOSFODNN7EXAMPLE.json` -> the `.` defeats both the `$`-anchor and `_LONG_TOKEN_RE`):
```
/k/AKIAIOSFODNN7EXAMPLE.json   -> path unchanged, AKIA key LEAKS
```

This is classified WARNING (not BLOCKER/HIGH) because: (a) it is NOT one of the documented Phase-42 vectors -- the explicitly-called-out `u!` share-id and all 7 enumerated prefixes ARE masked; (b) reaching the persisted sink additionally requires the consent-gated capture->replay->promote to fire on a path that embeds a raw credential in a URL SEGMENT (uncommon -- credentials normally ride headers/cookies, which the structure-only floor already strips by VALUE); and (c) the structure-only PRIMARY control (never reading a header value/body/query) is fully intact -- this gap is confined to the path-SEGMENT defense-in-depth layer. It is nonetheless a genuine, fixable seam and the comment actively misrepresents the coverage.

**Fix:** Either (a) correct the comment to state the true synthesizer coverage and acknowledge base64url-with-separator + suffixed-AWS as a known residual, OR (b) close the seam by widening the nets:
```js
// recipe-synthesizer.js: include base64url separators so a real session/OAuth token
// in a path SEGMENT is parameterized (not just [0-9A-Za-z]).
var _LONG_TOKEN_RE = /^[0-9A-Za-z][0-9A-Za-z_-]{19,}$/;   // >=20, base64url alphabet

// network-capture-redactor.js: drop the whole-segment $-anchor on AWS so a suffixed
// key id is still masked (prefix-anchored is the distinctive part):
/^(AKIA|ASIA)[A-Z0-9]{16}\b/,   // was: ...[A-Z0-9]{16}$
```
Prefer (b); a token-shaped path segment should not depend on which of two partial nets happens to catch it. If (b) is deferred, (a) is mandatory so the rationale comment stops asserting coverage the code does not provide.

### WR-02: The header-name JWT token-shape regex relies on an undocumented lowercasing side effect; a future caller of `_nameLooksTokenShaped` would silently mis-match

> **RESOLVED (commit `997611b6`).** Made `_nameLooksTokenShaped` self-contained so its correctness no longer depends on caller pre-lowercasing: (a) the JWT literal is now written with real `eyJ` casing under `/i` (`/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i`), and (b) the helper lowercases its own input (`var s = String(name).toLowerCase();`) before testing. A future caller passing a raw mixed-case name now matches every row including the JWT shape -- no silent false-negative. The sole existing caller still passes an already-lowercased name (`toLowerCase()` is idempotent), so the call-site behavior is unchanged. Verified: a raw `eyJhbGci....eyJzdWIi...` header name is dropped; benign names (`x-request-trace`) survive.

**File:** `extension/utils/network-capture-redactor.js:102` and `:105-110`, `:214`

**Issue:** `HEADER_NAME_TOKEN_SHAPES[3] = /^eyj[a-z0-9_-]+\.[a-z0-9_-]+/i` anchors the JWT shape on lowercase `eyj`. A real JWT always begins `eyJ` (capital J -- it is the base64 of `{"`). This only matches because `redactRequest` lowercases the name (`var lower = String(name).toLowerCase();`) BEFORE calling `_nameLooksTokenShaped(lower)`. The `/i` flag is present but the literal is written lowercase, so the helper's correctness is coupled to an external pre-lowercasing convention that is not enforced or documented at the helper boundary. `_nameLooksTokenShaped` is a named function; a future caller that passes a raw (non-lowercased) name would get a silent false-negative on the JWT row (the other 3 rows are case-insensitive via `/i` on a mixed-case literal, so they would still fire -- the inconsistency is the trap). This is hygiene, not a current leak (the sole caller does lowercase; and the path-segment JWT scrub `_TOKEN_SHAPES[0]` correctly uses `^eyJ` for the value-in-path vector).

**Fix:** Make the helper self-contained -- either lowercase inside it, or write the literal to match the real token casing so the `/i` does the work regardless of caller convention:
```js
/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/   // match real JWT casing; no reliance on caller lowercasing
```
and/or `function _nameLooksTokenShaped(name){ var s = String(name).toLowerCase(); ... }` so the contract is local.

## Info

### IN-01: `generatedAt: new Date().toISOString()` makes `discovery-seeds.json` non-byte-reproducible, weakening the SHA-pin provenance story

> **RESOLVED (commit `022cc476`).** Dropped the wall-clock `generatedAt` field from `_meta` (the `vendorSha` is the provenance anchor that pins the INPUT snapshot) and regenerated `extension/config/discovery-seeds.json`. The committed file now matches a fresh `node scripts/harvest-discovery-seeds.mjs` run, and TWO consecutive regens produce **byte-identical** output (sha256 `d392382fda8315a14eac9b48cb648816d7c4d8a4be2d7f865cb1bf3bb4c19952` both runs) -- so `harvest -> git diff` is empty on a no-op rerun and a CI "seeds are fresh" check can now be a byte-equality assertion. Origin/hint counts preserved (128 / 255); SHA pin preserved (`4b17021637...`). The regen git diff was exactly one line (the `generatedAt` removal) -- no churn to any origin or hint.

**File:** `scripts/harvest-discovery-seeds.mjs:268`

**Issue:** Every harvest stamps a wall-clock `generatedAt`, so the committed artifact cannot be verified by exact-hash against a fresh regeneration -- a verifier must diff-excluding-`generatedAt` (as this review did) to confirm the seeds match the pinned `vendorSha`. The provenance intent ("pinned to the SHA") is slightly undercut: the SHA pins the INPUT, but the OUTPUT is not reproducible byte-for-byte. The harvest IS otherwise fully deterministic (verified: regen diff identical except this line).

**Fix:** Drop `generatedAt` (the `vendorSha` already pins provenance to the input snapshot), or derive it from the vendor snapshot's commit time rather than wall-clock, so `harvest -> git diff` is empty on a no-op rerun and a CI "seeds are fresh" check can be a byte-equality assertion.

### IN-02: `_seedMatches` static-prefix branch is duplicated/dead on the `observedPath === hp` arm

> **RESOLVED (commit `65ee982b`).** Dropped the dead `=== hp` disjuncts from the two prefix-check lines, leaving only the trailing-slash prefix match (`observedPath.indexOf(hp + '/') === 0` / `template.indexOf(hp + '/') === 0`). The exact-equal case is already handled by the `observedPath === hp || template === hp` early-return above, so this is behavior-preserving. The prefix check still requires the trailing slash, so `/v1` matches `/v1/charges` but NOT `/v1abc`. `seed-resolve-t2.test.js` PASS=12 FAIL=0.

**File:** `extension/utils/recipe-synthesizer.js:106-110`

**Issue:** Line 106 already returns true when `observedPath === hp || template === hp`. Lines 109-110 then re-test `observedPath === hp` / `template === hp` (the first disjunct of each) before the genuinely-new `indexOf(hp + '/') === 0` prefix check. The `=== hp` re-tests are dead (already returned on line 106). Harmless (metadata-only path, fail-closed `try/catch`), but the redundancy reads as a copy-paste smudge and obscures that line 109/110's real purpose is the prefix match. No false-positive risk: the prefix check correctly requires a trailing slash (`/v1` matches `/v1/charges` but NOT `/v1abc`, verified).

**Fix:** Drop the redundant equality disjuncts on 109-110, leaving only the prefix check:
```js
if (typeof observedPath === 'string' && observedPath.indexOf(hp + '/') === 0) { return true; }
if (typeof template === 'string' && template.indexOf(hp + '/') === 0) { return true; }
```

### IN-03: Harvester `fetch|doFetch|api|request|call` first-arg regex is broad enough to capture unrelated `.api(`/`request(`/`call(` invocations as endpoint hints

> **RESOLVED (commit `1481d316`) -- documented as an accepted residual (regex left unchanged).** Per the finding's own guidance ("Optional -- acceptable as-is given the metadata-only contract"), tightening was assessed as NOT a clean low-risk change: it would perturb the now byte-reproducible seed corpus and risk dropping legitimate `api()`/`request()` transport hints the vendored `*-api.ts` files actually use, for zero security benefit (a spurious hint only over-biases recognition and never executes; the `normalizePath` '/'-prefix guard already drops non-paths; hint count is sane at 255). Added a one-line note at the regex documenting it as an accepted metadata-only residual. Confirmed output-neutral: regenerating after the comment change leaves `discovery-seeds.json` byte-identical (empty git diff).

**File:** `scripts/harvest-discovery-seeds.mjs:131, 138`

**Issue:** `\b(?:fetch|doFetch|api|request|call)\s*\(\s*(['"\`])...` matches ANY identifier ending in those words followed by a string-literal first arg -- e.g. `someThing.call('/not-an-endpoint')`, a test helper `request('/x')`, or a method literally named `api(`. The `normalizePath` guard (must start with `/`, drops non-paths) limits the blast radius to path-shaped first args, and a spurious hint only over-biases recognition (metadata-only, never executes), so this is cosmetic noise in the seed corpus, not a correctness or security issue. Worth noting only because it can inflate `hintCount` with non-endpoint paths and make the seed file noisier than the "endpoint hints" label implies.

**Fix:** Tighten to the transport idioms actually used by the vendored `*-api.ts` (e.g. require a preceding `await`/`return`/`=` or anchor `fetch`/`doFetch` only), or post-filter hints to paths matching the `(2)/(4)` REST/version-prefix shapes. Optional -- acceptable as-is given the metadata-only contract.

---

_Reviewed: 2026-06-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

---

## Resolution (2026-06-26)

All 5 findings resolved (0 CRITICAL / 0 HIGH; quality + honesty fixes). Each fix committed atomically; the Phase-42 invariants held throughout (redactor STRUCTURE-ONLY, `{method,path,origin,headerNames}` shape unchanged, path scrub dynamic-code-free, no manifest/permissions/capture-core change, no path-scrub false-positive introduced).

| Finding | Severity | Resolution | Commit |
|---------|----------|------------|--------|
| WR-01 | MEDIUM | AWS `$`-anchor dropped (suffixed key now masks) + over-claiming path-scrub comment corrected (NOT widened; honesty over false-positive risk) | `db991d46` |
| WR-02 | MEDIUM | `_nameLooksTokenShaped` made case-robust (helper-local lowercasing + real `eyJ` literal) | `997611b6` |
| IN-01 | LOW | `generatedAt` dropped -> `discovery-seeds.json` byte-reproducible (twice-regen identical: sha256 `d392382f...`); 128/255 + SHA pin preserved | `022cc476` |
| IN-02 | LOW | dead `=== hp` re-tests removed from `_seedMatches` prefix arm (behavior-preserving) | `65ee982b` |
| IN-03 | LOW | broad hint regex left UNCHANGED, documented as accepted metadata-only residual (tightening not low-risk; output-neutral) | `1481d316` |

**Gates after fixes (all GREEN):** `network-capture-redaction.test.js` PASS=130/0 (incl path-token + benign-slug cases), `discovery-seeds-load.test.js` PASS=13/0, `seed-resolve-t2.test.js` PASS=12/0, `recipe-learn-pending-affordance.test.js` PASS=15/0, `audit-log-no-secret.test.js` PASS=18/0, `npm run validate:extension` exit 0, full **`npm test` exit 0**. Seeds regenerated + extension repackaged. Out-of-scope `showcase/` churn left unstaged.

_Fixed: 2026-06-26 -- Claude (gsd-code-fixer)_
